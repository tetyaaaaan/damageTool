'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadProductionFixture,attackOf,makeRequest,independentDirectDamage,assertClose}=require('./helpers/hsrDirectVerification.cjs');
// Fixed SHA character_skills 122303 param0,122304 param0/1; KQM v3.2
// https://hsr.keqingmains.com/q/moze-quickguide/: Ultimate + Talent FUA,
// two Additional instances with Prey but only one Charge consumed. No threshold inferred.
const ultimate=[162,172.8,183.6,194.4,205.2,216,229.5,243,256.5,270];
const follow=[80,88,96,104,112,120,130,140,150,160],additional=[15,16.5,18,19.5,21,22.5,24.37,26.25,28.12,30];
function request(data,u,t,prey,config={}){
 const a=structuredClone(attackOf(data,'1223031'));a.damageComponents=a.damageComponents.slice(0,prey?4:2);
 const input=makeRequest(a,u,{atk:3721.25,hp:11983.75,def:1721.5,critRate:63.5,critDamage:147.25,damageBonus:31.5,resistance:27.25,resistancePenetration:9.75,defenseIgnore:13.5,defenseReduction:11.25,takenDamage:8.75,...config});
 Object.assign(input.attack,{preyActive:prey,preyCharges:prey?9:undefined});
 input.sequenceComponents=a.damageComponents.map((p,i)=>{const level=i?t:u,curve=i===0?ultimate:i===1?follow:additional;
 const child=makeRequest(attackOf(data,p.attackId),level,{...config});child.character=structuredClone(input.character);child.enemy=structuredClone(input.enemy);child.attack.multiplier=curve[level-1];
 child.modifiers=[{id:'independent-'+i,category:'damageBonus',value:i===0?17:i===1?29:41,enabled:true,applicable:true},...(prey&&i<2?[{id:'prey',category:'takenDamage',value:25,enabled:true,applicable:true,target:{attackTypes:['followUp']}}]:[])];
 return {key:p.key,name:p.name,input:child};});return input;
}
test('batch5 Moze fresh Prey Ultimate separates all four components at independent Ult/Talent levels',async()=>{const{data,engine}=await loadProductionFixture();
 for(let u=1;u<=10;u++)for(let t=1;t<=10;t++)for(const prey of [false,true]){
 const input=request(data,u,t,prey),result=engine.calculate(input);assert.notEqual(result.supported,false,result.reason);
 const expected=input.sequenceComponents.map(p=>independentDirectDamage(p.input));
 for(const k of ['nonCrit','crit','expected'])assertClose(result[k],expected.reduce((s,p)=>s+p[k],0),'Moze '+u+'/'+t+'/'+prey+' '+k);
 assert.equal(Object.keys(result.components).length,prey?4:2);
 for(const stat of ['atk','hp','def']){const changed=structuredClone(input);changed.character.stats[stat]+=777.25;changed.sequenceComponents.forEach(p=>p.input.character=structuredClone(changed.character));const r=engine.calculate(changed);assertClose(r.nonCrit/result.nonCrit,stat==='atk'?changed.character.stats.atk/input.character.stats.atk:1,'isolated '+stat);}
 }
});
test('batch5 Moze rejects threshold, expiry, missing component and mismatched owners locally',async()=>{const{data,engine}=await loadProductionFixture();for(const mutate of [r=>r.attack.preyCharges=6,r=>r.sequenceComponents.pop(),r=>r.character.eidolon=1,r=>r.enemy.weakness=true,r=>r.sequenceComponents[1].input.character.stats.atk=1]){const r=request(data,10,10,true);mutate(r);assert.equal(engine.calculate(r).supported,false);}const normal=makeRequest(attackOf(data,'122301'),6,{atk:3000});assert.notEqual(engine.calculate(normal).supported,false);});
