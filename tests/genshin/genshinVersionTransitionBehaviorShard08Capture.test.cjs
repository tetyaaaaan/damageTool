"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const capture = require("../../scripts/genshinVersionTransitionBehaviorShard08Capture.cjs");
const { digestStable } = require("../../scripts/genshinVersionEvidenceValidation.cjs");
const repositoryRoot = path.resolve(__dirname, "../..");

test("behaviorSpec shard 08 is exactly queue-bound and skips shard 07 overlap", () => {
    const snapshot = capture.buildSnapshot();
    const queue = capture.queueShard();
    assert.equal(snapshot.summary.shardId, capture.shardId);
    assert.equal(snapshot.summary.authoritativeCandidates, 100);
    assert.equal(snapshot.summary.authoritativeEntities, 8);
    assert.equal(snapshot.summary.resolvedEntities, 7);
    assert.equal(snapshot.summary.overlapSkippedEntities, 1);
    assert.equal(snapshot.summary.resolvedRecords, 14);
    assert.equal(snapshot.summary.changedRecords, 0);
    assert.equal(snapshot.summary.changedFields, 0);
    assert.deepEqual(snapshot.claim.shard.authoritativeCandidateIds, queue.candidateIds);
    assert.equal(snapshot.claim.shard.authoritativeCandidateIdsDigest, digestStable(queue.candidateIds));
    assert.deepEqual(snapshot.claim.shard.authoritativeEntityIds, [
        "10000070", "10000072", "10000073", "10000074",
        "10000075", "10000076", "10000077", "10000078"
    ]);
    assert.deepEqual(snapshot.claim.shard.capturedNewEntityIds, capture.resolvedEntities.map((entity) => entity.entityId));
    assert.deepEqual(snapshot.claim.shard.skippedOverlapEntityIds, ["10000070"]);
    assert.equal(snapshot.claim.shard.overlapPolicy, "alreadyCapturedByBehaviorShard07");
    assert.deepEqual(snapshot.claim.resolvedEntities.map((entity) => entity.providerSlug), [
        "candace", "nahida", "layla", "wanderer", "faruzan", "yaoyao", "alhaitham"
    ]);
    assert.equal(snapshot.claim.travelerVariantPolicy.failClosedOnEncounter, true);
    assert.deepEqual(snapshot.claim.travelerVariantEvidence, []);
    assert.deepEqual(snapshot.claim.variantAmbiguities, []);
    assert.equal(snapshot.claim.coverage.canIssueEligibilityCertificate, false);
    assert.equal(snapshot.claim.coverage.canPromoteCanonical, false);
    assert.equal(snapshot.gateEligibility.status, "singleCorrelatedFamilyFailClosed");
    assert.equal(capture.validateBehaviorShard08Snapshot(snapshot, { repositoryRoot }).valid, true);
});

test("shard 08 records immutable raw bindings and embedded provider ids", () => {
    const snapshot = capture.buildSnapshot();
    const records = snapshot.claim.resolvedEntities.flatMap((entity) => entity.records);
    assert.equal(records.length, 14);
    assert.ok(records.every((record) => record.comparison.status === "rawRecordMatch"));
    assert.ok(records.every((record) => record.before.gameVersion === "6.7" && record.after.gameVersion === "7.0"));
    assert.ok(records.every((record) => record.before.rawArtifactBytes > 0 && record.after.rawArtifactBytes > 0));
    assert.ok(records.every((record) => /^[a-f0-9]{40}$/.test(record.before.gitBlob) && /^[a-f0-9]{40}$/.test(record.after.gitBlob)));
    assert.ok(records.every((record) => /^[a-f0-9]{64}$/.test(record.before.rawArtifactSha256) && /^[a-f0-9]{64}$/.test(record.after.rawArtifactSha256)));
    for (const entity of snapshot.claim.resolvedEntities) {
        for (const record of entity.records) {
            assert.equal(record.before.embeddedIdPath, "$.id");
            assert.equal(record.after.embeddedIdPath, "$.id");
            assert.equal(record.before.embeddedId, entity.providerId);
            assert.equal(record.after.embeddedId, entity.providerId);
            assert.equal(record.comparison.beforeArtifactSha256, record.before.rawArtifactSha256);
            assert.equal(record.comparison.afterArtifactSha256, record.after.rawArtifactSha256);
        }
    }
});

