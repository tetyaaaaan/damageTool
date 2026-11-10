"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {loadProductionFixture,attackOf,makeRequest,assertClose,fixedSourceSha}=require("./helpers/hsrDirectVerification.cjs");
const base=[10,11,12,13,14,15,16.25,17.5,18.75,20],shots=[15,16.5,18,19.5,21,22.5,24.37,26.25,28.12,30];
function request(data,level,drive){
 const a=attackOf(data,"151009"),q=makeRequest(a,level,{atk:4123.5,hp:9071,def:1234,critRate:37,critDamage:143,damageBonus:23,enemyLevel:82,resistance:27,toughnessActive:true,enemyCount:1});
 q.character.id="1510";q.modifierInputs={"himeko-departure-drive":drive};q.attack.damageComponents=q.attack.damageComponents.filter(d=>drive!==1||d.key!=="shots");
 q.sequenceComponents=q.attack.damageComponents.map(d=>({key:d.key,name:d.name,input:{...structuredClone(q),sequenceComponents:undefined,attack:{...q.attack,...d,id:d.attackId,sourceSkillId:"151009",damageComponents:undefined,damageFormula:"statMultiplier",traceLevel:level,attackType:"ultimate",multiplier:d.multipliers[level-1]+(d.key==="shots"&&drive===3?30:0),hitCount:d.key==="shots"?drive:1}}}));return q;
}
function oracle(percent){const nonCrit=4123.5*percent/100*1.23*(100/202)*.73*.9;return {nonCrit,crit:nonCrit*2.43,expected:nonCrit*(1+.37*1.43)};}
test("round39 Himeko pulse uses all 2/3 prior charges as shots and adds A6 to the shot coefficient only",async()=>{
 const {data,engine}=await loadProductionFixture(),a=attackOf(data,"151009");assert.equal(a.provenance.sourceCommit,fixedSourceSha);assert.equal(a.provenance.relatedSourceCommit,"6b2bc17ebf461e497ba0dd0ffd44875f1866762b");
 for(const level of [1,7,10])for(const drive of [1,2,3]){
  const q=request(data,level,drive),r=engine.calculate(q),pulse=oracle(base[level-1]),extra=oracle(drive>1?drive*(shots[level-1]+(drive===3?30:0)):0);assert.notEqual(r.supported,false,r.reason);
  for(const k of ["nonCrit","crit","expected"]){assertClose(r[k],pulse[k]+extra[k],`Lv${level} drive${drive} ${k}`);assertClose(r.components.pulse[k],pulse[k]);if(drive>1)assertClose(r.components.shots[k],extra[k]);}
 }
 // Fixed JP maximum tooltip omits A6: six beams, three charge-3 pulses and three final hits.
 assertClose(6*.32+3*(.2+3*.3)+3*.8,7.62);assertClose(6*.32+3*(.2+3*(.3+.3))+3*.8,10.32);
});
test("round39 Himeko missing or mismatched pulse input stops locally and Ultimate modifiers apply to both components",async()=>{
 const {data,engine}=await loadProductionFixture(),make=()=>request(data,10,3);
 for(const change of [q=>{delete q.modifierInputs["himeko-departure-drive"];},q=>{q.modifierInputs["himeko-departure-drive"]=4;},q=>{q.modifierInputs["himeko-departure-drive"]=2.5;},q=>{q.character.eidolon=1;},q=>{q.character.id="1003";},q=>{q.enemy.count=2;},q=>{q.sequenceComponents[0].input.attack.hitCount=2;},q=>{q.sequenceComponents[0].input.attack.multiplier=39;},q=>{q.sequenceComponents[0].input.character.stats.atk=9999;},q=>{q.sequenceComponents[0].input.attack.type="skill";}]){const q=make();change(q);assert.equal(engine.calculate(q).supported,false);}
 const q=make(),before=engine.calculate(q),mod={id:"test:ultimate",category:"damageBonus",value:20,calculable:true,enabled:true,applicable:true,target:{owner:"self",attackTypes:["ultimate"]}};q.sequenceComponents.forEach(p=>p.input.modifiers=[mod]);assertClose(engine.calculate(q).expected,before.expected*1.43/1.23);
 q.sequenceComponents.forEach(p=>p.input.modifiers=[{...mod,target:{owner:"self",attackTypes:["skill"]}}]);assertClose(engine.calculate(q).expected,before.expected);
 q.sequenceComponents[0].input.modifiers=[{...mod,source:{id:"1510",skillId:"1510103"}}];assert.equal(engine.calculate(q).supported,false,"A6 is a coefficient increment, not an external DMG modifier");
});
