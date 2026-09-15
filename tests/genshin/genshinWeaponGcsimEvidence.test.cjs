"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const dataRoot = path.join(root, "games", "genshin", "data");
const evidencePath = path.join(dataRoot, "v2", "weapons", "external-evidence.json");
const catalogPath = path.join(dataRoot, "v2", "source-catalog.json");
const generator = require(path.join(root, "scripts", "genshinWeaponGcsimEvidenceGenerate.cjs"));
const auditor = require(path.join(root, "scripts", "genshinWeaponGcsimEvidenceAudit.cjs"));

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

test("pinned gcsim weapon evidence passes the field-level audit", () => {
    const evidence = readJson(evidencePath);
    const catalog = readJson(catalogPath);
    const report = auditor.auditEvidence({ evidence, sourceCatalog: catalog });
    assert.equal(report.status, "passed", report.errors.join("\n"));
    assert.equal(report.summary.sourceRecords, 9);
    assert.equal(report.summary.expectedSourceRecords, 9);
    assert.equal(report.summary.canonicalEligibleFields, 0);
    assert.equal(report.summary.canonicalEligibleCandidates, 0);
    assert.equal(report.summary.supportsClaimValueFields, evidence.summary.supportsClaimValueFields);
    assert.ok(report.summary.supportsClaimValueFields > 0);
    assert.equal(report.summary.candidateValueAgreements, evidence.summary.candidateValueAgreements);
    assert.equal(report.summary.candidateValueConflicts, evidence.summary.candidateValueConflicts);
    assert.equal(report.summary.candidateValueAgreements + report.summary.candidateValueConflicts, report.summary.supportsClaimValueFields);
    assert.equal(report.summary.candidateValueConflicts, 0);
    assert.equal(report.summary.registryMappedSourceFields, 4);
    assert.equal(report.summary.schemaGapSourceFields, 0);
    assert.equal(report.summary.unmappedSourceFields, 0);
    assert.equal(report.summary.gameVersionMissingSourceRecords, 9);
    assert.equal(report.summary.portableSourceFiles, 9);
    assert.equal(report.summary.absoluteSourceFiles, 0);
    assert.ok(report.summary.eligibleFields > 0);
    assert.ok(report.summary.unresolvedFields > 0);
});

test("each gcsim field record preserves independent provider/revision/SHA evidence", () => {
    const evidence = readJson(evidencePath);
    const catalog = readJson(catalogPath);
    const provider = catalog.sources.gcsim;
    for (const [sourceId, record] of Object.entries(evidence.records)) {
        const catalogRecord = catalog.records[sourceId];
        assert.ok(catalogRecord, sourceId);
        assert.equal(record.sourceRecord.provider, provider.provider);
        assert.equal(record.sourceRecord.revision, provider.revision);
        assert.equal(record.sourceRecord.path, catalogRecord.path);
        assert.equal(record.sourceFile, catalogRecord.path);
        assert.doesNotMatch(record.sourceFile, /^(?:[A-Za-z]:[\\/]|[\\/]{2}|[\\/])/);
        assert.doesNotMatch(record.sourceFile, /(?:^|[\\/])\.\.(?:[\\/]|$)/);
        assert.equal(record.sourceRecord.sha256, catalogRecord.sha256);
        assert.equal(record.sourceRecord.gameVersion, null);
        assert.equal(record.sourceRecord.gameVersionVerified, false);
        assert.equal(record.sourceRecord.providerIndependence, "independent");
        assert.equal(record.sourceRecord.revisionVerified, true);
        for (const field of record.fields) {
            assert.equal(field.provider, provider.provider);
            assert.equal(field.revision, provider.revision);
            assert.equal(field.sha256, catalogRecord.sha256);
            assert.ok(field.locator.lineStart >= 1);
            assert.ok(field.structuredValue !== undefined);
            assert.ok(field.units === null || typeof field.units === "string");
            assert.equal(field.gameVersionVerified, false);
            assert.equal(field.providerIndependence, "independent");
            assert.equal(field.canonicalEligibility, false);
            assert.match(field.extractionMethod.type, /^semantic-go-/);
            assert.doesNotMatch(JSON.stringify(field.extractionMethod), /numeric[-_ ]?token|token-match/i);
        }
    }
});

