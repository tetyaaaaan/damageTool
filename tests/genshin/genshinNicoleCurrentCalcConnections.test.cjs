"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createScenarioHarness,
    prepareScenarioInputs,
    setElement
} = require("./helpers/calcScenarioHarness.cjs");

const NICOLE = "10000131";
const GANYU = "10000037";
const SUCROSE = "10000043";
const C1_ID = "c_10000131_1_1";
const C4_ID = "c_nicole_4_guidance_blessing_atk_add_v7";
const C6_ID = "c_10000131_6_1";
const HEXEREI_PROJECTION_ATK_ID = "t_10000131_hexerei_projection_atk";

function fixture({ characterId = NICOLE, constellation = 6, stats } = {}) {
    const value = createScenarioHarness();
    prepareScenarioInputs(value.elements, {
        characterId,
        constellation,
        stats: stats || {
            baseAtk: 1000,
            atk: 2000,
            critRate: 0,
            critDamage: 0,
            elementDamageBonus: 0
        }
    });
    return value;
}

function calculate(value, request = value.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm()) {
    return value.sandbox.GenshinCalcEngine.calculateDamageRequest(request, value.calcData);
}

function byId(payload, id) {
    return payload.results.find((item) => item.entry.id === id || item.entry.effectId === id);
}

function setMainOption(elements, id, group, value) {
    const key = `constellation:C${id}:group:${group}`;
    elements[`condition:${key}:option`] = {
        value,
        checked: false,
        dataset: { genshinConditionKey: key, genshinConditionKind: "option" }
    };
    return key;
}

function setMainGroupOption(elements, key, value) {
    elements[`condition:${key}:option`] = {
        value,
        checked: false,
        dataset: { genshinConditionKey: key, genshinConditionKind: "option" }
    };
    return key;
}

function partyRequest(value, characterId = GANYU, constellation = 6) {
    prepareScenarioInputs(value.elements, {
        characterId,
        constellation: 0,
        stats: {
            baseAtk: 500,
            atk: 2500,
            critRate: 0,
            critDamage: 0,
            elementDamageBonus: 0
        }
    });
    const request = value.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    request.party = {
        schemaVersion: 2,
        focusSlot: 1,
        conditionStates: {},
        members: [
            {
                slot: 1, role: "main", enabled: true, characterId,
                element: value.calcData.characters[characterId].element,
                constellation: 0, stats: request.stats, buffStates: {}
            },
            {
                slot: 2, role: "support", enabled: true, characterId: NICOLE,
                element: value.calcData.characters[NICOLE].element,
                constellation, talentLevels: { normal: 10, skill: 10, burst: 10 },
                level: 90, stats: { baseAtk: 1000, atk: 2000 }, buffStates: {}
            }
        ]
    };
    return request;
}

function setPartyOption(request, candidate, value) {
    request.party.conditionStates[candidate.partyConditionStateKey] = { option: value };
    request.party.members[1].buffStates[candidate.toggleKey] = true;
}

test("Nicole C1 is off by default and adds one own-element 600% active-character ATK hit when on", () => {
    const own = fixture({ constellation: 1 });
    const off = calculate(own);
    assert.equal(off.results.some((item) => item.entry.effectId === C1_ID), false);

    const onKey = setMainOption(own.elements, 1, "nicole-c1-projection", "active");
    const on = calculate(own);
    const extras = on.results.filter((item) => item.entry.effectId === C1_ID);
    assert.equal(extras.length, 1);
    assert.equal(extras[0].entry.group, "extraDamage");
    assert.equal(extras[0].entry.attackType, "extraDamage");
    assert.equal(extras[0].entry.element, "炎");
    assert.equal(extras[0].breakdown.scalingParts[0].statValue, on.context.effectiveStats.atk);
    assert.equal(extras[0].breakdown.scalingParts[0].talentMultiplier, 600);
    assert.equal(extras[0].breakdown.resistance, 10);
    assert.equal(on.calculationRequest.uiState.conditionByModifier[onKey].option, "active");
    const ownReplay = calculate(own, JSON.parse(JSON.stringify(on.calculationRequest)));
    const replayedOwnProjection = ownReplay.results.find((item) => item.entry.effectId === C1_ID);
    assert.equal(replayedOwnProjection.entry.element, extras[0].entry.element);
    assert.equal(replayedOwnProjection.breakdown.scalingParts[0].statValue, extras[0].breakdown.scalingParts[0].statValue);
    assert.equal(replayedOwnProjection.nonCrit, extras[0].nonCrit);

    const party = fixture();
    const request = partyRequest(party);
    const before = calculate(party, request);
    const candidate = before.partyModifiers.find((item) => item.modifier.id === C1_ID);
    assert.ok(candidate);
    setPartyOption(request, candidate, "active");
    const after = calculate(party, request);
    const projection = after.results.filter((item) => item.entry.effectId === C1_ID);
    assert.equal(projection.length, 1);
    assert.equal(projection[0].entry.element, "氷");
    assert.equal(projection[0].breakdown.scalingParts[0].statValue, 2500);
    assert.equal(projection[0].breakdown.resistance, 10);
    const partyReplay = calculate(party, JSON.parse(JSON.stringify(after.calculationRequest)));
    const replayedPartyProjection = partyReplay.results.find((item) => item.entry.effectId === C1_ID);
    assert.equal(replayedPartyProjection.entry.element, projection[0].entry.element);
    assert.equal(replayedPartyProjection.breakdown.scalingParts[0].statValue, projection[0].breakdown.scalingParts[0].statValue);
    assert.equal(replayedPartyProjection.nonCrit, projection[0].nonCrit);
});

