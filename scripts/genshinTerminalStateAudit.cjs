"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { buildRepositoryAudit } = require("./genshinCanonicalRuntimeGenerate.cjs");
const { auditBaseline } = require("./genshinVersionBaseline.cjs");
const { buildEntityIdentityAssessments } = require("./genshinCharacterIdentityConsistencyAudit.cjs");
const { buildAudit: buildModifierLaneAudit } = require("./genshinBehaviorModifierLaneAudit.cjs");
const localizedIdentityCapture = require("./genshinCharacterLocalizedIdentityCapture.cjs");
const officialWeaponCapture = require("./genshinOfficialWeaponFrontierCapture.cjs");
const sourceCoverageInventory = require("./genshinCandidateSourceCoverageFrontierInventory.cjs");
const { buildAudit: buildTalentGapLaneAudit } = require("./genshinTalentGapLaneAudit.cjs");
const { buildAudit: buildLegacyAudit } = require("./genshinModifierAudit.cjs");
const { validateClaimReacquisition, validatePartialDiscovery } = require("./genshinVersionEvidenceValidation.cjs");
const verificationStateMachine = require("./genshinVerificationStateMachine.cjs");
const {
    buildEvidenceTaskQueue,
    canAutomaticallyProcess,
    deriveNextTask,
    deriveSearchFrontier,
    renderTaskQueueMarkdown
} = require("./genshinEvidenceTaskQueue.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const eligibilityCertificateRelativePath = "v2/eligibility-certificates.json";
const TERMINAL_STATES = Object.freeze([
    "productionCanonical",
    "awaitingHumanReview",
    "verifiedSpec",
    "nonCalculativeComplete",
    "blocked"
]);
const BLOCK_REASONS = Object.freeze([
    "sourceMissing",
    "gameVersionUnbound",
    "providerIndependenceUnknown",
    "providerIndependenceCorrelated",
    "versionOrProviderCoverageDrift",
    "sourceDiscrepancy",
    "semanticDecisionRequired",
    "consumerMissing",
    "schemaGap",
    "unsupported",
    "invalid",
    "inputMissing",
    "displayOnly"
]);

function readJson(file) {
    return JSON.parse(fs.readFileSync(path.join(dataRoot, file), "utf8"));
}

function summarizeEligibilityCertificates(certificates, authority = {}) {
    const claims = Array.isArray(certificates) ? certificates : [];
    const freshnessReasons = (certificate) => {
        const reasons = [];
        if (!authority.versionSnapshotId || certificate?.versionSnapshotId !== authority.versionSnapshotId) reasons.push("versionSnapshotMismatch");
        if (!authority.gameVersion || certificate?.currentGameVersion !== authority.gameVersion) reasons.push("currentGameVersionMismatch");
        if (!authority.sourceCatalogDigest || certificate?.authority?.sourceCatalogDigest !== authority.sourceCatalogDigest) reasons.push("sourceCatalogDigestMismatch");
        return reasons;
    };
    const eligibleClaims = claims.filter((certificate) => certificate?.status === "eligible"
        && certificate?.canonicalEligibility !== true
        && (!Array.isArray(certificate.blockedReasons) || certificate.blockedReasons.length === 0)
        && freshnessReasons(certificate).length === 0);
    const blockedClaims = claims.filter((certificate) => !eligibleClaims.includes(certificate));
    const fieldComparison = {
        statuses: claims.map((certificate) => certificate?.comparison?.status || "unknown"),
        hasScopedMatch: claims.some((certificate) => certificate?.blockedReasons?.includes("scopedMatch")),
        // `notMatch` means strict agreement was not established, including
        // missing evidence. It is not a witnessed contradiction between sources.
        hasMismatch: claims.some((certificate) => ["mismatch", "conflict"].includes(certificate?.comparison?.status)),
        scopeBoundary: null
    };
    const providerIds = [...new Set(claims.flatMap((certificate) => (certificate.sources || [])
        .map((source) => source.providerId)
        .filter(Boolean)))].sort();
    return {
        certificateCount: claims.length,
        eligibleClaimCount: eligibleClaims.length,
        blockedClaimCount: blockedClaims.length,
        status: claims.length > 0 && blockedClaims.length === 0 ? "eligible" : claims.length > 0 ? "blocked" : "missing",
        strictEligible: claims.length > 0 && blockedClaims.length === 0,
        freshness: {
            current: claims.length > 0 && claims.every((certificate) => freshnessReasons(certificate).length === 0),
            staleClaimCount: claims.filter((certificate) => freshnessReasons(certificate).length > 0).length,
            reasons: [...new Set(claims.flatMap(freshnessReasons))].sort()
        },
        providers: providerIds,
        fieldComparison,
        claims: claims.map((certificate) => ({
            claimId: certificate?.claimId || null,
            field: certificate?.field || null,
            status: certificate?.status || "blocked",
            comparisonStatus: certificate?.comparison?.status || "unknown",
            blockedReasons: [...new Set([...(Array.isArray(certificate?.blockedReasons) ? certificate.blockedReasons : []), ...freshnessReasons(certificate)])]
        }))
    };
}

function loadEligibilityCertificateRegistry() {
    const file = path.join(dataRoot, eligibilityCertificateRelativePath);
    if (!fs.existsSync(file)) {
        return {
            path: eligibilityCertificateRelativePath,
            kind: null,
            index: new Map(),
            summary: {
                certificateCount: 0,
                candidateClaimCount: 0,
                eligibleCount: 0,
                blockedCount: 0,
                eligibleCandidateCount: 0,
                status: "missing"
            }
        };
    }
    const registry = JSON.parse(fs.readFileSync(file, "utf8"));
    const baseline = readJson("v2/version-baseline.json");
    const sourceCatalogBytes = fs.readFileSync(path.join(dataRoot, "v2", "source-catalog.json"));
    const authority = {
        versionSnapshotId: baseline.snapshotId,
        gameVersion: baseline.targetGameVersion?.gameVersion,
        sourceCatalogDigest: crypto.createHash("sha256").update(sourceCatalogBytes).digest("hex")
    };
    const grouped = new Map();
    (Array.isArray(registry?.certificates) ? registry.certificates : []).forEach((certificate) => {
        const candidateId = String(certificate?.candidateId || "");
        if (!candidateId) return;
        const list = grouped.get(candidateId) || [];
        list.push(certificate);
        grouped.set(candidateId, list);
    });
    const index = new Map([...grouped.entries()].map(([candidateId, claims]) => [
        candidateId,
        summarizeEligibilityCertificates(claims, authority)
    ]));
    const summary = {
        certificateCount: Array.isArray(registry?.certificates) ? registry.certificates.length : 0,
        candidateClaimCount: registry?.summary?.candidateClaimCount
            || (Array.isArray(registry?.certificates) ? registry.certificates.length : 0),
        eligibleCount: registry?.summary?.eligibleCount || 0,
        blockedCount: registry?.summary?.blockedCount || 0,
        eligibleCandidateCount: [...index.values()].filter((item) => item.strictEligible).length,
        status: registry?.kind === "genshinClaimEligibilityCertificateRegistry" ? "loaded" : "invalid"
    };
    return {
        path: eligibilityCertificateRelativePath,
        kind: registry?.kind || null,
        index,
        summary
    };
}

function asObjectEntries(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value) : [];
}

function mergeRecords(...records) {
    return Object.assign({}, ...records.filter((value) => value && typeof value === "object"));
}

function unresolvedDiscrepancies(candidate) {
    return [
        ...(candidate?.discrepancies || []),
        ...(candidate?.verification?.discrepancies || [])
    ].filter((item) => item && item.resolved !== true);
}

function discrepancyCodes(candidate) {
    return unresolvedDiscrepancies(candidate).map((item) => String(item.code || ""));
}

const { collectCandidates } = require("./genshinCandidateRegistry.cjs");

function productionSets() {
    const runtime = readJson("v2/runtime/canonical-runtime.json");
    const productionCandidates = new Set();
    const productionBehaviorSpecs = new Set();
    const historicalCandidates = new Set();
    const historicalBehaviorSpecs = new Set();
    const baseline = auditBaseline({ dataRoot });
    const binding = runtime?.versionBinding;
    const bindingValid = baseline.canonicalGateOpen
        && binding?.status === "strictlyBound"
        && binding?.gameVersion === baseline.targetGameVersion?.gameVersion
        && binding?.acceptedSnapshotId === baseline.acceptedSnapshotId
        && binding?.sourceCatalogDigest === baseline.acceptedSourceCatalogDigest;
    // A stale baseline or binding must move every version-bound overlay to the
    // historical set.  Returning empty sets here would let a reviewed 6.7 Spec
    // look current merely because the baseline digest changed.
    const activeForProduction = bindingValid && runtime?.versionAvailability?.activeForProduction !== false;
    const candidateSet = activeForProduction ? productionCandidates : historicalCandidates;
    const behaviorSpecSet = activeForProduction ? productionBehaviorSpecs : historicalBehaviorSpecs;
    Object.values(runtime.modifiers || {}).forEach((modifier) => {
        if (modifier.runtimeKind === "behavior") {
            candidateSet.add(modifier.id);
            if (modifier.targetSpecId) behaviorSpecSet.add(modifier.targetSpecId);
        } else if (modifier.provenance?.specId) {
            candidateSet.add(modifier.provenance.specId);
        }
    });
    return { productionCandidates, productionBehaviorSpecs, historicalCandidates, historicalBehaviorSpecs };
}

