"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  fixedSourceSha, loadProductionFixture, makeRequest, independentDirectDamage,
  assertClose
} = require("./helpers/hsrDirectVerification.cjs");
const definition = require("../../games/hsr/data/calc/attacks-himeko-departure-round30.json");

const expected = {
  "151001": [50, 60, 70, 80, 90, 100],
  // Three confirmed final hits to one enemy: 3 × the per-hit curve in 151003.params[6].
  "151003": [120, 132, 144, 156, 168, 180, 195, 210, 225, 240],
  // The basic AoE pulse with exactly one prior charge has no extra random shot.
  "151009": [10, 11, 12, 13, 14, 15, 16.25, 17.5, 18.75, 20],
  // Himeko uses the support skill: AoE plus four random hits, all hitting the sole enemy.
  "151022": [172, 187.6, 203.2, 218.8, 234.4, 250, 269.5, 289, 308.5, 328]
};

test("Round30 Himeko-departure rows preserve only fixed-source E0 direct components", () => {
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  assert.equal(definition.overrides.length, 4);
  assert.deepEqual(definition.overrides.map(row => row.id), Object.keys(expected));

  for (const row of definition.overrides) {
    assert.equal(row.characterId, "1510");
    assert.equal(row.sourceSkillId, row.id);
    assert.equal(row.element, "Fire");
    assert.equal(row.scalingStat, "atk");
    assert.equal(row.damageFormula, "statMultiplier");
    assert.equal(row.hitCount, 1, "the stored coefficient already represents the limited direct component");
    assert.equal(row.canCrit, true);
    assert.equal(row.maximumEidolon, 0);
    assert.equal(row.maximumTraceLevel, expected[row.id].length);
    assert.equal(row.characterLevelExact, 80);
    assert.equal(row.enemyCountExact, 1);
    assert.equal(row.support.status, "calculable");
    assert.equal(row.support.verified, true);
    assert.deepEqual(row.multipliers, expected[row.id]);
    assert.equal(row.provenance.sourceCommit, fixedSourceSha);
    assert.equal(row.provenance.verification, "tests/hsr/hsrHimekoDepartureRound30.test.cjs");
  }

  const finisher = definition.overrides.find(row => row.id === "151003");
  assert.match(finisher.calculationNote, /params\[5\].*params\[6\]/);
  assert.match(finisher.calculationNote, /params\[8\.\.9\].*使用しません/);
  const pulse = definition.overrides.find(row => row.id === "151009");
  assert.match(pulse.conditionText, /原動力を1所持/);
  assert.match(pulse.name, /追加弾なし/);
  const support = definition.overrides.find(row => row.id === "151022");
  assert.equal(support.type, "assist");
  assert.match(support.conditionText, /姫子本人が支援スキルを使用/);
  assert.match(support.calculationNote, /敵1体に限定/);
});

test("Round30 Himeko direct coefficients match independent damage at every supported E0 level", async () => {
  const { engine } = await loadProductionFixture();
  const scenarios = [
    { atk: 3000, critRate: 40, critDamage: 90, damageBonus: 0, resistance: 20, enemyLevel: 80, toughnessActive: true },
    { atk: 4123.5, critRate: 25, critDamage: 155, damageBonus: 48, resistance: 40, enemyLevel: 90, defenseReduction: 20, defenseIgnore: 10, toughnessActive: false },
    { atk: 2876.25, critRate: 75, critDamage: 65, damageBonus: 23.5, resistance: 0, enemyLevel: 70, resistancePenetration: 10, takenDamage: 15, toughnessActive: true }
  ];

  for (const row of definition.overrides) {
    for (let level = 1; level <= expected[row.id].length; level++) {
      for (const [index, scenario] of scenarios.entries()) {
        const input = makeRequest(row, level, { ...scenario, characterLevel: 80, eidolon: 0, enemyCount: 1 });
        input.modifierInputs={'himeko-departure-drive':1};
        const independent = independentDirectDamage(input);
        const result = engine.calculate(input);
        const multiplier = expected[row.id][level - 1];
        const raw = scenario.atk * multiplier / 100;
        assertClose(independent.effectiveReferenceValue, scenario.atk, `${row.id} Lv${level} ATK reference scenario${index}`);
        assertClose(independent.nonCrit, raw * (1 + scenario.damageBonus / 100) * independent.defense * independent.resistance * independent.toughness * (1 + (scenario.takenDamage || 0) / 100), `${row.id} Lv${level} literal direct formula scenario${index}`);
        assert.notEqual(result.supported, false, `${row.id} Lv${level} engine support scenario${index}`);
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], independent[key], `${row.id} Lv${level} ${key} scenario${index}`);
      }
    }
  }
});
