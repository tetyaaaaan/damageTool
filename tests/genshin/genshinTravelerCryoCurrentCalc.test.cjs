"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { createScenarioHarness, prepareScenarioInputs, setConditionElement, setElement } = require("./helpers/calcScenarioHarness.cjs");

const root = path.resolve(__dirname, "../..");
const candidatePath = "games/genshin/data/v2/candidates/7.0-provisional-traveler-cryo.json";
const document = JSON.parse(fs.readFileSync(path.join(root, candidatePath), "utf8"));

function loaderApi() {
    const sandbox = { window: {}, console, fetch: async () => { throw new Error("fetch is not used"); } };
    vm.createContext(sandbox);
    ["genshinDataContract.js", "genshinCalcData.js"].forEach((name) => {
        vm.runInContext(fs.readFileSync(path.join(root, "games/js", name), "utf8"), sandbox, { filename: name });
    });
    return sandbox.window.GenshinCalcData;
}

test("Cryo Traveler candidate preserves two variant identities and the fail-closed data boundary", () => {
    assert.equal(document.status, "candidatePrepared");
    assert.equal(document.canonical, false);
    assert.equal(document.verificationComplete, false);
    assert.equal(document.runtimeConnected, false);
    assert.deepEqual(Object.keys(document.characters), ["10000005_cryo", "10000007_cryo"]);
    assert.equal(document.characters["10000005_cryo"].rawCharacterId, "10000005");
    assert.equal(document.characters["10000007_cryo"].rawCharacterId, "10000007");
    assert.equal(document.characters["10000005_cryo"].skillDepotId, 505);
    assert.equal(document.characters["10000007_cryo"].skillDepotId, 705);
    assert.deepEqual(document.manualCurrentCalcContract.frostglow, { min: 0, max: 8, default: 0, meaning: "寒光 consumed by burst; selects the burst bonus and whether the extra javelin hits are present" });
    assert.equal(document.manualCurrentCalcContract.specialChargedAttack.min, 0);
    assert.equal(document.manualCurrentCalcContract.specialChargedAttack.max, 3);
    assert.equal(document.manualCurrentCalcContract.specialChargedAttack.default, 0);
    assert.match(document.manualCurrentCalcContract.specialChargedAttack.interpretation, /two charged hits/);
});

test("both Cryo Traveler variants expose normal, charged, plunge, skill, burst, and special hits", () => {
    for (const id of ["10000005_cryo", "10000007_cryo"]) {
        const scaling = document.talentScalings[id];
        assert.ok(scaling.normalAttack.entries.some((entry) => entry.attackType === "normalAttack"));
        assert.equal(scaling.normalAttack.entries.filter((entry) => entry.attackType === "chargedAttack").length, 8);
        assert.equal(scaling.normalAttack.entries.filter((entry) => entry.id.includes("freezingIce_")).length, 6);
        assert.ok(scaling.normalAttack.entries.filter((entry) => entry.id.includes("freezingIce_")).every((entry) => entry.conditionSelectors.some((selector) => selector.groupId === `${id}:icepoint` && selector.values.includes("3"))));
        assert.ok(scaling.normalAttack.entries.some((entry) => entry.attackType === "plungingAttack"));
    assert.ok(scaling.skill.entries.length >= 2);
        assert.ok(scaling.skill.entries.every((entry) => !entry.directReactionId), "Traveler Cryo skill damage remains Cryo talent damage");
        assert.ok(scaling.burst.entries.length >= 3);
        for (const entry of [...scaling.normalAttack.entries, ...scaling.skill.entries, ...scaling.burst.entries]) {
            assert.ok(entry.scalings?.[0]?.valuesByLevel, entry.id);
            assert.equal(Object.keys(entry.scalings[0].valuesByLevel).length, 15, entry.id);
        }
    }
    const aether = document.talentScalings["10000005_cryo"].normalAttack.entries.find((entry) => entry.id === "cryo_ca_second").scalings[0].valuesByLevel["9"];
    const lumine = document.talentScalings["10000007_cryo"].normalAttack.entries.find((entry) => entry.id === "cryo_ca_second").scalings[0].valuesByLevel["9"];
    assert.equal(aether, 111.6);
    assert.equal(lumine, 132.7);
    const special = document.talentScalings["10000005_cryo"].normalAttack.entries.find((entry) => entry.id.endsWith("cryo_ca_first_freezingIce_none"));
    assert.equal(special.scalings[0].valuesByLevel["9"], 242.7);
    assert.equal(special.hitCount, 1);
    assert.ok(!special.id.includes("a1"));
});

