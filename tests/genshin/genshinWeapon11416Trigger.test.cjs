"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "11416";
const STAT_ID = "w_11416_stat_2";
const EXTRA_DAMAGE_ID = "w_11416_extraDamage_7e54e257";

function createHarness() {
    return createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
}

function context(overrides = {}) {
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
            conditionByModifier: {},
            toggleByModifier: {},
            complexConditionByModifier: {}
        },
        mode: "manualMode",
        ...overrides
    };
}

function modifier(calcData, id) {
    return calcData.weaponModifiers[WEAPON_ID].modifiers.find((item) => item.id === id);
}

function setCondition(sandbox, calcContext, calcData, id, enabled) {
    const item = modifier(calcData, id);
    const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(item, `weapon:${WEAPON_ID}`);
    calcContext.uiState.conditionByModifier[key] = { enabled, stack: 0, option: "" };
    return item;
}

function appliedFor(collected, id) {
    return collected.applied.filter((item) => item.modifier.id === id);
}

test("籠釣瓶一心の発動状態・値・継続時間・精錬不変を保持する", () => {
    const calcData = loadCalcData();
    const stat = modifier(calcData, STAT_ID);

    assert.deepEqual(stat.applyTo, ["atkPercent"]);
    assert.equal(stat.condition, "afterNormalChargedOrPlungingHit");
    assert.equal(stat.conditionLabel, "通常攻撃・重撃・落下攻撃の命中後8秒以内");
    assert.equal(stat.calculationSupport, "toggle");
    assert.equal(stat.uidHandling, "conditional");
    assert.equal(stat.value, 15);
    assert.equal(stat.duration, 8);
    assert.equal(stat.valueByRefinement, undefined);
});

test("籠釣瓶一心の攻撃力補正は初期OFFで、基礎攻撃力欠落時もfail-closed", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();

    const inactive = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context());
    assert.equal(appliedFor(inactive, STAT_ID).length, 0);
    assert.equal(inactive.candidates.find((item) => item.modifier.id === STAT_ID).reason, "条件OFF");

    const invalidBase = context({ stats: { ...context().stats, baseAtk: 0 } });
    setCondition(sandbox, invalidBase, calcData, STAT_ID, true);
    const rejected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, invalidBase);
    assert.equal(appliedFor(rejected, STAT_ID).length, 0);
    const candidate = rejected.candidates.find((item) => item.modifier.id === STAT_ID);
    assert.equal(candidate.analysis.reasonCode, "BASE_STAT_INPUT_REQUIRED");
    assert.equal(JSON.stringify(candidate.analysis.missingInputs), JSON.stringify(["stats.baseAtk"]));
});

test("籠釣瓶一心は明示ON時に攻撃力+15%を一度だけ適用し、R1-R5で値を変えない", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();

    for (const refinement of [1, 2, 3, 4, 5]) {
        const calcContext = context({ refinement });
        setCondition(sandbox, calcContext, calcData, STAT_ID, true);
        const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
        const applied = appliedFor(collected, STAT_ID);
        assert.equal(applied.length, 1, `R${refinement}`);
        assert.equal(applied[0].value, 15, `R${refinement}`);
        assert.equal(collected.applied.filter((item) => item.source === `weapon:${WEAPON_ID}`).length, 1, `R${refinement}`);
        assert.equal(sandbox.GenshinCalcEngine.buildEffectiveStats(calcContext, collected).effectiveStats.atk, 2150, `R${refinement}`);
    }
});

test("攻撃力補正の明示ONは無関係な鋭い風の追加ダメージを連動ONにしない", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const calcContext = context();
    setCondition(sandbox, calcContext, calcData, STAT_ID, true);

    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
    assert.equal(
        JSON.stringify(collected.applied.filter((item) => item.source === `weapon:${WEAPON_ID}`).map((item) => item.modifier.id)),
        JSON.stringify([STAT_ID])
    );
    assert.equal(appliedFor(collected, EXTRA_DAMAGE_ID).length, 0);
    assert.equal(collected.candidates.find((item) => item.modifier.id === EXTRA_DAMAGE_ID).reason, "条件OFF");
});
