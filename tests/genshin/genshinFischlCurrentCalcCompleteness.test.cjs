"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createScenarioHarness,
    prepareScenarioInputs,
    setConditionElement,
    setElement
} = require("./helpers/calcScenarioHarness.cjs");

const FISCHL = "10000031";
const FISCHL_LV10_MULTIPLIERS = {
    normal_1damage: 87.21, normal_2damage: 92.48, normal_3damage: 114.92, normal_4damage: 114.07,
    normal_5damage: 142.46, aimed_shot: 86.7, fully_charged_aimed_shot: 223.2,
    plunge_damage: 112.336, low_plungedamage: 224.6244, high_plungedamage: 280.568,
    damage: 159.84, damage_2: 207.792, damage_3: 374.4
};
const FISCHL_SKILL_BURST_SOURCE = {
    damage: [88.8, 95.46, 102.12, 111, 117.66, 124.32, 133.2, 142.08, 150.96, 159.84, 168.72, 177.6, 188.7, 199.8, 210.9],
    damage_2: [115.44, 124.098, 132.756, 144.3, 152.958, 161.616, 173.16, 184.704, 196.248, 207.792, 219.336, 230.88, 245.31, 259.74, 274.17],
    damage_3: [208, 223.6, 239.2, 260, 275.6, 291.2, 312, 332.8, 353.6, 374.4, 395.2, 416, 442, 468, 494]
};

function scenario(constellation = 0, characterId = FISCHL) {
    const fixture = createScenarioHarness();
    prepareScenarioInputs(fixture.elements, {
        characterId,
        constellation,
        stats: {
            atk: 1000,
            baseAtk: 500,
            def: 100,
            elementalMastery: 0,
            critRate: 0,
            critDamage: 0,
            elementDamageBonus: 0
        }
    });
    [1, 2, 4, 6].forEach((level) => setElement(fixture.elements, `genshinJsonEnableConstellationC${level}`, "", level <= constellation));
    return fixture;
}

function calculate(fixture, request) {
    return fixture.sandbox.GenshinCalcEngine.calculateDamageRequest(
        request || fixture.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm(),
        fixture.calcData
    );
}

function result(payload, id) {
    return payload.results.find((item) => item.entry.id === id || item.entry.effectId === id);
}

function witchModifiers(fixture) {
    return fixture.calcData.talentModifiers[FISCHL].passives
        .find((item) => item.sourceId === "lockedPassive").modifiers;
}

function modifierKey(fixture, modifier) {
    return fixture.sandbox.GenshinModifierAnalyzer.modifierStateKey(modifier, "talent:lockedPassive");
}

test("Fischl's existing normal, aimed, charged, plunge, Oz, summon, and burst entries reach damage at all 15 normal talent levels", () => {
    const fixture = scenario();
    const normalEntries = fixture.calcData.talentScalings[FISCHL].normalAttack.entries;
    const ids = [
        "normal_1damage", "normal_2damage", "normal_3damage", "normal_4damage", "normal_5damage",
        "aimed_shot", "fully_charged_aimed_shot", "plunge_damage", "low_plungedamage", "high_plungedamage"
    ];
    assert.deepEqual(normalEntries.map((entry) => entry.id), ids);

    const expectedById = Object.fromEntries(normalEntries.map((entry) => [
        entry.id,
        entry.scalings[0].valuesByLevel
    ]));
    const stableEntries = ["damage", "damage_2", "damage_3"];
    const stableAtTen = calculate(fixture);
    for (const [id, multiplier] of Object.entries(FISCHL_LV10_MULTIPLIERS)) {
        const hit = result(stableAtTen, id);
        assert.equal(hit.breakdown.scalingParts[0].talentMultiplier, multiplier, `${id} source Lv10 multiplier`);
        assert.equal(hit.breakdown.scalingParts[0].baseDamage, 1000 * multiplier / 100, `${id} source Lv10 base damage`);
    }
    for (let level = 1; level <= 15; level++) {
        setElement(fixture.elements, "genshinNormalTalentLevel", level);
        const payload = calculate(fixture);
        for (const id of ids) {
            const hit = result(payload, id);
            assert.ok(hit?.nonCrit > 0, id);
            const multiplier = expectedById[id][level];
            assert.equal(hit.breakdown.scalingParts[0].talentMultiplier, multiplier, `${id} at talent ${level}`);
            assert.equal(hit.breakdown.scalingParts[0].baseDamage, 1000 * multiplier / 100, `${id} base damage at talent ${level}`);
        }
        stableEntries.forEach((id) => assert.equal(result(payload, id).nonCrit, result(stableAtTen, id).nonCrit, id));
    }

    for (const id of stableEntries) assert.ok(result(stableAtTen, id)?.nonCrit > 0, id);
    assert.equal(result(stableAtTen, "damage").entry.group, "skill");
    assert.equal(result(stableAtTen, "damage_2").entry.group, "skill");
    assert.equal(result(stableAtTen, "damage_3").entry.group, "burst");
});

