"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fixedSourceSha, loadProductionFixture, attackOf, makeRequest, independentDirectDamage, assertClose, runtime, readJson } = require("./helpers/hsrDirectVerification.cjs");

const skillCurve = [105, 115.5, 126, 136.5, 147, 157.5, 170.63, 183.75, 196.88, 210];
const stanceCurve = [50, 55, 60, 65, 70, 75, 81.25, 87.5, 93.75, 100];
const postUltCurve = [25, 27.5, 30, 32.5, 35, 37.5, 40.625, 43.75, 46.875, 50];
const ultimateAtkCurve = [18, 19.2, 20.4, 21.6, 22.8, 24, 25.5, 27, 28.5, 30];
const totalCurve = skillCurve.map((value, i) => value + stanceCurve[i] + 2 * postUltCurve[i]);
const records = readJson("games/hsr/data/calc/modifiers-1206-1210.json").modifiers;
const attackLevels = readJson("games/hsr/data/calc/attacks-characters-round10.json").overrides.find((item) => item.id === "1206022");
const stateInputs = {
  "sushang-ultimate-buff-active": true,
  "sushang-sword-stance-active": true,
  "sushang-post-ultimate-sword-stance-hits": 2,
  "sushang-sword-stance-stacks": 10
};
const profile = {
  atk: 2764.25, baseAtk: 1111.75, hp: 9876.25, def: 2345.75,
  critRate: 63.5, critDamage: 141.25, damageBonus: 12.75,
  enemyLevel: 82, resistance: 27.5, defenseReduction: 13.25,
  defenseIgnore: 6.75, resistancePenetration: 4.25, takenDamage: 8.5
};

function childRequest(parentInput, component, skillLevel, ultimateLevel) {
  const attack = attackOf(parentInput.data, component.attackId);
  const count = component.count;
  const resolved = {
    ...attack,
    type: component.type,
    attackType: component.type,
    damageFormula: "statMultiplier",
    hitCount: count,
    ...(count > 1 ? { hitCountReference: attack.hitCountInputKey } : {}),
    traceLevel: skillLevel,
    multiplier: component.multipliers[skillLevel - 1],
    target: "single",
    element: "Physical",
    scalingStat: "atk"
  };
  const candidates = runtime.buildCandidates(records, {
    characterId: "1206", eidolon: 0, stats: profile,
    baseStats: { atk: profile.baseAtk, hp: 1000, def: 1000 },
    traceLevelFor: (source) => source.skillId === "120603" ? ultimateLevel : skillLevel
  }, stateInputs).filter((item) => item.enabled && item.calculable && runtime.applicableToAttack(item, resolved));
  return { ...parentInput.base, attack: resolved, modifiers: candidates };
}

function makeSnapshot(data, skillLevel, ultimateLevel) {
  const character = {
    level: 80, eidolon: 0,
    stats: { atk: profile.atk, hp: profile.hp, def: profile.def, critRate: profile.critRate, critDamage: profile.critDamage, damageBonus: profile.damageBonus },
    baseStats: { atk: profile.baseAtk, hp: 1000, def: 1000 }
  };
  const enemy = {
    count: 1, level: profile.enemyLevel, resistance: profile.resistance,
    resistancePenetration: profile.resistancePenetration,
    defenseReduction: profile.defenseReduction, defenseIgnore: profile.defenseIgnore,
    takenDamage: profile.takenDamage, weakness: true, toughnessActive: false
  };
  const attack = {
    ...attackLevels, traceLevel: skillLevel, multiplier: totalCurve[skillLevel - 1],
    attackType: "skill", damageComponents: attackLevels.damageComponents
  };
  const base = { character, enemy, modifierInputs: { ...stateInputs } };
  const parts = attack.damageComponents.map((component) => ({
    key: component.key,
    name: component.name,
    input: childRequest({ data, base }, component, skillLevel, ultimateLevel)
  }));
  return { data, base, request: { ...base, attack, sequenceComponents: parts } };
}

