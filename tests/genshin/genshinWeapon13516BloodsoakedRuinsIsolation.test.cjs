"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createBrowserScriptHarness, loadCalcData } = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "13516";
const IDS = {
    crit: "w_13516_critBonus_0eecdab8",
    burstLunar: "w_13516_reaction_bonus_1",
    legacyReaction: "w_13516_reactionBonus_d4e397ce",
    legacyReactionShort: "w_13516_reaction_bonus_2"
};

const SOURCE_PATHS = [
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard03/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/English/weapons/bloodsoakedruins.json",
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard03/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/English/weapons/bloodsoakedruins.json"
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
            hp: 20000, baseHp: 10000, atk: 2000, baseAtk: 1000, def: 1000, baseDef: 500,
            elementalMastery: 100, energyRecharge: 100,
            critRate: 50, critDamage: 100, elementalDamageBonus: 0
        },
        enemy: { resistanceDebuff: 0, defenseDebuff: 0, defenseIgnore: 0 },
        manualInputs: { recordedHealing: null, providerStats: {}, resourceStates: {} },
        uiState: {
            stackByModifier: {}, conditionByModifier: {}, toggleByModifier: {},
            complexConditionByModifier: {}
        },
        mode: "manualMode"
    };
}

function harness() {
    return createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
}

test("荒涼たる挽歌の6.7/7.0 rawは月感電限定の会心ダメージと爆発後の月感電を明示する", () => {
    const sources = SOURCE_PATHS.map((path) => require(path));
    sources.forEach((source) => {
        assert.equal(source.id, 13516);
        assert.match(source.effectTemplateRaw, /Elemental Burst/);
        assert.match(source.effectTemplateRaw, /Lunar-Charged DMG/);
        assert.match(source.effectTemplateRaw, /after triggering a Lunar-Charged reaction/);
        assert.match(source.effectTemplateRaw, /CRIT DMG/);
        assert.deepEqual(source.r1.values, ["36%", "28%", "12"]);
        assert.deepEqual(source.r5.values, ["84%", "56%", "16"]);
    });
    assert.deepEqual(sources[0], sources[1], "6.7/7.0 provider raw must remain unchanged");
});

test("荒涼たる挽歌の会心ダメージは月感電選択時だけ適用し、旧広域行を重複させない", () => {
    const calcData = loadCalcData();
    const crit = record(IDS.crit, calcData);
    const burstLunar = record(IDS.burstLunar, calcData);
    const legacyReaction = record(IDS.legacyReaction, calcData);
    const legacyReactionShort = record(IDS.legacyReactionShort, calcData);

    assert.equal(crit.category, "critBonus");
    assert.deepEqual(crit.applyTo, ["critDamage"]);
    assert.equal(crit.duration, 6);
    assert.equal(crit.condition, "afterReaction");
    assert.equal(crit.conditionInput?.type, "option");
    assert.equal(crit.conditionOptionValue, "lunarCharged");
    assert.equal(crit.conditionGroupId, "weapon13516LunarChargedRequiem");
    assert.deepEqual(crit.conditionInput?.options?.map((option) => option.value), ["inactive", "lunarCharged"]);
    assert.deepEqual(crit.valueByRefinement, { 1: 28, 2: 35, 3: 42, 4: 49, 5: 56 });

    assert.deepEqual(burstLunar.applyTo, ["lunarChargedDamageBonus"]);
    assert.equal(burstLunar.condition, "afterBurst");
    assert.equal(burstLunar.duration, 3.5);
    assert.deepEqual(burstLunar.valueByRefinement, { 1: 36, 2: 48, 3: 60, 4: 72, 5: 84 });
    assert.equal(legacyReaction.auditDisposition, "supersededByStructuredRecord");
    assert.equal(legacyReactionShort.auditDisposition, "supersededByStructuredRecord");

    const sandbox = harness();
    const inactive = context();
    const conditionKey = "weapon:13516:group:weapon13516LunarChargedRequiem";
    inactive.uiState.conditionByModifier[conditionKey] = { enabled: true, stack: 0, option: "inactive" };
    assert.equal(
        sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, inactive).applied
            .some((item) => item.modifier.id === IDS.crit),
        false
    );

    const active = context();
    active.uiState.conditionByModifier[conditionKey] = { enabled: true, stack: 0, option: "lunarCharged" };
    const applied = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, active).applied
        .find((item) => item.modifier.id === IDS.crit);
    assert.equal(applied?.value, 28);
});

