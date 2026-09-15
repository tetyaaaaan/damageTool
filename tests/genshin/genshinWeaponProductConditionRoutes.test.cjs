"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createBrowserScriptHarness, loadCalcData } = require("./helpers/browserScriptHarness.cjs");
const { createScenarioHarness, prepareScenarioInputs, setConditionElement } = require("./helpers/calcScenarioHarness.cjs");

function harness() {
    return createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
}

function context(weaponId) {
    return {
        characterId: "10000002",
        weaponId,
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

function enable(sandbox, calcData, calcContext, modifierId) {
    const modifier = calcData.weaponModifiers[calcContext.weaponId].modifiers.find((item) => item.id === modifierId);
    const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(modifier, `weapon:${calcContext.weaponId}`);
    calcContext.uiState.conditionByModifier[key] = { enabled: true, stack: 0, option: "" };
    return modifier;
}

test("降臨の剣の未解決procを後継なしで処置完了にしない", () => {
    const records = loadCalcData().weaponModifiers["11412"].modifiers;
    assert.equal(records.find(m => m.id === "w_11412_extra_damage_1").auditDisposition, "sourceContextRequired");
    assert.equal(records.find(m => m.id === "w_11412_extraDamage_f23c5dd2").auditDisposition, "supersededByStructuredRecord");
});

test("シールドなしHP補正は明示toggle時だけ適用し、旧常時レコードを重複させない", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const calcContext = context("12511");
    const legacy = calcData.weaponModifiers["12511"].modifiers.find((item) => item.id === "w_12511_statBonus_686cb1e6");
    const active = enable(sandbox, calcData, calcContext, "w_12511_stat_3");
    assert.equal(legacy.auditDisposition, "supersededByStructuredRecord");
    assert.equal(active.condition, "notShielded");
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
    assert.equal(collected.applied.filter((item) => [legacy.id, active.id].includes(item.modifier.id)).length, 1);
    assert.equal(collected.applied.find((item) => item.modifier.id === active.id).value, 32);
});

test("月感電後の会心ダメージをreaction bonusへ誤分類しない", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const calcContext = context("13516");
    const active = enable(sandbox, calcData, calcContext, "w_13516_critBonus_0eecdab8");
    calcContext.uiState.conditionByModifier["weapon:13516:group:weapon13516LunarChargedRequiem"].option = "lunarCharged";
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
    assert.equal(active.category, "critBonus");
    assert.deepEqual(active.applyTo, ["critDamage"]);
    assert.equal(collected.applied.find((item) => item.modifier.id === active.id).value, 28);
    assert.equal(collected.applied.some((item) => [
        "w_13516_reactionBonus_d4e397ce", "w_13516_reaction_bonus_2"
    ].includes(item.modifier.id)), false);
    const reaction = enable(sandbox, calcData, calcContext, "w_13516_reaction_bonus_1");
    assert.deepEqual(reaction.applyTo, ["lunarChargedDamageBonus"]);
});

test("灼心状態の補正は重撃だけへ明示toggleで適用する", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const calcContext = context("15424");
    const legacy = calcData.weaponModifiers["15424"].modifiers.find((item) => item.id === "w_15424_damageBonus_05580649");
    const active = enable(sandbox, calcData, calcContext, "w_15424_damage_2");
    assert.equal(legacy.auditDisposition, "supersededByStructuredRecord");
    assert.deepEqual(active.applyTo, ["chargedAttackDamageBonus"]);
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
    const applied = collected.applied.filter((item) => [legacy.id, active.id].includes(item.modifier.id));
    assert.equal(applied.length, 1);
    assert.equal(applied[0].modifier.id, active.id);
    assert.equal(applied[0].value, 28);
});

test("戦闘中減衰・攻撃種別別回復を未実装のまま初期最大値で代用しない", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const calcContext = context("15515");
    const modifier = calcData.weaponModifiers["15515"].modifiers[0];
    assert.equal(modifier.condition, "outOfCombatFor3Seconds");
    assert.equal(sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext).applied.length, 0);
    enable(sandbox, calcData, calcContext, modifier.id);
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
    assert.equal(collected.applied.length, 0);
    assert.equal(collected.candidates.find(item => item.modifier.id === modifier.id).analysis.reasonCode, "SOURCE_CONTEXT_REQUIRED");
});

