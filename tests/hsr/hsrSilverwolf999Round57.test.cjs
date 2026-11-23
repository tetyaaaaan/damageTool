"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  loadProductionFixture,
  attackOf,
  assertClose
} = require("./helpers/hsrDirectVerification.cjs");
const runtime = require("../../games/js/hsrModifierRuntime.js");
const round52Modifiers = require("../../games/hsr/data/calc/modifiers-v47-round52.json").modifiers;

const character = {
  id: "1506", level: 80, eidolon: 0,
  stats: {
    atk: 3172.5, hp: 6841, def: 1234.5,
    critRate: 61.25, critDamage: 173.5, damageBonus: 23.75,
    elation: 146.25, merrymake: 7.5
  },
  baseStats: {}
};
const enemy = {
  count: 1, level: 83, resistance: 27.5, weakness: false, toughnessActive: true,
  defenseReduction: 13.25, defenseIgnore: 5, resistancePenetration: 8.5, takenDamage: 11.75
};
const normalCurve = [170, 204, 238, 272, 306, 340];
const boxCurve = [45, 49.5, 54, 58.5, 63, 67.5, 73.12, 78.75, 84.38, 90];
const scoreKey = "silver-wolf-secret-score";

function modifierSum(modifiers, category) {
  return modifiers.filter((item) => item.category === category && item.enabled !== false && item.applicable !== false)
    .reduce((sum, item) => sum + Number(item.value || 0), 0);
}

function independentCommon(target, modifiers = []) {
  const defenseReduction = target.defenseReduction + modifierSum(modifiers, "defenseReduction");
  const defenseIgnore = target.defenseIgnore + modifierSum(modifiers, "defenseIgnore");
  const defense = (80 + 20) / ((80 + 20) + (target.level + 20) * (1 - (defenseReduction + defenseIgnore) / 100));
  const resistance = 1 - (target.resistance - target.resistancePenetration
    - modifierSum(modifiers, "resistancePenetration") - modifierSum(modifiers, "resistanceReduction")) / 100;
  const toughness = target.toughnessActive ? 0.9 : 1;
  const vulnerability = 1 + (target.takenDamage + modifierSum(modifiers, "takenDamage")) / 100;
  return defense * resistance * toughness * vulnerability;
}

function scoreFactor(score) {
  return 1 + 0.15 * Math.min(2, Math.floor(score / 60));
}

function independentDirect(multiplierPercent, score, owner = character, target = enemy, modifiers = []) {
  const nonCrit = owner.stats.atk * multiplierPercent / 100
    * (1 + (owner.stats.damageBonus + modifierSum(modifiers, "damageBonus")) / 100)
    * scoreFactor(score)
    * independentCommon(target, modifiers);
  const critMultiplier = 1 + owner.stats.critDamage / 100;
  const expectedMultiplier = 1 + owner.stats.critRate / 100 * (critMultiplier - 1);
  return { nonCrit, crit: nonCrit * critMultiplier, expected: nonCrit * expectedMultiplier };
}

function independentElation(multiplierPercent, cb, score, owner = character, target = enemy, modifiers = []) {
  const punchline = 1 + 5 * cb / (cb + 240);
  const nonCrit = 7535.107 * multiplierPercent / 100
    * scoreFactor(score)
    * (1 + (owner.stats.elation + modifierSum(modifiers, "elation")) / 100)
    * punchline
    * (1 + owner.stats.merrymake / 100)
    * independentCommon(target, modifiers);
  const critMultiplier = 1 + owner.stats.critDamage / 100;
  const expectedMultiplier = 1 + owner.stats.critRate / 100 * (critMultiplier - 1);
  return { nonCrit, crit: nonCrit * critMultiplier, expected: nonCrit * expectedMultiplier };
}

function ascensionCandidate(parentAttack, { world = true, finalIncluded = false, ahaPresent = true, ahaEidolon = 0 } = {}) {
  const record = round52Modifiers.find((item) => item.id === "v47:trace:1506:150629:crit-damage");
  const item = runtime.buildCandidates([record], {
    characterId: "1506", eidolon: 0, partyIds: ahaPresent ? ["1506", "1511"] : ["1506"],
    partyEidolons: ahaPresent ? { "1511": ahaEidolon } : {},
    attack: { id: "1506084", type: "enhancedNormal", element: "Imaginary" }
  }, {
    "aha-world-active": world,
    "silver-wolf-ascension-cd-in-final": finalIncluded
  })[0];
  return item && { ...item, applicable: runtime.applicableToAttack(item, parentAttack) };
}

