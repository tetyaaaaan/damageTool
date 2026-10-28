const test=require('node:test'),assert=require('node:assert/strict');
const {runtime,loadProductionFixture,makeRequest,assertClose}=require('./helpers/hsrDirectVerification.cjs');
const atk={id:'evaluation-normal',type:'normal',element:'Fire',scalingStat:'atk',multipliers:[100],canCrit:true};
const eligible=(items,attack=atk)=>items.map(m=>({...m,applicable:m.applicable&&runtime.applicableToAttack(m,attack)}));
test('Robin Talent is automatic, excludes included final CD, respects legacy saves and disappears with provider',async()=>{
 const{data,engine}=await loadProductionFixture();const records=data.structuredModifiers.filter(m=>m.id==='trace:1309:130904:party-crit-damage');
 const ctx={characterId:'1003',partyIds:['1309'],partyEidolons:{1309:0},traceLevelFor:()=>10,stats:{critDamage:100}};
 const build=i=>runtime.buildCandidates(records,ctx,i);
 assert.equal(build({})[0].automatic,true);assert.equal(build({})[0].enabled,true);assert.equal(build({})[0].value,20);
 const out=engine.calculate(makeRequest(atk,1,{},eligible(build({}))));assertClose(out.nonCrit,1080,'base');assertClose(out.crit,2376,'automatic CD');assertClose(out.expected,1728,'automatic expected');
 const included=build({'robin-talent-crit-in-final-stats':true});assert.equal(included[0].enabled,false);
 const same=engine.calculate(makeRequest(atk,1,{critDamage:120},eligible(included)));assertClose(same.expected,out.expected,'same final CD once');
 assert.equal(build({'robin-talent-crit-active':false})[0].enabled,false,'legacy explicit OFF remains excluded');
 assert.equal(build({'robin-talent-crit-active':false,'robin-talent-crit-in-final-stats':false})[0].enabled,true,'explicit new inclusion supersedes legacy');
 assert.equal(runtime.buildCandidates(records,{...ctx,partyIds:[]},{}).length,0);
});
test('Arena and Salsotto use independent Sunday CR at below/equal/above thresholds and undo support',async()=>{
 const{data,engine}=await loadProductionFixture();
 for(const [oid,threshold,type,bonus] of [['309',70,'normal',20],['306',50,'ultimate',15]]){
 const records=data.structuredModifiers.filter(m=>m.id==='trace:1313:131304:party-crit-rate'||m.id===`ornament:${oid}:2pc:${oid==='309'?'normal-skill-damage':'ultimate-followup-damage'}`);
 for(const delta of [-0.01,0,0.01]){
  const raw=threshold-20+delta,attack={...atk,type};const ctx={characterId:'1003',partyIds:['1313'],partyEidolons:{1313:0},ornamentId:oid,traceLevelFor:()=>10,stats:{critRate:raw},attack};
  const on=runtime.buildCandidates(records,ctx,{'sunday-talent-crit-active':true});const effect=on.find(m=>m.source.kind==='ornament');assertClose(effect.thresholdReferenceValue,raw+20,'resolved CR');assert.equal(effect.enabled,delta>=0);
  const result=engine.calculate(makeRequest(attack,1,{critRate:raw},eligible(on,attack)));const nc=1080*(delta>=0?1+bonus/100:1);assertClose(result.nonCrit,nc,'literal threshold damage');assertClose(result.expected,nc*(1+(raw+20)/100),'literal expected');
  const off=runtime.buildCandidates(records,ctx,{});assert.equal(off.find(m=>m.source.kind==='ornament').enabled,false,'support removal reverses threshold');
  const included=runtime.buildCandidates(records,{...ctx,stats:{critRate:raw+20}},{});assert.equal(included.find(m=>m.source.kind==='ornament').enabled,delta>=0,'final CR contains support only once');
 }
 }
});
test('one-pass thresholds isolate same-stat cycles, attack-only CR and missing speed bases',async()=>{
 const{data}=await loadProductionFixture();const arena=data.structuredModifiers.find(m=>m.id==='ornament:309:2pc:normal-skill-damage');
 const make=(id,category,stat,value,extra={})=>({id,source:{kind:'trace',id:'1003'},category,stat,value:{kind:'fixed',fixed:value},target:{owner:'self',attackTypes:['all'],elements:[]},activation:{mode:'always'},inputPolicy:'conditional',support:{status:'calculable',verified:true},...extra});
 const only=make('normal-only','critRate','critRate',100,{target:{owner:'self',attackTypes:['normal'],elements:[]}});
 assert.equal(runtime.buildCandidates([arena,only],{characterId:'1003',ornamentId:'309',stats:{critRate:60},attack:atk},{}).find(m=>m.id===arena.id).enabled,false,'attack-specific crit is not a global panel stat');
 const cycle=make('cycle','statFlat','speed',10,{activation:{mode:'statThreshold',statSource:'effective',reference:'self.speed',operator:'>=',threshold:100}});
 const other=make('unrelated','damageBonus',null,10);let c=runtime.buildCandidates([cycle,other],{characterId:'1003',stats:{speed:110}},{});assert.equal(c[0].applicable,false);assert.equal(c[1].enabled,true);
 const glamoth=data.structuredModifiers.find(m=>m.id==='ornament:311:2pc:speed-damage');const speed=make('speed-support','statPercent','speed',12);
 c=runtime.buildCandidates([glamoth,speed],{characterId:'1003',ornamentId:'311',stats:{speed:150},baseStats:{speed:100}},{});assertClose(c[0].thresholdReferenceValue,162,'speed percent uses base');assert.equal(c[0].value,18);
 c=runtime.buildCandidates([glamoth,other],{characterId:'1003',ornamentId:'311',stats:{speed:NaN}},{});assert.equal(c[0].applicable,false,'unknown threshold stat cannot be zero-filled');assert.equal(c[1].enabled,true);
 c=runtime.buildCandidates([glamoth,speed],{characterId:'1003',ornamentId:'311',stats:{speed:150}},{});assert.equal(c[0].applicable,false,'unknown base cannot silently decide threshold');
});
