"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createScenarioHarness,
    prepareScenarioInputs,
    setConditionElement,
    setElement
} = require("./helpers/calcScenarioHarness.cjs");

const BEIDOU = "10000024";
const FISCHL = "10000031";
const WITCH_GROUP = "witch-revelation-beidou-c6";
const COUNTER_GROUP = "beidou-counter";

function scenario(constellation = 0, characterId = BEIDOU) {
    const fixture = createScenarioHarness();
    prepareScenarioInputs(fixture.elements, {
        characterId,
        constellation,
        stats: { atk: 1000, baseAtk: 500, def: 100, elementalMastery: 0, critRate: 0, critDamage: 0, elementDamageBonus: 0 }
    });
    return fixture;
}

function calculate(fixture, request) {
    return fixture.sandbox.GenshinCalcEngine.calculateDamageRequest(
        request || fixture.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm(), fixture.calcData
    );
}

function result(payload, id) {
    return payload.results.find((item) => item.entry.id === id || item.entry.effectId === id);
}

function partyScenario() {
    const fixture = scenario(0, FISCHL);
    const request = fixture.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    request.party = {
        schemaVersion: 2,
        focusSlot: 1,
        conditionStates: {},
        members: [
            { slot: 1, role: "main", enabled: true, characterId: FISCHL, stats: { atk: 1000, baseAtk: 500, elementalMastery: 0 } },
            {
                slot: 2, role: "support", enabled: true, characterId: BEIDOU, constellation: 6,
                stats: { atk: 1000, baseAtk: 500, elementalMastery: 700 },
                talentLevels: { normal: 10, skill: 10, burst: 10 }, buffStates: {}
            }
        ]
    };
    return { ...fixture, request };
}

test("Beidou Undaunted condition adds 15% only to normal and charged attacks and replays", () => {
    const fixture = scenario();
    const key = "talent:passive2:group:beidou-max-counter-buff";
    const before = calculate(fixture);
    setConditionElement(fixture.elements, key, "option", "active");
    const active = calculate(fixture);
    for (const id of ["normal_1damage", "normal_2damage", "normal_3damage", "normal_4damage", "normal_5damage", "chargeddamage", "charged_damage"]) {
        assert.ok(result(active, id).nonCrit > result(before, id).nonCrit, id);
        assert.equal(result(active, id).breakdown.damageBonus - result(before, id).breakdown.damageBonus, 15, id);
    }
    for (const id of ["plunge_damage", "low_plungedamage", "high_plungedamage", "damage", "skilldamage", "damage_2"]) {
        assert.equal(result(active, id).nonCrit, result(before, id).nonCrit, id);
    }
    assert.equal(active.calculationRequest.uiState.conditionByModifier[key].option, "active");
    const replay = calculate(fixture, JSON.parse(JSON.stringify(active.calculationRequest)));
    assert.equal(result(replay, "normal_1damage").nonCrit, result(active, "normal_1damage").nonCrit);
});

test("Beidou's 13 base attack entries use their Lv10 source multipliers", () => {
    const fixture = scenario();
    const payload = calculate(fixture);
    const expected = {
        normal_1damage: 140.59, normal_2damage: 140.08, normal_3damage: 174.59, normal_4damage: 171.02,
        normal_5damage: 221.68, chargeddamage: 111.18, charged_damage: 201.28,
        plunge_damage: 147.441, low_plungedamage: 294.8195, high_plungedamage: 368.2455,
        damage: 218.88, skilldamage: 218.88, damage_2: 172.8
    };
    assert.equal(payload.results.length, 13);
    for (const [id, multiplier] of Object.entries(expected)) {
        assert.equal(result(payload, id).breakdown.scalingParts[0].talentMultiplier, multiplier, id);
        assert.equal(result(payload, id).breakdown.scalingParts[0].baseDamage, 1000 * multiplier / 100, id);
    }
});

