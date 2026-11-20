"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const runtime = require("../../games/js/hsrModifierRuntime.js");
const records = require("../../games/hsr/data/calc/modifiers-v47-round52.json").modifiers;
const catalog = require("../../games/hsr/data/catalog.json");
const { loadProductionFixture, attackOf, makeRequest, assertClose } = require("./helpers/hsrDirectVerification.cjs");

const row = records.find((item) => item.id === "v47:trace:1513:151329:party-speed");
const attack = { id: "ally-basic", type: "normal", element: "Physical" };
const hiyuAscensionId = "v47:trace:1505:150529:next-ultimate-multiplier";
const hiyuUltimateCurve = [728, 779.2, 830.4, 881.6, 932.8, 984, 1048, 1112, 1176, 1240];
const hiyuTalentCurve = [138, 151.8, 165.6, 179.4, 193.2, 207, 224.25, 241.5, 258.75, 276];
const hiyuProfile = {
  atk: 3173.25, hp: 10231.75, def: 1643.5,
  critRate: 67.5, critDamage: 163.25, damageBonus: 37.25,
  elation: 143.75, merrymake: 13.5,
  enemyLevel: 87, resistance: 30, defenseReduction: 13.75,
  defenseIgnore: 8.25, resistancePenetration: 9.5, takenDamage: 11.25
};

function hiyuAscensionCandidate(data, targetAttack, { world = true, prepared = true, ahaPresent = true, ahaEidolon = 0 } = {}) {
  const ascension = data.structuredModifiers.find((item) => item.id === hiyuAscensionId);
  const item = runtime.buildCandidates([ascension], {
    characterId: "1505", eidolon: 0,
    partyIds: ahaPresent ? ["1511"] : [],
    partyEidolons: ahaPresent ? { "1511": ahaEidolon } : {},
    attack: targetAttack
  }, {
    "aha-world-active": world,
    "hiyu-ascension-next-ultimate-active": prepared
  })[0];
  return item && { ...item, applicable: runtime.applicableToAttack(item, targetAttack) };
}

function hiyuUltimateRequest(data, ultimateLevel, talentLevel, { cb = 480, world = true, prepared = false, ahaPresent = true, ahaEidolon = 0, extraModifiers = [], finalCritDamageBonus = 0 } = {}) {
  const aggregate = attackOf(data, "1505032");
  const owner = {
    level: 80, eidolon: 0,
    stats: { atk: hiyuProfile.atk, hp: hiyuProfile.hp, def: hiyuProfile.def,
      critRate: hiyuProfile.critRate, critDamage: hiyuProfile.critDamage + finalCritDamageBonus,
      damageBonus: hiyuProfile.damageBonus, breakEffect: 0, elation: hiyuProfile.elation, merrymake: hiyuProfile.merrymake },
    baseStats: { atk: 1000, hp: 1000, def: 1000 }
  };
  owner.id = "1505";
  const enemy = {
    count: 1, level: hiyuProfile.enemyLevel, resistance: hiyuProfile.resistance,
    weakness: false, toughnessActive: true, defenseReduction: hiyuProfile.defenseReduction,
    defenseIgnore: hiyuProfile.defenseIgnore, resistancePenetration: hiyuProfile.resistancePenetration,
    takenDamage: hiyuProfile.takenDamage
  };
  const modifierInputs = {
    "hiyu-certified-banger": cb,
    "elation-certified-banger": cb,
    "hiyu-prior-vulnerability": true,
    "hiyu-prior-fox-vulnerability": true,
    "aha-world-active": world,
    "hiyu-ascension-next-ultimate-active": prepared
  };
  const eligibleIds = new Set([
    hiyuAscensionId,
    "traceNode:1505:1505102:prior-vulnerability",
    "traceNode:1505:1505102:cb-prior-vulnerability"
  ]);
  const sourceRows = data.structuredModifiers.filter((item) => eligibleIds.has(item.id));
  const child = (id, level) => {
    const source = attackOf(data, id);
    const input = makeRequest(source, level, {
      ...hiyuProfile, characterLevel: 80, eidolon: 0, enemyCount: 1,
      weakness: false, toughnessActive: true
    });
    input.character = structuredClone(owner);
    input.enemy = structuredClone(enemy);
    input.modifierInputs = structuredClone(modifierInputs);
    input.elation = id === "1505042"
      ? { context: "certifiedBanger", certifiedBanger: cb, merrymake: hiyuProfile.merrymake }
      : { context: "ahaInstant", fervor: 0, merrymake: hiyuProfile.merrymake };
    const context = {
      characterId: "1505", eidolon: 0, partyIds: ahaPresent ? ["1511"] : [],
      partyEidolons: ahaPresent ? { "1511": ahaEidolon } : {},
      stats: input.character.stats, attack: input.attack, traceLevelFor: () => 1
    };
    input.modifiers = [
      ...runtime.buildCandidates(sourceRows.filter((item) => item.id === hiyuAscensionId), context, modifierInputs),
      ...runtime.buildCandidates(sourceRows.filter((item) => item.id !== hiyuAscensionId), context, modifierInputs)
    ].map((item) => ({ ...item, applicable: item.applicable && runtime.applicableToAttack(item, input.attack) }));
    input.modifiers.push(...extraModifiers.map((item) => ({ ...item, applicable: item.applicable !== false })));
    return input;
  };
  const direct = child("150503", ultimateLevel);
  const banger = child("1505042", talentLevel);
  const activeCandidate = hiyuAscensionCandidate(data, direct.attack, { world, prepared, ahaPresent, ahaEidolon });
  return {
    character: owner,
    enemy,
    attack: {
      ...aggregate, characterId: "1505", traceLevel: ultimateLevel,
      multiplier: aggregate.multipliers[ultimateLevel - 1], attackType: aggregate.type
    },
    modifierInputs,
    modifiers: activeCandidate ? [activeCandidate] : [],
    elation: { fervor: 0, merrymake: hiyuProfile.merrymake },
    sequenceComponents: [
      { key: "direct", name: "通常ダメージ成分", input: direct },
      { key: "banger", name: "本人の爆笑の褒美による追加愉悦", input: banger }
    ]
  };
}

