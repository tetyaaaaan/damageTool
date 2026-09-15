"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const inventoryBuilder = require(path.resolve(__dirname, "../../scripts/genshinR2AcceptanceInventory.cjs"));

const queuePath = path.resolve(__dirname, "../../reports/genshin-evidence-task-queue.json");
const schemaPath = path.resolve(__dirname, "../../games/genshin/data/schema/r2-acceptance-inventory.schema.json");
const clone = (value) => JSON.parse(JSON.stringify(value));
const queue = JSON.parse(fs.readFileSync(queuePath, "utf8"));
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));

function rehash(inventory) {
    inventory.fieldDigest = inventoryBuilder.digest(inventoryBuilder.fieldDigestMaterial(inventory));
    return inventory;
}

test("finite inventory covers the queue, twenty datasets, and bounded official 7.0 evidence", () => {
    const inventory = inventoryBuilder.buildInventory();
    const validation = inventoryBuilder.validateInventory(inventory);
    assert.deepEqual(validation, { valid: true, reasons: [] }, JSON.stringify(validation));
    assert.equal(inventory.summary.candidateCount, queue.tasks.length);
    assert.equal(inventory.summary.queueTaskCount, queue.tasks.length);
    assert.equal(inventory.summary.trackedDatasetCount, 20);
    assert.equal(inventory.summary.featureTargetCount, 22);
    assert.equal(inventory.summary.officialRawEntityCount, 3);
    assert.equal(inventory.summary.officialRawCandidateCount, 3);
    assert.equal(inventory.summary.allCandidatesComplete, false);
    assert.equal(inventory.summary.allStrictVerified, false);
    assert.equal(inventory.summary.allCalculationReady, false);
    assert.equal(inventory.summary.strictVerifiedCandidateCount, 0);
    assert.equal(inventory.summary.fieldVerifiedCandidateCount, 0);
    assert.equal(inventory.summary.certificateEligible, 0);
    assert.equal(inventory.summary.canonicalPromotionEligible, 0);
    assert.equal(inventory.summary.candidateWorkStatusCounts.completed, 64);
    assert.equal(inventory.summary.candidateWorkStatusCounts.pending, queue.workProgress.summary.pending);
    assert.equal(inventory.summary.candidateWorkStatusCounts.evidenceDeferred || 0, queue.workProgress.summary.evidenceDeferred);
    assert.equal(inventory.summary.evidenceStatusCounts.rawCapturedFieldVerificationPending, 3);

    for (const setId of ["15047", "15048"]) {
        const artifact = inventory.finiteFeatureTargets.find((target) => target.featureId === `artifactSet:${setId}:7.0`);
        assert.equal(artifact.status, "calculationImplementedStrictVerificationPending");
        assert.equal(artifact.candidateMappingStatus, "allOfficialFieldsMappedToV2Candidates");
        assert.equal(artifact.candidateIds.length, 3);
        assert.deepEqual(artifact.missingCandidateIds, []);
        assert.match(artifact.acceptance.safeAction, /calculation-connected/);
    }
    assert.equal(inventory.finiteFeatureTargets.some((target) => target.featureId.startsWith("officialRaw:weapon:")), false);
    const weaponTargets = inventory.finiteFeatureTargets.filter((target) => target.featureId.startsWith("weapon:new:"));
    assert.equal(weaponTargets.length, 12);
    assert.ok(weaponTargets.every((target) => target.status === "officialRosterCapturedIdentityUnresolved"
        && target.applicability === "coveragePending" && target.candidateIds.length === 0));

    const characterTargets = inventory.finiteFeatureTargets.filter((target) => target.featureId.startsWith("character:new:"));
    assert.deepEqual(characterTargets.map((target) => target.featureId), [
        "character:new:alyosha:7.0",
        "character:new:odette:7.0",
        "character:new:traveler-cryo:7.0"
    ]);
    const roster = characterTargets[0];
    assert.equal(roster.applicability, "coveragePending");
    assert.equal(roster.status, "rawCapturedIdentityUnresolved");
    assert.equal(roster.sourceKind, "versionTransitionRosterCapture");
    assert.equal(roster.candidateMappingStatus, "providerOnlyEntitiesCapturedLocalIdentityUnresolved");
    assert.deepEqual(roster.candidateIds, []);
    assert.match(roster.coverageGap.reason, /provider|local|typed/i);
    assert.equal(roster.rosterCapture.captureValidation.status, "validatedFromRawBytes");
    assert.equal(roster.rosterCapture.captureValidation.valid, true);
    assert.equal(roster.rosterCapture.providerOnlyEntityCount, 3);
    assert.equal(roster.rosterCapture.requestedRecordCount, 6);
    assert.equal(roster.rosterCapture.capturedRecordCount, 6);
    assert.equal(roster.rosterCapture.localEntityIdResolution, "unresolved");
    assert.equal(roster.rosterCapture.typedFieldMaterialization, "unresolved");
    assert.equal(roster.rosterCapture.fieldVerification, "notVerified");
    assert.equal(roster.rosterCapture.strictEligible, false);
    assert.equal(roster.rosterCapture.certificateEligible, false);
    assert.equal(roster.rosterCapture.canonicalPromotionEligible, false);
    assert.equal(roster.rosterCapture.calculationAccepted, false);
    assert.deepEqual(roster.rosterCapture.providerOnlyEntities.map((entity) => entity.providerSlug), ["alyosha", "odette", "travelercryo"]);
    assert.ok(roster.rosterCapture.providerOnlyEntities.every((entity) => entity.localEntityId === null && entity.typedFieldStatus === "notMaterialized"));
    const captureBytes = fs.readFileSync(path.resolve(__dirname, "../../games/genshin/data", inventoryBuilder.NEW_ROSTER_CAPTURE_RELATIVE_PATH));
    assert.equal(roster.rosterCapture.captureReference.bytes, captureBytes.length);
    assert.equal(roster.rosterCapture.captureReference.sha256, require("node:crypto").createHash("sha256").update(captureBytes).digest("hex"));

    const constellation = inventory.finiteFeatureTargets.find((target) => target.featureId.includes("10000022"));
    const skill = inventory.finiteFeatureTargets.find((target) => target.featureId.includes("10000039"));
    const passive = inventory.finiteFeatureTargets.find((target) => target.featureId.includes("10000058"));
    assert.equal(constellation.calculationFieldFamilies.includes("constellation"), true);
    assert.equal(skill.calculationFieldFamilies.includes("talentScaling"), true);
    assert.deepEqual(passive.calculationFieldFamilies, ["catalog", "modifiers"]);
    for (const entity of inventory.official7_0.rawEntities) {
        assert.equal(entity.status, "rawCapturedFieldVerificationPending");
        assert.equal(entity.fieldVerification, "notVerified");
        assert.equal(entity.certificateEligible, false);
    }
});

