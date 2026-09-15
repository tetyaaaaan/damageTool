"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const capture = require("../../scripts/genshinVersionTransitionBehaviorShard12Capture.cjs");
const { digestStable } = require("../../scripts/genshinVersionEvidenceValidation.cjs");
const repositoryRoot = path.resolve(__dirname, "../..");

test("behaviorSpec shard 12 binds the exact authoritative 100-candidate inventory and overlap", () => {
    const queue = capture.queueShard();
    assert.equal(queue.candidateCount, 100);
    assert.equal(queue.entityCount, 8);
    assert.deepEqual(queue.entityIds, ["10000101", "10000102", "10000103", "10000104", "10000105", "10000106", "10000107", "10000108"]);
    assert.equal(queue.candidateIdsDigest, "615ba09b1142eb23bfaa8cf863a971383a2a70ab8ccfba63d30576c1d7ddaf44");
    assert.equal(queue.candidateIdsDigest, digestStable(queue.candidateIds));
    assert.deepEqual(capture.resolvedEntities.map((entity) => entity.entityId), ["10000102", "10000103", "10000104", "10000105", "10000106", "10000107", "10000108"]);
    assert.equal(queue.candidateIds.some((id) => /:1000000[57]:/.test(id)), false);
});

test("shard 12 resolves provider slugs, embedded ids, and local consumer mapper identity", () => {
    const snapshot = capture.buildSnapshot();
    assert.equal(snapshot.summary.resolvedEntities, 7);
    assert.deepEqual(snapshot.claim.resolvedEntities.map((entity) => entity.providerSlug), [
        "mualani", "xilonen", "chasca", "ororon", "mavuika", "citlali", "lanyan"
    ]);
    assert.deepEqual(snapshot.claim.resolvedEntities.map((entity) => entity.providerId), [10201, 10301, 10401, 10501, 10601, 10701, 10801]);
    assert.equal(snapshot.claim.identityResolution.authority, "data-v2-manifest:characters-catalog-and-source-text");
    assert.equal(snapshot.claim.identityResolution.consumerMapper.status, "consumerMapperMatches");
    assert.deepEqual(snapshot.claim.identityResolution.consumerMapper.missingEntityIds, []);
    assert.deepEqual(snapshot.claim.identityResolution.identityMismatches, []);
    assert.ok(snapshot.claim.identityResolution.entities.every((entity) => entity.identityStatus === "localCatalogAndSourceTextMatch"));
    assert.deepEqual(snapshot.claim.shard.skippedOverlapEntityIds, ["10000101"]);
    assert.equal(capture.validateBehaviorShard12Snapshot(snapshot, { repositoryRoot }).valid, true);
});

test("shard 12 retains strict two-revision raw bindings and remains fail-closed", () => {
    const snapshot = capture.buildSnapshot();
    const records = snapshot.claim.resolvedEntities.flatMap((entity) => entity.records);
    assert.equal(records.length, 14);
    assert.ok(records.every((record) => record.before.gameVersion === "6.7" && record.after.gameVersion === "7.0"));
    assert.ok(records.every((record) => record.before.revision === "1bab2cdba4d218fd5caa46b5f54e7884ee8359a2" && record.after.revision === "8b15995fa220c88a4d0d7ffe1e21b041d0b32588"));
    assert.ok(records.every((record) => record.before.rawArtifactBytes > 0 && record.after.rawArtifactBytes > 0));
    assert.ok(records.every((record) => /^[a-f0-9]{40}$/.test(record.before.gitBlob) && /^[a-f0-9]{40}$/.test(record.after.gitBlob)));
    assert.ok(records.every((record) => /^[a-f0-9]{64}$/.test(record.before.rawArtifactSha256) && /^[a-f0-9]{64}$/.test(record.after.rawArtifactSha256)));
    assert.equal(snapshot.summary.changedRecords, 0);
    assert.equal(snapshot.summary.changedFields, 0);
    assert.equal(snapshot.gateEligibility.canIssueEligibilityCertificate, false);
    assert.equal(snapshot.gateEligibility.canPromoteCanonical, false);
});

test("shard 12 checked-in snapshot and complete checkpoint are deterministic", () => {
    const checkedIn = JSON.parse(fs.readFileSync(capture.outputPath, "utf8"));
    const checkpoint = JSON.parse(fs.readFileSync(capture.checkpointPath, "utf8"));
    assert.deepEqual(checkedIn, capture.buildSnapshot());
    assert.deepEqual(checkpoint, capture.buildCheckpoint(checkedIn));
    assert.deepEqual(capture.validateBehaviorShard12Snapshot(checkedIn, { repositoryRoot }), { valid: true, reasons: [] });
    assert.deepEqual(capture.validateCheckpoint(checkpoint, { repositoryRoot }), { valid: true, reasons: [] });
    assert.equal(checkpoint.status, "complete");
    assert.equal(checkpoint.revisions.before.completedArtifactCount, 14);
    assert.equal(checkpoint.revisions.after.completedArtifactCount, 14);
    assert.deepEqual(checkpoint.claim.skippedOverlapEntityIds, ["10000101"]);
});

