(function () {
    "use strict";

    const VERIFIED = "verified";
    const VERIFICATION_MODES = Object.freeze(["human", "deterministicConsensus"]);
    const ATTESTATION_SCHEMA_VERSION = 1;
    const CERTIFICATE_SCHEMA_VERSION = 1;
    const SHA256 = /^[a-f0-9]{64}$/;
    const CLAIM_KINDS = Object.freeze({
        externalFactual: "externalFactual",
        internalRuntimeRoute: "internalRuntimeRoute",
        mappingMaterialization: "mappingMaterialization",
        derivedDeterministic: "derivedDeterministic",
        notApplicable: "notApplicable"
    });

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

    function unique(values) {
        return [...new Set((values || []).filter((value) => value !== null && value !== undefined && value !== ""))];
    }

    function pushReason(reasons, reason) {
        if (reason && !reasons.includes(reason)) reasons.push(reason);
    }

    function subjectIdFor(subject, fallback = "") {
        return String(subject?.subjectId || subject?.id || subject?.specId || fallback || "");
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

    function assessVerificationAttestation({ subject, field = "", claim = {}, verification = {}, attestation } = {}) {
        const blockedReasons = [];
        const mode = verification.verificationMode;
        const subjectId = subjectIdFor(subject);
        if (!VERIFICATION_MODES.includes(mode)) pushReason(blockedReasons, "verificationModeMissingOrInvalid");
        if (!subjectId) pushReason(blockedReasons, "attestation:subjectMissing");
        if (!isObject(attestation)) return { ready: false, blockedReasons: ["verificationAttestationMissing"], verificationMode: mode || null };
        if (attestation.schemaVersion !== ATTESTATION_SCHEMA_VERSION) pushReason(blockedReasons, "attestation:schemaVersionInvalid");
        ["attestationId", "subjectId", "claimField", "attestedAt"].forEach((name) => {
            if (!nonEmptyString(attestation[name])) pushReason(blockedReasons, `attestation:${name}Missing`);
        });
        if (attestation.subjectId !== subjectId) pushReason(blockedReasons, "attestation:subjectMismatch");
        if (attestation.claimField !== field) pushReason(blockedReasons, "attestation:claimFieldMismatch");
        if (attestation.verificationMode !== mode) pushReason(blockedReasons, "attestation:modeMismatch");
        if (!validDateTime(attestation.attestedAt)) pushReason(blockedReasons, "attestation:attestedAtInvalid");
        if (!isObject(attestation.engine) || !nonEmptyString(attestation.engine.name) || !nonEmptyString(attestation.engine.version)) pushReason(blockedReasons, "attestation:engineMissingOrInvalid");
        if (!isObject(attestation.policy) || !nonEmptyString(attestation.policy.id) || !nonEmptyString(attestation.policy.version) || !validSha256(attestation.policy.digest)) pushReason(blockedReasons, "attestation:policyMissingOrInvalid");
        if (!Array.isArray(attestation.requiredFields) || !attestation.requiredFields.includes(field)) pushReason(blockedReasons, "attestation:requiredFieldMissing");
        if (!isObject(attestation.normalization) || !nonEmptyString(attestation.normalization.id) || !nonEmptyString(attestation.normalization.version) || !validSha256(attestation.normalization.digest)) pushReason(blockedReasons, "attestation:normalizationMissingOrInvalid");
        if (!Array.isArray(attestation.exactRevisions) || !attestation.exactRevisions.length) pushReason(blockedReasons, "attestation:exactRevisionsMissing");
        else attestation.exactRevisions.forEach((revision, index) => {
            if (!isObject(revision) || !nonEmptyString(revision.sourceRef) || !nonEmptyString(revision.revision) || !validSha256(revision.fileDigest)) pushReason(blockedReasons, `attestation:exactRevisions[${index}]:invalid`);
        });
        if (!isObject(attestation.gameVersion) || !nonEmptyString(attestation.gameVersion.value) || !Array.isArray(attestation.gameVersion.sourceRefs) || !attestation.gameVersion.sourceRefs.length) pushReason(blockedReasons, "attestation:gameVersionMissingOrInvalid");
        if (!isObject(attestation.comparison) || !["match", "notRequired"].includes(attestation.comparison.status) || !isObject(attestation.comparison.digests) || !validSha256(attestation.comparison.digests[field])) pushReason(blockedReasons, "attestation:comparisonDigestMissingOrInvalid");
        if (attestation.semanticStatus !== undefined && attestation.semanticStatus !== "match") pushReason(blockedReasons, "attestation:semanticStatusNotMatch");
        if (attestation.scopeStatus !== undefined && attestation.scopeStatus !== "match") pushReason(blockedReasons, "attestation:scopeStatusNotMatch");
        if (Array.isArray(claimSourceRefs(claim))) {
            const bundle = Array.isArray(attestation.sourceBundle) ? attestation.sourceBundle : [];
            const bundleRefs = unique(bundle.map((source) => source?.sourceRef || source?.id));
            if (!bundle.length) pushReason(blockedReasons, "attestation:sourceBundleMissing");
            claimSourceRefs(claim).forEach((sourceRef) => {
                if (!bundleRefs.includes(sourceRef)) pushReason(blockedReasons, `attestation:sourceBundleMissing:${sourceRef}`);
            });
            bundle.forEach((source, index) => {
                if (!isObject(source) || !nonEmptyString(source.sourceRef || source.id)) pushReason(blockedReasons, `attestation:sourceBundle[${index}]:sourceRefMissing`);
                else {
                    ["provider", "independenceGroup", "revision", "gameVersion"].forEach((name) => {
                        if (!nonEmptyString(source[name])) pushReason(blockedReasons, `attestation:sourceBundle[${index}]:${name}Missing`);
                    });
                    if (!validSha256(source.fileDigest || source.digest)) pushReason(blockedReasons, `attestation:sourceBundle[${index}]:fileDigestInvalid`);
                }
            });
        }
        if (mode === "human") {
            if (!nonEmptyString(verification.reviewedBy) || !validDateTime(verification.reviewedAt)) pushReason(blockedReasons, "humanReviewMetadataMissingOrInvalid");
            if (attestation.type !== "humanReview" || attestation.actor?.kind !== "human" || !nonEmptyString(attestation.actor?.id)) pushReason(blockedReasons, "humanAttestationActorMissingOrInvalid");
            else {
                if (attestation.actor.id !== verification.reviewedBy) pushReason(blockedReasons, "humanAttestationReviewerMismatch");
                if (attestation.attestedAt !== verification.reviewedAt) pushReason(blockedReasons, "humanAttestationTimestampMismatch");
            }
            if (attestation.decision !== "approve") pushReason(blockedReasons, "humanAttestationNotApproved");
        } else if (mode === "deterministicConsensus") {
            if (verification.reviewedBy !== undefined && verification.reviewedBy !== null && verification.reviewedBy !== "") pushReason(blockedReasons, "deterministicReviewerFieldForbidden");
            if (verification.reviewedAt !== undefined && verification.reviewedAt !== null && verification.reviewedAt !== "") pushReason(blockedReasons, "deterministicReviewTimestampForbidden");
            if (attestation.type !== "deterministicConsensus" || attestation.actor?.kind !== "machine" || !nonEmptyString(attestation.actor?.id)) pushReason(blockedReasons, "deterministicAttestationActorMissingOrInvalid");
            if (!nonEmptyString(attestation.eligibilityCertificateId) || !validSha256(attestation.sourceBundleDigest)) pushReason(blockedReasons, "deterministicAttestationCertificateBindingMissingOrInvalid");
        }
        return { ready: blockedReasons.length === 0, blockedReasons: unique(blockedReasons), verificationMode: mode || null };
    }

    function assessEligibilityCertificate({ subject, field = "", claim = {}, verification = {}, attestation, certificate } = {}) {
        const blockedReasons = [];
        const subjectId = subjectIdFor(subject);
        const mode = verification.verificationMode;
        if (!isObject(certificate)) return { ready: false, blockedReasons: ["eligibilityCertificateMissing"] };
        if (certificate.schemaVersion !== CERTIFICATE_SCHEMA_VERSION) pushReason(blockedReasons, "eligibilityCertificate:schemaVersionInvalid");
        if (certificate.status !== "eligible") pushReason(blockedReasons, "eligibilityCertificate:statusNotEligible");
        ["certificateId", "verificationMode", "issuedAt"].forEach((name) => {
            if (!nonEmptyString(certificate[name])) pushReason(blockedReasons, `eligibilityCertificate:${name}Missing`);
        });
        if (certificate.verificationMode !== mode) pushReason(blockedReasons, "eligibilityCertificate:modeMismatch");
        if (!validDateTime(certificate.issuedAt)) pushReason(blockedReasons, "eligibilityCertificate:issuedAtInvalid");
        if (mode === "human") {
            ["subjectId", "claimField", "attestationId"].forEach((name) => {
                if (!nonEmptyString(certificate[name])) pushReason(blockedReasons, `eligibilityCertificate:${name}Missing`);
            });
            if (certificate.subjectId !== subjectId) pushReason(blockedReasons, "eligibilityCertificate:subjectMismatch");
            if (certificate.claimField !== field) pushReason(blockedReasons, "eligibilityCertificate:claimFieldMismatch");
            if (!isObject(attestation) || certificate.attestationId !== attestation.attestationId) pushReason(blockedReasons, "eligibilityCertificate:attestationMismatch");
            if (!validSha256(certificate.comparisonDigest) || certificate.comparisonDigest !== attestation?.comparison?.digests?.[field]) pushReason(blockedReasons, "eligibilityCertificate:comparisonDigestMismatch");
            if (certificate.scope !== undefined && (!isObject(certificate.scope) || certificate.scope.subjectId !== subjectId || certificate.scope.claimField !== field)) pushReason(blockedReasons, "eligibilityCertificate:scopeMismatch");
            return { ready: blockedReasons.length === 0, blockedReasons: unique(blockedReasons) };
        }
        ["candidateId", "claimId", "field", "targetGameVersion", "currentGameVersion", "versionSnapshotId", "sourceBundleDigest"].forEach((name) => {
            if (!nonEmptyString(certificate[name])) pushReason(blockedReasons, `eligibilityCertificate:${name}Missing`);
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
        if (sources.length < 2 || unique(sources.map((source) => source?.providerId)).length < 2 || unique(sources.map((source) => source?.familyId)).length < 2) pushReason(blockedReasons, "eligibilityCertificate:independentSourcesInsufficient");
        sources.forEach((source, index) => {
            const valid = isObject(source) && nonEmptyString(source.sourceRef) && nonEmptyString(source.providerId) && nonEmptyString(source.familyId)
                && source.lineageStatus === "declared" && nonEmptyString(source.revision) && validSha256(source.rawArtifactDigest) && validSha256(source.fieldDigest)
                && source.revisionPinned === true && source.rawArtifactDigestBound === true && source.fieldScoped === true && source.exactField === true
                && source.fieldDigestMatches === true && source.strictGameVersionBinding === true && source.supportsClaimValue === true
                && source.gameVersion === certificate.targetGameVersion && certificate.comparison?.sourceFieldDigests?.[source.sourceRef] === source.fieldDigest;
            if (!valid) pushReason(blockedReasons, `eligibilityCertificate:sources[${index}]:strictEvidenceInvalid`);
        });
        if (!validSha256(certificate.sourceBundleDigest)) pushReason(blockedReasons, "eligibilityCertificate:sourceBundleDigestInvalid");
        if (!isObject(certificate.normalization) || !nonEmptyString(certificate.normalization.id) || !nonEmptyString(certificate.normalization.version)
            || !validSha256(certificate.normalization.digest)) pushReason(blockedReasons, "eligibilityCertificate:normalizationMissingOrInvalid");
        if (certificate.stale !== false || certificate.invalidated !== false || (certificate.blockedReasons || []).length || certificate.canonicalEligibility !== false) pushReason(blockedReasons, "eligibilityCertificate:notFreshOrStillBlocked");
        if (!isObject(attestation) || attestation.eligibilityCertificateId !== certificate.certificateId || attestation.sourceBundleDigest !== certificate.sourceBundleDigest || attestation.versionSnapshotId !== certificate.versionSnapshotId) pushReason(blockedReasons, "eligibilityCertificate:attestationBindingMismatch");
        return { ready: blockedReasons.length === 0, blockedReasons: unique(blockedReasons) };
    }

    function assessClaimEligibilityProof(subject, field, claim, verification) {
        const attestation = claimAttestation(claim);
        const certificate = claimCertificate(claim);
        const attestationResult = assessVerificationAttestation({ subject, field, claim, verification, attestation });
        const certificateResult = assessEligibilityCertificate({ subject, field, claim, verification, attestation, certificate });
        return {
            ready: attestationResult.ready && certificateResult.ready,
            blockedReasons: unique([
                ...attestationResult.blockedReasons.map((reason) => `claim:${field}:${reason}`),
                ...certificateResult.blockedReasons.map((reason) => `claim:${field}:${reason}`)
            ]),
            attestation: attestationResult,
            certificate: certificateResult
        };
    }

    function assessVerificationGate(subject, verification = {}, claims = {}) {
        const blockedReasons = [];
        if (!VERIFICATION_MODES.includes(verification.verificationMode)) blockedReasons.push("verificationModeMissingOrInvalid");
        if (!subjectIdFor(subject)) blockedReasons.push("verificationSubjectMissing");
        const claimResults = Object.entries(claims).map(([field, claim]) => {
            const kind = claim?.claimKind || (claim?.status === "notApplicable" ? CLAIM_KINDS.notApplicable : CLAIM_KINDS.externalFactual);
            if (kind !== CLAIM_KINDS.externalFactual) {
                const machine = assessClaimMachineEvidence(claim);
                return {
                    ready: machine.ready,
                    blockedReasons: machine.ready ? [] : [`claim:${field}:${machine.reason}`],
                    internalEvidence: machine
                };
            }
            return assessClaimEligibilityProof(subject, field, claim, verification);
        });
        claimResults.forEach((result) => result.blockedReasons.forEach((reason) => pushReason(blockedReasons, reason)));
        return { ready: blockedReasons.length === 0, verificationMode: verification.verificationMode || null, blockedReasons: unique(blockedReasons), claims: claimResults };
    }

    function assessRuntimeEligibility(record, runtimeContext = {}) {
        const provenance = record?.provenance;
        if (!provenance) {
            return {
                eligible: true,
                mode: "legacyCompatible",
                reason: "Legacy record has no v2 provenance and remains on the compatibility path."
            };
        }

        const verification = provenance.verification || {};
        const interpretation = provenance.interpretation || {};
        if (verification.status !== VERIFIED) {
            return {
                eligible: false,
                mode: "v2",
                reason: `Structured interpretation is ${verification.status || "unreviewed"}.`
            };
        }
        if (!Array.isArray(provenance.sourceRefs) || new Set(provenance.sourceRefs).size < 2) {
            return { eligible: false, mode: "v2", reason: "Verified record has fewer than two source references." };
        }
        if (verification.sourceAgreement !== "agreed" || Number(verification.independentSourceCount || 0) < 2) {
            return { eligible: false, mode: "v2", reason: "Verified record has no independent two-source agreement." };
        }
        if (!Array.isArray(provenance.independenceGroups) || new Set(provenance.independenceGroups).size < 2) {
            return { eligible: false, mode: "v2", reason: "Verified record has fewer than two independent source groups." };
        }
        if (!provenance.gameVersion) {
            return { eligible: false, mode: "v2", reason: "Verified record has no game version." };
        }
        if (runtimeContext.currentGameVersion && provenance.gameVersion !== runtimeContext.currentGameVersion) {
            return { eligible: false, mode: "v2", reason: `Verified record game version ${provenance.gameVersion} does not match current ${runtimeContext.currentGameVersion}.` };
        }
        const claims = verification.claims || provenance.claims || {};
        const verificationGate = assessVerificationGate({ id: provenance.specId || record.id }, verification, claims);
        if (!verificationGate.ready) {
            return { eligible: false, mode: "v2", reason: verificationGate.blockedReasons.join(", ") };
        }
        if (interpretation.method === "aiAssisted") {
            return { eligible: false, mode: "v2", reason: "AI-assisted interpretation was not independently reviewed." };
        }
        return { eligible: true, mode: "v2", reason: "Verified structured record." };
    }

    function assessSpecRuntimeEligibility(spec, sourceRecords = {}) {
        const verification = spec?.verification || {};
        const sourceRefs = Array.isArray(spec?.sourceRefs) ? spec.sourceRefs : [];
        const claims = Object.values(verification.claims || {});
        const blockedReasons = [];
        if (verification.status !== VERIFIED) blockedReasons.push(`verification:${verification.status || "unreviewed"}`);
        if (verification.sourceAgreement !== "agreed") blockedReasons.push(`sourceAgreement:${verification.sourceAgreement || "unknown"}`);
        if (new Set(sourceRefs).size < 2) blockedReasons.push("independentSources:insufficient");
        const sourceFor = (ref) => sourceRecords instanceof Map ? sourceRecords.get(ref) : sourceRecords?.[ref];
        const resolvedSources = sourceRefs.map(sourceFor).filter(Boolean);
        if (resolvedSources.length !== sourceRefs.length) blockedReasons.push("sourceRecords:unresolved");
        const sourceProviders = new Set(resolvedSources.map((source) => source.provider).filter(Boolean));
        if (sourceProviders.size < 2) blockedReasons.push("independentProviders:insufficient");
        if (resolvedSources.some((source) => typeof source.independenceGroup !== "string" || !source.independenceGroup)) {
            blockedReasons.push("independenceGroups:missing");
        }
        const sourceIndependenceGroups = new Set(resolvedSources.map((source) => source.independenceGroup).filter(Boolean));
        if (sourceIndependenceGroups.size < 2) blockedReasons.push("independenceGroups:insufficient");
        if (resolvedSources.some((source) => !source.gameVersion)) blockedReasons.push("gameVersion:missing");
        const sourceVersions = new Set(resolvedSources.map((source) => source.gameVersion).filter(Boolean));
        if (sourceVersions.size > 1) blockedReasons.push("gameVersion:mismatch");
        if (!claims.length) blockedReasons.push("claims:missing");
        claims.forEach((claim, index) => {
            if (![VERIFIED, "notApplicable"].includes(claim?.status)) blockedReasons.push(`claim:${index}:${claim?.status || "missing"}`);
            if (claim?.claimKind === CLAIM_KINDS.notApplicable) {
                if (claim.status !== "notApplicable" || claim.machineEvidence?.ready !== true || claim.machineEvidence?.applicabilityDetermined !== true) blockedReasons.push(`claim:${index}:applicabilityNotDetermined`);
                return;
            }
            if (claim?.status === VERIFIED) {
                if ([CLAIM_KINDS.internalRuntimeRoute, CLAIM_KINDS.mappingMaterialization, CLAIM_KINDS.derivedDeterministic].includes(claim.claimKind)) {
                    const evidence = claim.machineEvidence || {};
                    const provenance = evidence.codeProvenance;
                    const tests = evidence.focusedTests || [];
                    if (evidence.ready !== true || (evidence.blockedReasons || []).length || !provenance?.deterministic || !provenance?.path || !provenance?.locator || !/^[a-f0-9]{64}$/.test(provenance?.digest || "") || !tests.length || tests.some((item) => item?.status !== "passed" || !item?.id)) blockedReasons.push(`claim:${index}:internalEvidenceInvalid`);
                    if (claim.claimKind === CLAIM_KINDS.mappingMaterialization && evidence.sourceInputsVerified !== true) blockedReasons.push(`claim:${index}:mappingSourceInputsUnverified`);
                    return;
                }
                const claimRefs = [...new Set(claim.sourceRefs || [])];
                if (claimRefs.length < 2) blockedReasons.push(`claim:${index}:insufficientSources`);
                const claimSources = claimRefs.map(sourceFor).filter(Boolean);
                if (claimSources.length !== claimRefs.length) blockedReasons.push(`claim:${index}:unresolvedSources`);
                if (new Set(claimSources.map((source) => source.provider).filter(Boolean)).size < 2) {
                    blockedReasons.push(`claim:${index}:insufficientProviders`);
                }
                if (claimSources.some((source) => typeof source.independenceGroup !== "string" || !source.independenceGroup)) {
                    blockedReasons.push(`claim:${index}:missingIndependenceGroups`);
                }
                if (new Set(claimSources.map((source) => source.independenceGroup).filter(Boolean)).size < 2) {
                    blockedReasons.push(`claim:${index}:insufficientIndependenceGroups`);
                }
                if (claimSources.some((source) => !source.gameVersion)) blockedReasons.push(`claim:${index}:gameVersionMissing`);
                if (new Set(claimSources.map((source) => source.gameVersion).filter(Boolean)).size > 1) {
                    blockedReasons.push(`claim:${index}:gameVersionMismatch`);
                }
                if (claim.claimKind === CLAIM_KINDS.externalFactual && (claim.machineEvidence?.ready !== true || claim.machineEvidence?.comparison !== "match" || (claim.machineEvidence?.blockedReasons || []).length)) blockedReasons.push(`claim:${index}:externalComparisonIncomplete`);
            }
        });
        const verificationGate = assessVerificationGate(spec, verification, verification.claims || {});
        verificationGate.blockedReasons.forEach((reason) => blockedReasons.push(reason));
        if (spec?.interpretation?.method === "aiAssisted") {
            blockedReasons.push("aiSemanticInterpretationNotEligible");
            blockedReasons.push("aiReview:notIndependent");
        }
        return {
            eligible: blockedReasons.length === 0,
            mode: "v2",
            reason: blockedReasons.length ? blockedReasons.join(", ") : "Verified structured specification.",
            blockedReasons
        };
    }

    function assessClaimMachineEvidence(claim) {
        const kind = claim?.claimKind || (claim?.status === "notApplicable" ? CLAIM_KINDS.notApplicable : CLAIM_KINDS.externalFactual);
        if ((claim?.unresolvedDiscrepancies || []).length) return { ready: false, reason: "unresolvedDiscrepancy" };
        if (kind === CLAIM_KINDS.notApplicable) {
            return { ready: (claim?.machineEvidence?.applicabilityDetermined ?? claim?.applicabilityDetermined) === true, reason: "applicabilityDeterminationRequired" };
        }
        if ([CLAIM_KINDS.internalRuntimeRoute, CLAIM_KINDS.mappingMaterialization, CLAIM_KINDS.derivedDeterministic].includes(kind)) {
            const evidence = claim?.machineEvidence || {};
            const codeProvenance = evidence.codeProvenance || claim?.codeProvenance;
            const focusedTests = evidence.focusedTests || claim?.focusedTests || [];
            const ready = Boolean(codeProvenance?.locator && codeProvenance?.digest && focusedTests.length && focusedTests.every((item) => item?.status === "passed"));
            const sourceInputsVerified = evidence.sourceInputsVerified ?? claim?.sourceInputsVerified;
            return { ready: ready && (kind !== CLAIM_KINDS.mappingMaterialization || sourceInputsVerified === true), reason: "deterministicCodeEvidenceRequired" };
        }
        const evidence = claim?.machineEvidence || {};
        const sources = evidence.sources || claim?.evidence || [];
        const versions = new Set(sources.map((source) => source.gameVersion).filter(Boolean));
        const ready = sources.length >= 2
            && new Set(sources.map((source) => source.provider)).size >= 2
            && new Set(sources.map((source) => source.independenceGroup)).size >= 2
            && sources.every((source) => (source.strictGameVersionBinding === true || source.gameVersionVerified === true) && source.supportsClaimValue === true)
            && versions.size === 1
            && (evidence.comparison || claim?.comparison)?.status === "match";
        return { ready, reason: "strictIndependentDualSourceAgreementRequired" };
    }

    function assessMachineEvidenceReadiness(spec) {
        const claims = Object.values(spec?.verification?.claims || {});
        const claimResults = claims.map(assessClaimMachineEvidence);
        const evidenceComplete = claims.length > 0
            && claimResults.every((result) => result.ready)
            && !(spec?.discrepancies || []).some((item) => item?.status !== "resolved");
        const machineEvidenceReady = evidenceComplete && spec?.reviewPacketAvailable === true;
        return { evidenceComplete, machineEvidenceReady, humanReviewReady: machineEvidenceReady, claimResults };
    }

    function assessCanonicalEligibility(spec) {
        const machine = assessMachineEvidenceReadiness(spec);
        const verification = spec?.verification || {};
        const claims = Object.values(verification.claims || {});
        const verificationGate = assessVerificationGate(spec, verification, verification.claims || {});
        const independentReview = spec?.interpretation?.method !== "aiAssisted";
        const canonicalEligibility = machine.machineEvidenceReady
            && verification.status === VERIFIED
            && verification.sourceAgreement === "agreed"
            && claims.every((claim) => [VERIFIED, "notApplicable"].includes(claim?.status))
            && verificationGate.ready
            && independentReview;
        return { ...machine, canonicalEligibility, productionCanonical: canonicalEligibility && spec?.productionCanonical === true, verificationMode: verificationGate.verificationMode, verificationGate };
    }

    function cloneTalentLevelMapping(value) {
        if (!value || typeof value !== "object") return null;
        return {
            status: String(value.status || "unresolved"),
            source: String(value.source || ""),
            reason: String(value.reason || ""),
            skillDepotId: String(value.skillDepotId || ""),
            rawById: { ...(value.rawById || {}) },
            extraByProudId: { ...(value.extraByProudId || {}) },
            mappedIds: { ...(value.mappedIds || {}) },
            baseByGroup: { ...(value.baseByGroup || {}) },
            extraByGroup: { ...(value.extraByGroup || {}) },
            missingIds: Array.isArray(value.missingIds) ? [...value.missingIds] : [],
            unmappedIds: Array.isArray(value.unmappedIds) ? [...value.unmappedIds] : [],
            conflictingIds: Array.isArray(value.conflictingIds) ? [...value.conflictingIds] : [],
            unmappedExtraIds: Array.isArray(value.unmappedExtraIds) ? [...value.unmappedExtraIds] : []
        };
    }

    // Profile records are shown in the UID detail UI but only a small provider
    // subset is consumed by party modifiers.  Keep the complete mapped record in
    // a separate snapshot so that projection never silently destroys display,
    // artifact-item, extra-talent, or detailed-stat data.  This clone is
    // deliberately JSON-like: functions, symbols, and cyclic references are
    // omitted rather than leaking mutable source objects into PartyState.
    function cloneJsonLike(value, seen = new WeakSet(), depth = 0) {
        if (value === null || typeof value === "string" || typeof value === "boolean") return value;
        if (typeof value === "number") return Number.isFinite(value) ? value : null;
        if (typeof value !== "object" || depth > 32) return undefined;
        if (seen.has(value)) return undefined;
        seen.add(value);
        if (Array.isArray(value)) {
            const result = value.map((item) => cloneJsonLike(item, seen, depth + 1));
            seen.delete(value);
            return result.map((item) => item === undefined ? null : item);
        }
        const result = {};
        Object.keys(value).forEach((key) => {
            const item = cloneJsonLike(value[key], seen, depth + 1);
            if (item !== undefined) result[key] = item;
        });
        seen.delete(value);
        return result;
    }

    function cloneProfileSnapshot(value) {
        if (!value || typeof value !== "object") return null;
        // When called with a CalculationInput/PartyMember, prefer its existing
        // snapshot.  Otherwise capture the supplied mapped profile object.
        const source = value.profileSnapshot && typeof value.profileSnapshot === "object"
            ? value.profileSnapshot
            : value;
        const cloned = cloneJsonLike(source);
        return cloned && typeof cloned === "object" ? cloned : null;
    }

    function validateManifest(manifest) {
        const warnings = [];
        const safeRelativeJsonPath = (value) => {
            const text = String(value || "");
            if (!text || !text.endsWith(".json") || /^[\\/]|^[A-Za-z]:/.test(text)) return false;
            return !text.split(/[\\/]+/).some((segment) => segment === ".." || segment === ".");
        };
        if (manifest?.schemaVersion !== 2) warnings.push("data-v2-manifest schemaVersion must be 2.");
        if (manifest?.status !== "pilot") warnings.push("data-v2-manifest must remain pilot until all runtime records are verified.");
        ["calculationGate", "aiPolicy", "legacyPolicy"].forEach((key) => {
            if (typeof manifest?.policy?.[key] !== "string" || !manifest.policy[key].trim()) warnings.push(`data-v2-manifest policy.${key} is missing.`);
        });
        const datasets = manifest?.datasets;
        if (!datasets || typeof datasets !== "object" || Array.isArray(datasets)) {
            warnings.push("data-v2-manifest has no datasets.");
        } else {
            ["sourceCatalog", "versionBaseline", "upstreamVersionHead", "versionTransition", "characters", "characterTalents", "characterConstellations", "behaviorBatches", "canonicalRuntime", "weaponV2Candidates", "artifactV2Candidates"].forEach((key) => {
                if (!datasets[key]) warnings.push(`data-v2-manifest datasets.${key} is missing.`);
            });
            Object.entries(datasets).forEach(([key, dataset]) => {
                if (!dataset || typeof dataset !== "object" || Array.isArray(dataset)) {
                    warnings.push(`data-v2-manifest datasets.${key} must be an object.`);
                    return;
                }
                if (!safeRelativeJsonPath(dataset.path)) warnings.push(`data-v2-manifest datasets.${key}.path is unsafe or invalid.`);
                if (!["raw", "spec", "runtime"].includes(dataset.layer)) warnings.push(`data-v2-manifest datasets.${key}.layer is invalid.`);
                if (typeof dataset.authority !== "string" || !dataset.authority.trim()) warnings.push(`data-v2-manifest datasets.${key}.authority is missing.`);
                if (dataset.generator !== undefined && (typeof dataset.generator !== "string" || !dataset.generator.trim())) warnings.push(`data-v2-manifest datasets.${key}.generator is invalid.`);
            });
            if (datasets.canonicalRuntime && (datasets.canonicalRuntime.layer !== "runtime" || datasets.canonicalRuntime.authority !== "verifiedGenerated")) {
                warnings.push("data-v2-manifest canonicalRuntime must be verifiedGenerated runtime data.");
            }
        }
        const packages = manifest?.characterPackages;
        if (!Array.isArray(packages)) {
            warnings.push("data-v2-manifest has no characterPackages.");
        } else {
            const seen = new Set();
            packages.forEach((packagePath, index) => {
                if (!safeRelativeJsonPath(packagePath)) warnings.push(`data-v2-manifest characterPackages[${index}] is unsafe or invalid.`);
                if (seen.has(packagePath)) warnings.push(`data-v2-manifest characterPackages contains duplicate ${packagePath}.`);
                seen.add(packagePath);
            });
        }
        return warnings;
    }

    function createCalculationInput(character, origin = "manual") {
        const source = origin === "uidProfile" ? "uidProfile" : "manual";
        const talentLevelMapping = cloneTalentLevelMapping(character?.provenance?.talentLevelMapping || character?.talentLevelMapping);
        const profileSnapshot = cloneProfileSnapshot(character);
        return {
            schemaVersion: 2,
            source,
            characterId: String(character?.id || ""),
            level: Number(character?.level || 0),
            constellation: Number(character?.constellation || 0),
            talents: { ...(character?.talents || {}) },
            weapon: character?.weapon ? { ...character.weapon } : null,
            artifacts: Array.isArray(character?.artifacts) ? character.artifacts.map((item) => ({ ...item })) : [],
            stats: { ...(character?.stats || {}) },
            ...(profileSnapshot ? { profileSnapshot } : {}),
            provenance: {
                source,
                importedAt: source === "uidProfile" ? new Date().toISOString() : null,
                rawCharacterId: String(character?.provenance?.rawCharacterId || character?.id || ""),
                includesPersistentBonuses: character?.provenance?.includesPersistentBonuses ?? (source === "uidProfile"),
                additivePolicy: character?.provenance?.additivePolicy || (source === "uidProfile" ? "externalModifiersOnly" : null),
                sourceSnapshot: profileSnapshot ? (profileSnapshot.source || source) : null,
                retainedFromUid: Boolean(profileSnapshot && (profileSnapshot.source || source) === "uidProfile"),
                ...(talentLevelMapping ? { talentLevelMapping } : {})
            }
        };
    }

    function deriveArtifactSetLoadout(artifacts) {
        const counts = new Map();
        const order = [];
        (Array.isArray(artifacts) ? artifacts : []).forEach((artifact) => {
            const setId = String(artifact?.setId || "");
            if (!setId) return;
            if (!counts.has(setId)) order.push(setId);
            counts.set(setId, (counts.get(setId) || 0) + 1);
        });
        const fourPiece = order.find((setId) => counts.get(setId) >= 4);
        if (fourPiece) return { mode: "4pc", setIds: [fourPiece], counts: Object.fromEntries(counts) };
        const twoPiece = order.filter((setId) => counts.get(setId) >= 2);
        if (twoPiece.length >= 2) return { mode: "2pc2pc", setIds: twoPiece.slice(0, 2), counts: Object.fromEntries(counts) };
        if (twoPiece.length === 1) return { mode: "2pc", setIds: twoPiece, counts: Object.fromEntries(counts) };
        return { mode: "none", setIds: [], counts: Object.fromEntries(counts) };
    }

    function createPartyMemberFromCalculationInput(input, slot = 2) {
        const characterId = String(input?.characterId || "");
        if (!characterId) return null;
        const artifactLoadout = deriveArtifactSetLoadout(input?.artifacts);
        const talentLevelMapping = cloneTalentLevelMapping(input?.provenance?.talentLevelMapping || input?.talentLevelMapping);
        const profileSnapshot = cloneProfileSnapshot(input);
        const snapshotSource = profileSnapshot?.source || input?.provenance?.sourceSnapshot || input?.source || "manual";
        return {
            schemaVersion: 2,
            slot: Number(slot) || 2,
            role: "support",
            enabled: true,
            characterId,
            level: Number(input?.level || 0),
            constellation: Number(input?.constellation || 0),
            talentLevels: {
                normal: Number(input?.talents?.normal || 1),
                skill: Number(input?.talents?.skill || 1),
                burst: Number(input?.talents?.burst || 1)
            },
            equipment: {
                weaponId: String(input?.weapon?.id || ""),
                weaponLevel: Number(input?.weapon?.level || 0),
                refinement: Number(input?.weapon?.rank || 1),
                artifactSetMode: artifactLoadout.mode,
                artifactSetIds: artifactLoadout.setIds
            },
            stats: {
                baseHp: Number(input?.stats?.baseHp || 0),
                baseAtk: Number(input?.stats?.baseAtk || 0),
                baseDef: Number(input?.stats?.baseDef || 0),
                hp: Number(input?.stats?.hp || 0),
                atk: Number(input?.stats?.atk || 0),
                def: Number(input?.stats?.def || 0),
                elementalMastery: Number(input?.stats?.elementalMastery || 0)
            },
            // Non-calculation profile data is immutable from the projection's
            // point of view.  Current form edits continue to update the fields
            // above; this snapshot remains the original UID/display payload.
            ...(profileSnapshot ? { profileSnapshot } : {}),
            combatState: { onField: false, hpRatio: 100 },
            buffStates: {},
            provenance: {
                source: input?.source === "uidProfile" ? "uidProfile" : "manual",
                rawCharacterId: String(input?.provenance?.rawCharacterId || characterId),
                importedAt: input?.provenance?.importedAt || null,
                includesPersistentBonuses: input?.provenance?.includesPersistentBonuses ?? (input?.source === "uidProfile"),
                additivePolicy: input?.provenance?.additivePolicy || (input?.source === "uidProfile" ? "externalModifiersOnly" : null),
                sourceSnapshot: snapshotSource,
                retainedFromUid: Boolean(profileSnapshot && snapshotSource === "uidProfile"),
                artifactSetCounts: artifactLoadout.counts,
                ...(talentLevelMapping ? { talentLevelMapping } : {})
            }
        };
    }

    window.GenshinDataContract = {
        CLAIM_KINDS,
        VERIFICATION_MODES,
        ATTESTATION_SCHEMA_VERSION,
        CERTIFICATE_SCHEMA_VERSION,
        assessRuntimeEligibility,
        assessSpecRuntimeEligibility,
        assessClaimMachineEvidence,
        assessMachineEvidenceReadiness,
        assessVerificationAttestation,
        assessEligibilityCertificate,
        assessVerificationGate,
        assessCanonicalEligibility,
        validateManifest,
        cloneProfileSnapshot,
        createCalculationInput,
        deriveArtifactSetLoadout,
        createPartyMemberFromCalculationInput
    };
})();
