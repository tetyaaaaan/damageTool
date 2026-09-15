"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "11432";
const IDS = {
    legacyCrit: "w_11432_critBonus_382b690c",
    crit: "w_11432_crit_1",
    damage: "w_11432_damageBonus_cafd35b3"
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

function groups(calcData) {
    return calcData.weaponEffectRegistry.weapons[WEAPON_ID]?.groups || [];
}

function shieldedGroup(calcData) {
    return groups(calcData).find((group) =>
        (group.modifierIds || []).includes(IDS.crit)
        && (group.modifierIds || []).includes(IDS.damage)
    );
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

test("11432 raw contract keeps shielded normal/charged values across R1-R5", () => {
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
            ["20%", "8%"],
            ["25%", "10%"],
            ["30%", "12%"],
            ["35%", "14%"],
            ["40%", "16%"]
        ]
    );
    assert.match(source.effectTextTemplate, /シールド状態/);
    assert.match(source.effectTextTemplate, /通常攻撃と重撃ダメージ/);
    assert.match(source.effectTextTemplate, /通常攻撃と重撃の会心率/);

    const crit = modifier(calcData, IDS.crit);
    const damage = modifier(calcData, IDS.damage);
    assert.deepEqual(crit.applyTo, ["normalAttackCritRate"]);
    assert.deepEqual(damage.applyTo, ["normalAttackDamageBonus", "chargedAttackDamageBonus"]);
    assert.deepEqual(crit.valueByRefinement, { 1: 8, 2: 10, 3: 12, 4: 14, 5: 16 });
    assert.deepEqual(damage.valueByRefinement, { 1: 20, 2: 25, 3: 30, 4: 35, 5: 40 });
});

test("11432 keeps the generated crit row superseded and shares one shielded toggle", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const legacy = modifier(calcData, IDS.legacyCrit);
    const crit = modifier(calcData, IDS.crit);
    const damage = modifier(calcData, IDS.damage);
    const group = shieldedGroup(calcData);

    // Red fixture: before the product correction there is no shared shielded
    // group and the damage row is projected as a stack instead of the source
    // shield state. The assertions fail closed until that correction exists.
    assert.equal(legacy.auditDisposition, "supersededByStructuredRecord");
    assert.equal(crit.condition, "shielded");
    assert.equal(crit.calculationSupport, "toggle");
    assert.equal(damage.condition, "shielded");
    assert.equal(damage.calculationSupport, "toggle");
    assert.equal(damage.uidHandling, "conditional");
    assert.ok(group, "11432 needs one shared shielded product group");
    assert.equal(group.targetOwner, "self");
    assert.equal(group.inputPolicy, "calculate");
    assert.equal(group.activation?.type, "toggle");
    assert.ok(group.activation?.stateKey, "11432 shielded group needs a state key");
    assert.match(`${group.activation?.label || ""}${group.description || ""}`, /シールド|shield/i);

    const empty = appliedForWeapon(
        sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context())
    );
    assert.equal(empty.some((item) => [IDS.legacyCrit, IDS.crit, IDS.damage].includes(item.modifier.id)), false);

    const activeContext = context();
    armToggle(sandbox, calcData, activeContext, group);
    const active = appliedForWeapon(
        sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, activeContext)
    );
    assert.equal(active.some((item) => item.modifier.id === IDS.legacyCrit), false);
    assert.equal(
        JSON.stringify(Array.from(active, (item) => [item.modifier.id, item.value])
            .sort((left, right) => left[0].localeCompare(right[0]))),
        JSON.stringify([[IDS.crit, 8], [IDS.damage, 20]]
            .sort((left, right) => left[0].localeCompare(right[0])))
    );
});

