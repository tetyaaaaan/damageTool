"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
    BATCH_IDS,
    MEASUREMENT_PATHS,
    buildDataset,
    defaultDataRoot,
    defaultOutputRoot,
    stableJson
} = require("../../scripts/genshinCharacterV2BehaviorBatch5Generate.cjs");
const { auditBehaviorBatch5 } = require("../../scripts/genshinCharacterV2BehaviorBatch5Audit.cjs");

function loadManifest() { return JSON.parse(fs.readFileSync(path.join(defaultOutputRoot, "manifest.json"), "utf8")); }
function loadInventory() { return JSON.parse(fs.readFileSync(path.join(defaultDataRoot, "v2", "characters", "behavior-inventory.json"), "utf8")); }
function pathValue(spec, fieldPath) {
    if (String(fieldPath).startsWith("/lifecycle/")) return spec.lifecycle[String(fieldPath).slice("/lifecycle/".length)];
    const parts = String(fieldPath || "").replace(/^\//, "").split("/");
    return parts.length === 2 ? spec[parts[0]]?.[parts[1]] : undefined;
}
function isMeasurement(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        && Object.prototype.hasOwnProperty.call(value, "value")
        && Object.prototype.hasOwnProperty.call(value, "unit")
        && Object.prototype.hasOwnProperty.call(value, "status")
        && Array.isArray(value.sourceRefs);
}

test("batch 5 fixes the requested ten non-pilot IDs and standard aliases", () => {
    const artifact = loadManifest();
    assert.deepEqual(artifact.batchIds, BATCH_IDS);
    assert.deepEqual(BATCH_IDS, [
        "10000056", "10000057", "10000059", "10000060", "10000062",
        "10000063", "10000064", "10000065", "10000066", "10000067"
    ]);
    assert.equal(artifact.summary.batchCharacters, 10);
    assert.equal(artifact.summary.inventoryCharacters, 109);
    assert.equal(artifact.summary.sourceRecords, 150);
    assert.equal(artifact.summary.inventoryCandidates, 140);
    assert.equal(artifact.summary.specs, 140);
    assert.equal(artifact.summary.inventoryInputCandidates, 145);
    assert.equal(artifact.summary.sourceInventoryCandidates, 145);
    assert.equal(artifact.summary.explicitInventoryCandidates, 85);
    assert.equal(artifact.summary.unknownInventoryCandidates, 60);
    assert.equal(artifact.summary.modifiers, 0);
    assert.equal(artifact.summary.canonical, 0);
    assert.deepEqual(artifact.summary.verificationByStatus, { needsReview: 140 });
    assert.deepEqual(artifact.summary.runtimeByStatus, { blocked: 140 });
    assert.deepEqual(Object.keys(artifact.byCharacter).sort(), [...BATCH_IDS].sort());
});

test("raw pointers, normal locator, passive index, and local inventory context resolve", () => {
    const artifact = loadManifest();
    Object.values(artifact.sourceRecords).forEach((source) => {
        assert.equal(source.kind, "primaryDataset");
        assert.equal(source.integrity.algorithm, "sha256");
        assert.equal(source.integrity.digest.length, 64);
        assert.equal(typeof source.text, "string");
        if (["normalDescriptionJa", "chargedDescriptionJa", "plungingDescriptionJa"].includes(source.locator.field)) assert.match(source.locator.record, /\/normalAttack$/);
        if (source.structuredValue?.passiveIndex !== undefined) assert.equal(source.locator.record, `/${source.structuredValue.characterId}/passives/${source.structuredValue.passiveIndex}`);
    });
    Object.values(artifact.specs).forEach((spec) => {
        assert.equal(spec.verification.status, "needsReview");
        assert.equal(spec.runtime.status, "blocked");
        assert.deepEqual(spec.runtime.modifierIds, []);
        assert.equal(spec.runtime.generator, null);
        assert.ok(Array.isArray(spec.inventoryCandidateIds));
        assert.ok(Array.isArray(spec.unknownCandidateIds));
        assert.ok(artifact.inventoryCandidates[spec.inventoryCandidateId]);
        assert.equal(artifact.inventoryCandidates[spec.inventoryCandidateId].entity.component, spec.entity.component);
        spec.sourceRefs.forEach((sourceRef) => assert.ok(artifact.sourceRecords[sourceRef], sourceRef));
    });
    Object.values(artifact.inventoryCandidates).forEach((candidate) => {
        assert.equal(candidate.status, "needsReview");
        assert.equal(candidate.unknown, true);
        assert.ok(candidate.sourcePointer.record);
        assert.ok(artifact.sourceRecords[candidate.sourceRefs[0]]);
    });
});

test("singleton set candidates are copied with operation notes; conflicts/null/add remain discrepancies", () => {
    const artifact = loadManifest();
    const inventory = loadInventory();
    let mapped = 0;
    Object.values(artifact.specs).forEach((spec) => {
        const candidates = spec.inventoryCandidateIds.map((id) => inventory.candidates[id]);
        const grouped = new Map();
        candidates.filter((candidate) => candidate.status === "candidate").forEach((candidate) => {
            const list = grouped.get(candidate.fieldPath) || [];
            list.push(candidate);
            grouped.set(candidate.fieldPath, list);
        });
        grouped.forEach((entries, fieldPath) => {
            const mappedValue = pathValue(spec, fieldPath);
            if (entries.length !== 1) {
                assert.ok(spec.verification.discrepancies.some((entry) => entry.code === "INVENTORY_OPERATION_CONFLICT" && entry.fieldPath === fieldPath));
            } else if (entries[0].value === null || entries[0].value === undefined) {
                assert.ok(spec.verification.discrepancies.some((entry) => ["INVENTORY_NULL_RESET", "INVENTORY_NULL_VALUE"].includes(entry.code) && entry.fieldPath === fieldPath));
            } else if (entries[0].operation !== "set") {
                assert.equal(mappedValue, undefined);
                assert.ok(spec.verification.discrepancies.some((entry) => entry.code === "INVENTORY_OPERATION_REQUIRES_REVIEW" && entry.fieldPath === fieldPath));
            } else if (fieldPath.startsWith("/lifecycle/")) {
                assert.equal(mappedValue, entries[0].value);
            } else if (MEASUREMENT_PATHS.has(fieldPath)) {
                assert.ok(isMeasurement(mappedValue), `${spec.id}:${fieldPath}`);
                assert.equal(mappedValue.status, "explicit");
                assert.equal(mappedValue.value, entries[0].value);
                assert.equal(mappedValue.unit, entries[0].unit);
                assert.match(mappedValue.notes, new RegExp(`operation=${entries[0].operation}`));
                mapped += 1;
            }
        });
        spec.unknownCandidateIds.forEach((candidateId) => assert.equal(inventory.candidates[candidateId].status, "unknown"));
    });
    assert.equal(mapped, 29);
});

test("batch 5 generation, split files, and audit are deterministic", () => {
    const manifest = loadManifest();
    const generatedA = buildDataset({ dataRoot: defaultDataRoot });
    const generatedB = buildDataset({ dataRoot: defaultDataRoot });
    assert.equal(stableJson(generatedA), stableJson(generatedB));
    assert.equal(stableJson(manifest), stableJson(generatedA));
    [["sourceRecords", "source-records.json"], ["inventoryCandidates", "inventory-candidates.json"], ["specs", "spec-candidates.json"], ["modifiers", "modifiers.json"]].forEach(([key, file]) => {
        assert.equal(stableJson(JSON.parse(fs.readFileSync(path.join(defaultOutputRoot, file), "utf8"))), stableJson(manifest[key]));
    });
    const report = auditBehaviorBatch5({ dataRoot: defaultDataRoot, outputRoot: defaultOutputRoot });
    assert.equal(report.status, "passed");
    assert.deepEqual(report.errors, []);
    assert.equal(report.summary.deterministic, true);
    assert.equal(report.summary.contract.inventoryCandidateViolations, 0);
    assert.equal(report.summary.contract.numericInferenceViolations, 0);
    assert.equal(report.summary.contract.schemaViolations, 0);
});
