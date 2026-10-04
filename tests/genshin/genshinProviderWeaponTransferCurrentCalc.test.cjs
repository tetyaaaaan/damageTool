"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createScenarioHarness, prepareScenarioInputs, setConditionElement, setElement } = require("./helpers/calcScenarioHarness.cjs");

const ARLE = "10000096";
const RAIDEN = "10000052";
const SUCROSE = "10000043";
const JEAN = "10000003";
const BEIDOU = "10000024";
const LISA = "10000006";
const KEY_ID = "w_11511_scaling_bonus_2";
const KEY_PARTY_ID = "w_11511_scaling_bonus_3";
const RATES = [0.12, 0.15, 0.18, 0.21, 0.24];
const PARTY_RATES = [0.2, 0.25, 0.3, 0.35, 0.4];
const EM_ATK = [24, 30, 36, 42, 48];

function wielderFor(weaponId) {
    return weaponId === "11511" ? JEAN : weaponId === "12415" ? BEIDOU : weaponId === "14416" ? LISA : SUCROSE;
}

function fixture({ providerWeapon = "11511", providerSlot = 2, refinement = 1, providerStats = { hp: 40000, elementalMastery: 500 }, recipientStats = {}, recipientId = ARLE, mainWeapon = "", providerId = wielderFor(providerWeapon) } = {}) {
    const value = createScenarioHarness();
    prepareScenarioInputs(value.elements, {
        characterId: recipientId,
        weaponId: mainWeapon,
        stats: { atk: 2000, baseAtk: 1000, hp: 20000, elementalMastery: 100, critRate: 0, critDamage: 0, elementDamageBonus: 0, ...recipientStats }
    });
    setElement(value.elements, "genshinWeaponRefinement", `R${refinement}`);
    const request = value.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    const provider = { slot: providerSlot, role: "support", enabled: true, characterId: providerId, constellation: 0, level: 90, stats: providerStats, buffStates: {}, equipment: { weaponId: providerWeapon, refinement, artifactSetIds: [] } };
    const members = [
        { slot: 1, role: "main", enabled: true, characterId: recipientId, constellation: 0, stats: { ...request.stats, ...recipientStats }, buffStates: {}, equipment: { weaponId: mainWeapon, refinement, artifactSetIds: [] } },
        { slot: 2, role: "support", enabled: true, characterId: RAIDEN, constellation: 0, stats: { atk: 1800, baseAtk: 900, hp: 25000, elementalMastery: 50 }, buffStates: {}, equipment: { weaponId: "", refinement: 1, artifactSetIds: [] } }
    ];
    members.splice(providerSlot - 1, 0, provider);
    members.forEach((member, index) => { member.slot = index + 1; });
    request.party = { schemaVersion: 2, focusSlot: 1, conditionStates: {}, members };
    return { ...value, request, engine: value.sandbox.GenshinCalcEngine };
}

function calculate(f, request = f.request) {
    return f.engine.calculateDamageRequest(request, f.calcData);
}

function byMember(payload, slot, id) {
    return payload.partyModifiers.find((item) => item.member?.slot === slot && item.modifier.id === id);
}

function activate(payload, request, slot, group, optionOrStack) {
    const candidates = payload.partyModifiers.filter((item) => item.member?.slot === slot && item.modifier.conditionGroupId === group);
    assert.ok(candidates.length, `missing ${group} candidates for slot ${slot}`);
    const candidate = candidates[0];
    request.party.conditionStates[candidate.partyConditionStateKey] = typeof optionOrStack === "number" ? { stack: optionOrStack } : { option: optionOrStack };
    request.party.members[slot - 1].buffStates[candidate.toggleKey] = true;
    return candidate;
}

function near(actual, expected, message = "") {
    assert.ok(Math.abs(actual - expected) < 1e-7, `${message} ${actual} != ${expected}`);
}

