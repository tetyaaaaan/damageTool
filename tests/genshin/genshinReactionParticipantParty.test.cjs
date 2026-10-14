"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const {createScenarioHarness,prepareScenarioInputs}=require("./helpers/calcScenarioHarness.cjs");
const plain=x=>JSON.parse(JSON.stringify(x));
function fixture(){const f=createScenarioHarness(); for(const name of ["genshinDataContract","genshinCalcData","genshinCurrentCalcState"]) vm.runInContext(fs.readFileSync(path.resolve(__dirname,"../../games/js/"+name+".js"),"utf8"),f.sandbox);f.sandbox.GenshinCalcData.applyProvisional70Data(f.calcData,[require("../../games/genshin/data/v2/candidates/7.0-provisional-stellar-swirl.json")],[]);prepareScenarioInputs(f.elements,{characterId:"10000002"}); f.engine=f.sandbox.GenshinCalcEngine;f.request=f.engine.buildCalculationRequestFromForm();f.request.party={schemaVersion:2,conditionStates:{},resonanceStates:{},members:[{slot:1,role:"main",enabled:true,characterId:"10000002",level:90,constellation:0,buffStates:{},equipment:{}},{slot:2,role:"support",enabled:true,characterId:"10000032",level:80,constellation:0,buffStates:{},equipment:{},stats:{elementalMastery:123.5,critRate:25,critDamage:75},provenance:{source:"mixed"}}]}; f.request.manualInputs.reactionContributors=[{slot:2,mode:"party",partySlot:2,characterId:"10000032",overrides:{}}];return f;}
test("party reference follows current stats and preserves explicit overrides",()=>{const f=fixture();let r=f.engine.resolveReactionContributors(f.request);assert.equal(r.contributors[0].elementalMastery,123.5);assert.equal(r.contributors[0].statSource,"mixed");f.request.party.members[1].stats.elementalMastery=456;assert.equal(f.engine.resolveReactionContributors(f.request).contributors[0].elementalMastery,456);f.request.manualInputs.reactionContributors[0].overrides={critRate:0};assert.equal(f.engine.resolveReactionContributors(f.request).contributors[0].critRate,0);});
test("unknown crit, duplicates, and changed character references never get guessed",()=>{const f=fixture();f.request.party.members[1].stats.critRate=null;assert.match(f.engine.resolveReactionContributors(f.request).problems[0],/未取得/);f.request.party.members[1].stats.critRate=25;f.request.manualInputs.reactionContributors.push({...f.request.manualInputs.reactionContributors[0],slot:3});assert.match(f.engine.resolveReactionContributors(f.request).problems[0],/同じ/);f.request.manualInputs.reactionContributors.pop();f.request.party.members[1].characterId="10000089";assert.match(f.engine.resolveReactionContributors(f.request).problems[0],/外れ/);});
test("three indirect reactions match equivalent legacy manual contributions and survive JSON reload",()=>{const f=fixture();for(const reaction of ["stellarSwirl","lunarCharged","lunarCrystallize"]){f.request.reactionOptionKey=reaction;const current=f.engine.calculateDamageRequest(f.request,f.calcData).results.find(x=>x.entry.id===`reaction_${reaction}`);assert.ok(current);const legacy=plain(f.request);legacy.manualInputs.reactionContributors=[{slot:2,level:80,elementalMastery:123.5,critRate:25,critDamage:75,reactionBonus:0,baseDamageBonus:0,additiveBaseDamage:0}];const old=f.engine.calculateDamageRequest(legacy,f.calcData).results.find(x=>x.entry.id===`reaction_${reaction}`);assert.equal(current.expected,old.expected);assert.equal(current.breakdown.reaction.contributors.length,2);const api=f.sandbox.GenshinCurrentCalcState,saved=api.createState(f.request,{},{});const restored=api.parse(api.serialize(saved),f.calcData);assert.equal(f.engine.calculateDamageRequest(restored.state.request,f.calcData).results.find(x=>x.entry.id===`reaction_${reaction}`).expected,current.expected);}});
test("not participating stays excluded even with retained old values",()=>{const f=fixture();f.request.manualInputs.reactionContributors=[{slot:2,mode:"none",level:90,elementalMastery:999}];assert.equal(f.engine.resolveReactionContributors(f.request).contributors.length,0);});

