"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { fixedSourceSha, loadProductionFixture, attackOf, makeRequest, runtime, independentDirectDamage, assertClose } = require("./helpers/hsrDirectVerification.cjs");
// Independent transcription from pinned JP/EN character_skills and skill_trees:
// https://github.com/Mar-7th/StarRailRes/blob/dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487/index_new/en/character_skills.json
// 140502.params[][0] is per hit; params[][1] is FOUR additional hits.
// 140504.params[][0] is DMG bonus, 1405103.params[0][0] is 4% per weakness.
// https://anaxamains.com/ corroborates five hits and an already-disclosed target.
// These tests intentionally establish only stable seven-weakness/broken snapshots.
const normal = [50,60,70,80,90,100];
const perSkillHit = [35,38.5,42,45.5,49,52.5,56.87,61.25,65.62,70];
const ultimate = [80,88,96,104,112,120,130,140,150,160];
const talent = [18,19.2,20.4,21.6,22.8,24,25.5,27,28.5,30];
const nativeIds = ["trace:1405:140504:qualitative-disclosure", "traceNode:1405:1405103:seven-weakness-defense-ignore", "trace:1405:140502:single-enemy-damage"];
const profiles = [
 { atk:3173.25,hp:10231.75,def:1643.5,critRate:67.5,critDamage:263.25,damageBonus:37.25,enemyLevel:87,resistance:30,defenseReduction:13.75,defenseIgnore:8.25,resistancePenetration:9.5,takenDamage:11.25 },
 { atk:2347.75,hp:7102.5,def:882.25,critRate:39.25,critDamage:121.5,damageBonus:73.5,enemyLevel:75,resistance:10,defenseReduction:3.25,defenseIgnore:16.5,resistancePenetration:13.25,takenDamage:4.75 }
];
function curve(id) { return id === "140501" ? normal : id === "140502" ? perSkillHit.map(v => v * 5) : ultimate; }
function native(data, attack, talentLevel, profile, extra = []) {
 const records = data.structuredModifiers.filter(m => nativeIds.includes(m.id));
 const candidates = runtime.buildCandidates(records, { characterId:"1405",eidolon:0,partyIds:[],stats:profile,enemy:{count:1,weaknessCount:7,weakness:true,toughnessActive:false},traceLevelFor:s => s.skillId === "140504" ? talentLevel : 10 }, {});
 return [...candidates,...extra].map(m => ({...m,applicable:m.applicable !== false && runtime.applicableToAttack(m,attack)}));
}
function direct(data,id,level,talentLevel,profile=profiles[0],extra=[]) {
 const a=attackOf(data,id); const request=makeRequest(a,level,{...profile,enemyCount:1,toughnessActive:false,weakness:true},native(data,a,talentLevel,profile,extra));
 request.enemy.weaknessCount=7;return request;
}
function oracle(input,id,level,talentLevel,extra=[]) {
 const mods=[{category:"damageBonus",value:talent[talentLevel-1]},{category:"defenseIgnore",value:28},...(id==="140502"?[{category:"damageBonus",value:20}]:[]),...extra.filter(m=>runtime.applicableToAttack(m,input.attack))];
 return independentDirectDamage({...input,attack:{...input.attack,multiplier:curve(id)[level-1],hitCount:1},modifiers:mods});
}
function sequence(data,id,n,s,t,profile=profiles[0],extra=[]) {
 const a=attackOf(data,id),level=id==="1405011"?n:s;
 const input=makeRequest(a,level,{...profile,enemyCount:1,toughnessActive:false,weakness:true});input.enemy.weaknessCount=7;
 input.sequenceComponents=a.damageComponents.map(p=>{const child=direct(data,p.attackId,p.attackId==="140501"?n:s,t,profile,extra);child.character=structuredClone(input.character);child.enemy=structuredClone(input.enemy);return {key:p.key,name:p.name,input:child};});
 return input;
}
function check(result,expected,label) { assert.notEqual(result.supported,false,label+": "+result.reason);for(const k of ["nonCrit","crit","expected"])assertClose(result[k],expected[k],label+" "+k); }

