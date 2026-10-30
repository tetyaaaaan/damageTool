"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  fixedSourceSha, loadProductionFixture, makeRequest,
  independentDirectDamage, assertClose, runtime
} = require("./helpers/hsrDirectVerification.cjs");
const override = require("../../games/hsr/data/calc/attacks-lingsha-round10.json").overrides[0];

test("Lingsha E6 Fuyuan adds four fixed 50%-ATK Fire hits, separately from the Fuyuan attack", async () => {
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  const { data, engine } = await loadProductionFixture();
  const productionAttack = data.attacks.find(item => item.id === override.id);
  assert.ok(productionAttack, "Round10 attack override is registered in the production loader");
  assert.equal(productionAttack.requiredEidolon, 6);
  const rank = data.structuredModifiers.find(item => item.id === "eidolon:1222:6:fuyuan-all-res-down");
  assert.ok(rank, "E6 Fuyuan RES reduction is in production data");
  assert.equal(override.requiredEidolon, 6);
  assert.equal(override.sourceSkillId, "122206");
  assert.equal(override.fixedTraceLevel, 1, "the fixed Eidolon coefficient does not scale with trace level");
  assert.equal(override.hitCount, 4);
  assert.deepEqual(Array.from(override.multipliers), [50]);
  assert.equal(override.element, "Fire");
  assert.equal(override.type, "followUp");
  assert.equal(override.target, "single", "one enemy removes random target selection");
  assert.equal(override.enemyCountExact, 1);
  assert.equal(override.enforceSnapshotContract, true);
  assert.equal(override.comparisonModifierInputs["lingsha-fuyuan-on-field"], true);
  assert.equal(override.damageComponents, undefined, "this is a separate additional component row, not the base Fuyuan attack");
  assert.match(override.calculationNote, /浮元.*別行/);
  assert.match(override.calculationNote, /削靭値は5/);
  assert.equal(runtime.buildCandidates([rank], { characterId: "1222", eidolon: 5 }, { "lingsha-fuyuan-on-field": true }).length, 0);
  assert.equal(runtime.buildCandidates([rank], { characterId: "1222", eidolon: 6 }, {})[0].enabled, false);
  assert.equal(runtime.buildCandidates([rank], { characterId: "1222", eidolon: 6 }, { "lingsha-fuyuan-on-field": true })[0].enabled, true);
  const included = runtime.buildCandidates([rank], { characterId: "1222", eidolon: 6 }, {
    "lingsha-fuyuan-on-field": true, [rank.finalStatsInclusion.inputKey]: true
  })[0];
  assert.equal(included.includedInFinalStats, true);
  assert.equal(included.enabled, false, "already-entered enemy RES reduction is not added twice");
});

test("E6 four-hit result independently matches 4 x 50% ATK with E6 RES reduction and ignores E2 BE for direct damage", async () => {
  const { engine, data } = await loadProductionFixture();
  const records = data.structuredModifiers;
  const e6 = records.find(item => item.id === "eidolon:1222:6:fuyuan-all-res-down");
  const e2 = records.find(item => item.id === "eidolon:1222:2:ultimate-break-effect");
  assert.ok(e6 && e2);
  const profile = { atk: 3175.25, hp: 9412.5, def: 1288.75, critRate: 37.5, critDamage: 113.25, damageBonus: 27.5, enemyLevel: 83, resistance: 20, defenseReduction: 12.5, defenseIgnore: 7.5 };
  const context = { characterId: "1222", eidolon: 6, stats: profile, traceLevelFor: () => 10 };
  const stateInputs = { ...override.comparisonModifierInputs, "lingsha-e2-ultimate-break-effect": true };
  const enabled = runtime.buildCandidates([e6, e2], { ...context, attack: override }, stateInputs)
    .filter(item => runtime.applicableToAttack(item, override));
  const input = makeRequest(override, 1, { ...profile, eidolon: 6 }, enabled);
  input.attack = { ...input.attack, multiplier: 50, hitCount: 4 };
  const actual = engine.calculate(input);
  const oracle = independentDirectDamage({ ...input, modifiers: enabled.filter(item => item.id === e6.id), attack: { ...input.attack, hitCount: 1 } });
  for (const key of ["nonCrit", "crit", "expected"]) {
    assertClose(actual[key], oracle[key] * 4, `E6 four hit ${key}`);
  }
  assertClose(actual.breakdown.referenceValue, profile.atk, "each hit reads final ATK");
  assert.equal(actual.applied.some(item => item.id === e6.id), true);
  // E2 BE candidate may be present in the request, but the independent direct-damage oracle excludes it.
  // Matching that oracle proves BE does not leak into ordinary follow-up damage.
  const ordinary = data.attacks.find(item => item.id === "122204");
  assert.ok(ordinary, "the normal Fuyuan attack remains a separate existing action");
  assert.notEqual(ordinary.id, override.id);
});
