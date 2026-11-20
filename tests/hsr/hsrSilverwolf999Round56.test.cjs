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
const talent = [20, 22, 24, 26, 28, 30, 32.5, 35, 37.5, 40];
const cbKey = "elation-certified-banger";

function independentCommon(target) {
  const defense = (80 + 20) / ((80 + 20) + (target.level + 20) * (1 - (target.defenseReduction + target.defenseIgnore) / 100));
  const resistance = 1 - (target.resistance - target.resistancePenetration) / 100;
  const toughness = target.toughnessActive ? 0.9 : 1;
  const vulnerability = 1 + target.takenDamage / 100;
  return defense * resistance * toughness * vulnerability;
}

function independentDirect(multiplierPercent, owner = character, target = enemy) {
  const common = independentCommon(target);
  const nonCrit = owner.stats.atk * multiplierPercent / 100 * (1 + owner.stats.damageBonus / 100) * common;
  const critMultiplier = 1 + owner.stats.critDamage / 100;
  const expectedMultiplier = 1 + owner.stats.critRate / 100 * (critMultiplier - 1);
  return { nonCrit, crit: nonCrit * critMultiplier, expected: nonCrit * expectedMultiplier };
}

function independentBanger(multiplierPercent, cb, owner = character, target = enemy) {
  const punchline = 1 + 5 * cb / (cb + 240);
  const nonCrit = 7535.107 * multiplierPercent / 100
    * (1 + owner.stats.elation / 100)
    * punchline
    * (1 + owner.stats.merrymake / 100)
    * independentCommon(target);
  const critMultiplier = 1 + owner.stats.critDamage / 100;
  const expectedMultiplier = 1 + owner.stats.critRate / 100 * (critMultiplier - 1);
  return { nonCrit, crit: nonCrit * critMultiplier, expected: nonCrit * expectedMultiplier };
}

function componentRequest(attack, level, cb, overrides = {}) {
  const owner = overrides.character || character;
  const target = overrides.enemy || enemy;
  const modifiers = overrides.modifiers || [];
  const modifierInputs = overrides.modifierInputs || (cb === undefined ? {} : { [cbKey]: cb });
  const request = {
    character: structuredClone(owner),
    enemy: structuredClone(target),
    attack: {
      ...attack,
      traceLevel: level,
      multiplier: attack.multipliers[level - 1],
      attackType: attack.type
    },
    modifiers: structuredClone(modifiers),
    modifierInputs: structuredClone(modifierInputs),
    elation: {
      context: "certifiedBanger",
      certifiedBanger: cb,
      merrymake: owner.stats.merrymake
    }
  };
  return request;
}

function combinedRequest(data, aggregateId, bodyLevel, talentLevel, cb, overrides = {}) {
  const aggregate = attackOf(data, aggregateId);
  const isNormal = aggregate.type === "normal";
  const owner = overrides.character || character;
  const target = overrides.enemy || enemy;
  const modifiers = overrides.modifiers || [];
  const modifierInputs = overrides.modifierInputs || (cb === undefined ? {} : { [cbKey]: cb });
  const body = attackOf(data, isNormal ? "150601" : "150602");
  const rider = attackOf(data, isNormal ? "1506041" : "1506042");
  const bodyInput = componentRequest(body, bodyLevel, cb, { ...overrides, character: owner, enemy: target, modifiers, modifierInputs });
  const riderInput = componentRequest(rider, talentLevel, cb, { ...overrides, character: owner, enemy: target, modifiers, modifierInputs });
  return {
    character: structuredClone(owner),
    enemy: structuredClone(target),
    modifiers: structuredClone(modifiers),
    modifierInputs: structuredClone(modifierInputs),
    elation: { context: "ahaInstant", punchline: 0, merrymake: owner.stats.merrymake },
    attack: {
      ...aggregate,
      traceLevel: bodyLevel,
      talentTraceLevel: talentLevel,
      multiplier: aggregate.multipliers[bodyLevel - 1],
      attackType: aggregate.type
    },
    sequenceComponents: [
      { key: aggregate.damageComponents[0].key, name: aggregate.damageComponents[0].name, input: bodyInput },
      { key: aggregate.damageComponents[1].key, name: aggregate.damageComponents[1].name, input: riderInput }
    ]
  };
}

