"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {loadProductionFixture,runtime,makeRequest,attackOf,assertClose}=require("./helpers/hsrDirectVerification.cjs");
const defs=require("../../games/hsr/data/calc/modifiers-native-round5.json").modifiers;
test("round5 fixed native supports select only their provider/recipient and restore independently",async()=>{
 const {data}=await loadProductionFixture();
 for(const row of defs){
  assert.ok(data.structuredModifiers.find(x=>x.id===row.id));assert.equal(row.provenance.sourceCommit,"dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  const ctx={characterId:"1413",partyIds:[row.source.id],stats:{hp:6000,speed:115},baseStats:{hp:1000,speed:100}},key=row.activation.inputKey;
  assert.equal(runtime.buildCandidates([row],ctx,{})[0].enabled,false);
  const inputs=JSON.parse(JSON.stringify({[key]:true})),on=runtime.buildCandidates([row],ctx,inputs)[0];
  assert.equal(on.enabled,true);assert.equal(on.providerId,row.source.id);assert.equal(on.automatic,false);
  assert.equal(runtime.buildCandidates([row],{...ctx,partyIds:[]},inputs).length,0);
  const own=runtime.buildCandidates([row],{...ctx,characterId:row.source.id,partyIds:[]},inputs)[0];assert.equal(own.enabled,true,"provider can benefit");
  const incl=runtime.buildCandidates([row],ctx,{...inputs,[row.finalStatsInclusion.inputKey]:true})[0];assert.equal(incl.enabled,false);
 }
});
test("Bailu overhealing HP uses recipient base HP and changes production HP-scaled Normal once",async()=>{
 const {data,engine}=await loadProductionFixture(),row=defs.find(x=>x.source.id==="1211"),a=attackOf(data,"141301");
 const ctx={characterId:"1413",partyIds:["1211"],stats:{hp:6000},baseStats:{hp:1000},partyStats:{"1211":{hp:9999}}},input={[row.activation.inputKey]:true},on=runtime.buildCandidates([row],ctx,input)[0];
 const r=engine.calculate(makeRequest(a,6,{hp:6000,baseHp:1000},[on]));assertClose(r.nonCrit,6100*.5*.5*.8*.9);assertClose(r.expected,1647);
 const same=engine.calculate(makeRequest(a,6,{hp:6100,baseHp:1000},runtime.buildCandidates([row],{...ctx,stats:{hp:6100}},{...input,[row.finalStatsInclusion.inputKey]:true})));assertClose(same.expected,r.expected);
 const otherProvider=runtime.buildCandidates([row],{...ctx,partyStats:{"1211":{hp:1000}}},input)[0];assert.equal(otherProvider.value,10,"provider HP is not the reference");
 const normal={id:"atk",type:"normal",element:"Fire",multipliers:[100],scalingStat:"atk"};assertClose(engine.calculate(makeRequest(normal,1,{},[on])).nonCrit,1080,"HP does not leak into ATK scaling");
});
test("Cerydra trace gives flat 20 SPD and crosses both Glamoth thresholds with removal/inclusion",async()=>{
 const {data,engine}=await loadProductionFixture(),row=defs.find(x=>x.source.id==="1412"),gl=data.structuredModifiers.find(x=>x.id==="ornament:311:2pc:speed-damage"),a={id:"spd",type:"normal",element:"Fire",multipliers:[100],scalingStat:"atk"};
 for(const [speed,bonus]of [[114.999,0],[115,12],[115.001,12],[139.999,12],[140,18],[140.001,18]]){
  const ctx={characterId:"1003",partyIds:["1412"],stats:{speed},ornamentId:"311"};
  const mods=runtime.buildCandidates([row,gl],ctx,{[row.activation.inputKey]:true});assert.equal(mods[0].value,20);assert.equal(mods[1].value,bonus);
  assertClose(engine.calculate(makeRequest(a,1,{},mods)).nonCrit,1080*(1+bonus/100));
  const included=runtime.buildCandidates([row,gl],{...ctx,stats:{speed:speed+20}},{[row.activation.inputKey]:true,[row.finalStatsInclusion.inputKey]:true});assert.equal(included[1].value,bonus);
  const off=runtime.buildCandidates([row,gl],ctx,{});assert.equal(off[0].enabled,false);
 }
});
