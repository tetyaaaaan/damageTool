"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const capture = require("../../scripts/genshinVersionTransitionBehaviorShard10Capture.cjs");
const { digestStable } = require("../../scripts/genshinVersionEvidenceValidation.cjs");
const repositoryRoot = path.resolve(__dirname, "../..");

test("behaviorSpec shard 10 binds the exact authoritative 100-candidate inventory", () => {
    const queue = capture.queueShard();
    assert.equal(queue.candidateCount, 100);
    assert.equal(queue.entityCount, 9);
    assert.deepEqual(queue.entityIds, ["10000085", "10000086", "10000087", "10000088", "10000089", "10000090", "10000091", "10000092", "10000093"]);
    assert.deepEqual(capture.resolvedEntities.map((entity) => entity.entityId), queue.entityIds);
    assert.equal(queue.candidateIdsDigest, digestStable(queue.candidateIds));
    assert.equal(queue.candidateIds.some((id) => /:1000000[57]:/.test(id)), false);
});

test("shard 10 resolves provider slugs and preserves the Xianyun/Gaming provider-id swap", () => {
    const snapshot = capture.buildSnapshot();
    assert.equal(snapshot.summary.resolvedEntities, 9);
    assert.deepEqual(snapshot.claim.resolvedEntities.map((entity) => entity.providerSlug), [
        "freminet", "wriothesley", "neuvillette", "charlotte", "furina", "chevreuse", "navia", "xianyun", "gaming"
    ]);
    const xianyun = snapshot.claim.resolvedEntities.find((entity) => entity.entityId === "10000092");
    const gaming = snapshot.claim.resolvedEntities.find((entity) => entity.entityId === "10000093");
    assert.equal(xianyun.providerId, 9301);
    assert.equal(xianyun.name, "Xianyun");
    assert.equal(gaming.providerId, 9201);
    assert.equal(gaming.name, "Gaming");
    assert.equal(snapshot.claim.identityResolution.swappedProviderIdEvidence[0].providerId, 9301);
    assert.equal(snapshot.claim.identityResolution.swappedProviderIdEvidence[1].providerId, 9201);
    assert.equal(capture.validateBehaviorShard10Snapshot(snapshot, { repositoryRoot }).valid, true);
});

test("shard 10 retains strict two-revision raw bindings and remains fail-closed", () => {
    const snapshot = capture.buildSnapshot();
    const records = snapshot.claim.resolvedEntities.flatMap((entity) => entity.records);
    assert.equal(records.length, 18);
    assert.ok(records.every((record) => record.before.gameVersion === "6.7" && record.after.gameVersion === "7.0"));
    assert.ok(records.every((record) => record.before.rawArtifactBytes > 0 && record.after.rawArtifactBytes > 0));
    assert.ok(records.every((record) => /^[a-f0-9]{40}$/.test(record.before.gitBlob) && /^[a-f0-9]{40}$/.test(record.after.gitBlob)));
    assert.ok(records.every((record) => /^[a-f0-9]{64}$/.test(record.before.rawArtifactSha256) && /^[a-f0-9]{64}$/.test(record.after.rawArtifactSha256)));
    assert.equal(snapshot.summary.changedRecords, 0);
    assert.equal(snapshot.summary.changedFields, 0);
    assert.equal(snapshot.gateEligibility.canIssueEligibilityCertificate, false);
    assert.equal(snapshot.gateEligibility.canPromoteCanonical, false);
});

test("shard 10 checked-in snapshot and complete checkpoint are deterministic", () => {
    const checkedIn = JSON.parse(fs.readFileSync(capture.outputPath, "utf8"));
    const checkpoint = JSON.parse(fs.readFileSync(capture.checkpointPath, "utf8"));
    assert.deepEqual(checkedIn, capture.buildSnapshot());
    assert.deepEqual(checkpoint, capture.buildCheckpoint(checkedIn));
    assert.deepEqual(capture.validateBehaviorShard10Snapshot(checkedIn, { repositoryRoot }), { valid: true, reasons: [] });
    assert.deepEqual(capture.validateCheckpoint(checkpoint, { repositoryRoot }), { valid: true, reasons: [] });
    assert.equal(checkpoint.status, "complete");
    assert.equal(checkpoint.revisions.before.completedArtifactCount, 18);
    assert.equal(checkpoint.revisions.after.completedArtifactCount, 18);
});

