"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  fixedSourceSha, loadProductionFixture, runtime, makeRequest,
  independentDirectDamage, assertMatchesIndependent, assertClose, readJson
} = require("./helpers/hsrDirectVerification.cjs");

const attackFile = "games/hsr/data/calc/attacks-jade-gilgamesh-round13.json";
const modifierFile = "games/hsr/data/calc/modifiers-jade-gilgamesh-round13.json";
const nativeModifiers = "games/hsr/data/calc/modifiers-native-round7.json";
const jadeCurve = [60, 66, 72, 78, 84, 90, 97.5, 105, 112.5, 120];
const saberWindCurve = [300, 330, 360, 390, 420, 450, 487.5, 525, 562.5, 600];
const jadeProfile = {
  atk: 3317, hp: 7159, def: 2411, baseAtk: 1043, baseHp: 1217, baseDef: 987,
  critRate: 37, critDamage: 143, damageBonus: 19,
  enemyLevel: 82, resistance: 27, toughnessActive: true,
  defenseReduction: 11, defenseIgnore: 4, resistancePenetration: 7, takenDamage: 9
};
const saber = {
  characterId: "1014", element: "Wind", level: 80, eidolon: 0,
  stats: { atk: 2841.5, hp: 7822.25, def: 1249.75, critRate: 41.25, critDamage: 163.5 },
  baseStats: { atk: 945, hp: 1200, def: 600 },
  damageBonuses: { Wind: 32.25 }, defenseIgnore: 8.5, resistancePenetration: 6.25
};
const gilgamesh = {
  characterId: "1509", element: "Thunder", level: 80, eidolon: 0,
  stats: { atk: 4872.25, hp: 9999, def: 3000, critRate: 5, critDamage: 10 },
  baseStats: { atk: 1300, hp: 1000, def: 700 },
  damageBonuses: { Thunder: 12 }, defenseIgnore: 0, resistancePenetration: 0
};
const jointContext = {
  characterId: "1509", characterElement: "Thunder", partyIds: ["1509", "1014"],
  partyEidolons: { "1509": 0, "1014": 0 },
  partyReferences: { "1509": gilgamesh, "1014": saber },
  stats: gilgamesh.stats, baseStats: gilgamesh.baseStats,
  enemy: {
    count: 1, level: 83, resistance: 20, resistances: { Thunder: 20, Wind: 17 },
    defenseReduction: 12.5, defenseIgnore: 0, resistancePenetration: 0,
    takenDamage: 11.5, toughnessActive: true
  }
};

function install(data, attack) {
  const index = data.attacks.findIndex((item) => item.id === attack.id);
  if (index < 0) data.attacks.push(attack);
  else data.attacks[index] = attack;
}

function jadeCandidates(level, stacks, included = false) {
  const rows = readJson(nativeModifiers).modifiers.filter((row) =>
    ["traceNode:1314:1314103:pawned-asset-atk", "trace:1314:131404:pawned-asset-crit-damage"].includes(row.id));
  assert.equal(rows.length, 2, "uses the existing Jade Pawned Asset ATK and Talent CD definitions");
  const inputs = { "jade-pawned-asset-stacks": stacks };
  if (included) {
    inputs["traceNode:1314:1314103:pawned-asset-atk-in-final"] = true;
    inputs["trace:1314:131404:pawned-asset-crit-damage-in-final"] = true;
  }
  const context = {
    characterId: "1314", eidolon: 0, stats: jadeProfile, baseStats: { atk: jadeProfile.baseAtk },
    traceLevelFor: (source) => source?.skillId === "131404" ? level : 10
  };
  return runtime.buildCandidates(rows, context, inputs).map((candidate) => ({
    ...candidate,
    applicable: candidate.applicable && runtime.applicableToAttack(candidate, {
      id: "131404", type: "followUp", attackType: "followUp", element: "Quantum"
    })
  }));
}

function partyCandidate(record, level, enabled) {
  return runtime.buildCandidates([record], {
    ...jointContext,
    traceLevelFor: () => level
  }, { "gilgamesh-link-followup-ready": enabled })[0];
}

function independentSaberRequest(reference, multiplier) {
  const attack = {
    id: "supplemental:trace:1509:150905:saber-wind-followup",
    type: "followUp", attackType: "followUp", element: "Wind", target: "single",
    scalingStat: "atk", multiplier, hitCount: 1, canCrit: true,
    damageFormula: "statMultiplier", multipliers: [multiplier]
  };
  return makeRequest(attack, 1, {
    characterLevel: reference.character.level, eidolon: reference.character.eidolon,
    atk: reference.character.stats.atk, hp: reference.character.stats.hp, def: reference.character.stats.def,
    baseAtk: reference.character.baseStats.atk, baseHp: reference.character.baseStats.hp, baseDef: reference.character.baseStats.def,
    critRate: reference.character.stats.critRate, critDamage: reference.character.stats.critDamage,
    damageBonus: reference.character.stats.damageBonus,
    enemyLevel: reference.enemy.level, resistance: reference.enemy.resistance,
    defenseReduction: reference.enemy.defenseReduction, defenseIgnore: reference.enemy.defenseIgnore,
    resistancePenetration: reference.enemy.resistancePenetration, takenDamage: reference.enemy.takenDamage,
    toughnessActive: true, enemyCount: 1
  });
}

