"use strict";

// Select shard03 before loading the parameterized capture module.  The
// module's default (shard01) remains untouched for its existing test suite.
process.argv.push("--shard=03");

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const capture = require("../../scripts/genshinVersionTransitionWeaponEntityCapture.cjs");

const root = path.resolve(__dirname, "../..");

test("weapon transition shard03 is bound to the authoritative 100-candidate queue shard", () => {
    assert.equal(capture.selectedShard, "03");
    assert.equal(capture.shardId, "weapons:weaponEffectSpec:sourceMissing:standard:03");
    assert.equal(capture.entities.length, 45);
    assert.equal(capture.expectedEntityIds.length, 45);
    const queue = JSON.parse(fs.readFileSync(path.join(root, "reports", "genshin-evidence-task-queue.json"), "utf8"));
    const shard = queue.unlockClusters.flatMap((cluster) => cluster.shards || [])
        .find((item) => item.shardId === capture.shardId);
    assert.ok(shard);
    assert.equal(shard.candidateIds.length, 100);
    assert.equal(capture.buildSnapshot().claim.queueShard.candidateIdDigest, "2bfb7e291ec9a5d05bab9b3be635a6fb3ee79e7bccc897801a534617774acce2");
    assert.deepEqual(capture.buildSnapshot().claim.entityIds, [...new Set(shard.candidateIds.map((id) => id.slice(2).split("_")[0]))].sort());
});

test("shard03 checked-in snapshot binds both revisions and remains single-family fail closed", () => {
    assert.ok(fs.existsSync(capture.outputPath));
    const snapshot = JSON.parse(fs.readFileSync(capture.outputPath, "utf8"));
    const rebuilt = capture.buildSnapshot();
    assert.deepEqual(snapshot, rebuilt);
    assert.equal(snapshot.status, "completeProviderSnapshot");
    assert.equal(snapshot.claim.records.length, 45);
    assert.equal(snapshot.claim.coverage.sourceRecordCoverage, "complete");
    assert.equal(snapshot.claim.coverage.normalizedDiffCoverage, "complete");
    assert.equal(snapshot.claim.coverage.canIssueEligibilityCertificate, false);
    assert.equal(snapshot.claim.coverage.canPromoteCanonical, false);
    assert.equal(snapshot.claim.gateDisposition.providerIndependence, "correlated");
    assert.equal(snapshot.summary.rawRecordsChanged, 1);
    assert.equal(snapshot.summary.normalizedRecordsChanged, 1);
    assert.equal(snapshot.summary.normalizedFieldsChanged, 6);
    const changed = snapshot.claim.records.filter((record) => record.comparison.normalizedStatus === "normalizedRecordChanged");
    assert.deepEqual(changed.map((record) => record.entityId), ["14518"]);
    assert.equal(changed[0].before.artifact.gameVersion, "6.7");
    assert.equal(changed[0].after.artifact.gameVersion, "7.0");
    assert.equal(changed[0].before.selectedSlug, "sunnymorningsleepin");
    assert.equal(changed[0].after.selectedSlug, "sunnymorningsleepin");
    assert.deepEqual(changed[0].comparison.fieldDiffs.map((diff) => diff.jsonPointer), [
        "/effectTemplateRaw",
        "/r1/description",
        "/r2/description",
        "/r3/description",
        "/r4/description",
        "/r5/description"
    ]);
    assert.equal(snapshot.claim.before.treeResolution.method, "immutableRawPathFallback");
    assert.equal(snapshot.claim.after.treeResolution.method, "immutableRawPathFallback");
});

test("shard03 raw capture has 45 immutable records per revision and an explicit checkpoint", () => {
    const snapshot = JSON.parse(fs.readFileSync(capture.outputPath, "utf8"));
    const rawPaths = snapshot.claim.records.flatMap((record) => [record.before.artifact.path, record.after.artifact.path]);
    assert.equal(rawPaths.length, 90);
    assert.equal(new Set(rawPaths).size, 90);
    for (const record of snapshot.claim.records) {
        for (const side of ["before", "after"]) {
            const artifact = record[side].artifact;
            const file = path.join(root, artifact.path);
            assert.ok(fs.existsSync(file), artifact.path);
            assert.match(artifact.revision, /^[a-f0-9]{40}$/);
            assert.match(artifact.blobSha, /^[a-f0-9]{40}$/);
            assert.match(artifact.rawArtifactDigest, /^[a-f0-9]{64}$/);
            assert.equal(fs.statSync(file).size, artifact.rawArtifactBytes);
        }
    }
    assert.ok(fs.existsSync(capture.checkpointPath));
    const checkpoint = JSON.parse(fs.readFileSync(capture.checkpointPath, "utf8"));
    assert.equal(checkpoint.status, "complete");
    assert.equal(checkpoint.requestedEntityCount, 45);
    assert.equal(checkpoint.revisions.before.completedArtifactCount, 45);
    assert.equal(checkpoint.revisions.after.completedArtifactCount, 45);
    assert.equal(checkpoint.gateEligibility.canIssueEligibilityCertificate, false);
    assert.equal(checkpoint.gateEligibility.canPromoteCanonical, false);
});
