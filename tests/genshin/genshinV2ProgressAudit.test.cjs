"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { buildProgressAudit, buildCompletionMetrics } = require("../../scripts/genshinV2ProgressAudit.cjs");

test("finite completion ratios distinguish historical verification, raw linkage and production candidates", () => {
    const row = (layer, terminalState, status) => ({ layer, terminalState, dataset: "fixture", task: { status } });
    const tasks = [
        row("behaviorSpec", "verifiedSpec", "awaitingEvidence"),
        row("behaviorSpec", "verifiedSpec", "complete"),
        row("weaponEffectSpec", "nonCalculativeComplete", "complete"),
        row("weaponEffectSpec", "productionCanonical", "complete"),
        row("artifactEffectSpec", "blocked", "ready")
    ];
    tasks[0].bulkTransitionCapture = { status: "partial" };
    const metrics = buildCompletionMetrics({ tasks, summary: {} }, { summary: { eligibleCount: 2, candidateClaimCount: 7 } });
    assert.equal(metrics.overallWorkPercent, null);
    assert.deepEqual([metrics.candidateCompletion.numerator, metrics.candidateCompletion.denominator, metrics.candidateCompletion.percent], [3, 5, 60]);
    assert.equal(metrics.currentBehaviorSpecCompletion.percent, 50);
    assert.equal(metrics.productionCanonicalCandidates.denominator, 2);
    assert.equal(metrics.productionCanonicalCandidates.percent, 50);
    assert.equal(metrics.bulkCaptureLinkage.percent, 20);
    assert.equal(metrics.strictClaimEligibility.percent, 28.5714);
    assert.equal(metrics.sourceCoverageReconciliation.percent, null);
    assert.equal(metrics.byDataset.fixture.percent, 60);
});

test("empty finite cohorts do not report artificial 100 percent completion", () => {
    const metrics = buildCompletionMetrics({ tasks: [], summary: {} }, { summary: { eligibleCount: 0, candidateClaimCount: 0 } });
    assert.equal(metrics.candidateCompletion.percent, null);
    assert.equal(metrics.productionCanonicalCandidates.percent, null);
    assert.equal(metrics.strictClaimEligibility.percent, null);
});

