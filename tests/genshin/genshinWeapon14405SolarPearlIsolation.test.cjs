"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const STRUCTURED = {
    normalAttackHit: {
        id: "w_14405_damageBonus_56d18214",
        condition: "afterNormalAttackHit",
        applyTo: ["skillDamageBonus", "burstDamageBonus"]
    },
    skillOrBurstHit: {
        id: "w_14405_damageBonus_8cf737d5",
        condition: "afterSkillOrBurstHit",
        applyTo: ["normalAttackDamageBonus"]
    }
};

const LEGACY_IDS = ["w_14405_damage_1", "w_14405_damage_2"];

function context() {
    return {
        characterId: "10000002",
        weaponId: "14405",
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
        mode: "manualMode"
    };
}

function setCondition(sandbox, targetContext, modifier, enabled) {
    const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(modifier, "weapon:14405");
    targetContext.uiState.conditionByModifier[key] = { enabled, stack: 0, option: "" };
}

test("匣中日月は通常攻撃→スキル/爆発、スキル/爆発→通常攻撃の対象を分離する", () => {
    const calcData = loadCalcData();
    const modifiers = calcData.weaponModifiers["14405"].modifiers;
    const structured = Object.values(STRUCTURED).map(({ id }) => modifiers.find((item) => item.id === id));

    assert.ok(structured.every(Boolean));
    assert.deepEqual(structured.map((item) => item.condition), Object.values(STRUCTURED).map((item) => item.condition));
    assert.deepEqual(structured.map((item) => item.applyTo), Object.values(STRUCTURED).map((item) => item.applyTo));
    assert.deepEqual(structured.map((item) => item.valueByRefinement), [
        { 1: 20, 2: 25, 3: 30, 4: 35, 5: 40 },
        { 1: 20, 2: 25, 3: 30, 4: 35, 5: 40 }
    ]);
    assert.deepEqual(structured.map((item) => item.duration), [6, 6]);
});

test("匣中日月は旧広域行を適用せず、構造化された2行だけを計算へ渡す", () => {
    const sandbox = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
    const calcData = loadCalcData();
    const modifiers = calcData.weaponModifiers["14405"].modifiers;
    const structured = Object.values(STRUCTURED).map(({ id }) => modifiers.find((item) => item.id === id));
    const legacy = LEGACY_IDS.map((id) => modifiers.find((item) => item.id === id));
    assert.ok(structured.every(Boolean));
    assert.ok(legacy.every(Boolean));

    const enabled = context();
    structured.forEach((item) => setCondition(sandbox, enabled, item, true));
    legacy.forEach((item) => setCondition(sandbox, enabled, item, true));
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, enabled);
    const appliedIds = Array.from(collected.applied, (item) => item.modifier.id).sort();
    assert.deepEqual(appliedIds, structured.map((item) => item.id).sort());
    assert.equal(appliedIds.some((id) => LEGACY_IDS.includes(id)), false);
});
