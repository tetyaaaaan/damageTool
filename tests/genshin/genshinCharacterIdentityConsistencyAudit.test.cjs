"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const audit = require("../../scripts/genshinCharacterIdentityConsistencyAudit.cjs");
const { digestStable } = require("../../scripts/genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "../..");

function writeIdentityFixture({ malformedMapper = false, malformedTalent = false } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "genshin-identity-audit-"));
    const manifest = {
        datasets: {
            characters: { path: "characters.json", layer: "raw", authority: "catalog" },
            characterTalents: { path: "character-talents.json", layer: "raw", authority: "sourceText" },
            characterConstellations: { path: "character-constellations.json", layer: "raw", authority: "sourceText" }
        }
    };
    fs.writeFileSync(path.join(root, "data-v2-manifest.json"), JSON.stringify(manifest));
    fs.writeFileSync(path.join(root, "characters.json"), JSON.stringify({ "1": { nameJa: "A" }, "2": { nameJa: "B" } }));
    fs.writeFileSync(path.join(root, "character-talents.json"), JSON.stringify({
        "1": { skill: { nameJa: "A" } },
        "2": malformedTalent ? [] : { skill: { nameJa: "B" } }
    }));
    fs.writeFileSync(path.join(root, "character-constellations.json"), JSON.stringify({
        "1": { constellations: { "1": { nameJa: "A" } } },
        "2": { constellations: { "1": { nameJa: "B" } } }
    }));
    const mapperText = malformedMapper
        ? "const CHARACTER_NAME_BY_AVATAR_ID_JA = {\"1\":\"A\",}; const CHARACTER_NAME_BY_AVATAR_ID = {\"1\":\"A\"};"
        : "const CHARACTER_NAME_BY_AVATAR_ID_JA = {\"1\":\"A\"}; const CHARACTER_NAME_BY_AVATAR_ID = {\"1\":\"A\"};";
    const mapper = path.join(root, "mapper.js");
    fs.writeFileSync(mapper, mapperText);
    return { root, mapper };
}

function removeIdentityFixture(fixture) {
    fs.rmSync(fixture.root, { recursive: true, force: true });
}

test("identity audit binds DataContract catalog/source-text inputs and both mapper maps", () => {
    const value = audit.buildAudit();
    assert.equal(value.status, "passed");
    assert.equal(value.generatedFrom.manifest.path, "games/genshin/data/data-v2-manifest.json");
    assert.deepEqual(value.generatedFrom.datasets.map((input) => [input.role, input.dataset, input.layer, input.authority]), [
        ["catalog", "characters", "raw", "catalog"],
        ["sourceTextTalents", "characterTalents", "raw", "sourceText"],
        ["sourceTextConstellations", "characterConstellations", "raw", "sourceText"]
    ]);
    assert.equal(value.mapper.status, "parsed");
    assert.deepEqual(value.mapper.maps.map((map) => map.constantName), [
        "CHARACTER_NAME_BY_AVATAR_ID_JA",
        "CHARACTER_NAME_BY_AVATAR_ID"
    ]);
    assert.deepEqual(value.mapper.maps.map((map) => map.occurrenceCount), [98, 98]);
});

test("identity audit distinguishes matches, mapper missing, duplicate disagreement, source mismatch, and name mismatch", () => {
    const value = audit.buildAudit();
    assert.deepEqual(value.summary.classificationCounts, {
        match: 96,
        mapperMissing: 19,
        mapperDuplicateDisagreement: 0,
        catalogSourceTextMismatch: 0,
        mapperNameMismatch: 2,
        malformedEvidence: 0
    });
    assert.deepEqual(value.summary.mapperNameMismatchIds, ["10000092", "10000093"]);
    assert.deepEqual(value.summary.mapperDuplicateDisagreementIds, []);
    assert.deepEqual(value.summary.catalogSourceTextMismatchIds, []);
    assert.deepEqual(value.summary.mapperMissingFromEntityId, [
        "10000109", "10000110", "10000111", "10000113", "10000114", "10000116", "10000119", "10000120",
        "10000122", "10000123", "10000124",
        "10000125", "10000126", "10000127", "10000128", "10000129", "10000130", "10000131",
        "10000133"
    ]);
    const byId = Object.fromEntries(value.records.map((record) => [record.id, record]));
    assert.equal(byId["10000092"].catalogNameJa, "閑雲");
    assert.deepEqual(byId["10000092"].mapperObservedNames, ["嘉明"]);
    assert.equal(byId["10000092"].classification, "mapperNameMismatch");
    assert.equal(byId["10000093"].catalogNameJa, "嘉明");
    assert.deepEqual(byId["10000093"].mapperObservedNames, ["閑雲"]);
    assert.equal(byId["10000093"].classification, "mapperNameMismatch");
    assert.equal(byId["10000109"].classification, "mapperMissing");
    for (const [id, name] of Object.entries({
        "10000112": "エスコフィエ",
        "10000115": "ダリア",
        "10000121": "アイノ",
        "10000132": "プルーネ"
    })) {
        assert.equal(byId[id].classification, "match");
        assert.deepEqual(byId[id].mapperObservedNames, [name]);
    }
    assert.ok(value.records.every((record) => record.sourceTextStatus === "catalogAndSourceTextMatch"));
    assert.ok(value.records.every((record) => record.evidence.malformed === false));
    assert.ok(value.records.every((record) => record.sourceText.talentsDirectNameValues.length === 0 && record.sourceText.constellationsDirectNameValues.length === 0));
});