test("Round13 records are pinned, bounded, and do not duplicate prior Jade/Gilgamesh rows", () => {
  const attacks = readJson(attackFile);
  const modifiers = readJson(modifierFile);
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  assert.deepEqual(attacks.overrides.map((item) => item.id), ["131404","1509051","1314021"]);
  assert.equal(attacks.overrides[1].modifierInputKey,null,"assumed co-attack needs no availability toggle");
  assert.equal(attacks.overrides[0].provenance.sourceCommit, fixedSourceSha);
  assert.deepEqual(attacks.overrides[0].multipliers, jadeCurve);
  assert.deepEqual(attacks.overrides[0].numericModifierInputs, [{
    inputKey: "jade-pawned-asset-stacks",
    label: "追撃ダメージ参照時点の質草層数（獲得5層を含めた値）",
    minimum: 0, maximum: 50, integer: true
  }]);
  assert.equal(attacks.overrides[0].numericModifierInputs[0].default, undefined, "current layers must be explicitly supplied");
  assert.equal(attacks.overrides[0].enforceSnapshotContract, true);
  assert.equal(attacks.overrides[0].requiredToughnessActive, null, "source does not require an unbroken enemy");
  assert.equal(attacks.overrides[0].requiresNonWeakTarget, null, "source does not require non-weakness");
  assert.equal(modifiers.modifiers.length, 2);
  const wind = modifiers.modifiers[0];
  assert.equal(wind.source.skillId, "150905");
  assert.equal(wind.provenance.sourceCommit, fixedSourceSha);
  assert.deepEqual(wind.value.values, saberWindCurve);
  assert.equal(wind.activation.mode, "always", "party membership exposes an assumed single co-attack without availability toggles");
  assert.equal(wind.supplementalAttack.statReference, "selectedParty");
  assert.equal(wind.supplementalAttack.requiredStatReferenceId, "1014");
  assert.equal(wind.supplementalAttack.element, "Wind");
});

test("Jade 131404 FUA calculates all E0 Talent levels at an explicit effective 0–50 Pawned Asset snapshot", async () => {
  const { data, engine } = await loadProductionFixture();
  const attack = readJson(attackFile).overrides[0];
  install(data, attack);
  assert.equal(attack.sourceSkillId, "131404");
  assert.equal(attack.maximumEidolon, 0);

  for (let level = 1; level <= 10; level += 1) {
    for (const stacks of [0, 1, 49, 50]) {
      const input = makeRequest(attack, level, { ...jadeProfile, enemyCount: 1 }, jadeCandidates(level, stacks));
      input.attack.multiplier = jadeCurve[level - 1];
      input.modifierInputs = { "jade-pawned-asset-stacks": stacks };
      assertMatchesIndependent(engine, input, `Jade 131404 Lv${level}, effective stacks ${stacks}`);
    }
  }
});

test("Jade FUA requires explicit current layers and does not double-add stacks already in final ATK/CD", async () => {
  const { data, engine } = await loadProductionFixture();
  const attack = readJson(attackFile).overrides[0];
  install(data, attack);
  const missing = makeRequest(attack, 10, { ...jadeProfile, enemyCount: 1 }, jadeCandidates(10, 0));
  missing.attack.multiplier = jadeCurve[9];
  assert.equal(engine.calculate(missing).supported, false, "missing current stack input blocks only this FUA result");

  for (let level = 1; level <= 10; level += 1) {
    for (const stacks of [0, 1, 49, 50]) {
      const finalStats = {
        ...jadeProfile,
        atk: jadeProfile.atk + jadeProfile.baseAtk * 0.5 * stacks / 100,
        critDamage: jadeProfile.critDamage + [1.2, 1.32, 1.44, 1.56, 1.68, 1.8, 1.95, 2.1, 2.25, 2.4][level - 1] * stacks
      };
      const modifiers = jadeCandidates(level, stacks, true);
      assert.ok(modifiers.every((candidate) => !candidate.enabled), "included-in-final stack effects are excluded from calculation");
      const input = makeRequest(attack, level, { ...finalStats, enemyCount: 1 }, modifiers);
      input.attack.multiplier = jadeCurve[level - 1];
      input.modifierInputs = {
        "jade-pawned-asset-stacks": stacks,
        "traceNode:1314:1314103:pawned-asset-atk-in-final": true,
        "trace:1314:131404:pawned-asset-crit-damage-in-final": true
      };
      assertMatchesIndependent(engine, input, `Jade final stats already contain ${stacks} stacks at Lv${level}`);
    }
  }
});

