"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..", "..");
const review = require(path.join(root, "scripts", "genshinBehaviorRepresentativeReviewApply.cjs"));
const pilotModule = require(path.join(root, "scripts", "genshinBehaviorRepresentativeReviewPilot.cjs"));
const generator = require(path.join(root, "scripts", "genshinCanonicalRuntimeGenerate.cjs"));
const { createBrowserScriptHarness, loadCalcData, setElement } = require("./helpers/browserScriptHarness.cjs");
const modifierId = review.modifierId;

function loadBrowserContract() {
    const sandbox = { window: {}, console };
    vm.createContext(sandbox);
    ["genshinDataContract.js", "genshinCalcData.js"].forEach((name) => {
        vm.runInContext(fs.readFileSync(path.join(root, "games", "js", name), "utf8"), sandbox);
    });
    return sandbox.window.GenshinCalcData;
}

test("the scoped human decision promotes only Xiao C1 and forbids independence reuse", () => {
    const applied = review.applyReview();
    assert.equal(applied.modifier.verification.status, "verified");
    assert.equal(applied.modifier.verification.reviewedBy, "user:workspace-owner");
    assert.equal(applied.modifier.verification.canonicalEligibility, true);
    assert.equal(applied.decision.constraints.appliesOnlyToModifier, modifierId);
    assert.equal(applied.decision.constraints.providerIndependenceReuse, "forbidden");
    assert.equal(Object.keys(applied.output.modifiers).length, 1);
});

test("Xiao review reuse fails closed on behavior, lineage, or accepted-version drift", () => {
    const decision = JSON.parse(fs.readFileSync(path.join(root, "games/genshin/data/v2/reviews/behavior-xiao-c1-charges.json"), "utf8"));
    const pilot = pilotModule.buildPilot();
    assert.doesNotThrow(() => review.assertReviewStillApplies({ decision, pilot }));
    const changed = structuredClone(pilot);
    changed.runtimeCandidate.value = 2;
    assert.throws(() => review.assertReviewStillApplies({ decision, pilot: changed }), /facts changed/);
    const correlated = structuredClone(pilot);
    correlated.sourceRecords.genshinDbTalent.independenceGroup = "gachabase-versioned-data";
    assert.throws(() => review.assertReviewStillApplies({ decision, pilot: correlated }), /lineage changed/);
    assert.throws(() => review.assertReviewStillApplies({
        decision,
        pilot,
        versionBaseline: { status: "driftDetected", canonicalGateOpen: false, targetGameVersion: { gameVersion: "6.8" } }
    }), /baseline drifted/);
});

test("canonical generator materializes the reviewed BehaviorSpec and modifier", () => {
    const runtime = generator.buildRepositoryRuntime();
    assert.equal(runtime.summary.canonical, 2);
    assert.equal(runtime.summary.activeForProduction, 0);
    assert.equal(runtime.summary.inactivePendingRevalidation, 2);
    const modifier = runtime.modifiers[modifierId];
    assert.ok(modifier);
    assert.equal(modifier.provenance.reviewedBy, "user:workspace-owner");
    assert.deepEqual(modifier.provenance.independenceGroups, ["GenshinData-derived", "gachabase-versioned-data"]);
    assert.equal(modifier.targetSpec.execution.charges.value, 2);
    assert.equal(modifier.path, "/execution/charges");
    assert.equal(modifier.operation, "add");
    assert.equal(modifier.value, 1);
});

