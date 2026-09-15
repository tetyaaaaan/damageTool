"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const legacy = require("../../scripts/genshinEligibilityCertificateGenerate.cjs");
const { buildNormalizedPolicy } = require("../../scripts/genshinProviderPairPolicyNormalize.cjs");

test("legacy pair entry point is permanently diagnostic and fail-closed", () => {
    const report = legacy.certificateForPair({
        id: "probe:reusable",
        dataset: "weapons",
        status: "reusable",
        blockReasons: [],
        normalization: {
            strictReusable: true,
            gateChecks: {
                everyGate: { value: true, status: "pass" }
            }
        }
    });

    assert.equal(report.status, "deprecated");
    assert.equal(report.policyStatus, "reusable");
    assert.equal(report.strictEligible, false);
    assert.equal(report.canonicalEligibility, false);
    assert.ok(report.blockedReasons.includes("legacyPairCertificateDeprecated"));
    assert.ok(report.blockedReasons.includes("candidateClaimCertificateRequired"));
});

test("pair status, gate booleans, and policy prose cannot manufacture legacy eligibility", () => {
    const normalized = buildNormalizedPolicy();
    const tampered = structuredClone(normalized);
    tampered.pairs.forEach((pair) => {
        pair.status = "reusable";
        pair.blockReasons = [];
        pair.normalization.strictReusable = true;
        Object.values(pair.normalization.gateChecks || {}).forEach((gate) => {
            gate.value = true;
            gate.status = "pass";
            gate.reason = null;
        });
        pair.revisionAndRelease = { proseOnly: true };
        pair.gameVersionBinding = { proseOnly: true };
    });

    const report = legacy.buildCertificates({ normalizedPolicy: tampered });
    assert.ok(report.certificates.length > 0);
    assert.equal(report.summary.strictEligibleCount, 0);
    assert.equal(report.summary.canonicalEligibleCount, 0);
    assert.ok(report.certificates.every((certificate) => certificate.status === "deprecated"));
    assert.ok(report.certificates.every((certificate) => certificate.strictEligible === false));
    assert.ok(report.certificates.every((certificate) => certificate.canonicalEligibility === false));
    assert.equal(report.replacementResult.kind, "genshinClaimEligibilityCertificateRegistry");
    assert.equal(report.replacementResult.summary.eligibleCount, 0);
});

test("legacy default output is separate from the candidate×claim certificate artifact", () => {
    assert.match(legacy.defaultOutputPath, /eligibility-certificates-legacy-compatibility\.json$/);
    assert.doesNotMatch(legacy.defaultOutputPath, /(?:^|[\\/])eligibility-certificates\.json$/);
});
