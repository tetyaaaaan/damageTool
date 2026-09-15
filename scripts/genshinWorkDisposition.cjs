"use strict";

// Work disposition is NOT verification evidence. It never changes certificate,
// attestation, canonical eligibility or the existing source transition task.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const POLICY = "genshin-goal-2026-08-28-r2";
const SHA = /^[a-f0-9]{64}$/;
const TRANSITION_FRONTIER_POLICY = "genshin-7.0-known-impact-55-independent-field-frontier";
// Queue progress and source-frontier registration are mutable coordination
// outputs.  They can be used to *bind* a disposition's task at validation
// time, but never qualify as immutable evidence in the disposition itself.
// Keep this list deliberately narrow: source ledgers and candidate audits are
// evidence artifacts, while these two files are regenerated coordination
// projections.
const MUTABLE_COORDINATION_ARTIFACT_PATHS = Object.freeze([
    "reports/genshin-evidence-task-queue.json",
    "games/genshin/data/v2/source-search-frontiers.json",
    "reports/genshin-candidate-source-coverage-frontier-inventory.json"
]);
// Shard01 is a separate, candidate-scoped finite frontier.  Keep its
// acceptance predicate independent from the known-impact-55 transition lane:
// a matching layer/name or a generic semantic lane must never close work.
const SHARD01_FRONTIER_POLICY = "genshin-7.0-behavior-spec-shard01-persisted-provider-frontier";
const SHARD01_CANDIDATE_ID_DIGEST = "78da81865a1dd92019c39e0a1b85cffdaae2a57e77fa68e06e6d031c4a364a47";
const SHARD01_SOURCE_AUDIT_DIGEST = "d9464b362d949de3f8f290b14b346d9dec5bfd39e9e21b467da335237647d043";
const SHARD01_ARTIFACT_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "reviews", "r2-behavior-spec-shard01-g06-deferral.json");
const SHARD01_SOURCE_AUDIT_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "reviews", "r2-behavior-spec-shard01-source-audit.json");
const SHARD01_ARTIFACT_SHA256 = "df1ede6195cd12f83d7e7d3fcd31eb738ac64054cb9c0f241d2baabc7843bfea";
// Shard02 is a separate candidate-scoped finite frontier.  These pins are
// intentionally independent from Shard01: a generic behaviorSpec semantic
// label or a matching source frontier must never authorize its dispositions.
const SHARD02_FRONTIER_POLICY = "genshin-7.0-behavior-spec-shard02-persisted-provider-frontier";
const SHARD02_CANDIDATE_ID_DIGEST = "11a2a3340cf9926db67fbb8e167786ddf4e92207a466fc2ae293150d737efce5";
const SHARD02_SOURCE_AUDIT_DIGEST = "ff74e41b4c6ea95c467fe1c110b1c9a0578ec4a142929a32580ea62350995646";
const SHARD02_ARTIFACT_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "reviews", "r2-behavior-spec-shard02-g06-deferral.json");
const SHARD02_SOURCE_AUDIT_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "reviews", "r2-behavior-spec-shard02-source-audit.json");
const SHARD02_ARTIFACT_SHA256 = "b874f5df56c52d1d0e715bdd88d51410105889b4d243847397ef969076752ace";
// Shard03 is another candidate-scoped behavior frontier.  Keep its pins
// separate from Shard01/02 so a generic behavior label or cross-shard digest
// can never authorize an external-evidence wait.
const SHARD03_FRONTIER_POLICY = "genshin-7.0-behavior-spec-shard03-persisted-provider-frontier";
const SHARD03_CANDIDATE_ID_DIGEST = "d9ca27243c3a734ec284f4b35db69e2b65ee50e0c3c1eb5cb50f709159710b3e";
const SHARD03_SOURCE_AUDIT_DIGEST = "ffef476da9e9ec40e4813b0a50c9f135ace99cead276753e0cca81eb14eff5f0";
const SHARD03_ARTIFACT_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "reviews", "r2-behavior-spec-shard03-g06-deferral.json");
const SHARD03_SOURCE_AUDIT_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "reviews", "r2-behavior-spec-shard03-source-audit.json");
const SHARD03_ARTIFACT_SHA256 = "4b6f9d689d7fa1044b3a683ba1fcd3d1c60620dd41eef478295c1ad6e9a0c8a2";
// Shard04 is a new candidate-scoped behavior frontier.  Its pins are kept
// independent from every prior shard; a generic behavior label or matching
// entity raw record must never authorize an external-evidence wait.
const SHARD04_FRONTIER_POLICY = "genshin-7.0-behavior-spec-shard04-persisted-provider-frontier";
const SHARD04_CANDIDATE_ID_DIGEST = "7fb8dde195aa42f8d88632770df014ce6f670dcc06d80c859fad1544e4e97d0a";
const SHARD04_SOURCE_AUDIT_DIGEST = "f31655c38f1fd2ea3121d475aeea918f89edaccde7cbc5125ce71be0e40674d3";
const SHARD04_ARTIFACT_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "reviews", "r2-behavior-spec-shard04-g06-deferral.json");
const SHARD04_SOURCE_AUDIT_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "reviews", "r2-behavior-spec-shard04-source-audit.json");
const SHARD04_ARTIFACT_SHA256 = "3310bec57711a8b70484dd254c8e864ecfaac2a42514b4f13055090a2e654665";
// Shard05 is the next candidate-scoped behavior frontier.  Keep its pins
// independent from every prior shard: only the exact reviewed artifact,
// source-audit digest, and candidate set may authorize its evidence wait.
const SHARD05_FRONTIER_POLICY = "genshin-7.0-behavior-spec-shard05-persisted-provider-frontier";
const SHARD05_CANDIDATE_ID_DIGEST = "9c9aa870016ca64b1a63bda32c57586b8ab7087b9ec55125e23d4c6015f7ae19";
const SHARD05_SOURCE_AUDIT_DIGEST = "bf67876a9278b022e251526e08248171a22aae87ec06834911a300d09bf0308c";
const SHARD05_ARTIFACT_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "reviews", "r2-behavior-spec-shard05-g06-deferral.json");
const SHARD05_SOURCE_AUDIT_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "reviews", "r2-behavior-spec-shard05-source-audit.json");
const SHARD05_ARTIFACT_SHA256 = "3396b363391d473c2d3ca111ab222337d8448bd36a6bc15be30fe767b600e26b";
const SHARD05_SOURCE_AUDIT_SHA256 = "f2248afda093c34af9221f77b183d4fbe9f45956858bbe2ffd63311936e9ddba";
// Shard06 is the next candidate-scoped behavior frontier.  Its pins are
// deliberately independent from Shard01-05: only the exact reviewed bytes,
// source-audit digest, and candidate set may authorize its evidence wait.
const SHARD06_FRONTIER_POLICY = "genshin-7.0-behavior-spec-shard06-persisted-provider-frontier";
const SHARD06_CANDIDATE_ID_DIGEST = "b56d38eb798907478c3c6eb5e4ab84ca387aacf6bbd32b858877a039f6ca054c";
const SHARD06_SOURCE_AUDIT_DIGEST = "fcef1b74cc6ddfbcfa4e31495425d7b85c84c0152d08bf9b0c85860246985aae";
const SHARD06_ARTIFACT_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "reviews", "r2-behavior-spec-shard06-g06-deferral.json");
const SHARD06_SOURCE_AUDIT_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "reviews", "r2-behavior-spec-shard06-source-audit.json");
const SHARD06_ARTIFACT_SHA256 = "4cf39eb83fddf408167a7d47cd49b4dac916d7c3f5e1cf81ff59668f9f75260b";
const SHARD06_SOURCE_AUDIT_SHA256 = "78dcaee081473d99a04df7931adafeaf456f77f879feba4e003c1d60151cf615";
// The weapon shard is intentionally a separate predicate from both the
// known-impact transition lane and the behavior shard.  These values bind a
// disposition to the exact, already-reviewed 100-candidate draft artifact;
// a generic "numeric match" or searchExhausted label is never sufficient.
const WEAPON_SHARD01_FRONTIER_ID = "weapons-primary-numeric-shard01-independent-field-frontier-7.0";
const WEAPON_SHARD01_FRONTIER_POLICY = "genshin-7.0-weapon-primary-numeric-shard-independent-field-frontier";
const WEAPON_SHARD01_CANDIDATE_ID_DIGEST = "829758b116455828f3009fd1dcd7e9dacbe59ab7a716d2ad92eda7b09252a146";
const WEAPON_SHARD01_SOURCE_AUDIT_DIGEST = "21b99b37ef406aabc154aa507095addaca32694b10638fca658b86c3e5d97c6f";
const WEAPON_SHARD01_ARTIFACT_PATH = "games/genshin/data/v2/reviews/r2-weapon-primary-field-search-shard01.json";
const WEAPON_SHARD01_ARTIFACT_SHA256 = "248e62c5587ef21ef88d481e598857af65fc43f3783e8825cdf5067ad047e58b";
const WEAPON_SHARD02_FRONTIER_ID = "weapons-primary-numeric-shard02-independent-field-frontier-7.0";
const WEAPON_SHARD02_FRONTIER_POLICY = "genshin-7.0-weapon-primary-numeric-shard-independent-field-frontier";
const WEAPON_SHARD02_CANDIDATE_ID_DIGEST = "d247d68d39d9472e1add23e7cf6d4be6e14b31ee76b1dcf314f1a30a63fe4e9b";
const WEAPON_SHARD02_SOURCE_AUDIT_DIGEST = "76f3b3ea1dd00324b4782532b08200ec2450dad4fb8fa3a9159bf7d366845f94";
const WEAPON_SHARD02_ARTIFACT_PATH = "games/genshin/data/v2/reviews/r2-weapon-primary-field-search-shard02.json";
const WEAPON_SHARD02_ARTIFACT_SHA256 = "6ee94161af04ceafb0596e764db4d65839ebbf499e6af329211bd7f09f371d69";
const WEAPON_SHARD03_FRONTIER_ID = "weapons-primary-numeric-shard03-independent-field-frontier-7.0";
const WEAPON_SHARD03_FRONTIER_POLICY = "genshin-7.0-weapon-primary-numeric-shard-independent-field-frontier";
const WEAPON_SHARD03_CANDIDATE_ID_DIGEST = "eb45ad124d38610a7a468e7e895d19a6e47bb387d46316c060f004b1c6d391b1";
const WEAPON_SHARD03_SOURCE_AUDIT_DIGEST = "5f81c2deefcfa845764caa056ccea5d3aa691f444931099dfcf511103b1301ca";
const WEAPON_SHARD03_ARTIFACT_PATH = "games/genshin/data/v2/reviews/r2-weapon-primary-field-search-shard03.json";
const WEAPON_SHARD03_ARTIFACT_SHA256 = "e9412205156019f3d32d1189f5c5862b419f01bb16a6b885f0a71dc40fb62d3e";
const WEAPON_SHARD04_FRONTIER_ID = "weapons-primary-numeric-shard04-independent-field-frontier-7.0";
const WEAPON_SHARD04_FRONTIER_POLICY = "genshin-7.0-weapon-primary-numeric-shard-independent-field-frontier";
const WEAPON_SHARD04_CANDIDATE_ID_DIGEST = "1477137ea0a5dd691bf717cc4e6dbeb69e057e4fb74c667d907d2d1c75c3a63f";
const WEAPON_SHARD04_SOURCE_AUDIT_DIGEST = "624492cc0bff665016b28d5fca5f3379be95f9858b21e831383512112ef8db27";
const WEAPON_SHARD04_ARTIFACT_PATH = "games/genshin/data/v2/reviews/r2-weapon-primary-field-search-shard04.json";
const WEAPON_SHARD04_ARTIFACT_SHA256 = "c8639d36e6433c5414219581005f8192d5a242f7998f7f5ec39f8c6a6d672545";
const REQUIRED_WEAPON_SHARD_CLAIMS = Object.freeze(["activation", "refinement", "targets", "value"]);
const EXTERNAL_MECHANIC_CLAIMS = Object.freeze([
    "sourceText", "timing", "execution", "lifecycle", "energy", "snapshot",
    "effectKind", "targets", "activation", "value"
]);
const INTERNAL_METADATA_CLAIMS = Object.freeze(["runtime", "runtimeEligibility"]);
const TRANSITION_CLAIM_SCHEMA_MISSING_FALLBACK_CANDIDATES = new Set([
    "behavior:10000058:constellation:constellation-1",
    "behavior:10000058:constellation:constellation-4",
    "behavior:10000058:talent:burst",
    "behavior:10000058:talent:normalattack-normal",
    "behavior:10000058:talent:skill"
]);
const REQUIRED_MILESTONES = Object.freeze([
    "A.finiteScope", "A.verificationIntegration", "A.versionTransition",
    "B.calculationCoverage", "C.regression", "C.hsrUnchanged"
]);
const stable = (value) => Array.isArray(value) ? value.map(stable)
    : value && typeof value === "object"
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
        : value;
const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
const text = (value) => typeof value === "string" && value.trim().length > 0;
const date = (value) => text(value) && Number.isFinite(Date.parse(value));
const allText = (value) => Array.isArray(value) && value.length > 0 && value.every(text);
const uniqueTextList = (value) => allText(value) && new Set(value).size === value.length;
const optionalTextList = (value) => Array.isArray(value) && value.every(text)
    && new Set(value).size === value.length;
