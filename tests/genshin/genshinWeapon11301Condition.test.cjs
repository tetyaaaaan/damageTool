"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

function createHarness() {
    return createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
}

function context(overrides = {}) {
    return {
        characterId: "10000037",
        weaponId: "11301",
        refinement: 1,
        artifactSetMode: "",
        artifactSetIds: [],
        constellation: 0,
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        stats: {
            hp: 20000,
            atk: 2000,
            def: 1000,
            elementalMastery: 100,
            energyRecharge: 100,
            critRate: 50,
            critDamage: 100,
            elementalDamageBonus: 0
        },
        enemy: {
            resistanceDebuff: 0,
            defenseDebuff: 0,
            defenseIgnore: 0
        },
        manualInputs: { recordedHealing: null, providerStats: {}, resourceStates: {} },
        uiState: {
            amosStack: 0,
            crimsonWitchStack: 0,
            enableCharacterCondition: false,
            enableLowHpCondition: false,
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

test("11301 has one active conditional all-damage route and no unconditional duplicate", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const modifiers = calcData.weaponModifiers["11301"].modifiers;
    const legacy = modifiers.find((modifier) => modifier.id === "w_11301_damageBonus_91cc873a");
    const active = modifiers.find((modifier) => modifier.id === "w_11301_damage_1");

    assert.equal(legacy.auditDisposition, "supersededByStructuredRecord");
    assert.deepEqual(active.applyTo, ["allDamageBonus"]);
    assert.equal(active.condition, "enemyAffectedByHydroOrCryo");
    assert.equal(active.calculationSupport, "toggle");
    assert.equal(active.uidHandling, "conditional");
    assert.deepEqual(active.valueByRefinement, { 1: 12, 2: 15, 3: 18, 4: 21, 5: 24 });

    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context());
    assert.equal(collected.applied.length, 0);
    assert.equal(
        JSON.stringify(Array.from(collected.candidates
            .filter((candidate) => candidate.source === "weapon:11301")
            .map((candidate) => [candidate.modifier.id, candidate.reason]))),
        JSON.stringify([
            ["w_11301_damageBonus_91cc873a", "同じ効果の構造化済みレコードへ統合済みです"],
            ["w_11301_damage_1", "条件OFF"]
        ])
    );
});

test("11301 condition toggle applies the all-damage bonus exactly once", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const modifier = calcData.weaponModifiers["11301"].modifiers
        .find((item) => item.id === "w_11301_damage_1");
    const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(modifier, "weapon:11301");
    const calcContext = context({
        uiState: {
            ...context().uiState,
            enableWeaponLowHpCondition: true,
            conditionByModifier: { [key]: { enabled: true, stack: 0, option: "" } }
        }
    });

    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
    const applied = collected.applied.filter((item) => item.source === "weapon:11301");
    assert.equal(applied.length, 1);
    assert.equal(applied[0].modifier.id, "w_11301_damage_1");
    assert.equal(applied[0].value, 12);
    assert.equal(applied[0].modifier.applyTo.length, 1);
    assert.equal(applied[0].modifier.applyTo[0], "allDamageBonus");

    const entry = {
        id: "normal",
        attackType: "normalAttack",
        damageType: "normalAttack",
        element: "physical",
        scalings: []
    };
    const result = sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(entry, calcContext, collected);
    assert.equal(result.totals.damageBonus, 12);
    assert.equal(result.applied.filter((item) => item.modifier.id === "w_11301_damage_1").length, 1);
});

test("11301 condition card exposes the explicit Hydro-or-Cryo toggle", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const panel = sandbox.GenshinCalcConditions.conditionPanelState(context(), calcData);
    const weapon = panel.cards.find((card) => card.id === "weapon");
    assert.equal(weapon.effects.length, 1);
    assert.equal(weapon.effects[0].id, "w_11301_damage_1");
    assert.equal(weapon.effects[0].status, "userInput");
    assert.equal(weapon.effects[0].target, "すべてのダメージ");
    assert.equal(weapon.effects[0].activationCondition, "敵が水元素または氷元素の影響を受けている");
    assert.equal(JSON.stringify(Array.from(weapon.effects[0].controls.map((control) => [control.type, control.label]))), JSON.stringify([
        ["toggle", "敵が水元素または氷元素の影響を受けている"]
    ]));
});

