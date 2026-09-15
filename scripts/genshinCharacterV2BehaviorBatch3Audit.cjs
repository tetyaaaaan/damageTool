"use strict";

/** Audit the deterministic behavior-v2 batch 3 inventory/candidate layer. */

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
} = require("./genshinCharacterV2BehaviorBatch3Generate.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultReportJson = path.join(repositoryRoot, "reports", "genshin-character-v2-behavior-batch-3.json");
const defaultReportMarkdown = path.join(repositoryRoot, "reports", "genshin-character-v2-behavior-batch-3.md");
const SAFE_MEASUREMENT_PATHS = new Set([
    "/timing/cooldown", "/timing/duration", "/timing/tickInterval", "/timing/triggerInterval",
    "/timing/activationDelay", "/execution/hitCount", "/execution/attackCount",
    "/execution/maxTriggers", "/execution/charges", "/execution/maxInstances",
    "/execution/offField", "/execution/snapshot", "/execution/area", "/execution/targetCount"
]);
const SAFE_LIFECYCLE_PATHS = new Set(["/lifecycle/refreshMode", "/lifecycle/expiration"]);

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

function emptyGenerated() {
    return { generatedFromDisk: false, ...buildDataset({ dataRoot: defaultDataRoot }) };
}

function loadGenerated({ dataRoot = defaultDataRoot, outputRoot = defaultOutputRoot } = {}) {
    const manifestPath = path.join(outputRoot, "manifest.json");
    if (!fs.existsSync(manifestPath)) return emptyGenerated();
    return { ...readJson(manifestPath), generatedFromDisk: true, outputRoot };
}

function loadInventory(dataRoot) {
    return readJson(path.join(dataRoot, "v2", "characters", "behavior-inventory.json"));
}

function candidateGroups(inventory, spec) {
    const ids = spec.inventoryCandidateIds || [];
    return ids.map((id) => inventory.candidates?.[id]).filter(Boolean);
}

function pathValue(spec, fieldPath) {
    const parts = String(fieldPath || "").replace(/^\//, "").split("/");
    if (parts.length !== 2) return undefined;
    return spec[parts[0]]?.[parts[1]];
}

function isMeasurement(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        && Object.prototype.hasOwnProperty.call(value, "value")
        && Object.prototype.hasOwnProperty.call(value, "unit")
        && Object.prototype.hasOwnProperty.call(value, "status")
        && Array.isArray(value.sourceRefs);
}

function containsNumber(value) {
    if (typeof value === "number") return true;
    if (Array.isArray(value)) return value.some(containsNumber);
    if (!value || typeof value !== "object") return false;
    return Object.values(value).some(containsNumber);
}

function auditBehaviorBatch3({ dataRoot = defaultDataRoot, outputRoot = defaultOutputRoot } = {}) {
    const generated = loadGenerated({ dataRoot, outputRoot });
    const expected = buildDataset({ dataRoot });
    const inventory = loadInventory(dataRoot);
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
    const inventoryCandidateViolations = [];
    const schemaViolations = [];
    const verificationCounts = {};
    const runtimeCounts = {};
    const sourceKindCounts = {};

    if (generated.schemaVersion !== 2) errors.push("schemaVersion must be 2");
    if (generated.kind !== "genshinBehaviorV2Batch") errors.push("unexpected behavior batch kind");
    if (generated.generator?.version !== GENERATOR_VERSION) errors.push("generator version mismatch");
    if (generated.batch !== 3) errors.push("batch must be 3");
    if (stableJson(generated.batchIds || []) !== stableJson(BATCH_IDS)) errors.push("batch IDs do not match fixed batch 3 inventory");
    if ((generated.excludedPilotIds || []).some((id) => !PILOT_IDS.includes(id))) errors.push("excluded pilot list contains an unknown ID");
    if ((generated.batchIds || []).some((id) => PILOT_IDS.includes(id))) errors.push("batch contains a pilot ID");
    if (generated.policy?.canonical !== 0 || generated.policy?.runtimeConnection !== "forbidden" || generated.policy?.proseParsing !== "forbidden") errors.push("canonical/runtime policy violation");

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
        const record = source?.locator?.record || "";
        const field = source?.locator?.field || "";
        const normalLocator = field.endsWith("DescriptionJa") && ["normalDescriptionJa", "chargedDescriptionJa", "plungingDescriptionJa"].includes(field)
            ? record.endsWith("/normalAttack") : true;
        const passiveLocator = source?.structuredValue?.passiveIndex === undefined || record.includes(`/passives/${source.structuredValue.passiveIndex}`);
        if (!source || source.id !== id || source.kind !== "primaryDataset" || source.provider !== "damageTool-local"
            || !source.locator?.dataset || !source.locator?.record || source.integrity?.algorithm !== "sha256"
            || source.integrity?.digest !== digest(source.text) || typeof source.text !== "string" || source.gameVersion !== null
            || !normalLocator || !passiveLocator) malformedSources.push(id);
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
            || !spec.inventoryCandidateId || !generated.inventoryCandidates?.[spec.inventoryCandidateId]
            || !Array.isArray(spec.inventoryCandidateIds) || !Array.isArray(spec.unknownCandidateIds)) {
            malformedSpecs.push(id);
            return;
        }
        spec.sourceRefs.forEach((ref) => {
            if (!generated.sourceRecords?.[ref]) missingSourceRefs.push({ owner: id, sourceRef: ref });
        });
        spec.inventoryCandidateIds.forEach((candidateId) => {
            const candidate = inventory.candidates?.[candidateId];
            if (!candidate) missingInventoryRefs.push({ owner: id, candidateId });
            else if (candidate.entity?.id !== spec.entity.id || candidate.entity?.component !== spec.entity.component) inventoryCandidateViolations.push({ owner: id, candidateId, reason: "entityMismatch" });
        });
        spec.unknownCandidateIds.forEach((candidateId) => {
            const candidate = inventory.candidates?.[candidateId];
            if (!candidate || candidate.status !== "unknown") inventoryCandidateViolations.push({ owner: id, candidateId, reason: "unknownStatusMismatch" });
        });
        if (spec.inventoryCandidateIds.some((candidateId) => !spec.unknownCandidateIds.includes(candidateId) && inventory.candidates?.[candidateId]?.status !== "candidate")) inventoryCandidateViolations.push({ owner: id, reason: "candidateStatusMismatch" });
        if (spec.unknownFields.includes("burstCost") && spec.energy.burstCost !== undefined) unknownFieldViolations.push(id);
        Object.entries(spec.timing).forEach(([field, value]) => {
            const fieldPath = `/timing/${field}`;
            if (!SAFE_MEASUREMENT_PATHS.has(fieldPath) || !isMeasurement(value) || value.status !== "explicit") schemaViolations.push(`${id}:${fieldPath}`);
        });
        Object.entries(spec.execution).forEach(([field, value]) => {
            const fieldPath = `/execution/${field}`;
            if (!SAFE_MEASUREMENT_PATHS.has(fieldPath) || !isMeasurement(value) || value.status !== "explicit") schemaViolations.push(`${id}:${fieldPath}`);
        });
        if (!SAFE_LIFECYCLE_PATHS.has("/lifecycle/refreshMode") || !["none", "refresh", "extend", "replace", "independent", "unknown"].includes(spec.lifecycle.refreshMode)) schemaViolations.push(`${id}:lifecycle.refreshMode`);
        if (!SAFE_LIFECYCLE_PATHS.has("/lifecycle/expiration") || !["duration", "triggerLimit", "consumed", "destroyed", "stateEnd", "unknown"].includes(spec.lifecycle.expiration)) schemaViolations.push(`${id}:lifecycle.expiration`);
        Object.values(spec.verification.claims).forEach((claim) => {
            if (claim.status !== "needsReview" || !Array.isArray(claim.sourceRefs) || claim.sourceRefs.length !== 1) malformedSpecs.push(`${id}:claim`);
        });

        const evidence = candidateGroups(inventory, spec);
        const explicitByPath = new Map();
        evidence.filter((candidate) => candidate.status === "candidate").forEach((candidate) => {
            const list = explicitByPath.get(candidate.fieldPath) || [];
            list.push(candidate);
            explicitByPath.set(candidate.fieldPath, list);
        });
        explicitByPath.forEach((candidates, fieldPath) => {
            const mapped = pathValue(spec, fieldPath);
            if (candidates.length === 1 && candidates[0].value !== null && SAFE_MEASUREMENT_PATHS.has(fieldPath)) {
                if (!isMeasurement(mapped) || mapped.value !== candidates[0].value || mapped.unit !== candidates[0].unit || mapped.status !== "explicit") inventoryCandidateViolations.push({ owner: id, fieldPath, reason: "explicitValueNotCopied" });
                if (!String(mapped?.notes || "").includes(`operation=${candidates[0].operation}`)) inventoryCandidateViolations.push({ owner: id, fieldPath, reason: "operationNotRetained" });
            } else if (candidates.length === 1 && candidates[0].value !== null && SAFE_LIFECYCLE_PATHS.has(fieldPath)) {
                const lifecycleField = fieldPath.slice("/lifecycle/".length);
                if (spec.lifecycle[lifecycleField] !== candidates[0].value) inventoryCandidateViolations.push({ owner: id, fieldPath, reason: "lifecycleValueNotCopied" });
            } else if (candidates.length > 1) {
                const found = spec.verification.discrepancies.some((entry) => entry.code === "INVENTORY_OPERATION_CONFLICT" && entry.fieldPath === fieldPath);
                if (!found) inventoryCandidateViolations.push({ owner: id, fieldPath, reason: "operationConflictNotRecorded" });
            } else if (candidates.length === 1 && candidates[0].value === null) {
                const found = spec.verification.discrepancies.some((entry) => entry.code === "INVENTORY_NULL_RESET" && entry.fieldPath === fieldPath);
                if (!found) inventoryCandidateViolations.push({ owner: id, fieldPath, reason: "nullResetNotRecorded" });
            }
        });
        // Any numeric value in a mapped measurement must be byte-for-byte
        // present in the explicit inventory candidate for the same path.
        Object.entries(spec.timing).concat(Object.entries(spec.execution)).forEach(([field, measurement]) => {
            const fieldPath = `${Object.prototype.hasOwnProperty.call(spec.timing, field) ? "/timing/" : "/execution/"}${field}`;
            if (containsNumber(measurement)) {
                const candidates = explicitByPath.get(fieldPath) || [];
                if (!candidates.some((candidate) => stableJson(candidate.value) === stableJson(measurement.value) && candidate.unit === measurement.unit)) numericInferenceViolations.push(`${id}:${fieldPath}`);
            }
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

    if (duplicateValues(Object.keys(generated.sourceRecords || {})).length
        || duplicateValues(Object.keys(generated.inventoryCandidates || {})).length
        || duplicateValues(Object.keys(generated.specs || {})).length) errors.push("duplicate IDs detected");
    if (Object.keys(generated.modifiers || {}).length !== 0) errors.push("runtime modifiers must remain empty");
    if (Object.keys(generated.byCharacter || {}).sort().join(",") !== BATCH_IDS.join(",")) errors.push("byCharacter keys do not match batch IDs");
    if (generated.summary?.canonical !== 0 || generated.summary?.modifiers !== 0) errors.push("summary canonical/modifiers must remain zero");
    if (missingSourceRefs.length || missingInventoryRefs.length || malformedSources.length || malformedInventory.length || malformedSpecs.length || malformedByCharacter.length || inputDigestMismatches.length || unknownFieldViolations.length || numericInferenceViolations.length || inventoryCandidateViolations.length || schemaViolations.length) errors.push("behavior batch coverage/contract failure");

    const summary = {
        schemaVersion: 2,
        status: errors.length ? "failed" : "passed",
        batch: 3,
        batchCharacters: BATCH_IDS.length,
        sourceRecords: Object.keys(generated.sourceRecords || {}).length,
        inventoryCandidates: Object.keys(generated.inventoryCandidates || {}).length,
        specs: Object.keys(generated.specs || {}).length,
        modifiers: Object.keys(generated.modifiers || {}).length,
        canonical: 0,
        inventoryInputCandidates: generated.summary?.inventoryInputCandidates || 0,
        inventoryCandidateStatusCounts: generated.summary?.inventoryCandidateStatusCounts || {},
        explicitCandidateOperations: generated.summary?.explicitCandidateOperations || 0,
        unknownCandidateIds: generated.summary?.unknownCandidateIds || 0,
        sourceInventoryCandidates: generated.summary?.sourceInventoryCandidates || 0,
        explicitInventoryCandidates: generated.summary?.explicitInventoryCandidates || 0,
        unknownInventoryCandidates: generated.summary?.unknownInventoryCandidates || 0,
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
            numericInferenceViolations: numericInferenceViolations.length,
            inventoryCandidateViolations: inventoryCandidateViolations.length,
            schemaViolations: schemaViolations.length
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
            specs: index.specIds?.length || 0,
            inventoryInputCandidates: index.inventoryInputCandidateIds?.length || 0,
            explicitCandidateOperations: index.explicitCandidateIds?.length || 0,
            unknownCandidateIds: index.unknownCandidateIds?.length || 0,
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
        inputDigestMismatches,
        unknownFieldViolations,
        numericInferenceViolations,
        inventoryCandidateViolations,
        schemaViolations,
        characterCoverage,
        generatedFromDisk: Boolean(generated.generatedFromDisk)
    };
}

function markdownReport(report) {
    const summary = report.summary || {};
    const lines = [
        "# Genshin behavior v2 batch 3 audit",
        "",
        `- Status: **${summary.status}**`,
        `- Fixed batch characters: ${summary.batchCharacters}`,
        `- Raw source records: ${summary.sourceRecords}`,
        `- Inventory candidates: ${summary.inventoryCandidates}`,
        `- Review-gated BehaviorSpec candidates: ${summary.specs}`,
        `- Existing inventory candidates linked: ${summary.inventoryInputCandidates}`,
        `- Explicit candidate operations retained: ${summary.explicitCandidateOperations}`,
        `- Unknown candidate IDs retained: ${summary.unknownCandidateIds}`,
        `- Runtime modifiers: ${summary.modifiers}`,
        `- Canonical records: ${summary.canonical}`,
        "",
        "Raw source pointers remain review-gated. Explicit values are copied only from behavior-inventory candidates; conflicting operations and null resets remain verification discrepancies. Runtime connection is blocked.",
        "",
        "## Character coverage",
        "",
        "| Character ID | Name | Sources | Specs | Inventory input | Explicit | Unknown | Modifiers | Canonical |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
        ...(report.characterCoverage || []).map((entry) => `| ${entry.characterId} | ${entry.characterName || ""} | ${entry.sourceRecords} | ${entry.specs} | ${entry.inventoryInputCandidates} | ${entry.explicitCandidateOperations} | ${entry.unknownCandidateIds} | ${entry.modifiers} | ${entry.canonical} |`),
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
    const outputRoot = process.env.GENSHIN_CHARACTER_V2_BEHAVIOR_BATCH_3_ROOT || defaultOutputRoot;
    const report = auditBehaviorBatch3({ dataRoot, outputRoot });
    const reportJson = process.env.GENSHIN_CHARACTER_V2_BEHAVIOR_BATCH_3_REPORT_JSON || defaultReportJson;
    const reportMarkdown = process.env.GENSHIN_CHARACTER_V2_BEHAVIOR_BATCH_3_REPORT_MD || defaultReportMarkdown;
    writeReports({ report, reportJson, reportMarkdown });
    process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
    if (report.errors.length) process.exitCode = 1;
}

module.exports = {
    auditBehaviorBatch3,
    auditGenshinCharacterV2BehaviorBatch3: auditBehaviorBatch3,
    defaultReportJson,
    defaultReportMarkdown,
    duplicateValues,
    loadGenerated,
    markdownReport,
    writeReports
};
