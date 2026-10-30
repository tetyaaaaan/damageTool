"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  fixedSourceSha, loadProductionFixture, makeRequest, independentDirectDamage,
  assertClose, runtime
} = require("./helpers/hsrDirectVerification.cjs");
const attackDefs = require("../../games/hsr/data/calc/attacks-lingsha-round11.json");
const modifierDefs = require("../../games/hsr/data/calc/modifiers-lingsha-round11.json");
const baseCurve = [37.5, 41.25, 45, 48.75, 52.5, 56.25, 60.94, 65.62, 70.31, 75, 78.75, 82.5, 86.25, 90, 93.75];
const main = attackDefs.overrides.find(item => item.id === "122204");
const total = attackDefs.overrides.find(item => item.id === "1222062");
const e1Definition = modifierDefs.modifiers.find(item => item.id === "eidolon:1222:1:broken-enemy-defense-reduction");

function traceCap(eidolon) { return eidolon >= 3 ? 12 : 10; }
function candidates(records, eidolon, broken, inputs = {}) {
  const context = {
    characterId: "1222",
    eidolon,
    enemy: { toughnessActive: !broken },
    stats: { atk: 3175.25, hp: 9412.5, def: 1288.75, critRate: 37.5, critDamage: 113.25, damageBonus: 27.5 }
  };
  return runtime.buildCandidates(records, context, inputs);
}
function childRequest(parent, definition, level, enemy, allCandidates, inputState) {
  const traceLevel = definition.fixedTraceLevel || level;
  const multiplier = definition.multipliers[traceLevel - 1];
  const childAttack = {
    id: definition.attackId,
    characterId: "1222",
    sourceSkillId: definition.sourceSkillId,
    name: definition.name,
    type: definition.type,
    attackType: definition.type,
    element: definition.element,
    target: definition.target,
    scalingStat: definition.scalingStat,
    damageFormula: "statMultiplier",
    traceLevel,
    multiplier,
    hitCount: definition.hitCount,
    canCrit: true,
    requiredEidolon: definition.requiredEidolon,
    maximumEidolon: definition.requiredEidolon === 6 ? 6 : 0
  };
  const applied = allCandidates.filter(item => runtime.applicableToAttack(item, childAttack));
  return {
    key: definition.key,
    name: definition.name,
    input: {
      character: parent.character,
      enemy,
      attack: childAttack,
      modifiers: applied,
      modifierInputs: inputState
    }
  };
}

