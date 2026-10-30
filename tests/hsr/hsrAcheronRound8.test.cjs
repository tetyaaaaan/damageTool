"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  readJson, fixedSourceSha, loadProductionFixture, makeRequest,
  independentDirectDamage, assertClose, runtime
} = require("./helpers/hsrDirectVerification.cjs");
const authored = require("../../games/hsr/data/calc/attacks-acheron-round8.json").overrides[0];
const authoredModifiers = require("../../games/hsr/data/calc/modifiers-acheron-round8.json").modifiers;

test("Round8 Acheron data uses the fixed Lv1-Lv10 coefficients and an explicit 13-hit snapshot", async () => {
  const { data } = await loadProductionFixture();
  const attack = data.attacks.find(item => item.id === "130803" && item.provenance?.sourceCommit === fixedSourceSha)
    || authored;
  const catalog = readJson("games/hsr/data/catalog.json");
  const characters = catalog.characters.find(item => item.id === "1308");
  const ultimate = characters.skills.find(item => item.id === "130803");
  const a6 = characters.traces.find(item => item.id === "1308103");
  assert.equal(attack.damageFormula, "componentSequence");
  assert.equal(attack.maximumEidolon, 0);
  assert.equal(attack.maximumTraceLevel, 10);
  assert.equal(attack.enemyCountExact, 1);
  assert.equal(attack.damageComponents.length, 13);
  assert.equal(attack.damageComponents.filter(item => item.key.endsWith("-direct")).length, 3);
  assert.equal(attack.damageComponents.filter(item => item.key.endsWith("-knots")).length, 3);
  assert.equal(attack.damageComponents.filter(item => item.key.startsWith("a6-extra-")).length, 6);
  assert.equal(attack.damageComponents[6].multipliers[0], ultimate.params[0][2] * 100);
  assert.deepEqual(Array.from(a6.params[0]), [0.3, 3, 3, 6, 0.25]);
  assert.match(attack.conditionText, /9層/);
  assert.match(attack.conditionText, /3層/);
  assert.match(attack.calculationNote, /初回付与順/);

  for (let level = 1; level <= 10; level++) {
    const p = ultimate.params[level - 1];
    const components = attack.damageComponents;
    for (const c of components.filter(item => item.key.endsWith("-direct"))) assertClose(c.multipliers[level - 1], p[0] * 100, "Rainblade direct coefficient Lv" + level);
    for (const c of components.filter(item => item.key.endsWith("-knots"))) assertClose(c.multipliers[level - 1], p[4] * 100, "3-knot AoE coefficient Lv" + level);
    for (const c of components.filter(item => item.key.startsWith("a6-extra-"))) assertClose(c.multipliers[level - 1], p[4] === undefined ? 25 : a6.params[0][4] * 100, "A6 extra coefficient Lv" + level);
    const formula = 3 * (p[0] * 100 + p[4] * 100) + p[2] * 100;
    assertClose(formula, p[5] * 100, "fixed source main-target total Lv" + level);
    assertClose(components.reduce((sum, c) => sum + c.multipliers[level - 1], 0), formula + 6 * 25, "expanded sequence total Lv" + level);
  }
});

test("Acheron native resistance reduction is automatic only during Ultimate and follows the trace level", async () => {
  const { data } = await loadProductionFixture();
  const catalog = readJson("games/hsr/data/catalog.json");
  const talent = catalog.characters.find(item => item.id === "1308").skills.find(item => item.id === "130804");
  const modifier = data.structuredModifiers.find(item => item.id === "trace:1308:130804:ultimate-all-resistance-reduction")
    || authoredModifiers.find(item => item.id === "trace:1308:130804:ultimate-all-resistance-reduction");
  assert.ok(modifier);
  assert.equal(modifier.category, "resistanceReduction");
  assert.equal(modifier.activation.mode, "always");
  assert.deepEqual(Array.from(modifier.target.attackTypes), ["ultimate"]);
  assert.equal(runtime.applicableToAttack({ ...modifier, enabled: true, calculable: true }, { id: "130803", type: "ultimate", element: "Thunder" }), true);
  assert.equal(runtime.applicableToAttack({ ...modifier, enabled: true, calculable: true }, { id: "130801", type: "skill", element: "Thunder" }), false, "ultimate RES reduction never affects skills");
  for (let level = 1; level <= 10; level++) {
    const value = runtime.resolveValue(modifier, { traceLevelFor: () => level }, {});
    assertClose(value, talent.params[level - 1][1] * 100, "ultimate RES reduction Lv" + level);
  }
});