test("Key of Khaj-Nisut transfers max-HP EM at 3 stacks to Arlecchino and Raiden, including wielder exactly once", () => {
    for (let refinement = 1; refinement <= 5; refinement++) {
        for (let stack = 0; stack <= 3; stack++) {
            const f = fixture({ providerWeapon: "11511", refinement, providerStats: { hp: 40000, elementalMastery: 0 }, recipientId: stack % 2 ? ARLE : RAIDEN });
            let payload = calculate(f);
            const party = byMember(payload, 2, KEY_PARTY_ID);
            assert.equal(party.targetOwner, "team");
            activate(payload, f.request, 2, "grandHymnStacks", stack);
            payload = calculate(f);
            const partyBuff = byMember(payload, 2, KEY_PARTY_ID);
            if (stack < 3) assert.equal(partyBuff.status, "off");
            else near(partyBuff.resolvedValue, PARTY_RATES[refinement - 1]);
            near(payload.context.effectiveStats.elementalMastery, 100 + (stack === 3 ? 40000 * PARTY_RATES[refinement - 1] / 100 : 0));
        }
    }
});

test("Key provider receives its personal stacked EM and team EM once", () => {
    for (let refinement = 1; refinement <= 5; refinement++) {
        for (let stack = 0; stack <= 3; stack++) {
            const f = fixture({ mainWeapon: "11511", providerWeapon: "", providerId: JEAN, refinement, recipientId: JEAN, recipientStats: { hp: 40000, elementalMastery: 100 } });
            setConditionElement(f.elements, "weapon:11511:group:grandHymnStacks", "stack", stack);
            const payload = calculate(f, f.engine.buildCalculationRequestFromForm());
            const expected = 100 + 40000 * RATES[refinement - 1] * stack / 100 + (stack === 3 ? 40000 * PARTY_RATES[refinement - 1] / 100 : 0);
            near(payload.context.effectiveStats.elementalMastery, expected);
        }
    }
});

test("Key party EM uses provider HP, ignores recipient HP changes, and follows the equipped provider slot", () => {
    const first = fixture({ providerWeapon: "11511", providerStats: { hp: 30000, elementalMastery: 0 }, recipientStats: { hp: 10000 } });
    let payload = calculate(first);
    activate(payload, first.request, 2, "grandHymnStacks", 3);
    payload = calculate(first);
    near(payload.context.effectiveStats.elementalMastery, 160);
    first.request.party.members[0].stats.hp = 90000;
    const recipientChanged = calculate(first);
    near(recipientChanged.context.effectiveStats.elementalMastery, 160);

    const swapped = fixture({ providerWeapon: "11511", providerSlot: 3, providerStats: { hp: 50000, elementalMastery: 0 } });
    payload = calculate(swapped);
    activate(payload, swapped.request, 3, "grandHymnStacks", 3);
    payload = calculate(swapped);
    near(payload.context.effectiveStats.elementalMastery, 200);
    assert.ok(byMember(payload, 3, KEY_PARTY_ID));
    assert.equal(byMember(payload, 2, KEY_PARTY_ID), undefined);
});

test("Makhaira Aquamarine and Wandering Evenstar use provider EM at each refinement for self and both other members", () => {
    for (const weaponId of ["12415", "14416"]) {
        for (let refinement = 1; refinement <= 5; refinement++) {
            const holder = wielderFor(weaponId);
            const f = fixture({ mainWeapon: weaponId, providerWeapon: "", providerId: holder, refinement, recipientId: holder, recipientStats: { elementalMastery: 500 } });
            setConditionElement(f.elements, `weapon:${weaponId}:group:providerEmAtkTransfer`, "option", "active");
            const self = calculate(f, f.engine.buildCalculationRequestFromForm());
            near(self.context.effectiveStats.atk, 2000 + 500 * EM_ATK[refinement - 1] / 100);
        }
        for (let refinement = 1; refinement <= 5; refinement++) {
          for (const recipientId of [ARLE, RAIDEN]) {
            const f = fixture({ providerWeapon: weaponId, providerId: wielderFor(weaponId), refinement, recipientId, providerStats: { hp: 20000, elementalMastery: 1000 } });
            let payload = calculate(f);
            const transferId = `w_${weaponId}_provider_atk_transfer`;
            activate(payload, f.request, 2, "providerEmAtkTransfer", "active");
            payload = calculate(f);
            const share = byMember(payload, 2, transferId);
            assert.equal(share.targetOwner, "otherPartyMembers");
            near(share.resolvedValue, EM_ATK[refinement - 1]);
            near(payload.context.effectiveStats.atk, 2000 + 1000 * EM_ATK[refinement - 1] * 0.3 / 100);
          }
        }
    }
});

