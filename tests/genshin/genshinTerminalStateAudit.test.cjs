"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
    BLOCK_REASONS,
    TERMINAL_STATES,
    buildTerminalStateAudit,
    summarizeEligibilityCertificates,
    scopedSearchFrontierRegistry,
    verifiedWithoutOpenMeaning
} = require("../../scripts/genshinTerminalStateAudit.cjs");
const verificationStateMachine = require("../../scripts/genshinVerificationStateMachine.cjs");

const repositoryRoot = path.resolve(__dirname, "..", "..");
const DIGEST = "a".repeat(64);
const FIXTURE_GAME_VERSION = "6.7";

function deterministicProof(candidateId, field, overrides = {}) {
    const sourceRefs = ["source:official", "source:independent"];
    const claimId = `${candidateId}:${field}:claim`;
    const certificateId = `${candidateId}:${field}:certificate`;
    const versionSnapshotId = `genshin-version:${FIXTURE_GAME_VERSION}:fixture`;
    const sourceBundle = sourceRefs.map((sourceRef, index) => ({
        sourceRef,
        provider: index ? "genshin-db" : "HoYoverse",
        independenceGroup: index ? "genshin-db" : "official-hoyoverse",
        revision: index ? "rev-genshin-db" : "rev-official",
        fileDigest: DIGEST,
        gameVersion: FIXTURE_GAME_VERSION
    }));
    const attestation = {
        schemaVersion: verificationStateMachine.ATTESTATION_SCHEMA_VERSION,
        attestationId: `${candidateId}:${field}:attestation`,
        verificationMode: "deterministicConsensus",
        type: "deterministicConsensus",
        subjectId: candidateId,
        claimField: field,
        attestedAt: "2026-08-28T00:00:00.000Z",
        actor: { kind: "machine", id: "fixture-consensus/1" },
        engine: { name: "genshin-terminal-state-audit.fixture", version: "1" },
        policy: { id: "genshin-canonical-v2", version: "1", digest: DIGEST },
        sourceBundle,
        requiredFields: [field],
        normalization: { id: "fixture-identity", version: "1", digest: DIGEST },
        exactRevisions: sourceBundle.map((source) => ({
            sourceRef: source.sourceRef,
            revision: source.revision,
            fileDigest: source.fileDigest
        })),
        gameVersion: { value: FIXTURE_GAME_VERSION, sourceRefs },
        comparison: { status: "match", digests: { [field]: DIGEST } },
        semanticStatus: "match",
        scopeStatus: "match",
        eligibilityCertificateId: certificateId,
        sourceBundleDigest: DIGEST,
        versionSnapshotId
    };
    const certificate = {
        schemaVersion: verificationStateMachine.CERTIFICATE_SCHEMA_VERSION,
        certificateId,
        status: "eligible",
        verificationMode: "deterministicConsensus",
        issuedAt: attestation.attestedAt,
        candidateId,
        claimId,
        field,
        targetGameVersion: FIXTURE_GAME_VERSION,
        currentGameVersion: FIXTURE_GAME_VERSION,
        versionSnapshotId,
        authority: {
            id: "genshinSourceCatalogContractAudit",
            version: "1",
            sourceCatalogDigest: DIGEST,
            sourceFamilyRegistryDigest: DIGEST,
            providerPolicyDigest: DIGEST
        },
        policy: { status: "reusable", automaticVerificationAllowed: true },
        scope: { candidateId, claimId, field, valueDigest: DIGEST },
        requiredFieldCoverage: { status: "complete", requiredFields: [field], digest: DIGEST },
        comparison: {
            status: "match",
            claimValueDigest: DIGEST,
            sourceFieldDigests: Object.fromEntries(sourceRefs.map((sourceRef) => [sourceRef, DIGEST]))
        },
        sources: sourceBundle.map((source) => ({
            sourceRef: source.sourceRef,
            providerId: source.provider,
            familyId: source.independenceGroup,
            lineageStatus: "declared",
            revision: source.revision,
            rawArtifactDigest: source.fileDigest,
            fieldDigest: DIGEST,
            revisionPinned: true,
            rawArtifactDigestBound: true,
            fieldScoped: true,
            exactField: true,
            fieldDigestMatches: true,
            strictGameVersionBinding: true,
            supportsClaimValue: true,
            gameVersion: source.gameVersion
        })),
        sourceBundleDigest: DIGEST,
        normalization: { id: "fixture-identity", version: "1", digest: DIGEST },
        stale: false,
        invalidated: false,
        blockedReasons: [],
        canonicalEligibility: false,
        ...overrides.certificate
    };
    return {
        claim: {
            id: claimId,
            claimKind: "externalFactual",
            status: "verified",
            sourceRefs,
            comparison: { status: "match" },
            evidence: sourceBundle.map((source) => ({
                provider: source.provider,
                independenceGroup: source.independenceGroup,
                gameVersion: source.gameVersion,
                gameVersionVerified: true,
                supportsClaimValue: true
            })),
            verificationAttestation: { ...attestation, ...overrides.attestation },
            eligibilityCertificate: certificate
        },
        sourceRefs,
        certificate,
        attestation
    };
}

