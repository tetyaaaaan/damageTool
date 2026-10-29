"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProductionFixture, runtime, makeRequest, assertClose, assertMatchesIndependent } = require("./helpers/hsrDirectVerification.cjs");
const authored = require("../../games/hsr/data/calc/modifiers-equipment-round6.json").modifiers;
const byCone = new Map();
for (const row of authored) {
  const id = row.source.id;
  if (!byCone.has(id)) byCone.set(id, []);
  byCone.get(id).push(row);
}
const values = {
  "24003": [24,30,36,42,48], "23004": [24,28,32,36,40], "23060": [32,36,40,44,48],
  "23061-defense": [20,24,28,32,36], "23061-skill": [72,84,96,108,120], "23062": [24,30,36,42,48],
  "23064": [24,28,32,36,40], "23002": [24,28,32,36,40], "22002": [18,21,24,27,30],
  "22003": [18,22.5,27,31.5,36], "22004": [4,5,6,7,8], "22008": [3,3.5,4,4.5,5], "21047": [8,9,10,11,12]
};
const attack = (type="normal") => ({ id:"round6-cone-"+type, type, element:"Fire", scalingStat:"atk", multipliers:Array(10).fill(100), canCrit:type!=="dot", target:"single" });
function inputFor(row) {
  if (row.activation.mode === "toggle") return { [row.activation.inputKey]: true };
  if (row.activation.mode === "stack") return { [row.activation.inputKey]: 2 };
  return {};
}
function rowKey(row) {
  if (row.source.id === "23061") return row.category === "defenseIgnore" ? "23061-defense" : "23061-skill";
  return row.source.id;
}
function effectContext(id, rank, extra={}) {
  return { characterId:"1003", lightConeId:id, refinement:rank, stats:{atk:3000,critRate:50,critDamage:100}, baseStats:{atk:1000}, ...extra };
}

