"use strict";

/**
 * Deterministically promote a reviewed v2 specification to the small
 * RuntimeModifier contract consumed by the Genshin calculator.
 *
 * This module is deliberately independent from the browser loader.  It is a
 * promotion gate and a lossless structured-field mapper, not a text parser.
 * In particular, a candidate with a missing source record, version, reviewer,
 * field claim, destination, or legacy supersession list is excluded rather
 * than assigned a guessed default.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const verificationStateMachine = require("./genshinVerificationStateMachine.cjs");
const { validateReviewBinding } = require("./genshinReviewBinding.cjs");
const { deriveCurrentGameVersion } = require("./genshinGameVersionPolicy.cjs");
const { auditBaseline } = require("./genshinVersionBaseline.cjs");
const { audit: auditUpstreamVersion } = require("./genshinUpstreamVersionAudit.cjs");
const { buildEntityIdentityAssessments } = require("./genshinCharacterIdentityConsistencyAudit.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultDataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const GENERATOR_VERSION = "genshinCanonicalRuntimeGenerate/2";
const SCHEMA_VERSION = 2;
const ATTESTATION_POLICY = Object.freeze({ id: "genshin-canonical-v2", version: "1" });
const LEGACY_HUMAN_MIGRATION_IDS = new Set([
    "w_12516_stat_1",
    "behavior:10000026:talent:skill",
    "behavior-modifier:10000026:constellation-1-1:1"
]);

const VALID_CALCULATION_SUPPORT = new Set([
    "simple", "toggle", "stack", "custom", "dynamic", "special", "displayOnly", "referenceAttackType"
]);
const VALID_UID_HANDLING = new Set([
    "includedInUidStats", "includedInUidTalentLevels", "conditional", "manualOnly", "displayOnly", "special"
]);
const VALID_BEHAVIOR_OPERATIONS = new Set([
    "add", "multiply", "replace", "reset", "extend", "consume", "setMaximum", "ignoreCooldown", "refresh"
]);
const VALID_BEHAVIOR_PATH = /^\/(timing|execution|lifecycle|energy|elementApplication|triggers|stackRules|stateMachine|actor|enemyCountBehavior)\//;
const VALID_DESTINATION_DATASETS = new Set([
    "weaponModifiers", "artifactSetModifiers", "talentModifiers", "constellationModifiers", "behaviorModifiers"
]);
const VALID_DESTINATION_COLLECTIONS = new Set([
    "modifiers", "twoPiece", "fourPiece", "onePiece", "passive", "constellation"
]);

// These are explicit structured fields understood by the current engine.  A
// field is copied only when it exists in the source EffectSpec; no value is
// synthesized from prose or from a neighbouring field.
const EFFECT_COPY_FIELDS = new Set([
    "value", "valueByRefinement", "valueByRefinementPerStack", "valueByRefinementPerConsumedStack",
    "valueByStack", "valueByCondition", "valueByState", "valuePerStack", "valuePerStackByReaction",
    "effectiveAdditionalValuePerStack", "critRate", "critDamage", "ratio", "maxValue", "scalings",
    "targetEffect", "effect", "resource", "duration", "durationSeconds", "intervalSeconds",
    "cooldown", "cooldownSeconds", "hitCount", "charges", "maxInstances", "stack", "elementApplication",
    "energy", "snapshot", "offField", "area", "reference", "maxReference", "target", "targetOwner",
    "conditionInput", "conditionGroupId", "conditionLabel", "trigger", "relatedElements",
    "relatedElementsByReaction", "relatedElementMap",
    "appliesElements", "unit", "damageRelevance",
    "damageCalculation", "customHandlingRequired", "durationAfterEnteringField", "maxTriggerCount",
    "maxActiveElements", "valueRole", "effectMultiplierPercent", "originalCategory", "stackReferenceId",
    "effectLabel", "probability", "probabilityIncreaseOnFail", "baseValueByReaction", "maxStack",
    "bonusMultiplierPerStack", "valuePerStackByReaction", "note", "stacking", "pieceSlot", "pieceCount",
    "inputPolicy", "automaticDetectability", "legacyModifierId"
]);

// Activation is a separate object in EffectSpec, while the calculator keeps
// those explicit switches at the modifier root.  `condition`,
// `calculationSupport`, and `uidHandling` are normalized below.
const ACTIVATION_COPY_FIELDS = new Set([
    "conditionGroupId", "conditionInput", "conditionLabel", "trigger", "target", "targetOwner",
    "resource", "effect", "customHandlingRequired", "damageCalculation", "damageRelevance", "targetEffect",
    "conditionOptionValue", "durationAfterEnteringField", "relatedElements", "relatedElementsByReaction",
    "relatedElementMap", "appliesElements"
]);

const RESERVED_EFFECT_FIELDS = new Set(["kind", "targets", "activation", "condition", "calculationSupport", "uidHandling"]);

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stableClone(value) {
    if (Array.isArray(value)) return value.map(stableClone);
    if (!isObject(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableClone(value[key])]));
}

function stableJson(value) {
    return JSON.stringify(stableClone(value));
}

function sha256(value) {
    const input = typeof value === "string" ? value : stableJson(value);
    return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function uniqueStrings(value) {
    return [...new Set((Array.isArray(value) ? value : []).filter((item) => typeof item === "string" && item.length))].sort();
}

function asEntries(value) {
    if (Array.isArray(value)) return value.map((item, index) => [String(item?.id || index), item]);
    if (isObject(value)) return Object.entries(value);
    return [];
}

function sourceFor(sourceRecords, id) {
    return sourceRecords instanceof Map ? sourceRecords.get(id) : sourceRecords?.[id];
}

function pushReason(reasons, reason) {
    if (reason && !reasons.includes(reason)) reasons.push(reason);
}

function requireVerifiedFieldClaims(claims, fieldPaths, reasons) {
    const claimSet = isObject(claims) ? claims : {};
    const aliases = {
        "effect.targets": "targets",
        "effect.activation.condition": "activation",
        "effect.value": "value",
        "effect.valueByRefinement": "refinement",
        "effect.unit": "unit"
    };
    fieldPaths.forEach((fieldPath) => {
        const claim = claimSet[fieldPath] || claimSet[aliases[fieldPath]];
        if (claim?.status !== "verified") {
            pushReason(reasons, `claimCoverage:${fieldPath}:verifiedRequired`);
        }
    });
}

function validDateTime(value) {
    return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function evidenceForRefs(refs, sourceRecords, prefix, reasons, options = {}) {
    const uniqueRefs = uniqueStrings(refs);
    const minRefs = options.minRefs ?? 2;
    if (uniqueRefs.length < minRefs) pushReason(reasons, `${prefix}:sourceRefs:insufficient`);
    const resolved = uniqueRefs.map((id) => ({ id, source: sourceFor(sourceRecords, id) }));
    resolved.filter(({ source }) => !isObject(source)).forEach(({ id }) => pushReason(reasons, `${prefix}:sourceRecords:unresolved:${id}`));
    const records = resolved.map(({ source }) => source).filter(isObject);
    const providers = uniqueStrings(records.map((source) => source.provider));
    if (providers.length < 2) pushReason(reasons, `${prefix}:providers:insufficient`);
    resolved.forEach(({ id, source }) => {
        if (isObject(source) && (typeof source.independenceGroup !== "string" || !source.independenceGroup.trim())) {
            pushReason(reasons, `${prefix}:independenceGroup:missing:${id}`);
        }
        if (isObject(source) && (typeof source.text !== "string" || source.integrity?.algorithm !== "sha256"
            || sha256(source.text) !== source.integrity?.digest)) {
            pushReason(reasons, `${prefix}:rawSourceDigestMismatch:${id}`);
        }
    });
    const independenceGroups = uniqueStrings(records.map((source) => source.independenceGroup));
    if (independenceGroups.length < 2) pushReason(reasons, `${prefix}:independenceGroups:insufficient`);
    if (records.some((source) => !source.gameVersion)) pushReason(reasons, `${prefix}:gameVersion:missing`);
    const versions = uniqueStrings(records.map((source) => source.gameVersion));
    if (!versions.length) pushReason(reasons, `${prefix}:gameVersion:missing`);
    if (versions.length > 1) pushReason(reasons, `${prefix}:gameVersion:conflict`);
    return {
        refs: uniqueRefs,
        records,
        providers,
        independenceGroups,
        gameVersions: versions,
        gameVersion: versions.length === 1 ? versions[0] : null
    };
}

function sourceDigest(source) {
    const digest = source?.integrity?.digest;
    if (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)) return null;
    return digest;
}

function sourceRevision(source) {
    if (typeof source?.revision === "string" && source.revision.trim()) return source.revision;
    if (typeof source?.commit === "string" && source.commit.trim()) return source.commit;
    const identifier = String(source?.locator?.identifier || "");
    const gitMatch = identifier.match(/git:([^:]+)/);
    if (gitMatch) return gitMatch[1];
    const digest = sourceDigest(source);
    return digest ? `digest:${digest}` : null;
}

function proofVersionForRefs(refs, sourceRecords, spec) {
    const direct = uniqueStrings(refs.map((id) => sourceFor(sourceRecords, id)?.gameVersion));
    if (direct.length === 1) return direct[0];
    const specVersions = uniqueStrings((spec?.sourceRefs || []).map((id) => sourceFor(sourceRecords, id)?.gameVersion));
    return specVersions.length === 1 ? specVersions[0] : null;
}

function buildLegacyHumanClaimProof(spec, field, claim, sourceRecords) {
    const sourceRefs = uniqueStrings(claim?.sourceRefs?.length ? claim.sourceRefs : spec?.sourceRefs);
    const subjectId = String(spec?.id || "");
    const version = proofVersionForRefs(sourceRefs, sourceRecords, spec);
    if (!subjectId || !sourceRefs.length || !version) return null;
    const sourceBundle = sourceRefs.map((sourceRef) => {
        const source = sourceFor(sourceRecords, sourceRef);
        const digest = sourceDigest(source);
        const revision = sourceRevision(source);
        if (!source || !digest || !revision || !source.provider || !source.independenceGroup) return null;
        return {
            sourceRef,
            provider: source.provider,
            independenceGroup: source.independenceGroup,
            revision,
            fileDigest: digest,
            gameVersion: source.gameVersion || version
        };
    });
    if (sourceBundle.some((source) => !source)) return null;
    const comparisonDigest = sha256({
        subjectId,
        field,
        status: claim?.status,
        claimKind: claim?.claimKind,
        sourceRefs,
        machineEvidence: claim?.machineEvidence || null
    });
    const attestationId = `${subjectId}:${field}:human:attestation`;
    const attestation = {
        schemaVersion: verificationStateMachine.ATTESTATION_SCHEMA_VERSION,
        attestationId,
        verificationMode: "human",
        type: "humanReview",
        subjectId,
        claimField: field,
        attestedAt: spec.verification.reviewedAt,
        actor: { kind: "human", id: spec.verification.reviewedBy },
        decision: "approve",
        engine: { name: "genshinCanonicalRuntimeGenerate.cjs", version: GENERATOR_VERSION },
        policy: { ...ATTESTATION_POLICY, digest: sha256(ATTESTATION_POLICY) },
        sourceBundle,
        requiredFields: [field],
        normalization: {
            id: "genshin-canonical-identity",
            version: "1",
            digest: sha256("genshin-canonical-identity/1")
        },
        exactRevisions: sourceBundle.map((source) => ({
            sourceRef: source.sourceRef,
            revision: source.revision,
            fileDigest: source.fileDigest
        })),
        gameVersion: { value: version, sourceRefs },
        comparison: {
            status: claim?.status === "notApplicable" ? "notRequired" : "match",
            digests: { [field]: comparisonDigest }
        },
        semanticStatus: "match",
        scopeStatus: "match"
    };
    const certificate = {
        schemaVersion: verificationStateMachine.CERTIFICATE_SCHEMA_VERSION,
        certificateId: `${subjectId}:${field}:eligibility`,
        status: "eligible",
        subjectId,
        claimField: field,
        verificationMode: "human",
        attestationId,
        comparisonDigest,
        issuedAt: spec.verification.reviewedAt,
        scope: { subjectId, claimField: field }
    };
    return { verificationAttestation: attestation, eligibilityCertificate: certificate };
}

function verificationForGate(spec, sourceRecords) {
    const verification = clone(spec?.verification || {}) || {};
    const claims = clone(verification.claims || {}) || {};
    const explicitMode = verification.verificationMode;
    const legacyHuman = !explicitMode
        && LEGACY_HUMAN_MIGRATION_IDS.has(String(spec?.id || ""))
        && verification.status === "verified"
        && typeof verification.reviewedBy === "string"
        && typeof verification.reviewedAt === "string";
    const mode = explicitMode || (legacyHuman ? "human" : null);
    if (!mode) return { verification, claims, migrated: false };
    verification.verificationMode = mode;
    if (legacyHuman) {
        Object.entries(claims).forEach(([field, claim]) => {
            if (!isObject(claim)) return;
            if (claim.verificationAttestation && claim.eligibilityCertificate) return;
            const proof = buildLegacyHumanClaimProof(spec, field, claim, sourceRecords);
            if (proof) {
                claim.verificationAttestation = proof.verificationAttestation;
                claim.eligibilityCertificate = proof.eligibilityCertificate;
            }
        });
    }
    verification.claims = claims;
    return { verification, claims, migrated: legacyHuman };
}

function verificationProvenance(gate) {
    const verification = gate.verification || {};
    const claimProofs = Object.fromEntries(Object.entries(verification.claims || {}).sort(([a], [b]) => a.localeCompare(b)).map(([field, claim]) => {
        const attestation = claim?.verificationAttestation || claim?.attestation || null;
        const certificate = claim?.eligibilityCertificate || claim?.certificate || null;
        return [field, {
            claimKind: verificationStateMachine.inferClaimKind(field, claim),
            attestationId: attestation?.attestationId || null,
            certificateId: certificate?.certificateId || null,
            sourceBundleDigest: certificate?.sourceBundleDigest || attestation?.sourceBundleDigest || null,
            certificateAuthority: certificate?.authority?.id || (verification.verificationMode === "human" ? "humanReview" : null)
        }];
    }));
    return {
        status: "verified",
        sourceAgreement: "agreed",
        verificationMode: verification.verificationMode,
        ...(verification.verificationMode === "human" ? { reviewedBy: verification.reviewedBy, reviewedAt: verification.reviewedAt } : {}),
        claims: stableClone(verification.claims || {}),
        claimProofs
    };
}

/**
 * Apply the shared reviewed-spec gate.  The browser DataContract has a
 * compatible gate; this copy additionally returns field-level evidence so a
 * generator report can explain every exclusion without loading a DOM.
 */
