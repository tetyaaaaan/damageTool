"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {loadProductionFixture,runtime,makeRequest,assertMatchesIndependent,assertClose,fixedSourceSha}=require("./helpers/hsrDirectVerification.cjs");
const {validateModifiers}=require("../../scripts/validateHsrModifiers.cjs");
const authored=require("../../games/hsr/data/calc/modifiers-equipment-round7.json").modifiers;
const byId=new Map(authored.map(row=>[row.id,row]));
const values={
  "24001-low":[8,10,12,14,16],"24001-kill":[20,25,30,35,40],
  "21015":[12,13,14,15,16],"23020-debuff":[8,9,10,11,12],
  "23020-ultimate":[36,42,48,54,60],"23020-followup":[24,28,32,36,40],
  "21034":[0.2,0.25,0.3,0.35,0.4],"23001-normal":[6,7,8,9,10],"23001-ultimate":[12,14,16,18,20],
  "24000-atk":[8,10,12,14,16],"24000-break":[12,15,18,21,24]
};
const rankKey=row=>row.source.id==="24001"?(row.activation.mode==="toggle"?"24001-kill":"24001-low"):row.source.id==="21015"?"21015":row.source.id==="21034"?"21034":row.source.id==="23001"?(row.target.attackTypes.includes("ultimate")?"23001-ultimate":"23001-normal"):row.source.id==="24000"?(row.activation.mode==="stack"?"24000-atk":"24000-break"):row.target.attackTypes[0]==="followUp"?"23020-followup":row.activation.mode==="statThreshold"?"23020-debuff":"23020-ultimate";
function context(id,rank,extra={}){return{characterId:"1003",lightConeId:id,refinement:rank,stats:{atk:3000,hp:6000,def:1000,speed:120,critRate:50,critDamage:100},baseStats:{atk:1000,hp:1000,def:1000},enemy:{hpPercent:50,debuffCount:0,weakness:true,...extra.enemy},...extra};}
const attack=(type="normal")=>({id:"round7-"+type,type,element:"Fire",scalingStat:"atk",multipliers:Array(10).fill(100),canCrit:true,target:"single"});
function inputsFor(row,on=true){return row.activation.mode==="toggle"?{[row.activation.inputKey]:on}:{};}
const selected=(row,rank,extra={},inputs={})=>runtime.buildCandidates([row],context(row.source.id,rank,extra),inputs)[0];

test("round7 LC records use the pinned source and all S1-S5 effect tables",async()=>{
 const {data}=await loadProductionFixture();
 assert.deepEqual(validateModifiers(authored),[]);
 for(const row of authored){assert.equal(row.provenance.sourceCommit,fixedSourceSha);const loaded=data.structuredModifiers.find(x=>x.id===row.id);assert.ok(loaded,row.id+" production registration");assert.deepEqual(Array.from(row.value.values),values[rankKey(row)],row.id+" S1-S5");}
 const ids=["21015","21034","23001","23020","24000","24001"];
 assert.deepEqual(Array.from(authored.map(x=>x.source.id).filter((v,i,a)=>a.indexOf(v)===i).sort()),ids);
 assert.equal(authored.length,11);
 const cones=Object.fromEntries(ids.map(id=>[id,data.lightCones.find(x=>x.id===id)]));
 assert.deepEqual(ids.map(id=>cones[id].name),["決意は汗のように輝く","今日も平和な一日","夜の帳の中で","純粋なる思惟の洗礼","とある星神の殞落を記す","星海巡航"]);
 for(const row of authored){assert.ok(row.finalStatsInclusion);assert.equal(row.inputPolicy,"conditional");}
});

test("24001 enemy HP threshold is automatic at 50%, omitted above it and locally unresolved when unknown",async()=>{
 const {engine}=await loadProductionFixture(),row=byId.get("lightCone:24001:low-enemy-hp-crit-rate");
 for(let rank=1;rank<=5;rank++){
   for(const hp of [50,25,0]){const item=selected(row,rank,{enemy:{hpPercent:hp}});assert.equal(item.automatic,true);assert.equal(item.enabled,true,"HP "+hp);assert.equal(item.value,values["24001-low"][rank-1]);const a=attack();assertMatchesIndependent(engine,makeRequest(a,10,{},[{...item,applicable:runtime.applicableToAttack(item,a)}]),"24001 low HP S"+rank+" hp"+hp);}
   const above=selected(row,rank,{enemy:{hpPercent:50.01}});assert.equal(above.enabled,false);
   const unknown=selected(row,rank,{enemy:{hpPercent:NaN}});assert.equal(unknown.enabled,false);assert.equal(unknown.activation.unresolved,true);
   const included=selected(row,rank,{enemy:{hpPercent:50}},{[row.finalStatsInclusion.inputKey]:true});assert.equal(included.enabled,false);assert.equal(included.includedInFinalStats,true);
 }
});

