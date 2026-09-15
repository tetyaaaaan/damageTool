"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const integrator = require(path.join(root, "scripts", "genshinR2Shard01RegistryIntegrator.cjs"));
const work = require(path.join(root, "scripts", "genshinWorkDisposition.cjs"));

function sha(relativePath) {
    return crypto.createHash("sha256")
        .update(fs.readFileSync(path.join(root, relativePath)))
        .digest("hex");
}

let prepared;
function integration() {
    if (!prepared) prepared = integrator.buildIntegration();
    return prepared;
}

test("shard01 integrator joins exact behavior and weapon previews at the expected fail-closed KPI", () => {
    const result = integration();
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.kpi, {
        total: 2268,
        completed: 15,
        evidenceDeferred: 393,
        pending: 1860,
        disposed: 408,
        strictVerified: 0,
        certificateEligible: 0,
        canonicalPromotionEligible: 0
    });
    assert.equal(result.shards.behavior.candidateIds.length, 100);
    assert.equal(result.shards.weapon.candidateIds.length, 100);
    assert.equal(result.workRegistry.decisions.length, 393);
    assert.equal(result.sourceRegistry.frontiers.length, 4);
    assert.equal(result.writesPerformed, false);
    assert.deepEqual(integrator.validateIntegration(result), { valid: true, errors: [] });
});

test("the two exact shards are disjoint and every added disposition is queue-bound", () => {
    const result = integration();
    const behaviorIds = new Set(result.shards.behavior.candidateIds);
    const weaponIds = new Set(result.shards.weapon.candidateIds);
    assert.equal([...behaviorIds].filter((id) => weaponIds.has(id)).length, 0);
    const added = result.workRegistry.decisions.filter((decision) =>
        behaviorIds.has(String(decision.candidateId)) || weaponIds.has(String(decision.candidateId)));
    assert.equal(added.length, 200);
    assert.ok(added.every((decision) => decision.kind === "genshinEvidenceDeferral"));
    assert.ok(added.every((decision) => decision.targetGameVersion === "7.0"));
    const tasksById = new Map(result.queue.tasks.map((task) => [String(task.candidateId), task]));
    assert.ok(added.every((decision) => decision.queueTaskDigest === work.taskDigest(tasksById.get(String(decision.candidateId)))));
});

test("preview and explicit-write gate do not mutate queue or checkpoint", () => {
    const queuePath = "reports/genshin-evidence-task-queue.json";
    const checkpointPath = "games/genshin/data/v2/version-transitions/6.7-to-7.0/active-goal-resume-checkpoint.json";
    const before = { queue: sha(queuePath), checkpoint: sha(checkpointPath) };
    const result = integration();
    assert.throws(() => integrator.writeArtifacts({ integration: result }), /explicitWriteConfirmationRequired/);
    assert.deepEqual({ queue: sha(queuePath), checkpoint: sha(checkpointPath) }, before);
    assert.equal(result.writesPerformed, false);
});

test("stale prepared input is rejected before any write is attempted", () => {
    const result = integration();
    const stale = JSON.parse(JSON.stringify(result));
    stale.inputFingerprints.sourceFrontiers.sha256 = "0".repeat(64);
    assert.throws(() => integrator.writeArtifacts({ integration: stale, confirm: true }), /integrationNotWritable|sourceInputChanged|writeInputFingerprintMismatch/);
});
