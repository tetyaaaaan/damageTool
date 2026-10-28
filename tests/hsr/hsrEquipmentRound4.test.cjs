"use strict";
const test=require("node:test"), assert=require("node:assert/strict");
const {loadProductionFixture,runtime,makeRequest,assertClose}=require("./helpers/hsrDirectVerification.cjs");
const authored=require("../../games/hsr/data/calc/modifiers-equipment-round4.json").modifiers;
const cases=[
 ["21003",[12,15,18,21,24],"critRate",null],
 ["21008",[24,30,36,42,48],"dotDamage",null],
 ["21019",[12,15,18,21,24],"critRate","lc-21019-kill-crit-active"],
 ["21020",[24,30,36,42,48],"critDamage","lc-21020-kill-cd-active"],
 ["21027",[4,5,6,7,8],"statPercent","lc-21027-kill-stacks"],
 ["21005",[12,15,18,21,24],"statPercent","lc-21005-mischief-stacks"]
];
const attack=(type="normal")=>({id:"round4-cone-"+type,type,element:"Fire",scalingStat:"atk",multipliers:Array(10).fill(100),canCrit:type!=="dot",target:"single"});
for(const [id,amounts,category,key] of cases) test("round4 cone "+id+": all ranks, independent damage, state, removal and restored inclusion",async()=>{
 const {data,engine}=await loadProductionFixture();
 const row=data.structuredModifiers.find(x=>x.source.kind==="lightCone"&&x.source.id===id);
 assert.ok(row,"registered production cone "+id);assert.equal(authored.filter(x=>x.source.id===id).length,1);
 assert.deepEqual(row.value.values,amounts);assert.equal(row.provenance.sourceCommit,"dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
 for(let rank=1;rank<=5;rank++){
  const stacking=row.activation.mode==="stack";
  const ctx={characterId:"1003",lightConeId:id,refinement:rank,enemy:{count:2},stats:{atk:3000,critRate:50,critDamage:100},baseStats:{atk:1000}};
  const inputs=key?{[key]:stacking?3:true}:{};
  const item=runtime.buildCandidates([row],ctx,inputs)[0];
  const value=amounts[rank-1]*(stacking?3:1);
  assert.equal(item.enabled,true);assert.equal(item.value,value);assert.equal(item.automatic,!key);
  const a=attack(category==="dotDamage"?"dot":"normal");
  const mod={...item,applicable:item.applicable&&runtime.applicableToAttack(item,a)};
  const result=engine.calculate(makeRequest(a,10,{},[mod]));
  const expectedAtk=3000+(category==="statPercent"?1000*value/100:0);
  const nc=expectedAtk*0.5*0.8*0.9*(category==="dotDamage"?1+value/100:1);
  const cd=2+(category==="critDamage"?value/100:0),cr=(50+(category==="critRate"?value:0))/100;
  assertClose(result.nonCrit,nc);assertClose(result.crit,category==="dotDamage"?nc:nc*cd);
  assertClose(result.expected,category==="dotDamage"?nc:nc*(1+cr*(cd-1)));
  const restored=JSON.parse(JSON.stringify({...inputs,[row.finalStatsInclusion.inputKey]:true}));
  const included=runtime.buildCandidates([row],ctx,restored)[0];assert.equal(included.enabled,false);assert.equal(included.includedInFinalStats,true);
  const finalConfig={atk:expectedAtk,critRate:50+(category==="critRate"?value:0),critDamage:100+(category==="critDamage"?value:0),damageBonus:category==="dotDamage"?value:0};
  const same=engine.calculate(makeRequest(a,10,finalConfig,[included]));assertClose(same.expected,result.expected);
  assert.equal(runtime.buildCandidates([row],{...ctx,lightConeId:""},inputs).length,0);
  assert.equal(runtime.buildCandidates([row],{...ctx,lightConeId:"20000"},inputs).length,0);
  assert.equal(runtime.buildCandidates([row],{...ctx,lightConeId:"",partyIds:["1002"],partyEquipment:[{characterId:"1002",lightConeId:id,refinement:rank}]},inputs).length,0,"wearer only");
  if(key){
   const off=runtime.buildCandidates([row],ctx,{[key]:stacking?0:false})[0];assert.equal(off.enabled,false);
   const loaded=runtime.buildCandidates([row],ctx,JSON.parse(JSON.stringify(inputs)))[0];assert.equal(loaded.value,value);assert.equal(loaded.enabled,true);
  }
  if(stacking){
   for(const [count,effective]of[[-1,0],[0,0],[1,1],[2,2],[3,3],[4,3]]){
    const c=runtime.buildCandidates([row],ctx,{[key]:count})[0];assert.equal(c.value,amounts[rank-1]*effective);assert.equal(c.enabled,effective>0);
   }
  }
 }
});
test("round4 enemy-count CR is automatic at two enemies, absent at three, and is not panel CR for Arena",async()=>{
 const {data}=await loadProductionFixture();const row=authored.find(x=>x.source.id==="21003");
 for(const count of[1,2,3])assert.equal(runtime.buildCandidates([row],{lightConeId:"21003",enemy:{count}}, {})[0].enabled,count<=2);
 const arena=data.structuredModifiers.find(x=>x.id==="ornament:309:2pc:normal-skill-damage");assert.ok(arena);
 const candidates=runtime.buildCandidates([row,arena],{lightConeId:"21003",refinement:5,ornamentId:"309",stats:{critRate:60},enemy:{count:2}},{});
 assert.equal(candidates.find(x=>x.id===arena.id).enabled,false,"enemy-conditional CR is not an independent panel threshold contributor");
});
test("round4 Eyes of Prey applies to DoT only and never to ordinary hits",async()=>{
 const {data,engine}=await loadProductionFixture();const row=data.structuredModifiers.find(x=>x.source.id==="21008"&&x.source.kind==="lightCone");
 const item=runtime.buildCandidates([row],{lightConeId:"21008",refinement:5},{})[0];
 for(const type of["normal","skill","ultimate","followUp","dot"]){
  const a=attack(type),applies=runtime.applicableToAttack(item,a);assert.equal(applies,type==="dot");
  const r=engine.calculate(makeRequest(a,10,{},[{...item,applicable:applies}]));
  assertClose(r.nonCrit,1080*(type==="dot"?1.48:1));
 }
});