function assessVerifiedSpec(spec, sourceRecords, options = {}) {
    const reasons = [];
    if (!isObject(spec)) return { eligible: false, blockedReasons: ["spec:missing"] };
    // This is a veto based on freshly read catalog/source/consumer identity,
    // never a substitute for candidate-by-claim source eligibility.
    const requiresCharacterIdentity = (options.characterIdentityRequired === true && options.requireInterpretation !== false)
        || ["character", "talent", "constellation"].includes(spec.entity?.kind);
    if (requiresCharacterIdentity && (options.characterIdentityRequired === true || typeof options.characterIdentityResolver === "function")) {
        if (typeof options.characterIdentityResolver !== "function") {
            pushReason(reasons, "identity:evidenceUnavailable");
        } else {
            const identity = options.characterIdentityResolver(String(spec.entity?.id || ""));
            if (!identity || identity.blocked !== false) {
                pushReason(reasons, `identity:${identity?.classification || "evidenceUnavailable"}`);
            }
        }
    }
    const normalized = verificationForGate(spec, sourceRecords);
    const verification = normalized.verification;
    if (verification.verificationMode === "human" && !validateReviewBinding({ ...spec, verification }).valid) {
        pushReason(reasons, "verification:humanReviewSubjectDigestMismatch");
    }
    if (verification.status !== "verified") pushReason(reasons, `verification:status:${verification.status || "unreviewed"}`);
    if (verification.sourceAgreement !== "agreed") pushReason(reasons, `sourceAgreement:${verification.sourceAgreement || "unknown"}`);
    const evidence = evidenceForRefs(spec.sourceRefs, sourceRecords, "spec", reasons);
    if (options.versionBaselineCurrent === false) pushReason(reasons, "gameVersion:acceptedBaselineDrift");
    if (options.currentGameVersion && evidence.gameVersion !== options.currentGameVersion) {
        pushReason(reasons, `gameVersion:notCurrent:${evidence.gameVersion || "missing"}->${options.currentGameVersion}`);
    }

    const interpretation = spec.interpretation;
    if (options.requireInterpretation !== false) {
        if (!isObject(interpretation) || !["human", "deterministicParser", "aiAssisted"].includes(interpretation.method)) {
            pushReason(reasons, "interpretation:missingOrUnsupportedMethod");
        } else {
            if (typeof interpretation.author !== "string" || !interpretation.author.trim()) pushReason(reasons, "interpretation:missingAuthor");
            if (typeof interpretation.version !== "string" || !interpretation.version.trim()) pushReason(reasons, "interpretation:missingVersion");
            if (interpretation.method === "aiAssisted") pushReason(reasons, "aiSemanticInterpretationNotEligible");
        }
    }

    const claims = isObject(verification.claims) ? verification.claims : null;
    const claimKindAware = claims && Object.values(claims).some((claim) => typeof claim?.claimKind === "string");
    if (claimKindAware && verification.machineEvidenceReady !== true) pushReason(reasons, "machineEvidence:notReady");
    if ((spec.discrepancies || []).some((item) => item?.resolved !== true) || (verification.discrepancies || []).some((item) => item?.resolved !== true)) {
        pushReason(reasons, "discrepancy:unresolved");
    }
    if (!claims || !Object.keys(claims).length) {
        pushReason(reasons, "claims:missing");
    } else {
        Object.keys(claims).sort().forEach((claimName) => {
            const claim = claims[claimName];
            if (!isObject(claim)) {
                pushReason(reasons, `claim:${claimName}:missing`);
                return;
            }
            if (!["verified", "notApplicable"].includes(claim.status)) {
                pushReason(reasons, `claim:${claimName}:status:${claim.status || "missing"}`);
                return;
            }
            const kind = claim.claimKind;
            const machine = claim.machineEvidence;
            if (kind) {
                if (!isObject(machine) || machine.ready !== true || (machine.blockedReasons || []).length) {
                    pushReason(reasons, `claim:${claimName}:machineEvidenceNotReady`);
                }
                if (kind === "notApplicable") {
                    if (claim.status !== "notApplicable" || machine?.applicabilityDetermined !== true) {
                        pushReason(reasons, `claim:${claimName}:applicabilityNotDetermined`);
                    }
                    return;
                }
                if (["internalRuntimeRoute", "mappingMaterialization", "derivedDeterministic"].includes(kind)) {
                    const provenance = machine?.codeProvenance;
                    const tests = machine?.focusedTests;
                    if (!isObject(provenance) || provenance.deterministic !== true || typeof provenance.path !== "string" || !provenance.path || typeof provenance.locator !== "string" || !provenance.locator || !/^[a-f0-9]{64}$/.test(provenance.digest || "")) {
                        pushReason(reasons, `claim:${claimName}:codeProvenanceMissingOrInvalid`);
                    }
                    if (!Array.isArray(tests) || !tests.length || tests.some((item) => item?.status !== "passed" || typeof item?.id !== "string" || !item.id)) {
                        pushReason(reasons, `claim:${claimName}:focusedTestMissingOrFailed`);
                    }
                    if (kind === "mappingMaterialization" && machine?.sourceInputsVerified !== true) {
                        pushReason(reasons, `claim:${claimName}:mappingSourceInputsUnverified`);
                    }
                    return;
                }
                if (kind !== "externalFactual") {
                    pushReason(reasons, `claim:${claimName}:claimKindUnsupported`);
                    return;
                }
                if (machine?.comparison !== "match") pushReason(reasons, `claim:${claimName}:comparisonNotMatched`);
            }
            const claimReasons = [];
            const claimEvidence = evidenceForRefs(claim.sourceRefs, sourceRecords, `claim:${claimName}`, claimReasons, {
                minRefs: claim.status === "verified" ? 2 : 1
            });
            // notApplicable claims still must point at resolvable evidence, but
            // do not need two independent providers because no field is being
            // asserted from them.
            claimReasons.forEach((reason) => {
                if (claim.status === "notApplicable" && (
                    reason.endsWith(":sourceRefs:insufficient")
                    || reason.endsWith(":providers:insufficient")
                    || reason.endsWith(":independenceGroups:insufficient")
                )) return;
                pushReason(reasons, reason);
            });
            if (claim.status === "verified" && claimEvidence.gameVersions.length !== 1) {
                // evidenceForRefs already records missing/conflicting versions;
                // this branch documents the field-level requirement explicitly.
                pushReason(reasons, `claim:${claimName}:gameVersion:required`);
            }
            if (claim.status === "verified" && options.currentGameVersion && claimEvidence.gameVersion !== options.currentGameVersion) {
                pushReason(reasons, `claim:${claimName}:gameVersion:notCurrent:${claimEvidence.gameVersion || "missing"}->${options.currentGameVersion}`);
            }
        });
    }
    if (verification.verificationMode === "deterministicConsensus") {
        const registry = options.eligibilityCertificates;
        const certificateIndex = registry instanceof Map
            ? registry
            : new Map((Array.isArray(registry) ? registry : registry?.certificates || []).map((certificate) => [certificate.certificateId, certificate]));
        Object.entries(claims || {}).forEach(([field, claim]) => {
            if (verificationStateMachine.inferClaimKind(field, claim) !== "externalFactual") return;
            const embedded = claim?.eligibilityCertificate || claim?.certificate;
            const authoritative = embedded?.certificateId ? certificateIndex.get(embedded.certificateId) : null;
            if (!authoritative) {
                pushReason(reasons, `claim:${field}:authoritativeCertificateMissing`);
                return;
            }
            if (authoritative.status !== "eligible" || stableJson(authoritative) !== stableJson(embedded)) {
                pushReason(reasons, `claim:${field}:authoritativeCertificateMismatch`);
            }
            if (options.versionSnapshotId && authoritative.versionSnapshotId !== options.versionSnapshotId) {
                pushReason(reasons, `claim:${field}:versionSnapshotMismatch`);
            }
            const attestationRegistry = options.deterministicAttestations;
            const attestationIndex = attestationRegistry instanceof Map
                ? attestationRegistry
                : new Map((Array.isArray(attestationRegistry) ? attestationRegistry : attestationRegistry?.attestations || []).map((attestation) => [attestation.attestationId, attestation]));
            const embeddedAttestation = claim?.verificationAttestation || claim?.attestation;
            const authoritativeAttestation = embeddedAttestation?.attestationId ? attestationIndex.get(embeddedAttestation.attestationId) : null;
            if (!authoritativeAttestation || stableJson(authoritativeAttestation) !== stableJson(embeddedAttestation)) {
                pushReason(reasons, `claim:${field}:authoritativeAttestationMissingOrMismatch`);
            }
        });
    }
    const verificationGate = verificationStateMachine.assessVerificationGate({
        ...spec,
        claims: claims || {},
        verification: {
            ...verification,
            claims: claims || {}
        }
    });
    verificationGate.blockedReasons.forEach((reason) => pushReason(reasons, reason));

    return {
        eligible: reasons.length === 0,
        blockedReasons: reasons,
        evidence,
        verification,
        verificationGate,
        migratedLegacyHuman: normalized.migrated
    };
}

