"use strict";

const CLAIM_KINDS = Object.freeze([
    "externalFactual",
    "internalRuntimeRoute",
    "mappingMaterialization",
    "derivedDeterministic",
    "notApplicable"
]);

const VERIFICATION_MODES = Object.freeze([
    "human",
    "deterministicConsensus"
]);

const ATTESTATION_SCHEMA_VERSION = 1;
const CERTIFICATE_SCHEMA_VERSION = 1;
const SHA256 = /^[a-f0-9]{64}$/;

const STATES = Object.freeze([
    "rawEvidence",
    "machineEvidenceComplete",
    "humanReviewReady",
    "humanReviewed",
    "canonicalEligible",
    "productionCanonical"
]);

const INTERNAL_FIELDS = new Set([
    "destination",
    "supersedesLegacyModifierIds",
    "runtime.modifierIds",
    "runtime",
    "runtimeEligibility",
    "registryStructure",
    "inputPolicy",
    "automaticDetectability",
    "effect.activation.calculationSupport",
    "effect.activation.uidHandling",
    "runtime.destination",
    "runtime.supersedesLegacyModifierIds"
]);

function inferClaimKind(field, claim = {}) {
    if (claim.claimKind && CLAIM_KINDS.includes(claim.claimKind)) return claim.claimKind;
    if (claim.status === "notApplicable") return "notApplicable";
    if (INTERNAL_FIELDS.has(field)) return "internalRuntimeRoute";
    if (field === "entity" || field === "interpretation" || field === "effect.kind") return "mappingMaterialization";
    if (field.startsWith("derived.")) return "derivedDeterministic";
    return "externalFactual";
}