test("Fischl Oz skill and burst rows match their independent source multipliers at all 15 levels", () => {
    const fixture = scenario();
    for (let level = 1; level <= 15; level++) {
        setElement(fixture.elements, "genshinSkillTalentLevel", level);
        setElement(fixture.elements, "genshinBurstTalentLevel", level);
        const payload = calculate(fixture);
        for (const id of Object.keys(FISCHL_SKILL_BURST_SOURCE)) {
            const hit = result(payload, id);
            const multiplier = FISCHL_SKILL_BURST_SOURCE[id][level - 1];
            assert.equal(hit.breakdown.scalingParts[0].talentMultiplier, multiplier, `${id} at level ${level}`);
            assert.equal(hit.breakdown.scalingParts[0].baseDamage, 1000 * multiplier / 100, `${id} base damage at level ${level}`);
        }
    }
});

test("Fischl C3/C5 stay reflected in final talent levels without adding a second level bonus", () => {
    const fixture = scenario(6);
    const payload = calculate(fixture);
    const reflected = payload.candidateModifiers.filter((item) =>
        ["c_10000031_3_1", "c_10000031_5_1"].includes(item.modifier?.id));
    assert.equal(reflected.length, 2);
    assert.ok(reflected.every((item) => item.analysis.inputStatus === "includedInInput"));

    for (const [id, entryId, group] of [
        ["c_10000031_3_1", "damage", "skill"],
        ["c_10000031_5_1", "damage_3", "burst"]
    ]) {
        const talent = payload.candidateModifiers.find((item) => item.modifier?.id === id);
        const entry = result(payload, entryId);
        assert.equal(entry.breakdown.scalingParts[0].talentMultiplier,
            fixture.calcData.talentScalings[FISCHL][group].entries
                .find((item) => item.id === entryId).scalings[0].valuesByLevel[10]);
    }
});

test("Fischl Witch ATK and EM states save, replay, and affect real damage while locked or merely unlocked stays inactive", () => {
    const fixture = scenario();
    const modifiers = witchModifiers(fixture);
    assert.equal(modifiers.length, 2);
    const atk = modifiers.find((item) => item.applyTo.includes("atkPercent"));
    const em = modifiers.find((item) => item.applyTo.includes("elementalMastery"));
    const atkKey = modifierKey(fixture, atk);
    const emKey = modifierKey(fixture, em);
    assert.equal(atkKey, "talent:lockedPassive:group:witch-fischl-overload");
    assert.equal(emKey, "talent:lockedPassive:group:witch-fischl-electrocharged");

    const locked = calculate(fixture);
    assert.equal(locked.context.effectiveStats.atk, 1000);
    assert.equal(locked.context.effectiveStats.elementalMastery, 0);
    setConditionElement(fixture.elements, atkKey, "option", "unlocked");
    setConditionElement(fixture.elements, emKey, "option", "unlocked");
    const unlocked = calculate(fixture);
    assert.equal(unlocked.context.effectiveStats.atk, 1000);
    assert.equal(unlocked.context.effectiveStats.elementalMastery, 0);
    assert.equal(result(unlocked, "normal_1damage").nonCrit, result(locked, "normal_1damage").nonCrit);

    setConditionElement(fixture.elements, atkKey, "option", "active");
    const atkActive = calculate(fixture);
    assert.equal(atkActive.context.effectiveStats.atk, 1112.5);
    assert.ok(result(atkActive, "normal_1damage").nonCrit > result(unlocked, "normal_1damage").nonCrit);
    assert.equal(result(atkActive, "normal_1damage").breakdown.scalingParts[0].baseDamage, 1112.5 * 0.8721);
    assert.equal(result(atkActive, "damage").breakdown.scalingParts[0].talentMultiplier, result(unlocked, "damage").breakdown.scalingParts[0].talentMultiplier);
    assert.equal(atkActive.calculationRequest.uiState.conditionByModifier[atkKey].option, "active");

    setConditionElement(fixture.elements, atkKey, "option", "unlocked");
    setConditionElement(fixture.elements, emKey, "option", "active");
    const emActive = calculate(fixture);
    assert.equal(emActive.context.effectiveStats.elementalMastery, 90);
    assert.equal(emActive.context.effectiveStats.atk, 1000);
    assert.equal(result(emActive, "normal_1damage").nonCrit, result(unlocked, "normal_1damage").nonCrit);
    assert.equal(emActive.calculationRequest.uiState.conditionByModifier[emKey].option, "active");

    const replay = calculate(fixture, JSON.parse(JSON.stringify(emActive.calculationRequest)));
    assert.equal(replay.context.effectiveStats.elementalMastery, 90);
    assert.equal(result(replay, "normal_1damage").nonCrit, result(emActive, "normal_1damage").nonCrit);
    assert.equal(result(replay, "damage").nonCrit, result(emActive, "damage").nonCrit);
});

