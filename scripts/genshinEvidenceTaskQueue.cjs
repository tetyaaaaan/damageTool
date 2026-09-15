"use strict";

const workDisposition = require("./genshinWorkDisposition.cjs");

/*
 * The terminal-state audit answers "where is this candidate?".  This module
 * answers the different operational question: "what is the next task, who
 * owns it, and can the repository perform it without a new decision or
 * external artifact?"  It deliberately consumes audit records and the
 * provider-policy artifact; it never promotes a candidate.
 */

const COMPLETE_STATES = new Set([
    "productionCanonical",
    "verifiedSpec",
    "nonCalculativeComplete"
]);
const SOURCE_PRIMARY_REASONS = new Set([
    "sourceMissing",
    "gameVersionUnbound",
    "providerIndependenceUnknown",
    "providerIndependenceCorrelated",
    "versionOrProviderCoverageDrift"
]);
const SOURCE_REASONS = new Set([
    ...SOURCE_PRIMARY_REASONS,
    "versionOrProviderCoverageDrift",
    "sourceDiscrepancy"
]);
const HUMAN_REASONS = new Set([
    "semanticDecisionRequired",
    "sourceDiscrepancy",
    "invalid"
]);
const CONSUMER_REASONS = new Set([
    "consumerMissing",
    "schemaGap",
    "unsupported",
    "inputMissing",
    "displayOnly"
]);
const SEARCH_METADATA_FIELDS = Object.freeze([
    "searchScope",
    "lastSearchedAt",
    "providersExamined",
    "reopenTrigger"
]);

const RUNTIME_INPUT_REASON_PATTERNS = Object.freeze({
    RESOURCE_INPUT_REQUIRED: (input) => /^resourceStates\./.test(String(input || "")),
    CONDITION_INPUT_REQUIRED: (input) => /^conditionByModifier\./.test(String(input || "")),
    PROVIDER_INPUT_REQUIRED: (input) => /^providerStats\./.test(String(input || "")),
    RECORDED_HEALING_INPUT_REQUIRED: (input) => String(input || "") === "recordedHealing"
});

function nonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function validSearchExhaustionPolicy(policy) {
    return policy?.status === "searchExhausted"
        && SEARCH_METADATA_FIELDS.every((field) => {
            const value = policy[field];
            return field === "providersExamined"
                ? Array.isArray(value) && value.length > 0 && value.every(nonEmptyString)
                : nonEmptyString(value);
        });
}

function searchPolicyFor(policies) {
    return (Array.isArray(policies) ? policies : []).find(validSearchExhaustionPolicy) || null;
}

// A missing analyzer input is not automatically a missing consumer.  Treat it
// as an existing runtime user-state route only when the persisted legacy audit
// carries the analyzer's known reason code and concrete structured paths.
function hasExistingRuntimeInputRoute(record) {
    const legacy = record?.legacy || {};
    const matcher = RUNTIME_INPUT_REASON_PATTERNS[String(legacy.reasonCode || "")];
    const requiredInputs = Array.isArray(legacy.requiredInputs) ? legacy.requiredInputs : [];
    const missingInputs = Array.isArray(legacy.missingInputs) ? legacy.missingInputs : [];
    return legacy.supportStatus === "missingInput"
        && legacy.inputImplemented === true
        && legacy.inputStatus === "applicable"
        && legacy.lane === "interactiveInput"
        && Boolean(matcher)
        && requiredInputs.length > 0
        && missingInputs.length > 0
        && requiredInputs.every((input) => matcher(input))
        && missingInputs.every((input) => matcher(input))
        && missingInputs.every((input) => requiredInputs.includes(input));
}

function policyAppliesToRecord(policy, record, policies = []) {
    const id = String(record?.id || "");
    const scope = Array.isArray(policy?.scope) ? policy.scope.map(String) : [];
    if (scope.includes(id)) return true;
    const selector = policy?.scopeSelector;
    if (!selector || typeof selector !== "object" || Array.isArray(selector)) return false;
    const matches = (values, actual) => !Array.isArray(values) || values.length === 0 || values.map(String).includes(String(actual || ""));
    return matches(selector.candidateIds, id)
        && matches(selector.datasets, record?.dataset)
        && matches(selector.layers, record?.layer)
        && matches(selector.entityIds, record?.entity?.id);
}

