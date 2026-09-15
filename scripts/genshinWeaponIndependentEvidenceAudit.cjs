"use strict";

/** Audit the independent weapon evidence bridge without promoting data. */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const repositoryRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultEvidencePath = path.join(dataRoot, "v2", "weapons", "independent-field-evidence.json");
const defaultExternalPath = path.join(dataRoot, "v2", "weapons", "external-evidence.json");
const defaultReportJsonPath = path.join(repositoryRoot, "reports", "genshin-weapon-independent-evidence.json");
const defaultReportMarkdownPath = path.join(repositoryRoot, "reports", "genshin-weapon-independent-evidence.md");
const EXPECTED_IDS = ["11503", "11509", "11518", "12402", "12430", "14402", "15402", "15502", "15516"];

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function stableClone(value) {
    if (Array.isArray(value)) return value.map(stableClone);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableClone(value[key])]));
}
function stableJson(value) { return JSON.stringify(stableClone(value)); }
function unique(values) { return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))]; }
function portable(value) { return typeof value === "string" && value.length > 0 && !path.isAbsolute(value) && !/^[A-Za-z]:[\\/]/.test(value) && !value.startsWith("\\\\") && !value.split(/[\\/]/).includes(".."); }
function has(value, key) { return Object.prototype.hasOwnProperty.call(value || {}, key); }

