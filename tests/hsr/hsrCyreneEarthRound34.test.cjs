"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {loadProductionFixture,attackOf,makeRequest,assertClose}=require('./helpers/hsrDirectVerification.cjs');
const curve=[40,48,56,64,72,80];
function request(data,level,shield){
 const a=attackOf(data,'11415251'),q=makeRequest(a,level,{atk:4173,hp:9172,def:1839,critRate:37,critDamage:143,damageBonus:31,enemyLevel:82,resistance:27,defenseIgnore:12,resistancePenetration:8,takenDamage:9,toughnessActive:true});
 q.character.id='1414';Object.assign(q.attack,{multiplier:0,flatDamage:shield*curve[level-1]/100,shieldRatio:curve[level-1],effectiveProfile:'additional',statReferenceId:'1414',completedReferenceSnapshot:true,cyreneBlessingActive:true});
 q.modifierInputs={'cyrene-earth-active':true,'cyrene-earth-companion-shield':shield};return q;
}
function oracle(q,shield,ratio){
 const c=q.character.stats,e=q.enemy,base=shield*ratio/100;
 const def=(q.character.level+20)/((q.character.level+20)+(e.level+20)*(1-Math.min(100,(e.defenseReduction||0)+(e.defenseIgnore||0))/100));
 const res=1-Math.max(-100,Math.min(90,(e.resistance||0)-(e.resistancePenetration||0)))/100;
 const toughness=e.toughnessActive?.9:1,vulnerability=1+(e.takenDamage||0)/100,nonCrit=base*(1+c.damageBonus/100)*def*res*toughness*vulnerability,crit=nonCrit*(1+c.critDamage/100);
 return {nonCrit,crit,expected:nonCrit*(1+(c.critRate/100)*(c.critDamage/100))};
}
test('Round34 Earth adds one separately snapshotted shield based Additional component using the E0 MemSkill level curve',async()=>{
 const{data,engine}=await loadProductionFixture();
 for(const [level,ratio] of [[1,40],[6,80]])for(const shield of [0,2675.5]){
  const q=request(data,level,shield),out=engine.calculate(q),expected=oracle(q,shield,ratio);
  assert.notEqual(out.supported,false,out.reason);
  for(const k of ['nonCrit','crit','expected'])assertClose(out[k],expected[k],`Lv${level} shield${shield} ${k}`);
  assertClose(out.breakdown.flatDamage,shield*ratio/100,'flat shield addition');
  assert.equal(out.attack.canCrit,true);
 }
});
test('Round34 Earth locally rejects missing shield snapshot, absent activation, wrong source, and non-self profile',async()=>{
 const{data,engine}=await loadProductionFixture();
 const missing=request(data,6,4000);delete missing.modifierInputs['cyrene-earth-companion-shield'];assert.equal(engine.calculate(missing).supported,false);
 const off=request(data,6,4000);off.modifierInputs['cyrene-earth-active']=false;off.attack.cyreneBlessingActive=false;assert.equal(engine.calculate(off).supported,false);
 const wrong=request(data,6,4000);wrong.attack.sourceSkillId='1141522';assert.equal(engine.calculate(wrong).supported,false);
 const profile=request(data,6,4000);profile.attack.effectiveProfile='dragon';assert.equal(engine.calculate(profile).supported,false);
 const negative=request(data,6,4000);negative.modifierInputs['cyrene-earth-companion-shield']=-1;assert.equal(engine.calculate(negative).supported,false);
});
