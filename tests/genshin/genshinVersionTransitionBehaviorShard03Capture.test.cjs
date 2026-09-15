"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const capture = require("../../scripts/genshinVersionTransitionBehaviorShard03Capture.cjs");
const { digestStable } = require("../../scripts/genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "../..");

test("behavior shard03 is exact queue-bound, complete, and unchanged", () => {
    const snapshot = capture.buildSnapshot();
    assert.equal(snapshot.summary.authoritativeCandidates, 100);
    assert.equal(snapshot.summary.authoritativeEntities, 8);
    assert.equal(snapshot.summary.resolvedEntities, 8);
    assert.equal(snapshot.summary.resolvedRecords, 16);
    assert.equal(snapshot.summary.changedRecords, 0);
    assert.equal(snapshot.summary.changedFields, 0);
    assert.equal(snapshot.gateEligibility.canIssueEligibilityCertificate, false);
    assert.equal(snapshot.gateEligibility.canPromoteCanonical, false);
    const validation = capture.validateBehaviorShard03Snapshot(snapshot, { repositoryRoot });
    assert.equal(validation.valid, true, validation.reasons.join("; "));
});

test("behavior shard03 checked-in snapshot and checkpoint are deterministic", () => {
    const snapshot = JSON.parse(fs.readFileSync(capture.outputPath, "utf8"));
    const checkpoint = JSON.parse(fs.readFileSync(capture.checkpointPath, "utf8"));
    assert.deepEqual(snapshot, capture.buildSnapshot());
    assert.deepEqual(checkpoint, capture.buildCheckpoint(snapshot));
    assert.equal(capture.validateBehaviorShard03Snapshot(snapshot, { repositoryRoot }).valid, true);
    const checkpointValidation = capture.validateBehaviorShard03Checkpoint(checkpoint, { repositoryRoot });
    assert.equal(checkpointValidation.valid, true, checkpointValidation.reasons.join("; "));
});

test("behavior shard03 rejects forged raw, queue, and checkpoint evidence", () => {
    const raw = capture.buildSnapshot();
    raw.claim.resolvedEntities[0].records[0].before.rawArtifactSha256 = "0".repeat(64);
    raw.fieldDigest = digestStable(raw.claim);
    assert.ok(capture.validateBehaviorShard03Snapshot(raw, { repositoryRoot }).reasons.some((reason) => reason.includes("sha256Mismatch")));

    const queue = capture.buildSnapshot();
    queue.claim.queueShard.authoritativeCandidateIds[0] = "forged";
    queue.fieldDigest = digestStable(queue.claim);
    assert.ok(capture.validateBehaviorShard03Snapshot(queue, { repositoryRoot }).reasons.includes("authoritativeShardBindingInvalid"));

    const checkpoint = capture.buildCheckpoint();
    checkpoint.claim.materializedSnapshotFieldDigest = "0".repeat(64);
    assert.ok(capture.validateBehaviorShard03Checkpoint(checkpoint, { repositoryRoot }).reasons.includes("fieldDigestInvalid"));
});