test("audit rejects an extraction-time absolute source root in the artifact", () => {
    const evidence = readJson(evidencePath);
    const catalog = readJson(catalogPath);
    const [sourceId, record] = Object.entries(evidence.records)[0];
    const tampered = structuredClone(evidence);
    tampered.records[sourceId].sourceFile = "C:\\Users\\example\\AppData\\Local\\Temp\\gcsim\\internal\\weapons\\sword\\freedom\\freedom.go";
    const report = auditor.auditEvidence({ evidence: tampered, sourceCatalog: catalog });
    assert.equal(report.status, "failed");
    assert.ok(report.errors.some((error) => error.includes(`${sourceId}: sourceFile must be provider-relative`)));
});

test("field mappings retain semantic mismatches as needsReview", () => {
    const evidence = readJson(evidencePath);
    const fields = Object.values(evidence.records).flatMap((record) => record.fields);
    const find = (candidateId, field) => fields.find((item) => item.candidateId === candidateId && item.field === field);
    assert.equal(find("w_11503_damage_1", "value").status, "eligible");
    assert.deepEqual(find("w_11503_damage_1", "value").structuredValue, { "1": 10, "2": 12.5, "3": 15, "4": 17.5, "5": 20 });
    assert.equal(find("w_11503_damage_1", "unit").claimComparison.valueMatch, true);
    assert.equal(find("w_11503_damage_1", "unit").claimComparison.comparisonBasis, "fieldUnit");
    assert.equal(find("w_11503_damage_1", "unit").claimComparison.activationMatch, true);
    assert.equal(find("w_11503_damage_3", "activation").status, "needsReview");
    assert.deepEqual(find("w_11509_damageBonus_ae1b42da", "value").structuredValue["1"], [8, 16, 28]);
    assert.equal(find("w_11509_damage_2", "value").status, "needsReview");
    assert.equal(find("w_12402_extraDamage_4ff89bef", "value").status, "eligible");
    assert.equal(find("w_12402_extraDamage_4ff89bef", "value").claimComparison.valueMatch, true);
    assert.equal(find("w_12402_extraDamage_4ff89bef", "value").claimComparison.targetMatch, true);
    assert.equal(find("w_12402_extraDamage_4ff89bef", "value").claimComparison.activationMatch, true);
    assert.equal(find("w_11518_crit_1", "value").status, "eligible");
    assert.equal(find("w_11518_crit_1", "value").sourceField, "burstCD");
    assert.equal(find("w_11518_crit_1", "value").claimComparison.valueMatch, true);
    assert.equal(find("w_15516_damage_2", "activation").status, "needsReview");
    assert.equal(find("w_15502_damageBonus_fc388315", "stack").claimComparison.valueMatch, true);
    const ancillary = Object.values(evidence.records).flatMap((record) => record.unmappedSourceFields);
    assert.equal(ancillary.filter((field) => field.mapping?.status === "registryLifecycleMapped").length, 4);
    assert.equal(ancillary.filter((field) => field.mapping?.status === "schemaGap").length, 0);
});

test("arithmetic evaluator is anchored and deterministic", () => {
    assert.deepEqual(generator.percentageValues("0.12 + 0.04*float64(r)"), { "1": 16, "2": 20, "3": 24, "4": 28, "5": 32 });
    assert.throws(() => generator.evaluateArithmetic("1 + sourceTextNumber"), /unrecognized identifier/);
});

test("when a pinned checkout is supplied, generation is byte-stable against the artifact", { skip: !process.env.GCSIM_ROOT }, () => {
    const expected = readJson(evidencePath);
    const generated = generator.buildEvidence({ gcsimRoot: process.env.GCSIM_ROOT, dataRoot });
    assert.equal(generator.stableJson(generated), generator.stableJson(expected));
});