function canonicalExclusions() {
    const audit = buildRepositoryAudit();
    const result = new Map();
    Object.entries(audit.categories).forEach(([category, data]) => {
        (data.excluded || []).forEach((item) => result.set(`${category}:${item.id}`, item.blockedReasons || []));
    });
    return result;
}

const RUNTIME_INPUT_REASON_PATTERNS = Object.freeze({
    RESOURCE_INPUT_REQUIRED: (input) => /^resourceStates\./.test(String(input || "")),
    CONDITION_INPUT_REQUIRED: (input) => /^conditionByModifier\./.test(String(input || "")),
    PROVIDER_INPUT_REQUIRED: (input) => /^providerStats\./.test(String(input || "")),
    RECORDED_HEALING_INPUT_REQUIRED: (input) => String(input || "") === "recordedHealing"
});

// `missingInput` is a calculation-time diagnostic.  Only the analyzer's
// structured route (known reason code, interactive-input lane, and concrete
// required/missing paths) proves that it is a normal runtime user-state
// request rather than a missing consumer/control implementation.
function runtimeInputRoute(legacy) {
    const reasonCode = String(legacy?.reasonCode || "");
    const matcher = RUNTIME_INPUT_REASON_PATTERNS[reasonCode];
    const requiredInputs = Array.isArray(legacy?.requiredInputs) ? legacy.requiredInputs : [];
    const missingInputs = Array.isArray(legacy?.missingInputs) ? legacy.missingInputs : [];
    if (legacy?.supportStatus !== "missingInput"
        || legacy?.inputImplemented !== true
        || legacy?.inputStatus !== "applicable"
        || legacy?.lane !== "interactiveInput"
        || !matcher
        || requiredInputs.length === 0
        || missingInputs.length === 0
        || !requiredInputs.every((input) => matcher(input))
        || !missingInputs.every((input) => matcher(input))
        || !missingInputs.every((input) => requiredInputs.includes(input))) return null;
    return {
        status: "runtimeUserState",
        reasonCode,
        requiredInputs: [...requiredInputs],
        missingInputs: [...missingInputs]
    };
}

function legacySupportById() {
    const result = new Map();
    buildLegacyAudit().records
        .filter((record) => ["weapon-modifiers.json", "artifact-set-modifiers.json"].includes(record.file))
        .forEach((record) => result.set(record.id, {
            supportStatus: record.supportStatus,
            reasonCode: record.reasonCode || null,
            lane: record.lane || null,
            calculable: record.calculable === true,
            inputImplemented: record.inputImplemented === true,
            inputStatus: record.inputStatus || null,
            requiredInputs: Array.isArray(record.requiredInputs) ? [...record.requiredInputs] : [],
            missingInputs: Array.isArray(record.missingInputs) ? [...record.missingInputs] : [],
            inputRoute: runtimeInputRoute(record)
        }));
    return result;
}

function addReason(reasons, reason) {
    if (BLOCK_REASONS.includes(reason) && !reasons.includes(reason)) reasons.push(reason);
}

function machineEvidenceReady(candidate) {
    return candidate?.verification?.machineEvidenceReady === true
        || candidate?.machineEvidenceReady === true;
}

function pendingReviewEvidence(policies = []) {
    const directory = path.join(dataRoot, "v2", "review-pilots");
    const result = new Map();
    if (!fs.existsSync(directory)) return result;
    fs.readdirSync(directory).filter((name) => name.endsWith(".json")).forEach((name) => {
        const pilot = JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
        const candidateId = pilot?.target?.candidateId
            || pilot?.target?.modifierId
            || pilot?.reviewPacket?.target?.candidateId
            || pilot?.reviewPacket?.target?.modifierId;
        const generatedInputsFresh = Object.values(pilot?.generatedFrom || {}).every((input) => {
            if (!input?.path || !input?.sha256) return false;
            const file = path.join(repositoryRoot, input.path);
            return fs.existsSync(file)
                && crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") === input.sha256;
        });
        const sourceDigestsFresh = Object.values(pilot?.sourceRecords || {}).every((source) => source?.rawText
            && source?.integrity?.algorithm === "sha256"
            && crypto.createHash("sha256").update(String(source.rawText), "utf8").digest("hex") === source.integrity.digest);
        if (candidateId && pilot?.assessment?.productionCanonical === false && generatedInputsFresh && sourceDigestsFresh) {
            const sourceRecords = Object.values(pilot.sourceRecords || {});
            const strictBindings = sourceRecords.length > 0 && sourceRecords.every((source) =>
                source?.strictGameVersionBinding === true
                && typeof source.gameVersion === "string"
                && source.gameVersion.length > 0
                && source.integrity?.algorithm === "sha256"
                && typeof source.integrity.digest === "string"
                && source.integrity.digest.length > 0);
            const attestationPresent = sourceRecords.length > 0 && sourceRecords.every((source) =>
                source?.gameVersionEvidence && typeof source.gameVersionEvidence === "object");
            const comparison = pilot?.reviewPacket?.fieldComparison || pilot?.fieldComparison || [];
            const comparisonStatuses = comparison.map((field) => field?.status).filter(Boolean);
            const scopeBoundary = pilot?.reviewPacket?.scopeBoundary || pilot?.scopeBoundary || null;
            const candidateScopeApproved = (Array.isArray(policies) ? policies : [])
                .some((policy) => policy?.status === "candidateApprovedOnly"
                    && (policy.scope || []).includes(String(candidateId)));
            result.set(String(candidateId), {
                pilotFile: `games/genshin/data/v2/review-pilots/${name}`,
                generatedInputsFresh,
                sourceDigestsFresh,
                machineEvidenceReady: pilot?.assessment?.machineEvidenceReady === true,
                humanReviewReady: pilot?.assessment?.machineEvidenceReady === true && pilot?.assessment?.state === "humanReviewReady",
                unresolved: pilot?.reviewPacket?.unresolved || [],
                versionOrProviderCoverageDrift: (pilot?.reviewPacket?.unresolved || []).some((item) => item?.kind === "sourceVersionOrCoverageDrift"),
                consumerImplementationGap: (pilot?.reviewPacket?.unresolved || []).some((item) => item?.kind === "consumerImplementationGap"),
                certificates: {
                    revisionPinned: strictBindings,
                    strictGameVersionBinding: strictBindings,
                    sourceRecordDigestBound: strictBindings,
                    pairScopeApproved: candidateScopeApproved,
                    attestation: {
                        status: attestationPresent ? "present" : "missing",
                        qualifying: attestationPresent,
                        result: attestationPresent ? "provider-version-evidence-present" : "missing"
                    },
                    provider: sourceRecords.map((source) => source.provider).filter(Boolean)
                },
                fieldComparison: {
                    statuses: comparisonStatuses,
                    hasScopedMatch: comparisonStatuses.includes("scopedMatch"),
                    hasMismatch: comparisonStatuses.some((status) => ["mismatch", "conflict"].includes(status)),
                    scopeBoundary
                }
            });
        }
    });
    return result;
}

function officialVersionImpactEvidence(candidates) {
    const empty = {
        valid: false,
        candidateIds: new Set(),
        artifact: null,
        reason: "artifactMissing"
    };
    const transition = readJson("v2/version-transition.json");
    const artifact = "games/genshin/data/v2/version-transitions/6.7-to-7.0/partial-discovery.json";
    if (!artifact || typeof artifact !== "string") return empty;
    const file = path.join(repositoryRoot, artifact);
    if (!fs.existsSync(file)) return { ...empty, artifact, reason: "artifactMissing" };
    const discovery = JSON.parse(fs.readFileSync(file, "utf8"));
    const candidateIds = candidates.map((entry) => entry.id).sort();
    const generatedInputsFresh = Object.values(discovery?.generatedFrom || {}).every((input) => {
        const inputFile = input?.path ? path.join(repositoryRoot, input.path) : null;
        return inputFile && fs.existsSync(inputFile)
            && crypto.createHash("sha256").update(fs.readFileSync(inputFile)).digest("hex") === input.sha256;
    });
    const validation = validatePartialDiscovery(discovery, {
        fromGameVersion: transition?.fromGameVersion,
        toGameVersion: transition?.toGameVersion,
        candidateIds
    });
    const mappings = validation.mappings;
    const valid = validation.valid && generatedInputsFresh;
    if (!valid) return { ...empty, artifact, reason: "evidenceBindingInvalid" };
    const candidateMappings = new Map(mappings.map((item) => [String(item.candidateId), item]));
    return {
        valid: true,
        candidateIds: new Set(candidateMappings.keys()),
        candidateMappings,
        artifact,
        reason: null,
        gameVersion: discovery.claim.toGameVersion,
        fieldDigest: discovery.fieldDigest
    };
}

