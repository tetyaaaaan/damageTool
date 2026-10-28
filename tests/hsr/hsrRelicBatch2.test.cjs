"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {runtime,loadProductionFixture,makeRequest,assertClose,assertMatchesIndependent}=require('./helpers/hsrDirectVerification.cjs');
const stateApi=require('../../games/js/hsrCalcState.js');
const attack=(type='skill')=>({id:'batch2-fixture',type,element:'Quantum',scalingStat:'atk',multipliers:[100],canCrit:true});
const scoped=(items,a)=>items.map(m=>({...m,applicable:m.applicable&&runtime.applicableToAttack(m,a)}));
const context=(id)=>({characterId:'1001',relicIds:[id],relicMode:4,enemy:{debuffCount:1}});
// Literal amounts from fixed relic_sets records, separate from Runtime output.
const cases=[
 ['relic:104:4pc:ultimate-crit-damage','relic-104-ultimate-crit-damage-active',true,25,'critDamage','skill'],
 ['relic:105:4pc:atk-stacks','relic-105-atk-stacks',3,15,'statPercent','normal'],
 ['relic:109:4pc:skill-atk','relic-109-skill-atk-active',true,20,'statPercent','ultimate'],
 ['relic:112:4pc:debuff-crit-rate',null,null,10,'critRate','skill'],
 ['relic:112:4pc:imprison-crit-damage','relic-112-imprison-crit-damage-active',true,20,'critDamage','skill'],
 ['relic:115:2pc:followup-damage',null,null,20,'damageBonus','followUp'],
 ['relic:115:4pc:atk-stacks','relic-115-atk-stacks',8,48,'statPercent','skill'],
 ['relic:121:4pc:target-crit-damage','relic-121-target-crit-damage-stacks',2,36,'critDamage','normal'],
 ['relic:126:4pc:ultimate-atk','relic-126-ultimate-atk-active',true,48,'statPercent','ultimate'],
 ['relic:131:4pc:skill-ultimate-stacks','relic-131-damage-stacks',3,54,'damageBonus','skill']
];
test('ten new relic components match literal independent damage, OFF, set removal and final-stat equivalence',async()=>{
 const{data,engine}=await loadProductionFixture();
 for(const[id,key,value,amount,category,type]of cases){
  const records=data.structuredModifiers.filter(m=>m.id===id);assert.equal(records.length,1,id);
  const rec=records[0],ctx=context(rec.source.id),inputs=key?{[key]:value}:{},a=attack(type);
  const mods=runtime.buildCandidates(records,ctx,inputs),m=mods[0];
  assert.equal(m.enabled,true,id);assert.equal(m.applicable,true,id);assert.equal(m.value,amount,id+' literal value');assert.equal(m.category,category);
  const result=assertMatchesIndependent(engine,makeRequest(a,1,{},scoped(mods,a)),id);
  const atk=3000+(category==='statPercent'?1000*amount/100:0),cr=50+(category==='critRate'?amount:0),cd=100+(category==='critDamage'?amount:0);
  const nc=atk*.5*.8*.9*(category==='damageBonus'?1+amount/100:1);
  assertClose(result.nonCrit,nc,id+' literal nonCrit');assertClose(result.crit,nc*(1+cd/100),id+' literal crit');assertClose(result.expected,nc*(1+cr/100*cd/100),id+' literal expected');
  const off=runtime.buildCandidates(records,{...ctx,enemy:{debuffCount:0}},{}).at(0);assert.equal(off.enabled,rec.activation.mode==='always',id+' inactive state');
  assert.equal(runtime.buildCandidates(records,{...ctx,relicIds:[]},inputs).length,0,id+' unequip');
  assert.equal(runtime.buildCandidates(records,{...ctx,relicMode:rec.source.setPieces-1},inputs).length,0,id+' insufficient pieces');
  if(rec.finalStatsInclusion){
   const included=runtime.buildCandidates(records,ctx,{...inputs,[rec.finalStatsInclusion.inputKey]:true});assert.equal(included[0].enabled,false);
   const same=engine.calculate(makeRequest(a,1,{atk,critRate:cr,critDamage:cd},scoped(included,a)));assertClose(same.expected,result.expected,id+' final stat once');
  }
 }
});
test('relic stack bounds, two-piece follow-up scope and Duke reset keep unrelated attacks unchanged',async()=>{
 const{data,engine}=await loadProductionFixture();
 for(const[id,key,max,step]of [['105','relic-105-atk-stacks',5,5],['115','relic-115-atk-stacks',8,6],['121','relic-121-target-crit-damage-stacks',2,18],['131','relic-131-damage-stacks',3,18]]){
  const rec=data.structuredModifiers.find(m=>m.source.kind==='relic'&&m.source.id===id&&m.activation.inputKey===key);
  for(const[n,expected]of [[-1,0],[0,0],[1,step],[max,max*step],[max+5,max*step]])assert.equal(runtime.buildCandidates([rec],context(id),{[key]:n})[0].value,expected,key+' bound '+n);
 }
 const duke=data.structuredModifiers.find(m=>m.id==='relic:115:4pc:atk-stacks');const c=runtime.buildCandidates([duke],context('115'),{'relic-115-atk-stacks':8});
 assert.equal(runtime.applicableToAttack(c[0],attack('followUp')),false,'old stacks clear at next follow-up');
 assertClose(engine.calculate(makeRequest(attack('followUp'),1,{},scoped(c,attack('followUp')))).nonCrit,1080,'no inherited FUA ATK');
 const fua=data.structuredModifiers.find(m=>m.id==='relic:115:2pc:followup-damage');const fc=runtime.buildCandidates([fua],context('115'),{})[0];assert.equal(fc.automatic,true);
 for(const type of ['normal','skill','ultimate','dot','break'])assert.equal(runtime.applicableToAttack(fc,attack(type)),false,type+' outside FUA');
 const shiken=data.structuredModifiers.find(m=>m.id==='relic:131:4pc:skill-ultimate-stacks');const sc=runtime.buildCandidates([shiken],context('131'),{'relic-131-damage-stacks':3})[0];
 for(const type of ['normal','followUp','dot'])assert.equal(runtime.applicableToAttack(sc,attack(type)),false,type+' outside skill/ultimate');
});
test('Wastelander enemy-only crit cannot activate Arena global CR threshold',async()=>{
 const{data,engine}=await loadProductionFixture();const records=data.structuredModifiers.filter(m=>['relic:112:4pc:debuff-crit-rate','ornament:309:2pc:normal-skill-damage'].includes(m.id));
 const a=attack('normal'),ctx={...context('112'),ornamentId:'309',stats:{critRate:60},attack:a};
 const mods=runtime.buildCandidates(records,ctx,{});assert.equal(mods.find(m=>m.source.kind==='ornament').enabled,false);assert.equal(mods.find(m=>m.source.kind==='relic').automatic,true);
 const r=engine.calculate(makeRequest(a,1,{critRate:60},scoped(mods,a)));assertClose(r.nonCrit,1080,'Arena stays off');assertClose(r.expected,1836,'attack uses 70% CR');
});
test('Priest recipient comes from equipped provider; all new inputs survive save/restore',async()=>{
 const{data,engine}=await loadProductionFixture();const rec=data.structuredModifiers.find(m=>m.id==='relic:121:4pc:target-crit-damage');
 const ctx={characterId:'1001',partyIds:['1002'],partyEquipment:[{characterId:'1002',relicIds:['121'],relicMode:4}]};
 const inputs={'relic-121-target-crit-damage-stacks':2};const m=runtime.buildCandidates([rec],ctx,inputs)[0];assert.equal(m.providerId,'1002');
 assertClose(engine.calculate(makeRequest(attack(),1,{},[m])).expected,1814.4,'recipient CD');
 assert.equal(runtime.buildCandidates([rec],{...ctx,partyEquipment:[]},inputs).length,0,'provider equipment removal');
 const values={};for(const[id,key,value]of cases){if(key)values[key]=value;const r=data.structuredModifiers.find(m=>m.id===id);if(r.finalStatsInclusion)values[r.finalStatsInclusion.inputKey]=true;}
 const defaults={enemy:{},conditions:[],modifierInputs:{},party:[],traceLevels:{},source:'manual',relicMode:'4pc',enhancementState:'previous',attackerPosition:1};
 const snapshot=stateApi.create({...defaults,modifierInputs:values});const storage={value:'',setItem(k,v){this.value=v;},getItem(){return this.value;}};
 assert.equal(stateApi.save(storage,snapshot),true);const restored=stateApi.restore(stateApi.load(storage).value,defaults,{characters:[],lightCones:[],relicSets:[]},[]);assert.deepEqual(restored.state.modifierInputs,values);
});
