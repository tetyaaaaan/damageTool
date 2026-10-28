"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fixedSourceSha, loadProductionFixture, attackOf, makeRequest, independentDirectDamage, assertClose, runtime } = require("./helpers/hsrDirectVerification.cjs");

const curves = {
  "122201": [50, 60, 70, 80, 90, 100],
  "122202": [40, 44, 48, 52, 56, 60, 65, 70, 75, 80],
  "122203": [90, 96, 102, 108, 114, 120, 127.5, 135, 142.5, 150],
  "122204": [37.5, 41.25, 45, 48.75, 52.5, 56.25, 60.938, 65.625, 70.313, 75]
};
const profiles = [
  { atk: 3175.25, hp: 9412.5, def: 1288.75, critRate: 37.5, critDamage: 113.25, damageBonus: 27.5, enemyLevel: 83, resistance: 30, defenseReduction: 12.5, defenseIgnore: 7.5 },
  { atk: 2143.75, hp: 14321.5, def: 3541.25, critRate: 71.25, critDamage: 87.5, damageBonus: 11.75, enemyLevel: 76, resistance: 10, resistancePenetration: 5 }
];

test("Lingsha E0 source records pin ordinary actions and Fuyuan precision separately", async () => {
  const { data } = await loadProductionFixture();
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  for (const [id, curve] of Object.entries(curves)) {
    const attack = attackOf(data, id);
    assert.equal(attack.support?.status, "calculable", id);
    assert.equal(attack.support?.verified, true, id);
    assert.equal(attack.provenance?.sourceCommit, fixedSourceSha, id);
    assert.equal(attack.maximumEidolon, 0, id);
    assert.equal(attack.scalingStat, "atk", id);
    assert.equal(attack.enemyCountExact, 1, id);
    assert.deepEqual(Array.from(attack.multipliers).slice(0, curve.length), curve, id + " adopted fixed/release precision");
  }
  const fuyuan = attackOf(data, "122204");
  assert.equal(fuyuan.type, "followUp");
  assert.equal(fuyuan.hitCount, 2);
  assert.equal(fuyuan.target, "single", "the fixture is explicitly limited to one enemy for equal hit comparison");
  assert.match(fuyuan.provenance?.precisionNote || "", /60\.94|60\.938/);
});

test("Lingsha E0 levels independently calculate with isolated stats and real Robin Skill state", async () => {
  const { data, engine } = await loadProductionFixture();
  const lingshaMods = data.structuredModifiers;
  const robinSkill = lingshaMods.find(m => m.id === "trace:1309:130902:party-damage");
  assert.ok(robinSkill, "Robin party Skill modifier exists");
  for (const id of Object.keys(curves)) {
    const attack = attackOf(data, id), max = id === "122201" ? 6 : 10;
    for (let level = 1; level <= max; level++) for (const profile of profiles) for (const robinOn of [false, true]) {
      const context = { characterId: "1222", eidolon: 0, stats: profile, traceLevelFor: () => level, partyIds: ["1309"], partyEidolons: { "1309": 0 } };
      // Profile critDamage is treated as completed input including Robin Talent; this case isolates Robin Skill.
      const native = runtime.buildCandidates(lingshaMods, context, { "break-befog-active": true, "robin-talent-crit-in-final-stats": true }).filter(m => runtime.applicableToAttack(m, attack));
      const robin = runtime.buildCandidates([robinSkill], { ...context, characterId: "1222", partyIds: ["1309"], traceLevelFor: () => 10 }, { "robin-skill-damage-active": robinOn })[0];
      assert.equal(robin.value, 50);
      assert.equal(robin.enabled, robinOn);
      const robinForAttack = { ...robin, applicable: robin.applicable && runtime.applicableToAttack(robin, { ...attack, attackType: attack.type }) };
      const input = makeRequest(attack, level, profile, [...native, robinForAttack]);
      input.attack = { ...input.attack, multiplier: curves[id][level - 1], hitCount: id === "122204" ? 2 : 1 };
      const independentMods = [...(robinOn ? [{ category: "damageBonus", value: 50 }] : [])];
      const expected = independentDirectDamage({ ...input, modifiers: independentMods, attack: { ...input.attack, hitCount: 1 } });
      const actual = engine.calculate(input);
      assert.notEqual(actual.supported, false, id + " Lv" + level);
      for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key] * input.attack.hitCount, id + " Lv" + level + " Robin=" + robinOn + " " + key);
      assertClose(actual.breakdown.referenceValue, profile.atk, id + " final ATK");
      assert.equal(actual.applied.some(m => m.id === robinSkill.id), robinOn, "Robin Skill state applied once");
      assert.equal(actual.applied.some(m => /break-vulnerability|besotted/i.test(m.id || "")), false, "Break vulnerability excluded from ordinary actions");
      assert.equal(actual.attack.hitCount, input.attack.hitCount);
      if (id === "122204") assertClose(actual.perHit.nonCrit, actual.nonCrit / 2, "equal AoE plus additional hit");
    }
  }
});

