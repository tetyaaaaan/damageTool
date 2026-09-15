"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "14519";
const IDS = {
    dawnCrit: "w_14519_crit_2",
    dawnDamage: "w_14519_damage_3",
    twilightCrit: "w_14519_crit_4",
    twilightDamage: "w_14519_damage_5",
    atk: "w_14519_stat_1"
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

function sourceRoot() {
    return path.resolve(
        __dirname,
        "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard03"
    );
}

function sourceBytes(revision) {
    return fs.readFileSync(path.join(
        sourceRoot(),
        revision,
        "English",
        "weapons",
        "vividnotions.json"
    ));
}

function sourceRecord(revision) {
    return JSON.parse(sourceBytes(revision).toString("utf8"));
}

function modifier(calcData, id) {
    return calcData.weaponModifiers[WEAPON_ID].modifiers.find((item) => item.id === id);
}

function weaponGroups(calcData) {
    return calcData.weaponEffectRegistry.weapons[WEAPON_ID]?.groups || [];
}

function groupFor(calcData, ids) {
    return weaponGroups(calcData).find((group) =>
        (group.modifierIds || []).some((id) => ids.includes(id))
    );
}

function armToggle(sandbox, calcData, calcContext, group, enabled = true) {
    const rawModifiers = calcData.weaponModifiers[WEAPON_ID].modifiers;
    const id = (group.modifierIds || []).find((candidateId) =>
        rawModifiers.some((item) => item.id === candidateId)
    );
    assert.ok(id, `group ${group.id} must reference a local modifier`);
    const raw = modifier(calcData, id);
    const normalized = sandbox.GenshinCalcEngine.normalizeWeaponModifier(
        raw,
        rawModifiers,
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
        .map((item) => ({ id: item.modifier.id, value: item.value, applyTo: item.modifier.applyTo }));
}

test("Vivid Notions raw records are stable and preserve all three refinement columns", () => {
    const beforeBytes = sourceBytes("1bab2cdba4d218fd5caa46b5f54e7884ee8359a2");
    const afterBytes = sourceBytes("8b15995fa220c88a4d0d7ffe1e21b041d0b32588");
    assert.deepEqual(beforeBytes, afterBytes);
    const before = sourceRecord("1bab2cdba4d218fd5caa46b5f54e7884ee8359a2");
    const after = sourceRecord("8b15995fa220c88a4d0d7ffe1e21b041d0b32588");
    assert.deepEqual(before, after);
    assert.equal(after.id, 14519);
    assert.match(after.effectTemplateRaw, /ATK is increased by/);
    assert.match(after.effectTemplateRaw, /When you use a Plunging Attack/);
    assert.match(after.effectTemplateRaw, /When you use an Elemental Skill or Burst/);
    assert.match(after.effectTemplateRaw, /Plunging Attack CRIT DMG/);
    assert.match(after.effectTemplateRaw, /each last for 15s/);
    assert.match(after.effectTemplateRaw, /canceled 0\.1s after the ground impact/);
    assert.deepEqual(
        ["r1", "r2", "r3", "r4", "r5"].map((rank) => after[rank].values),
        [
            ["28%", "28%", "40%"],
            ["35%", "35%", "50%"],
            ["42%", "42%", "60%"],
            ["49%", "49%", "70%"],
            ["56%", "56%", "80%"]
        ]
    );

    const calcData = loadCalcData();
    assert.deepEqual(modifier(calcData, IDS.dawnCrit).valueByRefinement, {
        1: 28, 2: 35, 3: 42, 4: 49, 5: 56
    });
    assert.deepEqual(modifier(calcData, IDS.twilightCrit).valueByRefinement, {
        1: 40, 2: 50, 3: 60, 4: 70, 5: 80
    });
    assert.deepEqual(modifier(calcData, IDS.atk).valueByRefinement, {
        1: 28, 2: 35, 3: 42, 4: 49, 5: 56
    });
});

test("Vivid Notions isolates Dawn's First Hue and Twilight's Splendor to plunging attacks", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const dawn = groupFor(calcData, [IDS.dawnCrit, IDS.dawnDamage]);
    const twilight = groupFor(calcData, [IDS.twilightCrit, IDS.twilightDamage]);

    // Red fixture: the current product has no 14519 registry groups, so the
    // two trigger-scoped effects fall back to the legacy always/afterSkill
    // projection and this assertion fails closed until the product correction.
    assert.ok(dawn, "Dawn's First Hue must have an explicit product group");
    assert.ok(twilight, "Twilight's Splendor must have an explicit product group");

    for (const group of [dawn, twilight]) {
        assert.equal(group.targetOwner, "self");
        assert.equal(group.inputPolicy, "calculate");
        assert.equal(group.activation?.type, "toggle");
    }

    const expectedPlungingCrit = ["plungingAttackCritDamage"];
    const expectedPlungingDamage = ["plungingAttackDamageBonus"];
    for (const id of [IDS.dawnCrit, IDS.twilightCrit]) {
        const normalized = sandbox.GenshinCalcEngine.normalizeWeaponModifier(
            modifier(calcData, id),
            calcData.weaponModifiers[WEAPON_ID].modifiers,
            calcData.weaponEffectRegistry.weapons[WEAPON_ID]
        );
        assert.deepEqual(normalized.applyTo, expectedPlungingCrit, `${id} must stay plunging-crit-only`);
    }
    const twilightDamage = sandbox.GenshinCalcEngine.normalizeWeaponModifier(
        modifier(calcData, IDS.twilightDamage),
        calcData.weaponModifiers[WEAPON_ID].modifiers,
        calcData.weaponEffectRegistry.weapons[WEAPON_ID]
    );
    assert.deepEqual(twilightDamage.applyTo, expectedPlungingDamage,
        "Twilight's Splendor must not add skill/burst damage");

    const empty = weaponApplied(sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context()))
        .filter((item) => [IDS.dawnCrit, IDS.dawnDamage, IDS.twilightCrit, IDS.twilightDamage].includes(item.id));
    assert.deepEqual(Array.from(empty), [], "triggered plunging effects must be fail-closed before their trigger");

    const dawnContext = context();
    armToggle(sandbox, calcData, dawnContext, dawn);
    const dawnApplied = weaponApplied(sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, dawnContext))
        .filter((item) => [IDS.dawnCrit, IDS.dawnDamage, IDS.twilightCrit, IDS.twilightDamage].includes(item.id));
    assert.deepEqual(
        Array.from(dawnApplied, ({ id, value }) => ({ id, value })),
        [
            { id: IDS.dawnCrit, value: 28 }
        ]
    );

    const twilightContext = context();
    armToggle(sandbox, calcData, twilightContext, twilight);
    const twilightApplied = weaponApplied(sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, twilightContext))
        .filter((item) => [IDS.dawnCrit, IDS.dawnDamage, IDS.twilightCrit, IDS.twilightDamage].includes(item.id));
    assert.deepEqual(
        Array.from(twilightApplied, ({ id, value, applyTo }) => ({ id, value, applyTo: Array.from(applyTo) })),
        [
            { id: IDS.twilightCrit, value: 40, applyTo: expectedPlungingCrit }
        ]
    );

    const bothContext = context();
    armToggle(sandbox, calcData, bothContext, dawn);
    armToggle(sandbox, calcData, bothContext, twilight);
    const bothValues = Array.from(
        weaponApplied(sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, bothContext))
            .filter((item) => [IDS.dawnCrit, IDS.dawnDamage, IDS.twilightCrit, IDS.twilightDamage].includes(item.id)),
        ({ value }) => value
    ).sort((left, right) => left - right);
    assert.deepEqual(bothValues, [28, 40]);
});
