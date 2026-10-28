"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fixedSourceSha, loadProductionFixture, attackOf, makeRequest, runtime, assertClose, assertMatchesIndependent } = require("./helpers/hsrDirectVerification.cjs");
const { readJson, root } = require("./helpers/hsrDirectVerification.cjs");
const path = require("node:path");
const stateApi = require(path.join(root, "games/js/hsrCalcState.js"));

const records = readJson("games/hsr/data/calc/modifiers-native-round3.json").modifiers;
const bailu = records.find((item) => item.id === "eidolon:1211:4:healing-damage");
const hanya = records.find((item) => item.id === "eidolon:1215:2:speed");
const bailuKey = "bailu-e4-healing-stacks";
const bailuIncludedKey = "bailu-e4-damage-in-final-stats";
const hanyaKey = "hanya-e2-skill-speed-active";
const hanyaIncludedKey = "hanya-e2-speed-in-final-stats";

function bailuContext(characterId = "1001", partyIds = ["1211"], partyEidolons = { "1211": 4 }) {
  return { characterId, partyIds, partyEidolons, stats: { atk: 3000, damageBonus: 0 }, baseStats: { atk: 1000 } };
}

function hanyaContext(speed = 113, eidolon = 2) {
  return {
    characterId: "1215", eidolon, partyIds: [], ornamentId: "311",
    characterElement: "Physical", stats: { atk: 3000, speed }, baseStats: { atk: 1000, speed: 110 }
  };
}

test("Bailu E4 adds 10% DMG per selected skill-healing stack to the explicitly calculated ally", async () => {
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  assert.equal(bailu.source.rankId, "121104");
  const { data, engine } = await loadProductionFixture();
  const configured = data.structuredModifiers.find((item) => item.id === bailu.id);
  assert.ok(configured, "manifest must load the dedicated native round 3 definitions");
  assert.equal(configured.value.perStack, 10);
  assert.equal(configured.activation.maximum, 3);

  const context = bailuContext();
  for (const [stacks, expectedBonus, expectedDamage] of [[0, 0, 1080], [1, 10, 1188], [2, 20, 1296], [3, 30, 1404], [9, 30, 1404]]) {
    const inputs = { [bailuKey]: stacks };
    const candidate = runtime.buildCandidates([bailu], context, inputs)[0];
    assert.equal(candidate.providerId, "1211");
    assert.equal(candidate.value, expectedBonus, `clamped stack value at ${stacks}`);
    assert.equal(candidate.enabled, stacks > 0);
    assert.equal(candidate.automatic, false, "healing events and target-specific stack count are selected as a snapshot");
    assert.equal(runtime.applicableToAttack(candidate, { id: "121101", type: "normal", element: "Lightning" }), stacks > 0);
    const request = makeRequest({ id: "121101", name: "Bailu basic", element: "Lightning", type: "normal", attackType: "normal", scalingStat: "atk", multiplier: 100, multipliers: Array(10).fill(100), canCrit: true }, 10,
      { atk: 3000, baseAtk: 1000, critRate: 50, critDamage: 100, resistance: 20, toughnessActive: true }, [candidate]);
    const result = assertMatchesIndependent(engine, request, `Bailu E4 stack ${stacks}`);
    assertClose(result.nonCrit, expectedDamage, `literal Bailu E4 non-crit at ${stacks} stacks`);
  }

  assert.equal(runtime.buildCandidates([bailu], bailuContext("1001", ["1211"], { "1211": 3 }), { [bailuKey]: 1 }).length, 0, "provider E3 cannot grant E4");
  assert.equal(runtime.buildCandidates([bailu], bailuContext("1001", []), { [bailuKey]: 1 }).length, 0, "removing Bailu removes the support despite saved stack inputs");
  const selfContext = { characterId: "1211", eidolon: 4, partyIds: [], stats: { atk: 3000 }, baseStats: { atk: 1000 } };
  assert.equal(runtime.buildCandidates([bailu], selfContext, { [bailuKey]: 2 })[0].value, 20, "Bailu herself can be the explicitly selected healed ally");
  const included = runtime.buildCandidates([bailu], context, { [bailuKey]: 3, [bailuIncludedKey]: true })[0];
  assert.equal(included.enabled, false);
  assert.equal(included.includedInFinalStats, true, "already included DMG is not added twice");
});

