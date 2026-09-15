"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const comparison = require(path.join(root, "scripts", "genshinWeaponPrimaryFieldComparison.cjs"));

function read(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

test("bounded inventory is exactly the current 381 sourceMissing weapon candidates", () => {
    const audit = comparison.buildAudit();
    assert.equal(audit.status, "passed");
    assert.equal(audit.scope.candidateCount, 381);
    assert.equal(audit.summary.candidates, 381);
    assert.equal(audit.summary.uniqueEntities, 195);
    assert.equal(audit.summary.rawVersionValuesEqual, 381);
    assert.equal(audit.summary.sourceFamilyCount, 1);
    assert.deepEqual(audit.summary.statusBySource, { verified: 381 });
    assert.deepEqual(audit.summary.statusByComparison, {
        ambiguous: 41,
        missing: 21,
        numericAgreementOnlyNotSemanticIdentity: 316,
        unitMismatch: 3
    });
    assert.equal(audit.summary.numericMatchObserved, 357);
    assert.equal(audit.records.w_15410_damage_1.local.status, "missing");
    assert.equal(audit.records.w_15410_damage_1.comparison.status, "missing");
    const normalizedTargets = {
        w_13501_extraDamage_800a1eaf: { status: "unitMismatch", matches: [] },
        w_15411_damage_1: { status: "numericAgreementOnlyNotSemanticIdentity", matches: [0] },
        w_15507_stat_2: { status: "numericAgreementOnlyNotSemanticIdentity", matches: [1] },
        w_15509_damage_2: { status: "numericAgreementOnlyNotSemanticIdentity", matches: [1] },
        w_15512_statBonus_5c669f4b: { status: "numericAgreementOnlyNotSemanticIdentity", matches: [1] },
        w_15513_statBonus_6b22fafe: { status: "numericAgreementOnlyNotSemanticIdentity", matches: [0] },
        w_15514_damageBonus_da26c5de: { status: "numericAgreementOnlyNotSemanticIdentity", matches: [1] },
        w_15514_damageBonus_e8964879: { status: "numericAgreementOnlyNotSemanticIdentity", matches: [2] }
    };
    for (const [candidateId, expected] of Object.entries(normalizedTargets)) {
        assert.equal(audit.records[candidateId].local.status, "ok");
        assert.equal(audit.records[candidateId].comparison.status, expected.status);
        assert.deepEqual(audit.records[candidateId].comparison.after.numericMatchingColumnIndexes, expected.matches);
    }
    assert.equal(audit.summary.semanticMappingsSelected, 0);
    assert.equal(audit.summary.certificateEligible, 0);
    assert.equal(audit.summary.canonicalPromotion, 0);
});

test("persisted artifact and report are deterministic and validate against current raw pins", () => {
    const built = comparison.buildAudit();
    const artifact = read("games/genshin/data/v2/weapons/primary-field-comparison.json");
    const report = read("reports/genshin-weapon-primary-field-comparison.json");
    assert.deepEqual(artifact, built);
    assert.deepEqual(report, built);
    assert.deepEqual(comparison.validateAudit(artifact), { valid: true, reasons: [] });
    assert.match(artifact.fieldDigest, /^[a-f0-9]{64}$/); // Exact current bytes are checked against buildAudit above.
});

test("candidate×claim evidence keeps raw observations separate from semantic verification", () => {
    const audit = comparison.buildAudit();
    const records = Object.values(audit.records);
    assert.equal(records.length, 381);
    assert.equal(audit.summary.claimCount, 8001);
    assert.equal(audit.summary.candidateScopedG06HoldCount, 0);
    assert.equal(audit.summary.candidateScopedSearchRequiredCount, 381);
    assert.equal(audit.summary.observedNumericClaimCount, 632);
    assert.equal(audit.summary.claimStatusCounts.localFormatUnsupported || 0, 0);
    for (const record of records) {
        for (const field of ["value", "refinement", "activation", "targets"]) {
            const claim = record.claims[field];
            assert.equal(claim.claimId, `${record.candidateId}:${field}`);
            assert.equal(claim.comparison.semanticIdentityEstablished, false);
            assert.equal(claim.comparison.semanticMapping, null);
            assert.equal(claim.comparison.supportsClaimValue, false);
            assert.equal(claim.frontier.disposition, "searchRequired");
            assert.equal(claim.frontier.g06HoldEligible, false);
        }
        assert.equal(record.frontier.disposition, "searchRequired");
        assert.equal(record.frontier.g06HoldEligible, false);
        assert.equal(record.source.independentProviderPairObserved, false);
        assert.equal(record.gate.certificateEligible, false);
        assert.equal(record.gate.canonicalPromotionEligible, false);
    }
    const matching = audit.records.w_11301_damageBonus_91cc873a;
    assert.equal(matching.claims.value.comparison.status, "observedNumericOnly");
    assert.equal(matching.claims.value.source.after.status, "rawColumnCandidatesMaterialized");
    assert.equal(matching.claims.value.source.after.gameVersion, "7.0");
    assert.equal(matching.claims.value.source.after.artifact.rawArtifactDigest.length, 64);
    assert.equal(matching.claims.value.source.after.semanticMapping, null);
    const ambiguous = audit.records.w_11424_critBonus_0da1d9be;
    assert.equal(ambiguous.comparison.status, "ambiguous");
    assert.equal(ambiguous.claims.refinement.comparison.status, "ambiguousColumn");
    const missing = audit.records.w_11412_extra_damage_1;
    assert.equal(missing.comparison.status, "missing");
    assert.equal(missing.claims.refinement.comparison.status, "localValueMissing");
    const semantic = matching.claims.activation;
    assert.equal(semantic.comparison.status, "notMaterialized");
    assert.ok(semantic.blockedReasons.includes("providerStructuredClaimFieldMissing"));
});

test("candidate×claim frontier rejects forged hold or evidence gates", () => {
    const forged = clone(comparison.buildAudit());
    forged.records.w_11301_damage_1.frontier.g06HoldEligible = true;
    forged.records.w_11301_damage_1.claims.value.frontier.disposition = "candidateScopedEvidenceDeferred";
    forged.records.w_11301_damage_1.claims.value.comparison.supportsClaimValue = true;
    const result = comparison.validateAudit(forged, { compareCurrent: false });
    assert.equal(result.valid, false);
    assert.ok(result.reasons.includes("frontierNotFailClosed:w_11301_damage_1"));
    assert.ok(result.reasons.includes("claimFrontierNotFailClosed:w_11301_damage_1:value"));
    assert.ok(result.reasons.includes("claimGateNotFailClosed:w_11301_damage_1:value"));
});

test("numeric equality remains explicitly non-semantic and fail-closed", () => {
    const audit = comparison.buildAudit();
    const matching = audit.records.w_11301_damageBonus_91cc873a;
    assert.equal(matching.comparison.status, "numericAgreementOnlyNotSemanticIdentity");
    assert.equal(matching.comparison.semanticIdentityEstablished, false);
    assert.equal(matching.comparison.semanticMapping, null);
    assert.equal(matching.source.independentProviderPairObserved, false);
    assert.equal(matching.gate.certificateEligible, false);
    assert.equal(matching.gate.canonicalPromotionEligible, false);

    const forged = clone(audit);
    forged.records.w_11301_damageBonus_91cc873a.comparison.semanticMapping = { columnIndex: 0 };
    forged.gate.canIssueEligibilityCertificate = true;
    const result = comparison.validateAudit(forged, { compareCurrent: false });
    assert.equal(result.valid, false);
    assert.ok(result.reasons.includes("semanticMappingUnexpected:w_11301_damageBonus_91cc873a"));
    assert.ok(result.reasons.includes("gateNotFailClosed"));
});

test("comparison distinguishes one matching raw column from ambiguous and mismatched vectors", () => {
    const local = {
        status: "ok",
        normalizedByRefinement: {
            "1": comparison.normalizeScalar(10, { declaredUnit: "percent", side: "local" }),
            "2": comparison.normalizeScalar(10, { declaredUnit: "percent", side: "local" }),
            "3": comparison.normalizeScalar(10, { declaredUnit: "percent", side: "local" }),
            "4": comparison.normalizeScalar(10, { declaredUnit: "percent", side: "local" }),
            "5": comparison.normalizeScalar(10, { declaredUnit: "percent", side: "local" })
        }
    };
    const one = comparison.extractRawColumns({
        r1: { values: ["10%"] }, r2: { values: ["10%"] }, r3: { values: ["10%"] },
        r4: { values: ["10%"] }, r5: { values: ["10%"] }
    });
    assert.equal(comparison.compareRefinementVectors(local, one).status, "numericAgreementOnlyNotSemanticIdentity");

    const ambiguous = comparison.extractRawColumns({
        r1: { values: ["0", "10%", "10%"] }, r2: { values: ["0", "10%", "10%"] },
        r3: { values: ["0", "10%", "10%"] }, r4: { values: ["0", "10%", "10%"] },
        r5: { values: ["0", "10%", "10%"] }
    });
    const ambiguousResult = comparison.compareRefinementVectors(local, ambiguous);
    assert.equal(ambiguousResult.status, "ambiguous");
    assert.deepEqual(ambiguousResult.numericMatchingColumnIndexes, [1, 2]);

    const mismatch = comparison.extractRawColumns({
        r1: { values: ["9%"] }, r2: { values: ["9%"] }, r3: { values: ["9%"] },
        r4: { values: ["9%"] }, r5: { values: ["9%"] }
    });
    assert.equal(comparison.compareRefinementVectors(local, mismatch).status, "mismatch");
});

test("normalization rejects unsupported modes and preserves explicit unit mismatches", () => {
    assert.equal(comparison.normalizeScalar("10%", { mode: "inexact" }).status, "unknownmode");
    assert.equal(comparison.normalizeScalar("10%", { declaredUnit: "number", side: "local" }).status, "unsupported");
    const local = {
        status: "ok",
        normalizedByRefinement: Object.fromEntries([1, 2, 3, 4, 5].map((rank) => [String(rank), comparison.normalizeScalar(10, { declaredUnit: "percent", side: "local" })]))
    };
    const raw = comparison.extractRawColumns({
        r1: { values: [10] }, r2: { values: [10] }, r3: { values: [10] },
        r4: { values: [10] }, r5: { values: [10] }
    });
    assert.equal(comparison.compareRefinementVectors(local, raw).status, "unitMismatch");
});

test("normalization preserves percentOfReference and strict per-stack slash vectors", () => {
    assert.equal(comparison.normalizeUnit("percentOfReference"), "percentOfReference");
    const reference = comparison.normalizeScalar(1, { declaredUnit: "percentOfReference", side: "local" });
    assert.deepEqual(reference, {
        status: "ok",
        raw: 1,
        decimal: "1",
        unit: "percentOfReference",
        canonical: "percentOfReference:1",
        mode: "strictDecimalExact"
    });
    assert.equal(comparison.normalizeScalar("1%", { declaredUnit: "percentOfReference", side: "local" }).status, "unsupported");

    const local = comparison.extractLocalVector({
        effect: {
            unit: "percent",
            stack: { max: 3 },
            valueByRefinement: Object.fromEntries([1, 2, 3, 4, 5].map((rank) => [String(rank), [6, 10, 14]]))
        }
    });
    assert.equal(local.status, "ok");
    assert.equal(local.normalizedByRefinement["1"].representation, "stackVector");
    assert.deepEqual(local.normalizedByRefinement["1"].elements.map((element) => ({ decimal: element.decimal, unit: element.unit })), [
        { decimal: "6", unit: "percent" },
        { decimal: "10", unit: "percent" },
        { decimal: "14", unit: "percent" }
    ]);

    const raw = comparison.extractRawColumns({
        r1: { values: ["10/20/30/48%"] }, r2: { values: ["12.5/25/37.5/60%"] },
        r3: { values: ["15/30/45/72%"] }, r4: { values: ["17.5/35/52.5/84%"] },
        r5: { values: ["20/40/60/96%"] }
    });
    assert.equal(raw.columns[0].status, "ok");
    const trailing = raw.columns[0].valuesByRank[0].normalized;
    assert.equal(trailing.representation, "slashSeparatedVector");
    assert.equal(trailing.unit, "percent");
    assert.equal(trailing.unitSource, "trailingSuffix");
    assert.deepEqual(trailing.elements.map((element) => ({ sourceToken: element.sourceToken, unit: element.unit })), [
        { sourceToken: "10", unit: "percent" },
        { sourceToken: "20", unit: "percent" },
        { sourceToken: "30", unit: "percent" },
        { sourceToken: "48%", unit: "percent" }
    ]);

    const matching = comparison.compareRefinementVectors(local, comparison.extractRawColumns({
        r1: { values: ["6%/10%/14%", "6%/10%/14%"] }, r2: { values: ["6%/10%/14%", "6%/10%/14%"] },
        r3: { values: ["6%/10%/14%", "6%/10%/14%"] }, r4: { values: ["6%/10%/14%", "6%/10%/14%"] },
        r5: { values: ["6%/10%/14%", "6%/10%/14%"] }
    }));
    assert.equal(matching.status, "ambiguous");
    assert.deepEqual(matching.numericMatchingColumnIndexes, [0, 1]);

    const invalidLocalShape = comparison.extractLocalVector({
        effect: {
            unit: "percent",
            stack: { max: 3 },
            valueByRefinement: Object.fromEntries([1, 2, 3, 4, 5].map((rank) => [String(rank), [6, 10]]))
        }
    });
    assert.equal(invalidLocalShape.status, "localvalueunsupported");
    assert.equal(invalidLocalShape.unsupportedReason, "arrayLengthStackMismatch");

    const invalidRawShape = comparison.extractRawColumns({
        r1: { values: ["1/2"] }, r2: { values: ["1/2/3"] }, r3: { values: ["1/2"] },
        r4: { values: ["1/2"] }, r5: { values: ["1/2"] }
    });
    assert.equal(invalidRawShape.columns[0].status, "rawvalueunsupported");
});

test("dedicated schema fixes the lane, version pins, and fail-closed gate", () => {
    const schema = read("games/genshin/data/schema/weapon-primary-field-comparison.schema.json");
    assert.equal(schema.$id, "weapon-primary-field-comparison.schema.json");
    assert.equal(schema.properties.kind.const, "genshinWeaponPrimaryFieldComparison");
    assert.equal(schema.properties.lane.const, "firstProviderRefinementScalarComparison");
    assert.equal(schema.$defs.scope.properties.candidateCount.const, 381);
    assert.equal(schema.$defs.transition.properties.provider.const, "genshin-db");
    assert.equal(schema.$defs.transition.properties.sourceFamily.const, "GenshinData-derived");
    assert.equal(schema.$defs.gate.properties.canIssueEligibilityCertificate.const, false);
    assert.equal(schema.$defs.gate.properties.canPromoteCanonical.const, false);
    assert.equal(schema.$defs.comparison.properties.semanticIdentityEstablished.const, false);
    assert.ok(schema.$defs.normalizedScalar.properties.unit.enum.includes("percentOfReference"));
    assert.deepEqual(schema.$defs.normalizedVector.properties.representation.enum, ["stackVector", "slashSeparatedVector"]);
});
