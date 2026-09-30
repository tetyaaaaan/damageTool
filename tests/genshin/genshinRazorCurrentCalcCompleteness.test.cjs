"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
    createScenarioHarness,
    prepareScenarioInputs,
    setConditionElement,
    setElement
} = require("./helpers/calcScenarioHarness.cjs");

function razorScenario({ constellation = 0, elementalResistance = 10, physicalResistance = 10 } = {}) {
    const fixture = createScenarioHarness();
    prepareScenarioInputs(fixture.elements, {
        characterId: "10000020",
        constellation,
        stats: {
            baseAtk: 500,
            atk: 2000,
            energyRecharge: 100,
            critRate: 0,
            critDamage: 0,
            elementDamageBonus: 0
        }
    });
    setElement(fixture.elements, "genshinEnemyElementalResistanceInput", elementalResistance);
    setElement(fixture.elements, "genshinEnemyPhysicalResistanceInput", physicalResistance);
    return fixture;
}

function calculate(fixture) {
    const request = fixture.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    return fixture.sandbox.GenshinCalcEngine.calculateDamageRequest(request, fixture.calcData);
}

function result(payload, id) {
    return payload.results.find((item) => item.entry.id === id || item.entry.effectId === id);
}

function witchModifier(fixture, id) {
    return fixture.calcData.talentModifiers["10000020"].passives
        .find((item) => item.sourceId === "lockedPassive").modifiers
        .find((item) => item.id === id);
}

test("Razor normal, charged, plunge, both skill states, burst hit, and Wolf Within reach real damage", () => {
    const fixture = razorScenario();
    const payload = calculate(fixture);

    const expected = [
        ["normal_1damage", "physical"],
        ["chargeddamage", "physical"],
        ["charged_damage", "physical"],
        ["plunge_damage", "physical"],
        ["low_plungedamage", "physical"],
        ["high_plungedamage", "physical"],
        ["skilldamage", "雷"],
        ["skilldamage_2", "雷"],
        ["burstdamage", "雷"],
        ["damage", "雷"]
    ];
    expected.forEach(([id, element]) => {
        const entry = result(payload, id);
        assert.ok(entry?.nonCrit > 0, id);
        assert.equal(entry.entry.element, element, id);
    });
    assert.equal(payload.results.filter((item) => item.entry.id.startsWith("normal_")).length, 4);
});

test("Razor passive and constellation CurrentCalc toggles apply C1, C2, and C4 while C3/C5 remain input-reflected", () => {
    const fixture = razorScenario({ constellation: 6 });
    [1, 2, 4, 6].forEach((level) => setElement(fixture.elements, `genshinJsonEnableConstellationC${level}`, "", false));
    const inactive = calculate(fixture);
    const inactiveNormal = result(inactive, "normal_1damage");

    [1, 2, 4].forEach((level) => setElement(fixture.elements, `genshinJsonEnableConstellationC${level}`, "", true));
    const active = calculate(fixture);
    const activeNormal = result(active, "normal_1damage");

    assert.equal(inactiveNormal.breakdown.damageBonus, 0);
    assert.equal(activeNormal.breakdown.damageBonus, 10);
    assert.equal(inactiveNormal.breakdown.critRate, 0);
    assert.equal(activeNormal.breakdown.critRate, 10);
    assert.equal(inactiveNormal.breakdown.defenseDebuff, 0);
    assert.equal(activeNormal.breakdown.defenseDebuff, 15);
    assert.ok(activeNormal.nonCrit > inactiveNormal.nonCrit);
    assert.equal(activeNormal.breakdown.statBonus.energyRecharge, 30);

    const reflected = active.candidateModifiers.filter((item) =>
        ["c_10000020_3_1", "c_10000020_5_1"].includes(item.modifier?.id));
    assert.equal(reflected.length, 2);
    assert.ok(reflected.every((item) => item.analysis.inputStatus === "includedInInput"));

    const talents = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../games/genshin/data/character-talents.json"), "utf8"))["10000020"];
    assert.match(talents.passives.find((item) => item.sourceId === "passive_1").descriptionJa, /クールタイム/);
    assert.match(talents.passives.find((item) => item.sourceId === "passive_utility").descriptionJa, /スタミナ/);
});

