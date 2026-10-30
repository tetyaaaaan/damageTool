const test = require("node:test");
const assert = require("node:assert/strict");
const {
  fixedSourceSha, loadProductionFixture, attackOf, makeRequest,
  independentDirectDamage, assertClose, runtime, readJson
} = require("./helpers/hsrDirectVerification.cjs");

const sushang = {
  "120601": [50, 60, 70, 80, 90, 100],
  "120602": [105, 115.5, 126, 136.5, 147, 157.5, 170.63, 183.75, 196.88, 210],
  "1206021": [50, 55, 60, 65, 70, 75, 81.25, 87.5, 93.75, 100],
  "120603": [192, 204.8, 217.6, 230.4, 243.2, 256, 272, 288, 304, 320],
  "1206031": [25, 27.5, 30, 32.5, 35, 37.5, 40.625, 43.75, 46.875, 50]
};
const misha = {
  "131201": [50, 60, 70, 80, 90, 100],
  "131202": [100, 110, 120, 130, 140, 150, 162.5, 175, 187.5, 200],
  "131203": [36, 38.4, 40.8, 43.2, 45.6, 48, 51, 54, 57, 60],
  "1312032": [18, 19.2, 20.4, 21.6, 22.8, 24, 25.5, 27, 28.5, 30]
};
const profile = {
  atk: 3127.25, hp: 9876.25, def: 2345.75, baseAtk: 1024.5,
  critRate: 53.25, critDamage: 117.5, damageBonus: 18.75,
  enemyLevel: 82, resistance: 27.5, defenseReduction: 12.25,
  defenseIgnore: 7.5, resistancePenetration: 6.25, takenDamage: 11.5
};
const characterRecords = readJson("games/hsr/data/calc/modifiers-1206-1210.json").modifiers;
const mishaRecords = readJson("games/hsr/data/calc/modifiers-character-expanded.json").modifiers.filter(item => item.source?.id === "1312");

function compareDirect(engine, attack, level, modifiers, hitCount = 1) {
  const input = makeRequest(attack, level, profile, modifiers);
  input.modifierInputs = {"sushang-sword-stance-stacks": 10};
  const actual = engine.calculate({ ...input, attack: { ...input.attack, hitCount, ...(attack.hitCountInputKey ? { hitCountReference: attack.hitCountInputKey } : {}) } });
  assert.notEqual(actual.supported, false, attack.id + " Lv" + level + " must calculate");
  const oneHitOracle = independentDirectDamage({ ...input, attack: { ...input.attack, multiplier: attack.multipliers[level - 1], hitCount: 1 } });
  for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], oneHitOracle[key] * hitCount, attack.id + " Lv" + level + " " + key);
  assertClose(actual.breakdown.referenceValue, oneHitOracle.effectiveReferenceValue, attack.id + " ATK reference");
  return actual;
}

test("Sushang's E0 Basic, Skill, Sword Stance, Ultimate and two post-Ultimate procs match independent curves", async () => {
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  const { data, engine } = await loadProductionFixture();
  const round10 = readJson("games/hsr/data/calc/attacks-characters-round10.json").overrides[0];
  const attacks = Object.fromEntries(Object.keys(sushang).map(id => [id, id === "1206031" ? { ...attackOf(data, id), ...round10 } : attackOf(data, id)]));
  for (const [id, curve] of Object.entries(sushang)) {
    const attack = attacks[id];
    assert.equal(attack.characterId, "1206");
    assert.equal(attack.support.status, "calculable");
    assert.equal(attack.scalingStat, "atk");
    assert.deepEqual(Array.from(attack.multipliers).slice(0, curve.length), curve, id + " fixed-source curve");
    const levels = id === "120601" ? 6 : 10;
    for (let level = 1; level <= levels; level++) {
      const hitCounts = id === "1206031" ? [0, 1, 2] : [1];
      const stateInputs = id === "1206021"
        ? { "sushang-sword-stance-active": true, "sushang-sword-stance-stacks": 4 }
        : id === "1206031" ? { "sushang-ultimate-buff-active": true, "sushang-sword-stance-stacks": 10 } : {};
      const allCandidates = runtime.buildCandidates(characterRecords, {
        characterId: "1206", eidolon: 0, stats: { ...profile, speed: 100 },
        baseStats: { atk: profile.baseAtk, hp: 1000, def: 1000 },
        traceLevelFor: source => source.skillId === "120603" ? level : level
      }, stateInputs);
      const relevant = allCandidates.filter(item => item.enabled && item.calculable && runtime.applicableToAttack(item, attack));
      for (const expectedHits of hitCounts) {
      const output = compareDirect(engine, attack, level, relevant, expectedHits, stateInputs);
      if (id === "1206021" || (id === "1206031" && expectedHits === 1)) {
        const noStacks = runtime.buildCandidates(characterRecords, {
          characterId: "1206", eidolon: 0, stats: { ...profile, speed: 100 },
          baseStats: { atk: profile.baseAtk, hp: 1000, def: 1000 }, traceLevelFor: () => level
        }, { ...stateInputs, "sushang-sword-stance-stacks": 0 })
          .filter(item => item.enabled && item.calculable && runtime.applicableToAttack(item, attack));
        const noStacksOutput = compareDirect(engine, attack, level, noStacks, expectedHits, { ...stateInputs, "sushang-sword-stance-stacks": 0 });
        assert.ok(output.expected > noStacksOutput.expected, id + " gains only its realized Sword Stance stack bonus");
      }
      }
    }
  }

  const procState = characterRecords.find(item => item.id === "trace:1206:120602:sword-stance");
  const swordBonus = characterRecords.find(item => item.id === "traceNode:1206:1206102:sword-stance");
  for (const active of [false, true]) {
    const inputs = { "sushang-sword-stance-active": active, "sushang-sword-stance-stacks": 3 };
    const ctx = { characterId: "1206", eidolon: 0, stats: { atk: profile.atk }, traceLevelFor: () => 10 };
    const selection = runtime.buildCandidates([procState], ctx, inputs)[0];
    assert.equal(selection.activation.active, active, "Sword Stance proc state is explicitly selected");
    const candidate = runtime.buildCandidates([swordBonus], ctx, inputs)[0];
    assert.equal(candidate.value, 7.5, "three stacks contribute 3×2.5% only to additional damage");
  }
  assert.equal(attacks["1206031"].hitCountDefault, undefined, "unknown proc count is not silently defaulted");
  assert.equal(attacks["1206031"].hitCountMinimum, 0);
  assert.equal(attacks["1206031"].hitCountMaximum, 2);

  const ultAtk = characterRecords.find(item => item.id === "trace:1206:120603:atk");
  const off = runtime.buildCandidates([ultAtk], { characterId: "1206", eidolon: 0, traceLevelFor: () => 10 }, {});
  const on = runtime.buildCandidates([ultAtk], { characterId: "1206", eidolon: 0, traceLevelFor: () => 10 }, { "sushang-ultimate-buff-active": true });
  assert.equal(off[0].enabled, false);
  assert.equal(on[0].enabled, true);
  assert.equal(on[0].value, 30);
  const skill = attacks["120602"];
  const before = compareDirect(engine, skill, 10, []);
  const after = compareDirect(engine, skill, 10, on.filter(item => runtime.applicableToAttack(item, skill)));
  assert.ok(after.expected > before.expected, "the realized Ultimate ATK buff changes Skill damage");
});

