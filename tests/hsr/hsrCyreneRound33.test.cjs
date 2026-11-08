"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {loadProductionFixture,attackOf,makeRequest,runtime,independentDirectDamage,assertClose}=require('./helpers/hsrDirectVerification.cjs');
const profile={atk:4317,hp:11037,def:1937,baseAtk:1043,critRate:37,critDamage:143,damageBonus:23,enemyLevel:82,resistance:27,takenDamage:9};
function anaxa(data,id,level){
 const a=attackOf(data,id),q=makeRequest(a,level,{...profile,toughnessActive:false,weakness:true});q.character.id='1405';q.enemy.weaknessCount=7;q.attack.cyreneExtraHitsActive=true;
 q.modifierInputs={'cyrene-anaxa-extra-hits-active':true,'trace:1415:1141518:true-knowledge-active':true};
 q.modifiers=runtime.buildCandidates(data.structuredModifiers.filter(m=>m.source?.id==='1405'||m.source?.id==='1415'&&m.source.skillId==='1141518'),{characterId:'1405',eidolon:0,partyIds:['1415'],partyEidolons:{'1415':0},stats:q.character.stats,enemy:q.enemy,traceLevelFor:s=>s.id==='1415'?6:10},q.modifierInputs).map(m=>({...m,applicable:runtime.applicableToAttack(m,a)}));return q;
}
function anaxaOracle(q,per,hits){return independentDirectDamage({...q,attack:{...q.attack,multiplier:per*hits,hitCount:1},modifiers:[{category:'statPercent',stat:'atk',value:60},{category:'damageBonus',value:30+20+40},{category:'defenseIgnore',value:28}]});}
test('Round33 Wisdom adds exactly three equal Skill hits and includes them once in 8-hit and nonrecursive full actions',async()=>{
 const{data,engine}=await loadProductionFixture();
 for(const[level,per]of[[1,35],[10,70]]){
  for(const[id,hits]of[['11415181',3],['1405023',8]]){
   const q=anaxa(data,id,level),out=engine.calculate(q),oracle=anaxaOracle(q,per,hits);assert.notEqual(out.supported,false,out.reason);for(const k of ['nonCrit','crit','expected']){assertClose(out[k],oracle[k],id+' '+k);assertClose(out.perHit[k],oracle[k]/hits,'per-hit '+k);}
  }
  const a=attackOf(data,'1405024'),root=anaxa(data,'1405024',level);root.sequenceComponents=a.damageComponents.map(d=>({...d,input:anaxa(data,d.attackId,level)}));
  const out=engine.calculate(root),oracle=anaxaOracle(root,per,16);assert.notEqual(out.supported,false,out.reason);for(const k of ['nonCrit','crit','expected'])assertClose(out[k],oracle[k],'two 8-hit instances '+k);
 }
 const off=anaxa(data,'1405023',10);off.attack.cyreneExtraHitsActive=false;assert.equal(engine.calculate(off).supported,false);const wrong=anaxa(data,'1405023',10);wrong.attack.hitCount=11;assert.equal(engine.calculate(wrong).supported,false);
});
function barrier(data,active,final=false){
 const a=attackOf(data,'1403033'),q=makeRequest(a,10,{...profile,enemyLevel:80,toughnessActive:true,defenseIgnore:final?12:0});q.character.id='1403';q.attack.cyreneBarrierActive=active;
 q.modifierInputs={'tribbie-zone-active':true,'tribbie-followup-damage-stacks':3,'trace:1415:1141515:tribbie-defense-ignore-active':active,'traceNode:1403:1403102:party-hp-snapshot-in-final':true,'trace:1415:1141515:tribbie-defense-ignore-in-final-stats':final};
 q.sequenceComponents=a.damageComponents.slice(0,active?2:1).map(d=>{const c=attackOf(data,d.attackId),child={...q,attack:{...c,traceLevel:10,multiplier:12,cyreneBarrierActive:active}};child.modifiers=runtime.buildCandidates(data.structuredModifiers.filter(m=>m.source?.id==='1403'||m.source?.id==='1415'&&m.source.skillId==='1141515'),{characterId:'1403',eidolon:0,partyIds:['1415'],partyEidolons:{'1415':0},stats:q.character.stats,enemy:q.enemy,traceLevelFor:s=>s.id==='1415'?6:10},q.modifierInputs).map(m=>({...m,applicable:runtime.applicableToAttack(m,c)}));return {...d,input:child};});return q;
}
test('Round33 Passage toggles one versus two barrier hits with own HP, saturated A2 and no duplicated DEF ignore',async()=>{
 const{data,engine}=await loadProductionFixture();
 for(const active of[false,true]){
  const q=barrier(data,active),out=engine.calculate(q),oracle=independentDirectDamage({...q,attack:{...q.attack,multiplier:12,hitCount:1},modifiers:[{category:'damageBonus',value:216},{category:'takenDamage',value:30},...(active?[{category:'defenseIgnore',value:12}]:[])]});
  assert.notEqual(out.supported,false,out.reason);assert.equal(Object.keys(out.components).length,active?2:1);for(const k of ['nonCrit','crit','expected'])assertClose(out[k],oracle[k]*(active?2:1),'barrier '+active+' '+k);
 }
 const plain=engine.calculate(barrier(data,true)),included=engine.calculate(barrier(data,true,true));assertClose(included.expected,plain.expected,'DEF ignore included once');
 const missing=barrier(data,true);missing.modifierInputs['tribbie-followup-damage-stacks']=2;assert.equal(engine.calculate(missing).supported,false);
 const off=barrier(data,true);off.modifierInputs['tribbie-zone-active']=false;assert.equal(engine.calculate(off).supported,false);
});
