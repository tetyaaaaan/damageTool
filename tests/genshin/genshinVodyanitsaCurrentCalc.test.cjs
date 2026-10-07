"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),test=require("node:test");
const {createScenarioHarness,prepareScenarioInputs,setConditionElement,setElement}=require("./helpers/calcScenarioHarness.cjs");
const ID="10000140",E=n=>`provisional71_${ID}_${n}`;
const base=path.resolve(__dirname,"../../games/genshin/data/v2/version-transitions/7.0-to-7.1");
const DOC=JSON.parse(fs.readFileSync(path.join(base,"vodyanitsa-currentcalc.json"),"utf8")),RAW=JSON.parse(fs.readFileSync(path.join(base,"sources/vodyanitsa-currentcalc/japanese-talents.json"),"utf8"));
function fixture(characterId=ID,c=6){const f=createScenarioHarness(),s={window:{},console};vm.createContext(s);for(const name of ["genshinDataContract","genshinCalcData"])vm.runInContext(fs.readFileSync(path.resolve(__dirname,`../../games/js/${name}.js`),"utf8"),s);s.window.GenshinCalcData.applyProvisional70Data(f.calcData,[JSON.parse(fs.readFileSync(path.resolve(__dirname,"../../games/genshin/data/v2/candidates/7.0-provisional-stellar-swirl.json"),"utf8"))]);s.window.GenshinCalcData.applyProvisional71Data(f.calcData,[JSON.parse(JSON.stringify(DOC))]);prepareScenarioInputs(f.elements,{characterId,constellation:characterId===ID?c:0,stats:{atk:2000,baseAtk:1000,hp:40000,baseHp:10000,elementalMastery:0,critRate:50,critDamage:100,elementDamageBonus:0}});f.engine=f.sandbox.GenshinCalcEngine;f.request=f.engine.buildCalculationRequestFromForm();f.calc=(r=f.request)=>f.engine.calculateDamageRequest(r,f.calcData);return f;}
function own(f,group,value,kind="option"){setConditionElement(f.elements,`character:${ID}:group:${group}`,kind,value);f.sandbox.GenshinCalcConditions.conditionPanelState(f.engine.buildCalculationRequestFromForm(),f.calcData);f.request=f.engine.buildCalculationRequestFromForm();}
function row(p,name){const r=p.results.find(x=>x.entry.id===E(name));assert.ok(r,name);return r;}
function near(a,b){assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);}
function trace(p,n){return p.statTrace.find(x=>x.modifierId===E(n));}
function replay(f,p){const q=f.calc(JSON.parse(JSON.stringify(p.calculationRequest)));assert.deepEqual(JSON.parse(JSON.stringify(q.results)),JSON.parse(JSON.stringify(p.results)));}
function provider(f){f.request.party={schemaVersion:2,focusSlot:1,conditionStates:{},members:[{slot:1,enabled:true,role:"main",characterId:f.request.characterId,stats:{...f.request.stats},buffStates:{},equipment:{artifactSetIds:[]}},{slot:2,enabled:true,role:"support",characterId:ID,constellation:6,level:90,talentLevels:{normal:10,skill:10,burst:10},stats:{hp:40000,baseHp:10000,atk:1000,baseAtk:500,elementalMastery:0},buffStates:{},equipment:{weaponId:"",artifactSetIds:[]}}]};}
function party(f,group,value,kind="option"){const key=`party:2:${ID}:group:${group}`;f.request.party.conditionStates[key]={[kind]:value};f.request.party.members[1].buffStates[key]=true;}
function probe(f,p,element,reaction="",attackType="skill") {
 const entry={id:"a4-target-probe",element,attackType,damageType:attackType,group:attackType,directReactionId:reaction,levelSource:"skill",scalings:[{stat:"atk",valuesByLevel:{"10":100}}],hitCount:1};
 const mods=f.engine.applyModifiersToDamageEntry(entry,p.context,f.engine.collectActiveModifiers(f.calcData,p.context));
 return { mods, result:f.engine.calculateDamage(entry,p.context,mods) };
}
function addAttackBonus(f,attack,value) {
 f.calcData.talentModifiers[ID].passives.push({sourceId:"controlled_bonus",modifiers:[{id:`test_${attack}_bonus`,category:"damageBonus",applyTo:[`${attack}DamageBonus`],value,unit:"percent",condition:"always",uidHandling:"conditional",calculationSupport:"simple"}]});
}

