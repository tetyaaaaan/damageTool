"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProductionFixture, runtime, assertClose, fixedSourceSha } = require("./helpers/hsrDirectVerification.cjs");
const authored = require("../../games/hsr/data/calc/modifiers-native-round6.json").modifiers;
const STACKS = "fugue-break-buff-stacks";
const INCLUDED = "fugue-break-buff-in-final";
const BASE_ID = "trace:1225:1225103:break-effect-party";
const EXTRA_ID = "trace:1225:1225103:break-effect-party-220";
const byId = new Map(authored.map(row => [row.id, row]));

function context(providerBE) {
  const partyStats = { "1225": {} };
  if (Number.isFinite(providerBE)) partyStats["1225"].breakEffect = providerBE;
  return {
    characterId: "1301",
    characterElement: "Fire",
    partyIds: ["1225"],
    partyStats,
    stats: { atk: 3000, hp: 6000, def: 1000, breakEffect: 50 },
    baseStats: { atk: 1000, hp: 1000, def: 1000 }
  };
}
function candidates(providerBE, stacks, extraInputs={}) {
  return runtime.buildCandidates(authored, context(providerBE), { [STACKS]: stacks, ...extraInputs });
}
function candidate(items,id) { return items.find(item=>item.id===id); }

test("round6 Fugue trace 1225103 is loaded from the production catalog with fixed-source conditions", async()=>{
  const {data}=await loadProductionFixture();
  const loaded=data.structuredModifiers.filter(row=>row.source.kind==="trace"&&row.source.id==="1225"&&row.id.includes("1225103"));
  assert.equal(loaded.length,2);
  assert.equal(fixedSourceSha,"dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  for(const row of loaded){
    assert.equal(row.providerScope,"party");
    assert.equal(row.target.owner,"activeAlly");
    assert.equal(row.target.excludeSelf,true);
    assert.equal(row.support.status,"calculable");
    assert.equal(row.provenance.sourceCommit,fixedSourceSha);
  }
  assert.deepEqual(byId.get(BASE_ID).inputValidation,{minimum:0,maximum:2,integer:true,maximumEidolon:0,levelMaximum:1});
  assert.deepEqual(byId.get(EXTRA_ID).inputValidation,{minimum:0,maximum:2,integer:true,maximumEidolon:0,levelMaximum:1});
  assert.deepEqual(Array.from(byId.get(EXTRA_ID).value.inputMultipliers),[0,1,2]);
  assert.equal(byId.get(BASE_ID).value.perStack,6);
  assert.equal(byId.get(BASE_ID).value.inputKey,undefined,"the activation stack selector supplies the one visible layer control");
  assert.equal(byId.get(EXTRA_ID).value.sharedInput,true,"threshold extra reuses the same layer selector");
  assert.equal(byId.get(BASE_ID).source.traceId,"1225103");
  assert.equal(byId.get(EXTRA_ID).source.traceId,"1225103");
  assert.equal(byId.get(EXTRA_ID).value.values[0],12);
  assert.equal(byId.get(EXTRA_ID).activation.threshold,220);
  assert.equal(byId.get(BASE_ID).finalStatsInclusion.inputKey,byId.get(EXTRA_ID).finalStatsInclusion.inputKey);
});

