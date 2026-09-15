"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const test = require("node:test");
const {
    buildEvidenceTaskQueue,
    canAutomaticallyProcess,
    deriveSearchFrontier,
    validSearchExhaustionPolicy,
    hasExistingRuntimeInputRoute
} = require("../../scripts/genshinEvidenceTaskQueue.cjs");
const { buildTerminalStateAudit } = require("../../scripts/genshinTerminalStateAudit.cjs");
const { buildProgressAudit } = require("../../scripts/genshinV2ProgressAudit.cjs");

const repositoryRoot = path.resolve(__dirname, "..", "..");

const reviewedRuntimeInputCandidates = Object.freeze([
    "w_11427_1_v10",
    "w_11427_2_v10",
    "w_12427_1_v10",
    "w_12427_2_v10",
    "w_12515_four_winds_damage_per_stack_v10",
    "w_12515_magic_secret_crit_damage_per_stack_v10",
    "w_13427_1_v10",
    "w_13427_2_v10",
    "w_13427_3_v10",
    "w_15427_1_v10",
    "w_15427_2_v10",
    "w_15427_3_v10",
    "artifact:15022:fourPiece:4pc_sea_dyed_foam_damage",
    "artifact:15033:fourPiece:4pc_recorded_healing_additive_damage",
    "artifact:15041:fourPiece:4pc_crit_rate_moon_omen",
    "artifact:15042:fourPiece:4pc_team_elemental_mastery_moon_omen"
]);

const exhaustedPolicy = {
    id: "frontier:test",
    status: "searchExhausted",
    scopeSelector: { datasets: ["synthetic"] },
    searchScope: "test finite frontier",
    lastSearchedAt: "2026-08-25",
    providersExamined: ["provider-a", "provider-b"],
    reopenTrigger: "new immutable versioned provider manifest"
};

test("a historical verified Spec alone cannot complete the current version goal", () => {
    const record = {
        id: "fixture:historical-spec", layer: "behaviorSpec", dataset: "behaviorPilot",
        terminalState: "verifiedSpec", blockReasons: [], machineEvidenceReady: true,
        consumerStatus: "historicalCanonicalPendingRevalidation",
        historicalCanonicalPendingRevalidation: true
    };
    const context = { workDispositions: { targetGameVersion: "7.0", decisions: [], releaseAcceptance: null } };
    const pending = buildEvidenceTaskQueue([record], context);
    assert.equal(pending.summary.complete, 0);
    assert.equal(pending.summary.versionReverificationWait, 1);
    assert.equal(pending.goal.completion, false);
    assert.equal(pending.tasks[0].terminalState, "verifiedSpec");
    const current = buildEvidenceTaskQueue([{ ...record, historicalCanonicalPendingRevalidation: false, consumerStatus: "consumerNotRequiredOrPending" }], context);
    assert.equal(current.summary.verifiedSpecCurrent, 1);
    assert.equal(current.goal.verificationQueueComplete, true);
    assert.equal(current.goal.completion, false, "one completed Spec does not prove r2 release acceptance");
    assert.equal(current.workProgress.candidateWorkComplete, true);
});