test("24001 post-kill ATK toggle applies only when selected and can be removed or restored",async()=>{
 const {engine}=await loadProductionFixture(),row=byId.get("lightCone:24001:post-kill-atk");
 for(let rank=1;rank<=5;rank++){
   const off=selected(row,rank,{},inputsFor(row,false)),on=selected(row,rank,{},inputsFor(row,true));assert.equal(off.enabled,false);assert.equal(on.enabled,true);assert.equal(on.value,values["24001-kill"][rank-1]);
   assertMatchesIndependent(engine,makeRequest(attack(),10,{},[{...on,applicable:true}]),"24001 post-kill S"+rank);
   assert.equal(runtime.buildCandidates([row],context(row.source.id,rank,{lightConeId:""}),inputsFor(row,true)).length,0,"unequip");
   assert.equal(selected(row,rank,{}, {[row.activation.inputKey]:JSON.parse(JSON.stringify(true))}).value,on.value,"save/restore selected state");
   assert.equal(selected(row,rank,{}, {[row.finalStatsInclusion.inputKey]:true,...inputsFor(row,true)}).enabled,false,"final-stat inclusion");
 }
});

test("21015 active Fallen debuff applies its exact defense reduction only while selected",async()=>{
 const {engine}=await loadProductionFixture(),row=byId.get("lightCone:21015:fallen-defense-reduction");
 for(let rank=1;rank<=5;rank++){
   const off=selected(row,rank,{},inputsFor(row,false)),on=selected(row,rank,{},inputsFor(row,true));assert.equal(off.enabled,false);assert.equal(on.enabled,true);assert.equal(on.value,values["21015"][rank-1]);assert.equal(on.activation.durationTurns,1);
   const a=attack("skill"),baseline=engine.calculate(makeRequest(a,10,{},[])),modified=engine.calculate(makeRequest(a,10,{},[{...on,applicable:true}]));
   assert.ok(modified.nonCrit>baseline.nonCrit,"defense reduction increases damage");
   assertMatchesIndependent(engine,makeRequest(a,10,{},[{...on,applicable:true}]),"21015 Fallen S"+rank);
   assert.equal(runtime.applicableToAttack(on,attack("dot")),true,"enemy defense down remains active for subsequent attack types");
   assert.equal(selected(row,rank,{}, {[row.activation.inputKey]:true,[row.finalStatsInclusion.inputKey]:true}).enabled,false,"no duplicate of manual enemy defense reduction");
 }
});

test("23020 debuff count auto-scales CD to three and Disputation limits damage/defense-ignore to correct attacks",async()=>{
 const {engine}=await loadProductionFixture(),cd=byId.get("lightCone:23020:enemy-debuff-crit-damage"),dmg=byId.get("lightCone:23020:post-ultimate-damage"),ignore=byId.get("lightCone:23020:post-ultimate-follow-up-defense-ignore");
 for(let rank=1;rank<=5;rank++){
   for(const count of [0,1,3,5]){
     const item=selected(cd,rank,{enemy:{debuffCount:count}});assert.equal(item.automatic,true);assert.equal(item.enabled,count>0);assert.equal(item.value,Math.min(count,3)*values["23020-debuff"][rank-1]);
     if(count>0){const a=attack();assertMatchesIndependent(engine,makeRequest(a,10,{},[{...item,applicable:true}]),"23020 debuffs "+count+" S"+rank);}
   }
   const activeDmg=selected(dmg,rank,{},inputsFor(dmg,true)),activeIgnore=selected(ignore,rank,{},inputsFor(ignore,true));
   assert.equal(activeDmg.value,values["23020-ultimate"][rank-1]);assert.equal(activeIgnore.value,values["23020-followup"][rank-1]);
   assert.equal(runtime.applicableToAttack(activeDmg,attack("normal")),true);assert.equal(runtime.applicableToAttack(activeDmg,attack("ultimate")),true);
   assert.equal(runtime.applicableToAttack(activeIgnore,attack("followUp")),true);assert.equal(runtime.applicableToAttack(activeIgnore,attack("normal")),false);
   assertMatchesIndependent(engine,makeRequest(attack("followUp"),10,{},[{...activeDmg,applicable:true},{...activeIgnore,applicable:true}]),"23020 follow-up S"+rank);
   assert.equal(selected(dmg,rank,{},inputsFor(dmg,false)).enabled,false);assert.equal(selected(ignore,rank,{},inputsFor(ignore,false)).enabled,false);
   assert.equal(runtime.buildCandidates([dmg],context(dmg.source.id,rank,{lightConeId:""}),inputsFor(dmg,true)).length,0);
   assert.equal(selected(ignore,rank,{}, {[ignore.finalStatsInclusion.inputKey]:true,...inputsFor(ignore,true)}).enabled,false);
 }
});

