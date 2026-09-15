"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

test("赤砂の杖のsource textは常時補正・元素スキル後の最大3層を明示する", () => {
    const source = require("../../games/genshin/data/weapon-effects.json")["13511"];
    assert.equal(source.effectNameJa, "蜃気楼の果ての熱夢");
    assert.match(source.effectTextTemplate, /元素スキルが敵に命中すると/);
    assert.match(source.effectTextTemplate, /最大3層/);
    assert.deepEqual(
        Object.values(source.effectParamsByRefinement).map((item) => [item.param1, item.param2]),
        [
            ["52%", "28%"],
            ["65%", "35%"],
            ["78%", "42%"],
            ["91%", "49%"],
            ["104%", "56%"]
        ]
    );
});

test("赤砂の杖は元素熟知参照の常時補正と赤砂の夢3層補正を別経路で計算できる", () => {
    const calcData = loadCalcData();
    const records = calcData.weaponModifiers["13511"].modifiers;
    const base = records.find((item) => item.id === "w_13511_statBonus_3f1f80b6");
    const dream = records.find((item) => item.id === "w_13511_statBonus_f902d11b");
    const legacy = records.find((item) => item.id === "w_13511_scaling_bonus_1");
    const group = calcData.weaponEffectRegistry?.weapons?.["13511"]?.groups
        ?.find((item) => item.modifierIds?.includes("w_13511_statBonus_f902d11b"));

    assert.ok(base, "基礎元素熟知補正の構造化レコードが必要です");
    assert.ok(dream, "赤砂の夢補正の構造化レコードが必要です");
    assert.equal(base.reference?.stat, "elementalMastery");
    assert.equal(base.reference?.source, "self");
    assert.deepEqual(base.valueByRefinement, { 1: 52, 2: 65, 3: 78, 4: 91, 5: 104 });
    assert.notEqual(base.auditDisposition, "displayOnlyMisclassification");
    assert.equal(base.stack, undefined, "常時補正に赤砂の夢の層数を混在させない");
    assert.equal(dream.reference?.stat, "elementalMastery");
    assert.equal(dream.reference?.source, "self");
    assert.deepEqual(dream.valueByRefinementPerStack, { 1: 28, 2: 35, 3: 42, 4: 49, 5: 56 });
    assert.equal(dream.stack?.min, 0);
    assert.equal(dream.stack?.max, 3);
    assert.notEqual(dream.auditDisposition, "displayOnlyMisclassification");
    assert.ok(group, "赤砂の夢の共有層数入力を既存registry経路へ接続する");
    assert.equal(group.activation?.type, "stack");
    assert.equal(group.activation?.max, 3);
    assert.ok(group.modifierIds.includes("w_13511_statBonus_3f1f80b6"));
    assert.ok(group.modifierIds.includes("w_13511_statBonus_f902d11b"));
    assert.equal(legacy.auditDisposition, "supersededByStructuredRecord");
});
