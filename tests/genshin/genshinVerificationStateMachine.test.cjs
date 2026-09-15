"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const stateMachine = require("../../scripts/genshinVerificationStateMachine.cjs");

const artifactSpecs = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, "../../games/genshin/data/v2/artifacts/spec-candidates.json"),
    "utf8"
));

test("generic runtime and artifact policy claims are internal routes, not external source facts", () => {
    assert.equal(stateMachine.inferClaimKind("runtime", {}), "internalRuntimeRoute");
    assert.equal(stateMachine.inferClaimKind("runtimeEligibility", {}), "internalRuntimeRoute");
    assert.equal(stateMachine.inferClaimKind("inputPolicy", {}), "internalRuntimeRoute");
    assert.equal(stateMachine.inferClaimKind("automaticDetectability", {}), "internalRuntimeRoute");
    for (const field of ["value", "condition", "targets"]) {
        assert.equal(stateMachine.inferClaimKind(field, {}), "externalFactual");
    }
});

test("explicit external claim kinds remain authoritative for policy-shaped fields", () => {
    assert.equal(
        stateMachine.inferClaimKind("inputPolicy", { claimKind: "externalFactual" }),
        "externalFactual"
    );
    assert.equal(
        stateMachine.inferClaimKind("automaticDetectability", { claimKind: "externalFactual" }),
        "externalFactual"
    );
});

test("real artifact candidates keep gameplay claims external and policy metadata unverified", () => {
    const specs = Object.values(artifactSpecs);
    assert.equal(specs.length, 122);

    for (const spec of specs) {
        assert.equal(spec.verification.status, "needsReview", spec.id);
        for (const field of ["inputPolicy", "automaticDetectability"]) {
            assert.equal(
                stateMachine.inferClaimKind(field, spec.verification.claims[field]),
                "internalRuntimeRoute",
                `${spec.id}:${field}`
            );
        }
        for (const field of ["value", "condition", "targets"]) {
            const claim = spec.verification.claims[field];
            if (claim && claim.status !== "notApplicable") {
                assert.equal(
                    stateMachine.inferClaimKind(field, claim),
                    "externalFactual",
                    `${spec.id}:${field}`
                );
            }
        }
    }
});

test("internal policy metadata cannot launder unverified external artifact fields into eligibility", () => {
    const source = Object.values(artifactSpecs).find((spec) => spec.verification.claims.value?.status === "needsReview");
    assert.ok(source);
    const candidate = JSON.parse(JSON.stringify(source));
    candidate.reviewPacketAvailable = true;
    candidate.verification = {
        ...candidate.verification,
        status: "verified",
        verificationMode: "deterministicConsensus",
        reviewedBy: null,
        reviewedAt: null,
        sourceAgreement: "agreed"
    };
    for (const field of ["inputPolicy", "automaticDetectability"]) {
        candidate.verification.claims[field] = {
            ...candidate.verification.claims[field],
            status: "verified",
            machineEvidence: {
                ready: true,
                codeProvenance: {
                    deterministic: true,
                    path: "scripts/genshinArtifactV2Generate.cjs",
                    locator: `classify:${field}`
                },
                focusedTests: [{ id: "artifact-policy-classification", status: "passed" }]
            }
        };
    }
    const result = stateMachine.assessCanonicalEligibility(candidate);
    assert.equal(result.canonicalEligibility, false);
    assert.ok(result.verificationGate.claims.some((claim) => claim.field === "value" && claim.claimKind === "externalFactual"));
    assert.ok(result.blockedReasons.some((reason) => reason.startsWith("claim:value:")));
});

const DIGEST = "a".repeat(64);

