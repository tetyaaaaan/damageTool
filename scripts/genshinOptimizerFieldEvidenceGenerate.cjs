"use strict";

/**
 * Build a small, evidence-only field join against a pinned Genshin Optimizer
 * checkout.  The project is intentionally classified as correlated with the
 * local datamine hierarchy: GO's gi-stats pipeline is datamine-derived, so it
 * is not counted as an independent provider for canonical promotion.
 *
 * This artifact contains only named TypeScript assignments from four pinned
 * files.  It never searches arbitrary numeric tokens and never mutates v2
 * candidates, verification, or runtime status.  A caller may provide a local
 * checkout with --optimizer-root; when absent, the checked-in path/SHA and
 * semantic extraction metadata remain auditable but materialization is
 * explicitly blocked.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultDataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultOutputPath = path.join(
    defaultDataRoot,
    "v2",
    "external",
    "optimizer-field-evidence.json"
);
const defaultSourceCatalogPath = path.join(defaultDataRoot, "v2", "source-catalog.json");
const GENERATOR_VERSION = "genshinOptimizerFieldEvidenceGenerate/1";
const CAPTURED_AT = "2026-08-16T00:00:00.000Z";
const REFINEMENTS = [1, 2, 3, 4, 5];

const PROJECT = {
    project: "genshinOptimizer",
    provider: "frzyc/genshin-optimizer",
    repository: "https://github.com/frzyc/genshin-optimizer",
    revision: "0c9bde8f99ec1561e66aa0114668e8cdc0b8aca2",
    revisionKind: "gitCommit",
    // The pinned commit identifies repository bytes only.  It is not a game
    // patch/version declaration and must never be treated as one.
    gameVersion: null,
    gameVersionEvidence: {
        status: "missing",
        note: "The pinned GO commit and source-file SHA identify repository bytes but do not declare a Genshin game patch/version."
    },
    // GO's gi-stats source is explicitly datamine-derived.  Keep it correlated
    // with the local GenshinData hierarchy instead of over-counting it as an
    // independent provider next to gcsim.
    providerIndependence: "correlated",
    independenceGroup: "GenshinData-derived",
    independenceNote: "Genshin Optimizer gi-stats is a datamine-derived projection; this source cannot satisfy an independent-provider gate."
};

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

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableJson(value) {
    return JSON.stringify(stableValue(value));
}

function sortNatural(left, right) {
    return String(left).localeCompare(String(right), "en", { numeric: true });
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

function lineRange(anchor) {
    return { lineStart: anchor.lineStart, lineEnd: anchor.lineEnd, anchor: anchor.text };
}

function refinementMap(values) {
    if (!Array.isArray(values) || values.length !== 6) throw new Error("expected GO refinement array with sentinel index 0");
    return Object.fromEntries(REFINEMENTS.map((refinement) => [String(refinement), Number(values[refinement]) * 100]));
}

function candidateClaim(specs, candidateId) {
    const spec = specs[candidateId];
    if (!spec) return null;
    const effect = spec.effect || {};
    return {
        value: effect.value,
        unit: effect.unit,
        targets: effect.targets,
        activation: effect.activation
    };
}

function compareClaim(claim, evidence) {
    if (!claim) return { status: "candidateMissing" };
    return {
        valueMatch: claim.value === undefined ? null : stableJson(claim.value) === stableJson(evidence.structuredValue),
        unitMatch: claim.unit === undefined || claim.unit === null ? null : claim.unit === evidence.unit,
        targetMatch: claim.targets === undefined || claim.targets === null ? null : stableJson(claim.targets) === stableJson(evidence.targets),
        activationMatch: claim.activation === undefined || claim.activation === null ? null : stableJson(claim.activation) === stableJson(evidence.activation)
    };
}

function materialize({ optimizerRoot, source }) {
    const blockedReasons = [];
    const root = optimizerRoot ? path.resolve(optimizerRoot) : null;
    const absolute = root ? path.resolve(root, source.path.replaceAll("/", path.sep)) : null;
    const safe = Boolean(root && (absolute === root || absolute.startsWith(`${root}${path.sep}`)));
    const exists = Boolean(safe && fs.existsSync(absolute));
    if (!root) blockedReasons.push("externalSourceRootNotConfigured");
    if (root && !safe) blockedReasons.push("externalLocatorOutsideConfiguredRoot");
    if (root && safe && !exists) blockedReasons.push("externalFileNotMaterialized");
    let observedSha256 = null;
    let observedBytes = 0;
    let observedType = null;
    if (exists) {
        const stat = fs.statSync(absolute);
        observedType = stat.isFile() ? "file" : stat.isDirectory() ? "directory" : "other";
        if (!stat.isFile()) blockedReasons.push("externalLocatorNotFile");
        else {
            observedSha256 = sha256(fs.readFileSync(absolute));
            observedBytes = stat.size;
            if (observedSha256 !== source.sha256) blockedReasons.push("sourceShaMismatch");
        }
    }
    blockedReasons.push("gameVersionNotExplicit");
    blockedReasons.push("providerNotIndependent");
    return {
        rootConfigured: Boolean(root),
        materialized: exists && observedType === "file" && observedSha256 === source.sha256,
        observedType,
        observedSha256,
        observedBytes,
        blockedReasons: [...new Set(blockedReasons)].sort()
    };
}

function makeSource({ optimizerRoot, definition }) {
    return {
        id: definition.sourceId,
        entity: clone(definition.entity),
        provider: PROJECT.provider,
        repository: PROJECT.repository,
        revision: PROJECT.revision,
        revisionKind: PROJECT.revisionKind,
        path: definition.path,
        sha256: definition.sha256,
        locator: clone(definition.sourceLocator),
        gameVersion: PROJECT.gameVersion,
        gameVersionEvidence: clone(PROJECT.gameVersionEvidence),
        gameVersionVerified: false,
        providerIndependence: PROJECT.providerIndependence,
        independenceGroup: PROJECT.independenceGroup,
        sourceMaterialization: materialize({ optimizerRoot, source: definition }),
        notes: definition.notes || null
    };
}

function makeField({ source, specs, definition }) {
    const claim = candidateClaim(specs, definition.candidateId);
    const status = definition.status || "eligible";
    const field = {
        sourceRecordId: source.id,
        candidateId: definition.candidateId,
        field: definition.field || "value",
        sourceField: definition.sourceField,
        status,
        structuredValue: clone(definition.structuredValue),
        value: clone(definition.structuredValue),
        unit: definition.unit || null,
        units: definition.unit || null,
        targets: clone(definition.targets || null),
        activation: clone(definition.activation || null),
        locator: lineRange(definition.locator),
        extractionMethod: {
            type: "semantic-ts-assignment",
            namedBinding: definition.namedBinding,
            expression: definition.expression,
            semanticAnchors: [definition.namedBinding, definition.expression],
            tokenMatchingUsed: false,
            note: "Named TypeScript assignment/wrapper only; arbitrary-number search is forbidden."
        },
        gameVersion: null,
        gameVersionEvidence: clone(PROJECT.gameVersionEvidence),
        gameVersionVerified: false,
        supportsClaimValue: definition.supportsClaimValue ?? (status === "eligible"),
        providerIndependence: PROJECT.providerIndependence,
        independenceGroup: PROJECT.independenceGroup,
        canonicalEligibility: false,
        canonicalBlockedReasons: ["gameVersionMissing", "providerNotIndependent", "independentReviewerRequired"],
        claimComparison: compareClaim(claim, {
            structuredValue: definition.structuredValue,
            unit: definition.unit,
            targets: definition.targets,
            activation: definition.activation
        }),
        notes: definition.notes || null
    };
    if (definition.reason) field.reason = definition.reason;
    return field;
}

function sourceDefinitions() {
    return [
        {
            sourceId: "genshinOptimizer:weapon:11503",
            entity: { kind: "weapon", id: "11503" },
            path: "libs/gi/sheets/src/Weapons/Sword/FreedomSworn/index.tsx",
            sha256: "ada8d7aacdf67c69c8518fb1aa5cd2c89b9701e926e07b7ffb98d15aea464872",
            sourceLocator: { symbol: "FreedomSworn", lineStart: 12, lineEnd: 12 },
            notes: "Pinned GO weapon sheet; array bindings are static, while refinementBonus.dmg_ is imported from gi-stats and remains unresolved in this pilot."
        },
        {
            sourceId: "genshinOptimizer:weapon:15502",
            entity: { kind: "weapon", id: "15502" },
            path: "libs/gi/sheets/src/Weapons/Bow/AmosBow/index.tsx",
            sha256: "c89a3d1b529c047b0750b3fbd85ac737dc6f20f213ad0aedf4795e66ab9a1a74",
            sourceLocator: { symbol: "AmosBow", lineStart: 16, lineEnd: 16 },
            notes: "Pinned GO weapon sheet; refinement arrays and lookup/stack wrappers are retained as semantic anchors."
        },
        {
            sourceId: "genshinOptimizer:artifact:10001",
            entity: { kind: "artifactSet", id: "10001" },
            path: "libs/gi/sheets/src/Artifacts/ResolutionOfSojourner/index.tsx",
            sha256: "5103befbe34159168c63bd3d735ab20fcc9c720e97fb911bff2ad3af9030b3ed",
            sourceLocator: { symbol: "ResolutionOfSojourner", lineStart: 11, lineEnd: 12 },
            notes: "Pinned GO artifact sheet; set2/set4 values are named percent() assignments."
        },
        {
            sourceId: "genshinOptimizer:artifact:10002",
            entity: { kind: "artifactSet", id: "10002" },
            path: "libs/gi/sheets/src/Artifacts/BraveHeart/index.tsx",
            sha256: "9b298f82f6e0af2ceb9b13444136ba0cadb60a3d69a6becb202e764cac94cb32",
            sourceLocator: { symbol: "BraveHeart", lineStart: 12, lineEnd: 18 },
            notes: "Pinned GO artifact sheet; set4 activation is condition-wrapped and remains separately review-gated."
        }
    ];
}

function fieldDefinitions() {
    const map = (values) => Object.fromEntries(REFINEMENTS.map((r) => [String(r), values[r - 1]]));
    return [
        {
            sourceId: "genshinOptimizer:weapon:11503",
            candidateId: "w_11503_damage_3",
            sourceField: "autoSrc",
            namedBinding: "autoSrc",
            expression: "const autoSrc = [-1, 0.16, 0.2, 0.24, 0.28, 0.32]",
            locator: { lineStart: 14, lineEnd: 14, text: "const autoSrc = [-1, 0.16, 0.2, 0.24, 0.28, 0.32]" },
            structuredValue: map([16, 20, 24, 28, 32]),
            unit: "percent",
            targets: ["normalAttackDamageBonus", "chargedAttackDamageBonus", "plungingAttackDamageBonus"],
            activation: null,
            notes: "GO conditional wrapper is present at lines 27-30; candidate activation remains unchanged and requires review."
        },
        {
            sourceId: "genshinOptimizer:weapon:11503",
            candidateId: "w_11503_stat_2",
            sourceField: "atk_Src",
            namedBinding: "atk_Src",
            expression: "const atk_Src = [-1, 0.2, 0.25, 0.3, 0.35, 0.4]",
            locator: { lineStart: 15, lineEnd: 15, text: "const atk_Src = [-1, 0.2, 0.25, 0.3, 0.35, 0.4]" },
            structuredValue: map([20, 25, 30, 35, 40]),
            unit: "percent",
            targets: ["atkPercent"],
            activation: null
        },
        {
            sourceId: "genshinOptimizer:weapon:11503",
            candidateId: "w_11503_damage_1",
            sourceField: "data_gen.refinementBonus.dmg_",
            namedBinding: "dmg_arr",
            expression: "const dmg_arr = data_gen.refinementBonus.dmg_",
            locator: { lineStart: 16, lineEnd: 16, text: "const dmg_arr = data_gen.refinementBonus.dmg_" },
            structuredValue: null,
            unit: "percent",
            status: "needsReview",
            supportsClaimValue: false,
            reason: "importedGiStatsDatasetNotMaterialized",
            notes: "Named imported field only; no value is guessed from unrelated tokens."
        },
        {
            sourceId: "genshinOptimizer:weapon:15502",
            candidateId: "w_15502_damage_1",
            sourceField: "autoDmgInc",
            namedBinding: "autoDmgInc",
            expression: "const autoDmgInc = [-1, 0.12, 0.15, 0.18, 0.21, 0.24]",
            locator: { lineStart: 18, lineEnd: 18, text: "const autoDmgInc = [-1, 0.12, 0.15, 0.18, 0.21, 0.24]" },
            structuredValue: map([12, 15, 18, 21, 24]),
            unit: "percent",
            targets: ["normalAttackDamageBonus", "chargedAttackDamageBonus"]
        },
        {
            sourceId: "genshinOptimizer:weapon:15502",
            candidateId: "w_15502_damageBonus_fc388315",
            sourceField: "arrowDmgInc",
            namedBinding: "arrowDmgInc",
            expression: "const arrowDmgInc = [-1, 0.08, 0.1, 0.12, 0.14, 0.16]",
            locator: { lineStart: 19, lineEnd: 19, text: "const arrowDmgInc = [-1, 0.08, 0.1, 0.12, 0.14, 0.16]" },
            structuredValue: map([8, 10, 12, 14, 16]),
            unit: "percent",
            targets: ["normalAttackDamageBonus", "chargedAttackDamageBonus"],
            activation: { condition: "arrowFlightTime", maxStacks: 5 },
            notes: "Stack semantics are anchored by dmgInc/subscript + lookup/prod lines 29-44; stack mapping remains reviewable."
        },
        {
            sourceId: "genshinOptimizer:artifact:10001",
            candidateId: "artifact:10001:twoPiece:2pc_atk_percent",
            sourceField: "set2",
            namedBinding: "set2",
            expression: "const set2 = greaterEq(input.artSet.ResolutionOfSojourner, 2, percent(0.18))",
            locator: { lineStart: 11, lineEnd: 11, text: "const set2 = greaterEq(input.artSet.ResolutionOfSojourner, 2, percent(0.18))" },
            structuredValue: 18,
            unit: "percent",
            targets: ["atkPercent"],
            activation: { condition: "always", pieceCount: 2 }
        },
        {
            sourceId: "genshinOptimizer:artifact:10001",
            candidateId: "artifact:10001:fourPiece:4pc_charged_crit_rate",
            sourceField: "set4",
            namedBinding: "set4",
            expression: "const set4 = greaterEq(input.artSet.ResolutionOfSojourner, 4, percent(0.3))",
            locator: { lineStart: 12, lineEnd: 12, text: "const set4 = greaterEq(input.artSet.ResolutionOfSojourner, 4, percent(0.3))" },
            structuredValue: 30,
            unit: "percent",
            targets: ["critRate"],
            activation: { condition: "chargedAttack", pieceCount: 4 }
        },
        {
            sourceId: "genshinOptimizer:artifact:10002",
            candidateId: "artifact:10002:twoPiece:2pc_atk_percent",
            sourceField: "set2",
            namedBinding: "set2",
            expression: "const set2 = greaterEq(input.artSet.BraveHeart, 2, percent(0.18))",
            locator: { lineStart: 12, lineEnd: 12, text: "const set2 = greaterEq(input.artSet.BraveHeart, 2, percent(0.18))" },
            structuredValue: 18,
            unit: "percent",
            targets: ["atkPercent"],
            activation: { condition: "always", pieceCount: 2 }
        },
        {
            sourceId: "genshinOptimizer:artifact:10002",
            candidateId: "artifact:10002:fourPiece:4pc_damage_vs_enemy_hp_gt_50",
            sourceField: "set4",
            namedBinding: "set4",
            expression: "const set4 = greaterEq(input.artSet.BraveHeart, 4, equal('50', condNode, percent(0.3)))",
            locator: { lineStart: 14, lineEnd: 18, text: "const set4 = greaterEq(\n  input.artSet.BraveHeart,\n  4,\n  equal('50', condNode, percent(0.3))\n)" },
            structuredValue: 30,
            unit: "percent",
            targets: ["allDamageBonus"],
            activation: null,
            notes: "Value is named/explicit; mapping equal('50', condNode, ...) to enemyHpAtLeast50 is retained for review."
        },
        {
            sourceId: "genshinOptimizer:artifact:10002",
            candidateId: "artifact:10002:fourPiece:4pc_damage_vs_enemy_hp_gt_50",
            field: "activation",
            sourceField: "equal('50', condNode, ...)",
            namedBinding: "set4",
            expression: "equal('50', condNode, percent(0.3))",
            locator: { lineStart: 17, lineEnd: 17, text: "equal('50', condNode, percent(0.3))" },
            structuredValue: { sourceCondition: "equal('50', condNode, ...)" },
            unit: null,
            targets: null,
            status: "needsReview",
            supportsClaimValue: false,
            reason: "activationSemanticMappingRequiresReview"
        }
    ];
}

function buildEvidence({ dataRoot = defaultDataRoot, optimizerRoot = process.env.GENSHIN_OPTIMIZER_ROOT || "", sourceCatalogPath = defaultSourceCatalogPath } = {}) {
    const weaponSpecs = readJson(path.join(dataRoot, "v2", "weapons", "spec-candidates.json"));
    const artifactSpecs = readJson(path.join(dataRoot, "v2", "artifacts", "spec-candidates.json"));
    const sourceCatalogExists = fs.existsSync(sourceCatalogPath);
    const specs = { ...weaponSpecs, ...artifactSpecs };
    const definitions = sourceDefinitions();
    const sources = Object.fromEntries(definitions.map((definition) => {
        const source = makeSource({ optimizerRoot, definition });
        return [source.id, source];
    }));
    const fields = fieldDefinitions().map((definition) => {
        const source = sources[definition.sourceId];
        if (!source) throw new Error(`missing source for ${definition.sourceId}`);
        return makeField({ source, specs, definition });
    });
    const groupedByEntity = {};
    Object.values(sources).forEach((source) => {
        const key = `${source.entity.kind}:${source.entity.id}`;
        groupedByEntity[key] = groupedByEntity[key] || [];
        groupedByEntity[key].push(source.id);
    });
    const eligible = fields.filter((field) => field.status === "eligible");
    return {
        schemaVersion: 1,
        kind: "genshinOptimizerFieldEvidence",
        evidence: "genshin-optimizer-field-evidence",
        generator: { name: "genshinOptimizerFieldEvidenceGenerate.cjs", version: GENERATOR_VERSION, capturedAt: CAPTURED_AT },
        policy: {
            scope: "bounded weapon/artifact representative batch",
            extraction: "named TypeScript assignment/wrapper",
            tokenMatching: "forbidden",
            gameVersion: "nullWhenNotExplicit",
            revisionSemantics: "repositoryRevisionAndFileShaOnly",
            independence: "correlatedDatamineDerivedNotIndependent",
            canonicalPromotion: "forbidden"
        },
        project: clone(PROJECT),
        input: {
            weaponSpecs: { path: relativePath(path.join(dataRoot, "v2", "weapons", "spec-candidates.json")), sha256: sha256(fs.readFileSync(path.join(dataRoot, "v2", "weapons", "spec-candidates.json"))) },
            artifactSpecs: { path: relativePath(path.join(dataRoot, "v2", "artifacts", "spec-candidates.json")), sha256: sha256(fs.readFileSync(path.join(dataRoot, "v2", "artifacts", "spec-candidates.json"))) },
            // The source catalog is deliberately not a data dependency for
            // this self-contained GO pilot.  Keep only its presence/path so a
            // parallel catalog-contract update cannot silently invalidate the
            // field artifact digest.
            sourceCatalog: { path: relativePath(sourceCatalogPath), exists: sourceCatalogExists }
        },
        sourceRecords: sources,
        fields,
        byEntity: Object.fromEntries(Object.entries(groupedByEntity).sort(([a], [b]) => sortNatural(a, b))),
        summary: {
            sourceRecords: Object.keys(sources).length,
            weaponSourceRecords: Object.values(sources).filter((source) => source.entity.kind === "weapon").length,
            artifactSourceRecords: Object.values(sources).filter((source) => source.entity.kind === "artifactSet").length,
            fieldRecords: fields.length,
            eligibleFields: eligible.length,
            needsReviewFields: fields.filter((field) => field.status === "needsReview").length,
            supportsClaimValueFields: fields.filter((field) => field.supportsClaimValue === true).length,
            canonicalEligibleFields: fields.filter((field) => field.canonicalEligibility === true).length,
            canonicalEligibleCandidates: 0,
            gameVersionMissingSourceRecords: Object.values(sources).filter((source) => source.gameVersion === null).length,
            providerIndependenceCounts: countBy(Object.values(sources).map((source) => source.providerIndependence)),
            independenceGroups: countBy(Object.values(sources).map((source) => source.independenceGroup)),
            materializationByStatus: countBy(Object.values(sources).map((source) => source.sourceMaterialization.materialized ? "materialized" : "notMaterialized")),
            blockedReasonCounts: countBy(Object.values(sources).flatMap((source) => source.sourceMaterialization.blockedReasons).concat(fields.flatMap((field) => field.canonicalBlockedReasons || []))),
            fieldStatusCounts: countBy(fields.map((field) => field.status)),
            gameVersion: null
        }
    };
}

function writeEvidence(evidence, outputPath = defaultOutputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    return outputPath;
}

function parseArgs(argv) {
    const args = { optimizerRoot: process.env.GENSHIN_OPTIMIZER_ROOT || "", outputPath: defaultOutputPath, dataRoot: defaultDataRoot, sourceCatalogPath: defaultSourceCatalogPath };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--optimizer-root") args.optimizerRoot = path.resolve(argv[++i]);
        else if (arg === "--output") args.outputPath = path.resolve(argv[++i]);
        else if (arg === "--data-root") args.dataRoot = path.resolve(argv[++i]);
        else if (arg === "--source-catalog") args.sourceCatalogPath = path.resolve(argv[++i]);
        else if (arg === "--help") args.help = true;
        else throw new Error(`unknown argument: ${arg}`);
    }
    return args;
}

if (require.main === module) {
    try {
        const args = parseArgs(process.argv.slice(2));
        if (args.help) {
            console.log("Usage: node scripts/genshinOptimizerFieldEvidenceGenerate.cjs [--optimizer-root <pinned-checkout>] [--output <path>]");
            process.exit(0);
        }
        const evidence = buildEvidence(args);
        const output = writeEvidence(evidence, args.outputPath);
        console.log(JSON.stringify({ output, summary: evidence.summary }, null, 2));
    } catch (error) {
        console.error(error.stack || error.message);
        process.exitCode = 1;
    }
}

module.exports = {
    CAPTURED_AT,
    defaultDataRoot,
    defaultOutputPath,
    GENERATOR_VERSION,
    PROJECT,
    buildEvidence,
    fieldDefinitions,
    sourceDefinitions,
    refinementMap,
    writeEvidence
};