function transitionClaimPreparationEvidence(candidates, officialVersionImpact) {
    const empty = { valid: false, packets: new Map(), artifact: null, reason: "artifactMissing" };
    const artifact = "games/genshin/data/v2/version-transitions/6.7-to-7.0/claim-reacquisition.json";
    const file = path.join(repositoryRoot, artifact);
    if (!fs.existsSync(file) || !officialVersionImpact?.valid) return { ...empty, artifact };
    const queue = JSON.parse(fs.readFileSync(file, "utf8"));
    const generatedInputsFresh = Object.values(queue?.generatedFrom || {}).every((input) => {
        const inputFile = input?.path ? path.join(repositoryRoot, input.path) : null;
        return inputFile && fs.existsSync(inputFile)
            && crypto.createHash("sha256").update(fs.readFileSync(inputFile)).digest("hex") === input.sha256;
    });
    const validation = validateClaimReacquisition(queue, {
        fromGameVersion: "6.7",
        toGameVersion: officialVersionImpact.gameVersion,
        candidateIds: candidates.map((entry) => entry.id),
        partialDiscoveryFieldDigest: officialVersionImpact.fieldDigest
    });
    if (!validation.valid || !generatedInputsFresh) return { ...empty, artifact, reason: "evidenceBindingInvalid" };
    return {
        valid: true,
        artifact,
        fieldDigest: queue.fieldDigest,
        packets: new Map(validation.packets.map((packet) => [String(packet.candidateId), packet])),
        reason: null
    };
}

function scopedTransitionSearchFrontier(sourceSearch, officialVersionImpact) {
    const frontier = (sourceSearch?.scopedFrontiers || []).find((item) => item?.appliesTo?.transitionId === "genshin:6.7->7.0");
    if (!frontier || frontier.status !== "searchExhausted" || !officialVersionImpact?.valid) return null;
    const valid = frontier.appliesTo?.candidateCount === officialVersionImpact.candidateIds.size
        && frontier.appliesTo?.partialDiscoveryFieldDigest === officialVersionImpact.fieldDigest
        && typeof frontier.searchScope === "string" && frontier.searchScope.length > 0
        && typeof frontier.lastSearchedAt === "string" && frontier.lastSearchedAt.length > 0
        && Array.isArray(frontier.providersExamined) && frontier.providersExamined.length > 0
        && typeof frontier.negativeResult === "string" && frontier.negativeResult.length > 0
        && typeof frontier.reopenTrigger === "string" && frontier.reopenTrigger.length > 0;
    return valid ? frontier : null;
}

function scopedKqmArtifactSearchFrontier(policies) {
    const policy = (policies || []).find((item) => item?.id === "artifacts:kqm-tcl+genshin-db");
    const relativeEvidencePath = "v2/external/kqm-artifact-field-evidence.json";
    const evidencePath = path.join(dataRoot, relativeEvidencePath);
    if (policy?.searchStatus !== "searchExhausted" || !fs.existsSync(evidencePath)) return null;
    const evidenceBytes = fs.readFileSync(evidencePath);
    const evidenceSha256 = crypto.createHash("sha256").update(evidenceBytes).digest("hex");
    if (evidenceSha256 !== policy.evidenceFileSha256) return null;
    const evidence = JSON.parse(evidenceBytes.toString("utf8"));
    const fields = Array.isArray(evidence?.fields) ? evidence.fields : [];
    const candidateIds = [...new Set(fields.map((field) => String(field?.candidateId || "")).filter(Boolean))].sort();
    const candidateIdDigest = crypto.createHash("sha256").update(JSON.stringify(candidateIds)).digest("hex");
    const allFieldsRemainBlocked = fields.length === candidateIds.length
        && fields.every((field) => field?.status === "evidenceOnlyBlocked"
            && field?.blockedReasons?.includes("gameVersionUnbound"));
    const valid = evidence?.kind === "genshinKqmArtifactFieldEvidence"
        && evidence?.pairPolicy?.status === "evidenceOnlyBlocked"
        && evidence?.summary?.canonicalEligibleCount === 0
        && evidence?.summary?.fieldComparisonCount === policy.candidateCount
        && candidateIds.length === policy.candidateCount
        && candidateIdDigest === policy.candidateIdDigest
        && allFieldsRemainBlocked
        && typeof policy.searchScope === "string" && policy.searchScope.length > 0
        && typeof policy.lastSearchedAt === "string" && policy.lastSearchedAt.length > 0
        && Array.isArray(policy.providersExamined) && policy.providersExamined.length > 0
        && typeof policy.negativeResult === "string" && policy.negativeResult.length > 0
        && typeof policy.reopenTrigger === "string" && policy.reopenTrigger.length > 0;
    return valid ? { policy, candidateIds: new Set(candidateIds) } : null;
}

function scopedSearchFrontierRegistry(registry, candidates) {
    const knownCandidates = new Map(candidates.map((entry) => [entry.id, entry]));
    const byCandidate = new Map();
    const duplicatedCandidates = new Set();
    if (registry?.schemaVersion !== 1 || registry?.kind !== "genshinSourceSearchFrontierRegistry") return byCandidate;
    for (const frontier of registry?.frontiers || []) {
        const declaredCandidateIds = Array.isArray(frontier?.appliesTo?.candidateIds)
            ? [...new Set(frontier.appliesTo.candidateIds.map(String))]
            : [];
        // Existing frontiers use the historical default lexical order.  A
        // candidate-scoped audited frontier may instead carry an explicit
        // auditDigest; preserve its declared order so its candidate digest is
        // not silently recomputed under a different ordering convention.
        const candidateIds = frontier?.auditDigest
            ? declaredCandidateIds
            : declaredCandidateIds.sort();
        const candidateIdDigest = crypto.createHash("sha256").update(JSON.stringify(candidateIds)).digest("hex");
        const scopeMatches = candidateIds.every((candidateId) => {
            const candidate = knownCandidates.get(candidateId);
            const datasetMatches = candidate && (
                candidate.dataset === frontier.appliesTo.dataset
                // BehaviorSpec candidates are stored in versioned batch
                // datasets.  A candidate-scoped frontier may intentionally
                // cover more than one batch only when it names the explicit
                // behavior family and still supplies the exact ID digest.
                || (frontier.appliesTo.dataset === "behavior"
                    && frontier.appliesTo.layer === "behaviorSpec"
                    && candidate.layer === "behaviorSpec"
                    && /^behaviorBatch\d+$/.test(String(candidate.dataset)))
            );
            return candidate
                && datasetMatches
                && candidate.layer === frontier.appliesTo.layer
                && (frontier.appliesTo.pieceSlot !== "fourPiece" || candidateId.includes(":fourPiece:"));
        });
        const evidenceRefsResolve = Array.isArray(frontier.evidenceRefs)
            && frontier.evidenceRefs.length > 0
            && frontier.evidenceRefs.every((ref) => fs.existsSync(path.join(repositoryRoot, ref)));
        const valid = frontier.status === "searchExhausted"
            && candidateIds.length > 0
            && candidateIds.length === frontier.appliesTo.candidateCount
            && candidateIdDigest === frontier.appliesTo.candidateIdDigest
            && scopeMatches
            && evidenceRefsResolve
            && typeof frontier.searchScope === "string" && frontier.searchScope.length > 0
            && typeof frontier.lastSearchedAt === "string" && frontier.lastSearchedAt.length > 0
            && Array.isArray(frontier.providersExamined) && frontier.providersExamined.length > 0
            && typeof frontier.negativeResult === "string" && frontier.negativeResult.length > 0
            && typeof frontier.reopenTrigger === "string" && frontier.reopenTrigger.length > 0;
        if (!valid) continue;
        candidateIds.forEach((candidateId) => {
            if (byCandidate.has(candidateId)) duplicatedCandidates.add(candidateId);
            else byCandidate.set(candidateId, frontier);
        });
    }
    duplicatedCandidates.forEach((candidateId) => byCandidate.delete(candidateId));
    return byCandidate;
}

function verifiedWithoutOpenMeaning(candidate) {
    const verification = candidate?.verification || {};
    const codes = discrepancyCodes(candidate);
    const substantive = codes.filter((code) => ![
        "CANONICAL_RUNTIME_FORBIDDEN",
        "CONSUMER_NOT_REQUIRED",
        "CONSUMER_PENDING"
    ].includes(code));
    if (verification.status !== "verified"
        || verification.sourceAgreement !== "agreed"
        || substantive.length > 0) return false;

    // Older reviewed representatives predate an explicit verificationMode.
    // Keep their scoped human attestation behavior unchanged, but never treat
    // deterministicConsensus as human simply because review metadata happens
    // to be present.
    const legacyHuman = verification.verificationMode !== "deterministicConsensus"
        && (verification.verificationMode === undefined || verification.verificationMode === "human")
        && Boolean(verification.reviewedBy && verification.reviewedAt);
    if (legacyHuman) return true;

    if (verification.verificationMode !== "deterministicConsensus") return false;

    // The state machine is the authority for deterministic attestation and
    // candidate-by-claim certificate binding.  A status/sourceAgreement pair
    // alone must not manufacture a verified BehaviorSpec.
    const candidateClaims = candidate?.claims;
    const claims = candidateClaims && typeof candidateClaims === "object" && !Array.isArray(candidateClaims)
        && Object.keys(candidateClaims).length
        ? candidateClaims
        : verification.claims || {};
    const claimEntries = Object.entries(claims);
    if (!claimEntries.length || claimEntries.some(([, claim]) =>
        !claim || !["verified", "notApplicable"].includes(claim.status))) return false;
    return verificationStateMachine.assessVerificationGate({
        ...candidate,
        claims,
        verification: { ...verification, claims }
    }).ready;
}

