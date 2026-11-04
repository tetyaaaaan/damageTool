const test=require('node:test'),assert=require('node:assert/strict');
const {loadProductionFixture,makeRequest,assertClose,runtime}=require('./helpers/hsrDirectVerification.cjs');
const prefixes=['lightCone:23011:','lightCone:23029:','lightCone:23032:'];
function candidates(data,id,rank,inputs={},party=false,be=150){const records=data.structuredModifiers.filter(x=>x.source?.kind==='lightCone'&&x.source.id===id);return runtime.buildCandidates(records,{characterId:'1308',lightConeId:party?'':id,refinement:rank,partyIds:party?['1222']:[],partyEquipment:party?[{characterId:'1222',lightConeId:id,refinement:rank}]:[],stats:{atk:3000,breakEffect:999},partyStats:{'1222':{breakEffect:be}},enemy:{count:1}},inputs);}
const on={'lc-23011-hp-loss-buff-active':true,'lc-23029-armorless-active':true,'lc-23029-cornered-active':true,'lc-23032-woefree-active':true};
test('three fixed light cones connect post-event buffs/debuffs at S1-S5 with independent damage',async()=>{
 const {data,engine}=await loadProductionFixture();const expected={'23011':[9,10.5,12,13.5,15],'23029':[24,28,32,36,40],'23032':[18,22,26,30,34]};
 for(const id of Object.keys(expected))for(let rank=1;rank<=5;rank++)for(const party of [false,true]){
  const mods=candidates(data,id,rank,on,party);assert.ok(mods.every(x=>x.enabled&&x.applicable));if(party)assert.ok(mods.every(x=>x.providerId==='1222'));
  const req=makeRequest({id:'test',type:'skill',element:'Thunder',scalingStat:'atk',canCrit:true,multipliers:[123]},1,{atk:3127,critRate:37,critDamage:129,damageBonus:21,resistance:23,enemyLevel:83,takenDamage:7},mods);
  const base=3127*1.23*100/203*.77*.9;
  const ev=expected[id][rank-1];const nc=base*(1+(21+(id==='23011'?ev:0))/100)*(1+(7+(id!=='23011'?ev:0))/100);
  const r=engine.calculate(req);for(const [k,v]of Object.entries({nonCrit:nc,crit:nc*2.29,expected:nc*(1+.37*1.29)}))assertClose(r[k],v,id+' S'+rank+' '+k);
  assert.ok(candidates(data,id,rank,{},party).every(x=>!x.enabled),'no unrequested post-event buff');
  for(const m of mods){const included=candidates(data,id,rank,{...on,[m.finalStatsInclusion?.inputKey||('lc-'+id+'-'+m.id.split(':').at(-1)+'-in-final')]:true},party);assert.equal(included.find(x=>x.id===m.id).enabled,false);}
 }
});
test('Forgotten Scent BE condition follows the provider not recipient, exact150 boundary, removal and missing reference',async()=>{
 const {data}=await loadProductionFixture();
 for(const be of [149.999,150,150.001,NaN]){const mods=candidates(data,'23032',1,on,true,be);const base=mods.find(x=>x.id.endsWith(':woefree')),extra=mods.find(x=>x.id.endsWith(':woefree-break-threshold'));assert.equal(base.enabled,true);assert.equal(extra.enabled,Number.isFinite(be)&&be>=150);}
 const ownRows=data.structuredModifiers.filter(x=>x.source.kind==='lightCone'&&x.source.id==='23032');
 const independentBE={id:'be-fixture',source:{kind:'trace',id:'1308'},category:'breakEffect',value:{kind:'fixed',fixed:1},target:{owner:'self',attackTypes:['all']},activation:{mode:'toggle',inputKey:'one-be'},support:{status:'calculable',verified:true},inputPolicy:'conditional'};
 for(const active of [false,true]){const res=runtime.buildCandidates([...ownRows,independentBE],{characterId:'1308',lightConeId:'23032',stats:{breakEffect:149}}, {...on,'one-be':active});assert.equal(res.find(x=>x.id.endsWith(':woefree-break-threshold')).enabled,active,'independent BE support crosses exactly150');}
 const records=data.structuredModifiers.filter(x=>prefixes.some(p=>x.id.startsWith(p)));assert.equal(runtime.buildCandidates(records,{characterId:'1308',partyIds:[],partyEquipment:[]},on).length,0);
 const armor=candidates(data,'23029',1,{'lc-23029-armorless-active':true},true);assert.equal(armor.filter(x=>x.enabled).length,1);
 const corner=candidates(data,'23029',1,{'lc-23029-cornered-active':true},true);assert.equal(corner.filter(x=>x.enabled)[0].value,24);
 const both=runtime.buildCandidates(records.filter(x=>x.source.id==='23032'),{characterId:'1308',lightConeId:'23032',partyIds:['1222'],partyEquipment:[{characterId:'1222',lightConeId:'23032'}]},on);assert.ok(both.every(x=>!x.applicable||!x.enabled));
});