function auditEvidence({ evidence, externalEvidence = null } = {}) {
    const errors = [];
    const warnings = [];
    if (!evidence || evidence.schemaVersion !== 1 || evidence.evidence !== "genshin-weapon-independent-field-evidence") errors.push("invalid independent evidence schema");
    if (evidence?.policy?.canonicalPromotion !== "forbidden") errors.push("canonical promotion must be forbidden");
    if (evidence?.policy?.selfApprovalForbidden !== true) errors.push("self-approval policy must remain enabled");
    const records = evidence?.records || {};
    const ids = Object.keys(records).sort((a, b) => String(a).localeCompare(String(b), "en", { numeric: true }));
    if (ids.length !== EXPECTED_IDS.length) errors.push(`record count ${ids.length} != ${EXPECTED_IDS.length}`);
    if (stableJson(ids) !== stableJson([...EXPECTED_IDS].sort((a, b) => String(a).localeCompare(String(b), "en", { numeric: true })))) errors.push("pilot weapon ID set mismatch");
    if (externalEvidence && Object.keys(externalEvidence.records || {}).length !== ids.length) errors.push("external evidence and independent evidence record counts differ");

    const comparisons = [];
    for (const id of ids) {
        const record = records[id];
        if (!record || record.weaponId !== id) { errors.push(`${id}: weapon target mismatch`); continue; }
        if (!record.target || record.target.kind !== "weapon" || record.target.id !== id) errors.push(`${id}: target packet missing`);
        if (!record.sourceA || !Array.isArray(record.sourceA.sources) || !record.sourceA.sources.length) errors.push(`${id}: official source A missing`);
        if (!record.sourceB || record.sourceB.role !== "independentImplementation") errors.push(`${id}: independent source B missing`);
        if (!record.sourceCorrelation?.independent) errors.push(`${id}: source pair is not independently classified`);
        if (record.sourceCorrelation?.derivedFromSameDatamine !== false) errors.push(`${id}: derived datamine pair must be false`);
        if (!record.gameVersion?.official || record.gameVersion.exactBinding !== false) errors.push(`${id}: official gameVersion binding is malformed`);
        if (record.sourceB?.gameVersion !== null) errors.push(`${id}: gcsim gameVersion must remain null until explicit evidence exists`);
        if (!record.gameVersion?.blockedReasons?.includes("independentImplementationGameVersionMissing")) errors.push(`${id}: missing independent gameVersion blocker absent`);
        for (const source of record.sourceA?.sources || []) {
            if (source.role !== "officialPrimary") errors.push(`${id}/${source.sourceId}: source A is not officialPrimary`);
            if (!source.gameVersion || source.gameVersionEvidence?.status !== "explicit") errors.push(`${id}/${source.sourceId}: explicit official gameVersion missing`);
            if (!source.excerpt || !source.excerptIntegrity?.digest) errors.push(`${id}/${source.sourceId}: original excerpt integrity missing`);
            else if (sha256(Buffer.from(source.excerpt, "utf8")) !== source.excerptIntegrity.digest) errors.push(`${id}/${source.sourceId}: original excerpt digest mismatch`);
        }
        if (!portable(record.sourceB?.path)) errors.push(`${id}: source B path is not provider-relative`);
        if (!record.originalText?.sourceA?.length || !Array.isArray(record.originalText.sourceB)) errors.push(`${id}: original text packet missing`);
        for (const comparison of record.fieldComparisons || []) {
            comparisons.push(comparison);
            const label = `${id}/${comparison.candidateId || "unmapped"}/${comparison.field}`;
            const required = ["candidateId", "field", "originalText", "gameVersion", "extractedValueA", "extractedValueB", "specValue", "match", "correlation", "runtime", "review", "blockedReasons", "recommendedDecision"];
            for (const key of required) if (!has(comparison, key)) errors.push(`${label}: missing ${key}`);
            if (comparison.status !== "needsReview" || comparison.verificationStatus !== "needsReview") errors.push(`${label}: verification status must remain needsReview`);
            if (comparison.canonicalEligibility !== false) errors.push(`${label}: canonicalEligibility must be false`);
            if (comparison.gameVersion?.exactMatch !== false || comparison.gameVersion?.status !== "blocked") errors.push(`${label}: gameVersion gate must remain blocked`);
            if (comparison.correlation?.sameProvider !== false || comparison.correlation?.sameIndependenceGroup !== false || comparison.correlation?.derivedFromSameDatamine !== false) errors.push(`${label}: correlation independence fields invalid`);
            if (!comparison.correlation?.excludedLineages?.includes("GenshinData-derived")) errors.push(`${label}: derived-lineage exclusion missing`);
            if (!comparison.review || comparison.review.humanJudgmentRequiredNow === undefined || comparison.review.machineFollowUpRequired === undefined) errors.push(`${label}: review disposition missing`);
            if (comparison.review?.humanJudgmentRequiredNow !== false) errors.push(`${label}: human judgment must be deferred until independent gameVersion binding`);
            if (comparison.review?.machineFollowUpRequired !== true) errors.push(`${label}: machine follow-up blocker must remain active`);
            if (comparison.review?.humanReviewDeferredByVersionGate !== true) errors.push(`${label}: version-gated human review marker missing`);
            if (!comparison.runtime?.destination || !Array.isArray(comparison.runtime?.modifierIds)) errors.push(`${label}: runtime destination packet missing`);
            if (!Array.isArray(comparison.originalText?.sourceA) || !Array.isArray(comparison.originalText?.sourceB)) errors.push(`${label}: field original text packet malformed`);
            if (comparison.recommendedDecision === "promote" || comparison.recommendedDecision === "verified") errors.push(`${label}: promotion recommendation is forbidden`);
        }
        if (record.canonicalEligibility !== false || record.status !== "blocked") errors.push(`${id}: record must remain blocked/non-canonical`);
    }
    const summary = {
        records: ids.length,
        expectedRecords: EXPECTED_IDS.length,
        fieldComparisons: comparisons.length,
        officialGameVersionLinkedRecords: ids.filter((id) => Boolean(records[id]?.gameVersion?.official)).length,
        independentGameVersionMissingRecords: ids.filter((id) => records[id]?.sourceB?.gameVersion === null).length,
        independentProviderPairs: ids.filter((id) => records[id]?.sourceCorrelation?.independent === true).length,
        sameDataminePairs: ids.filter((id) => records[id]?.sourceCorrelation?.derivedFromSameDatamine === true).length,
        sourceAgreementFullMatches: comparisons.filter((item) => item.match?.sourceAgreement === "fullMatch").length,
        sourceAgreementPartialMatches: comparisons.filter((item) => item.match?.sourceAgreement === "partialMatch").length,
        sourceAgreementMismatches: comparisons.filter((item) => item.match?.sourceAgreement === "mismatch").length,
        sourceAgreementNotComparable: comparisons.filter((item) => item.match?.sourceAgreement === "notComparable").length,
        specAgreementMatches: comparisons.filter((item) => ["fullMatch", "partialMatch"].includes(item.match?.specAgreement)).length,
        specAgreementMismatches: comparisons.filter((item) => item.match?.specAgreement === "mismatch").length,
        humanJudgmentRequiredNow: comparisons.filter((item) => item.review?.humanJudgmentRequiredNow).length,
        machineFollowUpOnly: comparisons.filter((item) => item.review?.machineFollowUpRequired && !item.review?.humanJudgmentRequiredNow).length,
        canonicalEligible: comparisons.filter((item) => item.canonicalEligibility === true).length,
        verificationStatuses: { needsReview: comparisons.filter((item) => item.verificationStatus === "needsReview").length },
        blocked: true,
        errors: errors.length,
        warnings: warnings.length
    };
    if (summary.canonicalEligible !== 0) errors.push("canonical eligible comparison count must remain zero");
    if (summary.sameDataminePairs !== 0) errors.push("same-datamine pair count must remain zero");
    if (summary.independentGameVersionMissingRecords !== EXPECTED_IDS.length) errors.push("all gcsim records must retain missing gameVersion blocker");
    if (summary.humanJudgmentRequiredNow !== 0) errors.push("human judgment must remain deferred until all gcsim gameVersion bindings are explicit");
    if (summary.machineFollowUpOnly !== summary.fieldComparisons) errors.push("every field must remain machine-follow-up blocked while gcsim gameVersion is missing");
    if (evidence?.summary) {
        for (const key of ["records", "fieldComparisons", "officialGameVersionLinkedRecords", "independentGameVersionMissingRecords", "independentProviderPairs", "sameDataminePairs", "sourceAgreementFullMatches", "sourceAgreementPartialMatches", "sourceAgreementMismatches", "sourceAgreementNotComparable", "specAgreementMatches", "specAgreementMismatches", "humanJudgmentRequiredNow", "machineFollowUpOnly", "canonicalEligible"]) {
            if (evidence.summary[key] !== summary[key]) errors.push(`summary.${key} does not match recomputed value`);
        }
    }
    summary.errors = errors.length;
    summary.warnings = warnings.length;
    return {
        schemaVersion: 1,
        audit: "genshin-weapon-independent-evidence-audit",
        status: errors.length ? "failed" : "passed",
        generatedAt: "2026-08-23T00:00:00Z",
        input: { evidenceGenerator: evidence?.generator || null, evidenceGeneratedAt: evidence?.generatedAt || null },
        summary,
        errors,
        warnings,
        methodology: {
            gameVersion: "Official source versions are explicit bindings; gcsim commit/file SHA is not treated as a gameVersion.",
            independence: "HoYoLAB official primary and gcsim implementation are distinct providers/groups. GenshinData-derived and third-party guide/repost lineages are excluded.",
            comparison: "Official claims are compared to gcsim field values with rank-aware partial matching; absent official values remain notComparable.",
            humanReview: "All human judgment is deferred while the independent gcsim gameVersion binding is missing; semantic/value conflicts remain in deferredHumanReasons and machineFollowUpOnly covers the fail-closed gate.",
            canonical: "Every comparison remains needsReview and canonicalEligibility=false; this audit never promotes runtime data."
        }
    };
}

