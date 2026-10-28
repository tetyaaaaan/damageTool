"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fixedSourceSha, loadProductionFixture, makeRequest, attackOf, runtime, independentDirectDamage, assertClose } = require("./helpers/hsrDirectVerification.cjs");
const authoredRecords = require("../../games/hsr/data/calc/modifiers-equipment-round3.json").modifiers;

const ids = [
  "lightCone:20019:party-speed-flat",
  "lightCone:20020:ultimate-atk",
  "lightCone:20016:low-hp-crit-rate",
  "lightCone:20003:low-hp-extra-def"
];
const values = {
  "lightCone:20019:party-speed-flat": [12, 14, 16, 18, 20],
  "lightCone:20020:ultimate-atk": [24, 30, 36, 42, 48],
  "lightCone:20016:low-hp-crit-rate": [12, 15, 18, 21, 24],
  "lightCone:20003:low-hp-extra-def": [16, 20, 24, 28, 32]
};
const coneIds = Object.fromEntries(ids.map(id => [id, id.split(":")[1]]));
const inputKeys = {
  "lightCone:20019:party-speed-flat": "lc-20019-opening-speed",
  "lightCone:20020:ultimate-atk": "lc-20020-ultimate-atk-active"
};
const inclusionKeys = {
  "lightCone:20020:ultimate-atk": "lc-20020-atk-in-final",
  "lightCone:20016:low-hp-crit-rate": "lc-20016-crit-in-final",
  "lightCone:20003:low-hp-extra-def": "lc-20003-extra-def-in-final"
};
const clone = value => JSON.parse(JSON.stringify(value));
const recordOf = (data, id) => data.structuredModifiers.find(item => item.id === id) || authoredRecords.find(item => item.id === id);

function withAttack(candidate, attack) {
  return { ...candidate, applicable: candidate.applicable && runtime.applicableToAttack(candidate, attack) };
}

test("three new fixed-source cone additions and the existing Synchrony effect resolve at every rank", async () => {
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  const { data } = await loadProductionFixture();
  for (const id of ids) {
    const record = data.structuredModifiers.find(item => item.id === id);
    assert.ok(record, "registered in production loader: " + id);
    assert.equal(record.source.kind, "lightCone");
    assert.equal(record.source.id, coneIds[id]);
    assert.equal(record.support.status, "calculable");
    if (id !== "lightCone:20019:party-speed-flat") assert.equal(record.provenance.sourceCommit, fixedSourceSha);
    assert.deepEqual(record.value.values, values[id]);
    const cone = data.lightCones.find(item => item.id === coneIds[id]);
    assert.ok(cone, "catalog cone " + coneIds[id]);
    for (let rank = 1; rank <= 5; rank++) {
      const ctx = { characterId: "1001", lightConeId: coneIds[id], refinement: rank, stats: { hpPercent: 70, speed: 140 } };
      const candidate = runtime.buildCandidates([record], ctx, {})[0];
      assert.equal(candidate.value, values[id][rank - 1], id + " S" + rank);
      assert.ok(candidate, "selected while equipped: " + id);
      assert.equal(runtime.buildCandidates([record], { ...ctx, lightConeId: "20000" }, { [inputKeys[id]]: true }).length, 0, id + " removed on replacement");
      assert.equal(runtime.buildCandidates([record], { ...ctx, lightConeId: "" }, { [inputKeys[id]]: true }).length, 0, id + " removed on unequip");
      const restored = runtime.buildCandidates([record], ctx, clone({ [inputKeys[id]]: true }))[0];
      if (inputKeys[id]) assert.equal(restored.enabled, true, id + " toggle restores");
      assert.equal(restored.value, values[id][rank - 1]);
    }
  }
});

