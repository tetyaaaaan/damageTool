"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const test = require("node:test");

const shard = require("../../scripts/genshinR2BehaviorSpecShard06G06Deferral.cjs");
const work = require("../../scripts/genshinWorkDisposition.cjs");

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function digestFile(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }

test("shard06 selects exactly the next 100 ready BehaviorSpec candidates after shards01 through05", () => {
    const source = readJson(shard.SOURCE_AUDIT_PATH);
    const prior = [1, 2, 3, 4, 5].map((n) => readJson(`games/genshin/data/v2/reviews/r2-behavior-spec-shard0${n}-source-audit.json`));
    assert.equal(source.scope.candidateCount, 100);
    assert.equal(new Set(source.scope.candidateIds).size, 100);
    assert.equal(source.scope.candidateIds[0], "behavior:10000057:talent:normalattack-normal");
    assert.equal(source.scope.candidateIds.at(-1), "behavior:10000066:talent:normalattack-plunging");
    for (const previous of prior) assert.equal(source.scope.candidateIds.some((id) => previous.scope.candidateIds.includes(id)), false);
    const materialization = readJson("games/genshin/data/v2/reviews/r2-behavior-spec-materialization-audit.json");
    assert.deepEqual(shard.selectedIds(materialization), source.scope.candidateIds);
});

test("shard06 source and deferral artifacts validate and remain fail-closed", () => {
    const source = readJson(shard.SOURCE_AUDIT_PATH);
    const audit = readJson(shard.ARTIFACT_PATH);
    assert.deepEqual(shard.validateSourceAudit(source, { compareCurrent: true }), { valid: true, reasons: [] });
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
});

test("shard06 records verified raw entity evidence without candidate value inference", () => {
    const source = readJson(shard.SOURCE_AUDIT_PATH);
    assert.equal(source.summary.entityCount, 8);
    assert.equal(source.summary.rawIntegrityVerifiedCandidateCount, 100);
    assert.equal(source.summary.identityGapCandidateCount, 0);
    assert.equal(source.summary.localClaimSchemaGapCandidateCount, 0);
    assert.equal(source.providerSurface.providerCount, 9);
    assert.equal(source.providerSurface.exactCandidateFieldEvidenceCount, 0);
    assert.equal(source.providerSurface.independentVersionBoundFieldEvidenceCount, 0);
    for (const candidate of source.candidates) {
        assert.equal(candidate.rawEntityEvidence.candidateFieldValueMaterialized, false);
        assert.equal(candidate.disposition.candidateFieldEvidencePresent, false);
        for (const claim of candidate.claims) {
            assert.equal(claim.disposition.candidateFieldValueMaterialized, false);
            assert.equal(claim.disposition.strictVerified, false);
            assert.equal(claim.disposition.certificateEligible, false);
        }
    }
});

test("shard06 validation rejects a fail-open certificate mutation", () => {
    const audit = readJson(shard.ARTIFACT_PATH);
    audit.gate.canIssueEligibilityCertificate = true;
    const result = shard.validateAudit(audit);
    assert.equal(result.valid, false);
    assert.equal(result.reasons.includes("gateFailOpen"), true);
});

test("shard06 source and deferral generation is deterministic for the persisted scope", () => {
    const source = readJson(shard.SOURCE_AUDIT_PATH);
    const audit = readJson(shard.ARTIFACT_PATH);
    const freshSource = shard.buildSourceAudit();
    const freshAudit = shard.buildAudit();
    assert.equal(shard.validateSourceAudit(freshSource).valid, true);
    assert.equal(shard.validateAudit(freshAudit).valid, true);
    assert.deepEqual(freshSource, source);
    assert.deepEqual(freshAudit, audit);
});

test("shard06 decisions retain immutable evidence references and central validation stays fail-closed before registration", () => {
    const audit = readJson(shard.ARTIFACT_PATH);
    const decision = audit.decisions[0];
    const task = { candidateId: decision.candidateId, taskId: decision.candidateId, layer: "behaviorSpec", dataset: "behaviorBatch6", status: "ready", deferredLanes: decision.assessment.boundedScope.deferredLaneDispositions };
    assert.equal(decision.draftDisposition.workClosed, false);
    assert.equal(decision.draftDisposition.evidenceDeferred, true);
    assert.equal(decision.search.artifactRefs.some((ref) => work.isMutableCoordinationArtifactPath(ref.path)), false);
    const result = work.validateDeferral(decision, task, { targetGameVersion: "7.0" });
    assert.equal(result.valid, false);
    assert.equal(result.errors.includes("concreteWorkStillPending"), true);
});

test("shard06 schemas and frontier are pinned to the exact bounded scope", () => {
    const schema = readJson(shard.SCHEMA_PATH);
    const sourceSchema = readJson("games/genshin/data/schema/r2-behavior-spec-shard06-source-audit.schema.json");
    const audit = readJson(shard.ARTIFACT_PATH);
    assert.equal(schema.properties.kind.const, "genshinR2BehaviorSpecShard06G06Deferral");
    assert.equal(schema.$defs.scope.properties.candidateCount.const, 100);
    assert.equal(sourceSchema.properties.kind.const, "genshinR2BehaviorSpecShard06SourceAudit");
    assert.equal(audit.frontier.id, shard.FRONTIER_ID);
    assert.equal(audit.frontier.candidateIdDigest, audit.scope.candidateIdDigest);
    assert.equal(audit.frontier.sourceAuditDigest, readJson(shard.SOURCE_AUDIT_PATH).fieldDigest);
});

