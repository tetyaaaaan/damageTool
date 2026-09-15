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
} = require("../../scripts/genshinCharacterV2BehaviorBatch1Generate.cjs");
const { auditBehaviorBatch1 } = require("../../scripts/genshinCharacterV2BehaviorBatch1Audit.cjs");

function loadManifest() {
    return JSON.parse(fs.readFileSync(path.join(defaultOutputRoot, "manifest.json"), "utf8"));
}

test("batch 1 fixes the first eight sorted non-pilot character IDs", () => {
    const artifact = loadManifest();
    assert.deepEqual(artifact.batchIds, BATCH_IDS);
    assert.deepEqual(BATCH_IDS, [
        "10000002", "10000003", "10000005", "10000006",
        "10000007", "10000014", "10000015", "10000016"
    ]);
    assert.equal(artifact.summary.batchCharacters, 8);
    assert.equal(artifact.summary.inventoryCharacters, 109);
    assert.equal(artifact.summary.sourceRecords, 119);
    assert.equal(artifact.summary.inventoryCandidates, 111);
    assert.equal(artifact.summary.specs, 111);
    assert.equal(artifact.summary.sourceInventoryCandidates, 101);
    assert.equal(artifact.summary.explicitInventoryCandidates, 69);
    assert.equal(artifact.summary.unknownInventoryCandidates, 32);
    assert.equal(artifact.summary.modifiers, 0);
    assert.equal(artifact.summary.canonical, 0);
    assert.deepEqual(artifact.summary.verificationByStatus, { needsReview: 111 });
    assert.deepEqual(artifact.summary.runtimeByStatus, { blocked: 111 });
    assert.deepEqual(Object.keys(artifact.byCharacter).sort(), [...BATCH_IDS].sort());
});

test("source pointers resolve and explicit inventory measurements remain review-gated", () => {
    const artifact = loadManifest();
    assert.equal(Object.keys(artifact.sourceRecords).length, 119);
    assert.equal(Object.keys(artifact.inventoryCandidates).length, 111);
    assert.equal(Object.keys(artifact.specs).length, 111);
    Object.values(artifact.sourceRecords).forEach((source) => {
        assert.equal(source.kind, "primaryDataset");
        assert.equal(source.integrity.algorithm, "sha256");
        assert.equal(source.integrity.digest.length, 64);
        assert.equal(typeof source.text, "string");
    });
    Object.values(artifact.inventoryCandidates).forEach((candidate) => {
        assert.equal(candidate.status, "needsReview");
        assert.equal(candidate.unknown, true);
        candidate.sourceRefs.forEach((sourceRef) => assert.ok(artifact.sourceRecords[sourceRef], sourceRef));
    });
    Object.values(artifact.specs).forEach((spec) => {
        assert.equal(spec.verification.status, "needsReview");
        assert.equal(spec.verification.sourceAgreement, "unknown");
        assert.equal(spec.runtime.status, "blocked");
        assert.deepEqual(spec.runtime.modifierIds, []);
        assert.equal(spec.runtime.generator, null);
        assert.ok(["none", "refresh", "extend", "replace", "independent", "unknown"].includes(spec.lifecycle.refreshMode));
        assert.equal(spec.lifecycle.expiration, "unknown");
        assert.equal(spec.lifecycle.instanceScope, "unknown");
        assert.ok(spec.unknownFields.includes("burstCost"));
        assert.ok(spec.unknownFields.includes("snapshot"));
        assert.ok(Array.isArray(spec.inventoryCandidateIds));
        assert.ok(Array.isArray(spec.unknownCandidateIds));
        [spec.timing, spec.execution, spec.energy, spec.elementApplication || {}].forEach((section) => {
            Object.values(section).forEach((measurement) => {
                assert.equal(measurement.status, "explicit");
                assert.equal(measurement.sourceRefs.length, 1);
            });
        });
        spec.sourceRefs.forEach((sourceRef) => assert.ok(artifact.sourceRecords[sourceRef], sourceRef));
    });
    assert.deepEqual(artifact.modifiers, {});
});

test("batch 1 generation, split files, and audit are deterministic", () => {
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
    const report = auditBehaviorBatch1({ dataRoot: defaultDataRoot, outputRoot: defaultOutputRoot });
    assert.equal(report.status, "passed");
    assert.deepEqual(report.errors, []);
    assert.equal(report.summary.deterministic, true);
});
