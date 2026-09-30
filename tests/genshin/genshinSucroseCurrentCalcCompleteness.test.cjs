"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { createScenarioHarness, prepareScenarioInputs } = require("./helpers/calcScenarioHarness.cjs");

function sucroseScenario(constellation = 0) {
    const fixture = createScenarioHarness();
    prepareScenarioInputs(fixture.elements, {
        characterId: "10000043",
        constellation,
        stats: {
            baseAtk: 500,
            atk: 1000,
            elementalMastery: 200,
            critRate: 0,
            critDamage: 0,
            elementDamageBonus: 0
        }
    });
    return {
        ...fixture,
        request: fixture.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm()
    };
}

function sucrosePartyScenario({ mainCharacterId = "10000037", constellation = 0 } = {}) {
    const fixture = createScenarioHarness();
    prepareScenarioInputs(fixture.elements, {
        characterId: mainCharacterId,
        stats: {
            baseAtk: 500,
            atk: 1000,
            elementalMastery: 100,
            critRate: 0,
            critDamage: 0,
            elementDamageBonus: 0
        }
    });
    const request = fixture.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    request.party = {
        schemaVersion: 2,
        focusSlot: 1,
        conditionStates: {},
        members: [
            { slot: 1, role: "main", enabled: true, characterId: mainCharacterId },
            {
                slot: 2,
                role: "support",
                enabled: true,
                characterId: "10000043",
                nameJa: "スクロース",
                constellation,
                talentLevels: { normal: 10, skill: 10, burst: 10 },
                stats: { elementalMastery: 200 },
                buffStates: {}
            }
        ]
    };
    return { ...fixture, request };
}

test("Sucrose normal, charged, plunge, skill, burst, and four absorbed burst elements reach damage", () => {
    const fixture = sucroseScenario();
    const payload = fixture.sandbox.GenshinCalcEngine.calculateDamageRequest(fixture.request, fixture.calcData);
    ["normalAttack", "chargedAttack", "plungingAttack", "skill", "burst"].forEach((attackType) => {
        assert.ok(payload.results.some((item) => item.entry.attackType === attackType && item.nonCrit > 0), attackType);
    });

    const absorbed = payload.results.filter((item) => item.entry.id.startsWith("damage_") && item.entry.group === "burst");
    assert.deepEqual(Array.from(absorbed, (item) => item.entry.element), ["炎", "水", "雷", "氷"]);
    assert.deepEqual(Array.from(absorbed, (item) => item.entry.variant), ["pyro", "hydro", "electro", "cryo"]);
    assert.ok(absorbed.every((item) => item.nonCrit > 0));
});

test("Sucrose EM sharing passives exclude herself and use the support provider EM", () => {
    const own = sucroseScenario();
    own.request.uiState.conditionByModifier["talent:passive2:t_10000043_passive2_em_share"] = { enabled: true };
    const ownPayload = own.sandbox.GenshinCalcEngine.calculateDamageRequest(own.request, own.calcData);
    assert.equal(ownPayload.context.effectiveStats.elementalMastery, 200);
    assert.equal(ownPayload.candidateModifiers.filter((item) => item.modifier.id.startsWith("t_10000043_passive1_swirl_em_share_") && item.reason === "発動者自身は対象外").length, 4);
    assert.ok(ownPayload.candidateModifiers.some((item) => item.modifier.id === "t_10000043_passive2_em_share" && item.reason === "発動者自身は対象外"));

    const party = sucrosePartyScenario();
    party.request.reactionOptionKey = "swirl";
    const before = party.sandbox.GenshinCalcEngine.calculateDamageRequest(party.request, party.calcData);
    const passive1 = before.partyModifiers.find((item) => item.modifier.id === "t_10000043_passive1_swirl_em_share_cryo");
    const passive2 = before.partyModifiers.find((item) => item.modifier.id === "t_10000043_passive2_em_share");
    assert.equal(before.context.effectiveStats.elementalMastery, 100);
    assert.equal(passive1.targetOwner, "otherPartyMembers");
    assert.equal(passive2.targetOwner, "otherPartyMembers");

    party.request.party.conditionStates[passive1.partyConditionStateKey] = { option: "cryo" };
    party.request.party.members[1].buffStates[passive2.toggleKey] = true;
    const after = party.sandbox.GenshinCalcEngine.calculateDamageRequest(party.request, party.calcData);
    assert.equal(after.context.effectiveStats.elementalMastery, 190);
    assert.ok(after.results.find((item) => item.entry.id === "reaction_swirl").nonCrit
        > before.results.find((item) => item.entry.id === "reaction_swirl").nonCrit);
    assert.deepEqual(Array.from(after.statTrace
        .filter((item) => item.modifierId.startsWith("t_10000043_passive"))
        .map((item) => item.value)), [50, 40]);

    party.request.party.conditionStates[passive1.partyConditionStateKey] = { option: "pyro" };
    const mismatched = party.sandbox.GenshinCalcEngine.calculateDamageRequest(party.request, party.calcData);
    assert.equal(mismatched.context.effectiveStats.elementalMastery, 140);
    assert.equal(new Set(before.partyModifiers
        .filter((item) => item.modifier.id.startsWith("t_10000043_passive1_swirl_em_share_"))
        .map((item) => item.partyConditionStateKey)).size, 1);
});

