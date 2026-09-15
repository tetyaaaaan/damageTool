"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const test = require("node:test");

const integrator = require("../../scripts/genshinR2Shard05RegistryIntegrator.cjs");
const behavior = require("../../scripts/genshinR2BehaviorSpecShard05G06Deferral.cjs");

function sha256(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }

test("Shard05 integration is pinned to the exact immutable behavior artifacts", () => {
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

test("Shard05 write path requires explicit confirmation", () => {
    assert.throws(() => integrator.writeArtifacts(), /explicitWriteConfirmationRequired/);
    assert.deepEqual(integrator.TARGET_FRONTIER_IDS, [behavior.FRONTIER_ID]);
    assert.equal(integrator.EXPECTED.baseFrontiers, 10);
    assert.equal(integrator.EXPECTED.baseDecisions, 902);
    assert.equal(integrator.EXPECTED.finalFrontiers, 11);
    assert.equal(integrator.EXPECTED.finalDecisions, 1002);
});

test("Shard05 preview integration reaches the expected fail-closed KPI", () => {
    const integration = integrator.buildIntegration();
    assert.deepEqual(integrator.validateIntegration(integration), { valid: true, errors: [] });
    assert.equal(integration.writesPerformed, false);
    assert.deepEqual(integration.kpi, {
        total: 2268,
        completed: 15,
        evidenceDeferred: 1002,
        pending: 1251,
        disposed: 1017,
        strictVerified: 0,
        certificateEligible: 0,
        canonicalPromotionEligible: 0
    });
});
