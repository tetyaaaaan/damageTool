"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {loadProductionFixture,attackOf,makeRequest,runtime,independentDirectDamage,assertClose}=require("./helpers/hsrDirectVerification.cjs");
const skillBurn=[83.9,92.3,100.69,109.09,117.48,130.07,146.86,167.84,193.03,218.21];
const ultDirect=[72,76.8,81.6,86.4,91.2,96,102,108,114,120],detonation=[72,74,76,78,80,82,84.5,87,89.5,92];
const firekiss=[4,4.3,4.6,4.9,5.2,5.5,5.87,6.25,6.63,7];
test("Round20 Guinaifen one own Burn Ultimate combines critical direct and noncritical detonation",async()=>{
 const {data,engine}=await loadProductionFixture(),a=attackOf(data,"1210032");
 assert.equal(a.provenance.sourceCommit,"dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
 assert.deepEqual(a.damageComponents[0].multipliers.slice(0,10),ultDirect);
 assert.deepEqual(a.damageComponents[1].multiplierProductComponents.map(c=>c.values),[skillBurn,detonation]);assert.deepEqual(a.firekissPerStackValues,firekiss);
 const profile={atk:3271.25,hp:8347.5,def:1379.25,critRate:37.5,critDamage:123.75,damageBonus:18.5,resistance:27.5,enemyLevel:83,defenseReduction:11.5};
 for(const [s,u,t]of [[1,10,1],[10,1,10],[3,8,5]]){
  const input=makeRequest(a,u,profile);input.attack.talentTraceLevel=t;
  const context={characterId:"1210",eidolon:0,traceLevelFor:source=>source.skillId==="121004"?t:10};
  const inputs=a.comparisonModifierInputs;
  input.sequenceComponents=a.damageComponents.map((d,i)=>{
   const r=makeRequest(attackOf(data,d.attackId),u,profile);Object.assign(r.attack,{damageFormula:"statMultiplier",target:"single",hitCount:1,multiplier:i?skillBurn[s-1]*detonation[u-1]/100:ultDirect[u-1]});
   if(i)r.attack.resolvedMultiplierComponents=[{traceKey:"skill",level:s,value:skillBurn[s-1]},{traceKey:"ultimate",level:u,value:detonation[u-1]}];
   r.modifiers=runtime.buildCandidates(data.structuredModifiers.filter(m=>m.source.id==="1210"),context,inputs).map(m=>({...m,applicable:m.applicable&&runtime.applicableToAttack(m,r.attack)}));
   return {key:d.key,name:d.name,input:r};
  });
  const result=engine.calculate(input);assert.notEqual(result.supported,false,result.reason);
  const expected=input.sequenceComponents.map(p=>independentDirectDamage(p.input));
  for(const key of ["nonCrit","crit","expected"]){assertClose(result[key],expected[0][key]+expected[1][key],"sum "+s+"/"+u+"/"+t+" "+key);for(let i=0;i<2;i++)assertClose(result.components[a.damageComponents[i].key][key],expected[i][key],"part "+key);}
  assertClose(result.components.burn.crit,result.components.burn.nonCrit,"Burn cannot crit");
  for(const mutate of [r=>r.sequenceComponents[1].input.attack.canCrit=true,r=>r.sequenceComponents[1].input.attack.multiplier=NaN,r=>r.sequenceComponents[1].input.attack.resolvedMultiplierComponents[0].level=0,r=>r.sequenceComponents[0].input.modifiers=[],r=>r.enemy.count=2]){const bad=structuredClone(input);mutate(bad);assert.equal(engine.calculate(bad).supported,false);}
 }
});
