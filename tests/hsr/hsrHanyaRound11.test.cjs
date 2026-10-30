"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fixedSourceSha, loadProductionFixture, attackOf, makeRequest, runtime, assertClose, assertMatchesIndependent, readJson } = require("./helpers/hsrDirectVerification.cjs");

const modifiers = readJson("games/hsr/data/calc/modifiers-hanya-round11.json").modifiers;
const atkBuff = modifiers.find((item) => item.id === "trace:1215:121503:ultimate-atk");
const speedBuff = modifiers.find((item) => item.id === "trace:1215:121503:ultimate-speed");
const activeKey = "hanya-ultimate-active";
const atkIncludedKey = "hanya-ultimate-atk-in-final-stats";
const speedIncludedKey = "hanya-ultimate-speed-in-final-stats";
const atkValues = [36,38.4,40.8,43.2,45.6,48,51,54,57,60,62.4,64.8];
const speedValues = [15,15.5,16,16.5,17,17.5,18.12,18.75,19.38,20,20.5,21];

function context(recipientId, eidolon = 0) {
  return {
    characterId: recipientId,
    eidolon: recipientId === "1215" ? eidolon : 0,
    partyIds: recipientId === "1215" ? [] : ["1215"],
    partyStats: recipientId === "1215" ? {} : { "1215": { speed: 160 } },
    partyEidolons: recipientId === "1215" ? {} : { "1215": eidolon },
    stats: { atk: 2500, speed: 100, critRate: 50, critDamage: 100, damageBonus: 5 },
    baseStats: { atk: 1000 },
    traceLevelFor: () => 10
  };
}

function candidatesFor(recipientId, eidolon, inputs = {}) {
  return runtime.buildCandidates(modifiers, context(recipientId, eidolon), inputs);
}

test("Hanya Ultimate support levels and target/provider references match the fixed source", async () => {
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  assert.equal(atkBuff.source.skillId, "121503");
  assert.deepEqual(Array.from(atkBuff.value.values), [36,38.4,40.8,43.2,45.6,48,51,54,57,60,62.4,64.8,67.2,69.6,72]);
  assert.deepEqual(Array.from(speedBuff.value.values), [15,15.5,16,16.5,17,17.5,18.12,18.75,19.38,20,20.5,21,21.5,22,22.5]);
  assert.equal(speedBuff.value.providerStat, "speed");
  assert.equal(atkBuff.inputValidation.levelMaximum, 10);
  assert.deepEqual(atkBuff.inputValidation.levelMaximumAtEidolon, { rank: 5, maximum: 12 });
  assert.equal(atkBuff.activation.inputKey, speedBuff.activation.inputKey, "both effects are one selected active-ultimate snapshot");

  const { data, engine } = await loadProductionFixture();
  const attack = {id:"hanya-recipient-fixture",type:"normal",element:"Physical",scalingStat:"atk",multipliers:Array(10).fill(100),canCrit:true};
  for (const [eidolon, maxLevel] of [[0,10],[4,10],[5,12]]) {
    for (let level = 1; level <= maxLevel; level++) {
      const baseCtx = context("1001", eidolon);
      baseCtx.traceLevelFor = () => level;
      const off = runtime.buildCandidates(modifiers, baseCtx, { [activeKey]: false, "hanya-ultimate-provider-speed": 160 });
      assert.equal(off.find((item) => item.id === atkBuff.id).enabled, false);
      assert.equal(off.find((item) => item.id === speedBuff.id).enabled, false);
      const active = runtime.buildCandidates(modifiers, { ...baseCtx, partyStats: { "1215": { speed: 160 } } }, { [activeKey]: true, "hanya-ultimate-provider-speed": 160 });
      const atk = active.find((item) => item.id === atkBuff.id);
      const speed = active.find((item) => item.id === speedBuff.id);
      assert.equal(atk.value, atkValues[level - 1]);
      assertClose(speed.value, 160 * speedValues[level - 1] / 100, `provider SPD scaling at Lv${level}`);
      assert.equal(atk.automatic, false);
      assert.equal(speed.automatic, false);

      const request = makeRequest({ ...attack, attackType: attack.type, multipliers: Array(10).fill(100), multiplier: 100 }, 10,
        { atk: 2500, baseAtk: 1000, critRate: 50, critDamage: 100, damageBonus: 5, resistance: 20, toughnessActive: true },
        active.filter((item) => item.enabled && item.calculable));
      const result = assertMatchesIndependent(engine, request, `Hanya Ultimate ATK buff at E${eidolon} Lv${level}`);
      const expected = (2500 + 1000 * atkValues[level - 1] / 100) * 1.05 * .5 * .8 * .9;
      assertClose(result.nonCrit, expected, `independent target-base-ATK calculation at E${eidolon} Lv${level}`);
    }
  }
});

