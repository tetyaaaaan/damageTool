"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  fixedSourceSha,
  loadProductionFixture,
  makeRequest,
  independentDirectDamage,
  assertClose,
  readJson
} = require("./helpers/hsrDirectVerification.cjs");

const file = "games/hsr/data/calc/attacks-cyrene-phainon-round32.json";
const attack = readJson(file).overrides[0];
const params = {
  1: { hits: 5, percent: 5 },
  6: { hits: 5, percent: 10 }
};
const profile = {
  atk: 4217,
  hp: 7711,
  def: 1943,
  baseAtk: 1043,
  baseHp: 1217,
  baseDef: 987,
  critRate: 37,
  critDamage: 143,
  damageBonus: 31,
  enemyLevel: 82,
  resistance: 33,
  toughnessActive: true,
  defenseReduction: 11,
  defenseIgnore: 4,
  resistancePenetration: 7,
  takenDamage: 9
};

test("Round32 pins Cyrene 1141521 five-hit Fire add-on to Phainon's ATK and E0 Mem Skill Lv1-6", () => {
  const definition = readJson(file);
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  assert.match(definition.generatedFrom, new RegExp(fixedSourceSha));
  assert.equal(attack.id, "11415211");
  assert.equal(attack.characterId, "1408");
  assert.equal(attack.statReferenceId, "1408");
  assert.equal(attack.sourceCharacterId, "1415");
  assert.equal(attack.sourceSkillId, "1141521");
  assert.equal(attack.element, "Fire");
  assert.equal(attack.type, "additional");
  assert.equal(attack.scalingStat, "atk");
  assert.equal(attack.hitCount, 5);
  assert.deepEqual(attack.multipliers, [5, 6, 7, 8, 9, 10]);
  assert.equal(attack.maximumEidolon, 0);
  assert.equal(attack.maximumTraceLevel, 6);
  assert.deepEqual(attack.modifierConditions.map(c=>c.inputKey), ["cyrene-phainon-blessing-active", "phainon-kaslana-form"]);
  assert.deepEqual(attack.numericModifierInputs.map(item => item.inputKey), ["element-damage:1408:Fire", "enemy-resistance:Fire"]);
  assert.match(attack.calculationNote, /1ヒット分の係数/);
  assert.match(attack.calculationNote, /敵1体/);
});

test("Round32 independent Lv1/Lv6 oracle checks per-hit and five-hit NC/C/EV separately", async () => {
  const { data, engine } = await loadProductionFixture();
  const productionAttack = data.attacks.find(a=>a.id===attack.id);
  assert.ok(productionAttack);

  for (const level of [1, 6]) {
    const coefficient = params[level].percent;
    const request = makeRequest(productionAttack, level, profile);
    request.character.id = "1408";
    request.attack.multiplier = coefficient;
    request.attack.hitCount = params[level].hits;
    request.attack.cyreneBlessingActive = true;
    request.modifierInputs = {
      "cyrene-phainon-blessing-active": true,
      "phainon-kaslana-form": true,
      "element-damage:1408:Fire": profile.damageBonus,
      "enemy-resistance:Fire": profile.resistance
    };
    request.character.stats.damageBonuses = { Fire: profile.damageBonus, Physical: 8 };

    const expected = independentDirectDamage({...request,attack:{...request.attack,multiplier:coefficient*5,hitCount:1}});
    const result = engine.calculate(request);
    assert.notEqual(result.supported, false, result.reason || `Lv${level}`);
    assertClose(expected.effectiveReferenceValue, profile.atk, `Lv${level} references Phainon ATK`);
    assertClose(expected.nonCrit, profile.atk * coefficient / 100
      * (1 + profile.damageBonus / 100)
      * ((80 + 20) / ((80 + 20) + (profile.enemyLevel + 20) * (1 - (profile.defenseReduction + profile.defenseIgnore) / 100)))
      * (1 - (profile.resistance - profile.resistancePenetration) / 100)
      * 0.9 * (1 + profile.takenDamage / 100) * params[level].hits,
    `Lv${level} independent five-hit nonCrit`);
    assertClose(result.nonCrit, expected.nonCrit, `Lv${level} five-hit nonCrit`);
    assertClose(result.crit, expected.crit, `Lv${level} five-hit crit`);
    assertClose(result.expected, expected.expected, `Lv${level} five-hit EV`);
    assertClose(result.perHit.nonCrit, expected.nonCrit / 5, `Lv${level} per-hit nonCrit`);
    assertClose(result.perHit.crit, expected.crit / 5, `Lv${level} per-hit crit`);
    assertClose(result.perHit.expected, expected.expected / 5, `Lv${level} per-hit EV`);
    assert.equal(result.attack.hitCount, 5);
    assert.equal(result.breakdown.multiplierPercent, coefficient, "do not pre-multiply the one-hit coefficient by five");
    assert.equal(result.breakdown.damageBonus, profile.damageBonus, "Fire DMG input is used, not Physical DMG");
  }
});
