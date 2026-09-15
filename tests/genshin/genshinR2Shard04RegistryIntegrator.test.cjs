"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const integrator = require("../../scripts/genshinR2Shard04RegistryIntegrator.cjs");
const work = require("../../scripts/genshinWorkDisposition.cjs");

let preview;
function getPreview() {
    if (!preview) preview = integrator.buildIntegration();
    return preview;
}

test("shard04 preview joins exactly 100 behavior and 9 weapon candidates", () => {
    const result = getPreview();
    assert.equal(result.valid, true);
    assert.equal(result.writesPerformed, false);
    assert.equal(result.sourceRegistry.frontiers.length, 10);
    assert.equal(result.workRegistry.decisions.length, 902);
    assert.deepEqual(result.kpi, {
        total: 2268,
        completed: 15,
        evidenceDeferred: 902,
        pending: 1351,
        disposed: 917,
        strictVerified: 0,
        certificateEligible: 0,
        canonicalPromotionEligible: 0
    });
    assert.equal(result.shards.behaviorShard04.decisions, 100);
    assert.equal(result.shards.weaponShard04.decisions, 9);
    assert.equal(result.shards.behaviorShard04.artifactFieldDigest, integrator.BEHAVIOR_ARTIFACT_FIELD_DIGEST);
    assert.equal(result.shards.behaviorShard04.sourceAuditDigest, integrator.BEHAVIOR_SOURCE_AUDIT_FIELD_DIGEST);
    assert.equal(result.shards.weaponShard04.artifactFieldDigest, integrator.WEAPON_ARTIFACT_FIELD_DIGEST);
});

test("shard04 predicates accept only the exact candidate-scoped frontier bindings", () => {
    const result = getPreview();
    const behaviorId = result.shards.behaviorShard04.candidateIds[0];
    const weaponId = result.shards.weaponShard04.candidateIds[0];
    const behaviorTask = result.queue.tasks.find((task) => String(task.candidateId) === behaviorId);
    const weaponTask = result.queue.tasks.find((task) => String(task.candidateId) === weaponId);
    assert.ok(behaviorTask);
    assert.ok(weaponTask);
    assert.equal(work.isAllowedShard04ExternalEvidenceWait(behaviorTask), true);
    assert.equal(work.isAllowedWeaponShard04ExternalEvidenceWait(weaponTask), true);
    const wrongBehavior = structuredClone(behaviorTask);
    wrongBehavior.searchFrontier.candidateIdDigest = "wrong";
    assert.equal(work.isAllowedShard04ExternalEvidenceWait(wrongBehavior), false);
    const wrongWeapon = structuredClone(weaponTask);
    wrongWeapon.searchFrontier.auditDigest = "wrong";
    assert.equal(work.isAllowedWeaponShard04ExternalEvidenceWait(wrongWeapon), false);
});

test("shard04 preview validates and write requires explicit confirmation", () => {
    const result = getPreview();
    assert.deepEqual(integrator.validateIntegration(result, { compareCurrent: true }), { valid: true, errors: [] });
    assert.deepEqual(result.writeTargets, []);
    assert.throws(() => integrator.writeArtifacts({ confirm: false }), /explicitWriteConfirmationRequired/);
});
