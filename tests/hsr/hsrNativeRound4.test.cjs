"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fixedSourceSha, loadProductionFixture, attackOf, makeRequest, runtime, assertClose, assertMatchesIndependent, readJson, root } = require("./helpers/hsrDirectVerification.cjs");
const path = require("node:path");
const stateApi = require(path.join(root, "games/js/hsrCalcState.js"));

const records = readJson("games/hsr/data/calc/modifiers-native-round4.json").modifiers;
const argenti = records.find((item) => item.id === "traceNode:1302:1302103:low-hp-damage");
const phainon = records.find((item) => item.id === "traceNode:1408:1408102:healing-damage");
const danHengPt = records.find((item) => item.id === "traceNode:1414:1414101:partner-atk");
const argentiIncludedKey = "argenti-a6-damage-in-final-stats";
const phainonStateKey = "phainon-a2-healing-damage-active";
const phainonIncludedKey = "phainon-a2-damage-in-final-stats";
const danHengStateKey = "dan-heng-pt-a2-partner-atk-active";
const danHengIncludedKey = "dan-heng-pt-a2-atk-in-final-stats";

function directAttack(attack) {
  return { ...attack, multipliers: Array(10).fill(100), multiplier: 100 };
}

function requestFor(attack, modifiers, config = {}) {
  return makeRequest(directAttack(attack), 10, {
    atk: config.atk ?? 3000,
    baseAtk: config.baseAtk ?? 1000,
    critRate: config.critRate ?? 50,
    critDamage: config.critDamage ?? 100,
    damageBonus: config.damageBonus ?? 0,
    resistance: config.resistance ?? 20,
    toughnessActive: config.toughnessActive ?? true,
    enemyLevel: config.enemyLevel ?? 80,
    characterLevel: config.characterLevel ?? 80
  }, modifiers);
}

test("Argenti A6 automatically applies 15% DMG at the exact enemy HP boundary", async () => {
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  const { data, engine } = await loadProductionFixture();
  const configured = data.structuredModifiers.find((item) => item.id === argenti.id);
  assert.equal(data.structuredModifiers.filter((item) => item.id === argenti.id).length, 1, "new Argenti definition is loaded exactly once");
  assert.ok(configured, "manifest exposes the round 4 native modifier definitions");
  assert.equal(configured.value.fixed, 15);
  const attack = attackOf(data, "130201");
  const context = { characterId: "1302", stats: { atk: 3000, critRate: 50, critDamage: 100, damageBonus: 0 }, baseStats: { atk: 1000 } };

  for (const [hpPercent, expectedBonus, expectedDamage] of [[50, 15, 1242], [50.001, 0, 1080], [undefined, 0, 1080]]) {
    const modifierContext = { ...context, enemy: hpPercent === undefined ? {} : { hpPercent } };
    const candidate = runtime.buildCandidates([argenti], modifierContext, {})[0];
    assert.equal(candidate.automatic, true, "HP threshold is inferred from the explicit enemy state");
    assert.equal(candidate.enabled, expectedBonus > 0, `threshold result at HP ${hpPercent}`);
    assert.equal(candidate.value, 15);
    const result = assertMatchesIndependent(engine, requestFor(attack, [candidate]), `Argenti A6 enemy HP ${hpPercent}`);
    assertClose(result.nonCrit, expectedDamage, `literal Argenti A6 value at HP ${hpPercent}`);
  }

  const included = runtime.buildCandidates([argenti], { ...context, enemy: { hpPercent: 50 } }, { [argentiIncludedKey]: true })[0];
  assert.equal(included.enabled, false);
  assert.equal(included.includedInFinalStats, true);
});