function silverWolfCdCandidate(attack, { world = true, finalIncluded = false, ahaPresent = true, ahaEidolon = 0 } = {}) {
  const record = round52Modifiers.find((item) => item.id === "v47:trace:1506:150629:crit-damage");
  const partyIds = ahaPresent ? ["1506", "1511"] : ["1506"];
  const item = runtime.buildCandidates([record], {
    characterId: "1506", eidolon: 0, partyIds,
    partyEidolons: ahaPresent ? { "1511": ahaEidolon } : {},
    attack: { id: "150608", type: "enhancedNormal", element: "Imaginary" }
  }, {
    "aha-world-active": world,
    "silver-wolf-ascension-cd-in-final": finalIncluded
  })[0];
  return item && { ...item, applicable: runtime.applicableToAttack(item, attack) };
}

function skill11Request(data, normalLevel, ultimateLevel, state = {}) {
  const outer = attackOf(data, "150608");
  const shots = attackOf(data, "1506081");
  const boxes = attackOf(data, "1506082");
  const cb = state.cb;
  const score = state.score ?? 240;
  const swordBoxes = Object.prototype.hasOwnProperty.call(state, "swordBoxes") ? state.swordBoxes : 0;
  const modifierInputs = {
    "elation-certified-banger": cb,
    "silver-wolf-secret-score": score,
    "silver-wolf-sword-box-count": swordBoxes,
    "silver-wolf-no-break-confirmed": Object.prototype.hasOwnProperty.call(state, "noBreakConfirmed") ? state.noBreakConfirmed : 1,
    "silver-wolf-ascension-cd-in-final": state.finalIncluded === true
  };
  const owner = structuredClone(state.character || character);
  owner.id = "1506";
  owner.level = 80;
  owner.eidolon = 0;
  if (state.finalIncluded === true) owner.stats.critDamage += 40;
  const target = structuredClone(enemy);
  const modifiers = structuredClone(state.modifiers || []);
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
  const attack = {
    ...outer,
    traceLevel: normalLevel,
    ultimateTraceLevel: ultimateLevel,
    multiplier: outer.multipliers[normalLevel - 1],
    attackType: outer.type
  };
  const components = [
    { key: outer.damageComponents[0].key, name: outer.damageComponents[0].name, input: componentInput(shots, normalLevel) },
    { key: outer.damageComponents[1].key, name: outer.damageComponents[1].name, input: componentInput(boxes, ultimateLevel) }
  ];
  return { character: owner, enemy: target, attack, modifiers, modifierInputs, sequenceComponents: components };
}

test("Round56 Silver Wolf fixed 4.7 CB riders bind every Talent level to params and the E0 owner", async () => {
  const { data } = await loadProductionFixture();
  for (const [id, sourceId] of [["1506041", "150604"], ["1506042", "150604"]]) {
    const attack = attackOf(data, id);
    assert.equal(attack.characterId, "1506");
    assert.equal(attack.sourceSkillId, sourceId);
    assert.equal(attack.type, "elation");
    assert.equal(attack.scalingStat, "elation");
    assert.equal(attack.damageFormula, "elation");
    assert.equal(attack.elationContext, "certifiedBanger");
    assert.deepEqual(attack.multipliers, talent);
    assert.equal(attack.maximumEidolon, 0);
    assert.equal(attack.provenance.sourceCommit, "03907e798b46f9eb109a1f882055cdf49ce3d374");
  }
});

test("Round56 Silver Wolf normal and skill sums match a literal independent direct-plus-CB oracle at all body and Talent levels", async () => {
  const { data, engine } = await loadProductionFixture();
  const cases = [
    { id: "1506012", bodyId: "150601", bodyMax: 6, riderId: "1506041", type: "normal" },
    { id: "1506022", bodyId: "150602", bodyMax: 10, riderId: "1506042", type: "skill" }
  ];
  const cb = 4873;
  for (const spec of cases) {
    const bodyRecord = attackOf(data, spec.bodyId);
    const riderRecord = attackOf(data, spec.riderId);
    const aggregateRecord = attackOf(data, spec.id);
    assert.equal(aggregateRecord.damageComponents[0].attackId, spec.bodyId);
    assert.equal(aggregateRecord.damageComponents[1].attackId, spec.riderId);
    for (let bodyLevel = 1; bodyLevel <= spec.bodyMax; bodyLevel++) {
      for (let talentLevel = 1; talentLevel <= 10; talentLevel++) {
        const input = combinedRequest(data, spec.id, bodyLevel, talentLevel, cb);
        const directExpected = independentDirect(bodyRecord.multipliers[bodyLevel - 1]);
        const riderExpected = independentBanger(talent[talentLevel - 1], cb);
        const actual = engine.calculate(input);
        assert.notEqual(actual.supported, false, `${spec.id} body Lv${bodyLevel}/Talent Lv${talentLevel}: ${actual.reason || ""}`);
        for (const key of ["nonCrit", "crit", "expected"]) {
          assertClose(actual.components.direct[key], directExpected[key], `${spec.id} ${key} direct`);
          assertClose(actual.components.banger[key], riderExpected[key], `${spec.id} ${key} CB`);
          assertClose(actual[key], directExpected[key] + riderExpected[key], `${spec.id} ${key} sum`);
        }
      }
    }
  }
});

