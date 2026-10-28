"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fixedSourceSha, loadProductionFixture, makeRequest, independentDirectDamage, assertClose, runtime } = require("./helpers/hsrDirectVerification.cjs");
const authoredOverrides = require("../../games/hsr/data/calc/attacks-round4.json").overrides;

const directBasicIds = ["121201", "130801", "132101", "140601", "140801", "141301", "150101", "150401", "150601", "150801", "150901", "800901", "801001"];
const levelValues = Object.fromEntries(directBasicIds.map(id => [id, id === "141301" ? [25, 30, 35, 40, 45, 50] : [50, 60, 70, 80, 90, 100]]));
const attackOf = (data, id) => data.attacks.find(attack => attack.id === id);
const overrideOf = (data, id) => attackOf(data, id)?.provenance?.sourceCommit === fixedSourceSha
  ? attackOf(data, id)
  : authoredOverrides.find(attack => attack.id === id);

test("production loader registers each of the 13 pending single-hit Basics once with fixed-SHA scope", async () => {
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  const { data } = await loadProductionFixture();
  for (const id of directBasicIds) {
    const matches = data.attacks.filter(attack => attack.id === id && attack.provenance?.sourceCommit === fixedSourceSha);
    assert.equal(matches.length, 1, "one registered fixed-source override for " + id);
    assert.deepEqual(matches[0].multipliers, levelValues[id], id + " supported E0 levels");
    assert.equal(matches[0].maximumEidolon, 0);
    assert.equal(matches[0].maximumTraceLevel, 6);
    assert.equal(matches[0].support.status, "calculable");
    assert.equal(matches[0].provenance.sourceCommit, fixedSourceSha);
  }
});

test("fixed-source Basics match literal independent damage at every supported level and reference stat", async () => {
  const { data, engine } = await loadProductionFixture();
  assert.equal(data.attacks.filter(attack => directBasicIds.includes(attack.id)).length >= directBasicIds.length, true);
  for (const id of directBasicIds) {
    const attack = overrideOf(data, id);
    assert.ok(attack, "authored or loaded attack " + id);
    const referenceStat = attack.scalingStat;
    const referenceValue = referenceStat === "hp" ? 6000 : 3000;
    assert.ok(["atk", "hp"].includes(referenceStat));
    assert.equal(attack.type, "normal");
    assert.equal(attack.target, "single");
    assert.equal(attack.hitCount, 1);
    for (let level = 1; level <= 6; level++) {
      const input = makeRequest(attack, level, {
        characterLevel: 80,
        characterEidolon: 0,
        atk: 3000,
        hp: 6000,
        baseAtk: 1000,
        baseHp: 1200,
        critRate: 40,
        critDamage: 90,
        damageBonus: 0,
        enemyLevel: 80,
        resistance: 20,
        toughnessActive: true,
        enemyCount: 1
      });
      const result = engine.calculate(input);
      const independent = independentDirectDamage(input);
      const coefficient = levelValues[id][level - 1];
      const literalNonCrit = referenceValue * coefficient / 100 * 0.5 * 0.8 * 0.9;
      assertClose(independent.effectiveReferenceValue, referenceValue, id + " L" + level + " reference stat");
      assertClose(independent.nonCrit, literalNonCrit, id + " L" + level + " literal direct formula");
      assertClose(result.nonCrit, literalNonCrit, id + " L" + level + " engine nonCrit");
      assertClose(result.crit, literalNonCrit * 1.9, id + " L" + level + " engine crit");
      assertClose(result.expected, literalNonCrit * 1.36, id + " L" + level + " engine expected");
      assertClose(result.nonCrit, independent.nonCrit, id + " L" + level + " independent verifier");
      const nonReferenceChange = makeRequest(attack, level, {
        characterLevel: 80,
        eidolon: 0,
        atk: referenceStat === "atk" ? 3000 : 1,
        hp: referenceStat === "hp" ? 6000 : 99999,
        def: 99999,
        baseAtk: 1000,
        baseHp: 1200,
        baseDef: 20000,
        critRate: 40,
        critDamage: 90,
        damageBonus: 0,
        enemyLevel: 80,
        resistance: 20,
        toughnessActive: true,
        enemyCount: 1
      });
      assertClose(engine.calculate(nonReferenceChange).nonCrit, literalNonCrit, id + " L" + level + " ignores non-reference stats");
    }
  }
});

test("selected general modifiers apply to these Basic attacks and Ultimate-only modifiers remain excluded", async () => {
  const { data, engine } = await loadProductionFixture();
  const attack = overrideOf(data, "141301");
  const ultimateOnly = data.structuredModifiers.find(item => item.id === "lightCone:21013:ultimate-damage");
  const generalDamage = data.structuredModifiers.find(item => item.id === "lightCone:21012:base-damage");
  assert.ok(ultimateOnly && generalDamage);
  const context = { characterId: "1001", lightConeId: "21013", refinement: 1, stats: { hpPercent: 70 }, enemy: { hpPercent: 50 } };
  const ultimateCandidate = runtime.buildCandidates([ultimateOnly], context)[0];
  assert.equal(ultimateCandidate.enabled, true);
  assert.equal(runtime.applicableToAttack(ultimateCandidate, attack), false, "Ultimate-only effect does not leak to Basic");
  const generalCandidate = runtime.buildCandidates([generalDamage], { ...context, lightConeId: "21012" })[0];
  assert.equal(generalCandidate.enabled, true);
  assert.equal(runtime.applicableToAttack(generalCandidate, attack), true);
  const input = makeRequest(attack, 6, { hp: 6000, baseHp: 1200, critRate: 0, critDamage: 0 }, [generalCandidate]);
  const result = engine.calculate(input);
  const independent = independentDirectDamage(input);
  const literal = 6000 * 50 / 100 * 0.5 * 0.8 * 0.9 * 1.2;
  assertClose(result.nonCrit, literal, "HP-based Basic with applicable general damage bonus");
  assertClose(independent.nonCrit, literal, "independent modified HP-based Basic");
});

test("attack definitions remain calculable after JSON serialization and reload", async () => {
  const { data, engine } = await loadProductionFixture();
  for (const id of directBasicIds) {
    const attack = overrideOf(data, id);
    const restored = JSON.parse(JSON.stringify(attack));
    assert.equal(restored.id, id);
    assert.deepEqual(restored.multipliers, levelValues[id]);
    const input = makeRequest(restored, 6, { atk: 3000, hp: 6000, critRate: 0, critDamage: 0 });
    const result = engine.calculate(input);
    assert.ok(Number.isFinite(result.nonCrit), id + " calculates after data restore");
  }
});
