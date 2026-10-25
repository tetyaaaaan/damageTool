"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  loadProductionFixture,
  attackOf,
  makeRequest,
  assertClose,
  assertMatchesIndependent,
  independentDirectDamage,
  fixedSourceSha,
  runtime
} = require("./helpers/hsrDirectVerification.cjs");

const cases = [
  { id: "130601", characterId: "1306", name: "独り芝居", type: "normal", traceKey: "normal", scalingStat: "atk", element: "Quantum", multipliers: [50, 60, 70, 80, 90, 100], variant: "previous" },
  { id: "1130601", characterId: "1306", name: "独り芝居", type: "normal", traceKey: "normal", scalingStat: "atk", element: "Quantum", multipliers: [50, 60, 70, 80, 90, 100], variant: "enhanced" },
  { id: "121701", characterId: "1217", name: "令旗・風雨招来", type: "normal", traceKey: "normal", scalingStat: "hp", element: "Wind", multipliers: [25, 30, 35, 40, 45, 50], variant: "previous" },
  { id: "1121701", characterId: "1217", name: "令旗・風雨招来", type: "normal", traceKey: "normal", scalingStat: "hp", element: "Wind", multipliers: [25, 30, 35, 40, 45, 50], variant: "enhanced" },
  { id: "110101", characterId: "1101", name: "疾風の弾丸", type: "normal", traceKey: "normal", scalingStat: "atk", element: "Wind", multipliers: [50, 60, 70, 80, 90, 100], variant: undefined }
];

const profiles = [
  {
    characterLevel: 80, eidolon: 0, atk: 3175.25, hp: 9412.5, def: 1288.75,
    baseAtk: 1043, baseHp: 1287, baseDef: 743,
    critRate: 37.5, critDamage: 113.25, damageBonus: 27.5,
    enemyLevel: 83, resistance: 30, toughnessActive: true,
    defenseReduction: 12.5, defenseIgnore: 7.5, resistancePenetration: 6.25, takenDamage: 11.5
  },
  {
    characterLevel: 80, eidolon: 0, atk: 2143.75, hp: 14321.25, def: 3541.5,
    baseAtk: 891, baseHp: 1523, baseDef: 1009,
    critRate: 71.25, critDamage: 87.5, damageBonus: 11.75,
    enemyLevel: 76, resistance: 10, toughnessActive: false,
    defenseReduction: 4.25, defenseIgnore: 18.5, resistancePenetration: 13.75, takenDamage: 5.5
  }
];

function attackInput(attack, level, profile, modifiers = []) {
  const input = makeRequest(attack, level, profile, modifiers);
  input.character.stats = {
    ...input.character.stats,
    atk: profile.atk,
    hp: profile.hp,
    def: profile.def,
    critRate: profile.critRate,
    critDamage: profile.critDamage,
    damageBonus: profile.damageBonus
  };
  input.character.baseStats = { atk: profile.baseAtk, hp: profile.baseHp, def: profile.baseDef };
  return input;
}

test("Sparkle, Huohuo, and Bronya E0 basic attacks expose only the verified level-1-to-6 direct scope", async () => {
  const { data, engine } = await loadProductionFixture();
  for (const spec of cases) {
    const attack = attackOf(data, spec.id);
    assert.equal(attack.support?.status, "calculable", spec.id + " is explicitly calculable");
    assert.equal(attack.support?.verified, true, spec.id + " carries verification status");
    assert.equal(attack.characterId, spec.characterId, spec.id + " owner");
    assert.equal(attack.name, spec.name, spec.id + " official name");
    assert.equal(attack.type, spec.type, spec.id + " category");
    assert.equal(attack.traceKey, spec.traceKey, spec.id + " trace");
    assert.equal(attack.scalingStat, spec.scalingStat, spec.id + " reference stat");
    assert.equal(attack.element, spec.element, spec.id + " element");
    assert.equal(attack.target, "single", spec.id + " target");
    assert.equal(attack.canCrit, true, spec.id + " can crit");
    assert.equal(attack.maximumEidolon, 0, spec.id + " is limited to E0");
    assert.equal(attack.maximumTraceLevel, 6, spec.id + " uses E0 trace ceiling");
    assert.equal(attack.enemyCountExact, 1, spec.id + " uses one target");
    assert.deepEqual(Array.from(attack.multipliers).slice(0, 6), spec.multipliers, spec.id + " fixed-source Lv1-6 coefficients");
    assert.equal(attack.provenance?.sourceCommit, fixedSourceSha, spec.id + " fixed StarRailRes source");
    assert.ok(attack.calculationNote?.length > 20, spec.id + " explains direct-damage scope");
    if (spec.variant) assert.equal(attack.variant, spec.variant, spec.id + " release variant");
    else assert.equal(attack.variant, undefined, spec.id + " has no release variant");
    assert.equal(engine.unsupportedAttackReason(attack), "", spec.id + " passes engine attack validation");
  }
  assert.deepEqual(Array.from(attackOf(data, "110101").multipliers), [50, 60, 70, 80, 90, 100, 110, 120, 130, 140],
    "Bronya retains the existing Lv7-10 coefficient data even though this test scope is E0/Lv1-6");
});

