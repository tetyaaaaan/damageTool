"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "13513";
const IDS = {
    damage: "w_13513_damageBonus_09aed831",
    legacyReaction: "w_13513_reaction_bonus_2",
    atk: "w_13513_stat_1"
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

function armStack(sandbox, calcData, calcContext, group, stack) {
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
        enabled: stack > 0,
        stack,
        option: ""
    };
    calcContext.uiState.stackByModifier[id] = stack;
    return id;
}

function appliedForWeapon(collected) {
    return collected.applied.filter((item) => item.source === `weapon:${WEAPON_ID}`);
}

test("13513 raw contract keeps ATK and the eight-second two-stack damage effect", () => {
    const calcData = loadCalcData();
    const source = require("../../games/genshin/data/weapon-effects.json")[WEAPON_ID];
    const records = require("../../games/genshin/data/v2/weapons/source-records.json");
    const effect = records[`weapon:${WEAPON_ID}:effect`];

    assert.equal(effect.provider, "damageTool-local");
    assert.equal(effect.gameVersion, null);
    assert.equal(effect.text, source.effectTextTemplate);
    assert.deepEqual(
        Object.values(effect.structuredValue.effectParamsByRefinement).map((item) => [
            item.param1,
            item.param2,
            item.param3
        ]),
        [
            ["15%", "18%", "12"],
            ["19%", "23%", "13"],
            ["23%", "28%", "14"],
            ["27%", "33%", "15"],
            ["31%", "38%", "16"]
        ]
    );
    assert.match(source.effectTextTemplate, /燃焼反応を起こした後/);
    assert.match(source.effectTextTemplate, /燃焼状態の敵に草元素ダメージを与えた後/);
    assert.match(source.effectTextTemplate, /継続時間は8秒/);
    assert.match(source.effectTextTemplate, /最大2層/);

    const damage = modifier(calcData, IDS.damage);
    const atk = modifier(calcData, IDS.atk);
    assert.equal(damage.category, "damageBonus");
    assert.deepEqual(damage.applyTo, ["allDamageBonus"]);
    assert.deepEqual(damage.valueByRefinement, { 1: 18, 2: 23, 3: 28, 4: 33, 5: 38 });
    assert.deepEqual(damage.valueByRefinementPerStack, { 1: 18, 2: 23, 3: 28, 4: 33, 5: 38 });
    assert.deepEqual(atk.applyTo, ["atkPercent"]);
    assert.deepEqual(atk.valueByRefinement, { 1: 15, 2: 19, 3: 23, 4: 27, 5: 31 });
});

test("13513 keeps the burning-related damage bonus as one explicit two-stack state", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const damage = modifier(calcData, IDS.damage);
    const legacyReaction = modifier(calcData, IDS.legacyReaction);
    const group = groupFor(calcData, IDS.damage);

    // Red fixture: before the product correction the damage row is always-on
    // and the same source claim is misclassified as a burning-only reaction
    // bonus. Energy recovery remains intentionally outside this fixture.
    assert.equal(legacyReaction.auditDisposition, "supersededByStructuredRecord");
    assert.equal(damage.condition, "afterReaction");
    assert.equal(damage.calculationSupport, "stack");
    assert.equal(damage.uidHandling, "conditional");
    assert.equal(damage.duration, 8);
    assert.deepEqual(damage.stack, { min: 0, default: 0, max: 2 });
    assert.ok(group, "13513 needs an explicit burning-related stack group");
    assert.equal(group.targetOwner, "self");
    assert.equal(group.inputPolicy, "calculate");
    assert.equal(group.activation?.type, "stack");
    assert.equal(group.activation?.min, 0);
    assert.equal(group.activation?.max, 2);
    assert.equal(group.activation?.default, 0);
    assert.ok(group.activation?.stateKey, "13513 group needs a shared stack state key");
    assert.match(`${group.activation?.label || ""}${group.description || ""}`, /8秒/);

    const empty = appliedForWeapon(
        sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context())
    );
    assert.deepEqual(Array.from(empty, (item) => [item.modifier.id, item.value]), [[IDS.atk, 15]]);

    const oneContext = context();
    armStack(sandbox, calcData, oneContext, group, 1);
    const one = appliedForWeapon(
        sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, oneContext)
    );
    assert.equal(one.some((item) => item.modifier.id === IDS.legacyReaction), false);
    assert.deepEqual(
        Array.from(one, (item) => [item.modifier.id, item.value]).sort((left, right) => left[0].localeCompare(right[0])),
        [[IDS.atk, 15], [IDS.damage, 18]].sort((left, right) => left[0].localeCompare(right[0]))
    );

    const twoContext = context();
    armStack(sandbox, calcData, twoContext, group, 2);
    const two = appliedForWeapon(
        sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, twoContext)
    );
    assert.deepEqual(
        Array.from(two, (item) => [item.modifier.id, item.value]).sort((left, right) => left[0].localeCompare(right[0])),
        [[IDS.atk, 15], [IDS.damage, 36]].sort((left, right) => left[0].localeCompare(right[0]))
    );
});