function requiredDestination(spec, reasons) {
    const destination = spec?.destination ?? spec?.runtime?.destination;
    if (!isObject(destination)) {
        pushReason(reasons, "destination:missing");
        return null;
    }
    if (!VALID_DESTINATION_DATASETS.has(destination.dataset)) pushReason(reasons, "destination:datasetUnsupported");
    if (typeof destination.entityId !== "string" || !destination.entityId.length) pushReason(reasons, "destination:entityIdMissing");
    if (!VALID_DESTINATION_COLLECTIONS.has(destination.collection)) pushReason(reasons, "destination:collectionUnsupported");
    if (destination.sourceId !== undefined && (typeof destination.sourceId !== "string" || !destination.sourceId.length)) {
        pushReason(reasons, "destination:sourceIdInvalid");
    }
    if (destination.level !== undefined && (!Number.isInteger(destination.level) || destination.level < 1)) {
        pushReason(reasons, "destination:levelInvalid");
    }
    if (destination.dataset === "weaponModifiers" && destination.collection !== "modifiers") {
        pushReason(reasons, "destination:collectionUnsupported");
    }
    if (destination.dataset === "artifactSetModifiers" && !["onePiece", "twoPiece", "fourPiece"].includes(destination.collection)) {
        pushReason(reasons, "destination:collectionUnsupported");
    }
    if (destination.dataset === "talentModifiers") {
        if (destination.collection !== "passive") pushReason(reasons, "destination:collectionUnsupported");
        if (typeof destination.sourceId !== "string" || !destination.sourceId.length) pushReason(reasons, "destination:sourceIdMissing");
        if (destination.level !== undefined) pushReason(reasons, "destination:levelUnexpected");
    }
    if (destination.dataset === "constellationModifiers") {
        if (destination.collection !== "constellation") pushReason(reasons, "destination:collectionUnsupported");
        if (!Number.isInteger(destination.level) || destination.level < 1) pushReason(reasons, "destination:levelMissing");
        if (destination.sourceId !== undefined) pushReason(reasons, "destination:sourceIdUnexpected");
    }
    if (destination.dataset === "behaviorModifiers" && destination.collection !== "modifiers") {
        pushReason(reasons, "destination:collectionUnsupported");
    }
    if (destination.dataset === "weaponModifiers" || destination.dataset === "artifactSetModifiers" || destination.dataset === "behaviorModifiers") {
        if (destination.sourceId !== undefined) pushReason(reasons, "destination:sourceIdUnexpected");
        if (destination.level !== undefined) pushReason(reasons, "destination:levelUnexpected");
    }
    return stableClone(destination);
}

