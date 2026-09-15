"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const STRUCTURED = {
    afterSkillHit: {
        id: "w_15412_damageBonus_aa0d2de1",
        target: "normalAttackDamageBonus"
    },
    afterNormalAttackHit: {
        id: "w_15412_damageBonus_b20218ef",
        target: "skillDamageBonus"
    }
};

const LEGACY_IDS = ["w_15412_damage_1", "w_15412_damage_2"];

function context() {
    return {
        characterId: "10000002",
        weaponId: "15412",
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
    const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(modifier, "weapon:15412");
    targetContext.uiState.conditionByModifier[key] = {
        enabled,
        stack: 0,
        option: ""
    };
}

test("幽夜のワルツは旧重複行ではなく相互5秒バフの構造化行だけを適用する", () => {
    const sandbox = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
    const calcData = loadCalcData();
    const modifiers = calcData.weaponModifiers["15412"].modifiers;
    const structured = Object.values(STRUCTURED).map(({ id }) => modifiers.find((item) => item.id === id));
    const legacy = LEGACY_IDS.map((id) => modifiers.find((item) => item.id === id));

    assert.ok(structured.every(Boolean));
    assert.ok(legacy.every(Boolean));
    assert.deepEqual(structured.map((item) => item.condition), ["afterSkillHit", "afterNormalAttackHit"]);
    assert.deepEqual(structured.map((item) => item.applyTo), [["normalAttackDamageBonus"], ["skillDamageBonus"]]);
    assert.deepEqual(structured.map((item) => item.valueByRefinement), [
        { 1: 20, 2: 25, 3: 30, 4: 35, 5: 40 },
        { 1: 20, 2: 25, 3: 30, 4: 35, 5: 40 }
    ]);
    assert.deepEqual(structured.map((item) => item.duration), [5, 5]);
    assert.ok(legacy.every((item) => item.auditDisposition === "supersededByStructuredRecord"));

    const enabled = context();
    structured.forEach((item) => setCondition(sandbox, enabled, item, true));
    legacy.forEach((item) => setCondition(sandbox, enabled, item, true));
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, enabled);
    const appliedIds = Array.from(collected.applied, (item) => item.modifier.id);
    assert.deepEqual(appliedIds.sort(), structured.map((item) => item.id).sort());
    assert.equal(appliedIds.some((id) => LEGACY_IDS.includes(id)), false);
    assert.deepEqual(
        Array.from(collected.applied, (item) => [item.modifier.id, item.value]).sort((a, b) => a[0].localeCompare(b[0])),
        structured.map((item) => [item.id, 20]).sort((a, b) => a[0].localeCompare(b[0]))
    );
});

test("幽夜のワルツの2つの発動条件は互いに独立して対象を限定する", () => {
    const sandbox = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
    const calcData = loadCalcData();
    const modifiers = calcData.weaponModifiers["15412"].modifiers;
    const skillHit = modifiers.find((item) => item.id === STRUCTURED.afterSkillHit.id);
    const normalHit = modifiers.find((item) => item.id === STRUCTURED.afterNormalAttackHit.id);

    const onlySkillHit = context();
    setCondition(sandbox, onlySkillHit, skillHit, true);
    let applied = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, onlySkillHit).applied;
    assert.deepEqual(Array.from(applied, (item) => item.modifier.id), [skillHit.id]);
    assert.deepEqual(applied[0].modifier.applyTo, [STRUCTURED.afterSkillHit.target]);

    const onlyNormalHit = context();
    setCondition(sandbox, onlyNormalHit, normalHit, true);
    applied = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, onlyNormalHit).applied;
    assert.deepEqual(Array.from(applied, (item) => item.modifier.id), [normalHit.id]);
    assert.deepEqual(applied[0].modifier.applyTo, [STRUCTURED.afterNormalAttackHit.target]);
});
