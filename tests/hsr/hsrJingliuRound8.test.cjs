"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  root, readJson, fixedSourceSha, loadProductionFixture, makeRequest,
  independentDirectDamage, assertClose, runtime
} = require("./helpers/hsrDirectVerification.cjs");
const authoredAttacks = require("../../games/hsr/data/calc/attacks-jingliu-round8.json").overrides;
const authoredModifiers = require("../../games/hsr/data/calc/modifiers-jingliu-round8.json").modifiers;

const hpIds = ["1121201", "1121209", "1121203"];
const atkIds = ["121201", "121209", "121203"];
const levels = { "1121201": 6, "1121209": 10, "1121203": 10 };
const talentCrit = [40, 41, 42, 43, 44, 45, 46.25, 47.5, 48.75, 50];
const moonlightCritDamage = [22, 24.2, 26.4, 28.6, 30.8, 33, 35.75, 38.5, 41.25, 44];

function attack(data, id) {
  return data.attacks.find(item => item.id === id)
    || authoredAttacks.find(item => item.id === id);
}

function makeNativeCandidates(id, level, inputValues, selectedAttack) {
  const context = {
    characterId: "1212", eidolon: 0,
    stats: { hp: 8500, atk: 3000, critRate: 40, critDamage: 100 },
    traceLevelFor: source => source.skillId ? level : 1,
    attack: selectedAttack
  };
  return runtime.buildCandidates(authoredModifiers, context, inputValues)
    .map(item => ({ ...item, applicable: runtime.applicableToAttack(item, selectedAttack) }));
}

test("Round8 Jingliu HP variants are registered once and retain exact fixed-source coefficients", async () => {
  const { data, engine } = await loadProductionFixture();
  const catalog = readJson("games/hsr/data/catalog.json");
  const character = catalog.characters.find(item => item.id === "1212");
  for (const id of hpIds) {
    const matches = data.attacks.filter(item => item.id === id && item.provenance?.sourceCommit === fixedSourceSha);
    assert.equal(matches.length, 1, id + " has one loaded fixed-source override");
    const loaded = matches[0], authored = authoredAttacks.find(item => item.id === id);
    for (const [key, value] of Object.entries(authored)) assert.deepEqual(JSON.parse(JSON.stringify(loaded[key])), value, id + " authored " + key + " is preserved");
    assert.equal(loaded.support.status, "calculable");
    assert.equal(engine.unsupportedAttackReason(loaded), "");
    const source = character.skills.find(item => item.id === id);
    assert.ok(source);
    assert.equal(loaded.enemyCountExact, 1);
    assert.equal(loaded.maximumEidolon, 0);
    assert.equal(loaded.maximumTraceLevel, levels[id]);
    for (let level = 1; level <= levels[id]; level++) {
      assertClose(loaded.multipliers[level - 1], source.params[level - 1][0] * 100, id + " exact fixed multiplier Lv" + level);
    }
  }
  for (const [hpId, atkId] of [["1121201", "121201"], ["1121209", "121209"], ["1121203", "121203"]]) {
    assert.equal(attack(data, hpId).scalingStat, "hp");
    assert.equal(attack(data, atkId).scalingStat, "atk");
  }
});

