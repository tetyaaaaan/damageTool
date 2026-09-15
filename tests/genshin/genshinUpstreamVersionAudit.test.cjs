"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { audit, validateHead } = require("../../scripts/genshinUpstreamVersionAudit.cjs");

test("official upstream head is digest-bound and exposes repository lag without becoming claim evidence", () => {
    const result = audit();
    assert.equal(result.status, "upstreamVersionAvailable");
    assert.equal(result.acceptedTargetVersion, "6.7");
    assert.equal(result.observedLiveVersion, "7.0");
    assert.equal(result.evidenceValid, true);
    assert.equal(result.candidatePromotionAllowed, false);
    assert.equal(result.repositoryVersionGateRecommendation, "closeBeforeNewPromotion");
});

test("upstream head fails closed on descriptive truth without a matching field digest", () => {
    const invalid = {
        schemaVersion: 1,
        kind: "genshinUpstreamVersionHead",
        observedGameVersion: "7.0",
        evidence: {
            kind: "officialReleaseNotes",
            providerFamily: "official-hoyoverse",
            url: "https://example.invalid/article",
            apiUrl: "https://example.invalid/api",
            rawApiResponseDigest: "a".repeat(64),
            rawApiResponseBytes: 1,
            claim: { gameVersion: "7.0" },
            fieldDigest: "b".repeat(64)
        }
    };
    assert.deepEqual(validateHead(invalid).reasons, ["fieldDigestInvalid"]);
});