function deterministicBehaviorFixture(overrides = {}) {
    const candidateId = "behavior:fixture:skill";
    const proof = deterministicProof(candidateId, "value", overrides);
    return {
        id: candidateId,
        claims: { value: proof.claim },
        discrepancies: [],
        verification: {
            status: "verified",
            verificationMode: "deterministicConsensus",
            reviewedBy: null,
            reviewedAt: null,
            sourceAgreement: "agreed"
        }
    };
}

test("BehaviorSpec deterministicConsensus requires the real attestation and certificate proof", () => {
    const verified = deterministicBehaviorFixture();
    assert.equal(verifiedWithoutOpenMeaning(verified), true);

    const nestedClaims = deterministicBehaviorFixture();
    nestedClaims.verification.claims = nestedClaims.claims;
    delete nestedClaims.claims;
    assert.equal(verifiedWithoutOpenMeaning(nestedClaims), true);

    const missingCertificate = deterministicBehaviorFixture();
    delete missingCertificate.claims.value.eligibilityCertificate;
    assert.equal(verifiedWithoutOpenMeaning(missingCertificate), false);

    const tamperedCertificate = deterministicBehaviorFixture();
    tamperedCertificate.claims.value.eligibilityCertificate.policy = {
        status: "candidateApprovedOnly",
        automaticVerificationAllowed: true
    };
    assert.equal(verifiedWithoutOpenMeaning(tamperedCertificate), false);

    const staleVersion = deterministicBehaviorFixture();
    staleVersion.claims.value.eligibilityCertificate.targetGameVersion = "6.6";
    staleVersion.claims.value.eligibilityCertificate.currentGameVersion = FIXTURE_GAME_VERSION;
    assert.equal(verifiedWithoutOpenMeaning(staleVersion), false);
});

test("legacy human BehaviorSpec metadata remains accepted, while deterministic review fields do not substitute for proof", () => {
    const human = {
        id: "behavior:legacy-human",
        discrepancies: [],
        verification: {
            status: "verified",
            sourceAgreement: "agreed",
            reviewedBy: "user:workspace-owner",
            reviewedAt: "2026-08-24T00:00:00.000Z"
        }
    };
    assert.equal(verifiedWithoutOpenMeaning(human), true);

    const fakeDeterministic = {
        ...human,
        id: "behavior:fake-deterministic",
        verification: {
            ...human.verification,
            verificationMode: "deterministicConsensus"
        }
    };
    assert.equal(verifiedWithoutOpenMeaning(fakeDeterministic), false);
});

test("missing strict agreement is not reported as a source contradiction", () => {
    const missing = summarizeEligibilityCertificates([{
        status: "blocked", comparison: { status: "notMatch" }, sources: [],
        blockedReasons: ["sourceEvidenceInsufficient", "fieldAgreementNotExactMatch"]
    }]);
    assert.equal(missing.fieldComparison.hasMismatch, false);
    assert.equal(missing.strictEligible, false);
    assert.equal(missing.status, "blocked");
    assert.equal(summarizeEligibilityCertificates([{ comparison: { status: "unknown" } }]).fieldComparison.hasMismatch, false);
    for (const status of ["mismatch", "conflict"]) {
        assert.equal(summarizeEligibilityCertificates([{ comparison: { status } }]).fieldComparison.hasMismatch, true);
    }
});

test("all 2,268 candidates reach an explicit terminal state", () => {
    const audit = buildTerminalStateAudit();
    assert.equal(audit.status, "passed");
    assert.equal(audit.summary.totals.total, 2268);
    assert.equal(audit.summary.totals.productionCanonical, 0);
    assert.equal(audit.summary.totals.awaitingHumanReview, 0);
    assert.equal(audit.summary.totals.verifiedSpec, 1);
    assert.equal(audit.summary.totals.nonCalculativeComplete, 64);
    assert.equal(audit.summary.totals.historicalCanonicalPendingRevalidation, 3);
    assert.equal(audit.summary.totals.blocked, 2203);
    assert.equal(audit.summary.totals.unclassified, 0);
    assert.equal(audit.records.length, 2268);
    assert.equal(audit.records.every((record) => TERMINAL_STATES.includes(record.terminalState)), true);
    assert.equal(audit.records.filter((record) => record.terminalState === "blocked")
        .every((record) => record.blockReasons.length > 0), true);
});

