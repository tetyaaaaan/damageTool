"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  fixedSourceSha, loadProductionFixture, runtime, makeRequest,
  assertMatchesIndependent, assertClose, readJson
} = require("./helpers/hsrDirectVerification.cjs");

const attackFile = "games/hsr/data/calc/attacks-extra-round12.json";
const modifierFile = "games/hsr/data/calc/modifiers-extra-round12.json";
const atkCurve = [140,154,168,182,196,210,227.5,245,262.5,280];
const ultCurve = [700,770,840,910,980,1050,1137.5,1225,1312.5,1400];
const debtCurve = [15,16,17,18,19,20,21.25,22.5,23.75,25];
const profile = {
  atk: 3317, hp: 7159, def: 2411, baseAtk: 1043, baseHp: 1217, baseDef: 987,
  critRate: 37, critDamage: 143, damageBonus: 19,
  enemyLevel: 82, resistance: 27, toughnessActive: true,
  defenseReduction: 11, defenseIgnore: 4, resistancePenetration: 7, takenDamage: 9
};

function install(data, attack) {
  const index = data.attacks.findIndex((item) => item.id === attack.id);
  if (index < 0) data.attacks.push(attack);
  else data.attacks[index] = attack;
}

function candidateModifiers(data, level, inputs) {
  const records = readJson(modifierFile).modifiers;
  for (const record of records) if (!data.structuredModifiers.some((item) => item.id === record.id)) data.structuredModifiers.push(record);
  return runtime.buildCandidates(data.structuredModifiers, {
    characterId: "1509", eidolon: 0, stats: profile,
    traceLevelFor: (source) => source.skillId === "150902" ? level : 10
  }, inputs).map((modifier) => ({
    ...modifier,
    applicable: modifier.applicable && runtime.applicableToAttack(modifier, { id: "150902", type: "skill", element: "Thunder" })
  }));
}

test("Round12 Jade and Gilgamesh records use the pinned source and bounded conditions", () => {
  const attacks = readJson(attackFile);
  const modifiers = readJson(modifierFile);
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  assert.deepEqual(attacks.overrides.map((item) => item.id), ["131402", "131401", "1314021", "150902", "150903", "1509051"]);
  assert.ok(attacks.overrides.every((item) => item.provenance.sourceCommit === fixedSourceSha));
  assert.equal(attacks.overrides[0].support.status, "displayOnly", "131402 only assigns the debt-collector state; later damage is a separate result");
  const jadeFollowup = attacks.overrides.find((item) => item.id === "1314021");
  assert.equal(jadeFollowup.sourceSkillId, "131402");
  assert.equal(jadeFollowup.scalingStat, "atk");
  assert.equal(jadeFollowup.modifierInputDefault, 0);
  assert.equal(attacks.overrides.find((item) => item.id === "150903").enemyCountExact, 1);
  assert.deepEqual(attacks.overrides.find((item) => item.id === "150902").comparisonModifierInputs, { "gilgamesh-kings-recognition-active": true });
  assert.equal(attacks.overrides.find((item) => item.id === "1509051").element, "Thunder");
  assert.equal(modifiers.modifiers.length, 1);
  assert.equal(modifiers.modifiers[0].finalStatsInclusion.inputKey, "gilgamesh-kings-recognition-in-final-enemy-defense");
});

test("Jade direct and debt-collector added damage match fixed curves at every accepted level", async () => {
  const { data, engine } = await loadProductionFixture();
  const attacks = readJson(attackFile).overrides;
  for (const id of ["131401", "1314021"]) install(data, attacks.find((item) => item.id === id));
  const normal = attacks.find((item) => item.id === "131401");
  const followup = attacks.find((item) => item.id === "1314021");
  for (let level = 1; level <= 6; level += 1) {
    const input = makeRequest(normal, level, { ...profile, enemyCount: 1 });
    input.attack.multiplier = [45,54,63,72,81,90][level - 1];
    assertMatchesIndependent(engine, input, `Jade 131401 Lv${level}`);
  }
  for (let level = 1; level <= 10; level += 1) {
    const input = makeRequest(followup, level, { ...profile, enemyCount: 1 });
    input.attack.multiplier = debtCurve[level - 1];
    input.modifierInputs = { "jade-debt-collector-active": 1 };
    assertMatchesIndependent(engine, input, `Jade 131402 added component Lv${level}`);
  }
});

