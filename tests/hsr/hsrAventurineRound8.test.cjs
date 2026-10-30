"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readJson, fixedSourceSha, loadProductionFixture, makeRequest, runtime, assertClose } = require("./helpers/hsrDirectVerification.cjs");

const curves = {
  "130401": { type: "normal", sourceIndex: 0, hits: 1, values: [50,60,70,80,90,100] },
  "130403": { type: "ultimate", sourceIndex: 1, hits: 1, values: [162,172.8,183.6,194.4,205.2,216,229.5,243,256.5,270] },
  "130404": { type: "followUp", sourceIndex: 2, hits: 7, values: [12.5,13.75,15,16.25,17.5,18.75,20.31,21.88,23.44,25] }
};
const unnerveId = "trace:1304:130403:crit-vulnerability";
const unnerveByLevel = [9,9.6,10.2,10.8,11.4,12,12.75,13.5,14.25,15];
const scenarios = [
  { atk: 3187.5, hp: 7451.25, def: 4273.25, baseAtk: 982.5, baseHp: 1275.25, baseDef: 1129.75, critRate: 81.25, critDamage: 107.75, damageBonus: 31.5, enemyLevel: 95, resistance: 8.75, resistancePenetration: 13.5, defenseReduction: 24.75, defenseIgnore: 6.25, takenDamage: 18.75 },
  { atk: 2012.25, hp: 11337.5, def: 2411.5, baseAtk: 1114.75, baseHp: 1423.5, baseDef: 871.5, critRate: 43.75, critDamage: 173.25, damageBonus: 62.25, enemyLevel: 87, resistance: 26.25, resistancePenetration: 9.5, defenseReduction: 13.25, defenseIgnore: 7.75, takenDamage: 12.5 }
];

function oracle(config, percent, hits, unnerve = 0) {
  const defense = (80 + 20) / ((80 + 20) + (config.enemyLevel + 20) * Math.max(0, 1 - (config.defenseReduction + config.defenseIgnore) / 100));
  const resistance = 1 - (config.resistance - config.resistancePenetration) / 100;
  const toughness = 0.9;
  const nonCrit = config.def * percent / 100 * hits * (1 + config.damageBonus / 100) * defense * resistance * toughness * (1 + config.takenDamage / 100);
  const cd = config.critDamage + unnerve;
  const cr = Math.min(100, Math.max(0, config.critRate));
  return { nonCrit, crit: nonCrit * (1 + cd / 100), expected: nonCrit * (1 + cr / 100 * cd / 100), defense, resistance };
}

function getUnnerve(data, level, on, attack) {
  const record = data.structuredModifiers.find(item => item.id === unnerveId);
  assert.ok(record);
  const candidate = runtime.buildCandidates([record], {
    characterId: "1304", eidolon: 0, traceLevelFor: () => level
  }, { "aventurine-unnerve-active": on })[0];
  return { ...candidate, applicable: runtime.applicableToAttack(candidate, { ...attack, attackType: attack.type }) };
}

