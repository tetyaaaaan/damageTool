"use strict";

/**
 * Candidate-scoped, evidence-only frontier for the first 100 weapon
 * candidates whose already-captured genshin-db refinement vectors are
 * numeric matches.  This module consumes persisted evidence only.  It does
 * not fetch a provider, change the queue, select a semantic mapping, issue a
 * certificate, or promote Runtime/canonical data.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const primary = require("./genshinWeaponPrimaryFieldComparison.cjs");
const terminal = require("./genshinTerminalStateAudit.cjs");
const work = require("./genshinWorkDisposition.cjs");

const ROOT = path.resolve(__dirname, "..");
const TARGET_GAME_VERSION = "7.0";
const FROM_GAME_VERSION = "6.7";
const GENERATED_AT = "2026-08-30T00:00:00.000Z";
const SHARD_ID = "weapons-primary-numeric-shard01";
const SHARD_SIZE = 100;
const FRONTIER_ID = "weapons-primary-numeric-shard01-independent-field-frontier-7.0";
const FRONTIER_POLICY_ID = "genshin-7.0-weapon-primary-numeric-shard-independent-field-frontier";
const NUMERIC_STATUS = "numericAgreementOnlyNotSemanticIdentity";
const REQUIRED_CLAIMS = ["activation", "refinement", "targets", "value"];

const FILES = Object.freeze({
    comparison: "games/genshin/data/v2/weapons/primary-field-comparison.json",
    queue: "reports/genshin-evidence-task-queue.json",
    officialReport: "reports/genshin-official-weapon-frontier-11301-11303.json",
    officialSnapshot: "games/genshin/data/v2/version-transitions/6.7-to-7.0/official-weapon-frontier-11301-11303-snapshot.json",
    officialManifest: "games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/hoyowiki-official-weapon-frontier-11301-11303/capture-manifest.json",
    providerPolicy: "games/genshin/data/v2/provider-independence-policy.json",
    gameVersionEvidence: "games/genshin/data/v2/game-version-evidence.json",
    sourceFrontiers: "games/genshin/data/v2/source-search-frontiers.json",
    sourceCoverage: "reports/genshin-candidate-source-coverage-frontier-inventory.json",
    independentEvidence: "reports/genshin-weapon-independent-evidence.json",
    gcsimEvidence: "reports/genshin-weapon-gcsim-evidence.json"
});

const OUTPUT_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "reviews", "r2-weapon-primary-field-search-shard01.json");
const SCHEMA_PATH = path.join(ROOT, "games", "genshin", "data", "schema", "r2-weapon-primary-field-search-shard01.schema.json");

const PROVIDER_IDS = Object.freeze([
    "hoyolab",
    "hoyowiki",
    "gcsim",
    "genshin-db",
    "kqm",
    "genshin-optimizer",
    "teyvatguide-yatta",
    "gamevika"
]);

function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
    }
    return value;
}

function stableJson(value) {
    return `${JSON.stringify(stable(value), null, 2)}\n`;
}

function digest(value) {
    return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function sha256(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function rel(file) {
    return path.relative(ROOT, file).replaceAll(path.sep, "/");
}

function resolveRepoFile(file) {
    const resolved = path.isAbsolute(String(file)) ? path.resolve(String(file)) : path.resolve(ROOT, String(file));
    if (resolved !== ROOT && !resolved.startsWith(`${ROOT}${path.sep}`)) throw new Error(`artifactOutsideRepository:${file}`);
    return resolved;
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(resolveRepoFile(file), "utf8"));
}

function fileRef(file, { includeFieldDigest = true } = {}) {
    const resolved = resolveRepoFile(file);
    if (!fs.existsSync(resolved)) throw new Error(`artifactMissing:${rel(resolved)}`);
    const bytes = fs.readFileSync(resolved);
    const ref = { path: rel(resolved), bytes: bytes.length, sha256: sha256(bytes) };
    if (includeFieldDigest) {
        try {
            const value = JSON.parse(bytes.toString("utf8"));
            ref.fieldDigest = typeof value?.fieldDigest === "string" ? value.fieldDigest : null;
        } catch (_) {
            ref.fieldDigest = null;
        }
    }
    return ref;
}

function refForPath(file) {
    return fileRef(file, { includeFieldDigest: false });
}

function withoutDigest(value) {
    const copy = JSON.parse(JSON.stringify(value));
    delete copy.fieldDigest;
    return copy;
}

function candidateSort(left, right) {
    return String(left).localeCompare(String(right));
}

function loadInputs() {
    const comparison = readJson(FILES.comparison);
    const comparisonValidation = primary.validateAudit(comparison, { compareCurrent: true });
    if (!comparisonValidation.valid) {
        throw new Error(`primaryComparisonInvalid:${comparisonValidation.reasons.join(",")}`);
    }
    const queue = readJson(FILES.queue);
    const officialReport = readJson(FILES.officialReport);
    const officialSnapshot = readJson(FILES.officialSnapshot);
    const officialManifest = readJson(FILES.officialManifest);
    const providerPolicy = readJson(FILES.providerPolicy);
    const gameVersionEvidence = readJson(FILES.gameVersionEvidence);
    const sourceFrontiers = readJson(FILES.sourceFrontiers);
    const sourceCoverage = readJson(FILES.sourceCoverage);
    const independentEvidence = readJson(FILES.independentEvidence);
    const gcsimEvidence = readJson(FILES.gcsimEvidence);
    const records = comparison.records && typeof comparison.records === "object" && !Array.isArray(comparison.records)
        ? comparison.records : {};
    const numericIds = Object.values(records)
        .filter((record) => record?.comparison?.status === NUMERIC_STATUS)
        .map((record) => String(record.candidateId))
        .sort(candidateSort);
    if (numericIds.length !== 310) throw new Error(`numericCandidateCount:${numericIds.length}`);
    const candidateIds = numericIds.slice(0, SHARD_SIZE);
    if (candidateIds.length !== SHARD_SIZE) throw new Error(`shardCandidateCount:${candidateIds.length}`);
    const queueById = new Map((queue.tasks || []).map((task) => [String(task.candidateId), task]));
    const officialClaimsById = new Map();
    for (const claim of officialSnapshot?.claim?.candidateClaims || []) {
        const id = String(claim.candidateId || "");
        if (!id) continue;
        if (!officialClaimsById.has(id)) officialClaimsById.set(id, []);
        officialClaimsById.get(id).push(claim);
    }
    const finiteLedger = (sourceFrontiers.frontiers || []).find((item) => item.id === "weapons-gcsim-nine-entity-field-frontier-7.0") || null;
    const policyEntries = new Map((providerPolicy.policies || []).map((item) => [String(item.id), item]));
    const assessment = gameVersionEvidence?.feasibilityAudit?.providerSubstitutionAssessment || {};
    const providerAssessments = Array.isArray(assessment.candidates) ? assessment.candidates : [];
    return {
        comparison, queue, officialReport, officialSnapshot, officialManifest, providerPolicy,
        gameVersionEvidence, sourceFrontiers, sourceCoverage, independentEvidence, gcsimEvidence,
        candidateIds, queueById, officialClaimsById, finiteLedger, policyEntries, providerAssessments
    };
}

function assessmentFor(inputs, predicate) {
    return inputs.providerAssessments.find((item) => predicate(String(item.provider || "").toLowerCase())) || null;
}

function policyRef(inputs, id) {
    const item = inputs.policyEntries.get(id);
    if (!item) return { id, status: "notRecordedForThisDataset", blockReasons: [] };
    return {
        id: item.id,
        status: item.status || null,
        searchStatus: item.searchStatus || null,
        blockReasons: item.blockReasons || [],
        providerA: item.providerA || null,
        providerB: item.providerB || null
    };
}

function providerMatrix(inputs) {
    const finite = inputs.finiteLedger;
    const finiteIds = new Set((finite?.appliesTo?.candidateIds || []));
    const officialCandidateIds = inputs.candidateIds.filter((id) => (inputs.officialClaimsById.get(id) || []).length > 0);
    const officialClaimFields = officialCandidateIds.reduce((total, id) => total + (inputs.officialClaimsById.get(id) || []).length, 0);
    const officialReportRef = refForPath(FILES.officialReport);
    const officialSnapshotRef = refForPath(FILES.officialSnapshot);
    const manifestRef = refForPath(FILES.officialManifest);
    const substitution = inputs.gameVersionEvidence?.feasibilityAudit?.providerSubstitutionAssessment || {};
    return [
        {
            providerId: "hoyowiki",
            provider: "HoYoverse HoYoWiki",
            sourceFamily: "official-hoyoverse",
            independenceGroup: "official-hoyoverse",
            candidateRawFieldHits: officialCandidateIds.length,
            candidateClaimFieldHits: officialClaimFields,
            strictTargetVersionBinding: "missing",
            semanticFieldCoverage: "rawPassiveTextOnly",
            candidateScopeStatus: "3CandidateRawHits",
            result: "blockedMutableEndpointAndUnbound7.0",
            policy: policyRef(inputs, "weapons:hoyowiki+genshin-db"),
            evidenceRefs: [officialReportRef, officialSnapshotRef, manifestRef]
        },
        {
            providerId: "hoyolab",
            provider: "HoYoLAB official notices",
            sourceFamily: "official-hoyoverse",
            independenceGroup: "official-hoyoverse",
            candidateRawFieldHits: 0,
            candidateClaimFieldHits: 0,
            strictTargetVersionBinding: "partialNamedNoticesOnly",
            semanticFieldCoverage: "incomplete",
            candidateScopeStatus: "sameFamilyAsHoYoWikiNoIndependentPair",
            result: "notASecondFamily",
            policy: policyRef(inputs, "weapons:hoyolab+gcsim"),
            evidenceRefs: [refForPath(FILES.providerPolicy), refForPath(FILES.gameVersionEvidence)]
        },
        {
            providerId: "gcsim",
            provider: "genshinsim/gcsim",
            sourceFamily: "gcsim-implementation",
            independenceGroup: "gcsim-implementation",
            candidateRawFieldHits: 0,
            candidateClaimFieldHits: 0,
            strictTargetVersionBinding: "missing",
            semanticFieldCoverage: "outOfScopeForShard",
            candidateScopeStatus: `finiteLedgerDifferentScope:${finite?.candidateCount || 0};intersection:0`,
            result: "outOfScopeAndVersionUnbound",
            policy: policyRef(inputs, "weapons:gcsim+genshin-db"),
            evidenceRefs: [refForPath(FILES.sourceFrontiers), refForPath(FILES.independentEvidence), refForPath(FILES.gcsimEvidence)]
        },
        {
            providerId: "genshin-db",
            provider: "theBowja/genshin-db",
            sourceFamily: "GenshinData-derived",
            independenceGroup: "GenshinData-derived",
            candidateRawFieldHits: SHARD_SIZE,
            candidateClaimFieldHits: null,
            strictTargetVersionBinding: "bound7.0RawRecordOnly",
            semanticFieldCoverage: "numericColumnObservationOnly",
            candidateScopeStatus: "primaryCorrelatedFamily",
            result: "notIndependentSecondFamily",
            policy: { id: "primary-captured-provider", status: "correlatedPrimary", blockReasons: ["providerIndependenceCorrelated"] },
            evidenceRefs: [refForPath(FILES.comparison)]
        },
        {
            providerId: "kqm",
            provider: "KQM Theorycrafting Library",
            sourceFamily: "independentHumanResearch",
            independenceGroup: "KQM-human-research",
            candidateRawFieldHits: 0,
            candidateClaimFieldHits: 0,
            strictTargetVersionBinding: "missing",
            semanticFieldCoverage: "partialMechanicsProse",
            candidateScopeStatus: "noCandidateFieldRecordInPersistedWeaponEvidence",
            result: "versionUnboundIncomplete",
            policy: policyRef(inputs, "artifacts:kqm-tcl+genshin-db"),
            assessment: assessmentFor(inputs, (provider) => provider.includes("kqm")),
            evidenceRefs: [refForPath(FILES.providerPolicy), refForPath(FILES.gameVersionEvidence)]
        },
        {
            providerId: "genshin-optimizer",
            provider: "Genshin Optimizer",
            sourceFamily: "GenshinData-derived",
            independenceGroup: "GenshinData-derived",
            candidateRawFieldHits: 0,
            candidateClaimFieldHits: 0,
            strictTargetVersionBinding: "notUsableForIndependentPair",
            semanticFieldCoverage: "broadButCorrelated",
            candidateScopeStatus: "noIndependentCandidateFieldRecord",
            result: "forbiddenCorrelated",
            policy: policyRef(inputs, "weapons-artifacts:optimizer+genshin-db"),
            assessment: assessmentFor(inputs, (provider) => provider.includes("optimizer")),
            evidenceRefs: [refForPath(FILES.providerPolicy), refForPath(FILES.gameVersionEvidence), refForPath("reports/genshin-optimizer-field-evidence.json")]
        },
        {
            providerId: "teyvatguide-yatta",
            provider: "BTMuli/TeyvatGuide and Yatta API",
            sourceFamily: "community-provider",
            independenceGroup: "unknown",
            candidateRawFieldHits: 0,
            candidateClaimFieldHits: 0,
            strictTargetVersionBinding: "notEstablished",
            semanticFieldCoverage: "notMaterializedForShard",
            candidateScopeStatus: "noCandidateFieldRecordInPersistedEvidence",
            result: "providerIndependenceUnknown",
            policy: policyRef(inputs, "weapons:teyvatguide+genshin-db"),
            evidenceRefs: [refForPath(FILES.providerPolicy), refForPath(FILES.gameVersionEvidence)]
        },
        {
            providerId: "gamevika",
            provider: "GameVika",
            sourceFamily: "community-provider",
            independenceGroup: "unknown",
            candidateRawFieldHits: 0,
            candidateClaimFieldHits: 0,
            strictTargetVersionBinding: "notEstablished",
            semanticFieldCoverage: "notMaterializedForShard",
            candidateScopeStatus: "noCandidateFieldRecordInPersistedEvidence",
            result: "noQualifyingStrictBundle",
            policy: { id: "provider-assessment-only", status: "notEligible", blockReasons: ["completeStrictBundleMissing"] },
            assessment: assessmentFor(inputs, (provider) => provider.includes("gamevika")),
            evidenceRefs: [refForPath(FILES.gameVersionEvidence), refForPath(FILES.providerPolicy)]
        }
    ].map((row) => {
        row.finiteLedgerIntersection = row.providerId === "gcsim"
            ? [...finiteIds].filter((id) => inputs.candidateIds.includes(id)).sort(candidateSort)
            : [];
        return row;
    });
}

function primarySide(side) {
    if (!side) return null;
    return {
        gameVersion: side.gameVersion || null,
        revision: side.revision || null,
        provider: side.provider || null,
        sourceFamily: side.sourceFamily || null,
        status: side.status || null,
        semanticMapping: side.semanticMapping ?? null,
        fieldDigest: side.fieldDigest || null,
        fieldPointers: Array.isArray(side.fieldPointers) ? side.fieldPointers : [],
        artifact: side.artifact ? {
            path: side.artifact.path,
            bytes: side.artifact.bytes,
            rawArtifactDigest: side.artifact.rawArtifactDigest,
            blobSha: side.artifact.blobSha,
            normalizedRecordDigest: side.artifact.normalizedRecordDigest
        } : null
    };
}

function officialClaimProjection(claim) {
    if (!claim) return null;
    const locator = claim.providerField?.rawLocator || {};
    return {
        field: claim.field,
        provider: "HoYoverse HoYoWiki",
        sourceFamily: "official-hoyoverse",
        providerKey: claim.providerField?.key || null,
        providerEntryId: claim.providerField?.providerEntryId || null,
        rawValue: claim.providerField?.rawValue ?? null,
        valueDigest: claim.providerField?.valueDigest || null,
        rawLocator: {
            path: locator.rawArtifactPath || null,
            bytes: locator.rawArtifactBytes ?? null,
            sha256: locator.rawArtifactSha256 || null,
            embeddedJsonPointer: locator.embeddedJsonPointer || null,
            embeddedValuePointer: locator.embeddedValuePointer || null,
            outerJsonPointer: locator.outerJsonPointer || null
        },
        strictGameVersionBinding: claim.strictGameVersionBinding?.status === "verified",
        strictGameVersionStatus: claim.strictGameVersionBinding?.status || "missing",
        semanticMapping: null,
        supportsClaimValue: false,
        status: claim.providerField?.status || "rawFieldPresent"
    };
}

function providerResults(inputs, id, officialClaims) {
    const finiteIds = new Set(inputs.finiteLedger?.appliesTo?.candidateIds || []);
    const officialFields = officialClaims.map((claim) => String(claim.field));
    return {
        hoyowiki: {
            candidateFieldRecord: officialClaims.length > 0,
            rawClaimCount: officialClaims.length,
            rawClaimFields: officialFields,
            strictTargetVersionBinding: false,
            semanticFieldMapping: "notMaterialized",
            status: officialClaims.length > 0 ? "rawFieldAvailableTargetVersionUnbound" : "noCandidateFieldRecord"
        },
        hoyolab: {
            candidateFieldRecord: false,
            sameIndependenceGroupAs: "official-hoyoverse",
            strictTargetVersionBinding: false,
            status: "sameFamilyNoSeparateCandidateRecord"
        },
        gcsim: {
            candidateFieldRecord: finiteIds.has(id),
            finiteLedgerCandidate: finiteIds.has(id),
            strictTargetVersionBinding: false,
            status: finiteIds.has(id) ? "finiteLedgerRecordButVersionUnbound" : "outOfScopeNoCandidateRecord"
        },
        kqm: {
            candidateFieldRecord: false,
            strictTargetVersionBinding: false,
            status: "noCandidateFieldRecordVersionUnbound"
        },
        "genshin-optimizer": {
            candidateFieldRecord: false,
            lineage: "GenshinData-derived",
            strictTargetVersionBinding: false,
            status: "correlatedNoIndependentRecord"
        },
        "teyvatguide-yatta": {
            candidateFieldRecord: false,
            independence: "unknown",
            strictTargetVersionBinding: false,
            status: "noCandidateFieldRecord"
        },
        gamevika: {
            candidateFieldRecord: false,
            strictTargetVersionBinding: false,
            status: "noQualifyingCandidateBundle"
        },
        "genshin-db": {
            candidateFieldRecord: true,
            independent: false,
            strictTargetVersionBinding: true,
            status: "primaryCorrelatedNumericObservation"
        }
    };
}

function currentQueueProjection(task) {
    if (!task) return null;
    return {
        candidateId: String(task.candidateId),
        layer: task.layer || null,
        dataset: task.dataset || null,
        terminalState: task.terminalState || null,
        primaryBlockReason: task.primaryBlockReason || null,
        blockReasons: task.blockReasons || [],
        task: task.task ? {
            taskId: task.task.taskId || null,
            kind: task.task.kind || null,
            status: task.task.status || null,
            reason: task.task.reason || null,
            autoProcessableNow: task.task.autoProcessableNow ?? null
        } : null,
        searchFrontier: task.searchFrontier ? {
            status: task.searchFrontier.status || null,
            exhausted: task.searchFrontier.exhausted ?? null,
            scopeMatched: task.searchFrontier.scopeMatched ?? null,
            policyId: task.searchFrontier.policyId || null,
            providersExamined: task.searchFrontier.providersExamined || [],
            searchScope: task.searchFrontier.searchScope || null
        } : null,
        mappingStatus: task.mappingStatus || null,
        consumerStatus: task.consumerStatus || null,
        deferredLaneCount: Array.isArray(task.deferredLanes) ? task.deferredLanes.length : 0
    };
}

function claimRecord(record, field, officialClaim, frontier) {
    const sourceClaim = record.claims?.[field] || {};
    return {
        claimId: `${record.candidateId}:${field}`,
        field,
        claimKind: sourceClaim.claimKind || null,
        local: sourceClaim.local ? {
            path: sourceClaim.local.path || null,
            value: sourceClaim.local.value ?? null,
            valueDigest: sourceClaim.local.valueDigest || null
        } : null,
        primaryProvider: {
            provider: sourceClaim.source?.provider || "genshin-db",
            sourceFamily: sourceClaim.source?.sourceFamily || "GenshinData-derived",
            before: primarySide(sourceClaim.source?.before),
            after: primarySide(sourceClaim.source?.after),
            comparison: sourceClaim.comparison ? {
                status: sourceClaim.comparison.status || null,
                rawVectorStatus: sourceClaim.comparison.rawVectorStatus || null,
                numericMatchingColumnIndexes: sourceClaim.comparison.numericMatchingColumnIndexes || [],
                semanticIdentityEstablished: sourceClaim.comparison.semanticIdentityEstablished === true,
                semanticMapping: sourceClaim.comparison.semanticMapping ?? null,
                supportsClaimValue: sourceClaim.comparison.supportsClaimValue === true
            } : null
        },
        officialIndependentProvider: officialClaim ? officialClaimProjection(officialClaim) : {
            provider: "HoYoverse HoYoWiki",
            sourceFamily: "official-hoyoverse",
            status: "noCandidateFieldRecord",
            strictGameVersionBinding: false,
            semanticMapping: null,
            supportsClaimValue: false
        },
        frontier: {
            id: frontier.id,
            status: frontier.status,
            exhausted: frontier.exhausted,
            scopeMatched: frontier.scopeMatched,
            g06HoldEligible: frontier.g06HoldEligible,
            candidateScoped: true
        },
        disposition: {
            kind: "externalEvidenceWait",
            status: "evidenceDeferred",
            blockingReasons: [
                "independentProviderFieldEvidenceMissing",
                "strictGameVersionBindingMissing",
                "candidateClaimSemanticFieldMappingMissing"
            ],
            reason: officialClaim
                ? "Official raw passive text is present, but immutable target-7.0 binding and candidate×claim semantic mapping are missing."
                : "No candidate-specific independent provider field record is present in the bounded persisted provider evidence.",
            certificateEligible: false,
            canonicalPromotionEligible: false,
            semanticInference: "forbidden"
        }
    };
}

function buildCandidate(inputs, id, frontier) {
    const record = inputs.comparison.records[id];
    const task = inputs.queueById.get(id);
    if (!record || !task) throw new Error(`candidateBindingMissing:${id}`);
    const officialClaims = (inputs.officialClaimsById.get(id) || []).slice().sort((a, b) => String(a.field).localeCompare(String(b.field)));
    const officialByField = new Map(officialClaims.map((claim) => [String(claim.field), claim]));
    const selected = record.source?.selected || null;
    const claims = Object.fromEntries(REQUIRED_CLAIMS.map((field) => [field, claimRecord(record, field, officialByField.get(field) || null, frontier)]));
    return {
        candidateId: id,
        entityId: record.entity?.id || null,
        entityIdentityStatus: record.entity?.identityStatus || null,
        primaryComparison: {
            status: record.comparison?.status || null,
            numericAgreementOnlyNotSemanticIdentity: record.comparison?.numericAgreementOnlyNotSemanticIdentity === true,
            beforeStatus: record.comparison?.before?.status || null,
            afterStatus: record.comparison?.after?.status || null,
            beforeMatchingColumnIndexes: record.comparison?.before?.numericMatchingColumnIndexes || [],
            afterMatchingColumnIndexes: record.comparison?.after?.numericMatchingColumnIndexes || [],
            rawVersionValuesEqual: record.comparison?.rawVersionValuesEqual === true,
            semanticIdentityEstablished: false,
            semanticMapping: null
        },
        primaryRawObservation: {
            provider: record.source?.provider || "genshin-db",
            sourceFamily: record.source?.sourceFamily || "GenshinData-derived",
            variantCount: record.source?.variantCount || 0,
            before: selected ? {
                gameVersion: selected.before.gameVersion,
                revision: selected.before.revision,
                packageVersion: selected.before.packageVersion,
                artifact: selected.before.artifactPin || null,
                observedArtifact: selected.before.observedPin || null,
                values: selected.before.values || []
            } : null,
            after: selected ? {
                gameVersion: selected.after.gameVersion,
                revision: selected.after.revision,
                packageVersion: selected.after.packageVersion,
                artifact: selected.after.artifactPin || null,
                observedArtifact: selected.after.observedPin || null,
                values: selected.after.values || []
            } : null
        },
        local: {
            path: record.local?.path || null,
            declaredUnit: record.local?.declaredUnit || null,
            rawByRefinement: record.local?.rawByRefinement || null,
            normalizedByRefinement: record.local?.normalizedByRefinement || null,
            fieldDigest: record.local?.fieldDigest || null
        },
        currentQueue: currentQueueProjection(task),
        providerResults: providerResults(inputs, id, officialClaims),
        officialRawClaims: officialClaims.map(officialClaimProjection),
        claims,
        frontier: {
            id: frontier.id,
            policyId: frontier.policyId,
            status: frontier.status,
            exhausted: frontier.exhausted,
            scopeMatched: frontier.scopeMatched,
            g06HoldEligible: frontier.g06HoldEligible,
            candidateScoped: true,
            reopenTrigger: frontier.reopenTrigger
        },
        disposition: {
            status: "evidenceDeferred",
            kind: "externalEvidenceWait",
            g06HoldEligible: true,
            certificateEligible: false,
            canonicalPromotionEligible: false,
            reason: officialClaims.length > 0
                ? "Candidate has only mutable official raw text without strict 7.0 binding or structured field identity."
                : "Candidate has no candidate-specific independent provider field artifact in the bounded persisted search inputs.",
            remainingSearches: [
                "Obtain an immutable provider-owned artifact explicitly bound to Genshin 7.0 for this candidate.",
                "Materialize exact candidate×claim field identity, condition, target, scope, and comparable value evidence from an independent family."
            ]
        },
        gate: {
            strictVerified: false,
            certificateEligible: false,
            canonicalPromotionEligible: false,
            semanticMappingSelected: false
        }
    };
}

function buildAudit() {
    const inputs = loadInputs();
    const candidateIds = inputs.candidateIds;
    const queueProjection = candidateIds.map((id) => currentQueueProjection(inputs.queueById.get(id)));
    const frontier = {
        id: FRONTIER_ID,
        policyId: FRONTIER_POLICY_ID,
        status: "searchExhausted",
        exhausted: true,
        scopeMatched: true,
        candidateScoped: true,
        scopeUnit: "candidate-set",
        candidateCount: candidateIds.length,
        candidateIdDigest: digest(candidateIds),
        candidateIds,
        searchScope: "Exact first 100 numeric-match weapon candidates; persisted primary raw pins, official HoYoWiki capture, finite provider substitution assessments, finite 30-candidate weapon ledger, source catalog policy, and candidate-specific repository evidence only. No network fetch or raw refetch.",
        lastSearchedAt: "2026-08-30",
        providersExamined: ["HoYoLAB", "HoYoWiki", "gcsim", "theBowja/genshin-db", "KQM", "Genshin Optimizer", "TeyvatGuide/Yatta", "GameVika"],
        negativeResult: "No second independent provider family supplies a complete immutable target-7.0 candidate×claim field bundle for this shard. HoYoWiki has 3 mutable raw hits; the other 97 have no candidate-specific independent field record in the persisted bounded inputs. No simple majority or semantic inference is used.",
        candidateRawHitSummary: {
            hoyowikiCandidates: 3,
            hoyowikiClaimFields: 12,
            candidatesWithoutIndependentCandidateFieldRecord: 97,
            gcsimFiniteLedgerIntersection: 0,
            strictIndependentCandidateFieldBundles: 0
        },
        reopenTrigger: "A provider-owned immutable manifest binds exact revision/raw/field digests and explicit Genshin 7.0 evidence for a candidate, plus comparable candidate×claim semantics from an independent lineage; or a new provider lineage disclosure changes an existing classification.",
        g06HoldEligible: true,
        queueIntegration: "draftOnly; current queue task frontier remains searchRequired and no queue/registry mutation is performed",
        evidenceRefs: [
            refForPath(FILES.comparison),
            refForPath(FILES.providerPolicy),
            refForPath(FILES.gameVersionEvidence),
            refForPath(FILES.sourceFrontiers),
            refForPath(FILES.sourceCoverage),
            refForPath(FILES.officialReport),
            refForPath(FILES.officialSnapshot),
            refForPath(FILES.officialManifest),
            refForPath(FILES.independentEvidence),
            refForPath(FILES.gcsimEvidence)
        ]
    };
    const providerRows = providerMatrix(inputs);
    const candidates = Object.fromEntries(candidateIds.map((id) => [id, buildCandidate(inputs, id, frontier)]));
    const officialRawCandidates = Object.values(candidates).filter((candidate) => candidate.officialRawClaims.length > 0);
    const officialClaimCount = officialRawCandidates.reduce((total, candidate) => total + candidate.officialRawClaims.length, 0);
    const queueStatusCounts = queueProjection.reduce((counts, task) => {
        const key = task?.searchFrontier?.status || "missing";
        counts[key] = (counts[key] || 0) + 1;
        return counts;
    }, {});
    const artifact = {
        schemaVersion: 1,
        kind: "genshinR2WeaponPrimaryFieldSearchShard",
        generatedAt: GENERATED_AT,
        status: "draft",
        lane: "weaponPrimaryNumericCandidateScopedFrontier",
        transition: {
            transitionId: "6.7-to-7.0",
            fromGameVersion: FROM_GAME_VERSION,
            targetGameVersion: TARGET_GAME_VERSION,
            primaryProvider: "genshin-db",
            primarySourceFamily: "GenshinData-derived",
            primaryBeforeRevision: inputs.comparison.transition?.before?.revision || null,
            primaryAfterRevision: inputs.comparison.transition?.after?.revision || null
        },
        policy: {
            sourceReuse: "persistedEvidenceOnly",
            networkFetch: "notPerformed",
            rawRefetch: "forbidden",
            numericAgreement: "observationOnly",
            semanticInference: "forbidden",
            majorityVote: "forbidden",
            candidateClaimGranularity: "candidate×claim",
            strictGate: "requires independent provider family, source-owned lineage, immutable revision/raw/field digests, explicit target gameVersion binding, exact semantic field identity, condition/scope agreement, and approved review scope",
            g06Hold: "allowed only as candidate-scoped externalEvidenceWait after this finite frontier; draft does not mutate queue",
            certificate: "forbidden",
            canonicalPromotion: "forbidden",
            queueMutation: "forbidden"
        },
        scope: {
            shardId: SHARD_ID,
            selection: "all primary comparison records with status numericAgreementOnlyNotSemanticIdentity, localeCompare candidateId ascending, first 100",
            candidateCount: candidateIds.length,
            expectedCandidateCount: SHARD_SIZE,
            sourceNumericCandidateCount: 310,
            candidateIdDigest: digest(candidateIds),
            entityCount: new Set(Object.values(candidates).map((candidate) => candidate.entityId).filter(Boolean)).size,
            candidateIds
        },
        inputEvidence: {
            files: Object.fromEntries(Object.entries(FILES).map(([name, file]) => [name, fileRef(file)])),
            queueObservation: {
                path: FILES.queue,
                sha256: fileRef(FILES.queue, { includeFieldDigest: false }).sha256,
                selectedCandidateCount: queueProjection.length,
                selectedTaskDigest: digest(queueProjection),
                currentFrontierStatusCounts: queueStatusCounts,
                mutationPerformed: false
            },
            officialHoYoWiki: {
                report: fileRef(FILES.officialReport),
                snapshot: fileRef(FILES.officialSnapshot),
                captureManifest: fileRef(FILES.officialManifest),
                candidateRawHitCount: officialRawCandidates.length,
                candidateClaimFieldHitCount: officialClaimCount,
                strictTargetVersionBindingCount: 0,
                sourceFamily: "official-hoyoverse",
                mutableEndpoint: true
            },
            finiteWeaponLedger: inputs.finiteLedger ? {
                id: inputs.finiteLedger.id,
                status: inputs.finiteLedger.status,
                candidateCount: inputs.finiteLedger.appliesTo?.candidateCount || 0,
                candidateIdDigest: inputs.finiteLedger.appliesTo?.candidateIdDigest || null,
                intersectionWithShard: [],
                candidateScopedToShard: false,
                evidenceRef: FILES.sourceFrontiers
            } : null,
            providerSubstitutionConclusion: inputs.gameVersionEvidence?.feasibilityAudit?.providerSubstitutionAssessment?.conclusion || null
        },
        frontier,
        providers: providerRows,
        candidates,
        summary: {
            candidates: candidateIds.length,
            uniqueEntities: new Set(Object.values(candidates).map((candidate) => candidate.entityId).filter(Boolean)).size,
            primaryNumericMatchCandidates: candidateIds.length,
            primaryRawVersionValuesEqual: Object.values(candidates).filter((candidate) => candidate.primaryComparison.rawVersionValuesEqual).length,
            officialRawCandidateHits: officialRawCandidates.length,
            officialRawClaimFieldHits: officialClaimCount,
            candidatesWithoutIndependentCandidateFieldRecord: candidateIds.length - officialRawCandidates.length,
            secondIndependentStrictCandidateCount: 0,
            secondIndependentStrictClaimCount: 0,
            candidateScopedG06HoldEligible: candidateIds.length,
            candidateScopedSearchExhausted: candidateIds.length,
            queueTasksStillSearchRequired: queueProjection.filter((task) => task?.searchFrontier?.status === "searchRequired").length,
            strictVerified: 0,
            certificateEligible: 0,
            canonicalPromotionEligible: 0,
            semanticMappingsSelected: 0,
            statusByDisposition: { evidenceDeferred: candidateIds.length },
            statusByOfficialRaw: { rawFieldAvailableTargetVersionUnbound: officialRawCandidates.length, noCandidateFieldRecord: candidateIds.length - officialRawCandidates.length }
        },
        gate: {
            status: "failClosed",
            draftOnly: true,
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false,
            canSelectSemanticMapping: false,
            strictVerified: false,
            reason: "Candidate-scoped finite frontier is an external-evidence hold draft. No independent strict field bundle is present and numeric agreement is not semantic identity."
        },
        fieldDigestAlgorithm: "sha256-stable-json-v1"
    };
    artifact.fieldDigest = digest(withoutDigest(artifact));
    return artifact;
}

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function decisionArtifactRef(audit) {
    const ref = fileRef(OUTPUT_PATH, { includeFieldDigest: false });
    if (ref.sha256 !== "248e62c5587ef21ef88d481e598857af65fc43f3783e8825cdf5067ad047e58b") {
        throw new Error(`weaponShardArtifactDigestUnexpected:${ref.sha256}`);
    }
    if (audit.fieldDigest !== "21b99b37ef406aabc154aa507095addaca32694b10638fca658b86c3e5d97c6f") {
        throw new Error(`weaponShardAuditDigestUnexpected:${audit.fieldDigest}`);
    }
    return ref;
}

function decisionForWeaponTask(task, candidate, audit, artifactRef) {
    const frontier = task.searchFrontier;
    const reason = `Candidate-scoped external evidence remains unavailable for ${task.candidateId}; numeric raw agreement is retained as an observation only and is not semantic identity.`;
    const fieldFindings = REQUIRED_CLAIMS.map((field) => ({
        field: `claim.${field}`,
        knownStatus: "numericObservationOnly",
        currentValue: candidate.claims?.[field]?.local?.value ?? null,
        historicalValue: null,
        missingEvidence: `Independent immutable target-${TARGET_GAME_VERSION} candidate×claim semantic evidence is absent for ${field}.`
    }));
    return {
        id: `r2-weapon-primary-shard01-deferral:${task.candidateId}`,
        kind: "genshinEvidenceDeferral",
        policyId: work.POLICY,
        candidateId: task.candidateId,
        targetGameVersion: TARGET_GAME_VERSION,
        queueTaskDigest: work.taskDigest(task),
        assessment: {
            actorId: "Sol",
            assessedAt: GENERATED_AT,
            reason,
            boundedScope: {
                candidateId: task.candidateId,
                taskId: task.task.taskId,
                remainingSearches: ["Reopen only when the recorded immutable independent target-version provider trigger is satisfied."],
                notExecutableReasons: [
                    "strictIndependentTargetFieldEvidenceMissing",
                    "candidateClaimSemanticFieldMappingMissing",
                    "numericAgreementIsNotSemanticIdentity"
                ],
                artifactRefs: [artifactRef]
            }
        },
        fieldFindings,
        search: {
            scope: frontier.searchScope,
            lastSearchedAt: frontier.lastSearchedAt,
            providersExamined: clone(frontier.providersExamined),
            negativeResult: audit.frontier.negativeResult,
            unsearchedScope: [],
            reopenTrigger: frontier.reopenTrigger,
            nextTask: `Reopen and reacquire exact ${TARGET_GAME_VERSION} independent candidate×claim field evidence for ${task.candidateId}.`,
            artifactRefs: [artifactRef]
        },
        safety: {
            impact: `Applying an unverified target-version weapon overlay could change the existing ${task.dataset}/${task.layer} calculation for ${task.candidateId}.`,
            action: `Keep ${task.candidateId} inactive and do not issue a certificate, select semantic identity, or promote canonical data.`,
            runtimeStatus: "existingConsumerUnchanged;candidateInactive;verificationAndPromotionDenied",
            artifactRefs: [artifactRef]
        }
    };
}

function augmentedSourceSearchFrontiers(audit, artifactRef, registryOverride = null) {
    const registry = registryOverride || readJson(FILES.sourceFrontiers);
    if (registry?.schemaVersion !== 1 || registry?.kind !== "genshinSourceSearchFrontierRegistry"
        || !Array.isArray(registry.frontiers)) throw new Error("sourceFrontierRegistryInvalid");
    const existing = registry.frontiers.filter((frontier) => frontier?.id === FRONTIER_ID);
    if (existing.length > 1 || existing.some((frontier) =>
        frontier.policyId !== FRONTIER_POLICY_ID
        || frontier.appliesTo?.candidateIdDigest !== audit.scope.candidateIdDigest
        || frontier.auditDigest !== audit.fieldDigest)) throw new Error("weaponShardFrontierCollision");
    const frontier = {
        id: FRONTIER_ID,
        policyId: FRONTIER_POLICY_ID,
        status: audit.frontier.status,
        appliesTo: {
            dataset: "weapons",
            layer: "weaponEffectSpec",
            candidateCount: audit.scope.candidateCount,
            candidateIdDigest: audit.scope.candidateIdDigest,
            candidateIds: [...audit.scope.candidateIds]
        },
        searchScope: audit.frontier.searchScope,
        lastSearchedAt: audit.frontier.lastSearchedAt,
        providersExamined: [...audit.frontier.providersExamined],
        negativeResult: audit.frontier.negativeResult,
        reopenTrigger: audit.frontier.reopenTrigger,
        // The terminal projection copies these optional fields only for a
        // frontier that explicitly carries both candidate and audit digests.
        auditDigest: audit.fieldDigest,
        evidenceRefs: [artifactRef.path]
    };
    return { ...registry, frontiers: [...registry.frontiers.filter((item) => item?.id !== FRONTIER_ID), frontier] };
}

/**
 * Rebind this exact draft shard to a fresh terminal/queue build in memory.
 * This returns a registry-shaped preview only; it deliberately performs no
 * registry, authoritative queue, checkpoint, Runtime, or canonical write.
 */
