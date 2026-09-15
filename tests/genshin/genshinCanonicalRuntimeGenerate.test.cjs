"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const generator = require(path.join(root, "scripts", "genshinCanonicalRuntimeGenerate.cjs"));
const verificationStateMachine = require(path.join(root, "scripts", "genshinVerificationStateMachine.cjs"));
const { buildReviewBinding } = require(path.join(root, "scripts", "genshinReviewBinding.cjs"));
const fixture = JSON.parse(fs.readFileSync(path.join(root, "games", "genshin", "data", "v2", "runtime", "fixtures.json"), "utf8"));
const runtimeSchema = JSON.parse(fs.readFileSync(path.join(root, "games", "genshin", "data", "v2", "runtime", "contract.schema.json"), "utf8"));
const DIGEST = "a".repeat(64);
const FIXTURE_REVIEWED_AT = "2026-08-15T00:00:00.000Z";

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function sourceDigest(source) {
    return /^[a-f0-9]{64}$/.test(source?.integrity?.digest || "") ? source.integrity.digest : DIGEST;
}

function sourceRevision(source, fallback) {
    if (typeof source?.revision === "string" && source.revision) return source.revision;
    if (typeof source?.commit === "string" && source.commit) return source.commit;
    return `fixture:${fallback}`;
}

function sourceRecordsForRefs(refs, sourceRecords) {
    return refs.map((sourceRef, index) => {
        const source = sourceRecords[sourceRef] || {};
        return {
            sourceRef,
            provider: source.provider || `fixture-provider-${index}`,
            independenceGroup: source.independenceGroup || `fixture-family-${index}`,
            revision: sourceRevision(source, sourceRef),
            fileDigest: sourceDigest(source),
            gameVersion: source.gameVersion || "6.7"
        };
    });
}

