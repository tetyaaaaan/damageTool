"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "15501";
const IDS = {
    critDamage: "w_15501_crit_1",
    duplicateDamage: "w_15501_damage_2",
    procDamage: "w_15501_extraDamage_29b93c67"
};

const SOURCE_PATHS = [
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard04/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/English/weapons/skywardharp.json",
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard04/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/English/weapons/skywardharp.json"
];

function records(calcData = loadCalcData()) {
    return calcData.weaponModifiers[WEAPON_ID].modifiers;
}

function record(id, calcData) {
    return records(calcData).find((item) => item.id === id);
}

function context() {
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
            resolvedConditionByModifier: {},
            conditionByModifier: {},
            toggleByModifier: {},
            complexConditionByModifier: {}
        },
        mode: "manualMode"
    };
}

test("天空の翼の6.7/7.0 rawは会心ダメージと命中時物理procだけを定義する", () => {
    const sources = SOURCE_PATHS.map((path) => require(path));
    sources.forEach((source) => {
        assert.equal(source.id, 15501);
        assert.equal(source.name, "Skyward Harp");
        assert.match(source.effectTemplateRaw, /CRIT DMG/);
        assert.match(source.effectTemplateRaw, /Hits have a/);
        assert.match(source.effectTemplateRaw, /125% Physical ATK DMG/);
        assert.match(source.effectTemplateRaw, /once every/);
        assert.deepEqual(source.r1.values, ["20%", "60%", "4"]);
        assert.deepEqual(source.r5.values, ["40%", "100%", "2"]);
    });
    assert.deepEqual(sources[0], sources[1], "6.7/7.0 provider raw must remain unchanged");
});

test("天空の翼の会心ダメージは全ダメージへ重複投影せず、未モデルprocはfail-closedで保持する", () => {
    const calcData = loadCalcData();
    const critDamage = record(IDS.critDamage, calcData);
    const duplicateDamage = record(IDS.duplicateDamage, calcData);
    const procDamage = record(IDS.procDamage, calcData);

    assert.deepEqual(critDamage.applyTo, ["critDamage"]);
    assert.deepEqual(critDamage.valueByRefinement, {
        1: 20, 2: 25, 3: 30, 4: 35, 5: 40
    });
    assert.equal(duplicateDamage.auditDisposition, "supersededByStructuredRecord");
    assert.equal(procDamage.auditDisposition, "sourceContextRequired");
    assert.deepEqual(procDamage.applyTo, ["triggeredDamage"]);
});

test("天空の翼の計算は会心ダメージだけを常時反映し、誤った全ダメージと未モデルprocを適用しない", () => {
    const sandbox = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
    const calcData = loadCalcData();
    const calcContext = context();
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
    const sourceIds = [IDS.critDamage, IDS.duplicateDamage, IDS.procDamage];
    const applied = collected.applied.filter((item) => sourceIds.includes(item.modifier.id));

    assert.equal(applied.filter((item) => item.modifier.id === IDS.critDamage).length, 1);
    assert.equal(applied.find((item) => item.modifier.id === IDS.critDamage)?.value, 20);
    assert.equal(applied.some((item) => item.modifier.id === IDS.duplicateDamage), false);
    assert.equal(applied.some((item) => item.modifier.id === IDS.procDamage), false);
});
