"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {loadProductionFixture,attackOf,makeRequest,independentDirectDamage,assertClose,runtime}=require("./helpers/hsrDirectVerification.cjs");
const rows=require("../../games/hsr/data/calc/modifiers-cyrene-genesis-round34.json").modifiers;
const hpScale={1:8,6:16},critScale={1:36,6:72};
function candidates(data,attackId,level,inputs,provider=true,providerEidolon=0){
 const attack=attackOf(data,attackId),recipient=String(attackId).startsWith("18")?"8007":attack.characterId;
 const partyIds=provider?["1415"]:[];
 const all=runtime.buildCandidates(rows,{characterId:recipient,eidolon:0,partyIds,partyEidolons:{1415:providerEidolon},traceLevelFor:()=>level,attack},inputs);
 return {attack,all,byId:Object.fromEntries(all.map(row=>[row.id,row]))};
}
function inputs(hp,critRate){return {"cyrene-genesis-active":true,"cyrene-genesis-demi-hp":hp,"cyrene-genesis-demi-crit-rate":critRate};}
test("Round34 Genesis independently adds Demigod HP/CR to Trailblazer normal at source levels 1 and E0 max 6",async()=>{
 const {data}=await loadProductionFixture();
 for(const level of [1,6]){
  const hp=12000,demiCr=75,base={atk:3000,hp:6500,def:1700,baseAtk:960,critRate:35,critDamage:120,damageBonus:17,enemyLevel:80,resistance:20,toughnessActive:true};
  const q=candidates(data,"800701",level,inputs(hp,demiCr)),atkId="trace:1415:1141513:remembrance-trailblazer-atk",crId="trace:1415:1141513:remembrance-trailblazer-crit-rate";
  assert.equal(q.byId[atkId].enabled,true);assert.equal(q.byId[crId].enabled,true);assert.equal(q.byId[atkId].applicable,true);assert.equal(q.byId[crId].applicable,true);
  assertClose(q.byId[atkId].value,hp*hpScale[level]/100,"fixed HP-to-ATK support");assertClose(q.byId[crId].value,demiCr*critScale[level]/100,"fixed CR-to-CR support");
  const baseReq=makeRequest(q.attack,level,base),withGenesis={...baseReq,character:{...baseReq.character,stats:{...baseReq.character.stats,atk:base.atk+hp*hpScale[level]/100,critRate:base.critRate+demiCr*critScale[level]/100}}};
  const got=independentDirectDamage(withGenesis);
  const atk=base.atk+hp*hpScale[level]/100,cr=base.critRate+demiCr*critScale[level]/100,def=100/(100+(base.enemyLevel+20)),res=1-base.resistance/100,tough=.9;
  const nonCrit=atk*q.attack.multipliers[level-1]/100*(1+base.damageBonus/100)*def*res*tough;
  const expected=nonCrit*(1+cr/100*base.critDamage/100);
  assertClose(got.nonCrit,nonCrit,"independent normal non-crit");assertClose(got.expected,expected,"independent normal expected");
 }
 const memo=candidates(data,"1800701",6,inputs(12000,75));
 assertClose(memo.byId["trace:1415:1141513:mem-atk"].value,1920,"memosprite HP input uses source snapshot");
 assertClose(memo.byId["trace:1415:1141513:mem-crit-rate"].value,54,"memosprite CR input uses source snapshot");
 assert.equal(rows.some(r=>r.value.providerStat),false,"Cyrene is effect provider; Demigod is the explicit stat source");
});
test("Round34 Genesis needs active provider and both independent snapshots, scopes owners, and excludes each final stat once",async()=>{
 const {data}=await loadProductionFixture(),normal=attackOf(data,"800701");
 const off=candidates(data,"800701",6,{...inputs(12000,75),"cyrene-genesis-active":false});
 assert.equal(off.byId["trace:1415:1141513:remembrance-trailblazer-atk"].enabled,false);
 assert.equal(candidates(data,"800701",6,inputs(12000,75),false).all.length,0,"provider absence disables source selection");
 const missingHp=candidates(data,"800701",6,{"cyrene-genesis-active":true,"cyrene-genesis-demi-crit-rate":75});
 assert.equal(missingHp.byId["trace:1415:1141513:remembrance-trailblazer-atk"].applicable,false);
 assert.match(missingHp.byId["trace:1415:1141513:remembrance-trailblazer-atk"].inputWarnings.join(" "),/HP/);
 const final=candidates(data,"800701",6,{...inputs(12000,75),"trace:1415:1141513:trailblazer-atk-in-final-stats":true});
 assert.equal(final.byId["trace:1415:1141513:remembrance-trailblazer-atk"].includedInFinalStats,true);assert.equal(final.byId["trace:1415:1141513:remembrance-trailblazer-atk"].enabled,false);
 assert.equal(runtime.applicableToAttack(final.byId["trace:1415:1141513:mem-atk"],normal),false,"memosprite ATK must not affect Trailblazer attack");
 const unsupported=candidates(data,"800701",6,inputs(12000,75),true,1);
 assert.equal(unsupported.byId["trace:1415:1141513:remembrance-trailblazer-atk"].applicable,false,"only Cyrene E0 provider is in scope");
 for(const id of ["800701","800801","800708:caster","800808:caster"])assert.ok(rows.find(r=>r.id.endsWith("remembrance-trailblazer-atk")).target.attackIds.includes(id));
 for(const id of ["800703","800803","1800701","1800801"])assert.ok(rows.find(r=>r.id.endsWith("mem-atk")).target.attackIds.includes(id));
});
