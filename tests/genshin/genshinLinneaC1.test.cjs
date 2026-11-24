"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createScenarioHarness, prepareScenarioInputs } = require("./helpers/calcScenarioHarness.cjs");

const LINNEA = "10000130";
const REACTION_BONUS = "c_10000130_1_2";
const HAMMER_BONUS = "c_10000130_1_3";
const LITERATURE = `character:${LINNEA}:resource:literatureResearch`;

test("Linnea C1 uses exact DEF and caps the megaton hammer at five stacks", () => {
    const { sandbox, elements, calcData } = createScenarioHarness();
    const engine = sandbox.GenshinCalcEngine;
    prepareScenarioInputs(elements, { characterId: LINNEA, constellation: 3, stats: { def: 2482.59 } });
    elements.genshinDefInput.value = "2483";
    elements.genshinDefInput.dataset = { preciseValue: "2482.59" };
    const request = engine.buildCalculationRequestFromForm();
    assert.equal(request.manualInputs.providerStats.def, null);
    request.manualInputs.resourceStates[LITERATURE] = 0;
    const panel = sandbox.GenshinCalcConditions.conditionPanelState(request, calcData);
    assert.equal(panel.dedicatedReferenceInputs.providerDef, false);
    for (const id of [REACTION_BONUS, HAMMER_BONUS]) request.uiState.conditionByModifier[`constellation:C1:${id}`].enabled = true;

    for (const [stacks, expected] of [[0, 0], [1, 3723.885], [4, 14895.54], [5, 18619.425], [6, 18619.425]]) {
        request.manualInputs.resourceStates[LITERATURE] = stacks;
        const payload = engine.calculateDamageRequest(request, calcData);
        const megaton = payload.results.find((row) => row.entry.id === "100_damage");
        const power = payload.results.find((row) => row.entry.group === "skill" && row.entry.id === "damage_2");

        assert.equal(megaton.breakdown.inputStats.def, 2482.59);
        assert.equal(megaton.breakdown.additiveBaseDamage, expected, `${stacks} stacks`);
        assert.equal(megaton.breakdown.reactionAdditiveBaseDamage, 0);
        assert.equal(power.breakdown.additiveBaseDamage, 0);
        assert.equal(power.breakdown.reactionAdditiveBaseDamage, stacks ? 1861.9425 : 0);
        assert.ok(!payload.inputNotices.some((notice) => [REACTION_BONUS, HAMMER_BONUS].includes(notice.id)));
    }
});

test("a teammate's Lunar Crystallize uses Linnea's DEF and consumes only one stack", () => {
    const { sandbox, elements, calcData } = createScenarioHarness();
    const engine = sandbox.GenshinCalcEngine;
    const attacker = "10000126";
    prepareScenarioInputs(elements, { characterId: attacker, stats: { def: 900.33 } });
    elements.genshinJsonReactionOption.value = "lunarCrystallize";
    const request = engine.buildCalculationRequestFromForm();
    const key = `party:2:${LINNEA}:constellation:1:${REACTION_BONUS}`;
    const provider = { slot: 2, enabled: true, characterId: LINNEA, constellation: 3, level: 90, stats: {} };
    request.party = { schemaVersion: 2, members: [{ slot: 1, enabled: true, characterId: attacker }, provider], conditionStates: {} };

    for (const [stacks, providerDef, expected] of [[0, 2482.59, 0], [1, 2482.59, 1861.9425], [6, 2482.59, 1861.9425], [6, 3000.25, 2250.1875]]) {
        request.party.conditionStates[key] = { stack: stacks };
        provider.stats.def = providerDef;
        const payload = engine.calculateDamageRequest(request, calcData);
        const reaction = payload.results.find((row) => row.entry.id === "reaction_lunarCrystallize");
        const burst = payload.results.find((row) => row.entry.group === "burst" && row.entry.id === "skillnormal_2damage");
        assert.equal(reaction.breakdown.reactionAdditiveBaseDamage, expected);
        assert.equal(burst.breakdown.reactionAdditiveBaseDamage, expected);
        assert.ok(payload.partyModifiers.every((candidate) => candidate.modifier.id !== HAMMER_BONUS));
    }
});
