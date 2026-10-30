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

const attackFile = "games/hsr/data/calc/attacks-phainon-round12.json";
const modifierFile = "games/hsr/data/calc/modifiers-phainon-round12.json";
const sourceCurves = {
  "140803": [480, 528, 576, 624, 672, 720, 780, 840, 900, 960],
  counterBase: [20, 22, 24, 26, 28, 30, 32.5, 35, 37.5, 40, 42, 44, 46, 48, 50],
  counterBounce: [15, 16.5, 18, 19.5, 21, 22.5, 24.37, 26.25, 28.12, 30, 31.5, 33, 34.5, 36, 37.5],
  ruinBase: [225, 247.5, 270, 292.5, 315, 337.5, 365.62, 393.75, 421.88, 450, 472.5, 495, 517.5, 540, 562.5],
  ruinPerHit: [22.5, 24.75, 27, 29.25, 31.5, 33.75, 36.56, 39.37, 42.19, 45, 47.25, 49.5, 51.75, 54, 56.25],
  ruinMaximum: [585, 643.5, 702, 760.5, 819, 877.5, 950.62, 1023.75, 1096.88, 1170, 1228.5, 1287, 1345.5, 1404, 1462.5]
};
const profile = {
  atk: 3317, hp: 7159, def: 2411,
  baseAtk: 1043, baseHp: 1217, baseDef: 987,
  critRate: 37, critDamage: 143, damageBonus: 19,
  enemyLevel: 82, resistance: 27, toughnessActive: true,
  defenseReduction: 11, defenseIgnore: 4, resistancePenetration: 7, takenDamage: 9
};

function install(data, attack) {
  const index = data.attacks.findIndex((item) => item.id === attack.id);
  assert.notEqual(index, -1, "production attack exists: " + attack.id);
  data.attacks[index] = attack;
}

function attackInput(data, attack, level, multiplier, selected = {}, talentLevel = 10) {
  for (const modifier of readJson(modifierFile).modifiers) {
    if (!data.structuredModifiers.some((item) => item.id === modifier.id)) data.structuredModifiers.push(modifier);
  }
  const modifierInputs = { ...(attack.comparisonModifierInputs || {}), ...selected };
  const modifiers = runtime.buildCandidates(data.structuredModifiers, {
    characterId: "1408", eidolon: 0, stats: profile,
    traceLevelFor: (source) => source.skillId === "140805" ? talentLevel : 10
  }, modifierInputs).map((modifier) => ({
    ...modifier,
    applicable: modifier.applicable && runtime.applicableToAttack(modifier, attack)
  }));
  const input = makeRequest(attack, level, { ...profile, enemyCount: 1 }, modifiers);
  input.attack.multiplier = multiplier;
  input.modifierInputs = modifierInputs;
  return input;
}

test("Round12 Phainon attack definitions use pinned source and avoid duplicating A2", async () => {
  const definition = readJson(attackFile);
  const modifierDefinition = readJson(modifierFile);
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  assert.equal(definition.generatedFrom.includes(fixedSourceSha), true);
  assert.deepEqual(definition.overrides.map((attack) => attack.id), ["140803", "140809", "140811"]);
  assert.deepEqual(modifierDefinition.modifiers.map((modifier) => modifier.id), [
    "trace:1408:140805:kaslana-atk",
    "trace:1408:140805:kaslana-hp",
    "traceNode:1408:1408103:battle-atk"
  ]);
  const existingA2 = readJson("games/hsr/data/calc/modifiers-native-round4.json").modifiers
    .find((modifier) => modifier.id === "traceNode:1408:1408102:healing-damage");
  assert.ok(existingA2, "Phainon A2 must reuse the existing 45% healing/barrier modifier");
  assert.equal(existingA2.value.fixed, 45);
  assert.equal(existingA2.activation.inputKey, "phainon-a2-healing-damage-active");
  const a6 = modifierDefinition.modifiers.find((modifier) => modifier.id === "traceNode:1408:1408103:battle-atk");
  assert.equal(a6.activation.mode, "stack");
  assert.equal(a6.activation.minimum, 1);
  assert.equal(a6.activation.maximum, 2);
  assert.equal(Object.hasOwn(a6.activation, "default"), false);
});

