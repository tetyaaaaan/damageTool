"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  fixedSourceSha,
  loadProductionFixture,
  makeRequest,
  independentDirectDamage,
  assertMatchesIndependent,
  assertClose
} = require("./helpers/hsrDirectVerification.cjs");

const source = require("../../games/hsr/data/calc/attacks-rin-round29.json").overrides[0];
const fixedMainTarget = [300, 330, 360, 390, 420, 450, 487.5, 525, 562.5, 600];

test("Rin Ultimate uses the fixed E0 main-target multipliers for levels 1–10", async () => {
  const { data, engine } = await loadProductionFixture();
  const matches = data.attacks.filter(item => item.id === "150803" && item.provenance?.sourceCommit === fixedSourceSha);
  assert.equal(matches.length, 1);
  const attack = matches[0];
  assert.equal(attack.characterId, "1508");
  assert.equal(attack.type, "ultimate");
  assert.equal(attack.traceKey, "ultimate");
  assert.equal(attack.element, "Quantum");
  assert.equal(attack.target, "single");
  assert.equal(attack.enemyCountExact, 1);
  assert.equal(attack.maximumEidolon, 0);
  assert.equal(attack.maximumTraceLevel, 10);
  assert.deepEqual(Array.from(attack.multipliers), fixedMainTarget);
  assert.equal(engine.unsupportedAttackReason(attack), "");

  const scenarios = [
    { atk: 3000, baseAtk: 1000, critRate: 50, critDamage: 100, damageBonus: 38, resistance: 20, enemyLevel: 80, toughnessActive: true },
    { atk: 4123.5, baseAtk: 1100, critRate: 25, critDamage: 155, damageBonus: 48, resistance: 40, enemyLevel: 90, defenseReduction: 20, defenseIgnore: 10, toughnessActive: true }
  ];
  for (let level = 1; level <= 10; level++) {
    for (const [index, scenario] of scenarios.entries()) {
      const input = makeRequest(attack, level, { ...scenario, characterLevel: 80, eidolon: 0, enemyCount: 1 });
      input.character.id="1508";
      const result = assertMatchesIndependent(engine, input, "150803 Lv" + level + " main target scenario " + index);
      const expected = independentDirectDamage(input);
      assertClose(expected.effectiveReferenceValue, scenario.atk, "150803 ATK reference");
      const direct = scenario.atk * fixedMainTarget[level - 1] / 100;
      const expectedNonCrit = direct * (1 + scenario.damageBonus / 100) * expected.defense * expected.resistance * expected.toughness;
      assertClose(result.nonCrit, expectedNonCrit, "150803 literal direct formula");
      assertClose(result.crit, expectedNonCrit * (1 + scenario.critDamage / 100), "150803 literal crit formula");
    }
  }
});

test("Rin Ultimate main-target row excludes the secondary-target coefficient and other status effects", () => {
  assert.deepEqual(fixedMainTarget, [300, 330, 360, 390, 420, 450, 487.5, 525, 562.5, 600]);
  assert.equal(source.provenance.sourceCommit, fixedSourceSha);
  assert.match(source.provenance.sourceFile, /150803.params; character_skill_trees.json:1508003/);
  assert.match(source.calculationNote, /副対象倍率/);
  assert.match(source.calculationNote, /敵被ダメージ増加/);
});
