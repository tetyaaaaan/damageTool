"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const test = require("node:test");

const integrator = require("../../scripts/genshinR2Shard06RegistryIntegrator.cjs");
const behavior = require("../../scripts/genshinR2BehaviorSpecShard06G06Deferral.cjs");
const work = require("../../scripts/genshinWorkDisposition.cjs");

function sha256(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }

let preview;
function getPreview() {
    if (!preview) preview = integrator.buildIntegration();
    return preview;
}

test("Shard06 integration is pinned to exact immutable behavior artifacts", () => {
    const audit = readJson(behavior.ARTIFACT_PATH);
    const source = readJson(behavior.SOURCE_AUDIT_PATH);
    assert.equal(sha256(behavior.ARTIFACT_PATH), integrator.BEHAVIOR_ARTIFACT_SHA256);
    assert.equal(sha256(behavior.SOURCE_AUDIT_PATH), integrator.BEHAVIOR_SOURCE_AUDIT_SHA256);
    assert.deepEqual(behavior.validateAudit(audit, { compareCurrent: false }), { valid: true, reasons: [] });
    assert.deepEqual(behavior.validateSourceAudit(source, { compareCurrent: false }), { valid: true, reasons: [] });
    assert.equal(audit.fieldDigest, integrator.BEHAVIOR_ARTIFACT_FIELD_DIGEST);
    assert.equal(source.fieldDigest, integrator.BEHAVIOR_SOURCE_AUDIT_FIELD_DIGEST);
    assert.equal(audit.scope.candidateCount, 100);
    assert.equal(audit.frontier.id, behavior.FRONTIER_ID);
});

test("Shard06 write path requires explicit confirmation and pins the expected scope", () => {
    assert.throws(() => integrator.writeArtifacts(), /explicitWriteConfirmationRequired/);
    assert.deepEqual(integrator.TARGET_FRONTIER_IDS, [behavior.FRONTIER_ID]);
    assert.equal(integrator.EXPECTED.baseFrontiers, 11);
    assert.equal(integrator.EXPECTED.baseDecisions, 1002);
    assert.equal(integrator.EXPECTED.finalFrontiers, 12);
    assert.equal(integrator.EXPECTED.finalDecisions, 1102);
});

test("Shard06 preview reaches the expected fail-closed KPI without double counting", () => {
    const result = getPreview();
    assert.deepEqual(integrator.validateIntegration(result), { valid: true, errors: [] });
    assert.equal(result.writesPerformed, false);
    assert.deepEqual(result.kpi, {
        total: 2268,
        completed: 15,
        evidenceDeferred: 1102,
        pending: 1151,
        disposed: 1117,
        strictVerified: 0,
        certificateEligible: 0,
        canonicalPromotionEligible: 0
    });
    assert.equal(result.sourceRegistry.frontiers.length, 12);
    assert.equal(result.workRegistry.decisions.length, 1102);
});

test("Shard06 predicate is exact and fail-closed for a mutated task", () => {
    const result = getPreview();
    const id = result.shards.behaviorShard06.candidateIds[0];
    const task = result.queue.tasks.find((item) => String(item.candidateId) === id);
    assert.ok(task);
    assert.equal(work.isAllowedShard06ExternalEvidenceWait(task), true);
    const mutated = structuredClone(task);
    mutated.blockReasons = [...mutated.blockReasons, "unexpectedBlock"];
    assert.equal(work.isAllowedShard06ExternalEvidenceWait(mutated), false);
});
