"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fixedSourceSha, loadProductionFixture, attackOf, makeRequest, runtime, assertClose, assertMatchesIndependent, readJson } = require("./helpers/hsrDirectVerification.cjs");

const modifiers = readJson("games/hsr/data/calc/modifiers-hanya-round10.json").modifiers;
const round3 = readJson("games/hsr/data/calc/modifiers-native-round3.json").modifiers;
const base = modifiers.find((item) => item.id === "trace:1215:121504:party-damage");
const e6Bonus = modifiers.find((item) => item.id === "eidolon:1215:6:judgment-damage");
const recorded = round3.find((item) => item.id === "traceNode:1215:1215101:sp-recovery-atk");
const activeKey = "hanya-judgment-active";
const includedKey = "hanya-judgment-damage-in-final-stats";
const recordedKey = "hanya-recorded-sp-recovery-atk-active";
const values = [15, 16.5, 18, 19.5, 21, 22.5, 24.37, 26.25, 28.12, 30, 31.5, 33];

function context(recipientId, eidolon, level) {
  return {
    characterId: recipientId,
    eidolon: recipientId === "1215" ? eidolon : 0,
    partyIds: recipientId === "1215" ? [] : ["1215"],
    partyEidolons: recipientId === "1215" ? {} : { "1215": eidolon },
    stats: { atk: 2500, critRate: 50, critDamage: 100, damageBonus: 5 },
    baseStats: { atk: 1000 },
    traceLevelFor: () => level
  };
}

function candidatesFor(recipientId, eidolon, level, inputs = {}) {
  const ctx = context(recipientId, eidolon, level);
  return runtime.buildCandidates([...modifiers, recorded], ctx, inputs);
}

test("Hanya Burden talent DMG bonus uses fixed-source levels and an explicit already-active snapshot", async () => {
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  assert.deepEqual(Array.from(base.value.values), values);
  assert.equal(base.source.skillId, "121504");
  assert.deepEqual(Array.from(e6Bonus.value.fixed ? [e6Bonus.value.fixed] : []), [10]);
  assert.equal(base.activation.inputKey, e6Bonus.activation.inputKey, "E6 extension shares the same active state");
  assert.equal(base.inputValidation.levelMaximumAtEidolon.rank, 5);
  assert.equal(base.inputValidation.levelMaximumAtEidolon.maximum, 12);
  const { data, engine } = await loadProductionFixture();

  for (const [eidolon, maxLevel] of [[0, 10], [4, 10], [5, 12], [6, 12]]) {
    for (let level = 1; level <= maxLevel; level++) {
      const off = candidatesFor("1001", eidolon, level, { [activeKey]: false });
      assert.equal(off.find((item) => item.id === base.id).enabled, false);
      if (eidolon < 6) assert.equal(off.some((item) => item.id === e6Bonus.id), false);
      const active = candidatesFor("1001", eidolon, level, { [activeKey]: true });
      const baseCandidate = active.find((item) => item.id === base.id);
      assert.equal(baseCandidate.providerId, "1215");
      assert.equal(baseCandidate.value, values[level - 1]);
      assert.equal(baseCandidate.enabled, true);
      assert.equal(baseCandidate.automatic, false, "the prior Burden-triggered buff state is user-selected");
      const extra = active.find((item) => item.id === e6Bonus.id);
      assert.equal(Boolean(extra), eidolon === 6);
      if (extra) assert.equal(extra.value, 10);
      const total = values[level - 1] + (eidolon === 6 ? 10 : 0);
      const attack = attackOf(data, "121501");
      const request = makeRequest({ ...attack, attackType: attack.type, multipliers: Array(10).fill(100), multiplier: 100 }, 10,
        { atk: 2500, baseAtk: 1000, critRate: 50, critDamage: 100, damageBonus: 5, resistance: 20, toughnessActive: true },
        active.filter((item) => item.enabled && item.calculable));
      const result = assertMatchesIndependent(engine, request, `Hanya talent E${eidolon} Lv${level}`);
      const expected = 2500 * (1 + (5 + total) / 100) * .5 * .8 * .9;
      assertClose(result.nonCrit, expected, `literal Hanya E${eidolon} Lv${level} noncrit`);
    }
  }
});

test("Hanya's already-active Judgment supports its recipient (including herself), composes with Recorded ATK, and excludes absent or already-included states", async () => {
  const { data, engine } = await loadProductionFixture();
  const ally = candidatesFor("1001", 0, 10, { [activeKey]: true, [recordedKey]: true });
  const damage = ally.find((item) => item.id === base.id);
  const atk = ally.find((item) => item.id === recorded.id);
  assert.equal(damage.providerId, "1215");
  assert.equal(damage.value, 30);
  assert.equal(atk.providerId, "1215");
  assert.equal(atk.value, 10);
  for (const type of ["normal", "enhancedNormal", "skill", "enhancedSkill", "ultimate", "talent", "followUp", "additional", "dot"]) {
    assert.equal(runtime.applicableToAttack(damage, { type, element: "Physical" }), true, "Judgment applies to the beneficiary's " + type);
  }
  assert.equal(runtime.applicableToAttack(damage, { type: "break", element: "Physical" }), false, "Break damage is outside ordinary damage bonus scope");
  const attack = attackOf(data, "121501");
  const request = makeRequest({ ...attack, attackType: attack.type, multipliers: Array(10).fill(100), multiplier: 100 }, 10,
    { atk: 2500, baseAtk: 1000, critRate: 50, critDamage: 100, damageBonus: 5, resistance: 20, toughnessActive: true },
    ally.filter((item) => item.enabled && item.calculable));
  const together = assertMatchesIndependent(engine, request, "Hanya Judgment + Recorded ATK");
  assertClose(together.nonCrit, 1263.6, "independent combined noncrit: (2500 + 1000×10%) × (1 + 5% + 30%) × 50% DEF × 80% RES × 90% toughness");

  const self = candidatesFor("1215", 0, 10, { [activeKey]: true });
  assert.equal(self.find((item) => item.id === base.id).providerId, "1215");
  const selfRequest = makeRequest({ ...attack, multipliers: Array(10).fill(100), multiplier: 100 }, 10,
    { atk: 2500, baseAtk: 1000, critRate: 50, critDamage: 100, damageBonus: 5, resistance: 20, toughnessActive: true },
    self.filter((item) => item.enabled && item.calculable));
  const selfResult = assertMatchesIndependent(engine, selfRequest, "Hanya herself as Judgment beneficiary");
  assertClose(selfResult.nonCrit, 1215, "self receives the same 30% at E0");

  const absent = runtime.buildCandidates(modifiers, { ...context("1001", 0, 10), partyIds: [] }, { [activeKey]: true });
  assert.equal(absent.length, 0, "saved toggle cannot retain a removed provider");
  const included = candidatesFor("1001", 6, 10, { [activeKey]: true, [includedKey]: true });
  assert.equal(included.find((item) => item.id === base.id).enabled, false);
  assert.equal(included.find((item) => item.id === e6Bonus.id).enabled, false);
  assert.equal(included.find((item) => item.id === base.id).includedInFinalStats, true);
  assert.equal(included.find((item) => item.id === e6Bonus.id).includedInFinalStats, true);
});