test("Sushang's post-Ultimate Skill + three Sword Stance hits match all Skill/Ultimate level combinations independently", async () => {
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  const { data, engine } = await loadProductionFixture();
  const attack = attackOf(data, "1206022");
  assert.equal(attack.damageFormula, "componentSequence");
  assert.equal(attack.maximumEidolon, 0);
  assert.equal(attack.characterLevelExact, 80);
  assert.equal(attack.enemyCountExact, 1);
  assert.equal(attack.requiresBrokenTarget, true);
  assert.deepEqual(Array.from(attack.damageComponents, (item) => [item.key, item.attackId, item.count]), [
    ["skill", "120602", 1], ["primary", "1206021", 1], ["extra", "1206031", 2]
  ]);
  assert.deepEqual(Array.from(attack.multipliers), totalCurve);
  assert.equal(attack.numericModifierInputs[0].inputKey, "sushang-sword-stance-stacks");
  assert.equal(attack.numericModifierInputs[0].minimum, 10);
  assert.equal(attack.numericModifierInputs[0].maximum, 10);
  assert.equal(Object.hasOwn(attack.numericModifierInputs[0], "default"), false, "the required 10 pre-stacks have no fallback");
  assert.deepEqual(attack.comparisonModifierInputs, stateInputs, "the snapshot assumptions are fixed without extra UI toggles");

  for (let skillLevel = 1; skillLevel <= 10; skillLevel++) {
    for (let ultimateLevel = 1; ultimateLevel <= 10; ultimateLevel++) {
      const snapshot = makeSnapshot(data, skillLevel, ultimateLevel);
      const result = engine.calculate(snapshot.request);
      assert.notEqual(result.supported, false, `Skill Lv${skillLevel}/Ultimate Lv${ultimateLevel}: ${result.reason || "supported"}`);
      let sum = { nonCrit: 0, crit: 0, expected: 0 };
      for (const part of snapshot.request.sequenceComponents) {
        const oracle = independentDirectDamage(part.input);
        const actual = engine.calculate(part.input);
        assert.notEqual(actual.supported, false, `component ${part.key} Skill Lv${skillLevel}/Ultimate Lv${ultimateLevel}`);
        for (const key of ["nonCrit", "crit", "expected"]) {
          assertClose(actual[key], oracle[key] * part.input.attack.hitCount, `${part.key} ${key} Skill Lv${skillLevel}/Ultimate Lv${ultimateLevel}`);
          sum[key] += oracle[key] * part.input.attack.hitCount;
        }
        assertClose(actual.breakdown.referenceValue, oracle.effectiveReferenceValue, `${part.key} ATK reference`);
      }
      for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], sum[key], `total ${key} Skill Lv${skillLevel}/Ultimate Lv${ultimateLevel}`);
      assert.deepEqual(Object.keys(result.components), ["skill", "primary", "extra"]);
      assertClose(result.components.extra.attack.hitCount, 2, "two additional proc hits are summed");
      assertClose(result.components.extra.breakdown.damageBonus, profile.damageBonus + 25, "逐寇 saturated bonus applies only to Sword Stance components");
      assertClose(result.components.skill.breakdown.damageBonus, profile.damageBonus, "Sword Stance bonus does not leak to the Skill body");
      const buff = ultimateAtkCurve[ultimateLevel - 1];
      assertClose(result.components.skill.breakdown.referenceValue, profile.atk + profile.baseAtk * buff / 100, "Ultimate level independently sets the active ATK buff");
      assert.equal(result.breakdown.totalLabel, "戦闘スキル本体＋剣勢1回＋必殺後追加剣勢2回の合計");
    }
  }
});

test("Sushang composite rejects missing or non-saturated prior Sword Stance layers locally", async () => {
  const { data, engine } = await loadProductionFixture();
  const snapshot = makeSnapshot(data, 10, 10);
  for (const stacks of [undefined, 0, 9, 11]) {
    const modifierInputs = { ...stateInputs };
    if (stacks === undefined) delete modifierInputs["sushang-sword-stance-stacks"];
    else modifierInputs["sushang-sword-stance-stacks"] = stacks;
    const result = engine.calculate({ ...snapshot.request, modifierInputs });
    assert.equal(result.supported, false, `stacks=${stacks} is not the required explicitly selected 10-layer snapshot`);
  }
  assert.notEqual(engine.calculate(snapshot.request).supported, false, "the valid 10-layer case remains calculable");
});
