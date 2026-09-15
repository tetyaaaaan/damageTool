"use strict";

/**
 * Materialise the pinned character locators from the evidence-only join.
 *
 * This is deliberately a read-only, evidence-producing step.  A checkout is
 * considered usable only when its git HEAD is the revision in the
 * constellation source index.  The source-catalog revision is retained as a
 * separate observation; a mismatch is never silently reconciled.  Source
 * parsing records named declarations and their line numbers only.  It never
 * copies numeric tokens, prose, or a computed value into a claim.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const childProcess = require("node:child_process");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultDataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultInputFile = path.join(
    defaultDataRoot,
    "v2",
    "characters",
    "external-field-evidence.json"
);
const defaultOutputFile = path.join(
    defaultDataRoot,
    "v2",
    "characters",
    "field-materialization.json"
);
const GENERATOR_VERSION = "genshinCharacterFieldMaterializationGenerate/1";
const CAPTURED_AT = "2026-08-16T00:00:00.000Z";

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

function uniqueSorted(values) {
    return [...new Set((values || []).map(String))].sort(sortNatural);
}

function countBy(values) {
    const counts = {};
    (values || []).forEach((value) => {
        const key = String(value);
        counts[key] = (counts[key] || 0) + 1;
    });
    return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function relativePath(file) {
    return path.relative(repositoryRoot, file).replaceAll(path.sep, "/");
}

function inputManifest(paths) {
    return Object.entries(paths).map(([role, file]) => {
        const rel = relativePath(file);
        if (!fs.existsSync(file)) return { role, path: rel, exists: false, sha256: null, bytes: 0 };
        return { role, path: rel, exists: true, sha256: fileDigest(file), bytes: fs.statSync(file).size };
    });
}

function isWithinRoot(root, target) {
    if (!root || !target) return false;
    const resolvedRoot = path.resolve(root);
    const resolvedTarget = path.resolve(target);
    return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`);
}

function safeGitRevision(root) {
    if (!root) return null;
    try {
        const value = childProcess.execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"]
        }).trim().toLowerCase();
        return /^[a-f0-9]{40}$/.test(value) ? value : null;
    } catch (_error) {
        return null;
    }
}

function sourceCatalogRecord({ sourceCatalog, project, characterId, locatorPath }) {
    const records = Object.entries(sourceCatalog?.records || {});
    const matching = records
        .filter(([, record]) => {
            if (!record || record.source !== project) return false;
            const recordPath = typeof record.path === "string" ? record.path.replaceAll("\\", "/") : null;
            const id = String(record?.characterId || "");
            const recordId = String(record?.id || "");
            const idMatch = id === String(characterId)
                || recordId === `${project}:character:${characterId}`
                || recordId.includes(`:character:${characterId}`);
            const pathMatch = locatorPath && recordPath && (
                recordPath === locatorPath
                || locatorPath.startsWith(`${recordPath}/`)
                || recordPath.startsWith(`${locatorPath}/`)
            );
            return idMatch || pathMatch;
        })
        .sort(([a], [b]) => a.localeCompare(b));
    if (!matching.length) return null;
    const [recordId, record] = matching[0];
    return {
        id: recordId,
        path: typeof record.path === "string" ? record.path.replaceAll("\\", "/") : null,
        sha256: /^[a-f0-9]{64}$/i.test(String(record.sha256 || "")) ? String(record.sha256).toLowerCase() : null,
        gameVersion: typeof record.gameVersion === "string" && record.gameVersion.trim() ? record.gameVersion.trim() : null,
        gameVersionEvidence: clone(record.gameVersionEvidence || null),
        fieldScoped: Boolean(record.field || record.fieldPath || record.fieldScope)
    };
}

function sourceRevision(project, source, sourceIndex, sourceCatalog) {
    const indexProject = sourceIndex?.projects?.[project] || null;
    const catalogSource = sourceCatalog?.sources?.[project] || null;
    const sourceIndexRevision = indexProject?.revision || source?.revision || null;
    const sourceCatalogRevision = catalogSource?.revision || source?.sourceCatalogRevision || null;
    const blockedReasons = [];
    if (!sourceIndexRevision) blockedReasons.push("sourceIndexRevisionMissing");
    if (!catalogSource) blockedReasons.push("sourceCatalogProjectMissing");
    if (sourceIndexRevision && sourceCatalogRevision && sourceIndexRevision !== sourceCatalogRevision) {
        blockedReasons.push("sourceCatalogRevisionMismatch");
    }
    return {
        sourceIndex: {
            revision: sourceIndexRevision,
            source: "calc/constellation-source-index.json",
            repository: indexProject?.repository || source?.repository || null
        },
        sourceCatalog: {
            revision: sourceCatalogRevision,
            source: sourceCatalogRevision ? "v2/source-catalog.json" : null,
            repository: catalogSource?.repository || null
        },
        comparison: sourceIndexRevision && sourceCatalogRevision
            ? (sourceIndexRevision === sourceCatalogRevision ? "same" : "mismatch")
            : "incomplete",
        blockedReasons
    };
}

function componentSymbolCandidates(component) {
    const raw = String(component || "");
    const tokens = raw.split(/[^A-Za-z0-9]+/).filter(Boolean);
    const camel = tokens.length
        ? tokens[0].toLowerCase() + tokens.slice(1).map((token) => token[0].toUpperCase() + token.slice(1)).join("")
        : "";
    const pascal = tokens.map((token) => token[0].toUpperCase() + token.slice(1)).join("");
    const joined = tokens.join("");
    const candidates = [raw, raw.replaceAll(".", ""), raw.replaceAll(".", "_"), camel, pascal, joined];
    const constellation = /^constellation[._:-]?(\d+)$/i.exec(raw);
    if (constellation) candidates.push(`c${constellation[1]}`, `C${constellation[1]}`, `constellation${constellation[1]}`);
    const passive = /^passive[s:._-]*(\d+|utility)$/i.exec(raw);
    if (passive) {
        candidates.push(`passive${passive[1]}`, `Passive${passive[1]}`, `passivesPassive${passive[1]}`);
    }
    return uniqueSorted(candidates.filter(Boolean));
}

function declarationMatches(text, language) {
    const lines = String(text || "").split(/\r?\n/);
    const declarations = [];
    const patterns = language === "go"
        ? [
            { kind: "const", regex: /^\s*const\s+([A-Za-z_]\w*)\b/ },
            { kind: "var", regex: /^\s*var\s+([A-Za-z_]\w*)\b/ },
            { kind: "func", regex: /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\(/ },
            { kind: "type", regex: /^\s*type\s+([A-Za-z_]\w*)\b/ },
            { kind: "assignment", regex: /^\s*([A-Za-z_]\w*)\s*:?=\s*/ }
        ]
        : [
            { kind: "const", regex: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\b/ },
            { kind: "function", regex: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/ },
            { kind: "class", regex: /^\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)\b/ },
            { kind: "type", regex: /^\s*(?:export\s+)?(?:interface|type)\s+([A-Za-z_$][\w$]*)\b/ }
        ];
    lines.forEach((line, index) => {
        patterns.forEach(({ kind, regex }) => {
            const match = regex.exec(line);
            if (match) declarations.push({ name: match[1], kind, line: index + 1 });
        });
    });
    return declarations;
}

