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
} = require("../../scripts/genshinCharacterV2BehaviorBatch9Generate.cjs");
const { auditBehaviorBatch9 } = require("../../scripts/genshinCharacterV2BehaviorBatch9Audit.cjs");

function loadManifest() { return JSON.parse(fs.readFileSync(path.join(defaultOutputRoot, "manifest.json"), "utf8")); }
function loadInventory() { return JSON.parse(fs.readFileSync(path.join(defaultDataRoot, "v2", "characters", "behavior-inventory.json"), "utf8")); }
function pathValue(spec, fieldPath) {
    const parts = String(fieldPath || "").replace(/^\//, "").split("/");
    return parts.length === 2 ? spec[parts[0]]?.[parts[1]] : undefined;
}
function isMeasurement(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        && Object.prototype.hasOwnProperty.call(value, "value")
        && Object.prototype.hasOwnProperty.call(value, "unit")
        && value.status === "explicit"
        && Array.isArray(value.sourceRefs);
}

test("batch 9 fixes the requested ten non-pilot character IDs", () => {
    const artifact = loadManifest();
    assert.deepEqual(artifact.batchIds, BATCH_IDS);
    assert.deepEqual(BATCH_IDS, [
        "10000101", "10000102", "10000103", "10000104", "10000105",
        "10000106", "10000107", "10000108", "10000109", "10000110"
    ]);
    assert.equal(artifact.summary.batchCharacters, 10);
    assert.equal(artifact.summary.inventoryCharacters, 109);
    assert.equal(artifact.summary.sourceRecords, 150);
    assert.equal(artifact.summary.inventoryCandidates, 140);
    assert.equal(artifact.summary.specs, 140);
    assert.equal(artifact.summary.modifiers, 0);
    assert.equal(artifact.summary.canonical, 0);
    assert.equal(artifact.summary.inventoryInputCandidates, 196);
    assert.equal(artifact.summary.explicitCandidateOperations, 126);
    assert.equal(artifact.summary.unknownCandidateIds, 70);
    assert.equal(artifact.summary.sourceInventoryCandidates, 196);
    assert.equal(artifact.summary.explicitInventoryCandidates, 126);
    assert.equal(artifact.summary.unknownInventoryCandidates, 70);
    assert.deepEqual(artifact.summary.verificationByStatus, { needsReview: 140 });
    assert.deepEqual(artifact.summary.runtimeByStatus, { blocked: 140 });
    assert.deepEqual(Object.keys(artifact.byCharacter).sort(), [...BATCH_IDS].sort());
});

test("raw source pointers and behavior-inventory candidates resolve without inference", () => {
    const artifact = loadManifest();
    const inventory = loadInventory();
    let explicitCount = 0;
    let unknownCount = 0;
    Object.values(artifact.sourceRecords).forEach((source) => {
        assert.equal(source.kind, "primaryDataset");
        assert.equal(source.integrity.algorithm, "sha256");
        assert.equal(source.integrity.digest.length, 64);
        assert.equal(typeof source.text, "string");
    });
    Object.values(artifact.specs).forEach((spec) => {
        assert.equal(spec.verification.status, "needsReview");
        assert.equal(spec.verification.sourceAgreement, "unknown");
        assert.equal(spec.runtime.status, "blocked");
        assert.deepEqual(spec.runtime.modifierIds, []);
        assert.equal(spec.runtime.generator, null);
        assert.ok(Array.isArray(spec.inventoryCandidateIds));
        assert.ok(Array.isArray(spec.unknownCandidateIds));
        spec.sourceRefs.forEach((sourceRef) => assert.ok(artifact.sourceRecords[sourceRef], sourceRef));
        spec.inventoryCandidateIds.forEach((candidateId) => {
            const candidate = inventory.candidates[candidateId];
            assert.ok(candidate, candidateId);
            assert.equal(candidate.entity.id, spec.entity.id);
            assert.equal(candidate.entity.component, spec.entity.component);
            if (candidate.status === "candidate") explicitCount += 1;
            if (candidate.status === "unknown") unknownCount += 1;
        });
        spec.unknownCandidateIds.forEach((candidateId) => assert.equal(inventory.candidates[candidateId].status, "unknown"));
        const candidates = spec.inventoryCandidateIds.map((candidateId) => inventory.candidates[candidateId]);
        const explicitByPath = new Map();
        candidates.filter((candidate) => candidate.status === "candidate").forEach((candidate) => {
            const list = explicitByPath.get(candidate.fieldPath) || [];
            list.push(candidate);
            explicitByPath.set(candidate.fieldPath, list);
        });
        explicitByPath.forEach((entries, fieldPath) => {
            const measurementPath = fieldPath.startsWith("/timing/") || fieldPath.startsWith("/execution/") || fieldPath.startsWith("/energy/") || fieldPath.startsWith("/elementApplication/");
            if (entries.length === 1 && entries[0].value !== null && measurementPath && ["set", "replace", "setMaximum"].includes(entries[0].operation)) {
                const measurement = pathValue(spec, fieldPath);
                assert.ok(isMeasurement(measurement), spec.id + ":" + fieldPath);
                assert.equal(measurement.value, entries[0].value);
                assert.equal(measurement.unit, entries[0].unit);
                assert.match(measurement.notes, new RegExp("operation=" + entries[0].operation));
            }
            if (entries.length > 1) assert.ok(spec.verification.discrepancies.some((entry) => entry.code === "INVENTORY_OPERATION_CONFLICT" && entry.fieldPath === fieldPath));
            if (entries.length === 1 && entries[0].value === null) assert.ok(spec.verification.discrepancies.some((entry) => ["INVENTORY_NULL_RESET", "INVENTORY_OPERATION_REQUIRES_REVIEW"].includes(entry.code) && entry.fieldPath === fieldPath));
        });
    });
    assert.equal(explicitCount, 126);
    assert.equal(unknownCount, 70);
    assert.deepEqual(artifact.modifiers, {});
});

test("batch 9 generation, split files, and audit are deterministic", () => {
    const manifest = loadManifest();
    const generatedA = buildDataset({ dataRoot: defaultDataRoot });
    const generatedB = buildDataset({ dataRoot: defaultDataRoot });
    assert.equal(stableJson(generatedA), stableJson(generatedB));
    assert.equal(stableJson(manifest), stableJson(generatedA));
    [["sourceRecords", "source-records.json"], ["inventoryCandidates", "inventory-candidates.json"], ["specs", "spec-candidates.json"], ["modifiers", "modifiers.json"]].forEach(([key, file]) => {
        const value = JSON.parse(fs.readFileSync(path.join(defaultOutputRoot, file), "utf8"));
        assert.equal(stableJson(value), stableJson(manifest[key]));
    });
    const report = auditBehaviorBatch9({ dataRoot: defaultDataRoot, outputRoot: defaultOutputRoot });
    assert.equal(report.status, "passed");
    assert.deepEqual(report.errors, []);
    assert.equal(report.summary.deterministic, true);
    assert.equal(report.summary.contract.inventoryCandidateViolations, 0);
    assert.equal(report.summary.contract.numericInferenceViolations, 0);
    assert.equal(report.summary.contract.schemaViolations, 0);
});