function hiyuCommon(input) {
  const enemy = input.enemy;
  const def = (80 + 20) / ((80 + 20) + (enemy.level + 20) * (1 - (enemy.defenseReduction + enemy.defenseIgnore) / 100));
  const res = 1 - (enemy.resistance - enemy.resistancePenetration) / 100;
  return def * res * (enemy.toughnessActive ? 0.9 : 1) * (1 + (enemy.takenDamage + 12) / 100);
}

function hiyuDirectOracle(input, multiplier) {
  const owner = input.character;
  const nonCrit = owner.stats.atk * multiplier / 100 * (1 + owner.stats.damageBonus / 100) * hiyuCommon(input);
  const critMultiplier = 1 + owner.stats.critDamage / 100;
  const expectedMultiplier = 1 + owner.stats.critRate / 100 * (critMultiplier - 1);
  return { nonCrit, crit: nonCrit * critMultiplier, expected: nonCrit * expectedMultiplier };
}

function hiyuBangerOracle(input, multiplier) {
  const owner = input.character;
  const cb = Math.max(input.elation.certifiedBanger, 480);
  const punchline = 1 + 5 * cb / (cb + 240);
  const nonCrit = 7535.107 * multiplier / 100 * (1 + owner.stats.elation / 100) * punchline
    * (1 + input.elation.merrymake / 100) * hiyuCommon(input);
  const critMultiplier = 1 + owner.stats.critDamage / 100;
  const expectedMultiplier = 1 + owner.stats.critRate / 100 * (critMultiplier - 1);
  return { nonCrit, crit: nonCrit * critMultiplier, expected: nonCrit * expectedMultiplier };
}

function candidate(characterId, partyIds, partyPaths, inputs = {}) {
  const partyEidolons = Object.fromEntries(partyIds.map((id) => [id, 0]));
  const result = runtime.buildCandidates([row], {
    characterId,
    eidolon: 0,
    partyIds,
    partyPaths,
    partyEidolons,
    attack
  }, { "aha-world-active": true, ...inputs })[0];
  return result && { ...result, applicable: runtime.applicableToAttack(result, attack) };
}

test("Round56 Aven +15% SPD is active for Aha-only Elation roster and declared non-Elation recipient", () => {
  assert.ok(row);

  const self = candidate("1513", ["1511"], { "1513": "Elation", "1511": "Elation" });
  assert.ok(self);
  assert.equal(self.enabled, true);
  assert.equal(self.value, 15);
  assert.equal(self.stat, "speed");
  assert.equal(self.applicable, true);

  const huntRecipient = candidate("1002", ["1513", "1511"], {
    "1002": "Hunt", "1513": "Elation", "1511": "Elation"
  });
  assert.ok(huntRecipient);
  assert.equal(huntRecipient.enabled, true);
  assert.equal(huntRecipient.value, 15);
  assert.equal(huntRecipient.providerId, "1513");
});