test("provisional loading adds Cryo aliases while leaving legacy Pyro Traveler untouched", () => {
    const harness = createScenarioHarness();
    const originalPyro = structuredClone(harness.calcData.characterTalents["10000005"]);
    const summary = loaderApi().applyProvisional70Data(harness.calcData, [document], []);
    assert.equal(summary.rejected, 0);
    assert.equal(harness.calcData.characters["10000005_cryo"].element, "氷");
    assert.equal(harness.calcData.characters["10000007_cryo"].element, "氷");
    assert.deepEqual(harness.calcData.characterTalents["10000005"], originalPyro);

    for (const characterId of ["10000005_cryo", "10000007_cryo"]) {
        prepareScenarioInputs(harness.elements, { characterId, stats: { atk: 1800, critRate: 0, critDamage: 0 } });
        const result = harness.sandbox.GenshinCalcEngine.calculateDamageRequest(
            harness.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm(), harness.calcData
        );
        assert.ok(result.results.some((item) => item.entry?.group === "normalAttack" && item.nonCrit > 0));
        assert.ok(result.results.some((item) => item.entry?.group === "skill" && item.nonCrit > 0));
        assert.ok(result.results.some((item) => item.entry?.group === "burst" && item.nonCrit > 0));
    }
});

test("manual Stellar Conduct infuses eligible hits and adds the A1 ATK base damage", () => {
    const harness = createScenarioHarness();
    loaderApi().applyProvisional70Data(harness.calcData, [document], []);
    const characterId = "10000005_cryo";
    prepareScenarioInputs(harness.elements, { characterId, stats: { atk: 1800, critRate: 0, critDamage: 0 } });
    const group = `${characterId}:stellar`;
    setConditionElement(harness.elements, `character:${characterId}:group:${group}`, "option", "stellarConduct");
    const request = harness.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    const result = harness.sandbox.GenshinCalcEngine.calculateDamageRequest(request, harness.calcData);
    const normal = result.results.find((item) => item.entry?.id === "cryo_n1");
    assert.ok(normal, JSON.stringify(result.warnings));
    assert.equal(normal.entry.element, "氷");
    assert.equal(normal.breakdown.additiveBaseDamage, 1440);
    assert.equal(result.calculationRequest.uiState.conditionByModifier[`character:${characterId}:group:${group}`].option, "stellarConduct");
});

test("manual Stellar mode selects mutually exclusive Cryo Traveler burst routes", () => {
    const harness = createScenarioHarness();
    loaderApi().applyProvisional70Data(harness.calcData, [document], []);
    const characterId = "10000005_cryo";
    prepareScenarioInputs(harness.elements, { characterId, stats: { atk: 1800, critRate: 0, critDamage: 0 } });
    const calculate = () => harness.sandbox.GenshinCalcEngine.calculateDamageRequest(
        harness.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm(), harness.calcData
    );
    const ordinary = calculate();
    assert.ok(ordinary.results.some((item) => item.entry?.group === "burst"), JSON.stringify(ordinary.results.map((item) => item.entry?.id)));
    assert.ok(!ordinary.results.some((item) => item.entry?.directReactionId === "stellarConduct"));

    setConditionElement(harness.elements, `character:${characterId}:group:${characterId}:stellar`, "option", "stellarConduct");
    const conduct = calculate();
    assert.ok(conduct.results.some((item) => item.entry?.directReactionId === "stellarConduct"), JSON.stringify({ states: conduct.calculationRequest.uiState.conditionByModifier, entries: conduct.results.map((item) => [item.entry?.id, item.entry?.directReactionId]) }));
    assert.ok(!conduct.results.some((item) => item.entry?.id === `${characterId}_burst`));
    assert.ok(conduct.results.filter((item) => item.entry?.group === "skill").every((item) => !item.entry?.directReactionId));
});

