"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const{loadProductionFixture,attackOf,makeRequest,independentDirectDamage,assertClose}=require('./helpers/hsrDirectVerification.cjs');
const owners=[
 {id:'1005',name:'Kafka',source:'100503',element:'Thunder',value:1234.5},
 {id:'1108',name:'Sampo',source:'110804',element:'Wind',value:2345.25},
 {id:'1111',name:'Luka',source:'111102',element:'Physical',value:3456.75},
 {id:'1210',name:'Guinaifen',source:'121002',element:'Fire',value:4567.125}
];
function parentRequest(data,normal,level,selected=['1005','1210']){
 const rootAttack=attackOf(data,normal?'1410013':'1410023'),oldAttack=attackOf(data,normal?'1410012':'1410022'),traceLevel=normal?6:10;
 const common=makeRequest(rootAttack,traceLevel,{atk:4173,hp:9172,def:1839,critRate:37,critDamage:143,damageBonus:23,enemyLevel:82,resistance:27,defenseReduction:11,takenDamage:9});
 common.character.id='1410';common.attack.cyreneSupportLevel=level;common.attack.cyreneBlessingActive=true;common.attack.dotOwnerIds=selected;
 const original=[1234.5,0,6700.25,81];
 common.modifierInputs={'trace:1415:1141522:serin-damage-active':true,...Object.fromEntries(original.map((v,i)=>['serin-detonation-original:141004'+(i+1),v])),...Object.fromEntries(owners.map(o=>['ocean-foreign-original:'+o.id+':'+o.source,o.value]))};
 const own={...common,attack:{...oldAttack,traceLevel,multiplier:oldAttack.multipliers[traceLevel-1],attackType:oldAttack.type,cyreneSupportLevel:level,cyreneBlessingActive:true}};
 own.sequenceComponents=oldAttack.damageComponents.map((part,i)=>{
  const a=attackOf(data,part.attackId),child={...own,attack:{...a,traceLevel:i?level:traceLevel,multiplier:a.multipliers[(i?level:traceLevel)-1],cyreneSupportLevel:level,cyreneBlessingActive:true}};
  if(!i&&!normal)child.modifiers=[{id:'trace:1410:141002:previous-skill-taken-damage',name:'事前成立したSkill被ダメージ',category:'takenDamage',value:20,enabled:true,applicable:true,calculable:true}];
  return{...part,input:child};
 });
 common.sequenceComponents=[{key:'serin',name:'本人直接＋本人4種DoT',dataOwnerId:'1410',input:own},...selected.map(id=>{
  const o=owners.find(x=>x.id===id),component=rootAttack.damageComponents.find(x=>x.dataOwnerId===id),a=attackOf(data,component.attackId),child={...common,attack:{...a,traceLevel:level,multiplier:a.multipliers[level-1],attackType:'dot',cyreneSupportLevel:level,cyreneBlessingActive:true,dotOwnerPresent:true}};
  return{key:'foreign-'+id,name:component.name,dataOwnerId:id,input:child};
 })];
 return common;
}
function oracle(input,normal,level){
 const direct=independentDirectDamage(input.sequenceComponents[0].input.sequenceComponents[0].input),rate=(normal?30+6*(level-1):40+8*(level-1))/100,ticks=[1234.5,0,6700.25,81],foreign=input.sequenceComponents.slice(1).reduce((s,part)=>s+owners.find(o=>o.id===part.dataOwnerId).value,0);
 const amount=(ticks.reduce((s,x)=>s+x,0)+foreign)*rate;
 return{nonCrit:direct.nonCrit+amount,crit:direct.crit+amount,expected:direct.expected+amount,rate};
}
test('Round34 Ocean detonates selected party-owner DoTs from their final noncrit ticks and combines each owner once',async()=>{
 const{data,engine}=await loadProductionFixture();
 for(const normal of [true,false])for(const level of [1,6])for(const selected of [['1005','1210'],['1108','1111']]){
  const q=parentRequest(data,normal,level,selected),expected=oracle(q,normal,level),out=engine.calculate(q);
  assert.notEqual(out.supported,false,out.reason);for(const metric of ['nonCrit','crit','expected'])assertClose(out[metric],expected[metric],`${normal?'N':'S'}${level} ${metric}`);
  for(const part of q.sequenceComponents.slice(1)){const o=owners.find(x=>x.id===part.dataOwnerId),leaf=engine.calculate(part.input);assert.notEqual(leaf.supported,false,leaf.reason);assertClose(leaf.nonCrit,o.value*expected.rate,o.id+' original tick × Ocean rate');assertClose(leaf.crit,leaf.nonCrit,o.id+' DoT cannot crit');assertClose(leaf.expected,leaf.nonCrit,o.id+' DoT has no expectation crit multiplier');}
  assert.equal(Object.keys(out.components).length,q.sequenceComponents.length,'root contains own-total once and each selected owner once');
 }
});
test('Round34 Ocean rejects absent owners, owner/source mismatch and omitted final ticks locally',async()=>{
 const{data,engine}=await loadProductionFixture();
 for(const mutate of [q=>{q.sequenceComponents[1].input.attack.dotOwnerPresent=false;},q=>{q.sequenceComponents[1].input.attack.dataOwnerId='1108';},q=>{q.sequenceComponents[1].input.attack.sourceDoTId='100502';},q=>{delete q.modifierInputs['ocean-foreign-original:1005:100503'];},q=>{q.sequenceComponents[1].input.modifierInputs['trace:1415:1141522:serin-damage-active']=false;}]){
  const q=parentRequest(data,true,6);mutate(q);assert.equal(engine.calculate(q).supported,false);
 }
 const explicitZero=parentRequest(data,true,6);explicitZero.modifierInputs['ocean-foreign-original:1005:100503']=0;const out=engine.calculate(explicitZero);assert.notEqual(out.supported,false,out.reason);
 const invalid={...explicitZero,attack:{...explicitZero.attack,dotOwnerIds:[]}};assert.equal(engine.calculate(invalid).supported,false);
});
