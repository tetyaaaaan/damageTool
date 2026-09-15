"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const dataRoot = path.join(root, "games", "genshin", "data");
const pilotPath = path.join(dataRoot, "v2", "weapons", "official-pilot.json");
const sourceCatalogPath = path.join(dataRoot, "v2", "source-catalog.json");
const externalEvidencePath = path.join(dataRoot, "v2", "weapons", "external-evidence.json");
const generator = require(path.join(root, "scripts", "genshinOfficialWeaponPilotGenerate.cjs"));
const auditor = require(path.join(root, "scripts", "genshinOfficialWeaponPilotAudit.cjs"));

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

test("official weapon pilot passes its fail-closed audit", () => {
    const pilot = readJson(pilotPath);
    const report = auditor.auditPilot({
        pilot,
        sourceCatalog: readJson(sourceCatalogPath),
        externalEvidence: readJson(externalEvidencePath)
    });
    assert.equal(report.status, "passed", report.errors.join("\n"));
    assert.equal(report.summary.weapons, 2);
    assert.equal(report.summary.officialSources, 3);
    assert.equal(report.summary.explicitGameVersionSources, 3);
    assert.equal(report.summary.completeOfficialRefinementClaims, 0);
    assert.equal(report.summary.canonicalEligibility, 0);
    assert.equal(report.summary.promotionGate, "blocked");
    assert.equal(report.summary.rankOneMatches, 3);
    assert.equal(report.summary.errors, 0);
});

test("Amos official R1 fields match independent gcsim but remain partial", () => {
    const pilot = readJson(pilotPath);
    const amos = pilot.records["15502"];
    assert.deepEqual(amos.officialGameVersions, ["1.2"]);
    assert.deepEqual(amos.officialClaims.map((claim) => `${claim.candidateId}:${claim.field}`), [
        "w_15502_damage_1:value",
        "w_15502_damageBonus_fc388315:value",
        "w_15502_damageBonus_fc388315:stack"
    ]);
    assert.deepEqual(amos.officialClaims[0].structuredValue, { "1": 12 });
    assert.deepEqual(amos.officialClaims[1].structuredValue, { "1": 8 });
    assert.deepEqual(amos.officialClaims[2].structuredValue, { min: 0, max: 5, intervalSeconds: 0.1 });
    assert.ok(amos.comparisons.every((comparison) => comparison.rankOneValueMatch === true));
    assert.ok(amos.blockedReasons.includes("officialRefinementTableMissing"));
    assert.ok(amos.blockedReasons.includes("officialFieldScopeOnlyRefinement1"));
    assert.equal(amos.canonicalEligibility, false);
    assert.equal(amos.supersession.action, "none");
});

test("Freedom-Sworn official pages provide version identity but no inferred field values", () => {
    const pilot = readJson(pilotPath);
    const freedom = pilot.records["11503"];
    assert.deepEqual(freedom.officialGameVersions, ["1.6"]);
    assert.deepEqual(freedom.officialClaims, []);
    assert.equal(freedom.independentSource.gameVersion, null);
    assert.equal(freedom.independentSource.gameVersionVerified, false);
    assert.ok(freedom.blockedReasons.includes("officialFieldValuesMissing"));
    assert.equal(freedom.supersession.action, "none");
});

test("official snapshots are article-bound and never use legacy data as primary proof", () => {
    const pilot = readJson(pilotPath);
    for (const source of Object.values(pilot.sources)) {
        assert.equal(source.role, "officialPrimary");
        assert.equal(source.revisionPinned, false);
        assert.equal(source.identityPinned, true);
        assert.equal(source.contentRevisionPinned, false);
        assert.equal(source.immutable, false);
        assert.equal(source.snapshot.contentAddressed, true);
        assert.equal(source.sourceReviewStatus, "needsReview");
        assert.equal(source.snapshot.captureVerification, "manuallyMaterializedNeedsIndependentReview");
        assert.equal(source.gameVersionVerified, true);
        assert.equal(source.gameVersionEvidence.binding.revision, source.revision);
        assert.equal(source.gameVersionEvidence.binding.metadataDigest, source.snapshot.sha256);
        assert.match(source.url, /^https:\/\/(www\.)?hoyolab\.com\//);
    }
    for (const record of Object.values(pilot.records)) {
        assert.equal(record.canonicalEligibility, false);
        assert.equal(record.supersession.action, "none");
        assert.ok(record.independentSource.revisionPinned);
        assert.equal(record.independentSource.gameVersionVerified, false);
        assert.match(record.independentSource.independenceGroup, /^gcsim-/);
    }
});

test("pilot generation is deterministic against the current pinned evidence", () => {
    const expected = generator.buildPilot({
        sourceCatalog: readJson(sourceCatalogPath),
        externalEvidence: readJson(externalEvidencePath)
    });
    assert.equal(generator.stableJson(expected), generator.stableJson(readJson(pilotPath)));
});
