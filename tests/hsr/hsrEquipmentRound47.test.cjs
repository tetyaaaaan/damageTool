"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  fixedSourceSha, loadProductionFixture, attackOf, makeRequest,
  independentDirectDamage, assertClose, runtime
} = require("./helpers/hsrDirectVerification.cjs");

const BASE_ID = "lightCone:21030:ultimate-base-defense";
const BASE_RANKS = [60, 75, 90, 105, 120];
const BASE_ATTACKS = ["100103", "120803", "130403", "141403", "800303", "800403"];
const EXTRA_RANKS = {
  "21029": [48, 60, 72, 84, 96],
  "20018": [60, 75, 90, 105, 120]
};
const ELEMENTS = ["Physical", "Fire", "Ice", "Thunder", "Wind", "Quantum", "Imaginary"];
const PROFILE = {
  atk: 3187.25, hp: 6143.5, def: 2988.125,
  baseAtk: 1045.5, baseHp: 5780.25, baseDef: 1217.6,
  critRate: 42.5, critDamage: 137.75, damageBonus: 23.25,
  characterLevel: 80, eidolon: 0, enemyLevel: 83, resistance: 27,
  defenseReduction: 13, defenseIgnore: 7, resistancePenetration: 8,
  takenDamage: 9, toughnessActive: true
};
const DEF_SUPPORT = [
  { id: "fixture:def-flat", category: "statFlat", stat: "def", value: 19.875, enabled: true, applicable: true, calculable: true },
  { id: "fixture:def-percent", category: "statPercent", stat: "def", value: 8.75, enabled: true, applicable: true, calculable: true }
];

function coneRows(data, id) {
  return data.structuredModifiers.filter(item => item.source?.kind === "lightCone" && String(item.source.id) === String(id));
}
function coneContext(id, rank, characterId, element, enemyCount = 1) {
  return {
    characterId, eidolon: 0, characterElement: element, lightConeId: id, refinement: rank,
    partyIds: [], partyEquipment: [], stats: PROFILE,
    baseStats: { atk: PROFILE.baseAtk, hp: PROFILE.baseHp, def: PROFILE.baseDef },
    enemy: { count: enemyCount }, traceLevelFor: () => 10
  };
}
function resolvedAttack(attack, level) {
  const scalingTerms = (attack.scalingTermComponents || []).map(component => ({
    stat: component.stat, multiplier: component.values[level - 1]
  }));
  return {
    ...attack,
    ...(scalingTerms.length ? { scalingTerms } : {}),
    traceLevel: level, multiplier: attack.multipliers[level - 1], hitCount: 1, attackType: attack.type
  };
}
function directInput(attack, level, modifiers) {
  const resolved = resolvedAttack(attack, level);
  const input = makeRequest(resolved, level, PROFILE, modifiers);
  input.attack = { ...input.attack, ...resolved };
  input.character.id = attack.characterId;
  return input;
}
function finalDef() {
  return PROFILE.def + PROFILE.baseDef * 8.75 / 100 + 19.875;
}
function expectedBaseAddition(input, addedBase) {
  const attack = input.attack;
  const terms = attack.scalingTerms?.length
    ? attack.scalingTerms
    : [{ stat: attack.scalingStat || "atk", multiplier: attack.multiplier }];
  const nativeBase = terms.reduce((sum, term) => {
    const stat = term.stat || "atk";
    const value = stat === "def" ? finalDef() : PROFILE[stat];
    return sum + value * term.multiplier / 100;
  }, 0);
  const commonInput = {
    ...input,
    attack: { ...attack, scalingTerms: undefined, scalingStat: "def", multiplier: 100, multipliers: [100] }
  };
  const common = independentDirectDamage(commonInput);
  const commonFactor = common.nonCrit / common.effectiveReferenceValue;
  const nonCrit = (nativeBase + addedBase) * commonFactor;
  const modifiers = input.modifiers || [];
  const critDamage = PROFILE.critDamage + modifiers
    .filter(item => item.enabled !== false && item.applicable !== false && ["critDamage", "critTakenDamage"].includes(item.category))
    .reduce((sum, item) => sum + Number(item.value || 0), 0);
  const critRate = Math.max(0, Math.min(100, PROFILE.critRate + modifiers
    .filter(item => item.enabled !== false && item.applicable !== false && item.category === "critRate")
    .reduce((sum, item) => sum + Number(item.value || 0), 0))) / 100;
  const critMultiplier = attack.canCrit === false ? 1 : 1 + critDamage / 100;
  return {
    nativeBase, effectiveDef: finalDef(), nonCrit,
    crit: nonCrit * critMultiplier,
    expected: nonCrit * (1 + critRate * (critMultiplier - 1))
  };
}