function proof(subjectId, field, mode, overrides = {}) {
    const sourceRefs = overrides.sourceRefs || ["source:official", "source:independent"];
    const comparisonStatus = overrides.comparisonStatus || (field === "duration" ? "notRequired" : "match");
    const attestationId = `${subjectId}:${field}:${mode}:attestation`;
    const attestation = {
        schemaVersion: stateMachine.ATTESTATION_SCHEMA_VERSION,
        attestationId,
        verificationMode: mode,
        type: mode === "human" ? "humanReview" : "deterministicConsensus",
        subjectId,
        claimField: field,
        attestedAt: "2026-08-23T12:00:00.000Z",
        actor: mode === "human" ? { kind: "human", id: "human-reviewer" } : { kind: "machine", id: "consensus-engine/1" },
        ...(mode === "human" ? { decision: "approve" } : {}),
        engine: { name: "genshin-consensus-test", version: "1" },
        policy: { id: "genshin-canonical-v2", version: "1", digest: DIGEST },
        sourceBundle: sourceRefs.map((sourceRef, index) => ({
            sourceRef,
            provider: index ? "genshin-db" : "HoYoverse",
            independenceGroup: index ? "genshin-db" : "official-hoyoverse",
            revision: index ? "rev-genshin-db" : "rev-official",
            fileDigest: DIGEST,
            gameVersion: "6.7"
        })),
        requiredFields: [field],
        normalization: { id: "identity", version: "1", digest: DIGEST },
        exactRevisions: sourceRefs.map((sourceRef, index) => ({
            sourceRef,
            revision: index ? "rev-genshin-db" : "rev-official",
            fileDigest: DIGEST
        })),
        gameVersion: { value: "6.7", sourceRefs },
        comparison: { status: comparisonStatus, digests: { [field]: DIGEST } },
        semanticStatus: "match",
        scopeStatus: "match",
        ...overrides.attestation
    };
    const certificateId = `${subjectId}:${field}:certificate`;
    const certificate = mode === "deterministicConsensus"
        ? {
            schemaVersion: stateMachine.CERTIFICATE_SCHEMA_VERSION,
            certificateId,
            status: "eligible",
            verificationMode: mode,
            issuedAt: attestation.attestedAt,
            candidateId: subjectId,
            claimId: `${subjectId}:${field}:claim`,
            field,
            targetGameVersion: "6.7",
            currentGameVersion: "6.7",
            versionSnapshotId: "genshin-version:6.7:fixture",
            authority: {
                id: "genshinSourceCatalogContractAudit",
                version: "1",
                sourceCatalogDigest: DIGEST,
                sourceFamilyRegistryDigest: DIGEST,
                providerPolicyDigest: DIGEST
            },
            policy: { status: "reusable", automaticVerificationAllowed: true },
            scope: { candidateId: subjectId, claimId: `${subjectId}:${field}:claim`, field, valueDigest: DIGEST },
            requiredFieldCoverage: { status: "complete", requiredFields: [field], digest: DIGEST },
            comparison: {
                status: "match",
                claimValueDigest: DIGEST,
                sourceFieldDigests: Object.fromEntries(sourceRefs.map((sourceRef) => [sourceRef, DIGEST]))
            },
            sources: sourceRefs.map((sourceRef, index) => ({
                sourceRef,
                providerId: index ? "genshin-db" : "HoYoverse",
                familyId: index ? "genshin-db" : "official-hoyoverse",
                lineageStatus: "declared",
                revision: index ? "rev-genshin-db" : "rev-official",
                rawArtifactDigest: DIGEST,
                fieldDigest: DIGEST,
                revisionPinned: true,
                rawArtifactDigestBound: true,
                fieldScoped: true,
                exactField: true,
                fieldDigestMatches: true,
                strictGameVersionBinding: true,
                supportsClaimValue: true,
                gameVersion: "6.7"
            })),
            sourceBundleDigest: DIGEST,
            normalization: { id: "identity", version: "1", digest: DIGEST },
            stale: false,
            invalidated: false,
            blockedReasons: [],
            canonicalEligibility: false,
            ...overrides.certificate
        }
        : {
            schemaVersion: stateMachine.CERTIFICATE_SCHEMA_VERSION,
            certificateId,
            status: "eligible",
            subjectId,
            claimField: field,
            verificationMode: mode,
            attestationId,
            comparisonDigest: DIGEST,
            issuedAt: attestation.attestedAt,
            scope: { subjectId, claimField: field },
            ...overrides.certificate
        };
    if (mode === "deterministicConsensus") {
        attestation.eligibilityCertificateId = certificateId;
        attestation.sourceBundleDigest = DIGEST;
        attestation.versionSnapshotId = certificate.versionSnapshotId;
    }
    return { verificationAttestation: attestation, eligibilityCertificate: certificate };
}

