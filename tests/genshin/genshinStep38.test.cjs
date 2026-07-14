const test = require("node:test");
const assert = require("node:assert/strict");
const { createBrowserScriptHarness, loadCalcData } = require("./helpers/browserScriptHarness.cjs");

function harness() {
    return createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
}

function context(characterId, reactionId) {
    return {
        characterId,
        weaponId: "",
        refinement: 1,
        artifactSetMode: "none",
        artifactSetIds: [],
        constellation: 0,
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        stats: { hp: 30000, atk: 2000, def: 1000, elementalMastery: 0, critRate: 0, critDamage: 50, energyRecharge: 100, elementDamageBonus: 150 },
        enemy: { characterLevel: 90, enemyLevel: 120, enemyResistance: 10, resistanceDebuff: 0, defenseDebuff: 80, defenseIgnore: 80 },
        manualInputs: { providerStats: {}, resourceStates: {}, reactionContributors: [], stellarConductStacks: 0 },
        uiState: { stackByModifier: {}, conditionByModifier: {}, toggleByModifier: {}, complexConditionByModifier: {}, constellationConditions: {} },
        reactionOptionKey: reactionId,
        mode: "manualMode"
    };
}

test("STEP38 computes indirect Lunar-Charged without attack, damage bonus, or enemy DEF", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const first = context("10000073", "lunarCharged");
    sandbox.GenshinCalcEngine.hydrateReactionContext(first, calcData);
    const result = sandbox.GenshinCalcEngine.buildStandaloneReactionResult(first, { applied: [], candidates: [] });
    assert.ok(result);
    assert.equal(result.breakdown.defenseMultiplier, 1);
    assert.equal(Math.round(result.nonCrit), Math.round(1.8 * 1446.853458 * 0.9));

    const changed = context("10000073", "lunarCharged");
    changed.stats.atk = 9000;
    changed.stats.elementDamageBonus = 500;
    changed.enemy.enemyLevel = 200;
    sandbox.GenshinCalcEngine.hydrateReactionContext(changed, calcData);
    const same = sandbox.GenshinCalcEngine.buildStandaloneReactionResult(changed, { applied: [], candidates: [] });
    assert.equal(same.nonCrit, result.nonCrit);
});

test("STEP38 ranks multiple Lunar contributors and enumerates critical expectation", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const ctx = context("10000073", "lunarCrystallize");
    ctx.manualInputs.reactionContributors = [{
        slot: 2,
        level: 90,
        elementalMastery: 0,
        critRate: 100,
        critDamage: 100,
        reactionBonus: 0,
        baseDamageBonus: 0
    }];
    sandbox.GenshinCalcEngine.hydrateReactionContext(ctx, calcData);
    const result = sandbox.GenshinCalcEngine.buildStandaloneReactionResult(ctx, { applied: [], candidates: [] });
    const one = 0.96 * 1446.853458 * 0.9;
    assert.equal(Math.round(result.nonCrit), Math.round(one * 1.5));
    assert.equal(Math.round(result.expected), Math.round(one * 2 + one * 0.5));
    assert.equal(result.breakdown.reaction.contributors.length, 2);
});

test("STEP38 does not invent standalone Lunar-Bloom or Stellar-Conduct damage", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    for (const reactionId of ["lunarBloom", "stellarConduct"]) {
        const ctx = context("10000073", reactionId);
        sandbox.GenshinCalcEngine.hydrateReactionContext(ctx, calcData);
        assert.equal(sandbox.GenshinCalcEngine.buildStandaloneReactionResult(ctx, { applied: [], candidates: [] }), null);
    }
});

test("STEP38 applies the direct Stellar-Conduct formula and Sandrone base damage blessing", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const ctx = context("10000133", "stellarConduct");
    sandbox.GenshinCalcEngine.hydrateReactionContext(ctx, calcData);
    const entries = sandbox.GenshinCalcEngine.collectTalentDamageEntries(calcData, ctx).entries;
    const entry = entries.find((item) => item.group === "normalAttack" && item.id === "charged_damage_3");
    assert.equal(entry.directReactionId, "stellarConduct");
    assert.equal(entry.element, "氷");
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, ctx);
    const modifiers = sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(entry, ctx, collected);
    const result = sandbox.GenshinCalcEngine.calculateDamage(entry, ctx, modifiers);
    const expected = 2000 * 1.615 * 1.4 * 1.14 * 0.9;
    assert.equal(Math.round(result.nonCrit), Math.round(expected));
    assert.equal(result.breakdown.reactionBaseDamageBonus, 14);
    assert.equal(result.breakdown.defenseMultiplier, 1);

    ctx.manualInputs.stellarConductStacks = 12;
    const maxResult = sandbox.GenshinCalcEngine.calculateDamage(entry, ctx, modifiers);
    assert.equal(Math.round(maxResult.nonCrit / result.nonCrit * 1000) / 1000, Math.round(2 / 1.4 * 1000) / 1000);
});

