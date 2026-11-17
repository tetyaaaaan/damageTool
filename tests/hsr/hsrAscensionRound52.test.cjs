"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const runtime = require("../../games/js/hsrModifierRuntime.js");
const records = require("../../games/hsr/data/calc/modifiers-v47-round52.json").modifiers;

const context = (characterId, extra = {}) => ({
  characterId,
  eidolon: 0,
  partyIds: [],
  partyEidolons: {},
  traceLevelFor: () => 1,
  ...extra
});

function candidate(id, characterId, attack, active, extra = {}) {
  const item = runtime.buildCandidates(records, { ...context(characterId, { partyIds: ["1511"], partyEidolons: { "1511": 0 } }), attack, ...extra }, {
    "aha-world-active": active,
    "lc-23065-after-ally-skill-active": active
  })
    .find((entry) => entry.id === id);
  return item && { ...item, applicable: runtime.applicableToAttack(item, attack) };
}

test("Round52 Sparxie multiplier ascension is gated, proportional, and limited to her Elation Skill", () => {
  const id = "v47:trace:1501:150129:elation-skill-multiplier";
  const record = records.find((item) => item.id === id);
  assert.equal(record.value.fixed, 15, "percent of the original multiplier");
  assert.deepEqual(record.target.attackIds, ["150120"]);
  const skill = { id: "150120", type: "elation", element: "Imaginary" };
  const other = { id: "150121", type: "elation", element: "Imaginary" };
  const inactive = candidate(id, "1501", skill, false);
  assert.equal(inactive.enabled, false);
  const active = candidate(id, "1501", skill, true);
  assert.equal(active.enabled, true);
  assert.equal(active.applicable, true);
  assert.equal(active.value, 15);
  assert.equal(candidate(id, "1501", other, true).applicable, false);
  assert.equal(candidate(id, "1502", skill, true), undefined, "self-only source cannot be borrowed by another character");
  const absentAha = candidate(id, "1501", skill, true, { partyIds: [], partyEidolons: {} });
  assert.equal(absentAha.enabled, false, "Aha absent from the roster disables this ascension effect");
  const higherAha = candidate(id, "1501", skill, true, { partyIds: ["1511"], partyEidolons: { "1511": 1 } });
  assert.equal(higherAha.enabled, false, "only the E0 Aha snapshot is supported");
});

test("Round52 party defense-ignore ascensions apply only when the world toggle is active", () => {
  for (const [id, provider] of [
    ["v47:trace:1501:150129:party-defense-ignore", "1501"],
    ["v47:trace:1505:150529:party-defense-ignore", "1505"]
  ]) {
    const attack = { id: "ally-basic", type: "normal", element: "Physical" };
    const off = candidate(id, "1001", attack, false, { partyIds: ["1511", provider] });
    assert.ok(off);
    assert.equal(off.enabled, false);
    const on = candidate(id, "1001", attack, true, { partyIds: ["1511", provider] });
    assert.ok(on, `${provider} row should be selected for an ally attack`);
    assert.equal(on.enabled, true);
    assert.equal(on.applicable, true);
    assert.equal(on.value, 10);
    assert.equal(on.providerId, provider);
  }
});

test("Round52 ascension buffs require Aha E0 and stay off until the world state is active", () => {
  const cases = [
    ["v47:trace:1501:150129:party-defense-ignore", "1501"],
    ["v47:trace:1505:150529:party-defense-ignore", "1505"],
    ["v47:trace:1506:150629:crit-damage", "1506"],
    ["v47:trace:1513:151329:party-speed", "1513"]
  ];
  for (const [id, provider] of cases) {
    const attack = { id: "ally-basic", type: "normal", element: "Physical" };
    const presentOff = candidate(id, provider, attack, false, { partyIds: ["1511"], partyEidolons: { "1511": 0 } });
    assert.ok(presentOff);
    assert.equal(presentOff.enabled, false, `${id}: Aha present but world toggle off`);
    const presentOn = candidate(id, provider, attack, true, { partyIds: ["1511"], partyEidolons: { "1511": 0 } });
    assert.ok(presentOn);
    assert.equal(presentOn.enabled, true, `${id}: E0 Aha and active world`);
    const absent = candidate(id, provider, attack, true, { partyIds: [], partyEidolons: {} });
    assert.ok(absent);
    assert.equal(absent.enabled, false, `${id}: Aha absent`);
    for (const eidolon of [1, 2]) {
      const higherAha = candidate(id, provider, attack, true, { partyIds: ["1511"], partyEidolons: { "1511": eidolon } });
      assert.ok(higherAha);
      assert.equal(higherAha.enabled, false, `${id}: Aha E${eidolon} is outside the certified E0 scope`);
    }
  }
});

