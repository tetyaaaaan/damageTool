"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const auditor = require(path.join(root, "scripts", "genshinBehaviorModifierLaneAudit.cjs"));

function read(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function candidate(audit, id) {
    return audit.claim.candidates.find((item) => item.id === id);
}

test("behavior-modifier lane is a 36-candidate fail-closed reconciliation", () => {
    const audit = auditor.buildAudit();
    assert.equal(audit.status, "passed", audit.errors.join("\n"));
    assert.equal(audit.scope.candidateCount, 36);
    assert.deepEqual(audit.summary.byClassification, {
        historicalCanonicalPendingRevalidation: 1,
        singleCorrelatedOrMissingEvidence: 35
    });
    assert.equal(audit.summary.certificateEligible, 0);
    assert.equal(audit.summary.canonicalPromotion, 0);
    assert.equal(audit.gate.status, "failClosed");
    assert.equal(audit.gate.canIssueEligibilityCertificate, false);
    assert.equal(audit.gate.canPromoteCanonical, false);
    assert.equal(audit.policy.metadataBooleansNotEvidence, true);
    assert.equal(audit.policy.sourceAgreement, "notEstablishedFromSameFamilyRecords");
    assert.equal(audit.claim.queueInputProjectionDigest, audit.generatedFrom.authoritativeQueue.projectionDigest);
});

test("historical Xiao state is bound to raw review records, not eligibility booleans", () => {
    const baseInputs = auditor.loadInputs();
    const mutatedInputs = JSON.parse(JSON.stringify(baseInputs));
    const id = auditor.XIAO_MODIFIER_ID;
    const reviewedModifier = mutatedInputs.behaviorReviewed.modifiers[id];
    const reviewedSpec = mutatedInputs.behaviorReviewed.behaviorSpecs[reviewedModifier.targetSpecId];
    reviewedModifier.verification.canonicalEligibility = false;
    reviewedModifier.verification.state = "notCanonical";
    reviewedModifier.verification.sourceAgreement = "disputed";
    reviewedSpec.verification.canonicalEligibility = false;
    const audit = auditor.buildAudit({ inputs: mutatedInputs });
    const xiao = candidate(audit, id);
    assert.equal(xiao.classification.classification, "historicalCanonicalPendingRevalidation");
    assert.equal(xiao.consumer.reviewedDecision.canonicalEligibility, false);
    assert.equal(xiao.consumer.reviewedDecision.canonicalEligibilityMetadataObserved, false);
    assert.equal(xiao.consumer.reviewedDecision.historicalReviewBinding.status, "bound");
    assert.equal(xiao.consumer.reviewedDecision.historicalReviewBinding.independentSourceProofAccepted, false);
    assert.equal(xiao.classification.certificateEligible, false);
    assert.equal(xiao.classification.canonicalPromotionEligible, false);
});

test("tampering with a raw review record cannot remain a historical proof", () => {
    const inputs = auditor.loadInputs();
    const mutatedInputs = JSON.parse(JSON.stringify(inputs));
    const sourceId = "gachabase:genshin:character:10000026:skill-c1:release-6.7.0";
    mutatedInputs.behaviorReviewed.sourceRecords[sourceId].text = "forged raw review text";
    const audit = auditor.buildAudit({ inputs: mutatedInputs });
    const xiao = candidate(audit, auditor.XIAO_MODIFIER_ID);
    assert.equal(audit.status, "failed");
    assert.equal(xiao.classification.classification, "singleCorrelatedOrMissingEvidence");
    assert.equal(xiao.consumer.reviewedDecision.historicalReviewBinding.status, "invalid");
    assert.ok(xiao.consumer.reviewedDecision.historicalReviewBinding.reasons.includes("reviewSourceRawDigestMissingOrMismatch"));
    assert.equal(audit.gate.canIssueEligibilityCertificate, false);
    assert.equal(audit.gate.canPromoteCanonical, false);
});

test("tampering with a pilot raw source digest fails the lane audit", () => {
    const inputs = auditor.loadInputs();
    const mutatedInputs = JSON.parse(JSON.stringify(inputs));
    const sourceId = "source:10000026:constellation:1:effectText";
    mutatedInputs.behaviorPilot.sourceRecords[sourceId].text = "forged local source text";
    const audit = auditor.buildAudit({ inputs: mutatedInputs });
    assert.equal(audit.status, "failed");
    assert.ok(audit.errors.includes("sourceRawDigestMismatch"));
    assert.ok(audit.errors.includes("unexpectedSourceEvidenceClass"));
    assert.equal(audit.gate.canIssueEligibilityCertificate, false);
    assert.equal(audit.gate.canPromoteCanonical, false);
});

test("queue input projection excludes parent reconciliation annotations", () => {
    const base = auditor.buildAudit();
    const queue = auditor.loadInputs().queue;
    const annotatedQueue = JSON.parse(JSON.stringify(queue));
    annotatedQueue.behaviorModifierReconciliation = { lane: auditor.lane.shardId, fieldDigest: "derived" };
    const firstTask = annotatedQueue.tasks.find((task) => task.candidateId === auditor.XIAO_MODIFIER_ID);
    firstTask.behaviorModifierReconciliation = { status: "derived" };
    assert.equal(
        auditor.stableJson(auditor.queueInputProjection(queue)),
        auditor.stableJson(auditor.queueInputProjection(annotatedQueue))
    );
    const rebuilt = auditor.buildAudit({ queue: annotatedQueue });
    assert.equal(auditor.stableJson(rebuilt), auditor.stableJson(base));
});

test("raw source metadata is observed but no same-family agreement is accepted", () => {
    const audit = auditor.buildAudit();
    for (const item of audit.claim.candidates) {
        assert.equal(item.sourceEvidence.sourceAgreement.status, "notEstablished", item.id);
        assert.equal(item.sourceEvidence.sourceAgreement.acceptedAsProof, false, item.id);
        assert.equal(item.sourceEvidence.eligibilityProof.accepted, false, item.id);
        assert.equal(item.sourceEvidence.independentFamilyCount, 0, item.id);
        assert.equal(item.certificate.queue.acceptedAsProof, false, item.id);
        assert.equal(item.certificate.registry.acceptedAsProof, false, item.id);
        assert.equal(item.attestation.queue.acceptedAsProof, false, item.id);
        assert.equal(item.attestation.registry.acceptedAsProof, false, item.id);
        assert.equal(item.classification.inferencePerformed, false, item.id);
    }
});

test("audit artifact, report, validator, and schema stay deterministic", () => {
    const expected = auditor.buildAudit();
    const artifact = read("games/genshin/data/v2/characters/behavior-modifier-lane-audit.json");
    const report = read("reports/genshin-behavior-modifier-lane-audit.json");
    assert.deepEqual(artifact, expected);
    assert.deepEqual(report, expected);
    assert.deepEqual(auditor.validateAudit(artifact), { valid: true, reasons: [] });
    const schema = read("games/genshin/data/schema/behavior-modifier-lane-audit.schema.json");
    assert.equal(schema.properties.kind.const, "genshinBehaviorModifierLaneAudit");
    assert.equal(schema.properties.policy.$ref, "#/$defs/policy");
    assert.equal(schema.$defs.policy.properties.metadataBooleansNotEvidence.const, true);
    assert.equal(schema.$defs.sourceAgreement.properties.acceptedAsProof.const, false);
    assert.equal(schema.$defs.gate.properties.canPromoteCanonical.const, false);
    assert.match(fs.readFileSync(path.join(root, "reports", "genshin-behavior-modifier-lane-audit.md"), "utf8"), /do not establish source agreement/i);
});

test("validator rejects a forged digest even when current-input comparison is disabled", () => {
    const forged = auditor.buildAudit();
    forged.fieldDigest = "0".repeat(64);
    const result = auditor.validateAudit(forged, { compareCurrent: false });
    assert.equal(result.valid, false);
    assert.ok(result.reasons.includes("fieldDigestInvalid"));
});
