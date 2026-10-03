"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { createScenarioHarness, prepareScenarioInputs } = require("./helpers/calcScenarioHarness.cjs");

const root = path.resolve(__dirname, "../..");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));

function loadProvisionalData(calcData) {
    const sandbox = { window: {}, console, fetch: async () => { throw new Error("fetch is not used"); } };
    vm.createContext(sandbox);
    ["genshinDataContract.js", "genshinCalcData.js"].forEach((name) => {
        vm.runInContext(fs.readFileSync(path.join(root, "games/js", name), "utf8"), sandbox, { filename: name });
    });
    sandbox.window.GenshinCalcData.applyProvisional70Data(calcData, [
        readJson("games/genshin/data/v2/candidates/7.0-provisional-characters.json"),
        readJson("games/genshin/data/v2/candidates/7.0-provisional-weapons.json"),
        readJson("games/genshin/data/v2/candidates/7.0-provisional-stellar-swirl.json")
    ], []);
}

function fixture({ characterId = "10000037", weaponId, refinement = 1, stats = {} }) {
    const scenario = createScenarioHarness();
    loadProvisionalData(scenario.calcData);
    prepareScenarioInputs(scenario.elements, { characterId, weaponId, stats: { baseAtk: 1000, atk: 2000, critRate: 0, critDamage: 0, ...stats } });
    const request = scenario.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    request.refinement = refinement;
    scenario.sandbox.GenshinCalcConditions.conditionPanelState(request, scenario.calcData);
    return { ...scenario, request };
}

function setComplexStack(request, panel, groupId, stack) {
    const definition = panel.complexConditionInputs.find((input) => input.conditionGroupId === groupId);
    assert.ok(definition, `missing condition group ${groupId}`);
    request.uiState.complexConditionByModifier[definition.key] = { stack };
    return definition.key;
}

function resultFor(payload, reactionId) {
    return payload.results.find((result) => result.entry.directReactionId === reactionId);
}

