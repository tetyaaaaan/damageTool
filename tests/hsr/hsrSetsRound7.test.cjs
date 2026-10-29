"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  readJson, runtime, fixedSourceSha, loadProductionFixture, makeRequest,
  assertClose, assertMatchesIndependent
} = require("./helpers/hsrDirectVerification.cjs");
const records = readJson("games/hsr/data/calc/modifiers-sets-round7.json").modifiers;
const get = id => records.find(item => item.id === id);
const candidate = (record, context, inputs = {}) => runtime.buildCandidates([record], context, inputs)[0];
const attack = { id: "round7-ornament-normal", type: "normal", attackType: "normal", element: "Physical", scalingStat: "atk", multiplier: 100, multipliers: [100], traceLevel: 1 };

for (const item of records) test("round7 record " + item.id + " is fixed-SHA and 2pc gated", () => {
  assert.equal(item.provenance.sourceCommit, fixedSourceSha);
  assert.equal(item.source.kind, "ornament");
  assert.equal(item.source.setPieces, 2);
  assert.equal(item.support.verified, true);
});

test("production loader includes Round7 records once and final-input rows never add damage", async () => {
  const { data } = await loadProductionFixture();
  for (const item of records) assert.equal(data.structuredModifiers.filter(row => row.id === item.id).length, 1, item.id);
  const finalRows = records.filter(item => item.inputPolicy === "includedInFinalStats");
  assert.equal(finalRows.length, 7, "seven permanent properties are separately tracked as final-input rows");
  assert.ok(finalRows.every(item => item.support.status === "displayOnly"));
  assert.ok(records.filter(item => item.support.status === "calculable").every(item => item.inputPolicy === "conditional"));
});

test("Celestial Differentiator applies CR+60 only when first-attack state is selected and CD meets120", async () => {
  const { engine } = await loadProductionFixture();
  const row = get("ornament:305:2pc:first-attack-crit-rate");
  const context = cd => ({ characterId: "1001", ornamentId: "305", stats: { atk: 3000, critRate: 50, critDamage: cd }, baseStats: { atk: 1000 } });
  const below = candidate(row, context(300), { [row.activation.inputKey]: true, "pre-combat-crit-damage": 119.99 });
  assert.equal(below.activation.active, false);
  assert.equal(below.enabled, false);
  const thresholdOff = candidate(row, context(50), { "pre-combat-crit-damage": 120 });
  assert.equal(thresholdOff.activation.active, false, "no unnecessary first-attack state means no bonus");
  const activeInput = { [row.activation.inputKey]: true, "pre-combat-crit-damage": 120 };
  const active = candidate(row, context(50), activeInput);
  assert.equal(active.activation.active, true);
  assert.equal(active.value, 60);
  assert.equal(active.valueInput.value, 120, "the numeric UI input is the battle-start CRIT DMG, separate from current CRIT DMG");
  const missing = candidate(row, context(300), { [row.activation.inputKey]: true });
  assert.equal(missing.activation.unresolved, true, "missing battle-start CRIT DMG is not inferred from current CRIT DMG");
  assert.equal(missing.enabled, false);
  const result = assertMatchesIndependent(engine, makeRequest(attack, 1, { atk: 3000, critRate: 50, critDamage: 100 }, [active]), "first-attack CR+60 at CD120");
  assertClose(result.nonCrit, 1080, "CR does not alter nonCrit");
  assertClose(result.crit, 2160, "CR capped at100 makes expected result fully critical");
  assertClose(result.expected, 2160, "CR capped at100 expected value");
  assert.equal(candidate(row, { ...context(50), ornamentId: "" }, activeInput), undefined, "removing the set removes this effect");
  assert.equal(candidate(row, context(50), { ...activeInput, [row.finalStatsInclusion.inputKey]: true }).enabled, false, "pre-included CR is not added again");
  const restored = JSON.parse(JSON.stringify(activeInput));
  assert.equal(candidate(row, context(50), restored).activation.active, true, "the condition survives saved-state serialization");
});