function classifyBlockReasons(entry, rawReasons, legacy, pendingMetadata = null) {
    const { layer } = entry;
    const reasons = [];

    // Every sourceRef resolves to repository bytes. `sourceMissing` here means
    // that a second strict, field-scoped, independent external source is absent;
    // it does not mean that population work was never started.
    addReason(reasons, "sourceMissing");
    addReason(reasons, "gameVersionUnbound");
    if (["weaponEffectSpec", "artifactEffectSpec"].includes(layer)) {
        addReason(reasons, "providerIndependenceUnknown");
    } else {
        addReason(reasons, "providerIndependenceCorrelated");
        addReason(reasons, "semanticDecisionRequired");
    }

    // BehaviorSpec verification is independent of Runtime consumer materialization.
    // Keep a consumer blocker only when evidence explicitly reports a real gap.
    if (pendingMetadata?.versionOrProviderCoverageDrift) addReason(reasons, "versionOrProviderCoverageDrift");
    if (pendingMetadata?.consumerImplementationGap) addReason(reasons, "consumerMissing");

    if (legacy?.supportStatus === "missingInput") addReason(reasons, "inputMissing");
    if (legacy?.supportStatus === "unsupported") addReason(reasons, "unsupported");
    if (legacy?.supportStatus === "invalidData") addReason(reasons, "invalid");
    if (legacy?.supportStatus === "displayOnly") addReason(reasons, "displayOnly");
    return reasons;
}

function primaryBlockReason(entry, blockReasons) {
    const { layer } = entry;
    const has = (reason) => blockReasons.includes(reason);
    if (has("invalid")) return "invalid";
    if (has("sourceDiscrepancy")) return "sourceDiscrepancy";
    if (has("schemaGap")) return "schemaGap";
    if (has("versionOrProviderCoverageDrift")) return "versionOrProviderCoverageDrift";
    if (["weaponEffectSpec", "artifactEffectSpec"].includes(layer)) {
        if (has("inputMissing")) return "inputMissing";
        if (has("unsupported")) return "unsupported";
        if (has("displayOnly")) return "displayOnly";
        return "sourceMissing";
    }
    if (has("semanticDecisionRequired")) return "semanticDecisionRequired";
    if (has("sourceMissing")) return "sourceMissing";
    if (has("gameVersionUnbound")) return "gameVersionUnbound";
    if (has("providerIndependenceUnknown")) return "providerIndependenceUnknown";
    if (has("consumerMissing")) return "consumerMissing";
    return blockReasons[0] || null;
}

function waitOnFor(entry, primaryReason) {
    if (!primaryReason) return [];
    if (primaryReason === "semanticDecisionRequired") return ["source/provider", "human"];
    if (["inputMissing", "unsupported", "displayOnly", "schemaGap", "consumerMissing"].includes(primaryReason)) {
        return ["source/provider", "consumer"];
    }
    if (["invalid", "sourceDiscrepancy"].includes(primaryReason)) return ["source/provider", "human"];
    return ["source/provider"];
}

function completionRequirements(entry, primaryReason, legacy = null) {
    const commonSource = "Provide two independent, field-scoped sources with exact revision/digest and explicit Genshin gameVersion binding; compare every required field with no unresolved discrepancy.";
    if (!primaryReason) return [];
    if (primaryReason === "inputMissing") return [
        runtimeInputRoute(legacy)
            ? "Supply or reconcile the existing structured runtime input control for the analyzer-reported state; implement a consumer only if a separate consumer gap is evidenced."
            : "Implement the missing CalculationInput/condition/resource control only when analyzer evidence shows no existing runtime input route satisfies the requirement; otherwise supply or reconcile that control.",
        commonSource,
        "Generate the candidate review packet; obtain human approval or valid deterministicConsensus certification, then generate canonical Runtime, supersede legacy, and pass regressions."
    ];
    if (primaryReason === "unsupported") return [
        "Define and approve the required custom formula or supported schema/consumer route.",
        commonSource,
        "Generate the candidate review packet; obtain human approval or valid deterministicConsensus certification, then generate canonical Runtime, supersede legacy, and pass regressions."
    ];
    if (primaryReason === "displayOnly") return [
        "Confirm whether the display-only record intentionally has no calculation consumer or define a supported consumer.",
        commonSource,
        "If a consumer is required, prepare review and canonical Runtime; otherwise retain the explicit display-only terminal disposition."
    ];
    if (primaryReason === "semanticDecisionRequired") return [
        commonSource,
        "Resolve unknown target/value/condition/timing semantics without AI inference.",
        entry.layer === "behaviorSpec"
            ? "After the unknown semantics are resolved, mark the structured BehaviorSpec verified through human approval or valid deterministicConsensus certification when all claims pass the strict proof gate; a RuntimeModifier is required only when a real consumer exists."
            : "After the unknown semantics are resolved, materialize the verified destination/Runtime route through human approval or valid deterministicConsensus certification when all claims pass the strict proof gate, then prepare regressions where production-connected."
    ];
    return [
        commonSource,
        "Run deterministic mapping, Runtime-route, stale-evidence, and regression checks.",
        "Generate a batch review packet; obtain human approval or valid deterministicConsensus certification before production promotion."
    ];
}

function mappingStatusFor(entry, terminalState) {
    const candidate = entry.candidate || {};
    if (["productionCanonical", "verifiedSpec"].includes(terminalState)) return "connected";
    if (["weaponEffectSpec", "artifactEffectSpec"].includes(entry.layer)) {
        return candidate.destination
            && Array.isArray(candidate.supersedesLegacyModifierIds)
            ? "prepared"
            : "missing";
    }
    if (entry.layer === "behaviorModifier") return candidate.runtime?.status === "blocked" ? "pending" : "prepared";
    if (["behaviorSpec", "talentGapEffectSpec"].includes(entry.layer)) {
        return candidate.runtime?.status === "blocked" ? "pending" : "prepared";
    }
    return "notApplicable";
}

function localizedProviderIdentityEvidence() {
    const result = {
        entityId: localizedIdentityCapture.entity.entityId,
        evidenceRef: path.relative(repositoryRoot, localizedIdentityCapture.outputPath).replaceAll("\\", "/"),
        status: "evidenceUnavailable",
        fieldDigest: null,
        authority: "identityOnlyNotMechanicVerification",
        certificateEligible: false,
        reasons: []
    };
    try {
        const stored = JSON.parse(fs.readFileSync(localizedIdentityCapture.outputPath, "utf8"));
        const validation = localizedIdentityCapture.validateSnapshot(stored);
        const fresh = localizedIdentityCapture.buildSnapshot();
        result.reasons = [...validation.reasons];
        if (stored.fieldDigest !== fresh.fieldDigest) result.reasons.push("staleIdentityBridge");
        if (result.reasons.length) result.status = "evidenceInvalid";
        else {
            result.fieldDigest = fresh.fieldDigest;
            result.status = fresh.claim.identityBridge.status;
            result.providerSlug = fresh.claim.entity.providerSlug;
            result.providerId = fresh.claim.entity.providerId;
            result.sourceFamily = fresh.claim.sourceFamily;
            result.preservedNegativeAliasRecords = fresh.claim.negativeAliasEvidence.records.length;
        }
    } catch (error) {
        result.status = "evidenceUnavailable";
        result.reasons.push(error.message);
    }
    return result;
}