test("current terminal evidence produces a queue instead of fixed transition counts", () => {
    const audit = buildTerminalStateAudit();
    const queue = audit.taskQueue;
    assert.equal(queue.summary.workDisposed, queue.workProgress.summary.disposed);
    assert.equal(queue.summary.evidenceDeferred, queue.workProgress.summary.evidenceDeferred);
    assert.equal(queue.summary.workPending, queue.workProgress.summary.pending);
    assert.equal(queue.summary.workDisposed + queue.summary.workPending + queue.summary.workAwaitingUserDecision, queue.summary.totalCandidates);
    const queueDigest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
    const persistedQueue = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "reports/genshin-evidence-task-queue.json"), "utf8"));
    assert.equal(queueDigest(persistedQueue), queueDigest(queue), "persisted authoritative queue must match the current evidence-derived build");
    assert.equal(audit.goalExecution.inventoryCandidatesClassified, 2268);
    assert.equal(audit.goalExecution.candidatesTerminalClassifiedThisGoal, undefined);
    assert.equal(audit.goalExecution.lunaCandidateClassificationReviewed, undefined);
    assert.equal(queue.kind, "genshinEvidenceDerivedTaskQueue");
    assert.equal(queue.summary.totalCandidates, 2268);
    assert.equal(queue.summary.complete, 64);
    assert.equal(queue.summary.verifiedSpec, 1);
    assert.equal(queue.summary.verifiedSpecCurrent, 0);
    assert.equal(queue.summary.versionReverificationWait, 1);
    const historicalSpec = queue.tasks.find((task) => task.candidateId === "behavior:10000026:talent:skill");
    assert.equal(historicalSpec.terminalState, "verifiedSpec");
    assert.equal(historicalSpec.task.kind, "versionReverification");
    assert.equal(historicalSpec.task.status, "awaitingEvidence");
    assert.equal(queue.goal.completion, false);
    assert.equal(queue.goal.completionPolicy, "genshin-goal-2026-08-28-r2");
    const dispositions = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "games/genshin/data/v2/r2-work-dispositions.json"), "utf8"));
    assert.ok(queue.workProgress.summary.evidenceDeferred <= dispositions.decisions.length, "stale or superseded dispositions must not close work");
    assert.equal(queue.workProgress.summary.disposed, queue.summary.complete + queue.workProgress.summary.evidenceDeferred);
    const workDisposition = require("../../scripts/genshinWorkDisposition.cjs");
    assert.ok(dispositions.decisions.every((decision) => {
        const task = queue.tasks.find((candidate) => candidate.candidateId === decision.candidateId);
        return task && workDisposition.taskDigest(task) === decision.queueTaskDigest;
    }), "existing r2 disposition task digests remain stable");
    assert.deepEqual(queue.workProgress.errors, []);
    assert.ok(queue.tasks.filter(task => task.progress.work.status === "evidenceDeferred")
        .every(task => task.progress.work.deferralValidation.valid && !task.certificate.strictEligible && task.task.status !== "complete"));
    assert.ok(queue.tasks.every((task) => task.progress && !task.progress.work.verificationGranted));
    assert.equal(queue.summary.behaviorModifierReconciled, 36);
    assert.equal(queue.summary.behaviorModifierReconciliationFailed, 0);
    assert.equal(queue.summary.talentGapReconciled, 67);
    assert.equal(queue.summary.talentGapReconciliationFailed, 0);
    assert.equal(queue.summary.talentGapFieldMappingsResolved, 63);
    assert.equal(queue.summary.talentGapFieldMappingsUnresolved, 4);
    assert.equal(queue.summary.officialWeaponFieldAvailability, 0);
    assert.equal(queue.summary.officialWeaponFieldAvailabilityStatus, "unavailableOrStale");
    assert.equal(queue.summary.sourceCoverageReconciled, 1816);
    assert.equal(queue.summary.sourceCoverageReconciliationFailed, 0);
    assert.equal(queue.summary.sourceCoverageLookupExecutableNow, null, "unsearched candidate availability is unknown, not evidence of no executable work");
    const sourceCoverage = queue.tasks.filter((task) => task.sourceCoverageReconciliation);
    assert.equal(sourceCoverage.length, 1816);
    assert.equal(sourceCoverage.filter((task) => task.sourceCoverageReconciliation.sourceLookupStatus === "lookupRequired"
        && task.sourceCoverageReconciliation.sourceLookupExecutableNow === null).length, 981);
    assert.equal(sourceCoverage.filter((task) => task.sourceCoverageReconciliation.sourceLookupStatus === "reopenOnTriggerOnly"
        && task.sourceCoverageReconciliation.sourceLookupExecutableNow === false).length, 835);
    assert.ok(sourceCoverage.every((task) => task.sourceCoverageReconciliation.searchExhausted === false
        && task.sourceCoverageReconciliation.certificateEligible === false));
    const sourceInventory = require("../../scripts/genshinCandidateSourceCoverageFrontierInventory.cjs").buildInventory({ queue });
    assert.ok(sourceCoverage.every((task) => task.sourceCoverageReconciliation.fieldDigest === sourceInventory.fieldDigest));
    const officialAvailability = queue.tasks.filter((task) => task.officialWeaponFieldAvailability);
    assert.equal(officialAvailability.length, 0);
    assert.ok(officialAvailability.every((task) => task.officialWeaponFieldAvailability.candidateClaimTextReferences === 4
        && task.officialWeaponFieldAvailability.strictGameVersionBinding === false
        && task.officialWeaponFieldAvailability.searchExhausted === false
        && !task.autoProcessableNow && !task.certificate.strictEligible));
    const talentReconciliations = queue.tasks.filter((task) => task.talentGapReconciliation);
    assert.equal(talentReconciliations.filter((task) => task.talentGapReconciliation.providerFieldMappingResolved).length, 63);
    assert.ok(talentReconciliations.every((task) => !task.autoProcessableNow && !task.certificate.strictEligible));
    assert.equal(talentReconciliations.filter((task) => task.talentGapReconciliation.providerFieldMappingStatus === "ambiguousVariant").length, 4);
    assert.ok(talentReconciliations.every((task) => task.talentGapReconciliation.authority === "diagnosticOnlyNotVerificationProof"));
    const talentAudit = require("../../scripts/genshinTalentGapLaneAudit.cjs").buildAudit({ queue });
    assert.ok(talentReconciliations.every((task) => task.talentGapReconciliation.auditFieldDigest === talentAudit.fieldDigest));
    const modifierReconciliations = queue.tasks.filter((task) => task.behaviorModifierReconciliation);
    assert.equal(modifierReconciliations.length, 36);
    assert.equal(modifierReconciliations.filter((task) => task.behaviorModifierReconciliation.classification === "historicalCanonicalPendingRevalidation").length, 1);
    assert.ok(modifierReconciliations.every((task) => task.behaviorModifierReconciliation.authority === "diagnosticOnlyNotVerificationProof"));
    const modifierAudit = require("../../scripts/genshinBehaviorModifierLaneAudit.cjs").buildAudit({ queue });
    assert.ok(modifierReconciliations.every((task) => task.behaviorModifierReconciliation.auditFieldDigest === modifierAudit.fieldDigest));
    assert.equal(queue.summary.autoProcessableNow, audit.summary.totals.autoProcessableNow);
    assert.equal(queue.summary.autoProcessableNow, 0);
    assert.equal(queue.summary.autoAttestationEligible, 0);
    assert.equal(queue.summary.promotionEligible, 0);
    assert.equal(queue.summary.certificateStrict, 0);
    assert.equal(queue.summary.searchExhausted, 1112);
    assert.equal(queue.summary.searchDeferred, 0);
    assert.equal(queue.summary.searchRequired, 1129);
    assert.equal(queue.summary.readyTasks, 1129);
    assert.equal(queue.summary.humanDecisionWait, 0);
    assert.equal(queue.summary.genuinelyBlocked, 1074);
    assert.equal(queue.summary.genuinelyBlockedState, "source-provider-frontier-blocked");
    assert.equal(queue.status, "sourceResearchAvailable");
    assert.equal(queue.unlockClusters.length, 8);
    assert.ok(queue.unlockClusters.some((cluster) => cluster.primaryBlockReason === "displayOnly"));
    assert.equal(queue.unlockClusters.reduce((sum, cluster) => sum + cluster.candidateCount, 0), 1129);
    assert.ok(queue.unlockClusters.every((cluster) => cluster.shards.every((shard) => shard.candidateIds.length <= 100)));
    assert.equal(queue.unlockClusters.some((cluster) => cluster.primaryBlockReason === "versionOrProviderCoverageDrift"), false);
    assert.equal(queue.goal.nextTask.candidateId, "artifact:15022:fourPiece:4pc_sea_dyed_foam_damage");
    assert.equal(queue.goal.nextTask.primaryBlockReason, "inputMissing");
    assert.equal(queue.goal.nextTask.task.priority, 50);
    const kqmTwoPiece = queue.tasks.find((entry) => entry.candidateId === "artifact:10001:twoPiece:2pc_atk_percent");
    assert.equal(kqmTwoPiece.searchFrontier.status, "searchExhausted");
    assert.equal(kqmTwoPiece.searchFrontier.policyId, "artifacts:kqm-tcl+genshin-db");
    assert.equal(kqmTwoPiece.searchFrontier.scopeUnit, "candidate-field-set");
    assert.equal(kqmTwoPiece.task.status, "reopenOnTrigger");
    const gcsimWeapon = queue.tasks.find((entry) => entry.candidateId === "w_11503_damage_1");
    assert.equal(gcsimWeapon.searchFrontier.status, "searchExhausted");
    assert.equal(gcsimWeapon.searchFrontier.policyId, "weapons-gcsim-nine-entity-field-frontier-7.0");
    assert.equal(gcsimWeapon.task.status, "reopenOnTrigger");
    const capturedWeapon = queue.tasks.find((entry) => entry.candidateId === "w_11301_damage_1");
    assert.equal(capturedWeapon.bulkTransitionCapture.status, "targetEntityRawDiffCapturedSingleCorrelatedFamily");
    assert.equal(capturedWeapon.bulkTransitionCapture.certificateEligible, false);
    const capturedWeaponShard03 = queue.tasks.find((entry) => entry.candidateId === "w_14518_statBonus_3c7c2d85");
    assert.equal(capturedWeaponShard03.bulkTransitionCapture.status, "targetEntityRawDiffCapturedSingleCorrelatedFamily");
    assert.equal(capturedWeaponShard03.bulkTransitionCapture.evidenceRef, "games/genshin/data/v2/version-transitions/6.7-to-7.0/weapon-entity-snapshot-shard03.json");
    const capturedWeaponShard04 = queue.tasks.find((entry) => entry.candidateId === "w_15514_damageBonus_da26c5de");
    assert.equal(capturedWeaponShard04.bulkTransitionCapture.status, "targetEntityRawDiffCapturedSingleCorrelatedFamily");
    assert.equal(capturedWeaponShard04.bulkTransitionCapture.evidenceRef, "games/genshin/data/v2/version-transitions/6.7-to-7.0/weapon-entity-snapshot-shard04.json");
    const capturedBehavior = queue.tasks.find((entry) => entry.candidateId === "behavior:10000002:constellation:constellation-1");
    assert.equal(capturedBehavior.bulkTransitionCapture.status, "targetDisplayRecordCapturedSingleCorrelatedFamily");
    const capturedBehaviorShard02 = queue.tasks.find((entry) => entry.candidateId === "behavior:10000020:constellation:constellation-1");
    assert.equal(capturedBehaviorShard02.bulkTransitionCapture.status, "targetDisplayRecordCapturedSingleCorrelatedFamily");
    assert.equal(capturedBehaviorShard02.bulkTransitionCapture.evidenceRef, "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-02-snapshot.json");
    const capturedBehaviorShard03 = queue.tasks.find((entry) => entry.candidateId === "behavior:10000029:constellation:constellation-1");
    assert.equal(capturedBehaviorShard03.bulkTransitionCapture.evidenceRef, "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-03-snapshot.json");
    const capturedBehaviorShard04 = queue.tasks.find((entry) => entry.candidateId === "behavior:10000043:constellation:constellation-1");
    assert.equal(capturedBehaviorShard04.bulkTransitionCapture.evidenceRef, "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-04-snapshot.json");
    const capturedBehaviorShard05 = queue.tasks.find((entry) => entry.candidateId === "behavior:10000047:constellation:constellation-1");
    assert.equal(capturedBehaviorShard05.bulkTransitionCapture.evidenceRef, "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-05-snapshot.json");
    const capturedBehaviorShard06 = queue.tasks.find((entry) => entry.candidateId === "behavior:10000059:constellation:constellation-1");
    assert.equal(capturedBehaviorShard06.bulkTransitionCapture.evidenceRef, "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-06-snapshot.json");
    const capturedBehaviorShard07 = queue.tasks.find((entry) => entry.candidateId === "behavior:10000064:constellation:constellation-1");
    assert.equal(capturedBehaviorShard07.bulkTransitionCapture.evidenceRef, "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-07-snapshot.json");
    const capturedBehaviorShard08 = queue.tasks.find((entry) => entry.candidateId === "behavior:10000072:constellation:constellation-1");
    assert.equal(capturedBehaviorShard08.bulkTransitionCapture.evidenceRef, "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-08-snapshot.json");
    const capturedBehaviorShard09 = queue.tasks.find((entry) => entry.candidateId === "behavior:10000079:constellation:constellation-1");
    assert.equal(capturedBehaviorShard09.bulkTransitionCapture.evidenceRef, "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-09-snapshot.json");
    const capturedBehaviorShard10 = queue.tasks.find((entry) => entry.candidateId === "behavior:10000086:constellation:constellation-1");
    assert.equal(capturedBehaviorShard10.bulkTransitionCapture.evidenceRef, "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-10-snapshot.json");
    const capturedBehaviorShard11 = queue.tasks.find((entry) => entry.candidateId === "behavior:10000094:constellation:constellation-1");
    assert.equal(capturedBehaviorShard11.bulkTransitionCapture.evidenceRef, "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-11-snapshot.json");
    const capturedBehaviorShard12 = queue.tasks.find((entry) => entry.candidateId === "behavior:10000102:constellation:constellation-1");
    assert.equal(capturedBehaviorShard12.bulkTransitionCapture.evidenceRef, "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-12-snapshot.json");
    const capturedBehaviorShard13 = queue.tasks.find((entry) => entry.candidateId === "behavior:10000109:constellation:constellation-1");
    assert.equal(capturedBehaviorShard13.bulkTransitionCapture.evidenceRef, "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-13-snapshot.json");
    const capturedBehaviorShard14 = queue.tasks.find((entry) => entry.candidateId === "behavior:10000116:constellation:constellation-1");
    assert.equal(capturedBehaviorShard14.bulkTransitionCapture.evidenceRef, "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-14-snapshot.json");
    const capturedBehaviorShard15 = queue.tasks.find((entry) => entry.candidateId === "behavior:10000124:constellation:constellation-1");
    assert.equal(capturedBehaviorShard15.bulkTransitionCapture.evidenceRef, "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-15-snapshot.json");
    const capturedBehaviorShard16 = queue.tasks.find((entry) => entry.candidateId === "behavior:10000132:constellation:constellation-1");
    assert.equal(capturedBehaviorShard16.bulkTransitionCapture.evidenceRef, "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-16-snapshot.json");
    for (const id of ["10000092", "10000093"]) {
        const task = queue.tasks.find((entry) => entry.candidateId === `behavior:${id}:constellation:constellation-1`);
        assert.equal(task.identityConsistency.classification, "mapperNameMismatch");
        assert.equal(task.identityConsistency.blocked, true);
        assert.equal(task.task.kind, "sourceProvider");
        assert.ok(task.deferredLanes.some((lane) => lane.kind === "identityReconciliation"));
    }
    assert.equal(capturedBehaviorShard13.identityConsistency.classification, "mapperMissing");
    assert.equal(capturedBehaviorShard13.identityConsistency.blocked, false);
    assert.equal(capturedBehaviorShard13.identityConsistency.consumerCoverageGap, true);
    const localizedIdentityTasks = queue.tasks.filter((entry) => entry.providerIdentityReconciliation);
    assert.equal(localizedIdentityTasks.length, 14);
    assert.ok(localizedIdentityTasks.every((entry) => entry.providerIdentityReconciliation.status === "explicitLocalizedNameBridge"));
    assert.ok(localizedIdentityTasks.every((entry) => entry.providerIdentityReconciliation.preservedNegativeAliasRecords === 4));
    assert.ok(localizedIdentityTasks.every((entry) => entry.providerIdentityReconciliation.certificateEligible === false && entry.autoProcessableNow === false));
    const ambiguousTraveler = queue.tasks.find((entry) => entry.candidateId.startsWith("behavior:10000005:"));
    assert.equal(ambiguousTraveler.bulkTransitionCapture.status, "targetVariantAmbiguityCapturedFailClosed");
    const ventiC6 = queue.tasks.find((entry) => entry.candidateId === "behavior:10000022:constellation:constellation-6");
    assert.equal(ventiC6.officialVersionImpact.status, "reacquisitionRequired");
    assert.equal(ventiC6.officialVersionImpact.gameVersion, "7.0");
    assert.equal(ventiC6.transitionLane, "exactCandidateMapped");
    assert.equal(ventiC6.searchFrontier.status, "searchExhausted");
    assert.equal(ventiC6.task.status, "reopenOnTrigger");
    const reaction = queue.tasks.find((entry) => entry.candidateId === "w_12516_reaction_bonus_2");
    assert.equal(reaction.primaryBlockReason, "versionOrProviderCoverageDrift");
    assert.equal(reaction.task.kind, "sourceProvider");
    assert.equal(reaction.task.status, "reopenOnTrigger");
    assert.equal(reaction.autoProcessableNow, false);
    assert.equal(reaction.searchFrontier.status, "searchExhausted");
    assert.equal(reaction.searchFrontier.policyId, "genshin-7.0-known-impact-55-independent-field-frontier");
    assert.equal(reaction.certificate.status, "blocked");
    assert.equal(reaction.fieldComparison.hasScopedMatch, false);
    assert.equal(reaction.fieldComparison.hasMismatch, false);
    assert.deepEqual(reaction.fieldComparison.statuses, []);
    assert.equal(reaction.officialVersionImpact.mappingStatus, "reactionConsumerTransition");
    assert.equal(reaction.consumerStatus, "formulaPending");
    assert.ok(reaction.deferredLanes.some((lane) => lane.kind === "consumer"));
});

