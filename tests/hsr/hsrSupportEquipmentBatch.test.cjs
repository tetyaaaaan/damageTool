"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fixedSourceSha, loadProductionFixture, makeRequest, runtime, assertMatchesIndependent, assertClose } = require("./helpers/hsrDirectVerification.cjs");

function directAttack(type, element = "Fire") {
  return { id: "support-equipment-batch", type, element, scalingStat: "atk", multipliers: Array(10).fill(100), canCrit: true, target: "single" };
}

function breakInput(data, modifiers = [], element = "Fire") {
  return {
    character: { level: 80, eidolon: 0, stats: { breakEffect: 173.25 } },
    enemy: { level: 87, weakness: true, maxToughness: 300, defenseReduction: 12.5, defenseIgnore: 4, resistance: 20, resistancePenetration: 3, takenDamage: 9 },
    element, multiplier: element === "Fire" ? 2 : 1, modifiers, breakBaseDamage: data.breakBaseDamage
  };
}

const huohuoAtk = [24, 25.6, 27.2, 28.8, 30.4, 32, 34, 36, 38, 40];
const lc21056 = [16, 18, 20, 22, 24];

test("Huohuo Ultimate ATK support is conditional, level-ranked, party-only, and excluded from Huohuo herself", async () => {
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  const { data, engine } = await loadProductionFixture();
  const records = data.structuredModifiers.filter((record) => record.id === "trace:1217:121703:party-atk");
  assert.equal(records.length, 1);
  const record = records[0];
  assert.equal(record.activation.mode, "toggle");
  assert.equal(record.activation.inputKey, "huohuo-ultimate-atk-active");
  assert.equal(record.providerScope, "party");

  for (let level = 1; level <= 10; level++) {
    const context = { characterId: "1001", partyIds: ["1217"], eidolon: 0, traceLevelFor: () => level };
    const off = runtime.buildCandidates(records, context)[0];
    const on = runtime.buildCandidates(records, context, { "huohuo-ultimate-atk-active": true })[0];
    assert.equal(off.enabled, false);
    assert.equal(off.automatic, false);
    assert.equal(on.value, huohuoAtk[level - 1]);
    assert.equal(on.enabled, true);
    assert.equal(on.automatic, false);
    const req = makeRequest(directAttack("skill"), 10, { atk: 2444.25, baseAtk: 1000.5 }, [on]);
    const result = engine.calculate(req);
    const baseline = engine.calculate(makeRequest(directAttack("skill"), 10, { atk: 2444.25, baseAtk: 1000.5 }, []));
    assert.notEqual(result.supported, false);
    assertClose(result.nonCrit / baseline.nonCrit, (2444.25 + 1000.5 * huohuoAtk[level - 1] / 100) / 2444.25, "Huohuo final ATK Lv" + level);
    assertMatchesIndependent(engine, req, "Huohuo Ultimate Lv" + level);
    assert.ok(result.nonCrit > baseline.nonCrit);

    // If UID's imported final ATK already contains this buff, leaving the toggle off
    // reproduces the same direct damage without adding the buff twice.
    const includedAtk = 2444.25 + 1000.5 * huohuoAtk[level - 1] / 100;
    const imported = engine.calculate(makeRequest(directAttack("skill"), 10, { atk: includedAtk, baseAtk: 1000.5 }, []));
    assertClose(imported.nonCrit, result.nonCrit, "Huohuo no-double-count Lv" + level);
  }
  assert.equal(runtime.buildCandidates(records, { characterId: "1001", partyIds: [], traceLevelFor: () => 10 }, { "huohuo-ultimate-atk-active": true }).length, 0, "party removal removes support");
  assert.equal(runtime.buildCandidates(records, { characterId: "1217", partyIds: [], traceLevelFor: () => 10 }, { "huohuo-ultimate-atk-active": true }).length, 0, "provider cannot receive own Ultimate ATK buff");
});

test("LC 21056 automatically boosts only Weakness Break damage at all five refinements", async () => {
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  const { data, engine } = await loadProductionFixture();
  const records = data.structuredModifiers.filter((record) => record.id === "lightCone:21056:party-break-damage");
  assert.equal(records.length, 1);
  assert.equal(records[0].activation.mode, "always");
  assert.equal(records[0].category, "breakDamage");
  assert.deepEqual(Array.from(records[0].target.attackTypes), ["break"]);

  for (let refinement = 1; refinement <= 5; refinement++) {
    const candidate = runtime.buildCandidates(records, {
      characterId: "1001", partyIds: [], partyEquipment: [{ characterId: "1313", lightConeId: "21056", refinement }]
    })[0];
    assert.equal(candidate.value, lc21056[refinement - 1]);
    assert.equal(candidate.enabled, true);
    assert.equal(candidate.automatic, true);
    assert.equal(runtime.applicableToAttack(candidate, { type: "break", element: "Fire" }), true);
    assert.equal(runtime.applicableToAttack(candidate, { type: "superBreak", element: "Fire" }), false, "Super Break scope remains unverified");
    assert.equal(runtime.applicableToAttack(candidate, directAttack("skill", "Fire")), false, "direct attack damage is not Weakness Break damage");

    const baselineInput = breakInput(data);
    const base = engine.calculateBreak(baselineInput);
    const withLC = engine.calculateBreak({ ...baselineInput, modifiers: [candidate] });
    assert.equal(base.supported, true);
    assert.equal(withLC.supported, true);
    assertClose(withLC.value / base.value, 1 + lc21056[refinement - 1] / 100, "LC 21056 S" + refinement);
    assertClose(withLC.breakDamageBonus, lc21056[refinement - 1], "LC 21056 registered percentage S" + refinement);
    const disabled = engine.calculateBreak({ ...baselineInput, modifiers: [{ ...candidate, enabled: false }] });
    assertClose(disabled.value, base.value, "LC 21056 toggle-equivalent removal S" + refinement);
  }
  assert.equal(runtime.buildCandidates(records, { characterId: "1001", partyEquipment: [] }).length, 0, "removing the LC from party removes support");
});