test("Round56 Silver Wolf CB riders require an explicit positive integer and accept the inclusive cap", async () => {
  const { data, engine } = await loadProductionFixture();
  const rider = attackOf(data, "1506041");
  const accepted = componentRequest(rider, 10, 10000);
  const acceptedResult = engine.calculate(accepted);
  assert.notEqual(acceptedResult.supported, false, acceptedResult.reason || "");
  const oracle = independentBanger(talent[9], 10000);
  for (const key of ["nonCrit", "crit", "expected"]) assertClose(acceptedResult[key], oracle[key], `CB 10000 ${key}`);

  for (const cb of [undefined, 0, -1, 10001, 1.5, NaN]) {
    const invalid = componentRequest(rider, 10, cb);
    const result = engine.calculate(invalid);
    assert.equal(result.supported, false, `invalid CB ${String(cb)} is not guessed`);
  }
  const direct = engine.calculate(componentRequest(attackOf(data, "150601"), 6, undefined));
  assert.notEqual(direct.supported, false, "CB omission does not disable the independent direct normal hit");
});

test("Round56 Silver Wolf body uses ATK while the separate rider uses Elation", async () => {
  const { data, engine } = await loadProductionFixture();
  const base = engine.calculate(combinedRequest(data, "1506012", 6, 10, 4873));
  const highAtkCharacter = structuredClone(character);
  highAtkCharacter.stats.atk *= 2;
  const highAtk = engine.calculate(combinedRequest(data, "1506012", 6, 10, 4873, { character: highAtkCharacter }));
  const highElationCharacter = structuredClone(character);
  highElationCharacter.stats.elation *= 2;
  const highElation = engine.calculate(combinedRequest(data, "1506012", 6, 10, 4873, { character: highElationCharacter }));
  for (const result of [base, highAtk, highElation]) assert.notEqual(result.supported, false, result.reason || "");
  assertClose(highAtk.components.direct.nonCrit, base.components.direct.nonCrit * 2, "ATK changes the normal body");
  assertClose(highAtk.components.banger.nonCrit, base.components.banger.nonCrit, "ATK does not rescale the CB rider");
  assertClose(highElation.components.direct.nonCrit, base.components.direct.nonCrit, "Elation does not rescale the normal body");
  const elationRatio = (1 + highElationCharacter.stats.elation / 100) / (1 + character.stats.elation / 100);
  assertClose(highElation.components.banger.nonCrit, base.components.banger.nonCrit * elationRatio, "Elation scales the CB rider");
});

