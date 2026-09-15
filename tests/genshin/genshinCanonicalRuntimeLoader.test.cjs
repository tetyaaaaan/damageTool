"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const generator = require(path.join(root, "scripts", "genshinCanonicalRuntimeGenerate.cjs"));
const fixture = JSON.parse(fs.readFileSync(path.join(root, "games", "genshin", "data", "v2", "runtime", "fixtures.json"), "utf8"));
const { materializeHumanFixtureVerification } = require("./helpers/canonicalFixtureVerification.cjs");
const DIGEST = "a".repeat(64);

function loadBrowserContracts() {
    const sandbox = { window: {}, console, fetch: async () => { throw new Error("fetch is not used in this test"); } };
    vm.createContext(sandbox);
    ["genshinDataContract.js", "genshinCalcData.js"].forEach((name) => {
        vm.runInContext(fs.readFileSync(path.join(root, "games", "js", name), "utf8"), sandbox);
    });
    return sandbox.window;
}

function canonicalFixtureModifier() {
    const built = generator.buildCanonicalRuntime({
        specs: materializeHumanFixtureVerification(fixture.specs, fixture.sourceRecords),
        sourceRecords: fixture.sourceRecords,
        behaviorModifiers: {}
    });
    assert.equal(built.summary.canonical, 1, JSON.stringify(built.excluded));
    return JSON.parse(JSON.stringify(built.modifiers.fixture_runtime_damage));
}

function canonicalBehaviorModifier() {
    const built = generator.buildCanonicalRuntime({
        specs: materializeHumanFixtureVerification(fixture.specs, fixture.sourceRecords),
        sourceRecords: fixture.sourceRecords,
        behaviorModifiers: materializeHumanFixtureVerification(fixture.behaviorModifiers, fixture.sourceRecords)
    });
    assert.equal(built.summary.canonical, 2, JSON.stringify(built.excluded));
    return JSON.parse(JSON.stringify(built.modifiers["fixture:behavior:duration"]));
}

function baseCalcData() {
    return {
        weaponModifiers: { "fixture-weapon": { modifiers: [
            { id: "fixture_legacy_damage_bonus", category: "damageBonus" },
            { id: "fixture_unrelated", category: "statBonus" }
        ] } },
        weaponEffectRegistry: { weapons: { "fixture-weapon": { groups: [{
            id: "fixture_group",
            modifierIds: ["fixture_legacy_damage_bonus"],
            modifierOverrides: { fixture_legacy_damage_bonus: { auditDisposition: "legacyOnly" } }
        }] } } },
        artifactSetModifiers: {},
        talentModifiers: {},
        constellationModifiers: {},
        behaviorModifiers: {}
    };
}

test("loader atomically replaces declared legacy IDs with an eligible canonical modifier", () => {
    const api = loadBrowserContracts().GenshinCalcData;
    const data = baseCalcData();
    const modifier = canonicalFixtureModifier();
    const warnings = [];
    const summary = api.applyCanonicalRuntime(data, { modifiers: { [modifier.id]: modifier } }, warnings);
    assert.deepEqual(JSON.parse(JSON.stringify(summary)), { offered: 1, applied: 1, rejected: 0, superseded: 1 });
    assert.deepEqual(data.weaponModifiers["fixture-weapon"].modifiers.map((item) => item.id), ["fixture_unrelated", "fixture_runtime_damage"]);
    assert.deepEqual(JSON.parse(JSON.stringify(data.weaponEffectRegistry.weapons["fixture-weapon"].groups[0].modifierIds)), ["fixture_runtime_damage"]);
    assert.deepEqual(JSON.parse(JSON.stringify(data.weaponEffectRegistry.weapons["fixture-weapon"].groups[0].modifierOverrides)), {});
    assert.equal(warnings.length, 0);
});

