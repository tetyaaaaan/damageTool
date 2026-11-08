'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const{loadProductionFixture,attackOf,makeRequest,assertClose}=require('./helpers/hsrDirectVerification.cjs');
const profiles={dragon:{critRate:17,critDamage:83,damageBonus:23,defenseIgnore:7,resistancePenetration:3},additional:{critRate:71,critDamage:159,damageBonus:41,defenseIgnore:11,resistancePenetration:5}};
function independent(p,m){const nc=5073*m/100*(1+p.damageBonus/100)*100/(100+104*(1-(13+p.defenseIgnore)/100))*(1-(27-p.resistancePenetration)/100)*.9*1.09;return{nonCrit:nc,crit:nc*(1+p.critDamage/100),expected:nc*(1+p.critRate/100*p.critDamage/100)};}
function request(data,l){const a=attackOf(data,'1414039'),q=makeRequest(a,l,{atk:5073,hp:9317,def:1823,enemyLevel:84,resistance:27,defenseReduction:13,takenDamage:9});q.character.id='1414';q.modifierInputs={};q.sequenceComponents=a.damageComponents.map(d=>{const row=attackOf(data,d.attackId),p=profiles[row.effectiveProfile],x=makeRequest(row,row.id==='14141031'?1:l,{atk:5073,hp:9317,def:1823,...p,enemyLevel:84,resistance:27,defenseReduction:13,takenDamage:9});x.character.id='1414';x.attack.completedReferenceSnapshot=true;x.modifierInputs={};return{key:d.key,name:d.name,input:x};});return q;}
test('Round30 enhanced Dragon action independently sums Physical and self-Bondmate/A6 with per-component final profiles',async()=>{
 const{data,engine}=await loadProductionFixture();assert.deepEqual(Array.from(attackOf(data,'1414039').multipliers),[120,128,136,144,152,160,170,180,190,200]);
 for(const[l,m]of [[1,40],[10,80]]){
  const q=request(data,l),r=engine.calculate(q),values=[independent(profiles.dragon,m),independent(profiles.additional,m),independent(profiles.additional,40)];assert.notEqual(r.supported,false,r.reason);
  for(const k of ['nonCrit','crit','expected']){assertClose(r[k],values.reduce((s,v)=>s+v[k],0),'complete '+k);for(const[i,key]of ['dragon','bondmate','a6'].entries())assertClose(r.components[key][k],values[i][k],key+' '+k);}
  assert.equal(Object.keys(r.components).length,3);assert.equal(q.sequenceComponents[2].input.attack.traceLevel,1,'A6 is fixed 40%, not Ultimate level interpolation');
 }
});
test('Round30 Dragon snapshot guard rejects incomplete, other-Bondmate and changed-reference totals without changing the old Ultimate',async()=>{
 const{data,engine}=await loadProductionFixture();for(const edit of[q=>q.sequenceComponents[1].input.character.stats.atk++,q=>q.sequenceComponents[1].input.attack.completedReferenceSnapshot=false,q=>q.attack.bondmateCharacterIdExact='1003',q=>q.sequenceComponents.pop(),q=>q.modifiers.push({id:'pending-atk',category:'statFlat',stat:'atk',value:1000,enabled:true,applicable:true})]){const q=request(data,10);edit(q);assert.equal(engine.calculate(q).supported,false);}
 const q=makeRequest(attackOf(data,'141403'),10,{atk:5073});assert.notEqual(engine.calculate(q).supported,false,'old direct Ultimate remains separate');
});
