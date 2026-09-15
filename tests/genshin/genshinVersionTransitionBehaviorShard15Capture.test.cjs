"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const capture = require("../../scripts/genshinVersionTransitionBehaviorShard15Capture.cjs");
const { digestStable } = require("../../scripts/genshinVersionEvidenceValidation.cjs");
const repositoryRoot = path.resolve(__dirname, "../..");

test("behaviorSpec shard 15 binds the exact authoritative 100-candidate inventory", () => {
    const queue = capture.queueShard();
    assert.equal(queue.candidateCount, 100);
    assert.equal(queue.entityCount, 8);
    assert.deepEqual(queue.entityIds, ["10000124", "10000125", "10000126", "10000127", "10000128", "10000129", "10000130", "10000131"]);
    assert.deepEqual(capture.resolvedEntities.map((entity) => entity.entityId), queue.entityIds);
    assert.equal(queue.candidateIdsDigest, digestStable(queue.candidateIds));
    assert.equal(queue.candidateIdsDigest, capture.expectedCandidateIdsDigest);
    assert.equal(queue.entityIdsDigest, capture.expectedEntityIdsDigest);
    assert.equal(queue.candidateIds.some((id) => /:1000000[57]:/.test(id)), false);
});

test("shard 15 resolves exact provider slugs and reports partial consumer-mapper coverage", () => {
    const snapshot = capture.buildSnapshot();
    assert.equal(snapshot.summary.resolvedEntities, 8);
    assert.deepEqual(snapshot.claim.resolvedEntities.map((entity) => entity.providerSlug), [
        "jahoda", "columbina", "zibai", "illuga", "varka", "lohen", "linnea", "nicole"
    ]);
    assert.deepEqual(snapshot.claim.resolvedEntities.map((entity) => entity.providerId), [12401, 12501, 12601, 12701, 12801, 12901, 13001, 13101]);
    assert.deepEqual(snapshot.claim.identityResolution.consumerMapper.missingEntityIds, ["10000124", "10000125", "10000126", "10000127", "10000128", "10000129", "10000130", "10000131"]);
    assert.deepEqual(snapshot.claim.identityResolution.identityMismatches, []);
    assert.equal(snapshot.claim.identityResolution.consumerMapper.status, "consumerMapperPartial");
    assert.ok(snapshot.claim.identityResolution.entities.every((entity) => entity.identityStatus === "localCatalogAndSourceTextMatch"));
    assert.equal(capture.validateBehaviorShard15Snapshot(snapshot, { repositoryRoot }).valid, true);
});

test("shard 15 retains strict two-revision raw bindings and remains fail-closed", () => {
    const snapshot = capture.buildSnapshot();
    const records = snapshot.claim.resolvedEntities.flatMap((entity) => entity.records);
    assert.equal(records.length, 16);
    assert.ok(records.every((record) => record.before.gameVersion === "6.7" && record.after.gameVersion === "7.0"));
    assert.ok(records.every((record) => record.before.rawArtifactBytes > 0 && record.after.rawArtifactBytes > 0));
    assert.ok(records.every((record) => /^[a-f0-9]{40}$/.test(record.before.gitBlob) && /^[a-f0-9]{40}$/.test(record.after.gitBlob)));
    assert.ok(records.every((record) => /^[a-f0-9]{64}$/.test(record.before.rawArtifactSha256) && /^[a-f0-9]{64}$/.test(record.after.rawArtifactSha256)));
    assert.equal(snapshot.summary.changedRecords, 2);
    assert.equal(snapshot.summary.changedFields, 4);
    assert.equal(snapshot.gateEligibility.canIssueEligibilityCertificate, false);
    assert.equal(snapshot.gateEligibility.canPromoteCanonical, false);
});