test("Round47 21030: independent base-DEF term across supported Ultimate levels and S1-S5", async () => {
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  const { data, engine } = await loadProductionFixture();
  const row = data.structuredModifiers.find(item => item.id === BASE_ID);
  assert.ok(row);
  assert.equal(row.category, "baseDamageAddition");
  assert.equal(row.stat, "def");
  assert.equal(row.activation.mode, "always");
  assert.deepEqual(Array.from(row.value.values), BASE_RANKS);
  assert.deepEqual(Array.from(row.target.attackIds), BASE_ATTACKS);

  for (const attackId of BASE_ATTACKS) {
    const sourceAttack = attackOf(data, attackId);
    assert.equal(sourceAttack.type, "ultimate");
    for (let rank = 1; rank <= 5; rank++) {
      for (let level = 1; level <= 10; level++) {
        const rows = [row];
        const inputs = {};
        if (attackId === "130403") {
          const native = data.structuredModifiers.find(item => item.id === "trace:1304:130403:crit-vulnerability");
          assert.ok(native, "Aventurine Ultimate requires its native Unnerve modifier");
          rows.push(native);
          inputs["aventurine-unnerve-active"] = true;
        }
        const candidates = runtime.buildCandidates(rows, coneContext("21030", rank, sourceAttack.characterId, "Fire"), inputs)
          .map(item => ({ ...item, applicable: runtime.applicableToAttack(item, sourceAttack) }));
        const lc = candidates.find(item => item.id === BASE_ID);
        assert.ok(lc?.enabled && lc.applicable, attackId + " S" + rank + " Lv" + level + " LC active");
        assert.equal(lc.value, BASE_RANKS[rank - 1]);
        const modifiers = [...candidates, ...DEF_SUPPORT];
        if (attackId === "130403") {
          assert.ok(modifiers.some(item => item.id === "trace:1304:130403:crit-vulnerability"
            && item.enabled && item.applicable && item.value === 15));
        }
        const input = directInput(sourceAttack, level, modifiers);
        input.modifierInputs = inputs;
        const added = finalDef() * BASE_RANKS[rank - 1] / 100;
        const expected = expectedBaseAddition(input, added);
        const result = engine.calculate(input);
        assert.notEqual(result.supported, false, attackId + " S" + rank + " Lv" + level + " supported");
        const term = result.breakdown.scalingTerms.find(item => item.sourceModifierId === BASE_ID);
        assert.ok(term, attackId + " base term exists");
        assertClose(term.referenceValue, expected.effectiveDef, "uses final DEF plus only specified support");
        assertClose(term.multiplierPercent, BASE_RANKS[rank - 1], "one refinement coefficient");
        assertClose(result.breakdown.baseDamage, expected.nativeBase + added, "native base plus one DEF term");
        for (const key of ["nonCrit", "crit", "expected"]) {
          assertClose(result[key], expected[key], attackId + " S" + rank + " Lv" + level + " independent " + key);
        }
      }
    }
  }
});

