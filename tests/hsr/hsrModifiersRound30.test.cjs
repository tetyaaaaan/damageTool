'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const{loadProductionFixture,attackOf,makeRequest,runtime,assertClose}=require('./helpers/hsrDirectVerification.cjs');
const rows=require('../../games/hsr/data/calc/modifiers-characters-round30.json').modifiers;
test('Round30 Himeko and scoped Cyrene components use provider levels, correct recipients and final-inclusion once',async()=>{
 const{data,engine}=await loadProductionFixture();
 for(const r of rows){const own=r.source.id==='1510',aglaea=r.id.includes('aglaea'),id=own?'151001':aglaea?'140201':'141001',a=attackOf(data,id),context={characterId:a.characterId,eidolon:0,partyIds:own?[]:['1415'],partyEidolons:{'1415':0},traceLevelFor:()=>own?10:6},inputs={[r.activation.inputKey]:true},build=(v=inputs,c=context)=>runtime.buildCandidates([r],c,v),m=build()[0];
  assert.equal(m.enabled,true,r.id);assert.equal(m.value,r.value.values.at(-1));m.applicable=runtime.applicableToAttack(m,a);assert.equal(m.applicable,true,r.id);
  const q=makeRequest(a,a.traceKey==='normal'?6:10,{atk:3000,critRate:40,critDamage:90,damageBonus:0},[m]);q.character.id=a.characterId;const got=engine.calculate(q),raw=3000*q.attack.multiplier/100;
  const dmg=r.category==='damageBonus'?1+m.value/100:1,defense=r.category==='defenseIgnore'?1/(2-m.value/100):.5,res=r.category==='resistancePenetration'?1-(20-m.value)/100:.8,cd=r.category==='critDamage'?90+m.value:90,nc=raw*dmg*defense*res*.9;
  assert.notEqual(got.supported,false,got.reason);assertClose(got.nonCrit,nc,r.id+' independent noncrit');assertClose(got.expected,nc*(1+.4*cd/100),r.id+' independent EV');
  assert.equal(build({...inputs,[r.activation.inputKey]:false})[0].enabled,false);assert.equal(build({...inputs,[r.finalStatsInclusion.inputKey]:true})[0].enabled,false);
  if(!own){assert.equal(build(inputs,{...context,partyIds:[]}).length,0);assert.equal(runtime.applicableToAttack(m,{...a,id:'100201'}),false);}
 }
});
