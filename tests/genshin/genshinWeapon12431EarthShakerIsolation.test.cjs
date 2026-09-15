"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "12431";
const IDS = {
    skillDamage: "w_12431_damageBonus_f365c31c",
    reactionDuplicate: "w_12431_reactionBonus_22612d3e",
    legacyDuplicate: "w_12431_v3_damageBonus_1"
};

const SOURCE_PATHS = [
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard02/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/English/weapons/earthshaker.json",
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard02/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/English/weapons/earthshaker.json"
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

test("アースシェイカーの6.7/7.0 rawは炎元素関連反応後の元素スキル補正と8秒継続を明示する", () => {
    const sources = SOURCE_PATHS.map((path) => require(path));
    sources.forEach((source) => {
        assert.equal(source.id, 12431);
        assert.equal(source.name, "Earth Shaker");
        assert.match(source.effectTemplateRaw, /Pyro-related reaction/);
        assert.match(source.effectTemplateRaw, /Elemental Skill DMG/);
        assert.match(source.effectTemplateRaw, /for 8s/);
        assert.match(source.effectTemplateRaw, /not on the field/);
        assert.deepEqual(source.r1.values, ["16%"]);
        assert.deepEqual(source.r5.values, ["32%"]);
    });
    assert.deepEqual(sources[0], sources[1], "6.7/7.0 provider raw must remain unchanged");
});

test("アースシェイカーは元素スキル補正だけを8秒の発動状態として残し、反応系の重複投影を抑止する", () => {
    const calcData = loadCalcData();
    const skillDamage = record(IDS.skillDamage, calcData);
    const reactionDuplicate = record(IDS.reactionDuplicate, calcData);
    const legacyDuplicate = record(IDS.legacyDuplicate, calcData);

    assert.equal(skillDamage.category, "damageBonus");
    assert.deepEqual(skillDamage.applyTo, ["skillDamageBonus"]);
    assert.equal(skillDamage.condition, "afterReaction");
    assert.equal(skillDamage.calculationSupport, "toggle");
    assert.equal(skillDamage.uidHandling, "conditional");
    assert.equal(skillDamage.duration, 8);
    assert.deepEqual(skillDamage.valueByRefinement, {
        1: 16, 2: 20, 3: 24, 4: 28, 5: 32
    });

    assert.equal(reactionDuplicate.auditDisposition, "supersededByStructuredRecord");
    assert.equal(legacyDuplicate.auditDisposition, "supersededByStructuredRecord");
});

test("アースシェイカーの発動OFF/ONは元素スキル補正を一度だけ適用し、反応ダメージへ漏らさない", () => {
    const sandbox = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
    const calcData = loadCalcData();
    const skillDamage = record(IDS.skillDamage, calcData);
    const skillKey = sandbox.GenshinModifierAnalyzer.modifierStateKey(skillDamage, `weapon:${WEAPON_ID}`);

    const off = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context());
    assert.equal(off.applied.some((item) => item.source === `weapon:${WEAPON_ID}`), false);

    const onContext = context();
    onContext.uiState.conditionByModifier[skillKey] = { enabled: true, stack: 0, option: "" };
    const on = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, onContext);
    const applied = on.applied.filter((item) => item.source === `weapon:${WEAPON_ID}`);
    assert.equal(applied.filter((item) => item.modifier.id === IDS.skillDamage).length, 1);
    assert.equal(applied.find((item) => item.modifier.id === IDS.skillDamage)?.value, 16);
    assert.deepEqual(applied.find((item) => item.modifier.id === IDS.skillDamage)?.modifier.applyTo, ["skillDamageBonus"]);
    assert.equal(applied.some((item) => [IDS.reactionDuplicate, IDS.legacyDuplicate].includes(item.modifier.id)), false);
});
