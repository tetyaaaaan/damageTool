"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
    buildSnapshot,
    checkpointPath,
    entities,
    expectedEntityIds,
    outputPath,
    revisions
} = require("../../scripts/genshinVersionTransitionWeaponEntityCapture.cjs");

const root = path.resolve(__dirname, "../..");
const transitionRoot = path.join(root, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0");

test("weapon transition capture defines exactly the 55 queue entities", () => {
    assert.equal(entities.length, 55);
    assert.equal(new Set(entities.map((entity) => entity.entityId)).size, 55);
    assert.deepEqual(entities.map((entity) => entity.entityId).sort(), expectedEntityIds);
    for (const entity of entities) {
        assert.ok(entity.slugCandidates.length >= 1, entity.entityId);
        assert.ok(entity.nameJa, entity.entityId);
    }
});

test("variant entities retain candidate slugs until raw JSON id resolution", () => {
    for (const entityId of ["11419", "11420", "11421"]) {
        const entity = entities.find((item) => item.entityId === entityId);
        assert.deepEqual(entity.slugCandidates, ["prizedisshinblade", "prizedisshinblade-01", "prizedisshinblade-02"]);
    }
});

test("capture checkpoint is explicit and fail closed when acquisition is incomplete", () => {
    assert.ok(fs.existsSync(checkpointPath), "checkpoint should be persisted after an interrupted acquisition");
    const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
    assert.equal(checkpoint.kind, "genshinVersionTransitionWeaponEntityCaptureCheckpoint");
    assert.equal(checkpoint.requestedEntityCount, 55);
    assert.equal(checkpoint.requestedEntityIds.length, 55);
    assert.equal(checkpoint.gateEligibility.canIssueEligibilityCertificate, false);
    assert.equal(checkpoint.gateEligibility.canPromoteCanonical, false);
    if (checkpoint.status === "incompleteCheckpoint") {
        assert.ok(checkpoint.blocker?.kind);
        assert.match(checkpoint.nextTask, /resume acquisition/i);
    }
});

test("complete weapon snapshot, when materialized, binds both revisions and every raw artifact", { skip: !fs.existsSync(outputPath) }, () => {
    const snapshot = buildSnapshot();
    assert.equal(snapshot.status, "completeProviderSnapshot");
    assert.equal(snapshot.claim.records.length, 55);
    assert.equal(snapshot.claim.coverage.sourceRecordCoverage, "complete");
    assert.equal(snapshot.claim.coverage.normalizedDiffCoverage, "complete");
    assert.equal(snapshot.claim.coverage.canIssueEligibilityCertificate, false);
    assert.equal(snapshot.claim.coverage.canPromoteCanonical, false);
    assert.equal(snapshot.claim.gateDisposition.providerIndependence, "correlated");
    for (const record of snapshot.claim.records) {
        assert.match(record.before.artifact.rawArtifactDigest, /^[a-f0-9]{64}$/);
        assert.match(record.after.artifact.rawArtifactDigest, /^[a-f0-9]{64}$/);
        assert.equal(record.before.artifact.gameVersion, revisions.before.gameVersion);
        assert.equal(record.after.artifact.gameVersion, revisions.after.gameVersion);
        assert.ok(fs.existsSync(path.join(root, record.before.artifact.path)));
        assert.ok(fs.existsSync(path.join(root, record.after.artifact.path)));
    }
    assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, "utf8")), snapshot);
});

test("the checked-in transition directory contains no HSR capture artifacts", () => {
    const names = fs.readdirSync(transitionRoot);
    assert.ok(names.includes("weapon-entity-capture-checkpoint.json"));
    assert.ok(!names.some((name) => /hsr/i.test(name)));
});