function requiredSupersession(spec, reasons) {
    const supersedes = spec?.supersedesLegacyModifierIds ?? spec?.runtime?.supersedesLegacyModifierIds;
    if (!Array.isArray(supersedes)) {
        pushReason(reasons, "supersedesLegacyModifierIds:missing");
        return null;
    }
    if (supersedes.some((id) => typeof id !== "string" || !id.length)) {
        pushReason(reasons, "supersedesLegacyModifierIds:invalid");
        return null;
    }
    return uniqueStrings(supersedes);
}

function runtimeModifierId(spec, reasons) {
    const ids = spec?.runtime?.modifierIds;
    if (!Array.isArray(ids) || !ids.length) {
        pushReason(reasons, "runtime:modifierIdsMissing");
        return null;
    }
    if (ids.length !== 1 || typeof ids[0] !== "string" || !ids[0].length) {
        pushReason(reasons, "runtime:modifierIdsAmbiguous");
        return null;
    }
    return ids[0];
}

function mapEffectSpec(spec, sourceRecords = {}, options = {}) {
    const gate = assessVerifiedSpec(spec, sourceRecords, { ...options, requireInterpretation: true });
    const reasons = [...gate.blockedReasons];
    const destination = requiredDestination(spec, reasons);
    const supersedesLegacyModifierIds = requiredSupersession(spec, reasons);
    const id = runtimeModifierId(spec, reasons);
    const effect = isObject(spec?.effect) ? spec.effect : null;
    if (!effect) {
        pushReason(reasons, "effect:missing");
    }
    const activation = isObject(effect?.activation) ? effect.activation : null;
    if (!activation) pushReason(reasons, "effect:activationMissing");
    const category = typeof effect?.kind === "string" && effect.kind.length ? effect.kind : null;
    if (!category) pushReason(reasons, "effect:kindMissing");
    const targets = uniqueStrings(effect?.targets);
    if (!targets.length) pushReason(reasons, "effect:targetsMissing");
    const condition = activation?.condition ?? effect?.condition;
    if (condition === undefined || condition === null || condition === "") pushReason(reasons, "effect:conditionMissing");
    const calculationSupport = activation?.calculationSupport ?? effect?.calculationSupport;
    if (!VALID_CALCULATION_SUPPORT.has(calculationSupport)) pushReason(reasons, "effect:calculationSupportMissingOrUnsupported");
    const uidHandling = activation?.uidHandling ?? effect?.uidHandling;
    if (!VALID_UID_HANDLING.has(uidHandling)) pushReason(reasons, "effect:uidHandlingMissingOrUnsupported");
    const valueKeys = [...EFFECT_COPY_FIELDS].filter((field) => Object.prototype.hasOwnProperty.call(effect || {}, field));
    if (!valueKeys.some((field) => [
        "value", "valueByRefinement", "valueByRefinementPerStack", "valueByRefinementPerConsumedStack",
        "valueByStack", "valueByCondition", "valueByState", "valuePerStack", "valuePerStackByReaction",
        "effectiveAdditionalValuePerStack", "critRate", "critDamage", "ratio", "maxValue", "scalings",
        "targetEffect", "effect", "resource"
    ].includes(field))) pushReason(reasons, "effect:valueMissing");

    // Claim keys are canonical JSON paths. Every structured field copied to
    // RuntimeModifier must have its own verified field claim; a broad
    // `activation` claim cannot silently cover condition/support/UID policy.
    const fieldClaims = [
        "effect.kind", "effect.targets",
        activation?.condition !== undefined ? "effect.activation.condition" : "effect.condition",
        activation?.calculationSupport !== undefined ? "effect.activation.calculationSupport" : "effect.calculationSupport",
        activation?.uidHandling !== undefined ? "effect.activation.uidHandling" : "effect.uidHandling",
        spec?.destination !== undefined ? "destination" : "runtime.destination",
        spec?.supersedesLegacyModifierIds !== undefined ? "supersedesLegacyModifierIds" : "runtime.supersedesLegacyModifierIds",
        "runtime.modifierIds",
        "entity", "interpretation"
    ];
    valueKeys.forEach((field) => fieldClaims.push(`effect.${field}`));
    Object.keys(activation || {}).sort().forEach((field) => {
        if (!["condition", "calculationSupport", "uidHandling"].includes(field) && ACTIVATION_COPY_FIELDS.has(field)) {
            fieldClaims.push(`effect.activation.${field}`);
        }
    });
    requireVerifiedFieldClaims(spec?.verification?.claims, fieldClaims, reasons);

    if (reasons.length) return { eligible: false, blockedReasons: reasons, evidence: gate.evidence };

    const modifier = {
        id,
        category,
        applyTo: targets,
        condition: clone(condition),
        calculationSupport,
        uidHandling,
        destination,
        supersedesLegacyModifierIds,
    };
    Object.keys(effect).sort().forEach((field) => {
        if (RESERVED_EFFECT_FIELDS.has(field)) return;
        if (!EFFECT_COPY_FIELDS.has(field)) return;
        modifier[field] = stableClone(effect[field]);
    });
    Object.keys(activation).sort().forEach((field) => {
        if (["condition", "calculationSupport", "uidHandling"].includes(field)) return;
        if (!ACTIVATION_COPY_FIELDS.has(field)) return;
        modifier[field] = stableClone(activation[field]);
    });
    modifier.provenance = {
        schemaVersion: SCHEMA_VERSION,
        status: "canonical",
        specId: String(spec.id || ""),
        sourceRefs: gate.evidence.refs,
        providers: gate.evidence.providers,
        independenceGroups: gate.evidence.independenceGroups,
        gameVersion: gate.evidence.gameVersion,
        ...(gate.verification.verificationMode === "human" ? { reviewedBy: gate.verification.reviewedBy, reviewedAt: gate.verification.reviewedAt } : {}),
        verification: {
            ...verificationProvenance(gate),
            independentSourceCount: gate.evidence.independenceGroups.length,
        },
        entity: stableClone(spec.entity),
        interpretation: stableClone(spec.interpretation)
    };
    modifier.runtime = {
        status: "canonical",
        generator: GENERATOR_VERSION,
        modifierIds: [id],
        destination,
        supersedesLegacyModifierIds
    };
    return { eligible: true, blockedReasons: [], evidence: gate.evidence, modifier };
}