test("Round56 Aven leaves extra Elation or unknown-path rosters locally unresolved", () => {
  for (const partyPaths of [
    { "1002": "Hunt", "1513": "Elation", "1511": "Elation", "1501": "Elation" },
    { "1002": "Hunt", "1513": "Elation", "1511": "Elation" }
  ]) {
    const partyIds = Object.hasOwn(partyPaths, "1501") ? ["1513", "1511", "1501"] : ["1513", "1511", "1201"];
    const result = candidate("1002", partyIds, partyPaths);
    assert.ok(result);
    assert.equal(result.enabled, false);
    assert.equal(result.activation.unresolved, true);
    assert.match(result.activation.unresolvedReason, /他の愉悦キャラ\/運命不明/);
  }
});

test("Round56 Aven SPD ascension remains off when Aha is absent or the world toggle is off", () => {
  const absentAha = candidate("1002", ["1513"], { "1002": "Hunt", "1513": "Elation" });
  assert.ok(absentAha);
  assert.equal(absentAha.enabled, false);

  const worldOff = runtime.buildCandidates([row], {
    characterId: "1002", eidolon: 0, partyIds: ["1513", "1511"],
    partyPaths: { "1002": "Hunt", "1513": "Elation", "1511": "Elation" },
    partyEidolons: { "1513": 0, "1511": 0 }, attack
  }, { "aha-world-active": false })[0];
  assert.ok(worldOff);
  assert.equal(worldOff.enabled, false);
  assert.equal(worldOff.value, 15);
});

