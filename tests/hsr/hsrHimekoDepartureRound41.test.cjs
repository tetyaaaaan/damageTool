"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const{loadProductionFixture,attackOf,makeRequest,runtime,assertClose}=require("./helpers/hsrDirectVerification.cjs");
const records=[...require("../../games/hsr/data/calc/modifiers-characters-round30.json").modifiers.filter(m=>m.source.id==="1510"),...require("../../games/hsr/data/calc/modifiers-himeko-departure-round40.json").modifiers],key="himeko-departure-accord";
function request(data,user,level=10,prior=0,included={}){
 const a=attackOf(data,"151022"),q=makeRequest(a,level,{atk:4317,hp:9789,def:1321,critRate:37,critDamage:143,damageBonus:23,enemyLevel:82,resistance:27,defenseIgnore:11,resistancePenetration:7});q.character.id="1510";q.modifierInputs={[key]:prior};const mode=["1002","1313"].includes(user)?1:["1001","1004"].includes(user)?2:prior;
 Object.assign(q.attack,{himekoOtherUser:true,actingCharacterId:user,actingCharacterLevel:80,actingCharacterEidolon:0,providerPresent:true,completedReferenceSnapshot:true,statReferenceId:"1510",damageOwnerId:"1510",effectiveHimekoAccord:mode,providerTalentLevel:level,damageComponents:a.otherUserComponents,multiplier:level===1?116:232});
 q.sequenceComponents=q.attack.damageComponents.map(d=>{const b={...q.attack,...d,id:d.attackId,sourceSkillId:"151022",damageFormula:"statMultiplier",damageComponents:undefined,traceLevel:level,multiplier:d.multipliers[level-1],attackType:"assist"},inputs={...q.modifierInputs,...included,[key]:mode};const mods=runtime.buildCandidates(records,{characterId:"1510",eidolon:0,traceLevelFor:()=>level,attack:b},inputs).map(m=>({...m,applicable:runtime.applicableToAttack(m,b)}));return{key:d.key,name:d.name,input:{...q,sequenceComponents:undefined,attack:b,modifiers:mods}};});return q;
}
function oracle(coef,level,mode){const v=level===1?50:100,cd=143+(level===1?40:80)+(mode===2?2*v:0),pen=7+(level===1?10:20),n=4317*coef*(1+(23+(mode===1?v:0))/100)*(100/(202-102*.11))*(1-(27-pen)/100)*.9;return {nonCrit:n,crit:n*(1+cd/100),expected:n*(1+.37*cd/100)};}
test("round41 foreign users call Himeko's own 1+3-hit attack and select the damage-time accord independently",async()=>{
 const{data,engine}=await loadProductionFixture();for(const level of[1,10])for(const[user,prior]of[["1002",0],["1002",2],["1001",0],["1001",1],["1101",0],["1101",1],["1101",2]]){const q=request(data,user,level,prior),r=engine.calculate(q),mode=q.attack.effectiveHimekoAccord,coeff=level===1?[.8,3*.12]:[1.6,3*.24],terms=coeff.map(v=>oracle(v,level,mode));assert.notEqual(r.supported,false,r.reason);for(const k of["nonCrit","crit","expected"]){assertClose(r[k],terms[0][k]+terms[1][k]);assertClose(r.components.area[k],terms[0][k]);assertClose(r.components.shots[k],terms[1][k]);}}
});
test("round41 explicit Himeko inclusion excludes each known buff once and rejects actor/owner/shot mismatches",async()=>{
 const{data,engine}=await loadProductionFixture(),base=engine.calculate(request(data,"1001"));
 const flags={"trace:1510:151004:crit-damage-in-final-stats":true,"trace:1510:151004:res-pen-in-final-stats":true,"trace:1510:accord-crit:in-final-stats":true,"trace:1510:accord-skill-crit:in-final-stats":true},q=request(data,"1001",10,0,flags);q.character.stats.critDamage+=280;q.enemy.resistancePenetration+=20;assertClose(engine.calculate(q).expected,base.expected);
 for(const change of[q=>{q.attack.actingCharacterId="1003";},q=>{q.attack.providerPresent=false;},q=>{q.attack.actingCharacterEidolon=1;},q=>{q.character.id="1002";},q=>{q.attack.effectiveHimekoAccord=1;},q=>{q.sequenceComponents[1].input.attack.hitCount=4;},q=>{q.sequenceComponents[1].input.attack.multiplier+=30;},q=>{q.sequenceComponents[0].input.character={...q.character,stats:{...q.character.stats,atk:99999}};}]){const bad=request(data,"1001");change(bad);assert.equal(engine.calculate(bad).supported,false);}
});

// Same-release Field_Insert grants Skill52Fake/53Fake/51Fake respectively; no new damage contract.
test("round42 Sunday, Welt, and Tingyun reuse the owner snapshot and correct accord before the same two damage components",async()=>{
 const{data,engine}=await loadProductionFixture();
 for(const[user,forced]of[["1313",1],["1004",2],["1202",null]])for(const prior of[0,1,2])for(const level of[1,10]){
  assert.ok(attackOf(data,"151022").supportedOtherUsers.includes(user));
  const q=request(data,user,level,prior),r=engine.calculate(q),mode=forced??prior,coeff=level===1?[.8,.36]:[1.6,.72],terms=coeff.map(v=>oracle(v,level,mode));
  assert.notEqual(r.supported,false,r.reason);for(const k of["nonCrit","crit","expected"]){assertClose(r[k],terms[0][k]+terms[1][k]);assertClose(r.components.area[k],terms[0][k]);assertClose(r.components.shots[k],terms[1][k]);}
  const bad=request(data,user,level,prior);bad.attack.effectiveHimekoAccord=(mode+1)%3;assert.equal(engine.calculate(bad).supported,false);
 }
});
