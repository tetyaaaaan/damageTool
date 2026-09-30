"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { createScenarioHarness, prepareScenarioInputs } = require("./helpers/calcScenarioHarness.cjs");

const root = path.resolve(__dirname, "../..");
const provisionalPath = "games/genshin/data/v2/candidates/7.0-provisional-characters.json";
const stellarPath = "games/genshin/data/v2/candidates/7.0-provisional-stellar-swirl.json";
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));

function loaderApi() {
    const sandbox = { window: {}, console, fetch: async () => { throw new Error("fetch is not used"); } };
    vm.createContext(sandbox);
    ["genshinDataContract.js", "genshinCalcData.js"].forEach((name) => {
        vm.runInContext(fs.readFileSync(path.join(root, "games/js", name), "utf8"), sandbox, { filename: name });
    });
    return sandbox.window.GenshinCalcData;
}

function odetteScenario({ constellation = 0, atk = 2000, burst = 10 } = {}) {
    const fixture = createScenarioHarness();
    loaderApi().applyProvisional70Data(fixture.calcData, [readJson(provisionalPath), readJson(stellarPath)], []);
    prepareScenarioInputs(fixture.elements, {
        characterId: "10000150",
        constellation,
        stats: { baseAtk: 1000, atk, elementalMastery: 0, critRate: 0, critDamage: 0, elementDamageBonus: 0 }
    });
    fixture.elements.genshinBurstTalentLevel.value = burst;
    return { ...fixture, request: fixture.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm() };
}

function setOwnCondition(request, groupId, state) {
    request.uiState.complexConditionByModifier[`character:10000150:group:${groupId}`] = state;
}

function findDirect(payload, reactionId) {
    return payload.results.find((item) => item.entry.directReactionId === reactionId && item.entry.group === "skill");
}

function reactionTotals(sandbox, calcData, context, reactionId = "stellarConduct") {
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context);
    return sandbox.GenshinCalcEngine.applyModifiersToDamageEntry({
        id: `fixture-${reactionId}`,
        attackType: "reaction",
        damageType: "reaction",
        group: "reaction",
        element: "氷",
        directReactionId: reactionId,
        scalings: []
    }, context, collected).totals;
}

function partyScenario(constellation = 6) {
    const fixture = createScenarioHarness();
    loaderApi().applyProvisional70Data(fixture.calcData, [readJson(provisionalPath), readJson(stellarPath)], []);
    prepareScenarioInputs(fixture.elements, {
        characterId: "10000037",
        stats: { baseAtk: 1000, atk: 2000, elementalMastery: 0, critRate: 0, critDamage: 0 }
    });
    const request = fixture.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    request.party = {
        schemaVersion: 2,
        focusSlot: 1,
        conditionStates: {},
        members: [
            { slot: 1, role: "main", enabled: true, characterId: "10000037" },
            {
                slot: 2,
                role: "support",
                enabled: true,
                characterId: "10000150",
                nameJa: "オデット",
                constellation,
                talentLevels: { normal: 10, skill: 10, burst: 10 },
                buffStates: {},
                stats: { atk: 2000 }
            }
        ]
    };
    return { ...fixture, request };
}

test("Odette provisional normal, charged, plunge, every skill state, and burst reach real damage", () => {
    const { sandbox, calcData, request } = odetteScenario();
    const payload = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const expected = ["normalAttack", "chargedAttack", "plungingAttack", "skill", "burst"];
    expected.forEach((attackType) => {
        assert.ok(payload.results.some((item) => item.entry.attackType === attackType && item.nonCrit > 0), attackType);
    });
    const directSkillEntries = calcData.talentScalings["10000150"].skill.entries.filter((entry) => entry.directReactionId);
    assert.equal(directSkillEntries.length, 6);
    assert.deepEqual(new Set(directSkillEntries.map((entry) => entry.directReactionId)), new Set(["stellarConduct", "stellarSwirl"]));
    directSkillEntries.forEach((entry) => {
        const result = payload.results.find((item) => item.entry.id === entry.id);
        assert.ok(result?.nonCrit > 0, entry.id);
        if (entry.directReactionId === "stellarSwirl") {
            assert.equal(result.breakdown.reaction.baseMultiplier, 1, "talent multiplier already states the full direct Stellar Swirl damage");
        }
    });
});

