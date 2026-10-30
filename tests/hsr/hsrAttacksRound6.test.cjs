"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  fixedSourceSha, loadProductionFixture, makeRequest, independentDirectDamage,
  assertClose, runtime
} = require("./helpers/hsrDirectVerification.cjs");
const authoredOverrides = require("../../games/hsr/data/calc/attacks-round6.json").overrides;

const fixedValues = {
  "1121202": [75, 82.5, 90, 97.5, 105, 112.5, 121.88000000000001, 131.25, 140.61999999999998, 150],
  "130403": [162, 172.8, 183.6, 194.4, 205.20000000000002, 216, 229.5, 243.00000000000003, 256.5, 270],
  "800902": [30, 33, 36, 39, 42, 45, 48.75, 52.5, 56.25, 60],
  "801002": [30, 33, 36, 39, 42, 45, 48.75, 52.5, 56.25, 60],
  "151008": [16, 17.599999999999998, 19.2, 20.8, 22.400000000000002, 24, 26, 28.000000000000004, 30, 32]
};
const expectedShape = {
  "1121202": { characterId: "1212", element: "Ice", type: "skill", target: "single", scalingStat: "hp" },
  "130403": { characterId: "1304", element: "Imaginary", type: "ultimate", target: "single", scalingStat: "def" },
  "800902": { characterId: "8009", element: "Thunder", type: "skill", target: "aoe", scalingStat: "atk" },
  "801002": { characterId: "8010", element: "Thunder", type: "skill", target: "aoe", scalingStat: "atk" },
  "151008": { characterId: "1510", element: "Fire", type: "ultimate", target: "aoe", scalingStat: "atk" }
};
const ids = Object.keys(fixedValues);
const round6Attack = (data, id) => {
  const loaded = data.attacks.find(item => item.id === id && item.provenance?.sourceCommit === fixedSourceSha);
  return loaded || authoredOverrides.find(item => item.id === id);
};

test("production loader registers five fixed-source E0 direct components once", async () => {
  const { data, engine } = await loadProductionFixture();
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  for (const id of ids) {
    const matches = data.attacks.filter(item => item.id === id && item.provenance?.sourceCommit === fixedSourceSha);
    assert.equal(matches.length, 1, id + " one fixed-source override");
    const attack = matches[0];
    for (const [key, value] of Object.entries(expectedShape[id])) assert.equal(attack[key], value, id + " " + key);
    assert.equal(attack.damageFormula, "statMultiplier");
    assert.equal(attack.hitCount, 1);
    assert.equal(attack.canCrit, true);
    assert.equal(attack.maximumEidolon, 0);
    assert.equal(attack.maximumTraceLevel, 10);
    assert.equal(attack.support.status, "calculable");
    assert.equal(attack.support.verified, true);
    assert.deepEqual(Array.from(attack.multipliers), fixedValues[id]);
    assert.equal(engine.unsupportedAttackReason(attack), "", id + " uses the existing direct-damage path");
  }
  const aventurine = data.attacks.find(item => item.id === "130403");
  const jingliuBaseSkill = data.attacks.find(item => item.id === "1121202");
  assert.equal(jingliuBaseSkill.name, "無罅の飛光（転魄前）");
  assert.match(jingliuBaseSkill.conditionText, /転魄前.*通常戦闘スキル/);
  assert.match(jingliuBaseSkill.calculationNote, /通常戦闘スキルで.*1121209.*転魄前/);
  assert.deepEqual(Array.from(aventurine.modifierConditions), [{ inputKey: "aventurine-unnerve-active", minimum: 1, default: 0 }]);
  assert.deepEqual(Array.from(aventurine.requiredModifierIds), ["trace:1304:130403:crit-vulnerability"]);
  assert.match(aventurine.conditionText, /動揺.*攻撃前から/);
  assert.match(aventurine.calculationNote, /順序は未確定/);
  const unnerve = data.structuredModifiers.find(item => item.id === "trace:1304:130403:crit-vulnerability");
  assert.ok(unnerve, "the pre-attack Unnerve condition is an existing modifier");
  assert.equal(unnerve.activation.inputKey, "aventurine-unnerve-active");
  assert.equal(unnerve.activation.mode, "toggle");
});

test("every E0 level matches independent literal HP, DEF, and ATK damage calculations", async () => {
  const { data, engine } = await loadProductionFixture();
  const scenarios = [
    { atk: 3000, hp: 6000, def: 2400, critRate: 40, critDamage: 90, damageBonus: 0, resistance: 20, enemyLevel: 80, toughnessActive: true },
    { atk: 4123.5, hp: 10432, def: 1876.25, critRate: 25, critDamage: 155, damageBonus: 48, resistance: 40, enemyLevel: 90, defenseReduction: 20, defenseIgnore: 10, toughnessActive: false },
    { atk: 2876.25, hp: 7234.5, def: 3210.75, critRate: 75, critDamage: 65, damageBonus: 23.5, resistance: 0, enemyLevel: 70, defenseIgnore: 30, resistancePenetration: 10, takenDamage: 15, toughnessActive: true }
  ];
  for (const id of ids) {
    const attack = round6Attack(data, id);
    assert.deepEqual(Array.from(attack.multipliers), fixedValues[id]);
    for (let level = 1; level <= fixedValues[id].length; level++) {
      for (const [index, scenario] of scenarios.entries()) {
        const input = makeRequest(attack, level, { ...scenario, characterLevel: 80, eidolon: 0, enemyCount: 1 });
        const expected = independentDirectDamage(input);
        const result = engine.calculate(input);
        const coefficient = fixedValues[id][level - 1];
        const referenceValue = scenario[attack.scalingStat];
        assertClose(expected.effectiveReferenceValue, referenceValue, id + " Lv" + level + " reference value scenario" + index);
        assertClose(expected.nonCrit, referenceValue * coefficient / 100 * (1 + scenario.damageBonus / 100) * expected.defense * expected.resistance * expected.toughness * (1 + (scenario.takenDamage || 0) / 100), id + " Lv" + level + " literal direct formula");
        assert.notEqual(result.supported, false, id + " Lv" + level + " supported");
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], expected[key], id + " Lv" + level + " scenario" + index + " " + key);
      }
      const referenceStat = attack.scalingStat;
      const input = makeRequest(attack, level, { atk: 3000, hp: 6000, def: 2400, critRate: 0, critDamage: 0, baseAtk: 1000, baseHp: 1000, baseDef: 1000 });
      const changed = makeRequest(attack, level, {
        atk: referenceStat === "atk" ? 3000 : 1,
        hp: referenceStat === "hp" ? 6000 : 99999,
        def: referenceStat === "def" ? 2400 : 99999,
        critRate: 0, critDamage: 0, baseAtk: 50000, baseHp: 50000, baseDef: 50000
      });
      assertClose(engine.calculate(input).nonCrit, engine.calculate(changed).nonCrit, id + " Lv" + level + " ignores non-reference stats");
    }
  }
});