test("Round47 21030: included-term exclusion, target type and supported-scope guards", async () => {
  const { data, engine } = await loadProductionFixture();
  const row = data.structuredModifiers.find(item => item.id === BASE_ID);
  assert.equal(row.category, "baseDamageAddition", "LC DEF passive is not reapplied as statPercent");
  const context = coneContext("21030", 3, "1001", "Ice");
  const candidate = runtime.buildCandidates([row], context, {})[0];
  const attack = resolvedAttack(attackOf(data, "100103"), 10);
  for (const type of ["normal", "skill", "dot", "additional", "followUp"]) {
    assert.equal(runtime.applicableToAttack(candidate, { ...attack, type, attackType: type }), false,
      "21030 excluded from " + type);
  }
  assert.equal(runtime.applicableToAttack(candidate,
    { ...attack, id: "120601", type: "ultimate", attackType: "ultimate" }), false, "unlisted Ultimate excluded");
  assert.equal(runtime.buildCandidates([row], coneContext("", 3, "1001", "Ice"), {}).length, 0, "unequipped LC excluded");

  const included = runtime.buildCandidates([row], context, {
    [row.finalStatsInclusion.inputKey]: true
  })[0];
  assert.equal(included.enabled, false, "already included term is suppressed");
  const sourceAttack = attackOf(data, "100103");
  const without = directInput(sourceAttack, 10, []);
  const withExcluded = directInput(sourceAttack, 10, [included, ...DEF_SUPPORT]);
  assertClose(engine.calculate(withExcluded).nonCrit, engine.calculate(without).nonCrit,
    "already included term is not added twice");

  const normalCandidate = runtime.buildCandidates([row], context, {})[0];
  const good = directInput(sourceAttack, 10, [normalCandidate, ...DEF_SUPPORT]);
  const invalid = [
    input => { input.character.level = 79; },
    input => { input.character.eidolon = 1; },
    input => { input.enemy.count = 2; },
    input => { input.attack.hitCount = 2; },
    input => { input.attack.traceLevel = 11; },
    input => { input.modifiers.push({ id: "fixture:progressive", category: "progressiveTakenDamage", value: 5,
      enabled: true, applicable: true, stacking: { maximumStacks: 2 } }); }
  ];
  for (const mutate of invalid) {
    const bad = structuredClone(good);
    mutate(bad);
    assert.equal(engine.calculate(bad).supported, false, "out-of-scope state is rejected");
  }
  const missingDef = structuredClone(good);
  missingDef.character.stats.def = Number.NaN;
  assert.equal(engine.calculate(missingDef).supported, false, "missing final DEF is rejected");
});

