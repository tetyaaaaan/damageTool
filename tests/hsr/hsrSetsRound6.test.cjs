"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {readJson,runtime,fixedSourceSha,loadProductionFixture,makeRequest,assertClose,assertMatchesIndependent}=require("./helpers/hsrDirectVerification.cjs");
const records=readJson("games/hsr/data/calc/modifiers-sets-round6.json").modifiers;
const get=id=>records.find(item=>item.id===id);
const candidate=(record,context,inputs={})=>runtime.buildCandidates([record],context,inputs)[0];
const station=get("ornament:301:2pc:speed-atk-effective");
const belobog=get("ornament:304:2pc:effect-hit-def");
const forge=get("ornament:316:2pc:fire-weakness-break-effect-active");
const fleet=get("ornament:302:2pc:provider-speed-party-atk");
const keel=get("ornament:310:2pc:provider-effect-res-party-crit-damage");
const penacony=get("ornament:312:2pc:provider-same-element-ally-damage");
const lushaka=get("ornament:317:2pc:provider-first-slot-ally-atk");

for(const item of records)test("round6 record "+item.id+" is pinned, calculable and piece-gated",()=>{
  assert.equal(item.provenance.sourceCommit,fixedSourceSha);
  assert.equal(item.support.status,"calculable");
  assert.equal(item.source.kind,"ornament");
  assert.equal(item.source.setPieces,2);
});

test("production loader sees the manifest records once and permanent properties remain final-input only",async()=>{
  const {data}=await loadProductionFixture();
  // Parent adds the manifest entry; retain a direct data check to catch omissions.
  for(const item of records)assert.equal(data.structuredModifiers.filter(m=>m.id===item.id).length,1,item.id+" loaded exactly once");
  for(const [id,stat] of [["301","atk"],["302","hp"],["304","def"],["310","effectRes"],["312","spRatio"],["316","speed"],["317","spRatio"]])
    assert.equal(records.some(m=>m.source.id===id&&m.stat===stat&&m.activation.mode==="always"),false,id+" permanent 2pc stat is not registered for reapplication");
});

test("Space Sealing Station auto-applies the extra ATK at effective SPD120, including active party SPD support",async()=>{
  const {data,engine}=await loadProductionFixture();
  const partySpeed=data.structuredModifiers.find(m=>m.id==="ornament:323:2pc:party-speed-memosprite");
  assert.ok(partySpeed,"party SPD ornament provider is registered");
  assert.equal(station.activation.statSource,"effective");
  const context={characterId:"1001",partyIds:["1002"],ornamentId:"301",stats:{atk:3000,speed:114},baseStats:{atk:1000,speed:100},partyEquipment:[{characterId:"1002",ornamentId:"323"}]};
  const off=runtime.buildCandidates([station,partySpeed],context,{})[0];
  assert.equal(off.activation.active,false);
  assert.equal(off.value,12,"candidate retains its tier value but remains inactive below threshold");
  const active=runtime.buildCandidates([station,partySpeed],context,{[partySpeed.activation.inputKey]:true});
  const stationOn=active.find(m=>m.id===station.id),speedOn=active.find(m=>m.id===partySpeed.id);
  assert.equal(speedOn.providerId,"1002");
  assert.equal(stationOn.activation.active,true,"base SPD114 plus party support +8 reaches effective SPD122");
  assert.equal(stationOn.thresholdReferenceValue,122);
  assert.equal(stationOn.automatic,true,"SPD threshold is automatic, not a user toggle");
  const normal={id:"round6-station-normal",type:"normal",attackType:"normal",element:"Physical",scalingStat:"atk",multiplier:100,multipliers:[100],traceLevel:1};
  const withBonus=assertMatchesIndependent(engine,makeRequest(normal,1,{atk:3000,baseAtk:1000},[stationOn]),"Station extra ATK12 at effective SPD122");
  assertClose(withBonus.nonCrit,1123.2,"3000 final ATK + 120 additional ATK, ordinary damage");
  assert.equal(candidate(station,{...context,ornamentId:"",stats:{...context.stats,speed:130}}),undefined,"removing set clears the candidate");
  const included=candidate(station,{...context,stats:{...context.stats,speed:130}},{[station.finalStatsInclusion.inputKey]:true});
  assert.equal(included.enabled,false,"conditional ATK already in final input is not duplicated");
  const save=JSON.parse(JSON.stringify({[partySpeed.activation.inputKey]:true}));
  assert.equal(runtime.buildCandidates([station,partySpeed],context,save).find(m=>m.id===station.id).activation.active,true,"saved/restored support preserves automatic threshold result");
});