function mapBehaviorModifier(record, sourceRecords = {}, targetSpecs = {}, options = {}) {
    const gate = assessVerifiedSpec(record, sourceRecords, { ...options, requireInterpretation: false });
    const reasons = [...gate.blockedReasons];
    const destination = requiredDestination(record, reasons);
    const supersedesLegacyModifierIds = requiredSupersession(record, reasons);
    const pathValue = record?.path;
    if (typeof pathValue !== "string" || !VALID_BEHAVIOR_PATH.test(pathValue)) pushReason(reasons, "behavior:pathMissingOrUnsupported");
    if (!VALID_BEHAVIOR_OPERATIONS.has(record?.operation)) pushReason(reasons, "behavior:operationMissingOrUnsupported");
    if (!Object.prototype.hasOwnProperty.call(record || {}, "value")) pushReason(reasons, "behavior:valueMissing");
    if (!isObject(record?.condition) || typeof record.condition.kind !== "string" || typeof record.condition.stateKey !== "string") {
        pushReason(reasons, "behavior:conditionMissingOrUnsupported");
    }
    if (typeof record?.targetSpecId !== "string" || !record.targetSpecId.length) pushReason(reasons, "behavior:targetSpecIdMissing");
    if (typeof record?.id !== "string" || !record.id.length) pushReason(reasons, "runtime:modifierIdMissing");
    const targetSpec = record?.targetSpec || targetSpecs?.[record?.targetSpecId];
    const targetGate = assessVerifiedSpec(targetSpec, sourceRecords, options);
    if (targetSpec?.id !== record?.targetSpecId) pushReason(reasons, "behavior:targetSpecMismatch");
    targetGate.blockedReasons.forEach((reason) => pushReason(reasons, `behavior:targetSpec:${reason}`));
    const pointerParts = String(pathValue || "").split("/").slice(1);
    let targetMeasurement = targetSpec;
    for (const part of pointerParts) {
        if (!isObject(targetMeasurement) || !Object.prototype.hasOwnProperty.call(targetMeasurement, part)) {
            targetMeasurement = undefined;
            break;
        }
        targetMeasurement = targetMeasurement[part];
    }
    if (!isObject(targetMeasurement) || !Object.prototype.hasOwnProperty.call(targetMeasurement, "value")) {
        pushReason(reasons, "behavior:targetSpecMeasurementMissing");
    }
    requireVerifiedFieldClaims(record?.verification?.claims, [
        "targetSpecId", "path", "operation", "value", "condition",
        record?.destination !== undefined ? "destination" : "runtime.destination",
        record?.supersedesLegacyModifierIds !== undefined ? "supersedesLegacyModifierIds" : "runtime.supersedesLegacyModifierIds"
    ], reasons);
    if (reasons.length) return { eligible: false, blockedReasons: reasons, evidence: gate.evidence };

    const id = record.id;
    const modifier = {
        id,
        runtimeKind: "behavior",
        category: "behavior",
        applyTo: ["behavior"],
        calculationSupport: "special",
        uidHandling: "special",
        destination,
        supersedesLegacyModifierIds,
        targetSpecId: record.targetSpecId,
        path: pathValue,
        operation: record.operation,
        value: stableClone(record.value),
        condition: stableClone(record.condition),
        targetSpec: stableClone(targetSpec),
        provenance: {
            schemaVersion: SCHEMA_VERSION,
            status: "canonical",
            specId: String(record.id),
            targetSpecId: String(record.targetSpecId),
            sourceRefs: gate.evidence.refs,
            providers: gate.evidence.providers,
            independenceGroups: gate.evidence.independenceGroups,
            gameVersion: gate.evidence.gameVersion,
            ...(gate.verification.verificationMode === "human" ? { reviewedBy: gate.verification.reviewedBy, reviewedAt: gate.verification.reviewedAt } : {}),
            verification: {
                ...verificationProvenance(gate),
                independentSourceCount: gate.evidence.independenceGroups.length,
            }
        },
        runtime: {
            status: "canonical",
            generator: GENERATOR_VERSION,
            modifierIds: [id],
            destination,
            supersedesLegacyModifierIds
        }
    };
    return { eligible: true, blockedReasons: [], evidence: gate.evidence, modifier };
}

