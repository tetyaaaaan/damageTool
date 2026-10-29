"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  root, readJson, fixedSourceSha, loadProductionFixture, makeRequest,
  independentDirectDamage, assertClose
} = require("./helpers/hsrDirectVerification.cjs");
const { loadHsrDataFiles } = require("../../scripts/lib/hsrDataFiles.cjs");
const authoredOverrides = require("../../games/hsr/data/calc/attacks-round7.json").overrides;

const ids = ["130802", "121209", "121203", "140102"];
const fixedValues = {
  "130802": [80, 88, 96, 104, 112.00000000000001, 120, 130, 140, 150, 160],
  "121209": [125, 137.5, 150, 162.5, 175, 187.5, 203.12, 218.75, 234.38, 250],
  "121203": [180, 192, 204, 216, 227.99999999999997, 240, 254.99999999999997, 270, 285, 300],
  "140102": [35, 38.5, 42, 45.5, 49, 52.5, 56.87, 61.25000000000001, 65.62, 70]
};
const sourceParamIndex = { "130802": 0, "121209": 0, "121203": 0, "140102": 0 };
const expectedShape = {
  "130802": { characterId: "1308", element: "Thunder", type: "skill", target: "blast", scalingStat: "atk" },
  "121209": { characterId: "1212", element: "Ice", type: "skill", target: "blast", scalingStat: "atk" },
  "121203": { characterId: "1212", element: "Ice", type: "ultimate", target: "blast", scalingStat: "atk" },
  "140102": { characterId: "1401", element: "Ice", type: "skill", target: "blast", scalingStat: "atk" }
};
const round7Attack = (data, id) => data.attacks.find(item => item.id === id && item.provenance?.sourceCommit === fixedSourceSha)
  || authoredOverrides.find(item => item.id === id);

test("Round7 selects only production review attacks and loads each fixed-source override once", async () => {
  const { data, engine } = await loadProductionFixture();
  const files = loadHsrDataFiles(root);
  const generated = readJson("games/hsr/data/attacks.generated.json").attacks;
  const baselineOverrides = files.attackOverrideSources.filter(source => source.file !== "attacks-round7.json").flatMap(source => source.records);
  const catalog = readJson("games/hsr/data/catalog.json");
  assert.ok(data.sources.some(source => source.revision === fixedSourceSha), "production catalog records the fixed StarRailRes source");
  for (const id of ids) {
    const baseline = generated.find(item => item.id === id);
    assert.ok(baseline, id + " existed before Round7");
    assert.equal(baselineOverrides.some(item => item.id === id), false, id + " had no prior production calculation override");
    assert.equal(baseline.support?.status || "review", "review", id + " baseline production status was review");
    assert.equal(baseline.calculationScope, "description-primary-term", id + " had only the unverified source text coefficient before promotion");
    const matches = data.attacks.filter(item => item.id === id && item.provenance?.sourceCommit === fixedSourceSha);
    assert.equal(matches.length, 1, id + " one fixed-source production override");
    const attack = matches[0];
    for (const [key, value] of Object.entries(expectedShape[id])) assert.equal(attack[key], value, id + " " + key);
    assert.equal(attack.damageFormula, "statMultiplier");
    assert.equal(attack.maximumEidolon, 0);
    assert.equal(attack.maximumTraceLevel, 10);
    assert.equal(attack.characterLevelExact, 80);
    assert.equal(attack.enemyCountExact, 1);
    assert.equal(attack.support.status, "calculable");
    assert.equal(attack.support.verified, true);
    assert.deepEqual(Array.from(attack.multipliers), fixedValues[id]);
    assert.equal(engine.unsupportedAttackReason(attack), "", id + " uses existing direct-damage calculation");
    const character = catalog.characters.find(item => item.id === attack.characterId);
    const sourceSkill = character.skills.find(item => item.id === attack.sourceSkillId);
    const parameter = sourceParamIndex[id];
    for (let level = 1; level <= 10; level++) assertClose(sourceSkill.params[level - 1][parameter] * 100, fixedValues[id][level - 1], id + " fixed raw coefficient Lv" + level);
  }
  assert.equal(round7Attack(data, "140102").hitCount, 3, "Herta's three same-coefficient strikes remain separate for hit-aware modifiers");
  assert.equal(round7Attack(data, "121209").hitCount, 1);
  assert.equal(round7Attack(data, "121203").hitCount, 1);
});

