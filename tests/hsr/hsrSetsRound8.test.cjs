"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProductionFixture, attackOf, makeRequest, assertClose, runtime } = require("./helpers/hsrDirectVerification.cjs");
const stateApi = require("../../games/js/hsrCalcState.js");
const records = require("../../games/hsr/data/calc/modifiers-sets-round8.json").modifiers;

const baseId = "relic:129:4pc:elation-defense-ignore-base";
const stacksId = "relic:129:4pc:elation-defense-ignore-earned-punchline";
const critId = "relic:129:2pc:crit-damage-final";
const skills = [20,22,24,26,28,30,32.5,35,37.5,40];
const ults = [36,39.6,43.2,46.8,50.4,54,58.5,63,67.5,72];

function relicCandidates(stackCount, options = {}) {
  const inputs = {
    [records.find(item => item.id === stacksId).activation.inputKey]: stackCount,
    [records.find(item => item.id === baseId).finalStatsInclusion.inputKey]: Boolean(options.baseIncluded),
    [records.find(item => item.id === stacksId).finalStatsInclusion.inputKey]: Boolean(options.stacksIncluded)
  };
  const context = {
    characterId: "1513", eidolon: 0, relicIds: options.relicIds ?? ["129"], relicMode: options.relicMode ?? 4,
    stats: { elation: 137.5, atk: 3181.5, hp: 9732.25, def: 2176.75, critRate: 37.5, critDamage: 143.75 }
  };
  return { candidates: runtime.buildCandidates(records, context, inputs), inputs, context };
}

function elationRequest(data, level, modifiers = []) {
  const input = makeRequest(attackOf(data, "1513042"), level, {
    characterLevel: 80, eidolon: 0, atk: 3181.5, hp: 9732.25, def: 2176.75,
    critRate: 37.5, critDamage: 143.75, damageBonus: 73.25,
    enemyLevel: 91, enemyCount: 1, resistance: 31.5, defenseReduction: 13,
    defenseIgnore: 8, resistancePenetration: 9, takenDamage: 17
  }, modifiers);
  input.character.stats.elation = 137.5;
  input.elation = { context: "certifiedBanger", certifiedBanger: 40, punchline: 99999, fervor: 29, merrymake: 23.5 };
  return input;
}

function independentBaseline(input) {
  const level = input.attack.traceLevel;
  const coefficient = ults[level - 1];
  const banger = input.elation.certifiedBanger;
  const defense = 100 / (100 + 111 * (1 - 0.13 - 0.08));
  return 7535.107 * coefficient / 100 * 2.375 * (1 + 5 * banger / (banger + 240)) * 1.235 * defense * 0.775 * 0.9 * 1.17;
}

function defenseRatio(ignorePercent) {
  const without = 100 / (100 + 111 * (1 - 0.13 - 0.08));
  const withIgnore = 100 / (100 + 111 * (1 - 0.13 - 0.08 - ignorePercent / 100));
  return withIgnore / without;
}

test("Round8 relic 129 uses the fixed 2-piece final-stat policy and wearer-only 4-piece inputs", () => {
  const two = records.find(item => item.id === critId);
  const base = records.find(item => item.id === baseId);
  const stacks = records.find(item => item.id === stacksId);
  assert.equal(two.inputPolicy, "includedInFinalStats");
  assert.equal(two.value.fixed, 16);
  for (const record of [base, stacks]) {
    assert.equal(record.source.kind, "relic");
    assert.equal(record.source.id, "129");
    assert.equal(record.source.setPieces, 4);
    assert.equal(record.target.owner, "self");
    assert.deepEqual(Array.from(record.target.attackTypes), ["elation"]);
    assert.equal(record.finalStatsInclusion.inputKey.length > 0, true);
  }
  assert.equal(base.value.fixed, 10);
  assert.equal(stacks.value.perStack, 1);
  assert.equal(stacks.activation.minimum, 0);
  assert.equal(stacks.activation.maximum, 10);
  assert.match(stacks.description, /現在所持している爆笑ネタから獲得累計を推測せず/);
  assert.match(stacks.description, /精霊.*対象外/);
  assert.equal(runtime.resolveValue(stacks, {}, { [stacks.activation.inputKey]: 0 }), 0);
  for (const [count, expected] of [[1,1],[5,5],[10,10],[11,10],[20,10]]) {
    assert.equal(runtime.resolveValue(stacks, {}, { [stacks.activation.inputKey]: count }), expected);
  }
});

