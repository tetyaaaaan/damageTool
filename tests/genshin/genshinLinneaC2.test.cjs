"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createScenarioHarness, prepareScenarioInputs, setElement } = require("./helpers/calcScenarioHarness.cjs");

const LINNEA = "10000130";
const RESONANCE = "c_10000130_2_1";
const MEGATON = "c_10000130_2_2";

const ATTACKS = [
    ["normalAttack", "normal_1damage"],
    ["skill", "damage"],
    ["skill", "damage_2"],
    ["skill", "100_damage"]
];

test("Linnea C2 adds 150 points only to the megaton hammer, independently of the resonance bonus", () => {
    const { sandbox, elements, calcData } = createScenarioHarness();
    const engine = sandbox.GenshinCalcEngine;
    prepareScenarioInputs(elements, {
        characterId: LINNEA,
        constellation: 3,
        weaponId: "15516",
        stats: { hp: 17431, atk: 996, def: 2482.59, elementalMastery: 134, critRate: 90.29, critDamage: 222.11, elementDamageBonus: 0 }
    });
    setElement(elements, "genshinSkillTalentLevel", 13);
    setElement(elements, "genshinArtifactSetMode", "4pc");
    setElement(elements, "genshinArtifactSetOne", "15043");
    setElement(elements, "genshinEnemyPhysicalResistanceInput", -20);
    sandbox.GenshinEnemySelector = { getSelectedEnemy: () => calcData.enemies.presets.find((enemy) => enemy.id === "masanori") };

    const request = engine.buildCalculationRequestFromForm();
    sandbox.GenshinCalcConditions.conditionPanelState(request, calcData);
    const conditions = request.uiState.conditionByModifier;
    for (const state of Object.values(conditions)) state.enabled = false;
    const megatonState = conditions[`constellation:C2:${MEGATON}`];
    const resonanceState = conditions[`constellation:C2:${RESONANCE}`];

    function calculate(megatonEnabled, resonanceEnabled) {
        megatonState.enabled = megatonEnabled;
        resonanceState.enabled = resonanceEnabled;
        const { results } = engine.calculateDamageRequest(request, calcData);
        return ATTACKS.map(([group, id]) => {
            const row = results.find((item) => item.entry.group === group && item.entry.id === id);
            assert.ok(row, `${group}:${id}`);
            assert.ok(row.breakdown.critRate > 0);
            return { nonCrit: row.nonCrit, crit: row.crit, expected: row.expected, critDamage: row.breakdown.critDamage };
        });
    }

    const off = calculate(false, false);
    const hammerOnly = calculate(true, false);
    const resonanceOnly = calculate(false, true);
    const both = calculate(true, true);

    off.forEach((row, index) => {
        const hammerDelta = ATTACKS[index][1] === "100_damage" ? 150 : 0;
        for (const [result, delta] of [[hammerOnly[index], hammerDelta], [resonanceOnly[index], 40], [both[index], 40 + hammerDelta]]) {
            assert.equal(result.nonCrit, row.nonCrit);
            assert.equal(result.critDamage, row.critDamage + delta);
            if (delta === 0) {
                assert.deepEqual(result, row);
            } else {
                assert.ok(result.crit > row.crit);
                assert.ok(result.expected > row.expected);
            }
        }
    });
});

test("Linnea's eight-second resonance bonus applies to Hydro and Geo teammates", () => {
    const { sandbox, elements, calcData } = createScenarioHarness();
    const engine = sandbox.GenshinCalcEngine;
    for (const [characterId, delta] of [["10000025", 40], ["10000038", 40], ["10000021", 0]]) {
        prepareScenarioInputs(elements, { characterId });
        const request = engine.buildCalculationRequestFromForm();
        const linnea = { slot: 2, role: "support", enabled: true, characterId: LINNEA, constellation: 2, buffStates: {} };
        request.party = { schemaVersion: 2, members: [{ slot: 1, role: "main", enabled: true, characterId }, linnea] };
        const off = engine.calculateDamageRequest(request, calcData);
        const resonance = off.partyModifiers.find((candidate) => candidate.modifier.id === RESONANCE);
        assert.equal(resonance.modifier.condition, "afterLunarResonance");
        assert.equal(resonance.modifier.duration, 8);
        assert.ok(off.partyModifiers.every((candidate) => candidate.modifier.id !== MEGATON));
        linnea.buffStates[resonance.toggleKey] = true;
        const on = engine.calculateDamageRequest(request, calcData);
        assert.equal(on.results[0].breakdown.critDamage, off.results[0].breakdown.critDamage + delta, characterId);
    }
});
