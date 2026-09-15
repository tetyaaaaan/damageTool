"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const {
    KQM,
    EXPECTED_COUNT,
    buildEvidence,
    auditEvidence,
    defaultDataRoot,
    defaultOutputPath,
    defaultReportJsonPath,
    defaultReportMarkdownPath
} = require("../../scripts/genshinKqmArtifactEvidence.cjs");

function loadJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

test("KQM artifact evidence pins immutable source metadata and 50 two-piece fields", () => {
    const artifact = loadJson(defaultOutputPath);
    assert.equal(artifact.kind, "genshinKqmArtifactFieldEvidence");
    assert.equal(artifact.kqm.provider, KQM.provider);
    assert.equal(artifact.kqm.revision, KQM.revision);
    assert.equal(artifact.kqm.blob, KQM.blob);
    assert.match(artifact.kqm.fileSha256, /^[a-f0-9]{64}$/);
    assert.equal(artifact.kqm.fileSha256, KQM.fileSha256);
    assert.equal(artifact.kqm.gameVersion, null);
    assert.equal(artifact.kqm.canonicalStatus, "evidenceOnlyBlocked");
    assert.deepEqual(artifact.kqm.blockedReasons, ["gameVersionUnbound"]);
    assert.equal(artifact.summary.fieldComparisonCount, EXPECTED_COUNT);
    assert.equal(artifact.summary.sourceRecordCount, EXPECTED_COUNT);
    assert.equal(artifact.summary.fieldAgreementCount, EXPECTED_COUNT);
    assert.equal(artifact.summary.gameVersionBoundCount, 0);
    assert.equal(artifact.summary.gameVersionUnboundCount, EXPECTED_COUNT);
    assert.equal(artifact.summary.canonicalEligibleCount, 0);
});

test("every KQM count=2 claim compares deterministically and remains blocked", () => {
    const artifact = loadJson(defaultOutputPath);
    const ids = new Set();
    assert.equal(artifact.fields.length, EXPECTED_COUNT);
    for (const field of artifact.fields) {
        assert.equal(ids.has(field.candidateId), false, field.candidateId);
        ids.add(field.candidateId);
        assert.equal(field.pieceCount, 2, field.candidateId);
        assert.equal(field.status, "evidenceOnlyBlocked", field.candidateId);
        assert.equal(field.gameVersionStatus, "unbound", field.candidateId);
        assert.deepEqual(field.blockedReasons, ["gameVersionUnbound"], field.candidateId);
        assert.equal(field.canonicalEligibility, false, field.candidateId);
        assert.equal(field.sourceA.revision, KQM.revision, field.candidateId);
        assert.equal(field.sourceA.blob, KQM.blob, field.candidateId);
        assert.equal(field.sourceA.fileSha256, KQM.fileSha256, field.candidateId);
        assert.equal(field.sourceA.gameVersion, null, field.candidateId);
        assert.equal(field.sourceA.sourceField, "bonuses[count=2].desc", field.candidateId);
        assert.equal(field.comparison.fieldAgreement, true, field.candidateId);
        assert.equal(field.comparison.valueMatch, true, field.candidateId);
        assert.equal(field.comparison.unitMatch, true, field.candidateId);
        assert.equal(field.comparison.targetMatch, true, field.candidateId);
        assert.equal(field.comparison.conditionMatch, true, field.candidateId);
        assert.equal(field.comparison.pieceCountMatch, true, field.candidateId);
        assert.equal(field.extractionMethod.tokenMatchingUsed, false, field.candidateId);
    }
    assert.equal(ids.size, EXPECTED_COUNT);
});

test("generator and reports are deterministic", () => {
    const artifact = loadJson(defaultOutputPath);
    const first = buildEvidence({ dataRoot: defaultDataRoot });
    const second = buildEvidence({ dataRoot: defaultDataRoot });
    assert.deepEqual(first, second);
    assert.deepEqual(artifact, first);
    const audit = auditEvidence(artifact);
    assert.equal(audit.ok, true, audit.errors.join("\n"));
    assert.deepEqual(audit.errors, []);
    const report = loadJson(defaultReportJsonPath);
    assert.equal(report.kind, "genshinKqmArtifactEvidenceReport");
    assert.equal(report.status, "evidenceOnlyBlocked");
    assert.deepEqual(report.blockedReasons, ["gameVersionUnbound"]);
    assert.equal(report.audit.ok, true);
    const markdown = fs.readFileSync(defaultReportMarkdownPath, "utf8");
    assert.match(markdown, /evidenceOnlyBlocked/);
    assert.match(markdown, /gameVersionUnbound/);
    assert.match(markdown, /\| Candidate \| KQM artifact \|/);
});
