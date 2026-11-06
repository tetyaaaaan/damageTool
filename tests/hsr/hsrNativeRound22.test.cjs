"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const runtime = require("../../games/js/hsrModifierRuntime.js");
const { loadProductionFixture, attackOf, makeRequest, independentDirectDamage, assertClose } = require("./helpers/hsrDirectVerification.cjs");

function candidate(data, id, inputKey, value) {
  const record = data.structuredModifiers.find(item => item.id === id);
  assert.ok(record, id + " exists in the production modifier registry");
  return runtime.buildCandidates([record], {
    characterId: "1014", eidolon: 0, traceLevelFor: () => 10
  }, { [inputKey]: value })[0];
}

test("Round22 Saber whole-Ultimate uses one fixed pre-impact snapshot and rejects out-of-scope E0 targets", async () => {
  const { data, engine } = await loadProductionFixture();
  const attack = attackOf(data, "1014032");
  assert.equal(data.attacks.filter(item => item.id === "1014032").length, 1, "existing ID is overlaid once, with no duplicate projection");
  assert.equal(attack.support.status, "calculable");
  assert.equal(attack.support.verified, true);
  assert.equal(attack.enforceSnapshotContract, true);
  assert.equal(attack.maximumEidolon, 0);
  assert.equal(attack.enemyCountExact, 1);
  assert.match(attack.calculationNote, /全11段で攻撃前に確定した同一状態/);
  assert.match(attack.calculationNote, /この必殺技自身が付与する効果を同じ必殺技へ自動適用せず/);
  assert.equal(attack.multiplierComponents[0].values[9] + attack.multiplierComponents[1].values[9], 1380);

  const modifiers = [
    candidate(data, "trace:1014:101404:ally-ultimate-damage", "saber-ally-ultimate-damage-active", true),
    candidate(data, "traceNode:1014:1014103:resonance-crit-damage", "saber-resonance-acquired", 8)
  ];
  const profile = { atk: 3123.5, hp: 9876.25, def: 2345.75, baseAtk: 1140.25, baseHp: 1190.5, baseDef: 920.75, critRate: 37.5, critDamage: 83.25, damageBonus: 11.5, enemyLevel: 82, resistance: 27.5, toughnessActive: true };
  const input = makeRequest(attack, 10, profile, modifiers);
  const expected = independentDirectDamage(input);
  const result = engine.calculate(input);
  assert.notEqual(result.supported, false, result.reason);
  for (const metric of ["nonCrit", "crit", "expected"]) assertClose(result[metric], expected[metric], "single-target 11-hit snapshot " + metric);

  const changingHitState = structuredClone(input);
  changingHitState.modifiers.push({id:"hit-updating-state",category:"progressiveTakenDamage",value:8,enabled:true,applicable:true});
  assert.equal(engine.calculate(changingHitState).supported, false, "a whole-coefficient snapshot must not hide per-hit state changes");

  changingHitState.modifiers.at(-1).target = {attackTypes:["normal"]};
  assertClose(engine.calculate(changingHitState).expected, expected.expected, "a changing modifier for a different attack must not block this Ultimate");

  const eidolonOne = structuredClone(input);
  eidolonOne.character.eidolon = 1;
  assert.equal(engine.calculate(eidolonOne).supported, false, "the attack cannot masquerade as an E1 calculation");
  const twoTargets = structuredClone(input);
  twoTargets.enemy.count = 2;
  assert.equal(engine.calculate(twoTargets).supported, false, "the single-target bounce allocation is not generalized to two enemies");
});
