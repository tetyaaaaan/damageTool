"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createScenarioHarness, prepareScenarioInputs, setConditionElement, setElement, setResourceElement } = require("./helpers/calcScenarioHarness.cjs");

function scenario(constellation = 0, def = 2000) {
    const fixture = createScenarioHarness();
    prepareScenarioInputs(fixture.elements, {
        characterId: "10000038", constellation,
        stats: { atk: 1000, baseAtk: 500, def, elementalMastery: 0, critRate: 0, critDamage: 0, elementDamageBonus: 0 }
    });
    [2, 4, 6].forEach((level) => setElement(fixture.elements, `genshinJsonEnableConstellationC${level}`, "", level <= constellation));
    return fixture;
}

function calculate(fixture, request) {
    return fixture.sandbox.GenshinCalcEngine.calculateDamageRequest(request || fixture.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm(), fixture.calcData);
}

function result(payload, id) { return payload.results.find((item) => item.entry.id === id); }

test("Albedo charged attack has two independent physical ATK hits with confirmed param7 at every level and no leakage", () => {
    const fixture = scenario();
    const values = [60.2, 65.1, 70, 77, 81.9, 87.5, 95.2, 102.9, 110.6, 119, 128.63, 139.94, 151.26, 162.58, 174.93];
    const baseline = calculate(fixture);
    const withoutSecond = JSON.parse(JSON.stringify(fixture.calcData));
    withoutSecond.talentScalings["10000038"].normalAttack.entries = withoutSecond.talentScalings["10000038"].normalAttack.entries.filter((entry) => entry.id !== "charged_damage");
    const before = fixture.sandbox.GenshinCalcEngine.calculateDamageRequest(fixture.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm(), withoutSecond);
    before.results.forEach((item) => assert.equal(result(baseline, item.entry.id).nonCrit, item.nonCrit, item.entry.id));
    for (let level = 1; level <= 15; level++) {
        setElement(fixture.elements, "genshinNormalTalentLevel", level);
        const payload = calculate(fixture);
        const hits = payload.results.filter((item) => item.entry.attackType === "chargedAttack");
        assert.equal(hits.length, 2);
        assert.deepEqual(Array.from(hits, (item) => item.entry.source.param), ["param6", "param7"]);
        assert.ok(hits.every((item) => item.entry.element === "physical" && item.entry.hitCount === 1));
        const second = result(payload, "charged_damage");
        assert.equal(second.breakdown.scalingParts[0].talentMultiplier, values[level - 1]);
        assert.ok(Math.abs(second.breakdown.scalingParts[0].baseDamage - 1000 * values[level - 1] / 100) < 1e-9);
        assert.ok(Math.abs(second.nonCrit - 1000 * values[level - 1] / 100 * 0.5 * 0.9) < 1e-9);
        ["skilldamage", "damage", "burstdamage", "damage_2"].forEach((id) => assert.equal(result(payload, id).nonCrit, result(baseline, id).nonCrit, id));
    }
});

test("Albedo existing attacks, ATK skill placement, DEF Transient Blossom, and both burst hits reach real damage", () => {
    const fixture = scenario();
    const payload = calculate(fixture);
    assert.equal(payload.results.filter((item) => item.entry.id.startsWith("normal_")).length, 5);
    ["chargeddamage", "plunge_damage", "low_plungedamage", "high_plungedamage", "skilldamage", "damage", "burstdamage", "damage_2"].forEach((id) => assert.ok(result(payload, id)?.nonCrit > 0, id));
    assert.equal(result(payload, "skilldamage").breakdown.scalingParts[0].baseDamage, 2347.2);
    assert.equal(result(payload, "damage").breakdown.scalingParts[0].baseDamage, 4809.6);
    assert.equal(result(payload, "damage_2").entry.hitCount, 1, "one Fatal Blossom, not an assumed seven-hit total");
});

test("Albedo Calcite Might saves one HP condition and buffs only the Transient Blossom", () => {
    const fixture = scenario();
    const key = "talent:passive1:t_10000038_passive1_transient_blossom_bonus";
    const inactive = calculate(fixture);
    setConditionElement(fixture.elements, key, "option", "belowHalf");
    const active = calculate(fixture);
    assert.equal(result(active, "damage").breakdown.damageBonus, 25);
    assert.equal(result(active, "damage").nonCrit, result(inactive, "damage").nonCrit * 1.25);
    ["normal_1damage", "skilldamage", "burstdamage", "damage_2"].forEach((id) => assert.equal(result(active, id).nonCrit, result(inactive, id).nonCrit, id));
    assert.equal(active.calculationRequest.uiState.conditionByModifier[key].option, "belowHalf");
    const replay = calculate(fixture, JSON.parse(JSON.stringify(active.calculationRequest)));
    assert.equal(result(replay, "damage").nonCrit, result(active, "damage").nonCrit);
});

test("Albedo C2 uses a single resource input, caps at four, adds DEF only to both burst entries, and never creates an extra hit", () => {
    const fixture = scenario(2);
    setElement(fixture.elements, "genshinJsonEnableConstellationC2", "", false);
    const generator = fixture.calcData.constellationModifiers["10000038"].constellations["2"][0];
    const key = fixture.sandbox.GenshinModifierAnalyzer.resourceStateKey(generator, "constellation:C2", { characterId: "10000038" });
    const panel = fixture.sandbox.GenshinCalcConditions.conditionPanelState(fixture.sandbox.GenshinCalcEngine.buildCharacterCalcContext(), fixture.calcData);
    assert.equal(panel.resourceInputs.filter((item) => item.key === key).length, 1);
    for (const [count, expected] of [[0, 0], [1, 600], [3, 1800], [4, 2400], [8, 2400]]) {
        setResourceElement(fixture.elements, key, count);
        const payload = calculate(fixture);
        ["burstdamage", "damage_2"].forEach((id) => assert.equal(result(payload, id).breakdown.additiveBaseDamage, expected, `${id}: ${count}`));
        ["normal_1damage", "skilldamage", "damage"].forEach((id) => assert.equal(result(payload, id).breakdown.additiveBaseDamage, 0, id));
        assert.equal(payload.results.some((item) => item.entry.group === "extraDamage"), false);
    }
});