test("Izumo auto-applies CR+12 for another same-Path ally, with no toggle when the lineup differs", async () => {
  const { engine } = await loadProductionFixture();
  const row = get("ornament:314:2pc:same-path-ally-crit-rate");
  const contextFor = (ownPath, otherPath) => ({ characterId: "1001", characterElement: "Fire", ornamentId: "314", partyIds: ["1002"], partyPaths: { "1001": ownPath, "1002": otherPath }, stats: { atk: 3000, critRate: 50, critDamage: 100 }, baseStats: { atk: 1000 } });
  const mismatch = candidate(row, contextFor("Hunt", "Harmony"));
  assert.equal(mismatch.activation.active, false);
  assert.equal(mismatch.automatic, true);
  const match = candidate(row, contextFor("Hunt", "Hunt"));
  assert.equal(match.activation.active, true);
  assert.equal(match.activation.inputValue, 1);
  assert.equal(match.automatic, true);
  const result = assertMatchesIndependent(engine, makeRequest(attack, 1, { atk: 3000, critRate: 50, critDamage: 100 }, [match]), "same-Path ally auto CR+12");
  assertClose(result.nonCrit, 1080, "CR does not alter nonCrit");
  assertClose(result.expected, 1749.6, "CR rises from50% to62%");
  const missing = candidate(row, { ...contextFor("Hunt", "Hunt"), partyPaths: { "1001": "Hunt" } });
  assert.equal(missing.activation.unresolved, true, "missing teammate Path data is not guessed");
  assert.equal(missing.enabled, false, "an unresolved Path requirement excludes only Izumo's conditional CR");
  assert.equal(candidate(row, { ...contextFor("Hunt", "Hunt"), ornamentId: "" }), undefined, "removing the set removes the effect");
});

test("Bone Collection auto-applies CD+28 at Max HP5000 and not below", async () => {
  const { engine } = await loadProductionFixture();
  const row = get("ornament:319:2pc:max-hp-crit-damage");
  const contextFor = hp => ({ characterId: "1001", ornamentId: "319", stats: { hp, atk: 3000, critRate: 50, critDamage: 100 }, baseStats: { hp: 1000, atk: 1000 } });
  const below = candidate(row, contextFor(4999.99));
  assert.equal(below.activation.active, false);
  const at = candidate(row, contextFor(5000));
  assert.equal(at.activation.active, true);
  assert.equal(at.automatic, true);
  assert.equal(at.value, 28);
  const output = assertMatchesIndependent(engine, makeRequest(attack, 1, { atk: 3000, critRate: 50, critDamage: 100 }, [at]), "Max HP5000 CD+28");
  assertClose(output.nonCrit, 1080, "CD does not alter nonCrit");
  assertClose(output.crit, 2462.4, "critical damage multiplier 228%");
  assertClose(output.expected, 1771.2, "expected damage at CR50/CD128");
  assert.equal(candidate(row, { ...contextFor(5000), ornamentId: "" }), undefined, "removing the set removes the effect");
  assert.equal(candidate(row, contextFor(5000), { [row.finalStatsInclusion.inputKey]: true }).enabled, false, "pre-included CD is not duplicated");
});

