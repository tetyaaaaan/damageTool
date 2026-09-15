"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "14522";
const BASE_ID = "w_14522_stat_1";
const LEGACY_CRIT_ID = "w_14522_crit_2";
const LEGACY_REACTION_ID = "w_14522_reactionBonus_f6439a2b";

function harness() {
    return createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
}

function context(overrides = {}) {
    return {
        characterId: "10000002",
        weaponId: WEAPON_ID,
        refinement: 1,
        artifactSetMode: "",
        artifactSetIds: [],
        constellation: 0,
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        stats: {
            hp: 20000,
            baseHp: 10000,
            atk: 2000,
            baseAtk: 1000,
            def: 1000,
            baseDef: 500,
            elementalMastery: 100,
            energyRecharge: 100,
            critRate: 50,
            critDamage: 100,
            elementalDamageBonus: 0
        },
        enemy: { resistanceDebuff: 0, defenseDebuff: 0, defenseIgnore: 0 },
        manualInputs: { recordedHealing: null, providerStats: {}, resourceStates: {} },
        uiState: {
            stackByModifier: {},
            conditionByModifier: {},
            toggleByModifier: {},
            complexConditionByModifier: {}
        },
        mode: "manualMode",
        ...overrides
    };
}

function modifiers(calcData) {
    return calcData.weaponModifiers[WEAPON_ID].modifiers;
}

function modifier(calcData, id) {
    return modifiers(calcData).find((item) => item.id === id);
}

function groups(calcData) {
    return calcData.weaponEffectRegistry.weapons[WEAPON_ID]?.groups || [];
}

function statusModifiers(calcData) {
    return modifiers(calcData).filter((item) => item.condition === "afterReaction");
}

function sharedStatusGroup(calcData) {
    const statusIds = new Set(statusModifiers(calcData).map((item) => item.id));
    return groups(calcData).find((group) =>
        (group.modifierIds || []).some((id) => statusIds.has(id))
    );
}

function armToggle(sandbox, calcData, calcContext, group, enabled = true) {
    const id = (group.modifierIds || []).find((candidateId) => modifier(calcData, candidateId));
    assert.ok(id, `group ${group.id} must reference a local modifier`);
    const raw = modifier(calcData, id);
    const normalized = sandbox.GenshinCalcEngine.normalizeWeaponModifier(
        raw,
        modifiers(calcData),
        calcData.weaponEffectRegistry.weapons[WEAPON_ID]
    );
    const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(
        normalized,
        `weapon:${WEAPON_ID}`
    );
    calcContext.uiState.conditionByModifier[key] = {
        enabled,
        stack: 0,
        option: ""
    };
    return key;
}

function appliedForWeapon(collected) {
    return collected.applied.filter((item) => item.source === `weapon:${WEAPON_ID}`);
}

test("14522 raw contract keeps base HP and the 12-second status values", () => {
    const calcData = loadCalcData();
    const source = require("../../games/genshin/data/weapon-effects.json")[WEAPON_ID];
    const records = require("../../games/genshin/data/v2/weapons/source-records.json");
    const effect = records[`weapon:${WEAPON_ID}:effect`];

    assert.equal(effect.provider, "damageTool-local");
    assert.equal(effect.gameVersion, null);
    assert.equal(effect.text, source.effectTextTemplate);
    assert.deepEqual(
        Object.values(effect.structuredValue.effectParamsByRefinement).map((item) => [
            item.param1,
            item.param2,
            item.param3,
            item.param4
        ]),
        [
            ["10%", "14", "14%", "60%"],
            ["12%", "15", "16%", "80%"],
            ["14%", "16", "18%", "100%"],
            ["16%", "17", "20%", "120%"],
            ["18%", "18", "22%", "140%"]
        ]
    );
    assert.match(source.effectTextTemplate, /HP上限\+\{param1\}/);
    assert.match(source.effectTextTemplate, /継続時間12秒/);
    assert.match(source.effectTextTemplate, /HP上限がさらに\+\{param3\}/);
    assert.match(source.effectTextTemplate, /月反応ダメージの会心ダメージ\+\{param4\}/);

    const base = modifier(calcData, BASE_ID);
    assert.deepEqual(base.applyTo, ["hpPercent"]);
    assert.equal(base.condition, "always");
    assert.equal(base.calculationSupport, "simple");
    assert.deepEqual(base.valueByRefinement, { 1: 10, 2: 12, 3: 14, 4: 16, 5: 18 });
});

test("14522 replaces generic always rows with one shared lunar 12-second toggle", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const oldCrit = modifier(calcData, LEGACY_CRIT_ID);
    const oldReaction = modifier(calcData, LEGACY_REACTION_ID);
    const status = statusModifiers(calcData);
    const group = sharedStatusGroup(calcData);

    // Red fixture: before the product correction there is no status group,
    // the two legacy rows are generic always-on modifiers, and the extra HP
    // state is absent. The assertion must fail closed until that correction.
    assert.equal(oldCrit.category, "reactionCritBonus");
    assert.equal(oldReaction.category, "statBonus");
    assert.ok(group, "14522 needs one shared afterReaction product group");
    assert.equal(group.targetOwner, "self");
    assert.equal(group.inputPolicy, "calculate");
    assert.equal(group.activation?.type, "toggle");
    assert.ok(group.activation?.stateKey, "14522 status group needs one shared state key");
    assert.match(`${group.activation?.label || ""}${group.description || ""}`, /12秒/);

    const extraHp = status.find((item) => item.category === "statBonus" && item.applyTo?.includes("hpPercent"));
    const lunarCrit = status.find((item) => item.category === "reactionCritBonus");
    assert.ok(extraHp, "14522 status must add the conditional HP bonus");
    assert.ok(lunarCrit, "14522 status must add a reaction-crit modifier");
    assert.deepEqual(extraHp.valueByRefinement, { 1: 14, 2: 16, 3: 18, 4: 20, 5: 22 });
    assert.equal(extraHp.duration, 12);
    assert.deepEqual(lunarCrit.applyTo, [
        "lunarBloomCrit",
        "lunarChargedCrit",
        "lunarCrystallizeCrit"
    ]);
    assert.deepEqual(lunarCrit.valueByRefinement, { 1: 60, 2: 80, 3: 100, 4: 120, 5: 140 });
    assert.equal(lunarCrit.duration, 12);

    const empty = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context());
    const emptyApplied = appliedForWeapon(empty);
    assert.equal(Array.from(emptyApplied, (item) => item.modifier.id).join("|"), BASE_ID);
    assert.equal(emptyApplied[0].value, 10);
    assert.equal(emptyApplied.some((item) => [LEGACY_CRIT_ID, LEGACY_REACTION_ID].includes(item.modifier.id)), false);

    const activeContext = context();
    armToggle(sandbox, calcData, activeContext, group);
    const active = appliedForWeapon(
        sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, activeContext)
    );
    assert.equal(active.some((item) => [LEGACY_CRIT_ID, LEGACY_REACTION_ID].includes(item.modifier.id)), true);
    assert.equal(
        JSON.stringify(Array.from(active, (item) => [item.modifier.id, item.value])
            .sort((left, right) => left[0].localeCompare(right[0]))),
        JSON.stringify([[BASE_ID, 10], [extraHp.id, 14], [lunarCrit.id, 60]]
            .sort((left, right) => left[0].localeCompare(right[0])))
    );
});