test("round6 light cones load from production and each authored rank table matches the pinned source values", async () => {
  const { data } = await loadProductionFixture();
  for (const [id, rows] of byCone) {
    const loaded=data.structuredModifiers.filter(row=>row.source.kind==="lightCone"&&row.source.id===id);
    assert.equal(loaded.length,rows.length,"production rows for "+id);
  }
  assert.equal(authored.length,13,"12 light-cone groups with two separately scoped 23061 components");
  for (const row of authored) assert.equal(row.provenance.sourceCommit,"dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  const crown=byCone.get("23061").find(row=>row.category==="defenseIgnore");
  assert.match(crown.activation.conditionText,/SPを4以上/,"fixed source parameter 3 requires four SP in one turn");
  assert.equal(byCone.get("23061").find(row=>row.category==="damageBonus").activation.inputKey,crown.activation.inputKey,"both components share the Crown state");
  for (const row of authored) {
    if (row.value.kind === "byRefinement" || row.value.kind === "perStackByRefinement") assert.deepEqual(row.value.values,values[rowKey(row)],row.id+" R1-R5");
  }
});

test("round6 direct-damage effects match independent formulas at all five refinements", async () => {
  const { data, engine }=await loadProductionFixture();
  for (const [id, rows] of byCone) for(let rank=1;rank<=5;rank++) for(const row of rows) {
    const extra=id==="23004"?{enemy:{debuffCount:1}}:{};
    const ctx=effectContext(id,rank,extra), inputs=inputFor(row);
    const item=runtime.buildCandidates([row],ctx,inputs)[0];
    assert.equal(item.enabled,true,row.id+" R"+rank+" enabled");
    const key=rowKey(row);
    const expected=values[key][rank-1]*(row.activation.mode==="stack"?2:1);
    assert.equal(item.value,expected,row.id+" R"+rank+" selected value");
    const type=row.target.attackTypes.includes("dot")?"dot":row.target.attackTypes.includes("skill")?"skill":"normal";
    const a=attack(type),applicable=runtime.applicableToAttack(item,a),input=makeRequest(a,10,{},[{...item,applicable}]);
    if(row.category==="dotDamage") {
      const base=engine.calculate(makeRequest(a,10,{},[])).nonCrit;
      assertClose(engine.calculate(input).nonCrit,base*(1+expected/100),row.id+" direct DoT");
    } else {
      assertMatchesIndependent(engine,input,row.id+" R"+rank);
    }
    const included=runtime.buildCandidates([row],ctx,{...inputs,[row.finalStatsInclusion.inputKey]:true})[0];
    assert.equal(included.enabled,false,row.id+" effect already in final input");
    assert.equal(included.includedInFinalStats,true);
    assert.equal(runtime.buildCandidates([row],ctx,JSON.parse(JSON.stringify(inputs)))[0].value,item.value,"save/restore "+row.id);
    assert.equal(runtime.buildCandidates([row],{...ctx,lightConeId:""},inputs).length,0,"unequip removes "+row.id);
    if(row.activation.mode==="toggle") assert.equal(runtime.buildCandidates([row],ctx,{[row.activation.inputKey]:false})[0].enabled,false,row.id+" OFF");
    if(row.activation.mode==="stack") assert.equal(runtime.buildCandidates([row],ctx,{[row.activation.inputKey]:0})[0].enabled,false,row.id+" zero stacks");
  }
});

test("23004 debuff-target damage is automatic only when the enemy debuff count is positive", async()=>{
  await loadProductionFixture();
  const row=byCone.get("23004")[0];
  for(let rank=1;rank<=5;rank++) for(const count of [0,1,3]) {
    const item=runtime.buildCandidates([row],effectContext("23004",rank,{enemy:{debuffCount:count}}),{})[0];
    assert.equal(item.automatic,true);
    assert.equal(item.enabled,count>0,"debuff count "+count);
    assert.equal(item.value,values["23004"][rank-1]);
  }
});

test("24003 modifies DoT only, not normal, skill, ultimate or follow-up attacks", async()=>{
  await loadProductionFixture();
  const row=byCone.get("24003")[0],ctx=effectContext("24003",5),item=runtime.buildCandidates([row],ctx,{[row.activation.inputKey]:true})[0];
  for(const type of ["normal","skill","ultimate","followUp","dot"]) assert.equal(runtime.applicableToAttack(item,attack(type)),type==="dot",type);
  assert.equal(runtime.buildCandidates([row],ctx,{[row.activation.inputKey]:false})[0].enabled,false);
});

test("23061 separates party-wide defense ignore from wearer-only skill damage and resolves a party provider", async()=>{
  const {engine}=await loadProductionFixture();
  const [defense,skill]=byCone.get("23061");
  for(let rank=1;rank<=5;rank++) {
    const inputs={[defense.activation.inputKey]:true};
    const selfContext=effectContext("23061",rank,{partyIds:["1002"]});
    const selfDefense=runtime.buildCandidates([defense],selfContext,inputs)[0];
    const selfSkill=runtime.buildCandidates([skill],selfContext,inputs)[0];
    assert.equal(selfDefense.value,values["23061-defense"][rank-1]);
    assert.equal(selfSkill.value,values["23061-skill"][rank-1]);
    const skillAttack=attack("skill");
    assertMatchesIndependent(engine,makeRequest(skillAttack,10,{},[{...selfDefense,applicable:true},{...selfSkill,applicable:true}]),"23061 wearer R"+rank);
    const partyContext={characterId:"1003",lightConeId:"20000",partyIds:["1002"],partyEquipment:[{characterId:"1002",lightConeId:"23061",refinement:rank}],stats:{atk:3000,critRate:50,critDamage:100},baseStats:{atk:1000}};
    const party=runtime.buildCandidates([defense,skill],partyContext,inputs);
    assert.equal(party.length,1,"only activeAlly-compatible party-wide defense ignore transfers");
    assert.equal(party[0].providerId,"1002");
    assert.equal(party[0].value,values["23061-defense"][rank-1]);
    assertMatchesIndependent(engine,makeRequest(attack("normal"),10,{},[{...party[0],applicable:true}]),"23061 provider R"+rank);
    assert.equal(runtime.buildCandidates([defense],{...partyContext,partyIds:[],partyEquipment:[]},inputs).length,0,"provider leaves party");
    assert.equal(runtime.buildCandidates([defense],partyContext,{[defense.activation.inputKey]:false})[0].enabled,false,"Crown state off");
  }
});

test("21047 and 23064 current speed states flow into Glamoth's existing effective-speed threshold",async()=>{
  const {data}=await loadProductionFixture();
  const glamoth=data.structuredModifiers.find(row=>row.id==="ornament:311:2pc:speed-damage");assert.ok(glamoth);
  for(const [id,speedValue] of [["21047",8],["23064",24]]) {
    const row=byCone.get(id)[0];
    for(let rank=1;rank<=5;rank++) {
      const ctx=effectContext(id,rank,{ornamentId:"311",stats:{atk:3000,critRate:50,critDamage:100,speed:130},baseStats:{atk:1000,speed:100}});
      const active=runtime.buildCandidates([row,glamoth],ctx,{[row.activation.inputKey]:true});
      const speed=active.find(item=>item.id===row.id), bonus=active.find(item=>item.id===glamoth.id);
      assert.equal(speed.value,values[id][rank-1]);assert.equal(speed.enabled,true);
      assert.equal(bonus.enabled,true,"speed +"+speedValue+"% crosses 135 threshold at R"+rank);
      assert.equal(bonus.value,130+values[id][rank-1]>=160?18:12);
      const off=runtime.buildCandidates([row,glamoth],ctx,{[row.activation.inputKey]:false}).find(item=>item.id===glamoth.id);
      assert.equal(off.enabled,false,"turning speed state off removes Glamoth activation");
    }
  }
});
