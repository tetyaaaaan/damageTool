const test = require("node:test");
const assert = require("node:assert/strict");
const { createScenarioHarness, prepareScenarioInputs, setElement } = require("./helpers/calcScenarioHarness.cjs");

function combatContext(enemy) {
    return {
        characterId: "",
        weaponId: "",
        refinement: 1,
        artifactSetMode: "none",
        artifactSetIds: [],
        constellation: 0,
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        stats: {
            hp: 20000,
            atk: 2000,
            def: 1000,
            elementalMastery: 0,
            critRate: 0,
            critDamage: 50,
            energyRecharge: 100,
            elementDamageBonus: 0
        },
        enemy: {
            characterLevel: 90,
            enemyLevel: 90,
            defenseDebuff: 0,
            defenseIgnore: 0,
            ...enemy
        },
        reactionOptionKey: "none",
        reactionOption: { reactionId: "none", family: "none", enabled: false },
        manualInputs: { providerStats: {}, resourceStates: {} },
        uiState: { stackByModifier: {}, conditionByModifier: {}, toggleByModifier: {}, complexConditionByModifier: {} },
        mode: "manualMode"
    };
}

function damageEntry(element) {
    return {
        id: `step40_${element}`,
        label: `STEP40 ${element}`,
        attackType: "normalAttack",
        damageType: "normalAttack",
        group: "normalAttack",
        element,
        hitCount: 1,
        scalings: [{ stat: "atk", valuesByLevel: { "10": 100 } }]
    };
}

function calculate(engine, context, element, applied = []) {
    const entry = damageEntry(element);
    const modifiers = engine.applyModifiersToDamageEntry(entry, context, { applied, candidates: [] });
    return engine.calculateDamage(entry, context, modifiers);
}

test("STEP40 keeps elemental and physical resistance lanes independent in the input context", () => {
    const { sandbox, elements } = createScenarioHarness();
    prepareScenarioInputs(elements, { characterId: "10000037" });
    setElement(elements, "genshinEnemyElementalResistanceInput", 35);
    setElement(elements, "genshinEnemyPhysicalResistanceInput", 45);
    setElement(elements, "genshinElementalResistanceDebuffInput", 20);
    setElement(elements, "genshinPhysicalResistanceDebuffInput", 5);

    const context = sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    assert.equal(context.enemy.resistance.base.defaultElemental, 35);
    assert.equal(context.enemy.resistance.base.physical, 45);
    assert.equal(context.enemy.resistance.manualDebuff.allElemental, 20);
    assert.equal(context.enemy.resistance.manualDebuff.physical, 5);
    assert.deepEqual(Object.keys(context.enemy.resistance.base.byElement), []);
    assert.deepEqual(Object.keys(context.enemy.resistance.manualDebuff.byElement), []);
});

test("STEP40 resolves independent elemental and physical resistance models", () => {
    const { sandbox } = createScenarioHarness();
    const engine = sandbox.GenshinCalcEngine;
    const enemy = {
        resistance: {
            base: {
                defaultElemental: 10,
                physical: 40,
                byElement: { pyro: 50 }
            },
            manualDebuff: {
                allElemental: 20,
                physical: 5,
                byElement: { pyro: 15 }
            }
        }
    };

    assert.equal(engine.normalizeResistanceElement("\u708e"), "pyro");
    assert.equal(engine.normalizeResistanceElement("\u7269\u7406"), "physical");
    assert.equal(engine.resolveBaseResistance(enemy, "\u708e"), 50);
    assert.equal(engine.resolveBaseResistance(enemy, "\u6c34"), 10);
    assert.equal(engine.resolveBaseResistance(enemy, "physical"), 40);
    assert.equal(engine.resolveManualResistanceDebuff(enemy, "\u708e"), 35);
    assert.equal(engine.resolveManualResistanceDebuff(enemy, "\u6c34"), 20);
    assert.equal(engine.resolveManualResistanceDebuff(enemy, "physical"), 5);
    assert.equal(engine.resolveEffectiveResistance(enemy, "\u708e", 10), 5);
    assert.equal(engine.resolveEffectiveResistance(enemy, "\u6c34", 0), -10);
    assert.equal(engine.resolveEffectiveResistance(enemy, "physical", 20), 15);
});

test("STEP40 applies structured resistance debuffs only to matching damage", () => {
    const { sandbox } = createScenarioHarness();
    const engine = sandbox.GenshinCalcEngine;
    const context = combatContext({
        resistance: {
            base: { defaultElemental: 10, physical: 40, byElement: {} },
            manualDebuff: { allElemental: 20, physical: 5, byElement: {} }
        }
    });
    const physicalDebuff = {
        modifier: { id: "step40_physical_debuff", category: "resistanceDebuff", applyTo: ["physicalResistance"] },
        value: 20,
        source: "test",
        analysis: {}
    };

    const physical = calculate(engine, context, "physical", [physicalDebuff]);
    const elemental = calculate(engine, context, "\u708e", [physicalDebuff]);
    assert.equal(physical.breakdown.resistance, 15);
    assert.equal(physical.breakdown.resistanceMultiplier, 0.85);
    assert.equal(elemental.breakdown.resistance, -10);
    assert.equal(elemental.breakdown.resistanceMultiplier, 1.05);
    assert.equal(elemental.breakdown.appliedModifiers.some((item) => item.modifier.id === "step40_physical_debuff"), false);
});

test("STEP40 preserves legacy calculation results when both resistance lanes match", () => {
    const { sandbox } = createScenarioHarness();
    const engine = sandbox.GenshinCalcEngine;
    const legacy = combatContext({ enemyResistance: 10, resistanceDebuff: 20 });
    const split = combatContext({
        resistance: {
            base: { defaultElemental: 10, physical: 10, byElement: {} },
            manualDebuff: { allElemental: 20, physical: 20, byElement: {} }
        }
    });

    for (const element of ["\u708e", "physical"]) {
        const legacyResult = calculate(engine, legacy, element);
        const splitResult = calculate(engine, split, element);
        assert.equal(splitResult.nonCrit, legacyResult.nonCrit);
        assert.equal(splitResult.breakdown.resistance, legacyResult.breakdown.resistance);
        assert.equal(splitResult.breakdown.resistanceMultiplier, legacyResult.breakdown.resistanceMultiplier);
    }
});
