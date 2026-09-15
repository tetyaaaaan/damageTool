"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const capture = require("../../scripts/genshinVersionTransitionBehaviorShard05Capture.cjs");
const { digestStable } = require("../../scripts/genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "../..");

test("behaviorSpec shard 05 is queue-bound and excludes its shard04 overlap", () => {
    const snapshot = capture.buildSnapshot();
    const queue = capture.queueShard();
    assert.equal(snapshot.summary.shardId, capture.shardId);
    assert.equal(snapshot.summary.authoritativeCandidates, 100);
    assert.equal(snapshot.summary.authoritativeEntities, 8);
    assert.equal(snapshot.summary.resolvedEntities, 7);
    assert.equal(snapshot.summary.overlapSkippedEntities, 1);
    assert.equal(snapshot.summary.resolvedRecords, 14);
    assert.equal(snapshot.claim.shard.authoritativeCandidateCount, queue.candidateIds.length);
    assert.deepEqual(snapshot.claim.shard.authoritativeCandidateIds, queue.candidateIds);
    assert.equal(snapshot.claim.shard.authoritativeCandidateIdsDigest, digestStable(queue.candidateIds));
    assert.deepEqual(snapshot.claim.shard.authoritativeEntityIds, ["10000046", "10000047", "10000048", "10000049", "10000050", "10000051", "10000052", "10000053"]);
    assert.deepEqual(snapshot.claim.shard.capturedNewEntityIds, ["10000047", "10000048", "10000049", "10000050", "10000051", "10000052", "10000053"]);
    assert.deepEqual(snapshot.claim.shard.skippedOverlapEntityIds, ["10000046"]);
    assert.equal(snapshot.claim.shard.overlapPolicy, "alreadyCapturedByBehaviorShard04");
    assert.deepEqual(snapshot.claim.resolvedEntities.map((entity) => entity.providerSlug), ["kaedeharakazuha", "yanfei", "yoimiya", "thoma", "eula", "raidenshogun", "sayu"]);
    assert.equal(snapshot.claim.travelerVariantEvidence.length, 0);
    assert.equal(snapshot.claim.variantAmbiguities.length, 0);
    assert.equal(snapshot.claim.coverage.canIssueEligibilityCertificate, false);
    assert.equal(snapshot.claim.coverage.canPromoteCanonical, false);
    assert.equal(snapshot.gateEligibility.status, "singleCorrelatedFamilyFailClosed");
    assert.equal(capture.validateBehaviorShardSnapshot(snapshot, { repositoryRoot }).valid, true);
});

test("shard 05 records strict two-revision raw bindings and generated field diffs", () => {
    const snapshot = capture.buildSnapshot();
    const records = snapshot.claim.resolvedEntities.flatMap((entity) => entity.records);
    assert.equal(records.length, 14);
    assert.ok(records.every((record) => record.before.gameVersion === "6.7" && record.after.gameVersion === "7.0"));
    assert.ok(records.every((record) => record.before.revision === captureRevision("6.7") && record.after.revision === captureRevision("7.0")));
    assert.ok(records.every((record) => record.before.rawArtifactBytes > 0 && record.after.rawArtifactBytes > 0));
    assert.ok(records.every((record) => /^[a-f0-9]{40}$/.test(record.before.gitBlob) && /^[a-f0-9]{40}$/.test(record.after.gitBlob)));
    assert.ok(records.every((record) => /^[a-f0-9]{64}$/.test(record.before.rawArtifactSha256) && /^[a-f0-9]{64}$/.test(record.after.rawArtifactSha256)));
    const changed = records.filter((record) => record.comparison.status === "rawRecordChanged");
    assert.equal(snapshot.summary.changedRecords, changed.length);
    assert.equal(snapshot.summary.changedFields, changed.reduce((sum, record) => sum + record.comparison.changedFieldCount, 0));
    assert.ok(changed.every((record) => record.comparison.changedFieldCount > 0));
    const kazuha = snapshot.claim.resolvedEntities.find((entity) => entity.entityId === "10000047");
    assert.deepEqual(kazuha.records.find((record) => record.recordKind === "talents").comparison.fieldDiffs.map((diff) => diff.jsonPointer), ["/passive2/description", "/passive2/descriptionRaw"]);
    const sayu = snapshot.claim.resolvedEntities.find((entity) => entity.entityId === "10000053");
    const sayuTalent = sayu.records.find((record) => record.recordKind === "talents");
    assert.ok(sayuTalent.comparison.fieldDiffs.some((diff) => String(diff.afterValue).includes("Stellar Swirl")));
});

test("shard 05 checked-in snapshot and complete checkpoint are deterministic and validate raw files", () => {
    const checkedIn = JSON.parse(fs.readFileSync(capture.outputPath, "utf8"));
    const checkpoint = JSON.parse(fs.readFileSync(capture.checkpointPath, "utf8"));
    assert.deepEqual(checkedIn, capture.buildSnapshot());
    assert.deepEqual(checkpoint, capture.buildCheckpoint(checkedIn));
    const snapshotValidation = capture.validateBehaviorShardSnapshot(checkedIn, { repositoryRoot });
    assert.equal(snapshotValidation.valid, true, snapshotValidation.reasons.join("; "));
    const checkpointValidation = capture.validateCheckpoint(checkpoint, { repositoryRoot });
    assert.equal(checkpointValidation.valid, true, checkpointValidation.reasons.join("; "));
    assert.equal(checkpoint.status, "complete");
    assert.equal(checkpoint.requestedEntityCount, 8);
    assert.equal(checkpoint.capturedEntityCount, 7);
    assert.equal(checkpoint.skippedOverlapEntityCount, 1);
    assert.equal(checkpoint.revisions.before.completedArtifactCount, 14);
    assert.equal(checkpoint.revisions.after.completedArtifactCount, 14);
    assert.equal(checkpoint.materializedSnapshot.changedRecordCount, checkedIn.summary.changedRecords);
    assert.equal(checkpoint.materializedSnapshot.changedFieldCount, checkedIn.summary.changedFields);
    assert.equal(checkpoint.gateEligibility.canIssueEligibilityCertificate, false);
    assert.equal(checkpoint.gateEligibility.canPromoteCanonical, false);
});

test("shard 05 validators reject forged evidence and checkpoint progress", () => {
    const snapshot = capture.buildSnapshot();
    snapshot.claim.resolvedEntities[0].records[0].before.rawArtifactSha256 = "0".repeat(64);
    snapshot.fieldDigest = digestStable(snapshot.claim);
    const rawResult = capture.validateBehaviorShardSnapshot(snapshot, { repositoryRoot });
    assert.equal(rawResult.valid, false);
    assert.ok(rawResult.reasons.some((reason) => reason.includes("sha256Mismatch")));

    const comparison = capture.buildSnapshot();
    const sayu = comparison.claim.resolvedEntities.find((entity) => entity.entityId === "10000053");
    sayu.records.find((record) => record.recordKind === "constellations").comparison.changedFieldCount = 0;
    comparison.fieldDigest = digestStable(comparison.claim);
    const comparisonResult = capture.validateBehaviorShardSnapshot(comparison, { repositoryRoot });
    assert.equal(comparisonResult.valid, false);
    assert.ok(comparisonResult.reasons.some((reason) => reason.includes("comparisonInvalid")));

    const checkpoint = capture.buildCheckpoint();
    checkpoint.revisions.after.completedArtifactCount = 13;
    checkpoint.fieldDigest = digestStable(checkpoint.claim);
    const checkpointResult = capture.validateCheckpoint(checkpoint, { repositoryRoot });
    assert.equal(checkpointResult.valid, false);
    assert.ok(checkpointResult.reasons.some((reason) => reason.includes("revisionProgressInvalid:after")));
});

test("shard 05 schemas declare exact transition, overlap, raw, and checkpoint fields", () => {
    const snapshotSchema = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "games", "genshin", "data", "schema", "version-transition-behavior-shard-05-snapshot.schema.json"), "utf8"));
    const checkpointSchema = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "games", "genshin", "data", "schema", "version-transition-behavior-shard-05-capture-checkpoint.schema.json"), "utf8"));
    assert.equal(snapshotSchema.$id, "genshin-version-transition-behavior-shard-05-snapshot.schema.json");
    assert.equal(snapshotSchema.$defs.claim.properties.shard.properties.shardId.const, capture.shardId);
    assert.deepEqual(snapshotSchema.$defs.claim.properties.shard.properties.skippedOverlapEntityIds.const, ["10000046"]);
    assert.ok(snapshotSchema.$defs.artifact.properties.gitBlob);
    assert.ok(snapshotSchema.$defs.artifact.properties.rawArtifactSha256);
    assert.equal(checkpointSchema.$id, "genshin-version-transition-behavior-shard-05-capture-checkpoint.schema.json");
    assert.equal(checkpointSchema.properties.kind.const, "genshinVersionTransitionBehaviorShard05CaptureCheckpoint");
    assert.equal(checkpointSchema.properties.revisions.properties.before.$ref, "#/$defs/progressBefore");
    assert.ok(checkpointSchema.$defs.progress.properties.skippedOverlapArtifactCount);
});

function captureRevision(gameVersion) {
    return gameVersion === "6.7"
        ? "1bab2cdba4d218fd5caa46b5f54e7884ee8359a2"
        : "8b15995fa220c88a4d0d7ffe1e21b041d0b32588";
}