test("fire Ultimate-only and general damage modifiers remain limited to their attack target", async () => {
  const { data, engine } = await loadProductionFixture();
  const fireUltimateOnly = {
    id: "round6-fire-ultimate-oracle", enabled: true, calculable: true,
    category: "damageBonus", value: 20,
    target: { attackTypes: ["ultimate"], elements: ["Fire"] }
  };
  const ultimateAttack = round6Attack(data, "151008");
  const fireSkill = round6Attack(data, "800902");
  const imaginaryUltimate = round6Attack(data, "130403");
  assert.equal(runtime.applicableToAttack(fireUltimateOnly, ultimateAttack), true);
  assert.equal(runtime.applicableToAttack(fireUltimateOnly, fireSkill), false);
  assert.equal(runtime.applicableToAttack(fireUltimateOnly, imaginaryUltimate), false);

  const applicable = { ...fireUltimateOnly, applicable: runtime.applicableToAttack(fireUltimateOnly, ultimateAttack) };
  const excludedSkill = { ...fireUltimateOnly, applicable: runtime.applicableToAttack(fireUltimateOnly, fireSkill) };
  const ultimateInput = makeRequest(ultimateAttack, 10, { atk: 3000, critRate: 0, critDamage: 0 }, [applicable]);
  const skillInput = makeRequest(fireSkill, 10, { atk: 3000, critRate: 0, critDamage: 0 }, [excludedSkill]);
  const ultimate = engine.calculate(ultimateInput);
  const skill = engine.calculate(skillInput);
  assertClose(ultimate.nonCrit, independentDirectDamage(ultimateInput).nonCrit, "eligible fire Ultimate matches independent modifier calculation");
  assertClose(ultimate.nonCrit, 3000 * 32 / 100 * 1.2 * 0.5 * 0.8 * 0.9, "eligible fire Ultimate literal with +20% damage");
  assertClose(skill.nonCrit, 3000 * 60 / 100 * 0.5 * 0.8 * 0.9, "fire Skill excludes Ultimate-only modifier");
});

test("Aventurine Ultimate is limited to a pre-existing Unnerve state and its required crit-taken modifier", async () => {
  const { data, engine } = await loadProductionFixture();
  const attack = data.attacks.find(item => item.id === "130403");
  const modifier = data.structuredModifiers.find(item => item.id === "trace:1304:130403:crit-vulnerability");
  assert.ok(attack.modifierConditions.some(condition => condition.inputKey === modifier.activation.inputKey && condition.minimum === 1));
  assert.ok(attack.requiredModifierIds.includes(modifier.id));
  assert.equal(modifier.target.owner, "enemySingle");
  assert.equal(modifier.target.attackTypes.includes("all"), true);
  const active = { ...modifier, enabled: true, applicable: true, value: 15 };
  const input = makeRequest(attack, 10, { atk: 3000, def: 2400, critRate: 0, critDamage: 0 }, [active]);
  const result = engine.calculate(input);
  const expected = independentDirectDamage(input);
  assertClose(result.nonCrit, expected.nonCrit, "attack after Unnerve is active keeps direct DEF calculation");
  assertClose(result.crit, expected.crit, "attack after Unnerve includes its required critical-taken modifier");
  assertClose(result.expected, expected.expected, "attack after Unnerve matches independent expected damage");
  assertClose(result.crit, expected.nonCrit * 1.15, "Lv10 Unnerve adds 15% critical damage taken");
  const without = engine.calculate({ ...input, modifiers: [] });
  assertClose(without.crit, without.nonCrit, "without the pre-existing Unnerve condition, the crit-taken modifier is absent");
});

test("new attack components remain calculable after JSON serialization and reload", async () => {
  const { data, engine } = await loadProductionFixture();
  for (const id of ids) {
    const restored = JSON.parse(JSON.stringify(round6Attack(data, id)));
    assert.equal(restored.id, id);
    assert.deepEqual(restored.multipliers, fixedValues[id]);
    const result = engine.calculate(makeRequest(restored, 10, { atk: 3000, hp: 6000, def: 2400, critRate: 0, critDamage: 0 }));
    assert.notEqual(result.supported, false, id + " survives serialization");
    assert.ok(Number.isFinite(result.nonCrit), id + " remains calculable after restore");
  }
});
