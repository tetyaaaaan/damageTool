"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  fixedSourceSha, loadProductionFixture, attackOf, makeRequest,
  independentDirectDamage, assertClose, readJson
} = require("./helpers/hsrDirectVerification.cjs");

const overrides = readJson("games/hsr/data/calc/attacks-elemental-composites-round18.json").overrides;
const definitions = [
  { id: "1109012", main: "110901", talent: "110904", state: "hook-enemy-burning", mainLevel: 5, talentLevel: 8 },
  { id: "1109022", main: "110902", talent: "110904", state: "hook-enemy-burning", mainLevel: 7, talentLevel: 8 },
  { id: "1109092", main: "110909", talent: "110904", state: "hook-enemy-burning", mainLevel: 7, talentLevel: 8 },
  { id: "1109032", main: "110903", talent: "110904", state: "hook-enemy-burning", mainLevel: 7, talentLevel: 8 },
  { id: "1103012", main: "110301", talent: "110304", state: "serval-target-shocked", mainLevel: 5, talentLevel: 8 },
  { id: "1103022", main: "110302", talent: "110304", state: "serval-target-shocked", mainLevel: 7, talentLevel: 8 },
  { id: "1103032", main: "110303", talent: "110304", state: "serval-target-shocked", mainLevel: 7, talentLevel: 8 }
];

test("Round18 composites use two pinned E0 components and require a pre-existing state", async () => {
  const { data, engine } = await loadProductionFixture();
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  assert.deepEqual(overrides.map(item => item.id), definitions.map(item => item.id));

  for (const spec of definitions) {
    const parent = attackOf(data, spec.id);
    const body = attackOf(data, spec.main);
    const talent = attackOf(data, spec.talent);
    assert.equal(parent.damageFormula, "componentSequence", spec.id);
    assert.equal(parent.maximumEidolon, 0, spec.id);
    assert.equal(parent.enemyCountExact, 1, spec.id);
    assert.equal(parent.damageComponents.length, 2, spec.id);
    assert.deepEqual(parent.damageComponents.map(item => [item.key, item.attackId]), [
      ["body", spec.main], ["additional", spec.talent]
    ], spec.id);
    assert.equal(parent.damageComponents[0].type, body.type, spec.id + " preserves body attack type");
    assert.equal(parent.damageComponents[1].type, talent.type, spec.id + " preserves Talent source type");
    assert.deepEqual(parent.damageComponents[0].multipliers.slice(0, parent.maximumTraceLevel), body.multipliers.slice(0, parent.maximumTraceLevel), spec.id + " E0 body curve");
    assert.deepEqual(parent.damageComponents[1].multipliers.slice(0, 10), talent.multipliers.slice(0, 10), spec.id + " E0 Talent curve");
    assert.equal(parent.modifierInputKey, spec.state, spec.id + " state key");
    assert.equal(parent.modifierInputMinimum, 1, spec.id + " requires pre-existing state");
    assert.match(parent.calculationNote, /新たに付与する.*同撃発生順/);

    const profile = { atk: 3175, baseAtk: 1048, critRate: 37, critDamage: 83, resistance: 20 };
    const parentLevel = spec.mainLevel;
    const sequenceComponents = parent.damageComponents.map((component, index) => {
      const source = attackOf(data, component.attackId);
      const level = index === 0 ? spec.mainLevel : spec.talentLevel;
      const input = makeRequest(source, level, profile);
      input.attack.damageFormula = "statMultiplier";
      input.attack.type = component.type;
      input.attack.attackType = component.type;
      input.attack.target = component.target;
      input.attack.multiplier = source.multipliers[level - 1];
      input.modifierInputs = { [spec.state]: true };
      return { key: component.key, name: component.name, input };
    });
    const request = makeRequest(parent, parentLevel, { ...profile, enemyCount: 1 });
    request.modifierInputs = { [spec.state]: true };
    request.sequenceComponents = sequenceComponents;

    const expected = sequenceComponents.map(component => independentDirectDamage(component.input));
    const result = engine.calculate(request);
    assert.notEqual(result.supported, false, spec.id + " calculates: " + result.reason);
    for (const key of ["nonCrit", "crit", "expected"]) {
      assertClose(result[key], expected.reduce((sum, item) => sum + item[key], 0), spec.id + " sum " + key);
      for (let index = 0; index < expected.length; index++) assertClose(result.components[componentKey(index)][key], expected[index][key], spec.id + " component " + key);
    }

    request.modifierInputs[spec.state] = false;
    assert.equal(engine.calculate(request).supported, false, spec.id + " requires the state before the action");
    const bodyOnly = makeRequest(body, spec.mainLevel, profile);
    assert.notEqual(engine.calculate(bodyOnly).supported, false, spec.main + " standalone body remains available");
    if (spec.id === "1109012" || spec.id === "1103012") {
      const dot = attackOf(data, spec.id === "1109012" ? "1109021" : "1103021");
      assert.notEqual(engine.calculate(makeRequest(dot, 10, profile)).supported, false, dot.id + " delayed DoT remains a separate row");
    }
  }
});

function componentKey(index) { return index === 0 ? "body" : "additional"; }
