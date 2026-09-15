"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const capture = require("../../scripts/genshinVersionTransitionBehaviorShard04Capture.cjs");
const { digestStable } = require("../../scripts/genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "../..");

test("behaviorSpec shard 04 is queue-bound and captures only new entities", () => {
    const snapshot = capture.buildSnapshot();
    const queue = capture.queueShard();
    assert.equal(snapshot.summary.shardId, capture.shardId);
    assert.equal(snapshot.summary.authoritativeCandidates, 100);
    assert.equal(snapshot.summary.authoritativeEntities, 9);
    assert.equal(snapshot.summary.resolvedEntities, 8);
    assert.equal(snapshot.summary.overlapSkippedEntities, 1);
    assert.equal(snapshot.summary.resolvedRecords, 16);
    assert.equal(snapshot.summary.changedRecords, 1);
    assert.equal(snapshot.summary.changedFields, 2);
    assert.equal(snapshot.claim.shard.authoritativeCandidateCount, queue.candidateIds.length);
    assert.deepEqual(snapshot.claim.shard.authoritativeCandidateIds, queue.candidateIds);
    assert.equal(snapshot.claim.shard.authoritativeCandidateIdsDigest, digestStable(queue.candidateIds));
    assert.deepEqual(snapshot.claim.shard.skippedOverlapEntityIds, ["10000036"]);
    assert.deepEqual(snapshot.claim.resolvedEntities.map((entity) => entity.entityId), capture.resolvedEntities.map((entity) => entity.entityId));
    assert.deepEqual(snapshot.claim.resolvedEntities.map((entity) => entity.providerSlug), ["ganyu", "albedo", "mona", "keqing", "sucrose", "xinyan", "rosaria", "hutao"]);
    assert.equal(snapshot.claim.coverage.canIssueEligibilityCertificate, false);
    assert.equal(snapshot.claim.coverage.canPromoteCanonical, false);
    assert.equal(snapshot.gateEligibility.status, "singleCorrelatedFamilyFailClosed");
    assert.equal(capture.validateBehaviorShardSnapshot(snapshot, { repositoryRoot }).valid, true);
});

test("shard 04 records strict raw bindings and the concrete Sucrose 7.0 diff", () => {
    const snapshot = capture.buildSnapshot();
    const records = snapshot.claim.resolvedEntities.flatMap((entity) => entity.records);
    assert.equal(records.length, 16);
    assert.ok(records.every((record) => record.before.rawArtifactBytes > 0 && record.after.rawArtifactBytes > 0));
    assert.ok(records.every((record) => /^[a-f0-9]{40}$/.test(record.before.gitBlob) && /^[a-f0-9]{40}$/.test(record.after.gitBlob)));
    assert.ok(records.every((record) => /^[a-f0-9]{64}$/.test(record.before.rawArtifactSha256) && /^[a-f0-9]{64}$/.test(record.after.rawArtifactSha256)));
    assert.ok(records.filter((record) => record.comparison.status === "rawRecordMatch").length === 15);
    const sucrose = snapshot.claim.resolvedEntities.find((entity) => entity.entityId === "10000043");
    const passive = sucrose.records.find((record) => record.recordKind === "talents");
    assert.equal(passive.comparison.status, "rawRecordChanged");
    assert.equal(passive.comparison.changedFieldCount, 2);
    assert.deepEqual(passive.comparison.fieldDiffs.map((diff) => diff.jsonPointer), ["/passive1/description", "/passive1/descriptionRaw"]);
    assert.match(passive.comparison.fieldDiffs[0].afterValue, /Stellar Swirl/);
    assert.equal(passive.before.packageVersion, "5.2.12");
    assert.equal(passive.after.packageVersion, "5.2.13");
});

test("shard 04 checked-in snapshot is deterministic and validates all raw files", () => {
    const checkedIn = JSON.parse(fs.readFileSync(capture.outputPath, "utf8"));
    assert.deepEqual(checkedIn, capture.buildSnapshot());
    const validation = capture.validateBehaviorShardSnapshot(checkedIn, { repositoryRoot });
    assert.equal(validation.valid, true, validation.reasons.join("; "));
});

test("shard 04 validation rejects forged raw, comparison, and queue evidence", () => {
    const blob = capture.buildSnapshot();
    blob.claim.resolvedEntities[0].records[0].before.gitBlob = "0".repeat(40);
    blob.fieldDigest = digestStable(blob.claim);
    const blobResult = capture.validateBehaviorShardSnapshot(blob, { repositoryRoot });
    assert.equal(blobResult.valid, false);
    assert.ok(blobResult.reasons.some((reason) => reason.includes("gitBlobMismatch")));

    const comparison = capture.buildSnapshot();
    const sucrose = comparison.claim.resolvedEntities.find((entity) => entity.entityId === "10000043");
    sucrose.records.find((record) => record.recordKind === "talents").comparison.changedFieldCount = 0;
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

test("shard 04 schema declares its fixed queue, raw binding, and fail-closed fields", () => {
    const schemaPath = path.join(repositoryRoot, "games", "genshin", "data", "schema", "version-transition-behavior-shard-04-snapshot.schema.json");
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    assert.equal(schema.$id, "genshin-version-transition-behavior-shard-04-snapshot.schema.json");
    assert.equal(schema.$defs.claim.properties.shard.properties.shardId.const, "behavior:behaviorSpec:semanticDecisionRequired:standard:04");
    assert.equal(schema.$defs.claim.properties.shard.properties.skippedOverlapEntityIds.items.const, "10000036");
    assert.ok(schema.$defs.artifact.properties.gitBlob);
    assert.ok(schema.$defs.artifact.properties.rawArtifactSha256);
});
