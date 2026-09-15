"use strict";

/**
 * Build the finite Genshin r2 acceptance inventory.
 *
 * This is deliberately an evidence inventory, not a certificate or promotion
 * generator.  The authoritative queue supplies the candidate scope, the
 * version baseline supplies the current dataset bytes, and the already
 * captured official 7.0 index/raw bundle supplies finite feature targets.
 * Raw capture is never treated as field verification or completion.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
    TRACKED_DATASETS,
    buildSnapshot: buildVersionBaselineSnapshot
} = require("./genshinVersionBaseline.cjs");
const { digestStable, stableValue } = require("./genshinVersionEvidenceValidation.cjs");
const newRosterCapture = require("./genshinR2NewRosterCapture.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultDataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultQueuePath = path.join(repositoryRoot, "reports", "genshin-evidence-task-queue.json");
const defaultArtifactPath = path.join(defaultDataRoot, "v2", "r2-acceptance-inventory.json");
const defaultReportPath = path.join(repositoryRoot, "reports", "genshin-r2-acceptance-inventory.md");
const generatedAt = "2026-08-28T00:00:00.000Z";
const GENERATOR_VERSION = "genshinR2AcceptanceInventory/1";
const TARGET_GAME_VERSION = "7.0";
const TRANSITION_ID = "genshin:6.7->7.0";
const FIELD_DIGEST_ALGORITHM = "sha256-stable-json-v1";
const QUEUE_PROJECTION_VERSION = "genshinR2AcceptanceInventory/queue-scope-v1";
const NEW_ROSTER_CAPTURE_RELATIVE_PATH = "v2/version-transitions/6.7-to-7.0/r2-new-roster-capture.json";
const NEW_ROSTER_IDENTITY_MANIFEST_RELATIVE_PATH = "v2/version-transitions/6.7-to-7.0/sources/genshin-db-new-roster-identities/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/capture-manifest.json";

const paths = Object.freeze({
    queue: defaultQueuePath,
    artifact: defaultArtifactPath,
    report: defaultReportPath,
    versionBaseline: path.join(defaultDataRoot, "v2", "version-baseline.json"),
    sourceCatalog: path.join(defaultDataRoot, "v2", "source-catalog.json"),
    upstreamVersionHead: path.join(defaultDataRoot, "v2", "upstream-version-head.json"),
    officialChangeIndex: path.join(defaultDataRoot, "v2", "version-transitions", "6.7-to-7.0", "official-change-index.json"),
    officialWeaponSnapshot: path.join(defaultDataRoot, "v2", "version-transitions", "6.7-to-7.0", "official-weapon-frontier-11301-11303-snapshot.json"),
    officialCaptureManifest: path.join(defaultDataRoot, "v2", "version-transitions", "6.7-to-7.0", "sources", "hoyowiki-official-weapon-frontier-11301-11303", "capture-manifest.json"),
    newRosterCapture: path.join(defaultDataRoot, ...NEW_ROSTER_CAPTURE_RELATIVE_PATH.split("/")),
    versionTransition: path.join(defaultDataRoot, "v2", "version-transition.json"),
    partialDiscovery: path.join(defaultDataRoot, "v2", "version-transitions", "6.7-to-7.0", "partial-discovery.json")
});

const CALCULATION_FIELD_FAMILIES = Object.freeze([
    "catalog",
    "baseStats",
    "talentScaling",
    "constellation",
    "reactions",
    "modifiers"
]);

const DATASET_FIELD_FAMILIES = Object.freeze({
    "characters.json": ["catalog"],
    "character-talents.json": ["catalog", "talentScaling"],
    "character-constellations.json": ["catalog", "constellation"],
    "base-stats.json": ["baseStats"],
    "enemies.json": ["catalog"],
    "weapons.json": ["catalog"],
    "weapon-effects.json": ["catalog", "modifiers"],
    "artifact-sets.json": ["catalog"],
    "artifact-set-effects.json": ["catalog", "modifiers"],
    "calc/reaction-definitions.json": ["reactions"],
    "calc/talent-scalings.json": ["talentScaling"],
    "calc/talent-modifiers.json": ["modifiers"],
    "calc/talent-effect-registry.json": ["talentScaling", "modifiers"],
    "calc/constellation-modifiers.json": ["constellation", "modifiers"],
    "calc/constellation-effect-registry.json": ["constellation", "modifiers"],
    "calc/constellation-source-index.json": ["constellation"],
    "calc/weapon-modifiers.json": ["modifiers"],
    "calc/weapon-effect-registry.json": ["modifiers"],
    "calc/artifact-set-modifiers.json": ["modifiers"],
    "calc/attack-mode-rules.json": ["catalog", "modifiers"]
});

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const stableJson = (value) => JSON.stringify(stableValue(value));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const digest = (value) => digestStable(value);

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function normalizePath(file) {
    return String(file).replaceAll("\\", "/");
}

function relativeRepositoryPath(file) {
    const relative = path.relative(repositoryRoot, file);
    return normalizePath(relative || path.basename(file));
}

function fileReference(file, expectedSha256 = null) {
    if (!file || !fs.existsSync(file)) {
        return {
            path: file ? relativeRepositoryPath(file) : null,
            exists: false,
            bytes: 0,
            sha256: null,
            expectedSha256
        };
    }
    const bytes = fs.readFileSync(file);
    const observedSha256 = sha256(bytes);
    return {
        path: relativeRepositoryPath(file),
        exists: true,
        bytes: bytes.length,
        sha256: observedSha256,
        expectedSha256
    };
}

function rosterCaptureRepositoryRoot(dataRoot) {
    const resolvedDataRoot = path.resolve(dataRoot || defaultDataRoot);
    const expectedSuffix = path.join("games", "genshin", "data");
    return resolvedDataRoot.toLowerCase().endsWith(expectedSuffix.toLowerCase())
        ? path.resolve(resolvedDataRoot, "..", "..", "..")
        : repositoryRoot;
}

function buildNewRosterCaptureEvidence(dataRoot = defaultDataRoot) {
    const captureFile = dataFile(dataRoot, NEW_ROSTER_CAPTURE_RELATIVE_PATH);
    const captureReference = fileReference(captureFile);
    const unavailable = {
        captureReference,
        captureValidation: { status: captureReference.exists ? "unreadable" : "missing", valid: false, reasons: [captureReference.exists ? "captureUnreadable" : "captureMissing"] },
        status: "coveragePending",
        targetGameVersion: null,
        provider: null,
        sourceFamily: null,
        requestedRecordCount: 0,
        capturedRecordCount: 0,
        providerOnlyEntityCount: 0,
        providerOnlyEntities: [],
        fieldVerification: "notVerified",
        localEntityIdResolution: "unresolved",
        typedFieldMaterialization: "unresolved",
        strictEligible: false,
        certificateEligible: false,
        canonicalPromotionEligible: false,
        calculationAccepted: false
    };
    if (!captureReference.exists) return unavailable;

    let snapshot;
    try {
        snapshot = readJson(captureFile);
    } catch (error) {
        return {
            ...unavailable,
            captureValidation: { status: "unreadable", valid: false, reasons: [`captureUnreadable:${error.message}`] }
        };
    }

    let validation;
    try {
        validation = newRosterCapture.validateCapture(snapshot, { repositoryRoot: rosterCaptureRepositoryRoot(dataRoot) });
    } catch (error) {
        validation = { valid: false, reasons: [`captureValidationError:${error.message}`] };
    }

    const claim = snapshot?.claim || {};
    const records = Array.isArray(claim.records) ? claim.records : [];
    const roster = Array.isArray(claim.roster) ? claim.roster : [];
    const rosterBySlug = new Map(roster.map((entry) => [String(entry?.providerSlug || ""), entry]));
    const rawValueCounts = records.map((record) => {
        const sections = Array.isArray(record?.structuredSummary?.sections) ? record.structuredSummary.sections : [];
        return {
            attributeValueCount: record?.structuredSummary?.attributeValueCount,
            sectionValueCount: sections.map((section) => section?.valueCount)
        };
    });
    const allLocalIdsUnresolved = roster.length > 0
        && roster.every((entry) => entry?.localEntityId === null && entry?.identityStatus === "unresolvedNoLocalEntityId")
        && records.every((record) => record?.localEntityId === null && record?.identityStatus === "providerRecordIdentityOnly");
    const allTypedFieldsUnresolved = records.length > 0 && rawValueCounts.every((counts) =>
        counts.attributeValueCount === 0 && counts.sectionValueCount.every((count) => count === 0));
    const providerOnlyEntities = roster.map((entry) => {
        const providerSlug = String(entry?.providerSlug || "");
        const providerEntityIds = uniqueSorted(records
            .filter((record) => String(record?.providerSlug || "") === providerSlug)
            .map((record) => record?.embeddedId));
        return {
            rosterName: entry?.rosterName || null,
            providerSlug,
            providerEntityIds,
            localEntityId: null,
            identityStatus: "unresolvedNoLocalEntityId",
            typedFieldStatus: "notMaterialized"
        };
    });
    const structurallyCaptured = validation?.valid === true
        && snapshot?.status === "capturedSourceRecordsFailClosed"
        && claim.targetGameVersion === TARGET_GAME_VERSION
        && claim.provider === "genshin-db"
        && claim.sourceFamily === "GenshinData-derived"
        && roster.length === 3
        && new Set(roster.map((entry) => entry?.providerSlug)).size === 3
        && records.length === 6
        && claim.coverage?.requestedRecordCount === 6
        && claim.coverage?.capturedRecordCount === 6
        && claim.coverage?.missingRecordCount === 0
        && claim.coverage?.sourceFamilyCount === 1
        && allLocalIdsUnresolved
        && allTypedFieldsUnresolved
        && providerOnlyEntities.every((entity) => entity.providerSlug && entity.providerEntityIds.length > 0);

    return {
        captureReference,
        captureValidation: {
            status: structurallyCaptured ? "validatedFromRawBytes" : "invalid",
            valid: structurallyCaptured,
            reasons: structurallyCaptured ? [] : uniqueSorted(validation?.reasons || ["captureStructureInvalid"])
        },
        status: structurallyCaptured ? "rawCapturedIdentityUnresolved" : "coveragePending",
        targetGameVersion: claim.targetGameVersion || null,
        provider: claim.provider || null,
        sourceFamily: claim.sourceFamily || null,
        requestedRecordCount: records.length,
        capturedRecordCount: records.filter((record) => record?.status === "captured").length,
        providerOnlyEntityCount: structurallyCaptured ? providerOnlyEntities.length : 0,
        providerOnlyEntities: structurallyCaptured ? providerOnlyEntities : [],
        fieldVerification: "notVerified",
        localEntityIdResolution: allLocalIdsUnresolved ? "unresolved" : "notEstablished",
        typedFieldMaterialization: allTypedFieldsUnresolved ? "unresolved" : "notEstablished",
        strictEligible: false,
        certificateEligible: false,
        canonicalPromotionEligible: false,
        calculationAccepted: false
    };
}

function dataFile(dataRoot, relativePath) {
    return path.join(dataRoot, ...String(relativePath).split("/"));
}

function countBy(values) {
    return Object.fromEntries([...values.reduce((counts, value) => {
        const key = String(value);
        counts.set(key, (counts.get(key) || 0) + 1);
        return counts;
    }, new Map())].sort(([a], [b]) => a.localeCompare(b)));
}

function uniqueSorted(values) {
    return [...new Set((values || []).filter((value) => value !== null && value !== undefined).map(String))].sort((a, b) => a.localeCompare(b));
}

function deriveEntityId(candidateId) {
    const value = String(candidateId || "");
    const patterns = [
        /^(?:artifact|behavior|behavior-modifier|talent-gap-spec):([^:]+)/u,
        /^w_(\d+)/u,
        /^genshin:v2:weapon:(\d+)/u,
        /^weapon:(\d+)/u
    ];
    for (const pattern of patterns) {
        const match = value.match(pattern);
        if (match) return String(match[1]);
    }
    return null;
}

function deriveEntityKind(candidateId, layer) {
    const value = String(candidateId || "");
    if (value.startsWith("artifact:") || layer === "artifactEffectSpec") return "artifact";
    if (value.startsWith("w_") || value.startsWith("genshin:v2:weapon:") || layer === "weaponEffectSpec") return "weapon";
    if (value.startsWith("behavior-modifier:")) return "behaviorModifier";
    if (value.startsWith("talent-gap-spec:")) return "talentGap";
    return "characterBehavior";
}

function candidateFieldFamilies(candidateId, layer) {
    const value = String(candidateId || "");
    const families = new Set();
    if (layer === "artifactEffectSpec") {
        families.add("catalog");
        families.add("modifiers");
    } else if (layer === "weaponEffectSpec") {
        families.add("catalog");
        families.add("modifiers");
    } else if (layer === "talentGapEffectSpec") {
        families.add("catalog");
        families.add("talentScaling");
        families.add("modifiers");
    } else if (value.includes(":constellation:")) {
        families.add("catalog");
        families.add("constellation");
        families.add("modifiers");
    } else if (value.includes(":talent:")) {
        families.add("catalog");
        families.add("talentScaling");
        families.add("modifiers");
    } else if (layer === "behaviorModifier") {
        families.add("modifiers");
    } else {
        families.add("catalog");
    }
    return CALCULATION_FIELD_FAMILIES.filter((family) => families.has(family));
}

function loadQueue(queueInput) {
    if (queueInput === undefined || queueInput === null) {
        const bytes = fs.readFileSync(defaultQueuePath);
        return {
            value: JSON.parse(bytes.toString("utf8")),
            path: relativeRepositoryPath(defaultQueuePath),
            bytes: bytes.length,
            rawSha256: sha256(bytes)
        };
    }
    if (typeof queueInput === "string") {
        const file = path.resolve(queueInput);
        const bytes = fs.readFileSync(file);
        return {
            value: JSON.parse(bytes.toString("utf8")),
            path: relativeRepositoryPath(file),
            bytes: bytes.length,
            rawSha256: sha256(bytes)
        };
    }
    const value = queueInput.value && queueInput.tasks === undefined ? queueInput.value : queueInput;
    const rawSha256 = queueInput.rawSha256 || queueInput.sourceQueueDigest || value.sourceQueueDigest || null;
    return {
        value,
        path: queueInput.path || relativeRepositoryPath(defaultQueuePath),
        bytes: Number.isInteger(queueInput.bytes) ? queueInput.bytes : null,
        rawSha256: /^[a-f0-9]{64}$/u.test(String(rawSha256 || "")) ? rawSha256 : null
    };
}

function queueScopeRow(task) {
    const candidateId = String(task?.candidateId || "");
    return {
        candidateId,
        layer: String(task?.layer || ""),
        dataset: String(task?.dataset || ""),
        entityId: deriveEntityId(candidateId)
    };
}

function queueProgressProjection(task) {
    const progress = task?.progress || {};
    const evidence = progress.evidence || {};
    const calculation = progress.calculation || {};
    const work = progress.work || {};
    const deferralValidation = work.deferralValidation || {};
    return {
        evidence: {
            status: evidence.status ?? null,
            strictEligible: evidence.strictEligible === true,
            strictGameVersionBinding: evidence.strictGameVersionBinding === true
        },
        calculation: {
            status: calculation.status ?? null,
            reportedConsumerStatus: calculation.reportedConsumerStatus ?? null
        },
        work: {
            status: work.status ?? null,
            closed: work.closed === true,
            verificationGranted: work.verificationGranted === true,
            promotionGranted: work.promotionGranted === true,
            decisionId: work.decisionId ?? null,
            deferralValidation: {
                valid: deferralValidation.valid === true,
                errors: uniqueSorted(deferralValidation.errors)
            },
            nextTask: work.nextTask ?? null
        }
    };
}

function queueRecordProjection(task) {
    const scope = queueScopeRow(task);
    const frontier = task?.searchFrontier || {};
    const certificate = task?.certificate || {};
    return {
        ...scope,
        terminalState: task?.terminalState ?? null,
        primaryBlockReason: task?.primaryBlockReason ?? null,
        blockReasons: uniqueSorted(task?.blockReasons),
        transitionLane: task?.transitionLane ?? null,
        mappingStatus: task?.mappingStatus ?? null,
        consumerStatus: task?.consumerStatus ?? null,
        machineEvidenceReady: task?.machineEvidenceReady === true,
        autoProcessableNow: task?.autoProcessableNow === true,
        taskStatus: task?.task?.status ?? null,
        searchFrontier: {
            status: frontier.status ?? null,
            exhausted: frontier.exhausted === true
        },
        progress: queueProgressProjection(task),
        strictEligible: certificate.strictEligible === true
    };
}

function queueScopeProjection(tasks) {
    return tasks.map(queueScopeRow).sort((a, b) => [a.candidateId, a.layer, a.dataset, a.entityId || ""].join("\u0000").localeCompare([b.candidateId, b.layer, b.dataset, b.entityId || ""].join("\u0000")));
}

function queueReference(queueInput, tasks) {
    const scopeRows = queueScopeProjection(tasks);
    return {
        path: queueInput.path || relativeRepositoryPath(defaultQueuePath),
        projectionVersion: QUEUE_PROJECTION_VERSION,
        candidateCount: tasks.length,
        taskCount: tasks.length,
        rawBytes: queueInput.bytes,
        rawSha256: queueInput.rawSha256,
        projectionDigest: digest(scopeRows)
    };
}

function buildTrackedDatasets(dataRoot) {
    const baseline = buildVersionBaselineSnapshot({ dataRoot });
    const datasets = TRACKED_DATASETS.map((relativePath) => {
        const file = dataFile(dataRoot, relativePath);
        const value = readJson(file);
        const baselineDataset = baseline.datasets[relativePath];
        const entityDigests = Object.fromEntries(Object.entries(baselineDataset?.entities || {}).sort(([a], [b]) => a.localeCompare(b)));
        const entityIds = Object.keys(value || {}).map(String).sort((a, b) => a.localeCompare(b));
        const nestedEntityCounts = nestedDatasetEntityCounts(relativePath, value);
        return {
            dataset: relativePath,
            path: `games/genshin/data/${relativePath}`,
            sourceVersion: baseline.targetGameVersion?.gameVersion || null,
            entityCount: entityIds.length,
            entityCountScope: "rootObjectKeys",
            entityIds,
            nestedEntityCounts,
            digest: baselineDataset?.digest || sha256(fs.readFileSync(file)),
            entityDigests,
            calculationFieldFamilies: [...(DATASET_FIELD_FAMILIES[relativePath] || [])]
        };
    });
    return { baseline, datasets };
}

function countNestedRecords(value) {
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === "object") return Object.keys(value).length;
    return 0;
}

function nestedDatasetEntityCounts(relativePath, value) {
    const nested = {};
    const add = (name, child) => { nested[name] = countNestedRecords(child); };
    switch (relativePath) {
        case "base-stats.json":
            add("characters", value?.characters);
            add("weapons", value?.weapons);
            break;
        case "enemies.json":
            add("categories", value?.categories);
            add("presets", value?.presets);
            break;
        case "calc/reaction-definitions.json":
            add("characterLevelMultipliers", value?.characterLevelMultipliers);
            add("crystallizeShieldBase", value?.crystallizeShieldBase);
            add("options", value?.options);
            add("directReactionEntryRules", value?.directReactionEntryRules);
            break;
        case "calc/talent-effect-registry.json":
            add("records", value?.records);
            break;
        case "calc/constellation-effect-registry.json":
            add("characters", value?.characters);
            add("effectsById", value?.effectsById);
            break;
        case "calc/constellation-source-index.json":
            add("projects", value?.projects);
            add("characters", value?.characters);
            break;
        case "calc/weapon-effect-registry.json":
            add("weapons", value?.weapons);
            break;
        case "calc/attack-mode-rules.json":
            add("talentSourceOverrides", value?.talentSourceOverrides);
            add("characters", value?.characters);
            break;
        default:
            nested.root = countNestedRecords(value);
            break;
    }
    return Object.fromEntries(Object.entries(nested).sort(([a], [b]) => a.localeCompare(b)));
}

function expectedDigestFromSnapshot(snapshot, key) {
    return snapshot?.[key] || null;
}

function buildOfficial7Evidence(dataRoot, queueIds) {
    const transitionRoot = dataFile(dataRoot, "v2/version-transitions/6.7-to-7.0");
    const officialChangeIndexFile = path.join(transitionRoot, "official-change-index.json");
    const upstreamHeadFile = dataFile(dataRoot, "v2/upstream-version-head.json");
    const officialWeaponSnapshotFile = path.join(transitionRoot, "official-weapon-frontier-11301-11303-snapshot.json");
    const captureManifestFile = path.join(transitionRoot, "sources", "hoyowiki-official-weapon-frontier-11301-11303", "capture-manifest.json");
    // The manifest-owned transition contract is the v2 root artifact.  The
    // transition directory holds evidence and checkpoints, not a duplicate
    // contract file.
    const versionTransitionFile = dataFile(dataRoot, "v2/version-transition.json");
    const partialDiscoveryFile = path.join(transitionRoot, "partial-discovery.json");
    const index = readJson(officialChangeIndexFile);
    const upstreamHead = readJson(upstreamHeadFile);
    const snapshot = readJson(officialWeaponSnapshotFile);
    const captureManifest = readJson(captureManifestFile);

    const indexChanges = Array.isArray(index?.claim?.changes) ? index.claim.changes : [];
    const rawEntities = Array.isArray(snapshot?.claim?.entities) ? snapshot.claim.entities : [];
    const rawArtifactMap = new Map();
    const rawEntityRecords = rawEntities.map((entity) => {
        const directEntry = entity?.sourceEvidence?.entry || entity?.sourceEvidence?.aggregate?.entry || null;
        const rawRefs = [];
        const addRawRef = (ref, kind) => {
            if (!ref?.rawArtifactPath) return;
            const key = ref.rawArtifactPath;
            const file = path.join(repositoryRoot, ...String(key).split("/"));
            const expected = ref.rawArtifactSha256 || null;
            const observed = fileReference(file, expected);
            const artifact = {
                path: key,
                kind,
                entityId: String(entity?.entityId || ""),
                expectedSha256: expected,
                observedSha256: observed.sha256,
                bytes: observed.bytes,
                exists: observed.exists,
                integrityStatus: observed.exists && expected && observed.sha256 === expected ? "verified" : observed.exists ? "mismatch" : "missing"
            };
            rawArtifactMap.set(key, artifact);
            rawRefs.push(key);
        };
        addRawRef(directEntry, "officialWeaponEntry");
        const aggregateEntry = entity?.sourceEvidence?.aggregate?.entry;
        addRawRef(aggregateEntry, "officialWeaponAggregate");
        const candidateIds = uniqueSorted((entity?.candidateClaims || []).map((claim) => claim?.candidateId).filter((id) => queueIds.has(String(id))));
        const allCandidateIds = uniqueSorted((entity?.candidateClaims || []).map((claim) => claim?.candidateId));
        return {
            entityId: String(entity?.entityId || ""),
            provider: entity?.provider?.name || snapshot?.claim?.provider || null,
            sourceFamily: snapshot?.claim?.sourceFamily || null,
            identityStatus: entity?.identityResolution?.status || null,
            candidateIds: candidateIds,
            observedCandidateIds: allCandidateIds,
            candidateClaimCount: Array.isArray(entity?.candidateClaims) ? entity.candidateClaims.length : 0,
            parsedFieldNames: Object.keys(entity?.parsedFields || {}).sort((a, b) => a.localeCompare(b)),
            rawArtifactPaths: uniqueSorted(rawRefs),
            providerVersionEvidence: {
                status: entity?.providerVersionEvidence?.status || null,
                strictGameVersionBinding: entity?.providerVersionEvidence?.strictGameVersionBinding || "missing",
                observedVersion: entity?.providerVersionEvidence?.observedText || null,
                targetGameVersion: TARGET_GAME_VERSION
            },
            status: "rawCapturedFieldVerificationPending",
            fieldVerification: "notVerified",
            certificateEligible: false,
            canonicalPromotionEligible: false
        };
    });
    const indexRef = fileReference(officialChangeIndexFile);
    const headRef = fileReference(upstreamHeadFile);
    const snapshotRef = fileReference(officialWeaponSnapshotFile);
    const manifestRef = fileReference(captureManifestFile);
    const transitionRef = fileReference(versionTransitionFile);
    const partialDiscoveryRef = fileReference(partialDiscoveryFile);
    const newRosterCaptureEvidence = buildNewRosterCaptureEvidence(dataRoot);
    return {
        targetGameVersion: TARGET_GAME_VERSION,
        transitionId: TRANSITION_ID,
        changeIndex: {
            reference: indexRef,
            fieldDigestAlgorithm: index?.fieldDigestAlgorithm || null,
            fieldDigest: index?.fieldDigest || null,
            changeCount: indexChanges.length,
            changes: indexChanges.map((change, index) => ({
                index,
                changeId: String(change?.changeId || ""),
                entityKind: change?.entityKind || null,
                entityId: change?.entityId === undefined ? null : String(change.entityId),
                changeKind: change?.changeKind || null,
                candidateIds: uniqueSorted(change?.candidateIds),
                candidateMappingStatus: change?.candidateMappingStatus || null,
                evidenceRef: `${indexRef.path}#/claim/changes/${index}`
            }))
        },
        rawSnapshot: {
            reference: snapshotRef,
            kind: snapshot?.kind || null,
            fieldDigestAlgorithm: snapshot?.fieldDigestAlgorithm || null,
            fieldDigest: snapshot?.fieldDigest || null,
            status: snapshot?.status || null,
            summary: clone(snapshot?.summary || {}),
            entityCount: rawEntities.length
        },
        captureManifest: {
            reference: manifestRef,
            provider: captureManifest?.provider || null,
            sourceFamily: captureManifest?.sourceFamily || null,
            immutable: captureManifest?.immutable === true,
            status: captureManifest?.status || null
        },
        rawArtifacts: [...rawArtifactMap.values()].sort((a, b) => a.path.localeCompare(b.path)),
        rawEntities: rawEntityRecords.sort((a, b) => a.entityId.localeCompare(b.entityId)),
        newRosterCapture: newRosterCaptureEvidence,
        versionEvidence: {
            upstreamHead: headRef,
            observedGameVersion: upstreamHead?.observedGameVersion || null,
            officialPostId: upstreamHead?.evidence?.postId || null,
            versionTransition: transitionRef,
            partialDiscovery: partialDiscoveryRef,
            strictTargetDatasetAvailable: false,
            completeEntityDiffAvailable: false
        },
        gate: {
            status: "rawEvidenceOnly",
            sourceFamilyCount: snapshot?.summary?.sourceFamilyCount || 0,
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false,
            reason: "Official mutable raw pages and release-note/index changes identify finite work but do not provide complete candidate field proof or an immutable 7.0 binding."
        }
    };
}

function deriveFeatureTargets(official, queueIds) {
    const targets = [];
    for (const change of official.changeIndex.changes) {
        const candidateIds = change.candidateIds.filter((id) => queueIds.has(id));
        const missingCandidateIds = change.candidateIds.filter((id) => !queueIds.has(id));
        const changeId = String(change.changeId || "").toLowerCase();
        const candidateIdText = candidateIds.join("|").toLowerCase();
        const families = change.entityKind === "reaction" || changeId.startsWith("reaction:")
            ? ["reactions", "modifiers"]
            : changeId.includes(":constellation") || candidateIdText.includes(":constellation:")
                ? ["catalog", "constellation", "modifiers"]
                : changeId.includes(":skill") || candidateIdText.includes(":talent:")
                    ? ["catalog", "talentScaling", "modifiers"]
                    : ["catalog", "modifiers"];
        targets.push({
            featureId: change.changeId,
            sourceKind: "officialChangeIndex",
            entityKind: change.entityKind,
            entityId: change.entityId,
            candidateIds,
            missingCandidateIds,
            candidateMappingStatus: change.candidateMappingStatus,
            applicability: "applicable",
            status: "identifiedNeedsReacquisition",
            calculationFieldFamilies: CALCULATION_FIELD_FAMILIES.filter((family) => families.includes(family)),
            evidenceRefs: [change.evidenceRef],
            acceptance: {
                requiredEvidence: ["candidate-scoped 7.0 field evidence", "exact field/scope/version binding", "independent source-family comparison or objective resolution"],
                requiredCalculation: ["affected dependency closure", "consumer regression", "safe local invalidation until proof is complete"],
                safeAction: "Keep current-version overlay fail-closed; do not promote from the official notice alone."
            }
        });
    }
    // The 11301-11303 HoYoWiki capture remains source evidence, but these
    // legacy weapons were neither introduced nor changed in Version 7.0 and
    // therefore must not inflate the finite Version 7.0 feature denominator.
    const officialReleasePath = "games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/r2-official-release-check/post-46233468-api.response";
    for (const artifact of [
        {
            setId: "15047",
            name: "Scarlet Proof",
            candidateIds: [
                "artifact:15047:twoPiece:2pc_atk_percent",
                "artifact:15047:fourPiece:4pc_crit_rate_after_stellar_swirl",
                "artifact:15047:fourPiece:4pc_stellar_swirl_damage_bonus_after_stellar_swirl"
            ]
        },
        {
            setId: "15048",
            name: "Heart of the Furnace",
            candidateIds: [
                "artifact:15048:twoPiece:2pc_atk_percent",
                "artifact:15048:fourPiece:4pc_atk_after_stellar_glimmer",
                "artifact:15048:fourPiece:4pc_team_stellar_glimmer_damage_bonus"
            ]
        }
    ]) {
        const candidateIds = artifact.candidateIds.filter((id) => queueIds.has(id));
        const missingCandidateIds = artifact.candidateIds.filter((id) => !queueIds.has(id));
        targets.push({
            featureId: `artifactSet:${artifact.setId}:7.0`,
            sourceKind: "officialReleaseArtifactSet",
            entityKind: "artifactSet",
            entityId: artifact.setId,
            candidateIds,
            missingCandidateIds,
            candidateMappingStatus: missingCandidateIds.length === 0
                ? "allOfficialFieldsMappedToV2Candidates"
                : "candidateMappingIncomplete",
            applicability: "applicable",
            status: missingCandidateIds.length === 0
                ? "calculationImplementedStrictVerificationPending"
                : "identifiedNeedsCandidateMapping",
            calculationFieldFamilies: ["catalog", "modifiers", "reactions"],
            evidenceRefs: [
                officialReleasePath,
                "games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-artifacts-15047-15048/capture-manifest.json",
                "games/genshin/data/v2/reviews/artifact-15047-15048-7.0-evidence.json",
                `games/genshin/data/artifact-set-effects.json#/${artifact.setId}`,
                `games/genshin/data/calc/artifact-set-modifiers.json#/${artifact.setId}`
            ],
            acceptance: {
                requiredEvidence: ["candidate×claim independent same-version field comparison", "exact raw/revision/field digests"],
                requiredCalculation: ["OFF/ON calculation regression", "target isolation", "shared trigger and non-stacking behavior where applicable"],
                safeAction: `${artifact.name} is calculation-connected from the official 7.0 description; retain needsReview and do not grant strict verification until the independent field bundle validates.`
            }
        });
    }
    for (const weaponSlug of [
        "whitelake-frostfeather", "exaiphanes-blade", "emberwell", "blade-of-atonement",
        "song-of-the-vigil", "echoes-of-the-heart", "covenant-of-frost-and-snow",
        "heretics-molten-blade", "forged-by-the-golden-melody", "frostbreath",
        "clash-of-kings", "jade-vista"
    ]) {
        targets.push({
            featureId: `weapon:new:${weaponSlug}:7.0`,
            sourceKind: "officialReleaseWeaponRoster",
            entityKind: "weapon",
            entityId: null,
            candidateIds: [],
            missingCandidateIds: [],
            candidateMappingStatus: "officialIdentityOnlyLocalEntityUnresolved",
            applicability: "coveragePending",
            status: "officialRosterCapturedIdentityUnresolved",
            calculationFieldFamilies: ["catalog", "modifiers"],
            evidenceRefs: [officialReleasePath],
            coverageGap: {
                reason: "The official 7.0 release identifies this weapon, but the local catalog and persisted fixed-revision provider surface contain no exact entity bridge or refinement field records.",
                reopenTrigger: "A version-bound provider manifest with this exact weapon ID, base stats, R1-R5 values, triggers, targets, durations, stacks and energy fields.",
                nextTask: "Capture and map this official 7.0 weapon from a fixed provider revision before creating calculation candidates."
            },
            acceptance: {
                requiredEvidence: ["exact local/provider entity identity", "version-bound base stats and R1-R5 field records"],
                requiredCalculation: ["modifier mapping", "refinement, trigger, target and energy regressions as applicable"],
                safeAction: "Keep this official weapon out of the selectable local catalog until identity and calculation fields are materialized; do not infer IDs or values from catalog gaps."
            }
        });
    }
    const rosterCapture = official.newRosterCapture || buildNewRosterCaptureEvidence();
    const rosterCaptureValid = rosterCapture.status === "rawCapturedIdentityUnresolved"
        && rosterCapture.captureValidation?.valid === true
        && rosterCapture.providerOnlyEntityCount === 3
        && rosterCapture.providerOnlyEntities.length === 3;
    for (const characterSlug of ["alyosha", "odette", "traveler-cryo"]) targets.push({
        featureId: `character:new:${characterSlug}:7.0`,
        sourceKind: "versionTransitionRosterCapture",
        entityKind: "character",
        entityId: null,
        candidateIds: [],
        missingCandidateIds: [],
        candidateMappingStatus: rosterCaptureValid ? "providerOnlyEntitiesCapturedLocalIdentityUnresolved" : "coveragePending",
        applicability: "coveragePending",
        status: rosterCaptureValid ? "rawCapturedIdentityUnresolved" : "coveragePending",
        calculationFieldFamilies: ["catalog", "baseStats", "talentScaling", "constellation", "modifiers"],
        evidenceRefs: [
            rosterCapture.captureReference.path,
            `games/genshin/data/${NEW_ROSTER_IDENTITY_MANIFEST_RELATIVE_PATH}`,
            official.versionEvidence.upstreamHead.path,
            official.versionEvidence.versionTransition.path,
            official.versionEvidence.partialDiscovery.path,
            official.changeIndex.reference.path
        ],
        rosterCapture,
        coverageGap: {
            reason: rosterCaptureValid
                ? "Byte-validated 7.0 provider records identify the three talent/constellation entities and additionally expose full character records for Alyosha and Odette. Their full IDs remain single-family provider evidence, Traveler lacks a character identity record, and typed calculation fields remain unresolved; roster completeness is not inferred."
                : "No valid persisted local proof identifies the complete 7.0 new-character roster. Behavior shard/entity IDs are transition capture partitions, not roster evidence.",
            reopenTrigger: "A local identity bridge plus version-bound typed field artifacts for every provider-only roster entity, or a newer provider-owned 7.0 roster manifest with exact local binding.",
            nextTask: "Resolve provider-only roster identities against authoritative local catalog evidence, then acquire typed field evidence without inferring values."
        },
        acceptance: {
            requiredEvidence: ["complete 7.0 roster identity artifact", "exact entity IDs and release/version binding"],
            requiredCalculation: ["base stats, talent scaling, constellation, attack mode, and required inputs for each identified entity"],
            safeAction: "Retain the provider-only capture as evidence; keep local identity, typed fields, calculation acceptance, certificates, and canonical promotion fail-closed."
        }
    });
    return targets.sort((a, b) => a.featureId.localeCompare(b.featureId));
}

function deriveCandidateEvidenceStatus(task, rawRefs) {
    const progressEvidence = task?.progress?.evidence || {};
    if (progressEvidence.status === "strictVerified") return "strictVerified";
    if (progressEvidence.status === "historicalVerifiedPendingRevalidation") return progressEvidence.status;
    if (rawRefs.length) return "rawCapturedFieldVerificationPending";
    if (progressEvidence.strictEligible === true || task?.certificate?.strictEligible === true) {
        return "strictEligiblePendingVerification";
    }
    if (typeof progressEvidence.status === "string" && progressEvidence.status) {
        return progressEvidence.status === "verified" || progressEvidence.status === "strictVerified"
            ? "historicalOrCurrentVerificationNeedsVersionCheck"
            : progressEvidence.status;
    }
    if (task?.terminalState === "verifiedSpec") return "historicalOrCurrentVerificationNeedsVersionCheck";
    return "notVerified";
}

function deriveCalculationStatus(task) {
    const progressStatus = task?.progress?.calculation?.status;
    if (typeof progressStatus === "string" && progressStatus) return progressStatus;
    if (task?.consumerStatus === "explicitlyNonCalculative" || task?.terminalState === "nonCalculativeComplete") return "notApplicable";
    if (task?.terminalState === "verifiedSpec" && task?.certificate?.strictEligible !== true) return "versionReverificationPending";
    if (task?.consumerStatus === "notApplicable") return "notApplicable";
    if (task?.consumerStatus) return "pending";
    return "pending";
}

function deriveWorkStatus(task) {
    const progressStatus = task?.progress?.work?.status;
    return typeof progressStatus === "string" && progressStatus ? progressStatus : "pending";
}

function buildCandidateRecord(task, queueRef, officialByCandidate) {
    const scope = queueScopeRow(task);
    const recordProjection = queueRecordProjection(task);
    const rawRefs = officialByCandidate.get(scope.candidateId) || [];
    const families = candidateFieldFamilies(scope.candidateId, scope.layer);
    const evidenceStatus = deriveCandidateEvidenceStatus(task, rawRefs);
    return {
        candidateId: scope.candidateId,
        entityId: scope.entityId,
        entityKind: deriveEntityKind(scope.candidateId, scope.layer),
        layer: scope.layer,
        dataset: scope.dataset,
        applicability: "applicable",
        calculationFieldFamilies: families,
        sourceQueueDigest: queueRef.rawSha256,
        sourceQueueRecordDigest: digest(recordProjection),
        sourceQueue: {
            path: queueRef.path,
            projectionVersion: queueRef.projectionVersion,
            projectionDigest: queueRef.projectionDigest,
            rawSha256: queueRef.rawSha256,
            identity: scope
        },
        queueState: {
            terminalState: task?.terminalState ?? null,
            primaryBlockReason: task?.primaryBlockReason ?? null,
            blockReasons: uniqueSorted(task?.blockReasons),
            transitionLane: task?.transitionLane ?? null,
            mappingStatus: task?.mappingStatus ?? null,
            consumerStatus: task?.consumerStatus ?? null,
            searchFrontierStatus: task?.searchFrontier?.status ?? null,
            searchExhausted: task?.searchFrontier?.exhausted === true,
            taskStatus: task?.task?.status ?? null,
            machineEvidenceReady: task?.machineEvidenceReady === true,
            autoProcessableNow: task?.autoProcessableNow === true
        },
        queueProgress: queueProgressProjection(task),
        evidence: {
            status: evidenceStatus,
            targetGameVersion: TARGET_GAME_VERSION,
            rawCaptured: rawRefs.length > 0,
            rawOnly: rawRefs.length > 0,
            fieldVerification: evidenceStatus === "strictVerified" ? "verified" : "notVerified",
            strictEligible: task?.progress?.evidence?.strictEligible === true || task?.certificate?.strictEligible === true,
            strictVersionBinding: false,
            sourceRefs: rawRefs.map((ref) => ref.evidenceRef),
            note: rawRefs.length
                ? "A captured official raw page is retained for bounded evidence only; raw presence does not verify candidate fields or completion."
                : "No scoped official 7.0 raw artifact is linked to this candidate in the finite inventory; queue evidence remains the scope authority."
        },
        calculation: {
            status: deriveCalculationStatus(task),
            requiredFieldFamilies: families,
            note: task?.terminalState === "nonCalculativeComplete"
                ? "Queue explicitly records this candidate as non-calculative; that is not strict field verification."
                : "Calculation readiness is derived independently from evidence status and remains pending unless a separate queue state says otherwise."
        },
        work: {
            status: deriveWorkStatus(task),
            reason: task?.progress?.work?.decisionId || task?.primaryBlockReason || task?.terminalState || "queueTask",
            decisionId: task?.progress?.work?.decisionId ?? null,
            deferralValidation: clone(task?.progress?.work?.deferralValidation || { valid: false, errors: ["deferralNotRecorded"] }),
            reopenTrigger: task?.searchFrontier?.reopenTrigger || task?.task?.reopenTrigger || null
        },
        certificateEligible: false,
        canonicalPromotionEligible: false,
        officialRawEvidence: rawRefs.map(clone)
    };
}

function withoutQueueRawProvenance(inventory) {
    const copy = clone(inventory);
    delete copy.fieldDigest;
    if (copy.sourceQueue) {
        delete copy.sourceQueue.rawBytes;
        delete copy.sourceQueue.rawSha256;
    }
    if (copy.generatedFrom?.authoritativeQueue) {
        delete copy.generatedFrom.authoritativeQueue.rawBytes;
        delete copy.generatedFrom.authoritativeQueue.rawSha256;
    }
    for (const candidate of copy.candidateRecords || []) {
        delete candidate.sourceQueueDigest;
        delete candidate.sourceQueue?.rawSha256;
    }
    return copy;
}

function fieldDigestMaterial(inventory) {
    return withoutQueueRawProvenance(inventory);
}

function buildInventory({ dataRoot = defaultDataRoot, queue: queueInput } = {}) {
    const queueLoaded = loadQueue(queueInput);
    const queue = queueLoaded.value;
    if (!queue || typeof queue !== "object" || !Array.isArray(queue.tasks)) throw new Error("authoritative queue tasks are missing");
    const tasks = queue.tasks.map((task) => ({ ...task, candidateId: String(task?.candidateId || "") }));
    const queueRef = queueReference(queueLoaded, tasks);
    const scopeRows = queueScopeProjection(tasks);
    const candidateIds = scopeRows.map((row) => row.candidateId);
    const queueIds = new Set(candidateIds);
    const duplicateQueueCandidateIds = candidateIds.filter((id, index) => candidateIds.indexOf(id) !== index);
    const { baseline, datasets } = buildTrackedDatasets(dataRoot);
    const official = buildOfficial7Evidence(dataRoot, queueIds);
    const officialByCandidate = new Map();
    for (const entity of official.rawEntities) {
        for (const candidateId of entity.candidateIds) {
            const list = officialByCandidate.get(candidateId) || [];
            list.push({
                featureId: `officialRaw:weapon:${entity.entityId}:7.0`,
                entityId: entity.entityId,
                evidenceRef: `${official.rawSnapshot.reference.path}#/claim/entities/${official.rawEntities.indexOf(entity)}`,
                rawArtifactPaths: entity.rawArtifactPaths,
                status: entity.status
            });
            officialByCandidate.set(candidateId, list);
        }
    }
    for (const list of officialByCandidate.values()) list.sort((a, b) => a.featureId.localeCompare(b.featureId));
    const candidateRecords = tasks
        .map((task) => buildCandidateRecord(task, queueRef, officialByCandidate))
        .sort((a, b) => a.candidateId.localeCompare(b.candidateId));
    const featureTargets = deriveFeatureTargets(official, queueIds);
    const generatedFrom = {
        authoritativeQueue: clone(queueRef),
        versionBaseline: fileReference(dataFile(dataRoot, "v2/version-baseline.json")),
        versionBaselineGenerator: {
            path: "scripts/genshinVersionBaseline.cjs",
            version: baseline?.generator?.version || null
        },
        trackedDatasets: datasets.map((dataset) => ({
            path: dataset.path,
            digest: dataset.digest,
            entityCount: dataset.entityCount,
            entityCountScope: dataset.entityCountScope,
            nestedEntityCounts: dataset.nestedEntityCounts
        })),
        sourceCatalog: fileReference(dataFile(dataRoot, "v2/source-catalog.json")),
        official7_0: {
            upstreamVersionHead: official.versionEvidence.upstreamHead,
            officialChangeIndex: official.changeIndex.reference,
            officialWeaponRawSnapshot: official.rawSnapshot.reference,
            officialCaptureManifest: official.captureManifest.reference,
            newRosterCapture: official.newRosterCapture.captureReference,
            versionTransition: official.versionEvidence.versionTransition,
            partialDiscovery: official.versionEvidence.partialDiscovery
        }
    };
    const candidateStatusCounts = countBy(candidateRecords.map((candidate) => candidate.work.status));
    const evidenceStatusCounts = countBy(candidateRecords.map((candidate) => candidate.evidence.status));
    const calculationStatusCounts = countBy(candidateRecords.map((candidate) => candidate.calculation.status));
    const layerCounts = countBy(candidateRecords.map((candidate) => candidate.layer));
    const datasetCounts = countBy(candidateRecords.map((candidate) => candidate.dataset));
    const familyCounts = countBy(candidateRecords.flatMap((candidate) => candidate.calculationFieldFamilies));
    const targetStatusCounts = countBy(featureTargets.map((target) => target.status));
    const trackedEntityCount = datasets.reduce((sum, dataset) => sum + dataset.entityCount, 0);
    const trackedNestedEntityCount = datasets.reduce((sum, dataset) => sum + Object.values(dataset.nestedEntityCounts || {}).reduce((nestedSum, count) => nestedSum + count, 0), 0);
    const rawCandidateCount = candidateRecords.filter((candidate) => candidate.evidence.rawCaptured).length;
    const resultWithoutDigest = {
        schemaVersion: 1,
        kind: "genshinR2AcceptanceInventory",
        status: "passed",
        generatedAt,
        generator: { name: "genshinR2AcceptanceInventory.cjs", version: GENERATOR_VERSION },
        transition: {
            transitionId: TRANSITION_ID,
            sourceGameVersion: baseline?.targetGameVersion?.gameVersion || null,
            targetGameVersion: TARGET_GAME_VERSION,
            targetVersionEvidence: "official7_0_head_and_change_index_only",
            strictTargetDatasetAvailable: false,
            completeEntityDiffAvailable: false
        },
        policy: {
            evidenceOnly: true,
            noNetworkFetch: true,
            rawCaptureIsNotFieldVerification: true,
            rawCaptureIsNotCompletion: true,
            noCertificateIssuance: true,
            noCanonicalPromotion: true,
            noSearchExhaustedFromAbsence: true,
            unknownApplicabilityIsRejected: true,
            rosterMustUseLocalProof: true,
            fieldDigestAlgorithm: FIELD_DIGEST_ALGORITHM
        },
        sourceQueue: queueRef,
        sourceVersionBaseline: {
            snapshotId: baseline?.snapshotId || null,
            targetGameVersion: clone(baseline?.targetGameVersion || null),
            sourceCatalogDigest: baseline?.sourceCatalogDigest || null,
            trackedDatasetCount: datasets.length
        },
        trackedDatasets: datasets,
        official7_0: official,
        finiteFeatureTargets: featureTargets,
        generatedFrom,
        scope: {
            candidateCount: candidateRecords.length,
            candidateIds,
            candidateIdDigest: digest(candidateIds),
            candidateScopeDigest: digest(scopeRows),
            identityRows: scopeRows,
            duplicateQueueCandidateIds: uniqueSorted(duplicateQueueCandidateIds)
        },
        candidateRecords,
        summary: {
            candidateCount: candidateRecords.length,
            queueTaskCount: tasks.length,
            mappedCandidateCount: candidateRecords.length,
            omittedCandidateCount: 0,
            duplicateCandidateCount: uniqueSorted(duplicateQueueCandidateIds).length,
            allCandidateIdsMapped: duplicateQueueCandidateIds.length === 0 && candidateRecords.length === tasks.length,
            allCandidatesComplete: candidateRecords.length > 0 && candidateRecords.every((row) =>
                row.work.status === "completed" || (row.work.status === "evidenceDeferred" && row.work.deferralValidation.valid)),
            allStrictVerified: candidateRecords.length > 0 && candidateRecords.every((row) => row.evidence.status === "strictVerified"),
            allCalculationReady: candidateRecords.length > 0 && candidateRecords.every((row) => ["activeCanonical", "notRequired"].includes(row.calculation.status)),
            trackedDatasetCount: datasets.length,
            trackedEntityCount,
            officialChangeCount: official.changeIndex.changeCount,
            officialRawEntityCount: official.rawEntities.length,
            officialRawArtifactCount: official.rawArtifacts.length,
            officialRawCandidateCount: rawCandidateCount,
            featureTargetCount: featureTargets.length,
            featureTargetStatusCounts: targetStatusCounts,
            candidateWorkStatusCounts: candidateStatusCounts,
            evidenceStatusCounts,
            calculationStatusCounts,
            layerCounts,
            datasetCounts,
            calculationFieldFamilyCounts: familyCounts,
            trackedEntityCountScope: "sumOfRootObjectKeys; nestedEntityCounts are reported per dataset and are not deduplicated",
            trackedNestedEntityCount,
            strictVerifiedCandidateCount: candidateRecords.filter((candidate) => candidate.evidence.status === "strictVerified").length,
            fieldVerifiedCandidateCount: candidateRecords.filter((candidate) => candidate.evidence.fieldVerification === "verified").length,
            certificateEligible: 0,
            canonicalPromotionEligible: 0,
            searchExhaustedCandidateCount: candidateRecords.filter((candidate) => candidate.queueState.searchExhausted).length
        },
        gate: {
            status: "failClosed",
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false,
            certificateEligible: 0,
            canonicalPromotionEligible: 0,
            allCandidatesComplete: false,
            reasons: [
                "candidateFieldVerificationNotEstablishedForAllRows",
                "official7_0RawCaptureIsUnboundOrSingleFamily",
                "new7_0CharacterRosterIdentityOrTypedFieldsUnresolved",
                "r2InventoryDoesNotIssueCertificatesOrPromoteCanonical"
            ]
        },
        errors: [],
        fieldDigestAlgorithm: FIELD_DIGEST_ALGORITHM
    };
    return {
        ...resultWithoutDigest,
        fieldDigest: digest(fieldDigestMaterial(resultWithoutDigest))
    };
}

function expectedCurrentQueue({ dataRoot = defaultDataRoot, queue } = {}) {
    const queueLoaded = loadQueue(queue);
    const tasks = Array.isArray(queueLoaded.value?.tasks) ? queueLoaded.value.tasks : [];
    const ref = queueReference(queueLoaded, tasks);
    return { queueLoaded, tasks, ref };
}

function validateInventory(inventory, { compareCurrent = true, dataRoot = defaultDataRoot, queue } = {}) {
    const reasons = [];
    const add = (reason) => { if (!reasons.includes(reason)) reasons.push(reason); };
    if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) return { valid: false, reasons: ["artifactMissing"] };
    if (inventory.schemaVersion !== 1) add("schemaVersionInvalid");
    if (inventory.kind !== "genshinR2AcceptanceInventory") add("kindInvalid");
    if (inventory.status !== "passed") add("statusInvalid");
    if (inventory.transition?.transitionId !== TRANSITION_ID || inventory.transition?.targetGameVersion !== TARGET_GAME_VERSION) add("transitionBindingInvalid");
    if (inventory.policy?.evidenceOnly !== true || inventory.policy?.rawCaptureIsNotFieldVerification !== true || inventory.policy?.rawCaptureIsNotCompletion !== true || inventory.policy?.noCertificateIssuance !== true || inventory.policy?.noCanonicalPromotion !== true || inventory.policy?.noSearchExhaustedFromAbsence !== true) add("failClosedPolicyInvalid");
    if (inventory.fieldDigestAlgorithm !== FIELD_DIGEST_ALGORITHM || inventory.fieldDigest !== digest(fieldDigestMaterial(inventory))) add("fieldDigestInvalid");

    const records = Array.isArray(inventory.candidateRecords) ? inventory.candidateRecords : [];
    const actualIds = records.map((record) => String(record?.candidateId || ""));
    const actualIdSet = new Set();
    actualIds.forEach((id) => {
        if (actualIdSet.has(id)) add(`candidateIdDuplicate:${id}`);
        actualIdSet.add(id);
    });
    const scopeRows = Array.isArray(inventory.scope?.identityRows) ? inventory.scope.identityRows : [];
    const scopeIds = scopeRows.map((row) => String(row?.candidateId || ""));
    if (scopeIds.length !== new Set(scopeIds).size) add("scopeCandidateIdDuplicate");
    if (inventory.scope?.candidateCount !== scopeIds.length || inventory.scope?.candidateIdDigest !== digest(scopeIds) || inventory.scope?.candidateScopeDigest !== digest(scopeRows)) add("scopeDigestInvalid");
    const expectedScopeMap = new Map(scopeRows.map((row) => [String(row.candidateId), row]));
    for (const id of scopeIds) if (!actualIdSet.has(id)) add(`candidateRecordOmission:${id}`);
    for (const id of actualIds) if (!expectedScopeMap.has(id)) add(`candidateRecordUnknown:${id}`);

    const featureTargets = Array.isArray(inventory.finiteFeatureTargets) ? inventory.finiteFeatureTargets : [];
    const featureIds = new Set();
    for (const target of featureTargets) {
        const id = String(target?.featureId || "");
        if (featureIds.has(id)) add(`featureTargetDuplicate:${id}`);
        featureIds.add(id);
        if (!["applicable", "notApplicable", "coveragePending"].includes(target?.applicability)) add(`unknownApplicability:${id}`);
        if (target?.applicability === "notApplicable") {
            if (target?.applicabilityProof?.status !== "deterministic" || !Array.isArray(target?.applicabilityProof?.evidenceRefs) || target.applicabilityProof.evidenceRefs.length === 0) add(`notApplicableWithoutProof:${id}`);
        }
        if (target?.applicability === "coveragePending") {
            if (!target?.coverageGap?.reason || !target?.coverageGap?.reopenTrigger || !target?.coverageGap?.nextTask) add(`coveragePendingReasonMissing:${id}`);
            if (!Array.isArray(target?.evidenceRefs) || target.evidenceRefs.length === 0) add(`coveragePendingEvidenceMissing:${id}`);
            if (Array.isArray(target?.candidateIds) && target.candidateIds.length) add(`coveragePendingHasGuessedCandidates:${id}`);
        }
        const candidateIds = Array.isArray(target?.candidateIds) ? target.candidateIds.map(String) : [];
        if (candidateIds.length !== new Set(candidateIds).size) add(`featureCandidateDuplicate:${id}`);
        for (const candidateId of candidateIds) if (!expectedScopeMap.has(candidateId)) add(`featureCandidateUnknown:${id}:${candidateId}`);
        if (id.startsWith("character:new:")) {
            const capture = target?.rosterCapture;
            const currentCapture = buildNewRosterCaptureEvidence(dataRoot);
            if (!capture || typeof capture !== "object" || Array.isArray(capture)) {
                add("rosterCaptureMissing");
            } else {
                if (capture.captureReference?.path !== currentCapture.captureReference.path
                    || capture.captureReference?.exists !== currentCapture.captureReference.exists
                    || capture.captureReference?.bytes !== currentCapture.captureReference.bytes
                    || capture.captureReference?.sha256 !== currentCapture.captureReference.sha256) add("rosterCaptureReferenceInvalid");
                if (capture.status !== currentCapture.status || capture.captureValidation?.valid !== currentCapture.captureValidation.valid) add("rosterCaptureStatusInvalid");
                if (capture.providerOnlyEntityCount !== (capture.status === "rawCapturedIdentityUnresolved" ? 3 : 0)
                    || !Array.isArray(capture.providerOnlyEntities)
                    || capture.providerOnlyEntities.length !== capture.providerOnlyEntityCount) add("rosterProviderEntityCountInvalid");
                if (stableJson(capture.providerOnlyEntities || []) !== stableJson(currentCapture.providerOnlyEntities || [])) add("rosterProviderEntityEvidenceInvalid");
                if (capture.status === "rawCapturedIdentityUnresolved") {
                    if (capture.targetGameVersion !== TARGET_GAME_VERSION || capture.provider !== "genshin-db" || capture.sourceFamily !== "GenshinData-derived") add("rosterCaptureBindingInvalid");
                    if (capture.requestedRecordCount !== 6 || capture.capturedRecordCount !== 6) add("rosterCaptureCoverageInvalid");
                    if (capture.localEntityIdResolution !== "unresolved" || capture.typedFieldMaterialization !== "unresolved") add("rosterCaptureIdentityOrFieldsInvalid");
                    if (capture.fieldVerification !== "notVerified" || capture.strictEligible !== false || capture.certificateEligible !== false || capture.canonicalPromotionEligible !== false || capture.calculationAccepted !== false) add("rosterCaptureGateInvalid");
                    for (const entity of capture.providerOnlyEntities) {
                        if (!entity || typeof entity !== "object" || !entity.providerSlug || !Array.isArray(entity.providerEntityIds) || entity.providerEntityIds.length === 0 || entity.localEntityId !== null || entity.identityStatus !== "unresolvedNoLocalEntityId" || entity.typedFieldStatus !== "notMaterialized") add("rosterProviderEntityInvalid");
                    }
                }
            }
            if (target.applicability !== "coveragePending" || candidateIds.length !== 0) add("rosterTargetNotFailClosed");
        }
    }
    const expectedWorkComplete = records.length > 0 && records.every((row) => row?.work?.status === "completed"
        || (row?.work?.status === "evidenceDeferred" && row?.work?.deferralValidation?.valid === true));
    if (inventory.summary?.allCandidatesComplete !== expectedWorkComplete || inventory.gate?.allCandidatesComplete === true) add("fakeAllComplete");
    const expectedStrict = records.length > 0 && records.every((row) => row?.evidence?.status === "strictVerified");
    const expectedCalculation = records.length > 0 && records.every((row) => ["activeCanonical", "notRequired"].includes(row?.calculation?.status));
    if (inventory.summary?.allStrictVerified !== expectedStrict || inventory.summary?.allCalculationReady !== expectedCalculation) add("fakeAllComplete");
    if (inventory.summary?.certificateEligible !== 0 || inventory.summary?.canonicalPromotionEligible !== 0 || inventory.gate?.certificateEligible !== 0 || inventory.gate?.canonicalPromotionEligible !== 0 || inventory.gate?.canIssueEligibilityCertificate !== false || inventory.gate?.canPromoteCanonical !== false) add("gateNotFailClosed");
    if (records.some((record) => record?.certificateEligible !== false || record?.canonicalPromotionEligible !== false)) add("candidateGateNotFailClosed");
    if (records.some((record) => record?.evidence?.status === "strictVerified"
        && record?.queueProgress?.evidence?.status !== "strictVerified")) add("strictVerificationClaimedWithoutFieldProof");
    if (records.some((record) => record?.applicability !== "applicable")) add("candidateApplicabilityInvalid");
    for (const record of records) {
        const expected = expectedScopeMap.get(String(record?.candidateId || ""));
        if (!expected) continue;
        if (record.layer !== expected.layer || record.dataset !== expected.dataset || record.entityId !== expected.entityId) add(`candidateIdentityMismatch:${record.candidateId}`);
        if (record.sourceQueueRecordDigest !== digest(queueRecordProjection({
            ...expected,
            terminalState: record.queueState?.terminalState,
            primaryBlockReason: record.queueState?.primaryBlockReason,
            blockReasons: record.queueState?.blockReasons,
            transitionLane: record.queueState?.transitionLane,
            mappingStatus: record.queueState?.mappingStatus,
            consumerStatus: record.queueState?.consumerStatus,
            machineEvidenceReady: record.queueState?.machineEvidenceReady,
            autoProcessableNow: record.queueState?.autoProcessableNow,
            task: { status: record.queueState?.taskStatus },
            searchFrontier: { status: record.queueState?.searchFrontierStatus, exhausted: record.queueState?.searchExhausted },
            progress: record.queueProgress,
            certificate: { strictEligible: record.evidence?.strictEligible === true }
        }))) {
            add(record.sourceQueueRecordDigest
                ? `candidateQueueRecordDigestStale:${record.candidateId}`
                : `candidateQueueRecordDigestMissing:${record.candidateId}`);
        }
        if (record.evidence?.rawCaptured === true && record.evidence?.fieldVerification === "verified") add(`rawCaptureClaimedVerified:${record.candidateId}`);
    }

    const expectedCurrent = compareCurrent || queue !== undefined ? expectedCurrentQueue({ dataRoot, queue }) : null;
    if (expectedCurrent) {
        const { tasks, ref } = expectedCurrent;
        const expectedRows = queueScopeProjection(tasks);
        if (inventory.sourceQueue?.projectionVersion !== QUEUE_PROJECTION_VERSION || inventory.sourceQueue?.candidateCount !== tasks.length || inventory.sourceQueue?.taskCount !== tasks.length || inventory.sourceQueue?.projectionDigest !== ref.projectionDigest) add("sourceQueueProjectionInvalid");
        if (inventory.scope?.candidateCount !== expectedRows.length || digest(inventory.scope?.identityRows || []) !== digest(expectedRows)) add("currentQueueScopeMismatch");
        if (ref.rawSha256 && inventory.sourceQueue?.rawSha256 !== ref.rawSha256) add("sourceQueueRawDigestStale");
        const expectedById = new Map(tasks.map((task) => [String(task?.candidateId || ""), task]));
        for (const record of records) {
            const task = expectedById.get(String(record?.candidateId || ""));
            if (!task) continue;
            const expectedProjection = queueRecordProjection(task);
            if (record.sourceQueueRecordDigest !== digest(expectedProjection)) add(`candidateQueueRecordDigestStale:${record.candidateId}`);
            if (record.sourceQueue?.projectionDigest !== ref.projectionDigest) add(`candidateQueueProjectionDigestMismatch:${record.candidateId}`);
        }
        if (records.length !== tasks.length) add("candidateRecordCountMismatch");
    }
    if (inventory.trackedDatasets?.length !== TRACKED_DATASETS.length || new Set((inventory.trackedDatasets || []).map((item) => item?.dataset)).size !== TRACKED_DATASETS.length) add("trackedDatasetCoverageInvalid");
    if (compareCurrent) {
        try {
            const expected = buildInventory({ dataRoot, queue });
            if (stableJson(withoutQueueRawProvenance(expected)) !== stableJson(withoutQueueRawProvenance(inventory))) add("artifactNotDeterministicForCurrentInputs");
        } catch (error) {
            add(`currentInputsInvalid:${error.message}`);
        }
    }
    return { valid: reasons.length === 0, reasons };
}

function reportMarkdown(inventory) {
    const summary = inventory.summary || {};
    const lines = [
        "# Genshin r2 acceptance inventory",
        "",
        `Generated: **${inventory.generatedAt || generatedAt}**`,
        `Target transition: **${inventory.transition?.transitionId || TRANSITION_ID}** (target **${inventory.transition?.targetGameVersion || TARGET_GAME_VERSION}**)`,
        "",
        "This report is a finite, evidence-derived acceptance inventory. It does not issue eligibility certificates, promote canonical data, or infer a complete 7.0 roster from transition shards.",
        "Feature targets mix official changes, weapon evidence samples and a bounded roster evidence target. Their count is not a homogeneous denominator for implemented 7.0 functions; raw capture is never functional acceptance.",
        "",
        "## Scope and gates",
        "",
        `- Authoritative queue candidates/tasks: **${summary.candidateCount ?? 0} / ${summary.queueTaskCount ?? 0}**`,
        `- Candidate IDs mapped: **${summary.mappedCandidateCount ?? 0}**; omitted: **${summary.omittedCandidateCount ?? 0}**; duplicate queue IDs: **${summary.duplicateCandidateCount ?? 0}**`,
        `- r2 work disposed: **${(summary.candidateWorkStatusCounts?.completed || 0) + (summary.candidateWorkStatusCounts?.evidenceDeferred || 0)}/${summary.candidateCount || 0}**; completed **${summary.candidateWorkStatusCounts?.completed || 0}**; evidence-deferred **${summary.candidateWorkStatusCounts?.evidenceDeferred || 0}**; pending **${summary.candidateWorkStatusCounts?.pending || 0}**. Deferral is not verification or calculation support.`,
        `- Strict field-verified candidates: **${summary.strictVerifiedCandidateCount ?? 0}**; raw-captured candidates (not verified): **${summary.officialRawCandidateCount ?? 0}**`,
        `- Certificates eligible: **${summary.certificateEligible ?? 0}**; canonical promotions: **${summary.canonicalPromotionEligible ?? 0}**`,
        `- Gate: **${inventory.gate?.status || "failClosed"}**; all candidates complete: **${summary.allCandidatesComplete === true ? "yes" : "no"}**`,
        "",
        "## Tracked calculation datasets",
        "",
        "| Dataset | Root keys | Nested records | Digest | Calculation families |",
        "| --- | ---: | --- | --- | --- |",
        ...(inventory.trackedDatasets || []).map((dataset) => `| ${dataset.dataset} | ${dataset.entityCount} (${dataset.entityCountScope}) | ${Object.entries(dataset.nestedEntityCounts || {}).map(([name, count]) => `${name}:${count}`).join("; ") || "—"} | ${String(dataset.digest || "").slice(0, 16)}… | ${(dataset.calculationFieldFamilies || []).join(", ")} |`),
        "",
        "## Finite 7.0 feature targets",
        "",
        "| Target | Applicability | Status | Candidate IDs |",
        "| --- | --- | --- | --- |",
        ...(inventory.finiteFeatureTargets || []).map((target) => `| ${target.featureId} | ${target.applicability} | ${target.status} | ${(target.candidateIds || []).join(", ") || "—"} |`),
        "",
        "## Evidence boundary",
        "",
        `- Official change-index entries: **${summary.officialChangeCount ?? 0}**; official raw entities: **${summary.officialRawEntityCount ?? 0}**; raw artifacts: **${summary.officialRawArtifactCount ?? 0}**.`,
        "- Official weapon raw pages remain mutable/unbound for strict 7.0 candidate verification; their presence is recorded as raw evidence only.",
        (() => {
            const roster = (inventory.finiteFeatureTargets || []).find((target) => target.featureId === "character:new:alyosha:7.0");
            const capture = roster?.rosterCapture;
            if (capture?.status === "rawCapturedIdentityUnresolved") {
                return `- New-character roster raw capture: **${capture.providerOnlyEntityCount} provider-only entities / ${capture.capturedRecordCount} records**, byte-validated; local IDs and typed fields unresolved, so coverage remains pending and no calculation acceptance is issued.`;
            }
            return "- New-character roster coverage is **pending** because no valid local roster proof is persisted. Shard IDs are not treated as new-character IDs.";
        })(),
        "",
        `Inventory field digest: \`${inventory.fieldDigest || ""}\``,
        ""
    ];
    return lines.join("\n");
}

function writeArtifacts({ dataRoot = defaultDataRoot, queue, artifactPath = defaultArtifactPath, reportPath = defaultReportPath } = {}) {
    const inventory = buildInventory({ dataRoot, queue });
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(artifactPath, `${JSON.stringify(stableValue(inventory), null, 2)}\n`, "utf8");
    fs.writeFileSync(reportPath, reportMarkdown(inventory), "utf8");
    return inventory;
}

if (require.main === module) {
    const dataRoot = process.env.GENSHIN_DATA_ROOT || defaultDataRoot;
    const queuePath = process.env.GENSHIN_R2_QUEUE_PATH || defaultQueuePath;
    const artifactPath = process.env.GENSHIN_R2_ACCEPTANCE_INVENTORY_PATH || defaultArtifactPath;
    const reportPath = process.env.GENSHIN_R2_ACCEPTANCE_REPORT_PATH || defaultReportPath;
    const inventory = writeArtifacts({ dataRoot, queue: queuePath, artifactPath, reportPath });
    const validation = validateInventory(inventory, { compareCurrent: false });
    process.stdout.write(`${JSON.stringify({ status: inventory.status, validation, summary: inventory.summary }, null, 2)}\n`);
    if (!validation.valid) process.exitCode = 1;
}

module.exports = {
    CALCULATION_FIELD_FAMILIES,
    DATASET_FIELD_FAMILIES,
    FIELD_DIGEST_ALGORITHM,
    GENERATOR_VERSION,
    NEW_ROSTER_CAPTURE_RELATIVE_PATH,
    QUEUE_PROJECTION_VERSION,
    TARGET_GAME_VERSION,
    TRANSITION_ID,
    defaultArtifactPath,
    defaultDataRoot,
    defaultQueuePath,
    defaultReportPath,
    digest,
    fieldDigestMaterial,
    generatedAt,
    buildInventory,
    buildOfficial7Evidence,
    buildNewRosterCaptureEvidence,
    buildTrackedDatasets,
    candidateFieldFamilies,
    nestedDatasetEntityCounts,
    queueProgressProjection,
    deriveEntityId,
    deriveFeatureTargets,
    reportMarkdown,
    stableJson,
    validateInventory,
    withoutQueueRawProvenance,
    writeArtifacts
};
