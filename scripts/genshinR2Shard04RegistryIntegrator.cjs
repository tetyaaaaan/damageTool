"use strict";

/**
 * Read-only integration preview for the exact Shard04 behavior and weapon
 * artifacts.  The already registered Shards01-03 are the immutable base;
 * this seam only joins two new candidate-scoped external-evidence waits in
 * memory.  Its explicit write path is restricted to the source-frontier and
 * work registries; it never writes queue, checkpoint, Runtime, canonical, or
 * HSR data.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const baseIntegrator = require("./genshinR2Shard03RegistryIntegrator.cjs");
const behaviorShard = require("./genshinR2BehaviorSpecShard04G06Deferral.cjs");
const weaponShard = require("./genshinR2WeaponPrimaryFieldSearchShard04.cjs");
const terminal = require("./genshinTerminalStateAudit.cjs");
const work = require("./genshinWorkDisposition.cjs");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_FRONTIERS_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "source-search-frontiers.json");
const WORK_DISPOSITIONS_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "r2-work-dispositions.json");
const QUEUE_PATH = path.join(ROOT, "reports", "genshin-evidence-task-queue.json");
const CHECKPOINT_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0", "active-goal-resume-checkpoint.json");
const TARGET_VERSION = "7.0";
const EXPECTED = Object.freeze({
    total: 2268,
    completed: 15,
    evidenceDeferred: 902,
    pending: 1351,
    disposed: 917,
    strictVerified: 0,
    certificateEligible: 0,
    canonicalPromotionEligible: 0,
    baseFrontiers: 8,
    baseDecisions: 793,
    addedBehaviorCandidates: 100,
    addedWeaponCandidates: 9,
    finalFrontiers: 10,
    finalDecisions: 902
});
const TARGET_FRONTIER_IDS = Object.freeze([behaviorShard.FRONTIER_ID, weaponShard.FRONTIER_ID]);
const WRITE_TARGETS = new Set([SOURCE_FRONTIERS_PATH, WORK_DISPOSITIONS_PATH]);
const BEHAVIOR_ARTIFACT_SHA256 = "3310bec57711a8b70484dd254c8e864ecfaac2a42514b4f13055090a2e654665";
const BEHAVIOR_SOURCE_AUDIT_SHA256 = "dd50258026cfc2602da5458b105e0f580d0580086fc6f136219e75381b7b1626";
const BEHAVIOR_ARTIFACT_FIELD_DIGEST = "e56fdead52125150354bf189bd79af1803166d650a93c6b931dfc925454521ab";
const BEHAVIOR_SOURCE_AUDIT_FIELD_DIGEST = "f31655c38f1fd2ea3121d475aeea918f89edaccde7cbc5125ce71be0e40674d3";
const WEAPON_ARTIFACT_SHA256 = "c8639d36e6433c5414219581005f8192d5a242f7998f7f5ec39f8c6a6d672545";
const WEAPON_ARTIFACT_FIELD_DIGEST = "624492cc0bff665016b28d5fca5f3379be95f9858b21e831383512112ef8db27";
const REQUIRED_WEAPON_CLAIMS = Object.freeze(["activation", "refinement", "targets", "value"]);

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sha256(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function digest(value) {
    return work.digest(value);
}

function stableJson(value) {
    return JSON.stringify(value, Object.keys(value || {}).sort());
}

function relative(file) {
    return path.relative(ROOT, file).replaceAll("\\", "/");
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function fileFingerprint(file) {
    const bytes = fs.readFileSync(file);
    return { path: relative(file), bytes: bytes.length, sha256: sha256(bytes) };
}

function assertNoDuplicateFrontiers(registry) {
    const seen = new Set();
    for (const frontier of registry.frontiers || []) {
        if (!frontier?.id || seen.has(frontier.id)) throw new Error(`frontierIdDuplicate:${frontier?.id || "<missing>"}`);
        seen.add(frontier.id);
    }
}

function assertNoDuplicateDecisions(registry) {
    const seen = new Set();
    for (const decision of registry.decisions || []) {
        const id = String(decision?.candidateId || "");
        if (!id || seen.has(id)) throw new Error(`decisionCandidateDuplicate:${id || "<missing>"}`);
        seen.add(id);
    }
}

function assertShardArtifactPins() {
    const behaviorBytes = fs.readFileSync(behaviorShard.ARTIFACT_PATH);
    const sourceBytes = fs.readFileSync(behaviorShard.SOURCE_AUDIT_PATH);
    const weaponBytes = fs.readFileSync(weaponShard.OUTPUT_PATH);
    if (sha256(behaviorBytes) !== BEHAVIOR_ARTIFACT_SHA256) throw new Error("behaviorShard04ArtifactShaMismatch");
    if (sha256(sourceBytes) !== BEHAVIOR_SOURCE_AUDIT_SHA256) throw new Error("behaviorShard04SourceAuditShaMismatch");
    if (sha256(weaponBytes) !== WEAPON_ARTIFACT_SHA256) throw new Error("weaponShard04ArtifactShaMismatch");
    const behaviorAudit = JSON.parse(behaviorBytes.toString("utf8"));
    const behaviorSource = JSON.parse(sourceBytes.toString("utf8"));
    const weaponAudit = JSON.parse(weaponBytes.toString("utf8"));
    const behaviorValidation = behaviorShard.validateAudit(behaviorAudit, { compareCurrent: false });
    if (!behaviorValidation.valid) throw new Error(`behaviorShard04ArtifactInvalid:${behaviorValidation.reasons.join(",")}`);
    const sourceValidation = behaviorShard.validateSourceAudit(behaviorSource, { compareCurrent: false });
    if (!sourceValidation.valid) throw new Error(`behaviorShard04SourceAuditInvalid:${sourceValidation.reasons.join(",")}`);
    const weaponValidation = weaponShard.validateAudit(weaponAudit, { compareCurrent: false });
    if (!weaponValidation.valid) throw new Error(`weaponShard04ArtifactInvalid:${weaponValidation.reasons.join(",")}`);
    if (behaviorAudit.fieldDigest !== BEHAVIOR_ARTIFACT_FIELD_DIGEST) throw new Error("behaviorShard04ArtifactFieldDigestMismatch");
    if (behaviorSource.fieldDigest !== BEHAVIOR_SOURCE_AUDIT_FIELD_DIGEST) throw new Error("behaviorShard04SourceAuditFieldDigestMismatch");
    if (weaponAudit.fieldDigest !== WEAPON_ARTIFACT_FIELD_DIGEST) throw new Error("weaponShard04ArtifactFieldDigestMismatch");
    return { behaviorAudit, behaviorSource, weaponAudit };
}

function validateBehaviorFrontier(audit, entry) {
    const expected = audit.frontier;
    const ids = audit.scope.candidateIds.map(String);
    if (!entry || entry.id !== behaviorShard.FRONTIER_ID || entry.status !== "searchExhausted"
        || entry.appliesTo?.dataset !== "behavior" || entry.appliesTo?.layer !== "behaviorSpec"
        || entry.appliesTo?.candidateCount !== ids.length
        || entry.appliesTo?.candidateIdDigest !== audit.scope.candidateIdDigest
        || digest(entry.appliesTo?.candidateIds || []) !== digest(ids)
        || entry.sourceAuditDigest !== expected.sourceAuditDigest
        || entry.searchScope !== expected.searchScope
        || entry.lastSearchedAt !== expected.lastSearchedAt
        || digest(entry.providersExamined || []) !== digest(expected.providersExamined || [])
        || !Array.isArray(entry.evidenceRefs) || entry.evidenceRefs.length === 0) {
        throw new Error("behaviorShard04FrontierEntryMismatch");
    }
    if (entry.evidenceRefs.some((ref) => work.isMutableCoordinationArtifactPath(ref))) {
        throw new Error("behaviorShard04MutableFrontierEvidenceRef");
    }
}

function weaponFrontierEntry(audit, artifactRef) {
    const expected = audit.frontier;
    const ids = audit.scope.candidateIds.map(String);
    return {
        id: weaponShard.FRONTIER_ID,
        policyId: weaponShard.FRONTIER_POLICY_ID,
        status: expected.status,
        appliesTo: {
            dataset: "weapons",
            layer: "weaponEffectSpec",
            candidateCount: ids.length,
            candidateIdDigest: audit.scope.candidateIdDigest,
            candidateIds: clone(ids)
        },
        searchScope: expected.searchScope,
        lastSearchedAt: expected.lastSearchedAt,
        providersExamined: clone(expected.providersExamined),
        negativeResult: expected.negativeResult,
        reopenTrigger: expected.reopenTrigger,
        auditDigest: audit.fieldDigest,
        evidenceRefs: [artifactRef.path]
    };
}

function mergeFrontierRegistry(base, behaviorEntry, weaponEntry) {
    const next = {
        ...clone(base),
        frontiers: [
            ...(base.frontiers || []).map(clone),
            clone(behaviorEntry),
            clone(weaponEntry)
        ]
    };
    assertNoDuplicateFrontiers(next);
    return next;
}

function mergeWorkRegistry(base, behaviorDecisions, weaponDecisions) {
    const next = {
        ...clone(base),
        decisions: [
            ...(base.decisions || []).map(clone),
            ...behaviorDecisions.map(clone),
            ...weaponDecisions.map(clone)
        ].sort((left, right) => String(left.candidateId).localeCompare(String(right.candidateId)))
    };
    assertNoDuplicateDecisions(next);
    return next;
}

function assertDecisionBindings(decisions, tasksById, label) {
    for (const decision of decisions) {
        const id = String(decision?.candidateId || "");
        const task = tasksById.get(id);
        if (!task) throw new Error(`${label}TaskMissing:${id}`);
        if (decision.queueTaskDigest !== work.taskDigest(task)) throw new Error(`${label}TaskDigestMismatch:${id}`);
        const validation = work.validateDeferral(decision, task, { targetGameVersion: TARGET_VERSION });
        if (!validation.valid) throw new Error(`${label}DecisionInvalid:${id}:${validation.errors.join(",")}`);
        const refs = [
            ...(decision.search?.artifactRefs || []),
            ...(decision.safety?.artifactRefs || []),
            ...(decision.assessment?.boundedScope?.artifactRefs || [])
        ];
        if (refs.some((ref) => work.isMutableCoordinationArtifactPath(ref?.path))) {
            throw new Error(`${label}MutableArtifactRef:${id}`);
        }
    }
}

function expectedKpi(progress, queue) {
    const summary = progress?.summary || {};
    return {
        total: summary.total,
        completed: summary.completed,
        evidenceDeferred: summary.evidenceDeferred,
        pending: summary.pending,
        disposed: summary.disposed,
        strictVerified: (queue?.tasks || []).filter((task) => task?.certificate?.strictEligible === true).length,
        certificateEligible: queue?.summary?.candidateClaimEligible,
        canonicalPromotionEligible: queue?.summary?.promotionEligible
    };
}

function assertExpectedProgress(progress, queue) {
    const kpi = expectedKpi(progress, queue);
    for (const key of ["total", "completed", "evidenceDeferred", "pending", "disposed", "strictVerified", "certificateEligible", "canonicalPromotionEligible"]) {
        if (kpi[key] !== EXPECTED[key]) throw new Error(`combinedKpiMismatch:${key}:${kpi[key]}:${EXPECTED[key]}`);
    }
    if ((progress.errors || []).length > 0) throw new Error(`combinedWorkProgressInvalid:${progress.errors.join(",")}`);
    return kpi;
}

function rebindBehaviorDecisions(audit, tasksById) {
    return (audit.decisions || []).map((decision) => {
        const id = String(decision.candidateId);
        const task = tasksById.get(id);
        if (!task) throw new Error(`behaviorShard04DecisionTaskMissing:${id}`);
        // The draft was produced before the in-memory frontier was attached;
        // bind only the queue digest to the fresh, authoritative task shape.
        return { ...clone(decision), queueTaskDigest: work.taskDigest(task) };
    });
}

function weaponDecisionForTask(task, candidate, audit, artifactRef) {
    const frontier = task.searchFrontier;
    const fieldFindings = REQUIRED_WEAPON_CLAIMS.map((field) => ({
        field: `claim.${field}`,
        knownStatus: "numericObservationOnly",
        currentValue: candidate.claims?.[field]?.local?.value ?? null,
        historicalValue: null,
        missingEvidence: `Independent immutable target-${TARGET_VERSION} candidate×claim semantic evidence is absent for ${field}.`
    }));
    return {
        id: `r2-weapon-primary-shard04-deferral:${task.candidateId}`,
        kind: "genshinEvidenceDeferral",
        policyId: work.POLICY,
        candidateId: task.candidateId,
        targetGameVersion: TARGET_VERSION,
        queueTaskDigest: work.taskDigest(task),
        assessment: {
            actorId: "Sol",
            assessedAt: "2026-08-31T00:00:00.000Z",
            reason: `Candidate-scoped external evidence remains unavailable for ${task.candidateId}; numeric raw agreement is retained as an observation only and is not semantic identity.`,
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
            nextTask: `Reopen and reacquire exact ${TARGET_VERSION} independent candidate×claim field evidence for ${task.candidateId}.`,
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

function buildIntegration() {
    const sourceFingerprint = fileFingerprint(SOURCE_FRONTIERS_PATH);
    const workFingerprint = fileFingerprint(WORK_DISPOSITIONS_PATH);
    const queueFingerprint = fileFingerprint(QUEUE_PATH);
    const checkpointFingerprint = fileFingerprint(CHECKPOINT_PATH);
    const pinned = assertShardArtifactPins();
    const base = baseIntegrator.buildIntegration();
    if (!base.valid) throw new Error(`shard03BaseInvalid:${base.errors.join(",")}`);
    if (base.sourceRegistry.frontiers.length !== EXPECTED.baseFrontiers
        || base.workRegistry.decisions.length !== EXPECTED.baseDecisions) throw new Error("shard03BaseCountInvalid");
    const behaviorIds = pinned.behaviorAudit.scope.candidateIds.map(String);
    const weaponIds = pinned.weaponAudit.scope.candidateIds.map(String);
    if (behaviorIds.length !== EXPECTED.addedBehaviorCandidates || weaponIds.length !== EXPECTED.addedWeaponCandidates) throw new Error("shard04CandidateCountInvalid");
    const overlap = behaviorIds.filter((id) => weaponIds.includes(id));
    if (overlap.length > 0) throw new Error(`shard04CandidateOverlap:${overlap.join(",")}`);
    const baseIds = new Set(base.workRegistry.decisions.map((decision) => String(decision.candidateId)));
    const collisions = [...behaviorIds, ...weaponIds].filter((id) => baseIds.has(id));
    if (collisions.length > 0) throw new Error(`shard04DecisionAlreadyRegistered:${[...new Set(collisions)].join(",")}`);
    const baseFrontierIds = new Set(base.sourceRegistry.frontiers.map((frontier) => String(frontier.id)));
    const frontierCollisions = TARGET_FRONTIER_IDS.filter((id) => baseFrontierIds.has(id));
    if (frontierCollisions.length > 0) throw new Error(`shard04FrontierAlreadyRegistered:${frontierCollisions.join(",")}`);

    const behaviorEntry = behaviorShard.frontierEntry(
        pinned.behaviorAudit.frontier,
        pinned.behaviorAudit.frontier.evidenceRefs || []
    );
    validateBehaviorFrontier(pinned.behaviorAudit, behaviorEntry);
    const weaponArtifactRef = { path: relative(weaponShard.OUTPUT_PATH), sha256: WEAPON_ARTIFACT_SHA256 };
    const weaponEntry = weaponFrontierEntry(pinned.weaponAudit, weaponArtifactRef);
    const sourceOut = mergeFrontierRegistry(base.sourceRegistry, behaviorEntry, weaponEntry);
    const freshTerminal = terminal.buildTerminalStateAudit({ sourceSearchFrontiersOverride: sourceOut });
    const queue = freshTerminal.taskQueue;
    const tasksById = new Map(queue.tasks.map((task) => [String(task.candidateId), task]));
    const behaviorTasks = behaviorIds.map((id) => tasksById.get(id));
    const weaponTasks = weaponIds.map((id) => tasksById.get(id));
    if (behaviorTasks.some((task) => !task) || weaponTasks.some((task) => !task)) throw new Error("shard04TaskBindingMissing");
    if (behaviorTasks.some((task) => !work.isAllowedShard04ExternalEvidenceWait(task))) throw new Error("shard04BehaviorTaskPredicateInvalid");
    if (weaponTasks.some((task) => !work.isAllowedWeaponShard04ExternalEvidenceWait(task))) throw new Error("shard04WeaponTaskPredicateInvalid");
    const behaviorDecisions = rebindBehaviorDecisions(pinned.behaviorAudit, tasksById);
    const weaponDecisions = weaponIds.map((id) => weaponDecisionForTask(tasksById.get(id), pinned.weaponAudit.candidates[id], pinned.weaponAudit, weaponArtifactRef));
    if (behaviorDecisions.length !== EXPECTED.addedBehaviorCandidates || weaponDecisions.length !== EXPECTED.addedWeaponCandidates) throw new Error("shard04DecisionCountInvalid");
    assertDecisionBindings(behaviorDecisions, tasksById, "behaviorShard04");
    assertDecisionBindings(weaponDecisions, tasksById, "weaponShard04");
    const workOut = mergeWorkRegistry(base.workRegistry, behaviorDecisions, weaponDecisions);
    const progress = work.buildWorkProgress(queue.tasks, workOut, { targetGameVersion: TARGET_VERSION });
    const kpi = assertExpectedProgress(progress, queue);
    const inputAfter = {
        sourceFrontiers: fileFingerprint(SOURCE_FRONTIERS_PATH),
        workDispositions: fileFingerprint(WORK_DISPOSITIONS_PATH),
        queue: fileFingerprint(QUEUE_PATH),
        checkpoint: fileFingerprint(CHECKPOINT_PATH)
    };
    if (inputAfter.sourceFrontiers.sha256 !== sourceFingerprint.sha256
        || inputAfter.workDispositions.sha256 !== workFingerprint.sha256
        || inputAfter.queue.sha256 !== queueFingerprint.sha256
        || inputAfter.checkpoint.sha256 !== checkpointFingerprint.sha256) throw new Error("integrationInputsChangedDuringPrepare");
    return {
        valid: true,
        errors: [],
        inputFingerprints: { sourceFrontiers: sourceFingerprint, workDispositions: workFingerprint, queue: queueFingerprint, checkpoint: checkpointFingerprint },
        sourceRegistry: sourceOut,
        workRegistry: workOut,
        queue,
        workProgress: progress,
        kpi,
        shards: {
            behaviorShard01: clone(base.shards.behaviorShard01 || base.shards.behavior),
            weaponShard01: clone(base.shards.weaponShard01 || base.shards.weapon),
            behaviorShard02: clone(base.shards.behaviorShard02),
            weaponShard02: clone(base.shards.weaponShard02),
            behaviorShard03: clone(base.shards.behaviorShard03),
            weaponShard03: clone(base.shards.weaponShard03),
            behaviorShard04: { candidateIds: behaviorIds, candidateIdDigest: pinned.behaviorAudit.scope.candidateIdDigest, artifactFieldDigest: BEHAVIOR_ARTIFACT_FIELD_DIGEST, artifactSha256: BEHAVIOR_ARTIFACT_SHA256, sourceAuditDigest: BEHAVIOR_SOURCE_AUDIT_FIELD_DIGEST, sourceAuditSha256: BEHAVIOR_SOURCE_AUDIT_SHA256, decisions: behaviorDecisions.length },
            weaponShard04: { candidateIds: weaponIds, candidateIdDigest: pinned.weaponAudit.scope.candidateIdDigest, artifactFieldDigest: WEAPON_ARTIFACT_FIELD_DIGEST, artifactSha256: WEAPON_ARTIFACT_SHA256, decisions: weaponDecisions.length }
        },
        writesPerformed: false,
        writeTargets: []
    };
}

function validateIntegration(integration, { compareCurrent = true } = {}) {
    const errors = [];
    const add = (message) => { if (!errors.includes(message)) errors.push(message); };
    if (!integration || integration.valid !== true) add("integrationInvalid");
    if (!integration?.sourceRegistry || !integration?.workRegistry || !integration?.queue) add("integrationOutputsMissing");
    if (integration?.sourceRegistry?.frontiers?.length !== EXPECTED.finalFrontiers) add("frontierCountInvalid");
    if (integration?.workRegistry?.decisions?.length !== EXPECTED.finalDecisions) add("decisionCountInvalid");
    const kpi = integration?.kpi || {};
    for (const key of ["total", "completed", "evidenceDeferred", "pending", "disposed", "strictVerified", "certificateEligible", "canonicalPromotionEligible"]) {
        if (kpi[key] !== EXPECTED[key]) add(`kpiMismatch:${key}`);
    }
    if (integration?.writesPerformed !== false) add("writeStateInvalid");
    if (compareCurrent && integration?.inputFingerprints) {
        try {
            if (fileFingerprint(SOURCE_FRONTIERS_PATH).sha256 !== integration.inputFingerprints.sourceFrontiers.sha256) add("sourceInputChanged");
            if (fileFingerprint(WORK_DISPOSITIONS_PATH).sha256 !== integration.inputFingerprints.workDispositions.sha256) add("workInputChanged");
            if (fileFingerprint(QUEUE_PATH).sha256 !== integration.inputFingerprints.queue.sha256) add("queueInputChanged");
            if (fileFingerprint(CHECKPOINT_PATH).sha256 !== integration.inputFingerprints.checkpoint.sha256) add("checkpointInputChanged");
        } catch (error) { add(`inputFingerprintReadFailed:${error.message}`); }
    }
    try { assertNoDuplicateFrontiers(integration.sourceRegistry); } catch (error) { add(error.message); }
    try { assertNoDuplicateDecisions(integration.workRegistry); } catch (error) { add(error.message); }
    return { valid: errors.length === 0, errors };
}

function writeAtomic(target, bytes) {
    const resolved = path.resolve(target);
    if (!WRITE_TARGETS.has(resolved)) throw new Error(`writeTargetForbidden:${target}`);
    const temporary = `${resolved}.tmp-${process.pid}-${crypto.randomUUID()}`;
    let fd = null;
    try {
        fd = fs.openSync(temporary, "wx", 0o600);
        fs.writeFileSync(fd, bytes);
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fd = null;
        fs.renameSync(temporary, resolved);
    } catch (error) {
        if (fd !== null) {
            try { fs.closeSync(fd); } catch (_) { /* preserve original error */ }
        }
        try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch (_) { /* preserve original error */ }
        throw error;
    }
}

