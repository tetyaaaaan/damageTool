"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),test=require("node:test");
const {createScenarioHarness,prepareScenarioInputs}=require("./helpers/calcScenarioHarness.cjs");
const root=path.resolve(__dirname,"../.."),candidate=require("../../games/genshin/data/v2/version-transitions/7.0-to-7.1/weapon14524-currentcalc.json");
const inventory=require("../../games/genshin/data/v2/version-transitions/7.0-to-7.1/sources/vesna-currentcalc/inventory-selected-records.json");
const ID="14524",GROUP="provisional71_w14524_mead_state";
function fixture(refinement=1,characterId="10000054"){
 const f=createScenarioHarness(),box={window:{},console};vm.createContext(box);
 for(const name of ["genshinDataContract","genshinCalcData"])vm.runInContext(fs.readFileSync(path.join(root,"games/js",name+".js"),"utf8"),box);
 box.window.GenshinCalcData.applyProvisional71Data(f.calcData,[candidate],f.calcData.warnings);
 prepareScenarioInputs(f.elements,{characterId,weaponId:ID,stats:{atk:1500,baseAtk:700,hp:50500,baseHp:10000,critRate:50,critDamage:100}});
 f.engine=f.sandbox.GenshinCalcEngine;f.conditions=f.sandbox.GenshinCalcConditions;
 f.request=f.engine.buildCalculationRequestFromForm();f.request.refinement=refinement;f.conditions.conditionPanelState(f.request,f.calcData);
 f.calc=()=>f.engine.calculateDamageRequest(f.request,f.calcData);return f;
}
function select(f,option){const panel=f.conditions.conditionPanelState(f.request,f.calcData);const definitions=panel.complexConditionInputs.filter(d=>d.conditionGroupId===GROUP);assert.equal(definitions.length,1,"one shared current game state");f.request.uiState.complexConditionByModifier[definitions[0].key]={option};f.conditions.conditionPanelState(f.request,f.calcData);}
function near(a,b){assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);}
function replay(f,p){const q=f.engine.calculateDamageRequest(JSON.parse(JSON.stringify(p.calculationRequest)),f.calcData);assert.deepEqual(JSON.parse(JSON.stringify(q.results)),JSON.parse(JSON.stringify(p.results)));}
test("14524 source classification retains R1-R5, amplification is a stat effect and only ATK is specification-pending",()=>{
 const raw=inventory.datasets.weapons.records.find(w=>String(w.id)===ID);
 assert.equal(raw.version,"7.1");assert.equal(candidate.weapons[ID].nameJa,raw.name);assert.equal(candidate.currentCalcClassification[ID].siteReady,false);
 for(let r=1;r<=5;r++){near(candidate.weaponModifiers[ID].modifiers[0].valueByRefinementByCondition[r].three,parseFloat(raw["r"+r].values[1])*3);near(candidate.weaponModifiers[ID].modifiers[0].valueByRefinementByCondition[r].boostedThree,parseFloat(raw["r"+r].values[1])*3*1.75);}
 assert.equal(candidate.deferredUnknowns.length,1);assert.equal(candidate.deferredUnknowns[0].unknowns.length,3);
 assert.ok(!candidate.weaponModifiers[ID].modifiers.some(m=>["reactionBonus","damageBonus","reactionBaseDamageBonus","extraDamage","effectOverride"].includes(m.category)));
});
test("14524 HP changes continuously using final input plus baseHP stat bonus at all refinements and declared states",()=>{
 for(let r=1;r<=5;r++)for(const [option,stack,boost]of [["inactive",0,1],["one",1,1],["two",2,1],["three",3,1],["boostedOne",1,1.75],["boostedTwo",2,1.75],["boostedThree",3,1.75]]){
  const f=fixture(r);select(f,option);const p=f.calc();near(p.context.effectiveStats.hp,50500+10000*(3+r)*stack*boost/100);near(p.context.effectiveStats.atk,1500);replay(f,p);
 }
});
test("confirmed HP buff changes HP talent damage for two catalyst wearers without adding damage/reaction bonuses",()=>{
 for(const character of ["10000054","10000087"]){const f=fixture(1,character),before=f.calc();select(f,"three");const after=f.calc();const hpRows=before.results.filter(row=>row.entry.scalings?.some(s=>s.stat==="hp")&&row.expected>0);assert.ok(hpRows.length);
  for(const row of hpRows){const boosted=after.results.find(x=>x.entry.id===row.entry.id);assert.ok(boosted.expected>row.expected);near(boosted.breakdown.damageBonus,row.breakdown.damageBonus);near(boosted.breakdown.reactionBonus,row.breakdown.reactionBonus);}replay(f,after);
 }
});
test("ambiguous ATK threshold, intermediate and cap HP inputs never receive a guessed ATK or party transfer",()=>{
 const f=fixture();select(f,"boostedThree");
 for(const hp of [39999,40000,40999,41000,41500,50500,59999,60000,61000,79999,80000,81000]){f.request.stats.hp=hp;const p=f.calc();near(p.context.effectiveStats.atk,1500);assert.ok(p.warnings.some(w=>w.weaponId===ID&&/仕様確認中/.test(w.message)));assert.ok(!p.statTrace.some(x=>x.modifierId==="provisional71_w14524_atk_pending"));replay(f,p);}
 for(const recipient of ["10000025","10000052"]){
  const f=fixture(5,recipient);
  f.request.characterId=recipient;f.request.weaponId="";f.request.party={schemaVersion:2,focusSlot:1,conditionStates:{},members:[{slot:1,enabled:true,role:"main",characterId:recipient,stats:{...f.request.stats},equipment:{weaponId:""}},{slot:2,enabled:true,role:"support",characterId:"10000054",stats:{hp:50500,baseHp:10000,atk:1000,baseAtk:500},equipment:{weaponId:ID,refinement:5},buffStates:{}}]};
  const key=`party:2:10000054:group:${GROUP}`;f.request.party.conditionStates[key]={enabled:true,option:"boostedThree"};f.request.party.members[1].buffStates[key]=true;
  f.conditions.conditionPanelState(f.request,f.calcData);
  const before=f.calc();f.request.party.members[1].stats.hp=80000;const after=f.calc();near(after.context.effectiveStats.hp,before.context.effectiveStats.hp);near(after.context.effectiveStats.atk,before.context.effectiveStats.atk);const damage=p=>JSON.parse(JSON.stringify(p.results.map(x=>[x.entry.id,x.nonCrit,x.crit,x.expected])));assert.deepEqual(damage(after),damage(before));assert.ok(after.warnings.some(w=>w.weaponId===ID));replay(f,after);
 }
});
test("switching weapons removes Hymn HP and its partial-result warning despite saved old state",()=>{
 const f=fixture();select(f,"boostedThree");f.request.weaponId="14501";const p=f.calc();near(p.context.effectiveStats.hp,50500);assert.ok(!p.warnings.some(w=>w.weaponId===ID));assert.ok(!p.statTrace.some(x=>x.modifierId.startsWith("provisional71_w14524")));replay(f,p);
});
test("14524 full Level1-90 ATK/HP growth reuses matching standard11511 including ascension boundaries",async()=>{
 const base=require("../../games/genshin/data/base-stats.json"),s=candidate.baseStats.weapons[ID];assert.deepEqual(s.baseProps,base.weapons["11511"].baseProps);assert.deepEqual(s.curveIds,base.weapons["11511"].curveIds);
 const box={console,document:{readyState:"loading",addEventListener(){},getElementById(){return null}},fetch:async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,String(url)),"utf8"))})};box.window=box;vm.createContext(box);vm.runInContext(fs.readFileSync(path.join(root,"games/js/genshinBaseStats.js"),"utf8"),box);await box.GenshinBaseStats.ready;
 for(let level=1;level<=90;level++){const actual=box.GenshinBaseStats.resolveWeapon(ID,level);near(actual.weaponBaseAtk,box.GenshinBaseStats.resolveWeapon("11511",level).weaponBaseAtk);near(actual.weaponSecondaryValue,.144*base.curves[2301][level-1]*100);}
 [20,40,50,60,70,80].forEach((level,index)=>{for(const stage of [index,index+1])near(box.GenshinBaseStats.resolveWeapon(ID,level,stage).weaponBaseAtk,box.GenshinBaseStats.resolveWeapon("11511",level,stage).weaponBaseAtk);});
});
