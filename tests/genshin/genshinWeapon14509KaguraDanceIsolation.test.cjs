"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "14509";
const IDS = {
    skill: "w_14509_damage_2",
    maxStack: "w_14509_damage_3",
    reaction: "w_14509_reaction_bonus_1",
    legacyReaction: "w_14509_reactionBonus_5227efb6"
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

test("Kagura Dance raw records are stable across the pinned 6.7 and 7.0 revisions", () => {
    const root = path.resolve(__dirname, "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard03");
    const rev67 = "1bab2cdba4d218fd5caa46b5f54e7884ee8359a2";
    const rev70 = "8b15995fa220c88a4d0d7ffe1e21b041d0b32588";
    const relative = ["English", "weapons", "kagurasverity.json"];
    const raw67 = fs.readFileSync(path.join(root, rev67, ...relative));
    const raw70 = fs.readFileSync(path.join(root, rev70, ...relative));
    assert.deepEqual(raw67, raw70);
    const source = JSON.parse(raw67.toString("utf8"));

    assert.equal(source.id, 14509);
    assert.match(source.effectTemplateRaw, /Using an Elemental Skill grants the Kagura Dance effect/);
    assert.match(source.effectTemplateRaw, /Stellar-Conduct DMG/);
    assert.match(source.effectTemplateRaw, /Max 3 stacks/);
    assert.match(source.effectTemplateRaw, /when they possess 3 stacks/);
    assert.deepEqual(
        ["r1", "r2", "r3", "r4", "r5"].map((rank) => source[rank].values),
        [["12%", "12%", "12%"], ["15%", "15%", "15%"], ["18%", "18%", "18%"], ["21%", "21%", "21%"], ["24%", "24%", "24%"]]
    );
});

test("Kagura Dance uses one shared 0-3 stack input and gates the all-element bonus at 3 stacks", () => {
    const calcData = loadCalcData();
    const skill = modifier(calcData, IDS.skill);
    const maxStack = modifier(calcData, IDS.maxStack);
    const reaction = modifier(calcData, IDS.reaction);
    const legacyReaction = modifier(calcData, IDS.legacyReaction);

    assert.equal(skill.conditionInput?.type, "stack");
    assert.equal(reaction.conditionInput?.type, "stack");
    assert.equal(maxStack.conditionInput?.type, "stack");
    assert.equal(skill.stackReferenceId, "kaguraDanceStacks");
    assert.equal(reaction.stackReferenceId, "kaguraDanceStacks");
    assert.equal(maxStack.stackReferenceId, "kaguraDanceStacks");
    assert.deepEqual(skill.stack, { min: 0, max: 3, default: 0 });
    assert.deepEqual(reaction.stack, { min: 0, max: 3, default: 0 });
    assert.deepEqual(maxStack.stack, { min: 0, max: 3, default: 0 });
    assert.deepEqual(skill.applyTo, ["skillDamageBonus"]);
    assert.deepEqual(reaction.applyTo, ["astralConductionDamageBonus"]);
    assert.deepEqual(maxStack.applyTo, ["allElementDamageBonus"]);
    assert.equal(skill.duration, 24);
    assert.equal(reaction.duration, 24);
    assert.equal(legacyReaction.auditDisposition, "supersededByStructuredRecord");

    const sandbox = harness();
    const empty = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context());
    assert.equal(
        empty.applied.some((item) => item.modifier.id === IDS.maxStack),
        false,
        "all-element bonus must not apply before any Kagura Dance stack"
    );
});

test("Kagura Dance does not apply the 3-stack all-element bonus in the default calculation", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const empty = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context());
    assert.equal(
        empty.applied.some((item) => item.modifier.id === IDS.maxStack),
        false,
        "the current zero-stack state must be fail-closed"
    );
});
