"use strict";

/** Audit the bounded, evidence-only Genshin Optimizer field artifact. */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultEvidencePath = path.join(repositoryRoot, "games", "genshin", "data", "v2", "external", "optimizer-field-evidence.json");
const defaultReportJsonPath = path.join(repositoryRoot, "reports", "genshin-optimizer-field-evidence.json");
const defaultReportMarkdownPath = path.join(repositoryRoot, "reports", "genshin-optimizer-field-evidence.md");
const EXPECTED_SOURCE_COUNT = 4;
const REQUIRED_SOURCE_FIELDS = [
    "provider", "repository", "revision", "path", "sha256", "locator", "gameVersionEvidence",
    "gameVersionVerified", "providerIndependence", "independenceGroup", "sourceMaterialization"
];
const REQUIRED_FIELD_FIELDS = [
    "sourceRecordId", "candidateId", "field", "sourceField", "status", "structuredValue", "locator",
    "extractionMethod", "gameVersionEvidence", "gameVersionVerified", "supportsClaimValue",
    "providerIndependence", "independenceGroup", "canonicalEligibility", "canonicalBlockedReasons"
];

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function stableClone(value) {
    if (Array.isArray(value)) return value.map(stableClone);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableClone(value[key])]));
}

function stableJson(value) {
    return JSON.stringify(stableClone(value));
}