test("shard 15 checked-in snapshot and complete checkpoint are deterministic", () => {
    const checkedIn = JSON.parse(fs.readFileSync(capture.outputPath, "utf8"));
    const checkpoint = JSON.parse(fs.readFileSync(capture.checkpointPath, "utf8"));
    assert.deepEqual(checkedIn, capture.buildSnapshot());
    assert.deepEqual(checkpoint, capture.buildCheckpoint(checkedIn));
    assert.deepEqual(capture.validateBehaviorShard15Snapshot(checkedIn, { repositoryRoot }), { valid: true, reasons: [] });
    assert.deepEqual(capture.validateCheckpoint(checkpoint, { repositoryRoot }), { valid: true, reasons: [] });
    assert.equal(checkpoint.status, "complete");
    assert.equal(checkpoint.revisions.before.completedArtifactCount, 16);
    assert.equal(checkpoint.revisions.after.completedArtifactCount, 16);
});

test("shard 15 validators reject forged embedded identity, raw digest, comparison, queue, and checkpoint evidence", () => {
    const embedded = capture.buildSnapshot();
    embedded.claim.resolvedEntities[0].records[0].before.embeddedId += 1;
    embedded.fieldDigest = digestStable(embedded.claim);
    const embeddedResult = capture.validateBehaviorShard15Snapshot(embedded, { repositoryRoot });
    assert.equal(embeddedResult.valid, false);
    assert.ok(embeddedResult.reasons.some((reason) => reason.includes("embeddedIdMismatch")));

    const digest = capture.buildSnapshot();
    digest.claim.resolvedEntities[0].records[0].before.rawArtifactSha256 = "0".repeat(64);
    digest.fieldDigest = digestStable(digest.claim);
    const digestResult = capture.validateBehaviorShard15Snapshot(digest, { repositoryRoot });
    assert.equal(digestResult.valid, false);
    assert.ok(digestResult.reasons.some((reason) => reason.includes("sha256Mismatch")));

    const comparison = capture.buildSnapshot();
    comparison.claim.resolvedEntities[0].records[0].comparison.changedFieldCount += 1;
    comparison.fieldDigest = digestStable(comparison.claim);
    const comparisonResult = capture.validateBehaviorShard15Snapshot(comparison, { repositoryRoot });
    assert.equal(comparisonResult.valid, false);
    assert.ok(comparisonResult.reasons.some((reason) => reason.includes("comparisonInvalid")));

    const queue = capture.buildSnapshot();
    queue.claim.shard.authoritativeCandidateIds[0] = "forged";
    queue.fieldDigest = digestStable(queue.claim);
    const queueResult = capture.validateBehaviorShard15Snapshot(queue, { repositoryRoot });
    assert.equal(queueResult.valid, false);
    assert.ok(queueResult.reasons.includes("authoritativeShardBindingInvalid"));

    const checkpoint = capture.buildCheckpoint();
    checkpoint.revisions.after.completedArtifactCount = 15;
    checkpoint.fieldDigest = digestStable(checkpoint.claim);
    const checkpointResult = capture.validateCheckpoint(checkpoint, { repositoryRoot });
    assert.equal(checkpointResult.valid, false);
    assert.ok(checkpointResult.reasons.includes("revisionCheckpointInvalid:after"));
});

test("shard 15 schemas are dedicated and declare raw, identity, and checkpoint gates", () => {
    const snapshotSchema = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "games/genshin/data/schema/version-transition-behavior-shard-15-snapshot.schema.json"), "utf8"));
    const checkpointSchema = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "games/genshin/data/schema/version-transition-behavior-shard-15-capture-checkpoint.schema.json"), "utf8"));
    assert.equal(snapshotSchema.$id, "genshin-version-transition-behavior-shard-15-snapshot.schema.json");
    assert.equal(snapshotSchema.$defs.shard.properties.shardId.const, capture.shardId);
    assert.deepEqual(snapshotSchema.$defs.shard.properties.authoritativeEntityIds.const, capture.resolvedEntities.map((entity) => entity.entityId));
    assert.ok(snapshotSchema.$defs.artifact.properties.gitBlob);
    assert.ok(snapshotSchema.$defs.artifact.properties.rawArtifactSha256);
    assert.equal(snapshotSchema.$defs.artifact.properties.embeddedIdPath.const, "$.id");
    assert.equal(checkpointSchema.$id, "genshin-version-transition-behavior-shard-15-capture-checkpoint.schema.json");
    assert.equal(checkpointSchema.properties.kind.const, "genshinVersionTransitionBehaviorShardCaptureCheckpoint");
    assert.equal(checkpointSchema.properties.status.const, "complete");
});