test("every Round7 level matches independent direct damage for the exact one-enemy state", async () => {
  const { data, engine } = await loadProductionFixture();
  const scenarios = [
    { atk: 3000, hp: 6000, def: 2400, critRate: 40, critDamage: 90, damageBonus: 0, resistance: 20, enemyLevel: 80, toughnessActive: true },
    { atk: 4123.5, hp: 10432, def: 1876.25, critRate: 25, critDamage: 155, damageBonus: 48, resistance: 40, enemyLevel: 90, defenseReduction: 20, defenseIgnore: 10, toughnessActive: false },
    { atk: 2876.25, hp: 7234.5, def: 3210.75, critRate: 75, critDamage: 65, damageBonus: 23.5, resistance: 0, enemyLevel: 70, resistancePenetration: 10, takenDamage: 15, toughnessActive: true }
  ];
  for (const id of ids) {
    const attack = round7Attack(data, id);
    assert.deepEqual(Array.from(attack.multipliers), fixedValues[id]);
    const strikes = attack.hitCount;
    for (let level = 1; level <= fixedValues[id].length; level++) {
      for (const [index, scenario] of scenarios.entries()) {
        const input = makeRequest(attack, level, { ...scenario, characterLevel: 80, eidolon: 0, enemyCount: 1 });
        const expectedPerStrike = independentDirectDamage(input);
        const result = engine.calculate(input);
        const coefficient = fixedValues[id][level - 1];
        assertClose(expectedPerStrike.effectiveReferenceValue, scenario.atk, id + " Lv" + level + " ATK reference scenario" + index);
        assertClose(expectedPerStrike.nonCrit, scenario.atk * coefficient / 100 * (1 + scenario.damageBonus / 100) * expectedPerStrike.defense * expectedPerStrike.resistance * expectedPerStrike.toughness * (1 + (scenario.takenDamage || 0) / 100), id + " Lv" + level + " independent per-strike formula");
        assert.notEqual(result.supported, false, id + " Lv" + level + " supported");
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], expectedPerStrike[key] * strikes, id + " Lv" + level + " scenario" + index + " total " + key);
        assertClose(result.perHit.nonCrit, expectedPerStrike.nonCrit, id + " Lv" + level + " scenario" + index + " per-strike NC");
        assertClose(result.perHit.expected, expectedPerStrike.expected, id + " Lv" + level + " scenario" + index + " per-strike EV");
      }
      const base = { characterLevel: 80, enemyCount: 1, eidolon: 0, atk: 3000, hp: 6000, def: 2400, critRate: 0, critDamage: 0, baseAtk: 1000, baseHp: 1000, baseDef: 1000 };
      const changedNonReference = { ...base, hp: 99999, def: 99999, baseHp: 50000, baseDef: 50000 };
      assertClose(engine.calculate(makeRequest(attack, level, base)).nonCrit, engine.calculate(makeRequest(attack, level, changedNonReference)).nonCrit, id + " Lv" + level + " uses final ATK only");
    }
  }
});

test("Jingliu ATK and HP action variants stay separate, Herta hits remain three, and enemy scope persists", async () => {
  const { data, engine } = await loadProductionFixture();
  const atkVariants = [round7Attack(data, "121209"), round7Attack(data, "121203")];
  const hpVariantIds = ["1121209", "1121203"];
  for (let index = 0; index < atkVariants.length; index++) {
    const attack = atkVariants[index];
    const hp = data.attacks.find(item => item.id === hpVariantIds[index]);
    assert.equal(attack.scalingStat, "atk");
    assert.notEqual(attack.id, hp.id);
    assert.equal(hp.scalingStat, "hp");
    assert.match(attack.calculationNote, /入力ATKに含めて/);
    assert.match(attack.calculationNote, /二重加算/);
    const restored = JSON.parse(JSON.stringify(attack));
    assert.equal(restored.enemyCountExact, 1);
    assert.deepEqual(restored.multipliers, fixedValues[restored.id]);
    const valid = engine.calculate(makeRequest(restored, 10, { atk: 3000, hp: 6000, def: 2400, enemyCount: 1 }));
    assert.notEqual(valid.supported, false);
  }
  const herta = round7Attack(data, "140102");
  assert.equal(herta.hitCount, 3);
  assert.equal(herta.enemyCountExact, 1);
  assert.match(herta.calculationNote, /繰り返します/);
});

test("Acheron's Nihility-count multiplier is independent of the fixed Skill coefficient", async () => {
  const { data, engine } = await loadProductionFixture();
  const attack = round7Attack(data, "130802");
  const catalog = readJson("games/hsr/data/catalog.json");
  const character = catalog.characters.find(item => item.id === "1308");
  const trace = character.traces.find(item => item.id === "1308102");
  assert.deepEqual(Array.from(trace.params[0]), [1.15, 1.6]);
  assert.match(trace.description, /虚無.*1名\/2名/);
  const modifier = data.structuredModifiers.find(item => item.id === "traceNode:1308:1308102:nihility-independent-multiplier");
  assert.ok(modifier, "the existing Modifier registry exposes Acheron's party-path effect");
  assert.equal(modifier.category, "independentMultiplier");
  assert.ok(modifier.target.attackTypes.includes(attack.type));
  const config = { atk: 3000, hp: 6000, def: 2400, critRate: 45, critDamage: 130, damageBonus: 12, enemyLevel: 80, enemyCount: 1, resistance: 20 };
  for (const [nihilityCount, bonus] of [[0, 0], [1, 15], [2, 60]]) {
    const activeModifier = bonus ? { id: modifier.id, enabled: true, applicable: true, calculable: true, category: "independentMultiplier", value: bonus, target: modifier.target, support: { status: "calculable", verified: true } } : null;
    const modifiers = activeModifier ? [activeModifier] : [];
    const input = makeRequest(attack, 10, config, modifiers);
    const expected = independentDirectDamage(input);
    const actual = engine.calculate(input);
    assert.notEqual(actual.supported, false, "other Nihility allies=" + nihilityCount);
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], "Nihility allies=" + nihilityCount + " independent " + key);
    assertClose(actual.nonCrit, 3000 * 160 / 100 * 1.12 * expected.defense * expected.resistance * expected.toughness * (1 + bonus / 100), "Nihility allies=" + nihilityCount + " literal A2 multiplier");
  }
});