test("死闘の槍は敵数状態を相互排他で選びATKとDEFを正しく切り替える", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const empty = context("13405");
    assert.equal(sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, empty).applied.length, 0);

    const key = "weapon:13405:group:weapon13405NearbyEnemyCount";
    const many = context("13405");
    many.uiState.conditionByModifier[key] = { enabled: true, stack: 0, option: "atLeast2" };
    const manyApplied = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, many).applied
        .filter((item) => item.source === "weapon:13405");
    assert.deepEqual(Array.from(manyApplied.map((item) => [item.modifier.id, item.value])), [
        ["w_13405_stat_1", 16],
        ["w_13405_stat_2", 16]
    ]);

    const few = context("13405");
    few.uiState.conditionByModifier[key] = { enabled: true, stack: 0, option: "fewerThan2" };
    const fewApplied = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, few).applied
        .filter((item) => item.source === "weapon:13405");
    assert.deepEqual(Array.from(fewApplied.map((item) => [item.modifier.id, item.value])), [
        ["w_13405_stat_3", 24]
    ]);
});

test("死闘の槍の敵数選択は通常の入力・計算経路でも相互排他となる", async () => {
    for (const [option, atk, def] of [["", 0, 0], ["atLeast2", 160, 80], ["fewerThan2", 240, 0]]) {
        const h = createScenarioHarness();
        prepareScenarioInputs(h.elements, {
            characterId: "10000002",
            weaponId: "13405",
            stats: { baseAtk: 1000, baseDef: 500 }
        });
        if (option) setConditionElement(h.elements, "weapon:13405:group:weapon13405NearbyEnemyCount", "option", option);
        const result = await h.sandbox.GenshinCalcEngine.runGenshinJsonCalc();
        const bonus = result.results[0].breakdown.statBonus;
        assert.equal(bonus.atk || 0, atk);
        assert.equal(bonus.def || 0, def);
    }
});

test("反応後12秒の武器補正は持続時間を保持し明示toggle時だけ適用する", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const cases = [
        ["11433", "w_11433_statBonus_ffeb67a4", 16, 32],
        ["12433", "w_12433_statBonus_82f9bf11", 60, 120],
        ["15433", "w_15433_statBonus_8099b23b", 60, 120]
    ];
    for (const [weaponId, modifierId, r1, r5] of cases) {
        for (const [refinement, expected] of [[1, r1], [5, r5]]) {
            const calcContext = context(weaponId);
            calcContext.refinement = refinement;
            const modifier = calcData.weaponModifiers[weaponId].modifiers.find((item) => item.id === modifierId);
            assert.equal(modifier.duration, 12);
            assert.equal(sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext).applied
                .some((item) => item.modifier.id === modifierId), false);
            enable(sandbox, calcData, calcContext, modifierId);
            const applied = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext).applied
                .find((item) => item.modifier.id === modifierId);
            assert.equal(applied.value, expected);
        }
    }
});

test("命中後ATK stack武器は8秒を保持し0層と5層の境界を正しく扱う", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const cases = [
        ["11504", "w_11504_statBonus_c2e177a6"],
        ["12504", "w_12504_statBonus_9f4e3296"],
        ["13504", "w_13504_statBonus_5df4b7c9"]
    ];
    for (const [weaponId, modifierId] of cases) {
        const modifier = calcData.weaponModifiers[weaponId].modifiers.find((item) => item.id === modifierId);
        assert.equal(modifier.duration, 8);
        for (const [refinement, expected] of [[1, 20], [5, 40]]) {
            const calcContext = context(weaponId);
            calcContext.refinement = refinement;
            assert.equal(sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext).applied
                .some((item) => item.modifier.id === modifierId), false);
            const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(modifier, `weapon:${weaponId}`);
            calcContext.uiState.stackByModifier[modifierId] = 5;
            calcContext.uiState.conditionByModifier[key] = { enabled: true, stack: 5, option: "" };
            const applied = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext).applied
                .find((item) => item.modifier.id === modifierId);
            assert.equal(applied.value, expected);
        }
    }
});