test("Round56 Silver Wolf sums reject foreign owners, mismatched levels, and unconverted CR or SPD support locally", async () => {
  const { data, engine } = await loadProductionFixture();
  const valid = combinedRequest(data, "1506012", 6, 10, 4873);
  assert.notEqual(engine.calculate(valid).supported, false);

  const foreign = structuredClone(valid);
  foreign.sequenceComponents[1].input.attack.characterId = "1502";
  assert.equal(engine.calculate(foreign).supported, false, "a foreign character cannot borrow Silver Wolf's CB rider");

  const wrongBody = structuredClone(valid);
  wrongBody.sequenceComponents[0].input.attack.traceLevel = 5;
  wrongBody.sequenceComponents[0].input.attack.multiplier = wrongBody.sequenceComponents[0].input.attack.multipliers[4];
  assert.equal(engine.calculate(wrongBody).supported, false, "the direct component must match the aggregate body level");

  const wrongTalent = structuredClone(valid);
  wrongTalent.sequenceComponents[1].input.attack.traceLevel = 9;
  wrongTalent.sequenceComponents[1].input.attack.multiplier = wrongTalent.sequenceComponents[1].input.attack.multipliers[8];
  assert.equal(engine.calculate(wrongTalent).supported, false, "the CB component must match aggregate Talent level");

  const cr = structuredClone(valid);
  cr.sequenceComponents[1].input.modifiers.push({ category: "critRate", value: 8, enabled: true, applicable: true });
  assert.equal(engine.calculate(cr).supported, false, "unconverted score CR stops the CB result only");
  const speed = structuredClone(valid);
  speed.sequenceComponents[1].input.modifiers.push({ category: "statPercent", stat: "speed", value: 12, enabled: true, applicable: true });
  assert.equal(engine.calculate(speed).supported, false, "unconverted SPD-derived Elation stops the CB result only");

  const directWithUnconverted = componentRequest(attackOf(data, "150601"), 6, undefined, {
    modifiers: [
      { category: "critRate", value: 8, enabled: true, applicable: true },
      { category: "statPercent", stat: "speed", value: 12, enabled: true, applicable: true }
    ]
  });
  assert.notEqual(engine.calculate(directWithUnconverted).supported, false, "unconverted rider conditions do not block the direct normal hit");

  const included = structuredClone(valid);
  included.sequenceComponents[1].input.modifiers.push(
    { category: "critRate", value: 8, enabled: true, applicable: true, includedInFinalStats: true },
    { category: "statPercent", stat: "speed", value: 12, enabled: true, applicable: true, includedInFinalStats: true }
  );
  assert.notEqual(engine.calculate(included).supported, false, "already included final-stat conversions are not rejected twice");
});

test("Round56 Silver Wolf Skill11 100-shot and non-sword box curves match independent fixed-state oracles at all trace levels", async () => {
  const { data, engine } = await loadProductionFixture();
  const cb = 635;
  const perShot = [1.2, 1.44, 1.68, 1.92, 2.16, 2.4];
  const lastHit = [50, 60, 70, 80, 90, 100];
  const perBox = [45, 49.5, 54, 58.5, 63, 67.5, 73.12, 78.75, 84.38, 90];
  const aggregate = attackOf(data, "150608");
  assert.equal(attackOf(data, "1506081").hitCount, 101, "100 individual shots plus one final hit");
  assert.equal(attackOf(data, "1506082").hitCount, 3, "three realized non-sword boxes");
  assert.equal(aggregate.damageComponents.length, 2);
  for (let normalLevel = 1; normalLevel <= 6; normalLevel++) {
    for (let ultimateLevel = 1; ultimateLevel <= 10; ultimateLevel++) {
      const input = skill11Request(data, normalLevel, ultimateLevel, { cb, score: 240, swordBoxes: 0 });
      const result = engine.calculate(input);
      assert.notEqual(result.supported, false, `N${normalLevel}/U${ultimateLevel}: ${result.reason || ""}`);
      assert.equal(result.components.shots.attack.hitCount, 101);
      assert.equal(result.components.boxes.attack.hitCount, 3);
      const shotsExpected = independentBanger((100 * perShot[normalLevel - 1] + lastHit[normalLevel - 1]) * 1.3, cb);
      const boxesExpected = independentBanger(3 * perBox[ultimateLevel - 1] * 1.3, cb);
      for (const key of ["nonCrit", "crit", "expected"]) {
        assertClose(result.components.shots[key], shotsExpected[key], `shots N${normalLevel} ${key}`);
        assertClose(result.components.boxes[key], boxesExpected[key], `boxes U${ultimateLevel} ${key}`);
        assertClose(result[key], shotsExpected[key] + boxesExpected[key], `whole skill11 N${normalLevel}/U${ultimateLevel} ${key}`);
      }
      const displayedShots = result.components.shots.breakdown.elationComponents;
      assert.equal(displayedShots.length, 2);
      assert.equal(displayedShots[0].count, 100);
      assert.equal(displayedShots[1].count, 1);
      assertClose(displayedShots[0].multiplierPercent, perShot[normalLevel - 1], `100-shot source coefficient N${normalLevel}`);
      assertClose(displayedShots[1].multiplierPercent, lastHit[normalLevel - 1], `last-hit source coefficient N${normalLevel}`);
      assertClose(displayedShots[0].perHitNonCrit, 7535.107 * perShot[normalLevel - 1] / 100 * (1 + character.stats.elation / 100)
        * (1 + 5 * cb / (cb + 240)) * (1 + character.stats.merrymake / 100) * independentCommon(enemy) * 1.3, `100-shot resolved multiplier N${normalLevel}`);
      assertClose(displayedShots[1].perHitNonCrit, 7535.107 * lastHit[normalLevel - 1] / 100 * (1 + character.stats.elation / 100)
        * (1 + 5 * cb / (cb + 240)) * (1 + character.stats.merrymake / 100) * independentCommon(enemy) * 1.3, `last-hit resolved multiplier N${normalLevel}`);
      for (const key of ["nonCrit", "crit", "expected"]) {
        assertClose(displayedShots.reduce((sum, part) => sum + part[key], 0), result.components.shots[key], `shots part sum N${normalLevel} ${key}`);
      }
      const displayedBoxes = result.components.boxes.breakdown.elationComponents;
      assert.equal(displayedBoxes.length, 1, "identical realized SSS non-sword boxes share one grouped breakdown row");
      assert.equal(displayedBoxes[0].count, 3, "the grouped row retains all three realized boxes");
      assertClose(displayedBoxes[0].multiplierPercent, perBox[ultimateLevel - 1], `per-box source coefficient U${ultimateLevel}`);
      assertClose(displayedBoxes[0].perHitNonCrit, independentBanger(perBox[ultimateLevel - 1] * 1.3, cb).nonCrit, `per-box resolved nonCrit U${ultimateLevel}`);
      assertClose(displayedBoxes[0].perHitNonCrit * displayedBoxes[0].count, result.components.boxes.nonCrit, `three per-box nonCrit hits sum U${ultimateLevel}`);
      for (const key of ["nonCrit", "crit", "expected"]) {
        assertClose(displayedBoxes.reduce((sum, part) => sum + part[key], 0), result.components.boxes[key], `three-box part sum U${ultimateLevel} ${key}`);
        assertClose(result.components.shots[key] + result.components.boxes[key], result[key], `101-shot plus 3-box 104-hit total N${normalLevel}/U${ultimateLevel} ${key}`);
      }
    }
  }
});

