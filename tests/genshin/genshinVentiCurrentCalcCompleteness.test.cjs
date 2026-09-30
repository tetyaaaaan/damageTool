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

function ventiScenario(constellation = 0) {
    const fixture = createScenarioHarness();
    prepareScenarioInputs(fixture.elements, {
        characterId: "10000022",
        constellation,
        stats: {
            baseAtk: 500,
            atk: 2000,
            critRate: 0,
            critDamage: 0,
            elementDamageBonus: 0
        }
    });
    return fixture;
}

function calculate(fixture) {
    const request = fixture.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    return fixture.sandbox.GenshinCalcEngine.calculateDamageRequest(request, fixture.calcData);
}

function result(payload, id) {
    return payload.results.find((item) => item.entry.id === id || item.entry.effectId === id);
}

function conditionPanel(fixture) {
    return fixture.sandbox.GenshinCalcConditions.conditionPanelState(
        fixture.sandbox.GenshinCalcEngine.buildCharacterCalcContext(),
        fixture.calcData
    );
}

test("Venti normal, charged, plunge, both skill states, Stormeye, and four absorbed elements reach damage", () => {
    const fixture = ventiScenario();
    const payload = calculate(fixture);

    ["normalAttack", "chargedAttack", "plungingAttack", "skill", "burst"].forEach((attackType) => {
        assert.ok(payload.results.some((item) => item.entry.attackType === attackType && item.nonCrit > 0), attackType);
    });
    assert.ok(result(payload, "damage_2")?.nonCrit > 0);
    assert.ok(result(payload, "damage_3")?.nonCrit > 0);
    assert.ok(result(payload, "dotdamage")?.nonCrit > 0);

    const absorbed = payload.results.filter((item) => item.entry.id.startsWith("damage_4_") && item.entry.group === "burst");
    assert.deepEqual(Array.from(absorbed, (item) => item.entry.element), ["炎", "水", "雷", "氷"]);
    assert.deepEqual(Array.from(absorbed, (item) => item.entry.variant), ["pyro", "hydro", "electro", "cryo"]);
    assert.ok(absorbed.every((item) => item.nonCrit > 0));
});

test("Venti C1 creates two independent charged-shot extras while C3 and C5 remain input-reflected", () => {
    const fixture = ventiScenario(6);
    [1, 2, 4, 6].forEach((level) => setElement(fixture.elements, `genshinJsonEnableConstellationC${level}`, "", false));
    const inactive = calculate(fixture);
    assert.equal(inactive.results.some((item) => item.entry.effectId === "c_10000022_1_1"), false);

    setElement(fixture.elements, "genshinJsonEnableConstellationC1", "", true);
    const active = calculate(fixture);
    const extras = active.results.filter((item) => item.entry.effectId === "c_10000022_1_1");
    assert.equal(extras.length, 2);
    assert.ok(extras.every((item) => item.entry.group === "extraDamage" && item.entry.hitCount === 2));
    assert.deepEqual(Array.from(extras, (item) => item.entry.element).sort(), ["physical", "風"]);

    const reflected = active.candidateModifiers.filter((item) =>
        ["c_10000022_3_1", "c_10000022_5_1"].includes(item.modifier?.id));
    assert.equal(reflected.length, 2);
    assert.ok(reflected.every((item) => item.analysis.inputStatus === "includedInInput"));
});