test("7.0 acceptance traceability points to the manifest-owned transition contract", () => {
    const inventory = inventoryBuilder.buildInventory();
    const ref = inventory.official7_0.versionEvidence.versionTransition;
    assert.equal(ref.path, "games/genshin/data/v2/version-transition.json");
    assert.equal(ref.exists, true);
});

test("dataset counts identify root keys and report nested records without pretending they are one flat count", () => {
    const inventory = inventoryBuilder.buildInventory();
    const baseStats = inventory.trackedDatasets.find((dataset) => dataset.dataset === "base-stats.json");
    const reactions = inventory.trackedDatasets.find((dataset) => dataset.dataset === "calc/reaction-definitions.json");
    assert.equal(baseStats.entityCountScope, "rootObjectKeys");
    assert.deepEqual(baseStats.nestedEntityCounts, { characters: 117, weapons: 234 });
    assert.deepEqual(reactions.nestedEntityCounts, {
        characterLevelMultipliers: 92,
        crystallizeShieldBase: 92,
        directReactionEntryRules: 6,
        options: 24
    });
    assert.match(inventory.summary.trackedEntityCountScope, /RootObjectKeys/);
});

test("queue progress drives work/evidence/calculation axes and search exhaustion alone does not defer work", () => {
    const explicitQueue = clone(queue);
    explicitQueue.tasks[0].progress.work.status = "pending";
    explicitQueue.tasks[0].searchFrontier.status = "searchExhausted";
    explicitQueue.tasks[0].searchFrontier.exhausted = true;
    const inventory = inventoryBuilder.buildInventory({ queue: explicitQueue });
    const first = inventory.candidateRecords.find((record) => record.candidateId === explicitQueue.tasks[0].candidateId);
    assert.equal(first.work.status, "pending");
    assert.equal(first.queueProgress.work.status, "pending");
    assert.equal(first.queueState.searchExhausted, true);
    assert.equal(first.work.status === "evidenceDeferredWithRecordedFrontier", false);

    explicitQueue.tasks[0].progress.work.status = "reviewRequired";
    const changed = inventoryBuilder.buildInventory({ queue: explicitQueue });
    const changedFirst = changed.candidateRecords.find((record) => record.candidateId === explicitQueue.tasks[0].candidateId);
    assert.equal(changedFirst.work.status, "reviewRequired");
});

test("inventory field output is deterministic for unchanged inputs", () => {
    const first = inventoryBuilder.buildInventory();
    const second = inventoryBuilder.buildInventory();
    assert.equal(inventoryBuilder.stableJson(inventoryBuilder.withoutQueueRawProvenance(first)), inventoryBuilder.stableJson(inventoryBuilder.withoutQueueRawProvenance(second)));
    assert.equal(first.fieldDigest, second.fieldDigest);
});