test("shard 10 validators reject forged embedded identity, raw digest, comparison, queue, and checkpoint evidence", () => {
    const embedded = capture.buildSnapshot();
    embedded.claim.resolvedEntities[7].records[0].before.embeddedId += 1;
    embedded.fieldDigest = digestStable(embedded.claim);
    const embeddedResult = capture.validateBehaviorShard10Snapshot(embedded, { repositoryRoot });
    assert.equal(embeddedResult.valid, false);
    assert.ok(embeddedResult.reasons.some((reason) => reason.includes("embeddedIdMismatch")));

    const digest = capture.buildSnapshot();
    digest.claim.resolvedEntities[0].records[0].before.rawArtifactSha256 = "0".repeat(64);
    digest.fieldDigest = digestStable(digest.claim);
    const digestResult = capture.validateBehaviorShard10Snapshot(digest, { repositoryRoot });
    assert.equal(digestResult.valid, false);
    assert.ok(digestResult.reasons.some((reason) => reason.includes("sha256Mismatch")));

    const comparison = capture.buildSnapshot();
    comparison.claim.resolvedEntities[0].records[0].comparison.changedFieldCount = 1;
    comparison.fieldDigest = digestStable(comparison.claim);
    const comparisonResult = capture.validateBehaviorShard10Snapshot(comparison, { repositoryRoot });
    assert.equal(comparisonResult.valid, false);
    assert.ok(comparisonResult.reasons.some((reason) => reason.includes("comparisonInvalid")));

    const queue = capture.buildSnapshot();
    queue.claim.shard.authoritativeCandidateIds[0] = "forged";
    queue.fieldDigest = digestStable(queue.claim);
    const queueResult = capture.validateBehaviorShard10Snapshot(queue, { repositoryRoot });
    assert.equal(queueResult.valid, false);
    assert.ok(queueResult.reasons.includes("authoritativeShardBindingInvalid"));

    const checkpoint = capture.buildCheckpoint();
    checkpoint.revisions.after.completedArtifactCount = 17;
    checkpoint.fieldDigest = digestStable(checkpoint.claim);
    const checkpointResult = capture.validateCheckpoint(checkpoint, { repositoryRoot });
    assert.equal(checkpointResult.valid, false);
    assert.ok(checkpointResult.reasons.includes("revisionCheckpointInvalid:after"));
});

test("shard 10 schemas are dedicated and declare swapped-id, raw, and checkpoint gates", () => {
    const snapshotSchema = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "games/genshin/data/schema/version-transition-behavior-shard-10-snapshot.schema.json"), "utf8"));
    const checkpointSchema = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "games/genshin/data/schema/version-transition-behavior-shard-10-capture-checkpoint.schema.json"), "utf8"));
    assert.equal(snapshotSchema.$id, "genshin-version-transition-behavior-shard-10-snapshot.schema.json");
    assert.equal(snapshotSchema.$defs.shard.properties.shardId.const, capture.shardId);
    assert.deepEqual(snapshotSchema.$defs.shard.properties.authoritativeEntityIds.const, capture.resolvedEntities.map((entity) => entity.entityId));
    assert.ok(snapshotSchema.$defs.artifact.properties.gitBlob);
    assert.ok(snapshotSchema.$defs.artifact.properties.rawArtifactSha256);
    assert.equal(snapshotSchema.$defs.artifact.properties.embeddedIdPath.const, "$.id");
    assert.equal(checkpointSchema.$id, "genshin-version-transition-behavior-shard-10-capture-checkpoint.schema.json");
    assert.equal(checkpointSchema.properties.kind.const, "genshinVersionTransitionBehaviorShardCaptureCheckpoint");
    assert.equal(checkpointSchema.properties.status.const, "complete");
});
