"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const versionPolicy = require(path.resolve(__dirname, "../../scripts/genshinGameVersionPolicy.cjs"));
const baseline = require(path.resolve(__dirname, "../../scripts/genshinVersionBaseline.cjs"));

test("current game version is derived only from strictly revision-bound catalog evidence", () => {
    const digest = "a".repeat(64);
    const catalog = { sources: {
        old: { revision: "r1", gameVersion: "6.7", gameVersionEvidence: { kind: "providerDatasetManifest", gameVersion: "6.7", locator: { dataset: "fixture", record: "manifest@r1" }, integrity: { algorithm: "sha256", digest }, binding: { revision: "r1", metadataDigest: digest } } },
        newerUnbound: { revision: "r2", gameVersion: "6.8", gameVersionEvidence: null }
    } };
    assert.equal(versionPolicy.deriveCurrentGameVersion(catalog).gameVersion, "6.7");
});

test("malformed and conflicting strict version evidence closes the version gate", () => {
    const digest = "b".repeat(64);
    const source = (revision, gameVersion) => ({
        revision,
        gameVersion,
        gameVersionEvidence: {
            kind: "providerDatasetManifest",
            gameVersion,
            locator: { dataset: "fixture", record: `manifest@${revision}` },
            integrity: { algorithm: "sha256", digest },
            binding: { revision, metadataDigest: digest }
        }
    });
    const malformed = source("r1", "6.7");
    delete malformed.gameVersionEvidence.locator.record;
    assert.equal(versionPolicy.deriveCurrentGameVersion({ sources: { malformed } }).status, "unbound");
    const conflict = versionPolicy.deriveCurrentGameVersion({ sources: { first: source("r1", "6.7"), second: source("r2", "6.8") } });
    assert.equal(conflict.status, "conflict");
    assert.equal(conflict.gameVersion, null);
    assert.deepEqual(conflict.conflictingVersions, ["6.7", "6.8"]);
});

test("entity and target-version drift are deterministic and fail closed", () => {
    const before = { targetGameVersion: { gameVersion: "6.7" }, sourceCatalogDigest: "a", datasets: { "characters.json": { digest: "x", entities: { "100": "one" } } } };
    const after = { targetGameVersion: { gameVersion: "6.8" }, sourceCatalogDigest: "b", datasets: { "characters.json": { digest: "y", entities: { "100": "two", "101": "three" } } } };
    assert.deepEqual(baseline.diffSnapshots(before, after).map((item) => item.kind), ["targetGameVersionChanged", "sourceCatalogChanged", "entityChanged", "entityAdded"]);
});

test("materialized accepted baseline matches current Genshin raw datasets", () => {
    const report = baseline.auditBaseline();
    assert.equal(report.status, "current", JSON.stringify(report.changes));
    assert.equal(report.canonicalGateOpen, true);
});

test("accepted baseline cannot be silently replaced after tracked data or policy coverage drifts", () => {
    assert.equal(baseline.TRACKED_DATASETS.includes("calc/reaction-definitions.json"), true);
    assert.equal(baseline.TRACKED_DATASETS.includes("calc/weapon-modifiers.json"), true);
    assert.equal(baseline.TRACKED_DATASETS.includes("calc/talent-scalings.json"), true);
    assert.equal(baseline.TRACKED_DATASETS.includes("base-stats.json"), true);
    assert.equal(baseline.TRACKED_DATASETS.includes("enemies.json"), true);
    const previous = { snapshotId: "old" };
    const current = { snapshotId: "new" };
    assert.throws(() => baseline.assertBaselineReplacementAllowed(previous, current), /accepted baseline differs/);
    assert.doesNotThrow(() => baseline.assertBaselineReplacementAllowed(previous, current, true));
});

test("accepted baseline validates its content-addressed snapshot id", () => {
    const current = baseline.buildSnapshot();
    assert.equal(baseline.validateBaseline(current).valid, true);
    assert.deepEqual(baseline.validateBaseline({ ...current, snapshotId: "forged" }).reasons, ["snapshotIdInvalid"]);
});
