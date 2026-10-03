"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createScenarioHarness,
    prepareScenarioInputs,
    setConditionElement,
    setElement
} = require("./helpers/calcScenarioHarness.cjs");

const candidate = require("../../games/genshin/data/v2/candidates/7.0-provisional-weapons.json");
const stellarSwirl = require("../../games/genshin/data/v2/candidates/7.0-provisional-stellar-swirl.json");
const WEAPON_IDS = ["11436", "12436", "13436", "14436", "15436", "12435", "13435", "14435", "11435"];

function installCandidate(calcData) {
    Object.assign(calcData.weapons, candidate.weapons);
    Object.assign(calcData.weaponModifiers, candidate.weaponModifiers);
    calcData.weaponEffectRegistry.weapons = {
        ...calcData.weaponEffectRegistry.weapons,
        ...candidate.weaponEffectRegistry.weapons
    };
    Object.assign(calcData.weaponEffects || (calcData.weaponEffects = {}), candidate.weaponEffects);
    calcData.reactionDefinitions.options.stellarSwirl = stellarSwirl.reactionDefinitions.options.stellarSwirl;
}

function addWeaponControls(sandbox, elements, weaponId, { enabled, option = "", activeGroups = null }) {
    const definition = candidate.weaponEffectRegistry.weapons[weaponId];
    for (const group of definition.groups) {
        if (group.inputPolicy !== "calculate") continue;
        const activation = group.activation;
        const groupActive = enabled && (!activeGroups || activeGroups.includes(group.id));
        if (activation.type === "option") {
            const key = `weapon:${weaponId}:group:${activation.stateKey || group.id}`;
            const inactive = activation.options?.find((item) => String(typeof item === "object" ? item.value : item) === "inactive");
            const value = groupActive ? option : (inactive ? (typeof inactive === "object" ? inactive.value : inactive) : "");
            if (value !== "") setConditionElement(elements, key, "option", value);
            continue;
        }
        if (activation.type === "toggle") {
            const raw = candidate.weaponModifiers[weaponId].modifiers.find((modifier) =>
                group.modifierIds.includes(modifier.id));
            const normalized = sandbox.GenshinCalcEngine.normalizeWeaponModifier(
                raw,
                candidate.weaponModifiers[weaponId].modifiers,
                definition
            );
            const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(normalized, `weapon:${weaponId}`);
            elements[`toggle:${key}`] = {
                checked: groupActive,
                value: "",
                dataset: { genshinToggleKey: key }
            };
        }
    }
}

function scenario({ weaponId, characterId, refinement, enabled, option = "", activeGroups = null, reaction = "none", reactionElement = "炎" }) {
    const { sandbox, elements, calcData } = createScenarioHarness();
    installCandidate(calcData);
    prepareScenarioInputs(elements, {
        characterId,
        stats: { baseAtk: 1000, atk: 2000, elementalMastery: 100, critRate: 50, critDamage: 100 }
    });
    setElement(elements, "genshinJsonEnableWeaponLowHpCondition", "", false);
    setElement(elements, "genshinCalcWeaponId", weaponId);
    setElement(elements, "genshinWeaponRefinement", `R${refinement}`);
    setElement(elements, "genshinJsonReactionOption", reaction);
    setElement(elements, "genshinJsonReactionElement", reactionElement);
    setElement(elements, "genshinStellarSwirlVariant", "initialAnemo");
    // Render the selected weapon's actual controls first, then apply the simulated UI choices.
    const initialRequest = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    sandbox.GenshinCalcConditions.conditionPanelState(initialRequest, calcData);
    addWeaponControls(sandbox, elements, weaponId, { enabled, option, activeGroups });
    const request = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    const payload = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const snapshot = sandbox.GenshinCalcEngine.createCalculationSnapshot(payload.calculationRequest, payload, {
        createdAt: "2026-10-03T00:00:00.000Z",
        dataVersion: "7.0-provisional-weapon-regression"
    });
    const jsonSnapshot = JSON.parse(JSON.stringify(snapshot));
    const replay = sandbox.GenshinCalcEngine.calculateDamageRequest(jsonSnapshot.request, calcData);
    return { sandbox, calcData, request, payload, snapshot: jsonSnapshot, replay };
}

function damageSignature(payload) {
    return Array.from(payload.results, (result) => [
        result.entry?.id,
        result.nonCrit,
        result.crit,
        result.expected
    ]);
}

