"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createScenarioHarness,
    prepareScenarioInputs
} = require("./helpers/calcScenarioHarness.cjs");

const MAIN_CHARACTER_ID = "10000133";
const FOUR_PIECE_SOURCE = (setId) => `artifact4:${setId}`;

const IDS = {
    15047: {
        crit: "4pc_crit_rate_after_stellar_swirl",
        reaction: "4pc_stellar_swirl_damage_bonus_after_stellar_swirl",
        group: "artifact15047AfterStellarSwirl",
        duration: 10
    },
    15048: {
        holderAttack: "4pc_atk_after_stellar_glimmer",
        teamReaction: "4pc_team_stellar_glimmer_damage_bonus",
        group: "artifact15048AfterStellarGlimmer",
        duration: 12
    }
};

function harness() {
    const { sandbox, elements, calcData } = createScenarioHarness();
    prepareScenarioInputs(elements, {
        characterId: MAIN_CHARACTER_ID,
        stats: {
            hp: 20000,
            baseHp: 10000,
            atk: 2000,
            baseAtk: 1000,
            def: 1000,
            baseDef: 500,
            elementalMastery: 100,
            critRate: 50,
            critDamage: 100,
            elementDamageBonus: 0
        }
    });
    return { sandbox, elements, calcData };
}

function mainRequest(setId = "") {
    const fixture = harness();
    fixture.elements.genshinArtifactSetMode = { value: setId ? "4pc" : "none" };
    fixture.elements.genshinArtifactSetOne = { value: setId };
    const request = fixture.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    request.characterElement = "氷";
    request.party = {
        schemaVersion: 2,
        focusSlot: 1,
        members: [{
            slot: 1,
            role: "main",
            enabled: true,
            characterId: MAIN_CHARACTER_ID,
            element: "氷"
        }]
    };
    // The fixture drives the artifact condition through the request state,
    // instead of inheriting the legacy equipment checkbox.
    request.uiState.enableWeaponLowHpCondition = false;
    request.uiState.conditionByModifier ||= {};
    request.uiState.complexConditionByModifier ||= {};
    return { ...fixture, request };
}

function artifactRecords(calcData, setId) {
    return calcData.artifactSetModifiers[String(setId)].fourPiece;
}

function conditionKey(sandbox, calcData, request, setId) {
    const source = FOUR_PIECE_SOURCE(setId);
    const modifier = sandbox.GenshinCalcEngine.normalizeArtifactModifier(
        artifactRecords(calcData, setId)[0],
        source,
        request
    );
    return sandbox.GenshinModifierAnalyzer.modifierStateKey(modifier, source);
}

function setArtifactCondition(sandbox, calcData, request, setId, enabled) {
    const key = conditionKey(sandbox, calcData, request, setId);
    const state = { enabled, stack: 0, option: "" };
    request.uiState.conditionByModifier[key] = { ...state };
    request.uiState.complexConditionByModifier[key] = { ...state };
    return key;
}

function reactionEntry(reactionId) {
    return {
        id: `fixture-${reactionId}`,
        attackType: "reaction",
        damageType: "reaction",
        group: "reaction",
        element: reactionId === "vaporize" ? "炎" : "氷",
        directReactionId: reactionId,
        scalings: []
    };
}

function applyReaction(sandbox, calcData, context, reactionId) {
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context);
    return sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(
        reactionEntry(reactionId),
        context,
        collected
    );
}

function artifactApplied(payload, setId) {
    return payload.results.flatMap((result) => result.breakdown?.appliedModifiers || [])
        .filter((item) => item.modifier?.artifactSetId === String(setId));
}

function supportRequest(setId = "15048") {
    const fixture = mainRequest();
    fixture.request.party.members.push({
        slot: 2,
        role: "support",
        enabled: true,
        characterId: "10000014",
        nameJa: "7.0聖遺物fixture",
        element: "風",
        constellation: 0,
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        buffStates: {},
        equipment: { artifactSetMode: "4pc", artifactSetIds: [setId] },
        stats: { baseAtk: 1000 }
    });
    return fixture;
}