test("overlapping source frontiers fail closed for the duplicated candidate", () => {
    const candidate = { id: "synthetic:candidate", dataset: "synthetic", layer: "syntheticSpec" };
    const appliesTo = {
        dataset: "synthetic",
        layer: "syntheticSpec",
        candidateCount: 1,
        candidateIdDigest: require("node:crypto").createHash("sha256").update(JSON.stringify([candidate.id])).digest("hex"),
        candidateIds: [candidate.id]
    };
    const frontier = (id) => ({
        id,
        status: "searchExhausted",
        appliesTo,
        searchScope: "synthetic exact candidate",
        lastSearchedAt: "2026-08-26",
        providersExamined: ["provider-a"],
        negativeResult: "no qualifying source",
        reopenTrigger: "new immutable evidence",
        evidenceRefs: ["games/genshin/data/v2/source-search-frontiers.json"]
    });
    const result = scopedSearchFrontierRegistry({
        schemaVersion: 1,
        kind: "genshinSourceSearchFrontierRegistry",
        frontiers: [frontier("frontier-a"), frontier("frontier-b")]
    }, [candidate]);
    assert.equal(result.has(candidate.id), false);
});

test("terminal inventory separates BehaviorSpec verification from Runtime promotion", () => {
    const audit = buildTerminalStateAudit();
    const behavior = audit.summary.byLayer.behaviorSpec;
    assert.equal(behavior.total, 1582);
    assert.equal(behavior.productionCanonical, 0);
    assert.equal(behavior.verifiedSpec, 1);
    assert.equal(behavior.blocked, 1581);
    const xiaoSkill = audit.records.find((record) => record.id === "behavior:10000026:talent:skill");
    assert.equal(xiaoSkill.terminalState, "verifiedSpec");
    assert.equal(xiaoSkill.consumerStatus, "historicalCanonicalPendingRevalidation");
    assert.equal(xiaoSkill.historicalCanonicalPendingRevalidation, true);
    assert.equal(xiaoSkill.automationStatus, "waitingTargetVersionReverification");
});

test("BehaviorSpec-only candidates do not inherit a future consumer blocker", () => {
    const audit = buildTerminalStateAudit();
    const behavior = audit.records.filter((record) => record.layer === "behaviorSpec");
    assert.equal(behavior.length, 1582);
    assert.equal(behavior.filter((record) => record.blockReasons.includes("consumerMissing")).length, 0);
    assert.equal(behavior.filter((record) => record.terminalState === "blocked").length, 1581);
    assert.equal(behavior.filter((record) => record.primaryBlockReason === "semanticDecisionRequired").length, 1533);
    assert.equal(behavior.filter((record) => record.primaryBlockReason === "versionOrProviderCoverageDrift").length, 48);

    const pureSpec = audit.records.find((record) => record.id === "behavior:10000002:constellation:constellation-2");
    assert.ok(pureSpec);
    assert.equal(pureSpec.blockReasons.includes("consumerMissing"), false);
    assert.equal(pureSpec.consumerStatus, "notApplicable");
    assert.match(pureSpec.completionRequirements.join(" "), /human approval or valid deterministicConsensus certification/);

    const historicalRuntimeTarget = audit.records.find((record) => record.id === "behavior:10000026:talent:skill");
    assert.equal(historicalRuntimeTarget.consumerStatus, "historicalCanonicalPendingRevalidation");
    assert.equal(historicalRuntimeTarget.historicalCanonicalPendingRevalidation, true);
    assert.equal(historicalRuntimeTarget.blockReasons.includes("consumerMissing"), false);

    // The one explicit consumer implementation gap remains independently
    // diagnosed; it is not supplied by the generic BehaviorSpec layer rule.
    const explicitConsumerGap = audit.records.find((record) => record.id === "w_12516_reaction_bonus_2");
    assert.ok(explicitConsumerGap.blockReasons.includes("consumerMissing"));
    assert.equal(explicitConsumerGap.consumerStatus, "formulaPending");
});

