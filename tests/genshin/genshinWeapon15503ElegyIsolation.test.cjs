"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { loadCalcData } = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "15503";
const IDS = {
    baseEm: "w_15503_stat_1",
    teamEm: "w_15503_stat_2",
    teamAtk: "w_15503_stat_3"
};

const SOURCE_PATHS = [
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard04/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/English/weapons/elegyfortheend.json",
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard04/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/English/weapons/elegyfortheend.json"
];

function records(calcData = loadCalcData()) {
    return calcData.weaponModifiers[WEAPON_ID].modifiers;
}

function record(id, calcData) {
    return records(calcData).find((item) => item.id === id);
}

test("終焉を嘆く詩の6.7/7.0 rawは4層消費後のチームバフを明示する", () => {
    const sources = SOURCE_PATHS.map((path) => require(path));
    sources.forEach((source) => {
        assert.equal(source.id, 15503);
        assert.match(source.effectTemplateRaw, /Elemental Mastery/);
        assert.match(source.effectTemplateRaw, /possess 4 Sigils of Remembrance/);
        assert.match(source.effectTemplateRaw, /all nearby party members/);
        assert.match(source.effectTemplateRaw, /Farewell Song/);
        assert.deepEqual(source.r1.values, ["60", "100", "20%"]);
        assert.deepEqual(source.r5.values, ["120", "200", "40%"]);
    });
    assert.deepEqual(sources[0], sources[1], "6.7/7.0 provider raw must remain unchanged");
});

test("終焉を嘆く詩は常時EMと発動中のチームEM/ATKを分離する", () => {
    const calcData = loadCalcData();
    const baseEm = record(IDS.baseEm, calcData);
    const teamEm = record(IDS.teamEm, calcData);
    const teamAtk = record(IDS.teamAtk, calcData);
    const groups = calcData.weaponEffectRegistry?.weapons?.[WEAPON_ID]?.groups || [];
    const group = groups.find((item) => [IDS.teamEm, IDS.teamAtk].every((id) => item.modifierIds?.includes(id)));

    assert.equal(baseEm.condition, "always");
    assert.deepEqual(baseEm.applyTo, ["elementalMastery"]);
    assert.deepEqual(baseEm.valueByRefinement, { 1: 60, 2: 75, 3: 90, 4: 105, 5: 120 });

    [teamEm, teamAtk].forEach((modifier) => {
        assert.notEqual(modifier.condition, "always");
        assert.equal(modifier.conditionInput?.type, "option");
        assert.ok(modifier.conditionInput.options.length >= 2);
        assert.equal(modifier.duration, 12);
    });
    assert.deepEqual(teamEm.applyTo, ["elementalMastery"]);
    assert.deepEqual(teamEm.valueByRefinement, { 1: 100, 2: 125, 3: 150, 4: 175, 5: 200 });
    assert.deepEqual(teamAtk.applyTo, ["atkPercent"]);
    assert.deepEqual(teamAtk.valueByRefinement, { 1: 20, 2: 25, 3: 30, 4: 35, 5: 40 });

    assert.ok(group, "the two Farewell Song modifiers need one shared team-target group");
    assert.equal(group.targetOwner, "team");
    assert.equal(group.activation?.type, "toggle");
});