test("shard 12 validators reject forged embedded identity, raw digest, comparison, queue, identity, and checkpoint evidence", () => {
    const embedded = capture.buildSnapshot();
    embedded.claim.resolvedEntities[0].records[0].before.embeddedId += 1;
    embedded.fieldDigest = digestStable(embedded.claim);
    const embeddedResult = capture.validateBehaviorShard12Snapshot(embedded, { repositoryRoot });
    assert.equal(embeddedResult.valid, false);
    assert.ok(embeddedResult.reasons.some((reason) => reason.includes("embeddedIdMismatch")));

    const digest = capture.buildSnapshot();
    digest.claim.resolvedEntities[0].records[0].before.rawArtifactSha256 = "0".repeat(64);
    digest.fieldDigest = digestStable(digest.claim);
    const digestResult = capture.validateBehaviorShard12Snapshot(digest, { repositoryRoot });
    assert.equal(digestResult.valid, false);
    assert.ok(digestResult.reasons.some((reason) => reason.includes("sha256Mismatch")));

    const comparison = capture.buildSnapshot();
    comparison.claim.resolvedEntities[0].records[0].comparison.changedFieldCount = 1;
    comparison.fieldDigest = digestStable(comparison.claim);
    const comparisonResult = capture.validateBehaviorShard12Snapshot(comparison, { repositoryRoot });
    assert.equal(comparisonResult.valid, false);
    assert.ok(comparisonResult.reasons.some((reason) => reason.includes("comparisonInvalid")));

    const queue = capture.buildSnapshot();
    queue.claim.shard.authoritativeCandidateIds[0] = "forged";
    queue.fieldDigest = digestStable(queue.claim);
    const queueResult = capture.validateBehaviorShard12Snapshot(queue, { repositoryRoot });
    assert.equal(queueResult.valid, false);
    assert.ok(queueResult.reasons.includes("authoritativeShardBindingInvalid"));

    const identity = capture.buildSnapshot();
    identity.claim.identityResolution.consumerMapper.status = "consumerMapperIdentityMismatchFailClosed";
    identity.fieldDigest = digestStable(identity.claim);
    const identityResult = capture.validateBehaviorShard12Snapshot(identity, { repositoryRoot });
    assert.equal(identityResult.valid, false);
    assert.ok(identityResult.reasons.includes("localIdentityEvidenceInvalid"));

    const checkpoint = capture.buildCheckpoint();
    checkpoint.revisions.after.completedArtifactCount = 13;
    checkpoint.fieldDigest = digestStable(checkpoint.claim);
    const checkpointResult = capture.validateCheckpoint(checkpoint, { repositoryRoot });
    assert.equal(checkpointResult.valid, false);
    assert.ok(checkpointResult.reasons.includes("revisionCheckpointInvalid:after"));
});

test("shard 12 schemas are dedicated and declare overlap, raw, consumer-mapper, and fail-closed gates", () => {
    const snapshotSchema = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "games/genshin/data/schema/version-transition-behavior-shard-12-snapshot.schema.json"), "utf8"));
    const checkpointSchema = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "games/genshin/data/schema/version-transition-behavior-shard-12-capture-checkpoint.schema.json"), "utf8"));
    assert.equal(snapshotSchema.$id, "genshin-version-transition-behavior-shard-12-snapshot.schema.json");
    assert.equal(snapshotSchema.$defs.shard.properties.shardId.const, capture.shardId);
    assert.deepEqual(snapshotSchema.$defs.shard.properties.authoritativeEntityIds.const, capture.queueShard().entityIds);
    assert.deepEqual(snapshotSchema.$defs.shard.properties.skippedOverlapEntityIds.const, ["10000101"]);
    assert.ok(snapshotSchema.$defs.artifact.properties.gitBlob);
    assert.ok(snapshotSchema.$defs.artifact.properties.rawArtifactSha256);
    assert.equal(snapshotSchema.$defs.artifact.properties.embeddedIdPath.const, "$.id");
    assert.equal(snapshotSchema.$defs.localIdentity.properties.authority.const, "data-v2-manifest:characters-catalog-and-source-text");
    assert.equal(checkpointSchema.$id, "genshin-version-transition-behavior-shard-12-capture-checkpoint.schema.json");
    assert.equal(checkpointSchema.properties.kind.const, "genshinVersionTransitionBehaviorShardCaptureCheckpoint");
    assert.equal(checkpointSchema.properties.status.const, "complete");
    assert.equal(checkpointSchema.properties.capturedEntityCount.const, 7);
});
