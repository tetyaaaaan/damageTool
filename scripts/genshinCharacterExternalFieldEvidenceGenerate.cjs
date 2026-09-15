"use strict";

/**
 * Build an evidence-only join between the local character BehaviorSpec
 * candidates and pinned external source locators.
 *
 * This generator intentionally does not parse source code, copy numeric
 * tokens, or change the pilot/talent-gap candidates.  It records a semantic
 * component anchor (for example `talent.skill` or `constellation.6`) and the
 * pinned source file/directory that a reviewer should inspect.  Until a
 * reviewer provides a versioned field extraction, every mapping remains
 * needsReview/canonical=0/runtime=blocked.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultDataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultOutputFile = path.join(
    defaultDataRoot,
    "v2",
    "characters",
    "external-field-evidence.json"
);
const GENERATOR_VERSION = "genshinCharacterExternalFieldEvidenceGenerate/1";
// A fixed capture instant keeps the checked-in artifact deterministic.  It is
// not a claim about the game version (which is deliberately null below).
const CAPTURED_AT = "2026-08-16T00:00:00.000Z";

const DEFAULT_PILOT_IDS = [
    "10000026",
    "10000031",
    "10000037",
    "10000046",
    "10000058",
    "10000089",
    "10000094",
    "10000098"
];

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
}

function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function fileDigest(file) {
    return sha256(fs.readFileSync(file));
}

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
        Object.keys(value)
            .sort()
            .map((key) => [key, stableValue(value[key])])
    );
}

function stableJson(value) {
    return JSON.stringify(stableValue(value));
}

function sortNatural(left, right) {
    return String(left).localeCompare(String(right), "en", { numeric: true });
}

function countBy(values) {
    const result = {};
    (values || []).forEach((value) => {
        const key = String(value);
        result[key] = (result[key] || 0) + 1;
    });
    return Object.fromEntries(
        Object.entries(result).sort(([a], [b]) => a.localeCompare(b))
    );
}

function relativePath(file) {
    return path.relative(repositoryRoot, file).replaceAll(path.sep, "/");
}

function inputManifest(paths) {
    return Object.entries(paths).map(([role, file]) => {
        const rel = relativePath(file);
        if (!fs.existsSync(file)) {
            return { role, path: rel, exists: false, sha256: null, bytes: 0 };
        }
        return {
            role,
            path: rel,
            exists: true,
            sha256: fileDigest(file),
            bytes: fs.statSync(file).size
        };
    });
}

function parseCharacterIds(artifact, fallback) {
    const ids = artifact?.pilotIds || artifact?.summary?.characterIds || fallback;
    return [...new Set((ids || []).map(String))].sort(sortNatural);
}

function characterName(artifact, characterId) {
    return artifact?.byCharacter?.[characterId]?.characterName
        || artifact?.byCharacter?.[characterId]?.nameJa
        || null;
}

function isWithinRoot(root, target) {
    if (!root) return false;
    const rootResolved = path.resolve(root);
    const targetResolved = path.resolve(target);
    return targetResolved === rootResolved || targetResolved.startsWith(`${rootResolved}${path.sep}`);
}

/**
 * Materialize metadata for a pinned locator if a caller supplied a local
 * checkout.  Source roots are optional; no network access is performed.
 */
