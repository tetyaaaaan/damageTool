"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const auditor = require(path.join(root, "scripts", "genshinR2BehaviorSpecMaterializationAudit.cjs"));

function read(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function candidate(audit, id) {
    return audit.claim.candidates.find((item) => item.candidateId === id);
}

test("ready behaviorSpec scope is exactly 1,533 candidates and 10,731 claims", () => {
    const audit = auditor.buildAudit();
    assert.equal(audit.status, "passed", audit.errors.join("\n"));
    assert.equal(audit.scope.candidateCount, 1533);
    assert.equal(audit.claim.candidateCount, 1533);
    assert.equal(audit.claim.claimCount, 10731);
    assert.equal(audit.claim.externalClaimCount, 9198);
    assert.equal(audit.claim.internalClaimCount, 1533);
    assert.deepEqual(audit.summary.queueSelectedTaskStatuses, { ready: 1533 });
    assert.deepEqual(audit.summary.queueSelectedFrontierStatuses, { searchRequired: 1533 });
    assert.equal(audit.summary.inputClaimSchemaCompleteCandidateCount, 1484);
    assert.equal(audit.summary.inputClaimSchemaMissingCandidateCount, 49);
    assert.equal(audit.summary.rawIntegrityVerifiedCandidateCount, 1521);
    assert.equal(audit.summary.rawIntegrityGapCandidateCount, 12);
});

test("entity raw evidence is recomputed but never promoted to candidate field evidence", () => {
    const audit = auditor.buildAudit();
    const ayaka = candidate(audit, "behavior:10000002:constellation:constellation-1");
    assert.equal(ayaka.transitionRaw.identityStatus, "resolvedUnambiguous");
    assert.equal(ayaka.transitionRaw.rawIntegrityStatus, "verified");
    assert.equal(ayaka.transitionRaw.record.before.actual.rawArtifactSha256, ayaka.transitionRaw.record.before.stored.rawArtifactSha256);
    assert.equal(ayaka.transitionRaw.record.after.actual.rawArtifactSha256, ayaka.transitionRaw.record.after.stored.rawArtifactSha256);
    assert.equal(ayaka.transitionRaw.record.before.fieldDigest.length, 64);
    for (const claim of ayaka.candidateClaims) {
        assert.equal(claim.providerObservation.candidateFieldValueMaterialized, false, claim.claimId);
        assert.deepEqual(claim.providerObservation.structuredValuePointers, [], claim.claimId);
        assert.equal(claim.disposition.strictVerified, false, claim.claimId);
    }
    assert.equal(ayaka.transitionRaw.providerSurface.proseInference, false);
    assert.equal(ayaka.candidateClaims.find((claim) => claim.field === "sourceText").rawEvidence.providerSurfaceRef, "$.transitionRaw.providerSurface");
});

test("pilot claim-schema omissions and Traveler variant gaps remain explicit", () => {
    const audit = auditor.buildAudit();
    const pilot = audit.claim.candidates.filter((item) => item.dataset === "behaviorPilot");
    assert.equal(pilot.length, 49);
    assert.ok(pilot.every((item) => item.candidateClaims.every((claim) => claim.local.claimSchemaStatus === "missing")));
    const traveler = candidate(audit, "behavior:10000005:constellation:constellation-1");
    assert.equal(traveler.transitionRaw.identityStatus, "unresolvedVariantAmbiguity");
    assert.equal(traveler.transitionRaw.rawIntegrityStatus, "gapAcrossVariants");
    assert.equal(traveler.transitionRaw.crossVariantComparison, "forbidden");
    assert.ok(traveler.candidateClaims.every((claim) => claim.disposition.candidateClosed === false));
});

test("missing finite G06 frontier keeps every external claim open", () => {
    const audit = auditor.buildAudit();
    assert.equal(audit.summary.finiteG06FrontierProvenCandidateCount, 0);
    assert.equal(audit.summary.candidateFieldMaterializedCount, 0);
    assert.equal(audit.summary.candidateFieldSearchRequiredCount, 9198);
    assert.equal(audit.summary.evidenceDeferredCandidateCount, 0);
    assert.equal(audit.gate.canIssueEligibilityCertificate, false);
    assert.equal(audit.gate.canPromoteCanonical, false);
    for (const item of audit.claim.candidates) {
        assert.equal(item.finiteG06Frontier.finite, false, item.candidateId);
        assert.equal(item.disposition.closed, false, item.candidateId);
        for (const claim of item.candidateClaims.filter((entry) => entry.claimKind === "externalFactual")) {
            assert.equal(claim.disposition.status, "candidateFieldSearchRequired", claim.claimId);
        }
    }
});

test("artifact and schema are deterministic and forged digest is rejected", () => {
    const expected = auditor.buildAudit();
    const artifact = read("games/genshin/data/v2/reviews/r2-behavior-spec-materialization-audit.json");
    assert.deepEqual(artifact, expected);
    assert.deepEqual(auditor.validateAudit(artifact, { compareCurrent: false }), { valid: true, reasons: [] });
    assert.deepEqual(auditor.validateAudit(artifact, { compareCurrent: true }), { valid: true, reasons: [] });
    const schema = read("games/genshin/data/schema/r2-behavior-spec-materialization-audit.schema.json");
    assert.equal(schema.properties.kind.const, "genshinR2BehaviorSpecMaterializationAudit");
    assert.equal(schema.$defs.scope.properties.candidateCount.const, 1533);
    assert.equal(schema.$defs.claim.properties.claimCount.const, 10731);
    assert.equal(schema.$defs.policy.properties.entityRawRecordIsClaimProof.const, false);
    const forged = JSON.parse(JSON.stringify(artifact));
    forged.claim.candidates[0].candidateClaims[0].providerObservation.candidateFieldValueMaterialized = true;
    assert.equal(auditor.validateAudit(forged, { compareCurrent: false }).valid, false);
    forged.claim.candidates[0].candidateClaims[0].providerObservation.candidateFieldValueMaterialized = false;
    forged.fieldDigest = "0".repeat(64);
    const result = auditor.validateAudit(forged, { compareCurrent: false });
    assert.equal(result.valid, false);
    assert.ok(result.reasons.includes("fieldDigestInvalid"));
});