test("Fischl C6 amplifies only active Witch ATK and EM buffs, preserves its 30% Oz hit, and saves one shared control", () => {
    const fixture = scenario(6);
    const c6Modifiers = fixture.calcData.constellationModifiers[FISCHL].constellations["6"];
    const atkAmplification = c6Modifiers.find((item) => item.id === "c_10000031_6_witch_atk_amplification");
    const emAmplification = c6Modifiers.find((item) => item.id === "c_10000031_6_witch_em_amplification");
    assert.ok(atkAmplification && emAmplification);
    assert.equal(atkAmplification.conditionGroupId, "fischl-c6-witch-amplification");
    assert.equal(emAmplification.conditionGroupId, atkAmplification.conditionGroupId);

    const panel = fixture.sandbox.GenshinCalcConditions.conditionPanelState(
        fixture.sandbox.GenshinCalcEngine.buildCharacterCalcContext(), fixture.calcData
    );
    const key = "character:10000031:group:fischl-c6-witch-amplification";
    const rendered = panel.cards.flatMap((card) => (card.sections || []).flatMap((section) => section.controls || []))
        .filter((control) => control.key === key);
    assert.equal(rendered.length, 1);
    assert.deepEqual(Array.from(rendered[0].options, (option) => option.value), ["inactive", "active"]);

    const atkKey = "talent:lockedPassive:group:witch-fischl-overload";
    const emKey = "talent:lockedPassive:group:witch-fischl-electrocharged";
    const ozKey = "character:10000031:group:fischl-oz-state";
    setConditionElement(fixture.elements, key, "option", "active");
    setConditionElement(fixture.elements, atkKey, "option", "unlocked");
    setConditionElement(fixture.elements, emKey, "option", "unlocked");
    setConditionElement(fixture.elements, ozKey, "option", "present");
    const amplificationOnly = calculate(fixture);
    assert.equal(amplificationOnly.context.effectiveStats.atk, 1000, "C6 amplification does not activate its base Witch buff");
    assert.equal(amplificationOnly.context.effectiveStats.elementalMastery, 0);
    assert.equal(result(amplificationOnly, "normal_1damage").breakdown.statBonus.atk, 0);
    assert.equal(result(amplificationOnly, "c_10000031_6_1_resolved_2").breakdown.scalingParts[0].talentMultiplier, 30);

    setConditionElement(fixture.elements, atkKey, "option", "active");
    setConditionElement(fixture.elements, emKey, "option", "active");
    setConditionElement(fixture.elements, key, "option", "inactive");
    const baseOnly = calculate(fixture);
    assert.equal(baseOnly.context.effectiveStats.atk, 1112.5);
    assert.equal(baseOnly.context.effectiveStats.elementalMastery, 90);
    assert.equal(result(baseOnly, "c_10000031_6_1_resolved_2").breakdown.scalingParts[0].talentMultiplier, 30);
    assert.equal(result(baseOnly, "c_10000031_6_1_resolved_2").breakdown.scalingParts[0].baseDamage, baseOnly.context.effectiveStats.atk * 0.3);

    setConditionElement(fixture.elements, emKey, "option", "unlocked");
    setConditionElement(fixture.elements, key, "option", "active");
    const atkAmplified = calculate(fixture);
    assert.equal(atkAmplified.context.effectiveStats.atk, 1225);
    assert.equal(atkAmplified.context.effectiveStats.elementalMastery, 0, "ATK amplification requires only the ATK Witch buff");

    setConditionElement(fixture.elements, atkKey, "option", "unlocked");
    setConditionElement(fixture.elements, emKey, "option", "active");
    const emAmplified = calculate(fixture);
    assert.equal(emAmplified.context.effectiveStats.atk, 1000, "EM amplification does not activate the ATK Witch buff");
    assert.equal(emAmplified.context.effectiveStats.elementalMastery, 180);

    setConditionElement(fixture.elements, atkKey, "option", "active");
    setElement(fixture.elements, "genshinJsonReactionOption", "aggravate");
    const active = calculate(fixture);
    assert.equal(active.context.effectiveStats.atk, 1225);
    assert.equal(active.context.effectiveStats.elementalMastery, 180);
    assert.equal(result(active, "normal_1damage").breakdown.statBonus.atk, 225);
    assert.equal(result(active, "normal_1damage").breakdown.statBonus.elementalMastery, 180);
    assert.ok(result(active, "normal_1damage").nonCrit > result(amplificationOnly, "normal_1damage").nonCrit);
    assert.ok(result(active, "damage").breakdown.reactionAdditiveBaseDamage > result(amplificationOnly, "damage").breakdown.reactionAdditiveBaseDamage);
    const ozHit = result(active, "c_10000031_6_1_resolved_2");
    assert.equal(ozHit.breakdown.scalingParts[0].talentMultiplier, 30);
    assert.equal(ozHit.breakdown.scalingParts[0].baseDamage, 1225 * 0.3);
    assert.equal(active.calculationRequest.uiState.conditionByModifier[key].option, "active");
    const replay = calculate(fixture, JSON.parse(JSON.stringify(active.calculationRequest)));
    assert.equal(replay.context.effectiveStats.atk, 1225);
    assert.equal(replay.context.effectiveStats.elementalMastery, 180);
    assert.equal(result(replay, "damage").breakdown.reactionAdditiveBaseDamage, result(active, "damage").breakdown.reactionAdditiveBaseDamage);

    const c5 = scenario(5);
    setConditionElement(c5.elements, atkKey, "option", "active");
    setConditionElement(c5.elements, emKey, "option", "active");
    setConditionElement(c5.elements, key, "option", "active");
    const stale = calculate(c5);
    assert.equal(stale.context.effectiveStats.atk, 1112.5);
    assert.equal(stale.context.effectiveStats.elementalMastery, 90);
    assert.equal(stale.candidateModifiers.some((item) => item.modifier?.id === "c_10000031_6_witch_atk_amplification"), false);
});

