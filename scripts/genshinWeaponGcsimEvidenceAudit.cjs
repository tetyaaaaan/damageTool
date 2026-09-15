"use strict";

/** Audit the pinned gcsim weapon field-evidence artifact without changing v2. */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const repositoryRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultEvidencePath = path.join(dataRoot, "v2", "weapons", "external-evidence.json");
const defaultSourceCatalogPath = path.join(dataRoot, "v2", "source-catalog.json");
const defaultReportJsonPath = path.join(repositoryRoot, "reports", "genshin-weapon-gcsim-evidence.json");
const defaultReportMarkdownPath = path.join(repositoryRoot, "reports", "genshin-weapon-gcsim-evidence.md");
const EXPECTED_SOURCE_COUNT = 9;
const REQUIRED_FIELDS = ["provider", "revision", "path", "sha256", "locator", "structuredValue", "extractionMethod", "gameVersionEvidence", "gameVersionVerified", "supportsClaimValue", "providerIndependence", "independenceGroup"];

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

function sortNatural(a, b) {
    return String(a).localeCompare(String(b), "en", { numeric: true });
}

function countBy(values) {
    const counts = {};
    values.forEach((value) => {
        const key = String(value);
        counts[key] = (counts[key] || 0) + 1;
    });
    return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function relative(file) {
    return path.relative(repositoryRoot, file).replaceAll(path.sep, "/");
}

function portableProviderPath(value) {
    if (typeof value !== "string" || !value || path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\")) return false;
    const normalized = value.replaceAll("\\", "/");
    return !normalized.split("/").includes("..");
}

function sourceCatalogRecords(sourceCatalog) {
    return Object.entries(sourceCatalog.records || {})
        .filter(([id, record]) => id.startsWith("gcsim:weapon:") && record?.source === "gcsim")
        .sort(([a], [b]) => sortNatural(a, b));
}

function validateSourceRecord({ id, record, catalogRecord, provider, sourceRoot, errors, warnings }) {
    const source = record?.sourceRecord || record;
    if (!source) {
        errors.push(`${id}: missing sourceRecord`);
        return;
    }
    ["provider", "revision", "path", "sha256", "locator"].forEach((key) => {
        if (source[key] === undefined || source[key] === null || source[key] === "") errors.push(`${id}: sourceRecord.${key} missing`);
    });
    if (source.provider !== provider.provider) errors.push(`${id}: provider mismatch`);
    if (source.revision !== provider.revision) errors.push(`${id}: revision mismatch`);
    if (source.path !== catalogRecord.path) errors.push(`${id}: path mismatch`);
    if (!portableProviderPath(catalogRecord.path)) errors.push(`${id}: source catalog path must be provider-relative`);
    if (!portableProviderPath(source.path)) errors.push(`${id}: sourceRecord.path must be provider-relative`);
    if (record.path !== catalogRecord.path) errors.push(`${id}: record.path mismatch`);
    if (!portableProviderPath(record.path)) errors.push(`${id}: record.path must be provider-relative`);
    if (source.sha256 !== catalogRecord.sha256) errors.push(`${id}: SHA mismatch against source catalog`);
    if (source.gameVersionVerified !== false) errors.push(`${id}: gameVersionVerified must be false`);
    if (source.providerIndependence !== "independent") errors.push(`${id}: providerIndependence must be independent`);
    if (!source.independenceGroup) errors.push(`${id}: independenceGroup missing`);
    if (source.revisionVerified !== true) errors.push(`${id}: revisionVerified must be true`);
    if (source.gameVersion !== null) warnings.push(`${id}: gameVersion unexpectedly populated`);
    if (source.gameVersionEvidence?.status !== "missing") errors.push(`${id}: gameVersionEvidence must remain missing for this catalog`);
    if (record.sourceFile === undefined || record.sourceFile === null || record.sourceFile === "") {
        errors.push(`${id}: sourceFile missing`);
    } else {
        if (!portableProviderPath(record.sourceFile)) errors.push(`${id}: sourceFile must be provider-relative (absolute/root paths are forbidden)`);
        if (record.sourceFile !== catalogRecord.path) errors.push(`${id}: sourceFile must equal source catalog path`);
    }
    if (!sourceRoot) return;
    if (!portableProviderPath(source.path)) {
        errors.push(`${id}: sourceRecord.path must be provider-relative before source-root resolution`);
        return;
    }
    const file = path.join(sourceRoot, String(source.path).replaceAll("/", path.sep));
    if (!fs.existsSync(file)) {
        errors.push(`${id}: source file not found at ${file}`);
        return;
    }
    const digest = sha256(fs.readFileSync(file));
    if (digest !== source.sha256) errors.push(`${id}: source file SHA mismatch (${digest})`);
}

function validateField({ id, field, expectedPath, errors, warnings }) {
    REQUIRED_FIELDS.forEach((key) => {
        if (field[key] === undefined) errors.push(`${id}/${field.candidateId || "unmapped"}/${field.field || "unknown"}: missing ${key}`);
    });
    if (!["eligible", "needsReview"].includes(field.status)) errors.push(`${id}/${field.candidateId || "unmapped"}/${field.field || "unknown"}: invalid status`);
    if (field.canonicalEligibility !== false) errors.push(`${id}/${field.candidateId || "unmapped"}/${field.field || "unknown"}: canonicalEligibility must be false`);
    if (field.gameVersion !== null) warnings.push(`${id}/${field.field}: gameVersion unexpectedly populated`);
    if (field.gameVersionVerified !== false) errors.push(`${id}/${field.field}: gameVersionVerified must be false`);
    if (typeof field.supportsClaimValue !== "boolean") errors.push(`${id}/${field.field}: supportsClaimValue must be boolean`);
    if (field.providerIndependence !== "independent") errors.push(`${id}/${field.field}: providerIndependence must be independent`);
    if (!field.independenceGroup) errors.push(`${id}/${field.field}: independenceGroup missing`);
    if (field.gameVersionEvidence?.status !== "missing") errors.push(`${id}/${field.field}: gameVersionEvidence must be missing`);
    if (!field.locator?.lineStart || !field.locator?.anchor) errors.push(`${id}/${field.field}: locator must include lineStart and anchor`);
    const methodType = String(field.extractionMethod?.type || "");
    if (!methodType.startsWith("semantic-go-")) errors.push(`${id}/${field.field}: non-semantic extraction method ${methodType}`);
    if (/numeric[-_ ]?token|regex[-_ ]?number|token-match/i.test(JSON.stringify(field.extractionMethod))) {
        errors.push(`${id}/${field.field}: numeric-token extraction is forbidden`);
    }
    if (!field.sourceRecordId || field.sourceRecordId !== id) errors.push(`${id}/${field.field}: sourceRecordId mismatch`);
    if (field.provider === "damageTool-local") errors.push(`${id}/${field.field}: local provider cannot be gcsim evidence`);
    if (field.path !== expectedPath || !portableProviderPath(field.path)) errors.push(`${id}/${field.field}: field.path must equal the provider-relative source catalog path`);
    if (!field.sourceRecord || field.sourceRecord.path !== expectedPath || !portableProviderPath(field.sourceRecord.path)) errors.push(`${id}/${field.field}: field.sourceRecord.path must equal the provider-relative source catalog path`);
}

function auditEvidence({ evidence, sourceCatalog, sourceRoot = "" } = {}) {
    const errors = [];
    const warnings = [];
    if (!evidence || evidence.schemaVersion !== 1 || evidence.evidence !== "genshin-weapon-gcsim-field-evidence") errors.push("invalid evidence schema");
    const provider = sourceCatalog.sources?.gcsim;
    if (!provider) errors.push("gcsim provider missing from source catalog");
    const catalogEntries = sourceCatalogRecords(sourceCatalog);
    const records = evidence?.records || {};
    if (catalogEntries.length !== EXPECTED_SOURCE_COUNT) errors.push(`source catalog pinned record count ${catalogEntries.length} != ${EXPECTED_SOURCE_COUNT}`);
    if (Object.keys(records).length !== catalogEntries.length) errors.push(`evidence source record count ${Object.keys(records).length} != ${catalogEntries.length}`);
    const catalogIds = new Set(catalogEntries.map(([id]) => id));
    Object.keys(records).forEach((id) => {
        if (!catalogIds.has(id)) errors.push(`unexpected evidence source record ${id}`);
    });
    catalogEntries.forEach(([id, catalogRecord]) => {
        const record = records[id];
        if (!record) {
            errors.push(`missing evidence source record ${id}`);
            return;
        }
        validateSourceRecord({ id, record, catalogRecord, provider, sourceRoot, errors, warnings });
        if (!Array.isArray(record.fields)) errors.push(`${id}: fields must be an array`);
        (record.fields || []).forEach((field) => validateField({ id, field, expectedPath: catalogRecord.path, errors, warnings }));
        (record.unmappedSourceFields || []).forEach((field) => {
            if (field.canonicalEligibility !== false) errors.push(`${id}/unmapped: canonicalEligibility must be false`);
            if (!field.gameVersionEvidence || field.gameVersionEvidence.status !== "missing") errors.push(`${id}/unmapped: gameVersionEvidence must be missing`);
            if (field.path !== catalogRecord.path || !portableProviderPath(field.path)) errors.push(`${id}/unmapped: path must equal the provider-relative source catalog path`);
            if (!field.sourceRecord || field.sourceRecord.path !== catalogRecord.path || !portableProviderPath(field.sourceRecord.path)) errors.push(`${id}/unmapped: sourceRecord.path must equal the provider-relative source catalog path`);
        });
    });
    const fields = Object.values(records).flatMap((record) => record.fields || []);
    const unmapped = Object.values(records).flatMap((record) => record.unmappedSourceFields || []);
    const eligible = fields.filter((field) => field.status === "eligible");
    const unresolved = fields.filter((field) => field.status === "needsReview");
    const registryMapped = unmapped.filter((field) => field.mapping?.status === "registryLifecycleMapped");
    const schemaGaps = unmapped.filter((field) => field.mapping?.status === "schemaGap");
    const trulyUnmapped = unmapped.filter((field) => !field.mapping?.status);
    const duplicateKeys = new Set();
    const duplicateFieldKeys = [];
    fields.forEach((field) => {
        const key = `${field.sourceRecordId}:${field.candidateId || "unmapped"}:${field.field}`;
        if (duplicateKeys.has(key)) duplicateFieldKeys.push(key);
        duplicateKeys.add(key);
    });
    if (duplicateFieldKeys.length) errors.push(`duplicate field keys: ${duplicateFieldKeys.join(", ")}`);
    const summary = {
        status: errors.length ? "failed" : "passed",
        sourceRecords: Object.keys(records).length,
        expectedSourceRecords: catalogEntries.length,
        fieldRecords: fields.length,
        eligibleFields: eligible.length,
        eligibleButCanonicalBlocked: eligible.length,
        supportsClaimValueFields: fields.filter((field) => field.supportsClaimValue === true).length,
        candidateValueAgreements: fields.filter((field) => field.supportsClaimValue === true && field.claimComparison?.valueMatch === true).length,
        candidateValueConflicts: fields.filter((field) => field.supportsClaimValue === true && field.claimComparison?.valueMatch === false).length,
        needsReviewFields: unresolved.length,
        unresolvedFields: unresolved.length + schemaGaps.length + trulyUnmapped.length,
        ancillarySourceFields: unmapped.length,
        registryMappedSourceFields: registryMapped.length,
        schemaGapSourceFields: schemaGaps.length,
        unmappedSourceFields: trulyUnmapped.length,
        canonicalEligibleFields: fields.filter((field) => field.canonicalEligibility).length,
        canonicalEligibleCandidates: 0,
        gameVersionMissingSourceRecords: Object.values(records).filter((record) => record.gameVersion === null).length,
        gameVersionMissingFields: fields.filter((field) => field.gameVersion === null).length,
        portableSourceFiles: Object.values(records).filter((record) => portableProviderPath(record.sourceFile) && record.sourceFile === sourceCatalog.records?.[record.sourceRecordId]?.path).length,
        absoluteSourceFiles: Object.values(records).filter((record) => typeof record.sourceFile === "string" && !portableProviderPath(record.sourceFile)).length,
        fieldStatusCounts: countBy(fields.map((field) => field.status)),
        weaponIds: Object.values(records).map((record) => String(record.entity?.id || "")).sort(sortNatural),
        errors: errors.length,
        warnings: warnings.length
    };
    return {
        schemaVersion: 1,
        audit: "genshin-weapon-gcsim-evidence-audit",
        status: summary.status,
        generatedAt: "2026-08-16T00:00:00.000Z",
        input: {
            evidence: evidence?.input || null,
            sourceCatalogSha256: sha256(Buffer.from(stableJson(sourceCatalog))),
            sourceRootProvided: Boolean(sourceRoot)
        },
        summary,
        errors,
        warnings,
        methodology: {
            eligible: "Field extraction is assignment/branch-backed and structurally comparable to a candidate claim; it is still blocked from canonicalization by missing gameVersion evidence.",
            unresolved: "needsReview fields plus source fields that do not have a safe v2 claim mapping.",
            canonical: "Always false; this audit never edits existing v2 specs or runtime status.",
            sourceLocator: "sourceFile is required to equal the provider-relative source-catalog path; extraction-time checkout roots are never serialized.",
            numericTokens: "A numeric-token matcher is rejected by contract and is not a canonical verification method."
        }
    };
}

function renderMarkdown(report) {
    const s = report.summary;
    const lines = [
        "# Genshin weapon gcsim field evidence audit",
        "",
        `- Status: **${report.status}**`,
        `- Pinned source records: **${s.sourceRecords}/${s.expectedSourceRecords}**`,
        `- Field records: **${s.fieldRecords}**`,
        `- Eligible field extractions: **${s.eligibleFields}**`,
        `- Eligible-but-canonical-blocked fields: **${s.eligibleButCanonicalBlocked}**`,
        `- Fields with supportsClaimValue=true: **${s.supportsClaimValueFields}**`,
        `- Candidate value agreements/conflicts: **${s.candidateValueAgreements}/${s.candidateValueConflicts}**`,
        `- needsReview fields: **${s.needsReviewFields}**`,
        `- Unresolved (needsReview + unmapped): **${s.unresolvedFields}**`,
        `- Unmapped source fields: **${s.unmappedSourceFields}**`,
        `- Canonical eligible fields/candidates: **${s.canonicalEligibleFields}/${s.canonicalEligibleCandidates}**`,
        `- Game-version-missing source records: **${s.gameVersionMissingSourceRecords}**`,
        `- Portable provider-relative source files: **${s.portableSourceFiles}/${s.sourceRecords}**`,
        `- Absolute/root source-file leaks: **${s.absoluteSourceFiles}**`,
        "",
        "## Interpretation",
        "",
        "Eligible means that a named Go assignment and its semantic branch were extracted and structurally compared with a candidate claim. It does not promote that candidate: the pinned catalog has a repository revision and file SHA-256 but no game patch/version, so canonical eligibility remains false.",
        "",
        "The extractor does not search arbitrary numeric tokens. Ambiguous scope, activation, target, duplicate, and display-only mappings remain `needsReview`.",
        "",
        "## Errors",
        "",
        ...(report.errors.length ? report.errors.map((error) => `- ${error}`) : ["- none"]),
        "",
        "## Warnings",
        "",
        ...(report.warnings.length ? report.warnings.map((warning) => `- ${warning}`) : ["- none"]),
        ""
    ];
    return lines.join("\n");
}

function writeReports(report, { reportJsonPath = defaultReportJsonPath, reportMarkdownPath = defaultReportMarkdownPath } = {}) {
    fs.mkdirSync(path.dirname(reportJsonPath), { recursive: true });
    fs.writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(reportMarkdownPath, renderMarkdown(report));
}

function parseArgs(argv) {
    const args = { evidencePath: defaultEvidencePath, sourceCatalogPath: defaultSourceCatalogPath, reportJsonPath: defaultReportJsonPath, reportMarkdownPath: defaultReportMarkdownPath, sourceRoot: process.env.GCSIM_ROOT || "" };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--evidence") args.evidencePath = path.resolve(argv[++i]);
        else if (arg === "--source-catalog") args.sourceCatalogPath = path.resolve(argv[++i]);
        else if (arg === "--source-root") args.sourceRoot = path.resolve(argv[++i]);
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
            console.log("Usage: node scripts/genshinWeaponGcsimEvidenceAudit.cjs [--evidence <path>] [--source-root <pinned-gcsim-checkout>]");
            process.exit(0);
        }
        const report = auditEvidence({ evidence: readJson(args.evidencePath), sourceCatalog: readJson(args.sourceCatalogPath), sourceRoot: args.sourceRoot });
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
    renderMarkdown,
    writeReports
};
