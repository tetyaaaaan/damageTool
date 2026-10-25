"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {loadProductionFixture,makeRequest,independentDirectDamage,assertClose,runtime}=require('./helpers/hsrDirectVerification.cjs');
const defense=[30,31,32,33,34,35,36.25,37.5,38.75,40],damage=[60,64,68,72,76,80,85,90,95,100];
function mods(data,level,duplicate=false){const ctx={characterId:'1106',eidolon:0,traceLevelFor:()=>level,enemy:{debuffCount:duplicate?1:0}};return runtime.buildCandidates(data.structuredModifiers,ctx,{'pela-general-solution':duplicate}).filter(m=>m.id==='trace:1106:110603:prior-solution'||m.id==='traceNode:1106:1106101:prior-solution-damage'||(duplicate&&['trace:1106:110603:defense-reduction','traceNode:1106:1106101:debuffed-damage'].includes(m.id)));}
test('Pela prior-solution Ultimate verifies all E0 levels without claiming first-application order',async()=>{
 const {data,engine}=await loadProductionFixture(),a=data.attacks.find(a=>a.id==='110603');assert.match(a.name,/付与済み/);assert.match(a.calculationNote,/初回.*未確認/);
 assert.deepEqual(data.structuredModifiers.find(m=>m.id==='trace:1106:110603:prior-solution').value.values,defense);
 for(let l=1;l<=10;l++)for(const p of [{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100},{atk:2491.25,hp:9217.5,def:3741.75,critRate:63.25,critDamage:137.5,damageBonus:23.25,enemyLevel:85,resistance:15.75,defenseReduction:17.5,defenseIgnore:8.25}]){const input=makeRequest(a,l,p,mods(data,l));const expected=independentDirectDamage({...input,attack:{...input.attack,multiplier:damage[l-1]},modifiers:[{category:'defenseReduction',value:defense[l-1]},{category:'damageBonus',value:20}]}),r=engine.calculate(input);for(const k of ['nonCrit','crit','expected'])assertClose(r[k],expected[k],'prior Lv'+l+' '+k);assertClose(r.breakdown.defense,expected.defense,'DEF stage');}
});
test('Pela prior debuffs never stack twice with the same selected effects, while other DEF effects add and cap',async()=>{
 const {data,engine}=await loadProductionFixture(),a=data.attacks.find(a=>a.id==='110603');for(let l=1;l<=10;l++){const input=makeRequest(a,l,{},mods(data,l));const base=engine.calculate(input),same=engine.calculate({...input,modifiers:mods(data,l,true)});for(const k of ['nonCrit','crit','expected'])assertClose(same[k],base[k],'non-stacking '+k);assert.equal(same.applied.filter(m=>m.stacking?.group==='pela-general-solution-defense').length,1);assert.equal(same.applied.filter(m=>m.stacking?.group==='pela-debuffed-damage').length,1);}
 for(const[down,ignore]of [[20,10],[70,60]]){const input=makeRequest(a,10,{defenseReduction:down,defenseIgnore:ignore},mods(data,10));const r=engine.calculate(input);assertClose(r.nonCrit,3000*(1+20/100)*(100/(100+100*Math.max(0,1-(down+ignore+40)/100)))*.8*.9,'other DEF effects');}
});