const sameList = (left, right) => digest(left || []) === digest(right || []);
const countBy = (list) => Object.fromEntries([...new Set(list)].sort().map((x) => [x, list.filter((v) => v === x).length]));
const normalizedArtifactPath = (value) => String(value || "").replaceAll("\\", "/");
const isMutableCoordinationArtifactPath = (value) => {
    const normalized = normalizedArtifactPath(value);
    return MUTABLE_COORDINATION_ARTIFACT_PATHS.includes(normalized)
        || /(?:^|\/)(?:genshin-evidence-task-queue|source-search-frontiers|genshin-candidate-source-coverage-frontier-inventory)\.json$/iu.test(normalized);
};

function taskDigest(task) {
    const payload = {
        candidateId: task.candidateId, layer: task.layer || null,
        dataset: task.dataset || null, terminalState: task.terminalState,
        task: task.task, blockReasons: task.blockReasons || [],
        searchFrontier: task.searchFrontier, certificate: task.certificate,
        deferredLanes: task.deferredLanes || [],
        officialVersionImpact: task.officialVersionImpact || null,
        bulkTransitionCapture: task.bulkTransitionCapture || null,
        mappingStatus: task.mappingStatus || null, consumerStatus: task.consumerStatus || null
    };
    return digest(payload);
}

/**
 * The transition queue has one deliberately narrow kind of deferred lane:
 * the 47 already-mapped 7.0 candidates whose remaining work is an external
 * mechanic-evidence wait.  This predicate is intentionally strict.  A
 * deferred lane is never accepted merely because it says "semantic"; the
 * candidate must be on the recorded finite frontier, have no identity or
 * consumer work, and have only the known evidence blockers.
 */
function isAllowedExternalEvidenceWait(task) {
    const laneList = Array.isArray(task?.deferredLanes) ? task.deferredLanes : [];
    if (laneList.length !== 1) return false;
    const lane = laneList[0];
    if (lane?.kind !== "semanticDecision" || lane?.status !== "deferred") return false;
    if (digest(lane.blockingReasons || []) !== digest(["semanticDecisionRequired"])) return false;
    if (!["behaviorSpec", "talentGapEffectSpec"].includes(task?.layer)) return false;
    if (!["conservativeEntityInvalidation", "exactCandidateMapped"].includes(task?.transitionLane)) return false;
    if (!["conservativeEntityInvalidation", "exactCandidateMapped"].includes(task?.officialVersionImpact?.mappingStatus)) return false;
    if (typeof task?.dataset !== "string" || task.dataset.trim().length === 0) return false;
    if (!['unknownUntilEntityDiff', 'allCandidateClaimsReacquire'].includes(task?.officialVersionImpact?.claimScope)) return false;
    if (task?.task?.kind !== "sourceProvider" || task?.task?.status !== "reopenOnTrigger") return false;
    if (task?.task?.reason !== "versionOrProviderCoverageDrift") return false;
    if (task?.task?.autoProcessableNow === true || task?.autoProcessableNow === true) return false;
    const frontier = task?.searchFrontier;
    if (frontier?.policyId !== TRANSITION_FRONTIER_POLICY
        || frontier?.status !== "searchExhausted"
        || frontier?.exhausted !== true
        || frontier?.scopeMatched !== true) return false;
    if (task?.transitionProviderCaptureStatus !== "targetDisplayRecordCapturedNoMechanicFieldEvidence") return false;
    if (!["available", "missing"].includes(task?.transitionClaimSchemaStatus)) return false;
    if (task.transitionClaimSchemaStatus === "missing"
        && !TRANSITION_CLAIM_SCHEMA_MISSING_FALLBACK_CANDIDATES.has(task.candidateId)) return false;
    if (!["pending", "prepared"].includes(task?.mappingStatus)) return false;
    if (task?.consumerStatus !== "notApplicable") return false;
    if (task?.identityConsistency?.blocked === true || task?.identityConsistency?.status !== "clear") return false;
    if (task?.fieldComparison?.hasMismatch === true || (task?.fieldComparison?.statuses || []).length > 0) return false;
    if (task?.certificate?.strictEligible === true || task?.certificate?.certificate?.strictEligible === true) return false;
    const forbidden = new Set([
        "consumerMissing", "consumerImplementationGap", "mappingPending", "mappingAmbiguous",
        "identityAmbiguous", "sourceDiscrepancy", "schemaGap", "inputMissing", "unsupported"
    ]);
    if ((task?.blockReasons || []).some((reason) => forbidden.has(String(reason)))) return false;
    if (!(task?.blockReasons || []).includes("semanticDecisionRequired")) return false;
    return true;
}

let shard01CandidateCache;
let shard01CandidateEvidenceCache;
function shard01CandidateSet() {
    if (shard01CandidateCache !== undefined) return shard01CandidateCache;
    shard01CandidateCache = null;
    shard01CandidateEvidenceCache = null;
    try {
        const artifactBytes = fs.readFileSync(SHARD01_ARTIFACT_PATH);
        if (crypto.createHash("sha256").update(artifactBytes).digest("hex") !== SHARD01_ARTIFACT_SHA256) return shard01CandidateCache;
        const artifact = JSON.parse(artifactBytes.toString("utf8"));
        const sourceAuditBytes = fs.readFileSync(SHARD01_SOURCE_AUDIT_PATH);
        const sourceAudit = JSON.parse(sourceAuditBytes.toString("utf8"));
        const ids = artifact?.scope?.candidateIds;
        if (!Array.isArray(ids) || ids.length !== 100 || new Set(ids).size !== 100
            || digest([...ids].map(String).sort()) !== SHARD01_CANDIDATE_ID_DIGEST
            || artifact?.scope?.candidateIdDigest !== SHARD01_CANDIDATE_ID_DIGEST
            || artifact?.frontier?.id !== SHARD01_FRONTIER_POLICY
            || artifact?.frontier?.candidateIdDigest !== SHARD01_CANDIDATE_ID_DIGEST
            || artifact?.frontier?.sourceAuditDigest !== SHARD01_SOURCE_AUDIT_DIGEST
            || artifact?.evidence?.sourceAudit?.sha256 !== crypto.createHash("sha256").update(sourceAuditBytes).digest("hex")
            || sourceAudit?.fieldDigest !== SHARD01_SOURCE_AUDIT_DIGEST
            || sourceAudit?.scope?.candidateIdDigest !== SHARD01_CANDIDATE_ID_DIGEST
            || digest((sourceAudit.scope?.candidateIds || []).map(String).sort()) !== SHARD01_CANDIDATE_ID_DIGEST
            || sourceAudit?.summary?.identityGapCandidateCount !== 0
            || sourceAudit?.summary?.localClaimSchemaGapCandidateCount !== 0
            || sourceAudit?.summary?.rawIntegrityGapCandidateCount !== 0
            || sourceAudit?.summary?.rawIntegrityVerifiedCandidateCount !== 100
            || artifact?.summary?.candidateCount !== 100
            || artifact?.summary?.candidateScopedFrontierProvenCandidateCount !== 100
            || artifact?.summary?.candidateFieldEvidenceClaimCount !== 0
            || artifact?.summary?.strictVerifiedCandidateCount !== 0
            || artifact?.summary?.certificateEligibleClaimCount !== 0
            || artifact?.summary?.canonicalPromotionEligibleCandidateCount !== 0
            || artifact?.evidence?.rawIntegrityVerifiedCandidateCount !== 100
            || artifact?.evidence?.rawIntegrityGapCandidateCount !== 0) return shard01CandidateCache;
        const sourceCandidates = new Map((sourceAudit.candidates || []).map((candidate) => [String(candidate?.candidateId), candidate]));
        const draftCandidates = new Map((artifact.evidence?.candidateEvidence || []).map((candidate) => [String(candidate?.candidateId), candidate]));
        for (const id of ids.map(String)) {
            const candidate = sourceCandidates.get(id);
            const draft = draftCandidates.get(id);
            const before = candidate?.rawEntityEvidence?.before;
            const after = candidate?.rawEntityEvidence?.after;
            if (!candidate || !draft
                || candidate.identity?.status !== "resolvedUnambiguous"
                || candidate.internalConnection?.identityGap !== false
                || candidate.internalConnection?.localClaimSchemaGap !== false
                || candidate.internalConnection?.rawIntegrityGap !== false
                || candidate.rawEntityEvidence?.status !== "verified"
                || before?.integrityVerified !== true || before?.jsonValid !== true
                || after?.integrityVerified !== true || after?.jsonValid !== true
                || draft.identity?.status !== "resolvedUnambiguous"
                || draft.rawEntityEvidence?.status !== "verified") return shard01CandidateCache;
        }
        shard01CandidateEvidenceCache = sourceCandidates;
        shard01CandidateCache = new Set(ids.map(String));
    } catch (_) {
        // The predicate is fail-closed when its candidate-scoped artifact is
        // absent, malformed, or not yet generated.
    }
    return shard01CandidateCache;
}

function isAllowedShard01ExternalEvidenceWait(task) {
    const laneList = Array.isArray(task?.deferredLanes) ? task.deferredLanes : [];
    if (laneList.length !== 1) return false;
    const lane = laneList[0];
    if (lane?.kind !== "semanticDecision" || lane?.status !== "deferred"
        || digest(lane.blockingReasons || []) !== digest(["semanticDecisionRequired"])) return false;
    if (task?.layer !== "behaviorSpec" || typeof task?.dataset !== "string" || task.dataset.trim().length === 0) return false;
    const candidateSet = shard01CandidateSet();
    if (!candidateSet || !candidateSet.has(String(task.candidateId))) return false;
    if (task?.terminalState !== "blocked" || task?.primaryBlockReason !== "semanticDecisionRequired") return false;
    if (task?.task?.kind !== "sourceProvider" || task?.task?.status !== "reopenOnTrigger"
        || task?.task?.reason !== "semanticDecisionRequired"
        || task?.task?.autoProcessableNow === true || task?.autoProcessableNow === true) return false;
    const frontier = task?.searchFrontier;
    if (frontier?.policyId !== SHARD01_FRONTIER_POLICY || frontier?.status !== "searchExhausted"
        || frontier?.exhausted !== true || frontier?.scopeMatched !== true
        || frontier?.scopeUnit !== "candidate-field-set"
        || frontier?.frontierId !== SHARD01_FRONTIER_POLICY
        || frontier?.candidateIdDigest !== SHARD01_CANDIDATE_ID_DIGEST
        || !Array.isArray(frontier?.candidateIds) || frontier.candidateIds.length !== 100
        || digest(frontier.candidateIds.map(String).sort()) !== SHARD01_CANDIDATE_ID_DIGEST
        || frontier?.sourceAuditDigest !== SHARD01_SOURCE_AUDIT_DIGEST
        || !Array.isArray(frontier.providersExamined) || frontier.providersExamined.length !== 9
        || new Set(frontier.providersExamined).size !== 9
        || !text(frontier.searchScope) || !date(frontier.lastSearchedAt)
        || !text(frontier.reopenTrigger)) return false;
    const candidateEvidence = shard01CandidateEvidenceCache?.get(String(task.candidateId));
    if (!candidateEvidence) return false;
    if (task?.identityConsistency?.blocked === true || task?.identityConsistency?.status !== "clear"
        || task?.identityConsistency?.consumerCoverageGap === true) return false;
    if (task?.bulkTransitionCapture?.sourceFamily !== "GenshinData-derived"
        || task?.bulkTransitionCapture?.status !== "targetDisplayRecordCapturedSingleCorrelatedFamily") return false;
    if (task?.fieldComparison?.hasMismatch === true || (task?.fieldComparison?.statuses || []).length > 0) return false;
    if (task?.certificate?.strictEligible === true || task?.certificate?.certificate?.strictEligible === true) return false;
    const requiredBlockReasons = new Set(["sourceMissing", "gameVersionUnbound", "providerIndependenceCorrelated", "semanticDecisionRequired"]);
    const blockReasons = Array.isArray(task?.blockReasons) ? task.blockReasons.map(String) : [];
    if (blockReasons.length !== requiredBlockReasons.size || blockReasons.some((reason) => !requiredBlockReasons.has(reason))) return false;
    return true;
}

