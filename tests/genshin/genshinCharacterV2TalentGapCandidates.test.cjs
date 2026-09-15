"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const {
    buildDataset,
    defaultDataRoot,
    defaultOutputFile,
    stableJson
} = require("../../scripts/genshinCharacterV2TalentGapCandidatesGenerate.cjs");
const { auditCoverage } = require("../../scripts/genshinCharacterV2TalentGapCandidatesAudit.cjs");

function loadArtifact() {
    return JSON.parse(fs.readFileSync(defaultOutputFile, "utf8"));
}

function containsNumber(value) {
    if (typeof value === "number") return true;
    if (Array.isArray(value)) return value.some(containsNumber);
    if (!value || typeof value !== "object") return false;
    return Object.values(value).some(containsNumber);
}

test("talent-gap candidates cover all 24 missing character IDs and every raw passive", () => {
    const artifact = loadArtifact();
    assert.equal(artifact.kind, "genshinCharacterV2TalentGapCandidates");
    assert.equal(artifact.summary.characters, 24);
    assert.equal(artifact.summary.passiveSourceRecords, 70);
    assert.equal(artifact.summary.effectSpecCandidates, 70);
    assert.equal(artifact.summary.canonical, 0);
    assert.deepEqual(artifact.summary.byVerificationStatus, { needsReview: 70 });
    assert.deepEqual(artifact.summary.byRuntimeStatus, { blocked: 70 });
    assert.equal(Object.keys(artifact.byCharacter).length, 24);
    assert.equal(Object.keys(artifact.sourceRecords).length, 70);
    assert.equal(Object.keys(artifact.specs).length, 70);
    Object.entries(artifact.byCharacter).forEach(([characterId, character]) => {
        assert.equal(character.characterId, characterId);
        assert.equal(character.canonical, 0);
        assert.equal(character.sourceRecordIds.length, character.specIds.length);
        assert.equal(character.sourcePointers.length, character.sourceRecordIds.length);
        character.sourceRecordIds.forEach((sourceId) => assert.ok(artifact.sourceRecords[sourceId], sourceId));
        character.specIds.forEach((specId) => {
            assert.ok(artifact.specs[specId], specId);
            assert.equal(artifact.specs[specId].entity.id, characterId);
        });
    });
});

test("every candidate preserves raw text and keeps EffectSpec/runtime fields unknown or blocked", () => {
    const artifact = loadArtifact();
    Object.values(artifact.sourceRecords).forEach((source) => {
        assert.equal(source.kind, "primaryDataset");
        assert.equal(source.locator.dataset, "character-talents.json");
        assert.match(source.locator.field, /^passives\.\d+\.descriptionJa$/);
        assert.equal(source.integrity.algorithm, "sha256");
        assert.equal(source.integrity.digest.length, 64);
        assert.equal(typeof source.text, "string");
    });
    Object.values(artifact.specs).forEach((spec) => {
        assert.equal(spec.verification.status, "needsReview");
        assert.equal(spec.verification.sourceAgreement, "unknown");
        assert.equal(spec.runtime.status, "blocked");
        assert.deepEqual(spec.runtime.modifierIds, []);
        assert.equal(spec.runtime.generator, null);
        assert.equal(spec.effect.kind, "unknown");
        assert.deepEqual(spec.effect.targets, ["unknown"]);
        assert.equal(spec.effect.activation.status, "unknown");
        assert.equal(spec.effect.value.status, "unknown");
        assert.equal(spec.effect.snapshot, "unknown");
        assert.equal(spec.effect.offField, "unknown");
        assert.equal(spec.effect.area, "unknown");
        assert.equal(containsNumber(spec.effect), false);
        Object.values(spec.verification.claims).forEach((claim) => assert.equal(claim.status, "needsReview"));
    });
});

test("talent-gap generation and audit are deterministic", () => {
    const artifact = loadArtifact();
    const first = buildDataset({ dataRoot: defaultDataRoot });
    const second = buildDataset({ dataRoot: defaultDataRoot });
    assert.equal(stableJson(first), stableJson(second));
    assert.equal(stableJson(artifact), stableJson(first));
    const report = auditCoverage({ dataRoot: defaultDataRoot, outputFile: defaultOutputFile });
    assert.equal(report.status, "passed");
    assert.deepEqual(report.errors, []);
    assert.equal(report.summary.deterministic, true);
});