test("Round8 Jingliu talent and trace states apply only to their exact variants and attacks", async () => {
  const { data, engine } = await loadProductionFixture();
  const catalogCharacter = readJson("games/hsr/data/catalog.json").characters.find(item => item.id === "1212");
  for (const [skillId, modifierId, paramIndex] of [["121204", "trace:1212:121204:syzygy-crit-rate-atk-variant", 6], ["1121204", "trace:1212:1121204:syzygy-crit-rate-hp-variant", 6], ["1121204", "trace:1212:1121204:moonlight-crit-damage-hp-variant", 2]]) {
    const skill = catalogCharacter.skills.find(item => item.id === skillId);
    const values = authoredModifiers.find(item => item.id === modifierId).value.values;
    for (let level = 1; level <= 10; level++) assertClose(values[level - 1], skill.params[level - 1][paramIndex] * 100, modifierId + " fixed talent value Lv" + level);
  }
  const a1 = catalogCharacter.traces.find(item => item.id === "11212101");
  const a6 = catalogCharacter.traces.find(item => item.id === "11212103");
  const a6Atk = catalogCharacter.traces.find(item => item.id === "1212103");
  assertClose(authoredModifiers.find(item => item.id.includes("11212101:transmigration-ultimate-damage-hp-variant")).value.fixed, a1.params[0][1] * 100, "HP variant A1 ult damage");
  assertClose(authoredModifiers.find(item => item.id.includes("11212103:next-attack-defense-ignore-hp-variant")).value.fixed, a6.params[0][0] * 100, "HP variant A6 DEF ignore");
  assertClose(authoredModifiers.find(item => item.id.includes("1212103:transmigration-ultimate-damage-atk-variant")).value.fixed, a6Atk.params[0][0] * 100, "ATK variant A6 ult damage");
  const hpNormal = attack(data, "1121201"), atkNormal = attack(data, "121201");
  const hpEnhanced = attack(data, "1121209"), atkEnhanced = attack(data, "121209");
  const hpUltimate = attack(data, "1121203"), atkUltimate = attack(data, "121203");
  const scenario = { characterLevel: 80, enemyCount: 1, eidolon: 0, atk: 3000, hp: 8500, def: 2400, critRate: 40, critDamage: 100, baseAtk: 1000, baseHp: 1000, baseDef: 1000 };
  for (let level = 1; level <= 10; level++) {
    const hpState = { "jingliu-hp-transmigration-active": true, "jingliu-moonlight-stacks": 5 };
    const hpMods = makeNativeCandidates(hpEnhanced.id, level, hpState, hpEnhanced);
    const hpRequest = makeRequest(hpEnhanced, level, scenario, hpMods);
    const hpExpected = independentDirectDamage(hpRequest);
    assertClose(hpMods.find(item => item.id.includes("syzygy-crit-rate-hp-variant")).value, talentCrit[level - 1], "HP variant CR by Talent Lv" + level);
    assertClose(hpMods.find(item => item.id.includes("moonlight-crit-damage-hp-variant")).value, moonlightCritDamage[level - 1] * 5, "Moonlight CD by Talent Lv" + level);
    const hpResult = engine.calculate(hpRequest);
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(hpResult[key], hpExpected[key], "HP enhanced skill + CR/CD " + key + " Lv" + level);
    assert.equal(makeNativeCandidates(hpNormal.id, level, hpState, hpNormal).find(item => item.id.includes("syzygy-crit-rate-hp-variant")).applicable, false, "HP normal cannot be used during Transmigration");
    assert.equal(makeNativeCandidates(hpNormal.id, level, hpState, hpNormal).find(item => item.id.includes("moonlight-crit-damage-hp-variant")).applicable, false, "HP normal cannot receive Transmigration Moonlight CD");

    const atkState = { "jingliu-atk-transmigration-active": true };
    const atkMods = makeNativeCandidates(atkEnhanced.id, level, atkState, atkEnhanced);
    assert.equal(atkMods.find(item => item.id.includes("syzygy-crit-rate-atk-variant")).value, talentCrit[level - 1]);
    assert.equal(atkMods.find(item => item.id.includes("syzygy-crit-rate-hp-variant")).applicable, false, "HP CR cannot affect ATK variant");
    const atkRequest = makeRequest(atkEnhanced, level, scenario, atkMods);
    const atkExpected = independentDirectDamage(atkRequest), atkResult = engine.calculate(atkRequest);
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(atkResult[key], atkExpected[key], "ATK enhanced skill + CR " + key + " Lv" + level);
    assert.equal(makeNativeCandidates(atkNormal.id, level, atkState, atkNormal).find(item => item.id.includes("syzygy-crit-rate-atk-variant")).applicable, false, "ATK normal cannot be used during Transmigration");

    const hpUltMods = makeNativeCandidates(hpUltimate.id, level, hpState, hpUltimate);
    const hpUltRequest = makeRequest(hpUltimate, level, scenario, hpUltMods);
    const hpUltExpected = independentDirectDamage(hpUltRequest), hpUltResult = engine.calculate(hpUltRequest);
    assert.equal(hpUltMods.find(item => item.id.includes("11212101:transmigration-ultimate-damage-hp-variant")).value, 20);
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(hpUltResult[key], hpUltExpected[key], "HP ult + CR/CD/talent/A1 " + key + " Lv" + level);

    const atkUltMods = makeNativeCandidates(atkUltimate.id, level, atkState, atkUltimate);
    const atkUltRequest = makeRequest(atkUltimate, level, scenario, atkUltMods);
    const atkUltExpected = independentDirectDamage(atkUltRequest), atkUltResult = engine.calculate(atkUltRequest);
    assert.equal(atkUltMods.find(item => item.id.includes("1212103:transmigration-ultimate-damage-atk-variant")).value, 20);
    assert.equal(atkUltMods.find(item => item.id.includes("11212101:transmigration-ultimate-damage-hp-variant")).applicable, false);
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(atkUltResult[key], atkUltExpected[key], "ATK ult + CR/A6 " + key + " Lv" + level);
  }
  const inactive = makeNativeCandidates(hpUltimate.id, 10, {}, hpUltimate);
  assert.equal(inactive.find(item => item.id.includes("syzygy-crit-rate-hp-variant")).enabled, false);
  assert.equal(inactive.find(item => item.id.includes("moonlight-crit-damage-hp-variant")).enabled, false);
  assert.equal(inactive.find(item => item.id.includes("11212101:transmigration-ultimate-damage-hp-variant")).enabled, false);
  const stacksWithoutTransmigration = makeNativeCandidates(hpUltimate.id, 10, { "jingliu-moonlight-stacks": 5 }, hpUltimate);
  assert.equal(stacksWithoutTransmigration.find(item => item.id.includes("moonlight-crit-damage-hp-variant")).enabled, false, "Moonlight cannot be active outside Transmigration");
  const wrongVariant = makeNativeCandidates(hpUltimate.id, 10, { "jingliu-atk-transmigration-active": true }, hpUltimate);
  assert.equal(wrongVariant.find(item => item.id.includes("11212101:transmigration-ultimate-damage-hp-variant")).enabled, false);
});

