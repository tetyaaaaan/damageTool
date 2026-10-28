"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { fixedSourceSha, loadProductionFixture, makeRequest, runtime, assertClose } = require("./helpers/hsrDirectVerification.cjs");

const attack = (type, element = "Fire") => ({ id: "lc-round2-" + type, type, element, scalingStat: "atk", multipliers: Array(10).fill(100), canCrit: true, target: "single" });
const refinements = {
  "lightCone:20009:high-hp-damage": [20, 25, 30, 35, 40],
  "lightCone:20011:slowed-enemy-damage": [24, 30, 36, 42, 48],
  "lightCone:21006:followup-damage": [24, 30, 36, 42, 48],
  "lightCone:21006:followup-low-hp-extra": [24, 30, 36, 42, 48],
  "lightCone:21012:base-damage": [20, 25, 30, 35, 40],
  "lightCone:21012:equal-or-higher-hp-damage": [20, 25, 30, 35, 40],
  "lightCone:21017:normal-skill-damage": [24, 30, 36, 42, 48],
  "lightCone:21017:normal-skill-full-energy-extra": [24, 30, 36, 42, 48],
  "lightCone:21013:ultimate-damage": [32, 40, 48, 56, 64]
};
const inputs = {
  "lightCone:20011:slowed-enemy-damage": "lc-20011-enemy-slowed",
  "lightCone:21017:normal-skill-full-energy-extra": "lc-21017-energy-percent"
};
const paths = {
  "lightCone:20009:high-hp-damage": "Warrior",
  "lightCone:20011:slowed-enemy-damage": "Warlock",
  "lightCone:21006:followup-damage": "Mage",
  "lightCone:21006:followup-low-hp-extra": "Mage",
  "lightCone:21012:base-damage": "Warrior",
  "lightCone:21012:equal-or-higher-hp-damage": "Warrior",
  "lightCone:21017:normal-skill-damage": "Rogue",
  "lightCone:21017:normal-skill-full-energy-extra": "Rogue",
  "lightCone:21013:ultimate-damage": "Mage"
};

function equippedContext(id, refinement) {
  return { characterId: "1001", lightConeId: id.split(":")[1], refinement };
}

