"use strict";

/**
 * Read-only central integration preview for the exact Shard06 behavior
 * artifact.  The preview joins one candidate-scoped external-evidence wait
 * to the current Shard01-05 registries in memory.  It deliberately has no
 * authoritative write path.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const behaviorShard = require("./genshinR2BehaviorSpecShard06G06Deferral.cjs");
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
    evidenceDeferred: 1102,
    pending: 1151,
    disposed: 1117,
    strictVerified: 0,
    certificateEligible: 0,
    canonicalPromotionEligible: 0,
    baseFrontiers: 11,
    baseDecisions: 1002,
    addedBehaviorCandidates: 100,
    finalFrontiers: 12,
    finalDecisions: 1102
});
const BEHAVIOR_ARTIFACT_SHA256 = "4cf39eb83fddf408167a7d47cd49b4dac916d7c3f5e1cf81ff59668f9f75260b";
const BEHAVIOR_SOURCE_AUDIT_SHA256 = "78dcaee081473d99a04df7931adafeaf456f77f879feba4e003c1d60151cf615";
const BEHAVIOR_ARTIFACT_FIELD_DIGEST = "279866eec409c8dc0faf66c1ac90251cb3480cdb45828a1418c20812037eab9b";
const BEHAVIOR_SOURCE_AUDIT_FIELD_DIGEST = "fcef1b74cc6ddfbcfa4e31495425d7b85c84c0152d08bf9b0c85860246985aae";
const TARGET_FRONTIER_IDS = Object.freeze([behaviorShard.FRONTIER_ID]);
const WRITE_TARGETS = new Set([SOURCE_FRONTIERS_PATH, WORK_DISPOSITIONS_PATH]);

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function sha256(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function digest(value) { return work.digest(value); }
function relative(file) { return path.relative(ROOT, file).replaceAll("\\", "/"); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
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
    if (sha256(behaviorBytes) !== BEHAVIOR_ARTIFACT_SHA256) throw new Error("behaviorShard06ArtifactShaMismatch");
    if (sha256(sourceBytes) !== BEHAVIOR_SOURCE_AUDIT_SHA256) throw new Error("behaviorShard06SourceAuditShaMismatch");
    const behaviorAudit = JSON.parse(behaviorBytes.toString("utf8"));
    const behaviorSource = JSON.parse(sourceBytes.toString("utf8"));
    const behaviorValidation = behaviorShard.validateAudit(behaviorAudit, { compareCurrent: false });
    if (!behaviorValidation.valid) throw new Error(`behaviorShard06ArtifactInvalid:${behaviorValidation.reasons.join(",")}`);
    const sourceValidation = behaviorShard.validateSourceAudit(behaviorSource, { compareCurrent: false });
    if (!sourceValidation.valid) throw new Error(`behaviorShard06SourceAuditInvalid:${sourceValidation.reasons.join(",")}`);
    if (behaviorAudit.fieldDigest !== BEHAVIOR_ARTIFACT_FIELD_DIGEST) throw new Error("behaviorShard06ArtifactFieldDigestMismatch");
    if (behaviorSource.fieldDigest !== BEHAVIOR_SOURCE_AUDIT_FIELD_DIGEST) throw new Error("behaviorShard06SourceAuditFieldDigestMismatch");
    return { behaviorAudit, behaviorSource };
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
        throw new Error("behaviorShard06FrontierEntryMismatch");
    }
    for (const ref of entry.evidenceRefs) {
        if (typeof ref !== "string" || !fs.existsSync(path.join(ROOT, ref))) throw new Error(`behaviorShard06EvidenceMissing:${ref}`);
    }
}

function mergeFrontierRegistry(base, behaviorEntry) {
    const next = { ...clone(base), frontiers: [...(base.frontiers || []).map(clone), clone(behaviorEntry)] };
    assertNoDuplicateFrontiers(next);
    return next;
}

function mergeWorkRegistry(base, behaviorDecisions) {
    const next = {
        ...clone(base),
        decisions: [...(base.decisions || []).map(clone), ...behaviorDecisions.map(clone)]
            .sort((left, right) => String(left.candidateId).localeCompare(String(right.candidateId)))
    };
    assertNoDuplicateDecisions(next);
    return next;
}

function assertDecisionBindings(decisions, tasksById) {
    for (const decision of decisions) {
        const id = String(decision?.candidateId || "");
        const task = tasksById.get(id);
        if (!task) throw new Error(`behaviorShard06TaskMissing:${id}`);
        if (decision.queueTaskDigest !== work.taskDigest(task)) throw new Error(`behaviorShard06TaskDigestMismatch:${id}`);
        const validation = work.validateDeferral(decision, task, { targetGameVersion: TARGET_VERSION });
        if (!validation.valid) throw new Error(`behaviorShard06DecisionInvalid:${id}:${validation.errors.join(",")}`);
        const refs = [
            ...(decision.search?.artifactRefs || []),
            ...(decision.safety?.artifactRefs || []),
            ...(decision.assessment?.boundedScope?.artifactRefs || [])
        ];
        if (refs.some((ref) => work.isMutableCoordinationArtifactPath(ref?.path))) {
            throw new Error(`behaviorShard06MutableArtifactRef:${id}`);
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
        if (!task) throw new Error(`behaviorShard06DecisionTaskMissing:${id}`);
        return { ...clone(decision), queueTaskDigest: work.taskDigest(task) };
    });
}

function buildIntegration() {
    const inputFingerprints = {
        sourceFrontiers: fileFingerprint(SOURCE_FRONTIERS_PATH),
        workDispositions: fileFingerprint(WORK_DISPOSITIONS_PATH),
        queue: fileFingerprint(QUEUE_PATH),
        checkpoint: fileFingerprint(CHECKPOINT_PATH)
    };
    const pinned = assertShardArtifactPins();
    const baseSource = readJson(SOURCE_FRONTIERS_PATH);
    const baseWork = readJson(WORK_DISPOSITIONS_PATH);
    const behaviorIds = pinned.behaviorAudit.scope.candidateIds.map(String);
    const alreadyIntegrated = baseSource.frontiers.length === EXPECTED.finalFrontiers
        && baseWork.decisions.length === EXPECTED.finalDecisions;
    if (alreadyIntegrated) {
        const existingFrontier = baseSource.frontiers.find((frontier) => frontier.id === behaviorShard.FRONTIER_ID);
        validateBehaviorFrontier(pinned.behaviorAudit, existingFrontier);
        const queue = terminal.buildTerminalStateAudit({ sourceSearchFrontiersOverride: baseSource }).taskQueue;
        const tasksById = new Map(queue.tasks.map((task) => [String(task.candidateId), task]));
        const decisionsById = new Map(baseWork.decisions.map((decision) => [String(decision.candidateId), decision]));
        const behaviorDecisions = behaviorIds.map((id) => decisionsById.get(id));
        if (behaviorDecisions.some((decision) => !decision)) throw new Error("shard06RegisteredDecisionMissing");
        assertDecisionBindings(behaviorDecisions, tasksById);
        const progress = work.buildWorkProgress(queue.tasks, baseWork, { targetGameVersion: TARGET_VERSION });
        const kpi = assertExpectedProgress(progress, queue);
        return {
            valid: true,
            errors: [],
            inputFingerprints,
            sourceRegistry: baseSource,
            workRegistry: baseWork,
            queue,
            workProgress: progress,
            kpi,
            shards: { behaviorShard06: { candidateIds: behaviorIds, decisions: behaviorDecisions.length, alreadyIntegrated: true } },
            writesPerformed: false,
            writeTargets: []
        };
    }
    if (baseSource.frontiers.length !== EXPECTED.baseFrontiers || baseWork.decisions.length !== EXPECTED.baseDecisions) {
        throw new Error(`shard06BaseCountInvalid:${baseSource.frontiers.length}:${baseWork.decisions.length}`);
    }
    const baseIds = new Set(baseWork.decisions.map((decision) => String(decision.candidateId)));
    const collisions = behaviorIds.filter((id) => baseIds.has(id));
    if (collisions.length > 0) throw new Error(`shard06DecisionAlreadyRegistered:${[...new Set(collisions)].join(",")}`);
    const baseFrontierIds = new Set(baseSource.frontiers.map((frontier) => String(frontier.id)));
    const frontierCollisions = TARGET_FRONTIER_IDS.filter((id) => baseFrontierIds.has(id));
    if (frontierCollisions.length > 0) throw new Error(`shard06FrontierAlreadyRegistered:${frontierCollisions.join(",")}`);

    const refs = behaviorShard.immutableRefs(pinned.behaviorSource);
    const behaviorEntry = behaviorShard.frontierEntry(pinned.behaviorAudit.frontier, refs);
    validateBehaviorFrontier(pinned.behaviorAudit, behaviorEntry);
    const sourceOut = mergeFrontierRegistry(baseSource, behaviorEntry);
    const freshTerminal = terminal.buildTerminalStateAudit({ sourceSearchFrontiersOverride: sourceOut });
    const queue = freshTerminal.taskQueue;
    const tasksById = new Map(queue.tasks.map((task) => [String(task.candidateId), task]));
    const behaviorTasks = behaviorIds.map((id) => tasksById.get(id));
    if (behaviorTasks.some((task) => !task)) throw new Error("shard06TaskBindingMissing");
    if (behaviorTasks.some((task) => !work.isAllowedShard06ExternalEvidenceWait(task))) throw new Error("shard06TaskPredicateInvalid");
    const behaviorDecisions = rebindBehaviorDecisions(pinned.behaviorAudit, tasksById);
    if (behaviorDecisions.length !== EXPECTED.addedBehaviorCandidates) throw new Error("shard06DecisionCountInvalid");
    assertDecisionBindings(behaviorDecisions, tasksById);
    const workOut = mergeWorkRegistry(baseWork, behaviorDecisions);
    const progress = work.buildWorkProgress(queue.tasks, workOut, { targetGameVersion: TARGET_VERSION });
    const kpi = assertExpectedProgress(progress, queue);
    const currentInputs = {
        sourceFrontiers: fileFingerprint(SOURCE_FRONTIERS_PATH),
        workDispositions: fileFingerprint(WORK_DISPOSITIONS_PATH),
        queue: fileFingerprint(QUEUE_PATH),
        checkpoint: fileFingerprint(CHECKPOINT_PATH)
    };
    for (const key of Object.keys(inputFingerprints)) {
        if (currentInputs[key].sha256 !== inputFingerprints[key].sha256) throw new Error(`integrationInputChanged:${key}`);
    }
    return {
        valid: true,
        errors: [],
        inputFingerprints,
        sourceRegistry: sourceOut,
        workRegistry: workOut,
        queue,
        workProgress: progress,
        kpi,
        shards: {
            behaviorShard06: {
                candidateIds: behaviorIds,
                candidateIdDigest: pinned.behaviorAudit.scope.candidateIdDigest,
                artifactFieldDigest: BEHAVIOR_ARTIFACT_FIELD_DIGEST,
                artifactSha256: BEHAVIOR_ARTIFACT_SHA256,
                sourceAuditDigest: BEHAVIOR_SOURCE_AUDIT_FIELD_DIGEST,
                sourceAuditSha256: BEHAVIOR_SOURCE_AUDIT_SHA256,
                decisions: behaviorDecisions.length
            }
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
            for (const [key, file] of Object.entries({ sourceFrontiers: SOURCE_FRONTIERS_PATH, workDispositions: WORK_DISPOSITIONS_PATH, queue: QUEUE_PATH, checkpoint: CHECKPOINT_PATH })) {
                if (fileFingerprint(file).sha256 !== integration.inputFingerprints[key].sha256) add(`${key}InputChanged`);
            }
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
        if (fd !== null) { try { fs.closeSync(fd); } catch (_) { /* preserve original */ } }
        try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch (_) { /* preserve original */ }
        throw error;
    }
}

function writeArtifacts({ integration = buildIntegration(), confirm = false } = {}) {
    if (confirm !== true) throw new Error("explicitWriteConfirmationRequired");
    const validation = validateIntegration(integration, { compareCurrent: true });
    if (!validation.valid) throw new Error(`integrationNotWritable:${validation.errors.join(",")}`);
    for (const [key, file] of Object.entries({ sourceFrontiers: SOURCE_FRONTIERS_PATH, workDispositions: WORK_DISPOSITIONS_PATH, queue: QUEUE_PATH, checkpoint: CHECKPOINT_PATH })) {
        if (fileFingerprint(file).sha256 !== integration.inputFingerprints[key].sha256) throw new Error("writeInputFingerprintMismatch");
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
    WORK_DISPOSITIONS_PATH,
    buildIntegration,
    mergeFrontierRegistry,
    mergeWorkRegistry,
    validateIntegration,
    writeArtifacts
};
