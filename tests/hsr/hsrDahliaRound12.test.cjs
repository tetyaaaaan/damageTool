"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  fixedSourceSha,
  loadProductionFixture,
  makeRequest,
  independentDirectDamage,
  assertClose,
  readJson,
  runtime
} = require("./helpers/hsrDirectVerification.cjs");

const attackFile = "games/hsr/data/calc/attacks-dahlia-round12.json";
const modifierFile = "games/hsr/data/calc/modifiers-dahlia-round12.json";
const talentPerHit = [15, 16.5, 18, 19.5, 21, 22.5, 24.37, 26.25, 28.12, 30];

const profiles = [
  { atk: 3317, hp: 7159, def: 2411, critRate: 37, critDamage: 143, damageBonus: 19, enemyLevel: 82, resistance: 27, defenseReduction: 11, defenseIgnore: 4, resistancePenetration: 7, takenDamage: 9, toughnessActive: true },
  { atk: 5041, hp: 8923, def: 3869, critRate: 71, critDamage: 88, damageBonus: 46, enemyLevel: 93, resistance: 5, defenseReduction: 0, defenseIgnore: 12, resistancePenetration: 13, takenDamage: 0, toughnessActive: false }
];

function fieldCandidate(record, { active, actorId = "1407", broken = true } = {}) {
  return runtime.buildCandidates([record], {
    characterId: actorId,
    partyIds: ["1321"],
    partyEidolons: { "1321": 0 },
    enemy: { count: 1, toughnessActive: !broken },
    stats: { breakEffect: 213.75 },
    traceLevelFor: () => 10
  }, { "dahlia-skill-field-active": active }).map((item) => ({
    ...item,
    applicable: item.applicable && runtime.applicableToAttack(item, { type: "superBreak", element: "Fire" })
  }));
}

test("Dahlia Talent follow-up direct damage uses pinned per-hit multipliers for the resolved five-bounce event", async () => {
  const definition = readJson(attackFile);
  const attack = definition.overrides.find((item) => item.id === "132104");
  assert.ok(attack);
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  assert.equal(definition.generatedFrom.includes(fixedSourceSha), true);
  assert.deepEqual(attack.multipliers, talentPerHit);
  assert.equal(attack.sourceSkillId, "132104");
  assert.equal(attack.type, "followUp");
  assert.equal(attack.traceKey, "talent");
  assert.equal(attack.hitCount, 5);
  assert.equal(attack.enemyCountExact, 1);
  assert.equal(attack.maximumEidolon, 0);
  assert.equal(attack.maximumTraceLevel, 10);
  assert.match(attack.conditionText, /ダリア以外.*共に舞う者.*敵を攻撃/);
  assert.match(attack.calculationNote, /超撃破は別成分/);

  const { data, engine } = await loadProductionFixture();
  const productionAttack = data.attacks.find((item) => item.id === attack.id);
  assert.ok(productionAttack, "the coordinator must add the owned attack file to the shared manifest");
  assert.deepEqual(Array.from(productionAttack.multipliers), talentPerHit);
  assert.equal(engine.unsupportedAttackReason(productionAttack), "");
  for (let level = 1; level <= talentPerHit.length; level += 1) {
    for (const [profileIndex, profile] of profiles.entries()) {
      const input = makeRequest(productionAttack, level, { ...profile, characterLevel: 80, eidolon: 0, enemyCount: 1 });
      const perHit = independentDirectDamage({ ...input, attack: { ...input.attack, hitCount: 1 } });
      const result = engine.calculate(input);
      assert.notEqual(result.supported, false, `Talent Lv${level} profile${profileIndex}`);
      for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], perHit[key] * 5, `Talent Lv${level} profile${profileIndex} ${key}`);
      for (const key of ["nonCrit", "crit", "expected"]) assertClose(result.perHit[key], perHit[key], `Talent Lv${level} profile${profileIndex} perHit/${key}`);
      assertClose(result.breakdown.multiplierPercent, talentPerHit[level - 1], `Talent Lv${level} per-hit multiplier`);
      assert.equal(result.attack.hitCount, 5);
      assert.ok(result.nonCrit < perHit.nonCrit * 6, "hit count is applied once; multiplier remains per hit");
    }
  }
});

