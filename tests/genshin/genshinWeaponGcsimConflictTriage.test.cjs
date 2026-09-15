"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const dataRoot = path.join(root, "games", "genshin", "data");
const evidencePath = path.join(dataRoot, "v2", "weapons", "external-evidence.json");
const candidatePath = path.join(dataRoot, "v2", "weapons", "spec-candidates.json");
const sourceCatalogPath = path.join(dataRoot, "v2", "source-catalog.json");
const registryPath = path.join(dataRoot, "calc", "weapon-effect-registry.json");
const artifactPath = path.join(dataRoot, "v2", "weapons", "conflict-triage.json");
const reportPath = path.join(root, "reports", "genshin-weapon-gcsim-conflict-triage.json");
const triage = require(path.join(root, "scripts", "genshinWeaponGcsimConflictTriage.cjs"));

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function inputs() {
    return {
        evidence: readJson(evidencePath),
        candidates: readJson(candidatePath),
        sourceCatalog: readJson(sourceCatalogPath),
        registry: readJson(registryPath)
    };
}

test("weapon gcsim conflict triage is deterministic and covers every observed row", () => {
    const expected = triage.buildTriage({ evidencePath, candidatePath, sourceCatalogPath, legacyRegistryPath: registryPath });
    const actual = readJson(artifactPath);
    assert.equal(triage.stableJson(actual), triage.stableJson(expected));
    assert.equal(actual.summary.candidateValueConflicts, 0);
    assert.equal(actual.summary.semanticConflicts, 0);
    assert.equal(actual.summary.mechanicallyResolvedRows, 35);
    assert.equal(actual.summary.unmappedSourceFields, 0);
    assert.deepEqual(actual.summary.byClassification, {
        resolvedMapping: 33,
        genuineConflict: 0,
        scopeMismatch: 0,
        parserLimitation: 0,
        registryLifecycleMapped: 4,
        schemaGap: 0,
        unmapped: 0
    });
    assert.equal(actual.summary.genuineValueConflicts, 0);
    assert.equal(actual.summary.canonicalEligibleItems, 0);
    assert.equal(actual.summary.candidatesPromoted, 0);
    assert.equal(new Set(actual.conflicts.map((item) => item.key)).size, 0);
    assert.equal(new Set(actual.reconciled.map((item) => item.key)).size, 33);
    assert.equal(new Set(actual.unmapped.map((item) => item.key)).size, 4);
});

test("triage audit passes and preserves pinned source/candidate references", () => {
    const values = inputs();
    const artifact = readJson(artifactPath);
    const report = triage.auditTriage({ triage: artifact, ...values });
    assert.equal(report.status, "passed", report.errors.join("\n"));
    assert.deepEqual(report, readJson(reportPath));
    for (const item of [...artifact.conflicts, ...artifact.unmapped]) {
        assert.equal(item.canonicalEligibility, false, item.key);
        assert.equal(item.promotionDecision, "blocked", item.key);
        assert.equal(item.source.provider, values.sourceCatalog.sources.gcsim.provider, item.key);
        assert.equal(item.source.revision, values.sourceCatalog.sources.gcsim.revision, item.key);
        assert.equal(item.source.sha256, values.sourceCatalog.records[item.sourceRecordId].sha256, item.key);
    }
});

test("field-aware comparison separates projection false positives from scope/parser differences", () => {
    const artifact = readJson(artifactPath);
    const byKey = Object.fromEntries(artifact.conflicts.map((item) => [item.key, item]));
    const reconciled = Object.fromEntries(artifact.reconciled.map((item) => [item.key, item]));
    assert.equal(byKey["gcsim:weapon:11503:w_11503_damage_1:unit"], undefined);
    const evidence = readJson(evidencePath);
    const resolvedUnit = evidence.records["gcsim:weapon:11503"].fields.find((field) => field.candidateId === "w_11503_damage_1" && field.field === "unit");
    assert.equal(resolvedUnit.claimComparison.valueMatch, true);
    assert.equal(resolvedUnit.claimComparison.comparisonBasis, "fieldUnit");
    assert.equal(reconciled["gcsim:weapon:11503:w_11503_damage_3:unit"].previousClassification, "scopeMismatch");
    assert.equal(reconciled["gcsim:weapon:11518:w_11518_stat_3:unit"].previousClassification, "parserLimitation");
    assert.ok(artifact.mappingCorrections.some((item) => item.resolutionCode === "SHIELD_CAPACITY_CANDIDATE_RECLASSIFIED" && item.retainedAs.includes("shieldGeneration/shieldCapacity")));
    assert.ok(artifact.mappingCorrections.some((item) => item.resolutionCode === "GCSIM_CD_ATTRIBUTE_IDENTIFIED_AS_CRITICAL_DAMAGE" && item.formerInterpretation === "burstCooldownReduction"));
    assert.equal(byKey["gcsim:weapon:15502:w_15502_damageBonus_fc388315:stack"], undefined);
    assert.equal(reconciled["gcsim:weapon:15516:w_15516_damageBonus_1923e8e9:unit"].previousClassification, "scopeMismatch");
    assert.equal(artifact.unmapped.filter((item) => item.classification === "registryLifecycleMapped").length, 4);
    assert.equal(artifact.unmapped.filter((item) => item.classification === "schemaGap").length, 0);
});