function renderMarkdown(report, evidence) {
    const s = report.summary;
    const lines = [
        "# Genshin weapon independent field evidence",
        "",
        `- Audit status: **${report.status}**`,
        `- Evidence packets: **${s.records}/${s.expectedRecords}**`,
        `- Field comparisons: **${s.fieldComparisons}**`,
        `- Official gameVersion linked: **${s.officialGameVersionLinkedRecords}**`,
        `- gcsim gameVersion still missing: **${s.independentGameVersionMissingRecords}**`,
        `- Independent provider pairs: **${s.independentProviderPairs}**; same-datamine pairs counted: **${s.sameDataminePairs}**`,
        `- Source agreement full/partial/mismatch/not-comparable: **${s.sourceAgreementFullMatches}/${s.sourceAgreementPartialMatches}/${s.sourceAgreementMismatches}/${s.sourceAgreementNotComparable}**`,
        `- Spec agreement match/mismatch: **${s.specAgreementMatches}/${s.specAgreementMismatches}**`,
        `- Human judgment required now / machine follow-up only: **${s.humanJudgmentRequiredNow}/${s.machineFollowUpOnly}**`,
        `- Canonical eligible: **${s.canonicalEligible}**`,
        "",
        "## Evidence packet batches",
        "",
        "The packets below are generated for later review. No packet is self-approved and no packet is canonical.",
        ""
    ];
    for (const batch of Object.values(evidence?.reviewBatches || {})) {
        lines.push(`### ${batch.id}`);
        lines.push("");
        lines.push(`- Purpose: ${batch.purpose}`);
        lines.push(`- Targets: ${batch.weaponIds.map((id) => `${id} (${evidence.records[id]?.name || "unknown"})`).join(", ")}`);
        lines.push("");
        for (const id of batch.weaponIds) {
            const record = evidence.records[id];
            if (!record) continue;
            const human = record.reviewDisposition.humanJudgmentRequiredNow ? "human judgment present" : "no immediate human judgment; machine follow-up only";
            lines.push(`- **${id} ${record.name}** — official ${record.gameVersion.official}; gcsim ${record.gameVersion.independentImplementation ?? "null"}; ${human}; canonical: 0.`);
            lines.push(`  - Runtime: ${record.runtimeApplication.destinations.map((destination) => `${destination.dataset}/${destination.entityId}/${destination.collection}`).join(", ") || "none"}`);
            lines.push(`  - Recommended decision: ${record.recommendedDecision}`);
            const sample = record.fieldComparisons.filter((item) => item.match.sourceAgreement !== "notComparable" || item.review.humanJudgmentRequiredNow).slice(0, 8);
            for (const item of sample) {
                lines.push(`  - ${item.candidateId}/${item.field}: A=${JSON.stringify(item.extractedValueA)}; B=${JSON.stringify(item.extractedValueB)}; Spec=${JSON.stringify(item.specValue)}; source=${item.match.sourceAgreement}; spec=${item.match.specAgreement}; human=${item.review.humanJudgmentRequiredNow ? "yes" : "no"}.`);
                if (item.interpretationNotes.length) lines.push(`    - Note: ${item.interpretationNotes.join(" ")}`);
            }
        }
        lines.push("");
    }
    lines.push("## Interpretation and blockers", "", "- Official source A has an explicit gameVersion for every packet.", "- Source B is independently implemented gcsim with fixed revision/path/SHA, but its gameVersion remains null because a commit is not a patch-version declaration.", "- Numeric agreement at R1 or a stack cap is recorded as partial/full evidence only; it does not satisfy complete refinement, version, or review gates.", "- Derived datamine/repost sources are excluded from the independent pair and are not used to fill missing values.", "- `needsReview` is retained everywhere; AI does not self-approve and canonical promotion remains forbidden.", "", "## Audit errors", "", ...(report.errors.length ? report.errors.map((error) => `- ${error}`) : ["- none"]), "", "## Audit warnings", "", ...(report.warnings.length ? report.warnings.map((warning) => `- ${warning}`) : ["- none"]), "");
    return lines.join("\n");
}

