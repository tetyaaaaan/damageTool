const test = require("node:test");
const assert = require("node:assert/strict");
const { BOW_CHARACTERS, CHARGED_DERIVED_ENTRIES } = require("../../scripts/syncGenshinBowChargedAttacks.cjs");
const { createBrowserScriptHarness, loadCalcData } = require("./helpers/browserScriptHarness.cjs");

function harness() {
    return createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
}

function context(characterId) {
    return {
        characterId,
        weaponId: "",
        refinement: 1,
        artifactSetMode: "none",
        artifactSetIds: [],
        constellation: 0,
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        stats: {
            hp: 30000,
            atk: 2000,
            def: 1000,
            elementalMastery: 0,
            critRate: 5,
            critDamage: 50,
            energyRecharge: 100,
            elementDamageBonus: 0
        },
        enemy: {
            characterLevel: 90,
            enemyLevel: 90,
            resistance: {
                base: { defaultElemental: 10, physical: 10, byElement: {} },
                manualDebuff: { allElemental: 0, physical: 0, byElement: {} }
            },
            defenseReduction: 0,
            defenseIgnore: 0
        },
        manualInputs: { providerStats: {}, resourceStates: {}, reactionContributors: [] },
        uiState: {
            stackByModifier: {},
            conditionByModifier: {},
            toggleByModifier: {},
            complexConditionByModifier: {},
            constellationConditions: {}
        },
        reactionOptionKey: "none",
        mode: "manualMode"
    };
}

test("every bow character has physical aimed and elemental fully-charged entries", () => {
    const calcData = loadCalcData();
    const actualBowIds = Object.entries(calcData.characters)
        .filter(([, character]) => character.weaponType === "弓")
        .map(([characterId]) => characterId)
        .sort();
    assert.deepEqual(actualBowIds, Object.keys(BOW_CHARACTERS).sort());

    actualBowIds.forEach((characterId) => {
        const entries = calcData.talentScalings[characterId].normalAttack.entries;
        const aimed = entries.find((entry) => entry.id === "aimed_shot");
        const fullyCharged = entries.find((entry) => entry.id === "fully_charged_aimed_shot");
        assert.equal(aimed?.attackType, "chargedAttack", `${characterId}: aimed attack type`);
        assert.equal(aimed?.element, "physical", `${characterId}: aimed element`);
        assert.equal(aimed?.chargedAttackStage, "aimed", `${characterId}: aimed stage`);
        assert.equal(Object.keys(aimed?.scalings?.[0]?.valuesByLevel || {}).length, 15, `${characterId}: aimed levels`);
        assert.equal(fullyCharged?.attackType, "chargedAttack", `${characterId}: full-charge attack type`);
        assert.equal(fullyCharged?.element, "ownElement", `${characterId}: full-charge element`);
        assert.equal(fullyCharged?.chargedAttackStage, "fullyCharged", `${characterId}: full-charge stage`);
        assert.equal(Object.keys(fullyCharged?.scalings?.[0]?.valuesByLevel || {}).length, 15, `${characterId}: full-charge levels`);
    });
});

test("character-specific bow charged damage is not left as normal attack damage", () => {
    const calcData = loadCalcData();
    Object.entries(CHARGED_DERIVED_ENTRIES).forEach(([characterId, entryIds]) => {
        const entries = calcData.talentScalings[characterId].normalAttack.entries;
        entryIds.forEach((entryId) => {
            const entry = entries.find((candidate) => candidate.id === entryId);
            assert.equal(entry?.attackType, "chargedAttack", `${characterId}.${entryId}`);
            assert.equal(entry?.damageType, "charged", `${characterId}.${entryId}`);
            assert.equal(entry?.element, "ownElement", `${characterId}.${entryId}`);
            assert.equal(entry?.chargedAttackStage, "derived", `${characterId}.${entryId}`);
        });
    });
});

test("the engine calculates both bow aim stages for all bow characters", () => {
    const calcData = loadCalcData();
    const engine = harness().GenshinCalcEngine;
    Object.keys(BOW_CHARACTERS).forEach((characterId) => {
        const ctx = context(characterId);
        const entries = engine.collectTalentDamageEntries(calcData, ctx).entries;
        const aimed = entries.find((entry) => entry.id === "aimed_shot");
        const fullyCharged = entries.find((entry) => entry.id === "fully_charged_aimed_shot");
        assert.equal(aimed?.element, "physical", `${characterId}: normalized aimed element`);
        assert.equal(fullyCharged?.element, calcData.characters[characterId].element, `${characterId}: normalized full-charge element`);
        [aimed, fullyCharged].forEach((entry) => {
            const collected = engine.collectActiveModifiers(calcData, ctx);
            const modifiers = engine.applyModifiersToDamageEntry(entry, ctx, collected);
            const result = engine.calculateDamage(entry, ctx, modifiers);
            assert.equal(result.problems.length, 0, `${characterId}.${entry.id}: calculation problems`);
            assert.ok(Number.isFinite(result.nonCrit) && result.nonCrit > 0, `${characterId}.${entry.id}: calculated damage`);
        });
    });
});