test("all five E0 basics match independent non-crit, crit, and expected damage across six levels and asymmetric profiles", async () => {
  const { data, engine } = await loadProductionFixture();
  for (const spec of cases) {
    const attack = attackOf(data, spec.id);
    for (let level = 1; level <= 6; level++) {
      for (let index = 0; index < profiles.length; index++) {
        const input = attackInput(attack, level, profiles[index]);
        assertMatchesIndependent(engine, input, `${spec.id} Lv${level} profile${index + 1}`);
      }
    }
  }
});

test("each basic uses only its declared reference stat and does not recalculate final stats", async () => {
  const { data, engine } = await loadProductionFixture();
  for (const spec of cases) {
    const attack = attackOf(data, spec.id);
    const baseline = attackInput(attack, 4, profiles[0]);
    const baselineResult = assertMatchesIndependent(engine, baseline, spec.id + " reference baseline");

    const refConfig = { ...profiles[0], [spec.scalingStat]: profiles[0][spec.scalingStat] + 731.25 };
    const refInput = attackInput(attack, 4, refConfig);
    const refResult = assertMatchesIndependent(engine, refInput, spec.id + " reference stat changed");
    assert.ok(refResult.nonCrit > baselineResult.nonCrit, spec.id + " responds to " + spec.scalingStat);

    for (const unrelatedStat of ["atk", "hp", "def"]) {
      if (unrelatedStat === spec.scalingStat) continue;
      const changedProfile = { ...profiles[0], [unrelatedStat]: profiles[0][unrelatedStat] + 731.25 };
      const changed = attackInput(attack, 4, changedProfile);
      const changedResult = engine.calculate(changed);
      assertClose(changedResult.nonCrit, baselineResult.nonCrit, `${spec.id} ignores non-reference ${unrelatedStat}`);
    }

    const baseOnlyChanged = attackInput(attack, 4, { ...profiles[0], baseAtk: profiles[0].baseAtk + 999, baseHp: profiles[0].baseHp + 777, baseDef: profiles[0].baseDef + 555 });
    assertClose(engine.calculate(baseOnlyChanged).nonCrit, baselineResult.nonCrit,
      `${spec.id} treats entered final stats as complete and does not add base stats again`);

    const breakChanged = attackInput(attack, 4, { ...profiles[0], breakEffect: 999 });
    assertClose(engine.calculate(breakChanged).nonCrit, baselineResult.nonCrit, `${spec.id} ignores break effect for direct basic damage`);
  }
});

test("final user-entered crit, damage bonus, and enemy terms are consumed once for Sparkle basics", async () => {
  const { data, engine } = await loadProductionFixture();
  for (const id of ["130601", "1130601"]) {
    const attack = attackOf(data, id);
    const input = attackInput(attack, 6, profiles[0]);
    assertMatchesIndependent(engine, input, id + " entered final stat baseline");
    input.character.stats.critDamage += 15.25;
    input.character.stats.damageBonus += 8.5;
    input.enemy.resistancePenetration += 10;
    input.enemy.takenDamage += 12;
    assertMatchesIndependent(engine, input, id + " entered final crit/DMG and enemy conditions");
  }
});

test("Robin skill damage is optional, scoped to an enrolled provider, and adds once to direct basic damage", async () => {
  const { data, engine } = await loadProductionFixture();
  const attack = attackOf(data, "130601");
  const robinRecord = data.structuredModifiers.find((item) => item.id === "trace:1309:130902:party-damage");
  assert.ok(robinRecord, "the existing Robin skill candidate is reused");
  const context = { characterId: "1306", partyIds: ["1309"], partyEidolons: { "1309": 0 }, traceLevelFor: () => 10 };
  const off = runtime.buildCandidates([robinRecord], context, { "robin-skill-damage-active": false });
  assert.equal(off.length, 1);
  assert.equal(off[0].enabled, false, "listing a candidate does not activate it");
  const absentProvider = runtime.buildCandidates([robinRecord], { ...context, partyIds: [] }, { "robin-skill-damage-active": true });
  assert.equal(absentProvider.length, 0, "support disappears when Robin leaves the party");
  const on = runtime.buildCandidates([robinRecord], context, { "robin-skill-damage-active": true });
  assert.equal(on.length, 1);
  assert.equal(on[0].value, 50, "Robin skill Lv10 supplies 50% DMG bonus");
  const candidate = { ...on[0], applicable: runtime.applicableToAttack(on[0], attack) };
  assert.equal(candidate.applicable, true);
  const input = attackInput(attack, 6, profiles[0], [candidate]);
  const result = assertMatchesIndependent(engine, input, "Sparkle basic with Robin skill");
  const baseline = assertMatchesIndependent(engine, attackInput(attack, 6, profiles[0]), "Sparkle basic without Robin");
  assertClose(result.nonCrit / baseline.nonCrit, (1 + (profiles[0].damageBonus + 50) / 100) / (1 + profiles[0].damageBonus / 100), "Robin is added in the DMG bonus bucket exactly once");
});