test("15047 shares its 10-second condition and applies crit/+40 only after stellarSwirl", () => {
    const { sandbox, calcData, request } = mainRequest("15047");
    const records = artifactRecords(calcData, "15047");
    const [crit, reaction] = records;

    assert.deepEqual(records.map((item) => item.id), [IDS[15047].crit, IDS[15047].reaction]);
    assert.equal(crit.category, "critBonus");
    assert.deepEqual(crit.applyTo, ["critRate"]);
    assert.equal(crit.value, 16);
    assert.equal(reaction.category, "reactionBonus");
    assert.deepEqual(reaction.applyTo, ["stellarSwirlDamageBonus"]);
    assert.equal(reaction.value, 40);
    assert.deepEqual(records.map((item) => item.condition), ["afterStellarSwirl", "afterStellarSwirl"]);
    assert.equal(new Set(records.map((item) => item.conditionGroupId)).size, 1);
    assert.equal(records[0].conditionGroupId, IDS[15047].group);
    assert.deepEqual(records.map((item) => item.duration), [IDS[15047].duration, IDS[15047].duration]);

    const key = setArtifactCondition(sandbox, calcData, request, "15047", false);
    const off = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const artifactSection = sandbox.GenshinCalcConditions.conditionPanelState(off.context, calcData)
        .cards.find((card) => card.id === "artifact")
        .sections.find((section) => section.setId === "15047" && section.pieceCount === 4);
    assert.ok(artifactSection);
    assert.equal(artifactSection.controls.length, 1, "both effects must expose one shared condition control");
    assert.equal(artifactSection.controls[0].key, key);
    assert.equal(artifactSection.controls[0].checked, false);

    const offReaction = applyReaction(sandbox, calcData, off.context, "stellarSwirl");
    assert.equal(offReaction.totals.critRateBonus, 0);
    assert.equal(offReaction.totals.reactionBonus, 0);
    assert.equal(artifactApplied(off, "15047").length, 0);

    setArtifactCondition(sandbox, calcData, request, "15047", true);
    const on = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const onReaction = applyReaction(sandbox, calcData, on.context, "stellarSwirl");
    const onArtifactIds = onReaction.applied
        .filter((item) => item.modifier?.artifactSetId === "15047")
        .map((item) => item.modifier.id)
        .sort();
    assert.equal(onArtifactIds.join("|"), [IDS[15047].crit, IDS[15047].reaction].sort().join("|"));
    assert.equal(onReaction.totals.critRateBonus, 16);
    assert.equal(onReaction.totals.reactionBonus, 40);
    assert.equal(new Set(onReaction.applied
        .filter((item) => item.modifier?.artifactSetId === "15047")
        .map((item) => item.analysis.conditionStateKey)).size, 1);
    assert.equal(calcData.reactionDefinitions.options.stellarSwirl.calculationStatus, "dedicatedFormulaRequired");
});

