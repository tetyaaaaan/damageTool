"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const root = path.resolve(__dirname, "../..");

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function createHarness() {
    return createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
}

function context({ mode = "manualMode", lowHp = false, weaponId = "13501", hp = 20000 } = {}) {
    return {
        characterId: "10000002",
        weaponId,
        refinement: 1,
        artifactSetMode: "",
        artifactSetIds: [],
        constellation: 0,
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        stats: {
            hp,
            atk: 2000,
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
            amosStack: 0,
            crimsonWitchStack: 0,
            enableCharacterCondition: false,
            enableLowHpCondition: false,
            enableWeaponLowHpCondition: lowHp,
            constellationConditions: {},
            stackByModifier: {},
            conditionByModifier: {},
            toggleByModifier: {},
            complexConditionByModifier: {}
        },
        mode,
        inputProvenance: { includesPersistentBonuses: mode === "uidMode" }
    };
}

test("聖顕の鍵は最大HP参照分を固定攻撃力へ一度だけ加算する", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const modifier = calcData.weaponModifiers["11505"].modifiers
        .find((item) => item.id === "w_11505_statBonus_3b0ac810");
    const duplicate = calcData.weaponModifiers["11505"].modifiers
        .find((item) => item.id === "w_11505_v3_scalingBonus_2");

    assert.deepEqual(modifier.applyTo, ["atkFlat"]);
    assert.equal(modifier.unit, "percentOfReference");
    assert.deepEqual(modifier.reference, { stat: "hp", source: "self" });
    assert.equal(duplicate.auditDisposition, "supersededByStructuredRecord");

    for (const [hp, expectedAtk] of [[10000, 2120], [20000, 2240]]) {
        const calcContext = context({ weaponId: "11505", hp });
        const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
        const effective = sandbox.GenshinCalcEngine.buildEffectiveStats(calcContext, collected).effectiveStats;
        assert.equal(collected.applied.filter((item) => item.modifier.id === modifier.id).length, 1);
        assert.equal(collected.applied.some((item) => item.modifier.id === duplicate.id), false);
        assert.equal(effective.atk, expectedAtk);
    }
});

test("護摩の杖は最大HP参照の固定攻撃力として投影し、ATK%へ誤変換しない", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const modifier = calcData.weaponModifiers["13501"].modifiers
        .find((item) => item.id === "w_13501_statBonus_bd150185");

    assert.deepEqual(modifier.applyTo, ["atkFlat"]);
    assert.equal(modifier.unit, "percentOfReference");
    assert.deepEqual(modifier.reference, { stat: "hp", source: "self" });
    assert.equal(modifier.uidHandling, "includedInUidStats");

    const manualContext = context();
    const manualCollected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, manualContext);
    const manualStats = sandbox.GenshinCalcEngine.buildEffectiveStats(manualContext, manualCollected).effectiveStats;
    assert.equal(manualCollected.applied.filter((item) => item.modifier.id === modifier.id).length, 1);
    assert.equal(manualStats.atk, 2160);
    assert.notEqual(manualStats.atk, 2006.4);

    const uidContext = context({ mode: "uidMode" });
    const uidCollected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, uidContext);
    assert.equal(uidCollected.applied.some((item) => item.modifier.id === modifier.id), false);
    assert.equal(uidCollected.candidates.find((item) => item.modifier.id === modifier.id).reason,
        "includedInUidStatsのため未適用");
});

test("護摩の杖のHP50%未満追加分は別経路で一度だけ加算する", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const calcContext = context({ lowHp: true });
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
    const relevant = collected.applied.filter((item) => [
        "w_13501_statBonus_bd150185",
        "w_13501_extraDamage_800a1eaf"
    ].includes(item.modifier.id));
    const stats = sandbox.GenshinCalcEngine.buildEffectiveStats(calcContext, collected).effectiveStats;

    assert.deepEqual(Array.from(relevant.map((item) => item.modifier.id)), [
        "w_13501_extraDamage_800a1eaf",
        "w_13501_statBonus_bd150185"
    ]);
    assert.equal(stats.atk, 2360);
});

test("護摩の杖の旧scalingBonus派生は構造化補正と重複しない", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const duplicate = calcData.weaponModifiers["13501"].modifiers
        .find((item) => item.id === "w_13501_v3_scalingBonus_2");
    const calcContext = context();
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);

    assert.equal(duplicate.auditDisposition, "supersededByStructuredRecord");
    assert.equal(collected.applied.some((item) => item.modifier.id === duplicate.id), false);
    assert.equal(collected.candidates.find((item) => item.modifier.id === duplicate.id)?.analysis?.supportStatus, "displayOnly");
});

test("護摩の杖のv2派生記録は補正経路だけを同期しstrict状態を変更しない", () => {
    const id = "w_13501_statBonus_bd150185";
    const source = readJson("games/genshin/data/v2/weapons/source-records.json")[`weapon:13501:modifier:${id}`];
    const spec = readJson("games/genshin/data/v2/weapons/spec-candidates.json")[id];
    const verification = readJson("games/genshin/data/v2/weapons/verification.json")[id];

    assert.deepEqual(source.structuredValue.applyTo, ["atkFlat"]);
    assert.equal(source.structuredValue.unit, "percentOfReference");
    assert.deepEqual(source.structuredValue.reference, { stat: "hp", source: "self" });
    assert.deepEqual(spec.effect.targets, ["atkFlat"]);
    assert.equal(spec.effect.unit, "percentOfReference");
    assert.deepEqual(spec.effect.reference, { stat: "hp", source: "self" });
    assert.equal(spec.verification.status, "needsReview");
    assert.equal(spec.verification.sourceAgreement, "singleSource");
    assert.equal(spec.runtime.status, "candidate");
    assert.equal(verification.verification.status, "needsReview");
    assert.equal(verification.runtime.status, "candidate");
});
