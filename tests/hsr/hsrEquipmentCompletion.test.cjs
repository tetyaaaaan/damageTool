const test = require("node:test");
const assert = require("node:assert/strict");
const { runtime, loadProductionFixture, makeRequest, assertMatchesIndependent } = require("./helpers/hsrDirectVerification.cjs");

function attack(type) {
  return { id: "equipment-fixture", type, element: "Quantum", scalingStat: "atk", multipliers: Array(10).fill(100), canCrit: true, target: "single" };
}

test("Archive's refinement-ranked Ultimate bonus applies only to its wearer's Ultimate", async () => {
  const { data, engine } = await loadProductionFixture();
  const records = data.structuredModifiers.filter((record) => record.id === "lightCone:20006:ultimate-damage");
  assert.equal(records.length, 1);
  const bonusByRefinement = [28, 35, 42, 49, 56];

  for (let refinement = 1; refinement <= 5; refinement += 1) {
    const candidate = runtime.buildCandidates(records, { characterId: "1001", lightConeId: "20006", refinement })[0];
    assert.equal(candidate.value, bonusByRefinement[refinement - 1]);
    assert.equal(candidate.automatic, true);
    assert.equal(candidate.enabled, true);
    assert.equal(runtime.applicableToAttack(candidate, attack("ultimate")), true);
    assert.equal(runtime.applicableToAttack(candidate, attack("normal")), false);

    const withCone = engine.calculate(makeRequest(attack("ultimate"), 10, {}, [candidate]));
    const withoutCone = engine.calculate(makeRequest(attack("ultimate"), 10, {}, []));
    assert.notEqual(withCone.supported, false);
    assert.ok(Math.abs(withCone.nonCrit / withoutCone.nonCrit - (1 + bonusByRefinement[refinement - 1] / 100)) < 1e-10);
    assertMatchesIndependent(engine, makeRequest(attack("ultimate"), 10, {}, [candidate]), `Archive S${refinement}`);
  }

  assert.equal(runtime.buildCandidates(records, { characterId: "1001", lightConeId: "20005", refinement: 5 }).length, 0,
    "removing the LC removes its effect");
});

test("Musketeer four-piece normal bonus requires four pieces and excludes other attack types", async () => {
  const { data, engine } = await loadProductionFixture();
  const records = data.structuredModifiers.filter((record) => record.id === "relic:102:4pc:normal-damage");
  assert.equal(records.length, 1);
  const context = { characterId: "1001", relicIds: ["102"], relicMode: 4 };
  const candidate = runtime.buildCandidates(records, context)[0];

  assert.equal(candidate.value, 10);
  assert.equal(candidate.automatic, true);
  assert.equal(candidate.enabled, true);
  assert.equal(runtime.buildCandidates(records, { ...context, relicMode: 2 }).length, 0,
    "two-piece Musketeer does not unlock the four-piece attack bonus");
  assert.equal(runtime.buildCandidates(records, { ...context, relicIds: ["103"] }).length, 0,
    "removing the set removes its effect");
  for (const type of ["normal", "enhancedNormal"]) assert.equal(runtime.applicableToAttack(candidate, attack(type)), true);
  for (const type of ["skill", "ultimate", "followUp", "dot"]) assert.equal(runtime.applicableToAttack(candidate, attack(type)), false);

  for (const type of ["normal", "enhancedNormal"]) {
    const result = engine.calculate(makeRequest(attack(type), 10, {}, [candidate]));
    const baseline = engine.calculate(makeRequest(attack(type), 10, {}, []));
    assert.notEqual(result.supported, false);
    assert.ok(Math.abs(result.nonCrit / baseline.nonCrit - 1.1) < 1e-10);
    assertMatchesIndependent(engine, makeRequest(attack(type), 10, {}, [candidate]), `Musketeer ${type}`);
  }

  const skill = engine.calculate(makeRequest(attack("skill"), 10, {}, [candidate]));
  const baselineSkill = engine.calculate(makeRequest(attack("skill"), 10, {}, []));
  assert.notEqual(skill.supported, false);
  assert.equal(skill.nonCrit, baselineSkill.nonCrit, "the normal-only bonus must not alter Skill damage");
});

test("Collapsing Sky applies all five refinement values to Normal and Skill attacks", async () => {
  const { data, engine } = await loadProductionFixture();
  const records = data.structuredModifiers.filter((record) => record.id === "lightCone:20002:normal-skill-damage");
  assert.equal(records.length, 1);
  const bonusByRefinement = [20, 25, 30, 35, 40];
  for (let refinement = 1; refinement <= 5; refinement += 1) {
    const candidate = runtime.buildCandidates(records, { characterId: "1001", lightConeId: "20002", refinement })[0];
    assert.equal(candidate.value, bonusByRefinement[refinement - 1]);
    for (const type of ["normal", "enhancedNormal", "skill", "enhancedSkill"]) {
      assert.equal(runtime.applicableToAttack(candidate, attack(type)), true);
      const result = engine.calculate(makeRequest(attack(type), 10, {}, [candidate]));
      const baseline = engine.calculate(makeRequest(attack(type), 10, {}, []));
      assert.notEqual(result.supported, false);
      assert.ok(Math.abs(result.nonCrit / baseline.nonCrit - (1 + bonusByRefinement[refinement - 1] / 100)) < 1e-10);
      assertMatchesIndependent(engine, makeRequest(attack(type), 10, {}, [candidate]), `Collapsing Sky S${refinement} ${type}`);
    }
    for (const type of ["ultimate", "followUp", "dot"]) assert.equal(runtime.applicableToAttack(candidate, attack(type)), false);
  }
  assert.equal(runtime.buildCandidates(records, { characterId: "1001", lightConeId: "20006", refinement: 5 }).length, 0);
});

test("Firesmith four-piece skill bonus requires four pieces and does not leak into the next attack", async () => {
  const { data, engine } = await loadProductionFixture();
  const records = data.structuredModifiers.filter((record) => record.id === "relic:107:4pc:skill-damage");
  assert.equal(records.length, 1);
  const context = { characterId: "1001", relicIds: ["107"], relicMode: 4 };
  const candidate = runtime.buildCandidates(records, context)[0];
  assert.equal(candidate.value, 12);
  assert.equal(candidate.automatic, true);
  assert.equal(runtime.buildCandidates(records, { ...context, relicMode: 2 }).length, 0);
  assert.equal(runtime.buildCandidates(records, { ...context, relicIds: [] }).length, 0);

  for (const type of ["skill", "enhancedSkill"]) {
    assert.equal(runtime.applicableToAttack(candidate, attack(type)), true);
    const result = engine.calculate(makeRequest(attack(type), 10, {}, [candidate]));
    const baseline = engine.calculate(makeRequest(attack(type), 10, {}, []));
    assert.notEqual(result.supported, false);
    assert.ok(Math.abs(result.nonCrit / baseline.nonCrit - 1.12) < 1e-10);
    assertMatchesIndependent(engine, makeRequest(attack(type), 10, {}, [candidate]), `Firesmith ${type}`);
  }

  for (const type of ["normal", "ultimate", "followUp", "dot"]) {
    assert.equal(runtime.applicableToAttack(candidate, attack(type)), false);
    const result = engine.calculate(makeRequest(attack(type), 10, {}, [candidate]));
    const baseline = engine.calculate(makeRequest(attack(type), 10, {}, []));
    assert.equal(result.nonCrit, baseline.nonCrit, `${type} must not receive four-piece skill bonus`);
  }
});
