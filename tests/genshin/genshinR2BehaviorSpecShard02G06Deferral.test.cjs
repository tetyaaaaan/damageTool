"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const test = require("node:test");

const shard = require("../../scripts/genshinR2BehaviorSpecShard02G06Deferral.cjs");
const terminal = require("../../scripts/genshinTerminalStateAudit.cjs");
const work = require("../../scripts/genshinWorkDisposition.cjs");

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function digestFile(file) {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

test("shard02 selects exactly the next 100 ready BehaviorSpec candidates after shard01", () => {
    const sourceAudit = readJson(shard.SOURCE_AUDIT_PATH);
    const shard01 = readJson("games/genshin/data/v2/reviews/r2-behavior-spec-shard01-source-audit.json");
    assert.equal(sourceAudit.scope.candidateCount, 100);
    assert.equal(new Set(sourceAudit.scope.candidateIds).size, 100);
    assert.equal(sourceAudit.scope.candidateIds[0], "behavior:10000021:constellation:constellation-2");
    assert.equal(sourceAudit.scope.candidateIds.at(-1), "behavior:10000032:constellation:constellation-3");
    assert.equal(sourceAudit.scope.candidateIds.some((id) => shard01.scope.candidateIds.includes(id)), false);
    assert.deepEqual(shard.selectedIds(readJson("games/genshin/data/v2/reviews/r2-behavior-spec-materialization-audit.json")), sourceAudit.scope.candidateIds);
});

test("shard02 source and deferral artifacts validate and remain fail-closed", () => {
    const sourceAudit = readJson(shard.SOURCE_AUDIT_PATH);
    const audit = readJson(shard.ARTIFACT_PATH);
    assert.deepEqual(shard.validateSourceAudit(sourceAudit, { compareCurrent: true }), { valid: true, reasons: [] });
    assert.deepEqual(shard.validateAudit(audit), { valid: true, reasons: [] });
    assert.equal(audit.evidence.sourceAudit.sha256, digestFile(shard.SOURCE_AUDIT_PATH));
    assert.equal(audit.summary.candidateFieldEvidenceClaimCount, 0);
    assert.equal(audit.summary.strictVerifiedCandidateCount, 0);
    assert.equal(audit.summary.certificateEligibleClaimCount, 0);
    assert.equal(audit.summary.canonicalPromotionEligibleCandidateCount, 0);
    assert.equal(audit.gate.canIssueEligibilityCertificate, false);
    assert.equal(audit.gate.canPromoteCanonical, false);
    assert.equal(audit.gate.runtimeChanged, false);
    assert.equal(audit.gate.queueChanged, false);
    const refs = audit.decisions.flatMap((decision) => decision.search.artifactRefs);
    assert.equal(refs.some((ref) => ref.path === "reports/genshin-evidence-task-queue.json"), false);
    assert.equal(refs.some((ref) => ref.path === "games/genshin/data/v2/source-search-frontiers.json"), false);
    assert.equal(refs.some((ref) => ref.path === "reports/genshin-candidate-source-coverage-frontier-inventory.json"), false);
});

test("shard02 records raw readiness but no candidate value inference", () => {
    const sourceAudit = readJson(shard.SOURCE_AUDIT_PATH);
    assert.equal(sourceAudit.summary.entityCount, 8);
    assert.equal(sourceAudit.summary.rawIntegrityVerifiedCandidateCount, 100);
    assert.equal(sourceAudit.summary.identityGapCandidateCount, 0);
    assert.equal(sourceAudit.summary.localClaimSchemaGapCandidateCount, 0);
    assert.equal(sourceAudit.providerSurface.providerCount, 9);
    assert.equal(sourceAudit.providerSurface.exactCandidateFieldEvidenceCount, 0);
    assert.equal(sourceAudit.providerSurface.independentVersionBoundFieldEvidenceCount, 0);
    for (const candidate of sourceAudit.candidates) {
        assert.equal(candidate.rawEntityEvidence.candidateFieldValueMaterialized, false);
        assert.equal(candidate.disposition.candidateFieldEvidencePresent, false);
        for (const claim of candidate.claims) {
            assert.equal(claim.disposition.candidateFieldValueMaterialized, false);
            assert.equal(claim.disposition.strictVerified, false);
            assert.equal(claim.disposition.certificateEligible, false);
        }
    }
});

test("shard02 validation rejects a fail-open mutation", () => {
    const audit = readJson(shard.ARTIFACT_PATH);
    audit.gate.canIssueEligibilityCertificate = true;
    assert.equal(shard.validateAudit(audit).valid, false);
    assert.equal(shard.validateAudit(audit).reasons.includes("gateFailOpen"), true);
});

test("shard02 artifact and source audit are deterministic for the persisted candidate set", () => {
    const sourceAudit = readJson(shard.SOURCE_AUDIT_PATH);
    const audit = readJson(shard.ARTIFACT_PATH);
    const freshSource = shard.buildSourceAudit();
    const freshAudit = shard.buildAudit();
    assert.equal(shard.validateSourceAudit(freshSource).valid, true);
    assert.equal(shard.validateAudit(freshAudit).valid, true);
    assert.deepEqual(freshSource, sourceAudit);
    assert.deepEqual(freshAudit, audit);
});

test("shard02 decisions bind to the projected source-reopen task and exact central allowlist", () => {
    const audit = readJson(shard.ARTIFACT_PATH);
    const registry = readJson("games/genshin/data/v2/source-search-frontiers.json");
    registry.frontiers = (registry.frontiers || []).filter((entry) => entry.id !== shard.FRONTIER_ID)
        .concat(shard.frontierEntry(audit.frontier, audit.evidence.sourceRefs));
    const projected = terminal.buildTerminalStateAudit({ sourceSearchFrontiersOverride: registry }).taskQueue;
    const task = projected.tasks.find((entry) => entry.candidateId === audit.scope.candidateIds[0]);
    const decision = audit.decisions[0];
    assert.equal(task.task.status, "reopenOnTrigger");
    assert.equal(decision.assessment.boundedScope.taskId, task.task.taskId);
    assert.equal(decision.queueTaskDigest, work.taskDigest(task));
    assert.deepEqual(work.validateDeferral(decision, task, { targetGameVersion: "7.0" }), { valid: true, errors: [] });
});

test("shard02 dedicated schemas are present and pin the bounded scope", () => {
    const deferralSchema = readJson(shard.SCHEMA_PATH);
    const sourceSchema = readJson("games/genshin/data/schema/r2-behavior-spec-shard02-source-audit.schema.json");
    assert.equal(deferralSchema.properties.kind.const, "genshinR2BehaviorSpecShard02G06Deferral");
    assert.equal(deferralSchema.$defs.scope.properties.candidateCount.const, 100);
    assert.equal(sourceSchema.properties.kind.const, "genshinR2BehaviorSpecShard02SourceAudit");
    assert.equal(sourceSchema.properties.scope.properties.shardId.const, shard.SHARD_ID);
});