function normalizeContext(contextOrPolicies = []) {
    if (Array.isArray(contextOrPolicies)) return { providerPolicies: contextOrPolicies };
    return contextOrPolicies && typeof contextOrPolicies === "object"
        ? contextOrPolicies
        : { providerPolicies: [] };
}

function strictCandidateCertificate(summary) {
    return Boolean(summary
        && summary.freshness?.current === true
        && summary.certificateCount > 0
        && summary.eligibleClaimCount === summary.certificateCount
        && summary.blockedClaimCount === 0
        && summary.status === "eligible");
}

function deriveCertificateState(record, context = {}) {
    const evidence = record?.evidence || {};
    // The only strict authority is the materialized candidate×claim registry.
    // `evidence.certificates` is retained as legacy/pilot diagnostics and is
    // deliberately not consulted for strictness or attestation.
    const certificateSummary = evidence.eligibilityCertificate
        || context.eligibilityCertificates?.get?.(String(record?.id || ""))
        || null;
    const strict = strictCandidateCertificate(certificateSummary);
    const status = strict
        ? "strict"
        : certificateSummary
            ? certificateSummary.status === "missing" ? "missing" : "blocked"
            : "missing";
    return {
        status,
        strictEligible: strict,
        strictGameVersionBinding: strict,
        sourceStrictGameVersionBinding: strict,
        // Deprecated pair-level fields remain explicit false so callers do
        // not mistake pilot metadata for a reusable pair approval.
        pairScopeApproved: false,
        revisionPinned: strict,
        sourceRecordDigestBound: strict,
        attestation: {
            status: strict ? "eligible" : status,
            result: strict ? "candidate-claim-certificate-eligible" : null,
            qualifying: strict
        },
        provider: certificateSummary?.providers || [],
        providerFrontier: record?.searchFrontier?.status || context.frontier?.status || null,
        candidateClaimCount: certificateSummary?.certificateCount || 0,
        eligibleClaimCount: certificateSummary?.eligibleClaimCount || 0,
        blockedClaimCount: certificateSummary?.blockedClaimCount || 0,
        certificate: certificateSummary
    };
}

function deriveSearchFrontier(record, policies = []) {
    const context = normalizeContext(policies);
    const providerPolicies = context.providerPolicies || [];
    const blockedReasons = Array.isArray(record?.blockReasons) ? record.blockReasons : [];
    const sourceReasons = blockedReasons.filter((reason) => SOURCE_REASONS.has(reason));
    const fieldComparison = record?.evidence?.fieldComparison || {};
    const certificate = record?.evidence?.eligibilityCertificate || null;
    const scopedReviewNeedsFrontier = record?.terminalState === "awaitingHumanReview"
        && (fieldComparison.hasScopedMatch === true || fieldComparison.hasMismatch === true)
        && certificate?.status !== "eligible";
    const sourceTaskNeedsFrontier = record?.terminalState === "blocked" && sourceReasons.length > 0;
    if (!sourceTaskNeedsFrontier && !scopedReviewNeedsFrontier) {
        return {
            status: "notApplicable",
            exhausted: false,
            policyId: null,
            searchScope: null,
            lastSearchedAt: null,
            providersExamined: [],
            reopenTrigger: null,
            blockingReasons: sourceReasons,
            scopeMatched: null,
            scopeUnit: null
        };
    }

    const policy = searchPolicyFor(providerPolicies);
    if (!policy) {
        return {
            status: "searchRequired",
            exhausted: false,
            policyId: null,
            searchScope: null,
            lastSearchedAt: null,
            providersExamined: [],
            reopenTrigger: null,
            blockingReasons: sourceReasons.length > 0 ? sourceReasons : ["strictCertificatePrerequisite"],
            scopeMatched: null,
            scopeUnit: "candidate-or-family"
        };
    }
    if (!policyAppliesToRecord(policy, record, providerPolicies)) {
        return {
            status: "searchRequired",
            exhausted: false,
            policyId: policy.id || null,
            searchScope: policy.searchScope || null,
            lastSearchedAt: policy.lastSearchedAt || null,
            providersExamined: Array.isArray(policy.providersExamined) ? [...policy.providersExamined] : [],
            reopenTrigger: policy.reopenTrigger || null,
            blockingReasons: sourceReasons.length > 0 ? sourceReasons : ["strictCertificatePrerequisite"],
            scopeMatched: false,
            scopeUnit: "candidate-or-family"
        };
    }

    // Search exhaustion is a state of the current source task, not a blanket
    // synonym for every blocked candidate.  A semantic/consumer blocker may
    // also carry sourceReasons, but source acquisition is deferred until the
    // primary task is resolved.
    // Preserve searchExhausted versus deferred: a global finite frontier is
    // complete for all candidates, but it is the current task only when the
    // candidate's first applicable blocker is source/provider (or this
    // explicitly reconciled scoped review). Semantic/consumer blockers remain
    // deferred until that primary decision is resolved.
    const currentTaskIsSource = scopedReviewNeedsFrontier
        || SOURCE_PRIMARY_REASONS.has(record.primaryBlockReason);
    const effectiveBlockingReasons = sourceReasons.length > 0
        ? sourceReasons
        : [...new Set(["strictCertificatePrerequisite", ...(policy.blockReasons || [])])];
    return {
        status: currentTaskIsSource ? "searchExhausted" : "deferred",
        exhausted: true,
        policyId: policy.id || null,
        searchScope: policy.searchScope,
        lastSearchedAt: policy.lastSearchedAt,
        providersExamined: [...policy.providersExamined],
        reopenTrigger: policy.reopenTrigger,
        blockingReasons: effectiveBlockingReasons,
        scopeMatched: true,
        scopeUnit: Array.isArray(policy.scope) && policy.scope.length === 1 && /all candidates outside/i.test(String(policy.scope[0]))
            ? "frontier"
            : "candidate-or-family"
    };
}