test("Nicole C4 adds 70% of provider ATK to existing self and party hits without creating an entry", () => {
    const own = fixture({ constellation: 4 });
    const base = calculate(own);
    const ownHit = byId(base, "skilldamage");
    const key = setMainOption(own.elements, 4, "nicole-pathfinder-blessing", "active");
    const active = calculate(own);
    const buffed = byId(active, "skilldamage");
    assert.equal(buffed.breakdown.additiveBaseDamage - ownHit.breakdown.additiveBaseDamage, 1400);
    assert.equal(active.results.filter((item) => item.entry.effectId === C4_ID).length, 0);
    assert.equal(active.calculationRequest.uiState.conditionByModifier[key].option, "active");
    const ownReplay = calculate(own, JSON.parse(JSON.stringify(active.calculationRequest)));
    assert.equal(byId(ownReplay, "skilldamage").breakdown.additiveBaseDamage, buffed.breakdown.additiveBaseDamage);

    const party = fixture();
    const request = partyRequest(party, GANYU, 4);
    request.party.members[1].stats = {};
    const before = calculate(party, request);
    const candidate = before.partyModifiers.find((item) => item.modifier.id === C4_ID);
    assert.ok(candidate);
    assert.equal(candidate.status, "missingProviderStats");

    request.party.members[1].stats = { baseAtk: 1000, atk: 2000 };
    setPartyOption(request, candidate, "active");
    const after = calculate(party, request);
    const partyBefore = byId(before, "skilldamage");
    const partyAfter = byId(after, "skilldamage");
    assert.equal(partyAfter.breakdown.additiveBaseDamage - partyBefore.breakdown.additiveBaseDamage, 1400);
    assert.equal(after.results.filter((item) => item.entry.effectId === C4_ID).length, 0);
    const partyReplayRequest = JSON.parse(JSON.stringify(after.calculationRequest));
    assert.equal(partyReplayRequest.party.conditionStates[candidate.partyConditionStateKey].option, "active");
    const partyReplay = calculate(party, partyReplayRequest);
    assert.equal(byId(partyReplay, "skilldamage").breakdown.additiveBaseDamage, partyAfter.breakdown.additiveBaseDamage);
});

test("Nicole C6 applies 40% DEF ignore only while Guidance is active for self and party damage", () => {
    const own = fixture();
    const off = calculate(own);
    assert.equal(byId(off, "normal_1damage").breakdown.defenseIgnore, 0);
    const key = setMainGroupOption(own.elements, "character:10000131:group:nicole-guidance", "guidance");
    const on = calculate(own);
    assert.equal(byId(on, "normal_1damage").breakdown.defenseIgnore, 40);
    assert.equal(byId(on, "normal_1damage").breakdown.appliedModifiers.some((item) => item.modifier.id === C6_ID), true);
    assert.equal(on.calculationRequest.uiState.conditionByModifier[key].option, "guidance");
    const ownReplay = calculate(own, JSON.parse(JSON.stringify(on.calculationRequest)));
    assert.equal(byId(ownReplay, "normal_1damage").breakdown.defenseIgnore, 40);

    const party = fixture();
    const request = partyRequest(party, GANYU);
    const before = calculate(party, request);
    const candidate = before.partyModifiers.find((item) => item.modifier.id === C6_ID);
    assert.ok(candidate);
    assert.equal(byId(before, "normal_1damage").breakdown.defenseIgnore, 0);
    setPartyOption(request, candidate, "guidance");
    const after = calculate(party, request);
    assert.equal(byId(after, "normal_1damage").breakdown.defenseIgnore, 40);
    const partyReplayRequest = JSON.parse(JSON.stringify(after.calculationRequest));
    assert.equal(partyReplayRequest.party.conditionStates[candidate.partyConditionStateKey].option, "guidance");
    const partyReplay = calculate(party, partyReplayRequest);
    assert.equal(byId(partyReplay, "normal_1damage").breakdown.defenseIgnore, 40);
});

