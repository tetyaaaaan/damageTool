"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const inventoryBuilder = require(path.join(root, "scripts", "genshinCandidateSourceCoverageFrontierInventory.cjs"));

function read(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

const inventory = inventoryBuilder.buildInventory();

test("inventory scope is derived from the current authoritative queue", () => {
    const queue = read("reports/genshin-evidence-task-queue.json");
    const targets = inventoryBuilder.selectTargets(queue);
    assert.equal(targets.length, 1865);
    assert.equal(targets.filter((target) => target.layer === "behaviorSpec").length, 1581);
    assert.equal(targets.filter((target) => target.layer === "weaponEffectSpec").length, 284);
    assert.deepEqual(inventory.scope.candidateIds, targets.map((target) => target.candidateId));
    assert.equal(inventory.scope.candidateIdDigest, require(path.join(root, "scripts", "genshinVersionEvidenceValidation.cjs")).digestStable(inventory.scope.candidateIds));
});

test("provider lookup boundary refuses an untriggered repeat search without closing candidate frontiers", () => {
    const boundary = inventory.providerPrerequisites.sourceLookupBoundary;
    assert.equal(boundary.status, "lookupRequired");
    assert.equal(boundary.sourceLookupExecutableNow, null);
    assert.equal(boundary.providerSurfaceStatus, "reopenOnTriggerOnly");
    assert.equal(boundary.providerSurfaceLookupExecutableNow, false);
    assert.equal(boundary.candidateFieldSearchRequired, 1865);
    assert.equal(boundary.candidateFieldSearchStatus, "lookupRequired");
    assert.equal(boundary.providerSurfaceInspection.ledgerComplete, true);
    assert.equal(boundary.providerSurfaceInspection.allTargetsInspected, true);
    assert.equal(boundary.providerSurfaceInspection.providerSurfaceLookupExecutableNow, false);
    assert.equal(boundary.newProviderReleaseManifestLineageTriggerObservedInPersistedInputs, false);
    assert.ok(boundary.inspectedProviderCount >= 7);
    assert.ok(boundary.reopenTriggers.length >= 1);
    assert.equal(inventory.summary.sourceLookupExecutableNow, null);
    assert.equal(inventory.summary.sourceLookupReopenOnTriggerOnly, false);
    assert.ok(inventory.providerPrerequisites.nextLookupTargets.some((target) => target.couldUnlockStrictGate === true));
    assert.ok(inventory.providerPrerequisites.nextLookupTargets.every((target) => target.lookupExecutableNow === false && target.reopenTriggerRequired === true));
    assert.equal(inventory.candidateRecords.filter((candidate) => candidate.sourceLookup.status === "lookupRequired" && candidate.sourceLookup.executableNow === null).length, 1030);
    assert.equal(inventory.candidateRecords.filter((candidate) => candidate.sourceLookup.status === "reopenOnTriggerOnly" && candidate.sourceLookup.executableNow === false).length, 835);
    assert.equal(inventory.summary.candidateSearchExhaustedCount, 0);
    assert.equal(inventory.summary.candidateFieldSearchRequired, 1865);

    const forged = JSON.parse(JSON.stringify(inventory));
    forged.providerPrerequisites.sourceLookupBoundary.sourceLookupExecutableNow = false;
    const validation = inventoryBuilder.validateInventory(forged, { compareCurrent: false });
    assert.equal(validation.valid, false);
    assert.ok(validation.reasons.includes("sourceLookupBoundaryInvalid"));
});

test("transition raw integrity is recomputed and expected Traveler absence is not treated as mismatch", () => {
    const artifacts = inventory.sourceArtifacts;
    assert.equal(artifacts.filter((artifact) => artifact.integrityStatus === "mismatch").length, 0);
    assert.equal(artifacts.filter((artifact) => artifact.integrityStatus === "observedUnbound").length, 0);
    const missing = artifacts.filter((artifact) => artifact.integrityStatus === "missing");
    assert.equal(missing.length, 1);
    assert.match(missing[0].path, /English\/constellations\/travelercryo\.json$/);
    assert.ok(artifacts.filter((artifact) => artifact.integrityStatus === "verified").length > 800);
});

test("validated localized identity bridge supersedes the historical Yafoda alias without becoming mechanic proof", () => {
    assert.equal(inventory.identityBridge.identityBridgeProven, true);
    assert.equal(inventory.identityBridge.status, "explicitLocalizedNameBridge");
    assert.equal(inventory.identityBridge.rawArtifacts.every((artifact) => artifact.integrityStatus === "verified"), true);
    const jahoda = inventory.candidateRecords.filter((candidate) => candidate.entityId === "10000124");
    assert.equal(jahoda.length, 14);
    assert.equal(jahoda.every((candidate) => candidate.identityReconciliation?.providerSlug === "jahoda"), true);
    assert.equal(jahoda.every((candidate) => candidate.transitionEntityEvidence.status === "entityRecordCaptured"), true);
    assert.equal(jahoda.every((candidate) => candidate.identityReconciliation?.identityOnlyNotMechanicVerification === true), true);
    assert.equal(jahoda.every((candidate) => candidate.certificateEligible === false && candidate.canonicalPromotionEligible === false), true);
});

test("authoritative source-family mapping keeps GO correlated even when legacy descriptors disagree", () => {
    const go = inventory.externalDescriptors.find((descriptor) => descriptor.provider === "frzyc/genshin-optimizer");
    assert.ok(go);
    assert.equal(go.sourceFamily, "GenshinData-derived");
    assert.equal(go.legacyObservedIndependenceGroup, "genshin-optimizer-implementation");
    assert.equal(go.acceptedAsProof, false);
    assert.equal(go.strictGameVersionBinding, false);
    assert.equal(go.proofStatus, "descriptorOnlyNoRawCandidateFieldProof");
});

test("candidate coverage remains evidence-only and never infers exhaustion or promotion", () => {
    assert.equal(inventory.status, "passed");
    assert.equal(inventory.summary.applicableExhaustedFrontierCount, 10);
    assert.deepEqual(inventory.inspectedFrontiers.filter((frontier) => frontier.applicable).map((frontier) => frontier.id).sort(), [
        "genshin-7.0-behavior-spec-shard01-persisted-provider-frontier",
        "genshin-7.0-behavior-spec-shard02-persisted-provider-frontier",
        "genshin-7.0-behavior-spec-shard03-persisted-provider-frontier",
        "genshin-7.0-behavior-spec-shard04-persisted-provider-frontier",
        "genshin-7.0-behavior-spec-shard05-persisted-provider-frontier",
        "genshin-7.0-behavior-spec-shard06-persisted-provider-frontier",
        "weapons-primary-numeric-shard01-independent-field-frontier-7.0",
        "weapons-primary-numeric-shard02-independent-field-frontier-7.0",
        "weapons-primary-numeric-shard03-independent-field-frontier-7.0",
        "weapons-primary-numeric-shard04-independent-field-frontier-7.0"
    ]);
    assert.equal(inventory.summary.exactCandidateExternalFieldCoverage.independentVersionBoundCandidateClaims, 0);
    assert.equal(inventory.summary.certificateEligible, 0);
    assert.equal(inventory.summary.canonicalPromotion, 0);
    assert.equal(inventory.gate.status, "failClosed");
    assert.equal(inventory.gate.canIssueEligibilityCertificate, false);
    assert.equal(inventory.gate.canPromoteCanonical, false);
    assert.equal(inventory.candidateRecords.every((candidate) => candidate.searchExhausted === false), true);
    assert.equal(inventory.candidateRecords.every((candidate) => candidate.certificateEligible === false && candidate.canonicalPromotionEligible === false), true);
});

test("artifact, report, validator, and dedicated schema remain deterministic", () => {
    const artifact = read("games/genshin/data/v2/candidate-source-coverage-frontier-inventory.json");
    const report = read("reports/genshin-candidate-source-coverage-frontier-inventory.json");
    assert.deepEqual(artifact, inventory);
    assert.deepEqual(report, inventory);
    assert.deepEqual(inventoryBuilder.validateInventory(artifact), { valid: true, reasons: [] });
    const schema = read("games/genshin/data/schema/candidate-source-coverage-frontier-inventory.schema.json");
    assert.equal(schema.$id, "candidate-source-coverage-frontier-inventory.schema.json");
    assert.equal(schema.properties.kind.const, "genshinCandidateSourceCoverageFrontierInventory");
    assert.equal(schema.$defs.policy.properties.metadataBooleansNotProof.const, true);
    assert.ok(schema.$defs.sourceLookupBoundary.properties.sourceLookupExecutableNow.anyOf);
    assert.equal(schema.$defs.lookupTarget.properties.reopenTriggerRequired.const, true);
    assert.equal(schema.$defs.gate.properties.canPromoteCanonical.const, false);
});

test("validator rejects a forged executable lookup boundary", () => {
    const forged = JSON.parse(JSON.stringify(inventory));
    forged.providerPrerequisites.sourceLookupBoundary.sourceLookupExecutableNow = false;
    const result = inventoryBuilder.validateInventory(forged, { compareCurrent: false });
    assert.equal(result.valid, false);
    assert.ok(result.reasons.includes("fieldDigestInvalid"));
    assert.ok(result.reasons.includes("sourceLookupBoundaryInvalid"));
});

test("validator rejects a declared embedded identity that disagrees with the observed raw record", () => {
    const forged = JSON.parse(JSON.stringify(inventory));
    forged.sourceArtifacts[0].embeddedIdentity.declarationMatchesObserved = false;
    const result = inventoryBuilder.validateInventory(forged, { compareCurrent: false });
    assert.equal(result.valid, false);
    assert.ok(result.reasons.includes("sourceArtifactIdentityInvalid"));
});