let shard02CandidateCache;
let shard02CandidateEvidenceCache;
function shard02CandidateSet() {
    if (shard02CandidateCache !== undefined) return shard02CandidateCache;
    shard02CandidateCache = null;
    shard02CandidateEvidenceCache = null;
    try {
        const artifactBytes = fs.readFileSync(SHARD02_ARTIFACT_PATH);
        if (crypto.createHash("sha256").update(artifactBytes).digest("hex") !== SHARD02_ARTIFACT_SHA256) return shard02CandidateCache;
        const artifact = JSON.parse(artifactBytes.toString("utf8"));
        const sourceAuditBytes = fs.readFileSync(SHARD02_SOURCE_AUDIT_PATH);
        const sourceAudit = JSON.parse(sourceAuditBytes.toString("utf8"));
        const ids = artifact?.scope?.candidateIds;
        if (!Array.isArray(ids) || ids.length !== 100 || new Set(ids).size !== 100
            || digest([...ids].map(String).sort()) !== SHARD02_CANDIDATE_ID_DIGEST
            || artifact?.scope?.candidateIdDigest !== SHARD02_CANDIDATE_ID_DIGEST
            || artifact?.frontier?.id !== SHARD02_FRONTIER_POLICY
            || artifact?.frontier?.candidateIdDigest !== SHARD02_CANDIDATE_ID_DIGEST
            || artifact?.frontier?.sourceAuditDigest !== SHARD02_SOURCE_AUDIT_DIGEST
            || artifact?.evidence?.sourceAudit?.sha256 !== crypto.createHash("sha256").update(sourceAuditBytes).digest("hex")
            || sourceAudit?.fieldDigest !== SHARD02_SOURCE_AUDIT_DIGEST
            || sourceAudit?.scope?.candidateIdDigest !== SHARD02_CANDIDATE_ID_DIGEST
            || digest((sourceAudit.scope?.candidateIds || []).map(String).sort()) !== SHARD02_CANDIDATE_ID_DIGEST
            || sourceAudit?.summary?.identityGapCandidateCount !== 0
            || sourceAudit?.summary?.localClaimSchemaGapCandidateCount !== 0
            || sourceAudit?.summary?.rawIntegrityGapCandidateCount !== 0
            || sourceAudit?.summary?.rawIntegrityVerifiedCandidateCount !== 100
            || artifact?.summary?.candidateCount !== 100
            || artifact?.summary?.candidateScopedFrontierProvenCandidateCount !== 100
            || artifact?.summary?.candidateFieldEvidenceClaimCount !== 0
            || artifact?.summary?.strictVerifiedCandidateCount !== 0
            || artifact?.summary?.certificateEligibleClaimCount !== 0
            || artifact?.summary?.canonicalPromotionEligibleCandidateCount !== 0
            || artifact?.evidence?.rawIntegrityVerifiedCandidateCount !== 100
            || artifact?.evidence?.rawIntegrityGapCandidateCount !== 0) return shard02CandidateCache;
        const sourceCandidates = new Map((sourceAudit.candidates || []).map((candidate) => [String(candidate?.candidateId), candidate]));
        const draftCandidates = new Map((artifact.evidence?.candidateEvidence || []).map((candidate) => [String(candidate?.candidateId), candidate]));
        for (const id of ids.map(String)) {
            const candidate = sourceCandidates.get(id);
            const draft = draftCandidates.get(id);
            const before = candidate?.rawEntityEvidence?.before;
            const after = candidate?.rawEntityEvidence?.after;
            if (!candidate || !draft
                || !["resolvedUnambiguous", "resolvedUnambiguousByProviderName"].includes(candidate.identity?.status)
                || candidate.internalConnection?.identityGap !== false
                || candidate.internalConnection?.localClaimSchemaGap !== false
                || candidate.internalConnection?.rawIntegrityGap !== false
                || candidate.rawEntityEvidence?.status !== "verified"
                || before?.integrityVerified !== true || before?.jsonValid !== true
                || after?.integrityVerified !== true || after?.jsonValid !== true
                || !["resolvedUnambiguous", "resolvedUnambiguousByProviderName"].includes(draft.identity?.status)
                || draft.rawEntityEvidence?.status !== "verified") return shard02CandidateCache;
        }
        shard02CandidateEvidenceCache = sourceCandidates;
        shard02CandidateCache = new Set(ids.map(String));
    } catch (_) {
        // Keep the central predicate fail-closed when either pinned artifact
        // is missing, malformed, or no longer matches its reviewed bytes.
    }
    return shard02CandidateCache;
}

/**
 * Exact candidate-scoped behaviorSpec predicate for shard02.  This is kept
 * separate from shard01 so a stale or cross-shard digest can never authorize
 * a disposition through a generic layer/source label.
 */
function isAllowedShard02ExternalEvidenceWait(task) {
    const laneList = Array.isArray(task?.deferredLanes) ? task.deferredLanes : [];
    if (laneList.length !== 1) return false;
    const lane = laneList[0];
    if (lane?.kind !== "semanticDecision" || lane?.status !== "deferred"
        || digest(lane.blockingReasons || []) !== digest(["semanticDecisionRequired"])) return false;
    if (task?.layer !== "behaviorSpec" || typeof task?.dataset !== "string" || task.dataset.trim().length === 0) return false;
    const candidateSet = shard02CandidateSet();
    if (!candidateSet || !candidateSet.has(String(task.candidateId))) return false;
    if (task?.terminalState !== "blocked" || task?.primaryBlockReason !== "semanticDecisionRequired") return false;
    if (task?.task?.kind !== "sourceProvider" || task?.task?.status !== "reopenOnTrigger"
        || task?.task?.reason !== "semanticDecisionRequired"
        || task?.task?.autoProcessableNow === true || task?.autoProcessableNow === true) return false;
    const frontier = task?.searchFrontier;
    if (frontier?.policyId !== SHARD02_FRONTIER_POLICY || frontier?.status !== "searchExhausted"
        || frontier?.exhausted !== true || frontier?.scopeMatched !== true
        || frontier?.scopeUnit !== "candidate-field-set"
        || frontier?.frontierId !== SHARD02_FRONTIER_POLICY
        || frontier?.candidateIdDigest !== SHARD02_CANDIDATE_ID_DIGEST
        || !Array.isArray(frontier?.candidateIds) || frontier.candidateIds.length !== 100
        || digest(frontier.candidateIds.map(String).sort()) !== SHARD02_CANDIDATE_ID_DIGEST
        || frontier?.sourceAuditDigest !== SHARD02_SOURCE_AUDIT_DIGEST
        || !Array.isArray(frontier.providersExamined) || frontier.providersExamined.length !== 9
        || new Set(frontier.providersExamined).size !== 9
        || !text(frontier.searchScope) || !date(frontier.lastSearchedAt)
        || !text(frontier.reopenTrigger)) return false;
    const candidateEvidence = shard02CandidateEvidenceCache?.get(String(task.candidateId));
    if (!candidateEvidence) return false;
    if (task?.identityConsistency?.blocked === true || task?.identityConsistency?.status !== "clear"
        || task?.identityConsistency?.consumerCoverageGap === true) return false;
    if (task?.bulkTransitionCapture?.sourceFamily !== "GenshinData-derived"
        || task?.bulkTransitionCapture?.status !== "targetDisplayRecordCapturedSingleCorrelatedFamily") return false;
    if (task?.fieldComparison?.hasMismatch === true || (task?.fieldComparison?.statuses || []).length > 0) return false;
    if (task?.certificate?.strictEligible === true || task?.certificate?.certificate?.strictEligible === true) return false;
    const requiredBlockReasons = new Set(["sourceMissing", "gameVersionUnbound", "providerIndependenceCorrelated", "semanticDecisionRequired"]);
    const blockReasons = Array.isArray(task?.blockReasons) ? task.blockReasons.map(String) : [];
    if (blockReasons.length !== requiredBlockReasons.size || blockReasons.some((reason) => !requiredBlockReasons.has(reason))) return false;
    return true;
}

let shard03CandidateCache;
let shard03CandidateEvidenceCache;
function shard03CandidateSet() {
    if (shard03CandidateCache !== undefined) return shard03CandidateCache;
    shard03CandidateCache = null;
    shard03CandidateEvidenceCache = null;
    try {
        const artifactBytes = fs.readFileSync(SHARD03_ARTIFACT_PATH);
        if (crypto.createHash("sha256").update(artifactBytes).digest("hex") !== SHARD03_ARTIFACT_SHA256) return shard03CandidateCache;
        const artifact = JSON.parse(artifactBytes.toString("utf8"));
        const sourceAuditBytes = fs.readFileSync(SHARD03_SOURCE_AUDIT_PATH);
        const sourceAudit = JSON.parse(sourceAuditBytes.toString("utf8"));
        const ids = artifact?.scope?.candidateIds;
        if (!Array.isArray(ids) || ids.length !== 100 || new Set(ids).size !== 100
            || digest([...ids].map(String).sort()) !== SHARD03_CANDIDATE_ID_DIGEST
            || artifact?.scope?.candidateIdDigest !== SHARD03_CANDIDATE_ID_DIGEST
            || artifact?.frontier?.id !== SHARD03_FRONTIER_POLICY
            || artifact?.frontier?.candidateIdDigest !== SHARD03_CANDIDATE_ID_DIGEST
            || artifact?.frontier?.sourceAuditDigest !== SHARD03_SOURCE_AUDIT_DIGEST
            || artifact?.evidence?.sourceAudit?.sha256 !== crypto.createHash("sha256").update(sourceAuditBytes).digest("hex")
            || sourceAudit?.fieldDigest !== SHARD03_SOURCE_AUDIT_DIGEST
            || sourceAudit?.scope?.candidateIdDigest !== SHARD03_CANDIDATE_ID_DIGEST
            || digest((sourceAudit.scope?.candidateIds || []).map(String).sort()) !== SHARD03_CANDIDATE_ID_DIGEST
            || sourceAudit?.summary?.identityGapCandidateCount !== 0
            || sourceAudit?.summary?.localClaimSchemaGapCandidateCount !== 0
            || sourceAudit?.summary?.rawIntegrityGapCandidateCount !== 0
            || sourceAudit?.summary?.rawIntegrityVerifiedCandidateCount !== 100
            || artifact?.summary?.candidateCount !== 100
            || artifact?.summary?.candidateScopedFrontierProvenCandidateCount !== 100
            || artifact?.summary?.candidateFieldEvidenceClaimCount !== 0
            || artifact?.summary?.strictVerifiedCandidateCount !== 0
            || artifact?.summary?.certificateEligibleClaimCount !== 0
            || artifact?.summary?.canonicalPromotionEligibleCandidateCount !== 0
            || artifact?.evidence?.rawIntegrityVerifiedCandidateCount !== 100
            || artifact?.evidence?.rawIntegrityGapCandidateCount !== 0) return shard03CandidateCache;
        const sourceCandidates = new Map((sourceAudit.candidates || []).map((candidate) => [String(candidate?.candidateId), candidate]));
        const draftCandidates = new Map((artifact.evidence?.candidateEvidence || []).map((candidate) => [String(candidate?.candidateId), candidate]));
        for (const id of ids.map(String)) {
            const candidate = sourceCandidates.get(id);
            const draft = draftCandidates.get(id);
            const before = candidate?.rawEntityEvidence?.before;
            const after = candidate?.rawEntityEvidence?.after;
            if (!candidate || !draft
                || !["resolvedUnambiguous", "resolvedUnambiguousByProviderName"].includes(candidate.identity?.status)
                || candidate.internalConnection?.identityGap !== false
                || candidate.internalConnection?.localClaimSchemaGap !== false
                || candidate.internalConnection?.rawIntegrityGap !== false
                || candidate.rawEntityEvidence?.status !== "verified"
                || before?.integrityVerified !== true || before?.jsonValid !== true
                || after?.integrityVerified !== true || after?.jsonValid !== true
                || !["resolvedUnambiguous", "resolvedUnambiguousByProviderName"].includes(draft.identity?.status)
                || draft.rawEntityEvidence?.status !== "verified") return shard03CandidateCache;
        }
        shard03CandidateEvidenceCache = sourceCandidates;
        shard03CandidateCache = new Set(ids.map(String));
    } catch (_) {
        // Keep the central predicate fail-closed when either pinned artifact
        // is absent, malformed, or no longer matches the reviewed bytes.
    }
    return shard03CandidateCache;
}

/** Exact candidate-scoped behaviorSpec predicate for shard03. */
function isAllowedShard03ExternalEvidenceWait(task) {
    const laneList = Array.isArray(task?.deferredLanes) ? task.deferredLanes : [];
    if (laneList.length !== 1) return false;
    const lane = laneList[0];
    if (lane?.kind !== "semanticDecision" || lane?.status !== "deferred"
        || digest(lane.blockingReasons || []) !== digest(["semanticDecisionRequired"])) return false;
    if (task?.layer !== "behaviorSpec" || typeof task?.dataset !== "string" || task.dataset.trim().length === 0) return false;
    const candidateSet = shard03CandidateSet();
    if (!candidateSet || !candidateSet.has(String(task.candidateId))) return false;
    if (task?.terminalState !== "blocked" || task?.primaryBlockReason !== "semanticDecisionRequired") return false;
    if (task?.task?.kind !== "sourceProvider" || task?.task?.status !== "reopenOnTrigger"
        || task?.task?.reason !== "semanticDecisionRequired"
        || task?.task?.autoProcessableNow === true || task?.autoProcessableNow === true) return false;
    const frontier = task?.searchFrontier;
    if (frontier?.policyId !== SHARD03_FRONTIER_POLICY || frontier?.status !== "searchExhausted"
        || frontier?.exhausted !== true || frontier?.scopeMatched !== true
        // Terminal projections normalize every registered candidate frontier
        // to the task-level candidate-field-set unit; the immutable shard
        // artifact may describe its search as candidate×claim.
        || frontier?.scopeUnit !== "candidate-field-set"
        || frontier?.frontierId !== SHARD03_FRONTIER_POLICY
        || frontier?.candidateIdDigest !== SHARD03_CANDIDATE_ID_DIGEST
        || !Array.isArray(frontier?.candidateIds) || frontier.candidateIds.length !== 100
        || digest(frontier.candidateIds.map(String).sort()) !== SHARD03_CANDIDATE_ID_DIGEST
        || frontier?.sourceAuditDigest !== SHARD03_SOURCE_AUDIT_DIGEST
        || !Array.isArray(frontier.providersExamined) || frontier.providersExamined.length !== 9
        || new Set(frontier.providersExamined).size !== 9
        || !text(frontier.searchScope) || !date(frontier.lastSearchedAt)
        || !text(frontier.reopenTrigger)) return false;
    const candidateEvidence = shard03CandidateEvidenceCache?.get(String(task.candidateId));
    if (!candidateEvidence) return false;
    if (task?.identityConsistency?.blocked === true || task?.identityConsistency?.status !== "clear"
        || task?.identityConsistency?.consumerCoverageGap === true) return false;
    if (task?.bulkTransitionCapture?.sourceFamily !== "GenshinData-derived"
        || task?.bulkTransitionCapture?.status !== "targetDisplayRecordCapturedSingleCorrelatedFamily") return false;
    if (task?.fieldComparison?.hasMismatch === true || (task?.fieldComparison?.statuses || []).length > 0) return false;
    if (task?.certificate?.strictEligible === true || task?.certificate?.certificate?.strictEligible === true) return false;
    const requiredBlockReasons = new Set(["sourceMissing", "gameVersionUnbound", "providerIndependenceCorrelated", "semanticDecisionRequired"]);
    const blockReasons = Array.isArray(task?.blockReasons) ? task.blockReasons.map(String) : [];
    if (blockReasons.length !== requiredBlockReasons.size || blockReasons.some((reason) => !requiredBlockReasons.has(reason))) return false;
    return true;
}

