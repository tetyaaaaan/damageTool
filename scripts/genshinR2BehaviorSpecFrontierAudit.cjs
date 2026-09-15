"use strict";

/**
 * Candidate-scoped frontier bridge for the ready behaviorSpec lane.
 *
 * This artifact deliberately does not fetch providers, infer values from
 * prose, issue a certificate, close a work disposition, or mutate the
 * authoritative queue.  It reuses the existing materialization audit and
 * source ledgers to make two different gaps explicit:
 *
 *  - the provider-wide ledger has been inspected, but does not prove a
 *    candidate x claim finite frontier; and
 *  - queue/raw evidence has no candidate-field adapter for the independent
 *    provider surface.
 *
 * `searchRequired` therefore remains open.  This is a bridge/diagnostic
 * artifact for the next bounded source task, not a G06 evidence deferral.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { digestStable } = require("./genshinVersionEvidenceValidation.cjs");
const materialization = require("./genshinR2BehaviorSpecMaterializationAudit.cjs");

const ROOT = path.resolve(__dirname, "..");
const TRANSITION_ROOT = path.join(ROOT, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0");
const SOURCE_FRONTIER_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "source-search-frontiers.json");
const SOURCE_SEARCH_PATH = path.join(TRANSITION_ROOT, "source-search.json");
const PROVIDER_POLICY_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "provider-independence-policy.json");
const MATERIALIZATION_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "reviews", "r2-behavior-spec-materialization-audit.json");
const QUEUE_PATH = path.join(ROOT, "reports", "genshin-evidence-task-queue.json");
const FRONTIER_INVENTORY_PATH = path.join(ROOT, "reports", "genshin-candidate-source-coverage-frontier-inventory.json");
const ARTIFACT_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "reviews", "r2-behavior-spec-frontier-audit.json");
const REPORT_PATH = path.join(ROOT, "reports", "genshin-r2-behavior-spec-frontier-audit.md");
const SCHEMA_PATH = path.join(ROOT, "games", "genshin", "data", "schema", "r2-behavior-spec-frontier-audit.schema.json");
const SOURCE_FAMILY_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "source-family-registry.json");
const EXTERNAL_CHARACTER_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "characters", "external-field-evidence.json");

const GENERATED_AT = "2026-08-30T00:00:00.000Z";
const GENERATOR_VERSION = "genshinR2BehaviorSpecFrontierAudit/1";
const TRANSITION_ID = "genshin:6.7->7.0";
const TARGET_VERSION = "7.0";
const EXPECTED_CANDIDATE_COUNT = 1533;
const FIRST_PASS_PENDING_COUNT = 982;
const FIRST_PASS_CLEAN_COUNT = 858;
const FIRST_PASS_EXCLUDED_COUNT = 124;
const FIRST_PASS_POLICY_ID = "genshin-goal-2026-08-28-r2";
const FIRST_PASS_FRONTIER_ID = "genshin-7.0-behavior-spec-first-pass-clean-858-persisted-provider-frontier";
const CLAIM_FIELDS = ["sourceText", "timing", "execution", "lifecycle", "energy", "snapshot", "runtime"];
const EXTERNAL_CLAIM_FIELDS = CLAIM_FIELDS.filter((field) => field !== "runtime");
const FIRST_PASS_UNSEARCHED_SCOPE = [
    "Provider releases, manifests, or immutable candidate-field artifacts not retained in the repository at this audit time.",
    "Mutable provider pages and unsaved API responses outside the finite persisted-evidence surface."
];
const FIRST_PASS_REOPEN_TRIGGER = "A provider-owned immutable 7.0 field manifest with exact raw/field digests, newly disclosed independent lineage, or complete candidate×claim field coverage becomes available.";

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function sha256(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function fileRef(file, role) {
    const exists = fs.existsSync(file);
    const bytes = exists ? fs.readFileSync(file) : null;
    return {
        path: path.relative(ROOT, file).replaceAll("\\", "/"),
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
    const counts = {};
    for (const value of values) {
        const key = String(value ?? "<null>");
        counts[key] = (counts[key] || 0) + 1;
    }
    return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function parseCandidateId(candidateId) {
    const parts = String(candidateId || "").split(":");
    return {
        entityId: parts[1] || null,
        component: parts.slice(2).join(":") || null
    };
}

function candidateFieldClaims(materializedCandidate) {
    return (materializedCandidate?.candidateClaims || []).map((claim) => {
        const external = claim.claimKind === "externalFactual";
        return {
            claimId: claim.claimId,
            field: claim.field,
            claimKind: claim.claimKind,
            rawEvidenceStatus: claim.rawEvidence?.rawIntegrityStatus || null,
            candidateFieldValueMaterialized: claim.providerObservation?.candidateFieldValueMaterialized === true,
            providerFieldEvidenceStatus: external ? "absent" : "notApplicable",
            candidateScopedFrontierStatus: "notRecorded",
            searchStatus: external ? "candidateFieldSearchRequired" : "internalMetadataOnly",
            strictVerified: false,
            certificateEligible: false,
            canonicalPromotionEligible: false,
            reasons: external
                ? ["candidateClaimFieldEvidenceAbsent", "candidateFrontierNotRecorded", "inferenceForbidden"]
                : ["internalMetadataOnly", "externalClaimsOpen"]
        };
    });
}

function providerSurfaceAssessment(sourceSearch, sourceFrontiers, materializationAudit, candidateIds = []) {
    const candidateIdSet = new Set((candidateIds || []).map(String));
    const providers = (sourceSearch?.providersExamined || []).map((row) => ({
        provider: row?.provider || null,
        sourceFamily: row?.sourceFamily || null,
        evidenceRef: row?.evidenceRef || null,
        result: row?.result || null
    })).filter((row) => row.provider);
    const providerWideFrontiers = (sourceFrontiers?.frontiers || []).map((frontier) => ({
        id: frontier?.id || null,
        status: frontier?.status || null,
        dataset: frontier?.appliesTo?.dataset || null,
        layer: frontier?.appliesTo?.layer || null,
        candidateCount: frontier?.appliesTo?.candidateCount ?? null,
        candidateIds: Array.isArray(frontier?.appliesTo?.candidateIds) ? frontier.appliesTo.candidateIds.map(String) : [],
        searchScope: frontier?.searchScope || null,
        lastSearchedAt: frontier?.lastSearchedAt || null,
        providersExamined: sortStrings(frontier?.providersExamined || []),
        reopenTrigger: frontier?.reopenTrigger || null,
        candidateScopeRecorded: Array.isArray(frontier?.appliesTo?.candidateIds)
            && frontier.appliesTo.candidateIds.some((candidateId) => candidateId && candidateIdSet.has(String(candidateId)))
    }));
    const scopedTransitionFrontiers = (sourceSearch?.scopedFrontiers || []).map((frontier) => ({
        id: frontier?.id || null,
        status: frontier?.status || null,
        candidateCount: frontier?.appliesTo?.candidateCount ?? null,
        candidateIds: Array.isArray(frontier?.appliesTo?.candidateIds) ? frontier.appliesTo.candidateIds.map(String) : [],
        searchScope: frontier?.searchScope || null,
        lastSearchedAt: frontier?.lastSearchedAt || null,
        providersExamined: sortStrings(frontier?.providersExamined || []),
        reopenTrigger: frontier?.reopenTrigger || null,
        candidateScopeRecorded: Array.isArray(frontier?.appliesTo?.candidateIds)
            && frontier.appliesTo.candidateIds.some((candidateId) => candidateId && candidateIdSet.has(String(candidateId)))
    }));
    const candidateScopedFrontierCount = providerWideFrontiers.filter((frontier) => frontier.candidateScopeRecorded)
        .concat(scopedTransitionFrontiers.filter((frontier) => frontier.candidateScopeRecorded)).length;
    return {
        providerWideLedgerStatus: providers.length > 0 ? "inspected" : "missing",
        providerWideInspectedCount: providers.length,
        providers,
        providerWideFrontiers,
        transitionFrontiers: scopedTransitionFrontiers,
        candidateScopedFrontierCount,
        candidateScopedFrontierProvenCount: 0,
        candidateFieldEvidenceCandidateCount: materializationAudit.summary.candidateFieldMaterializedCount > 0
            ? null : 0,
        interpretation: "Provider surfaces are recorded, but no inspected ledger has candidateIds for this 1,533-candidate behaviorSpec scope and no candidate×claim independent field record is materialized.",
        providerSurfaceState: "candidateFieldSurfaceUnsearched",
        finiteFrontierStatus: "notProven",
        reopenTrigger: "immutable provider-owned 7.0 field manifest, newly disclosed independent lineage, or candidate-scoped exact field evidence"
    };
}

function queueProjectionDigest(materializationAudit) {
    return materializationAudit?.generatedFrom?.authoritativeQueue?.selectedTaskProjectionDigest || null;
}

function firstPassQueueTaskDigest(task) {
    const parsed = parseCandidateId(task?.candidateId);
    return digestStable({
        candidateId: task?.candidateId || null,
        layer: task?.layer || null,
        dataset: task?.dataset || null,
        entityId: task?.entityId || parsed.entityId || null,
        taskId: task?.task?.taskId || null,
        taskKind: task?.task?.kind || null,
        taskStatus: task?.task?.status || null,
        primaryBlockReason: task?.primaryBlockReason || null,
        blockReasons: task?.blockReasons || [],
        searchFrontier: task?.searchFrontier || null
    });
}

function firstPassEvidenceRefs() {
    return [
        fileRef(MATERIALIZATION_PATH, "behaviorSpecMaterializationAudit"),
        fileRef(FRONTIER_INVENTORY_PATH, "candidateSourceCoverageFrontierInventory"),
        fileRef(SOURCE_SEARCH_PATH, "transitionProviderSearchLedger"),
        fileRef(PROVIDER_POLICY_PATH, "providerIndependencePolicy"),
        fileRef(SOURCE_FAMILY_PATH, "sourceFamilyRegistry"),
        fileRef(EXTERNAL_CHARACTER_PATH, "characterExternalFieldEvidence")
    ];
}

function firstPassSelection(materializationAudit, queue) {
    const materializedById = new Map((materializationAudit?.claim?.candidates || [])
        .map((candidate) => [String(candidate.candidateId), candidate]));
    const pending = (queue?.tasks || []).filter((task) => task?.layer === "behaviorSpec"
        && task?.progress?.work?.status === "pending");
    const clean = pending.filter((task) => {
        const candidate = materializedById.get(String(task.candidateId));
        const claims = candidate?.candidateClaims || [];
        const raw = candidate?.transitionRaw || {};
        return task.primaryBlockReason === "semanticDecisionRequired"
            && task.searchFrontier?.status === "searchRequired"
            && task.progress?.calculation?.status === "specOnly"
            && task.consumerStatus === "notApplicable"
            && candidate
            && raw.identityStatus === "resolvedUnambiguous"
            && ["verified", "verifiedAcrossVariants"].includes(raw.rawIntegrityStatus)
            && claims.length === CLAIM_FIELDS.length
            && claims.every((claim) => claim.local?.claimSchemaStatus === "presentNeedsReview");
    });
    if (pending.length !== FIRST_PASS_PENDING_COUNT) {
        throw new Error(`firstPassPendingCountMismatch:${pending.length}`);
    }
    if (clean.length !== FIRST_PASS_CLEAN_COUNT) {
        throw new Error(`firstPassCleanCountMismatch:${clean.length}`);
    }
    const cleanIds = new Set(clean.map((task) => String(task.candidateId)));
    const excluded = pending.filter((task) => !cleanIds.has(String(task.candidateId)));
    if (excluded.length !== FIRST_PASS_EXCLUDED_COUNT) {
        throw new Error(`firstPassExcludedCountMismatch:${excluded.length}`);
    }
    const candidateIds = sortStrings(clean.map((task) => task.candidateId));
    const excludedIds = sortStrings(excluded.map((task) => task.candidateId));
    const candidates = candidateIds.map((candidateId) => materializedById.get(candidateId));
    const tasks = new Map(clean.map((task) => [String(task.candidateId), task]));
    return {
        pending,
        clean,
        excluded,
        candidates,
        tasks,
        candidateIds,
        excludedIds
    };
}

function firstPassFieldFindings(candidate) {
    return EXTERNAL_CLAIM_FIELDS.map((field) => {
        const claim = (candidate?.candidateClaims || []).find((item) => item.field === field) || {};
        return {
            field: `claim.${field}`,
            knownStatus: "unknown",
            currentValue: null,
            historicalValue: null,
            currentValuePolicy: "No independent candidate field is materialized; local/entity observations are not substituted.",
            missingEvidence: `No immutable independent ${TARGET_VERSION} candidate×claim field artifact was found for ${candidate.candidateId}:${field}.`,
            localClaimSchemaStatus: claim.local?.claimSchemaStatus || null,
            localObservedSection: claim.local?.observedSection === true,
            localObservedLeafPaths: clone(claim.local?.observedLeafPaths || []),
            localObservedSectionDigest: claim.local?.observedSectionDigest || null,
            candidateFieldValueMaterialized: false,
            strictVerified: false,
            certificateEligible: false
        };
    });
}

function firstPassDecision(candidate, task, frontier, evidenceRefs) {
    const reason = `Candidate-scoped external mechanic evidence is unavailable for ${candidate.candidateId}; this draft records only a finite persisted-provider evidence wait and leaves all values unverified.`;
    const fieldFindings = firstPassFieldFindings(candidate);
    const artifactRefs = evidenceRefs.map((ref) => ({ path: ref.path, sha256: ref.sha256 }));
    const lane = {
        kind: "semanticDecision",
        blockingReasons: ["semanticDecisionRequired"],
        disposition: "externalEvidenceWait",
        reason,
        fieldRefs: fieldFindings.map((item) => item.field),
        artifactRefs
    };
    return {
        id: `r2-behavior-first-pass-frontier:${candidate.candidateId}`,
        kind: "genshinEvidenceDeferral",
        policyId: FIRST_PASS_POLICY_ID,
        candidateId: candidate.candidateId,
        targetGameVersion: TARGET_VERSION,
        queueTaskDigest: firstPassQueueTaskDigest(task),
        assessment: {
            actorId: "luna_worker",
            assessedAt: GENERATED_AT,
            reason,
            boundedScope: {
                candidateId: candidate.candidateId,
                taskId: task?.task?.taskId || null,
                remainingSearches: clone(FIRST_PASS_UNSEARCHED_SCOPE),
                notExecutableReasons: [
                    "strictIndependentTargetFieldEvidenceMissing",
                    "providerOwnedCandidateFieldArtifactNotPersisted",
                    "futureProviderSurfaceOutsideFiniteFrontier"
                ],
                artifactRefs,
                deferredLaneDispositions: [lane]
            }
        },
        fieldFindings,
        search: {
            scope: frontier.searchScope,
            lastSearchedAt: frontier.lastSearchedAt,
            providersExamined: clone(frontier.providersExamined),
            negativeResult: frontier.negativeResult,
            unsearchedScope: clone(FIRST_PASS_UNSEARCHED_SCOPE),
            reopenTrigger: FIRST_PASS_REOPEN_TRIGGER,
            nextTask: `Reopen and reacquire exact ${TARGET_VERSION} independent candidate×claim evidence for ${candidate.candidateId} when a recorded trigger is satisfied.`,
            artifactRefs
        },
        safety: {
            impact: `Applying an unverified ${TARGET_VERSION} behavior overlay could alter the existing ${candidate.dataset}/${candidate.layer} result for ${candidate.candidateId}.`,
            action: `Keep the existing local/entity projection and any Runtime/canonical route unchanged; leave ${candidate.candidateId} inactive and do not issue a certificate or promotion.`,
            runtimeStatus: "existingConsumerUnchanged;candidateInactive;verificationAndPromotionDenied",
            artifactRefs
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

function buildFirstPassDisposition({ materializationAudit, queue, sourceSearch }) {
    const selection = firstPassSelection(materializationAudit, queue);
    const candidateIds = selection.candidateIds;
    const excludedIds = selection.excludedIds;
    const candidateIdDigest = digestStable(candidateIds);
    const evidenceRefs = firstPassEvidenceRefs();
    const evidenceRefsCompact = evidenceRefs.map((ref) => ({ path: ref.path, sha256: ref.sha256 }));
    const providersExamined = sortStrings((sourceSearch?.providersExamined || []).map((provider) => provider?.provider));
    if (providersExamined.length !== 9) {
        throw new Error(`firstPassProviderCountMismatch:${providersExamined.length}`);
    }
    const frontierBase = {
        id: FIRST_PASS_FRONTIER_ID,
        status: "searchExhausted",
        finite: true,
        scopeUnit: "candidate×claim",
        shardId: "behavior:behaviorSpec:first-pass:clean-858",
        transitionId: TRANSITION_ID,
        targetGameVersion: TARGET_VERSION,
        candidateCount: candidateIds.length,
        candidateIds: clone(candidateIds),
        candidateIdDigest,
        claimFields: CLAIM_FIELDS,
        externalClaimFields: EXTERNAL_CLAIM_FIELDS,
        searchScope: `Exact ${candidateIds.length} clean pending behaviorSpec candidates; existing persisted provider surfaces only, no network fetch or prose inference.`,
        lastSearchedAt: sourceSearch?.lastSearchedAt || null,
        providersExamined,
        providerCount: providersExamined.length,
        exactCandidateFieldEvidenceCount: 0,
        independentVersionBoundFieldEvidenceCount: 0,
        negativeResult: "Within the finite persisted-provider surface, no independent version-bound candidate×claim field record exists for this exact clean candidate scope. Pinned genshin-db records remain correlated entity raw evidence only; other retained provider surfaces lack exact candidate field artifacts or the required provider-owned version binding.",
        unsearchedScope: clone(FIRST_PASS_UNSEARCHED_SCOPE),
        reopenTrigger: FIRST_PASS_REOPEN_TRIGGER,
        evidenceRefs: evidenceRefsCompact,
        sourceAuditDigest: digestStable({ candidateIdDigest, providersExamined, lastSearchedAt: sourceSearch?.lastSearchedAt || null, evidenceRefs: evidenceRefsCompact })
    };
    const frontier = { ...frontierBase, digest: digestStable(frontierBase) };
    const decisions = selection.candidates.map((candidate) => firstPassDecision(
        candidate,
        selection.tasks.get(String(candidate.candidateId)),
        frontier,
        evidenceRefs
    ));
    const claimCount = decisions.length * CLAIM_FIELDS.length;
    const externalClaimCount = decisions.length * EXTERNAL_CLAIM_FIELDS.length;
    const entityIds = sortStrings(selection.candidates.map((candidate) => candidate.entityId));
    const queueFile = fileRef(QUEUE_PATH, "authoritativeQueue");
    const disposition = {
        schemaVersion: 1,
        kind: "genshinR2BehaviorSpecFirstPassFrontierDraft",
        policyId: FIRST_PASS_POLICY_ID,
        transitionId: TRANSITION_ID,
        fromGameVersion: "6.7",
        targetGameVersion: TARGET_VERSION,
        status: "draft",
        draftOnly: true,
        generatedAt: GENERATED_AT,
        scope: {
            layer: "behaviorSpec",
            candidateCount: candidateIds.length,
            candidateIds: clone(candidateIds),
            candidateIdDigest,
            excludedCandidateCount: excludedIds.length,
            excludedCandidateIds: clone(excludedIds),
            excludedCandidateIdDigest: digestStable(excludedIds),
            candidateSelection: "exact pending behaviorSpec candidates with resolved identity, verified transition raw, complete local claim schema, specOnly calculation, no consumer gap, and searchRequired queue frontier",
            externalClaimFields: EXTERNAL_CLAIM_FIELDS
        },
        queueObservation: {
            path: queueFile.path,
            rawSha256: queueFile.sha256,
            pendingBehaviorSpecCount: selection.pending.length,
            selectedCleanCandidateCount: candidateIds.length,
            excludedExceptionCandidateCount: excludedIds.length,
            queueMutation: "none"
        },
        frontier,
        evidence: {
            refs: evidenceRefs,
            providerCount: providersExamined.length,
            providerSemantics: "reuse existing nine-provider persisted search ledger; no new retrieval"
        },
        decisions,
        summary: {
            candidateCount: candidateIds.length,
            entityCount: entityIds.length,
            claimCount,
            externalClaimCount,
            internalClaimCount: decisions.length,
            candidateScopedFrontierProvenCandidateCount: candidateIds.length,
            finiteFrontierStatus: "searchExhaustedForPersistedProviderSurface",
            evidenceDeferredDraftCandidateCount: candidateIds.length,
            candidateFieldEvidenceCandidateCount: 0,
            candidateFieldEvidenceClaimCount: 0,
            strictVerifiedCandidateCount: 0,
            certificateEligibleClaimCount: 0,
            canonicalPromotionEligibleCandidateCount: 0,
            providerCount: providersExamined.length,
            providerExactCandidateFieldHitCount: 0,
            independentVersionBoundFieldEvidenceCount: 0,
            unsearchedExternalRemainderCandidateCount: candidateIds.length,
            queueMutated: false,
            workDispositionMutated: false,
            registryMutated: false
        },
        gate: {
            draftEligibleForEvidenceWait: true,
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false,
            verificationGranted: false,
            promotionGranted: false,
            runtimeChanged: false,
            certificateIssued: false,
            queueChanged: false,
            reason: "This draft records only the finite persisted-provider search surface for the exact clean 858 candidates. It does not verify values, grant a certificate, activate Runtime, promote canonical data, or mutate queue/work dispositions."
        },
        fieldDigestAlgorithm: "sha256-stable-json-v1"
    };
    disposition.fieldDigest = digestStable({
        scope: disposition.scope,
        queueObservation: disposition.queueObservation,
        frontier: disposition.frontier,
        evidence: disposition.evidence,
        decisions: disposition.decisions,
        summary: disposition.summary,
        gate: disposition.gate
    });
    return disposition;
}

function buildCandidate(materializedCandidate, providerSurface) {
    const parsed = parseCandidateId(materializedCandidate.candidateId);
    const claims = candidateFieldClaims(materializedCandidate);
    const externalClaims = claims.filter((claim) => claim.claimKind === "externalFactual");
    const raw = materializedCandidate.transitionRaw || {};
    const localSchemaMissing = materializedCandidate.candidateClaims
        .some((claim) => claim.local?.claimSchemaStatus === "missing");
    const identityUnresolved = raw.identityStatus
        && !["resolvedUnambiguous", "resolvedUnambiguousByProviderName"].includes(raw.identityStatus);
    const internalConnectionReasons = [];
    if (identityUnresolved) internalConnectionReasons.push("candidateIdentityOrVariantResolution");
    if (localSchemaMissing) internalConnectionReasons.push("localClaimSchemaMissing");
    const reasons = ["candidateFieldEvidenceAbsent", "candidateFrontierNotRecorded", "singleCorrelatedProviderFamily", "searchRequired", "inferenceForbidden"];
    if (internalConnectionReasons.length) reasons.push("internalConnectionRequired");
    return {
        candidateId: materializedCandidate.candidateId,
        entityId: materializedCandidate.entityId || parsed.entityId,
        component: materializedCandidate.component || parsed.component,
        dataset: materializedCandidate.dataset || null,
        layer: materializedCandidate.layer || "behaviorSpec",
        shard: {
            clusterId: materializedCandidate.queue?.bulkTransitionCapture?.evidenceRef
                ? null : materializedCandidate.queue?.bulkTransitionCapture?.evidenceRef,
            taskId: materializedCandidate.queue?.task?.taskId || null
        },
        queue: {
            taskStatus: materializedCandidate.queue?.task?.status || null,
            taskKind: materializedCandidate.queue?.task?.kind || null,
            searchFrontierStatus: materializedCandidate.queue?.searchFrontier?.status || null,
            searchFrontierPolicyId: materializedCandidate.queue?.searchFrontier?.policyId || null,
            scopeMatched: materializedCandidate.queue?.searchFrontier?.scopeMatched ?? null,
            candidateFrontierRecorded: materializedCandidate.queue?.searchFrontier?.scopeMatched === true
                && Boolean(materializedCandidate.queue?.searchFrontier?.policyId)
        },
        rawEntityEvidence: {
            identityStatus: raw.identityStatus || null,
            rawIntegrityStatus: raw.rawIntegrityStatus || null,
            entityRecordCaptured: raw.rawIntegrityStatus === "verified"
                || raw.rawIntegrityStatus === "verifiedAcrossVariants",
            fieldValuesMaterialized: false
        },
        internalConnections: {
            status: internalConnectionReasons.length ? "required" : "noKnownInternalGap",
            reasons: internalConnectionReasons,
            queueToCandidateFrontierLink: "notRecorded",
            candidateFieldAdapter: "notMaterialized"
        },
        providerSurface: {
            providerWideLedgerState: providerSurface.providerSurfaceState,
            providerWideInspectedCount: providerSurface.providerWideInspectedCount,
            candidateScopedEvidenceCount: 0,
            independentVersionBoundFieldEvidenceCount: 0,
            finiteG06Frontier: {
                status: "notRecorded",
                finite: false,
                searchScope: null,
                lastSearchedAt: null,
                providersExamined: [],
                reopenTrigger: providerSurface.reopenTrigger
            }
        },
        claims,
        disposition: {
            status: "candidateFieldSearchRequired",
            externalClaimsOpen: externalClaims.length,
            internalMetadataProcessed: claims.length - externalClaims.length,
            evidenceDeferred: false,
            closed: false,
            strictVerified: false,
            certificateEligible: false,
            canonicalPromotionEligible: false,
            reasons
        }
    };
}

function buildAudit({ materializationAudit = null } = {}) {
    const sourceSearch = readJson(SOURCE_SEARCH_PATH);
    const sourceFrontiers = readJson(SOURCE_FRONTIER_PATH);
    const providerPolicy = readJson(PROVIDER_POLICY_PATH);
    const queue = readJson(QUEUE_PATH);
    const materialized = materializationAudit || materialization.buildAudit();
    const candidates = (materialized.claim?.candidates || []).map((candidate) => candidate);
    const candidateIds = candidates.map((candidate) => candidate.candidateId);
    const providerSurface = providerSurfaceAssessment(sourceSearch, sourceFrontiers, materialized, candidateIds);
    const candidateRows = candidates.map((candidate) => buildCandidate(candidate, providerSurface));
    const firstPassDisposition = buildFirstPassDisposition({
        materializationAudit: materialized,
        queue,
        sourceSearch
    });
    const claims = candidateRows.flatMap((candidate) => candidate.claims);
    const externalClaims = claims.filter((claim) => claim.claimKind === "externalFactual");
    const internalClaims = claims.filter((claim) => claim.claimKind === "internalRuntimeRoute");
    const internalGapCandidates = candidateRows.filter((candidate) => candidate.internalConnections.status === "required");
    const rawStatuses = countBy(candidateRows.map((candidate) => candidate.rawEntityEvidence.rawIntegrityStatus));
    const identityStatuses = countBy(candidateRows.map((candidate) => candidate.rawEntityEvidence.identityStatus));
    const localSchemaStatuses = countBy(candidates.map((candidate) => candidate.candidateClaims
        .every((claim) => claim.local?.claimSchemaStatus === "presentNeedsReview") ? "complete" : "missing"));
    const queueStatuses = countBy(candidateRows.map((candidate) => candidate.queue.taskStatus));
    const frontierStatuses = countBy(candidateRows.map((candidate) => candidate.queue.searchFrontierStatus));
    const selectedCandidateIds = candidateRows.map((candidate) => candidate.candidateId);
    const output = {
        schemaVersion: 1,
        kind: "genshinR2BehaviorSpecFrontierAudit",
        status: "passed",
        generatedAt: GENERATED_AT,
        generator: { name: path.basename(__filename), version: GENERATOR_VERSION },
        scope: {
            transitionId: TRANSITION_ID,
            targetGameVersion: TARGET_VERSION,
            layer: "behaviorSpec",
            selection: "reuse r2 behaviorSpec materialization audit; authoritative queue task.status=ready and searchFrontier.status=searchRequired",
            candidateCount: candidateRows.length,
            candidateIds: selectedCandidateIds,
            candidateIdDigest: digestStable(selectedCandidateIds),
            claimFields: CLAIM_FIELDS,
            externalClaimFields: EXTERNAL_CLAIM_FIELDS
        },
        policy: {
            noNetworkFetch: true,
            reuseExistingRawOnly: true,
            proseInference: "forbidden",
            tokenMatching: "forbidden",
            providerIndependenceRequired: true,
            candidateScopedFrontierRequired: true,
            searchRequiredIsNotSearchExhausted: true,
            metadataBooleansNotProof: true,
            g06Deferral: "forbiddenWithoutFiniteCandidateFrontier",
            certificateIssuance: "forbidden",
            canonicalPromotion: "forbidden",
            queueMutation: "none"
        },
        generatedFrom: {
            authoritativeQueue: {
                path: path.relative(ROOT, QUEUE_PATH).replaceAll("\\", "/"),
                rawSha256: fileRef(QUEUE_PATH, "authoritativeQueue").sha256,
                selectedTaskProjectionDigest: queueProjectionDigest(materialized)
            },
            materializationAudit: fileRef(MATERIALIZATION_PATH, "behaviorSpecMaterializationAudit"),
            candidateSourceCoverageFrontier: fileRef(FRONTIER_INVENTORY_PATH, "candidateSourceCoverageFrontierInventory"),
            sourceSearch: fileRef(SOURCE_SEARCH_PATH, "transitionSourceSearch"),
            sourceFrontiers: fileRef(SOURCE_FRONTIER_PATH, "sourceFrontierRegistry"),
            providerPolicy: fileRef(PROVIDER_POLICY_PATH, "providerIndependencePolicy")
        },
        providerSurface,
        firstPassDisposition,
        candidates: candidateRows,
        summary: {
            candidateCount: candidateRows.length,
            claimCount: claims.length,
            externalClaimCount: externalClaims.length,
            internalClaimCount: internalClaims.length,
            queueTaskStatuses: queueStatuses,
            queueFrontierStatuses: frontierStatuses,
            rawIntegrityByStatus: rawStatuses,
            identityByStatus: identityStatuses,
            localClaimSchemaByStatus: localSchemaStatuses,
            rawIntegrityVerifiedCandidateCount: candidateRows.filter((candidate) => ["verified", "verifiedAcrossVariants"].includes(candidate.rawEntityEvidence.rawIntegrityStatus)).length,
            rawIntegrityGapCandidateCount: candidateRows.filter((candidate) => ["gap", "gapAcrossVariants"].includes(candidate.rawEntityEvidence.rawIntegrityStatus)).length,
            candidateIdentityOrVariantResolutionRequiredCount: candidateRows.filter((candidate) => candidate.internalConnections.reasons.includes("candidateIdentityOrVariantResolution")).length,
            localClaimSchemaConnectionRequiredCount: candidateRows.filter((candidate) => candidate.internalConnections.reasons.includes("localClaimSchemaMissing")).length,
            internalConnectionRequiredCandidateCount: internalGapCandidates.length,
            candidateFieldMaterializedCount: claims.filter((claim) => claim.candidateFieldValueMaterialized).length,
            candidateFieldSearchRequiredCount: externalClaims.filter((claim) => claim.searchStatus === "candidateFieldSearchRequired").length,
            candidateScopedFrontierProvenCandidateCount: 0,
            candidateScopedIndependentEvidenceCandidateCount: 0,
            evidenceDeferredCandidateCount: 0,
            strictVerifiedCandidateCount: 0,
            certificateEligibleClaimCount: 0,
            canonicalPromotionEligibleCandidateCount: 0,
            providerWideInspectedCount: providerSurface.providerWideInspectedCount,
            providerCandidateFieldSurfaceUnsearchedCount: candidateRows.length,
            queueToCandidateFrontierLinkMissingCount: candidateRows.filter((candidate) => !candidate.queue.candidateFrontierRecorded).length,
            providerPolicyVersion: providerPolicy?.policyVersion || null
        },
        gate: {
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false,
            canDeferG06: false,
            reasons: [
                "candidateScopedFrontierNotRecorded",
                "candidateClaimFieldEvidenceAbsent",
                "singleCorrelatedProviderFamily",
                "providerSurfaceInspectedButCandidateFieldSurfaceUnsearched",
                "queueToCandidateFrontierLinkMissing"
            ]
        },
        errors: [],
        fieldDigestAlgorithm: "sha256-stable-json-v1"
    };
    output.fieldDigest = digestStable({
        scope: output.scope,
        providerSurface: output.providerSurface,
        firstPassDisposition: output.firstPassDisposition,
        candidates: output.candidates,
        summary: output.summary,
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
    if (audit.kind !== "genshinR2BehaviorSpecFrontierAudit") add("kindInvalid");
    if (audit.status !== "passed") add("statusInvalid");
    if (audit.generatedAt !== GENERATED_AT) add("generatedAtInvalid");
    const digestInput = {
        scope: audit.scope,
        providerSurface: audit.providerSurface,
        firstPassDisposition: audit.firstPassDisposition,
        candidates: audit.candidates,
        summary: audit.summary,
        gate: audit.gate
    };
    if (audit.fieldDigestAlgorithm !== "sha256-stable-json-v1" || audit.fieldDigest !== digestStable(digestInput)) add("fieldDigestInvalid");
    if (audit.scope?.candidateCount !== EXPECTED_CANDIDATE_COUNT || audit.summary?.candidateCount !== EXPECTED_CANDIDATE_COUNT) add("candidateCountInvalid");
    if (!Array.isArray(audit.candidates) || audit.candidates.length !== EXPECTED_CANDIDATE_COUNT) add("candidatesIncomplete");
    if (audit.providerSurface?.candidateScopedFrontierProvenCount !== 0) add("frontierFailOpen");
    if (audit.summary?.candidateScopedFrontierProvenCandidateCount !== 0) add("summaryFrontierFailOpen");
    if (audit.summary?.candidateFieldMaterializedCount !== 0) add("fieldMaterializationFailOpen");
    if (audit.summary?.strictVerifiedCandidateCount !== 0 || audit.summary?.certificateEligibleClaimCount !== 0 || audit.summary?.canonicalPromotionEligibleCandidateCount !== 0) add("verificationFailOpen");
    if (audit.gate?.canIssueEligibilityCertificate !== false || audit.gate?.canPromoteCanonical !== false || audit.gate?.canDeferG06 !== false) add("gateFailOpen");
    const firstPass = audit.firstPassDisposition;
    if (!firstPass || firstPass.kind !== "genshinR2BehaviorSpecFirstPassFrontierDraft"
        || firstPass.status !== "draft" || firstPass.draftOnly !== true) add("firstPassDispositionInvalid");
    if (firstPass?.scope?.candidateCount !== FIRST_PASS_CLEAN_COUNT
        || firstPass?.scope?.excludedCandidateCount !== FIRST_PASS_EXCLUDED_COUNT) add("firstPassScopeInvalid");
    if (firstPass?.frontier?.finite !== true
        || firstPass?.frontier?.status !== "searchExhausted"
        || firstPass?.frontier?.candidateCount !== FIRST_PASS_CLEAN_COUNT
        || firstPass?.frontier?.providerCount !== 9
        || firstPass?.frontier?.exactCandidateFieldEvidenceCount !== 0
        || firstPass?.frontier?.independentVersionBoundFieldEvidenceCount !== 0) add("firstPassFrontierInvalid");
    if (!Array.isArray(firstPass?.decisions) || firstPass.decisions.length !== FIRST_PASS_CLEAN_COUNT) add("firstPassDecisionsIncomplete");
    if (firstPass?.summary?.candidateScopedFrontierProvenCandidateCount !== FIRST_PASS_CLEAN_COUNT
        || firstPass?.summary?.evidenceDeferredDraftCandidateCount !== FIRST_PASS_CLEAN_COUNT
        || firstPass?.summary?.strictVerifiedCandidateCount !== 0
        || firstPass?.summary?.certificateEligibleClaimCount !== 0
        || firstPass?.summary?.canonicalPromotionEligibleCandidateCount !== 0
        || firstPass?.summary?.queueMutated !== false
        || firstPass?.summary?.workDispositionMutated !== false
        || firstPass?.summary?.registryMutated !== false) add("firstPassSummaryInvalid");
    if (firstPass?.gate?.draftEligibleForEvidenceWait !== true
        || firstPass?.gate?.canIssueEligibilityCertificate !== false
        || firstPass?.gate?.canPromoteCanonical !== false
        || firstPass?.gate?.queueChanged !== false) add("firstPassGateFailOpen");
    const seen = new Set();
    for (const candidate of audit.candidates || []) {
        if (!candidate?.candidateId || seen.has(candidate.candidateId)) add(`candidateIdInvalid:${candidate?.candidateId || "<missing>"}`);
        seen.add(candidate?.candidateId);
        if (candidate.disposition?.closed !== false || candidate.disposition?.evidenceDeferred !== false
            || candidate.disposition?.strictVerified !== false || candidate.disposition?.certificateEligible !== false
            || candidate.disposition?.canonicalPromotionEligible !== false) add(`candidateGateFailOpen:${candidate.candidateId}`);
        if (candidate.providerSurface?.finiteG06Frontier?.finite !== false) add(`candidateFrontierFailOpen:${candidate.candidateId}`);
        for (const claim of candidate.claims || []) {
            if (claim.claimKind === "externalFactual") {
                if (claim.searchStatus !== "candidateFieldSearchRequired") add(`externalClaimStatusInvalid:${claim.claimId}`);
                if (claim.candidateFieldValueMaterialized !== false) add(`claimMaterializationFailOpen:${claim.claimId}`);
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
    const s = audit.summary;
    return `# Genshin r2 behaviorSpec candidate frontier audit\n\n` +
        `- Scope: ${s.candidateCount} behaviorSpec candidates / ${s.claimCount} claims (${s.externalClaimCount} external, ${s.internalClaimCount} internal metadata)\n` +
        `- Existing raw integrity verified: ${s.rawIntegrityVerifiedCandidateCount}; gap: ${s.rawIntegrityGapCandidateCount}\n` +
        `- Candidate×claim values materialized: ${s.candidateFieldMaterializedCount}; search required: ${s.candidateFieldSearchRequiredCount}\n` +
        `- Candidate-scoped finite frontier proven: ${s.candidateScopedFrontierProvenCandidateCount}; G06 deferrals: ${audit.gate.canDeferG06 ? "allowed" : "not allowed"}\n` +
        `- Strict/certificate/canonical: ${s.strictVerifiedCandidateCount}/${s.certificateEligibleClaimCount}/${s.canonicalPromotionEligibleCandidateCount}\n\n` +
        `## What is connected\n\n` +
        `- Provider-wide surfaces inspected: ${s.providerWideInspectedCount}.\n` +
        `- Candidate field surface still unsearched: ${s.providerCandidateFieldSurfaceUnsearchedCount}.\n` +
        `- Queue→candidate frontier link not recorded: ${s.queueToCandidateFrontierLinkMissingCount}.\n` +
        `- Internal identity/schema connection required: ${s.internalConnectionRequiredCandidateCount} candidates (identity/variant ${s.candidateIdentityOrVariantResolutionRequiredCount}, local claim schema ${s.localClaimSchemaConnectionRequiredCount}).\n\n` +
        `The existing genshin-db transition raw is retained as correlated entity evidence only. Because no candidate-scoped independent field record or finite frontier is present, these candidates remain \`searchRequired\`; this report does not convert them to searchExhausted/evidenceDeferred, issue certificates, or promote canonical data.\n\n` +
        `Reopen/advance when an immutable provider-owned 7.0 field manifest, independent-lineage disclosure, or candidate-scoped exact field evidence is recorded.\n\n` +
        `## Approved first-pass frontier draft\n\n` +
        `- Exact pending behaviorSpec candidates selected: ${audit.firstPassDisposition.scope.candidateCount}; excluded exceptions: ${audit.firstPassDisposition.scope.excludedCandidateCount}.\n` +
        `- Candidate-scoped persisted-provider frontier: ${audit.firstPassDisposition.frontier.candidateCount}; status: \`${audit.firstPassDisposition.frontier.status}\`, finite: ${audit.firstPassDisposition.frontier.finite}.\n` +
        `- Draft evidence waits: ${audit.firstPassDisposition.summary.evidenceDeferredDraftCandidateCount}; strict/certificate/canonical: ${audit.firstPassDisposition.summary.strictVerifiedCandidateCount}/${audit.firstPassDisposition.summary.certificateEligibleClaimCount}/${audit.firstPassDisposition.summary.canonicalPromotionEligibleCandidateCount}.\n` +
        `- Queue/work-disposition/registry mutation: none.\n` +
        `- This separate draft records the finite persisted-provider frontier only; it does not verify values, issue certificates, activate Runtime, or promote canonical data.\n`;
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
    buildAudit,
    providerSurfaceAssessment,
    renderMarkdown,
    validateAudit,
    withoutDigest,
    writeArtifacts
};