test("Dahlia's active field contributes only break efficiency to a pre-broken SuperBreak calculation", async () => {
  const record = readJson(modifierFile).modifiers.find((item) => item.id === "trace:1321:132102:field-break-efficiency");
  assert.ok(record);
  assert.equal(record.activation.mode, "toggle");
  assert.equal(record.activation.default, false);
  assert.deepEqual(record.target.attackTypes, ["break", "superBreak"]);
  assert.equal(record.target.owner, "partyAll");
  assert.match(record.description, /敵が未撃破の時にも超撃破.*未対応/);

  const { data, engine } = await loadProductionFixture();
  assert.ok(data.structuredModifiers.some((item) => item.id === record.id), "the coordinator must add the owned modifier file to the shared manifest");
  const off = fieldCandidate(record, { active: false });
  const on = fieldCandidate(record, { active: true });
  assert.equal(off[0].enabled, false);
  assert.equal(on[0].enabled, true);
  assert.equal(on[0].value, 50);
  assert.equal(on[0].providerId, "1321");
  assert.equal(on[0].applicable, true);
  assert.equal(runtime.applicableToAttack(on[0], { type: "normal", element: "Fire" }), false);

  const base = {
    character: { level: 80, stats: { breakEffect: 213.75 } },
    enemy: { count: 1, level: 82, resistance: 27, weakness: true, toughnessActive: false, defenseReduction: 11, defenseIgnore: 4, resistancePenetration: 7, takenDamage: 9 },
    attack: { id: "dahlia-field-sb-fixture", type: "superBreak", element: "Fire", toughnessDamage: 30, superBreakMultiplier: 100 },
    breakBaseDamage: data.breakBaseDamage
  };
  const before = engine.calculateSuperBreak({ ...base, modifiers: off });
  const after = engine.calculateSuperBreak({ ...base, modifiers: on });
  const expectedBefore = 3767.5533 * 3 * (1 + 213.75 / 100) * (100 / (100 + 102 * (1 - 0.11 - 0.04))) * (1 - (27 - 7) / 100) * (1 + 9 / 100);
  const expectedAfter = expectedBefore * 1.5;
  assert.equal(before.supported, true);
  assert.equal(after.supported, true);
  assertClose(before.value, expectedBefore, "pre-broken SuperBreak without field");
  assertClose(after.value, expectedAfter, "pre-broken SuperBreak with field break efficiency");

  const unbroken = engine.calculateSuperBreak({ ...base, enemy: { ...base.enemy, toughnessActive: true }, modifiers: on });
  assert.equal(unbroken.supported, false, "the field modifier does not invent SuperBreak before Break");
});

test("Dahlia Talent SuperBreak is a separate broken-target component with explicit base toughness input", async () => {
  const definition = readJson(attackFile);
  const attack = definition.overrides.find((item) => item.id === "1321042");
  const conversion = [100, 110, 120, 130, 140, 150, 162.5, 175, 187.5, 200];
  assert.ok(attack);
  assert.deepEqual(attack.multipliers, conversion);
  assert.equal(attack.type, "superBreak");
  assert.equal(attack.damageFormula, "dahliaSuperBreak");
  assert.equal(attack.canCrit, false);
  assert.equal(attack.requiresBrokenTarget, true);
  assert.equal(attack.requiresFireWeakness, true);
  assert.equal(attack.enemyCountExact, 1);
  assert.equal(attack.numericModifierInputs[0].inputKey, "dahlia-fua-base-toughness");
  assert.equal(Object.hasOwn(attack.numericModifierInputs[0], "default"), false, "missing base toughness is not guessed");

  const { data, engine } = await loadProductionFixture();
  const productionAttack = data.attacks.find((item) => item.id === attack.id);
  assert.ok(productionAttack, "the coordinator must register the separately displayed component");
  assert.equal(engine.unsupportedAttackReason(productionAttack), "");
  const record = readJson(modifierFile).modifiers.find((item) => item.id === "trace:1321:132102:field-break-efficiency");
  assert.ok(data.structuredModifiers.some((item) => item.id === record.id));

  for (let level = 1; level <= conversion.length; level += 1) {
    for (const baseToughness of [7.25, 31.75]) {
      for (const active of [false, true]) {
        const profile = { ...profiles[(level + Number(active)) % profiles.length], breakEffect: 213.75 };
        const selectedModifier = fieldCandidate(record, { active, broken: true })[0];
        const input = makeRequest(productionAttack, level, { ...profile, characterLevel: 80, eidolon: 0, enemyCount: 1, weakness: true, toughnessActive: false }, [selectedModifier]);
        input.character.stats.breakEffect = profile.breakEffect;
        input.modifierInputs = { "dahlia-fua-base-toughness": baseToughness };
        input.breakBaseDamage = data.breakBaseDamage;
        const result = engine.calculate(input);
        const def = 100 / (100 + (profile.enemyLevel + 20) * (1 - profile.defenseReduction / 100 - profile.defenseIgnore / 100));
        const res = 1 - (profile.resistance - profile.resistancePenetration) / 100;
        const expected = data.breakBaseDamage[80] * (conversion[level - 1] / 100) * (baseToughness * (active ? 1.5 : 1) / 10)
          * (1 + profile.breakEffect / 100) * def * res * (1 + profile.takenDamage / 100);
        assert.notEqual(result.supported, false, `FUA SB Lv${level}/toughness${baseToughness}/field${active}`);
        assertClose(result.breakdown.finalBreakEffect, profile.breakEffect, "BE detail is the final percent, not its multiplier");
        assertClose(result.nonCrit, expected, `FUA SB Lv${level}/toughness${baseToughness}/field${active}`);
        assertClose(result.crit, expected, "SuperBreak cannot crit");
        assertClose(result.expected, expected, "SuperBreak has no crit expectation");
      }
    }
  }

  const profile = { ...profiles[0], breakEffect: 213.75 };
  const candidate = fieldCandidate(record, { active: true })[0];
  const base = makeRequest(productionAttack, 10, { ...profile, characterLevel: 80, eidolon: 0, enemyCount: 1, weakness: true, toughnessActive: false }, [candidate]);
  base.character.stats.breakEffect = profile.breakEffect;
  base.breakBaseDamage = data.breakBaseDamage;
  for (const invalid of [
    { enemy: { ...base.enemy, toughnessActive: true } },
    { enemy: { ...base.enemy, weakness: false } },
    { enemy: { ...base.enemy, count: 2 } },
    { character: { ...base.character, eidolon: 1 } },
    { modifierInputs: {} }
  ]) assert.equal(engine.calculate({ ...base, ...invalid }).supported, false, "unsupported conditions and missing input are rejected locally");
});