function hasCompleteSearchFrontier(frontier) {
    return Boolean(frontier
        && ["searchExhausted", "deferred"].includes(frontier.status)
        && Array.isArray(frontier.blockingReasons)
        && frontier.blockingReasons.length > 0
        && nonEmptyString(frontier.searchScope)
        && nonEmptyString(frontier.lastSearchedAt)
        && Array.isArray(frontier.providersExamined)
        && frontier.providersExamined.length > 0
        && frontier.providersExamined.every(nonEmptyString)
        && nonEmptyString(frontier.reopenTrigger));
}

function canAutomaticallyProcess(record, context = {}) {
    if (record?.evidence?.identityConsistency?.blocked === true) return false;
    // A machine-ready packet is not itself an automatic transition: the
    // strict contract still requires a human gate.  The only safe automatic
    // candidate transition is a verified, non-terminal record with no active
    // source, semantic, or consumer blocker.  The current inventory normally
    // has no such record, but this predicate is intentionally data-derived.
    if (record?.terminalState !== "blocked" || record.machineEvidenceReady !== true) return false;
    if (record.verificationStatus !== "verified") return false;
    if (!strictCandidateCertificate(deriveCertificateState(record, context).certificate)) return false;
    const blockers = new Set(record.blockReasons || []);
    return [...SOURCE_REASONS, ...HUMAN_REASONS, ...CONSUMER_REASONS]
        .every((reason) => !blockers.has(reason));
}

