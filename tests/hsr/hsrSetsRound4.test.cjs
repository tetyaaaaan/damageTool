"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { readJson, runtime, fixedSourceSha, loadProductionFixture, makeRequest, assertClose, assertMatchesIndependent } = require("./helpers/hsrDirectVerification.cjs");
const added = readJson("games/hsr/data/calc/modifiers-sets-round4.json").modifiers;
const addedById = (id) => added.find((item) => item.id === id);
const source = readJson("games/hsr/data/calc/modifiers-relics-ornaments.json").modifiers;
const existingById = (id) => source.find((item) => item.id === id);
const records = [
  addedById("relic:123:4pc:memosprite-speed"),
  addedById("relic:123:4pc:memosprite-attack-crit-damage"),
  addedById("relic:127:4pc:wearer-hp"),
  existingById("relic:127:4pc:party-damage"),
  existingById("relic:132:4pc:defense-down-crit-damage"),
  existingById("relic:132:4pc:party-damage")
];
const byId = (id) => records.find((item) => item.id === id);
const candidate = (record, context, inputs = {}) => runtime.buildCandidates([record], context, inputs)[0];
const selfContext = (relicId, stats = {}) => ({ characterId: "1001", relicIds: [relicId], relicMode: 4, stats });
const ids = records.map((item) => item.id);

for (const record of records) {
  test("round4 record " + record.id + " has fixed source and remains calculable", () => {
    assert.ok(record, "record exists");
    assert.equal(record.source.setPieces, 4);
    assert.equal(record.provenance.sourceCommit, fixedSourceSha);
    assert.equal(record.support.status, "calculable");
  });
}

test("production loader includes 123/127/132 records once and the fixed source strings match the registered records", async () => {
  const { data } = await loadProductionFixture();
  for (const id of ids) {
    assert.equal(data.structuredModifiers.filter((item) => item.id === id).length, 1, id + " is loaded exactly once");
  }
  const loaded123 = data.structuredModifiers.filter((item) => item.source?.id === "123");
  assert.deepEqual(Array.from(loaded123, (item) => item.id), ["relic:123:4pc:memosprite-speed", "relic:123:4pc:memosprite-attack-crit-damage"]);
  assert.equal(loaded123.some((item) => item.stat === "atk"), false, "123 2pc ATK+12% remains in final ATK input");
  assert.equal(addedById("relic:127:4pc:wearer-hp").value.fixed, 24);
  assert.equal(existingById("relic:127:4pc:party-damage").value.fixed, 15);
  assert.equal(existingById("relic:132:4pc:defense-down-crit-damage").value.fixed, 28);
  assert.equal(existingById("relic:132:4pc:party-damage").value.fixed, 15);
});

test("Hero 123 uses manual sprite presence and sprite-attack states, with distinct speed and CRIT DMG effects", async () => {
  const { engine } = await loadProductionFixture();
  const speed = byId("relic:123:4pc:memosprite-speed"), cd = byId("relic:123:4pc:memosprite-attack-crit-damage");
  const context = selfContext("123");
  const speedOff = candidate(speed, context);
  const speedOn = candidate(speed, context, { [speed.activation.inputKey]: true });
  assert.equal(speedOff.enabled, false);
  assert.equal(speedOn.enabled, true);
  assert.equal(speedOn.automatic, false);
  assert.equal(speedOn.value, 6);
  assert.equal(candidate(speed, { ...context, relicMode: 2 }, { [speed.activation.inputKey]: true }), undefined);
  const attackOff = candidate(cd, context);
  const attackOn = candidate(cd, context, { [cd.activation.inputKey]: true });
  assert.equal(attackOff.enabled, false);
  assert.equal(attackOn.enabled, true);
  assert.equal(attackOn.value, 30);
  assert.equal(cd.activation.durationTurns, 2);
  assert.equal(runtime.applicableToAttack(attackOn, { type: "normal", element: "Ice" }), true, "buff affects the wearer");
  assert.equal(runtime.applicableToAttack(attackOn, { type: "memospriteSkill", element: "Ice" }), true, "buff includes the wearer's sprite attacks");
  const ultimate = { id: "round4-hero-123-ultimate", type: "ultimate", attackType: "ultimate", element: "Ice", scalingStat: "atk", multiplier: 100, multipliers: [100], traceLevel: 1 };
  const off = assertMatchesIndependent(engine, makeRequest(ultimate, 1, { atk: 3000, critRate: 50, critDamage: 100 }, [attackOff]), "Hero CRIT DMG off");
  const on = assertMatchesIndependent(engine, makeRequest(ultimate, 1, { atk: 3000, critRate: 50, critDamage: 100 }, [attackOn]), "Hero CRIT DMG +30");
  assertClose(off.nonCrit, 1080, "Hero off nonCrit");
  assertClose(on.nonCrit, 1080, "CRIT DMG does not alter nonCrit");
  assertClose(on.crit, 2484, "Hero +30 CRIT DMG crit value");
  assertClose(on.expected, 1782, "Hero +30 CRIT DMG expectation");
  const included = candidate(cd, context, { [cd.activation.inputKey]: true, [cd.finalStatsInclusion.inputKey]: true });
  assert.equal(included.enabled, false, "already-entered CRIT DMG is not added twice");
  const saved = JSON.parse(JSON.stringify({ [speed.activation.inputKey]: true, [cd.activation.inputKey]: true }));
  assert.equal(candidate(speed, context, saved).enabled, true);
  assert.equal(candidate(cd, context, saved).enabled, true);
});

