"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { loadCalcData } = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "13514";
const SOURCE_PATHS = [
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard03/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/English/weapons/symphonistofscents.json",
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard03/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/English/weapons/symphonistofscents.json"
];

function records(calcData = loadCalcData()) {
    return calcData.weaponModifiers[WEAPON_ID].modifiers;
}

function record(id, calcData) {
    return records(calcData).find((item) => item.id === id);
}

test("香りの調べの6.7/7.0 rawは常時ATK・待機中ATK・治療後ATKの3効果を明示する", () => {
    const sources = SOURCE_PATHS.map((path) => require(path));
    sources.forEach((source) => {
        assert.equal(source.id, 13514);
        assert.match(source.effectTemplateRaw, /ATK is increased/);
        assert.match(source.effectTemplateRaw, /off-field/);
        assert.match(source.effectTemplateRaw, /initiating healing/);
        assert.match(source.effectTemplateRaw, /Sweet Echoes/);
        assert.deepEqual(source.r1.values, ["12%", "12%", "32%"]);
        assert.deepEqual(source.r5.values, ["24%", "24%", "64%"]);
    });
    assert.deepEqual(sources[0], sources[1], "6.7/7.0 provider raw must remain unchanged");
});

test("香りの調べは常時・待機中・治療後のATK補正を混同せず計算する", () => {
    const calcData = loadCalcData();
    const base = record("w_13514_stat_1", calcData);
    const healing = record("w_13514_stat_2", calcData);
    const offField = records(calcData).find((item) => /off-field|待機中/.test(String(item.sourceText || "")));

    assert.equal(base.condition, "always");
    assert.deepEqual(base.applyTo, ["atkPercent"]);
    assert.deepEqual(base.valueByRefinement, { 1: 12, 2: 15, 3: 18, 4: 21, 5: 24 });

    assert.equal(offField, undefined, "待機中ATKは有限candidateへ安全に割り当てられるまで推測実装しない");

    assert.equal(healing.condition, "afterHealingRecorded");
    assert.equal(healing.duration, 3);
    assert.deepEqual(healing.applyTo, ["atkPercent"]);
    assert.deepEqual(healing.valueByRefinement, { 1: 32, 2: 40, 3: 48, 4: 56, 5: 64 });
    assert.equal(healing.conditionInput?.type, "option");
});