function request(data, normalLevel, ultimateLevel, state = {}) {
  const outer = attackOf(data, "1506084");
  const cb = state.cb ?? 0;
  const score = state.score ?? 240;
  const owner = structuredClone(state.character || character);
  const target = structuredClone(state.enemy || enemy);
  const modifiers = structuredClone(state.modifiers || []);
  const modifierInputs = {
    "elation-certified-banger": cb,
    [scoreKey]: score,
    "silver-wolf-sword-box-count": Object.hasOwn(state, "swordBoxes") ? state.swordBoxes : 0,
    "silver-wolf-no-break-confirmed": Object.hasOwn(state, "noBreakConfirmed") ? state.noBreakConfirmed : 1,
    "silver-wolf-state-stable-confirmed": Object.hasOwn(state, "stateStableConfirmed") ? state.stateStableConfirmed : 1,
    "silver-wolf-ascension-cd-in-final": state.finalIncluded === true
  };
  const shotId = cb === 0 ? "1506083" : "1506085";
  const shot = attackOf(data, shotId);
  const boxes = attackOf(data, "1506086");
  const componentInput = (source, level) => ({
    character: structuredClone(owner), enemy: structuredClone(target),
    modifiers: structuredClone(modifiers), modifierInputs: structuredClone(modifierInputs),
    elation: { context: "certifiedBanger", certifiedBanger: cb, merrymake: owner.stats.merrymake },
    attack: {
      ...source,
      traceLevel: level,
      multiplier: source.multipliers[level - 1],
      attackType: source.type
    }
  });
  return {
    character: owner,
    enemy: target,
    modifiers,
    modifierInputs,
    elation: { context: "ahaInstant", punchline: 0, merrymake: owner.stats.merrymake },
    attack: {
      ...outer,
      traceLevel: normalLevel,
      ultimateTraceLevel: ultimateLevel,
      multiplier: outer.multipliers[normalLevel - 1],
      attackType: outer.type
    },
    sequenceComponents: [
      { key: "shots", name: "100段＋最後撃", input: componentInput(shot, normalLevel) },
      { key: "boxes", name: "エッグ箱3個", input: componentInput(boxes, ultimateLevel) }
    ]
  };
}

test("Round57 Silver Wolf definitions pin the fixed 4.7 two-branch and Egg-only sequence", async () => {
  const { data } = await loadProductionFixture();
  const attack = attackOf(data, "1506084");
  assert.equal(attack.characterId, "1506");
  assert.equal(attack.type, "enhancedNormal");
  assert.equal(attack.damageFormula, "componentSequence");
  assert.deepEqual(attack.damageComponents.map((part) => [part.key, part.attackId]), [
    ["shots", "1506085"], ["boxes", "1506086"]
  ]);
  for (const [id, scalingStat, formula, curve, hitCount] of [
    ["1506083", "atk", "statMultiplier", normalCurve, 101],
    ["1506085", "elation", "elation", normalCurve, 101],
    ["1506086", "elation", "elation", boxCurve.map((value) => value * 3), 3]
  ]) {
    const record = attackOf(data, id);
    assert.equal(record.characterId, "1506");
    assert.equal(record.scalingStat, scalingStat);
    assert.equal(record.damageFormula, formula);
    assert.equal(record.hitCount, hitCount);
    assert.deepEqual(record.multipliers, curve);
    assert.equal(record.silverWolfEggOnly, true);
    assert.equal(record.provenance.sourceCommit, "03907e798b46f9eb109a1f882055cdf49ce3d374");
  }
});

