"use strict";

// Draft-only r2 weapon disposition audit.  This file reads the existing queue,
// source evidence and legacy runtime; it never mutates the queue or promotes a
// candidate.  Sol's later registration step is the only approval boundary.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
    POLICY,
    taskDigest,
    validateDeferral,
    digest: stableDigest
} = require("./genshinWorkDisposition.cjs");

const ROOT = path.resolve(__dirname, "..");
const TARGET_GAME_VERSION = "7.0";
const GENERATED_AT = "2026-08-28T00:00:00.000Z";
const ACTOR_ID = "luna_worker";
const GENERATOR_VERSION = "genshinR2WeaponDeferralAudit/1";
const FRONTIER_POLICY = "weapons-gcsim-nine-entity-field-frontier-7.0";
const QUEUE_PATH = path.join(ROOT, "reports", "genshin-evidence-task-queue.json");
const OUTPUT_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "reviews", "r2-weapon-deferral-audit.json");
const SOURCE_PATHS = Object.freeze([
    "games/genshin/data/v2/provider-independence-policy.json",
    "games/genshin/data/v2/game-version-evidence.json",
    "games/genshin/data/v2/version-transitions/6.7-to-7.0/source-search.json",
    "games/genshin/data/v2/weapons/external-evidence.json",
    "games/genshin/data/v2/weapons/independent-field-evidence.json",
    "reports/genshin-weapon-gcsim-evidence.json",
    "reports/genshin-weapon-independent-evidence.json",
    "reports/genshin-weapon-gcsim-conflict-triage.json"
]);
const SAFETY_PATHS = Object.freeze([
    "games/genshin/data/v2/weapons/spec-candidates.json",
    "games/genshin/data/v2/weapons/source-records.json",
    "games/genshin/data/calc/weapon-modifiers.json",
    "games/genshin/data/calc/weapon-effect-registry.json",
    "games/genshin/data/v2/runtime/canonical-runtime.json"
]);

const has = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const sortUnique = (values) => [...new Set((values || []).filter((value) => value !== null && value !== undefined).map(String))]
    .sort((a, b) => a.localeCompare(b));
const relative = (file) => path.relative(ROOT, file).replaceAll("\\", "/");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const stable = (value) => Array.isArray(value) ? value.map(stable)
    : value && typeof value === "object"
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
        : value;

function input(options, key, file) {
    const supplied = options[key] ?? options.inputs?.[key];
    if (supplied !== undefined) return typeof supplied === "string" ? readJson(path.resolve(ROOT, supplied)) : supplied;
    return readJson(path.join(ROOT, file));
}

function artifactRef(file) {
    const resolved = path.resolve(ROOT, file);
    const bytes = fs.readFileSync(resolved);
    return { path: relative(resolved), sha256: sha256(bytes) };
}

function artifactRefs(paths) {
    return paths.map(artifactRef);
}

function selectedTask(task) {
    return task?.searchFrontier?.policyId === FRONTIER_POLICY;
}

function taskReasons(task) {
    const reasons = [];
    if (task?.layer !== "weaponEffectSpec" || task?.dataset !== "weapons") reasons.push("scopeMismatch");
    if (task?.task?.kind !== "sourceProvider") reasons.push("concreteSourceTaskPending");
    if (task?.task?.status !== "reopenOnTrigger") reasons.push("concreteSourceTaskPending");
    if (task?.task?.autoProcessableNow === true || task?.autoProcessableNow === true) reasons.push("autoProcessableNow");
    if (!Array.isArray(task?.deferredLanes) || task.deferredLanes.length) reasons.push("deferredLanePresent");
    if (task?.searchFrontier?.scopeMatched !== true) reasons.push("frontierScopeNotMatched");
    if (task?.searchFrontier?.exhausted !== true && task?.searchFrontier?.exhausted !== false) reasons.push("frontierExhaustionUnknown");
    if (task?.searchFrontier?.status === "searchRequired") reasons.push("concreteSourceTaskPending");
    if (!task?.searchFrontier?.searchScope || !task?.searchFrontier?.reopenTrigger) reasons.push("frontierRecordIncomplete");
    if (Array.isArray(task?.fieldComparison?.statuses) && task.fieldComparison.statuses.length) reasons.push("concreteComparisonTaskPending");
    if (task?.fieldComparison?.hasMismatch === true) reasons.push("concreteComparisonTaskPending");
    if (["pending", "required", "needsReview", "blocked"].includes(task?.mappingStatus)) reasons.push("concreteMappingTaskPending");
    if (["pending", "required", "needsReview", "blocked"].includes(task?.consumerStatus)) reasons.push("concreteConsumerTaskPending");
    return sortUnique(reasons);
}