test("Harmony cone flat SPD buff is a party-wide optional battle state and feeds Glamoth's effective-speed threshold", async () => {
  const { data } = await loadProductionFixture();
  const cone = recordOf(data, "lightCone:20019:party-speed-flat");
  const glamoth = data.structuredModifiers.find(item => item.id === "ornament:311:2pc:speed-damage");
  assert.ok(cone && glamoth);
  for (let rank = 1; rank <= 5; rank++) {
    const context = {
      characterId: "1001", partyIds: ["1002"], partyEquipment: [{ characterId: "1002", lightConeId: "20019", refinement: rank }],
      stats: { speed: 140 }, baseStats: { speed: 100 }, ornamentId: "311"
    };
    const key = cone.activation.inputKey;
    const off = runtime.buildCandidates([cone, glamoth], context, {});
    assert.equal(off[0].automatic, false);
    assert.equal(off[0].enabled, false);
    assert.equal(off[1].enabled, true, "140 base SPD already reaches Glamoth's first tier");
    assert.equal(off[1].value, 12, "untriggered cone state cannot raise Glamoth beyond base-speed tier");
    const saved = clone({ [key]: true });
    const on = runtime.buildCandidates([cone, glamoth], context, saved);
    assert.equal(on[0].value, values[cone.id][rank - 1]);
    assert.equal(on[0].enabled, true);
    assert.equal(on[0].providerId, "1002");
    assert.equal(on[1].enabled, true, "all rank values remain above Glamoth's 135 SPD first tier");
    assert.equal(on[1].value, rank === 5 ? 18 : 12, "Glamoth's two speed tiers use effective SPD");
    assert.equal(runtime.buildCandidates([cone], { ...context, partyEquipment: [] }, saved).length, 0, "removing the provider removes party support");
  }
  for (const delta of [-0.01, 0, 0.01]) {
    const context = { characterId: "1001", partyIds: ["1002"], partyEquipment: [{ characterId: "1002", lightConeId: "20019", refinement: 5 }], stats: { speed: 140 + delta }, baseStats: { speed: 100 }, ornamentId: "311" };
    const result = runtime.buildCandidates([cone, glamoth], context, { [cone.activation.inputKey]: true });
    assert.equal(result[1].enabled, true, "the 135 SPD tier remains available around the upper threshold");
    assert.equal(result[1].value, delta >= 0 ? 18 : 12, "160 speed boundary after party support");
  }
});

test("Knowledge cone ATK applies only after its wearer uses Ultimate and matches independent damage at S1-S5", async () => {
  const { data, engine } = await loadProductionFixture();
  const record = recordOf(data, "lightCone:20020:ultimate-atk");
  assert.ok(record);
  const attack = { id: "round3-atk", type: "normal", element: "Fire", scalingStat: "atk", multipliers: Array(10).fill(100), canCrit: true, target: "single" };
  for (let rank = 1; rank <= 5; rank++) {
    const context = { characterId: "1001", lightConeId: "20020", refinement: rank, baseStats: { atk: 1000 }, stats: { atk: 2000, hpPercent: 70, critRate: 50, critDamage: 100 } };
    const on = runtime.buildCandidates([record], context, { [record.activation.inputKey]: true })[0];
    const off = runtime.buildCandidates([record], context, {})[0];
    assert.equal(on.automatic, false);
    assert.equal(on.enabled, true);
    assert.equal(off.enabled, false);
    assert.equal(runtime.applicableToAttack(on, attack), true);
    const input = makeRequest(attack, 10, { atk: 2000, baseAtk: 1000, critRate: 50, critDamage: 100 }, [withAttack(on, attack)]);
    const result = engine.calculate(input);
    const independent = independentDirectDamage(input);
    assertClose(result.nonCrit, independent.nonCrit, "20020 S" + rank + " independent nonCrit");
    assertClose(independent.effectiveAtk, 2000 + 1000 * values[record.id][rank - 1] / 100, "20020 S" + rank + " independently resolved ATK");
    const included = runtime.buildCandidates([record], context, { [record.activation.inputKey]: true, [inclusionKeys[record.id]]: true })[0];
    assert.equal(included.enabled, false, "final ATK inclusion avoids a second addition");
    const restored = runtime.buildCandidates([record], context, clone({ [record.activation.inputKey]: true }))[0];
    assert.equal(restored.enabled, true);
  }
  assert.equal(runtime.buildCandidates([record], { characterId: "1001", partyIds: ["1002"], partyEquipment: [{ characterId: "1002", lightConeId: "20020", refinement: 5 }] }, { [record.activation.inputKey]: true }).length, 0, "Ultimate ATK buff is wearer-only");
});

