"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "14431";
const IDS = {
    legacyDamage: "w_14431_damage_1",
    scaling: "w_14431_scaling_bonus_2",
    legacyStat: "w_14431_statBonus_9159f3ac"
};

const SOURCE_PATHS = [
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard03/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/English/weapons/ringofyaxche.json",
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard03/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/English/weapons/ringofyaxche.json"
];

function records(calcData = loadCalcData()) {
    return calcData.weaponModifiers[WEAPON_ID].modifiers;
}

function record(id, calcData) {
    return records(calcData).find((item) => item.id === id);
}

function groups(calcData) {
    return calcData.weaponEffectRegistry?.weapons?.[WEAPON_ID]?.groups || [];
}

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
            resolvedConditionByModifier: {},
            conditionByModifier: {},
            toggleByModifier: {},
            complexConditionByModifier: {}
        },
        mode: "manualMode",
        ...overrides
    };
}

function armToggle(sandbox, calcData, calcContext) {
    const group = groups(calcData).find((item) => item.modifierIds?.includes(IDS.scaling));
    assert.ok(group, "Ring of Yaxche needs an explicit after-skill activation group");
    const modifier = record(IDS.scaling, calcData);
    const normalized = sandbox.GenshinCalcEngine.normalizeWeaponModifier(
        modifier,
        records(calcData),
        calcData.weaponEffectRegistry.weapons[WEAPON_ID]
    );
    const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(
        normalized,
        `weapon:${WEAPON_ID}`
    );
    calcContext.uiState.conditionByModifier[key] = { enabled: true, stack: 0, option: "" };
    return key;
}

function applyNormalAttack(sandbox, calcData, calcContext) {
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
    const result = sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(
        {
            id: "ring-of-yaxche-normal",
            attackType: "normalAttack",
            damageType: "normalAttack",
            element: "physical",
            scalings: []
        },
        calcContext,
        collected
    );
    return {
        result,
        applied: result.applied.filter((item) => item.source === `weapon:${WEAPON_ID}`)
    };
}

test("Ring of Yaxcheの6.7/7.0 rawはHP1000ごとの通常攻撃補正とR1上限16%を保持する", () => {
    const sources = SOURCE_PATHS.map((path) => require(path));
    sources.forEach((source) => {
        assert.equal(source.id, 14431);
        assert.equal(source.name, "Ring of Yaxche");
        assert.match(source.effectTemplateRaw, /Using an Elemental Skill grants/);
        assert.match(source.effectTemplateRaw, /Every 1,000 Max HP/);
        assert.match(source.effectTemplateRaw, /for 10s/);
        assert.match(source.effectTemplateRaw, /maximum of/);
        assert.deepEqual(source.r1.values, ["0.6%", "16%"]);
        assert.deepEqual(source.r5.values, ["1%", "32%"]);
    });
    assert.deepEqual(sources[0], sources[1], "6.7/7.0 provider raw must remain unchanged");

    const localEffect = require("../../games/genshin/data/v2/weapons/source-records.json")["weapon:14431:effect"];
    assert.deepEqual(localEffect.structuredValue.effectParamsByRefinement["1"], {
        param1: "0.6%",
        param2: "16%"
    });
});

test("Ring of YaxcheはHP参照・1000単位・上限付きの通常攻撃補正へ統合し、旧常時行を隔離する", () => {
    const calcData = loadCalcData();
    const scaling = record(IDS.scaling, calcData);
    const legacyDamage = record(IDS.legacyDamage, calcData);
    const legacyStat = record(IDS.legacyStat, calcData);

    assert.equal(scaling.category, "scalingBonus");
    assert.deepEqual(scaling.applyTo, ["normalAttackDamageBonus"]);
    assert.deepEqual(scaling.reference, { stat: "hp", source: "self" });
    assert.equal(scaling.divisor, 1000);
    assert.deepEqual(scaling.ratioByRefinement, { 1: 0.6, 2: 0.7, 3: 0.8, 4: 0.9, 5: 1 });
    assert.deepEqual(scaling.maxValueByRefinement, { 1: 16, 2: 20, 3: 24, 4: 28, 5: 32 });
    assert.equal(scaling.duration, 10);
    assert.equal(scaling.condition, "afterSkill");
    assert.equal(scaling.uidHandling, "conditional");
    assert.equal(legacyDamage.auditDisposition, "supersededByStructuredRecord");
    assert.equal(legacyStat.auditDisposition, "supersededByStructuredRecord");
});

test("Ring of Yaxcheは発動OFF、上限未満、上限到達を実計算で分離する", () => {
    const sandbox = harness();
    const calcData = loadCalcData();

    const off = applyNormalAttack(sandbox, calcData, context());
    assert.equal(off.result.totals.damageBonus, 0);

    const belowCapContext = context();
    armToggle(sandbox, calcData, belowCapContext);
    const belowCap = applyNormalAttack(sandbox, calcData, belowCapContext);
    assert.equal(belowCap.result.totals.damageBonus, 12);
    assert.equal(belowCap.applied.filter((item) => item.modifier.id === IDS.scaling).length, 1);

    const capContext = context({ stats: { ...context().stats, hp: 30000 } });
    armToggle(sandbox, calcData, capContext);
    const capped = applyNormalAttack(sandbox, calcData, capContext);
    assert.equal(capped.result.totals.damageBonus, 16);
    assert.equal(capped.applied.filter((item) => item.modifier.id === IDS.scaling).length, 1);
});