test("Odette passive 2 is an own direct-Stellar multiplier above 1000 ATK and caps at 30 percent", () => {
    const low = odetteScenario({ atk: 1000 });
    const mid = odetteScenario({ atk: 2000 });
    const high = odetteScenario({ atk: 4000 });
    const lowPayload = low.sandbox.GenshinCalcEngine.calculateDamageRequest(low.request, low.calcData);
    const midPayload = mid.sandbox.GenshinCalcEngine.calculateDamageRequest(mid.request, mid.calcData);
    const highPayload = high.sandbox.GenshinCalcEngine.calculateDamageRequest(high.request, high.calcData);

    assert.equal(findDirect(lowPayload, "stellarConduct").breakdown.finalDamageMultiplier, 1);
    assert.equal(findDirect(midPayload, "stellarConduct").breakdown.finalDamageMultiplier, 1.15);
    assert.equal(findDirect(highPayload, "stellarConduct").breakdown.finalDamageMultiplier, 1.3);
    assert.equal(midPayload.results.find((item) => item.entry.group === "skill" && !item.entry.directReactionId).breakdown.finalDamageMultiplier, 1);
});

test("Odette Spring Flower passive adds 15 percent per stack only to her Stellar Glimmer damage", () => {
    const fixture = odetteScenario();
    const base = fixture.sandbox.GenshinCalcEngine.calculateDamageRequest(fixture.request, fixture.calcData);
    setOwnCondition(fixture.request, "provisional70_10000150_condition_spring_flower", { stack: 4 });
    const fourStacks = fixture.sandbox.GenshinCalcEngine.calculateDamageRequest(fixture.request, fixture.calcData);
    setOwnCondition(fixture.request, "provisional70_10000150_condition_spring_flower", { stack: 6 });
    const sixStacks = fixture.sandbox.GenshinCalcEngine.calculateDamageRequest(fixture.request, fixture.calcData);

    assert.equal(findDirect(base, "stellarConduct").breakdown.reactionBonus, 0);
    assert.equal(findDirect(fourStacks, "stellarConduct").breakdown.reactionBonus, 60);
    assert.equal(findDirect(sixStacks, "stellarSwirl").breakdown.reactionBonus, 90);
    assert.equal(fourStacks.results.find((item) => item.entry.group === "skill" && !item.entry.directReactionId).breakdown.reactionBonus, 0);
    assert.ok(findDirect(fourStacks, "stellarConduct").nonCrit > findDirect(base, "stellarConduct").nonCrit);
});

test("Odette Radiance uses one option for passive 3 and C2 resistance state", () => {
    const fixture = odetteScenario({ constellation: 2, atk: 2000 });
    setOwnCondition(fixture.request, "provisional70_10000150_condition_radiance", { option: "stellarConduct" });
    const conduct = fixture.sandbox.GenshinCalcEngine.calculateDamageRequest(fixture.request, fixture.calcData);
    assert.equal(findDirect(conduct, "stellarConduct").breakdown.reactionBaseDamageBonus, 14);
    assert.equal(findDirect(conduct, "stellarSwirl").breakdown.reactionBaseDamageBonus, 0);
    const conductShred = findDirect(conduct, "stellarConduct").breakdown.appliedModifiers
        .find((item) => item.modifier.id.endsWith("c2_resistance_shred_stellarConduct"));
    assert.deepEqual(conductShred.modifier.applyTo, ["cryoResistance", "electroResistance"]);

    setOwnCondition(fixture.request, "provisional70_10000150_condition_radiance", { option: "stellarSwirl" });
    const swirl = fixture.sandbox.GenshinCalcEngine.calculateDamageRequest(fixture.request, fixture.calcData);
    assert.equal(findDirect(swirl, "stellarConduct").breakdown.reactionBaseDamageBonus, 0);
    assert.equal(findDirect(swirl, "stellarSwirl").breakdown.reactionBaseDamageBonus, 14);
    const swirlShred = findDirect(swirl, "stellarSwirl").breakdown.appliedModifiers
        .find((item) => item.modifier.id.endsWith("c2_resistance_shred_stellarSwirl"));
    assert.deepEqual(swirlShred.modifier.applyTo, ["cryoResistance", "anemoResistance"]);
});

