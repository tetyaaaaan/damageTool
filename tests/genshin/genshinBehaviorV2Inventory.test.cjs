"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const generator = require(path.join(root, "scripts", "genshinBehaviorV2InventoryGenerate.cjs"));
const auditor = require(path.join(root, "scripts", "genshinBehaviorV2InventoryAudit.cjs"));

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

test("behavior inventory covers all 117 raw characters and excludes eight pilots", () => {
    const disk = readJson("games/genshin/data/v2/characters/behavior-inventory.json");
    assert.equal(disk.kind, "genshinBehaviorV2Inventory");
    assert.equal(disk.summary.characters, 117);
    assert.equal(disk.summary.pilotCharacters, 8);
    assert.equal(disk.summary.expansionCharacters, 109);
    assert.equal(Object.keys(disk.characters).length, 117);
    assert.equal(Object.keys(disk.candidates).length, 1694);
    assert.deepEqual(disk.summary.candidateStatusCounts, { candidate: 1083, unknown: 611 });
    assert.deepEqual(disk.summary.candidateKindCounts, {
        count: 671,
        timing: 437,
        icd: 332,
        refresh: 192,
        charge: 62
    });
    generator.PILOT_IDS.forEach((id) => {
        assert.equal(disk.characters[id].pilot, true);
        assert.equal(disk.characters[id].candidateIds.length, 0);
    });
    Object.values(disk.candidates).forEach((candidate) => {
        assert.equal(generator.PILOT_IDS.includes(candidate.entity.id), false, candidate.id);
        assert.ok(["candidate", "unknown"].includes(candidate.status));
        assert.equal(candidate.reviewStatus, "needsReview");
        assert.equal(candidate.verification.status, "needsReview");
        assert.equal(candidate.verification.sourceAgreement, "singleSource");
    });
});

test("source pointers and unknown candidates preserve evidence without inferred values", () => {
    const disk = readJson("games/genshin/data/v2/characters/behavior-inventory.json");
    assert.equal(disk.summary.rawFields, 1640);
    assert.equal(disk.summary.sourceRecords, 1757);
    Object.values(disk.candidates).forEach((candidate) => {
        const source = disk.sourceRecords[candidate.sourceRefs[0]];
        assert.ok(source, candidate.id);
        assert.equal(candidate.sourcePointer.sourceId, candidate.sourceRefs[0]);
        assert.equal(candidate.sourcePointer.textDigest, source.integrity.digest);
        assert.equal(source.integrity.algorithm, "sha256");
        if (candidate.status === "unknown") {
            assert.equal(candidate.value, null);
            assert.equal(candidate.unit, "unknown");
            assert.equal(candidate.fieldPath, null);
            assert.equal(candidate.operation, null);
            assert.equal(candidate.extraction.method, "signalOnly");
        } else {
            assert.ok(candidate.fieldPath);
            assert.ok(candidate.extraction.method === "deterministicParser");
        }
    });
});

test("inventory generation and audit are deterministic and pilot-clean", () => {
    const disk = readJson("games/genshin/data/v2/characters/behavior-inventory.json");
    const first = generator.buildDataset({ dataRoot: generator.defaultDataRoot });
    const second = generator.buildDataset({ dataRoot: generator.defaultDataRoot });
    assert.equal(generator.stableJson(first), generator.stableJson(second));
    assert.equal(generator.stableJson(disk), generator.stableJson(first));
    const report = auditor.auditBehaviorInventory({
        dataRoot: generator.defaultDataRoot,
        outputFile: generator.defaultOutputFile
    });
    assert.equal(report.status, "passed", report.errors.join("\n"));
    assert.deepEqual(report.errors, []);
    assert.equal(report.summary.coverage.characters, 1);
    assert.equal(report.summary.coverage.expansionCharacters, 1);
    assert.equal(report.summary.pilotExclusion.leakedCandidates, 0);
    assert.equal(report.summary.pilotExclusion.canonical, 0);
    assert.equal(report.summary.contract.inputDigestMismatches, 0);
});
