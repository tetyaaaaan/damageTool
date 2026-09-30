const test = require("node:test");
const assert = require("node:assert/strict");
const { createScenarioHarness, prepareScenarioInputs, setElement } = require("./helpers/calcScenarioHarness.cjs");
const { createBrowserScriptHarness, loadCalcData } = require("./helpers/browserScriptHarness.cjs");

const EPSILON = 1e-9;

function almostEqual(actual, expected, message = "") {
    assert.ok(Math.abs(actual - expected) <= EPSILON * Math.max(1, Math.abs(expected)), `${message}: ${actual} !== ${expected}`);
}

function engineHarness() {
    return createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
}

function context({ level, elementalMastery, critRate, critDamage, resistance, resistanceDebuff = 0, contributors = [] }) {
    return {
        characterId: "10000073",
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
            elementalMastery,
            critRate,
            critDamage,
            energyRecharge: 100,
            elementDamageBonus: 250
        },
        enemy: {
            characterLevel: level,
            enemyLevel: 200,
            resistance: {
                base: { defaultElemental: resistance, physical: 10, byElement: {} },
                manualDebuff: { allElemental: resistanceDebuff, physical: 0, byElement: {} }
            },
            defenseReduction: 95,
            defenseIgnore: 95,
            immunities: []
        },
        manualInputs: { providerStats: {}, resourceStates: {}, reactionContributors: contributors, stellarConductStacks: 0 },
        uiState: { stackByModifier: {}, conditionByModifier: {}, toggleByModifier: {}, complexConditionByModifier: {}, constellationConditions: {} },
        reactionOptionKey: "lunarCrystallize",
        mode: "manualMode"
    };
}

function modifier(category, value, applyTo, extra = {}) {
    return {
        modifier: { id: `golden_${category}`, category, applyTo, ...extra },
        value,
        analysis: {}
    };
}

test("Lunar Crystallize golden 1: CalculationRequest minimum path keeps every neutral stage explicit", () => {
    const { sandbox, elements, calcData } = createScenarioHarness();
    prepareScenarioInputs(elements, {
        characterId: "10000073",
        stats: { elementalMastery: 0, critRate: 0, critDamage: 50, elementDamageBonus: 250 }
    });
    setElement(elements, "genshinJsonReactionOption", "lunarCrystallize");
    setElement(elements, "genshinEnemyElementalResistanceInput", 0);
    setElement(elements, "genshinEnemyLevelInput", 200);
    setElement(elements, "genshinDefenseReductionInput", 95);
    setElement(elements, "genshinDefenseIgnoreInput", 95);

    const request = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    assert.equal(request.reactionOptionKey, "lunarCrystallize");
    assert.deepEqual(Array.from(request.manualInputs.reactionContributors), []);
    const definition = calcData.reactionDefinitions.options.lunarCrystallize;
    assert.equal(definition.coefficient, 0.96);
    assert.equal(definition.directCoefficient, 1.6);
    assert.deepEqual(Array.from(definition.contributionWeights), [1, 0.5, 1 / 12, 1 / 12]);
    [1, 0.5, 1 / 12, 1 / 12].forEach((weight, index) => {
        almostEqual(0.96 * weight, 1.6 * [0.6, 0.3, 0.05, 0.05][index], `equivalent contribution ${index + 1}`);
    });
    request.calculationInput = { level: 90 };
    request.enemy.characterLevel = 1;

    const payload = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const result = payload.results.find((item) => item.entry.id === "reaction_lunarCrystallize");
    const participant = result.breakdown.reaction.contributors[0];
    const coefficientBase = 0.96 * 1446.853458;

    almostEqual(participant.levelMultiplier, 1446.853458, "level value");
    almostEqual(participant.elementalMasteryBonus, 0, "EM bonus percent");
    almostEqual(participant.baseDamageBonus, 0, "dedicated base bonus percent");
    almostEqual(participant.reactionBonus, 0, "reaction damage bonus percent");
    almostEqual(participant.preResistance, coefficientBase, "pre-resistance damage");
    almostEqual(result.breakdown.resistanceMultiplier, 1, "resistance multiplier");
    assert.equal(result.breakdown.defenseMultiplier, 1);
    assert.equal(result.breakdown.damageBonus, 0);
    almostEqual(result.nonCrit, 1388.97931968, "final non-critical damage");
    almostEqual(result.expected, 1388.97931968, "final expected damage");
    assert.match(result.entry.label, /月籠1個・1ヒット/);
    assert.equal(result.entry.hitCount, 1);
    assert.equal(result.supplementalTotal.hitCount, 3);
    almostEqual(result.supplementalTotal.nonCrit, result.nonCrit * 3, "same-target harmony non-critical reference");
    almostEqual(result.supplementalTotal.crit, result.crit * 3, "same-target harmony critical reference");
    almostEqual(result.supplementalTotal.expected, result.expected * 3, "same-target harmony expected reference");
    assert.match(result.supplementalTotal.note, /同じ対象|ターゲット分散/);

    const resultWrap = {
        innerHTML: "",
        hidden: true,
        querySelector() { return null; },
        querySelectorAll() { return []; },
        addEventListener() {}
    };
    const renderer = createBrowserScriptHarness(["games/js/genshinCalcRenderer.js"], { genshinJsonCalcResults: resultWrap }).sandbox;
    renderer.GenshinCalcRenderer.renderDamageTabs({
        context: payload.context,
        results: [JSON.parse(JSON.stringify(result))],
        displayData: { characters: {}, weapons: {} },
        statTrace: []
    });
    assert.match(resultWrap.innerHTML, /月籠1個・1ヒット/);
    assert.match(resultWrap.innerHTML, /参考：.*同一対象へ月籠3個が各1ヒット/);
    assert.match(resultWrap.innerHTML, /ターゲット分散時は対象ごと/);
});

