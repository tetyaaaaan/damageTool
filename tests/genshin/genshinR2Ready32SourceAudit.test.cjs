"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..", "..");
const scriptPath = path.join(repositoryRoot, "scripts", "genshinR2Ready32SourceAudit.cjs");
const artifactPath = path.join(
    repositoryRoot,
    "games",
    "genshin",
    "data",
    "v2",
    "reviews",
    "r2-ready-32-source-audit.json"
);
const reportPath = path.join(repositoryRoot, "reports", "genshin-r2-ready-32-source-audit.md");
const schemaPath = path.join(
    repositoryRoot,
    "games",
    "genshin",
    "data",
    "schema",
    "r2-ready-32-source-audit.schema.json"
);
const auditModule = require(scriptPath);

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function loadArtifact() {
    return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

test("buildAudit is exactly the bounded ready-32 scope and remains fail-closed", () => {
    const audit = auditModule.buildAudit();
    assert.equal(audit.status, "draft");
    assert.equal(audit.draftOnly, true);
    assert.deepEqual(
        [...audit.scope.candidateIds].sort((left, right) => left.localeCompare(right)),
        auditModule.EXPECTED_CANDIDATE_IDS
    );
    assert.equal(audit.scope.candidateCount, 32);
    assert.equal(audit.scope.weaponCandidateIds.length, 28);
    assert.equal(audit.scope.artifactCandidateIds.length, 4);
    assert.equal(Object.keys(audit.records).length, 32);
    assert.equal(audit.summary.sourceRawPresentWeaponCandidateCount, 15);
    assert.equal(audit.summary.sourceRawPresentWeaponEntityCount, 12);
    assert.equal(audit.summary.sourceMissingWeaponCandidateCount, 13);
    assert.equal(audit.summary.sourceMissingWeaponEntityCount, 6);
    assert.equal(audit.summary.numericObservationCandidateCount, 6);
    assert.equal(audit.summary.numericUniqueMatchCandidateCount, 5);
    assert.equal(audit.summary.numericAmbiguousCandidateCount, 1);
    assert.equal(audit.summary.runtimeUserStateRouteConfirmedCandidateCount, 16);
    assert.equal(audit.summary.staleInputClassificationCandidateCount, 16);
    assert.equal(audit.summary.correctedConsumerLaneCandidateCount, 16);
    assert.equal(audit.summary.artifactCandidateScopedG06DraftCount, 4);
    assert.equal(audit.summary.strictEligible, 0);
    assert.equal(audit.summary.certificateEligible, 0);
    assert.equal(audit.summary.canonicalPromotionEligible, 0);
    assert.equal(audit.gate.queueChanged, false);
    assert.equal(auditModule.validateAudit(audit).valid, true);
});

test("raw observations, missing entities, and numeric ambiguity are explicitly separated", () => {
    const audit = auditModule.buildAudit();
    const records = Object.values(audit.records);
    const rawPresent = records.filter((record) => record.dataset === "weapons" && record.source.status === "verified");
    const rawMissing = records.filter((record) => record.dataset === "weapons" && record.source.status === "missing");
    assert.equal(rawPresent.length, 15);
    assert.equal(rawMissing.length, 13);
    assert.equal(Object.keys(audit.sourceBundles).length, 12);
    assert.equal(new Set(rawMissing.map((record) => record.entity.id)).size, 6);
    assert.equal(
        rawMissing.every((record) => record.source.status === "missing"
            && record.sourceDisposition.strictGameVersionBinding === false
            && record.comparison.status === "missing"),
        true
    );
    assert.equal(
        rawPresent.every((record) => record.source.sourceFamily === "GenshinData-derived"
            && record.source.independentProviderPairObserved === false),
        true
    );
    const numeric = rawPresent.filter((record) => record.comparison.numericAgreementOnlyNotSemanticIdentity
        && (record.comparison.after?.numericMatchingColumnIndexes || []).length > 0);
    assert.equal(numeric.length, 6);
    assert.equal(numeric.filter((record) => record.comparison.status === "numericAgreementOnlyNotSemanticIdentity").length, 5);
    assert.equal(numeric.filter((record) => record.comparison.status === "ambiguous").length, 1);
    assert.equal(records.every((record) => record.gate.certificateEligible === false
        && record.gate.canonicalPromotionEligible === false
        && record.gate.verificationGranted === false), true);
});

test("interactive input routes correct stale consumer implication without granting source verification", () => {
    const audit = auditModule.buildAudit();
    const routes = Object.values(audit.records).filter((record) => record.calculation.status.startsWith("runtimeUserState"));
    assert.equal(routes.length, 16);
    assert.equal(routes.every((record) => record.calculation.staleQueueClassification === true), true);
    assert.equal(routes.every((record) => record.calculation.consumerGap === "notRequiredByInputMissing"), true);
    const artifacts = Object.values(audit.records).filter((record) => record.dataset === "artifacts");
    assert.equal(artifacts.length, 4);
    assert.equal(artifacts.every((record) => record.calculation.status === "runtimeUserStateRouteVerified"
        && record.work.g06Draft === true
        && record.work.queueClosed === false
        && record.work.centralRegistryEligible === false), true);
    assert.deepEqual(
        artifacts.map((record) => record.calculation.reasonCode).sort(),
        [
            "CONDITION_INPUT_REQUIRED",
            "CONDITION_INPUT_REQUIRED",
            "RECORDED_HEALING_INPUT_REQUIRED",
            "RECORDED_HEALING_INPUT_REQUIRED"
        ]
    );
    const partyRoute = audit.records["artifact:15042:fourPiece:4pc_team_elemental_mastery_moon_omen"];
    assert.equal(partyRoute.calculation.requiredInputs[0], "conditionByModifier.artifact-set-modifiers.json:$.15042.fourPiece[0]:4pc_team_elemental_mastery_moon_omen.option");
    assert.equal(partyRoute.calculation.routeEvidenceRefs.includes("tests/genshin/genshinPartyConditionState.test.cjs"), true);
    assert.equal(partyRoute.source.strictGameVersionBinding, false);
});

test("persisted artifact/report/schema exist and persisted artifact revalidates", () => {
    const audit = loadArtifact();
    const built = auditModule.buildAudit();
    assert.deepEqual(audit, built);
    assert.deepEqual(auditModule.validateAudit(audit), { valid: true, reasons: [] });
    assert.match(audit.fieldDigest, /^[a-f0-9]{64}$/u);
    const report = fs.readFileSync(reportPath, "utf8");
    assert.match(report, /exactly the 28 ready weapon candidates/iu);
    assert.match(report, /Candidates: \*\*32\*\*/u);
    assert.match(report, /Strict\/certificate\/canonical: \*\*0 \/ 0 \/ 0\*/u);
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    assert.equal(schema.$id, "r2-ready-32-source-audit.schema.json");
    assert.equal(schema.properties.kind.const, "genshinR2Ready32SourceAudit");
    assert.equal(schema.properties.scope.$ref, "#/$defs/scope");
    assert.equal(schema.$defs.summary.properties.candidateCount.const, 32);
    assert.equal(schema.$defs.gate.properties.certificateEligible.const, 0);
});

test("validation rejects gate or queue-closure tampering", () => {
    const audit = loadArtifact();
    const gateTamper = clone(audit);
    gateTamper.gate.certificateEligible = 1;
    assert.equal(auditModule.validateAudit(gateTamper, { compareCurrent: false }).valid, false);
    const queueTamper = clone(audit);
    queueTamper.records[auditModule.ARTIFACT_CANDIDATE_IDS[0]].work.queueClosed = true;
    assert.equal(auditModule.validateAudit(queueTamper, { compareCurrent: false }).valid, false);
});