function entityId(candidate) {
    return String(candidate?.entity?.id || candidate?.runtime?.destination?.entityId || "");
}

function legacyRecordFor(candidate, legacyModifiers) {
    const entity = entityId(candidate);
    const ids = Array.isArray(candidate?.supersedesLegacyModifierIds)
        ? candidate.supersedesLegacyModifierIds.map(String) : [];
    const records = Array.isArray(legacyModifiers?.[entity]?.modifiers) ? legacyModifiers[entity].modifiers : [];
    const matches = records.filter((record) => ids.includes(String(record?.id)));
    return { entity, ids, records, matches };
}

function registryGroupsFor(candidate, registry) {
    const entity = entityId(candidate);
    const ids = Array.isArray(candidate?.supersedesLegacyModifierIds)
        ? candidate.supersedesLegacyModifierIds.map(String) : [];
    const groups = Array.isArray(registry?.weapons?.[entity]?.groups) ? registry.weapons[entity].groups : [];
    return groups.filter((group) => (group?.modifierIds || []).some((id) => ids.includes(String(id))));
}

function candidateRuntimeId(candidate) {
    return candidate?.runtime?.modifierIds?.length === 1 ? String(candidate.runtime.modifierIds[0]) : null;
}

function sourceFieldsFor(candidateId, candidate, external) {
    const record = external?.records?.[`gcsim:weapon:${entityId(candidate)}`];
    const fields = Array.isArray(record?.fields) ? record.fields.filter((field) => field?.candidateId === candidateId) : [];
    return { record, fields };
}

function independentFieldsFor(candidateId, candidate, independent) {
    const record = independent?.records?.[entityId(candidate)];
    const fields = Array.isArray(record?.fieldComparisons)
        ? record.fieldComparisons.filter((field) => field?.candidateId === candidateId) : [];
    return { record, fields };
}

function targetVersionPresent(sourceRecord, fields, independentRecord, independentFields) {
    const values = [sourceRecord?.gameVersion, ...fields.map((field) => field?.gameVersion),
        independentRecord?.gameVersion?.target, independentRecord?.gameVersion?.independentImplementation,
        ...independentFields.flatMap((field) => [field?.gameVersion?.target, field?.gameVersion?.independentImplementation])];
    return values.some((value) => String(value || "") === TARGET_GAME_VERSION)
        || sourceRecord?.gameVersionVerified === true
        || fields.some((field) => field?.gameVersionVerified === true)
        || independentRecord?.gameVersion?.exactBinding === true;
}

function globalEvidenceReasons(data) {
    const reasons = [];
    const gs = data.gcsimReport?.summary || {};
    const is = data.independentReport?.summary || {};
    const ct = data.conflictTriage?.summary || {};
    if (data.gcsimReport?.status !== "passed" || Number(data.gcsimReport?.errors?.length || gs.errors || 0) !== 0) reasons.push("sourceEvidenceAuditInvalid");
    if (data.independentReport?.status !== "passed" || Number(data.independentReport?.errors?.length || is.errors || 0) !== 0) reasons.push("independentEvidenceAuditInvalid");
    if (data.conflictTriage?.status !== "passed" || Number(data.conflictTriage?.errors?.length || ct.errors || 0) !== 0) reasons.push("conflictTriageInvalid");
    if (Number(gs.candidateValueConflicts || 0) > 0 || Number(gs.genuineValueConflicts || 0) > 0
        || Number(ct.candidateValueConflicts || 0) > 0 || Number(ct.genuineValueConflicts || 0) > 0) reasons.push("sourceComparisonConflict");
    if (Number(ct.semanticConflicts || 0) > 0) reasons.push("concreteSemanticComparisonPending");
    return sortUnique(reasons);
}

function frontierRecord(data) {
    return (data.sourceSearchFrontiers?.frontiers || []).find((frontier) => frontier?.id === FRONTIER_POLICY);
}

