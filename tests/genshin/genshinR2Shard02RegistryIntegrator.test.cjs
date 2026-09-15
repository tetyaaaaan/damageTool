"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const integrator = require("../../scripts/genshinR2Shard02RegistryIntegrator.cjs");

test("shard02 integration adds only the two exact reviewed 100-candidate shards", () => {
    const result = integrator.buildIntegration();
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.kpi, {
        total: 2268,
        completed: 15,
        evidenceDeferred: 593,
        pending: 1660,
        disposed: 608,
        strictVerified: 0,
        certificateEligible: 0,
        canonicalPromotionEligible: 0
    });
    assert.equal(result.shards.behaviorShard02.decisions, 100);
    assert.equal(result.shards.weaponShard02.decisions, 100);
    const behaviorIds = new Set(result.shards.behaviorShard02.candidateIds);
    assert.equal(result.shards.weaponShard02.candidateIds.some((id) => behaviorIds.has(id)), false);
    assert.equal(result.shards.weaponShard02.candidateIds.includes("w_12516_stat_1"), false);
    assert.deepEqual(integrator.validateIntegration(result), { valid: true, errors: [] });
    assert.equal(result.writesPerformed, false);
});

test("shard02 write path remains explicitly confirmed", () => {
    assert.throws(() => integrator.writeArtifacts({ integration: {}, confirm: false }), /explicitWriteConfirmationRequired/);
});