test("HP version next-attack DEF ignore remains an explicit single-attack state and final input can suppress duplicates", async () => {
  const { data, engine } = await loadProductionFixture();
  const hpSkill = attack(data, "1121209"), hpNormal = attack(data, "1121201"), atkSkill = attack(data, "121209");
  const ready = makeNativeCandidates(hpSkill.id, 10, { "jingliu-hp-syzygy-cap-next-attack-defense-ignore-active": true }, hpSkill);
  const defIgnore = ready.find(item => item.id.includes("next-attack-defense-ignore-hp-variant"));
  assert.equal(defIgnore.value, 25);
  const request = makeRequest(hpSkill, 10, { characterLevel: 80, enemyCount: 1, hp: 8500, defenseIgnore: 0 }, ready);
  const expected = independentDirectDamage(request), actual = engine.calculate(request);
  for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], "selected next attack DEF ignore " + key);
  assert.equal(makeNativeCandidates(hpNormal.id, 10, { "jingliu-hp-syzygy-cap-next-attack-defense-ignore-active": true }, hpNormal)
    .find(item => item.id.includes("next-attack-defense-ignore-hp-variant")).applicable, true);
  assert.equal(makeNativeCandidates(atkSkill.id, 10, { "jingliu-hp-syzygy-cap-next-attack-defense-ignore-active": true }, atkSkill)
    .find(item => item.id.includes("next-attack-defense-ignore-hp-variant")).applicable, false);
  const alreadyIncluded = makeNativeCandidates(hpSkill.id, 10, {
    "jingliu-hp-syzygy-cap-next-attack-defense-ignore-active": true,
    "jingliu-hp-next-attack-defense-ignore-in-final": true
  }, hpSkill).find(item => item.id.includes("next-attack-defense-ignore-hp-variant"));
  assert.equal(alreadyIncluded.enabled, false, "final-input inclusion prevents a second application");
  assert.equal(makeNativeCandidates(hpSkill.id, 10, {}, hpSkill)
    .find(item => item.id.includes("next-attack-defense-ignore-hp-variant")).enabled, false, "unknown next-attack state defaults off");
});