test("Firesmith 4pc keeps Skill +12% and adds a user-selected next Fire damage +12% only", async () => {
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  const { data, engine } = await loadProductionFixture();
  const skillRecords = data.structuredModifiers.filter((record) => record.id === "relic:107:4pc:skill-damage");
  const nextFireRecords = data.structuredModifiers.filter((record) => record.id === "relic:107:4pc:next-fire-damage");
  assert.equal(skillRecords.length, 1);
  assert.equal(nextFireRecords.length, 1);
  const context = { characterId: "1001", relicIds: ["107"], relicMode: 4 };
  const skill = runtime.buildCandidates(skillRecords, context)[0];
  assert.equal(skill.value, 12);
  assert.equal(skill.automatic, true);
  assert.equal(runtime.buildCandidates(skillRecords, { ...context, relicMode: 2 }).length, 0);
  assert.equal(runtime.buildCandidates(skillRecords, { ...context, relicIds: [] }).length, 0);
  const nextOff = runtime.buildCandidates(nextFireRecords, context)[0];
  const nextOn = runtime.buildCandidates(nextFireRecords, context, { "firesmith-ultimate-next-fire-active": true })[0];
  assert.equal(nextOff.enabled, false);
  assert.equal(nextOn.enabled, true);
  assert.equal(nextOn.automatic, false);
  assert.equal(runtime.buildCandidates(nextFireRecords, { ...context, relicMode: 2 }, { "firesmith-ultimate-next-fire-active": true }).length, 0);
  assert.equal(runtime.buildCandidates(nextFireRecords, { ...context, relicIds: [] }, { "firesmith-ultimate-next-fire-active": true }).length, 0);

  for (const type of ["normal", "ultimate", "followUp"]) {
    assert.equal(runtime.applicableToAttack(nextOn, directAttack(type, "Fire")), true, "selected attack may be any type: " + type);
    assert.equal(runtime.applicableToAttack(nextOn, directAttack(type, "Ice")), false, "non-Fire element is excluded: " + type);
    const request = makeRequest(directAttack(type, "Fire"), 10, { damageBonus: 10 }, [nextOn]);
    assertMatchesIndependent(engine, request, "Firesmith next Fire " + type);
    const on = engine.calculate(request);
    const off = engine.calculate(makeRequest(directAttack(type, "Fire"), 10, { damageBonus: 10 }, [nextOff]));
    assertClose(on.nonCrit / off.nonCrit, 1.22 / 1.1, "Firesmith next Fire +12 " + type);
  }
  assert.equal(runtime.applicableToAttack(nextOn, directAttack("dot", "Fire")), false, "DoT inheritance is outside this direct-next-attack acceptance");
  for (const type of ["normal", "ultimate", "followUp", "dot"]) {
    const req = makeRequest(directAttack(type, "Ice"), 10, { damageBonus: 10 }, [nextOn]);
    const actual = engine.calculate(req);
    const baseline = engine.calculate(makeRequest(directAttack(type, "Ice"), 10, { damageBonus: 10 }, []));
    assertClose(actual.nonCrit, baseline.nonCrit, "Firesmith does not affect non-Fire " + type);
  }

  for (const type of ["skill", "enhancedSkill"]) {
    const req = makeRequest(directAttack(type, "Fire"), 10, { damageBonus: 10 }, [skill, nextOn]);
    const result = engine.calculate(req);
    const withoutSetEffects = engine.calculate(makeRequest(directAttack(type, "Fire"), 10, { damageBonus: 10 }, []));
    assertClose(result.nonCrit / withoutSetEffects.nonCrit, 1.34 / 1.1, "Firesmith distinct skill + next Fire bonuses, with the existing 2pc +10% included once");
    assertMatchesIndependent(engine, req, "Firesmith combined effects " + type);
  }
});
test("Huohuo E1 speed requires Eidolon 1 and manually selected valid Talent Protection", async () => {
  const { data } = await loadProductionFixture();
  const records = data.structuredModifiers.filter((record) => record.id === "eidolon:1217:1:party-speed");
  assert.equal(records.length, 1);
  const record = records[0];
  assert.equal(record.source.eidolonRank, 1);
  assert.equal(record.activation.inputKey, "huohuo-e1-protection-active");
  const targetContext = { characterId: "1001", partyIds: ["1217"], partyEidolons: { "1217": 0 } };
  assert.equal(runtime.buildCandidates(records, targetContext, { "huohuo-e1-protection-active": true }).length, 0, "E0 Huohuo cannot provide E1 speed");
  const e1Context = { ...targetContext, partyEidolons: { "1217": 1 } };
  const off = runtime.buildCandidates(records, e1Context)[0];
  const on = runtime.buildCandidates(records, e1Context, { "huohuo-e1-protection-active": true })[0];
  assert.equal(off.value, 12);
  assert.equal(off.enabled, false);
  assert.equal(off.automatic, false, "the Talent's runtime protection state requires user input");
  assert.equal(on.enabled, true);
  assert.equal(on.value, 12);
  assert.equal(on.category, "statPercent");
  assert.equal(on.stat, "speed");
  assert.equal(runtime.buildCandidates(records, { characterId: "1001", partyIds: [] }, { "huohuo-e1-protection-active": true }).length, 0, "removing the provider removes E1 speed");
  const selfAtE1 = runtime.buildCandidates(records, { characterId: "1217", eidolon: 1 }, { "huohuo-e1-protection-active": true })[0];
  assert.equal(selfAtE1.enabled, true, "E1 says all allies, including Huohuo");
});