test("Venti C2 uses one saved state for Anemo and Physical resistance, and C4 affects only Anemo damage", () => {
    const fixture = ventiScenario(4);
    setElement(fixture.elements, "genshinJsonEnableConstellationC1", "", false);
    const c2Key = "constellation:C2:group:venti-c2-high-sky-song-debuff";
    const panel = conditionPanel(fixture);
    const c2 = panel.cards.find((card) => card.id === "constellation").sections.find((section) => section.level === 2);
    assert.equal(c2.controls.length, 1);
    assert.equal(c2.controls[0].key, c2Key);

    setConditionElement(fixture.elements, c2Key, "option", "inactive");
    setElement(fixture.elements, "genshinJsonEnableConstellationC4", "", false);
    const inactive = calculate(fixture);
    setConditionElement(fixture.elements, c2Key, "option", "afterSkill");
    const afterSkill = calculate(fixture);
    setConditionElement(fixture.elements, c2Key, "option", "airborne");
    setElement(fixture.elements, "genshinJsonEnableConstellationC4", "", true);
    const airborne = calculate(fixture);

    assert.equal(result(inactive, "normal_1damage").breakdown.resistance, 10);
    assert.equal(result(afterSkill, "normal_1damage").breakdown.resistance, -2);
    assert.equal(result(airborne, "normal_1damage").breakdown.resistance, -14);
    assert.equal(result(inactive, "damage_2").breakdown.resistance, 10);
    assert.equal(result(afterSkill, "damage_2").breakdown.resistance, -2);
    assert.equal(result(airborne, "damage_2").breakdown.resistance, -14);
    assert.equal(result(airborne, "damage_2").breakdown.damageBonus, 25);
    assert.equal(result(airborne, "normal_1damage").breakdown.damageBonus, 0);
    assert.equal(airborne.calculationRequest.uiState.conditionByModifier[c2Key].option, "airborne");
});

test("Venti C6 uses one absorption option and lowers only Anemo plus the selected absorbed element", () => {
    const fixture = ventiScenario(6);
    [1, 2, 4].forEach((level) => setElement(fixture.elements, `genshinJsonEnableConstellationC${level}`, "", false));
    const c6Key = "constellation:C6:group:venti-c6-stormeye-elemental-absorption";
    const panel = conditionPanel(fixture);
    const c6 = panel.cards.find((card) => card.id === "constellation").sections.find((section) => section.level === 6);
    assert.equal(c6.controls.length, 1);
    assert.equal(c6.controls[0].key, c6Key);
    assert.deepEqual(Array.from(c6.controls[0].options, (item) => item.value), ["inactive", "anemo", "pyro", "hydro", "electro", "cryo"]);

    setConditionElement(fixture.elements, c6Key, "option", "inactive");
    const inactive = calculate(fixture);
    setConditionElement(fixture.elements, c6Key, "option", "pyro");
    const pyro = calculate(fixture);

    assert.equal(result(inactive, "dotdamage").breakdown.resistance, 10);
    assert.equal(result(pyro, "dotdamage").breakdown.resistance, -10);
    assert.equal(result(pyro, "damage_4_pyro").breakdown.resistance, -10);
    assert.equal(result(pyro, "damage_4_hydro").breakdown.resistance, 10);
    assert.equal(pyro.calculationRequest.uiState.conditionByModifier[c6Key].option, "pyro");
});

test("Venti Witch state is shown once, applies 135% only to Stormeye entries, and applies 50% to the active character", () => {
    const fixture = ventiScenario();
    const passive = fixture.calcData.talentModifiers["10000022"].passives.find((item) => item.sourceId === "lockedPassive");
    const multiplier = passive.modifiers.find((item) => item.id === "t_10000022_lockedPassive_stormeye_damage_multiplier");
    const key = fixture.sandbox.GenshinModifierAnalyzer.modifierStateKey(multiplier, "talent:lockedPassive");
    const controls = conditionPanel(fixture).complexConditionInputs.filter((item) => item.key === key);
    assert.equal(controls.length, 1);

    setConditionElement(fixture.elements, key, "option", "unlocked");
    const inactive = calculate(fixture);
    setConditionElement(fixture.elements, key, "option", "active");
    const active = calculate(fixture);

    assert.equal(result(active, "dotdamage").breakdown.finalDamageMultiplier, 1.35);
    assert.equal(result(active, "damage_4_pyro").breakdown.finalDamageMultiplier, 1.35);
    assert.equal(result(active, "damage_2").breakdown.finalDamageMultiplier, 1);
    assert.equal(result(active, "dotdamage").breakdown.damageBonus, 50);
    assert.equal(result(active, "damage_2").breakdown.damageBonus, 50);
    assert.ok(result(active, "dotdamage").nonCrit > result(inactive, "dotdamage").nonCrit);
    assert.ok(result(active, "damage_2").nonCrit > result(inactive, "damage_2").nonCrit);
});