test("v2 progress keeps candidate coverage separate from canonical completion", () => {
    const audit = buildProgressAudit();
    assert.deepEqual([audit.completionMetrics.candidateCompletion.numerator, audit.completionMetrics.candidateCompletion.denominator], [15, 2268]);
    assert.equal(audit.completionMetrics.candidateCompletion.percent, 0.6614);
    assert.equal(audit.completionMetrics.currentBehaviorSpecCompletion.denominator, 1582);
    assert.equal(audit.completionMetrics.currentBehaviorSpecCompletion.numerator, 0);
    assert.equal(audit.completionMetrics.productionCanonicalCandidates.denominator, 671);
    assert.equal(audit.completionMetrics.productionCanonicalCandidates.numerator, 0);
    assert.equal(audit.completionMetrics.localizedTalentFieldMapping.denominator, 67);
    assert.equal(audit.completionMetrics.localizedTalentFieldMapping.numerator, 63);
    assert.equal(audit.totals.legacyRuntimeModifiers, 1561);
    assert.equal(audit.totals.legacyCompatibleRemaining, 1561);
    assert.equal(audit.totals.v2CanonicalRuntimeModifiers, 0);
    assert.equal(audit.statusInventory.historicalCanonicalPendingRevalidation, 2);
    assert.equal(audit.statusInventory.v2CandidatesAudited, 2268);
    assert.equal(audit.statusInventory.v2CandidatesExcludedFromCanonical, 2266);
    assert.equal(audit.statusInventory.unverifiedCandidates, 2266);
    assert.equal(audit.statusInventory.sourceInsufficientFieldClaims, 12117);
    assert.equal(audit.statusInventory.sourceComparisonMismatchesObserved, 0);
    assert.equal(audit.statusInventory.sourceValueConflictsObserved, 0);
    assert.equal(audit.statusInventory.sourceRevisionMismatchObserved, true);
    assert.equal(audit.statusInventory.unsupportedLegacyRuntime, 282);
    assert.equal(audit.statusInventory.displayOnlyLegacyRuntime, 83);
    assert.equal(audit.statusInventory.inputMissingLegacyRuntime, 68);
    assert.equal(audit.statusInventory.invalidLegacyRuntime, 37);
    assert.equal(audit.targets.weapons.totalModifiers, 455);
    assert.equal(audit.targets.weapons.candidateSpecs, 455);
    assert.equal(audit.targets.weapons.runtimeRouteConnected, 455);
    assert.equal(audit.targets.weapons.runtimeRouteMirrorConnected, 455);
    assert.equal(audit.targets.weapons.supersessionConnected, 455);
    assert.equal(audit.targets.weapons.supersessionMirrorConnected, 455);
    assert.equal(audit.targets.weapons.namespacedRuntimeIds, 455);
    assert.equal(audit.targets.weapons.canonical, 1);
    assert.equal(audit.targets.weapons.verified, 1);
    assert.equal(audit.targets.weapons.contractClaimsNeedsReview, 1362);
    assert.equal(audit.targets.weapons.uidHandlingCopied, 455);
    assert.equal(audit.targets.weapons.uidHandlingClaimsNeedsReview, 454);
    assert.equal(audit.targets.weaponExternalEvidence.sourceRecords, 9);
    assert.equal(audit.targets.weaponExternalEvidence.fieldRecords, 145);
    assert.equal(audit.targets.weaponExternalEvidence.supportsClaimValue, 72);
    assert.equal(audit.targets.weaponExternalEvidence.candidateValueAgreements, 72);
    assert.equal(audit.targets.weaponExternalEvidence.candidateValueConflicts, 0);
    assert.equal(audit.targets.weaponExternalEvidence.canonical, 0);
    assert.equal(audit.targets.weaponConflictTriage.comparisonMismatches, 0);
    assert.equal(audit.targets.weaponConflictTriage.semanticDiscrepancies, 0);
    assert.equal(audit.targets.weaponConflictTriage.mechanicallyResolvedRows, 35);
    assert.equal(audit.targets.weaponConflictTriage.classifications.resolvedMapping, 33);
    assert.equal(audit.targets.weaponConflictTriage.classifications.scopeMismatch, 0);
    assert.equal(audit.targets.weaponConflictTriage.classifications.parserLimitation, 0);
    assert.equal(audit.targets.weaponConflictTriage.genuineValueConflicts, 0);
    assert.equal(audit.targets.weaponConflictTriage.unmappedSourceFields, 0);
    assert.equal(audit.targets.weaponConflictTriage.registryMappedSourceFields, 4);
    assert.equal(audit.targets.weaponConflictTriage.schemaGapSourceFields, 0);
    assert.equal(audit.targets.officialWeaponPilot.weapons, 2);
    assert.equal(audit.targets.officialWeaponPilot.explicitGameVersionSources, 3);
    assert.equal(audit.targets.officialWeaponPilot.sourceReviewNeedsReview, 3);
    assert.equal(audit.targets.officialWeaponPilot.rankOneMatches, 3);
    assert.equal(audit.targets.officialWeaponPilot.completeOfficialRefinementClaims, 0);
    assert.equal(audit.targets.officialWeaponPilot.canonical, 0);
    assert.equal(audit.statusInventory.officialVersionScopedSources, 3);
    assert.equal(audit.statusInventory.strictlyBoundGameVersionSources, 1);
    assert.equal(audit.statusInventory.eligibilityCertificateEligibleClaims, 0);
    assert.equal(audit.statusInventory.eligibilityCertificateBlockedClaims, 3105);
    assert.equal(audit.targets.optimizerFieldEvidence.sourceRecords, 4);
    assert.equal(audit.targets.optimizerFieldEvidence.fieldRecords, 10);
    assert.equal(audit.targets.optimizerFieldEvidence.candidateValueAgreements, 8);
    assert.equal(audit.targets.optimizerFieldEvidence.providerIndependence.correlated, 4);
    assert.equal(audit.targets.optimizerFieldEvidence.canonical, 0);
    assert.equal(audit.targets.artifacts.structuredModifierGapReview.sets, 7);
    assert.equal(audit.targets.artifacts.structuredModifierGapReview.statuses.unstructured, 3);
    assert.equal(audit.targets.artifacts.structuredModifierGapReview.statuses.displayOnly, 4);
    assert.equal(audit.targets.artifacts.structuredModifierGapReview.valueContractStatuses.needsReview, 1);
    assert.equal(audit.targets.artifacts.structuredModifierGapReview.canonical, 0);
    assert.equal(audit.targets.artifacts.totalEntities, 61);
    assert.equal(audit.targets.artifacts.candidateSpecs, 122);
    assert.equal(audit.targets.artifacts.runtimeRouteConnected, 122);
    assert.equal(audit.targets.artifacts.supersessionConnected, 122);
    assert.equal(audit.targets.artifacts.namespacedRuntimeIds, 122);
    assert.equal(audit.targets.artifacts.contractClaimsReviewGated, 122);
    assert.equal(audit.targets.independentEvidence.claims, 12122);
    assert.equal(audit.targets.independentEvidence.dualSourceEligibleClaims, 5);
    assert.equal(audit.targets.independentEvidence.canonical, 1);
    assert.equal(audit.targets.gameVersionEvidence.revisionPinnedSources, 2);
    assert.equal(audit.targets.gameVersionEvidence.explicitGameVersionSources, 1);
    assert.equal(audit.targets.gameVersionEvidence.strictlyBoundSources, 1);
    assert.equal(audit.targets.gameVersionEvidence.fieldScopedRecords, 9);
    assert.equal(audit.targets.gameVersionEvidence.strictlyBoundFieldProvenance, 9);
    assert.equal(audit.targets.gameVersionEvidence.feasibilityStatus, "currentContractPartiallyFeasible");
    assert.equal(audit.targets.gameVersionEvidence.providerAssessment.gcsim.strictBinding, false);
    assert.equal(audit.targets.gameVersionEvidence.providerAssessment.genshinDb.strictBinding, true);
    assert.equal(audit.targets.gameVersionEvidence.canonical, 0);
    assert.equal(audit.targets.gameVersionEvidence.scopedCanonicalEligibility, 2);
    assert.equal(audit.targets.independentWeaponEvidence.records, 9);
    assert.equal(audit.targets.independentWeaponEvidence.fieldComparisons, 145);
    assert.equal(audit.targets.independentWeaponEvidence.independentProviderPairs, 9);
    assert.equal(audit.targets.independentWeaponEvidence.sameDataminePairs, 0);
    assert.equal(audit.targets.independentWeaponEvidence.humanJudgmentRequiredNow, 0);
    assert.equal(audit.targets.independentWeaponEvidence.canonical, 0);
    assert.equal(audit.targets.eligibilityCertificates.candidateClaimCount, 3105);
    assert.equal(audit.targets.eligibilityCertificates.eligibleCount, 0);
    assert.equal(audit.targets.eligibilityCertificates.blockedCount, 3105);
    assert.equal(audit.targets.eligibilityCertificates.eligibleCandidates, 0);
    assert.equal(audit.targets.eligibilityCertificates.autoAttestationEligible, 0);
    assert.equal(audit.targets.eligibilityCertificates.promotionEligible, 0);
    assert.equal(audit.targets.reviewReadiness.claims.machineEvidenceRequired, 5315);
    assert.equal(audit.targets.reviewReadiness.claims.humanReviewReady, 0);
    assert.equal(audit.targets.reviewReadiness.claims.verified, 13);
    assert.equal(audit.targets.reviewReadiness.conflictFollowup.humanDecisionRequiredNow, 0);
    assert.equal(audit.targets.reviewPackets.packets, 2);
    assert.equal(audit.targets.reviewPackets.items, 26);
    assert.equal(audit.targets.reviewPackets.byRecommendation.holdForEvidence, 2);
    assert.equal(audit.targets.reviewPackets.canonical, 0);
    const canonicalRuntime = require("../../games/genshin/data/v2/runtime/canonical-runtime.json");
    assert.equal(audit.targets.canonicalRuntime.candidatesAudited, canonicalRuntime.summary.candidatesAudited);
    assert.equal(audit.targets.canonicalRuntime.generated, 2);
    assert.equal(audit.targets.canonicalRuntime.activeForProduction, 0);
    assert.equal(audit.targets.canonicalRuntime.inactivePendingRevalidation, 2);
    assert.equal(audit.targets.canonicalRuntime.loaderGateConnected, true);
    assert.equal(audit.targets.canonicalRuntime.behaviorRuntimeRouteConnected, true);
    assert.equal(audit.targets.canonicalUiRuntimeE2e.productionCanonical, 0);
    assert.equal(audit.targets.canonicalUiRuntimeE2e.historicalCanonicalPendingRevalidation, 2);
    assert.equal(audit.targets.canonicalUiRuntimeE2e.fixtureShipped, false);
    assert.equal(audit.targets.canonicalUiRuntimeE2e.syntheticCanonicalModifiers, 4);
    assert.equal(audit.targets.canonicalUiRuntimeE2e.loader.applied, 4);
    assert.equal(audit.targets.canonicalUiRuntimeE2e.conditionChangesCalculation, true);
    assert.equal(audit.targets.canonicalUiRuntimeE2e.representative.routeEstablished, true);
    assert.equal(audit.targets.canonicalUiRuntimeE2e.representative.strictSources, 2);
    assert.equal(audit.targets.canonicalUiRuntimeE2e.representative.calculation.doubleApplied, false);
    assert.equal(audit.targets.characters.totalEntities, 117);
    assert.equal(audit.targets.characters.unstructuredTalentModifierEntities, 25);
    assert.equal(audit.targets.characterExternalEvidence.candidates, 129);
    assert.equal(audit.targets.characterExternalEvidence.evidenceMappings, 258);
    assert.equal(audit.targets.characterExternalEvidence.claimValueEvidence, 0);
    assert.equal(audit.targets.characterExternalEvidence.canonical, 0);
    assert.equal(audit.targets.characterFieldMaterialization.characters, 31);
    assert.equal(audit.targets.characterFieldMaterialization.fieldEvidence, 258);
    assert.equal(audit.targets.characterFieldMaterialization.materializedSources, 74);
    assert.equal(audit.targets.characterFieldMaterialization.canonical, 0);
    assert.deepEqual(audit.targets.constellationSourceInference.semanticClassification, {
        partiallyConfirmed: 54,
        sourceMismatch: 9,
        unconfirmed: 21
    });
    assert.deepEqual(audit.targets.talentModifierGaps.classification, {
        noEffect: 0,
        unstructured: 25,
        uninvestigated: 0
    });
    assert.equal(audit.targets.talentModifierGaps.candidateSpecs, 73);
    assert.equal(audit.targets.talentModifierGaps.runtimeBlocked, 73);
    assert.equal(audit.targets.constellationSourceInference.totalFlagged, 84);
    assert.equal(audit.targets.constellationSourceInference.canonical, 0);
    assert.equal(audit.targets.timingAndCounts.pilotEntities, 8);
    assert.equal(audit.targets.timingAndCounts.inventoryExpansionEntities, 109);
    assert.equal(audit.targets.timingAndCounts.inventoryCandidates, 1693);
    assert.equal(audit.targets.timingAndCounts.inventoryCandidateStatus.unknown, 611);
    const batches = require("../../games/genshin/data/v2/characters/behavior-batches/index.json").summary;
    assert.equal(audit.targets.timingAndCounts.normalizedBatchEntities, batches.batchCharacters);
    assert.equal(audit.targets.timingAndCounts.normalizedBatchSpecs, batches.specs);
    assert.equal(audit.targets.timingAndCounts.normalizedBatchNeedsReview, batches.specs);
    assert.equal(audit.targets.timingAndCounts.normalizedBatchRuntimeBlocked, batches.specs);
    assert.equal(audit.policy.candidateIsNotCanonical, true);
});

test("UID party progress records automation without claiming combat-state inference", () => {
    const uid = buildProgressAudit().targets.uidParty;
    assert.equal(uid.sharedCalculationInput, true);
    assert.equal(uid.supportMemberConversion, true);
    assert.equal(uid.losslessSupportMember, true);
    assert.equal(uid.losslessSupportProjection, "profileSnapshot_plus_provider_subset");
    assert.equal(uid.profileSnapshotCalculationInput, true);
    assert.equal(uid.existingSlotAutoFillOnSelection, true);
    assert.equal(uid.combatStateAutoEnabled, false);
    assert.equal(uid.domE2eClaim, true);
    assert.equal(uid.talentOrderSourceVerified, false);
    assert.equal(uid.talentOrderFailClosed, true);
});

test("ready source research and an upstream version transition prevent goal completion", () => {
    const audit = buildProgressAudit();
    assert.equal(audit.status, "upstreamVersionAvailable");
    assert.equal(audit.goalContinuation.state, "active");
    assert.equal(audit.goalContinuation.complete, false);
    assert.equal(audit.goalContinuation.awaitingUserDecision, false);
    assert.equal(audit.goalContinuation.genuinelyBlocked, false);
});