function externalClaim(overrides = {}) {
    return {
        claimKind: "externalFactual",
        status: "needsReview",
        sourceRefs: ["source:official", "source:independent"],
        comparison: { status: "match" },
        evidence: [
            { provider: "HoYoverse", independenceGroup: "official", gameVersion: "6.7", gameVersionVerified: true, supportsClaimValue: true },
            { provider: "genshin-db", independenceGroup: "genshin-db", gameVersion: "6.7", gameVersionVerified: true, supportsClaimValue: true }
        ],
        ...overrides
    };
}

function internalClaim(overrides = {}) {
    return {
        claimKind: "internalRuntimeRoute",
        status: "needsReview",
        sourceRefs: ["source:official"],
        codeProvenance: { deterministic: true, path: "games/example.json", locator: "/weapons/1" },
        focusedTests: [{ id: "runtime-route", status: "passed" }],
        ...overrides
    };
}

function candidate(overrides = {}) {
    return {
        id: "candidate:fixture",
        claims: {
            value: externalClaim(),
            destination: internalClaim(),
            duration: { claimKind: "notApplicable", status: "notApplicable", applicabilityDetermined: true }
        },
        discrepancies: [],
        reviewPacketAvailable: true,
        interpretation: { method: "deterministicParser", author: "parser" },
        verification: { status: "needsReview", reviewedBy: null, reviewedAt: null, sourceAgreement: "unknown" },
        ...overrides
    };
}

test("machine evidence may be ready before human review while canonical eligibility remains false", () => {
    const subject = candidate();
    const machine = stateMachine.assessMachineEvidence(subject);
    const canonical = stateMachine.assessCanonicalEligibility(subject);
    assert.equal(machine.machineEvidenceReady, true);
    assert.equal(machine.canonicalEligibility, false);
    assert.equal(canonical.canonicalEligibility, false);
    assert.equal(stateMachine.stateFor(subject), "humanReviewReady");
});

test("notApplicable claims and internally tested Runtime routes do not require external dual sources", () => {
    const result = stateMachine.assessMachineEvidence(candidate());
    assert.equal(result.machineEvidenceReady, true);
    assert.equal(result.claims.find((claim) => claim.field === "duration").machineEvidenceReady, true);
    assert.equal(result.claims.find((claim) => claim.field === "destination").machineEvidenceReady, true);
});

test("unresolved discrepancies fail closed before review", () => {
    const result = stateMachine.assessMachineEvidence(candidate({ discrepancies: [{ code: "MISMATCH", resolved: false }] }));
    assert.equal(result.machineEvidenceReady, false);
    assert.ok(result.blockedReasons.includes("candidate:unresolvedDiscrepancy"));
});

