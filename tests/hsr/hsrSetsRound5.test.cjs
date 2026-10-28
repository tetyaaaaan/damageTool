"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {readJson,runtime,fixedSourceSha,loadProductionFixture,attackOf,makeRequest,assertClose,assertMatchesIndependent}=require("./helpers/hsrDirectVerification.cjs");
const records=readJson("games/hsr/data/calc/modifiers-sets-round5.json").modifiers;
const get=id=>records.find(item=>item.id===id);
const candidate=(record,context,inputs={})=>runtime.buildCandidates([record],context,inputs)[0];
const poet=get("relic:124:4pc:precombat-crit-rate");
const diviner=get("relic:130:4pc:precombat-crit-rate");
const divinerElation=get("relic:130:4pc:party-elation-first-skill");
const talia=get("ornament:307:2pc:break-effect-effective-speed");
const fleetSpeed=get("ornament:323:2pc:party-speed-memosprite");

for(const item of records)test("round5 record "+item.id+" is pinned, calculable and four/two-piece gated",()=>{
  assert.equal(item.provenance.sourceCommit,fixedSourceSha);
  assert.equal(item.support.status,"calculable");
  assert.ok([2,4].includes(item.source.setPieces));
});

test("production loader registers the new conditional effects once and leaves permanent 2pc stats in final inputs",async()=>{
  const {data}=await loadProductionFixture();
  for(const item of records)assert.equal(data.structuredModifiers.filter(m=>m.id===item.id).length,1,item.id+" loaded exactly once");
  for(const sourceId of ["307","124","130","313","318","322","323"]){
    const idsForSource=records.filter(m=>m.source.id===sourceId);
    assert.ok(idsForSource.length>0,sourceId+" has no new record");
  }
  for(const [id,stat] of [["307","breakEffect"],["124","speed"],["130","speed"],["313","critRate"],["318","critDamage"],["322","atk"],["323","critRate"]])
    assert.equal(records.some(m=>m.source.id===id&&m.stat===stat&&m.activation.mode==="always"),false,id+" permanent stat remains in final input");
  assert.equal(poet.activation.inputKey,"pre-combat-speed");
  assert.equal(diviner.activation.inputKey,"pre-combat-speed");
  assert.equal(poet.activation.reference,"self.preCombatSpeed");
  assert.equal(diviner.activation.reference,"self.preCombatSpeed");
  assert.equal(poet.activation.strictInput,true);
  assert.equal(diviner.activation.strictInput,true);
  assert.equal(poet.activation.default,undefined,"missing entry SPD is not guessed");
});

test("Talia reads one-pass effective SPD after party support, then its Break Effect bonus reaches Break damage",async()=>{
  const {engine}=await loadProductionFixture();
  assert.equal(talia.activation.statSource,"effective");
  const context={characterId:"1001",partyIds:["1002"],ornamentId:"307",stats:{speed:137,breakEffect:100},baseStats:{speed:100},partyEquipment:[{characterId:"1002",ornamentId:"323"}]};
  const off=runtime.buildCandidates([talia,fleetSpeed],context,{});
  const offTalia=off.find(x=>x.id===talia.id);
  assert.equal(offTalia.enabled,false,"137 SPD is below Talia 145 without support");
  const active=runtime.buildCandidates([talia,fleetSpeed],context,{[fleetSpeed.activation.inputKey]:true});
  const support=active.find(x=>x.id===fleetSpeed.id),taliaCandidate=active.find(x=>x.id===talia.id);
  assert.equal(support.providerId,"1002");
  assert.equal(support.value,8);
  assert.equal(taliaCandidate.enabled,true);
  assert.equal(taliaCandidate.thresholdReferenceValue,145,"the +8% party support contributes 8 SPD from 100 base");
  assert.equal(taliaCandidate.value,20);
  assert.equal(taliaCandidate.automatic,true);
  assert.equal(runtime.applicableToAttack(taliaCandidate,{type:"break",element:"Fire"}),true);
  const withoutProvider=candidate(talia,{...context,stats:{...context.stats,speed:137},partyEquipment:[]},{[fleetSpeed.activation.inputKey]:true});
  assert.equal(withoutProvider.enabled,false,"removing the only party provider removes its speed contribution");
  assert.equal(withoutProvider.thresholdReferenceValue,137);

  const input={character:{level:80,stats:{breakEffect:100}},enemy:{level:80,count:1,weakness:true,toughnessActive:true,maxToughness:60,resistance:20,defenseReduction:0,defenseIgnore:0},element:"Fire",breakBaseDamage:{80:3767.5533},modifiers:[taliaCandidate]};
  const actual=engine.calculateBreak(input);
  const expected=3767.5533*2*(1+120/100)*0.5*0.8*1;
  assert.equal(actual.supported,true);
  assertClose(actual.value,6630.893808, "Talia BE+20 Break fixed independent result");
  assertClose(actual.value,expected,"Talia Break independent formula uses final BE100+20");
  const included=candidate(talia,context,{[talia.finalStatsInclusion.inputKey]:true,[fleetSpeed.activation.inputKey]:true});
  assert.equal(included.enabled,false,"an additional BE20 already represented in final input is not doubled");
});