function frontierScopeReasons(task, frontier) {
    const reasons = [];
    if (!frontier || frontier.status !== "searchExhausted") reasons.push("frontierRegistryMissingOrOpen");
    const registeredIds = Array.isArray(frontier?.appliesTo?.candidateIds) ? frontier.appliesTo.candidateIds.map(String) : [];
    if (registeredIds.length !== 30 || String(frontier?.appliesTo?.candidateCount) !== "30") reasons.push("frontierCandidateCountMismatch");
    if (stableDigest(registeredIds) !== frontier?.appliesTo?.candidateIdDigest) reasons.push("frontierCandidateDigestMismatch");
    if (task?.candidateId && !registeredIds.includes(String(task.candidateId))) reasons.push("candidateOutsideRegisteredFrontier");
    if (task?.searchFrontier?.searchScope !== frontier?.searchScope) reasons.push("frontierSearchScopeMismatch");
    if (task?.searchFrontier?.lastSearchedAt !== frontier?.lastSearchedAt) reasons.push("frontierSearchDateMismatch");
    if (stableDigest(task?.searchFrontier?.providersExamined || []) !== stableDigest(frontier?.providersExamined || [])) reasons.push("frontierProvidersMismatch");
    if (task?.searchFrontier?.reopenTrigger !== frontier?.reopenTrigger) reasons.push("frontierReopenTriggerMismatch");
    return sortUnique(reasons);
}

function legacySafetyReasons(candidate, data) {
    const reasons = [];
    const specStatus = candidate?.verification?.status;
    if (!candidate || specStatus === undefined) reasons.push("specCandidateMissing");
    if (specStatus && specStatus !== "needsReview") reasons.push("candidateVerificationNotNeedsReview");
    if (candidate?.verification?.canonicalEligibility === true || candidate?.runtime?.status === "canonical") reasons.push("candidateCanonicalEligible");
    const legacy = legacyRecordFor(candidate, data.legacyModifiers);
    if (legacy.ids.length !== 1 || legacy.matches.length !== 1) reasons.push("legacyModifierMissingOrDuplicate");
    if (!data.sourceRecords?.[`weapon:${legacy.entity}:modifier:${legacy.ids[0]}`]) reasons.push("historicalSourceRecordMissing");
    const groups = registryGroupsFor(candidate, data.registry);
    if (groups.length !== 1) reasons.push("legacyRegistryRouteMissingOrDuplicate");
    const runtimeId = candidateRuntimeId(candidate);
    const canonicalModifiers = data.canonicalRuntime?.modifiers && typeof data.canonicalRuntime.modifiers === "object"
        ? data.canonicalRuntime.modifiers : {};
    if (data.canonicalRuntime?.versionAvailability?.activeForProduction === true) reasons.push("canonicalRuntimeActive");
    if (runtimeId && canonicalModifiers[runtimeId]) reasons.push("candidateCanonicalRuntimePresent");
    return sortUnique(reasons);
}

function assessmentFieldNames(candidate, sourceFields) {
    const base = [
        "effect.kind", "effect.targets", "effect.activation", "effect.activation.calculationSupport",
        "effect.activation.uidHandling", "effect.valueByRefinement", "effect.unit", "effect.value",
        "destination", "supersedesLegacyModifierIds", "runtime.modifierIds", "registryStructure"
    ];
    const claims = Object.keys(candidate?.verification?.claims || {});
    const effect = Object.keys(candidate?.effect || {}).map((key) => `effect.${key}`);
    const ext = sourceFields.map((field) => field?.field).filter(Boolean);
    return [...new Set([...base, ...effect, ...claims, ...ext])];
}

function pathValue(value, pathName) {
    return pathName.split(".").reduce((current, key) => current && typeof current === "object" ? current[key] : undefined, value);
}

function candidateValue(candidate, field, groups) {
    const effect = candidate?.effect || {};
    if (field === "value" || field === "refinement" || field === "effect.valueByRefinement") return clone(effect.valueByRefinement);
    if (field === "effect.activation.calculationSupport") return clone(effect.activation?.calculationSupport);
    if (field === "effect.activation.uidHandling") return clone(effect.activation?.uidHandling);
    if (field === "activation") return clone(effect.activation);
    if (field === "targets") return clone(effect.targets);
    if (field === "unit") return clone(effect.unit);
    if (field === "destination") return clone(candidate?.destination);
    if (field === "supersedesLegacyModifierIds") return clone(candidate?.supersedesLegacyModifierIds);
    if (field === "runtime.modifierIds") return clone(candidate?.runtime?.modifierIds);
    if (field === "registryStructure") return clone(groups);
    if (field.startsWith("effect.")) return clone(pathValue(effect, field.slice("effect.".length)));
    if (has(effect, field)) return clone(effect[field]);
    return undefined;
}

