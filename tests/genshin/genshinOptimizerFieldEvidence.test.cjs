"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const {
    buildEvidence,
    defaultOutputPath,
    defaultDataRoot
} = require("../../scripts/genshinOptimizerFieldEvidenceGenerate.cjs");
const {
    auditEvidence,
    defaultReportJsonPath,
    defaultReportMarkdownPath
} = require("../../scripts/genshinOptimizerFieldEvidenceAudit.cjs");

function loadArtifact() {
    return JSON.parse(fs.readFileSync(defaultOutputPath, "utf8"));
}

test("bounded GO evidence has pinned paths/SHA and semantic fields", () => {
    const artifact = loadArtifact();
    assert.equal(artifact.kind, "genshinOptimizerFieldEvidence");
    assert.equal(artifact.project.revision, "0c9bde8f99ec1561e66aa0114668e8cdc0b8aca2");
    assert.equal(artifact.project.gameVersion, null);
    assert.equal(artifact.project.providerIndependence, "correlated");
    assert.equal(artifact.project.independenceGroup, "GenshinData-derived");
    assert.equal(artifact.summary.sourceRecords, 4);
    assert.equal(artifact.summary.weaponSourceRecords, 2);
    assert.equal(artifact.summary.artifactSourceRecords, 2);
    assert.equal(artifact.summary.fieldRecords, 10);
    assert.equal(artifact.summary.eligibleFields, 8);
    assert.equal(artifact.summary.needsReviewFields, 2);
    assert.equal(artifact.summary.supportsClaimValueFields, 8);
    assert.equal(artifact.summary.canonicalEligibleFields, 0);
    assert.equal(artifact.summary.canonicalEligibleCandidates, 0);
    Object.values(artifact.sourceRecords).forEach((source) => {
        assert.match(source.sha256, /^[a-f0-9]{64}$/);
        assert.match(source.path, /^libs\/gi\/sheets\/src\/(Weapons|Artifacts)\//);
        assert.equal(source.gameVersion, null);
        assert.equal(source.gameVersionVerified, false);
        assert.equal(source.providerIndependence, "correlated");
        assert.equal(source.independenceGroup, "GenshinData-derived");
        assert.equal(source.sourceMaterialization.materialized, false);
        assert.ok(source.sourceMaterialization.blockedReasons.includes("gameVersionNotExplicit"));
        assert.ok(source.sourceMaterialization.blockedReasons.includes("providerNotIndependent"));
    });
});

test("field evidence is named-assignment based and fail-closed for canonical/runtime", () => {
    const artifact = loadArtifact();
    const mapped = artifact.fields.filter((field) => field.status === "eligible");
    assert.equal(mapped.length, 8);
    mapped.forEach((field) => {
        assert.equal(field.supportsClaimValue, true, field.candidateId);
        assert.equal(field.gameVersionVerified, false, field.candidateId);
        assert.equal(field.canonicalEligibility, false, field.candidateId);
        assert.equal(field.providerIndependence, "correlated", field.candidateId);
        assert.equal(field.extractionMethod.type, "semantic-ts-assignment", field.candidateId);
        assert.equal(field.extractionMethod.tokenMatchingUsed, false, field.candidateId);
        assert.ok(field.locator.lineStart > 0, field.candidateId);
        assert.ok(field.locator.anchor.length > 0, field.candidateId);
        assert.equal(field.claimComparison.valueMatch, true, field.candidateId);
        assert.ok(field.canonicalBlockedReasons.includes("gameVersionMissing"), field.candidateId);
        assert.ok(field.canonicalBlockedReasons.includes("providerNotIndependent"), field.candidateId);
    });
    const unresolved = artifact.fields.filter((field) => field.status === "needsReview");
    assert.equal(unresolved.length, 2);
    unresolved.forEach((field) => {
        assert.equal(field.supportsClaimValue, false, field.candidateId);
        assert.ok(field.reason, field.candidateId);
    });
});

test("generator and audit are deterministic and reports are present", () => {
    const artifact = loadArtifact();
    const first = buildEvidence({ dataRoot: defaultDataRoot });
    const second = buildEvidence({ dataRoot: defaultDataRoot });
    assert.deepEqual(first, second);
    assert.deepEqual(artifact, first);
    const audit = auditEvidence({ evidence: artifact });
    assert.equal(audit.status, "passed", audit.errors.join("\n"));
    assert.deepEqual(audit.errors, []);
    assert.equal(audit.summary.canonicalEligibleFields, 0);
    assert.equal(audit.summary.gameVersionMissingSourceRecords, 4);
    assert.equal(fs.existsSync(defaultReportJsonPath), true);
    assert.equal(fs.existsSync(defaultReportMarkdownPath), true);
    const report = JSON.parse(fs.readFileSync(defaultReportJsonPath, "utf8"));
    assert.equal(report.status, "passed");
    assert.match(fs.readFileSync(defaultReportMarkdownPath, "utf8"), /providerIndependence=correlated/);
});