test("Beidou Tidecaller counter adds ATK-scaled damage to the existing skill hit, clamps at two, and stays independent from Undaunted", () => {
    const fixture = scenario();
    const counterKey = `talent:combat2:group:${COUNTER_GROUP}`;
    const passiveKey = "talent:passive2:group:beidou-max-counter-buff";
    const multipliers = fixture.calcData.talentScalings[BEIDOU].skill.entries
        .find((entry) => entry.id === "damage").scalings[0].valuesByLevel;
    for (let level = 1; level <= 15; level++) {
        setElement(fixture.elements, "genshinSkillTalentLevel", level);
        const values = [];
        for (const stacks of [0, 1, 2, 3]) {
            setConditionElement(fixture.elements, counterKey, "stack", stacks);
            values.push(calculate(fixture));
        }
        const skillBase = result(values[0], "damage").breakdown.additiveBaseDamage;
        assert.equal(skillBase, 0);
        assert.equal(result(values[0], "damage").breakdown.scalingParts[0].talentMultiplier, multipliers[level]);
        assert.equal(result(values[0], "damage").breakdown.scalingParts[0].baseDamage, 1000 * multipliers[level] / 100);
        for (let stacks = 1; stacks <= 2; stacks++) {
            const expectedPerStack = 1000 * fixture.calcData.talentModifiers[BEIDOU].passives
                .find((passive) => passive.sourceId === "combat2").modifiers[0].valueByLevel[level] / 100;
            assert.equal(result(values[stacks], "damage").breakdown.additiveBaseDamage, expectedPerStack * stacks, `skill level ${level}, ${stacks} counter stacks`);
        }
        assert.equal(result(values[3], "damage").breakdown.additiveBaseDamage, result(values[2], "damage").breakdown.additiveBaseDamage, `skill level ${level}: clamp`);
        assert.equal(result(values[2], "damage").breakdown.scalingParts[0].talentMultiplier, multipliers[level]);
        for (const payload of values) {
            assert.equal(payload.results.filter((item) => item.entry.id === "damage").length, 1);
            for (const id of ["normal_1damage", "skilldamage", "damage_2"]) {
                assert.equal(result(payload, id).breakdown.additiveBaseDamage, 0, id);
            }
        }
        setConditionElement(fixture.elements, passiveKey, "option", "active");
        const passiveAlsoActive = calculate(fixture);
        assert.equal(result(passiveAlsoActive, "damage").breakdown.additiveBaseDamage, result(values[2], "damage").breakdown.additiveBaseDamage);
        assert.equal(result(passiveAlsoActive, "normal_1damage").breakdown.damageBonus, result(values[2], "normal_1damage").breakdown.damageBonus + 15);
        setConditionElement(fixture.elements, passiveKey, "option", "inactive");
    }
    const levelTen = fixture.calcData.talentScalings[BEIDOU].skill.entries.find((entry) => entry.id === "damage").scalings[0].valuesByLevel[10];
    assert.equal(levelTen, 218.88);
});

test("Beidou C4 is one conditional Electro normal-attack extra and does not alter other entries", () => {
    const fixture = scenario(4);
    const key = "constellation:C4:group:beidou-after-hit";
    const before = calculate(fixture);
    setConditionElement(fixture.elements, key, "option", "active");
    const active = calculate(fixture);
    const extras = active.results.filter((item) => item.entry.effectId === "c_10000024_4_1");
    assert.equal(extras.length, 1, "C4 adds one extra damage entry per activation");
    assert.equal(extras[0].entry.element, "雷");
    assert.equal(extras[0].entry.attackType, "extraDamage");
    assert.ok(extras.every((item) => item.breakdown.scalingParts[0].talentMultiplier === 20));
    const extraDamage = extras[0].nonCrit;
    setConditionElement(fixture.elements, "talent:passive2:group:beidou-max-counter-buff", "option", "active");
    const passiveActive = calculate(fixture);
    assert.equal(result(passiveActive, "normal_1damage").breakdown.damageBonus, 15);
    assert.ok(result(passiveActive, "normal_1damage").nonCrit > result(active, "normal_1damage").nonCrit);
    assert.equal(passiveActive.results.find((item) => item.entry.effectId === "c_10000024_4_1").nonCrit, extraDamage,
        "Undaunted's normal-attack bonus must not also amplify C4's separately typed extra hit");
    for (const id of ["chargeddamage", "charged_damage", "plunge_damage", "low_plungedamage", "high_plungedamage", "damage", "skilldamage", "damage_2"]) {
        assert.equal(result(active, id).nonCrit, result(before, id).nonCrit, id);
    }
    const replay = calculate(fixture, JSON.parse(JSON.stringify(active.calculationRequest)));
    assert.equal(replay.results.filter((item) => item.entry.effectId === "c_10000024_4_1").length, 1);
});

test("Beidou C6 shares one condition: burst-only Electro RES, then Witch Cryo RES and active-character EM", () => {
    const fixture = scenario(6);
    const groupKey = `constellation:C6:group:${WITCH_GROUP}`;
    const before = calculate(fixture);
    setConditionElement(fixture.elements, groupKey, "option", "burst");
    const burst = calculate(fixture);
    assert.equal(result(burst, "skilldamage").breakdown.resistance, -5);
    assert.equal(result(burst, "damage_2").breakdown.resistance, -5);
    assert.equal(result(burst, "normal_1damage").breakdown.resistance, 10);
    assert.equal(result(burst, "normal_1damage").nonCrit, result(before, "normal_1damage").nonCrit);

    setConditionElement(fixture.elements, groupKey, "option", "active");
    const active = calculate(fixture);
    assert.equal(result(active, "skilldamage").breakdown.resistance, -5);
    assert.equal(result(active, "normal_1damage").breakdown.resistance, 10);
    assert.equal(active.context.effectiveStats.elementalMastery, 200);
    const activeC6 = fixture.calcData.constellationModifiers[BEIDOU].constellations["6"].map((modifier) => {
        const analysis = fixture.sandbox.GenshinModifierAnalyzer.analyzeModifier({ modifier, source: "constellation:C6", context: active.context });
        return { modifier, analysis, source: "constellation:C6", value: fixture.sandbox.GenshinCalcEngine.resolveModifierValue(modifier, active.context, active.context.uiState, analysis) };
    });
    const entryTotals = (id, element) => fixture.sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(
        { id, group: "normalAttack", attackType: "normalAttack", damageType: "normal", element },
        active.context,
        { applied: activeC6, candidates: [] }
    ).totals;
    assert.equal(entryTotals("beidou_test_electro", "electro").resistanceDebuff, 15);
    assert.equal(entryTotals("beidou_test_cryo", "cryo").resistanceDebuff, 15);
    assert.equal(entryTotals("beidou_test_physical", "physical").resistanceDebuff, 0);
    assert.equal(active.calculationRequest.uiState.conditionByModifier[groupKey].option, "active");
    const replay = calculate(fixture, JSON.parse(JSON.stringify(active.calculationRequest)));
    assert.equal(result(replay, "skilldamage").breakdown.resistance, -5);
    assert.equal(replay.context.effectiveStats.elementalMastery, 200);
});