test("batch6 Anaxa production definitions retain five-hit skill, bounded conditions, and exact independent curves",async()=>{
 const {data}=await loadProductionFixture();assert.equal(fixedSourceSha,"dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
 for(const [id,values] of [["140501",normal],["140502",perSkillHit.map(v=>Math.round(v*500)/100)],["140503",ultimate]]){
  const a=attackOf(data,id);assert.equal(a.characterId,"1405");assert.equal(a.element,"Wind");assert.equal(a.hitCount,1);assert.equal(a.canCrit,true);assert.equal(a.scalingStat,"atk");assert.equal(a.support.status,"calculable");assert.equal(a.support.verified,true);assert.equal(a.characterLevelExact,80);assert.equal(a.maximumEidolon,0);assert.equal(a.maximumTraceLevel,values.length);assert.equal(a.enemyCountExact,1);assert.equal(a.requiresBrokenTarget,true);assert.equal(a.requiredWeaknessCount,7);assert.equal(a.qualitativeDisclosureActive,true);assert.equal(a.provenance.sourceCommit,fixedSourceSha);assert.deepEqual(Array.from(a.multipliers),values);
 }
 assert.match(attackOf(data,"140502").hitCountLabel,/5/);
 for(const id of ["1405011","1405021"]){const a=attackOf(data,id);assert.equal(a.damageFormula,"componentSequence");assert.equal(a.damageComponents.length,2);assert.equal(a.damageComponents[1].key,"extraSkill");assert.equal(a.damageComponents[1].attackId,"140502");assert.equal(a.requiredTraceLevelRanges.skill.maximum,10);assert.equal(a.requiredTraceLevelRanges.talent.maximum,10);}
});

test("batch6 Anaxa three direct components match every E0 attack and independent Talent level with native DEF ignore",async()=>{
 const {data,engine}=await loadProductionFixture();
 for(const id of ["140501","140502","140503"])for(let level=1;level<=curve(id).length;level++)for(let t=1;t<=10;t++)for(const profile of profiles){
  const input=direct(data,id,level,t,profile),result=engine.calculate(input);check(result,oracle(input,id,level,t),id+" "+level+"/"+t);
  assertClose(result.breakdown.defenseIgnorePercent,profile.defenseIgnore+28,"A6 DEF ignore");
  assertClose(result.breakdown.damageBonus,profile.damageBonus+talent[t-1]+(id==="140502"?20:0),"native bonus counted once");
  assertClose(result.breakdown.critDamagePercent,profile.critDamage,"A4 already in final CD");
  assert.equal(result.applied.filter(m=>m.id===nativeIds[0]).length,1);assert.equal(result.applied.filter(m=>m.id===nativeIds[1]).length,1);assert.equal(result.applied.filter(m=>m.id===nativeIds[2]).length,id==="140502"?1:0);
 }
});

test("batch6 Anaxa full actions preserve independent Normal/Skill/Talent levels and nonrecursive extra Skill",async()=>{
 const {data,engine}=await loadProductionFixture();
 for(const id of ["1405011","1405021"])for(let n=1;n<=(id==="1405011"?6:1);n++)for(let s=1;s<=10;s++)for(let t=1;t<=10;t++){
  const input=sequence(data,id,n,s,t),expected=input.sequenceComponents.map(p=>oracle(p.input,p.input.attack.id,p.input.attack.traceLevel,t)),sum={};for(const k of ["nonCrit","crit","expected"])sum[k]=expected.reduce((v,p)=>v+p[k],0);
  const result=engine.calculate(input);check(result,sum,id+" "+n+"/"+s+"/"+t);assert.equal(Object.keys(result.components).length,2,"one extra Skill only");
 }
});

test("batch6 Anaxa Normal-only and Skill-only modifiers apply to their own full-action components",async()=>{
 const {data,engine}=await loadProductionFixture();
 const extra=[{id:"normal-only-oracle",category:"damageBonus",value:31.25,enabled:true,applicable:true,target:{attackTypes:["normal"]}},{id:"skill-only-oracle",category:"damageBonus",value:17.5,enabled:true,applicable:true,target:{attackTypes:["skill"]}}];
 const input=sequence(data,"1405011",4,7,3,profiles[1],extra),expected=input.sequenceComponents.map(p=>oracle(p.input,p.input.attack.id,p.input.attack.traceLevel,3,extra)),sum={};for(const k of ["nonCrit","crit","expected"])sum[k]=expected.reduce((v,p)=>v+p[k],0);check(engine.calculate(input),sum,"type-specific bonuses");
 for(const stat of ["atk","hp","def"]){const changed=structuredClone(input);changed.character.stats[stat]+=777.25;changed.sequenceComponents.forEach(p=>p.input.character=structuredClone(changed.character));const actual=engine.calculate(changed);assert.notEqual(actual.supported,false,actual.reason);assertClose(actual.nonCrit/sum.nonCrit,stat==="atk"?changed.character.stats.atk/input.character.stats.atk:1,"isolated "+stat);}
});

test("batch6 Anaxa rejects unbroken, changing weakness, out-of-scope owners and incomplete native components",async()=>{
 const {data,engine}=await loadProductionFixture();
 for(const mutate of [r=>{r.enemy.toughnessActive=true;r.sequenceComponents.forEach(p=>p.input.enemy.toughnessActive=true);},r=>{r.enemy.weaknessCount=6;r.sequenceComponents.forEach(p=>p.input.enemy.weaknessCount=6);},r=>{r.character.eidolon=1;r.sequenceComponents.forEach(p=>p.input.character.eidolon=1);},r=>r.sequenceComponents.pop(),r=>r.sequenceComponents[1].input.character.stats.atk=1,r=>r.sequenceComponents[1].input.modifiers=r.sequenceComponents[1].input.modifiers.filter(m=>m.id!==nativeIds[0]),r=>r.sequenceComponents[1].input.modifiers=r.sequenceComponents[1].input.modifiers.filter(m=>m.id!==nativeIds[1]),r=>r.sequenceComponents[1].input.modifiers=r.sequenceComponents[1].input.modifiers.filter(m=>m.id!==nativeIds[2])]){
  const input=sequence(data,"1405011",6,10,10);mutate(input);assert.equal(engine.calculate(input).supported,false);
 }
});
