"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {fixedSourceSha,loadProductionFixture,attackOf,makeRequest,runtime,independentDirectDamage,assertClose}=require("./helpers/hsrDirectVerification.cjs");
// Independent literal transcription from fixed JP/EN StarRailRes dbe8cdf:
// 150501[][0], 150502[][1], 150503[][0,2], 150504[][0].
// 1505101[0][3] adds FOUR bounces with one enemy; 1505102[0][0] is 12%.
// The following are ordinary damage components only, with no Certified Banger riders.
const normal=[50,60,70,80,90,100],skill=[150,165,180,195,210,225,243.75,262.5,281.25,300];
const ultAoe=[80,88,96,104,112,120,130,140,150,160],ultBounce=[72,76.8,81.6,86.4,91.2,96,102,108,114,120];
const fox=[50,55,60,65,70,75,81.25,87.5,93.75,100];
const foxNative='traceNode:1505:1505102:fox-prior-vulnerability',priorNative='traceNode:1505:1505102:prior-vulnerability';
const ids=['150501','150502','150503','150504'];
const profiles=[
 {atk:3173.25,hp:10231.75,def:1643.5,critRate:67.5,critDamage:163.25,damageBonus:37.25,enemyLevel:87,resistance:30,defenseReduction:13.75,defenseIgnore:8.25,resistancePenetration:9.5,takenDamage:11.25},
 {atk:2347.75,hp:7102.5,def:882.25,critRate:39.25,critDamage:121.5,damageBonus:73.5,enemyLevel:75,resistance:10,defenseReduction:3.25,defenseIgnore:16.5,resistancePenetration:13.25,takenDamage:4.75}
];
const curve=id=>id==='150501'?normal:id==='150502'?skill:id==='150503'?ultAoe.map((n,i)=>n+9*ultBounce[i]):fox;
function request(data,id,level,profile=profiles[0],flags={},extra=[]){
 const a=attackOf(data,id),inputs={...a.comparisonModifierInputs,...flags};
 const records=data.structuredModifiers.filter(m=>[foxNative,priorNative].includes(m.id));
 const native=runtime.buildCandidates(records,{characterId:'1505',eidolon:0,partyIds:[],stats:profile,enemy:{count:1,toughnessActive:true},traceLevelFor:()=>10},inputs);
 return makeRequest(a,level,{...profile,enemyCount:1,toughnessActive:true},[...native,...extra.map(m=>({enabled:true,calculable:true,...m}))].map(m=>({...m,applicable:m.applicable!==false&&runtime.applicableToAttack(m,a)})));
}
function oracle(input,id,level,extra=[],prior=false){return independentDirectDamage({...input,attack:{...input.attack,multiplier:curve(id)[level-1],hitCount:1},modifiers:[...(id==='150504'||prior?[{category:'takenDamage',value:12}]:[]),...extra.filter(m=>!m.target?.attackTypes||m.target.attackTypes.includes('all')||m.target.attackTypes.includes(input.attack.type))]});}
function check(engine,input,expected,label){const r=engine.calculate(input);assert.notEqual(r.supported,false,label+': '+r.reason);for(const k of ['nonCrit','crit','expected'])assertClose(r[k],expected[k],label+' '+k);return r;}

test('batch7 Hiyu production keeps four partial ordinary records and the full E0 one-enemy bounce count',async()=>{
 const {data}=await loadProductionFixture();assert.equal(fixedSourceSha,'dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487');
 for(const id of ids){const a=attackOf(data,id);assert.equal(a.characterId,'1505');assert.equal(a.element,'Physical');assert.equal(a.scalingStat,'atk');assert.equal(a.damageFormula,'statMultiplier');assert.equal(a.canCrit,true);assert.equal(a.hitCount,1);assert.equal(a.target,'single');assert.equal(a.characterLevelExact,80);assert.equal(a.maximumEidolon,0);assert.equal(a.maximumTraceLevel,curve(id).length);assert.equal(a.enemyCountExact,1);assert.equal(a.requiredToughnessActive,true);assert.equal(a.enforceSnapshotContract,true);assert.equal(a.calculationScope,'independently-checked-ordinary-component-only');assert.equal(a.support.status,'calculable');assert.equal(a.provenance.sourceCommit,fixedSourceSha);curve(id).forEach((v,i)=>assertClose(a.multipliers[i],v,id+' curve '+i));assert.match(a.calculationNote,/追加愉悦/);}
 assert.match(attackOf(data,'150503').name,/9バウンド/);assert.equal(attackOf(data,'150503').multipliers[9],1240);
 assert.equal(attackOf(data,'150504').type,'followUp');assert.equal(attackOf(data,'150504').traceKey,'talent');assert.deepEqual(Array.from(attackOf(data,'150504').requiredModifierIds),[foxNative]);
 assert.equal(attackOf(data,'150520').support.status,'calculable','existing Aha row stays separate');
});

