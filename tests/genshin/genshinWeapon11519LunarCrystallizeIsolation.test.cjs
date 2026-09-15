"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "11519";
const IDS = {
    legacyGeneric: "w_11519_reactionBonus_903ea413",
    lunar: "w_11519_reaction_bonus_2",
    defense: "w_11519_stat_1"
};

function harness() {
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

function modifiers(calcData) {
    return calcData.weaponModifiers[WEAPON_ID].modifiers;
}

function modifier(calcData, id) {
    return modifiers(calcData).find((item) => item.id === id);
}

function groupFor(calcData, id) {
    return (calcData.weaponEffectRegistry.weapons[WEAPON_ID]?.groups || [])
        .find((group) => (group.modifierIds || []).includes(id));
}

function armToggle(sandbox, calcData, calcContext, group, enabled = true) {
    const id = (group.modifierIds || []).find((candidateId) => modifier(calcData, candidateId));
    assert.ok(id, `group ${group.id} must reference a local modifier`);
    const raw = modifier(calcData, id);
    const normalized = sandbox.GenshinCalcEngine.normalizeWeaponModifier(
        raw,
        modifiers(calcData),
        calcData.weaponEffectRegistry.weapons[WEAPON_ID]
    );
    const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(
        normalized,
        `weapon:${WEAPON_ID}`
    );
    calcContext.uiState.conditionByModifier[key] = {
        enabled,
        stack: 0,
        option: ""
    };
    return key;
}

function appliedForWeapon(collected) {
    return collected.applied.filter((item) => item.source === `weapon:${WEAPON_ID}`);
}

test("11519 raw contract keeps DEF and the five-second lunar crystallize bonus", () => {
    const calcData = loadCalcData();
    const source = require("../../games/genshin/data/weapon-effects.json")[WEAPON_ID];
    const records = require("../../games/genshin/data/v2/weapons/source-records.json");
    const effect = records[`weapon:${WEAPON_ID}:effect`];

    assert.equal(effect.provider, "damageTool-local");
    assert.equal(effect.gameVersion, null);
    assert.equal(effect.text, source.effectTextTemplate);
    assert.deepEqual(
        Object.values(effect.structuredValue.effectParamsByRefinement).map((item) => [item.param1, item.param2]),
        [
            ["20%", "64%"],
            ["25%", "80%"],
            ["30%", "96%"],
            ["35%", "112%"],
            ["40%", "128%"]
        ]
    );
    assert.match(source.effectTextTemplate, /元素スキルを発動した後の5秒間/);
    assert.match(source.effectTextTemplate, /月結晶反応によるダメージ/);

    const lunar = modifier(calcData, IDS.lunar);
    const defense = modifier(calcData, IDS.defense);
    assert.deepEqual(lunar.applyTo, ["lunarCrystallizeDamageBonus"]);
    assert.deepEqual(lunar.valueByRefinement, { 1: 64, 2: 80, 3: 96, 4: 112, 5: 128 });
    assert.deepEqual(defense.applyTo, ["defPercent"]);
    assert.deepEqual(defense.valueByRefinement, { 1: 20, 2: 25, 3: 30, 4: 35, 5: 40 });
});

test("11519 isolates the lunar crystallize bonus to one afterSkill five-second toggle", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const generic = modifier(calcData, IDS.legacyGeneric);
    const lunar = modifier(calcData, IDS.lunar);
    const defense = modifier(calcData, IDS.defense);
    const group = groupFor(calcData, IDS.lunar);

    // Red fixture: before the product correction the generic row can target
    // every reaction and the specific row is exposed as afterCrystallize,
    // not the source's afterSkill five-second state.
    assert.equal(generic.auditDisposition, "supersededByStructuredRecord");
    assert.equal(lunar.condition, "afterSkill");
    assert.equal(lunar.calculationSupport, "toggle");
    assert.equal(lunar.uidHandling, "conditional");
    assert.equal(lunar.duration, 5);
    assert.ok(group, "11519 needs an explicit afterSkill product group");
    assert.equal(group.targetOwner, "self");
    assert.equal(group.inputPolicy, "calculate");
    assert.equal(group.activation?.type, "toggle");
    assert.ok(group.activation?.stateKey, "11519 group needs an afterSkill state key");
    assert.match(`${group.activation?.label || ""}${group.description || ""}`, /5秒/);

    const empty = appliedForWeapon(
        sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context())
    );
    assert.deepEqual(
        Array.from(empty, (item) => [item.modifier.id, item.value]),
        [[IDS.defense, 20]]
    );

    const activeContext = context();
    armToggle(sandbox, calcData, activeContext, group);
    const active = appliedForWeapon(
        sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, activeContext)
    );
    assert.equal(active.some((item) => item.modifier.id === IDS.legacyGeneric), false);
    assert.equal(
        JSON.stringify(Array.from(active, (item) => [item.modifier.id, item.value])
            .sort((left, right) => left[0].localeCompare(right[0]))),
        JSON.stringify([[IDS.defense, 20], [IDS.lunar, 64]]
            .sort((left, right) => left[0].localeCompare(right[0])))
    );
});