test("Hanya E2 adds her own SPD after Skill and re-evaluates Glamoth thresholds", async () => {
  assert.equal(hanya.source.rankId, "121502");
  const { data, engine } = await loadProductionFixture();
  const configured = data.structuredModifiers.find((item) => item.id === hanya.id);
  const glamoth = data.structuredModifiers.find((item) => item.id === "ornament:311:2pc:speed-damage");
  assert.ok(configured && glamoth, "manifest loads Hanya E2 and existing Glamoth evaluation");
  assert.equal(configured.value.fixed, 20);
  const context = hanyaContext();

  const off = runtime.buildCandidates([hanya, glamoth], context, { [hanyaKey]: false });
  assert.equal(off.find((item) => item.id === hanya.id).enabled, false);
  assert.equal(off.find((item) => item.id === glamoth.id).enabled, false);

  const at135 = runtime.buildCandidates([hanya, glamoth], context, { [hanyaKey]: true });
  const speedBuff = at135.find((item) => item.id === hanya.id);
  const firstTier = at135.find((item) => item.id === glamoth.id);
  assert.equal(speedBuff.value, 20);
  assert.equal(speedBuff.enabled, true);
  assert.equal(speedBuff.automatic, false, "the prior Skill and active turn are explicit state");
  assertClose(113 + 110 * .20, 135, "independent effective SPD at first Glamoth threshold");
  assert.equal(firstTier.enabled, true);
  assert.equal(firstTier.value, 12);
  assertClose(firstTier.thresholdReferenceValue, 135, "Glamoth sees Hanya E2 effective SPD");

  const below = runtime.buildCandidates([hanya, glamoth], hanyaContext(112.999), { [hanyaKey]: true }).find((item) => item.id === glamoth.id);
  assertClose(112.999 + 110 * .20, 134.999, "independent effective SPD below first threshold");
  assert.equal(below.enabled, false);
  const at160 = runtime.buildCandidates([hanya, glamoth], hanyaContext(138), { [hanyaKey]: true }).find((item) => item.id === glamoth.id);
  assertClose(138 + 110 * .20, 160, "independent effective SPD at second threshold");
  assert.equal(at160.enabled, true);
  assert.equal(at160.value, 18);

  assert.equal(runtime.buildCandidates([hanya], hanyaContext(113, 1), { [hanyaKey]: true }).length, 0, "E1 cannot activate E2");
  assert.equal(runtime.buildCandidates([hanya], { ...context, characterId: "1001", partyIds: ["1215"], partyEidolons: { "1215": 2 } }, { [hanyaKey]: true }).length, 0, "Hanya E2 is self-only, not party SPD support");
  const included = runtime.buildCandidates([hanya, glamoth], hanyaContext(135), { [hanyaKey]: true, [hanyaIncludedKey]: true });
  assert.equal(included.find((item) => item.id === hanya.id).enabled, false);
  assert.equal(included.find((item) => item.id === hanya.id).includedInFinalStats, true);
  assertClose(included.find((item) => item.id === glamoth.id).thresholdReferenceValue, 135, "final SPD already includes Hanya E2");

  const attack = attackOf(data, "121501");
  const candidates = runtime.buildCandidates([hanya, glamoth], context, { [hanyaKey]: true });
  const request = makeRequest({ ...attack, attackType: attack.type, multipliers: Array(10).fill(100), multiplier: 100 }, 10,
    { atk: 3000, baseAtk: 1000, critRate: 50, critDamage: 100, resistance: 20, toughnessActive: true }, candidates);
  const result = assertMatchesIndependent(engine, request, "Hanya E2 + Glamoth direct damage");
  assertClose(result.nonCrit, 1209.6, "literal 100% direct hit with Glamoth's 12% tier");
});

