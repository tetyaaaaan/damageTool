"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {loadProductionFixture,attackOf,makeRequest,independentDirectDamage,assertClose,runtime}=require('./helpers/hsrDirectVerification.cjs');
const rows=require('../../games/hsr/data/calc/modifiers-cyrene-round32.json').modifiers;
function candidates(attack,level,inputs,char='1405',party=['1415']){return runtime.buildCandidates(rows,{characterId:char,eidolon:0,partyIds:party,partyEidolons:Object.fromEntries(party.map(id=>[id,0])),traceLevelFor:()=>level,attack},inputs).map(m=>({...m,applicable:runtime.applicableToAttack(m,attack)}));}
test('Round32 True Knowledge ATK/Skill DMG and Immortal Flame CR use independent expected stats, source level and scope',async()=>{
 const {data,engine}=await loadProductionFixture(),key='trace:1415:1141518:true-knowledge-active';
 for(const level of [1,6])for(const id of ['140501','140502']){
  const a=attackOf(data,id),mods=candidates(a,level,{[key]:true}),request=makeRequest(a,id==='140501'?6:10,{atk:4317,baseAtk:1043,critRate:37,critDamage:143,damageBonus:23,toughnessActive:!a.requiresBrokenTarget},mods);
  request.enemy.weakness=true;request.enemy.weaknessCount=7;
  request.modifiers.push(...runtime.buildCandidates(data.structuredModifiers.filter(m=>['trace:1405:140504:qualitative-disclosure','traceNode:1405:1405103:seven-weakness-defense-ignore','trace:1405:140502:single-enemy-damage'].includes(m.id)),{characterId:'1405',eidolon:0,partyIds:['1415'],stats:request.character.stats,enemy:request.enemy,traceLevelFor:()=>10},{}).map(m=>({...m,applicable:runtime.applicableToAttack(m,a)})));
  const atkBonus=level===1?30:60,skillBonus=id==='140502'?(level===1?20:40):0;
  const oracle=independentDirectDamage({...request,attack:{...request.attack,multiplier:request.attack.multiplier*(request.attack.hitCount||1),hitCount:1},character:{...request.character,stats:{...request.character.stats,atk:4317+1043*atkBonus/100,damageBonus:23+skillBonus+30+(id==='140502'?20:0)}},enemy:{...request.enemy,defenseIgnore:28},modifiers:[]}),out=engine.calculate(request);
  assert.notEqual(out.supported,false,out.reason);for(const m of ['nonCrit','crit','expected'])assertClose(out[m],oracle[m],id+' '+level+' '+m);
 }
 const a=attackOf(data,'140501');assert.ok(candidates(a,6,{},'1405').filter(m=>m.source.skillId==='1141518').every(m=>!m.enabled));assert.equal(candidates(a,6,{[key]:true},'1405',[]).length,0);
 const atk=rows[0];assert.ok(!candidates(a,6,{[key]:true,[atk.finalStatsInclusion.inputKey]:true}).find(m=>m.id===atk.id).enabled);
 const transformed=attackOf(data,'140808'),inputs={'cyrene-phainon-blessing-active':true,'phainon-kaslana-form':true};
 const mod=candidates(transformed,6,inputs,'1408').find(m=>m.category==='critRate'),request=makeRequest(transformed,6,{atk:4317,critRate:37,critDamage:143,damageBonus:23},[mod]),oracle=independentDirectDamage({...request,character:{...request.character,stats:{...request.character.stats,critRate:53}},modifiers:[]}),out=engine.calculate(request);
 for(const k of ['nonCrit','crit','expected'])assertClose(out[k],oracle[k],'Immortal Flame '+k);
 assert.equal(runtime.applicableToAttack(mod,attackOf(data,'140801')),false);assert.ok(!candidates(transformed,6,{'cyrene-phainon-blessing-active':true},'1408').find(m=>m.category==='critRate').enabled);
});
