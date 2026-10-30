'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadProductionFixture,runtime,makeRequest,assertClose,assertMatchesIndependent,fixedSourceSha}=require('./helpers/hsrDirectVerification.cjs');
const rows=require('../../games/hsr/data/calc/modifiers-equipment-round8.json').modifiers;
const {validateModifiers}=require('../../scripts/validateHsrModifiers.cjs');
const expected={23005:[[24,28,32,36,40]],23012:[[36,42,48,54,60]],23015:[[18,21,24,27,30]],23016:[[30,35,40,45,50],[12,14,16,18,20]],23017:[[2.4,2.8,3.2,3.6,4]],23018:[[.36,.42,.48,.54,.6]],23027:[[20,23,26,29,32]],23028:[[20,24,28,32,36]],23030:[[36,42,48,54,60]],23031:[[27,30,33,36,39]]};
const ctx=(row,rank,extra={})=>({characterId:'1003',lightConeId:row.source.id,refinement:rank,stats:{atk:3000,hp:6000,def:3000,critRate:50,critDamage:100},baseStats:{atk:1000,hp:1000,def:1000},...extra});
const activeInputs=row=>row.activation.mode==='toggle'?{[row.activation.inputKey]:true}:row.activation.mode==='stack'?{[row.activation.inputKey]:row.activation.maximum}:row.activation.mode==='numericThreshold'?{'current-max-energy':180}:{};
const candidate=(row,rank,inputs=activeInputs(row),extra={})=>runtime.buildCandidates([row],ctx(row,rank,extra),inputs)[0];
const attack=(type='normal',element='Fire')=>({id:'r8-'+type,type,element,scalingStat:'atk',multipliers:Array(10).fill(100),canCrit:true,target:'single'});
test('round8 ten previously undefined cones: pinned S1-S5 tables and production registration',async()=>{
 const {data}=await loadProductionFixture();assert.deepEqual(validateModifiers(rows),[]);assert.equal(rows.length,11);
 for(const [id,tables]of Object.entries(expected)){
  const selected=rows.filter(r=>r.source.id===id);assert.equal(selected.length,tables.length,id);
  selected.forEach((r,i)=>{assert.deepEqual(r.value.values,tables[i]);assert.equal(r.provenance.sourceCommit,fixedSourceSha);assert.ok(data.structuredModifiers.find(m=>m.id===r.id));assert.ok(r.finalStatsInclusion);});
 }
});
test('all five ranks: activation, stack caps, final-input exclusion, unequip, persistence and damage targets',async()=>{
 const {engine}=await loadProductionFixture();
 for(const row of rows)for(let rank=1;rank<=5;rank++){
  const inputs=activeInputs(row),on=candidate(row,rank,inputs),mode=row.activation.mode;
  assert.equal(on.enabled,true,row.id+' S'+rank);const stacks=mode==='stack'?row.activation.maximum:mode==='numericThreshold'?180:1;
  assertClose(on.value,row.value.values[rank-1]*stacks,row.id);
  const restored=candidate(row,rank,JSON.parse(JSON.stringify(inputs)));assert.equal(restored.value,on.value);assert.equal(restored.enabled,true);
  assert.equal(candidate(row,rank,{...inputs,[row.finalStatsInclusion.inputKey]:true}).enabled,false,'included '+row.id);
  assert.equal(runtime.buildCandidates([row],ctx(row,rank,{lightConeId:''}),inputs).length,0,'unequip '+row.id);
  if(mode==='toggle'||mode==='stack')assert.equal(candidate(row,rank,{}).enabled,false,'off '+row.id);
  if(mode==='stack'){
   assert.equal(candidate(row,rank,{[row.activation.inputKey]:999}).value,on.value,'cap');
   assert.equal(candidate(row,rank,{[row.activation.inputKey]:0}).enabled,false,'zero');
  }
  for(const type of ['normal','skill','ultimate','followUp']){
   const a=attack(type),applies=row.target.attackTypes.includes('all')||row.target.attackTypes.includes(type);
   assert.equal(runtime.applicableToAttack(on,a),applies,row.id+' '+type);
   const request=makeRequest(a,10,{},[{...on,applicable:applies}]);
   assertMatchesIndependent(engine,request,row.id+' S'+rank+' '+type);
  }
 }
});
test('23018 max EP: unknown stays local, 180 cap, ultimate-only independent representative',async()=>{
 const {engine}=await loadProductionFixture(),row=rows.find(r=>r.source.id==='23018');
 for(const input of [undefined,null,NaN,0,1.5]){const c=candidate(row,1,input===undefined?{}:{'current-max-energy':input});assert.equal(c.enabled,false);assert.equal(c.activation.unresolved,true);}
 for(const rank of [1,5])for(const energy of [1,179,180,181,300]){
  const c=candidate(row,rank,{'current-max-energy':energy});assertClose(c.value,Math.min(180,energy)*row.value.values[rank-1]);
  assertMatchesIndependent(engine,makeRequest(attack('ultimate'),10,{},[{...c,applicable:true}]),'max EP '+energy);
 }
 const c=candidate(row,1),out=engine.calculate(makeRequest(attack('ultimate'),10,{},[{...c,applicable:true}]));assertClose(out.nonCrit,1779.84);assertClose(out.expected,2669.76);
});
test('23016/23017 party provider and recipient: leaves party, shared state restored, duplicate provider only excludes affected support',async()=>{
 for(const row of rows.filter(r=>['enemySingle','activeAlly'].includes(r.target.owner))){
  const extra={lightConeId:'',partyIds:['1201'],partyEquipment:[{characterId:'1201',lightConeId:row.source.id,refinement:5}]};
  const c=candidate(row,1,activeInputs(row),extra);assert.ok(c);assert.equal(c.enabled,true);assert.equal(c.providerId,'1201');assertClose(c.value,row.value.values[4]*row.activation.maximum);
  assert.equal(runtime.buildCandidates([row],ctx(row,1,{lightConeId:'',partyIds:[],partyEquipment:[]}),activeInputs(row)).length,0);
  const duplicate=candidate(row,1,activeInputs(row),{...extra,lightConeId:row.source.id});assert.equal(duplicate.enabled,false);assert.equal(duplicate.activation.unresolved,true);
 }
});
test('23027 break DEF ignore combines additively with DEF reduction and stays off direct attacks',async()=>{
 const {engine}=await loadProductionFixture(),row=rows.find(r=>r.source.id==='23027'),c=candidate(row,1);
 for(let rank=1;rank<=5;rank++){
  const item=candidate(row,rank),input={character:{level:80,stats:{breakEffect:100}},enemy:{level:80,count:1,weakness:true,maxToughness:120,resistance:20,defenseReduction:20,defenseIgnore:0},element:'Physical',breakBaseDamage:{80:3767.5533},modifiers:[{...item,applicable:true}]};
  const result=engine.calculateBreak(input),ignore=row.value.values[rank-1];
  const expected=3767.5533*2*2*(100/(100+100*(1-(20+ignore)/100)))*.8*1.5;
  assert.equal(result.supported,true);assertClose(result.value,expected,'Break DEF ignore S'+rank);
 }
 assert.equal(runtime.applicableToAttack(c,attack('normal')),false);assert.equal(runtime.applicableToAttack(c,attack('superBreak')),true);
});