let shard04CandidateCache;
let shard04CandidateEvidenceCache;
function shard04CandidateSet() {
    if (shard04CandidateCache !== undefined) return shard04CandidateCache;
    shard04CandidateCache = null;
    shard04CandidateEvidenceCache = null;
    try {
        const artifactBytes = fs.readFileSync(SHARD04_ARTIFACT_PATH);
        if (crypto.createHash("sha256").update(artifactBytes).digest("hex") !== SHARD04_ARTIFACT_SHA256) return shard04CandidateCache;
        const artifact = JSON.parse(artifactBytes.toString("utf8"));
        const sourceAuditBytes = fs.readFileSync(SHARD04_SOURCE_AUDIT_PATH);
        const sourceAudit = JSON.parse(sourceAuditBytes.toString("utf8"));
        const ids = artifact?.scope?.candidateIds;
        if (!Array.isArray(ids) || ids.length !== 100 || new Set(ids).size !== 100
            || digest([...ids].map(String).sort()) !== SHARD04_CANDIDATE_ID_DIGEST
            || artifact?.scope?.candidateIdDigest !== SHARD04_CANDIDATE_ID_DIGEST
            || artifact?.frontier?.id !== SHARD04_FRONTIER_POLICY
            || artifact?.frontier?.candidateIdDigest !== SHARD04_CANDIDATE_ID_DIGEST
            || artifact?.frontier?.sourceAuditDigest !== SHARD04_SOURCE_AUDIT_DIGEST
            || artifact?.evidence?.sourceAudit?.sha256 !== crypto.createHash("sha256").update(sourceAuditBytes).digest("hex")
            || sourceAudit?.fieldDigest !== SHARD04_SOURCE_AUDIT_DIGEST
            || sourceAudit?.scope?.candidateIdDigest !== SHARD04_CANDIDATE_ID_DIGEST
            || digest((sourceAudit.scope?.candidateIds || []).map(String).sort()) !== SHARD04_CANDIDATE_ID_DIGEST
            || sourceAudit?.summary?.identityGapCandidateCount !== 0
            || sourceAudit?.summary?.localClaimSchemaGapCandidateCount !== 0
            || sourceAudit?.summary?.rawIntegrityGapCandidateCount !== 0
            || sourceAudit?.summary?.rawIntegrityVerifiedCandidateCount !== 100
            || artifact?.summary?.candidateCount !== 100
            || artifact?.summary?.candidateScopedFrontierProvenCandidateCount !== 100
            || artifact?.summary?.candidateFieldEvidenceClaimCount !== 0
            || artifact?.summary?.strictVerifiedCandidateCount !== 0
            || artifact?.summary?.certificateEligibleClaimCount !== 0
            || artifact?.summary?.canonicalPromotionEligibleCandidateCount !== 0
            || artifact?.evidence?.rawIntegrityVerifiedCandidateCount !== 100
            || artifact?.evidence?.rawIntegrityGapCandidateCount !== 0) return shard04CandidateCache;
        const sourceCandidates = new Map((sourceAudit.candidates || []).map((candidate) => [String(candidate?.candidateId), candidate]));
        const draftCandidates = new Map((artifact.evidence?.candidateEvidence || []).map((candidate) => [String(candidate?.candidateId), candidate]));
        for (const id of ids.map(String)) {
            const candidate = sourceCandidates.get(id);
            const draft = draftCandidates.get(id);
            const before = candidate?.rawEntityEvidence?.before;
            const after = candidate?.rawEntityEvidence?.after;
            if (!candidate || !draft
                || !["resolvedUnambiguous", "resolvedUnambiguousByProviderName"].includes(candidate.identity?.status)
                || candidate.internalConnection?.identityGap !== false
                || candidate.internalConnection?.localClaimSchemaGap !== false
                || candidate.internalConnection?.rawIntegrityGap !== false
                || candidate.rawEntityEvidence?.status !== "verified"
                || before?.integrityVerified !== true || before?.jsonValid !== true
                || after?.integrityVerified !== true || after?.jsonValid !== true
                || !["resolvedUnambiguous", "resolvedUnambiguousByProviderName"].includes(draft.identity?.status)
                || draft.rawEntityEvidence?.status !== "verified") return shard04CandidateCache;
        }
        shard04CandidateEvidenceCache = sourceCandidates;
        shard04CandidateCache = new Set(ids.map(String));
    } catch (_) {
        // Keep the central predicate fail-closed when either pinned artifact
        // is absent, malformed, or no longer matches its reviewed bytes.
    }
    return shard04CandidateCache;
}

/** Exact candidate-scoped behaviorSpec predicate for shard04. */
function isAllowedShard04ExternalEvidenceWait(task) {
    const laneList = Array.isArray(task?.deferredLanes) ? task.deferredLanes : [];
    if (laneList.length !== 1) return false;
    const lane = laneList[0];
    if (lane?.kind !== "semanticDecision" || lane?.status !== "deferred"
        || digest(lane.blockingReasons || []) !== digest(["semanticDecisionRequired"])) return false;
    if (task?.layer !== "behaviorSpec" || typeof task?.dataset !== "string" || task.dataset.trim().length === 0) return false;
    const candidateSet = shard04CandidateSet();
    if (!candidateSet || !candidateSet.has(String(task.candidateId))) return false;
    if (task?.terminalState !== "blocked" || task?.primaryBlockReason !== "semanticDecisionRequired") return false;
    if (task?.task?.kind !== "sourceProvider" || task?.task?.status !== "reopenOnTrigger"
        || task?.task?.reason !== "semanticDecisionRequired"
        || task?.task?.autoProcessableNow === true || task?.autoProcessableNow === true) return false;
    const frontier = task?.searchFrontier;
    if (frontier?.policyId !== SHARD04_FRONTIER_POLICY || frontier?.status !== "searchExhausted"
        || frontier?.exhausted !== true || frontier?.scopeMatched !== true
        || frontier?.scopeUnit !== "candidate-field-set"
        || frontier?.frontierId !== SHARD04_FRONTIER_POLICY
        || frontier?.candidateIdDigest !== SHARD04_CANDIDATE_ID_DIGEST
        || !Array.isArray(frontier?.candidateIds) || frontier.candidateIds.length !== 100
        || digest(frontier.candidateIds.map(String).sort()) !== SHARD04_CANDIDATE_ID_DIGEST
        || frontier?.sourceAuditDigest !== SHARD04_SOURCE_AUDIT_DIGEST
        || !Array.isArray(frontier.providersExamined) || frontier.providersExamined.length !== 9
        || new Set(frontier.providersExamined).size !== 9
        || !text(frontier.searchScope) || !date(frontier.lastSearchedAt)
        || !text(frontier.reopenTrigger)) return false;
    const candidateEvidence = shard04CandidateEvidenceCache?.get(String(task.candidateId));
    if (!candidateEvidence) return false;
    if (task?.identityConsistency?.blocked === true || task?.identityConsistency?.status !== "clear"
        || task?.identityConsistency?.consumerCoverageGap === true) return false;
    if (task?.bulkTransitionCapture?.sourceFamily !== "GenshinData-derived"
        || task?.bulkTransitionCapture?.status !== "targetDisplayRecordCapturedSingleCorrelatedFamily") return false;
    if (task?.fieldComparison?.hasMismatch === true || (task?.fieldComparison?.statuses || []).length > 0) return false;
    if (task?.certificate?.strictEligible === true || task?.certificate?.certificate?.strictEligible === true) return false;
    const requiredBlockReasons = new Set(["sourceMissing", "gameVersionUnbound", "providerIndependenceCorrelated", "semanticDecisionRequired"]);
    const blockReasons = Array.isArray(task?.blockReasons) ? task.blockReasons.map(String) : [];
    if (blockReasons.length !== requiredBlockReasons.size || blockReasons.some((reason) => !requiredBlockReasons.has(reason))) return false;
    return true;
}

let weaponShard01ArtifactCache;
function loadWeaponShard01Artifact() {
    if (weaponShard01ArtifactCache !== undefined) return weaponShard01ArtifactCache;
    weaponShard01ArtifactCache = null;
    try {
        const filename = path.join(ROOT, WEAPON_SHARD01_ARTIFACT_PATH);
        const bytes = fs.readFileSync(filename);
        if (crypto.createHash("sha256").update(bytes).digest("hex") !== WEAPON_SHARD01_ARTIFACT_SHA256) return null;
        const artifact = JSON.parse(bytes.toString("utf8"));
        const ids = artifact?.scope?.candidateIds;
        if (artifact?.fieldDigest !== WEAPON_SHARD01_SOURCE_AUDIT_DIGEST
            || artifact?.scope?.candidateCount !== 100
            || !Array.isArray(ids) || ids.length !== 100 || new Set(ids).size !== 100
            || artifact?.scope?.candidateIdDigest !== WEAPON_SHARD01_CANDIDATE_ID_DIGEST
            || digest(ids) !== WEAPON_SHARD01_CANDIDATE_ID_DIGEST
            || artifact?.frontier?.id !== WEAPON_SHARD01_FRONTIER_ID
            || artifact?.frontier?.policyId !== WEAPON_SHARD01_FRONTIER_POLICY
            || artifact?.frontier?.status !== "searchExhausted"
            || artifact?.frontier?.exhausted !== true
            || artifact?.frontier?.scopeMatched !== true
            || artifact?.frontier?.candidateIdDigest !== WEAPON_SHARD01_CANDIDATE_ID_DIGEST
            || digest(artifact.frontier.candidateIds || []) !== WEAPON_SHARD01_CANDIDATE_ID_DIGEST
            || artifact?.summary?.strictVerified !== 0
            || artifact?.summary?.certificateEligible !== 0
            || artifact?.summary?.canonicalPromotionEligible !== 0) return null;
        weaponShard01ArtifactCache = artifact;
    } catch (_) {
        // The predicate is fail-closed when the pinned audit is unavailable,
        // malformed, or no longer matches the reviewed bytes.
    }
    return weaponShard01ArtifactCache;
}

/**
 * Exact candidate-scoped frontier task predicate for weapon primary-field
 * shard 01.  This does not create or accept a deferred semantic lane: the
 * task must be the fresh terminal projection produced from the registered
 * frontier, and the generic deferral validator handles its disposition.
 *
 * This is deliberately not a general weapon/source-search rule.  The
 * predicate loads the pinned audit artifact itself, checks candidate
 * membership and the complete frontier metadata, and rejects any semantic,
 * consumer, identity, or discrepancy lane.  No caller-provided digest or
 * generic searchExhausted label can substitute for those checks.
 */
function isAllowedWeaponShard01ExternalEvidenceWait(task) {
    const laneList = Array.isArray(task?.deferredLanes) ? task.deferredLanes : [];
    if (laneList.length !== 0) return false;
    if (task?.layer !== "weaponEffectSpec" || task?.dataset !== "weapons") return false;
    if (task?.terminalState !== "blocked" || task?.primaryBlockReason !== "sourceMissing") return false;
    if (task?.task?.kind !== "sourceProvider" || task?.task?.status !== "reopenOnTrigger"
        || task?.task?.reason !== "sourceMissing"
        || task?.task?.autoProcessableNow === true || task?.autoProcessableNow === true) return false;

    const artifact = loadWeaponShard01Artifact();
    if (!artifact || !artifact.scope.candidateIds.includes(String(task.candidateId))) return false;
    const frontier = task?.searchFrontier;
    if (frontier?.frontierId !== WEAPON_SHARD01_FRONTIER_ID
        || frontier?.policyId !== WEAPON_SHARD01_FRONTIER_POLICY
        || frontier?.status !== "searchExhausted"
        || frontier?.exhausted !== true
        || frontier?.scopeMatched !== true
        || frontier?.scopeUnit !== "candidate-field-set"
        || frontier?.candidateIdDigest !== WEAPON_SHARD01_CANDIDATE_ID_DIGEST
        || frontier?.auditDigest !== WEAPON_SHARD01_SOURCE_AUDIT_DIGEST
        || !Array.isArray(frontier?.candidateIds)
        || frontier.candidateIds.length !== 100
        || digest(frontier.candidateIds) !== WEAPON_SHARD01_CANDIDATE_ID_DIGEST
        || !Array.isArray(frontier?.providersExamined)
        || !text(frontier.searchScope) || !date(frontier.lastSearchedAt)
        || !text(frontier.reopenTrigger)) return false;
    if (frontier.searchScope !== artifact.frontier.searchScope
        || frontier.lastSearchedAt !== artifact.frontier.lastSearchedAt
        || frontier.reopenTrigger !== artifact.frontier.reopenTrigger
        || digest(frontier.providersExamined || []) !== digest(artifact.frontier.providersExamined || [])) return false;

    // This shard is a numeric observation, not a semantic match.  Any actual
    // mismatch, identity ambiguity, consumer gap, or executable lane keeps it
    // open instead of being hidden by the external-evidence hold.
    if (task?.task?.taskId !== `source-reopen:${task.candidateId}`
        || task?.task?.owner !== "source/provider"
        || task?.mappingStatus !== "prepared" || task?.consumerStatus !== "notApplicable") return false;
    if (task?.identityConsistency && task.identityConsistency.status !== "clear"
        || task?.identityConsistency?.blocked === true
        || task?.identityConsistency?.consumerCoverageGap === true) return false;
    if (task?.fieldComparison?.hasMismatch === true
        || (task?.fieldComparison?.statuses || []).length > 0) return false;
    if (task?.certificate?.strictEligible === true
        || task?.certificate?.certificate?.strictEligible === true) return false;
    const requiredBlockReasons = new Set(["sourceMissing", "gameVersionUnbound", "providerIndependenceUnknown"]);
    const blockReasons = Array.isArray(task?.blockReasons) ? task.blockReasons.map(String) : [];
    if (blockReasons.length !== requiredBlockReasons.size
        || blockReasons.some((reason) => !requiredBlockReasons.has(reason))
        || digest(frontier.blockingReasons || []) !== digest(blockReasons)) return false;
    const candidate = artifact.candidates?.[String(task.candidateId)];
    if (!candidate || candidate.primaryComparison?.status !== "numericAgreementOnlyNotSemanticIdentity"
        || candidate.gate?.strictVerified !== false
        || candidate.gate?.certificateEligible !== false
        || candidate.gate?.canonicalPromotionEligible !== false
        || Object.values(candidate.claims || {}).some((claim) => claim?.disposition?.certificateEligible !== false
            || claim?.disposition?.canonicalPromotionEligible !== false)) return false;
    return true;
}

