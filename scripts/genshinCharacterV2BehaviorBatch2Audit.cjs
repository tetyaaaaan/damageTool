"use strict";

/** Audit the deterministic, review-gated character behavior-v2 batch 2. */

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
} = require("./genshinCharacterV2BehaviorBatch2Generate.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultReportJson = path.join(repositoryRoot, "reports", "genshin-character-v2-behavior-batch-2.json");
const defaultReportMarkdown = path.join(repositoryRoot, "reports", "genshin-character-v2-behavior-batch-2.md");

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
    const counts = new Map();
    (values || []).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    return [...counts.entries()].filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
}

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function containsNumber(value) {
    if (typeof value === "number") return true;
    if (Array.isArray(value)) return value.some(containsNumber);
    if (!isObject(value)) return false;
    return Object.values(value).some(containsNumber);
}

function emptyGenerated({ dataRoot = defaultDataRoot } = {}) {
    return { generatedFromDisk: false, ...buildDataset({ dataRoot }) };
}

function loadGenerated({ dataRoot = defaultDataRoot, outputRoot = defaultOutputRoot } = {}) {
    const manifestPath = path.join(outputRoot, "manifest.json");
    if (!fs.existsSync(manifestPath)) return emptyGenerated({ dataRoot });
    return { ...readJson(manifestPath), generatedFromDisk: true, outputRoot };
}

function rawInventory({ dataRoot }) {
    return readJson(path.join(dataRoot, "v2", "characters", "behavior-inventory.json"));
}