test("Round8 relic 129 only applies when the wearer attacks with Elation and only when equipped", () => {
  const { candidates } = relicCandidates(5);
  const base = candidates.find(item => item.id === baseId);
  const stacks = candidates.find(item => item.id === stacksId);
  assert.ok(base?.enabled && base.applicable && base.value === 10);
  assert.ok(stacks?.enabled && stacks.applicable && stacks.value === 5);
  assert.equal(runtime.applicableToAttack(base, { type: "elation", element: "Quantum" }), true);
  assert.equal(runtime.applicableToAttack(base, { type: "ultimate", element: "Quantum" }), false);
  assert.equal(runtime.applicableToAttack(stacks, { type: "normal", element: "Quantum" }), false);
  assert.equal(relicCandidates(5, { relicIds: [] }).candidates.length, 0, "unequipping removes both 4-piece effects");
  const twoPieceCandidates = relicCandidates(5, { relicMode: 2 }).candidates;
  assert.deepEqual(twoPieceCandidates.map(item => item.id), [critId], "2-piece mode exposes only the final-stat notice");
  const twoPiece = runtime.buildCandidates([records.find(item => item.id === critId)], {
    characterId: "1513", eidolon: 0, relicIds: ["129"], relicMode: 2, stats: { critDamage: 143.75 }
  }, {});
  assert.equal(twoPiece.length, 1);
  assert.equal(twoPiece[0].calculable, false, "2-piece CD is represented by final input and never added again");
});

test("Round8 relic 129 stack values survive app save/restore and final-stat inclusion prevents duplicate DEF ignore", () => {
  const savedInputs = {
    [records.find(item => item.id === stacksId).activation.inputKey]: 7,
    [records.find(item => item.id === baseId).finalStatsInclusion.inputKey]: false,
    [records.find(item => item.id === stacksId).finalStatsInclusion.inputKey]: false
  };
  const defaults = { enemy: {}, conditions: [], modifierInputs: {}, party: [], traceLevels: {}, source: "manual", relicMode: "4pc", enhancementState: "previous", attackerPosition: 1 };
  const snapshot = stateApi.create({ ...defaults, modifierInputs: savedInputs });
  const storage = { value: "", setItem(_key, value) { this.value = value; }, getItem() { return this.value; } };
  assert.equal(stateApi.save(storage, snapshot), true);
  const restoredState = stateApi.restore(stateApi.load(storage).value, defaults, { characters: [{ id: "1513" }], lightCones: [], relicSets: [{ id: "129" }] }, []);
  const restoredInputs = restoredState.state.modifierInputs;
  const context = { characterId: "1513", eidolon: 0, relicIds: ["129"], relicMode: 4, stats: { elation: 137.5 } };
  const restored = runtime.buildCandidates(records, context, restoredInputs);
  assert.equal(restored.find(item => item.id === stacksId).value, 7);
  assert.equal(restored.find(item => item.id === baseId).enabled, true);
  const includedInputs = { ...restoredInputs,
    [records.find(item => item.id === baseId).finalStatsInclusion.inputKey]: true,
    [records.find(item => item.id === stacksId).finalStatsInclusion.inputKey]: true
  };
  const included = runtime.buildCandidates(records, context, includedInputs);
  for (const id of [baseId, stacksId]) {
    const candidate = included.find(item => item.id === id);
    assert.equal(candidate.includedInFinalStats, true);
    assert.equal(candidate.enabled, false);
  }
});

test("Round8 relic 129 independent defense formula matches all Elation Ultimate levels and stack boundaries", async () => {
  const { data, engine } = await loadProductionFixture();
  for (let level = 1; level <= 10; level++) {
    const baseline = independentBaseline(elationRequest(data, level));
    const noSet = engine.calculate(elationRequest(data, level));
    assertClose(noSet.nonCrit, baseline, "independent unmodified Elation baseline Lv" + level);
    for (const stacks of [0, 1, 5, 10]) {
      const { candidates } = relicCandidates(stacks);
      const applied = candidates.filter(item => item.enabled && item.applicable && item.calculable);
      const request = elationRequest(data, level, applied);
      const result = engine.calculate(request);
      const expected = baseline * defenseRatio(10 + stacks);
      assert.notEqual(result.supported, false, "Elation Lv" + level + " earned stacks=" + stacks);
      assertClose(result.nonCrit, expected, "independent defense-ignore result Lv" + level + " stacks=" + stacks);
      assertClose(result.crit, expected * 2.4375, "independent CRIT result Lv" + level + " stacks=" + stacks);
      assertClose(result.expected, expected * (1 + 0.375 * 1.4375), "independent EV result Lv" + level + " stacks=" + stacks);
    }
  }
});