test("six newly connected light cones match literal S1-S5 values, requirements, scope, removal, and save restore", async () => {
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  const { data, engine } = await loadProductionFixture();
  const all = data.structuredModifiers.filter((m) => Object.hasOwn(refinements, m.id));
  assert.equal(all.length, 9);
  const descriptions = Object.fromEntries(all.map((m) => [m.id, m]));
  const saved = JSON.parse(JSON.stringify({
    "lc-20009-enemy-hp-over-half": true,
    "lc-20011-enemy-slowed": true,
    "lc-21006-enemy-hp-at-most-half": true,
    "lc-21012-enemy-hp-at-least-wearer": true,
    "lc-21017-energy-percent": 100
  }));

  for (const [id, expectedByRank] of Object.entries(refinements)) {
    const record = descriptions[id];
    assert.ok(record, "registered " + id);
    assert.equal(record.source.kind, "lightCone");
    assert.equal(record.support.status, "calculable");
    assert.equal(record.provenance.sourceUrl.includes(fixedSourceSha), true);
    assert.equal(record.activation.mode, ["lightCone:20009:high-hp-damage", "lightCone:21006:followup-low-hp-extra", "lightCone:21012:equal-or-higher-hp-damage"].includes(id) ? "statThreshold" : id === "lightCone:21017:normal-skill-full-energy-extra" ? "numericThreshold" : inputs[id] ? "toggle" : "always");
    const lightConeId = record.source.id;
    for (let refinement = 1; refinement <= 5; refinement++) {
      const context = { ...equippedContext(id, refinement), stats: { hpPercent: 70 }, enemy: { hpPercent: id.includes(":20009:") ? 51 : id.includes(":21006:") ? 50 : 70 } };
      const off = runtime.buildCandidates([record], context)[0];
      assert.ok(off, id + " selected when equipped");
      assert.equal(off.value, expectedByRank[refinement - 1], id + " S" + refinement + " value");
      const on = inputs[id]
        ? runtime.buildCandidates([record], context, saved)[0]
        : off;
      assert.equal(on.enabled, true);
      assert.equal(on.automatic, !inputs[id] || ["lightCone:20009:high-hp-damage", "lightCone:21006:followup-low-hp-extra", "lightCone:21012:equal-or-higher-hp-damage"].includes(id));
      const targetAttack = id.includes(":21006:")
        ? attack("followUp")
        : id.includes(":21017:")
          ? attack("normal")
          : id.includes(":21013:")
            ? attack("ultimate")
            : attack("skill");
      const notTarget = id.includes(":21006:")
        ? attack("ultimate")
        : id.includes(":21017:")
          ? attack("ultimate")
          : id.includes(":21013:")
            ? attack("skill")
            : null;
      assert.equal(runtime.applicableToAttack(on, targetAttack), true);
      if (notTarget) assert.equal(runtime.applicableToAttack(on, notTarget), false, id + " target attack scope");

      const modifiers = all
        .filter((other) => other.source.id === lightConeId)
        .map((other) => runtime.buildCandidates([other], context, saved)[0])
        .filter((candidate) => candidate?.enabled && candidate.applicable && runtime.applicableToAttack(candidate, targetAttack));
      const request = makeRequest(targetAttack, 10, { atk: 2000, damageBonus: 15 }, modifiers);
      const result = engine.calculate(request);
      assert.ok(Number.isFinite(result.nonCrit), id + " produces a finite damage result S" + refinement);
      const literalRefinementValue = expectedByRank[refinement - 1];
      const expectedTotalBonus = id === "lightCone:21006:followup-damage"
        || id === "lightCone:21006:followup-low-hp-extra"
        || id === "lightCone:21012:base-damage"
        || id === "lightCone:21012:equal-or-higher-hp-damage"
        || id === "lightCone:21017:normal-skill-damage"
        || id === "lightCone:21017:normal-skill-full-energy-extra"
          ? 15 + literalRefinementValue * 2
          : 15 + literalRefinementValue;
      const independentNonCrit = 720 * (1 + expectedTotalBonus / 100);
      assertClose(result.nonCrit, independentNonCrit, id + " literal independent non-crit S" + refinement);
      assertClose(result.crit, independentNonCrit * 2, id + " literal independent crit S" + refinement);
      assertClose(result.expected, independentNonCrit * 1.5, id + " literal independent expected S" + refinement);

      if (inputs[id] || id === "lightCone:20009:high-hp-damage" || id === "lightCone:21006:followup-low-hp-extra" || id === "lightCone:21012:equal-or-higher-hp-damage") {
        const inactiveContext = id.includes(":20009:") ? { ...context, enemy: { hpPercent: 50 } } : id.includes(":21006:") ? { ...context, enemy: { hpPercent: 51 } } : id.includes(":21012:") ? { ...context, enemy: { hpPercent: 69 } } : { ...context, enemy: { hpPercent: 70 } };
        const inactiveInputs = id === "lightCone:21017:normal-skill-full-energy-extra" ? { "lc-21017-energy-percent": 0 } : {};
        const inactiveModifiers = all
          .filter((other) => other.source.id === lightConeId)
          .map((other) => runtime.buildCandidates([other], inactiveContext, inactiveInputs)[0])
          .filter((candidate) => candidate?.enabled && candidate.applicable && runtime.applicableToAttack(candidate, targetAttack));
        const offReq = makeRequest(targetAttack, 10, { atk: 2000, damageBonus: 15 }, inactiveModifiers);
        const offResult = engine.calculate(offReq);
        const literalBaseBonus = ["lightCone:21006:followup-low-hp-extra", "lightCone:21012:equal-or-higher-hp-damage", "lightCone:21017:normal-skill-full-energy-extra"].includes(id) ? literalRefinementValue : 0;
        const literalOffNonCrit = 720 * (1 + (15 + literalBaseBonus) / 100);
        assertClose(offResult.nonCrit, literalOffNonCrit, id + " independent inactive-condition value S" + refinement);
        assertClose(result.nonCrit / offResult.nonCrit, (115 + literalBaseBonus + literalRefinementValue) / (115 + literalBaseBonus), id + " condition ON/OFF S" + refinement);
      }
      const removed = runtime.buildCandidates([record], { ...context, lightConeId: "" }, saved);
      assert.equal(removed.length, 0, id + " removed on unequip");
      const restored = runtime.buildCandidates([record], context, JSON.parse(JSON.stringify(saved)))[0];
      assert.equal(restored.enabled, true, id + " saved state restored");
      assert.equal(restored.value, expectedByRank[refinement - 1]);
      const lightCone = data.lightCones.find((item) => item.id === lightConeId);
      assert.equal(lightCone.path, paths[id], id + " eligible path");
      assert.equal(runtime.buildCandidates([record], { ...context, lightConeId: "20000" }, saved).length, 0, id + " is not active when a different cone is selected");
    }
  }

  for (const [id, thresholdCases] of Object.entries({
    "lightCone:20009:high-hp-damage": [[50, false], [51, true]],
    "lightCone:21006:followup-low-hp-extra": [[49, true], [50, true], [51, false]],
    "lightCone:21012:equal-or-higher-hp-damage": [[69, false], [70, true], [71, true]]
  })) {
    const record = descriptions[id];
    const context = equippedContext(id, 1);
    for (const [enemyHp, expected] of thresholdCases) {
      const candidate = runtime.buildCandidates([record], { ...context, stats: { hpPercent: 70 }, enemy: { hpPercent: enemyHp } })[0];
      assert.equal(candidate.enabled, expected, id + " HP boundary " + enemyHp);
      assert.equal(candidate.automatic, true);
    }
  }

});