test("Fischl's party Witch ATK and EM buffs are independent, replayable, and do not change enemy resistance", () => {
    const fixture = scenario(0, "10000020");
    const request = fixture.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    request.party = {
        schemaVersion: 2,
        focusSlot: 1,
        conditionStates: {},
        members: [
            { slot: 1, role: "main", enabled: true, characterId: "10000020" },
            {
                slot: 2,
                role: "support",
                enabled: true,
                characterId: FISCHL,
                constellation: 0,
                stats: { atk: 1000, baseAtk: 500, elementalMastery: 0 },
                talentLevels: { normal: 10, skill: 10, burst: 10 },
                buffStates: {}
            }
        ]
    };
    const before = calculate(fixture, request);
    const atkBuff = before.partyModifiers.find((item) => item.modifier.id === "t_10000031_lockedPassive_overload_atk");
    const emBuff = before.partyModifiers.find((item) => item.modifier.id === "t_10000031_lockedPassive_electrocharged_em");
    assert.ok(atkBuff && emBuff);
    assert.equal(atkBuff.targetOwner, "activeCharacter");
    assert.equal(emBuff.targetOwner, "activeCharacter");
    assert.notEqual(atkBuff.status, "ready");
    assert.notEqual(emBuff.status, "ready");

    request.party.conditionStates[atkBuff.partyConditionStateKey] = { option: "active" };
    request.party.members[1].buffStates[atkBuff.toggleKey] = true;
    const atkOnly = calculate(fixture, request);
    assert.equal(atkOnly.context.effectiveStats.atk, 1112.5);
    assert.equal(atkOnly.context.effectiveStats.elementalMastery, 0);
    assert.ok(result(atkOnly, "normal_1damage").nonCrit > result(before, "normal_1damage").nonCrit);
    assert.equal(result(atkOnly, "damage").breakdown.scalingParts[0].talentMultiplier, result(before, "damage").breakdown.scalingParts[0].talentMultiplier);
    assert.equal(result(atkOnly, "normal_1damage").breakdown.resistance, result(before, "normal_1damage").breakdown.resistance);
    assert.equal(result(atkOnly, "skilldamage").breakdown.resistance, result(before, "skilldamage").breakdown.resistance);

    request.party.members[1].buffStates[atkBuff.toggleKey] = false;
    request.party.conditionStates[atkBuff.partyConditionStateKey] = { option: "unlocked" };
    request.party.conditionStates[emBuff.partyConditionStateKey] = { option: "active" };
    request.party.members[1].buffStates[emBuff.toggleKey] = true;
    const emOnly = calculate(fixture, request);
    assert.equal(emOnly.context.effectiveStats.atk, 1000);
    assert.equal(emOnly.context.effectiveStats.elementalMastery, 90);
    assert.equal(result(emOnly, "normal_1damage").nonCrit, result(before, "normal_1damage").nonCrit);
    assert.equal(result(emOnly, "normal_1damage").breakdown.resistance, result(before, "normal_1damage").breakdown.resistance);
    assert.equal(result(emOnly, "skilldamage").breakdown.resistance, result(before, "skilldamage").breakdown.resistance);

    const replay = calculate(fixture, JSON.parse(JSON.stringify(emOnly.calculationRequest)));
    assert.equal(replay.context.effectiveStats.elementalMastery, 90);
    assert.equal(result(replay, "normal_1damage").nonCrit, result(emOnly, "normal_1damage").nonCrit);
    assert.equal(result(replay, "normal_1damage").breakdown.resistance, result(before, "normal_1damage").breakdown.resistance);
});