test("Nicole C3/C5 talent level bonuses stay reflected by talent inputs without double application", () => {
    const own = fixture({ constellation: 5 });
    const payload = calculate(own);
    const c3 = payload.candidateModifiers.filter((item) => item.modifier?.id === "c_10000131_3_1");
    const c5 = payload.candidateModifiers.filter((item) => item.modifier?.id === "c_10000131_5_1");
    assert.equal(c3.length, 1);
    assert.equal(c5.length, 1);
    assert.ok(c3.every((item) => item.analysis.inputStatus === "includedInInput"));
    assert.ok(c5.every((item) => item.analysis.inputStatus === "includedInInput"));
    assert.equal(byId(payload, "skilldamage").breakdown.talentLevel, 10);
    assert.equal(byId(payload, "skilldamage_2").breakdown.talentLevel, 10);
});

test("Nicole C0 blessing uses provider ATK and talent-level cap, with A1 active only in Guidance", () => {
    const own = fixture({ constellation: 0 });
    const inactive = calculate(own);
    const talent = own.calcData.talentModifiers[NICOLE].passives.find((item) => item.sourceId === "combat2");
    const percentage = talent.modifiers.find((item) => item.valueSource?.param === "param5");
    const cap = talent.modifiers.find((item) => item.valueSource?.param === "param6");

    assert.equal(inactive.context.effectiveStats.atk, 2000);
    assert.equal(cap.valueByLevel["10"], 600);
    assert.equal(percentage.valueByLevel["10"], 15);
    assert.equal(byId(inactive, "skilldamage").breakdown.inputStats.atk, 2000);

    for (let level = 1; level <= 15; level += 1) {
        for (const inputAtk of [2000, 10000]) {
            const scenario = fixture({
                constellation: 0,
                stats: { baseAtk: 1000, atk: inputAtk, critRate: 0, critDamage: 0, elementDamageBonus: 0 }
            });
            scenario.elements.genshinSkillTalentLevel.value = String(level);
            setMainGroupOption(scenario.elements, "character:10000131:group:nicole-guidance", "grace");
            const result = calculate(scenario);
            const expected = Math.min(inputAtk * percentage.valueByLevel[String(level)] / 100, cap.valueByLevel[String(level)]);
            assert.equal(
                result.statTrace.find((item) => item.modifierId === "t_10000131_combat2_blessing_ratio").value,
                expected,
                `ATK grant at skill talent level ${level} with input ATK ${inputAtk}`
            );
        }
    }

    const grace = fixture({ constellation: 0 });
    setMainGroupOption(grace.elements, "character:10000131:group:nicole-guidance", "grace");
    const gracePayload = calculate(grace);
    assert.equal(gracePayload.context.effectiveStats.atk, 2300);
    assert.equal(byId(gracePayload, "skilldamage").breakdown.inputStats.atk, 2300);

    const guidance = fixture({ constellation: 0 });
    setMainGroupOption(guidance.elements, "character:10000131:group:nicole-guidance", "guidance");
    const guidancePayload = calculate(guidance);
    assert.equal(guidancePayload.context.effectiveStats.atk, 2600);
    assert.equal(guidancePayload.statTrace.filter((item) => item.modifierId === "t_10000131_passive1_guidance_atk").length, 1);

    const capped = fixture({
        constellation: 0,
        stats: { baseAtk: 1000, atk: 5000, critRate: 0, critDamage: 0, elementDamageBonus: 0 }
    });
    setMainGroupOption(capped.elements, "character:10000131:group:nicole-guidance", "grace");
    const cappedPayload = calculate(capped);
    assert.equal(cappedPayload.context.effectiveStats.atk, 5600);
    assert.equal(cappedPayload.statTrace.find((item) => item.modifierId === "t_10000131_combat2_blessing_ratio").value, 600);
});