test("140805 transformation ATK is level-driven and final-input inclusion does not add it twice", async () => {
  const { data, engine } = await loadProductionFixture();
  for (const modifier of readJson(modifierFile).modifiers) {
    if (!data.structuredModifiers.some((item) => item.id === modifier.id)) data.structuredModifiers.push(modifier);
  }
  const attack = readJson(attackFile).overrides.find((item) => item.id === "140803");
  install(data, attack);
  const atkModifier = data.structuredModifiers.find((item) => item.id === "trace:1408:140805:kaslana-atk");
  const a2Modifier = data.structuredModifiers.find((item) => item.id === "traceNode:1408:1408102:healing-damage");
  assert.ok(atkModifier);
  assert.ok(a2Modifier);
  assert.deepEqual(atkModifier.value.values, [40, 44, 48, 52, 56, 60, 65, 70, 75, 80]);
  const hpModifier = data.structuredModifiers.find((item) => item.id === "trace:1408:140805:kaslana-hp");
  assert.ok(hpModifier);
  assert.deepEqual(hpModifier.value.values, [135, 148.5, 162, 175.5, 189, 202.5, 219.38, 236.25, 253.12, 270]);
  for (let traceLevel = 1; traceLevel <= 10; traceLevel += 1) {
    const options = { "phainon-kaslana-form": true, "phainon-a2-healing-damage-active": true, "phainon-a6-atk-stacks": 1 };
    const candidates = runtime.buildCandidates(data.structuredModifiers, {
      characterId: "1408", eidolon: 0, stats: profile,
      traceLevelFor: (source) => source.skillId === "140805" ? traceLevel : 10
    }, options).map((modifier) => ({
      ...modifier,
      applicable: modifier.applicable && runtime.applicableToAttack(modifier, attack)
    }));
    const appliedAtk = candidates.find((modifier) => modifier.id === atkModifier.id);
    const appliedA2 = candidates.find((modifier) => modifier.id === a2Modifier.id);
    assert.equal(appliedAtk.value, atkModifier.value.values[traceLevel - 1]);
    assert.equal(appliedAtk.enabled, true);
    assert.equal(appliedAtk.includedInFinalStats, false);
    assert.equal(appliedA2.enabled, true);
    assert.equal(appliedA2.value, 45);
    const appliedHp = candidates.find((modifier) => modifier.id === hpModifier.id);
    assert.equal(appliedHp.enabled, true);
    assert.equal(appliedHp.value, hpModifier.value.values[traceLevel - 1]);
    const battleAtk = candidates.find((modifier) => modifier.id === "traceNode:1408:1408103:battle-atk");
    assert.ok(battleAtk && battleAtk.enabled);
    assert.equal(battleAtk.value, 50);

    const level = 10;
    const coefficient = sourceCurves["140803"][level - 1];
    const active = makeRequest(attack, level, { ...profile, enemyCount: 1 }, candidates);
    active.modifierInputs = options;
    const activeResult = assertMatchesIndependent(engine, active, "140805 transform ATK/A2 active traceLv" + traceLevel);
    const formAtk = profile.atk + profile.baseAtk * (atkModifier.value.values[traceLevel - 1] + 50) / 100;
    const inclusionOptions = {
      ...options,
      "phainon-kaslana-atk-in-final-stats": true,
      "phainon-a6-atk-in-final-stats": true
    };
    const includedCandidates = runtime.buildCandidates(data.structuredModifiers, {
      characterId: "1408", eidolon: 0, stats: profile,
      traceLevelFor: (source) => source.skillId === "140805" ? traceLevel : 10
    }, inclusionOptions).map((modifier) => ({
      ...modifier,
      applicable: modifier.applicable && runtime.applicableToAttack(modifier, attack)
    }));
    const includedAtk = includedCandidates.find((modifier) => modifier.id === atkModifier.id);
    assert.equal(includedAtk.enabled, false);
    assert.equal(includedAtk.includedInFinalStats, true);
    const includedA6 = includedCandidates.find((modifier) => modifier.id === battleAtk.id);
    assert.equal(includedA6.enabled, false);
    assert.equal(includedA6.includedInFinalStats, true);
    const included = makeRequest(attack, level, { ...profile, atk: formAtk, enemyCount: 1 }, includedCandidates);
    included.attack.multiplier = coefficient;
    included.modifierInputs = inclusionOptions;
    const includedResult = assertMatchesIndependent(engine, included, "140805 transformed ATK in final input traceLv" + traceLevel);
    assertClose(includedResult.expected, activeResult.expected, "140805 final-input inclusion avoids double addition traceLv" + traceLevel);

    const hpAttack = { ...attack, scalingStat: "hp" };
    const hpInput = makeRequest(hpAttack, level, { ...profile, enemyCount: 1 }, candidates);
    hpInput.attack.multiplier = coefficient;
    const hpResult = assertMatchesIndependent(engine, hpInput, "140805 form HP stat route traceLv" + traceLevel);
    assertClose(hpResult.breakdown.referenceValue, profile.hp + profile.baseHp * hpModifier.value.values[traceLevel - 1] / 100, "140805 transformed HP reference traceLv" + traceLevel);
  }
});