test("Fischl's party C6 amplification needs each base-buff option and checkbox, then saves and replays", () => {
    const fixture = scenario(0, "10000020");
    const request = fixture.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    request.reactionOptionKey = "aggravate";
    request.party = {
        schemaVersion: 2,
        focusSlot: 1,
        conditionStates: {},
        members: [
            { slot: 1, role: "main", enabled: true, characterId: "10000020" },
            {
                slot: 2,
                role: "support",
                enabled: true,
                characterId: FISCHL,
                constellation: 6,
                stats: { atk: 1000, baseAtk: 500, elementalMastery: 0 },
                talentLevels: { normal: 10, skill: 10, burst: 10 },
                buffStates: {}
            }
        ]
    };

    const before = calculate(fixture, request);
    const atkBuff = before.partyModifiers.find((item) => item.modifier.id === "t_10000031_lockedPassive_overload_atk");
    const emBuff = before.partyModifiers.find((item) => item.modifier.id === "t_10000031_lockedPassive_electrocharged_em");
    const atkAmp = before.partyModifiers.find((item) => item.modifier.id === "c_10000031_6_witch_atk_amplification");
    const emAmp = before.partyModifiers.find((item) => item.modifier.id === "c_10000031_6_witch_em_amplification");
    assert.ok(atkBuff && emBuff && atkAmp && emAmp);
    assert.equal(atkAmp.targetOwner, "activeCharacter");
    assert.equal(emAmp.targetOwner, "activeCharacter");
    assert.equal(atkAmp.partyConditionStateKey, "party:2:10000031:group:fischl-c6-witch-amplification");
    assert.equal(emAmp.partyConditionStateKey, atkAmp.partyConditionStateKey);
    assert.equal(atkAmp.toggleKey, emAmp.toggleKey);

    const ampKey = atkAmp.partyConditionStateKey;
    request.party.conditionStates[ampKey] = { option: "inactive" };
    request.party.conditionStates[atkBuff.partyConditionStateKey] = { option: "active" };
    request.party.conditionStates[emBuff.partyConditionStateKey] = { option: "active" };
    request.party.members[1].buffStates[atkBuff.toggleKey] = true;
    request.party.members[1].buffStates[emBuff.toggleKey] = true;
    const baseOnly = calculate(fixture, request);
    assert.equal(baseOnly.context.effectiveStats.atk, 1112.5);
    assert.equal(baseOnly.context.effectiveStats.elementalMastery, 90);

    request.party.conditionStates[ampKey] = { option: "active" };
    request.party.conditionStates[atkBuff.partyConditionStateKey] = { option: "unlocked" };
    request.party.conditionStates[emBuff.partyConditionStateKey] = { option: "unlocked" };
    request.party.members[1].buffStates[atkBuff.toggleKey] = false;
    request.party.members[1].buffStates[emBuff.toggleKey] = false;
    request.party.conditionStates[atkBuff.partyConditionStateKey] = { option: "unlocked" };
    request.party.conditionStates[emBuff.partyConditionStateKey] = { option: "unlocked" };
    const amplificationOnly = calculate(fixture, request);
    assert.equal(amplificationOnly.context.effectiveStats.atk, 1000);
    assert.equal(amplificationOnly.context.effectiveStats.elementalMastery, 0);

    request.party.conditionStates[atkBuff.partyConditionStateKey] = { option: "active" };
    request.party.conditionStates[emBuff.partyConditionStateKey] = { option: "active" };
    const checkboxOff = calculate(fixture, request);
    assert.equal(checkboxOff.context.effectiveStats.atk, 1000, "active ATK condition still needs its party checkbox");
    assert.equal(checkboxOff.context.effectiveStats.elementalMastery, 0, "active EM condition still needs its party checkbox");

    request.party.members[1].buffStates[atkBuff.toggleKey] = true;
    const atkOnly = calculate(fixture, request);
    assert.equal(atkOnly.context.effectiveStats.atk, 1225);
    assert.equal(atkOnly.context.effectiveStats.elementalMastery, 0);

    request.party.members[1].buffStates[atkBuff.toggleKey] = false;
    request.party.conditionStates[emBuff.partyConditionStateKey] = { option: "active" };
    request.party.members[1].buffStates[emBuff.toggleKey] = true;
    const emOnly = calculate(fixture, request);
    assert.equal(emOnly.context.effectiveStats.atk, 1000);
    assert.equal(emOnly.context.effectiveStats.elementalMastery, 180);
    assert.ok(result(emOnly, "skilldamage").breakdown.reactionAdditiveBaseDamage > result(amplificationOnly, "skilldamage").breakdown.reactionAdditiveBaseDamage);

    request.party.conditionStates[atkBuff.partyConditionStateKey] = { option: "active" };
    request.party.members[1].buffStates[atkBuff.toggleKey] = true;
    const both = calculate(fixture, request);
    assert.equal(both.context.effectiveStats.atk, 1225);
    assert.equal(both.context.effectiveStats.elementalMastery, 180);
    assert.ok(result(both, "normal_1damage").nonCrit > result(amplificationOnly, "normal_1damage").nonCrit);
    assert.ok(result(both, "skilldamage").breakdown.reactionAdditiveBaseDamage > result(atkOnly, "skilldamage").breakdown.reactionAdditiveBaseDamage);
    const replay = calculate(fixture, JSON.parse(JSON.stringify(both.calculationRequest)));
    assert.equal(replay.context.effectiveStats.atk, 1225);
    assert.equal(replay.context.effectiveStats.elementalMastery, 180);
    assert.equal(result(replay, "skilldamage").breakdown.reactionAdditiveBaseDamage, result(both, "skilldamage").breakdown.reactionAdditiveBaseDamage);
});