test("validator rejects an omitted candidate record", () => {
    const forged = inventoryBuilder.buildInventory();
    forged.candidateRecords.pop();
    rehash(forged);
    const validation = inventoryBuilder.validateInventory(forged, { compareCurrent: false });
    assert.equal(validation.valid, false);
    assert.equal(validation.reasons.some((reason) => reason.startsWith("candidateRecordOmission:") || reason === "candidateRecordCountMismatch"), true, JSON.stringify(validation));
});

test("validator rejects a duplicate candidate record", () => {
    const forged = inventoryBuilder.buildInventory();
    forged.candidateRecords.push(clone(forged.candidateRecords[0]));
    rehash(forged);
    const validation = inventoryBuilder.validateInventory(forged, { compareCurrent: false });
    assert.equal(validation.valid, false);
    assert.equal(validation.reasons.some((reason) => reason.startsWith("candidateIdDuplicate:")), true, JSON.stringify(validation));
});

test("validator rejects a stale queue record digest against the current queue", () => {
    const forged = inventoryBuilder.buildInventory();
    forged.candidateRecords[0].sourceQueueRecordDigest = "0".repeat(64);
    rehash(forged);
    const validation = inventoryBuilder.validateInventory(forged, { compareCurrent: false });
    assert.equal(validation.valid, false);
    assert.equal(validation.reasons.some((reason) => reason.startsWith("candidateQueueRecordDigestStale:")), true, JSON.stringify(validation));
});

test("validator rejects unknown feature applicability", () => {
    const forged = inventoryBuilder.buildInventory();
    forged.finiteFeatureTargets[0].applicability = "unknown";
    rehash(forged);
    const validation = inventoryBuilder.validateInventory(forged, { compareCurrent: false });
    assert.equal(validation.valid, false);
    assert.equal(validation.reasons.some((reason) => reason.startsWith("unknownApplicability:")), true, JSON.stringify(validation));
});

test("validator rejects fake all-complete claims", () => {
    const forged = inventoryBuilder.buildInventory();
    forged.summary.allCandidatesComplete = true;
    forged.gate.allCandidatesComplete = true;
    rehash(forged);
    const validation = inventoryBuilder.validateInventory(forged, { compareCurrent: false });
    assert.equal(validation.valid, false);
    assert.equal(validation.reasons.includes("fakeAllComplete"), true, JSON.stringify(validation));
});

test("schema records the fail-closed invariants and required inventory sections", () => {
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.properties.kind.const, "genshinR2AcceptanceInventory");
    assert.equal(schema.properties.summary.properties.allCandidatesComplete.type, "boolean");
    assert.equal(schema.properties.summary.properties.allStrictVerified.type, "boolean");
    assert.equal(schema.properties.summary.properties.certificateEligible.const, 0);
    assert.equal(schema.$defs.gate.properties.canPromoteCanonical.const, false);
    assert.equal(schema.$defs.featureTarget.properties.applicability.enum.includes("coveragePending"), true);
    assert.equal(schema.$defs.featureTarget.properties.rosterCapture.$ref, "#/$defs/rosterCaptureEvidence");
    assert.equal(schema.$defs.rosterCaptureEvidence.properties.status.enum.includes("rawCapturedIdentityUnresolved"), true);
    assert.equal(schema.$defs.providerOnlyRosterEntity.properties.localEntityId.const, null);
    assert.equal(schema.$defs.candidateRecord.properties.queueProgress.$ref, "#/$defs/queueProgress");
});

test("roster evidence remains candidate-free and rejects forged provider identity details", () => {
    const forged = inventoryBuilder.buildInventory();
    const roster = forged.finiteFeatureTargets.find((target) => target.featureId === "character:new:alyosha:7.0");
    roster.rosterCapture.providerOnlyEntities[0].providerEntityIds = ["10000120"];
    rehash(forged);
    const validation = inventoryBuilder.validateInventory(forged, { compareCurrent: false });
    assert.equal(validation.valid, false);
    assert.equal(validation.reasons.includes("rosterProviderEntityEvidenceInvalid"), true, JSON.stringify(validation));
    assert.deepEqual(roster.candidateIds, []);
    assert.equal(roster.rosterCapture.calculationAccepted, false);
});

test("legitimate queue work completion is derived, not permanently rejected", () => {
    const completedQueue = clone(queue);
    for (const task of completedQueue.tasks) task.progress.work.status = "completed";
    const inventory = inventoryBuilder.buildInventory({ queue: completedQueue });
    assert.equal(inventory.summary.allCandidatesComplete, true);
    assert.equal(inventory.gate.canIssueEligibilityCertificate, false);
    assert.equal(inventory.gate.canPromoteCanonical, false);
    assert.equal(inventory.summary.allStrictVerified, false);
    assert.deepEqual(inventoryBuilder.validateInventory(inventory, { queue: completedQueue }), { valid: true, reasons: [] });
});
