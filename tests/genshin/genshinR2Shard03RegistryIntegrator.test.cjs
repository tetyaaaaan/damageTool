"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const test = require("node:test");

const integrator = require("../../scripts/genshinR2Shard03RegistryIntegrator.cjs");
const work = require("../../scripts/genshinWorkDisposition.cjs");

const readDigest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const before = [integrator.SOURCE_FRONTIERS_PATH, integrator.WORK_DISPOSITIONS_PATH,
    integrator.QUEUE_PATH, integrator.CHECKPOINT_PATH].map(readDigest);
let result;

test("shard03 preview joins exactly two new 100-candidate frontiers", () => {
    result = integrator.buildIntegration();
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.kpi, {
        total: 2268,
        completed: 15,
        evidenceDeferred: 793,
        pending: 1460,
        disposed: 808,
        strictVerified: 0,
        certificateEligible: 0,
        canonicalPromotionEligible: 0
    });
    assert.equal(result.sourceRegistry.frontiers.length, 8);
    assert.equal(result.workRegistry.decisions.length, 793);
    assert.equal(result.shards.behaviorShard03.decisions, 100);
    assert.equal(result.shards.weaponShard03.decisions, 100);
    const behaviorIds = new Set(result.shards.behaviorShard03.candidateIds);
    assert.equal(result.shards.weaponShard03.candidateIds.some((id) => behaviorIds.has(id)), false);
    assert.deepEqual(integrator.validateIntegration(result), { valid: true, errors: [] });
    assert.equal(result.writesPerformed, false);
});

test("shard03 candidate predicates require the exact registered task shape", () => {
    const behaviorTask = result.queue.tasks.find((task) => result.shards.behaviorShard03.candidateIds.includes(String(task.candidateId)));
    const weaponTask = result.queue.tasks.find((task) => result.shards.weaponShard03.candidateIds.includes(String(task.candidateId)));
    assert.ok(behaviorTask);
    assert.ok(weaponTask);
    assert.equal(work.isAllowedShard03ExternalEvidenceWait(behaviorTask), true);
    assert.equal(work.isAllowedWeaponShard03ExternalEvidenceWait(weaponTask), true);
    const wrongBehavior = structuredClone(behaviorTask);
    wrongBehavior.candidateId = "behavior:foreign:candidate";
    assert.equal(work.isAllowedShard03ExternalEvidenceWait(wrongBehavior), false);
    const wrongWeapon = structuredClone(weaponTask);
    wrongWeapon.searchFrontier.auditDigest = "0".repeat(64);
    assert.equal(work.isAllowedWeaponShard03ExternalEvidenceWait(wrongWeapon), false);
});

test("shard03 preview does not mutate authoritative coordination files", () => {
    const after = [integrator.SOURCE_FRONTIERS_PATH, integrator.WORK_DISPOSITIONS_PATH,
        integrator.QUEUE_PATH, integrator.CHECKPOINT_PATH].map(readDigest);
    assert.deepEqual(after, before);
});

test("shard03 write path remains explicitly confirmed", () => {
    assert.throws(() => integrator.writeArtifacts({ integration: {}, confirm: false }), /explicitWriteConfirmationRequired/);
});