function historicalValue(candidate, field, legacy, groups) {
    const record = legacy.matches[0];
    const unavailable = (reason) => ({ status: "explicitlyUnavailable", value: null, reason,
        sourceRef: `weapon:${legacy.entity}:modifier:${legacy.ids[0]}`, gameVersion: null,
        gameVersionStatus: "unavailable", verification: "unverifiedLocal" });
    if (!record) return unavailable("No matching legacy modifier record is present.");
    let value;
    if (["value", "refinement", "effect.valueByRefinement"].includes(field)) value = record.valueByRefinement;
    else if (field === "effect.kind") value = record.category;
    else if (["targets", "effect.targets"].includes(field)) value = record.applyTo;
    else if (field === "unit" || field === "effect.unit") value = record.unit;
    else if (["activation", "effect.activation"].includes(field)) value = {
        condition: record.condition, calculationSupport: record.calculationSupport,
        uidHandling: record.uidHandling
    };
    else if (field === "effect.activation.calculationSupport") value = record.calculationSupport;
    else if (field === "effect.activation.uidHandling") value = record.uidHandling;
    else if (field === "destination") value = candidate.destination;
    else if (field === "supersedesLegacyModifierIds") value = candidate.supersedesLegacyModifierIds;
    else if (field === "runtime.modifierIds") value = candidate.runtime?.modifierIds;
    else if (field === "registryStructure") value = groups;
    else if (has(record, field)) value = record[field];
    else if (field.startsWith("effect.") && has(record, field.slice("effect.".length))) value = record[field.slice("effect.".length)];
    if (value === undefined) return unavailable(`No historical local value is recorded for ${field}.`);
    return { status: "localLegacy", value: clone(value), sourceRef: `weapon:${legacy.entity}:modifier:${legacy.ids[0]}`,
        gameVersion: null, gameVersionStatus: "unavailable", verification: "unverifiedLocal" };
}

function sourceValue(field) {
    return clone(field?.structuredValue !== undefined ? field.structuredValue : field?.value);
}

function fieldFinding(candidateId, candidate, field, extField, indField, legacy, groups) {
    const projection = candidateValue(candidate, field, groups);
    const hasProjection = projection !== undefined;
    const status = extField ? (extField.status === "eligible" ? "presentUnversioned" : "presentNeedsReview")
        : hasProjection ? "localOnly" : "unknown";
    const sourceStatus = extField ? `gcsim source field status=${extField.status}; gameVersion=${extField.gameVersion ?? "unavailable"}.` :
        `No gcsim field record is materialized for ${field}; no value is inferred.`;
    const semantic = extField?.claimComparison?.semanticMismatchReasons?.length
        ? ` Recorded source semantic differences: ${sortUnique(extField.claimComparison.semanticMismatchReasons).join(", ")}; this remains unverified mapping evidence.` : "";
    const independent = indField ? ` Independent comparison status=${indField.status || "unknown"}; its implementation game-version binding is missing.`
        : " No independent candidate comparison field is materialized.";
    const current = extField ? {
        status, value: sourceValue(extField), candidateValue: clone(projection), targetGameVersion: TARGET_GAME_VERSION,
        sourceRecordId: extField.sourceRecordId || null, provider: extField.provider || "genshinsim/gcsim",
        revision: extField.revision || null, field, gameVersion: extField.gameVersion ?? null,
        verification: "unverified"
    } : {
        status, value: hasProjection ? clone(projection) : null, targetGameVersion: TARGET_GAME_VERSION,
        reason: hasProjection ? "Candidate/local projection only; no target-version proof." : "Unknown; no field value is inferred.",
        verification: "unverified"
    };
    return {
        field,
        knownStatus: status,
        currentValue: current,
        historicalValue: historicalValue(candidate, field, legacy, groups),
        missingEvidence: `${sourceStatus}${independent} No strict independent exact-7.0 binding or eligibility certificate is present.${semantic}`
    };
}