test("140803 final-turn shared attack is a single-target exact snapshot for all accepted ultimate levels", async () => {
  const attacks = readJson(attackFile).overrides;
  const attack = attacks.find((item) => item.id === "140803");
  const { data, engine } = await loadProductionFixture();
  install(data, attack);
  assert.equal(attack.target, "aoe");
  assert.equal(attack.enemyCountExact, 1);
  assert.equal(attack.maximumEidolon, 0);
  assert.deepEqual(attack.multipliers, sourceCurves["140803"]);
  assert.match(attack.conditionText, /最後の追加ターン/);
  for (let level = 1; level <= 10; level += 1) {
    const input = attackInput(data, attack, level, sourceCurves["140803"][level - 1], { "phainon-a6-atk-stacks": 1 });
    const result = assertMatchesIndependent(engine, input, "140803 Lv" + level);
    assertClose(result.breakdown.referenceValue, profile.atk + profile.baseAtk * 1.3, "140803 uses form and combat-entry final ATK");
    assert.ok(result.nonCrit !== result.crit);
  }
});

test("140809 counter combines base and four bounce coefficients then applies the chosen Flame Reaper stacks", async () => {
  const attack = readJson(attackFile).overrides.find((item) => item.id === "140809");
  const { data, engine } = await loadProductionFixture();
  install(data, attack);
  assert.equal(attack.enemyCountExact, 1);
  assert.equal(attack.type, "skill");
  assert.equal(attack.numericModifierInputs[0].inputKey, "phainon-counter-flame-stacks");
  assert.equal(attack.numericModifierInputs[0].minimum, 1);
  assert.equal(attack.numericModifierInputs[0].maximum, 99);
  assert.equal(Object.hasOwn(attack.numericModifierInputs[0], "default"), false);
  assert.equal(attack.phainonCounterStackMultiplierPercent, 20);
  assert.equal(attack.phainonCounterBounceHitCount, 4);
  for (let level = 1; level <= 10; level += 1) {
    for (const stacks of [1, 5, 99]) {
      const base = sourceCurves.counterBase[level - 1];
      const bounce = sourceCurves.counterBounce[level - 1];
      const multiplier = (base + 4 * bounce) * (1 + 0.2 * stacks);
      const input = attackInput(data, attack, level, multiplier, { "phainon-counter-flame-stacks": stacks, "phainon-a6-atk-stacks": 1 });
      const result = assertMatchesIndependent(engine, input, "140809 Lv" + level + " stacks" + stacks);
      assertClose(result.breakdown.referenceValue, profile.atk + profile.baseAtk * 1.3, "140809 uses form and combat-entry final ATK");
    }
  }
  for (const invalid of [undefined, 0, 1.5, 100]) {
    const input = attackInput(data, attack, 1, attack.multipliers[0], { "phainon-a6-atk-stacks": 1, ...(invalid === undefined ? {} : { "phainon-counter-flame-stacks": invalid }) });
    assert.equal(engine.calculate(input).supported, false, "140809 rejects missing or invalid Flame Reaper stacks: " + invalid);
  }
});