test("15048 applies holder ATK+12 and both team stellar reaction bonuses without leaking to other reactions", () => {
    const { sandbox, calcData, request } = mainRequest("15048");
    const records = artifactRecords(calcData, "15048");
    const holderAttack = records.find((item) => item.id === IDS[15048].holderAttack);
    const teamReaction = records.find((item) => item.id === IDS[15048].teamReaction);

    assert.ok(holderAttack);
    assert.ok(teamReaction);
    assert.equal(holderAttack.category, "statBonus");
    assert.deepEqual(holderAttack.applyTo, ["atkPercent"]);
    assert.equal(holderAttack.value, 12);
    assert.equal(teamReaction.category, "reactionBonus");
    assert.deepEqual(teamReaction.applyTo, ["stellarConductDamageBonus", "stellarSwirlDamageBonus"]);
    assert.equal(teamReaction.value, 50);
    assert.equal(new Set(records.map((item) => item.conditionGroupId)).size, 1);
    assert.equal(records[0].conditionGroupId, IDS[15048].group);
    assert.deepEqual(records.map((item) => item.duration), [IDS[15048].duration, IDS[15048].duration]);
    assert.equal(teamReaction.target, "team");
    assert.equal(teamReaction.stackingGroup, "artifact:15048:teamStellarGlimmerDamageBonus");
    assert.equal(teamReaction.stackingRule, "max");
    const stacking = sandbox.GenshinPartyModifiers.stackingDescriptor({ modifier: teamReaction });
    assert.equal(stacking.group, teamReaction.stackingGroup);
    assert.equal(stacking.rule, "max");

    setArtifactCondition(sandbox, calcData, request, "15048", false);
    const off = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    assert.equal(off.context.effectiveStats.atk, 2000);
    assert.equal(off.statTrace.some((item) => item.modifierId === IDS[15048].holderAttack), false);
    const offConduct = off.results.find((result) => result.entry.directReactionId === "stellarConduct");
    assert.ok(offConduct);
    assert.equal(offConduct.breakdown.reactionBonus, 0);

    setArtifactCondition(sandbox, calcData, request, "15048", true);
    const on = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const holderTrace = on.statTrace.find((item) => item.modifierId === IDS[15048].holderAttack);
    assert.ok(holderTrace);
    assert.equal(holderTrace.stat, "atk");
    assert.equal(holderTrace.value, 120, "12% must use the holder's 1000 base ATK");
    assert.equal(on.context.effectiveStats.atk, 2120);

    const onConduct = on.results.find((result) => result.entry.directReactionId === "stellarConduct");
    assert.ok(onConduct);
    assert.equal(onConduct.breakdown.reactionBonus, 50);
    assert.equal(onConduct.breakdown.appliedModifiers
        .filter((item) => item.modifier?.id === IDS[15048].teamReaction).length, 1);

    const onSwirl = applyReaction(sandbox, calcData, on.context, "stellarSwirl");
    assert.equal(onSwirl.totals.reactionBonus, 50);
    const otherReaction = applyReaction(sandbox, calcData, on.context, "vaporize");
    assert.equal(otherReaction.totals.reactionBonus, 0);
    assert.equal(otherReaction.applied.some((item) => item.modifier?.id === IDS[15048].teamReaction), false);
});

test("15048 support artifact reaches the existing party team lane and keeps one shared toggle", () => {
    const { sandbox, calcData, request } = supportRequest();
    const off = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const offCandidate = off.partyModifiers.find((candidate) => candidate.modifier?.id === IDS[15048].teamReaction);

    assert.ok(offCandidate);
    assert.equal(offCandidate.targetOwner, "team");
    assert.equal(offCandidate.status, "off");
    assert.equal(offCandidate.resolvedValue, 50);
    assert.equal(
        offCandidate.toggleKey,
        `party:2:10000014:group:${IDS[15048].group}`
    );

    request.party.members[1].buffStates[offCandidate.toggleKey] = true;
    const on = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const onCandidate = on.partyModifiers.find((candidate) => candidate.modifier?.id === IDS[15048].teamReaction);
    assert.ok(onCandidate);
    assert.equal(onCandidate.status, "ready");
    assert.equal(onCandidate.enabled, true);
    assert.equal(onCandidate.targetOwner, "team");

    const conduct = on.results.find((result) => result.entry.directReactionId === "stellarConduct");
    assert.ok(conduct);
    assert.equal(conduct.breakdown.reactionBonus, 50);
    assert.equal(conduct.breakdown.appliedModifiers
        .filter((item) => item.partyCandidateKey === onCandidate.key).length, 1);

    const swirl = applyReaction(sandbox, calcData, on.context, "stellarSwirl");
    assert.equal(swirl.totals.reactionBonus, 50);
    const unrelated = applyReaction(sandbox, calcData, on.context, "vaporize");
    assert.equal(unrelated.totals.reactionBonus, 0);
    assert.equal(unrelated.applied.some((item) => item.partyCandidateKey === onCandidate.key), false);
});
