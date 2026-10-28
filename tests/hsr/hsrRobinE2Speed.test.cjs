"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fixedSourceSha, loadProductionFixture, runtime, assertClose } = require("./helpers/hsrDirectVerification.cjs");

const recordId = "eidolon:1309:2:party-speed";
const active = { characterId: "1001", partyIds: ["1309"], partyEidolons: { "1309": 2 }, stats: { speed: 108 }, baseStats: { speed: 100 }, ornamentId: "311", traceLevelFor: () => 15 };
const disabled = { "robin-e2-concerto-speed-active": false };
const enabled = { "robin-e2-concerto-speed-active": true };

test("Robin E2 speed support uses the fixed 16% value only while Concerto is selected", async () => {
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  const { data } = await loadProductionFixture();
  const robinRecords = data.structuredModifiers.filter((record) => record.id === recordId);
  const ruanRecord = data.structuredModifiers.find((record) => record.id === "trace:1303:130304:party-speed");
  const glamoth = data.structuredModifiers.find((record) => record.id === "ornament:311:2pc:speed-damage");
  assert.equal(robinRecords.length, 1, "manifest exposes the dedicated Robin E2 file");
  assert.ok(ruanRecord, "existing Ruan Mei speed support is reused");
  assert.ok(glamoth, "existing effective-speed threshold is reused");
  const records = [...robinRecords, ruanRecord, glamoth];
  const context = { ...active, partyIds: ["1309", "1303"], partyEidolons: { "1309": 2, "1303": 0 } };

  const off = runtime.buildCandidates(records, context, disabled);
  const robinOff = off.find((item) => item.id === recordId);
  assert.equal(robinOff.enabled, false);
  assert.equal(robinOff.automatic, false, "Concerto state remains user selected");
  assert.equal(off.find((item) => item.id === glamoth.id).enabled, false);

  const on = runtime.buildCandidates(records, context, enabled);
  const robinOn = on.find((item) => item.id === recordId);
  const glamothOn = on.find((item) => item.id === glamoth.id);
  assert.equal(robinOn.value, 16);
  assert.equal(robinOn.enabled, true);
  assert.equal(robinOn.automatic, false);
  // Independent arithmetic: entered final SPD 108 + (base SPD 100 * (16% Robin + 11% Ruan Mei)) = 135.
  // The exact threshold is met, so Glamoth's existing 12% tier must activate.
  assertClose(108 + 100 * (16 + 11) / 100, 135, "independent SPD total at threshold");
  assert.equal(glamothOn.enabled, true);
  assertClose(glamothOn.thresholdReferenceValue, 135, "evaluated SPD threshold reference");
  assert.equal(glamothOn.value, 12);

  // Below threshold and exact boundary are both based on the final input plus support-added base SPD.
  const belowContext = { ...context, stats: { speed: 107.999 } };
  const below = runtime.buildCandidates(records, belowContext, enabled).find((item) => item.id === glamoth.id);
  assertClose(belowContext.stats.speed + 100 * (16 + 11) / 100, 134.999, "independent SPD just below threshold");
  assert.equal(below.enabled, false);
  const overContext = { ...context, stats: { speed: 133 } };
  const over = runtime.buildCandidates(records, overContext, enabled).find((item) => item.id === glamoth.id);
  assertClose(overContext.stats.speed + 100 * (16 + 11) / 100, 160, "independent SPD at second tier");
  assert.equal(over.enabled, true);
  assert.equal(over.value, 18);
  assertClose(over.thresholdReferenceValue, 160, "evaluated SPD at second tier");

  // Declaring the buff in final SPD is separate from selecting the Concerto state.
  const included = runtime.buildCandidates(records, context, { ...enabled, "robin-e2-speed-in-final-stats": true });
  assert.equal(included.find((item) => item.id === recordId).enabled, false);
  assert.equal(included.find((item) => item.id === recordId).includedInFinalStats, true);
  assert.equal(included.find((item) => item.id === glamoth.id).thresholdReferenceValue, 119, "already included final SPD is not added again");
  const finalInputOnly = runtime.buildCandidates(robinRecords, { ...context, partyIds: [] }, { "robin-e2-speed-in-final-stats": true });
  assert.equal(finalInputOnly.length, 0, "provider removal drops the effect even when saved input keys remain");
});

