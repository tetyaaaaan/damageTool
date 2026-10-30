'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {runtime,loadProductionFixture,makeRequest,assertClose}=require('./helpers/hsrDirectVerification.cjs');
const rows=require('../../games/hsr/data/calc/modifiers-equipment-round9.json').modifiers;
const speed=rows[0],cd=rows[1];
const context=(id,rank,stats={},extra={})=>({characterId:'1003',lightConeId:id,refinement:rank,stats:{atk:3000,hp:6000,critRate:50,critDamage:100,breakEffect:150,speed:148,...stats},baseStats:{atk:1000,hp:1000,speed:100},...extra});
const build=(records,ctx,inputs={})=>runtime.buildCandidates(records,ctx,inputs);
const find=(items,id)=>items.find(m=>m.id===id);
const request=(attack,mods)=>makeRequest(attack,10,{},mods.map(m=>({...m,applicable:m.applicable!==false&&runtime.applicableToAttack(m,attack)})));
const attack=(type='normal')=>({id:'round9-'+type,type,element:'Fire',scalingStat:'atk',multipliers:Array(10).fill(100),canCrit:true});
test('priority cone two rows use all exact S1-S5 tables, automatic boundaries and final exclusion',async()=>{
 const{data}=await loadProductionFixture();assert.deepEqual(speed.value.values,[12,14,16,18,20]);assert.deepEqual(cd.value.values,[12,14,16,18,20]);
 for(const row of rows){assert.ok(data.structuredModifiers.find(m=>m.id===row.id));for(let rank=1;rank<=5;rank++){
  for(const be of [149.99,150,150.01]){const item=build([speed],context('23027',rank,{breakEffect:be}))[0];assert.equal(item.enabled,be>=150);assert.equal(item.automatic,true);assert.equal(item.value,10+2*rank);}
  for(const value of [119.99,120,120.01,139.99,140,159.99,160,180,200,240]){const item=build([cd],context('23028',rank,{critDamage:value}))[0];assertClose(item.value,Math.min(4,Math.floor(Math.max(0,value-120)/20))*(10+2*rank));assert.equal(runtime.applicableToAttack(item,attack('normal')),false);}
  const ctx=context(row.source.id,rank,{critDamage:200});assert.equal(build([row],ctx,{[row.finalStatsInclusion.inputKey]:true})[0].enabled,false);assert.equal(build([row],{...ctx,lightConeId:''}).length,0);
 }}
});
test('23027 BE support updates SPD thresholds and removal reverses independent damage',async()=>{
 const{data,engine}=await loadProductionFixture(),glam=data.structuredModifiers.find(m=>m.id==='ornament:311:2pc:speed-damage');
 const support={id:'r9-be',source:{kind:'trace',id:'1003'},name:'BE support',category:'breakEffect',value:{kind:'fixed',fixed:20},target:{owner:'self',attackTypes:['all'],elements:[]},activation:{mode:'toggle',inputKey:'r9-be-on'},support:{status:'calculable',verified:true}};
 const ctx=context('23027',1,{breakEffect:130},{ornamentId:'311'}),records=[speed,glam,support];
 const on=build(records,ctx,{'r9-be-on':true});assertClose(find(on,speed.id).thresholdReferenceValue,150);assertClose(find(on,glam.id).thresholdReferenceValue,160);assertClose(find(on,glam.id).value,18);
 const result=engine.calculate(request(attack(),on));assertClose(result.nonCrit,1080*1.18);assertClose(result.expected,1620*1.18);
 const off=build(records,ctx,{});assert.equal(find(off,speed.id).enabled,false);assertClose(find(off,glam.id).thresholdReferenceValue,148);assertClose(engine.calculate(request(attack(),off)).nonCrit,1080*1.12);
 const included=build(records,{...ctx,stats:{...ctx.stats,speed:160}}, {'r9-be-on':true,[speed.finalStatsInclusion.inputKey]:true});assertClose(find(included,glam.id).thresholdReferenceValue,160);
});
test('23027 explicit dependency handles Talia before/after SPD and isolates a feedback cycle',async()=>{
 const{data}=await loadProductionFixture(),talia=data.structuredModifiers.find(m=>m.id==='ornament:307:2pc:break-effect-effective-speed'),iron=data.structuredModifiers.filter(m=>m.source.kind==='relic'&&m.source.id==='119');
 const ctx=context('23027',1,{breakEffect:230,speed:140},{ornamentId:'307',relicIds:['119'],relicMode:4}),rows=[speed,talia,...iron];let out=build(rows,ctx);assertClose(find(out,talia.id).thresholdReferenceValue,152);assert.equal(find(out,talia.id).enabled,true);assert.ok(out.filter(m=>iron.some(r=>r.id===m.id)).every(m=>m.enabled));
 out=build(rows,{...ctx,stats:{...ctx.stats,breakEffect:130,speed:145}});assert.equal(find(out,speed.id).enabled,true,'Talia was already active before cone SPD');assertClose(find(out,speed.id).thresholdReferenceValue,150);
 const unrelated={id:'unrelated',source:{kind:'trace',id:'1003'},category:'damageBonus',value:{kind:'fixed',fixed:10},activation:{mode:'always'},target:{owner:'self',attackTypes:['all'],elements:[]},support:{status:'calculable',verified:true}};
 out=build([...rows,unrelated],{...ctx,stats:{...ctx.stats,breakEffect:130,speed:140}});assert.equal(find(out,speed.id).enabled,false);assert.equal(find(out,speed.id).activation.unresolved,true);assert.equal(find(out,unrelated.id).enabled,true);assert.equal(find(out,talia.id).enabled,false);
});
test('23028 uses independent Robin and roster CD once, and follows provider removal',async()=>{
 const{data,engine}=await loadProductionFixture(),robin=data.structuredModifiers.find(m=>m.id==='trace:1309:130904:party-crit-damage'),herta=data.structuredModifiers.find(m=>m.id==='traceNode:1401:1401102:party-crit-damage');
 for(let rank=1;rank<=5;rank++)for(const raw of [100,119.99,120,139.99,140,180]){
  const ctx=context('23028',rank,{critDamage:raw},{partyIds:['1309'],partyEidolons:{1309:0},traceLevelFor:()=>10});let out=build([cd,robin],ctx);const bonus=Math.min(4,Math.floor(Math.max(0,raw+20-120)/20))*(10+2*rank);assertClose(find(out,cd.id).thresholdReferenceValue,raw+20);assertClose(find(out,cd.id).value,bonus);
  const req=request(attack('followUp'),out);req.character.stats.critDamage=raw;const result=engine.calculate(req);assertClose(result.nonCrit,1080*(1+bonus/100));assertClose(result.expected,result.nonCrit*(1+.5*(raw+20)/100));
  out=build([cd,robin],{...ctx,partyIds:[]});assertClose(find(out,cd.id).thresholdReferenceValue,raw);
 }
 const ctx=context('23028',1,{critDamage:100},{characterId:'1102',partyIds:['1401','1003'],partyPaths:{'1102':'Rogue','1401':'Mage','1003':'Mage'},partyEidolons:{'1401':0}});let out=build([cd,herta],ctx);assertClose(find(out,cd.id).thresholdReferenceValue,180);assertClose(find(out,cd.id).value,36);
 out=build([cd,herta],{...ctx,partyIds:['1401']});assertClose(find(out,cd.id).thresholdReferenceValue,100);
 const unknown=build([cd],context('23028',1,{critDamage:NaN}))[0];assert.equal(unknown.enabled,false);assert.equal(unknown.activation.unresolved,true);
});
