const test = require("node:test");
const assert = require("node:assert/strict");
const { createBrowserScriptHarness, loadCalcData } = require("./helpers/browserScriptHarness.cjs");

function createHarness() {
    return createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js",
        "games/js/genshinCalcRenderer.js"
    ]).sandbox;
}

function context(overrides = {}) {
    return {
        characterId: "10000120",
        weaponId: "15516",
        refinement: 1,
        artifactSetMode: "",
        artifactSetIds: [],
        constellation: 0,
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        stats: { hp: 20000, atk: 2000, def: 1000, elementalMastery: 0, energyRecharge: 100, critRate: 5, critDamage: 50, elementDamageBonus: 0 },
        enemy: { resistanceDebuff: 0, defenseDebuff: 0, defenseIgnore: 0 },
        manualInputs: { recordedHealing: null, providerStats: {}, resourceStates: {} },
        uiState: {
            amosStack: 0,
            crimsonWitchStack: 0,
            enableCharacterCondition: false,
            enableWeaponLowHpCondition: false,
            constellationConditions: {},
            stackByModifier: {},
            conditionByModifier: {},
            toggleByModifier: {},
            complexConditionByModifier: {}
        },
        mode: "uidMode",
        ...overrides
    };
}

test("霜契の金枝は三つの意味別カードへ統合される", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const state = sandbox.GenshinCalcConditions.conditionPanelState(context(), calcData);
    const sections = state.cards.find((card) => card.id === "weapon").sections;

    assert.deepEqual(Array.from(sections, (section) => section.id), [
        "golden_frostbound_oath_self_favor",
        "golden_frostbound_oath_team_mischief",
        "golden_frostbound_oath_defense"
    ]);
    assert.equal(sections[0].controls.length, 1);
    assert.equal(sections[0].controls[0].label, "霜の精の祝福が発動中");
    assert.deepEqual(Array.from(sections[0].effects, (effect) => effect.modifier.id), [
        "w_15516_damage_2",
        "w_15516_reaction_bonus_3"
    ]);
    assert.equal(sections[1].controls.length, 0);
    assert.deepEqual(Array.from(sections[1].effects, (effect) => effect.modifier.id), [
        "w_15516_damage_5",
        "w_15516_reaction_bonus_4"
    ]);
    assert.deepEqual(Array.from(sections[2].effects, (effect) => effect.modifier.id), ["w_15516_stat_1"]);
});

test("霜の精の祝福は一つの発動状態で装備者の二効果だけを一度ずつ適用する", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const activeContext = context();
    const raw = calcData.weaponModifiers[activeContext.weaponId].modifiers;
    const definition = calcData.weaponEffectRegistry.weapons[activeContext.weaponId];
    const geo = sandbox.GenshinCalcEngine.normalizeWeaponModifier(
        raw.find((modifier) => modifier.id === "w_15516_damage_2"),
        raw,
        definition
    );
    const stateKey = sandbox.GenshinModifierAnalyzer.modifierStateKey(geo, `weapon:${activeContext.weaponId}`);
    activeContext.uiState.conditionByModifier[stateKey] = { enabled: true, stack: 0, option: "" };

    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, activeContext);
    const applied = collected.applied.filter((item) => item.source === `weapon:${activeContext.weaponId}`);
    assert.deepEqual(Array.from(applied, (item) => [item.modifier.id, item.value]), [
        ["w_15516_damage_2", 40],
        ["w_15516_reaction_bonus_3", 40]
    ]);
});

test("全武器で安全条件に合う自動生成重複は計算対象から隔離される", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    let superseded = 0;
    Object.entries(calcData.weaponModifiers).forEach(([weaponId, entry]) => {
        const modifiers = entry.modifiers || [];
        const definition = calcData.weaponEffectRegistry.weapons[weaponId] || {};
        modifiers.forEach((modifier) => {
            const normalized = sandbox.GenshinCalcEngine.normalizeWeaponModifier(modifier, modifiers, definition);
            if (normalized.auditDisposition === "supersededByStructuredRecord") superseded += 1;
        });
    });
    assert.ok(superseded >= 25, `隔離済み重複が少なすぎます: ${superseded}`);
});
