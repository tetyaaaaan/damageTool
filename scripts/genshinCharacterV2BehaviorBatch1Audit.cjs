"use strict";

/** Audit the deterministic behavior-v2 batch 1 inventory/candidate layer. */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
    BATCH_IDS,
    GENERATOR_VERSION,
    PILOT_IDS,
    buildDataset,
    defaultDataRoot,
    defaultOutputRoot,
    stableJson
} = require("./genshinCharacterV2BehaviorBatch1Generate.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultReportJson = path.join(repositoryRoot, "reports", "genshin-character-v2-behavior-batch-1.json");
const defaultReportMarkdown = path.join(repositoryRoot, "reports", "genshin-character-v2-behavior-batch-1.md");

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function digest(value) {
    return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function digestFile(file) {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function increment(map, key) {
    const name = String(key || "unknown");
    map[name] = (map[name] || 0) + 1;
}

function duplicateValues(values) {
    const occurrences = new Map();
    (values || []).forEach((value) => occurrences.set(value, (occurrences.get(value) || 0) + 1));
    return [...occurrences.entries()].filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
}

function containsNumber(value) {
    if (typeof value === "number") return true;
    if (Array.isArray(value)) return value.some(containsNumber);
    if (!value || typeof value !== "object") return false;
    return Object.values(value).some(containsNumber);
}

function hasUnprovenNumber(value) {
    if (Array.isArray(value)) return value.some(hasUnprovenNumber);
    if (!value || typeof value !== "object") return false;
    if (Object.prototype.hasOwnProperty.call(value, "value") && typeof value.value === "number") {
        return !["explicit", "derived"].includes(value.status) || !Array.isArray(value.sourceRefs) || !value.sourceRefs.length;
    }
    return Object.values(value).some(hasUnprovenNumber);
}

function emptyGenerated() {
    return { generatedFromDisk: false, ...buildDataset({ dataRoot: defaultDataRoot }) };
}

function loadGenerated({ dataRoot = defaultDataRoot, outputRoot = defaultOutputRoot } = {}) {
    const manifestPath = path.join(outputRoot, "manifest.json");
    if (!fs.existsSync(manifestPath)) return emptyGenerated();
    const manifest = readJson(manifestPath);
    return { ...manifest, generatedFromDisk: true, outputRoot };
}

function auditBehaviorBatch1({ dataRoot = defaultDataRoot, outputRoot = defaultOutputRoot } = {}) {
    const generated = loadGenerated({ dataRoot, outputRoot });
    const expected = buildDataset({ dataRoot });
    const errors = [];
    const malformedSources = [];
    const malformedInventory = [];
    const malformedSpecs = [];
    const malformedByCharacter = [];
    const missingSourceRefs = [];
    const missingInventoryRefs = [];
    const inputDigestMismatches = [];
    const unknownFieldViolations = [];
    const numericInferenceViolations = [];
    const verificationCounts = {};
    const runtimeCounts = {};
    const sourceKindCounts = {};

    if (generated.schemaVersion !== 2) errors.push("schemaVersion must be 2");
    if (generated.kind !== "genshinBehaviorV2Batch") errors.push("unexpected behavior batch kind");
    if (generated.generator?.version !== GENERATOR_VERSION) errors.push("generator version mismatch");
    if (generated.batch !== 1) errors.push("batch must be 1");
    if (stableJson(generated.batchIds || []) !== stableJson(BATCH_IDS)) errors.push("batch IDs do not match fixed sorted non-pilot batch");
    if ((generated.excludedPilotIds || []).some((id) => !PILOT_IDS.includes(id))) errors.push("excluded pilot list contains an unknown ID");
    if ((generated.batchIds || []).some((id) => PILOT_IDS.includes(id))) errors.push("batch contains a pilot ID");
    if (generated.policy?.canonical !== 0 || generated.policy?.runtimeConnection !== "forbidden") errors.push("canonical/runtime policy violation");

    if (generated.generatedFromDisk) {
        const comparable = { ...generated };
        delete comparable.generatedFromDisk;
        delete comparable.outputRoot;
        if (stableJson(comparable) !== stableJson(expected)) errors.push("behavior batch artifact is not deterministic for current source files");
        const splitFiles = [
            ["sourceRecords", "source-records.json"],
            ["inventoryCandidates", "inventory-candidates.json"],
            ["specs", "spec-candidates.json"],
            ["modifiers", "modifiers.json"]
        ];
        splitFiles.forEach(([key, name]) => {
            const file = path.join(outputRoot, name);
            if (!fs.existsSync(file) || stableJson(readJson(file)) !== stableJson(generated[key] || {})) errors.push(`${name} does not match manifest`);
        });
        const indexPath = path.join(outputRoot, "index.json");
        if (!fs.existsSync(indexPath)) errors.push("index.json is missing");
        else {
            const index = readJson(indexPath);
            const expectedIndex = { schemaVersion: generated.schemaVersion, kind: "genshinBehaviorV2BatchIndex", generator: generated.generator, policy: generated.policy, summary: generated.summary, batch: generated.batch, batchIds: generated.batchIds, excludedPilotIds: generated.excludedPilotIds, generatedFrom: generated.generatedFrom, byCharacter: generated.byCharacter };
            if (stableJson(index) !== stableJson(expectedIndex)) errors.push("index.json does not match manifest");
        }
    }

    (generated.generatedFrom || []).forEach((input) => {
        const relative = String(input.path || "").replace(/^games\/genshin\/data\//, "");
        const absolute = path.join(dataRoot, relative);
        if (!fs.existsSync(absolute)) inputDigestMismatches.push({ path: input.path, reason: "missing" });
        else if (digestFile(absolute) !== input.integrity?.digest) inputDigestMismatches.push({ path: input.path, reason: "digestMismatch" });
    });

    Object.entries(generated.sourceRecords || {}).forEach(([id, source]) => {
        increment(sourceKindCounts, source?.kind);
        if (!source || source.id !== id || source.kind !== "primaryDataset" || source.provider !== "damageTool-local"
            || !source.locator?.dataset || !source.locator?.record || source.integrity?.algorithm !== "sha256"
            || source.integrity?.digest !== digest(source.text) || typeof source.text !== "string" || source.gameVersion !== null) {
            malformedSources.push(id);
        }
    });

    Object.entries(generated.inventoryCandidates || {}).forEach(([id, candidate]) => {
        if (!candidate || candidate.id !== id || !candidate.entity?.kind || !candidate.entity?.id
            || !candidate.entity?.component || candidate.status !== "needsReview" || candidate.unknown !== true
            || !Array.isArray(candidate.sourceRefs) || candidate.sourceRefs.length !== 1 || !candidate.sourcePointer) {
            malformedInventory.push(id);
            return;
        }
        candidate.sourceRefs.forEach((ref) => {
            if (!generated.sourceRecords?.[ref]) missingSourceRefs.push({ owner: id, sourceRef: ref });
        });
    });

    Object.entries(generated.specs || {}).forEach(([id, spec]) => {
        increment(verificationCounts, spec?.verification?.status);
        increment(runtimeCounts, spec?.runtime?.status);
        if (!spec || spec.id !== id || !spec.entity?.kind || !spec.entity?.id || !spec.entity?.component
            || !Array.isArray(spec.sourceRefs) || spec.sourceRefs.length !== 1 || !spec.interpretation
            || spec.interpretation.method !== "deterministicParser" || !spec.timing || !spec.execution
            || !spec.lifecycle || !spec.energy || spec.verification?.status !== "needsReview"
            || spec.verification.reviewedBy !== null || spec.verification.reviewedAt !== null
            || spec.verification.sourceAgreement !== "unknown" || !spec.verification.claims
            || !Array.isArray(spec.verification.discrepancies) || spec.runtime?.status !== "blocked"
            || !Array.isArray(spec.runtime.modifierIds) || spec.runtime.modifierIds.length !== 0
            || spec.runtime.generator !== null || !Array.isArray(spec.unknownFields)
            || !spec.inventoryCandidateId || !generated.inventoryCandidates?.[spec.inventoryCandidateId]) {
            malformedSpecs.push(id);
            return;
        }
        spec.sourceRefs.forEach((ref) => {
            if (!generated.sourceRecords?.[ref]) missingSourceRefs.push({ owner: id, sourceRef: ref });
        });
        if (!spec.unknownFields.includes("burstCost") || !spec.unknownFields.includes("snapshot")) unknownFieldViolations.push(id);
        if (hasUnprovenNumber({ timing: spec.timing, execution: spec.execution, lifecycle: spec.lifecycle, energy: spec.energy, elementApplication: spec.elementApplication })) numericInferenceViolations.push(id);
        Object.values(spec.verification.claims).forEach((claim) => {
            if (claim.status !== "needsReview" || !Array.isArray(claim.sourceRefs) || claim.sourceRefs.length !== 1) malformedSpecs.push(`${id}:claim`);
        });
    });

    Object.entries(generated.byCharacter || {}).forEach(([characterId, index]) => {
        if (!index || index.characterId !== characterId || index.canonical !== 0
            || !Array.isArray(index.sourceRecordIds) || !Array.isArray(index.inventoryCandidateIds)
            || !Array.isArray(index.specIds) || !Array.isArray(index.modifierIds)
            || index.modifierIds.length !== 0) {
            malformedByCharacter.push(characterId);
            return;
        }
        index.sourceRecordIds.forEach((sourceId) => {
            if (!generated.sourceRecords?.[sourceId]) missingSourceRefs.push({ characterId, sourceId });
        });
        index.inventoryCandidateIds.forEach((candidateId) => {
            if (!generated.inventoryCandidates?.[candidateId]) missingInventoryRefs.push({ characterId, candidateId });
        });
        index.specIds.forEach((specId) => {
            if (!generated.specs?.[specId] || generated.specs[specId].entity?.id !== characterId) malformedByCharacter.push(`${characterId}:spec:${specId}`);
        });
    });

    const duplicateSources = duplicateValues(Object.keys(generated.sourceRecords || {}));
    const duplicateCandidates = duplicateValues(Object.keys(generated.inventoryCandidates || {}));
    const duplicateSpecs = duplicateValues(Object.keys(generated.specs || {}));
    if (duplicateSources.length || duplicateCandidates.length || duplicateSpecs.length) errors.push("duplicate IDs detected");
    if (Object.keys(generated.modifiers || {}).length !== 0) errors.push("runtime modifiers must remain empty");
    if (Object.keys(generated.byCharacter || {}).sort().join(",") !== BATCH_IDS.join(",")) errors.push("byCharacter keys do not match batch IDs");
    if (generated.summary?.canonical !== 0 || generated.summary?.modifiers !== 0) errors.push("summary canonical/modifiers must remain zero");
    if (missingSourceRefs.length || missingInventoryRefs.length || malformedSources.length || malformedInventory.length || malformedSpecs.length || malformedByCharacter.length || inputDigestMismatches.length || unknownFieldViolations.length || numericInferenceViolations.length) errors.push("behavior batch coverage/contract failure");

    const summary = {
        schemaVersion: 2,
        status: errors.length ? "failed" : "passed",
        batch: 1,
        batchCharacters: BATCH_IDS.length,
        sourceRecords: Object.keys(generated.sourceRecords || {}).length,
        inventoryCandidates: Object.keys(generated.inventoryCandidates || {}).length,
        sourceInventoryCandidates: Number(generated.summary?.sourceInventoryCandidates || 0),
        explicitInventoryCandidates: Number(generated.summary?.explicitInventoryCandidates || 0),
        unknownInventoryCandidates: Number(generated.summary?.unknownInventoryCandidates || 0),
        specs: Object.keys(generated.specs || {}).length,
        modifiers: Object.keys(generated.modifiers || {}).length,
        canonical: 0,
        verificationByStatus: verificationCounts,
        runtimeByStatus: runtimeCounts,
        sourceKinds: sourceKindCounts,
        contract: {
            malformedSources: malformedSources.length,
            malformedInventory: malformedInventory.length,
            malformedSpecs: malformedSpecs.length,
            malformedByCharacter: malformedByCharacter.length,
            missingSourceRefs: missingSourceRefs.length,
            missingInventoryRefs: missingInventoryRefs.length,
            inputDigestMismatches: inputDigestMismatches.length,
            unknownFieldViolations: unknownFieldViolations.length,
            numericInferenceViolations: numericInferenceViolations.length
        },
        generatedFromDisk: Boolean(generated.generatedFromDisk),
        deterministic: !errors.includes("behavior batch artifact is not deterministic for current source files")
    };
    const characterCoverage = BATCH_IDS.map((characterId) => {
        const index = generated.byCharacter?.[characterId] || {};
        return { characterId, characterName: index.characterName || null, sourceRecords: index.sourceRecordIds?.length || 0, inventoryCandidates: index.inventoryCandidateIds?.length || 0, specs: index.specIds?.length || 0, modifiers: index.modifierIds?.length || 0, canonical: index.canonical ?? null };
    });
    return {
        schemaVersion: 2,
        status: summary.status,
        summary,
        errors,
        malformedSources,
        malformedInventory,
        malformedSpecs,
        malformedByCharacter,
        missingSourceRefs,
        missingInventoryRefs,
        inputDigestMismatches,
        unknownFieldViolations,
        numericInferenceViolations,
        characterCoverage,
        generatedFromDisk: Boolean(generated.generatedFromDisk)
    };
}

function markdownReport(report) {
    const summary = report.summary || {};
    const lines = [
        "# Genshin behavior v2 batch 1 audit",
        "",
        `- Status: **${summary.status}**`,
        `- Fixed batch characters: ${summary.batchCharacters}`,
        `- Raw source records: ${summary.sourceRecords}`,
        `- Inventory candidates: ${summary.inventoryCandidates}`,
        `- Source inventory candidates: ${summary.sourceInventoryCandidates || 0} (${summary.explicitInventoryCandidates || 0} explicit / ${summary.unknownInventoryCandidates || 0} unknown)`,
        `- Review-gated BehaviorSpec candidates: ${summary.specs}`,
        `- Runtime modifiers: ${summary.modifiers}`,
        `- Canonical records: ${summary.canonical}`,
        "",
        "Explicit non-conflicting measurements copied from the deterministic behavior inventory remain needsReview. Unstated or ambiguous values, units, targets, lifecycle, and snapshot behavior remain unknown; Runtime connection is blocked.",
        "",
        "## Character coverage",
        "",
        "| Character ID | Name | Sources | Inventory | Specs | Modifiers | Canonical |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
        ...(report.characterCoverage || []).map((entry) => `| ${entry.characterId} | ${entry.characterName || ""} | ${entry.sourceRecords} | ${entry.inventoryCandidates} | ${entry.specs} | ${entry.modifiers} | ${entry.canonical} |`),
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
    const outputRoot = process.env.GENSHIN_CHARACTER_V2_BEHAVIOR_BATCH_1_ROOT || defaultOutputRoot;
    const report = auditBehaviorBatch1({ dataRoot, outputRoot });
    const reportJson = process.env.GENSHIN_CHARACTER_V2_BEHAVIOR_BATCH_1_REPORT_JSON || defaultReportJson;
    const reportMarkdown = process.env.GENSHIN_CHARACTER_V2_BEHAVIOR_BATCH_1_REPORT_MD || defaultReportMarkdown;
    writeReports({ report, reportJson, reportMarkdown });
    process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
    if (report.errors.length) process.exitCode = 1;
}

module.exports = {
    auditBehaviorBatch1,
    auditGenshinCharacterV2BehaviorBatch1: auditBehaviorBatch1,
    defaultReportJson,
    defaultReportMarkdown,
    duplicateValues,
    loadGenerated,
    markdownReport,
    writeReports
};
