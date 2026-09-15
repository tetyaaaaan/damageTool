"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..", "..");
const queuePath = path.join(repositoryRoot, "reports", "genshin-evidence-task-queue.json");
const specsPath = path.join(repositoryRoot, "games", "genshin", "data", "v2", "artifacts", "spec-candidates.json");
const auditModule = require(path.join(repositoryRoot, "scripts", "genshinR2ArtifactDeferralAudit.cjs"));

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function loadQueue() {
    return JSON.parse(fs.readFileSync(queuePath, "utf8"));
}

function selectedTasks(queue) {
    return queue.tasks.filter((task) => task.dataset === "artifacts" && auditModule.artifactTaskIsDeferrable(task));
}

test("buildAudit closes only the 116 artifact candidates without concrete consumer work", () => {
    const audit = auditModule.buildAudit();
    assert.equal(audit.status, "draft");
    assert.equal(audit.draftOnly, true);
    assert.equal(audit.candidateCount, 116);
    assert.equal(audit.decisions.length, 116);
    assert.equal(audit.exclusions.length, 12);
    assert.equal(audit.evidence.blockedClaimCount, 1002);
    assert.equal(audit.evidence.exactKqmCandidateCount, 48);
    assert.deepEqual(audit.evidence.pieceSlotCounts, { twoPiece: 48, fourPiece: 68 });
    assert.equal(audit.evidence.frontierBinding.fourPiece.selectedCandidateCount, 68);
    assert.deepEqual(audit.evidence.frontierBinding.fourPiece.omittedCandidateIds, []);
    assert.equal(audit.evidence.frontierBinding.twoPiece.selectedCandidateCount, 48);
    assert.equal(audit.evidence.frontierBinding.twoPiece.omittedCandidateIds.length, 2);
    assert.deepEqual(
        audit.exclusions.map((item) => item.candidateId).sort(),
        [
            "artifact:15022:fourPiece:4pc_sea_dyed_foam_damage",
            "artifact:15022:twoPiece:2pc_outgoing_healing_bonus_indirect_damage_related",
            "artifact:15033:fourPiece:4pc_recorded_healing_additive_damage",
            "artifact:15033:twoPiece:2pc_outgoing_healing_bonus_indirect_damage_related",
            "artifact:15041:fourPiece:4pc_crit_rate_moon_omen",
            "artifact:15042:fourPiece:4pc_team_elemental_mastery_moon_omen",
            "artifact:15047:twoPiece:2pc_atk_percent",
            "artifact:15047:fourPiece:4pc_crit_rate_after_stellar_swirl",
            "artifact:15047:fourPiece:4pc_stellar_swirl_damage_bonus_after_stellar_swirl",
            "artifact:15048:twoPiece:2pc_atk_percent",
            "artifact:15048:fourPiece:4pc_atk_after_stellar_glimmer",
            "artifact:15048:fourPiece:4pc_team_stellar_glimmer_damage_bonus"
        ].sort()
    );
    assert.equal(auditModule.validateAudit(audit).valid, true);
});