function expectedSignals({ dataRoot }) {
    const inventory = rawInventory({ dataRoot });
    return Object.values(inventory.candidates || {})
        .filter((candidate) => BATCH_IDS.includes(String(candidate?.entity?.id)))
        .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function sourceRefExists(generated, sourceRef) {
    return Boolean(generated.sourceRecords && generated.sourceRecords[sourceRef]);
}

function auditBehaviorBatch2({ dataRoot = defaultDataRoot, outputRoot = defaultOutputRoot } = {}) {
    const generated = loadGenerated({ dataRoot, outputRoot });
    const expected = buildDataset({ dataRoot });
    const inventory = rawInventory({ dataRoot });
    const signals = expectedSignals({ dataRoot });
    const signalById = Object.fromEntries(signals.map((candidate) => [candidate.id, candidate]));
    const errors = [];
    const malformedSources = [];
    const malformedInventory = [];
    const malformedSpecs = [];
    const malformedByCharacter = [];
    const missingSourceRefs = [];
    const missingInventoryRefs = [];
    const missingSignalRefs = [];
    const inputDigestMismatches = [];
    const unknownFieldViolations = [];
    const numericInferenceViolations = [];
    const candidateMappingViolations = [];
    const verificationCounts = {};
    const runtimeCounts = {};
    const sourceKindCounts = {};

    if (generated.schemaVersion !== 2) errors.push("schemaVersion must be 2");
    if (generated.kind !== "genshinBehaviorV2Batch") errors.push("unexpected behavior batch kind");
    if (generated.generator?.version !== GENERATOR_VERSION) errors.push("generator version mismatch");
    if (generated.batch !== 2 || generated.summary?.batch !== 2) errors.push("batch must be 2");
    if (stableJson(generated.batchIds || []) !== stableJson(BATCH_IDS)) errors.push("batch IDs do not match fixed second sorted non-pilot batch");
    if ((generated.batchIds || []).some((id) => PILOT_IDS.includes(id))) errors.push("batch contains a pilot ID");
    if (generated.policy?.canonical !== 0 || generated.policy?.runtimeConnection !== "forbidden") errors.push("canonical/runtime policy violation");

    if (generated.generatedFromDisk) {
        const comparable = { ...generated };
        delete comparable.generatedFromDisk;
        delete comparable.outputRoot;
        if (stableJson(comparable) !== stableJson(expected)) errors.push("behavior batch artifact is not deterministic for current source files");
        [
            ["sourceRecords", "source-records.json"],
            ["inventoryCandidates", "inventory-candidates.json"],
            ["specs", "spec-candidates.json"],
            ["modifiers", "modifiers.json"]
        ].forEach(([key, name]) => {
            const file = path.join(outputRoot, name);
            if (!fs.existsSync(file) || stableJson(readJson(file)) !== stableJson(generated[key] || {})) errors.push(`${name} does not match manifest`);
        });
        const indexPath = path.join(outputRoot, "index.json");
        if (!fs.existsSync(indexPath)) errors.push("index.json is missing");
        else {
            const index = readJson(indexPath);
            const expectedIndex = {
                schemaVersion: generated.schemaVersion,
                kind: "genshinBehaviorV2BatchIndex",
                generator: generated.generator,
                policy: generated.policy,
                summary: generated.summary,
                batch: generated.batch,
                batchIds: generated.batchIds,
                excludedPilotIds: generated.excludedPilotIds,
                generatedFrom: generated.generatedFrom,
                byCharacter: generated.byCharacter
            };
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
        if (!candidate || candidate.id !== id || !candidate.entity?.kind || !candidate.entity?.id || !candidate.entity?.component
            || candidate.status !== "needsReview" || candidate.unknown !== true
            || !Array.isArray(candidate.sourceRefs) || candidate.sourceRefs.length !== 1 || !candidate.sourcePointer) {
            malformedInventory.push(id);
            return;
        }
        candidate.sourceRefs.forEach((sourceRef) => {
            if (!sourceRefExists(generated, sourceRef)) missingSourceRefs.push({ owner: id, sourceRef });
        });
    });

    Object.entries(generated.specs || {}).forEach(([id, spec]) => {
        increment(verificationCounts, spec?.verification?.status);
        increment(runtimeCounts, spec?.runtime?.status);
        const candidateIds = Array.isArray(spec?.inventoryCandidateIds) ? spec.inventoryCandidateIds : [];
        const unknownIds = Array.isArray(spec?.unknownCandidateIds) ? spec.unknownCandidateIds : [];
        if (!spec || spec.id !== id || !spec.entity?.kind || !spec.entity?.id || !spec.entity?.component
            || !Array.isArray(spec.sourceRefs) || spec.sourceRefs.length !== 1 || !spec.interpretation
            || spec.interpretation.method !== "deterministicParser" || !spec.timing || !spec.execution
            || !spec.lifecycle || !spec.energy || spec.verification?.status !== "needsReview"
            || spec.verification.reviewedBy !== null || spec.verification.reviewedAt !== null
            || spec.verification.sourceAgreement !== "unknown" || !spec.verification.claims
            || !Array.isArray(spec.verification.discrepancies) || spec.runtime?.status !== "blocked"
            || !Array.isArray(spec.runtime.modifierIds) || spec.runtime.modifierIds.length !== 0
            || spec.runtime.generator !== null || !Array.isArray(spec.unknownFields)
            || !spec.inventoryCandidateId || !generated.inventoryCandidates?.[spec.inventoryCandidateId]
            || !Array.isArray(spec.inventoryCandidateIds) || !Array.isArray(spec.unknownCandidateIds)
            || Object.prototype.hasOwnProperty.call(spec, "candidateOperations")) {
            malformedSpecs.push(id);
            return;
        }
        spec.sourceRefs.forEach((sourceRef) => {
            if (!sourceRefExists(generated, sourceRef)) missingSourceRefs.push({ owner: id, sourceRef });
        });
        if (!spec.unknownFields.includes("burstCost") || !spec.unknownFields.includes("snapshot")) unknownFieldViolations.push(id);
        if (containsNumber(spec.lifecycle) || containsNumber(spec.energy)) numericInferenceViolations.push(id);

        const expectedIds = signals.filter((candidate) => String(candidate.entity?.id) === String(spec.entity?.id)
            && candidate.entity?.component === spec.entity?.component).map((candidate) => candidate.id).sort();
        if (stableJson(candidateIds) !== stableJson(expectedIds)) candidateMappingViolations.push(`${id}:inventoryCandidateIds`);
        const expectedUnknown = expectedIds.filter((candidateId) => signalById[candidateId]?.status === "unknown");
        if (stableJson(unknownIds) !== stableJson(expectedUnknown)) candidateMappingViolations.push(`${id}:unknownCandidateIds`);
        candidateIds.forEach((candidateId) => {
            if (!signalById[candidateId]) missingInventoryRefs.push({ owner: id, candidateId });
        });
        const discrepancyCandidates = spec.verification.discrepancies.filter((entry) => String(entry?.code || "").startsWith("INVENTORY_") && entry.candidateId);
        const discrepancyIds = discrepancyCandidates.map((entry) => entry.candidateId).sort();
        if (stableJson(discrepancyIds) !== stableJson(expectedIds)) candidateMappingViolations.push(`${id}:discrepancies`);
        discrepancyCandidates.forEach((entry) => {
            const original = signalById[entry.candidateId];
            if (!original) return;
            (entry.sourceRefs || []).forEach((sourceRef) => {
                if (!sourceRefExists(generated, sourceRef)) missingSignalRefs.push({ owner: entry.candidateId, sourceRef });
            });
            (entry.inventorySourceRefs || []).forEach((sourceRef) => {
                if (!inventory.sourceRecords?.[sourceRef]) missingSignalRefs.push({ owner: entry.candidateId, sourceRef });
            });
        });
        ["timing", "execution", "energy", "elementApplication"].forEach((section) => {
            Object.entries(spec[section] || {}).forEach(([field, measurement]) => {
                if (!measurement || measurement.status !== "explicit") return;
                if (!Array.isArray(measurement.sourceRefs) || measurement.sourceRefs.length < 1) candidateMappingViolations.push(`${id}:${section}.${field}:sourceRefs`);
                measurement.sourceRefs?.forEach((sourceRef) => {
                    if (!sourceRefExists(generated, sourceRef)) missingSourceRefs.push({ owner: id, sourceRef });
                });
                if (typeof measurement.value === "number") {
                    const matched = discrepancyCandidates.some((entry) => entry.fieldPath === `/${section}/${field}`
                        && stableJson(entry.value) === stableJson(measurement.value)
                        && entry.candidateStatus === "candidate");
                    if (!matched) numericInferenceViolations.push(`${id}:${section}.${field}`);
                }
            });
        });
        if (spec.lifecycle.refreshMode !== "unknown") {
            const refresh = discrepancyCandidates.filter((entry) => entry.fieldPath === "/lifecycle/refreshMode" && entry.candidateStatus === "candidate");
            if (!refresh.some((entry) => entry.value === spec.lifecycle.refreshMode)) candidateMappingViolations.push(`${id}:lifecycle.refreshMode`);
        }
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
            if (!sourceRefExists(generated, sourceId)) missingSourceRefs.push({ characterId, sourceId });
        });
        index.inventoryCandidateIds.forEach((candidateId) => {
            if (!generated.inventoryCandidates?.[candidateId]) missingInventoryRefs.push({ characterId, candidateId });
        });
        index.specIds.forEach((specId) => {
            if (!generated.specs?.[specId] || generated.specs[specId].entity?.id !== characterId) malformedByCharacter.push(`${characterId}:spec:${specId}`);
        });
    });

    if (duplicateValues(Object.keys(generated.sourceRecords || {})).length
        || duplicateValues(Object.keys(generated.inventoryCandidates || {})).length
        || duplicateValues(Object.keys(generated.specs || {})).length) errors.push("duplicate IDs detected");
    if (Object.keys(generated.modifiers || {}).length !== 0) errors.push("runtime modifiers must remain empty");
    if (Object.keys(generated.byCharacter || {}).sort().join(",") !== BATCH_IDS.join(",")) errors.push("byCharacter keys do not match batch IDs");
    if (generated.summary?.canonical !== 0 || generated.summary?.modifiers !== 0) errors.push("summary canonical/modifiers must remain zero");
    if (generated.summary?.sourceInventoryCandidates !== signals.length
        || generated.summary?.explicitInventoryCandidates !== signals.filter((candidate) => candidate.status === "candidate").length
        || generated.summary?.unknownInventoryCandidates !== signals.filter((candidate) => candidate.status === "unknown").length) errors.push("inventory signal summary counts do not match source inventory");
    if (missingSourceRefs.length || missingInventoryRefs.length || missingSignalRefs.length || malformedSources.length || malformedInventory.length
        || malformedSpecs.length || malformedByCharacter.length || inputDigestMismatches.length || unknownFieldViolations.length
        || numericInferenceViolations.length || candidateMappingViolations.length) errors.push("behavior batch coverage/contract failure");

    const summary = {
        schemaVersion: 2,
        status: errors.length ? "failed" : "passed",
        batch: 2,
        batchCharacters: BATCH_IDS.length,
        sourceRecords: Object.keys(generated.sourceRecords || {}).length,
        inventoryCandidates: Object.keys(generated.inventoryCandidates || {}).length,
        sourceInventoryCandidates: signals.length,
        explicitInventoryCandidates: signals.filter((candidate) => candidate.status === "candidate").length,
        unknownInventoryCandidates: signals.filter((candidate) => candidate.status === "unknown").length,
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
            missingSignalRefs: missingSignalRefs.length,
            inputDigestMismatches: inputDigestMismatches.length,
            unknownFieldViolations: unknownFieldViolations.length,
            numericInferenceViolations: numericInferenceViolations.length,
            candidateMappingViolations: candidateMappingViolations.length
        },
        generatedFromDisk: Boolean(generated.generatedFromDisk),
        deterministic: !errors.includes("behavior batch artifact is not deterministic for current source files")
    };
    const characterCoverage = BATCH_IDS.map((characterId) => {
        const index = generated.byCharacter?.[characterId] || {};
        return {
            characterId,
            characterName: index.characterName || null,
            sourceRecords: index.sourceRecordIds?.length || 0,
            inventoryCandidates: index.inventoryCandidateIds?.length || 0,
            inventorySignalCandidates: index.inventorySignalCandidateIds?.length || 0,
            unknownCandidates: index.unknownCandidateIds?.length || 0,
            specs: index.specIds?.length || 0,
            modifiers: index.modifierIds?.length || 0,
            canonical: index.canonical ?? null
        };
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
        missingSignalRefs,
        inputDigestMismatches,
        unknownFieldViolations,
        numericInferenceViolations,
        candidateMappingViolations,
        characterCoverage,
        generatedFromDisk: Boolean(generated.generatedFromDisk)
    };
}

