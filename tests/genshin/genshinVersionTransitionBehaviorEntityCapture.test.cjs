"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const capture = require("../../scripts/genshinVersionTransitionBehaviorEntityCapture.cjs");

const repositoryRoot = path.resolve(__dirname, "../..");
const snapshotPath = capture.outputPath;

test("behavior transition shard captures six resolved entities with strict raw bindings", () => {
    const snapshot = capture.buildSnapshot();
    assert.deepEqual(snapshot.summary, {
        resolvedEntities: 6,
        ambiguousEntities: 2,
        travelerVariants: 7,
        resolvedRecords: 12,
        changedRecords: 0,
        changedFields: 0,
        sourceFamilyCount: 1,
        certificateEligibleClaims: 0
    });
    assert.deepEqual(snapshot.claim.coverage.resolvedEntityIds, capture.resolvedEntities.map((entity) => entity.entityId));
    assert.deepEqual(snapshot.claim.coverage.ambiguousEntityIds, capture.ambiguousEntities.map((entity) => entity.entityId));
    assert.equal(snapshot.claim.coverage.resolvedEntityRecordCoverage, "complete");
    assert.equal(snapshot.claim.coverage.canIssueEligibilityCertificate, false);
    assert.equal(snapshot.claim.coverage.canPromoteCanonical, false);
    assert.equal(snapshot.gateEligibility.status, "singleCorrelatedFamilyFailClosed");
    assert.equal(capture.validateBehaviorEntitySnapshot(snapshot, { repositoryRoot }).valid, true);

    for (const entity of snapshot.claim.resolvedEntities) {
        assert.equal(entity.resolutionStatus, "resolvedUnambiguous");
        assert.equal(entity.records.length, 2);
        for (const record of entity.records) {
            assert.match(record.before.gitBlob, /^[a-f0-9]{40}$/);
            assert.match(record.after.gitBlob, /^[a-f0-9]{40}$/);
            assert.match(record.before.rawArtifactSha256, /^[a-f0-9]{64}$/);
            assert.match(record.after.rawArtifactSha256, /^[a-f0-9]{64}$/);
            assert.equal(record.comparison.status, "rawRecordMatch");
            assert.equal(record.comparison.changedFieldCount, 0);
            assert.deepEqual(record.comparison.fieldDiffs, []);
        }
    }
});

test("Traveler variants remain individually evidenced but unresolved for both local IDs", () => {
    const snapshot = capture.buildSnapshot();
    const ambiguities = snapshot.claim.variantAmbiguities;
    assert.deepEqual(ambiguities.map((item) => item.entityId), ["10000005", "10000007"]);
    for (const ambiguity of ambiguities) {
        assert.equal(ambiguity.resolutionStatus, "unresolvedVariantAmbiguity");
        assert.equal(ambiguity.canonicalMapping, null);
        assert.deepEqual(ambiguity.candidateVariants, capture.travelerVariants);
        assert.equal(ambiguity.candidateVariantCount, 7);
    }
    assert.deepEqual(snapshot.claim.travelerVariantEvidence.map((item) => item.variant), capture.travelerVariants);
    for (const variant of snapshot.claim.travelerVariantEvidence) {
        assert.equal(variant.comparisonPolicy, "sameVariantPathOnly");
        assert.equal(variant.crossVariantComparison, "forbidden");
        assert.equal(variant.records.length, 2);
        for (const record of variant.records) {
            assert.ok(["rawRecordMatch", "rawRecordChanged", "sourcePathMissing"].includes(record.comparison.status));
            assert.equal(record.comparison.status === "sourcePathMissing", record.comparison.comparisonEligible === false);
        }
    }
    const cryo = snapshot.claim.travelerVariantEvidence.find((item) => item.variant === "cryo");
    const cryoConstellations = cryo.records.find((record) => record.recordKind === "constellations");
    assert.equal(cryoConstellations.before.status, "sourcePathMissing");
    assert.equal(cryoConstellations.comparison.status, "sourcePathMissing");
    assert.equal(cryoConstellations.after.status, undefined);
    assert.equal(snapshot.claim.coverage.crossVariantComparisons, 0);
});

test("checked-in behavior transition shard is deterministic and validates its raw files", () => {
    const checkedIn = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
    assert.deepEqual(checkedIn, capture.buildSnapshot());
    const validation = capture.validateBehaviorEntitySnapshot(checkedIn, { repositoryRoot });
    assert.equal(validation.valid, true, validation.reasons.join("; "));
});

test("behavior transition validation rejects forged raw or comparison evidence", () => {
    const snapshot = capture.buildSnapshot();
    snapshot.claim.resolvedEntities[0].records[0].before.gitBlob = "0".repeat(40);
    snapshot.fieldDigest = require("../../scripts/genshinVersionEvidenceValidation.cjs").digestStable(snapshot.claim);
    const rawBinding = capture.validateBehaviorEntitySnapshot(snapshot, { repositoryRoot });
    assert.equal(rawBinding.valid, false);
    assert.ok(rawBinding.reasons.some((reason) => reason.includes("gitBlobMismatch")));

    const comparison = capture.buildSnapshot();
    comparison.claim.resolvedEntities[0].records[0].comparison.status = "rawRecordChanged";
    comparison.fieldDigest = require("../../scripts/genshinVersionEvidenceValidation.cjs").digestStable(comparison.claim);
    const forgedComparison = capture.validateBehaviorEntitySnapshot(comparison, { repositoryRoot });
    assert.equal(forgedComparison.valid, false);
    assert.ok(forgedComparison.reasons.some((reason) => reason.includes("comparisonInvalid")));
});

test("behavior transition schema declares strict source and ambiguity fields", () => {
    const schemaPath = path.join(repositoryRoot, "games", "genshin", "data", "schema", "version-transition-behavior-entity-snapshot.schema.json");
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    assert.equal(schema.$id, "genshin-version-transition-behavior-entity-snapshot.schema.json");
    assert.ok(schema.$defs.artifact.properties.gitBlob);
    assert.ok(schema.$defs.artifact.properties.rawArtifactSha256);
    assert.equal(schema.$defs.claim.properties.travelerVariantEvidence.minItems, 7);
    assert.equal(schema.$defs.claim.properties.variantAmbiguities.minItems, 2);
});