test('Arrows, Darting Arrow and Adversarial reuse stat, threshold and final-inclusion paths at every rank',async()=>{
 const{data,engine}=await loadProductionFixture();
 for(const[id,category,stat,amounts]of [['20000','critRate','critRate',[12,15,18,21,24]],['20007','statPercent','atk',[24,30,36,42,48]],['20014','statPercent','speed',[10,12,14,16,18]]]){
  const rec=data.structuredModifiers.find(m=>m.id===`lightCone:${id}:conditional-${stat}`),glam=data.structuredModifiers.find(m=>m.id==='ornament:311:2pc:speed-damage');assert.ok(rec);
  for(let rank=1;rank<=5;rank++){
   const amount=amounts[rank-1],ctx={characterId:'1002',lightConeId:id,refinement:rank,stats:{speed:125},baseStats:{speed:100},ornamentId:'311'},key=rec.activation.inputKey;
   const build=i=>runtime.buildCandidates([rec,glam],ctx,i),on=build({[key]:true}),off=build({});assert.equal(on[0].value,amount);assert.equal(on[0].automatic,false);assert.equal(off[0].enabled,false);
   const a=attack('normal'),input=makeRequest(a,1,{},on.map(m=>({...m,applicable:m.applicable&&runtime.applicableToAttack(m,a)}))),r=engine.calculate(input);
   const atk=3000+(stat==='atk'?1000*amount/100:0),cr=50+(stat==='critRate'?amount:0),nc=atk*.36*(stat==='speed'?1.12:1);assertClose(r.nonCrit,nc,id+' literal nonCrit');assertClose(r.crit,nc*2,id+' literal crit');assertClose(r.expected,nc*(1+cr/100),id+' literal expected');
   const included=runtime.buildCandidates([rec,glam],{...ctx,stats:{speed:stat==='speed'?125+amount:125}},{[key]:true,[rec.finalStatsInclusion.inputKey]:true});assert.equal(included[0].enabled,false);
   const same=engine.calculate(makeRequest(a,1,{atk,critRate:cr},included.map(m=>({...m,applicable:m.applicable&&runtime.applicableToAttack(m,a)}))));assertClose(same.expected,r.expected,id+' included once');
   assert.equal(runtime.buildCandidates([rec],{...ctx,lightConeId:''},{[key]:true}).length,0);
  }
  if(stat==='speed')for(const delta of [-0.01,0,0.01]){const c=runtime.buildCandidates([rec,glam],{characterId:'1002',lightConeId:id,refinement:1,ornamentId:'311',stats:{speed:125+delta},baseStats:{speed:100}},{[rec.activation.inputKey]:true});assert.equal(c[1].enabled,delta>=0);}
 }
});