let weaponShard02ArtifactCache;
function loadWeaponShard02Artifact() {
    if (weaponShard02ArtifactCache !== undefined) return weaponShard02ArtifactCache;
    weaponShard02ArtifactCache = null;
    try {
        const filename = path.join(ROOT, WEAPON_SHARD02_ARTIFACT_PATH);
        const bytes = fs.readFileSync(filename);
        if (crypto.createHash("sha256").update(bytes).digest("hex") !== WEAPON_SHARD02_ARTIFACT_SHA256) return null;
        const artifact = JSON.parse(bytes.toString("utf8"));
        const ids = artifact?.scope?.candidateIds;
        if (artifact?.fieldDigest !== WEAPON_SHARD02_SOURCE_AUDIT_DIGEST
            || artifact?.scope?.candidateCount !== 100
            || !Array.isArray(ids) || ids.length !== 100 || new Set(ids).size !== 100
            || artifact?.scope?.candidateIdDigest !== WEAPON_SHARD02_CANDIDATE_ID_DIGEST
            || digest(ids) !== WEAPON_SHARD02_CANDIDATE_ID_DIGEST
            || artifact?.frontier?.id !== WEAPON_SHARD02_FRONTIER_ID
            || artifact?.frontier?.policyId !== WEAPON_SHARD02_FRONTIER_POLICY
            || artifact?.frontier?.status !== "searchExhausted"
            || artifact?.frontier?.exhausted !== true
            || artifact?.frontier?.scopeMatched !== true
            || artifact?.frontier?.candidateIdDigest !== WEAPON_SHARD02_CANDIDATE_ID_DIGEST
            || digest(artifact.frontier.candidateIds || []) !== WEAPON_SHARD02_CANDIDATE_ID_DIGEST
            || artifact?.summary?.strictVerified !== 0
            || artifact?.summary?.certificateEligible !== 0
            || artifact?.summary?.canonicalPromotionEligible !== 0) return null;
        weaponShard02ArtifactCache = artifact;
    } catch (_) {
        // Fail closed if the pinned shard is unavailable or mutated.
    }
    return weaponShard02ArtifactCache;
}

/** Exact candidate-scoped weapon primary-field predicate for shard02. */
function isAllowedWeaponShard02ExternalEvidenceWait(task) {
    const laneList = Array.isArray(task?.deferredLanes) ? task.deferredLanes : [];
    if (laneList.length !== 0) return false;
    if (task?.layer !== "weaponEffectSpec" || task?.dataset !== "weapons") return false;
    if (task?.terminalState !== "blocked" || task?.primaryBlockReason !== "sourceMissing") return false;
    if (task?.task?.kind !== "sourceProvider" || task?.task?.status !== "reopenOnTrigger"
        || task?.task?.reason !== "sourceMissing"
        || task?.task?.autoProcessableNow === true || task?.autoProcessableNow === true) return false;

    const artifact = loadWeaponShard02Artifact();
    if (!artifact || !artifact.scope.candidateIds.includes(String(task.candidateId))) return false;
    const frontier = task?.searchFrontier;
    if (frontier?.frontierId !== WEAPON_SHARD02_FRONTIER_ID
        || frontier?.policyId !== WEAPON_SHARD02_FRONTIER_POLICY
        || frontier?.status !== "searchExhausted"
        || frontier?.exhausted !== true
        || frontier?.scopeMatched !== true
        || frontier?.scopeUnit !== "candidate-field-set"
        || frontier?.candidateIdDigest !== WEAPON_SHARD02_CANDIDATE_ID_DIGEST
        || frontier?.auditDigest !== WEAPON_SHARD02_SOURCE_AUDIT_DIGEST
        || !Array.isArray(frontier?.candidateIds)
        || frontier.candidateIds.length !== 100
        || digest(frontier.candidateIds) !== WEAPON_SHARD02_CANDIDATE_ID_DIGEST
        || !Array.isArray(frontier?.providersExamined)
        || !text(frontier.searchScope) || !date(frontier.lastSearchedAt)
        || !text(frontier.reopenTrigger)) return false;
    if (frontier.searchScope !== artifact.frontier.searchScope
        || frontier.lastSearchedAt !== artifact.frontier.lastSearchedAt
        || frontier.reopenTrigger !== artifact.frontier.reopenTrigger
        || digest(frontier.providersExamined || []) !== digest(artifact.frontier.providersExamined || [])) return false;
    if (task?.task?.taskId !== `source-reopen:${task.candidateId}`
        || task?.task?.owner !== "source/provider"
        || task?.mappingStatus !== "prepared" || task?.consumerStatus !== "notApplicable") return false;
    if (task?.identityConsistency && task.identityConsistency.status !== "clear"
        || task?.identityConsistency?.blocked === true
        || task?.identityConsistency?.consumerCoverageGap === true) return false;
    if (task?.fieldComparison?.hasMismatch === true
        || (task?.fieldComparison?.statuses || []).length > 0) return false;
    if (task?.certificate?.strictEligible === true
        || task?.certificate?.certificate?.strictEligible === true) return false;
    const requiredBlockReasons = new Set(["sourceMissing", "gameVersionUnbound", "providerIndependenceUnknown"]);
    const blockReasons = Array.isArray(task?.blockReasons) ? task.blockReasons.map(String) : [];
    if (blockReasons.length !== requiredBlockReasons.size
        || blockReasons.some((reason) => !requiredBlockReasons.has(reason))
        || digest(frontier.blockingReasons || []) !== digest(blockReasons)) return false;
    const candidate = artifact.candidates?.[String(task.candidateId)];
    if (!candidate || candidate.primaryComparison?.status !== "numericAgreementOnlyNotSemanticIdentity"
        || candidate.gate?.strictVerified !== false
        || candidate.gate?.certificateEligible !== false
        || candidate.gate?.canonicalPromotionEligible !== false
        || Object.values(candidate.claims || {}).some((claim) => claim?.disposition?.certificateEligible !== false
            || claim?.disposition?.canonicalPromotionEligible !== false)) return false;
    return true;
}

let weaponShard03ArtifactCache;
function loadWeaponShard03Artifact() {
    if (weaponShard03ArtifactCache !== undefined) return weaponShard03ArtifactCache;
    weaponShard03ArtifactCache = null;
    try {
        const filename = path.join(ROOT, WEAPON_SHARD03_ARTIFACT_PATH);
        const bytes = fs.readFileSync(filename);
        if (crypto.createHash("sha256").update(bytes).digest("hex") !== WEAPON_SHARD03_ARTIFACT_SHA256) return null;
        const artifact = JSON.parse(bytes.toString("utf8"));
        const ids = artifact?.scope?.candidateIds;
        if (artifact?.fieldDigest !== WEAPON_SHARD03_SOURCE_AUDIT_DIGEST
            || artifact?.scope?.candidateCount !== 100
            || !Array.isArray(ids) || ids.length !== 100 || new Set(ids).size !== 100
            || artifact?.scope?.candidateIdDigest !== WEAPON_SHARD03_CANDIDATE_ID_DIGEST
            || digest(ids) !== WEAPON_SHARD03_CANDIDATE_ID_DIGEST
            || artifact?.frontier?.id !== WEAPON_SHARD03_FRONTIER_ID
            || artifact?.frontier?.policyId !== WEAPON_SHARD03_FRONTIER_POLICY
            || artifact?.frontier?.status !== "searchExhausted"
            || artifact?.frontier?.exhausted !== true
            || artifact?.frontier?.scopeMatched !== true
            || artifact?.frontier?.candidateIdDigest !== WEAPON_SHARD03_CANDIDATE_ID_DIGEST
            || digest(artifact.frontier.candidateIds || []) !== WEAPON_SHARD03_CANDIDATE_ID_DIGEST
            || artifact?.summary?.strictVerified !== 0
            || artifact?.summary?.certificateEligible !== 0
            || artifact?.summary?.canonicalPromotionEligible !== 0) return null;
        weaponShard03ArtifactCache = artifact;
    } catch (_) {
        // Fail closed if the pinned shard is unavailable or mutated.
    }
    return weaponShard03ArtifactCache;
}

/** Exact candidate-scoped weapon primary-field predicate for shard03. */
function isAllowedWeaponShard03ExternalEvidenceWait(task) {
    const laneList = Array.isArray(task?.deferredLanes) ? task.deferredLanes : [];
    if (laneList.length !== 0) return false;
    if (task?.layer !== "weaponEffectSpec" || task?.dataset !== "weapons") return false;
    if (task?.terminalState !== "blocked" || task?.primaryBlockReason !== "sourceMissing") return false;
    if (task?.task?.kind !== "sourceProvider" || task?.task?.status !== "reopenOnTrigger"
        || task?.task?.reason !== "sourceMissing"
        || task?.task?.autoProcessableNow === true || task?.autoProcessableNow === true) return false;

    const artifact = loadWeaponShard03Artifact();
    if (!artifact || !artifact.scope.candidateIds.includes(String(task.candidateId))) return false;
    const frontier = task?.searchFrontier;
    if (frontier?.frontierId !== WEAPON_SHARD03_FRONTIER_ID
        || frontier?.policyId !== WEAPON_SHARD03_FRONTIER_POLICY
        || frontier?.status !== "searchExhausted"
        || frontier?.exhausted !== true
        || frontier?.scopeMatched !== true
        || frontier?.scopeUnit !== "candidate-field-set"
        || frontier?.candidateIdDigest !== WEAPON_SHARD03_CANDIDATE_ID_DIGEST
        || frontier?.auditDigest !== WEAPON_SHARD03_SOURCE_AUDIT_DIGEST
        || !Array.isArray(frontier?.candidateIds)
        || frontier.candidateIds.length !== 100
        || digest(frontier.candidateIds) !== WEAPON_SHARD03_CANDIDATE_ID_DIGEST
        || !Array.isArray(frontier?.providersExamined)
        || !text(frontier.searchScope) || !date(frontier.lastSearchedAt)
        || !text(frontier.reopenTrigger)) return false;
    if (frontier.searchScope !== artifact.frontier.searchScope
        || frontier.lastSearchedAt !== artifact.frontier.lastSearchedAt
        || frontier.reopenTrigger !== artifact.frontier.reopenTrigger
        || digest(frontier.providersExamined || []) !== digest(artifact.frontier.providersExamined || [])) return false;
    if (task?.task?.taskId !== `source-reopen:${task.candidateId}`
        || task?.task?.owner !== "source/provider"
        || task?.mappingStatus !== "prepared" || task?.consumerStatus !== "notApplicable") return false;
    if (task?.identityConsistency && task.identityConsistency.status !== "clear"
        || task?.identityConsistency?.blocked === true
        || task?.identityConsistency?.consumerCoverageGap === true) return false;
    if (task?.fieldComparison?.hasMismatch === true
        || (task?.fieldComparison?.statuses || []).length > 0) return false;
    if (task?.certificate?.strictEligible === true
        || task?.certificate?.certificate?.strictEligible === true) return false;
    const requiredBlockReasons = new Set(["sourceMissing", "gameVersionUnbound", "providerIndependenceUnknown"]);
    const blockReasons = Array.isArray(task?.blockReasons) ? task.blockReasons.map(String) : [];
    if (blockReasons.length !== requiredBlockReasons.size
        || blockReasons.some((reason) => !requiredBlockReasons.has(reason))
        || digest(frontier.blockingReasons || []) !== digest(blockReasons)) return false;
    const candidate = artifact.candidates?.[String(task.candidateId)];
    if (!candidate || candidate.primaryComparison?.status !== "numericAgreementOnlyNotSemanticIdentity"
        || candidate.gate?.strictVerified !== false
        || candidate.gate?.certificateEligible !== false
        || candidate.gate?.canonicalPromotionEligible !== false
        || Object.values(candidate.claims || {}).some((claim) => claim?.disposition?.certificateEligible !== false
            || claim?.disposition?.canonicalPromotionEligible !== false)) return false;
    return true;
}