test("known runtime input routes stay diagnostic while unknown inputs retain the consumer lane", () => {
    const audit = buildTerminalStateAudit();
    const records = new Map(audit.records.map((record) => [record.id, record]));
    const tasks = new Map(audit.taskQueue.tasks.map((task) => [task.candidateId, task]));
    assert.equal(reviewedRuntimeInputCandidates.length, 16);
    for (const candidateId of reviewedRuntimeInputCandidates) {
        const record = records.get(candidateId);
        const task = tasks.get(candidateId);
        assert.ok(record, `missing reviewed runtime-input record ${candidateId}`);
        assert.ok(task, `missing reviewed runtime-input task ${candidateId}`);
        assert.equal(record.terminalState, "blocked");
        assert.equal(record.primaryBlockReason, "inputMissing");
        assert.ok(record.blockReasons.includes("inputMissing"));
        assert.equal(record.legacy.inputImplemented, true);
        assert.equal(record.legacy.inputStatus, "applicable");
        assert.ok(record.legacy.inputRoute, `missing structured runtime route ${candidateId}`);
        assert.equal(hasExistingRuntimeInputRoute(record), true);
        assert.equal(task.task.kind, "sourceProvider");
        assert.equal(task.certificate.strictEligible, false);
    }

    // The real support15042 option/state bridge is covered by the normal
    // request and browser regressions; it no longer has a consumer gap.
    const ordinaryRoutes = [...reviewedRuntimeInputCandidates, "w_11510_damage_2"];
    assert.ok(ordinaryRoutes.every((candidateId) => {
        const task = tasks.get(candidateId);
        return !task.deferredLanes.some((lane) => lane.kind === "consumer" && lane.owner === "Sol implementation");
    }));

    const unknownInput = {
        id: "synthetic:unknown-input-route",
        dataset: "synthetic",
        layer: "weaponEffectSpec",
        terminalState: "blocked",
        primaryBlockReason: "inputMissing",
        blockReasons: ["sourceMissing", "inputMissing"],
        legacy: {
            supportStatus: "missingInput",
            reasonCode: "MANUAL_INPUT_REQUIRED",
            lane: "interactiveInput",
            inputImplemented: true,
            inputStatus: "applicable",
            requiredInputs: ["manual.unknownState"],
            missingInputs: ["manual.unknownState"]
        }
    };
    assert.equal(hasExistingRuntimeInputRoute(unknownInput), false);
    const unknownQueue = buildEvidenceTaskQueue([unknownInput], { providerPolicies: [] });
    assert.ok(unknownQueue.tasks[0].deferredLanes.some((lane) =>
        lane.kind === "consumer" && lane.owner === "Sol implementation" && lane.blockingReasons.includes("inputMissing")));
});

