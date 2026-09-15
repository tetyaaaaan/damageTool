"use strict";

/** Audit the raw-passive talent-gap SourceRecords and blocked EffectSpecs. */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
    CLASSIFICATION_POLICY,
    CLASSIFICATION_STATUSES,
    GENERATOR_VERSION,
    buildDataset,
    defaultDataRoot,
    defaultOutputFile,
    stableJson
} = require("./genshinCharacterV2TalentGapCandidatesGenerate.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultReportJson = path.join(repositoryRoot, "reports", "genshin-character-v2-talent-gap-candidates.json");
const defaultReportMarkdown = path.join(repositoryRoot, "reports", "genshin-character-v2-talent-gap-candidates.md");

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function digest(value) {
    return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function digestFile(file) {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function increment(map, key) {
    const value = String(key || "unknown");
    map[value] = (map[value] || 0) + 1;
}

function duplicateValues(values) {
    const counts = new Map();
    (values || []).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    return [...counts.entries()].filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
}

function loadGenerated({ dataRoot = defaultDataRoot, outputFile = defaultOutputFile } = {}) {
    if (fs.existsSync(outputFile)) return { ...readJson(outputFile), generatedFromDisk: true };
    return { ...buildDataset({ dataRoot }), generatedFromDisk: false };
}

function containsNumber(value) {
    if (typeof value === "number") return true;
    if (Array.isArray(value)) return value.some(containsNumber);
    if (!value || typeof value !== "object") return false;
    return Object.values(value).some(containsNumber);
}

function auditCoverage({ dataRoot = defaultDataRoot, outputFile = defaultOutputFile } = {}) {
    const generated = loadGenerated({ dataRoot, outputFile });
    const expected = buildDataset({ dataRoot });
    const errors = [];
    const malformedSources = [];
    const malformedSpecs = [];
    const malformedCharacters = [];
    const missingSourceRefs = [];
    const missingSpecRefs = [];
    const inputDigestMismatches = [];
    const expectedIds = Object.keys(expected.byCharacter || {}).sort();
    const actualIds = Object.keys(generated.byCharacter || {}).sort();
    const missingCharacters = expectedIds.filter((id) => !actualIds.includes(id));
    const unexpectedCharacters = actualIds.filter((id) => !expectedIds.includes(id));
    const statusCounts = Object.fromEntries(CLASSIFICATION_STATUSES.map((status) => [status, 0]));
    const verificationCounts = {};
    const runtimeCounts = {};
    const unknownEffectViolations = [];
    const numericEffectViolations = [];

    if (generated.schemaVersion !== 2) errors.push("schemaVersion must be 2");
    if (generated.kind !== "genshinCharacterV2TalentGapCandidates") errors.push("unexpected talent-gap candidate kind");
    if (generated.generator?.version !== GENERATOR_VERSION) errors.push("generator version mismatch");
    if (generated.policy?.canonical !== 0 || generated.policy?.runtimePromotion !== "forbidden") errors.push("canonical/runtime promotion policy violation");
    if (generated.policy?.classification?.schemaVersion !== CLASSIFICATION_POLICY.version
        || stableJson(generated.policy?.classification?.statuses || []) !== stableJson(CLASSIFICATION_STATUSES)
        || generated.policy?.classification?.emptyTextDisposition !== "uninvestigated") {
        errors.push("classification policy contract mismatch");
    }
    if (generated.generatedFromDisk) {
        const comparable = { ...generated };
        delete comparable.generatedFromDisk;
        if (stableJson(comparable) !== stableJson(expected)) errors.push("talent-gap candidate artifact is not deterministic for current source files");
    }

    (generated.generatedFrom || []).forEach((input) => {
        const relative = String(input.path || "").replace(/^games\/genshin\/data\//, "");
        const absolute = path.join(dataRoot, relative);
        if (!fs.existsSync(absolute)) inputDigestMismatches.push({ path: input.path, reason: "missing" });
        else if (digestFile(absolute) !== input.integrity?.digest) inputDigestMismatches.push({ path: input.path, reason: "digestMismatch" });
    });

    Object.entries(generated.sourceRecords || {}).forEach(([id, source]) => {
        if (!source || source.id !== id || source.kind !== "primaryDataset" || source.provider !== "damageTool-local"
            || source.locator?.dataset !== "character-talents.json" || !source.locator?.record || !source.locator?.field
            || source.integrity?.algorithm !== "sha256" || source.integrity.digest !== digest(source.text)
            || source.gameVersion !== null || typeof source.text !== "string") {
            malformedSources.push(id);
        }
    });

    Object.entries(generated.specs || {}).forEach(([id, spec]) => {
        increment(verificationCounts, spec?.verification?.status);
        increment(runtimeCounts, spec?.runtime?.status);
        if (!spec || spec.id !== id || spec.entity?.kind !== "talent" || !spec.entity?.id
            || !String(spec.entity.component || "").startsWith("passive:") || !Array.isArray(spec.sourceRefs)
            || spec.sourceRefs.length !== 1 || !spec.interpretation || spec.interpretation.method !== "deterministicParser"
            || spec.verification?.status !== "needsReview" || spec.verification.reviewedBy !== null
            || spec.verification.reviewedAt !== null || spec.verification.sourceAgreement !== "unknown"
            || !Array.isArray(spec.verification.unverifiedBoundaries)
            || spec.verification.unverifiedBoundaries.length === 0
            || !spec.verification.claims || !Array.isArray(spec.verification.discrepancies)
            || spec.runtime?.status !== "blocked" || !Array.isArray(spec.runtime.modifierIds)
            || spec.runtime.modifierIds.length !== 0 || spec.runtime.generator !== null
            || !Array.isArray(spec.runtime.blockedReasons) || !spec.effect) {
            malformedSpecs.push(id);
            return;
        }
        spec.sourceRefs.forEach((sourceRef) => {
            if (!generated.sourceRecords?.[sourceRef]) missingSourceRefs.push({ specId: id, sourceRef });
        });
        const effect = spec.effect;
        const expectedUnknownFields = [
            "kind", "targets", "activation", "value", "durationSeconds",
            "intervalSeconds", "cooldownSeconds", "hitCount", "charges",
            "maxInstances", "stack", "elementApplication", "energy",
            "snapshot", "offField", "area"
        ];
        if (effect.kind !== "unknown" || JSON.stringify(effect.targets) !== JSON.stringify(["unknown"])
            || effect.activation?.status !== "unknown" || effect.value?.status !== "unknown"
            || effect.snapshot !== "unknown" || effect.offField !== "unknown" || effect.area !== "unknown"
            || !expectedUnknownFields.every((field) => effect.unknownFields?.includes(field))) {
            unknownEffectViolations.push(id);
        }
        if (containsNumber(effect)) numericEffectViolations.push(id);
        Object.entries(spec.verification.claims).forEach(([claimName, claim]) => {
            if (claim.status !== "needsReview" || !Array.isArray(claim.sourceRefs) || claim.sourceRefs.length !== 1) {
                malformedSpecs.push(`${id}:claim:${claimName}`);
            }
        });
    });

    Object.entries(generated.byCharacter || {}).forEach(([id, character]) => {
        increment(statusCounts, character?.status);
        if (!character || character.characterId !== id || !CLASSIFICATION_STATUSES.includes(character.status)
            || character.canonical !== 0 || !Array.isArray(character.sourceRecordIds)
            || !Array.isArray(character.specIds) || !Array.isArray(character.sourcePointers)
            || character.sourceRecordIds.length !== character.specIds.length
            || character.sourcePointers.length !== character.sourceRecordIds.length
            || !character.evidence || !Array.isArray(character.reasons)
            || !character.classification || character.classification.status !== character.status
            || character.classification.schemaVersion !== CLASSIFICATION_POLICY.version
            || typeof character.classification.rationaleCode !== "string"
            || typeof character.classification.criteria !== "string"
            || !Array.isArray(character.classification.sourcePointers)
            || !Array.isArray(character.classification.unverifiedBoundaries)
            || character.classification.unverifiedBoundaries.length === 0
            || !Array.isArray(character.unverifiedBoundaries)
            || character.unverifiedBoundaries.length === 0) {
            malformedCharacters.push(id);
            return;
        }
        const classificationEvidence = character.classification.evidence || {};
        const rawTextCount = Number(classificationEvidence.rawTextFieldCount || 0);
        const explicitNoEffectCount = Number(classificationEvidence.explicitNoEffectFieldCount || 0);
        if (character.status === "noEffect" && (rawTextCount === 0 || explicitNoEffectCount !== rawTextCount)) malformedCharacters.push(`${id}:noEffectEvidence`);
        if (character.status === "unstructured" && rawTextCount === 0) malformedCharacters.push(`${id}:unstructuredEvidence`);
        if (character.status === "uninvestigated" && (rawTextCount !== 0 || explicitNoEffectCount !== 0)) malformedCharacters.push(`${id}:uninvestigatedEvidence`);
        if (JSON.stringify(character.classification.unverifiedBoundaries) !== JSON.stringify(character.unverifiedBoundaries)) malformedCharacters.push(`${id}:boundaryMismatch`);
        character.sourceRecordIds.forEach((sourceId) => {
            if (!generated.sourceRecords?.[sourceId]) missingSourceRefs.push({ characterId: id, sourceId });
        });
        character.specIds.forEach((specId) => {
            if (!generated.specs?.[specId] || generated.specs[specId].entity?.id !== id) missingSpecRefs.push({ characterId: id, specId });
        });
        character.sourcePointers.forEach((pointer) => {
            if (!pointer?.sourceId || !generated.sourceRecords?.[pointer.sourceId] || !pointer.path) missingSourceRefs.push({ characterId: id, pointer });
        });
        character.classification.sourcePointers.forEach((pointer) => {
            if (!pointer?.dataset || pointer.dataset !== "character-talents.json" || pointer.record !== id || !pointer.path
                || typeof pointer.present !== "boolean") {
                missingSourceRefs.push({ characterId: id, classificationPointer: pointer });
            }
            if (pointer?.sourceId && !generated.sourceRecords?.[pointer.sourceId]) {
                missingSourceRefs.push({ characterId: id, sourceId: pointer.sourceId });
            }
        });
    });

    const expectedSourceCount = Object.keys(expected.sourceRecords || {}).length;
    const expectedSpecCount = Object.keys(expected.specs || {}).length;
    if (Object.keys(generated.sourceRecords || {}).length !== expectedSourceCount) errors.push("source record count mismatch");
    if (Object.keys(generated.specs || {}).length !== expectedSpecCount) errors.push("effect spec count mismatch");
    if (expectedIds.length !== 24) errors.push(`expected exactly 24 talent-gap characters, got ${expectedIds.length}`);
    if (missingCharacters.length || unexpectedCharacters.length || malformedSources.length || malformedSpecs.length
        || malformedCharacters.length || missingSourceRefs.length || missingSpecRefs.length || inputDigestMismatches.length
        || unknownEffectViolations.length || numericEffectViolations.length) {
        errors.push("talent-gap candidate coverage/contract failure");
    }
    if (generated.summary?.canonical !== 0 || generated.summary?.effectSpecCandidates !== expectedSpecCount
        || stableJson(generated.summary?.byCharacterStatus || {}) !== stableJson(statusCounts)) errors.push("summary contract mismatch");

    const summary = {
        schemaVersion: 2,
        status: errors.length ? "failed" : "passed",
        characters: expectedIds.length,
        passiveSourceRecords: expectedSourceCount,
        effectSpecCandidates: expectedSpecCount,
        canonical: 0,
        byCharacterStatus: statusCounts,
        byVerificationStatus: verificationCounts,
        byRuntimeStatus: runtimeCounts,
        contract: {
            missingCharacters: missingCharacters.length,
            unexpectedCharacters: unexpectedCharacters.length,
            malformedSources: malformedSources.length,
            malformedSpecs: malformedSpecs.length,
            malformedCharacters: malformedCharacters.length,
            missingSourceRefs: missingSourceRefs.length,
            missingSpecRefs: missingSpecRefs.length,
            inputDigestMismatches: inputDigestMismatches.length,
            unknownEffectViolations: unknownEffectViolations.length,
            numericEffectViolations: numericEffectViolations.length
        },
        generatedFromDisk: Boolean(generated.generatedFromDisk),
        deterministic: !errors.includes("talent-gap candidate artifact is not deterministic for current source files")
    };
    const characterCoverage = Object.entries(generated.byCharacter || {}).sort(([left], [right]) => left.localeCompare(right)).map(([characterId, character]) => ({
        characterId,
        characterName: character?.characterName || null,
        status: character?.status || "unknown",
        classification: character?.classification?.rationaleCode || null,
        rawTextFieldCount: character?.classification?.evidence?.rawTextFieldCount || 0,
        sourcePointers: Array.isArray(character?.classification?.sourcePointers) ? character.classification.sourcePointers : [],
        unverifiedBoundaries: Array.isArray(character?.unverifiedBoundaries) ? character.unverifiedBoundaries : [],
        sourceRecords: Array.isArray(character?.sourceRecordIds) ? character.sourceRecordIds.length : 0,
        specs: Array.isArray(character?.specIds) ? character.specIds.length : 0,
        canonical: character?.canonical ?? null
    }));
    return {
        schemaVersion: 2,
        status: summary.status,
        summary,
        errors,
        missingCharacters,
        unexpectedCharacters,
        malformedSources,
        malformedSpecs,
        malformedCharacters,
        missingSourceRefs,
        missingSpecRefs,
        inputDigestMismatches,
        unknownEffectViolations,
        numericEffectViolations,
        characterCoverage,
        generatedFromDisk: Boolean(generated.generatedFromDisk)
    };
}

function markdownReport(report) {
    const summary = report.summary || {};
    const lines = [
        "# Genshin talent-gap EffectSpec candidates",
        "",
        `- Status: **${summary.status}**`,
        `- Characters without legacy talent modifiers: ${summary.characters}`,
        `- Raw passive SourceRecords: ${summary.passiveSourceRecords}`,
        `- EffectSpec candidates: ${summary.effectSpecCandidates}`,
        `- Canonical Runtime modifiers: ${summary.canonical}`,
        `- Classification: ${JSON.stringify(summary.byCharacterStatus || {})}`,
        `- Verification: ${JSON.stringify(summary.byVerificationStatus || {})}`,
        `- Runtime: ${JSON.stringify(summary.byRuntimeStatus || {})}`,
        "",
        "Triage rule: noEffect requires explicit no-effect wording in non-empty raw text; empty/missing text is uninvestigated, never noEffect. All candidates retain raw passive prose only. Numeric values, targets, activation, timing, element, and runtime modifier IDs are explicitly unknown/blocked until independent review.",
        "",
        "## Classification triage",
        "",
        "| Classification | Count |",
        "| --- | ---: |",
        ...CLASSIFICATION_STATUSES.map((status) => `| ${status} | ${(summary.byCharacterStatus || {})[status] || 0} |`),
        "",
        "## Character coverage",
        "",
        "| Character ID | Name | Status | SourceRecords | Specs | Canonical |",
        "| --- | --- | --- | ---: | ---: | ---: |",
        ...(report.characterCoverage || []).map((character) => `| ${character.characterId} | ${character.characterName || ""} | ${character.status} | ${character.sourceRecords} | ${character.specs} | ${character.canonical} |`),
        "",
        "## Contract",
        "",
        `- Deterministic: ${summary.deterministic}`,
        `- Errors: ${(report.errors || []).length}`
    ];
    if (report.errors?.length) lines.push("", "### Errors", "", ...report.errors.map((error) => `- ${error}`));
    return `${lines.join("\n")}\n`;
}

function writeReports({ report, reportJson = defaultReportJson, reportMarkdown = defaultReportMarkdown } = {}) {
    fs.mkdirSync(path.dirname(reportJson), { recursive: true });
    fs.mkdirSync(path.dirname(reportMarkdown), { recursive: true });
    fs.writeFileSync(reportJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    fs.writeFileSync(reportMarkdown, markdownReport(report), "utf8");
    return report;
}

if (require.main === module) {
    const dataRoot = process.env.GENSHIN_DATA_ROOT || defaultDataRoot;
    const outputFile = process.env.GENSHIN_CHARACTER_V2_TALENT_GAP_CANDIDATES_FILE || defaultOutputFile;
    const report = auditCoverage({ dataRoot, outputFile });
    const reportJson = process.env.GENSHIN_CHARACTER_V2_TALENT_GAP_REPORT_JSON || defaultReportJson;
    const reportMarkdown = process.env.GENSHIN_CHARACTER_V2_TALENT_GAP_REPORT_MD || defaultReportMarkdown;
    writeReports({ report, reportJson, reportMarkdown });
    process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
    if (report.errors.length) process.exitCode = 1;
}

module.exports = {
    auditCoverage,
    auditGenshinCharacterV2TalentGapCandidates: auditCoverage,
    defaultReportJson,
    defaultReportMarkdown,
    digest,
    duplicateValues,
    loadGenerated,
    markdownReport,
    writeReports
};
