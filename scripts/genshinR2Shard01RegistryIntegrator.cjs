"use strict";

/**
 * Prepare the already-reviewed behaviorSpec and weaponEffectSpec shard01
 * dispositions as one candidate-scoped preview.
 *
 * This module is intentionally an integration seam, not another evidence
 * producer.  The two shard modules remain the authority for their candidate
 * selection, source frontier, draft decisions, and per-shard validation.  The
 * integrator only joins those results against one fresh terminal build and
 * one current work-disposition registry.
 *
 * The default path is read-only.  `writeArtifacts({ integration, confirm:
 * true })` is the only write path and is restricted to the two explicitly
 * declared registry files.  It never writes the queue, checkpoint, Runtime,
 * canonical data, reports, or HSR files.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const behaviorShard = require("./genshinR2BehaviorSpecShard01G06Deferral.cjs");
const weaponShard = require("./genshinR2WeaponPrimaryFieldSearchShard01.cjs");
const terminal = require("./genshinTerminalStateAudit.cjs");
const work = require("./genshinWorkDisposition.cjs");
const registerDeferrals = require("./genshinR2RegisterDeferrals.cjs");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_FRONTIERS_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "source-search-frontiers.json");
const WORK_DISPOSITIONS_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "r2-work-dispositions.json");
const QUEUE_PATH = path.join(ROOT, "reports", "genshin-evidence-task-queue.json");
const CHECKPOINT_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0", "active-goal-resume-checkpoint.json");
const TARGET_VERSION = "7.0";
const EXPECTED = Object.freeze({
    total: 2268,
    completed: 15,
    evidenceDeferred: 393,
    pending: 1860,
    disposed: 408,
    strictVerified: 0,
    certificateEligible: 0,
    canonicalPromotionEligible: 0,
    behaviorShardCandidates: 100,
    weaponShardCandidates: 100,
    existingFrontiers: 2,
    existingDecisions: 193
});
const TARGET_FRONTIER_IDS = Object.freeze([
    behaviorShard.FRONTIER_ID,
    weaponShard.FRONTIER_ID
]);
const BASE_REVIEWED_AUDITS = Object.freeze([
    { path: "games/genshin/data/v2/reviews/r2-artifact-deferral-audit.json", sha256: "66239cd662d1251d7904fca1212b3410b20ec8c152ab5eaecfabb454c8ccb254" },
    { path: "games/genshin/data/v2/reviews/r2-weapon-deferral-audit.json", sha256: "4ad6efb12d98fb10298685fe83be92f702618621e58ea3058c63f5fcd3d8011f" }
]);
const WRITE_TARGETS = new Set([SOURCE_FRONTIERS_PATH, WORK_DISPOSITIONS_PATH]);

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

function assertRegistryShape(registry, label) {
    if (!registry || registry.schemaVersion !== 1
        || registry.kind !== "genshinSourceSearchFrontierRegistry"
        || !Array.isArray(registry.frontiers)) {
        throw new Error(`${label}Invalid`);
    }
}

function assertWorkRegistryShape(registry) {
    if (!registry || registry.schemaVersion !== 1
        || registry.kind !== "genshinR2WorkDispositionRegistry"
        || registry.policyId !== work.POLICY
        || registry.targetGameVersion !== TARGET_VERSION
        || !Array.isArray(registry.decisions)) {
        throw new Error("workDispositionRegistryInvalid");
    }
}

function assertNoTargetFrontiers(sourceRegistry) {
    const targetFrontiers = sourceRegistry.frontiers.filter((frontier) => TARGET_FRONTIER_IDS.includes(frontier?.id));
    if (targetFrontiers.length > 0) {
        throw new Error("targetFrontierAlreadyRegistered");
    }
}

function assertNoTargetDecisions(workRegistry, candidateIdList) {
    const candidateIds = new Set([
        ...(candidateIdList || []).map(String)
    ]);
    const collisions = workRegistry.decisions
        .map((decision) => String(decision?.candidateId || ""))
        .filter((candidateId) => candidateIds.has(candidateId));
    if (collisions.length > 0) {
        throw new Error(`targetDecisionAlreadyRegistered:${[...new Set(collisions)].join(",")}`);
    }
}

function validateNoDuplicateFrontiers(registry) {
    const seen = new Set();
    for (const frontier of registry.frontiers || []) {
        if (!frontier?.id || seen.has(frontier.id)) throw new Error(`frontierIdDuplicate:${frontier?.id || "<missing>"}`);
        seen.add(frontier.id);
    }
}

function validateNoDuplicateDecisions(registry) {
    const seen = new Set();
    for (const decision of registry.decisions || []) {
        const candidateId = String(decision?.candidateId || "");
        if (!candidateId || seen.has(candidateId)) throw new Error(`decisionCandidateDuplicate:${candidateId || "<missing>"}`);
        seen.add(candidateId);
    }
}

function weaponFrontierEntry(audit, prepared) {
    const expected = audit.frontier;
    const preview = prepared.frontier;
    if (!preview || preview.id !== expected.id || preview.policyId !== expected.policyId
        || preview.candidateIdDigest !== expected.candidateIdDigest
        || preview.auditDigest !== audit.fieldDigest
        || prepared.tasks.length !== EXPECTED.weaponShardCandidates) {
        throw new Error("weaponFrontierPreviewMismatch");
    }
    const candidateIds = audit.scope.candidateIds.map(String);
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
            || digest(frontier.candidateIds || []) !== digest(candidateIds)) {
            throw new Error(`weaponTaskFrontierMismatch:${task?.candidateId || "<missing>"}`);
        }
    }
    // Keep the exact persisted entry shape used by the weapon shard producer.
    // The producer is not changed or reimplemented; this projection is only
    // needed because its standalone preview intentionally does not expose the
    // source-registry object.
    return {
        id: expected.id,
        policyId: expected.policyId,
        status: expected.status,
        appliesTo: {
            dataset: "weapons",
            layer: "weaponEffectSpec",
            candidateCount: candidateIds.length,
            candidateIdDigest: expected.candidateIdDigest,
            candidateIds: clone(candidateIds)
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
    assertRegistryShape(base, "sourceFrontierRegistry");
    const next = {
        ...clone(base),
        frontiers: [
            ...base.frontiers.map(clone),
            clone(behaviorEntry),
            clone(weaponEntry)
        ]
    };
    validateNoDuplicateFrontiers(next);
    return next;
}

function mergeWorkRegistry(base, behaviorDecisions, weaponDecisions) {
    assertWorkRegistryShape(base);
    const next = {
        ...clone(base),
        decisions: [
            ...base.decisions.map(clone),
            ...behaviorDecisions.map(clone),
            ...weaponDecisions.map(clone)
        ].sort((left, right) => String(left.candidateId).localeCompare(String(right.candidateId)))
    };
    validateNoDuplicateDecisions(next);
    return next;
}

function decisionMap(decisions) {
    return new Map((decisions || []).map((decision) => [String(decision.candidateId), decision]));
}

function assertDecisionBindings(decisions, tasksById, label) {
    for (const decision of decisions) {
        const id = String(decision?.candidateId || "");
        const task = tasksById.get(id);
        if (!task) throw new Error(`${label}TaskMissing:${id}`);
        if (decision.queueTaskDigest !== work.taskDigest(task)) {
            throw new Error(`${label}TaskDigestMismatch:${id}`);
        }
        const validation = work.validateDeferral(decision, task, { targetGameVersion: TARGET_VERSION });
        if (!validation.valid) throw new Error(`${label}DecisionInvalid:${id}:${validation.errors.join(",")}`);
    }
}

function assertExpectedProgress(progress, queue) {
    const summary = progress?.summary || {};
    const strictVerified = (queue?.tasks || []).filter((task) => task?.certificate?.strictEligible === true).length;
    const checks = {
        total: summary.total,
        completed: summary.completed,
        evidenceDeferred: summary.evidenceDeferred,
        pending: summary.pending,
        disposed: summary.disposed,
        strictVerified,
        certificateEligible: queue?.summary?.candidateClaimEligible,
        canonicalPromotionEligible: queue?.summary?.promotionEligible
    };
    for (const [key, expected] of Object.entries(EXPECTED)) {
        if (!Object.hasOwn(checks, key)) continue;
        if (checks[key] !== expected) throw new Error(`combinedKpiMismatch:${key}:${checks[key]}:${expected}`);
    }
    if (progress.errors.length > 0) throw new Error(`combinedWorkProgressInvalid:${progress.errors.join(",")}`);
    return checks;
}

/**
 * Build a read-only combined preview from current repository inputs.
 *
 * The two shard `prepareRegistry` calls are deliberately retained here: they
 * validate their own exact artifacts and candidate-scoped predicates.  Their
 * results are then joined once and checked against a fresh terminal queue.
 */
