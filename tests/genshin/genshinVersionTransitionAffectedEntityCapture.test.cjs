"use strict";

const fs = require("node:fs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSnapshot, outputPath } = require("../../scripts/genshinVersionTransitionAffectedEntityCapture.cjs");
const { validateAffectedEntitySnapshot } = require("../../scripts/genshinVersionEvidenceValidation.cjs");
const path = require("node:path");

test("affected entity snapshot binds both versions and remains fail closed", () => {
    const snapshot = buildSnapshot();
    assert.equal(snapshot.summary.entities, 4);
    assert.equal(snapshot.summary.records, 8);
    assert.equal(snapshot.claim.coverage.officialAffectedEntityCoverage, "complete");
    assert.equal(snapshot.claim.coverage.repositoryCandidateCoverage, "partial");
    assert.equal(snapshot.gateEligibility.canSatisfyCompleteEntityDiff, false);
    assert.equal(snapshot.gateEligibility.canIssueEligibilityCertificate, false);
    assert.equal(snapshot.summary.certificateEligibleClaims, 0);
    assert.ok(snapshot.claim.records.every((record) => /^[a-f0-9]{64}$/.test(record.before.rawArtifactDigest)));
    assert.ok(snapshot.claim.records.every((record) => /^[a-f0-9]{64}$/.test(record.after.rawArtifactDigest)));
    assert.equal(validateAffectedEntitySnapshot(snapshot, { repositoryRoot: path.resolve(__dirname, "../..") }).valid, true);
});

test("affected entity validation rejects forged raw and comparison bindings", () => {
    const snapshot = buildSnapshot();
    snapshot.claim.records[0].comparison.status = "rawRecordChanged";
    snapshot.fieldDigest = require("../../scripts/genshinVersionEvidenceValidation.cjs").digestStable(snapshot.claim);
    const validation = validateAffectedEntitySnapshot(snapshot, { repositoryRoot: path.resolve(__dirname, "../..") });
    assert.equal(validation.valid, false);
    assert.ok(validation.reasons.includes("fieldComparisonInvalid:0"));
});

test("checked-in affected entity snapshot is deterministic", () => {
    assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, "utf8")), buildSnapshot());
});