function partyScenario(mainId = "10000020", def = 2000) {
    const fixture = createScenarioHarness();
    prepareScenarioInputs(fixture.elements, { characterId: mainId, stats: { atk: 1000, baseAtk: 500, def: 100, elementalMastery: 0, critRate: 0, critDamage: 0, elementDamageBonus: 0 } });
    const request = fixture.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    request.party = {
        schemaVersion: 2, focusSlot: 1, conditionStates: {},
        members: [
            { slot: 1, role: "main", enabled: true, characterId: mainId },
            { slot: 2, role: "support", enabled: true, characterId: "10000038", constellation: 6, stats: { def }, talentLevels: { normal: 10, skill: 10, burst: 10 }, buffStates: {} }
        ]
    };
    return { ...fixture, request };
}

test("Albedo burst EM, C4 plunge-only bonus, and C6 active-character bonus reach saved party state and damage", () => {
    const fixture = partyScenario();
    const before = calculate(fixture, fixture.request);
    const em = before.partyModifiers.find((item) => item.modifier.id === "t_10000038_passive2_burst_em");
    const c4 = before.partyModifiers.find((item) => item.modifier.id === "c_10000038_4_1");
    const c6 = before.partyModifiers.find((item) => item.modifier.id === "c_10000038_6_1");
    assert.equal(c4.targetOwner, "team");
    assert.equal(c6.targetOwner, "activeCharacter");
    fixture.request.party.members[1].buffStates[em.toggleKey] = true;
    fixture.request.party.conditionStates[em.partyConditionStateKey] = { option: "active" };
    fixture.request.party.members[1].buffStates[c4.toggleKey] = true;
    fixture.request.party.conditionStates[c4.partyConditionStateKey] = { option: "active" };
    const plunge = calculate(fixture, fixture.request);
    assert.equal(plunge.context.effectiveStats.elementalMastery, 125);
    assert.equal(result(plunge, "plunge_damage").breakdown.damageBonus, 30);
    assert.equal(result(plunge, "normal_1damage").nonCrit, result(before, "normal_1damage").nonCrit);
    fixture.request.party.members[1].buffStates[c6.toggleKey] = true;
    fixture.request.party.conditionStates[c6.partyConditionStateKey] = { option: "active" };
    const active = calculate(fixture, fixture.request);
    assert.equal(result(active, "plunge_damage").breakdown.damageBonus, 47);
    assert.equal(result(active, "normal_1damage").breakdown.damageBonus, 17);
    assert.ok(result(active, "normal_1damage").nonCrit > result(before, "normal_1damage").nonCrit);
    const replay = calculate(fixture, JSON.parse(JSON.stringify(active.calculationRequest)));
    assert.equal(result(replay, "normal_1damage").nonCrit, result(active, "normal_1damage").nonCrit);
});

test("Albedo Witch buffs reuse provider DEF, cap separately, and filter Silver Blossom to Hexerei characters", () => {
    for (const [mainId, def, solarValue, silverValue] of [["10000020", 1000, 4, 10], ["10000020", 5000, 12, 30], ["10000037", 5000, 12, 0]]) {
        const fixture = partyScenario(mainId, def);
        const before = calculate(fixture, fixture.request);
        for (const id of ["t_10000038_lockedPassive_solar_isotoma_damage", "t_10000038_lockedPassive_silver_blossom_damage"]) {
            const candidate = before.partyModifiers.find((item) => item.modifier.id === id);
            fixture.request.party.members[1].buffStates[candidate.toggleKey] = true;
            fixture.request.party.conditionStates[candidate.partyConditionStateKey] = { option: "active" };
        }
        const after = calculate(fixture, fixture.request);
        assert.equal(after.context.stats.def, 100);
        const solar = after.partyModifiers.find((item) => item.modifier.id.endsWith("solar_isotoma_damage"));
        const silver = after.partyModifiers.find((item) => item.modifier.id.endsWith("silver_blossom_damage"));
        assert.equal(solar.resolvedValue, solarValue);
        if (silverValue) assert.equal(silver.resolvedValue, silverValue);
        else assert.equal(silver.status, "notApplicable");
        assert.equal(result(after, "normal_1damage").breakdown.damageBonus, solarValue + silverValue);
    }
    const own = scenario(0, 5000);
    for (const group of ["witch-albedo-solar_isotoma_damage", "witch-albedo-silver-blossom-damage"]) setConditionElement(own.elements, `talent:lockedPassive:group:${group}`, "option", "active");
    const ownActive = calculate(own);
    ["skilldamage", "damage", "burstdamage", "damage_2"].forEach((id) => assert.equal(result(ownActive, id).breakdown.damageBonus, 42, id));
});

test("Albedo C3/C5 stay reflected in final input levels and Homuncular Nature also buffs herself", () => {
    const fixture = scenario(6);
    setConditionElement(fixture.elements, "talent:passive2:t_10000038_passive2_burst_em", "option", "active");
    const payload = calculate(fixture);
    assert.equal(payload.context.effectiveStats.elementalMastery, 125);
    const reflected = payload.candidateModifiers.filter((item) => ["c_10000038_3_1", "c_10000038_5_1"].includes(item.modifier?.id));
    assert.equal(reflected.length, 2);
    assert.ok(reflected.every((item) => item.analysis.inputStatus === "includedInInput"));
});