test("Belobog auto-applies extra DEF at final Effect Hit Rate50 and not below it",async()=>{
  const {engine}=await loadProductionFixture();
  const attack={id:"round6-belobog-def-hit",type:"normal",attackType:"normal",element:"Physical",scalingStat:"def",multiplier:100,multipliers:[100],traceLevel:1};
  const at=(effectHitRate,inputs={})=>candidate(belobog,{characterId:"1001",ornamentId:"304",stats:{def:1000,effectHitRate},baseStats:{def:1000}},inputs);
  const below=at(49.99),threshold=at(50),above=at(50.01);
  assert.equal(below.activation.active,false);
  assert.equal(threshold.activation.active,true);
  assert.equal(above.value,15);
  assert.equal(threshold.automatic,true);
  const low=assertMatchesIndependent(engine,makeRequest(attack,1,{atk:1000,baseAtk:1000,def:1000,baseDef:1000},[below]),"Belobog at Effect Hit Rate49.99");
  const high=assertMatchesIndependent(engine,makeRequest(attack,1,{atk:1000,baseAtk:1000,def:1000,baseDef:1000},[threshold]),"Belobog at Effect Hit Rate50");
  assertClose(low.nonCrit,360,"DEF1000 normal damage baseline");
  assertClose(high.nonCrit,414,"DEF1000 + 150 DEF from Belobog");
  assert.equal(candidate(belobog,{characterId:"1001",ornamentId:"304",stats:{def:1000,effectHitRate:50},baseStats:{def:1000}},{[belobog.finalStatsInclusion.inputKey]:true}).enabled,false,"final DEF already contains the conditional set bonus");
  const includedResult=engine.calculate(makeRequest(attack,1,{atk:1000,baseAtk:1000,def:1150,baseDef:1000},[]));
  assertClose(includedResult.nonCrit,414,"pre-included final DEF is used once");
  assert.equal(candidate(belobog,{characterId:"1001",ornamentId:"",stats:{effectHitRate:80}}),undefined,"removing the set clears the candidate");
});

test("Fleet of the Ageless auto-checks the selected provider SPD and applies party ATK once",async()=>{
  const {data,engine}=await loadProductionFixture();
  assert.equal(fleet.activation.statSource,"effective","the wearer uses its effective SPD when it is the calculation target");
  const contextFor=speed=>({characterId:"1001",partyIds:["1002"],stats:{atk:3000},baseStats:{atk:1000},partyStats:{"1002":{speed}},partyEquipment:[{characterId:"1002",ornamentId:"302"}]});
  const below=candidate(fleet,contextFor(119.99)),threshold=candidate(fleet,contextFor(120));
  assert.equal(below.activation.active,false);
  assert.equal(threshold.activation.active,true);
  assert.equal(threshold.automatic,true);
  assert.equal(threshold.providerId,"1002");
  assert.equal(threshold.value,8);
  const normal={id:"round6-fleet-normal",type:"normal",attackType:"normal",element:"Physical",scalingStat:"atk",multiplier:100,multipliers:[100],traceLevel:1};
  const output=assertMatchesIndependent(engine,makeRequest(normal,1,{atk:3000,baseAtk:1000},[threshold]),"Fleet provider SPD120 party ATK+8");
  assertClose(output.nonCrit,1108.8,"3000 ATK + 80 party ATK, normal damage");
  const selfProviderContext={characterId:"1002",partyIds:["1001"],ornamentId:"302",stats:{speed:114},baseStats:{speed:100},partyEquipment:[{characterId:"1001",ornamentId:"323"}]};
  const partySpeed=data.structuredModifiers.find(m=>m.id==="ornament:323:2pc:party-speed-memosprite");
  const selfProvider=runtime.buildCandidates([fleet,partySpeed],selfProviderContext,{[partySpeed.activation.inputKey]:true}).find(m=>m.id===fleet.id);
  assert.equal(selfProvider.activation.active,true,"the selected wearer reaches SPD122 after party SPD support");
  assert.equal(selfProvider.thresholdReferenceValue,122);
  assert.equal(selfProvider.automatic,true);
  const unresolved=candidate(fleet,{...contextFor(NaN),partyStats:{"1002":{speed:NaN}}});
  assert.equal(unresolved.activation.unresolved,true,"an unknown provider SPD leaves only this ornament condition unresolved");
  assert.equal(unresolved.enabled,false);
  assertClose(assertMatchesIndependent(engine,makeRequest(normal,1,{atk:3000,baseAtk:1000},[unresolved]),"unknown provider SPD is locally excluded").nonCrit,1080,"unknown provider SPD leaves the attack baseline intact");
  const multiple=runtime.buildCandidates([fleet],{...contextFor(120),partyIds:["1002","1003"],partyStats:{"1002":{speed:120},"1003":{speed:125}},partyEquipment:[{characterId:"1002",ornamentId:"302"},{characterId:"1003",ornamentId:"302"}]},{}).find(m=>m.id===fleet.id);
  assert.equal(multiple.activation.unresolved,true,"multiple non-stacking Fleet providers are excluded locally");
  assert.equal(multiple.enabled,false);
  assertClose(assertMatchesIndependent(engine,makeRequest(normal,1,{atk:3000,baseAtk:1000},[multiple]),"multiple Fleet providers are locally excluded").nonCrit,1080,"multiple providers leave the attack baseline intact");
  assert.equal(candidate(fleet,{...contextFor(120),partyEquipment:[]}),undefined,"provider removal removes the candidate");
  const included=candidate(fleet,contextFor(120),{[fleet.finalStatsInclusion.inputKey]:true});
  assert.equal(included.enabled,false,"party ATK already included is not duplicated");
});

