"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..", "..");
const pilotModule = require(path.join(root, "scripts", "genshinRepresentativeReviewPilot.cjs"));
const reviewApply = require(path.join(root, "scripts", "genshinRepresentativeReviewApply.cjs"));

test("weapon 12516 pilot is human-review-ready but cannot enter canonical Runtime", () => {
    const pilot = pilotModule.buildPilot();
    const audit = pilotModule.auditPilot(pilot);
    assert.equal(audit.status, "passed", audit.errors.join("\n"));
    assert.equal(pilot.assessment.machineEvidenceReady, true);
    assert.equal(pilot.assessment.state, "humanReviewReady");
    assert.equal(pilot.assessment.canonicalEligibility, false);
    assert.equal(pilot.assessment.productionCanonical, false);
    assert.equal(pilot.reviewPacket.verification.reviewedBy, null);
    assert.equal(pilot.reviewPacket.verification.reviewedAt, null);
});

test("clause-boundary correction removes reaction stack semantics from unconditional ATK", () => {
    const specs = JSON.parse(fs.readFileSync(path.join(root, "games/genshin/data/v2/weapons/spec-candidates.json"), "utf8"));
    const modifiers = JSON.parse(fs.readFileSync(path.join(root, "games/genshin/data/calc/weapon-modifiers.json"), "utf8"));
    const spec = specs.w_12516_stat_1;
    const modifier = modifiers["12516"].modifiers.find((item) => item.id === "w_12516_stat_1");
    for (const item of [spec.effect, modifier]) {
        assert.equal(item.stack, undefined);
        assert.equal(item.valueByRefinementPerStack, undefined);
        assert.deepEqual(item.valueByRefinement, { "1": 28, "2": 35, "3": 42, "4": 49, "5": 56 });
    }
    assert.equal(spec.verification.claims.stack.status, "notApplicable");
});

test("browser DataContract preserves the same pre-review/canonical separation", () => {
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(root, "games/js/genshinDataContract.js"), "utf8"), sandbox);
    const pilot = pilotModule.buildPilot();
    const spec = {
        verification: { ...pilot.reviewPacket.verification, claims: pilot.claims },
        interpretation: { method: "deterministicParser", author: "genshinWeaponV2Generate.cjs" },
        discrepancies: [],
        reviewPacketAvailable: true
    };
    const result = sandbox.window.GenshinDataContract.assessCanonicalEligibility(spec);
    assert.equal(result.machineEvidenceReady, true);
    assert.equal(result.canonicalEligibility, false);
    assert.equal(result.productionCanonical, false);
});

test("representative packet contains both strict 6.7 sources and every review decision", () => {
    const packet = pilotModule.buildPilot().reviewPacket;
    assert.equal(packet.sourceA.strictGameVersionBinding, true);
    assert.equal(packet.sourceB.strictGameVersionBinding, true);
    assert.equal(packet.sourceA.gameVersion, "6.7");
    assert.equal(packet.sourceB.gameVersion, "6.7");
    assert.equal(packet.providerIndependence.status, "independent");
    assert.deepEqual(packet.providerIndependence.groups, ["official-hoyoverse", "GenshinData-derived"]);
    assert.ok(packet.fieldComparison.every((row) => row.status === "match"));
    assert.deepEqual(packet.reviewDecisionOptions, ["approve", "reject", "hold"]);
});

test("existing review reuse fails closed when approved identity, values, scope, lineage, or version drift", () => {
    const pilot = pilotModule.buildPilot();
    const decision = JSON.parse(fs.readFileSync(path.join(root, "games/genshin/data/v2/reviews/weapon-12516-stat.json"), "utf8"));
    const specs = JSON.parse(fs.readFileSync(path.join(root, "games/genshin/data/v2/weapons/spec-candidates.json"), "utf8"));
    const spec = structuredClone(specs.w_12516_stat_1);
    assert.doesNotThrow(() => reviewApply.assertReviewStillApplies({ decision, pilot, spec }));

    const changedValue = structuredClone(spec);
    changedValue.effect.valueByRefinement[1] = 29;
    assert.throws(() => reviewApply.assertReviewStillApplies({ decision, pilot, spec: changedValue }), /values changed/);

    const changedScope = structuredClone(spec);
    changedScope.effect.targets.push("stellarSwirlDamageBonus");
    assert.throws(() => reviewApply.assertReviewStillApplies({ decision, pilot, spec: changedScope }), /target changed/);

    const changedLineage = structuredClone(pilot);
    changedLineage.sourceRecords.genshinDb.independenceGroup = "official-hoyoverse";
    assert.throws(() => reviewApply.assertReviewStillApplies({ decision, pilot: changedLineage, spec }), /lineage changed/);

    const drifted = { status: "driftDetected", canonicalGateOpen: false, targetGameVersion: { gameVersion: "6.8" } };
    assert.throws(() => reviewApply.assertReviewStillApplies({ decision, pilot, spec, versionBaseline: drifted }), /baseline drifted/);
});

test("weapon 12516 canonical mapping fields have exact deterministic Runtime provenance", () => {
    const specs = JSON.parse(fs.readFileSync(path.join(root, "games/genshin/data/v2/weapons/spec-candidates.json"), "utf8"));
    const spec = specs.w_12516_stat_1;
    assert.equal(spec.effect.kind, "statBonus");
    assert.deepEqual(spec.effect.targets, ["atkPercent"]);
    assert.equal(spec.effect.activation.condition, "always");
    assert.equal(spec.effect.activation.calculationSupport, "simple");
    assert.equal(spec.effect.activation.uidHandling, "includedInUidStats");
    assert.deepEqual(spec.destination, { dataset: "weaponModifiers", entityId: "12516", collection: "modifiers" });
    assert.deepEqual(spec.supersedesLegacyModifierIds, ["w_12516_stat_1"]);
    assert.deepEqual(spec.runtime.modifierIds, ["genshin:v2:weapon:12516:w_12516_stat_1"]);
    assert.equal(spec.interpretation.method, "deterministicParser");
    assert.equal(spec.interpretation.author, "genshinWeaponV2Generate.cjs");
});