function writeReports(report, evidence, { reportJsonPath = defaultReportJsonPath, reportMarkdownPath = defaultReportMarkdownPath } = {}) {
    fs.mkdirSync(path.dirname(reportJsonPath), { recursive: true });
    fs.writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(reportMarkdownPath, renderMarkdown(report, evidence));
}

function parseArgs(argv) {
    const args = { evidencePath: defaultEvidencePath, externalPath: defaultExternalPath, reportJsonPath: defaultReportJsonPath, reportMarkdownPath: defaultReportMarkdownPath };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--evidence") args.evidencePath = path.resolve(argv[++i]);
        else if (arg === "--external-evidence") args.externalPath = path.resolve(argv[++i]);
        else if (arg === "--report-json") args.reportJsonPath = path.resolve(argv[++i]);
        else if (arg === "--report-md") args.reportMarkdownPath = path.resolve(argv[++i]);
        else if (arg === "--help") args.help = true;
        else throw new Error(`unknown argument: ${arg}`);
    }
    return args;
}

if (require.main === module) {
    try {
        const args = parseArgs(process.argv.slice(2));
        if (args.help) {
            console.log("Usage: node scripts/genshinWeaponIndependentEvidenceAudit.cjs [--evidence <path>] [--external-evidence <path>]");
            process.exit(0);
        }
        const evidence = readJson(args.evidencePath);
        const externalEvidence = fs.existsSync(args.externalPath) ? readJson(args.externalPath) : null;
        const report = auditEvidence({ evidence, externalEvidence });
        writeReports(report, evidence, args);
        console.log(JSON.stringify(report.summary, null, 2));
        if (report.status !== "passed") process.exitCode = 1;
    } catch (error) {
        console.error(error.stack || error.message);
        process.exitCode = 1;
    }
}

module.exports = { EXPECTED_IDS, auditEvidence, renderMarkdown, writeReports, stableJson };