function addResult(collection, key, result, type) {
    collection.push({ id: key, type, ...result });
}

function buildCanonicalRuntime({
    specs = {},
    sourceRecords = {},
    behaviorModifiers = {},
    eligibilityCertificates = {},
    deterministicAttestations = {},
    currentGameVersion = null,
    versionBaselineCurrent = true,
    versionSnapshotId = null,
    characterIdentityResolver = null,
    characterIdentityRequired = false,
    includeExcluded = true
} = {}) {
    const gateOptions = { eligibilityCertificates, deterministicAttestations, currentGameVersion, versionBaselineCurrent, versionSnapshotId, characterIdentityResolver, characterIdentityRequired };
    const results = [];
    asEntries(specs).sort(([a], [b]) => a.localeCompare(b)).forEach(([key, spec]) => {
        addResult(results, String(spec?.id || key), mapEffectSpec(spec, sourceRecords, gateOptions), "effectSpec");
    });
    asEntries(behaviorModifiers).sort(([a], [b]) => a.localeCompare(b)).forEach(([key, modifier]) => {
        addResult(results, String(modifier?.id || key), mapBehaviorModifier(modifier, sourceRecords, specs, gateOptions), "behaviorModifier");
    });
    const eligibleByModifierId = new Map();
    results.filter((result) => result.eligible).forEach((result) => {
        const id = result.modifier?.id;
        if (!id) return;
        const group = eligibleByModifierId.get(id) || [];
        group.push(result);
        eligibleByModifierId.set(id, group);
    });
    eligibleByModifierId.forEach((group) => {
        if (group.length < 2) return;
        group.forEach((result) => {
            result.eligible = false;
            result.blockedReasons = ["runtime:modifierIdCollision"];
        });
    });
    const eligible = results.filter((result) => result.eligible).sort((a, b) => a.id.localeCompare(b.id));
    const excluded = results.filter((result) => !result.eligible).sort((a, b) => a.id.localeCompare(b.id));
    const modifiers = Object.fromEntries(eligible.map((result) => [result.modifier.id, result.modifier]));
    const blockedByReason = {};
    excluded.forEach((result) => result.blockedReasons.forEach((reason) => {
        blockedByReason[reason] = (blockedByReason[reason] || 0) + 1;
    }));
    return {
        schemaVersion: SCHEMA_VERSION,
        kind: "genshinCanonicalRuntime",
        generator: { name: "genshinCanonicalRuntimeGenerate.cjs", version: GENERATOR_VERSION },
        policy: {
            canonical: "verifiedStructuredSpecOnly",
            sourceAgreement: "twoIndependentProvidersPerVerifiedClaim",
            gameVersion: "requiredAndConsistent",
            verification: "human attestation or authoritative deterministicConsensus certificate plus attestation required",
            textInference: "forbidden",
            destination: "requiredStructuredEngineRoute",
            supersedesLegacyModifierIds: "required"
        },
        summary: {
            total: results.length,
            eligible: eligible.length,
            excluded: excluded.length,
            canonical: eligible.length,
            effectSpecs: results.filter((result) => result.type === "effectSpec").length,
            behaviorModifiers: results.filter((result) => result.type === "behaviorModifier").length,
            blockedByReason
        },
        modifiers,
        ...(includeExcluded ? {
            excluded: excluded.map((result) => ({
                id: result.id,
                type: result.type,
                blockedReasons: result.blockedReasons
            }))
        } : {})
    };
}