test("Fischl A1 adds one charged hit only to a fully charged arrow and saves its activation", () => {
    const fixture = scenario();
    const key = "talent:passive1:group:fischl-charged-hit-oz";
    const chargedMultiplierByLevel = { 1: 124, 7: 186, 15: 294.5 };
    for (const [level, multiplier] of Object.entries(chargedMultiplierByLevel)) {
        setElement(fixture.elements, "genshinNormalTalentLevel", Number(level));
        setConditionElement(fixture.elements, key, "option", "inactive");
        const inactive = calculate(fixture);
        assert.equal(inactive.results.some((item) => item.entry.effectId === "t_10000031_passive1_thundering_retribution"), false);
        const chargedBefore = result(inactive, "fully_charged_aimed_shot");

        setConditionElement(fixture.elements, key, "option", "active");
        const active = calculate(fixture);
        const extra = active.results.filter((item) => item.entry.effectId === "t_10000031_passive1_thundering_retribution");
        assert.equal(extra.length, 1, `level ${level}`);
        assert.equal(extra[0].entry.attackType, "chargedAttack");
        assert.equal(extra[0].entry.group, "extraDamage");
        assert.equal(extra[0].breakdown.scalingParts[0].baseDamage, 1000 * multiplier / 100 * 1.527, `level ${level}`);
        assert.equal(result(active, "aimed_shot").nonCrit, result(inactive, "aimed_shot").nonCrit);
        assert.equal(result(active, "fully_charged_aimed_shot").nonCrit, chargedBefore.nonCrit);
        assert.equal(active.calculationRequest.uiState.conditionByModifier[key].option, "active");
        const replay = calculate(fixture, JSON.parse(JSON.stringify(active.calculationRequest)));
        assert.equal(replay.results.filter((item) => item.entry.effectId === "t_10000031_passive1_thundering_retribution").length, 1);
        assert.equal(result(replay, "fully_charged_aimed_shot").nonCrit, chargedBefore.nonCrit);
    }

    setElement(fixture.elements, "genshinNormalTalentLevel", 10);
    setConditionElement(fixture.elements, key, "option", "active");
    const request = fixture.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    request.weaponId = "15301";
    request.artifactSetMode = "4pc";
    request.artifactSetIds = ["15003"];
    const withChargedBonus = calculate(fixture, request);
    const extra = result(withChargedBonus, "t_10000031_passive1_thundering_retribution");
    assert.equal(extra.breakdown.damageBonus, 35);
    assert.equal(result(withChargedBonus, "damage").breakdown.damageBonus, 0, "charged attack bonus must not affect Oz skill damage");
});

