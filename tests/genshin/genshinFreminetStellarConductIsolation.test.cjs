"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const CHARACTER_ID = "10000085";
const IDS = {
    c4Stat: "c_10000085_4_1",
    c4Duplicate: "c_10000085_4_2",
    c6Crit: "c_10000085_6_1",
    c6Duplicate: "c_10000085_6_3"
};

const BEFORE_PATH = "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-behavior-shard09/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/English/constellations/freminet.json";
const AFTER_PATH = "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-behavior-shard09/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/English/constellations/freminet.json";

function baseContext() {
    return {
        characterId: CHARACTER_ID,
        weaponId: "",
        refinement: 1,
        artifactSetMode: "",
        artifactSetIds: [],
        constellation: 6,
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
            stackByModifier: {
                [IDS.c4Stat]: 2,
                [IDS.c4Duplicate]: 2,
                [IDS.c6Crit]: 3,
                [IDS.c6Duplicate]: 3
            },
            conditionByModifier: {},
            toggleByModifier: {},
            complexConditionByModifier: {},
            constellationConditions: { C4: true, C6: true }
        },
        mode: "manualMode"
    };
}

function harness() {
    return createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
}

function prepareContext(sandbox, calcData) {
    const context = baseContext();
    sandbox.GenshinCalcConditions.reconcileConditionState(context, calcData);
    sandbox.GenshinCalcConditions.reconcileComplexConditionState(context, calcData);
    return context;
}

function modifiers(calcData) {
    return calcData.constellationModifiers[CHARACTER_ID].constellations;
}

test("Freminet C4/C6 6.7 and 7.0 raw contracts are identical and explicit", () => {
    const before = require(BEFORE_PATH);
    const after = require(AFTER_PATH);
    assert.equal(before.id, 8501);
    assert.equal(after.id, 8501);
    assert.deepEqual(before.c4, after.c4);
    assert.deepEqual(before.c6, after.c6);
    assert.match(before.c4.description, /Frozen, Shatter, Superconduct, or Stellar-Conduct/);
    assert.match(before.c6.description, /Frozen, Shatter, Superconduct, or Stellar-Conduct/);
    assert.match(before.c4.description, /9% for 6s\. Max 2 stacks/);
    assert.match(before.c6.description, /12% for 6s\. Max 3 stacks/);

    const data = loadCalcData();
    const groups = modifiers(data);
    assert.deepEqual(groups["4"].map((modifier) => modifier.id), [IDS.c4Stat, IDS.c4Duplicate]);
    assert.deepEqual(groups["6"].map((modifier) => modifier.id), [IDS.c6Crit, IDS.c6Duplicate]);
    assert.deepEqual(groups["4"][0].applyTo, ["atkPercent"]);
    assert.equal(groups["4"][0].value, 9);
    assert.deepEqual(groups["4"][0].stack, { min: 0, default: 0, max: 2 });
    assert.deepEqual(groups["6"][0].applyTo, ["critDamage"]);
    assert.equal(groups["6"][0].value, 12);
    assert.deepEqual(groups["6"][0].stack, { min: 0, default: 0, max: 3 });
    assert.deepEqual(groups["4"][1].applyTo, ["superconductDamageBonus"]);
    assert.equal(groups["4"][1].value, 9);
    assert.deepEqual(groups["6"][1].applyTo, ["superconductDamageBonus"]);
    assert.equal(groups["6"][1].value, 2);
});

test("Freminet C4/C6 must use reaction-triggered stack buffs and suppress the duplicate reaction projections", () => {
    const calcData = loadCalcData();
    const expectedMain = [
        { id: IDS.c4Stat, category: "statBonus", applyTo: ["atkPercent"], value: 18 },
        { id: IDS.c6Crit, category: "critBonus", applyTo: ["critDamage"], value: 36 }
    ];
    const sandbox = harness();
    const prepared = prepareContext(sandbox, calcData);
    const stackInputs = sandbox.GenshinCalcConditions
        .buildComplexConditionDefinitions(prepared, calcData)
        .filter((definition) => [IDS.c4Stat, IDS.c6Crit].includes(definition.modifierId));
    assert.deepEqual(
        JSON.parse(JSON.stringify(stackInputs.map((definition) => ({
            modifierId: definition.modifierId,
            type: definition.type,
            min: definition.min,
            max: definition.max
        })))),
        [
            { modifierId: IDS.c4Stat, type: "stack", min: 0, max: 2 },
            { modifierId: IDS.c6Crit, type: "stack", min: 0, max: 3 }
        ],
        "the existing condition UI must expose bounded stack inputs for both constellation effects"
    );
    const applied = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, prepared).applied;

    assert.deepEqual(
        JSON.parse(JSON.stringify(applied.map((item) => ({
            id: item.modifier.id,
            category: item.modifier.category,
            applyTo: item.modifier.applyTo,
            value: item.value
        })))),
        expectedMain,
        "C4/C6 currently expose the duplicate superconduct rows and do not multiply the stack input; this fixture should pass after the narrow data correction"
    );

    const groups = modifiers(calcData);
    [groups["4"][0], groups["6"][0]].forEach((modifier) => {
        assert.equal(modifier.condition, "afterReaction");
        assert.equal(modifier.calculationSupport, "stack");
        assert.equal(modifier.duration, 6);
    });
    assert.equal(groups["4"][1].auditDisposition, "supersededByStructuredRecord");
    assert.equal(groups["6"][1].auditDisposition, "supersededByStructuredRecord");

    prepared.uiState.complexConditionByModifier = Object.fromEntries(
        stackInputs.map((definition) => [definition.key, { stack: 0 }])
    );
    sandbox.GenshinCalcConditions.reconcileComplexConditionState(prepared, calcData);
    const inactive = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, prepared).applied;
    assert.deepEqual(JSON.parse(JSON.stringify(inactive)), [], "switching both existing UI stack inputs to zero must remove the buffs");
});