test("Round52 Silver Wolf 999 self CRIT DMG and Summer Aventurine party SPD are scoped", () => {
  const silverId = "v47:trace:1506:150629:crit-damage";
  assert.equal(candidate(silverId, "1506", { id: "150620", type: "elation", element: "Quantum" }, true).value, 40);
  assert.equal(candidate(silverId, "1502", { id: "150620", type: "elation", element: "Quantum" }, true), undefined);

  const speedId = "v47:trace:1513:151329:party-speed";
  const speed = candidate(speedId, "1001", { id: "ally-basic", type: "normal", element: "Physical" }, true, { partyIds: ["1511", "1513"] });
  assert.ok(speed);
  assert.equal(speed.enabled, true);
  assert.equal(speed.value, 15);
  assert.equal(speed.stat, "speed");
});

test("Round52 ascension rows use the first effect tier and require Aha E0", () => {
  const ascensions = records.filter((item) => item.source.kind === "trace" && ["1501", "1505", "1506", "1513"].includes(item.source.id));
  assert.equal(ascensions.length, 5);
  for (const record of ascensions) {
    assert.match(record.source.skillId, /29$/, "the effect comes from the ascension skill record");
    assert.equal(record.activation.requiredCharacterId, "1511");
    assert.equal(record.activation.requiredCharacterMaxEidolon, 0);
    assert.equal(record.provenance.sourceCommit, "03907e798b46f9eb109a1f882055cdf49ce3d374");
    assert.equal(record.support.verified, true);
  }
  assert.equal(ascensions.find((item) => item.id === "v47:trace:1501:150129:elation-skill-multiplier").value.fixed, 15);
  assert.equal(ascensions.find((item) => item.id === "v47:trace:1501:150129:party-defense-ignore").value.fixed, 10);
  assert.equal(ascensions.find((item) => item.id === "v47:trace:1505:150529:party-defense-ignore").value.fixed, 10);
  assert.equal(ascensions.find((item) => item.id === "v47:trace:1506:150629:crit-damage").value.fixed, 40);
  assert.equal(ascensions.find((item) => item.id === "v47:trace:1513:151329:party-speed").value.fixed, 15);
});

test("Round52 light-cone effects retain refinement curves and explicit state boundaries", () => {
  const defense = records.find((item) => item.id === "v47:lightCone:23065:party-defense-ignore");
  assert.deepEqual(defense.value.values, [16, 18, 20, 22, 24]);
  assert.equal(defense.activation.inputKey, "lc-23065-after-ally-skill-active");
  assert.equal(defense.target.owner, "partyAll");

  const perPath = records.find((item) => item.id === "v47:lightCone:22009:elation-party-count-crit-damage");
  assert.deepEqual(perPath.value.values, [6, 7, 8, 9, 10]);
  assert.equal(perPath.value.reference, "party.elationCount");
  const aha = records.find((item) => item.id === "v47:lightCone:22009:aha-field-crit-damage");
  assert.deepEqual(aha.value.values, [12, 14, 16, 18, 20]);
  assert.equal(aha.activation.mode, "always");
  assert.equal(aha.activation.requiredCharacterId, "1511");
});

