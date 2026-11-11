'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadProductionFixture,runtime,makeRequest,independentDirectDamage,assertClose}=require('./helpers/hsrDirectVerification.cjs');
test('batch4 supplemental reference separates effect source, trigger, stat owner and trace owner without borrowing provider stats',async()=>{
 const {data,engine}=await loadProductionFixture();const records=data.structuredModifiers.filter(m=>m.supplementalAttack?.statReference === "activeCharacter");
 for(const m of records) for(const owner of [{id:'1003',element:'Fire'},{id:'1202',element:'Thunder'}]){
  const stats={atk:3123.25,hp:9876,def:4321,critRate:37.5,critDamage:143.75,damageBonus:61.25};
  const ctx={characterId:owner.id,characterElement:owner.element,partyIds:['1202'],partyStats:{'1202':{atk:99999,critRate:1,critDamage:3,damageBonus:777}},stats};
  const element=m.supplementalAttack.element==='wearer'?owner.element:m.supplementalAttack.element;
  const item={...m,providerId:'1202',sourceMeta:m.source};const key=m.supplementalAttack.damageBonusInputKey+':'+owner.id;
  const ref=runtime.supplementalReference(item,ctx,{[key]:17.5});assert.equal(ref.supported,true);assert.equal(ref.sourceCharacterId,'1202');assert.equal(ref.statReferenceId,owner.id);assert.equal(ref.traceOwnerId,'1202');assert.equal(ref.triggerCharacterId,m.source.skillId==='120204'?'1202':owner.id);
  assert.equal(ref.stats.atk,stats.atk);assert.equal(ref.stats.critDamage,stats.critDamage);assert.equal(ref.stats.damageBonus,owner.element===element?61.25:17.5);
  const a={id:'independent-ref',name:m.name,type:m.supplementalAttack.type,attackType:m.supplementalAttack.type,scalingStat:m.supplementalAttack.scalingStat,element,target:'single',hitCount:1,canCrit:m.supplementalAttack.canCrit,multipliers:[40]};
  const input=makeRequest(a,1,{...stats,damageBonus:ref.stats.damageBonus});const expected=independentDirectDamage(input),actual=engine.calculate(input);for(const k of ['nonCrit','crit','expected'])assertClose(actual[k],expected[k],'reference arithmetic '+k);
  const changed=runtime.supplementalReference(item,{...ctx,partyStats:{'1202':{atk:1,critDamage:99999}}},{[key]:17.5});assert.deepEqual(changed.stats,ref.stats);
 }
});
test('batch4 a different-element supplement requires its own finite bonus and keeps zero, blank and different owners distinct',async()=>{
 const {data}=await loadProductionFixture();const record=data.structuredModifiers.find(m=>m.supplementalAttack);const item={...record,providerId:'1202',sourceMeta:record.source};
 const ctx={characterId:'1003',characterElement:'Fire',stats:{atk:3000,critRate:50,critDamage:100,damageBonus:50}};const key=record.supplementalAttack.damageBonusInputKey+':1003';
 for(const value of [undefined,NaN,null,'',Infinity])assert.equal(runtime.supplementalReference(item,ctx,{[key]:value}).supported,false);
 assert.equal(runtime.supplementalReference(item,ctx,{[key]:0}).stats.damageBonus,0);assert.equal(runtime.supplementalReference(item,{...ctx,characterId:'1101'},{[key]:0}).supported,false,'another character cannot inherit cached Lightning bonus');
 assert.equal(runtime.supplementalReference({...item,supplementalAttack:{...item.supplementalAttack,statReference:'unknown'}},ctx,{[key]:0}).supported,false);
});