test("Robin E2 is available at E2, includes Robin herself, and does not duplicate across attack types", async () => {
  const { data } = await loadProductionFixture();
  const records = data.structuredModifiers.filter((record) => record.id === recordId);
  assert.equal(runtime.buildCandidates(records, { characterId: "1001", partyIds: ["1309"], partyEidolons: { "1309": 1 } }, enabled).length, 0, "E1 cannot activate E2");
  const party = runtime.buildCandidates(records, active, enabled);
  assert.equal(party.length, 1);
  assert.equal(party[0].providerId, "1309");
  assert.equal(party[0].applicable, true, "fixed value needs no trace level validation");
  assert.equal(runtime.applicableToAttack(party[0], { type: "normal" }), true);
  assert.equal(runtime.applicableToAttack(party[0], { type: "ultimate" }), true);
  assert.equal(runtime.applicableToAttack(party[0], { type: "dot" }), true);
  const self = runtime.buildCandidates(records, { characterId: "1309", eidolon: 2, partyIds: [] }, enabled);
  assert.equal(self.length, 1, "Robin is included among party members");
  assert.equal(self[0].value, 16, "the support is registered once, not duplicated for attack candidates");
});


test("Rappa E4 seal-form speed support reuses the same party and inclusion handling", async () => {
  const { data } = await loadProductionFixture();
  const records = data.structuredModifiers.filter((record) => record.id === "eidolon:1317:4:party-speed");
  assert.equal(records.length, 1);
  const context = { characterId: "1001", partyIds: ["1317"], partyEidolons: { "1317": 4 }, stats: { speed: 100 }, baseStats: { speed: 100 } };
  const off = runtime.buildCandidates(records, context, { "rappa-e4-sealform-speed-active": false })[0];
  assert.equal(off.enabled, false);
  assert.equal(off.automatic, false, "seal form must be selected as an active state");
  const on = runtime.buildCandidates(records, context, { "rappa-e4-sealform-speed-active": true })[0];
  assert.equal(on.value, 12);
  assert.equal(on.enabled, true);
  assertClose(100 + 100 * 12 / 100, 112, "independent Rappa E4 SPD total");
  assert.equal(runtime.buildCandidates(records, { ...context, partyEidolons: { "1317": 3 } }, { "rappa-e4-sealform-speed-active": true }).length, 0);
  assert.equal(runtime.buildCandidates(records, { ...context, partyIds: [] }, { "rappa-e4-sealform-speed-active": true }).length, 0);
  const included = runtime.buildCandidates(records, context, { "rappa-e4-sealform-speed-active": true, "rappa-e4-speed-in-final-stats": true })[0];
  assert.equal(included.enabled, false);
  assert.equal(included.includedInFinalStats, true);

  const stateApi = require("../../games/js/hsrCalcState.js");
  const defaults = { enemy: {}, conditions: [], modifierInputs: {}, party: [], traceLevels: {}, source: "manual", relicMode: "4pc", enhancementState: "previous", attackerPosition: 1 };
  const saved = stateApi.create({ ...defaults, modifierInputs: { "rappa-e4-sealform-speed-active": true, "rappa-e4-speed-in-final-stats": true } });
  const storage = { value: "", setItem(_key, value) { this.value = value; }, getItem() { return this.value; } };
  assert.equal(stateApi.save(storage, saved), true);
  const restored = stateApi.restore(stateApi.load(storage).value, defaults, { characters: [], lightCones: [], relicSets: [] }, []);
  assert.equal(restored.state.modifierInputs["rappa-e4-sealform-speed-active"], true);
  assert.equal(restored.state.modifierInputs["rappa-e4-speed-in-final-stats"], true);
});
