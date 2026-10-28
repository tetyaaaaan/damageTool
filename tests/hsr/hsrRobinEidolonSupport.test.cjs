"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  runtime,
  loadProductionFixture,
  makeRequest,
  independentDirectDamage,
  assertClose
} = require("./helpers/hsrDirectVerification.cjs");

const providerRecords = (data) => data.structuredModifiers.filter((record) =>
  record.source?.id === "1309" && record.providerScope === "party");

function context(providerEidolon, traceLevels = {}) {
  return {
    characterId: "1201",
    eidolon: 0,
    partyIds: ["1309"],
    partyEidolons: { "1309": providerEidolon },
    partyStats: { "1309": { atk: 4000 } },
    stats: { atk: 3000, critRate: 50, critDamage: 100 },
    traceLevelFor: (source) => traceLevels[source.skillId] ?? 10
  };
}

function activeModifiers(records, ctx, inputs, attack) {
  return runtime.buildCandidates(records, ctx, inputs)
    .filter((candidate) => candidate.enabled)
    .map((candidate) => ({
      ...candidate,
      applicable: runtime.applicableToAttack(candidate, attack)
    }));
}

test("Robin E1 resistance penetration is provider-gated, toggleable, and limited to verified ordinary attacks", async () => {
  const { data, engine } = await loadProductionFixture();
  const records = providerRecords(data);
  const e1 = data.structuredModifiers.find((record) => record.id === "eidolon:1309:130901:concerto-resistance-penetration");
  assert.ok(e1);
  assert.equal(e1.value.fixed, 24);
  assert.deepEqual(Array.from(e1.target.attackTypes), ["normal", "enhancedNormal", "skill", "enhancedSkill", "ultimate", "talent", "followUp", "additional", "dot"]);
  const attack = data.attacks.find((record) => record.characterId === "1201" && record.type === "normal" && record.support?.status === "calculable");
  assert.ok(attack);
  const request = makeRequest(attack, 6, { resistance: 20 });
  const inputs = { "robin-concerto-resistance-active": true };
    assert.equal(e1.provenance.sourceFile, "character_ranks.json:130901.desc");
  const offInputs = { ...inputs, "robin-concerto-resistance-active": false };
  const onMods = activeModifiers(records, context(1), inputs, attack);
  const offMods = activeModifiers(records, context(1), offInputs, attack);
  assert.equal(onMods.find((item) => item.id === e1.id)?.value, 24);
  assert.equal(offMods.some((item) => item.id === e1.id && item.enabled), false);
  const withE1 = engine.calculate({ ...request, modifiers: onMods });
  const withoutE1 = engine.calculate({ ...request, modifiers: onMods.filter((item) => item.id !== e1.id) });
  const independent = independentDirectDamage({ ...request, modifiers: onMods });
  assertClose(withE1.nonCrit, independent.nonCrit, "E1 non-crit independent damage");
  assertClose(withE1.nonCrit / withoutE1.nonCrit, 1.04 / 0.8, "RES penetration changes only effective RES");

  assert.equal(runtime.buildCandidates(records, context(0), inputs).some((item) => item.id === e1.id), false, "E0 provider cannot supply E1");
  assert.equal(runtime.buildCandidates(records, { ...context(1), characterId: "1309", partyIds: [] }, inputs).some((item) => item.id === e1.id), false, "party E1 support is not incorrectly added as Robin's own attack bonus");
  assert.equal(runtime.buildCandidates(records, { ...context(1), partyIds: [] }, inputs).length, 0, "absent provider removes its effects");
  for (const type of ["break", "superBreak", "elation", "memospriteSkill", "memospriteTalent", "trueDamage"]) {
    assert.equal(runtime.applicableToAttack(onMods.find((item) => item.id === e1.id), { ...attack, type }), false, `${type} is outside verified scope`);
  }
});