function classifyCandidates(options = {}) {
    const candidates = collectCandidates();
    const candidatesById = new Map(candidates.map((entry) => [entry.id, entry.candidate]));
    const identityAssessments = buildEntityIdentityAssessments({ dataRoot });
    const localizedIdentity = localizedProviderIdentityEvidence();
    const { productionCandidates, productionBehaviorSpecs, historicalCandidates, historicalBehaviorSpecs } = productionSets();
    const exclusions = canonicalExclusions();
    const legacyById = legacySupportById();
    const policies = options.policies || readJson("v2/provider-independence-policy.json").policies || [];
    const certificateRegistry = options.eligibilityCertificateRegistry || loadEligibilityCertificateRegistry();
    const eligibilityCertificates = options.eligibilityCertificates || certificateRegistry.index;
    const pendingEvidence = pendingReviewEvidence(policies);
    const officialVersionImpact = officialVersionImpactEvidence(candidates);
    const transitionClaimPreparation = transitionClaimPreparationEvidence(candidates, officialVersionImpact);
    const transitionSearchFrontier = scopedTransitionSearchFrontier(options.evidenceContext?.transitionSourceSearch, officialVersionImpact);
    const kqmArtifactSearchFrontier = scopedKqmArtifactSearchFrontier(policies);
    const registeredSearchFrontiers = scopedSearchFrontierRegistry(options.evidenceContext?.sourceSearchFrontiers, candidates);
    const behaviorCaptures = (options.evidenceContext?.behaviorEntitySnapshots || [])
        .map((entry) => ({ claim: entry?.snapshot?.claim || null, evidenceRef: entry?.evidenceRef || null }))
        .filter((entry) => entry.claim && entry.evidenceRef);
    const weaponCaptures = (options.evidenceContext?.weaponEntitySnapshots || [])
        .map((entry) => ({ claim: entry?.snapshot?.claim || null, evidenceRef: entry?.evidenceRef || null }))
        .filter((entry) => entry.claim && entry.evidenceRef);
    return candidates.map((entry) => {
        const legacyId = entry.candidate?.effect?.legacyModifierId || entry.id;
        const legacy = legacyById.get(legacyId) || null;
        const rawBlockedReasons = exclusions.get(`${entry.canonicalCategory}:${entry.id}`) || [];
        const pendingMetadata = pendingEvidence.get(entry.id) || null;
        const officialVersionImpactPending = officialVersionImpact.valid
            && officialVersionImpact.candidateIds.has(entry.id);
        const officialVersionImpactMapping = officialVersionImpactPending
            ? officialVersionImpact.candidateMappings.get(entry.id)
            : null;
        const transitionClaimPacket = transitionClaimPreparation.valid
            ? transitionClaimPreparation.packets.get(entry.id) || null
            : null;
        const eligibilityCertificate = eligibilityCertificates.get(String(entry.id)) || {
            certificateCount: 0,
            eligibleClaimCount: 0,
            blockedClaimCount: 0,
            status: "missing",
            strictEligible: false,
            providers: [],
            fieldComparison: {
                statuses: [],
                hasScopedMatch: false,
                hasMismatch: false,
                scopeBoundary: null
            },
            claims: []
        };
        const entityId = String(entry.candidate?.entity?.id || "");
        const identityEntityId = entityId || String((entry.candidate?.targetSpec
            || candidatesById.get(entry.candidate?.targetSpecId))?.entity?.id || "");
        const identityConsistency = ["behaviorSpec", "behaviorModifier", "talentGapEffectSpec"].includes(entry.layer)
            ? identityAssessments.get(identityEntityId) || {
                entityId: identityEntityId, blocked: true, classification: "evidenceUnavailable",
                reasons: ["identityEntityNotResolved"], consumerCoverageGap: false
            } : null;
        const weaponCapture = weaponCaptures.find(({ claim }) => claim.records?.some((record) => String(record.entityId) === entityId)) || null;
        const resolvedBehaviorCapture = behaviorCaptures.find(({ claim }) => claim.resolvedEntities?.some((record) => String(record.entityId) === entityId)) || null;
        const ambiguousBehaviorCapture = behaviorCaptures.find(({ claim }) => claim.variantAmbiguities?.some((record) => String(record.entityId) === entityId)) || null;
        const bulkTransitionCapture = entry.layer === "weaponEffectSpec"
            ? weaponCapture ? {
                status: "targetEntityRawDiffCapturedSingleCorrelatedFamily",
                evidenceRef: weaponCapture.evidenceRef,
                sourceFamily: "GenshinData-derived",
                certificateEligible: false
            } : null
            : entry.layer === "behaviorSpec"
                ? resolvedBehaviorCapture ? {
                    status: "targetDisplayRecordCapturedSingleCorrelatedFamily",
                    evidenceRef: resolvedBehaviorCapture.evidenceRef,
                    sourceFamily: resolvedBehaviorCapture.claim.sourceFamily,
                    certificateEligible: false
                } : ambiguousBehaviorCapture ? {
                    status: "targetVariantAmbiguityCapturedFailClosed",
                    evidenceRef: ambiguousBehaviorCapture.evidenceRef,
                    sourceFamily: ambiguousBehaviorCapture.claim.sourceFamily,
                    certificateEligible: false
                } : null
                : null;
        let terminalState;
        let blockReasons = [];
        let primaryReason = null;
        let consumerStatus = "notApplicable";
        const historicalCanonicalPendingRevalidation = historicalCandidates.has(entry.id) || historicalBehaviorSpecs.has(entry.id);
        const officialReactionConsumerPending = officialVersionImpactMapping?.mappingStatus === "reactionConsumerTransition";
        if (productionCandidates.has(entry.id)) {
            terminalState = "productionCanonical";
            consumerStatus = "productionConnected";
        } else if (entry.layer === "behaviorSpec" && verifiedWithoutOpenMeaning(entry.candidate)) {
            terminalState = "verifiedSpec";
            consumerStatus = productionBehaviorSpecs.has(entry.id)
                ? "productionConnected"
                : historicalBehaviorSpecs.has(entry.id) ? "historicalCanonicalPendingRevalidation" : "consumerNotRequiredOrPending";
        } else if (legacy?.supportStatus === "displayOnly"
            && ["SUPERSEDED_RECORD", "EXPLICIT_DISPLAY_ONLY"].includes(legacy.reasonCode)) {
            terminalState = "nonCalculativeComplete";
            consumerStatus = legacy.reasonCode === "SUPERSEDED_RECORD" ? "supersededByStructuredRecord" : "explicitlyNonCalculative";
        } else if ((machineEvidenceReady(entry.candidate) || pendingMetadata?.humanReviewReady === true)
            && entry.candidate?.verification?.status !== "verified") {
            terminalState = "awaitingHumanReview";
            consumerStatus = "prepared";
        } else {
            terminalState = "blocked";
            blockReasons = classifyBlockReasons(entry, rawBlockedReasons, legacy, pendingMetadata);
            if (officialVersionImpactPending) addReason(blockReasons, "versionOrProviderCoverageDrift");
            if (officialReactionConsumerPending) addReason(blockReasons, "consumerMissing");
            primaryReason = primaryBlockReason(entry, blockReasons);
            consumerStatus = pendingMetadata?.consumerImplementationGap || officialReactionConsumerPending
                ? "formulaPending"
                : blockReasons.includes("consumerMissing") ? "missingOrPending" : "notApplicable";
        }
        if (historicalCanonicalPendingRevalidation && consumerStatus !== "historicalCanonicalPendingRevalidation") {
            consumerStatus = "historicalCanonicalPendingRevalidation";
        }
        const strictExternalPending = terminalState === "blocked"
            && eligibilityCertificate.status !== "eligible"
            && blockReasons.some((reason) => [
                "sourceMissing",
                "gameVersionUnbound",
                "providerIndependenceUnknown",
                "providerIndependenceCorrelated",
                "versionOrProviderCoverageDrift",
                "sourceDiscrepancy"
            ].includes(reason));
        const waitOn = terminalState === "awaitingHumanReview"
            ? ["human"]
            : strictExternalPending
                ? pendingMetadata?.consumerImplementationGap || officialReactionConsumerPending
                    ? ["source/provider", "consumer"]
                    : ["source/provider"]
                : terminalState === "blocked"
                    ? waitOnFor(entry, primaryReason)
                    : [];
        const defaultSearchFrontier = deriveSearchFrontier({
            id: entry.id,
            layer: entry.layer,
            dataset: entry.dataset,
            terminalState,
            primaryBlockReason: primaryReason,
            blockReasons,
            evidence: {
                officialVersionImpact: officialVersionImpactPending ? {
                    status: "reacquisitionRequired",
                    gameVersion: officialVersionImpact.gameVersion,
                    fieldDigest: officialVersionImpact.fieldDigest,
                    evidenceRef: officialVersionImpact.artifact,
                    mappingStatus: officialVersionImpactMapping.mappingStatus,
                    officialChangeId: officialVersionImpactMapping.officialChangeId,
                    claimScope: officialVersionImpactMapping.claimScope
                } : null,
                eligibilityCertificate,
                fieldComparison: pendingMetadata?.fieldComparison || null
            }
        }, policies);
        const boundedSearchFrontier = officialVersionImpactPending && transitionSearchFrontier
            ? { policy: transitionSearchFrontier, scopeUnit: "transition-candidate-set" }
            : kqmArtifactSearchFrontier?.candidateIds.has(entry.id)
                ? { policy: kqmArtifactSearchFrontier.policy, scopeUnit: "candidate-field-set" }
                : registeredSearchFrontiers.has(entry.id)
                    ? { policy: registeredSearchFrontiers.get(entry.id), scopeUnit: "candidate-field-set" }
                : null;
        const boundedCandidateIdDigest = boundedSearchFrontier?.policy?.appliesTo?.candidateIdDigest || null;
        const boundedAuditDigest = boundedSearchFrontier?.policy?.auditDigest
            || boundedSearchFrontier?.policy?.sourceAuditDigest
            || null;
        const searchFrontier = boundedSearchFrontier ? {
            status: "searchExhausted",
            exhausted: true,
            policyId: boundedSearchFrontier.policy.policyId || boundedSearchFrontier.policy.id,
            searchScope: boundedSearchFrontier.policy.searchScope,
            lastSearchedAt: boundedSearchFrontier.policy.lastSearchedAt,
            providersExamined: [...boundedSearchFrontier.policy.providersExamined],
            reopenTrigger: boundedSearchFrontier.policy.reopenTrigger,
            blockingReasons: [...new Set(blockReasons.filter((reason) => ["sourceMissing", "gameVersionUnbound", "providerIndependenceUnknown", "providerIndependenceCorrelated", "versionOrProviderCoverageDrift", "sourceDiscrepancy"].includes(reason)))],
            scopeMatched: true,
            scopeUnit: boundedSearchFrontier.scopeUnit,
            // Candidate-scoped frontier metadata is optional and only
            // propagated when the registered frontier explicitly supplies a
            // candidate digest plus an audit digest.  Existing frontier task
            // shapes (and their queue digests) remain unchanged.
            ...(boundedAuditDigest && boundedCandidateIdDigest
                ? {
                    frontierId: boundedSearchFrontier.policy.id,
                    candidateIds: Array.isArray(boundedSearchFrontier.policy.appliesTo.candidateIds)
                        ? [...boundedSearchFrontier.policy.appliesTo.candidateIds]
                        : [],
                    candidateIdDigest: boundedCandidateIdDigest,
                    ...(boundedSearchFrontier.policy.auditDigest
                        ? { auditDigest: boundedSearchFrontier.policy.auditDigest }
                        : {}),
                    ...(boundedSearchFrontier.policy.sourceAuditDigest
                        ? { sourceAuditDigest: boundedSearchFrontier.policy.sourceAuditDigest }
                        : {})
                }
                : {})
        } : defaultSearchFrontier;
        const baseRecord = {
            id: entry.id,
            dataset: entry.dataset,
            layer: entry.layer,
            entity: entry.candidate?.entity || null,
            historicalCanonicalPendingRevalidation,
            terminalState,
            blockReasons,
            primaryBlockReason: primaryReason,
            waitOn,
            autoProcessableNow: false,
            automationStatus: terminalState === "verifiedSpec" && historicalCanonicalPendingRevalidation
                ? "waitingTargetVersionReverification"
                : ["productionCanonical", "verifiedSpec", "nonCalculativeComplete"].includes(terminalState) ? "complete"
                : terminalState === "awaitingHumanReview"
                    ? "humanReviewOnly"
                    : "waitingExternalPrecondition",
            machinePreparation: terminalState === "nonCalculativeComplete"
                ? legacy.reasonCode === "SUPERSEDED_RECORD" ? "supersededLegacyRecordClosed" : "explicitNonDamageDisplayClosed"
                : ["weaponEffectSpec", "artifactEffectSpec"].includes(entry.layer)
                ? "mappingRouteAndLegacySupersessionPrepared"
                : entry.layer === "behaviorSpec"
                    ? "structuredSpecGenerated"
                    : entry.layer === "behaviorModifier"
                        ? "sharedBehaviorShapeValidated"
                        : "candidateGenerated",
            completionRequirements: terminalState === "blocked"
                ? completionRequirements(entry, primaryReason, legacy)
                : terminalState === "awaitingHumanReview"
                    ? ["A human reviewer must approve, hold, or reject the prepared candidate/batch packet, or the candidate must receive complete deterministicConsensus certification."]
                    : [],
            searchStatus: searchFrontier.status,
            sourceFrontierPolicyId: searchFrontier.policyId,
            searchFrontier,
            machineEvidenceReady: machineEvidenceReady(entry.candidate) || pendingMetadata?.machineEvidenceReady === true,
            preparedTransitionClaimCount: transitionClaimPacket?.claimPackets?.length || 0,
            transitionClaimSchemaStatus: transitionClaimPacket?.claimSchemaStatus || null,
            verificationStatus: entry.candidate?.verification?.status || "unknown",
            consumerStatus,
            mappingStatus: mappingStatusFor(entry, terminalState),
            evidence: {
                officialVersionImpact: officialVersionImpactPending ? {
                    status: "reacquisitionRequired",
                    gameVersion: officialVersionImpact.gameVersion,
                    fieldDigest: officialVersionImpact.fieldDigest,
                    evidenceRef: officialVersionImpact.artifact,
                    mappingStatus: officialVersionImpactMapping.mappingStatus,
                    officialChangeId: officialVersionImpactMapping.officialChangeId,
                    claimScope: officialVersionImpactMapping.claimScope
                } : null,
                transitionClaimPreparation: transitionClaimPacket ? {
                    status: "preparedFailClosed",
                    evidenceRef: transitionClaimPreparation.artifact,
                    fieldDigest: transitionClaimPreparation.fieldDigest,
                    claimSchemaStatus: transitionClaimPacket.claimSchemaStatus,
                    providerCaptureStatus: transitionClaimPacket.providerCaptureStatus,
                    claimCount: transitionClaimPacket.claimPackets.length,
                    certificateEligible: false,
                    promotionEligible: false
                } : null,
                bulkTransitionCapture,
                identityConsistency,
                providerIdentityReconciliation: identityEntityId === localizedIdentity.entityId ? localizedIdentity : null,
                certificates: pendingMetadata?.certificates || {
                    revisionPinned: false,
                    strictGameVersionBinding: false,
                    sourceRecordDigestBound: false,
                    pairScopeApproved: false,
                    attestation: {
                        status: "missing",
                        qualifying: false,
                        result: "candidate-pilot-certificate-not-materialized"
                    },
                    provider: []
                },
                // This exact candidate×claim summary is the sole strict
                // evidence authority. The pilot certificate object above is
                // retained as historical diagnostic metadata only.
                eligibilityCertificate,
                fieldComparison: pendingMetadata?.fieldComparison || {
                    statuses: [],
                    hasScopedMatch: false,
                    hasMismatch: false,
                    scopeBoundary: null
                },
                pilotFile: pendingMetadata?.pilotFile || null,
                generatedInputsFresh: pendingMetadata?.generatedInputsFresh === true,
                sourceDigestsFresh: pendingMetadata?.sourceDigestsFresh === true,
                verificationClaims: Object.keys(entry.candidate?.verification?.claims || {}),
                unresolvedDiscrepancies: discrepancyCodes(entry.candidate)
            },
            legacy,
            rawGateBlockers: rawBlockedReasons
        };
        baseRecord.evidence.fieldComparison.hasMismatch = baseRecord.evidence.fieldComparison.hasMismatch
            || eligibilityCertificate.fieldComparison.hasMismatch;
        baseRecord.evidence.fieldComparison.hasScopedMatch = baseRecord.evidence.fieldComparison.hasScopedMatch
            || eligibilityCertificate.fieldComparison.hasScopedMatch;
        baseRecord.autoProcessableNow = canAutomaticallyProcess(baseRecord);
        baseRecord.nextTask = deriveNextTask(baseRecord, searchFrontier);
        return baseRecord;
    });
}