test("Nicole C2 shares Grace and Guidance states across self and party effects, including capped ATK plus flat adds", () => {
    const own = fixture({ constellation: 2 });
    const graceKey = setMainGroupOption(own.elements, "character:10000131:group:nicole-guidance", "grace");
    const grace = calculate(own);
    assert.equal(grace.context.effectiveStats.atk, 2600);
    assert.equal(grace.calculationRequest.uiState.conditionByModifier[graceKey].option, "grace");

    const guidance = fixture({ constellation: 2 });
    const guidanceKey = setMainGroupOption(guidance.elements, "character:10000131:group:nicole-guidance", "guidance");
    const guidancePayload = calculate(guidance);
    assert.equal(guidancePayload.context.effectiveStats.atk, 2900);
    assert.equal(guidancePayload.calculationRequest.uiState.conditionByModifier[guidanceKey].option, "guidance");
    assert.equal(guidancePayload.statTrace.find((item) => item.modifierId === "t_10000131_combat2_blessing_ratio").value, 300);
    const selfReplay = calculate(guidance, JSON.parse(JSON.stringify(guidancePayload.calculationRequest)));
    assert.equal(selfReplay.context.effectiveStats.atk, guidancePayload.context.effectiveStats.atk);

    const party = fixture();
    const request = partyRequest(party, GANYU, 2);
    request.party.members[1].stats = { baseAtk: 1000, atk: 5000 };
    const before = calculate(party, request);
    const candidates = before.partyModifiers.filter((item) => item.modifier.conditionGroupId === "nicole-guidance");
    assert.ok(candidates.some((item) => item.modifier.id === "t_10000131_combat2_blessing_ratio"));
    assert.ok(candidates.every((item) => item.partyConditionStateKey === "party:2:10000131:group:nicole-guidance"));
    assert.equal(new Set(candidates.map((item) => item.toggleKey)).size, 1, "shared sources must expose one Guidance input");
    request.party.conditionStates["party:2:10000131:group:nicole-guidance"] = { option: "guidance" };
    candidates.forEach((candidate) => {
        request.party.members[1].buffStates[candidate.toggleKey] = true;
    });
    const after = calculate(party, request);
    const ganyuSkill = byId(after, "skilldamage");
    assert.equal(ganyuSkill.breakdown.inputStats.atk, 3700);
    assert.equal(ganyuSkill.breakdown.resistance, -15);
    assert.ok(after.statTrace.some((item) => item.source.includes("10000131") && item.value === 600));
    assert.ok(after.statTrace.some((item) => item.modifierId === "c_10000131_2_1_resolved_2" && item.value === 300));
    assert.ok(after.statTrace.some((item) => item.modifierId === "t_10000131_passive1_guidance_atk" && item.value === 300));
    const partyReplay = calculate(party, JSON.parse(JSON.stringify(after.calculationRequest)));
    assert.equal(byId(partyReplay, "skilldamage").breakdown.inputStats.atk, ganyuSkill.breakdown.inputStats.atk);
});

test("Nicole C2 Guidance resistance applies to the recipient element only and C1 shadow is a non-reacting extra hit", () => {
    const party = fixture();
    const request = partyRequest(party, GANYU, 2);
    const before = calculate(party, request);
    request.party.conditionStates["party:2:10000131:group:nicole-guidance"] = { option: "guidance" };
    const c2Candidates = before.partyModifiers.filter((item) => item.modifier.conditionGroupId === "nicole-guidance");
    c2Candidates.forEach((candidate) => {
        request.party.members[1].buffStates[candidate.toggleKey] = true;
    });
    const after = calculate(party, request);
    const ganyuHit = byId(after, "skilldamage");
    assert.equal(ganyuHit.breakdown.resistance, -15);
    assert.equal(ganyuHit.breakdown.appliedModifiers.filter((item) => item.modifier.id === "c_10000131_2_1_resolved_3").length, 1);

    const own = fixture({ constellation: 1 });
    const projectionKey = setMainOption(own.elements, 1, "nicole-c1-projection", "active");
    const projection = calculate(own);
    const shadow = byId(projection, "c_10000131_1_1");
    assert.ok(shadow);
    assert.equal(shadow.entry.group, "extraDamage");
    assert.equal(shadow.entry.attackType, "extraDamage");
    assert.equal(shadow.entry.canReact, false);
    assert.equal(shadow.breakdown.reaction.reactionId, "none");
    assert.equal(shadow.entry.element, "炎");
    assert.equal(projection.results.some((item) => item.entry.id === "damage"), false);
    assert.equal(projection.calculationRequest.uiState.conditionByModifier[projectionKey].option, "active");
});

