'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadProductionFixture,runtime,makeRequest,assertClose,fixedSourceSha}=require('./helpers/hsrDirectVerification.cjs');
const rows=require('../../games/hsr/data/calc/modifiers-native-round7.json').modifiers;
const get=id=>rows.find(x=>x.id===id),atk={id:'r7-native-hit',type:'normal',element:'Fire',scalingStat:'atk',multipliers:[100]};
function context(id,extra={}){return{characterId:id,eidolon:0,stats:{atk:3000,critRate:50,critDamage:100,speed:115},baseStats:{atk:1000,speed:100},...extra};}
function mods(records,ctx,inputs={},attack=atk){return runtime.buildCandidates(records,ctx,inputs).map(x=>({...x,applicable:x.applicable&&runtime.applicableToAttack(x,attack)}));}
const request=(modifiers,config={})=>makeRequest(atk,1,config,modifiers);

test('round7 native records are fixed-source production definitions with separate final-inclusion guards',async()=>{
 const {data}=await loadProductionFixture();assert.equal(rows.length,9);
 for(const row of rows){assert.equal(data.structuredModifiers.filter(x=>x.id===row.id).length,1);assert.equal(row.provenance.sourceCommit,fixedSourceSha);assert.equal(row.support.status,'calculable');assert.ok(row.finalStatsInclusion.inputKey);assert.notEqual(row.providerScope,'both','use the existing omitted scope for self and party');}
});

test('native enemy-HP eidolons auto-check exact boundaries without assuming missing HP',async()=>{
 const {engine}=await loadProductionFixture();
 for(const[id,char,rank,values,expected]of [['eidolon:1003:2:low-enemy-hp-damage','1003',2,[[49.99,true],[50,true],[50.01,false]],1863],['eidolon:1002:1:high-enemy-hp-crit-rate','1002',1,[[49.99,false],[50,true],[50.01,true]],1749.6]]){
  const row=get(id);for(const[hp,on]of values){const c=mods([row],context(char,{eidolon:rank,enemy:{hpPercent:hp}}));assert.equal(c[0].automatic,true);assert.equal(c[0].enabled,on);assertClose(engine.calculate(request(c)).expected,on?expected:1620);}
  const unknown=mods([row],context(char,{eidolon:rank,enemy:{hpPercent:NaN}}));assert.equal(unknown[0].activation.unresolved,true);assertClose(engine.calculate(request(unknown)).expected,1620);
  assert.equal(mods([row],context(char,{eidolon:rank-1,enemy:{hpPercent:50}})).length,0);
  const included=mods([row],context(char,{eidolon:rank,enemy:{hpPercent:50}}),{[row.finalStatsInclusion.inputKey]:true});assert.equal(included[0].enabled,false);
 }
});

test('Dan Heng Afterimage feeds the existing effective SPD threshold once and only in the selected state',async()=>{
 const {data,engine}=await loadProductionFixture(),row=get('traceNode:1002:1002102:post-attack-speed'),gl=data.structuredModifiers.find(x=>x.id==='ornament:311:2pc:speed-damage'),ctx=context('1002',{ornamentId:'311'});
 const off=mods([row,gl],ctx),on=mods([row,gl],ctx,{[row.activation.inputKey]:true});assert.equal(on[1].thresholdReferenceValue,135);assert.equal(off[1].enabled,false);assert.equal(on[1].value,12);
 const input=request(on);input.character.baseStats.speed=100;input.character.stats.speed=115;assertClose(engine.calculate(input).nonCrit,1209.6);
 const included=mods([row,gl],ctx,{[row.activation.inputKey]:true,[row.finalStatsInclusion.inputKey]:true});assert.equal(included[1].enabled,false);
 assert.equal(mods([row],context('1003'),{[row.activation.inputKey]:true}).length,0);
});

test('Ratio Induction uses actual accumulated layers and independently adds CR and CD',async()=>{
 const {engine}=await loadProductionFixture(),pair=rows.filter(x=>x.source.id==='1305'),ctx=context('1305');
 for(const stacks of[0,1,6]){const c=mods(pair,ctx,{'ratio-induction-stacks':stacks}),r=engine.calculate(request(c));assertClose(r.nonCrit,1080);assertClose(r.expected,1080*(1+(50+2.5*stacks)/100*(100+5*stacks)/100));}
 const saved=JSON.parse(JSON.stringify({'ratio-induction-stacks':6}));assertClose(engine.calculate(request(mods(pair,ctx,saved))).expected,1992.6);
 for(const invalid of[-1,1.5,7,NaN])assert.ok(mods(pair,ctx,{'ratio-induction-stacks':invalid}).every(x=>!x.applicable||!x.enabled));
 assert.ok(mods(pair,context('1305',{eidolon:1}),saved).every(x=>!x.applicable||!x.enabled),'E1 initial layers and cap are not silently E0');
});

