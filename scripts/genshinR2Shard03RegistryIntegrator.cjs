"use strict";

/**
 * Read-only integration preview for the exact Shard03 behavior and weapon
 * artifacts.  Shard01/02 are the immutable base; this seam only joins the
 * two new candidate-scoped evidence waits in memory.  It never changes the
 * authoritative queue, source-frontier registry, work registry, checkpoint,
 * Runtime, canonical data, or HSR application unless an explicit write call
 * is made by a caller after validation.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const baseIntegrator = require("./genshinR2Shard02RegistryIntegrator.cjs");
const behaviorShard = require("./genshinR2BehaviorSpecShard03G06Deferral.cjs");
const weaponShard = require("./genshinR2WeaponPrimaryFieldSearchShard03.cjs");
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
    evidenceDeferred: 793,
    pending: 1460,
    disposed: 808,
    strictVerified: 0,
    certificateEligible: 0,
    canonicalPromotionEligible: 0,
    baseFrontiers: 6,
    baseDecisions: 593,
    addedBehaviorCandidates: 100,
    addedWeaponCandidates: 100,
    finalFrontiers: 8,
    finalDecisions: 793
});
const TARGET_FRONTIER_IDS = Object.freeze([behaviorShard.FRONTIER_ID, weaponShard.FRONTIER_ID]);
const WRITE_TARGETS = new Set([SOURCE_FRONTIERS_PATH, WORK_DISPOSITIONS_PATH]);
const BEHAVIOR_ARTIFACT_SHA256 = "4b6f9d689d7fa1044b3a683ba1fcd3d1c60620dd41eef478295c1ad6e9a0c8a2";
const BEHAVIOR_SOURCE_AUDIT_SHA256 = "f67affa5372d5016e109b3c7bb2786ad2ea6556a6e42be9082b1bd47ab9f9d92";
const BEHAVIOR_ARTIFACT_FIELD_DIGEST = "cbfd013ef2027ea725e504c754f1882a725354ae36ea4a6de43f3b9ad6941212";
const BEHAVIOR_SOURCE_AUDIT_FIELD_DIGEST = "ffef476da9e9ec40e4813b0a50c9f135ace99cead276753e0cca81eb14eff5f0";
const WEAPON_ARTIFACT_SHA256 = "e9412205156019f3d32d1189f5c5862b419f01bb16a6b885f0a71dc40fb62d3e";
const WEAPON_ARTIFACT_FIELD_DIGEST = "5f81c2deefcfa845764caa056ccea5d3aa691f444931099dfcf511103b1301ca";

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sha256(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function digest(value) {
    return work.digest(value);
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
    const behaviorArtifactBytes = fs.readFileSync(behaviorShard.ARTIFACT_PATH);
    const behaviorSourceBytes = fs.readFileSync(behaviorShard.SOURCE_AUDIT_PATH);
    const weaponArtifactBytes = fs.readFileSync(weaponShard.OUTPUT_PATH);
    if (sha256(behaviorArtifactBytes) !== BEHAVIOR_ARTIFACT_SHA256) throw new Error("behaviorShard03ArtifactShaMismatch");
    if (sha256(behaviorSourceBytes) !== BEHAVIOR_SOURCE_AUDIT_SHA256) throw new Error("behaviorShard03SourceAuditShaMismatch");
    if (sha256(weaponArtifactBytes) !== WEAPON_ARTIFACT_SHA256) throw new Error("weaponShard03ArtifactShaMismatch");
    const behaviorAudit = JSON.parse(behaviorArtifactBytes.toString("utf8"));
    const behaviorSource = JSON.parse(behaviorSourceBytes.toString("utf8"));
    const weaponAudit = JSON.parse(weaponArtifactBytes.toString("utf8"));
    const behaviorValidation = behaviorShard.validateAudit(behaviorAudit, { compareCurrent: false });
    if (!behaviorValidation.valid) throw new Error(`behaviorShard03ArtifactInvalid:${behaviorValidation.reasons.join(",")}`);
    const behaviorSourceValidation = behaviorShard.validateSourceAudit(behaviorSource, { compareCurrent: false });
    if (!behaviorSourceValidation.valid) throw new Error(`behaviorShard03SourceAuditInvalid:${behaviorSourceValidation.reasons.join(",")}`);
    const weaponValidation = weaponShard.validateAudit(weaponAudit, { compareCurrent: false });
    const ignoredMutableInputReasons = /^(fileBytesMismatch|fileDigestMismatch):(reports\/genshin-evidence-task-queue\.json|games\/genshin\/data\/v2\/source-search-frontiers\.json|reports\/genshin-candidate-source-coverage-frontier-inventory\.json)$/iu;
    const weaponImmutableErrors = weaponValidation.reasons.filter((reason) => !ignoredMutableInputReasons.test(reason));
    if (weaponImmutableErrors.length > 0) throw new Error(`weaponShard03ArtifactInvalid:${weaponImmutableErrors.join(",")}`);
    if (behaviorAudit.fieldDigest !== BEHAVIOR_ARTIFACT_FIELD_DIGEST) throw new Error("behaviorShard03ArtifactFieldDigestMismatch");
    if (behaviorSource.fieldDigest !== BEHAVIOR_SOURCE_AUDIT_FIELD_DIGEST) throw new Error("behaviorShard03SourceAuditFieldDigestMismatch");
    if (weaponAudit.fieldDigest !== WEAPON_ARTIFACT_FIELD_DIGEST) throw new Error("weaponShard03ArtifactFieldDigestMismatch");
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
        throw new Error("behaviorShard03FrontierEntryMismatch");
    }
    if (entry.evidenceRefs.some((ref) => work.isMutableCoordinationArtifactPath(ref))) {
        throw new Error("behaviorShard03MutableFrontierEvidenceRef");
    }
}

function weaponFrontierEntry(audit, prepared) {
    const expected = audit.frontier;
    const preview = prepared.frontier;
    const ids = audit.scope.candidateIds.map(String);
    if (!preview || preview.id !== expected.id || preview.policyId !== expected.policyId
        || preview.candidateIdDigest !== expected.candidateIdDigest
        || preview.auditDigest !== audit.fieldDigest
        || prepared.tasks.length !== EXPECTED.addedWeaponCandidates) {
        throw new Error("weaponShard03FrontierPreviewMismatch");
    }
    for (const task of prepared.tasks) {
        const frontier = task?.searchFrontier;
        if (!frontier || frontier.frontierId !== expected.id
            || frontier.policyId !== expected.policyId
            || frontier.status !== expected.status
            || frontier.exhausted !== expected.exhausted
            || frontier.scopeMatched !== expected.scopeMatched
            || frontier.scopeUnit !== "candidate-field-set"
            || frontier.candidateIdDigest !== expected.candidateIdDigest
            || frontier.auditDigest !== audit.fieldDigest
            || digest(frontier.candidateIds || []) !== digest(ids)) {
            throw new Error(`weaponShard03TaskFrontierMismatch:${task?.candidateId || "<missing>"}`);
        }
    }
    return {
        id: expected.id,
        policyId: expected.policyId,
        status: expected.status,
        appliesTo: {
            dataset: "weapons",
            layer: "weaponEffectSpec",
            candidateCount: ids.length,
            candidateIdDigest: expected.candidateIdDigest,
            candidateIds: clone(ids)
        },
        searchScope: expected.searchScope,
        lastSearchedAt: expected.lastSearchedAt,
        providersExamined: clone(expected.providersExamined),
        negativeResult: expected.negativeResult,
        reopenTrigger: expected.reopenTrigger,
        auditDigest: audit.fieldDigest,
        evidenceRefs: [prepared.artifact.path]
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

function shardDetails(pinned, behaviorIds, weaponIds, behaviorDecisions, weaponDecisions) {
    return {
        behaviorShard03: {
            candidateIds: behaviorIds,
            candidateIdDigest: pinned.behaviorAudit.scope.candidateIdDigest,
            artifactFieldDigest: pinned.behaviorAudit.fieldDigest,
            artifactSha256: BEHAVIOR_ARTIFACT_SHA256,
            sourceAuditDigest: pinned.behaviorSource.fieldDigest,
            sourceAuditSha256: BEHAVIOR_SOURCE_AUDIT_SHA256,
            decisions: behaviorDecisions.length
        },
        weaponShard03: {
            candidateIds: weaponIds,
            candidateIdDigest: pinned.weaponAudit.scope.candidateIdDigest,
            artifactFieldDigest: pinned.weaponAudit.fieldDigest,
            artifactSha256: WEAPON_ARTIFACT_SHA256,
            decisions: weaponDecisions.length
        }
    };
}

function buildIntegration() {
    const sourceFingerprint = fileFingerprint(SOURCE_FRONTIERS_PATH);
    const workFingerprint = fileFingerprint(WORK_DISPOSITIONS_PATH);
    const queueFingerprint = fileFingerprint(QUEUE_PATH);
    const checkpointFingerprint = fileFingerprint(CHECKPOINT_PATH);
    const pinned = assertShardArtifactPins();
    const currentSource = readJson(SOURCE_FRONTIERS_PATH);
    const currentWork = readJson(WORK_DISPOSITIONS_PATH);
    const registeredTargets = TARGET_FRONTIER_IDS.filter((id) =>
        currentSource.frontiers?.filter((frontier) => frontier?.id === id).length === 1);

    // Idempotence path: once Shard03 is registered, validate the persisted
    // exact state in place.  Never remove/rebuild any registered frontier.
    if (registeredTargets.length === TARGET_FRONTIER_IDS.length) {
        if (currentSource.frontiers.length !== EXPECTED.finalFrontiers
            || currentWork.decisions?.length !== EXPECTED.finalDecisions) throw new Error("registeredShard03CountInvalid");
        const behaviorIds = pinned.behaviorAudit.scope.candidateIds.map(String);
        const weaponIds = pinned.weaponAudit.scope.candidateIds.map(String);
        const behaviorEntry = currentSource.frontiers.find((frontier) => frontier?.id === behaviorShard.FRONTIER_ID);
        validateBehaviorFrontier(pinned.behaviorAudit, behaviorEntry);
        const freshTerminal = terminal.buildTerminalStateAudit({ sourceSearchFrontiersOverride: currentSource });
        const queue = freshTerminal.taskQueue;
        const tasksById = new Map(queue.tasks.map((task) => [String(task.candidateId), task]));
        const behaviorTasks = behaviorIds.map((id) => tasksById.get(id));
        const weaponTasks = weaponIds.map((id) => tasksById.get(id));
        if (behaviorTasks.some((task) => !task) || weaponTasks.some((task) => !task)) throw new Error("registeredShard03TaskMissing");
        if (behaviorTasks.some((task) => !work.isAllowedShard03ExternalEvidenceWait(task))) throw new Error("registeredShard03BehaviorPredicateInvalid");
        if (weaponTasks.some((task) => !work.isAllowedWeaponShard03ExternalEvidenceWait(task))) throw new Error("registeredShard03WeaponPredicateInvalid");
        const decisionsById = new Map(currentWork.decisions.map((decision) => [String(decision.candidateId), decision]));
        const behaviorDecisions = behaviorIds.map((id) => decisionsById.get(id));
        const weaponDecisions = weaponIds.map((id) => decisionsById.get(id));
        if (behaviorDecisions.some((decision) => !decision) || weaponDecisions.some((decision) => !decision)) throw new Error("registeredShard03DecisionMissing");
        assertDecisionBindings(behaviorDecisions, tasksById, "registeredBehaviorShard03");
        assertDecisionBindings(weaponDecisions, tasksById, "registeredWeaponShard03");
        const progress = work.buildWorkProgress(queue.tasks, currentWork, { targetGameVersion: TARGET_VERSION });
        const kpi = assertExpectedProgress(progress, queue);
        return {
            valid: true,
            errors: [],
            inputFingerprints: { sourceFrontiers: sourceFingerprint, workDispositions: workFingerprint, queue: queueFingerprint, checkpoint: checkpointFingerprint },
            sourceRegistry: clone(currentSource),
            workRegistry: clone(currentWork),
            queue,
            workProgress: progress,
            kpi,
            shards: {
                behaviorShard01: { decisions: 100 },
                weaponShard01: { decisions: 100 },
                behaviorShard02: { decisions: 100 },
                weaponShard02: { decisions: 100 },
                ...shardDetails(pinned, behaviorIds, weaponIds, behaviorDecisions, weaponDecisions)
            },
            writesPerformed: false,
            writeTargets: [relative(SOURCE_FRONTIERS_PATH), relative(WORK_DISPOSITIONS_PATH)]
        };
    }
    if (registeredTargets.length !== 0) throw new Error("partialShard03Registration");

    const base = baseIntegrator.buildIntegration();
    if (!base.valid) throw new Error(`shard02BaseInvalid:${base.errors.join(",")}`);
    if (base.sourceRegistry.frontiers.length !== EXPECTED.baseFrontiers
        || base.workRegistry.decisions.length !== EXPECTED.baseDecisions) throw new Error("shard02BaseCountInvalid");
    const behaviorIds = pinned.behaviorAudit.scope.candidateIds.map(String);
    const weaponIds = pinned.weaponAudit.scope.candidateIds.map(String);
    if (behaviorIds.length !== EXPECTED.addedBehaviorCandidates || weaponIds.length !== EXPECTED.addedWeaponCandidates) throw new Error("shard03CandidateCountInvalid");
    const overlap = behaviorIds.filter((id) => weaponIds.includes(id));
    if (overlap.length > 0) throw new Error(`shard03CandidateOverlap:${overlap.join(",")}`);
    const baseIds = new Set(base.workRegistry.decisions.map((decision) => String(decision.candidateId)));
    const baseCollisions = [...behaviorIds, ...weaponIds].filter((id) => baseIds.has(id));
    if (baseCollisions.length > 0) throw new Error(`shard03DecisionAlreadyRegistered:${[...new Set(baseCollisions)].join(",")}`);
    const baseFrontierIds = new Set(base.sourceRegistry.frontiers.map((frontier) => String(frontier.id)));
    const frontierCollisions = TARGET_FRONTIER_IDS.filter((id) => baseFrontierIds.has(id));
    if (frontierCollisions.length > 0) throw new Error(`shard03FrontierAlreadyRegistered:${frontierCollisions.join(",")}`);

    const behaviorEntry = behaviorShard.frontierEntry(pinned.behaviorAudit.frontier, pinned.behaviorSource.evidenceRefs || pinned.behaviorAudit.evidence?.sourceRefs || []);
    validateBehaviorFrontier(pinned.behaviorAudit, behaviorEntry);
    const weaponPrepared = weaponShard.prepareRegistry({
        audit: pinned.weaponAudit,
        compareCurrent: false,
        sourceRegistry: base.sourceRegistry
    });
    if (!weaponPrepared.valid) throw new Error(`weaponShard03PreparationInvalid:${weaponPrepared.errors.join(",")}`);
    const weaponEntry = weaponFrontierEntry(pinned.weaponAudit, weaponPrepared);
    const sourceOut = mergeFrontierRegistry(base.sourceRegistry, behaviorEntry, weaponEntry);
    const freshTerminal = terminal.buildTerminalStateAudit({ sourceSearchFrontiersOverride: sourceOut });
    const queue = freshTerminal.taskQueue;
    const tasksById = new Map(queue.tasks.map((task) => [String(task.candidateId), task]));
    const behaviorTasks = behaviorIds.map((id) => tasksById.get(id));
    const weaponTasks = weaponIds.map((id) => tasksById.get(id));
    if (behaviorTasks.some((task) => !task) || weaponTasks.some((task) => !task)) throw new Error("shard03TaskBindingMissing");
    if (behaviorTasks.some((task) => !work.isAllowedShard03ExternalEvidenceWait(task))) throw new Error("shard03BehaviorTaskPredicateInvalid");
    if (weaponTasks.some((task) => !work.isAllowedWeaponShard03ExternalEvidenceWait(task))) throw new Error("shard03WeaponTaskPredicateInvalid");
    const behaviorDecisions = pinned.behaviorAudit.decisions.map(clone);
    const weaponDecisions = weaponPrepared.decisions.map(clone);
    assertDecisionBindings(behaviorDecisions, tasksById, "behaviorShard03");
    assertDecisionBindings(weaponDecisions, tasksById, "weaponShard03");
    const workOut = mergeWorkRegistry(base.workRegistry, behaviorDecisions, weaponDecisions);
    const progress = work.buildWorkProgress(queue.tasks, workOut, { targetGameVersion: TARGET_VERSION });
    const kpi = assertExpectedProgress(progress, queue);
    const sourceAfter = fileFingerprint(SOURCE_FRONTIERS_PATH);
    const workAfter = fileFingerprint(WORK_DISPOSITIONS_PATH);
    const queueAfter = fileFingerprint(QUEUE_PATH);
    const checkpointAfter = fileFingerprint(CHECKPOINT_PATH);
    if (sourceAfter.sha256 !== sourceFingerprint.sha256 || workAfter.sha256 !== workFingerprint.sha256
        || queueAfter.sha256 !== queueFingerprint.sha256 || checkpointAfter.sha256 !== checkpointFingerprint.sha256) {
        throw new Error("integrationInputsChangedDuringPrepare");
    }
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
            ...shardDetails(pinned, behaviorIds, weaponIds, behaviorDecisions, weaponDecisions)
        },
        writesPerformed: false,
        writeTargets: [relative(SOURCE_FRONTIERS_PATH), relative(WORK_DISPOSITIONS_PATH)]
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
    try { assertNoDuplicateFrontiers(integration.sourceRegistry); }
    catch (error) { add(error.message); }
    try { assertNoDuplicateDecisions(integration.workRegistry); }
    catch (error) { add(error.message); }
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
    process.stdout.write(`${JSON.stringify({
        mode: args.includes("--write") ? "write" : "preview",
        valid: result.valid,
        writesPerformed: result.writesPerformed,
        kpi: result.kpi,
        writeTargets: result.writeTargets || result.written
    }, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {
    BEHAVIOR_ARTIFACT_SHA256,
    BEHAVIOR_SOURCE_AUDIT_SHA256,
    CHECKPOINT_PATH,
    EXPECTED,
    QUEUE_PATH,
    ROOT,
    SOURCE_FRONTIERS_PATH,
    TARGET_FRONTIER_IDS,
    WEAPON_ARTIFACT_SHA256,
    WORK_DISPOSITIONS_PATH,
    buildIntegration,
    mergeFrontierRegistry,
    mergeWorkRegistry,
    validateIntegration,
    writeArtifacts
};
