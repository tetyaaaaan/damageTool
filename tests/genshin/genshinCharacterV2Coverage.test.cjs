"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    buildDataset,
    defaultDataRoot,
    defaultOutputFile,
    stableJson
} = require("../../scripts/genshinCharacterV2CoverageGenerate.cjs");
const { auditCoverage } = require("../../scripts/genshinCharacterV2CoverageAudit.cjs");

function loadCoverage() {
    return JSON.parse(fs.readFileSync(defaultOutputFile, "utf8"));
}

test("character v2 coverage inventories all five layers for 117 IDs", () => {
    const coverage = loadCoverage();
    assert.equal(coverage.kind, "genshinCharacterV2Coverage");
    assert.equal(Object.keys(coverage.characters).length, 117);
    assert.deepEqual(coverage.summary.componentCoverage, {
        rawTalents: { present: 117, missing: 0 },
        rawConstellations: { present: 117, missing: 0 },
        talentScalings: { present: 117, missing: 0 },
        talentModifiers: { present: 93, missing: 24 },
        constellationModifiers: { present: 117, missing: 0 }
    });
    assert.equal(coverage.summary.canonical, 0);
    Object.values(coverage.characters).forEach((character) => {
        assert.equal(character.canonical, 0);
        assert.equal(character.sourcePointers.length, 6);
        character.sourcePointers.forEach((pointer) => assert.ok(coverage.sourceRecords[pointer.sourceId], pointer.sourceId));
        assert.deepEqual(Object.keys(character.components).sort(), [
            "constellationModifiers",
            "rawConstellations",
            "rawTalents",
            "talentModifiers",
            "talentScalings"
        ]);
    });
});

test("the 24 talent-modifier gaps retain explicit raw-text evidence", () => {
    const coverage = loadCoverage();
    const missing = coverage.missingTalentModifiers;
    assert.equal(missing.length, 24);
    assert.equal(new Set(missing.map((entry) => entry.characterId)).size, 24);
    assert.ok(missing.every((entry) => entry.status === "unstructured"));
    assert.ok(missing.every((entry) => entry.reasons.includes("RAW_TALENT_TEXT_PRESENT")));
    assert.ok(missing.every((entry) => entry.reasons.includes("TALENT_MODIFIER_RECORD_MISSING")));
    assert.ok(missing.every((entry) => entry.evidence.rawTextFieldCount > 0));
    assert.equal(missing.some((entry) => entry.status === "noEffect"), false);
    assert.equal(missing.some((entry) => entry.status === "uninvestigated"), false);
});

test("coverage artifact is deterministic and audit-clean", () => {
    const disk = loadCoverage();
    const generatedA = buildDataset({ dataRoot: defaultDataRoot });
    const generatedB = buildDataset({ dataRoot: defaultDataRoot });
    assert.equal(stableJson(generatedA), stableJson(generatedB));
    assert.equal(stableJson(disk), stableJson(generatedA));
    const report = auditCoverage({ dataRoot: defaultDataRoot, outputFile: defaultOutputFile });
    assert.equal(report.status, "passed");
    assert.deepEqual(report.errors, []);
    assert.equal(report.summary.deterministic, true);
});