test("loader rejects missing supersession targets without mutating the destination", () => {
    const api = loadBrowserContracts().GenshinCalcData;
    const data = baseCalcData();
    const before = JSON.stringify(data);
    const modifier = canonicalFixtureModifier();
    modifier.supersedesLegacyModifierIds = ["not_present"];
    modifier.runtime.supersedesLegacyModifierIds = ["not_present"];
    const warnings = [];
    const summary = api.applyCanonicalRuntime(data, { modifiers: { [modifier.id]: modifier } }, warnings);
    assert.equal(summary.applied, 0);
    assert.equal(summary.rejected, 1);
    assert.equal(JSON.stringify(data), before);
    assert.match(warnings[0].message, /supersession target is absent/);
});

test("loader places a verified behavior modifier in its dedicated route", () => {
    const api = loadBrowserContracts().GenshinCalcData;
    const data = baseCalcData();
    const modifier = canonicalBehaviorModifier();
    const warnings = [];
    const summary = api.applyCanonicalRuntime(data, { modifiers: { [modifier.id]: modifier } }, warnings);
    assert.deepEqual(JSON.parse(JSON.stringify(summary)), { offered: 1, applied: 1, rejected: 0, superseded: 0 }, JSON.stringify(warnings));
    assert.deepEqual(JSON.parse(JSON.stringify(data.behaviorModifiers["fixture-weapon"].modifiers.map((item) => item.id))), ["fixture:behavior:duration"]);
    assert.equal(data.behaviorModifiers["fixture-weapon"].modifiers[0].operation, "replace");
    assert.equal(data.behaviorSpecs["fixture:weapon:damage"].timing.duration.value, 10);
});

test("loader rejects behavior destinations with unrelated route keys", () => {
    const api = loadBrowserContracts().GenshinCalcData;
    const data = baseCalcData();
    const modifier = canonicalBehaviorModifier();
    modifier.destination.sourceId = "unexpected";
    modifier.runtime.destination.sourceId = "unexpected";
    const summary = api.applyCanonicalRuntime(data, { modifiers: { [modifier.id]: modifier } }, []);
    assert.equal(summary.applied, 0);
    assert.equal(summary.rejected, 1);
    assert.deepEqual(data.behaviorModifiers, {});
});

test("loader rejects malformed behavior operations even with canonical provenance", () => {
    const api = loadBrowserContracts().GenshinCalcData;
    const data = baseCalcData();
    const modifier = canonicalBehaviorModifier();
    modifier.operation = "inventedOperation";
    const summary = api.applyCanonicalRuntime(data, { modifiers: { [modifier.id]: modifier } }, []);
    assert.equal(summary.applied, 0);
    assert.equal(summary.rejected, 1);
    assert.deepEqual(data.behaviorModifiers, {});
});

test("loader rejects forged producer metadata and unreviewed provenance", () => {
    const api = loadBrowserContracts().GenshinCalcData;
    const data = baseCalcData();
    const first = canonicalFixtureModifier();
    first.runtime.generator = "unknown-generator";
    const second = canonicalFixtureModifier();
    second.id = "fixture_runtime_unreviewed";
    second.runtime.modifierIds = [second.id];
    second.provenance.verification.status = "needsReview";
    const summary = api.applyCanonicalRuntime(data, { modifiers: { [first.id]: first, [second.id]: second } }, []);
    assert.equal(summary.applied, 0);
    assert.equal(summary.rejected, 2);
    assert.deepEqual(data.weaponModifiers["fixture-weapon"].modifiers.map((item) => item.id), ["fixture_legacy_damage_bonus", "fixture_unrelated"]);
});

test("empty repository canonical output is a no-op", () => {
    const api = loadBrowserContracts().GenshinCalcData;
    const data = baseCalcData();
    const before = JSON.stringify(data);
    const summary = api.applyCanonicalRuntime(data, { modifiers: {} }, []);
    assert.deepEqual(JSON.parse(JSON.stringify(summary)), { offered: 0, applied: 0, rejected: 0, superseded: 0 });
    assert.equal(JSON.stringify(data), before);
});