test("STEP38 applies direct Lunar-Charged coefficient to Columbina's reaction talent", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const ctx = context("10000125", "lunarCharged");
    sandbox.GenshinCalcEngine.hydrateReactionContext(ctx, calcData);
    const entry = sandbox.GenshinCalcEngine.collectTalentDamageEntries(calcData, ctx).entries
        .find((item) => item.group === "skill" && item.id === "damage_2");
    assert.equal(entry.directReactionId, "lunarCharged");
    assert.equal(entry.element, "雷");
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, ctx);
    const modifiers = sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(entry, ctx, collected);
    const result = sandbox.GenshinCalcEngine.calculateDamage(entry, ctx, modifiers);
    const expected = 30000 * 0.084672 * 3 * 1.06 * 0.9;
    assert.equal(Math.round(result.nonCrit), Math.round(expected));
    assert.equal(result.breakdown.reactionBaseDamageBonus, 6);
});

test("STEP38 structures all current Moonsign and Stellar base damage blessings", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const cases = [
        ["10000116", "lunarCharged", { atk: 2000 }, 14],
        ["10000119", "lunarBloom", { elementalMastery: 800 }, 14],
        ["10000120", "lunarCharged", { atk: 2000 }, 14],
        ["10000122", "lunarBloom", { elementalMastery: 800 }, 14],
        ["10000125", "lunarBloom", { hp: 30000 }, 6],
        ["10000126", "lunarCrystallize", { def: 1000 }, 7],
        ["10000130", "lunarCrystallize", { def: 1000 }, 7],
        ["10000133", "stellarConduct", { atk: 2000 }, 14]
    ];
    cases.forEach(([characterId, reactionId, stats, expected]) => {
        const ctx = context(characterId, reactionId);
        Object.assign(ctx.stats, stats);
        sandbox.GenshinCalcEngine.hydrateReactionContext(ctx, calcData);
        const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, ctx);
        const blessing = collected.applied.find((item) => item.modifier.category === "reactionBaseDamageBonus");
        assert.ok(blessing, `${characterId} blessing`);
        assert.equal(blessing.value, expected, characterId);
    });
});

test("STEP38 renders contributor inputs and Stellar-Conduct field stacks in the reaction card", () => {
    const conditionWrap = { innerHTML: "" };
    const { sandbox } = createBrowserScriptHarness([
        "games/js/genshinCalcRenderer.js"
    ], { genshinJsonConditionCards: conditionWrap });
    const calcData = loadCalcData();
    const lunar = context("10000073", "lunarCharged");
    lunar.reactionOption = {
        ...calcData.reactionDefinitions.options.lunarCharged,
        label: "月感電",
        enabled: true
    };
    sandbox.GenshinCalcRenderer.renderConditionCards({ cards: [] }, lunar);
    assert.match(conditionWrap.innerHTML, /参加者1：/);
    assert.match(conditionWrap.innerHTML, /genshinReactionContributor2Level/);
    assert.match(conditionWrap.innerHTML, /genshinReactionContributor4BaseBonus/);

    const stellar = context("10000133", "stellarConduct");
    stellar.reactionOption = {
        ...calcData.reactionDefinitions.options.stellarConduct,
        label: "星電導",
        enabled: true
    };
    stellar.manualInputs.stellarConductStacks = 12;
    sandbox.GenshinCalcRenderer.renderConditionCards({ cards: [] }, stellar);
    assert.match(conditionWrap.innerHTML, /genshinStellarConductStacks/);
    assert.match(conditionWrap.innerHTML, /12回（係数 2\.00）/);
    assert.match(conditionWrap.innerHTML, /value="12" selected/);
});