test("Gilgamesh 150905 Wind component uses only Saber 1014's selected completed snapshot", async () => {
  const { data, engine } = await loadProductionFixture();
  const row = readJson(modifierFile).modifiers[0];
  const ownerInput = { "gilgamesh-saber-owner": "1014" };
  for (let level = 1; level <= 10; level += 1) {
    const candidate = partyCandidate(row, level, true);
    assert.equal(candidate.enabled, true);
    const reference = runtime.supplementalReference(candidate, jointContext, ownerInput);
    assert.equal(reference.supported, true, reference.reason);
    assert.equal(reference.sourceCharacterId, "1509");
    assert.equal(reference.statReferenceId, "1014");
    assert.equal(reference.damageOwnerId, "1014");
    assert.equal(reference.triggerCharacterId,null,"the unit whose attack reached eight is not inferred");
    assert.equal(reference.character.stats.atk, saber.stats.atk);
    assert.equal(reference.character.stats.atk === gilgamesh.stats.atk, false, "the wind hit does not borrow Gilgamesh ATK");

    const multiplier = row.value.values[level - 1];
    assert.equal(multiplier, saberWindCurve[level - 1]);
    const input = independentSaberRequest(reference, multiplier);
    const oracle = independentDirectDamage(input);
    const result = engine.calculate(input);
    assert.notEqual(result.supported, false);
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], oracle[key], `Saber Wind 150905 Lv${level} ${key}`);
  }

  const toggleOff = partyCandidate(row, 10, false);
  assert.equal(toggleOff.enabled, true, "an assumed attack result needs no activation toggle");
  assert.equal(runtime.supplementalReference(toggleOff, jointContext, ownerInput).supported, true, "the reference is valid while the optional state remains off");
  assert.equal(runtime.supplementalReference(partyCandidate(row, 10, true), { ...jointContext, partyIds: ["1509"] }, ownerInput).supported, false, "Saber leaving the party disables this supplemental result");
  const otherOwner = { ...jointContext, partyIds: ["1509", "1014", "1001"], partyReferences: { ...jointContext.partyReferences, "1001": { ...saber, characterId: "1001" } } };
  assert.equal(runtime.supplementalReference(partyCandidate(row, 10, true), otherOwner, { "gilgamesh-saber-owner": "1001" }).supported, false, "the wind component cannot select a different ally");
  assert.equal(runtime.supplementalReference(partyCandidate(row, 10, true), { ...jointContext, characterId: "1314", partyIds: ["1314", "1014"] }, ownerInput).supported, false, "Gilgamesh leaving the party disables his provided co-attack");
});

test('Jade Skill gives only the selected other Debt Collector +30 SPD and updates Glamoth automatically at all E0 levels',async()=>{
 const {data,engine}=await loadProductionFixture(),rows=data.structuredModifiers.filter(x=>x.id==='trace:1314:131402:debt-collector-speed'||x.id==='ornament:311:2pc:speed-damage');
 const context={characterId:'1003',partyIds:['1314'],partyEidolons:{'1314':0},stats:{speed:132,atk:3000},baseStats:{speed:100},ornamentId:'311',traceLevelFor:()=>10};
 for(let level=1;level<=10;level++){
  const ctx={...context,traceLevelFor:()=>level},off=runtime.buildCandidates(rows,ctx,{}),on=runtime.buildCandidates(rows,ctx,{'jade-debt-collector-active':true});
  const speed=on.find(x=>x.id.startsWith('trace:1314'));assert.equal(speed.value,30);assert.equal(speed.enabled,true);assert.equal(speed.providerId,'1314');assert.equal(off.find(x=>x.id.startsWith('trace:1314')).enabled,false);
  assert.equal(on.find(x=>x.id.startsWith('ornament:311')).value,18);assert.equal(off.find(x=>x.id.startsWith('ornament:311')).enabled,false);
  const req=makeRequest({id:'debt-fixture',type:'normal',element:'Fire',scalingStat:'atk',multipliers:[100],canCrit:true},1,{atk:3000},on),r=engine.calculate(req);assertClose(r.expected,3000*.5*.8*.9*1.18*1.5,'SPD support reaches threshold damage');
  const included=runtime.buildCandidates(rows,{...ctx,stats:{...ctx.stats,speed:162}},{'jade-debt-collector-active':true,'jade-debt-collector-speed-in-final':true});assert.equal(included.find(x=>x.id.startsWith('trace:1314')).enabled,false);assert.equal(included.find(x=>x.id.startsWith('ornament:311')).value,18);
 }
 assert.equal(runtime.buildCandidates(rows.filter(x=>x.source.id==='1314'),{...context,characterId:'1314',partyIds:[]},{'jade-debt-collector-active':true}).length,0,'self debt collector receives no SPD');
 assert.equal(runtime.buildCandidates(rows.filter(x=>x.source.id==='1314'),{...context,partyIds:[]},{'jade-debt-collector-active':true}).length,0,'removed provider gives no SPD');
});
