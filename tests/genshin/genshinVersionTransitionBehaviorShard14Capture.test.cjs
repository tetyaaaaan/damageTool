"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const capture = require("../../scripts/genshinVersionTransitionBehaviorShard14Capture.cjs");
const { digestStable } = require("../../scripts/genshinVersionEvidenceValidation.cjs");
const repositoryRoot = path.resolve(__dirname, "../..");

test("behaviorSpec shard 14 binds the exact authoritative 100-candidate inventory", () => {
    const queue = capture.queueShard();
    assert.equal(queue.candidateCount, 100);
    assert.equal(queue.entityCount, 8);
    assert.deepEqual(queue.entityIds, ["10000115", "10000116", "10000119", "10000120", "10000121", "10000122", "10000123", "10000124"]);
    assert.deepEqual(queue.overlapEntityIds, ["10000115"]);
    assert.deepEqual(queue.ambiguousEntityIds, ["10000124"]);
    assert.deepEqual(capture.resolvedEntities.map((entity) => entity.entityId), ["10000116", "10000119", "10000120", "10000121", "10000122", "10000123"]);
    assert.equal(queue.candidateIdsDigest, digestStable(queue.candidateIds));
    assert.equal(queue.candidateIds.some((id) => /:1000000[57]:/.test(id)), false);
});

test("shard 14 resolves six provider identities and keeps Yafoda unresolved", () => {
    const snapshot = capture.buildSnapshot();
    assert.equal(snapshot.summary.resolvedEntities, 6);
    assert.deepEqual(snapshot.claim.resolvedEntities.map((entity) => entity.providerSlug), ["ineffa", "lauma", "flins", "aino", "nefer", "durin"]);
    assert.deepEqual(snapshot.claim.resolvedEntities.map((entity) => entity.providerId), [11601, 11901, 12001, 12101, 12201, 12301]);
    const unresolved = snapshot.claim.unresolvedEntities.find((entity) => entity.entityId === "10000124");
    assert.equal(unresolved.resolutionStatus, "unresolvedProviderRecord");
    assert.equal(unresolved.providerSlug, null);
    assert.equal(unresolved.providerId, null);
    assert.ok(unresolved.providerEvidence.every((evidence) => evidence.httpStatus === 404 && evidence.status === "notFound"));
    assert.deepEqual(snapshot.claim.identityResolution.identityMismatches, []);
    assert.ok(snapshot.claim.identityResolution.consumerMapper.missingEntityIds.includes("10000124"));
    assert.equal(capture.validateBehaviorShard14Snapshot(snapshot, { repositoryRoot }).valid, true);
});

test("shard 14 retains strict raw bindings and remains fail-closed", () => {
    const snapshot = capture.buildSnapshot();
    const records = snapshot.claim.resolvedEntities.flatMap((entity) => entity.records);
    assert.equal(records.length, 12);
    assert.ok(records.every((record) => record.before.gameVersion === "6.7" && record.after.gameVersion === "7.0"));
    assert.ok(records.every((record) => record.before.rawArtifactBytes > 0 && record.after.rawArtifactBytes > 0));
    assert.ok(records.every((record) => /^[a-f0-9]{40}$/.test(record.before.gitBlob) && /^[a-f0-9]{40}$/.test(record.after.gitBlob)));
    assert.ok(records.every((record) => /^[a-f0-9]{64}$/.test(record.before.rawArtifactSha256) && /^[a-f0-9]{64}$/.test(record.after.rawArtifactSha256)));
    assert.equal(snapshot.summary.changedRecords, 0);
    assert.equal(snapshot.summary.changedFields, 0);
    assert.equal(snapshot.gateEligibility.canIssueEligibilityCertificate, false);
    assert.equal(snapshot.gateEligibility.canPromoteCanonical, false);
});

test("shard 14 records overlap evidence and a resumable ambiguity checkpoint", () => {
    const snapshot = JSON.parse(fs.readFileSync(capture.outputPath, "utf8"));
    const checkpoint = JSON.parse(fs.readFileSync(capture.checkpointPath, "utf8"));
    const overlap = snapshot.claim.shard.overlapEvidence[0];
    assert.equal(overlap.entityId, "10000115");
    assert.equal(overlap.previousShardId, "behavior:behaviorSpec:semanticDecisionRequired:standard:13");
    assert.equal(overlap.acquisitionPolicy, "notReacquired");
    assert.equal(overlap.previousRecordCount, 2);
    assert.equal(snapshot.summary.overlapSkippedEntities, 1);
    assert.equal(snapshot.summary.ambiguousEntities, 1);
    assert.equal(checkpoint.status, "blockedByIdentityAmbiguity");
    assert.equal(checkpoint.capturedEntityCount, 6);
    assert.equal(checkpoint.skippedOverlapEntityCount, 1);
    assert.equal(checkpoint.ambiguousEntityCount, 1);
    assert.deepEqual(snapshot, capture.buildSnapshot());
    assert.deepEqual(checkpoint, capture.buildCheckpoint(snapshot));
    assert.deepEqual(capture.validateBehaviorShard14Snapshot(snapshot, { repositoryRoot }), { valid: true, reasons: [] });
    assert.deepEqual(capture.validateCheckpoint(checkpoint, { repositoryRoot }), { valid: true, reasons: [] });
});