test("Beidou party C6 state is shared, saved, and grants EM only to the field character", () => {
    const fixture = partyScenario();
    const before = calculate(fixture, fixture.request);
    assert.equal(before.context.characterId, FISCHL, "the calculation and party lead must be the same character");
    const modifiers = before.partyModifiers.filter((item) => [
        "c_10000024_6_1", "c_10000024_6_lucid_cryo_res", "c_10000024_6_lucid_active_em"
    ].includes(item.modifier.id));
    assert.equal(modifiers.length, 3);
    assert.ok(modifiers.every((item) => item.partyConditionStateKey === modifiers[0].partyConditionStateKey));
    assert.equal(new Set(modifiers.map((item) => item.targetOwner)).size, 2);
    const debuff = modifiers.find((item) => item.modifier.id === "c_10000024_6_1");
    const em = modifiers.find((item) => item.modifier.id === "c_10000024_6_lucid_active_em");
    assert.equal(debuff.targetOwner, "enemy");
    assert.equal(em.targetOwner, "activeCharacter");
    const stateKey = modifiers[0].partyConditionStateKey;
    fixture.request.party.conditionStates[stateKey] = { option: "burst" };
    modifiers.forEach((item) => { item.member.buffStates[item.toggleKey] = true; });
    const burst = calculate(fixture, fixture.request);
    assert.equal(result(burst, "damage_3").breakdown.resistance, -5);
    assert.equal(burst.context.effectiveStats.elementalMastery, 0, "support EM must not be read as field-character EM");
    assert.equal(result(burst, "normal_1damage").nonCrit, result(before, "normal_1damage").nonCrit);

    fixture.request.party.conditionStates[stateKey] = { option: "active" };
    const active = calculate(fixture, fixture.request);
    assert.equal(result(active, "damage_3").breakdown.resistance, -5);
    assert.equal(active.context.effectiveStats.elementalMastery, 200);
    assert.equal(result(active, "normal_1damage").nonCrit, result(before, "normal_1damage").nonCrit);
    const replay = calculate(fixture, JSON.parse(JSON.stringify(active.calculationRequest)));
    assert.equal(result(replay, "damage_3").breakdown.resistance, -5);
    assert.equal(replay.context.effectiveStats.elementalMastery, 200);

    const inactive = calculate(fixture, { ...active.calculationRequest, party: { ...active.calculationRequest.party, conditionStates: { [stateKey]: { option: "unlocked" } } } });
    assert.equal(result(inactive, "damage_3").breakdown.resistance, 10);
    assert.equal(inactive.context.effectiveStats.elementalMastery, 0);
});

test("Beidou C5 reflected burst talent level cannot activate the C6 condition", () => {
    const fixture = scenario(5);
    const c6 = fixture.calcData.constellationModifiers[BEIDOU].constellations["6"];
    assert.ok(c6.some((modifier) => modifier.id === "c_10000024_6_1"));
    const key = `constellation:C6:group:${WITCH_GROUP}`;
    setConditionElement(fixture.elements, key, "option", "active");
    const payload = calculate(fixture);
    assert.equal(result(payload, "skilldamage").breakdown.resistance, 10);
    assert.equal(payload.context.effectiveStats.elementalMastery, 0);
    assert.equal(payload.context.talentLevels.skill, 10);
    assert.equal(payload.context.talentLevels.burst, 10);
    assert.equal(result(payload, "damage").breakdown.scalingParts[0].talentMultiplier, 218.88,
        "C3 is already reflected in the final input and must not add three skill levels again");
    assert.equal(result(payload, "skilldamage").breakdown.scalingParts[0].talentMultiplier, 218.88,
        "C5 is already reflected in the final input and must not add three burst levels again");
    assert.equal(payload.candidateModifiers.some((item) => item.modifier.id.startsWith("c_10000024_6_")), false);
});