function deriveNextTask(record, searchFrontier = deriveSearchFrontier(record, []), context = {}) {
    const id = String(record?.id || "");
    // Historical Spec verification remains true for its original version, but
    // it is not completion of the current version-transition objective.
    if (record?.terminalState === "verifiedSpec"
        && (record.historicalCanonicalPendingRevalidation === true
            || record.consumerStatus === "historicalCanonicalPendingRevalidation")) {
        return {
            taskId: `version-reverify:${id}`,
            kind: "versionReverification",
            owner: "source/provider + Sol verification",
            status: "awaitingEvidence",
            priority: 12,
            autoProcessableNow: false,
            reason: "historical-spec-awaits-target-version-reverification",
            prerequisite: "Independent target-version claim evidence and Spec re-verification; retain historical verification.",
            evidenceRef: "games/genshin/data/v2/runtime/canonical-runtime.json"
        };
    }
    if (COMPLETE_STATES.has(record?.terminalState)) {
        return {
            taskId: `complete:${id}`,
            kind: "complete",
            owner: "none",
            status: "complete",
            priority: null,
            autoProcessableNow: false,
            reason: "terminal-state-complete"
        };
    }
    if (record?.terminalState === "awaitingHumanReview") {
        const fieldComparison = record?.evidence?.fieldComparison || {};
        const certificate = deriveCertificateState(record, context);
        if ((fieldComparison.hasScopedMatch === true || fieldComparison.hasMismatch === true)
            && certificate.status !== "strict") {
            if (searchFrontier.status === "searchExhausted") {
                return {
                    taskId: `human-decision:${id}`,
                    kind: "humanDecision",
                    owner: "human",
                    status: "awaitingUserDecision",
                    priority: 40,
                    autoProcessableNow: false,
                    reason: "finite-source-frontier-exhausted-awaiting-user-decision",
                    searchFrontier
                };
            }
            return {
                taskId: `field-comparison:${id}`,
                kind: "fieldComparison",
                owner: "source/provider + human",
                status: "awaitingReconciliation",
                priority: 15,
                autoProcessableNow: false,
                reason: fieldComparison.hasScopedMatch === true
                    ? "scoped-match-needs-certificate-or-scope-reconciliation"
                    : "field-comparison-needs-certificate-reconciliation"
            };
        }
        return {
            taskId: `human-review:${id}`,
            kind: "humanReview",
            owner: "human",
            status: "ready",
            priority: 20,
            autoProcessableNow: false,
            reason: "prepared-evidence-awaits-approve-hold-or-reject"
        };
    }

    const certificate = deriveCertificateState(record, context);
    const hasExternalPrerequisite = certificate.status !== "strict"
        && (Array.isArray(record?.blockReasons)
            && record.blockReasons.some((reason) => SOURCE_REASONS.has(reason)));
    // Source/version/lineage/certificate prerequisites are first-applicable.
    // Semantic and consumer choices cannot become the current task while the
    // external evidence gate is still unresolved.
    if (hasExternalPrerequisite) {
        return {
            taskId: `${searchFrontier.status === "searchRequired" ? "source-search" : "source-reopen"}:${id}`,
            kind: "sourceProvider",
            owner: searchFrontier.status === "searchRequired" ? "Luna + Sol audit" : "source/provider",
            status: searchFrontier.status === "searchExhausted" ? "reopenOnTrigger" : "ready",
            priority: record?.primaryBlockReason === "versionOrProviderCoverageDrift"
                ? ({ exactCandidateMapped: 12, reactionConsumerTransition: 12, structuralScopeCandidate: 14, conservativeEntityInvalidation: 18 }
                    [record?.evidence?.officialVersionImpact?.mappingStatus] || 18)
                : 50,
            autoProcessableNow: false,
            reason: record?.primaryBlockReason || "strictCertificatePrerequisite",
            prerequisite: "candidate×claim eligibility certificate",
            reopenTrigger: searchFrontier.reopenTrigger
        };
    }

    if (record?.evidence?.identityConsistency?.blocked === true) {
        return {
            taskId: `identity-reconcile:${id}`,
            kind: "identityReconciliation",
            owner: "Sol + source evidence",
            status: "awaitingReconciliation",
            priority: 24,
            autoProcessableNow: false,
            reason: record.evidence.identityConsistency.classification
        };
    }
    if (canAutomaticallyProcess(record, context)) {
        return {
            taskId: `machine-transition:${id}`,
            kind: "machineTransition",
            owner: "Luna",
            status: "ready",
            priority: 10,
            autoProcessableNow: true,
            reason: "verified-evidence-without-external-human-or-consumer-blocker"
        };
    }

    const primary = record?.primaryBlockReason;
    if (record?.mappingStatus === "missing") {
        return {
            taskId: `mapping:${id}`,
            kind: "mapping",
            owner: "Luna",
            status: "ready",
            priority: 25,
            autoProcessableNow: false,
            reason: "runtime-destination-or-supersession-mapping-missing"
        };
    }
    if (CONSUMER_REASONS.has(primary) && record?.consumerStatus !== "notApplicable") {
        return {
            taskId: `consumer:${id}`,
            kind: "consumer",
            owner: "consumer",
            status: "waiting",
            priority: 30,
            autoProcessableNow: false,
            reason: primary
        };
    }
    if (primary === "semanticDecisionRequired") {
        return {
            taskId: `semantic-review:${id}`,
            kind: "semanticReview",
            owner: "source/provider + human",
            status: "waiting",
            priority: 40,
            autoProcessableNow: false,
            reason: primary
        };
    }
    if (SOURCE_PRIMARY_REASONS.has(primary) || searchFrontier.status === "searchRequired") {
        return {
            taskId: `${searchFrontier.status === "searchRequired" ? "source-search" : "source-reopen"}:${id}`,
            kind: "sourceProvider",
            owner: searchFrontier.status === "searchRequired" ? "Luna + Sol audit" : "source/provider",
            status: searchFrontier.status === "searchExhausted" ? "reopenOnTrigger" : "ready",
            priority: primary === "versionOrProviderCoverageDrift"
                ? ({ exactCandidateMapped: 12, reactionConsumerTransition: 12, structuralScopeCandidate: 14, conservativeEntityInvalidation: 18 }
                    [record?.evidence?.officialVersionImpact?.mappingStatus] || 18)
                : 50,
            autoProcessableNow: false,
            reason: primary || "sourceEvidenceRequired",
            reopenTrigger: searchFrontier.reopenTrigger
        };
    }
    if (HUMAN_REASONS.has(primary)) {
        return {
            taskId: `human-decision:${id}`,
            kind: "humanDecision",
            owner: "human",
            status: "waiting",
            priority: 40,
            autoProcessableNow: false,
            reason: primary
        };
    }
    return {
        taskId: `audit:${id}`,
        kind: "audit",
        owner: "Luna",
        status: "waiting",
        priority: 60,
        autoProcessableNow: false,
        reason: primary || "unclassified-blocker"
    };
}

