"use strict";

/** Contract audit for the character field materialization artifact. */

const fs = require("node:fs");
const path = require("node:path");
const {
    buildDataset,
    defaultDataRoot,
    defaultInputFile,
    defaultOutputFile,
    stableJson
} = require("./genshinCharacterFieldMaterializationGenerate.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultReportJsonPath = path.join(repositoryRoot, "reports", "genshin-character-field-materialization.json");
const defaultReportMarkdownPath = path.join(repositoryRoot, "reports", "genshin-character-field-materialization.md");

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function uniqueSorted(values) {
    return [...new Set((values || []).map(String))].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

function countBy(values) {
    const counts = {};
    (values || []).forEach((value) => {
        const key = String(value);
        counts[key] = (counts[key] || 0) + 1;
    });
    return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function loadGenerated({ outputFile = defaultOutputFile, dataRoot = defaultDataRoot, inputFile = defaultInputFile } = {}) {
    if (fs.existsSync(outputFile)) return { ...readJson(outputFile), generatedFromDisk: true };
    return { ...buildDataset({ dataRoot, inputFile, outputFile }), generatedFromDisk: false };
}

function isAbsolutePath(value) {
    return typeof value === "string" && (path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value));
}

function auditDataset({
    dataRoot = defaultDataRoot,
    inputFile = defaultInputFile,
    outputFile = defaultOutputFile,
    roots = {
        gcsim: process.env.GENSHIN_GCSIM_ROOT || null,
        genshinOptimizer: process.env.GENSHIN_OPTIMIZER_ROOT || null
    }
} = {}) {
    const generated = loadGenerated({ outputFile, dataRoot, inputFile });
    const expected = buildDataset({ dataRoot, inputFile, outputFile, roots });
    const errors = [];
    const warnings = [];
    const malformedSources = [];
    const malformedFields = [];
    const missingReferences = [];
    const policyViolations = [];
    const gameVersionViolations = [];
    const canonicalViolations = [];
    const absolutePathViolations = [];

    if (generated.schemaVersion !== 1) errors.push("schemaVersion must be 1");
    if (generated.kind !== "genshinCharacterFieldMaterialization") errors.push("unexpected artifact kind");
    if (generated.policy?.revisionSemantics !== "sourceIndexAndSourceCatalogSeparate") errors.push("revision semantics are not separate");
    if (generated.policy?.tokenMatching !== "forbidden") policyViolations.push("policy.tokenMatching");
    if (generated.policy?.proseMatching !== "forbidden") policyViolations.push("policy.proseMatching");
    if (generated.policy?.canonicalPromotion !== "forbidden") policyViolations.push("policy.canonicalPromotion");
    if (generated.summary?.canonical !== 0) canonicalViolations.push("summary:canonical");
    const externalRootsAvailable = Boolean(roots.gcsim || roots.genshinOptimizer);
    const rebuildComparable = externalRootsAvailable || (generated.summary?.materializedSources || 0) === 0;
    if (generated.generatedFromDisk && rebuildComparable) {
        const comparable = { ...generated };
        delete comparable.generatedFromDisk;
        if (stableJson(comparable) !== stableJson(expected)) errors.push("artifact is not deterministic for current source files");
    } else if (generated.generatedFromDisk) {
        warnings.push("deterministic rebuild skipped because the checked-in artifact is materialized and external roots are not configured");
    }

    if (JSON.stringify(generated.scope?.pilotIds || []) !== JSON.stringify(expected.scope?.pilotIds || [])) errors.push("pilot scope differs from external evidence");
    if (JSON.stringify(generated.scope?.talentGapIds || []) !== JSON.stringify(expected.scope?.talentGapIds || [])) errors.push("talent-gap scope differs from external evidence");
    const expectedCharacters = uniqueSorted(expected.scope?.characterIds || []);
    if (JSON.stringify(uniqueSorted(generated.scope?.characterIds || [])) !== JSON.stringify(expectedCharacters)) errors.push("character scope differs from external evidence");

    Object.entries(generated.revisions || {}).forEach(([project, revision]) => {
        if (!revision?.sourceIndex || !revision?.sourceCatalog) malformedSources.push(`revision:${project}`);
        if (revision?.comparison === "same" && revision.sourceIndex.revision !== revision.sourceCatalog.revision) malformedSources.push(`revision:${project}:same-but-different`);
        if (project === "gcsim" && revision?.comparison !== "mismatch") warnings.push("gcsim source-index/catalog mismatch is not visible");
    });

    Object.entries(generated.materializations || {}).forEach(([id, source]) => {
        if (!source || source.id !== id || !source.project || !source.characterId || !source.locator || !source.revisions) {
            malformedSources.push(id);
            return;
        }
        if (source.locator.path && source.locator.path.includes("..")) absolutePathViolations.push(`${id}:locator`);
        if (isAbsolutePath(source.locator.path)) absolutePathViolations.push(`${id}:locator:absolute`);
        if (source.checkout?.rootConfigured && source.checkout?.root) absolutePathViolations.push(`${id}:checkout.root`);
        if (source.checkout?.pathVerified && source.checkout?.revisionMatchesSourceIndex !== true) malformedSources.push(`${id}:pathVerifiedWithoutPinnedRevision`);
        if (source.gameVersion !== null || source.gameVersionVerified !== false) gameVersionViolations.push(`${id}:gameVersion`);
        if (source.supportsClaimValue !== false || source.tokenMatchingUsed !== false || source.proseMatchingUsed !== false) policyViolations.push(`${id}:source-policy`);
        if (source.revisions.sourceIndex.revision && !/^[a-f0-9]{40}$/.test(source.revisions.sourceIndex.revision)) malformedSources.push(`${id}:sourceIndexRevision`);
        if (source.revisions.sourceCatalog.revision && !/^[a-f0-9]{40}$/.test(source.revisions.sourceCatalog.revision)) malformedSources.push(`${id}:sourceCatalogRevision`);
        (source.checkout?.files || []).forEach((file) => {
            if (!file || !file.path || isAbsolutePath(file.path) || file.path.includes("..") || !/^[a-f0-9]{64}$/.test(String(file.sha256 || ""))) {
                malformedSources.push(`${id}:file`);
            }
        });
        (source.declarations || []).forEach((declaration) => {
            if (!declaration || !declaration.name || !declaration.path || !Number.isInteger(declaration.line) || declaration.line < 1) {
                malformedSources.push(`${id}:declaration`);
            }
            if (declaration.value !== undefined) policyViolations.push(`${id}:declaration-value`);
        });
    });

    const candidatesById = Object.fromEntries(expected.scope?.characterIds ? [] : []);
    const expectedCandidateIds = new Set();
    const external = readJson(inputFile);
    Object.keys(external.candidates || {}).forEach((id) => expectedCandidateIds.add(id));
    const fieldKeys = new Set();
    (generated.fieldEvidence || []).forEach((field, index) => {
        const key = `${field?.candidateId}:${field?.sourceId}`;
        fieldKeys.add(key);
        if (!field || !expectedCandidateIds.has(field.candidateId) || !generated.materializations?.[field.sourceId]) missingReferences.push(key);
        if (!field?.entity || !field?.semantic || !field?.extraction || !field?.verification) malformedFields.push(`${index}`);
        if (field?.gameVersion !== null || field?.gameVersionVerified !== false) gameVersionViolations.push(key);
        if (field?.supportsClaimValue !== false || field?.tokenMatchingUsed !== false || field?.proseMatchingUsed !== false) policyViolations.push(`${key}:field-policy`);
        if (field?.verification?.status !== "needsReview" || field?.verification?.canonical !== 0 || field?.verification?.runtimeStatus !== "blocked") canonicalViolations.push(key);
        if (!field?.verification?.blockedReasons?.includes("gameVersionNotExplicit")) gameVersionViolations.push(`${key}:missing-version-block`);
        if (!field?.verification?.blockedReasons?.includes("namedDeclarationValueExtractionNotImplemented")) policyViolations.push(`${key}:missing-value-block`);
        if (field?.semantic?.tokenMatchingUsed !== false || field?.semantic?.proseMatchingUsed !== false) policyViolations.push(`${key}:semantic-policy`);
        if (field?.extraction?.value !== null || field?.extraction?.supportsClaimValue !== false) policyViolations.push(`${key}:extraction-value`);
        (field?.extraction?.symbols || []).forEach((symbol) => {
            if (symbol?.value !== undefined) policyViolations.push(`${key}:symbol-value`);
            if (isAbsolutePath(symbol?.path)) absolutePathViolations.push(`${key}:symbol-path`);
        });
    });
    if (generated.fieldEvidence?.length !== expectedCandidateIds.size * 2) errors.push(`fieldEvidence count ${generated.fieldEvidence?.length} != ${expectedCandidateIds.size * 2}`);
    if (generated.summary?.candidates !== expectedCandidateIds.size) errors.push("candidate count does not match external evidence");
    if (generated.summary?.externalSources !== Object.keys(generated.materializations || {}).length) errors.push("external source summary mismatch");
    if (generated.summary?.fieldEvidence !== generated.fieldEvidence?.length) errors.push("field evidence summary mismatch");
    const expectedKeys = new Set();
    Object.values(external.candidates || {}).forEach((candidate) => (candidate.externalSourceIds || []).forEach((sourceId) => expectedKeys.add(`${candidate.id}:${sourceId}`)));
    if (expectedKeys.size !== fieldKeys.size || [...expectedKeys].some((key) => !fieldKeys.has(key))) missingReferences.push("field evidence does not cover candidate/source join");

    if (malformedSources.length || malformedFields.length || missingReferences.length || policyViolations.length || gameVersionViolations.length || canonicalViolations.length || absolutePathViolations.length) {
        errors.push("field materialization contract/reference failure");
    }

    const allReasons = [
        ...Object.values(generated.materializations || {}).flatMap((source) => source.blockedReasons || []),
        ...(generated.fieldEvidence || []).flatMap((field) => field.verification?.blockedReasons || [])
    ];
    const summary = {
        schemaVersion: 1,
        status: errors.length ? "failed" : "passed",
        pilotCharacters: generated.summary?.pilotCharacters || 0,
        talentGapCharacters: generated.summary?.talentGapCharacters || 0,
        characters: generated.summary?.characters || 0,
        candidates: generated.summary?.candidates || 0,
        externalSources: generated.summary?.externalSources || 0,
        materializedSources: generated.summary?.materializedSources || 0,
        pathVerifiedSources: generated.summary?.pathVerifiedSources || 0,
        files: generated.summary?.files || 0,
        declarations: generated.summary?.declarations || 0,
        fieldEvidence: generated.summary?.fieldEvidence || 0,
        namedSymbolEvidence: generated.summary?.namedSymbolEvidence || 0,
        gameVersionVerified: generated.summary?.gameVersionVerified || 0,
        canonical: 0,
        verificationByStatus: countBy((generated.fieldEvidence || []).map((entry) => entry.verification?.status)),
        runtimeByStatus: countBy((generated.fieldEvidence || []).map((entry) => entry.verification?.runtimeStatus)),
        blockedReasonCounts: countBy(allReasons),
        contract: {
            malformedSources: malformedSources.length,
            malformedFields: malformedFields.length,
            missingReferences: missingReferences.length,
            policyViolations: policyViolations.length,
            gameVersionViolations: gameVersionViolations.length,
            canonicalViolations: canonicalViolations.length,
            absolutePathViolations: absolutePathViolations.length
        },
        generatedFromDisk: Boolean(generated.generatedFromDisk),
        deterministic: rebuildComparable ? !errors.includes("artifact is not deterministic for current source files") : null,
        reproducibilityCheck: rebuildComparable ? "performed" : "skippedExternalRootsNotConfigured"
    };
    return {
        schemaVersion: 1,
        status: summary.status,
        summary,
        errors,
        warnings,
        malformedSources,
        malformedFields,
        missingReferences,
        policyViolations,
        gameVersionViolations,
        canonicalViolations,
        absolutePathViolations,
        generatedFromDisk: Boolean(generated.generatedFromDisk)
    };
}

function markdownReport(audit) {
    const summary = audit.summary;
    return [
        "# Genshin character field materialization audit",
        "",
        `Status: **${audit.status}**`,
        "",
        "This artifact materializes only the pinned source-index paths for the 8 pilot and 25 talent-gap character priorities. Source-index and source-catalog revisions remain separate observations; a revision or checkout match is not game-version evidence.",
        "",
        "## Coverage",
        "",
        `- Characters: ${summary.characters} (pilot ${summary.pilotCharacters}, talent-gap ${summary.talentGapCharacters})`,
        `- Candidates: ${summary.candidates}`,
        `- External locators: ${summary.externalSources}`,
        `- Materialized/path-verified locators: ${summary.materializedSources}/${summary.pathVerifiedSources}`,
        `- Files/declarations: ${summary.files}/${summary.declarations}`,
        `- Field evidence: ${summary.fieldEvidence}; named-symbol observations: ${summary.namedSymbolEvidence}`,
        `- Game-version verified: ${summary.gameVersionVerified}; canonical: 0`,
        `- Verification: ${JSON.stringify(summary.verificationByStatus)}; runtime: ${JSON.stringify(summary.runtimeByStatus)}`,
        "",
        "## Safety contract",
        "",
        "Only a checkout whose git HEAD equals the source-index revision is path-verified. The source-catalog revision is retained independently and mismatches are blocked. Parsing records named declarations/structured assignment locations only; no numeric token, prose regex, or computed field value is promoted. Every field remains `needsReview`, `runtime=blocked`, `gameVersion: null`, and `canonical: 0` until explicit version evidence and independent review exist.",
        "",
        `- Contract errors: ${audit.errors.length}`,
        `- Warnings: ${audit.warnings.length}`,
        `- Blocked reasons: ${JSON.stringify(summary.blockedReasonCounts)}`,
        ""
    ].join("\n");
}

function writeReport({
    dataRoot = defaultDataRoot,
    inputFile = defaultInputFile,
    outputFile = defaultOutputFile,
    reportJsonPath = defaultReportJsonPath,
    reportMarkdownPath = defaultReportMarkdownPath
} = {}) {
    const audit = auditDataset({ dataRoot, inputFile, outputFile });
    fs.mkdirSync(path.dirname(reportJsonPath), { recursive: true });
    fs.writeFileSync(reportJsonPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
    fs.writeFileSync(reportMarkdownPath, `${markdownReport(audit)}\n`, "utf8");
    return audit;
}

if (require.main === module) {
    const dataRoot = process.env.GENSHIN_DATA_ROOT || defaultDataRoot;
    const inputFile = process.env.GENSHIN_EXTERNAL_FIELD_EVIDENCE_FILE || defaultInputFile;
    const outputFile = process.env.GENSHIN_FIELD_MATERIALIZATION_FILE || defaultOutputFile;
    const reportJsonPath = process.env.GENSHIN_FIELD_MATERIALIZATION_REPORT_JSON || defaultReportJsonPath;
    const reportMarkdownPath = process.env.GENSHIN_FIELD_MATERIALIZATION_REPORT_MD || defaultReportMarkdownPath;
    process.stdout.write(`${JSON.stringify(writeReport({ dataRoot, inputFile, outputFile, reportJsonPath, reportMarkdownPath }), null, 2)}\n`);
}

module.exports = {
    auditDataset,
    defaultDataRoot,
    defaultInputFile,
    defaultOutputFile,
    defaultReportJsonPath,
    defaultReportMarkdownPath,
    loadGenerated,
    markdownReport,
    writeReport
};