let weaponShard04ArtifactCache;
function loadWeaponShard04Artifact() {
    if (weaponShard04ArtifactCache !== undefined) return weaponShard04ArtifactCache;
    weaponShard04ArtifactCache = null;
    try {
        const filename = path.join(ROOT, WEAPON_SHARD04_ARTIFACT_PATH);
        const bytes = fs.readFileSync(filename);
        if (crypto.createHash("sha256").update(bytes).digest("hex") !== WEAPON_SHARD04_ARTIFACT_SHA256) return null;
        const artifact = JSON.parse(bytes.toString("utf8"));
        const ids = artifact?.scope?.candidateIds;
        if (artifact?.fieldDigest !== WEAPON_SHARD04_SOURCE_AUDIT_DIGEST
            || artifact?.scope?.candidateCount !== 9
            || !Array.isArray(ids) || ids.length !== 9 || new Set(ids).size !== 9
            || artifact?.scope?.candidateIdDigest !== WEAPON_SHARD04_CANDIDATE_ID_DIGEST
            || digest(ids) !== WEAPON_SHARD04_CANDIDATE_ID_DIGEST
            || artifact?.frontier?.id !== WEAPON_SHARD04_FRONTIER_ID
            || artifact?.frontier?.policyId !== WEAPON_SHARD04_FRONTIER_POLICY
            || artifact?.frontier?.status !== "searchExhausted"
            || artifact?.frontier?.exhausted !== true
            || artifact?.frontier?.scopeMatched !== true
            || artifact?.frontier?.candidateIdDigest !== WEAPON_SHARD04_CANDIDATE_ID_DIGEST
            || digest(artifact.frontier.candidateIds || []) !== WEAPON_SHARD04_CANDIDATE_ID_DIGEST
            || artifact?.summary?.strictVerified !== 0
            || artifact?.summary?.certificateEligible !== 0
            || artifact?.summary?.canonicalPromotionEligible !== 0) return null;
        const candidates = artifact.candidates || {};
        for (const id of ids.map(String)) {
            const candidate = candidates[id];
            if (!candidate
                || candidate.currentQueue?.consumerStatus !== "notApplicable"
                || candidate.primaryComparison?.status !== "numericAgreementOnlyNotSemanticIdentity"
                || candidate.primaryComparison?.rawVersionValuesEqual !== true
                || candidate.primaryComparison?.semanticIdentityEstablished !== false
                || candidate.primaryComparison?.semanticMapping !== null
                || candidate.rawIntegrity?.valid !== true
                || candidate.gate?.strictVerified !== false
                || candidate.gate?.certificateEligible !== false
                || candidate.gate?.canonicalPromotionEligible !== false
                || Object.values(candidate.claims || {}).some((claim) => claim?.disposition?.certificateEligible !== false
                    || claim?.disposition?.canonicalPromotionEligible !== false)) return null;
        }
        weaponShard04ArtifactCache = artifact;
    } catch (_) {
        // Fail closed if the pinned shard is unavailable or mutated.
    }
    return weaponShard04ArtifactCache;
}

/** Exact candidate-scoped weapon primary-field predicate for shard04. */
function isAllowedWeaponShard04ExternalEvidenceWait(task) {
    const laneList = Array.isArray(task?.deferredLanes) ? task.deferredLanes : [];
    if (laneList.length !== 0) return false;
    if (task?.layer !== "weaponEffectSpec" || task?.dataset !== "weapons") return false;
    if (task?.terminalState !== "blocked" || task?.primaryBlockReason !== "sourceMissing") return false;
    if (task?.task?.kind !== "sourceProvider" || task?.task?.status !== "reopenOnTrigger"
        || task?.task?.reason !== "sourceMissing"
        || task?.task?.autoProcessableNow === true || task?.autoProcessableNow === true) return false;
    const artifact = loadWeaponShard04Artifact();
    if (!artifact || !artifact.scope.candidateIds.includes(String(task.candidateId))) return false;
    const frontier = task?.searchFrontier;
    if (frontier?.frontierId !== WEAPON_SHARD04_FRONTIER_ID
        || frontier?.policyId !== WEAPON_SHARD04_FRONTIER_POLICY
        || frontier?.status !== "searchExhausted"
        || frontier?.exhausted !== true
        || frontier?.scopeMatched !== true
        || frontier?.scopeUnit !== "candidate-field-set"
        || frontier?.candidateIdDigest !== WEAPON_SHARD04_CANDIDATE_ID_DIGEST
        || frontier?.auditDigest !== WEAPON_SHARD04_SOURCE_AUDIT_DIGEST
        || !Array.isArray(frontier?.candidateIds)
        || frontier.candidateIds.length !== 9
        || digest(frontier.candidateIds) !== WEAPON_SHARD04_CANDIDATE_ID_DIGEST
        || !Array.isArray(frontier?.providersExamined)
        || !text(frontier.searchScope) || !date(frontier.lastSearchedAt)
        || !text(frontier.reopenTrigger)) return false;
    if (frontier.searchScope !== artifact.frontier.searchScope
        || frontier.lastSearchedAt !== artifact.frontier.lastSearchedAt
        || frontier.reopenTrigger !== artifact.frontier.reopenTrigger
        || digest(frontier.providersExamined || []) !== digest(artifact.frontier.providersExamined || [])) return false;
    if (task?.task?.taskId !== `source-reopen:${task.candidateId}`
        || task?.task?.owner !== "source/provider"
        || task?.mappingStatus !== "prepared" || task?.consumerStatus !== "notApplicable") return false;
    if (task?.identityConsistency && task.identityConsistency.status !== "clear"
        || task?.identityConsistency?.blocked === true
        || task?.identityConsistency?.consumerCoverageGap === true) return false;
    if (task?.fieldComparison?.hasMismatch === true
        || (task?.fieldComparison?.statuses || []).length > 0) return false;
    if (task?.certificate?.strictEligible === true
        || task?.certificate?.certificate?.strictEligible === true) return false;
    const requiredBlockReasons = new Set(["sourceMissing", "gameVersionUnbound", "providerIndependenceUnknown"]);
    const blockReasons = Array.isArray(task?.blockReasons) ? task.blockReasons.map(String) : [];
    if (blockReasons.length !== requiredBlockReasons.size
        || blockReasons.some((reason) => !requiredBlockReasons.has(reason))) return false;
    const candidate = artifact.candidates?.[String(task.candidateId)];
    if (!candidate || candidate.primaryComparison?.status !== "numericAgreementOnlyNotSemanticIdentity"
        || candidate.gate?.strictVerified !== false
        || candidate.gate?.certificateEligible !== false
        || candidate.gate?.canonicalPromotionEligible !== false) return false;
    return true;
}

let shard05CandidateCache;
let shard05CandidateEvidenceCache;
function shard05CandidateSet() {
    if (shard05CandidateCache !== undefined) return shard05CandidateCache;
    shard05CandidateCache = null;
    shard05CandidateEvidenceCache = null;
    try {
        const artifactBytes = fs.readFileSync(SHARD05_ARTIFACT_PATH);
        if (crypto.createHash("sha256").update(artifactBytes).digest("hex") !== SHARD05_ARTIFACT_SHA256) return shard05CandidateCache;
        const artifact = JSON.parse(artifactBytes.toString("utf8"));
        const sourceAuditBytes = fs.readFileSync(SHARD05_SOURCE_AUDIT_PATH);
        if (crypto.createHash("sha256").update(sourceAuditBytes).digest("hex") !== SHARD05_SOURCE_AUDIT_SHA256) return shard05CandidateCache;
        const sourceAudit = JSON.parse(sourceAuditBytes.toString("utf8"));
        const ids = artifact?.scope?.candidateIds;
        if (!Array.isArray(ids) || ids.length !== 100 || new Set(ids).size !== 100
            || digest([...ids].map(String).sort()) !== SHARD05_CANDIDATE_ID_DIGEST
            || artifact?.scope?.candidateIdDigest !== SHARD05_CANDIDATE_ID_DIGEST
            || artifact?.frontier?.id !== SHARD05_FRONTIER_POLICY
            || artifact?.frontier?.candidateIdDigest !== SHARD05_CANDIDATE_ID_DIGEST
            || artifact?.frontier?.sourceAuditDigest !== SHARD05_SOURCE_AUDIT_DIGEST
            || artifact?.evidence?.sourceAudit?.sha256 !== SHARD05_SOURCE_AUDIT_SHA256
            || sourceAudit?.fieldDigest !== SHARD05_SOURCE_AUDIT_DIGEST
            || sourceAudit?.scope?.candidateIdDigest !== SHARD05_CANDIDATE_ID_DIGEST
            || digest((sourceAudit.scope?.candidateIds || []).map(String).sort()) !== SHARD05_CANDIDATE_ID_DIGEST
            || sourceAudit?.summary?.identityGapCandidateCount !== 0
            || sourceAudit?.summary?.localClaimSchemaGapCandidateCount !== 0
            || sourceAudit?.summary?.rawIntegrityGapCandidateCount !== 0
            || sourceAudit?.summary?.rawIntegrityVerifiedCandidateCount !== 100
            || artifact?.summary?.candidateCount !== 100
            || artifact?.summary?.candidateScopedFrontierProvenCandidateCount !== 100
            || artifact?.summary?.candidateFieldEvidenceClaimCount !== 0
            || artifact?.summary?.strictVerifiedCandidateCount !== 0
            || artifact?.summary?.certificateEligibleClaimCount !== 0
            || artifact?.summary?.canonicalPromotionEligibleCandidateCount !== 0
            || artifact?.evidence?.rawIntegrityVerifiedCandidateCount !== 100
            || artifact?.evidence?.rawIntegrityGapCandidateCount !== 0) return shard05CandidateCache;
        const sourceCandidates = new Map((sourceAudit.candidates || []).map((candidate) => [String(candidate?.candidateId), candidate]));
        const draftCandidates = new Map((artifact.evidence?.candidateEvidence || []).map((candidate) => [String(candidate?.candidateId), candidate]));
        for (const id of ids.map(String)) {
            const candidate = sourceCandidates.get(id);
            const draft = draftCandidates.get(id);
            const before = candidate?.rawEntityEvidence?.before;
            const after = candidate?.rawEntityEvidence?.after;
            if (!candidate || !draft
                || !["resolvedUnambiguous", "resolvedUnambiguousByProviderName"].includes(candidate.identity?.status)
                || candidate.internalConnection?.identityGap !== false
                || candidate.internalConnection?.localClaimSchemaGap !== false
                || candidate.internalConnection?.rawIntegrityGap !== false
                || candidate.rawEntityEvidence?.status !== "verified"
                || before?.integrityVerified !== true || before?.jsonValid !== true
                || after?.integrityVerified !== true || after?.jsonValid !== true
                || !["resolvedUnambiguous", "resolvedUnambiguousByProviderName"].includes(draft.identity?.status)
                || draft.rawEntityEvidence?.status !== "verified") return shard05CandidateCache;
        }
        shard05CandidateEvidenceCache = sourceCandidates;
        shard05CandidateCache = new Set(ids.map(String));
    } catch (_) {
        // Keep the central predicate fail-closed when either pinned artifact
        // is absent, malformed, or no longer matches its reviewed bytes.
    }
    return shard05CandidateCache;
}

/** Exact candidate-scoped behaviorSpec predicate for shard05. */
function isAllowedShard05ExternalEvidenceWait(task) {
    const laneList = Array.isArray(task?.deferredLanes) ? task.deferredLanes : [];
    if (laneList.length !== 1) return false;
    const lane = laneList[0];
    if (lane?.kind !== "semanticDecision" || lane?.status !== "deferred"
        || digest(lane.blockingReasons || []) !== digest(["semanticDecisionRequired"])) return false;
    if (task?.layer !== "behaviorSpec" || typeof task?.dataset !== "string" || task.dataset.trim().length === 0) return false;
    const candidateSet = shard05CandidateSet();
    if (!candidateSet || !candidateSet.has(String(task.candidateId))) return false;
    if (task?.terminalState !== "blocked" || task?.primaryBlockReason !== "semanticDecisionRequired") return false;
    if (task?.task?.kind !== "sourceProvider" || task?.task?.status !== "reopenOnTrigger"
        || task?.task?.reason !== "semanticDecisionRequired"
        || task?.task?.autoProcessableNow === true || task?.autoProcessableNow === true) return false;
    const frontier = task?.searchFrontier;
    if (frontier?.policyId !== SHARD05_FRONTIER_POLICY || frontier?.status !== "searchExhausted"
        || frontier?.exhausted !== true || frontier?.scopeMatched !== true
        || frontier?.scopeUnit !== "candidate-field-set"
        || frontier?.frontierId !== SHARD05_FRONTIER_POLICY
        || frontier?.candidateIdDigest !== SHARD05_CANDIDATE_ID_DIGEST
        || !Array.isArray(frontier?.candidateIds) || frontier.candidateIds.length !== 100
        || digest(frontier.candidateIds.map(String).sort()) !== SHARD05_CANDIDATE_ID_DIGEST
        || frontier?.sourceAuditDigest !== SHARD05_SOURCE_AUDIT_DIGEST
        || !Array.isArray(frontier.providersExamined) || frontier.providersExamined.length !== 9
        || new Set(frontier.providersExamined).size !== 9
        || !text(frontier.searchScope) || !date(frontier.lastSearchedAt)
        || !text(frontier.reopenTrigger)) return false;
    const candidateEvidence = shard05CandidateEvidenceCache?.get(String(task.candidateId));
    if (!candidateEvidence) return false;
    if (task?.identityConsistency?.blocked === true || task?.identityConsistency?.status !== "clear"
        || task?.identityConsistency?.consumerCoverageGap === true) return false;
    if (task?.bulkTransitionCapture?.sourceFamily !== "GenshinData-derived"
        || task?.bulkTransitionCapture?.status !== "targetDisplayRecordCapturedSingleCorrelatedFamily") return false;
    if (task?.fieldComparison?.hasMismatch === true || (task?.fieldComparison?.statuses || []).length > 0) return false;
    if (task?.certificate?.strictEligible === true || task?.certificate?.certificate?.strictEligible === true) return false;
    const requiredBlockReasons = new Set(["sourceMissing", "gameVersionUnbound", "providerIndependenceCorrelated", "semanticDecisionRequired"]);
    const blockReasons = Array.isArray(task?.blockReasons) ? task.blockReasons.map(String) : [];
    if (blockReasons.length !== requiredBlockReasons.size || blockReasons.some((reason) => !requiredBlockReasons.has(reason))) return false;
    return true;
}