test("one shared Frostglow stack input raises burst scaling and enables exactly two eighth-stack hits", () => {
    const harness = createScenarioHarness();
    loaderApi().applyProvisional70Data(harness.calcData, [document], []);
    const characterId = "10000005_cryo";
    prepareScenarioInputs(harness.elements, { characterId, stats: { atk: 1800, critRate: 0, critDamage: 0 } });
    const calculate = () => harness.sandbox.GenshinCalcEngine.calculateDamageRequest(
        harness.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm(), harness.calcData
    );
    const none = calculate();
    assert.equal(none.results.filter((item) => item.entry?.group === "burst").length, 3);
    const groupKey = `character:${characterId}:group:${characterId}:frostglow`;
    setConditionElement(harness.elements, groupKey, "stack", "8");
    const stacked = calculate();
    assert.equal(stacked.calculationRequest.uiState.conditionByModifier[groupKey].stack, 8);
    assert.equal(stacked.results.filter((item) => item.entry?.group === "burst").length, 5);
    const base = stacked.results.find((item) => item.entry?.id === `${characterId}_burst_hit1`);
    assert.ok(base);
    assert.equal(base.breakdown.additiveBaseDamage, 1800 * 4.96 * 8 / 100);
});

test("Icepoint=3 selects two Freezing Ice hits and excludes A1's additive bonus", () => {
    const harness = createScenarioHarness();
    loaderApi().applyProvisional70Data(harness.calcData, [document], []);
    const characterId = "10000005_cryo";
    prepareScenarioInputs(harness.elements, { characterId, stats: { atk: 1800, critRate: 0, critDamage: 0 } });
    setConditionElement(harness.elements, `character:${characterId}:group:${characterId}:stellar`, "option", "stellarConduct");
    setConditionElement(harness.elements, `character:${characterId}:group:${characterId}:icepoint`, "stack", "3");
    const result = harness.sandbox.GenshinCalcEngine.calculateDamageRequest(
        harness.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm(), harness.calcData
    );
    const specialHits = result.results.filter((item) => item.entry?.id?.includes("freezingIce_stellarConduct"));
    assert.equal(specialHits.length, 2);
    assert.ok(specialHits.every((item) => item.entry.element === "氷"));
    const first = specialHits.find((item) => item.entry.id.includes("ca_first"));
    const second = specialHits.find((item) => item.entry.id.includes("ca_second"));
    assert.equal(first.breakdown.scalingParts[0].talentMultiplier, 250.5);
    assert.equal(second.breakdown.scalingParts[0].talentMultiplier, 260);
    assert.ok(specialHits.every((item) => item.breakdown.additiveBaseDamage === 0));
});

test("C2 adds only the selected 60/120 EM tier and persistent resonance stats are not doubled", () => {
    const harness = createScenarioHarness();
    loaderApi().applyProvisional70Data(harness.calcData, [document], []);
    const characterId = "10000005_cryo";
    prepareScenarioInputs(harness.elements, { characterId, constellation: 2, stats: { atk: 1800, elementalMastery: 200 } });
    const calculate = () => harness.sandbox.GenshinCalcEngine.calculateDamageRequest(
        harness.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm(), harness.calcData
    );
    const key = `character:${characterId}:group:${characterId}:c2em`;
    const off = calculate();
    assert.equal(off.context.effectiveStats.elementalMastery, 200, "input EM is already the persistent final value");
    for (const [tier, amount] of [["normal", 60], ["enhanced", 120]]) {
        setConditionElement(harness.elements, key, "option", tier);
        const active = calculate();
        assert.equal(active.context.effectiveStats.elementalMastery, 200 + amount, `C2 ${tier} adds exactly ${amount} EM`);
        assert.equal(active.statTrace.filter((item) => item.modifierId === `${characterId}_c2_em`).length, 1);
    }

    prepareScenarioInputs(harness.elements, { characterId, stats: { atk: 1800, critRate: 50, critDamage: 100 } });
    setConditionElement(harness.elements, `character:${characterId}:group:${characterId}:resonance`, "option", "Cryo");
    const resonance = calculate();
    assert.equal(resonance.context.effectiveStats.critRate, 50, "UID-reflected Cryo resonance is not added on top of reflected stats");
    assert.equal(resonance.statTrace.filter((item) => item.modifierId === `${characterId}_res_cryo`).length, 0);
});

