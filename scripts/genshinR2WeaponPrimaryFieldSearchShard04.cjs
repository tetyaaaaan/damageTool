"use strict";

/**
 * Candidate-scoped, evidence-only frontier for the remaining numeric weapon
 * observations.  This shard deliberately consumes the already persisted
 * genshin-db 6.7/7.0 raw pins; it does not fetch a provider, choose a
 * semantic column, issue a certificate, mutate the queue, or promote data.
 *
 * Shards 01-03 and the legacy w_12516 route are excluded by identity before
 * selecting this bounded tail.  The tail contains nine candidates (the
 * tenth numeric record is the separate historical-canonical route).
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const primary = require("./genshinWeaponPrimaryFieldComparison.cjs");

const ROOT = path.resolve(__dirname, "..");
const TARGET_GAME_VERSION = "7.0";
const FROM_GAME_VERSION = "6.7";
const GENERATED_AT = "2026-08-31T00:00:00.000Z";
const SHARD_ID = "weapons-primary-numeric-shard04";
const SHARD_SIZE = 9;
const SHARD_OFFSET = 300;
const FRONTIER_ID = "weapons-primary-numeric-shard04-independent-field-frontier-7.0";
const FRONTIER_POLICY_ID = "genshin-7.0-weapon-primary-numeric-shard-independent-field-frontier";
const NUMERIC_STATUS = "numericAgreementOnlyNotSemanticIdentity";
const REQUIRED_CLAIMS = ["activation", "refinement", "targets", "value"];
const HISTORICAL_CANDIDATE = "w_12516_stat_1";

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

const PRIOR_SHARDS = Object.freeze([
    "games/genshin/data/v2/reviews/r2-weapon-primary-field-search-shard01.json",
    "games/genshin/data/v2/reviews/r2-weapon-primary-field-search-shard02.json",
    "games/genshin/data/v2/reviews/r2-weapon-primary-field-search-shard03.json"
]);
const LEGACY_DECISIONS = "games/genshin/data/v2/reviews/r2-weapon-deferral-audit.json";
const OUTPUT_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "reviews", "r2-weapon-primary-field-search-shard04.json");
const SCHEMA_PATH = path.join(ROOT, "games", "genshin", "data", "schema", "r2-weapon-primary-field-search-shard04.schema.json");

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

function gitBlobSha(bytes) {
    const header = Buffer.from(`blob ${bytes.length}${String.fromCharCode(0)}`, "utf8");
    return crypto.createHash("sha1").update(Buffer.concat([header, bytes])).digest("hex");
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

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
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
    const copy = clone(value);
    delete copy.fieldDigest;
    return copy;
}

function candidateSort(left, right) {
    return String(left).localeCompare(String(right));
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

function validateRawPin(pin) {
    const expected = pin?.artifactPin || pin;
    const result = {
        path: expected?.path || null,
        bytes: expected?.rawArtifactBytes ?? expected?.bytes ?? null,
        expectedSha256: expected?.rawArtifactDigest || null,
        expectedGitBlobSha: expected?.blobSha || expected?.gitBlobSha || null,
        actualSha256: null,
        actualGitBlobSha: null,
        bytesMatch: false,
        sha256Match: false,
        gitBlobShaMatch: false,
        valid: false
    };
    if (!result.path) return result;
    try {
        const bytes = fs.readFileSync(resolveRepoFile(result.path));
        result.actualSha256 = sha256(bytes);
        result.actualGitBlobSha = gitBlobSha(bytes);
        result.bytesMatch = result.bytes === bytes.length;
        result.sha256Match = result.actualSha256 === result.expectedSha256;
        result.gitBlobShaMatch = result.actualGitBlobSha === result.expectedGitBlobSha;
        result.valid = result.bytesMatch && result.sha256Match && result.gitBlobShaMatch;
    } catch (_) {
        // A missing or unresolvable pin is never silently accepted.
    }
    return result;
}

function rawIntegrityForRecord(record) {
    const selected = record?.source?.selected || {};
    const before = validateRawPin(selected.before);
    const after = validateRawPin(selected.after);
    return { before, after, valid: before.valid && after.valid };
}

function loadInputs() {
    const comparison = readJson(FILES.comparison);
    const comparisonValidation = primary.validateAudit(comparison, { compareCurrent: false });
    if (!comparisonValidation.valid) throw new Error(`primaryComparisonInvalid:${comparisonValidation.reasons.join(",")}`);
    const queue = readJson(FILES.queue);
    const officialSnapshot = readJson(FILES.officialSnapshot);
    const input = {
        comparison,
        queue,
        officialSnapshot,
        providerPolicy: readJson(FILES.providerPolicy),
        gameVersionEvidence: readJson(FILES.gameVersionEvidence),
        sourceFrontiers: readJson(FILES.sourceFrontiers),
        sourceCoverage: readJson(FILES.sourceCoverage),
        officialReport: readJson(FILES.officialReport),
        officialManifest: readJson(FILES.officialManifest),
        independentEvidence: readJson(FILES.independentEvidence),
        gcsimEvidence: readJson(FILES.gcsimEvidence)
    };
    const queueById = new Map((queue.tasks || []).map((task) => [String(task.candidateId), task]));
    const numericIds = Object.values(comparison.records || {})
        .filter((record) => record?.comparison?.status === NUMERIC_STATUS)
        .map((record) => String(record.candidateId))
        .sort(candidateSort);
    const consumerFreeNumericIds = numericIds.filter((id) => queueById.get(id)?.consumerStatus === "notApplicable");
    const priorIds = new Set([HISTORICAL_CANDIDATE]);
    for (const file of PRIOR_SHARDS) {
        const shard = readJson(file);
        for (const id of shard.scope?.candidateIds || []) priorIds.add(String(id));
    }
    const legacy = readJson(LEGACY_DECISIONS);
    for (const item of legacy.decisions || []) priorIds.add(String(item.candidateId));
    const candidateIds = consumerFreeNumericIds.filter((id) => !priorIds.has(id)).slice(0, SHARD_SIZE);
    if (candidateIds.length !== SHARD_SIZE) throw new Error(`remainingNumericTailCount:${candidateIds.length}`);
    const overlaps = candidateIds.filter((id) => priorIds.has(id));
    if (overlaps.length) throw new Error(`priorCandidateOverlap:${overlaps.join(",")}`);
    const officialClaimsById = new Map();
    for (const claim of officialSnapshot?.claim?.candidateClaims || []) {
        const id = String(claim.candidateId || "");
        if (!id) continue;
        if (!officialClaimsById.has(id)) officialClaimsById.set(id, []);
        officialClaimsById.get(id).push(claim);
    }
    const finiteLedger = (input.sourceFrontiers.frontiers || []).find((item) => item.id === "weapons-gcsim-nine-entity-field-frontier-7.0") || null;
    return { ...input, queueById, numericIds, consumerFreeNumericIds, candidateIds, officialClaimsById, finiteLedger };
}

function sourceSide(side) {
    if (!side) return null;
    return {
        gameVersion: side.gameVersion || null,
        revision: side.revision || null,
        packageVersion: side.packageVersion || null,
        provider: side.provider || null,
        sourceFamily: side.sourceFamily || null,
        status: side.status || null,
        semanticMapping: side.semanticMapping ?? null,
        fieldDigest: side.fieldDigest || null,
        fieldPointers: Array.isArray(side.fieldPointers) ? side.fieldPointers : [],
        values: side.values || null,
        artifact: side.artifact ? clone(side.artifact) : null
    };
}

function officialClaimProjection(claim) {
    const locator = claim?.providerField?.rawLocator || {};
    return {
        field: claim?.field || null,
        provider: "HoYoverse HoYoWiki",
        sourceFamily: "official-hoyoverse",
        providerKey: claim?.providerField?.key || null,
        providerEntryId: claim?.providerField?.providerEntryId || null,
        rawValue: claim?.providerField?.rawValue ?? null,
        valueDigest: claim?.providerField?.valueDigest || null,
        rawLocator: {
            path: locator.rawArtifactPath || null,
            bytes: locator.rawArtifactBytes ?? null,
            sha256: locator.rawArtifactSha256 || null,
            embeddedJsonPointer: locator.embeddedJsonPointer || null,
            embeddedValuePointer: locator.embeddedValuePointer || null,
            outerJsonPointer: locator.outerJsonPointer || null
        },
        strictGameVersionBinding: claim?.strictGameVersionBinding?.status === "verified",
        strictGameVersionStatus: claim?.strictGameVersionBinding?.status || "missing",
        semanticMapping: null,
        supportsClaimValue: false,
        status: claim?.providerField?.status || "rawFieldPresent"
    };
}

function providerRows(inputs, candidateCount, officialRawCandidateCount, officialClaimCount) {
    const finiteIntersection = [];
    const refs = (paths) => paths.map((item) => refForPath(item));
    return [
        {
            providerId: "genshin-db",
            provider: "theBowja/genshin-db",
            sourceFamily: "GenshinData-derived",
            independenceGroup: "GenshinData-derived",
            candidateRawFieldHits: candidateCount,
            candidateClaimFieldHits: null,
            strictTargetVersionBinding: "bound7.0RawRecordOnly",
            semanticFieldCoverage: "numericColumnObservationOnly",
            result: "primaryCorrelatedFamilyNotIndependent",
            finiteLedgerIntersection: finiteIntersection,
            evidenceRefs: [refForPath(FILES.comparison)]
        },
        {
            providerId: "hoyowiki",
            provider: "HoYoverse HoYoWiki",
            sourceFamily: "official-hoyoverse",
            independenceGroup: "official-hoyoverse",
            candidateRawFieldHits: officialRawCandidateCount,
            candidateClaimFieldHits: officialClaimCount,
            strictTargetVersionBinding: "missing",
            semanticFieldCoverage: "rawPassiveTextOnly",
            result: "blockedMutableEndpointAndUnbound7.0",
            evidenceRefs: refs([FILES.officialReport, FILES.officialSnapshot, FILES.officialManifest])
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
            result: "sameFamilyNoIndependentPair",
            evidenceRefs: refs([FILES.providerPolicy, FILES.gameVersionEvidence])
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
            result: "outOfScopeAndVersionUnbound",
            evidenceRefs: refs([FILES.sourceFrontiers, FILES.independentEvidence, FILES.gcsimEvidence])
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
            result: "versionUnboundIncomplete",
            evidenceRefs: refs([FILES.providerPolicy, FILES.gameVersionEvidence])
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
            result: "forbiddenCorrelated",
            evidenceRefs: refs([FILES.providerPolicy, FILES.gameVersionEvidence, "reports/genshin-optimizer-field-evidence.json"])
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
            result: "providerIndependenceUnknown",
            evidenceRefs: refs([FILES.providerPolicy, FILES.gameVersionEvidence])
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
            result: "noQualifyingStrictBundle",
            evidenceRefs: refs([FILES.providerPolicy, FILES.gameVersionEvidence])
        }
    ];
}

function providerResults(officialClaims) {
    return {
        "genshin-db": {
            candidateFieldRecord: true,
            independent: false,
            strictTargetVersionBinding: true,
            status: "primaryCorrelatedNumericObservation"
        },
        hoyowiki: {
            candidateFieldRecord: officialClaims.length > 0,
            rawClaimCount: officialClaims.length,
            strictTargetVersionBinding: false,
            status: officialClaims.length > 0 ? "rawFieldAvailableTargetVersionUnbound" : "noCandidateFieldRecord"
        },
        hoyolab: { candidateFieldRecord: false, sameIndependenceGroupAs: "official-hoyoverse", status: "sameFamilyNoSeparateCandidateRecord" },
        gcsim: { candidateFieldRecord: false, strictTargetVersionBinding: false, status: "outOfScopeNoCandidateRecord" },
        kqm: { candidateFieldRecord: false, strictTargetVersionBinding: false, status: "noCandidateFieldRecordVersionUnbound" },
        "genshin-optimizer": { candidateFieldRecord: false, lineage: "GenshinData-derived", strictTargetVersionBinding: false, status: "correlatedNoIndependentRecord" },
        "teyvatguide-yatta": { candidateFieldRecord: false, independence: "unknown", strictTargetVersionBinding: false, status: "noCandidateFieldRecord" },
        gamevika: { candidateFieldRecord: false, strictTargetVersionBinding: false, status: "noQualifyingCandidateBundle" }
    };
}

function claimRecord(record, field, officialClaim, frontier) {
    const sourceClaim = record.claims?.[field] || {};
    const source = sourceClaim.source || {};
    return {
        claimId: `${record.candidateId}:${field}`,
        field,
        claimKind: sourceClaim.claimKind || "externalFactual",
        local: sourceClaim.local ? clone(sourceClaim.local) : null,
        primaryProvider: {
            provider: source.provider || "genshin-db",
            sourceFamily: source.sourceFamily || "GenshinData-derived",
            before: sourceSide(source.before),
            after: sourceSide(source.after),
            comparison: {
                status: sourceClaim.comparison?.status || "notMaterialized",
                rawVectorStatus: sourceClaim.comparison?.rawVectorStatus || "notCompared",
                numericMatchingColumnIndexes: sourceClaim.comparison?.numericMatchingColumnIndexes || [],
                semanticIdentityEstablished: false,
                semanticMapping: null,
                supportsClaimValue: false
            }
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
    const claims = Object.fromEntries(REQUIRED_CLAIMS.map((field) => [field, claimRecord(record, field, officialByField.get(field) || null, frontier)]));
    const rawIntegrity = rawIntegrityForRecord(record);
    return {
        candidateId: id,
        entityId: record.entity?.id || null,
        entityIdentityStatus: record.entity?.identityStatus || null,
        claims,
        currentQueue: currentQueueProjection(task),
        disposition: {
            status: "evidenceDeferred",
            kind: "externalEvidenceWait",
            g06HoldEligible: true,
            certificateEligible: false,
            canonicalPromotionEligible: false,
            reason: "Numeric agreement in the primary raw records is retained as an observation only; independent immutable target-version candidate×claim evidence is absent.",
            remainingSearches: ["Reopen only when an immutable independent target-version provider artifact and exact candidate×claim field evidence are available."]
        },
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
        gate: {
            strictVerified: false,
            certificateEligible: false,
            canonicalPromotionEligible: false,
            semanticMappingSelected: false
        },
        local: clone(record.local),
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
            before: clone(record.source?.selected?.before || null),
            after: clone(record.source?.selected?.after || null)
        },
        rawIntegrity,
        providerResults: providerResults(officialClaims),
        officialRawClaims: officialClaims.map(officialClaimProjection)
    };
}

function buildAudit() {
    const inputs = loadInputs();
    const candidateIds = inputs.candidateIds;
    const candidates = Object.fromEntries(candidateIds.map((id) => [id, buildCandidate(inputs, id, {
        id: FRONTIER_ID,
        policyId: FRONTIER_POLICY_ID,
        status: "searchExhausted",
        exhausted: true,
        scopeMatched: true,
        g06HoldEligible: true,
        reopenTrigger: "A provider-owned immutable manifest binds exact revision/raw/field digests and explicit Genshin 7.0 evidence for a candidate, plus comparable candidate×claim semantics from an independent lineage; or a new provider lineage disclosure changes an existing classification."
    })]));
    const officialRawCandidates = Object.values(candidates).filter((candidate) => candidate.officialRawClaims.length > 0);
    const officialClaimCount = officialRawCandidates.reduce((total, candidate) => total + candidate.officialRawClaims.length, 0);
    const rawIntegrityValid = Object.values(candidates).filter((candidate) => candidate.rawIntegrity.valid).length;
    const rawArtifactPaths = new Set();
    for (const candidate of Object.values(candidates)) {
        for (const side of [candidate.primaryRawObservation.before, candidate.primaryRawObservation.after]) {
            if (side?.artifact?.path) rawArtifactPaths.add(side.artifact.path);
        }
    }
    const queueProjection = candidateIds.map((id) => currentQueueProjection(inputs.queueById.get(id)));
    const queueStatusCounts = queueProjection.reduce((counts, task) => {
        const key = task?.searchFrontier?.status || "missing";
        counts[key] = (counts[key] || 0) + 1;
        return counts;
    }, {});
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
        searchScope: "Exact remaining numeric-match weapon candidates after excluding registered WeaponEffectSpec Shards01-03, legacy decisions, and the separate w_12516 historical-canonical route; persisted genshin-db raw pins, official HoYoWiki capture, finite provider substitution assessments, source catalog policy, and candidate-specific repository evidence only. No network fetch or raw refetch.",
        lastSearchedAt: "2026-08-31",
        providersExamined: ["HoYoLAB", "HoYoWiki", "gcsim", "theBowja/genshin-db", "KQM", "Genshin Optimizer", "TeyvatGuide/Yatta", "GameVika"],
        negativeResult: `No second independent provider family supplies a complete immutable target-7.0 candidate×claim field bundle for this tail. HoYoWiki has ${officialRawCandidates.length} mutable raw hits; the other ${candidateIds.length - officialRawCandidates.length} have no candidate-specific independent field record in the persisted bounded inputs. No simple majority or semantic inference is used.`,
        candidateRawHitSummary: {
            hoyowikiCandidates: officialRawCandidates.length,
            hoyowikiClaimFields: officialClaimCount,
            candidatesWithoutIndependentCandidateFieldRecord: candidateIds.length - officialRawCandidates.length,
            gcsimFiniteLedgerIntersection: 0,
            strictIndependentCandidateFieldBundles: 0
        },
        reopenTrigger: "A provider-owned immutable manifest binds exact revision/raw/field digests and explicit Genshin 7.0 evidence for a candidate, plus comparable candidate×claim semantics from an independent lineage; or a new provider lineage disclosure changes an existing classification.",
        g06HoldEligible: true,
        queueIntegration: "draftOnly; current queue task frontier remains searchRequired and no queue/registry mutation is performed",
        evidenceRefs: Object.values(FILES).map((file) => refForPath(file))
    };
    // Candidate frontier objects are built with the same exact frontier metadata.
    for (const candidate of Object.values(candidates)) candidate.frontier = {
        id: frontier.id,
        policyId: frontier.policyId,
        status: frontier.status,
        exhausted: frontier.exhausted,
        scopeMatched: frontier.scopeMatched,
        g06HoldEligible: frontier.g06HoldEligible,
        candidateScoped: true,
        reopenTrigger: frontier.reopenTrigger
    };
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
            selection: "primary comparison records with numericAgreementOnlyNotSemanticIdentity and current queue consumerStatus=notApplicable, after excluding Shards01-03, legacy decisions, and w_12516, localeCompare candidateId ascending, offset 300, remaining 9",
            candidateCount: candidateIds.length,
            expectedCandidateCount: SHARD_SIZE,
            sourceNumericCandidateCount: inputs.numericIds.length,
            consumerFreeNumericCandidateCount: inputs.consumerFreeNumericIds.length,
            excludedHistoricalCandidate: HISTORICAL_CANDIDATE,
            excludedRegisteredCandidateCount: inputs.numericIds.length - inputs.consumerFreeNumericIds.length,
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
            persistedRawArtifactPathCount: rawArtifactPaths.size,
            persistedRawIntegrityValidCount: rawIntegrityValid,
            providerSubstitutionConclusion: inputs.gameVersionEvidence?.feasibilityAudit?.providerSubstitutionAssessment?.conclusion || null
        },
        frontier,
        providers: providerRows(inputs, candidateIds.length, officialRawCandidates.length, officialClaimCount),
        candidates,
        summary: {
            candidates: candidateIds.length,
            uniqueEntities: new Set(Object.values(candidates).map((candidate) => candidate.entityId).filter(Boolean)).size,
            primaryNumericMatchCandidates: candidateIds.length,
            primaryRawVersionValuesEqual: Object.values(candidates).filter((candidate) => candidate.primaryComparison.rawVersionValuesEqual).length,
            primaryRawIntegrityValidCandidates: rawIntegrityValid,
            primaryRawIntegrityInvalidCandidates: candidateIds.length - rawIntegrityValid,
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
            consumerStatus: { notApplicable: candidateIds.length },
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

function validateAudit(audit, { compareCurrent = true } = {}) {
    const reasons = [];
    if (!audit || typeof audit !== "object") return { valid: false, reasons: ["artifactMissing"] };
    if (audit.schemaVersion !== 1) reasons.push("schemaVersionInvalid");
    if (audit.kind !== "genshinR2WeaponPrimaryFieldSearchShard") reasons.push("kindInvalid");
    if (audit.status !== "draft") reasons.push("statusInvalid");
    if (audit.lane !== "weaponPrimaryNumericCandidateScopedFrontier") reasons.push("laneInvalid");
    if (audit.fieldDigestAlgorithm !== "sha256-stable-json-v1") reasons.push("fieldDigestAlgorithmInvalid");
    if (audit.fieldDigest !== digest(withoutDigest(audit))) reasons.push("fieldDigestInvalid");
    if (audit.scope?.shardId !== SHARD_ID || audit.scope?.candidateCount !== SHARD_SIZE || audit.scope?.expectedCandidateCount !== SHARD_SIZE) reasons.push("scopeCountInvalid");
    const ids = Array.isArray(audit.scope?.candidateIds) ? audit.scope.candidateIds : [];
    const candidates = audit.candidates && typeof audit.candidates === "object" && !Array.isArray(audit.candidates) ? audit.candidates : {};
    if (ids.length !== SHARD_SIZE || Object.keys(candidates).length !== SHARD_SIZE) reasons.push("candidateInventoryInvalid");
    if (digest(ids) !== audit.scope?.candidateIdDigest) reasons.push("candidateIdDigestInvalid");
    if (ids.some((id) => !Object.hasOwn(candidates, id))) reasons.push("candidateScopeBindingInvalid");
    if (audit.frontier?.id !== FRONTIER_ID || audit.frontier?.policyId !== FRONTIER_POLICY_ID
        || audit.frontier?.status !== "searchExhausted" || audit.frontier?.exhausted !== true
        || audit.frontier?.scopeMatched !== true || audit.frontier?.candidateScoped !== true
        || audit.frontier?.candidateCount !== SHARD_SIZE || audit.frontier?.candidateIdDigest !== audit.scope?.candidateIdDigest
        || digest(audit.frontier?.candidateIds || []) !== audit.scope?.candidateIdDigest
        || audit.frontier?.g06HoldEligible !== true) reasons.push("frontierNotClosed");
    if (audit.gate?.canIssueEligibilityCertificate !== false || audit.gate?.canPromoteCanonical !== false
        || audit.gate?.canSelectSemanticMapping !== false || audit.gate?.strictVerified !== false) reasons.push("gateNotFailClosed");
    if (audit.summary?.strictVerified !== 0 || audit.summary?.certificateEligible !== 0
        || audit.summary?.canonicalPromotionEligible !== 0 || audit.summary?.secondIndependentStrictCandidateCount !== 0) reasons.push("summaryGateInvalid");
    if (audit.policy?.semanticInference !== "forbidden" || audit.policy?.majorityVote !== "forbidden") reasons.push("unsafePolicy");
    for (const ref of Object.values(audit.inputEvidence?.files || {})) validateFileRef(ref, reasons);
    for (const ref of audit.frontier?.evidenceRefs || []) validateFileRef(ref, reasons);
    for (const [id, candidate] of Object.entries(candidates)) {
        if (candidate?.candidateId !== id) reasons.push(`candidateIdMismatch:${id}`);
        if (candidate?.primaryComparison?.status !== NUMERIC_STATUS || candidate?.primaryComparison?.rawVersionValuesEqual !== true) reasons.push(`candidateObservationInvalid:${id}`);
        if (candidate?.currentQueue?.consumerStatus !== "notApplicable") reasons.push(`candidateConsumerLaneInvalid:${id}`);
        if (candidate?.primaryComparison?.semanticIdentityEstablished !== false || candidate?.primaryComparison?.semanticMapping !== null) reasons.push(`candidateSemanticGateInvalid:${id}`);
        if (candidate?.frontier?.id !== FRONTIER_ID || candidate?.frontier?.status !== "searchExhausted" || candidate?.frontier?.g06HoldEligible !== true) reasons.push(`candidateFrontierInvalid:${id}`);
        if (candidate?.gate?.strictVerified !== false || candidate?.gate?.certificateEligible !== false || candidate?.gate?.canonicalPromotionEligible !== false) reasons.push(`candidateGateInvalid:${id}`);
        if (candidate?.rawIntegrity?.valid !== true) reasons.push(`candidateRawIntegrityInvalid:${id}`);
        for (const field of REQUIRED_CLAIMS) {
            const claim = candidate.claims?.[field];
            if (!claim || claim.claimId !== `${id}:${field}`) reasons.push(`claimMissing:${id}:${field}`);
            if (claim?.frontier?.id !== FRONTIER_ID || claim?.frontier?.status !== "searchExhausted" || claim?.frontier?.g06HoldEligible !== true) reasons.push(`claimFrontierInvalid:${id}:${field}`);
            if (claim?.primaryProvider?.comparison?.semanticIdentityEstablished !== false
                || claim?.primaryProvider?.comparison?.semanticMapping !== null
                || claim?.primaryProvider?.comparison?.supportsClaimValue !== false) reasons.push(`claimSemanticGateInvalid:${id}:${field}`);
            if (claim?.disposition?.certificateEligible !== false || claim?.disposition?.canonicalPromotionEligible !== false) reasons.push(`claimGateInvalid:${id}:${field}`);
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
        scope: audit.scope,
        output: rel(OUTPUT_PATH)
    }));
}

module.exports = {
    FILES,
    PRIOR_SHARDS,
    LEGACY_DECISIONS,
    OUTPUT_PATH,
    SCHEMA_PATH,
    FRONTIER_ID,
    FRONTIER_POLICY_ID,
    SHARD_OFFSET,
    SHARD_SIZE,
    REQUIRED_CLAIMS,
    stableJson,
    digest,
    buildAudit,
    validateAudit,
    writeArtifacts
};