test("Savior 127 applies owner HP and party DMG from the owner's Normal/Skill-after-sprite state", async () => {
  const { data, engine } = await loadProductionFixture();
  const hp = byId("relic:127:4pc:wearer-hp");
  const partyDamage = data.structuredModifiers.find((item) => item.id === "relic:127:4pc:party-damage");
  assert.ok(partyDamage);
  assert.equal(partyDamage.activation.inputKey, hp.activation.inputKey, "both effects share the exact wearer action/sprite state");
  assert.match(partyDamage.activation.conditionText, /装備キャラが通常攻撃/);
  assert.match(hp.scope, /記憶の精霊側.*未対応/);
  assert.equal(hp.finalStatsInclusion.inputKey, hp.id + ":in-final-stats");
  const state = { [hp.activation.inputKey]: true };
  const hpCandidate = candidate(hp, selfContext("127"), state);
  assert.equal(hpCandidate.enabled, true);
  assert.equal(hpCandidate.value, 24);
  assert.equal(candidate(hp, { ...selfContext("127"), relicMode: 2 }, state), undefined);
  const hpAttack = { id: "round4-savior-hp-scaling", type: "skill", attackType: "skill", element: "Physical", scalingStat: "hp", multiplier: 100, multipliers: [100], traceLevel: 1 };
  const hpOff = assertMatchesIndependent(engine, makeRequest(hpAttack, 1, { hp: 6000, baseHp: 1000 }, []), "Savior HP off");
  const hpOn = assertMatchesIndependent(engine, makeRequest(hpAttack, 1, { hp: 6000, baseHp: 1000 }, [hpCandidate]), "Savior owner HP +24%");
  assertClose(hpOff.nonCrit, 2160, "Savior HP off literal");
  assertClose(hpOn.nonCrit, 2246.4, "Savior owner HP +24% literal");
  const hpIncluded = candidate(hp, selfContext("127"), { ...state, [hp.finalStatsInclusion.inputKey]: true });
  assert.equal(hpIncluded.enabled, false);

  const provider = { characterId: "1001", partyIds: ["1002"], partyEquipment: [{ characterId: "1002", relicIds: ["127"], relicMode: 4 }] };
  const partyOff = candidate(partyDamage, provider);
  const partyOn = candidate(partyDamage, provider, state);
  assert.equal(partyOff.enabled, false);
  assert.equal(partyOn.enabled, true);
  assert.equal(partyOn.providerId, "1002");
  assert.equal(partyOn.value, 15);
  assert.equal(candidate(partyDamage, { ...provider, partyEquipment: [] }, state), undefined, "provider removal clears effect");
  assert.equal(candidate(partyDamage, { ...provider, partyEquipment: [{ characterId: "1002", relicIds: ["127"], relicMode: 2 }] }, state), undefined, "four-piece set required");
  const attack = { id: "round4-savior-party-skill", type: "skill", attackType: "skill", element: "Fire", scalingStat: "atk", multiplier: 100, multipliers: [100], traceLevel: 1 };
  const damage = assertMatchesIndependent(engine, makeRequest(attack, 1, { atk: 3000, critRate: 50, critDamage: 100 }, [partyOn]), "Savior party damage +15");
  assertClose(damage.nonCrit, 1242, "Savior party DMG +15% literal");
  assertClose(damage.crit, 2484, "Savior party DMG crit literal");
  assertClose(damage.expected, 1863, "Savior party DMG expected literal");
  const alreadyIncluded = candidate(partyDamage, provider, { ...state, [partyDamage.finalStatsInclusion.inputKey]: true });
  assert.equal(alreadyIncluded.enabled, false);
  assert.equal(JSON.parse(JSON.stringify(state))[hp.activation.inputKey], true, "the state is stable in saved calculator inputs");
});