let shard06CandidateCache;
let shard06CandidateEvidenceCache;
function shard06CandidateSet() {
    if (shard06CandidateCache !== undefined) return shard06CandidateCache;
    shard06CandidateCache = null;
    shard06CandidateEvidenceCache = null;
    try {
        const artifactBytes = fs.readFileSync(SHARD06_ARTIFACT_PATH);
        if (crypto.createHash("sha256").update(artifactBytes).digest("hex") !== SHARD06_ARTIFACT_SHA256) return shard06CandidateCache;
        const artifact = JSON.parse(artifactBytes.toString("utf8"));
        const sourceAuditBytes = fs.readFileSync(SHARD06_SOURCE_AUDIT_PATH);
        if (crypto.createHash("sha256").update(sourceAuditBytes).digest("hex") !== SHARD06_SOURCE_AUDIT_SHA256) return shard06CandidateCache;
        const sourceAudit = JSON.parse(sourceAuditBytes.toString("utf8"));
        const ids = artifact?.scope?.candidateIds;
        if (!Array.isArray(ids) || ids.length !== 100 || new Set(ids).size !== 100
            || digest([...ids].map(String).sort()) !== SHARD06_CANDIDATE_ID_DIGEST
            || artifact?.scope?.candidateIdDigest !== SHARD06_CANDIDATE_ID_DIGEST
            || artifact?.frontier?.id !== SHARD06_FRONTIER_POLICY
            || artifact?.frontier?.candidateIdDigest !== SHARD06_CANDIDATE_ID_DIGEST
            || artifact?.frontier?.sourceAuditDigest !== SHARD06_SOURCE_AUDIT_DIGEST
            || artifact?.evidence?.sourceAudit?.sha256 !== SHARD06_SOURCE_AUDIT_SHA256
            || sourceAudit?.fieldDigest !== SHARD06_SOURCE_AUDIT_DIGEST
            || sourceAudit?.scope?.candidateIdDigest !== SHARD06_CANDIDATE_ID_DIGEST
            || digest((sourceAudit.scope?.candidateIds || []).map(String).sort()) !== SHARD06_CANDIDATE_ID_DIGEST
            || sourceAudit?.summary?.identityGapCandidateCount !== 0
            || sourceAudit?.summary?.localClaimSchemaGapCandidateCount !== 0
            || sourceAudit?.summary?.rawIntegrityGapCandidateCount !== 0
            || sourceAudit?.summary?.rawIntegrityVerifiedCandidateCount !== 100
            || artifact?.summary?.candidateCount !== 100
            || artifact?.summary?.candidateScopedFrontierProvenCandidateCount !== 100
            || artifact?.summary?.candidateFieldEvidenceClaimCount !== 0
            || artifact?.summary?.strictVerifiedCandidateCount !== 0
            || artifact?.summary?.certificateEligibleClaimCount !== 0
            || artifact?.summary?.canonicalPromotionEligibleCandidateCount !== 0
            || artifact?.evidence?.rawIntegrityVerifiedCandidateCount !== 100
            || artifact?.evidence?.rawIntegrityGapCandidateCount !== 0) return shard06CandidateCache;
        const sourceCandidates = new Map((sourceAudit.candidates || []).map((candidate) => [String(candidate?.candidateId), candidate]));
        const draftCandidates = new Map((artifact.evidence?.candidateEvidence || []).map((candidate) => [String(candidate?.candidateId), candidate]));
        for (const id of ids.map(String)) {
            const candidate = sourceCandidates.get(id);
            const draft = draftCandidates.get(id);
            const before = candidate?.rawEntityEvidence?.before;
            const after = candidate?.rawEntityEvidence?.after;
            if (!candidate || !draft
                || !["resolvedUnambiguous", "resolvedUnambiguousByProviderName"].includes(candidate.identity?.status)
                || candidate.internalConnection?.identityGap !== false
                || candidate.internalConnection?.localClaimSchemaGap !== false
                || candidate.internalConnection?.rawIntegrityGap !== false
                || candidate.rawEntityEvidence?.status !== "verified"
                || before?.integrityVerified !== true || before?.jsonValid !== true
                || after?.integrityVerified !== true || after?.jsonValid !== true
                || !["resolvedUnambiguous", "resolvedUnambiguousByProviderName"].includes(draft.identity?.status)
                || draft.rawEntityEvidence?.status !== "verified") return shard06CandidateCache;
        }
        shard06CandidateEvidenceCache = sourceCandidates;
        shard06CandidateCache = new Set(ids.map(String));
    } catch (_) {
        // Keep the central predicate fail-closed when either pinned artifact is
        // absent, malformed, or no longer matches its reviewed bytes.
    }
    return shard06CandidateCache;
}

/** Exact candidate-scoped behaviorSpec predicate for shard06. */
function isAllowedShard06ExternalEvidenceWait(task) {
    const laneList = Array.isArray(task?.deferredLanes) ? task.deferredLanes : [];
    if (laneList.length !== 1) return false;
    const lane = laneList[0];
    if (lane?.kind !== "semanticDecision" || lane?.status !== "deferred"
        || digest(lane.blockingReasons || []) !== digest(["semanticDecisionRequired"])) return false;
    if (task?.layer !== "behaviorSpec" || typeof task?.dataset !== "string" || task.dataset.trim().length === 0) return false;
    const candidateSet = shard06CandidateSet();
    if (!candidateSet || !candidateSet.has(String(task.candidateId))) return false;
    if (task?.terminalState !== "blocked" || task?.primaryBlockReason !== "semanticDecisionRequired") return false;
    if (task?.task?.kind !== "sourceProvider" || task?.task?.status !== "reopenOnTrigger"
        || task?.task?.reason !== "semanticDecisionRequired"
        || task?.task?.autoProcessableNow === true || task?.autoProcessableNow === true) return false;
    const frontier = task?.searchFrontier;
    if (frontier?.policyId !== SHARD06_FRONTIER_POLICY || frontier?.status !== "searchExhausted"
        || frontier?.exhausted !== true || frontier?.scopeMatched !== true
        || frontier?.scopeUnit !== "candidate-field-set"
        || frontier?.frontierId !== SHARD06_FRONTIER_POLICY
        || frontier?.candidateIdDigest !== SHARD06_CANDIDATE_ID_DIGEST
        || !Array.isArray(frontier?.candidateIds) || frontier.candidateIds.length !== 100
        || digest(frontier.candidateIds.map(String).sort()) !== SHARD06_CANDIDATE_ID_DIGEST
        || frontier?.sourceAuditDigest !== SHARD06_SOURCE_AUDIT_DIGEST
        || !Array.isArray(frontier.providersExamined) || frontier.providersExamined.length !== 9
        || new Set(frontier.providersExamined).size !== 9
        || !text(frontier.searchScope) || !date(frontier.lastSearchedAt)
        || !text(frontier.reopenTrigger)) return false;
    const candidateEvidence = shard06CandidateEvidenceCache?.get(String(task.candidateId));
    if (!candidateEvidence) return false;
    if (task?.identityConsistency?.blocked === true || task?.identityConsistency?.status !== "clear"
        || task?.identityConsistency?.consumerCoverageGap === true) return false;
    if (task?.bulkTransitionCapture?.sourceFamily !== "GenshinData-derived"
        || task?.bulkTransitionCapture?.status !== "targetDisplayRecordCapturedSingleCorrelatedFamily") return false;
    if (task?.fieldComparison?.hasMismatch === true || (task?.fieldComparison?.statuses || []).length > 0) return false;
    if (task?.certificate?.strictEligible === true || task?.certificate?.certificate?.strictEligible === true) return false;
    const requiredBlockReasons = new Set(["sourceMissing", "gameVersionUnbound", "providerIndependenceCorrelated", "semanticDecisionRequired"]);
    const blockReasons = Array.isArray(task?.blockReasons) ? task.blockReasons.map(String) : [];
    if (blockReasons.length !== requiredBlockReasons.size || blockReasons.some((reason) => !requiredBlockReasons.has(reason))) return false;
    return true;
}

function validateExternalEvidenceDisposition(disposition, task, fieldFindings, readArtifact) {
    const errors = [];
    const bounded = disposition?.assessment?.boundedScope;
    const lanes = Array.isArray(bounded?.deferredLaneDispositions)
        ? bounded.deferredLaneDispositions : [];
    if (lanes.length !== 1) {
        errors.push("externalEvidenceDispositionMissing");
        return errors;
    }
    const lane = lanes[0];
    if (lane?.kind !== "semanticDecision" || lane?.disposition !== "externalEvidenceWait") {
        errors.push("externalEvidenceDispositionKindInvalid");
    }
    if (digest(lane?.blockingReasons || []) !== digest(["semanticDecisionRequired"])) {
        errors.push("externalEvidenceDispositionReasonsInvalid");
    }
    if (!text(lane?.reason) || !lane.reason.includes(String(task?.candidateId || ""))) {
        errors.push("externalEvidenceDispositionReasonUnbound");
    }
    const fields = Array.isArray(fieldFindings) ? fieldFindings : [];
    const knownFields = new Set(fields.map((item) => String(item?.field || "")));
    const refs = Array.isArray(lane?.fieldRefs) ? lane.fieldRefs : [];
    if (!uniqueTextList(refs) || refs.some((field) => {
        const claim = String(field).startsWith("claim.") ? String(field).slice(6) : "";
        return !EXTERNAL_MECHANIC_CLAIMS.includes(claim)
            || !knownFields.has(String(field));
    })) errors.push("externalEvidenceFieldRefsInvalid");
    errors.push(...validateRefs(lane?.artifactRefs, readArtifact));
    return errors;
}
function scopeDigest(tasks) {
    return digest(tasks.map((task) => taskDigest(task)).sort());
}
function readArtifact(relativePath) {
    const resolved = path.resolve(ROOT, relativePath);
    if (!resolved.startsWith(ROOT + path.sep)) throw new Error("artifactOutsideRepository");
    return fs.readFileSync(resolved);
}
function validateRefs(refs, reader = readArtifact) {
    if (!Array.isArray(refs) || refs.length === 0) return ["artifactRefsMissing"];
    const errors = [];
    for (const ref of refs) {
        if (isMutableCoordinationArtifactPath(ref?.path)) {
            errors.push("mutableCoordinationArtifactRef:" + ref.path);
            continue;
        }
        if (!text(ref?.path) || path.isAbsolute(ref.path) || /^[a-z]:/i.test(ref.path)
            || ref.path.split(/[\\/]/).includes("..") || !SHA.test(ref.sha256 || "")) {
            errors.push("artifactRefInvalid"); continue;
        }
        try {
            const bytes = reader(ref.path);
            if (!Buffer.isBuffer(bytes) || crypto.createHash("sha256").update(bytes).digest("hex") !== ref.sha256) {
                errors.push("artifactDigestMismatch:" + ref.path);
            }
        } catch (_) { errors.push("artifactMissing:" + ref.path); }
    }
    return errors;
}