test("11302 HP threshold is fail-closed by default and applies the R1/R5 crit rate exactly once", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const modifier = calcData.weaponModifiers["11302"].modifiers
        .find((item) => item.id === "w_11302_crit_1");
    assert.equal(modifier.condition, "hpAtLeast90");
    assert.deepEqual(modifier.applyTo, ["critRate"]);
    assert.deepEqual(modifier.valueByRefinement, { 1: 14, 2: 17.5, 3: 21, 4: 24.5, 5: 28 });

    for (const [refinement, expected] of [[1, 14], [5, 28]]) {
        const offContext = context({ weaponId: "11302", refinement });
        const off = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, offContext);
        assert.equal(off.applied.filter((item) => item.source === "weapon:11302").length, 0);

        const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(modifier, "weapon:11302");
        const onContext = context({
            weaponId: "11302",
            refinement,
            uiState: {
                ...context().uiState,
                conditionByModifier: { [key]: { enabled: true, stack: 0, option: "" } }
            }
        });
        const on = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, onContext);
        const applied = on.applied.filter((item) => item.source === "weapon:11302");
        assert.equal(applied.length, 1);
        assert.equal(applied[0].value, expected);
        const result = sandbox.GenshinCalcEngine.applyModifiersToDamageEntry({
            id: "normal",
            attackType: "normalAttack",
            damageType: "normalAttack",
            element: "physical",
            scalings: []
        }, onContext, on);
        assert.equal(result.totals.critRateBonus, expected);
    }
});

test("11303 remains outside damage modifiers because its complete effect is healing only", () => {
    const calcData = loadCalcData();
    const effects = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../games/genshin/data/weapon-effects.json"), "utf8"));
    assert.match(effects["11303"].effectTextTemplate, /HPを\{param1\}回復する/);
    assert.equal(calcData.weaponModifiers["11303"], undefined);
});

test("11301 v2 derived records mirror the corrected route without strict promotion", () => {
    const v2Root = path.resolve(__dirname, "../../games/genshin/data/v2/weapons");
    const sourceRecords = JSON.parse(fs.readFileSync(path.join(v2Root, "source-records.json"), "utf8"));
    const specs = JSON.parse(fs.readFileSync(path.join(v2Root, "spec-candidates.json"), "utf8"));
    const verification = JSON.parse(fs.readFileSync(path.join(v2Root, "verification.json"), "utf8"));
    const index = JSON.parse(fs.readFileSync(path.join(v2Root, "index.json"), "utf8"));
    const activeSource = sourceRecords["weapon:11301:modifier:w_11301_damage_1"];
    const activeSpec = specs.w_11301_damage_1;
    const activeVerification = verification.w_11301_damage_1;

    assert.equal(activeSource.structuredValue.applyTo[0], "allDamageBonus");
    assert.equal(activeSource.structuredValue.condition, "enemyAffectedByHydroOrCryo");
    assert.equal(activeSource.structuredValue.calculationSupport, "toggle");
    assert.equal(activeSpec.effect.targets[0], "allDamageBonus");
    assert.equal(activeSpec.effect.activation.condition, "enemyAffectedByHydroOrCryo");
    assert.equal(activeSpec.verification.status, "needsReview");
    assert.equal(activeSpec.runtime.status, "candidate");
    assert.equal(activeVerification.verification.status, "needsReview");
    assert.equal(activeVerification.runtime.status, "candidate");
    assert.equal(index.summary.gameVersion, null);
    const legacyData = loadCalcData().weaponModifiers;
    for (const record of Object.values(legacyData).flatMap(item => item.modifiers || [])) {
        if (record.auditDisposition !== "sourceContextRequired") continue;
        assert.ok(specs[record.id].runtime.blockedReasons.includes("sourceContextRequired"), record.id);
        assert.notEqual(specs[record.id].runtime.status, "canonicalEligible", record.id);
    }
    assert.equal(index.summary.generatedFrom
        .find((item) => item.dataset === "calc/weapon-modifiers.json")
        .integrity.digest, require("node:crypto").createHash("sha256")
            .update(fs.readFileSync(path.resolve(v2Root, "../../calc/weapon-modifiers.json"))).digest("hex"));
});
