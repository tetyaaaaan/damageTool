"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const affectedByWeapon = new Map([
    ["11405", { legacy: "w_11405_damageBonus_973138ba", active: "w_11405_damage_1", condition: "enemyAffectedByPyroOrElectro", value: 20 }],
    ["12302", { legacy: "w_12302_damageBonus_4bc56ade", active: "w_12302_damage_1", condition: "enemyAffectedByPyroOrElectro", value: 12 }],
    ["12405", { legacy: "w_12405_damageBonus_43450e5a", active: "w_12405_damage_1", condition: "enemyAffectedByHydroOrElectro", value: 20 }],
    ["13401", { legacy: "w_13401_damageBonus_57a5968c", active: "w_13401_damage_1", condition: "enemyAffectedByHydroOrPyro", value: 20 }],
    ["14301", { legacy: "w_14301_damageBonus_4b54fa3c", active: "w_14301_damage_1", condition: "enemyAffectedByHydroOrElectro", value: 12 }],
    ["15301", { legacy: "w_15301_damageBonus_518c221d", active: "w_15301_damage_1", condition: "enemyAffectedByHydroOrPyro", value: 12 }]
]);

function context(weaponId) {
    return {
        characterId: "10000002",
        weaponId,
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
        mode: "manualMode"
    };
}

test("敵元素付着武器は明示toggleで全ダメージ補正を一度だけ適用する", () => {
    const sandbox = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
    const calcData = loadCalcData();

    for (const [weaponId, route] of affectedByWeapon) {
        const sourceModifiers = calcData.weaponModifiers[weaponId].modifiers
            .filter((item) => [route.legacy, route.active].includes(item.id));
        assert.equal(sourceModifiers.length, 2, weaponId);
        assert.ok(sourceModifiers.every((item) => /影響を受けた敵/.test(item.sourceText)), weaponId);
        const legacy = sourceModifiers.find((item) => item.id === route.legacy);
        const active = sourceModifiers.find((item) => item.id === route.active);
        assert.equal(legacy.auditDisposition, "supersededByStructuredRecord", weaponId);
        assert.equal(active.auditDisposition, undefined, weaponId);
        assert.deepEqual(active.applyTo, ["allDamageBonus"], weaponId);
        assert.equal(active.condition, route.condition, weaponId);
        assert.equal(active.calculationSupport, "toggle", weaponId);
        assert.equal(active.uidHandling, "conditional", weaponId);

        const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context(weaponId));
        assert.equal(collected.applied.some((item) => [route.legacy, route.active].includes(item.modifier.id)), false, weaponId);
        const candidates = collected.candidates.filter((item) => [route.legacy, route.active].includes(item.modifier.id));
        assert.equal(candidates.length, 2, weaponId);
        assert.equal(candidates.find((item) => item.modifier.id === route.legacy).analysis.reasonCode, "SUPERSEDED_RECORD", weaponId);
        assert.equal(candidates.find((item) => item.modifier.id === route.active).reason, "条件OFF", weaponId);

        const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(active, `weapon:${weaponId}`);
        const enabledContext = context(weaponId);
        enabledContext.uiState.conditionByModifier[key] = { enabled: true, stack: 0, option: "" };
        const enabled = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, enabledContext);
        const applied = enabled.applied.filter((item) => [route.legacy, route.active].includes(item.modifier.id));
        assert.equal(applied.length, 1, weaponId);
        assert.equal(applied[0].modifier.id, route.active, weaponId);
        assert.equal(applied[0].value, route.value, weaponId);
    }
});