test("Bronya's E0 self crit override affects only her basic, while her field DMG effect remains a party effect", async () => {
  const { data, engine } = await loadProductionFixture();
  const basic = attackOf(data, "110101");
  const followUp = attackOf(data, "1101041");
  assert.equal(followUp.requiredEidolon, 4, "Bronya follow-up is unavailable at E0");

  const critOverrideRecord = data.structuredModifiers.find((item) => item.id === "traceNode:1101:1101101:normal-crit-override");
  const fieldDamageRecord = data.structuredModifiers.find((item) => item.id === "traceNode:1101:1101103:party-damage");
  assert.ok(critOverrideRecord, "Bronya A2 structured record is present");
  assert.ok(fieldDamageRecord, "Bronya A6 structured record is present");

  const selfContext = { characterId: "1101", eidolon: 0, partyIds: [] };
  const selfCandidate = runtime.buildCandidates([critOverrideRecord], selfContext, {});
  assert.equal(selfCandidate.length, 1);
  assert.equal(runtime.applicableToAttack(selfCandidate[0], basic), true);
  assert.equal(runtime.applicableToAttack(selfCandidate[0], followUp), false, "A2 does not leak onto follow-up attacks");
  const selfModifier = { ...selfCandidate[0], applicable: runtime.applicableToAttack(selfCandidate[0], basic) };
  const input = attackInput(basic, 6, profiles[0], [selfModifier]);
  const result = engine.calculate(input);
  assert.notEqual(result.supported, false);
  const oracleInput = attackInput(basic, 6, { ...profiles[0], critRate: 100 });
  const expected = independentDirectDamage(oracleInput);
  for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], expected[key], "Bronya A2 independent " + key);
  assertClose(result.crit, result.expected, "native 100% critical rate makes EV equal critical hit");

  const native = runtime.buildCandidates([critOverrideRecord, fieldDamageRecord], selfContext, {}).map(c => ({...c, applicable: runtime.applicableToAttack(c, basic)}));
  for (let lv=1;lv<=6;lv++) for (const profile of profiles) {
    const actual=engine.calculate(attackInput(basic,lv,profile,native));
    const independent=independentDirectDamage(attackInput(basic,lv,{...profile,critRate:100},[{category:"damageBonus",value:10,enabled:true,applicable:true}]));
    for (const key of ["nonCrit","crit","expected"]) assertClose(actual[key],independent[key],"Bronya all native effects Lv"+lv+" "+key);
  }

  const partyContext = { characterId: "1306", partyIds: ["1101"], partyEidolons: { "1101": 0 } };
  const selectedField = runtime.buildCandidates([fieldDamageRecord], partyContext, {});
  assert.equal(selectedField.length, 1, "field bonus candidate is available only while Bronya is in party");
  assert.equal(selectedField[0].enabled, true);
  assert.equal(selectedField[0].value, 10);
  assert.equal(runtime.buildCandidates([fieldDamageRecord], { ...partyContext, partyIds: [] }, {}).length, 0,
    "field bonus disappears when Bronya leaves");
  const fieldModifier = { ...selectedField[0], applicable: runtime.applicableToAttack(selectedField[0], attackOf(data, "130601")) };
  const sparkleInput = attackInput(attackOf(data, "130601"), 6, profiles[0], [fieldModifier]);
  const withField = assertMatchesIndependent(engine, sparkleInput, "Sparkle basic with Bronya field bonus");
  const withoutField = assertMatchesIndependent(engine, attackInput(attackOf(data, "130601"), 6, profiles[0]), "Sparkle basic without Bronya field bonus");
  assertClose(withField.nonCrit / withoutField.nonCrit, (1 + (profiles[0].damageBonus + 10) / 100) / (1 + profiles[0].damageBonus / 100), "Bronya A6 is added exactly once");
});

test("Sparkle's support-only candidates are not applied to Sparkle's own basic", async () => {
  const { data } = await loadProductionFixture();
  const partyOnly = data.structuredModifiers.filter((item) => item.providerScope === "party" && String(item.source?.id) === "1306");
  assert.ok(partyOnly.length > 0, "Sparkle support records are present");
  const ownCandidates = runtime.buildCandidates(partyOnly, { characterId: "1306", eidolon: 0, partyIds: [] }, {
    "sparkle-enhanced-skill-active": true,
    "sparkle-enhanced-cipher-active": true,
    "sparkle-enhanced-figment-stacks": 3
  });
  assert.equal(ownCandidates.length, 0, "party-only Sparkle effects cannot auto-apply to her own damage");
});
