"use strict";

/**
 * Candidate-scoped, draft-only G06 evidence wait for behaviorSpec shard01.
 *
 * The finite frontier is deliberately limited to the immutable provider
 * artifacts already retained in the repository.  Future provider releases,
 * manifests, mutable pages, and unsaved network responses remain an explicit
 * reopen scope.  This file never mutates the queue, work registry, Runtime,
 * certificates, canonical data, or any HSR file.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { digestStable } = require("./genshinVersionEvidenceValidation.cjs");
const sourceAudit = require("./genshinR2BehaviorSpecShard01SourceAudit.cjs");
const work = require("./genshinWorkDisposition.cjs");

const ROOT = path.resolve(__dirname, "..");
const QUEUE_PATH = path.join(ROOT, "reports", "genshin-evidence-task-queue.json");
const MATERIALIZATION_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "reviews", "r2-behavior-spec-materialization-audit.json");
const SOURCE_SEARCH_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0", "source-search.json");
const SOURCE_FRONTIERS_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "source-search-frontiers.json");
const PROVIDER_POLICY_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "provider-independence-policy.json");
const SOURCE_FAMILY_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "source-family-registry.json");
const EXTERNAL_CHARACTER_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "characters", "external-field-evidence.json");
const SOURCE_AUDIT_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "reviews", "r2-behavior-spec-shard01-source-audit.json");
const ARTIFACT_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "reviews", "r2-behavior-spec-shard01-g06-deferral.json");
const REPORT_PATH = path.join(ROOT, "reports", "genshin-r2-behavior-spec-shard01-g06-deferral.md");
const SCHEMA_PATH = path.join(ROOT, "games", "genshin", "data", "schema", "r2-behavior-spec-shard01-g06-deferral.schema.json");

const GENERATED_AT = "2026-08-30T00:00:00.000Z";
const GENERATOR_VERSION = "genshinR2BehaviorSpecShard01G06Deferral/1";
const POLICY_ID = "genshin-goal-2026-08-28-r2";
const TRANSITION_ID = "genshin:6.7->7.0";
const TARGET_GAME_VERSION = "7.0";
const SHARD_ID = "behavior:behaviorSpec:semanticDecisionRequired:standard:01";
const FRONTIER_ID = "genshin-7.0-behavior-spec-shard01-persisted-provider-frontier";
const FRONTIER_DATE = "2026-08-30";
const SOURCE_AUDIT_FIELD_DIGEST = "d9464b362d949de3f8f290b14b346d9dec5bfd39e9e21b467da335237647d043";
const CLAIM_FIELDS = ["sourceText", "timing", "execution", "lifecycle", "energy", "snapshot", "runtime"];
const EXTERNAL_CLAIM_FIELDS = CLAIM_FIELDS.filter((field) => field !== "runtime");
const EXPECTED_CANDIDATE_COUNT = 100;
const EXPECTED_EXTERNAL_CLAIM_COUNT = 600;
const REOPEN_TRIGGER = "A provider-owned immutable 7.0 field manifest with exact raw/field digests, newly disclosed independent lineage, or complete candidate×claim field coverage becomes available.";
const UNSEARCHED_SCOPE = [
    "Provider releases, manifests, or immutable candidate-field artifacts not retained in the repository at this audit time.",
    "Mutable provider pages and unsaved API responses outside the finite persisted-evidence surface."
];

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sha256(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function relative(file) {
    return path.relative(ROOT, file).replaceAll("\\", "/");
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function fileRef(file, role) {
    const exists = fs.existsSync(file);
    const bytes = exists ? fs.readFileSync(file) : null;
    return { path: relative(file), role, exists, bytes: bytes ? bytes.length : null, sha256: bytes ? sha256(bytes) : null };
}

function sortedUnique(values) {
    return [...new Set((values || []).filter((value) => value !== null && value !== undefined).map(String))]
        .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
}

function queueTaskDigest(candidate) {
    const queue = candidate.queue || {};
    return digestStable({
        candidateId: candidate.candidateId,
        layer: candidate.layer || null,
        dataset: candidate.dataset || null,
        entityId: candidate.entityId || null,
        taskId: queue.task?.taskId || null,
        taskKind: queue.task?.kind || null,
        taskStatus: queue.task?.status || null,
        primaryBlockReason: queue.primaryBlockReason || null,
        blockReasons: queue.blockReasons || [],
        searchFrontier: queue.searchFrontier || null
    });
}

function taskDigest(task) {
    return work.taskDigest(task);
}

function sourceRefs() {
    return [
        fileRef(SOURCE_AUDIT_PATH, "boundedShardSourceAudit"),
        fileRef(MATERIALIZATION_PATH, "behaviorSpecMaterializationAudit"),
        fileRef(SOURCE_SEARCH_PATH, "transitionProviderSearchLedger"),
        fileRef(PROVIDER_POLICY_PATH, "providerIndependencePolicy"),
        fileRef(SOURCE_FAMILY_PATH, "sourceFamilyRegistry"),
        fileRef(EXTERNAL_CHARACTER_PATH, "characterExternalFieldEvidence")
    ];
}

function externalFields(candidate) {
    return EXTERNAL_CLAIM_FIELDS.map((field) => {
        const claim = (candidate.claims || []).find((item) => item.field === field) || {};
        return {
            field: `claim.${field}`,
            knownStatus: "unknown",
            currentValue: null,
            historicalValue: null,
            currentValuePolicy: "No independent candidate field is materialized; local/entity observations are not substituted.",
            missingEvidence: `No immutable independent ${TARGET_GAME_VERSION} candidate×claim field artifact was found for ${candidate.candidateId}:${field}.`,
            localClaimSchemaStatus: claim.local?.claimSchemaStatus || null,
            localObservedSection: claim.local?.observedSection === true,
            localObservedLeafPaths: clone(claim.local?.observedLeafPaths || []),
            localObservedSectionDigest: claim.local?.observedSectionDigest || null,
            candidateFieldValueMaterialized: false,
            strictVerified: false,
            certificateEligible: false
        };
    });
}

function decisionFor(candidate, refs, frontier, projectedTask = null) {
    const reason = `Candidate-scoped external mechanic evidence is unavailable for ${candidate.candidateId}; this draft records only a finite persisted-provider evidence wait and leaves all values unverified.`;
    const fieldFindings = externalFields(candidate);
    const lane = {
        kind: "semanticDecision",
        blockingReasons: ["semanticDecisionRequired"],
        disposition: "externalEvidenceWait",
        reason,
        fieldRefs: fieldFindings.map((item) => item.field),
        artifactRefs: refs.map((ref) => ({ path: ref.path, sha256: ref.sha256 }))
    };
    return {
        id: `r2-behavior-shard01-g06-deferral:${candidate.candidateId}`,
        kind: "genshinEvidenceDeferral",
        policyId: POLICY_ID,
        candidateId: candidate.candidateId,
        targetGameVersion: TARGET_GAME_VERSION,
        queueTaskDigest: projectedTask ? taskDigest(projectedTask) : queueTaskDigest(candidate),
        assessment: {
            actorId: "luna_worker",
            assessedAt: GENERATED_AT,
            reason,
            boundedScope: {
                candidateId: candidate.candidateId,
                taskId: projectedTask?.task?.taskId || candidate.queue?.taskId || null,
                remainingSearches: clone(UNSEARCHED_SCOPE),
                notExecutableReasons: [
                    "strictIndependentTargetFieldEvidenceMissing",
                    "providerOwnedCandidateFieldArtifactNotPersisted",
                    "futureProviderSurfaceOutsideFiniteFrontier"
                ],
                artifactRefs: refs.map((ref) => ({ path: ref.path, sha256: ref.sha256 })),
                deferredLaneDispositions: [lane]
            }
        },
        fieldFindings,
        search: {
            scope: frontier.searchScope,
            lastSearchedAt: frontier.lastSearchedAt,
            providersExamined: clone(frontier.providersExamined),
            negativeResult: frontier.negativeResult,
            unsearchedScope: clone(UNSEARCHED_SCOPE),
            reopenTrigger: REOPEN_TRIGGER,
            nextTask: `Reopen and reacquire exact ${TARGET_GAME_VERSION} independent candidate×claim evidence for ${candidate.candidateId} when a recorded trigger is satisfied.`,
            artifactRefs: refs.map((ref) => ({ path: ref.path, sha256: ref.sha256 }))
        },
        safety: {
            impact: `Applying an unverified ${TARGET_GAME_VERSION} behavior overlay could alter the existing ${candidate.dataset}/${candidate.layer} result for ${candidate.candidateId}.`,
            action: `Keep the existing local/entity projection and any Runtime/canonical route unchanged; leave ${candidate.candidateId} inactive and do not issue a certificate or promotion.`,
            runtimeStatus: "existingConsumerUnchanged;candidateInactive;verificationAndPromotionDenied",
            artifactRefs: refs.map((ref) => ({ path: ref.path, sha256: ref.sha256 }))
        },
        draftDisposition: {
            status: "externalEvidenceWait",
            evidenceDeferred: true,
            workClosed: false,
            strictVerified: false,
            certificateEligible: false,
            canonicalPromotionEligible: false,
            queueMutation: "none"
        }
    };
}

function frontierEntry(frontier, candidateIds) {
    return {
        id: frontier.id,
        status: frontier.status,
        appliesTo: {
            dataset: "behavior",
            layer: "behaviorSpec",
            candidateCount: candidateIds.length,
            candidateIdDigest: frontier.candidateIdDigest,
            candidateIds: clone(candidateIds)
        },
        searchScope: frontier.searchScope,
        lastSearchedAt: frontier.lastSearchedAt,
        providersExamined: clone(frontier.providersExamined),
        negativeResult: frontier.negativeResult,
        reopenTrigger: frontier.reopenTrigger,
        evidenceRefs: sortedUnique((frontier.evidenceRefs || []).map((ref) => ref.path || ref)),
        sourceAuditDigest: frontier.sourceAuditDigest
    };
}

function loadQueue(queueInput = null) {
    if (queueInput && Array.isArray(queueInput.tasks)) return clone(queueInput);
    return readJson(QUEUE_PATH);
}

function inMemoryFrontierRegistry(frontier, baseRegistry = null) {
    const existing = baseRegistry || readJson(SOURCE_FRONTIERS_PATH);
    const entry = frontierEntry(frontier, frontier.candidateIds);
    const frontiers = (existing.frontiers || []).filter((item) => item?.id !== entry.id).concat(entry);
    return { ...clone(existing), frontiers };
}

function buildFreshTerminalProjection(frontier, baseRegistry = null) {
    // Use the same terminal/queue producer as the authoritative generation
    // path.  The registry is only an in-memory override; no queue or registry
    // file is written here.
    const terminal = require("./genshinTerminalStateAudit.cjs");
    const registry = inMemoryFrontierRegistry(frontier, baseRegistry);
    return terminal.buildTerminalStateAudit({ sourceSearchFrontiersOverride: registry });
}

function prepareQueueProjection(queueInput = null, audit = null) {
    const source = audit || buildAudit();
    const projected = buildFreshTerminalProjection(source.frontier);
    const queue = loadQueue(queueInput);
    if (queueInput && queue.tasks.length !== projected.taskQueue.tasks.length) {
        throw new Error(`projectionQueueCountMismatch:${queue.tasks.length}:${projected.taskQueue.tasks.length}`);
    }
    return clone(projected.taskQueue);
}

function prepareRegistry({ queue = null, registry = null, workRegistry = null, audit = null } = {}) {
    const source = audit || buildAudit();
    const existing = registry || readJson(SOURCE_FRONTIERS_PATH);
    const entry = frontierEntry(source.frontier, source.scope.candidateIds);
    const errors = [];
    const duplicates = (existing.frontiers || []).filter((item) => item?.id === entry.id);
    if (duplicates.length > 1) errors.push("frontierIdDuplicate");
    if (duplicates.length === 1 && digestStable(duplicates[0]) !== digestStable(entry)) errors.push("frontierIdCollision");
    const frontiers = (existing.frontiers || []).filter((item) => item?.id !== entry.id).concat(entry);
    const preparedRegistry = { ...clone(existing), frontiers };
    if (entry.appliesTo.candidateCount !== EXPECTED_CANDIDATE_COUNT
        || digestStable([...entry.appliesTo.candidateIds].sort()) !== entry.appliesTo.candidateIdDigest
        || entry.providersExamined.length !== 9
        || entry.evidenceRefs.length === 0) errors.push("frontierEntryInvalid");
    const projectedTerminal = buildFreshTerminalProjection(source.frontier, existing);
    const projectedQueue = clone(projectedTerminal.taskQueue);
    const observedQueue = loadQueue(queue);
    if (queue && observedQueue.tasks.length !== projectedQueue.tasks.length) {
        errors.push(`projectionQueueCountMismatch:${observedQueue.tasks.length}:${projectedQueue.tasks.length}`);
    }
    const byId = new Map(projectedQueue.tasks.map((task) => [String(task.candidateId), task]));
    const decisions = source.decisions.map((decision) => ({
        ...decision,
        queueTaskDigest: taskDigest(byId.get(String(decision.candidateId)))
    }));
    const validation = decisions.map((decision) => {
        const task = byId.get(String(decision.candidateId));
        return task ? work.validateDeferral(decision, task, { targetGameVersion: TARGET_GAME_VERSION })
            : { valid: false, errors: ["projectedQueueTaskMissing"] };
    });
    errors.push(...validation.flatMap((result) => result.valid ? [] : result.errors));
    const currentRegistry = workRegistry || readJson(path.join(ROOT, "games", "genshin", "data", "v2", "r2-work-dispositions.json"));
    const existingDecisionIds = new Set((currentRegistry.decisions || []).map((decision) => String(decision.candidateId)));
    const mergedDecisions = [
        ...(currentRegistry.decisions || []).filter((decision) => !source.scope.candidateIds.includes(String(decision.candidateId))),
        ...decisions
    ];
    const progress = work.buildWorkProgress(projectedQueue.tasks, {
        ...clone(currentRegistry),
        decisions: mergedDecisions
    }, { targetGameVersion: TARGET_GAME_VERSION });
    errors.push(...progress.errors);
    const duplicateAdded = source.scope.candidateIds.filter((candidateId) => existingDecisionIds.has(String(candidateId)));
    if (duplicateAdded.length) errors.push(`existingDecisionCollision:${duplicateAdded.join(",")}`);
    return {
        registry: preparedRegistry,
        queue: projectedQueue,
        decisions,
        validation: { valid: errors.length === 0, errors: [...new Set(errors)], decisionResults: validation },
        workProgress: progress,
        frontierEntry: entry
    };
}

function buildAudit() {
    const source = sourceAudit.buildAudit();
    const candidates = source.candidates;
    if (candidates.length !== EXPECTED_CANDIDATE_COUNT) throw new Error(`shardCandidateCount:${candidates.length}`);
    const refs = sourceRefs();
    const candidateIds = candidates.map((candidate) => candidate.candidateId);
    const providerNames = source.providerSurface.providers.map((provider) => provider.provider).filter(Boolean);
    const frontier = {
        id: FRONTIER_ID,
        status: "searchExhausted",
        finite: true,
        scopeUnit: "candidate×claim",
        shardId: SHARD_ID,
        transitionId: TRANSITION_ID,
        targetGameVersion: TARGET_GAME_VERSION,
        candidateCount: candidates.length,
        candidateIds,
        candidateIdDigest: digestStable([...candidateIds].sort((left, right) => left.localeCompare(right, "en", { numeric: true }))),
        claimFields: CLAIM_FIELDS,
        externalClaimFields: EXTERNAL_CLAIM_FIELDS,
        searchScope: `Exact ${candidates.length} behaviorSpec candidates in ${SHARD_ID}; immutable provider artifacts and prerequisite ledgers retained in this repository at audit time.`,
        lastSearchedAt: FRONTIER_DATE,
        providersExamined: providerNames,
        providerCount: providerNames.length,
        exactCandidateFieldEvidenceCount: source.summary.exactCandidateFieldEvidenceClaimCount,
        independentVersionBoundFieldEvidenceCount: 0,
        negativeResult: "Within the finite persisted-provider surface, no independent version-bound candidate×claim field record exists. Pinned genshin-db records are verified entity raw only; all other retained provider surfaces have no exact shard candidate field record or lack the required provider-owned version binding.",
        unsearchedScope: UNSEARCHED_SCOPE,
        reopenTrigger: REOPEN_TRIGGER,
        evidenceRefs: refs.map((ref) => ({ path: ref.path, sha256: ref.sha256 })),
        sourceAuditDigest: SOURCE_AUDIT_FIELD_DIGEST,
        digest: digestStable({
            id: FRONTIER_ID,
            status: "searchExhausted",
            finite: true,
            shardId: SHARD_ID,
            candidateIds,
            claimFields: CLAIM_FIELDS,
            externalClaimFields: EXTERNAL_CLAIM_FIELDS,
            searchScope: `Exact ${candidates.length} behaviorSpec candidates in ${SHARD_ID}; immutable provider artifacts and prerequisite ledgers retained in this repository at audit time.`,
            lastSearchedAt: FRONTIER_DATE,
            providersExamined: providerNames,
            negativeResult: "Within the finite persisted-provider surface, no independent version-bound candidate×claim field record exists. Pinned genshin-db records are verified entity raw only; all other retained provider surfaces have no exact shard candidate field record or lack the required provider-owned version binding.",
            unsearchedScope: UNSEARCHED_SCOPE,
            reopenTrigger: REOPEN_TRIGGER,
            sourceAuditDigest: SOURCE_AUDIT_FIELD_DIGEST
        })
    };
    const projectedQueue = prepareQueueProjection(null, {
        scope: { candidateIds },
        candidates,
        frontier
    });
    const projectedTasks = new Map(projectedQueue.tasks.map((task) => [String(task.candidateId), task]));
    const decisions = candidates.map((candidate) => decisionFor(candidate, refs, frontier, projectedTasks.get(String(candidate.candidateId))));
    const candidateEvidence = candidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        entityId: candidate.entityId,
        dataset: candidate.dataset,
        layer: candidate.layer,
        taskId: candidate.queue?.taskId || null,
        queueTaskDigest: queueTaskDigest(candidate),
        identity: clone(candidate.identity),
        rawEntityEvidence: clone(candidate.rawEntityEvidence),
        candidateFieldEvidenceCount: 0,
        candidateFieldEvidenceStatus: "absent",
        claimStatuses: EXTERNAL_CLAIM_FIELDS.map((field) => ({
            field,
            status: "candidateFieldSearchExhaustedForPersistedSurface",
            candidateFieldValueMaterialized: false,
            independentVersionBound: false,
            strictVerified: false
        })),
        safety: {
            candidateActive: false,
            runtimeChanged: false,
            certificateIssued: false,
            canonicalPromoted: false
        }
    }));
    const queueBytes = fs.readFileSync(QUEUE_PATH);
    const output = {
        schemaVersion: 1,
        kind: "genshinR2BehaviorSpecShard01G06Deferral",
        policyId: POLICY_ID,
        transitionId: TRANSITION_ID,
        fromGameVersion: "6.7",
        targetGameVersion: TARGET_GAME_VERSION,
        status: "draft",
        draftOnly: true,
        generatedAt: GENERATED_AT,
        generator: { name: path.basename(__filename), version: GENERATOR_VERSION },
        scope: {
            shardId: SHARD_ID,
            layer: "behaviorSpec",
            candidateCount: candidates.length,
            candidateIds,
            candidateIdDigest: frontier.candidateIdDigest,
            externalClaimFields: EXTERNAL_CLAIM_FIELDS,
            candidateSelection: "first 100 sorted ready behaviorSpec tasks with resolved identity, verified raw integrity, and complete local claim schema",
            frontierId: FRONTIER_ID
        },
        queueObservation: {
            path: relative(QUEUE_PATH),
            bytes: queueBytes.length,
            rawSha256: sha256(queueBytes),
            taskCount: candidates.length,
            note: "Queue is observed and bound for provenance only; this draft does not mutate authoritative task progress or status."
        },
        frontier,
        evidence: {
            sourceAudit: fileRef(SOURCE_AUDIT_PATH, "boundedShardSourceAudit"),
            providerSurface: clone(source.providerSurface),
            candidateEvidence,
            candidateFieldEvidenceCandidateCount: 0,
            candidateFieldEvidenceClaimCount: 0,
            independentVersionBoundFieldEvidenceClaimCount: 0,
            rawIntegrityVerifiedCandidateCount: source.summary.rawIntegrityVerifiedCandidateCount,
            rawIntegrityGapCandidateCount: source.summary.rawIntegrityGapCandidateCount,
            sourceRefs: refs.map((ref) => ({ path: ref.path, sha256: ref.sha256 }))
        },
        decisions,
        summary: {
            candidateCount: candidates.length,
            entityCount: new Set(candidates.map((candidate) => candidate.entityId)).size,
            claimCount: candidates.length * CLAIM_FIELDS.length,
            externalClaimCount: EXPECTED_EXTERNAL_CLAIM_COUNT,
            internalClaimCount: candidates.length,
            candidateScopedFrontierProvenCandidateCount: candidates.length,
            finiteFrontierStatus: "searchExhaustedForPersistedProviderSurface",
            evidenceDeferredDraftCandidateCount: candidates.length,
            candidateFieldEvidenceCandidateCount: 0,
            candidateFieldEvidenceClaimCount: 0,
            strictVerifiedCandidateCount: 0,
            certificateEligibleClaimCount: 0,
            canonicalPromotionEligibleCandidateCount: 0,
            providerCount: frontier.providerCount,
            providerExactCandidateFieldHitCount: 0,
            unsearchedExternalRemainderCandidateCount: candidates.length,
            queueMutated: false
        },
        gate: {
            draftEligibleForEvidenceWait: true,
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false,
            verificationGranted: false,
            promotionGranted: false,
            runtimeChanged: false,
            certificateIssued: false,
            queueChanged: false,
            reason: "This draft closes only the finite persisted-provider search surface for a future reopenable evidence wait. It does not verify values, grant a certificate, activate Runtime, promote canonical data, or close queue work."
        },
        policy: {
            candidateScopedFrontierRequired: true,
            persistedProviderSurfaceOnly: true,
            futureProviderSurfaceRemainsOpen: true,
            providerIndependenceRequired: true,
            explicitGameVersionBindingRequired: true,
            completeCandidateClaimCoverageRequired: true,
            proseInference: "forbidden",
            tokenMatching: "forbidden",
            sameUpstreamDoubleCount: "forbidden",
            strictVerification: "unchanged",
            queueMutation: "none",
            runtimeOrCanonicalMutation: "none"
        },
        validation: {
            valid: true,
            invalidDecisionCount: 0,
            decisionResults: decisions.map(() => ({ valid: true, errors: [] }))
        },
        fieldDigestAlgorithm: "sha256-stable-json-v1"
    };
    output.fieldDigest = digestStable({
        scope: output.scope,
        queueObservation: output.queueObservation,
        frontier: output.frontier,
        evidence: output.evidence,
        decisions: output.decisions,
        summary: output.summary,
        gate: output.gate,
        policy: output.policy
    });
    return output;
}

function withoutDigest(value) {
    const copy = clone(value);
    if (copy && typeof copy === "object") {
        delete copy.fieldDigest;
        delete copy.validation;
    }
    return copy;
}

function validateRefs(refs) {
    const errors = [];
    for (const ref of refs || []) {
        if (!ref || typeof ref.path !== "string" || path.isAbsolute(ref.path) || /^[a-z]:/i.test(ref.path)
            || ref.path.split(/[\\/]/).includes("..") || !/^[a-f0-9]{64}$/.test(ref.sha256 || "")) {
            errors.push("artifactRefInvalid");
            continue;
        }
        const file = path.resolve(ROOT, ref.path);
        if (!file.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(file)) {
            errors.push(`artifactMissing:${ref.path}`);
            continue;
        }
        if (sha256(fs.readFileSync(file)) !== ref.sha256) errors.push(`artifactDigestMismatch:${ref.path}`);
    }
    return errors;
}

function validateAudit(audit, { compareCurrent = false } = {}) {
    const reasons = [];
    const add = (reason) => { if (!reasons.includes(reason)) reasons.push(reason); };
    if (!audit || typeof audit !== "object" || Array.isArray(audit)) return { valid: false, reasons: ["artifactMissing"] };
    if (audit.schemaVersion !== 1) add("schemaVersionInvalid");
    if (audit.kind !== "genshinR2BehaviorSpecShard01G06Deferral") add("kindInvalid");
    if (audit.policyId !== POLICY_ID || audit.transitionId !== TRANSITION_ID || audit.targetGameVersion !== TARGET_GAME_VERSION) add("transitionBindingInvalid");
    if (audit.status !== "draft" || audit.draftOnly !== true) add("draftGateInvalid");
    if (audit.generatedAt !== GENERATED_AT) add("generatedAtInvalid");
    if (audit.scope?.shardId !== SHARD_ID || audit.scope?.candidateCount !== EXPECTED_CANDIDATE_COUNT) add("scopeInvalid");
    if (!Array.isArray(audit.decisions) || audit.decisions.length !== EXPECTED_CANDIDATE_COUNT) add("decisionCountInvalid");
    if (audit.frontier?.id !== FRONTIER_ID || audit.frontier?.status !== "searchExhausted"
        || audit.frontier?.finite !== true || audit.frontier?.candidateCount !== EXPECTED_CANDIDATE_COUNT
        || audit.frontier?.providerCount !== 9 || audit.frontier?.exactCandidateFieldEvidenceCount !== 0
        || audit.frontier?.independentVersionBoundFieldEvidenceCount !== 0) add("frontierFailOpenOrIncomplete");
    if (audit.summary?.candidateFieldEvidenceClaimCount !== 0
        || audit.summary?.strictVerifiedCandidateCount !== 0
        || audit.summary?.certificateEligibleClaimCount !== 0
        || audit.summary?.canonicalPromotionEligibleCandidateCount !== 0) add("verificationFailOpen");
    if (audit.gate?.canIssueEligibilityCertificate !== false || audit.gate?.canPromoteCanonical !== false
        || audit.gate?.verificationGranted !== false || audit.gate?.promotionGranted !== false
        || audit.gate?.runtimeChanged !== false || audit.gate?.queueChanged !== false) add("gateFailOpen");
    const refs = audit.evidence?.sourceRefs || [];
    reasons.push(...validateRefs(refs));
    const ids = new Set();
    for (const decision of audit.decisions || []) {
        if (!decision?.candidateId || ids.has(decision.candidateId)) add(`candidateIdInvalid:${decision?.candidateId || "<missing>"}`);
        ids.add(decision?.candidateId);
        if (decision?.draftDisposition?.evidenceDeferred !== true || decision?.draftDisposition?.workClosed !== false
            || decision?.draftDisposition?.strictVerified !== false || decision?.draftDisposition?.certificateEligible !== false
            || decision?.draftDisposition?.canonicalPromotionEligible !== false) add(`decisionGateInvalid:${decision?.candidateId}`);
        if (!Array.isArray(decision?.fieldFindings) || decision.fieldFindings.length !== EXTERNAL_CLAIM_FIELDS.length) add(`fieldFindingCountInvalid:${decision?.candidateId}`);
        const fields = (decision.fieldFindings || []).map((item) => item.field);
        if (digestStable(fields) !== digestStable(EXTERNAL_CLAIM_FIELDS.map((field) => `claim.${field}`))) add(`fieldScopeInvalid:${decision?.candidateId}`);
        if (decision?.search?.scope !== audit.frontier.searchScope
            || decision?.search?.lastSearchedAt !== audit.frontier.lastSearchedAt
            || digestStable(decision?.search?.providersExamined || []) !== digestStable(audit.frontier.providersExamined)
            || decision?.search?.reopenTrigger !== audit.frontier.reopenTrigger) add(`frontierBindingInvalid:${decision?.candidateId}`);
    }
    if (audit.fieldDigestAlgorithm !== "sha256-stable-json-v1") add("fieldDigestAlgorithmInvalid");
    const digestInput = {
        scope: audit.scope,
        queueObservation: audit.queueObservation,
        frontier: audit.frontier,
        evidence: audit.evidence,
        decisions: audit.decisions,
        summary: audit.summary,
        gate: audit.gate,
        policy: audit.policy
    };
    if (audit.fieldDigest !== digestStable(digestInput)) add("fieldDigestInvalid");
    if (compareCurrent) {
        const current = buildAudit();
        if (digestStable(withoutDigest(audit)) !== digestStable(withoutDigest(current))) add("currentProjectionMismatch");
    }
    return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}

function renderMarkdown(audit) {
    const summary = audit.summary;
    return `# Genshin r2 behaviorSpec shard01 G06 deferral draft\n\n` +
        `- Scope: ${summary.candidateCount} candidates / ${summary.claimCount} claims (${summary.externalClaimCount} external).\n` +
        `- Persisted-provider frontier: ${audit.frontier.status}; providers examined: ${summary.providerCount}; exact candidate×claim hits: ${summary.candidateFieldEvidenceClaimCount}.\n` +
        `- Draft evidence waits: ${summary.evidenceDeferredDraftCandidateCount}; queue/runtime/canonical mutation: none.\n` +
        `- Strict/certificate/canonical: ${summary.strictVerifiedCandidateCount}/${summary.certificateEligibleClaimCount}/${summary.canonicalPromotionEligibleCandidateCount}.\n\n` +
        `## Safety boundary\n\n` +
        `This is a candidate-scoped, draft-only G06 evidence wait for the finite persisted-provider surface. The pinned genshin-db records are entity raw evidence only; no provider supplies an independent version-bound candidate×claim field record. Values are not inferred from prose or entity records.\n\n` +
        `The finite frontier is not a permanent global stop. The following remain explicit reopen scope: ${UNSEARCHED_SCOPE.join("; ")} New provider-owned immutable 7.0 field evidence or lineage disclosure reopens each candidate.\n\n` +
        `No eligibility certificate, verification, Runtime activation, canonical promotion, queue closure, or HSR change is made by this artifact.\n`;
}

function writeArtifacts(audit = buildAudit()) {
    fs.mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(ARTIFACT_PATH, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
    fs.writeFileSync(REPORT_PATH, renderMarkdown(audit), "utf8");
    return { audit, artifactPath: ARTIFACT_PATH, reportPath: REPORT_PATH };
}

function main() {
    const audit = buildAudit();
    writeArtifacts(audit);
    process.stdout.write(`${JSON.stringify({ summary: audit.summary, validation: validateAudit(audit) }, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {
    ARTIFACT_PATH,
    CLAIM_FIELDS,
    EXTERNAL_CLAIM_FIELDS,
    FRONTIER_ID,
    GENERATED_AT,
    REPORT_PATH,
    SCHEMA_PATH,
    SHARD_ID,
    SHARD01_SOURCE_AUDIT_DIGEST: SOURCE_AUDIT_FIELD_DIGEST,
    buildAudit,
    frontierEntry,
    prepareQueueProjection,
    prepareRegistry,
    renderMarkdown,
    validateAudit,
    withoutDigest,
    writeArtifacts
};
