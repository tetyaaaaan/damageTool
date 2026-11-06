"use strict";
const test=require("node:test"), assert=require("node:assert/strict");
const {loadProductionFixture,attackOf,makeRequest,runtime,independentDirectDamage,assertClose}=require("./helpers/hsrDirectVerification.cjs");
const sourceSha="dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487";
test("Round19 enhanced Welt combines body/Judge/Talent once at a saturated pre-existing snapshot",async()=>{
 const {data,engine}=await loadProductionFixture();
 const profile={atk:3271.25,hp:9087.5,def:1321.75,critRate:43.25,critDamage:137.5,damageBonus:21.5,resistance:27.5,enemyLevel:83};
 const inputs={"welt-weightless-active":true,"welt-weightless-damage-stacks":10};
 const records=data.structuredModifiers.filter(m=>m.source?.id==="1004");
 const context={characterId:"1004",enhancementState:"enhanced",eidolon:0,traceLevelFor:()=>8};
 for(const [id,mainLevel,expectedHits] of [["11004012",5,[1,1,1]],["11004022",7,[5,1,5]],["11004032",7,[1,2]]]){
  const parent=attackOf(data,id);assert.equal(parent.provenance.sourceCommit,sourceSha);
  const request=makeRequest(parent,mainLevel,profile);request.modifierInputs={...inputs};
  request.sequenceComponents=parent.damageComponents.map((d,i)=>{
   const source=attackOf(data,d.attackId),level=d.key==="talent"?8:mainLevel;
   assert.deepEqual(d.multipliers,source.multipliers,"reuse every registered level, "+d.attackId);
   assert.equal(d.hitCount,expectedHits[i]);
   const input=makeRequest(source,level,profile);Object.assign(input.attack,{damageFormula:"statMultiplier",target:"single",hitCount:d.hitCount});input.modifierInputs={...inputs};
   input.modifiers=runtime.buildCandidates(records,context,inputs).map(m=>({...m,applicable:m.applicable&&runtime.applicableToAttack(m,input.attack)}));
   return {key:d.key,name:d.name,input};
  });
  const result=engine.calculate(request);assert.notEqual(result.supported,false,result.reason);
  const independent=request.sequenceComponents.map(p=>{const oracle=independentDirectDamage(p.input);return Object.fromEntries(["nonCrit","crit","expected"].map(k=>[k,oracle[k]*p.input.attack.hitCount]));});
  for(const k of ["nonCrit","crit","expected"]){assertClose(result[k],independent.reduce((sum,x)=>sum+x[k],0),id+" total "+k);request.sequenceComponents.forEach((p,i)=>assertClose(result.components[p.key][k],independent[i][k],p.key+" "+k));}
  for(const mutate of [r=>r.modifierInputs["welt-weightless-active"]=false,r=>r.modifierInputs["welt-weightless-damage-stacks"]=9,r=>r.sequenceComponents[0].input.modifiers=[],r=>r.enemy.count=2]){const bad=structuredClone(request);mutate(bad);assert.equal(engine.calculate(bad).supported,false);}
 }
 const c=data.characters.find(c=>c.id==="1004"),skills=Object.fromEntries(c.skills.map(s=>[s.id,s]));
 attackOf(data,"1100402").multipliers.forEach((v,i)=>assertClose(v,skills["1100402"].params[i][0]*100,"Skill source level "+i));
 attackOf(data,"1100404").multipliers.forEach((v,i)=>assertClose(v,skills["1100404"].params[i][0]*100,"Talent source level "+i));
 assertClose(attackOf(data,"110041021").multipliers[5],100*.8,"Judge Basic once");
 assertClose(attackOf(data,"110041022").multipliers[9],72*1.2,"Judge uses one Skill-hit multiplier once");
});
