"use strict";

/**
 * Build a draft-only, candidate-scoped evidence-deferral audit for the finite
 * artifact source frontier.  This file never edits the authoritative queue or
 * work-disposition registry and never grants verification or promotion.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
    POLICY,
    taskDigest,
    validateDeferral,
    digest: stableDigest
} = require("./genshinWorkDisposition.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultDataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultQueuePath = path.join(repositoryRoot, "reports", "genshin-evidence-task-queue.json");
const defaultArtifactPath = path.join(
    defaultDataRoot,
    "v2",
    "reviews",
    "r2-artifact-deferral-audit.json"
);

const TARGET_GAME_VERSION = "7.0";
const GENERATED_AT = "2026-08-28T00:00:00.000Z";
const GENERATOR_VERSION = "genshinR2ArtifactDeferralAudit/1";
const EXPECTED_ARTIFACT_TASK_COUNT = 128;
const EXPECTED_SELECTED_COUNT = 116;
const EXPECTED_EXCLUDED_COUNT = 12;
const HISTORICAL_UNAVAILABLE =
    "No version-specific artifact snapshot is persisted for this field; historicalValue is intentionally null.";

const relative = (file) => String(path.relative(repositoryRoot, file)).replaceAll("\\", "/");
const resolveRepositoryFile = (file) => {
    if (path.isAbsolute(String(file))) return path.resolve(String(file));
    return path.resolve(repositoryRoot, String(file));
};
const resolveDataFile = (dataRoot, file) => path.join(
    path.resolve(dataRoot),
    ...String(file).split("/")
);
const sha256Bytes = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const stableValue = (value) => Array.isArray(value)
    ? value.map(stableValue)
    : value && typeof value === "object"
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
        : value;
const stableJson = (value) => JSON.stringify(stableValue(value));
const sortedUnique = (values) => [...new Set((values || []).map(String))].sort((a, b) => a.localeCompare(b));

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function loadQueue(queueInput) {
    if (queueInput === undefined || queueInput === null) {
        const bytes = fs.readFileSync(defaultQueuePath);
        return {
            value: JSON.parse(bytes.toString("utf8")),
            path: relative(defaultQueuePath),
            bytes: bytes.length,
            rawSha256: sha256Bytes(bytes)
        };
    }
    if (typeof queueInput === "string") {
        const file = resolveRepositoryFile(queueInput);
        const bytes = fs.readFileSync(file);
        return {
            value: JSON.parse(bytes.toString("utf8")),
            path: relative(file),
            bytes: bytes.length,
            rawSha256: sha256Bytes(bytes)
        };
    }
    if (queueInput && queueInput.value && Array.isArray(queueInput.value.tasks)) {
        return {
            value: queueInput.value,
            path: queueInput.path || relative(defaultQueuePath),
            bytes: Number.isInteger(queueInput.bytes) ? queueInput.bytes : null,
            rawSha256: /^[a-f0-9]{64}$/u.test(String(queueInput.rawSha256 || ""))
                ? queueInput.rawSha256
                : null
        };
    }
    return {
        value: queueInput,
        path: relative(defaultQueuePath),
        bytes: null,
        rawSha256: null
    };
}

function fileRef(dataRoot, relativePath) {
    const file = String(relativePath).startsWith("games/") || String(relativePath).startsWith("reports/")
        ? resolveRepositoryFile(relativePath)
        : resolveDataFile(dataRoot, relativePath);
    if (!fs.existsSync(file)) throw new Error(`artifactMissing:${relative(file)}`);
    const bytes = fs.readFileSync(file);
    return { path: relative(file), sha256: sha256Bytes(bytes) };
}

function fileEvidence(dataRoot, relativePath) {
    const file = String(relativePath).startsWith("games/") || String(relativePath).startsWith("reports/")
        ? resolveRepositoryFile(relativePath)
        : resolveDataFile(dataRoot, relativePath);
    if (!fs.existsSync(file)) throw new Error(`artifactMissing:${relative(file)}`);
    const bytes = fs.readFileSync(file);
    return { path: relative(file), bytes: bytes.length, sha256: sha256Bytes(bytes) };
}

function artifactTaskIsDeferrable(task) {
    return task?.dataset === "artifacts"
        && task?.task?.kind === "sourceProvider"
        && task?.task?.status === "reopenOnTrigger"
        && Array.isArray(task?.deferredLanes)
        && task.deferredLanes.length === 0
        && task?.searchFrontier?.scopeMatched === true;
}

function artifactTaskReasons(task) {
    const reasons = [];
    if (task?.task?.kind !== "sourceProvider") reasons.push("taskKindNotSourceProvider");
    if (task?.task?.status !== "reopenOnTrigger") reasons.push("taskStatusHasConcreteWork");
    if (!Array.isArray(task?.deferredLanes) || task.deferredLanes.length > 0) {
        reasons.push("deferredLanePresent");
        for (const lane of task?.deferredLanes || []) {
            reasons.push(`deferredLane:${lane?.kind || "unknown"}:${lane?.status || "unknown"}`);
        }
    }
    if (task?.searchFrontier?.scopeMatched !== true) reasons.push("frontierScopeNotMatched");
    if (task?.searchFrontier?.status === "searchRequired") reasons.push("frontierSearchRequired");
    if (task?.task?.autoProcessableNow === true || task?.autoProcessableNow === true) {
        reasons.push("autoProcessableNow");
    }
    if (task?.task?.reason) reasons.push(`taskReason:${task.task.reason}`);
    return sortedUnique(reasons.length ? reasons : ["selectionPredicateMismatch"]);
}

function parseArtifactCandidate(candidateId) {
    const match = String(candidateId || "").match(/^artifact:([^:]+):(twoPiece|fourPiece):(.+)$/u);
    if (!match) throw new Error(`artifactCandidateIdInvalid:${candidateId}`);
    return { setId: match[1], slot: match[2], legacyModifierId: match[3] };
}

function leafValues(value, prefix, output = []) {
    if (Array.isArray(value)) {
        if (value.length === 0) output.push({ field: prefix, value: clone(value) });
        else value.forEach((item, index) => leafValues(item, `${prefix}[${index}]`, output));
        return output;
    }
    if (value && typeof value === "object") {
        const entries = Object.entries(value);
        if (entries.length === 0) output.push({ field: prefix, value: clone(value) });
        else entries.forEach(([key, item]) => leafValues(item, prefix ? `${prefix}.${key}` : key, output));
        return output;
    }
    output.push({ field: prefix, value: clone(value) });
    return output;
}

function claimFields(task) {
    return sortedUnique((task?.certificate?.certificate?.claims || []).map((claim) => claim?.field));
}

function makeEvidenceFiles(dataRoot) {
    const paths = {
        specCandidates: "v2/artifacts/spec-candidates.json",
        sourceRecords: "v2/artifacts/source-records.json",
        verification: "v2/artifacts/verification.json",
        artifactAudit: "v2/artifacts/audit.json",
        artifactManifest: "v2/artifacts/manifest.json",
        gapReview: "v2/artifacts/gap-review.json",
        artifactSets: "artifact-sets.json",
        artifactEffects: "artifact-set-effects.json",
        legacyModifiers: "calc/artifact-set-modifiers.json",
        legacyAudit: "calc/artifact-set-modifiers-audit-v10.json",
        dataManifest: "data-v2-manifest.json",
        sourceCatalog: "v2/source-catalog.json",
        providerPolicy: "v2/provider-independence-policy.json",
        gameVersionEvidence: "v2/game-version-evidence.json",
        transitionSourceSearch: "v2/version-transitions/6.7-to-7.0/source-search.json",
        kqmEvidence: "v2/external/kqm-artifact-field-evidence.json",
        kqmReport: "../../../reports/genshin-kqm-artifact-evidence.json",
        optimizerEvidence: "../../../reports/genshin-optimizer-field-evidence.json",
        gameVersionReport: "../../../reports/genshin-game-version-evidence.json"
    };
    const evidence = Object.fromEntries(Object.entries(paths).map(([name, file]) => [
        name,
        fileEvidence(dataRoot, file)
    ]));
    return { paths, evidence };
}

function candidateRefs(dataRoot, files, setId, hasKqm) {
    const packagePath = `v2/artifacts/packages/${setId}.json`;
    const searchNames = [
        "specCandidates",
        "sourceRecords",
        "verification",
        "artifactAudit",
        "artifactManifest",
        "providerPolicy",
        "gameVersionEvidence",
        "artifactSets",
        "artifactEffects",
        "legacyModifiers",
        "legacyAudit"
    ];
    searchNames.push("optimizerEvidence", "gameVersionReport");
    if (hasKqm) searchNames.push("kqmEvidence", "kqmReport");
    const safetyNames = [
        "dataManifest",
        "artifactManifest",
        "specCandidates",
        "sourceRecords",
        "providerPolicy",
        "gameVersionEvidence",
        "legacyModifiers",
        "legacyAudit"
    ];
    const addPackage = (names) => [...names, "package"].map((name) => name === "package"
        ? fileRef(dataRoot, packagePath)
        : fileRef(dataRoot, files.paths[name]));
    const dedupe = (refs) => [...new Map(refs.map((ref) => [ref.path, ref])).values()];
    return {
        search: dedupe(addPackage(searchNames)),
        safety: dedupe(addPackage(safetyNames))
    };
}

function explicitCurrentValue(effect, field) {
    return Object.prototype.hasOwnProperty.call(effect || {}, field)
        ? clone(effect[field])
        : null;
}

function isLocalImplementationMetadata(field) {
    return /(?:^|\.)(?:inputPolicy|automaticDetectability)(?:\.|$)/u.test(String(field));
}

function fieldFindingStatus(field, currentPresent) {
    if (isLocalImplementationMetadata(field)) {
        return currentPresent
            ? "localImplementationMetadataHistoricalUnavailable"
            : "localImplementationMetadataMissingHistoricalUnavailable";
    }
    return currentPresent
        ? "legacyProjectionOnlyHistoricalUnavailable"
        : "currentFieldMissingHistoricalUnavailable";
}

function fieldMissingEvidence({ candidateId, currentPresent, hasKqm, field }) {
    if (isLocalImplementationMetadata(field)) {
        const currentEvidence = currentPresent
            ? "The current value is retained exactly as local implementation metadata derived from explicit structured fields."
            : "This local implementation-metadata field is not explicitly present; null is retained rather than inferred.";
        return `${currentEvidence} inputPolicy/automaticDetectability are routing metadata, not external gameplay facts; they do not remove the separate strict source block for gameplay values, conditions, targets, or version binding. ${HISTORICAL_UNAVAILABLE}`;
    }
    const versionEvidence = hasKqm
        ? "An exact KQM candidate comparison exists, but its game-version binding is missing and the intended provider-B record is not materialized."
        : "No exact independent provider-owned 7.0 candidate field bundle with raw/field digest is persisted in the examined frontier.";
    const currentEvidence = currentPresent
        ? "The current value is a local legacy/v2 projection retained for comparison only."
        : "The current candidate has no explicit field value; null is retained rather than inferred.";
    return `${currentEvidence} ${versionEvidence} ${HISTORICAL_UNAVAILABLE}`;
}

function buildFieldFindings(task, spec, hasKqm) {
    const effect = spec?.effect || {};
    const findings = [];
    for (const field of claimFields(task)) {
        const currentPresent = Object.prototype.hasOwnProperty.call(effect, field);
        findings.push({
            field: `claim.${field}`,
            knownStatus: fieldFindingStatus(`claim.${field}`, currentPresent),
            currentValue: explicitCurrentValue(effect, field),
            historicalValue: null,
            missingEvidence: fieldMissingEvidence({
                candidateId: task.candidateId,
                currentPresent,
                hasKqm,
                field: `claim.${field}`
            })
        });
    }
    for (const item of leafValues(effect, "effect")) {
        findings.push({
            field: item.field,
            knownStatus: fieldFindingStatus(item.field, true),
            currentValue: item.value,
            historicalValue: null,
            missingEvidence: fieldMissingEvidence({
                candidateId: task.candidateId,
                currentPresent: true,
                hasKqm,
                field: item.field
            })
        });
    }
    return findings;
}

function exactKqmRecord(kqmByCandidate, candidateId) {
    const record = kqmByCandidate.get(candidateId);
    if (!record) return {
        exactCandidate: false,
        status: "notMaterialized",
        reason: "No exact KQM field record is present for this candidate; the four-piece frontier remains source/version/lineage blocked."
    };
    return {
        exactCandidate: record.candidateId === candidateId,
        recordId: record.id,
        field: record.field,
        sourceRecordId: record.sourceA?.sourceRecordId || null,
        sourceARevision: record.sourceA?.revision || null,
        sourceAFileSha256: record.sourceA?.fileSha256 || null,
        gameVersionStatus: record.gameVersionStatus || record.sourceA?.gameVersionEvidence?.status || null,
        status: record.status,
        comparison: {
            valueMatch: record.comparison?.valueMatch === true,
            unitMatch: record.comparison?.unitMatch === true,
            targetMatch: record.comparison?.targetMatch === true,
            conditionMatch: record.comparison?.conditionMatch === true,
            pieceCountMatch: record.comparison?.pieceCountMatch === true,
            fieldAgreement: record.comparison?.fieldAgreement === true
        }
    };
}

function negativeResult(task, claimList, hasKqm) {
    const candidateId = task.candidateId;
    const exactSource = hasKqm
        ? "An exact KQM comparison record is present, but its gameVersion is unbound and the intended provider-B artifact is not materialized."
        : "No exact independent provider-owned 7.0 field bundle with raw and field digests is present for this candidate in the persisted four-piece frontier.";
    return `Exact candidate ${candidateId} is bound to the persisted ${task.searchFrontier.scopeUnit} frontier. ${exactSource} The queue certificate remains blocked for exact claim fields [${claimList.join(", ")}]; local legacy values remain comparison-only.`;
}

function buildDecision(task, dataRoot, datasets, files, kqmByCandidate, frontierBindings) {
    const candidate = parseArtifactCandidate(task.candidateId);
    const spec = datasets.specs[task.candidateId];
    if (!spec) throw new Error(`artifactSpecMissing:${task.candidateId}`);
    const sourceIds = Array.isArray(spec.sourceRefs) ? spec.sourceRefs.map(String) : [];
    if (!sourceIds.length) throw new Error(`artifactSourceRefsMissing:${task.candidateId}`);
    const sourceDetails = sourceIds.map((id) => {
        const record = datasets.sourceRecords[id];
        if (!record) throw new Error(`artifactSourceRecordMissing:${task.candidateId}:${id}`);
        return {
            id,
            digest: record.integrity?.digest || null,
            capturedAt: record.capturedAt || null,
            gameVersion: record.gameVersion ?? null,
            locator: clone(record.locator || null)
        };
    });
    const legacyArray = datasets.legacyModifiers[candidate.setId]?.[candidate.slot] || [];
    const legacyIndex = legacyArray.findIndex((record) => record?.id === candidate.legacyModifierId);
    if (legacyIndex < 0) throw new Error(`legacyModifierMissing:${task.candidateId}`);
    const legacyRecord = legacyArray[legacyIndex];
    const verification = datasets.verification[task.candidateId] || {};
    const exactKqm = exactKqmRecord(kqmByCandidate, task.candidateId);
    const hasKqm = exactKqm.exactCandidate === true;
    const refs = candidateRefs(dataRoot, files, candidate.setId, hasKqm);
    const boundedScope = boundedScopeFor(task, hasKqm, refs);
    const claims = claimFields(task);
    const frontier = task.searchFrontier;
    const frontierDigestMaterial = {
        candidateId: task.candidateId,
        taskId: task.task.taskId,
        policyId: frontier.policyId,
        scopeUnit: frontier.scopeUnit,
        searchScope: frontier.searchScope,
        lastSearchedAt: frontier.lastSearchedAt,
        providersExamined: frontier.providersExamined,
        status: frontier.status,
        exhausted: frontier.exhausted === true,
        scopeMatched: frontier.scopeMatched === true,
        reopenTrigger: frontier.reopenTrigger,
        blockingReasons: frontier.blockingReasons || [],
        claimFields: claims
    };
    const fieldFindings = buildFieldFindings(task, spec, hasKqm);
    const decision = {
        id: `r2-artifact-deferral:${task.candidateId}`,
        kind: "genshinEvidenceDeferral",
        policyId: POLICY,
        candidateId: task.candidateId,
        targetGameVersion: TARGET_GAME_VERSION,
        queueTaskDigest: taskDigest(task),
        assessment: {
            actorId: "luna_worker",
            assessedAt: GENERATED_AT,
            reason: `Exact artifact candidate ${task.candidateId} has a closed source frontier but no strict 7.0 field evidence; this is a draft evidence deferral only.`,
            boundedScope: {
                candidateId: task.candidateId,
                taskId: task.task.taskId,
                remainingSearches: boundedScope.remainingSearches,
                notExecutableReasons: boundedScope.notExecutableReasons,
                artifactRefs: boundedScope.artifactRefs
            }
        },
        fieldFindings,
        search: {
            scope: frontier.searchScope,
            lastSearchedAt: frontier.lastSearchedAt,
            providersExamined: clone(frontier.providersExamined),
            negativeResult: negativeResult(task, claims, hasKqm),
            unsearchedScope: boundedScope.remainingSearches,
            reopenTrigger: frontier.reopenTrigger,
            nextTask: `Reopen exact candidate ${task.candidateId} when the recorded provider-owned 7.0 trigger is satisfied.`,
            artifactRefs: refs.search
        },
        safety: {
            impact: `Applying an unverified 7.0 overlay could change the exact legacy modifier ${candidate.legacyModifierId} for artifact set ${candidate.setId}/${candidate.slot}.`,
            action: `Leave the legacy-compatible record at /${candidate.setId}/${candidate.slot}/${legacyIndex} unchanged; keep the v2 candidate inactive and issue no certificate or promotion.`,
            runtimeStatus: "legacyConsumerUnchanged; v2CandidateInactive; verificationAndPromotionDenied",
            artifactRefs: refs.safety
        }
    };
    return {
        decision,
        evidence: {
            candidateId: task.candidateId,
            exactTaskId: task.task.taskId,
            entityId: candidate.setId,
            slot: candidate.slot,
            legacyModifierId: candidate.legacyModifierId,
            exactClaimFields: claims,
            fieldFindingCount: fieldFindings.length,
            effectLeafCount: leafValues(spec.effect || {}, "effect").length,
            effectDigest: stableDigest(spec.effect || {}),
            current: {
                sourceRefs: sourceDetails,
                capturedAt: sourceDetails[0]?.capturedAt || null,
                gameVersion: sourceDetails.some((item) => item.gameVersion !== null)
                    ? sortedUnique(sourceDetails.map((item) => item.gameVersion))
                    : null,
                candidateVerificationStatus: verification.verification?.status || verification.status || null,
                sourceAgreement: verification.verification?.sourceAgreement || verification.sourceAgreement || null
            },
            historical: {
                status: "unavailable",
                reason: HISTORICAL_UNAVAILABLE
            },
            frontier: {
                candidateId: task.candidateId,
                exactCandidateInScope: true,
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
                claimFields: claims,
                digest: stableDigest(frontierDigestMaterial)
            },
            frontierBinding: clone(frontierBindings[candidate.slot]),
            kqm: exactKqm,
            legacy: {
                path: `calc/artifact-set-modifiers.json#/${candidate.setId}/${candidate.slot}/${legacyIndex}`,
                entityId: candidate.setId,
                slot: candidate.slot,
                index: legacyIndex,
                modifierId: legacyRecord.id,
                recordDigest: stableDigest(legacyRecord),
                recordPresent: true,
                manifestAuthority: "legacyCompatible",
                candidateRuntimeStatus: verification.runtime?.status || null,
                canonicalEligible: false,
                consumerAction: "unchangedLegacyConsumer;candidateNotActivated"
            }
        }
    };
}

function loadDatasets(dataRoot) {
    return {
        specs: readJson(resolveDataFile(dataRoot, "v2/artifacts/spec-candidates.json")),
        sourceRecords: readJson(resolveDataFile(dataRoot, "v2/artifacts/source-records.json")),
        verification: readJson(resolveDataFile(dataRoot, "v2/artifacts/verification.json")),
        legacyModifiers: readJson(resolveDataFile(dataRoot, "calc/artifact-set-modifiers.json")),
        legacyManifest: readJson(resolveDataFile(dataRoot, "data-v2-manifest.json")),
        artifactAudit: readJson(resolveDataFile(dataRoot, "v2/artifacts/audit.json")),
        artifactManifest: readJson(resolveDataFile(dataRoot, "v2/artifacts/manifest.json")),
        kqmEvidence: readJson(resolveDataFile(dataRoot, "v2/external/kqm-artifact-field-evidence.json")),
        sourceSearchFrontiers: readJson(resolveDataFile(dataRoot, "v2/source-search-frontiers.json")),
        providerPolicy: readJson(resolveDataFile(dataRoot, "v2/provider-independence-policy.json")),
        gameVersionEvidence: readJson(resolveDataFile(dataRoot, "v2/game-version-evidence.json"))
    };
}

function sortedIds(values) {
    return [...new Set((values || []).map(String))].sort((a, b) => a.localeCompare(b));
}

function buildFrontierBindings(selectedTasks, datasets) {
    const fourPieceTasks = selectedTasks.filter((task) => String(task.candidateId).includes(":fourPiece:"));
    const twoPieceTasks = selectedTasks.filter((task) => String(task.candidateId).includes(":twoPiece:"));
    const fourPieceIds = sortedIds(fourPieceTasks.map((task) => task.candidateId));
    const twoPieceIds = sortedIds(twoPieceTasks.map((task) => task.candidateId));
    const frontier = (datasets.sourceSearchFrontiers.frontiers || []).find((item) =>
        item?.id === "artifacts-four-piece-independent-field-frontier-7.0"
    );
    if (!frontier?.appliesTo || frontier.status !== "searchExhausted") {
        throw new Error("fourPieceFrontierRegistryMissingOrOpen");
    }
    const registryIds = sortedIds(frontier.appliesTo.candidateIds);
    if (frontier.appliesTo.candidateCount !== registryIds.length
        || frontier.appliesTo.candidateIdDigest !== stableDigest(registryIds)
        || !fourPieceIds.every((id) => registryIds.includes(id))) {
        throw new Error("fourPieceFrontierCandidateScopeMismatch");
    }
    const omittedFourPieceIds = registryIds.filter((id) => !fourPieceIds.includes(id));
    const policy = (datasets.providerPolicy.policies || []).find((item) =>
        item?.id === "artifacts:kqm-tcl+genshin-db"
    );
    if (!policy || policy.status !== "evidenceOnlyBlocked") throw new Error("twoPieceProviderPolicyMissingOrOpen");
    const kqmIds = sortedIds((datasets.kqmEvidence.fields || []).map((record) => record?.candidateId));
    if (policy.candidateCount !== kqmIds.length
        || policy.candidateIdDigest !== stableDigest(kqmIds)
        || !twoPieceIds.every((id) => kqmIds.includes(id))) {
        throw new Error("twoPieceKqmPolicyCandidateScopeMismatch");
    }
    const omittedKqmIds = kqmIds.filter((id) => !twoPieceIds.includes(id));
    return {
        fourPiece: {
            registryId: frontier.id,
            status: frontier.status,
            candidateCount: frontier.appliesTo.candidateCount,
            candidateIdDigest: frontier.appliesTo.candidateIdDigest,
            selectedCandidateCount: fourPieceIds.length,
            selectedCandidateIdDigest: stableDigest(fourPieceIds),
            omittedCandidateIds: omittedFourPieceIds,
            selectedCandidatesAreFrontierSubset: fourPieceIds.every((id) => registryIds.includes(id))
        },
        twoPiece: {
            providerPolicyId: policy.id,
            providerPolicyStatus: policy.status,
            candidateCount: policy.candidateCount,
            candidateIdDigest: policy.candidateIdDigest,
            evidenceCandidateCount: kqmIds.length,
            evidenceCandidateIdDigest: stableDigest(kqmIds),
            selectedCandidateCount: twoPieceIds.length,
            selectedCandidateIdDigest: stableDigest(twoPieceIds),
            omittedCandidateIds: omittedKqmIds,
            selectedCandidatesArePolicySubset: twoPieceIds.every((id) => kqmIds.includes(id))
        }
    };
}

function boundedScopeFor(task, hasKqm, refs) {
    const candidateId = String(task.candidateId);
    const remainingSearches = hasKqm
        ? [
            `Materialize the exact provider-B genshin-db 7.0 artifact field record and immutable raw/field digest for ${candidateId}; the pinned provider package manifest is version-bound but this entity record is not materialized.`
        ]
        : [
            `Materialize an exact independent provider-owned 7.0 artifact field bundle with immutable raw/field digests for ${candidateId}; no qualifying exact bundle is persisted in the examined frontier.`
        ];
    const notExecutableReasons = hasKqm
        ? ["providerBArtifactFieldRecordNotMaterialized", "exact7.0FieldComparisonNotExecutable"]
        : ["exactIndependent7.0FieldBundleMissing", "exact7.0FieldComparisonNotExecutable"];
    return {
        remainingSearches,
        notExecutableReasons,
        artifactRefs: refs.search
    };
}

function selectionRows(tasks) {
    return tasks.map((task) => ({
        candidateId: String(task.candidateId),
        layer: String(task.layer || ""),
        dataset: String(task.dataset || ""),
        taskId: String(task.task?.taskId || ""),
        taskKind: String(task.task?.kind || ""),
        taskStatus: String(task.task?.status || ""),
        deferredLaneCount: Array.isArray(task.deferredLanes) ? task.deferredLanes.length : null,
        frontierStatus: String(task.searchFrontier?.status || ""),
        frontierExhausted: task.searchFrontier?.exhausted === true,
        frontierScopeMatched: task.searchFrontier?.scopeMatched === true,
        entityId: parseArtifactCandidate(task.candidateId).setId
    }));
}

function buildAudit({ dataRoot = defaultDataRoot, queue, generatedAt = GENERATED_AT } = {}) {
    const resolvedDataRoot = path.resolve(dataRoot);
    const loadedQueue = loadQueue(queue);
    const queueTasks = Array.isArray(loadedQueue.value?.tasks) ? loadedQueue.value.tasks : [];
    const artifactTasks = queueTasks.filter((task) => task?.dataset === "artifacts");
    const selectedTasks = artifactTasks.filter(artifactTaskIsDeferrable);
    const excludedTasks = artifactTasks.filter((task) => !artifactTaskIsDeferrable(task));
    const datasets = loadDatasets(resolvedDataRoot);
    const files = makeEvidenceFiles(resolvedDataRoot);
    const frontierBindings = buildFrontierBindings(selectedTasks, datasets);
    const kqmByCandidate = new Map((datasets.kqmEvidence.fields || []).map((record) => [
        record.candidateId,
        record
    ]));
    const built = selectedTasks.map((task) => buildDecision(
        task,
        resolvedDataRoot,
        datasets,
        files,
        kqmByCandidate,
        frontierBindings
    ));
    const decisions = built.map((item) => item.decision);
    const candidateEvidence = built.map((item) => item.evidence);
    const excluded = excludedTasks.map((task) => ({
        candidateId: String(task.candidateId),
        eligibleForDeferral: false,
        reasons: artifactTaskReasons(task),
        queueFacts: {
            taskId: task.task?.taskId || null,
            taskKind: task.task?.kind || null,
            taskStatus: task.task?.status || null,
            taskReason: task.task?.reason || null,
            deferredLanes: clone(task.deferredLanes || []),
            frontierStatus: task.searchFrontier?.status || null,
            frontierExhausted: task.searchFrontier?.exhausted ?? null,
            frontierScopeMatched: task.searchFrontier?.scopeMatched ?? null,
            nextTask: task.task?.taskId || null
        }
    }));
    const selectedRows = selectionRows(selectedTasks);
    const selectedCandidateIds = selectedRows.map((row) => row.candidateId).sort((a, b) => a.localeCompare(b));
    const selectedTaskDigests = selectedTasks.map(taskDigest).sort();
    const selectionDigest = stableDigest(selectedRows);
    const kqmCount = candidateEvidence.filter((item) => item.kqm?.exactCandidate === true).length;
    const fourPieceCount = selectedTasks.filter((task) => task.candidateId.split(":")[2] === "fourPiece").length;
    const twoPieceCount = selectedTasks.filter((task) => task.candidateId.split(":")[2] === "twoPiece").length;
    const decisionValidation = decisions.map((decision, index) => validateDeferral(
        decision,
        selectedTasks[index],
        { targetGameVersion: TARGET_GAME_VERSION }
    ));
    const invalidDecisionCount = decisionValidation.filter((result) => !result.valid).length;
    const result = {
        schemaVersion: 1,
        kind: "genshinR2ArtifactDeferralAudit",
        policyId: POLICY,
        targetGameVersion: TARGET_GAME_VERSION,
        status: "draft",
        draftOnly: true,
        generatedAt,
        generator: {
            name: "genshinR2ArtifactDeferralAudit.cjs",
            version: GENERATOR_VERSION
        },
        scope: {
            dataset: "artifacts",
            layer: "artifactEffectSpec",
            taskKind: "sourceProvider",
            taskStatus: "reopenOnTrigger",
            deferredLanes: "emptyOnly",
            frontierScopeMatched: true,
            frontierExhausted: true,
            candidateIdDigest: stableDigest(selectedCandidateIds),
            selectedTaskDigestDigest: stableDigest(selectedTaskDigests),
            selectionDigest,
            candidateIds: selectedCandidateIds,
            selectionRows: selectedRows
        },
        queueObservation: {
            path: loadedQueue.path,
            bytes: loadedQueue.bytes,
            rawSha256: loadedQueue.rawSha256,
            artifactTaskCount: artifactTasks.length,
            selectedCandidateCount: selectedTasks.length,
            excludedCandidateCount: excludedTasks.length,
            note: "Queue hash is provenance only; it is not used as an artifactRef, avoiding a work-progress digest cycle."
        },
        candidateCount: decisions.length,
        decisions,
        exclusions: excluded,
        evidence: {
            exactFrontierCandidateCount: selectedTasks.length,
            exactFrontierPolicyCounts: Object.fromEntries([...new Set(selectedTasks.map((task) => task.searchFrontier.policyId))]
                .sort()
                .map((policyId) => [policyId, selectedTasks.filter((task) => task.searchFrontier.policyId === policyId).length])),
            pieceSlotCounts: { twoPiece: twoPieceCount, fourPiece: fourPieceCount },
            exactKqmCandidateCount: kqmCount,
            exactFourPieceNoKqmCount: fourPieceCount,
            blockedClaimCount: selectedTasks.reduce((sum, task) => sum + (task.certificate?.candidateClaimCount || 0), 0),
            currentProjection: {
                candidateSpecStatus: "legacyProjectionNeedsReview",
                sourceGameVersion: null,
                historicalVersionSnapshot: "unavailable",
                historicalValuePolicy: HISTORICAL_UNAVAILABLE
            },
            frontierBinding: frontierBindings,
            legacyConsumer: {
                manifestAuthority: datasets.legacyManifest.datasets?.artifactSetModifiers?.authority || "legacyCompatible",
                manifestLayer: datasets.legacyManifest.datasets?.artifactSetModifiers?.layer || "runtime",
                canonicalActivation: false,
                candidateRuntimeStatus: "candidate",
                auditCanonicalCount: datasets.artifactAudit.summary?.runtime?.canonical || 0,
                safety: "Existing legacy modifier data remains unchanged; draft decisions never supersede or activate it."
            },
            files: files.evidence,
            candidates: candidateEvidence
        },
        gate: {
            status: "draftEvidenceDeferredOnly",
            strictEligible: 0,
            canonicalPromotionEligible: 0,
            verificationGranted: false,
            promotionGranted: false,
            legacySupersessionGranted: false,
            reason: "Evidence deferral closes only the finite source frontier after explicit review; it does not verify fields or alter runtime."
        },
        validation: {
            valid: invalidDecisionCount === 0,
            invalidDecisionCount,
            decisionResults: decisionValidation
        }
    };
    return result;
}

function validateAudit(audit, { dataRoot = defaultDataRoot, queue, compareCurrent = true } = {}) {
    const reasons = [];
    const add = (reason) => { if (!reasons.includes(reason)) reasons.push(reason); };
    if (!audit || typeof audit !== "object" || Array.isArray(audit)) return { valid: false, reasons: ["artifactMissing"] };
    if (audit.schemaVersion !== 1) add("schemaVersionInvalid");
    if (audit.kind !== "genshinR2ArtifactDeferralAudit") add("kindInvalid");
    if (audit.policyId !== POLICY || audit.targetGameVersion !== TARGET_GAME_VERSION) add("policyBindingInvalid");
    if (audit.status !== "draft" || audit.draftOnly !== true) add("draftGateInvalid");
    if (audit.gate?.strictEligible !== 0 || audit.gate?.canonicalPromotionEligible !== 0
        || audit.gate?.verificationGranted !== false || audit.gate?.promotionGranted !== false
        || audit.gate?.legacySupersessionGranted !== false) add("gateNotFailClosed");

    const decisions = Array.isArray(audit.decisions) ? audit.decisions : [];
    const decisionIds = decisions.map((decision) => String(decision?.candidateId || ""));
    if (decisionIds.length !== new Set(decisionIds).size) add("duplicateDecisionCandidateIds");
    if (audit.candidateCount !== decisions.length) add("candidateCountMismatch");
    const evidenceCandidates = Array.isArray(audit.evidence?.candidates) ? audit.evidence.candidates : [];
    const evidenceIds = evidenceCandidates.map((item) => String(item?.candidateId || ""));
    if (evidenceIds.length !== new Set(evidenceIds).size) add("duplicateEvidenceCandidateIds");
    if (evidenceIds.length !== decisions.length) add("candidateEvidenceCountMismatch");
    if ((audit.exclusions || []).some((item) => item?.eligibleForDeferral !== false || !Array.isArray(item?.reasons) || item.reasons.length === 0)) {
        add("exclusionReasonMissing");
    }

    const loadedQueue = loadQueue(queue);
    const queueTasks = Array.isArray(loadedQueue.value?.tasks) ? loadedQueue.value.tasks : [];
    const artifactTasks = queueTasks.filter((task) => task?.dataset === "artifacts");
    const selectedTasks = artifactTasks.filter(artifactTaskIsDeferrable);
    const resolvedDataRoot = path.resolve(dataRoot);
    let datasets = null;
    let frontierBindings = null;
    try {
        datasets = loadDatasets(resolvedDataRoot);
        frontierBindings = buildFrontierBindings(selectedTasks, datasets);
    } catch (error) {
        add(`frontierBindingInvalid:${error.message}`);
    }
    const expectedById = new Map(selectedTasks.map((task) => [String(task.candidateId), task]));
    const decisionById = new Map(decisions.map((decision) => [String(decision?.candidateId || ""), decision]));
    const evidenceById = new Map(evidenceCandidates.map((item) => [String(item?.candidateId || ""), item]));
    if (frontierBindings && stableJson(audit.evidence?.frontierBinding) !== stableJson(frontierBindings)) {
        add("frontierBindingEvidenceMismatch");
    }
    const specs = datasets?.specs || {};
    for (const task of selectedTasks) {
        const id = String(task.candidateId);
        const decision = decisionById.get(id);
        if (!decision) {
            add(`candidateOmission:${id}`);
            continue;
        }
        const result = validateDeferral(decision, task, { targetGameVersion: TARGET_GAME_VERSION });
        if (!result.valid) add(`decisionInvalid:${id}:${result.errors.join(",")}`);
        if (decision.assessment?.actorId !== "luna_worker") add(`assessmentActorInvalid:${id}`);
        const evidence = evidenceById.get(id);
        if (!evidence) {
            add(`evidenceOmission:${id}`);
            continue;
        }
        if (evidence.frontier?.candidateId !== id || evidence.frontier?.exactCandidateInScope !== true
            || evidence.frontier?.scopeMatched !== true || evidence.frontier?.exhausted !== true
            || evidence.frontier?.policyId !== task.searchFrontier?.policyId
            || evidence.frontier?.taskId !== task.task?.taskId) add(`frontierEvidenceInvalid:${id}`);
        if (evidence.frontier?.digest !== stableDigest({
            candidateId: id,
            taskId: task.task.taskId,
            policyId: task.searchFrontier.policyId,
            scopeUnit: task.searchFrontier.scopeUnit,
            searchScope: task.searchFrontier.searchScope,
            lastSearchedAt: task.searchFrontier.lastSearchedAt,
            providersExamined: task.searchFrontier.providersExamined,
            status: task.searchFrontier.status,
            exhausted: task.searchFrontier.exhausted === true,
            scopeMatched: task.searchFrontier.scopeMatched === true,
            reopenTrigger: task.searchFrontier.reopenTrigger,
            blockingReasons: task.searchFrontier.blockingReasons || [],
            claimFields: claimFields(task)
        })) add(`frontierDigestInvalid:${id}`);
        const spec = specs[id];
        if (!spec) {
            add(`specMissing:${id}`);
            continue;
        }
        const expectedFields = new Map(buildFieldFindings(
            task,
            spec,
            (audit.evidence?.candidates || []).find((item) => item.candidateId === id)?.kqm?.exactCandidate === true
        ).map((finding) => [finding.field, finding]));
        const actualFields = new Map((decision.fieldFindings || []).map((finding) => [finding?.field, finding]));
        for (const [field, finding] of expectedFields) {
            const actual = actualFields.get(field);
            if (!actual || stableJson(actual.currentValue) !== stableJson(finding.currentValue)
                || actual.knownStatus !== finding.knownStatus
                || actual.historicalValue !== null || !String(actual.missingEvidence || "").includes("historicalValue is intentionally null")) {
                add(`fieldFindingInvalid:${id}:${field}`);
            }
        }
        for (const field of actualFields.keys()) if (!expectedFields.has(field)) add(`unknownFieldFinding:${id}:${field}`);
        if (evidence.legacy?.recordPresent !== true || evidence.legacy?.canonicalEligible !== false
            || evidence.legacy?.consumerAction !== "unchangedLegacyConsumer;candidateNotActivated") add(`legacySafetyInvalid:${id}`);
        for (const decisionRefs of [
            decision.search?.artifactRefs,
            decision.safety?.artifactRefs,
            decision.assessment?.boundedScope?.artifactRefs
        ]) {
            for (const ref of decisionRefs || []) {
                if (/queue|inventory|r2-artifact-deferral-audit/i.test(String(ref?.path || ""))) add(`cyclicArtifactRef:${id}:${ref.path}`);
            }
        }
        if (frontierBindings && evidence.frontierBinding
            && stableJson(evidence.frontierBinding) !== stableJson(frontierBindings[String(id).includes(":fourPiece:") ? "fourPiece" : "twoPiece"])) {
            add(`candidateFrontierBindingInvalid:${id}`);
        }
    }
    for (const id of decisionById.keys()) if (!expectedById.has(id)) add(`unknownDecision:${id}`);
    const expectedExcluded = artifactTasks.filter((task) => !artifactTaskIsDeferrable(task)).map((task) => String(task.candidateId)).sort();
    const actualExcluded = (audit.exclusions || []).map((item) => String(item?.candidateId || "")).sort();
    if (stableJson(actualExcluded) !== stableJson(expectedExcluded)) add("exclusionScopeMismatch");
    if (audit.scope?.candidateIdDigest !== stableDigest(selectedTasks.map((task) => String(task.candidateId)).sort())) add("candidateIdDigestMismatch");
    if (audit.scope?.selectionDigest !== stableDigest(selectionRows(selectedTasks))) add("selectionDigestMismatch");
    if (audit.queueObservation?.artifactTaskCount !== artifactTasks.length
        || audit.queueObservation?.selectedCandidateCount !== selectedTasks.length
        || audit.queueObservation?.excludedCandidateCount !== expectedExcluded.length) add("queueObservationMismatch");
    if (compareCurrent && selectedTasks.length !== EXPECTED_SELECTED_COUNT) add("selectedCountUnexpected");
    if (compareCurrent && artifactTasks.length !== EXPECTED_ARTIFACT_TASK_COUNT) add("artifactTaskCountUnexpected");
    if (compareCurrent && expectedExcluded.length !== EXPECTED_EXCLUDED_COUNT) add("excludedCountUnexpected");
    return {
        valid: reasons.length === 0,
        reasons,
        summary: {
            artifactTaskCount: artifactTasks.length,
            candidateCount: selectedTasks.length,
            exclusionCount: expectedExcluded.length,
            validatedDecisionCount: selectedTasks.filter((task) => decisionById.has(String(task.candidateId))).length,
            queueRawDigestChanged: Boolean(compareCurrent && loadedQueue.rawSha256
                && audit.queueObservation?.rawSha256
                && loadedQueue.rawSha256 !== audit.queueObservation.rawSha256)
        }
    };
}

function writeArtifacts({ dataRoot = defaultDataRoot, queue, artifactPath = defaultArtifactPath } = {}) {
    const audit = buildAudit({ dataRoot, queue });
    const file = resolveRepositoryFile(artifactPath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(stableValue(audit), null, 2)}\n`, "utf8");
    return audit;
}

if (require.main === module) {
    const dataRoot = process.env.GENSHIN_DATA_ROOT || defaultDataRoot;
    const queue = process.env.GENSHIN_R2_QUEUE_PATH || defaultQueuePath;
    const artifactPath = process.env.GENSHIN_R2_ARTIFACT_DEFERRAL_AUDIT_PATH || defaultArtifactPath;
    const audit = writeArtifacts({ dataRoot, queue, artifactPath });
    const validation = validateAudit(audit, { dataRoot, queue, compareCurrent: true });
    process.stdout.write(`${JSON.stringify({ status: audit.status, validation, summary: {
        candidateCount: audit.candidateCount,
        exclusionCount: audit.exclusions.length,
        exactKqmCandidateCount: audit.evidence.exactKqmCandidateCount,
        blockedClaimCount: audit.evidence.blockedClaimCount,
        gate: audit.gate
    } }, null, 2)}\n`);
    if (!validation.valid) process.exitCode = 1;
}

module.exports = {
    TARGET_GAME_VERSION,
    GENERATED_AT,
    GENERATOR_VERSION,
    EXPECTED_ARTIFACT_TASK_COUNT,
    EXPECTED_SELECTED_COUNT,
    EXPECTED_EXCLUDED_COUNT,
    artifactTaskIsDeferrable,
    artifactTaskReasons,
    leafValues,
    buildFieldFindings,
    buildAudit,
    validateAudit,
    writeArtifacts
};