test("7.0 provisional weapon conditions travel from controls through request, damage and snapshot replay", () => {
    const cases = [
        ["11436", "10000002", "", ["provisional70_w11436_reaction_state"], "none"],
        ["12436", "10000016", "", ["provisional70_w12436_reaction_state", "provisional70_w12436_stellar_state"], "melt15"],
        ["13436", "10000023", "", ["provisional70_w13436_stellar_state"], "none"],
        ["14436", "10000006", "", ["provisional70_w14436_reaction_state", "provisional70_w14436_stellar_state"], "stellarSwirl"],
        ["15436", "10000021", "", ["provisional70_w15436_skill_state"], "melt15"],
        ["12435", "10000016", "atk", ["provisional70_w12435_cycle"], "none"],
        ["12435", "10000016", "em", ["provisional70_w12435_cycle"], "melt15"],
        ["12435", "10000016", "stellar", ["provisional70_w12435_cycle"], "stellarSwirl"],
        ["13435", "10000023", "", ["provisional70_w13435_reaction_state"], "none"],
        ["14435", "10000006", "", ["provisional70_w14435_state"], "none"]
    ];

    for (const [weaponId, characterId, option, activeGroups, reaction] of cases) {
        for (const refinement of [1, 5]) {
            const off = scenario({ weaponId, characterId, refinement, enabled: false, option, activeGroups, reaction });
            const on = scenario({ weaponId, characterId, refinement, enabled: true, option, activeGroups, reaction });
            assert.equal(off.request.weaponId, weaponId);
            assert.equal(off.request.refinement, refinement);
            assert.ok(Object.values(off.request.uiState.toggleByModifier).every((value) => value === false), `${weaponId} R${refinement} toggles start off`);
            assert.ok(off.payload.results.length > 0, `${weaponId} R${refinement} off damage`);
            assert.deepEqual(damageSignature(off.replay), damageSignature(off.payload), `${weaponId} R${refinement} off replay`);
            assert.deepEqual(damageSignature(on.replay), damageSignature(on.payload), `${weaponId} R${refinement} on replay`);
            assert.equal(on.snapshot.request.weaponId, weaponId);
            assert.equal(on.snapshot.request.refinement, refinement);
            assert.ok(JSON.stringify(on.request.uiState).includes("provisional70_w"), `${weaponId} condition must be captured in request`);
            Object.entries(on.request.uiState.toggleByModifier).forEach(([key, value]) => {
                const groupId = candidate.weaponEffectRegistry.weapons[weaponId].groups
                    .find((group) => key.endsWith(`:group:${group.activation.stateKey || group.id}`))?.id;
                assert.equal(value, activeGroups.includes(groupId), `${weaponId} toggle ${key} matches selected state`);
            });
            Object.entries(on.request.uiState.toggleByModifier).forEach(([key, value]) => {
                assert.equal(on.payload.context.uiState.conditionByModifier[key]?.enabled, value, `${weaponId} request condition ${key} reaches damage`);
            });
            const active = on.sandbox.GenshinCalcEngine.collectActiveModifiers(on.calcData, on.payload.context);
            const calculationGroupIds = candidate.weaponEffectRegistry.weapons[weaponId].groups
                .filter((group) => group.inputPolicy === "calculate")
                .flatMap((group) => group.modifierIds);
            assert.ok(calculationGroupIds.some((id) => active.applied.some((item) => item.modifier.id === id)), `${weaponId} enabled control applies a calculation modifier`);
            assert.notDeepEqual(damageSignature(on.payload), damageSignature(off.payload), `${weaponId} R${refinement} condition should change damage`);
        }
    }
});

test("11435 exposes the explicit min/max control through the calculation request", () => {
    const min = scenario({ weaponId: "11435", characterId: "10000002", refinement: 1, enabled: true, option: "min" });
    const max = scenario({ weaponId: "11435", characterId: "10000002", refinement: 1, enabled: true, option: "max" });
    const conditionKey = "weapon:11435:group:provisional70_w11435_range";
    assert.equal(min.request.uiState.complexConditionByModifier[conditionKey].option, "min");
    assert.equal(max.request.uiState.complexConditionByModifier[conditionKey].option, "max");
    assert.ok(min.payload.results[0].expected !== max.payload.results[0].expected);
    assert.deepEqual(damageSignature(min.replay), damageSignature(min.payload));
    assert.deepEqual(damageSignature(max.replay), damageSignature(max.payload));
});

test("weapon Stellar Swirl bonuses affect that reaction target without changing ordinary attacks", () => {
    const activeGroups = ["provisional70_w11436_stellar_state"];
    const ordinaryOff = scenario({ weaponId: "11436", characterId: "10000002", refinement: 1, enabled: false, activeGroups });
    const ordinaryOn = scenario({ weaponId: "11436", characterId: "10000002", refinement: 1, enabled: true, activeGroups });
    assert.deepEqual(damageSignature(ordinaryOn.payload), damageSignature(ordinaryOff.payload));

    const swirlOff = scenario({ weaponId: "11436", characterId: "10000002", refinement: 1, enabled: false, activeGroups, reaction: "stellarSwirl" });
    const swirlOn = scenario({ weaponId: "11436", characterId: "10000002", refinement: 1, enabled: true, activeGroups, reaction: "stellarSwirl" });
    const offReaction = swirlOff.payload.results.find((result) => result.entry?.id === "reaction_stellarSwirl");
    const onReaction = swirlOn.payload.results.find((result) => result.entry?.id === "reaction_stellarSwirl");
    assert.ok(offReaction);
    assert.ok(onReaction);
    assert.ok(onReaction.expected > offReaction.expected);
    assert.deepEqual(damageSignature(swirlOn.replay), damageSignature(swirlOn.payload));
});
