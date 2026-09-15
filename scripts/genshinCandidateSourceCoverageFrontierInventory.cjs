"use strict";

/**
 * Evidence-only coverage inventory for the still-open Genshin v2 candidate
 * frontier.  The authoritative queue is the scope source; transition
 * snapshots are used only as materialized, correlated entity evidence.  This
 * script never fetches a provider, interprets a value, issues a certificate,
 * promotes a canonical record, or marks a candidate search-exhausted.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { digestStable, stableValue } = require("./genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const v2Root = path.join(dataRoot, "v2");
const transitionRoot = path.join(v2Root, "version-transitions", "6.7-to-7.0");

const paths = Object.freeze({
    queue: path.join(repositoryRoot, "reports", "genshin-evidence-task-queue.json"),
    providerPolicy: path.join(v2Root, "provider-independence-policy.json"),
    sourceFamilyRegistry: path.join(v2Root, "source-family-registry.json"),
    sourceSearch: path.join(transitionRoot, "source-search.json"),
    sourceFrontiers: path.join(v2Root, "source-search-frontiers.json"),
    behaviorPilot: path.join(v2Root, "characters", "behavior-pilot.json"),
    behaviorExternal: path.join(v2Root, "characters", "external-field-evidence.json"),
    weaponSpecs: path.join(v2Root, "weapons", "spec-candidates.json"),
    weaponExternal: path.join(v2Root, "weapons", "external-evidence.json"),
    weaponIndependent: path.join(v2Root, "weapons", "independent-field-evidence.json"),
    weaponStatReview: path.join(v2Root, "review-pilots", "weapon-12516-stat.json"),
    identityBridge: path.join(transitionRoot, "identity-bridge-10000124-snapshot.json"),
    artifact: path.join(v2Root, "candidate-source-coverage-frontier-inventory.json"),
    reportJson: path.join(repositoryRoot, "reports", "genshin-candidate-source-coverage-frontier-inventory.json"),
    schema: path.join(dataRoot, "schema", "candidate-source-coverage-frontier-inventory.schema.json")
});

const generatedAt = "2026-08-28T00:00:00.000Z";
const transitionId = "genshin:6.7->7.0";
const targetGameVersion = "7.0";
const behaviorShardCluster = "source-unlock:behavior:behaviorSpec:semanticDecisionRequired:standard";
const weaponShardCluster = "source-unlock:weapons:weaponEffectSpec:sourceMissing:standard";

// These are the finite provider surfaces already recorded in the transition
// search ledger.  They are intentionally kept separate from candidate field
// coverage: inspecting a provider surface does not mean that any of the 1,914
// candidate claims was found, compared, or exhausted.
const providerLookupTargets = Object.freeze([
    { id: "gcsim-exact-7.0-provider-manifest", provider: "genshinsim/gcsim" },
    { id: "kqm-exact-7.0-field-manifest", provider: "KQM Theorycrafting Library" },
    { id: "gachabase-independent-lineage-and-versioned-fields", provider: "Gachabase" },
    { id: "official-hoyowiki-hoyolab-field-capture", provider: "HoYoverse HoYoWiki / HoYoLAB" },
    { id: "teyvatguide-version-and-lineage-artifact", provider: "BTMuli/TeyvatGuide" },
    { id: "yatta-version-hash-binding", provider: "Yatta API" },
    { id: "genshin-optimizer-independent-lineage", provider: "Genshin Optimizer" }
]);

function normalizedProviderName(value) {
    return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function providerSurfaceMatches(targetProvider, inspectedProvider) {
    const target = normalizedProviderName(targetProvider);
    const inspected = normalizedProviderName(inspectedProvider);
    if (!target || !inspected) return false;
    if (target === inspected || inspected.includes(target) || target.includes(inspected)) return true;
    // The official surface is recorded under two provider rows in the search
    // ledger (HoYoWiki and HoYoLAB).  Treat that as one inspected surface for
    // lookup-boundary purposes, while retaining both names in the evidence.
    if (target.includes("hoyowiki") || target.includes("hoyolab")) {
        return inspected.includes("hoyowiki") || inspected.includes("hoyolab");
    }
    if (target.includes("kqm")) return inspected.includes("kqm");
    if (target.includes("teyvatguide")) return inspected.includes("teyvatguide");
    if (target.includes("gachabase")) return inspected.includes("gachabase");
    if (target.includes("gcsim")) return inspected.includes("gcsim");
    if (target.includes("optimizer")) return inspected.includes("optimizer");
    if (target.includes("yatta")) return inspected.includes("yatta");
    return false;
}

function deriveProviderSurfaceInspection(sourceSearch) {
    const rows = Array.isArray(sourceSearch?.providersExamined) ? sourceSearch.providersExamined : [];
    const inspected = rows
        .filter((row) => row && typeof row === "object")
        .map((row) => ({
            provider: row.provider ?? null,
            evidenceRef: row.evidenceRef ?? null,
            result: row.result ?? null
        }))
        .filter((row) => row.provider);
    const targetCoverage = providerLookupTargets.map((target) => {
        const matched = inspected.filter((row) => providerSurfaceMatches(target.provider, row.provider));
        return {
            targetId: target.id,
            provider: target.provider,
            matchedProviders: uniqueSorted(matched.map((row) => row.provider)),
            evidenceRefs: uniqueSorted(matched.map((row) => row.evidenceRef).filter(Boolean)),
            inspected: matched.length > 0,
            inspectedWithEvidence: matched.some((row) => row.evidenceRef && row.result)
        };
    });
    const ledgerComplete = typeof sourceSearch?.searchScope === "string"
        && sourceSearch.searchScope.length > 0
        && typeof sourceSearch?.lastSearchedAt === "string"
        && sourceSearch.lastSearchedAt.length > 0
        && sourceSearch?.searchExhausted === false
        && inspected.length > 0
        && inspected.every((row) => row.evidenceRef && row.result);
    const allTargetsInspected = targetCoverage.every((row) => row.inspectedWithEvidence);
    const triggerObserved = sourceSearch?.newProviderReleaseManifestLineageTriggerObservedInPersistedInputs === true;
    const providerSurfaceLookupExecutableNow = !(ledgerComplete && allTargetsInspected && !triggerObserved);
    return {
        ledgerComplete,
        allTargetsInspected,
        triggerObserved,
        providerSurfaceLookupExecutableNow,
        targetCoverage,
        inspectedProviderCount: inspected.length,
        inspectedProviders: uniqueSorted(inspected.map((row) => row.provider))
    };
}

function aggregateLookupAvailability(values) {
    const normalized = values.filter((value) => value === true || value === false || value === null);
    if (!normalized.length || normalized.some((value) => value === null)) return null;
    return normalized.every((value) => value === true) ? true : normalized.every((value) => value === false) ? false : null;
}

function deriveCandidateSourceLookupState(task) {
    const frontier = task?.searchFrontier || {};
    if (frontier.status === "searchRequired") {
        return {
            status: "lookupRequired",
            executableNow: null,
            reopenOnTriggerOnly: false,
            reason: "authoritative queue marks this candidate searchRequired; no candidate-scoped qualifying field artifact is materialized, so execution availability is unknown until a bounded source task is selected"
        };
    }
    if (frontier.status === "searchExhausted" && frontier.exhausted === true && frontier.scopeMatched === true && frontier.policyId) {
        return {
            status: "reopenOnTriggerOnly",
            executableNow: false,
            reopenOnTriggerOnly: true,
            reason: "authoritative queue carries a complete candidate-scoped exhausted frontier; reopen only on its recorded trigger"
        };
    }
    return {
        status: "unknown",
        executableNow: null,
        reopenOnTriggerOnly: false,
        reason: "candidate source availability cannot be derived from a complete candidate-scoped frontier"
    };
}

const behaviorSnapshotNames = [
    "behavior-entity-snapshot.json",
    ...Array.from({ length: 15 }, (_, index) => `behavior-shard-${String(index + 2).padStart(2, "0")}-snapshot.json`)
];
const weaponSnapshotNames = [
    "weapon-entity-snapshot.json",
    "weapon-entity-snapshot-shard02.json",
    "weapon-entity-snapshot-shard03.json",
    "weapon-entity-snapshot-shard04.json"
];

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sha256(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function sha1GitBlob(bytes) {
    const header = Buffer.from(`blob ${bytes.length}\0`, "utf8");
    return crypto.createHash("sha1").update(Buffer.concat([header, bytes])).digest("hex");
}

function relativePath(file) {
    return path.relative(repositoryRoot, file).replaceAll("\\", "/");
}

function stableJson(value) {
    return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function naturalCompare(left, right) {
    return String(left).localeCompare(String(right), "en", { numeric: true });
}

function uniqueSorted(values) {
    return [...new Set((values || [])
        .filter((value) => value !== undefined && value !== null)
        .map(String))].sort(naturalCompare);
}

function countBy(values) {
    const result = {};
    for (const value of values) {
        const key = String(value ?? "<null>");
        result[key] = (result[key] || 0) + 1;
    }
    return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function fileIntegrity(file) {
    if (!file || !fs.existsSync(file)) return { exists: false, bytes: 0, sha256: null };
    const bytes = fs.readFileSync(file);
    return { exists: true, bytes: bytes.length, sha256: sha256(bytes) };
}

function inputRef(file) {
    return { path: relativePath(file), ...fileIntegrity(file) };
}

function normalizeRecord(value) {
    if (Array.isArray(value)) return value.map(normalizeRecord);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalizeRecord(value[key])]));
    }
    if (typeof value === "string") return value.replaceAll("\r\n", "\n");
    return value;
}

function normalizedDigest(value) {
    return digestStable(normalizeRecord(value));
}

function withoutDigest(value) {
    const result = clone(value);
    if (result && typeof result === "object") {
        delete result.fieldDigest;
        delete result.fieldDigestAlgorithm;
    }
    return result;
}

function queueTaskProjection(task) {
    if (!task || typeof task !== "object") return null;
    return {
        candidateId: task.candidateId ?? null,
        layer: task.layer ?? null,
        dataset: task.dataset ?? null,
        terminalState: task.terminalState ?? null,
        primaryBlockReason: task.primaryBlockReason ?? null,
        blockReasons: clone(task.blockReasons || []),
        task: {
            taskId: task.task?.taskId ?? null,
            kind: task.task?.kind ?? null,
            status: task.task?.status ?? null,
            reason: task.task?.reason ?? null,
            autoProcessableNow: task.task?.autoProcessableNow === true
        },
        searchFrontier: {
            status: task.searchFrontier?.status ?? null,
            exhausted: task.searchFrontier?.exhausted === true,
            policyId: task.searchFrontier?.policyId ?? null,
            scopeMatched: task.searchFrontier?.scopeMatched ?? null,
            scopeUnit: task.searchFrontier?.scopeUnit ?? null,
            blockingReasons: clone(task.searchFrontier?.blockingReasons || [])
        },
        bulkTransitionCapture: task.bulkTransitionCapture ? {
            status: task.bulkTransitionCapture.status ?? null,
            evidenceRef: task.bulkTransitionCapture.evidenceRef ?? null,
            sourceFamily: task.bulkTransitionCapture.sourceFamily ?? null,
            certificateEligible: task.bulkTransitionCapture.certificateEligible === true
        } : null,
        mappingStatus: task.mappingStatus ?? null,
        consumerStatus: task.consumerStatus ?? null,
        machineEvidenceReady: task.machineEvidenceReady === true,
        autoProcessableNow: task.autoProcessableNow === true
    };
}

function selectTargets(queue) {
    const tasks = Array.isArray(queue?.tasks) ? queue.tasks : [];
    const processedCoverageFrontiers = new Set([
        "genshin-7.0-behavior-spec-shard01-persisted-provider-frontier",
        "weapons-primary-numeric-shard01-independent-field-frontier-7.0",
        "genshin-7.0-behavior-spec-shard02-persisted-provider-frontier",
        "weapons-primary-numeric-shard02-independent-field-frontier-7.0",
        "genshin-7.0-behavior-spec-shard03-persisted-provider-frontier",
        "weapons-primary-numeric-shard03-independent-field-frontier-7.0",
        "genshin-7.0-behavior-spec-shard04-persisted-provider-frontier",
        "weapons-primary-numeric-shard04-independent-field-frontier-7.0",
        "genshin-7.0-behavior-spec-shard05-persisted-provider-frontier",
        "genshin-7.0-behavior-spec-shard06-persisted-provider-frontier"
    ]);
    const inCoverageScope = (task) => task?.searchFrontier?.status === "searchRequired"
        || processedCoverageFrontiers.has(task?.searchFrontier?.frontierId);
    const behavior = tasks
        .filter((task) => task?.layer === "behaviorSpec" && inCoverageScope(task))
        .map((task) => ({ task, layer: "behaviorSpec", dataset: "behavior", candidateId: String(task.candidateId) }));
    const weapons = tasks
        .filter((task) => task?.layer === "weaponEffectSpec"
            && task?.primaryBlockReason === "sourceMissing"
            && inCoverageScope(task))
        .map((task) => ({ task, layer: "weaponEffectSpec", dataset: "weapons", candidateId: String(task.candidateId) }));
    return [...behavior, ...weapons].sort((a, b) => naturalCompare(a.candidateId, b.candidateId));
}

function buildShardIndex(queue) {
    const index = new Map();
    for (const cluster of queue?.unlockClusters || []) {
        for (const shard of cluster?.shards || []) {
            for (const candidateId of shard?.candidateIds || []) {
                const id = String(candidateId);
                const previous = index.get(id) || [];
                previous.push({
                    clusterId: cluster.clusterId ?? null,
                    shardId: shard.shardId ?? null,
                    candidateIds: uniqueSorted(shard.candidateIds || [])
                });
                index.set(id, previous);
            }
        }
    }
    return index;
}

function loadLocalInputs() {
    const localSpecs = new Map();
    const localSources = new Map();
    const inputFiles = [];

    function addSourceFile(file, payload) {
        inputFiles.push(file);
        for (const [id, source] of Object.entries(payload || {})) {
            if (!localSources.has(id)) localSources.set(id, { source, file });
        }
    }

    function addSpecFile(file, payload) {
        inputFiles.push(file);
        for (const [id, spec] of Object.entries(payload || {})) {
            if (!localSpecs.has(id)) localSpecs.set(id, { spec, file });
        }
    }

    const pilot = readJson(paths.behaviorPilot);
    inputFiles.push(paths.behaviorPilot);
    for (const [id, spec] of Object.entries(pilot.specs || {})) {
        if (!localSpecs.has(id)) localSpecs.set(id, { spec, file: paths.behaviorPilot });
    }
    addSourceFile(paths.behaviorPilot, pilot.sourceRecords || {});
    for (let batch = 1; batch <= 12; batch += 1) {
        const directory = path.join(v2Root, "characters", `behavior-batch-${batch}`);
        const specFile = path.join(directory, "spec-candidates.json");
        const sourceFile = path.join(directory, "source-records.json");
        if (fs.existsSync(specFile)) addSpecFile(specFile, readJson(specFile));
        if (fs.existsSync(sourceFile)) addSourceFile(sourceFile, readJson(sourceFile));
    }

    addSpecFile(paths.weaponSpecs, readJson(paths.weaponSpecs));
    addSourceFile(path.join(v2Root, "weapons", "source-records.json"), readJson(path.join(v2Root, "weapons", "source-records.json")));
    return { localSpecs, localSources, inputFiles: uniqueSorted(inputFiles) };
}

function localSourceSummary(sourceId, entry) {
    if (!entry || !entry.source) return { id: sourceId, present: false, rawTextPresent: false, rawDigestMatches: false };
    const source = entry.source;
    const rawTextPresent = typeof source.text === "string";
    const observedDigest = rawTextPresent ? sha256(Buffer.from(source.text, "utf8")) : null;
    const declaredDigest = source.integrity?.algorithm === "sha256" ? source.integrity.digest : null;
    return {
        id: sourceId,
        present: true,
        path: relativePath(entry.file),
        provider: source.provider ?? null,
        independenceGroup: source.independenceGroup ?? null,
        providerIndependence: source.providerIndependence ?? null,
        gameVersion: source.gameVersion ?? null,
        rawTextPresent,
        declaredRawDigest: declaredDigest,
        observedRawDigest: observedDigest,
        rawDigestMatches: Boolean(rawTextPresent && declaredDigest && declaredDigest === observedDigest),
        locator: clone(source.locator ?? null)
    };
}

function localEvidence(candidate, localInputs) {
    const found = localInputs.localSpecs.get(candidate.candidateId);
    const spec = found?.spec || null;
    const sourceRefs = uniqueSorted(spec?.sourceRefs || []);
    const sourceSummaries = sourceRefs.map((id) => localSourceSummary(id, localInputs.localSources.get(id)));
    const resolved = sourceSummaries.filter((source) => source.present).length;
    const rawVerified = sourceSummaries.filter((source) => source.rawDigestMatches).length;
    const claimFields = uniqueSorted(Object.keys(spec?.verification?.claims || {}));
    return {
        spec: {
            path: found ? relativePath(found.file) : null,
            exists: Boolean(found),
            candidateFound: Boolean(spec),
            id: spec?.id ?? null,
            file: found ? fileIntegrity(found.file) : null
        },
        entity: clone(spec?.entity ?? null),
        sourceRefs,
        sourceRefDigest: digestStable(sourceRefs),
        sourceRefCount: sourceRefs.length,
        resolvedSourceRefCount: resolved,
        rawDigestVerifiedCount: rawVerified,
        allSourceRefsResolved: resolved === sourceSummaries.length,
        allSourceRawDigestsVerified: sourceSummaries.length > 0 && rawVerified === sourceSummaries.length,
        sourceSummaries,
        claimFields,
        evidenceClass: "localDatasetCorrelatedMetadataOnly",
        acceptedAsIndependentProof: false
    };
}

function declaredArtifactMeta(meta) {
    return {
        bytes: Number.isInteger(meta?.rawArtifactBytes) ? meta.rawArtifactBytes : null,
        sha256: meta?.rawArtifactSha256 ?? meta?.rawArtifactDigest ?? null,
        gitBlob: meta?.gitBlob ?? meta?.blobSha ?? null,
        normalizedDigest: meta?.normalizedRecordDigest ?? null,
        embeddedId: meta?.embeddedId ?? null,
        embeddedName: meta?.embeddedName ?? null
    };
}

function readObservedArtifact(file) {
    if (!fs.existsSync(file)) {
        return { exists: false, bytes: 0, sha256: null, gitBlob: null, normalizedDigest: null, parseStatus: "missing", embeddedId: null, embeddedName: null };
    }
    const bytes = fs.readFileSync(file);
    let parsed = null;
    let parseStatus = "validJson";
    try {
        parsed = JSON.parse(bytes.toString("utf8"));
    } catch {
        parseStatus = "invalidJson";
    }
    return {
        exists: true,
        bytes: bytes.length,
        sha256: sha256(bytes),
        gitBlob: sha1GitBlob(bytes),
        normalizedDigest: parsed === null ? null : normalizedDigest(parsed),
        parseStatus,
        embeddedId: parsed && typeof parsed === "object" ? (parsed.id ?? null) : null,
        embeddedName: parsed && typeof parsed === "object" ? (parsed.name ?? null) : null
    };
}

function artifactIntegrityStatus(declared, observed) {
    if (!observed.exists) return "missing";
    if (observed.parseStatus !== "validJson") return "mismatch";
    const checks = [
        [declared.bytes, observed.bytes],
        [declared.sha256, observed.sha256],
        [declared.gitBlob, observed.gitBlob]
    ];
    if (declared.normalizedDigest) checks.push([declared.normalizedDigest, observed.normalizedDigest]);
    if (checks.some(([expected, actual]) => expected !== null && expected !== actual)) return "mismatch";
    if (declared.embeddedId !== null && String(declared.embeddedId) !== String(observed.embeddedId)) return "mismatch";
    if (declared.embeddedName !== null && declared.embeddedName !== observed.embeddedName) return "mismatch";
    // A locally observed file is not a pinned source artifact unless the
    // snapshot declares all three immutable raw identity fields.  Null
    // declarations must never be promoted to a false "verified" status.
    if (declared.bytes === null || !declared.sha256 || !declared.gitBlob) return "observedUnbound";
    return "verified";
}

function makeSourceArtifact({ meta, file, snapshotPath, provider, sourceFamily, evidenceKind, side, entityId, recordKind, variant }) {
    const declared = declaredArtifactMeta(meta);
    const observed = readObservedArtifact(file);
    const idPrefix = evidenceKind === "versionManifest" ? "transition-version-manifest:" : "transition-raw:";
    return {
        id: `${idPrefix}${relativePath(file)}`,
        evidenceKind,
        provider: provider ?? null,
        sourceFamily: sourceFamily ?? null,
        providerPath: meta?.path ?? null,
        url: meta?.url ?? null,
        path: relativePath(file),
        gameVersion: meta?.gameVersion ?? null,
        revision: meta?.revision ?? null,
        packageVersion: meta?.packageVersion ?? null,
        declared,
        observed,
        integrityStatus: artifactIntegrityStatus(declared, observed),
        versionBindingObserved: Boolean(meta?.gameVersion && meta?.revision),
        embeddedIdentity: {
            declaredId: declared.embeddedId,
            declaredName: declared.embeddedName,
            observedId: observed.embeddedId,
            observedName: observed.embeddedName,
            declarationMatchesObserved: Boolean(
                (declared.embeddedId === null || String(declared.embeddedId) === String(observed.embeddedId))
                && (declared.embeddedName === null || declared.embeddedName === observed.embeddedName)
            )
        },
        references: [{
            snapshotPath,
            side: side ?? null,
            entityId: entityId ?? null,
            recordKind: recordKind ?? null,
            variant: variant ?? null
        }]
    };
}

function mergeSourceArtifact(map, artifact) {
    const existing = map.get(artifact.id);
    if (!existing) {
        map.set(artifact.id, artifact);
        return;
    }
    existing.references.push(...artifact.references);
    existing.references = existing.references
        .sort((a, b) => stableJson(a).localeCompare(stableJson(b)))
        .filter((reference, index, all) => index === 0 || stableJson(reference) !== stableJson(all[index - 1]));
}

function snapshotInfo(file, snapshot) {
    const fileData = fileIntegrity(file);
    const declaredFieldDigest = snapshot?.fieldDigest ?? null;
    const observedFieldDigest = snapshot?.claim ? digestStable(snapshot.claim) : null;
    return {
        id: `transition-snapshot:${relativePath(file)}`,
        path: relativePath(file),
        kind: snapshot?.kind ?? null,
        file: fileData,
        fieldDigestAlgorithm: snapshot?.fieldDigestAlgorithm ?? null,
        declaredFieldDigest,
        observedFieldDigest,
        fieldDigestMatches: Boolean(declaredFieldDigest && declaredFieldDigest === observedFieldDigest),
        transitionId: snapshot?.claim?.transitionId ?? null,
        provider: snapshot?.claim?.provider ?? null,
        sourceFamily: snapshot?.claim?.sourceFamily ?? null,
        shardId: snapshot?.claim?.shard?.shardId ?? null,
        queueShardId: snapshot?.claim?.queueShard?.shardId ?? null,
        overlapEntityIds: uniqueSorted(snapshot?.claim?.shard?.skippedOverlapEntityIds || []),
        resolvedEntityIds: uniqueSorted(snapshot?.claim?.coverage?.resolvedEntityIds || []),
        ambiguousEntityIds: uniqueSorted(snapshot?.claim?.coverage?.ambiguousEntityIds || []),
        unresolvedEntityIds: uniqueSorted((snapshot?.claim?.unresolvedEntities || []).map((entity) => entity?.entityId))
    };
}

function loadTransitionEvidence() {
    const sourceArtifacts = new Map();
    const snapshotInputs = [];
    const entityIndex = new Map();
    const entityIdentity = new Map();
    const snapshotFiles = [
        ...behaviorSnapshotNames.map((name) => ({ name, domain: "behavior", type: "behavior" })),
        ...weaponSnapshotNames.map((name) => ({ name, domain: "weapon", type: "weapon" }))
    ];

    function addEntityEntry(key, entry) {
        const all = entityIndex.get(key) || [];
        const fingerprint = stableJson({ snapshotPath: entry.snapshotPath, recordKind: entry.recordKind, variant: entry.variant, before: entry.beforeArtifactId, after: entry.afterArtifactId });
        if (!all.some((item) => item.fingerprint === fingerprint)) all.push({ ...entry, fingerprint });
        entityIndex.set(key, all);
    }

    for (const descriptor of snapshotFiles) {
        const file = path.join(transitionRoot, descriptor.name);
        if (!fs.existsSync(file)) continue;
        const snapshot = readJson(file);
        const info = snapshotInfo(file, snapshot);
        snapshotInputs.push(info);
        const claim = snapshot.claim || {};
        const provider = claim.provider ?? null;
        const sourceFamily = claim.sourceFamily ?? null;
        const snapshotPath = relativePath(file);

        function addRecord(entityId, recordKind, record, variant = null) {
            // Behavior snapshots store the raw artifact metadata directly;
            // weapon entity snapshots wrap it in `before.artifact` and
            // `after.artifact`.  Normalize that structural difference before
            // recomputing the bytes/digests.
            const before = record?.before?.artifact ?? record?.before;
            const after = record?.after?.artifact ?? record?.after;
            const beforeFile = before?.path ? path.resolve(repositoryRoot, before.path) : null;
            const afterFile = after?.path ? path.resolve(repositoryRoot, after.path) : null;
            const beforeArtifact = beforeFile && before ? makeSourceArtifact({
                meta: before,
                file: beforeFile,
                snapshotPath,
                provider,
                sourceFamily,
                evidenceKind: "transitionEntityRawRecord",
                side: "before",
                entityId,
                recordKind,
                variant
            }) : null;
            const afterArtifact = afterFile && after ? makeSourceArtifact({
                meta: after,
                file: afterFile,
                snapshotPath,
                provider,
                sourceFamily,
                evidenceKind: "transitionEntityRawRecord",
                side: "after",
                entityId,
                recordKind,
                variant
            }) : null;
            if (beforeArtifact) mergeSourceArtifact(sourceArtifacts, beforeArtifact);
            if (afterArtifact) mergeSourceArtifact(sourceArtifacts, afterArtifact);
            addEntityEntry(`${descriptor.domain}:${String(entityId)}:${recordKind}`, {
                snapshotPath,
                snapshotId: info.id,
                snapshotShardId: info.shardId || info.queueShardId || null,
                recordKind,
                variant,
                beforeArtifactId: beforeArtifact?.id ?? null,
                afterArtifactId: afterArtifact?.id ?? null,
                comparison: clone(record?.comparison ?? null),
                identityStatus: entityIdentity.get(`${descriptor.domain}:${String(entityId)}`) ?? "unknown"
            });
        }

        if (descriptor.type === "behavior") {
            for (const entity of claim.resolvedEntities || []) {
                const entityId = String(entity.entityId);
                entityIdentity.set(`behavior:${entityId}`, entity.resolutionStatus || "resolved");
                for (const record of entity.records || []) addRecord(entityId, record.recordKind, record, null);
            }
            const ambiguousIds = (claim.variantAmbiguities || []).map((item) => String(item.entityId));
            for (const entityId of ambiguousIds) entityIdentity.set(`behavior:${entityId}`, "unresolvedVariantAmbiguity");
            for (const variant of claim.travelerVariantEvidence || []) {
                for (const entityId of ambiguousIds) {
                    for (const record of variant.records || []) addRecord(entityId, record.recordKind, record, variant.variant || null);
                }
            }
            for (const entity of claim.unresolvedEntities || []) {
                entityIdentity.set(`behavior:${String(entity.entityId)}`, entity.resolutionStatus || "unresolved");
            }
        } else {
            for (const record of claim.records || []) {
                const entityId = String(record.entityId);
                entityIdentity.set(`weapon:${entityId}`, "resolvedEntityRecord");
                addRecord(entityId, "weaponEntity", record, null);
            }
        }

        for (const binding of claim.versionBindings || []) {
            const packageMeta = binding.package;
            if (!packageMeta?.path) continue;
            const packageFile = path.resolve(repositoryRoot, packageMeta.path);
            mergeSourceArtifact(sourceArtifacts, makeSourceArtifact({
                meta: packageMeta,
                file: packageFile,
                snapshotPath,
                provider,
                sourceFamily,
                evidenceKind: "versionManifest",
                side: null,
                entityId: null,
                recordKind: null,
                variant: null
            }));
        }
    }
    return {
        sourceArtifacts,
        snapshotInputs,
        entityIndex,
        entityIdentity,
        snapshotInfoByPath: new Map(snapshotInputs.map((info) => [info.path, info])),
        snapshotByShardId: new Map(snapshotInputs
            .filter((info) => info.shardId || info.queueShardId)
            .map((info) => [info.shardId || info.queueShardId, info.path]))
    };
}

function rawEvidenceRef(meta, file) {
    if (!meta || !file) return null;
    const observed = readObservedArtifact(file);
    const declared = declaredArtifactMeta(meta);
    return {
        path: relativePath(file),
        providerPath: meta.providerPath ?? meta.path ?? null,
        gameVersion: meta.gameVersion ?? null,
        revision: meta.revision ?? null,
        packageVersion: meta.packageVersion ?? null,
        declared,
        observed,
        integrityStatus: artifactIntegrityStatus(declared, observed)
    };
}

function textEvidenceRef(meta, file) {
    if (!meta || !file) return null;
    const observed = fs.existsSync(file)
        ? (() => {
            const bytes = fs.readFileSync(file);
            return { exists: true, bytes: bytes.length, sha256: sha256(bytes), gitBlob: sha1GitBlob(bytes) };
        })()
        : { exists: false, bytes: 0, sha256: null, gitBlob: null };
    const declared = {
        bytes: Number.isInteger(meta.rawArtifactBytes) ? meta.rawArtifactBytes : null,
        sha256: meta.rawArtifactSha256 ?? null,
        gitBlob: meta.gitBlob ?? null
    };
    const status = !observed.exists ? "missing"
        : (declared.bytes !== null && declared.bytes !== observed.bytes)
            || (declared.sha256 && declared.sha256 !== observed.sha256)
            || (declared.gitBlob && declared.gitBlob !== observed.gitBlob)
            ? "mismatch"
            : (!declared.bytes || !declared.sha256 || !declared.gitBlob ? "observedUnbound" : "verified");
    return { path: relativePath(file), declared, observed, integrityStatus: status };
}

function bridgeTreeResponseRef(treeResponse, file) {
    if (!treeResponse || !file) return null;
    const observed = fileIntegrity(file);
    const declared = {
        bytes: Number.isInteger(treeResponse.rawArtifactBytes) ? treeResponse.rawArtifactBytes : null,
        sha256: treeResponse.rawArtifactSha256 ?? null,
        gitBlob: treeResponse.gitBlob ?? null
    };
    const status = !observed.exists ? "missing"
        : (declared.bytes !== null && declared.bytes !== observed.bytes)
            || (declared.sha256 && declared.sha256 !== observed.sha256)
            || (declared.gitBlob && declared.gitBlob !== observed.sha256 && declared.gitBlob !== sha1GitBlob(fs.readFileSync(file)))
            ? "mismatch"
            : (!declared.bytes || !declared.sha256 || !declared.gitBlob ? "observedUnbound" : "verified");
    return {
        path: relativePath(file),
        requestedUrl: treeResponse.url ?? null,
        declared,
        observed,
        integrityStatus: status
    };
}

function buildIdentityBridgeEvidence() {
    if (!fs.existsSync(paths.identityBridge)) return null;
    const snapshot = readJson(paths.identityBridge);
    const claim = snapshot.claim || {};
    const snapshotFile = fileIntegrity(paths.identityBridge);
    const snapshotFieldDigest = snapshot.fieldDigest ? digestStable(claim) : null;
    const rawArtifacts = [];
    const treeResponses = [];
    for (const [side, revision] of Object.entries(claim.revisions || {})) {
        for (const record of revision.localizedRecords || []) {
            if (record.artifact?.path) {
                const ref = rawEvidenceRef(record.artifact, path.resolve(repositoryRoot, record.artifact.path));
                if (ref) rawArtifacts.push({ ...ref, side, language: "Japanese", recordKind: record.recordKind });
            }
        }
        for (const record of revision.englishLinkage?.records || []) {
            if (record.localPath) {
                const ref = rawEvidenceRef({
                    gameVersion: revision.gameVersion,
                    revision: revision.revision,
                    packageVersion: revision.packageVersion,
                    path: record.localPath,
                    providerPath: record.providerPath,
                    rawArtifactBytes: record.rawArtifactBytes,
                    rawArtifactSha256: record.rawArtifactSha256,
                    gitBlob: record.gitBlob,
                    embeddedId: record.embeddedId,
                    embeddedName: record.embeddedName
                }, path.resolve(repositoryRoot, record.localPath));
                if (ref) rawArtifacts.push({ ...ref, side, language: "English", recordKind: record.recordKind });
            }
        }
        const packageMeta = revision.versionBinding?.package;
        if (packageMeta?.path) {
            const ref = rawEvidenceRef(packageMeta, path.resolve(repositoryRoot, packageMeta.path));
            if (ref) rawArtifacts.push({ ...ref, side, language: null, recordKind: "versionManifest" });
        }
        for (const tree of Object.values(revision.treeResolution?.trees || {})) {
            if (tree.finalResponse?.path) {
                const ref = bridgeTreeResponseRef(tree.finalResponse, path.resolve(repositoryRoot, tree.finalResponse.path));
                if (ref) treeResponses.push({ ...ref, side, recordKind: tree.recordKind, stage: "final" });
            }
            for (const step of tree.steps || []) {
                if (step.rawResponse?.path) {
                    const ref = bridgeTreeResponseRef(step.rawResponse, path.resolve(repositoryRoot, step.rawResponse.path));
                    if (ref) treeResponses.push({ ...ref, side, recordKind: tree.recordKind, stage: step.segment });
                }
            }
        }
    }
    const negativeAliasEvidence = (claim.negativeAliasEvidence?.records || []).map((record) => {
        const file = record.path ? path.resolve(repositoryRoot, record.path) : null;
        return {
            gameVersion: record.gameVersion ?? null,
            revision: record.revision ?? null,
            recordKind: record.recordKind ?? null,
            slug: record.slug ?? null,
            status: record.status ?? null,
            evidence: textEvidenceRef(record, file)
        };
    });
    const identityBridgeProven = snapshot.status === "identityBridgeProven"
        && snapshotFieldDigest === snapshot.fieldDigest
        && claim.identityBridge?.canUseForIdentityReconciliation === true
        && rawArtifacts.filter((artifact) => artifact.language === "Japanese" && artifact.recordKind !== "versionManifest").every((artifact) => artifact.integrityStatus === "verified")
        && rawArtifacts.filter((artifact) => artifact.language === "English" && artifact.recordKind !== "versionManifest").every((artifact) => artifact.integrityStatus === "verified");
    return {
        snapshot: {
            path: relativePath(paths.identityBridge),
            file: snapshotFile,
            declaredFieldDigest: snapshot.fieldDigest ?? null,
            observedFieldDigest: snapshotFieldDigest,
            fieldDigestMatches: Boolean(snapshot.fieldDigest && snapshot.fieldDigest === snapshotFieldDigest),
            status: snapshot.status ?? null
        },
        entity: clone(claim.entity ?? null),
        status: claim.identityBridge?.status ?? null,
        provider: claim.provider ?? null,
        sourceFamily: claim.sourceFamily ?? null,
        evidenceBasis: claim.identityBridge?.evidenceBasis ?? null,
        identityBridgeProven,
        rawArtifacts: rawArtifacts.sort((a, b) => naturalCompare(a.path, b.path)),
        treeResponses: treeResponses.sort((a, b) => naturalCompare(a.path, b.path)),
        negativeAliasEvidence,
        negativeAliasEvidenceCount: negativeAliasEvidence.length,
        use: "identityOnlyNotMechanicVerification",
        certificateEligible: false,
        canonicalPromotionEligible: false
    };
}

function transitionEvidenceForCandidate(candidate, transition, identityBridge = null) {
    const entityId = candidate.candidateId.split(candidate.layer === "behaviorSpec" ? ":" : "_")[1];
    const recordKind = candidate.layer === "behaviorSpec"
        ? (candidate.candidateId.split(":")[2] === "talent" ? "talents" : "constellations")
        : "weaponEntity";
    const key = `${candidate.dataset === "behavior" ? "behavior" : "weapon"}:${entityId}:${recordKind}`;
    const allEntries = transition.entityIndex.get(key) || [];
    const currentShardId = candidate.shard?.shardId ?? null;
    const domain = candidate.dataset === "behavior" ? "behavior" : "weapon";
    const baseShardId = domain === "behavior"
        ? "behavior:behaviorSpec:semanticDecisionRequired:standard:01"
        : "weapons:weaponEffectSpec:sourceMissing:standard:01";
    const allowedSnapshotPath = currentShardId
        ? transition.snapshotByShardId.get(currentShardId) || (currentShardId === baseShardId
            ? transition.snapshotInputs.find((info) => info.path.endsWith(domain === "behavior" ? "/behavior-entity-snapshot.json" : "/weapon-entity-snapshot.json"))?.path
            : null)
        : null;
    let entries = allowedSnapshotPath
        ? allEntries.filter((entry) => entry.snapshotPath === allowedSnapshotPath)
        : allEntries;
    // A shard may deliberately skip an entity already captured by the prior
    // shard.  Reuse that exact prior entity record only for an explicit
    // overlap marker; never borrow a different shard's alternate identity.
    if (!entries.length && allowedSnapshotPath
        && transition.snapshotInfoByPath.get(allowedSnapshotPath)?.overlapEntityIds.includes(entityId)) {
        entries = allEntries.filter((entry) => entry.snapshotPath !== allowedSnapshotPath);
    }
    if (!entries.length && identityBridge?.identityBridgeProven
        && String(identityBridge.entity?.entityId) === String(entityId)) {
        // The localized bridge proves the shard-14 `yafoda` alias and points
        // to the already captured shard-15 `jahoda` raw records.  Reuse is
        // identity-only: this does not create an independent source family.
        entries = allEntries.filter((entry) => entry.snapshotPath.includes("behavior-shard-15-snapshot.json"));
    }
    entries = entries.map((entry) => ({ ...entry }));
    const sourceArtifactIds = uniqueSorted(entries.flatMap((entry) => [entry.beforeArtifactId, entry.afterArtifactId]));
    const snapshotRefs = uniqueSorted(entries.map((entry) => entry.snapshotPath));
    const allowedInfo = allowedSnapshotPath ? transition.snapshotInfoByPath.get(allowedSnapshotPath) : null;
    let identityStatus = transition.entityIdentity.get(`${candidate.dataset === "behavior" ? "behavior" : "weapon"}:${entityId}`) || "missingFromSnapshots";
    if (allowedInfo?.unresolvedEntityIds.includes(entityId)) identityStatus = "unresolvedProviderRecord";
    else if (allowedInfo?.ambiguousEntityIds.includes(entityId)) identityStatus = "unresolvedVariantAmbiguity";
    if (identityBridge?.identityBridgeProven && String(identityBridge.entity?.entityId) === String(entityId)) {
        identityStatus = "identityReconciledByLocalizedBridge";
    }
    const exactFieldEvidence = false;
    return {
        entityId,
        recordKind,
        identityStatus,
        status: entries.length ? "entityRecordCaptured" : identityStatus === "unresolvedProviderRecord" ? "identityUnresolved" : "missing",
        sourceArtifactIds,
        snapshotRefs,
        recordCount: entries.length,
        versionSides: {
            before: entries.some((entry) => Boolean(entry.beforeArtifactId)),
            after: entries.some((entry) => Boolean(entry.afterArtifactId))
        },
        candidateFieldCoverage: entries.length ? "entityRecordOnly" : "none",
        exactFieldEvidence,
        rawIntegrity: {
            verified: sourceArtifactIds.length > 0 && sourceArtifactIds.every((id) => transition.sourceArtifacts.get(id)?.integrityStatus === "verified"),
            missingCount: sourceArtifactIds.filter((id) => transition.sourceArtifacts.get(id)?.integrityStatus === "missing").length,
            mismatchCount: sourceArtifactIds.filter((id) => transition.sourceArtifacts.get(id)?.integrityStatus === "mismatch").length
        },
        acceptedAsCandidateClaimProof: false
    };
}

function descriptorFileRef(file) {
    return inputRef(file);
}

function canonicalSourceFamily(registry, provider) {
    const normalized = String(provider ?? "");
    for (const [name, descriptor] of Object.entries(registry?.providers || {})) {
        if (name === normalized || descriptor?.canonicalName === normalized || (descriptor?.aliases || []).includes(normalized)) {
            return descriptor.familyId ?? null;
        }
    }
    return null;
}

function buildCharacterExternalDescriptors(targetIds, sourceFamilyRegistry = null) {
    if (!fs.existsSync(paths.behaviorExternal)) return { descriptors: [], exactCandidateIds: [], input: descriptorFileRef(paths.behaviorExternal) };
    const payload = readJson(paths.behaviorExternal);
    const descriptors = [];
    const exactCandidateIds = [];
    for (const candidateId of targetIds) {
        const candidate = payload.candidates?.[candidateId];
        if (!candidate) continue;
        exactCandidateIds.push(candidateId);
        for (const evidence of candidate.evidence || []) {
            const source = payload.externalSources?.[evidence.externalSourceId] || {};
            const project = source.project ? (payload.projects?.[source.project] || {}) : {};
            const provider = source.provider ?? evidence.provider ?? project.provider ?? null;
            const legacyObservedIndependenceGroup = source.independenceGroup ?? evidence.independenceGroup ?? project.independenceGroup ?? null;
            const sourceFamily = canonicalSourceFamily(sourceFamilyRegistry, provider) || legacyObservedIndependenceGroup;
            const lowerProvider = String(provider).toLowerCase();
            const policyStatus = lowerProvider.includes("gcsim")
                ? "providerPrerequisiteBlocked"
                : lowerProvider.includes("optimizer")
                    ? "forbiddenCorrelated"
                    : "unknown";
            descriptors.push({
                id: `character-descriptor:${candidateId}:${evidence.externalSourceId}`,
                candidateId,
                fieldPointers: uniqueSorted(evidence.candidateFields || []),
                provider,
                sourceFamily,
                independenceGroup: source.independenceGroup ?? evidence.independenceGroup ?? null,
                legacyObservedIndependenceGroup,
                repository: source.repository ?? null,
                revision: source.revision ?? null,
                revisionSource: source.revisionSource ?? null,
                locator: clone(source.locator ?? null),
                gameVersion: evidence.gameVersion ?? source.gameVersion ?? null,
                strictGameVersionBinding: false,
                declared: {
                    materialized: source.materialization?.materialized === true,
                    rootConfigured: source.materialization?.rootConfigured === true,
                    supportsClaimValue: evidence.supportsClaimValue === true
                },
                observed: {
                    rawMaterialized: false,
                    descriptorFile: descriptorFileRef(paths.behaviorExternal)
                },
                policyStatus,
                proofStatus: "descriptorOnlyNoRawCandidateFieldProof",
                blockedReasons: uniqueSorted([
                    ...(source.blockedReasons || []),
                    ...(evidence.verification?.blockedReasons || []),
                    "rawCandidateFieldMaterializationMissing",
                    "strictGameVersionBindingMissing"
                ]),
                acceptedAsProof: false
            });
        }
    }
    descriptors.sort((a, b) => naturalCompare(a.id, b.id));
    return { descriptors, exactCandidateIds: uniqueSorted(exactCandidateIds), input: descriptorFileRef(paths.behaviorExternal) };
}

function buildWeaponExternalDescriptors(targetIds) {
    const descriptors = [];
    const exactGcsimCandidateIds = new Set();
    let externalPayload = null;
    if (fs.existsSync(paths.weaponExternal)) {
        externalPayload = readJson(paths.weaponExternal);
        for (const record of Object.values(externalPayload.records || {})) {
            for (const field of record.fields || []) {
                if (!targetIds.has(String(field.candidateId))) continue;
                exactGcsimCandidateIds.add(String(field.candidateId));
                descriptors.push({
                    id: `weapon-gcsim-descriptor:${field.candidateId}:${field.field}`,
                    candidateId: String(field.candidateId),
                    fieldPointers: [String(field.field)],
                    provider: field.provider ?? record.provider ?? null,
                    sourceFamily: field.independenceGroup ?? record.independenceGroup ?? null,
                    independenceGroup: field.independenceGroup ?? record.independenceGroup ?? null,
                    repository: record.repository ?? null,
                    revision: field.revision ?? record.revision ?? null,
                    locator: clone(field.locator ?? record.locator ?? null),
                    gameVersion: field.gameVersion ?? record.gameVersion ?? null,
                    strictGameVersionBinding: false,
                    declared: {
                        materialized: true,
                        sourceBytes: field.sourceBytes ?? record.sourceBytes ?? null,
                        sha256: field.sha256 ?? record.sha256 ?? null,
                        supportsClaimValue: field.supportsClaimValue === true
                    },
                    observed: {
                        rawMaterialized: false,
                        descriptorFile: descriptorFileRef(paths.weaponExternal)
                    },
                    policyStatus: "providerPrerequisiteBlocked",
                    proofStatus: "descriptorOnlyStrictGameVersionBindingMissing",
                    blockedReasons: ["strictGameVersionBindingMissing"],
                    acceptedAsProof: false
                });
            }
        }
    }

    if (fs.existsSync(paths.weaponIndependent)) {
        const independent = readJson(paths.weaponIndependent);
        for (const record of Object.values(independent.records || {})) {
            const comparisons = Array.isArray(record.fieldComparisons) ? record.fieldComparisons : [];
            for (const comparison of comparisons) {
                const candidateId = String(comparison.candidateId ?? "");
                if (!targetIds.has(candidateId)) continue;
                descriptors.push({
                    id: `weapon-independent-descriptor:${candidateId}:${comparison.field ?? "unknown"}`,
                    candidateId,
                    fieldPointers: comparison.field ? [String(comparison.field)] : [],
                    provider: "genshinsim/gcsim",
                    sourceFamily: "gcsim-implementation",
                    independenceGroup: "gcsim-implementation",
                    repository: null,
                    revision: null,
                    locator: null,
                    gameVersion: comparison.gameVersion?.sourceB ?? null,
                    strictGameVersionBinding: false,
                    declared: { materialized: false, supportsClaimValue: false },
                    observed: { rawMaterialized: false, descriptorFile: descriptorFileRef(paths.weaponIndependent) },
                    policyStatus: "providerPrerequisiteBlocked",
                    proofStatus: "descriptorOnlyStrictGameVersionBindingMissing",
                    blockedReasons: ["strictGameVersionBindingMissing", "rawCandidateFieldMaterializationMissing"],
                    acceptedAsProof: false
                });
            }
        }
    }

    if (fs.existsSync(paths.weaponStatReview) && targetIds.has("w_12516_stat_1")) {
        const review = readJson(paths.weaponStatReview);
        for (const [field, claim] of Object.entries(review.claims || {})) {
            if (!Array.isArray(claim?.evidence) || !claim.evidence.length) continue;
            for (const evidence of claim.evidence) {
                const sourceRecord = review.sourceRecords?.[evidence.sourceId] || {};
                const rawText = sourceRecord.rawText;
                const declaredDigest = sourceRecord.integrity?.algorithm === "sha256" ? sourceRecord.integrity.digest : null;
                const observedDigest = typeof rawText === "string" ? sha256(Buffer.from(rawText, "utf8")) : null;
                descriptors.push({
                    id: `weapon-review-descriptor:w_12516_stat_1:${field}:${evidence.sourceId}`,
                    candidateId: "w_12516_stat_1",
                    fieldPointers: [field],
                    provider: evidence.provider ?? sourceRecord.provider ?? null,
                    sourceFamily: evidence.independenceGroup ?? sourceRecord.independenceGroup ?? null,
                    independenceGroup: evidence.independenceGroup ?? sourceRecord.independenceGroup ?? null,
                    repository: null,
                    revision: null,
                    locator: sourceRecord.locator ?? null,
                    gameVersion: evidence.gameVersion ?? sourceRecord.gameVersion ?? null,
                    strictGameVersionBinding: evidence.gameVersionVerified === true && sourceRecord.strictGameVersionBinding === true,
                    declared: {
                        materialized: false,
                        rawTextDigest: declaredDigest,
                        supportsClaimValue: evidence.supportsClaimValue === true
                    },
                    observed: {
                        rawMaterialized: false,
                        rawTextPresent: typeof rawText === "string",
                        rawTextDigest: observedDigest,
                        rawTextDigestMatches: Boolean(declaredDigest && observedDigest === declaredDigest),
                        descriptorFile: descriptorFileRef(paths.weaponStatReview)
                    },
                    policyStatus: "candidateApprovedOnlyHistorical6.7",
                    proofStatus: "reviewDescriptorOnlyCurrent7.0ReverificationRequired",
                    blockedReasons: ["rawProviderFieldArtifactNotMaterialized", "candidateApprovalNotReusable", "current7.0ReverificationRequired"],
                    acceptedAsProof: false
                });
            }
        }
    }
    descriptors.sort((a, b) => naturalCompare(a.id, b.id));
    return {
        descriptors,
        exactGcsimCandidateIds: uniqueSorted([...exactGcsimCandidateIds]),
        exactReviewCandidateIds: targetIds.has("w_12516_stat_1") ? ["w_12516_stat_1"] : [],
        inputs: [paths.weaponExternal, paths.weaponIndependent, paths.weaponStatReview].filter((file) => fs.existsSync(file)).map(descriptorFileRef)
    };
}

function applicableFrontiers(targetIds, frontiers, sourceSearch) {
    const result = [];
    for (const frontier of frontiers?.frontiers || []) {
        const ids = new Set((frontier.appliesTo?.candidateIds || []).map(String));
        const intersection = [...targetIds].filter((id) => ids.has(id)).sort(naturalCompare);
        result.push({
            id: frontier.id ?? null,
            status: frontier.status ?? null,
            dataset: frontier.appliesTo?.dataset ?? null,
            layer: frontier.appliesTo?.layer ?? null,
            declaredCandidateCount: frontier.appliesTo?.candidateCount ?? null,
            inspectedCandidateIdDigest: frontier.appliesTo?.candidateIdDigest ?? null,
            intersectionCount: intersection.length,
            intersectionCandidateIds: intersection,
            applicable: intersection.length > 0,
            searchScope: frontier.searchScope ?? null,
            lastSearchedAt: frontier.lastSearchedAt ?? null,
            providersExamined: uniqueSorted(frontier.providersExamined || []),
            reopenTrigger: frontier.reopenTrigger ?? null,
            evidenceRefs: uniqueSorted(frontier.evidenceRefs || [])
        });
    }
    for (const frontier of sourceSearch?.scopedFrontiers || []) {
        const ids = new Set((frontier.appliesTo?.candidateIds || []).map(String));
        const intersection = [...targetIds].filter((id) => ids.has(id)).sort(naturalCompare);
        result.push({
            id: frontier.id ?? null,
            status: frontier.status ?? null,
            dataset: "transition",
            layer: "transitionScoped",
            declaredCandidateCount: frontier.appliesTo?.candidateCount ?? null,
            inspectedCandidateIdDigest: frontier.appliesTo?.candidateIdDigest ?? frontier.appliesTo?.partialDiscoveryFieldDigest ?? null,
            intersectionCount: intersection.length,
            intersectionCandidateIds: intersection,
            applicable: intersection.length > 0,
            searchScope: frontier.searchScope ?? null,
            lastSearchedAt: frontier.lastSearchedAt ?? null,
            providersExamined: uniqueSorted(frontier.providersExamined || []),
            reopenTrigger: frontier.reopenTrigger ?? null,
            evidenceRefs: []
        });
    }
    return result.sort((a, b) => naturalCompare(a.id, b.id));
}

function buildProviderPrerequisites(policy, sourceSearch, sourceFamilyRegistry, candidateFieldSearchRequired = null) {
    const policyRows = (policy?.policies || []).map((entry) => ({
        id: entry.id ?? null,
        dataset: entry.dataset ?? null,
        status: entry.status ?? null,
        providerA: entry.providerA ?? null,
        providerB: entry.providerB ?? null,
        independenceGroupA: entry.independenceGroupA ?? null,
        independenceGroupB: entry.independenceGroupB ?? null,
        blockReasons: uniqueSorted(entry.blockReasons || []),
        scope: clone(entry.scope || []),
        gameVersionBinding: clone(entry.gameVersionBinding ?? null),
        searchScope: entry.searchScope ?? null,
        lastSearchedAt: entry.lastSearchedAt ?? null,
        reopenTrigger: entry.reopenTrigger ?? null,
        evidenceRefs: uniqueSorted(entry.evidenceRefs || [])
    })).sort((a, b) => naturalCompare(a.id, b.id));
    const reopenTriggers = uniqueSorted(sourceSearch?.reopenTriggers || []);
    const inspectedProviders = (sourceSearch?.providersExamined || []).map((provider) => provider?.provider).filter(Boolean);
    const providerSurfaceInspection = deriveProviderSurfaceInspection(sourceSearch);
    const candidateLookupRequired = Number.isInteger(candidateFieldSearchRequired) && candidateFieldSearchRequired > 0;
    const sourceLookupExecutableNow = candidateLookupRequired
        ? null
        : providerSurfaceInspection.providerSurfaceLookupExecutableNow;
    const sourceLookupStatus = candidateLookupRequired
        ? "lookupRequired"
        : providerSurfaceInspection.providerSurfaceLookupExecutableNow ? "lookupRequired" : "reopenOnTriggerOnly";
    const targetLookupStatus = providerSurfaceInspection.providerSurfaceLookupExecutableNow
        ? "lookupRequired;providerSurfaceEvidenceIncomplete"
        : "reopenOnTriggerOnly;notEstablishedInRepository";
    return {
        policyVersion: policy?.policyVersion ?? null,
        sourceFamilyRegistryVersion: sourceFamilyRegistry?.registryVersion ?? null,
        strictGateObserved: clone(policy?.principles?.strictGate || []),
        providerRows: policyRows,
        sourceSearch: {
            searchExhausted: sourceSearch?.searchExhausted === true,
            strictTargetDatasetFound: sourceSearch?.strictTargetDatasetFound === true,
            providersExamined: (sourceSearch?.providersExamined || []).map((provider) => ({
                provider: provider.provider ?? null,
                sourceFamily: provider.sourceFamily ?? null,
                result: provider.result ?? null,
                evidenceRef: provider.evidenceRef ?? null
            })).sort((a, b) => naturalCompare(a.provider, b.provider)),
            note: "Provider-wide prerequisites are retained separately; they do not close the candidate frontier."
        },
        sourceLookupBoundary: {
            status: sourceLookupStatus,
            sourceLookupExecutableNow,
            providerSurfaceStatus: providerSurfaceInspection.providerSurfaceLookupExecutableNow ? "lookupRequired" : "reopenOnTriggerOnly",
            providerSurfaceLookupExecutableNow: providerSurfaceInspection.providerSurfaceLookupExecutableNow,
            candidateFieldSearchRequired: Number.isInteger(candidateFieldSearchRequired) ? candidateFieldSearchRequired : null,
            candidateFieldSearchStatus: candidateLookupRequired ? "lookupRequired" : "notInScope",
            providerSurfaceInspection,
            newProviderReleaseManifestLineageTriggerObservedInPersistedInputs: providerSurfaceInspection.triggerObserved,
            inspectedProviderCount: inspectedProviders.length,
            inspectedProviders,
            reopenTriggers,
            reason: candidateLookupRequired
                ? "The persisted provider surface ledger covers the listed provider URLs, but the current candidate set remains searchRequired with no candidate-scoped field frontier or qualifying raw claim evidence. Keep candidate lookupRequired/availability unknown; do not convert provider-surface coverage into searchExhausted. Reopen provider-surface lookup only when a listed trigger is materially acquired."
                : providerSurfaceInspection.providerSurfaceLookupExecutableNow
                    ? "The persisted provider surface ledger is incomplete for one or more listed lookup targets; keep lookupRequired until each target has a recorded evidence row."
                    : "All listed provider targets are represented by the persisted finite provider search inputs and no new provider release, immutable manifest, or independent-lineage disclosure is present. Reopen provider-surface lookup only when a listed trigger is materially acquired.",
            evidenceRefs: [
                relativePath(paths.sourceSearch),
                relativePath(paths.sourceFrontiers),
                relativePath(paths.providerPolicy)
            ]
        },
        nextLookupTargets: [
            {
                id: "gcsim-exact-7.0-provider-manifest",
                provider: "genshinsim/gcsim",
                sourceFamily: "gcsim-implementation",
                artifactOrUrl: "https://github.com/genshinsim/gcsim/releases",
                lookupClass: "immutableVersionManifestOrReleaseArtifact",
                candidateScope: "current behaviorSpec 1533 + weaponEffectSpec/sourceMissing 381",
                fieldPurpose: "Bind exact gcsim revision/file SHA and candidate field digest bundle to Genshin 7.0.",
                unresolvedMetadata: ["providerOwnedManifest", "strictGameVersionBinding", "fieldDigestBundle"],
                couldUnlockStrictGate: true,
                currentStatus: targetLookupStatus,
                lookupExecutableNow: providerSurfaceInspection.providerSurfaceLookupExecutableNow,
                reopenTriggerRequired: true,
                evidenceRefs: ["games/genshin/data/v2/weapons/external-evidence.json", "games/genshin/data/v2/version-transitions/6.7-to-7.0/source-search.json"]
            },
            {
                id: "kqm-exact-7.0-field-manifest",
                provider: "KQM Theorycrafting Library",
                sourceFamily: "kqm-community-theorycrafting",
                artifactOrUrl: "https://library.keqingmains.com/",
                lookupClass: "immutableVersionManifestAndCandidateFieldCoverage",
                candidateScope: "current behaviorSpec and weaponEffectSpec fields where KQM has a direct record",
                fieldPurpose: "Establish provider-owned exact 7.0 binding for each materialized candidate field and raw/normalized digest.",
                unresolvedMetadata: ["providerOwnedManifest", "completeCandidateFieldCoverage", "rawDigestBinding"],
                couldUnlockStrictGate: true,
                currentStatus: targetLookupStatus,
                lookupExecutableNow: providerSurfaceInspection.providerSurfaceLookupExecutableNow,
                reopenTriggerRequired: true,
                evidenceRefs: ["games/genshin/data/v2/provider-independence-policy.json", "games/genshin/data/v2/version-transitions/6.7-to-7.0/source-search.json"]
            },
            {
                id: "gachabase-independent-lineage-and-versioned-fields",
                provider: "Gachabase",
                sourceFamily: "gachabase-versioned-data",
                artifactOrUrl: "https://gi.gachabase.net/diff/weapons/12516/a-teaspoon-of-transcendence?branch=release&cur=release_7.0.0_47194594&lang=en&prev=release_6.7.0_46509556",
                lookupClass: "sourceOwnedLineageDisclosureAndImmutableFieldSnapshot",
                candidateScope: "current behaviorSpec candidates; start with bounded candidate/claim pages, no dataset-wide inheritance from Xiao",
                fieldPurpose: "Resolve extraction lineage, exact revision/raw/field digests, and complete candidate claim fields.",
                unresolvedMetadata: ["sourceOwnedUpstreamLineage", "candidateFieldSnapshot", "strictGameVersionBinding"],
                couldUnlockStrictGate: true,
                currentStatus: providerSurfaceInspection.providerSurfaceLookupExecutableNow
                    ? "lookupRequired;lineageUnknownOutsideXiaoReview"
                    : "reopenOnTriggerOnly;lineageUnknownOutsideXiaoReview",
                lookupExecutableNow: providerSurfaceInspection.providerSurfaceLookupExecutableNow,
                reopenTriggerRequired: true,
                evidenceRefs: ["games/genshin/data/v2/provider-independence-policy.json", "games/genshin/data/v2/version-transitions/6.7-to-7.0/source-search.json"]
            },
            {
                id: "official-hoyowiki-hoyolab-field-capture",
                provider: "HoYoverse HoYoWiki / HoYoLAB",
                sourceFamily: "official-hoyoverse",
                artifactOrUrl: "https://wiki.hoyolab.com/pc/genshin/entry/10949",
                lookupClass: "knownMutableFieldPage",
                candidateScope: "candidate-specific official field pages for current weapon and behavior claims",
                fieldPurpose: "Discover official values/conditions/scope; require an immutable provider-owned snapshot or update artifact before strict reuse.",
                unresolvedMetadata: ["immutableRawSnapshot", "completeCandidateFieldCoverage", "strictVersionBinding"],
                couldUnlockStrictGate: false,
                currentStatus: providerSurfaceInspection.providerSurfaceLookupExecutableNow
                    ? "lookupRequired;fieldDiscoveryOnly;mutablePageCannotCloseGate"
                    : "reopenOnTriggerOnly;fieldDiscoveryOnly;mutablePageCannotCloseGate",
                lookupExecutableNow: providerSurfaceInspection.providerSurfaceLookupExecutableNow,
                reopenTriggerRequired: true,
                evidenceRefs: ["games/genshin/data/v2/review-pilots/weapon-12516-stat.json", "games/genshin/data/v2/version-transitions/6.7-to-7.0/source-search.json"]
            },
            {
                id: "teyvatguide-version-and-lineage-artifact",
                provider: "BTMuli/TeyvatGuide",
                sourceFamily: "teyvatguide-upstream-undisclosed",
                artifactOrUrl: "https://github.com/BTMuli/TeyvatGuide/releases/tag/v0.11.4",
                lookupClass: "providerManifestAndLineageDisclosure",
                candidateScope: "current weapon/behavior candidate fields found in the pinned release",
                fieldPurpose: "Determine independent extraction lineage and provider-owned explicit 7.0/raw/field digest binding.",
                unresolvedMetadata: ["independentLineage", "providerGameVersionManifest", "completeCandidateFieldCoverage"],
                couldUnlockStrictGate: true,
                currentStatus: providerSurfaceInspection.providerSurfaceLookupExecutableNow
                    ? "lookupRequired;lineageAndStrictBindingUnknown"
                    : "reopenOnTriggerOnly;lineageAndStrictBindingUnknown",
                lookupExecutableNow: providerSurfaceInspection.providerSurfaceLookupExecutableNow,
                reopenTriggerRequired: true,
                evidenceRefs: ["games/genshin/data/v2/source-family-registry.json", "games/genshin/data/v2/version-transitions/6.7-to-7.0/source-search.json"]
            },
            {
                id: "yatta-version-hash-binding",
                provider: "Yatta API",
                sourceFamily: "Yatta-derived",
                artifactOrUrl: "https://gi.yatta.moe/api/v2/CHS/weapon/11520?vh=70F0",
                lookupClass: "versionHashFieldDiscoveryOnly",
                candidateScope: "candidate-specific weapon fields if endpoint mapping is found",
                fieldPurpose: "Verify provider-owned mapping from version hash to Genshin 7.0 and immutable raw/field digest.",
                unresolvedMetadata: ["providerVersionHashMapping", "immutableManifest", "independentLineage"],
                couldUnlockStrictGate: true,
                currentStatus: providerSurfaceInspection.providerSurfaceLookupExecutableNow
                    ? "lookupRequired;versionHashNotBoundInRepository"
                    : "reopenOnTriggerOnly;versionHashNotBoundInRepository",
                lookupExecutableNow: providerSurfaceInspection.providerSurfaceLookupExecutableNow,
                reopenTriggerRequired: true,
                evidenceRefs: ["games/genshin/data/v2/version-transitions/6.7-to-7.0/source-search.json"]
            },
            {
                id: "genshin-optimizer-independent-lineage",
                provider: "Genshin Optimizer",
                sourceFamily: "GenshinData-derived",
                artifactOrUrl: "https://github.com/frzyc/genshin-optimizer/releases/tag/10.38.0",
                lookupClass: "correlatedCoverageOnly",
                candidateScope: "current behavior/weapon fields only as correlated corroboration",
                fieldPurpose: "Record any exact field coverage, but do not count it as an independent family unless source-family registry changes from correlated.",
                unresolvedMetadata: ["independentLineage"],
                couldUnlockStrictGate: false,
                currentStatus: providerSurfaceInspection.providerSurfaceLookupExecutableNow
                    ? "lookupRequired;forbiddenCorrelatedBySourceFamilyRegistry"
                    : "reopenOnTriggerOnly;forbiddenCorrelatedBySourceFamilyRegistry",
                lookupExecutableNow: providerSurfaceInspection.providerSurfaceLookupExecutableNow,
                reopenTriggerRequired: true,
                evidenceRefs: ["games/genshin/data/v2/source-family-registry.json", "games/genshin/data/v2/provider-independence-policy.json"]
            }
        ]
    };
}

function buildBatches(targets, shardIndex, transition, identityBridge) {
    const groups = new Map();
    for (const target of targets) {
        const memberships = (shardIndex.get(target.candidateId) || []).filter((entry) =>
            entry.clusterId === (target.layer === "behaviorSpec" ? behaviorShardCluster : weaponShardCluster));
        const membership = memberships[0] || null;
        const key = membership?.shardId || `${target.layer}:unassigned`;
        const row = groups.get(key) || {
            batchId: key,
            domain: target.layer === "behaviorSpec" ? "behavior" : "weapons",
            layer: target.layer,
            shardId: membership?.shardId ?? null,
            candidateIds: [],
            entityIds: new Set()
        };
        row.candidateIds.push(target.candidateId);
        row.entityIds.add(target.candidateId.split(target.layer === "behaviorSpec" ? ":" : "_")[1]);
        groups.set(key, row);
    }
    return [...groups.values()].map((row) => {
        const candidateIds = uniqueSorted(row.candidateIds);
        const candidateRecords = candidateIds.map((id) => targets.find((target) => target.candidateId === id)).filter(Boolean);
        const transitionStatuses = candidateRecords.map((target) => {
            const membership = (shardIndex.get(target.candidateId) || []).find((entry) => entry.clusterId === (target.layer === "behaviorSpec" ? behaviorShardCluster : weaponShardCluster));
            return transitionEvidenceForCandidate({ ...target, shard: membership }, transition, identityBridge).status;
        });
        const sourceLookupStates = candidateRecords.map((target) => deriveCandidateSourceLookupState(target.task));
        const exactFieldEvidenceCount = candidateRecords.filter((target) => {
            const membership = (shardIndex.get(target.candidateId) || []).find((entry) => entry.clusterId === (target.layer === "behaviorSpec" ? behaviorShardCluster : weaponShardCluster));
            return transitionEvidenceForCandidate({ ...target, shard: membership }, transition, identityBridge).exactFieldEvidence;
        }).length;
        return {
            batchId: row.batchId,
            domain: row.domain,
            layer: row.layer,
            shardId: row.shardId,
            candidateCount: candidateIds.length,
            candidateIdDigest: digestStable(candidateIds),
            candidateIds,
            entityCount: row.entityIds.size,
            transitionEntityRecordStatuses: countBy(transitionStatuses),
            exactCandidateFieldEvidenceCount: exactFieldEvidenceCount,
            sourceLookupStatuses: countBy(sourceLookupStates.map((state) => state.status)),
            status: "sourceCoverageUnresolved",
            action: "boundedProviderSourceLookupThenMaterializeCandidateClaimFields",
            sourceLookupCanExecuteNow: aggregateLookupAvailability(sourceLookupStates.map((state) => state.executableNow)),
            sourceLookupReopenOnTriggerOnly: sourceLookupStates.every((state) => state.reopenOnTriggerOnly),
            fieldMaterializationCanExecuteNow: false,
            rationale: "Existing transition captures are one correlated entity-record family; candidate×claim field materialization remains unresolved. All currently listed provider targets are already represented in the persisted finite search inputs, so no new lookup pass is executable until a release, immutable manifest, or independent-lineage disclosure trigger is acquired.",
            searchExhausted: false,
            certificateEligible: false,
            canonicalPromotionEligible: false
        };
    }).sort((a, b) => naturalCompare(a.batchId, b.batchId));
}

function buildInventory({ queue = null } = {}) {
    const authoritativeQueue = queue || readJson(paths.queue);
    const targets = selectTargets(authoritativeQueue);
    const behaviorTargets = targets.filter((target) => target.layer === "behaviorSpec");
    const weaponTargets = targets.filter((target) => target.layer === "weaponEffectSpec");
    const shardIndex = buildShardIndex(authoritativeQueue);
    const localInputs = loadLocalInputs();
    const transition = loadTransitionEvidence();
    const identityBridge = buildIdentityBridgeEvidence();
    const sourceFamilyRegistry = fs.existsSync(paths.sourceFamilyRegistry) ? readJson(paths.sourceFamilyRegistry) : null;
    const behaviorExternal = buildCharacterExternalDescriptors(new Set(behaviorTargets.map((target) => target.candidateId)), sourceFamilyRegistry);
    const weaponExternal = buildWeaponExternalDescriptors(new Set(weaponTargets.map((target) => target.candidateId)));
    const externalDescriptors = [...behaviorExternal.descriptors, ...weaponExternal.descriptors]
        .sort((a, b) => naturalCompare(a.id, b.id));
    const descriptorsByCandidate = new Map();
    for (const descriptor of externalDescriptors) {
        const all = descriptorsByCandidate.get(descriptor.candidateId) || [];
        all.push(descriptor.id);
        descriptorsByCandidate.set(descriptor.candidateId, all);
    }

    const frontiers = readJson(paths.sourceFrontiers);
    const sourceSearch = readJson(paths.sourceSearch);
    const policy = readJson(paths.providerPolicy);
    const targetIdSet = new Set(targets.map((target) => target.candidateId));
    const inspectedFrontiers = applicableFrontiers(targetIdSet, frontiers, sourceSearch);
    const targetRecords = targets.map((target) => {
        const task = target.task;
        const shardMemberships = (shardIndex.get(target.candidateId) || []).filter((entry) =>
            entry.clusterId === (target.layer === "behaviorSpec" ? behaviorShardCluster : weaponShardCluster));
        const shard = shardMemberships[0] || null;
        const local = localEvidence(target, localInputs);
        const transitionEvidence = transitionEvidenceForCandidate({ ...target, shard }, transition, identityBridge);
        const identityBridgeApplicable = Boolean(identityBridge?.identityBridgeProven
            && String(identityBridge.entity?.entityId) === String(target.candidateId.split(target.layer === "behaviorSpec" ? ":" : "_")[1]));
        const applicable = inspectedFrontiers
            .filter((frontier) => frontier.applicable && frontier.intersectionCandidateIds.includes(target.candidateId))
            .map((frontier) => frontier.id);
        const descriptors = descriptorsByCandidate.get(target.candidateId) || [];
        const sourceLookup = deriveCandidateSourceLookupState(task);
        const identityGap = (transitionEvidence.status === "identityUnresolved" || transitionEvidence.status === "missing")
            && transitionEvidence.identityStatus !== "identityReconciledByLocalizedBridge";
        const nextExecutableAction = identityGap
            ? "resolveProviderEntityIdentityBeforeCandidateFieldCapture"
            : descriptors.length
                ? "gateProviderManifestOrLineageThenMaterializeCandidateClaimFields"
                : "boundedCandidateClaimFieldSourceCaptureAfterProviderGate";
        return {
            candidateId: target.candidateId,
            layer: target.layer,
            dataset: target.dataset,
            entityId: target.candidateId.split(target.layer === "behaviorSpec" ? ":" : "_")[1],
            claimComponent: local.entity?.component ?? null,
            recordKind: target.layer === "behaviorSpec"
                ? (target.candidateId.split(":")[2] === "talent" ? "talents" : "constellations")
                : "weaponEntity",
            shard: {
                clusterId: shard?.clusterId ?? null,
                shardId: shard?.shardId ?? null,
                scopeMatched: Boolean(shard),
                shardCandidateCount: shard?.candidateIds?.length ?? null
            },
            queueState: {
                terminalState: task.terminalState ?? null,
                primaryBlockReason: task.primaryBlockReason ?? null,
                blockReasons: clone(task.blockReasons || []),
                searchFrontier: clone(task.searchFrontier || null),
                mappingStatus: task.mappingStatus ?? null,
                consumerStatus: task.consumerStatus ?? null,
                bulkTransitionCapture: clone(task.bulkTransitionCapture || null)
            },
            localEvidence: local,
            identityReconciliation: identityBridgeApplicable
                ? {
                    status: identityBridge.status,
                    evidenceRef: identityBridge.snapshot.path,
                    providerSlug: identityBridge.entity?.providerSlug ?? null,
                    providerId: identityBridge.entity?.providerId ?? null,
                    sourceFamily: identityBridge.sourceFamily ?? null,
                    historicalNegativeAliasEvidenceCount: identityBridge.negativeAliasEvidenceCount,
                    identityOnlyNotMechanicVerification: true,
                    certificateEligible: false,
                    canonicalPromotionEligible: false
                }
                : null,
            transitionEntityEvidence: transitionEvidence,
            externalEvidenceIds: descriptors,
            providerCoverage: {
                exactCandidateFieldDescriptorCount: descriptors.length,
                exactIndependentVersionBoundFieldProofCount: 0,
                sourceFamiliesInDescriptors: uniqueSorted(externalDescriptors.filter((item) => item.candidateId === target.candidateId).map((item) => item.sourceFamily)),
                candidateFieldProofStatus: descriptors.length ? "descriptorOnlyNoQualifyingProof" : "notFoundInInspectedMaterializations",
                absenceInterpretation: "notEvidenceOfSearchExhaustion"
            },
            applicableFrontiers: applicable,
            sourceLookup,
            gaps: uniqueSorted([
                "exactCandidateClaimFieldEvidenceMissing",
                "strictGameVersionBindingForIndependentFieldSourceMissing",
                "independentSourceLineageOrProviderManifestMissing",
                ...(target.layer === "behaviorSpec" && target.task.primaryBlockReason === "semanticDecisionRequired" ? ["semanticDecisionRequired"] : []),
                ...(identityGap ? ["providerIdentityUnresolvedOrSnapshotRecordMissing"] : []),
                ...(transitionEvidence.identityStatus === "identityReconciledByLocalizedBridge" && transitionEvidence.recordCount === 0
                    ? ["identityBridgeRecordCoverageGap"] : []),
                ...(transitionEvidence.rawIntegrity.missingCount > 0 ? ["transitionRawArtifactMissing"] : []),
                ...(transitionEvidence.rawIntegrity.mismatchCount > 0 ? ["transitionRawArtifactDigestMismatch"] : []),
                ...(descriptors.length ? ["externalMaterializationDescriptorOnly"] : [])
            ]),
            nextExecutableAction,
            certificateEligible: false,
            canonicalPromotionEligible: false,
            searchExhausted: false
        };
    }).sort((a, b) => naturalCompare(a.candidateId, b.candidateId));

    const queueProjection = {
        projectionVersion: "genshinCandidateSourceCoverageFrontierInventory/queue-input-v1",
        selectors: [
            "layer=behaviorSpec AND searchFrontier.status=searchRequired",
            "layer=weaponEffectSpec AND primaryBlockReason=sourceMissing AND searchFrontier.status=searchRequired"
        ],
        candidateIds: targetRecords.map((candidate) => candidate.candidateId),
        tasks: targets.map((target) => queueTaskProjection(target.task))
    };
    const allCandidateIds = targetRecords.map((candidate) => candidate.candidateId);
    const queueFile = fileIntegrity(paths.queue);
    const candidateSpecInputFiles = uniqueSorted(localInputs.inputFiles).map((file) => inputRef(file));
    const sourceArtifactList = [...transition.sourceArtifacts.values()].sort((a, b) => naturalCompare(a.id, b.id));
    for (const artifact of sourceArtifactList) artifact.references.sort((a, b) => stableJson(a).localeCompare(stableJson(b)));
    const transitionSnapshotList = transition.snapshotInputs.sort((a, b) => naturalCompare(a.id, b.id));
    const behaviorTransitionCaptured = behaviorTargets.filter((target) => targetRecords.find((candidate) => candidate.candidateId === target.candidateId)?.transitionEntityEvidence.status === "entityRecordCaptured").length;
    const weaponTransitionCaptured = weaponTargets.filter((target) => targetRecords.find((candidate) => candidate.candidateId === target.candidateId)?.transitionEntityEvidence.status === "entityRecordCaptured").length;
    const applicableFrontierCount = inspectedFrontiers.filter((frontier) => frontier.applicable).length;
    const rawIntegrityStatuses = sourceArtifactList.map((artifact) => artifact.integrityStatus);
    const sourceFamilies = uniqueSorted(sourceArtifactList.map((artifact) => artifact.sourceFamily));
    const providerDescriptorCounts = countBy(externalDescriptors.map((descriptor) => descriptor.provider));
    const batches = buildBatches(targets, shardIndex, transition, identityBridge);
    const providerPrerequisites = buildProviderPrerequisites(policy, sourceSearch, sourceFamilyRegistry, targets.length);
    const candidateSourceLookupAvailability = aggregateLookupAvailability(targetRecords.map((candidate) => candidate.sourceLookup.executableNow));
    const candidateSourceLookupReopenOnly = targetRecords.every((candidate) => candidate.sourceLookup.reopenOnTriggerOnly);

    const resultWithoutDigest = {
        schemaVersion: 1,
        kind: "genshinCandidateSourceCoverageFrontierInventory",
        status: "passed",
        generatedAt,
        transitionId,
        targetGameVersion,
        policy: {
            evidenceOnly: true,
            metadataBooleansNotProof: true,
            noCertificate: true,
            noCanonicalPromotion: true,
            noSearchExhaustedFromAbsence: true,
            noNetworkFetch: true,
            sourceAgreement: "notEstablishedFromSingleCorrelatedTransitionFamily",
            fieldDigestAlgorithm: "sha256-stable-json-v1"
        },
        scope: {
            selectors: queueProjection.selectors,
            candidateCount: {
                behaviorSpec: behaviorTargets.length,
                weaponEffectSpecSourceMissing: weaponTargets.length,
                total: allCandidateIds.length
            },
            candidateIds: allCandidateIds,
            candidateIdDigest: digestStable(allCandidateIds),
            shardDigests: batches.map((batch) => ({
                shardId: batch.shardId,
                candidateCount: batch.candidateCount,
                candidateIdDigest: batch.candidateIdDigest
            })),
            queueReference: {
                path: relativePath(paths.queue),
                projectionVersion: queueProjection.projectionVersion,
                projectionDigest: digestStable(queueProjection),
                candidateCount: allCandidateIds.length
            }
        },
        generatedFrom: {
            authoritativeQueue: {
                path: relativePath(paths.queue),
                projectionVersion: queueProjection.projectionVersion,
                projectionDigest: digestStable(queueProjection)
            },
            queueProjectionDigest: digestStable(queueProjection),
            providerPolicy: inputRef(paths.providerPolicy),
            sourceSearch: inputRef(paths.sourceSearch),
            sourceFrontiers: inputRef(paths.sourceFrontiers),
            localCandidateInputs: candidateSpecInputFiles,
            sourceFamilyRegistry: inputRef(paths.sourceFamilyRegistry),
            identityBridge: inputRef(paths.identityBridge),
            externalEvidence: [paths.behaviorExternal, paths.weaponExternal, paths.weaponIndependent, paths.weaponStatReview]
                .filter((file) => fs.existsSync(file)).map(descriptorFileRef),
            transitionSnapshots: transitionSnapshotList
        },
        identityBridge,
        providerPrerequisites,
        inspectedFrontiers,
        sourceArtifacts: sourceArtifactList,
        externalDescriptors,
        batches,
        candidateRecords: targetRecords,
        summary: {
            candidateCount: allCandidateIds.length,
            behaviorSpec: behaviorTargets.length,
            weaponEffectSpecSourceMissing: weaponTargets.length,
            transitionEntityRawCoverage: {
                behaviorEntityRecordCaptured: behaviorTransitionCaptured,
                behaviorEntityRecordMissingOrIdentityUnresolved: behaviorTargets.length - behaviorTransitionCaptured,
                behaviorRawArtifactsFullyVerified: targetRecords.filter((candidate) => candidate.layer === "behaviorSpec" && candidate.transitionEntityEvidence.rawIntegrity.verified).length,
                behaviorRawIntegrityGapCandidates: targetRecords.filter((candidate) => candidate.layer === "behaviorSpec" && !candidate.transitionEntityEvidence.rawIntegrity.verified && candidate.transitionEntityEvidence.status === "entityRecordCaptured").length,
                weaponEntityRecordCaptured: weaponTransitionCaptured,
                weaponEntityRecordMissingOrIdentityUnresolved: weaponTargets.length - weaponTransitionCaptured,
                weaponRawArtifactsFullyVerified: targetRecords.filter((candidate) => candidate.layer === "weaponEffectSpec" && candidate.transitionEntityEvidence.rawIntegrity.verified).length,
                weaponRawIntegrityGapCandidates: targetRecords.filter((candidate) => candidate.layer === "weaponEffectSpec" && !candidate.transitionEntityEvidence.rawIntegrity.verified && candidate.transitionEntityEvidence.status === "entityRecordCaptured").length
            },
            transitionRawRecords: sourceArtifactList.filter((artifact) => artifact.evidenceKind === "transitionEntityRawRecord").length,
            transitionVersionManifestArtifacts: sourceArtifactList.filter((artifact) => artifact.evidenceKind === "versionManifest").length,
            sourceArtifactIntegrity: countBy(rawIntegrityStatuses),
            sourceFamiliesObserved: countBy(sourceFamilies),
            snapshotFieldDigest: {
                total: transitionSnapshotList.length,
                verified: transitionSnapshotList.filter((snapshot) => snapshot.fieldDigestMatches).length,
                invalid: transitionSnapshotList.filter((snapshot) => !snapshot.fieldDigestMatches).length
            },
            exactCandidateExternalFieldCoverage: {
                behaviorDescriptorCandidates: behaviorExternal.exactCandidateIds.length,
                behaviorDescriptorCount: behaviorExternal.descriptors.length,
                weaponGcsimCandidates: weaponExternal.exactGcsimCandidateIds.length,
                weaponReviewOnlyCandidates: weaponExternal.exactReviewCandidateIds.length,
                independentVersionBoundCandidateClaims: 0
            },
            inspectedProviderDescriptorCounts: providerDescriptorCounts,
            applicableExhaustedFrontierCount: applicableFrontierCount,
            candidateSearchExhaustedCount: targetRecords.filter((candidate) => candidate.searchExhausted).length,
            providerPrerequisiteBlocked: true,
            sourceLookupExecutableNow: candidateSourceLookupAvailability,
            sourceLookupReopenOnTriggerOnly: candidateSourceLookupReopenOnly,
            sourceLookupStatuses: countBy(targetRecords.map((candidate) => candidate.sourceLookup.status)),
            candidateClaimFieldMaterializationExecutableNow: false,
            candidateFieldSearchRequired: targetRecords.length,
            certificateEligible: 0,
            canonicalPromotion: 0,
            autoProcessableNow: 0
        },
        nextExecutableBatches: batches,
        gate: {
            status: "failClosed",
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false,
            certificateEligible: 0,
            canonicalPromotionEligible: 0,
            searchExhausted: 0,
            reasons: [
                "candidateClaimFieldEvidenceMissing",
                "providerManifestOrLineagePrerequisiteBlocked",
                "singleCorrelatedTransitionFamilyOnly",
                "semanticOrConsumerFollowupStillRequired"
            ]
        },
        errors: []
    };
    return {
        ...resultWithoutDigest,
        fieldDigestAlgorithm: "sha256-stable-json-v1",
        fieldDigest: digestStable(resultWithoutDigest)
    };
}

function validateInventory(inventory, { compareCurrent = true } = {}) {
    const reasons = [];
    if (!inventory || typeof inventory !== "object") reasons.push("artifactMissing");
    if (inventory?.schemaVersion !== 1) reasons.push("schemaVersionInvalid");
    if (inventory?.kind !== "genshinCandidateSourceCoverageFrontierInventory") reasons.push("kindInvalid");
    if (inventory?.status !== "passed") reasons.push("statusInvalid");
    if (inventory?.transitionId !== transitionId || inventory?.targetGameVersion !== targetGameVersion) reasons.push("transitionBindingInvalid");
    if (inventory?.fieldDigestAlgorithm !== "sha256-stable-json-v1" || inventory?.fieldDigest !== digestStable(withoutDigest(inventory))) reasons.push("fieldDigestInvalid");
    if (inventory?.policy?.metadataBooleansNotProof !== true || inventory?.policy?.noCertificate !== true || inventory?.policy?.noCanonicalPromotion !== true || inventory?.policy?.noSearchExhaustedFromAbsence !== true) reasons.push("failClosedPolicyInvalid");
    if (inventory?.summary?.certificateEligible !== 0 || inventory?.summary?.canonicalPromotion !== 0 || inventory?.summary?.candidateSearchExhaustedCount !== 0) reasons.push("gateCountInvalid");
    const records = Array.isArray(inventory?.candidateRecords) ? inventory.candidateRecords : [];
    if (records.some((candidate) => candidate.certificateEligible !== false || candidate.canonicalPromotionEligible !== false || candidate.searchExhausted !== false)) reasons.push("candidateGateInvalid");
    if (records.some((candidate) => candidate.transitionEntityEvidence?.exactFieldEvidence !== false || candidate.providerCoverage?.exactIndependentVersionBoundFieldProofCount !== 0)) reasons.push("exactProofUnexpected");
    if (records.some((candidate) => !candidate.sourceLookup
        || !["lookupRequired", "reopenOnTriggerOnly", "unknown"].includes(candidate.sourceLookup.status)
        || ![true, false, null].includes(candidate.sourceLookup.executableNow)
        || ![true, false].includes(candidate.sourceLookup.reopenOnTriggerOnly))) {
        reasons.push("candidateLookupStateInvalid");
    }
    const artifacts = Array.isArray(inventory?.sourceArtifacts) ? inventory.sourceArtifacts : [];
    if (artifacts.some((artifact) => ["mismatch", "observedUnbound"].includes(artifact.integrityStatus))) reasons.push("sourceArtifactIntegrityInvalid");
    if (artifacts.some((artifact) => artifact.embeddedIdentity?.declarationMatchesObserved === false)) reasons.push("sourceArtifactIdentityInvalid");
    const permittedProcessedFrontiers = new Set([
        "genshin-7.0-behavior-spec-shard01-persisted-provider-frontier",
        "weapons-primary-numeric-shard01-independent-field-frontier-7.0",
        "genshin-7.0-behavior-spec-shard02-persisted-provider-frontier",
        "weapons-primary-numeric-shard02-independent-field-frontier-7.0",
        "genshin-7.0-behavior-spec-shard03-persisted-provider-frontier",
        "weapons-primary-numeric-shard03-independent-field-frontier-7.0",
        "genshin-7.0-behavior-spec-shard04-persisted-provider-frontier",
        "weapons-primary-numeric-shard04-independent-field-frontier-7.0",
        "genshin-7.0-behavior-spec-shard05-persisted-provider-frontier",
        "genshin-7.0-behavior-spec-shard06-persisted-provider-frontier"
    ]);
    const applicableFrontiers = (inventory?.inspectedFrontiers || []).filter((frontier) => frontier?.applicable === true);
    if (applicableFrontiers.some((frontier) => !permittedProcessedFrontiers.has(frontier.id))
        || inventory?.summary?.applicableExhaustedFrontierCount !== applicableFrontiers.length) reasons.push("frontierScopeInvalid");
    if (inventory?.gate?.canIssueEligibilityCertificate !== false || inventory?.gate?.canPromoteCanonical !== false || inventory?.gate?.searchExhausted !== 0) reasons.push("gateNotFailClosed");
    const boundary = inventory?.providerPrerequisites?.sourceLookupBoundary;
    const expectedCandidateLookupAvailability = aggregateLookupAvailability(records.map((candidate) => candidate.sourceLookup?.executableNow));
    const expectedCandidateLookupReopenOnly = records.length > 0 && records.every((candidate) => candidate.sourceLookup?.reopenOnTriggerOnly === true);
    const expectedCandidateLookupStatus = records.some((candidate) => candidate.sourceLookup?.status === "lookupRequired")
        ? "lookupRequired"
        : records.some((candidate) => candidate.sourceLookup?.status === "unknown") ? "unknown" : "reopenOnTriggerOnly";
    if (!boundary
        || boundary.status !== expectedCandidateLookupStatus
        || boundary.sourceLookupExecutableNow !== expectedCandidateLookupAvailability
        || boundary.candidateFieldSearchRequired !== records.length
        || boundary.candidateFieldSearchStatus !== (records.length ? "lookupRequired" : "notInScope")
        || boundary.providerSurfaceStatus !== (boundary.providerSurfaceLookupExecutableNow ? "lookupRequired" : "reopenOnTriggerOnly")
        || boundary.newProviderReleaseManifestLineageTriggerObservedInPersistedInputs !== false) {
        reasons.push("sourceLookupBoundaryInvalid");
    }
    if (boundary && (inventory?.providerPrerequisites?.nextLookupTargets || []).some((target) =>
        target.lookupExecutableNow !== boundary.providerSurfaceLookupExecutableNow || target.reopenTriggerRequired !== true)) {
        reasons.push("untriggeredLookupPermitted");
    }
    if ((inventory?.nextExecutableBatches || []).some((batch) =>
        ![true, false, null].includes(batch.sourceLookupCanExecuteNow)
        || ![true, false].includes(batch.sourceLookupReopenOnTriggerOnly))) {
        reasons.push("batchLookupBoundaryInvalid");
    }
    if (inventory?.summary?.sourceLookupExecutableNow !== expectedCandidateLookupAvailability
        || inventory?.summary?.sourceLookupReopenOnTriggerOnly !== expectedCandidateLookupReopenOnly) {
        reasons.push("summaryLookupStateInvalid");
    }
    if (compareCurrent) {
        try {
            const expected = buildInventory();
            if (stableJson(expected) !== stableJson(inventory)) reasons.push("artifactNotDeterministicForCurrentInputs");
        } catch (error) {
            reasons.push(`currentInputsInvalid:${error.message}`);
        }
    }
    return { valid: reasons.length === 0, reasons };
}

function writeArtifacts() {
    const inventory = buildInventory();
    fs.mkdirSync(path.dirname(paths.artifact), { recursive: true });
    fs.writeFileSync(paths.artifact, stableJson(inventory), "utf8");
    fs.writeFileSync(paths.reportJson, stableJson(inventory), "utf8");
    return inventory;
}

if (require.main === module) {
    const inventory = writeArtifacts();
    const validation = validateInventory(inventory, { compareCurrent: false });
    process.stdout.write(stableJson({ status: inventory.status, validation, summary: inventory.summary }));
    if (!validation.valid || inventory.status !== "passed") process.exitCode = 1;
}

module.exports = {
    generatedAt,
    paths,
    behaviorShardCluster,
    weaponShardCluster,
    buildInventory,
    validateInventory,
    stableJson,
    writeArtifacts,
    selectTargets,
    normalizeRecord,
    sha1GitBlob
};
