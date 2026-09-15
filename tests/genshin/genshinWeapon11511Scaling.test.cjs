"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const MODIFIER_ID = "w_11511_scaling_bonus_2";
const SUPERSEDED_ID = "w_11511_extraDamage_da815d6f";
const REFINEMENT_VALUES = {
    1: 0.12,
    2: 0.15,
    3: 0.18,
    4: 0.21,
    5: 0.24
};

function createHarness() {
    return createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
}

function context(refinement, stack) {
    return {
        characterId: "10000002",
        weaponId: "11511",
        refinement,
        artifactSetMode: "",
        artifactSetIds: [],
        constellation: 0,
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        stats: {
            hp: 100000,
            atk: 1200,
            def: 1000,
            elementalMastery: 0,
            energyRecharge: 100,
            critRate: 50,
            critDamage: 100,
            elementDamageBonus: 0
        },
        enemy: {
            resistanceDebuff: 0,
            defenseDebuff: 0,
            defenseIgnore: 0
        },
        manualInputs: {
            recordedHealing: null,
            providerStats: {},
            resourceStates: {}
        },
        uiState: {
            stackByModifier: { [MODIFIER_ID]: stack },
            conditionByModifier: {},
            toggleByModifier: {},
            complexConditionByModifier: {}
        },
        mode: "uidMode"
    };
}

function modifier(calcData, id) {
    return calcData.weaponModifiers["11511"].modifiers.find((item) => item.id === id);
}

test("聖顕の鍵の壮大な詩篇は精錬値別・層別のHP参照倍率を使う", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const active = modifier(calcData, MODIFIER_ID);

    assert.equal(active.value, undefined);
    assert.deepEqual(active.valueByRefinement, REFINEMENT_VALUES);
    assert.deepEqual(active.valueByRefinementPerStack, REFINEMENT_VALUES);
    assert.deepEqual(active.stack, { min: 0, max: 3, default: 0 });
    assert.deepEqual(active.reference, { stat: "hp", source: "self" });

    for (const refinement of [1, 5]) {
        for (const stack of [0, 1, 3]) {
            const calcContext = context(refinement, stack);
            const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
            const relevantApplied = collected.applied.filter((item) =>
                item.source === "weapon:11511"
                && [MODIFIER_ID, SUPERSEDED_ID].includes(item.modifier.id)
            );
            assert.equal(
                JSON.stringify(Array.from(relevantApplied, (item) => item.modifier.id)),
                JSON.stringify([MODIFIER_ID])
            );

            const expectedPercent = REFINEMENT_VALUES[refinement] * stack;
            assert.equal(relevantApplied[0].value, expectedPercent);

            const effectiveStats = sandbox.GenshinCalcEngine
                .buildEffectiveStats(calcContext, collected)
                .effectiveStats;
            assert.equal(effectiveStats.elementalMastery, 100000 * expectedPercent / 100);
        }
    }
});

test("壮大な詩篇の旧extraDamageレコードはsupersededのままで二重適用されない", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const legacy = modifier(calcData, SUPERSEDED_ID);
    const calcContext = context(5, 3);
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);

    assert.equal(legacy.auditDisposition, "supersededByStructuredRecord");
    assert.equal(collected.applied.filter((item) => item.modifier.id === SUPERSEDED_ID).length, 0);
    const legacyCandidate = collected.candidates.find((item) => item.modifier.id === SUPERSEDED_ID);
    assert.ok(legacyCandidate);
    assert.equal(legacyCandidate.reason, "同じ効果の構造化済みレコードへ統合済みです");
    assert.equal(collected.applied.filter((item) => item.modifier.id === MODIFIER_ID).length, 1);
});