function materializeLocator({ root, relative, pathKind, gameVersion = null }) {
    const normalized = typeof relative === "string" && relative
        ? relative.replaceAll("\\", "/")
        : null;
    const base = root ? path.resolve(root) : null;
    const absolute = base && normalized ? path.resolve(base, normalized) : null;
    const rootConfigured = Boolean(base);
    const safe = Boolean(absolute && isWithinRoot(base, absolute));
    const exists = Boolean(safe && fs.existsSync(absolute));
    const stat = exists ? fs.statSync(absolute) : null;
    const isFile = Boolean(stat?.isFile());
    const isDirectory = Boolean(stat?.isDirectory());
    const blockedReasons = [];
    if (!normalized) blockedReasons.push("externalLocatorMissing");
    if (!rootConfigured) blockedReasons.push("externalSourceRootNotConfigured");
    if (rootConfigured && !safe) blockedReasons.push("externalLocatorOutsideConfiguredRoot");
    if (rootConfigured && safe && !exists) blockedReasons.push("externalFileNotMaterialized");
    if (exists && pathKind === "file" && !isFile) blockedReasons.push("externalLocatorNotFile");
    if (exists && pathKind === "directory" && !isDirectory) blockedReasons.push("externalLocatorNotDirectory");
    // The local game dataset and the pinned source index do not state a game
    // version.  Keep this reason on every source even when a checkout exists.
    if (!gameVersion) blockedReasons.push("gameVersionNotExplicit");
    return {
        rootConfigured,
        materialized: exists,
        pathKind: pathKind || "unknown",
        path: normalized,
        integrity: isFile
            ? { algorithm: "sha256", digest: fileDigest(absolute) }
            : null,
        gameVersion: gameVersion || null,
        blockedReasons: [...new Set(blockedReasons)].sort(),
        // Absolute paths are intentionally omitted from the artifact.
        observedType: exists ? (isFile ? "file" : isDirectory ? "directory" : "other") : null
    };
}

function sourceRevisionInfo({ project, index, sourceCatalog }) {
    const indexProject = index?.projects?.[project] || null;
    const catalogSource = sourceCatalog?.sources?.[project] || null;
    const indexRevision = indexProject?.revision || null;
    const catalogRevision = catalogSource?.revision || null;
    const blockedReasons = [];
    if (!indexRevision) blockedReasons.push("pinnedRevisionMissingFromConstellationIndex");
    if (project === "gcsim" && !catalogSource) blockedReasons.push("sourceCatalogProjectMissing");
    if (project === "genshinOptimizer" && !catalogSource) blockedReasons.push("sourceCatalogProjectMissing");
    if (indexRevision && catalogRevision && indexRevision !== catalogRevision) {
        blockedReasons.push("sourceCatalogRevisionMismatch");
    }
    return {
        project,
        provider: project === "gcsim" ? "genshinsim/gcsim" : "frzyc/genshin-optimizer",
        repository: indexProject?.repository || catalogSource?.repository || null,
        revision: indexRevision,
        revisionSource: "calc/constellation-source-index.json",
        sourceCatalogRevision: catalogRevision,
        sourceCatalogRevisionSource: catalogRevision ? "v2/source-catalog.json" : null,
        license: indexProject?.license || catalogSource?.license || null,
        independenceGroup: project === "gcsim" ? "gcsim-implementation" : "genshin-optimizer-implementation",
        blockedReasons
    };
}

function sourceId(project, characterId, role) {
    return `external-source:${project}:${characterId}:${role}`;
}

function makeExternalSource({
    project,
    characterId,
    role,
    locator,
    pathKind,
    root,
    index,
    sourceCatalog
}) {
    const revision = sourceRevisionInfo({ project, index, sourceCatalog });
    const materialized = materializeLocator({ root, relative: locator, pathKind });
    const id = sourceId(project, characterId, role);
    return {
        id,
        project,
        characterId,
        role,
        repository: revision.repository,
        revision: revision.revision,
        revisionSource: revision.revisionSource,
        sourceCatalogRevision: revision.sourceCatalogRevision,
        sourceCatalogRevisionSource: revision.sourceCatalogRevisionSource,
        independenceGroup: revision.independenceGroup,
        locator: {
            path: materialized.path,
            pathKind: materialized.pathKind
        },
        materialization: {
            rootConfigured: materialized.rootConfigured,
            materialized: materialized.materialized,
            observedType: materialized.observedType,
            integrity: materialized.integrity
        },
        gameVersion: materialized.gameVersion,
        blockedReasons: [...new Set([
            ...revision.blockedReasons,
            ...materialized.blockedReasons
        ])].sort(),
        supportsClaimValue: false,
        tokenMatchingUsed: false,
        notes: "Pinned locator only; no source-code values or numeric-token matches are promoted."
    };
}

