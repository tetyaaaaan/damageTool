"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const auditModule = require(path.join(root, "scripts", "genshinR2BehaviorSpecFrontierAudit.cjs"));

function read(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

test("behaviorSpec bridge covers exactly the ready 1,533 candidates and 10,731 claims", () => {
    const audit = auditModule.buildAudit();
    assert.equal(audit.status, "passed");
    assert.equal(audit.scope.candidateCount, 1533);
    assert.equal(audit.summary.candidateCount, 1533);
    assert.equal(audit.summary.claimCount, 10731);
    assert.equal(audit.summary.externalClaimCount, 9198);
    assert.equal(audit.summary.internalClaimCount, 1533);
    assert.deepEqual(audit.summary.queueTaskStatuses, { ready: 1533 });
    assert.deepEqual(audit.summary.queueFrontierStatuses, { searchRequired: 1533 });
    assert.equal(audit.summary.providerWideInspectedCount, 9);
});

test("provider-wide inspection is not promoted to a candidate finite frontier", () => {
    const audit = auditModule.buildAudit();
    assert.equal(audit.providerSurface.providerWideLedgerStatus, "inspected");
    assert.equal(audit.providerSurface.candidateScopedFrontierCount, 0);
    assert.equal(audit.providerSurface.candidateScopedFrontierProvenCount, 0);
    assert.equal(audit.providerSurface.finiteFrontierStatus, "notProven");
    assert.equal(audit.summary.providerCandidateFieldSurfaceUnsearchedCount, 1533);
    assert.equal(audit.summary.queueToCandidateFrontierLinkMissingCount, 1533);
    assert.equal(audit.gate.canDeferG06, false);
    assert.equal(audit.gate.canIssueEligibilityCertificate, false);
    assert.equal(audit.gate.canPromoteCanonical, false);
    assert.ok(audit.gate.reasons.includes("providerSurfaceInspectedButCandidateFieldSurfaceUnsearched"));
});

test("existing raw evidence is retained while internal identity/schema gaps remain explicit", () => {
    const audit = auditModule.buildAudit();
    assert.equal(audit.summary.rawIntegrityVerifiedCandidateCount, 1521);
    assert.equal(audit.summary.rawIntegrityGapCandidateCount, 12);
    assert.equal(audit.summary.candidateIdentityOrVariantResolutionRequiredCount, 26);
    assert.equal(audit.summary.localClaimSchemaConnectionRequiredCount, 49);
    assert.equal(audit.summary.internalConnectionRequiredCandidateCount, 75);
    const traveler = audit.candidates.find((candidate) => candidate.candidateId === "behavior:10000005:constellation:constellation-1");
    assert.equal(traveler.internalConnections.status, "required");
    assert.ok(traveler.internalConnections.reasons.includes("candidateIdentityOrVariantResolution"));
    const ordinary = audit.candidates.find((candidate) => candidate.candidateId === "behavior:10000002:constellation:constellation-1");
    assert.equal(ordinary.rawEntityEvidence.entityRecordCaptured, true);
    assert.equal(ordinary.internalConnections.status, "noKnownInternalGap");
});

test("every external claim stays searchRequired and every candidate stays open", () => {
    const audit = auditModule.buildAudit();
    for (const candidate of audit.candidates) {
        assert.equal(candidate.disposition.status, "candidateFieldSearchRequired", candidate.candidateId);
        assert.equal(candidate.disposition.evidenceDeferred, false, candidate.candidateId);
        assert.equal(candidate.disposition.closed, false, candidate.candidateId);
        assert.equal(candidate.disposition.strictVerified, false, candidate.candidateId);
        assert.equal(candidate.providerSurface.finiteG06Frontier.finite, false, candidate.candidateId);
        for (const claim of candidate.claims.filter((item) => item.claimKind === "externalFactual")) {
            assert.equal(claim.searchStatus, "candidateFieldSearchRequired", claim.claimId);
            assert.equal(claim.candidateFieldValueMaterialized, false, claim.claimId);
            assert.equal(claim.candidateScopedFrontierStatus, "notRecorded", claim.claimId);
        }
    }
});

test("artifact is deterministic and forged promotion/frontier state is rejected", () => {
    const expected = auditModule.buildAudit();
    const artifact = read("games/genshin/data/v2/reviews/r2-behavior-spec-frontier-audit.json");
    assert.deepEqual(artifact, expected);
    assert.deepEqual(auditModule.validateAudit(artifact, { compareCurrent: false }), { valid: true, reasons: [] });
    assert.deepEqual(auditModule.validateAudit(artifact, { compareCurrent: true }), { valid: true, reasons: [] });
    const forged = JSON.parse(JSON.stringify(artifact));
    forged.gate.canDeferG06 = true;
    assert.equal(auditModule.validateAudit(forged, { compareCurrent: false }).valid, false);
    const forgedClaim = JSON.parse(JSON.stringify(artifact));
    forgedClaim.candidates[0].claims[0].candidateFieldValueMaterialized = true;
    assert.equal(auditModule.validateAudit(forgedClaim, { compareCurrent: false }).valid, false);
    const schema = read("games/genshin/data/schema/r2-behavior-spec-frontier-audit.schema.json");
    assert.equal(schema.properties.kind.const, "genshinR2BehaviorSpecFrontierAudit");
    assert.equal(schema.$defs.scope.properties.candidateCount.const, 1533);
    assert.equal(schema.$defs.summary.properties.candidateFieldMaterializedCount.const, 0);
    assert.equal(schema.$defs.gate.properties.canDeferG06.const, false);
});