test("Fischl A4 uses the shared Oz state and does not alter the existing Oz attack", () => {
    const fixture = scenario();
    const key = "character:10000031:group:fischl-oz-state";
    setConditionElement(fixture.elements, key, "option", "inactive");
    const absent = calculate(fixture);
    assert.equal(absent.results.some((item) => item.entry.effectId === "t_10000031_passive2_undone_be_thy_sin"), false);
    const ozBefore = result(absent, "damage");

    setConditionElement(fixture.elements, key, "option", "present");
    const present = calculate(fixture);
    const extra = present.results.filter((item) => item.entry.effectId === "t_10000031_passive2_undone_be_thy_sin");
    assert.equal(extra.length, 1);
    assert.equal(extra[0].entry.element, "雷");
    assert.equal(extra[0].entry.group, "extraDamage");
    assert.equal(extra[0].breakdown.scalingParts[0].baseDamage, 800);
    assert.equal(result(present, "damage").nonCrit, ozBefore.nonCrit);
    assert.equal(present.calculationRequest.uiState.conditionByModifier[key].option, "present");
    const replay = calculate(fixture, JSON.parse(JSON.stringify(present.calculationRequest)));
    assert.equal(replay.results.filter((item) => item.entry.effectId === "t_10000031_passive2_undone_be_thy_sin").length, 1);
});

test("Fischl Oz-present state is one saved control shared by A4, C1, and C6", () => {
    const fixture = scenario(6);
    const panel = fixture.sandbox.GenshinCalcConditions.conditionPanelState(
        fixture.sandbox.GenshinCalcEngine.buildCharacterCalcContext(), fixture.calcData
    );
    const controls = [
        ...panel.complexConditionInputs
    ].filter((item) => item.key === "character:10000031:group:fischl-oz-state");
    assert.equal(controls.length, 1);
    assert.equal(controls[0].value, "inactive");
    const cardControls = panel.cards.flatMap((card) => (card.sections || []).flatMap((section) => section.controls || []))
        .filter((item) => item.key === "character:10000031:group:fischl-oz-state");
    assert.equal(cardControls.length, 1, "the shared Oz control must render exactly once across passive and constellation cards");
    assert.equal(cardControls[0].modifierId, "t_10000031_passive2_undone_be_thy_sin");
    setConditionElement(fixture.elements, "character:10000031:group:fischl-oz-state", "option", "present");
    const payload = calculate(fixture);
    assert.equal(payload.calculationRequest.uiState.conditionByModifier["character:10000031:group:fischl-oz-state"].option, "present");
    for (const key of [
        "talent:passive2:group:fischl-oz-state",
        "constellation:C1:group:fischl-oz-state",
        "constellation:C6:group:fischl-oz-state"
    ]) {
        assert.equal(payload.calculationRequest.uiState.conditionByModifier[key].option, "present", key);
    }
    assert.equal(payload.results.some((item) => item.entry.effectId === "t_10000031_passive2_undone_be_thy_sin"), true);
});

test("Fischl C1 and C6 extras are distinct from their triggering damage, while C4 stays a burst extra", () => {
    const fixture = scenario(6);
    [1, 2, 4, 6].forEach((level) => setElement(fixture.elements, `genshinJsonEnableConstellationC${level}`, "", false));
    const ozKey = "character:10000031:group:fischl-oz-state";
    setConditionElement(fixture.elements, ozKey, "option", "inactive");
    const base = calculate(fixture);
    assert.equal(base.results.some((item) => ["c_10000031_1_1_resolved_2", "c_10000031_4_1_resolved_2", "c_10000031_6_1_resolved_2"].includes(item.entry.effectId)), false);

    setElement(fixture.elements, "genshinJsonEnableConstellationC1", "", true);
    setConditionElement(fixture.elements, ozKey, "option", "absent");
    const c1 = calculate(fixture);
    const c1Extras = c1.results.filter((item) => item.entry.effectId === "c_10000031_1_1_resolved_2");
    assert.equal(c1Extras.length, 1);
    assert.ok(c1Extras.every((item) => item.entry.element === "physical" && item.breakdown.scalingParts[0].baseDamage === 220));
    assert.equal(result(c1, "normal_1damage").nonCrit, result(base, "normal_1damage").nonCrit);

    setElement(fixture.elements, "genshinJsonEnableConstellationC4", "", true);
    const c4 = calculate(fixture);
    const c4Extra = c4.results.find((item) => item.entry.effectId === "c_10000031_4_1_resolved_2");
    assert.ok(c4Extra);
    assert.equal(c4Extra.entry.group, "extraDamage");
    assert.equal(c4Extra.breakdown.scalingParts[0].baseDamage, 2220);
    assert.equal(result(c4, "damage_3").nonCrit, result(base, "damage_3").nonCrit);

    setElement(fixture.elements, "genshinJsonEnableConstellationC6", "", true);
    setConditionElement(fixture.elements, ozKey, "option", "present");
    const c6 = calculate(fixture);
    const c6Extra = c6.results.find((item) => item.entry.effectId === "c_10000031_6_1_resolved_2");
    assert.ok(c6Extra);
    assert.equal(c6Extra.entry.element, "雷");
    assert.equal(c6Extra.entry.group, "extraDamage");
    assert.equal(c6Extra.breakdown.scalingParts[0].baseDamage, 300);
    assert.equal(result(c6, "damage").nonCrit, result(base, "damage").nonCrit);
});