function groupCounts(tasks) {
    return tasks.reduce((counts, task) => {
        counts[task.kind] = (counts[task.kind] || 0) + 1;
        return counts;
    }, {});
}

function deriveDeferredLanes(record, currentTask) {
    const reasons = Array.isArray(record?.blockReasons) ? record.blockReasons : [];
    const lanes = [];
    const add = (kind, owner, blockingReasons) => {
        if (currentTask?.kind === kind || !blockingReasons.length) return;
        lanes.push({ kind, owner, status: "deferred", blockingReasons });
    };
    add("sourceProvider", "Luna + Sol audit", reasons.filter((reason) => SOURCE_REASONS.has(reason)));
    add("semanticDecision", "Sol then human only if unresolved", reasons.filter((reason) => HUMAN_REASONS.has(reason)));
    const consumerReasons = reasons.filter((reason) => CONSUMER_REASONS.has(reason)
        && !(reason === "inputMissing" && hasExistingRuntimeInputRoute(record)));
    add("consumer", "Sol implementation", consumerReasons);
    if (record?.mappingStatus === "missing") add("mapping", "Sol", ["mappingMissing"]);
    if (record?.evidence?.identityConsistency?.blocked === true) {
        add("identityReconciliation", "Sol + source evidence", [record.evidence.identityConsistency.classification]);
    }
    return lanes;
}