test("Robin E3 and E5 unlock the correct level 11-12 support curves without granting them early", async () => {
  const { data, engine } = await loadProductionFixture();
  const records = providerRecords(data);
  const attack = data.attacks.find((record) => record.characterId === "1201" && record.type === "normal" && record.support?.status === "calculable");
  assert.ok(attack);
  const request = makeRequest(attack, 6, { atk: 3000, resistance: 20 });
  const cases = [
    ["trace:1309:130902:party-damage", "130902", 3,
      [25,27.5,30,32.5,35,37.5,40.62,43.75,46.88,50,52.5,55],
      [25,27.5,30,32.5,35,37.5,40.62,43.75,46.88,50,52.5,55]],
    ["trace:1309:130903:concerto-atk", "130903", 3,
      [15.2,15.96,16.72,17.48,18.24,19,19.95,20.9,21.85,22.8,23.56,24.32],
      [658,703.4,748.8,794.2,839.6,885,941.75,998.5,1055.25,1112,1157.4,1202.8]],
    ["trace:1309:130904:party-crit-damage", "130904", 5,
      [5,6.5,8,9.5,11,12.5,14.37,16.25,18.12,20,21.5,23],
      [5,6.5,8,9.5,11,12.5,14.37,16.25,18.12,20,21.5,23]]
  ];
  for (const [id, skillId, unlockRank, expectedCoefficients, expectedValues] of cases) {
    const record = records.find((item) => item.id === id);
    assert.ok(record, id);
    const declared = record.value.values || record.value.scaleValues;
    const inputs = {
      "robin-skill-damage-active": true,
      "robin-talent-crit-active": true,
      "robin-concerto-atk-active": true,
      "robin-concerto-atk": 4000
    };
    for (let level = 1; level <= 12; level++) {
      assertClose(declared[level - 1], expectedCoefficients[level - 1], `${id} independent fixed-SHA Lv${level} coefficient`);
      const atE6 = runtime.buildCandidates(records, context(6, { [skillId]: level }), inputs).find((item) => item.id === id);
      assertClose(atE6.value, expectedValues[level - 1], `${id} independently expected resolved Lv${level} value`);
      assert.equal(atE6.applicable, true, `${id} at E6 accepts Lv${level}`);
      const literalModifier = { ...atE6, value: expectedValues[level - 1], enabled: true, applicable: true };
      const actual = engine.calculate({ ...request, modifiers: [atE6] });
      const independent = independentDirectDamage({ ...request, modifiers: [literalModifier] });
      for (const key of ["nonCrit", "crit", "expected"]) {
        assertClose(actual[key], independent[key], `${id} Lv${level} independent ${key} damage`);
      }
      for (let eidolon = 0; eidolon <= 6; eidolon++) {
        const cap = eidolon >= unlockRank ? 12 : 10;
        const candidate = runtime.buildCandidates(records, context(eidolon, { [skillId]: level }), inputs).find((item) => item.id === id);
        assert.equal(candidate.applicable, level <= cap, `${id} Lv${level} E${eidolon} boundary`);
      }
    }
  }
  const talentAtE3 = runtime.buildCandidates(records, context(3, { "130904": 11 }), { "robin-talent-crit-active": true })
    .find((candidate) => candidate.id === "trace:1309:130904:party-crit-damage");
  assert.equal(talentAtE3.applicable, false, "E3 does not unlock Talent levels");

  const e1 = data.structuredModifiers.find((record) => record.id === "eidolon:1309:130901:concerto-resistance-penetration");
  const dotAttack = data.attacks.find((record) => record.type === "dot" && record.support?.status === "calculable");
  assert.ok(dotAttack);
  const dotRequest = makeRequest(dotAttack, 1, { resistance: 20 });
  const dotModifier = activeModifiers([e1], context(1), { "robin-concerto-resistance-active": true }, dotAttack)[0];
  assert.ok(dotModifier?.applicable, "E1 all-RES penetration reaches an ordinary DoT row");
  const dotActual = engine.calculate({ ...dotRequest, modifiers: [dotModifier] });
  const dotIndependent = independentDirectDamage({ ...dotRequest, modifiers: [{ ...dotModifier, value: 24, enabled: true, applicable: true }] });
  for (const key of ["nonCrit", "crit", "expected"]) assertClose(dotActual[key], dotIndependent[key], `E1 ordinary DoT independent ${key} damage`);
});
