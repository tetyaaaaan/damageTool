"use strict";

/**
 * Bounded source audit for the first deterministic behaviorSpec shard.
 *
 * This producer consumes the already captured transition materialization and
 * provider ledgers. It does not infer numbers from prose, promote Runtime or
 * canonical data, issue a certificate, or mutate the authoritative queue.
 * A provider-wide search result is deliberately not treated as a candidate x
 * claim result. The shard remains open when no immutable candidate field
 * artifact is present.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { digestStable } = require("./genshinVersionEvidenceValidation.cjs");
const materialization = require("./genshinR2BehaviorSpecMaterializationAudit.cjs");

const ROOT = path.resolve(__dirname, "..");
const QUEUE_PATH = path.join(ROOT, "reports", "genshin-evidence-task-queue.json");
const MATERIALIZATION_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "reviews", "r2-behavior-spec-materialization-audit.json");
const FRONTIER_INVENTORY_PATH = path.join(ROOT, "reports", "genshin-candidate-source-coverage-frontier-inventory.json");
const SOURCE_SEARCH_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0", "source-search.json");
const SOURCE_FRONTIERS_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "source-search-frontiers.json");
const PROVIDER_POLICY_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "provider-independence-policy.json");
const SOURCE_FAMILY_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "source-family-registry.json");
const EXTERNAL_CHARACTER_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "characters", "external-field-evidence.json");
const ARTIFACT_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "reviews", "r2-behavior-spec-shard01-source-audit.json");
const REPORT_PATH = path.join(ROOT, "reports", "genshin-r2-behavior-spec-shard01-source-audit.md");
const SCHEMA_PATH = path.join(ROOT, "games", "genshin", "data", "schema", "r2-behavior-spec-shard01-source-audit.schema.json");

const GENERATED_AT = "2026-08-30T00:00:00.000Z";
const GENERATOR_VERSION = "genshinR2BehaviorSpecShard01SourceAudit/1";
const TRANSITION_ID = "genshin:6.7->7.0";
const TARGET_VERSION = "7.0";
const SHARD_ID = "behavior:behaviorSpec:semanticDecisionRequired:standard:01";
const SHARD_SIZE = 100;
const CLAIM_FIELDS = ["sourceText", "timing", "execution", "lifecycle", "energy", "snapshot", "runtime"];
const EXTERNAL_CLAIM_FIELDS = CLAIM_FIELDS.filter((field) => field !== "runtime");
const CLEAR_IDENTITY_STATUSES = new Set(["resolvedUnambiguous", "resolvedUnambiguousByProviderName"]);
const EXPECTED_CANDIDATE_COUNT = 100;
const EXPECTED_CLAIM_COUNT = 700;
const EXPECTED_EXTERNAL_CLAIM_COUNT = 600;
const EXPECTED_INTERNAL_CLAIM_COUNT = 100;

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
    return {
        path: relative(file),
        role,
        exists,
        bytes: bytes ? bytes.length : null,
        sha256: bytes ? sha256(bytes) : null
    };
}

function sortStrings(values) {
    return [...new Set((values || []).filter((value) => value !== null && value !== undefined).map(String))]
        .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
}

function countBy(values) {
    return Object.fromEntries(Object.entries((values || []).reduce((out, value) => {
        const key = String(value ?? "<null>");
        out[key] = (out[key] || 0) + 1;
        return out;
    }, {})).sort(([left], [right]) => left.localeCompare(right)));
}

function candidateIdDigest(ids) {
    return digestStable(sortStrings(ids));
}

function providerKey(provider) {
    const text = String(provider || "").toLowerCase();
    if (text.includes("gcsim")) return "gcsim";
    if (text.includes("optimizer")) return "genshinOptimizer";
    if (text.includes("gachabase")) return "gachabase";
    if (text.includes("kqm")) return "kqm";
    if (text.includes("teyvat")) return "teyvatGuide";
    if (text.includes("yatta")) return "yatta";
    if (text.includes("hoyolab") || text.includes("hoyoverse") || text.includes("hoyowiki")) return "official";
    if (text.includes("genshin-db") || text.includes("bowja")) return "genshinDb";
    if (text.includes("dimbreath") || text.includes("animegamedata")) return "dimbreath";
    return text.replace(/[^a-z0-9]+/g, "-") || "unknown";
}

function providerMatchesExternalCandidate(candidateId, provider, externalEvidence) {
    const key = providerKey(provider);
    const rows = Object.values(externalEvidence?.candidates || {}).filter((row) => String(row?.id || "") === String(candidateId));
    return rows.flatMap((row) => (row.evidence || []).filter((item) => {
        const sourceId = String(item?.externalSourceId || "").toLowerCase();
        return key === "gcsim" ? sourceId.includes("gcsim")
            : key === "genshinOptimizer" ? sourceId.includes("genshinoptimizer")
                : false;
    })).length;
}

function providerPolicyRow(provider, policy) {
    const key = providerKey(provider);
    const rows = policy?.policies || [];
    return rows.find((row) => providerKey(row?.providerA) === key || providerKey(row?.providerB) === key) || null;
}

function providerSurface(sourceSearch, policy, externalEvidence, candidateIds, rawEntityCount) {
    const providers = (sourceSearch?.providersExamined || []).map((row) => {
        const provider = row?.provider || null;
        const policyRow = providerPolicyRow(provider, policy);
        const exactCandidateRecordCount = candidateIds.reduce((sum, candidateId) => sum
            + providerMatchesExternalCandidate(candidateId, provider, externalEvidence), 0);
        const candidateIdsInPolicyScope = candidateIds.filter((candidateId) =>
            (policyRow?.scope || []).some((scope) => String(scope).includes(String(candidateId))));
        const isGenshinDb = providerKey(provider) === "genshinDb";
        return {
            provider,
            sourceFamily: row?.sourceFamily || null,
            evidenceRef: row?.evidenceRef || null,
            providerPolicyId: policyRow?.id || null,
            policyStatus: policyRow?.status || null,
            policyScopeCandidateHits: candidateIdsInPolicyScope,
            exactCandidateFieldRecordCount: exactCandidateRecordCount,
            entityRawRecordCount: isGenshinDb ? rawEntityCount : 0,
            candidateFieldMaterialization: exactCandidateRecordCount > 0 ? "descriptorOrFieldRecordPresent" : "none",
            candidateScopeStatus: exactCandidateRecordCount > 0 ? "candidateRecordPresentNeedsFieldReview" : "noCandidateScopedRecordInPersistedEvidence",
            versionBindingStatus: isGenshinDb ? "entityRawOnlyBoundSides" : "notProvenForShardClaims",
            independentFieldEvidence: false,
            strictEligible: false,
            reason: isGenshinDb
                ? "Pinned 6.7/7.0 entity raw is captured, but no behavior candidate×claim field is materialized."
                : "The retained provider evidence has no exact shard candidate×claim record."
        };
    });
    return {
        providerWideLedgerStatus: providers.length > 0 ? "inspected" : "missing",
        providerCount: providers.length,
        providers,
        candidateScopeStatus: "notProven",
        candidateScopedFrontierStatus: "notRecorded",
        candidateScopedFrontierProven: false,
        exactCandidateFieldEvidenceCount: providers.reduce((sum, row) => sum + row.exactCandidateFieldRecordCount, 0),
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
            providersExamined: providers.map((row) => row.provider).filter(Boolean),
            reopenTrigger: "Provider-owned immutable 7.0 field manifest with exact raw/field digest, newly disclosed independent lineage, or candidate-scoped exact field evidence"
        }
    };
}

function selectShard(materializationAudit) {
    const candidates = (materializationAudit?.claim?.candidates || [])
        .filter((candidate) => candidate?.queue?.task?.status === "ready"
            && candidate?.queue?.searchFrontier?.status === "searchRequired"
            && candidate?.queue?.primaryBlockReason === "semanticDecisionRequired"
            && CLEAR_IDENTITY_STATUSES.has(candidate?.transitionRaw?.identityStatus)
            && candidate?.transitionRaw?.rawIntegrityStatus === "verified"
            && (candidate.candidateClaims || []).length === CLAIM_FIELDS.length
            && candidate.candidateClaims.every((claim) => claim?.local?.claimSchemaStatus === "presentNeedsReview"))
        .sort((left, right) => String(left.candidateId).localeCompare(String(right.candidateId), "en", { numeric: true }));
    if (candidates.length < SHARD_SIZE) throw new Error(`shardSelectionInsufficient:${candidates.length}`);
    return candidates.slice(0, SHARD_SIZE);
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

function queueObservation(queue) {
    return {
        taskId: queue?.task?.taskId || null,
        taskStatus: queue?.task?.status || null,
        taskKind: queue?.task?.kind || null,
        primaryBlockReason: queue?.primaryBlockReason || null,
        blockReasons: clone(queue?.blockReasons || []),
        searchFrontier: {
            status: queue?.searchFrontier?.status || null,
            exhausted: queue?.searchFrontier?.exhausted ?? null,
            scopeMatched: queue?.searchFrontier?.scopeMatched ?? null,
            policyId: queue?.searchFrontier?.policyId || null,
            providersExamined: clone(queue?.searchFrontier?.providersExamined || [])
        },
        queueCandidateFrontierLink: "notRecorded"
    };
}

function claimRow(candidate, field, providerSurface) {
    const original = (candidate.candidateClaims || []).find((claim) => claim.field === field) || {};
    const external = original.claimKind === "externalFactual";
    return {
        claimId: original.claimId || `${candidate.candidateId}:${field}`,
        candidateId: candidate.candidateId,
        field,
        claimKind: original.claimKind || (external ? "externalFactual" : "internalRuntimeRoute"),
        local: {
            claimSchemaStatus: original.local?.claimSchemaStatus || "missing",
            claimStatus: original.local?.claimStatus || null,
            observedSection: original.local?.observedSection === true,
            observedLeafPaths: clone(original.local?.observedLeafPaths || []),
            observedSectionDigest: original.local?.observedSectionDigest || null
        },
        existingCorrelatedEvidence: {
            provider: "genshin-db",
            sourceFamily: candidate.transitionRaw?.sourceFamily || "GenshinData-derived",
            rawEvidenceStatus: original.rawEvidence?.rawIntegrityStatus || null,
            beforeFieldDigest: original.rawEvidence?.rawBeforeFieldDigest || null,
            afterFieldDigest: original.rawEvidence?.rawAfterFieldDigest || null,
            candidateFieldValueMaterialized: false,
            entityRecordOnly: true
        },
        providerSearchRef: digestStable({
            shardId: SHARD_ID,
            candidateId: candidate.candidateId,
            field,
            providersExamined: providerSurface.finiteFrontier.providersExamined
        }),
        providerFieldEvidence: providerSurface.providers.map((provider) => ({
            provider: provider.provider,
            sourceFamily: provider.sourceFamily,
            exactCandidateFieldRecordCount: provider.exactCandidateFieldRecordCount,
            candidateScopeStatus: provider.candidateScopeStatus,
            candidateFieldValueMaterialized: false,
            independentVersionBound: false,
            strictEligible: false
        })),
        disposition: external ? {
            status: "candidateFieldSearchRequired",
            candidateScopedFrontierStatus: "notProven",
            candidateFieldValueMaterialized: false,
            evidenceDeferred: false,
            strictVerified: false,
            certificateEligible: false,
            canonicalPromotionEligible: false,
            reasons: ["candidateFieldEvidenceAbsent", "providerCandidateScopeNotRecorded", "finiteFrontierUnproven", "inferenceForbidden"]
        } : {
            status: "internalMetadataOnly",
            candidateScopedFrontierStatus: "notApplicable",
            candidateFieldValueMaterialized: false,
            evidenceDeferred: false,
            strictVerified: false,
            certificateEligible: false,
            canonicalPromotionEligible: false,
            reasons: ["internalRuntimeMetadataOnly", "externalClaimsRemainOpen"]
        }
    };
}

function buildCandidate(candidate, rank, providerSurface) {
    const raw = candidate.transitionRaw || {};
    const claims = CLAIM_FIELDS.map((field) => claimRow(candidate, field, providerSurface));
    const externalClaims = claims.filter((claim) => claim.claimKind === "externalFactual");
    return {
        candidateId: candidate.candidateId,
        dataset: candidate.dataset || null,
        layer: candidate.layer || "behaviorSpec",
        entityId: candidate.entityId || null,
        component: candidate.component || null,
        selectionRank: rank,
        identity: {
            status: raw.identityStatus || null,
            provider: raw.provider || null,
            sourceFamily: raw.sourceFamily || null,
            providerSlug: raw.providerSlug || null,
            recordKind: raw.recordKind || null,
            componentPointer: raw.componentPointer || null
        },
        queue: queueObservation(candidate.queue),
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
            providersExamined: providerSurface.providers.map((provider) => provider.provider),
            exactCandidateFieldEvidenceCount: 0,
            independentVersionBoundFieldEvidenceCount: 0,
            candidateScopedFrontierStatus: "notProven",
            searchExhausted: false
        },
        claims,
        disposition: {
            status: "candidateFieldSearchRequired",
            externalClaimCount: externalClaims.length,
            internalClaimCount: claims.length - externalClaims.length,
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

function buildAudit() {
    const materializationAudit = readJson(MATERIALIZATION_PATH);
    const queue = readJson(QUEUE_PATH);
    const sourceSearch = readJson(SOURCE_SEARCH_PATH);
    const sourceFrontiers = readJson(SOURCE_FRONTIERS_PATH);
    const sourceCoverage = readJson(FRONTIER_INVENTORY_PATH);
    const providerPolicy = readJson(PROVIDER_POLICY_PATH);
    const externalCharacterEvidence = readJson(EXTERNAL_CHARACTER_PATH);
    const selected = selectShard(materializationAudit);
    const selectedIds = selected.map((candidate) => candidate.candidateId);
    const provider = providerSurface(sourceSearch, providerPolicy, externalCharacterEvidence, selectedIds, selected.length);
    const candidates = selected.map((candidate, index) => buildCandidate(candidate, index + 1, provider));
    const claims = candidates.flatMap((candidate) => candidate.claims);
    const externalClaims = claims.filter((claim) => claim.claimKind === "externalFactual");
    const internalClaims = claims.filter((claim) => claim.claimKind === "internalRuntimeRoute");
    const batch = (sourceCoverage.batches || []).find((item) => item.batchId === SHARD_ID) || null;
    const output = {
        schemaVersion: 1,
        kind: "genshinR2BehaviorSpecShard01SourceAudit",
        status: "passed",
        generatedAt: GENERATED_AT,
        generator: { name: path.basename(__filename), version: GENERATOR_VERSION },
        scope: {
            transitionId: TRANSITION_ID,
            targetGameVersion: TARGET_VERSION,
            layer: "behaviorSpec",
            shardId: SHARD_ID,
            selection: "first 100 sorted ready behaviorSpec tasks with resolved identity, verified transition raw, and complete local claim schema",
            candidateCount: candidates.length,
            candidateIds: selectedIds,
            candidateIdDigest: candidateIdDigest(selectedIds),
            claimFields: CLAIM_FIELDS,
            externalClaimFields: EXTERNAL_CLAIM_FIELDS,
            expectedBatchCandidateIdDigest: batch?.candidateIdDigest || null,
            expectedBatchStatus: batch?.status || null
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
            authoritativeQueue: fileRef(QUEUE_PATH, "authoritativeQueue"),
            behaviorSpecMaterializationAudit: fileRef(MATERIALIZATION_PATH, "behaviorSpecMaterializationAudit"),
            candidateSourceCoverageFrontierInventory: fileRef(FRONTIER_INVENTORY_PATH, "candidateSourceCoverageFrontierInventory"),
            transitionSourceSearch: fileRef(SOURCE_SEARCH_PATH, "transitionSourceSearch"),
            sourceFrontierRegistry: fileRef(SOURCE_FRONTIERS_PATH, "sourceFrontierRegistry"),
            providerIndependencePolicy: fileRef(PROVIDER_POLICY_PATH, "providerIndependencePolicy"),
            sourceFamilyRegistry: fileRef(SOURCE_FAMILY_PATH, "sourceFamilyRegistry"),
            characterExternalFieldEvidence: fileRef(EXTERNAL_CHARACTER_PATH, "characterExternalFieldEvidence")
        },
        providerSurface: provider,
        candidates,
        summary: {
            candidateCount: candidates.length,
            entityCount: new Set(candidates.map((candidate) => candidate.entityId)).size,
            claimCount: claims.length,
            externalClaimCount: externalClaims.length,
            internalClaimCount: internalClaims.length,
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
            queueToCandidateFieldAdapterMissingCandidateCount: candidates.length,
            sourceSearchProviderCount: provider.providerCount,
            sourceSearchProviderExactCandidateFieldHitCount: provider.exactCandidateFieldEvidenceCount,
            sourceSearchStatusByTask: countBy(candidates.map((candidate) => candidate.queue.searchFrontier.status))
        },
        nextAction: {
            status: "externalProviderCandidateFieldCaptureRequired",
            task: "Persist exact candidate×claim source artifacts with immutable revision/raw/field digests and explicit 7.0 binding, then re-run this shard",
            doNotDo: ["do not infer values from prose", "do not treat entity raw as candidate field proof", "do not issue certificate", "do not promote canonical"]
        },
        gate: {
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false,
            canDeferG06: false,
            reasons: ["candidateFieldEvidenceAbsent", "candidateScopedFrontierNotRecorded", "providerCandidateSurfaceUnsearched", "inferenceForbidden"]
        },
        errors: [],
        fieldDigestAlgorithm: "sha256-stable-json-v1"
    };
    output.fieldDigest = digestStable({
        scope: output.scope,
        policy: output.policy,
        generatedFrom: output.generatedFrom,
        providerSurface: output.providerSurface,
        candidates: output.candidates,
        summary: output.summary,
        nextAction: output.nextAction,
        gate: output.gate
    });
    return output;
}

function withoutDigest(value) {
    const copy = clone(value);
    if (copy && typeof copy === "object") delete copy.fieldDigest;
    return copy;
}

function validateAudit(audit, { compareCurrent = false } = {}) {
    const reasons = [];
    const add = (reason) => { if (!reasons.includes(reason)) reasons.push(reason); };
    if (!audit || typeof audit !== "object" || Array.isArray(audit)) return { valid: false, reasons: ["artifactMissing"] };
    if (audit.schemaVersion !== 1) add("schemaVersionInvalid");
    if (audit.kind !== "genshinR2BehaviorSpecShard01SourceAudit") add("kindInvalid");
    if (audit.status !== "passed") add("statusInvalid");
    if (audit.generatedAt !== GENERATED_AT) add("generatedAtInvalid");
    const digestInput = {
        scope: audit.scope,
        policy: audit.policy,
        generatedFrom: audit.generatedFrom,
        providerSurface: audit.providerSurface,
        candidates: audit.candidates,
        summary: audit.summary,
        nextAction: audit.nextAction,
        gate: audit.gate
    };
    if (audit.fieldDigestAlgorithm !== "sha256-stable-json-v1" || audit.fieldDigest !== digestStable(digestInput)) add("fieldDigestInvalid");
    if (audit.scope?.shardId !== SHARD_ID || audit.scope?.candidateCount !== EXPECTED_CANDIDATE_COUNT) add("scopeInvalid");
    if (!Array.isArray(audit.candidates) || audit.candidates.length !== EXPECTED_CANDIDATE_COUNT) add("candidateCountInvalid");
    if (audit.summary?.claimCount !== EXPECTED_CLAIM_COUNT
        || audit.summary?.externalClaimCount !== EXPECTED_EXTERNAL_CLAIM_COUNT
        || audit.summary?.internalClaimCount !== EXPECTED_INTERNAL_CLAIM_COUNT) add("claimCountInvalid");
    if (audit.providerSurface?.candidateScopedFrontierProven !== false
        || audit.providerSurface?.finiteFrontier?.searchExhausted !== false) add("frontierFailOpen");
    if (audit.summary?.exactCandidateFieldEvidenceCandidateCount !== 0
        || audit.summary?.exactCandidateFieldEvidenceClaimCount !== 0
        || audit.summary?.strictVerifiedCandidateCount !== 0
        || audit.summary?.certificateEligibleClaimCount !== 0
        || audit.summary?.canonicalPromotionEligibleCandidateCount !== 0) add("verificationFailOpen");
    if (audit.gate?.canIssueEligibilityCertificate !== false
        || audit.gate?.canPromoteCanonical !== false
        || audit.gate?.canDeferG06 !== false) add("gateFailOpen");
    const seen = new Set();
    for (const candidate of audit.candidates || []) {
        if (!candidate?.candidateId || seen.has(candidate.candidateId)) add(`candidateIdInvalid:${candidate?.candidateId || "<missing>"}`);
        seen.add(candidate?.candidateId);
        if (candidate.internalConnection?.identityGap !== false
            || candidate.internalConnection?.localClaimSchemaGap !== false
            || candidate.rawEntityEvidence?.status !== "verified") add(`selectionPreconditionInvalid:${candidate?.candidateId}`);
        if (candidate.disposition?.evidenceDeferred !== false
            || candidate.disposition?.closed !== false
            || candidate.disposition?.strictVerified !== false
            || candidate.disposition?.certificateEligible !== false
            || candidate.disposition?.canonicalPromotionEligible !== false) add(`candidateGateFailOpen:${candidate?.candidateId}`);
        for (const claim of candidate.claims || []) {
            if (claim.claimKind === "externalFactual") {
                if (claim.disposition?.candidateFieldValueMaterialized !== false
                    || claim.disposition?.candidateScopedFrontierStatus !== "notProven"
                    || claim.disposition?.strictVerified !== false
                    || claim.disposition?.certificateEligible !== false) add(`claimGateFailOpen:${claim.claimId}`);
            }
        }
    }
    if (compareCurrent) {
        const current = buildAudit();
        if (digestStable(withoutDigest(audit)) !== digestStable(withoutDigest(current))) add("currentProjectionMismatch");
    }
    return { valid: reasons.length === 0, reasons };
}

function renderMarkdown(audit) {
    const summary = audit.summary;
    return `# Genshin r2 behaviorSpec shard01 source audit\n\n` +
        `- Scope: ${summary.candidateCount} candidates / ${summary.claimCount} claims (${summary.externalClaimCount} external, ${summary.internalClaimCount} internal).\n` +
        `- Internal readiness: ${summary.internalReadyCandidateCount}/${summary.candidateCount}; identity/schema/raw gaps: ${summary.identityGapCandidateCount}/${summary.localClaimSchemaGapCandidateCount}/${summary.rawIntegrityGapCandidateCount}.\n` +
        `- Existing entity raw integrity: ${summary.rawIntegrityVerifiedCandidateCount}/${summary.candidateCount}; candidate×claim field evidence: ${summary.exactCandidateFieldEvidenceClaimCount}.\n` +
        `- Provider candidate scope: ${summary.providerCandidateScopeUnsearchedCandidateCount} candidates and ${summary.providerCandidateScopeUnsearchedClaimCount} external claims still unsearched in persisted evidence.\n` +
        `- Finite G06 frontier proven: ${summary.candidateScopedFrontierProvenCandidateCount}; evidence deferred: ${summary.evidenceDeferredCandidateCount}; strict/certificate/canonical: ${summary.strictVerifiedCandidateCount}/${summary.certificateEligibleClaimCount}/${summary.canonicalPromotionEligibleCandidateCount}.\n\n` +
        `## Finding\n\n` +
        `The pinned genshin-db 6.7/7.0 records are verified entity evidence only. The nine-provider ledger has no exact candidate×claim field artifact for this shard, and its existing finite frontiers cover different datasets/scopes. Therefore this shard remains searchRequired; no prose inference, G06 deferral, certificate, Runtime activation, or canonical promotion is allowed.\n\n` +
        `## Next bounded action\n\n` +
        `Persist provider-owned immutable candidate×claim artifacts with exact raw/field digests and explicit 7.0 binding. Re-run the shard producer; a qualifying pair may then be compared field-by-field.\n`;
}

function writeArtifacts(audit = buildAudit()) {
    fs.mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(ARTIFACT_PATH, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
    fs.writeFileSync(REPORT_PATH, renderMarkdown(audit), "utf8");
    return { audit, artifactPath: ARTIFACT_PATH, reportPath: REPORT_PATH };
}

function main() {
    const audit = buildAudit();
    writeArtifacts(audit);
    process.stdout.write(`${JSON.stringify({ summary: audit.summary, validation: validateAudit(audit) }, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {
    ARTIFACT_PATH,
    CLAIM_FIELDS,
    EXTERNAL_CLAIM_FIELDS,
    GENERATED_AT,
    REPORT_PATH,
    SCHEMA_PATH,
    SHARD_ID,
    buildAudit,
    candidateIdDigest,
    providerSurface,
    renderMarkdown,
    selectShard,
    validateAudit,
    withoutDigest,
    writeArtifacts
};