function remainingScope(candidateId) {
    return `External provider-owned Genshin 7.0 evidence remains unsearched for ${candidateId}: an immutable source manifest/revision and comparable independent candidate×claim field bundle with exact digests.`;
}

function buildDecision(task, candidate, data, refs, sourceFieldData, independentFieldData) {
    const legacy = legacyRecordFor(candidate, data.legacyModifiers);
    const groups = registryGroupsFor(candidate, data.registry);
    const fields = assessmentFieldNames(candidate, sourceFieldData.fields);
    const independentByField = new Map(independentFieldData.fields.map((field) => [String(field.field), field]));
    const externalByField = new Map(sourceFieldData.fields.map((field) => [String(field.field), field]));
    const remainder = remainingScope(task.candidateId);
    const boundedReasons = [
        `Queue task ${task.task.taskId} is sourceProvider/reopenOnTrigger with autoProcessableNow=false and no deferred lanes; no concrete source task can execute before the recorded external trigger.`,
        `Candidate fieldComparison has no pending statuses or mismatch; mappingStatus=${task.mappingStatus || "unknown"} and consumerStatus=${task.consumerStatus || "unknown"} expose no executable comparison, mapping, consumer, or code task.`,
        remainder
    ];
    const fieldFindings = fields.map((field) => fieldFinding(task.candidateId, candidate, field,
        externalByField.get(field), independentByField.get(field), legacy, groups));
    return {
        id: `r2-weapon-deferral-draft:${task.candidateId}`,
        kind: "genshinEvidenceDeferral",
        policyId: POLICY,
        candidateId: task.candidateId,
        targetGameVersion: TARGET_GAME_VERSION,
        queueTaskDigest: taskDigest(task),
        assessment: {
            actorId: ACTOR_ID,
            assessedAt: data.generatedAt,
            reason: `Draft bounded disposition for ${task.candidateId}: the finite candidate frontier is recorded, but target 7.0 source binding remains unavailable; no verification or promotion is granted.`,
            boundedScope: {
                candidateId: task.candidateId,
                taskId: task.task.taskId,
                remainingSearches: [remainder],
                notExecutableReasons: boundedReasons,
                artifactRefs: refs.search
            }
        },
        fieldFindings,
        search: {
            scope: task.searchFrontier.searchScope,
            lastSearchedAt: task.searchFrontier.lastSearchedAt,
            providersExamined: clone(task.searchFrontier.providersExamined),
            negativeResult: `The exact candidate ${task.candidateId} is inside the recorded finite ${task.searchFrontier.scopeUnit || "candidate"} frontier. gcsim source fields are revision-pinned but gameVersion is unavailable; independent comparisons remain needsReview with no exact 7.0 implementation binding. No strict target-version certificate or candidate value conflict is present.`,
            unsearchedScope: [remainder],
            reopenTrigger: task.searchFrontier.reopenTrigger,
            nextTask: task.task.taskId,
            artifactRefs: refs.search
        },
        safety: {
            impact: `The 7.0 values and semantics for ${task.candidateId} remain unverified; activating the candidate could change the current legacy modifier route.`,
            action: `Retain the existing legacy modifier and registry route for ${task.candidateId}; keep the v2 candidate inactive and issue no certificate or canonical promotion until the recorded trigger is independently satisfied.`,
            runtimeStatus: "legacyRetainedCanonicalCandidateInactive",
            artifactRefs: refs.safety
        }
    };
}

