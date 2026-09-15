"use strict";

/** Audit the official-primary weapon pilot without promoting canonical data. */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
    buildPilot,
    stableJson
} = require("./genshinOfficialWeaponPilotGenerate.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultPilotPath = path.join(dataRoot, "v2", "weapons", "official-pilot.json");
const defaultSourceCatalogPath = path.join(dataRoot, "v2", "source-catalog.json");
const defaultExternalEvidencePath = path.join(dataRoot, "v2", "weapons", "external-evidence.json");
const defaultReportJsonPath = path.join(repositoryRoot, "reports", "genshin-official-weapon-pilot.json");
const defaultReportMarkdownPath = path.join(repositoryRoot, "reports", "genshin-official-weapon-pilot.md");

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function stableClone(value) {
    if (Array.isArray(value)) return value.map(stableClone);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableClone(value[key])]));
}

function countBy(values) {
    const counts = {};
    for (const value of values) {
        const key = String(value);
        counts[key] = (counts[key] || 0) + 1;
    }
    return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function loadPilot({ pilotPath = defaultPilotPath } = {}) {
    return readJson(pilotPath);
}

function auditPilot({
    pilot,
    sourceCatalog = readJson(defaultSourceCatalogPath),
    externalEvidence = readJson(defaultExternalEvidencePath),
    generatedFromDisk = false
} = {}) {
    const errors = [];
    const warnings = [];
    const records = pilot?.records || {};
    const sources = pilot?.sources || {};
    const expectedIds = ["11503", "15502"];
    if (pilot?.schemaVersion !== 1) errors.push("schemaVersion must be 1");
    if (pilot?.evidence !== "genshin-official-weapon-pilot") errors.push("unexpected pilot evidence kind");
    if (pilot?.policy?.primarySourcesOnly !== true) errors.push("primarySourcesOnly policy must be true");
    if (pilot?.policy?.networkAccess !== "none") errors.push("networkAccess policy must be none");
    if (pilot?.policy?.canonicalPromotion !== "forbidden") errors.push("canonicalPromotion policy must be forbidden");
    if (pilot?.policy?.noInferenceFromMissingFields !== true) errors.push("missing-field inference must be disabled");
    if (pilot?.policy?.noLegacySupersessionUntilComplete !== true) errors.push("legacy supersession policy must be fail-closed");
    if (Object.keys(records).sort().join(",") !== expectedIds.join(",")) errors.push("pilot must contain exactly weapon IDs 11503 and 15502");
    const officialDomainAllowlist = new Set(pilot?.policy?.officialDomainAllowlist || []);
    const sourceErrors = [];
    for (const [sourceId, source] of Object.entries(sources)) {
        if (source.role !== "officialPrimary") sourceErrors.push(`${sourceId}:role`);
        if (!officialDomainAllowlist.has(source.domain)) sourceErrors.push(`${sourceId}:domain`);
        if (!/^https:\/\/(www\.)?(hoyolab\.com|genshin\.hoyoverse\.com)\//.test(source.url)) sourceErrors.push(`${sourceId}:url`);
        if (!source.articleId || !source.revision) sourceErrors.push(`${sourceId}:identity`);
        if (source.revision !== `hoyolab-article-${source.articleId}`) sourceErrors.push(`${sourceId}:revision`);
        if (source.revisionPinned !== false || source.identityPinned !== true || source.contentRevisionPinned !== false || source.immutable !== false) {
            sourceErrors.push(`${sourceId}:sourceIdentityOrRevisionSemantics`);
        }
        if (typeof source.gameVersion !== "string" || !source.gameVersion) sourceErrors.push(`${sourceId}:gameVersion`);
        const excerpt = source.snapshot?.text;
        const digest = excerpt === undefined ? null : sha256(Buffer.from(excerpt, "utf8"));
        if (!excerpt || source.snapshot.sha256 !== digest || source.snapshot.contentAddressed !== true) sourceErrors.push(`${sourceId}:snapshotDigest`);
        if (source.sourceReviewStatus !== "needsReview" || source.snapshot.captureVerification !== "manuallyMaterializedNeedsIndependentReview") {
            sourceErrors.push(`${sourceId}:sourceReviewBoundary`);
        }
        if (source.gameVersionEvidence?.status !== "explicit") sourceErrors.push(`${sourceId}:gameVersionEvidence`);
        if (source.gameVersionEvidence?.binding?.revision !== source.revision) sourceErrors.push(`${sourceId}:versionBinding`);
        if (source.gameVersionEvidence?.binding?.metadataDigest !== digest) sourceErrors.push(`${sourceId}:metadataBinding`);
        if (source.gameVersionEvidence?.integrity?.digest !== digest) sourceErrors.push(`${sourceId}:integrityDigest`);
        if (source.gameVersionVerified !== true) sourceErrors.push(`${sourceId}:gameVersionVerified`);
    }
    if (sourceErrors.length) errors.push(...sourceErrors.map((item) => `officialSource:${item}`));

    const expectedFieldByWeapon = {
        "15502": {
            "w_15502_damage_1:value": { value: { "1": 12 }, sourceId: "hoyolab:article:111067" },
            "w_15502_damageBonus_fc388315:value": { value: { "1": 8 }, sourceId: "hoyolab:article:111067" },
            "w_15502_damageBonus_fc388315:stack": { value: { min: 0, max: 5, intervalSeconds: 0.1 }, sourceId: "hoyolab:article:111067" }
        },
        "11503": {}
    };
    const recordErrors = [];
    const allBlockedReasons = [];
    for (const weaponId of expectedIds) {
        const record = records[weaponId];
        if (!record) continue;
        if (record.status !== "blocked") recordErrors.push(`${weaponId}:status`);
        if (record.canonicalEligibility !== false) recordErrors.push(`${weaponId}:canonicalEligibility`);
        if (!Array.isArray(record.officialSourceIds) || record.officialSourceIds.length === 0) recordErrors.push(`${weaponId}:officialSourceIds`);
        for (const sourceId of record.officialSourceIds || []) {
            if (!sources[sourceId]) recordErrors.push(`${weaponId}:unknown official source ${sourceId}`);
        }
        const independentId = record.independentSource?.id;
        const catalogRecord = sourceCatalog.records?.[independentId];
        const externalRecord = externalEvidence.records?.[independentId];
        if (!catalogRecord || !externalRecord) {
            recordErrors.push(`${weaponId}:independent evidence missing`);
        } else {
            if (record.independentSource.provider !== sourceCatalog.sources?.[catalogRecord.source]?.provider) recordErrors.push(`${weaponId}:provider mismatch`);
            if (record.independentSource.revision !== sourceCatalog.sources?.[catalogRecord.source]?.revision) recordErrors.push(`${weaponId}:revision mismatch`);
            if (record.independentSource.sha256 !== catalogRecord.sha256) recordErrors.push(`${weaponId}:SHA mismatch`);
            if (record.independentSource.gameVersion !== null || record.independentSource.gameVersionVerified !== false) recordErrors.push(`${weaponId}:independent gameVersion must remain unverified`);
            if (record.independentSource.independenceGroup === record.officialSourceIds.map((id) => sources[id]?.independenceGroup).find(Boolean)) recordErrors.push(`${weaponId}:independence group collision`);
        }
        const claimKeys = new Set();
        for (const claim of record.officialClaims || []) {
            const key = `${claim.candidateId}:${claim.field}`;
            if (claimKeys.has(key)) recordErrors.push(`${weaponId}:duplicate claim ${key}`);
            claimKeys.add(key);
            if (!expectedFieldByWeapon[weaponId]?.[key]) recordErrors.push(`${weaponId}:unexpected claim ${key}`);
            if (claim.scope?.completeRefinementTable === true) recordErrors.push(`${weaponId}:pilot unexpectedly complete`);
            if (!Array.isArray(claim.scope?.refinementRanks) || claim.scope.refinementRanks.length === 0) recordErrors.push(`${weaponId}:${key}:scope`);
            const expected = expectedFieldByWeapon[weaponId]?.[key];
            if (expected && stableClone(claim.structuredValue) && stableClone(claim.structuredValue) instanceof Object) {
                if (stableJson(claim.structuredValue) !== stableJson(expected.value)) recordErrors.push(`${weaponId}:${key}:value mismatch`);
                if (claim.sourceId !== expected.sourceId) recordErrors.push(`${weaponId}:${key}:source mismatch`);
            }
        }
        const expectedKeys = Object.keys(expectedFieldByWeapon[weaponId] || {}).sort();
        const actualKeys = (record.officialClaims || []).map((claim) => `${claim.candidateId}:${claim.field}`).sort();
        if (expectedKeys.join(",") !== actualKeys.join(",")) recordErrors.push(`${weaponId}:official claim set mismatch`);
        for (const reason of record.blockedReasons || []) allBlockedReasons.push(`${weaponId}:${reason}`);
        if (record.supersession?.action !== "none") recordErrors.push(`${weaponId}:supersession must remain none`);
        if (!(record.supersession?.existingModifierIds || []).length) recordErrors.push(`${weaponId}:supersession target list missing`);
        for (const comparison of record.comparisons || []) {
            if (!comparison.independentProvider || !comparison.independentRevision || !comparison.independentSha256) recordErrors.push(`${weaponId}:comparison missing independent identity`);
            if (comparison.rankOneValueMatch !== true) warnings.push(`${weaponId}:${comparison.candidateId}:${comparison.field}:R1 mismatch or unavailable`);
        }
    }
    if (recordErrors.length) errors.push(...recordErrors.map((item) => `record:${item}`));

    const claims = Object.values(records).flatMap((record) => record.officialClaims || []);
    const comparisons = Object.values(records).flatMap((record) => record.comparisons || []);
    const summary = {
        schemaVersion: 1,
        status: errors.length ? "failed" : "passed",
        promotionGate: pilot?.summary?.promotionGate || "blocked",
        canonicalEligibility: pilot?.summary?.canonicalEligibility ?? null,
        weapons: Object.keys(records).length,
        expectedWeapons: expectedIds.length,
        officialSources: Object.keys(sources).length,
        explicitGameVersionSources: Object.values(sources).filter((source) => typeof source.gameVersion === "string" && source.gameVersion.length > 0).length,
        sourceReviewNeedsReview: Object.values(sources).filter((source) => source.sourceReviewStatus === "needsReview").length,
        officialClaimFields: claims.length,
        completeOfficialRefinementClaims: claims.filter((claim) => claim.scope?.completeRefinementTable === true).length,
        rankOneOfficialClaims: claims.filter((claim) => claim.scope?.refinementRanks?.length === 1).length,
        independentComparisonFields: comparisons.length,
        rankOneMatches: comparisons.filter((comparison) => comparison.rankOneValueMatch === true).length,
        blockedReasons: allBlockedReasons.length,
        blockedReasonCounts: countBy(allBlockedReasons),
        sourceErrors: sourceErrors.length,
        recordErrors: recordErrors.length,
        warnings: warnings.length,
        errors: errors.length,
        generatedFromDisk,
        deterministic: true
    };
    if (summary.promotionGate !== "blocked") errors.push("summary:promotionGate must remain blocked");
    if (summary.canonicalEligibility !== 0) errors.push("summary:canonicalEligibility must remain zero");
    if (summary.completeOfficialRefinementClaims !== 0) errors.push("summary:completeOfficialRefinementClaims must remain zero for pilot");
    summary.errors = errors.length;
    return {
        schemaVersion: 1,
        audit: "genshin-official-weapon-pilot-audit",
        status: errors.length ? "failed" : "passed",
        promotionGate: "blocked",
        canonicalEligibility: 0,
        summary,
        methodology: {
            primarySourcesOnly: true,
            officialVersion: "Only explicit Version text from official HoYoLAB update articles is accepted for this pilot; article IDs and short-excerpt SHA-256 bind the captured evidence.",
            fieldScope: "An official R1 claim does not imply R2-R5. Missing fields/refinement ranks remain blocked.",
            independentComparison: "gcsim is retained as a distinct implementation comparison and never supplies gameVersion.",
            supersession: "Existing review-gated modifiers remain untouched; no pilot record can supersede them until complete claims pass the canonical gate."
        },
        officialSources: sources,
        records,
        blockedReasons: allBlockedReasons,
        sourceErrors,
        recordErrors,
        errors,
        warnings
    };
}

function renderMarkdown(report) {
    const s = report.summary;
    const rows = Object.values(report.records || {}).sort((a, b) => String(a.weaponId).localeCompare(String(b.weaponId), "en", { numeric: true })).map((record) => `| ${record.weaponId} | ${record.name} | ${record.officialGameVersions.join(", ") || "-"} | ${record.officialClaims.length} | ${record.comparisons.filter((comparison) => comparison.rankOneValueMatch).length}/${record.comparisons.length} | blocked |`);
    return [
        "# Genshin official weapon pilot audit",
        "",
        `Status: **${report.status}**; promotion gate: **${report.promotionGate}**; canonical eligibility: **${report.canonicalEligibility}**`,
        "",
        "This is an evidence-only pilot. It records official HoYoLAB update-note claims and compares them with pinned gcsim implementation evidence. It does not alter existing candidates, modifiers, packages, or canonical runtime data.",
        "",
        "| weapon ID | weapon | official gameVersion | official claim fields | R1 matches | status |",
        "| --- | --- | --- | ---: | ---: | --- |",
        ...rows,
        "",
        `- Official sources: **${s.officialSources}**; explicit gameVersion: **${s.explicitGameVersionSources}**.`,
        `- Official claim fields: **${s.officialClaimFields}**; complete refinement tables: **${s.completeOfficialRefinementClaims}**; R1-only claims: **${s.rankOneOfficialClaims}**.`,
        `- Independent comparison fields: **${s.independentComparisonFields}**; R1 matches: **${s.rankOneMatches}**.`,
        `- Canonical eligibility: **${s.canonicalEligibility}**; promotion gate: **${s.promotionGate}**.`,
        "",
        "## Findings",
        "",
        "- Amos' Bow: the official Version 1.2 patch note states the R1 12% base Normal/Charged Attack bonus, the R1 8% per-0.1-second flight-time bonus, and a maximum of five occurrences. It does not state the complete R2-R5 table, so the claim remains partial and blocked.",
        "- Freedom-Sworn: official Version 1.6 pages identify the weapon and version but do not state passive numeric fields in the retained article text. No field value is inferred from gcsim or legacy data.",
        "- Existing modifiers are not superseded. A future promotion must add complete official field/refinement claims, an independent review, and a canonical-runtime regeneration audit.",
        "",
        "## Blocked reasons",
        "",
        ...(report.blockedReasons.length ? report.blockedReasons.map((reason) => `- \`${reason}\``) : ["- none"]),
        "",
        `Audit errors: **${report.errors.length}**; warnings: **${report.warnings.length}**.`,
        ""
    ].join("\n");
}

function writeReport(report, { reportJsonPath = defaultReportJsonPath, reportMarkdownPath = defaultReportMarkdownPath } = {}) {
    fs.mkdirSync(path.dirname(reportJsonPath), { recursive: true });
    fs.writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(reportMarkdownPath, renderMarkdown(report));
}

function parseArgs(argv) {
    const args = {
        pilotPath: defaultPilotPath,
        sourceCatalogPath: defaultSourceCatalogPath,
        externalEvidencePath: defaultExternalEvidencePath,
        reportJsonPath: defaultReportJsonPath,
        reportMarkdownPath: defaultReportMarkdownPath
    };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--pilot") args.pilotPath = path.resolve(argv[++index]);
        else if (arg === "--source-catalog") args.sourceCatalogPath = path.resolve(argv[++index]);
        else if (arg === "--external-evidence") args.externalEvidencePath = path.resolve(argv[++index]);
        else if (arg === "--report-json") args.reportJsonPath = path.resolve(argv[++index]);
        else if (arg === "--report-md") args.reportMarkdownPath = path.resolve(argv[++index]);
        else if (arg === "--help") args.help = true;
        else throw new Error(`unknown argument: ${arg}`);
    }
    return args;
}

if (require.main === module) {
    try {
        const args = parseArgs(process.argv.slice(2));
        if (args.help) {
            console.log("Usage: node scripts/genshinOfficialWeaponPilotAudit.cjs [--pilot <path>] [--source-catalog <path>] [--external-evidence <path>] [--report-json <path>] [--report-md <path>]");
            process.exit(0);
        }
        const pilot = loadPilot({ pilotPath: args.pilotPath });
        const expected = buildPilot({ sourceCatalog: readJson(args.sourceCatalogPath), externalEvidence: readJson(args.externalEvidencePath) });
        const report = auditPilot({
            pilot,
            sourceCatalog: readJson(args.sourceCatalogPath),
            externalEvidence: readJson(args.externalEvidencePath),
            generatedFromDisk: true
        });
        if (stableJson(pilot) !== stableJson(expected)) report.errors.push("pilot artifact is not deterministic for current source files");
        report.status = report.errors.length ? "failed" : "passed";
        report.summary.status = report.status;
        report.summary.errors = report.errors.length;
        writeReport(report, { reportJsonPath: args.reportJsonPath, reportMarkdownPath: args.reportMarkdownPath });
        console.log(JSON.stringify(report.summary, null, 2));
        if (report.status !== "passed") process.exitCode = 1;
    } catch (error) {
        console.error(error.stack || error.message);
        process.exitCode = 1;
    }
}

module.exports = {
    auditPilot,
    loadPilot,
    renderMarkdown,
    writeReport
};