test("21034 maximum EP is a strict numeric input and its damage bonus caps at 160 EP",async()=>{
 const {engine}=await loadProductionFixture(),row=byId.get("lightCone:21034:max-energy-damage"),key="current-max-energy";
 for(let rank=1;rank<=5;rank++)for(const energy of [1,80,160,161,200]){
   const item=selected(row,rank,{}, {[key]:energy}),count=Math.min(energy,160),expected=count*values["21034"][rank-1];
   assert.equal(item.enabled,true);assert.equal(item.value,expected);assert.equal(item.valueInput.shared,true);
   assertMatchesIndependent(engine,makeRequest(attack("ultimate"),10,{},[{...item,applicable:true}]),"21034 maxEP "+energy+" S"+rank);
 }
 for(const invalid of [NaN,0,-1,1.5,100000]){const item=selected(row,5,{}, {[key]:invalid});assert.equal(item.enabled,false,"invalid or missing max EP "+invalid);assert.equal(item.activation.unresolved,true);}
 const capped=selected(row,5,{}, {[key]:200});assert.equal(capped.value,64);
 assert.equal(selected(row,5,{}, {[key]:160,[row.finalStatsInclusion.inputKey]:true}).enabled,false);
});

test("23001 speed thresholds derive six capped stacks and target only basic/skill damage or ultimate CRIT DMG",async()=>{
 const {engine}=await loadProductionFixture(),normal=byId.get("lightCone:23001:speed-normal-skill-damage"),ultimate=byId.get("lightCone:23001:speed-ultimate-crit-damage");
 for(let rank=1;rank<=5;rank++)for(const speed of [99,100,109.99,110,159.99,160,200]){
   const ctx=context("23001",rank,{stats:{atk:3000,hp:6000,def:1000,speed,critRate:50,critDamage:100}}),items=runtime.buildCandidates([normal,ultimate],ctx,{}),n=items.find(x=>x.id===normal.id),u=items.find(x=>x.id===ultimate.id),steps=Math.min(6,Math.floor(Math.max(0,speed-100)/10));
   assert.equal(n.automatic,true);assert.equal(u.automatic,true);
   assert.equal(n.enabled,speed>100);assert.equal(u.enabled,speed>100);
   assert.equal(n.value,steps*values["23001-normal"][rank-1]);assert.equal(u.value,steps*values["23001-ultimate"][rank-1]);
 }
 const activeItems=runtime.buildCandidates([normal,ultimate],context("23001",5,{stats:{atk:3000,hp:6000,def:1000,speed:160,critRate:50,critDamage:100}}),{}),activeNormal=activeItems.find(x=>x.id===normal.id),activeUltimate=activeItems.find(x=>x.id===ultimate.id);
 for(const type of ["normal","enhancedNormal","skill","enhancedSkill"])assert.equal(runtime.applicableToAttack(activeNormal,attack(type)),true);
 assert.equal(runtime.applicableToAttack(activeNormal,attack("ultimate")),false);assert.equal(runtime.applicableToAttack(activeUltimate,attack("ultimate")),true);assert.equal(runtime.applicableToAttack(activeUltimate,attack("followUp")),false);
 const support={id:"test-speed-support",source:{kind:"manual",id:"test-speed-support"},name:"speed support",description:"test",category:"statPercent",stat:"speed",unit:"percent",value:{kind:"fixed",fixed:10},target:{owner:"self",attackTypes:["all"],elements:[]},activation:{mode:"always"},stacking:{group:"test-speed-support",rule:"nonStacking"},calculation:{stage:"baseStats",operation:"add"},inputPolicy:"conditional",support:{status:"calculable",verified:true}};
 const supported=runtime.buildCandidates([normal,support],context("23001",5,{stats:{atk:3000,hp:6000,def:1000,speed:100,critRate:50,critDamage:100},baseStats:{atk:1000,hp:1000,def:1000,speed:100}}),{});
 assert.equal(supported.find(x=>x.id===normal.id).thresholdReferenceValue,110);assert.equal(supported.find(x=>x.id===normal.id).value,10,"external SPD support crosses the threshold automatically");
 const unknown=runtime.buildCandidates([normal],context("23001",5,{stats:{atk:3000,hp:6000,def:1000,speed:NaN,critRate:50,critDamage:100}}),{})[0];assert.equal(unknown.applicable,false);
 const active=runtime.buildCandidates([normal],context("23001",5,{stats:{atk:3000,hp:6000,def:1000,speed:160,critRate:50,critDamage:100}}),{})[0];
 assertMatchesIndependent(engine,makeRequest(attack("normal"),10,{},[{...active,applicable:true}]),"23001 speed damage independent S5");
 assert.equal(runtime.buildCandidates([ultimate],context("23001",5,{stats:{atk:3000,hp:6000,def:1000,speed:160,critRate:50,critDamage:100}}),{})[0].value,120);
});