test("autoProcessableNow is evidence-derived and still keeps human packets non-automatic", () => {
    const machineRecord = {
        id: "synthetic:machine",
        dataset: "synthetic",
        layer: "weaponEffectSpec",
        terminalState: "blocked",
        primaryBlockReason: null,
        blockReasons: [],
        machineEvidenceReady: true,
        verificationStatus: "verified",
        mappingStatus: "prepared",
        consumerStatus: "notApplicable",
        evidence: {
            eligibilityCertificate: {
                certificateCount: 1,
                eligibleClaimCount: 1,
                blockedClaimCount: 0,
                status: "eligible",
                strictEligible: true,
                freshness: { current: true, staleClaimCount: 0, reasons: [] },
                providers: ["provider-a", "provider-b"],
                fieldComparison: { statuses: ["match"], hasScopedMatch: false, hasMismatch: false, scopeBoundary: null },
                claims: [{ claimId: "synthetic:machine:claim", field: "value", status: "eligible", comparisonStatus: "match", blockedReasons: [] }]
            }
        }
    };
    assert.equal(canAutomaticallyProcess(machineRecord), true);
    const machineQueue = buildEvidenceTaskQueue([machineRecord], { providerPolicies: [] });
    assert.equal(machineQueue.summary.autoProcessableNow, 1);
    assert.equal(machineQueue.goal.nextTask.task.kind, "machineTransition");

    const humanRecord = {
        ...machineRecord,
        id: "synthetic:human",
        terminalState: "awaitingHumanReview",
        machineEvidenceReady: true
    };
    assert.equal(canAutomaticallyProcess(humanRecord), false);
    const humanQueue = buildEvidenceTaskQueue([humanRecord], { providerPolicies: [] });
    assert.equal(humanQueue.summary.autoProcessableNow, 0);
    assert.equal(humanQueue.goal.nextTask.task.kind, "humanReview");
});

