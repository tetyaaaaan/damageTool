'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadProductionFixture,readJson,runtime,attackOf,makeRequest,assertClose}=require('./helpers/hsrDirectVerification.cjs');
test('Round24 Elation Trailblazer Ultimate CD uses only its selected recipient and final-stat responsibility',async()=>{
 const{data,engine}=await loadProductionFixture(),defs=readJson('games/hsr/data/calc/modifiers-trailblazer-elation-round24.json').modifiers;
 for(const id of ['8009','8010'])for(const level of [1,10])for(const own of [true,false]){
  const key='trailblazer-elation-ultimate-'+id,actor=own?id:'1002',a=attackOf(data,actor+'01'),ctx={characterId:actor,eidolon:0,partyIds:own?[]:[id],partyEidolons:{[id]:0},traceLevelFor:()=>level},request=makeRequest(a,6),off=runtime.buildCandidates(defs,ctx,{});
  assert.equal(off.length,1);assert.equal(off[0].enabled,false);
  const on=runtime.buildCandidates(defs,ctx,{[key+'-active']:true});assert.equal(on.length,1);assert.equal(on[0].value,level===1?30:50);
  request.modifiers=on;const r=engine.calculate(request),nc=3000*.36;assertClose(r.nonCrit,nc);assertClose(r.expected,nc*(1+.5*(1+on[0].value/100)));
  request.character.stats.critDamage=100+on[0].value;request.modifiers=runtime.buildCandidates(defs,ctx,{[key+'-active']:true,[key+'-in-final']:true});assertClose(engine.calculate(request).expected,r.expected);
  if(!own)assert.equal(runtime.buildCandidates(defs,{...ctx,partyIds:[]},{[key+'-active']:true}).length,0);
 }
});