test("Round52 light-cone candidates select the fixed rank values and explicit activation", () => {
  const defense = records.find((item) => item.id === "v47:lightCone:23065:party-defense-ignore");
  for (const [refinement, expected] of [[1,16],[2,18],[3,20],[4,22],[5,24]]) {
    const own = runtime.buildCandidates([defense], {
      characterId: "1501", partyIds: ["1502"], lightConeId: "23065", refinement
    }, { "lc-23065-after-ally-skill-active": true })[0];
    assert.equal(own.enabled, true);
    assert.equal(own.value, expected, `23065 S${refinement}`);
    const inactive = runtime.buildCandidates([defense], {
      characterId: "1501", partyIds: ["1502"], lightConeId: "23065", refinement
    }, { "lc-23065-after-ally-skill-active": false })[0];
    assert.equal(inactive.enabled, false, `23065 S${refinement} before the ally-skill trigger`);
  }
  const releasedProvider = runtime.buildCandidates([defense], {
    characterId: "1001", partyIds: ["1501"], partyEquipment: [{ characterId: "1501", lightConeId: "23065", refinement: 4 }]
  }, { "lc-23065-after-ally-skill-active": true })[0];
  assert.equal(releasedProvider.providerId, "1501", "party equipment provider is retained");
  assert.equal(releasedProvider.value, 22, "party provider refinement is used");
  assert.equal(runtime.buildCandidates([defense], { characterId: "1001", partyIds: ["1501"] }, { "lc-23065-after-ally-skill-active": true }).length, 0, "an unselected light cone is not released as a provider");

  const perPath = records.find((item) => item.id === "v47:lightCone:22009:elation-party-count-crit-damage");
  for (const [refinement, expected] of [[1,12],[2,14],[3,16],[4,18],[5,20]]) {
    const pathCandidate = runtime.buildCandidates([perPath], {
      characterId: "1501", partyIds: ["1502"], lightConeId: "22009", refinement,
      partyPaths: { "1501": "Elation", "1502": "Elation" }
    }, {})[0];
    assert.equal(pathCandidate.value, expected, `22009 S${refinement} with two Elation characters`);
  }

  const aha = records.find((item) => item.id === "v47:lightCone:22009:aha-field-crit-damage");
  assert.equal(aha.activation.mode, "always");
  assert.equal(aha.activation.inputKey, undefined);
  assert.equal(aha.activation.requiredCharacterId, "1511");
  assert.equal(aha.activation.requiredCharacterMaxEidolon, undefined, "the light-cone effect does not depend on Aha E0");
  for (const [refinement, expected] of [[1,12],[2,14],[3,16],[4,18],[5,20]]) {
    const ahaCandidate = runtime.buildCandidates([aha], {
      characterId: "1501", partyIds: ["1511"], partyEidolons: { "1511": 1 }, lightConeId: "22009", refinement
    }, { "aha-world-active": false })[0];
    assert.equal(ahaCandidate.enabled, true);
    assert.equal(ahaCandidate.value, expected, `22009 Aha field present S${refinement}, independent of world-state toggle`);
  }
  assert.equal(runtime.buildCandidates([aha], {
    characterId: "1501", partyIds: [], lightConeId: "22009", refinement: 1
  }, { "aha-world-active": true })[0].enabled, false, "Aha field effect requires Aha in roster");
});

test("Round52 provider release and final-stat inclusion use the existing candidate contract", () => {
  const partyBuff = records.find((item) => item.id === "v47:trace:1501:150129:party-defense-ignore");
  const released = runtime.buildCandidates([partyBuff], {
    characterId: "1001", partyIds: ["1511", "1501"], partyEidolons: { "1511": 0 },
    attack: { id: "party-hit", type: "normal", element: "Physical" }
  }, { "aha-world-active": true })[0];
  assert.equal(released.providerId, "1501");
  assert.equal(released.enabled, true);
  assert.equal(released.value, 10);

  const crit = records.find((item) => item.id === "v47:aha:world-critRate");
  const baseContext = { characterId: "1511", eidolon: 0, partyIds: [], partyEidolons: {}, stats: { critRate: 20 }, traceLevelFor: () => 1 };
  const active = runtime.buildCandidates([crit], baseContext, { "aha-world-active": true })[0];
  assert.equal(active.enabled, true);
  assert.equal(active.value, 12);
  const included = runtime.buildCandidates([crit], baseContext, {
    "aha-world-active": true,
    "aha:world-critRate-in-final": true
  })[0];
  assert.equal(included.enabled, false);
  assert.equal(included.includedInFinalStats, true, "already-final CRIT Rate is not added twice");
});
