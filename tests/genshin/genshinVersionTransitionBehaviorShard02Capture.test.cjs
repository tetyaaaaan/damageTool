"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const capture = require("../../scripts/genshinVersionTransitionBehaviorShard02Capture.cjs");
const { digestStable } = require("../../scripts/genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "../..");

test("behaviorSpec shard 02 is queue-bound and captures only its new entities", () => {
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
    assert.equal(snapshot.claim.shard.authoritativeCandidateCount, queue.candidateIds.length);
    assert.deepEqual(snapshot.claim.shard.authoritativeCandidateIds, queue.candidateIds);
    assert.equal(snapshot.claim.shard.authoritativeCandidateIdsDigest, digestStable(queue.candidateIds));
    assert.deepEqual(snapshot.claim.shard.skippedOverlapEntityIds, ["10000016"]);
    assert.deepEqual(snapshot.claim.resolvedEntities.map((entity) => entity.entityId), capture.resolvedEntities.map((entity) => entity.entityId));
    assert.deepEqual(snapshot.claim.resolvedEntities.map((entity) => entity.providerSlug), ["razor", "amber", "xiangling", "beidou", "xingqiu", "xiao", "ningguang"]);
    assert.equal(snapshot.claim.coverage.canIssueEligibilityCertificate, false);
    assert.equal(snapshot.claim.coverage.canPromoteCanonical, false);
    assert.equal(snapshot.gateEligibility.status, "singleCorrelatedFamilyFailClosed");
    assert.equal(capture.validateBehaviorShardSnapshot(snapshot, { repositoryRoot }).valid, true);
});

test("shard 02 binds every raw record to revision, package version, Git blob, and SHA-256", () => {
    const snapshot = capture.buildSnapshot();
    for (const entity of snapshot.claim.resolvedEntities) {
        assert.equal(entity.resolutionStatus, "resolvedUnambiguous");
        assert.equal(entity.records.length, 2);
        for (const record of entity.records) {
            assert.equal(record.comparison.status, "rawRecordMatch", `${entity.entityId}:${record.recordKind}`);
            assert.equal(record.comparison.changedFieldCount, 0, `${entity.entityId}:${record.recordKind}`);
            assert.deepEqual(record.comparison.fieldDiffs, []);
            for (const side of ["before", "after"]) {
                const artifact = record[side];
                assert.match(artifact.gitBlob, /^[a-f0-9]{40}$/);
                assert.match(artifact.rawArtifactSha256, /^[a-f0-9]{64}$/);
                assert.ok(artifact.rawArtifactBytes > 0);
                assert.match(artifact.url, /raw\.githubusercontent\.com\/theBowja\/genshin-db\/[a-f0-9]{40}/);
                assert.equal(artifact.packageVersion, side === "before" ? "5.2.12" : "5.2.13");
            }
        }
    }
    assert.deepEqual(snapshot.claim.versionBindings.map((binding) => binding.package.packageVersion), ["5.2.12", "5.2.13"]);
    assert.ok(snapshot.claim.versionBindings.every((binding) => /^[a-f0-9]{40}$/.test(binding.package.gitBlob)));
    assert.ok(snapshot.claim.versionBindings.every((binding) => /^[a-f0-9]{64}$/.test(binding.package.rawArtifactSha256)));
});

test("shard 02 checked-in snapshot is deterministic", () => {
    const checkedIn = JSON.parse(fs.readFileSync(capture.outputPath, "utf8"));
    assert.deepEqual(checkedIn, capture.buildSnapshot());
    const validation = capture.validateBehaviorShardSnapshot(checkedIn, { repositoryRoot });
    assert.equal(validation.valid, true, validation.reasons.join("; "));
});

test("shard 02 validation rejects forged blob, raw digest, comparison, or queue binding", () => {
    const blob = capture.buildSnapshot();
    blob.claim.resolvedEntities[0].records[0].before.gitBlob = "0".repeat(40);
    blob.fieldDigest = digestStable(blob.claim);
    const blobResult = capture.validateBehaviorShardSnapshot(blob, { repositoryRoot });
    assert.equal(blobResult.valid, false);
    assert.ok(blobResult.reasons.some((reason) => reason.includes("gitBlobMismatch")));

    const digest = capture.buildSnapshot();
    digest.claim.resolvedEntities[0].records[0].before.rawArtifactSha256 = "0".repeat(64);
    digest.fieldDigest = digestStable(digest.claim);
    const digestResult = capture.validateBehaviorShardSnapshot(digest, { repositoryRoot });
    assert.equal(digestResult.valid, false);
    assert.ok(digestResult.reasons.some((reason) => reason.includes("sha256Mismatch")));

    const comparison = capture.buildSnapshot();
    comparison.claim.resolvedEntities[0].records[0].comparison.status = "rawRecordChanged";
    comparison.fieldDigest = digestStable(comparison.claim);
    const comparisonResult = capture.validateBehaviorShardSnapshot(comparison, { repositoryRoot });
    assert.equal(comparisonResult.valid, false);
    assert.ok(comparisonResult.reasons.some((reason) => reason.includes("comparisonInvalid")));

    const queue = capture.buildSnapshot();
    queue.claim.shard.authoritativeCandidateIds[0] = "forged";
    queue.fieldDigest = digestStable(queue.claim);
    const queueResult = capture.validateBehaviorShardSnapshot(queue, { repositoryRoot });
    assert.equal(queueResult.valid, false);
    assert.ok(queueResult.reasons.includes("authoritativeShardBindingInvalid"));
});

test("shard 02 schema declares strict queue and raw evidence fields", () => {
    const schemaPath = path.join(repositoryRoot, "games", "genshin", "data", "schema", "version-transition-behavior-shard-snapshot.schema.json");
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    assert.equal(schema.$id, "genshin-version-transition-behavior-shard-snapshot.schema.json");
    assert.equal(schema.$defs.claim.properties.shard.properties.authoritativeCandidateCount.const, 100);
    assert.ok(schema.$defs.artifact.properties.gitBlob);
    assert.ok(schema.$defs.artifact.properties.rawArtifactSha256);
});