test("Lunar Crystallize golden 2: practical EM, dedicated base bonus, reaction bonus, resistance, and crit", () => {
    const sandbox = engineHarness();
    const calcData = loadCalcData();
    const ctx = context({
        level: 90,
        elementalMastery: 400,
        critRate: 50,
        critDamage: 100,
        resistance: 10
    });
    sandbox.GenshinCalcEngine.hydrateReactionContext(ctx, calcData);
    const collected = { applied: [
        modifier("reactionBaseDamageBonus", 14, ["lunarCrystallizeBaseDamageBonus"], { targetOwner: "team" }),
        modifier("reactionBonus", 30, ["lunarCrystallizeDamageBonus"])
    ], candidates: [] };
    const result = sandbox.GenshinCalcEngine.buildStandaloneReactionResult(ctx, collected);
    const participant = result.breakdown.reaction.contributors[0];

    almostEqual(participant.levelMultiplier, 1446.853458, "level value");
    almostEqual(participant.elementalMasteryBonus, 100, "EM bonus percent");
    almostEqual(participant.baseDamageBonus, 14, "dedicated base bonus percent");
    almostEqual(participant.reactionBonus, 30, "reaction damage bonus percent");
    almostEqual(participant.preResistance, 3641.90377620096, "pre-resistance damage");
    almostEqual(result.breakdown.resistanceMultiplier, 0.9, "resistance multiplier");
    almostEqual(result.nonCrit, 3277.713398580864, "final non-critical damage");
    almostEqual(result.crit, 6555.426797161727, "final all-critical damage");
    almostEqual(result.expected, 4916.570097871296, "final expected damage");
});

test("Lunar Crystallize golden 3: four contributors are re-ranked and aggregated at the boundary", () => {
    const sandbox = engineHarness();
    const calcData = loadCalcData();
    const ctx = context({
        level: 100,
        elementalMastery: 1000,
        critRate: 70,
        critDamage: 140,
        resistance: 10,
        resistanceDebuff: 20,
        contributors: [
            { slot: 2, level: 90, elementalMastery: 500, critRate: 50, critDamage: 100, reactionBonus: 20, baseDamageBonus: 7 },
            { slot: 3, level: 80, elementalMastery: 200, critRate: 100, critDamage: 50, reactionBonus: 0, baseDamageBonus: 0 },
            { slot: 4, level: 1, elementalMastery: 0, critRate: 0, critDamage: 50, reactionBonus: 0, baseDamageBonus: 0 }
        ]
    });
    sandbox.GenshinCalcEngine.hydrateReactionContext(ctx, calcData);
    const collected = { applied: [
        modifier("reactionBaseDamageBonus", 14, ["lunarCrystallizeBaseDamageBonus"], { targetOwner: "team" }),
        modifier("reactionBonus", 30, ["lunarCrystallizeDamageBonus"])
    ], candidates: [] };
    const result = sandbox.GenshinCalcEngine.buildStandaloneReactionResult(ctx, collected);
    const participants = result.breakdown.reaction.contributors;

    assert.deepEqual(Array.from(result.breakdown.reaction.contributionWeights), [1, 0.5, 1 / 12, 1 / 12]);
    assert.deepEqual(Array.from(participants, (item) => item.levelMultiplier), [1674.8092, 1446.853458, 1077.443668, 17.165605]);
    [6351.0372680832, 4235.275741568256, 1913.445922920611, 19.7253400176]
        .forEach((expected, index) => almostEqual(participants[index].nonCrit, expected, `participant ${index + 1} non-critical`));
    almostEqual(result.breakdown.resistanceMultiplier, 1.05, "negative resistance multiplier");
    almostEqual(result.nonCrit, 8629.772744112177, "ranked non-critical aggregate");
    almostEqual(result.crit, 19719.41159283521, "ranked all-critical aggregate");
    almostEqual(result.expected, 16151.2986818098, "re-ranked critical expectation");

    const charged = { ...ctx, reactionOptionKey: "lunarCharged" };
    sandbox.GenshinCalcEngine.hydrateReactionContext(charged, calcData);
    const chargedResult = sandbox.GenshinCalcEngine.buildStandaloneReactionResult(charged, collected);
    assert.equal(chargedResult.breakdown.reactionBaseDamageBonus, 0, "lunar-crystallize-only base bonus must not leak");
    assert.equal(chargedResult.breakdown.reactionBonus, 0, "lunar-crystallize-only damage bonus must not leak");
});