test("Round57 CB=0 ATK shots and CB-positive Elation shots plus Egg boxes match an independent oracle at all N/U levels", async () => {
  const { data, engine } = await loadProductionFixture();
  for (const cb of [0, 4873]) {
    const score = 240;
    for (let normalLevel = 1; normalLevel <= 6; normalLevel++) {
      for (let ultimateLevel = 1; ultimateLevel <= 10; ultimateLevel++) {
        const input = request(data, normalLevel, ultimateLevel, { cb, score });
        const result = engine.calculate(input);
        const shotsExpected = cb === 0
          ? independentDirect(normalCurve[normalLevel - 1], score)
          : independentElation(normalCurve[normalLevel - 1], cb, score);
        const boxesExpected = independentElation(3 * boxCurve[ultimateLevel - 1], cb, score);
        assert.notEqual(result.supported, false, `CB${cb} N${normalLevel}/U${ultimateLevel}: ${result.reason || ""}`);
        assert.equal(result.components.shots.attack.hitCount, 101);
        assert.equal(result.components.boxes.attack.hitCount, 3);
        for (const key of ["nonCrit", "crit", "expected"]) {
          assertClose(result.components.shots[key], shotsExpected[key], `CB${cb} shots N${normalLevel} ${key}`);
          assertClose(result.components.boxes[key], boxesExpected[key], `CB${cb} boxes U${ultimateLevel} ${key}`);
          assertClose(result[key], shotsExpected[key] + boxesExpected[key], `CB${cb} total N${normalLevel}/U${ultimateLevel} ${key}`);
        }
        if (cb === 0) {
          assert.equal(result.components.shots.attack.scalingStat, "atk");
          assertClose(result.components.shots.perHit.nonCrit, shotsExpected.nonCrit / 101, "CB0 average shot value uses ATK");
          assert.equal(result.components.shots.breakdown.damageFormula, "statMultiplier");
          assertClose(result.components.shots.breakdown.silverWolfScoreFactor, scoreFactor(score), "CB0 branch exposes the fixed score multiplier");
        } else {
          assert.equal(result.components.shots.attack.scalingStat, "elation");
          assert.equal(result.components.shots.breakdown.elationComponents.length, 2);
          assert.equal(result.components.shots.breakdown.elationComponents[0].count, 100);
          assert.equal(result.components.shots.breakdown.elationComponents[1].count, 1);
          assertClose(result.components.shots.breakdown.skill11BaseMultiplier, scoreFactor(score), "CB branch uses the same fixed score multiplier");
        }
        assert.equal(result.components.boxes.breakdown.elationComponents.length, 1);
        assert.equal(result.components.boxes.breakdown.elationComponents[0].count, 3);
        assertClose(result.components.boxes.breakdown.elationComponents[0].multiplierPercent, boxCurve[ultimateLevel - 1], "one Egg box coefficient remains individually inspectable");
      }
    }
  }
});

test("Round57 fixed score factor changes only the confirmed bounded state and preserves CB0 Egg boxes", async () => {
  const { data, engine } = await loadProductionFixture();
  const parent = attackOf(data, "1506084");
  for (const score of [60, 119, 120, 240]) {
    const input = request(data, 6, 10, { cb: 0, score });
    const result = engine.calculate(input);
    const shots = independentDirect(normalCurve[5], score);
    const boxes = independentElation(3 * boxCurve[9], 0, score);
    assert.notEqual(result.supported, false, `score ${score}: ${result.reason || ""}`);
    assertClose(result.components.shots.nonCrit, shots.nonCrit, `score ${score} normal branch`);
    assertClose(result.components.boxes.nonCrit, boxes.nonCrit, `score ${score} forced Egg boxes still calculate with CB=0`);
    assertClose(result.components.shots.breakdown.silverWolfScoreFactor, scoreFactor(score), `score ${score} explicit score factor`);
  }
  for (const score of [0, 59]) {
    const invalid = engine.calculate(request(data, 6, 10, { cb: 0, score }));
    assert.equal(invalid.supported, false, `score ${score} cannot be silently treated as Egg-only skill11 state`);
  }

  const active = ascensionCandidate(parent, { world: true, ahaPresent: true, ahaEidolon: 0 });
  assert.ok(active);
  assert.equal(active.enabled, true);
  assert.equal(active.value, 40);
  const activeInput = request(data, 6, 10, { cb: 0, score: 360, modifiers: [active] });
  const activeResult = engine.calculate(activeInput);
  assert.notEqual(activeResult.supported, false, activeResult.reason || "");
  const cdOwner = structuredClone(character);
  cdOwner.stats.critDamage += 40;
  const activeExpected = independentDirect(340, 360, cdOwner);
  assertClose(activeResult.components.shots.expected, activeExpected.expected, "active E0 Aha permits the 360 score cap on the ATK branch");
  assertClose(activeResult.components.shots.breakdown.silverWolfScoreFactor, 1.3, "360 cap remains capped at 1.3");

  for (const inactiveState of [
    { world: false, ahaPresent: true, ahaEidolon: 0 },
    { world: true, ahaPresent: false },
    { world: true, ahaPresent: true, ahaEidolon: 1 }
  ]) {
    const candidate = ascensionCandidate(parent, inactiveState);
    assert.ok(candidate);
    assert.equal(candidate.enabled, false);
    const invalid = engine.calculate(request(data, 6, 10, { cb: 0, score: 360, modifiers: [candidate] }));
    assert.equal(invalid.supported, false, "inactive ascension cannot authorize score 360");
  }
});