test("Poet uses required precombat SPD, exact below-threshold tiers, and ignores battle SPD supports",async()=>{
  const {data,engine}=await loadProductionFixture();
  const partySpeed=fleetSpeed;
  const context={characterId:"1001",relicIds:["124"],relicMode:4,partyIds:["1002"],stats:{speed:999},baseStats:{speed:100},partyEquipment:[{characterId:"1002",ornamentId:"323"}]};
  const at=(value,state=true)=>runtime.buildCandidates([poet,partySpeed],context,{"pre-combat-speed":value,[partySpeed.activation.inputKey]:state});
  const missing=runtime.buildCandidates([poet],context,{})[0];
  assert.equal(missing.enabled,false,"no combat-speed value is assumed to be the precombat value");
  assert.equal(missing.activation.inputValue===undefined||Number.isNaN(missing.activation.inputValue),true);
  assert.equal(at(94.99).find(x=>x.id===poet.id).value,32);
  assert.equal(at(95).find(x=>x.id===poet.id).value,20);
  assert.equal(at(109.99).find(x=>x.id===poet.id).value,20);
  assert.equal(at(110).find(x=>x.id===poet.id).enabled,false);
  const supporterState=at(94.99,true);
  assert.equal(supporterState.find(x=>x.id===partySpeed.id).enabled,true);
  assert.equal(supporterState.find(x=>x.id===poet.id).value,32,"the separate input threshold ignores active party speed");
  const candidateAt32=supporterState.find(x=>x.id===poet.id);
  assert.equal(runtime.applicableToAttack(candidateAt32,{type:"memospriteSkill",element:"Quantum"}),true,"the CRIT Rate also affects the wearer's memory spirit");
  assert.equal(candidate(poet,{...context,relicMode:2},{"pre-combat-speed":94.99}),undefined,"4pc required");
  const normal={id:"round5-poet-normal",type:"normal",attackType:"normal",element:"Quantum",scalingStat:"atk",multiplier:100,multipliers:[100],traceLevel:1};
  const damage=assertMatchesIndependent(engine,makeRequest(normal,1,{atk:3000,critRate:50,critDamage:100},[candidateAt32]),"Poet precombat SPD<95 CRIT Rate +32");
  assertClose(damage.nonCrit,1080,"Poet bonus does not alter nonCrit");
  assertClose(damage.crit,2160,"Poet crit result");
  assertClose(damage.expected,1965.6,"Poet +32 CR rate expectation");
  const included=candidate(poet,context,{"pre-combat-speed":94.99,[poet.finalStatsInclusion.inputKey]:true});
  assert.equal(included.enabled,false,"already included conditional CR is not added twice");
});

