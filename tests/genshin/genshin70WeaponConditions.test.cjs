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

test("15435 derives counts from party composition, ignores saved manual stacks and replays", () => {
    const { sandbox, calcData, request } = fixture({ weaponId: "15435" });
    const panel = sandbox.GenshinCalcConditions.conditionPanelState(request, calcData);
    assert.equal(panel.complexConditionInputs.filter(input => input.conditionGroupId?.startsWith("provisional70_w15435_")).length, 0);
    const sameKey = "weapon:15435:group:provisional70_w15435_same_count";
    const differentKey = "weapon:15435:group:provisional70_w15435_different_count";
    request.uiState.conditionByModifier[sameKey] = { enabled: true, stack: 3 };
    request.uiState.conditionByModifier[differentKey] = { enabled: true, stack: 3 };
    request.party = { members: [
        { slot: 1, characterId: request.characterId, element: "cryo", enabled: true },
        { slot: 2, characterId: "10000015", element: "cryo", enabled: true },
        { slot: 3, characterId: "10000014", element: "hydro", enabled: true },
        { slot: 4, characterId: "10000036", element: "cryo", enabled: true }
    ], conditionStates: {} };
    const result = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    assert.equal(result.context.uiState.conditionByModifier[sameKey].stack, 2);
    assert.equal(result.context.uiState.conditionByModifier[differentKey].stack, 1);
    assert.equal(result.context.effectiveStats.elementalMastery, 228);
    assert.equal(result.context.effectiveStats.atk, 2120);
    const replay = sandbox.GenshinCalcEngine.calculateDamageRequest(JSON.parse(JSON.stringify(result.calculationRequest)), calcData);
    assert.deepEqual(result.results.map(r => r.expected), replay.results.map(r => r.expected));
    request.party.members = [];
    const empty = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    assert.equal(empty.context.effectiveStats.elementalMastery, 100);
    assert.equal(empty.context.effectiveStats.atk, 2000);
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