test("Round57 guards reject missing or mismatched owner/state locally without blocking the unrelated normal hit", async () => {
  const { data, engine } = await loadProductionFixture();
  const valid = request(data, 6, 10, { cb: 0, score: 240 });
  assert.notEqual(engine.calculate(valid).supported, false);
  const mutations = [
    ["missing CB", (x) => { delete x.modifierInputs["elation-certified-banger"]; }],
    ["CB below the accepted range", (x) => { x.modifierInputs["elation-certified-banger"] = -1; }],
    ["missing score", (x) => { delete x.modifierInputs[scoreKey]; }],
    ["missing Egg identity", (x) => { delete x.modifierInputs["silver-wolf-sword-box-count"]; }],
    ["non-Egg box", (x) => { x.modifierInputs["silver-wolf-sword-box-count"] = 1; }],
    ["unconfirmed no-break state", (x) => { x.modifierInputs["silver-wolf-no-break-confirmed"] = 0; }],
    ["unconfirmed stable state", (x) => { x.modifierInputs["silver-wolf-state-stable-confirmed"] = 0; }],
    ["wrong owner", (x) => { x.character.id = "1505"; x.sequenceComponents.forEach((p) => { p.input.character.id = "1505"; }); }],
    ["component owner mismatch", (x) => { x.sequenceComponents[0].input.character.id = "1505"; }],
    ["component enemy mismatch", (x) => { x.sequenceComponents[1].input.enemy.level -= 1; }],
    ["wrong normal level", (x) => { x.sequenceComponents[0].input.attack.traceLevel = 5; }],
    ["wrong ultimate level", (x) => { x.sequenceComponents[1].input.attack.traceLevel = 9; }]
  ];
  for (const [label, mutate] of mutations) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    assert.equal(engine.calculate(invalid).supported, false, label + " is rejected");
  }
  const ordinary = attackOf(data, "150601");
  const unrelated = engine.calculate({
    character: structuredClone(character), enemy: structuredClone(enemy),
    attack: { ...ordinary, traceLevel: 6, multiplier: ordinary.multipliers[5], attackType: ordinary.type },
    modifierInputs: { "elation-certified-banger": 0 }
  });
  assert.notEqual(unrelated.supported, false, "invalid Egg/score state is local to the special sequence");

  const highAtk = structuredClone(character);
  highAtk.stats.atk *= 2;
  const baseResult = engine.calculate(request(data, 6, 10, { cb: 0, score: 240 }));
  const highAtkResult = engine.calculate(request(data, 6, 10, { cb: 0, score: 240, character: highAtk }));
  assertClose(highAtkResult.components.shots.nonCrit, baseResult.components.shots.nonCrit * 2, "CB0 shots use ATK");
  assertClose(highAtkResult.components.boxes.nonCrit, baseResult.components.boxes.nonCrit, "CB0 Egg boxes remain Elation-scaled");
});