test("Bone Collection checks HP after an independent A2-style HP+10% support without feedback", async () => {
  const { engine } = await loadProductionFixture();
  const row = get("ornament:319:2pc:max-hp-crit-damage");
  const hpSupport = {
    id: "round7-test-bailu-a2-hp-support",
    source: { kind: "manual", id: "round7-test-bailu-a2" },
    name: "検証用・白露A2相当の最大HP+10%",
    description: "独立した味方支援後の最大HP閾値を検証するための固定補正です。",
    category: "statPercent", stat: "hp", unit: "percent", value: { kind: "fixed", fixed: 10 },
    target: { owner: "self", attackTypes: ["all"], elements: [] },
    activation: { mode: "toggle", conditionText: "検証用のHP支援中", inputKey: "round7-test-hp-support-active", default: false },
    stacking: { group: "round7-test-bailu-a2-hp-support", rule: "nonStacking" },
    calculation: { stage: "baseStats", operation: "add" },
    inputPolicy: "conditional",
    finalStatsInclusion: { inputKey: "round7-test-hp-support-in-final", inputLabel: "検証用HP支援を最終HPに反映済み" },
    support: { status: "calculable", verified: true }
  };
  const context = { characterId: "1001", ornamentId: "319", stats: { hp: 4990, atk: 3000, critRate: 50, critDamage: 100 }, baseStats: { hp: 1000, atk: 1000 } };
  const off = runtime.buildCandidates([hpSupport, row], context, {});
  const offSupport = off.find(item => item.id === hpSupport.id), offRelic = off.find(item => item.id === row.id);
  assert.equal(offSupport.enabled, false);
  assert.equal(offRelic.activation.active, false, "HP4990 stays below the set threshold when the support is off");

  const active = runtime.buildCandidates([hpSupport, row], context, { [hpSupport.activation.inputKey]: true });
  const activeSupport = active.find(item => item.id === hpSupport.id), activeRelic = active.find(item => item.id === row.id);
  assert.equal(activeSupport.enabled, true);
  assert.equal(activeRelic.activation.active, true, "HP+10% moves current max HP from4990 to5090");
  assert.equal(activeRelic.thresholdReferenceValue, 5090);
  assert.equal(activeRelic.value, 28);
  const output = assertMatchesIndependent(engine, makeRequest(attack, 1, { atk: 3000, critRate: 50, critDamage: 100 }, [activeSupport, activeRelic]), "post-support Max HP5090 reaches the Bone Collection threshold");
  assertClose(output.expected, 1771.2, "the independent HP support unlocks CD+28 once");

  const alreadyInFinal = runtime.buildCandidates([hpSupport, row], { ...context, stats: { ...context.stats, hp: 5090 } }, {
    [hpSupport.activation.inputKey]: true,
    [hpSupport.finalStatsInclusion.inputKey]: true
  });
  const includedSupport = alreadyInFinal.find(item => item.id === hpSupport.id), includedRelic = alreadyInFinal.find(item => item.id === row.id);
  assert.equal(includedSupport.enabled, false, "HP support already in the final stat input is not re-added");
  assert.equal(includedRelic.activation.active, true, "the declared final HP still qualifies");
  assert.equal(includedRelic.thresholdReferenceValue, 5090, "pre-included HP is read once");

  const missingHp = runtime.buildCandidates([hpSupport, row], { ...context, stats: { ...context.stats, hp: NaN } }, { [hpSupport.activation.inputKey]: true });
  const missingRelic = missingHp.find(item => item.id === row.id);
  assert.equal(missingRelic.activation.unresolved, true, "missing Max HP remains explicitly unresolved");
  assert.equal(missingRelic.enabled, false);
  assert.equal(missingRelic.applicable, false, "missing max HP excludes only this threshold effect");
  assert.equal(missingRelic.inputWarnings.length, 0, "no global calculation warning is raised");
  const zeroHpRelic = runtime.buildCandidates([hpSupport, row], { ...context, stats: { ...context.stats, hp: 0 } }, { [hpSupport.activation.inputKey]: true }).find(item => item.id === row.id);
  assert.equal(zeroHpRelic.activation.unresolved, true, "nonpositive Max HP is unresolved instead of treated as below threshold");
  assert.equal(zeroHpRelic.applicable, false);
  const unaffected = assertMatchesIndependent(engine, makeRequest(attack, 1, { atk: 3000, critRate: 50, critDamage: 100 }, missingHp), "missing Max HP leaves unrelated direct damage calculable");
  assertClose(unaffected.expected, 1620, "unresolved HP threshold does not apply the CD effect or stop the attack");
});

