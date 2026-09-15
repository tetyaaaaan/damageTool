"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "14513";
const IDS = {
    attack: "w_14513_stat_1",
    normal: "w_14513_damageBonus_f927ae7f",
    charged: "w_14513_damage_4",
    reaction: "w_14513_reaction_bonus_2",
    broadLegacy: "w_14513_damageBonus_9c4f8189",
    broadReactionLegacy: "w_14513_reactionBonus_5a95da29"
};

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
            atk: 2000,
            baseAtk: 1000,
            def: 1000,
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

function modifier(calcData, id) {
    return calcData.weaponModifiers[WEAPON_ID].modifiers.find((item) => item.id === id);
}

function setCondition(sandbox, calcContext, calcData, id, stack = 1) {
    const item = modifier(calcData, id);
    const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(item, `weapon:${WEAPON_ID}`);
    calcContext.uiState.conditionByModifier[key] = { enabled: true, stack, option: "" };
    calcContext.uiState.stackByModifier[id] = stack;
}

test("凛流の監視者は黄金の血潮の5段階値をsource textどおりに分離する", () => {
    const calcData = loadCalcData();
    const source = require("../../games/genshin/data/weapon-effects.json")[WEAPON_ID];
    const records = Object.fromEntries(Object.values(IDS).map((id) => [id, modifier(calcData, id)]));

    assert.equal(source.effectNameJa, "黄金の血潮");
    assert.match(source.effectTextTemplate, /現在HPが増減する時/);
    assert.deepEqual(
        Object.values(source.effectParamsByRefinement).map((item) => [item.param1, item.param2, item.param3, item.param4]),
        [
            ["16%", "16%", "14%", "14%"],
            ["20%", "20%", "17.5%", "17.5%"],
            ["24%", "24%", "21%", "21%"],
            ["28%", "28%", "24.5%", "24.5%"],
            ["32%", "32%", "28%", "28%"]
        ]
    );

    assert.deepEqual(records[IDS.attack].valueByRefinement, { 1: 16, 2: 20, 3: 24, 4: 28, 5: 32 });
    assert.equal(records[IDS.attack].calculationSupport, "simple");
    assert.equal(records[IDS.attack].condition, "always");

    assert.equal(records[IDS.normal].condition, "hpChanged");
    assert.deepEqual(records[IDS.normal].applyTo, ["normalAttackDamageBonus"]);
    assert.deepEqual(records[IDS.normal].valueByRefinement, { 1: 16, 2: 20, 3: 24, 4: 28, 5: 32 });
    assert.deepEqual(records[IDS.charged].applyTo, ["chargedAttackDamageBonus"]);
    assert.deepEqual(records[IDS.reaction].applyTo, ["astralConductionDamageBonus"]);
    assert.equal(records[IDS.charged].condition, "hpChanged");
    assert.equal(records[IDS.reaction].condition, "hpChanged");
    assert.deepEqual(records[IDS.charged].valueByRefinement, { 1: 14, 2: 17.5, 3: 21, 4: 24.5, 5: 28 });
    assert.deepEqual(records[IDS.reaction].valueByRefinement, { 1: 14, 2: 17.5, 3: 21, 4: 24.5, 5: 28 });
    assert.equal(records[IDS.broadLegacy].auditDisposition, "supersededByStructuredRecord");
    assert.equal(records[IDS.broadReactionLegacy].auditDisposition, "supersededByStructuredRecord");
});

test("黄金の血潮はHP増減前に適用せず、明示した1層を通常/重撃/星電導へ一度だけ渡す", () => {
    const sandbox = harness();
    const calcData = loadCalcData();

    const empty = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context());
    const emptyWeapon = empty.applied.filter((item) => item.source === `weapon:${WEAPON_ID}`);
    assert.deepEqual(Array.from(emptyWeapon, (item) => item.modifier.id), [IDS.attack]);
    assert.equal(emptyWeapon[0].value, 16);

    const activeContext = context();
    [IDS.normal, IDS.charged, IDS.reaction].forEach((id) => setCondition(sandbox, activeContext, calcData, id, 1));
    const active = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, activeContext);
    const applied = Array.from(
        active.applied.filter((item) => item.source === `weapon:${WEAPON_ID}`),
        (item) => [item.modifier.id, item.value]
    );
    assert.deepEqual(applied, [
        [IDS.normal, 16],
        [IDS.charged, 14],
        [IDS.reaction, 14],
        [IDS.attack, 16]
    ]);
    assert.equal(applied.some(([id]) => [IDS.broadLegacy, IDS.broadReactionLegacy].includes(id)), false);
});
