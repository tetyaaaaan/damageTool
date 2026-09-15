"use strict";

/**
 * Candidate/claim materialization audit for the ready behaviorSpec lane.
 *
 * This is intentionally an evidence boundary, not a verifier or a source
 * fetcher.  It reuses the already captured transition artifacts, recomputes
 * their raw/file digests, and records exactly why the captured entity records
 * cannot yet close candidate claims.  In particular, prose/templates are
 * retained as pointers only; no token or numeric value is inferred from
 * them.  The output never issues a certificate, changes the queue, or
 * promotes Runtime/canonical data.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { digestStable, stableValue } = require("./genshinVersionEvidenceValidation.cjs");

const ROOT = path.resolve(__dirname, "..");
const TRANSITION_ROOT = path.join(ROOT, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0");
const CHAR_ROOT = path.join(ROOT, "games", "genshin", "data", "v2", "characters");
const QUEUE_PATH = path.join(ROOT, "reports", "genshin-evidence-task-queue.json");
const FRONTIER_PATH = path.join(ROOT, "reports", "genshin-candidate-source-coverage-frontier-inventory.json");
const ARTIFACT_PATH = path.join(ROOT, "games", "genshin", "data", "v2", "reviews", "r2-behavior-spec-materialization-audit.json");
const REPORT_PATH = path.join(ROOT, "reports", "genshin-r2-behavior-spec-materialization-audit.md");
const SCHEMA_PATH = path.join(ROOT, "games", "genshin", "data", "schema", "r2-behavior-spec-materialization-audit.schema.json");

const GENERATED_AT = "2026-08-29T00:00:00.000Z";
const GENERATOR_VERSION = "genshinR2BehaviorSpecMaterializationAudit/1";
const TRANSITION_ID = "genshin:6.7->7.0";
const TARGET_VERSION = "7.0";
const LAYER = "behaviorSpec";
const CLAIM_FIELDS = ["sourceText", "timing", "execution", "lifecycle", "energy", "snapshot", "runtime"];
const EXTERNAL_CLAIM_FIELDS = CLAIM_FIELDS.filter((field) => field !== "runtime");
const INTERNAL_CLAIM_FIELDS = ["runtime"];
const TRAVELER_IDS = new Set(["10000005", "10000007"]);
const EXPECTED_CANDIDATE_COUNT = 1533;
const EXPECTED_CLAIM_COUNT = EXPECTED_CANDIDATE_COUNT * CLAIM_FIELDS.length;
const EXPECTED_REVISIONS = {
    "6.7": "1bab2cdba4d218fd5caa46b5f54e7884ee8359a2",
    "7.0": "8b15995fa220c88a4d0d7ffe1e21b041d0b32588"
};

function valueDigest(value) {
    return digestStable(value === undefined ? null : value);
}

const DATASETS = ["behaviorPilot", ...Array.from({ length: 12 }, (_, index) => `behaviorBatch${index + 1}`)];
const SNAPSHOT_FILES = fs.existsSync(TRANSITION_ROOT)
    ? fs.readdirSync(TRANSITION_ROOT).filter((file) => /^behavior(?:-entity|-shard-\d+)-snapshot\.json$/.test(file)).sort()
    : [];

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sha256(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function gitBlobSha(bytes) {
    const header = Buffer.from(`blob ${bytes.length}\0`, "utf8");
    return crypto.createHash("sha1").update(Buffer.concat([header, bytes])).digest("hex");
}

function relative(file) {
    return path.relative(ROOT, file).replaceAll("\\", "/");
}

function repoPath(file) {
    return path.resolve(ROOT, file);
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readJsonRelative(file) {
    return readJson(repoPath(file));
}

function fileDigest(file) {
    if (!fs.existsSync(file)) return null;
    return sha256(fs.readFileSync(file));
}

function fileEvidence(file, role) {
    return {
        path: relative(file),
        role,
        exists: fs.existsSync(file),
        rawSha256: fileDigest(file)
    };
}

function stableSortIds(ids) {
    return [...ids].map(String).sort((a, b) => a.localeCompare(b));
}

function countBy(values, selector) {
    return values.reduce((counts, value) => {
        const key = selector(value);
        counts[key] = (counts[key] || 0) + 1;
        return counts;
    }, {});
}

function pointerToken(value) {
    return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}

function fieldDiffs(before, after, pointer = "") {
    if (valueDigest(before) === valueDigest(after)) return [];
    const beforeObject = before && typeof before === "object";
    const afterObject = after && typeof after === "object";
    if (!beforeObject || !afterObject || Array.isArray(before) !== Array.isArray(after)) {
        return [{
            jsonPointer: pointer || "/",
            beforeValue: before === undefined ? null : before,
            afterValue: after === undefined ? null : after,
            beforeFieldDigest: valueDigest(before),
            afterFieldDigest: valueDigest(after)
        }];
    }
    const keys = Array.isArray(before) && Array.isArray(after)
        ? Array.from({ length: Math.max(before.length, after.length) }, (_, index) => String(index))
        : [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].sort();
    return keys.flatMap((key) => fieldDiffs(before?.[key], after?.[key], `${pointer}/${pointerToken(key)}`));
}

function datasetFiles(dataset) {
    if (dataset === "behaviorPilot") {
        return { path: "games/genshin/data/v2/characters/behavior-pilot.json", file: path.join(CHAR_ROOT, "behavior-pilot.json") };
    }
    const suffix = dataset.replace(/^behaviorBatch/, "");
    const dir = `behavior-batch-${suffix}`;
    return {
        specPath: `games/genshin/data/v2/characters/${dir}/spec-candidates.json`,
        sourcePath: `games/genshin/data/v2/characters/${dir}/source-records.json`,
        specFile: path.join(CHAR_ROOT, dir, "spec-candidates.json"),
        sourceFile: path.join(CHAR_ROOT, dir, "source-records.json")
    };
}

function loadLocalInputs() {
    const specs = new Map();
    const sources = new Map();
    const inputFiles = [];
    for (const dataset of DATASETS) {
        const files = datasetFiles(dataset);
        if (dataset === "behaviorPilot") {
            const data = readJson(files.file);
            inputFiles.push(fileEvidence(files.file, "behaviorSpecAndSourceRecords"));
            for (const [id, spec] of Object.entries(data.specs || {})) specs.set(id, { dataset, spec, file: files.path });
            for (const [id, source] of Object.entries(data.sourceRecords || {})) sources.set(id, { dataset, source, file: files.path });
            continue;
        }
        const specData = readJson(files.specFile);
        const sourceData = readJson(files.sourceFile);
        inputFiles.push(fileEvidence(files.specFile, "behaviorSpec"), fileEvidence(files.sourceFile, "sourceRecords"));
        for (const [id, spec] of Object.entries(specData)) specs.set(id, { dataset, spec, file: files.specPath });
        for (const [id, source] of Object.entries(sourceData)) sources.set(id, { dataset, source, file: files.sourcePath });
    }
    return { specs, sources, inputFiles };
}

function selectQueueTasks(queue) {
    return (queue?.tasks || []).filter((task) => task?.layer === LAYER
        && task?.primaryBlockReason === "semanticDecisionRequired"
        && task?.task?.status === "ready"
        && task?.searchFrontier?.status === "searchRequired")
        .sort((a, b) => String(a.candidateId).localeCompare(String(b.candidateId)));
}

function queueProjection(task) {
    return {
        candidateId: task.candidateId,
        layer: task.layer,
        dataset: task.dataset,
        entityId: task.identityConsistency?.entityId || task.candidateId?.split(":")[1] || null,
        terminalState: task.terminalState,
        primaryBlockReason: task.primaryBlockReason,
        blockReasons: clone(task.blockReasons || []),
        task: {
            taskId: task.task?.taskId || null,
            kind: task.task?.kind || null,
            status: task.task?.status || null,
            autoProcessableNow: task.task?.autoProcessableNow ?? null,
            reason: task.task?.reason || null
        },
        searchFrontier: {
            status: task.searchFrontier?.status || null,
            exhausted: task.searchFrontier?.exhausted ?? null,
            policyId: task.searchFrontier?.policyId || null,
            searchScope: task.searchFrontier?.searchScope || null,
            lastSearchedAt: task.searchFrontier?.lastSearchedAt || null,
            providersExamined: clone(task.searchFrontier?.providersExamined || []),
            reopenTrigger: task.searchFrontier?.reopenTrigger || null,
            scopeMatched: task.searchFrontier?.scopeMatched ?? null,
            scopeUnit: task.searchFrontier?.scopeUnit || null
        },
        mappingStatus: task.mappingStatus || null,
        consumerStatus: task.consumerStatus || null,
        progress: clone(task.progress || null),
        sourceCoverageReconciliation: clone(task.sourceCoverageReconciliation || null),
        bulkTransitionCapture: clone(task.bulkTransitionCapture || null)
    };
}

function parseCandidateId(candidateId) {
    const parts = String(candidateId || "").split(":");
    return {
        candidateId: String(candidateId || ""),
        entityId: parts[1] || null,
        kind: parts[2] || null,
        componentId: parts.slice(3).join(":") || null
    };
}

function recordKindFor(spec, parsed) {
    return spec?.entity?.kind === "constellation" || parsed.kind === "constellation" ? "constellations" : "talents";
}

function componentPointer(spec, parsed) {
    if (parsed.kind === "constellation") {
        const match = String(parsed.componentId || spec?.entity?.component || "").match(/^(?:constellation[.-]|c)([1-6])$/i);
        return match ? `c${match[1]}` : null;
    }
    const component = spec?.entity?.component || parsed.componentId || "";
    return {
        "normalAttack.normal": "combat1",
        "normalAttack.charged": "combat1",
        "normalAttack.plunging": "combat1",
        skill: "combat2",
        burst: "combat3",
        special: "combatsp",
        "passives.passive_1": "passive1",
        "passives.passive_2": "passive2",
        "passives.passive_utility": "passive3"
    }[component] || null;
}

function collectLeafPaths(value, pointer = "") {
    if (value === null || value === undefined || typeof value !== "object") return pointer ? [pointer] : [];
    if (Array.isArray(value)) return value.flatMap((item, index) => collectLeafPaths(item, `${pointer}/${index}`));
    return Object.keys(value).sort().flatMap((key) => collectLeafPaths(value[key], `${pointer}/${pointerToken(key)}`));
}

function localClaimSummary(spec, source, field) {
    const claim = spec?.verification?.claims?.[field];
    const section = field === "runtime" ? spec?.runtime : spec?.[field];
    return {
        claimSchemaStatus: claim ? "presentNeedsReview" : "missing",
        claimStatus: claim?.status || null,
        observedSection: section !== undefined && section !== null,
        observedLeafPaths: collectLeafPaths(section),
        observedSectionDigest: valueDigest(section)
    };
}

function rawDescriptionSurface(value, pointer) {
    const component = value?.[pointer];
    if (!component || typeof component !== "object") return { componentPresent: false, rawTextPointers: [], templateLabelPointers: [], structuredValuePointers: [] };
    const rawTextPointers = ["descriptionRaw", "description"].filter((key) => typeof component[key] === "string").map((key) => `/${pointer}/${key}`);
    const templateLabelPointers = Array.isArray(component.attributes?.labels)
        ? component.attributes.labels.map((_, index) => `/${pointer}/attributes/labels/${index}`)
        : [];
    // Attributes are templates/placeholders in this provider.  Deliberately do
    // not present them as candidate values and do not parse their text.
    return { componentPresent: true, rawTextPointers, templateLabelPointers, structuredValuePointers: [] };
}

function inspectArtifact(stored, expectedGameVersion, expectedRevision) {
    const file = stored?.path ? repoPath(stored.path) : null;
    const result = {
        path: stored?.path || null,
        gameVersion: stored?.gameVersion || null,
        revision: stored?.revision || null,
        packageVersion: stored?.packageVersion || null,
        exists: Boolean(file && fs.existsSync(file)),
        status: "sourcePathMissing",
        stored: {
            rawArtifactBytes: stored?.rawArtifactBytes ?? null,
            rawArtifactSha256: stored?.rawArtifactSha256 || null,
            gitBlob: stored?.gitBlob || null
        },
        actual: null,
        fieldDigest: null,
        integrityVerified: false,
        jsonValid: false
    };
    if (!file || !fs.existsSync(file)) return result;
    const bytes = fs.readFileSync(file);
    const actual = {
        rawArtifactBytes: bytes.length,
        rawArtifactSha256: sha256(bytes),
        gitBlob: gitBlobSha(bytes)
    };
    result.actual = actual;
    result.jsonValid = (() => {
        try {
            const value = JSON.parse(bytes.toString("utf8"));
            result.fieldDigest = digestStable(value);
            return true;
        } catch {
            return false;
        }
    })();
    result.integrityVerified = result.jsonValid
        && stored?.gameVersion === expectedGameVersion
        && stored?.revision === expectedRevision
        && stored?.rawArtifactBytes === actual.rawArtifactBytes
        && stored?.rawArtifactSha256 === actual.rawArtifactSha256
        && stored?.gitBlob === actual.gitBlob;
    result.status = result.integrityVerified ? "rawArtifactIntegrityVerified" : "sourceIntegrityInvalid";
    return result;
}

function parseArtifactValue(info) {
    if (!info?.path || !info?.exists || !info?.jsonValid) return null;
    try { return readJson(repoPath(info.path)); } catch { return null; }
}

function rawRecordSummary(record) {
    const before = inspectArtifact(record?.before, "6.7", EXPECTED_REVISIONS["6.7"]);
    const after = inspectArtifact(record?.after, "7.0", EXPECTED_REVISIONS["7.0"]);
    const beforeValue = parseArtifactValue(before);
    const afterValue = parseArtifactValue(after);
    let comparisonStatus = "sourcePathMissing";
    let comparisonFieldCount = null;
    let comparisonFieldDigest = null;
    let storedComparisonStatus = record?.comparison?.status || null;
    let comparisonRecomputed = false;
    if (beforeValue && afterValue && before.integrityVerified && after.integrityVerified) {
        const diffs = fieldDiffs(beforeValue, afterValue);
        comparisonStatus = diffs.length === 0 ? "rawRecordMatch" : "rawRecordChanged";
        comparisonFieldCount = diffs.length;
        comparisonFieldDigest = digestStable(diffs);
        comparisonRecomputed = storedComparisonStatus === comparisonStatus
            && record?.comparison?.changedFieldCount === diffs.length
            && digestStable(record?.comparison?.fieldDiffs || []) === comparisonFieldDigest;
    }
    const status = before.status === "rawArtifactIntegrityVerified" && after.status === "rawArtifactIntegrityVerified"
        ? "rawRecordCaptured"
        : "sourceIntegrityGap";
    return {
        status,
        recordKind: record?.recordKind || null,
        before,
        after,
        comparison: {
            storedStatus: storedComparisonStatus,
            recomputedStatus: comparisonStatus,
            storedChangedFieldCount: record?.comparison?.changedFieldCount ?? null,
            recomputedChangedFieldCount: comparisonFieldCount,
            fieldDiffDigest: comparisonFieldDigest,
            recomputedAndStoredMatch: comparisonRecomputed
        }
    };
}

function transitionIndex() {
    const entities = new Map();
    const variants = new Map();
    const sources = [];
    for (const file of SNAPSHOT_FILES) {
        const full = path.join(TRANSITION_ROOT, file);
        const snapshot = readJson(full);
        sources.push({ snapshot, file });
        for (const entity of snapshot?.claim?.resolvedEntities || []) {
            if (!entities.has(String(entity.entityId))) entities.set(String(entity.entityId), { entity, snapshotFile: relative(full) });
        }
        for (const variant of snapshot?.claim?.travelerVariantEvidence || []) {
            if (!variants.has(String(variant.variant))) variants.set(String(variant.variant), { variant, snapshotFile: relative(full) });
        }
    }
    const first = sources[0]?.snapshot;
    const versionBindings = clone(first?.claim?.versionBindings || []);
    return { entities, variants, sources, versionBindings };
}

function variantRecordSummary(index, recordKind) {
    const records = [];
    for (const variantName of ["anemo", "geo", "electro", "dendro", "hydro", "pyro", "cryo"]) {
        const entry = index.variants.get(variantName);
        const record = entry?.variant?.records?.find((item) => item.recordKind === recordKind);
        if (!record) {
            records.push({ variant: variantName, status: "sourcePathMissing", snapshotFile: entry?.snapshotFile || null, record: null });
            continue;
        }
        records.push({ variant: variantName, snapshotFile: entry.snapshotFile, ...rawRecordSummary(record) });
    }
    return {
        status: records.every((record) => record.status === "rawRecordCaptured") ? "ambiguousVariantRecordsCaptured" : "ambiguousVariantIntegrityGap",
        variantCount: records.length,
        integrityVerifiedVariantCount: records.filter((record) => record.status === "rawRecordCaptured").length,
        records
    };
}

function providerSurface(raw, pointer) {
    const beforeValue = parseArtifactValue(raw?.before);
    const afterValue = parseArtifactValue(raw?.after);
    const before = rawDescriptionSurface(beforeValue, pointer);
    const after = rawDescriptionSurface(afterValue, pointer);
    return {
        componentPointer: pointer,
        before,
        after,
        candidateFieldValueMaterialized: false,
        proseInference: false,
        tokenMatching: false,
        note: "Raw descriptions and attribute templates are pointer evidence only; no candidate value is parsed from prose or placeholders."
    };
}

function rawEvidenceForCandidate(parsed, spec, index, snapshotRefs) {
    const recordKind = recordKindFor(spec, parsed);
    const pointer = componentPointer(spec, parsed);
    if (TRAVELER_IDS.has(parsed.entityId)) {
        const variants = variantRecordSummary(index, recordKind);
        return {
            identityStatus: "unresolvedVariantAmbiguity",
            provider: "genshin-db",
            sourceFamily: "GenshinData-derived",
            providerSlug: null,
            recordKind,
            componentPointer: pointer,
            snapshotFiles: stableSortIds([...new Set(variants.records.map((record) => record.snapshotFile).filter(Boolean))]),
            variantEvidence: variants,
            rawIntegrityStatus: variants.status === "ambiguousVariantRecordsCaptured" ? "verifiedAcrossVariants" : "gapAcrossVariants",
            candidateFieldValueMaterialized: false,
            versionBoundRevisions: ["1bab2cdba4d218fd5caa46b5f54e7884ee8359a2", "8b15995fa220c88a4d0d7ffe1e21b041d0b32588"],
            crossVariantComparison: "forbidden",
            snapshotRefs
        };
    }
    const entityEntry = index.entities.get(parsed.entityId);
    const entity = entityEntry?.entity;
    const record = entity?.records?.find((item) => item.recordKind === recordKind);
    const raw = rawRecordSummary(record);
    return {
        identityStatus: entity?.resolutionStatus || "entityRecordMissing",
        provider: "genshin-db",
        sourceFamily: "GenshinData-derived",
        providerSlug: entity?.providerSlug || null,
        recordKind,
        componentPointer: pointer,
        snapshotFile: entityEntry?.snapshotFile || null,
        snapshotRefs: entityEntry?.snapshotFile ? [entityEntry.snapshotFile] : snapshotRefs,
        treeResolution: clone(entity?.treeResolution || null),
        record: raw,
        rawIntegrityStatus: raw.status === "rawRecordCaptured" ? "verified" : "gap",
        candidateFieldValueMaterialized: false,
        providerSurface: providerSurface(raw, pointer),
        versionBoundRevisions: ["1bab2cdba4d218fd5caa46b5f54e7884ee8359a2", "8b15995fa220c88a4d0d7ffe1e21b041d0b32588"]
    };
}

function disposition(field) {
    if (field === "runtime") {
        return {
            status: "internalMetadataOnly",
            externalEvidenceRequired: false,
            finiteG06FrontierProven: false,
            candidateClosed: false,
            strictVerified: false,
            certificateEligible: false,
            canonicalPromotionEligible: false,
            reasons: ["internalMetadataOnly", "externalClaimsOpen"]
        };
    }
    return {
        status: "candidateFieldSearchRequired",
        externalEvidenceRequired: true,
        finiteG06FrontierProven: false,
        candidateClosed: false,
        strictVerified: false,
        certificateEligible: false,
        canonicalPromotionEligible: false,
        reasons: [
            "candidateFieldEvidenceAbsent",
            "correlatedFamilyOnly",
            "independentPairAbsent",
            "searchRequired",
            "finiteFrontierUnproven",
            "inferenceForbidden"
        ]
    };
}

function buildCandidate(task, localInputs, index) {
    const parsed = parseCandidateId(task.candidateId);
    const local = localInputs.specs.get(task.candidateId);
    const spec = local?.spec || null;
    const sourceRefs = spec?.sourceRefs || [];
    const sourceRecords = sourceRefs.map((id) => {
        const entry = localInputs.sources.get(id);
        const source = entry?.source || null;
        return {
            id,
            provider: source?.provider || null,
            independenceGroup: source?.independenceGroup || null,
            providerIndependence: source?.providerIndependence || null,
            gameVersion: source?.gameVersion ?? null,
            locator: clone(source?.locator || null),
            integrity: clone(source?.integrity || null)
        };
    });
    const snapshotRefs = [];
    const rawEvidence = rawEvidenceForCandidate(parsed, spec, index, snapshotRefs);
    const claims = CLAIM_FIELDS.map((field) => {
        const localClaim = localClaimSummary(spec, localInputs.sources, field);
        const external = field !== "runtime";
        return {
            claimId: `${task.candidateId}:${field}`,
            candidateId: task.candidateId,
            field,
            claimKind: external ? "externalFactual" : "internalRuntimeRoute",
            local: localClaim,
            providerObservation: {
                rawRecordCaptured: rawEvidence.rawIntegrityStatus !== "gap" && rawEvidence.rawIntegrityStatus !== "gapAcrossVariants",
                candidateFieldValueMaterialized: false,
                directRawTextOnly: external && field === "sourceText",
                structuredValuePointers: [],
                rawEvidenceStatus: rawEvidence.rawIntegrityStatus,
                proofStatus: external ? "candidateFieldEvidenceAbsent" : "internalMetadataOnly"
            },
            rawEvidence: {
                transitionRawRef: "$.transitionRaw",
                rawIntegrityStatus: rawEvidence.rawIntegrityStatus,
                rawBeforeFieldDigest: rawEvidence.record?.before?.fieldDigest || null,
                rawAfterFieldDigest: rawEvidence.record?.after?.fieldDigest || null,
                rawBeforeSha256: rawEvidence.record?.before?.actual?.rawArtifactSha256 || null,
                rawAfterSha256: rawEvidence.record?.after?.actual?.rawArtifactSha256 || null,
                rawBeforeGitBlob: rawEvidence.record?.before?.actual?.gitBlob || null,
                rawAfterGitBlob: rawEvidence.record?.after?.actual?.gitBlob || null,
                providerSurfaceRef: external && field === "sourceText" ? "$.transitionRaw.providerSurface" : null,
                variantEvidence: rawEvidence.variantEvidence ? {
                    status: rawEvidence.variantEvidence.status,
                    variantCount: rawEvidence.variantEvidence.variantCount,
                    integrityVerifiedVariantCount: rawEvidence.variantEvidence.integrityVerifiedVariantCount
                } : null,
                crossVariantComparison: rawEvidence.crossVariantComparison || null
            },
            disposition: disposition(field)
        };
    });
    const externalClaims = claims.filter((claim) => claim.claimKind === "externalFactual");
    const finiteFrontier = {
        status: "notRecorded",
        finite: false,
        searchScope: null,
        lastSearchedAt: null,
        providersExamined: [],
        reopenTrigger: "immutable version-bound provider manifest, independent-lineage disclosure, or approved contract change"
    };
    return {
        candidateId: task.candidateId,
        dataset: task.dataset,
        layer: task.layer,
        entityId: parsed.entityId,
        entity: clone(spec?.entity || task.identityConsistency || null),
        component: spec?.entity?.component || parsed.componentId,
        sourceSpec: {
            path: local?.file || null,
            sourceRefs: clone(sourceRefs),
            sourceRecords,
            verificationStatus: spec?.verification?.status || null,
            sourceAgreement: spec?.verification?.sourceAgreement || null
        },
        queue: queueProjection(task),
        transitionRaw: rawEvidence,
        finiteG06Frontier: finiteFrontier,
        candidateClaims: claims,
        claimCount: claims.length,
        externalClaimCount: externalClaims.length,
        internalClaimCount: claims.length - externalClaims.length,
        disposition: {
            status: "candidateFieldSearchRequired",
            closed: false,
            evidenceDeferred: false,
            strictVerified: false,
            certificateEligible: false,
            canonicalPromotionEligible: false,
            reasons: ["externalClaimsOpen", "finiteCandidateFrontierUnproven"]
        }
    };
}

function versionBindingEvidence(index) {
    return (index.versionBindings || []).map((binding) => {
        const pkg = binding.package || {};
        const expectedRevision = EXPECTED_REVISIONS[binding.gameVersion];
        const file = pkg.path ? repoPath(pkg.path) : null;
        const bytes = file && fs.existsSync(file) ? fs.readFileSync(file) : null;
        return {
            gameVersion: binding.gameVersion || null,
            revision: binding.revision || null,
            packageVersion: binding.packageVersion || null,
            status: binding.status || null,
            manifest: {
                path: pkg.path || null,
                rawArtifactBytes: bytes ? bytes.length : pkg.rawArtifactBytes ?? null,
                rawArtifactSha256: bytes ? sha256(bytes) : pkg.rawArtifactSha256 || null,
                gitBlob: bytes ? gitBlobSha(bytes) : pkg.gitBlob || null,
                storedRawArtifactSha256: pkg.rawArtifactSha256 || null,
                storedGitBlob: pkg.gitBlob || null,
                storedBytes: pkg.rawArtifactBytes ?? null,
                revisionMatchesExpected: binding.revision === expectedRevision,
                integrityVerified: Boolean(bytes
                    && binding.status === "strictlyBound"
                    && binding.revision === expectedRevision
                    && bytes.length === pkg.rawArtifactBytes
                    && sha256(bytes) === pkg.rawArtifactSha256
                    && gitBlobSha(bytes) === pkg.gitBlob)
            }
        };
    });
}

function sourceFrontierSummary(frontier) {
    return {
        path: relative(FRONTIER_PATH),
        rawSha256: fileDigest(FRONTIER_PATH),
        selectedBehaviorCandidateRecordCount: Array.isArray(frontier?.candidateRecords) ? frontier.candidateRecords.length : null,
        candidateFieldMaterializationExecutableNow: frontier?.summary?.candidateClaimFieldMaterializationExecutableNow ?? null,
        exactIndependentVersionBoundClaims: frontier?.summary?.exactIndependentVersionBoundClaims ?? null,
        finiteCandidateFrontierForSelectedLane: false,
        selectedLaneSearchRequired: EXPECTED_CANDIDATE_COUNT,
        authority: "candidateSourceCoverageEvidenceOnly"
    };
}

function buildAudit({ queue } = {}) {
    const currentQueue = queue || readJson(QUEUE_PATH);
    const localInputs = loadLocalInputs();
    const index = transitionIndex();
    const frontier = readJson(FRONTIER_PATH);
    const selectedTasks = selectQueueTasks(currentQueue);
    const errors = [];
    if (selectedTasks.length !== EXPECTED_CANDIDATE_COUNT) errors.push(`selectedCandidateCount:${selectedTasks.length}`);
    const candidateIds = selectedTasks.map((task) => task.candidateId);
    const candidates = selectedTasks.map((task) => buildCandidate(task, localInputs, index));
    const claimRows = candidates.flatMap((candidate) => candidate.candidateClaims);
    const externalClaims = claimRows.filter((claim) => claim.claimKind === "externalFactual");
    const internalClaims = claimRows.filter((claim) => claim.claimKind === "internalRuntimeRoute");
    const rawStatuses = countBy(candidates, (candidate) => candidate.transitionRaw.rawIntegrityStatus);
    const inputStatuses = countBy(candidates, (candidate) => candidate.candidateClaims.every((claim) => claim.local.claimSchemaStatus === "presentNeedsReview") ? "complete" : "missing");
    const summary = {
        candidateCount: candidates.length,
        claimCount: claimRows.length,
        externalClaimCount: externalClaims.length,
        internalClaimCount: internalClaims.length,
        claimFields: CLAIM_FIELDS,
        externalClaimFields: EXTERNAL_CLAIM_FIELDS,
        internalClaimFields: INTERNAL_CLAIM_FIELDS,
        inputClaimSchemaCompleteCandidateCount: inputStatuses.complete || 0,
        inputClaimSchemaMissingCandidateCount: inputStatuses.missing || 0,
        rawIntegrityVerifiedCandidateCount: candidates.filter((candidate) => candidate.transitionRaw.rawIntegrityStatus === "verified" || candidate.transitionRaw.rawIntegrityStatus === "verifiedAcrossVariants").length,
        rawIntegrityGapCandidateCount: candidates.filter((candidate) => candidate.transitionRaw.rawIntegrityStatus === "gap" || candidate.transitionRaw.rawIntegrityStatus === "gapAcrossVariants").length,
        rawIntegrityByStatus: rawStatuses,
        candidateFieldMaterializedCount: claimRows.filter((claim) => claim.providerObservation.candidateFieldValueMaterialized).length,
        candidateFieldSearchRequiredCount: externalClaims.filter((claim) => claim.disposition.status === "candidateFieldSearchRequired").length,
        finiteG06FrontierProvenCandidateCount: candidates.filter((candidate) => candidate.finiteG06Frontier.finite).length,
        evidenceDeferredCandidateCount: candidates.filter((candidate) => candidate.disposition.evidenceDeferred).length,
        strictVerifiedCandidateCount: candidates.filter((candidate) => candidate.disposition.strictVerified).length,
        certificateEligibleClaimCount: claimRows.filter((claim) => claim.disposition.certificateEligible).length,
        canonicalPromotionEligibleCandidateCount: candidates.filter((candidate) => candidate.disposition.canonicalPromotionEligible).length,
        sourceFamilyCount: new Set(claimRows.map((claim) => claim.providerObservation.sourceFamily)).size,
        providerFamilies: ["genshin-db / GenshinData-derived"],
        queueSelectedTaskStatuses: countBy(selectedTasks, (task) => task.task?.status || "missing"),
        queueSelectedFrontierStatuses: countBy(selectedTasks, (task) => task.searchFrontier?.status || "missing"),
        allSelectedQueueTasksSearchRequired: selectedTasks.every((task) => task.searchFrontier?.status === "searchRequired"),
        allSelectedQueueTasksReady: selectedTasks.every((task) => task.task?.status === "ready"),
        errors
    };
    const queueBytes = fs.existsSync(QUEUE_PATH) ? fs.readFileSync(QUEUE_PATH) : Buffer.from(JSON.stringify(currentQueue));
    const generatedFrom = [
        fileEvidence(QUEUE_PATH, "authoritativeQueue"),
        fileEvidence(FRONTIER_PATH, "candidateSourceCoverageFrontier"),
        ...localInputs.inputFiles,
        ...SNAPSHOT_FILES.map((file) => fileEvidence(path.join(TRANSITION_ROOT, file), "transitionRawSnapshot"))
    ];
    const audit = {
        schemaVersion: 1,
        kind: "genshinR2BehaviorSpecMaterializationAudit",
        status: errors.length === 0 ? "passed" : "failed",
        generatedAt: GENERATED_AT,
        generator: { name: path.basename(__filename), version: GENERATOR_VERSION },
        scope: {
            transitionId: TRANSITION_ID,
            targetGameVersion: TARGET_VERSION,
            clusterId: "behavior:behaviorSpec:semanticDecisionRequired:ready-searchRequired:all",
            layer: LAYER,
            selection: "authoritative queue layer=behaviorSpec, primaryBlockReason=semanticDecisionRequired, task.status=ready, searchFrontier.status=searchRequired",
            candidateCount: candidates.length,
            candidateIds,
            candidateIdDigest: digestStable(candidateIds)
        },
        policy: {
            noNetworkFetch: true,
            reuseExistingRawOnly: true,
            proseInference: "forbidden",
            tokenMatching: "forbidden",
            entityRawRecordIsClaimProof: false,
            providerIndependenceRequired: true,
            providerIndependence: "GenshinData-derived is one correlated family; no independent pair is present",
            g06DeferralRequiresFiniteCandidateFrontier: true,
            searchRequiredIsNotSearchExhausted: true,
            metadataBooleansNotProof: true,
            internalRuntimeMetadataSeparateFromExternalClaims: true,
            certificateIssuance: "forbidden",
            canonicalPromotion: "forbidden",
            queueMutation: "none"
        },
        generatedFrom: {
            authoritativeQueue: {
                path: relative(QUEUE_PATH),
                rawSha256: sha256(queueBytes),
                selectedTaskProjectionDigest: digestStable(selectedTasks.map(queueProjection))
            },
            candidateSourceCoverageFrontier: sourceFrontierSummary(frontier),
            files: generatedFrom
        },
        claim: {
            transitionId: TRANSITION_ID,
            fromGameVersion: "6.7",
            toGameVersion: TARGET_VERSION,
            provider: "genshin-db",
            sourceFamily: "GenshinData-derived",
            providerIndependenceStatus: "correlatedOnly",
            versionBindings: versionBindingEvidence(index),
            candidateCount: candidates.length,
            claimCount: claimRows.length,
            externalClaimCount: externalClaims.length,
            internalClaimCount: internalClaims.length,
            candidates
        },
        summary,
        gate: {
            sourceFamilyCount: summary.sourceFamilyCount,
            finiteG06FrontierProvenCandidateCount: summary.finiteG06FrontierProvenCandidateCount,
            candidateFieldMaterializedCount: summary.candidateFieldMaterializedCount,
            strictVerifiedCandidateCount: summary.strictVerifiedCandidateCount,
            certificateEligibleClaimCount: summary.certificateEligibleClaimCount,
            canonicalPromotionEligibleCandidateCount: summary.canonicalPromotionEligibleCandidateCount,
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false,
            reasons: ["singleCorrelatedProviderFamily", "candidateClaimFieldEvidenceAbsent", "finiteG06FrontierNotRecorded", "queueSearchRequiredRemainsOpen"]
        },
        errors,
        fieldDigestAlgorithm: "sha256-stable-json-v1"
    };
    audit.fieldDigest = digestStable(audit.claim);
    return audit;
}

function withoutDigest(audit) {
    const copy = clone(audit);
    delete copy.fieldDigest;
    return copy;
}

function validateAudit(audit, { compareCurrent = false } = {}) {
    const reasons = [];
    if (audit?.schemaVersion !== 1 || audit?.kind !== "genshinR2BehaviorSpecMaterializationAudit") reasons.push("identityInvalid");
    if (audit?.generatedAt !== GENERATED_AT) reasons.push("generatedAtInvalid");
    if (audit?.fieldDigestAlgorithm !== "sha256-stable-json-v1" || audit?.fieldDigest !== digestStable(audit?.claim)) reasons.push("fieldDigestInvalid");
    if (audit?.claim?.transitionId !== TRANSITION_ID || audit?.claim?.fromGameVersion !== "6.7" || audit?.claim?.toGameVersion !== TARGET_VERSION
        || audit?.claim?.provider !== "genshin-db" || audit?.claim?.sourceFamily !== "GenshinData-derived"
        || audit?.claim?.providerIndependenceStatus !== "correlatedOnly") reasons.push("claimBindingInvalid");
    const bindings = Array.isArray(audit?.claim?.versionBindings) ? audit.claim.versionBindings : [];
    if (bindings.length !== 2) reasons.push("versionBindingsIncomplete");
    for (const gameVersion of ["6.7", "7.0"]) {
        const binding = bindings.find((item) => item?.gameVersion === gameVersion);
        if (!binding || binding.status !== "strictlyBound" || binding.revision !== EXPECTED_REVISIONS[gameVersion]
            || binding.manifest?.integrityVerified !== true || binding.manifest?.revisionMatchesExpected !== true) reasons.push(`versionBindingInvalid:${gameVersion}`);
    }
    if (audit?.scope?.candidateCount !== EXPECTED_CANDIDATE_COUNT || audit?.claim?.candidateCount !== EXPECTED_CANDIDATE_COUNT) reasons.push("candidateCountInvalid");
    if (audit?.claim?.claimCount !== EXPECTED_CLAIM_COUNT) reasons.push("claimCountInvalid");
    if (!Array.isArray(audit?.claim?.candidates) || audit.claim.candidates.length !== EXPECTED_CANDIDATE_COUNT) reasons.push("candidatesIncomplete");
    for (const candidate of audit?.claim?.candidates || []) {
        if (!Array.isArray(candidate.candidateClaims) || candidate.candidateClaims.length !== CLAIM_FIELDS.length) reasons.push(`candidateClaimsIncomplete:${candidate.candidateId}`);
        if (candidate.disposition?.closed !== false || candidate.disposition?.strictVerified !== false || candidate.disposition?.certificateEligible !== false || candidate.disposition?.canonicalPromotionEligible !== false) reasons.push(`failOpenCandidate:${candidate.candidateId}`);
        if (candidate.finiteG06Frontier?.finite !== false) reasons.push(`finiteFrontierUnexpected:${candidate.candidateId}`);
        for (const claim of candidate.candidateClaims || []) {
            if (!CLAIM_FIELDS.includes(claim.field)) reasons.push(`claimFieldInvalid:${claim.claimId}`);
            if (claim.claimKind === "externalFactual" && claim.disposition?.status !== "candidateFieldSearchRequired") reasons.push(`externalDispositionInvalid:${claim.claimId}`);
            if (claim.claimKind === "internalRuntimeRoute" && claim.disposition?.status !== "internalMetadataOnly") reasons.push(`internalDispositionInvalid:${claim.claimId}`);
            if (claim.providerObservation?.candidateFieldValueMaterialized !== false) reasons.push(`providerMaterializationFailOpen:${claim.claimId}`);
        }
    }
    if (audit?.gate?.canIssueEligibilityCertificate !== false || audit?.gate?.canPromoteCanonical !== false) reasons.push("gateFailOpen");
    if (compareCurrent) {
        const current = buildAudit();
        if (digestStable(withoutDigest(audit)) !== digestStable(withoutDigest(current))) reasons.push("currentProjectionMismatch");
    }
    return { valid: reasons.length === 0, reasons };
}

function renderMarkdown(audit) {
    const s = audit.summary;
    return `# Genshin r2 behaviorSpec candidate materialization audit\n\n- Generated: ${audit.generatedAt}\n- Scope: ${audit.scope.candidateCount} queue candidates (` +
        "`layer=behaviorSpec`, `primaryBlockReason=semanticDecisionRequired`, `ready`, `searchRequired`)\n" +
        `- Claims: ${s.claimCount} (${s.externalClaimCount} external, ${s.internalClaimCount} internal runtime metadata)\n\n` +
        "## Result\n\n" +
        `- Existing transition raw integrity verified: ${s.rawIntegrityVerifiedCandidateCount}; integrity gap: ${s.rawIntegrityGapCandidateCount}\n` +
        `- Local claim schema complete: ${s.inputClaimSchemaCompleteCandidateCount}; missing (pilot fallback): ${s.inputClaimSchemaMissingCandidateCount}\n` +
        `- Candidate×claim values materialized: ${s.candidateFieldMaterializedCount}\n` +
        `- Candidate-field search still required: ${s.candidateFieldSearchRequiredCount}\n` +
        `- Finite G06 candidate frontier proven: ${s.finiteG06FrontierProvenCandidateCount}\n` +
        `- Strict/certificate/canonical: ${s.strictVerifiedCandidateCount}/${s.certificateEligibleClaimCount}/${s.canonicalPromotionEligibleCandidateCount}\n\n` +
        "## Safety boundary\n\n" +
        "The captured genshin-db records are a single correlated GenshinData-derived family. Their raw descriptions and attribute templates are retained as direct pointers only; no prose, token, or placeholder inference is performed. `searchRequired` is not treated as `searchExhausted`, so no candidate is closed or deferred. Runtime is recorded separately as internal metadata and is not source proof.\n\n" +
        `Authoritative queue: [${audit.generatedFrom.authoritativeQueue.path}](../${audit.generatedFrom.authoritativeQueue.path})\n` +
        `Source frontier: [${audit.generatedFrom.candidateSourceCoverageFrontier.path}](../${audit.generatedFrom.candidateSourceCoverageFrontier.path})\n`;
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
    FRONTIER_PATH,
    INTERNAL_CLAIM_FIELDS,
    REPORT_PATH,
    SCHEMA_PATH,
    buildAudit,
    fieldDiffs,
    gitBlobSha,
    loadLocalInputs,
    renderMarkdown,
    selectQueueTasks,
    sha256,
    transitionIndex,
    validateAudit,
    withoutDigest,
    writeArtifacts
};
