"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAttestations, attestationForCertificate } = require("../../scripts/genshinDeterministicConsensusAttest.cjs");

test("current strict certificate registry deterministically emits no machine attestations", () => {
    const result = buildAttestations();
    assert.equal(result.kind, "genshinDeterministicConsensusAttestationRegistry");
    assert.equal(result.summary.eligibleCertificates, 0);
    assert.deepEqual(result.attestations, []);
});

test("blocked, stale, invalidated, or prose-only certificates cannot emit attestations", () => {
    for (const certificate of [
        { kind: "genshinClaimEligibilityCertificate", status: "blocked", verificationMode: "deterministicConsensus" },
        { kind: "genshinClaimEligibilityCertificate", status: "eligible", verificationMode: "deterministicConsensus", stale: true, invalidated: false, blockedReasons: [] },
        { kind: "genshinClaimEligibilityCertificate", status: "eligible", verificationMode: "deterministicConsensus", stale: false, invalidated: true, blockedReasons: [] },
        { kind: "providerPairPolicy", status: "reusable", automaticVerificationAllowed: true }
    ]) assert.equal(attestationForCertificate(certificate), null);
});