test("Diviner uses the same explicit precombat speed input for 120/160 CR tiers and separately selects first Elation skill support",async()=>{
  const {data,engine}=await loadProductionFixture();
  const context={characterId:"1001",relicIds:["130"],relicMode:4,stats:{speed:999},baseStats:{speed:100},partyIds:["1002"],partyEquipment:[{characterId:"1002",ornamentId:"323"}]};
  const evaluate=(speed,party=true)=>runtime.buildCandidates([diviner,fleetSpeed],context,{"pre-combat-speed":speed,[fleetSpeed.activation.inputKey]:party});
  assert.equal(evaluate(119.99).find(x=>x.id===diviner.id).enabled,false);
  assert.equal(evaluate(120).find(x=>x.id===diviner.id).value,10);
  assert.equal(evaluate(159.99).find(x=>x.id===diviner.id).value,10);
  assert.equal(evaluate(160).find(x=>x.id===diviner.id).value,18);
  const split=evaluate(119.99,true);
  assert.equal(split.find(x=>x.id===fleetSpeed.id).enabled,true);
  assert.equal(split.find(x=>x.id===diviner.id).enabled,false,"in-battle SPD does not satisfy a precombat condition");
  const supportContext={characterId:"1502",partyIds:["1001"],partyEquipment:[{characterId:"1001",relicIds:["130"],relicMode:4}]};
  const off=candidate(divinerElation,supportContext);
  const active=candidate(divinerElation,supportContext,{[divinerElation.activation.inputKey]:true});
  assert.equal(off.enabled,false);
  assert.equal(active.enabled,true);
  assert.equal(active.value,10);
  assert.equal(active.providerId,"1001");
  assert.equal(active.target.owner,"partyAll");
  assert.equal(runtime.applicableToAttack(active,{type:"elation",element:"Physical"}),true);
  assert.equal(runtime.applicableToAttack(active,{type:"normal",element:"Physical"}),false);
  assert.equal(candidate(divinerElation,{...supportContext,partyEquipment:[]},{[divinerElation.activation.inputKey]:true}),undefined);
  const attack=attackOf(data,"150220");
  const input=makeRequest(attack,10,{atk:3000,critRate:50,critDamage:100},[active]);
  input.character.stats.elation=50;
  input.elation={context:"firstAhaInstant",punchline:20,merrymake:0};
  const result=engine.calculate(input);
  const expected=7535.107*2*(1+60/100)*(1+5*20/(20+240))*0.5*0.8*0.9*1.16;
  assert.equal(typeof result.nonCrit,"number","Elation attack is calculated");
  assertClose(result.nonCrit,13942.127334793844,"Diviner party Elation+10 literal independent result");
  assertClose(result.nonCrit,expected,"Diviner Elation formula: level base × multiplier × Elation × punchline × DEF/RES/toughness/vulnerability");
  const included=candidate(divinerElation,supportContext,{[divinerElation.activation.inputKey]:true,[divinerElation.finalStatsInclusion.inputKey]:true});
  assert.equal(included.enabled,false,"already-included party Elation is not doubled");
  assert.equal(JSON.parse(JSON.stringify({[divinerElation.activation.inputKey]:true}))[divinerElation.activation.inputKey],true,"first-Elation state can be saved/restored");
});

