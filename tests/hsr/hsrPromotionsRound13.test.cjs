const test=require('node:test'),assert=require('node:assert/strict');
const {loadProductionFixture,makeRequest,independentDirectDamage,assertClose}=require('./helpers/hsrDirectVerification.cjs');
test('Cyrene HP normal and empowered primary+AoE use exact fixed curves at every adopted level',async()=>{
 const {data,engine}=await loadProductionFixture();
 for(const [id,curve,type,hits]of [['141501',[25,30,35,40,45,50],'normal',1],['141508',[30,36,42,48,54,60],'enhancedNormal',2]]){
  const a=data.attacks.find(x=>x.id===id);assert.equal(a.support.status,'calculable');assert.equal(a.type,type);assert.equal(a.hitCount,hits);
  for(let lv=1;lv<=6;lv++)for(const profile of [{hp:7531,atk:1739,def:2953,critRate:39,critDamage:143,damageBonus:29,resistance:27,enemyLevel:89},{hp:15379,atk:3913,def:1421,critRate:73,critDamage:81,damageBonus:13,toughnessActive:false}]){
   const req=makeRequest(a,lv,profile,[{id:'normal-only',enabled:true,applicable:type==='normal',category:'damageBonus',value:31,target:{attackTypes:['normal']}}]);
   const expected=independentDirectDamage({...req,attack:{...req.attack,scalingStat:'hp',multiplier:curve[lv-1]}}),actual=engine.calculate(req);
   for(const k of ['nonCrit','crit','expected'])assertClose(actual[k],expected[k],id+' Lv'+lv+' '+k);
  }
  for(const opts of [{eidolon:1},{characterLevel:79},{enemyCount:2}])assert.equal(engine.calculate(makeRequest(a,6,opts)).supported,false);
 }
});