test("Fugue BE support uses independent Break and Super Break values at 219.99%, 220%, and 220.01%",async()=>{
  const {data,engine}=await loadProductionFixture();
  const baseBreak=data.breakBaseDamage[80];
  assert.equal(baseBreak,3767.5533);
  const expectedTotals={};
  for(const [providerBE,stacks,extraPerStack] of [[219.99,1,0],[220,2,12],[220.01,2,12]]){
    const items=candidates(providerBE,stacks);
    const base=candidate(items,BASE_ID),extra=candidate(items,EXTRA_ID);
    assert.ok(base&&extra);
    assert.equal(base.enabled,true);
    assert.equal(base.value,stacks*6);
    assert.equal(extra.enabled,providerBE>=220);
    assert.equal(extra.value,stacks*12);
    const supportBE=stacks*6+stacks*extraPerStack;
    const modifiers=[base,extra];
    const breakInput={character:{level:80,stats:{breakEffect:50}},enemy:{level:80,weakness:true,count:1,maxToughness:30,resistance:20,toughnessActive:true},element:"Fire",modifiers,breakBaseDamage:data.breakBaseDamage};
    const breakExpected=baseBreak*2*(1+(50+supportBE)/100)*0.5*0.8*0.75;
    const breakActual=engine.calculateBreak(breakInput);
    assert.equal(breakActual.supported,true);
    assertClose(breakActual.value,breakExpected,"Fire Break BE="+providerBE+" stacks="+stacks);
    const sbInput={character:{level:80,stats:{breakEffect:50}},enemy:{level:80,count:1,resistance:20,toughnessActive:false},attack:{type:"superBreak",element:"Fire",toughnessDamage:30,superBreakMultiplier:100},modifiers,breakBaseDamage:data.breakBaseDamage};
    const sbExpected=baseBreak*3*(1+(50+supportBE)/100)*0.5*0.8;
    const sbActual=engine.calculateSuperBreak(sbInput);
    assert.equal(sbActual.supported,true);
    assertClose(sbActual.value,sbExpected,"Super Break BE="+providerBE+" stacks="+stacks);
    expectedTotals[providerBE]={supportBE,break:breakExpected,superBreak:sbExpected};
  }
  assert.equal(expectedTotals[219.99].supportBE,6);
  assert.equal(expectedTotals[220].supportBE,36);
  assert.ok(expectedTotals[220].superBreak>expectedTotals[219.99].superBreak);
});

test("Fugue base stacks work without provider BE, threshold extra is local, and stack zero needs no BE",()=>{
  const unknown=candidates(undefined,1),unknownBase=candidate(unknown,BASE_ID),unknownExtra=candidate(unknown,EXTRA_ID);
  assert.equal(unknownBase.enabled,true);
  assert.equal(unknownBase.value,6);
  assert.equal(unknownExtra.enabled,false);
  assert.equal(unknownExtra.activation.unresolved,true);
  assert.match(unknownExtra.reason,/未確定/);
  const zero=candidates(undefined,0);
  assert.equal(candidate(zero,BASE_ID).enabled,false);
  assert.equal(candidate(zero,EXTRA_ID).enabled,false);
  assert.equal(candidate(zero,EXTRA_ID).activation.unresolved,false);
  assert.deepEqual(candidate(zero,EXTRA_ID).inputWarnings,[]);
  const boundary=candidates(220,1);
  assert.equal(candidate(boundary,EXTRA_ID).enabled,true);
  assert.equal(candidate(boundary,EXTRA_ID).value,12);
});

test("Fugue provider exclusion, invalid stacks, inclusion guard, and JSON state restoration stay scoped",()=>{
  assert.equal(runtime.buildCandidates(authored,{...context(250),characterId:"1225",partyIds:[],partyStats:{}},{[STACKS]:2}).length,0,"Fugue cannot target self");
  assert.equal(runtime.buildCandidates(authored,{...context(250),partyIds:[],partyStats:{}},{[STACKS]:2}).length,0,"provider leaving party removes the effect");
  for(const invalid of [-1,3,1.5]){
    const items=candidates(250,invalid),base=candidate(items,BASE_ID),extra=candidate(items,EXTRA_ID);
    assert.equal(base.applicable,false,"invalid base stack is rejected "+invalid);
    assert.equal(extra.applicable,false,"invalid shared stack is rejected "+invalid);
    assert.ok(base.inputWarnings.length);
    assert.ok(extra.inputWarnings.length);
  }
  const inputs={[STACKS]:2};
  const before=candidates(250,inputs[STACKS]);
  const restored=candidates(250,JSON.parse(JSON.stringify(inputs))[STACKS]);
  assert.deepEqual(restored.map(x=>[x.id,x.enabled,x.value]),before.map(x=>[x.id,x.enabled,x.value]));
  const included=candidates(250,2,{[INCLUDED]:true});
  for(const row of included){assert.equal(row.enabled,false);assert.equal(row.includedInFinalStats,true);}
});