test("Round56 Silver Wolf Skill11 uses the 360 score cap only with the active E0 Aha ascension, including final-stat mode", async () => {
  const { data, engine } = await loadProductionFixture();
  const attack = attackOf(data, "150608");
  const cdActive = silverWolfCdCandidate(attack, { world: true, ahaPresent: true, ahaEidolon: 0 });
  assert.ok(cdActive);
  assert.equal(cdActive.enabled, true);
  assert.equal(cdActive.value, 40);
  assert.equal(cdActive.activation.active, true);
  const enabled = skill11Request(data, 6, 10, { cb: 635, score: 360, swordBoxes: 0, modifiers: [cdActive] });
  const enabledResult = engine.calculate(enabled);
  assert.notEqual(enabledResult.supported, false, enabledResult.reason || "");
  const ownerWithCd = structuredClone(enabled.character);
  ownerWithCd.stats.critDamage += 40;
  const enabledExpectedShots = independentBanger(340 * 1.3, 635, ownerWithCd, enabled.enemy);
  const enabledExpectedBoxes = independentBanger(270 * 1.3, 635, ownerWithCd, enabled.enemy);
  assertClose(enabledResult.expected, enabledExpectedShots.expected + enabledExpectedBoxes.expected, "active ascension final damage uses the +40% CD candidate and 360 score cap");

  for (const inactiveState of [
    { world: false, ahaPresent: true, ahaEidolon: 0 },
    { world: true, ahaPresent: false },
    { world: true, ahaPresent: true, ahaEidolon: 1 }
  ]) {
    const candidate = silverWolfCdCandidate(attack, inactiveState);
    assert.ok(candidate);
    assert.equal(candidate.enabled, false);
    assert.equal(candidate.activation.active, false);
    const input = skill11Request(data, 6, 10, { cb: 635, score: 240, swordBoxes: 0, modifiers: [candidate] });
    const result = engine.calculate(input);
    assert.notEqual(result.supported, false, result.reason || "");
    const expectedShots = independentBanger(340 * 1.3, 635, input.character, input.enemy);
    const expectedBoxes = independentBanger(270 * 1.3, 635, input.character, input.enemy);
    assertClose(result.expected, expectedShots.expected + expectedBoxes.expected, "inactive/missing ascension preserves score 240 only");
  }

  const included = silverWolfCdCandidate(attack, { world: true, finalIncluded: true, ahaPresent: true, ahaEidolon: 0 });
  assert.ok(included);
  assert.equal(included.enabled, false, "a final-stat inclusion is not added twice");
  assert.equal(included.includedInFinalStats, true);
  assert.equal(included.activation.active, true, "the active ascension still selects the higher score cap");
  const includedInput = skill11Request(data, 6, 10, { cb: 635, score: 360, swordBoxes: 0, finalIncluded: true, modifiers: [included] });
  const includedResult = engine.calculate(includedInput);
  assert.notEqual(includedResult.supported, false, includedResult.reason || "");
  const expectedShots = independentBanger(340 * 1.3, 635, includedInput.character, includedInput.enemy);
  const expectedBoxes = independentBanger(270 * 1.3, 635, includedInput.character, includedInput.enemy);
  assertClose(includedResult.expected, expectedShots.expected + expectedBoxes.expected, "final-included +40% CD follows the active 360 cap without double application");
});

