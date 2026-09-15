"use strict";

/**
 * Build the bounded G06 transition evidence-deferral draft for the 47
 * already-mapped 7.0 candidates.  This is a review artifact, not a source
 * certificate: it never edits the queue, work-disposition registry, Runtime,
 * canonical data, or any HSR file.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const work = require("./genshinWorkDisposition.cjs");

const ROOT = path.resolve(__dirname, "..");
const DATA_ROOT = path.join(ROOT, "games", "genshin", "data");
const QUEUE_PATH = path.join(ROOT, "reports", "genshin-evidence-task-queue.json");
const TRANSITION_DIR = path.join(DATA_ROOT, "v2", "version-transitions", "6.7-to-7.0");
const OUTPUT_PATH = path.join(DATA_ROOT, "v2", "reviews", "r2-transition-deferral-audit.json");
const TARGET_GAME_VERSION = "7.0";
const FROM_GAME_VERSION = "6.7";
const GENERATED_AT = "2026-08-29T00:00:00.000Z";
const GENERATOR_VERSION = "genshinR2TransitionDeferralAudit/1";
const FRONTIER_POLICY = work.TRANSITION_FRONTIER_POLICY;
const EXPECTED_FRONTIER_CANDIDATE_COUNT = 55;
const EXPECTED_SELECTED_COUNT = 47;
const EXPECTED_EXCLUSION_COUNT = 8;
const BEHAVIOR_FALLBACK_CLAIMS = Object.freeze([
    "sourceText", "timing", "execution", "lifecycle", "energy", "snapshot", "runtime"
]);
const BEHAVIOR_PILOT_FALLBACK_IDS = work.TRANSITION_CLAIM_SCHEMA_MISSING_FALLBACK_CANDIDATES;
const EXTERNAL_CLAIM_NAMES = new Set(work.EXTERNAL_MECHANIC_CLAIMS);
const INTERNAL_CLAIM_NAMES = new Set(work.INTERNAL_METADATA_CLAIMS);
const ALLOWED_MAPPING_STATUSES = new Set([
    "conservativeEntityInvalidation", "exactCandidateMapped"
]);

const DATASET_FILES = Object.freeze({
    behaviorBatch2: {
        specs: "games/genshin/data/v2/characters/behavior-batch-2/spec-candidates.json",
        sources: "games/genshin/data/v2/characters/behavior-batch-2/source-records.json"
    },
    behaviorBatch3: {
        specs: "games/genshin/data/v2/characters/behavior-batch-3/spec-candidates.json",
        sources: "games/genshin/data/v2/characters/behavior-batch-3/source-records.json"
    },
    behaviorBatch6: {
        specs: "games/genshin/data/v2/characters/behavior-batch-6/spec-candidates.json",
        sources: "games/genshin/data/v2/characters/behavior-batch-6/source-records.json"
    },
    behaviorPilot: {
        specs: "games/genshin/data/v2/characters/behavior-pilot.json",
        sources: "games/genshin/data/v2/characters/behavior-pilot.json"
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
const sortedUnique = (values) => [...new Set((values || []).filter((value) => value !== null && value !== undefined).map(String))]
    .sort((left, right) => left.localeCompare(right));
const relative = (file) => path.relative(ROOT, file).replaceAll("\\", "/");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function resolveRepoFile(file) {
    const resolved = path.isAbsolute(String(file)) ? path.resolve(String(file)) : path.resolve(ROOT, String(file));
    if (!resolved.startsWith(`${ROOT}${path.sep}`)) throw new Error(`artifactOutsideRepository:${file}`);
    return resolved;
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
    return {
        value: queueInput,
        path: relative(QUEUE_PATH),
        bytes: null,
        rawSha256: null
    };
}

function loadDatasets() {
    const result = {};
    for (const [dataset, files] of Object.entries(DATASET_FILES)) {
        const specs = readJson(resolveRepoFile(files.specs));
        const sources = readJson(resolveRepoFile(files.sources));
        result[dataset] = {
            specs: specs.specs || specs,
            sources: sources.sourceRecords || sources
        };
    }
    return result;
}

function loadTransitionFiles() {
    return Object.fromEntries(Object.entries(TRANSITION_FILES).map(([name, file]) => [name, readJson(resolveRepoFile(file))]));
}

function loadTransitionRefs() {
    return Object.fromEntries(Object.entries(TRANSITION_FILES).map(([name, file]) => [name, fileRef(file)]));
}

function mappingById(partialDiscovery) {
    return new Map((partialDiscovery?.claim?.candidateMappings || []).map((item) => [String(item.candidateId), item]));
}

function officialChangeById(officialChangeIndex) {
    const entries = [];
    for (const change of officialChangeIndex?.claim?.changes || []) {
        if (text(change?.changeId)) entries.push([String(change.changeId), change]);
        for (const candidateId of change.candidateIds || []) entries.push([String(candidateId), change]);
    }
    return new Map(entries);
}

function candidateTaskMap(queue) {
    return new Map((queue?.tasks || []).map((task) => [String(task.candidateId), task]));
}

function selectScope(queue, transition) {
    const mappings = [...mappingById(transition.partialDiscovery).values()];
    if (mappings.length !== EXPECTED_FRONTIER_CANDIDATE_COUNT) {
        throw new Error(`frontierCandidateMappingCount:${mappings.length}`);
    }
    if (new Set(mappings.map((item) => String(item.candidateId))).size !== mappings.length) {
        throw new Error("duplicateTransitionCandidateMapping");
    }
    const mapById = mappingById(transition.partialDiscovery);
    const taskById = candidateTaskMap(queue);
    const selectedMappings = mappings.filter((item) => ALLOWED_MAPPING_STATUSES.has(item.mappingStatus));
    const excludedMappings = mappings.filter((item) => !ALLOWED_MAPPING_STATUSES.has(item.mappingStatus));
    const taskForMapping = (mapping) => {
        const task = taskById.get(String(mapping.candidateId));
        if (!task) throw new Error(`queueTaskMissing:${mapping.candidateId}`);
        if (String(task.candidateId) !== String(mapping.candidateId)
            || String(task.dataset || "") !== String(mapping.dataset || "")
            || String(task.layer || "") !== String(mapping.layer || "")) {
            throw new Error(`transitionMappingTaskBindingMismatch:${mapping.candidateId}`);
        }
        return task;
    };
    const selectedTasks = selectedMappings.map(taskForMapping);
    const excludedTasks = excludedMappings.map(taskForMapping);
    const reactionId = "w_12516_reaction_bonus_2";
    const reactionMapping = mapById.get(reactionId);
    if (!reactionMapping || ALLOWED_MAPPING_STATUSES.has(reactionMapping.mappingStatus)) {
        throw new Error("reactionCandidateMustRemainExcluded");
    }
    if (selectedTasks.length !== EXPECTED_SELECTED_COUNT || excludedTasks.length !== EXPECTED_EXCLUSION_COUNT) {
        throw new Error(`transitionScopeCount:${selectedTasks.length}:${excludedTasks.length}`);
    }
    return {
        mappings,
        mapById,
        selectedMappings,
        excludedMappings,
        selectedTasks: selectedTasks.sort((left, right) => String(left.candidateId).localeCompare(String(right.candidateId))),
        excludedTasks: excludedTasks.sort((left, right) => String(left.candidateId).localeCompare(String(right.candidateId)))
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
    const packet = (transition.claimReacquisition?.claim?.packets || []).find((item) => item.candidateId === task.candidateId);
    const packetClaims = packet?.claimPackets || [];
    const names = sortedUnique([
        ...queueClaims.map((claim) => claim?.field),
        ...packetClaims.map((claim) => claim?.claimName)
    ]);
    if (names.length) return names;
    const specClaims = Object.keys(spec?.verification?.claims || {});
    if (specClaims.length) return sortedUnique(specClaims);
    if (task.dataset === "behaviorPilot" && BEHAVIOR_PILOT_FALLBACK_IDS.has(String(task.candidateId))) {
        return [...BEHAVIOR_FALLBACK_CLAIMS].sort((left, right) => left.localeCompare(right));
    }
    if (task.dataset === "behaviorPilot") throw new Error(`unexpectedBehaviorPilotClaimSchemaMissing:${task.candidateId}`);
    throw new Error(`candidateClaimSchemaMissing:${task.candidateId}`);
}

function pathValue(value, pathName) {
    return String(pathName).split(".").reduce((current, key) => current && typeof current === "object" ? current[key] : undefined, value);
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
    if (["execution", "lifecycle", "energy", "runtime"].includes(claimName)) return clone(spec?.[claimName] ?? null);
    if (claimName === "snapshot") return clone(spec?.snapshot ?? null);
    if (claimName === "runtimeEligibility") return clone(spec?.runtime ?? null);
    if (["effectKind", "targets", "activation", "value"].includes(claimName)) {
        return clone(pathValue(spec?.effect || {}, claimName) ?? null);
    }
    return clone(pathValue(spec, claimName) ?? null);
}

function valueIsUnknown(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value === "unknown" || value.length === 0;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "object") {
        const values = Object.values(value);
        return values.length === 0 || values.every((item) => valueIsUnknown(item));
    }
    return false;
}

function currentStatus(claimName, value, spec) {
    if (INTERNAL_CLAIM_NAMES.has(claimName)) return "internalImplementationMetadataBlocked";
    if (valueIsUnknown(value) || (spec?.unknownFields || []).map(String).includes(claimName)) return "unknownLocalProjection";
    return "localProjectionUnverified";
}

function missingEvidence(candidateId, claimName, status) {
    if (INTERNAL_CLAIM_NAMES.has(claimName)) {
        return `The ${claimName} value is retained as explicit local implementation metadata for ${candidateId}; it is not external gameplay evidence and is excluded from the external evidence wait. Runtime/certificate/promotion remain blocked.`;
    }
    return `Candidate ${candidateId} retains the current local value/status (${status}) for comparison only. No provider-owned immutable independent ${TARGET_GAME_VERSION} mechanic field bound to claim.${claimName} is materialized; no historical value is inferred.`;
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
        recordDigest: digest(record)
    }));
}

function candidateSourceFileRefs(task) {
    const files = DATASET_FILES[task.dataset];
    if (!files) throw new Error(`datasetFileMappingMissing:${task.dataset}`);
    return [fileRef(files.specs), fileRef(files.sources)];
}

function claimPacketFor(task, transition) {
    const packet = (transition.claimReacquisition?.claim?.packets || [])
        .find((item) => item.candidateId === task.candidateId) || null;
    return packet && Array.isArray(packet.claimPackets) && packet.claimPackets.length > 0
        ? packet : null;
}

function candidateRefs(task, transitionRefs) {
    const sourceRefs = candidateSourceFileRefs(task);
    const transition = [
        transitionRefs.sourceSearch,
        transitionRefs.partialDiscovery,
        transitionRefs.claimReacquisition,
        transitionRefs.officialChangeIndex,
        transitionRefs.targetDatasetEvidence,
        transitionRefs.affectedEntitySnapshot,
        transitionRefs.sourceCatalog,
        transitionRefs.providerPolicy
    ];
    return dedupeRefs([...sourceRefs, ...transition]);
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

function fieldFindings(task, spec, sourceRecord, claimNames) {
    return claimNames.map((claimName) => {
        const value = claimValue(spec, sourceRecord, claimName);
        const knownStatus = currentStatus(claimName, value, spec);
        return {
            field: `claim.${claimName}`,
            knownStatus,
            currentValue: value,
            historicalValue: null,
            missingEvidence: missingEvidence(task.candidateId, claimName, knownStatus)
        };
    });
}

function externalClaimNames(claimNames) {
    return claimNames.filter((claimName) => EXTERNAL_CLAIM_NAMES.has(claimName));
}

function boundedRemaining(task, claimNames) {
    const fields = externalClaimNames(claimNames);
    if (!fields.length) throw new Error(`externalClaimScopeEmpty:${task.candidateId}`);
    return [`Obtain exact ${TARGET_GAME_VERSION} provider-owned independent mechanic evidence for ${task.candidateId}, covering claims [${fields.join(", ")}], with immutable raw/field digests and a strict version binding.`];
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
        entityId: String(mapping?.entityId || task.officialVersionImpact?.entityId
            || task.identityConsistency?.entityId || "")
    };
}

function decisionFor(task, mapping, change, transition, transitionRefs, datasets, generatedAt) {
    if (!work.isAllowedExternalEvidenceWait(task)) throw new Error(`externalWaitTaskPredicateFailed:${task.candidateId}`);
    if (!change || !text(change.changeId) || String(change.changeId) !== String(mapping?.officialChangeId)) {
        throw new Error(`officialChangeBindingMissing:${task.candidateId}`);
    }
    const { data, spec } = specFor(task, datasets);
    const sources = sourceRecordsFor(spec, data, task.candidateId);
    const primarySource = sources[0]?.record;
    const claimNames = claimNamesFor(task, spec, transition);
    const fields = fieldFindings(task, spec, primarySource, claimNames);
    const externalFields = externalClaimNames(claimNames);
    const remaining = boundedRemaining(task, claimNames);
    const refs = candidateRefs(task, transitionRefs);
    const safety = safetyRefs(task, transitionRefs);
    const packet = claimPacketFor(task, transition);
    const reason = `Candidate-scoped external mechanic evidence is not materialized for ${task.candidateId}; this draft closes only the bounded evidence wait and keeps all local values unverified.`;
    const lane = {
        kind: "semanticDecision",
        blockingReasons: ["semanticDecisionRequired"],
        disposition: "externalEvidenceWait",
        reason,
        fieldRefs: externalFields.map((name) => `claim.${name}`),
        artifactRefs: refs
    };
    const frontier = task.searchFrontier;
    const frontierEvidence = (transition.sourceSearch?.scopedFrontiers || [])
        .find((item) => item.id === FRONTIER_POLICY) || {};
    const decision = {
        id: `r2-transition-deferral:${task.candidateId}`,
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
                    "strictIndependentTargetFieldEvidenceMissing",
                    "externalMechanicEvidenceWaitOnly"
                ],
                artifactRefs: refs,
                deferredLaneDispositions: [lane]
            }
        },
        fieldFindings: fields,
        search: {
            scope: frontier.searchScope,
            lastSearchedAt: frontier.lastSearchedAt,
            providersExamined: clone(frontier.providersExamined),
            negativeResult: `The finite frontier reports: ${frontierEvidence.negativeResult || "No candidate-specific target mechanic field was materialized."} Candidate-specific target mechanic claims remain unavailable; local display/spec records are not substituted for target evidence.`,
            unsearchedScope: remaining,
            reopenTrigger: frontier.reopenTrigger,
            nextTask: `Reopen and reacquire exact ${TARGET_GAME_VERSION} independent mechanic evidence for ${task.candidateId} when the recorded trigger is satisfied.`,
            artifactRefs: refs
        },
        safety: {
            impact: `Applying an unverified ${TARGET_GAME_VERSION} transition overlay could alter the existing ${task.dataset}/${task.layer} behavior for ${task.candidateId}.`,
            action: `Keep the current legacy/local projection and any existing Runtime/canonical route unchanged; leave ${task.candidateId} inactive and do not issue a certificate or promotion.`,
            runtimeStatus: "existingConsumerUnchanged;candidateInactive;verificationAndPromotionDenied",
            artifactRefs: safety
        }
    };
    const fieldMap = Object.fromEntries(fields.map((item) => [item.field, item.currentValue]));
    const mappingRecord = {
        partialDiscovery: clone(mapping),
        officialChange: clone(change),
        taskTransitionLane: task.transitionLane,
        taskMappingStatus: task.mappingStatus,
        claimScope: task.officialVersionImpact?.claimScope || mapping.claimScope,
        providerCaptureStatus: task.transitionProviderCaptureStatus,
        claimSchemaStatus: task.transitionClaimSchemaStatus,
        claimPacketStatus: packet ? "materialized" : "notMaterialized",
        claimPacketDigest: digest(packet || { candidateId: task.candidateId, claimPackets: [] }),
        claimPacketCount: packet?.claimPackets?.length || 0
    };
    const candidateEvidence = {
        candidateId: task.candidateId,
        taskId: task.task.taskId,
        dataset: task.dataset,
        layer: task.layer,
        entityId: task.officialVersionImpact?.entityId || spec.entity?.id || null,
        mapping: mappingRecord,
        current: {
            specDigest: digest(spec),
            specVerificationStatus: spec.verification?.status || null,
            sourceAgreement: spec.verification?.sourceAgreement || null,
            unknownFields: sortedUnique(spec.unknownFields || []),
            sourceRecords: sourceDetails(sources),
            sourceGameVersions: sortedUnique(sources.map(({ record }) => record.gameVersion).filter((value) => value !== null && value !== undefined)),
            sourceProviderIndependence: sortedUnique(sources.map(({ record }) => record.providerIndependence)),
            claimValues: fieldMap,
            claimFields: claimNames,
            externalClaimFields: externalFields,
            internalMetadataClaimFields: claimNames.filter((name) => INTERNAL_CLAIM_NAMES.has(name)),
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
            candidateActive: false,
            certificateIssued: false,
            canonicalPromoted: false
        }
    };
    return { decision, candidateEvidence, fields, claimNames, externalFields };
}

function exclusionFor(task, mapping, change) {
    const isReaction = task.candidateId === "w_12516_reaction_bonus_2";
    const reasons = isReaction
        ? ["reactionConsumerTransitionRemainsConcrete", "targetsAndFormulaReacquire", "notExternalEvidenceOnly"]
        : ["candidateIdentityOrScopePending", "mappingMustBeResolvedBeforeExternalEvidenceDeferral", "notExternalEvidenceOnly"];
    return {
        candidateId: task.candidateId,
        eligibleForExternalEvidenceWait: false,
        reasons,
        mapping: clone(mapping),
        officialChange: clone(change || null),
        queueFacts: {
            taskId: task.task?.taskId || null,
            dataset: task.dataset || null,
            layer: task.layer || null,
            transitionLane: task.transitionLane || null,
            mappingStatus: task.mappingStatus || null,
            consumerStatus: task.consumerStatus || null,
            transitionClaimSchemaStatus: task.transitionClaimSchemaStatus || null,
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
    const frontier = transition.sourceSearch.scopedFrontiers?.find((item) => item.id === FRONTIER_POLICY);
    if (!frontier || frontier.status !== "searchExhausted") throw new Error("transitionFrontierMissingOrOpen");
    if (frontier.appliesTo?.candidateCount !== EXPECTED_FRONTIER_CANDIDATE_COUNT
        || frontier.appliesTo?.partialDiscoveryFieldDigest !== transition.partialDiscovery.fieldDigest) {
        throw new Error("transitionFrontierBindingMismatch");
    }
    const changes = officialChangeById(transition.officialChangeIndex);
    const built = scope.selectedTasks.map((task) => {
        const mapping = scope.mapById.get(task.candidateId);
        return decisionFor(
            task,
            mapping,
            changes.get(task.candidateId) || changes.get(mapping?.officialChangeId),
            transition,
            transitionRefs,
            datasets,
            generatedAt
        );
    });
    const decisions = built.map((item) => item.decision);
    const candidateEvidence = built.map((item) => item.candidateEvidence);
    const exclusions = scope.excludedTasks.map((task) => {
        const mapping = scope.mapById.get(task.candidateId);
        return exclusionFor(task, mapping,
            changes.get(task.candidateId) || changes.get(mapping?.officialChangeId));
    });
    const selectedRows = scope.selectedTasks.map((task) => selectionRow(task, scope.mapById.get(task.candidateId)));
    const selectedCandidateIds = selectedRows.map((row) => row.candidateId).sort((left, right) => left.localeCompare(right));
    const selectedTaskDigests = scope.selectedTasks.map(work.taskDigest).sort();
    const decisionValidation = decisions.map((decision, index) => work.validateDeferral(
        decision,
        scope.selectedTasks[index],
        { targetGameVersion: TARGET_GAME_VERSION }
    ));
    const queueClaimCount = decisions.reduce((sum, decision, index) => sum
        + (scope.selectedTasks[index].certificate?.candidateClaimCount || 0), 0);
    const fieldFindingCount = built.reduce((sum, item) => sum + item.fields.length, 0);
    const externalFieldCount = built.reduce((sum, item) => sum + item.externalFields.length, 0);
    const internalFieldCount = fieldFindingCount - externalFieldCount;
    const mappingStatusCounts = Object.fromEntries([...new Set(scope.mappings.map((item) => item.mappingStatus))]
        .sort()
        .map((status) => [status, scope.mappings.filter((item) => item.mappingStatus === status).length]));
    const sourceSchemaMissingCount = scope.selectedTasks.filter((task) => task.transitionClaimSchemaStatus === "missing").length;
    const rawTransitionRefs = Object.fromEntries(Object.entries(transitionRefs).map(([name, ref]) => [name, refWithoutBytes(ref)]));
    const sourceFileRefs = Object.fromEntries(Object.entries(DATASET_FILES).map(([dataset, files]) => [dataset, {
        specs: refWithoutBytes(fileRef(files.specs)),
        sources: refWithoutBytes(fileRef(files.sources))
    }]));
    const result = {
        schemaVersion: 1,
        kind: "genshinR2TransitionDeferralAudit",
        policyId: work.POLICY,
        transitionId: "genshin:6.7->7.0",
        fromGameVersion: FROM_GAME_VERSION,
        targetGameVersion: TARGET_GAME_VERSION,
        status: "draft",
        draftOnly: true,
        generatedAt,
        generator: {
            name: "genshinR2TransitionDeferralAudit.cjs",
            version: GENERATOR_VERSION
        },
        scope: {
            transitionId: "genshin:6.7->7.0",
            frontierPolicyId: FRONTIER_POLICY,
            frontierStatus: frontier.status,
            frontierCandidateCount: EXPECTED_FRONTIER_CANDIDATE_COUNT,
            selectedCandidateCount: selectedCandidateIds.length,
            excludedCandidateCount: exclusions.length,
            selectedMappingStatuses: [...ALLOWED_MAPPING_STATUSES].sort(),
            candidateIdDigest: digest(selectedCandidateIds),
            selectedTaskDigestDigest: digest(selectedTaskDigests),
            selectionDigest: digest(selectedRows),
            candidateIds: selectedCandidateIds,
            excludedCandidateIds: exclusions.map((item) => item.candidateId).sort((left, right) => left.localeCompare(right)),
            selectionRows: selectedRows
        },
        queueObservation: {
            path: loadedQueue.path,
            bytes: loadedQueue.bytes,
            rawSha256: loadedQueue.rawSha256,
            frontierCandidateCount: scope.mappings.length,
            selectedCandidateCount: scope.selectedTasks.length,
            excludedCandidateCount: scope.excludedTasks.length,
            note: "Queue hash and task digests bind the draft to the authoritative queue; queue progress is not an artifactRef, avoiding a digest cycle."
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
            sourceSchemaMissingCandidateCount: sourceSchemaMissingCount,
            queueClaimCount,
            fieldFindingCount,
            externalMechanicFieldCount: externalFieldCount,
            internalMetadataFieldCount: internalFieldCount,
            targetMechanicEvidenceCount: 0,
            candidateClaimsWithStrictEvidenceCount: 0,
            candidateClaims: candidateEvidence
        },
        gate: {
            status: "draftExternalEvidenceDeferredOnly",
            strictEligible: 0,
            canonicalPromotionEligible: 0,
            verificationGranted: false,
            promotionGranted: false,
            runtimeChanged: false,
            certificateIssued: false,
            reason: "This artifact records bounded external evidence waits only. It does not verify current values, resolve mappings, change Runtime/canonical data, or issue a certificate."
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
            // Queue progress/workProgress is intentionally mutable.  Keep the
            // raw queue hash as diagnostic provenance, but do not make a
            // progress-only rewrite invalidate candidate evidence.
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
    if (!audit || typeof audit !== "object" || Array.isArray(audit)) return { valid: false, reasons: ["artifactMissing"] };
    if (audit.schemaVersion !== 1) add("schemaVersionInvalid");
    if (audit.kind !== "genshinR2TransitionDeferralAudit") add("kindInvalid");
    if (audit.policyId !== work.POLICY || audit.transitionId !== "genshin:6.7->7.0"
        || audit.fromGameVersion !== FROM_GAME_VERSION || audit.targetGameVersion !== TARGET_GAME_VERSION) add("transitionBindingInvalid");
    if (audit.status !== "draft" || audit.draftOnly !== true) add("draftGateInvalid");
    if (audit.candidateCount !== EXPECTED_SELECTED_COUNT || !Array.isArray(audit.decisions)
        || audit.decisions.length !== EXPECTED_SELECTED_COUNT) add("selectedCountInvalid");
    if (!Array.isArray(audit.exclusions) || audit.exclusions.length !== EXPECTED_EXCLUSION_COUNT) add("exclusionCountInvalid");
    if (audit.gate?.strictEligible !== 0 || audit.gate?.canonicalPromotionEligible !== 0
        || audit.gate?.verificationGranted !== false || audit.gate?.promotionGranted !== false
        || audit.gate?.runtimeChanged !== false || audit.gate?.certificateIssued !== false) add("gateNotFailClosed");
    let expected;
    try {
        expected = buildAudit({ queue, generatedAt: audit.generatedAt });
    } catch (error) {
        add(`rebuildFailed:${error.message}`);
    }
    if (expected && !compareWithoutValidation(audit, expected)) add("artifactDoesNotMatchCurrentEvidence");
    if (expected && audit.validation?.valid !== true) add("storedValidationNotTrue");
    if (expected && audit.validation?.invalidDecisionCount !== 0) add("storedValidationCountInvalid");
    let currentScope;
    let currentQueue;
    try {
        currentQueue = loadQueue(queue);
        currentScope = selectScope(currentQueue.value, loadTransitionFiles());
        const currentTaskDigestDigest = digest(currentScope.selectedTasks.map(work.taskDigest).sort());
        const currentRows = currentScope.selectedTasks.map((task) =>
            selectionRow(task, currentScope.mapById.get(task.candidateId)));
        if (audit.scope?.selectedTaskDigestDigest !== currentTaskDigestDigest) {
            add("selectedTaskProjectionChanged");
        }
        if (audit.scope?.selectionDigest !== digest(currentRows)) add("selectionScopeChanged");
    } catch (error) {
        add(`currentQueueProjectionFailed:${error.message}`);
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
    const artifactPath = process.env.GENSHIN_R2_TRANSITION_DEFERRAL_AUDIT_PATH || OUTPUT_PATH;
    const audit = writeArtifacts({ queue, artifactPath });
    const validation = validateAudit(audit, { queue, compareCurrent: true });
    process.stdout.write(`${JSON.stringify({
        status: audit.status,
        validation,
        summary: {
            candidateCount: audit.candidateCount,
            exclusionCount: audit.exclusions.length,
            queueClaimCount: audit.evidence.queueClaimCount,
            fieldFindingCount: audit.evidence.fieldFindingCount,
            externalMechanicFieldCount: audit.evidence.externalMechanicFieldCount,
            sourceSchemaMissingCandidateCount: audit.evidence.sourceSchemaMissingCandidateCount,
            gate: audit.gate
        }
    }, null, 2)}\n`);
    if (!validation.valid) process.exitCode = 1;
}

module.exports = {
    TARGET_GAME_VERSION,
    FROM_GAME_VERSION,
    FRONTIER_POLICY,
    GENERATED_AT,
    GENERATOR_VERSION,
    BEHAVIOR_FALLBACK_CLAIMS,
    buildAudit,
    validateAudit,
    writeArtifacts,
    claimNamesFor,
    claimValue,
    fieldFindings,
    externalClaimNames,
    selectScope
};