test("Vodyanitsa confirmed attacks retain all 15 raw levels and independent Horn/low/high plunge entries",()=>{const entries=Object.values(DOC.talentScalings[ID]).flatMap(g=>g.entries).filter(e=>!e.calculationStatus);assert.equal(entries.length,12);for(const e of entries){const values=RAW[e.source.section].attributes.parameters[e.source.param];assert.ok(values,e.id);for(let i=1;i<=15;i++)near(e.scalings[0].valuesByLevel[i],values[i-1]*100);}assert.equal(fixture().calc().results.length,11);assert.deepEqual(DOC.constellationModifiers[ID].constellations["3"],[]);assert.deepEqual(DOC.constellationModifiers[ID].constellations["5"],[]);});
test("Vodyanitsa C4 current HP feeds self C1 flat ATK without rounding or double application",()=>{const f=fixture();own(f,"vodyanitsa_c1_heal","active");near(trace(f.calc(),"c1_team_atk_from_hp").value,320);for(const stack of [0,1,2,3]){own(f,"vodyanitsa_c4_state",stack,"stack");const p=f.calc();near(p.context.effectiveStats.hp,40000+2000*stack);near(trace(p,"c1_team_atk_from_hp").value,(40000+2000*stack)*.008);near(row(p,"normal_1").breakdown.statBonus.atk,(40000+2000*stack)*.008);replay(f,p);}});
test("Vodyanitsa party C1 references provider C4 HP and never recipient HP for two recipients",()=>{for(const recipient of ["10000025","10000052"]){const f=fixture(recipient);provider(f);const recipientHP=f.calc().context.effectiveStats.hp;party(f,"vodyanitsa_c1_heal","active");near(trace(f.calc(),"c1_team_atk_from_hp").value,320);party(f,"vodyanitsa_c4_state",3,"stack");let p=f.calc();near(trace(p,"c1_team_atk_from_hp").value,368);near(p.context.effectiveStats.hp,recipientHP);f.request.stats.hp=70000;p=f.calc();near(trace(p,"c1_team_atk_from_hp").value,368);f.request.party.members[1].stats.hp=50000;p=f.calc();near(trace(p,"c1_team_atk_from_hp").value,448);replay(f,p);}});
test("Vodyanitsa skill RES follows provider talent level and A1 affects only Anemo",()=>{const f=fixture();const before=row(f.calc(),"normal_1").expected;own(f,"vodyanitsa_skill_hit","active");const p=f.calc();assert.ok(row(p,"normal_1").expected>before);near(row(p,"normal_1").breakdown.resistance, -20);own(f,"vodyanitsa_a1_meteorstorm","active");near(row(f.calc(),"normal_1").expected,row(p,"normal_1").expected);const m=DOC.talentModifiers[ID].passives[0].modifiers[0];for(let lv=1;lv<=15;lv++)near(m.valueByLevel[lv],RAW.combat2.attributes.parameters.param8[lv-1]*100);});
test("Vodyanitsa C2 uses one exclusive condition and C6 expands party recipient label",()=>{const f=fixture();const before=row(f.calc(),"normal_1");own(f,"vodyanitsa_c2_variant","voice");const voice=row(f.calc(),"normal_1");assert.ok(voice.crit>before.crit);own(f,"vodyanitsa_c2_variant","meteorstorm");near(row(f.calc(),"normal_1").crit,before.crit);provider(f);party(f,"vodyanitsa_c2_variant","voice");const p=f.calc();assert.equal(p.partyModifiers.find(x=>x.modifier.id===E("c2_hydro_cryo_critdmg")).targetOwner,"team");replay(f,p);});
test("Vodyanitsa Song multiplies Burst talent base at every level and keeps ordinary Burst bonuses separate", () => {
 const f=fixture(ID,0);
 for (let lv=1;lv<=15;lv++) {
  own(f,"vodyanitsa_song_state","inactive"); f.request.talentLevels.burst=lv;
  const off=row(f.calc(),"burst_initial");
  own(f,"vodyanitsa_song_state","active"); f.request.talentLevels.burst=lv;
  const p=f.calc(),on=row(p,"burst_song"),multiplier=1+RAW.combat3.attributes.parameters.param2[lv-1];
  near(on.breakdown.baseTalentDamageMultiplier,multiplier);
  near(on.nonCrit,off.nonCrit*multiplier); assert.equal(on.problems.length,0);
  near(on.breakdown.damageBonus,off.breakdown.damageBonus); replay(f,p);
 }
 addAttackBonus(f,"burst",80); own(f,"vodyanitsa_song_state","inactive");
 const off=row(f.calc(),"burst_initial");
 own(f,"vodyanitsa_song_state","active");
 const on=row(f.calc(),"burst_song"); near(on.nonCrit,off.nonCrit*1.864); near(on.breakdown.damageBonus,80);
 assert.equal(DOC.deferredUnknowns.length,0); assert.equal(DOC.provisionalCurrentCalcSpecs.a4FractionalHP.status,"provisional");
});
test("Vodyanitsa C2/C6 isolate ordinary elements and independently elevate Stellar Swirl by 1.25",()=>{
 const f=fixture();
 const make=(p,element,reaction="")=>{const entry={id:"controlled-probe",element,attackType:"skill",damageType:"skill",group:"skill",directReactionId:reaction,levelSource:"skill",scalings:[{stat:"atk",valuesByLevel:{"10":100}}],hitCount:1};const mods=f.engine.applyModifiersToDamageEntry(entry,p.context,f.engine.collectActiveModifiers(f.calcData,p.context));return {mods:mods.totals,result:f.engine.calculateDamage(entry,p.context,mods)};};
 const off=f.calc(),starOff=make(off,"風","stellarSwirl");
 own(f,"vodyanitsa_c2_variant","voice");const voice=f.calc();near(make(voice,"炎").mods.critDamageBonus,0);near(make(voice,"水").mods.critDamageBonus,50);near(make(voice,"氷").mods.critDamageBonus,50);near(make(voice,"水","stellarSwirl").mods.critDamageBonus,0);
 own(f,"vodyanitsa_c2_variant","meteorstorm");const meteor=f.calc();near(make(meteor,"水").mods.critDamageBonus,0);near(make(meteor,"風","stellarSwirl").mods.reactionCritDamage,60);near(make(meteor,"風","stellarConduct").mods.reactionCritDamage,0);
 own(f,"vodyanitsa_c2_variant","inactive");own(f,"vodyanitsa_song_state","active");const song=f.calc(),starOn=make(song,"風","stellarSwirl");near(starOn.mods.finalDamageMultiplier,1.25);near(starOn.result.expected,starOff.result.expected*1.25);near(make(song,"風","stellarConduct").mods.finalDamageMultiplier,1);near(make(song,"炎").mods.damageBonus,0);
});