test("Round57 scoped modifiers follow the selected CB branch, switch off cleanly, and reject a different attack ID", async () => {
  const { data, engine } = await loadProductionFixture();
  const scoped = [
    { id: "round57:enhanced-normal-only-damage", category: "damageBonus", value: 30,
      target: { owner: "self", attackTypes: ["normal", "enhancedNormal"] } },
    { id: "round57:elation-only-elation", category: "elation", value: 20,
      target: { owner: "self", attackTypes: ["elation"] } },
    { id: "round57:shared-defense-ignore", category: "defenseIgnore", value: 15,
      target: { owner: "self", attackTypes: ["all"] } }
  ].map((modifier) => ({ ...modifier, enabled: true, applicable: true, calculable: true, support: { status: "calculable" } }));
  const attackIdOnly = {
    id: "round57:wrong-attack-id-damage", category: "damageBonus", value: 999,
    enabled: true, applicable: true, calculable: true, support: { status: "calculable" },
    target: { owner: "self", attackIds: ["150601"], attackTypes: ["normal", "enhancedNormal", "elation"] }
  };
  const matching = (type, id, rows) => rows.filter((modifier) => modifier.enabled !== false
    && (!modifier.target?.attackIds?.length || modifier.target.attackIds.includes(id))
    && (!modifier.target?.attackTypes?.length || modifier.target.attackTypes.includes("all") || modifier.target.attackTypes.includes(type)));
  const oracle = (cb, score, level, owner, target, rows) => {
    const shotType = cb === 0 ? "enhancedNormal" : "elation";
    const shotId = cb === 0 ? "1506083" : "1506085";
    const shotMods = matching(shotType, shotId, rows);
    const boxMods = matching("elation", "1506086", rows);
    const shot = cb === 0
      ? independentDirect(normalCurve[level - 1], score, owner, target, shotMods)
      : independentElation(normalCurve[level - 1], cb, score, owner, target, shotMods);
    const boxes = independentElation(3 * boxCurve[9], cb, score, owner, target, boxMods);
    return { shot, boxes };
  };

  for (const cb of [0, 40]) {
    const score = 60;
    const input = request(data, 6, 10, { cb, score, modifiers: scoped });
    const result = engine.calculate(input);
    const expected = oracle(cb, score, 6, input.character, input.enemy, scoped);
    assert.notEqual(result.supported, false, result.reason || "");
    for (const key of ["nonCrit", "crit", "expected"]) {
      assertClose(result.components.shots[key], expected.shot[key], `CB${cb} selected shots receive only matching damage categories (${key})`);
      assertClose(result.components.boxes[key], expected.boxes[key], `CB${cb} Egg boxes receive Elation and shared DEF-ignore (${key})`);
      assertClose(result[key], expected.shot[key] + expected.boxes[key], `CB${cb} scoped total (${key})`);
    }
    assert.equal(result.components.shots.applied.some((modifier) => modifier.id === scoped[0].id), cb === 0,
      "the enhanced-normal-only damage bonus applies to ATK shots but not Elation shots");
    assert.equal(result.components.shots.applied.some((modifier) => modifier.id === scoped[1].id), cb !== 0,
      "the Elation stat bonus applies only to the CB-converted shot branch");
    assert.ok(result.components.shots.applied.some((modifier) => modifier.id === scoped[2].id));
    assert.ok(result.components.boxes.applied.some((modifier) => modifier.id === scoped[1].id));
    assert.ok(result.components.boxes.applied.some((modifier) => modifier.id === scoped[2].id));

    const disabled = scoped.map((modifier) => ({ ...modifier, enabled: false }));
    const disabledResult = engine.calculate(request(data, 6, 10, { cb, score, modifiers: disabled }));
    const removedResult = engine.calculate(request(data, 6, 10, { cb, score }));
    const baseline = oracle(cb, score, 6, character, enemy, []);
    for (const candidate of [disabledResult, removedResult]) {
      assert.notEqual(candidate.supported, false, candidate.reason || "");
      for (const key of ["nonCrit", "crit", "expected"]) {
        assertClose(candidate.components.shots[key], baseline.shot[key], `CB${cb} disabled/removed modifiers restore shots (${key})`);
        assertClose(candidate.components.boxes[key], baseline.boxes[key], `CB${cb} disabled/removed modifiers restore boxes (${key})`);
      }
    }

    const wrongIdRows = [...scoped, attackIdOnly];
    const wrongIdResult = engine.calculate(request(data, 6, 10, { cb, score, modifiers: wrongIdRows }));
    assert.notEqual(wrongIdResult.supported, false, wrongIdResult.reason || "");
    for (const key of ["nonCrit", "crit", "expected"]) {
      assertClose(wrongIdResult.components.shots[key], expected.shot[key], `CB${cb} other attack ID does not leak onto shots (${key})`);
      assertClose(wrongIdResult.components.boxes[key], expected.boxes[key], `CB${cb} other attack ID does not leak onto boxes (${key})`);
    }
    assert.equal(wrongIdResult.components.shots.applied.some((modifier) => modifier.id === attackIdOnly.id), false);
    assert.equal(wrongIdResult.components.boxes.applied.some((modifier) => modifier.id === attackIdOnly.id), false);
  }
});

