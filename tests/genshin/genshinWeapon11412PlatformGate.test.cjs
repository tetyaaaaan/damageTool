"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const root = path.resolve(__dirname, "../..");
const affectedIds = [
    "w_11412_extra_damage_1",
    "w_11412_statBonus_200acee8",
    "w_11412_stat_2"
];

function context(characterId) {
    return {
        characterId,
        weaponId: "11412",
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

test("降臨の剣はplatformと旅人条件を無視して任意キャラへ攻撃力を加算しない", () => {
    const sandbox = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
    const calcData = loadCalcData();
    const effects = JSON.parse(fs.readFileSync(path.join(root, "games/genshin/data/weapon-effects.json"), "utf8"));
    assert.match(effects["11412"].effectTextTemplate, /PlayStation/);
    assert.match(effects["11412"].effectTextTemplate, /旅人/);

    const modifiers = calcData.weaponModifiers["11412"].modifiers
        .filter((item) => affectedIds.includes(item.id));
    assert.equal(modifiers.length, 3);
    assert.ok(modifiers.every((item) => item.auditDisposition === "sourceContextRequired"));

    for (const characterId of ["10000002", "10000005"]) {
        const calcContext = context(characterId);
        const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
        assert.equal(collected.applied.some((item) => affectedIds.includes(item.modifier.id)), false);
        const candidates = collected.candidates.filter((item) => affectedIds.includes(item.modifier.id));
        assert.equal(candidates.length, 3);
        assert.ok(candidates.every((item) => item.analysis.supportStatus === "displayOnly"));
        assert.ok(candidates.every((item) => item.reason === "安全な計算に必要な原文コンテキストが不足しています"));
        assert.equal(sandbox.GenshinCalcEngine.buildEffectiveStats(calcContext, collected).effectiveStats.atk, 2000);
    }
});