test("Broken Keel auto-checks provider Effect RES and scopes party CD to the selected member",async()=>{
  const {engine}=await loadProductionFixture();
  const contextFor=effectRes=>({characterId:"1001",partyIds:["1002"],partyStats:{"1002":{effectRes}},partyEquipment:[{characterId:"1002",ornamentId:"310"}]});
  const below=candidate(keel,contextFor(29.99)),threshold=candidate(keel,contextFor(30));
  assert.equal(below.activation.active,false);
  assert.equal(threshold.activation.active,true);
  assert.equal(threshold.automatic,true);
  assert.equal(threshold.providerId,"1002");
  const attack={id:"round6-keel-normal",type:"normal",attackType:"normal",element:"Physical",scalingStat:"atk",multiplier:100,multipliers:[100],traceLevel:1};
  const output=assertMatchesIndependent(engine,makeRequest(attack,1,{atk:3000,critRate:50,critDamage:100},[threshold]),"Keel provider Effect RES30 party CD+10");
  assertClose(output.nonCrit,1080,"party CD does not change nonCrit");
  assertClose(output.crit,2268,"party CD+10 crit");
  assertClose(output.expected,1674,"party CD+10 expected damage");
  assert.equal(candidate(keel,{...contextFor(30),partyEquipment:[]}),undefined,"provider removal removes party support");
  assert.equal(candidate(keel,contextFor(30),{[keel.finalStatsInclusion.inputKey]:true}).enabled,false,"party CD already included is not duplicated");
});

test("Penacony applies only to another party member with the provider's same element",async()=>{
  const {engine}=await loadProductionFixture();
  const contextFor=(characterElement,own=false)=>({characterId:"1001",characterElement,ornamentId:own?"312":"",partyIds:["1002"],partyElements:{"1002":"Fire"},partyEquipment:[{characterId:"1002",ornamentId:"312"}],stats:{atk:3000}});
  const matching=candidate(penacony,contextFor("Fire")),different=candidate(penacony,contextFor("Ice"));
  assert.equal(matching.activation.active,true);
  assert.equal(matching.providerId,"1002");
  assert.equal(matching.automatic,true);
  assert.equal(matching.target.excludeSelf,true);
  assert.equal(different.activation.active,false,"different element does not receive the bonus");
  assert.equal(candidate(penacony,{...contextFor("Fire",true),partyEquipment:[]}),undefined,"the wearer does not receive its own same-element ally bonus");
  const attack={id:"round6-penacony-normal",type:"normal",attackType:"normal",element:"Ice",scalingStat:"atk",multiplier:100,multipliers:[100],traceLevel:1};
  const output=assertMatchesIndependent(engine,makeRequest(attack,1,{atk:3000},[matching]),"Penacony same-element party damage+10");
  assertClose(output.nonCrit,1188,"same-element character receives +10% damage regardless of attack element");
  assert.equal(candidate(penacony,{...contextFor("Fire"),partyEquipment:[]}),undefined,"provider removal removes ally bonus");
  assert.equal(candidate(penacony,contextFor("Fire"),{[penacony.finalStatsInclusion.inputKey]:true}).enabled,false,"pre-included ally bonus is not doubled");
});