test("Acheron's fixed-state total matches an independent direct-damage sum for every Ultimate level", async () => {
  const { data, engine } = await loadProductionFixture();
  const attack = data.attacks.find(item => item.id === "130803" && item.provenance?.sourceCommit === fixedSourceSha)
    || authored;
  const talentReduction = authoredModifiers.find(item => item.category === "resistanceReduction");
  const scenarios = [
    { atk: 3000, hp: 6000, def: 2400, critRate: 45, critDamage: 130, damageBonus: 12, enemyLevel: 80, enemyCount: 1, resistance: 20, toughnessActive: true },
    { atk: 4123.5, hp: 10432, def: 1876.25, critRate: 25, critDamage: 155, damageBonus: 48, enemyLevel: 90, enemyCount: 1, resistance: 40, defenseReduction: 20, defenseIgnore: 10, toughnessActive: false }
  ];
  for (let level = 1; level <= 10; level++) {
    for (const [index, scenario] of scenarios.entries()) {
      const native = [
        { id: "traceNode:1308:1308103:ultimate-three-stack-damage", enabled: true, applicable: true, category: "damageBonus", value: 90 },
        { id: talentReduction.id, enabled: true, applicable: true, category: "resistanceReduction", value: talentReduction.value.values[level - 1] }
      ];
      const parent = makeRequest(attack, level, { ...scenario, characterLevel: 80, eidolon: 0, enemyCount: 1 }, native);
      parent.modifierInputs = {"acheron-initial-knots":9};
      const components = attack.damageComponents.map(component => {
        const input = { ...parent, attack: {
          ...parent.attack,
          id: component.attackId,
          sourceSkillId: "130803",
          name: component.name,
          type: component.type,
          attackType: component.type,
          element: component.element,
          target: component.target,
          scalingStat: component.scalingStat,
          damageFormula: "statMultiplier",
          multiplier: component.multipliers[level - 1],
          hitCount: 1,
          canCrit: true
        } };
        return { key: component.key, name: component.name, input };
      });
      parent.sequenceComponents = components;
      const expectedByComponent = components.map(component => independentDirectDamage(component.input));
      const actual = engine.calculate(parent);
      assert.notEqual(actual.supported, false, "Acheron Ultimate Lv" + level + " scenario" + index + " must calculate");
      for (const key of ["nonCrit", "crit", "expected"]) {
        const expected = expectedByComponent.reduce((sum, result) => sum + result[key], 0);
        assertClose(actual[key], expected, "Acheron Lv" + level + " scenario" + index + " independent " + key);
      }
      assert.equal(Object.keys(actual.components).length, 13);
      assertClose(actual.components.resurge.nonCrit, expectedByComponent[6].nonCrit, "Resurge remains its own AoE component");
      if (level === 1 && index === 0) {
        const missing = JSON.parse(JSON.stringify(parent)); missing.sequenceComponents.pop();
        assert.equal(engine.calculate(missing).supported, false, "missing one component is rejected");
        const reordered = JSON.parse(JSON.stringify(parent));
        [reordered.sequenceComponents[0], reordered.sequenceComponents[1]] = [reordered.sequenceComponents[1], reordered.sequenceComponents[0]];
        assert.equal(engine.calculate(reordered).supported, false, "reordered components are rejected");
        const changedCharacter = JSON.parse(JSON.stringify(parent)); changedCharacter.sequenceComponents[0].input.character.stats.atk += 1;
        assert.equal(engine.calculate(changedCharacter).supported, false, "a component using different character stats is rejected");
      }
    }
  }
});
