"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const {
    buildDataset,
    componentSymbolCandidates,
    declarationMatches,
    defaultDataRoot,
    defaultInputFile,
    defaultOutputFile,
    stableJson
} = require("../../scripts/genshinCharacterFieldMaterializationGenerate.cjs");
const {
    auditDataset,
    defaultReportJsonPath,
    defaultReportMarkdownPath
} = require("../../scripts/genshinCharacterFieldMaterializationAudit.cjs");

function loadArtifact() {
    return JSON.parse(fs.readFileSync(defaultOutputFile, "utf8"));
}

test("field materialization covers the pilot/talent-gap union without promoting values", () => {
    const artifact = loadArtifact();
    assert.equal(artifact.kind, "genshinCharacterFieldMaterialization");
    assert.equal(artifact.summary.pilotCharacters, 8);
    assert.equal(artifact.summary.talentGapCharacters, 25);
    assert.equal(artifact.summary.characters, 31);
    assert.equal(artifact.summary.candidates, 129);
    assert.equal(artifact.summary.externalSources, 78);
    assert.equal(artifact.summary.fieldEvidence, 258);
    assert.equal(artifact.summary.materializedSources, 74);
    assert.equal(artifact.summary.pathVerifiedSources, 74);
    assert.equal(artifact.summary.namedSymbolEvidence, 25);
    assert.equal(artifact.summary.gameVersionVerified, 0);
    assert.equal(artifact.summary.canonical, 0);
    assert.deepEqual(artifact.summary.verificationByStatus, { needsReview: 258 });
    assert.deepEqual(artifact.summary.runtimeByStatus, { blocked: 258 });
});

test("source-index and source-catalog revisions remain separate and missing pins stay blocked", () => {
    const artifact = loadArtifact();
    assert.equal(artifact.revisions.gcsim.comparison, "mismatch");
    assert.equal(artifact.revisions.gcsim.sourceIndex.revision, "6d373678e949d30e91d390f418d930de09eeb547");
    assert.equal(artifact.revisions.gcsim.sourceCatalog.revision, "3647a07a7cc3004bc1e79d9bb5f7444de20dceaa");
    assert.equal(artifact.revisions.genshinOptimizer.sourceCatalog.revision, null);
    assert.equal(artifact.revisions.genshinOptimizer.comparison, "incomplete");
    const xiao = artifact.materializations["external-source:gcsim:10000026:character-implementation"];
    assert.equal(xiao.locator.path, "internal/characters/xiao");
    assert.equal(xiao.locator.pathKind, "directory");
    assert.ok(xiao.blockedReasons.includes("sourceCatalogRevisionMismatch"));
    const missing = artifact.materializations["external-source:gcsim:10000132:character-implementation"];
    assert.equal(missing.locator.path, null);
    assert.ok(missing.blockedReasons.includes("externalLocatorMissing"));
    Object.values(artifact.materializations).forEach((source) => {
        assert.equal(source.gameVersion, null, source.id);
        assert.equal(source.gameVersionVerified, false, source.id);
        assert.equal(source.supportsClaimValue, false, source.id);
        assert.equal(source.tokenMatchingUsed, false, source.id);
        assert.equal(source.proseMatchingUsed, false, source.id);
    });
});

test("field evidence is candidate/source complete and fail-closed", () => {
    const artifact = loadArtifact();
    artifact.fieldEvidence.forEach((field) => {
        assert.ok(artifact.materializations[field.sourceId], field.sourceId);
        assert.equal(field.gameVersion, null, `${field.candidateId}:${field.sourceId}`);
        assert.equal(field.gameVersionVerified, false, `${field.candidateId}:${field.sourceId}`);
        assert.equal(field.supportsClaimValue, false, `${field.candidateId}:${field.sourceId}`);
        assert.equal(field.extraction.value, null, `${field.candidateId}:${field.sourceId}`);
        assert.equal(field.extraction.supportsClaimValue, false, `${field.candidateId}:${field.sourceId}`);
        assert.equal(field.semantic.tokenMatchingUsed, false, `${field.candidateId}:${field.sourceId}`);
        assert.equal(field.semantic.proseMatchingUsed, false, `${field.candidateId}:${field.sourceId}`);
        assert.equal(field.verification.status, "needsReview");
        assert.equal(field.verification.canonical, 0);
        assert.equal(field.verification.runtimeStatus, "blocked");
        assert.ok(field.verification.blockedReasons.includes("gameVersionNotExplicit"));
        assert.ok(field.verification.blockedReasons.includes("namedDeclarationValueExtractionNotImplemented"));
    });
});

test("named declaration scanner records symbols and never values or prose matches", () => {
    const declarations = declarationMatches([
        "// const ignored = 3",
        "const skill = { multiplier: 1.2 }",
        "func Constellation6() {}",
        "foo := 42",
        "constellation6 := 9"
    ].join("\n"), "go");
    assert.deepEqual(declarations.map((entry) => [entry.name, entry.kind, entry.line]), [
        ["skill", "const", 2],
        ["Constellation6", "func", 3],
        ["foo", "assignment", 4],
        ["constellation6", "assignment", 5]
    ]);
    declarations.forEach((entry) => assert.equal(Object.prototype.hasOwnProperty.call(entry, "value"), false));
    assert.ok(componentSymbolCandidates("constellation.6").includes("c6"));
    assert.ok(componentSymbolCandidates("skill").includes("skill"));
});

test("generator and audit are deterministic while checked-in materialization stays auditable", () => {
    const artifact = loadArtifact();
    const roots = {
        gcsim: process.env.GENSHIN_GCSIM_ROOT || null,
        genshinOptimizer: process.env.GENSHIN_OPTIMIZER_ROOT || null
    };
    const first = buildDataset({ dataRoot: defaultDataRoot, inputFile: defaultInputFile, outputFile: defaultOutputFile, roots });
    const second = buildDataset({ dataRoot: defaultDataRoot, inputFile: defaultInputFile, outputFile: defaultOutputFile, roots });
    assert.equal(stableJson(first), stableJson(second));
    if (roots.gcsim && roots.genshinOptimizer) assert.equal(stableJson(artifact), stableJson(first));
    const audit = auditDataset({ dataRoot: defaultDataRoot, inputFile: defaultInputFile, outputFile: defaultOutputFile });
    assert.equal(audit.status, "passed", audit.errors.join("\n"));
    assert.equal(audit.summary.contract.policyViolations, 0);
    assert.equal(audit.summary.contract.gameVersionViolations, 0);
    assert.equal(audit.summary.contract.canonicalViolations, 0);
    assert.equal(fs.existsSync(defaultReportJsonPath), true);
    assert.equal(fs.existsSync(defaultReportMarkdownPath), true);
    assert.match(fs.readFileSync(defaultReportMarkdownPath, "utf8"), new RegExp(`Materialized/path-verified locators: ${artifact.summary.materializedSources}/${artifact.summary.pathVerifiedSources}`));
});