test("Nicole burst projection is a separate extra hit, follows all burst levels, and keeps general damage inputs", () => {
    const levels = [99, 108, 117, 126, 135, 144, 153, 162, 171, 180, 190.8, 201.6, 212.4, 223.2, 234];
    for (let level = 1; level <= 15; level += 1) {
        const value = fixture({ constellation: 0 });
        value.elements.genshinBurstTalentLevel.value = String(level);
        const key = setMainGroupOption(value.elements, "talent:combat3:group:nicole-projection", "active");
        const payload = calculate(value);
        const shadow = byId(payload, "t_10000131_combat3_projection");
        assert.ok(shadow, `missing projection at burst talent level ${level}`);
        assert.equal(shadow.breakdown.scalingParts[0].talentMultiplier, levels[level - 1]);
        assert.equal(shadow.entry.attackType, "extraDamage");
        assert.equal(shadow.entry.canReact, false);
        assert.equal(shadow.breakdown.reaction.reactionId, "none");
        assert.equal(payload.results.some((item) => item.entry.id === "damage"), false);
        assert.equal(payload.calculationRequest.uiState.conditionByModifier[key].option, "active");
    }

    const boosted = fixture({
        constellation: 4,
        stats: { baseAtk: 1000, atk: 2000, critRate: 50, critDamage: 100, elementDamageBonus: 50 }
    });
    setMainOption(boosted.elements, 4, "nicole-pathfinder-blessing", "active");
    setMainGroupOption(boosted.elements, "talent:combat3:group:nicole-projection", "active");
    boosted.elements.genshinJsonReactionOption.value = "melt";
    const boostedPayload = calculate(boosted);
    const shadow = byId(boostedPayload, "t_10000131_combat3_projection");
    assert.equal(shadow.breakdown.scalingParts[0].statValue, boostedPayload.context.effectiveStats.atk);
    assert.equal(shadow.breakdown.damageBonus, 50);
    assert.equal(shadow.breakdown.additiveBaseDamage, 0);
    assert.equal(shadow.breakdown.critRate, 50);
    assert.equal(shadow.breakdown.critDamage, 100);
    assert.equal(shadow.breakdown.reaction.reactionId, "none");
    ["vaporize", "melt", "aggravate"].forEach((reactionId) => {
        boosted.elements.genshinJsonReactionOption.value = reactionId;
        const selectedReaction = byId(calculate(boosted), "t_10000131_combat3_projection");
        assert.equal(selectedReaction.breakdown.reaction.reactionId, "none", `${reactionId} must not react on the shadow hit`);
    });
});

test("Nicole party burst projection uses active-character ATK and provider burst level without provider ATK", () => {
    const value = fixture();
    const request = partyRequest(value, GANYU, 0);
    request.party.members[0].talentLevels = { normal: 1, skill: 1, burst: 1 };
    request.party.members[1].talentLevels = { normal: 10, skill: 10, burst: 10 };
    request.party.members[1].stats = {};
    const before = calculate(value, request);
    const candidate = before.partyModifiers.find((item) => item.modifier.id === "t_10000131_combat3_projection");
    assert.ok(candidate);
    assert.equal(candidate.status, "off");
    setPartyOption(request, candidate, "active");
    const after = calculate(value, request);
    const shadow = byId(after, "t_10000131_combat3_projection");
    assert.ok(shadow);
    assert.equal(shadow.entry.element, "氷");
    assert.equal(shadow.entry.attackType, "extraDamage");
    assert.equal(shadow.entry.canReact, false);
    assert.equal(shadow.breakdown.scalingParts[0].statValue, 2500);
    assert.equal(shadow.breakdown.scalingParts[0].talentMultiplier, 180);
    assert.equal(after.results.filter((item) => item.entry.effectId === "t_10000131_combat3_projection").length, 1);
    const replay = calculate(value, JSON.parse(JSON.stringify(after.calculationRequest)));
    const replayedShadow = byId(replay, "t_10000131_combat3_projection");
    assert.equal(replayedShadow.breakdown.scalingParts[0].statValue, 2500);
    assert.equal(replayedShadow.breakdown.scalingParts[0].talentMultiplier, 180);
});

