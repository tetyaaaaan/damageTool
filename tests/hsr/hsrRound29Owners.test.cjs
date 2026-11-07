'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadProductionFixture,attackOf,makeRequest,assertClose,runtime}=require('./helpers/hsrDirectVerification.cjs');
const mods=require('../../games/hsr/data/calc/modifiers-characters-round29.json').modifiers;
const actor={atk:4317,critRate:31,critDamage:147,damageBonus:23},partner={atk:2371,critRate:73,critDamage:181,damageBonus:47};
function expected(stats,m){const nc=stats.atk*m/100*(1+stats.damageBonus/100)*.5*.8*.9;return {nonCrit:nc,crit:nc*(1+stats.critDamage/100),expected:nc*(1+stats.critRate/100*stats.critDamage/100)};}
function match(r,e){assert.notEqual(r.supported,false,r.reason);for(const k of ['nonCrit','crit','expected'])assertClose(r[k],e[k],k);}
function req(a,l,owner,stats=actor){const q=makeRequest(a,l,stats);q.character.id=owner;return q;}
test('Round29 Mem ultimate/skill uses independent Mem ATK and E0 source caps for both Trailblazers',async()=>{
 const {data,engine}=await loadProductionFixture();
 for(const ch of ['8007','8008'])for(const [id,l,m]of [[ch+'03',10,240],[ch==='8007'?'1800701':'1800801',6,234]]){
  const q=req(attackOf(data,id),l,'18007',partner);q.attack.completedReferenceSnapshot=true;q.attack.damageOwnerId='18007';match(engine.calculate(q),expected(partner,m));
  q.character.id=ch;assert.equal(engine.calculate(q).supported,false,'never substitute Trailblazer ATK for Mem');q.character.id='18007';q.attack.traceLevel=11;assert.equal(engine.calculate(q).supported,false);
 }
});
test('Round29 same-event joint totals preserve each owner instead of inheriting caster stats',async()=>{
 const{data,engine}=await loadProductionFixture();
 for(const [id,l,m,ch,other]of [['800708',6,120,'8007','18007'],['800808',6,120,'8008','18007'],['150805',10,300,'1508','1015']]){
  const a=attackOf(data,id),q=req(a,l,ch);q.modifierInputs={};q.sequenceComponents=a.damageComponents.map((d,i)=>{const x=req({...a,id:d.attackId,damageFormula:'statMultiplier',damageComponents:undefined},l,i?other:ch,i?partner:actor);x.modifierInputs={};if(i){x.attack.completedReferenceSnapshot=true;x.attack.damageOwnerId=other;}return{key:d.key,input:x};});
  const e1=expected(actor,m),e2=expected(partner,m),r=engine.calculate(q);match(r,Object.fromEntries(Object.keys(e1).map(k=>[k,e1[k]+e2[k]])));match(r.components.caster,e1);match(r.components.partner,e2);
  q.sequenceComponents[1].input.character.id=ch;assert.equal(engine.calculate(q).supported,false,'wrong owner rejects joint only');
 }
});
test('Round29 Rin enhanced skill uses explicit repetitions, without inventing gem or SP state',async()=>{
 const{data,engine}=await loadProductionFixture(),a=attackOf(data,'150809');
 for(const n of [0,5,33]){const q=req(a,10,'1508');q.modifierInputs={'rin-repeat-count':n};q.attack.multiplier=90*(1+n);q.attack.scalingTerms=[{stat:'atk',multiplier:90},{stat:'atk',multiplier:90*n}];match(engine.calculate(q),expected(actor,90*(1+n)));delete q.modifierInputs['rin-repeat-count'];assert.equal(engine.calculate(q).supported,false);}
});
test('Round29 Mem support True damage applies once to an explicit final non-True event and known EP steps',async()=>{
 const{data,engine}=await loadProductionFixture();
 for(const ch of ['8007','8008'])for(const [ep,m]of [[100,28],[160,40],[200,48]]){
  const q=req(attackOf(data,ch==='8007'?'1800707':'1800807'),6,ch);q.modifierInputs={'mem-original-damage':12345,'mem-beneficiary-max-energy':ep};q.trueDamage={active:true,sourceKind:'memSupportFinalNonTrueDamage',originalDamage:12345};q.attack.multiplier=m;match(engine.calculate(q),{nonCrit:12345*m/100,crit:12345*m/100,expected:12345*m/100});q.modifierInputs['mem-beneficiary-max-energy']=165;assert.equal(engine.calculate(q).supported,false);
 }
});
test('Round29 structured supports compute fixed source amounts and stop for OFF, absent provider, final inclusion and unrelated attacks',async()=>{
 const{data,engine}=await loadProductionFixture();
 for(const [id,ch,attackId,value]of [['trace:8007:1800703:mem-crit-damage','8007','100301',48],['trace:8008:1800703:mem-crit-damage','8008','100301',48],['trace:1508:150804:ally-crit-damage','1508','100301',70],['trace:1508:150803:enemy-vulnerability','1508','100301',20],['trace:1415:1141520:cipher-damage','1415','140601',36],['trace:1415:1141515:tribbie-defense-ignore','1415','140301',12]]){
  const record=mods.find(m=>m.id===id),a=attackOf(data,attackId),context={characterId:a.characterId,eidolon:0,partyIds:[ch],partyEidolons:{[ch]:0},traceLevelFor:()=>ch==='1508'?10:6},inputs={[record.activation.inputKey]:true,['memosprite:'+ch+':critDamage']:200};
  const build=(i=inputs,c=context)=>runtime.buildCandidates([record],c,i);const m=build()[0];assert.equal(m.value,value,id);assert.equal(m.enabled,true,id);
  const q=req(a,1,a.characterId);m.applicable=runtime.applicableToAttack(m,a);q.modifiers=[m];const r=engine.calculate(q),base=expected(a.scalingStat==='hp'?{...actor,atk:q.character.stats.hp}:actor,q.attack.multiplier);assert.notEqual(r.supported,false,r.reason);
  if(record.category==='critDamage')assertClose(r.expected,base.nonCrit*(1+actor.critRate/100*(actor.critDamage+value)/100),id);
  if(record.category==='damageBonus')assertClose(r.nonCrit,base.nonCrit*(1+(actor.damageBonus+value)/100)/(1+actor.damageBonus/100),id);
  if(record.category==='defenseIgnore')assertClose(r.nonCrit,base.nonCrit*2/(2-value/100),id);
  if(record.category==='takenDamage')assertClose(r.nonCrit,base.nonCrit*(1+value/100),id);
  assert.equal(build({...inputs,[record.activation.inputKey]:false})[0].enabled,false);assert.equal(build(inputs,{...context,partyIds:[]}).length,0);assert.equal(build({...inputs,[record.finalStatsInclusion.inputKey]:true})[0].enabled,false);
  if(record.target.attackIds)assert.equal(runtime.applicableToAttack(m,{...a,id:'100201'}),false);
 }
});