test("search exhaustion requires frontier metadata and defers when another primary task wins", () => {
    assert.equal(validSearchExhaustionPolicy(exhaustedPolicy), true);
    const source = {
        id: "synthetic:source",
        dataset: "synthetic",
        terminalState: "blocked",
        primaryBlockReason: "sourceMissing",
        blockReasons: ["sourceMissing", "gameVersionUnbound"]
    };
    assert.equal(deriveSearchFrontier(source, { providerPolicies: [exhaustedPolicy] }).status, "searchExhausted");

    const semantic = {
        ...source,
        id: "synthetic:semantic",
        primaryBlockReason: "semanticDecisionRequired",
        blockReasons: ["sourceMissing", "semanticDecisionRequired"]
    };
    assert.equal(deriveSearchFrontier(semantic, { providerPolicies: [exhaustedPolicy] }).status, "deferred");

    const incompletePolicy = { ...exhaustedPolicy, providersExamined: [] };
    assert.equal(validSearchExhaustionPolicy(incompletePolicy), false);
    assert.equal(deriveSearchFrontier(source, { providerPolicies: [incompletePolicy] }).status, "searchRequired");
});

test("search exhaustion never applies from prose or wildcard-like scope text", () => {
    const record = { id: "synthetic:one", dataset: "synthetic", layer: "behaviorSpec", terminalState: "blocked", primaryBlockReason: "sourceMissing", blockReasons: ["sourceMissing"] };
    const proseOnly = { ...exhaustedPolicy, scopeSelector: undefined, scope: ["all candidates outside reviewed representatives"] };
    assert.equal(deriveSearchFrontier(record, { providerPolicies: [proseOnly] }).status, "searchRequired");
});

