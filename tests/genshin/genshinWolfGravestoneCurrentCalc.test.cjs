'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createScenarioHarness, prepareScenarioInputs, setConditionElement, setElement } = require('./helpers/calcScenarioHarness.cjs');

const WEAPON = '12502';
const PARTY_MODIFIER = 'w_12502_stat_2';
const PERMANENT_ATK = [20, 25, 30, 35, 40];
const PARTY_ATK = [40, 50, 60, 70, 80];
const GROUP = 'wolfGravestoneLowHpTeamAtk';
const RECIPIENT = '10000024';
const PROVIDER = '10000020';

function fixture({ refinement = 1, mainWeapon = WEAPON, providerWeapon = '', providerStats = { atk: 1700, baseAtk: 800 } } = {}) {
    const value = createScenarioHarness();
    prepareScenarioInputs(value.elements, {
        characterId: RECIPIENT,
        weaponId: mainWeapon,
        stats: { atk: 2000, baseAtk: 1000, hp: 20000, def: 1000, elementalMastery: 100, critRate: 0, critDamage: 0, elementDamageBonus: 0 }
    });
    setElement(value.elements, 'genshinWeaponRefinement', `R${refinement}`);
    const request = value.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    request.party = {
        schemaVersion: 2,
        focusSlot: 1,
        resonanceStates: {},
        conditionStates: {},
        members: [
            { slot: 1, role: 'main', enabled: true, characterId: RECIPIENT, level: 90, constellation: 0, stats: { ...request.stats }, buffStates: {}, equipment: { weaponId: mainWeapon, refinement, artifactSetIds: [] } },
            { slot: 2, role: 'support', enabled: true, characterId: PROVIDER, level: 90, constellation: 0, stats: { ...providerStats }, buffStates: {}, equipment: { weaponId: providerWeapon, refinement, artifactSetIds: [] } }
        ]
    };
    return { ...value, request, engine: value.sandbox.GenshinCalcEngine };
}

function calculate(f) {
    return f.engine.calculateDamageRequest(f.request, f.calcData);
}

function near(actual, expected, message = '') {
    assert.ok(Math.abs(actual - expected) < 1e-7, `${message} ${actual} != ${expected}`);
}

function activateProvider(payload, request) {
    const candidate = payload.partyModifiers.find((item) => item.member?.slot === 2 && item.modifier.id === PARTY_MODIFIER);
    assert.ok(candidate, 'missing Wolf’s Gravestone team ATK provider candidate');
    request.party.conditionStates[candidate.partyConditionStateKey] = { option: 'active' };
    request.party.members[1].buffStates[candidate.toggleKey] = true;
    return candidate;
}

test('Wolf’s Gravestone keeps its permanent wearer ATK and manually applies the low-HP team ATK at R1–R5', () => {
    for (let refinement = 1; refinement <= 5; refinement += 1) {
        const f = fixture({ refinement });
        const baseData = structuredClone(f.calcData);
        baseData.weaponModifiers[WEAPON].modifiers = baseData.weaponModifiers[WEAPON].modifiers.filter((item) => item.id !== PARTY_MODIFIER);
        const withoutConditional = f.engine.calculateDamageRequest(f.request, baseData);
        const off = calculate(f);
        const wearerModifier = f.calcData.weaponModifiers[WEAPON].modifiers.find((item) => item.id === 'w_12502_stat_1');
        assert.equal(wearerModifier.valueByRefinement[String(refinement)], PERMANENT_ATK[refinement - 1], `R${refinement} permanent wearer ATK record`);
        near(off.context.effectiveStats.atk, withoutConditional.context.effectiveStats.atk, `R${refinement} condition OFF`);

        setConditionElement(f.elements, `weapon:${WEAPON}:group:${GROUP}`, 'option', 'active');
        const activeRequest = f.engine.buildCalculationRequestFromForm();
        activeRequest.party = f.request.party;
        const on = f.engine.calculateDamageRequest(activeRequest, f.calcData);
        near(on.context.effectiveStats.atk - off.context.effectiveStats.atk, 1000 * PARTY_ATK[refinement - 1] / 100, `R${refinement} wearer team ATK`);
        const snapshot = f.engine.createCalculationSnapshot(on.calculationRequest, on);
        const storedSnapshot = JSON.parse(JSON.stringify(snapshot));
        assert.equal(storedSnapshot.request.party.members[1].level, 90);
        assert.deepEqual(storedSnapshot.request.party.resonanceStates, {});
        const replay = f.engine.calculateDamageRequest(storedSnapshot.request, f.calcData);
        assert.deepEqual(JSON.parse(JSON.stringify(replay.results)), JSON.parse(JSON.stringify(on.results)));
    }
});

test('Wolf’s Gravestone provider applies team ATK to a recipient with any weapon, independent of provider ATK', () => {
    for (let refinement = 1; refinement <= 5; refinement += 1) {
        const f = fixture({ refinement, mainWeapon: '12503', providerWeapon: WEAPON });
        let payload = calculate(f);
        near(payload.context.effectiveStats.atk, 2000, `R${refinement} provider condition OFF`);
        const candidate = activateProvider(payload, f.request);
        payload = calculate(f);
        const inactive = payload.partyModifiers.find((item) => item.member?.slot === 2 && item.modifier.id === PARTY_MODIFIER);
        assert.equal(inactive.targetOwner, 'team');
        assert.equal(inactive.status, 'ready');
        near(payload.context.effectiveStats.atk, 2000 + 1000 * PARTY_ATK[refinement - 1] / 100, `R${refinement} provider team ATK`);
        const initialResult = calculate({ ...f, request: { ...f.request, party: { ...f.request.party, conditionStates: {}, members: f.request.party.members.map((member) => ({ ...member, buffStates: {} })) } } }).results;
        assert.ok(payload.results.some((result) => result.expected > (initialResult.find((item) => item.entry.id === result.entry.id)?.expected ?? Infinity)), `R${refinement} direct damage increase`);

        f.request.party.members[1].stats.atk = 99999;
        f.request.party.members[1].stats.baseAtk = 30000;
        const changedProvider = calculate(f);
        near(changedProvider.context.effectiveStats.atk, payload.context.effectiveStats.atk, `R${refinement} provider stat independence`);
        assert.equal(candidate.partyConditionStateKey, `party:2:${PROVIDER}:group:${GROUP}`);
        const snapshot = JSON.parse(JSON.stringify(f.engine.createCalculationSnapshot(changedProvider.calculationRequest, changedProvider)));
        assert.equal(snapshot.request.party.members[1].level, 90);
        assert.deepEqual(snapshot.request.party.resonanceStates, {});
        const replay = f.engine.calculateDamageRequest(snapshot.request, f.calcData);
        assert.deepEqual(JSON.parse(JSON.stringify(replay.results)), JSON.parse(JSON.stringify(changedProvider.results)));
    }
});

test('Wolf’s Gravestone team ATK does not leak from an unequipped provider weapon', () => {
    for (let refinement = 1; refinement <= 5; refinement += 1) {
        const f = fixture({ refinement, mainWeapon: '12503' });
        const payload = calculate(f);
        near(payload.context.effectiveStats.atk, 2000, `R${refinement} other weapon isolation`);
        assert.equal(payload.partyModifiers.some((item) => item.modifier.id === PARTY_MODIFIER && item.status === 'ready' && item.enabled), false);
    }
});
