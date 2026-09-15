"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "11424";
const IDS = {
    skillCrit: "w_11424_critBonus_e567e99f",
    burstCrit: "w_11424_critBonus_0da1d9be",
    skillBurstDamage: "w_11424_damage_1"
};

const SOURCE_PATHS = [
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/English/weapons/wolffang.json",
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/English/weapons/wolffang.json"
];

function harness() {
    return createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
}

function records(calcData = loadCalcData()) {
    return calcData.weaponModifiers[WEAPON_ID].modifiers;
}

function record(calcData, id) {
    return records(calcData).find((modifier) => modifier.id === id);
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
            elementDamageBonus: 0,
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
        mode: "manualMode",
        ...overrides
    };
}

function groupFor(calcData, id) {
    return calcData.weaponEffectRegistry?.weapons?.[WEAPON_ID]?.groups
        ?.find((group) => group.modifierIds?.includes(id));
}

function armStack(sandbox, calcData, calcContext, id, stack) {
    const modifier = record(calcData, id);
    const normalized = sandbox.GenshinCalcEngine.normalizeWeaponModifier(
        modifier,
        records(calcData),
        calcData.weaponEffectRegistry?.weapons?.[WEAPON_ID] || {}
    );
    const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(normalized, `weapon:${WEAPON_ID}`);
    calcContext.uiState.stackByModifier[id] = stack;
    calcContext.uiState.conditionByModifier[key] = {
        enabled: stack > 0,
        stack,
        option: ""
    };
    return key;
}

function applyToEntry(sandbox, calcData, calcContext, attackType) {
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
    const result = sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(
        {
            id: `wolf-fang-${attackType}`,
            attackType,
            damageType: attackType,
            element: "氷",
            group: attackType
        },
        calcContext,
        collected
    );
    return { collected, result };
}

test("狼牙の6.7/7.0 rawはスキル/爆発補正と各4層会心率補正を明示する", () => {
    const sources = SOURCE_PATHS.map((path) => require(path));
    sources.forEach((source) => {
        assert.equal(source.id, 11424);
        assert.equal(source.name, "Wolf-Fang");
        assert.match(source.effectTemplateRaw, /Elemental Skill and Elemental Burst/);
        assert.match(source.effectTemplateRaw, /4 max stacks/);
        assert.match(source.effectTemplateRaw, /last 10s separately/);
        assert.deepEqual(source.r1.values, ["16%", "2%", "2%"]);
        assert.deepEqual(source.r5.values, ["32%", "4%", "4%"]);
    });
    assert.deepEqual(sources[0], sources[1], "6.7/7.0 provider raw must remain unchanged");
});

test("狼牙はスキル/爆発の会心層を分離し、常時ダメージ補正へ層を混入させない", () => {
    const calcData = loadCalcData();
    const skillCrit = record(calcData, IDS.skillCrit);
    const burstCrit = record(calcData, IDS.burstCrit);
    const damage = record(calcData, IDS.skillBurstDamage);
    const groups = calcData.weaponEffectRegistry?.weapons?.[WEAPON_ID]?.groups || [];

    assert.deepEqual(damage.applyTo, ["skillDamageBonus", "burstDamageBonus"]);
    assert.equal(damage.condition, "always");
    assert.equal(damage.calculationSupport, "simple");
    assert.deepEqual(damage.valueByRefinement, { 1: 16, 2: 20, 3: 24, 4: 28, 5: 32 });
    assert.equal(Object.prototype.hasOwnProperty.call(damage, "stack"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(damage, "valueByRefinementPerStack"), false);

    [
        [skillCrit, "afterSkillHit", "skillCritRate"],
        [burstCrit, "afterBurstHit", "burstCritRate"]
    ].forEach(([modifier, condition, target]) => {
        assert.equal(modifier.category, "critBonus");
        assert.deepEqual(modifier.applyTo, [target]);
        assert.equal(modifier.condition, condition);
        assert.deepEqual(modifier.stack, { min: 0, default: 0, max: 4 });
        assert.equal(modifier.duration, 10);
        assert.deepEqual(modifier.valueByRefinementPerStack, {
            1: 2, 2: 2.5, 3: 3, 4: 3.5, 5: 4
        });
        const group = groupFor(calcData, modifier.id);
        assert.ok(group, `${modifier.id} needs a dedicated stack activation group`);
        assert.equal(group.activation?.type, "stack");
        assert.equal(group.activation?.min, 0);
        assert.equal(group.activation?.max, 4);
    });
    assert.equal(groups.filter((group) => group.modifierIds?.includes(IDS.skillCrit)).length, 1);
    assert.equal(groups.filter((group) => group.modifierIds?.includes(IDS.burstCrit)).length, 1);
});

test("狼牙の実計算は未発動時に会心補正を適用せず、各層を一度だけスキル/爆発へ渡す", () => {
    const sandbox = harness();
    const calcData = loadCalcData();

    const off = applyToEntry(sandbox, calcData, context(), "skill");
    assert.equal(off.result.totals.damageBonus, 16);
    assert.equal(off.result.totals.critRateBonus, 0);

    const skill = context();
    armStack(sandbox, calcData, skill, IDS.skillCrit, 2);
    const skillResult = applyToEntry(sandbox, calcData, skill, "skill");
    assert.equal(skillResult.result.totals.damageBonus, 16);
    assert.equal(skillResult.result.totals.critRateBonus, 4);
    assert.equal(skillResult.result.applied.filter((item) => item.modifier.id === IDS.skillCrit).length, 1);
    assert.equal(skillResult.result.applied.some((item) => item.modifier.id === IDS.burstCrit), false);

    const burst = context();
    armStack(sandbox, calcData, burst, IDS.burstCrit, 3);
    const burstResult = applyToEntry(sandbox, calcData, burst, "burst");
    assert.equal(burstResult.result.totals.damageBonus, 16);
    assert.equal(burstResult.result.totals.critRateBonus, 6);
    assert.equal(burstResult.result.applied.filter((item) => item.modifier.id === IDS.burstCrit).length, 1);
    assert.equal(burstResult.result.applied.some((item) => item.modifier.id === IDS.skillCrit), false);
});