test("strict source prerequisites precede semantic and consumer waits", () => {
    const semantic = {
        id: "synthetic:semantic-source-first",
        dataset: "synthetic",
        layer: "behaviorSpec",
        terminalState: "blocked",
        primaryBlockReason: "semanticDecisionRequired",
        blockReasons: ["sourceMissing", "gameVersionUnbound", "semanticDecisionRequired"],
        machineEvidenceReady: false,
        verificationStatus: "needsReview",
        mappingStatus: "prepared",
        consumerStatus: "notApplicable"
    };
    const consumer = {
        ...semantic,
        id: "synthetic:consumer-source-first",
        primaryBlockReason: "consumerMissing",
        blockReasons: ["sourceMissing", "gameVersionUnbound", "consumerMissing"],
        consumerStatus: "notApplicable"
    };
    const queue = buildEvidenceTaskQueue([semantic, consumer], { providerPolicies: [] });
    assert.ok(queue.tasks.every((task) => task.task.kind === "sourceProvider"));
    assert.ok(queue.tasks.every((task) => task.deferredLanes.length > 0));
    assert.equal(queue.summary.humanDecisionWait, 0);
    assert.equal(queue.summary.consumerWait, 0);

    const notApplicableConsumer = {
        ...consumer,
        id: "synthetic:consumer-not-applicable",
        blockReasons: [],
        primaryBlockReason: "consumerMissing",
        evidence: {
            eligibilityCertificate: {
                certificateCount: 1,
                eligibleClaimCount: 1,
                blockedClaimCount: 0,
                status: "eligible",
                strictEligible: true,
                freshness: { current: true, staleClaimCount: 0, reasons: [] },
                fieldComparison: { statuses: ["match"], hasScopedMatch: false, hasMismatch: false, scopeBoundary: null },
                claims: []
            }
        }
    };
    const notApplicableQueue = buildEvidenceTaskQueue([notApplicableConsumer], { providerPolicies: [] });
    assert.equal(notApplicableQueue.summary.consumerWait, 0);
    assert.notEqual(notApplicableQueue.goal.nextTask.task.kind, "consumer");
});

