"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

function createHarness() {
    return createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
}

function context({ energyRecharge = 100, refinement = 1, burst = false, baseAtk = 1000, mode = "manualMode" } = {}) {
    return {
        characterId: "10000002",
        weaponId: "13509",
        refinement,
        artifactSetMode: "",
        artifactSetIds: [],
        constellation: 0,
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        stats: {
            hp: 20000,
            atk: 2000,
            ...(baseAtk === undefined ? {} : { baseAtk }),
            def: 1000,
            elementalMastery: 100,
            energyRecharge,
            critRate: 50,
            critDamage: 100,
            elementDamageBonus: 0
        },
        enemy: { resistanceDebuff: 0, defenseDebuff: 0, defenseIgnore: 0 },
        manualInputs: { recordedHealing: null, providerStats: {}, resourceStates: {} },
        uiState: {
            enableWeaponLowHpCondition: burst,
            enableCharacterCondition: false,
            enableLowHpCondition: false,
            stackByModifier: {},
            conditionByModifier: {},
            toggleByModifier: {},
            complexConditionByModifier: {}
        },
        mode,
        inputProvenance: { includesPersistentBonuses: mode === "uidMode" }
    };
}

function modifier(calcData) {
    return calcData.weaponModifiers["13509"].modifiers
        .find((item) => item.id === "w_13509_statBonus_a105dd86");
}

function collect(sandbox, calcData, options) {
    const calcContext = context(options);
    return {
        calcContext,
        collected: sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext)
    };
}

test("草薙の稲光の超過元素チャージ補正は構造化され、閾値以下を無効化する", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const passive = modifier(calcData);

    assert.equal(passive.category, "scalingBonus");
    assert.equal(passive.customCalculation, "excessThresholdStatPercent");
    assert.deepEqual(passive.reference, { stat: "energyRecharge", source: "self" });
    assert.equal(passive.threshold, 100);
    assert.deepEqual(passive.maxValueByRefinement, { 1: 80, 2: 90, 3: 100, 4: 110, 5: 120 });
    assert.equal(sandbox.GenshinModifierAnalyzer.analyzeModifier({
        modifier: passive,
        source: "weapon:13509",
        context: context()
    }).calculation, "scalingStatBonus");

    for (const energyRecharge of [99, 100]) {
        const { calcContext, collected } = collect(sandbox, calcData, { energyRecharge });
        const stats = sandbox.GenshinCalcEngine.buildEffectiveStats(calcContext, collected).effectiveStats;
        assert.equal(stats.atk, 2000, `${energyRecharge}% ER`);
    }

    const { calcContext, collected } = collect(sandbox, calcData, { energyRecharge: 150 });
    const stats = sandbox.GenshinCalcEngine.buildEffectiveStats(calcContext, collected).effectiveStats;
    assert.equal(stats.atk, 2140);
});

test("草薙の稲光は精錬別倍率・攻撃力%上限を使い、超過補正を二重加算しない", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();

    for (const refinement of [1, 5]) {
        const { calcContext, collected } = collect(sandbox, calcData, {
            energyRecharge: 1000,
            refinement
        });
        const resolved = sandbox.GenshinCalcEngine.buildEffectiveStats(calcContext, collected);
        const expected = refinement === 1 ? 2800 : 3200;
        assert.equal(resolved.effectiveStats.atk, expected, `R${refinement}`);
        assert.equal(resolved.trace.filter((item) => item.modifierId === "w_13509_statBonus_a105dd86").length, 1);
    }
});

test("元素爆発後の元素チャージ効率を超過補正へ先に反映する", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const { calcContext, collected } = collect(sandbox, calcData, {
        energyRecharge: 100,
        burst: true
    });
    const resolved = sandbox.GenshinCalcEngine.buildEffectiveStats(calcContext, collected);

    assert.equal(resolved.effectiveStats.energyRecharge, 130);
    assert.equal(resolved.effectiveStats.atk, 2084);
    assert.equal(resolved.trace.filter((item) => item.modifierId === "w_13509_statBonus_a105dd86").length, 1);
    assert.equal(collected.applied.filter((item) => item.modifier.id === "w_13509_statBonus_a105dd86").length, 1);
});

test("UID入力では反映済みの超過補正を再加算せず、基礎攻撃力欠落時に合計攻撃力へフォールバックしない", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();

    const uid = collect(sandbox, calcData, { energyRecharge: 150, mode: "uidMode" });
    assert.equal(uid.collected.applied.some((item) => item.modifier.id === "w_13509_statBonus_a105dd86"), false);
    assert.equal(uid.collected.candidates.find((item) => item.modifier.id === "w_13509_statBonus_a105dd86").reason,
        "includedInUidStatsのため未適用");

    const missingBase = collect(sandbox, calcData, { energyRecharge: 150, baseAtk: null });
    const stats = sandbox.GenshinCalcEngine.buildEffectiveStats(missingBase.calcContext, missingBase.collected).effectiveStats;
    assert.equal(stats.atk, 2000);
});

test("通常の計算経路へ超過補正を一度だけ渡す", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const calcContext = context({ energyRecharge: 150 });
    calcContext.reactionOption = { reactionId: "none", family: "none", enabled: false };
    calcContext.reactionDefinitions = calcData.reactionDefinitions;
    const payload = sandbox.GenshinCalcEngine.calculateDamageRequest(calcContext, calcData);
    const normal = payload.results.find((result) => result.entry.attackType === "normalAttack");

    assert.equal(payload.context.effectiveStats.atk, 2140);
    assert.equal(normal.breakdown.statBonus.atk, 140);
    assert.equal(normal.breakdown.appliedModifiers.filter((item) => item.modifier.id === "w_13509_statBonus_a105dd86").length, 1);
});

test("v2 Specは閾値・精錬別上限・計算方式を失わず未検証のまま保持する", () => {
    const specs = JSON.parse(fs.readFileSync(path.resolve(__dirname,
        "../../games/genshin/data/v2/weapons/spec-candidates.json"), "utf8"));
    const spec = specs.w_13509_statBonus_a105dd86;
    assert.equal(spec.effect.customCalculation, "excessThresholdStatPercent");
    assert.equal(spec.effect.threshold, 100);
    assert.deepEqual(spec.effect.maxValueByRefinement, { 1: 80, 2: 90, 3: 100, 4: 110, 5: 120 });
    assert.equal(spec.effect.inputPolicy, "reflected");
    assert.equal(spec.verification.status, "needsReview");
    assert.equal(spec.runtime.status, "candidate");
});
