"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "14518";
const IDS = {
    afterReaction: "w_14518_statBonus_3c7c2d85",
    afterSkillHit: "w_14518_statBonus_a61ba947",
    afterBurstHit: "w_14518_statBonus_d9d3a378"
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

function modifier(calcData, id) {
    return calcData.weaponModifiers[WEAPON_ID].modifiers.find((item) => item.id === id);
}

function groups(calcData) {
    return calcData.weaponEffectRegistry.weapons[WEAPON_ID]?.groups || [];
}

function groupFor(calcData, id) {
    return groups(calcData).find((group) => (group.modifierIds || []).includes(id));
}

function armToggle(sandbox, calcData, calcContext, group, enabled = true) {
    const id = (group.modifierIds || []).find((candidateId) => modifier(calcData, candidateId));
    assert.ok(id, `group ${group.id} must reference a local modifier`);
    const raw = modifier(calcData, id);
    const normalized = sandbox.GenshinCalcEngine.normalizeWeaponModifier(
        raw,
        calcData.weaponModifiers[WEAPON_ID].modifiers,
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

function weaponApplied(collected) {
    return collected.applied
        .filter((item) => item.source === `weapon:${WEAPON_ID}`)
        .map((item) => ({ id: item.modifier.id, value: item.value }));
}

test("14518 stored effect record preserves the three trigger windows and R1-R5 values", () => {
    const calcData = loadCalcData();
    const source = require("../../games/genshin/data/weapon-effects.json")[WEAPON_ID];
    const sourceRecords = require("../../games/genshin/data/v2/weapons/source-records.json");
    const effectRecord = sourceRecords[`weapon:${WEAPON_ID}:effect`];

    assert.equal(effectRecord.provider, "damageTool-local");
    assert.equal(effectRecord.gameVersion, null);
    assert.equal(effectRecord.text, source.effectTextTemplate);
    assert.deepEqual(
        Object.values(effectRecord.structuredValue.effectParamsByRefinement)
            .map((item) => [item.param1, item.param2, item.param3]),
        [
            ["120", "96", "32"],
            ["150", "120", "40"],
            ["180", "144", "48"],
            ["210", "168", "56"],
            ["240", "192", "64"]
        ]
    );
    assert.match(source.effectTextTemplate, /拡散反応または星拡散反応を起こした後の6秒間/);
    assert.match(source.effectTextTemplate, /元素スキルが敵に命中した後の9秒間/);
    assert.match(source.effectTextTemplate, /元素爆発が敵に命中した後の30秒間/);

    const expected = {
        [IDS.afterReaction]: {
            condition: "afterReaction",
            values: { 1: 120, 2: 150, 3: 180, 4: 210, 5: 240 }
        },
        [IDS.afterSkillHit]: {
            condition: "afterSkillHit",
            values: { 1: 96, 2: 120, 3: 144, 4: 168, 5: 192 }
        },
        [IDS.afterBurstHit]: {
            condition: "afterBurstHit",
            values: { 1: 32, 2: 40, 3: 48, 4: 56, 5: 64 }
        }
    };
    Object.entries(expected).forEach(([id, contract]) => {
        const item = modifier(calcData, id);
        assert.equal(item.category, "statBonus");
        assert.deepEqual(item.applyTo, ["elementalMastery"]);
        assert.equal(item.unit, "flat");
        assert.equal(item.calculationSupport, "toggle");
        assert.equal(item.uidHandling, "conditional");
        assert.equal(item.condition, contract.condition);
        assert.deepEqual(item.valueByRefinement, contract.values);
    });
});

test("14518 7.0 raw expands only the first trigger from Swirl to Swirl or Stellar Swirl", () => {
    const before = require("../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard03/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/English/weapons/sunnymorningsleepin.json");
    const after = require("../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard03/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/English/weapons/sunnymorningsleepin.json");
    assert.match(before.effectTemplateRaw, /after triggering Swirl\./);
    assert.doesNotMatch(before.effectTemplateRaw, /Stellar Swirl/);
    assert.match(after.effectTemplateRaw, /after triggering Swirl or Stellar Swirl\./);
    assert.deepEqual(before.r1.values, after.r1.values);

    const calcData = loadCalcData();
    const group = groupFor(calcData, IDS.afterReaction);
    assert.match(group.description, /拡散反応または星拡散反応/);
    assert.match(group.activation.label, /拡散または星拡散/);
    assert.match(modifier(calcData, IDS.afterReaction).sourceText, /拡散反応または星拡散反応/);
});

test("14518 requires three independent current-state toggles and never cross-applies triggers", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const expected = [
        [IDS.afterReaction, 120, /6秒/],
        [IDS.afterSkillHit, 96, /9秒/],
        [IDS.afterBurstHit, 32, /30秒/]
    ];
    const triggerGroups = expected.map(([id, , duration]) => {
        const group = groupFor(calcData, id);
        assert.ok(group, `${id} must have an explicit product group`);
        assert.equal(group.targetOwner, "self");
        assert.equal(group.inputPolicy, "calculate");
        assert.equal(group.activation?.type, "toggle");
        assert.ok(group.activation?.stateKey, `${id} must have a distinct state key`);
        assert.match(group.activation?.label || group.description || "", duration);
        return group;
    });
    assert.equal(new Set(triggerGroups.map((group) => group.activation.stateKey)).size, 3);

    const empty = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context());
    assert.deepEqual(Array.from(weaponApplied(empty)), []);

    expected.forEach(([id, value], index) => {
        const single = context();
        armToggle(sandbox, calcData, single, triggerGroups[index]);
        assert.deepEqual(
            Array.from(weaponApplied(sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, single))),
            [{ id, value }]
        );
    });

    const all = context();
    triggerGroups.forEach((group) => armToggle(sandbox, calcData, all, group));
    assert.deepEqual(
        Array.from(weaponApplied(sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, all))),
        expected.map(([id, value]) => ({ id, value }))
    );
});