test("certificate, attestation, mapping, and consumer evidence are carried into queue KPIs", () => {
    const record = {
        id: "synthetic:certificate",
        dataset: "synthetic",
        layer: "weaponEffectSpec",
        terminalState: "blocked",
        primaryBlockReason: "unsupported",
        blockReasons: ["unsupported"],
        machineEvidenceReady: false,
        verificationStatus: "needsReview",
        mappingStatus: "prepared",
        consumerStatus: "missingOrPending",
        evidence: {
            eligibilityCertificate: {
                certificateCount: 1,
                eligibleClaimCount: 1,
                blockedClaimCount: 0,
                status: "eligible",
                strictEligible: true,
                freshness: { current: true, staleClaimCount: 0, reasons: [] },
                providers: ["provider-a", "provider-b"],
                fieldComparison: { statuses: ["match"], hasScopedMatch: false, hasMismatch: false, scopeBoundary: null },
                claims: [{ claimId: "synthetic:certificate:claim", field: "value", status: "eligible", comparisonStatus: "match", blockedReasons: [] }]
            }
        }
    };
    const queue = buildEvidenceTaskQueue([record], {
        providerPolicies: [],
        versionEvidence: {}
    });
    assert.equal(queue.summary.certificateStrict, 1);
    assert.equal(queue.summary.attestationPresent, 1);
    assert.equal(queue.summary.autoAttestationEligible, 1);
    assert.equal(queue.summary.promotionEligible, 1);
    assert.equal(queue.summary.mappingReady, 1);
    assert.equal(queue.summary.consumerWait, 1);
    assert.equal(queue.goal.nextTask.task.kind, "consumer");
});

