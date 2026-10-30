'use strict';const test=require('node:test'),assert=require('node:assert/strict');
const{runtime,loadProductionFixture,makeRequest,assertClose}=require('./helpers/hsrDirectVerification.cjs');
const rows=require('../../games/hsr/data/calc/modifiers-native-round9.json').modifiers;
const attack={id:'native-r9-normal',type:'normal',element:'Fire',scalingStat:'atk',multipliers:[100],canCrit:true};
test('Lingsha E2/E6 support candidates require exact provider Eidolon and current state, inclusion and removal',async()=>{
 const{data}=await loadProductionFixture();for(const r of rows){assert.ok(data.structuredModifiers.find(m=>m.id===r.id));const rank=r.source.eidolonRank,ctx={characterId:'1003',partyIds:['1222'],partyEidolons:{'1222':rank}};const inputs={[r.activation.inputKey]:true};let c=runtime.buildCandidates([r],ctx,inputs)[0];assert.equal(c.enabled,true);assert.equal(c.providerId,'1222');assert.equal(c.value,rank===2?40:20);
 assert.equal(runtime.buildCandidates([r],{...ctx,partyEidolons:{'1222':rank-1}},inputs).length,0);assert.equal(runtime.buildCandidates([r],{...ctx,partyIds:[]},inputs).length,0);assert.equal(runtime.buildCandidates([r],ctx,{})[0].enabled,false);assert.equal(runtime.buildCandidates([r],ctx,{...inputs,[r.finalStatsInclusion.inputKey]:true})[0].enabled,false);assert.equal(runtime.buildCandidates([r],ctx,JSON.parse(JSON.stringify(inputs)))[0].value,c.value);}
});
test('Lingsha BE and all-RES support independently reach Break and ordinary damage without cross-category leakage',async()=>{
 const{engine}=await loadProductionFixture();const ctx={characterId:'1003',partyIds:['1222'],partyEidolons:{'1222':6}},inputs=Object.fromEntries(rows.map(r=>[r.activation.inputKey,true]));const mods=runtime.buildCandidates(rows,ctx,inputs).map(m=>({...m,applicable:true}));const out=engine.calculate(makeRequest(attack,1,{},mods));assertClose(out.nonCrit,1350);assertClose(out.expected,2025);
 const req={character:{level:80,stats:{breakEffect:100}},enemy:{level:80,count:1,weakness:true,maxToughness:120,resistance:20},element:'Fire',breakBaseDamage:{80:3767.5533},modifiers:mods};const result=engine.calculateBreak(req);assert.equal(result.supported,true);assertClose(result.value,3767.5533*2*2.4*.5*1.5);const withoutBE=engine.calculate(makeRequest(attack,1,{},[mods[1]]));assertClose(withoutBE.expected,out.expected,'BE does not modify direct damage');
});
