"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

function context(artifactSetIds, artifactSetMode) {
    return {
        characterId: "10000002",
        weaponId: "",
        refinement: 1,
        artifactSetMode,
        artifactSetIds,
        constellation: 0,
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        stats: {
            hp: 20000,
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
        mode: "manualMode"
    };
}

function harness() {
    const sandbox = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
    return { sandbox, calcData: loadCalcData() };
}

test("華館夢醒形骸記2セットは常時防御力30%を一度だけ加算する", () => {
    const { sandbox, calcData } = harness();
    const modifier = calcData.artifactSetModifiers["15021"].twoPiece
        .find((item) => item.id === "2pc_def_percent");
    assert.equal(modifier.value, 30);
    assert.equal(modifier.valuePerStack, undefined);
    assert.equal(modifier.stack, undefined);

    const calcContext = context(["15021"], "2pc");
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
    const applied = collected.applied.filter((item) => item.modifier.id === modifier.id);
    assert.equal(applied.length, 1);
    assert.equal(applied[0].value, 30);
    assert.equal(sandbox.GenshinCalcEngine.buildEffectiveStats(calcContext, collected).effectiveStats.def, 1150);
});

test("燃焼・戦闘経過による現在値50%を2500%へ誤変換しない", () => {
    const { sandbox, calcData } = harness();
    const modifier = calcData.artifactSetModifiers["15036"].fourPiece
        .find((item) => item.id === "4pc_all_damage_bonus_burning_condition");
    assert.equal(modifier.valuePerStack, 1);
    assert.equal(modifier.value, undefined);
    assert.equal(modifier.stack.default, 0);

    const calcContext = context(["15036"], "4pc");
    sandbox.GenshinCalcConditions.conditionPanelState(calcContext, calcData);
    const stateKey = sandbox.GenshinModifierAnalyzer.modifierStateKey(modifier, "artifact4:15036");
    calcContext.uiState.stackByModifier[modifier.id] = 50;
    calcContext.uiState.conditionByModifier[stateKey] = { enabled: true, stack: 50, option: "" };
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
    const applied = collected.applied.find((item) => item.modifier.id === modifier.id);
    assert.equal(applied.value, 50);
    assert.notEqual(applied.value, 2500);

    calcContext.uiState.stackByModifier[modifier.id] = 0;
    calcContext.uiState.conditionByModifier[stateKey] = { enabled: false, stack: 0, option: "" };
    const zero = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext)
        .applied.find((item) => item.modifier.id === modifier.id);
    assert.equal(zero?.value ?? 0, 0);
});

test("魔女の課題の自元素補正を全元素ダメージへ過適用しない", () => {
    const { sandbox, calcData } = harness();
    const ids = [
        "4pc_team_own_element_damage_bonus_after_skill",
        "4pc_team_own_and_active_element_damage_bonus_magical_secret_rite"
    ];
    const modifiers = calcData.artifactSetModifiers["15045"].fourPiece
        .filter((item) => ids.includes(item.id));
    assert.equal(modifiers.length, 2);
    const calcContext = context(["15045"], "4pc");
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
    assert.equal(collected.applied.some((item) => ids.includes(item.modifier.id)), false);
    const candidates = collected.candidates.filter((item) => ids.includes(item.modifier.id));
    assert.equal(candidates.length, 2);
    assert.ok(candidates.every((item) => item.analysis.reasonCode === "SOURCE_CONTEXT_REQUIRED"));
});