test("A4 provisionally adds continuous HP base damage before recipient DMG Bonus, CRIT, DEF and RES", () => {
 const f=fixture(ID,0); own(f,"vodyanitsa_a4_state","leadTalent");
 for (const [hp,expected] of [[39999,0],[40000,0],[41000,140],[50000,1400],[65000,3500],[66000,3500]]) {
  f.request.stats.hp=hp; const p=f.calc(),r=row(p,"normal_1");
  near(r.breakdown.additiveBaseDamage,expected); assert.equal(r.problems.length,0);
  near(r.breakdown.damageBonus,0); replay(f,p);
 }
 f.request.stats.hp=50000; const before=row(f.calc(),"normal_1");
 addAttackBonus(f,"normalAttack",50); const after=row(f.calc(),"normal_1");
 near(after.nonCrit,before.nonCrit*1.5); near(after.crit,after.nonCrit*2);
 for (const hp of [40999,41500,50500,64999]) {
  f.request.stats.hp=hp; const p=f.calc(),r=row(p,"normal_1");
  assert.equal(r.problems.length,0); near(r.breakdown.additiveBaseDamage,(hp-40000)/1000*140); assert.ok(r.expected>0);
  assert.equal(probe(f,p,"炎").result.problems.length,0); replay(f,p);
 }
});

