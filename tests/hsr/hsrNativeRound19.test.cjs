"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  fixedSourceSha, loadProductionFixture, attackOf, makeRequest,
  runtime, assertClose, assertMatchesIndependent
} = require("./helpers/hsrDirectVerification.cjs");

// Fixed StarRailRes JP character_skills.json @ dbe8cdf:
// 100903.params[0..14][0] * 100 (Ultimate team SPD),
// 100904.params[0..14][0] * 100 (Talent ATK per prior Charging stack).
// These are literal oracles, independent of production modifier data.
const ultimateSpeed = [36, 37.4, 38.8, 40.2, 41.6, 43, 44.75, 46.5, 48.25, 50, 51.4, 52.8, 54.2, 55.6, 57];
const atkPerCharge = [7, 7.7, 8.4, 9.1, 9.8, 10.5, 11.38, 12.25, 13.13, 14, 14.7, 15.4, 16.1, 16.8, 17.5];
const speedId = "trace:1009:100903:party-speed";
const chargeId = "trace:1009:100904:charging-atk";
const fireId = "traceNode:1009:1009102:party-fire-damage";
const glamothId = "ornament:311:2pc:speed-damage";
const profile = {
  atk: 3000, hp: 7000, def: 1600,
  baseAtk: 1000, baseHp: 1200, baseDef: 800,
  critRate: 50, critDamage: 100, damageBonus: 8,
  characterLevel: 80, eidolon: 0, enemyLevel: 80, resistance: 20,
  toughnessActive: true
};

function get(data, id) {
  const record = data.structuredModifiers.find((item) => item.id === id);
  assert.ok(record, "production loader includes " + id);
  return record;
}

function context(data, recipient = "1003", skillLevel = 10, speed = 112) {
  return {
    characterId: recipient,
    eidolon: 0,
    partyIds: recipient === "1009" ? [] : ["1009"],
    partyEidolons: { "1009": 0 },
    ornamentId: "311",
    stats: { ...profile, speed },
    baseStats: { atk: profile.baseAtk, hp: profile.baseHp, def: profile.baseDef, speed: 100 },
    traceLevelFor: (source) => String(source?.id) === "1009" ? skillLevel : 10
  };
}

test("round19 Asta E0 support source curves and attack scope are explicit", async () => {
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  const { data } = await loadProductionFixture();
  const speed = get(data, speedId);
  const charge = get(data, chargeId);
  const fire = get(data, fireId);
  assert.deepEqual(Array.from(speed.value.values), ultimateSpeed);
  assert.deepEqual(Array.from(charge.value.values), atkPerCharge);
  assert.equal(speed.source.skillId, "100903");
  assert.equal(charge.source.skillId, "100904");
  assert.equal(speed.target.owner, "partyAll");
  assert.equal(charge.target.owner, "partyAll");
  assert.equal(charge.activation.maximum, 5);
  assert.equal(fire.value.fixed, 18);
  assert.equal(fire.target.owner, "partyAll");

  const expectedE0Attacks = ["100901", "100902", "1009011"];
  for (const id of expectedE0Attacks) assert.ok(data.attacks.some((attack) => attack.id === id && attack.characterId === "1009"), "E0 attack or DoT row: " + id);
  assert.equal(data.attacks.some((attack) => attack.id === "100904" && attack.characterId === "1009"), false, "Talent is a stack support, not a damage event");
  assert.equal(attackOf(data, "100902").hitCount, 5, "E0 Skill keeps its 5 realized hits");
});

test("round19 Asta Ultimate grants fixed-source flat SPD to an ally and crosses Glamoth tiers", async () => {
  const { data } = await loadProductionFixture();
  const speed = get(data, speedId);
  const glamoth = get(data, glamothId);

  for (const level of [1, 10]) {
    const candidates = runtime.buildCandidates([speed, glamoth], context(data, "1003", level), { "asta-ultimate-speed-active": true });
    const buff = candidates.find((item) => item.id === speedId);
    const ornament = candidates.find((item) => item.id === glamothId);
    const expectedSpd = 112 + ultimateSpeed[level - 1];
    assert.equal(buff.providerId, "1009");
    assert.equal(buff.enabled && buff.applicable, true);
    assert.equal(buff.automatic, false, "the active Ultimate window is an explicit snapshot");
    assert.equal(buff.value, ultimateSpeed[level - 1]);
    assertClose(ornament.thresholdReferenceValue, expectedSpd, "recipient effective SPD at Ultimate Lv" + level);
    assert.equal(ornament.value, expectedSpd >= 160 ? 18 : 12, "Glamoth's tier follows the Asta SPD support");
  }

  const off = runtime.buildCandidates([speed, glamoth], context(data), {}) ;
  assert.equal(off.find((item) => item.id === speedId).enabled, false, "membership alone does not assert an active Ultimate");
  assert.equal(off.find((item) => item.id === glamothId).enabled, false, "no Asta SPD means 112 is below Glamoth");
  const removed = runtime.buildCandidates([speed, glamoth], { ...context(data), partyIds: [] }, { "asta-ultimate-speed-active": true });
  assert.equal(removed.some((item) => item.id === speedId), false, "provider removal removes Asta's SPD support");
  assert.equal(removed.find((item) => item.id === glamothId).enabled, false);
});

test("round19 Asta Talent ATK uses stable prior Charging stacks and E0 caps at five", async () => {
  const { data, engine } = await loadProductionFixture();
  const charge = get(data, chargeId);
  const fire = get(data, fireId);
  const attack = attackOf(data, "100301");

  for (const [level, stacks, expectedAtkPercent] of [[1, 5, 35], [10, 5, 70], [10, 9, 70]]) {
    const candidates = runtime.buildCandidates([charge, fire], context(data, "1003", level), { "asta-charging-stacks": stacks });
    const atk = candidates.find((item) => item.id === chargeId);
    const dmg = candidates.find((item) => item.id === fireId);
    assert.equal(atk.value, expectedAtkPercent, "prior Charging count is clamped to five");
    assert.equal(atk.enabled, true);
    assert.equal(dmg.enabled, true, "Asta's unlocked Fire damage applies independently of Charging stacks");
    const request = makeRequest(attack, attack.multipliers.length, profile, [atk, dmg]);
    const result = assertMatchesIndependent(engine, request, "Asta prior Charging " + level + "/" + stacks);
    assertClose(result.breakdown.referenceValue, 3000 + 1000 * expectedAtkPercent / 100, "Asta party ATK uses recipient base ATK");
    assertClose(result.breakdown.damageBonus, profile.damageBonus + 18, "Asta Ignite Fire DMG applies once");
  }

  const absentProvider = runtime.buildCandidates([charge, fire], { ...context(data, "1003", 10), partyIds: [] }, { "asta-charging-stacks": 5 });
  assert.equal(absentProvider.length, 0, "removing Asta removes both party supports");
  const zeroStacks = runtime.buildCandidates([charge], context(data, "1003", 10), { "asta-charging-stacks": 0 })[0];
  assert.equal(zeroStacks.enabled, false, "no prior Charging stacks means no ATK bonus");
});