test("140811 supports source-exact Ruin stacks and leaves the 4-stack Lv7-9 discrepancy unresolved", async () => {
  const attack = readJson(attackFile).overrides.find((item) => item.id === "140811");
  const { data, engine } = await loadProductionFixture();
  install(data, attack);
  assert.equal(attack.numericModifierInputs[0].inputKey, "phainon-ruin-stacks");
  assert.equal(attack.numericModifierInputs[0].minimum, 1);
  assert.equal(attack.numericModifierInputs[0].maximum, 4);
  assert.equal(Object.hasOwn(attack.numericModifierInputs[0], "default"), false);
  assert.deepEqual(attack.phainonUnresolvedRuinLevels, [7, 8, 9]);
  for (let level = 1; level <= 10; level += 1) {
    for (const stacks of [1, 2, 3, 4]) {
      const multiplier = attack.phainonRuinMultipliers[String(stacks)][level - 1];
      if (stacks === 4 && [7, 8, 9].includes(level)) {
        assert.equal(multiplier, null, "140811 4 stacks Lv" + level + " remains unresolved rather than choosing a rounded formula");
        continue;
      }
      assert.ok(Number.isFinite(multiplier), "finite source-derived coefficient for Lv" + level + " stacks" + stacks);
      const independent = stacks < 4
        ? stacks * 4 * sourceCurves.ruinPerHit[level - 1]
        : sourceCurves.ruinBase[level - 1] + 16 * sourceCurves.ruinPerHit[level - 1];
      assertClose(multiplier, independent, "140811 independent coefficient Lv" + level + " stacks" + stacks);
      if (stacks === 4) assertClose(multiplier, sourceCurves.ruinMaximum[level - 1], "140811 source maximum Lv" + level);
      const input = attackInput(data, attack, level, multiplier, { "phainon-ruin-stacks": stacks, "phainon-a6-atk-stacks": 1 });
      const result = assertMatchesIndependent(engine, input, "140811 Lv" + level + " stacks" + stacks);
      assertClose(result.breakdown.referenceValue, profile.atk + profile.baseAtk * 1.3, "140811 uses form and combat-entry final ATK");
    }
  }
  const missing = attackInput(data, attack, 1, attack.multipliers[0], { "phainon-a6-atk-stacks": 1 });
  assert.equal(engine.calculate(missing).supported, false, "140811 requires an explicit Ruin stack count");
  const unresolved = attackInput(data, attack, 7, attack.multipliers[6], { "phainon-ruin-stacks": 4, "phainon-a6-atk-stacks": 1 });
  assert.equal(engine.calculate(unresolved).supported, false, "140811 4 stacks Lv7 has no guessed coefficient");
  for (const level of [7, 8, 9]) {
    const literalComponentTotal = sourceCurves.ruinBase[level - 1] + 16 * sourceCurves.ruinPerHit[level - 1];
    assert.notEqual(literalComponentTotal, sourceCurves.ruinMaximum[level - 1], "raw params differ at Lv" + level);
  }
});