test("loader rejects a stale runtime whose accepted snapshot does not match the loaded baseline", () => {
    const api = loadBrowserContracts().GenshinCalcData;
    const data = baseCalcData();
    const modifier = canonicalFixtureModifier();
    const runtime = {
        versionBinding: { status: "strictlyBound", gameVersion: "6.0", acceptedSnapshotId: "old", sourceCatalogDigest: DIGEST },
        modifiers: { [modifier.id]: modifier }
    };
    const baseline = {
        targetGameVersion: { status: "strictlyBound", gameVersion: "6.0" },
        snapshotId: "current",
        sourceCatalogDigest: DIGEST
    };
    const warnings = [];
    const summary = api.applyCanonicalRuntime(data, runtime, warnings, baseline);
    assert.equal(summary.applied, 0);
    assert.equal(summary.rejected, 1);
    assert.match(warnings[0].message, /version baseline binding mismatch/);
});

test("loader keeps legacy calculation intact while a version-bound canonical overlay awaits live-version revalidation", () => {
    const api = loadBrowserContracts().GenshinCalcData;
    const data = baseCalcData();
    const before = JSON.stringify(data);
    const modifier = canonicalFixtureModifier();
    const runtime = {
        versionBinding: { status: "strictlyBound", gameVersion: "6.7", acceptedSnapshotId: "accepted-6.7", sourceCatalogDigest: DIGEST },
        versionAvailability: {
            status: "inactivePendingRevalidation",
            activeForProduction: false,
            verifiedGameVersion: "6.7",
            observedLiveVersion: "7.0",
            reason: "target-version revalidation is pending"
        },
        modifiers: { [modifier.id]: modifier }
    };
    const baseline = {
        targetGameVersion: { status: "strictlyBound", gameVersion: "6.7" },
        snapshotId: "accepted-6.7",
        sourceCatalogDigest: DIGEST
    };
    const head = {
        schemaVersion: 1,
        kind: "genshinUpstreamVersionHead",
        observedGameVersion: "7.0",
        evidence: {
            kind: "officialReleaseNotes",
            providerFamily: "official-hoyoverse",
            rawApiResponseDigest: DIGEST,
            fieldDigest: DIGEST,
            claim: { gameVersion: "7.0" }
        }
    };
    const warnings = [];
    const summary = api.applyCanonicalRuntime(data, runtime, warnings, baseline, head);
    assert.equal(summary.applied, 0);
    assert.equal(summary.rejected, 1);
    assert.equal(summary.inactivePendingRevalidation, 1);
    assert.equal(summary.versionAvailability.acceptedVersion, "6.7");
    assert.equal(summary.versionAvailability.observedLiveVersion, "7.0");
    assert.equal(JSON.stringify(data), before);
    assert.match(warnings[0].message, /inactive pending revalidation/);
});

test("loader reopens a regenerated canonical overlay only when accepted and official live versions agree", () => {
    const api = loadBrowserContracts().GenshinCalcData;
    const data = baseCalcData();
    const modifier = canonicalFixtureModifier();
    const runtime = {
        versionBinding: { status: "strictlyBound", gameVersion: "6.0", acceptedSnapshotId: "accepted-current", sourceCatalogDigest: DIGEST },
        versionAvailability: { status: "active", activeForProduction: true, verifiedGameVersion: "6.0", observedLiveVersion: "6.0" },
        modifiers: { [modifier.id]: modifier }
    };
    const baseline = {
        targetGameVersion: { status: "strictlyBound", gameVersion: "6.0" },
        snapshotId: "accepted-current",
        sourceCatalogDigest: DIGEST
    };
    const head = {
        schemaVersion: 1,
        kind: "genshinUpstreamVersionHead",
        observedGameVersion: "6.0",
        evidence: {
            kind: "officialReleaseNotes",
            providerFamily: "official-hoyoverse",
            rawApiResponseDigest: DIGEST,
            fieldDigest: DIGEST,
            claim: { gameVersion: "6.0" }
        }
    };
    const summary = api.applyCanonicalRuntime(data, runtime, [], baseline, head);
    assert.equal(summary.applied, 1);
    assert.equal(summary.rejected, 0);
    assert.deepEqual(data.weaponModifiers["fixture-weapon"].modifiers.map((item) => item.id), ["fixture_unrelated", "fixture_runtime_damage"]);
});
