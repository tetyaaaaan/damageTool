"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const LEGACY_IDS = [
    "w_12418_statBonus_4abee3c5",
    "w_12418_statBonus_d123e765"
];
const ACTIVE_IDS = [
    "w_12418_stat_1",
    "w_12418_stat_2"
];
const ALL_IDS = [...LEGACY_IDS, ...ACTIVE_IDS];

function context() {
    return {
        characterId: "10000002",
        weaponId: "12418",
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
        mode: "manualMode"
    };
}

test("風と花の合言葉は旧反応限定レコードを重複適用せず一つの発動で二効果だけ反映する", () => {
    const sandbox = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
    const calcData = loadCalcData();
    const modifiers = calcData.weaponModifiers["12418"].modifiers
        .filter((modifier) => ALL_IDS.includes(modifier.id));
    assert.equal(modifiers.length, 4);
    assert.ok(modifiers.find((modifier) => modifier.id === ACTIVE_IDS[0])
        .sourceText.includes("元素スキルが敵に命中する、または元素反応を起こした後"));

    const calcContext = context();
    for (const modifier of modifiers) {
        const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(modifier, "weapon:12418");
        calcContext.uiState.conditionByModifier[key] = { enabled: true, stack: 0, option: "" };
    }

    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
    const applied = collected.applied.filter((item) => ALL_IDS.includes(item.modifier.id));
    assert.deepEqual(
        Array.from(applied, (item) => [item.modifier.id, item.value]),
        [["w_12418_stat_1", 12], ["w_12418_stat_2", 48]]
    );
    assert.deepEqual(
        Array.from(
            collected.candidates.filter((item) => LEGACY_IDS.includes(item.modifier.id)),
            (item) => item.analysis.reasonCode
        ),
        ["SUPERSEDED_RECORD", "SUPERSEDED_RECORD"]
    );
});
