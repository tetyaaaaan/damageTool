"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {loadProductionFixture,makeRequest,assertClose,runtime}=require('./helpers/hsrDirectVerification.cjs');
const owners=['1209','1204','1107','1005','1004','1207','1109','1108','1106','1103','1013','1009','1211','1110','1313','1305','1203','1208','1104','1301','1221','1001','1003'];
const context=id=>({characterId:id,enhancementState:'enhanced',eidolon:0,stats:{atk:3000,hp:6000,def:3000,critRate:65,critDamage:150,effectHitRate:80},traceLevelFor:()=>10});
test('included final-stat effects stay inert for audited and already-confirmed characters',async()=>{
 const {data,engine}=await loadProductionFixture();
 for(const id of owners){const records=data.structuredModifiers.filter(m=>m.source.id===id),candidates=runtime.buildCandidates(records,context(id),{}),included=candidates.filter(m=>m.inputPolicy==='includedInFinalStats');for(const m of included){assert.equal(m.enabled,false,id+' '+m.id);assert.equal(m.displayOnly,true,id+' final-stat display only');}
 const a=data.attacks.find(a=>a.characterId===id&&a.type==='normal'&&!a.requiredEidolon&&(!a.variant||a.variant==='enhanced'));assert.ok(a,id+' representative Basic');const level=Math.min(6,a.multipliers.length),input=makeRequest(a,level,{atk:3000,hp:6000,def:3000,critRate:65,critDamage:150});const base=engine.calculate(input),r=engine.calculate({...input,modifiers:included});for(const k of ['nonCrit','crit','expected'])assertClose(r[k],base[k],id+' '+k+' final stats not re-added');
 }
});
test('Welt and Kafka self conversions do not rebuild final ATK; Kafka external support uses target EHR',async()=>{
 const {data,engine}=await loadProductionFixture();
 for(const[id,modId]of [['1004','traceNode:1004:11004103:effect-hit-atk'],['1005','traceNode:1005:11005101:effect-hit-atk:self']]){const a=data.attacks.find(a=>a.characterId===id&&a.type==='normal'&&a.variant==='enhanced');const m=runtime.buildCandidates(data.structuredModifiers,context(id),{}).find(m=>m.id===modId);assert.ok(m?.displayOnly);const input=makeRequest(a,6,{atk:3000,baseAtk:1000});const base=engine.calculate(input),r=engine.calculate({...input,modifiers:[m]});assertClose(r.breakdown.referenceValue,3000,id+' completed ATK');assertClose(r.nonCrit,base.nonCrit,id+' no conversion re-add');}
 const partyId='traceNode:1005:11005101:effect-hit-atk';
 const candidate=(ehr,partyIds=['1005'])=>runtime.buildCandidates(data.structuredModifiers,{...context('1003'),partyIds,stats:{effectHitRate:ehr},partyStats:{'1005':{effectHitRate:0}}},{}).find(m=>m.id===partyId);
 assert.equal(candidate(75).enabled,true);assert.equal(candidate(74).enabled,false);assert.equal(candidate(75,[]),undefined);assert.equal(runtime.buildCandidates(data.structuredModifiers,context('1005'),{}).some(m=>m.id===partyId),false);
 const a=data.attacks.find(a=>a.id==='100301'),input=makeRequest(a,6,{atk:3000,baseAtk:1000});const r=engine.calculate({...input,modifiers:[candidate(75)]});assertClose(r.breakdown.referenceValue,4000,'external party ATK');assertClose(r.nonCrit,1440,'external Kafka support preserved');assertClose(engine.calculate({...input,modifiers:[candidate(74)]}).nonCrit,1080,'threshold OFF');
});
test('Hook permanent ATK summary includes all five fixed-source nodes and remains display only',async()=>{
 const {data}=await loadProductionFixture();const c=data.characters.find(c=>c.id==='1109'),nodes=[['1109201',.04],['1109203',.04],['1109205',.06],['1109207',.06],['1109210',.08]];
 for(const[id,value]of nodes){const node=c.traces.find(t=>t.id===id);assert.ok(node,id);const prop=node.levels[0].properties.find(p=>p.type==='AttackAddedRatio');assertClose(prop.value,value,id+' pinned node');}
 const record=data.structuredModifiers.find(m=>m.id==='traceStats:1109:attack');assert.equal(record.value.fixed,28);assert.equal(record.inputPolicy,'includedInFinalStats');assert.equal(record.support.status,'displayOnly');
});
