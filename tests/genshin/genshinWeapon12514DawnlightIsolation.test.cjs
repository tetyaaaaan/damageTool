"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "12514";
const IDS = {
    crit: "w_12514_crit_1",
    legacyDamage: "w_12514_damage_3",
    atk: "w_12514_stat_2"
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

function groupFor(calcData, ids) {
    return (calcData.weaponEffectRegistry.weapons[WEAPON_ID]?.groups || [])
        .find((group) => ids.every((id) => (group.modifierIds || []).includes(id)));
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

test("12514 raw contract keeps the six-second skill-or-burst values across R1-R5", () => {
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
            ["20%", "28%"],
            ["25%", "35%"],
            ["30%", "42%"],
            ["35%", "49%"],
            ["40%", "56%"]
        ]
    );
    assert.match(source.effectTextTemplate, /元素スキルまたは元素爆発を発動時/);
    assert.match(source.effectTextTemplate, /継続時間6秒/);
    assert.match(source.effectTextTemplate, /10秒毎に1回のみ発動可能/);

    const crit = modifier(calcData, IDS.crit);
    const atk = modifier(calcData, IDS.atk);
    assert.deepEqual(crit.applyTo, ["critDamage"]);
    assert.deepEqual(crit.valueByRefinement, { 1: 20, 2: 25, 3: 30, 4: 35, 5: 40 });
    assert.deepEqual(atk.applyTo, ["atkPercent"]);
    assert.deepEqual(atk.valueByRefinement, { 1: 28, 2: 35, 3: 42, 4: 49, 5: 56 });
});

test("12514 isolates crit and ATK to one skill-or-burst six-second toggle", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const crit = modifier(calcData, IDS.crit);
    const legacyDamage = modifier(calcData, IDS.legacyDamage);
    const atk = modifier(calcData, IDS.atk);
    const group = groupFor(calcData, [IDS.crit, IDS.atk]);

    // Red fixture: before the product correction, all three rows are exposed
    // as always-on records and the generic damage projection duplicates the
    // crit-damage claim. Extension/nightsoul timing remains out of scope.
    assert.equal(legacyDamage.auditDisposition, "supersededByStructuredRecord");
    for (const item of [crit, atk]) {
        assert.equal(item.condition, "afterSkillOrBurst");
        assert.equal(item.calculationSupport, "toggle");
        assert.equal(item.uidHandling, "conditional");
        assert.equal(item.duration, 6);
    }
    assert.ok(group, "12514 needs one shared skill-or-burst product group");
    assert.equal(group.targetOwner, "self");
    assert.equal(group.inputPolicy, "calculate");
    assert.equal(group.activation?.type, "toggle");
    assert.ok(group.activation?.stateKey, "12514 group needs a shared state key");
    assert.match(`${group.activation?.label || ""}${group.description || ""}`, /6秒/);

    const empty = appliedForWeapon(
        sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context())
    );
    assert.deepEqual(Array.from(empty), [], "skill-or-burst state is initially OFF");

    const activeContext = context();
    armToggle(sandbox, calcData, activeContext, group);
    const active = appliedForWeapon(
        sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, activeContext)
    );
    assert.equal(active.some((item) => item.modifier.id === IDS.legacyDamage), false);
    assert.equal(
        JSON.stringify(Array.from(active, (item) => [item.modifier.id, item.value])
            .sort((left, right) => left[0].localeCompare(right[0]))),
        JSON.stringify([[IDS.crit, 20], [IDS.atk, 28]]
            .sort((left, right) => left[0].localeCompare(right[0])))
    );
});

