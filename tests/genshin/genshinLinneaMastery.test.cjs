"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { repositoryRoot } = require("./helpers/browserScriptHarness.cjs");
const { createScenarioHarness, prepareScenarioInputs } = require("./helpers/calcScenarioHarness.cjs");

const LINNEA = "10000130";
const ZIBAI = "10000126";
const NOELLE = "10000034";
const MASTERY_BONUS = "t_10000130_passive2_em";

function prepare(harness, characterId, mastery = 134) {
    const { elements, sandbox } = harness;
    prepareScenarioInputs(elements, { characterId, stats: { def: 2482.59, elementalMastery: mastery } });
    elements.genshinDefInput.value = "2483";
    elements.genshinDefInput.dataset = { valueOrigin: "uid", preciseValue: "2482.59" };
    elements.genshinElementalMasteryInput.dataset = { valueOrigin: "uid", preciseValue: String(mastery) };
    return sandbox.GenshinCalcEngine;
}

test("Linnea applies her DEF-to-EM passive once to imported EM and keeps manually entered effective EM", () => {
    const harness = createScenarioHarness();
    const { elements, calcData } = harness;
    const engine = prepare(harness, LINNEA);
    const imported = engine.buildCalculationRequestFromForm();
    assert.equal(imported.inputProvenance.fields.elementalMastery, "uid");
    assert.equal(imported.stats.def, 2482.59);
    assert.equal(imported.stats.elementalMastery, 134);
    for (const request of [imported, JSON.parse(JSON.stringify(imported))]) {
        const payload = engine.calculateDamageRequest(request, calcData);
        assert.equal(payload.context.effectiveStats.elementalMastery, 258.1295);
        const trace = payload.statTrace.filter((row) => row.modifierId === MASTERY_BONUS);
        assert.equal(trace.length, 1);
        assert.equal(trace[0].referenceValue, 2482.59);
        assert.ok(Math.abs(trace[0].value - 124.1295) < 1e-9);
        const hammer = payload.results.find((row) => row.entry.id === "100_damage");
        assert.equal(hammer.breakdown.inputStats.elementalMastery, 258.1295);
    }

    elements.genshinElementalMasteryInput.value = "258";
    delete elements.genshinElementalMasteryInput.dataset.preciseValue;
    harness.sandbox.GenshinInputProvenance.markById("genshinElementalMasteryInput", "manual");
    const manual = engine.calculateDamageRequest(engine.buildCalculationRequestFromForm(), calcData);
    assert.equal(manual.context.effectiveStats.elementalMastery, 258);
    assert.ok(manual.statTrace.every((row) => row.modifierId !== MASTERY_BONUS));
});

test("Linnea grants EM to the on-field Moonsign character, or to herself when a non-Moonsign character is on field", () => {
    const harness = createScenarioHarness();
    for (const [activeId, activeMastery, linneaMastery] of [[ZIBAI, 264.1295, 194], [NOELLE, 80, 258.1295]]) {
        const engine = prepare(harness, activeId, 80);
        harness.elements.genshinDefInput.dataset.preciseValue = "900.33";
        const request = engine.buildCalculationRequestFromForm();
        request.reactionOptionKey = "lunarCrystallize";
        request.party = { schemaVersion: 2, conditionStates: {}, members: [
            { slot: 1, characterId: activeId, enabled: true, level: 90, combatState: { onField: true } },
            {
                slot: 2, characterId: LINNEA, enabled: true, level: 90, combatState: { onField: false },
                stats: { def: 2482.59, elementalMastery: 134, critRate: 20, critDamage: 100 },
                provenance: { source: "mixed", fields: { elementalMastery: "uid" } }
            }
        ] };
        request.manualInputs.reactionContributors = [{ slot: 2, mode: "party", partySlot: 2, characterId: LINNEA, overrides: {} }];
        const payload = engine.calculateDamageRequest(request, harness.calcData);
        assert.equal(payload.context.effectiveStats.elementalMastery, activeMastery);
        const activeBonus = payload.statTrace.filter((row) => row.modifierId === MASTERY_BONUS);
        assert.equal(activeBonus.length, activeId === ZIBAI ? 1 : 0);
        if (activeBonus.length) assert.equal(activeBonus[0].referenceValue, 2482.59);
        const reaction = payload.results.find((row) => row.entry.id === "reaction_lunarCrystallize");
        const linnea = reaction.breakdown.reaction.contributors.find((row) => row.slot === 2);
        assert.equal(linnea.elementalMastery, linneaMastery);
        assert.equal(linnea.statTrace.filter((row) => row.modifierId === MASTERY_BONUS).length, activeId === NOELLE ? 1 : 0);
    }
});

test("Linnea shows automatic talent amounts in conditions and the exact EM in hammer details", () => {
    const harness = createScenarioHarness();
    const { elements, sandbox, calcData } = harness;
    const engine = prepare(harness, LINNEA);
    vm.runInContext(fs.readFileSync(path.join(repositoryRoot, "games/js/genshinCalcRenderer.js"), "utf8"), sandbox);
    elements.genshinJsonConditionCards = { innerHTML: "" };
    const request = engine.buildCalculationRequestFromForm();
    const panel = sandbox.GenshinCalcConditions.conditionPanelState(request, calcData);
    const renderer = sandbox.GenshinCalcRenderer;
    renderer.renderConditionCards(panel, request, calcData);
    const sections = panel.cards.find((card) => card.id === "talent").sections;
    for (const [name, amount] of [["博物分類図鑑", 124.1295], ["月兆の祝福・生息地研究", 14]]) {
        const section = sections.find((candidate) => candidate.nameJa === name);
        assert.equal(section.controls.length, 0);
        assert.equal(section.status, "auto");
        assert.equal(section.runtimeRows.length, 1, name);
        assert.ok(Math.abs(section.runtimeRows[0].value - amount) < 1e-9);
    }
    const payload = engine.calculateDamageRequest(request, calcData);
    const hammer = payload.results.find((row) => row.entry.id === "100_damage");
    const detail = renderer.renderDamageBreakdown({ ...hammer, breakdown: { ...hammer.breakdown, statTrace: payload.statTrace } });
    assert.match(detail, /元素熟知（計算値）.*258\.1295/s);
    assert.match(detail, /博物分類図鑑.*124\.1295/s);
    assert.match(detail, /月兆の祝福・生息地研究/);
});