test("canonical eligibility requires completed verification, reviewer, timestamp, agreement, and verified claims", () => {
    const preReview = candidate();
    assert.equal(stateMachine.assessCanonicalEligibility(preReview).canonicalEligibility, false);
    const reviewedClaims = Object.fromEntries(Object.entries(preReview.claims).map(([field, claim]) => [field, {
        ...claim,
        status: claim.claimKind === "notApplicable" ? "notApplicable" : "verified"
    }]));
    const reviewedClaimsWithProofs = Object.fromEntries(Object.entries(reviewedClaims).map(([field, claim]) => [field, {
        ...claim,
        ...proof("candidate:fixture", field, "human")
    }]));
    const reviewed = candidate({
        claims: reviewedClaimsWithProofs,
        verification: { status: "verified", reviewedBy: "human-reviewer", reviewedAt: "2026-08-23T12:00:00.000Z", sourceAgreement: "agreed" }
    });
    reviewed.verification.verificationMode = "human";
    assert.equal(stateMachine.assessCanonicalEligibility(reviewed).canonicalEligibility, true);
    assert.equal(stateMachine.stateFor(reviewed), "canonicalEligible");
});

test("deterministicConsensus can satisfy canonical gate without human reviewer metadata", () => {
    const base = candidate();
    const claims = Object.fromEntries(Object.entries(base.claims).map(([field, claim]) => [field, {
        ...claim,
        status: claim.claimKind === "notApplicable" ? "notApplicable" : "verified",
        ...proof("candidate:fixture", field, "deterministicConsensus")
    }]));
    const reviewed = candidate({
        claims,
        verification: {
            status: "verified",
            verificationMode: "deterministicConsensus",
            reviewedBy: null,
            reviewedAt: null,
            sourceAgreement: "agreed"
        }
    });
    const result = stateMachine.assessCanonicalEligibility(reviewed);
    assert.equal(result.canonicalEligibility, true, result.blockedReasons.join(", "));
    assert.equal(stateMachine.stateFor(reviewed), "canonicalEligible");
});

test("deterministicConsensus never accepts reviewedBy/reviewedAt as a machine attestation", () => {
    const base = candidate();
    const claims = Object.fromEntries(Object.entries(base.claims).map(([field, claim]) => [field, {
        ...claim,
        status: claim.claimKind === "notApplicable" ? "notApplicable" : "verified",
        ...proof("candidate:fixture", field, "deterministicConsensus")
    }]));
    const result = stateMachine.assessCanonicalEligibility(candidate({
        claims,
        verification: {
            status: "verified",
            verificationMode: "deterministicConsensus",
            reviewedBy: "machine-as-reviewer",
            reviewedAt: "2026-08-23T12:00:00.000Z",
            sourceAgreement: "agreed"
        }
    }));
    assert.equal(result.canonicalEligibility, false);
    assert.ok(result.blockedReasons.some((reason) => reason.endsWith("deterministicReviewerFieldForbidden")));
    assert.ok(result.blockedReasons.some((reason) => reason.endsWith("deterministicReviewTimestampForbidden")));
});

test("claim certificate and attestation bind candidate and claim identity", () => {
    const base = candidate();
    const claims = Object.fromEntries(Object.entries(base.claims).map(([field, claim]) => [field, {
        ...claim,
        status: claim.claimKind === "notApplicable" ? "notApplicable" : "verified",
        ...proof("candidate:fixture", field, "deterministicConsensus")
    }]));
    claims.value.verificationAttestation.subjectId = "candidate:other";
    claims.value.eligibilityCertificate.field = "wrongField";
    const result = stateMachine.assessCanonicalEligibility(candidate({
        claims,
        verification: { status: "verified", verificationMode: "deterministicConsensus", reviewedBy: null, reviewedAt: null, sourceAgreement: "agreed" }
    }));
    assert.equal(result.canonicalEligibility, false);
    assert.ok(result.blockedReasons.some((reason) => reason.includes("attestation:subjectMismatch")));
    assert.ok(result.blockedReasons.some((reason) => reason.includes("eligibilityCertificate:claimFieldMismatch")));
});

