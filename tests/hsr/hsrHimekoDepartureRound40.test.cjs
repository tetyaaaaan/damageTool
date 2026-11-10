"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const{loadProductionFixture,attackOf,makeRequest,runtime,assertClose}=require("./helpers/hsrDirectVerification.cjs");
const modeKey="himeko-departure-accord",modeRows=require("../../games/hsr/data/calc/modifiers-himeko-departure-round40.json").modifiers;
const prior=require("../../games/hsr/data/calc/modifiers-characters-round30.json").modifiers.filter(m=>m.source.id==="1510"),rows=[...prior,...modeRows];
function modifiers(attack,inputs,level=10,owner="1510",present=true){return runtime.buildCandidates(rows,{characterId:owner,eidolon:0,partyIds:owner!=="1510"&&present?["1510"]:[],partyEidolons:{"1510":0},traceLevelFor:()=>level,attack},inputs).map(m=>({...m,applicable:runtime.applicableToAttack(m,attack)}));}
function request(data,mode,level,inputs={}){
 const q=makeRequest(attackOf(data,"151022"),level,{atk:4317,hp:8123,def:1321,critRate:37,critDamage:143,damageBonus:23,enemyLevel:82,resistance:27});q.character.id="1510";q.modifierInputs={[modeKey]:mode,...inputs};
 q.sequenceComponents=q.attack.damageComponents.map(d=>{const b={...q.attack,...d,id:d.attackId,sourceSkillId:"151022",damageFormula:"statMultiplier",damageComponents:undefined,traceLevel:level,multiplier:d.multipliers[level-1],attackType:"assist"};return{key:d.key,name:d.name,input:{...q,sequenceComponents:undefined,attack:b,modifiers:modifiers(b,q.modifierInputs,level)}};});return q;
}
function oracle(coefficient,mode,level){const strength=level===1?50:100,cd=143+(level===1?40:80)+(mode===2?2*strength:0),pen=level===1?10:20,n=4317*coefficient*(1+(23+(mode===1?strength:0))/100)*(100/202)*(1-(27-pen)/100)*.9;return{nonCrit:n,crit:n*(1+cd/100),expected:n*(1+.37*cd/100)};}
test("round40 accords use distinct damage and crit groups on self-assist components and auto-apply the current Talent once",async()=>{
 const{data,engine}=await loadProductionFixture();
 for(const level of[1,10])for(const mode of[0,1,2]){const q=request(data,mode,level),r=engine.calculate(q),coeff=level===1?[1,.18*4]:[2,.32*4],terms=coeff.map(v=>oracle(v,mode,level));assert.notEqual(r.supported,false,r.reason);
  for(const k of["nonCrit","crit","expected"]){assertClose(r[k],terms[0][k]+terms[1][k]);assertClose(r.components.area[k],terms[0][k]);assertClose(r.components.shots[k],terms[1][k]);}
  const again=engine.calculate(request(data,mode,level,{"himeko-departure-prior-assist-buff":true}));assertClose(again.expected,r.expected,"the same Talent is not added for a second prior cast");
 }
 const q=request(data,2,10),before=engine.calculate(q),inc={"trace:1510:accord-crit:in-final-stats":true,"trace:1510:accord-skill-crit:in-final-stats":true,"trace:1510:151004:crit-damage-in-final-stats":true,"trace:1510:151004:res-pen-in-final-stats":true};
 const included=request(data,2,10,inc);included.character.stats.critDamage+=280;included.enemy.resistancePenetration=20;included.sequenceComponents.forEach(p=>{p.input.character=included.character;p.input.enemy=included.enemy;});assertClose(engine.calculate(included).expected,before.expected,"explicit final stats exclude all three CD components and Talent penetration once");
 for(const change of[q=>{q.modifierInputs[modeKey]=3;},q=>{q.character.id="1002";},q=>{q.enemy.count=2;},q=>{q.sequenceComponents[1].input.attack.hitCount=5;},q=>{q.sequenceComponents[1].input.attack.tags=[];}]){const bad=request(data,1,10);change(bad);assert.equal(engine.calculate(bad).supported,false);}
});
test("round40 Judgment only boosts Himeko and Ultimate; Annihilation uses the provider level on each ally's own attack",async()=>{
 const{data,engine}=await loadProductionFixture();
 for(const[id,mode]of[["151001",1],["151003",1],["151001",2]]){const a=attackOf(data,id),q=makeRequest(a,id==="151001"?6:10,{atk:3000,critRate:50,critDamage:100}),inputs={[modeKey]:mode};q.character.id="1510";q.modifiers=modifiers(q.attack,inputs,1);const n=3000*q.attack.multiplier/100*.36*(mode===1?(id==="151003"?2:1.5):1),cd=mode===2?150:100;assertClose(engine.calculate(q).expected,n*(1+.5*cd/100));}
 const a=attackOf(data,"100201"),q=makeRequest(a,6,{atk:2345,hp:9981,def:1801,critRate:31,critDamage:117});q.character.id="1002";
 const raw=engine.calculate(q).nonCrit;for(const mode of[0,1,2]){q.modifiers=modifiers(q.attack,{[modeKey]:mode},1,"1002");assertClose(engine.calculate(q).expected,raw*(1+.31*(117+(mode===2?50:0))/100));}
 q.modifiers=modifiers(q.attack,{[modeKey]:2},1,"1002",false);assertClose(engine.calculate(q).expected,raw*(1+.31*1.17),"provider removal restores the ally's original crit");
});