test("11520 applies 0-3 ATK stacks and R1/R5 crit damage only to Stellar reactions", () => {
    const { sandbox, calcData, request } = fixture({
        characterId: "10000150", weaponId: "11520", stats: { critRate: 80, critDamage: 50 }
    });
    const panel = sandbox.GenshinCalcConditions.conditionPanelState(request, calcData);
    const modifierIds = calcData.weaponModifiers["11520"].modifiers.map((modifier) => modifier.id);
    const stackGroup = "provisional70_w11520_stacks";
    assert.equal(panel.complexConditionInputs.filter((input) => input.conditionGroupId === stackGroup).length, 1);
    const conditionKey = setComplexStack(request, panel, stackGroup, 0);
    const critModifier = calcData.weaponModifiers["11520"].modifiers.find((item) => item.id === modifierIds[1]);
    const conditionStateKey = sandbox.GenshinModifierAnalyzer.modifierStateKey(critModifier, "weapon:11520");
    const missingStackContext = {
        characterId: "10000150",
        uiState: { conditionByModifier: { [conditionStateKey]: { enabled: true } } }
    };
    for (const stack of [undefined, Infinity, NaN]) {
        const state = { enabled: true };
        if (stack !== undefined) state.stack = stack;
        const result = sandbox.GenshinCalcConditions.evaluateModifierCondition({
            modifier: critModifier,
            source: "weapon:11520",
            context: { ...missingStackContext, uiState: { conditionByModifier: { [conditionStateKey]: state }, stackByModifier: {} } },
            calcData
        });
        assert.equal(result.enabled, false);
    }
    const reactionEntry = {
        id: "fixture-stellar-swirl", attackType: "reaction", damageType: "reaction",
        group: "reaction", element: "炎", directReactionId: "stellarSwirl", scalings: []
    };
    const payloads = {};
    for (const refinement of [1, 5]) {
        for (const stack of [0, 1, 2, 3]) {
            const input = JSON.parse(JSON.stringify(request));
            input.refinement = refinement;
            input.uiState.complexConditionByModifier[conditionKey] = { stack };
            payloads[`${refinement}:${stack}`] = sandbox.GenshinCalcEngine.calculateDamageRequest(input, calcData);
            assert.equal(payloads[`${refinement}:${stack}`].context.effectiveStats.atk,
                2000 + stack * (refinement === 1 ? 80 : 160), `R${refinement}, ${stack} stacks`);
        }
    }

    const crit = calcData.weaponModifiers["11520"].modifiers.find((item) => item.id === modifierIds[1]);
    for (const [refinement, critDamage] of [[1, 50], [5, 110]]) {
        const three = payloads[`${refinement}:3`];
        const two = payloads[`${refinement}:2`];
        assert.ok(resultFor(three, "stellarSwirl").expected > resultFor(two, "stellarSwirl").expected);
        assert.ok(resultFor(three, "stellarConduct").expected > resultFor(two, "stellarConduct").expected);
        const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, three.context);
        const stellarTotals = sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(reactionEntry, three.context, collected).totals;
        assert.equal(stellarTotals.reactionCritDamage, critDamage);
        const invalidStackContext = {
            ...three.context,
            uiState: {
                ...three.context.uiState,
                conditionByModifier: {
                    ...three.context.uiState.conditionByModifier,
                    [conditionKey]: { enabled: true, stack: Infinity }
                }
            }
        };
        assert.equal(sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, invalidStackContext)
            .applied.some((item) => item.modifier.id === modifierIds[1]), false);
        for (const reactionId of ["stellarSwirl", "stellarConduct"]) {
            assert.equal(sandbox.GenshinCalcEngine.reactionCritApplies(crit, { reactionId, family: "dedicated" }), true);
        }
        for (const reactionId of ["lunarCharged", "lunarCrystallize", "vaporize"]) {
            assert.equal(sandbox.GenshinCalcEngine.reactionCritApplies(crit, { reactionId, family: "dedicated" }), false);
        }
        const ordinaryAttack = three.results.find((result) => result.entry.group === "normalAttack");
        const matchedAtkBaseline = JSON.parse(JSON.stringify(two.calculationRequest));
        matchedAtkBaseline.stats.atk += refinement === 1 ? 80 : 160;
        const baseline = sandbox.GenshinCalcEngine.calculateDamageRequest(matchedAtkBaseline, calcData);
        assert.equal(ordinaryAttack.crit, baseline.results.find((result) => result.entry.group === "normalAttack").crit);

        const snapshot = sandbox.GenshinCalcEngine.createCalculationSnapshot(three.calculationRequest, three, {
            createdAt: "2026-10-03T00:00:00.000Z", dataVersion: "test-data"
        });
        const serializedSnapshot = JSON.parse(JSON.stringify(snapshot));
        const replay = sandbox.GenshinCalcEngine.calculateDamageRequest(serializedSnapshot.request, calcData);
        assert.equal(replay.context.uiState.conditionByModifier[conditionKey].stack, 3);
        assert.equal(resultFor(replay, "stellarSwirl").expected, resultFor(three, "stellarSwirl").expected);
    }
});

