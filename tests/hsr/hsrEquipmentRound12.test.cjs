"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  fixedSourceSha,
  loadProductionFixture,
  makeRequest,
  independentDirectDamage,
  assertClose,
  runtime
} = require("./helpers/hsrDirectVerification.cjs");

const coneIds = ["23044", "23008", "23047", "23041"];
const profiles = [
  { atk: 3129, baseAtk: 1043, hp: 7713, def: 2461, baseHp: 1217, baseDef: 987, critRate: 43, critDamage: 137, damageBonus: 22, enemyLevel: 82, resistance: 27, defenseReduction: 11, defenseIgnore: 4, resistancePenetration: 7, takenDamage: 9, toughnessActive: true },
  { atk: 4861, baseAtk: 1179, hp: 9061, def: 3702, baseHp: 1003, baseDef: 1109, critRate: 68, critDamage: 91, damageBonus: 37, enemyLevel: 93, resistance: 5, defenseReduction: 0, defenseIgnore: 12, resistancePenetration: 13, takenDamage: 0, toughnessActive: false }
];

function scoped(records, attack) {
  return records.map((item) => ({
    ...item,
    applicable: item.applicable && runtime.applicableToAttack(item, attack)
  }));
}

function ownCandidates(data, coneId, refinement, inputs = {}, characterId = "1308", attack = { type: "normal", element: "Fire" }) {
  const records = data.structuredModifiers.filter((item) => item.source?.kind === "lightCone" && item.source.id === coneId);
  const candidates = runtime.buildCandidates(records, {
    characterId,
    lightConeId: coneId,
    refinement,
    stats: { atk: 3129, speed: 135, breakEffect: 213.75 },
    baseStats: { atk: 1043, speed: 100 },
    enemy: { count: 1, hpPercent: 100, weakness: true, toughnessActive: false },
    traceLevelFor: () => 10
  }, inputs);
  return scoped(candidates, attack);
}

function partyCandidates(data, coneId, refinement, inputs = {}, attack = { type: "normal", element: "Fire" }) {
  const records = data.structuredModifiers.filter((item) => item.source?.kind === "lightCone" && item.source.id === coneId);
  const candidates = runtime.buildCandidates(records, {
    characterId: "1407",
    partyIds: ["1217"],
    partyEquipment: [{ characterId: "1217", lightConeId: coneId, refinement }],
    partyEidolons: { "1217": 0 },
    stats: { atk: 3129, speed: 135, breakEffect: 213.75 },
    baseStats: { atk: 1043, speed: 100 },
    enemy: { count: 1, hpPercent: 100, weakness: true, toughnessActive: false },
    traceLevelFor: () => 10
  }, inputs);
  return scoped(candidates, attack);
}

function candidate(items, id) {
  const result = items.find((item) => item.id === id);
  assert.ok(result, "missing candidate " + id);
  return result;
}

test("LC23044 maps permanent DEF ignore and post-Ultimate damage to separate owner conditions at S1-S5", async () => {
  const { data, engine } = await loadProductionFixture();
  const ids = ["lightCone:23044:defense-ignore", "lightCone:23044:sunlight-damage"];
  for (const id of ids) assert.ok(data.structuredModifiers.some((item) => item.id === id), "production modifier loaded: " + id);
  const expectedDefIgnore = [18, 22.5, 27, 31.5, 36];
  const expectedSunlight = [60, 78, 96, 114, 132];
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");

  for (let rank = 1; rank <= 5; rank += 1) {
    const records = ownCandidates(data, "23044", rank, { "lc-23044-sunlight-active": true });
    const defIgnore = candidate(records, ids[0]);
    const sunlight = candidate(records, ids[1]);
    assert.equal(defIgnore.value, expectedDefIgnore[rank - 1]);
    assert.equal(defIgnore.activation.mode, "always");
    assert.equal(sunlight.value, expectedSunlight[rank - 1]);
    assert.equal(sunlight.enabled, true);

    for (const profile of profiles) {
      const attack = { id: "lc-23044-fixture", type: "ultimate", element: "Fire", target: "single", scalingStat: "atk", damageFormula: "statMultiplier", hitCount: 1, canCrit: true, multipliers: [125] };
      const input = makeRequest(attack, 1, { ...profile, characterLevel: 80, enemyCount: 1 }, scoped(records, attack));
      const result = engine.calculate(input);
      const expected = independentDirectDamage(input);
      assert.notEqual(result.supported, false);
      for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], expected[key], `LC23044 S${rank} ${key}`);
    }
  }

  const included = ownCandidates(data, "23044", 1, {
    "lc-23044-sunlight-active": true,
    "lc-23044-defense-ignore-in-final": true
  });
  assert.equal(candidate(included, ids[0]).includedInFinalStats, true, "final enemy defense input prevents duplicate LC DEF ignore");
  assert.equal(candidate(included, ids[0]).enabled, false);
  const off = ownCandidates(data, "23044", 5, {});
  assert.equal(candidate(off, ids[1]).enabled, false, "post-Ultimate condition is optional and defaults off");
  assert.equal(partyCandidates(data, "23044", 1).length, 0, "owner-only LC effects are not borrowed from another ally");
});

