"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  fixedSourceSha,
  loadProductionFixture,
  attackOf,
  makeRequest,
  independentDirectDamage,
  assertClose,
  readJson,
  runtime
} = require("./helpers/hsrDirectVerification.cjs");

const attackFile = "games/hsr/data/calc/attacks-xueyi-round16.json";
const curve = [150, 160, 170, 180, 190, 200, 212.5, 225, 237.5, 250];
const profiles = [
  { atk: 3178.5, hp: 8888.25, def: 2345.75, baseAtk: 1024.5, baseHp: 999.25, baseDef: 1117.5, critRate: 32.5, critDamage: 124.75, damageBonus: 31.2, enemyLevel: 82, resistance: 27.5, defenseReduction: 11.25, defenseIgnore: 4.5, resistancePenetration: 8.75, takenDamage: 12.5 },
  { atk: 4987.25, hp: 13221.5, def: 3688.125, baseAtk: 1593.75, baseHp: 1812.25, baseDef: 1254.5, critRate: 71.25, critDamage: 88.5, damageBonus: 63.75, enemyLevel: 96, resistance: 5, defenseReduction: 22.5, defenseIgnore: 13.75, resistancePenetration: 17.25, takenDamage: 0 }
];

function bonus(id, value, attackTypes, elements) {
  return {
    id,
    name: id,
    category: "damageBonus",
    value,
    enabled: true,
    applicable: true,
    target: { attackTypes, elements },
    support: { status: "calculable", verified: true }
  };
}

test("Round16 Xueyi Ultimate direct component is fixed to attack-before-broken targets", async () => {
  const definition = readJson(attackFile);
  const override = definition.overrides.find((item) => item.id === "121403");
  assert.ok(override);
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  assert.equal(override.characterId, "1214");
  assert.equal(override.type, "ultimate");
  assert.equal(override.element, "Quantum");
  assert.equal(override.damageFormula, "statMultiplier");
  assert.equal(override.characterLevelExact, 80);
  assert.equal(override.maximumEidolon, 0);
  assert.equal(override.maximumTraceLevel, 10);
  assert.equal(override.enemyCountExact, 1);
  assert.equal(override.requiresBrokenTarget, true);
  assert.equal(override.enforceSnapshotContract, true);
  assert.deepEqual(override.multipliers, curve);
  assert.match(override.conditionText, /前から撃破済み/);
  assert.match(override.calculationNote, /未撃破.*含めません/);
  assert.match(override.provenance.relatedSourceUrl, /90bc8401408b17dba0a6743d882eb096ee236816\/src\/lib\/conditionals\/character\/1200\/Xueyi\.ts/);
  assert.match(override.provenance.notes, /manually set.*slider/i);
  assert.match(override.provenance.notes, /No conversion formula is inferred/);

  const { data, engine } = await loadProductionFixture();
  const attack = attackOf(data, "121403");
  assert.equal(engine.unsupportedAttackReason(attack), "");
  const a2 = data.structuredModifiers.find((record) => record.source?.id === "1214" && record.source?.traceId === "1214101");
  assert.ok(a2, "Xueyi A2 remains an existing final-DMG input responsibility");
  assert.equal(a2.inputPolicy, "includedInFinalStats");
  assert.equal(a2.support.status, "displayOnly");

  const allowedBonus = bonus("quantum-ultimate-dmg", 18.25, ["ultimate"], ["Quantum"]);
  const wrongTypeBonus = { ...bonus("follow-up-dmg-does-not-apply", 90, ["followUp"], ["Quantum"]), applicable: false };
  const wrongElementBonus = { ...bonus("fire-dmg-does-not-apply", 70, ["ultimate"], ["Fire"]), applicable: false };
  for (let level = 1; level <= 10; level += 1) {
    for (const profile of profiles) {
      const input = makeRequest(attack, level, {
        ...profile,
        characterLevel: 80,
        eidolon: 0,
        enemyCount: 1,
        weakness: false,
        toughnessActive: false
      }, [allowedBonus, wrongTypeBonus, wrongElementBonus]);
      const result = engine.calculate(input);
      const expected = independentDirectDamage(input);
      assert.notEqual(result.supported, false, `Lv${level} ATK${profile.atk}: ${result.reason}`);
      assertClose(result.nonCrit, expected.nonCrit, `Lv${level} non-crit direct damage`);
      assertClose(result.crit, expected.crit, `Lv${level} crit direct damage`);
      assertClose(result.expected, expected.expected, `Lv${level} expected direct damage`);
      assertClose(result.breakdown.damageBonus, profile.damageBonus + 18.25, `Lv${level} only Quantum Ultimate bonus applies`);
      assertClose(result.breakdown.multiplierPercent, curve[level - 1], `Lv${level} independent base ATK coefficient`);
    }
  }

  for (let level = 1; level <= 10; level += 1) {
    const original = makeRequest(attack, level, { ...profiles[0], characterLevel: 80, eidolon: 0, enemyCount: 1, weakness: false, toughnessActive: false });
    const changedNonAtkStats = {
      ...original,
      character: { ...original.character, stats: { ...original.character.stats, hp: 91234, def: 12 }, baseStats: { ...original.character.baseStats, hp: 1234, def: 2345 } }
    };
    assertClose(engine.calculate(changedNonAtkStats).nonCrit, engine.calculate(original).nonCrit, `Lv${level} HP/DEF do not change ATK-scaled Ultimate damage`);
  }

  for (const breakEffect of [0, 123.45, 240, 355]) {
    const candidates = runtime.buildCandidates([a2], { characterId: "1214", eidolon: 0, stats: { breakEffect }, traceLevelFor: () => 1 }, {});
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].enabled, false, "A2 conversion is already in the completed final damage bonus");
    assert.equal(candidates[0].displayOnly, true);
    const finalStats = { ...profiles[0], damageBonus: profiles[0].damageBonus + Math.min(breakEffect, 240) };
    const withA2Record = makeRequest(attack, 10, { ...finalStats, breakEffect, characterLevel: 80, eidolon: 0, enemyCount: 1, weakness: false, toughnessActive: false }, candidates);
    const withoutA2Record = { ...withA2Record, modifiers: [] };
    assertClose(engine.calculate(withA2Record).nonCrit, engine.calculate(withoutA2Record).nonCrit, `A2 BE${breakEffect} is not added a second time`);
  }

  const valid = () => makeRequest(attack, 10, { ...profiles[0], characterLevel: 80, eidolon: 0, enemyCount: 1, weakness: false, toughnessActive: false });
  for (const invalidate of [
    (input) => { input.enemy.toughnessActive = true; },
    (input) => { delete input.enemy.toughnessActive; },
    (input) => { input.enemy.count = 2; },
    (input) => { input.character.eidolon = 1; },
    (input) => { input.character.level = 79; },
    (input) => { input.attack.traceLevel = 11; }
  ]) {
    const input = valid();
    invalidate(input);
    assert.equal(engine.calculate(input).supported, false, "unknown or out-of-scope snapshot conditions cannot return a partial reference result");
  }
});
