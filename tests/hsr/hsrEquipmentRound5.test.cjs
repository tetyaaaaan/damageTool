"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProductionFixture, runtime, makeRequest, assertClose, assertMatchesIndependent } = require("./helpers/hsrDirectVerification.cjs");
const authored = require("../../games/hsr/data/calc/modifiers-equipment-round5.json").modifiers;
const rowsByCone = new Map();
for (const row of authored) {
  const id = row.source.id;
  if (!rowsByCone.has(id)) rowsByCone.set(id, []);
  rowsByCone.get(id).push(row);
}
const attack = (type = "normal") => ({ id: "round5-cone-" + type, type, element: "Fire", scalingStat: "atk", multipliers: Array(10).fill(100), canCrit: type !== "dot", target: "single" });
const amountTable = {
  "21001": [12, 15, 18, 21, 24], "21022": [16, 20, 24, 28, 32], "21026": [16, 20, 24, 28, 32],
  "21042": [15, 18.75, 22.5, 26.25, 30], "21043": [4, 5, 6, 7, 8], "21044": [24, 30, 36, 42, 48],
  "21045": [8, 10, 12, 14, 16], "21051": [20, 25, 30, 35, 40], "21053": [12, 14, 16, 18, 20],
  "21024-speed": [8, 9, 10, 11, 12], "21024-damage": [12, 15, 18, 21, 24],
  "21038": [25, 31.25, 37.5, 43.75, 50], "21041": [6, 7, 8, 9, 10]
};
const stateInputs = (row, id, count = 1) => {
  if (row.activation.mode === "toggle") return { [row.activation.inputKey]: true };
  if (row.activation.mode === "stack") return { [row.activation.inputKey]: count };
  return {};
};