test("Pinned Lingsha records define Fuyuan main levels, E1/E3/E6 boundaries, and one-enemy E6 event", async () => {
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  const { data } = await loadProductionFixture();
  assert.ok(data.attacks.some(item => item.id === "122204" && item.provenance?.sourceCommit === fixedSourceSha));
  assert.ok(data.attacks.some(item => item.id === "1222061" && item.requiredEidolon === 6));
  assert.equal(main.maximumEidolon, 6);
  assert.equal(main.requiredEidolon, 0);
  assert.equal(main.maximumTraceLevel, 12);
  assert.equal(main.hitCount, 2);
  assert.deepEqual(Array.from(main.multipliers), baseCurve);
  assert.equal(total.requiredEidolon, 6);
  assert.equal(total.maximumEidolon, 6);
  assert.equal(total.characterLevelExact, 80);
  assert.equal(total.enemyCountExact, 1);
  assert.equal(total.hitCount, 6);
  assert.deepEqual(Array.from(total.multipliers), baseCurve.map(value => value * 2 + 200));
  assert.deepEqual(Array.from(total.damageComponents, component => component.attackId), ["122204", "1222061"]);
  assert.deepEqual(Array.from(total.damageComponents, component => component.hitCount), [2, 4]);
  assert.deepEqual(Array.from(total.damageComponents[1].multipliers), [50]);
  assert.equal(total.damageComponents[1].fixedTraceLevel, 1);
  assert.deepEqual(Array.from(total.comparisonModifierInputs && Object.keys(total.comparisonModifierInputs)), ["lingsha-fuyuan-on-field"]);
  assert.match(total.calculationNote, /本人の最終ATK/);
  assert.match(total.calculationNote, /同じ浮元攻撃イベント/);
  assert.match(total.calculationNote, /精霊への一般ステータス継承を仮定しません/);
  assert.match(total.resultSummary, /本体のみの値と足し合わせない/);
  const character = data.characters.find(item => item.id === "1222");
  const rank3 = character.eidolons.find(item => item.rank === 3);
  const rank5 = character.eidolons.find(item => item.rank === 5);
  assert.deepEqual(Array.from(rank3.levelUpSkills, item => [item.id, item.num]), [["122203", 2], ["122204", 2]]);
  assert.deepEqual(Array.from(rank5.levelUpSkills, item => [item.id, item.num]), [["122202", 2], ["122201", 1]]);
  assert.ok(data.structuredModifiers.some(item => item.id === "eidolon:1222:2:ultimate-break-effect"));
  assert.ok(data.structuredModifiers.some(item => item.id === "eidolon:1222:6:fuyuan-all-res-down"));
  assert.deepEqual(e1Definition.value, { kind: "fixed", fixed: 20 });
  assert.equal(e1Definition.activation.mode, "statThreshold");
  assert.equal(e1Definition.activation.reference, "enemy.toughnessBroken");
  assert.equal(e1Definition.activation.operator, ">=");
  const includedE1 = candidates([e1Definition], 1, true, { [e1Definition.finalStatsInclusion.inputKey]: true });
  assert.equal(includedE1[0].enabled, false, "the E1 enemy DEF reduction is not applied twice when included in the enemy input");
  for (let eidolon = 0; eidolon <= 6; eidolon++) {
    const cap = Math.min(15, 10 + character.eidolons.filter(rank => rank.rank <= eidolon).flatMap(rank => rank.levelUpSkills || []).filter(skill => skill.id === "122204").reduce((sum, skill) => sum + skill.num, 0));
    assert.equal(cap, traceCap(eidolon));
    assert.equal(cap, eidolon >= 3 ? 12 : 10);
    for (let level = 1; level <= cap; level++) assert.equal(main.multipliers[level - 1], baseCurve[level - 1], `E${eidolon} Talent Lv${level}`);
  }
  for (let level = 1; level <= 12; level++) {
    assert.equal(total.damageComponents[0].multipliers[level - 1], baseCurve[level - 1], `E6 base Lv${level}`);
    assert.equal(total.multipliers[level - 1], baseCurve[level - 1] * 2 + 4 * 50, `E6 event total Lv${level}`);
  }
});

test("E0-E6 Fuyuan main hits independently calculate across the actual rank-adjusted Talent level range", async () => {
  const { engine, data } = await loadProductionFixture();
  const rank1 = data.structuredModifiers.find(item => item.id === e1Definition.id);
  const rank2 = data.structuredModifiers.find(item => item.id === "eidolon:1222:2:ultimate-break-effect");
  const rank6 = data.structuredModifiers.find(item => item.id === "eidolon:1222:6:fuyuan-all-res-down");
  assert.ok(rank1 && rank2 && rank6);
  const profile = { atk: 3175.25, hp: 9412.5, def: 1288.75, critRate: 37.5, critDamage: 113.25, damageBonus: 27.5, enemyLevel: 83, enemyCount: 1, resistance: 20, defenseReduction: 12.5, defenseIgnore: 7.5 };
  for (let eidolon = 0; eidolon <= 6; eidolon++) {
    for (let level = 1; level <= traceCap(eidolon); level++) {
      for (const broken of [false, true]) {
        const state = { ...main.comparisonModifierInputs, "lingsha-e2-ultimate-break-effect": eidolon >= 2 };
        const built = candidates([rank1, rank2, rank6], eidolon, broken, state);
        const applied = built.filter(item => runtime.applicableToAttack(item, main));
        const input = makeRequest(main, level, { ...profile, eidolon, toughnessActive: !broken }, applied);
        const actual = engine.calculate(input);
        assert.notEqual(actual.supported, false, `E${eidolon} Talent Lv${level}, broken=${broken}`);
        const oneHit = independentDirectDamage({ ...input, attack: { ...input.attack, multiplier: baseCurve[level - 1], hitCount: 1 } });
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], oneHit[key] * 2, `main E${eidolon} Lv${level} ${key} broken=${broken}`);
        assert.equal(actual.applied.some(item => item.id === rank6.id), eidolon === 6, "Fuyuan attack itself establishes E6 presence");
        assertClose(actual.breakdown.referenceValue, profile.atk, "Lingsha's own final ATK is the reference");
        assert.equal(actual.applied.some(item => item.id === rank1.id), eidolon >= 1 && broken, `E1 broken target condition E${eidolon}/${broken}`);
      }
    }
  }
});