test("scoped/partial comparison and missing strict gameVersion fail closed", () => {
    const base = candidate();
    const claims = Object.fromEntries(Object.entries(base.claims).map(([field, claim]) => [field, {
        ...claim,
        status: claim.claimKind === "notApplicable" ? "notApplicable" : "verified",
        ...proof("candidate:fixture", field, "deterministicConsensus")
    }]));
    claims.value.comparison = { status: "scopedMatch" };
    claims.value.verificationAttestation.comparison.status = "scopedMatch";
    claims.value.verificationAttestation.sourceBundle[0].gameVersion = "";
    const result = stateMachine.assessCanonicalEligibility(candidate({
        claims,
        verification: { status: "verified", verificationMode: "deterministicConsensus", reviewedBy: null, reviewedAt: null, sourceAgreement: "agreed" }
    }));
    assert.equal(result.canonicalEligibility, false);
    assert.ok(result.blockedReasons.some((reason) => reason.includes("fieldComparisonNotMatched")));
    assert.ok(result.blockedReasons.some((reason) => reason.includes("attestation:sourceBundle[0]:gameVersionMissing")));
});

test("same source family and boolean policy input cannot manufacture consensus", () => {
    const base = candidate();
    const claims = Object.fromEntries(Object.entries(base.claims).map(([field, claim]) => [field, {
        ...claim,
        status: claim.claimKind === "notApplicable" ? "notApplicable" : "verified",
        ...proof("candidate:fixture", field, "deterministicConsensus")
    }]));
    claims.value.evidence = claims.value.evidence.map((item) => ({ ...item, provider: "same-provider", independenceGroup: "same-family" }));
    claims.value.verificationAttestation.policy = true;
    const result = stateMachine.assessCanonicalEligibility(candidate({
        claims,
        canonicalEligibility: true,
        verification: { status: "verified", verificationMode: "deterministicConsensus", reviewedBy: null, reviewedAt: null, sourceAgreement: "agreed" }
    }));
    assert.equal(result.canonicalEligibility, false);
    assert.ok(result.blockedReasons.some((reason) => reason.includes("providerIndependenceInsufficient")));
    assert.ok(result.blockedReasons.some((reason) => reason.includes("attestation:policyMissingOrInvalid")));
});

test("external factual claims retain strict version, independence, and agreement gates", () => {
    assert.equal(stateMachine.evidenceResult({ field: "value", ...externalClaim({ comparison: { status: "mismatch" } }) }).machineEvidenceReady, false);
    assert.equal(stateMachine.evidenceResult({ field: "value", ...externalClaim({ evidence: [externalClaim().evidence[0]] }) }).machineEvidenceReady, false);
    assert.equal(stateMachine.evidenceResult({ field: "value", ...externalClaim({ evidence: externalClaim().evidence.map((item, index) => ({ ...item, gameVersion: index ? "6.6" : "6.7" })) }) }).machineEvidenceReady, false);
});

test("AI interpretation cannot review itself", () => {
    const base = candidate();
    const claims = Object.fromEntries(Object.entries(base.claims).map(([field, claim]) => [field, { ...claim, status: claim.claimKind === "notApplicable" ? "notApplicable" : "verified" }]));
    const result = stateMachine.assessCanonicalEligibility(candidate({
        claims,
        interpretation: { method: "aiAssisted", author: "Sol" },
        verification: { status: "verified", reviewedBy: "Sol", reviewedAt: "2026-08-23T12:00:00.000Z", sourceAgreement: "agreed" }
    }));
    assert.equal(result.canonicalEligibility, false);
    assert.ok(result.blockedReasons.includes("aiReviewNotIndependent"));
});

test("verification transitions are ordered and cannot move backward or skip review", () => {
    const states = stateMachine.STATES;
    states.forEach((state, index) => {
        assert.equal(stateMachine.canTransition(state, state), true);
        if (index + 1 < states.length) assert.equal(stateMachine.canTransition(state, states[index + 1]), true);
        if (index > 0) assert.equal(stateMachine.canTransition(state, states[index - 1]), false);
        if (index + 2 < states.length) assert.equal(stateMachine.canTransition(state, states[index + 2]), false);
    });
});
