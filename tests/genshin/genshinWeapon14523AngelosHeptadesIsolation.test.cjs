"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "14523";
const IDS = {
    legacyDamage: "w_14523_damage_2",
    scalingDamage: "w_14523_scaling_bonus_3",
    attack: "w_14523_stat_1"
};

const SOURCE_PATHS = [
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard04/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/English/weapons/angelosheptades.json",
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard04/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/English/weapons/angelosheptades.json"
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

function modifier(calcData, id) {
    return records(calcData).find((item) => item.id === id);
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
            elementDamageBonus: 0
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

function groupFor(calcData) {
    return (calcData.weaponEffectRegistry?.weapons?.[WEAPON_ID]?.groups || [])
        .find((group) => (group.modifierIds || []).includes(IDS.scalingDamage));
}

function armToggle(sandbox, calcData, calcContext, group, enabled = true) {
    assert.ok(group, "14523 needs a registry group before the shield trigger can be selected");
    const raw = modifier(calcData, (group.modifierIds || []).find((id) => modifier(calcData, id)));
    assert.ok(raw, `group ${group.id} must reference a local modifier`);
    const normalized = sandbox.GenshinCalcEngine.normalizeWeaponModifier(
        raw,
        records(calcData),
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

function damageEntry() {
    return {
        id: "fixture_normal_attack",
        label: "通常攻撃",
        group: "normalAttack",
        attackType: "normalAttack",
        damageType: "normalAttack",
        element: "炎",
        hitCount: 1
    };
}

test("塵と光の七つの誓約の6.7/7.0 rawはシールド後のATK基準補正と精錬値を明示する", () => {
    const sources = SOURCE_PATHS.map((path) => require(path));
    sources.forEach((source) => {
        assert.equal(source.id, 14523);
        assert.equal(source.name, "Angelos' Heptades");
        assert.match(source.effectTemplateRaw, /creates a Shield/);
        assert.match(source.effectTemplateRaw, /20s/);
        assert.match(source.effectTemplateRaw, /active party member's DMG/);
        assert.match(source.effectTemplateRaw, /for every 1,000 ATK/);
        assert.match(source.effectTemplateRaw, /up to a maximum/);
        assert.deepEqual(source.r1.values, ["12%", "10%", "26%", "14"]);
        assert.deepEqual(source.r5.values, ["24%", "22%", "58%", "18"]);
    });
    assert.deepEqual(sources[0], sources[1], "6.7/7.0 provider raw must remain unchanged");
});

test("塵と光の七つの誓約はATK基準補正をシールド後の共有状態へ分離し、旧常時行を重複適用しない", () => {
    const calcData = loadCalcData();
    const legacyDamage = modifier(calcData, IDS.legacyDamage);
    const scalingDamage = modifier(calcData, IDS.scalingDamage);
    const attack = modifier(calcData, IDS.attack);
    const group = groupFor(calcData);

    // Red fixture: before the product correction the dynamic row is always-on,
    // lacks a supported scaling formula, and has no explicit shield-trigger
    // group. The separate energy/Hexerei clauses remain outside this batch.
    assert.equal(legacyDamage.auditDisposition, "supersededByStructuredRecord");
    assert.equal(scalingDamage.condition, "afterShieldCreated");
    assert.equal(scalingDamage.category, "scalingBonus");
    assert.deepEqual(scalingDamage.applyTo, ["allDamageBonus"]);
    assert.equal(scalingDamage.calculationSupport, "custom");
    assert.equal(scalingDamage.customCalculation, "refinementScalingDamageBonus");
    assert.equal(scalingDamage.uidHandling, "conditional");
    assert.equal(scalingDamage.divisor, 1000);
    assert.deepEqual(scalingDamage.reference, { stat: "atk", source: "self" });
    assert.deepEqual(scalingDamage.ratioByRefinement, {
        1: 10, 2: 13, 3: 16, 4: 19, 5: 22
    });
    assert.deepEqual(scalingDamage.maxValueByRefinement, {
        1: 26, 2: 34, 3: 42, 4: 50, 5: 58
    });
    assert.equal(scalingDamage.duration, 20);
    assert.deepEqual(attack.valueByRefinement, { 1: 12, 2: 15, 3: 18, 4: 21, 5: 24 });
    assert.deepEqual(attack.applyTo, ["atkPercent"]);
    assert.equal(attack.condition, "always");

    assert.ok(group, "14523 needs one shared shield-trigger group");
    assert.equal(group.targetOwner, "activeCharacter");
    assert.equal(group.inputPolicy, "calculate");
    assert.equal(group.activation?.type, "toggle");
    assert.ok(group.activation?.stateKey, "14523 group needs a shield-trigger state key");
    assert.match(`${group.activation?.label || ""}${group.description || ""}`, /シールド|shield/i);
});

test("塵と光の七つの誓約はOFF/ATK基準の下限・上限を実計算へ一度だけ反映する", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const offContext = context();
    const off = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, offContext);
    assert.equal(off.applied.some((item) => item.modifier.id === IDS.legacyDamage), false);
    assert.equal(off.applied.some((item) => item.modifier.id === IDS.scalingDamage), false);

    const apply = (atk) => {
        const activeContext = context({ stats: { ...context().stats, atk } });
        armToggle(sandbox, calcData, activeContext, groupFor(calcData));
        const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, activeContext);
        const result = sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(
            damageEntry(),
            activeContext,
            collected
        );
        const scaling = result.applied.filter((item) => item.modifier.id === IDS.scalingDamage);
        assert.equal(scaling.length, 1);
        assert.equal(result.applied.some((item) => item.modifier.id === IDS.legacyDamage), false);
        return result;
    };

    assert.equal(apply(2000).totals.damageBonus, 20);
    assert.equal(apply(4000).totals.damageBonus, 26);
});