test("Artistry 132 separates enemy DEF-down CRIT DMG from the manually selected party Fuel state", async () => {
  const { data, engine } = await loadProductionFixture();
  const cd = data.structuredModifiers.find((item) => item.id === "relic:132:4pc:defense-down-crit-damage");
  const partyDamage = data.structuredModifiers.find((item) => item.id === "relic:132:4pc:party-damage");
  assert.ok(cd && partyDamage);
  assert.notEqual(cd.activation.inputKey, partyDamage.activation.inputKey, "the two 4pc clauses are independently selected");
  assert.match(partyDamage.activation.conditionText, /防御力ダウンを付与した後/);
  assert.equal(partyDamage.activation.durationTurns, 2);
  const cdContext = selfContext("132");
  const cdOff = candidate(cd, cdContext);
  const cdOn = candidate(cd, cdContext, { [cd.activation.inputKey]: true });
  assert.equal(cdOff.enabled, false);
  assert.equal(cdOn.enabled, true);
  assert.equal(candidate(cd, { ...cdContext, relicMode: 2 }, { [cd.activation.inputKey]: true }), undefined);
  const attack = { id: "round4-artistry-crits", type: "skill", attackType: "skill", element: "Physical", scalingStat: "atk", multiplier: 100, multipliers: [100], traceLevel: 1 };
  const critOff = assertMatchesIndependent(engine, makeRequest(attack, 1, { atk: 3000, critRate: 50, critDamage: 100 }, [cdOff]), "Artistry enemy DEF-down off");
  const critOn = assertMatchesIndependent(engine, makeRequest(attack, 1, { atk: 3000, critRate: 50, critDamage: 100 }, [cdOn]), "Artistry enemy DEF-down CRIT DMG +28");
  assertClose(critOff.expected, 1620, "Artistry CRIT DMG off literal");
  assertClose(critOn.nonCrit, 1080, "Artistry CRIT DMG does not alter nonCrit");
  assertClose(critOn.crit, 2462.4, "Artistry CRIT DMG +28% literal crit");
  assertClose(critOn.expected, 1771.2, "Artistry CRIT DMG +28% literal expected");
  assert.equal(candidate(cd, cdContext, { [cd.activation.inputKey]: true, [cd.finalStatsInclusion.inputKey]: true }).enabled, false);

  const provider = { characterId: "1001", partyIds: ["1002"], partyEquipment: [{ characterId: "1002", relicIds: ["132"], relicMode: 4 }] };
  const fuelOff = candidate(partyDamage, provider);
  const fuelOn = candidate(partyDamage, provider, { [partyDamage.activation.inputKey]: true });
  assert.equal(fuelOff.enabled, false);
  assert.equal(fuelOn.enabled, true);
  assert.equal(fuelOn.providerId, "1002");
  assert.equal(fuelOn.activation.durationTurns, 2);
  assert.equal(candidate(partyDamage, { ...provider, partyEquipment: [] }, { [partyDamage.activation.inputKey]: true }), undefined);
  const fuel = assertMatchesIndependent(engine, makeRequest(attack, 1, { atk: 3000, critRate: 50, critDamage: 100 }, [fuelOn]), "Artistry party Fuel DMG +15");
  assertClose(fuel.nonCrit, 1242, "Fuel +15% literal nonCrit");
  assertClose(fuel.expected, 1863, "Fuel +15% literal expected");
  assert.equal(candidate(partyDamage, provider, { [partyDamage.activation.inputKey]: true, [partyDamage.finalStatsInclusion.inputKey]: true }).enabled, false);
  const restored = JSON.parse(JSON.stringify({ [cd.activation.inputKey]: true, [partyDamage.activation.inputKey]: true }));
  assert.equal(candidate(cd, cdContext, restored).enabled, true);
  assert.equal(candidate(partyDamage, provider, restored).enabled, true);
});