function explicitProof(candidateId, field, claim, sourceRecords, mode, reviewer) {
    const sourceRefs = Array.isArray(claim?.sourceRefs) && claim.sourceRefs.length
        ? [...claim.sourceRefs]
        : Object.keys(sourceRecords);
    const bundle = sourceRecordsForRefs(sourceRefs, sourceRecords);
    const attestationId = `${candidateId}:${field}:${mode}:attestation`;
    const attestation = {
        schemaVersion: verificationStateMachine.ATTESTATION_SCHEMA_VERSION,
        attestationId,
        verificationMode: mode,
        type: mode === "human" ? "humanReview" : "deterministicConsensus",
        subjectId: candidateId,
        claimField: field,
        attestedAt: FIXTURE_REVIEWED_AT,
        actor: mode === "human" ? { kind: "human", id: reviewer } : { kind: "machine", id: "fixture-consensus/1" },
        ...(mode === "human" ? { decision: "approve" } : {}),
        engine: { name: "genshinCanonicalRuntimeGenerate.fixture", version: "1" },
        policy: { id: "genshin-canonical-v2", version: "1", digest: DIGEST },
        sourceBundle: bundle,
        requiredFields: [field],
        normalization: { id: "fixture-identity", version: "1", digest: DIGEST },
        exactRevisions: bundle.map((source) => ({
            sourceRef: source.sourceRef,
            revision: source.revision,
            fileDigest: source.fileDigest
        })),
        gameVersion: { value: bundle[0]?.gameVersion || "6.7", sourceRefs },
        comparison: { status: "match", digests: { [field]: DIGEST } },
        semanticStatus: "match",
        scopeStatus: "match"
    };
    const certificateId = `${candidateId}:${field}:eligibility`;
    if (mode === "human") {
        return {
            verificationAttestation: attestation,
            eligibilityCertificate: {
                schemaVersion: verificationStateMachine.CERTIFICATE_SCHEMA_VERSION,
                certificateId,
                status: "eligible",
                subjectId: candidateId,
                claimField: field,
                verificationMode: mode,
                attestationId,
                comparisonDigest: DIGEST,
                issuedAt: FIXTURE_REVIEWED_AT,
                scope: { subjectId: candidateId, claimField: field }
            }
        };
    }
    const claimId = `${candidateId}:${field}:claim`;
    const targetGameVersion = bundle[0]?.gameVersion || "6.7";
    const certificate = {
        schemaVersion: verificationStateMachine.CERTIFICATE_SCHEMA_VERSION,
        certificateId,
        status: "eligible",
        verificationMode: mode,
        issuedAt: FIXTURE_REVIEWED_AT,
        candidateId,
        claimId,
        field,
        targetGameVersion,
        currentGameVersion: targetGameVersion,
        versionSnapshotId: `genshin-version:${targetGameVersion}:fixture`,
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
            sourceFieldDigests: Object.fromEntries(bundle.map((source) => [source.sourceRef, DIGEST]))
        },
        sources: bundle.map((source) => ({
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
        canonicalEligibility: false
    };
    attestation.eligibilityCertificateId = certificateId;
    attestation.sourceBundleDigest = DIGEST;
    attestation.versionSnapshotId = certificate.versionSnapshotId;
    return { verificationAttestation: attestation, eligibilityCertificate: certificate };
}

function addExplicitVerification(records, sourceRecords, mode = "human") {
    const output = clone(records);
    Object.values(output).forEach((record) => {
        if (!record?.verification || !record.id) return;
        const verification = record.verification;
        verification.verificationMode = mode;
        verification.machineEvidenceReady = true;
        if (mode === "deterministicConsensus") {
            delete verification.reviewedBy;
            delete verification.reviewedAt;
        }
        Object.entries(verification.claims || {}).forEach(([field, claim]) => {
            if (!claim || !["verified", "notApplicable"].includes(claim.status)) return;
            const sourceRefs = Array.isArray(claim.sourceRefs) && claim.sourceRefs.length
                ? claim.sourceRefs
                : record.sourceRefs || Object.keys(sourceRecords);
            claim.sourceRefs = [...sourceRefs];
            const claimKind = verificationStateMachine.inferClaimKind(field, claim);
            claim.claimKind = claimKind;
            if (["internalRuntimeRoute", "mappingMaterialization", "derivedDeterministic"].includes(claimKind)) {
                const codeProvenance = claim.codeProvenance || {
                    deterministic: true,
                    path: "tests/genshin/genshinCanonicalRuntimeGenerate.test.cjs",
                    locator: `fixture:${record.id}:${field}`,
                    digest: DIGEST
                };
                const focusedTests = claim.focusedTests || [{ id: "genshinCanonicalRuntimeGenerate.fixture", status: "passed" }];
                const sourceInputsVerified = claimKind === "mappingMaterialization";
                claim.codeProvenance = codeProvenance;
                claim.focusedTests = focusedTests;
                claim.sourceInputsVerified = sourceInputsVerified;
                claim.machineEvidence = {
                    ready: true,
                    blockedReasons: [],
                    codeProvenance,
                    focusedTests,
                    ...(claimKind === "mappingMaterialization" ? { sourceInputsVerified: true } : {})
                };
                return;
            }
            if (claimKind === "notApplicable") {
                claim.applicabilityDetermined = true;
                claim.machineEvidence = { ready: true, blockedReasons: [], applicabilityDetermined: true };
                return;
            }
            if (claimKind !== "externalFactual") return;
            claim.evidence = sourceRefs.map((sourceRef) => {
                const source = sourceRecords[sourceRef] || {};
                return {
                    sourceId: sourceRef,
                    provider: source.provider || "fixture-provider",
                    independenceGroup: source.independenceGroup || "fixture-family",
                    gameVersion: source.gameVersion || "6.7",
                    gameVersionVerified: Boolean(source.gameVersion),
                    supportsClaimValue: true
                };
            });
            claim.comparison = { ...(claim.comparison || {}), status: "match" };
            claim.machineEvidence = {
                ready: true,
                blockedReasons: [],
                comparison: "match",
                evidenceRefs: [...sourceRefs]
            };
            Object.assign(claim, explicitProof(String(record.id), field, claim, sourceRecords, mode, verification.reviewedBy));
        });
        if (mode === "human") verification.reviewBinding = buildReviewBinding(record, `fixture:${record.id}`);
    });
    return output;
}

function fixtureInputs(overrides = {}) {
    const sourceRecords = clone(overrides.sourceRecords ?? fixture.sourceRecords);
    const mode = overrides.verificationMode || "human";
    const specs = addExplicitVerification(overrides.specs ?? fixture.specs, sourceRecords, mode);
    const behaviorModifiers = addExplicitVerification(overrides.behaviorModifiers ?? fixture.behaviorModifiers, sourceRecords, mode);
    const certificates = [];
    const attestations = [];
    [specs, behaviorModifiers].forEach((records) => Object.values(records).forEach((record) => {
        Object.values(record?.verification?.claims || {}).forEach((claim) => {
            if (claim?.eligibilityCertificate) certificates.push(claim.eligibilityCertificate);
            if (claim?.verificationAttestation) attestations.push(claim.verificationAttestation);
        });
    }));
    return {
        specs,
        sourceRecords,
        behaviorModifiers,
        eligibilityCertificates: { certificates },
        deterministicAttestations: { attestations }
    };
}

function buildFixture(overrides = {}) {
    return generator.buildCanonicalRuntime({
        ...fixtureInputs(overrides)
    });
}

test("repository version and accepted baseline options propagate into every canonical mapping", () => {
    const built = generator.buildCanonicalRuntime({
        ...fixtureInputs(),
        currentGameVersion: "9.9",
        versionBaselineCurrent: false
    });
    assert.equal(built.summary.canonical, 0);
    assert.ok(built.excluded.every((item) => item.blockedReasons.includes("gameVersion:acceptedBaselineDrift")));
    assert.ok(built.excluded.every((item) => item.blockedReasons.some((reason) => reason.includes("gameVersion:notCurrent"))));
});

test("character identity veto propagates to an effect and its behavior target without disabling weapons", () => {
    const specs = clone(fixture.specs);
    specs["fixture:weapon:damage"].entity = { kind: "talent", id: "10000092", component: "skill" };
    const inputs = fixtureInputs({ specs });
    assert.equal(generator.buildCanonicalRuntime(inputs).summary.canonical, 2);
    const blocked = generator.buildCanonicalRuntime({
        ...inputs,
        characterIdentityResolver: () => ({ blocked: true, classification: "mapperNameMismatch" })
    });
    assert.equal(blocked.summary.canonical, 0);
    assert.ok(blocked.excluded.every((entry) => entry.blockedReasons.some((reason) => reason.includes("identity:mapperNameMismatch"))));
    assert.equal(generator.buildCanonicalRuntime({
        ...inputs, characterIdentityResolver: () => null
    }).summary.canonical, 0);
    assert.equal(generator.buildCanonicalRuntime({
        ...inputs, characterIdentityRequired: true
    }).summary.canonical, 0);
    assert.equal(generator.buildCanonicalRuntime({
        ...inputs, characterIdentityResolver: () => ({ blocked: false, classification: "mapperMissing", consumerCoverageGap: true })
    }).summary.canonical, 2);
    assert.equal(generator.buildCanonicalRuntime({
        ...fixtureInputs(), characterIdentityResolver: () => ({ blocked: true, classification: "mapperNameMismatch" })
    }).summary.canonical, 2);
});

test("verified fixture promotes effect and behavior through allowlisted routes", () => {
    const built = buildFixture();
    assert.equal(built.summary.total, 2);
    assert.equal(built.summary.canonical, 2);
    assert.deepEqual(Object.keys(built.modifiers), ["fixture:behavior:duration", "fixture_runtime_damage"]);
    const effect = built.modifiers.fixture_runtime_damage;
    assert.equal(effect.category, "damageBonus");
    assert.deepEqual(effect.applyTo, ["allDamageBonus"]);
    assert.equal(effect.value, 12);
    assert.deepEqual(effect.destination, {
        dataset: "weaponModifiers",
        entityId: "fixture-weapon",
        collection: "modifiers"
    });
    assert.deepEqual(effect.supersedesLegacyModifierIds, ["fixture_legacy_damage_bonus"]);
    assert.deepEqual(effect.provenance.providers, ["independent-calc-dataset", "official-genshin"]);
    assert.deepEqual(effect.provenance.independenceGroups, ["independent-calc-dataset", "official-genshin"]);
    assert.equal(effect.provenance.gameVersion, "6.0");
    assert.equal(effect.runtime.status, "canonical");
    const behavior = built.modifiers["fixture:behavior:duration"];
    assert.equal(behavior.runtimeKind, "behavior");
    assert.equal(behavior.targetSpecId, "fixture:weapon:damage");
    assert.equal(behavior.path, "/timing/duration");
    assert.equal(behavior.operation, "replace");
    assert.equal(behavior.targetSpec.id, "fixture:weapon:damage");
    assert.equal(behavior.targetSpec.timing.duration.value, 10);
    assert.deepEqual(behavior.destination, {
        dataset: "behaviorModifiers",
        entityId: "fixture-weapon",
        collection: "modifiers"
    });
});

test("deterministicConsensus promotion requires exact authoritative certificate and attestation registry entries", () => {
    const inputs = fixtureInputs({ verificationMode: "deterministicConsensus" });
    const promoted = generator.buildCanonicalRuntime(inputs);
    assert.equal(promoted.summary.canonical, 2, JSON.stringify(promoted.excluded));
    assert.equal(promoted.modifiers.fixture_runtime_damage.provenance.verification.verificationMode, "deterministicConsensus");
    assert.equal(promoted.modifiers.fixture_runtime_damage.provenance.reviewedBy, undefined);

    const noAttestations = generator.buildCanonicalRuntime({ ...inputs, deterministicAttestations: { attestations: [] } });
    assert.equal(noAttestations.summary.canonical, 0);
    assert.ok(noAttestations.excluded.some((item) => item.blockedReasons.some((reason) => reason.includes("authoritativeAttestationMissingOrMismatch"))));

    const tampered = clone(inputs);
    tampered.eligibilityCertificates.certificates[0].policy.status = "candidateApprovedOnly";
    const mismatched = generator.buildCanonicalRuntime(tampered);
    assert.equal(mismatched.summary.canonical, 0);
    assert.ok(mismatched.excluded.some((item) => item.blockedReasons.some((reason) => reason.includes("authoritativeCertificateMismatch") || reason.includes("pairNotReusable"))));
});

test("deterministicConsensus fixture requires byte-equivalent authoritative proof registries", () => {
    const built = buildFixture({ verificationMode: "deterministicConsensus" });
    assert.equal(built.summary.canonical, 2);

    const inputs = fixtureInputs({ verificationMode: "deterministicConsensus", behaviorModifiers: {} });
    const withoutAttestationRegistry = generator.buildCanonicalRuntime({
        ...inputs,
        deterministicAttestations: { attestations: [] }
    });
    assert.equal(withoutAttestationRegistry.summary.canonical, 0);
    assert.ok(withoutAttestationRegistry.excluded[0].blockedReasons.some((reason) => reason.endsWith("authoritativeAttestationMissingOrMismatch")));

    const tampered = clone(inputs.deterministicAttestations);
    tampered.attestations[0].engine.version = "tampered";
    const tamperedResult = generator.buildCanonicalRuntime({
        ...inputs,
        deterministicAttestations: tampered
    });
    assert.equal(tamperedResult.summary.canonical, 0);
    assert.ok(tamperedResult.excluded[0].blockedReasons.some((reason) => reason.endsWith("authoritativeAttestationMissingOrMismatch")));
});

test("deterministicConsensus rejects reviewer metadata and missing certificates", () => {
    const reviewerInputs = fixtureInputs({ verificationMode: "deterministicConsensus", behaviorModifiers: {} });
    reviewerInputs.specs["fixture:weapon:damage"].verification.reviewedBy = "human-reviewer";
    reviewerInputs.specs["fixture:weapon:damage"].verification.reviewedAt = FIXTURE_REVIEWED_AT;
    const reviewerResult = generator.buildCanonicalRuntime(reviewerInputs);
    assert.equal(reviewerResult.summary.canonical, 0);
    assert.ok(reviewerResult.excluded[0].blockedReasons.some((reason) => reason.endsWith("deterministicReviewerFieldForbidden")));
    assert.ok(reviewerResult.excluded[0].blockedReasons.some((reason) => reason.endsWith("deterministicReviewTimestampForbidden")));

    const missingInputs = fixtureInputs({ verificationMode: "deterministicConsensus", behaviorModifiers: {} });
    delete missingInputs.specs["fixture:weapon:damage"].verification.claims["effect.value"].eligibilityCertificate;
    const missingResult = generator.buildCanonicalRuntime(missingInputs);
    assert.equal(missingResult.summary.canonical, 0);
    assert.ok(missingResult.excluded[0].blockedReasons.some((reason) => reason.includes("eligibilityCertificateMissing")));
});

test("w_12516_reaction_bonus_2 scoped reconciliation never becomes deterministic consensus", () => {
    const packet = JSON.parse(fs.readFileSync(path.join(root, "games", "genshin", "data", "v2", "review-pilots", "weapon-12516-reaction.json"), "utf8"));
    const scoped = packet.reviewPacket.fieldComparison.find((entry) => entry.field === "targets");
    assert.equal(packet.claims.value.comparison.status, "match");
    assert.equal(scoped.status, "versionTransition");
    assert.equal(packet.reviewPacket.repositoryTargetGameVersion, "6.7");
    assert.equal(packet.reviewPacket.observedLiveGameVersion, "7.0");

    const sourceRecords = Object.fromEntries(Object.values(packet.sourceRecords).map((source) => [source.id, source]));
    const claim = clone(packet.claims.value);
    claim.status = "verified";
    claim.sourceRefs = claim.evidence.map((source) => source.sourceId);
    Object.assign(claim, explicitProof(packet.target.candidateId, "value", claim, sourceRecords, "deterministicConsensus"));
    claim.verificationAttestation.scopeStatus = "scopedMatch";
    const assessment = verificationStateMachine.assessCanonicalEligibility({
        id: packet.target.candidateId,
        claims: { value: claim },
        discrepancies: [],
        reviewPacketAvailable: true,
        verification: {
            status: "verified",
            verificationMode: "deterministicConsensus",
            sourceAgreement: "agreed"
        }
    });
    assert.equal(assessment.canonicalEligibility, false);
    assert.ok(assessment.blockedReasons.some((reason) => reason.endsWith("scopeStatusNotMatch")));
});

test("runtime schema exposes the dedicated behavior route and structured operation fields", () => {
    assert.ok(runtimeSchema.properties.destination.properties.dataset.enum.includes("behaviorModifiers"));
    assert.ok(runtimeSchema.properties.operation.enum.includes("refresh"));
    assert.ok(runtimeSchema.allOf.some((entry) => entry.then?.required?.includes("targetSpecId")));
});

test("EffectSpec schema exposes explicit Runtime destinations and legacy supersession", () => {
    const schema = require("../../games/genshin/data/schema/effect-spec.schema.json");
    assert.deepEqual(schema.properties.destination.required, ["dataset", "entityId", "collection"]);
    assert.ok(schema.properties.destination.properties.dataset.enum.includes("weaponModifiers"));
    assert.ok(schema.properties.destination.properties.dataset.enum.includes("artifactSetModifiers"));
    assert.equal(schema.properties.destination.allOf.length, 5);
    assert.equal(schema.properties.supersedesLegacyModifierIds.uniqueItems, true);
});

test("canonical output is stable under input map insertion order", () => {
    const first = buildFixture();
    const reversedSources = Object.fromEntries(Object.entries(fixture.sourceRecords).reverse());
    const reversedSpecs = Object.fromEntries(Object.entries(fixture.specs).reverse());
    const reversedBehavior = Object.fromEntries(Object.entries(fixture.behaviorModifiers).reverse());
    const second = buildFixture({
        specs: reversedSpecs,
        sourceRecords: reversedSources,
        behaviorModifiers: reversedBehavior
    });
    assert.equal(generator.stableJson(first), generator.stableJson(second));
});

test("one missing game version blocks the whole spec and its field claims", () => {
    const sources = clone(fixture.sourceRecords);
    sources["fixture:independent"].gameVersion = null;
    const result = buildFixture({ sourceRecords: sources, behaviorModifiers: {} });
    assert.equal(result.summary.canonical, 0);
    const reasons = result.excluded[0].blockedReasons.join(" ");
    assert.match(reasons, /spec:gameVersion:missing/);
    assert.match(reasons, /claim:effect\.activation\.condition:gameVersion:missing/);
});

test("same-provider sources fail closed even when verification says agreed", () => {
    const sources = clone(fixture.sourceRecords);
    sources["fixture:independent"].provider = sources["fixture:official"].provider;
    const result = buildFixture({ sourceRecords: sources, behaviorModifiers: {} });
    assert.equal(result.summary.canonical, 0);
    assert.ok(result.excluded[0].blockedReasons.some((reason) => reason === "spec:providers:insufficient"));
    assert.ok(result.excluded[0].blockedReasons.some((reason) => reason === "claim:effect.activation.condition:providers:insufficient"));
});

test("different provider names in one independence group fail closed", () => {
    const sources = clone(fixture.sourceRecords);
    sources["fixture:independent"].independenceGroup = sources["fixture:official"].independenceGroup;
    const result = buildFixture({ sourceRecords: sources, behaviorModifiers: {} });
    assert.equal(result.summary.canonical, 0);
    assert.ok(result.excluded[0].blockedReasons.includes("spec:independenceGroups:insufficient"));
    assert.ok(result.excluded[0].blockedReasons.includes("claim:effect.activation.condition:independenceGroups:insufficient"));
});

test("a verified field claim still needs two independently resolved references", () => {
    const specs = clone(fixture.specs);
    specs["fixture:weapon:damage"].verification.claims["effect.value"].sourceRefs = ["fixture:official"];
    const result = buildFixture({ specs, behaviorModifiers: {} });
    assert.equal(result.summary.canonical, 0);
    assert.ok(result.excluded[0].blockedReasons.includes("claim:effect.value:sourceRefs:insufficient"));
});

test("missing reviewer, destination, or supersession declaration never defaults", () => {
    const specs = clone(fixture.specs);
    delete specs["fixture:weapon:damage"].verification.reviewedBy;
    delete specs["fixture:weapon:damage"].destination;
    delete specs["fixture:weapon:damage"].supersedesLegacyModifierIds;
    const result = buildFixture({ specs, behaviorModifiers: {} });
    assert.equal(result.summary.canonical, 0);
    assert.ok(result.excluded[0].blockedReasons.some((reason) => reason.endsWith("humanReviewMetadataMissingOrInvalid")), JSON.stringify(result.excluded[0].blockedReasons));
    assert.ok(result.excluded[0].blockedReasons.includes("destination:missing"));
    assert.ok(result.excluded[0].blockedReasons.includes("supersedesLegacyModifierIds:missing"));
});

test("destination is an engine route, not an arbitrary label", () => {
    const specs = clone(fixture.specs);
    specs["fixture:weapon:damage"].destination.collection = "twoPiece";
    const result = buildFixture({ specs, behaviorModifiers: {} });
    assert.equal(result.summary.canonical, 0);
    assert.ok(result.excluded[0].blockedReasons.includes("destination:collectionUnsupported"));
});

test("duplicate canonical modifier IDs fail closed instead of overwriting", () => {
    const specs = clone(fixture.specs);
    specs["fixture:weapon:damage-copy"] = clone(specs["fixture:weapon:damage"]);
    specs["fixture:weapon:damage-copy"].id = "fixture:weapon:damage-copy";
    const result = buildFixture({ specs, behaviorModifiers: {} });
    assert.equal(result.summary.canonical, 0);
    assert.equal(result.summary.blockedByReason["runtime:modifierIdCollision"], 2);
    assert.deepEqual(result.modifiers, {});
});

test("only the two human-reviewed representatives are canonical in current repository data", () => {
    const audit = generator.buildRepositoryAudit();
    assert.equal(audit.totals.canonical, 2);
    assert.equal(audit.categories.weapons.summary.canonical, 1);
    assert.equal(audit.categories.artifacts.summary.canonical, 0);
    assert.equal(audit.categories.talentGap.summary.canonical, 0);
    assert.equal(audit.categories.behavior.summary.canonical, 1);
    const behaviorBatches = Object.entries(audit.categories)
        .filter(([name]) => /^behaviorBatch\d+$/.test(name));
    assert.ok(behaviorBatches.length > 0);
    behaviorBatches.forEach(([, category]) => assert.equal(category.summary.canonical, 0));
    assert.ok(audit.totals.excluded > 0);
    const runtime = generator.buildRepositoryRuntime();
    assert.equal(runtime.summary.candidatesAudited, audit.totals.total);
    assert.equal(runtime.summary.canonical, 2);
    assert.deepEqual(Object.keys(runtime.modifiers), [
        "behavior-modifier:10000026:constellation-1-1:1",
        "genshin:v2:weapon:12516:w_12516_stat_1"
    ]);
});

test("scoped human approval is content-bound to the reviewed subject and raw source bytes", () => {
    const specs = JSON.parse(fs.readFileSync(path.join(root, "games", "genshin", "data", "v2", "weapons", "spec-candidates.json"), "utf8"));
    const sourceRecords = JSON.parse(fs.readFileSync(path.join(root, "games", "genshin", "data", "v2", "weapons", "source-records.json"), "utf8"));
    const spec = specs.w_12516_stat_1;

    const valueTamper = clone(spec);
    valueTamper.effect.valueByRefinement["1"] = 29;
    const valueResult = generator.mapEffectSpec(valueTamper, sourceRecords, { currentGameVersion: "6.7", versionBaselineCurrent: true });
    assert.equal(valueResult.eligible, false);
    assert.ok(valueResult.blockedReasons.includes("verification:humanReviewSubjectDigestMismatch"));

    const rawTamper = clone(sourceRecords);
    rawTamper[spec.sourceRefs[0]].text += " tampered";
    const rawResult = generator.mapEffectSpec(spec, rawTamper, { currentGameVersion: "6.7", versionBaselineCurrent: true });
    assert.equal(rawResult.eligible, false);
    assert.ok(rawResult.blockedReasons.some((reason) => reason.includes("rawSourceDigestMismatch")));
});

test("materialized repository Runtime is identical to the deterministic build", () => {
    const materialized = JSON.parse(fs.readFileSync(path.join(root, "games", "genshin", "data", "v2", "runtime", "canonical-runtime.json"), "utf8"));
    assert.equal(generator.stableJson(materialized), generator.stableJson(generator.buildRepositoryRuntime()));
});

test("canonical audit report is derived from the same repository audit", () => {
    const audit = generator.buildRepositoryAudit();
    const report = generator.buildRepositoryAuditReport();
    assert.equal(report.repository.totalCandidates, audit.totals.total);
    assert.equal(report.repository.canonical, audit.totals.canonical);
    assert.equal(report.repository.excluded, audit.totals.excluded);
    assert.deepEqual(Object.keys(report.repository.categories), Object.keys(audit.categories));
});

test("contract and mapper do not infer unsupported activation or value fields", () => {
    const specs = clone(fixture.specs);
    const spec = specs["fixture:weapon:damage"];
    delete spec.effect.activation.uidHandling;
    spec.effect.unparsedDescription = "12% damage";
    delete spec.effect.value;
    const result = buildFixture({ specs, behaviorModifiers: {} });
    assert.equal(result.summary.canonical, 0);
    assert.ok(result.excluded[0].blockedReasons.includes("effect:uidHandlingMissingOrUnsupported"));
    assert.ok(result.excluded[0].blockedReasons.includes("effect:valueMissing"));
});

test("an unrelated verified claim cannot cover a copied field", () => {
    const specs = clone(fixture.specs);
    delete specs["fixture:weapon:damage"].verification.claims["effect.value"];
    specs["fixture:weapon:damage"].verification.claims.unrelated = {
        status: "verified",
        sourceRefs: ["fixture:official", "fixture:independent"]
    };
    const result = buildFixture({ specs, behaviorModifiers: {} });
    assert.equal(result.summary.canonical, 0);
    assert.ok(result.excluded[0].blockedReasons.includes("claimCoverage:effect.value:verifiedRequired"));
});

test("canonical provenance remains eligible through the browser DataContract gate", () => {
    const contractCode = fs.readFileSync(path.join(root, "games", "js", "genshinDataContract.js"), "utf8");
    const sandbox = { window: {}, console };
    vm.runInNewContext(contractCode, sandbox, { filename: "genshinDataContract.js" });
    const built = buildFixture();
    const effect = built.modifiers.fixture_runtime_damage;
    const assessment = sandbox.window.GenshinDataContract.assessRuntimeEligibility(effect);
    assert.equal(assessment.eligible, true, assessment.reason);
    assert.equal(effect.provenance.verification.status, "verified");
    assert.equal(effect.provenance.verification.independentSourceCount, 2);
});
