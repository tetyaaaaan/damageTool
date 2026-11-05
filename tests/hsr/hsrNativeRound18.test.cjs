"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const runtime = require("../../games/js/hsrModifierRuntime.js");
const { fixedSourceSha, loadProductionFixture, attackOf, makeRequest, assertClose, assertMatchesIndependent } = require("./helpers/hsrDirectVerification.cjs");
const authoredAttack = require("../../games/hsr/data/calc/attacks-native-round18.json").overrides[0];
const authoredModifier = require("../../games/hsr/data/calc/modifiers-native-round18.json").modifiers[0];
const firstLayerValues = [7.5,8.25,9,9.75,10.5,11.25,12.19,13.13,14.06,15];
const increments = [2.5,2.75,3,3.25,3.5,3.75,4.06,4.37,4.69,5];
const profile = {level:80,eidolon:0,atk:3587.25,hp:7421.5,def:1198.75,baseAtk:991.5,baseHp:1400.25,baseDef:1100.75,critRate:37.5,critDamage:121.75,damageBonus:27.75,enemyCount:1,enemyLevel:83,resistance:25,resistancePenetration:6.25,defenseReduction:12.5,defenseIgnore:7.5,takenDamage:11.5,toughnessActive:true,weakness:false};
function context(talentLevel){return {characterId:"1218",eidolon:0,traceLevelFor:source=>source.skillId==="121804"?talentLevel:10};}
test("Jiaoqiu Basic alternate snapshot accepts explicit 0-5 pre-existing Roast stacks only", async()=>{
 assert.equal(fixedSourceSha,"dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
 assert.equal(authoredAttack.id,"1218011");
 assert.deepEqual(authoredAttack.numericModifierInputs,[{inputKey:"jiaoqiu-basic-roast-stacks",label:"攻撃前の焼尽層数",minimum:0,maximum:5,integer:true}]);
 assert.equal(authoredAttack.requiredModifierIds,undefined,"0-stack state must not require an active modifier");
 assert.deepEqual(authoredModifier.target.attackIds,["1218011"],"new modifier cannot leak into the original 5-stack row");
 assert.deepEqual(authoredModifier.value.scaleValues,[250,275,300,325,350,375,406,437,469,500],"all fixed-SHA per-stack coefficients");
 assert.deepEqual(authoredModifier.value.addValues,[5,5.5,6,6.5,7,7.5,8.13,8.76,9.37,10],"all fixed-SHA first-stack offsets");
 const {data,engine}=await loadProductionFixture();
 const attackRecord=attackOf(data,"1218011");
 const modifierRecord=data.structuredModifiers.find(item=>item.id===authoredModifier.id);
 assert.ok(attackRecord,"production loader reads the new override row");
 assert.ok(modifierRecord,"production loader reads the new modifier row");
 assert.equal(engine.unsupportedAttackReason(attackRecord),"");
 for(const normalLevel of [1,3,6]) for(const talentLevel of [1,5,10]) for(const stacks of [0,1,4,5]){
  const candidate=runtime.buildCandidates([modifierRecord],context(talentLevel),{"jiaoqiu-basic-roast-stacks":stacks})[0];
  assert.ok(candidate,"candidate present at "+normalLevel+"/"+talentLevel+"/"+stacks);
  const input=makeRequest(attackRecord,normalLevel,profile);
  input.attack={...input.attack,traceLevel:normalLevel,multiplier:attackRecord.multipliers[normalLevel-1],hitCount:1};
  const applicableCandidate={...candidate,applicable:runtime.applicableToAttack(candidate,input.attack)};
  input.modifiers=[applicableCandidate];
  const result=assertMatchesIndependent(engine,input,"Jiaoqiu "+normalLevel+"/"+talentLevel+"/"+stacks);
  if(stacks===0){
   assert.equal(candidate.enabled,false,"zero stacks means no modifier");
   assert.equal(result.applied.some(x=>x.id===modifierRecord.id),false,"zero stacks are absent from applied modifiers");
  }else{
   assert.equal(candidate.enabled,true);
   assertClose(candidate.value,firstLayerValues[talentLevel-1]+(stacks-1)*increments[talentLevel-1],"layer-based value "+talentLevel+"/"+stacks);
   assert.equal(result.applied.filter(x=>x.stacking?.group==="jiaoqiu-ashen-roast-vulnerability").length,1);
  }
 }
 const missing=runtime.buildCandidates([modifierRecord],context(10),{})[0];
 assert.equal(missing.enabled,false,"unentered stacks never enable a guessed buff; the attack requires its numeric input");
 assert.equal(attackRecord.numericModifierInputs[0].default,undefined);
 const badTalent=runtime.buildCandidates([modifierRecord],context(0),{"jiaoqiu-basic-roast-stacks":1})[0];
 assert.equal(badTalent.enabled,true);
 assert.ok(badTalent.inputWarnings.some(x=>x.includes("天賦Lv")),"positive stack state stops locally without valid Talent level");
});