function buildAudit(options = {}) {
    const generatedAt = options.generatedAt || GENERATED_AT;
    const queue = input(options, "queue", "reports/genshin-evidence-task-queue.json");
    const data = {
        generatedAt,
        sourceSearchFrontiers: input(options, "sourceSearchFrontiers", "games/genshin/data/v2/source-search-frontiers.json"),
        providerPolicy: input(options, "providerPolicy", "games/genshin/data/v2/provider-independence-policy.json"),
        gameVersionEvidence: input(options, "gameVersionEvidence", "games/genshin/data/v2/game-version-evidence.json"),
        sourceSearch: input(options, "sourceSearch", "games/genshin/data/v2/version-transitions/6.7-to-7.0/source-search.json"),
        external: input(options, "externalEvidence", "games/genshin/data/v2/weapons/external-evidence.json"),
        independent: input(options, "independentEvidence", "games/genshin/data/v2/weapons/independent-field-evidence.json"),
        gcsimReport: input(options, "gcsimReport", "reports/genshin-weapon-gcsim-evidence.json"),
        independentReport: input(options, "independentReport", "reports/genshin-weapon-independent-evidence.json"),
        conflictTriage: input(options, "conflictTriage", "reports/genshin-weapon-gcsim-conflict-triage.json"),
        specs: input(options, "specCandidates", "games/genshin/data/v2/weapons/spec-candidates.json"),
        sourceRecords: input(options, "sourceRecords", "games/genshin/data/v2/weapons/source-records.json"),
        legacyModifiers: input(options, "legacyWeaponModifiers", "games/genshin/data/calc/weapon-modifiers.json"),
        registry: input(options, "legacyWeaponRegistry", "games/genshin/data/calc/weapon-effect-registry.json"),
        canonicalRuntime: input(options, "canonicalRuntime", "games/genshin/data/v2/runtime/canonical-runtime.json")
    };
    const refs = { search: artifactRefs(SOURCE_PATHS), safety: artifactRefs(SAFETY_PATHS) };
    const scoped = (Array.isArray(queue?.tasks) ? queue.tasks : []).filter(selectedTask)
        .sort((a, b) => String(a.candidateId).localeCompare(String(b.candidateId)));
    const globalReasons = globalEvidenceReasons(data);
    const frontier = frontierRecord(data);
    const registeredFrontierIds = Array.isArray(frontier?.appliesTo?.candidateIds)
        ? frontier.appliesTo.candidateIds.map(String) : [];
    const queueIds = scoped.map((task) => String(task.candidateId));
    const queueIdSet = new Set(queueIds);
    const frontierGlobalReasons = [];
    if (registeredFrontierIds.length !== queueIds.length
        || registeredFrontierIds.some((id) => !queueIdSet.has(id))
        || queueIds.some((id) => !registeredFrontierIds.includes(id))) {
        frontierGlobalReasons.push("frontierQueueCandidateSetMismatch");
    }
    const decisions = [];
    const exclusions = [];
    for (const task of scoped) {
        const candidateId = String(task.candidateId);
        const candidate = data.specs?.[candidateId];
        const sourceFieldData = sourceFieldsFor(candidateId, candidate, data.external);
        const independentFieldData = independentFieldsFor(candidateId, candidate, data.independent);
        const reasons = [...taskReasons(task), ...globalReasons, ...frontierGlobalReasons,
            ...frontierScopeReasons(task, frontier)];
        if (!candidate) reasons.push("specCandidateMissing");
        if (!sourceFieldData.record || sourceFieldData.fields.length === 0) reasons.push("sourceFieldCoverageMissing");
        if (!independentFieldData.record || independentFieldData.fields.length === 0) reasons.push("independentFieldCoverageMissing");
        if (targetVersionPresent(sourceFieldData.record, sourceFieldData.fields, independentFieldData.record, independentFieldData.fields)) reasons.push("targetVersionEvidencePresent");
        reasons.push(...legacySafetyReasons(candidate, data));
        const uniqueReasons = sortUnique(reasons);
        if (uniqueReasons.length) {
            exclusions.push({ candidateId, reasons: uniqueReasons });
            continue;
        }
        const decision = buildDecision(task, candidate, data, refs, sourceFieldData, independentFieldData);
        const validation = validateDeferral(decision, task, { targetGameVersion: TARGET_GAME_VERSION });
        if (!validation.valid) {
            exclusions.push({ candidateId, reasons: validation.errors.map((error) => `draftValidation:${error}`) });
            continue;
        }
        decisions.push(decision);
    }
    const candidateIds = scoped.map((task) => String(task.candidateId));
    const reportSummary = (report) => ({ status: report?.status || null, summary: clone(report?.summary || {}), errors: clone(report?.errors || []), warnings: clone(report?.warnings || []) });
    const gcsimRecords = Object.values(data.external?.records || {});
    const independentRecords = Object.values(data.independent?.records || {});
    const activeCandidateRuntimeIds = decisions.map((decision) => data.specs?.[decision.candidateId]?.runtime?.modifierIds || [])
        .flat().filter((id) => data.canonicalRuntime?.modifiers?.[id]);
    return {
        schemaVersion: 1,
        kind: "genshinR2WeaponDeferralAudit",
        policyId: POLICY,
        targetGameVersion: TARGET_GAME_VERSION,
        status: "draft",
        draftOnly: true,
        generatedAt,
        generator: { name: "genshinR2WeaponDeferralAudit.cjs", version: GENERATOR_VERSION, actorId: ACTOR_ID },
        candidateCount: scoped.length,
        decisions,
        exclusions,
        summary: {
            selectedCandidateCount: scoped.length,
            decisionCount: decisions.length,
            exclusionCount: exclusions.length,
            expectedCandidateCount: 30,
            sourceRecordCount: gcsimRecords.length,
            independentRecordCount: independentRecords.length,
            globalEvidenceReasons: globalReasons,
            note: "Draft records are bounded work dispositions only; no verification, canonical promotion, or queue mutation is performed."
        },
        evidence: {
            frontier: {
                policyId: FRONTIER_POLICY,
                candidateIds: registeredFrontierIds,
                candidateIdDigest: frontier?.appliesTo?.candidateIdDigest || null,
                queueCandidateIds: candidateIds,
                queueCandidateIdDigest: stableDigest(candidateIds),
                registeredCandidateIds: registeredFrontierIds,
                registeredCandidateIdDigest: frontier?.appliesTo?.candidateIdDigest || null,
                registeredCandidateCount: frontier?.appliesTo?.candidateCount ?? null,
                registeredStatus: frontier?.status || null,
                registeredSearchScope: frontier?.searchScope || null,
                registeredLastSearchedAt: frontier?.lastSearchedAt || null,
                finiteScope: true,
                note: "The queue frontier is finite only for the recorded candidate scope; each decision explicitly records the external/unavailable remainder and bounded assessment."
            },
            source: {
                sourceSearch: {
                    transitionId: data.sourceSearch?.transitionId || null,
                    searchExhausted: data.sourceSearch?.searchExhausted ?? null,
                    strictTargetDatasetFound: data.sourceSearch?.strictTargetDatasetFound ?? null
                },
                gcsim: reportSummary(data.gcsimReport),
                independent: reportSummary(data.independentReport),
                conflictTriage: reportSummary(data.conflictTriage),
                exactCandidateCoverage: candidateIds.map((candidateId) => {
                    const candidate = data.specs?.[candidateId];
                    const ext = sourceFieldsFor(candidateId, candidate, data.external);
                    const ind = independentFieldsFor(candidateId, candidate, data.independent);
                    return { candidateId, entityId: entityId(candidate), gcsimFieldCount: ext.fields.length,
                        independentFieldCount: ind.fields.length, gcsimGameVersion: ext.record?.gameVersion ?? null,
                        independentImplementationGameVersion: ind.record?.gameVersion?.independentImplementation ?? null };
                })
            },
            historical: {
                sourceRecords: "Local source-records and legacy modifiers are historical/local-only; gameVersion null is retained as unavailable, never inferred.",
                legacyRoutePolicy: "Existing legacy modifier plus exactly one registry group must remain present and unchanged."
            },
            safety: {
                canonicalActiveForProduction: data.canonicalRuntime?.versionAvailability?.activeForProduction ?? null,
                activeCandidateRuntimeIds,
                artifactRefs: { search: refs.search, safety: refs.safety }
            }
        }
    };
}

function writeArtifacts(options = {}) {
    const audit = buildAudit(options);
    const outputPath = path.resolve(ROOT, options.outputPath || OUTPUT_PATH);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(stable(audit), null, 2)}\n`, "utf8");
    return { audit, path: relative(outputPath) };
}

if (require.main === module) {
    const result = writeArtifacts({ outputPath: process.env.GENSHIN_R2_WEAPON_DEFERRAL_AUDIT_PATH || OUTPUT_PATH });
    process.stdout.write(`${JSON.stringify({ status: result.audit.status, candidateCount: result.audit.candidateCount,
        decisions: result.audit.decisions.length, exclusions: result.audit.exclusions }, null, 2)}\n`);
}

module.exports = {
    TARGET_GAME_VERSION,
    FRONTIER_POLICY,
    ACTOR_ID,
    GENERATED_AT,
    selectedTask,
    taskReasons,
    buildAudit,
    writeArtifacts
};