function emptyCounts() {
    return {
        total: 0,
        productionCanonical: 0,
        awaitingHumanReview: 0,
        verifiedSpec: 0,
        nonCalculativeComplete: 0,
        historicalCanonicalPendingRevalidation: 0,
        blocked: 0,
        unclassified: 0,
        machineEvidenceReady: 0,
        autoProcessableNow: 0,
        blockReasons: Object.fromEntries(BLOCK_REASONS.map((reason) => [reason, 0])),
        primaryBlockReasons: Object.fromEntries(BLOCK_REASONS.map((reason) => [reason, 0])),
        waitOn: {
            "source/provider": 0,
            human: 0,
            consumer: 0
        }
    };
}

function summarize(records) {
    const totals = emptyCounts();
    const byLayer = {};
    const byDataset = {};
    records.forEach((record) => {
        const targets = [totals, byLayer[record.layer] ||= emptyCounts(), byDataset[record.dataset] ||= emptyCounts()];
        targets.forEach((counts) => {
            counts.total += 1;
            if (TERMINAL_STATES.includes(record.terminalState)) counts[record.terminalState] += 1;
            else counts.unclassified += 1;
            if (record.machineEvidenceReady) counts.machineEvidenceReady += 1;
            if (record.autoProcessableNow) counts.autoProcessableNow += 1;
            if (record.historicalCanonicalPendingRevalidation) counts.historicalCanonicalPendingRevalidation += 1;
            record.blockReasons.forEach((reason) => { counts.blockReasons[reason] += 1; });
            if (record.primaryBlockReason) counts.primaryBlockReasons[record.primaryBlockReason] += 1;
            record.waitOn.forEach((wait) => { counts.waitOn[wait] += 1; });
        });
    });
    return { totals, byLayer, byDataset };
}

