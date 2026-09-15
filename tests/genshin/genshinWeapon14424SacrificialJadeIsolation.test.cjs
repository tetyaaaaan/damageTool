"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "14424";
const IDS = {
    hp: "w_14424_stat_1",
    mastery: "w_14424_stat_2",
    legacy: "w_14424_statBonus_3fe2e64a"
};

const SOURCE_PATHS = [
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard03/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/English/weapons/sacrificialjade.json",
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard03/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/English/weapons/sacrificialjade.json"
];

function records(calcData = loadCalcData()) {
    return calcData.weaponModifiers[WEAPON_ID].modifiers;
}

function record(id, calcData) {
    return records(calcData).find((item) => item.id === id);
}

function groups(calcData) {
    return calcData.weaponEffectRegistry?.weapons?.[WEAPON_ID]?.groups || [];
}

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
            resolvedConditionByModifier: {},
            conditionByModifier: {},
            toggleByModifier: {},
            complexConditionByModifier: {}
        },
        mode: "manualMode",
        ...overrides
    };
}

function armToggle(sandbox, calcData, calcContext) {
    const group = groups(calcData).find((item) => {
        const ids = item.modifierIds || [];
        return ids.includes(IDS.hp) && ids.includes(IDS.mastery);
    });
    assert.ok(group, "Sacrificial Jade needs one shared off-field activation group");
    const modifier = record(IDS.hp, calcData);
    const normalized = sandbox.GenshinCalcEngine.normalizeWeaponModifier(
        modifier,
        records(calcData),
        calcData.weaponEffectRegistry.weapons[WEAPON_ID]
    );
    const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(
        normalized,
        `weapon:${WEAPON_ID}`
    );
    calcContext.uiState.conditionByModifier[key] = { enabled: true, stack: 0, option: "" };
    return key;
}

test("古祠の瓏の6.7/7.0 rawは待機5秒後のHP32%/熟知40と10秒解除を保持する", () => {
    const sources = SOURCE_PATHS.map((path) => require(path));
    sources.forEach((source) => {
        assert.equal(source.id, 14424);
        assert.equal(source.name, "Sacrificial Jade");
        assert.match(source.effectTemplateRaw, /not on the field for more than 5s/);
        assert.match(source.effectTemplateRaw, /Max HP/);
        assert.match(source.effectTemplateRaw, /Elemental Mastery/);
        assert.match(source.effectTemplateRaw, /canceled after the wielder has been on the field for 10s/);
        assert.deepEqual(source.r1.values, ["32%", "40"]);
        assert.deepEqual(source.r5.values, ["64%", "80"]);
    });
    assert.deepEqual(sources[0], sources[1], "6.7/7.0 provider raw must remain unchanged");
});

test("古祠の瓏はHP/熟知を同じ待機状態へ接続し、旧HP40%行を隔離する", () => {
    const calcData = loadCalcData();
    const hp = record(IDS.hp, calcData);
    const mastery = record(IDS.mastery, calcData);
    const legacy = record(IDS.legacy, calcData);

    assert.equal(hp.category, "statBonus");
    assert.deepEqual(hp.applyTo, ["hpPercent"]);
    assert.equal(hp.unit, "percent");
    assert.deepEqual(hp.valueByRefinement, { 1: 32, 2: 40, 3: 48, 4: 56, 5: 64 });
    assert.equal(mastery.category, "statBonus");
    assert.deepEqual(mastery.applyTo, ["elementalMastery"]);
    assert.equal(mastery.unit, "flat");
    assert.deepEqual(mastery.valueByRefinement, { 1: 40, 2: 50, 3: 60, 4: 70, 5: 80 });
    assert.notEqual(hp.condition, "always");
    assert.notEqual(mastery.condition, "always");
    assert.equal(legacy.auditDisposition, "supersededByStructuredRecord");
});

test("古祠の瓏は待機状態OFF/ONでHPと元素熟知を一度だけ切り替える", () => {
    const sandbox = harness();
    const calcData = loadCalcData();

    const offContext = context();
    const offCollected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, offContext);
    const offStats = sandbox.GenshinCalcEngine.buildEffectiveStats(offContext, offCollected).effectiveStats;
    assert.equal(offStats.hp, 20000);
    assert.equal(offStats.elementalMastery, 100);
    assert.equal(offCollected.applied.some((item) => item.source === `weapon:${WEAPON_ID}`), false);

    const onContext = context();
    armToggle(sandbox, calcData, onContext);
    const onCollected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, onContext);
    const onStats = sandbox.GenshinCalcEngine.buildEffectiveStats(onContext, onCollected).effectiveStats;
    assert.equal(onStats.hp, 23200);
    assert.equal(onStats.elementalMastery, 140);
    assert.equal(onCollected.applied.filter((item) => item.modifier.id === IDS.hp).length, 1);
    assert.equal(onCollected.applied.filter((item) => item.modifier.id === IDS.mastery).length, 1);
    assert.equal(onCollected.applied.some((item) => item.modifier.id === IDS.legacy), false);
});