test("Razor C6 lightning is an optional independent Electro entry and never changes the triggering normal attack", () => {
    const fixture = razorScenario({ constellation: 6, elementalResistance: 50, physicalResistance: 0 });
    [1, 2, 4].forEach((level) => setElement(fixture.elements, `genshinJsonEnableConstellationC${level}`, "", false));
    setElement(fixture.elements, "genshinJsonEnableConstellationC6", "", false);
    const inactive = calculate(fixture);
    const inactiveNormal = result(inactive, "normal_1damage");
    assert.equal(result(inactive, "c_10000020_6_1_resolved_2"), undefined);

    setElement(fixture.elements, "genshinJsonEnableConstellationC6", "", true);
    const active = calculate(fixture);
    const activeNormal = result(active, "normal_1damage");
    const lightning = result(active, "c_10000020_6_1_resolved_2");

    assert.ok(lightning);
    assert.equal(lightning.entry.group, "extraDamage");
    assert.equal(lightning.entry.element, "雷");
    assert.equal(lightning.breakdown.scalingParts[0].baseDamage, 2000);
    assert.equal(lightning.breakdown.resistance, 50);
    assert.equal(lightning.breakdown.resistanceMultiplier, 0.5);
    assert.equal(activeNormal.breakdown.resistance, 0);
    assert.equal(activeNormal.nonCrit, inactiveNormal.nonCrit);
});

test("Razor Witch Wolf bonus adds 70% ATK only to Wolf Within damage", () => {
    const fixture = razorScenario();
    const modifier = witchModifier(fixture, "t_10000020_lockedPassive_wolf_within_burst_atk");
    const key = fixture.sandbox.GenshinModifierAnalyzer.modifierStateKey(modifier, "talent:lockedPassive");
    const inactive = calculate(fixture);
    setConditionElement(fixture.elements, key, "option", "unlocked");
    const active = calculate(fixture);

    assert.equal(result(active, "damage").breakdown.additiveBaseDamage, 1400);
    assert.ok(result(active, "damage").nonCrit > result(inactive, "damage").nonCrit);
    ["burstdamage", "skilldamage", "normal_1damage"].forEach((id) => {
        assert.equal(result(active, id).breakdown.additiveBaseDamage, 0, id);
        assert.equal(result(active, id).nonCrit, result(inactive, id).nonCrit, id);
    });
});

test("Razor Witch overflow state is saved and creates one 150% ATK Electro entry without modifying the original attack", () => {
    const fixture = razorScenario({ elementalResistance: 50, physicalResistance: 0 });
    const modifier = witchModifier(fixture, "t_10000020_lockedPassive_overflow_lightning");
    const key = fixture.sandbox.GenshinModifierAnalyzer.modifierStateKey(modifier, "talent:lockedPassive");

    setConditionElement(fixture.elements, key, "option", "unlocked");
    const inactive = calculate(fixture);
    assert.equal(result(inactive, modifier.id), undefined);
    const inactiveNormal = result(inactive, "normal_1damage");

    setConditionElement(fixture.elements, key, "option", "active");
    const activeRequest = fixture.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    assert.equal(activeRequest.uiState.complexConditionByModifier[key].option, "active");
    const active = fixture.sandbox.GenshinCalcEngine.calculateDamageRequest(activeRequest, fixture.calcData);
    assert.equal(active.calculationRequest.uiState.conditionByModifier[key].option, "active");
    const lightning = active.results.filter((item) => item.entry.effectId === modifier.id);

    assert.equal(lightning.length, 1);
    assert.equal(lightning[0].entry.group, "extraDamage");
    assert.equal(lightning[0].entry.element, "雷");
    assert.equal(lightning[0].breakdown.scalingParts[0].baseDamage, 3000);
    assert.equal(lightning[0].breakdown.resistance, 50);
    assert.equal(lightning[0].breakdown.resistanceMultiplier, 0.5);
    assert.equal(result(active, "normal_1damage").nonCrit, inactiveNormal.nonCrit);
});