test('Jade shares current Pawned Asset layers for ATK and Talent CD at every accepted level',async()=>{
 const {engine}=await loadProductionFixture(),pair=rows.filter(x=>x.source.id==='1314'),values=[1.2,1.32,1.44,1.56,1.68,1.8,1.95,2.1,2.25,2.4];
 for(let level=1;level<=10;level++)for(const stacks of[0,1,49,50]){const ctx=context('1314',{traceLevelFor:()=>level}),c=mods(pair,ctx,{'jade-pawned-asset-stacks':stacks}),r=engine.calculate(request(c)),base=(3000+1000*.005*stacks)*.36;assertClose(r.nonCrit,base);assertClose(r.expected,base*(1+.5*(100+values[level-1]*stacks)/100));}
 for(const row of pair){const c=mods([row],context('1314',{traceLevelFor:()=>10}),{'jade-pawned-asset-stacks':50,[row.finalStatsInclusion.inputKey]:true});assert.equal(c[0].enabled,false);}
 const both=mods(pair,context('1314',{traceLevelFor:()=>10}),{'jade-pawned-asset-stacks':50});assertClose(engine.calculate(request(both)).expected,2457);
});

test('Himeko technique is a pre-existing enemy Fire vulnerability from self or party and never other elements',async()=>{
 const {engine}=await loadProductionFixture(),row=get('trace:1003:100307:technique-fire-vulnerability'),inputs={[row.activation.inputKey]:true};
 for(const ctx of[context('1003'),context('1002',{partyIds:['1003']})]){assertClose(engine.calculate(request(mods([row],ctx,inputs))).nonCrit,1188);const nonFire={...atk,element:'Wind'};assert.equal(mods([row],ctx,inputs,nonFire)[0].applicable,false);assertClose(engine.calculate(request(mods([row],ctx))).nonCrit,1080);}
 assert.equal(mods([row],context('1002',{partyIds:[]}),inputs).length,0);
});

test('Acheron Nihility counts are automatic, source-independent multipliers and do not become additive damage bonus',async()=>{
 const {engine}=await loadProductionFixture(),row=get('traceNode:1308:1308102:nihility-independent-multiplier');
 for(const [partyIds,paths,multiplier]of [[[],{},1],[['1004'],{'1004':'Warlock'},1.15],[['1004','1108'],{'1004':'Warlock','1108':'Warlock'},1.6],[['1002'],{'1002':'Rogue'},1]]){
  const ctx=context('1308',{partyIds,partyPaths:{'1308':'Warlock',...paths}}),c=mods([row],ctx);assert.equal(c[0].automatic,true);const r=engine.calculate(request(c,{damageBonus:40}));assertClose(r.nonCrit,1080*1.4*multiplier);assertClose(r.expected,1620*1.4*multiplier);
  if(multiplier>1){const included=mods([row],ctx,{[row.finalStatsInclusion.inputKey]:true});assertClose(engine.calculate(request(included,{damageBonus:40})).nonCrit,1080*1.4);}
 }
 const unknown=mods([row],context('1308',{partyIds:['1004'],partyPaths:{'1308':'Warlock'}}));assert.equal(unknown[0].activation.unresolved,true);assert.equal(unknown[0].enabled,false);
});

test('new snapshot and party references keep unresolved state consistent across threshold modes',()=>{
 const base=get('eidolon:1003:2:low-enemy-hp-damage');
 for(const reference of ['self.preCombatCritDamage','self.maxEnergy','self.preCombatMaxEnergy','party.fieldCount','party.samePathAllyCount','party.nihilityAllyCount'])for(const mode of ['statThreshold','toggleThreshold']){
  const row={...base,source:{kind:'manual',id:'snapshot-test'},activation:{mode,reference,operator:'>=',threshold:1,...(mode==='toggleThreshold'?{inputKey:'snapshot-test-on',default:false}:{})}};
  const item=runtime.buildCandidates([row],{characterId:'unknown',partyIds:['other']},{'snapshot-test-on':true})[0];assert.equal(item.activation.unresolved,true,reference+' '+mode);assert.equal(item.enabled,false,'only the unresolved effect is excluded');
 }
});

test('static modifier validation rejects invented providerScope values',()=>{
 const {validateModifiers}=require('../../scripts/validateHsrModifiers.cjs');assert.ok(validateModifiers([{...rows[0],providerScope:'both'}]).some(x=>x.includes('providerScope')));
});
