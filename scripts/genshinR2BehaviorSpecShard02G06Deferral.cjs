"use strict";

/**
 * Candidate-scoped r2 audit for the next bounded BehaviorSpec shard.
 *
 * Shard01 is already registered and must not be selected again.  This module
 * reuses the materialized 6.7/7.0 raw records, fixes the next exact 100
 * candidate IDs after Shard01, and records a draft-only evidence wait.  It
 * never infers a mechanic value from prose or an entity record and never
 * changes queue, Runtime, canonical data, or the HSR application.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { digestStable } = require("./genshinVersionEvidenceValidation.cjs");
const shard01 = require("./genshinR2BehaviorSpecShard01G06Deferral.cjs");
const work = require("./genshinWorkDisposition.cjs");

const ROOT = path.resolve(__dirname, "..");
const MATERIALIZATION_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "reviews", "r2-behavior-spec-materialization-audit.json");
const SHARD01_SOURCE_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "reviews", "r2-behavior-spec-shard01-source-audit.json");
const SNAPSHOT_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0", "behavior-shard-02-snapshot.json");
const SOURCE_SEARCH_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0", "source-search.json");
const PROVIDER_POLICY_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "provider-independence-policy.json");
const SOURCE_FAMILY_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "source-family-registry.json");
const EXTERNAL_CHARACTER_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "characters", "external-field-evidence.json");
const SOURCE_AUDIT_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "reviews", "r2-behavior-spec-shard02-source-audit.json");
const SOURCE_AUDIT_REPORT_PATH = path.join(ROOT, "reports", "genshin-r2-behavior-spec-shard02-source-audit.md");
const ARTIFACT_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "reviews", "r2-behavior-spec-shard02-g06-deferral.json");
const REPORT_PATH = path.join(ROOT, "reports", "genshin-r2-behavior-spec-shard02-g06-deferral.md");
const SCHEMA_PATH = path.join(ROOT, "games", "genshin", "data", "schema", "r2-behavior-spec-shard02-g06-deferral.schema.json");

const GENERATED_AT = "2026-08-30T00:00:00.000Z";
const GENERATOR_VERSION = "genshinR2BehaviorSpecShard02G06Deferral/1";
const SOURCE_GENERATOR_VERSION = "genshinR2BehaviorSpecShard02SourceAudit/1";
const POLICY_ID = "genshin-goal-2026-08-28-r2";
const TRANSITION_ID = "genshin:6.7->7.0";
const TARGET_GAME_VERSION = "7.0";
const SHARD_ID = "behavior:behaviorSpec:semanticDecisionRequired:standard:02";
const FRONTIER_ID = "genshin-7.0-behavior-spec-shard02-persisted-provider-frontier";
const FRONTIER_DATE = "2026-08-30";
const SHARD_SIZE = 100;
const CLAIM_FIELDS = ["sourceText", "timing", "execution", "lifecycle", "energy", "snapshot", "runtime"];
const EXTERNAL_CLAIM_FIELDS = CLAIM_FIELDS.filter((field) => field !== "runtime");
const REOPEN_TRIGGER = "A provider-owned immutable 7.0 field manifest with exact raw/field digests, newly disclosed independent lineage, or complete candidate×claim field coverage becomes available.";
const UNSEARCHED_SCOPE = [
    "Provider releases, manifests, or immutable candidate-field artifacts not retained in the repository at this audit time.",
    "Newly disclosed lineage evidence that separates a currently correlated provider family.",
    "Future 7.0+ provider responses that are not yet saved as immutable artifacts."
];

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sha256(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function relative(file) {
    return path.relative(ROOT, file).replaceAll("\\", "/");
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function fileRef(file, role) {
    const exists = fs.existsSync(file);
    const bytes = exists ? fs.readFileSync(file) : null;
    return { path: relative(file), role, exists, bytes: bytes ? bytes.length : null, sha256: bytes ? sha256(bytes) : null };
}

function sortedUnique(values) {
    return [...new Set((values || []).filter((value) => value !== null && value !== undefined).map(String))]
        .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
}

function candidateIdDigest(ids) {
    return digestStable(sortedUnique(ids));
}

function taskDigest(task) {
    return work.taskDigest(task);
}

function withoutDigest(value) {
    const copy = clone(value);
    if (copy && typeof copy === "object") delete copy.fieldDigest;
    return copy;
}

function eligibleCandidates(materialization) {
    return (materialization?.claim?.candidates || [])
        .filter((candidate) => candidate?.queue?.task?.status === "ready"
            && candidate?.queue?.searchFrontier?.status === "searchRequired"
            && candidate?.queue?.primaryBlockReason === "semanticDecisionRequired"
            && ["resolvedUnambiguous", "resolvedUnambiguousByProviderName"].includes(candidate?.transitionRaw?.identityStatus)
            && candidate?.transitionRaw?.rawIntegrityStatus === "verified"
            && (candidate.candidateClaims || []).length === CLAIM_FIELDS.length
            && candidate.candidateClaims.every((claim) => claim?.local?.claimSchemaStatus === "presentNeedsReview"))
        .sort((left, right) => String(left.candidateId).localeCompare(String(right.candidateId), "en", { numeric: true }));
}

function persistedShardIds() {
    if (!fs.existsSync(SHARD01_SOURCE_PATH)) return new Set();
    const artifact = readJson(SHARD01_SOURCE_PATH);
    return new Set((artifact.scope?.candidateIds || []).map(String));
}

function selectedIds(materialization) {
    const all = eligibleCandidates(materialization);
    if (fs.existsSync(SOURCE_AUDIT_PATH)) {
        const persisted = readJson(SOURCE_AUDIT_PATH).scope?.candidateIds;
        if (Array.isArray(persisted) && persisted.length === SHARD_SIZE) return persisted.map(String);
    }
    const excluded = persistedShardIds();
    const next = all.filter((candidate) => !excluded.has(String(candidate.candidateId))).slice(0, SHARD_SIZE);
    if (next.length !== SHARD_SIZE) throw new Error(`shardSelectionInsufficient:${next.length}`);
    return next.map((candidate) => String(candidate.candidateId));
}

function rawSideEvidence(raw, side) {
    const record = raw?.record?.[side] || {};
    const stored = record.stored || {};
    const actual = record.actual || {};
    return {
        path: record.path || null,
        gameVersion: record.gameVersion || null,
        revision: record.revision || null,
        packageVersion: record.packageVersion || null,
        bytes: actual.rawArtifactBytes ?? stored.rawArtifactBytes ?? null,
        rawSha256: actual.rawArtifactSha256 || stored.rawArtifactSha256 || null,
        gitBlob: actual.gitBlob || stored.gitBlob || null,
        fieldDigest: record.fieldDigest || null,
        integrityVerified: record.integrityVerified === true,
        jsonValid: record.jsonValid === true
    };
}

function sourceClaim(candidate, field) {
    return (candidate.candidateClaims || []).find((claim) => claim.field === field) || {};
}

function normalizeCandidate(candidate, rank, providers) {
    const raw = candidate.transitionRaw || {};
    const claims = CLAIM_FIELDS.map((field) => {
        const original = sourceClaim(candidate, field);
        return {
            claimId: original.claimId || `${candidate.candidateId}:${field}`,
            candidateId: candidate.candidateId,
            field,
            claimKind: original.claimKind || (field === "runtime" ? "internalRuntimeRoute" : "externalFactual"),
            local: {
                claimSchemaStatus: original.local?.claimSchemaStatus || "missing",
                claimStatus: original.local?.claimStatus || null,
                observedSection: original.local?.observedSection === true,
                observedLeafPaths: clone(original.local?.observedLeafPaths || []),
                observedSectionDigest: original.local?.observedSectionDigest || null
            },
            correlatedEntityEvidence: {
                provider: "genshin-db",
                sourceFamily: raw.sourceFamily || "GenshinData-derived",
                rawIntegrityStatus: original.rawEvidence?.rawIntegrityStatus || raw.rawIntegrityStatus || null,
                beforeFieldDigest: original.rawEvidence?.rawBeforeFieldDigest || null,
                afterFieldDigest: original.rawEvidence?.rawAfterFieldDigest || null,
                candidateFieldValueMaterialized: false,
                entityRecordOnly: true
            },
            providerFieldEvidence: providers.map((provider) => ({
                provider: provider.provider,
                sourceFamily: provider.sourceFamily,
                exactCandidateFieldRecordCount: 0,
                candidateScopeStatus: "noCandidateScopedRecordInPersistedEvidence",
                candidateFieldValueMaterialized: false,
                independentVersionBound: false,
                strictEligible: false
            })),
            disposition: {
                status: field === "runtime" ? "internalMetadataOnly" : "candidateFieldSearchRequired",
                candidateFieldValueMaterialized: false,
                independentVersionBound: false,
                strictVerified: false,
                certificateEligible: false,
                canonicalPromotionEligible: false,
                reasons: field === "runtime"
                    ? ["internalRuntimeMetadataOnly", "externalClaimsRemainOpen"]
                    : ["candidateFieldEvidenceAbsent", "correlatedFamilyOnly", "independentPairAbsent", "searchRequired", "inferenceForbidden"]
            }
        };
    });
    return {
        candidateId: candidate.candidateId,
        dataset: candidate.dataset || null,
        layer: candidate.layer || "behaviorSpec",
        entityId: candidate.entityId || null,
        component: candidate.component || candidate.entity?.component || null,
        selectionRank: rank,
        identity: {
            status: raw.identityStatus || null,
            provider: raw.provider || null,
            sourceFamily: raw.sourceFamily || null,
            providerSlug: raw.providerSlug || null,
            recordKind: raw.recordKind || null,
            componentPointer: raw.componentPointer || null
        },
        queueReference: { candidateId: candidate.candidateId, taskId: candidate.queue?.task?.taskId || null },
        rawEntityEvidence: {
            status: raw.rawIntegrityStatus || null,
            entityRecordOnly: true,
            before: rawSideEvidence(raw, "before"),
            after: rawSideEvidence(raw, "after"),
            candidateFieldValueMaterialized: false
        },
        internalConnection: {
            status: "readyForExternalSourceLookup",
            identityGap: false,
            localClaimSchemaGap: false,
            rawIntegrityGap: false,
            queueToCandidateFieldAdapter: "notRecorded",
            nextInternalAction: "materializeCandidateClaimFieldAdapterWhenProviderArtifactExists"
        },
        providerSurface: {
            providersExamined: providers.map((provider) => provider.provider),
            exactCandidateFieldEvidenceCount: 0,
            independentVersionBoundFieldEvidenceCount: 0,
            candidateScopedFrontierStatus: "notProven",
            searchExhausted: false
        },
        claims,
        disposition: {
            status: "candidateFieldSearchRequired",
            externalClaimCount: claims.filter((claim) => claim.claimKind === "externalFactual").length,
            internalClaimCount: claims.filter((claim) => claim.claimKind === "internalRuntimeRoute").length,
            candidateFieldEvidencePresent: false,
            evidenceDeferred: false,
            closed: false,
            strictVerified: false,
            certificateEligible: false,
            canonicalPromotionEligible: false,
            reasons: ["providerCandidateScopeNotRecorded", "candidateFieldEvidenceAbsent", "finiteFrontierUnproven", "inferenceForbidden"]
        }
    };
}

function providerSurface(sourceSearch, policy, candidateIds, rawEntityCount) {
    const providers = (sourceSearch?.providersExamined || []).map((row) => {
        const provider = row?.provider || null;
        const sourceFamily = row?.sourceFamily || null;
        const policyRow = (policy?.policies || []).find((item) => String(item?.providerA || "") === provider || String(item?.providerB || "") === provider);
        return {
            provider,
            sourceFamily,
            evidenceRef: row?.evidenceRef || null,
            providerPolicyId: policyRow?.id || null,
            exactCandidateFieldRecordCount: 0,
            policyStatus: policyRow?.status || null,
            candidateScopeStatus: "noCandidateScopedRecordInPersistedEvidence",
            versionBindingStatus: provider === "theBowja/genshin-db" ? "entityRawOnlyBoundSides" : "notProvenForShardClaims",
            independentFieldEvidence: false,
            strictEligible: false,
            reason: provider === "theBowja/genshin-db"
                ? "Pinned 6.7/7.0 entity raw is captured, but no behavior candidate×claim field is materialized."
                : "The retained provider evidence has no exact shard candidate×claim record."
        };
    }).filter((row) => row.provider);
    return {
        providerWideLedgerStatus: providers.length ? "inspected" : "missing",
        providerCount: providers.length,
        providers,
        candidateScopeStatus: "notProven",
        candidateScopedFrontierStatus: "notRecorded",
        candidateScopedFrontierProven: false,
        exactCandidateFieldEvidenceCount: 0,
        independentVersionBoundFieldEvidenceCount: 0,
        rawEntityEvidenceProvider: "genshin-db",
        rawEntityEvidenceCount: rawEntityCount,
        externalRetrieval: {
            status: "notMaterialized",
            exactImmutableArtifactSaved: false,
            reason: "No provider-owned immutable candidate-field artifact is present in the repository; no value is consumed from an unsaved or mutable fetch."
        },
        finiteFrontier: {
            status: "notProven",
            finite: false,
            searchExhausted: false,
            searchScope: null,
            lastSearchedAt: null,
            providersExamined: providers.map((row) => row.provider),
            reopenTrigger: REOPEN_TRIGGER
        }
    };
}

function buildSourceAudit() {
    const materialization = readJson(MATERIALIZATION_PATH);
    const sourceSearch = readJson(SOURCE_SEARCH_PATH);
    const policy = readJson(PROVIDER_POLICY_PATH);
    const ids = selectedIds(materialization);
    const allById = new Map(eligibleCandidates(materialization).map((candidate) => [String(candidate.candidateId), candidate]));
    const selected = ids.map((id) => allById.get(String(id)));
    if (selected.some((candidate) => !candidate)) throw new Error("persistedShardCandidateMissing");
    const providers = providerSurface(sourceSearch, policy, ids, selected.length);
    const candidates = selected.map((candidate, index) => normalizeCandidate(candidate, index + 1, providers.providers));
    const claims = candidates.flatMap((candidate) => candidate.claims);
    const externalClaims = claims.filter((claim) => claim.claimKind === "externalFactual");
    const output = {
        schemaVersion: 1,
        kind: "genshinR2BehaviorSpecShard02SourceAudit",
        status: "passed",
        generatedAt: GENERATED_AT,
        generator: { name: path.basename(__filename), version: SOURCE_GENERATOR_VERSION },
        scope: {
            transitionId: TRANSITION_ID,
            targetGameVersion: TARGET_GAME_VERSION,
            layer: "behaviorSpec",
            shardId: SHARD_ID,
            selection: "next 100 sorted ready BehaviorSpec tasks after the registered shard01, with resolved identity, verified transition raw, and complete local claim schema",
            candidateCount: candidates.length,
            candidateIds: ids,
            candidateIdDigest: candidateIdDigest(ids),
            claimFields: CLAIM_FIELDS,
            externalClaimFields: EXTERNAL_CLAIM_FIELDS
        },
        policy: {
            persistedEvidenceReconciliation: true,
            externalRetrieval: "notMaterializedWithoutSavableImmutableArtifact",
            proseInference: "forbidden",
            tokenMatching: "forbidden",
            sameUpstreamDoubleCount: "forbidden",
            providerIndependenceRequired: true,
            candidateClaimFieldEvidenceRequired: true,
            candidateScopedFrontierRequired: true,
            searchRequiredIsNotSearchExhausted: true,
            metadataBooleansNotProof: true,
            certificateIssuance: "forbidden",
            canonicalPromotion: "forbidden",
            queueMutation: "none"
        },
        generatedFrom: {
            behaviorSpecMaterializationAudit: fileRef(MATERIALIZATION_PATH, "behaviorSpecMaterializationAudit"),
            transitionBehaviorSnapshot: fileRef(SNAPSHOT_PATH, "transitionBehaviorSnapshot"),
            transitionProviderSearchLedger: fileRef(SOURCE_SEARCH_PATH, "transitionProviderSearchLedger"),
            providerIndependencePolicy: fileRef(PROVIDER_POLICY_PATH, "providerIndependencePolicy"),
            sourceFamilyRegistry: fileRef(SOURCE_FAMILY_PATH, "sourceFamilyRegistry"),
            externalCharacterEvidence: fileRef(EXTERNAL_CHARACTER_PATH, "characterExternalFieldEvidence")
        },
        providerSurface: providers,
        candidates,
        summary: {
            candidateCount: candidates.length,
            entityCount: new Set(candidates.map((candidate) => candidate.entityId)).size,
            claimCount: claims.length,
            externalClaimCount: externalClaims.length,
            internalClaimCount: claims.length - externalClaims.length,
            internalReadyCandidateCount: candidates.filter((candidate) => candidate.internalConnection.status === "readyForExternalSourceLookup").length,
            identityGapCandidateCount: candidates.filter((candidate) => candidate.internalConnection.identityGap).length,
            localClaimSchemaGapCandidateCount: candidates.filter((candidate) => candidate.internalConnection.localClaimSchemaGap).length,
            rawIntegrityGapCandidateCount: candidates.filter((candidate) => candidate.internalConnection.rawIntegrityGap).length,
            rawIntegrityVerifiedCandidateCount: candidates.filter((candidate) => candidate.rawEntityEvidence.status === "verified").length,
            exactCandidateFieldEvidenceCandidateCount: 0,
            exactCandidateFieldEvidenceClaimCount: 0,
            candidateFieldSearchRequiredCandidateCount: candidates.length,
            candidateFieldSearchRequiredClaimCount: externalClaims.length,
            providerCandidateScopeUnsearchedCandidateCount: candidates.length,
            providerCandidateScopeUnsearchedClaimCount: externalClaims.length,
            candidateScopedFrontierProvenCandidateCount: 0,
            evidenceDeferredCandidateCount: 0,
            strictVerifiedCandidateCount: 0,
            certificateEligibleClaimCount: 0,
            canonicalPromotionEligibleCandidateCount: 0,
            sourceSearchProviderCount: providers.providerCount,
            sourceSearchProviderExactCandidateFieldHitCount: 0
        },
        nextAction: {
            task: "Persist exact candidate×claim source artifacts with immutable revision/raw/field digests and explicit 7.0 binding, then re-run this shard",
            doNotDo: ["do not infer values from prose", "do not treat entity raw as candidate field proof", "do not issue certificate", "do not promote canonical"]
        },
        gate: {
            candidateScopedFrontierProven: false,
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false,
            canDeferG06: false,
            verificationGranted: false,
            promotionGranted: false
        },
        fieldDigestAlgorithm: "sha256-stable-json-v1"
    };
    output.fieldDigest = digestStable(withoutDigest(output));
    return output;
}

function sourceAuditBytes(audit) {
    return Buffer.from(`${JSON.stringify(audit, null, 2)}\n`, "utf8");
}

function sourceAuditRef(audit) {
    return { path: relative(SOURCE_AUDIT_PATH), sha256: sha256(sourceAuditBytes(audit)) };
}

function immutableRefs(sourceAudit) {
    return [
        sourceAuditRef(sourceAudit),
        fileRef(SNAPSHOT_PATH, "transitionBehaviorSnapshot"),
        fileRef(SOURCE_SEARCH_PATH, "transitionProviderSearchLedger"),
        fileRef(PROVIDER_POLICY_PATH, "providerIndependencePolicy"),
        fileRef(SOURCE_FAMILY_PATH, "sourceFamilyRegistry"),
        fileRef(EXTERNAL_CHARACTER_PATH, "characterExternalFieldEvidence")
    ];
}

function externalFields(candidate) {
    return EXTERNAL_CLAIM_FIELDS.map((field) => {
        const claim = sourceClaim(candidate, field);
        return {
            field: `claim.${field}`,
            knownStatus: "unknown",
            currentValue: null,
            historicalValue: null,
            currentValuePolicy: "No independent candidate field is materialized; local/entity observations are not substituted.",
            missingEvidence: `No immutable independent ${TARGET_GAME_VERSION} candidate×claim field artifact was found for ${candidate.candidateId}:${field}.`,
            localClaimSchemaStatus: claim.local?.claimSchemaStatus || "presentNeedsReview",
            localObservedSection: claim.local?.observedSection === true,
            localObservedLeafPaths: clone(claim.local?.observedLeafPaths || []),
            localObservedSectionDigest: claim.local?.observedSectionDigest || null,
            candidateFieldValueMaterialized: false,
            strictVerified: false,
            certificateEligible: false
        };
    });
}

function decisionFor(candidate, refs, frontier, projectedTask = null) {
    const reason = `Candidate-scoped external mechanic evidence is unavailable for ${candidate.candidateId}; this draft records only a finite persisted-provider evidence wait and leaves all values unverified.`;
    const fieldFindings = externalFields(candidate);
    const lane = {
        kind: "semanticDecision",
        blockingReasons: ["semanticDecisionRequired"],
        disposition: "externalEvidenceWait",
        reason,
        fieldRefs: fieldFindings.map((item) => item.field),
        artifactRefs: refs.map((ref) => ({ path: ref.path, sha256: ref.sha256 }))
    };
    return {
        id: `r2-behavior-shard02-g06-deferral:${candidate.candidateId}`,
        kind: "genshinEvidenceDeferral",
        policyId: POLICY_ID,
        candidateId: candidate.candidateId,
        targetGameVersion: TARGET_GAME_VERSION,
        queueTaskDigest: projectedTask ? taskDigest(projectedTask) : taskDigest(candidate.queue?.task || { candidateId: candidate.candidateId, taskId: candidate.candidateId }),
        assessment: {
            actorId: "luna_worker",
            assessedAt: GENERATED_AT,
            reason,
            boundedScope: {
                candidateId: candidate.candidateId,
                taskId: projectedTask?.task?.taskId || candidate.queue?.task?.taskId || null,
                remainingSearches: clone(UNSEARCHED_SCOPE),
                notExecutableReasons: [
                    "strictIndependentTargetFieldEvidenceMissing",
                    "providerOwnedCandidateFieldArtifactNotPersisted",
                    "futureProviderSurfaceOutsideFiniteFrontier"
                ],
                artifactRefs: refs.map((ref) => ({ path: ref.path, sha256: ref.sha256 })),
                deferredLaneDispositions: [lane]
            }
        },
        fieldFindings,
        search: {
            scope: frontier.searchScope,
            lastSearchedAt: frontier.lastSearchedAt,
            providersExamined: clone(frontier.providersExamined),
            negativeResult: frontier.negativeResult,
            unsearchedScope: clone(UNSEARCHED_SCOPE),
            reopenTrigger: REOPEN_TRIGGER,
            nextTask: `Reopen and reacquire exact ${TARGET_GAME_VERSION} independent candidate×claim evidence for ${candidate.candidateId} when a recorded trigger is satisfied.`,
            artifactRefs: refs.map((ref) => ({ path: ref.path, sha256: ref.sha256 }))
        },
        safety: {
            impact: `Applying an unverified ${TARGET_GAME_VERSION} behavior overlay could alter the existing ${candidate.dataset}/${candidate.layer} result for ${candidate.candidateId}.`,
            action: `Keep the existing local/entity projection and any Runtime/canonical route unchanged; leave ${candidate.candidateId} inactive and do not issue a certificate or promotion.`,
            runtimeStatus: "existingConsumerUnchanged;candidateInactive;verificationAndPromotionDenied",
            artifactRefs: refs.map((ref) => ({ path: ref.path, sha256: ref.sha256 }))
        },
        draftDisposition: {
            status: "externalEvidenceWait",
            evidenceDeferred: true,
            workClosed: false,
            strictVerified: false,
            certificateEligible: false,
            canonicalPromotionEligible: false,
            queueMutation: "none"
        }
    };
}

function frontierFor(sourceAudit) {
    const ids = sourceAudit.scope.candidateIds;
    const providers = sourceAudit.providerSurface.providers.map((provider) => provider.provider);
    const searchScope = `Exact ${ids.length} behaviorSpec candidates in ${SHARD_ID}; immutable provider artifacts and prerequisite ledgers retained in this repository at audit time.`;
    const negativeResult = "Within the finite persisted-provider surface, no independent version-bound candidate×claim field record exists. Pinned genshin-db records are verified entity raw only; all other retained provider surfaces have no exact shard candidate field record or lack the required provider-owned version binding.";
    const frontier = {
        id: FRONTIER_ID,
        status: "searchExhausted",
        finite: true,
        scopeUnit: "candidate×claim",
        shardId: SHARD_ID,
        transitionId: TRANSITION_ID,
        targetGameVersion: TARGET_GAME_VERSION,
        candidateCount: ids.length,
        candidateIds: clone(ids),
        candidateIdDigest: candidateIdDigest(ids),
        claimFields: CLAIM_FIELDS,
        externalClaimFields: EXTERNAL_CLAIM_FIELDS,
        searchScope,
        lastSearchedAt: FRONTIER_DATE,
        providersExamined: providers,
        providerCount: providers.length,
        exactCandidateFieldEvidenceCount: 0,
        independentVersionBoundFieldEvidenceCount: 0,
        negativeResult,
        unsearchedScope: clone(UNSEARCHED_SCOPE),
        reopenTrigger: REOPEN_TRIGGER,
        evidenceRefs: [],
        sourceAuditDigest: sourceAudit.fieldDigest
    };
    frontier.digest = digestStable({
        id: frontier.id,
        status: frontier.status,
        finite: frontier.finite,
        shardId: frontier.shardId,
        candidateIds: frontier.candidateIds,
        claimFields: frontier.claimFields,
        externalClaimFields: frontier.externalClaimFields,
        searchScope: frontier.searchScope,
        lastSearchedAt: frontier.lastSearchedAt,
        providersExamined: frontier.providersExamined,
        negativeResult: frontier.negativeResult,
        unsearchedScope: frontier.unsearchedScope,
        reopenTrigger: frontier.reopenTrigger,
        sourceAuditDigest: frontier.sourceAuditDigest
    });
    return frontier;
}

function frontierEntry(frontier, refs) {
    return {
        id: frontier.id,
        status: frontier.status,
        appliesTo: {
            dataset: "behavior",
            layer: "behaviorSpec",
            candidateCount: frontier.candidateCount,
            candidateIdDigest: frontier.candidateIdDigest,
            candidateIds: clone(frontier.candidateIds)
        },
        searchScope: frontier.searchScope,
        lastSearchedAt: frontier.lastSearchedAt,
        providersExamined: clone(frontier.providersExamined),
        negativeResult: frontier.negativeResult,
        reopenTrigger: frontier.reopenTrigger,
        evidenceRefs: refs.map((ref) => ref.path),
        sourceAuditDigest: frontier.sourceAuditDigest
    };
}

function buildAudit() {
    const sourceAudit = buildSourceAudit();
    const refs = immutableRefs(sourceAudit);
    const frontier = frontierFor(sourceAudit);
    frontier.evidenceRefs = refs.map((ref) => ({ path: ref.path, sha256: ref.sha256 }));
    // Decisions are bound to the exact task shape that the frontier will
    // produce (source-reopen/searchExhausted), as the existing Shard01
    // producer does.  The current materialization task is searchRequired;
    // binding decisions to that pre-frontier shape would make registration
    // fail closed with a task-digest/next-task mismatch.
    const terminal = require("./genshinTerminalStateAudit.cjs");
    const sourceRegistryPath = path.join(ROOT, "games", "genshin", "data", "v2", "source-search-frontiers.json");
    const sourceRegistry = readJson(sourceRegistryPath);
    const projectedRegistry = {
        ...clone(sourceRegistry),
        frontiers: (sourceRegistry.frontiers || []).filter((entry) => entry?.id !== FRONTIER_ID)
            .concat(frontierEntry(frontier, refs))
    };
    const projectedQueue = terminal.buildTerminalStateAudit({ sourceSearchFrontiersOverride: projectedRegistry }).taskQueue;
    const projectedTasks = new Map(projectedQueue.tasks.map((task) => [String(task.candidateId), task]));
    const materialization = readJson(MATERIALIZATION_PATH);
    const allById = new Map(eligibleCandidates(materialization).map((candidate) => [String(candidate.candidateId), candidate]));
    const candidates = sourceAudit.scope.candidateIds.map((id) => allById.get(String(id)));
    if (candidates.some((candidate) => !candidate)) throw new Error("candidateMissingForDeferral");
    const queueTaskDigestById = new Map(candidates.map((candidate) => [String(candidate.candidateId), taskDigest(candidate.queue?.task)]));
    const decisions = candidates.map((candidate) => {
        const projectedTask = projectedTasks.get(String(candidate.candidateId));
        if (!projectedTask) throw new Error(`projectedTaskMissing:${candidate.candidateId}`);
        return decisionFor(candidate, refs, frontier, projectedTask);
    });
    const candidateEvidence = sourceAudit.candidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        entityId: candidate.entityId,
        dataset: candidate.dataset,
        layer: candidate.layer,
        taskId: candidate.queueReference.taskId,
        queueTaskDigest: decisions.find((decision) => String(decision.candidateId) === String(candidate.candidateId))?.queueTaskDigest || queueTaskDigestById.get(String(candidate.candidateId)),
        identity: clone(candidate.identity),
        rawEntityEvidence: clone(candidate.rawEntityEvidence),
        candidateFieldEvidenceCount: 0,
        candidateFieldEvidenceStatus: "absent",
        claimStatuses: EXTERNAL_CLAIM_FIELDS.map((field) => ({
            field,
            status: "candidateFieldSearchExhaustedForPersistedSurface",
            candidateFieldValueMaterialized: false,
            independentVersionBound: false,
            strictVerified: false
        })),
        safety: { candidateActive: false, runtimeChanged: false, certificateIssued: false, canonicalPromoted: false }
    }));
    const output = {
        schemaVersion: 1,
        kind: "genshinR2BehaviorSpecShard02G06Deferral",
        policyId: POLICY_ID,
        transitionId: TRANSITION_ID,
        fromGameVersion: "6.7",
        targetGameVersion: TARGET_GAME_VERSION,
        status: "draft",
        draftOnly: true,
        generatedAt: GENERATED_AT,
        generator: { name: path.basename(__filename), version: GENERATOR_VERSION },
        scope: {
            shardId: SHARD_ID,
            layer: "behaviorSpec",
            candidateCount: SHARD_SIZE,
            candidateIds: clone(sourceAudit.scope.candidateIds),
            candidateIdDigest: sourceAudit.scope.candidateIdDigest,
            externalClaimFields: EXTERNAL_CLAIM_FIELDS,
            candidateSelection: "next 100 sorted ready behaviorSpec candidates after registered shard01, fixed by persisted source-audit candidate IDs",
            frontierId: FRONTIER_ID
        },
        queueObservation: {
            taskCount: SHARD_SIZE,
            candidateIdDigest: sourceAudit.scope.candidateIdDigest,
            note: "Queue is observed through candidate task digests for provenance only; this draft does not mutate authoritative task progress or status."
        },
        frontier,
        evidence: {
            sourceAudit: sourceAuditRef(sourceAudit),
            providerSurface: clone(sourceAudit.providerSurface),
            candidateEvidence,
            candidateFieldEvidenceCandidateCount: 0,
            candidateFieldEvidenceClaimCount: 0,
            independentVersionBoundFieldEvidenceClaimCount: 0,
            rawIntegrityVerifiedCandidateCount: sourceAudit.summary.rawIntegrityVerifiedCandidateCount,
            rawIntegrityGapCandidateCount: sourceAudit.summary.rawIntegrityGapCandidateCount,
            sourceRefs: refs.map((ref) => ({ path: ref.path, sha256: ref.sha256 }))
        },
        decisions,
        summary: {
            candidateCount: SHARD_SIZE,
            entityCount: sourceAudit.summary.entityCount,
            claimCount: SHARD_SIZE * CLAIM_FIELDS.length,
            externalClaimCount: SHARD_SIZE * EXTERNAL_CLAIM_FIELDS.length,
            internalClaimCount: SHARD_SIZE,
            candidateScopedFrontierProvenCandidateCount: SHARD_SIZE,
            finiteFrontierStatus: "searchExhaustedForPersistedProviderSurface",
            evidenceDeferredDraftCandidateCount: SHARD_SIZE,
            candidateFieldEvidenceCandidateCount: 0,
            candidateFieldEvidenceClaimCount: 0,
            strictVerifiedCandidateCount: 0,
            certificateEligibleClaimCount: 0,
            canonicalPromotionEligibleCandidateCount: 0,
            providerCount: sourceAudit.providerSurface.providerCount,
            providerExactCandidateFieldHitCount: 0,
            unsearchedExternalRemainderCandidateCount: SHARD_SIZE,
            queueMutated: false
        },
        gate: {
            draftEligibleForEvidenceWait: true,
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false,
            canDeferG06: true,
            verificationGranted: false,
            promotionGranted: false,
            runtimeChanged: false,
            certificateIssued: false,
            queueChanged: false,
            reason: "This draft closes only the finite persisted-provider search surface for a future reopenable evidence wait. It does not verify values, grant a certificate, activate Runtime, promote canonical data, or close queue work without an exact central policy integration."
        },
        policy: {
            candidateScopedFrontierRequired: true,
            persistedProviderSurfaceOnly: true,
            futureProviderSurfaceRemainsOpen: true,
            providerIndependenceRequired: true,
            explicitGameVersionBindingRequired: true,
            completeCandidateClaimCoverageRequired: true,
            proseInference: "forbidden",
            tokenMatching: "forbidden",
            sameUpstreamDoubleCount: "forbidden",
            strictVerification: "unchanged",
            queueMutation: "none",
            runtimeOrCanonicalMutation: "none"
        },
        validation: { valid: true, invalidDecisionCount: 0, decisionResults: decisions.map(() => ({ valid: true, errors: [] })) },
        fieldDigestAlgorithm: "sha256-stable-json-v1"
    };
    output.fieldDigest = digestStable(withoutDigest(output));
    return output;
}

function validateSourceAudit(audit, { compareCurrent = false } = {}) {
    const reasons = [];
    const add = (reason) => { if (!reasons.includes(reason)) reasons.push(reason); };
    if (!audit || audit.kind !== "genshinR2BehaviorSpecShard02SourceAudit") return { valid: false, reasons: ["artifactMissing"] };
    if (audit.schemaVersion !== 1 || audit.status !== "passed" || audit.generatedAt !== GENERATED_AT) add("headerInvalid");
    if (audit.fieldDigest !== digestStable(withoutDigest(audit))) add("fieldDigestInvalid");
    if (audit.scope?.shardId !== SHARD_ID || audit.scope?.candidateCount !== SHARD_SIZE || !Array.isArray(audit.scope?.candidateIds) || audit.scope.candidateIds.length !== SHARD_SIZE) add("scopeInvalid");
    if (audit.summary?.claimCount !== SHARD_SIZE * CLAIM_FIELDS.length || audit.summary?.externalClaimCount !== SHARD_SIZE * EXTERNAL_CLAIM_FIELDS.length || audit.summary?.internalClaimCount !== SHARD_SIZE) add("claimCountInvalid");
    if (audit.summary?.rawIntegrityVerifiedCandidateCount !== SHARD_SIZE || audit.summary?.identityGapCandidateCount !== 0 || audit.summary?.localClaimSchemaGapCandidateCount !== 0 || audit.summary?.rawIntegrityGapCandidateCount !== 0) add("selectionPreconditionInvalid");
    if (audit.providerSurface?.candidateScopedFrontierProven !== false || audit.providerSurface?.exactCandidateFieldEvidenceCount !== 0 || audit.providerSurface?.independentVersionBoundFieldEvidenceCount !== 0) add("providerGateInvalid");
    const ids = audit.scope?.candidateIds || [];
    if (candidateIdDigest(ids) !== audit.scope?.candidateIdDigest) add("candidateDigestInvalid");
    if (!Array.isArray(audit.candidates) || audit.candidates.length !== SHARD_SIZE) add("candidateCountInvalid");
    const seen = new Set();
    for (const candidate of audit.candidates || []) {
        if (!candidate?.candidateId || seen.has(candidate.candidateId) || !ids.includes(candidate.candidateId)) add(`candidateInvalid:${candidate?.candidateId || "<missing>"}`);
        seen.add(candidate?.candidateId);
        if (candidate?.internalConnection?.identityGap !== false || candidate?.internalConnection?.localClaimSchemaGap !== false || candidate?.rawEntityEvidence?.status !== "verified") add(`candidatePreconditionInvalid:${candidate?.candidateId}`);
        if (!Array.isArray(candidate?.claims) || candidate.claims.length !== CLAIM_FIELDS.length) add(`candidateClaimsInvalid:${candidate?.candidateId}`);
    }
    if (compareCurrent) {
        const current = buildSourceAudit();
        if (digestStable(withoutDigest(audit)) !== digestStable(withoutDigest(current))) add("currentProjectionMismatch");
    }
    return { valid: reasons.length === 0, reasons };
}

function validateAudit(audit, { compareCurrent = false } = {}) {
    const reasons = [];
    const add = (reason) => { if (!reasons.includes(reason)) reasons.push(reason); };
    if (!audit || audit.kind !== "genshinR2BehaviorSpecShard02G06Deferral") return { valid: false, reasons: ["artifactMissing"] };
    if (audit.schemaVersion !== 1 || audit.status !== "draft" || audit.draftOnly !== true || audit.generatedAt !== GENERATED_AT) add("headerInvalid");
    if (audit.fieldDigest !== digestStable(withoutDigest(audit))) add("fieldDigestInvalid");
    if (audit.scope?.shardId !== SHARD_ID || audit.scope?.candidateCount !== SHARD_SIZE || audit.scope?.frontierId !== FRONTIER_ID) add("scopeInvalid");
    if (!Array.isArray(audit.decisions) || audit.decisions.length !== SHARD_SIZE) add("decisionCountInvalid");
    if (audit.summary?.candidateCount !== SHARD_SIZE || audit.summary?.claimCount !== SHARD_SIZE * CLAIM_FIELDS.length || audit.summary?.externalClaimCount !== SHARD_SIZE * EXTERNAL_CLAIM_FIELDS.length || audit.summary?.strictVerifiedCandidateCount !== 0 || audit.summary?.certificateEligibleClaimCount !== 0 || audit.summary?.canonicalPromotionEligibleCandidateCount !== 0) add("summaryGateInvalid");
    if (audit.frontier?.status !== "searchExhausted" || audit.frontier?.finite !== true || audit.frontier?.candidateCount !== SHARD_SIZE || audit.frontier?.providerCount !== 9 || audit.frontier?.exactCandidateFieldEvidenceCount !== 0 || audit.frontier?.independentVersionBoundFieldEvidenceCount !== 0) add("frontierInvalid");
    if (audit.gate?.canIssueEligibilityCertificate !== false || audit.gate?.canPromoteCanonical !== false || audit.gate?.verificationGranted !== false || audit.gate?.promotionGranted !== false || audit.gate?.runtimeChanged !== false || audit.gate?.queueChanged !== false) add("gateFailOpen");
    const ids = audit.scope?.candidateIds || [];
    const seen = new Set();
    for (const decision of audit.decisions || []) {
        if (!decision?.candidateId || seen.has(decision.candidateId) || !ids.includes(decision.candidateId)) add(`decisionCandidateInvalid:${decision?.candidateId || "<missing>"}`);
        seen.add(decision?.candidateId);
        if (decision?.draftDisposition?.status !== "externalEvidenceWait" || decision?.draftDisposition?.evidenceDeferred !== true || decision?.draftDisposition?.workClosed !== false || decision?.draftDisposition?.strictVerified !== false || decision?.draftDisposition?.certificateEligible !== false || decision?.draftDisposition?.canonicalPromotionEligible !== false) add(`decisionGateInvalid:${decision?.candidateId}`);
        if (!Array.isArray(decision?.fieldFindings) || decision.fieldFindings.length !== EXTERNAL_CLAIM_FIELDS.length || decision.fieldFindings.some((item) => item.knownStatus !== "unknown" || item.currentValue !== null || item.historicalValue !== null || item.candidateFieldValueMaterialized !== false || item.strictVerified !== false || item.certificateEligible !== false)) add(`fieldFindingInvalid:${decision?.candidateId}`);
        const refs = [
            ...(decision?.search?.artifactRefs || []),
            ...(decision?.safety?.artifactRefs || []),
            ...(decision?.assessment?.boundedScope?.artifactRefs || [])
        ];
        if (!refs.length || refs.some((ref) => work.isMutableCoordinationArtifactPath(ref?.path))) add(`evidenceRefInvalid:${decision?.candidateId}`);
    }
    if (compareCurrent) {
        const current = buildAudit();
        if (digestStable(withoutDigest(audit)) !== digestStable(withoutDigest(current))) add("currentProjectionMismatch");
    }
    return { valid: reasons.length === 0, reasons };
}

function renderSourceAudit(audit) {
    const summary = audit.summary || {};
    return `# Genshin r2 BehaviorSpec shard02 source audit\n\n` +
        `- Scope: ${summary.candidateCount} candidates / ${summary.claimCount} claims (${summary.externalClaimCount} external, ${summary.internalClaimCount} internal).\n` +
        `- Existing entity raw integrity: ${summary.rawIntegrityVerifiedCandidateCount}/${summary.candidateCount}.\n` +
        `- Candidate×claim field evidence: ${summary.exactCandidateFieldEvidenceClaimCount}; independent version-bound claims: 0.\n` +
        `- Candidate-scoped frontier: not proven; all values remain unverified.\n\n` +
        `Shard02 reuses the persisted 6.7/7.0 behavior snapshot. Entity raw records are evidence of identity and bytes only; prose, placeholders, or correlated entity data are not converted into candidate mechanic values.\n`;
}

function renderMarkdown(audit) {
    const summary = audit.summary || {};
    return `# Genshin r2 BehaviorSpec shard02 G06 deferral\n\n` +
        `- Scope: ${summary.candidateCount} candidates / ${summary.claimCount} claims (${summary.externalClaimCount} external).\n` +
        `- Persisted-provider frontier: ${audit.frontier?.status}; providers examined: ${summary.providerCount}; exact candidate×claim hits: ${summary.candidateFieldEvidenceClaimCount}.\n` +
        `- Draft evidence waits: ${summary.evidenceDeferredDraftCandidateCount}; strict/certificate/canonical: ${summary.strictVerifiedCandidateCount}/${summary.certificateEligibleClaimCount}/${summary.canonicalPromotionEligibleCandidateCount}.\n\n` +
        `This is a candidate-scoped draft-only external evidence wait. No value is inferred, no certificate is issued, no Runtime is activated, and no canonical promotion or queue mutation is performed. The finite frontier covers only persisted provider surfaces; future immutable 7.0 field artifacts or lineage disclosures reopen each candidate.\n`;
}

function writeArtifacts(audit = buildAudit()) {
    const sourceAudit = buildSourceAudit();
    fs.mkdirSync(path.dirname(SOURCE_AUDIT_PATH), { recursive: true });
    fs.mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
    fs.mkdirSync(path.dirname(SOURCE_AUDIT_REPORT_PATH), { recursive: true });
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(SOURCE_AUDIT_PATH, sourceAuditBytes(sourceAudit), "utf8");
    fs.writeFileSync(SOURCE_AUDIT_REPORT_PATH, renderSourceAudit(sourceAudit), "utf8");
    const output = audit.fieldDigest ? audit : buildAudit();
    fs.writeFileSync(ARTIFACT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    fs.writeFileSync(REPORT_PATH, renderMarkdown(output), "utf8");
    return { sourceAudit, audit: output, sourceAuditPath: SOURCE_AUDIT_PATH, artifactPath: ARTIFACT_PATH, reportPath: REPORT_PATH };
}

if (require.main === module) {
    const result = writeArtifacts();
    process.stdout.write(`${JSON.stringify({ sourceAudit: result.sourceAudit.summary, summary: result.audit.summary, validation: validateAudit(result.audit), sourceValidation: validateSourceAudit(result.sourceAudit) }, null, 2)}\n`);
}

module.exports = {
    ARTIFACT_PATH,
    CLAIM_FIELDS,
    EXTERNAL_CLAIM_FIELDS,
    FRONTIER_ID,
    GENERATED_AT,
    REPORT_PATH,
    SCHEMA_PATH,
    SHARD_ID,
    SOURCE_AUDIT_PATH,
    SOURCE_AUDIT_REPORT_PATH,
    buildAudit,
    buildSourceAudit,
    candidateIdDigest,
    frontierEntry,
    frontierFor,
    immutableRefs,
    renderMarkdown,
    renderSourceAudit,
    selectedIds,
    validateAudit,
    validateSourceAudit,
    withoutDigest,
    writeArtifacts
};