function buildIntegration({ sourceRegistry = null, workRegistry = null } = {}) {
    const sourceFingerprint = fileFingerprint(SOURCE_FRONTIERS_PATH);
    const workFingerprint = fileFingerprint(WORK_DISPOSITIONS_PATH);
    const queueFingerprint = fileFingerprint(QUEUE_PATH);
    const checkpointFingerprint = fileFingerprint(CHECKPOINT_PATH);
    const currentSource = readJson(SOURCE_FRONTIERS_PATH);
    const currentWork = readJson(WORK_DISPOSITIONS_PATH);
    assertRegistryShape(currentSource, "sourceFrontierRegistry");
    assertWorkRegistryShape(currentWork);
    if (sourceRegistry && digest(sourceRegistry) !== digest(currentSource)) throw new Error("sourceInputSnapshotMismatch");
    if (workRegistry && digest(workRegistry) !== digest(currentWork)) throw new Error("workInputSnapshotMismatch");
    // Refresh from the already-reviewed exact artifacts.  Re-running their
    // original "first ready N" selectors after registration would select the
    // next shard, not reproduce shard01.
    const behaviorAudit = readJson(behaviorShard.ARTIFACT_PATH);
    const behaviorArtifactValidation = behaviorShard.validateAudit(behaviorAudit, { compareCurrent: false });
    if (!behaviorArtifactValidation.valid) {
        throw new Error(`behaviorShardArtifactInvalid:${behaviorArtifactValidation.reasons.join(",")}`);
    }
    const weaponAudit = readJson(weaponShard.OUTPUT_PATH);
    const weaponArtifactValidation = weaponShard.validateAudit(weaponAudit, { compareCurrent: false });
    const weaponImmutableErrors = weaponArtifactValidation.reasons.filter((reason) =>
        !/^(fileBytesMismatch|fileDigestMismatch):(reports\/genshin-evidence-task-queue\.json|games\/genshin\/data\/v2\/source-search-frontiers\.json|reports\/genshin-candidate-source-coverage-frontier-inventory\.json)$/.test(reason));
    if (weaponImmutableErrors.length > 0) {
        throw new Error(`weaponShardArtifactInvalid:${weaponImmutableErrors.join(",")}`);
    }
    const targetCandidateIds = new Set([
        ...behaviorAudit.scope.candidateIds,
        ...weaponAudit.scope.candidateIds
    ].map(String));
    // Refreshing an already-integrated exact shard is allowed.  Remove only
    // the two pinned frontier IDs and their exact candidate decisions before
    // rebuilding; foreign collisions and duplicates remain fail-closed.
    const baseSource = {
        ...clone(currentSource),
        frontiers: currentSource.frontiers.filter((frontier) => !TARGET_FRONTIER_IDS.includes(frontier?.id))
    };
    const transitionOnlyWork = {
        ...clone(currentWork),
        decisions: currentWork.decisions.filter((decision) => String(decision?.id || "").startsWith("r2-transition-deferral:"))
    };
    const refreshedBase = registerDeferrals.prepareRegistry({
        registry: transitionOnlyWork,
        queue: readJson(QUEUE_PATH),
        audits: BASE_REVIEWED_AUDITS,
        assessedAt: "2026-08-30T12:00:00+09:00"
    });
    const baseWork = refreshedBase.registry;
    if (baseSource.frontiers.length !== EXPECTED.existingFrontiers) throw new Error("baseFrontierCountInvalid");
    if (baseWork.decisions.length !== EXPECTED.existingDecisions) throw new Error("baseDecisionCountInvalid");
    const behaviorPrepared = behaviorShard.prepareRegistry({
        audit: behaviorAudit,
        registry: baseSource,
        workRegistry: baseWork
    });
    if (!behaviorPrepared.validation.valid) {
        throw new Error(`behaviorShardPreparationInvalid:${behaviorPrepared.validation.errors.join(",")}`);
    }
    const weaponPrepared = weaponShard.prepareRegistry({
        audit: weaponAudit,
        compareCurrent: false,
        sourceRegistry: baseSource
    });
    if (!weaponPrepared.valid) throw new Error(`weaponShardPreparationInvalid:${weaponPrepared.errors.join(",")}`);

    const behaviorIds = behaviorAudit.scope.candidateIds.map(String);
    const weaponIds = weaponAudit.scope.candidateIds.map(String);
    const overlap = behaviorIds.filter((id) => weaponIds.includes(id));
    if (overlap.length > 0) throw new Error(`shardCandidateOverlap:${overlap.join(",")}`);
    if (behaviorIds.length !== EXPECTED.behaviorShardCandidates || weaponIds.length !== EXPECTED.weaponShardCandidates) {
        throw new Error("shardCandidateCountInvalid");
    }
    const weaponEntry = weaponFrontierEntry(weaponAudit, weaponPrepared);
    const sourceOut = mergeFrontierRegistry(baseSource, behaviorPrepared.frontierEntry, weaponEntry);
    const freshTerminal = terminal.buildTerminalStateAudit({ sourceSearchFrontiersOverride: sourceOut });
    const queue = freshTerminal.taskQueue;
    const tasksById = new Map(queue.tasks.map((task) => [String(task.candidateId), task]));
    const behaviorTasks = behaviorIds.map((id) => tasksById.get(id));
    const weaponTasks = weaponIds.map((id) => tasksById.get(id));
    if (behaviorTasks.some((task) => !task) || weaponTasks.some((task) => !task)) throw new Error("combinedTaskBindingMissing");
    if (behaviorTasks.some((task) => !work.isAllowedShard01ExternalEvidenceWait(task))) {
        throw new Error("combinedBehaviorTaskPredicateInvalid");
    }
    if (weaponTasks.some((task) => !work.isAllowedWeaponShard01ExternalEvidenceWait(task))) {
        throw new Error("combinedWeaponTaskPredicateInvalid");
    }
    assertDecisionBindings(behaviorPrepared.decisions, tasksById, "behavior");
    assertDecisionBindings(weaponPrepared.decisions, tasksById, "weapon");

    const workOut = mergeWorkRegistry(baseWork, behaviorPrepared.decisions, weaponPrepared.decisions);
    const progress = work.buildWorkProgress(queue.tasks, workOut, {
        targetGameVersion: TARGET_VERSION
    });
    const kpi = assertExpectedProgress(progress, queue);

    const sourceAfter = fileFingerprint(SOURCE_FRONTIERS_PATH);
    const workAfter = fileFingerprint(WORK_DISPOSITIONS_PATH);
    const queueAfter = fileFingerprint(QUEUE_PATH);
    const checkpointAfter = fileFingerprint(CHECKPOINT_PATH);
    if (sourceAfter.sha256 !== sourceFingerprint.sha256 || workAfter.sha256 !== workFingerprint.sha256) {
        throw new Error("integrationInputsChangedDuringPrepare");
    }
    if (queueAfter.sha256 !== queueFingerprint.sha256 || checkpointAfter.sha256 !== checkpointFingerprint.sha256) {
        throw new Error("integrationAuxiliaryInputsChangedDuringPrepare");
    }
    return {
        valid: true,
        errors: [],
        inputFingerprints: {
            sourceFrontiers: sourceFingerprint,
            workDispositions: workFingerprint,
            queue: queueFingerprint,
            checkpoint: checkpointFingerprint
        },
        sourceRegistry: sourceOut,
        workRegistry: workOut,
        queue,
        workProgress: progress,
        kpi,
        shards: {
            behavior: {
                candidateIds: behaviorIds,
                candidateIdDigest: behaviorAudit.scope.candidateIdDigest,
                artifactFieldDigest: behaviorAudit.fieldDigest,
                decisions: behaviorPrepared.decisions.length
            },
            weapon: {
                candidateIds: weaponIds,
                candidateIdDigest: weaponAudit.scope.candidateIdDigest,
                artifactFieldDigest: weaponAudit.fieldDigest,
                decisions: weaponPrepared.decisions.length
            }
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
    try { assertRegistryShape(integration.sourceRegistry, "sourceFrontierRegistry"); }
    catch (error) { add(error.message); }
    try { assertWorkRegistryShape(integration.workRegistry); }
    catch (error) { add(error.message); }
    if (integration?.sourceRegistry?.frontiers?.length !== EXPECTED.existingFrontiers + 2) add("frontierCountInvalid");
    if (integration?.workRegistry?.decisions?.length !== EXPECTED.existingDecisions + 200) add("decisionCountInvalid");
    const kpi = integration?.kpi || {};
    for (const [key, expected] of Object.entries(EXPECTED)) {
        if (Object.hasOwn(kpi, key) && kpi[key] !== expected) add(`kpiMismatch:${key}`);
    }
    if (integration?.writesPerformed !== false) add("writeStateInvalid");
    if (compareCurrent && integration?.inputFingerprints) {
        try {
            if (fileFingerprint(SOURCE_FRONTIERS_PATH).sha256 !== integration.inputFingerprints.sourceFrontiers.sha256) add("sourceInputChanged");
            if (fileFingerprint(WORK_DISPOSITIONS_PATH).sha256 !== integration.inputFingerprints.workDispositions.sha256) add("workInputChanged");
            if (integration.inputFingerprints.queue
                && fileFingerprint(QUEUE_PATH).sha256 !== integration.inputFingerprints.queue.sha256) add("queueInputChanged");
            if (integration.inputFingerprints.checkpoint
                && fileFingerprint(CHECKPOINT_PATH).sha256 !== integration.inputFingerprints.checkpoint.sha256) add("checkpointInputChanged");
        } catch (error) { add(`inputFingerprintReadFailed:${error.message}`); }
    }
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
        // The destination is an explicitly allowlisted registry path.  A
        // staged fsync + rename keeps each replacement atomic on filesystems
        // that support replacement rename; any failure leaves the destination
        // untouched and is surfaced to the caller.
        fs.renameSync(temporary, resolved);
    } catch (error) {
        if (fd !== null) {
            try { fs.closeSync(fd); } catch (_) { /* preserve original error */ }
        }
        try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch (_) { /* preserve original error */ }
        throw error;
    }
}

/**
 * Persist exactly the two registries after an explicit caller confirmation.
 * The prepared input fingerprints are rechecked immediately before the first
 * replacement so a concurrent worker cannot be silently overwritten.
 */
function writeArtifacts({ integration = buildIntegration(), confirm = false } = {}) {
    if (confirm !== true) throw new Error("explicitWriteConfirmationRequired");
    const validation = validateIntegration(integration, { compareCurrent: true });
    if (!validation.valid) throw new Error(`integrationNotWritable:${validation.errors.join(",")}`);
    if (fileFingerprint(SOURCE_FRONTIERS_PATH).sha256 !== integration.inputFingerprints.sourceFrontiers.sha256
        || fileFingerprint(WORK_DISPOSITIONS_PATH).sha256 !== integration.inputFingerprints.workDispositions.sha256
        || (integration.inputFingerprints.queue
            && fileFingerprint(QUEUE_PATH).sha256 !== integration.inputFingerprints.queue.sha256)
        || (integration.inputFingerprints.checkpoint
            && fileFingerprint(CHECKPOINT_PATH).sha256 !== integration.inputFingerprints.checkpoint.sha256)) {
        throw new Error("writeInputFingerprintMismatch");
    }
    const sourceBytes = `${JSON.stringify(integration.sourceRegistry, null, 2)}\n`;
    const workBytes = `${JSON.stringify(integration.workRegistry, null, 2)}\n`;
    writeAtomic(SOURCE_FRONTIERS_PATH, sourceBytes);
    try {
        writeAtomic(WORK_DISPOSITIONS_PATH, workBytes);
    } catch (error) {
        // Do not retry or attempt an unsafe recovery here.  The first file was
        // committed atomically; the exact error and the prepared payload are
        // returned to the root caller for an explicit follow-up decision.
        throw error;
    }
    return {
        ...integration,
        writesPerformed: true,
        written: [relative(SOURCE_FRONTIERS_PATH), relative(WORK_DISPOSITIONS_PATH)]
    };
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
    CHECKPOINT_PATH,
    EXPECTED,
    QUEUE_PATH,
    ROOT,
    SOURCE_FRONTIERS_PATH,
    TARGET_FRONTIER_IDS,
    WORK_DISPOSITIONS_PATH,
    buildIntegration,
    mergeFrontierRegistry,
    mergeWorkRegistry,
    validateIntegration,
    writeArtifacts
};
