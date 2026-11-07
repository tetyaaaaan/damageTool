"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {loadProductionFixture,attackOf,makeRequest,runtime,independentDirectDamage,assertClose,fixedSourceSha}=require('./helpers/hsrDirectVerification.cjs');
const source=require('../../games/hsr/data/calc/modifiers-cyrene-round28.json').modifiers[0];
const profile={atk:3187,hp:8021,def:1753,baseAtk:1085,baseHp:1243,baseDef:914,critRate:37,critDamage:143,damageBonus:17,enemyLevel:82,resistance:27,defenseReduction:11,defenseIgnore:4,resistancePenetration:7,takenDamage:9};
function context(characterId,partyIds=['1415']){return {characterId,eidolon:0,partyIds,partyEidolons:{'1415':0},traceLevelFor:()=>6,characterElement:characterId==='1003'?'Fire':'Quantum'};}
function scoped(attack,inputs={},partyIds=['1415']){return runtime.buildCandidates([source],context(attack.characterId,partyIds),inputs).map(m=>({...m,applicable:m.applicable&&runtime.applicableToAttack(m,attack)}));}

test('Round28 Cyrene general blessing applies only to listed Himeko/Seele attacks and E0 Mem Skill Lv6',async()=>{
 const{data,engine}=await loadProductionFixture();assert.equal(source.provenance.sourceCommit,fixedSourceSha);assert.deepEqual(Array.from(source.value.values),[20,24,28,32,36,40]);
 for(const id of ['100301','100302','100303','100304','110201','110202','110203']){const attack=attackOf(data,id),mods=scoped(attack,{'cyrene-generic-blessing-active':true});assert.equal(mods.length,1,id+' candidate');assert.equal(mods[0].value,40);assert.equal(mods[0].enabled,true);assert.equal(runtime.applicableToAttack(mods[0],attack),true);}
 const attack=attackOf(data,'100301'),mods=scoped(attack,{'cyrene-generic-blessing-active':true}),request=makeRequest(attack,1,profile,mods),actual=engine.calculate(request),expected=independentDirectDamage(request);
 assert.notEqual(actual.supported,false,actual.reason);assertClose(actual.nonCrit,expected.nonCrit,'Himeko blessing nonCrit');assertClose(actual.expected,expected.expected,'Himeko blessing expected');
});

test('Round28 Cyrene blessing stays off for absent provider, unlisted attacks, toggle OFF, or included final stats',async()=>{
 const{data}=await loadProductionFixture(),himeko=attackOf(data,'100301'),base=scoped(himeko,{});
 assert.equal(base[0].enabled,false,'default toggle is off');
 assert.equal(scoped(himeko,{'cyrene-generic-blessing-active':true},[]).length,0,'Cyrene must be in the party');
 const unrelated={...himeko,id:'100201'};assert.equal(runtime.applicableToAttack({...base[0],enabled:true},unrelated),false,'unlisted attack IDs stay outside the blessing');
 const included=scoped(himeko,{'cyrene-generic-blessing-active':true,'cyrene-generic-blessing-in-final-stats':true});assert.equal(included[0].includedInFinalStats,true);assert.equal(included[0].enabled,false,'do not double-add a bonus already included in final damageBonus');
});