test("Burial cone low-HP CR uses strict 80% boundary, no missing-HP assumption, and real crit calculation", async () => {
  const { data, engine } = await loadProductionFixture();
  const record = recordOf(data, "lightCone:20016:low-hp-crit-rate");
  assert.ok(record);
  for (let rank = 1; rank <= 5; rank++) {
    for (const [hpPercent, active] of [[79.99, true], [80, false], [80.01, false]]) {
      const context = { characterId: "1001", lightConeId: "20016", refinement: rank, stats: { hpPercent, atk: 2000, critRate: 50, critDamage: 100 } };
      const candidate = runtime.buildCandidates([record], context, {})[0];
      assert.equal(candidate.enabled, active, "HP " + hpPercent + "%");
      assert.equal(candidate.automatic, true);
      if (active) {
        const attack = { id: "round3-crit", type: "normal", element: "Ice", scalingStat: "atk", multipliers: Array(10).fill(100), canCrit: true, target: "single" };
        const input = makeRequest(attack, 10, { atk: 2000, critRate: 50, critDamage: 100 }, [withAttack(candidate, attack)]);
        const result = engine.calculate(input);
        const independent = independentDirectDamage(input);
        assertClose(result.expected, independent.expected, "20016 S" + rank + " independent expected");
        assertClose(independent.expected, independent.nonCrit * (1 + Math.min(100, 50 + values[record.id][rank - 1]) / 100), "20016 S" + rank + " literal expected crit damage");
      }
    }
    const included = runtime.buildCandidates([record], { characterId: "1001", lightConeId: "20016", refinement: rank, stats: { hpPercent: 70, critRate: 50 } }, { [inclusionKeys[record.id]]: true })[0];
    assert.equal(included.enabled, false, "final CR inclusion avoids a second addition");
  }
  const missing = runtime.buildCandidates([record], { characterId: "1001", lightConeId: "20016", refinement: 1, stats: {} }, {})[0];
  assert.equal(missing.enabled, false, "missing HP must remain unknown, not be treated as zero");
  assert.equal(missing.activation.unresolved, true, "missing HP is explicitly exposed as unresolved");
});

test("Amber cone adds only low-HP DEF and changes a production DEF-scaling attack", async () => {
  const { data, engine } = await loadProductionFixture();
  const record = recordOf(data, "lightCone:20003:low-hp-extra-def");
  assert.ok(record);
  const attack = attackOf(data, "130401");
  assert.equal(attack.scalingStat, "def", "test a registered DEF-scaling attack");
  for (let rank = 1; rank <= 5; rank++) {
    for (const [hpPercent, active] of [[49.99, true], [50, false], [50.01, false]]) {
      const context = { characterId: "1304", lightConeId: "20003", refinement: rank, stats: { hpPercent, def: 3000, critRate: 0, critDamage: 0 }, baseStats: { def: 1000 } };
      const candidate = runtime.buildCandidates([record], context, {})[0];
      assert.equal(candidate.enabled, active, "HP " + hpPercent + "%");
      assert.equal(candidate.automatic, true);
      if (active) {
        const input = makeRequest(attack, 6, { def: 3000, baseDef: 1000, critRate: 0, critDamage: 0 }, [withAttack(candidate, attack)]);
        const result = engine.calculate(input);
        const independent = independentDirectDamage(input);
        assertClose(result.nonCrit, independent.nonCrit, "20003 S" + rank + " independent DEF attack");
        assertClose(independent.effectiveReferenceValue, 3000 + 1000 * values[record.id][rank - 1] / 100, "20003 S" + rank + " effective DEF");
        const without = engine.calculate(makeRequest(attack, 6, { def: 3000, baseDef: 1000, critRate: 0, critDamage: 0 }, []));
        assert.ok(result.nonCrit > without.nonCrit, "conditional DEF reaches attack damage");
      }
    }
    const included = runtime.buildCandidates([record], { characterId: "1304", lightConeId: "20003", refinement: rank, stats: { hpPercent: 40, def: 3000 }, baseStats: { def: 1000 } }, { [inclusionKeys[record.id]]: true })[0];
    assert.equal(included.enabled, false, "already-final conditional DEF is not added twice");
  }
  const missing = runtime.buildCandidates([record], { characterId: "1304", lightConeId: "20003", refinement: 1, stats: {} }, {})[0];
  assert.equal(missing.enabled, false, "missing HP must remain unknown, not be treated as zero");
  assert.equal(missing.activation.unresolved, true, "missing HP is explicitly exposed as unresolved");
});