test("Aventurine E0 three main damage actions match every fixed level and stable enemy-one scope", async () => {
  const { data, engine } = await loadProductionFixture();
  const catalogCharacter = readJson("games/hsr/data/catalog.json").characters.find(item => item.id === "1304");
  const trace = catalogCharacter.traces.find(item => item.id === "1304101");
  assert.deepEqual(Array.from(trace.params[0]), [0.02, 0.48, 1600], "Leverage is a fixed DEF-to-CR conversion, owned by final CR input");
  const ownModifiers = data.structuredModifiers.filter(item => item.source?.id === "1304");
  assert.equal(ownModifiers.some(item => item.category === "critRate"), false, "Leverage is not re-added as an independent CR modifier");
  const bingo = catalogCharacter.traces.find(item => item.id === "1304103");
  assert.match(bingo.description, /ブラインドベット/);
  assert.equal(ownModifiers.some(item => item.source?.traceId === "1304103" && ["damageBonus", "multiplierAddition"].includes(item.category)), false, "Bingo resource/shield effects do not change the FUA multiplier");

  for (const [id, spec] of Object.entries(curves)) {
    const attack = data.attacks.find(item => item.id === id);
    const source = catalogCharacter.skills.find(item => item.id === id);
    assert.ok(attack && source, id + " source and production attack exist");
    assert.equal(attack.support.status, "calculable");
    assert.equal(attack.provenance.sourceCommit, fixedSourceSha);
    assert.equal(attack.maximumEidolon, 0);
    assert.equal(attack.enemyCountExact, 1);
    assert.equal(attack.type, spec.type);
    assert.equal(attack.scalingStat, "def");
    assert.equal(attack.element, "Imaginary");
    assert.equal(attack.hitCount, spec.hits);
    assert.equal(attack.multipliers.length, spec.values.length);
    assert.equal(attack.maximumTraceLevel, spec.values.length);
    for (let level = 1; level <= spec.values.length; level++) {
      assertClose(attack.multipliers[level - 1], spec.values[level - 1], id + " production curve Lv" + level);
      assertClose(source.params[level - 1][spec.sourceIndex] * 100, spec.values[level - 1], id + " fixed source coefficient Lv" + level);
      for (const [scenarioIndex, config] of scenarios.entries()) {
        const states = id === "130403" ? [true] : [false, true];
        for (const active of states) {
          const modifier = getUnnerve(data, level, active, attack);
          assertClose(modifier.value, unnerveByLevel[level - 1], "fixed Unnerve CRIT DMG Lv" + level);
          const input = makeRequest(attack, level, { characterLevel: 80, enemyCount: 1, eidolon: 0, ...config }, [modifier]);
          const expected = oracle(config, spec.values[level - 1], spec.hits, active ? unnerveByLevel[level - 1] : 0);
          const actual = engine.calculate(input);
          assert.notEqual(actual.supported, false, id + " Lv" + level + " scenario" + scenarioIndex + " accepted stable state");
          for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], id + " Lv" + level + " state" + active + " " + key);
          assertClose(actual.breakdown.critRatePercent, config.critRate, "final CR includes Leverage exactly once");
          assertClose(actual.breakdown.defense, expected.defense, "DEF factor");
          assertClose(actual.breakdown.resistance, expected.resistance, "RES factor");
          assertClose(actual.perHit.nonCrit * spec.hits, actual.nonCrit, id + " all hits included once");
        }
      }
    }
  }
});

test("Aventurine Ultimate is accepted only against pre-existing same-level Unnerve; first application stays unresolved", async () => {
  const { data, engine } = await loadProductionFixture();
  const attack = data.attacks.find(item => item.id === "130403");
  const record = data.structuredModifiers.find(item => item.id === unnerveId);
  assert.deepEqual(Array.from(attack.requiredModifierIds), [unnerveId]);
  assert.match(attack.calculationNote, /攻撃前から.*順序は未確定/);
  assert.equal(record.activation.default, false);
  for (let level = 1; level <= 10; level++) {
    const off = getUnnerve(data, level, false, attack), on = getUnnerve(data, level, true, attack);
    assert.equal(off.enabled, false);
    assert.equal(on.enabled, true);
    assert.equal(on.applicable, true);
    const input = makeRequest(attack, level, { characterLevel: 80, enemyCount: 1, eidolon: 0, ...scenarios[0] }, [on]);
    assert.notEqual(engine.calculate(input).supported, false);
    assert.equal(attack.modifierConditions.some(item => item.inputKey === "aventurine-unnerve-active"), true, "App requires explicit pre-existing Unnerve state");
    assert.equal(attack.requiredModifierIds.includes(unnerveId), true, "App requires exactly the verified same-level vulnerability modifier");
  }
  assert.equal(attack.maximumEidolon, 0);
  assert.equal(attack.enemyCountExact, 1);
});
