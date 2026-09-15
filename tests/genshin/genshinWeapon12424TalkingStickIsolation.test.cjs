"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "12424";
const IDS = {
    legacyDuplicate: "w_12424_damageBonus_00cb7776",
    elementalDamage: "w_12424_damage_2",
    pyroAttack: "w_12424_stat_1"
};

const SOURCE_PATHS = [
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard02/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/English/weapons/talkingstick.json",
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard02/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/English/weapons/talkingstick.json"
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

test("話死合い棒の6.7/7.0 rawは2つの元素被付着トリガーと精錬値を明示する", () => {
    const sources = SOURCE_PATHS.map((path) => require(path));
    sources.forEach((source) => {
        assert.equal(source.id, 12424);
        assert.equal(source.name, "Talking Stick");
        assert.match(source.effectTemplateRaw, /ATK will be increased by/);
        assert.match(source.effectTemplateRaw, /after being affected by Pyro/);
        assert.match(source.effectTemplateRaw, /All Elemental DMG Bonus/);
        assert.match(source.effectTemplateRaw, /Hydro, Cryo, Electro, or Dendro/);
        assert.match(source.effectTemplateRaw, /for 15s/);
        assert.match(source.effectTemplateRaw, /once every 12s/);
        assert.deepEqual(source.r1.values, ["16%", "12%"]);
        assert.deepEqual(source.r5.values, ["32%", "24%"]);
    });
    assert.deepEqual(sources[0], sources[1], "6.7/7.0 provider raw must remain unchanged");
});

test("話死合い棒は元素被付着トリガーを常時適用せず、重複投影を抑止する", () => {
    const calcData = loadCalcData();
    const legacyDuplicate = record(IDS.legacyDuplicate, calcData);
    const elementalDamage = record(IDS.elementalDamage, calcData);
    const pyroAttack = record(IDS.pyroAttack, calcData);

    assert.equal(legacyDuplicate.auditDisposition, "supersededByStructuredRecord");

    assert.deepEqual(elementalDamage.applyTo, ["allElementDamageBonus"]);
    assert.equal(elementalDamage.condition, "afterAffectedByHydroCryoElectroDendro");
    assert.equal(elementalDamage.calculationSupport, "toggle");
    assert.equal(elementalDamage.uidHandling, "conditional");
    assert.equal(elementalDamage.duration, 15);
    assert.deepEqual(elementalDamage.valueByRefinement, {
        1: 12, 2: 15, 3: 18, 4: 21, 5: 24
    });

    assert.deepEqual(pyroAttack.applyTo, ["atkPercent"]);
    assert.equal(pyroAttack.condition, "afterAffectedByPyro");
    assert.equal(pyroAttack.calculationSupport, "toggle");
    assert.equal(pyroAttack.uidHandling, "conditional");
    assert.equal(pyroAttack.duration, 15);
    assert.deepEqual(pyroAttack.valueByRefinement, {
        1: 16, 2: 20, 3: 24, 4: 28, 5: 32
    });
});

test("話死合い棒の発動OFF/ONは一度だけ対象補正を反映し、元素対象を漏らさない", () => {
    const sandbox = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
    const calcData = loadCalcData();
    const elementalDamage = record(IDS.elementalDamage, calcData);
    const pyroAttack = record(IDS.pyroAttack, calcData);
    const pyroKey = sandbox.GenshinModifierAnalyzer.modifierStateKey(pyroAttack, `weapon:${WEAPON_ID}`);
    const elementalKey = sandbox.GenshinModifierAnalyzer.modifierStateKey(elementalDamage, `weapon:${WEAPON_ID}`);

    const offContext = context();
    const off = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, offContext);
    assert.equal(off.applied.some((item) => [IDS.elementalDamage, IDS.pyroAttack].includes(item.modifier.id)), false);

    const onContext = context();
    onContext.uiState.conditionByModifier[pyroKey] = { enabled: true, stack: 0, option: "" };
    onContext.uiState.conditionByModifier[elementalKey] = { enabled: true, stack: 0, option: "" };
    const on = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, onContext);
    const applied = on.applied.filter((item) => [IDS.elementalDamage, IDS.pyroAttack].includes(item.modifier.id));
    assert.equal(applied.filter((item) => item.modifier.id === IDS.pyroAttack).length, 1);
    assert.equal(applied.find((item) => item.modifier.id === IDS.pyroAttack)?.value, 16);
    assert.equal(applied.filter((item) => item.modifier.id === IDS.elementalDamage).length, 1);
    assert.equal(applied.find((item) => item.modifier.id === IDS.elementalDamage)?.value, 12);
    assert.deepEqual(applied.find((item) => item.modifier.id === IDS.elementalDamage)?.modifier.applyTo, ["allElementDamageBonus"]);
});