function buildTerminalStateAudit({ sourceSearchFrontiersOverride = null } = {}) {
    const providerPolicies = readJson("v2/provider-independence-policy.json").policies || [];
    const versionEvidence = readJson("v2/game-version-evidence.json");
    const transitionSourceSearch = readJson("v2/version-transitions/6.7-to-7.0/source-search.json");
    // Callers may provide a validated in-memory frontier registry for a
    // bounded preview.  The default remains the persisted registry, and this
    // function never writes the override.
    const sourceSearchFrontiers = sourceSearchFrontiersOverride
        || readJson("v2/source-search-frontiers.json");
    const behaviorEntitySnapshots = [
        {
            snapshot: readJson("v2/version-transitions/6.7-to-7.0/behavior-entity-snapshot.json"),
            evidenceRef: "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-entity-snapshot.json"
        },
        {
            snapshot: readJson("v2/version-transitions/6.7-to-7.0/behavior-shard-02-snapshot.json"),
            evidenceRef: "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-02-snapshot.json"
        },
        {
            snapshot: readJson("v2/version-transitions/6.7-to-7.0/behavior-shard-03-snapshot.json"),
            evidenceRef: "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-03-snapshot.json"
        },
        {
            snapshot: readJson("v2/version-transitions/6.7-to-7.0/behavior-shard-04-snapshot.json"),
            evidenceRef: "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-04-snapshot.json"
        },
        {
            snapshot: readJson("v2/version-transitions/6.7-to-7.0/behavior-shard-05-snapshot.json"),
            evidenceRef: "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-05-snapshot.json"
        },
        {
            snapshot: readJson("v2/version-transitions/6.7-to-7.0/behavior-shard-06-snapshot.json"),
            evidenceRef: "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-06-snapshot.json"
        },
        {
            snapshot: readJson("v2/version-transitions/6.7-to-7.0/behavior-shard-07-snapshot.json"),
            evidenceRef: "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-07-snapshot.json"
        },
        {
            snapshot: readJson("v2/version-transitions/6.7-to-7.0/behavior-shard-08-snapshot.json"),
            evidenceRef: "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-08-snapshot.json"
        },
        {
            snapshot: readJson("v2/version-transitions/6.7-to-7.0/behavior-shard-09-snapshot.json"),
            evidenceRef: "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-09-snapshot.json"
        },
        {
            snapshot: readJson("v2/version-transitions/6.7-to-7.0/behavior-shard-10-snapshot.json"),
            evidenceRef: "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-10-snapshot.json"
        },
        {
            snapshot: readJson("v2/version-transitions/6.7-to-7.0/behavior-shard-11-snapshot.json"),
            evidenceRef: "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-11-snapshot.json"
        },
        {
            snapshot: readJson("v2/version-transitions/6.7-to-7.0/behavior-shard-12-snapshot.json"),
            evidenceRef: "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-12-snapshot.json"
        },
        {
            snapshot: readJson("v2/version-transitions/6.7-to-7.0/behavior-shard-13-snapshot.json"),
            evidenceRef: "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-13-snapshot.json"
        },
        {
            snapshot: readJson("v2/version-transitions/6.7-to-7.0/behavior-shard-14-snapshot.json"),
            evidenceRef: "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-14-snapshot.json"
        },
        {
            snapshot: readJson("v2/version-transitions/6.7-to-7.0/behavior-shard-15-snapshot.json"),
            evidenceRef: "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-15-snapshot.json"
        },
        {
            snapshot: readJson("v2/version-transitions/6.7-to-7.0/behavior-shard-16-snapshot.json"),
            evidenceRef: "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-16-snapshot.json"
        }
    ];
    const weaponEntitySnapshots = [
        {
            snapshot: readJson("v2/version-transitions/6.7-to-7.0/weapon-entity-snapshot.json"),
            evidenceRef: "games/genshin/data/v2/version-transitions/6.7-to-7.0/weapon-entity-snapshot.json"
        },
        {
            snapshot: readJson("v2/version-transitions/6.7-to-7.0/weapon-entity-snapshot-shard02.json"),
            evidenceRef: "games/genshin/data/v2/version-transitions/6.7-to-7.0/weapon-entity-snapshot-shard02.json"
        },
        {
            snapshot: readJson("v2/version-transitions/6.7-to-7.0/weapon-entity-snapshot-shard03.json"),
            evidenceRef: "games/genshin/data/v2/version-transitions/6.7-to-7.0/weapon-entity-snapshot-shard03.json"
        },
        {
            snapshot: readJson("v2/version-transitions/6.7-to-7.0/weapon-entity-snapshot-shard04.json"),
            evidenceRef: "games/genshin/data/v2/version-transitions/6.7-to-7.0/weapon-entity-snapshot-shard04.json"
        }
    ];
    const certificateRegistry = loadEligibilityCertificateRegistry();
    const frontier = providerPolicies.find((policy) => policy.status === "searchExhausted") || null;
    const evidenceContext = {
        providerPolicies,
        versionEvidence,
        transitionSourceSearch,
        sourceSearchFrontiers,
        behaviorEntitySnapshots,
        weaponEntitySnapshots,
        frontier: {
            status: frontier ? "searchExhausted" : "searchRequired",
            policyId: frontier?.id || null
        }
    };
    const records = classifyCandidates({
        policies: providerPolicies,
        evidenceContext,
        eligibilityCertificateRegistry: certificateRegistry
    });
    const summary = summarize(records);
    const taskQueue = buildEvidenceTaskQueue(records, evidenceContext);
    // Reconcile against the freshly built queue, not a previous generated report.
    // The audit hashes an allowlisted input projection excluding this annotation.
    const modifierLaneAudit = buildModifierLaneAudit({ queue: taskQueue });
    const reconciledModifiers = new Map(modifierLaneAudit.claim.candidates.map((candidate) => [candidate.id, candidate]));
    for (const task of taskQueue.tasks) {
        const reconciliation = reconciledModifiers.get(task.candidateId);
        if (!reconciliation) continue;
        task.behaviorModifierReconciliation = {
            evidenceRef: "games/genshin/data/v2/characters/behavior-modifier-lane-audit.json",
            auditFieldDigest: modifierLaneAudit.fieldDigest,
            auditStatus: modifierLaneAudit.status,
            classification: reconciliation.classification.classification,
            targetSpecId: reconciliation.sourceBehaviorSpec.id,
            transitionSnapshotCount: reconciliation.transitionSnapshots.length,
            authority: "diagnosticOnlyNotVerificationProof"
        };
    }
    taskQueue.summary.behaviorModifierReconciliationAttempted = reconciledModifiers.size;
    taskQueue.summary.behaviorModifierReconciled = modifierLaneAudit.status === "passed" ? reconciledModifiers.size : 0;
    taskQueue.summary.behaviorModifierReconciliationFailed = modifierLaneAudit.status === "passed" ? 0 : reconciledModifiers.size;
    const talentGapLaneAudit = buildTalentGapLaneAudit({ queue: taskQueue });
    const reconciledTalentGaps = new Map(talentGapLaneAudit.claim.candidates.map((candidate) => [candidate.id, candidate]));
    for (const task of taskQueue.tasks) {
        const reconciliation = reconciledTalentGaps.get(task.candidateId);
        if (!reconciliation) continue;
        task.talentGapReconciliation = {
            evidenceRef: "games/genshin/data/v2/characters/talent-gap-lane-audit.json",
            auditFieldDigest: talentGapLaneAudit.fieldDigest,
            auditStatus: talentGapLaneAudit.status,
            classification: reconciliation.classification.status,
            providerFieldMappingStatus: reconciliation.fieldMapping.status,
            providerFieldMappingResolved: talentGapLaneAudit.status === "passed" && reconciliation.fieldMapping.safeExactMapping === true,
            requiredEffectFields: reconciliation.workPacket.requiredFieldGaps.effectFields,
            nextExecutableTaskKinds: reconciliation.workPacket.nextExecutableTasks.map((next) => next.kind),
            authority: "diagnosticOnlyNotVerificationProof"
        };
    }
    taskQueue.summary.talentGapReconciliationAttempted = reconciledTalentGaps.size;
    taskQueue.summary.talentGapReconciled = talentGapLaneAudit.status === "passed" ? reconciledTalentGaps.size : 0;
    taskQueue.summary.talentGapReconciliationFailed = talentGapLaneAudit.status === "passed" ? 0 : reconciledTalentGaps.size;
    taskQueue.summary.talentGapFieldMappingsResolved = taskQueue.tasks.filter((task) => task.talentGapReconciliation?.providerFieldMappingResolved === true).length;
    taskQueue.summary.talentGapFieldMappingsUnresolved = reconciledTalentGaps.size - taskQueue.summary.talentGapFieldMappingsResolved;
    // Freshly validate mutable official raw availability without treating it as
    // version-bound claim agreement, certification, or completed source search.
    taskQueue.summary.officialWeaponFieldAvailability = 0;
    taskQueue.summary.officialWeaponFieldAvailabilityStatus = "unavailable";
    try {
        const officialSnapshot = officialWeaponCapture.buildSnapshot();
        const storedOfficialSnapshot = JSON.parse(fs.readFileSync(officialWeaponCapture.outputPath, "utf8"));
        const validation = officialWeaponCapture.validateSnapshot(officialSnapshot, { compareCurrent: true });
        if (!validation.valid || storedOfficialSnapshot.fieldDigest !== officialSnapshot.fieldDigest) throw new Error("official field snapshot invalid or stale");
        const claims = officialSnapshot.claim.candidateClaims;
        for (const task of taskQueue.tasks) {
            const candidateClaims = claims.filter((claim) => claim.candidateId === task.candidateId);
            if (!candidateClaims.length) continue;
            task.officialWeaponFieldAvailability = {
                evidenceRef: "games/genshin/data/v2/version-transitions/6.7-to-7.0/official-weapon-frontier-11301-11303-snapshot.json",
                fieldDigest: officialSnapshot.fieldDigest,
                status: "rawFieldAvailableTargetVersionUnbound",
                candidateClaimTextReferences: candidateClaims.length,
                sourceFamily: "official-hoyoverse",
                strictGameVersionBinding: false,
                searchExhausted: false,
                certificateEligible: false,
                authority: "mutableOfficialFieldAvailabilityOnly"
            };
            taskQueue.summary.officialWeaponFieldAvailability += 1;
        }
        taskQueue.summary.officialWeaponFieldAvailabilityStatus = "validatedRawAvailabilityOnly";
    } catch (error) {
        taskQueue.summary.officialWeaponFieldAvailabilityStatus = "unavailableOrStale";
    }
    const coverage = sourceCoverageInventory.buildInventory({ queue: taskQueue });
    const coverageValidation = sourceCoverageInventory.validateInventory(coverage, { compareCurrent: false });
    const coverageByCandidate = new Map(coverage.candidateRecords.map((candidate) => [candidate.candidateId, candidate]));
    for (const task of taskQueue.tasks) {
        const candidate = coverageByCandidate.get(task.candidateId);
        if (!candidate) continue;
        task.sourceCoverageReconciliation = {
            evidenceRef: "games/genshin/data/v2/candidate-source-coverage-frontier-inventory.json",
            fieldDigest: coverage.fieldDigest,
            auditStatus: coverageValidation.valid ? "passed" : "failed",
            entityRecordStatus: candidate.transitionEntityEvidence.status,
            candidateFieldProofStatus: candidate.providerCoverage.candidateFieldProofStatus,
            nextAction: candidate.nextExecutableAction,
            sourceLookupStatus: coverageValidation.valid ? candidate.sourceLookup.status : "unknown",
            sourceLookupExecutableNow: coverageValidation.valid ? candidate.sourceLookup.executableNow : null,
            searchExhausted: false,
            certificateEligible: false,
            authority: "candidateSourceCoverageEvidenceOnly"
        };
    }
    taskQueue.summary.sourceCoverageReconciliationAttempted = coverageByCandidate.size;
    taskQueue.summary.sourceCoverageReconciled = coverageValidation.valid ? coverageByCandidate.size : 0;
    taskQueue.summary.sourceCoverageReconciliationFailed = coverageValidation.valid ? 0 : coverageByCandidate.size;
    // Unknown lookup availability must not become a false/no-work assertion.
    taskQueue.summary.sourceCoverageLookupExecutableNow = coverageValidation.valid ? coverage.summary.sourceLookupExecutableNow : null;
    return {
        schemaVersion: 1,
        kind: "genshinCandidateTerminalStateAudit",
        generatedAt: "2026-08-24T00:00:00.000Z",
        status: summary.totals.unclassified === 0 ? "passed" : "failed",
        policy: {
            terminalStates: TERMINAL_STATES,
            blockReasons: BLOCK_REASONS,
            behaviorSpec: "Verification is the terminal data-population objective; RuntimeModifier generation is not required without a consumer.",
            humanReview: "AI never promotes awaitingHumanReview records.",
            blocked: "Every blocked record must carry at least one explicit external, semantic, consumer, schema, support, or input reason."
        },
        eligibilityCertificates: {
            path: certificateRegistry.path,
            kind: certificateRegistry.kind,
            authority: "candidate×claim certificate registry; pair/pilot metadata is diagnostic only",
            summary: certificateRegistry.summary
        },
        goalExecution: {
            inventoryCandidatesClassified: records.length,
            countScope: "Current repository inventory, not candidates completed or individually reviewed during this resume session.",
            solReviewScope: "All layer totals, exclusive primary-reason policy, provider-pair policy, automation boundary, terminal invariants, and focused regression assertions.",
            automaticallyProcessableTransitionsFound: taskQueue.summary.autoProcessableNow,
            automaticallyProcessableTransitionsCompleted: taskQueue.tasks.filter((task) => task.task.kind === "machineTransition" && task.task.status === "complete").length,
            humanReviewReadyBatches: taskQueue.summary.humanReviewReady,
            humanReviewReadyCandidates: taskQueue.summary.humanReviewReady,
            evidenceHoldPacketsRetained: 2,
            canonicalPromotionsByThisAudit: 0,
            legacySupersessionsByThisAudit: 0,
            existingProductionCanonical: summary.totals.productionCanonical,
            existingLegacySupersessions: 1,
            currentInventoryNonCalculativeComplete: summary.totals.nonCalculativeComplete,
            representativeE2ERerun: false
        },
        summary,
        taskQueue,
        records
    };
}