test("Fischl C2 adds 200% ATK to the existing Oz summon hit without creating another hit", () => {
    const fixture = scenario(2);
    setElement(fixture.elements, "genshinJsonEnableConstellationC2", "", false);
    const inactive = calculate(fixture);
    const summonBefore = result(inactive, "damage_2");
    const ozBefore = result(inactive, "damage");
    assert.ok(summonBefore && ozBefore);

    setElement(fixture.elements, "genshinJsonEnableConstellationC2", "", true);
    const active = calculate(fixture);
    const summon = result(active, "damage_2");
    assert.equal(active.results.filter((item) => item.entry.effectId === "c_10000031_2_1_resolved_2").length, 0);
    assert.equal(summon.breakdown.additiveBaseDamage, 2000);
    assert.ok(summon.nonCrit > summonBefore.nonCrit);
    assert.equal(result(active, "damage").nonCrit, ozBefore.nonCrit);
    assert.equal(active.results.filter((item) => item.entry.id === "damage_2").length, 1);
});

test("Fischl's C1 physical hit uses physical resistance while A4 and C6 use Electro resistance", () => {
    const c1Fixture = scenario(6);
    setElement(c1Fixture.elements, "genshinEnemyElementalResistanceInput", 50);
    setElement(c1Fixture.elements, "genshinEnemyPhysicalResistanceInput", 20);
    [2, 4, 6].forEach((level) => setElement(c1Fixture.elements, `genshinJsonEnableConstellationC${level}`, "", false));
    setElement(c1Fixture.elements, "genshinJsonEnableConstellationC1", "", true);
    setConditionElement(c1Fixture.elements, "character:10000031:group:fischl-oz-state", "option", "absent");
    const c1Payload = calculate(c1Fixture);
    const c1 = result(c1Payload, "c_10000031_1_1_resolved_2");
    assert.equal(c1.entry.element, "physical");
    assert.equal(c1.breakdown.resistance, 20);
    assert.equal(c1.breakdown.resistanceMultiplier, 0.8);
    assert.equal(result(c1Payload, "normal_1damage").breakdown.resistanceMultiplier, 0.8);

    const electroFixture = scenario(6);
    setElement(electroFixture.elements, "genshinEnemyElementalResistanceInput", 50);
    setElement(electroFixture.elements, "genshinEnemyPhysicalResistanceInput", 20);
    [1, 2, 4].forEach((level) => setElement(electroFixture.elements, `genshinJsonEnableConstellationC${level}`, "", false));
    setElement(electroFixture.elements, "genshinJsonEnableConstellationC6", "", true);
    setConditionElement(electroFixture.elements, "character:10000031:group:fischl-oz-state", "option", "present");
    const electroPayload = calculate(electroFixture);
    const a4 = result(electroPayload, "t_10000031_passive2_undone_be_thy_sin");
    const c6 = result(electroPayload, "c_10000031_6_1_resolved_2");
    for (const hit of [a4, c6]) {
        assert.equal(hit.entry.element, "雷");
        assert.equal(hit.breakdown.resistance, 50);
        assert.equal(hit.breakdown.resistanceMultiplier, 0.5);
    }
    assert.equal(result(electroPayload, "normal_1damage").breakdown.resistanceMultiplier, 0.8);
    assert.equal(result(electroPayload, "damage").breakdown.resistanceMultiplier, 0.5);
});
