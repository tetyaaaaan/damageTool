"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "14433";
const IDS = {
    bloom: "w_14433_reaction_bonus_1",
    lunarBloom: "w_14433_reaction_bonus_2",
    legacyLunar: "w_14433_reactionBonus_b6eb8abd",
    legacyBroad: "w_14433_reactionBonus_fba9df82"
};

const SOURCE_PATHS = [
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard03/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/English/weapons/blackmarrowlantern.json",
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard03/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/English/weapons/blackmarrowlantern.json"
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
        id: "blackmarrow-lantern-reaction",
        attackType: "reaction",
        damageType: "reaction",
        element: "dendro",
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
    return items.map((item) => item.modifier.id).sort();
}

test("烏髄の孤灯の6.7/7.0 rawは開花48%、月開花12%、満照時の追加12%を保持する", () => {
    const sources = SOURCE_PATHS.map((path) => require(path));
    sources.forEach((source) => {
        assert.equal(source.id, 14433);
        assert.equal(source.name, "Blackmarrow Lantern");
        assert.match(source.effectTemplateRaw, /Bloom DMG is increased/);
        assert.match(source.effectTemplateRaw, /Lunar-Bloom DMG is increased/);
        assert.match(source.effectTemplateRaw, /Ascendant Gleam/);
        assert.deepEqual(source.r1.values, ["48%", "12%", "12%"]);
        assert.deepEqual(source.r5.values, ["96%", "24%", "24%"]);
    });
    assert.deepEqual(sources[0], sources[1], "6.7/7.0 provider raw must remain unchanged");

    const localEffect = require("../../games/genshin/data/v2/weapons/source-records.json")["weapon:14433:effect"];
    assert.deepEqual(localEffect.structuredValue.effectParamsByRefinement["1"], {
        param1: "48%",
        param2: "12%",
        param3: "12%"
    });
});

test("烏髄の孤灯は通常開花と月開花を分離し、満照追加分を独立した状態入力として表現する", () => {
    const calcData = loadCalcData();
    const bloom = record(IDS.bloom, calcData);
    const lunarBloom = record(IDS.lunarBloom, calcData);
    const legacyLunar = record(IDS.legacyLunar, calcData);
    const legacyBroad = record(IDS.legacyBroad, calcData);

    assert.equal(bloom.category, "reactionBonus");
    assert.deepEqual(bloom.applyTo, ["bloomDamageBonus"]);
    assert.deepEqual(bloom.valueByRefinement, { 1: 48, 2: 60, 3: 72, 4: 84, 5: 96 });
    assert.equal(lunarBloom.category, "reactionBonus");
    assert.deepEqual(lunarBloom.applyTo, ["lunarBloomDamageBonus"]);
    assert.deepEqual(lunarBloom.valueByRefinement, { 1: 12, 2: 15, 3: 18, 4: 21, 5: 24 });
    assert.equal(legacyLunar.conditionOptionValue, "ascendantGleam");
    assert.equal(legacyBroad.auditDisposition, "supersededByStructuredRecord");

    const moonStateRecords = records(calcData).filter((item) => {
        if (item.id === IDS.lunarBloom || !(item.applyTo || []).includes("lunarBloomDamageBonus")) return false;
        return item.conditionInput?.type === "option"
            && item.conditionOptionValue === "ascendantGleam";
    });
    assert.ok(
        moonStateRecords.length > 0,
        "the Ascendant Gleam +12% must reuse the existing lunar duplicate as an option-state modifier"
    );
});

test("烏髄の孤灯は開花へ月開花補正を漏らさず、満照時だけ月開花追加分を一度適用する", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const moonStateRecords = records(calcData).filter((item) => {
        if (item.id === IDS.lunarBloom || !(item.applyTo || []).includes("lunarBloomDamageBonus")) return false;
        return item.conditionInput?.type === "option"
            && item.conditionOptionValue === "ascendantGleam";
    });

    const bloom = applyReaction(sandbox, calcData, "bloom", context());
    assert.equal(bloom.result.totals.reactionBonus, 48);
    assert.deepEqual(Array.from(ids(bloom.applied)), [IDS.bloom]);

    const lunarBloom = applyReaction(sandbox, calcData, "lunarBloom", context());
    assert.equal(lunarBloom.result.totals.reactionBonus, 12);
    assert.deepEqual(Array.from(ids(lunarBloom.applied)), [IDS.lunarBloom]);

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
    const ascendant = applyReaction(sandbox, calcData, "lunarBloom", ascendantContext);
    assert.equal(ascendant.result.totals.reactionBonus, 24);
    assert.deepEqual(
        Array.from(ids(ascendant.applied)),
        [IDS.lunarBloom, ...moonStateRecords.map((item) => item.id)].sort()
    );
});
