"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {loadProductionFixture,attackOf,assertClose}=require('./helpers/hsrDirectVerification.cjs');
const ultima=[300,320,340,360,380,400,425,450,475,500];
const req=(a,l)=>({character:{id:'1511',level:80,eidolon:0,stats:{hp:6379,atk:2947,def:1843,elation:137.5,critRate:37.5,critDamage:143.75,damageBonus:84}},enemy:{count:1,level:91,resistance:31.5,defenseReduction:13,defenseIgnore:8,resistancePenetration:9,takenDamage:17,toughnessActive:true},attack:{...a,traceLevel:l,multiplier:a.multipliers[l-1],attackType:a.type},modifierInputs:{'aha-wish':8},modifiers:[],elation:{context:a.elationContext,certifiedBanger:40,punchline:20,merrymake:23.5}});
const oracle=(mult,p)=>7535.107*mult/100*2.375*(1+5*p/(p+240))*1.235*100/(100+111*.79)*.775*.9*1.17;

test('Round53 pre-U Wish separates the eight-point base from ten-point overflow at every adopted level',async()=>{
 const {data,engine}=await loadProductionFixture(),a=attackOf(data,'151103');
 assert.equal(a.numericModifierInputs.find(x=>x.inputKey==='aha-wish').maximum,18);
 for(let l=1;l<=10;l++)for(const wish of [8,10,11,17,18]){
  const r=req(a,l);r.modifierInputs['aha-wish']=wish;const before=JSON.stringify(r.modifierInputs),out=engine.calculate(r),n=oracle(ultima[l-1],40);
  assert.notEqual(out.supported,false,out.reason);assertClose(out.nonCrit,n,'noncrit');assertClose(out.crit,n*2.4375,'crit');assertClose(out.expected,n*(1+.375*1.4375),'EV');assert.equal(JSON.stringify(r.modifierInputs),before,'pre-action Wish is not overwritten with a guessed post-U total');
 }
 for(const wish of [undefined,NaN,7,19,11.5]){const r=req(a,10);r.modifierInputs['aha-wish']=wish;assert.equal(engine.calculate(r).supported,false);}
 const r=req(attackOf(data,'151101'),6);delete r.modifierInputs['aha-wish'];assert.notEqual(engine.calculate(r).supported,false,'invalid/missing U resource does not block normal');
});

test('Round53 finale displays correlated record branches and never treats the prior record as extra hit damage',async()=>{
 const {data,engine}=await loadProductionFixture(),a=attackOf(data,'1511202'),curve=[30,33,36,39,42,45,48.75,52.5,56.25,60];
 for(let l=1;l<=10;l++)for(const prior of [0,1,123456.789,1e12]){
  const r=req(a,l);r.modifierInputs['aha-prior-non-true-damage']=prior;const out=engine.calculate(r);assert.notEqual(out.supported,false,out.reason);
  const n=oracle(curve[l-1],20),branches={nonCrit:n,crit:n*2.4375,expected:n*(1+.375*1.4375)};
  for(const [key,body]of Object.entries(branches)){assertClose(out.components.trueDamage.breakdown.recordAfter[key],prior+body,'record');assertClose(out.components.trueDamage[key],(prior+body)*.2,'converted only once');assertClose(out[key],body+(prior+body)*.2,'total excludes prior record itself');}
  assert.equal(out.components.trueDamage.attack.canCrit,false);assert.equal(out.components.trueDamage.breakdown.correlatedCritBranches,true);
  assert.deepEqual(Array.from(out.breakdown.componentNames),['アッハの愉悦本体','記録に基づく確定成分']);
 }
 for(const prior of [undefined,NaN,-1,1e12+1]){const r=req(a,10);r.modifierInputs['aha-prior-non-true-damage']=prior;assert.equal(engine.calculate(r).supported,false);r.attack={...attackOf(data,'151120'),traceLevel:10,multiplier:60,attackType:'elation'};assert.notEqual(engine.calculate(r).supported,false,'body remains calculable without prior record');}
});


test('Round53 the Emanator rider cannot use Aha as its own recipient even through a direct engine request',async()=>{
 const {data,engine}=await loadProductionFixture(),r=req(attackOf(data,'1511021'),10);
 Object.assign(r.attack,{completedReferenceSnapshot:true,ahaEmanatorId:'1511',damageOwnerId:'1511',element:'Quantum'});
 assert.equal(engine.calculate(r).supported,false);
 r.character.id='1502';Object.assign(r.attack,{ahaEmanatorId:'1502',damageOwnerId:'1502',element:'Physical'});assert.notEqual(engine.calculate(r).supported,false);
});