test("E6 one-enemy Fuyuan attack combines its main two hits and four additions with E1/E6 rank effects", async () => {
  const { engine, data } = await loadProductionFixture();
  const rank1 = data.structuredModifiers.find(item => item.id === e1Definition.id);
  const rank2 = data.structuredModifiers.find(item => item.id === "eidolon:1222:2:ultimate-break-effect");
  const rank6 = data.structuredModifiers.find(item => item.id === "eidolon:1222:6:fuyuan-all-res-down");
  assert.ok(rank1 && rank2 && rank6);
  const profile = { atk: 3175.25, hp: 9412.5, def: 1288.75, critRate: 37.5, critDamage: 113.25, damageBonus: 27.5, enemyLevel: 83, enemyCount: 1, resistance: 20, defenseReduction: 12.5, defenseIgnore: 7.5 };
  for (let level = 1; level <= 12; level++) for (const broken of [false, true]) {
    const state = {
      ...total.comparisonModifierInputs,
      "lingsha-e2-ultimate-break-effect": true
    };
    const built = candidates([rank1, rank2, rank6], 6, broken, state);
    assert.equal(built.find(item => item.id === rank6.id)?.enabled, true, "E6 RES reduction is active for this Fuyuan event");
    assert.equal(built.find(item => item.id === rank1.id)?.enabled, broken, "E1 DEF reduction follows enemy broken state automatically");
    const parent = makeRequest(total, level, { ...profile, eidolon: 6, toughnessActive: !broken });
    parent.modifierInputs = state;
    const sequence = total.damageComponents.map(definition => childRequest(parent, definition, level, parent.enemy, built, state));
    parent.sequenceComponents = sequence;
    const actual = engine.calculate(parent);
    assert.notEqual(actual.supported, false, `E6 Lv${level}, broken=${broken}: ${actual.reason || ""}`);
    const mainInput = sequence[0].input;
    const extraInput = sequence[1].input;
    const mainOracle = independentDirectDamage({ ...mainInput, attack: { ...mainInput.attack, multiplier: baseCurve[level - 1], hitCount: 1 } });
    const extraOracle = independentDirectDamage({ ...extraInput, attack: { ...extraInput.attack, multiplier: 50, hitCount: 1 } });
    for (const key of ["nonCrit", "crit", "expected"]) {
      assertClose(actual[key], mainOracle[key] * 2 + extraOracle[key] * 4, `E6 event Lv${level} ${key} broken=${broken}`);
    }
    assert.equal(Object.keys(actual.components || {}).length, 2);
    assert.equal(actual.applied.some(item => item.id === rank6.id), true);
    assert.equal(actual.applied.some(item => item.id === rank1.id), broken);
    assertClose(actual.components["fuyuan-main-two-hit"].breakdown.referenceValue, profile.atk, "aggregate main hit reference value");
    assertClose(actual.components["e6-four-extra-hit"].breakdown.referenceValue, profile.atk, "aggregate E6 hit reference value");
  }
});