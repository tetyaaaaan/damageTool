"use strict";

/**
 * Build the small official-primary-source weapon pilot.
 *
 * This artifact is deliberately evidence-only.  It records what the official
 * HoYoLAB update articles say and compares those scoped claims with the
 * independently pinned gcsim implementation.  It never edits an existing
 * candidate, modifier, package, or canonical runtime record.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const repositoryRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultPilotPath = path.join(dataRoot, "v2", "weapons", "official-pilot.json");
const defaultSourceCatalogPath = path.join(dataRoot, "v2", "source-catalog.json");
const defaultExternalEvidencePath = path.join(dataRoot, "v2", "weapons", "external-evidence.json");
const defaultReportJsonPath = path.join(repositoryRoot, "reports", "genshin-official-weapon-pilot.json");
const defaultReportMarkdownPath = path.join(repositoryRoot, "reports", "genshin-official-weapon-pilot.md");
const GENERATOR_VERSION = "genshinOfficialWeaponPilotGenerate/1";

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stableClone(value) {
    if (Array.isArray(value)) return value.map(stableClone);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableClone(value[key])]));
}

function stableJson(value) {
    return JSON.stringify(stableClone(value));
}

function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function sortNatural(left, right) {
    return String(left).localeCompare(String(right), "en", { numeric: true });
}

function officialSource({
    id,
    articleId,
    url,
    title,
    publishedAt,
    gameVersion,
    excerpt,
    fieldScope,
    notes
}) {
    // Bind the explicit version-bearing article title and field excerpt in a
    // content-addressed local snapshot. Article ID pins identity, not an
    // immutable remote content revision, so do not overstate source immutability.
    const snapshotText = `${title}\n${excerpt}`;
    const snapshotBytes = Buffer.from(snapshotText, "utf8");
    return {
        id,
        role: "officialPrimary",
        provider: "Genshin Impact Official / HoYoLAB",
        providerIndependence: "primary",
        independenceGroup: "official-genshin-hoyolab",
        domain: "hoyolab.com",
        articleId,
        url,
        title,
        publishedAt,
        revision: `hoyolab-article-${articleId}`,
        revisionKind: "hoyolabArticleId",
        revisionPinned: false,
        identityPinned: true,
        contentRevisionPinned: false,
        gameVersion,
        gameVersionEvidence: {
            status: "explicit",
            kind: "releaseNotesWithExplicitGameVersion",
            locator: {
                dataset: "hoyolabArticle",
                record: String(articleId),
                field: "titleAndArticleBody"
            },
            explicitText: `Version ${gameVersion}`,
            integrity: {
                algorithm: "sha256",
                digest: sha256(snapshotBytes)
            },
            binding: {
                revision: `hoyolab-article-${articleId}`,
                metadataDigest: sha256(snapshotBytes),
                bindingPresent: true
            }
        },
        gameVersionVerified: true,
        sourceReviewStatus: "needsReview",
        immutable: false,
        snapshot: {
            captureKind: "shortOfficialExcerpt",
            contentAddressed: true,
            captureVerification: "manuallyMaterializedNeedsIndependentReview",
            encoding: "utf8",
            text: snapshotText,
            bytes: snapshotBytes.length,
            sha256: sha256(snapshotBytes)
        },
        fieldScope: clone(fieldScope),
        notes
    };
}

function sourceRecord(sourceCatalog, externalEvidence, sourceId) {
    const catalogRecord = sourceCatalog.records?.[sourceId];
    const provider = sourceCatalog.sources?.[catalogRecord?.source];
    const external = externalEvidence.records?.[sourceId];
    if (!catalogRecord || !provider || !external?.sourceRecord) {
        throw new Error(`missing pinned gcsim evidence for ${sourceId}`);
    }
    return {
        id: sourceId,
        role: "independentImplementation",
        provider: provider.provider,
        repository: provider.repository,
        revision: provider.revision,
        revisionKind: provider.revisionKind || "gitCommit",
        revisionPinned: Boolean(external.sourceRecord.revisionVerified),
        path: catalogRecord.path,
        sha256: catalogRecord.sha256,
        gameVersion: null,
        gameVersionVerified: false,
        independenceGroup: provider.independenceGroup,
        sourceRecordDigest: catalogRecord.sha256,
        sourceVersionBlockedReasons: ["gameVersionMissing"]
    };
}

function gcsimFields(externalEvidence, sourceId) {
    const record = externalEvidence.records?.[sourceId];
    return (record?.fields || []).filter((field) => field.field === "value" || field.field === "stack").map((field) => ({
        candidateId: field.candidateId,
        field: field.field,
        status: field.status,
        structuredValue: clone(field.structuredValue),
        unit: field.unit || null,
        targets: clone(field.targets),
        activation: clone(field.activation),
        locator: clone(field.locator),
        provider: field.provider,
        revision: field.revision,
        path: field.path,
        sha256: field.sha256,
        gameVersion: field.gameVersion,
        gameVersionVerified: field.gameVersionVerified,
        independenceGroup: field.independenceGroup,
        canonicalEligibility: false
    }));
}

function officialClaim({
    sourceId,
    candidateId,
    field,
    structuredValue,
    unit,
    targets,
    activation,
    scope,
    notes
}) {
    return {
        sourceId,
        candidateId,
        field,
        structuredValue: clone(structuredValue),
        unit: unit || null,
        targets: clone(targets || null),
        activation: clone(activation || null),
        scope: {
            refinementRanks: scope?.refinementRanks || [1],
            completeRefinementTable: scope?.completeRefinementTable === true
        },
        supportsClaimValue: true,
        notes
    };
}

function compareOfficialClaim(claim, fields) {
    const matches = fields.filter((field) => field.candidateId === claim.candidateId && (field.field === claim.field || (claim.field === "value" && field.field === "value")));
    const gcsim = matches[0] || null;
    const rankOne = gcsim?.structuredValue && Object.prototype.hasOwnProperty.call(gcsim.structuredValue, "1")
        ? gcsim.structuredValue["1"]
        : null;
    const officialValue = typeof claim.structuredValue === "object" && claim.structuredValue !== null
        ? claim.structuredValue["1"]
        : claim.structuredValue;
    const subsetMatch = claim.field === "stack"
        && gcsim?.structuredValue
        && Object.entries(claim.structuredValue || {}).every(([key, value]) => gcsim.structuredValue[key] === value);
    const scalarMatch = rankOne !== null && rankOne === officialValue;
    return {
        candidateId: claim.candidateId,
        field: claim.field,
        officialRefinementRanks: claim.scope.refinementRanks,
        gcsimRefinementRanks: gcsim?.structuredValue ? Object.keys(gcsim.structuredValue).map(Number).sort((a, b) => a - b) : [],
        rankOneValueMatch: scalarMatch || subsetMatch,
        gcsimFieldStatus: gcsim?.status || "missing",
        independentProvider: gcsim?.provider || null,
        independentRevision: gcsim?.revision || null,
        independentSha256: gcsim?.sha256 || null,
        notes: scalarMatch || subsetMatch
            ? "Official R1 claim matches the independently extracted gcsim R1 value; remaining ranks are not established by the official article."
            : "Official claim could not be matched to the pinned independent field evidence."
    };
}

function buildPilot({
    sourceCatalog = readJson(defaultSourceCatalogPath),
    externalEvidence = readJson(defaultExternalEvidencePath)
} = {}) {
    const officialSources = [
        officialSource({
            id: "hoyolab:article:111067",
            articleId: 111067,
            url: "https://www.hoyolab.com/article/111067?crawler=Googlebot",
            title: "The Chalk Prince and the Dragon Version 1.2 Update Details (Part 3)",
            publishedAt: "2020-12-22",
            gameVersion: "1.2",
            excerpt: "Amos' Bow Weapon Effect - Strong-Willed. New Description: Increases Normal and Charged Attack DMG by 12%. Normal and Charged Attack DMG increases by 8% every 0.1s for up to 5 times.",
            fieldScope: ["w_15502_damage_1:value", "w_15502_damageBonus_fc388315:value", "w_15502_damageBonus_fc388315:stack"],
            notes: "Official patch notes explicitly provide the revised Amos' Bow R1 effect wording and values; they do not publish the full refinement table."
        }),
        officialSource({
            id: "hoyolab:article:491022",
            articleId: 491022,
            url: "https://www.hoyolab.com/article/491022",
            title: "Version 1.6 Midsummer Island Adventure New Weapon Overview Part II",
            publishedAt: "2021-06-27",
            gameVersion: "1.6",
            excerpt: "Version 1.6 \"Midsummer! Island? Adventure Awaits!\" New Weapon Overview Part II. Today, Paimon wants to show you a brand new weapon that'll be in \"Epitome Invocation\" — Freedom-Sworn (Sword)! Let's go take a look~",
            fieldScope: [],
            notes: "Official overview identifies Freedom-Sworn and Version 1.6, but its indexed body has no numeric effect or refinement values."
        }),
        officialSource({
            id: "hoyolab:article:415463",
            articleId: 415463,
            url: "https://www.hoyolab.com/article/415463",
            title: "Midsummer Island Adventure Version 1.6 Update Details",
            publishedAt: "2021-06-07",
            gameVersion: "1.6",
            excerpt: "New Weapons: Freedom-Sworn (5-Star Sword), Mitternachts Waltz (4-Star Bow), and Dodoco Tales (4-Star Catalyst).",
            fieldScope: [],
            notes: "Official Version 1.6 update details corroborate the release/version and weapon identity only; no passive field values are stated."
        })
    ];
    const officialById = Object.fromEntries(officialSources.map((source) => [source.id, source]));
    const targetDefinitions = [
        {
            weaponId: "15502",
            name: "Amos' Bow",
            officialSourceIds: ["hoyolab:article:111067"],
            independentSourceId: "gcsim:weapon:15502",
            officialClaims: [
                officialClaim({
                    sourceId: "hoyolab:article:111067",
                    candidateId: "w_15502_damage_1",
                    field: "value",
                    structuredValue: { "1": 12 },
                    unit: "percent",
                    targets: ["normalAttackDamageBonus", "chargedAttackDamageBonus"],
                    activation: { condition: "always" },
                    scope: { refinementRanks: [1], completeRefinementTable: false },
                    notes: "R1 value explicitly printed in the official Version 1.2 description."
                }),
                officialClaim({
                    sourceId: "hoyolab:article:111067",
                    candidateId: "w_15502_damageBonus_fc388315",
                    field: "value",
                    structuredValue: { "1": 8 },
                    unit: "percent",
                    targets: ["normalAttackDamageBonus", "chargedAttackDamageBonus"],
                    activation: { condition: "arrowFlightTime", intervalSeconds: 0.1 },
                    scope: { refinementRanks: [1], completeRefinementTable: false },
                    notes: "R1 value and 0.1s interval are explicit; the official article states a maximum of five occurrences."
                }),
                officialClaim({
                    sourceId: "hoyolab:article:111067",
                    candidateId: "w_15502_damageBonus_fc388315",
                    field: "stack",
                    structuredValue: { min: 0, max: 5, intervalSeconds: 0.1 },
                    unit: "stack",
                    targets: ["normalAttackDamageBonus", "chargedAttackDamageBonus"],
                    activation: { condition: "arrowFlightTime", intervalSeconds: 0.1 },
                    scope: { refinementRanks: [1], completeRefinementTable: false },
                    notes: "Stack cap and interval are explicit, but refinement-dependent values are not complete."
                })
            ],
            blockedReasons: ["officialRefinementTableMissing", "officialFieldScopeOnlyRefinement1", "canonicalGateRequiresCompleteClaim"],
            supersession: {
                existingModifierIds: ["w_15502_damage_1", "w_15502_damageBonus_fc388315"],
                action: "none",
                reason: "Partial official evidence cannot supersede review-gated legacy modifiers."
            }
        },
        {
            weaponId: "11503",
            name: "Freedom-Sworn",
            officialSourceIds: ["hoyolab:article:491022", "hoyolab:article:415463"],
            independentSourceId: "gcsim:weapon:11503",
            officialClaims: [],
            blockedReasons: ["officialFieldValuesMissing", "officialRefinementTableMissing", "canonicalGateRequiresFieldEvidence"],
            supersession: {
                existingModifierIds: ["w_11503_damage_1", "w_11503_damage_3", "w_11503_stat_2"],
                action: "none",
                reason: "Official Version 1.6 pages identify the weapon but do not state passive numeric fields."
            }
        }
    ];
    const records = targetDefinitions.map((definition) => {
        const independent = sourceRecord(sourceCatalog, externalEvidence, definition.independentSourceId);
        const gcsim = gcsimFields(externalEvidence, definition.independentSourceId);
        const comparisons = definition.officialClaims.map((claim) => compareOfficialClaim(claim, gcsim));
        const officialVersions = definition.officialSourceIds.map((id) => officialById[id]?.gameVersion || null).filter(Boolean);
        return {
            weaponId: definition.weaponId,
            name: definition.name,
            officialSourceIds: definition.officialSourceIds,
            officialGameVersions: [...new Set(officialVersions)].sort(sortNatural),
            independentSource: independent,
            officialClaims: definition.officialClaims,
            independentFields: gcsim,
            comparisons,
            status: "blocked",
            canonicalEligibility: false,
            blockedReasons: definition.blockedReasons,
            supersession: definition.supersession
        };
    });
    const officialClaims = records.flatMap((record) => record.officialClaims);
    const comparisons = records.flatMap((record) => record.comparisons);
    const blockedReasons = records.flatMap((record) => record.blockedReasons.map((reason) => `${record.weaponId}:${reason}`));
    return {
        schemaVersion: 1,
        evidence: "genshin-official-weapon-pilot",
        generator: GENERATOR_VERSION,
        generatedAt: "2026-08-16T00:00:00.000Z",
        policy: {
            primarySourcesOnly: true,
            officialDomainAllowlist: ["hoyolab.com", "genshin.hoyoverse.com"],
            networkAccess: "none",
            canonicalPromotion: "forbidden",
            noInferenceFromMissingFields: true,
            noLegacySupersessionUntilComplete: true
        },
        methodology: {
            official: "Materialized short excerpts from Genshin Impact Official HoYoLAB update articles are retained with SHA-256 and article-identity binding. Article IDs do not prove an immutable remote content revision. Official pages are used for gameVersion and only the fields they explicitly state.",
            independent: "Pinned gcsim field evidence is compared as an independent implementation; its repository revision is not treated as gameVersion.",
            refinementScope: "A claim with only refinement rank 1 is partial and cannot satisfy the complete canonical claim gate.",
            canonical: "This pilot never promotes a candidate or writes runtime modifiers; all records remain blocked until full primary field evidence and review exist."
        },
        sources: Object.fromEntries(officialSources.map((source) => [source.id, source])),
        records: Object.fromEntries(records.sort((a, b) => sortNatural(a.weaponId, b.weaponId)).map((record) => [record.weaponId, record])),
        summary: {
            weapons: records.length,
            officialSources: officialSources.length,
            explicitGameVersionSources: officialSources.filter((source) => source.gameVersion).length,
            sourceReviewNeedsReview: officialSources.filter((source) => source.sourceReviewStatus === "needsReview").length,
            officialClaimFields: officialClaims.length,
            completeOfficialRefinementClaims: officialClaims.filter((claim) => claim.scope.completeRefinementTable).length,
            rankOneOfficialClaims: officialClaims.filter((claim) => claim.scope.refinementRanks.length === 1).length,
            independentComparisonFields: comparisons.length,
            rankOneMatches: comparisons.filter((comparison) => comparison.rankOneValueMatch).length,
            canonicalEligibility: 0,
            promotionGate: "blocked",
            blockedReasons: blockedReasons.length,
            blockedReasonCounts: blockedReasons.reduce((counts, reason) => {
                counts[reason] = (counts[reason] || 0) + 1;
                return counts;
            }, {})
        }
    };
}

function writePilot(pilot, file = defaultPilotPath) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(pilot, null, 2)}\n`);
}

function parseArgs(argv) {
    const args = {
        sourceCatalogPath: defaultSourceCatalogPath,
        externalEvidencePath: defaultExternalEvidencePath,
        outputPath: defaultPilotPath
    };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--source-catalog") args.sourceCatalogPath = path.resolve(argv[++index]);
        else if (arg === "--external-evidence") args.externalEvidencePath = path.resolve(argv[++index]);
        else if (arg === "--output") args.outputPath = path.resolve(argv[++index]);
        else if (arg === "--help") args.help = true;
        else throw new Error(`unknown argument: ${arg}`);
    }
    return args;
}

if (require.main === module) {
    try {
        const args = parseArgs(process.argv.slice(2));
        if (args.help) {
            console.log("Usage: node scripts/genshinOfficialWeaponPilotGenerate.cjs [--source-catalog <path>] [--external-evidence <path>] [--output <path>]");
            process.exit(0);
        }
        const pilot = buildPilot({
            sourceCatalog: readJson(args.sourceCatalogPath),
            externalEvidence: readJson(args.externalEvidencePath)
        });
        writePilot(pilot, args.outputPath);
        console.log(JSON.stringify(pilot.summary, null, 2));
    } catch (error) {
        console.error(error.stack || error.message);
        process.exitCode = 1;
    }
}

module.exports = {
    GENERATOR_VERSION,
    buildPilot,
    officialSource,
    stableJson,
    writePilot
};
