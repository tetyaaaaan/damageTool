"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { loadCalcData } = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "13515";
const IDS = {
    attack: "w_13515_stat_1",
    attackLegacy: "w_13515_statBonus_c3ad91b6",
    lunar: "w_13515_reactionBonus_e1533e72",
    lunarLegacy: "w_13515_reaction_bonus_2"
};

const SOURCE_PATHS = [
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard03/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/English/weapons/fracturedhalo.json",
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard03/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/English/weapons/fracturedhalo.json"
];

function records() {
    return loadCalcData().weaponModifiers[WEAPON_ID].modifiers;
}

function record(id) {
    return records().find((item) => item.id === id);
}

test("砕け散る光輪の6.7/7.0 rawはスキル/爆発ATKとシールド後の月感電を明示する", () => {
    const sources = SOURCE_PATHS.map((path) => require(path));
    sources.forEach((source) => {
        assert.equal(source.id, 13515);
        assert.match(source.effectTemplateRaw, /Elemental Skill or Elemental Burst/);
        assert.match(source.effectTemplateRaw, /creates a Shield/);
        assert.match(source.effectTemplateRaw, /Lunar-Charged DMG/);
        assert.deepEqual(source.r1.values, ["24%", "40%"]);
        assert.deepEqual(source.r5.values, ["48%", "80%"]);
    });
    assert.deepEqual(sources[0], sources[1], "6.7/7.0 provider raw must remain unchanged");
});

test("砕け散る光輪はATKとシールド後の月感電を別toggle・別targetで計算する", () => {
    const calcData = loadCalcData();
    const attack = record(IDS.attack);
    const attackLegacy = record(IDS.attackLegacy);
    const lunar = record(IDS.lunar);
    const lunarLegacy = record(IDS.lunarLegacy);
    const groups = calcData.weaponEffectRegistry?.weapons?.[WEAPON_ID]?.groups || [];
    const attackGroup = groups.find((item) => item.modifierIds?.includes(IDS.attack));
    const lunarGroup = groups.find((item) => item.modifierIds?.includes(IDS.lunar));

    assert.equal(attack.condition, "afterSkillOrBurst");
    assert.equal(attack.duration, 20);
    assert.deepEqual(attack.applyTo, ["atkPercent"]);
    assert.deepEqual(attack.valueByRefinement, { 1: 24, 2: 30, 3: 36, 4: 42, 5: 48 });
    assert.equal(attackLegacy.auditDisposition, "supersededByStructuredRecord");
    assert.deepEqual(lunar.applyTo, ["lunarChargedDamageBonus"]);
    assert.equal(lunar.duration, 20);
    assert.deepEqual(lunar.valueByRefinement, { 1: 40, 2: 50, 3: 60, 4: 70, 5: 80 });
    assert.equal(lunarLegacy.auditDisposition, "supersededByStructuredRecord");
    assert.ok(attackGroup, "ATK trigger must use the existing weapon toggle registry");
    assert.equal(attackGroup.targetOwner, "self");
    assert.equal(attackGroup.activation?.type, "toggle");
    assert.ok(lunarGroup, "Electrifying Edict must use the existing team modifier registry");
    assert.equal(lunarGroup.targetOwner, "team");
    assert.equal(lunarGroup.activation?.type, "toggle");
});
