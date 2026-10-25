"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {loadProductionFixture,makeRequest,independentDirectDamage,assertClose,runtime}=require('./helpers/hsrDirectVerification.cjs');
// Independent transcriptions from fixed-SHA character_skills.json and
// character_skill_trees.json. The production arrays are compared, not reused as the oracle.
const specs={
 '100101':{stat:'atk',curve:[50,60,70,80,90,100],type:'normal'},
 '100103':{stat:'atk',curve:[90,96,102,108,114,120,127.5,135,142.5,150],type:'ultimate'},
 '100104':{stat:'atk',curve:[50,55,60,65,70,75,81.25,87.5,93.75,100],type:'followUp'},
 '1001031':{stat:'atk',curve:[30,33,36,39,42,45,48.75,52.5,56.25,60],type:'additional',canCrit:false},
 '100301':{stat:'atk',curve:[50,60,70,80,90,100],type:'normal'},
 '100302':{stat:'atk',curve:[100,110,120,130,140,150,162.5,175,187.5,200],adjacent:[40,44,48,52,56,60,65,70,75,80],type:'skill'},
 '100303':{stat:'atk',curve:[138,147.2,156.4,165.6,174.8,184,195.5,207,218.5,230],type:'ultimate'},
 '100304':{stat:'atk',curve:[70,77,84,91,98,105,113.75,122.5,131.25,140],type:'followUp'},
 '10031011':{stat:'atk',curve:[30],type:'dot',canCrit:false}
};
const profiles=[{atk:3123.5,hp:9876.25,def:2345.75,critRate:37.5,critDamage:83.25,damageBonus:11.5,enemyLevel:82,resistance:27.5,defenseReduction:13.5},{atk:2195.75,hp:12345.5,def:1876.125,critRate:71.25,critDamage:142.75,damageBonus:46.25,enemyLevel:85,resistance:11.25,defenseReduction:17.5,defenseIgnore:8.25,takenDamage:13.25}];
function check(engine,input,curve,stat,label){const expected=independentDirectDamage({...input,attack:{...input.attack,multiplier:curve,scalingStat:stat}}),actual=engine.calculate(input);assert.notEqual(actual.supported,false,label);for(const k of ['nonCrit','crit','expected'])assertClose(actual[k],expected[k],label+' '+k);assertClose(actual.breakdown.referenceValue,input.character.stats[stat],label+' final input');return actual;}
test('Himeko and Preservation March direct and delayed events independently match every E0 coefficient',async()=>{
 const {data,engine}=await loadProductionFixture();
 for(const[id,s]of Object.entries(specs)){const a=data.attacks.find(a=>a.id===id);assert.ok(a,id);assert.equal(a.type,s.type);assert.equal(a.scalingStat,s.stat);assert.deepEqual(Array.from(a.multipliers).slice(0,s.curve.length),s.curve);if(s.canCrit===false)assert.equal(a.canCrit,false);
 for(let level=1;level<=s.curve.length;level++)for(const p of profiles){const input=makeRequest(a,level,p);check(engine,input,s.curve[level-1],s.stat,id+' Lv'+level);if(s.adjacent){assertClose(a.adjacentMultipliers[level-1],s.adjacent[level-1],id+' fixed adjacent curve');check(engine,{...input,attack:{...input.attack,target:'adjacent',multiplier:a.adjacentMultipliers[level-1]}},s.adjacent[level-1],s.stat,id+' adjacent Lv'+level);}}
 }
});
test('delayed events use their owner ATK only, never CRIT or application probability, and remain separate from immediate damage',async()=>{
 const {data,engine}=await loadProductionFixture();
 for(const[id,level,value]of [['10031011',1,324],['1001031',10,648]]){const a=data.attacks.find(a=>a.id===id),input=makeRequest(a,level),r=engine.calculate(input);assertClose(r.nonCrit,value,id);assertClose(r.crit,value,id+' no critical');assertClose(r.expected,value,id+' no probability weighted average');for(const stat of ['atk','hp','def','critRate','critDamage']){const changed={...input,character:{...input.character,stats:{...input.character.stats,[stat]:input.character.stats[stat]+123.75}}};assertClose(engine.calculate(changed).nonCrit,stat==='atk'?value*(3000+123.75)/3000:value,id+' '+stat);}
 }
 const normal=engine.calculate(makeRequest(data.attacks.find(a=>a.id==='100301'),6));assertClose(normal.nonCrit,1080,'Burn is not appended to Basic');
 const ult=engine.calculate(makeRequest(data.attacks.find(a=>a.id==='100103'),10));assertClose(ult.nonCrit,1620,'Frozen is not appended to Ultimate');
});
test('Magma adds once to Skill damage only; Benchmark and completed stat traces never add CRIT again',async()=>{
 const {data,engine}=await loadProductionFixture();const records=data.structuredModifiers.filter(m=>m.source.id==='1003');
 const build=(on)=>runtime.buildCandidates(records,{characterId:'1003',eidolon:0,stats:{hpPercent:100}}, {'himeko-target-burning':on});
 const benchmark=build(true).find(m=>m.id==='traceNode:1003:1003103:benchmark');assert.equal(benchmark.displayOnly,true);assert.equal(benchmark.enabled,false);assert.equal(benchmark.inputPolicy,'includedInFinalStats');
 for(const[id,s]of Object.entries(specs).filter(([id])=>id.startsWith('1003'))){const a=data.attacks.find(a=>a.id===id);for(let level=1;level<=s.curve.length;level++){const input=makeRequest(a,level);const mods=build(true).map(m=>({...m,applicable:runtime.applicableToAttack(m,input.attack)}));const r=engine.calculate({...input,modifiers:mods}),base=engine.calculate(input);assertClose(r.nonCrit,base.nonCrit*(id==='100302'?1.2:1),id+' scoped Magma');assert.equal(r.applied.filter(m=>m.id==='traceNode:1003:1003102:burned-skill').length,id==='100302'?1:0);assertClose(r.crit,base.crit*(id==='100302'?1.2:1),id+' no Benchmark CRIT re-add');
 const off=build(false).map(m=>({...m,applicable:runtime.applicableToAttack(m,input.attack)}));assertClose(engine.calculate({...input,modifiers:off}).expected,base.expected,id+' OFF');
 if(id==='100302'){const m=mods.find(m=>m.enabled&&m.applicable);const duplicated=engine.calculate({...input,modifiers:[m,{...m,id:m.id+':duplicate'}]});assertClose(duplicated.nonCrit,r.nonCrit,'same Magma group not duplicated');const party={id:'test-support',category:'damageBonus',enabled:true,applicable:true,value:50};const together=engine.calculate({...input,modifiers:[m,party]});assertClose(together.nonCrit,base.nonCrit*1.7,'Magma and Robin add within DMG bonus');}
 }}
});