test("A4 converts current ATK into EM continuously and caps the result at 160", () => {
    const harness = createScenarioHarness();
    loaderApi().applyProvisional70Data(harness.calcData, [document], []);
    const characterId = "10000005_cryo";
    prepareScenarioInputs(harness.elements, { characterId, stats: { atk: 1800, elementalMastery: 50 } });
    const calculate = () => harness.sandbox.GenshinCalcEngine.calculateDamageRequest(
        harness.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm(), harness.calcData
    );
    assert.equal(calculate().context.effectiveStats.elementalMastery, 50, "persistent A4 is not added over the final EM input");
    const calculateFromPremodeStats = () => {
        const request = harness.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
        request.inputProvenance.includesPersistentBonuses = false;
        return harness.sandbox.GenshinCalcEngine.calculateDamageRequest(request, harness.calcData);
    };
    assert.equal(calculateFromPremodeStats().context.effectiveStats.elementalMastery, 194, "premode ATK 1800 converts continuously at 8% with a 160 cap");
    setElement(harness.elements, "genshinAtkInput", 4000);
    assert.equal(calculateFromPremodeStats().context.effectiveStats.elementalMastery, 210, "ATK conversion caps at 160 added EM");
    setConditionElement(harness.elements, `character:${characterId}:group:${characterId}:resonance`, "option", "Pyro");
    assert.equal(calculate().context.effectiveStats.elementalMastery, 50, "final-stat provenance suppresses A4 and reflected Pyro ATK resonance to avoid duplicate bonuses");
});

test("C6 Stellar bonuses are 5% per consumed Frostglow stack for other participants only", () => {
    const harness = createScenarioHarness();
    const swirl = JSON.parse(fs.readFileSync(path.join(root, "games/genshin/data/v2/candidates/7.0-provisional-stellar-swirl.json"), "utf8"));
    loaderApi().applyProvisional70Data(harness.calcData, [swirl, document], []);
    prepareScenarioInputs(harness.elements, { characterId: "10000003", stats: { atk: 2000, elementalMastery: 0, critRate: 0, critDamage: 0, elementDamageBonus: 0 } });
    const engine = harness.sandbox.GenshinCalcEngine;
    const request = engine.buildCalculationRequestFromForm();
    request.reactionOptionKey = "stellarSwirl";
    const recipient = "10000003";
    const providerId = "10000005_cryo";
    request.party = {
        schemaVersion: 2, focusSlot: 1, conditionStates: {},
        members: [
            { slot: 1, enabled: true, role: "main", characterId: recipient, stats: { ...request.stats }, buffStates: {}, equipment: { artifactSetIds: [] } },
            { slot: 2, enabled: true, role: "support", characterId: providerId, constellation: 6, level: 90,
                talentLevels: { normal: 10, skill: 10, burst: 10 }, stats: { atk: 1800, baseAtk: 1000, elementalMastery: 0 },
                buffStates: {}, equipment: { weaponId: "", artifactSetIds: [] } }
        ]
    };
    let recipientResult = engine.calculateDamageRequest(request, harness.calcData);
    const c6 = recipientResult.partyModifiers.find((item) => item.modifier.id === `${providerId}_c6_stellar_party`);
    assert.ok(c6, "C6 is discovered from an enabled provider slot");
    request.party.conditionStates[c6.partyConditionStateKey] = { stack: 8 };
    request.party.members[1].buffStates[c6.toggleKey] = true;
    recipientResult = engine.calculateDamageRequest(request, harness.calcData);
    const activeC6 = recipientResult.partyModifiers.find((item) => item.modifier.id === `${providerId}_c6_stellar_party`);
    assert.equal(activeC6.status, "ready");
    assert.equal(activeC6.enabled, true);
    assert.equal(activeC6.resolvedValue, 40, "eight consumed stacks grant 40% Stellar reaction bonus");
    assert.equal(activeC6.targetOwner, "otherPartyMembers");
    const recipientReaction = recipientResult.results.find((item) => item.entry.id === "reaction_stellarSwirl");
    assert.ok(recipientReaction);
    assert.equal(recipientReaction.breakdown.reactionBonus, 40);

    request.characterId = providerId;
    request.characterElement = "氷";
    request.party.focusSlot = 2;
    request.party.members[0].role = "support";
    request.party.members[1].role = "main";
    request.stats = { atk: 1800, baseAtk: 1000, elementalMastery: 0, critRate: 0, critDamage: 0 };
    const selfResult = engine.calculateDamageRequest(request, harness.calcData);
    assert.ok(!selfResult.partyModifiers.some((item) => item.modifier.id === `${providerId}_c6_stellar_party` && item.enabled), "C6 cannot target its own active provider");
});
