"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fixedSourceSha, loadProductionFixture, makeRequest, runtime, assertMatchesIndependent, assertClose } = require("./helpers/hsrDirectVerification.cjs");

const attack = { id: "speed-threshold-normal", type: "normal", element: "Fire", scalingStat: "atk", multipliers: [100], canCrit: true, target: "single" };
function effective(candidates) { return candidates.map((item) => ({ ...item, applicable: item.applicable && runtime.applicableToAttack(item, attack) })); }

for (const spec of [
  { id: "eidolon:1202:1:speed", inputKey: "tingyun-e1-speed-active", inclusionKey: "tingyun-e1-speed-in-final-stats", provider: "1202", providerEidolon: 1, ornament: "311", panelSpeed: 125, baseSpeed: 100, amount: 20, target: "ally" },
  { id: "traceNode:1202:1202101:speed", inputKey: "tingyun-a2-speed-active", inclusionKey: "tingyun-a2-speed-in-final-stats", provider: "1202", providerEidolon: 0, ornament: "311", panelSpeed: 125, baseSpeed: 100, amount: 20, target: "self" },
  { id: "traceNode:1201:1201103:speed", inputKey: "qingque-a3-speed-active", inclusionKey: "qingque-a3-speed-in-final-stats", provider: "1201", providerEidolon: 0, ornament: "311", panelSpeed: 130, baseSpeed: 100, amount: 10, target: "self" }
]) {
  test(spec.id + " is an optional, single-turn speed state that updates Glamoth damage without double counting", async () => {
    assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
    const { data, engine } = await loadProductionFixture();
    const record = data.structuredModifiers.find((item) => item.id === spec.id);
    const glamoth = data.structuredModifiers.find((item) => item.id === "ornament:311:2pc:speed-damage");
    assert.ok(record);
    assert.equal(record.support.status, "calculable");
    assert.equal(record.activation.mode, "toggle");
    assert.equal(record.activation.default, false);
    assert.equal(record.activation.durationTurns, 1);
    assert.ok(record.finalStatsInclusion);
    assert.equal(record.finalStatsInclusion.inputKey, spec.inclusionKey);

    const ctx = {
      characterId: spec.target === "self" ? spec.provider : "1001",
      partyIds: spec.target === "ally" ? [spec.provider] : [],
      partyEidolons: { [spec.provider]: spec.providerEidolon },
      eidolon: spec.providerEidolon,
      ornamentId: spec.ornament,
      stats: { speed: spec.panelSpeed },
      baseStats: { speed: spec.baseSpeed }
    };
    const build = (context, inputs = {}) => runtime.buildCandidates([record, glamoth], context, inputs);
    const off = build(ctx);
    const offSupport = off.find((item) => item.id === spec.id);
    const offGlamoth = off.find((item) => item.id === glamoth.id);
    assert.equal(offSupport.enabled, false, "an action having happened is not inferred");
    assert.equal(offSupport.automatic, false);
    assert.equal(offGlamoth.enabled, false, "panel speed is below 135 before the state");

    const on = build(ctx, { [spec.inputKey]: true });
    const onSupport = on.find((item) => item.id === spec.id);
    const onGlamoth = on.find((item) => item.id === glamoth.id);
    assert.equal(onSupport.value, spec.amount);
    assert.equal(onSupport.enabled, true);
    assert.equal(onSupport.automatic, false);
    assert.equal(onSupport.providerId, spec.provider);
    assert.equal(onGlamoth.enabled, true);
    assert.equal(onGlamoth.value, 12);
    assertClose(onGlamoth.thresholdReferenceValue, spec.panelSpeed + spec.amount, "support-adjusted speed");
    const req = makeRequest(attack, 1, { damageBonus: 0 }, effective(on));
    const result = assertMatchesIndependent(engine, req, spec.id + " plus Glamoth threshold");
    assertClose(result.nonCrit, 1209.6, "speed threshold unlocks +12% damage");

    for (const delta of [-0.01, 0, 0.01]) {
      const boundary = build({ ...ctx, stats: { speed: 135 - spec.amount + delta } }, { [spec.inputKey]: true }).find(item => item.id === glamoth.id);
      assert.equal(boundary.enabled, delta >= 0, "literal SPD boundary " + delta);
    }
    const restored = JSON.parse(JSON.stringify({ [spec.inputKey]: true }));
    assert.equal(build(ctx, restored).find((item) => item.id === spec.id).enabled, true, "saved active state restores");
    const countedContext = { ...ctx, stats: { speed: spec.panelSpeed + spec.amount } };
    const counted = build(countedContext, { [spec.inputKey]: true, [spec.inclusionKey]: true });
    assert.equal(counted.find((item) => item.id === spec.id).enabled, false, "imported final speed excludes re-addition");
    assert.equal(counted.find((item) => item.id === glamoth.id).value, 12, "the entered final speed still satisfies Glamoth");
    const same = engine.calculate(makeRequest(attack, 1, { damageBonus: 0 }, effective(counted)));
    assertClose(same.nonCrit, result.nonCrit, "final speed included once");

    if (spec.target === "ally") {
      assert.equal(runtime.buildCandidates([record], { ...ctx, partyIds: [] }, { [spec.inputKey]: true }).length, 0, "provider removal removes the support");
      assert.equal(runtime.buildCandidates([record], { ...ctx, characterId: spec.provider, eidolon: 1, partyIds: [] }, { [spec.inputKey]: true })[0].value, 20, "Tingyun can be the explicitly chosen Benediction recipient");
    }
  });
}