function markdownReport(report) {
    const summary = report.summary || {};
    const lines = [
        "# Genshin behavior v2 batch 2 audit",
        "",
        `- Status: **${summary.status}**`,
        `- Fixed batch characters: ${summary.batchCharacters}`,
        `- Raw source records: ${summary.sourceRecords}`,
        `- Batch-local inventory candidates: ${summary.inventoryCandidates}`,
        `- Source inventory candidates: ${summary.sourceInventoryCandidates}`,
        `- Explicit inventory candidates: ${summary.explicitInventoryCandidates}`,
        `- Unknown inventory candidates: ${summary.unknownInventoryCandidates}`,
        `- Review-gated BehaviorSpec candidates: ${summary.specs}`,
        `- Runtime modifiers: ${summary.modifiers}`,
        `- Canonical records: ${summary.canonical}`,
        "",
        "Raw source pointers and existing inventory candidates are retained as review evidence. Explicit values are copied only into schema measurement fields; operations, conflicts, reset/null candidates, and unknown candidates remain in verification discrepancies. Runtime connection is blocked and canonical promotion is zero.",
        "",
        "## Character coverage",
        "",
        "| Character ID | Name | Sources | Local inventory | Signal candidates | Unknown | Specs | Modifiers | Canonical |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
        ...(report.characterCoverage || []).map((entry) => `| ${entry.characterId} | ${entry.characterName || ""} | ${entry.sourceRecords} | ${entry.inventoryCandidates} | ${entry.inventorySignalCandidates} | ${entry.unknownCandidates} | ${entry.specs} | ${entry.modifiers} | ${entry.canonical} |`),
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
    const outputRoot = process.env.GENSHIN_CHARACTER_V2_BEHAVIOR_BATCH_2_ROOT || defaultOutputRoot;
    const report = auditBehaviorBatch2({ dataRoot, outputRoot });
    const reportJson = process.env.GENSHIN_CHARACTER_V2_BEHAVIOR_BATCH_2_REPORT_JSON || defaultReportJson;
    const reportMarkdown = process.env.GENSHIN_CHARACTER_V2_BEHAVIOR_BATCH_2_REPORT_MD || defaultReportMarkdown;
    writeReports({ report, reportJson, reportMarkdown });
    process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
    if (report.errors.length) process.exitCode = 1;
}

module.exports = {
    auditBehaviorBatch2,
    auditGenshinCharacterV2BehaviorBatch2: auditBehaviorBatch2,
    defaultReportJson,
    defaultReportMarkdown,
    duplicateValues,
    loadGenerated,
    markdownReport,
    writeReports
};
