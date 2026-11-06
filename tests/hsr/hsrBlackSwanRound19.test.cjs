"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const runtime = require("../../games/js/hsrModifierRuntime.js");
const { fixedSourceSha, loadProductionFixture, makeRequest, independentDirectDamage, assertClose } = require("./helpers/hsrDirectVerification.cjs");
const records = require("../../games/hsr/data/calc/modifiers-black-swan-round19.json").modifiers;
const values = [15,16,17,18,19,20,21.25,22.5,23.75,25];
const defenseValues = [14.8,15.4,16,16.6,17.2,17.8,18.55,19.3,20.05,20.8];
const profile = {atk:3587.25,hp:7421.5,def:1198.75,baseAtk:991.5,baseHp:1400.25,baseDef:1100.75,critRate:37.5,critDamage:121.75,damageBonus:27.75,enemyCount:1,enemyLevel:83,resistance:25,resistancePenetration:6.25,defenseReduction:12.5,defenseIgnore:7.5,takenDamage:11.5,toughnessActive:true,weakness:false};
function context(recipientVersion,level,characterId="1002",partyIds=["1307"]){return {characterId,eidolon:0,partyIds,partyEidolons:{"1307":0},enhancementState:recipientVersion,traceLevelFor:source=>source.id==="1307"&&(source.skillId==="130703"||source.skillId==="130702")?level:10};}
function candidateFor(record,ctx,inputs,attack){const candidate=runtime.buildCandidates([record],ctx,inputs)[0];return candidate&&{...candidate,applicable:runtime.applicableToAttack(candidate,attack)};}
function attackOf(type){return {id:"party-hit-"+type,name:"party snapshot",type,target:"single",element:"Wind",scalingStat:"atk",damageFormula:"statMultiplier",hitCount:1,multipliers:[100],canCrit:type!=="dot",maximumEidolon:0,enemyCountExact:1};}
test("Black Swan Epiphany party snapshot uses one explicit effective-state input independent of recipient version",async()=>{
 assert.equal(fixedSourceSha,"dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
 assert.equal(records.length,2);
 const defenseRecord=records.find(item=>item.id==="trace:1307:130702:party-defense-reduction");
 assert.ok(defenseRecord);
 assert.deepEqual(defenseRecord.value.values,defenseValues);
 assert.equal(defenseRecord.source.skillId,"130702");
 assert.match(defenseRecord.provenance.sourceFile,/130702.*1130702/);
 assert.equal(defenseRecord.activation.inputKey,"black-swan-skill-def-active");
 assert.equal(defenseRecord.target.owner,"enemySingle");
 assert.deepEqual(defenseRecord.target.attackTypes,["all"]);
 const record=records.find(item=>item.id==="trace:1307:130703:party-epiphany");
 assert.equal(record.id,"trace:1307:130703:party-epiphany");
 assert.deepEqual(record.value.values,values);
 assert.equal(record.source.skillId,"130703");
 assert.match(record.provenance.sourceFile,/130703.*1130703/);
 assert.equal(record.activation.inputKey,"black-swan-epiphany-active");
 assert.equal(record.activation.requiredToggleKey,undefined);
 assert.match(record.activation.inputLabel,/通常版は対象自身のターン中/);
 assert.equal(record.variant,undefined,"do not infer the provider's version from the recipient selector");
 assert.equal(record.inputValidation.maximumEidolon,0);
 assert.equal(record.target.owner,"enemySingle");assert.deepEqual(record.target.attackTypes,["all"]);
 assert.deepEqual(record.stacking,{group:"trace:1307:party-epiphany",rule:"nonStacking"});
 const {data,engine}=await loadProductionFixture();
 assert.ok(data.structuredModifiers.some(item=>item.id===record.id),"production loader registers party Epiphany");
 assert.ok(data.structuredModifiers.some(item=>item.id===defenseRecord.id),"production loader registers party skill DEF reduction");
 assert.equal(runtime.buildCandidates([record],context("enhanced",10,"1307",[]),{"black-swan-epiphany-active":true}).length,0,"the main Black Swan uses the self-scoped effect, not its party copy");
 for(const recipientVersion of ["previous","enhanced"]) for(const level of [1,5,10]) for(const type of ["normal","skill","ultimate","dot"]){
  const attack=attackOf(type); const base=makeRequest(attack,1,profile); base.attack={...base.attack,traceLevel:1,multiplier:100,hitCount:1};
  const candidate=candidateFor(record,context(recipientVersion,level),{"black-swan-epiphany-active":true},base.attack);
  assert.ok(candidate);assert.equal(candidate.enabled,true);assert.equal(candidate.applicable,true);assertClose(candidate.value,values[level-1],recipientVersion+" recipient Lv"+level);
  const input={...base,modifiers:[candidate]};const actual=engine.calculate(input);assert.notEqual(actual.supported,false,actual.reason);
  const oracle=independentDirectDamage(input);for(const key of ["nonCrit","crit","expected"])assertClose(actual[key],oracle[key],recipientVersion+" "+type+" "+key);
  assertClose(actual.breakdown.takenDamage,profile.takenDamage+values[level-1],recipientVersion+" enemy vulnerability");
  const inactive=candidateFor(record,context(recipientVersion,level),{"black-swan-epiphany-active":false},base.attack);
  assert.equal(inactive.enabled,false,"toggle off means the complete effective-state condition is false");
 }
 for(const recipientVersion of ["previous","enhanced"]) for(const level of [1,5,10]) for(const type of ["normal","skill","ultimate","dot"]){
  const attack=attackOf(type);const base=makeRequest(attack,1,profile);base.attack={...base.attack,traceLevel:1,multiplier:100,hitCount:1};
  const candidate=candidateFor(defenseRecord,context(recipientVersion,level),{"black-swan-skill-def-active":true},base.attack);
  assert.ok(candidate);assert.equal(candidate.enabled,true);assert.equal(candidate.applicable,true);assertClose(candidate.value,defenseValues[level-1],"Skill DEF Lv"+level);
  const input={...base,modifiers:[candidate]};const actual=engine.calculate(input);assert.notEqual(actual.supported,false,actual.reason);
  const oracle=independentDirectDamage(input);for(const key of ["nonCrit","crit","expected"])assertClose(actual[key],oracle[key],recipientVersion+" "+type+" DEF "+key);
  assertClose(actual.breakdown.defenseReductionPercent,profile.defenseReduction+defenseValues[level-1],recipientVersion+" skill DEF");
  const off=candidateFor(defenseRecord,context(recipientVersion,level),{"black-swan-skill-def-active":false},base.attack);assert.equal(off.enabled,false,"skill DEF toggle off");
 }
});