test("A4 Lead Vocal and Chorus are exclusive current recipient states; Vortex switches only the target bucket", () => {
 const f=fixture(ID,0);
 for (const state of ["leadTalent","chorusTalent","leadSwirl","chorusSwirl"]) {
  own(f,"vodyanitsa_a4_state",state); f.request.stats.hp=50000; const p=f.calc();
  const hydro=probe(f,p,"水"),cryo=probe(f,p,"氷"),star=probe(f,p,"風","stellarSwirl");
  const swirl=state.endsWith("Swirl"); near(hydro.mods.totals.additiveBaseDamage,swirl?0:1400);
  near(cryo.mods.totals.additiveBaseDamage,swirl?0:1400); near(star.mods.totals.additiveBaseDamage,swirl?2600:0);
  near(probe(f,p,"風","stellarConduct").mods.totals.additiveBaseDamage,0);
  near(probe(f,p,"炎").mods.totals.additiveBaseDamage,0);
  const selected=(swirl?star:hydro).mods.applied.filter(x=>x.modifier.id.includes("a4_")); assert.equal(selected.length,1);
  assert.equal(selected[0].modifier.recipientRole,state.startsWith("lead")?"activeCharacter":"offFieldOrOtherNearby");
  replay(f,p);
 }
 own(f,"vodyanitsa_a4_state","leadSwirl"); f.request.stats.hp=65000;
 near(probe(f,f.calc(),"風","stellarSwirl").mods.totals.additiveBaseDamage,6500);
 f.request.stats.hp=50500; near(probe(f,f.calc(),"風","stellarSwirl").mods.totals.additiveBaseDamage,2730);
});

test("A4 party uses only provider C4-adjusted HP for its base addition and survives Request replay", () => {
 const f=fixture("10000025"); provider(f); f.request.party.members[1].stats.hp=50000;
 party(f,"vodyanitsa_a4_state","leadTalent"); let p=f.calc();
 const first=p.results.find(r=>r.entry.element==="水"&&!r.entry.directReactionId); assert.ok(first); near(first.breakdown.additiveBaseDamage,1400);
 f.request.stats.hp=10000; p=f.calc(); near(p.results.find(r=>r.entry.id===first.entry.id).breakdown.additiveBaseDamage,1400);
 party(f,"vodyanitsa_c4_state",3,"stack"); p=f.calc(); near(p.results.find(r=>r.entry.id===first.entry.id).breakdown.additiveBaseDamage,2240); replay(f,p);
 f.request.party.members[1].stats.hp=50500; p=f.calc(); near(p.results.find(r=>r.entry.id===first.entry.id).breakdown.additiveBaseDamage,2310); replay(f,p);
});

test("A4 Stellar Swirl uses continuous HP without copying Lead Vocal to additional participants", () => {
 const f=fixture(ID,0); setElement(f.elements,"genshinJsonReactionOption","stellarSwirl");
 own(f,"vodyanitsa_a4_state","leadSwirl"); f.request.stats.hp=50000;
 let p=f.calc(),r=p.results.find(x=>x.entry.id==="reaction_stellarSwirl"); assert.ok(r);
 near(r.breakdown.reactionAdditiveBaseDamage,2600);
 f.request.manualInputs.reactionContributors=[{slot:2,level:90,elementalMastery:0,critRate:0,critDamage:0,baseDamageBonus:0,reactionBonus:0,additiveBaseDamage:0}];
 p=f.calc(); r=p.results.find(x=>x.entry.id==="reaction_stellarSwirl");
 assert.equal(r.breakdown.reaction.contributors.length,2);
 near(r.breakdown.reaction.contributors[0].additiveBaseDamage,2600);
 near(r.breakdown.reaction.contributors[1].additiveBaseDamage,0);
 near(r.breakdown.reaction.modifierScopes.sharedParty.additiveBaseDamage,0);
 near(r.breakdown.reaction.modifierScopes.participantLocal.additiveBaseDamage,2600);
 replay(f,p);
 f.request.stats.hp=50500; p=f.calc(); r=p.results.find(x=>x.entry.id==="reaction_stellarSwirl");
 assert.equal(r.problems.length,0); near(r.breakdown.reaction.contributors[0].additiveBaseDamage,2730); assert.ok(r.expected>0); replay(f,p);
});