function unique(values) {
    return [...new Set((values || []).filter((value) => value !== null && value !== undefined && value !== ""))];
}

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function validDateTime(value) {
    return nonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function validSha256(value) {
    return typeof value === "string" && SHA256.test(value);
}

function subjectIdFor(candidate = {}) {
    return String(candidate.subjectId || candidate.id || candidate.specId || "");
}

function claimSourceRefs(claim = {}) {
    return unique([
        ...(Array.isArray(claim.sourceRefs) ? claim.sourceRefs : []),
        ...(Array.isArray(claim.machineEvidence?.evidenceRefs) ? claim.machineEvidence.evidenceRefs : []),
        ...(Array.isArray(claim.evidence) ? claim.evidence.map((item) => item?.sourceRef || item?.id) : [])
    ]);
}

function claimAttestation(claim = {}) {
    return claim.verificationAttestation || claim.attestation || null;
}

function claimCertificate(claim = {}) {
    return claim.eligibilityCertificate || claim.certificate || null;
}

function pushReason(reasons, reason) {
    if (reason && !reasons.includes(reason)) reasons.push(reason);
}

function validateSourceBundle(attestation, claim, reasons) {
    const sourceRefs = claimSourceRefs(claim);
    const bundle = attestation?.sourceBundle;
    if (!Array.isArray(bundle) || !bundle.length) {
        pushReason(reasons, "attestation:sourceBundleMissing");
        return;
    }
    const bundleRefs = unique(bundle.map((source) => source?.sourceRef || source?.id));
    sourceRefs.forEach((sourceRef) => {
        if (!bundleRefs.includes(sourceRef)) pushReason(reasons, `attestation:sourceBundleMissing:${sourceRef}`);
    });
    bundle.forEach((source, index) => {
        if (!isObject(source) || !nonEmptyString(source.sourceRef || source.id)) {
            pushReason(reasons, `attestation:sourceBundle[${index}]:sourceRefMissing`);
            return;
        }
        ["provider", "independenceGroup", "revision", "gameVersion"].forEach((field) => {
            if (!nonEmptyString(source[field])) pushReason(reasons, `attestation:sourceBundle[${index}]:${field}Missing`);
        });
        if (!validSha256(source.fileDigest || source.digest)) {
            pushReason(reasons, `attestation:sourceBundle[${index}]:fileDigestInvalid`);
        }
    });
}

/**
 * Validate the semantic contract of an attestation without depending on the
 * producer's exact JSON envelope.  Producers may use `attestation` or
 * `verificationAttestation` at the claim boundary; this function only
 * consumes the normalized object passed by the caller.
 */
function assessVerificationAttestation({ candidate = {}, field = "", claim = {}, verification = {}, attestation } = {}) {
    const blockedReasons = [];
    const mode = verification.verificationMode;
    const subjectId = subjectIdFor(candidate);
    if (!VERIFICATION_MODES.includes(mode)) pushReason(blockedReasons, "verificationModeMissingOrInvalid");
    if (!subjectId) pushReason(blockedReasons, "attestation:subjectMissing");
    if (!isObject(attestation)) {
        pushReason(blockedReasons, "verificationAttestationMissing");
        return { ready: false, blockedReasons, verificationMode: mode || null };
    }
    if (attestation.schemaVersion !== ATTESTATION_SCHEMA_VERSION) pushReason(blockedReasons, "attestation:schemaVersionInvalid");
    ["attestationId", "subjectId", "claimField", "attestedAt"].forEach((fieldName) => {
        if (!nonEmptyString(attestation[fieldName])) pushReason(blockedReasons, `attestation:${fieldName}Missing`);
    });
    if (attestation.subjectId !== subjectId) pushReason(blockedReasons, "attestation:subjectMismatch");
    if (attestation.claimField !== field) pushReason(blockedReasons, "attestation:claimFieldMismatch");
    if (attestation.verificationMode !== mode) pushReason(blockedReasons, "attestation:modeMismatch");
    if (!validDateTime(attestation.attestedAt)) pushReason(blockedReasons, "attestation:attestedAtInvalid");

    if (!isObject(attestation.engine) || !nonEmptyString(attestation.engine.name) || !nonEmptyString(attestation.engine.version)) {
        pushReason(blockedReasons, "attestation:engineMissingOrInvalid");
    }
    if (!isObject(attestation.policy) || !nonEmptyString(attestation.policy.id) || !nonEmptyString(attestation.policy.version) || !validSha256(attestation.policy.digest)) {
        pushReason(blockedReasons, "attestation:policyMissingOrInvalid");
    }
    if (!Array.isArray(attestation.requiredFields) || !attestation.requiredFields.includes(field)) {
        pushReason(blockedReasons, "attestation:requiredFieldMissing");
    }
    if (!isObject(attestation.normalization) || !nonEmptyString(attestation.normalization.id) || !nonEmptyString(attestation.normalization.version) || !validSha256(attestation.normalization.digest)) {
        pushReason(blockedReasons, "attestation:normalizationMissingOrInvalid");
    }
    if (!Array.isArray(attestation.exactRevisions) || !attestation.exactRevisions.length) {
        pushReason(blockedReasons, "attestation:exactRevisionsMissing");
    } else {
        attestation.exactRevisions.forEach((revision, index) => {
            if (!isObject(revision) || !nonEmptyString(revision.sourceRef) || !nonEmptyString(revision.revision) || !validSha256(revision.fileDigest)) {
                pushReason(blockedReasons, `attestation:exactRevisions[${index}]:invalid`);
            }
        });
    }
    if (!isObject(attestation.gameVersion) || !nonEmptyString(attestation.gameVersion.value) || !Array.isArray(attestation.gameVersion.sourceRefs) || !attestation.gameVersion.sourceRefs.length) {
        pushReason(blockedReasons, "attestation:gameVersionMissingOrInvalid");
    }
    if (!isObject(attestation.comparison) || !["match", "notRequired"].includes(attestation.comparison.status) || !isObject(attestation.comparison.digests) || !Object.keys(attestation.comparison.digests).length) {
        pushReason(blockedReasons, "attestation:comparisonDigestMissingOrInvalid");
    } else if (!validSha256(attestation.comparison.digests[field])) {
        pushReason(blockedReasons, "attestation:comparisonDigestMissingOrInvalid");
    }
    if (attestation.semanticStatus !== undefined && attestation.semanticStatus !== "match") pushReason(blockedReasons, "attestation:semanticStatusNotMatch");
    if (attestation.scopeStatus !== undefined && attestation.scopeStatus !== "match") pushReason(blockedReasons, "attestation:scopeStatusNotMatch");
    if (["scopedMatch", "partial"].includes(attestation.comparison?.status)) pushReason(blockedReasons, "attestation:scopedOrPartialComparison");
    validateSourceBundle(attestation, claim, blockedReasons);

    if (mode === "human") {
        if (!nonEmptyString(verification.reviewedBy) || !validDateTime(verification.reviewedAt)) {
            pushReason(blockedReasons, "humanReviewMetadataMissingOrInvalid");
        }
        if (attestation.type !== "humanReview" || attestation.actor?.kind !== "human" || !nonEmptyString(attestation.actor?.id)) {
            pushReason(blockedReasons, "humanAttestationActorMissingOrInvalid");
        } else {
            if (attestation.actor.id !== verification.reviewedBy) pushReason(blockedReasons, "humanAttestationReviewerMismatch");
            if (attestation.attestedAt !== verification.reviewedAt) pushReason(blockedReasons, "humanAttestationTimestampMismatch");
        }
        if (attestation.decision !== "approve") pushReason(blockedReasons, "humanAttestationNotApproved");
    } else if (mode === "deterministicConsensus") {
        if (verification.reviewedBy !== undefined && verification.reviewedBy !== null && verification.reviewedBy !== "") pushReason(blockedReasons, "deterministicReviewerFieldForbidden");
        if (verification.reviewedAt !== undefined && verification.reviewedAt !== null && verification.reviewedAt !== "") pushReason(blockedReasons, "deterministicReviewTimestampForbidden");
        if (attestation.type !== "deterministicConsensus" || attestation.actor?.kind !== "machine" || !nonEmptyString(attestation.actor?.id)) {
            pushReason(blockedReasons, "deterministicAttestationActorMissingOrInvalid");
        }
        if (!nonEmptyString(attestation.eligibilityCertificateId) || !validSha256(attestation.sourceBundleDigest)) {
            pushReason(blockedReasons, "deterministicAttestationCertificateBindingMissingOrInvalid");
        }
    }
    return { ready: blockedReasons.length === 0, blockedReasons: unique(blockedReasons), verificationMode: mode || null };
}

/**
 * Certificate validation is deliberately shape-light at the integration
 * boundary.  The certificate must bind the candidate, claim, mode, exact
 * attestation, and comparison digest; providers may add envelope fields.
 */
function assessEligibilityCertificate({ candidate = {}, field = "", claim = {}, verification = {}, attestation, certificate } = {}) {
    const blockedReasons = [];
    const subjectId = subjectIdFor(candidate);
    const mode = verification.verificationMode;
    if (!isObject(certificate)) {
        return { ready: false, blockedReasons: ["eligibilityCertificateMissing"] };
    }
    if (certificate.schemaVersion !== CERTIFICATE_SCHEMA_VERSION) pushReason(blockedReasons, "eligibilityCertificate:schemaVersionInvalid");
    if (certificate.status !== "eligible") pushReason(blockedReasons, "eligibilityCertificate:statusNotEligible");
    ["certificateId", "verificationMode", "issuedAt"].forEach((fieldName) => {
        if (!nonEmptyString(certificate[fieldName])) pushReason(blockedReasons, `eligibilityCertificate:${fieldName}Missing`);
    });
    if (certificate.verificationMode !== mode) pushReason(blockedReasons, "eligibilityCertificate:modeMismatch");
    if (!validDateTime(certificate.issuedAt)) pushReason(blockedReasons, "eligibilityCertificate:issuedAtInvalid");
    if (mode === "human") {
        ["subjectId", "claimField", "attestationId"].forEach((fieldName) => {
            if (!nonEmptyString(certificate[fieldName])) pushReason(blockedReasons, `eligibilityCertificate:${fieldName}Missing`);
        });
        if (certificate.subjectId !== subjectId) pushReason(blockedReasons, "eligibilityCertificate:subjectMismatch");
        if (certificate.claimField !== field) pushReason(blockedReasons, "eligibilityCertificate:claimFieldMismatch");
        if (!isObject(attestation) || certificate.attestationId !== attestation.attestationId) pushReason(blockedReasons, "eligibilityCertificate:attestationMismatch");
        const comparisonDigest = attestation?.comparison?.digests?.[field];
        if (!validSha256(certificate.comparisonDigest) || certificate.comparisonDigest !== comparisonDigest) pushReason(blockedReasons, "eligibilityCertificate:comparisonDigestMismatch");
        if (certificate.scope !== undefined && (!isObject(certificate.scope) || certificate.scope.subjectId !== subjectId || certificate.scope.claimField !== field)) {
            pushReason(blockedReasons, "eligibilityCertificate:scopeMismatch");
        }
        return { ready: blockedReasons.length === 0, blockedReasons: unique(blockedReasons) };
    }
    ["candidateId", "claimId", "field", "targetGameVersion", "currentGameVersion", "versionSnapshotId", "sourceBundleDigest"].forEach((fieldName) => {
        if (!nonEmptyString(certificate[fieldName])) pushReason(blockedReasons, `eligibilityCertificate:${fieldName}Missing`);
    });
    if (certificate.candidateId !== subjectId) pushReason(blockedReasons, "eligibilityCertificate:subjectMismatch");
    if (certificate.targetGameVersion !== certificate.currentGameVersion) pushReason(blockedReasons, "eligibilityCertificate:sourceGameVersionNotCurrent");
    if (certificate.field !== field) pushReason(blockedReasons, "eligibilityCertificate:claimFieldMismatch");
    if (nonEmptyString(claim.id) && certificate.claimId !== claim.id) pushReason(blockedReasons, "eligibilityCertificate:claimIdMismatch");
    if (certificate.authority?.id !== "genshinSourceCatalogContractAudit" || !nonEmptyString(certificate.authority?.version)
        || !validSha256(certificate.authority?.sourceCatalogDigest) || !validSha256(certificate.authority?.sourceFamilyRegistryDigest)
        || !validSha256(certificate.authority?.providerPolicyDigest)) pushReason(blockedReasons, "eligibilityCertificate:authorityMissingOrInvalid");
    if (certificate.policy?.status !== "reusable" || certificate.policy?.automaticVerificationAllowed !== true) pushReason(blockedReasons, "eligibilityCertificate:pairNotReusable");
    if (!isObject(certificate.scope) || certificate.scope.candidateId !== subjectId || certificate.scope.claimId !== certificate.claimId
        || certificate.scope.field !== field || !validSha256(certificate.scope.valueDigest)) pushReason(blockedReasons, "eligibilityCertificate:scopeMismatch");
    if (certificate.requiredFieldCoverage?.status !== "complete" || !Array.isArray(certificate.requiredFieldCoverage?.requiredFields)
        || !certificate.requiredFieldCoverage.requiredFields.includes(field) || !validSha256(certificate.requiredFieldCoverage?.digest)) pushReason(blockedReasons, "eligibilityCertificate:fieldCoverageIncomplete");
    if (certificate.comparison?.status !== "match" || !validSha256(certificate.comparison?.claimValueDigest)
        || certificate.comparison.claimValueDigest !== certificate.scope?.valueDigest || !isObject(certificate.comparison?.sourceFieldDigests)) pushReason(blockedReasons, "eligibilityCertificate:comparisonMissingOrInvalid");
    const sources = Array.isArray(certificate.sources) ? certificate.sources : [];
    const providerIds = unique(sources.map((source) => source?.providerId));
    const familyIds = unique(sources.map((source) => source?.familyId));
    if (sources.length < 2 || providerIds.length < 2 || familyIds.length < 2) pushReason(blockedReasons, "eligibilityCertificate:independentSourcesInsufficient");
    sources.forEach((source, index) => {
        const valid = isObject(source) && nonEmptyString(source.sourceRef) && nonEmptyString(source.providerId)
            && nonEmptyString(source.familyId) && source.lineageStatus === "declared" && nonEmptyString(source.revision)
            && validSha256(source.rawArtifactDigest) && validSha256(source.fieldDigest)
            && source.revisionPinned === true && source.rawArtifactDigestBound === true && source.fieldScoped === true
            && source.exactField === true && source.fieldDigestMatches === true && source.strictGameVersionBinding === true
            && source.supportsClaimValue === true && source.gameVersion === certificate.targetGameVersion
            && certificate.comparison?.sourceFieldDigests?.[source.sourceRef] === source.fieldDigest;
        if (!valid) pushReason(blockedReasons, `eligibilityCertificate:sources[${index}]:strictEvidenceInvalid`);
    });
    if (!validSha256(certificate.sourceBundleDigest)) pushReason(blockedReasons, "eligibilityCertificate:sourceBundleDigestInvalid");
    if (!isObject(certificate.normalization) || !nonEmptyString(certificate.normalization.id)
        || !nonEmptyString(certificate.normalization.version) || !validSha256(certificate.normalization.digest)) pushReason(blockedReasons, "eligibilityCertificate:normalizationMissingOrInvalid");
    if (certificate.stale !== false || certificate.invalidated !== false || (certificate.blockedReasons || []).length
        || certificate.canonicalEligibility !== false) pushReason(blockedReasons, "eligibilityCertificate:notFreshOrStillBlocked");
    if (!isObject(attestation) || attestation.eligibilityCertificateId !== certificate.certificateId
        || attestation.sourceBundleDigest !== certificate.sourceBundleDigest
        || attestation.versionSnapshotId !== certificate.versionSnapshotId) pushReason(blockedReasons, "eligibilityCertificate:attestationBindingMismatch");
    return { ready: blockedReasons.length === 0, blockedReasons: unique(blockedReasons) };
}

function assessVerificationGate(candidate = {}) {
    const verification = isObject(candidate.verification) ? candidate.verification : {};
    const claims = candidate.claims || verification.claims || {};
    const subjectId = subjectIdFor(candidate);
    const mode = verification.verificationMode;
    const blockedReasons = [];
    if (!VERIFICATION_MODES.includes(mode)) blockedReasons.push("verificationModeMissingOrInvalid");
    if (!subjectId) blockedReasons.push("verificationSubjectMissing");
    const claimResults = Object.entries(claims).map(([field, claim]) => {
        const claimKind = inferClaimKind(field, claim);
        if (claimKind !== "externalFactual") {
            const internalResult = evidenceResult({ field, ...claim });
            return {
                field,
                claimKind,
                attestation: { ready: true, blockedReasons: [], notRequired: true },
                certificate: { ready: true, blockedReasons: [], notRequired: true },
                internalEvidence: internalResult,
                ready: internalResult.machineEvidenceReady
            };
        }
        const attestationResult = assessVerificationAttestation({ candidate, field, claim, verification, attestation: claimAttestation(claim) });
        const certificateResult = assessEligibilityCertificate({ candidate, field, claim, verification, attestation: claimAttestation(claim), certificate: claimCertificate(claim) });
        return { field, claimKind, attestation: attestationResult, certificate: certificateResult, ready: attestationResult.ready && certificateResult.ready };
    });
    claimResults.filter((result) => !result.ready).forEach((result) => {
        result.attestation.blockedReasons.forEach((reason) => pushReason(blockedReasons, `claim:${result.field}:${reason}`));
        result.certificate.blockedReasons.forEach((reason) => pushReason(blockedReasons, `claim:${result.field}:${reason}`));
        (result.internalEvidence?.blockedReasons || []).forEach((reason) => pushReason(blockedReasons, `claim:${result.field}:${reason}`));
    });
    return { ready: blockedReasons.length === 0, verificationMode: mode || null, subjectId, claims: claimResults, blockedReasons: unique(blockedReasons) };
}

function evidenceResult(claim = {}) {
    const kind = inferClaimKind(claim.field || "", claim);
    const blockedReasons = [];
    const unresolved = (claim.discrepancies || []).filter((item) => item && item.resolved !== true);
    if (unresolved.length) blockedReasons.push("unresolvedDiscrepancy");

    if (kind === "notApplicable") {
        if ((claim.machineEvidence?.applicabilityDetermined ?? claim.applicabilityDetermined) !== true) blockedReasons.push("applicabilityNotDetermined");
    } else if (kind === "externalFactual") {
        const evidence = (claim.evidence || []).filter((item) => item?.supportsClaimValue === true);
        const providers = unique(evidence.map((item) => item.provider));
        const groups = unique(evidence.map((item) => item.independenceGroup));
        const versions = unique(evidence.map((item) => item.gameVersion));
        if (evidence.length < 2) blockedReasons.push("externalEvidenceInsufficient");
        if (providers.length < 2) blockedReasons.push("providerIndependenceInsufficient");
        if (groups.length < 2) blockedReasons.push("independenceGroupInsufficient");
        if (evidence.some((item) => item.gameVersionVerified !== true || !item.gameVersion)) blockedReasons.push("strictGameVersionMissing");
        if (versions.length !== 1) blockedReasons.push("gameVersionConflict");
        if (claim.comparison?.status !== "match") blockedReasons.push("fieldComparisonNotMatched");
    } else {
        const provenance = claim.machineEvidence?.codeProvenance || claim.codeProvenance;
        const tests = claim.machineEvidence?.focusedTests || claim.focusedTests || [];
        if (!provenance || provenance.deterministic !== true || !provenance.path || !provenance.locator) {
            blockedReasons.push("codeProvenanceMissing");
        }
        if (!tests.length || tests.some((item) => item?.status !== "passed" || !item.id)) blockedReasons.push("focusedTestMissingOrFailed");
        if (kind === "mappingMaterialization" && (claim.machineEvidence?.sourceInputsVerified ?? claim.sourceInputsVerified) !== true) blockedReasons.push("mappingSourceInputsUnverified");
    }

    return {
        claimKind: kind,
        machineEvidenceReady: blockedReasons.length === 0,
        blockedReasons: unique(blockedReasons)
    };
}

function assessMachineEvidence(candidate = {}) {
    const claims = Object.entries(candidate.claims || {}).map(([field, claim]) => ({
        field,
        ...evidenceResult({ field, ...claim })
    }));
    const unresolved = (candidate.discrepancies || []).filter((item) => item && item.resolved !== true);
    const blockingClaims = claims.filter((claim) => !claim.machineEvidenceReady);
    const blockedReasons = unique([
        ...blockingClaims.flatMap((claim) => claim.blockedReasons.map((reason) => `claim:${claim.field}:${reason}`)),
        ...(unresolved.length ? ["candidate:unresolvedDiscrepancy"] : []),
        candidate.reviewPacketAvailable === true ? null : "reviewPacketUnavailable"
    ]);
    return {
        machineEvidenceReady: blockedReasons.length === 0,
        canonicalEligibility: false,
        claims,
        blockedReasons,
        selfApprovalForbidden: true
    };
}

function assessCanonicalEligibility(candidate = {}) {
    const machine = assessMachineEvidence(candidate);
    const verification = candidate.verification || {};
    const blockedReasons = [...machine.blockedReasons];
    if (verification.status !== "verified") blockedReasons.push("verificationNotComplete");
    if (verification.sourceAgreement !== "agreed") blockedReasons.push("sourceAgreementNotAgreed");
    const verificationGate = assessVerificationGate(candidate);
    verificationGate.blockedReasons.forEach((reason) => blockedReasons.push(reason));
    if (candidate.interpretation?.method === "aiAssisted") {
        if (verification.verificationMode !== "human" || candidate.interpretation?.author === verification.reviewedBy) {
            blockedReasons.push("aiSemanticInterpretationNotEligible");
        }
        blockedReasons.push("aiReviewNotIndependent");
    }
    Object.entries(candidate.claims || {}).forEach(([field, claim]) => {
        if (!['verified', 'notApplicable'].includes(claim.status)) blockedReasons.push(`claim:${field}:verificationIncomplete`);
    });
    return {
        machineEvidenceReady: machine.machineEvidenceReady,
        canonicalEligibility: unique(blockedReasons).length === 0,
        blockedReasons: unique(blockedReasons),
        selfApprovalForbidden: true,
        verificationMode: verificationGate.verificationMode,
        verificationGate
    };
}

function stateFor(candidate = {}, { productionCanonical = false } = {}) {
    const machine = assessMachineEvidence(candidate);
    const canonical = assessCanonicalEligibility(candidate);
    if (productionCanonical && canonical.canonicalEligibility) return "productionCanonical";
    if (canonical.canonicalEligibility) return "canonicalEligible";
    if (candidate.verification?.status === "verified" && candidate.verification?.verificationMode === "human") return "humanReviewed";
    if (candidate.verification?.verificationMode === "deterministicConsensus" && machine.machineEvidenceReady) return "machineEvidenceComplete";
    if (machine.machineEvidenceReady) return "humanReviewReady";
    if (Object.keys(candidate.claims || {}).length) return "rawEvidence";
    return "rawEvidence";
}

function canTransition(from, to) {
    const fromIndex = STATES.indexOf(from);
    const toIndex = STATES.indexOf(to);
    return fromIndex >= 0 && toIndex >= 0 && toIndex >= fromIndex && toIndex - fromIndex <= 1;
}

module.exports = {
    CLAIM_KINDS,
    VERIFICATION_MODES,
    ATTESTATION_SCHEMA_VERSION,
    CERTIFICATE_SCHEMA_VERSION,
    STATES,
    assessVerificationAttestation,
    assessEligibilityCertificate,
    assessVerificationGate,
    assessCanonicalEligibility,
    assessMachineEvidence,
    evidenceResult,
    inferClaimKind,
    canTransition,
    stateFor
};
