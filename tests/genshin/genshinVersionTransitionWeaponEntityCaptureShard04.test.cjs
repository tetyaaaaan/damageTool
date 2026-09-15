"use strict";

// Select shard04 before loading the parameterized capture module.  Existing
// shard01/02/03 tests and artifacts remain in their own namespaces.
process.argv.push("--shard=04");

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const capture = require("../../scripts/genshinVersionTransitionWeaponEntityCapture.cjs");

const root = path.resolve(__dirname, "../..");

test("weapon transition shard04 is bound to the authoritative queue candidate/entity set", () => {
    assert.equal(capture.selectedShard, "04");
    assert.equal(capture.shardId, "weapons:weaponEffectSpec:sourceMissing:standard:04");
    assert.equal(capture.entities.length, 42);
    assert.equal(capture.expectedEntityIds.length, 42);
    const queue = JSON.parse(fs.readFileSync(path.join(root, "reports", "genshin-evidence-task-queue.json"), "utf8"));
    const shard = queue.unlockClusters.flatMap((cluster) => cluster.shards || [])
        .find((item) => item.shardId === capture.shardId);
    assert.ok(shard);
    assert.equal(shard.candidateIds.length, 81);
    const snapshot = capture.buildSnapshot();
    assert.equal(snapshot.claim.queueShard.candidateCount, 81);
    assert.equal(snapshot.claim.queueShard.candidateIdDigest, "d15dc10d8b340b8dc448838bbea9d5c26dac6c11bbe55359e55b145278a6cc56");
    assert.deepEqual(snapshot.claim.entityIds, [...new Set(shard.candidateIds.map((id) => id.slice(2).split("_")[0]))].sort());
});

test("shard04 snapshot records the verified 7.0 Stellar Swirl transition and stays fail closed", () => {
    assert.ok(fs.existsSync(capture.outputPath));
    const snapshot = JSON.parse(fs.readFileSync(capture.outputPath, "utf8"));
    const rebuilt = capture.buildSnapshot();
    assert.deepEqual(snapshot, rebuilt);
    assert.equal(snapshot.status, "completeProviderSnapshot");
    assert.equal(snapshot.claim.records.length, 42);
    assert.equal(snapshot.claim.coverage.sourceRecordCoverage, "complete");
    assert.equal(snapshot.claim.coverage.normalizedDiffCoverage, "complete");
    assert.equal(snapshot.claim.coverage.canIssueEligibilityCertificate, false);
    assert.equal(snapshot.claim.coverage.canPromoteCanonical, false);
    assert.equal(snapshot.claim.gateDisposition.providerIndependence, "correlated");
    assert.equal(snapshot.summary.rawRecordsChanged, 1);
    assert.equal(snapshot.summary.normalizedRecordsChanged, 1);
    assert.equal(snapshot.summary.normalizedFieldsChanged, 6);
    const changed = snapshot.claim.records.filter((record) => record.comparison.normalizedStatus === "normalizedRecordChanged");
    assert.deepEqual(changed.map((record) => record.entityId), ["15514"]);
    assert.equal(changed[0].nameJa, "星鷲の紅き羽");
    assert.equal(changed[0].before.selectedSlug, "astralvulturescrimsonplumage");
    assert.equal(changed[0].after.selectedSlug, "astralvulturescrimsonplumage");
    assert.equal(changed[0].before.artifact.gameVersion, "6.7");
    assert.equal(changed[0].after.artifact.gameVersion, "7.0");
    assert.deepEqual(changed[0].comparison.fieldDiffs.map((diff) => diff.jsonPointer), [
        "/effectTemplateRaw",
        "/r1/description",
        "/r2/description",
        "/r3/description",
        "/r4/description",
        "/r5/description"
    ]);
});

test("shard04 raw artifacts and checkpoint are complete in the isolated namespace", () => {
    const snapshot = JSON.parse(fs.readFileSync(capture.outputPath, "utf8"));
    const rawPaths = snapshot.claim.records.flatMap((record) => [record.before.artifact.path, record.after.artifact.path]);
    assert.equal(rawPaths.length, 84);
    assert.equal(new Set(rawPaths).size, 84);
    assert.ok(rawPaths.every((item) => item.includes("sources/genshin-db-shard04/")));
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
    assert.equal(checkpoint.requestedEntityCount, 42);
    assert.equal(checkpoint.revisions.before.completedArtifactCount, 42);
    assert.equal(checkpoint.revisions.after.completedArtifactCount, 42);
    assert.equal(checkpoint.gateEligibility.canIssueEligibilityCertificate, false);
    assert.equal(checkpoint.gateEligibility.canPromoteCanonical, false);
});
