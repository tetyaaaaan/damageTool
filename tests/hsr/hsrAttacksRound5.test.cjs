"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fixedSourceSha, loadProductionFixture, makeRequest, independentDirectDamage, assertMatchesIndependent, assertClose, runtime } = require("./helpers/hsrDirectVerification.cjs");
const authoredOverrides = require("../../games/hsr/data/calc/attacks-round5.json").overrides;

const fixedValues = {
  "121202": [100, 110, 120, 130, 140, 150, 162.5, 175, 187.5, 200],
  "150602": [80, 88, 96, 104, 112, 120, 130, 140, 150, 160],
  "150802": [90, 99, 108, 117, 126, 135, 146.25, 157.5, 168.75, 180]
};
const shape = {
  "121202": { characterId: "1212", element: "Ice", target: "single" },
  "150602": { characterId: "1506", element: "Imaginary", target: "aoe" },
  "150802": { characterId: "1508", element: "Quantum", target: "single" }
};
const ids = Object.keys(fixedValues);
const round5Attack = (data, id) => {
  const loaded = data.attacks.find(item => item.id === id && item.provenance?.sourceCommit === fixedSourceSha);
  return loaded || authoredOverrides.find(item => item.id === id);
};

test("production loader registers three fixed-source, E0 single-component Skill attacks", async () => {
  const { data, engine } = await loadProductionFixture();
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  for (const id of ids) {
    const matches = data.attacks.filter(item => item.id === id && item.provenance?.sourceCommit === fixedSourceSha);
    assert.equal(matches.length, 1, id + " one fixed-source override");
    const attack = matches[0];
    assert.equal(attack.type, "skill");
    assert.equal(attack.traceKey, "skill");
    assert.equal(attack.characterId, shape[id].characterId);
    assert.equal(attack.element, shape[id].element);
    assert.equal(attack.target, shape[id].target);
    assert.equal(attack.scalingStat, "atk");
    assert.equal(attack.damageFormula, "statMultiplier");
    assert.equal(attack.hitCount, 1);
    assert.equal(attack.canCrit, true);
    assert.equal(attack.maximumEidolon, 0);
    assert.equal(attack.maximumTraceLevel, 10);
    assert.equal(attack.support.status, "calculable");
    assert.equal(attack.support.verified, true);
    assert.equal(attack.provenance.sourceCommit, fixedSourceSha);
    assert.deepEqual(Array.from(attack.multipliers), fixedValues[id]);
    assert.equal(engine.unsupportedAttackReason(attack), "", id + " uses the existing direct-damage path");
  }
});

test("all fixed-source Skill levels match literal independent damage in varied combat scenarios", async () => {
  const { data, engine } = await loadProductionFixture();
  const scenarios = [
    { atk: 3000, baseAtk: 1000, critRate: 50, critDamage: 100, damageBonus: 0, resistance: 20, enemyLevel: 80, toughnessActive: true },
    { atk: 4123.5, baseAtk: 1100, critRate: 25, critDamage: 155, damageBonus: 48, resistance: 40, enemyLevel: 90, defenseReduction: 20, defenseIgnore: 10, toughnessActive: false },
    { atk: 2876.25, baseAtk: 900, critRate: 75, critDamage: 65, damageBonus: 23.5, resistance: 0, enemyLevel: 70, defenseIgnore: 30, resistancePenetration: 10, takenDamage: 15, toughnessActive: true }
  ];
  for (const id of ids) {
    const attack = round5Attack(data, id);
    assert.deepEqual(Array.from(attack.multipliers), fixedValues[id]);
    for (let level = 1; level <= fixedValues[id].length; level++) {
      for (const [index, scenario] of scenarios.entries()) {
        const config = { ...scenario, characterLevel: 80, eidolon: 0, enemyCount: 1 };
        const input = makeRequest(attack, level, config);
        const result = assertMatchesIndependent(engine, input, id + " Lv" + level + " scenario" + index);
        const expected = independentDirectDamage(input);
        const coefficient = fixedValues[id][level - 1];
        assertClose(expected.effectiveReferenceValue, scenario.atk, id + " Lv" + level + " ATK reference");
        assertClose(expected.nonCrit, scenario.atk * coefficient / 100 * (1 + scenario.damageBonus / 100) * expected.defense * expected.resistance * expected.toughness * (1 + (scenario.takenDamage || 0) / 100), id + " Lv" + level + " literal direct formula");
        assertClose(result.nonCrit, expected.nonCrit, id + " Lv" + level + " engine/independent");
      }
      const input = makeRequest(attack, level, { atk: 3000, hp: 99999, def: 99999, baseAtk: 1000, baseHp: 50000, baseDef: 50000, enemyLevel: 80, resistance: 20, toughnessActive: true });
      const changedNonReference = makeRequest(attack, level, { atk: 3000, hp: 1, def: 1, baseAtk: 1000, baseHp: 1, baseDef: 1, enemyLevel: 80, resistance: 20, toughnessActive: true });
      assertClose(engine.calculate(input).nonCrit, engine.calculate(changedNonReference).nonCrit, id + " Lv" + level + " ignores non-reference HP and DEF");
    }
  }
});

test("existing general damage support applies while Ultimate-only support stays out of Skills", async () => {
  const { data, engine } = await loadProductionFixture();
  const attack = round5Attack(data, "150802");
  const ultimateOnly = data.structuredModifiers.find(item => item.id === "lightCone:21013:ultimate-damage");
  const general = data.structuredModifiers.find(item => item.id === "lightCone:21012:base-damage");
  assert.ok(ultimateOnly && general);
  const context = { characterId: "1001", lightConeId: "21013", refinement: 1, stats: { hpPercent: 70 }, enemy: { hpPercent: 50 } };
  const ultimateCandidate = runtime.buildCandidates([ultimateOnly], context)[0];
  assert.equal(ultimateCandidate.enabled, true);
  assert.equal(runtime.applicableToAttack(ultimateCandidate, attack), false);
  const generalCandidate = runtime.buildCandidates([general], { ...context, lightConeId: "21012" })[0];
  assert.equal(generalCandidate.enabled, true);
  assert.equal(runtime.applicableToAttack(generalCandidate, attack), true);
  const input = makeRequest(attack, 10, { atk: 3000, critRate: 0, critDamage: 0 }, [generalCandidate]);
  const result = assertMatchesIndependent(engine, input, "150802 with existing general damage bonus");
  assertClose(result.nonCrit, 3000 * 180 / 100 * 0.5 * 0.8 * 0.9 * 1.2, "150802 plus LC21012 literal value");
});

test("skill definitions remain calculable after JSON serialization and reload", async () => {
  const { data, engine } = await loadProductionFixture();
  for (const id of ids) {
    const restored = JSON.parse(JSON.stringify(round5Attack(data, id)));
    assert.equal(restored.id, id);
    assert.deepEqual(restored.multipliers, fixedValues[id]);
    const result = engine.calculate(makeRequest(restored, 10, { atk: 3000, critRate: 0, critDamage: 0 }));
    assert.ok(Number.isFinite(result.nonCrit), id + " remains calculable after restore");
  }
});