function validateDeferral(decision, task, context = {}) {
    const errors = [];
    const artifactReader = context.readArtifact || readArtifact;
    if (!text(decision?.id)) errors.push("decisionIdMissing");
    if (decision?.kind !== "genshinEvidenceDeferral" || decision?.policyId !== POLICY) errors.push("deferralPolicyInvalid");
    if (decision?.candidateId !== task.candidateId) errors.push("candidateMismatch");
    if (!text(context.targetGameVersion) || decision?.targetGameVersion !== context.targetGameVersion) errors.push("targetVersionMismatch");
    if (decision?.queueTaskDigest !== taskDigest(task)) errors.push("queueTaskDigestMismatch");
    if (!text(decision?.assessment?.actorId) || !date(decision?.assessment?.assessedAt)
        || !text(decision?.assessment?.reason)) errors.push("assessmentMissing");
    if (!Array.isArray(decision?.fieldFindings) || decision.fieldFindings.length === 0) errors.push("fieldFindingsMissing");
    for (const item of Array.isArray(decision?.fieldFindings) ? decision.fieldFindings : []) {
        if (!item || !text(item.field) || !text(item.knownStatus) || !text(item.missingEvidence)
            || !Object.hasOwn(item, "currentValue") || !Object.hasOwn(item, "historicalValue")) errors.push("fieldFindingIncomplete");
    }
    const search = decision?.search;
    if (!text(search?.scope) || !date(search?.lastSearchedAt) || !allText(search?.providersExamined)
        || !text(search?.negativeResult) || !Array.isArray(search?.unsearchedScope)
        || !text(search?.reopenTrigger) || !text(search?.nextTask)) errors.push("searchRecordIncomplete");
    if (!text(decision?.safety?.impact) || !text(decision?.safety?.action)
        || !text(decision?.safety?.runtimeStatus)) errors.push("safetyDispositionMissing");
    const refs = [
        ...validateRefs(search?.artifactRefs, artifactReader),
        ...validateRefs(decision?.safety?.artifactRefs, artifactReader)
    ];
    errors.push(...refs);
    // A bounded source frontier can be closed only after explicit disposition.
    // Other work (including deferred consumer/mapping lanes) is not hidden.
    const externalEvidenceWait = isAllowedExternalEvidenceWait(task)
        || isAllowedShard01ExternalEvidenceWait(task)
        || isAllowedShard02ExternalEvidenceWait(task)
        || isAllowedShard03ExternalEvidenceWait(task)
        || isAllowedShard04ExternalEvidenceWait(task)
        || isAllowedShard05ExternalEvidenceWait(task)
        || isAllowedShard06ExternalEvidenceWait(task);
    if (task.task?.kind !== "sourceProvider" || task.task?.status !== "reopenOnTrigger"
        || task.autoProcessableNow === true || task.task?.autoProcessableNow === true
        || ((task.deferredLanes || []).length > 0 && !externalEvidenceWait)) errors.push("concreteWorkStillPending");
    if (externalEvidenceWait) {
        errors.push(...validateExternalEvidenceDisposition(
            decision,
            task,
            decision?.fieldFindings,
            artifactReader
        ));
    }
    const frontier = task.searchFrontier;
    const frontierExhausted = frontier?.exhausted === true;
    const frontierNonExhaustive = frontier?.exhausted === false;
    if (!frontierExhausted && !frontierNonExhaustive) errors.push("frontierExhaustionUnknown");
    if (frontier?.scopeMatched !== true) errors.push("frontierNotClosed");
    if (frontier?.status === "searchRequired") errors.push("concreteWorkStillPending");
    if (search?.scope !== frontier?.searchScope
        || search?.lastSearchedAt !== task.searchFrontier?.lastSearchedAt
        || search?.reopenTrigger !== frontier?.reopenTrigger
        || digest(search?.providersExamined || []) !== digest(frontier?.providersExamined || [])) errors.push("frontierBindingMismatch");
    const hasUnsearchedScope = Array.isArray(search?.unsearchedScope) && search.unsearchedScope.length > 0;
    if (frontierNonExhaustive || hasUnsearchedScope) {
        // Exhaustion closes only the recorded finite frontier. Any explicit
        // remainder (including an external/unavailable source surface) still
        // needs a candidate/task-bound review of the remaining evidence.
        const assessment = decision?.assessment;
        const bounded = assessment?.boundedScope;
        if (!bounded || typeof bounded !== "object" || Array.isArray(bounded)) {
            errors.push("boundedAssessmentMissing");
        } else {
            if (bounded.candidateId !== task.candidateId
                || bounded.taskId !== task.task?.taskId) errors.push("boundedAssessmentBindingMismatch");
            if (!optionalTextList(bounded.remainingSearches) || bounded.remainingSearches.length === 0
                || !optionalTextList(search?.unsearchedScope) || search.unsearchedScope.length === 0
                || !sameList(bounded.remainingSearches, search.unsearchedScope)) {
                errors.push("boundedRemainingScopeInvalid");
            }
            if (!uniqueTextList(bounded.notExecutableReasons)) errors.push("boundedNonExecutableReasonsMissing");
            errors.push(...validateRefs(bounded.artifactRefs, artifactReader));
        }
    }
    if ((context.reopenedCandidateIds || []).includes(task.candidateId)) errors.push("reopenTriggerObserved");
    return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

function candidateProgress(task, decisions, context = {}) {
    const matches = decisions.filter((item) => item.candidateId === task.candidateId);
    const deferral = matches.length === 1 ? validateDeferral(matches[0], task, context)
        : { valid: false, errors: [matches.length ? "duplicateDeferral" : "deferralNotRecorded"] };
    const complete = task.task?.status === "complete";
    const historical = task.task?.kind === "versionReverification"
        || task.consumerStatus === "historicalCanonicalPendingRevalidation";
    const currentVerified = !historical && complete && ["verifiedSpec", "productionCanonical"].includes(task.terminalState);
    const evidence = historical ? "historicalVerifiedPendingRevalidation"
        : currentVerified ? "strictVerified"
        : task.certificate?.strictEligible === true ? "strictCertificateEligible"
            : task.bulkTransitionCapture ? "capturedNotVerified" : "unverified";
    const runtime = task.terminalState === "nonCalculativeComplete" ? "notRequired"
        : task.terminalState === "productionCanonical" && complete ? "activeCanonical"
            : historical ? "historicalInactive"
                : task.layer === "behaviorSpec" ? "specOnly" : "notEstablished";
    const status = complete ? "completed" : deferral.valid ? "evidenceDeferred"
        : ["humanDecision", "semanticReview", "humanReview"].includes(task.task?.kind) ? "awaitingUserDecision"
            : "pending";
    return {
        evidence: { status: evidence, strictEligible: task.certificate?.strictEligible === true },
        calculation: { status: runtime, reportedConsumerStatus: task.consumerStatus || "unknown" },
        work: {
            status, closed: complete || deferral.valid,
            verificationGranted: false, promotionGranted: false,
            decisionId: deferral.valid ? matches[0].id : null,
            deferralValidation: deferral,
            nextTask: deferral.valid ? matches[0].search.nextTask : task.task?.taskId || null
        }
    };
}

function assessReleaseAcceptance(receipt, tasks, context) {
    const errors = [];
    if (!receipt || receipt.kind !== "genshinR2ReleaseAcceptance" || receipt.policyId !== POLICY) errors.push("releaseAcceptanceMissing");
    if (receipt?.targetGameVersion !== context.targetGameVersion) errors.push("releaseTargetMismatch");
    if (receipt?.scopeDigest !== scopeDigest(tasks)) errors.push("releaseScopeStale");
    if (!text(receipt?.reviewerId) || !date(receipt?.reviewedAt)) errors.push("releaseReviewMissing");
    const milestones = Array.isArray(receipt?.milestones) ? receipt.milestones : [];
    if (receipt && !Array.isArray(receipt.milestones)) errors.push("milestonesMalformed");
    for (const id of REQUIRED_MILESTONES) {
        const hits = milestones.filter((m) => m && typeof m === "object" && m.id === id);
        if (hits.length !== 1 || hits[0].status !== "passed") errors.push("milestonePending:" + id);
        else errors.push(...validateRefs(hits[0].artifactRefs, context.readArtifact).map((e) => id + ":" + e));
    }
    return { valid: errors.length === 0, errors: [...new Set(errors)], requiredMilestones: [...REQUIRED_MILESTONES] };
}

function buildWorkProgress(tasks, registry = {}, context = {}) {
    const targetGameVersion = context.targetGameVersion || "7.0";
    const effective = { ...context, targetGameVersion };
    const decisions = Array.isArray(registry.decisions) ? registry.decisions.filter((d) => d && typeof d === "object") : [];
    const records = tasks.map((task) => ({ candidateId: task.candidateId, ...candidateProgress(task, decisions, effective) }));
    const ids = new Set(tasks.map((t) => t.candidateId));
    const errors = [];
    if (Array.isArray(registry.decisions) && decisions.length !== registry.decisions.length) errors.push("invalidDeferralRecord");
    if (ids.size !== tasks.length) errors.push("duplicateCandidateIds");
    if (registry.targetGameVersion && registry.targetGameVersion !== targetGameVersion) errors.push("registryTargetMismatch");
    for (const d of decisions) if (!ids.has(d.candidateId)) errors.push("orphanDeferral:" + d.candidateId);
    for (const r of records) if (decisions.some((d) => d.candidateId === r.candidateId) && !r.work.deferralValidation.valid) {
        errors.push(...r.work.deferralValidation.errors.map((e) => r.candidateId + ":" + e));
    }
    const release = assessReleaseAcceptance(registry.releaseAcceptance, tasks, effective);
    const summary = {
        total: records.length, completed: records.filter((r) => r.work.status === "completed").length,
        evidenceDeferred: records.filter((r) => r.work.status === "evidenceDeferred").length,
        pending: records.filter((r) => r.work.status === "pending").length,
        awaitingUserDecision: records.filter((r) => r.work.status === "awaitingUserDecision").length,
        disposed: records.filter((r) => r.work.closed).length,
        evidenceStates: countBy(records.map((r) => r.evidence.status)),
        calculationStates: countBy(records.map((r) => r.calculation.status))
    };
    return {
        policyId: POLICY, targetGameVersion, scopeDigest: scopeDigest(tasks),
        summary, errors: [...new Set(errors)], releaseAcceptance: release,
        candidateWorkComplete: records.length > 0 && summary.disposed === summary.total && errors.length === 0,
        goalComplete: records.length > 0 && summary.disposed === summary.total && errors.length === 0 && release.valid,
        records
    };
}

function loadRegistry() {
    const filename = path.join(ROOT, "games/genshin/data/v2/r2-work-dispositions.json");
    return fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, "utf8"))
        : { schemaVersion: 1, targetGameVersion: "7.0", decisions: [] };
}
module.exports = { POLICY, REQUIRED_MILESTONES, TRANSITION_FRONTIER_POLICY,
    MUTABLE_COORDINATION_ARTIFACT_PATHS, isMutableCoordinationArtifactPath,
    SHARD01_FRONTIER_POLICY, SHARD01_CANDIDATE_ID_DIGEST, SHARD01_SOURCE_AUDIT_DIGEST,
    SHARD01_ARTIFACT_SHA256,
    SHARD02_FRONTIER_POLICY, SHARD02_CANDIDATE_ID_DIGEST, SHARD02_SOURCE_AUDIT_DIGEST,
    SHARD02_ARTIFACT_PATH, SHARD02_SOURCE_AUDIT_PATH, SHARD02_ARTIFACT_SHA256,
    SHARD03_FRONTIER_POLICY, SHARD03_CANDIDATE_ID_DIGEST, SHARD03_SOURCE_AUDIT_DIGEST,
    SHARD03_ARTIFACT_PATH, SHARD03_SOURCE_AUDIT_PATH, SHARD03_ARTIFACT_SHA256,
    SHARD04_FRONTIER_POLICY, SHARD04_CANDIDATE_ID_DIGEST, SHARD04_SOURCE_AUDIT_DIGEST,
    SHARD04_ARTIFACT_PATH, SHARD04_SOURCE_AUDIT_PATH, SHARD04_ARTIFACT_SHA256,
    SHARD05_FRONTIER_POLICY, SHARD05_CANDIDATE_ID_DIGEST, SHARD05_SOURCE_AUDIT_DIGEST,
    SHARD05_ARTIFACT_PATH, SHARD05_SOURCE_AUDIT_PATH, SHARD05_ARTIFACT_SHA256,
    SHARD06_FRONTIER_POLICY, SHARD06_CANDIDATE_ID_DIGEST, SHARD06_SOURCE_AUDIT_DIGEST,
    SHARD06_ARTIFACT_PATH, SHARD06_SOURCE_AUDIT_PATH, SHARD06_ARTIFACT_SHA256,
    SHARD06_SOURCE_AUDIT_SHA256,
    WEAPON_SHARD01_FRONTIER_ID, WEAPON_SHARD01_FRONTIER_POLICY,
    WEAPON_SHARD01_CANDIDATE_ID_DIGEST, WEAPON_SHARD01_SOURCE_AUDIT_DIGEST,
    WEAPON_SHARD01_ARTIFACT_PATH, WEAPON_SHARD01_ARTIFACT_SHA256,
    WEAPON_SHARD02_FRONTIER_ID, WEAPON_SHARD02_FRONTIER_POLICY,
    WEAPON_SHARD02_CANDIDATE_ID_DIGEST, WEAPON_SHARD02_SOURCE_AUDIT_DIGEST,
    WEAPON_SHARD02_ARTIFACT_PATH, WEAPON_SHARD02_ARTIFACT_SHA256,
    WEAPON_SHARD03_FRONTIER_ID, WEAPON_SHARD03_FRONTIER_POLICY,
    WEAPON_SHARD03_CANDIDATE_ID_DIGEST, WEAPON_SHARD03_SOURCE_AUDIT_DIGEST,
    WEAPON_SHARD03_ARTIFACT_PATH, WEAPON_SHARD03_ARTIFACT_SHA256,
    WEAPON_SHARD04_FRONTIER_ID, WEAPON_SHARD04_FRONTIER_POLICY,
    WEAPON_SHARD04_CANDIDATE_ID_DIGEST, WEAPON_SHARD04_SOURCE_AUDIT_DIGEST,
    WEAPON_SHARD04_ARTIFACT_PATH, WEAPON_SHARD04_ARTIFACT_SHA256,
    REQUIRED_WEAPON_SHARD_CLAIMS,
    EXTERNAL_MECHANIC_CLAIMS, INTERNAL_METADATA_CLAIMS,
    TRANSITION_CLAIM_SCHEMA_MISSING_FALLBACK_CANDIDATES,
    digest, taskDigest, scopeDigest,
    validateRefs, isAllowedExternalEvidenceWait, isAllowedShard01ExternalEvidenceWait,
    isAllowedShard02ExternalEvidenceWait, isAllowedShard03ExternalEvidenceWait,
    isAllowedShard04ExternalEvidenceWait,
    isAllowedShard05ExternalEvidenceWait,
    isAllowedShard06ExternalEvidenceWait,
    isAllowedWeaponShard01ExternalEvidenceWait, isAllowedWeaponShard02ExternalEvidenceWait,
    isAllowedWeaponShard03ExternalEvidenceWait, isAllowedWeaponShard04ExternalEvidenceWait,
    validateExternalEvidenceDisposition,
    validateDeferral, candidateProgress, assessReleaseAcceptance, buildWorkProgress, loadRegistry };
