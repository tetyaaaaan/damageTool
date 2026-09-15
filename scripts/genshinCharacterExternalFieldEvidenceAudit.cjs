"use strict";

/** Audit for the evidence-only character external-source join. */

const fs = require("node:fs");
const path = require("node:path");
const {
    DEFAULT_PILOT_IDS,
    buildDataset,
    defaultDataRoot,
    defaultOutputFile,
    stableJson
} = require("./genshinCharacterExternalFieldEvidenceGenerate.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultReportJsonPath = path.join(repositoryRoot, "reports", "genshin-character-external-field-evidence.json");
const defaultReportMarkdownPath = path.join(repositoryRoot, "reports", "genshin-character-external-field-evidence.md");

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function countBy(values) {
    const result = {};
    (values || []).forEach((value) => {
        const key = String(value);
        result[key] = (result[key] || 0) + 1;
    });
    return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function sortNatural(left, right) {
    return String(left).localeCompare(String(right), "en", { numeric: true });
}

function loadGenerated({ dataRoot = defaultDataRoot, outputFile = defaultOutputFile } = {}) {
    if (fs.existsSync(outputFile)) return { ...readJson(outputFile), generatedFromDisk: true };
    return { ...buildDataset({ dataRoot }), generatedFromDisk: false };
}

function uniqueSorted(values) {
    return [...new Set((values || []).map(String))].sort(sortNatural);
}

function auditDataset({
    dataRoot = defaultDataRoot,
    outputFile = defaultOutputFile
} = {}) {
    const generated = loadGenerated({ dataRoot, outputFile });
    const expected = buildDataset({ dataRoot });
    const errors = [];
    const warnings = [];
    const malformedSources = [];
    const malformedCandidates = [];
    const malformedEvidence = [];
    const missingSourceRefs = [];
    const gameVersionViolations = [];
    const canonicalViolations = [];
    const tokenMatchingViolations = [];
    const sourceByProject = {};

    if (generated.schemaVersion !== 1) errors.push("schemaVersion must be 1");
    if (generated.kind !== "genshinCharacterExternalFieldEvidence") errors.push("unexpected artifact kind");
    if (generated.policy?.tokenMatching !== "forbidden") errors.push("token matching policy is not forbidden");
    if (generated.policy?.canonicalPromotion !== "forbidden") errors.push("canonical promotion policy is not forbidden");
    if (JSON.stringify(generated.pilotIds || []) !== JSON.stringify(expected.pilotIds || DEFAULT_PILOT_IDS)) {
        errors.push("pilotIds do not match the pilot artifact");
    }
    if (JSON.stringify(generated.talentGapIds || []) !== JSON.stringify(expected.talentGapIds || [])) {
        errors.push("talentGapIds do not match the talent-gap artifact");
    }

    if (generated.generatedFromDisk) {
        const comparable = { ...generated };
        delete comparable.generatedFromDisk;
        if (stableJson(comparable) !== stableJson(expected)) errors.push("artifact is not deterministic for current source files");
    }

    const expectedCharacters = uniqueSorted([...(expected.pilotIds || []), ...(expected.talentGapIds || [])]);
    const actualCharacters = uniqueSorted(Object.keys(generated.byCharacter || {}));
    if (JSON.stringify(expectedCharacters) !== JSON.stringify(actualCharacters)) {
        errors.push("byCharacter keys do not cover exactly the pilot/talent-gap union");
    }

    Object.entries(generated.externalSources || {}).forEach(([id, source]) => {
        if (!source || source.id !== id || !source.project || !source.characterId || !source.locator) {
            malformedSources.push(id);
            return;
        }
        if (!source.revision || !/^[a-f0-9]{40}$/.test(source.revision)) {
            malformedSources.push(`${id}:revision`);
        }
        if (source.gameVersion !== null) gameVersionViolations.push(`${id}:sourceGameVersion`);
        if (source.supportsClaimValue !== false) malformedSources.push(`${id}:supportsClaimValue`);
        if (source.tokenMatchingUsed !== false) tokenMatchingViolations.push(`${id}:source`);
        if (!Array.isArray(source.blockedReasons) || !source.blockedReasons.includes("gameVersionNotExplicit")) {
            gameVersionViolations.push(`${id}:blockedReason`);
        }
        if (!sourceByProject[source.project]) sourceByProject[source.project] = [];
        sourceByProject[source.project].push(id);
    });

    Object.entries(generated.candidates || {}).forEach(([id, candidate]) => {
        if (!candidate || candidate.id !== id || !candidate.characterId || !candidate.entity || !Array.isArray(candidate.externalSourceIds)) {
            malformedCandidates.push(id);
            return;
        }
        if (candidate.verification?.status !== "needsReview") canonicalViolations.push(`${id}:verification`);
        if (candidate.verification?.canonical !== 0) canonicalViolations.push(`${id}:canonical`);
        if (candidate.verification?.runtimeStatus !== "blocked") canonicalViolations.push(`${id}:runtime`);
        if (candidate.verification?.gameVersion !== null) gameVersionViolations.push(`${id}:candidateGameVersion`);
        if (!candidate.verification?.blockedReasons?.includes("gameVersionNotExplicit")) {
            gameVersionViolations.push(`${id}:candidateBlockedReason`);
        }
        candidate.externalSourceIds.forEach((sourceId) => {
            if (!generated.externalSources?.[sourceId]) missingSourceRefs.push({ candidateId: id, sourceId });
        });
        (candidate.evidence || []).forEach((evidence, index) => {
            const evidenceId = `${id}:${index}`;
            if (!evidence || !generated.externalSources?.[evidence.externalSourceId]
                || !Array.isArray(evidence.localSourceRefs)
                || evidence.semantic?.tokenMatchingUsed !== false
                || evidence.semantic?.supportsClaimValue !== false
                || evidence.supportsClaimValue !== false
                || evidence.gameVersion !== null
                || evidence.verification?.status !== "needsReview"
                || evidence.verification?.canonical !== 0
                || evidence.verification?.runtimeStatus !== "blocked"
                || !evidence.verification?.blockedReasons?.includes("gameVersionNotExplicit")) {
                malformedEvidence.push(evidenceId);
            }
            if (evidence?.semantic?.tokenMatchingUsed !== false) tokenMatchingViolations.push(`${evidenceId}:semantic`);
            if (evidence?.gameVersion !== null) gameVersionViolations.push(`${evidenceId}:gameVersion`);
        });
    });

    const candidateValues = Object.values(generated.candidates || {});
    const pilotCandidates = candidateValues.filter((candidate) => candidate.candidateType === "pilotBehaviorSpec");
    const talentGapCandidates = candidateValues.filter((candidate) => candidate.candidateType === "talentGapSpec");
    if (pilotCandidates.length !== 56) errors.push(`pilot behavior candidate count ${pilotCandidates.length} != 56`);
    if (talentGapCandidates.length !== 73) errors.push(`talent-gap candidate count ${talentGapCandidates.length} != 73`);
    if (candidateValues.length !== 129) errors.push(`candidate count ${candidateValues.length} != 129`);
    if (Object.keys(generated.externalSources || {}).length !== 78) {
        errors.push(`external source count ${Object.keys(generated.externalSources || {}).length} != 78`);
    }
    if (generated.summary?.canonical !== 0) errors.push("summary canonical must remain 0");
    if (generated.summary?.gameVersion !== null) errors.push("summary gameVersion must be null");

    // The current source catalog intentionally has no character records.  A
    // gcsim revision mismatch is a review warning, not a generation failure:
    // the artifact must still show the blocked state for a future reviewer.
    if (generated.summary?.sourceCatalogCharacterRecords !== 0) warnings.push("source catalog contains character records; inspect before promotion");
    if (!(generated.summary?.revisionMismatchProjects || []).includes("gcsim")) warnings.push("gcsim source-catalog/index revision mismatch was not recorded");

    if (malformedSources.length || malformedCandidates.length || malformedEvidence.length || missingSourceRefs.length) {
        errors.push("external evidence contract/reference failure");
    }
    if (canonicalViolations.length) errors.push("candidate canonical/status promotion detected");
    if (gameVersionViolations.length) errors.push("gameVersion null/blocked-reason contract failure");
    if (tokenMatchingViolations.length) errors.push("token matching evidence detected");

    const summary = {
        schemaVersion: 1,
        status: errors.length ? "failed" : "passed",
        pilotCharacters: (generated.pilotIds || []).length,
        talentGapCharacters: (generated.talentGapIds || []).length,
        pilotBehaviorSpecs: pilotCandidates.length,
        talentGapSpecs: talentGapCandidates.length,
        candidates: candidateValues.length,
        externalSources: Object.keys(generated.externalSources || {}).length,
        evidenceMappings: candidateValues.reduce((sum, candidate) => sum + (candidate.evidence || []).length, 0),
        verificationByStatus: countBy(candidateValues.map((candidate) => candidate.verification?.status)),
        runtimeByStatus: countBy(candidateValues.map((candidate) => candidate.verification?.runtimeStatus)),
        sourceProjects: Object.fromEntries(Object.entries(sourceByProject).map(([project, ids]) => [project, ids.length])),
        contract: {
            malformedSources: malformedSources.length,
            malformedCandidates: malformedCandidates.length,
            malformedEvidence: malformedEvidence.length,
            missingSourceRefs: missingSourceRefs.length,
            canonicalViolations: canonicalViolations.length,
            gameVersionViolations: gameVersionViolations.length,
            tokenMatchingViolations: tokenMatchingViolations.length
        },
        generatedFromDisk: Boolean(generated.generatedFromDisk),
        deterministic: !errors.includes("artifact is not deterministic for current source files")
    };
    return {
        schemaVersion: 1,
        status: summary.status,
        summary,
        errors,
        warnings,
        malformedSources,
        malformedCandidates,
        malformedEvidence,
        missingSourceRefs,
        canonicalViolations,
        gameVersionViolations,
        tokenMatchingViolations,
        generatedFromDisk: Boolean(generated.generatedFromDisk)
    };
}

function markdownReport(audit) {
    const s = audit.summary;
    const lines = [
        "# Genshin character external field evidence audit",
        "",
        `Status: **${audit.status}**`,
        "",
        "This report joins the 8 pilot BehaviorSpec characters and 25 talent-gap characters to pinned gcsim/Genshin Optimizer locators. It is evidence-only: no source-code values are extracted, no numeric tokens are matched, and no existing candidate is promoted.",
        "",
        "## Coverage",
        "",
        `- Pilot characters/specs: ${s.pilotCharacters}/${s.pilotBehaviorSpecs}`,
        `- Talent-gap characters/specs: ${s.talentGapCharacters}/${s.talentGapSpecs}`,
        `- Evidence mappings: ${s.evidenceMappings}`,
        `- External source locators: ${s.externalSources}`,
        `- Verification: ${JSON.stringify(s.verificationByStatus)}`,
        `- Runtime: ${JSON.stringify(s.runtimeByStatus)}`,
        `- Canonical candidates: 0`,
        "",
        "## Blocking policy",
        "",
        "Every source and candidate has `gameVersion: null` plus `gameVersionNotExplicit`; mappings remain `needsReview` and `runtime=blocked` even when a local checkout is supplied. The gcsim revision mismatch between `constellation-source-index.json` and `source-catalog.json` is retained as a warning/blocking reason.",
        "",
        "## Audit details",
        "",
        `- Contract errors: ${audit.errors.length}`,
        `- Warnings: ${audit.warnings.length}`,
        `- Malformed source records: ${s.contract?.malformedSources ?? s.summary.contract?.malformedSources ?? 0}`,
        `- Token matching violations: ${s.contract?.tokenMatchingViolations ?? s.summary.contract?.tokenMatchingViolations ?? 0}`,
        "",
        "A future extractor must resolve an exact external file/symbol, record its digest and explicit game version, compare field values semantically, and obtain independent review before any candidate can leave this blocked state.",
        ""
    ];
    return lines.join("\n");
}

function writeReport({
    dataRoot = defaultDataRoot,
    outputFile = defaultOutputFile,
    reportJsonPath = defaultReportJsonPath,
    reportMarkdownPath = defaultReportMarkdownPath
} = {}) {
    const audit = auditDataset({ dataRoot, outputFile });
    fs.mkdirSync(path.dirname(reportJsonPath), { recursive: true });
    fs.writeFileSync(reportJsonPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
    fs.writeFileSync(reportMarkdownPath, `${markdownReport(audit)}\n`, "utf8");
    return audit;
}

if (require.main === module) {
    const dataRoot = process.env.GENSHIN_DATA_ROOT || defaultDataRoot;
    const outputFile = process.env.GENSHIN_EXTERNAL_FIELD_EVIDENCE_FILE || defaultOutputFile;
    const reportJsonPath = process.env.GENSHIN_EXTERNAL_FIELD_EVIDENCE_REPORT_JSON || defaultReportJsonPath;
    const reportMarkdownPath = process.env.GENSHIN_EXTERNAL_FIELD_EVIDENCE_REPORT_MD || defaultReportMarkdownPath;
    const audit = writeReport({ dataRoot, outputFile, reportJsonPath, reportMarkdownPath });
    process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
}

module.exports = {
    auditDataset,
    defaultDataRoot,
    defaultOutputFile,
    defaultReportJsonPath,
    defaultReportMarkdownPath,
    loadGenerated,
    markdownReport,
    writeReport
};