test("Odette Snowbird Dream uses burst level and C4 shares the same party condition", () => {
    const own = odetteScenario({ constellation: 4, burst: 10 });
    setOwnCondition(own.request, "provisional70_10000150_condition_snowbird_dream", { option: "active" });
    const ownPayload = own.sandbox.GenshinCalcEngine.calculateDamageRequest(own.request, own.calcData);
    assert.equal(findDirect(ownPayload, "stellarConduct").breakdown.reactionBonus, 50);

    const party = partyScenario(4);
    const before = party.sandbox.GenshinCalcEngine.calculateDamageRequest(party.request, party.calcData);
    const c4 = before.partyModifiers.find((item) => item.modifier.id === "provisional70_10000150_c4_snowbird_party");
    assert.ok(c4);
    party.request.party.conditionStates[c4.partyConditionStateKey] = { option: "active" };
    party.request.party.members[1].buffStates[c4.toggleKey] = true;
    const after = party.sandbox.GenshinCalcEngine.calculateDamageRequest(party.request, party.calcData);
    assert.equal(reactionTotals(party.sandbox, party.calcData, after.context).reactionBonus, 25);
    const snowbird = after.partyModifiers.filter((item) => item.modifier.conditionGroupId === "provisional70_10000150_condition_snowbird_dream");
    assert.equal(new Set(snowbird.map((item) => item.partyConditionStateKey)).size, 1);
});

test("Odette C1 and C4 direct Stellar follow-ups are selectable real damage entries", () => {
    const fixture = odetteScenario({ constellation: 4 });
    setOwnCondition(fixture.request, "provisional70_10000150_condition_c1_coda_end", { option: "stellarConduct" });
    setOwnCondition(fixture.request, "provisional70_10000150_condition_c4_followup", { option: "stellarSwirl" });
    const payload = fixture.sandbox.GenshinCalcEngine.calculateDamageRequest(fixture.request, fixture.calcData);
    const c1 = payload.results.find((item) => item.entry.effectId === "provisional70_10000150_c1_direct_stellar_stellarConduct");
    const c4 = payload.results.find((item) => item.entry.effectId === "provisional70_10000150_c4_direct_stellar_stellarSwirl");
    assert.equal(c1.entry.directReactionId, "stellarConduct");
    assert.equal(c4.entry.directReactionId, "stellarSwirl");
    assert.ok(c1.nonCrit > 0);
    assert.ok(c4.nonCrit > 0);
});

test("Odette Spring Flower is one saved numeric condition for C2 and both C6 bonuses", () => {
    const own = odetteScenario({ constellation: 6 });
    setOwnCondition(own.request, "provisional70_10000150_condition_spring_flower", { stack: 6 });
    const ownPayload = own.sandbox.GenshinCalcEngine.calculateDamageRequest(own.request, own.calcData);
    assert.equal(ownPayload.context.effectiveStats.atk, 2420);
    assert.equal(findDirect(ownPayload, "stellarConduct").breakdown.reactionBonus, 135);

    const party = partyScenario(6);
    const before = party.sandbox.GenshinCalcEngine.calculateDamageRequest(party.request, party.calcData);
    const spring = before.partyModifiers.find((item) => item.modifier.id === "provisional70_10000150_c2_spring_flower_atk");
    assert.ok(spring);
    party.request.party.conditionStates[spring.partyConditionStateKey] = { stack: 3 };
    const after = party.sandbox.GenshinCalcEngine.calculateDamageRequest(party.request, party.calcData);
    const springCandidates = after.partyModifiers.filter((item) => item.modifier.conditionGroupId === "provisional70_10000150_condition_spring_flower");
    assert.equal(new Set(springCandidates.map((item) => item.partyConditionStateKey)).size, 1);
    assert.equal(springCandidates.find((item) => item.modifier.id === "provisional70_10000150_c2_spring_flower_atk").status, "ready");
    assert.equal(after.context.effectiveStats.atk, 2210);
    assert.equal(reactionTotals(party.sandbox, party.calcData, after.context).reactionBonus, 25);
});

test("Odette C3 and C5 are reflected inputs and provisional data includes intermediate base levels", () => {
    const fixture = odetteScenario({ constellation: 6 });
    const payload = fixture.sandbox.GenshinCalcEngine.calculateDamageRequest(fixture.request, fixture.calcData);
    const reflected = payload.candidateModifiers.filter((item) => [
        "provisional70_10000150_c3_skill_level",
        "provisional70_10000150_c5_burst_level"
    ].includes(item.modifier?.id));
    assert.equal(reflected.length, 2);
    assert.ok(reflected.every((item) => item.analysis.inputStatus === "includedInInput"));

    const baseStats = readJson(provisionalPath).baseStats.provisional70_character_10000150;
    assert.ok(baseStats.levelRows.some((row) => row.level === 50 && row.ascension === "after"));
    assert.ok(baseStats.levelRows.some((row) => row.level === 80 && row.ascension === 6));
    assert.deepEqual(baseStats.levelRows.find((row) => row.level === 1), {
        level: 1, ascension: "before", hp: 1011, atk: 26.07, def: 61.27, crit_damage_bonus_percent: 0
    });
    assert.equal(baseStats.levelRows.find((row) => row.level === 90 && row.ascension === 6).hp, 12981);
});
