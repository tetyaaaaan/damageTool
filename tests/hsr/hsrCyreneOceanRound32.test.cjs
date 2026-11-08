"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {loadProductionFixture,attackOf,makeRequest,independentDirectDamage,assertClose}=require('./helpers/hsrDirectVerification.cjs');
function sequence(data,normal,level){
 const parent=attackOf(data,normal?'1410012':'1410022'),input=makeRequest(parent,normal?6:10,{atk:4173,hp:9172,def:1839,critRate:37,critDamage:143,damageBonus:23,enemyLevel:82,resistance:27,defenseReduction:11,takenDamage:9});
 input.character.id='1410';Object.assign(input.attack,{cyreneSupportLevel:level,cyreneBlessingActive:true});
 input.modifierInputs={'trace:1415:1141522:serin-damage-active':true,...Object.fromEntries([1234.5,0,6700.25,81].map((v,i)=>['serin-detonation-original:141004'+(i+1),v]))};
 input.sequenceComponents=parent.damageComponents.map((part,i)=>{
  const a=attackOf(data,part.attackId),child={...input,attack:{...a,traceLevel:i?level:input.attack.traceLevel,multiplier:a.multipliers[(i?level:input.attack.traceLevel)-1],cyreneBlessingActive:true}};
  if(!i&&!normal)child.modifiers=[{id:'trace:1410:141002:previous-skill-taken-damage',name:'事前成立したSkill被ダメージ',category:'takenDamage',value:20,enabled:true,applicable:true,calculable:true}];
  return {...part,input:child};
 });return input;
}
test('Round32 Ocean N/S after-attack detonation scales only the four explicitly supplied Serin-owned final ticks once',async()=>{
 const {data,engine}=await loadProductionFixture();
 for(const normal of [true,false])for(const level of [1,6]){
  const input=sequence(data,normal,level),direct=independentDirectDamage(input.sequenceComponents[0].input),ratio=normal?(level===1?.3:.6):(level===1?.4:.8),ticks=[1234.5,0,6700.25,81];
  const result=engine.calculate(input);assert.notEqual(result.supported,false,result.reason);
  for(const metric of ['nonCrit','crit','expected']) assertClose(result[metric],direct[metric]+ticks.reduce((a,b)=>a+b,0)*ratio,normal+' '+level+' '+metric);
  for(let i=1;i<=4;i++){const dot=result.components['ocean-'+i];assertClose(dot.expected,ticks[i-1]*ratio,'only original amount and rate');assertClose(dot.crit,dot.nonCrit,'DoT does not crit');}
 }
});
test('Round32 Ocean rejects wrong owner, absent provider state and missing ticks locally without rewriting the native Ultimate detonation',async()=>{
 const {data,engine}=await loadProductionFixture();
 for(const mutate of [q=>{q.attack.cyreneBlessingActive=false;},q=>{delete q.modifierInputs['serin-detonation-original:1410041'];},q=>{q.sequenceComponents[1].input.attack.dataOwnerId='1005';},q=>{q.sequenceComponents[1].input.attack.sourceDoTId='1410031';},q=>{q.attack.cyreneSupportLevel=7;}]){
  const input=sequence(data,false,6);mutate(input);assert.equal(engine.calculate(input).supported,false);
 }
 const old=makeRequest(attackOf(data,'14101021'),1);old.modifierInputs={'serin-detonation-original:1410041':1234.5};assertClose(engine.calculate(old).expected,1851.75,'existing A4 keeps 150%');
});
