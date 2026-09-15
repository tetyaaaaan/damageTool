"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { loadCalcData } = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "15514";
const IDS = {
    charged: "w_15514_damageBonus_da26c5de",
    burst: "w_15514_damageBonus_e8964879",
    swirlAtk: "w_15514_statBonus_b409d658"
};

const SOURCE_PATHS = [
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard04/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/English/weapons/astralvulturescrimsonplumage.json",
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard04/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/English/weapons/astralvulturescrimsonplumage.json"
];

function records(calcData = loadCalcData()) {
    return calcData.weaponModifiers[WEAPON_ID].modifiers;
}

function record(id, calcData) {
    return records(calcData).find((item) => item.id === id);
}

test("星鷲の紅き羽の6.7/7.0 rawは拡散条件のversion差と3効果の数値を明示する", () => {
    const sources = SOURCE_PATHS.map((path) => require(path));
    sources.forEach((source) => {
        assert.equal(source.id, 15514);
        assert.match(source.effectTemplateRaw, /Swirl/);
        assert.deepEqual(source.r1.values, ["24%", "20%/48%", "10%/24%"]);
        assert.deepEqual(source.r5.values, ["48%", "40%/96%", "20%/48%"]);
    });
    assert.match(sources[0].effectTemplateRaw, /triggering a Swirl reaction/);
    assert.doesNotMatch(sources[0].effectTemplateRaw, /Stellar Swirl/);
    assert.match(sources[1].effectTemplateRaw, /triggering a Swirl or Stellar Swirl reaction/);
    assert.notDeepEqual(sources[0], sources[1], "7.0 adds Stellar Swirl to the trigger scope");
});

test("星鷲の紅き羽は異元素人数を層入力し、7.0の星拡散を含む拡散後だけATKを適用する", () => {
    const calcData = loadCalcData();
    const charged = record(IDS.charged, calcData);
    const burst = record(IDS.burst, calcData);
    const swirlAtk = record(IDS.swirlAtk, calcData);

    [charged, burst].forEach((modifier) => {
        assert.equal(modifier.condition, "differentElementPartyCount");
        assert.equal(modifier.conditionInput?.type, "stack");
        assert.equal(modifier.conditionInput?.min, 0);
        assert.equal(modifier.conditionInput?.max, 2);
        assert.deepEqual(modifier.stack, { min: 0, max: 2, default: 0 });
        assert.equal(modifier.calculationSupport, "stack");
    });
    assert.deepEqual(charged.applyTo, ["chargedAttackDamageBonus"]);
    assert.deepEqual(charged.valueByRefinement, {
        1: [20, 48], 2: [25, 60], 3: [30, 72], 4: [35, 84], 5: [40, 96]
    });
    assert.deepEqual(burst.applyTo, ["burstDamageBonus"]);
    assert.deepEqual(burst.valueByRefinement, {
        1: [10, 24], 2: [12.5, 30], 3: [15, 36], 4: [17.5, 42], 5: [20, 48]
    });

    assert.deepEqual(swirlAtk.applyTo, ["atkPercent"]);
    assert.equal(swirlAtk.condition, "afterReaction");
    assert.equal(swirlAtk.duration, 12);
    assert.equal(swirlAtk.conditionInput?.type, "option");
    assert.equal(swirlAtk.conditionOptionValue, "swirlOrStellarSwirl");
    assert.deepEqual(swirlAtk.conditionInput?.options?.map((option) => option.value), ["inactive", "swirlOrStellarSwirl"]);
    assert.deepEqual(swirlAtk.valueByRefinement, { 1: 24, 2: 30, 3: 36, 4: 42, 5: 48 });
});