function languageFor(file) {
    return /\.go$/i.test(file) ? "go" : "typescript";
}

function enumerateFiles(target, pathKind) {
    if (!target || !fs.existsSync(target)) return [];
    const stat = fs.statSync(target);
    if (pathKind === "file" || stat.isFile()) return stat.isFile() ? [target] : [];
    const files = [];
    const stack = [target];
    while (stack.length) {
        const current = stack.pop();
        const entries = fs.readdirSync(current, { withFileTypes: true })
            .sort((a, b) => a.name.localeCompare(b.name));
        entries.reverse().forEach((entry) => {
            const child = path.join(current, entry.name);
            if (entry.isDirectory()) stack.push(child);
            else if (entry.isFile() && /\.(?:go|tsx?|jsx?)$/i.test(entry.name)) files.push(child);
        });
    }
    return files.sort((a, b) => a.localeCompare(b));
}

function descriptorFromIndex({ source, sourceIndex }) {
    const entry = sourceIndex?.characters?.[String(source.characterId)] || null;
    const projectEntry = entry?.[source.project] || null;
    const sourcePath = source.locator?.path || projectEntry?.path || null;
    const pathKind = source.locator?.pathKind || (source.role.includes("constellation") ? "file" : "unknown");
    const auxiliaryPaths = [];
    if (source.project === "genshinOptimizer" && projectEntry?.skillParamPath) {
        auxiliaryPaths.push(projectEntry.skillParamPath);
    }
    return {
        path: sourcePath,
        pathKind,
        key: projectEntry?.key || null,
        auxiliaryPaths
    };
}

