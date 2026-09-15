"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "15410";
const MODIFIER_ID = "w_15410_damage_1";

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
            baseHp: 10000,
            atk: 2000,
            baseAtk: 1000,
            def: 1000,
            baseDef: 500,
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

function modifierFrom(calcData) {
    return calcData.weaponModifiers[WEAPON_ID].modifiers.find((item) => item.id === MODIFIER_ID);
}

function conditionStateKey(sandbox, modifier) {
    return sandbox.GenshinModifierAnalyzer.modifierStateKey(modifier, `weapon:${WEAPON_ID}`);
}

function collectAt(sandbox, calcData, refinement, stage) {
    const calcContext = context({ refinement });
    const modifier = modifierFrom(calcData);
    sandbox.GenshinCalcConditions.conditionPanelState(calcContext, calcData);
    const key = conditionStateKey(sandbox, modifier);
    calcContext.uiState.conditionByModifier[key] = {
        enabled: stage > 0,
        stack: stage,
        option: ""
    };
    calcContext.uiState.stackByModifier[MODIFIER_ID] = stage;
    return sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
}

test("w_15410 uses refinement-scaled bounded stage data without claiming external verification", () => {
    const calcData = loadCalcData();
    const modifier = modifierFrom(calcData);
    const packageData = require("../../games/genshin/data/v2/weapons/packages/15410.json");

    assert.equal(modifier.category, "damageBonus");
    assert.deepEqual(modifier.applyTo, ["allDamageBonus"]);
    assert.equal(modifier.condition, "oppidanAmbushDamageStage");
    assert.equal(modifier.calculationSupport, "stack");
    assert.deepEqual(modifier.valueByRefinementPerStack, {
        1: 2,
        2: 2.5,
        3: 3,
        4: 3.5,
        5: 4
    });
    assert.deepEqual(modifier.stack, { min: 0, max: 10, default: 0 });
    assert.deepEqual(
        {
            type: modifier.conditionInput.type,
            min: modifier.conditionInput.min,
            max: modifier.conditionInput.max,
            unit: modifier.conditionInput.unit
        },
        { type: "stack", min: 0, max: 10, unit: "段階" }
    );

    assert.equal(packageData.verification.status, "needsReview");
    assert.equal(packageData.verification.sourceAgreement, "singleSource");
    assert.equal(packageData.runtime.status, "candidate");
    assert.equal(modifier.verification, undefined);
});

test("w_15410 defaults to inactive and exposes a 0-10 current-stage input", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const calcContext = context();
    const panel = sandbox.GenshinCalcConditions.conditionPanelState(calcContext, calcData);
    const effect = panel.cards
        .find((card) => card.id === "weapon")
        .effects.find((item) => item.id === MODIFIER_ID);
    const control = effect.controls.find((item) => item.modifierId === MODIFIER_ID);

    assert.equal(effect.status, "userInput");
    assert.equal(control.type, "stack");
    assert.equal(control.min, 0);
    assert.equal(control.max, 10);
    assert.match(control.label, /0～10/);
    assert.equal(control.value, 0);

    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
    assert.equal(collected.applied.some((item) => item.modifier.id === MODIFIER_ID), false);
});

test("w_15410 applies refinement-scaled stage values and clamps explicit input at 10", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();

    for (const [refinement, expected] of Object.entries({ 1: 2, 2: 2.5, 3: 3, 4: 3.5, 5: 4 })) {
        const collected = collectAt(sandbox, calcData, Number(refinement), 1);
        const applied = collected.applied.find((item) => item.modifier.id === MODIFIER_ID);
        assert.equal(applied.value, expected, `R${refinement}`);
    }

    assert.equal(
        collectAt(sandbox, calcData, 1, 5).applied.find((item) => item.modifier.id === MODIFIER_ID).value,
        10
    );
    assert.equal(
        collectAt(sandbox, calcData, 1, 99).applied.find((item) => item.modifier.id === MODIFIER_ID).value,
        20
    );
});
