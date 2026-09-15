"use strict";

/** Audit and report the deterministic Genshin character v2 coverage index. */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
    CLASSIFICATION_POLICY,
    CLASSIFICATION_STATUSES,
    COMPONENTS,
    GENERATOR_VERSION,
    buildDataset,
    defaultDataRoot,
    defaultOutputFile,
    stableJson
} = require("./genshinCharacterV2CoverageGenerate.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultReportJson = path.join(repositoryRoot, "reports", "genshin-character-v2-coverage.json");
const defaultReportMarkdown = path.join(repositoryRoot, "reports", "genshin-character-v2-coverage.md");

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function increment(map, key) {
    const value = String(key || "unknown");
    map[value] = (map[value] || 0) + 1;
}

function digestFile(file) {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function duplicateValues(values) {
    const counts = new Map();
    (values || []).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    return [...counts.entries()]
        .filter(([, count]) => count > 1)
        .map(([value, count]) => ({ value, count }));
}

function loadGenerated({ dataRoot = defaultDataRoot, outputFile = defaultOutputFile } = {}) {
    if (fs.existsSync(outputFile)) return { ...readJson(outputFile), generatedFromDisk: true };
    return { ...buildDataset({ dataRoot }), generatedFromDisk: false };
}

function auditCoverage({ dataRoot = defaultDataRoot, outputFile = defaultOutputFile } = {}) {
    const generated = loadGenerated({ dataRoot, outputFile });
    const expected = buildDataset({ dataRoot });
    const errors = [];
    const malformedCharacters = [];
    const malformedSources = [];
    const malformedSourceRecords = [];
    const missingSourcePointers = [];
    const inputDigestMismatches = [];
    const duplicateCharacterIds = duplicateValues(Object.keys(generated.characters || {}));
    const expectedIds = Object.keys(expected.characters || {}).sort();
    const actualIds = Object.keys(generated.characters || {}).sort();
    const missingCharacters = expectedIds.filter((id) => !actualIds.includes(id));
    const unexpectedCharacters = actualIds.filter((id) => !expectedIds.includes(id));
    const statusCounts = {};
    const coverageStatusCounts = {};
    const componentCounts = {};
    const classificationCounts = Object.fromEntries(CLASSIFICATION_STATUSES.map((status) => [status, 0]));

    if (generated.schemaVersion !== 2) errors.push("schemaVersion must be 2");
    if (generated.kind !== "genshinCharacterV2Coverage") errors.push("unexpected coverage kind");
    if (generated.generator?.version !== GENERATOR_VERSION) errors.push("generator version mismatch");
    if (generated.policy?.canonical !== 0) errors.push("coverage canonical must remain 0");
    if (generated.policy?.classification?.schemaVersion !== CLASSIFICATION_POLICY.version
        || stableJson(generated.policy?.classification?.statuses || []) !== stableJson(CLASSIFICATION_STATUSES)
        || generated.policy?.classification?.emptyTextDisposition !== "uninvestigated") {
        errors.push("classification policy contract mismatch");
    }
    if (generated.generatedFromDisk) {
        const comparable = { ...generated };
        delete comparable.generatedFromDisk;
        if (stableJson(comparable) !== stableJson(expected)) errors.push("coverage artifact is not deterministic for current source files");
    }

    (generated.generatedFrom || []).forEach((input) => {
        const relative = String(input.path || "").replace(/^games\/genshin\/data\//, "");
        const absolute = path.join(dataRoot, relative);
        if (!fs.existsSync(absolute)) {
            inputDigestMismatches.push({ path: input.path, reason: "missing" });
        } else if (digestFile(absolute) !== input.integrity?.digest) {
            inputDigestMismatches.push({ path: input.path, reason: "digestMismatch" });
        }
    });

    Object.entries(generated.sourceRecords || {}).forEach(([id, source]) => {
        if (!source || source.id !== id || source.kind !== "rawDataset" || !source.locator?.dataset
            || source.integrity?.algorithm !== "sha256" || !source.integrity?.digest) {
            malformedSourceRecords.push(id);
            return;
        }
        const input = (generated.generatedFrom || []).find((candidate) => String(candidate.path).endsWith(String(source.locator.dataset)));
        if (!input || input.integrity.digest !== source.integrity.digest) malformedSourceRecords.push(id);
    });
    if (Object.keys(generated.sourceRecords || {}).length !== (generated.generatedFrom || []).length) {
        malformedSourceRecords.push("count");
    }

    Object.entries(generated.characters || {}).forEach(([id, character]) => {
        increment(statusCounts, character?.status);
        increment(coverageStatusCounts, character?.coverageStatus);
        if (!character || character.id !== id || !character.nameJa || typeof character.canonical !== "number"
            || character.canonical !== 0 || !Array.isArray(character.reasons) || !Array.isArray(character.sourcePointers)
            || !character.components || !character.status || !character.coverageStatus) {
            malformedCharacters.push(id);
            return;
        }
        const sourceIds = new Set((character.sourcePointers || []).map((pointer) => pointer?.sourceId));
        COMPONENTS.forEach(([component]) => {
            const value = character.components[component];
            if (!value || typeof value.present !== "boolean" || !value.status) malformedCharacters.push(`${id}:${component}`);
            increment(componentCounts, `${component}:${value?.status || "missing"}`);
            if (!value?.present && value?.status === "noEffect") {
                errors.push(`${id}:${component} noEffect is not allowed for an absent record without explicit evidence`);
            }
        });
        if (character.status === "covered" && !character.components.talentModifiers?.present) {
            errors.push(`${id}:covered character has no talent modifier record`);
        }
        if (character.status !== "covered") {
            increment(classificationCounts, character.status);
            const classification = character.components.talentModifiers?.classification;
            if (!classification || classification.status !== character.status || !Array.isArray(classification.reasons)
                || !CLASSIFICATION_STATUSES.includes(classification.status)
                || classification.schemaVersion !== CLASSIFICATION_POLICY.version
                || typeof classification.rationaleCode !== "string"
                || typeof classification.criteria !== "string"
                || !Array.isArray(classification.sourcePointers)
                || !classification.evidence || !Array.isArray(classification.evidence.rawTextFields)
                || !Array.isArray(classification.unverifiedBoundaries)
                || classification.unverifiedBoundaries.length === 0) {
                malformedCharacters.push(`${id}:classification`);
            }
            const evidence = classification?.evidence || {};
            const rawCount = Number(evidence.rawTextFieldCount || 0);
            const explicitCount = Number(evidence.explicitNoEffectFieldCount || 0);
            if (classification?.status === "noEffect" && (rawCount === 0 || explicitCount !== rawCount)) {
                errors.push(`${id}:noEffect requires explicit evidence for every non-empty raw field`);
            }
            if (classification?.status === "unstructured" && rawCount === 0) {
                errors.push(`${id}:unstructured requires non-empty raw text evidence`);
            }
            if (classification?.status === "uninvestigated" && rawCount !== 0) {
                errors.push(`${id}:uninvestigated cannot include non-empty raw text evidence`);
            }
            if (classification?.status === "uninvestigated" && explicitCount !== 0) {
                errors.push(`${id}:uninvestigated cannot include explicit no-effect fields`);
            }
            if (classification?.evidence && explicitCount !== (classification.evidence.explicitNoEffectFields || []).length) {
                errors.push(`${id}:explicit no-effect evidence count mismatch`);
            }
        }
        if (sourceIds.size !== character.sourcePointers.length || character.sourcePointers.length !== COMPONENTS.length + 1) {
            malformedSources.push(id);
        }
        character.sourcePointers.forEach((pointer) => {
            if (!pointer?.sourceId || !pointer.dataset || !pointer.record || !pointer.path || typeof pointer.present !== "boolean") {
                malformedSources.push(`${id}:pointer`);
            }
            if (pointer?.record !== id) malformedSources.push(`${id}:pointerRecord`);
            if (!expected.generatedFrom.some((input) => String(input.path).endsWith(String(pointer?.dataset || "")))) {
                missingSourcePointers.push({ id, sourceId: pointer?.sourceId });
            }
        });
        if (character.status !== "covered") {
            const classificationPointers = character.components.talentModifiers?.classification?.sourcePointers || [];
            classificationPointers.forEach((pointer) => {
                if (!pointer || !pointer.dataset || !pointer.record || !pointer.path
                    || pointer.record !== id || typeof pointer.present !== "boolean") {
                    malformedSources.push(`${id}:classificationPointer`);
                }
                if (!expected.generatedFrom.some((input) => String(input.path).endsWith(String(pointer?.dataset || "")))) {
                    missingSourcePointers.push({ id, sourceId: pointer?.sourceId || null });
                }
            });
        }
    });

    const expectedMissingIds = expected.summary.missingTalentModifierIds || [];
    const actualMissing = Object.entries(generated.characters || {})
        .filter(([, character]) => !character?.components?.talentModifiers?.present)
        .map(([id]) => id)
        .sort();
    if (stableJson(actualMissing) !== stableJson([...expectedMissingIds].sort())) errors.push("missing talent modifier set mismatch");
    if (expectedMissingIds.length !== 24) errors.push(`expected exactly 24 missing talent modifier records, got ${expectedMissingIds.length}`);
    if (stableJson(generated.summary?.byClassificationStatus || {}) !== stableJson(expected.summary?.byClassificationStatus || {})) {
        errors.push("classification status summary mismatch");
    }
    if (generated.summary?.canonical !== 0) errors.push("summary canonical must remain 0");
    if (missingCharacters.length || unexpectedCharacters.length || malformedCharacters.length || malformedSources.length || malformedSourceRecords.length || missingSourcePointers.length || inputDigestMismatches.length) {
        errors.push("character v2 coverage contract failure");
    }

    const summary = {
        schemaVersion: 2,
        status: errors.length ? "failed" : "passed",
        characters: expectedIds.length,
        canonical: 0,
        componentCounts,
        byStatus: statusCounts,
        byClassificationStatus: generated.summary?.byClassificationStatus || {},
        byCoverageStatus: coverageStatusCounts,
        classificationCounts,
        missingTalentModifiers: actualMissing.length,
        missingTalentModifierIds: actualMissing,
        contract: {
            missingCharacters: missingCharacters.length,
            unexpectedCharacters: unexpectedCharacters.length,
            malformedCharacters: malformedCharacters.length,
            malformedSources: malformedSources.length,
            malformedSourceRecords: malformedSourceRecords.length,
            missingSourcePointers: missingSourcePointers.length,
            inputDigestMismatches: inputDigestMismatches.length,
            duplicateCharacterIds: duplicateCharacterIds.length
        },
        generatedFromDisk: Boolean(generated.generatedFromDisk),
        deterministic: !errors.includes("coverage artifact is not deterministic for current source files")
    };
    return {
        schemaVersion: 2,
        status: summary.status,
        summary,
        errors,
        missingCharacters,
        unexpectedCharacters,
        malformedCharacters,
        malformedSources,
        malformedSourceRecords,
        missingSourcePointers,
        inputDigestMismatches,
        duplicateCharacterIds,
        generatedFromDisk: Boolean(generated.generatedFromDisk),
        missingTalentModifiers: (generated.missingTalentModifiers || []).map((entry) => ({
            characterId: entry.characterId,
            characterName: entry.characterName,
            status: entry.status,
            reasons: entry.reasons,
            sourcePointers: entry.sourcePointers,
            classification: entry.classification,
            unverifiedBoundaries: entry.unverifiedBoundaries,
            evidence: entry.evidence
        }))
    };
}

function markdownReport(report) {
    const summary = report.summary || {};
    const lines = [
        "# Genshin character v2 coverage audit",
        "",
        `- Status: **${summary.status}**`,
        `- Characters: ${summary.characters}`,
        `- Canonical records: ${summary.canonical}`,
        `- Talent modifier records present: ${summary.characters - (summary.missingTalentModifiers || 0)}`,
        `- Talent modifier records missing: ${summary.missingTalentModifiers || 0}`,
        "",
        "## Talent-modifier triage",
        "",
        "| Classification | Count |",
        "| --- | ---: |",
        ...CLASSIFICATION_STATUSES.map((status) => `| ${status} | ${(summary.byClassificationStatus || {})[status] || 0} |`),
        "",
        "`noEffect` requires explicit no-effect wording in non-empty raw text; empty/missing text is `uninvestigated`, never `noEffect`. All classifications remain evidence-only and canonical promotion is forbidden.",
        "",
        "## Component coverage",
        "",
        "| Component | Present | Missing |",
        "| --- | ---: | ---: |"
    ];
    const componentRows = {};
    Object.entries(summary.componentCounts || {}).forEach(([key, count]) => {
        const index = key.lastIndexOf(":");
        const component = index >= 0 ? key.slice(0, index) : key;
        const status = index >= 0 ? key.slice(index + 1) : "";
        if (!componentRows[component]) componentRows[component] = { present: 0, missing: 0 };
        if (["present", "covered", "complete"].includes(status)) componentRows[component].present += count;
        else componentRows[component].missing += count;
    });
    Object.entries(componentRows).forEach(([component, row]) => {
        lines.push(`| ${component} | ${row.present || "-"} | ${row.missing || "-"} |`);
    });
    lines.push("", "## Missing talent-modifier records", "", "| Character ID | Name | Status | Reasons |", "| --- | --- | --- | --- |");
    (report.missingTalentModifiers || []).forEach((entry) => {
        lines.push(`| ${entry.characterId} | ${entry.characterName || ""} | ${entry.status} | ${(entry.reasons || []).join(", ")} |`);
    });
    lines.push("", "## Contract", "", `- Deterministic: ${summary.deterministic}`, `- Errors: ${(report.errors || []).length}`);
    if (report.errors?.length) {
        lines.push("", "### Errors", "", ...report.errors.map((error) => `- ${error}`));
    }
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
    const outputFile = process.env.GENSHIN_CHARACTER_V2_COVERAGE_FILE || defaultOutputFile;
    const report = auditCoverage({ dataRoot, outputFile });
    const reportJson = process.env.GENSHIN_CHARACTER_V2_COVERAGE_REPORT_JSON || defaultReportJson;
    const reportMarkdown = process.env.GENSHIN_CHARACTER_V2_COVERAGE_REPORT_MD || defaultReportMarkdown;
    writeReports({ report, reportJson, reportMarkdown });
    process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
    if (report.errors.length) process.exitCode = 1;
}

module.exports = {
    auditCoverage,
    auditGenshinCharacterV2Coverage: auditCoverage,
    defaultReportJson,
    defaultReportMarkdown,
    duplicateValues,
    loadGenerated,
    markdownReport,
    writeReports
};