test("support blockers preserve the legacy production disposition", () => {
    const audit = buildTerminalStateAudit();
    assert.equal(audit.summary.totals.blockReasons.sourceMissing, 2203);
    assert.equal(audit.summary.totals.blockReasons.gameVersionUnbound, 2203);
    assert.equal(audit.summary.totals.blockReasons.providerIndependenceUnknown, 513);
    assert.equal(audit.summary.totals.blockReasons.providerIndependenceCorrelated, 1690);
    assert.equal(audit.summary.totals.blockReasons.versionOrProviderCoverageDrift, 55);
    assert.equal(audit.summary.totals.blockReasons.sourceDiscrepancy, 0);
    assert.equal(audit.summary.totals.blockReasons.semanticDecisionRequired, 1690);
    assert.equal(audit.summary.totals.blockReasons.consumerMissing, 1);
    assert.equal(audit.summary.totals.blockReasons.inputMissing, 39);
    assert.equal(audit.summary.totals.blockReasons.unsupported, 6);
    assert.equal(audit.summary.totals.blockReasons.displayOnly, 38);
    assert.equal(audit.summary.byLayer.weaponEffectSpec.blockReasons.inputMissing, 35);
    assert.equal(audit.summary.byLayer.artifactEffectSpec.blockReasons.inputMissing, 4);
    assert.equal(audit.summary.byLayer.weaponEffectSpec.blockReasons.unsupported, 4);
    assert.equal(audit.summary.byLayer.artifactEffectSpec.blockReasons.unsupported, 2);
    assert.equal(audit.summary.totals.primaryBlockReasons.sourceMissing, 429);
    assert.equal(audit.summary.totals.primaryBlockReasons.inputMissing, 39);
    assert.equal(audit.summary.totals.primaryBlockReasons.unsupported, 6);
    assert.equal(audit.summary.totals.primaryBlockReasons.displayOnly, 38);
    assert.equal(audit.summary.totals.primaryBlockReasons.versionOrProviderCoverageDrift, 55);
    assert.equal(audit.summary.totals.primaryBlockReasons.semanticDecisionRequired, 1636);
    assert.equal(audit.summary.totals.autoProcessableNow, 0);
    assert.equal(audit.eligibilityCertificates.summary.eligibleCount, 0);
    assert.equal(audit.taskQueue.summary.autoAttestationEligible, 0);
    assert.equal(audit.taskQueue.summary.promotionEligible, 0);
    assert.equal(audit.taskQueue.summary.humanDecisionWait, 0);
    assert.equal(audit.summary.totals.waitOn["source/provider"], 2203);
    assert.equal(audit.summary.totals.waitOn.human, 0);
    assert.equal(audit.summary.totals.waitOn.consumer, 1);
    for (const reason of ["inputMissing", "unsupported", "semanticDecisionRequired"]) {
        const record = audit.records.find((candidate) => candidate.primaryBlockReason === reason);
        assert.ok(record, `missing ${reason} regression record`);
        assert.match(record.completionRequirements.join(" "), /human approval or valid deterministicConsensus certification/);
    }
    const officialTransitionRecords = audit.records.filter((record) => record.evidence.officialVersionImpact);
    assert.equal(officialTransitionRecords.length, 55);
    assert.equal(officialTransitionRecords.every((record) => record.primaryBlockReason === "versionOrProviderCoverageDrift"), true);
    assert.equal(officialTransitionRecords.every((record) => record.evidence.officialVersionImpact.gameVersion === "7.0"), true);
    assert.equal(officialTransitionRecords.every((record) => /^[a-f0-9]{64}$/.test(record.evidence.officialVersionImpact.fieldDigest)), true);
    const ventiC6 = audit.records.find((record) => record.id === "behavior:10000022:constellation:constellation-6");
    assert.equal(ventiC6.evidence.officialVersionImpact.status, "reacquisitionRequired");
    assert.equal(ventiC6.evidence.officialVersionImpact.mappingStatus, "exactCandidateMapped");
    const reaction = audit.records.find((record) => record.id === "w_12516_reaction_bonus_2");
    assert.equal(reaction.evidence.officialVersionImpact.mappingStatus, "reactionConsumerTransition");
    assert.deepEqual(Object.keys(audit.summary.totals.blockReasons), [...BLOCK_REASONS]);
    const closedDisplayRecords = audit.records.filter((record) => record.terminalState === "nonCalculativeComplete");
    assert.equal(closedDisplayRecords.length, 64);
    assert.equal(closedDisplayRecords.every((record) => record.legacy.supportStatus === "displayOnly"), true);
    assert.equal(closedDisplayRecords.every((record) => ["SUPERSEDED_RECORD", "EXPLICIT_DISPLAY_ONLY"].includes(record.legacy.reasonCode)), true);
    assert.equal(closedDisplayRecords.every((record) => record.waitOn.length === 0 && record.automationStatus === "complete"), true);
});