test("shard 08 checked-in snapshot and complete checkpoint are deterministic", () => {
    const checkedIn = JSON.parse(fs.readFileSync(capture.outputPath, "utf8"));
    const checkpoint = JSON.parse(fs.readFileSync(capture.checkpointPath, "utf8"));
    assert.deepEqual(checkedIn, capture.buildSnapshot());
    assert.deepEqual(checkpoint, capture.buildCheckpoint(checkedIn));
    assert.equal(capture.validateBehaviorShard08Snapshot(checkedIn, { repositoryRoot }).valid, true);
    assert.equal(capture.validateCheckpoint(checkpoint, { repositoryRoot }).valid, true);
    assert.equal(checkpoint.status, "complete");
    assert.equal(checkpoint.revisions.before.completedArtifactCount, 14);
    assert.equal(checkpoint.revisions.after.completedArtifactCount, 14);
    assert.equal(checkpoint.gateEligibility.canIssueEligibilityCertificate, false);
    assert.equal(checkpoint.gateEligibility.canPromoteCanonical, false);
});

test("shard 08 validation rejects forged embedded id, raw digest, comparison, and queue evidence", () => {
    const embedded = capture.buildSnapshot();
    embedded.claim.resolvedEntities[0].records[0].before.embeddedId += 1;
    embedded.fieldDigest = digestStable(embedded.claim);
    const embeddedResult = capture.validateBehaviorShard08Snapshot(embedded, { repositoryRoot });
    assert.equal(embeddedResult.valid, false);
    assert.ok(embeddedResult.reasons.some((reason) => reason.includes("embeddedIdMismatch")));

    const digest = capture.buildSnapshot();
    digest.claim.resolvedEntities[0].records[0].before.rawArtifactSha256 = "0".repeat(64);
    digest.fieldDigest = digestStable(digest.claim);
    const digestResult = capture.validateBehaviorShard08Snapshot(digest, { repositoryRoot });
    assert.equal(digestResult.valid, false);
    assert.ok(digestResult.reasons.some((reason) => reason.includes("sha256Mismatch")));

    const comparison = capture.buildSnapshot();
    comparison.claim.resolvedEntities[0].records[0].comparison.changedFieldCount = 1;
    comparison.fieldDigest = digestStable(comparison.claim);
    const comparisonResult = capture.validateBehaviorShard08Snapshot(comparison, { repositoryRoot });
    assert.equal(comparisonResult.valid, false);
    assert.ok(comparisonResult.reasons.some((reason) => reason.includes("comparisonInvalid")));

    const queue = capture.buildSnapshot();
    queue.claim.shard.authoritativeCandidateIds[0] = "forged";
    queue.fieldDigest = digestStable(queue.claim);
    const queueResult = capture.validateBehaviorShard08Snapshot(queue, { repositoryRoot });
    assert.equal(queueResult.valid, false);
    assert.ok(queueResult.reasons.includes("authoritativeShardBindingInvalid"));
});

test("shard 08 schema declares the fixed queue, embedded id, overlap, and fail-closed gate", () => {
    const schemaPath = path.join(repositoryRoot, "games", "genshin", "data", "schema", "version-transition-behavior-shard-08-snapshot.schema.json");
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    assert.equal(schema.$id, "genshin-version-transition-behavior-shard-08-snapshot.schema.json");
    assert.equal(schema.$defs.claim.properties.shard.properties.shardId.const, capture.shardId);
    assert.deepEqual(schema.$defs.claim.properties.shard.properties.skippedOverlapEntityIds.const, ["10000070"]);
    assert.ok(schema.$defs.artifact.properties.gitBlob);
    assert.ok(schema.$defs.artifact.properties.rawArtifactSha256);
    assert.equal(schema.$defs.artifact.properties.embeddedIdPath.const, "$.id");
});
