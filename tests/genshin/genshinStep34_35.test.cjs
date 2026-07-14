const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAudit } = require("../../scripts/genshinReactionAudit.cjs");
const { createBrowserScriptHarness, loadCalcData } = require("./helpers/browserScriptHarness.cjs");

function createHarness() {
    return createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
}

function context(reactionId, elementalMastery = 0) {
    return {
        characterId: "10000073",
        weaponId: "",
        refinement: 1,
        artifactSetMode: "none",
        artifactSetIds: [],
        constellation: 2,
        characterLevel: 90,
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        stats: { hp: 20000, atk: 2000, def: 1000, elementalMastery, critRate: 5, critDamage: 50, elementDamageBonus: 0 },
        enemy: { enemyResistance: 10, resistanceDebuff: 0, defenseDebuff: 0, defenseIgnore: 0 },
        manualInputs: { providerStats: {}, resourceStates: {} },
        uiState: { constellationConditions: { "C2": true } },
        reactionOptionKey: reactionId,
        mode: "manualMode"
    };
}

test("STEP35 resolves every reaction bonus target", () => {
    const audit = buildAudit();
    assert.equal(audit.summary.reactionBonus, 114);
    assert.equal(audit.summary.reactionCritBonus, 3);
    assert.equal(audit.summary.unresolved, 0);
});

test("STEP34 computes a level-90 transformative reaction independently from attack and defense", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const first = context("hyperbloom", 0);
    sandbox.GenshinCalcEngine.hydrateReactionContext(first, calcData);
    const result = sandbox.GenshinCalcEngine.buildStandaloneReactionResult(first, { applied: [], candidates: [] });
    assert.ok(result);
    assert.equal(result.breakdown.defenseMultiplier, 1);
    assert.equal(Math.round(result.nonCrit), Math.round(1446.853458 * 3 * 0.9));

    const second = context("hyperbloom", 0);
    second.stats.atk = 5000;
    second.enemy.enemyLevel = 120;
    sandbox.GenshinCalcEngine.hydrateReactionContext(second, calcData);
    const same = sandbox.GenshinCalcEngine.buildStandaloneReactionResult(second, { applied: [], candidates: [] });
    assert.equal(same.nonCrit, result.nonCrit);
});

test("Nahida C2 critical scopes are separated between standard bloom-family and lunar bloom", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const modifiers = calcData.constellationModifiers["10000073"].constellations["2"]
        .filter((modifier) => modifier.category === "reactionCritBonus");
    const standard = modifiers.find((modifier) => modifier.id.endsWith("resolved_1"));
    const lunar = modifiers.find((modifier) => modifier.id.endsWith("resolved_3"));
    assert.equal(sandbox.GenshinCalcEngine.reactionCritApplies(standard, { reactionId: "bloom", family: "transformative" }), true);
    assert.equal(sandbox.GenshinCalcEngine.reactionCritApplies(standard, { reactionId: "lunarBloom", family: "dedicated" }), false);
    assert.equal(sandbox.GenshinCalcEngine.reactionCritApplies(lunar, { reactionId: "bloom", family: "transformative" }), false);
    assert.equal(sandbox.GenshinCalcEngine.reactionCritApplies(lunar, { reactionId: "lunarBloom", family: "dedicated" }), true);
    assert.deepEqual([standard.critRate, standard.critDamage], [20, 100]);
    assert.deepEqual([lunar.critRate, lunar.critDamage], [10, 20]);
});

test("Mizuki C6 applies reaction critical stats only to Swirl", () => {
    const sandbox = createHarness();
    const modifier = loadCalcData().constellationModifiers["10000109"].constellations["6"][0];
    assert.equal(sandbox.GenshinCalcEngine.reactionCritApplies(modifier, { reactionId: "swirl", family: "transformative" }), true);
    assert.equal(sandbox.GenshinCalcEngine.reactionCritApplies(modifier, { reactionId: "bloom", family: "transformative" }), false);
});
