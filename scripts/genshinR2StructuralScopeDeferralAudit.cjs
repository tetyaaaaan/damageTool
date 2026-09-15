"use strict";

/**
 * Build the bounded G06 draft for the seven 7.0 structural-scope candidates.
 *
 * This is intentionally a producer for a review artifact only.  It records
 * candidate-scoped local values, source-file digests, and the unresolved
 * mapping/evidence boundary.  It never edits the authoritative queue,
 * Runtime, canonical data, or the work-disposition registry.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const work = require("./genshinWorkDisposition.cjs");

const ROOT = path.resolve(__dirname, "..");
const DATA_ROOT = path.join(ROOT, "games", "genshin", "data");
const QUEUE_PATH = path.join(ROOT, "reports", "genshin-evidence-task-queue.json");
const OUTPUT_PATH = path.join(DATA_ROOT, "v2", "reviews", "r2-structural-scope-deferral-audit.json");
const TARGET_GAME_VERSION = "7.0";
const FROM_GAME_VERSION = "6.7";
const TRANSITION_ID = "genshin:6.7->7.0";
const GENERATED_AT = "2026-08-29T00:00:00.000Z";
const GENERATOR_VERSION = "genshinR2StructuralScopeDeferralAudit/1";
const FRONTIER_POLICY = work.TRANSITION_FRONTIER_POLICY;
const EXPECTED_FRONTIER_CANDIDATE_COUNT = 55;
const EXPECTED_SELECTED_COUNT = 7;
const EXPECTED_EXCLUDED_COUNT = 48;
const MAPPED_MAPPING_STATUSES = new Set(["conservativeEntityInvalidation", "exactCandidateMapped"]);
const SELECTED_CANDIDATE_IDS = Object.freeze([
    "behavior:10000058:talent:passives-passive-1",
    "behavior:10000071:talent:passives-passive-1",
    "behavior:10000071:talent:passives-passive-2",
    "behavior:10000071:talent:passives-passive-utility",
    "talent-gap-spec:10000058:passive_1",
    "talent-gap-spec:10000058:passive_2",
    "talent-gap-spec:10000058:passive_utility"
]);
const SELECTED_SET = new Set(SELECTED_CANDIDATE_IDS);
const REACTION_CANDIDATE_ID = "w_12516_reaction_bonus_2";
const BEHAVIOR_CLAIM_FALLBACK = Object.freeze([
    "sourceText", "timing", "execution", "lifecycle", "energy", "snapshot", "runtime"
]);
const INTERNAL_CLAIMS = new Set(work.INTERNAL_METADATA_CLAIMS);
const EXTERNAL_CLAIMS = new Set(work.EXTERNAL_MECHANIC_CLAIMS);

const DATASET_FILES = Object.freeze({
    behaviorPilot: {
        specs: "games/genshin/data/v2/characters/behavior-pilot.json",
        sources: "games/genshin/data/v2/characters/behavior-pilot.json"
    },
    behaviorBatch6: {
        specs: "games/genshin/data/v2/characters/behavior-batch-6/spec-candidates.json",
        sources: "games/genshin/data/v2/characters/behavior-batch-6/source-records.json"
    },
    talentGap: {
        specs: "games/genshin/data/v2/characters/talent-gap-candidates.json",
        sources: "games/genshin/data/v2/characters/talent-gap-candidates.json"
    }
});

const TRANSITION_FILES = Object.freeze({
    sourceSearch: "games/genshin/data/v2/version-transitions/6.7-to-7.0/source-search.json",
    partialDiscovery: "games/genshin/data/v2/version-transitions/6.7-to-7.0/partial-discovery.json",
    claimReacquisition: "games/genshin/data/v2/version-transitions/6.7-to-7.0/claim-reacquisition.json",
    officialChangeIndex: "games/genshin/data/v2/version-transitions/6.7-to-7.0/official-change-index.json",
    targetDatasetEvidence: "games/genshin/data/v2/version-transitions/6.7-to-7.0/target-dataset-evidence.json",
    affectedEntitySnapshot: "games/genshin/data/v2/version-transitions/6.7-to-7.0/affected-entity-snapshot.json",
    sourceCatalog: "games/genshin/data/v2/source-catalog.json",
    providerPolicy: "games/genshin/data/v2/provider-independence-policy.json",
    canonicalRuntime: "games/genshin/data/v2/runtime/canonical-runtime.json",
    eligibilityCertificates: "games/genshin/data/v2/eligibility-certificates.json"
});

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const stable = (value) => Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === "object"
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
        : value;
const stableJson = (value) => JSON.stringify(stable(value));
const digest = (value) => crypto.createHash("sha256").update(stableJson(value)).digest("hex");
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const text = (value) => typeof value === "string" && value.trim().length > 0;
const sortedUnique = (values) => [...new Set((values || [])
    .filter((value) => value !== null && value !== undefined)
    .map(String))].sort((left, right) => left.localeCompare(right));
const relative = (file) => path.relative(ROOT, file).replaceAll("\\", "/");

function resolveRepoFile(file) {
    const resolved = path.isAbsolute(String(file))
        ? path.resolve(String(file))
        : path.resolve(ROOT, String(file));
    if (!resolved.startsWith(`${ROOT}${path.sep}`)) throw new Error(`artifactOutsideRepository:${file}`);
    return resolved;
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(resolveRepoFile(file), "utf8"));
}

function fileRef(file) {
    const resolved = resolveRepoFile(file);
    if (!fs.existsSync(resolved)) throw new Error(`artifactMissing:${relative(resolved)}`);
    const bytes = fs.readFileSync(resolved);
    return { path: relative(resolved), bytes: bytes.length, sha256: sha256(bytes) };
}

function refWithoutBytes(ref) {
    return { path: ref.path, sha256: ref.sha256 };
}

function dedupeRefs(refs) {
    return [...new Map((refs || []).map((ref) => [ref.path, refWithoutBytes(ref)])).values()]
        .sort((left, right) => left.path.localeCompare(right.path));
}

function loadQueue(queueInput) {
    if (queueInput === undefined || queueInput === null) {
        const bytes = fs.readFileSync(QUEUE_PATH);
        return {
            value: JSON.parse(bytes.toString("utf8")),
            path: relative(QUEUE_PATH),
            bytes: bytes.length,
            rawSha256: sha256(bytes)
        };
    }
    if (typeof queueInput === "string") {
        const file = resolveRepoFile(queueInput);
        const bytes = fs.readFileSync(file);
        return {
            value: JSON.parse(bytes.toString("utf8")),
            path: relative(file),
            bytes: bytes.length,
            rawSha256: sha256(bytes)
        };
    }
    if (queueInput && queueInput.value && Array.isArray(queueInput.value.tasks)) return queueInput;
    return { value: queueInput, path: relative(QUEUE_PATH), bytes: null, rawSha256: null };
}

function loadTransitionFiles() {
    return Object.fromEntries(Object.entries(TRANSITION_FILES)
        .map(([name, file]) => [name, readJson(file)]));
}

function loadTransitionRefs() {
    return Object.fromEntries(Object.entries(TRANSITION_FILES)
        .map(([name, file]) => [name, fileRef(file)]));
}

function loadDatasets() {
    const result = {};
    for (const [dataset, files] of Object.entries(DATASET_FILES)) {
        const specDocument = readJson(files.specs);
        const sourceDocument = readJson(files.sources);
        result[dataset] = {
            specs: specDocument.specs || specDocument,
            sources: sourceDocument.sourceRecords || sourceDocument.sources || sourceDocument
        };
    }
    return result;
}

function mappingById(partialDiscovery) {
    return new Map((partialDiscovery?.claim?.candidateMappings || [])
        .map((item) => [String(item.candidateId), item]));
}

function officialChangeById(officialChangeIndex) {
    const entries = [];
    for (const change of officialChangeIndex?.claim?.changes || []) {
        if (text(change?.changeId)) entries.push([String(change.changeId), change]);
        for (const candidateId of change?.candidateIds || []) entries.push([String(candidateId), change]);
    }
    return new Map(entries);
}

function taskById(queue) {
    return new Map((queue?.tasks || []).map((task) => [String(task.candidateId), task]));
}

function selectScope(queue, transition) {
    const mappings = transition.partialDiscovery?.claim?.candidateMappings || [];
    if (mappings.length !== EXPECTED_FRONTIER_CANDIDATE_COUNT) {
        throw new Error(`frontierCandidateMappingCount:${mappings.length}`);
    }
    const mapById = mappingById(transition.partialDiscovery);
    if (mapById.size !== mappings.length) throw new Error("duplicateTransitionCandidateMapping");
    for (const id of SELECTED_CANDIDATE_IDS) {
        const mapping = mapById.get(id);
        if (!mapping || mapping.mappingStatus !== "structuralScopeCandidate"
            || mapping.claimScope !== "candidateIdentityPending") {
            throw new Error(`selectedMappingInvalid:${id}`);
        }
    }
    const tasks = taskById(queue);
    const selectedTasks = SELECTED_CANDIDATE_IDS.map((candidateId) => {
        const task = tasks.get(candidateId);
        const mapping = mapById.get(candidateId);
        if (!task) throw new Error(`queueTaskMissing:${candidateId}`);
        if (task.dataset !== mapping.dataset || task.layer !== mapping.layer
            || task.candidateId !== candidateId) throw new Error(`mappingTaskBindingMismatch:${candidateId}`);
        return task;
    });
    const mappedIds = mappings.filter((item) => MAPPED_MAPPING_STATUSES.has(item.mappingStatus))
        .map((item) => String(item.candidateId));
    if (mappedIds.length !== 47) throw new Error(`mappedCandidateCount:${mappedIds.length}`);
    const reaction = mapById.get(REACTION_CANDIDATE_ID);
    if (!reaction || MAPPED_MAPPING_STATUSES.has(reaction.mappingStatus)) {
        throw new Error("reactionCandidateMustRemainExcluded");
    }
    const excludedCandidateIds = [...new Set([...mappedIds, REACTION_CANDIDATE_ID])]
        .sort((left, right) => left.localeCompare(right));
    if (excludedCandidateIds.length !== EXPECTED_EXCLUDED_COUNT) {
        throw new Error(`excludedCandidateCount:${excludedCandidateIds.length}`);
    }
    if (excludedCandidateIds.some((id) => SELECTED_SET.has(id))) {
        throw new Error("selectedCandidateAppearsExcluded");
    }
    return {
        mappings,
        mapById,
        selectedTasks: selectedTasks.sort((left, right) => left.candidateId.localeCompare(right.candidateId)),
        excludedCandidateIds,
        excludedTasks: excludedCandidateIds.map((id) => {
            const task = tasks.get(id);
            if (!task) throw new Error(`excludedQueueTaskMissing:${id}`);
            return task;
        })
    };
}

function specFor(task, datasets) {
    const data = datasets[task.dataset];
    const spec = data?.specs?.[task.candidateId];
    if (!spec) throw new Error(`candidateSpecMissing:${task.candidateId}:${task.dataset}`);
    return { data, spec };
}

function sourceRecordsFor(spec, data, candidateId) {
    const sourceRefs = Array.isArray(spec?.sourceRefs) ? spec.sourceRefs.map(String) : [];
    if (!sourceRefs.length) throw new Error(`candidateSourceRefsMissing:${candidateId}`);
    return sourceRefs.map((id) => {
        const record = data.sources?.[id];
        if (!record) throw new Error(`candidateSourceRecordMissing:${candidateId}:${id}`);
        return { id, record };
    });
}

function claimNamesFor(task, spec, transition) {
    const queueClaims = task?.certificate?.certificate?.claims || [];
    const packet = (transition.claimReacquisition?.claim?.packets || [])
        .find((item) => item.candidateId === task.candidateId);
    const packetClaims = packet?.claimPackets || [];
    const names = sortedUnique([
        ...queueClaims.map((claim) => claim?.field),
        ...packetClaims.map((claim) => claim?.claimName)
    ]);
    if (names.length) return names;
    if (task.dataset === "behaviorPilot" && task.candidateId === SELECTED_CANDIDATE_IDS[0]) {
        return [...BEHAVIOR_CLAIM_FALLBACK].sort((left, right) => left.localeCompare(right));
    }
    const specClaims = Object.keys(spec?.verification?.claims || {});
    if (specClaims.length) return sortedUnique(specClaims);
    throw new Error(`candidateClaimSchemaMissing:${task.candidateId}`);
}

function pathValue(value, pathName) {
    return String(pathName).split(".").reduce((current, key) =>
        current && typeof current === "object" ? current[key] : undefined, value);
}

function claimValue(spec, source, claimName) {
    if (claimName === "sourceText") return source?.text ?? null;
    if (claimName === "timing") {
        if (spec?.timing !== undefined) return clone(spec.timing);
        const effect = spec?.effect || {};
        return {
            durationSeconds: effect.durationSeconds ?? null,
            intervalSeconds: effect.intervalSeconds ?? null,
            cooldownSeconds: effect.cooldownSeconds ?? null
        };
    }
    if (["execution", "lifecycle", "energy", "runtime"].includes(claimName)) {
        return clone(spec?.[claimName] ?? null);
    }
    if (claimName === "snapshot") return clone(spec?.snapshot ?? null);
    if (claimName === "runtimeEligibility") return clone(spec?.runtime ?? null);
    if (["effectKind", "targets", "activation", "value"].includes(claimName)) {
        return clone(pathValue(spec?.effect || {}, claimName) ?? null);
    }
    return clone(pathValue(spec, claimName) ?? null);
}

function valueIsUnknown(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.length === 0 || value === "unknown";
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "object") {
        const values = Object.values(value);
        return values.length === 0 || values.every(valueIsUnknown);
    }
    return false;
}

function currentStatus(claimName, value) {
    if (INTERNAL_CLAIMS.has(claimName)) return "internalImplementationMetadataBlocked";
    return valueIsUnknown(value) ? "unknownLocalProjection" : "localProjectionUnverified";
}

function missingEvidence(candidateId, claimName, status) {
    if (INTERNAL_CLAIMS.has(claimName)) {
        return `Candidate ${candidateId} retains ${claimName} as explicit local implementation metadata (${status}); it is not external gameplay evidence. Mapping remains unresolved and Runtime/certificate/promotion remain blocked.`;
    }
    return `Candidate ${candidateId} retains the current local value/status (${status}) for comparison only. Candidate identity/scope remains unresolved and no provider-owned immutable independent ${TARGET_GAME_VERSION} mechanic field is materialized for claim.${claimName}; no historical value is inferred.`;
}

function fieldFindings(task, spec, sourceRecord, claimNames) {
    return claimNames.map((claimName) => {
        const value = claimValue(spec, sourceRecord, claimName);
        const knownStatus = currentStatus(claimName, value);
        return {
            field: `claim.${claimName}`,
            knownStatus,
            currentValue: value,
            historicalValue: null,
            missingEvidence: missingEvidence(task.candidateId, claimName, knownStatus)
        };
    });
}

function sourceDetails(records) {
    return records.map(({ id, record }) => ({
        id,
        provider: record.provider ?? null,
        independenceGroup: record.independenceGroup ?? null,
        providerIndependence: record.providerIndependence ?? null,
        capturedAt: record.capturedAt ?? null,
        gameVersion: record.gameVersion ?? null,
        locale: record.locale ?? null,
        locator: clone(record.locator ?? null),
        integrityDigest: record.integrity?.digest ?? null,
        recordDigest: digest(record),
        sourceValue: clone(record.text ?? record.structuredValue ?? null)
    }));
}

function candidateSourceFileRefs(task) {
    const files = DATASET_FILES[task.dataset];
    if (!files) throw new Error(`datasetFileMappingMissing:${task.dataset}`);
    return [fileRef(files.specs), fileRef(files.sources)];
}

function candidateRefs(task, transitionRefs) {
    return dedupeRefs([
        ...candidateSourceFileRefs(task),
        transitionRefs.sourceSearch,
        transitionRefs.partialDiscovery,
        transitionRefs.claimReacquisition,
        transitionRefs.officialChangeIndex,
        transitionRefs.targetDatasetEvidence,
        transitionRefs.affectedEntitySnapshot,
        transitionRefs.sourceCatalog,
        transitionRefs.providerPolicy
    ]);
}

function safetyRefs(task, transitionRefs) {
    return dedupeRefs([
        ...candidateSourceFileRefs(task),
        transitionRefs.canonicalRuntime,
        transitionRefs.eligibilityCertificates,
        transitionRefs.sourceCatalog,
        transitionRefs.providerPolicy
    ]);
}

function claimPacketFor(task, transition) {
    return (transition.claimReacquisition?.claim?.packets || [])
        .find((item) => item.candidateId === task.candidateId) || null;
}

function externalClaimNames(claimNames) {
    return claimNames.filter((claimName) => EXTERNAL_CLAIMS.has(claimName));
}

function boundedRemaining(task, externalFields) {
    return [`Resolve the candidate identity/scope for ${task.candidateId} and obtain exact ${TARGET_GAME_VERSION} provider-owned independent mechanic evidence for claims [${externalFields.join(", ")}], with immutable raw/field digests and strict version binding.`];
}

function frontierDigest(task, claimNames) {
    const frontier = task.searchFrontier;
    return digest({
        candidateId: task.candidateId,
        taskId: task.task?.taskId,
        policyId: frontier?.policyId,
        scopeUnit: frontier?.scopeUnit,
        searchScope: frontier?.searchScope,
        lastSearchedAt: frontier?.lastSearchedAt,
        providersExamined: frontier?.providersExamined,
        status: frontier?.status,
        exhausted: frontier?.exhausted === true,
        scopeMatched: frontier?.scopeMatched === true,
        reopenTrigger: frontier?.reopenTrigger,
        blockingReasons: frontier?.blockingReasons || [],
        claimFields: claimNames
    });
}

function selectionRow(task, mapping) {
    return {
        candidateId: String(task.candidateId),
        taskId: String(task.task?.taskId || ""),
        dataset: String(task.dataset || ""),
        layer: String(task.layer || ""),
        transitionLane: String(task.transitionLane || ""),
        mappingStatus: String(mapping?.mappingStatus || ""),
        claimScope: String(mapping?.claimScope || ""),
        transitionClaimSchemaStatus: String(task.transitionClaimSchemaStatus || ""),
        deferredLaneCount: Array.isArray(task.deferredLanes) ? task.deferredLanes.length : null,
        frontierPolicyId: String(task.searchFrontier?.policyId || ""),
        frontierStatus: String(task.searchFrontier?.status || ""),
        frontierExhausted: task.searchFrontier?.exhausted === true,
        frontierScopeMatched: task.searchFrontier?.scopeMatched === true,
        entityId: String(mapping?.entityId || task.officialVersionImpact?.entityId || ""),
        mappingResolved: false
    };
}

function decisionFor(task, mapping, change, transition, transitionRefs, datasets, generatedAt) {
    if (!work.isAllowedMappingEvidenceWait(task)) {
        throw new Error(`mappingEvidenceWaitTaskPredicateFailed:${task.candidateId}`);
    }
    if (!change || !text(change.changeId) || String(change.changeId) !== String(mapping?.officialChangeId)) {
        throw new Error(`officialChangeBindingMissing:${task.candidateId}`);
    }
    const { data, spec } = specFor(task, datasets);
    const sources = sourceRecordsFor(spec, data, task.candidateId);
    const primarySource = sources[0]?.record;
    const claimNames = claimNamesFor(task, spec, transition);
    const findings = fieldFindings(task, spec, primarySource, claimNames);
    const externalFields = externalClaimNames(claimNames);
    if (!externalFields.length) throw new Error(`externalClaimScopeEmpty:${task.candidateId}`);
    const remaining = boundedRemaining(task, externalFields);
    const refs = candidateRefs(task, transitionRefs);
    const safety = safetyRefs(task, transitionRefs);
    const packet = claimPacketFor(task, transition);
    const reason = `Candidate ${task.candidateId} has a known entity but unresolved candidate identity/scope. This draft records a mapping-bound external-evidence wait only; it does not resolve mapping, verify values, or request human semantics.`;
    const lane = {
        kind: "mappingEvidenceWait",
        blockingReasons: ["candidateIdentityPending"],
        disposition: "externalEvidenceWait",
        reason,
        fieldRefs: externalFields.map((name) => `claim.${name}`),
        artifactRefs: refs
    };
    const frontier = task.searchFrontier;
    const frontierEvidence = (transition.sourceSearch?.scopedFrontiers || [])
        .find((item) => item.id === FRONTIER_POLICY) || {};
    const decision = {
        id: `r2-structural-scope-deferral:${task.candidateId}`,
        kind: "genshinEvidenceDeferral",
        policyId: work.POLICY,
        candidateId: task.candidateId,
        targetGameVersion: TARGET_GAME_VERSION,
        queueTaskDigest: work.taskDigest(task),
        assessment: {
            actorId: "luna_worker",
            assessedAt: generatedAt,
            reason,
            boundedScope: {
                candidateId: task.candidateId,
                taskId: task.task.taskId,
                remainingSearches: remaining,
                notExecutableReasons: [
                    "candidateIdentityPending",
                    "strictIndependentTargetFieldEvidenceMissing",
                    "externalEvidenceWaitOnly"
                ],
                artifactRefs: refs,
                deferredLaneDispositions: [lane]
            }
        },
        fieldFindings: findings,
        search: {
            scope: frontier.searchScope,
            lastSearchedAt: frontier.lastSearchedAt,
            providersExamined: clone(frontier.providersExamined),
            negativeResult: `The finite frontier reports: ${frontierEvidence.negativeResult || "No candidate-specific target mechanic field was materialized."} Candidate identity/scope and target mechanic claims remain unresolved; local display/spec records are not substituted for target evidence.`,
            unsearchedScope: remaining,
            reopenTrigger: frontier.reopenTrigger,
            nextTask: `Resolve candidate identity/scope and reacquire exact ${TARGET_GAME_VERSION} independent mechanic evidence for ${task.candidateId} when the recorded trigger is satisfied.`,
            artifactRefs: refs
        },
        safety: {
            impact: `Applying an unverified ${TARGET_GAME_VERSION} transition overlay could alter the existing ${task.dataset}/${task.layer} behavior for ${task.candidateId}.`,
            action: `Keep the current local projection and any existing Runtime/canonical route unchanged; leave ${task.candidateId} inactive, mapping unresolved, and issue no certificate or promotion.`,
            runtimeStatus: "existingConsumerUnchanged;candidateInactive;mappingUnresolved;verificationAndPromotionDenied",
            artifactRefs: safety
        }
    };
    const fieldMap = Object.fromEntries(findings.map((item) => [item.field, item.currentValue]));
    const candidateEvidence = {
        candidateId: task.candidateId,
        taskId: task.task.taskId,
        dataset: task.dataset,
        layer: task.layer,
        entityId: mapping?.entityId || task.officialVersionImpact?.entityId || spec.entity?.id || null,
        mapping: {
            status: "unresolved",
            resolved: false,
            mappingStatus: "structuralScopeCandidate",
            claimScope: "candidateIdentityPending",
            partialDiscovery: clone(mapping),
            officialChange: clone(change),
            taskMappingStatus: task.mappingStatus,
            taskTransitionLane: task.transitionLane,
            candidateIdentityEvidence: "entity-level identity is present; candidate identity/scope is not bound"
        },
        current: {
            specDigest: digest(spec),
            specVerificationStatus: spec.verification?.status || null,
            sourceAgreement: spec.verification?.sourceAgreement || null,
            unknownFields: sortedUnique(spec.unknownFields || []),
            sourceRecords: sourceDetails(sources),
            sourceGameVersions: sortedUnique(sources.map(({ record }) => record.gameVersion)
                .filter((value) => value !== null && value !== undefined)),
            sourceProviderIndependence: sortedUnique(sources.map(({ record }) => record.providerIndependence)),
            claimValues: fieldMap,
            claimFields: claimNames,
            externalClaimFields: externalFields,
            internalMetadataClaimFields: claimNames.filter((name) => INTERNAL_CLAIMS.has(name)),
            sourceFilePaths: DATASET_FILES[task.dataset]
        },
        historical: {
            status: "unavailable",
            historicalValuePolicy: "No candidate-specific target-version replacement value is persisted; historicalValue remains null rather than inferred."
        },
        frontier: {
            candidateId: task.candidateId,
            taskId: task.task.taskId,
            policyId: frontier.policyId,
            status: frontier.status,
            exhausted: frontier.exhausted === true,
            scopeMatched: frontier.scopeMatched === true,
            scopeUnit: frontier.scopeUnit,
            searchScope: frontier.searchScope,
            lastSearchedAt: frontier.lastSearchedAt,
            providersExamined: clone(frontier.providersExamined),
            blockingReasons: sortedUnique(frontier.blockingReasons || []),
            reopenTrigger: frontier.reopenTrigger,
            claimFields: claimNames,
            externalClaimFields: externalFields,
            digest: frontierDigest(task, claimNames)
        },
        claimPacket: packet ? {
            status: "materialized",
            providerCaptureStatus: packet.providerCaptureStatus,
            claimSchemaStatus: packet.claimSchemaStatus,
            claimPacketCount: packet.claimPackets?.length || 0,
            claims: clone(packet.claimPackets || []),
            gateEligibility: clone(packet.gateEligibility || null),
            digest: digest(packet)
        } : {
            status: "notMaterialized",
            providerCaptureStatus: task.transitionProviderCaptureStatus,
            claimSchemaStatus: task.transitionClaimSchemaStatus,
            claimPacketCount: 0,
            claims: [],
            gateEligibility: { canIssueCertificate: false, canPromoteCanonical: false },
            digest: digest({ candidateId: task.candidateId, claimPackets: [] })
        },
        safety: {
            legacyOrCurrentConsumerUnchanged: true,
            consumerStatus: "notApplicable",
            candidateActive: false,
            mappingResolved: false,
            certificateIssued: false,
            canonicalPromoted: false,
            runtimeChanged: false
        }
    };
    return { decision, candidateEvidence, findings, externalFields, claimNames };
}

function exclusionFor(task, mapping) {
    const isReaction = task.candidateId === REACTION_CANDIDATE_ID;
    return {
        candidateId: task.candidateId,
        eligibleForMappingEvidenceWait: false,
        reason: isReaction
            ? "reactionConsumerTransitionRemainsConcrete"
            : "mappedCandidateHandledByExisting47Audit",
        mapping: clone(mapping || null),
        queueFacts: {
            taskId: task.task?.taskId || null,
            dataset: task.dataset || null,
            layer: task.layer || null,
            transitionLane: task.transitionLane || null,
            mappingStatus: task.mappingStatus || null,
            claimScope: task.officialVersionImpact?.claimScope || mapping?.claimScope || null,
            consumerStatus: task.consumerStatus || null,
            deferredLanes: clone(task.deferredLanes || []),
            primaryBlockReason: task.primaryBlockReason || null,
            blockReasons: clone(task.blockReasons || []),
            nextTask: task.task?.taskId || null
        }
    };
}

function buildAudit({ queue, generatedAt = GENERATED_AT } = {}) {
    const loadedQueue = loadQueue(queue);
    const transition = loadTransitionFiles();
    const transitionRefs = loadTransitionRefs();
    const datasets = loadDatasets();
    const scope = selectScope(loadedQueue.value, transition);
    const frontier = transition.sourceSearch?.scopedFrontiers?.find((item) => item.id === FRONTIER_POLICY);
    if (!frontier || frontier.status !== "searchExhausted") {
        throw new Error("transitionFrontierMissingOrOpen");
    }
    if (frontier.appliesTo?.candidateCount !== EXPECTED_FRONTIER_CANDIDATE_COUNT
        || frontier.appliesTo?.partialDiscoveryFieldDigest !== transition.partialDiscovery.fieldDigest) {
        throw new Error("transitionFrontierBindingMismatch");
    }
    const changes = officialChangeById(transition.officialChangeIndex);
    const built = scope.selectedTasks.map((task) => {
        const mapping = scope.mapById.get(task.candidateId);
        const change = changes.get(task.candidateId) || changes.get(mapping?.officialChangeId);
        return decisionFor(task, mapping, change, transition, transitionRefs, datasets, generatedAt);
    });
    const decisions = built.map((item) => item.decision);
    const candidateEvidence = built.map((item) => item.candidateEvidence);
    const exclusions = scope.excludedTasks.map((task) => exclusionFor(task, scope.mapById.get(task.candidateId)));
    const selectedRows = scope.selectedTasks.map((task) => selectionRow(task, scope.mapById.get(task.candidateId)));
    const selectedCandidateIds = selectedRows.map((row) => row.candidateId)
        .sort((left, right) => left.localeCompare(right));
    const selectedTaskDigests = scope.selectedTasks.map(work.taskDigest).sort();
    const decisionValidation = decisions.map((decision, index) => work.validateDeferral(
        decision,
        scope.selectedTasks[index],
        { targetGameVersion: TARGET_GAME_VERSION }
    ));
    const queueClaimCount = decisions.reduce((sum, decision, index) => sum
        + (scope.selectedTasks[index].certificate?.candidateClaimCount || 0), 0);
    const fieldFindingCount = built.reduce((sum, item) => sum + item.findings.length, 0);
    const externalFieldCount = built.reduce((sum, item) => sum + item.externalFields.length, 0);
    const internalFieldCount = fieldFindingCount - externalFieldCount;
    const sourceSchemaMissingCount = scope.selectedTasks
        .filter((task) => task.transitionClaimSchemaStatus === "missing").length;
    const claimPacketCount = built.reduce((sum, item) =>
        sum + (item.candidateEvidence.claimPacket.claimPacketCount || 0), 0);
    const rawTransitionRefs = Object.fromEntries(Object.entries(transitionRefs)
        .map(([name, ref]) => [name, refWithoutBytes(ref)]));
    const sourceFileRefs = Object.fromEntries(Object.entries(DATASET_FILES).map(([dataset, files]) => [dataset, {
        specs: refWithoutBytes(fileRef(files.specs)),
        sources: refWithoutBytes(fileRef(files.sources))
    }]));
    const mappingStatusCounts = Object.fromEntries([...new Set(scope.mappings.map((item) => item.mappingStatus))]
        .sort().map((status) => [status, scope.mappings.filter((item) => item.mappingStatus === status).length]));
    const result = {
        schemaVersion: 1,
        kind: "genshinR2StructuralScopeDeferralAudit",
        policyId: work.POLICY,
        transitionId: TRANSITION_ID,
        fromGameVersion: FROM_GAME_VERSION,
        targetGameVersion: TARGET_GAME_VERSION,
        status: "draft",
        draftOnly: true,
        generatedAt,
        generator: {
            name: "genshinR2StructuralScopeDeferralAudit.cjs",
            version: GENERATOR_VERSION
        },
        scope: {
            transitionId: TRANSITION_ID,
            frontierPolicyId: FRONTIER_POLICY,
            frontierStatus: frontier.status,
            frontierCandidateCount: EXPECTED_FRONTIER_CANDIDATE_COUNT,
            selectedCandidateCount: selectedCandidateIds.length,
            excludedCandidateCount: exclusions.length,
            selectedMappingStatuses: ["structuralScopeCandidate"],
            candidateIdDigest: digest(selectedCandidateIds),
            selectedTaskDigestDigest: digest(selectedTaskDigests),
            selectionDigest: digest(selectedRows),
            candidateIds: selectedCandidateIds,
            excludedCandidateIds: scope.excludedCandidateIds,
            excludedCandidateIdDigest: digest(scope.excludedCandidateIds),
            selectionRows: selectedRows
        },
        queueObservation: {
            path: loadedQueue.path,
            bytes: loadedQueue.bytes,
            rawSha256: loadedQueue.rawSha256,
            frontierCandidateCount: scope.mappings.length,
            selectedCandidateCount: scope.selectedTasks.length,
            excludedCandidateCount: scope.excludedTasks.length,
            note: "Queue hash and task digests bind this draft to the authoritative queue; queue progress is not an artifactRef, so progress-only rewrites do not stale candidate evidence."
        },
        candidateCount: decisions.length,
        decisions,
        exclusions,
        evidence: {
            frontier: {
                id: frontier.id,
                status: frontier.status,
                appliesTo: clone(frontier.appliesTo),
                searchScope: frontier.searchScope,
                lastSearchedAt: frontier.lastSearchedAt,
                providersExamined: clone(frontier.providersExamined),
                negativeResult: frontier.negativeResult,
                reopenTrigger: frontier.reopenTrigger,
                digest: digest(frontier)
            },
            transitionArtifacts: rawTransitionRefs,
            candidateSourceFiles: sourceFileRefs,
            mappingStatusCounts,
            unresolvedMappingCandidateCount: candidateEvidence.filter((item) => item.mapping.resolved === false).length,
            sourceSchemaMissingCandidateCount: sourceSchemaMissingCount,
            claimPacketCount,
            queueClaimCount,
            fieldFindingCount,
            externalMechanicFieldCount: externalFieldCount,
            internalMetadataFieldCount: internalFieldCount,
            targetMechanicEvidenceCount: 0,
            candidateClaimsWithStrictEvidenceCount: 0,
            candidateClaims: candidateEvidence
        },
        gate: {
            status: "draftMappingEvidenceDeferredOnly",
            mappingResolved: 0,
            strictEligible: 0,
            canonicalPromotionEligible: 0,
            verificationGranted: false,
            promotionGranted: false,
            runtimeChanged: false,
            runtimeActivated: false,
            certificateIssued: false,
            humanDecisionRequired: false,
            consumerStatus: "notApplicable",
            reason: "This artifact records candidate-scoped mapping/evidence waits only. It does not resolve mappings, verify current values, change Runtime/canonical data, issue a certificate, or request a human semantic decision."
        },
        validation: {
            valid: decisionValidation.every((item) => item.valid),
            invalidDecisionCount: decisionValidation.filter((item) => !item.valid).length,
            decisionResults: decisionValidation
        }
    };
    return result;
}

function compareWithoutValidation(left, right) {
    const normalize = (value) => {
        const cloned = clone(value);
        if (cloned && typeof cloned === "object") {
            delete cloned.validation;
            if (cloned.queueObservation && typeof cloned.queueObservation === "object") {
                delete cloned.queueObservation.rawSha256;
                delete cloned.queueObservation.bytes;
            }
        }
        return cloned;
    };
    return stableJson(normalize(left)) === stableJson(normalize(right));
}

function validateAudit(audit, { queue, compareCurrent = true } = {}) {
    const reasons = [];
    const add = (reason) => { if (!reasons.includes(reason)) reasons.push(reason); };
    if (!audit || typeof audit !== "object" || Array.isArray(audit)) {
        return { valid: false, reasons: ["artifactMissing"] };
    }
    if (audit.schemaVersion !== 1) add("schemaVersionInvalid");
    if (audit.kind !== "genshinR2StructuralScopeDeferralAudit") add("kindInvalid");
    if (audit.policyId !== work.POLICY || audit.transitionId !== TRANSITION_ID
        || audit.fromGameVersion !== FROM_GAME_VERSION || audit.targetGameVersion !== TARGET_GAME_VERSION) {
        add("transitionBindingInvalid");
    }
    if (audit.status !== "draft" || audit.draftOnly !== true) add("draftGateInvalid");
    if (audit.candidateCount !== EXPECTED_SELECTED_COUNT
        || !Array.isArray(audit.decisions) || audit.decisions.length !== EXPECTED_SELECTED_COUNT) {
        add("selectedCountInvalid");
    }
    if (!Array.isArray(audit.exclusions) || audit.exclusions.length !== EXPECTED_EXCLUDED_COUNT) {
        add("exclusionCountInvalid");
    }
    if (audit.gate?.mappingResolved !== 0 || audit.gate?.strictEligible !== 0
        || audit.gate?.canonicalPromotionEligible !== 0
        || audit.gate?.verificationGranted !== false || audit.gate?.promotionGranted !== false
        || audit.gate?.runtimeChanged !== false || audit.gate?.runtimeActivated !== false
        || audit.gate?.certificateIssued !== false || audit.gate?.humanDecisionRequired !== false
        || audit.gate?.consumerStatus !== "notApplicable") add("gateNotFailClosed");
    const expectedIds = [...SELECTED_CANDIDATE_IDS].sort((left, right) => left.localeCompare(right));
    if (digest(audit.scope?.candidateIds || []) !== digest(expectedIds)) add("selectedIdsInvalid");
    let expected;
    if (compareCurrent) {
        try {
            expected = buildAudit({ queue, generatedAt: audit.generatedAt });
        } catch (error) {
            add(`rebuildFailed:${error.message}`);
        }
        if (expected && !compareWithoutValidation(audit, expected)) add("artifactDoesNotMatchCurrentEvidence");
        if (expected && audit.validation?.valid !== true) add("storedValidationNotTrue");
        if (expected && audit.validation?.invalidDecisionCount !== 0) add("storedValidationCountInvalid");
    }
    let currentQueue;
    if (compareCurrent) {
        try {
            currentQueue = loadQueue(queue);
            const currentTransition = loadTransitionFiles();
            const currentScope = selectScope(currentQueue.value, currentTransition);
            const currentIds = currentScope.selectedTasks.map((task) => task.candidateId)
                .sort((left, right) => left.localeCompare(right));
            if (audit.scope?.selectedTaskDigestDigest !== digest(currentScope.selectedTasks.map(work.taskDigest).sort())) {
                add("selectedTaskProjectionChanged");
            }
            const currentRows = currentScope.selectedTasks.map((task) =>
                selectionRow(task, currentScope.mapById.get(task.candidateId)));
            if (audit.scope?.selectionDigest !== digest(currentRows)) add("selectionScopeChanged");
            if (digest(audit.scope?.candidateIds || []) !== digest(currentIds)) add("selectedIdsChanged");
        } catch (error) {
            add(`currentQueueProjectionFailed:${error.message}`);
        }
    }
    const queueRawDigestChanged = Boolean(currentQueue?.rawSha256
        && audit.queueObservation?.rawSha256
        && currentQueue.rawSha256 !== audit.queueObservation.rawSha256);
    return {
        valid: reasons.length === 0,
        reasons,
        summary: {
            candidateCount: audit.candidateCount,
            exclusionCount: audit.exclusions?.length || 0,
            unresolvedMappingCount: audit.evidence?.unresolvedMappingCandidateCount,
            strictEligible: audit.gate?.strictEligible,
            canonicalPromotionEligible: audit.gate?.canonicalPromotionEligible,
            queueRawDigestChanged
        }
    };
}

function writeArtifacts({ queue, artifactPath = OUTPUT_PATH, generatedAt = GENERATED_AT } = {}) {
    const audit = buildAudit({ queue, generatedAt });
    const file = resolveRepoFile(artifactPath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(stable(audit), null, 2)}\n`, "utf8");
    return audit;
}

if (require.main === module) {
    const queue = process.env.GENSHIN_R2_QUEUE_PATH || QUEUE_PATH;
    const artifactPath = process.env.GENSHIN_R2_STRUCTURAL_SCOPE_DEFERRAL_AUDIT_PATH || OUTPUT_PATH;
    const audit = writeArtifacts({ queue, artifactPath });
    const validation = validateAudit(audit, { queue, compareCurrent: true });
    process.stdout.write(`${JSON.stringify({
        status: audit.status,
        validation,
        summary: {
            candidateCount: audit.candidateCount,
            exclusionCount: audit.exclusions.length,
            fieldFindingCount: audit.evidence.fieldFindingCount,
            externalMechanicFieldCount: audit.evidence.externalMechanicFieldCount,
            unresolvedMappingCandidateCount: audit.evidence.unresolvedMappingCandidateCount,
            gate: audit.gate
        }
    }, null, 2)}\n`);
    if (!validation.valid) process.exitCode = 1;
}

module.exports = {
    TARGET_GAME_VERSION,
    FROM_GAME_VERSION,
    TRANSITION_ID,
    FRONTIER_POLICY,
    GENERATED_AT,
    GENERATOR_VERSION,
    SELECTED_CANDIDATE_IDS,
    REACTION_CANDIDATE_ID,
    buildAudit,
    validateAudit,
    writeArtifacts,
    claimNamesFor,
    claimValue,
    fieldFindings,
    externalClaimNames,
    selectScope
};
