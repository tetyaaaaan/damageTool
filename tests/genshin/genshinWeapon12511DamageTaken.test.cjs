"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");
const {
    createScenarioHarness,
    prepareScenarioInputs
} = require("./helpers/calcScenarioHarness.cjs");

const WEAPON_ID = "12511";
const DAMAGE_TAKEN_ID = "w_12511_stat_2";
const SKILL_HIT_ID = "w_12511_statBonus_38dc356d";

function createHarness() {
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
            atk: 2000,
            baseAtk: 1000,
            def: 1000,
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

function setCondition(sandbox, calcContext, calcData, id, enabled) {
    const item = modifier(calcData, id);
    const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(item, `weapon:${WEAPON_ID}`);
    calcContext.uiState.conditionByModifier[key] = { enabled, stack: 0, option: "" };
    return item;
}

function appliedFor(collected, id) {
    return collected.applied.filter((item) => item.modifier.id === id);
}

test("葦海の標の被弾後ATK補正は8秒の明示条件としてR1-R5を保持する", () => {
    const calcData = loadCalcData();
    const damageTaken = modifier(calcData, DAMAGE_TAKEN_ID);

    assert.equal(damageTaken.auditDisposition, undefined);
    assert.deepEqual(damageTaken.applyTo, ["atkPercent"]);
    assert.equal(damageTaken.condition, "afterTakingDamage");
    assert.equal(damageTaken.conditionLabel, "ダメージを受けてから8秒以内");
    assert.equal(damageTaken.calculationSupport, "toggle");
    assert.equal(damageTaken.uidHandling, "conditional");
    assert.equal(damageTaken.duration, 8);
    assert.deepEqual(damageTaken.valueByRefinement, { 1: 20, 2: 25, 3: 30, 4: 35, 5: 40 });
});

test("被弾後ATK補正は初期OFFで、明示入力時に一度だけ適用される", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const emptyContext = context();
    const empty = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, emptyContext);
    assert.equal(appliedFor(empty, DAMAGE_TAKEN_ID).length, 0);
    assert.equal(empty.candidates.find((item) => item.modifier.id === DAMAGE_TAKEN_ID).reason, "条件OFF");

    const activeContext = context();
    setCondition(sandbox, activeContext, calcData, DAMAGE_TAKEN_ID, true);
    const active = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, activeContext);
    const applied = appliedFor(active, DAMAGE_TAKEN_ID);
    assert.equal(applied.length, 1);
    assert.equal(applied[0].value, 20);
    assert.equal(sandbox.GenshinCalcEngine.buildEffectiveStats(activeContext, active).effectiveStats.atk, 2200);
});

test("被弾後8秒状態と元素スキル命中状態は別々に切り替わる", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();

    const skillContext = context();
    setCondition(sandbox, skillContext, calcData, SKILL_HIT_ID, true);
    const skillApplied = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, skillContext).applied
        .filter((item) => item.source === `weapon:${WEAPON_ID}`);
    assert.equal(JSON.stringify(skillApplied.map((item) => item.modifier.id)), JSON.stringify([SKILL_HIT_ID]));

    const damageContext = context();
    setCondition(sandbox, damageContext, calcData, DAMAGE_TAKEN_ID, true);
    const damageApplied = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, damageContext).applied
        .filter((item) => item.source === `weapon:${WEAPON_ID}`);
    assert.equal(JSON.stringify(damageApplied.map((item) => item.modifier.id)), JSON.stringify([DAMAGE_TAKEN_ID]));
});

test("R1-R5の被弾後ATK値を計算へ渡し、UID入力でも未指定時は加算しない", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const expected = [20, 25, 30, 35, 40];

    expected.forEach((value, index) => {
        const calcContext = context({ refinement: index + 1 });
        setCondition(sandbox, calcContext, calcData, DAMAGE_TAKEN_ID, true);
        const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
        assert.equal(appliedFor(collected, DAMAGE_TAKEN_ID)[0].value, value);
        assert.equal(collected.applied.filter((item) => item.source === `weapon:${WEAPON_ID}`).length, 1);
    });

    const uidContext = context({
        mode: "uidMode",
        inputProvenance: { includesPersistentBonuses: true }
    });
    const uidCollected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, uidContext);
    assert.equal(appliedFor(uidCollected, DAMAGE_TAKEN_ID).length, 0);
    assert.equal(uidCollected.candidates.find((item) => item.modifier.id === DAMAGE_TAKEN_ID).reason, "条件OFF");
});

test("通常のフォーム入力経路でも被弾後条件を一度だけ反映する", async () => {
    const { sandbox, elements, calcData } = createScenarioHarness();
    prepareScenarioInputs(elements, { characterId: "10000002", weaponId: WEAPON_ID, stats: { baseAtk: 1000 } });
    elements.genshinJsonEnableWeaponLowHpCondition.checked = false;
    const key = `weapon:${WEAPON_ID}:${DAMAGE_TAKEN_ID}`;
    elements[`toggle:${key}`] = {
        checked: true,
        dataset: { genshinToggleKey: key }
    };

    // The product opens the condition panel once before the calculation. This
    // seeds the engine's active condition definitions so the explicit toggle
    // survives the normal request rebuild.
    sandbox.GenshinCalcConditions.conditionPanelState(
        sandbox.GenshinCalcEngine.buildCharacterCalcContext(),
        calcData
    );
    const payload = await sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    const normal = payload.results.find((item) => item.entry.attackType === "normalAttack");
    const applied = normal.breakdown.appliedModifiers.filter((item) => item.modifier.id === DAMAGE_TAKEN_ID);
    assert.equal(applied.length, 1);
    assert.equal(normal.breakdown.statBonus.atk, 200);
});