test("Huohuo E6 damage support is limited to an ally healed by the E6 provider", async () => {
  const { data, engine } = await loadProductionFixture();
  const records = data.structuredModifiers.filter((record) => record.id === "eidolon:1217:6:healed-ally-damage");
  assert.equal(records.length, 1);
  const record = records[0];
  assert.equal(record.source.eidolonRank, 6);
  assert.equal(record.activation.inputKey, "huohuo-e6-heal-buff");
  const targetContext = { characterId: "1001", partyIds: ["1217"], partyEidolons: { "1217": 5 } };
  assert.equal(runtime.buildCandidates(records, targetContext, { "huohuo-e6-heal-buff": true }).length, 0, "E5 cannot provide E6 effect");
  const e6Context = { ...targetContext, partyEidolons: { "1217": 6 } };
  const off = runtime.buildCandidates(records, e6Context)[0];
  const on = runtime.buildCandidates(records, e6Context, { "huohuo-e6-heal-buff": true })[0];
  assert.equal(off.enabled, false);
  assert.equal(off.automatic, false, "healing and recipient are an explicitly selected state");
  assert.equal(on.enabled, true);
  assert.equal(on.value, 50);
  assert.equal(on.target.owner, "activeAlly");

  const request = makeRequest(directAttack("skill", "Wind"), 10, { damageBonus: 10 }, [on]);
  const result = engine.calculate(request);
  const baseline = engine.calculate(makeRequest(directAttack("skill", "Wind"), 10, { damageBonus: 10 }, []));
  assert.notEqual(result.supported, false);
  assertClose(result.nonCrit / baseline.nonCrit, 1.6 / 1.1, "Huohuo E6 +50% with existing 10% final damage bonus included once");
  assertMatchesIndependent(engine, request, "Huohuo E6 healed ally direct damage");
  for (const type of ["normal", "ultimate", "followUp", "dot"]) {
    assertMatchesIndependent(engine, makeRequest(directAttack(type, "Wind"), 10, {}, [on]), "Huohuo E6 " + type);
  }
  const recipientRemoved = runtime.buildCandidates(records, { characterId: "1001", partyIds: [] }, { "huohuo-e6-heal-buff": true });
  assert.equal(recipientRemoved.length, 0, "removing Huohuo removes her party support");
  const huohuoSelf = runtime.buildCandidates(records, { characterId: "1217", eidolon: 6 }, { "huohuo-e6-heal-buff": true })[0];
  assert.equal(huohuoSelf.enabled, true, "the rank text does not exclude Huohuo when she is healed");
});
test('Huohuo E3 extends Ultimate ATK support to independent Lv11 and Lv12 values',async()=>{
 const{data,engine}=await loadProductionFixture();const records=data.structuredModifiers.filter(m=>m.id==='trace:1217:121703:party-atk');
 for(const [level,value]of [[11,41.6],[12,43.2]])for(const eidolon of [0,2,3,6]){
  const m=runtime.buildCandidates(records,{characterId:'1003',partyIds:['1217'],partyEidolons:{1217:eidolon},traceLevelFor:()=>level},{'huohuo-ultimate-atk-active':true})[0];
  assert.equal(m.applicable,eidolon>=3);assertClose(m.value,value,'fixed-source E3 curve');
  if(eidolon>=3){const a=directAttack('normal','Fire');const r=engine.calculate(makeRequest(a,1,{atk:3000,baseAtk:1000},[m]));assertClose(r.nonCrit,(3000+1000*value/100)*0.36,'high-level independent damage');}
 }
});