test("Sucrose C6 uses one saved absorbed-element option and buffs only that element", () => {
    const own = sucroseScenario(6);
    const conditionKey = "constellation:C6:group:sucrose-burst-elemental-absorption";
    const panel = own.sandbox.GenshinCalcConditions.conditionPanelState(
        own.sandbox.GenshinCalcEngine.buildCharacterCalcContext(),
        own.calcData
    );
    const c6 = panel.cards.find((card) => card.id === "constellation").sections.find((section) => section.level === 6);
    assert.equal(c6.controls.length, 1);
    assert.equal(c6.controls[0].key, conditionKey);
    assert.deepEqual(Array.from(c6.controls[0].options, (item) => item.value), ["inactive", "pyro", "hydro", "electro", "cryo"]);

    const inactive = own.sandbox.GenshinCalcEngine.calculateDamageRequest(own.request, own.calcData);
    own.request.uiState.conditionByModifier[conditionKey] = { enabled: true, option: "pyro" };
    own.request.uiState.complexConditionByModifier[conditionKey] = { enabled: true, option: "pyro" };
    const active = own.sandbox.GenshinCalcEngine.calculateDamageRequest(own.request, own.calcData);
    const result = (payload, id) => payload.results.find((item) => item.entry.id === id);
    assert.ok(result(active, "damage_pyro").nonCrit > result(inactive, "damage_pyro").nonCrit);
    assert.equal(result(active, "damage_cryo").nonCrit, result(inactive, "damage_cryo").nonCrit);
    assert.ok(result(active, "damage_pyro").breakdown.appliedModifiers.some((item) => item.modifier.id === "c_10000043_6_pyro"));

    const party = sucrosePartyScenario({ mainCharacterId: "10000037", constellation: 6 });
    const partyInactive = party.sandbox.GenshinCalcEngine.calculateDamageRequest(party.request, party.calcData);
    const cryo = partyInactive.partyModifiers.find((item) => item.modifier.id === "c_10000043_6_cryo");
    const c6Candidates = partyInactive.partyModifiers.filter((item) => item.modifier.conditionGroupId === "sucrose-burst-elemental-absorption");
    assert.equal(new Set(c6Candidates.map((item) => item.partyConditionStateKey)).size, 1);
    party.request.party.conditionStates[cryo.partyConditionStateKey] = { option: "cryo" };
    const partyActive = party.sandbox.GenshinCalcEngine.calculateDamageRequest(party.request, party.calcData);
    assert.equal(partyActive.partyModifiers.find((item) => item.modifier.id === "c_10000043_6_cryo").status, "ready");
    const inactiveCryo = partyInactive.results.find((item) => item.entry.element === "氷");
    const activeCryo = partyActive.results.find((item) => item.entry.id === inactiveCryo.entry.id);
    assert.ok(activeCryo.nonCrit > inactiveCryo.nonCrit);
});

test("Sucrose constellation timing effects remain outside CurrentCalc while C3 and C5 stay input-reflected", () => {
    const fixture = sucroseScenario(6);
    const payload = fixture.sandbox.GenshinCalcEngine.calculateDamageRequest(fixture.request, fixture.calcData);
    const reflected = payload.candidateModifiers.filter((item) => ["c_10000043_3_1", "c_10000043_5_1"].includes(item.modifier?.id));
    assert.equal(reflected.length, 2);
    assert.ok(reflected.every((item) => item.analysis.inputStatus === "includedInInput"));
    const source = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../games/genshin/data/character-constellations.json"), "utf8"))["10000043"];
    assert.match(source.constellations["1"].effectText, /使用可能回数/);
    assert.match(source.constellations["2"].effectText, /継続時間/);
    assert.match(source.constellations["4"].effectText, /クールタイム/);
});