test("Venti party state exposes C2/C6 as enemy debuffs and Witch 50% to the active character", () => {
    const fixture = createScenarioHarness();
    prepareScenarioInputs(fixture.elements, {
        characterId: "10000021",
        stats: { baseAtk: 500, atk: 2000, critRate: 0, critDamage: 0, elementDamageBonus: 0 }
    });
    const request = fixture.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    request.party = {
        schemaVersion: 2,
        focusSlot: 1,
        conditionStates: {},
        members: [
            { slot: 1, role: "main", enabled: true, characterId: "10000021" },
            {
                slot: 2,
                role: "support",
                enabled: true,
                characterId: "10000022",
                constellation: 6,
                talentLevels: { normal: 10, skill: 10, burst: 10 },
                stats: {},
                buffStates: {}
            }
        ]
    };
    const before = fixture.sandbox.GenshinCalcEngine.calculateDamageRequest(request, fixture.calcData);
    const witch = before.partyModifiers.find((item) => item.modifier.id === "t_10000022_lockedPassive_stormeye_swirl_damage");
    const c2 = before.partyModifiers.find((item) => item.modifier.id === "c_10000022_2_1");
    const c6 = before.partyModifiers.find((item) => item.modifier.id === "c_10000022_6_pyro");
    assert.equal(witch.targetOwner, "activeCharacter");
    assert.equal(c2.targetOwner, "enemy");
    assert.equal(c6.targetOwner, "enemy");
    assert.equal(new Set(before.partyModifiers.filter((item) => item.modifier.conditionGroupId === "venti-c2-high-sky-song-debuff").map((item) => item.partyConditionStateKey)).size, 1);
    assert.equal(new Set(before.partyModifiers.filter((item) => item.modifier.conditionGroupId === "venti-c6-stormeye-elemental-absorption").map((item) => item.partyConditionStateKey)).size, 1);

    request.party.members[1].buffStates[witch.toggleKey] = true;
    request.party.members[1].buffStates[c2.toggleKey] = true;
    request.party.members[1].buffStates[c6.toggleKey] = true;
    request.party.conditionStates[witch.partyConditionStateKey] = { option: "active" };
    request.party.conditionStates[c2.partyConditionStateKey] = { option: "airborne" };
    request.party.conditionStates[c6.partyConditionStateKey] = { option: "pyro" };
    const after = fixture.sandbox.GenshinCalcEngine.calculateDamageRequest(request, fixture.calcData);
    const pyroBefore = before.results.find((item) => item.entry.element === "炎");
    const pyroAfter = after.results.find((item) => item.entry.id === pyroBefore.entry.id);
    const physicalBefore = before.results.find((item) => item.entry.element === "physical");
    const physicalAfter = after.results.find((item) => item.entry.id === physicalBefore.entry.id);
    assert.equal(pyroAfter.breakdown.resistance, -10);
    assert.equal(physicalAfter.breakdown.resistance, -14);
    assert.equal(pyroAfter.breakdown.damageBonus, pyroBefore.breakdown.damageBonus + 50);
    assert.ok(pyroAfter.nonCrit > pyroBefore.nonCrit);
    assert.ok(physicalAfter.nonCrit > physicalBefore.nonCrit);
});

test("Venti non-damage passives stay outside direct CurrentCalc damage", () => {
    const talents = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../games/genshin/data/character-talents.json"), "utf8"))["10000022"];
    assert.match(talents.passives.find((item) => item.sourceId === "passive_1").descriptionJa, /上昇気流/);
    assert.match(talents.passives.find((item) => item.sourceId === "passive_2").descriptionJa, /元素エネルギー/);
    assert.match(talents.passives.find((item) => item.sourceId === "passive_utility").descriptionJa, /滑翔/);
    const payload = calculate(ventiScenario());
    assert.equal(payload.results.some((item) => item.entry.effectId === "t_10000022_combat3_1"), false);
});