test("反応後ATK/EM補正は旧重複を止め正しい持続時間で一度だけ適用する", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    for (const [weaponId, legacyId, activeId] of [
        ["11304", "w_11304_statBonus_8009fd12", "w_11304_stat_1"],
        ["14304", "w_14304_statBonus_76bc7350", "w_14304_stat_1"]
    ]) {
        const calcContext = context(weaponId);
        const legacy = calcData.weaponModifiers[weaponId].modifiers.find((item) => item.id === legacyId);
        const active = enable(sandbox, calcData, calcContext, activeId);
        assert.equal(legacy.auditDisposition, "supersededByStructuredRecord");
        assert.equal(active.duration, 12);
        const applied = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext).applied
            .filter((item) => [legacyId, activeId].includes(item.modifier.id));
        assert.equal(applied.length, 1);
        assert.equal(applied[0].value, 20);
    }

    const calcContext = context("13419");
    for (const [modifierId, expected] of [
        ["w_13419_statBonus_5bf6f612", 48],
        ["w_13419_statBonus_740027e0", 12]
    ]) {
        const modifier = enable(sandbox, calcData, calcContext, modifierId);
        assert.equal(modifier.duration, 10);
        const applied = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext).applied
            .find((item) => item.modifier.id === modifierId);
        assert.equal(applied.value, expected);
    }
});

test("スキル発動後の武器補正は常時適用せず明示toggle時だけ有効になる", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const cases = [
        ["13431", "w_13431_statBonus_2bc3e516", 15, 16, 32],
        ["13432", "w_13432_statBonus_2f1846f4", 10, 20, 40],
        ["14430", "w_14430_statBonus_9fed3ad4", 10, 20, 40]
    ];
    for (const [weaponId, modifierId, duration, r1, r5] of cases) {
        const modifier = calcData.weaponModifiers[weaponId].modifiers.find((item) => item.id === modifierId);
        assert.equal(modifier.condition, "afterSkillCast");
        assert.equal(modifier.duration, duration);
        for (const [refinement, expected] of [[1, r1], [5, r5]]) {
            const calcContext = context(weaponId);
            calcContext.refinement = refinement;
            assert.equal(sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext).applied
                .some((item) => item.modifier.id === modifierId), false);
            enable(sandbox, calcData, calcContext, modifierId);
            const applied = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext).applied
                .find((item) => item.modifier.id === modifierId);
            assert.equal(applied.value, expected);
        }
    }
});

test("ストロング・ボーンはダッシュ後だけ通常攻撃へ攻撃力比例加算を適用する", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const modifier = calcData.weaponModifiers["11430"].modifiers.find((item) => item.id === "w_11430_add_base_1");
    assert.ok(modifier);
    assert.equal(modifier.category, "additiveBaseDamage");
    assert.deepEqual(modifier.applyTo, ["normalAttackDamageBonus"]);
    assert.equal(modifier.condition, "afterSprint");
    assert.equal(modifier.duration, 7);
    assert.equal(modifier.maxTriggerCount, 18);
    assert.equal(modifier.auditDisposition, undefined);

    for (const [refinement, expectedRate] of [[1, 16], [5, 32]]) {
        const calcContext = context("11430");
        calcContext.refinement = refinement;
        assert.equal(sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext).applied
            .some((item) => item.modifier.id === modifier.id), false);
        enable(sandbox, calcData, calcContext, modifier.id);
        const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
        const active = collected.applied.find((item) => item.modifier.id === modifier.id);
        assert.equal(active.value, expectedRate);
        const normal = sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(
            { attackType: "normalAttack", damageType: "normalAttack", element: "physical" },
            calcContext,
            collected
        );
        const skill = sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(
            { attackType: "skill", damageType: "skill", element: "physical" },
            calcContext,
            collected
        );
        assert.equal(normal.totals.additiveBaseDamage, calcContext.stats.atk * expectedRate / 100);
        assert.equal(skill.totals.additiveBaseDamage, 0);
    }
});
