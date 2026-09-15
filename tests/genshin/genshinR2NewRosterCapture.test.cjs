"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const capture = require("../../scripts/genshinR2NewRosterCapture.cjs");
const { digestStable } = require("../../scripts/genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "../..");

function checkedInCapture() {
    return JSON.parse(fs.readFileSync(capture.outputPath, "utf8"));
}

function rehash(snapshot) {
    snapshot.fieldDigest = digestStable(snapshot.claim);
    return snapshot;
}

test("7.0 new-roster capture is deterministic and validates all six pinned raw artifacts", () => {
    const snapshot = checkedInCapture();
    assert.deepEqual(snapshot, capture.buildCapture());
    assert.deepEqual(capture.validateCapture(snapshot, { repositoryRoot }), { valid: true, reasons: [] });
    assert.equal(snapshot.status, "capturedSourceRecordsFailClosed");
    assert.deepEqual(snapshot.summary, {
        targetGameVersion: "7.0",
        rosterCount: 3,
        requestedRecords: 6,
        capturedRecords: 6,
        missingRecords: 0,
        sourceFamilyCount: 1,
        certificateEligibleClaims: 0,
        canonicalPromotionCount: 0
    });
});

test("capture binds exactly the three roster names and two record kinds without local-id inference", () => {
    const snapshot = checkedInCapture();
    assert.deepEqual(snapshot.claim.roster.map((entry) => [entry.rosterName, entry.providerSlug]), [
        ["Alyosha", "alyosha"],
        ["Odette", "odette"],
        ["Traveler", "travelercryo"]
    ]);
    assert.deepEqual(snapshot.claim.records.map((record) => [record.rosterName, record.providerSlug, record.recordKind]), capture.targetRecords.map((record) => [record.rosterName, record.providerSlug, record.recordKind]));
    for (const record of snapshot.claim.records) {
        assert.equal(record.localEntityId, null);
        assert.equal(record.identityStatus, "providerRecordIdentityOnly");
        assert.equal(record.status, "captured");
        assert.equal(record.explicitEmbeddedIdentity, true);
        assert.match(record.gitBlob, /^[a-f0-9]{40}$/);
        assert.match(record.rawArtifactSha256, /^[a-f0-9]{64}$/);
        assert.ok(Number.isInteger(record.embeddedId));
        assert.equal(typeof record.embeddedName, "string");
        assert.ok(record.embeddedName.length > 0);
        assert.ok(record.structuredSummary.topLevelKeys.includes("id"));
        assert.ok(record.structuredSummary.topLevelKeys.includes("name"));
        assert.ok(record.structuredSummary.sections.length > 0);
    }
});

test("structured extraction is tangible while numeric, identity, and corroboration gates remain explicit", () => {
    const snapshot = checkedInCapture();
    const talentRecords = snapshot.claim.records.filter((record) => record.recordKind === "talents");
    assert.ok(talentRecords.every((record) => record.structuredSummary.attributeLabelCount > 0));
    assert.ok(talentRecords.every((record) => record.structuredSummary.sections.some((section) => section.labels.length > 0)));
    assert.match(snapshot.claim.prerequisites.numericScaling, /parameterized labels/);
    assert.match(snapshot.claim.prerequisites.localEntityId, /unresolved/);
    assert.match(snapshot.claim.prerequisites.independentProvider, /one genshin-db/);
    assert.equal(snapshot.claim.gateEligibility.canIssueEligibilityCertificate, false);
    assert.equal(snapshot.claim.gateEligibility.canPromoteCanonical, false);
    assert.ok(snapshot.claim.gateEligibility.reasons.includes("independentProviderCorroborationMissing"));
    assert.ok(snapshot.claim.gateEligibility.reasons.includes("localEntityIdUnresolved"));
});

test("validator re-reads raw bytes and rejects a rehashed forged digest", () => {
    const forged = rehash(checkedInCapture());
    forged.claim.records[0].rawArtifactSha256 = "0".repeat(64);
    rehash(forged);
    const result = capture.validateCapture(forged, { repositoryRoot });
    assert.equal(result.valid, false);
    assert.ok(result.reasons.includes("rawArtifactBindingInvalid:talents/alyosha"));
});

test("validator rejects a missing raw artifact and a forged embedded identity", () => {
    const missing = checkedInCapture();
    missing.claim.records[1].path = "games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/r2-new-roster/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/Japanese/constellations/not-present.json";
    rehash(missing);
    const missingResult = capture.validateCapture(missing, { repositoryRoot });
    assert.equal(missingResult.valid, false);
    assert.ok(missingResult.reasons.includes("rawArtifactPathInvalid:constellations/alyosha") || missingResult.reasons.includes("rawArtifactMissing:constellations/alyosha"));

    const identity = checkedInCapture();
    identity.claim.records[2].embeddedId = identity.claim.records[2].embeddedId + 1;
    rehash(identity);
    const identityResult = capture.validateCapture(identity, { repositoryRoot });
    assert.equal(identityResult.valid, false);
    assert.ok(identityResult.reasons.includes("embeddedIdentityInvalid:talents/odette"));
});

test("acquire is idempotent and does not refetch verified present blobs", async () => {
    const previousFetch = global.fetch;
    global.fetch = () => { throw new Error("network should not be used for verified present blobs"); };
    try {
        await capture.acquire();
    } finally {
        global.fetch = previousFetch;
    }
});