test('batch7 Hiyu every E0 trace level matches an independent ordinary-damage oracle',async()=>{
 const {data,engine}=await loadProductionFixture();
 for(const id of ids)for(let l=1;l<=curve(id).length;l++)for(const p of profiles){const input=request(data,id,l,p),r=check(engine,input,oracle(input,id,l),id+' Lv'+l);assertClose(r.breakdown.referenceValue,p.atk,'own ATK');assertClose(r.breakdown.critRatePercent,p.critRate,'permanent A2 CR already in final input');assertClose(r.breakdown.takenDamage,p.takenDamage+(id==='150504'?12:0),'prior vulnerability once');assert.equal(r.applied.filter(m=>m.id===foxNative).length,id==='150504'?1:0);}
});

test('batch7 Hiyu isolates ATK from HP/DEF and scopes ordinary type bonuses',async()=>{
 const {data,engine}=await loadProductionFixture();
 const extras=[{id:'hiyu-generic-oracle',category:'damageBonus',value:19.25,enabled:true,applicable:true},{id:'hiyu-followup-oracle',category:'damageBonus',value:31.5,target:{attackTypes:['followUp']},enabled:true,applicable:true}];
 for(const id of ids){const l=curve(id).length,input=request(data,id,l,profiles[1],{},extras),base=check(engine,input,oracle(input,id,l,extras),id+' bonuses');for(const stat of ['atk','hp','def']){const changed=structuredClone(input);changed.character.stats[stat]+=777.25;const r=engine.calculate(changed);assert.notEqual(r.supported,false,r.reason);assertClose(r.nonCrit/base.nonCrit,stat==='atk'?changed.character.stats.atk/input.character.stats.atk:1,id+' isolated '+stat);}assert.equal(base.applied.some(m=>m.id==='hiyu-followup-oracle'),id==='150504');}
});

test('batch7 Hiyu accepts explicit party damage buffs and optional prior vulnerability without duplicating Fox native',async()=>{
 const {data,engine}=await loadProductionFixture();const record=data.structuredModifiers.find(m=>m.id==='trace:1202:120203:ultimate-damage');assert.ok(record);
 const party=runtime.buildCandidates([record],{characterId:'1505',partyIds:['1202'],partyEidolons:{'1202':0},traceLevelFor:()=>10},{'tingyun-ultimate-active':true});assert.equal(party.length,1);assert.equal(party[0].value,50);
 for(const id of ids){const l=curve(id).length,input=request(data,id,l,profiles[0],{'hiyu-prior-vulnerability':true},party);const r=check(engine,input,oracle(input,id,l,[{category:'damageBonus',value:50}],true),id+' party');assertClose(r.breakdown.takenDamage,profiles[0].takenDamage+12,'native once');assert.equal(r.applied.some(m=>m.id===record.id),true);assert.equal(r.applied.some(m=>m.id===priorNative),id!=='150504');}
});

test('batch7 Hiyu Fox requires a valid pre-existing native modifier while ordinary siblings stay usable',async()=>{
 const {data,engine}=await loadProductionFixture();
 for(const mutate of [r=>r.modifiers=[],r=>r.modifiers.find(m=>m.id===foxNative).enabled=false,r=>r.modifiers.find(m=>m.id===foxNative).applicable=false,r=>r.modifiers.find(m=>m.id===foxNative).calculable=false,r=>r.modifiers.find(m=>m.id===foxNative).inputWarnings=['invalid prior state'],r=>r.modifiers.push(structuredClone(r.modifiers.find(m=>m.id===foxNative)))]){const input=request(data,'150504',10);mutate(input);assert.equal(engine.calculate(input).supported,false);for(const id of ids.slice(0,3)){const sibling=request(data,id,1);assert.notEqual(engine.calculate(sibling).supported,false,'Fox local stop does not suppress '+id);}}
 const off=request(data,'150504',10,profiles[0],{'hiyu-fox-prior-vulnerability':false});assert.equal(engine.calculate(off).supported,false);
});

test('batch7 Hiyu snapshot bounds stop only out-of-scope level, eidolon, enemy and break conditions',async()=>{
 const {data,engine}=await loadProductionFixture();
 for(const id of ids)for(const mutate of [r=>r.character.level=79,r=>r.character.eidolon=1,r=>r.enemy.count=2,r=>r.enemy.toughnessActive=false,r=>r.attack.traceLevel=0,r=>r.attack.traceLevel=curve(id).length+1,r=>r.attack.traceLevel=NaN]){const input=request(data,id,curve(id).length);mutate(input);assert.equal(engine.calculate(input).supported,false,id+' rejects scope');}
 const [native,optional]=data.structuredModifiers.filter(m=>[foxNative,priorNative].includes(m.id));assert.equal(native.value.fixed,12);assert.equal(optional.value.fixed,12);assert.match(native.description,/初回付与の時点は計算しません/);
});