test("Misha's E0 single-enemy attacks and selected 3–10 hit Ultimate match fixed curves without proc-order simulation", async () => {
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  const { data, engine } = await loadProductionFixture();
  for (const [id, curve] of Object.entries(misha)) {
    const attack = attackOf(data, id);
    assert.equal(attack.characterId, "1312");
    assert.equal(attack.support.status, "calculable");
    assert.equal(attack.scalingStat, "atk");
    assert.deepEqual(Array.from(attack.multipliers).slice(0, curve.length), curve, id + " fixed-source curve");
    const levelCount = id === "131201" ? 6 : 10;
    for (let level = 1; level <= levelCount; level++) {
      const hitCounts = id === "131203" ? [3, 4, 7, 10] : [attack.hitCount || 1];
      for (const hitCount of hitCounts) compareDirect(engine, attack, level, [], hitCount);
    }
  }

  const ultimate = attackOf(data, "131203");
  assert.equal(ultimate.enemyCountExact, 1);
  assert.equal(ultimate.modifierInputKey, "misha-prefrozen-ultimate");
  assert.equal(ultimate.hitCountInputKey, "misha-ultimate-hits");
  assert.equal(ultimate.requiresNonWeakTarget, true);
  assert.equal(ultimate.requiredToughnessActive, true);
  const prefrozen = runtime.buildCandidates(mishaRecords, {
    characterId: "1312", eidolon: 0, stats: { ...profile, speed: 100 },
    enemy: { hpPercent: 75, weakness: true }, traceLevelFor: () => 10
  }, { "misha-prefrozen-ultimate": true, "misha-ultimate-hits": 10 });
  assert.equal(prefrozen.find(item => item.id === "trace:1312:131203:prefrozen-ultimate").activation.active, true);
  assert.equal(prefrozen.find(item => item.id === "trace:1312:131203:hit-count").activation.inputValue, 10, "hit count is a selected attack property, not added damage");

  const frozenCrit = mishaRecords.find(item => item.id === "traceNode:1312:1312103:frozen-critical-damage");
  assert.ok(frozenCrit, "frozen-target A6 modifier exists");
  const off = runtime.buildCandidates([frozenCrit], { characterId: "1312", eidolon: 0, stats: { ...profile, speed: 100 } }, {});
  assert.equal(off[0].enabled, false);
  const on = runtime.buildCandidates([frozenCrit], { characterId: "1312", eidolon: 0, stats: { ...profile, speed: 100 } }, { [frozenCrit.activation.inputKey]: true });
  assert.equal(on[0].enabled, true);
  assert.equal(on[0].value, 30);
  for (const id of ["131201", "131202", "131203"]) {
    const attack = attackOf(data, id);
    const relevant = on.filter(item => runtime.applicableToAttack(item, attack));
    assert.equal(relevant.length, 1, id + " receives frozen-target CD once");
    const hitCounts = id === "131203" ? [3, 10] : [attack.hitCount || 1];
    for (let level = 1; level <= attack.maximumTraceLevel; level++) for (const hits of hitCounts) {
      const base = compareDirect(engine, attack, level, [], hits);
      const withCritDamage = compareDirect(engine, attack, level, relevant, hits);
      assertClose(withCritDamage.nonCrit, base.nonCrit, id + " A6 does not change noncrit");
      assert.ok(withCritDamage.crit > base.crit, id + " A6 changes crit only");
    }
  }
  assert.equal(runtime.applicableToAttack(on[0], attackOf(data, "1312032")), false, "post-freeze additional component is not included in the prehit frozen trace scope");
  assert.equal(runtime.applicableToAttack(on[0], { id: "121001", type: "normal", element: "Fire" }), false);
});
