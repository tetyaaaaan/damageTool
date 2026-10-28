const test=require('node:test');
const assert=require('node:assert/strict');
const {runtime,loadProductionFixture,makeRequest,independentDirectDamage,assertMatchesIndependent,assertClose}=require('./helpers/hsrDirectVerification.cjs');
const eligible=(items,attack)=>items.map(m=>({...m,applicable:m.applicable&&runtime.applicableToAttack(m,attack)}));
const attack={id:'pela-speed-threshold-normal',type:'normal',element:'Ice',scalingStat:'atk',multipliers:[100],canCrit:true};

test('Pela E2 speed activates Glamoth at exact post-support threshold and never double-adds final speed',async()=>{
 const {data,engine}=await loadProductionFixture();
 const records=data.structuredModifiers.filter(m=>['eidolon:1106:2:speed','ornament:311:2pc:speed-damage'].includes(m.id));
 assert.equal(records.length,2);
 const e2=records.find(m=>m.source.kind==='eidolon');
 assert.equal(e2.activation.mode,'toggle');
 assert.equal(e2.activation.inputKey,'pela-e2-speed-active');
 assert.equal(e2.finalStatsInclusion.inputKey,'pela-e2-speed-in-final-stats');
 for(const [baseSpeed,bonus] of [[149.99,12],[150,18],[150.01,18]]){
  const context={characterId:'1106',eidolon:2,ornamentId:'311',stats:{speed:baseSpeed,atk:3000,critRate:0,critDamage:0},baseStats:{speed:100,atk:1000}};
  const mods=runtime.buildCandidates(records,context,{'pela-e2-speed-active':true});
  const speed=mods.find(m=>m.id===e2.id),damage=mods.find(m=>m.id==='ornament:311:2pc:speed-damage');
  assert.equal(speed.enabled,true);assertClose(speed.value,10,'E2 speed percent');
  assertClose(damage.thresholdReferenceValue,baseSpeed+10,'effective speed');
  assert.equal(damage.enabled,true);
  assertClose(damage.value,bonus,'Glamoth tier');
  const request=makeRequest(attack,1,{atk:3000,baseAtk:1000,critRate:0,critDamage:0},eligible(mods,attack));
  const result=assertMatchesIndependent(engine,request,'Pela E2 speed + Glamoth '+baseSpeed);
  const base=independentDirectDamage(makeRequest(attack,1,{atk:3000,baseAtk:1000,critRate:0,critDamage:0},[]));
  assertClose(result.nonCrit/base.nonCrit,1+bonus/100,'damage tier independent');
 }
 const context={characterId:'1106',eidolon:2,ornamentId:'311',stats:{speed:150},baseStats:{speed:100}};
 let mods=runtime.buildCandidates(records,context,{});
 assert.equal(mods.find(m=>m.id===e2.id).enabled,false,'unselected action condition stays off');
 assert.equal(mods.find(m=>m.id==='ornament:311:2pc:speed-damage').value,12,'support off returns lower tier');
 mods=runtime.buildCandidates(records,{...context,eidolon:1},{'pela-e2-speed-active':true});
 assert.equal(mods.some(m=>m.id===e2.id),false,'provider rank removal removes candidate');
 mods=runtime.buildCandidates(records,{...context,stats:{speed:160}},{'pela-e2-speed-active':true,'pela-e2-speed-in-final-stats':true});
 const included=mods.find(m=>m.id===e2.id),glamoth=mods.find(m=>m.id==='ornament:311:2pc:speed-damage');
 assert.equal(included.enabled,false,'declared final-speed inclusion prevents re-addition');
 assert.equal(glamoth.enabled,true);assertClose(glamoth.thresholdReferenceValue,160,'included effective speed');assert.equal(glamoth.value,18);
});