test("round5 light cones are loaded and their authored values match fixed-source R1-R5", async () => {
  const { data } = await loadProductionFixture();
  for (const id of rowsByCone.keys()) {
    const records = data.structuredModifiers.filter(row => row.source.kind === "lightCone" && row.source.id === id);
    assert.equal(records.length, rowsByCone.get(id).length, "production loader includes authored rows for " + id);
  }
  assert.equal(authored.length, 13, "12 light cones; Spring in the River has separate SPD and damage components");
  for (const row of authored) assert.equal(row.provenance.sourceCommit, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  for (const [key, values] of Object.entries(amountTable)) {
    const [id, component] = key.split("-");
    const row = (rowsByCone.get(id) || []).find(item => !component || (component === "speed" ? item.stat === "speed" : item.category === "damageBonus"));
    assert.deepEqual(row.value.values, values, key + " R1-R5");
  }
});

test("round5 refinement effects produce independent damage at R1-R5 and restore final-stat inclusion safely", async () => {
  const { data, engine } = await loadProductionFixture();
  const rankEffects = ["21022", "21026", "21041", "21042", "21043", "21044", "21051", "21053", "21024", "21038"];
  for (const id of rankEffects) {
    for (let rank = 1; rank <= 5; rank++) {
      for (const row of rowsByCone.get(id)) {
        const ctx = { characterId: "1003", lightConeId: id, refinement: rank, stats: { atk: 3000, critRate: 50, critDamage: 100 }, baseStats: { atk: 1000 } };
        const inputs = stateInputs(row, id);
        const item = runtime.buildCandidates([row], ctx, inputs)[0];
        assert.equal(item.enabled, true, id + " R" + rank + " active");
        const valueKey = id === "21024" ? (row.stat === "speed" ? "21024-speed" : "21024-damage") : id;
        assert.equal(item.value, amountTable[valueKey][rank - 1] * (row.activation.mode === "stack" ? 1 : 1), id + " R" + rank + " value");
        const a = attack(id === "21051" ? "normal" : "ultimate");
        const applicable = runtime.applicableToAttack(item, a);
        const result = engine.calculate(makeRequest(a, 10, {}, [{ ...item, applicable }]));
        assertMatchesIndependent(engine, makeRequest(a, 10, {}, [{ ...item, applicable }]), id + " R" + rank);
        assertClose(result.expected, require("./helpers/hsrDirectVerification.cjs").independentDirectDamage(makeRequest(a, 10, {}, [{ ...item, applicable }])).expected);
        const includedInputs = { ...inputs, [row.finalStatsInclusion.inputKey]: true };
        const included = runtime.buildCandidates([row], ctx, includedInputs)[0];
        assert.equal(included.enabled, false, id + " R" + rank + " included effect is not double counted");
        assert.equal(included.includedInFinalStats, true);
        assert.equal(runtime.buildCandidates([row], ctx, JSON.parse(JSON.stringify(inputs)))[0].value, item.value, "saved/restored state for " + id);
        assert.equal(runtime.buildCandidates([row], { ...ctx, lightConeId: "" }, inputs).length, 0, "removing LC removes modifier " + id);
        if (id !== "21053") assert.equal(runtime.buildCandidates([row], { ...ctx, lightConeId: "21000", partyIds: ["1002"], partyEquipment: [{ characterId: "1002", lightConeId: id, refinement: rank }] }, inputs).length, 0, "wearer-only light-cone condition is not given to another active character");
        if (row.activation.mode === "toggle") assert.equal(runtime.buildCandidates([row], ctx, { [row.activation.inputKey]: false })[0].enabled, false, id + " OFF");
        if (row.activation.mode === "stack") assert.equal(runtime.buildCandidates([row], ctx, { [row.activation.inputKey]: 0 })[0].enabled, false, id + " 0 stacks");
      }
    }
  }
});

test("21001 debuff count is automatic, capped at 3, and independently affects direct/DoT damage at every refinement", async () => {
  const { engine } = await loadProductionFixture();
  const row = rowsByCone.get("21001")[0];
  for (let rank = 1; rank <= 5; rank++) for (const count of [0, 1, 2, 3, 5]) {
    const ctx = { characterId: "1003", lightConeId: "21001", refinement: rank, enemy: { debuffCount: count }, stats: { atk: 3000, critRate: 50, critDamage: 100 }, baseStats: { atk: 1000 } };
    const item = runtime.buildCandidates([row], ctx, {})[0];
    const stacks = Math.min(3, count);
    assert.equal(item.value, amountTable["21001"][rank - 1] * stacks);
    assert.equal(item.enabled, stacks > 0);
    assert.equal(item.automatic, true);
    for (const type of ["normal", "dot"]) {
      const a = attack(type);
      const mod = { ...item, applicable: item.applicable && runtime.applicableToAttack(item, a) };
      assertMatchesIndependent(engine, makeRequest(a, 10, {}, [mod]), "21001 R" + rank + " stacks" + stacks + " " + type);
    }
  }
});

test("21041 Trick and 21043 barrier counts clamp to the explicitly entered stack range", async () => {
  await loadProductionFixture();
  for (const [id, max] of [["21041", 3], ["21043", 4]]) {
    const row = rowsByCone.get(id)[0];
    for (let rank = 1; rank <= 5; rank++) for (const count of [-1, 0, 1, max, max + 2]) {
      const ctx = { characterId: "1003", lightConeId: id, refinement: rank };
      const item = runtime.buildCandidates([row], ctx, { [row.activation.inputKey]: count })[0];
      assert.equal(item.value, amountTable[id][rank - 1] * Math.max(0, Math.min(max, count)));
      assert.equal(item.enabled, count > 0);
      assert.equal(item.automatic, false);
    }
  }
});

test("21053 shield damage follows the current shielded ally, including self, whether the cone is worn by that ally or its party provider", async () => {
  const { engine } = await loadProductionFixture();
  const row = rowsByCone.get("21053")[0];
  assert.equal(row.target.owner, "activeAlly");
  for (let rank = 1; rank <= 5; rank++) {
    const on = { [row.activation.inputKey]: true };
    const selfContext = { characterId: "1003", lightConeId: "21053", refinement: rank, stats: { atk: 3000, critRate: 50, critDamage: 100 }, baseStats: { atk: 1000 } };
    const self = runtime.buildCandidates([row], selfContext, on)[0];
    assert.equal(self.enabled, true);
    assert.equal(self.value, amountTable["21053"][rank - 1]);
    const a = attack("normal");
    assertMatchesIndependent(engine, makeRequest(a, 10, {}, [{ ...self, applicable: runtime.applicableToAttack(self, a) }]), "21053 R" + rank + " wearer shields self");

    const partyContext = { characterId: "1003", lightConeId: "20000", partyIds: ["1002"], partyEquipment: [{ characterId: "1002", lightConeId: "21053", refinement: rank }], stats: { atk: 3000, critRate: 50, critDamage: 100 }, baseStats: { atk: 1000 } };
    const party = runtime.buildCandidates([row], partyContext, on)[0];
    assert.equal(party.enabled, true);
    assert.equal(party.providerId, "1002");
    assert.equal(party.tab, "パーティ");
    assert.equal(party.value, amountTable["21053"][rank - 1]);
    assertMatchesIndependent(engine, makeRequest(a, 10, {}, [{ ...party, applicable: runtime.applicableToAttack(party, a) }]), "21053 R" + rank + " party provider to shielded active ally");

    const off = runtime.buildCandidates([row], partyContext, { [row.activation.inputKey]: false })[0];
    assert.equal(off.enabled, false, "no shield condition means no damage bonus");
    const included = runtime.buildCandidates([row], partyContext, { ...on, [row.finalStatsInclusion.inputKey]: true })[0];
    assert.equal(included.enabled, false, "already-included recipient final stats are not added again");
    assert.equal(runtime.buildCandidates([row], { ...partyContext, partyIds: [], partyEquipment: [] }, on).length, 0, "provider removal removes support candidate");
    assert.equal(runtime.buildCandidates([row], { ...partyContext, partyEquipment: [] }, on).length, 0, "unequipping the provider removes support candidate");
    assert.equal(runtime.buildCandidates([row], partyContext, JSON.parse(JSON.stringify(on)))[0].enabled, true, "saved/restored shield selection");
  }
});

test("21041 Trick damage is explicitly one turn and uses current stacks without simulating stack updates", async () => {
  await loadProductionFixture();
  const row = rowsByCone.get("21041")[0];
  assert.equal(row.activation.durationTurns, 1);
  assert.equal(row.activation.maximum, 3);
  assert.deepEqual(row.value.values, [6, 7, 8, 9, 10]);
});
test("21022 and 21026 conditional DoT bonuses are limited to the selected debuff state and never affect other LCs", async () => {
  const { engine } = await loadProductionFixture();
  for (const id of ["21022", "21026"]) for (const rank of [1, 5]) {
    const row = rowsByCone.get(id)[0], ctx = { characterId: "1003", lightConeId: id, refinement: rank };
    const on = runtime.buildCandidates([row], ctx, { [row.activation.inputKey]: true })[0];
    for (const type of ["normal", "dot"]) {
      const a = attack(type), mod = { ...on, applicable: runtime.applicableToAttack(on, a) };
      const expectedBonus = amountTable[id][rank - 1];
      const base = makeRequest(a, 10, {}, []), enhanced = makeRequest(a, 10, {}, [mod]);
      const baseDamage = engine.calculate(base).nonCrit, actual = engine.calculate(enhanced).nonCrit;
      assertClose(actual, baseDamage * (1 + expectedBonus / 100));
    }
    assert.equal(runtime.buildCandidates([row], { ...ctx, lightConeId: "" }, { [row.activation.inputKey]: true }).length, 0);
    assert.equal(runtime.buildCandidates([row], ctx, { [row.activation.inputKey]: false })[0].enabled, false);
  }
});

test("21051 post-Ult modifier applies only to wearer normal and enhanced-normal attacks", async () => {
  await loadProductionFixture();
  const row = rowsByCone.get("21051")[0], ctx = { characterId: "1003", lightConeId: "21051", refinement: 5 };
  const item = runtime.buildCandidates([row], ctx, { [row.activation.inputKey]: true })[0];
  for (const type of ["normal", "enhancedNormal", "skill", "ultimate", "followUp", "dot"]) {
    assert.equal(runtime.applicableToAttack(item, attack(type)), ["normal", "enhancedNormal"].includes(type), type);
  }
});

test("21045 post-Ult SPD is selected and feeds the existing Glamoth speed threshold", async () => {
  const { data } = await loadProductionFixture();
  const speed = rowsByCone.get("21045")[0];
  const glamoth = data.structuredModifiers.find(row => row.id === "ornament:311:2pc:speed-damage");
  assert.ok(glamoth);
  const ctx = { characterId: "1003", lightConeId: "21045", refinement: 5, ornamentId: "311", stats: { speed: 134 }, baseStats: { speed: 100 } };
  const results = runtime.buildCandidates([speed, glamoth], ctx, { [speed.activation.inputKey]: true });
  const speedItem = results.find(row => row.id === speed.id), damage = results.find(row => row.id === glamoth.id);
  assert.equal(speedItem.value, 16); assert.equal(speedItem.enabled, true);
  assert.equal(damage.enabled, true); assert.equal(damage.value, 12); assert.equal(damage.thresholdReferenceValue, 150);
  const off = runtime.buildCandidates([speed, glamoth], ctx, { [speed.activation.inputKey]: false }).find(row => row.id === glamoth.id);
  assert.equal(off.enabled, false, "SPD contribution removed when selected post-Ult condition is off");
});
