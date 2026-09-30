"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { createScenarioHarness, prepareScenarioInputs } = require("./helpers/calcScenarioHarness.cjs");

const root = path.resolve(__dirname, "../..");
const provisionalPath = "games/genshin/data/v2/candidates/7.0-provisional-characters.json";
const stellarPath = "games/genshin/data/v2/candidates/7.0-provisional-stellar-swirl.json";
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));

function loaderApi() {
    const sandbox = { window: {}, console, fetch: async () => { throw new Error("fetch is not used"); } };
    vm.createContext(sandbox);
    ["genshinDataContract.js", "genshinCalcData.js"].forEach((name) => {
        vm.runInContext(fs.readFileSync(path.join(root, "games/js", name), "utf8"), sandbox, { filename: name });
    });
    return sandbox.window.GenshinCalcData;
}

function scenario(constellation) {
    const fixture = createScenarioHarness();
    loaderApi().applyProvisional70Data(fixture.calcData, [readJson(provisionalPath), readJson(stellarPath)], []);
    prepareScenarioInputs(fixture.elements, {
        characterId: "10000037",
        stats: { baseAtk: 1000, atk: 2000, elementalMastery: 100, critRate: 0, critDamage: 0 }
    });
    const request = fixture.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    request.party = {
        schemaVersion: 2,
        focusSlot: 1,
        conditionStates: {},
        members: [
            { slot: 1, role: "main", enabled: true, characterId: "10000037" },
            {
                slot: 2,
                role: "support",
                enabled: true,
                characterId: "10000148",
                nameJa: "アリョーシャ",
                constellation,
                talentLevels: { normal: 10, skill: 10, burst: 10 },
                buffStates: {},
                stats: {}
            }
        ]
    };
    return { ...fixture, request };
}

function reactionTotals(sandbox, calcData, context, reactionId = "stellarConduct") {
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context);
    return sandbox.GenshinCalcEngine.applyModifiersToDamageEntry({
        id: `fixture-${reactionId}`,
        attackType: "reaction",
        damageType: "reaction",
        group: "reaction",
        element: "氷",
        directReactionId: reactionId,
        scalings: []
    }, context, collected).totals;
}

function activateHunterPrecision(fixture, stack) {
    const before = fixture.sandbox.GenshinCalcEngine.calculateDamageRequest(fixture.request, fixture.calcData);
    const candidates = before.partyModifiers.filter((candidate) => String(candidate.modifier?.id).includes("10000148"));
    const atk = candidates.find((candidate) => candidate.modifier.id === "provisional70_10000148_modifier_hunter_precision_atk");
    assert.ok(atk);
    fixture.request.party.conditionStates[atk.partyConditionStateKey] = { stack };
    fixture.request.party.members[1].buffStates[atk.toggleKey] = true;
    return {
        before,
        after: fixture.sandbox.GenshinCalcEngine.calculateDamageRequest(fixture.request, fixture.calcData),
        stateKey: atk.partyConditionStateKey,
        toggleKey: atk.toggleKey
    };
}

test("Alyosha provisional attacks, skill, and burst all reach real damage", () => {
    const { sandbox, elements, calcData } = createScenarioHarness();
    loaderApi().applyProvisional70Data(calcData, [readJson(provisionalPath), readJson(stellarPath)], []);
    prepareScenarioInputs(elements, { characterId: "10000148", stats: { atk: 2000, critRate: 0, critDamage: 0 } });
    const payload = sandbox.GenshinCalcEngine.calculateDamageRequest(
        sandbox.GenshinCalcEngine.buildCalculationRequestFromForm(), calcData
    );

    assert.ok(payload.results.some((item) => item.entry.group === "normalAttack" && item.nonCrit > 0));
    assert.ok(payload.results.some((item) => item.entry.group === "skill" && item.nonCrit > 0));
    assert.ok(payload.results.some((item) => item.entry.group === "burst" && item.nonCrit > 0));
});