function buildRepositoryAudit({ dataRoot = defaultDataRoot } = {}) {
    const categories = {};
    // Recompute once from current raw inputs; never trust a persisted audit's
    // `clear`/`allowed` flag or reuse identities from another data root.
    const identityAssessments = buildEntityIdentityAssessments({ dataRoot });
    const characterIdentityResolver = (entityId) => identityAssessments.get(entityId)
        || { blocked: true, classification: "evidenceUnavailable" };
    const eligibilityCertificatePath = path.join(dataRoot, "v2", "eligibility-certificates.json");
    const eligibilityCertificates = fs.existsSync(eligibilityCertificatePath) ? readJson(eligibilityCertificatePath) : { certificates: [] };
    const deterministicAttestationPath = path.join(dataRoot, "v2", "deterministic-attestations.json");
    const deterministicAttestations = fs.existsSync(deterministicAttestationPath) ? readJson(deterministicAttestationPath) : { attestations: [] };
    const currentGameVersion = deriveCurrentGameVersion(readJson(path.join(dataRoot, "v2", "source-catalog.json")));
    const versionBaseline = auditBaseline({ dataRoot });
    const addCategory = (name, specFile, sourceFile, options = {}) => {
        const specsData = readJson(path.join(dataRoot, specFile));
        const sourceData = readJson(path.join(dataRoot, sourceFile));
        const sourceRecords = options.sourcePath ? sourceData[options.sourcePath] : sourceData;
        const built = buildCanonicalRuntime({
            specs: options.specsPath ? specsData[options.specsPath] : specsData,
            sourceRecords,
            behaviorModifiers: options.behaviorModifiers ? specsData[options.behaviorModifiers] : {},
            characterIdentityResolver,
            characterIdentityRequired: name === "talentGap",
            eligibilityCertificates,
            deterministicAttestations,
            currentGameVersion: currentGameVersion.gameVersion,
            versionBaselineCurrent: versionBaseline.canonicalGateOpen,
            versionSnapshotId: versionBaseline.acceptedSnapshotId
        });
        categories[name] = built;
    };
    addCategory("weapons", path.join("v2", "weapons", "spec-candidates.json"), path.join("v2", "weapons", "source-records.json"));
    addCategory("artifacts", path.join("v2", "artifacts", "spec-candidates.json"), path.join("v2", "artifacts", "source-records.json"));
    addCategory("talentGap", path.join("v2", "characters", "talent-gap-candidates.json"), path.join("v2", "characters", "talent-gap-candidates.json"), { specsPath: "specs", sourcePath: "sourceRecords" });
    const behavior = readJson(path.join(dataRoot, "v2", "characters", "behavior-pilot.json"));
    const reviewedBehaviorPath = path.join(dataRoot, "v2", "characters", "behavior-reviewed.json");
    const reviewedBehavior = fs.existsSync(reviewedBehaviorPath)
        ? readJson(reviewedBehaviorPath)
        : { sourceRecords: {}, modifiers: {} };
    categories.behavior = buildCanonicalRuntime({
        specs: { ...behavior.specs, ...reviewedBehavior.behaviorSpecs },
        sourceRecords: { ...behavior.sourceRecords, ...reviewedBehavior.sourceRecords },
        behaviorModifiers: { ...behavior.modifiers, ...reviewedBehavior.modifiers },
        characterIdentityResolver,
        characterIdentityRequired: true,
        eligibilityCertificates,
        deterministicAttestations,
        currentGameVersion: currentGameVersion.gameVersion,
        versionBaselineCurrent: versionBaseline.canonicalGateOpen,
        versionSnapshotId: versionBaseline.acceptedSnapshotId
    });
    const behaviorRoot = path.join(dataRoot, "v2", "characters");
    fs.readdirSync(behaviorRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^behavior-batch-\d+$/.test(entry.name))
        .sort((left, right) => Number(left.name.split("-").pop()) - Number(right.name.split("-").pop()))
        .forEach((entry) => {
            const batch = Number(entry.name.split("-").pop());
            const batchRoot = path.join(behaviorRoot, entry.name);
            categories[`behaviorBatch${batch}`] = buildCanonicalRuntime({
                specs: readJson(path.join(batchRoot, "spec-candidates.json")),
                sourceRecords: readJson(path.join(batchRoot, "source-records.json")),
                characterIdentityResolver,
                characterIdentityRequired: true,
                eligibilityCertificates,
                deterministicAttestations,
                currentGameVersion: currentGameVersion.gameVersion,
                versionBaselineCurrent: versionBaseline.canonicalGateOpen,
                versionSnapshotId: versionBaseline.acceptedSnapshotId
            });
        });
    const totals = Object.values(categories).reduce((acc, category) => {
        acc.total += category.summary.total;
        acc.canonical += category.summary.canonical;
        acc.excluded += category.summary.excluded;
        return acc;
    }, { total: 0, canonical: 0, excluded: 0 });
    return { schemaVersion: SCHEMA_VERSION, kind: "genshinCanonicalRuntimeAudit", currentGameVersion, versionBaseline, categories, totals };
}

function buildRepositoryRuntime(options = {}) {
    const audit = buildRepositoryAudit(options);
    const dataRoot = options.dataRoot || defaultDataRoot;
    const upstreamVersion = auditUpstreamVersion({ dataRoot });
    const transitionPath = path.join(dataRoot, "v2", "version-transition.json");
    const transition = fs.existsSync(transitionPath) ? readJson(transitionPath) : null;
    const modifiers = {};
    const collisions = [];
    Object.keys(audit.categories).sort().forEach((categoryName) => {
        Object.entries(audit.categories[categoryName].modifiers).sort(([a], [b]) => a.localeCompare(b)).forEach(([id, modifier]) => {
            if (modifiers[id]) collisions.push(id);
            else modifiers[id] = modifier;
        });
    });
    if (collisions.length) throw new Error(`Canonical runtime modifier id collisions: ${uniqueStrings(collisions).join(", ")}`);
    const transitionRequired = transition?.toGameVersion === upstreamVersion.observedLiveVersion
        && transition?.fromGameVersion !== transition?.toGameVersion;
    const transitionReady = !transitionRequired || transition?.productionGate?.reopenEligible === true;
    const activeForProduction = audit.versionBaseline.canonicalGateOpen === true
        && upstreamVersion.status === "current"
        && upstreamVersion.acceptedTargetVersion === audit.currentGameVersion.gameVersion
        && upstreamVersion.observedLiveVersion === audit.currentGameVersion.gameVersion
        && transitionReady;
    const versionAvailability = {
        status: activeForProduction ? "active" : "inactivePendingRevalidation",
        activeForProduction,
        gateScope: "versionBoundCanonicalOverlayOnly",
        verifiedGameVersion: audit.currentGameVersion.gameVersion,
        observedLiveVersion: upstreamVersion.observedLiveVersion,
        transitionStatus: upstreamVersion.status,
        transitionId: transitionRequired ? transition.transitionId : null,
        transitionReopenEligible: transitionReady,
        reason: activeForProduction ? null
            : upstreamVersion.status === "upstreamVersionAvailable"
                ? `Canonical records remain verified for ${audit.currentGameVersion.gameVersion} but require ${upstreamVersion.observedLiveVersion} revalidation before production use.`
                : !transitionReady
                    ? "The target version is accepted, but entity diff, claim revalidation, regenerated certificates/Runtime, or consumer verification is incomplete."
                : "Canonical production availability requires a current valid official live-version head and a matching accepted baseline.",
        reopenRequirements: [
            "strict target-version dataset and entity diff",
            "affected candidate×claim evidence revalidation",
            "fresh eligibility certificates and canonical Runtime regeneration",
            "consumer and regression verification"
        ]
    };
    return {
        schemaVersion: SCHEMA_VERSION,
        kind: "genshinCanonicalRuntime",
        generator: { name: "genshinCanonicalRuntimeGenerate.cjs", version: GENERATOR_VERSION },
        generatedAt: "2026-08-15T00:00:00.000Z",
        policy: {
            source: "verified EffectSpec only",
            currentGameVersion: audit.currentGameVersion,
            versionBaseline: { status: audit.versionBaseline.status, canonicalGateOpen: audit.versionBaseline.canonicalGateOpen },
            proseInference: "forbidden",
            loaderGate: "v2 provenance plus explicit destination and supersession"
        },
        versionBinding: {
            gameVersion: audit.currentGameVersion.gameVersion,
            status: audit.currentGameVersion.status,
            acceptedSnapshotId: audit.versionBaseline.acceptedSnapshotId,
            sourceCatalogDigest: audit.versionBaseline.acceptedSourceCatalogDigest,
            baselineDigest: audit.versionBaseline.acceptedBaselineDigest
        },
        versionAvailability,
        summary: {
            candidatesAudited: audit.totals.total,
            canonical: Object.keys(modifiers).length,
            excluded: audit.totals.excluded,
            collisions: collisions.length,
            activeForProduction: activeForProduction ? Object.keys(modifiers).length : 0,
            inactivePendingRevalidation: activeForProduction ? 0 : Object.keys(modifiers).length
        },
        modifiers
    };
}

