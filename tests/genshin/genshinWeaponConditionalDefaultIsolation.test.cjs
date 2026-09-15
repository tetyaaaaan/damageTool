"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const affectedByWeapon = new Map([
    ["11305", ["w_11305_extraDamage_7347a245"]],
    ["11425", ["w_11425_statBonus_ff739aa5"]],
    ["11428", ["w_11428_extraDamage_ac4f2d59", "w_11428_extra_damage_1"]],
    ["11501", ["w_11501_extra_damage_2"]],
    ["11502", ["w_11502_extra_damage_2"]],
    ["12305", ["w_12305_extra_damage_1"]],
    ["12411", ["w_12411_extra_damage_1", "w_12411_extra_damage_2"]],
    ["12406", ["w_12406_extra_damage_1"]],
    ["12501", ["w_12501_extra_damage_2"]],
    ["13403", ["w_13403_extra_damage_1"]],
    ["13409", ["w_13409_extra_damage_1", "w_13409_extra_damage_2"]],
    ["13502", ["w_13502_extra_damage_2"]],
    ["14409", ["w_14409_extra_damage_1"]],
    ["14412", ["w_14412_extra_damage_1", "w_14412_extra_damage_2"]],
    ["14427", ["w_14427_extraDamage_aafebcff"]],
    ["14501", ["w_14501_extra_damage_2"]],
    ["15409", ["w_15409_extra_damage_1"]],
    ["15417", ["w_15417_extra_damage_2"]],
    ["15418", ["w_15418_extra_damage_1"]],
    ["15424", ["w_15424_extra_damage_1"]],
    ["15432", ["w_15432_extraDamage_367a328c"]],
    ["15513", ["w_15513_crit_1"]],
    ["15515", ["w_15515_damage_1"]],
]);

function context(weaponId, { refinement = 1, enabled = false } = {}) {
    return {
        characterId: "10000002",
        weaponId,
        refinement,
        artifactSetMode: "",
        artifactSetIds: [],
        constellation: 0,
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        stats: { hp: 20000, atk: 2000, baseAtk: 1000, def: 1000, elementalMastery: 100, energyRecharge: 100, critRate: 50, critDamage: 100, elementalDamageBonus: 0 },
        enemy: { resistanceDebuff: 0, defenseDebuff: 0, defenseIgnore: 0 },
        manualInputs: { recordedHealing: null, providerStats: {}, resourceStates: {} },
        uiState: {
            stackByModifier: {},
            conditionByModifier: {},
            toggleByModifier: {},
            complexConditionByModifier: {},
            enableWeaponLowHpCondition: enabled
        },
        mode: "manualMode"
    };
}

test("未入力の発動条件・相互排他状態・参照量をproductionへ無条件適用しない", () => {
    const sandbox = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
    const calcData = loadCalcData();
    let audited = 0;

    for (const [weaponId, affectedIds] of affectedByWeapon) {
        const modifiers = calcData.weaponModifiers[weaponId].modifiers.filter((item) => affectedIds.includes(item.id));
        assert.equal(modifiers.length, affectedIds.length, weaponId);
        assert.ok(modifiers.every((item) => item.auditDisposition === "sourceContextRequired"), weaponId);
        const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context(weaponId));
        assert.equal(collected.applied.some((item) => affectedIds.includes(item.modifier.id)), false, weaponId);
        const candidates = collected.candidates.filter((item) => affectedIds.includes(item.modifier.id));
        assert.equal(candidates.length, affectedIds.length, weaponId);
        assert.ok(candidates.every((item) => item.analysis.reasonCode === "SOURCE_CONTEXT_REQUIRED"), weaponId);
        audited += affectedIds.length;
    }
    assert.equal(audited, 27);
});

test("鉾槍は通常攻撃命中後だけを明示的に有効化し、精錬倍率と10秒制限を保持する", () => {
    const sandbox = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
    const calcData = loadCalcData();
    const modifier = calcData.weaponModifiers["13302"].modifiers.find((item) => item.id === "w_13302_extra_damage_1");
    assert.ok(modifier);
    assert.equal(modifier.condition, "afterNormalAttackHit");
    assert.equal(modifier.calculationSupport, "toggle");
    assert.equal(modifier.uidHandling, "conditional");
    assert.equal(modifier.cooldown, 10);
    assert.equal(modifier.auditDisposition, undefined);

    for (const [refinement, expected] of [[1, 160], [5, 320]]) {
        const disabled = sandbox.GenshinCalcEngine.collectActiveModifiers(
            calcData,
            context("13302", { refinement, enabled: false })
        );
        assert.equal(disabled.applied.some((item) => item.modifier.id === modifier.id), false,
            `R${refinement} default must stay disabled`);

        const enabled = sandbox.GenshinCalcEngine.collectActiveModifiers(
            calcData,
            context("13302", { refinement, enabled: true })
        );
        const applied = enabled.applied.find((item) => item.modifier.id === modifier.id);
        assert.ok(applied, `R${refinement} enabled`);
        assert.equal(applied.value, expected, `R${refinement} value`);
        assert.equal(applied.analysis.condition, "afterNormalAttackHit");
        assert.deepEqual(applied.analysis.targets, ["triggeredDamage"]);
    }
});

