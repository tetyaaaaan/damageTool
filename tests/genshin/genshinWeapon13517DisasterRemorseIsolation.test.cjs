"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "13517";
const IDS = {
    normalCharged: "w_13517_v3_damageBonus_1",
    skillBurst: "w_13517_v3_damageBonus_2",
    hexerei: "w_13517_v3_special_3"
};
const GROUPS = {
    normalCharged: "disasterAndRemorseUnforgivable",
    skillBurst: "disasterAndRemorseIrreparable"
};

const SOURCE_PATHS = [
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard03/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/English/weapons/disasterandremorse.json",
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard03/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/English/weapons/disasterandremorse.json"
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

function groupFor(calcData, id) {
    return (calcData.weaponEffectRegistry?.weapons?.[WEAPON_ID]?.groups || [])
        .find((group) => (group.modifierIds || []).includes(id));
}

function armToggle(sandbox, calcData, calcContext, group, enabled = true) {
    assert.ok(group, "13517 needs an explicit state group");
    const rawId = (group.modifierIds || []).find((id) => modifier(calcData, id));
    assert.ok(rawId, `group ${group.id} must reference a local modifier`);
    const normalized = sandbox.GenshinCalcEngine.normalizeWeaponModifier(
        modifier(calcData, rawId),
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

function damageEntry(attackType, damageType) {
    return {
        id: `fixture_${attackType}`,
        label: attackType,
        group: attackType,
        attackType,
        damageType,
        element: "炎",
        hitCount: 1
    };
}

test("災禍と贖罪の6.7/7.0 rawは2系統の3秒ダメージ補正と17秒状態を明示する", () => {
    const sources = SOURCE_PATHS.map((path) => require(path));
    sources.forEach((source) => {
        assert.equal(source.id, 13517);
        assert.equal(source.name, "Disaster and Remorse");
        assert.match(source.effectTemplateRaw, /uses an Elemental Skill/);
        assert.match(source.effectTemplateRaw, /Path of Conflict/);
        assert.match(source.effectTemplateRaw, /17s/);
        assert.match(source.effectTemplateRaw, /Normal Attack and Charged Attack DMG/);
        assert.match(source.effectTemplateRaw, /Elemental Skill and Elemental Burst DMG/);
        assert.match(source.effectTemplateRaw, /3s each/);
        assert.match(source.effectTemplateRaw, /increased by 75%/);
        assert.deepEqual(source.r1.values, ["40%", "40%"]);
        assert.deepEqual(source.r5.values, ["80%", "80%"]);
    });
    assert.deepEqual(sources[0], sources[1], "6.7/7.0 provider raw must remain unchanged");
});

test("災禍と贖罪は通常/重撃とスキル/爆発を別状態へ分離し、秘儀分岐を安全に保留する", () => {
    const calcData = loadCalcData();
    const normalCharged = modifier(calcData, IDS.normalCharged);
    const skillBurst = modifier(calcData, IDS.skillBurst);
    const hexerei = modifier(calcData, IDS.hexerei);
    const normalGroup = groupFor(calcData, IDS.normalCharged);
    const skillGroup = groupFor(calcData, IDS.skillBurst);
    const values = { 1: 40, 2: 50, 3: 60, 4: 70, 5: 80 };

    // Red fixture: before the product correction both rows are custom,
    // single-target records with no selectable state groups. The Hexerei
    // multiplier must not silently apply without an explicit Secret Rite input.
    assert.deepEqual(normalCharged.applyTo, ["normalAttackDamageBonus", "chargedAttackDamageBonus"]);
    assert.deepEqual(skillBurst.applyTo, ["skillDamageBonus", "burstDamageBonus"]);
    assert.notEqual(normalCharged.condition, "specialCondition");
    assert.notEqual(skillBurst.condition, "specialCondition");
    assert.equal(normalCharged.calculationSupport, "toggle");
    assert.equal(skillBurst.calculationSupport, "toggle");
    assert.equal(normalCharged.uidHandling, "conditional");
    assert.equal(skillBurst.uidHandling, "conditional");
    assert.equal(normalCharged.duration, 3);
    assert.equal(skillBurst.duration, 3);
    assert.deepEqual(normalCharged.valueByRefinement, values);
    assert.deepEqual(skillBurst.valueByRefinement, values);

    assert.ok(normalGroup, "13517 needs a normal/charged state group");
    assert.equal(normalGroup.targetOwner, "self");
    assert.equal(normalGroup.inputPolicy, "calculate");
    assert.equal(normalGroup.activation?.type, "toggle");
    assert.ok(normalGroup.activation?.stateKey);
    assert.match(`${normalGroup.activation?.label || ""}${normalGroup.description || ""}`, /無赦|通常|重撃/);

    assert.ok(skillGroup, "13517 needs a skill/burst state group");
    assert.equal(skillGroup.targetOwner, "self");
    assert.equal(skillGroup.inputPolicy, "calculate");
    assert.equal(skillGroup.activation?.type, "toggle");
    assert.ok(skillGroup.activation?.stateKey);
    assert.match(`${skillGroup.activation?.label || ""}${skillGroup.description || ""}`, /無癒|スキル|爆発/);

    assert.ok(["sourceContextRequired", "dedicatedFormulaDeferred"].includes(hexerei.auditDisposition));
});

test("災禍と贖罪は選択した状態だけを対応する攻撃種へ一度だけ反映する", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const collect = (groupId, entry) => {
        const calcContext = context();
        armToggle(sandbox, calcData, calcContext, groupFor(calcData, groupId));
        const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
        const applied = sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(entry, calcContext, collected);
        return { collected, applied };
    };

    const normal = collect(IDS.normalCharged, damageEntry("normalAttack", "normalAttack"));
    assert.equal(normal.applied.totals.damageBonus, 40);
    assert.equal(normal.applied.applied.filter((item) => item.modifier.id === IDS.normalCharged).length, 1);
    assert.equal(normal.applied.applied.some((item) => item.modifier.id === IDS.skillBurst), false);
    assert.equal(normal.applied.applied.some((item) => item.modifier.id === IDS.hexerei), false);

    const charged = collect(IDS.normalCharged, damageEntry("chargedAttack", "chargedAttack"));
    assert.equal(charged.applied.totals.damageBonus, 40);

    const skill = collect(IDS.skillBurst, damageEntry("skill", "skill"));
    assert.equal(skill.applied.totals.damageBonus, 40);
    assert.equal(skill.applied.applied.filter((item) => item.modifier.id === IDS.skillBurst).length, 1);
    assert.equal(skill.applied.applied.some((item) => item.modifier.id === IDS.normalCharged), false);
});
