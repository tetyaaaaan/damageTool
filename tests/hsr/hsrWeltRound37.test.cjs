"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {loadProductionFixture,attackOf,makeRequest,runtime,independentDirectDamage,assertClose,fixedSourceSha}=require("./helpers/hsrDirectVerification.cjs");
const profile={atk:3271.25,hp:9087.5,def:1321.75,critRate:43.25,critDamage:137.5,damageBonus:21.5,resistance:27.5,enemyLevel:83};
const curves={normal:[50,60,70,80,90,100],skill:[36,39.6,43.2,46.8,50.4,54,58.5,63,67.5,72],ultimate:[90,96,102,108,114,120,127.5,135,142.5,150],talent:[30,33,36,39,42,45,48.75,52.5,56.25,60]};
function request(data,id,level,talent,inputs={}){
 const parent=attackOf(data,id),state={"welt-enemy-slowed":true,...inputs},ctx={characterId:"1004",enhancementState:"previous",eidolon:0,traceLevelFor:()=>talent};
 const q=makeRequest(parent,level,profile);q.character.id="1004";q.modifierInputs={...state};
 q.sequenceComponents=parent.damageComponents.map(d=>{
  const a=attackOf(data,d.attackId),lv=d.key==="talent"?talent:level,r=makeRequest(a,lv,profile);
  r.character.id="1004";Object.assign(r.attack,{damageFormula:"statMultiplier",target:"single",hitCount:d.hitCount});r.modifierInputs={...state};
  const effective={...state,...parent.comparisonModifierInputs};
  r.modifiers=runtime.buildCandidates(data.structuredModifiers.filter(m=>m.source?.id==="1004"),ctx,effective).map(m=>({...m,applicable:m.applicable&&runtime.applicableToAttack(m,r.attack)}));
  // A Basic-only bonus must not leak into the separate Additional Talent damage.
  r.modifiers.push({id:"independent-normal-bonus",category:"damageBonus",value:17,enabled:true,calculable:true,applicable:r.attack.type==="normal",target:{owner:"self",attackTypes:["normal"]}});
  return {key:d.key,name:d.name,input:r};
 });return q;
}
test("round37 previous Welt uses pinned curves and independently checked pre-slowed 1/3/2 Talent triggers",async()=>{
 const {data,engine}=await loadProductionFixture();
 for(const[id,type,level,talent,hits]of [["1004012","normal",6,7,[1,1]],["1004022","skill",10,1,[3,3]],["1004032","ultimate",1,10,[1,2]]]){
  const a=attackOf(data,id);assert.equal(a.provenance.sourceCommit,fixedSourceSha);assert.equal(a.provenance.referenceUrl,"https://hsr.keqingmains.com/welt/");assert.match(a.provenance.gameVersion,/v1.5/);
  assert.deepEqual(Array.from(a.multipliers).slice(0,curves[type].length),curves[type]);assert.deepEqual(Array.from(a.damageComponents[1].multipliers).slice(0,10),curves.talent);
  assert.deepEqual(Array.from(a.damageComponents,x=>x.hitCount),hits);
  const q=request(data,id,level,talent),out=engine.calculate(q);assert.notEqual(out.supported,false,out.reason);
  const terms=q.sequenceComponents.map(p=>{const v=independentDirectDamage(p.input);return Object.fromEntries(["nonCrit","crit","expected"].map(k=>[k,v[k]*p.input.attack.hitCount]));});
  for(const k of ["nonCrit","crit","expected"]){assertClose(out[k],terms[0][k]+terms[1][k],id+" "+k);q.sequenceComponents.forEach((p,i)=>assertClose(out.components[p.key][k],terms[i][k],p.key+" "+k));}
  assert.ok(q.sequenceComponents.every(p=>p.input.modifiers.filter(m=>m.enabled&&m.applicable).every(m=>m.variant!=="enhanced")),"enhanced debuffs never cross variants");
 }
});
test("round37 previous Welt locally rejects unknown states and applies automatic Ultimate A2 once",async()=>{
 const {data,engine}=await loadProductionFixture();
 const make=()=>request(data,"1004032",10,10),base=make(),out=engine.calculate(base);
 const included=make();included.enemy.takenDamage=12;for(const p of included.sequenceComponents){p.input.enemy.takenDamage=12;p.input.modifiers=runtime.buildCandidates(data.structuredModifiers.filter(m=>m.source?.id==="1004"),{characterId:"1004",enhancementState:"previous",eidolon:0,traceLevelFor:()=>10},{"welt-enemy-slowed":true,"welt-punishment-active":true,"welt-punishment-in-final-enemy-input":true}).map(m=>({...m,applicable:m.applicable&&runtime.applicableToAttack(m,p.input.attack)}));}
 assertClose(engine.calculate(included).expected,out.expected,"A2 already included in enemy input is not added twice");
 for(const mutate of [q=>{q.modifierInputs["welt-enemy-slowed"]=false;},q=>{q.character.id="1003";},q=>{q.character.eidolon=1;},q=>{q.enemy.count=2;},q=>{q.enemy.toughnessActive=false;},q=>{q.sequenceComponents[1].input.attack.id="1100404";},q=>{q.sequenceComponents[1].input.attack.hitCount=1;},q=>{q.sequenceComponents[0].input.modifiers=[];}]){
  const q=structuredClone(make());mutate(q);assert.equal(engine.calculate(q).supported,false);
 }
 const basic=request(data,"1004012",6,10,{"welt-enemy-slowed":false});assert.equal(engine.calculate(basic).supported,false);assert.notEqual(engine.calculate(basic.sequenceComponents[0].input).supported,false,"standalone direct damage stays available");
 assert.equal(attackOf(data,"11004022").damageComponents[2].hitCount,5,"enhanced Skill keeps five Talent triggers");
});
