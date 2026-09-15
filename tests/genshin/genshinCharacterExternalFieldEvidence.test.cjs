"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const {
    buildDataset,
    defaultDataRoot,
    defaultOutputFile,
    stableJson
} = require("../../scripts/genshinCharacterExternalFieldEvidenceGenerate.cjs");
const {
    auditDataset,
    defaultReportJsonPath,
    defaultReportMarkdownPath
} = require("../../scripts/genshinCharacterExternalFieldEvidenceAudit.cjs");

function loadArtifact() {
    return JSON.parse(fs.readFileSync(defaultOutputFile, "utf8"));
}

test("external evidence covers the 8 pilot and 25 talent-gap character priorities", () => {
    const artifact = loadArtifact();
    assert.equal(artifact.kind, "genshinCharacterExternalFieldEvidence");
    assert.deepEqual(artifact.pilotIds, [
        "10000026", "10000031", "10000037", "10000046",
        "10000058", "10000089", "10000094", "10000098"
    ]);
    assert.equal(artifact.talentGapIds.length, 25);
    assert.equal(artifact.summary.pilotBehaviorSpecs, 56);
    assert.equal(artifact.summary.talentGapSpecs, 73);
    assert.equal(artifact.summary.candidates, 129);
    assert.equal(artifact.summary.externalSources, 78);
    assert.equal(artifact.summary.evidenceMappings, 258);
    assert.deepEqual(artifact.summary.verificationByStatus, { needsReview: 129 });
    assert.deepEqual(artifact.summary.runtimeByStatus, { blocked: 129 });
    assert.equal(artifact.summary.canonical, 0);
    assert.equal(artifact.summary.gameVersion, null);
});

test("external locators are semantic evidence only and never publish field values", () => {
    const artifact = loadArtifact();
    Object.values(artifact.externalSources).forEach((source) => {
        assert.equal(source.gameVersion, null, source.id);
        assert.ok(source.blockedReasons.includes("gameVersionNotExplicit"), source.id);
        assert.equal(source.supportsClaimValue, false, source.id);
        assert.equal(source.tokenMatchingUsed, false, source.id);
        assert.match(source.revision, /^[a-f0-9]{40}$/, source.id);
    });
    Object.values(artifact.candidates).forEach((candidate) => {
        assert.equal(candidate.verification.status, "needsReview", candidate.id);
        assert.equal(candidate.verification.canonical, 0, candidate.id);
        assert.equal(candidate.verification.runtimeStatus, "blocked", candidate.id);
        assert.equal(candidate.verification.gameVersion, null, candidate.id);
        assert.ok(candidate.verification.blockedReasons.includes("gameVersionNotExplicit"), candidate.id);
        assert.equal(candidate.semantic.tokenMatchingUsed, false, candidate.id);
        candidate.evidence.forEach((evidence) => {
            assert.equal(evidence.gameVersion, null, `${candidate.id}:${evidence.externalSourceId}`);
            assert.equal(evidence.supportsClaimValue, false, `${candidate.id}:${evidence.externalSourceId}`);
            assert.equal(evidence.semantic.supportsClaimValue, false, `${candidate.id}:${evidence.externalSourceId}`);
            assert.equal(evidence.semantic.tokenMatchingUsed, false, `${candidate.id}:${evidence.externalSourceId}`);
            assert.equal(evidence.verification.status, "needsReview");
            assert.equal(evidence.verification.canonical, 0);
            assert.equal(evidence.verification.runtimeStatus, "blocked");
        });
    });
});

test("source-index paths are mapped by component anchor and missing pins stay blocked", () => {
    const artifact = loadArtifact();
    const xiao = artifact.candidates["behavior:10000026:talent:skill"];
    assert.ok(xiao);
    const xiaoGcsim = artifact.externalSources[xiao.externalSourceIds.find((id) => id.includes(":gcsim:"))];
    const xiaoOptimizer = artifact.externalSources[xiao.externalSourceIds.find((id) => id.includes(":genshinOptimizer:"))];
    assert.equal(xiaoGcsim.locator.path, "internal/characters/xiao");
    assert.equal(xiaoGcsim.locator.pathKind, "directory");
    assert.equal(xiaoOptimizer.locator.path, "libs/gi/sheets/src/Characters/Xiao/index.tsx");
    assert.equal(xiaoOptimizer.locator.pathKind, "file");
    assert.equal(xiao.semantic.strategy, "sourceIndexCharacterIdAndComponentAnchor");
    assert.equal(xiao.semantic.component, "skill");
    assert.equal(xiao.semantic.tokenMatchingUsed, false);

    const missing = artifact.candidates["talent-gap-spec:10000132:passive_1"];
    assert.ok(missing);
    missing.externalSourceIds.forEach((id) => {
        assert.ok(artifact.externalSources[id].blockedReasons.includes("externalLocatorMissing"), id);
    });
});

test("audit and checked-in report are deterministic and preserve the gcsim revision mismatch", () => {
    const artifact = loadArtifact();
    const first = buildDataset({ dataRoot: defaultDataRoot });
    const second = buildDataset({ dataRoot: defaultDataRoot });
    assert.equal(stableJson(first), stableJson(second));
    assert.equal(stableJson(artifact), stableJson(first));
    const audit = auditDataset({ dataRoot: defaultDataRoot, outputFile: defaultOutputFile });
    assert.equal(audit.status, "passed", audit.errors.join("\n"));
    assert.deepEqual(audit.errors, []);
    assert.equal(audit.summary.contract.canonicalViolations, 0);
    assert.equal(audit.summary.contract.gameVersionViolations, 0);
    assert.equal(audit.summary.contract.tokenMatchingViolations, 0);
    assert.equal(fs.existsSync(defaultReportJsonPath), true);
    assert.equal(fs.existsSync(defaultReportMarkdownPath), true);
    const report = JSON.parse(fs.readFileSync(defaultReportJsonPath, "utf8"));
    assert.equal(report.status, "passed");
    assert.match(fs.readFileSync(defaultReportMarkdownPath, "utf8"), /gameVersion: null/);
    assert.equal(artifact.projects.gcsim.sourceCatalogRevision, "3647a07a7cc3004bc1e79d9bb5f7444de20dceaa");
    assert.equal(artifact.projects.gcsim.revision, "6d373678e949d30e91d390f418d930de09eeb547");
});
