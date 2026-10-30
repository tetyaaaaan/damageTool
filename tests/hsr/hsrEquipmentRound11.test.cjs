"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {loadProductionFixture,makeRequest,assertClose,runtime}=require('./helpers/hsrDirectVerification.cjs');
const rows=require('../../games/hsr/data/calc/modifiers-equipment-round11.json').modifiers;
const specs={
 '23054':{key:'great-fortune-active',a:[10,11,12,13,14],b:[30,37.5,45,52.5,60]},
 '23045':{key:'crown-ultimate-active',a:[40,50,60,70,80]},
 '23046':{key:'inferno-skill-stacks',a:[10,12.5,15,17.5,20]},
 '21052':{key:'cone-memosprite-present',a:[24,27,30,33,36]},
 '21050':{key:'cone-memosprite-ally-skill-active',a:[8,10,12,14,16]},
 '22007':{key:'pink-future-ultimate-active',a:[8,9,10,11,12]},
 '24006':{key:'blessing-selected-ally-active',a:[12,15,18,21,24]},
 '21040':{key:'galaxy-two-weak-targets-active',a:[20,25,30,35,40]}
};
const ctx=(id,rank,extra={})=>({characterId:'1003',lightConeId:id,refinement:rank,stats:{atk:3000,critRate:50,critDamage:100},baseStats:{atk:1000},...extra});
const basic={id:'round11-equipment',type:'normal',element:'Fire',scalingStat:'atk',multipliers:[100],canCrit:true};
const candidates=(id,rank,inputs,extra={})=>runtime.buildCandidates(rows,ctx(id,rank,extra),inputs);
const activeInputs=id=>({[specs[id].key]:id==='23046'?3:true,'current-max-energy':300});

test('eight new cones load once with exact S1-S5 coefficients and final-stat permanent exclusions',async()=>{
 const {data}=await loadProductionFixture();assert.equal(rows.length,18);
 for(const [id,s]of Object.entries(specs)){
  const own=rows.filter(m=>m.source.id===id),calc=own.filter(m=>m.support.status==='calculable');
  assert.ok(own.every(m=>data.structuredModifiers.filter(x=>x.id===m.id).length===1));assert.deepEqual(calc[0].value.values,s.a);
  if(s.b)assert.deepEqual(calc[1].value.values,s.b);
  for(let rank=1;rank<=5;rank++){
   const all=candidates(id,rank,activeInputs(id));assert.equal(all.find(m=>m.inputPolicy==='includedInFinalStats').enabled,false);
   for(const row of calc){const c=all.find(m=>m.id===row.id);assert.equal(c.enabled,true);const input={...activeInputs(id),[row.finalStatsInclusion.inputKey]:true};assert.equal(candidates(id,rank,input).find(m=>m.id===row.id).enabled,false);}
   assert.equal(runtime.buildCandidates(own,ctx('',rank),activeInputs(id)).length,0);
  }
 }
});

test('all direct-damage cone components match independent ATK, crit and DMG equations at every rank',async()=>{
 const {engine}=await loadProductionFixture();
 for(const id of ['23054','23045','23046','21052','21050','21040'])for(let rank=1;rank<=5;rank++){
  const s=specs[id],v=s.a[rank-1],mods=candidates(id,rank,activeInputs(id)),result=engine.calculate(makeRequest(basic,1,{},mods));
  const atk=3000+(id==='23045'?1000*2*v/100:id==='23046'?1000*3*v/100:0),dmg=['21052','21050'].includes(id)?v:0,cr=id==='23054'?(50+v)/100:.5,cd=(100+(id==='23054'?s.b[rank-1]:id==='21040'?v:0))/100;
  const nc=atk*(1+dmg/100)*.5*.8*.9;assertClose(result.nonCrit,nc);assertClose(result.crit,nc*(1+cd));assertClose(result.expected,nc*(1+cr*cd));
  const off=engine.calculate(makeRequest(basic,1,{},candidates(id,rank,{})));assertClose(off.expected,1620);
 }
});

test('crown EP threshold is exact, missing is local and the base Ultimate state remains mandatory',()=>{
 const extra=rows.find(m=>m.id==='lightCone:23045:high-energy-atk');
 for(const ep of [299,300,301]){const x=candidates('23045',1,{'crown-ultimate-active':true,'current-max-energy':ep}).find(m=>m.id===extra.id);assert.equal(x.enabled,ep>=300);}
 const missing=candidates('23045',1,{'crown-ultimate-active':true});assert.ok(missing.find(m=>m.id===extra.id).activation.unresolved);assert.equal(missing.find(m=>m.id==='lightCone:23045:ultimate-atk').enabled,true);
 assert.equal(candidates('23045',1,{'current-max-energy':300}).find(m=>m.id===extra.id).enabled,false);
});

test('Elation support reaches the actual Elation equation at S1-S5 and stays out of ordinary damage',async()=>{
 const {data,engine}=await loadProductionFixture(),a=data.attacks.find(x=>x.id==='1513042');
 for(const id of ['22007','24006'])for(let rank=1;rank<=5;rank++){
  const mods=candidates(id,rank,activeInputs(id)),req=makeRequest(a,10,{},mods);req.character.stats.elation=100;req.elation={context:'certifiedBanger',certifiedBanger:40,punchline:9999,merrymake:0,fervor:0};
  const out=engine.calculate(req),value=specs[id].a[rank-1],nc=7535.107*a.multipliers[9]/100*(2+value/100)*(1+5*40/280)*.5*.8*.9;
  assert.notEqual(out.supported,false,out.reason);assertClose(out.nonCrit,nc);assertClose(out.crit,nc*2);assertClose(out.expected,nc*1.5);
  assertClose(engine.calculate(makeRequest(basic,1,{},mods)).expected,1620);
 }
});

test('single-provider party support, restoration and duplicate local exclusion preserve unrelated effects',()=>{
 for(const id of ['23054','21050','22007','24006']){
  const inputs=activeInputs(id),context={lightConeId:'',partyIds:['1407'],partyEquipment:[{characterId:'1407',lightConeId:id,refinement:5}]};
  const first=candidates(id,1,inputs,context).filter(m=>m.calculable);assert.ok(first.length);assert.ok(first.every(m=>m.providerId==='1407'&&m.enabled));
  const restored=candidates(id,1,JSON.parse(JSON.stringify(inputs)),context).filter(m=>m.calculable);assert.deepEqual(restored.map(m=>m.value),first.map(m=>m.value));
  const gone=candidates(id,1,inputs,{lightConeId:'',partyIds:[],partyEquipment:[]});assert.equal(gone.length,0);
  const duplicate=candidates(id,1,inputs,{lightConeId:'',partyIds:['1407','1402'],partyEquipment:[...context.partyEquipment,{characterId:'1402',lightConeId:id,refinement:1}]}).filter(m=>m.calculable);assert.ok(duplicate.every(m=>!m.enabled&&m.activation.unresolved));
 }
});