test("Round47 21029/20018: S1-S5 independent wearer-attribute follow-up calculations", async () => {
  const { data, engine } = await loadProductionFixture();
  for (const coneId of ["21029", "20018"]) {
    const rows = coneRows(data, coneId);
    const row = rows.find(item => item.supplementalAttack);
    assert.ok(row);
    assert.equal(row.category, "extraDamage");
    assert.equal(row.supplementalAttack.element, "wearer");
    assert.equal(row.supplementalAttack.type, "additional");
    assert.equal(row.supplementalAttack.scalingStat, "atk");
    assert.equal(row.supplementalAttack.canCrit, true);
    assert.deepEqual(Array.from(row.value.values), EXTRA_RANKS[coneId]);
    for (const element of ELEMENTS) {
      for (let rank = 1; rank <= 5; rank++) {
        const inputs = coneId === "20018" ? { "lc-20018-next-basic-ready": true } : {};
        const context = coneContext(coneId, rank, "1003", element);
        const candidate = runtime.buildCandidates(rows, context, inputs).find(item => item.id === row.id);
        assert.ok(candidate?.enabled && candidate.applicable, coneId + " " + element + " S" + rank + " active");
        assert.equal(candidate.value, EXTRA_RANKS[coneId][rank - 1]);
        assert.equal(candidate.supplementalAttack.element, element);
        const reference = runtime.supplementalReference(candidate, context, inputs);
        assert.equal(reference.supported, true);
        assert.equal(reference.statReferenceId, "1003");
        assert.equal(reference.stats.atk, PROFILE.atk);
        assert.equal(reference.stats.damageBonus, PROFILE.damageBonus);

        const supplemental = {
          id: "supplemental:" + row.id, name: row.supplementalAttack.name,
          type: "additional", attackType: "additional", element, scalingStat: "atk",
          target: "single", hitCount: 1, canCrit: true,
          multiplier: EXTRA_RANKS[coneId][rank - 1], multipliers: [EXTRA_RANKS[coneId][rank - 1]],
          traceLevel: 1
        };
        const modifiers = [
          { id: "fixture:all-dmg", category: "damageBonus", value: 8.5, enabled: true, applicable: true, calculable: true, target: { owner: "self", attackTypes: ["all"], elements: [] } },
          { id: "fixture:normal-dmg", category: "damageBonus", value: 91, enabled: true, applicable: true, calculable: true, target: { owner: "self", attackTypes: ["normal"], elements: [] } },
          { id: "fixture:skill-dmg", category: "damageBonus", value: 73, enabled: true, applicable: true, calculable: true, target: { owner: "self", attackTypes: ["skill"], elements: [] } },
          { id: "fixture:follow-up-dmg", category: "damageBonus", value: 64, enabled: true, applicable: true, calculable: true, target: { owner: "self", attackTypes: ["followUp"], elements: [] } },
          { id: "fixture:def-ignore", category: "defenseIgnore", value: 11, enabled: true, applicable: true, calculable: true, target: { owner: "self", attackTypes: ["all"], elements: [] } },
          { id: "fixture:res-pen", category: "resistancePenetration", value: 7, enabled: true, applicable: true, calculable: true, target: { owner: "self", attackTypes: ["all"], elements: [] } },
          { id: "fixture:crit-rate", category: "critRate", value: 4, enabled: true, applicable: true, calculable: true, target: { owner: "self", attackTypes: ["all"], elements: [] } },
          { id: "fixture:crit-dmg", category: "critDamage", value: 12, enabled: true, applicable: true, calculable: true, target: { owner: "self", attackTypes: ["all"], elements: [] } }
        ].map(item => ({ ...item, applicable: runtime.applicableToAttack(item, supplemental) }));
        const request = makeRequest(supplemental, 1, PROFILE, modifiers);
        request.attack = { ...request.attack, ...supplemental };
        const expected = independentDirectDamage(request);
        const result = engine.calculate(request);
        assert.notEqual(result.supported, false, coneId + " " + element + " S" + rank + " supported");
        for (const key of ["nonCrit", "crit", "expected"]) {
          assertClose(result[key], expected[key], coneId + " " + element + " S" + rank + " independent " + key);
        }
        for (const excluded of ["fixture:normal-dmg", "fixture:skill-dmg", "fixture:follow-up-dmg"]) {
          assert.equal(result.applied.some(item => item.id === excluded), false,
            coneId + " " + element + " S" + rank + " excludes " + excluded);
        }
        const original = attackOf(data, "100301");
        const withCandidate = engine.calculate(makeRequest(original, 1, PROFILE, [candidate]));
        const withoutCandidate = engine.calculate(makeRequest(original, 1, PROFILE, []));
        assertClose(withCandidate.nonCrit, withoutCandidate.nonCrit, coneId + " separate from original attack");
      }
    }
  }
});

test("Round47 20018 readiness and both cones' missing-wearer/unequipped states stay local", async () => {
  const { data } = await loadProductionFixture();
  for (const coneId of ["21029", "20018"]) {
    const rows = coneRows(data, coneId);
    const row = rows.find(item => item.supplementalAttack);
    assert.equal(runtime.buildCandidates(rows, coneContext("", 1, "1003", "Fire"), { "lc-20018-next-basic-ready": true }).length, 0, coneId + " unequipped");
    if (coneId === "20018") {
      const inactive = runtime.buildCandidates(rows, coneContext(coneId, 1, "1003", "Fire"), {})[0];
      assert.equal(inactive.enabled, false, "20018 needs the user-selected next-basic-ready state");
    }
    const context = coneContext(coneId, 1, "1003", undefined);
    const candidate = runtime.buildCandidates(rows, context, {
      ...(coneId === "20018" ? { "lc-20018-next-basic-ready": true } : {})
    }).find(item => item.id === row.id);
    assert.ok(candidate?.enabled);
    assert.equal(runtime.supplementalReference(candidate, context, {}).supported, false,
      coneId + " unknown wearer attribute is not guessed");
  }
});