function support(slot,characterId,stats={}) { return {slot,characterId,enabled:true,level:90,constellation:0,talentLevels:{normal:10,skill:10,burst:10},equipment:{artifactSetIds:[]},stats:{hp:50000,baseHp:10000,atk:1500,baseAtk:600,def:800,elementalMastery:100,critRate:20,critDamage:60,...stats},buffStates:{},combatState:{onField:false}}; }
function group(f,member,name,value,kind='option') {const key=`party:${member.slot}:${member.characterId}:group:${name}`;f.request.party.conditionStates[key]={[kind]:value,enabled:kind==='stack'?value>0:value!=='inactive'};member.buffStates[key]=true;}
function indirect(f,reaction='stellarSwirl') {f.request.reactionOptionKey=reaction;return f.engine.calculateDamageRequest(f.request,f.calcData).results.find(row=>row.entry.id===`reaction_${reaction}`);}
function bound(f,member,slot=2,overrides={}) {return {slot,mode:'party',partySlot:member.slot,characterId:member.characterId,overrides};}

test('party participants reuse Sucrose recipient targeting, self exclusion, and current values',()=>{
 const f=fixture(),target=support(2,'10000032'),sucrose=support(3,'10000043',{elementalMastery:600});
 f.request.party.members=[f.request.party.members[0],target,sucrose];f.request.manualInputs.reactionContributors=[bound(f,target),bound(f,sucrose,3)];
 group(f,sucrose,'sucrose-passive1-swirl-element','pyro');
 const m=f.calcData.talentModifiers['10000043'].passives.find(p=>p.sourceId==='passive2').modifiers[0];
 const key=f.sandbox.GenshinPartyModifiers.candidateKey(sucrose,'talent','passive2',m,0);sucrose.buffStates[key]=true;
 f.request.reactionOptionKey="stellarSwirl";const original=plain(f.request);let result=indirect(f);assert.deepEqual(plain(f.request),original);assert.equal(result.breakdown.reaction.contributors[1].elementalMastery,270);assert.equal(result.breakdown.reaction.contributors[2].elementalMastery,600);
 target.stats.elementalMastery=200;result=indirect(f);assert.equal(result.breakdown.reaction.contributors[1].elementalMastery,370);
 f.request.manualInputs.reactionContributors[0].overrides={elementalMastery:0};assert.equal(indirect(f).breakdown.reaction.contributors[1].elementalMastery,170);
 f.request.party.members.pop();f.request.manualInputs.reactionContributors.pop();assert.equal(indirect(f).breakdown.reaction.contributors[1].elementalMastery,0);
});

test('a main-character provider supplies the support through its original own condition state',()=>{
 const f=fixture(),target=support(2,'10000032');f.request.characterId='10000043';f.request.characterElement='風';f.request.stats.elementalMastery=500;
 f.request.party.members=[{...support(1,'10000043'),role:'main'},target];f.request.manualInputs.reactionContributors=[bound(f,target)];
 const m=f.calcData.talentModifiers['10000043'].passives.find(p=>p.sourceId==='passive2').modifiers[0];
 f.request.uiState.conditionByModifier[`talent:passive2:${m.id}`]={enabled:true};
 assert.equal(indirect(f).breakdown.reaction.contributors[1].elementalMastery,200);
});

test('shared reaction buckets apply once; overrides replace local buckets; attack-only crit stays excluded',()=>{
 const f=fixture(),target=support(2,'10000032'),provider=support(3,'10000043');
 f.request.party.members=[f.request.party.members[0],target,provider];f.request.manualInputs.reactionContributors=[bound(f,target)];
 f.calcData.talentModifiers['10000043']={passives:[{sourceId:'passive2',modifiers:[
 {id:'shared',category:'reactionBonus',applyTo:['stellarSwirlDamageBonus','lunarChargedDamageBonus','lunarCrystallizeDamageBonus'],value:20,unit:'percent',condition:'always',targetOwner:'team',calculationSupport:'simple'},
 {id:'active-em',category:'statBonus',applyTo:['elementalMastery'],value:999,unit:'flat',condition:'always',targetOwner:'activeCharacter',calculationSupport:'simple'}]}]};
 f.calcData.talentModifiers['10000032']={passives:[{sourceId:'passive1',modifiers:[
 {id:'own',category:'reactionBonus',applyTo:['stellarSwirlDamageBonus','lunarChargedDamageBonus','lunarCrystallizeDamageBonus'],value:10,unit:'percent',condition:'always',targetOwner:'self',calculationSupport:'simple'},
 {id:'global-crit',category:'critBonus',applyTo:['critRate'],value:7,unit:'percent',condition:'always',calculationSupport:'simple'},
 {id:'attack-crit',category:'critBonus',applyTo:['normalAttackCritRate'],value:90,unit:'percent',condition:'always',includeStandaloneReactionCrit:true,calculationSupport:'simple'},
 {id:'reaction-crit',category:'reactionCritBonus',applyTo:['stellarSwirlCrit','lunarChargedCrit','lunarCrystallizeCrit'],critRate:5,critDamage:10,condition:'always',calculationSupport:'simple'},
 {id:'elevation',category:'effectOverride',applyTo:['stellarSwirlDamageBonus','lunarChargedDamageBonus','lunarCrystallizeDamageBonus'],value:120,unit:'percentOfOriginalDamage',condition:'always',reactionTargetsOnly:true,calculationSupport:'formula'}]}]};
 for(const reaction of ['stellarSwirl','lunarCharged','lunarCrystallize']) {const result=indirect(f,reaction),c=result.breakdown.reaction.contributors[1];assert.equal(c.reactionBonus,30);assert.equal(c.elementalMastery,100);assert.equal(c.critRate,32);assert.equal(c.critDamage,70);assert.equal(c.finalDamageMultiplier,1.2);assert.equal(c.modifierScopes.sharedParty.reactionBonus,20);
 assert.equal(indirect({...f,request:plain(f.request)},reaction).expected,result.expected);}
 f.request.manualInputs.reactionContributors[0].overrides={reactionBonus:0};assert.equal(indirect(f).breakdown.reaction.contributors[1].reactionBonus,20);
 target.combatState.onField=true;assert.equal(indirect(f).breakdown.reaction.contributors[1].elementalMastery,1099);
});