test("15435 clamps same and different element counts to three, preserving same-element priority through replay", () => {
    const { sandbox, calcData, request } = fixture({ weaponId: "15435" });
    const panel = sandbox.GenshinCalcConditions.conditionPanelState(request, calcData);
    assert.equal(panel.complexConditionInputs.filter((input) => input.conditionGroupId?.startsWith("provisional70_w15435_")).length, 2);
    const sameKey = setComplexStack(request, panel, "provisional70_w15435_same_count", 2);
    const differentKey = setComplexStack(request, panel, "provisional70_w15435_different_count", 3);

    const cases = [
        { same: 3, different: 3, resolved: [3, 0] },
        { same: 0, different: 3, resolved: [0, 3] },
        { same: 2, different: 3, resolved: [2, 1] },
        { same: 1.5, different: 3, resolved: [1, 2] },
        { same: 0, different: 0, resolved: [0, 0] }
    ];
    const results = cases.map(({ same, different, resolved }) => {
        const input = JSON.parse(JSON.stringify(request));
        input.uiState.complexConditionByModifier[sameKey] = { stack: same };
        input.uiState.complexConditionByModifier[differentKey] = { stack: different };
        const payload = sandbox.GenshinCalcEngine.calculateDamageRequest(input, calcData);
        assert.deepEqual([
            payload.context.uiState.conditionByModifier[sameKey].stack,
            payload.context.uiState.conditionByModifier[differentKey].stack
        ], resolved);
        return payload;
    });
    assert.equal(results[0].context.effectiveStats.elementalMastery, 292);
    assert.equal(results[0].context.effectiveStats.atk, 2000);
    assert.equal(results[1].context.effectiveStats.elementalMastery, 100);
    assert.equal(results[1].context.effectiveStats.atk, 2360);
    assert.equal(results[2].context.effectiveStats.elementalMastery, 228);
    assert.equal(results[2].context.effectiveStats.atk, 2120);
    assert.equal(results[3].context.effectiveStats.elementalMastery, 164);
    assert.equal(results[3].context.effectiveStats.atk, 2240);
    assert.equal(results[4].context.effectiveStats.elementalMastery, 100);
    assert.equal(results[4].context.effectiveStats.atk, 2000);
    const explicitSamePriority = JSON.parse(JSON.stringify(request));
    explicitSamePriority.uiState.complexConditionByModifier[sameKey] = { stack: 3 };
    explicitSamePriority.uiState.complexConditionByModifier[differentKey] = { stack: 0 };
    const explicitSameResult = sandbox.GenshinCalcEngine.calculateDamageRequest(explicitSamePriority, calcData);
    assert.deepEqual(results[0].results.map((result) => result.expected), explicitSameResult.results.map((result) => result.expected));

    const snapshot = sandbox.GenshinCalcEngine.createCalculationSnapshot(results[2].calculationRequest, results[2], {
        createdAt: "2026-10-03T00:00:00.000Z", dataVersion: "test-data"
    });
    const replay = sandbox.GenshinCalcEngine.calculateDamageRequest(JSON.parse(JSON.stringify(snapshot)).request, calcData);
    assert.equal(replay.context.uiState.conditionByModifier[sameKey].stack, 2);
    assert.equal(replay.context.uiState.conditionByModifier[differentKey].stack, 1);

    const rankFive = JSON.parse(JSON.stringify(request));
    rankFive.refinement = 5;
    rankFive.uiState.complexConditionByModifier[sameKey] = { stack: 3 };
    rankFive.uiState.complexConditionByModifier[differentKey] = { stack: 3 };
    const r5 = sandbox.GenshinCalcEngine.calculateDamageRequest(rankFive, calcData);
    assert.equal(r5.context.effectiveStats.elementalMastery, 484);
    assert.equal(r5.context.effectiveStats.atk, 2000);
    const r5DifferentOnly = JSON.parse(JSON.stringify(rankFive));
    r5DifferentOnly.uiState.complexConditionByModifier[sameKey] = { stack: 0 };
    const r5DifferentResult = sandbox.GenshinCalcEngine.calculateDamageRequest(r5DifferentOnly, calcData);
    assert.equal(r5DifferentResult.context.effectiveStats.atk, 2720);
});

test("15435 direct modifier collection enforces the shared cap without a condition panel", () => {
    const { sandbox, calcData } = fixture({ weaponId: "15435" });
    const context = {
        characterId: "10000037", weaponId: "15435", refinement: 1, constellation: 0,
        artifactSetMode: "", artifactSetIds: [], talentLevels: { normal: 10, skill: 10, burst: 10 },
        stats: { hp: 20000, baseHp: 1000, baseAtk: 1000, atk: 2000, baseDef: 500, def: 1000, elementalMastery: 100 },
        enemy: { resistanceDebuff: 0, defenseDebuff: 0, defenseIgnore: 0 },
        manualInputs: { recordedHealing: null, providerStats: {}, resourceStates: {} },
        uiState: { conditionByModifier: {}, complexConditionByModifier: {}, stackByModifier: {} }
    };
    const keys = sandbox.GenshinCalcConditions.conditionPanelState(context, calcData).complexConditionInputs;
    const same = keys.find((item) => item.conditionGroupId === "provisional70_w15435_same_count");
    const different = keys.find((item) => item.conditionGroupId === "provisional70_w15435_different_count");
    context.uiState.conditionByModifier[same.key] = { enabled: true, stack: 2 };
    context.uiState.conditionByModifier[different.key] = { enabled: true, stack: 3 };
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context);
    assert.equal(context.uiState.conditionByModifier[same.key].stack, 2);
    assert.equal(context.uiState.conditionByModifier[different.key].stack, 1);
    assert.equal(collected.applied.find((item) => item.modifier.id === "provisional70_w15435_different_element").value, 12);
});