test("Phainon A2 applies 45% DMG only while the selected received-heal or shield state is active", async () => {
  const { data, engine } = await loadProductionFixture();
  const configured = data.structuredModifiers.find((item) => item.id === phainon.id);
  assert.ok(configured);
  assert.equal(configured.value.fixed, 45);
  assert.equal(configured.activation.durationTurns, 4);
  const attack = attackOf(data, "140801");
  const context = { characterId: "1408", partyIds: [], stats: { atk: 3000, critRate: 50, critDamage: 100, damageBonus: 0 }, baseStats: { atk: 1000 } };

  for (const [active, expectedDamage] of [[false, 1080], [true, 1566]]) {
    const candidate = runtime.buildCandidates([phainon], context, { [phainonStateKey]: active })[0];
    assert.equal(candidate.enabled, active);
    assert.equal(candidate.automatic, false, "the qualifying heal or shield receipt is a combat-state input");
    const result = assertMatchesIndependent(engine, requestFor(attack, [candidate]), `Phainon A2 active=${active}`);
    assertClose(result.nonCrit, expectedDamage, `literal Phainon A2 DMG at active=${active}`);
  }

  assert.equal(runtime.buildCandidates([phainon], { ...context, characterId: "1001" }, { [phainonStateKey]: true }).length, 0, "provider removal removes the self effect");
  const included = runtime.buildCandidates([phainon], context, { [phainonStateKey]: true, [phainonIncludedKey]: true })[0];
  assert.equal(included.enabled, false);
  assert.equal(included.includedInFinalStats, true);
});

test("Dan Heng PT A2 grants the selected same-cloak ally flat ATK from the provider's ATK", async () => {
  const { data, engine } = await loadProductionFixture();
  const configured = data.structuredModifiers.find((item) => item.id === danHengPt.id);
  assert.ok(configured);
  assert.equal(configured.value.providerStat, "atk");
  assert.equal(configured.value.values[0], 15);
  const attack = attackOf(data, "130201");
  const context = {
    characterId: "1302", partyIds: ["1414"],
    partyStats: { "1414": { atk: 4000 } },
    stats: { atk: 2500, critRate: 50, critDamage: 100, damageBonus: 0 },
    baseStats: { atk: 1000 }
  };
  const off = runtime.buildCandidates([danHengPt], context, { [danHengStateKey]: false })[0];
  assert.equal(off.enabled, false);
  assert.equal(off.providerId, "1414");
  assert.equal(off.automatic, false, "the Skill-selected 同袍 target is explicitly chosen");

  const active = runtime.buildCandidates([danHengPt], context, { [danHengStateKey]: true })[0];
  assert.equal(active.enabled, true);
  assert.equal(active.value, 600, "Dan Heng PT's 4000 ATK × 15% becomes 600 flat ATK");
  for (const type of ["normal", "skill", "ultimate", "followUp", "dot"]) {
    assert.equal(runtime.applicableToAttack(active, { type, element: "Physical" }), true, "same-cloak ATK applies to " + type);
  }
  const result = assertMatchesIndependent(engine, requestFor(attack, [active], { atk: 2500, baseAtk: 1000 }), "Dan Heng PT A2 same-cloak ATK");
  // Independent value: (recipient ATK 2500 + provider ATK 4000 * 15%) × 100% × DEF 0.5 × RES 0.8 × toughness 0.9.
  assertClose(result.nonCrit, 1116, "literal Dan Heng PT A2 non-crit");

  assert.equal(runtime.buildCandidates([danHengPt], { ...context, partyIds: [], partyStats: {} }, { [danHengStateKey]: true }).length, 0, "removing the provider removes its support");
  const included = runtime.buildCandidates([danHengPt], context, { [danHengStateKey]: true, [danHengIncludedKey]: true,
    "dan-heng-pt-a2-provider-atk": 4000 })[0];
  assert.equal(included.enabled, false);
  assert.equal(included.includedInFinalStats, true, "already reflected same-cloak ATK is not added twice");
});

test("round 4 native modifier state and inclusion inputs survive save and restore", () => {
  const defaults = { enemy: {}, conditions: [], modifierInputs: {}, party: [], traceLevels: {}, source: "manual", relicMode: "4pc", enhancementState: "previous", attackerPosition: 1 };
  const inputs = {
    [argentiIncludedKey]: true,
    [phainonStateKey]: true,
    [phainonIncludedKey]: false,
    [danHengStateKey]: true,
    [danHengIncludedKey]: true,
    "dan-heng-pt-a2-provider-atk": 4000
  };
  const state = stateApi.create({ ...defaults, modifierInputs: inputs });
  const storage = { value: "", setItem(_key, value) { this.value = value; }, getItem() { return this.value; } };
  assert.equal(stateApi.save(storage, state), true);
  const restored = stateApi.restore(stateApi.load(storage).value, defaults, { characters: [], lightCones: [], relicSets: [] }, []);
  for (const [key, value] of Object.entries(inputs)) assert.equal(restored.state.modifierInputs[key], value, key);
});
