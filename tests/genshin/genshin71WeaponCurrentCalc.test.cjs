"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),test=require("node:test");
const {createScenarioHarness,prepareScenarioInputs,setElement}=require("./helpers/calcScenarioHarness.cjs");
const root=path.resolve(__dirname,"../..");
const candidate=require("../../games/genshin/data/v2/version-transitions/7.0-to-7.1/weapons-currentcalc-batch1.json");
const inventory=require("../../games/genshin/data/v2/version-transitions/7.0-to-7.1/sources/vesna-currentcalc/inventory-selected-records.json");
const base=require("../../games/genshin/data/base-stats.json");
function fixture(id="11522",refinement=1){
 const f=createScenarioHarness(),box={window:{},console};vm.createContext(box);
 for(const name of ["genshinDataContract","genshinCalcData"])vm.runInContext(fs.readFileSync(path.join(root,"games/js",name+".js"),"utf8"),box);
 box.window.GenshinCalcData.applyProvisional70Data(f.calcData,[require("../../games/genshin/data/v2/candidates/7.0-provisional-stellar-swirl.json")]);
 box.window.GenshinCalcData.applyProvisional71Data(f.calcData,[candidate]);
 prepareScenarioInputs(f.elements,{characterId:"10000003",weaponId:id,stats:{atk:2000,baseAtk:1000,elementalMastery:0,critRate:50,critDamage:100,elementDamageBonus:0}});
 f.engine=f.sandbox.GenshinCalcEngine;f.conditions=f.sandbox.GenshinCalcConditions;
 f.request=f.engine.buildCalculationRequestFromForm();f.request.refinement=refinement;
 f.conditions.conditionPanelState(f.request,f.calcData);
 f.calc=()=>f.engine.calculateDamageRequest(f.request,f.calcData);return f;
}
function state(f,kind,value){
 const id=`provisional71_w${f.request.weaponId}_${kind}`;
 const defs=f.conditions.buildConditionDefinitions(f.request,f.calcData);
 const definition=defs.find(d=>d.modifier.id===id);assert.ok(definition,"UI definition for "+id);
 if(kind==="mist"){
  const panel=f.conditions.conditionPanelState(f.request,f.calcData);
  const input=panel.complexConditionInputs.find(d=>d.conditionGroupId===id+"_state");assert.ok(input);
  f.request.uiState.complexConditionByModifier[input.key]={stack:value};
 }else {
  const panel=f.conditions.conditionPanelState(f.request,f.calcData);
  const input=panel.complexConditionInputs.find(d=>d.conditionGroupId===id+"_state");assert.ok(input);
  f.request.uiState.complexConditionByModifier[input.key]={option:value?"active":"inactive"};
 }
 f.conditions.conditionPanelState(f.request,f.calcData);
}
function near(a,b){assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);}
function replay(f,p){const again=f.engine.calculateDamageRequest(JSON.parse(JSON.stringify(p.calculationRequest)),f.calcData);assert.deepEqual(JSON.parse(JSON.stringify(again.results)),JSON.parse(JSON.stringify(p.results)));}
function probe(f,p,reaction,element="風"){
 const entry={id:"controlled",element,attackType:"skill",damageType:"skill",group:"skill",levelSource:"skill",directReactionId:reaction,scalings:[{stat:"atk",valuesByLevel:{10:100}}],hitCount:1};
 const mods=f.engine.applyModifiersToDamageEntry(entry,p.context,f.engine.collectActiveModifiers(f.calcData,p.context));return {mods:mods.totals,result:f.engine.calculateDamage(entry,p.context,mods)};
}
test("7.1 inventory is version-bound and batch1 retains exact R1-R5 source values",()=>{
 assert.deepEqual(inventory.datasets.weapons.records.map(w=>String(w.id)).sort(),["11437","11438","11522","14437","14524","15437"]);
 for(const [id,definition] of Object.entries(candidate.weapons)){
  const raw=inventory.datasets.weapons.records.find(w=>String(w.id)===id);assert.equal(raw.version,"7.1");assert.equal(definition.nameJa,raw.name);assert.equal(definition.rarity,raw.rarity);assert.equal(definition.weaponType,raw.weaponText);
  for(const m of candidate.weaponModifiers[id].modifiers)for(let r=1;r<=5;r++){const index=m.id.endsWith("rebellion")?1:0;near((m.valueByRefinement||m.valueByRefinementPerStack)[r],parseFloat(raw["r"+r].values[index]));}
 }
});
test("batch1 reuses exact standard growth at Lv1-90 and both ascension sides; substat keeps precision",async()=>{
 const box={console,document:{readyState:"loading",addEventListener(){},getElementById(){return null}},fetch:async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,String(url)),"utf8"))})};box.window=box;vm.createContext(box);vm.runInContext(fs.readFileSync(path.join(root,"games/js/genshinBaseStats.js"),"utf8"),box);await box.GenshinBaseStats.ready;
 for(const [id,s] of Object.entries(candidate.baseStats.weapons)){
  const raw=inventory.datasets.weapons.records.find(w=>String(w.id)===id),ref=s.growthReferenceWeaponId;
  assert.equal(s.baseProps[4],raw.baseAtkValue);assert.equal(s.baseProps[s.secondaryPropId]*100,parseFloat(raw.baseStatText));assert.deepEqual(s.curveIds,base.weapons[ref].curveIds);
  for(let lv=1;lv<=90;lv++){const actual=box.GenshinBaseStats.resolveWeapon(id,lv);near(actual.weaponBaseAtk,box.GenshinBaseStats.resolveWeapon(ref,lv).weaponBaseAtk);near(actual.weaponSecondaryValue,s.baseProps[s.secondaryPropId]*base.curves[s.curveIds[s.secondaryPropId]][lv-1]*100);}
  [20,40,50,60,70,80].forEach((lv,index)=>{for(const stage of [index,index+1])near(box.GenshinBaseStats.resolveWeapon(id,lv,stage).weaponBaseAtk,box.GenshinBaseStats.resolveWeapon(ref,lv,stage).weaponBaseAtk);});
  assert.ok(box.GenshinBaseStats.resolveWeapon(id,80).weaponBaseAtk>400);
 }
});
test("11522 current Loyalty affects wearer crit at R1-R5 and never becomes party support",()=>{
 for(let r=1;r<=5;r++){
  const f=fixture("11522",r),off=f.calc();state(f,"loyalty",true);const on=f.calc(),bonus=56+(r-1)*16;
  near(on.results[0].nonCrit,off.results[0].nonCrit);near(on.results[0].breakdown.critDamage,100+bonus);assert.ok(on.results[0].expected>off.results[0].expected);replay(f,on);
  state(f,"loyalty",false);near(f.calc().results[0].expected,off.results[0].expected);
  f.request.party={schemaVersion:2,focusSlot:1,members:[{slot:1,enabled:true,role:"main",characterId:"10000003",stats:f.request.stats,equipment:{weaponId:""}},{slot:2,enabled:true,role:"support",characterId:"10000042",stats:{atk:1000,baseAtk:500},equipment:{weaponId:"11522",refinement:r},buffStates:{}}],conditionStates:{}};
  f.request.weaponId="";
  for(const kind of ["loyalty","rebellion"]){const key=`party:2:10000042:group:provisional71_w11522_${kind}_state`;f.request.party.conditionStates[key]={enabled:true,option:"active"};f.request.party.members[1].buffStates[key]=true;}
  const party=f.calc();assert.ok(!party.partyModifiers.some(m=>m.enabled&&m.modifier.id.startsWith("provisional71_w11522")));near(party.results[0].breakdown.critDamage,100);
 }
});
test("11522 Rebellion targets Stellar Swirl classification rather than damage element, with other reactions isolated",()=>{
 for(let r=1;r<=5;r++){
  const f=fixture("11522",r),off=f.calc();state(f,"rebellion",true);const on=f.calc(),bonus=36+(r-1)*9;
  for(const element of ["風","氷"]){const a=probe(f,off,"stellarSwirl",element),b=probe(f,on,"stellarSwirl",element);near(b.mods.reactionBonus,bonus);assert.ok(b.result.expected>a.result.expected);near(b.result.breakdown.resistance,a.result.breakdown.resistance);}
  for(const reaction of ["stellarConduct","lunarCrystallize","lunarCharged","vaporize",""])near(probe(f,on,reaction).mods.reactionBonus,0);
  near(on.results[0].expected,off.results[0].expected);replay(f,on);
 }
});
test("11522 standalone critical reactions receive wearer Loyalty once; Rebellion remains Swirl-only",()=>{
 const f=fixture();f.request.reactionOptionKey="stellarSwirl";
 const off=f.calc();state(f,"loyalty",true);state(f,"rebellion",true);const on=f.calc();
 const get=p=>p.results.find(x=>x.entry.id==="reaction_stellarSwirl");assert.ok(get(off).expected>0);
 near(get(on).breakdown.critDamage,156);near(get(on).breakdown.reactionBonus,36);assert.ok(get(on).expected>get(off).expected);replay(f,on);
});
test("11438 one 0-2 stack UI drives R1-R5 wearer EM and real reaction damage, capped and replayable",()=>{
 for(let r=1;r<=5;r++){
  const f=fixture("11438",r);f.request.reactionOptionKey="stellarSwirl";const off=f.calc();
  for(const count of [0,1,2,3]){state(f,"mist",count);const p=f.calc();near(p.context.effectiveStats.elementalMastery,Math.min(count,2)*(52+(r-1)*13));near(p.results[0].nonCrit,off.results[0].nonCrit);if(count>0)assert.ok(p.results.find(x=>x.entry.id==="reaction_stellarSwirl").expected>off.results.find(x=>x.entry.id==="reaction_stellarSwirl").expected);replay(f,p);}
 }
});
test("11522 general wearer crit also follows the critical lunar contract without copying it to other participants",()=>{
 for(const reaction of ["stellarSwirl","lunarCharged","lunarCrystallize"]){
  const f=fixture();f.request.reactionOptionKey=reaction;
  f.request.manualInputs.reactionContributors=[{slot:2,level:90,elementalMastery:0,critRate:50,critDamage:100,baseDamageBonus:0,reactionBonus:0,additiveBaseDamage:0}];
  state(f,"loyalty",true);state(f,"rebellion",true);const p=f.calc(),row=p.results.find(x=>x.entry.id==="reaction_"+reaction);
  assert.ok(row.expected>0);near(row.breakdown.reaction.contributors[0].critDamage,156);near(row.breakdown.reaction.contributors[1].critDamage,100);
  near(row.breakdown.reactionBonus,reaction==="stellarSwirl"?36:0);replay(f,p);
 }
});
test("switching away from either weapon removes its current buffs without leaking old saved condition keys",()=>{
 for(const [id,kind,value] of [["11522","loyalty",true],["11522","rebellion",true],["11438","mist",2]]){const f=fixture(id);state(f,kind,value);f.request.weaponId="11402";const p=f.calc();assert.ok(!p.results.some(row=>row.breakdown.appliedModifiers.some(m=>m.modifier.id.startsWith("provisional71_w"))));near(p.context.effectiveStats.elementalMastery,0);replay(f,p);}
});
