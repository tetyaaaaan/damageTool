"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "13433";
const IDS = {
    electro: "w_13433_reaction_bonus_1",
    lunar: "w_13433_reaction_bonus_2",
    legacyLunar: "w_13433_reactionBonus_45ef3fc4",
    legacyBroad: "w_13433_reactionBonus_acac6169"
};

const SOURCE_PATHS = [
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard02/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/English/weapons/prospectorsshovel.json",
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard02/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/English/weapons/prospectorsshovel.json"
];

function records(calcData = loadCalcData()) {
    return calcData.weaponModifiers[WEAPON_ID].modifiers;
}

function record(id, calcData) {
    return records(calcData).find((item) => item.id === id);
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

function reactionEntry() {
    return {
        id: "prospectors-shovel-reaction",
        attackType: "reaction",
        damageType: "reaction",
        element: "electro",
        group: "reaction"
    };
}

function applyReaction(sandbox, calcData, reactionId, calcContext) {
    calcContext.reactionOption = calcData.reactionDefinitions.options[reactionId];
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
    const result = sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(
        reactionEntry(),
        calcContext,
        collected
    );
    return {
        result,
        applied: result.applied.filter((item) => item.source === `weapon:${WEAPON_ID}`)
    };
}

function ids(items) {
    return Array.from(items, (item) => item.modifier.id).sort();
}

test("匣中日月の6.7/7.0 rawは感電48%、月感電12%、満照時の追加12%を保持する", () => {
    const sources = SOURCE_PATHS.map((path) => require(path));
    sources.forEach((source) => {
        assert.equal(source.id, 13433);
        assert.equal(source.name, "Prospector's Shovel");
        assert.match(source.effectTemplateRaw, /Electro-Charged DMG is increased/);
        assert.match(source.effectTemplateRaw, /Lunar-Charged DMG is increased/);
        assert.match(source.effectTemplateRaw, /Ascendant Gleam/);
        assert.deepEqual(source.r1.values, ["48%", "12%", "12%"]);
        assert.deepEqual(source.r5.values, ["96%", "24%", "24%"]);
    });
    assert.deepEqual(sources[0], sources[1], "6.7/7.0 provider raw must remain unchanged");

    const localEffect = require("../../games/genshin/data/v2/weapons/source-records.json")["weapon:13433:effect"];
    assert.deepEqual(localEffect.structuredValue.effectParamsByRefinement["1"], {
        param1: "48%",
        param2: "12%",
        param3: "12%"
    });
});

test("匣中日月は通常感電と月感電を分離し、満照追加分を独立した状態入力として表現する", () => {
    const calcData = loadCalcData();
    const electro = record(IDS.electro, calcData);
    const lunar = record(IDS.lunar, calcData);
    const legacyLunar = record(IDS.legacyLunar, calcData);
    const legacyBroad = record(IDS.legacyBroad, calcData);

    assert.equal(electro.category, "reactionBonus");
    assert.deepEqual(electro.applyTo, ["electroChargedDamageBonus"]);
    assert.deepEqual(electro.valueByRefinement, { 1: 48, 2: 60, 3: 72, 4: 84, 5: 96 });
    assert.equal(lunar.category, "reactionBonus");
    assert.deepEqual(lunar.applyTo, ["lunarChargedDamageBonus"]);
    assert.deepEqual(lunar.valueByRefinement, { 1: 12, 2: 15, 3: 18, 4: 21, 5: 24 });
    assert.equal(legacyLunar.conditionOptionValue, "ascendantGleam");
    assert.equal(legacyBroad.auditDisposition, "supersededByStructuredRecord");

    const moonStateRecords = records(calcData).filter((item) => {
        if (item.id === IDS.lunar || !(item.applyTo || []).includes("lunarChargedDamageBonus")) return false;
        return item.conditionInput?.type === "option"
            && item.conditionOptionValue === "ascendantGleam";
    });
    assert.ok(
        moonStateRecords.length > 0,
        "the Ascendant Gleam +12% must reuse the existing lunar duplicate as an option-state modifier"
    );
});

test("匣中日月は感電へ月感電補正を漏らさず、満照時だけ月感電追加分を一度適用する", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const moonStateRecords = records(calcData).filter((item) => {
        if (item.id === IDS.lunar || !(item.applyTo || []).includes("lunarChargedDamageBonus")) return false;
        return item.conditionInput?.type === "option"
            && item.conditionOptionValue === "ascendantGleam";
    });

    const electro = applyReaction(sandbox, calcData, "electroCharged", context());
    assert.equal(electro.result.totals.reactionBonus, 48);
    assert.deepEqual(ids(electro.applied), [IDS.electro]);

    const lunar = applyReaction(sandbox, calcData, "lunarCharged", context());
    assert.equal(lunar.result.totals.reactionBonus, 12);
    assert.deepEqual(ids(lunar.applied), [IDS.lunar]);

    assert.ok(moonStateRecords.length > 0, "a state record is required before testing Ascendant Gleam");
    const ascendantContext = context();
    moonStateRecords.forEach((modifier) => {
        const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(
            modifier,
            `weapon:${WEAPON_ID}`
        );
        ascendantContext.uiState.conditionByModifier[key] = {
            enabled: true,
            stack: 0,
            option: "ascendantGleam"
        };
    });
    const ascendant = applyReaction(sandbox, calcData, "lunarCharged", ascendantContext);
    assert.equal(ascendant.result.totals.reactionBonus, 24);
    assert.deepEqual(
        ids(ascendant.applied),
        [IDS.lunar, ...moonStateRecords.map((item) => item.id)].sort()
    );
});