test("Lingsha ordinary Ultimate excludes Fuyuan and Befog, while break vulnerability stays Break-only", async () => {
  const { data, engine } = await loadProductionFixture();
  const ult = attackOf(data, "122203"), profile = profiles[0];
  const input = makeRequest(ult, 10, profile);
  input.attack = { ...input.attack, multiplier: 150, hitCount: 1 };
  const base = engine.calculate(input);
  assertClose(base.nonCrit, independentDirectDamage(input).nonCrit, "ordinary Ultimate independently calculated");
  assert.equal(base.attack.hitCount, 1);
  assert.equal(base.components, undefined, "Fuyuan is not an Ultimate component");
  assert.equal(ult.damageComponents, undefined);
  assert.doesNotMatch(ult.conditionText + ult.calculationNote, /浮元不在/);
  assert.match(ult.calculationNote, /独立した別行動/);
  const special = data.structuredModifiers.find(m => m.id === "trace:1222:122203:break-vulnerability");
  assert.ok(special, "Befog runtime record exists");
  assert.ok(["displayOnly", "calculable"].includes(special.support?.status), "Befog has a real support classification");
  const befog = runtime.buildCandidates([special], { characterId: "1222", eidolon: 0, traceLevelFor: () => 10 }, { "break-befog-active": true })[0];
  assert.equal(befog.enabled, true);
  for (const id of Object.keys(curves)) {
    const attack = attackOf(data, id);
    assert.equal(runtime.applicableToAttack(befog, { ...attack, attackType: attack.type }), false, id + " excludes Befog from direct action");
  }
});

test("Lingsha all E0 actions isolate ATK and never rebuild entered ATK from Break Effect",async()=>{
 const {data,engine}=await loadProductionFixture();for(const [id,curve]of Object.entries(curves))for(const profile of profiles){const a=attackOf(data,id),level=id==="122201"?6:10,input=makeRequest(a,level,{...profile,baseAtk:1123.5});input.attack={...input.attack,multiplier:curve[level-1],hitCount:id==="122204"?2:1};const base=engine.calculate(input);for(const stat of ["atk","hp","def","breakEffect"]){const changed={...input,character:{...input.character,stats:{...input.character.stats,[stat]:(input.character.stats[stat]||0)+731.25}}};const actual=engine.calculate(changed),expected=independentDirectDamage({...changed,attack:{...changed.attack,hitCount:1}});for(const key of ["nonCrit","crit","expected"])assertClose(actual[key],expected[key]*input.attack.hitCount,id+" "+stat+" "+key);if(stat==="atk")assert.ok(actual.nonCrit>base.nonCrit);else assertClose(actual.nonCrit,base.nonCrit,id+" final ATK does not change with "+stat);}}
});
