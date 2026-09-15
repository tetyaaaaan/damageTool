"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
    BATCH_IDS,
    buildDataset,
    defaultDataRoot,
    defaultOutputRoot,
    stableJson
} = require("../../scripts/genshinCharacterV2BehaviorBatch2Generate.cjs");
const { auditBehaviorBatch2 } = require("../../scripts/genshinCharacterV2BehaviorBatch2Audit.cjs");

function loadManifest() {
    return JSON.parse(fs.readFileSync(path.join(defaultOutputRoot, "manifest.json"), "utf8"));
}

function loadInventory() {
    return JSON.parse(fs.readFileSync(path.join(defaultDataRoot, "v2", "characters", "behavior-inventory.json"), "utf8"));
}

function explicitMeasurements(spec) {
    return ["timing", "execution", "energy", "elementApplication"].flatMap((section) => (
        Object.entries(spec[section] || {}).filter(([, measurement]) => measurement?.status === "explicit").map(([field, measurement]) => ({ section, field, measurement }))
    ));
}

test("batch 2 fixes the requested second sorted non-pilot character slice", () => {
    const artifact = loadManifest();
    assert.deepEqual(artifact.batchIds, BATCH_IDS);
    assert.deepEqual(BATCH_IDS, [
        "10000020", "10000021", "10000022", "10000023", "10000024",
        "10000025", "10000027", "10000029", "10000030", "10000032"
    ]);
    assert.equal(artifact.summary.batch, 2);
    assert.equal(artifact.summary.batchCharacters, 10);
    assert.equal(artifact.summary.inventoryCharacters, 109);
    assert.equal(artifact.summary.sourceRecords, 150);
    assert.equal(artifact.summary.inventoryCandidates, 140);
    assert.equal(artifact.summary.sourceInventoryCandidates, 91);
    assert.equal(artifact.summary.explicitInventoryCandidates, 50);
    assert.equal(artifact.summary.unknownInventoryCandidates, 41);
    assert.equal(artifact.summary.specs, 140);
    assert.equal(artifact.summary.modifiers, 0);
    assert.equal(artifact.summary.canonical, 0);
    assert.deepEqual(artifact.summary.verificationByStatus, { needsReview: 140 });
    assert.deepEqual(artifact.summary.runtimeByStatus, { blocked: 140 });
    assert.deepEqual(Object.keys(artifact.byCharacter).sort(), [...BATCH_IDS].sort());
});

test("inventory candidates resolve into review-gated specs without candidateOperations", () => {
    const artifact = loadManifest();
    const inventory = loadInventory();
    const expected = Object.values(inventory.candidates).filter((candidate) => BATCH_IDS.includes(candidate.entity?.id));
    assert.equal(expected.length, 91);
    assert.equal(expected.filter((candidate) => candidate.status === "candidate").length, 50);
    assert.equal(expected.filter((candidate) => candidate.status === "unknown").length, 41);
    let discrepancyCount = 0;
    Object.values(artifact.specs).forEach((spec) => {
        assert.equal(spec.verification.status, "needsReview");
        assert.equal(spec.runtime.status, "blocked");
        assert.deepEqual(spec.runtime.modifierIds, []);
        assert.equal(spec.runtime.generator, null);
        assert.ok(Array.isArray(spec.inventoryCandidateIds));
        assert.ok(Array.isArray(spec.unknownCandidateIds));
        assert.equal(Object.prototype.hasOwnProperty.call(spec, "candidateOperations"), false);
        spec.inventoryCandidateIds.forEach((candidateId) => assert.ok(inventory.candidates[candidateId], candidateId));
        spec.unknownCandidateIds.forEach((candidateId) => assert.equal(inventory.candidates[candidateId]?.status, "unknown"));
        const explicit = explicitMeasurements(spec);
        explicit.forEach(({ measurement }) => {
            assert.equal(measurement.status, "explicit");
            assert.ok(Array.isArray(measurement.sourceRefs));
            measurement.sourceRefs.forEach((sourceRef) => assert.ok(artifact.sourceRecords[sourceRef], sourceRef));
        });
        const candidateDiscrepancies = spec.verification.discrepancies.filter((entry) => entry.candidateId);
        discrepancyCount += candidateDiscrepancies.length;
        candidateDiscrepancies.forEach((entry) => {
            assert.ok(inventory.candidates[entry.candidateId], entry.candidateId);
            assert.ok(Array.isArray(entry.inventorySourceRefs));
            entry.inventorySourceRefs.forEach((sourceRef) => assert.ok(inventory.sourceRecords[sourceRef], sourceRef));
        });
        if (spec.lifecycle.refreshMode !== "unknown") {
            assert.equal(spec.lifecycle.refreshMode, "refresh");
            assert.ok(candidateDiscrepancies.some((entry) => entry.fieldPath === "/lifecycle/refreshMode" && entry.value === "refresh"));
        }
    });
    assert.equal(discrepancyCount, expected.length);
});

test("batch 2 generation, split files, and audit are deterministic", () => {
    const manifest = loadManifest();
    const generatedA = buildDataset({ dataRoot: defaultDataRoot });
    const generatedB = buildDataset({ dataRoot: defaultDataRoot });
    assert.equal(stableJson(generatedA), stableJson(generatedB));
    assert.equal(stableJson(manifest), stableJson(generatedA));
    [
        ["sourceRecords", "source-records.json"],
        ["inventoryCandidates", "inventory-candidates.json"],
        ["specs", "spec-candidates.json"],
        ["modifiers", "modifiers.json"]
    ].forEach(([key, file]) => {
        const value = JSON.parse(fs.readFileSync(path.join(defaultOutputRoot, file), "utf8"));
        assert.equal(stableJson(value), stableJson(manifest[key]));
    });
    const report = auditBehaviorBatch2({ dataRoot: defaultDataRoot, outputRoot: defaultOutputRoot });
    assert.equal(report.status, "passed");
    assert.deepEqual(report.errors, []);
    assert.equal(report.summary.deterministic, true);
    assert.equal(report.summary.contract.missingSignalRefs, 0);
    assert.equal(report.summary.contract.numericInferenceViolations, 0);
});