test("production loader holds Xiao's 6.7 overlay while the historical route remains reproducible", () => {
    const runtime = JSON.parse(fs.readFileSync(path.join(root, "games", "genshin", "data", "v2", "runtime", "canonical-runtime.json"), "utf8"));
    const api = loadBrowserContract();
    const productionData = { behaviorModifiers: {} };
    const productionSummary = api.applyCanonicalRuntime(productionData, runtime, []);
    assert.equal(productionSummary.applied, 0);
    assert.equal(productionSummary.inactivePendingRevalidation, 2);
    assert.equal(productionData.behaviorSpecs, undefined);
    const historicalRuntime = structuredClone(runtime);
    historicalRuntime.versionAvailability = { status: "active", activeForProduction: true };
    const data = { behaviorModifiers: {} };
    const summary = api.applyCanonicalRuntime(data, historicalRuntime, []);
    assert.equal(summary.applied, 1);
    assert.equal(summary.rejected, 1);
    assert.equal(data.behaviorSpecs[review.targetSpecId].execution.charges.value, 2);
    const c0 = api.resolveBehaviorModifiers(data, { characterId: "10000026", constellation: 0 });
    const c1 = api.resolveBehaviorModifiers(data, { characterId: "10000026", constellation: 1 });
    assert.equal(c0.appliedCount, 0);
    assert.equal(c1.appliedCount, 1);
    assert.equal(c1.applied[0].result.baseValue, 2);
    assert.equal(c1.applied[0].result.delta, 1);
    assert.equal(c1.applied[0].result.resolvedValue, 3);
});

test("Calculation and UI consume the shared Behavior resolution with no Xiao branch", () => {
    const engine = fs.readFileSync(path.join(root, "games", "js", "genshinCalcEngine.js"), "utf8");
    const renderer = fs.readFileSync(path.join(root, "games", "js", "genshinCalcRenderer.js"), "utf8");
    assert.match(engine, /resolveBehaviorModifiers\(calcData, context\)/);
    assert.match(renderer, /renderBehaviorResolution\(payload\.behaviorResolution\)/);
    assert.match(renderer, /item\.result\.baseValue/);
    assert.match(renderer, /item\.result\.resolvedValue/);
    assert.doesNotMatch(engine, /10000026:C1|風輪両立/);
    assert.doesNotMatch(renderer, /10000026:C1|風輪両立/);
});

test("the retained 6.7 fixture still carries Xiao C1 through the common CalculationRequest route", () => {
    const harness = createBrowserScriptHarness([
        "games/js/genshinDataContract.js",
        "games/js/genshinCalcData.js",
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinPartyModifiers.js",
        "games/js/genshinCalcEngine.js"
    ]);
    const calcData = loadCalcData();
    const runtime = JSON.parse(fs.readFileSync(path.join(root, "games", "genshin", "data", "v2", "runtime", "canonical-runtime.json"), "utf8"));
    runtime.versionAvailability = { status: "active", activeForProduction: true };
    harness.sandbox.GenshinCalcData.applyCanonicalRuntime(calcData, runtime, []);
    const values = {
        genshinCalcCharacterId: "10000026",
        genshinReflectCharacter: "10000026",
        genshinReflectConstellation: "C1",
        genshinReflectLevel: 90,
        genshinCalcWeaponId: "",
        genshinWeaponRefinement: "R1",
        genshinNormalTalentLevel: 10,
        genshinSkillTalentLevel: 10,
        genshinBurstTalentLevel: 10,
        genshinHpInput: 20000,
        genshinBaseHpInput: 10000,
        genshinBaseAtkInput: 1000,
        genshinAtkInput: 2000,
        genshinBaseDefInput: 500,
        genshinDefInput: 1000,
        genshinElementalMasteryInput: 100,
        genshinCritRateInput: 50,
        genshinCritDamageInput: 100,
        genshinEnergyRechargeInput: 100,
        genshinElementalDamageInput: 50,
        genshinEnemyLevelInput: 90,
        genshinEnemyElementalResistanceInput: 10,
        genshinEnemyPhysicalResistanceInput: 10,
        genshinElementalResistanceDebuffInput: 0,
        genshinPhysicalResistanceDebuffInput: 0,
        genshinDefenseReductionInput: 0,
        genshinDefenseIgnoreInput: 0,
        genshinJsonReactionOption: "none"
    };
    Object.entries(values).forEach(([id, value]) => setElement(harness.elements, id, value));
    const context = harness.sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    const payload = harness.sandbox.GenshinCalcEngine.calculateDamageRequest(context, calcData);
    assert.equal(payload.behaviorResolution.appliedCount, 1);
    assert.equal(payload.behaviorResolution.applied[0].result.baseValue, 2);
    assert.equal(payload.behaviorResolution.applied[0].result.resolvedValue, 3);
});