test("LC23008 applies only the post-Ultimate party SPD condition at S1-S5", async () => {
  const { data } = await loadProductionFixture();
  const id = "lightCone:23008:post-ultimate-party-speed";
  assert.ok(data.structuredModifiers.some((item) => item.id === id));
  const values = [12, 14, 16, 18, 20];
  for (let rank = 1; rank <= 5; rank += 1) {
    const off = partyCandidates(data, "23008", rank);
    const noBuff = candidate(off, id);
    assert.equal(noBuff.enabled, false);
    const on = partyCandidates(data, "23008", rank, { "lc-23008-ultimate-speed-active": true });
    const buff = candidate(on, id);
    assert.equal(buff.enabled, true);
    assert.equal(buff.providerId, "1217");
    assert.equal(buff.category, "statFlat");
    assert.equal(buff.stat, "speed");
    assert.equal(buff.value, values[rank - 1]);
    const included = partyCandidates(data, "23008", rank, {
      "lc-23008-ultimate-speed-active": true,
      "lc-23008-party-speed-in-final": true
    });
    assert.equal(candidate(included, id).enabled, false, "included recipient SPD is not added twice");
  }
});

test("LC23047 scales existing Soultrance DoT stacks and recipient SPD separately at S1-S5", async () => {
  const { data, engine } = await loadProductionFixture();
  const dotId = "lightCone:23047:dot-vulnerability-stacks";
  const speedId = "lightCone:23047:soultrance-recipient-speed";
  for (const id of [dotId, speedId]) assert.ok(data.structuredModifiers.some((item) => item.id === id));
  const perStack = [5, 6.25, 7.5, 8.75, 10];
  const speed = [10, 12.5, 15, 17.5, 20];

  for (let rank = 1; rank <= 5; rank += 1) {
    for (const stacks of [0, 1, 6, 7]) {
      const records = ownCandidates(data, "23047", rank, { "lc-23047-soultrance-stacks": stacks }, "1407", { type: "dot", element: "Wind" });
      const debuff = candidate(records, dotId);
      const cappedStacks = Math.min(stacks, 6);
      assert.equal(debuff.value, perStack[rank - 1] * cappedStacks);
      assert.equal(debuff.enabled, cappedStacks > 0);
      assert.deepEqual(Array.from(debuff.target.attackTypes), ["dot"]);
      assert.equal(runtime.applicableToAttack(debuff, { type: "skill", element: "Wind" }), false);
      if (cappedStacks > 0) {
        const attack = { id: "lc-23047-dot-fixture", type: "dot", element: "Wind", target: "single", scalingStat: "atk", damageFormula: "statMultiplier", hitCount: 1, canCrit: false, multipliers: [100] };
        const input = makeRequest(attack, 1, { ...profiles[0], characterLevel: 80, enemyCount: 1 }, scoped(records, attack));
        const actual = engine.calculate(input);
        const expected = independentDirectDamage(input);
        assert.notEqual(actual.supported, false);
        assertClose(actual.nonCrit, expected.nonCrit, `LC23047 S${rank} DoT/${stacks} stacks`);
        assert.equal(actual.nonCrit, actual.crit, "DoT does not use ordinary critical damage");
      }
    }
    const activeSpeed = partyCandidates(data, "23047", rank, { "lc-23047-soultrance-hit-speed-active": true });
    const recipient = candidate(activeSpeed, speedId);
    assert.equal(recipient.providerId, "1217");
    assert.equal(recipient.enabled, true);
    assert.equal(recipient.category, "statPercent");
    assert.equal(recipient.stat, "speed");
    assert.equal(recipient.value, speed[rank - 1]);
    assert.equal(candidate(partyCandidates(data, "23047", rank), speedId).enabled, false);
  }
});

test("LC23041 keeps implanted-weakness damage and prior DEF down conditional at S1-S5", async () => {
  const { data, engine } = await loadProductionFixture();
  const damageId = "lightCone:23041:implanted-weakness-damage";
  const defenseId = "lightCone:23041:prior-defense-reduction";
  for (const id of [damageId, defenseId]) assert.ok(data.structuredModifiers.some((item) => item.id === id));
  const damage = [60, 70, 80, 90, 100];
  const defense = [12, 15, 18, 21, 24];

  for (let rank = 1; rank <= 5; rank += 1) {
    const off = ownCandidates(data, "23041", rank);
    assert.equal(candidate(off, damageId).enabled, false);
    assert.equal(candidate(off, defenseId).enabled, false);
    const inputs = {
      "lc-23041-implanted-weakness-active": true,
      "lc-23041-prior-defense-down-active": true
    };
    const records = ownCandidates(data, "23041", rank, inputs);
    assert.equal(candidate(records, damageId).value, damage[rank - 1]);
    assert.equal(candidate(records, defenseId).value, defense[rank - 1]);
    for (const profile of profiles) {
      const attack = { id: "lc-23041-fixture", type: "skill", element: "Quantum", target: "single", scalingStat: "atk", damageFormula: "statMultiplier", hitCount: 1, canCrit: true, multipliers: [135] };
      const input = makeRequest(attack, 1, { ...profile, characterLevel: 80, enemyCount: 1 }, scoped(records, attack));
      const actual = engine.calculate(input);
      const expected = independentDirectDamage(input);
      assert.notEqual(actual.supported, false);
      for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], `LC23041 S${rank} ${key}`);
    }
    const included = ownCandidates(data, "23041", rank, { ...inputs, "lc-23041-defense-reduction-in-final": true });
    assert.equal(candidate(included, defenseId).enabled, false, "prior reduction already in enemy input is not duplicated");
  }
  const partyProvider = partyCandidates(data, "23041", 1, {
    "lc-23041-implanted-weakness-active": true,
    "lc-23041-prior-defense-down-active": true
  });
  assert.equal(partyProvider.some((item) => item.id === damageId), false, "implanted-weakness damage remains wearer-only");
  assert.equal(candidate(partyProvider, defenseId).value, defense[0], "the wearer's established enemy debuff is available as enemy support");
});