test("Alyosha keeps correct talent UI sources and treats C3/C5 as reflected talent-level inputs", () => {
    const { sandbox, elements, calcData } = createScenarioHarness();
    loaderApi().applyProvisional70Data(calcData, [readJson(provisionalPath), readJson(stellarPath)], []);
    assert.deepEqual(
        JSON.parse(JSON.stringify(calcData.talentModifiers["10000148"].passives.map((passive) => passive.modifiers[0].sourceTalent))),
        ["combat2", "passive2", "passive3"]
    );
    const talentContext = { characterId: "10000148" };
    const uiNames = calcData.talentModifiers["10000148"].passives.map((passive) => (
        sandbox.GenshinCalcConditions.talentSourceMeta(
            `talent:${passive.sourceId}`, talentContext, calcData, passive.modifiers[0]
        ).nameJa
    ));
    assert.equal(uiNames[0], calcData.characterTalents["10000148"].skill.nameJa);
    assert.equal(uiNames[1], calcData.characterTalents["10000148"].passives[1].nameJa);
    assert.equal(uiNames[2], calcData.characterTalents["10000148"].passives[2].nameJa);

    prepareScenarioInputs(elements, { characterId: "10000148", constellation: 6, stats: { atk: 2000, critRate: 0, critDamage: 0 } });
    const level10 = sandbox.GenshinCalcEngine.calculateDamageRequest(
        sandbox.GenshinCalcEngine.buildCalculationRequestFromForm(), calcData
    );
    const reflected = level10.candidateModifiers.filter((item) => [
        "provisional70_10000148_c3_skill_level",
        "provisional70_10000148_c5_burst_level"
    ].includes(item.modifier?.id));
    assert.equal(reflected.length, 2);
    assert.ok(reflected.every((item) => item.analysis.inputStatus === "includedInInput"));

    elements.genshinSkillTalentLevel.value = 13;
    elements.genshinBurstTalentLevel.value = 13;
    const level13 = sandbox.GenshinCalcEngine.calculateDamageRequest(
        sandbox.GenshinCalcEngine.buildCalculationRequestFromForm(), calcData
    );
    assert.ok(
        level13.results.find((item) => item.entry.group === "skill").nonCrit
            > level10.results.find((item) => item.entry.group === "skill").nonCrit
    );
    assert.ok(
        level13.results.find((item) => item.entry.group === "burst").nonCrit
            > level10.results.find((item) => item.entry.group === "burst").nonCrit
    );
});

test("Alyosha's own condition UI state reaches the shared Hunter Precision effects", () => {
    const { sandbox, elements, calcData } = createScenarioHarness();
    loaderApi().applyProvisional70Data(calcData, [readJson(provisionalPath), readJson(stellarPath)], []);
    prepareScenarioInputs(elements, {
        characterId: "10000148",
        stats: { baseAtk: 1000, atk: 2000, elementalMastery: 100, critRate: 0, critDamage: 0 }
    });
    const request = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    const off = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const stateKey = "character:10000148:group:provisional70_10000148_condition_hunter_precision";
    request.uiState.complexConditionByModifier[stateKey] = { stack: 1 };
    const on = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);

    assert.equal(on.context.uiState.resolvedConditionByGroup.provisional70_10000148_condition_hunter_precision, 1);
    assert.equal(on.context.effectiveStats.atk, 2212);
    assert.ok(on.results[0].nonCrit > off.results[0].nonCrit);
    assert.equal(reactionTotals(sandbox, calcData, on.context).reactionBonus, 20);
});

test("Alyosha C0 shares one Hunter Precision input and applies 21.2% ATK plus 20% Stellar Conduct", () => {
    const fixture = scenario(0);
    const { before, after, stateKey, toggleKey } = activateHunterPrecision(fixture, 1);
    const hunterCandidates = after.partyModifiers.filter((candidate) => candidate.modifier.conditionGroupId === "provisional70_10000148_condition_hunter_precision");

    assert.equal(new Set(hunterCandidates.map((candidate) => candidate.partyConditionStateKey)).size, 1);
    assert.equal(new Set(hunterCandidates.map((candidate) => candidate.toggleKey)).size, 1);
    assert.equal(stateKey, toggleKey);
    assert.equal(after.context.uiState.conditionByModifier[stateKey].stack, 1);
    assert.equal(after.context.effectiveStats.atk, 2212);
    assert.ok(after.results[0].nonCrit > before.results[0].nonCrit);
    assert.equal(reactionTotals(fixture.sandbox, fixture.calcData, after.context).reactionBonus, 20);
});

test("Alyosha clamps C0 to one stack and C6 stack two applies doubled ATK, +100 EM, and 40% Stellar Conduct", () => {
    const c0 = scenario(0);
    const c0Result = activateHunterPrecision(c0, 2).after;
    const c0Atk = c0Result.partyModifiers.find((candidate) => candidate.modifier.id === "provisional70_10000148_modifier_hunter_precision_atk");
    assert.equal(c0Atk.modifier.stack.max, 1);
    assert.equal(c0Atk.resolvedValue, 21.2);
    assert.equal(c0Result.context.effectiveStats.atk, 2212);

    const c6 = scenario(6);
    const c6Result = activateHunterPrecision(c6, 2).after;
    const c6Candidates = c6Result.partyModifiers.filter((candidate) => candidate.modifier.conditionGroupId === "provisional70_10000148_condition_hunter_precision");
    assert.equal(c6Result.context.effectiveStats.atk, 2424);
    assert.equal(c6Result.context.effectiveStats.elementalMastery, 200);
    assert.equal(reactionTotals(c6.sandbox, c6.calcData, c6Result.context).reactionBonus, 40);
    assert.ok(c6Candidates.every((candidate) => candidate.partyConditionStateKey === c6Candidates[0].partyConditionStateKey));

    const ordinary = c6Result.results.find((item) => !item.entry.directReactionId);
    assert.equal(ordinary.breakdown.reactionBonus, 0);
});
