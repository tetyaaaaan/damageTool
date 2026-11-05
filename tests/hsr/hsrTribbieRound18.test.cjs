"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  fixedSourceSha, loadProductionFixture, attackOf, makeRequest,
  runtime, assertClose, assertMatchesIndependent
} = require("./helpers/hsrDirectVerification.cjs");

const fixture = require("../../games/hsr/data/calc/modifiers-tribbie-round18.json");
const a4 = fixture.modifiers[0];
const partyHpKey = "tribbie-a4-party-max-hp-snapshot";
const zoneKey = "tribbie-zone-active";
const includedKey = a4.finalStatsInclusion.inputKey;
const attacks = ["140301", "140303", "140304", "1403031"];
const profile = {
  atk: 3127.25, hp: 11383.75, def: 1421.5,
  baseAtk: 941.25, baseHp: 1531.75, baseDef: 683.5,
  critRate: 43.75, critDamage: 173.25, damageBonus: 31.5,
  characterLevel: 80, eidolon: 0, enemyLevel: 87, resistance: 26.25,
  resistancePenetration: 9.5, defenseReduction: 13.25, defenseIgnore: 7.75,
  takenDamage: 12.5, toughnessActive: true
};

function state(partyHp, active = true, included = false) {
  return {
    [partyHpKey]: partyHp,
    [zoneKey]: active,
    [includedKey]: included
  };
}

function buildCandidate(record, inputs, character = {}) {
  return runtime.buildCandidates([record], {
    characterId: "1403",
    eidolon: 0,
    stats: { ...profile },
    baseStats: { hp: profile.baseHp, atk: profile.baseAtk, def: profile.baseDef },
    ...character
  }, inputs)[0];
}

test("round18 Tribbie A4 uses fixed-source 9% of an explicit party max-HP snapshot", async () => {
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  const { data } = await loadProductionFixture();
  const loaded = data.structuredModifiers.find((item) => item.id === a4.id);
  assert.ok(loaded, "production loader includes the isolated A4 input record");
  assert.equal(a4.source.traceId, "1403102");
  assert.equal(a4.value.kind, "inputScaleByLevelPlusByLevel");
  assert.equal(a4.value.scaleValues[0], 9);
  assert.equal(a4.value.inputKey, partyHpKey);
  assert.equal(a4.value.default, undefined, "unknown party total is never silently defaulted");
  assert.equal(a4.activation.inputKey, zoneKey, "the existing, explicit zone condition is reused");
  assert.equal(a4.finalStatsInclusion.inputKey, a4.id + "-in-final");
  assert.equal(a4.provenance.sourceCommit, fixedSourceSha);
  assert.equal(a4.provenance.referenceUrl, "https://raw.githubusercontent.com/fribbels/hsr-optimizer/90bc8401408b17dba0a6743d882eb096ee236816/src/lib/conditionals/character/1400/Tribbie.ts");
  assert.equal(loaded.support.status, "calculable");
  assert.equal(loaded.inputPolicy, "conditional");
});

test("round18 A4 snapshot adds HP once to N/Ult/FUA/field additional with NC/C/EV", async () => {
  const { data, engine } = await loadProductionFixture();
  const partyHp = 31984.75;
  const hpBonus = partyHp * 0.09;
  const candidate = buildCandidate(a4, state(partyHp));
  assert.equal(candidate.value, hpBonus);
  assert.equal(candidate.enabled, true);
  assert.equal(candidate.applicable, true);
  assert.equal(candidate.providerId, "1403");
  assert.equal(candidate.automatic, false);

  for (const id of attacks) {
    const attack = attackOf(data, id);
    const activeRequest = makeRequest(attack, attack.multipliers.length, profile, [candidate]);
    const actual = assertMatchesIndependent(engine, activeRequest, "Tribbie A4 snapshot " + id);
    assertClose(actual.breakdown.referenceValue, profile.hp + hpBonus, id + " uses completed HP plus one flat A4 amount");

    const off = buildCandidate(a4, state(partyHp, false));
    assert.equal(off.enabled, false, id + " zone off");
    const offResult = assertMatchesIndependent(engine, makeRequest(attack, attack.multipliers.length, profile, [off]), "Tribbie A4 off " + id);
    assertClose(offResult.breakdown.referenceValue, profile.hp, id + " off preserves base final-HP input");

    const alreadyIncludedProfile = { ...profile, hp: profile.hp + hpBonus };
    const included = buildCandidate(a4, state(partyHp, true, true));
    assert.equal(included.enabled, false);
    assert.equal(included.includedInFinalStats, true);
    const includedResult = assertMatchesIndependent(engine, makeRequest(attack, attack.multipliers.length, alreadyIncludedProfile, [included]), "Tribbie A4 already included " + id);
    assertClose(includedResult.breakdown.referenceValue, alreadyIncludedProfile.hp, id + " does not add A4 twice");
  }
});

test("round18 A4 active state rejects missing or invalid party HP snapshots", () => {
  for (const value of [undefined, NaN, -0.01, 200000.01]) {
    const inputs = { [zoneKey]: true };
    if (value !== undefined) inputs[partyHpKey] = value;
    const candidate = buildCandidate(a4, inputs);
    assert.equal(candidate.applicable, false, "invalid reference total requires correction: " + String(value));
    assert.ok(candidate.inputWarnings.length > 0);
  }
  const inactive = buildCandidate(a4, { [zoneKey]: false });
  assert.equal(inactive.enabled, false, "the existing zone state gates the addition");
});
