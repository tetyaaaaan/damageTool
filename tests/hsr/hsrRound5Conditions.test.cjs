"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {loadProductionFixture,runtime,assertClose}=require("./helpers/hsrDirectVerification.cjs");
test("ranked per-reference stacks reject ambiguous/invalid registrations while fixed legacy stacks stay valid",()=>{
 const {validateModifiers}=require("../../scripts/validateHsrModifiers.cjs"),row=require("../../games/hsr/data/calc/modifiers-equipment-round5.json").modifiers.find(x=>x.source.id==="21001");
 assert.deepEqual(validateModifiers([row]),[]);
 for(const value of [{...row.value,perStack:12},{...row.value,perStack:null},{...row.value,values:[12,15]},{...row.value,values:[12,15,18,21,NaN]}])assert.ok(validateModifiers([{...row,value}]).some(x=>x.includes("perStack")||x.includes("per-stack")||x.includes("rank values")));
 assert.ok(validateModifiers([{...row,source:{kind:"trace",id:"1108"}}]).length);
 const legacy={...row,value:{kind:"perReferenceStack",perStack:20,reference:"enemy.debuffCount",maximum:5}};assert.deepEqual(validateModifiers([legacy]),[]);
 const candidate=runtime.buildCandidates([legacy],{lightConeId:"21001",refinement:5,enemy:{debuffCount:2}},{})[0];assert.equal(candidate.value,40);
});
test("precombat SPD is explicit and stays independent from battle SPD, missing values exclude only that modifier",async()=>{
 const {data}=await loadProductionFixture(),row=data.structuredModifiers.find(x=>x.id==="relic:124:4pc:precombat-crit-rate");
 const ctx={relicIds:["124"],relicMode:4,stats:{speed:300}};
 for(const speed of[undefined,null,NaN,0,-1,100000]){
  const c=runtime.buildCandidates([row],ctx,speed===undefined?{}:{"pre-combat-speed":speed})[0];assert.equal(c.enabled,false);assert.equal(c.activation.unresolved,true);
 }
 assert.equal(runtime.buildCandidates([row],ctx,{"pre-combat-speed":94.999})[0].value,32);
 assert.equal(runtime.buildCandidates([row],ctx,{"pre-combat-speed":95})[0].value,20);
 assert.equal(runtime.buildCandidates([row],ctx,{"pre-combat-speed":110})[0].enabled,false);
});
test("bounded Talia SPD-to-BE dependency feeds Iron Cavalry once, including SPD support and final-stat inclusion",async()=>{
 const {data,engine}=await loadProductionFixture(),talia=data.structuredModifiers.find(x=>x.id==="ornament:307:2pc:break-effect-effective-speed"),spd=data.structuredModifiers.find(x=>x.id==="traceNode:1412:1412103:merit-speed"),iron=data.structuredModifiers.filter(x=>x.source.kind==="relic"&&x.source.id==="119"),recs=[...iron,talia,spd],a={type:"superBreak",element:"Fire",toughnessDamage:30};
 const ctx={characterId:"1003",relicIds:["119"],relicMode:4,ornamentId:"307",partyIds:["1412"],stats:{speed:125,breakEffect:230},attack:a},inputs={[spd.activation.inputKey]:true};
 const mods=runtime.buildCandidates(recs,ctx,inputs);assert.equal(mods.find(x=>x.id===talia.id).enabled,true);
 for(const x of mods.filter(x=>iron.some(r=>r.id===x.id))){assertClose(x.thresholdReferenceValue,250);assert.equal(x.enabled,true);}
 const request={character:{level:80,stats:{breakEffect:230}},enemy:{level:80,toughnessActive:false,resistance:20},attack:{...a,superBreakMultiplier:100},breakBaseDamage:{80:3767.5533},modifiers:mods};
 assertClose(engine.calculateSuperBreak(request).value,3767.5533*3*3.5*.8/1.75);
 const off=runtime.buildCandidates(recs,ctx,{});assert.equal(off.find(x=>x.id===talia.id).enabled,false);assert.equal(off.find(x=>x.activation.threshold===250).enabled,false);
 const removed=runtime.buildCandidates(recs,{...ctx,partyIds:[]},inputs);assert.equal(removed.find(x=>x.id===talia.id).enabled,false);
 const included=runtime.buildCandidates(recs,{...ctx,stats:{speed:145,breakEffect:250}},{[talia.finalStatsInclusion.inputKey]:true});assertClose(included.find(x=>x.activation.threshold===250).thresholdReferenceValue,250);
 const cycle={...talia,id:"cycle",category:"statPercent",stat:"atk",value:{kind:"fixed",fixed:20},activation:{mode:"statThreshold",statSource:"effective",reference:"self.atk",operator:">=",threshold:100}};const c=runtime.buildCandidates([cycle],{ornamentId:"307",stats:{atk:3000}},{})[0];assert.equal(c.applicable,false,"same-stat ATK cycles remain local");
});