test("Gilgamesh primary skill and single-enemy 11-hit ultimate match independent totals", async () => {
  const { data, engine } = await loadProductionFixture();
  const attacks = readJson(attackFile).overrides;
  for (const id of ["150902", "150903", "1509051"]) install(data, attacks.find((item) => item.id === id));
  for (let level = 1; level <= 10; level += 1) {
    const skill = attacks.find((item) => item.id === "150902");
    const stateInputs = { "gilgamesh-kings-recognition-active": true };
    const skillInput = makeRequest(skill, level, { ...profile, enemyCount: 1 }, candidateModifiers(data, level, stateInputs));
    skillInput.attack.multiplier = atkCurve[level - 1];
    skillInput.modifierInputs = stateInputs;
    assertMatchesIndependent(engine, skillInput, `Gilgamesh 150902 Lv${level}`);

    const ultimate = attacks.find((item) => item.id === "150903");
    assert.equal(ultimate.multipliers[level - 1], ultCurve[level - 1]);
    const ultimateInput = makeRequest(ultimate, level, { ...profile, enemyCount: 1 });
    ultimateInput.attack.multiplier = ultCurve[level - 1];
    assertMatchesIndependent(engine, ultimateInput, `Gilgamesh 150903 one-enemy total Lv${level}`);

    const followup = attacks.find((item) => item.id === "1509051");
    const followupInput = makeRequest(followup, level, { ...profile, enemyCount: 1 });
    followupInput.attack.multiplier = [200,220,240,260,280,300,325,350,375,400][level - 1];
    followupInput.modifierInputs = { "gilgamesh-link-followup-ready": 1 };
    assertMatchesIndependent(engine, followupInput, `Gilgamesh 150905 Thunder follow-up Lv${level}`);
  }
});

test("Gilgamesh defense ignore is an explicit prior-state toggle and respects enemy input inclusion", async () => {
  const { data, engine } = await loadProductionFixture();
  const attack = readJson(attackFile).overrides.find((item) => item.id === "150902");
  install(data, attack);
  const modifierFileData = readJson(modifierFile).modifiers[0];
  assert.deepEqual(modifierFileData.value.values, [15,16.5,18,19.5,21,22.5,24.37,26.25,28.12,30]);
  for (let level = 1; level <= 10; level += 1) {
    const offInputs = { "gilgamesh-kings-recognition-active": false };
    const off = makeRequest(attack, level, { ...profile, enemyCount: 1 }, candidateModifiers(data, level, offInputs));
    off.attack.multiplier = atkCurve[level - 1];
    off.modifierInputs = offInputs;
    const offResult = engine.calculate(off);
    assert.equal(offResult.supported, false, "this documented skill scope requires the prior-recognition state");

    const onInputs = { "gilgamesh-kings-recognition-active": true };
    const on = makeRequest(attack, level, { ...profile, enemyCount: 1 }, candidateModifiers(data, level, onInputs));
    on.attack.multiplier = atkCurve[level - 1];
    on.modifierInputs = onInputs;
    const onResult = assertMatchesIndependent(engine, on, `Gilgamesh prior defense-ignore state Lv${level}`);
    const baselineDefenseMultiplier = (80 + 20) / ((80 + 20) + (82 + 20) * (1 - (profile.defenseReduction + profile.defenseIgnore) / 100));
    assert.ok(onResult.breakdown.defense > baselineDefenseMultiplier, "prior-state defense ignore must increase the effective defense multiplier");

    const ignoreValue = modifierFileData.value.values[level - 1];
    const includedInputs = { ...onInputs, "gilgamesh-kings-recognition-in-final-enemy-defense": true };
    const included = makeRequest(attack, level, { ...profile, enemyCount: 1, defenseIgnore: profile.defenseIgnore + ignoreValue }, candidateModifiers(data, level, includedInputs));
    included.attack.multiplier = atkCurve[level - 1];
    included.modifierInputs = includedInputs;
    const includedResult = assertMatchesIndependent(engine, included, `Gilgamesh manually included defense ignore Lv${level}`);
    assertClose(includedResult.expected, onResult.expected, `Gilgamesh final enemy input avoids duplicate Lv${level}`);
  }
});