test("Round57 outside-Skill11 sword record settlement applies only the fixed 20% to the recorded amount", async () => {
  const { data, engine } = await loadProductionFixture();
  const attack = attackOf(data, "1506101");
  assert.equal(attack.characterId, "1506");
  assert.equal(attack.sourceSkillId, "150603");
  assert.equal(attack.damageFormula, "trueDamage");
  assert.equal(attack.type, "trueDamage");
  assert.deepEqual(attack.multipliers, Array(10).fill(20));
  for (const [level, recorded] of [[1, 0], [4, 12345.67], [10, 1e9]]) {
    const input = {
      character: structuredClone(character),
      enemy: structuredClone(enemy),
      attack: { ...attack, traceLevel: level, multiplier: 20, attackType: "trueDamage" },
      modifierInputs: {
        "silver-wolf-sword-recorded-damage": recorded,
        "silver-wolf-sword-outside-skill11": 1
      },
      trueDamage: { active: true, sourceKind: "silverWolfSwordRecord", originalDamage: recorded }
    };
    const result = engine.calculate(input);
    assert.notEqual(result.supported, false, result.reason || "");
    assertClose(result.nonCrit, recorded * 0.2, `Lv${level} sword recorded-damage ×20% nonCrit`);
    assert.equal(result.crit, undefined, "true damage has no crit branch");
    assert.equal(result.expected, undefined, "true damage has no expected-value branch");
    assert.equal(result.attack.canCrit, false);
    assert.equal(result.breakdown.sourceKind, "silverWolfSwordRecord");
    assert.equal(result.breakdown.damageFormula, "trueDamage");
  }

  const validInput = {
    character: structuredClone(character), enemy: structuredClone(enemy),
    attack: { ...attack, traceLevel: 10, multiplier: 20, attackType: "trueDamage" },
    modifierInputs: { "silver-wolf-sword-recorded-damage": 10000, "silver-wolf-sword-outside-skill11": 1 },
    trueDamage: { active: true, sourceKind: "silverWolfSwordRecord", originalDamage: 10000 },
    modifiers: [
      { id: "sword-ignored-damageBonus", category: "damageBonus", value: 999, enabled: true, applicable: true, calculable: true, target: { owner: "self", attackTypes: ["all"] }, support: { status: "calculable" } },
      { id: "sword-ignored-defenseIgnore", category: "defenseIgnore", value: 999, enabled: true, applicable: true, calculable: true, target: { owner: "self", attackTypes: ["all"] }, support: { status: "calculable" } },
      { id: "sword-ignored-elation", category: "elation", value: 999, enabled: true, applicable: true, calculable: true, target: { owner: "self", attackTypes: ["all"] }, support: { status: "calculable" } }
    ]
  };
  const swordResult = engine.calculate(validInput);
  assertClose(swordResult.nonCrit, 2000, "sword settlement ignores ordinary bonus/DEF/Elat modifiers");
  assert.equal(swordResult.applied.length, 0);
  assert.equal(swordResult.skipped.length, 3, "all modifiers are explicitly skipped for recorded true damage");
  for (const mutate of [
    (x) => { delete x.modifierInputs["silver-wolf-sword-recorded-damage"]; },
    (x) => { x.modifierInputs["silver-wolf-sword-outside-skill11"] = 0; },
    (x) => { x.trueDamage.originalDamage = 10001; },
    (x) => { x.character.id = "1505"; },
    (x) => { x.enemy.count = 2; },
    (x) => { x.enemy.toughnessActive = false; },
    (x) => { x.trueDamage.sourceKind = "finalNonTrueDamage"; }
  ]) {
    const invalid = structuredClone(validInput);
    mutate(invalid);
    assert.equal(engine.calculate(invalid).supported, false, "sword settlement rejects missing or mismatched source scope");
  }
});
