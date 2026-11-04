"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  fixedSourceSha,
  loadProductionFixture,
  makeRequest,
  independentDirectDamage,
  assertClose,
  readJson,
  runtime
} = require("./helpers/hsrDirectVerification.cjs");

const attackFile = "games/hsr/data/calc/attacks-dahlia-round13.json";
const modifierFile = "games/hsr/data/calc/modifiers-dahlia-round12.json";
const directPerHit = [15, 16.5, 18, 19.5, 21, 22.5, 24.37, 26.25, 28.12, 30];
const conversion = [100, 110, 120, 130, 140, 150, 162.5, 175, 187.5, 200];
const profiles = [
  { atk: 3317, hp: 7159, def: 2411, critRate: 37, critDamage: 143, damageBonus: 19, enemyLevel: 82, resistance: 27, defenseReduction: 11, defenseIgnore: 4, resistancePenetration: 7, takenDamage: 9, breakEffect: 213.75 },
  { atk: 5041, hp: 8923, def: 3869, critRate: 71, critDamage: 88, damageBonus: 46, enemyLevel: 93, resistance: 5, defenseReduction: 0, defenseIgnore: 12, resistancePenetration: 13, takenDamage: 0, breakEffect: 301.25 }
];

function fieldCandidate(record, active) {
  return runtime.buildCandidates([record], {
    characterId: "1321",
    partyIds: ["1321"],
    partyEidolons: { "1321": 0 },
    enemy: { count: 1, toughnessActive: false },
    stats: { breakEffect: 213.75 },
    traceLevelFor: () => 10
  }, { "dahlia-skill-field-active": active }).map((item) => ({
    ...item,
    applicable: item.applicable && runtime.applicableToAttack(item, { type: "superBreak", element: "Fire" })
  }));
}

function directOracle(data, level, profile, modifiers) {
  const source = data.attacks.find((item) => item.id === "132104");
  const child = { ...source, damageFormula: "statMultiplier", attackType: "followUp", traceLevel: level, multiplier: source.multipliers[level - 1] };
  const input = makeRequest(child, level, { ...profile, characterLevel: 80, eidolon: 0, enemyCount: 1, weakness: true, toughnessActive: false }, modifiers);
  input.character.stats.breakEffect = profile.breakEffect;
  const oneHit = independentDirectDamage({ ...input, attack: { ...input.attack, hitCount: 1 } });
  return Object.fromEntries(["nonCrit", "crit", "expected"].map((key) => [key, oneHit[key] * 5]));
}

function superBreakOracle(data, level, profile, baseToughness, fieldActive) {
  const def = 100 / (100 + (profile.enemyLevel + 20) * (1 - profile.defenseReduction / 100 - profile.defenseIgnore / 100));
  const res = 1 - (profile.resistance - profile.resistancePenetration) / 100;
  return data.breakBaseDamage[80] * (conversion[level - 1] / 100) * (baseToughness * (fieldActive ? 1.5 : 1) / 10)
    * (1 + profile.breakEffect / 100) * def * res * (1 + profile.takenDamage / 100);
}

