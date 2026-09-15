"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const triage = require("../../scripts/genshinNeedsReviewTriage.cjs");

test("needsReview triage separates machine evidence work from human decisions", () => {
    const result = triage.buildTriage();
    const audit = triage.auditTriage(result);
    assert.equal(audit.status, "passed", audit.errors.join("\n"));
    assert.equal(result.summary.claims.total, 12122);
    assert.equal(result.summary.claims.needsReview, 5315);
    assert.equal(result.summary.claims.verified, 13);
    assert.equal(result.summary.claims.notApplicable, 6794);
    assert.equal(result.summary.claims.machineEvidenceRequired, 5315);
    assert.equal(result.summary.claims.humanReviewReady, 0);
    assert.equal(result.summary.claims.humanSemanticDecisionRequired, 0);
    assert.equal(result.summary.candidates.total, 577);
    assert.equal(result.summary.candidates.humanReviewReady, 0);
    assert.equal(result.summary.candidates.humanReviewed, 1);
    assert.equal(result.summary.candidates.independentPinnedButVersionBlocked, 31);
    assert.equal(result.summary.conflictFollowup.humanDecisionRequiredNow, 0);
    assert.equal(result.policy.aiSelfApprovalForbidden, true);
    assert.equal(result.summary.canonical, 1);
});

test("mismatch follow-up retains machine-resolvable classifications", () => {
    const result = triage.buildTriage();
    assert.equal(result.summary.conflictFollowup.total, 0);
    assert.equal(result.summary.conflictFollowup.byDisposition.machineResolvedNoHumanDecision || 0, 0);
    assert.equal(result.summary.conflictFollowup.byDisposition.machineSourceModelReconciliation || 0, 0);
    assert.equal(result.summary.conflictFollowup.byDisposition.machineParserImprovement || 0, 0);
    assert.equal(result.summary.conflictFollowup.byDisposition.machineSchemaOrMappingInvestigation || 0, 0);
    assert.deepEqual(result.humanDecisionRequiredNow, []);
    assert.equal(result.conflictFollowup.some((item) => item.key === "gcsim:weapon:12402:cooldown"), false);
    assert.equal(result.conflictFollowup.some((item) => item.key === "gcsim:weapon:12402:shieldCapacity"), false);
});

test("materialized triage is deterministic and fail-closed", () => {
    const first = triage.buildTriage();
    const second = triage.buildTriage();
    assert.equal(triage.stableJson(first), triage.stableJson(second));
    assert.equal(fs.existsSync(triage.paths.output), true);
    const materialized = JSON.parse(fs.readFileSync(triage.paths.output, "utf8"));
    assert.deepEqual(materialized, first);
    assert.equal(materialized.humanReviewReadyCandidates.length, 0);
    assert.equal(materialized.humanReviewedCandidates.length, 1);
    assert.equal(materialized.humanReviewedCandidates[0].candidateId, "w_12516_stat_1");
});