test("progress audit exposes the same queue authority", () => {
    const progress = buildProgressAudit();
    const terminal = buildTerminalStateAudit();
    assert.equal(progress.targets.terminalStates.taskQueue.kind, "genshinEvidenceDerivedTaskQueue");
    assert.equal(progress.targets.terminalStates.taskQueue.summary.autoProcessableNow,
        terminal.taskQueue.summary.autoProcessableNow);
    assert.equal(progress.targets.terminalStates.taskQueue.goal.nextTask.candidateId,
        terminal.taskQueue.goal.nextTask.candidateId);
});

test("the shipped queue data artifact is byte-identical to its report and uses the manifest path", () => {
    const dataPath = path.join(repositoryRoot, "games", "genshin", "data", "v2", "evidence-task-queue.json");
    const reportPath = path.join(repositoryRoot, "reports", "genshin-evidence-task-queue.json");
    assert.equal(fs.existsSync(dataPath), true);
    assert.equal(fs.existsSync(reportPath), true);
    assert.equal(fs.readFileSync(dataPath).equals(fs.readFileSync(reportPath)), true);

    const manifest = JSON.parse(fs.readFileSync(
        path.join(repositoryRoot, "games", "genshin", "data", "data-v2-manifest.json"),
        "utf8"
    ));
    assert.deepEqual(manifest.datasets.evidenceTaskQueue, {
        path: "v2/evidence-task-queue.json",
        layer: "spec",
        authority: "evidenceDerivedQueue",
        generator: "genshinEvidenceTaskQueue.cjs"
    });

    // The terminal report's persisted name is candidate-terminal-states;
    // genshin-terminal-state-audit.json was never the generated contract.
    assert.equal(fs.existsSync(path.join(repositoryRoot, "reports", "genshin-candidate-terminal-states.json")), true);
    assert.equal(fs.existsSync(path.join(repositoryRoot, "reports", "genshin-terminal-state-audit.json")), false);
});

test("an otherwise eligible certificate is never strict when its accepted-version authority is stale", () => {
    const record = {
        id: "synthetic:stale-certificate",
        dataset: "synthetic",
        layer: "weaponEffectSpec",
        terminalState: "blocked",
        primaryBlockReason: "sourceMissing",
        blockReasons: ["sourceMissing"],
        evidence: {
            eligibilityCertificate: {
                certificateCount: 1,
                eligibleClaimCount: 1,
                blockedClaimCount: 0,
                status: "eligible",
                strictEligible: true,
                freshness: { current: false, staleClaimCount: 1, reasons: ["versionSnapshotMismatch"] },
                claims: []
            }
        }
    };
    const queue = buildEvidenceTaskQueue([record], { providerPolicies: [] });
    assert.equal(queue.summary.certificateStrict, 0);
    assert.equal(queue.summary.autoProcessableNow, 0);
});