test("dataset provider policy records scope, lineage, binding, and invalidation", () => {
    const policy = JSON.parse(fs.readFileSync(
        path.join(repositoryRoot, "games", "genshin", "data", "v2", "provider-independence-policy.json"),
        "utf8"
    ));
    assert.equal(policy.principles.scope, "dataset × provider pair");
    assert.equal(policy.principles.aiSelfApproval, "forbidden");
    assert.equal(policy.schemaVersion, 2);
    assert.ok(policy.policies.length >= 6);
    assert.equal(policy.policies.filter((entry) => entry.status === "reusable").length, 0);
    assert.equal(policy.policies.filter((entry) => entry.status === "candidateApprovedOnly").length, 2);
    assert.equal(policy.policies.filter((entry) => entry.status === "searchExhausted").length, 0);
    const kqmArtifact = policy.policies.find((entry) => entry.id === "artifacts:kqm-tcl+genshin-db");
    assert.equal(kqmArtifact.searchStatus, "searchExhausted");
    assert.equal(kqmArtifact.candidateCount, 50);
    assert.match(kqmArtifact.candidateIdDigest, /^[a-f0-9]{64}$/);
    const kqmEvidence = fs.readFileSync(path.join(
        repositoryRoot,
        "games",
        "genshin",
        "data",
        "v2",
        "external",
        "kqm-artifact-field-evidence.json"
    ));
    assert.equal(require("node:crypto").createHash("sha256").update(kqmEvidence).digest("hex"), kqmArtifact.evidenceFileSha256);
    policy.policies.forEach((entry) => {
        assert.ok(entry.dataset);
        assert.ok(entry.providerA);
        assert.ok(entry.providerB);
        assert.ok(entry.upstreamLineage);
        assert.ok(entry.revisionAndRelease);
        assert.ok(entry.gameVersionBinding);
        assert.ok(Object.hasOwn(entry, "scope"));
        assert.ok(Array.isArray(entry.invalidationConditions) && entry.invalidationConditions.length > 0);
        assert.ok(entry.searchScope);
        assert.ok(entry.lastSearchedAt);
        assert.ok(Array.isArray(entry.providersExamined) && entry.providersExamined.length > 0);
        assert.ok(entry.reopenTrigger);
    });
});

test("four-piece search exhaustion is exact-ID scoped and keeps input gaps separate", () => {
    const registry = JSON.parse(fs.readFileSync(path.join(
        repositoryRoot,
        "games",
        "genshin",
        "data",
        "v2",
        "source-search-frontiers.json"
    ), "utf8"));
    const frontier = registry.frontiers.find((entry) => entry.id === "artifacts-four-piece-independent-field-frontier-7.0");
    const candidateIds = [...frontier.appliesTo.candidateIds].sort();
    assert.equal(candidateIds.length, 68);
    assert.equal(require("node:crypto").createHash("sha256").update(JSON.stringify(candidateIds)).digest("hex"), frontier.appliesTo.candidateIdDigest);
    assert.equal(frontier.excludedCandidates.length, 4);
    assert.equal(frontier.excludedCandidates.every((entry) => entry.reason === "inputMissing"), true);
    const audit = buildTerminalStateAudit();
    const covered = audit.records.find((record) => record.id === "artifact:10001:fourPiece:4pc_charged_crit_rate");
    const excluded = audit.records.find((record) => record.id === "artifact:15022:fourPiece:4pc_sea_dyed_foam_damage");
    assert.equal(covered.searchFrontier.policyId, frontier.id);
    assert.equal(covered.nextTask.status, "reopenOnTrigger");
    assert.equal(excluded.searchFrontier.status, "searchRequired");
    assert.equal(excluded.nextTask.status, "ready");
    const weaponFrontier = registry.frontiers.find((entry) => entry.id === "weapons-gcsim-nine-entity-field-frontier-7.0");
    const weaponCandidateIds = [...weaponFrontier.appliesTo.candidateIds].sort();
    assert.equal(weaponCandidateIds.length, 30);
    assert.equal(require("node:crypto").createHash("sha256").update(JSON.stringify(weaponCandidateIds)).digest("hex"), weaponFrontier.appliesTo.candidateIdDigest);
    const weapon = audit.records.find((record) => record.id === "w_11503_damage_1");
    assert.equal(weapon.searchFrontier.policyId, weaponFrontier.id);
    assert.equal(weapon.nextTask.status, "reopenOnTrigger");
});
