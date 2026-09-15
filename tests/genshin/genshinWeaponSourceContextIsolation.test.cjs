"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const affectedByWeapon = new Map([
    ["11416", ["w_11416_stat_2"]],
    ["11420", ["w_11420_extra_damage_1"]],
    ["11421", ["w_11421_extra_damage_1"]],
    ["15304", ["w_15304_damage_2"]],
    ["15415", ["w_15415_damage_1", "w_15415_stat_2", "w_15415_stat_flat_3"]],
    ["15501", ["w_15501_extraDamage_29b93c67"]]
]);

function context(weaponId) {
    return {
        characterId: "10000002",
        weaponId,
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

test("条件・確率・platform文脈が未実装の武器効果を無条件に計算へ適用しない", () => {
    const sandbox = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
    const calcData = loadCalcData();

    for (const [weaponId, affectedIds] of affectedByWeapon) {
        const sourceModifiers = calcData.weaponModifiers[weaponId].modifiers
            .filter((item) => affectedIds.includes(item.id));
        assert.equal(sourceModifiers.length, affectedIds.length, weaponId);
        assert.ok(sourceModifiers.every((item) => item.auditDisposition === "sourceContextRequired"), weaponId);

        const calcContext = context(weaponId);
        const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
        assert.equal(collected.applied.some((item) => affectedIds.includes(item.modifier.id)), false, weaponId);
        const candidates = collected.candidates.filter((item) => affectedIds.includes(item.modifier.id));
        assert.equal(candidates.length, affectedIds.length, weaponId);
        assert.ok(candidates.every((item) => item.analysis.supportStatus === "displayOnly"), weaponId);
        assert.ok(candidates.every((item) => item.reason === "安全な計算に必要な原文コンテキストが不足しています"), weaponId);
    }
});