function writeRepositoryRuntime({ dataRoot = defaultDataRoot, outputFile = path.join(defaultDataRoot, "v2", "runtime", "canonical-runtime.json") } = {}) {
    const runtime = buildRepositoryRuntime({ dataRoot });
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, `${JSON.stringify(runtime, null, 2)}\n`, "utf8");
    return runtime;
}

function buildRepositoryAuditReport({ dataRoot = defaultDataRoot } = {}) {
    const audit = buildRepositoryAudit({ dataRoot });
    const categories = Object.fromEntries(Object.entries(audit.categories).map(([name, category]) => {
        const primaryBlocks = Object.entries(category.summary.blockedByReason || {})
            .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
            .slice(0, 5)
            .map(([reason, count]) => ({ reason, count }));
        return [name, {
            candidates: category.summary.total,
            canonical: category.summary.canonical,
            excluded: category.summary.excluded,
            primaryBlocks
        }];
    }));
    return {
        schemaVersion: SCHEMA_VERSION,
        kind: "genshinCanonicalRuntimeAuditReport",
        generator: GENERATOR_VERSION,
        status: audit.totals.canonical === 0 ? "passedFailClosed" : "passed",
        policy: {
            promotion: "verified structured specs only",
            independentProviders: 2,
            independentEvidenceGroups: 2,
            fieldClaims: "every copied field requires an exact verified canonical dotted-path claim",
            gameVersion: "required and consistent on every resolved source",
            verification: "human mode requires independent reviewer metadata; deterministicConsensus requires strict claim certificates and machine attestations",
            destination: "structured allowlisted engine route required",
            supersedesLegacyModifierIds: "explicit array required",
            behavior: "dedicated browser behavior route supported; real records still require the full canonical evidence gate",
            textInference: "forbidden"
        },
        repository: {
            totalCandidates: audit.totals.total,
            canonical: audit.totals.canonical,
            excluded: audit.totals.excluded,
            categories
        }
    };
}

function repositoryAuditMarkdown(report) {
    const rows = Object.entries(report.repository.categories).map(([name, category]) => {
        const disposition = category.primaryBlocks.slice(0, 3).map((item) => `${item.reason} (${item.count})`).join("; ");
        return `| ${name} | ${category.candidates} | ${category.canonical} | ${disposition} |`;
    });
    return [
        "# Genshin canonical RuntimeModifier audit", "",
        `Status: **${report.status}**`, "",
        "Only independently verified structured specifications may be promoted. The generator never parses prose, and every copied field needs an exact verified claim, two provider names in at least two independent source families, a consistent game version, either a human attestation or an authoritative deterministicConsensus certificate plus machine attestation, an allowlisted destination, and explicit legacy supersession metadata.", "",
        "The browser exposes a dedicated BehaviorModifier runtime route. Current behavior candidates still remain blocked because their evidence, field claims, review, destination, and supersession contracts are incomplete.", "",
        "| Input layer | Candidates | Canonical | Primary blocking reasons |",
        "| --- | ---: | ---: | --- |",
        ...rows,
        `| **total** | **${report.repository.totalCandidates}** | **${report.repository.canonical}** | ${report.repository.excluded} excluded |`, "",
        "A canonical count of zero is intentional fail-closed behavior, not a claim that candidate coverage is complete or verified.", ""
    ].join("\n");
}

function writeRepositoryArtifacts({
    dataRoot = defaultDataRoot,
    runtimeFile = path.join(defaultDataRoot, "v2", "runtime", "canonical-runtime.json"),
    reportJson = path.join(repositoryRoot, "reports", "genshin-canonical-runtime-audit.json"),
    reportMarkdown = path.join(repositoryRoot, "reports", "genshin-canonical-runtime-audit.md")
} = {}) {
    const runtime = writeRepositoryRuntime({ dataRoot, outputFile: runtimeFile });
    const report = buildRepositoryAuditReport({ dataRoot });
    fs.mkdirSync(path.dirname(reportJson), { recursive: true });
    fs.writeFileSync(reportJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    fs.writeFileSync(reportMarkdown, repositoryAuditMarkdown(report), "utf8");
    return { runtime, report };
}

if (require.main === module) {
    const { runtime, report } = writeRepositoryArtifacts();
    process.stdout.write(`${JSON.stringify({ runtime: runtime.summary, auditStatus: report.status }, null, 2)}\n`);
}

module.exports = {
    GENERATOR_VERSION,
    VALID_CALCULATION_SUPPORT,
    VALID_UID_HANDLING,
    VALID_BEHAVIOR_OPERATIONS,
    stableClone,
    stableJson,
    assessVerifiedSpec,
    mapEffectSpec,
    mapBehaviorModifier,
    buildCanonicalRuntime,
    buildRepositoryAudit,
    buildRepositoryAuditReport,
    buildRepositoryRuntime,
    repositoryAuditMarkdown,
    writeRepositoryArtifacts,
    writeRepositoryRuntime
};