test("Round56 Hiyu +75% next-Ultimate applies only to the prepared same-action direct and CB terms", async () => {
  const { data, engine } = await loadProductionFixture();
  const source = catalog.characters.find((item) => item.id === "1505")?.skills?.find((item) => item.id === "150529");
  const ascension = data.structuredModifiers.find((item) => item.id === hiyuAscensionId);
  assert.ok(source);
  assert.equal(source.sourceCommit, "03907e798b46f9eb109a1f882055cdf49ce3d374");
  assert.equal(source.params[0][0], 0.75);
  assert.equal(source.params[0][3], 480, "the 480 accumulation threshold is native source data, not an inferred active toggle");
  assert.equal(ascension.value.fixed, source.params[0][0] * 100);
  assert.deepEqual(Array.from(ascension.target.attackIds), ["150503", "1505042"]);
  assert.equal(ascension.activation.inputKey, "hiyu-ascension-next-ultimate-active");
  assert.equal(ascension.activation.requiredToggleKey, "aha-world-active");

  const aggregate = attackOf(data, "1505032");
  const directSource = attackOf(data, "150503");
  const riderSource = attackOf(data, "1505042");
  for (let ultimateLevel = 1; ultimateLevel <= 10; ultimateLevel++) {
    assert.equal(directSource.multipliers[ultimateLevel - 1], hiyuUltimateCurve[ultimateLevel - 1]);
    for (let talentLevel = 1; talentLevel <= 10; talentLevel++) {
      const base = hiyuUltimateRequest(data, ultimateLevel, talentLevel, { cb: 480, prepared: false });
      const baseResult = engine.calculate(base);
      assert.notEqual(baseResult.supported, false, baseResult.reason || "");
      const directExpected = hiyuDirectOracle(base.sequenceComponents[0].input, hiyuUltimateCurve[ultimateLevel - 1]);
      const bangerExpected = hiyuBangerOracle(base.sequenceComponents[1].input, hiyuTalentCurve[talentLevel - 1]);
      for (const key of ["nonCrit", "crit", "expected"]) {
        assertClose(baseResult.components.direct[key], directExpected[key], `U${ultimateLevel}/T${talentLevel} unprepared direct ${key}`);
        assertClose(baseResult.components.banger[key], bangerExpected[key], `U${ultimateLevel}/T${talentLevel} unprepared CB ${key}`);
      }
      assert.equal(baseResult.components.direct.breakdown.multiplierPercent, hiyuUltimateCurve[ultimateLevel - 1], "CB=480 alone does not activate a prepared next Ultimate");

      const active = hiyuUltimateRequest(data, ultimateLevel, talentLevel, { cb: 480, prepared: true });
      const activeResult = engine.calculate(active);
      assert.notEqual(activeResult.supported, false, activeResult.reason || "");
      const activeDirectExpected = hiyuDirectOracle(active.sequenceComponents[0].input, hiyuUltimateCurve[ultimateLevel - 1] * 1.75);
      const activeBangerExpected = hiyuBangerOracle(active.sequenceComponents[1].input, hiyuTalentCurve[talentLevel - 1] * 1.75);
      assert.equal(activeResult.components.direct.breakdown.multiplierPercent, hiyuUltimateCurve[ultimateLevel - 1] * 1.75);
      for (const key of ["nonCrit", "crit", "expected"]) {
        assertClose(activeResult.components.direct[key], activeDirectExpected[key], `U${ultimateLevel}/T${talentLevel} prepared direct ${key}`);
        assertClose(activeResult.components.banger[key], activeBangerExpected[key], `U${ultimateLevel}/T${talentLevel} prepared CB ${key}`);
        assertClose(activeResult[key], activeDirectExpected[key] + activeBangerExpected[key], `U${ultimateLevel}/T${talentLevel} combined ${key}`);
      }
      const displayedRiders = activeResult.components.banger.breakdown.elationComponents;
      assert.equal(displayedRiders.length, 2);
      assertClose(displayedRiders[0].multiplierPercent, [12,13.2,14.4,15.6,16.8,18,19.5,21,22.5,24][talentLevel - 1] * 1.75, `U${ultimateLevel}/T${talentLevel} AoE rider`);
      assertClose(displayedRiders[1].multiplierPercent, [14,15.4,16.8,18.2,19.6,21,22.75,24.5,26.25,28][talentLevel - 1] * 1.75, `U${ultimateLevel}/T${talentLevel} bounce rider`);
      for (const key of ["nonCrit", "crit", "expected"]) {
        assertClose(displayedRiders.reduce((sum, item) => sum + item[key], 0), activeResult.components.banger[key], `U${ultimateLevel}/T${talentLevel} rider components sum ${key}`);
        assertClose(activeResult.components.direct[key] + activeResult.components.banger[key], activeResult[key], `U${ultimateLevel}/T${talentLevel} full sum ${key}`);
      }
    }
  }

  for (const state of [
    { world: false, prepared: true },
    { world: true, prepared: false },
    { world: true, prepared: true, ahaPresent: false },
    { world: true, prepared: true, ahaPresent: true, ahaEidolon: 1 }
  ]) {
    const candidate = hiyuAscensionCandidate(data, directSource, state);
    assert.ok(candidate);
    assert.equal(candidate.enabled, false);
    const result = engine.calculate(hiyuUltimateRequest(data, 10, 10, { cb: 480, ...state }));
    const baseline = engine.calculate(hiyuUltimateRequest(data, 10, 10, { cb: 480, prepared: false }));
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], baseline[key], `inactive state ${JSON.stringify(state)} preserves ${key}`);
  }

  const ordinary = attackOf(data, "150502");
  const ordinaryInput = makeRequest(ordinary, 10, { ...hiyuProfile, characterLevel: 80, eidolon: 0, enemyCount: 1 });
  ordinaryInput.character.id = "1505";
  ordinaryInput.modifierInputs = { "aha-world-active": true, "hiyu-ascension-next-ultimate-active": true, "hiyu-certified-banger": 480 };
  const nonTargetCandidate = hiyuAscensionCandidate(data, ordinaryInput.attack, { world: true, prepared: true });
  assert.ok(nonTargetCandidate);
  assert.equal(nonTargetCandidate.applicable, false);
  ordinaryInput.modifiers = [nonTargetCandidate];
  const ordinaryBase = engine.calculate({ ...ordinaryInput, modifiers: [] });
  const ordinaryWithReadyState = engine.calculate(ordinaryInput);
  for (const key of ["nonCrit", "crit", "expected"]) assertClose(ordinaryWithReadyState[key], ordinaryBase[key], `ordinary skill is outside the next-Ultimate target ${key}`);

  const cdBase = engine.calculate(hiyuUltimateRequest(data, 10, 10, { cb: 480, prepared: true }));
  const cdRaisedFinal = engine.calculate(hiyuUltimateRequest(data, 10, 10, { cb: 480, prepared: true, finalCritDamageBonus: 40 }));
  assertClose(cdRaisedFinal.components.direct.nonCrit, cdBase.components.direct.nonCrit, "already-final CD does not auto-convert into Elation");
  assertClose(cdRaisedFinal.components.banger.nonCrit, cdBase.components.banger.nonCrit, "already-final CD does not auto-convert into Elation for CB damage");
  assert.ok(cdRaisedFinal.crit > cdBase.crit, "final CD still affects crit damage independently");
  assert.equal(aggregate.damageComponents[1].attackId, "1505042");
});