function sourceLocatorFor({ project, entry, kind }) {
    if (!entry) return { role: "character-implementation", path: null, pathKind: "file" };
    if (project === "gcsim") {
        if (kind === "constellation") {
            return {
                role: "constellation-implementation",
                path: entry.constellationPath || null,
                pathKind: "file"
            };
        }
        return {
            role: "character-implementation",
            path: entry.path || null,
            // The index intentionally records this as a directory.  We do
            // not guess a Go filename from a directory name.
            pathKind: "directory"
        };
    }
    return {
        role: kind === "constellation" ? "character-sheet-constellation-anchor" : "character-sheet-talent-anchor",
        path: entry.path || null,
        pathKind: "file"
    };
}

function localFieldPointer(sourceRecord) {
    if (!sourceRecord) return null;
    return {
        sourceId: sourceRecord.id || null,
        dataset: sourceRecord.locator?.dataset || null,
        record: sourceRecord.locator?.record || null,
        field: sourceRecord.locator?.field || null,
        valueDigest: sourceRecord.integrity?.digest || null
    };
}

function semanticAnchor({ spec, localSource }) {
    const component = String(spec?.entity?.component || "");
    const kind = spec?.entity?.kind || "talent";
    const sourceField = localSource?.locator?.field || null;
    const sourceRole = kind === "constellation" ? "constellation" : "talent";
    return {
        strategy: "sourceIndexCharacterIdAndComponentAnchor",
        sourceRole,
        component,
        localField: sourceField,
        // Consumers can use this to select an AST symbol later.  It is not a
        // claim that the symbol/value currently exists in the checkout.
        externalAnchor: component || null,
        confidence: "candidate-only",
        tokenMatchingUsed: false,
        supportsClaimValue: false,
        notes: "Semantic path/component correspondence only; numeric tokens and prose are not matched."
    };
}

function candidateFieldPaths(spec) {
    const fields = [];
    ["timing", "execution", "lifecycle", "energy", "elementApplication"].forEach((section) => {
        Object.keys(spec?.[section] || {}).forEach((field) => fields.push(`/${section}/${field}`));
    });
    (spec?.unknownFields || []).forEach((field) => fields.push(`/${field}`));
    return [...new Set(fields)].sort();
}

function makeCandidate({ candidateType, spec, localSourceRecords, externalSources, sourceIndex }) {
    const candidateId = spec.id;
    const characterId = String(spec.entity?.id || "");
    const kind = spec.entity?.kind || "talent";
    const indexEntry = sourceIndex?.characters?.[characterId] || null;
    const projectRoots = {
        gcsim: process.env.GENSHIN_GCSIM_ROOT || null,
        genshinOptimizer: process.env.GENSHIN_OPTIMIZER_ROOT || null
    };
    const refs = [];
    const sourceDescriptors = [
        ["gcsim", sourceLocatorFor({ project: "gcsim", entry: indexEntry?.gcsim, kind })],
        ["genshinOptimizer", sourceLocatorFor({ project: "genshinOptimizer", entry: indexEntry?.genshinOptimizer, kind })]
    ];
    sourceDescriptors.forEach(([project, descriptor]) => {
        const id = sourceId(project, characterId, descriptor.role);
        if (!externalSources[id]) {
            externalSources[id] = makeExternalSource({
                project,
                characterId,
                role: descriptor.role,
                locator: descriptor.path,
                pathKind: descriptor.pathKind,
                root: projectRoots[project],
                index: sourceIndex,
                sourceCatalog: sourceCatalogForCurrentBuild
            });
        }
        refs.push(id);
    });
    const localRefs = Array.isArray(spec.sourceRefs) ? [...spec.sourceRefs] : [];
    const localFields = localRefs
        .map((ref) => localFieldPointer(localSourceRecords[ref]))
        .filter(Boolean);
    const evidence = refs.map((externalRef) => ({
        externalSourceId: externalRef,
        localSourceRefs: localRefs,
        semantic: semanticAnchor({ spec, localSource: localSourceRecords[localRefs[0]] }),
        candidateFields: candidateFieldPaths(spec),
        gameVersion: null,
        supportsClaimValue: false,
        verification: {
            status: "needsReview",
            canonical: 0,
            runtimeStatus: "blocked",
            blockedReasons: [
                "externalFieldExtractionNotImplemented",
                "gameVersionNotExplicit",
                "independentReviewerRequired"
            ]
        }
    }));
    const blockedReasons = [...new Set(evidence.flatMap((entry) => entry.verification.blockedReasons))].sort();
    return {
        id: candidateId,
        candidateType,
        characterId,
        entity: clone(spec.entity),
        localSourceRefs: localRefs,
        localFields,
        externalSourceIds: refs,
        semantic: semanticAnchor({ spec, localSource: localSourceRecords[localRefs[0]] }),
        evidence,
        verification: {
            status: "needsReview",
            canonical: 0,
            runtimeStatus: "blocked",
            gameVersion: null,
            blockedReasons
        },
        notes: "Evidence join only; original BehaviorSpec/talent-gap artifact is unchanged."
    };
}