function prepareRegistry({ audit = null, compareCurrent = null, sourceRegistry = null } = {}) {
    const currentSourceRegistry = sourceRegistry || readJson(FILES.sourceFrontiers);
    const frontierAlreadyRegistered = currentSourceRegistry.frontiers?.some((frontier) => frontier?.id === FRONTIER_ID) === true;
    audit = audit || (frontierAlreadyRegistered && fs.existsSync(OUTPUT_PATH) ? readJson(OUTPUT_PATH) : buildAudit());
    compareCurrent = compareCurrent === null ? !frontierAlreadyRegistered : compareCurrent;
    const errors = [];
    const auditValidation = validateAudit(audit, { compareCurrent });
    const relevantReasons = (reasons) => compareCurrent ? reasons : reasons.filter((reason) =>
        !/^(fileBytesMismatch|fileDigestMismatch):(reports\/genshin-evidence-task-queue\.json|games\/genshin\/data\/v2\/source-search-frontiers\.json|reports\/genshin-candidate-source-coverage-frontier-inventory\.json)$/.test(reason));
    errors.push(...relevantReasons(auditValidation.reasons).map((reason) => `audit:${reason}`));
    const persisted = fs.existsSync(OUTPUT_PATH) ? readJson(OUTPUT_PATH) : null;
    if (!persisted) errors.push("persistedShardMissing");
    else {
        const persistedValidation = validateAudit(persisted, { compareCurrent });
        errors.push(...relevantReasons(persistedValidation.reasons).map((reason) => `persisted:${reason}`));
        if (persisted.fieldDigest !== audit.fieldDigest) errors.push("persistedShardDigestMismatch");
    }
    let artifactRef;
    try { artifactRef = decisionArtifactRef(audit); }
    catch (error) { errors.push(error.message); }
    if (!artifactRef) return {
        valid: false, errors: [...new Set(errors)], candidateCount: 0, decisionCount: 0,
        tasks: [], decisions: [], progress: null, registry: null
    };
    let augmentedFrontiers;
    try { augmentedFrontiers = augmentedSourceSearchFrontiers(audit, artifactRef, currentSourceRegistry); }
    catch (error) {
        errors.push(error.message);
        return {
            valid: false, errors: [...new Set(errors)], candidateCount: 0, decisionCount: 0,
            tasks: [], decisions: [], progress: null, registry: null
        };
    }
    // Always rebuild the terminal queue from the current repository inputs
    // plus this in-memory registry extension; no caller-supplied queue shape
    // is accepted.
    const fresh = terminal.buildTerminalStateAudit({
        sourceSearchFrontiersOverride: augmentedFrontiers
    });
    const candidateIds = Array.isArray(audit.scope?.candidateIds) ? audit.scope.candidateIds.map(String) : [];
    const tasksById = new Map((fresh.taskQueue?.tasks || []).map((task) => [String(task.candidateId), task]));
    if (candidateIds.length !== SHARD_SIZE || new Set(candidateIds).size !== SHARD_SIZE) errors.push("candidateScopeInvalid");
    const projectedTasks = [];
    const decisions = [];
    for (const id of candidateIds) {
        const baseTask = tasksById.get(id);
        const candidate = audit.candidates?.[id];
        if (!baseTask || !candidate) {
            errors.push(`candidateBindingMissing:${id}`);
            continue;
        }
        // Keep the task exactly as produced by the fresh terminal build.  The
        // in-memory frontier registration is the only binding step; do not
        // synthesize semantic, identity, mapping, or consumer state here.
        if (!work.isAllowedWeaponShard01ExternalEvidenceWait(baseTask)) {
            errors.push(`weaponTaskBindingInvalid:${id}`);
            continue;
        }
        projectedTasks.push(baseTask);
        decisions.push(decisionForWeaponTask(baseTask, candidate, audit, artifactRef));
    }
    if (projectedTasks.length !== SHARD_SIZE || decisions.length !== SHARD_SIZE) errors.push("preparedCountInvalid");
    const context = { targetGameVersion: TARGET_GAME_VERSION };
    const decisionResults = decisions.map((decision, index) => work.validateDeferral(
        decision, projectedTasks[index], context
    ));
    decisionResults.forEach((result, index) => {
        if (!result.valid) errors.push(`decision:${decisions[index]?.candidateId || index}:${result.errors.join(",")}`);
    });
    const registry = {
        schemaVersion: 1,
        kind: "genshinR2WorkDispositionRegistry",
        policyId: work.POLICY,
        targetGameVersion: TARGET_GAME_VERSION,
        note: "In-memory exact weapon primary shard01 preview; not persisted.",
        decisions,
        releaseAcceptance: null
    };
    const progress = work.buildWorkProgress(projectedTasks, registry, context);
    if (progress.errors.length) errors.push(...progress.errors.map((error) => `progress:${error}`));
    const baseSummary = fresh.taskQueue?.summary || {};
    const combinedExpectedKpi = {
        baseFromFreshTerminalQueue: {
            disposed: baseSummary.workDisposed,
            evidenceDeferred: baseSummary.evidenceDeferred,
            pending: baseSummary.workPending
        },
        addedCandidateShards: { behaviorSpecShard01: 100, weaponPrimaryShard01: 100 },
        expectedAfterBothShards: { disposed: 408, evidenceDeferred: 393, pending: 1860, strictVerified: 0 },
        baseMatchesExpected: (baseSummary.workDisposed === 208
            && baseSummary.evidenceDeferred === 193 && baseSummary.workPending === 2060)
            || (baseSummary.workDisposed === 408
                && baseSummary.evidenceDeferred === 393 && baseSummary.workPending === 1860)
    };
    return {
        valid: errors.length === 0,
        errors: [...new Set(errors)],
        candidateCount: projectedTasks.length,
        decisionCount: decisions.length,
        artifact: {
            path: artifactRef.path,
            sha256: artifactRef.sha256,
            fieldDigest: audit.fieldDigest
        },
        frontier: {
            id: FRONTIER_ID,
            policyId: FRONTIER_POLICY_ID,
            candidateIdDigest: audit.scope.candidateIdDigest,
            auditDigest: audit.fieldDigest,
            candidateCount: candidateIds.length
        },
        tasks: projectedTasks,
        decisions,
        decisionResults,
        registry,
        progress,
        combinedExpectedKpi,
        writesPerformed: false
    };
}

