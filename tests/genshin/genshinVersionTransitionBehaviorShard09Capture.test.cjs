"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const capture = require("../../scripts/genshinVersionTransitionBehaviorShard09Capture.cjs");
const { digestStable } = require("../../scripts/genshinVersionEvidenceValidation.cjs");
const repositoryRoot = path.resolve(__dirname, "../..");

test("behaviorSpec shard 09 binds the persisted 100-candidate inventory", () => {
    const queue = capture.queueShard();
    assert.equal(queue.shardId, "behavior:behaviorSpec:semanticDecisionRequired:standard:09");
    assert.equal(queue.candidateCount, 100);
    assert.equal(queue.candidateIdsDigest, "4e81f90bebcee15bfc6f8c20cb63102f20ba60ad8750c56d1c9e01bcf1472c62");
    assert.deepEqual(queue.entityIds, ["10000078", "10000079", "10000080", "10000081", "10000082", "10000083", "10000084", "10000085"]);
    assert.equal(queue.candidateIds.some((id) => /:1000000[57]:/.test(id)), false);
    assert.deepEqual(capture.overlapEntityIds, []);
});

test("shard 09 materializes all eight entities and remains fail-closed", () => {
    const snapshot = capture.buildSnapshot();
    assert.deepEqual(snapshot.summary, {
        shardId: "behavior:behaviorSpec:semanticDecisionRequired:standard:09",
        authoritativeCandidates: 100,
        authoritativeEntities: 8,
        resolvedEntities: 8,
        overlapSkippedEntities: 0,
        ambiguousEntities: 0,
        resolvedRecords: 16,
        changedRecords: 0,
        changedFields: 0,
        sourceFamilyCount: 1,
        certificateEligibleClaims: 0
    });
    assert.deepEqual(snapshot.claim.resolvedEntities.map((entity) => entity.providerSlug), ["alhaitham", "dehya", "mika", "kaveh", "baizhu", "lynette", "lyney", "freminet"]);
    assert.deepEqual(snapshot.claim.shard.skippedOverlapEntityIds, []);
    assert.equal(snapshot.claim.shard.overlapPolicy, "noneWithMaterializedBehaviorShards01To08");
    assert.deepEqual(snapshot.claim.travelerVariantEvidence, []);
    assert.deepEqual(snapshot.claim.variantAmbiguities, []);
    assert.equal(snapshot.claim.coverage.canIssueEligibilityCertificate, false);
    assert.equal(snapshot.claim.coverage.canPromoteCanonical, false);
    assert.equal(snapshot.gateEligibility.status, "singleCorrelatedFamilyFailClosed");
    assert.deepEqual(capture.validateBehaviorShard09Snapshot(snapshot, { repositoryRoot }), { valid: true, reasons: [] });
});

test("shard 09 records strict raw revision/blob/digest and embedded provider ids", () => {
    const snapshot = capture.buildSnapshot();
    assert.deepEqual(snapshot.claim.versionBindings.map((binding) => binding.packageVersion), ["5.2.12", "5.2.13"]);
    const records = snapshot.claim.resolvedEntities.flatMap((entity) => entity.records);
    assert.equal(records.length, 16);
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

test("shard 09 checked-in snapshot and complete checkpoint are deterministic", () => {
    const checkedIn = JSON.parse(fs.readFileSync(capture.outputPath, "utf8"));
    const checkpoint = JSON.parse(fs.readFileSync(capture.checkpointPath, "utf8"));
    assert.deepEqual(checkedIn, capture.buildSnapshot());
    assert.deepEqual(checkpoint, capture.buildCheckpoint(checkedIn));
    assert.deepEqual(capture.validateBehaviorShard09Snapshot(checkedIn, { repositoryRoot }), { valid: true, reasons: [] });
    assert.deepEqual(capture.validateCheckpoint(checkpoint, { repositoryRoot }), { valid: true, reasons: [] });
    assert.equal(checkpoint.status, "complete");
    assert.equal(checkpoint.revisions.before.completedArtifactCount, 16);
    assert.equal(checkpoint.revisions.after.completedArtifactCount, 16);
    assert.equal(checkpoint.gateEligibility.canIssueEligibilityCertificate, false);
    assert.equal(checkpoint.gateEligibility.canPromoteCanonical, false);
});

test("shard 09 validators reject forged embedded id, raw digest, comparison, queue, and checkpoint evidence", () => {
    const embedded = capture.buildSnapshot();
    embedded.claim.resolvedEntities[0].records[0].before.embeddedId += 1;
    embedded.fieldDigest = digestStable(embedded.claim);
    const embeddedResult = capture.validateBehaviorShard09Snapshot(embedded, { repositoryRoot });
    assert.equal(embeddedResult.valid, false);
    assert.ok(embeddedResult.reasons.some((reason) => reason.includes("embeddedIdMismatch")));

    const digest = capture.buildSnapshot();
    digest.claim.resolvedEntities[0].records[0].before.rawArtifactSha256 = "0".repeat(64);
    digest.fieldDigest = digestStable(digest.claim);
    const digestResult = capture.validateBehaviorShard09Snapshot(digest, { repositoryRoot });
    assert.equal(digestResult.valid, false);
    assert.ok(digestResult.reasons.some((reason) => reason.includes("sha256Mismatch")));

    const comparison = capture.buildSnapshot();
    comparison.claim.resolvedEntities[0].records[0].comparison.changedFieldCount = 1;
    comparison.fieldDigest = digestStable(comparison.claim);
    const comparisonResult = capture.validateBehaviorShard09Snapshot(comparison, { repositoryRoot });
    assert.equal(comparisonResult.valid, false);
    assert.ok(comparisonResult.reasons.some((reason) => reason.includes("comparisonInvalid")));

    const queue = capture.buildSnapshot();
    queue.claim.shard.authoritativeCandidateIds[0] = "forged";
    queue.fieldDigest = digestStable(queue.claim);
    const queueResult = capture.validateBehaviorShard09Snapshot(queue, { repositoryRoot });
    assert.equal(queueResult.valid, false);
    assert.ok(queueResult.reasons.includes("authoritativeShardBindingInvalid"));

    const checkpoint = capture.buildCheckpoint();
    checkpoint.claim.authoritativeCandidateIdsDigest = "0".repeat(64);
    checkpoint.fieldDigest = digestStable(checkpoint.claim);
    const checkpointResult = capture.validateCheckpoint(checkpoint, { repositoryRoot });
    assert.equal(checkpointResult.valid, false);
    assert.ok(checkpointResult.reasons.includes("checkpointClaimInvalid"));
});

test("shard 09 schema declares the exact queue, no overlap, embedded id, and fail-closed gate", () => {
    const schemaPath = path.join(repositoryRoot, "games", "genshin", "data", "schema", "version-transition-behavior-shard-09-snapshot.schema.json");
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    assert.equal(schema.$id, "genshin-version-transition-behavior-shard-09-snapshot.schema.json");
    assert.equal(schema.$defs.claim.properties.shard.properties.shardId.const, capture.shardId);
    assert.deepEqual(schema.$defs.claim.properties.shard.properties.skippedOverlapEntityIds.const, []);
    assert.equal(schema.$defs.claim.properties.shard.properties.overlapPolicy.const, "noneWithMaterializedBehaviorShards01To08");
    assert.ok(schema.$defs.artifact.properties.gitBlob);
    assert.ok(schema.$defs.artifact.properties.rawArtifactSha256);
    assert.equal(schema.$defs.artifact.properties.embeddedIdPath.const, "$.id");
});
