"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  fixedSourceSha,
  loadProductionFixture,
  runtime,
  makeRequest,
  assertMatchesIndependent,
  assertClose,
  readJson
} = require("./helpers/hsrDirectVerification.cjs");

const attackFile = "games/hsr/data/calc/attacks-phainon-round22.json";
const expected = {
  "140802": {
    main: [150,165,180,195,210,225,243.75,262.5,281.25,300],
    adjacent: [60,66,72,78,84,90,97.5,105,112.5,120],
    maximumTraceLevel: 10
  },
  "140808": {
    main: [125,150,175,200,225,250],
    adjacent: [37.5,45,52.5,60,67.5,75],
    maximumTraceLevel: 6
  }
};
const profiles = [
  { atk: 3317, hp: 7159, def: 2411, baseAtk: 1043, baseHp: 1217, baseDef: 987, critRate: 37, critDamage: 143, damageBonus: 19, enemyLevel: 82, resistance: 27, toughnessActive: true, defenseReduction: 11, defenseIgnore: 4, resistancePenetration: 7, takenDamage: 9 },
  { atk: 5041, hp: 8923, def: 3869, baseAtk: 1179, baseHp: 1003, baseDef: 1109, critRate: 71, critDamage: 88, damageBonus: 46, enemyLevel: 93, resistance: 5, toughnessActive: false, defenseReduction: 0, defenseIgnore: 12, resistancePenetration: 13, takenDamage: 0 }
];

function install(data, attack) {
  const index = data.attacks.findIndex((item) => item.id === attack.id);
  assert.notEqual(index, -1, "production generated row exists: " + attack.id);
  data.attacks[index] = attack;
}

function candidatesFor(data, attack, profile, enabled) {
  const modifierInputs = { "phainon-a2-healing-damage-active": enabled };
  const modifiers = runtime.buildCandidates(data.structuredModifiers, {
    characterId: "1408",
    eidolon: 0,
    stats: profile,
    traceLevelFor: () => 10
  }, modifierInputs).map((modifier) => ({
    ...modifier,
    applicable: modifier.applicable && runtime.applicableToAttack(modifier, attack)
  }));
  return { modifierInputs, modifiers };
}

function inputFor(attack, level, profile, componentMultiplier, target, modifiers, modifierInputs) {
  const input = makeRequest(attack, level, { ...profile, enemyCount: 3 }, modifiers);
  input.attack.attackType = attack.type;
  input.attack.multiplier = componentMultiplier;
  input.attack.target = target;
  input.modifierInputs = modifierInputs;
  return input;
}

function phainonModifiers(data, attack, profile, inputs, traceLevel = 10) {
  return runtime.buildCandidates(data.structuredModifiers, {
    characterId: "1408",
    eidolon: 0,
    stats: profile,
    traceLevelFor: (source) => source.skillId === "140805" ? traceLevel : 10
  }, inputs).map((modifier) => ({
    ...modifier,
    applicable: modifier.applicable && runtime.applicableToAttack(modifier, attack)
  }));
}

test("Round22 Phainon 140802/140808 restore fixed E0 adjacent-target curves and keep each target separate", async () => {
  const definition = readJson(attackFile);
  const { data, engine } = await loadProductionFixture();
  assert.equal(definition.generatedFrom.includes(fixedSourceSha), true);
  assert.deepEqual(definition.overrides.map((attack) => attack.id), ["140802", "140808"]);

  const a2 = data.structuredModifiers.find((modifier) => modifier.id === "traceNode:1408:1408102:healing-damage");
  assert.ok(a2, "reuse existing +45% damage trace condition");
  assert.equal(a2.value.fixed, 45);
  assert.equal(a2.activation.inputKey, "phainon-a2-healing-damage-active");

  for (const attack of definition.overrides) {
    const curves = expected[attack.id];
    install(data, attack);
    assert.equal(attack.provenance.sourceCommit, fixedSourceSha);
    assert.equal(attack.support.status, "calculable");
    assert.equal(attack.maximumEidolon, 0);
    assert.equal(attack.maximumTraceLevel, curves.maximumTraceLevel);
    assert.equal(attack.target, "blast");
    assert.equal(attack.suppressAdjacentWithSingleEnemy, true);
    assert.deepEqual(attack.multipliers, curves.main, attack.id + " pinned main coefficient");
    assert.deepEqual(attack.adjacentMultipliers, curves.adjacent, attack.id + " pinned adjacent coefficient");

    for (let level = 1; level <= curves.maximumTraceLevel; level += 1) {
      for (const [profileIndex, profile] of profiles.entries()) {
        for (const enabled of [false, true]) {
          const { modifiers, modifierInputs } = candidatesFor(data, attack, profile, enabled);
          const label = attack.id + " Lv" + level + " profile" + profileIndex + " A2" + enabled;
          for (const [scope, multiplier] of [["single", curves.main[level - 1]], ["adjacent", curves.adjacent[level - 1]]]) {
            const input = inputFor(attack, level, profile, multiplier, scope, modifiers, modifierInputs);
            const result = assertMatchesIndependent(engine, input, label + " " + scope);
            assertClose(result.breakdown.damageBonus, profile.damageBonus + (enabled ? 45 : 0), label + " " + scope + " damage bonus");
            assert.equal(result.applied.some((modifier) => modifier.id === a2.id), enabled, label + " " + scope + " A2 state");
          }
        }
      }
    }
  }
});

test("Round22 Phainon battle-entry ATK applies once to base and transformed attacks with final-stat inclusion", async () => {
  const { data, engine } = await loadProductionFixture();
  const attack = readJson(attackFile).overrides.find((item) => item.id === "140808");
  const baseProfile = profiles[0];
  install(data, attack);
  const a6 = data.structuredModifiers.find((modifier) => modifier.id === "traceNode:1408:1408103:battle-atk");
  const formAtk = data.structuredModifiers.find((modifier) => modifier.id === "trace:1408:140805:kaslana-atk");
  assert.ok(a6);
  assert.ok(formAtk);
  assert.deepEqual(a6.target.attackIds, ["140801", "140802", "140803", "140808", "140809", "140811"]);

  const states = [
    { label: "A6 off", inputs: { "phainon-kaslana-form": true }, finalAtk: baseProfile.atk, expectedPercent: 80, a6Enabled: false },
    { label: "A6 active 1 stack", inputs: { "phainon-kaslana-form": true, "phainon-a6-atk-stacks": 1 }, finalAtk: baseProfile.atk, expectedPercent: 130, a6Enabled: true },
    { label: "A6 already in final ATK", inputs: { "phainon-kaslana-form": true, "phainon-a6-atk-stacks": 1, "phainon-a6-atk-in-final-stats": true }, finalAtk: baseProfile.atk + baseProfile.baseAtk * 0.5, expectedPercent: 130, a6Enabled: false }
  ];
  for (const state of states) {
    const currentProfile = { ...baseProfile, atk: state.finalAtk };
    const modifiers = phainonModifiers(data, attack, currentProfile, state.inputs, 10);
    const input = inputFor(attack, 6, currentProfile, attack.multipliers[5], "single", modifiers, state.inputs);
    const result = assertMatchesIndependent(engine, input, state.label);
    assertClose(result.breakdown.referenceValue, baseProfile.atk + baseProfile.baseAtk * state.expectedPercent / 100, state.label + " final reference ATK");
    assert.equal(result.applied.some((modifier) => modifier.id === a6.id), state.a6Enabled, state.label + " A6 is applied only when absent from final ATK");
  }
});