test("Fallen Star Anchorage applies CD+32 only when the Trailblaze Companion state is selected", async () => {
  const { engine } = await loadProductionFixture();
  const row = get("ornament:327:2pc:trailblaze-companion-crit-damage");
  const context = { characterId: "1001", partyIds: ["1002"], ornamentId: "327", stats: { atk: 3000, critRate: 50, critDamage: 100 }, baseStats: { atk: 1000 } };
  const off = candidate(row, context);
  assert.equal(off.enabled, false);
  assert.equal(candidate(row, { ...context, partyIds: [] }, { [row.activation.inputKey]: true }).activation.active, false, "a second teammate is required even when the membership toggle is selected");
  const inputs = { [row.activation.inputKey]: true };
  const on = candidate(row, context, inputs);
  assert.equal(on.automatic, false, "membership needs an explicit selection until character identity data is available");
  assert.equal(on.activation.active, true);
  const result = assertMatchesIndependent(engine, makeRequest(attack, 1, { atk: 3000, critRate: 50, critDamage: 100 }, [on]), "Trailblaze Companion condition CD+32");
  assertClose(result.nonCrit, 1080, "CD does not alter nonCrit");
  assertClose(result.crit, 2505.6, "critical damage multiplier232%");
  assertClose(result.expected, 1792.8, "expected damage at CR50/CD132");
  assert.equal(candidate(row, { ...context, ornamentId: "" }, inputs), undefined, "removing the set removes the effect");
  assert.equal(candidate(row, context, { ...inputs, [row.finalStatsInclusion.inputKey]: true }).enabled, false, "pre-included CD is not duplicated");
  assert.equal(candidate(row, context, JSON.parse(JSON.stringify(inputs))).activation.active, true, "saved-state input restores the selected condition");
});
test("Arcadia of Woven Dreams uses the selected field ally count and follows both stack caps", async () => {
  const { engine } = await loadProductionFixture();
  const row = get("ornament:321:2pc:field-ally-count-damage");
  for (const [count, bonus] of [[1,36],[2,24],[3,12],[4,0],[5,9],[6,18],[7,27],[8,36],[9,36]]) {
    const inputs = { "ally-target-count": count };
    const effect = candidate(row, { characterId: "1001", ornamentId: "321", stats: { atk: 3000 }, baseStats: { atk: 1000 } }, inputs);
    assert.equal(effect.activation.active, true, "field ally count " + count);
    assert.equal(effect.value, bonus, "fixed-source stack rate for count " + count);
    const output = assertMatchesIndependent(engine, makeRequest(attack, 1, { atk: 3000 }, [effect]), "Arcadia field count " + count);
    assertClose(output.nonCrit, 1080 * (1 + bonus / 100), "field-count DMG+" + bonus + "%");
  }
  const context = { characterId: "1001", ornamentId: "321", stats: { atk: 3000 }, baseStats: { atk: 1000 } };
  const unresolved = candidate(row, context);
  assert.equal(unresolved.activation.unresolved, true, "no field-count guess is made");
  assert.equal(unresolved.enabled, false);
  const saved = JSON.parse(JSON.stringify({ "ally-target-count": 5 }));
  assert.equal(candidate(row, context, saved).value, 9, "the selected field count survives save/restore");
  assert.equal(candidate(row, { ...context, ornamentId: "" }, saved), undefined, "removing the set removes the effect");
});

test("Cosmic Life Sciences Institute uses maximum EP, not current EP, and caps the damage bonus", async () => {
  const { engine } = await loadProductionFixture();
  const row = get("ornament:328:2pc:max-energy-damage");
  const context = { characterId: "1001", ornamentId: "328", stats: { atk: 3000 }, baseStats: { atk: 1000 } };
  const at199 = candidate(row, context, { "pre-combat-max-energy": 199 });
  assert.equal(at199.activation.active, false);
  assert.equal(at199.enabled, false);
  for (const [maxEnergy, bonus] of [[200,0],[201,0.2],[220,4],[360,32],[500,32]]) {
    const inputs = { "pre-combat-max-energy": maxEnergy };
    const effect = candidate(row, context, inputs);
    assert.equal(effect.activation.active, true);
    assertClose(effect.value, bonus, "maximum EP " + maxEnergy);
    const output = assertMatchesIndependent(engine, makeRequest(attack, 1, { atk: 3000 }, [effect]), "max EP " + maxEnergy);
    assertClose(output.nonCrit, 1080 * (1 + bonus / 100), "maxEP bonus +" + bonus + "%");
  }
  const unresolved = candidate(row, context);
  assert.equal(unresolved.activation.unresolved, true, "missing maximum EP is unresolved");
  assert.equal(unresolved.enabled, false);
  assertClose(candidate(row, context, JSON.parse(JSON.stringify({ "pre-combat-max-energy": 220 }))).value, 4, "saved maximum EP restores the computed bonus");
  assert.equal(candidate(row, { ...context, ornamentId: "" }, { "pre-combat-max-energy": 220 }), undefined, "removing the set removes the effect");
});