function buildEvidenceTaskQueue(records, policies = []) {
    const context = normalizeContext(policies);
    const providerPolicies = context.providerPolicies || [];
    const source = Array.isArray(records) ? records : [];
    const tasks = source.map((record) => {
        const searchFrontier = record.searchFrontier
            || deriveSearchFrontier(record, context);
        const certificate = deriveCertificateState({ ...record, searchFrontier }, context);
        const autoProcessableNow = canAutomaticallyProcess(record, context);
        const nextTask = deriveNextTask({ ...record, autoProcessableNow }, searchFrontier, context);
        return {
            candidateId: record.id,
            layer: record.layer,
            dataset: record.dataset,
            terminalState: record.terminalState,
            primaryBlockReason: record.primaryBlockReason || null,
            blockReasons: Array.isArray(record.blockReasons) ? [...record.blockReasons] : [],
            task: nextTask,
            deferredLanes: deriveDeferredLanes(record, nextTask),
            searchFrontier,
            certificate,
            officialVersionImpact: record.evidence?.officialVersionImpact || null,
            transitionLane: record.evidence?.officialVersionImpact?.mappingStatus || null,
            preparedTransitionClaimCount: record.preparedTransitionClaimCount || 0,
            transitionClaimSchemaStatus: record.transitionClaimSchemaStatus || null,
            transitionProviderCaptureStatus: record.evidence?.transitionClaimPreparation?.providerCaptureStatus || null,
            bulkTransitionCapture: record.evidence?.bulkTransitionCapture || null,
            identityConsistency: record.evidence?.identityConsistency || null,
            providerIdentityReconciliation: record.evidence?.providerIdentityReconciliation || null,
            fieldComparison: record.evidence?.fieldComparison || null,
            mappingStatus: record.mappingStatus || "unknown",
            consumerStatus: record.consumerStatus || "unknown",
            machineEvidenceReady: record.machineEvidenceReady === true,
            autoProcessableNow: nextTask.autoProcessableNow === true
        };
    });
    const ready = tasks.filter((task) => ["ready", "awaitingReconciliation"].includes(task.task.status));
    const incomplete = tasks.filter((task) => task.task.status !== "complete");
    const sortedReady = [...ready].sort((left, right) => {
        const priority = (left.task.priority ?? 999) - (right.task.priority ?? 999);
        return priority || left.candidateId.localeCompare(right.candidateId);
    });
    const summary = {
        totalCandidates: tasks.length,
        complete: tasks.length - incomplete.length,
        incomplete: incomplete.length,
        productionCanonical: tasks.filter((task) => task.terminalState === "productionCanonical").length,
        verifiedSpec: tasks.filter((task) => task.terminalState === "verifiedSpec").length,
        verifiedSpecCurrent: tasks.filter((task) => task.terminalState === "verifiedSpec" && task.task.status === "complete").length,
        versionReverificationWait: tasks.filter((task) => task.task.kind === "versionReverification").length,
        nonCalculativeComplete: tasks.filter((task) => task.terminalState === "nonCalculativeComplete").length,
        awaitingHumanReview: tasks.filter((task) => task.terminalState === "awaitingHumanReview").length,
        blocked: tasks.filter((task) => task.terminalState === "blocked").length,
        machineEvidenceReady: tasks.filter((task) => task.machineEvidenceReady).length,
        autoProcessableNow: tasks.filter((task) => task.autoProcessableNow).length,
        readyTasks: ready.length,
        humanReviewReady: tasks.filter((task) => task.task.kind === "humanReview" && task.task.status === "ready").length,
        humanDecisionWait: tasks.filter((task) => ["humanDecision", "semanticReview"].includes(task.task.kind)).length,
        humanWait: tasks.filter((task) => ["humanReview", "humanDecision", "semanticReview"].includes(task.task.kind)).length,
        reconciliationWait: tasks.filter((task) => task.task.kind === "fieldComparison").length,
        consumerWait: tasks.filter((task) => task.task.kind === "consumer").length,
        mappingReady: tasks.filter((task) => task.mappingStatus === "prepared").length,
        mappingMissing: tasks.filter((task) => task.mappingStatus === "missing").length,
        sourceProviderWait: tasks.filter((task) => task.task.kind === "sourceProvider").length,
        certificateStrict: tasks.filter((task) => task.certificate.status === "strict").length,
        certificateBlocked: tasks.filter((task) => task.certificate.status !== "strict").length,
        attestationPresent: tasks.filter((task) => task.certificate.attestation.qualifying).length,
        candidateClaimEligible: tasks.filter((task) => task.certificate.strictEligible === true).length,
        autoAttestationEligible: tasks.filter((task) => task.certificate.strictEligible === true).length,
        promotionEligible: tasks.filter((task) => task.certificate.strictEligible === true).length,
        genuinelyBlocked: tasks.filter((task) => task.task.kind === "sourceProvider"
            && hasCompleteSearchFrontier(task.searchFrontier)).length,
        genuinelyBlockedState: tasks.some((task) => task.task.kind === "sourceProvider"
            && hasCompleteSearchFrontier(task.searchFrontier))
            ? "source-provider-frontier-blocked"
            : "none",
        searchExhausted: tasks.filter((task) => task.searchFrontier.status === "searchExhausted").length,
        searchDeferred: tasks.filter((task) => task.searchFrontier.status === "deferred").length,
        searchRequired: tasks.filter((task) => task.searchFrontier.status === "searchRequired").length,
        taskKinds: groupCounts(tasks.map((task) => task.task))
    };
    const prioritizedIncomplete = [...incomplete].sort((left, right) => {
        const priority = (left.task.priority ?? 999) - (right.task.priority ?? 999);
        return priority || left.candidateId.localeCompare(right.candidateId);
    });
    const nextAction = sortedReady[0] || prioritizedIncomplete[0] || null;
    const unlockClusters = deriveUnlockClusters(tasks);
    const status = summary.autoProcessableNow > 0
        ? "machineActionAvailable"
        : nextAction?.task?.kind === "fieldComparison"
            ? "reconciliationAvailable"
            : summary.readyTasks > 0
            ? nextAction?.task?.kind === "sourceProvider" ? "sourceResearchAvailable" : "workAvailable"
            : summary.humanDecisionWait > 0
                ? "humanActionAvailable"
            : summary.incomplete > 0
                ? "externalOrConsumerWait"
                : "complete";
    const { records: progressRecords, ...workProgress } = workDisposition.buildWorkProgress(
        tasks, context.workDispositions || workDisposition.loadRegistry(),
        {
            targetGameVersion: context.targetGameVersion || "7.0",
            readArtifact: context.readDispositionArtifact,
            reopenedCandidateIds: context.reopenedCandidateIds || []
        }
    );
    tasks.forEach((task, index) => { task.progress = progressRecords[index]; });
    // r2 disposition can close an evidence wait without verifying the data.
    // Keep the historical verification counters unchanged and name both axes.
    summary.workDisposed = workProgress.summary.disposed;
    summary.evidenceDeferred = workProgress.summary.evidenceDeferred;
    summary.workPending = workProgress.summary.pending;
    summary.workAwaitingUserDecision = workProgress.summary.awaitingUserDecision;
    return {
        schemaVersion: 1,
        kind: "genshinEvidenceDerivedTaskQueue",
        sourceOfTruth: "candidate-terminal-state-audit plus v2/eligibility-certificates.json (candidate×claim); provider-independence-policy is search/pair context only",
        status,
        goal: {
            objective: "r2: complete finite data checking, safe calculation updates and evidence-deferred dispositions without weakening verification.",
            status,
            completion: workProgress.goalComplete,
            verificationQueueComplete: summary.incomplete === 0,
            completionPolicy: workProgress.policyId,
            requiredAcceptanceChecks: workProgress.releaseAcceptance,
            nextTask: nextAction,
            kpi: summary
        },
        summary,
        workProgress,
        unlockClusters,
        tasks
    };
}

