"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const auditModule = require(path.join(root, "scripts", "genshinR2BehaviorSpecShard01G06Deferral.cjs"));
const workDisposition = require(path.join(root, "scripts", "genshinWorkDisposition.cjs"));
const terminalAudit = require(path.join(root, "scripts", "genshinTerminalStateAudit.cjs"));

function read(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

test("shard01 closes only the finite persisted-provider surface for 100 candidates", () => {
    const audit = auditModule.buildAudit();
    assert.equal(audit.frontier.status, "searchExhausted");
    assert.equal(audit.frontier.finite, true);
    assert.equal(audit.frontier.providerCount, 9);
    assert.equal(audit.frontier.exactCandidateFieldEvidenceCount, 0);
    assert.equal(audit.summary.candidateCount, 100);
    assert.equal(audit.summary.entityCount, 8);
    assert.equal(audit.summary.claimCount, 700);
    assert.equal(audit.summary.externalClaimCount, 600);
    assert.equal(audit.summary.candidateScopedFrontierProvenCandidateCount, 100);
    assert.equal(audit.summary.evidenceDeferredDraftCandidateCount, 100);
    assert.equal(audit.summary.unsearchedExternalRemainderCandidateCount, 100);
});

test("all decisions are candidate-bound external evidence waits, never verification", () => {
    const audit = auditModule.buildAudit();
    assert.equal(audit.decisions.length, 100);
    for (const decision of audit.decisions) {
        assert.equal(decision.kind, "genshinEvidenceDeferral");
        assert.equal(decision.assessment.actorId, "luna_worker");
        assert.equal(decision.fieldFindings.length, 6);
        assert.deepEqual(decision.fieldFindings.map((item) => item.field), auditModule.EXTERNAL_CLAIM_FIELDS.map((field) => `claim.${field}`));
        assert.equal(decision.draftDisposition.status, "externalEvidenceWait");
        assert.equal(decision.draftDisposition.evidenceDeferred, true);
        assert.equal(decision.draftDisposition.workClosed, false);
        assert.equal(decision.draftDisposition.strictVerified, false);
        assert.equal(decision.draftDisposition.certificateEligible, false);
        assert.equal(decision.draftDisposition.canonicalPromotionEligible, false);
        assert.equal(decision.search.scope, audit.frontier.searchScope);
        assert.deepEqual(decision.search.providersExamined, audit.frontier.providersExamined);
        assert.deepEqual(decision.search.unsearchedScope, audit.frontier.unsearchedScope);
        for (const refs of [
            decision.search.artifactRefs,
            decision.safety.artifactRefs,
            decision.assessment.boundedScope.artifactRefs
        ]) {
            assert.ok(refs.length > 0);
            assert.equal(refs.some((ref) => /queue|source-search-frontiers/i.test(ref.path)), false);
        }
    }
});

test("queue/runtime/canonical gates remain closed and artifact is deterministic", () => {
    const artifact = read("games/genshin/data/v2/reviews/r2-behavior-spec-shard01-g06-deferral.json");
    assert.deepEqual(auditModule.validateAudit(artifact, { compareCurrent: false }), { valid: true, reasons: [] });
    assert.equal(artifact.evidence.sourceRefs.some((ref) => /queue|source-search-frontiers/i.test(ref.path)), false);
    assert.equal(artifact.gate.canIssueEligibilityCertificate, false);
    assert.equal(artifact.gate.canPromoteCanonical, false);
    assert.equal(artifact.gate.queueChanged, false);
    assert.equal(artifact.summary.queueMutated, false);
    const forged = JSON.parse(JSON.stringify(artifact));
    forged.summary.candidateFieldEvidenceClaimCount = 1;
    assert.equal(auditModule.validateAudit(forged, { compareCurrent: false }).valid, false);
    const schema = read("games/genshin/data/schema/r2-behavior-spec-shard01-g06-deferral.schema.json");
    assert.equal(schema.properties.kind.const, "genshinR2BehaviorSpecShard01G06Deferral");
    assert.equal(schema.$defs.summary.properties.candidateCount.const, 100);
    assert.equal(schema.$defs.gate.properties.canIssueEligibilityCertificate.const, false);
});

test("in-memory frontier integration closes exactly shard01 and rejects broader behavior closure", () => {
    const audit = read("games/genshin/data/v2/reviews/r2-behavior-spec-shard01-g06-deferral.json");
    const registry = read("games/genshin/data/v2/source-search-frontiers.json");
    const workRegistry = read("games/genshin/data/v2/r2-work-dispositions.json");
    const prepared = auditModule.prepareRegistry({
        audit,
        registry: { ...registry, frontiers: registry.frontiers.filter((item) => item.id !== auditModule.FRONTIER_ID) },
        workRegistry: { ...workRegistry, decisions: workRegistry.decisions.filter((item) => !audit.scope.candidateIds.includes(item.candidateId)) }
    });
    assert.equal(prepared.validation.valid, true);
    assert.deepEqual(prepared.validation.errors, []);
    assert.equal(prepared.frontierEntry.id, auditModule.FRONTIER_ID);
    assert.equal(prepared.frontierEntry.appliesTo.candidateCount, 100);
    assert.equal(prepared.frontierEntry.appliesTo.candidateIdDigest, workDisposition.SHARD01_CANDIDATE_ID_DIGEST);
    assert.equal(prepared.frontierEntry.sourceAuditDigest, workDisposition.SHARD01_SOURCE_AUDIT_DIGEST);
    assert.equal(prepared.registry.frontiers.filter((item) => item.id === auditModule.FRONTIER_ID).length, 1);
    assert.deepEqual(
        {
            total: prepared.workProgress.summary.total,
            completed: prepared.workProgress.summary.completed,
            evidenceDeferred: prepared.workProgress.summary.evidenceDeferred,
            pending: prepared.workProgress.summary.pending,
            disposed: prepared.workProgress.summary.disposed
        },
        { total: 2268, completed: 15, evidenceDeferred: 393, pending: 1860, disposed: 408 }
    );
    assert.equal(audit.summary.strictVerifiedCandidateCount, 0);
    assert.equal(audit.summary.certificateEligibleClaimCount, 0);
    assert.equal(audit.summary.canonicalPromotionEligibleCandidateCount, 0);

    const selected = prepared.queue.tasks.find((task) => task.candidateId === audit.scope.candidateIds[0]);
    const freshTerminal = terminalAudit.buildTerminalStateAudit({ sourceSearchFrontiersOverride: prepared.registry });
    assert.deepEqual(prepared.queue, freshTerminal.taskQueue);
    assert.equal(selected.transitionLane, null);
    assert.equal(Object.hasOwn(selected, "sourceAudit"), false);
    assert.equal(workDisposition.isAllowedShard01ExternalEvidenceWait(selected), true);
    const decision = prepared.decisions.find((item) => item.candidateId === selected.candidateId);
    assert.equal(workDisposition.validateDeferral(decision, selected, { targetGameVersion: "7.0" }).valid, true);

    const reject = (mutate) => {
        const forged = JSON.parse(JSON.stringify(selected));
        mutate(forged);
        assert.equal(workDisposition.isAllowedShard01ExternalEvidenceWait(forged), false);
    };
    reject((task) => { task.candidateId = "behavior:10000099:talent:skill"; });
    reject((task) => { task.searchFrontier.policyId = "other-frontier"; });
    reject((task) => { task.searchFrontier.sourceAuditDigest = "0".repeat(64); });
    reject((task) => { task.identityConsistency.status = "ambiguous"; });
    reject((task) => { task.bulkTransitionCapture.status = "targetVariantAmbiguityCapturedFailClosed"; });
    reject((task) => { task.blockReasons.push("consumerMissing"); });
    reject((task) => { task.task.status = "ready"; });
});
