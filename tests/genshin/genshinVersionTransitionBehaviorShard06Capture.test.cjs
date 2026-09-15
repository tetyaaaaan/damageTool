"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const capture = require("../../scripts/genshinVersionTransitionBehaviorShard06Capture.cjs");
const { digestStable } = require("../../scripts/genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "../..");

test("behaviorSpec shard 06 binds the exact authoritative inventory", () => {
    const queue = capture.queueShard();
    assert.equal(queue.shardId, "behavior:behaviorSpec:semanticDecisionRequired:standard:06");
    assert.equal(queue.candidateCount, 100);
    assert.equal(queue.candidateIdsDigest, "bfe834bd21c8553352fa4c3b452189004635a9635a81900fed2736f4683b8c18");
    assert.deepEqual(queue.entityIds, ["10000054", "10000055", "10000056", "10000057", "10000059", "10000060", "10000062", "10000063"]);
    assert.deepEqual(capture.overlapEntityIds, []);
    assert.equal(queue.requestedPrimaryBlockReason, "sourceMissing");
    assert.equal(queue.observedPrimaryBlockReason, "semanticDecisionRequired");
    assert.equal(queue.candidateIds.some((id) => /:1000000[57]:/.test(id)), false);
});

test("shard 06 materializes eight entities and remains fail-closed", () => {
    const snapshot = capture.buildSnapshot();
    assert.deepEqual(snapshot.summary, {
        shardId: "behavior:behaviorSpec:semanticDecisionRequired:standard:06",
        authoritativeCandidates: 100,
        authoritativeEntities: 8,
        resolvedEntities: 8,
        overlapSkippedEntities: 0,
        ambiguousEntities: 0,
        resolvedRecords: 16,
        changedRecords: 1,
        changedFields: 2,
        sourceFamilyCount: 1,
        certificateEligibleClaims: 0
    });
    assert.equal(snapshot.claim.sourceFamily, "GenshinData-derived");
    assert.equal(snapshot.claim.queueShard.overlapPolicy, "noneWithMaterializedBehaviorShards01To04");
    assert.deepEqual(snapshot.claim.travelerVariantEvidence, []);
    assert.deepEqual(snapshot.claim.variantAmbiguities, []);
    assert.equal(snapshot.gateEligibility.status, "singleCorrelatedFamilyFailClosed");
    assert.equal(snapshot.gateEligibility.canIssueEligibilityCertificate, false);
    assert.equal(snapshot.gateEligibility.canPromoteCanonical, false);
    assert.deepEqual(capture.validateBehaviorShard06Snapshot(snapshot, { repositoryRoot }), { valid: true, reasons: [] });
});

test("shard 06 records strict raw revision/blob/digest and the concrete 7.0 diff", () => {
    const snapshot = capture.buildSnapshot();
    assert.deepEqual(snapshot.claim.versionBindings.map((binding) => binding.packageVersion), ["5.2.12", "5.2.13"]);
    assert.deepEqual(snapshot.claim.resolvedEntities.map((entity) => entity.providerSlug), [
        "sangonomiyakokomi", "gorou", "kujousara", "aratakiitto",
        "shikanoinheizou", "yelan", "aloy", "shenhe"
    ]);
    const records = snapshot.claim.resolvedEntities.flatMap((entity) => entity.records);
    assert.equal(records.length, 16);
    assert.equal(records.filter((record) => record.comparison.status === "rawRecordChanged").length, 1);
    for (const entity of snapshot.claim.resolvedEntities) {
        assert.equal(entity.records.length, 2);
        assert.equal(entity.resolutionStatus, "resolvedUnambiguousByProviderName");
        for (const record of entity.records) {
            for (const side of ["before", "after"]) {
                const artifact = record[side];
                assert.match(artifact.revision, /^[a-f0-9]{40}$/);
                assert.match(artifact.gitBlob, /^[a-f0-9]{40}$/);
                assert.match(artifact.rawArtifactSha256, /^[a-f0-9]{64}$/);
                assert.match(artifact.normalizedRecordDigest, /^[a-f0-9]{64}$/);
                assert.ok(artifact.rawArtifactBytes > 0);
                assert.deepEqual(artifact.embeddedCharacterIds, []);
                assert.equal(artifact.embeddedCharacterIdStatus, "notProvidedByProviderRecord");
            }
        }
    }
    const heizou = snapshot.claim.resolvedEntities.find((entity) => entity.entityId === "10000059");
    const talents = heizou.records.find((record) => record.recordKind === "talents");
    assert.equal(talents.comparison.status, "rawRecordChanged");
    assert.deepEqual(talents.comparison.fieldDiffs.map((diff) => diff.jsonPointer), ["/passive1/description", "/passive1/descriptionRaw"]);
    assert.match(talents.comparison.fieldDiffs[1].afterValue, /Stellar Swirl/);
});

test("shard 06 checked-in snapshot and complete checkpoint are deterministic", () => {
    const snapshot = JSON.parse(fs.readFileSync(capture.outputPath, "utf8"));
    const checkpoint = JSON.parse(fs.readFileSync(capture.checkpointPath, "utf8"));
    assert.deepEqual(snapshot, capture.buildSnapshot());
    assert.deepEqual(checkpoint, capture.buildCheckpoint(snapshot));
    assert.deepEqual(capture.validateBehaviorShard06Snapshot(snapshot, { repositoryRoot }), { valid: true, reasons: [] });
    assert.deepEqual(capture.validateBehaviorShard06Checkpoint(checkpoint, { repositoryRoot }), { valid: true, reasons: [] });
    assert.equal(checkpoint.status, "complete");
    assert.equal(checkpoint.revisions.before.completedArtifactCount, 16);
    assert.equal(checkpoint.revisions.after.completedArtifactCount, 16);
});

test("shard 06 validators reject forged blob, digest, comparison, queue, and checkpoint evidence", () => {
    const blob = capture.buildSnapshot();
    blob.claim.resolvedEntities[0].records[0].before.gitBlob = "0".repeat(40);
    blob.fieldDigest = digestStable(blob.claim);
    const blobResult = capture.validateBehaviorShard06Snapshot(blob, { repositoryRoot });
    assert.equal(blobResult.valid, false);
    assert.ok(blobResult.reasons.some((reason) => reason.includes("gitBlobMismatch")));

    const digest = capture.buildSnapshot();
    digest.claim.resolvedEntities[0].records[0].before.rawArtifactSha256 = "0".repeat(64);
    digest.fieldDigest = digestStable(digest.claim);
    const digestResult = capture.validateBehaviorShard06Snapshot(digest, { repositoryRoot });
    assert.equal(digestResult.valid, false);
    assert.ok(digestResult.reasons.some((reason) => reason.includes("sha256Mismatch")));

    const comparison = capture.buildSnapshot();
    comparison.claim.resolvedEntities[0].records[0].comparison.changedFieldCount = 1;
    comparison.fieldDigest = digestStable(comparison.claim);
    const comparisonResult = capture.validateBehaviorShard06Snapshot(comparison, { repositoryRoot });
    assert.equal(comparisonResult.valid, false);
    assert.ok(comparisonResult.reasons.some((reason) => reason.includes("comparisonInvalid")));

    const queue = capture.buildSnapshot();
    queue.claim.queueShard.authoritativeCandidateIds[0] = "forged";
    queue.fieldDigest = digestStable(queue.claim);
    const queueResult = capture.validateBehaviorShard06Snapshot(queue, { repositoryRoot });
    assert.equal(queueResult.valid, false);
    assert.ok(queueResult.reasons.includes("authoritativeShardBindingInvalid"));

    const checkpoint = capture.buildCheckpoint();
    checkpoint.queueShard.candidateIdsDigest = "0".repeat(64);
    const checkpointResult = capture.validateBehaviorShard06Checkpoint(checkpoint, { repositoryRoot });
    assert.equal(checkpointResult.valid, false);
    assert.ok(checkpointResult.reasons.includes("queueShardInvalid"));
});

test("shard 06 schemas are dedicated and expose strict raw/checkpoint gates", () => {
    const snapshotSchema = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "games/genshin/data/schema/version-transition-behavior-shard06-snapshot.schema.json"), "utf8"));
    const checkpointSchema = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "games/genshin/data/schema/version-transition-behavior-shard06-capture-checkpoint.schema.json"), "utf8"));
    assert.equal(snapshotSchema.$id, "genshin-version-transition-behavior-shard06-snapshot.schema.json");
    assert.equal(snapshotSchema.properties.kind.const, "genshinVersionTransitionBehaviorShard06Snapshot");
    assert.equal(snapshotSchema.$defs.queueShard.properties.shardId.const, "behavior:behaviorSpec:semanticDecisionRequired:standard:06");
    assert.ok(snapshotSchema.$defs.artifact.properties.rawArtifactSha256);
    assert.ok(snapshotSchema.$defs.artifact.properties.gitBlob);
    assert.ok(snapshotSchema.$defs.artifact.properties.normalizedRecordDigest);
    assert.equal(checkpointSchema.$id, "genshin-version-transition-behavior-shard06-capture-checkpoint.schema.json");
    assert.equal(checkpointSchema.properties.kind.const, "genshinVersionTransitionBehaviorShard06CaptureCheckpoint");
    assert.equal(checkpointSchema.properties.status.enum.includes("complete"), true);
});