test("Tugan kill stacks, Banan summons, effective ATK DoT tier, and Omphalos party SPD feed only their declared effects",async()=>{
  const {data,engine}=await loadProductionFixture();
  const tugan=get("ornament:313:2pc:enemy-defeated-crit-damage"),banana=get("ornament:318:2pc:summon-field-crit-damage"),sea=get("ornament:322:2pc:atk-threshold-dot-damage"),omphalos=fleetSpeed;
  const normal={id:"round5-stack-normal",type:"normal",attackType:"normal",element:"Fire",scalingStat:"atk",multiplier:100,multipliers:[100],traceLevel:1};
  const tctx={characterId:"1001",ornamentId:"313"};
  const t0=candidate(tugan,tctx,{}),t5=candidate(tugan,tctx,{[tugan.activation.inputKey]:5}),t10=candidate(tugan,tctx,{[tugan.activation.inputKey]:10}),t11=candidate(tugan,tctx,{[tugan.activation.inputKey]:11});
  assert.equal(t0.value,0);assert.equal(t5.value,20);assert.equal(t10.value,40);assert.equal(t11.value,40,"stacks are capped at ten");
  const tg=assertMatchesIndependent(engine,makeRequest(normal,1,{atk:3000,critRate:50,critDamage:100},[t10]),"Tugan 10 kill stacks CRIT DMG +40");
  assertClose(tg.nonCrit,1080,"Tugan does not alter nonCrit");assertClose(tg.crit,2592,"Tugan +40 CD crit");assertClose(tg.expected,1836,"Tugan +40 CD expected");
  assert.equal(candidate(tugan,{...tctx,ornamentId:""},{[tugan.activation.inputKey]:10}),undefined,"equipment removal clears stacks");

  const bctx={characterId:"1001",ornamentId:"318"},boff=candidate(banana,bctx),bon=candidate(banana,bctx,{[banana.activation.inputKey]:true});
  assert.equal(boff.enabled,false);assert.equal(bon.value,32);assert.equal(bon.automatic,false);
  const bd=assertMatchesIndependent(engine,makeRequest(normal,1,{atk:3000,critRate:50,critDamage:100},[bon]),"Banan summon-field CRIT DMG +32");
  assertClose(bd.nonCrit,1080,"Banan CD does not alter nonCrit");assertClose(bd.crit,2505.6,"Banan +32 CD crit");assertClose(bd.expected,1792.8,"Banan +32 CD expected");
  assert.equal(candidate(banana,{...bctx,ornamentId:""},{[banana.activation.inputKey]:true}),undefined,"summon set removal clears condition");
  assert.equal(candidate(banana,bctx,{[banana.activation.inputKey]:true,[banana.finalStatsInclusion.inputKey]:true}).enabled,false,"permanent CD16 and active CD32 aren't duplicated when the active part is entered");

  const dot={id:"round5-sea-dot",type:"dot",attackType:"dot",element:"Fire",scalingStat:"atk",multiplier:100,multipliers:[100],traceLevel:1,canCrit:false};
  const sctx=atk=>({characterId:"1001",ornamentId:"322",stats:{atk},baseStats:{atk:1000}});
  const s2399=candidate(sea,sctx(2399.99)),s2400=candidate(sea,sctx(2400)),s3600=candidate(sea,sctx(3600));
  assert.equal(s2399.activation.active,false);assert.equal(s2399.value,0);assert.equal(s2400.value,12);assert.equal(s3600.value,24);
  assert.equal(sea.activation.statSource,"effective","independent ATK support can satisfy the condition in one pass");
  const low=assertMatchesIndependent(engine,makeRequest(dot,1,{atk:2400,baseAtk:1000,toughnessActive:true},[s2400]),"Sea ATK2400 DoT +12");
  const high=assertMatchesIndependent(engine,makeRequest(dot,1,{atk:3600,baseAtk:1000,toughnessActive:true},[s3600]),"Sea ATK3600 DoT +24");
  assertClose(low.nonCrit,967.68,"Sea 2400 ATK literal DoT");assertClose(high.nonCrit,1607.04,"Sea 3600 ATK literal DoT");
  assert.equal(runtime.applicableToAttack(s2400,dot),true);assert.equal(runtime.applicableToAttack(s2400,normal),false,"DoT bonus never leaks to direct hits");

  const lc20020=data.structuredModifiers.find(item=>item.id==="lightCone:20020:ultimate-atk");
  assert.ok(lc20020,"registered light cone ATK support is available");
  const lcContext={characterId:"1001",ornamentId:"322",lightConeId:"20020",refinement:1,stats:{atk:2390},baseStats:{atk:1000}};
  const lcInputs={[lc20020.activation.inputKey]:true};
  const boosted=runtime.buildCandidates([sea,lc20020],lcContext,lcInputs);
  const boostedSea=boosted.find(item=>item.id===sea.id),boost=boosted.find(item=>item.id===lc20020.id);
  assert.equal(boost.value,24);assert.equal(boost.enabled,true);
  assert.equal(boostedSea.activation.active,true,"R1 independent +24% ATK raises effective ATK from 2390 to 2630");
  assert.equal(boostedSea.value,12);
  const boostedResult=assertMatchesIndependent(engine,makeRequest(dot,1,{atk:2390,baseAtk:1000,toughnessActive:true},boosted),"Sea threshold crossed by LC20020 R1 ATK support");
  assertClose(boostedResult.nonCrit,1060.416,"2390 final ATK + 240 support, DoT+12%");
  const highContext={...lcContext,stats:{atk:3590}};
  const highCross=runtime.buildCandidates([sea,lc20020],highContext,lcInputs);
  assert.equal(highCross.find(item=>item.id===sea.id).activation.active,true,"R1 ATK support raises 3590 to effective ATK 3830");
  assert.equal(highCross.find(item=>item.id===sea.id).value,24,"support crosses the higher 3600 threshold");
  const highCrossResult=assertMatchesIndependent(engine,makeRequest(dot,1,{atk:3590,baseAtk:1000,toughnessActive:true},highCross),"Sea 3600 threshold crossed by LC20020 R1 ATK support");
  assertClose(highCrossResult.nonCrit,1709.712,"3590 final ATK + 240 support, DoT+24%");
  const highOff=runtime.buildCandidates([sea,lc20020],highContext,{[lc20020.activation.inputKey]:false});
  assert.equal(highOff.find(item=>item.id===sea.id).value,12,"support OFF retains only the 2400 threshold tier");
  const turnedOff=runtime.buildCandidates([sea,lc20020],lcContext,{[lc20020.activation.inputKey]:false});
  const offSea=turnedOff.find(item=>item.id===sea.id);
  assert.equal(offSea.activation.active,false,"turning the support off drops effective ATK below 2400");
  assert.equal(offSea.value,0);
  const includedSupport=runtime.buildCandidates([sea,lc20020],{...lcContext,stats:{atk:2630}},{...lcInputs,[lc20020.finalStatsInclusion.inputKey]:true});
  assert.equal(includedSupport.find(item=>item.id===lc20020.id).enabled,false,"ATK already included in final ATK is not added again");
  assert.equal(includedSupport.find(item=>item.id===sea.id).activation.active,true,"the supplied final ATK itself still satisfies the condition");
  assert.equal(includedSupport.find(item=>item.id===sea.id).value,12);
  const includedSea=runtime.buildCandidates([sea,lc20020],{...lcContext,stats:{atk:2630}},{...lcInputs,[sea.finalStatsInclusion.inputKey]:true});
  assert.equal(includedSea.find(item=>item.id===sea.id).enabled,false,"already-included DoT condition bonus is not applied twice");
  const restoredState=JSON.parse(JSON.stringify(lcInputs));
  assert.equal(runtime.buildCandidates([sea,lc20020],lcContext,restoredState).find(item=>item.id===sea.id).value,12,"saved/restored LC support preserves the resulting threshold");

  const providerCtx={characterId:"1001",partyIds:["1002"],partyEquipment:[{characterId:"1002",ornamentId:"323"}]};
  const spdOff=candidate(omphalos,providerCtx),spdOn=candidate(omphalos,providerCtx,{[omphalos.activation.inputKey]:true});
  assert.equal(spdOff.enabled,false);assert.equal(spdOn.providerId,"1002");assert.equal(spdOn.value,8);assert.equal(spdOn.target.owner,"partyAll");
  assert.equal(candidate(omphalos,{...providerCtx,partyEquipment:[]},{[omphalos.activation.inputKey]:true}),undefined,"provider removal clears party speed");
  const selfSpeed=candidate(omphalos,{characterId:"1001",ornamentId:"323"},{[omphalos.activation.inputKey]:true});assert.equal(selfSpeed.enabled,true,"the wearer is part of the whole party");
  assert.equal(runtime.applicableToAttack(spdOn,{type:"memospriteSkill",element:"Ice"}),true);
  const included=candidate(omphalos,providerCtx,{[omphalos.activation.inputKey]:true,[omphalos.finalStatsInclusion.inputKey]:true});assert.equal(included.enabled,false);
  assert.equal(JSON.parse(JSON.stringify({[tugan.activation.inputKey]:7,[banana.activation.inputKey]:true,[omphalos.activation.inputKey]:true}))[tugan.activation.inputKey],7);
});