function materializeSource({ source, sourceIndex, sourceCatalog, roots }) {
    const revision = sourceRevision(source.project, source, sourceIndex, sourceCatalog);
    const descriptor = descriptorFromIndex({ source, sourceIndex });
    const root = roots[source.project] || null;
    const rootConfigured = Boolean(root);
    const rootResolved = rootConfigured ? path.resolve(root) : null;
    const target = rootResolved && descriptor.path ? path.resolve(rootResolved, descriptor.path) : null;
    const safe = Boolean(target && isWithinRoot(rootResolved, target));
    const exists = Boolean(safe && fs.existsSync(target));
    const stat = exists ? fs.statSync(target) : null;
    const observedType = exists ? (stat.isFile() ? "file" : stat.isDirectory() ? "directory" : "other") : null;
    const observedRevision = rootConfigured ? safeGitRevision(rootResolved) : null;
    const revisionMatchesIndex = Boolean(observedRevision && revision.sourceIndex.revision && observedRevision === revision.sourceIndex.revision);
    const revisionMatchesCatalog = Boolean(observedRevision && revision.sourceCatalog.revision && observedRevision === revision.sourceCatalog.revision);
    const blockedReasons = [...revision.blockedReasons];
    if (!rootConfigured) blockedReasons.push("externalSourceRootNotConfigured");
    if (rootConfigured && !safe) blockedReasons.push("externalLocatorOutsideConfiguredRoot");
    if (!descriptor.path) blockedReasons.push("externalLocatorMissing");
    if (rootConfigured && safe && !exists) blockedReasons.push("externalFileNotMaterialized");
    if (exists && descriptor.pathKind === "file" && !stat.isFile()) blockedReasons.push("externalLocatorNotFile");
    if (exists && descriptor.pathKind === "directory" && !stat.isDirectory()) blockedReasons.push("externalLocatorNotDirectory");
    if (rootConfigured && !observedRevision) blockedReasons.push("checkoutRevisionUnverified");
    if (observedRevision && revision.sourceIndex.revision && !revisionMatchesIndex) blockedReasons.push("checkoutRevisionMismatchSourceIndex");
    if (observedRevision && revision.sourceCatalog.revision && !revisionMatchesCatalog) blockedReasons.push("checkoutRevisionMismatchSourceCatalog");
    const pathVerified = Boolean(exists && safe && revisionMatchesIndex && (
        descriptor.pathKind === "unknown" || descriptor.pathKind === observedType
    ));
    const files = pathVerified
        ? enumerateFiles(target, descriptor.pathKind).map((file) => ({
            path: path.relative(rootResolved, file).replaceAll(path.sep, "/"),
            sha256: fileDigest(file),
            bytes: fs.statSync(file).size
        }))
        : [];
    const expectedRecord = sourceCatalogRecord({
        sourceCatalog,
        project: source.project,
        characterId: source.characterId,
        locatorPath: descriptor.path
    });
    if (expectedRecord?.sha256 && files.length === 1 && files[0].sha256 !== expectedRecord.sha256) {
        blockedReasons.push("materializedFileDigestMismatchSourceCatalog");
    }
    if (expectedRecord?.sha256 && !files.length) blockedReasons.push("sourceCatalogDigestNotVerified");
    const declarations = [];
    files.forEach((entry) => {
        const file = path.resolve(rootResolved, entry.path);
        const text = fs.readFileSync(file, "utf8");
        declarationMatches(text, languageFor(file)).forEach((declaration) => {
            declarations.push({ ...declaration, path: entry.path });
        });
    });
    return {
        id: source.id,
        project: source.project,
        characterId: String(source.characterId),
        role: source.role,
        repository: revision.sourceIndex.repository || revision.sourceCatalog.repository || source.repository || null,
        locator: descriptor,
        revisions: revision,
        sourceCatalogRecord: expectedRecord,
        checkout: {
            rootEnv: source.project === "gcsim" ? "GENSHIN_GCSIM_ROOT" : "GENSHIN_OPTIMIZER_ROOT",
            rootConfigured,
            materialized: exists,
            pathVerified,
            observedType,
            observedRevision,
            revisionMatchesSourceIndex: revisionMatchesIndex,
            revisionMatchesSourceCatalog: revisionMatchesCatalog,
            files
        },
        declarations: uniqueDeclarations(declarations),
        blockedReasons: uniqueSorted(blockedReasons),
        gameVersion: expectedRecord?.gameVersion || null,
        gameVersionVerified: false,
        supportsClaimValue: false,
        tokenMatchingUsed: false,
        proseMatchingUsed: false
    };
}