test("Bailu E4 and Hanya E2 condition inputs survive save and restore", () => {
  const defaults = { enemy: {}, conditions: [], modifierInputs: {}, party: [], traceLevels: {}, source: "manual", relicMode: "4pc", enhancementState: "previous", attackerPosition: 1 };
  const inputs = { [bailuKey]: 2, [bailuIncludedKey]: true, [hanyaKey]: true, [hanyaIncludedKey]: false, "hanya-recorded-sp-recovery-atk-active": true, "hanya-recorded-sp-recovery-atk-in-final-stats": false };
  const state = stateApi.create({ ...defaults, modifierInputs: inputs });
  const storage = { value: "", setItem(_key, value) { this.value = value; }, getItem() { return this.value; } };
  assert.equal(stateApi.save(storage, state), true);
  const restored = stateApi.restore(stateApi.load(storage).value, defaults, { characters: [], lightCones: [], relicSets: [] }, []);
  for (const [key, value] of Object.entries(inputs)) assert.equal(restored.state.modifierInputs[key], value, key);
});


test("Hanya A2 Recorded grants ATK to the ally who triggered Burden SP recovery", async () => {
  const recorded = records.find((item) => item.id === "traceNode:1215:1215101:sp-recovery-atk");
  assert.ok(recorded);
  const { data, engine } = await loadProductionFixture();
  const configured = data.structuredModifiers.find((item) => item.id === recorded.id);
  assert.ok(configured, "manifest loads the new trace modifier");
  assert.equal(configured.value.fixed, 10);
  const context = { characterId: "1001", partyIds: ["1215"], stats: { atk: 2500 }, baseStats: { atk: 1000 } };
  const off = runtime.buildCandidates([recorded], context, { "hanya-recorded-sp-recovery-atk-active": false })[0];
  assert.equal(off.enabled, false);
  assert.equal(off.automatic, false, "only a selected SP-recovery trigger state activates the effect");

  const active = runtime.buildCandidates([recorded], context, { "hanya-recorded-sp-recovery-atk-active": true })[0];
  assert.equal(active.enabled, true);
  assert.equal(active.providerId, "1215");
  assert.equal(active.value, 10);
  for (const type of ["normal", "skill", "ultimate", "followUp", "dot"]) {
    assert.equal(runtime.applicableToAttack(active, { type, element: "Physical" }), true, "Recorded applies to " + type);
  }
  const attack = attackOf(data, "121501");
  const request = makeRequest({ ...attack, multipliers: Array(10).fill(100), multiplier: 100 }, 10,
    { atk: 2500, baseAtk: 1000, critRate: 50, critDamage: 100, resistance: 20, toughnessActive: true }, [active]);
  const result = assertMatchesIndependent(engine, request, "Hanya A2 recorded SP-recovery ATK");
  // Independent value: (final ATK 2500 + base ATK 1000 * 10%) * 100% * DEF 0.5 * RES 0.8 * toughness 0.9.
  assertClose(result.nonCrit, 936, "literal non-crit with Recorded ATK");

  assert.equal(runtime.buildCandidates([recorded], { characterId: "1001", partyIds: [] }, { "hanya-recorded-sp-recovery-atk-active": true }).length, 0, "removing Hanya removes the provider");
  const self = runtime.buildCandidates([recorded], { characterId: "1215", partyIds: [], stats: { atk: 2500 }, baseStats: { atk: 1000 } }, { "hanya-recorded-sp-recovery-atk-active": true })[0];
  assert.equal(self.providerId, "1215");
  assert.equal(self.value, 10, "Hanya can benefit if she herself triggered the SP recovery");
  const included = runtime.buildCandidates([recorded], context, {
    "hanya-recorded-sp-recovery-atk-active": true,
    "hanya-recorded-sp-recovery-atk-in-final-stats": true
  })[0];
  assert.equal(included.enabled, false);
  assert.equal(included.includedInFinalStats, true, "already reflected ATK is not added twice");
});