test("銜玉の海皇は元素爆発命中後だけを明示的に有効化し、精錬倍率と15秒制限を保持する", () => {
    const sandbox = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
    const calcData = loadCalcData();
    const modifier = calcData.weaponModifiers["12412"].modifiers.find((item) => item.id === "w_12412_extraDamage_5c1cd1ea");
    assert.ok(modifier);
    assert.equal(modifier.condition, "afterBurstHit");
    assert.equal(modifier.calculationSupport, "toggle");
    assert.equal(modifier.uidHandling, "conditional");
    assert.equal(modifier.cooldown, 15);
    assert.equal(modifier.auditDisposition, undefined);

    for (const [refinement, expected] of [[1, 100], [5, 200]]) {
        const disabled = sandbox.GenshinCalcEngine.collectActiveModifiers(
            calcData,
            context("12412", { refinement, enabled: false })
        );
        assert.equal(disabled.applied.some((item) => item.modifier.id === modifier.id), false,
            `R${refinement} default must stay disabled`);

        const enabled = sandbox.GenshinCalcEngine.collectActiveModifiers(
            calcData,
            context("12412", { refinement, enabled: true })
        );
        const applied = enabled.applied.find((item) => item.modifier.id === modifier.id);
        assert.ok(applied, `R${refinement} enabled`);
        assert.equal(applied.value, expected, `R${refinement} value`);
        assert.equal(applied.analysis.condition, "afterBurstHit");
        assert.deepEqual(applied.analysis.targets, ["triggeredDamage"]);
    }
});

test("恒氷晶核の旧重撃stack投影を構造化済み効果と重複適用しない", () => {
    const calcData = loadCalcData();
    for (const [weaponId, modifierId] of [
        ["12411", "w_12411_extraDamage_c558a23f"],
        ["13409", "w_13409_extraDamage_c9330e7b"],
        ["14412", "w_14412_extraDamage_db770126"]
    ]) {
        const modifier = calcData.weaponModifiers[weaponId].modifiers.find((item) => item.id === modifierId);
        assert.equal(modifier.auditDisposition, "supersededByStructuredRecord", weaponId);
    }
});

test("配列型stack補正は0層を無効化し、1層・3層を精錬別に実計算する", () => {
    const sandbox = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
    const calcData = loadCalcData();
    const cases = [
        {
            weaponId: "15509",
            modifierId: "w_15509_damage_2",
            expected: { 1: [0, 12, 40], 5: [0, 24, 80] }
        },
        {
            weaponId: "15512",
            modifierId: "w_15512_statBonus_5c669f4b",
            expected: { 1: [0, 16, 48], 5: [0, 32, 96] }
        },
        {
            weaponId: "15513",
            modifierId: "w_15513_statBonus_6b22fafe",
            expected: { 1: [0, 12, 40], 5: [0, 24, 80] }
        }
    ];

    for (const { weaponId, modifierId, expected } of cases) {
        for (const refinement of [1, 5]) {
            for (const [index, stack] of [0, 1, 3].entries()) {
                const calcContext = context(weaponId);
                calcContext.refinement = refinement;
                calcContext.stats.baseHp = 10000;
                calcContext.stats.baseDef = 500;
                calcContext.uiState.stackByModifier[modifierId] = stack;
                const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
                const applied = collected.applied.find((item) => item.modifier.id === modifierId);
                assert.equal(applied?.value ?? 0, expected[refinement][index],
                    `${modifierId} R${refinement} stack${stack}`);
            }
        }
    }
});

test("11419/11420/11421の与えるダメージ-50%を通常計算へ正しく適用する", () => {
    const sandbox = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
    const calcData = loadCalcData();

    for (const weaponId of ["11419", "11420", "11421"]) {
        const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context(weaponId));
        const applied = collected.applied.find((item) => item.modifier.id === `w_${weaponId}_damage_2`);
        assert.ok(applied, weaponId);
        assert.equal(applied.modifier.applyTo.includes("allDamageBonus"), true, weaponId);
        assert.equal(applied.value, -50, weaponId);
    }
});