test("identity-sensitive promotion fails closed while mapper missing remains a consumer coverage gap", () => {
    const value = audit.buildAudit();
    assert.equal(value.gate.identitySensitivePromotion.status, "failClosed");
    assert.equal(value.gate.identitySensitivePromotion.failClosed, true);
    assert.equal(value.gate.identitySensitivePromotion.allowed, false);
    assert.deepEqual(value.gate.identitySensitivePromotion.blockingIds, ["10000092", "10000093"]);
    assert.equal(value.gate.consumerCoverage.status, "gap");
    assert.equal(value.gate.consumerCoverage.doesNotReclassifyAsMismatch, true);
    assert.equal(value.gate.canonicalPromotion.status, "forbidden");
    assert.equal(value.gate.canonicalPromotion.eligible, 0);
    assert.equal(value.gate.canonicalPromotion.changed, false);
    assert.equal(value.summary.canonicalPromotionCount, 0);
});

test("per-entity identity assessments distinguish mismatch, missing coverage, and clear identity without granting eligibility", () => {
    const value = audit.buildAudit();
    assert.deepEqual(audit.assessEntityIdentity("10000092", value), {
        entityId: "10000092",
        status: "blockedMismatch",
        blocked: true,
        reasons: ["mapperNameMismatch"],
        classification: "mapperNameMismatch",
        consumerCoverageGap: false,
        canonicalEligible: false
    });
    assert.deepEqual(audit.assessEntityIdentity("10000109", value), {
        entityId: "10000109",
        status: "missingCoverage",
        blocked: false,
        reasons: ["mapperMissing"],
        classification: "mapperMissing",
        consumerCoverageGap: true,
        canonicalEligible: false
    });
    assert.deepEqual(audit.assessEntityIdentity("10000026", value), {
        entityId: "10000026",
        status: "clear",
        blocked: false,
        reasons: [],
        classification: "match",
        consumerCoverageGap: false,
        canonicalEligible: false
    });
    const assessments = audit.buildEntityIdentityAssessments({ audit: value });
    assert.deepEqual(assessments.get("10000092"), audit.assessEntityIdentity("10000092", value));
    assert.deepEqual(assessments.get("10000109"), audit.assessEntityIdentity("10000109", value));
});

test("identity audit artifact, report, and Markdown are deterministic", () => {
    const expected = audit.buildAudit();
    const artifact = JSON.parse(fs.readFileSync(audit.artifactPath, "utf8"));
    const report = JSON.parse(fs.readFileSync(audit.reportJsonPath, "utf8"));
    const markdown = fs.readFileSync(audit.reportMarkdownPath, "utf8");
    assert.deepEqual(artifact, expected);
    assert.deepEqual(report, expected);
    assert.deepEqual(audit.validateAudit(artifact), { valid: true, reasons: [] });
    assert.match(markdown, /10000092/);
    assert.match(markdown, /10000109/);
    assert.match(markdown, /canonical promotion: \*\*forbidden \(0\)\*\*/);
});

test("identity audit validator rejects forged classification or digest evidence", () => {
    const forgedClassification = audit.buildAudit();
    forgedClassification.records[0].classification = "mapperNameMismatch";
    forgedClassification.fieldDigest = digestStable({ ...forgedClassification, fieldDigest: undefined });
    const classificationResult = audit.validateAudit(forgedClassification);
    assert.equal(classificationResult.valid, false);
    assert.ok(classificationResult.reasons.includes("artifactNotDeterministicForCurrentInputs"));

    const forgedDigest = audit.buildAudit();
    forgedDigest.fieldDigest = "0".repeat(64);
    const digestResult = audit.validateAudit(forgedDigest, { compareCurrent: false });
    assert.equal(digestResult.valid, false);
    assert.ok(digestResult.reasons.includes("fieldDigestInvalid"));
});