// Used only while makeCandidate is constructing sources.  It is set for the
// duration of buildDataset and avoids widening every helper signature.
let sourceCatalogForCurrentBuild = null;

function buildDataset({
    dataRoot = defaultDataRoot,
    pilotFile = path.join(dataRoot, "v2", "characters", "behavior-pilot.json"),
    talentGapFile = path.join(dataRoot, "v2", "characters", "talent-gap-candidates.json"),
    sourceIndexFile = path.join(dataRoot, "calc", "constellation-source-index.json"),
    sourceCatalogFile = path.join(dataRoot, "v2", "source-catalog.json")
} = {}) {
    const pilot = readJson(pilotFile);
    const talentGap = readJson(talentGapFile);
    const sourceIndex = readJson(sourceIndexFile);
    const sourceCatalog = readJson(sourceCatalogFile);
    sourceCatalogForCurrentBuild = sourceCatalog;
    try {
        const pilotIds = parseCharacterIds(pilot, DEFAULT_PILOT_IDS);
        const talentGapIds = parseCharacterIds(talentGap, []);
        const externalSources = {};
        const candidates = {};
        const byCharacter = {};
        pilotIds.concat(talentGapIds).forEach((characterId) => {
            byCharacter[characterId] = {
                characterId,
                characterName: characterName(pilot, characterId) || characterName(talentGap, characterId),
                pilotCandidateIds: [],
                talentGapCandidateIds: [],
                evidenceIds: []
            };
        });

        Object.entries(pilot.specs || {})
            .sort(([a], [b]) => sortNatural(a, b))
            .forEach(([, spec]) => {
                const candidate = makeCandidate({
                    candidateType: "pilotBehaviorSpec",
                    spec,
                    localSourceRecords: pilot.sourceRecords || {},
                    externalSources,
                    sourceIndex
                });
                candidates[candidate.id] = candidate;
                const index = byCharacter[candidate.characterId] || (byCharacter[candidate.characterId] = {
                    characterId: candidate.characterId,
                    characterName: null,
                    pilotCandidateIds: [],
                    talentGapCandidateIds: [],
                    evidenceIds: []
                });
                index.pilotCandidateIds.push(candidate.id);
                index.evidenceIds.push(...candidate.evidence.map((entry) => `${candidate.id}:${entry.externalSourceId}`));
            });
        Object.entries(talentGap.specs || {})
            .sort(([a], [b]) => sortNatural(a, b))
            .forEach(([, spec]) => {
                const candidate = makeCandidate({
                    candidateType: "talentGapSpec",
                    spec,
                    localSourceRecords: talentGap.sourceRecords || {},
                    externalSources,
                    sourceIndex
                });
                candidates[candidate.id] = candidate;
                const index = byCharacter[candidate.characterId] || (byCharacter[candidate.characterId] = {
                    characterId: candidate.characterId,
                    characterName: null,
                    pilotCandidateIds: [],
                    talentGapCandidateIds: [],
                    evidenceIds: []
                });
                index.talentGapCandidateIds.push(candidate.id);
                index.evidenceIds.push(...candidate.evidence.map((entry) => `${candidate.id}:${entry.externalSourceId}`));
            });
        Object.values(byCharacter).forEach((entry) => {
            entry.pilotCandidateIds.sort(sortNatural);
            entry.talentGapCandidateIds.sort(sortNatural);
            entry.evidenceIds.sort(sortNatural);
        });

        const allCandidates = Object.values(candidates);
        const allEvidence = allCandidates.flatMap((candidate) => candidate.evidence);
        const projectCounts = countBy(Object.keys(externalSources).map((id) => externalSources[id].project));
        const materializedCounts = countBy(Object.values(externalSources).map((source) => source.materialization.materialized ? "materialized" : "notMaterialized"));
        const blockedReasonCounts = countBy(Object.values(externalSources).flatMap((source) => source.blockedReasons));
        const revisionMismatchProjects = Object.values(externalSources)
            .filter((source) => source.blockedReasons.includes("sourceCatalogRevisionMismatch"))
            .map((source) => source.project);
        const generatedFrom = inputManifest({
            pilot: pilotFile,
            talentGap: talentGapFile,
            sourceIndex: sourceIndexFile,
            sourceCatalog: sourceCatalogFile
        });
        return {
            schemaVersion: 1,
            kind: "genshinCharacterExternalFieldEvidence",
            generator: {
                name: "genshinCharacterExternalFieldEvidenceGenerate.cjs",
                version: GENERATOR_VERSION,
                capturedAt: CAPTURED_AT
            },
            policy: {
                semanticMapping: "sourceIndexCharacterIdAndComponentAnchor",
                tokenMatching: "forbidden",
                sourceCodeExtraction: "notImplemented",
                gameVersion: "nullWhenNotExplicit",
                canonicalPromotion: "forbidden"
            },
            projects: {
                gcsim: sourceRevisionInfo({ project: "gcsim", index: sourceIndex, sourceCatalog }),
                genshinOptimizer: sourceRevisionInfo({ project: "genshinOptimizer", index: sourceIndex, sourceCatalog })
            },
            pilotIds,
            talentGapIds,
            summary: {
                schemaVersion: 1,
                pilotCharacters: pilotIds.length,
                talentGapCharacters: talentGapIds.length,
                pilotBehaviorSpecs: Object.values(candidates).filter((candidate) => candidate.candidateType === "pilotBehaviorSpec").length,
                talentGapSpecs: Object.values(candidates).filter((candidate) => candidate.candidateType === "talentGapSpec").length,
                candidates: allCandidates.length,
                externalSources: Object.keys(externalSources).length,
                evidenceMappings: allEvidence.length,
                canonical: 0,
                verificationByStatus: countBy(allCandidates.map((candidate) => candidate.verification.status)),
                runtimeByStatus: countBy(allCandidates.map((candidate) => candidate.verification.runtimeStatus)),
                externalSourcesByProject: projectCounts,
                materializationByStatus: materializedCounts,
                blockedReasonCounts,
                sourceCatalogCharacterRecords: Object.keys(sourceCatalog.records || {}).filter((id) => id.startsWith("gcsim:character:") || id.startsWith("genshinOptimizer:character:")).length,
                revisionMismatchProjects: [...new Set(revisionMismatchProjects)].sort(),
                gameVersion: null
            },
            generatedFrom,
            byCharacter,
            externalSources,
            candidates
        };
    } finally {
        sourceCatalogForCurrentBuild = null;
    }
}

function writeDataset({ dataRoot = defaultDataRoot, outputFile = defaultOutputFile } = {}) {
    const dataset = buildDataset({ dataRoot });
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
    return dataset;
}

if (require.main === module) {
    const dataRoot = process.env.GENSHIN_DATA_ROOT || defaultDataRoot;
    const outputFile = process.env.GENSHIN_EXTERNAL_FIELD_EVIDENCE_FILE || defaultOutputFile;
    process.stdout.write(`${JSON.stringify(writeDataset({ dataRoot, outputFile }).summary, null, 2)}\n`);
}

module.exports = {
    CAPTURED_AT,
    DEFAULT_PILOT_IDS,
    GENERATOR_VERSION,
    buildDataset,
    candidateFieldPaths,
    defaultDataRoot,
    defaultOutputFile,
    materializeLocator,
    semanticAnchor,
    stableJson,
    writeDataset
};
