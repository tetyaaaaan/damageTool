"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const{runtime,loadProductionFixture,assertClose}=require('./helpers/hsrDirectVerification.cjs');
test('unknown HP and EP stay local and can be resolved without changing unrelated modifiers',async()=>{
 const{data}=await loadProductionFixture();
 for(const[id,ref,boundary]of [['lightCone:20016:low-hp-crit-rate','self.hpPercent',80],['lightCone:20003:low-hp-extra-def','self.hpPercent',50],['lightCone:20009:high-hp-damage','enemy.hpPercent',50],['lightCone:21017:normal-skill-full-energy-extra','self.epPercent',100]]){
  const rec=data.structuredModifiers.find(m=>m.id===id);assert.ok(rec);
  for(const value of [undefined,NaN,null,-1,101]){
   const ctx={characterId:'1107',lightConeId:rec.source.id,stats:{hpPercent:ref.startsWith('self')?value:70},enemy:{hpPercent:ref.startsWith('enemy')?value:70}};
   const inputs=ref==='self.epPercent'&&value!==undefined?{[rec.activation.inputKey]:value}:{};
   const c=runtime.buildCandidates([rec],ctx,inputs)[0];assert.equal(c.enabled,false,id+' unknown '+value);assert.equal(c.activation.unresolved,true,id+' unresolved '+value);
  }
  const ctx={characterId:'1107',lightConeId:rec.source.id,stats:{hpPercent:boundary-1},enemy:{hpPercent:boundary+1}};const c=runtime.buildCandidates([rec],ctx,ref==='self.epPercent'?{[rec.activation.inputKey]:100}:{})[0];assert.equal(c.enabled,true,id+' known condition');assert.equal(c.activation.unresolved,false);
 }
});
test('Iron Cavalry uses one pass of independent Watchmaker BE at 150/250 and reverses on removal',async()=>{
 const{data,engine}=await loadProductionFixture();const records=data.structuredModifiers.filter(m=>m.source.kind==='relic'&&['119','118'].includes(m.source.id)),watch=records.find(m=>m.source.id==='118');
 for(const[raw,threshold,active]of [[119.99,150,false],[120,150,true],[120.01,150,true],[219.99,250,false],[220,250,true],[220.01,250,true]]){
  const type=threshold===150?'break':'superBreak',attack={type,element:'Fire'},ctx={characterId:'1003',relicIds:['119'],relicMode:4,stats:{breakEffect:raw},partyIds:['1313'],partyEquipment:[{characterId:'1313',relicIds:['118'],relicMode:4}],attack};
  const mods=runtime.buildCandidates(records,ctx,{[watch.activation.inputKey]:true});const effect=mods.find(m=>m.activation.threshold===threshold);assertClose(effect.thresholdReferenceValue,raw+30,'one pass reference');assert.equal(effect.enabled,active);
  const off=runtime.buildCandidates(records,ctx,{});assert.equal(off.find(m=>m.id===effect.id).enabled,false,'OFF undo');
  const included=runtime.buildCandidates(records,{...ctx,stats:{breakEffect:raw+30}},{[watch.activation.inputKey]:true,[watch.finalStatsInclusion.inputKey]:true});assertClose(included.find(m=>m.id===effect.id).thresholdReferenceValue,raw+30,'already included once');
  const removed=runtime.buildCandidates(records,{...ctx,partyEquipment:[]},{[watch.activation.inputKey]:true});assert.equal(removed.find(m=>m.id===effect.id).enabled,false,'provider equipment removed');
  if(raw===220){const value=engine.calculateSuperBreak({character:{level:80,stats:{breakEffect:raw}},enemy:{level:80,toughnessActive:false,resistance:20},attack:{...attack,toughnessDamage:30,superBreakMultiplier:100},breakBaseDamage:{80:3767.5533},modifiers:mods.map(m=>({...m,applicable:m.applicable&&runtime.applicableToAttack(m,attack)}))});assertClose(value.value,3767.5533*3*3.5*.8/1.75,'BE250, DEF ignore25%, independent SB');}
 }
});