test("party EM transfer uses saved provider EM, permits explicit zero, and fails closed when provider stats are missing", () => {
    for (const weaponId of ["12415", "14416"]) {
        const zero = fixture({ providerWeapon: weaponId, providerId: wielderFor(weaponId), providerStats: { hp: 20000, elementalMastery: 0 } });
        let payload = calculate(zero);
        activate(payload, zero.request, 2, "providerEmAtkTransfer", "active");
        payload = calculate(zero);
        assert.equal(byMember(payload, 2, `w_${weaponId}_provider_atk_transfer`).status, "ready");
        near(payload.context.effectiveStats.atk, 2000);

        const missing = fixture({ providerWeapon: weaponId, providerId: wielderFor(weaponId), providerStats: {} });
        payload = calculate(missing);
        const candidate = byMember(payload, 2, `w_${weaponId}_provider_atk_transfer`);
        activate(payload, missing.request, 2, "providerEmAtkTransfer", "active");
        payload = calculate(missing);
        assert.notEqual(byMember(payload, 2, `w_${weaponId}_provider_atk_transfer`).status, "ready");
        assert.ok(payload.partyModifiers.find((item) => item.member?.slot === 2 && item.modifier.id === candidate.modifier.id));
    }
});

test("two providers have separate options, their transfer gains stack, and JSON snapshot replays", () => {
    const f = fixture({ providerWeapon: "12415", providerId: BEIDOU, providerStats: { hp: 20000, elementalMastery: 1000 } });
    f.request.party.members.push({ slot: 4, role: "support", enabled: true, characterId: LISA, stats: { atk: 1000, elementalMastery: 25 }, buffStates: {}, equipment: { weaponId: "14416", refinement: 1, artifactSetIds: [] } });
    let payload = calculate(f);
    const first = activate(payload, f.request, 2, "providerEmAtkTransfer", "active");
    const second = activate(payload, f.request, 4, "providerEmAtkTransfer", "active");
    assert.equal(first.partyConditionStateKey, "party:2:10000024:group:providerEmAtkTransfer");
    assert.notEqual(second.partyConditionStateKey, first.partyConditionStateKey);
    payload = calculate(f);
    const arleAtk = payload.context.effectiveStats.atk;
    near(arleAtk, 2000 + 1000 * 24 * 0.3 / 100 + 25 * 24 * 0.3 / 100);
    const snapshot = f.engine.createCalculationSnapshot(payload.calculationRequest, payload);
    const replay = calculate(f, JSON.parse(JSON.stringify(snapshot.request)));
    assert.deepEqual(JSON.parse(JSON.stringify(replay.results)), JSON.parse(JSON.stringify(payload.results)));
    near(replay.context.effectiveStats.atk, arleAtk);
});

test("ATK transfer follows provider EM, ignores recipient EM, and does not recurse after applying ATK", () => {
    const f = fixture({ providerWeapon: "12415", providerId: BEIDOU, providerStats: { hp: 20000, elementalMastery: 500 }, recipientStats: { elementalMastery: 50 } });
    let payload = calculate(f);
    activate(payload, f.request, 2, "providerEmAtkTransfer", "active");
    payload = calculate(f);
    near(payload.context.effectiveStats.atk, 2036);
    f.request.stats.elementalMastery = 5000;
    near(calculate(f).context.effectiveStats.atk, 2036);
    f.request.party.members[1].stats.elementalMastery = 1000;
    near(calculate(f).context.effectiveStats.atk, 2072);
});
