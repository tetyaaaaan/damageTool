"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "14511";
const IDS = {
    differentElementLegacy: "w_14511_damageBonus_c65afcef",
    differentElementCanonical: "w_14511_damage_2",
    sameElement: "w_14511_stat_1",
    nearbyPartyMembers: "w_14511_stat_3"
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
        characterElement: "氷",
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
        "athousandfloatingdreams.json"
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

function armStack(sandbox, calcData, calcContext, group, stack) {
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
        enabled: stack > 0,
        stack,
        option: ""
    };
    calcContext.uiState.stackByModifier[id] = stack;
    return id;
}

function weaponApplied(collected) {
    return collected.applied
        .filter((item) => item.source === `weapon:${WEAPON_ID}`)
        .map((item) => ({ id: item.modifier.id, value: item.value, applyTo: item.modifier.applyTo }));
}

test("A Thousand Floating Dreams raw records are stable and preserve all three refinement columns", () => {
    const beforeBytes = sourceBytes("1bab2cdba4d218fd5caa46b5f54e7884ee8359a2");
    const afterBytes = sourceBytes("8b15995fa220c88a4d0d7ffe1e21b041d0b32588");
    assert.deepEqual(beforeBytes, afterBytes);
    const before = sourceRecord("1bab2cdba4d218fd5caa46b5f54e7884ee8359a2");
    const after = sourceRecord("8b15995fa220c88a4d0d7ffe1e21b041d0b32588");
    assert.deepEqual(before, after);
    assert.equal(after.id, 14511);
    assert.match(after.effectTemplateRaw, /Party members other than the equipping character/);
    assert.match(after.effectTemplateRaw, /same as the latter/);
    assert.match(after.effectTemplateRaw, /not, increase the equipping character's DMG Bonus/);
    assert.match(after.effectTemplateRaw, /all nearby party members other than the equipping character/);
    assert.deepEqual(
        ["r1", "r2", "r3", "r4", "r5"].map((rank) => after[rank].values),
        [
            ["32", "10%", "40"],
            ["40", "14%", "42"],
            ["48", "18%", "44"],
            ["56", "22%", "46"],
            ["64", "26%", "48"]
        ]
    );

    const calcData = loadCalcData();
    assert.deepEqual(modifier(calcData, IDS.sameElement).valueByRefinement, {
        1: 32, 2: 40, 3: 48, 4: 56, 5: 64
    });
    assert.deepEqual(modifier(calcData, IDS.differentElementLegacy).valueByRefinement, {
        1: 10, 2: 14, 3: 18, 4: 22, 5: 26
    });
    assert.deepEqual(modifier(calcData, IDS.nearbyPartyMembers).valueByRefinement, {
        1: 40, 2: 42, 3: 44, 4: 46, 5: 48
    });
});

test("A Thousand Floating Dreams separates same-element, different-element, and team-only effects", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const same = groupFor(calcData, [IDS.sameElement]);
    const different = groupFor(calcData, [IDS.differentElementLegacy, IDS.differentElementCanonical]);
    const team = groupFor(calcData, [IDS.nearbyPartyMembers]);

    // This is the focused reproduction: before the product correction there is
    // no registry entry for 14511 and these assertions fail closed here.
    assert.ok(same, "same-element branch must have an explicit product group");
    assert.ok(different, "different-element branch must have an explicit product group");
    assert.ok(team, "nearby-party branch must have an explicit product group");

    for (const group of [same, different]) {
        assert.equal(group.targetOwner, "self");
        assert.equal(group.inputPolicy, "calculate");
        assert.equal(group.activation?.type, "stack");
        assert.equal(group.activation?.min, 0);
        assert.equal(group.activation?.max, 3);
        assert.equal(group.activation?.default, 0);
    }
    assert.equal(team.targetOwner, "otherPartyMembers");
    assert.equal(team.inputPolicy, "displayOnly");
    assert.equal(team.activation?.type, "displayOnly");

    const differentId = (different.modifierIds || []).find((id) => modifier(calcData, id));
    const differentModifier = modifier(calcData, differentId);
    const differentNormalized = sandbox.GenshinCalcEngine.normalizeWeaponModifier(
        differentModifier,
        calcData.weaponModifiers[WEAPON_ID].modifiers,
        calcData.weaponEffectRegistry.weapons[WEAPON_ID]
    );
    assert.ok(differentNormalized.applyTo.includes("ownElementDamageBonus"));
    assert.equal(differentNormalized.applyTo.includes("allElementDamageBonus"), false);

    const empty = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context());
    assert.deepEqual(Array.from(weaponApplied(empty)), [], "no party composition/state means no self buff");

    const sameContext = context();
    armStack(sandbox, calcData, sameContext, same, 1);
    assert.deepEqual(
        Array.from(weaponApplied(sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, sameContext)), ({ value }) => value),
        [32]
    );

    const differentContext = context();
    armStack(sandbox, calcData, differentContext, different, 1);
    const differentApplied = weaponApplied(
        sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, differentContext)
    );
    assert.deepEqual(Array.from(differentApplied, ({ value }) => value), [10]);
    assert.ok(differentApplied[0].applyTo.includes("ownElementDamageBonus"));

    const bothContext = context();
    armStack(sandbox, calcData, bothContext, same, 1);
    armStack(sandbox, calcData, bothContext, different, 1);
    assert.deepEqual(
        Array.from(
            weaponApplied(sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, bothContext)),
            ({ value }) => value
        ).sort((left, right) => left - right),
        [10, 32]
    );
});