test('Baizhu existing A4 does not leak its Bloom/Quicken/Lunar Bloom support to the three indirect reactions',()=>{
 const f=fixture(),target=support(2,'10000032'),baizhu=support(3,'10000082');f.request.party.members=[f.request.party.members[0],target,baizhu];f.request.manualInputs.reactionContributors=[bound(f,target)];group(f,baizhu,'baizhu_verdant_favor','active');
 for(const reaction of ['stellarSwirl','lunarCharged','lunarCrystallize']) assert.equal(indirect(f,reaction).breakdown.reaction.contributors[1].reactionBonus,0);
});

test('Vodyanitsa Chorus is recipient-local, mutually switches buckets, and uses provider updated HP',()=>{
 const f=fixture();f.sandbox.GenshinCalcData.applyProvisional71Data(f.calcData,[require('../../games/genshin/data/v2/version-transitions/7.0-to-7.1/vodyanitsa-currentcalc.json')]);
 const target=support(2,'10000032'),vody=support(3,'10000140',{hp:50500});vody.constellation=4;
 f.request.party.members=[f.request.party.members[0],target,vody];f.request.manualInputs.reactionContributors=[bound(f,target)];
 for(const [field,value] of Object.entries({skill:'active',heals:'3',qualifyingHeals:'3',meteor:'generated',recipient:'active'})) f.request.party.conditionStates[`party:3:10000140:actions:${field}`]={option:value};
 let c=indirect(f).breakdown.reaction.contributors[1];assert.equal(c.additiveBaseDamage,4290);assert.equal(c.modifierScopes.sharedParty.additiveBaseDamage,0);
 const hp=c.additiveBaseDamage;target.combatState.onField=true;c=indirect(f).breakdown.reaction.contributors[1];assert.equal(c.additiveBaseDamage,hp);
 f.request.party.conditionStates['party:3:10000140:actions:meteor']={option:'none'};assert.equal(indirect(f).breakdown.reaction.contributors[1].additiveBaseDamage,0);
 f.request.party.conditionStates['party:3:10000140:actions:meteor']={option:'generated'};f.request.manualInputs.reactionContributors[0].overrides={additiveBaseDamage:100};assert.equal(indirect(f).breakdown.reaction.contributors[1].additiveBaseDamage,100);
});

test('wearer and other-provider non-stackable artifact effects reuse the same maximum rule',()=>{
 const f=fixture();
 const target=support(2,'10000032'),provider=support(3,'10000043');
 f.request.party.members=[f.request.party.members[0],target,provider];f.request.manualInputs.reactionContributors=[bound(f,target)];
 for(const member of [target,provider]) {
  member.equipment={artifactSetIds:['15048'],artifactSetMode:'4pc'};
  (f.calcData.artifactSetModifiers['15048'].fourPiece || []).forEach((raw,i)=>{const m=f.engine.normalizeArtifactModifier(raw,'artifact4:15048',f.request);const key=f.sandbox.GenshinPartyModifiers.candidateToggleKey(member,'artifact','4:15048',m,f.sandbox.GenshinPartyModifiers.candidateKey(member,'artifact','4:15048',m,i));member.buffStates[key]=true;});
 }
 assert.equal(indirect(f).breakdown.reaction.contributors[1].reactionBonus,50);
 f.request.party.members.pop();assert.equal(indirect(f).breakdown.reaction.contributors[1].reactionBonus,50);
});