test("each decision preserves exact current fields and explicit historical absence", () => {
    const audit = auditModule.buildAudit();
    const queue = loadQueue();
    const tasks = new Map(selectedTasks(queue).map((task) => [task.candidateId, task]));
    const specs = JSON.parse(fs.readFileSync(specsPath, "utf8"));
    for (const decision of audit.decisions) {
        const task = tasks.get(decision.candidateId);
        assert.ok(task, decision.candidateId);
        const spec = specs[decision.candidateId];
        const findings = new Map(decision.fieldFindings.map((finding) => [finding.field, finding]));
        for (const claim of task.certificate.certificate.claims) {
            const finding = findings.get(`claim.${claim.field}`);
            assert.ok(finding, `${decision.candidateId}:${claim.field}`);
            assert.deepEqual(finding.currentValue, Object.prototype.hasOwnProperty.call(spec.effect, claim.field)
                ? spec.effect[claim.field]
                : null);
            assert.equal(finding.historicalValue, null);
            assert.match(finding.missingEvidence, /historicalValue is intentionally null/u);
        }
        const localMetadata = [
            findings.get("claim.inputPolicy"),
            findings.get("claim.automaticDetectability")
        ];
        for (const finding of localMetadata) {
            assert.match(finding.knownStatus, /^localImplementationMetadata/u);
            assert.match(finding.missingEvidence, /local implementation metadata/u);
            assert.match(finding.missingEvidence, /routing metadata, not external gameplay facts/u);
        }
        assert.equal(decision.assessment.actorId, "luna_worker");
        assert.equal(decision.search.unsearchedScope.length, 1);
        assert.equal(decision.assessment.boundedScope.candidateId, decision.candidateId);
        assert.equal(decision.assessment.boundedScope.taskId, task.task.taskId);
        for (const refs of [
            decision.search.artifactRefs,
            decision.safety.artifactRefs,
            decision.assessment.boundedScope.artifactRefs
        ]) {
            assert.ok(refs.length > 0);
            assert.equal(refs.some((ref) => /queue|inventory|r2-artifact-deferral-audit|source-search-frontiers/i.test(ref.path)), false);
        }
    }
    assert.equal(audit.gate.strictEligible, 0);
    assert.equal(audit.gate.verificationGranted, false);
    assert.equal(audit.gate.promotionGranted, false);
    assert.equal(audit.evidence.legacyConsumer.canonicalActivation, false);
    assert.ok(audit.decisions.every((decision) => decision.safety.runtimeStatus.includes("verificationAndPromotionDenied")));
});

test("progress-only queue changes remain valid while task projection changes are stale", () => {
    const audit = auditModule.buildAudit();
    const progressOnly = loadQueue();
    const first = selectedTasks(progressOnly)[0];
    first.progress = first.progress || {};
    first.progress.work = {
        status: "evidenceDeferred",
        closed: true,
        verificationGranted: false,
        promotionGranted: false,
        decisionId: audit.decisions[0].id
    };
    const progressValidation = auditModule.validateAudit(audit, { queue: progressOnly });
    assert.equal(progressValidation.valid, true, progressValidation.reasons.join(","));
    assert.equal(progressValidation.summary.queueRawDigestChanged, false);

    const changedTask = loadQueue();
    const changed = selectedTasks(changedTask)[0];
    changed.searchFrontier.searchScope = `${changed.searchFrontier.searchScope} (tampered)`;
    const staleValidation = auditModule.validateAudit(audit, { queue: changedTask });
    assert.equal(staleValidation.valid, false);
    assert.ok(staleValidation.reasons.some((reason) => reason.includes("queueTaskDigestMismatch")));
});

test("field, digest, omission, and unknown-candidate tampering is rejected", () => {
    const audit = auditModule.buildAudit();
    const fieldTampered = clone(audit);
    fieldTampered.decisions[0].fieldFindings[0].currentValue = "tampered";
    assert.equal(auditModule.validateAudit(fieldTampered).valid, false);

    const digestTampered = clone(audit);
    digestTampered.decisions[0].safety.artifactRefs[0].sha256 = "0".repeat(64);
    assert.equal(auditModule.validateAudit(digestTampered).valid, false);

    const omitted = clone(audit);
    omitted.decisions.pop();
    assert.equal(auditModule.validateAudit(omitted).valid, false);
    assert.ok(auditModule.validateAudit(omitted).reasons.some((reason) => reason.startsWith("candidateOmission:")));

    const unknown = clone(audit);
    unknown.decisions.push(clone(unknown.decisions[0]));
    unknown.decisions.at(-1).candidateId = "artifact:unknown:fourPiece:unknown";
    assert.equal(auditModule.validateAudit(unknown).valid, false);
    assert.ok(auditModule.validateAudit(unknown).reasons.includes("unknownDecision:artifact:unknown:fourPiece:unknown"));
});