function countBy(values) {
    const result = {};
    (values || []).forEach((value) => {
        const key = String(value);
        result[key] = (result[key] || 0) + 1;
    });
    return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function relative(file) {
    return path.relative(repositoryRoot, file).replaceAll(path.sep, "/");
}

function validateSource({ id, source, errors, warnings, sourceRoot }) {
    REQUIRED_SOURCE_FIELDS.forEach((field) => {
        if (source[field] === undefined) errors.push(`${id}: missing ${field}`);
    });
    if (source.provider !== "frzyc/genshin-optimizer") errors.push(`${id}: provider mismatch`);
    if (source.revision !== "0c9bde8f99ec1561e66aa0114668e8cdc0b8aca2") errors.push(`${id}: revision must be the pinned GO commit`);
    if (typeof source.path !== "string" || !source.path.startsWith("libs/gi/sheets/src/")) errors.push(`${id}: path must be a GO sheet path`);
    if (!/^[0-9a-f]{64}$/.test(String(source.sha256))) errors.push(`${id}: invalid source SHA-256`);
    if (source.gameVersion !== null) errors.push(`${id}: gameVersion must remain null`);
    if (source.gameVersionVerified !== false) errors.push(`${id}: gameVersionVerified must remain false`);
    if (source.gameVersionEvidence?.status !== "missing") errors.push(`${id}: gameVersionEvidence must be missing`);
    if (source.providerIndependence !== "correlated") errors.push(`${id}: GO must be classified correlated, not independent`);
    if (source.independenceGroup !== "GenshinData-derived") errors.push(`${id}: independenceGroup must be GenshinData-derived`);
    if (!source.locator?.symbol || !Number.isInteger(source.locator?.lineStart)) errors.push(`${id}: semantic source locator missing`);
    if (source.sourceMaterialization?.materialized === true && !sourceRoot) errors.push(`${id}: materialized without sourceRoot`);
    if (!Array.isArray(source.sourceMaterialization?.blockedReasons)) errors.push(`${id}: blockedReasons missing`);
    if (!source.sourceMaterialization?.blockedReasons?.includes("gameVersionNotExplicit")) errors.push(`${id}: missing gameVersionNotExplicit block`);
    if (!source.sourceMaterialization?.blockedReasons?.includes("providerNotIndependent")) errors.push(`${id}: missing providerNotIndependent block`);
    if (sourceRoot && source.sourceMaterialization?.materialized === false && source.sourceMaterialization?.blockedReasons?.includes("sourceShaMismatch")) {
        warnings.push(`${id}: supplied source root did not match the pinned SHA`);
    }
}

function validateField({ index, field, errors }) {
    REQUIRED_FIELD_FIELDS.forEach((name) => {
        if (field[name] === undefined) errors.push(`field[${index}]: missing ${name}`);
    });
    if (!field.sourceRecordId) errors.push(`field[${index}]: sourceRecordId missing`);
    if (!field.candidateId) errors.push(`field[${index}]: candidateId missing`);
    if (!["eligible", "needsReview"].includes(field.status)) errors.push(`field[${index}]: invalid status ${field.status}`);
    if (field.gameVersion !== null) errors.push(`field[${index}]: gameVersion must remain null`);
    if (field.gameVersionVerified !== false) errors.push(`field[${index}]: gameVersionVerified must remain false`);
    if (field.providerIndependence !== "correlated") errors.push(`field[${index}]: providerIndependence must be correlated`);
    if (field.independenceGroup !== "GenshinData-derived") errors.push(`field[${index}]: independenceGroup must be GenshinData-derived`);
    if (field.canonicalEligibility !== false) errors.push(`field[${index}]: canonicalEligibility must be false`);
    if (!Array.isArray(field.canonicalBlockedReasons) || !field.canonicalBlockedReasons.includes("gameVersionMissing")) errors.push(`field[${index}]: gameVersionMissing canonical block missing`);
    if (!field.canonicalBlockedReasons.includes("providerNotIndependent")) errors.push(`field[${index}]: providerNotIndependent canonical block missing`);
    if (!field.locator?.lineStart || !field.locator?.anchor) errors.push(`field[${index}]: semantic locator missing`);
    if (field.extractionMethod?.type !== "semantic-ts-assignment") errors.push(`field[${index}]: extraction must be semantic-ts-assignment`);
    if (field.extractionMethod?.tokenMatchingUsed !== false) errors.push(`field[${index}]: tokenMatchingUsed must be false`);
    if (/numeric[-_ ]?token|regex[-_ ]?number|token-match/i.test(JSON.stringify(field.extractionMethod))) errors.push(`field[${index}]: numeric-token extraction forbidden`);
    if (typeof field.supportsClaimValue !== "boolean") errors.push(`field[${index}]: supportsClaimValue must be boolean`);
    if (field.status === "needsReview" && field.supportsClaimValue === true) errors.push(`field[${index}]: needsReview cannot support claim value`);
}

function auditEvidence({ evidence, sourceRoot = "" } = {}) {
    const errors = [];
    const warnings = [];
    if (!evidence || evidence.schemaVersion !== 1 || evidence.kind !== "genshinOptimizerFieldEvidence" || evidence.evidence !== "genshin-optimizer-field-evidence") errors.push("invalid evidence schema");
    const project = evidence?.project || {};
    if (project.revision !== "0c9bde8f99ec1561e66aa0114668e8cdc0b8aca2") errors.push("project revision is not pinned GO commit");
    if (project.gameVersion !== null) errors.push("project gameVersion must be null");
    if (project.providerIndependence !== "correlated") errors.push("project providerIndependence must be correlated");
    if (project.independenceGroup !== "GenshinData-derived") errors.push("project independenceGroup must be GenshinData-derived");
    if (evidence?.policy?.tokenMatching !== "forbidden") errors.push("tokenMatching policy must be forbidden");
    if (evidence?.policy?.canonicalPromotion !== "forbidden") errors.push("canonicalPromotion policy must be forbidden");
    const sources = evidence?.sourceRecords || {};
    const fields = evidence?.fields || [];
    if (Object.keys(sources).length !== EXPECTED_SOURCE_COUNT) errors.push(`source record count ${Object.keys(sources).length} != ${EXPECTED_SOURCE_COUNT}`);
    if (!Array.isArray(fields) || fields.length < 1) errors.push("field records missing");
    Object.entries(sources).forEach(([id, source]) => validateSource({ id, source, errors, warnings, sourceRoot }));
    fields.forEach((field, index) => {
        validateField({ index, field, errors });
        if (!sources[field.sourceRecordId]) errors.push(`field[${index}]: sourceRecordId ${field.sourceRecordId} not found`);
    });
    const eligible = fields.filter((field) => field.status === "eligible");
    const needsReview = fields.filter((field) => field.status === "needsReview");
    const summary = {
        status: errors.length ? "failed" : "passed",
        sourceRecords: Object.keys(sources).length,
        weaponSourceRecords: Object.values(sources).filter((source) => source.entity?.kind === "weapon").length,
        artifactSourceRecords: Object.values(sources).filter((source) => source.entity?.kind === "artifactSet").length,
        fieldRecords: fields.length,
        eligibleFields: eligible.length,
        needsReviewFields: needsReview.length,
        supportsClaimValueFields: fields.filter((field) => field.supportsClaimValue === true).length,
        canonicalEligibleFields: fields.filter((field) => field.canonicalEligibility === true).length,
        canonicalEligibleCandidates: 0,
        gameVersionMissingSourceRecords: Object.values(sources).filter((source) => source.gameVersion === null).length,
        providerIndependenceCounts: countBy(Object.values(sources).map((source) => source.providerIndependence)),
        independenceGroups: countBy(Object.values(sources).map((source) => source.independenceGroup)),
        materializationByStatus: countBy(Object.values(sources).map((source) => source.sourceMaterialization?.materialized ? "materialized" : "notMaterialized")),
        blockedReasonCounts: countBy(Object.values(sources).flatMap((source) => source.sourceMaterialization?.blockedReasons || []).concat(fields.flatMap((field) => field.canonicalBlockedReasons || []))),
        fieldStatusCounts: countBy(fields.map((field) => field.status)),
        errors: errors.length,
        warnings: warnings.length
    };
    return {
        schemaVersion: 1,
        audit: "genshin-optimizer-field-evidence-audit",
        status: summary.status,
        generatedAt: "2026-08-16T00:00:00.000Z",
        input: {
            evidenceSha256: null,
            sourceRootProvided: Boolean(sourceRoot)
        },
        summary,
        errors,
        warnings,
        methodology: {
            extraction: "Named TypeScript assignments/wrappers only; no arbitrary numeric-token matching.",
            independence: "GO gi-stats is datamine-derived and classified correlated; it cannot satisfy an independent-provider count.",
            gameVersion: "Repository revision and source SHA identify bytes only; no explicit Genshin gameVersion is asserted.",
            canonical: "Always false; this audit never changes v2 specs or runtime status."
        }
    };
}

function renderMarkdown(report) {
    const s = report.summary;
    return [
        "# Genshin Optimizer field evidence audit",
        "",
        `- Status: **${report.status}**`,
        `- Pinned GO source records: **${s.sourceRecords}** (weapons ${s.weaponSourceRecords}, artifacts ${s.artifactSourceRecords})`,
        `- Semantic field records: **${s.fieldRecords}**`,
        `- Eligible value fields: **${s.eligibleFields}**`,
        `- needsReview fields: **${s.needsReviewFields}**`,
        `- supportsClaimValue=true: **${s.supportsClaimValueFields}**`,
        `- Canonical eligible fields/candidates: **${s.canonicalEligibleFields}/${s.canonicalEligibleCandidates}**`,
        `- Game-version-missing source records: **${s.gameVersionMissingSourceRecords}**`,
        `- Independence groups: **${JSON.stringify(s.independenceGroups)}**`,
        `- Materialized checkout: **${JSON.stringify(s.materializationByStatus)}**`,
        "",
        "## Interpretation",
        "",
        "Each mapped value is tied to a named TypeScript assignment and a pinned path/SHA at GO commit `0c9bde8f99ec1561e66aa0114668e8cdc0b8aca2`. The artifact does not search arbitrary numeric tokens.",
        "",
        "GO's `gi-stats` data path is datamine-derived, so it is recorded as `providerIndependence=correlated`, `independenceGroup=GenshinData-derived`; it must not be counted as an independent provider beside gcsim.",
        "",
        "The commit and file digests are revision evidence only. No explicit Genshin game patch/version was found, so every field remains gameVersionVerified=false and canonicalEligibility=false.",
        "",
        "## Blocked reasons",
        "",
        ...Object.entries(s.blockedReasonCounts).map(([reason, count]) => `- ${reason}: ${count}`),
        "",
        "## Errors",
        "",
        ...(report.errors.length ? report.errors.map((error) => `- ${error}`) : ["- none"]),
        "",
        "## Warnings",
        "",
        ...(report.warnings.length ? report.warnings.map((warning) => `- ${warning}`) : ["- none"]),
        ""
    ].join("\n");
}

function writeReports(report, { reportJsonPath = defaultReportJsonPath, reportMarkdownPath = defaultReportMarkdownPath } = {}) {
    fs.mkdirSync(path.dirname(reportJsonPath), { recursive: true });
    fs.writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    fs.writeFileSync(reportMarkdownPath, renderMarkdown(report), "utf8");
}

function parseArgs(argv) {
    const args = { evidencePath: defaultEvidencePath, sourceRoot: process.env.GENSHIN_OPTIMIZER_ROOT || "", reportJsonPath: defaultReportJsonPath, reportMarkdownPath: defaultReportMarkdownPath };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--evidence") args.evidencePath = path.resolve(argv[++i]);
        else if (arg === "--optimizer-root") args.sourceRoot = path.resolve(argv[++i]);
        else if (arg === "--report-json") args.reportJsonPath = path.resolve(argv[++i]);
        else if (arg === "--report-md") args.reportMarkdownPath = path.resolve(argv[++i]);
        else if (arg === "--help") args.help = true;
        else throw new Error(`unknown argument: ${arg}`);
    }
    return args;
}

if (require.main === module) {
    try {
        const args = parseArgs(process.argv.slice(2));
        if (args.help) {
            console.log("Usage: node scripts/genshinOptimizerFieldEvidenceAudit.cjs [--evidence <path>] [--optimizer-root <pinned-checkout>]");
            process.exit(0);
        }
        const evidence = readJson(args.evidencePath);
        const report = auditEvidence({ evidence, sourceRoot: args.sourceRoot });
        report.input.evidenceSha256 = sha256(fs.readFileSync(args.evidencePath));
        writeReports(report, args);
        console.log(JSON.stringify(report.summary, null, 2));
        if (report.status !== "passed") process.exitCode = 1;
    } catch (error) {
        console.error(error.stack || error.message);
        process.exitCode = 1;
    }
}

module.exports = {
    auditEvidence,
    defaultEvidencePath,
    defaultReportJsonPath,
    defaultReportMarkdownPath,
    renderMarkdown,
    writeReports
};
