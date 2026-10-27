"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { fixedSourceSha, loadProductionFixture, attackOf, makeRequest, runtime, independentDirectDamage, assertClose } = require("./helpers/hsrDirectVerification.cjs");

// Literal transcriptions from fixed JP/EN source, never read from the generated catalog:
// https://raw.githubusercontent.com/Mar-7th/StarRailRes/dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487/index_new/en/character_skills.json
// 150702 params[0]+4*params[2]; param[3] is HP COST, not a damage multiplier.
// 150704 explicitly classifies its extra Skill as Follow-Up ATK and uses Skill level.
// 150703 has no hit. Its completed CR/CD state precedes the later separate attacks.
// Trees1507001..4 set E0 maxima6/10/10/10;1507103 has50%+party-dependent75%.
// Ranks150701..706 are not used at E0. Blank150709 is not a sixth independent attack.
const basic = [25,30,35,40,45,50];
const enhanced = [50,60,70,80,90,100];
const skillAoe = [36,39.6,43.2,46.8,50.4,54,58.5,63,67.5,72];
const skillBounce = [12,13.2,14.4,15.6,16.8,18,19.5,21,22.5,24];
const ultimate = [210,224,238,252,266,280,297.5,315,332.5,350];
const defense = [20,21,22,23,24,25,26.25,27.5,28.75,30];
const taken = [30,32,34,36,38,40,42.5,45,47.5,50];
const specs = {
 "150701": { source:"150701", type:"normal", key:"normal", values:basic },
 "150708": { source:"150708", type:"enhancedNormal", key:"normal", values:enhanced },
 "150702": { source:"150702", type:"skill", key:"skill", values:skillAoe.map((x,i)=>x+4*skillBounce[i]) },
 "150714": { source:"150714", type:"ultimate", key:"ultimate", values:ultimate },
 "1507041": { source:"150702", type:"followUp", key:"skill", values:skillAoe.map((x,i)=>x+4*skillBounce[i]) }
};
const profiles = [
 {atk:3157.25,hp:11873.5,def:1743.75,baseAtk:917.25,baseHp:1813.75,baseDef:731.25,critRate:43.75,critDamage:173.25,damageBonus:31.5,enemyLevel:87,resistance:26.25,resistancePenetration:9.5,defenseReduction:13.25,defenseIgnore:7.75,takenDamage:12.5,toughnessActive:true},
 {atk:5771.75,hp:8429.5,def:3273.25,baseAtk:1273.5,baseHp:1807.25,baseDef:1029.75,critRate:81.25,critDamage:107.75,damageBonus:62.25,enemyLevel:95,resistance:8.75,resistancePenetration:13.5,defenseReduction:24.75,defenseIgnore:6.25,takenDamage:18.75,toughnessActive:false}
];
function mods(data, attack, inputs={}, nativeLevel=10, party=false, variant="enhanced") {
 const records = party ? data.structuredModifiers : data.structuredModifiers.filter(m=>m.source?.id==="1507");
 return runtime.buildCandidates(records, {
  characterId:"1507",eidolon:0,enhancementState:variant,partyIds:party?["1309"]:[],
  partyEidolons:{"1309":0},traceLevelFor:source=>source.id==="1309"?10:source.skillId==="150703"?nativeLevel:1
 },inputs).map(m=>({...m,applicable:m.applicable!==false&&runtime.applicableToAttack(m,{...attack,attackType:attack.type})}));
}
function literal(category,value){return {category,value,enabled:true,applicable:true};}
function verify(engine,input,coefficient,literals,label){
 const actual=engine.calculate(input);
 const expected=independentDirectDamage({...input,attack:{scalingStat:"hp",multiplier:coefficient,canCrit:true},modifiers:literals});
 assert.notEqual(actual.supported,false,label+": "+actual.reason);
 for(const key of ["nonCrit","crit","expected"])assertClose(actual[key],expected[key],label+" "+key);
 assertClose(actual.breakdown.referenceValue,expected.effectiveReferenceValue,label+" HP");
 assertClose(actual.breakdown.damageBonus,expected.damageBonus,label+" damageBonus");
 assertClose(actual.breakdown.defense,expected.defense,label+" defense");
 return actual;
}
test("batch6 Mortenax Blade all five E0 events use literal complete enemy-one HP coefficients",async()=>{
 const {data,engine}=await loadProductionFixture();
 assert.equal(fixedSourceSha,"dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
 for(const [id,spec] of Object.entries(specs)){
  const attack=attackOf(data,id);
  assert.equal(attack.characterId,"1507");assert.equal(attack.sourceSkillId,spec.source);
  assert.equal(attack.type,spec.type);assert.equal(attack.traceKey,spec.key);assert.equal(attack.element,"Fire");
  assert.equal(attack.scalingStat,"hp");assert.equal(attack.damageFormula,"statMultiplier");
  assert.equal(attack.hitCount,1,"stored multiplier already sums all five Skill hits");
  assert.equal(attack.maximumEidolon,0);assert.equal(attack.characterLevelExact,80);assert.equal(attack.enemyCountExact,1);
  assert.equal(attack.maximumTraceLevel,spec.values.length);assert.equal(attack.support.status,"calculable");
  assert.equal(attack.provenance.sourceCommit,fixedSourceSha);
  assert.equal(attack.provenance.verification,"tests/hsr/hsrBatch6Blade.test.cjs");
  if(spec.source==="150702"){
   assert.equal(attack.requiredCurrentHpAbove1,undefined,"availability alone is not a damage input");
   assert.equal(attack.requiresLivingHpSnapshot,undefined);
   assert.match(attack.hitCountLabel,/5/);
  }
  for(let level=1;level<=spec.values.length;level++)for(const profile of profiles){
   assertClose(attack.multipliers[level-1],spec.values[level-1],id+" literalLv"+level);
   const request=makeRequest(attack,level,profile,mods(data,attack));
   request.character.stats.hpPercent=50;
   const baseline=verify(engine,request,spec.values[level-1],[],id+" Lv"+level);
   for(const stat of ["atk","hp","def"]){
    const changed=structuredClone(request);changed.character.stats[stat]+=1349.75;
    const actual=verify(engine,changed,spec.values[level-1],[],id+" isolated"+stat);
    assertClose(actual.nonCrit/baseline.nonCrit,stat==="hp"?changed.character.stats.hp/profile.hp:1,id+" reference isolation");
   }
   const changed=structuredClone(request);changed.character.baseStats={atk:54321.75,hp:65432.5,def:76543.25};
   for(const key of ["nonCrit","crit","expected"])assertClose(engine.calculate(changed)[key],baseline[key],id+" permanent trace not added twice");
   const current=structuredClone(request);current.character.stats.hpPercent=17.5;
   assertClose(engine.calculate(current).expected,baseline.expected,id+" consumes maximum HP, not current HP");
  }
 }
 assert.equal(attackOf(data,"1507041").triggerSkillId,"150704");
 assert.equal(data.attacks.some(a=>a.characterId==="1507"&&a.id==="150703"),false,"transform has no separate hit");
});
test("batch6 Mortenax native zone, Nihility branches and Balefire use separate source levels once",async()=>{
 const {data,engine}=await loadProductionFixture();
 for(const [id,spec] of Object.entries(specs))for(let level=1;level<=spec.values.length;level++)for(let nativeLevel=1;nativeLevel<=10;nativeLevel++){
  for(const zone of [false,true])for(const other of [false,true])for(const debuff of [false,true]){
   const attack=attackOf(data,id),inputs={
    "mortenax-infinite-fury-active":zone,"mortenax-no-other-nihility":!other,
    "mortenax-other-nihility":other,"mortenax-balefire-active":debuff};
   const candidates=mods(data,attack,inputs,nativeLevel);
   assert.equal(candidates.some(m=>m.source?.kind==="eidolon"),false);
   const extra=zone?(50+(!other||spec.type==="ultimate"?75:0)):0;
   const literalMods=[literal("damageBonus",extra),literal("defenseReduction",debuff?defense[nativeLevel-1]:0),literal("takenDamage",debuff?taken[nativeLevel-1]:0),...(zone&&id!=="150701"?[literal("critRate",20),literal("critDamage",[30,33,36,39,42,45,48.75,52.5,56.25,60][nativeLevel-1])]:[])];
   for(const profile of profiles){
    const request=makeRequest(attack,level,profile,candidates);request.character.stats.hpPercent=50;
    verify(engine,request,spec.values[level-1],literalMods,id+"/Lv"+level+"/Ult"+nativeLevel+"/"+zone+"/"+other+"/"+debuff);
   }
  }
 }
});
test("batch6 Mortenax conditional transform CR/CD and external ATK/FUA/Skill buffs remain scoped",async()=>{
 const {data,engine}=await loadProductionFixture();
 const cd=[30,33,36,39,42,45,48.75,52.5,56.25,60];
 for(const [id,spec] of Object.entries(specs)){
  const attack=attackOf(data,id),level=spec.values.length;
  for(let nativeLevel=1;nativeLevel<=10;nativeLevel++){
   const profile={...profiles[0]};
   const inputs={"mortenax-infinite-fury-active":true,"mortenax-other-nihility":true,"mortenax-crit-already-in-final":true,"robin-skill-damage-active":true};
   const candidates=mods(data,attack,inputs,nativeLevel,true);
   const rate=candidates.find(m=>m.id==="trace:1507:150703:fury-critRate");assert.ok(rate);assert.equal(rate.applicable,id!=="150701","Fury crit does not leak into ordinary basic");
   const request=makeRequest(attack,level,profile,candidates);request.character.stats.hpPercent=50;
   // Robin Skill level10 is50%; verify the external source separately below when selected.
   const robin=candidates.filter(m=>m.source?.id==="1309"&&m.enabled&&m.applicable&&m.calculable);
   assert.equal(robin.length,1);assert.equal(robin[0].id,"trace:1309:130902:party-damage");assertClose(robin[0].value,50,"literal Robin Skill Lv10");
   const literalMods=[literal("damageBonus",100+(spec.type==="ultimate"?75:0)),...(id!=="150701"?[literal("critRate",20),literal("critDamage",cd[nativeLevel-1])]:[])];
   const baseline=verify(engine,request,spec.values[level-1],literalMods,id+" final transformLv"+nativeLevel);
   const externalAtk={id:"external-atk",category:"statPercent",stat:"atk",value:150,enabled:true,applicable:true,calculable:true};
   const atkRequest={...request,modifiers:[...candidates,externalAtk]};
   assertClose(engine.calculate(atkRequest).expected,baseline.expected,id+" external ATK is inert");
   for(const type of ["followUp","skill"]){
    const buff={id:"external-"+type,category:"damageBonus",value:37.5,target:{owner:"self",attackTypes:[type],elements:[]},enabled:true,applicable:true,calculable:true};
    const input={...request,modifiers:[...candidates,buff]};
    const scoped=spec.type===type?37.5:0;
    verify(engine,input,spec.values[level-1],[...literalMods,literal("damageBonus",scoped)],id+" "+type+" boundary");
   }
   const variants=["previous","enhanced"].map(variant=>makeRequest(attack,level,profile,mods(data,attack,inputs,nativeLevel,false,variant)));
   assertClose(engine.calculate(variants[0]).expected,engine.calculate(variants[1]).expected,"1507 is a distinct character, not 1205 enhancement switch");
  }
 }
});
test("batch6 Mortenax native missing Ultimate level affects only enabled Balefire and preserves FUA source",async()=>{
 const {data}=await loadProductionFixture();
 const fua=attackOf(data,"1507041"),skill=attackOf(data,"150702");
 for(const nativeLevel of [NaN,0,11,1.5]){
  const off=mods(data,fua,{},nativeLevel);
  assert.equal(off.some(m=>m.enabled&&m.inputWarnings?.length),false,"OFF debuff needs no Ultimate level");
  const on=mods(data,fua,{"mortenax-balefire-active":true},nativeLevel);
  for(const suffix of ["balefire-defense","balefire-taken"]){
   const candidate=on.find(m=>m.id.endsWith(suffix));
   assert.ok(candidate.enabled);assert.ok(candidate.inputWarnings.length,"enabled native invalid level reported locally");
  }
 }
 assert.equal(fua.sourceSkillId,skill.sourceSkillId);
 assert.equal(fua.traceKey,"skill");assert.equal(fua.type,"followUp");
 assert.notEqual(fua.type,skill.type);
});
