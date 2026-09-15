"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { loadCalcData } = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "15507";
const IDS = {
    skillBurst: "w_15507_damageBonus_6894c25e",
    legacySkillBurst: "w_15507_damage_1",
    stacks: "w_15507_stat_2"
};

const SOURCE_PATHS = [
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard04/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/English/weapons/polarstar.json",
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard04/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/English/weapons/polarstar.json"
];

function records(calcData = loadCalcData()) {
    return calcData.weaponModifiers[WEAPON_ID].modifiers;
}

function record(id, calcData) {
    return records(calcData).find((item) => item.id === id);
}

test("冬極の白星の6.7/7.0 rawはスキル爆発補正と4層ATKを明示する", () => {
    const sources = SOURCE_PATHS.map((path) => require(path));
    sources.forEach((source) => {
        assert.equal(source.id, 15507);
        assert.match(source.effectTemplateRaw, /Elemental Skill and Elemental Burst DMG/);
        assert.match(source.effectTemplateRaw, /1\/2\/3\/4 stacks of Ashen Nightstar/);
        assert.deepEqual(source.r1.values, ["12%", "10/20/30/48%"]);
        assert.deepEqual(source.r5.values, ["24%", "20/40/60/96%"]);
    });
    assert.deepEqual(sources[0], sources[1], "6.7/7.0 provider raw must remain unchanged");
});

test("冬極の白星はスキル爆発補正と白夜極星層数ATKを分離し、旧重複行を適用しない", () => {
    const calcData = loadCalcData();
    const skillBurst = record(IDS.skillBurst, calcData);
    const legacySkillBurst = record(IDS.legacySkillBurst, calcData);
    const stacks = record(IDS.stacks, calcData);

    assert.deepEqual(skillBurst.applyTo, ["skillDamageBonus", "burstDamageBonus"]);
    assert.equal(skillBurst.condition, "always");
    assert.deepEqual(skillBurst.valueByRefinement, { 1: 12, 2: 15, 3: 18, 4: 21, 5: 24 });
    assert.equal(legacySkillBurst.auditDisposition, "supersededByStructuredRecord");

    assert.deepEqual(stacks.applyTo, ["atkPercent"]);
    assert.equal(stacks.condition, "ashenNightstarStacks");
    assert.equal(stacks.conditionInput?.type, "stack");
    assert.equal(stacks.conditionInput?.min, 0);
    assert.equal(stacks.conditionInput?.max, 4);
    assert.deepEqual(stacks.stack, { min: 0, max: 4, default: 0 });
    assert.deepEqual(stacks.valueByRefinement, {
        1: [10, 20, 30, 48],
        2: [12.5, 25, 37.5, 60],
        3: [15, 30, 45, 72],
        4: [17.5, 35, 52.5, 84],
        5: [20, 40, 60, 96]
    });
});

