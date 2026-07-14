const test = require("node:test");
const assert = require("node:assert/strict");
const { createBrowserScriptHarness, loadCalcData } = require("./helpers/browserScriptHarness.cjs");

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
        weaponId: "",
        refinement: 1,
        artifactSetMode: "none",
        artifactSetIds: [],
        constellation: 0,
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        stats: { hp: 20000, atk: 2000, def: 1000, elementalMastery: 0, critRate: 5, critDamage: 50, elementDamageBonus: 0 },
        enemy: { enemyResistance: 10, resistanceDebuff: 0, defenseDebuff: 0, defenseIgnore: 0 },
        manualInputs: { providerStats: {}, resourceStates: {} },
        uiState: { conditionByModifier: {}, complexConditionByModifier: {}, stackByModifier: {}, toggleByModifier: {}, constellationConditions: {} },
        mode: "manualMode",
        ...overrides
    };
}

test("STEP37 leaves no calc-data validation warning", () => {
    const sandbox = createBrowserScriptHarness(["games/js/genshinCalcData.js"]).sandbox;
    assert.deepEqual(Array.from(sandbox.GenshinCalcData.validateCalcData(loadCalcData())), []);
});

test("weapon 12515 shares Four Winds stacks between damage and Magic Secret critical damage", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const ctx = context({ weaponId: "12515" });
    const modifiers = calcData.weaponModifiers["12515"].modifiers;
    const damage = modifiers[0];
    const critical = modifiers[1];
    const damageKey = sandbox.GenshinModifierAnalyzer.modifierStateKey(damage, "weapon:12515");
    const criticalKey = sandbox.GenshinModifierAnalyzer.modifierStateKey(critical, "weapon:12515");
    ctx.uiState.conditionByModifier[damageKey] = { enabled: true, stack: 4, option: "" };
    ctx.uiState.conditionByModifier[criticalKey] = { enabled: true, stack: 0, option: "active" };
    ctx.uiState.stackByModifier.fourWindsPoem = 4;

    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, ctx);
    assert.deepEqual(Array.from(collected.applied.filter((item) => item.source === "weapon:12515"), (item) => [item.modifier.id, item.value]), [
        ["w_12515_four_winds_damage_per_stack_v10", 30],
        ["w_12515_magic_secret_crit_damage_per_stack_v10", 30]
    ]);
});

test("moon omen artifact states resolve to the exact current bonus", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    for (const [setId, option, expected] of [["15041", "ascendantGleam", 30], ["15042", "ascendantGleam", 120]]) {
        const ctx = context({ artifactSetMode: "4pc", artifactSetIds: [setId] });
        const modifier = calcData.artifactSetModifiers[setId].fourPiece[0];
        const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(modifier, `artifact4:${setId}`);
        ctx.uiState.conditionByModifier[key] = { enabled: true, option, stack: 0 };
        const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, ctx);
        const applied = collected.applied.find((item) => item.modifier.id === modifier.id);
        assert.equal(applied.value, expected);
    }
});

test("weapon 12515 condition card has one stack input and one Magic Secret option", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const state = sandbox.GenshinCalcConditions.conditionPanelState(context({ weaponId: "12515" }), calcData);
    const weapon = state.cards.find((card) => card.id === "weapon");
    const controls = weapon.sections.flatMap((section) => section.controls);
    assert.equal(controls.filter((control) => control.type === "stack").length, 1);
    assert.equal(controls.filter((control) => control.type === "option").length, 1);
});