test("Lushaka checks party order and applies ATK only to the first-slot calculation target",async()=>{
  const {engine}=await loadProductionFixture();
  const contextFor=partyOrder=>({characterId:"1001",partyIds:["1002"],partyOrder,partyEquipment:[{characterId:"1002",ornamentId:"317"}],stats:{atk:3000},baseStats:{atk:1000}});
  const first=candidate(lushaka,contextFor(["1001","1002"]));
  const second=candidate(lushaka,contextFor(["1002","1001"]));
  assert.equal(first.activation.active,true);
  assert.equal(first.providerId,"1002");
  assert.equal(first.automatic,true);
  assert.equal(second.activation.active,false,"non-first-slot target receives nothing");
  assert.equal(candidate(lushaka,{...contextFor(["1001","1002"]),partyEquipment:[]}),undefined,"provider removal removes first-slot buff");
  assert.equal(candidate(lushaka,contextFor(["1001","1002"]),{[lushaka.finalStatsInclusion.inputKey]:true}).enabled,false,"first-slot ATK already included is not doubled");
  const attack={id:"round6-lushaka-normal",type:"normal",attackType:"normal",element:"Physical",scalingStat:"atk",multiplier:100,multipliers:[100],traceLevel:1};
  const output=assertMatchesIndependent(engine,makeRequest(attack,1,{atk:3000,baseAtk:1000},[first]),"Lushaka first-slot ATK+12");
  assertClose(output.nonCrit,1123.2,"3000 ATK + 120 first-slot ATK");
});

test("Forge of the Kalpagni Lantern lets the selected post-hit BE state affect Break only",async()=>{
  const {engine}=await loadProductionFixture();
  assert.equal(forge.activation.mode,"toggle","the one-turn post-hit state is explicitly selected");
  const context={characterId:"1001",ornamentId:"316",stats:{breakEffect:100},baseStats:{speed:100}};
  const off=candidate(forge,context),on=candidate(forge,context,{[forge.activation.inputKey]:true});
  assert.equal(off.enabled,false);
  assert.equal(on.enabled,true);
  assert.equal(on.automatic,false);
  assert.equal(on.value,40);
  assert.equal(on.providerId,null);
  const breakInput={character:{level:80,stats:{breakEffect:100}},enemy:{level:80,count:1,weakness:true,toughnessActive:true,maxToughness:60,resistance:20,defenseReduction:0,defenseIgnore:0},element:"Fire",breakBaseDamage:{80:3767.5533}};
  const normal={id:"round6-forge-normal",type:"normal",attackType:"normal",element:"Fire",scalingStat:"atk",multiplier:100,multipliers:[100],traceLevel:1};
  const base=engine.calculateBreak({...breakInput,modifiers:[off]});
  const boosted=engine.calculateBreak({...breakInput,modifiers:[on]});
  assert.equal(boosted.supported,true);
  // Independent: fixed level-80 break base × 2 base factor × (1 + BE140%) × 0.5 DEF × 0.8 RES.
  assertClose(boosted.value,3767.5533*2*(1+140/100)*0.5*0.8,"Break formula with final BE100+40");
  const directInput=makeRequest(normal,1,{atk:3000,critRate:50,critDamage:100},[on]);
  const direct=engine.calculate(directInput);
  assertClose(direct.nonCrit,1080,"BE state does not alter direct-hit damage");
  assert.ok(boosted.value>base.value,"only the Break calculation receives the selected BE state");
  assert.equal(candidate(forge,{...context,ornamentId:""},{[forge.activation.inputKey]:true}),undefined,"removing the set clears the state effect");
  assert.equal(candidate(forge,context,{[forge.activation.inputKey]:true,[forge.finalStatsInclusion.inputKey]:true}).enabled,false,"BE already present in final input is not doubled");
  const restored=JSON.parse(JSON.stringify({[forge.activation.inputKey]:true}));
  assertClose(engine.calculateBreak({...breakInput,modifiers:[candidate(forge,context,restored)]}).value,3767.5533*2*(1+140/100)*0.5*0.8,"saved/restored BE state");
});