function unlockDomain(task) {
    if (task.dataset === "weapons") return "weapons";
    if (task.dataset === "artifacts") return "artifacts";
    if (task.dataset === "talentGap") return "talentGap";
    if (String(task.dataset).startsWith("behavior")) return "behavior";
    return task.dataset || "unknown";
}

function researchPlanFor(primaryBlockReason) {
    if (primaryBlockReason === "versionOrProviderCoverageDrift") return "versionTransitionEvidence";
    if (["inputMissing", "unsupported", "schemaGap", "consumerMissing"].includes(primaryBlockReason)) return "sourceEvidenceBeforeConsumerOrSchema";
    if (primaryBlockReason === "semanticDecisionRequired") return "sourceEvidenceBeforeSemanticDecision";
    return "candidateClaimFieldEvidence";
}

function deriveUnlockClusters(tasks, { shardSize = 100 } = {}) {
    const grouped = new Map();
    tasks.filter((task) => task.task.kind === "sourceProvider" && task.task.status === "ready").forEach((task) => {
        const domain = unlockDomain(task);
        const transitionLane = task.primaryBlockReason === "versionOrProviderCoverageDrift"
            ? task.transitionLane || "unclassifiedTransition"
            : "standard";
        const key = [domain, task.layer, task.primaryBlockReason || "sourceMissing", transitionLane].join(":");
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(task);
    });
    return [...grouped.entries()].map(([key, members]) => {
        const ordered = [...members].sort((a, b) => a.candidateId.localeCompare(b.candidateId));
        const candidateIds = ordered.map((item) => item.candidateId);
        return {
            clusterId: `source-unlock:${key}`,
            domain: unlockDomain(ordered[0]),
            layer: ordered[0].layer,
            primaryBlockReason: ordered[0].primaryBlockReason,
            transitionLane: ordered[0].transitionLane,
            priority: Math.min(...ordered.map((item) => item.task.priority ?? 999)),
            researchPlan: researchPlanFor(ordered[0].primaryBlockReason),
            candidateCount: candidateIds.length,
            knownClaimCount: ordered.reduce((total, item) => total + (item.certificate?.claims?.length || 0), 0),
            preparedTransitionClaimCount: ordered.reduce((total, item) => total + (item.preparedTransitionClaimCount || 0), 0),
            providerCaptureStatuses: [...new Set(ordered.map((item) => item.transitionProviderCaptureStatus).filter(Boolean))].sort(),
            datasets: [...new Set(ordered.map((item) => item.dataset))].sort(),
            blockReasons: [...new Set(ordered.flatMap((item) => item.blockReasons || []))].sort(),
            shards: Array.from({ length: Math.ceil(candidateIds.length / shardSize) }, (_, index) => ({
                shardId: `${key}:${String(index + 1).padStart(2, "0")}`,
                candidateIds: candidateIds.slice(index * shardSize, (index + 1) * shardSize)
            }))
        };
    }).sort((left, right) => {
        const priority = left.priority - right.priority;
        return priority || right.candidateCount - left.candidateCount || left.clusterId.localeCompare(right.clusterId);
    });
}