test("Nicole Hexerei Projection adds 300% Nicole ATK only to her burst shadow for self and party targets", () => {
    const own = fixture({
        constellation: 1,
        stats: { baseAtk: 1000, atk: 2000, critRate: 0, critDamage: 0, elementDamageBonus: 0 }
    });
    setMainGroupOption(own.elements, "talent:combat3:group:nicole-projection", "active");
    const off = calculate(own);
    assert.equal(off.results.some((item) => item.entry.effectId === HEXEREI_PROJECTION_ATK_ID), false);
    assert.equal(byId(off, "t_10000131_combat3_projection").breakdown.additiveBaseDamage, 0);

    const c1Key = setMainOption(own.elements, 1, "nicole-c1-projection", "active");
    const hexereiKey = setMainGroupOption(own.elements, "talent:passive3:group:nicole-hexerei", "active");
    const ownActive = calculate(own);
    const ownShadow = byId(ownActive, "t_10000131_combat3_projection");
    const ownC1 = byId(ownActive, C1_ID);
    assert.equal(ownShadow.breakdown.scalingParts[0].statValue, 2000);
    assert.equal(ownShadow.breakdown.additiveBaseDamage, 6000);
    assert.ok(ownShadow.nonCrit > byId(off, "t_10000131_combat3_projection").nonCrit);
    assert.equal(ownC1.breakdown.scalingParts[0].statValue, 2000);
    assert.equal(ownC1.breakdown.scalingParts[0].talentMultiplier, 600);
    assert.equal(ownC1.breakdown.additiveBaseDamage, 0);
    assert.equal(byId(ownActive, "normal_1damage").breakdown.additiveBaseDamage, 0);
    assert.equal(byId(ownActive, "normal_1damage").nonCrit, byId(off, "normal_1damage").nonCrit);
    assert.equal(ownActive.calculationRequest.uiState.conditionByModifier[hexereiKey].option, "active");
    assert.equal(ownActive.calculationRequest.uiState.conditionByModifier[c1Key].option, "active");
    const ownReplay = calculate(own, JSON.parse(JSON.stringify(ownActive.calculationRequest)));
    assert.equal(byId(ownReplay, "t_10000131_combat3_projection").breakdown.additiveBaseDamage, 6000);
    assert.equal(byId(ownReplay, C1_ID).breakdown.additiveBaseDamage, 0);
    assert.equal(byId(ownReplay, "normal_1damage").breakdown.additiveBaseDamage, 0);

    const party = fixture();
    const request = partyRequest(party, SUCROSE, 0);
    request.party.members[0].stats = { baseAtk: 1000, atk: 2500 };
    request.party.members[1].constellation = 1;
    request.party.members[1].stats = { baseAtk: 1000, atk: 2000 };
    const partyBaseline = calculate(party, request);
    const projectionCandidate = partyBaseline.partyModifiers.find((item) => item.modifier.id === "t_10000131_combat3_projection");
    assert.ok(projectionCandidate);
    setPartyOption(request, projectionCandidate, "active");
    const projectionOff = calculate(party, request);
    const candidate = projectionOff.partyModifiers.find((item) => item.modifier.id === HEXEREI_PROJECTION_ATK_ID);
    assert.ok(candidate);
    assert.equal(candidate.status, "off");
    assert.equal(candidate.partyConditionStateKey, "party:2:10000131:group:nicole-hexerei");
    setPartyOption(request, candidate, "active");
    const c1Candidate = projectionOff.partyModifiers.find((item) => item.modifier.id === C1_ID);
    assert.ok(c1Candidate);
    setPartyOption(request, c1Candidate, "active");
    const partyActive = calculate(party, request);
    const partyShadow = byId(partyActive, "t_10000131_combat3_projection");
    const partyC1 = byId(partyActive, C1_ID);
    assert.equal(partyShadow.breakdown.scalingParts[0].statValue, 2500);
    assert.equal(partyShadow.breakdown.additiveBaseDamage, 6000);
    assert.ok(partyShadow.nonCrit > byId(projectionOff, "t_10000131_combat3_projection").nonCrit);
    assert.equal(partyC1.breakdown.scalingParts[0].statValue, 2500);
    assert.equal(partyC1.breakdown.scalingParts[0].talentMultiplier, 600);
    assert.equal(partyC1.breakdown.additiveBaseDamage, 0);
    assert.equal(byId(partyActive, "normal_1damage").breakdown.additiveBaseDamage, 0);
    assert.equal(byId(partyActive, "normal_1damage").nonCrit, byId(projectionOff, "normal_1damage").nonCrit);
    assert.equal(partyActive.results.filter((item) => item.entry.effectId === HEXEREI_PROJECTION_ATK_ID).length, 0);
    const partyReplay = calculate(party, JSON.parse(JSON.stringify(partyActive.calculationRequest)));
    assert.equal(byId(partyReplay, "t_10000131_combat3_projection").breakdown.additiveBaseDamage, 6000);
    assert.equal(byId(partyReplay, C1_ID).breakdown.additiveBaseDamage, 0);
    assert.equal(byId(partyReplay, "normal_1damage").breakdown.additiveBaseDamage, 0);

    request.party.members[1].stats.atk = 3000;
    const differentProviderAtk = calculate(party, request);
    assert.equal(byId(differentProviderAtk, "t_10000131_combat3_projection").breakdown.additiveBaseDamage, 9000);
    assert.equal(byId(differentProviderAtk, "t_10000131_combat3_projection").breakdown.scalingParts[0].statValue, 2500);

    const ganyuParty = fixture();
    const ganyuRequest = partyRequest(ganyuParty, GANYU, 1);
    const ganyuBaseline = calculate(ganyuParty, ganyuRequest);
    const ganyuProjectionCandidate = ganyuBaseline.partyModifiers.find((item) => item.modifier.id === "t_10000131_combat3_projection");
    assert.ok(ganyuProjectionCandidate);
    setPartyOption(ganyuRequest, ganyuProjectionCandidate, "active");
    const ganyuProjectionOff = calculate(ganyuParty, ganyuRequest);
    const ganyuHexereiCandidate = ganyuProjectionOff.partyModifiers.find((item) => item.modifier.id === HEXEREI_PROJECTION_ATK_ID);
    assert.ok(ganyuHexereiCandidate);
    setPartyOption(ganyuRequest, ganyuHexereiCandidate, "active");
    const ganyuActive = calculate(ganyuParty, ganyuRequest);
    assert.equal(byId(ganyuActive, "t_10000131_combat3_projection").breakdown.additiveBaseDamage, 0);
    assert.equal(ganyuActive.results.some((item) => item.entry.effectId === C1_ID), false);
});

