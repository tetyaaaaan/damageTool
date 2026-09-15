const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createBrowserScriptHarness, loadCalcData } = require("./helpers/browserScriptHarness.cjs");
const { createScenarioHarness, prepareScenarioInputs } = require("./helpers/calcScenarioHarness.cjs");

const ROOT = path.resolve(__dirname, "../..");

function context() {
    return {
        characterId: "10000031",
        constellation: 0,
        weaponId: "",
        refinement: 1,
        artifactSetIds: [],
        artifactSetMode: "",
        stats: { atk: 1000, baseAtk: 500, elementalMastery: 100 },
        effectiveStats: { atk: 1000, baseAtk: 500, elementalMastery: 100 },
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        uiState: { conditionByModifier: {}, complexConditionByModifier: {}, toggleByModifier: {}, stackByModifier: {} },
        manualInputs: { resourceStates: {}, providerStats: {} }
    };
}

test("Fischl Witch's Homework exposes locked-safe progression states and exact two reaction buffs", () => {
    const talents = JSON.parse(fs.readFileSync(path.join(ROOT, "games/genshin/data/character-talents.json"), "utf8"));
    const source = talents["10000031"].passives.find((item) => item.sourceId === "lockedPassive");
    assert.match(source.nameJa, /魔女からの贈り物/);
    assert.match(source.descriptionJa, /攻撃力\+22\.5%/);
    assert.match(source.descriptionJa, /元素熟知\+90/);
    assert.match(source.descriptionJa, /月感電/);

    const harness = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]);
    const calcData = loadCalcData();
    const modifiers = calcData.talentModifiers["10000031"].passives
        .find((item) => item.sourceId === "lockedPassive").modifiers;
    assert.equal(modifiers.length, 2);

    const values = [];
    for (const modifier of modifiers) {
        assert.equal(modifier.conditionInput.options[0].value, "locked");
        assert.equal(modifier.valueByCondition.locked, 0);
        assert.equal(modifier.valueByCondition.unlocked, 0);
        assert.equal(modifier.targetOwner, "activeCharacter");
        const ctx = context();
        const analysis = harness.sandbox.GenshinModifierAnalyzer.analyzeModifier({
            modifier,
            source: "talent:lockedPassive",
            context: ctx
        });
        ctx.uiState.conditionByModifier[analysis.conditionStateKey] = { option: "active", enabled: true };
        const value = harness.sandbox.GenshinCalcEngine.resolveModifierValue(modifier, ctx, ctx.uiState, analysis);
        values.push(value);
        const resolution = harness.sandbox.GenshinCalcEngine.buildEffectiveStats(ctx, {
            applied: [{ modifier, analysis, source: "talent:lockedPassive", value }]
        });
        if (modifier.applyTo.includes("atkPercent")) assert.equal(resolution.effectiveStats.atk, 1112.5);
        if (modifier.applyTo.includes("elementalMastery")) assert.equal(resolution.effectiveStats.elementalMastery, 190);

        ctx.uiState.conditionByModifier[analysis.conditionStateKey] = { option: "locked", enabled: true };
        assert.equal(harness.sandbox.GenshinCalcEngine.resolveModifierValue(modifier, ctx, ctx.uiState, analysis), 0);
    }
    assert.deepEqual(values.sort((a, b) => a - b), [22.5, 90]);

    const uiContext = context();
    const panel = harness.sandbox.GenshinCalcConditions.conditionPanelState(uiContext, calcData);
    assert.equal(panel.complexConditionInputs.length, 2);
    assert.ok(panel.complexConditionInputs.every((input) => input.value === "locked"));
    const talentCard = panel.cards.find((card) => card.id === "talent");
    assert.equal(talentCard.effects.filter((effect) => effect.modifier?.id?.startsWith("t_10000031_lockedPassive_")).length, 2);
});

