const test=require('node:test'),assert=require('node:assert/strict');
const {loadProductionFixture,makeRequest,assertClose,runtime}=require('./helpers/hsrDirectVerification.cjs');
const rows=require('../../games/hsr/data/calc/modifiers-equipment-round45.json').modifiers;
const ids=[...new Set(rows.map(x=>x.source.id))];
const active={'lc-23051-guard-active':true,'lc-23052-blank-active':true,'lc-23052-verse-active':true,'lc-23036-brocade-stacks':6,'lc-23043-dazed-active':true,'lc-23043-theft-active':true,'lc-23053-ignore-stacks':4,'lc-21064-debuff-active':true,'lc-23035-ignition-stacks':2,'lc-23025-rout-active':true};
const a={id:'independent',type:'normal',element:'Fire',scalingStat:'atk',multipliers:[123],canCrit:true};
function candidates(id,rank,inputs=active,party=false,extra={}){return runtime.buildCandidates(rows,{characterId:id==='22006'?'8007':'1003',lightConeId:party?'':id,refinement:rank,partyIds:party?['8008']:[],partyEquipment:party?[{characterId:'8008',lightConeId:id,refinement:rank}]:[],stats:{atk:3127,speed:180},...extra},inputs);}
function check(r,nc,cd=129){for(const[k,v]of Object.entries({nonCrit:nc,crit:nc*(1+cd/100),expected:nc*(1+.37*cd/100)}))assertClose(r[k],v,k);}
const cfg={atk:3127,critRate:37,critDamage:129,damageBonus:21,enemyLevel:83,resistance:23,takenDamage:7};
const base=3127*1.23*100/203*.77*.9;
test('Round45 ten cones load exactly once; conditional and permanent-stat responsibility at every S rank',async()=>{
 const {data}=await loadProductionFixture();assert.equal(ids.length,10);assert.equal(rows.length,15);
 for(const row of rows)assert.equal(data.structuredModifiers.filter(x=>x.id===row.id).length,1);
 for(const id of ids)for(let rank=1;rank<=5;rank++){
  const mods=candidates(id,rank);assert.ok(mods.length);assert.ok(mods.every(x=>x.enabled&&x.applicable),id);
  for(const row of rows.filter(x=>x.source.id===id))assert.equal(candidates(id,rank,{...active,[row.finalStatsInclusion.inputKey]:true}).find(x=>x.id===row.id).enabled,false);
  assert.equal(candidates(id,rank,active,false,{lightConeId:''}).length,0);
  const restored=candidates(id,rank,JSON.parse(JSON.stringify(active)));assert.deepEqual(restored.map(x=>[x.value,x.enabled]),mods.map(x=>[x.value,x.enabled]));
 }
 assert.ok(rows.every(x=>x.inputPolicy!=='includedInFinalStats'),'permanent properties are not repeated as combat rows');
});
test('Guard, Brocade, defense debuffs and Trailblazer bonuses reach independent direct NC/crit/expected at S1-S5',async()=>{
 const {engine}=await loadProductionFixture();
 for(let rank=1;rank<=5;rank++){
  let v=[24,30,36,42,48][rank-1];check(engine.calculate(makeRequest(a,1,cfg,candidates('23051',rank))),base*(1+(21+v)/100)*1.07);
  const cd=[9,10.5,12,13.5,15][rank-1]*6,dmg=cd;
  check(engine.calculate(makeRequest(a,1,cfg,candidates('23036',rank))),base*(1+(21+dmg)/100)*1.07,129+cd);
  check(engine.calculate(makeRequest({...a,type:'skill'},1,cfg,candidates('23036',rank))),base*1.21*1.07,129+cd);
  const red=[16,18,20,22,24][rank-1];check(engine.calculate(makeRequest(a,1,cfg,candidates('23043',rank))),3127*1.23*100/(100+103*(1-red/100))*.77*.9*1.21*1.07);
  const tr={...a,id:'800708:caster',type:'enhancedNormal'};v=[8,10,12,14,16][rank-1];const extra=[60,70,80,90,100][rank-1];
  check(engine.calculate(makeRequest(tr,1,cfg,candidates('22006',rank))),base*(1+(21+v+extra)/100)*1.07);
  check(engine.calculate(makeRequest({...tr,id:'800708:memo'},1,cfg,candidates('22006',rank))),base*(1+(21+v)/100)*1.07);
 }
});
test('Blank/Verse share two states and amplify each by60%-80% only when both are present',async()=>{
 const {engine}=await loadProductionFixture();
 for(let rank=1;rank<=5;rank++)for(const blank of [false,true])for(const verse of [false,true]){
  const mods=candidates('23052',rank,{'lc-23052-blank-active':blank,'lc-23052-verse-active':verse},true);
  const boost=blank&&verse?1+[.6,.65,.7,.75,.8][rank-1]:1,taken=blank?[10,12,14,16,18][rank-1]*boost:0,cd=verse?[16,19,22,25,28][rank-1]*boost:0;
  check(engine.calculate(makeRequest(a,1,cfg,mods)),base*1.21*(1+(7+taken)/100),129+cd);
 }
});
test('Brocade stack boundaries and invalid values remain local; attack types do not leak',async()=>{
 const {engine}=await loadProductionFixture();
 for(const stack of [0,5,6]){const mods=candidates('23036',1,{'lc-23036-brocade-stacks':stack});check(engine.calculate(makeRequest(a,1,cfg,mods)),base*(1+(21+(stack===6?54:0))/100)*1.07,129+9*stack);}
 for(const stack of [NaN,1.5,7,-1]){const mods=candidates('23036',1,{'lc-23036-brocade-stacks':stack});assert.ok(mods.find(x=>x.id.endsWith(':brocade-crit')).inputWarnings.length);}
 const mods=candidates('23053',1);assert.equal(runtime.applicableToAttack(mods[0],a),false);
});
test('Break modifiers affect actual weakness break only and stay off ordinary damage, S1-S5',async()=>{
 const {engine,data}=await loadProductionFixture();
 for(const id of ['23050','23035','23025'])for(let rank=1;rank<=5;rank++){
  const mods=candidates(id,rank),req=makeRequest(a,1,{},mods);req.character.stats.breakEffect=73;req.enemy.weakness=true;req.enemy.maxToughness=180;
  const r=engine.calculateBreak({...req,element:'Fire',breakBaseDamage:data.breakBaseDamage});
  const v=({'23050':[32,42,52,62,72],'23035':[36,42,48,54,60],'23025':[24,28,32,36,40]})[id][rank-1];
  assertClose(r.value,3767.5533*2*2*1.73*.5*.8*(1+v/100));
  check(engine.calculate(makeRequest(a,1,cfg,mods)),base*1.21*1.07);
  assert.ok(mods.every(x=>!runtime.applicableToAttack(x,{...a,type:'superBreak'})));
 }
});
test('Elation defense-ignore and enemy Elation vulnerability reach actual special formula, all ranks',async()=>{
 const {data,engine}=await loadProductionFixture(),attack=data.attacks.find(x=>x.id==='1513042');
 for(const id of ['23053','21064'])for(let rank=1;rank<=5;rank++){
  const mods=candidates(id,rank,active,id==='21064'),req=makeRequest(attack,10,{},mods);req.character.stats.elation=100;req.elation={context:'certifiedBanger',certifiedBanger:40,punchline:9999,merrymake:0,fervor:0};
  const ig=id==='23053'?[20,24,28,32,36][rank-1]:0,taken=id==='21064'?[6,7,8,9,10][rank-1]:0;
  const nc=7535.107*attack.multipliers[9]/100*2*(1+5*40/280)*100/(100+100*(1-ig/100))*.8*.9*(1+taken/100),r=engine.calculate(req);
  assert.notEqual(r.supported,false,r.reason);assertClose(r.nonCrit,nc);assertClose(r.crit,nc*2);assertClose(r.expected,nc*1.5);
 }
});
test('equipment provider removal, wearer restriction and ambiguous duplicate providers exclude only the related cone',()=>{
 for(const id of ['23051','23052','23043','21064','23035','22006']){
  const mods=candidates(id,5,active,true);assert.ok(mods.every(x=>x.enabled&&x.providerId==='8008'),id);
  assert.equal(candidates(id,5,active,true,{partyEquipment:[],partyIds:[]}).length,0);
  const duplicated=candidates(id,5,active,true,{partyIds:['8008','8007'],partyEquipment:[{characterId:'8008',lightConeId:id},{characterId:'8007',lightConeId:id}]});assert.ok(duplicated.every(x=>!x.enabled&&x.activation.unresolved),id);
 }
 assert.equal(candidates('22006',1,active,false,{characterId:'1003'}).length,0);
 const valid=candidates('22006',1,active,true,{characterId:'1003',lightConeId:'22006'});assert.equal(valid.length,1);assert.equal(valid[0].providerId,'8008');assert.equal(valid[0].enabled,true);
 for(const id of ['23051','23052','23043','21064','23025'])assert.ok(candidates(id,1,{}).every(x=>!x.enabled));
});
test('source wearer restriction is validated without changing the existing unrestricted contract',()=>{
 const {validateModifiers}=require('../../scripts/validateHsrModifiers.cjs');const good=structuredClone(rows.find(x=>x.source.id==='22006'));assert.deepEqual(validateModifiers([good]),[]);
 for(const wearerIds of [[],['8007','8007'],['made-up']]){const x=structuredClone(good);x.source.wearerIds=wearerIds;assert.ok(validateModifiers([x]).length);}
 const bad=structuredClone(good);bad.source.kind='trace';assert.ok(validateModifiers([bad]).length);
});
