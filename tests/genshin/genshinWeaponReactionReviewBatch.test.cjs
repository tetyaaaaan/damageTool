"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const batchModule = require(path.join(root, "scripts", "genshinWeaponReactionReviewBatch.cjs"));

test("weapon 12516 preserves the official Stellar Swirl scope and fails closed on version/consumer drift", () => {
    const batch = batchModule.buildBatch();
    const audit = batchModule.auditBatch(batch);
    assert.equal(audit.status, "passed", audit.errors.join("; "));
    assert.equal(batch.target.candidateId, "w_12516_reaction_bonus_2");
    assert.equal(batch.assessment.machineEvidenceReady, false);
    assert.notEqual(batch.assessment.state, "humanReviewReady");
    assert.equal(batch.assessment.canonicalEligibility, false);
    assert.deepEqual(batch.reviewPacket.providerIndependence.groups, ["official-hoyoverse", "GenshinData-derived"]);
    assert.ok(batch.reviewPacket.scopeBoundary.excludedCandidateIds.includes("w_12516_reactionBonus_d0fe6e2e"));
    assert.equal(batch.claims.interval.comparison.normalizedValue, 0.2);
    assert.deepEqual(batch.claims.targets.evidence[0].extractedValue, ["astralConductionDamageBonus", "stellarSwirlDamageBonus"]);
    assert.equal(batch.reviewPacket.reactionFacts.existence.status, "officialVersionBound");
    assert.equal(batch.reviewPacket.reactionFacts.existence.gameVersion, "7.0");
    assert.equal(batch.reviewPacket.reactionFacts.formula.status, "blockedMissingCoefficients");
    assert.equal(batch.reviewPacket.reactionFacts.formula.formulaCoefficientsDisclosed, false);
    assert.equal(batch.claims.targets.comparison.status, "mismatch");
    assert.ok(batch.reviewPacket.unresolved.some((item) => item.kind === "consumerImplementationGap"));
    assert.equal(batch.reviewPacket.versionTransitionEvidence.from.gameVersion, "6.7.0");
    assert.equal(batch.reviewPacket.versionTransitionEvidence.to.gameVersion, "7.0.0");
    assert.equal(batch.reviewPacket.versionTransitionEvidence.eligibility, "driftDiscoveryOnly");
});