test("Nicole C2 Guidance resistance from duplicate providers is max-stacked rather than doubled", () => {
    const value = fixture();
    const request = partyRequest(value, GANYU, 2);
    request.party.members.push({ ...JSON.parse(JSON.stringify(request.party.members[1])), slot: 3 });
    const before = calculate(value, request);
    const resistanceCandidates = before.partyModifiers.filter((item) => item.modifier.id === "c_10000131_2_1_resolved_3");
    assert.equal(resistanceCandidates.length, 1, "duplicate provider records sharing the same character effect are represented once");
    setPartyOption(request, resistanceCandidates[0], "guidance");
    const after = calculate(value, request);
    assert.equal(byId(after, "skilldamage").breakdown.resistance, -15);
    assert.equal(byId(after, "skilldamage").breakdown.appliedModifiers.filter((item) => item.modifier.id === "c_10000131_2_1_resolved_3").length, 1);
});

test("Nicole condition groups do not replay across lower-constellation requests", () => {
    const own = fixture();
    const c1Key = setMainOption(own.elements, 1, "nicole-c1-projection", "active");
    const active = calculate(own);
    assert.equal(active.results.filter((item) => item.entry.effectId === C1_ID).length, 1);

    const lower = JSON.parse(JSON.stringify(active.calculationRequest));
    lower.constellation = 0;
    lower.calculationInput ||= {};
    lower.calculationInput.constellation = 0;
    lower.uiState.constellationConditions = {};
    const replay = calculate(own, lower);
    assert.equal(replay.results.some((item) => item.entry.effectId === C1_ID), false);
    assert.equal(replay.calculationRequest.uiState.conditionByModifier[c1Key], undefined);
});