function validateFileRef(ref, reasons) {
    if (!ref || typeof ref.path !== "string" || !/^[a-f0-9]{64}$/.test(String(ref.sha256 || ""))) {
        reasons.push("fileRefInvalid");
        return;
    }
    try {
        const bytes = fs.readFileSync(resolveRepoFile(ref.path));
        if (bytes.length !== ref.bytes) reasons.push(`fileBytesMismatch:${ref.path}`);
        if (sha256(bytes) !== ref.sha256) reasons.push(`fileDigestMismatch:${ref.path}`);
    } catch (_) {
        reasons.push(`fileMissing:${ref.path}`);
    }
}

function validateRawLocator(locator, reasons) {
    if (!locator || typeof locator.path !== "string" || !/^[a-f0-9]{64}$/.test(String(locator.sha256 || ""))) {
        reasons.push("rawLocatorInvalid");
        return;
    }
    try {
        const bytes = fs.readFileSync(resolveRepoFile(locator.path));
        if (bytes.length !== locator.bytes) reasons.push(`rawBytesMismatch:${locator.path}`);
        if (sha256(bytes) !== locator.sha256) reasons.push(`rawDigestMismatch:${locator.path}`);
    } catch (_) {
        reasons.push(`rawArtifactMissing:${locator.path}`);
    }
}