test("Round56 Silver Wolf Skill11 rejects unsupported sword boxes, wrong score states and unconverted CR/SPD locally", async () => {
  const { data, engine } = await loadProductionFixture();
  assert.equal(engine.calculate(skill11Request(data, 6, 10, { cb: 635, score: 240, swordBoxes: 0, noBreakConfirmed: undefined })).supported, false, "missing no-break confirmation does not assume the hit sequence avoids breaking");
  assert.equal(engine.calculate(skill11Request(data, 6, 10, { cb: 635, score: 240, swordBoxes: 0, noBreakConfirmed: 0 })).supported, false, "an unconfirmed no-break state is not accepted");
  for (const swordBoxes of [undefined, 1, 2, 3]) {
    const invalid = skill11Request(data, 6, 10, { cb: 635, score: 240, swordBoxes });
    assert.equal(engine.calculate(invalid).supported, false, `sword-box count ${String(swordBoxes)} is outside the non-sword subset`);
  }
  assert.equal(engine.calculate(skill11Request(data, 6, 10, { cb: undefined, score: 240, swordBoxes: 0 })).supported, false, "missing CB is not inferred");
  assert.equal(engine.calculate(skill11Request(data, 6, 10, { cb: 0, score: 240, swordBoxes: 0 })).supported, false, "zero CB does not use the main six-hit fallback");
  assert.equal(engine.calculate(skill11Request(data, 6, 10, { cb: 635, score: 360, swordBoxes: 0 })).supported, false, "the 360 cap requires active E0-Aha ascension");
  const activeCandidate = silverWolfCdCandidate(attackOf(data, "150608"), { world: true, ahaPresent: true, ahaEidolon: 0 });
  assert.equal(engine.calculate(skill11Request(data, 6, 10, { cb: 635, score: 240, swordBoxes: 0, modifiers: [activeCandidate] })).supported, false, "active ascension requires the exact 360 score snapshot");

  const malformedCandidates = [
    { label: "wrong value", edit: (item) => { item.value = 39; } },
    { label: "wrong source skill", edit: (item) => { (item.sourceMeta || item.source).skillId = "150628"; } },
    { label: "wrong provider", edit: (item) => { item.providerId = "1505"; } },
    { label: "inactive source state", edit: (item) => { item.activation.active = false; } },
    { label: "candidate warning", edit: (item) => { item.inputWarnings = ["unresolved source state"]; } }
  ];
  for (const { label, edit } of malformedCandidates) {
    const malformed = structuredClone(activeCandidate);
    edit(malformed);
    const invalid = skill11Request(data, 6, 10, { cb: 635, score: 360, swordBoxes: 0, modifiers: [malformed] });
    assert.equal(engine.calculate(invalid).supported, false, `${label} cannot authorize the 360 score cap`);
  }

  for (const modifier of [
    { category: "critRate", value: 8, enabled: true, applicable: true },
    { category: "statPercent", stat: "speed", value: 12, enabled: true, applicable: true }
  ]) {
    const invalid = skill11Request(data, 6, 10, { cb: 635, score: 240, swordBoxes: 0, modifiers: [modifier] });
    assert.equal(engine.calculate(invalid).supported, false, "unconverted CR or SPD-derived Elation stops skill11 only");
    const direct = componentRequest(attackOf(data, "150601"), 6, undefined, { modifiers: [modifier] });
    assert.notEqual(engine.calculate(direct).supported, false, "unrelated basic hit remains calculable");
  }
});
