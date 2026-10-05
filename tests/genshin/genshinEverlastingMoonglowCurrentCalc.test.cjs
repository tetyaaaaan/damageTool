'use strict';
const assert=require('node:assert/strict'),test=require('node:test');
const {createScenarioHarness,prepareScenarioInputs,setElement}=require('./helpers/calcScenarioHarness.cjs');
const ID='w_14506_v3_scalingBonus_1',LEGACY='w_14506_extraDamage_e46955e5',RATES=[1,1.5,2,2.5,3];
function fixture(characterId='10000006',hp=30000,refinement=1){const f=createScenarioHarness();prepareScenarioInputs(f.elements,{characterId,weaponId:'14506',stats:{hp,atk:2000,critRate:50,critDamage:100,elementDamageBonus:50}});setElement(f.elements,'genshinWeaponRefinement','R'+refinement);f.request=f.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();return f;}
const run=f=>f.sandbox.GenshinCalcEngine.calculateDamageRequest(f.request,f.calcData);
const plain=x=>JSON.parse(JSON.stringify(x));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);
function baseline(f){const data=structuredClone(f.calcData);data.weaponModifiers['14506'].modifiers=[];return f.sandbox.GenshinCalcEngine.calculateDamageRequest(f.request,data);}
test('Everlasting Moonglow adds wearer maxHP at every refinement to normal base damage, before DMG/CRIT/DEF/RES; other attacks unchanged',()=>{
  for(const characterId of ['10000006','10000014'])for(let r=1;r<=5;r++){
    const f=fixture(characterId,30000,r),p=run(f),b=baseline(f);let normals=0;
    for(const result of p.results){const before=b.results.find(x=>x.entry.id===result.entry.id);assert.ok(before);const normal=result.entry.damageType==='normal';const add=normal?30000*RATES[r-1]/100:0;if(normal)normals++;
      near(result.breakdown.additiveBaseDamage-before.breakdown.additiveBaseDamage,add);
      near(result.breakdown.damageBonus,before.breakdown.damageBonus);
      near(result.breakdown.scalingParts[0].talentMultiplier,before.breakdown.scalingParts[0].talentMultiplier);
      if(normal){near(result.nonCrit/before.nonCrit,(before.breakdown.scalingParts.reduce((s,x)=>s+x.baseDamage,0)+add)/before.breakdown.scalingParts.reduce((s,x)=>s+x.baseDamage,0));}
      else near(result.expected,before.expected);
    }
    assert.ok(normals>0);assert.equal(p.results.filter(x=>x.entry.effectId===LEGACY).length,0);
    const e=f.sandbox.GenshinCalcEngine,replay=e.calculateDamageRequest(plain(e.createCalculationSnapshot(p.calculationRequest,p).request),f.calcData);
    assert.deepEqual(plain(replay.results),plain(p.results));
  }
});
test('maxHP0 gives zero additive bonus; increasing only HP adds the prescribed amount without requiring Burst state',()=>{
  const f=fixture('10000006',0);const zero=run(f),b=baseline(f);for(const r of zero.results)near(r.expected,b.results.find(x=>x.entry.id===r.entry.id).expected);
  f.request.stats.hp=50000;const high=run(f);for(const r of high.results){const z=zero.results.find(x=>x.entry.id===r.entry.id);near(r.breakdown.additiveBaseDamage-z.breakdown.additiveBaseDamage,r.entry.damageType==='normal'?500:0);if(r.entry.damageType!=='normal')near(r.expected,z.expected);}
  assert.equal(high.candidateModifiers.some(c=>c.modifier.id===ID&&c.analysis.supportStatus==='unsupported'),false);
});
test('wearer effect reads its own effective maxHP and never transfers to party recipients',()=>{
  const f=fixture('10000006',30000);const before=run(f);
  f.request.party={schemaVersion:2,focusSlot:1,conditionStates:{},members:[{slot:1,role:'main',enabled:true,characterId:'10000006',stats:f.request.stats,equipment:{weaponId:'14506',refinement:1},buffStates:{}},{slot:2,role:'support',enabled:true,characterId:'10000014',stats:{hp:90000},equipment:{weaponId:'14506',refinement:5},buffStates:{}}]};
  const p=run(f);for(const r of p.results)near(r.expected,before.results.find(x=>x.entry.id===r.entry.id).expected);
  f.request.party.members[1].stats.hp=1000;for(const r of run(f).results)near(r.expected,before.results.find(x=>x.entry.id===r.entry.id).expected);
  f.request.weaponId='';f.request.party.members[0].equipment.weaponId='';const receiver=run(f);for(const r of receiver.results)near(r.breakdown.additiveBaseDamage,0);
  const buff={id:'test_current_hp',category:'statBonus',applyTo:['hpFlat'],unit:'flat',value:20000,condition:'always',calculationSupport:'simple',uidHandling:'conditional',targetOwner:'self'};
  f.request.weaponId='14506';f.request.party.members[0].equipment.weaponId='14506';f.calcData.weaponModifiers['14506'].modifiers.push(buff);const increased=run(f);for(const r of increased.results)near(r.breakdown.additiveBaseDamage,r.entry.damageType==='normal'?500:0);
});