function validateAudit(audit, { compareCurrent = true } = {}) {
    const reasons = [];
    if (!audit || typeof audit !== "object") return { valid: false, reasons: ["artifactMissing"] };
    if (audit.schemaVersion !== 1) reasons.push("schemaVersionInvalid");
    if (audit.kind !== "genshinR2WeaponPrimaryFieldSearchShard") reasons.push("kindInvalid");
    if (audit.status !== "draft") reasons.push("statusInvalid");
    if (audit.lane !== "weaponPrimaryNumericCandidateScopedFrontier") reasons.push("laneInvalid");
    if (audit.fieldDigestAlgorithm !== "sha256-stable-json-v1") reasons.push("fieldDigestAlgorithmInvalid");
    if (audit.fieldDigest !== digest(withoutDigest(audit))) reasons.push("fieldDigestInvalid");
    if (audit.scope?.candidateCount !== SHARD_SIZE || audit.scope?.expectedCandidateCount !== SHARD_SIZE) reasons.push("scopeCountInvalid");
    const ids = Array.isArray(audit.scope?.candidateIds) ? audit.scope.candidateIds : [];
    const candidates = audit.candidates && typeof audit.candidates === "object" && !Array.isArray(audit.candidates) ? audit.candidates : {};
    if (ids.length !== SHARD_SIZE || Object.keys(candidates).length !== SHARD_SIZE) reasons.push("candidateInventoryInvalid");
    if (digest(ids) !== audit.scope?.candidateIdDigest) reasons.push("candidateIdDigestInvalid");
    if (ids.some((id) => !Object.hasOwn(candidates, id))) reasons.push("candidateScopeBindingInvalid");
    if (audit.frontier?.id !== FRONTIER_ID || audit.frontier?.status !== "searchExhausted"
        || audit.frontier?.exhausted !== true || audit.frontier?.scopeMatched !== true
        || audit.frontier?.candidateScoped !== true || audit.frontier?.g06HoldEligible !== true) reasons.push("frontierNotClosed");
    if (audit.frontier?.candidateIdDigest !== audit.scope?.candidateIdDigest
        || digest(audit.frontier?.candidateIds || []) !== audit.scope?.candidateIdDigest) reasons.push("frontierScopeMismatch");
    if (audit.gate?.canIssueEligibilityCertificate !== false
        || audit.gate?.canPromoteCanonical !== false
        || audit.gate?.canSelectSemanticMapping !== false
        || audit.gate?.strictVerified !== false) reasons.push("gateNotFailClosed");
    if (audit.summary?.strictVerified !== 0 || audit.summary?.certificateEligible !== 0
        || audit.summary?.canonicalPromotionEligible !== 0 || audit.summary?.secondIndependentStrictCandidateCount !== 0) reasons.push("summaryGateInvalid");
    if (audit.policy?.semanticInference !== "forbidden" || audit.policy?.majorityVote !== "forbidden") reasons.push("unsafePolicy");
    for (const ref of Object.values(audit.inputEvidence?.files || {})) validateFileRef(ref, reasons);
    for (const ref of audit.frontier?.evidenceRefs || []) validateFileRef(ref, reasons);
    for (const [id, candidate] of Object.entries(candidates)) {
        if (candidate?.candidateId !== id) reasons.push(`candidateIdMismatch:${id}`);
        if (candidate?.primaryComparison?.status !== NUMERIC_STATUS) reasons.push(`candidateStatusInvalid:${id}`);
        if (candidate?.primaryComparison?.semanticIdentityEstablished !== false || candidate?.primaryComparison?.semanticMapping !== null) reasons.push(`candidateSemanticGateInvalid:${id}`);
        if (candidate?.frontier?.id !== FRONTIER_ID || candidate?.frontier?.status !== "searchExhausted" || candidate?.frontier?.g06HoldEligible !== true) reasons.push(`candidateFrontierInvalid:${id}`);
        if (candidate?.gate?.strictVerified !== false || candidate?.gate?.certificateEligible !== false || candidate?.gate?.canonicalPromotionEligible !== false) reasons.push(`candidateGateInvalid:${id}`);
        const claims = candidate?.claims && typeof candidate.claims === "object" ? candidate.claims : {};
        for (const field of REQUIRED_CLAIMS) {
            const claim = claims[field];
            if (!claim || claim.claimId !== `${id}:${field}`) reasons.push(`claimMissing:${id}:${field}`);
            if (claim?.frontier?.status !== "searchExhausted" || claim?.frontier?.g06HoldEligible !== true) reasons.push(`claimFrontierInvalid:${id}:${field}`);
            if (claim?.primaryProvider?.comparison?.semanticIdentityEstablished !== false
                || claim?.primaryProvider?.comparison?.semanticMapping !== null
                || claim?.primaryProvider?.comparison?.supportsClaimValue !== false) reasons.push(`claimSemanticGateInvalid:${id}:${field}`);
            if (claim?.disposition?.certificateEligible !== false || claim?.disposition?.canonicalPromotionEligible !== false) reasons.push(`claimGateInvalid:${id}:${field}`);
        }
        for (const officialClaim of candidate?.officialRawClaims || []) {
            validateRawLocator(officialClaim.rawLocator, reasons);
        }
    }
    if (compareCurrent) {
        try {
            const expected = buildAudit();
            if (stableJson(expected) !== stableJson(audit)) reasons.push("artifactNotDeterministicForCurrentInputs");
        } catch (error) {
            reasons.push(`currentInputsInvalid:${error.message}`);
        }
    }
    return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}

function writeArtifacts(audit = buildAudit()) {
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, stableJson(audit), "utf8");
    return audit;
}

if (require.main === module) {
    const audit = writeArtifacts();
    process.stdout.write(stableJson({
        status: audit.status,
        fieldDigest: audit.fieldDigest,
        summary: audit.summary,
        output: rel(OUTPUT_PATH)
    }));
}

module.exports = {
    FILES,
    OUTPUT_PATH,
    SCHEMA_PATH,
    FRONTIER_ID,
    FRONTIER_POLICY_ID,
    REQUIRED_CLAIMS,
    SHARD_SIZE,
    stableJson,
    digest,
    buildAudit,
    prepareRegistry,
    validateAudit,
    writeArtifacts
};