test("Lunar Crystallize separates shared party modifiers from participant-local modifiers", () => {
    const sandbox = engineHarness();
    const calcData = loadCalcData();
    const ctx = context({
        level: 90,
        elementalMastery: 0,
        critRate: 10,
        critDamage: 50,
        resistance: 0,
        contributors: [{
            slot: 2,
            level: 90,
            elementalMastery: 0,
            critRate: 20,
            critDamage: 80,
            reactionBonus: 7,
            baseDamageBonus: 9,
            additiveBaseDamage: 25
        }]
    });
    sandbox.GenshinCalcEngine.hydrateReactionContext(ctx, calcData);
    const collected = { applied: [
        modifier("reactionBaseDamageBonus", 5, ["lunarCrystallizeBaseDamageBonus"], { targetOwner: "team" }),
        modifier("reactionBonus", 11, ["lunarCrystallizeDamageBonus"], { targetOwner: "team" }),
        { ...modifier("reactionBonus", 30, ["lunarCrystallizeDamageBonus"]), modifier: { id: "local_reaction", category: "reactionBonus", applyTo: ["lunarCrystallizeDamageBonus"], targetOwner: "self" } },
        { modifier: { id: "shared_additive", category: "scalingBonus", customCalculation: "scalingAdditiveBaseDamage", applyTo: ["lunarCrystallizeDamageBonus"], targetOwner: "team", reference: { stat: "atk", source: "self" }, ratio: 1, unit: "percent" }, value: 0, valueContext: ctx, analysis: { calculation: "scalingAdditiveBaseDamage" } },
        { modifier: { id: "local_additive", category: "scalingBonus", customCalculation: "scalingAdditiveBaseDamage", applyTo: ["lunarCrystallizeDamageBonus"], targetOwner: "self", reference: { stat: "atk", source: "self" }, ratio: 2, unit: "percent" }, value: 0, valueContext: ctx, analysis: { calculation: "scalingAdditiveBaseDamage" } }
    ], candidates: [] };
    const result = sandbox.GenshinCalcEngine.buildStandaloneReactionResult(ctx, collected);
    const [current, second] = result.breakdown.reaction.contributors;

    assert.equal(current.baseDamageBonus, 5);
    assert.equal(second.baseDamageBonus, 14);
    assert.equal(current.reactionBonus, 41);
    assert.equal(second.reactionBonus, 18);
    assert.equal(current.additiveBaseDamage, 60);
    assert.equal(second.additiveBaseDamage, 45);
    assert.deepEqual(JSON.parse(JSON.stringify(result.breakdown.reaction.modifierScopes)), {
        sharedParty: { reactionBonus: 11, baseDamageBonus: 5, additiveBaseDamage: 20, critRate: 0, critDamage: 0 },
        participantLocal: { reactionBonus: 30, baseDamageBonus: 0, additiveBaseDamage: 40, critRate: 0, critDamage: 0 }
    });

    const zibai = context({
        level: 90,
        elementalMastery: 0,
        critRate: 0,
        critDamage: 50,
        resistance: 0,
        contributors: [{ slot: 2, level: 90, elementalMastery: 0, critRate: 0, critDamage: 50, reactionBonus: 0, baseDamageBonus: 0, additiveBaseDamage: 0 }]
    });
    zibai.characterId = "10000126";
    zibai.stats.def = 2000;
    sandbox.GenshinCalcEngine.hydrateReactionContext(zibai, calcData);
    const zibaiResult = sandbox.GenshinCalcEngine.buildStandaloneReactionResult(
        zibai,
        sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, zibai)
    );
    assert.deepEqual(Array.from(zibaiResult.breakdown.reaction.contributors, (item) => item.baseDamageBonus), [14, 14]);
    assert.equal(zibaiResult.breakdown.reaction.modifierScopes.sharedParty.baseDamageBonus, 14);
});
