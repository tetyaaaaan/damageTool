"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createScenarioHarness, prepareScenarioInputs, setElement } = require("./helpers/calcScenarioHarness.cjs");

const candidate = require("../../games/genshin/data/v2/candidates/7.0-provisional-stellar-swirl.json");

test("7.0 Stellar Swirl remains an explicitly non-canonical provisional candidate", () => {
    assert.equal(candidate.candidateId, "provisional:7.0:reaction:stellarSwirl");
    assert.equal(candidate.gameVersion, "7.0");
    assert.equal(candidate.entity.id, "stellarSwirl");
    assert.deepEqual(candidate.entity.triggerElements, ["Anemo", "Cryo"]);
    assert.equal(candidate.status, "candidatePrepared");
    assert.equal(candidate.nonCanonical, true);
    assert.equal(candidate.targetGameVersion, "7.0");
    assert.equal(candidate.statusDetails.support, "provisional");
    assert.equal(candidate.statusDetails.canonical, false);
    assert.equal(candidate.statusDetails.verificationComplete, false);
    assert.equal(candidate.statusDetails.runtimeConnected, false);
    assert.equal(candidate.statusDetails.failClosedCanonical, true);
    assert.match(candidate.statusDetails.uiLabelJa, /検証中/);
});

test("Stellar Swirl provisional variants keep the packet-confirmed coefficient and RES boundaries", () => {
    const variants = candidate.calculation.variants;

    assert.deepEqual(candidate.calculation.effectiveCoefficients, {
        initialAnemo: 0.45,
        vortex1: 1.2,
        vortex2: 1.8
    });
    assert.equal(variants.initialAnemo.effectiveCoefficient, 0.45);
    assert.equal(variants.initialAnemo.reactionElement, "Anemo");
    assert.equal(variants.initialAnemo.resistanceElement, "Anemo");
    assert.equal(variants.initialAnemo.vortexState, 0);
    assert.equal(variants.vortex1.effectiveCoefficient, 1.2);
    assert.equal(variants.vortex1.reactionElement, "Cryo");
    assert.equal(variants.vortex1.resistanceElement, "Cryo");
    assert.equal(variants.vortex1.vortexState, 1);
    assert.equal(variants.vortex2.effectiveCoefficient, 1.8);
    assert.equal(variants.vortex2.reactionElement, "Cryo");
    assert.equal(variants.vortex2.resistanceElement, "Cryo");
    assert.equal(variants.vortex2.vortexState, 2);

    const runtimeOption = candidate.reactionDefinitions.options.stellarSwirl;
    assert.equal(runtimeOption.calculationStatus, "supported");
    assert.equal(runtimeOption.dedicatedKind, "indirectLunar");
    assert.deepEqual(runtimeOption.variantCoefficients, {
        initialAnemo: 0.45,
        vortex1: 1.2,
        vortex2: 1.8
    });
    assert.equal(runtimeOption.provisional, true);
});

test("Stellar Swirl provisional formula records full level scaling and indirect-contributor rules", () => {
    const formula = candidate.calculation;
    const expectedLevelTable = require("../../games/genshin/data/calc/reaction-definitions.json").characterLevelMultipliers;

    assert.deepEqual(formula.levelTable, expectedLevelTable);
    assert.equal(Object.keys(formula.levelTable).length, 92);
    assert.equal(formula.levelTable["1"], 17.165605);
    assert.equal(formula.levelTable["90"], 1446.853458);
    assert.equal(formula.levelTable["95"], 1561.468);
    assert.equal(formula.levelTable["100"], 1674.8092);

    assert.deepEqual(formula.contributorWeights.normalized, [1, 0.5, 1 / 12, 1 / 12]);
    assert.equal(formula.contributorWeights.appliesPerContributor, true);
    assert.equal(formula.elementalMasteryBonus.coefficient, 600);
    assert.equal(formula.elementalMasteryBonus.coefficientPercent, 600);
    assert.equal(formula.elementalMasteryBonus.multiplierCoefficient, 6);
    assert.equal(formula.elementalMasteryBonus.denominatorBase, 2000);
    assert.equal(formula.elementalMasteryBonus.expression, "600 * EM / (EM + 2000)");
    assert.equal(formula.elementalMasteryBonus.multiplicativeExpression, "1 + 6 * EM / (EM + 2000)");
    assert.equal(formula.elementalMasteryBonus.appliesPerContributor, true);
    assert.equal(formula.critical.enabled, true);
    assert.equal(formula.critical.mode, "individualContributor");
    assert.equal(formula.critical.resolvePerContributorBeforeWeighting, true);
    assert.equal(formula.defense.applies, false);
    assert.equal(formula.defense.rule, "excluded");
    assert.equal(formula.resistance.applies, true);
    assert.deepEqual(formula.resistance.variantElements, {
        initialAnemo: "Anemo",
        vortex1: "Cryo",
        vortex2: "Cryo"
    });
});

test("Stellar Swirl provisional route calculates selected variant with crit, no DEF, and matching elemental RES", () => {
    const { sandbox, calcData, elements } = createScenarioHarness();
    calcData.reactionDefinitions.options.stellarSwirl = candidate.reactionDefinitions.options.stellarSwirl;
    prepareScenarioInputs(elements, {
        characterId: "10000016",
        stats: { elementalMastery: 0, critRate: 100, critDamage: 100 }
    });
    setElement(elements, "genshinJsonReactionOption", "stellarSwirl");
    setElement(elements, "genshinStellarSwirlVariant", "initialAnemo");
    const initialRequest = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    initialRequest.enemy.resistance.base.byElement = { anemo: 10, cryo: 50 };
    initialRequest.enemy.enemyLevel = 100;
    const initial = sandbox.GenshinCalcEngine.calculateDamageRequest(initialRequest, calcData)
        .results.find((item) => item.entry?.id === "reaction_stellarSwirl");
    assert.ok(initial);
    assert.ok(Math.abs(initial.nonCrit - 1446.853458 * 0.45 * 0.9) < 1e-8);
    assert.ok(Math.abs(initial.crit - initial.nonCrit * 2) < 1e-8);
    assert.equal(initial.breakdown.defenseMultiplier, 1);
    assert.equal(initial.breakdown.reaction.variantKey, "initialAnemo");
    assert.equal(initial.breakdown.reaction.damageElement, "Anemo");

    setElement(elements, "genshinStellarSwirlVariant", "vortex1");
    const vortexRequest = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    vortexRequest.enemy.resistance.base.byElement = { anemo: 10, cryo: 50 };
    const vortex = sandbox.GenshinCalcEngine.calculateDamageRequest(vortexRequest, calcData)
        .results.find((item) => item.entry?.id === "reaction_stellarSwirl");
    assert.ok(vortex);
    assert.ok(Math.abs(vortex.nonCrit - 1446.853458 * 1.2 * 0.5) < 1e-8);
    assert.equal(vortex.breakdown.reaction.variantKey, "vortex1");
    assert.equal(vortex.breakdown.reaction.damageElement, "Cryo");
});
