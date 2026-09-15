"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const capture = require(path.join(root, "scripts", "genshinOfficialWeaponFrontierCapture.cjs"));

function readJson(relativePath) { return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8")); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

test("official frontier is bounded to exactly the three requested weapon entities", () => {
    assert.deepEqual(capture.expectedEntityIds, ["11301", "11302", "11303"]);
    assert.deepEqual(capture.expectedCandidateIds, ["w_11301_damage_1", "w_11301_damageBonus_91cc873a", "w_11302_crit_1"]);
    assert.deepEqual(capture.requests().map((request) => request.requestId), [
        "aggregate-page-08", "aggregate-page-05", "aggregate-page-07", "entry-1938", "entry-2052", "entry-1977"
    ]);
});

test("captured official raw evidence resolves IDs and exact passive field keys", () => {
    const snapshot = capture.buildSnapshot();
    assert.equal(snapshot.status, "officialRawCapturedTargetVersionUnbound");
    assert.equal(snapshot.summary.entities, 3);
    assert.equal(snapshot.summary.directRawRecords, 3);
    assert.equal(snapshot.summary.aggregateRawRecords, 3);
    assert.equal(snapshot.summary.candidateClaims, 12);
    assert.equal(snapshot.summary.certificateEligibleClaims, 0);
    assert.equal(snapshot.summary.canonicalPromotionCount, 0);
    for (const entity of snapshot.claim.entities) {
        assert.equal(entity.sourceEvidence.entry.statusCode, 200, entity.entityId);
        assert.match(entity.sourceEvidence.entry.rawArtifactSha256, /^[a-f0-9]{64}$/, entity.entityId);
        assert.ok(entity.sourceEvidence.entry.rawArtifactBytes > 0, entity.entityId);
        assert.equal(entity.sourceEvidence.aggregate.entry.entryPageId, entity.provider.entryPageId, entity.entityId);
        assert.equal(entity.sourceEvidence.aggregate.entry.name, entity.provider.englishName, entity.entityId);
        assert.equal(entity.parsedFields.passive.key, ({ "11301": "Bane of Water and Ice", "11302": "Vigorous", "11303": "Journey" })[entity.entityId]);
        assert.ok(entity.parsedFields.passive.valueRaw, entity.entityId);
        assert.deepEqual(entity.providerVersionEvidence.strictGameVersionBinding, "missing");
        assert.deepEqual(entity.providerVersionEvidence.observedText, "1.0");
        assert.equal(entity.canIssueEligibilityCertificate, false);
        assert.equal(entity.canPromoteCanonical, false);
    }
    assert.equal(snapshot.claim.entities.find((entity) => entity.entityId === "11303").candidateClaims.length, 0);
});

test("official raw endpoint is explicitly mutable and cannot substitute for strict 7.0 evidence", () => {
    const snapshot = capture.buildSnapshot();
    assert.equal(snapshot.claim.sourceFamily, "official-hoyoverse");
    assert.equal(snapshot.claim.independenceGroup, "official-hoyoverse");
    assert.equal(snapshot.claim.immutable, false);
    assert.equal(snapshot.claim.revision.status, "mutableEndpointNoRevision");
    assert.equal(snapshot.claim.revision.value, null);
    assert.equal(snapshot.claim.gateDisposition.strictGameVersionBinding, "missing");
    assert.equal(snapshot.claim.gateDisposition.sourceFamilyCount, 1);
    assert.equal(snapshot.gateEligibility.canIssueEligibilityCertificate, false);
    assert.equal(snapshot.gateEligibility.canPromoteCanonical, false);
    for (const claim of snapshot.claim.candidateClaims) {
        assert.equal(claim.strictGameVersionBinding.targetGameVersion, "7.0");
        assert.equal(claim.strictGameVersionBinding.status, "missing");
        assert.equal(claim.strictGameVersionBinding.captureTimestampIsNotVersionEvidence, true);
        assert.equal(claim.disposition.status, "blocked");
        assert.equal(claim.disposition.canIssueEligibilityCertificate, false);
        assert.equal(claim.disposition.canPromoteCanonical, false);
        assert.equal(claim.providerField.status, "rawFieldPresent");
        assert.equal(claim.fieldCoverage.structuredClaimValue, "notMaterialized");
    }
});

test("11301 and 11302 reuse only validated pinned genshin-db identity aids, while 11303 remains unbound", () => {
    const snapshot = capture.buildSnapshot();
    const first = snapshot.claim.entities.find((entity) => entity.entityId === "11301");
    const second = snapshot.claim.entities.find((entity) => entity.entityId === "11302");
    const traveler = snapshot.claim.entities.find((entity) => entity.entityId === "11303");
    for (const entity of [first, second]) {
        assert.equal(entity.identityResolution.status, "resolvedByLocalCatalogAndValidatedPinnedGenshinDbAid");
        const aid = entity.identityResolution.existingPinnedGenshinDbAid;
        assert.equal(aid.status, "reusedValidatedPinnedRevisionAid");
        assert.equal(aid.gameVersion, "7.0");
        assert.match(aid.sha256, /^[a-f0-9]{64}$/);
        assert.match(aid.gitBlobSha, /^[a-f0-9]{40}$/);
        assert.equal(aid.packageEvidence.status, "strictlyBound");
        assert.match(aid.packageEvidence.sha256, /^[a-f0-9]{64}$/);
        assert.match(aid.packageEvidence.gitBlobSha, /^[a-f0-9]{40}$/);
    }
    assert.equal(traveler.identityResolution.status, "officialEntryResolvedButLocalNumericIdUnbound");
    assert.equal(traveler.identityResolution.existingPinnedGenshinDbAid, null);
    assert.equal(traveler.candidateCoverage, "noV2CandidateClaimForEntity");
});

test("field-level raw locators point to the captured immutable bytes, but no semantic claim is inferred", () => {
    const snapshot = capture.buildSnapshot();
    const entity = snapshot.claim.entities.find((candidate) => candidate.entityId === "11301");
    for (const claim of entity.candidateClaims) {
        assert.equal(claim.providerField.key, "Bane of Water and Ice");
        const rawPath = path.join(root, claim.providerField.rawLocator.rawArtifactPath);
        const bytes = fs.readFileSync(rawPath);
        assert.equal(bytes.length, claim.providerField.rawLocator.rawArtifactBytes);
        assert.match(claim.providerField.rawLocator.rawArtifactSha256, /^[a-f0-9]{64}$/);
        assert.equal(claim.fieldCoverage.noNumericInference, true);
        assert.equal(claim.fieldCoverage.noTranslationInference, true);
    }
});

test("snapshot/checkpoint schemas and deterministic fail-closed validators are present", () => {
    const snapshot = readJson("games/genshin/data/v2/version-transitions/6.7-to-7.0/official-weapon-frontier-11301-11303-snapshot.json");
    const checkpoint = readJson("games/genshin/data/v2/version-transitions/6.7-to-7.0/official-weapon-frontier-11301-11303-capture-checkpoint.json");
    const snapshotSchema = readJson("games/genshin/data/schema/version-transition-official-weapon-frontier-snapshot.schema.json");
    const checkpointSchema = readJson("games/genshin/data/schema/version-transition-official-weapon-frontier-capture-checkpoint.schema.json");
    assert.equal(snapshotSchema.$id, "genshin-version-transition-official-weapon-frontier-snapshot.schema.json");
    assert.equal(checkpointSchema.$id, "genshin-version-transition-official-weapon-frontier-capture-checkpoint.schema.json");
    assert.deepEqual(capture.validateSnapshot(snapshot, { compareCurrent: true }), { valid: true, reasons: [] });
    assert.deepEqual(capture.validateCheckpoint(checkpoint), { valid: true, reasons: [] });
    assert.equal(checkpoint.status, "complete");
    assert.deepEqual(checkpoint.capturedEntityIds, ["11301", "11302", "11303"]);
    assert.deepEqual(checkpoint.capturedAggregatePages, [5, 7, 8]);
});

test("forged field digest cannot pass the fail-closed validator", () => {
    const snapshot = capture.buildSnapshot();
    const forged = clone(snapshot);
    forged.claim.entities[0].parsedFields.passive.valueRaw = ["forged official value"];
    assert.equal(capture.validateSnapshot(forged).valid, false);
    assert.ok(capture.validateSnapshot(forged).reasons.includes("fieldDigestInvalid"));
});