test("shard 14 validators reject forged raw, queue, ambiguity, and checkpoint evidence", () => {
    const embedded = capture.buildSnapshot();
    embedded.claim.resolvedEntities[0].records[0].before.embeddedId += 1;
    embedded.fieldDigest = digestStable(embedded.claim);
    const embeddedResult = capture.validateBehaviorShard14Snapshot(embedded, { repositoryRoot });
    assert.equal(embeddedResult.valid, false);
    assert.ok(embeddedResult.reasons.some((reason) => reason.includes("embeddedIdMismatch")));

    const digest = capture.buildSnapshot();
    digest.claim.resolvedEntities[0].records[0].before.rawArtifactSha256 = "0".repeat(64);
    digest.fieldDigest = digestStable(digest.claim);
    const digestResult = capture.validateBehaviorShard14Snapshot(digest, { repositoryRoot });
    assert.equal(digestResult.valid, false);
    assert.ok(digestResult.reasons.some((reason) => reason.includes("sha256Mismatch")));

    const ambiguity = capture.buildSnapshot();
    ambiguity.claim.unresolvedEntities[0].providerSlug = "yafoda";
    ambiguity.fieldDigest = digestStable(ambiguity.claim);
    const ambiguityResult = capture.validateBehaviorShard14Snapshot(ambiguity, { repositoryRoot });
    assert.equal(ambiguityResult.valid, false);
    assert.ok(ambiguityResult.reasons.includes("ambiguousEntityInvalid:10000124"));

    const queue = capture.buildSnapshot();
    queue.claim.shard.authoritativeCandidateIds[0] = "forged";
    queue.fieldDigest = digestStable(queue.claim);
    const queueResult = capture.validateBehaviorShard14Snapshot(queue, { repositoryRoot });
    assert.equal(queueResult.valid, false);
    assert.ok(queueResult.reasons.includes("authoritativeShardBindingInvalid"));

    const checkpoint = capture.buildCheckpoint();
    checkpoint.revisions.after.completedArtifactCount = 11;
    checkpoint.fieldDigest = digestStable(checkpoint.claim);
    const checkpointResult = capture.validateCheckpoint(checkpoint, { repositoryRoot });
    assert.equal(checkpointResult.valid, false);
    assert.ok(checkpointResult.reasons.includes("revisionCheckpointInvalid:after"));
});

test("shard 14 schemas are dedicated and declare overlap/ambiguity/raw gates", () => {
    const snapshotSchema = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "games/genshin/data/schema/version-transition-behavior-shard-14-snapshot.schema.json"), "utf8"));
    const checkpointSchema = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "games/genshin/data/schema/version-transition-behavior-shard-14-capture-checkpoint.schema.json"), "utf8"));
    assert.equal(snapshotSchema.$id, "genshin-version-transition-behavior-shard-14-snapshot.schema.json");
    assert.equal(snapshotSchema.$defs.shard.properties.shardId.const, capture.shardId);
    assert.deepEqual(snapshotSchema.$defs.shard.properties.authoritativeEntityIds.const, capture.queueShard().entityIds);
    assert.deepEqual(snapshotSchema.$defs.shard.properties.skippedOverlapEntityIds.const, ["10000115"]);
    assert.ok(snapshotSchema.$defs.artifact.properties.gitBlob);
    assert.ok(snapshotSchema.$defs.artifact.properties.rawArtifactSha256);
    assert.equal(snapshotSchema.$defs.artifact.properties.embeddedIdPath.const, "$.id");
    assert.equal(snapshotSchema.$defs.unresolved.properties.entityId.const, "10000124");
    assert.equal(checkpointSchema.$id, "genshin-version-transition-behavior-shard-14-capture-checkpoint.schema.json");
    assert.equal(checkpointSchema.properties.status.const, "blockedByIdentityAmbiguity");
    assert.equal(checkpointSchema.properties.ambiguousEntityCount.const, 1);
});
