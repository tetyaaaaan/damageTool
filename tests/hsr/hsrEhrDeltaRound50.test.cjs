"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { runtime, loadProductionFixture, fixedSourceSha } = require("./helpers/hsrDirectVerification.cjs");

const baselineKey = "lc-21041-baseline-ehr";
const baselineActiveKey = "lc-21041-ehr-baseline-active";
const includedKey = "lc-21041-ehr-delta-in-final";
const rankValues = [20, 24, 28, 32, 36];

test("Round50 LC21041 applies only the signed battle EHR threshold delta at S1-S5", async () => {
    assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
    const { data } = await loadProductionFixture();
    const row = data.structuredModifiers.find(item => item.id === "lightCone:21041:battle-ehr-attack-delta");
    assert.ok(row, "fixed 21041 battle EHR conversion is a production modifier");
    const evaluate = (rank, baseline, current, extra = {}) => runtime.buildCandidates([row], {
        characterId: "1006", lightConeId: "21041", refinement: rank, eidolon: 0, partyIds: [],
        stats: { effectHitRate: current }, baseStats: { atk: 1000 }
    }, { [baselineActiveKey]: true, [baselineKey]: baseline, ...extra })[0];

    for (let rank = 1; rank <= 5; rank++) {
        const bonus = rankValues[rank - 1];
        const crossedUp = evaluate(rank, 79.999, 80);
        assert.equal(crossedUp.value, bonus, `S${rank} crosses 80% upward`);
        assert.equal(crossedUp.enabled, true);
        const crossedDown = evaluate(rank, 80, 79.999);
        assert.equal(crossedDown.value, -bonus, `S${rank} crosses 80% downward without clamping`);
        assert.equal(crossedDown.enabled, true);
        assert.equal(evaluate(rank, 80, 80).value, 0, `S${rank} remains active on both sides`);
        assert.equal(evaluate(rank, 79.999, 79.999).value, 0, `S${rank} remains inactive on both sides`);
        assert.equal(evaluate(rank, 80, 80, { [includedKey]: true }).enabled, false, `S${rank} does not double add an included battle delta`);
        const roundTripEhr = (0.7 + 0.1) * 100;
        assert.equal(evaluate(rank, roundTripEhr, roundTripEhr).value, 0, `S${rank} preserves the mapper's floating-point 80% threshold`);
        assert.equal(evaluate(rank, roundTripEhr, 80).value, 0, `S${rank} treats mapper/current 80% as the same threshold state`);
        assert.equal(evaluate(rank, 79.9999, 80).value, bonus, `S${rank} does not blur a real below-threshold value`);
    }
});

test("Round50 LC21041 battle EHR delta is opt-in and missing or out-of-range inputs suppress only this modifier", async () => {
    const { data } = await loadProductionFixture();
    const row = data.structuredModifiers.find(item => item.id === "lightCone:21041:battle-ehr-attack-delta");
    const context = { characterId: "1006", lightConeId: "21041", refinement: 5, eidolon: 0, partyIds: [], stats: { effectHitRate: 100 }, baseStats: { atk: 1000 } };
    const evaluate = inputs => runtime.buildCandidates([row], context, inputs)[0];

    const off = evaluate({ [baselineKey]: 70 });
    assert.equal(off.enabled, false, "manual final ATK does not opt in implicitly");
    const missing = evaluate({ [baselineActiveKey]: true });
    assert.equal(missing.enabled, false);
    assert.equal(missing.activation.unresolved, true);
    assert.match(missing.activation.unresolvedReason, /基準効果命中率/);
    assert.deepEqual(missing.inputWarnings, [], "an unresolved local modifier must not become a whole-attack error");

    for (const baseline of [-0.1, 10000, NaN]) {
        const invalid = evaluate({ [baselineActiveKey]: true, [baselineKey]: baseline });
        assert.equal(invalid.enabled, false, `invalid baseline ${baseline} is excluded`);
        assert.equal(invalid.activation.unresolved, true);
        assert.deepEqual(invalid.inputWarnings, []);
    }
    for (const current of [-0.1, 10000, NaN]) {
        const invalid = runtime.buildCandidates([row], { ...context, stats: { effectHitRate: current } }, { [baselineActiveKey]: true, [baselineKey]: 70 })[0];
        assert.equal(invalid.enabled, false, `invalid current EHR ${current} is excluded`);
        assert.equal(invalid.activation.unresolved, true);
        assert.deepEqual(invalid.inputWarnings, []);
    }
    const catalog = require("../../scripts/validateHsrModifiers.cjs");
    assert.deepEqual(catalog.issues.filter(issue => issue.includes(row.id)), [], "the production contract validates");
    const wrongReference = structuredClone(row);
    wrongReference.value.reference = "self.effectHitRate";
    assert.ok(catalog.validateModifiers([wrongReference]).some(issue => issue.includes("threshold delta currently requires")), "the hard-coded current-EHR input cannot silently ignore another reference");
    const wrongCone = structuredClone(row);
    wrongCone.source.id = "21042";
    assert.ok(catalog.validateModifiers([wrongCone]).some(issue => issue.includes("threshold delta currently requires")), "the new value kind is scoped to its verified source");
});