test("11521 owner filtering accepts Traveler variants and rejects other characters", () => {
    const { sandbox, calcData } = fixture({ characterId: "10000005", weaponId: "11521" });
    const modifier = calcData.weaponModifiers["11521"].modifiers.find((item) => item.id === "provisional70_w11521_resonance_crit");
    assert.deepEqual(modifier.requiredCharacterIds, ["10000005", "10000007"]);
    const accepted = sandbox.GenshinCalcConditions.evaluateModifierCondition({
        modifier,
        source: "weapon:11521",
        context: { characterId: "10000005_anemo", uiState: { conditionByModifier: {} } },
        calcData
    });
    const rejected = sandbox.GenshinCalcConditions.evaluateModifierCondition({
        modifier,
        source: "weapon:11521",
        context: { characterId: "10000037", uiState: { conditionByModifier: {} } },
        calcData
    });
    assert.notEqual(accepted.reason, "この効果を所持するキャラクター専用です。");
    assert.equal(rejected.enabled, false);
    assert.equal(rejected.derived, true);
});

test("11521 applies Traveler-only damage and refinement-scaled resonance crit in full requests", () => {
    const { sandbox, calcData, request } = fixture({
        characterId: "10000005", weaponId: "11521", stats: { critRate: 100, critDamage: 50 }
    });
    const panel = sandbox.GenshinCalcConditions.conditionPanelState(request, calcData);
    const resonance = panel.complexConditionInputs.find((input) => input.conditionGroupId === "provisional70_w11521_resonated_elements");
    const hitControl = panel.cards.find((card) => card.id === "weapon").effects
        .find((effect) => effect.id === "provisional70_w11521_hit_atk").controls[0];
    assert.ok(resonance);
    const byRefinement = {};
    for (const refinement of [1, 2, 3]) {
        const input = JSON.parse(JSON.stringify(request));
        input.refinement = refinement;
        input.uiState.complexConditionByModifier[resonance.key] = { stack: 6 };
        input.uiState.conditionByModifier[hitControl.key] = { enabled: true, stack: 0, option: "" };
        const payload = sandbox.GenshinCalcEngine.calculateDamageRequest(input, calcData);
        byRefinement[refinement] = payload;
        assert.equal(payload.context.effectiveStats.atk, 2000 + 1000 * ({ 1: 0.16, 2: 0.20, 3: 0.24 }[refinement]));
        assert.ok(payload.results[0].crit > 0);
    }
    assert.ok(Math.abs(byRefinement[1].results[0].crit - byRefinement[1].results[0].nonCrit * 1.5) < 1e-9);
    assert.ok(Math.abs(byRefinement[2].results[0].crit - byRefinement[2].results[0].nonCrit * 1.86) < 1e-9);
    assert.ok(Math.abs(byRefinement[3].results[0].crit - byRefinement[3].results[0].nonCrit * 1.86) < 1e-9);

    const nonTraveler = fixture({ characterId: "10000002", weaponId: "11521", stats: { critRate: 100, critDamage: 50 } });
    const nonTravelerPanel = nonTraveler.sandbox.GenshinCalcConditions.conditionPanelState(nonTraveler.request, nonTraveler.calcData);
    const nonTravelerResonance = nonTravelerPanel.complexConditionInputs.find((input) => input.conditionGroupId === "provisional70_w11521_resonated_elements");
    const nonTravelerHitControl = nonTravelerPanel.cards.find((card) => card.id === "weapon").effects
        .find((effect) => effect.id === "provisional70_w11521_hit_atk").controls[0];
    const off = nonTraveler.sandbox.GenshinCalcEngine.calculateDamageRequest(nonTraveler.request, nonTraveler.calcData);
    const activeRequest = JSON.parse(JSON.stringify(nonTraveler.request));
    activeRequest.uiState.complexConditionByModifier[nonTravelerResonance.key] = { stack: 6 };
    activeRequest.uiState.conditionByModifier[nonTravelerHitControl.key] = { enabled: true, stack: 0, option: "" };
    const active = nonTraveler.sandbox.GenshinCalcEngine.calculateDamageRequest(activeRequest, nonTraveler.calcData);
    assert.deepEqual(active.results.map((result) => result.expected), off.results.map((result) => result.expected));
    assert.equal(active.context.effectiveStats.atk, off.context.effectiveStats.atk);
});
