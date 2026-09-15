"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "11517";
const IDS = {
    skillAttack: "w_11517_stat_1",
    zeroEnergyAttack: "w_11517_damage_3",
    zeroEnergyCritDamage: "w_11517_crit_2"
};
const CONDITION_GROUP = "weapon11517AzurelightState";
const CONDITION_OPTIONS = new Set(["inactive", "active", "zeroEnergy"]);

const SOURCE_PATHS = [
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/English/weapons/azurelight.json",
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/English/weapons/azurelight.json"
];

function records(calcData = loadCalcData()) {
    return calcData.weaponModifiers[WEAPON_ID].modifiers;
}

function record(id, calcData) {
    return records(calcData).find((item) => item.id === id);
}

function context() {
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
            resolvedConditionByModifier: {},
            conditionByModifier: {},
            toggleByModifier: {},
            complexConditionByModifier: {}
        },
        mode: "manualMode"
    };
}

function setState(sandbox, calcData, calcContext, option, enabled = option !== "inactive") {
    const modifiers = [
        record(IDS.skillAttack, calcData),
        record(IDS.zeroEnergyAttack, calcData),
        record(IDS.zeroEnergyCritDamage, calcData)
    ];
    const grouped = modifiers.every((modifier) => modifier.conditionGroupId === CONDITION_GROUP);
    if (grouped) {
        const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(modifiers[0], `weapon:${WEAPON_ID}`);
        calcContext.uiState.conditionByModifier[key] = { enabled, stack: 0, option };
        return;
    }
    modifiers.forEach((modifier) => {
        const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(modifier, `weapon:${WEAPON_ID}`);
        calcContext.uiState.conditionByModifier[key] = { enabled, stack: 0, option };
    });
}

test("蒼耀の6.7/7.0 rawはスキル後12秒・0エネルギー時の追加ATKと会心ダメージを明示する", () => {
    const sources = SOURCE_PATHS.map((path) => require(path));
    sources.forEach((source) => {
        assert.equal(source.id, 11517);
        assert.equal(source.name, "Azurelight");
        assert.match(source.effectTemplateRaw, /Within 12s after an Elemental Skill is used/);
        assert.match(source.effectTemplateRaw, /0 Energy/);
        assert.match(source.effectTemplateRaw, /ATK will be further increased/);
        assert.match(source.effectTemplateRaw, /CRIT DMG will be increased/);
        assert.deepEqual(source.r1.values, ["24%", "24%", "40%"]);
        assert.deepEqual(source.r5.values, ["48%", "48%", "80%"]);
    });
    assert.deepEqual(sources[0], sources[1], "6.7/7.0 provider raw must remain unchanged");
});

test("蒼耀は常時全ダメージ/会心補正ではなく、スキル後と0エネルギー状態へ分離する", () => {
    const calcData = loadCalcData();
    const skillAttack = record(IDS.skillAttack, calcData);
    const zeroEnergyAttack = record(IDS.zeroEnergyAttack, calcData);
    const zeroEnergyCritDamage = record(IDS.zeroEnergyCritDamage, calcData);
    const values = { 1: 24, 2: 30, 3: 36, 4: 42, 5: 48 };

    assert.equal(skillAttack.category, "statBonus");
    assert.deepEqual(skillAttack.applyTo, ["atkPercent"]);
    assert.equal(skillAttack.condition, "afterSkill");
    assert.equal(skillAttack.calculationSupport, "toggle");
    assert.equal(skillAttack.duration, 12);
    assert.equal(skillAttack.conditionGroupId, CONDITION_GROUP);
    assert.equal(skillAttack.conditionInput?.type, "option");
    assert.deepEqual(new Set(skillAttack.conditionInput.options.map((option) => option.value)), CONDITION_OPTIONS);
    assert.deepEqual(skillAttack.valueByRefinement, values);

    assert.equal(zeroEnergyAttack.category, "statBonus");
    assert.deepEqual(zeroEnergyAttack.applyTo, ["atkPercent"]);
    assert.equal(zeroEnergyAttack.condition, "energyIsZeroAndNotDisabledByBurstHit");
    assert.equal(zeroEnergyAttack.calculationSupport, "toggle");
    assert.equal(zeroEnergyAttack.duration, 12);
    assert.equal(zeroEnergyAttack.conditionGroupId, CONDITION_GROUP);
    assert.equal(zeroEnergyAttack.conditionOptionValue, "zeroEnergy");
    assert.equal(zeroEnergyAttack.conditionInput?.type, "option");
    assert.deepEqual(zeroEnergyAttack.valueByRefinement, values);

    assert.equal(zeroEnergyCritDamage.category, "critBonus");
    assert.deepEqual(zeroEnergyCritDamage.applyTo, ["critDamage"]);
    assert.equal(zeroEnergyCritDamage.condition, "energyIsZeroAndNotDisabledByBurstHit");
    assert.equal(zeroEnergyCritDamage.calculationSupport, "toggle");
    assert.equal(zeroEnergyCritDamage.duration, 12);
    assert.equal(zeroEnergyCritDamage.conditionGroupId, CONDITION_GROUP);
    assert.equal(zeroEnergyCritDamage.conditionOptionValue, "zeroEnergy");
    assert.equal(zeroEnergyCritDamage.conditionInput?.type, "option");
    assert.deepEqual(zeroEnergyCritDamage.valueByRefinement, {
        1: 40, 2: 50, 3: 60, 4: 70, 5: 80
    });
});

test("蒼耀のOFF/スキル後/0エネルギー状態で対象補正を漏らさず適用する", () => {
    const sandbox = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
    const calcData = loadCalcData();

    const offContext = context();
    setState(sandbox, calcData, offContext, "inactive", false);
    const off = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, offContext);
    assert.equal(off.applied.some((item) => item.source === `weapon:${WEAPON_ID}`), false);

    const skillContext = context();
    setState(sandbox, calcData, skillContext, "active");
    const skillApplied = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, skillContext).applied
        .filter((item) => item.source === `weapon:${WEAPON_ID}`);
    assert.deepEqual(Array.from(skillApplied, (item) => [item.modifier.id, item.value]), [[IDS.skillAttack, 24]]);

    const zeroEnergyContext = context();
    setState(sandbox, calcData, zeroEnergyContext, "zeroEnergy");
    const zeroEnergyApplied = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, zeroEnergyContext).applied
        .filter((item) => item.source === `weapon:${WEAPON_ID}`);
    const appliedValues = Array.from(zeroEnergyApplied, (item) => [item.modifier.id, item.value])
        .sort(([left], [right]) => left.localeCompare(right));
    const expectedValues = [
        [IDS.skillAttack, 24],
        [IDS.zeroEnergyAttack, 24],
        [IDS.zeroEnergyCritDamage, 40]
    ].sort(([left], [right]) => left.localeCompare(right));
    assert.deepEqual(appliedValues, expectedValues);
    assert.equal(zeroEnergyApplied.some((item) => item.modifier.applyTo?.includes("allDamageBonus")), false);
});