function writeArtifacts({ integration = buildIntegration(), confirm = false } = {}) {
    if (confirm !== true) throw new Error("explicitWriteConfirmationRequired");
    const validation = validateIntegration(integration, { compareCurrent: true });
    if (!validation.valid) throw new Error(`integrationNotWritable:${validation.errors.join(",")}`);
    if (fileFingerprint(SOURCE_FRONTIERS_PATH).sha256 !== integration.inputFingerprints.sourceFrontiers.sha256
        || fileFingerprint(WORK_DISPOSITIONS_PATH).sha256 !== integration.inputFingerprints.workDispositions.sha256
        || fileFingerprint(QUEUE_PATH).sha256 !== integration.inputFingerprints.queue.sha256
        || fileFingerprint(CHECKPOINT_PATH).sha256 !== integration.inputFingerprints.checkpoint.sha256) {
        throw new Error("writeInputFingerprintMismatch");
    }
    writeAtomic(SOURCE_FRONTIERS_PATH, `${JSON.stringify(integration.sourceRegistry, null, 2)}\n`);
    writeAtomic(WORK_DISPOSITIONS_PATH, `${JSON.stringify(integration.workRegistry, null, 2)}\n`);
    return { ...integration, writesPerformed: true, written: integration.writeTargets };
}

function main() {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== "--write")) throw new Error("unknownArgument");
    const integration = buildIntegration();
    const result = args.includes("--write") ? writeArtifacts({ integration, confirm: true }) : integration;
    process.stdout.write(`${JSON.stringify({ mode: args.includes("--write") ? "write" : "preview", valid: result.valid, writesPerformed: result.writesPerformed, kpi: result.kpi, writeTargets: result.writeTargets || result.written }, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {
    BEHAVIOR_ARTIFACT_FIELD_DIGEST,
    BEHAVIOR_ARTIFACT_SHA256,
    BEHAVIOR_SOURCE_AUDIT_FIELD_DIGEST,
    BEHAVIOR_SOURCE_AUDIT_SHA256,
    CHECKPOINT_PATH,
    EXPECTED,
    QUEUE_PATH,
    ROOT,
    SOURCE_FRONTIERS_PATH,
    TARGET_FRONTIER_IDS,
    WEAPON_ARTIFACT_FIELD_DIGEST,
    WEAPON_ARTIFACT_SHA256,
    WORK_DISPOSITIONS_PATH,
    buildIntegration,
    mergeFrontierRegistry,
    mergeWorkRegistry,
    validateIntegration,
    writeArtifacts
};