function renderMarkdown(audit) {
    const rows = Object.entries(audit.summary.byLayer).map(([layer, counts]) =>
        `| ${layer} | ${counts.total} | ${counts.productionCanonical} | ${counts.awaitingHumanReview} | ${counts.verifiedSpec} | ${counts.nonCalculativeComplete} | ${counts.blocked} | ${counts.unclassified} |`
    );
    const blockerRows = Object.entries(audit.summary.totals.blockReasons)
        .filter(([, count]) => count > 0)
        .map(([reason, count]) => `| ${reason} | ${count} |`);
    const primaryRows = Object.entries(audit.summary.totals.primaryBlockReasons)
        .filter(([, count]) => count > 0)
        .map(([reason, count]) => `| ${reason} | ${count} |`);
    const waitRows = Object.entries(audit.summary.totals.waitOn)
        .filter(([, count]) => count > 0)
        .map(([wait, count]) => `| ${wait} | ${count} |`);
    return [
        "# Genshin v2 candidate terminal-state audit", "",
        `Status: **${audit.status}**`, "",
        "BehaviorSpec verification and Runtime canonical promotion are reported separately. Every blocked candidate has an exclusive primary reason plus all overlapping blockers, explicit completion requirements, automation status, and wait owner.", "",
        "| candidate layer | total | productionCanonical | awaitingHumanReview | verifiedSpec | nonCalculativeComplete | blocked | unclassified |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
        ...rows,
        `| **total** | **${audit.summary.totals.total}** | **${audit.summary.totals.productionCanonical}** | **${audit.summary.totals.awaitingHumanReview}** | **${audit.summary.totals.verifiedSpec}** | **${audit.summary.totals.nonCalculativeComplete}** | **${audit.summary.totals.blocked}** | **${audit.summary.totals.unclassified}** |`, "",
        `Automatically processable now: **${audit.taskQueue.summary.autoProcessableNow}**`, "",
        `Evidence-derived next task: **${audit.taskQueue.goal.nextTask?.task?.taskId || "none"}** (${audit.taskQueue.status})`, "",
        `Search frontier: exhausted **${audit.taskQueue.summary.searchExhausted}**, deferred **${audit.taskQueue.summary.searchDeferred}**, required **${audit.taskQueue.summary.searchRequired}**.`, "",
        "## Exclusive primary blocked reason", "",
        "| reason | candidates |", "| --- | ---: |", ...primaryRows, "",
        "## All blocked reasons (overlapping)", "",
        "| reason | candidates |", "| --- | ---: |", ...blockerRows, "",
        "## Wait owner (overlapping)", "",
        "| wait | candidates |", "| --- | ---: |", ...waitRows, ""
    ].join("\n");
}

function writeTerminalStateAudit(audit = buildTerminalStateAudit()) {
    const dataFile = path.join(dataRoot, "v2", "candidate-terminal-states.json");
    const reportJson = path.join(repositoryRoot, "reports", "genshin-candidate-terminal-states.json");
    const reportMarkdown = path.join(repositoryRoot, "reports", "genshin-candidate-terminal-states.md");
    const taskQueueJson = path.join(repositoryRoot, "reports", "genshin-evidence-task-queue.json");
    const taskQueueMarkdown = path.join(repositoryRoot, "reports", "genshin-evidence-task-queue.md");
    const taskQueueData = path.join(dataRoot, "v2", "evidence-task-queue.json");
    fs.writeFileSync(dataFile, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
    fs.writeFileSync(reportJson, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
    fs.writeFileSync(reportMarkdown, renderMarkdown(audit), "utf8");
    fs.writeFileSync(taskQueueJson, `${JSON.stringify(audit.taskQueue, null, 2)}\n`, "utf8");
    fs.writeFileSync(taskQueueData, `${JSON.stringify(audit.taskQueue, null, 2)}\n`, "utf8");
    fs.writeFileSync(taskQueueMarkdown, renderTaskQueueMarkdown(audit.taskQueue), "utf8");
    return audit;
}

if (require.main === module) {
    const audit = writeTerminalStateAudit();
    process.stdout.write(`${JSON.stringify(audit.summary.totals, null, 2)}\n`);
}

module.exports = {
    BLOCK_REASONS,
    TERMINAL_STATES,
    buildTerminalStateAudit,
    classifyCandidates,
    collectCandidates,
    loadEligibilityCertificateRegistry,
    renderMarkdown,
    scopedSearchFrontierRegistry,
    summarizeEligibilityCertificates,
    verifiedWithoutOpenMeaning,
    writeTerminalStateAudit
};
