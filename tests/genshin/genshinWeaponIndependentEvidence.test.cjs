"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const dataRoot = path.join(root, "games", "genshin", "data");
const evidencePath = path.join(dataRoot, "v2", "weapons", "independent-field-evidence.json");
const externalPath = path.join(dataRoot, "v2", "weapons", "external-evidence.json");
const specPath = path.join(dataRoot, "v2", "weapons", "spec-candidates.json");
const officialPilotPath = path.join(dataRoot, "v2", "weapons", "official-pilot.json");
const generator = require(path.join(root, "scripts", "genshinWeaponIndependentEvidenceGenerate.cjs"));
const auditor = require(path.join(root, "scripts", "genshinWeaponIndependentEvidenceAudit.cjs"));

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function artifact() { return readJson(evidencePath); }

test("independent weapon evidence audit passes without canonical promotion", () => {
    const evidence = artifact();
    const report = auditor.auditEvidence({ evidence, externalEvidence: readJson(externalPath) });
    assert.equal(report.status, "passed", report.errors.join("\n"));
    assert.equal(report.summary.records, 9);
    assert.equal(report.summary.officialGameVersionLinkedRecords, 9);
    assert.equal(report.summary.independentGameVersionMissingRecords, 9);
    assert.equal(report.summary.independentProviderPairs, 9);
    assert.equal(report.summary.sameDataminePairs, 0);
    assert.equal(report.summary.humanJudgmentRequiredNow, 0);
    assert.equal(report.summary.machineFollowUpOnly, report.summary.fieldComparisons);
    assert.equal(report.summary.canonicalEligible, 0);
    assert.equal(report.summary.verificationStatuses.needsReview, report.summary.fieldComparisons);
});

test("the two priority pilots retain explicit official text and rank-aware comparisons", () => {
    const evidence = artifact();
    const amos = evidence.records["15502"];
    const amosValue = amos.fieldComparisons.find((item) => item.candidateId === "w_15502_damage_1" && item.field === "value");
    assert.equal(amos.gameVersion.official, "1.2");
    assert.equal(amos.sourceB.gameVersion, null);
    assert.equal(amosValue.match.sourceAgreement, "partialMatch");
    assert.deepEqual(amosValue.match.sourceAgreementMatchedRanks, ["1"]);
    assert.equal(amosValue.extractedValueA["1"], 12);
    assert.equal(amosValue.extractedValueB["1"], 12);
    assert.ok(amosValue.originalText.sourceA.some((item) => /12%/.test(item.excerpt)));
    assert.equal(amosValue.canonicalEligibility, false);

    const golden = evidence.records["15516"];
    const goldenValue = golden.fieldComparisons.find((item) => item.candidateId === "w_15516_damage_2" && item.field === "value");
    assert.equal(golden.gameVersion.official, "Luna VI");
    assert.equal(goldenValue.match.sourceAgreement, "partialMatch");
    assert.deepEqual(goldenValue.match.sourceAgreementMatchedRanks, ["1"]);
    assert.equal(goldenValue.extractedValueA["1"], 40);
    assert.equal(goldenValue.extractedValueB["1"], 40);
    assert.equal(goldenValue.runtime.destination.dataset, "weaponModifiers");
});

test("missing official numeric fields are machine follow-up, not fabricated agreement", () => {
    const evidence = artifact();
    const freedom = evidence.records["11503"];
    const field = freedom.fieldComparisons.find((item) => item.candidateId === "w_11503_damage_1" && item.field === "value");
    assert.equal(field.match.sourceAgreement, "notComparable");
    assert.equal(field.extractedValueA, null);
    assert.equal(field.review.humanJudgmentRequiredNow, false);
    assert.equal(field.review.machineFollowUpRequired, true);
    assert.ok(field.blockedReasons.includes("officialFieldValuesMissing"));
    assert.equal(freedom.gameVersion.exactBinding, false);
});

test("semantic and value conflicts remain deferred until version binding", () => {
    const evidence = artifact();
    const fields = Object.values(evidence.records).flatMap((record) => record.fieldComparisons);
    const bell = fields.find((item) => item.candidateId === "w_12402_damage_1" && item.field === "activation");
    assert.equal(bell.review.humanJudgmentRequiredNow, false);
    assert.equal(bell.review.machineFollowUpRequired, true);
    assert.equal(bell.review.humanReviewDeferredByVersionGate, true);
    assert.ok(bell.review.deferredHumanReasons.includes("gcsimFieldNeedsReview"));
    const mistsplitter = fields.find((item) => item.candidateId === "w_11509_damage_2" && item.field === "value");
    assert.equal(mistsplitter.review.humanJudgmentRequiredNow, false);
    assert.equal(mistsplitter.review.machineFollowUpRequired, true);
    assert.equal(mistsplitter.review.humanReviewDeferredByVersionGate, true);
    assert.ok(mistsplitter.review.deferredHumanReasons.includes("gcsimFieldNeedsReview"));
    assert.ok(mistsplitter.blockedReasons.includes("semanticMappingNeedsReview"));
});

test("runtime routes and legacy supersession are included without changing status", () => {
    const evidence = artifact();
    for (const record of Object.values(evidence.records)) {
        assert.ok(record.runtimeApplication.destinations.length > 0, record.weaponId);
        assert.ok(record.runtimeApplication.modifierIds.length > 0, record.weaponId);
        assert.ok(record.runtimeApplication.supersedesLegacyModifierIds.length > 0, record.weaponId);
        assert.equal(record.recommendedDecision, "retain_all_candidates_as_needsReview; do_not_promote");
        for (const comparison of record.fieldComparisons) {
            assert.equal(comparison.verificationStatus, "needsReview");
            assert.equal(comparison.canonicalEligibility, false);
            assert.notEqual(comparison.recommendedDecision, "promote");
        }
    }
});

test("generator output is deterministic for the current inputs", () => {
    const inputs = { externalEvidence: readJson(externalPath), specs: readJson(specPath), officialPilot: readJson(officialPilotPath) };
    const first = generator.buildEvidence(inputs);
    const second = generator.buildEvidence(inputs);
    assert.equal(generator.stableJson(first), generator.stableJson(second));
    assert.deepEqual(first.summary, artifact().summary);
});

test("audit rejects an absolute provider source path", () => {
    const tampered = structuredClone(artifact());
    tampered.records["11503"].sourceB.path = "C:\\Users\\example\\AppData\\Local\\Temp\\gcsim\\freedom.go";
    const report = auditor.auditEvidence({ evidence: tampered });
    assert.equal(report.status, "failed");
    assert.ok(report.errors.some((error) => error.includes("11503: source B path is not provider-relative")));
});
