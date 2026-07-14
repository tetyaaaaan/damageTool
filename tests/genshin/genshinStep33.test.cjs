const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAudit } = require("../../scripts/genshinWeaponEffectAudit.cjs");
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
        characterId: "10000037",
        weaponId: "15502",
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

test("STEP33 classifies every weapon modifier and records duplicate candidates", () => {
    const audit = buildAudit();
    assert.equal(audit.summary.weapons, 210);
    assert.equal(audit.summary.modifiers, 455);
    assert.equal(audit.summary.structuredWeapons, 8);
    assert.equal(audit.summary.structuredGroups, 16);
    assert.equal(audit.summary.structuredModifiers, 28);
    assert.equal(audit.summary.fallbackModifiers, 427);
    assert.equal(audit.summary.duplicateCandidateGroups, 50);
    assert.equal(audit.records.every((record) => record.inputPolicy && record.activationType && record.targetOwner), true);
});

test("STEP33 weapon registry passes calc-data validation", () => {
    const { sandbox } = createBrowserScriptHarness(["games/js/genshinCalcData.js"]);
    const calcData = loadCalcData();
    const warnings = sandbox.GenshinCalcData.validateCalcData(calcData)
        .filter((warning) => warning.message.includes("weaponEffectRegistry"));
    assert.deepEqual(Array.from(warnings), []);
});

test("鐘の剣はシールド状態を明示した一つの効果カードになる", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const bellContext = context({ weaponId: "12402" });
    const state = sandbox.GenshinCalcConditions.conditionPanelState(bellContext, calcData);
    const weapon = state.cards.find((card) => card.id === "weapon");
    const shield = weapon.sections.find((section) => section.id === "bell_shield_damage");
    assert.equal(shield.name, "シールド中のダメージ強化");
    assert.equal(shield.status, "userInput");
    assert.equal(shield.controls.length, 1);
    assert.equal(shield.controls[0].label, "シールド状態で計算する");
    assert.equal(shield.effects.length, 1);
});

test("霧切は入力反映済みの基礎効果を再加算せず巴紋3層だけを加算する", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const weaponId = "11509";
    const mistContext = context({ weaponId });
    const raw = calcData.weaponModifiers[weaponId].modifiers;
    const definition = calcData.weaponEffectRegistry.weapons[weaponId];
    const emblem = sandbox.GenshinCalcEngine.normalizeWeaponModifier(raw[0], raw, definition);
    const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(emblem, `weapon:${weaponId}`);
    mistContext.uiState.conditionByModifier[key] = { enabled: true, stack: 3, option: "" };
    mistContext.uiState.stackByModifier[emblem.id] = 3;

    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, mistContext);
    const applied = collected.applied.filter((item) => item.source === `weapon:${weaponId}`);
    assert.deepEqual(Array.from(applied, (item) => [item.modifier.id, item.value]), [["w_11509_damageBonus_ae1b42da", 28]]);
});

test("流浪楽章は選択した楽章だけを適用する", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const weaponId = "14402";
    const songContext = context({ weaponId });
    const raw = calcData.weaponModifiers[weaponId].modifiers;
    const definition = calcData.weaponEffectRegistry.weapons[weaponId];
    const aria = sandbox.GenshinCalcEngine.normalizeWeaponModifier(raw.find((modifier) => modifier.id === "w_14402_damage_2"), raw, definition);
    const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(aria, `weapon:${weaponId}`);
    songContext.uiState.conditionByModifier[key] = { enabled: true, stack: 0, option: "aria" };

    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, songContext);
    const applied = collected.applied.filter((item) => item.source === `weapon:${weaponId}`);
    assert.deepEqual(Array.from(applied, (item) => [item.modifier.id, item.value]), [["w_14402_damage_2", 48]]);
});

test("絶弦はスキルと爆発へ自動適用し通常攻撃へは適用しない", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const stringlessContext = context({ weaponId: "15402" });
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, stringlessContext);
    const entry = (type) => ({ id: type, attackType: type, damageType: type, element: "岩", scalings: [] });
    assert.equal(sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(entry("skill"), stringlessContext, collected).totals.damageBonus, 24);
    assert.equal(sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(entry("burst"), stringlessContext, collected).totals.damageBonus, 24);
    assert.equal(sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(entry("normalAttack"), stringlessContext, collected).totals.damageBonus, 0);
});

test("装備者以外への武器効果を装備者自身へ加算しない", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const teamContext = context({ weaponId: "11518" });
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, teamContext);
    assert.equal(collected.applied.some((item) => item.modifier.id === "w_11518_stat_4"), false);
    const state = sandbox.GenshinCalcConditions.conditionPanelState(teamContext, calcData);
    const section = state.cards.find((card) => card.id === "weapon").sections
        .find((item) => item.id === "black_eclipse_active_character_atk");
    assert.equal(section.targetOwner, "activeCharacter");
    assert.equal(section.status, "displayOnly");
});