function renderTaskQueueMarkdown(queue) {
    const k = queue.goal.kpi;
    return [
        "# Genshin evidence-derived task queue",
        "",
        `Status: **${queue.status}**`,
        "",
        `Next task: **${queue.goal.nextTask?.task?.taskId || "none"}**`,
        "",
        `Candidates: **${k.totalCandidates}**; verification/non-calculative terminal complete **${k.complete}**; verification incomplete **${k.incomplete}**; machine-ready **${k.machineEvidenceReady}**; auto-processable now **${k.autoProcessableNow}**.`,
        "",
        "| task kind | count |",
        "| --- | ---: |",
        ...Object.entries(k.taskKinds).sort(([a], [b]) => a.localeCompare(b)).map(([kind, count]) => `| ${kind} | ${count} |`),
        "",
        `Search frontier: exhausted **${k.searchExhausted}**, deferred **${k.searchDeferred}**, required **${k.searchRequired}**.`,
        "",
        `r2 work dispositions: **${queue.workProgress?.summary.disposed || 0}/${k.totalCandidates}**; evidence-deferred **${queue.workProgress?.summary.evidenceDeferred || 0}**. This is not a verified-data count.`,
        `r2 goal acceptance: **${queue.goal.completion ? "complete" : "incomplete"}**; candidate verification and release acceptance are separate.`,
        "",
        `Source unlock clusters: **${queue.unlockClusters.length}** (deterministic shards of at most 100 candidates).`,
        "",
        ...queue.unlockClusters.map((cluster) => `- ${cluster.clusterId}: ${cluster.candidateCount} candidates / ${cluster.knownClaimCount} certified claims / ${cluster.preparedTransitionClaimCount} transition claims prepared / ${cluster.shards.length} shards`),
        ""
    ].join("\n");
}

module.exports = {
    COMPLETE_STATES,
    CONSUMER_REASONS,
    HUMAN_REASONS,
    SEARCH_METADATA_FIELDS,
    SOURCE_PRIMARY_REASONS,
    SOURCE_REASONS,
    buildEvidenceTaskQueue,
    canAutomaticallyProcess,
    strictCandidateCertificate,
    deriveCertificateState,
    deriveNextTask,
    deriveDeferredLanes,
    hasExistingRuntimeInputRoute,
    deriveUnlockClusters,
    deriveSearchFrontier,
    hasCompleteSearchFrontier,
    normalizeContext,
    policyAppliesToRecord,
    renderTaskQueueMarkdown,
    searchPolicyFor,
    validSearchExhaustionPolicy
};