function uniqueDeclarations(declarations) {
    const seen = new Set();
    return (declarations || [])
        .filter((entry) => {
            const key = `${entry.path}:${entry.line}:${entry.kind}:${entry.name}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => `${a.path}:${a.line}:${a.name}`.localeCompare(`${b.path}:${b.line}:${b.name}`));
}

function localFieldPointers(candidate) {
    return (candidate?.localFields || []).map((field) => ({
        sourceId: field.sourceId || null,
        dataset: field.dataset || null,
        record: field.record || null,
        field: field.field || null,
        valueDigest: field.valueDigest || null
    }));
}

function declarationFieldEvidence({ candidate, source, sourceMaterialization }) {
    const component = String(candidate?.entity?.component || "");
    const wanted = componentSymbolCandidates(component).map((name) => name.toLowerCase());
    const matches = (sourceMaterialization.declarations || []).filter((declaration) => wanted.includes(String(declaration.name).toLowerCase()));
    const blockedReasons = [
        ...sourceMaterialization.blockedReasons,
        "gameVersionNotExplicit",
        "namedDeclarationValueExtractionNotImplemented",
        "independentReviewerRequired"
    ];
    if (!matches.length && sourceMaterialization.checkout.pathVerified) blockedReasons.push("namedSymbolNotFound");
    return {
        candidateId: candidate.id,
        characterId: String(candidate.characterId),
        entity: clone(candidate.entity),
        sourceId: source.id,
        localFields: localFieldPointers(candidate),
        semantic: {
            component,
            symbolCandidates: componentSymbolCandidates(component),
            strategy: "namedDeclarationOrStructuredAssignment",
            tokenMatchingUsed: false,
            proseMatchingUsed: false
        },
        extraction: {
            status: matches.length ? "namedSymbolFound" : sourceMaterialization.checkout.pathVerified ? "noNamedSymbolMatch" : "notMaterialized",
            symbols: matches,
            value: null,
            supportsClaimValue: false
        },
        gameVersion: null,
        gameVersionVerified: false,
        supportsClaimValue: false,
        tokenMatchingUsed: false,
        proseMatchingUsed: false,
        verification: {
            status: "needsReview",
            canonical: 0,
            runtimeStatus: "blocked",
            blockedReasons: uniqueSorted(blockedReasons)
        }
    };
}

function buildDataset({
    dataRoot = defaultDataRoot,
    inputFile = defaultInputFile,
    outputFile = defaultOutputFile,
    roots = {
        gcsim: process.env.GENSHIN_GCSIM_ROOT || null,
        genshinOptimizer: process.env.GENSHIN_OPTIMIZER_ROOT || null
    }
} = {}) {
    const external = readJson(inputFile);
    const sourceIndex = readJson(path.join(dataRoot, "calc", "constellation-source-index.json"));
    const sourceCatalog = readJson(path.join(dataRoot, "v2", "source-catalog.json"));
    const externalSources = external.externalSources || {};
    const materializations = {};
    Object.entries(externalSources)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([id, source]) => {
            materializations[id] = materializeSource({ source: { ...source, id }, sourceIndex, sourceCatalog, roots });
        });
    const fieldEvidence = [];
    Object.values(external.candidates || {})
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        .forEach((candidate) => {
            (candidate.externalSourceIds || []).forEach((sourceId) => {
                const source = externalSources[sourceId];
                const materialization = materializations[sourceId];
                if (!source || !materialization) return;
                fieldEvidence.push(declarationFieldEvidence({ candidate, source, sourceMaterialization: materialization }));
            });
        });
    fieldEvidence.sort((a, b) => `${a.candidateId}:${a.sourceId}`.localeCompare(`${b.candidateId}:${b.sourceId}`));
    const blockedReasonCounts = countBy([
        ...Object.values(materializations).flatMap((entry) => entry.blockedReasons),
        ...fieldEvidence.flatMap((entry) => entry.verification.blockedReasons)
    ]);
    const declarations = Object.values(materializations).reduce((sum, entry) => sum + entry.declarations.length, 0);
    const materializedCount = Object.values(materializations).filter((entry) => entry.checkout.materialized).length;
    const verifiedPathCount = Object.values(materializations).filter((entry) => entry.checkout.pathVerified).length;
    const namedSymbolCount = fieldEvidence.filter((entry) => entry.extraction.status === "namedSymbolFound").length;
    const gameVersionVerifiedCount = fieldEvidence.filter((entry) => entry.gameVersionVerified).length;
    return {
        schemaVersion: 1,
        kind: "genshinCharacterFieldMaterialization",
        generator: { name: "genshinCharacterFieldMaterializationGenerate.cjs", version: GENERATOR_VERSION, capturedAt: CAPTURED_AT },
        policy: {
            revisionSemantics: "sourceIndexAndSourceCatalogSeparate",
            checkoutRequirement: "gitHeadMustMatchSourceIndexRevision",
            extraction: "namedDeclarationOrStructuredAssignment",
            tokenMatching: "forbidden",
            proseMatching: "forbidden",
            gameVersion: "explicitOnly",
            canonicalPromotion: "forbidden"
        },
        scope: {
            pilotIds: clone(external.pilotIds || []),
            talentGapIds: clone(external.talentGapIds || []),
            characterIds: uniqueSorted([...(external.pilotIds || []), ...(external.talentGapIds || [])]),
            candidateCount: Object.keys(external.candidates || {}).length
        },
        revisions: Object.fromEntries(Object.entries(external.projects || {}).map(([project, source]) => [
            project,
            sourceRevision(project, source, sourceIndex, sourceCatalog)
        ])),
        summary: {
            schemaVersion: 1,
            pilotCharacters: (external.pilotIds || []).length,
            talentGapCharacters: (external.talentGapIds || []).length,
            characters: uniqueSorted([...(external.pilotIds || []), ...(external.talentGapIds || [])]).length,
            candidates: Object.keys(external.candidates || {}).length,
            externalSources: Object.keys(materializations).length,
            materializedSources: materializedCount,
            pathVerifiedSources: verifiedPathCount,
            files: Object.values(materializations).reduce((sum, entry) => sum + entry.checkout.files.length, 0),
            declarations,
            fieldEvidence: fieldEvidence.length,
            namedSymbolEvidence: namedSymbolCount,
            gameVersionVerified: gameVersionVerifiedCount,
            canonical: 0,
            verificationByStatus: countBy(fieldEvidence.map((entry) => entry.verification.status)),
            runtimeByStatus: countBy(fieldEvidence.map((entry) => entry.verification.runtimeStatus)),
            blockedReasonCounts
        },
        generatedFrom: inputManifest({
            externalEvidence: inputFile,
            sourceIndex: path.join(dataRoot, "calc", "constellation-source-index.json"),
            sourceCatalog: path.join(dataRoot, "v2", "source-catalog.json")
        }),
        materializations,
        fieldEvidence
    };
}

function writeDataset(options = {}) {
    const dataset = buildDataset(options);
    const outputFile = options.outputFile || defaultOutputFile;
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
    return dataset;
}

if (require.main === module) {
    const dataRoot = process.env.GENSHIN_DATA_ROOT || defaultDataRoot;
    const inputFile = process.env.GENSHIN_EXTERNAL_FIELD_EVIDENCE_FILE || defaultInputFile;
    const outputFile = process.env.GENSHIN_FIELD_MATERIALIZATION_FILE || defaultOutputFile;
    process.stdout.write(`${JSON.stringify(writeDataset({ dataRoot, inputFile, outputFile }).summary, null, 2)}\n`);
}

module.exports = {
    CAPTURED_AT,
    GENERATOR_VERSION,
    buildDataset,
    componentSymbolCandidates,
    declarationMatches,
    defaultDataRoot,
    defaultInputFile,
    defaultOutputFile,
    materializeSource,
    stableJson,
    writeDataset
};