test("24000 attack layers and post-break damage are separately selected and independently applied",async()=>{
 const {engine}=await loadProductionFixture(),atk=byId.get("lightCone:24000:attack-stack-atk"),dmg=byId.get("lightCone:24000:post-break-damage"),key=atk.activation.inputKey;
 for(let rank=1;rank<=5;rank++)for(const stacks of [0,1,2,3,4]){
   const layer=selected(atk,rank,{}, {[key]:stacks});assert.equal(layer.enabled,stacks>0);assert.equal(layer.value,stacks*values["24000-atk"][rank-1]);
   const post=selected(dmg,rank,{},inputsFor(dmg,true));assert.equal(post.enabled,true);assert.equal(post.value,values["24000-break"][rank-1]);assert.equal(post.activation.durationTurns,2);
   if(stacks>0){const a=attack("skill");assertMatchesIndependent(engine,makeRequest(a,10,{},[{...layer,applicable:true},{...post,applicable:true}]),"24000 layers="+stacks+" S"+rank);}
 }
 const absent=runtime.buildCandidates([atk,dmg],context("20000",5,{lightConeId:"20000"}),{[key]:4,[dmg.activation.inputKey]:true});assert.equal(absent.length,0,"unequip removes both components");
 assert.equal(selected(dmg,5,{},inputsFor(dmg,false)).enabled,false);
 assert.equal(selected(dmg,5,{}, {[dmg.activation.inputKey]:true,[dmg.finalStatsInclusion.inputKey]:true}).enabled,false);
 const saved=JSON.parse(JSON.stringify({[key]:4,[dmg.activation.inputKey]:true}));assert.equal(selected(atk,5,{},saved).value,64);assert.equal(selected(dmg,5,{},saved).enabled,true);
});

test("wearer-only effects do not transfer, while 21015 enemy debuff can come from a party wearer",async()=>{
 const {data}=await loadProductionFixture();
 const paths={"21015":"Warlock","21034":"Mage","23001":"Rogue","23020":"Rogue","24000":"Warrior","24001":"Rogue"};
 for(const [id,path] of Object.entries(paths)){
   assert.equal(data.lightCones.find(x=>x.id===id).path,path);
    const rows=authored.filter(x=>x.source.id===id);
    const partyContext={...context("20000",1),characterId:"1004",lightConeId:"20000",partyIds:["1003"],partyEquipment:[{characterId:"1003",lightConeId:id,refinement:5}]};
    if(id==="21015"){
      const candidate=runtime.buildCandidates(rows,partyContext,inputsFor(rows[0],true));
      assert.equal(candidate.length,1,"the existing enemy-target debuff modifier is available from its party wearer");
      assert.equal(candidate[0].providerId,"1003");
      assert.equal(candidate[0].value,16);
    }else assert.equal(runtime.buildCandidates(rows,partyContext,inputsFor(rows[0],true)).length,0,"wearer-only effect is not transferred from party");
 }
});