test("Round13 Dahlia combines only the direct five-hit Talent FUA and its own SuperBreak from the same event", async () => {
  const definition = readJson(attackFile);
  const attack = definition.overrides.find((item) => item.id === "1321043");
  assert.ok(attack);
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  assert.equal(definition.generatedFrom.includes(fixedSourceSha), true);
  assert.equal(attack.damageFormula, "componentSequence");
  assert.equal(attack.type, "followUp");
  assert.equal(attack.characterId, "1321");
  assert.equal(attack.maximumEidolon, 0);
  assert.equal(attack.maximumTraceLevel, 10);
  assert.equal(attack.characterLevelExact, 80);
  assert.equal(attack.enemyCountExact, 1);
  assert.equal(attack.requiresBrokenTarget, true);
  assert.equal(attack.requiresFireWeakness, true);
  assert.deepEqual(attack.damageComponents.map((item) => [item.key, item.attackId]), [["direct", "132104"], ["superBreak", "1321042"]]);
  assert.deepEqual(attack.damageComponents[0].multipliers, directPerHit);
  assert.deepEqual(attack.damageComponents[1].multipliers, conversion);
  assert.equal(attack.numericModifierInputs[0].inputKey, "dahlia-fua-base-toughness");
  assert.equal(Object.hasOwn(attack.numericModifierInputs[0], "default"), false, "base toughness remains explicit");
  assert.match(attack.calculationNote, /30～60%変換.*含みません/);

  const { data, engine } = await loadProductionFixture();
  const parent = data.attacks.find((item) => item.id === attack.id);
  assert.ok(parent, "the coordinator must register the owned attack file");
  assert.equal(engine.unsupportedAttackReason(parent), "");
  assert.ok(data.attacks.some((item) => item.id === "132104"));
  assert.ok(data.attacks.some((item) => item.id === "1321042"));
  const field = readJson(modifierFile).modifiers.find((item) => item.id === "trace:1321:132102:field-break-efficiency");
  assert.ok(field);
  const directRecord = data.attacks.find((item) => item.id === "132104");
  const sbRecord = data.attacks.find((item) => item.id === "1321042");
  assert.ok(directRecord && sbRecord);
  const breakBaseDamage = data.breakBaseDamage;

  for (let level = 1; level <= 10; level += 1) {
    for (const profile of profiles) {
      for (const baseToughness of [7.25, 31.75]) {
        for (const fieldActive of [false, true]) {
          const base = makeRequest(parent, level, { ...profile, characterLevel: 80, eidolon: 0, enemyCount: 1, weakness: true, toughnessActive: false });
          base.character.stats.breakEffect = profile.breakEffect;
          base.breakBaseDamage = breakBaseDamage;
          base.modifierInputs = { "dahlia-fua-base-toughness": baseToughness };
          const scoped = fieldCandidate(field, fieldActive)[0];
          const directModifiers = [{ ...scoped, applicable: false, reason: "弱点撃破効率は直接ダメージに適用しません。" }];
          const direct = makeRequest(directRecord, level, { ...profile, characterLevel: 80, eidolon: 0, enemyCount: 1, weakness: true, toughnessActive: false }, directModifiers);
          direct.attack.damageFormula = "statMultiplier";
          direct.character.stats.breakEffect = profile.breakEffect;
          direct.modifierInputs = base.modifierInputs;
          direct.breakBaseDamage = breakBaseDamage;
          const superBreak = makeRequest(sbRecord, level, { ...profile, characterLevel: 80, eidolon: 0, enemyCount: 1, weakness: true, toughnessActive: false }, [scoped]);
          superBreak.character.stats.breakEffect = profile.breakEffect;
          superBreak.modifierInputs = base.modifierInputs;
          superBreak.breakBaseDamage = breakBaseDamage;
          base.sequenceComponents = [
            { key: "direct", name: attack.damageComponents[0].name, input: direct },
            { key: "superBreak", name: attack.damageComponents[1].name, input: superBreak }
          ];

          const expectedDirect = directOracle(data, level, profile, directModifiers);
          const expectedSuperBreak = superBreakOracle(data, level, profile, baseToughness, fieldActive);
          const result = engine.calculate(base);
          const label = `TalentLv${level}/BE${profile.breakEffect}/toughness${baseToughness}/field${fieldActive}`;
          assert.notEqual(result.supported, false, `${label}: ${result.reason}`);
          assertClose(result.components.direct.nonCrit, expectedDirect.nonCrit, `${label} direct component`);
          assertClose(result.components.superBreak.nonCrit, expectedSuperBreak, `${label} SuperBreak component`);
          for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], expectedDirect[key] + expectedSuperBreak, `${label} combined ${key}`);
          assertClose(result.components.superBreak.breakdown.finalBreakEffect, profile.breakEffect, `${label} BE breakdown`);
        }
      }
    }
  }

  const profile = profiles[0];
  const invalid = makeRequest(parent, 10, { ...profile, characterLevel: 80, eidolon: 0, enemyCount: 1, weakness: true, toughnessActive: false });
  invalid.character.stats.breakEffect = profile.breakEffect;
  invalid.breakBaseDamage = breakBaseDamage;
  invalid.sequenceComponents = [];
  assert.equal(engine.calculate(invalid).supported, false, "missing event components cannot return a partial sum");

  const makeValid = () => {
    const base = makeRequest(parent, 10, { ...profile, characterLevel: 80, eidolon: 0, enemyCount: 1, weakness: true, toughnessActive: false });
    base.character.stats.breakEffect = profile.breakEffect;
    base.breakBaseDamage = breakBaseDamage;
    base.modifierInputs = { "dahlia-fua-base-toughness": 7.25 };
    const scoped = fieldCandidate(field, false)[0];
    const direct = makeRequest(directRecord, 10, { ...profile, characterLevel: 80, eidolon: 0, enemyCount: 1, weakness: true, toughnessActive: false }, [{ ...scoped, applicable: false }]);
    direct.attack.damageFormula = "statMultiplier";
    direct.character.stats.breakEffect = profile.breakEffect;
    direct.modifierInputs = base.modifierInputs;
    direct.breakBaseDamage = breakBaseDamage;
    const superBreak = makeRequest(sbRecord, 10, { ...profile, characterLevel: 80, eidolon: 0, enemyCount: 1, weakness: true, toughnessActive: false }, [scoped]);
    superBreak.character.stats.breakEffect = profile.breakEffect;
    superBreak.modifierInputs = base.modifierInputs;
    superBreak.breakBaseDamage = breakBaseDamage;
    base.sequenceComponents = [
      { key: "direct", name: attack.damageComponents[0].name, input: direct },
      { key: "superBreak", name: attack.damageComponents[1].name, input: superBreak }
    ];
    return base;
  };
  for (const mutate of [
    (request) => { request.enemy.toughnessActive = true; },
    (request) => { request.enemy.weakness = false; },
    (request) => { request.enemy.count = 2; },
    (request) => { request.character.eidolon = 1; },
    (request) => { request.sequenceComponents[1].input.character.stats.atk += 1; },
    (request) => { request.sequenceComponents[0].input.enemy.resistance += 1; },
    (request) => { delete request.sequenceComponents[1].input.modifierInputs["dahlia-fua-base-toughness"]; }
  ]) {
    const request = JSON.parse(JSON.stringify(makeValid()));
    mutate(request);
    assert.equal(engine.calculate(request).supported, false, "invalid target, owner, or missing explicit state cannot return a partial sum");
  }
});