test("identity audit has a dedicated schema with all required classification and gate contracts", () => {
    const schema = JSON.parse(fs.readFileSync(audit.schemaPath, "utf8"));
    assert.equal(schema.$id, "genshin-character-identity-consistency-audit.schema.json");
    assert.equal(schema.properties.kind.const, "genshinCharacterIdentityConsistencyAudit");
    assert.deepEqual(schema.$defs.classifications.properties, {
        match: { type: "array", items: { type: "string" } },
        mapperMissing: { type: "array", items: { type: "string" } },
        mapperDuplicateDisagreement: { type: "array", items: { type: "string" } },
        catalogSourceTextMismatch: { type: "array", items: { type: "string" } },
        mapperNameMismatch: { type: "array", items: { type: "string" } },
        malformedEvidence: { type: "array", items: { type: "string" } }
    });
    assert.equal(schema.$defs.gate.properties.canonicalPromotion.properties.eligible.const, 0);
    assert.equal(schema.$defs.summary.properties.mapperNameMismatchIds.type, "array");
    assert.equal(schema.$defs.summary.properties.malformedEvidenceIds.type, "array");
    assert.equal(schema.$defs.classifications.properties.malformedEvidence.type, "array");
    assert.equal(schema.$defs.mapperMap.properties.malformedReasons.type, "array");
});

test("identity audit fails closed on malformed parsed evidence instead of trusting presence booleans", () => {
    const fixture = writeIdentityFixture({ malformedMapper: true, malformedTalent: true });
    try {
        const value = audit.buildAudit({ dataRoot: fixture.root, mapperPath: fixture.mapper });
        assert.equal(value.status, "failed");
        assert.equal(value.summary.classificationCounts.malformedEvidence, 2);
        assert.deepEqual(value.summary.malformedEvidenceIds, ["1", "2"]);
        assert.equal(value.gate.identitySensitivePromotion.failClosed, true);
        const assessment = audit.assessEntityIdentity("1", value, { dataRoot: fixture.root, mapperPath: fixture.mapper });
        assert.equal(assessment.status, "malformedEvidence");
        assert.equal(assessment.blocked, true);
        assert.equal(assessment.canonicalEligible, false);
    } finally {
        removeIdentityFixture(fixture);
    }
});

test("identity audit reports missing mapper coverage separately from malformed evidence", () => {
    const fixture = writeIdentityFixture();
    try {
        const value = audit.buildAudit({ dataRoot: fixture.root, mapperPath: fixture.mapper });
        assert.equal(value.status, "passed");
        assert.deepEqual(value.summary.classificationCounts, {
            match: 1,
            mapperMissing: 1,
            mapperDuplicateDisagreement: 0,
            catalogSourceTextMismatch: 0,
            mapperNameMismatch: 0,
            malformedEvidence: 0
        });
        const assessment = audit.assessEntityIdentity("2", value, { dataRoot: fixture.root, mapperPath: fixture.mapper });
        assert.equal(assessment.status, "missingCoverage");
        assert.equal(assessment.classification, "mapperMissing");
        assert.equal(assessment.consumerCoverageGap, true);
        assert.equal(assessment.blocked, false);
    } finally {
        removeIdentityFixture(fixture);
    }
});

test("partial mapper coverage does not hide an observed wrong name", () => {
    const fixture = writeIdentityFixture();
    try {
        fs.writeFileSync(fixture.mapper, "const CHARACTER_NAME_BY_AVATAR_ID_JA = {\"1\":\"WRONG\",\"2\":\"B\"}; const CHARACTER_NAME_BY_AVATAR_ID = {\"2\":\"B\"};");
        const value = audit.buildAudit({ dataRoot: fixture.root, mapperPath: fixture.mapper });
        const assessment = audit.assessEntityIdentity("1", value, { dataRoot: fixture.root, mapperPath: fixture.mapper });
        assert.equal(value.records.find((record) => record.id === "1").classification, "mapperNameMismatch");
        assert.deepEqual(value.gate.identitySensitivePromotion.blockingIds, ["1"]);
        assert.equal(value.gate.identitySensitivePromotion.failClosed, true);
        assert.equal(assessment.status, "blockedMismatch");
        assert.equal(assessment.consumerCoverageGap, true);
        assert.equal(assessment.blocked, true);
    } finally {
        removeIdentityFixture(fixture);
    }
});