test("Hanya Ultimate applies only while selected, excludes removed providers and supports self/ally snapshots", async () => {
  const ally = runtime.buildCandidates(modifiers, { ...context("1001"), partyStats: { "1215": { speed: 200 } } }, { [activeKey]: true, "hanya-ultimate-provider-speed": 200 });
  assert.equal(ally.find((item) => item.id === atkBuff.id).providerId, "1215");
  assert.equal(ally.find((item) => item.id === atkBuff.id).value, 60);
  assert.equal(ally.find((item) => item.id === speedBuff.id).value, 40);
  assert.equal(ally.find((item) => item.id === atkBuff.id).enabled, true);
  assert.equal(ally.find((item) => item.id === atkBuff.id).automatic, false);
  assert.equal(runtime.applicableToAttack(ally.find((item) => item.id === atkBuff.id), { type: "ultimate", element: "Physical" }), true);
  assert.equal(runtime.applicableToAttack(ally.find((item) => item.id === speedBuff.id), { type: "skill", element: "Physical" }), true, "the speed state is a character stat buff, independent of attack kind");

  const { data, engine } = await loadProductionFixture();
  const attack = {id:"hanya-recipient-fixture",type:"normal",element:"Physical",scalingStat:"atk",multipliers:Array(10).fill(100),canCrit:true};
  const active = ally.filter((item) => item.enabled && item.calculable);
  const request = makeRequest({ ...attack, attackType: attack.type, multipliers: Array(10).fill(100), multiplier: 100 }, 10,
    { atk: 2500, baseAtk: 1000, critRate: 50, critDamage: 100, damageBonus: 5, resistance: 20, toughnessActive: true }, active);
  const together = assertMatchesIndependent(engine, request, "Hanya Ultimate recipient attack");
  assertClose(together.nonCrit, 1171.8, "independent Lv10: (2500 + 1000×60%) × 1.05 × 50% DEF × 80% RES × 90% toughness");

  const self = runtime.buildCandidates(modifiers, { ...context("1215"), stats: { ...context("1215").stats, speed: 200 } }, { [activeKey]: true, "hanya-ultimate-provider-speed": 200 });
  assert.equal(self.find((item) => item.id === atkBuff.id).providerId, "1215");
  assert.equal(self.find((item) => item.id === atkBuff.id).value, 60);
  const absent = runtime.buildCandidates(modifiers, { ...context("1001"), partyIds: [] }, { [activeKey]: true, "hanya-ultimate-provider-speed": 200 });
  assert.equal(absent.length, 0, "stored condition cannot outlive the provider's party presence");

  const included = candidatesFor("1001", 0, {
    [activeKey]: true,
    [atkIncludedKey]: true,
    [speedIncludedKey]: true,
    "hanya-ultimate-provider-speed": 200
  });
  assert.equal(included.find((item) => item.id === atkBuff.id).enabled, false);
  assert.equal(included.find((item) => item.id === speedBuff.id).enabled, false);
  assert.equal(included.find((item) => item.id === atkBuff.id).includedInFinalStats, true);
  assert.equal(included.find((item) => item.id === speedBuff.id).includedInFinalStats, true);
});