test("Beidou Witch's Revelation shares one locked-safe C6 state for Cryo RES and active-character EM", () => {
    const constellations = JSON.parse(fs.readFileSync(path.join(ROOT, "games/genshin/data/character-constellations.json"), "utf8"));
    assert.match(constellations["10000024"].constellations["6"].effectText, /氷元素耐性-15%/);
    assert.match(constellations["10000024"].constellations["6"].effectText, /元素熟知\+200/);

    const harness = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]);
    const calcData = loadCalcData();
    const modifiers = calcData.constellationModifiers["10000024"].constellations["6"]
        .filter((modifier) => modifier.id.startsWith("c_10000024_6_lucid_"));
    assert.equal(modifiers.length, 2);
    assert.ok(modifiers.every((modifier) => modifier.conditionGroupId === "witch-revelation-beidou-c6"));
    assert.ok(modifiers.every((modifier) => modifier.conditionInput.options[0].value === "locked"));

    const ctx = { ...context(), characterId: "10000024", constellation: 6 };
    const analyses = modifiers.map((modifier) => harness.sandbox.GenshinModifierAnalyzer.analyzeModifier({
        modifier,
        source: "constellation:C6",
        context: ctx
    }));
    assert.equal(new Set(analyses.map((analysis) => analysis.conditionStateKey)).size, 1);
    const conditionKey = analyses[0].conditionStateKey;
    ctx.uiState.conditionByModifier[conditionKey] = { option: "active", enabled: true };
    const values = modifiers.map((modifier, index) => harness.sandbox.GenshinCalcEngine.resolveModifierValue(
        modifier,
        ctx,
        ctx.uiState,
        analyses[index]
    ));
    assert.deepEqual(values.sort((a, b) => a - b), [-15, 200]);

    const emIndex = modifiers.findIndex((modifier) => modifier.id.endsWith("active_em"));
    const resolution = harness.sandbox.GenshinCalcEngine.buildEffectiveStats(ctx, {
        applied: [{
            modifier: modifiers[emIndex],
            analysis: analyses[emIndex],
            source: "constellation:C6",
            value: 200
        }]
    });
    assert.equal(resolution.effectiveStats.elementalMastery, 300);

    const panel = harness.sandbox.GenshinCalcConditions.conditionPanelState(ctx, calcData);
    const lucidInputs = panel.complexConditionInputs.filter((input) => input.conditionGroupId === "witch-revelation-beidou-c6");
    assert.equal(lucidInputs.length, 1);
    assert.equal(lucidInputs[0].value, "locked");
});

test("progression buffs use the existing party option route without applying while locked", () => {
    const { sandbox, elements, calcData } = createScenarioHarness();
    prepareScenarioInputs(elements, {
        characterId: "10000037",
        stats: { atk: 1000, baseAtk: 500, elementalMastery: 100 }
    });
    const request = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    request.party = {
        schemaVersion: 1,
        focusSlot: 1,
        members: [
            { slot: 1, role: "main", enabled: true, characterId: "10000037" },
            {
                slot: 2,
                role: "support",
                enabled: true,
                characterId: "10000031",
                constellation: 0,
                talentLevels: { normal: 10, skill: 10, burst: 10 },
                buffStates: {}
            }
        ]
    };

    const locked = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const fischlBuff = locked.partyModifiers.find((candidate) => candidate.modifier.id === "t_10000031_lockedPassive_electrocharged_em");
    assert.ok(fischlBuff);
    assert.notEqual(fischlBuff.status, "ready");
    assert.equal(locked.context.effectiveStats.elementalMastery, 100);

    request.party.conditionStates = {
        [fischlBuff.analysis.conditionStateKey]: { option: "active" }
    };
    request.party.members[1].buffStates[fischlBuff.toggleKey] = true;
    const active = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    assert.equal(active.context.effectiveStats.elementalMastery, 190);
    assert.equal(active.statTrace.filter((item) => item.modifierId === fischlBuff.modifier.id).length, 1);
});

test("Sucrose small Wind Spirit uses the locked-safe team route and leaves the Hexerei-only large buff held", () => {
    const talents = JSON.parse(fs.readFileSync(path.join(ROOT, "games/genshin/data/character-talents.json"), "utf8"));
    const source = talents["10000043"].passives.find((item) => item.sourceId === "lockedPassive");
    assert.match(source.descriptionJa, /小型風霊.*5\.71428%/);
    assert.match(source.descriptionJa, /大型風霊.*7\.14285%/);

    const { sandbox, elements, calcData } = createScenarioHarness();
    prepareScenarioInputs(elements, { characterId: "10000037", stats: { atk: 1000, baseAtk: 500 } });
    const request = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    request.party = {
        schemaVersion: 1,
        focusSlot: 1,
        members: [
            { slot: 1, role: "main", enabled: true, characterId: "10000037" },
            {
                slot: 2,
                role: "support",
                enabled: true,
                characterId: "10000043",
                constellation: 0,
                talentLevels: { normal: 10, skill: 10, burst: 10 },
                buffStates: {}
            }
        ]
    };

    const locked = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const candidate = locked.partyModifiers.find((item) => item.modifier.id === "t_10000043_lockedPassive_small_wind_spirit_damage");
    assert.ok(candidate);
    assert.notEqual(candidate.status, "ready");
    assert.equal(calcData.talentModifiers["10000043"].passives
        .find((item) => item.sourceId === "lockedPassive").modifiers.length, 1);

    request.party.conditionStates = { [candidate.analysis.conditionStateKey]: { option: "active" } };
    request.party.members[1].buffStates[candidate.toggleKey] = true;
    const active = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const applied = active.results[0].breakdown.appliedModifiers
        .filter((item) => item.modifier.id === candidate.modifier.id);
    assert.equal(applied.length, 1);
    assert.equal(applied[0].value, 5.71428);
    assert.ok(active.results[0].expected > locked.results[0].expected);
});
