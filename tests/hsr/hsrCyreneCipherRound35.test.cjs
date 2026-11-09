'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadProductionFixture,attackOf,makeRequest,runtime,independentDirectDamage,assertClose}=require('./helpers/hsrDirectVerification.cjs');
const records=require('../../games/hsr/data/calc/modifiers-cyrene-cipher-round35.json').modifiers;
const active='trace:1415:1141520:cipher-damage-active',key='cyrene-cipher-patron-state';
function candidates(level,patron,inputs={},present=true){return runtime.buildCandidates(records,{characterId:'1406',eidolon:0,partyIds:present?['1415']:[],partyEidolons:{'1415':0},traceLevelFor:()=>level},{[active]:true,[key]:patron,...inputs});}
test('Round35 Cipher independently applies patron and non-patron DEF reduction at source MemSkill1/6',async()=>{
 const{data,engine}=await loadProductionFixture(),a=attackOf(data,'140601');
 for(const level of[1,6])for(const patron of[0,1]){
  const mod=candidates(level,patron)[0],amount=(patron?10:6)*(level===1?1:2);assertClose(mod.value,amount,'fixed DEF curve');
  const q=makeRequest(a,6,{atk:4317,critRate:37,critDamage:143,damageBonus:23,enemyLevel:82,resistance:27,defenseReduction:11,defenseIgnore:4,takenDamage:9});q.character.id='1406';q.modifiers=[mod];
  const out=engine.calculate(q),expected=independentDirectDamage({...q,modifiers:[],enemy:{...q.enemy,defenseReduction:11+amount}});assert.notEqual(out.supported,false,out.reason);for(const k of['nonCrit','crit','expected'])assertClose(out[k],expected[k],level+' '+patron+' '+k);
 }
});
test('Round35 Cipher uses the existing blessing state and excludes included or unknown target inputs',()=>{
 assert.equal(candidates(6,1,{[active]:false})[0].enabled,false);assert.equal(candidates(6,1,{},false).length,0);assert.equal(candidates(6,undefined)[0].applicable,false);assert.equal(candidates(6,.5)[0].applicable,false);
 const included=candidates(6,1,{'trace:1415:1141520:cipher-defense-reduction-in-final-stats':true})[0];assert.equal(included.enabled,false);assert.equal(included.includedInFinalStats,true);
});
