"use strict";

/** Shared audit implementation for fixed BehaviorSpec character batches. */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const repositoryRoot = path.resolve(__dirname, "..");

function createBehaviorBatchAudit(config) {
    const {
        generator,
        batch,
        mode = batch === 5 ? "batch5" : batch === 6 ? "batch6" : batch === 11 ? "batch11" : "batch7",
        reportBatchLabel = batch
    } = config;
    if (!generator || !Number.isInteger(batch)) throw new Error("invalid behavior batch audit config");

    const {
        BATCH_IDS, GENERATOR_VERSION, PILOT_IDS, MEASUREMENT_PATHS,
        SAFE_LIFECYCLE_PATHS, buildDataset, defaultDataRoot, defaultOutputRoot, stableJson
    } = generator;
    const defaultReportJson = path.join(repositoryRoot, "reports", `genshin-character-v2-behavior-batch-${batch}.json`);
    const defaultReportMarkdown = path.join(repositoryRoot, "reports", `genshin-character-v2-behavior-batch-${batch}.md`);
    const LIFECYCLE_PATHS = SAFE_LIFECYCLE_PATHS || new Set(["/lifecycle/refreshMode", "/lifecycle/expiration"]);
    const ALLOWED_UNITS = new Set(["seconds", "frames", "hits", "attacks", "charges", "instances", "points", "particles", "percent", "boolean", "enum", "unknown"]);
    const REFRESH_VALUES = new Set(["none", "refresh", "extend", "replace", "independent", "unknown"]);
    const EXPIRATION_VALUES = new Set(["duration", "triggerLimit", "consumed", "destroyed", "stateEnd", "unknown"]);
    const SAFE_MEASUREMENT_PATHS = new Set(MEASUREMENT_PATHS ? [...MEASUREMENT_PATHS.keys()] : []);

    function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
    function digest(value) { return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex"); }
    function digestFile(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
    function increment(map, key) { const name = String(key || "unknown"); map[name] = (map[name] || 0) + 1; }
    function duplicateValues(values) {
        const counts = new Map();
        (values || []).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
        return [...counts.entries()].filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
    }
    function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
    function containsNumber(value) {
        if (typeof value === "number") return true;
        if (Array.isArray(value)) return value.some(containsNumber);
        if (!value || typeof value !== "object") return false;
        return Object.values(value).some(containsNumber);
    }
    function isMeasurement(value) {
        return isObject(value) && Object.prototype.hasOwnProperty.call(value, "value")
            && Object.prototype.hasOwnProperty.call(value, "unit")
            && (mode === "batch5" ? Object.prototype.hasOwnProperty.call(value, "status") : value.status === "explicit")
            && Array.isArray(value.sourceRefs) && (mode === "batch5" || value.sourceRefs.length > 0);
    }
    function resolvePointer(document, pointer) {
        return String(pointer || "").split("/").slice(1).reduce((value, segment) => {
            const key = segment.replace(/~1/g, "/").replace(/~0/g, "~");
            return value == null ? undefined : value[key];
        }, document);
    }
    function emptyGenerated({ dataRoot = defaultDataRoot } = {}) { return { generatedFromDisk: false, ...buildDataset({ dataRoot }) }; }
    function loadGenerated({ dataRoot = defaultDataRoot, outputRoot = defaultOutputRoot } = {}) {
        const file = path.join(outputRoot, "manifest.json");
        if (!fs.existsSync(file)) return emptyGenerated({ dataRoot });
        return { ...readJson(file), generatedFromDisk: true, outputRoot };
    }
    function loadInventory(dataRoot) { return readJson(path.join(dataRoot, "v2", "characters", "behavior-inventory.json")); }
    function pathValue(spec, fieldPath) {
        if (String(fieldPath).startsWith("/lifecycle/")) return spec.lifecycle[String(fieldPath).slice("/lifecycle/".length)];
        const parts = String(fieldPath || "").replace(/^\//, "").split("/");
        return parts.length === 2 ? spec[parts[0]]?.[parts[1]] : undefined;
    }
    function candidateGroups(inventory, spec) {
        return (spec.inventoryCandidateIds || []).map((id) => inventory.candidates?.[id]).filter(Boolean);
    }

    function auditBehaviorBatch({ dataRoot = defaultDataRoot, outputRoot = defaultOutputRoot } = {}) {
        const generated = loadGenerated({ dataRoot, outputRoot });
        const expected = buildDataset({ dataRoot });
        const inventory = loadInventory(dataRoot);
        const errors = [];
        const malformedSources = [], malformedInventory = [], malformedSpecs = [], malformedByCharacter = [];
        const missingSourceRefs = [], missingInventoryRefs = [], inputDigestMismatches = [];
        const unknownFieldViolations = [], numericInferenceViolations = [], inventoryCandidateViolations = [], schemaViolations = [];
        const verificationCounts = {}, runtimeCounts = {}, sourceKindCounts = {};
        const sourceDocuments = {};
        const rawDocument = (dataset) => {
            if (!sourceDocuments[dataset]) sourceDocuments[dataset] = readJson(path.join(dataRoot, dataset));
            return sourceDocuments[dataset];
        };

        if (generated.schemaVersion !== 2) errors.push("schemaVersion must be 2");
        if (generated.kind !== "genshinBehaviorV2Batch") errors.push("unexpected behavior batch kind");
        if (generated.generator?.version !== GENERATOR_VERSION) errors.push("generator version mismatch");
        if (generated.batch !== batch || generated.summary?.batch !== batch) errors.push(mode === "batch5" ? "batch must be 5" : "batch metadata mismatch");
        if (stableJson(generated.batchIds || []) !== stableJson(BATCH_IDS)) errors.push(`batch IDs do not match fixed batch ${batch}${mode === "batch5" ? "" : " inventory"}`);
        if ((generated.batchIds || []).some((id) => PILOT_IDS.includes(id))) errors.push("batch contains a pilot ID");
        if (generated.policy?.canonical !== 0 || generated.policy?.runtimeConnection !== "forbidden" || generated.policy?.proseParsing !== "forbidden") errors.push("canonical/runtime policy violation");
        if (mode === "batch6") ["sourceInventoryCandidates", "explicitInventoryCandidates", "unknownInventoryCandidates"].forEach((field) => {
            if (!Number.isInteger(generated.summary?.[field])) errors.push(`standardized summary field missing ${field}`);
        });

        if (generated.generatedFromDisk) {
            const comparable = { ...generated };
            delete comparable.generatedFromDisk;
            delete comparable.outputRoot;
            if (stableJson(comparable) !== stableJson(expected)) errors.push("behavior batch artifact is not deterministic for current source files");
            [["sourceRecords", "source-records.json"], ["inventoryCandidates", "inventory-candidates.json"], ["specs", "spec-candidates.json"], ["modifiers", "modifiers.json"]].forEach(([key, name]) => {
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
            const file = path.join(dataRoot, relative);
            if (!fs.existsSync(file)) inputDigestMismatches.push({ path: input.path, reason: "missing" });
            else if (digestFile(file) !== input.integrity?.digest) inputDigestMismatches.push({ path: input.path, reason: "digestMismatch" });
        });

        Object.entries(generated.sourceRecords || {}).forEach(([id, source]) => {
            increment(sourceKindCounts, source?.kind);
            let pointerValue;
            try {
                const record = resolvePointer(rawDocument(source.locator?.dataset), source.locator?.record);
                pointerValue = source.locator?.field ? record?.[source.locator.field] : record;
            } catch (_) { pointerValue = undefined; }
            const expectedText = typeof pointerValue === "string" ? pointerValue : stableJson(pointerValue);
            const field = source?.locator?.field || "";
            const record = source?.locator?.record || "";
            const normalLocator = ["normalDescriptionJa", "chargedDescriptionJa", "plungingDescriptionJa"].includes(field) ? record.endsWith("/normalAttack") : true;
            const passiveIndex = source?.structuredValue?.passiveIndex;
            const passiveLocator = passiveIndex === undefined || (mode === "batch6" ? record.endsWith(`/passives/${passiveIndex}`) : record.includes(`/passives/${passiveIndex}`));
            const pointerOk = mode === "batch5" ? pointerValue !== undefined && source.text === expectedText : pointerValue !== undefined && source.text === expectedText;
            if (!source || source.id !== id || source.kind !== "primaryDataset" || source.provider !== "damageTool-local"
                || !source.locator?.dataset || !source.locator?.record || source.integrity?.algorithm !== "sha256"
                || source.integrity?.digest !== digest(source.text) || typeof source.text !== "string" || source.gameVersion !== null
                || !normalLocator || !passiveLocator || !pointerOk) malformedSources.push(id);
        });
        Object.entries(generated.inventoryCandidates || {}).forEach(([id, candidate]) => {
            if (!candidate || candidate.id !== id || !candidate.entity?.kind || !candidate.entity?.id || !candidate.entity?.component
                || candidate.status !== "needsReview" || candidate.unknown !== true || !Array.isArray(candidate.sourceRefs)
                || candidate.sourceRefs.length !== 1 || !candidate.sourcePointer) {
                malformedInventory.push(id);
                return;
            }
            candidate.sourceRefs.forEach((ref) => { if (!generated.sourceRecords?.[ref]) missingSourceRefs.push({ owner: id, sourceRef: ref }); });
            if (mode === "batch6" && candidate.sourcePointer.sourceId !== candidate.sourceRefs[0]) malformedInventory.push(`${id}:sourceId`);
            if (mode === "batch5") {
                const source = generated.sourceRecords[candidate.sourceRefs[0]];
                if (source && (source.locator.dataset !== candidate.sourcePointer.dataset || source.locator.record !== candidate.sourcePointer.record || source.locator.field !== candidate.sourcePointer.field)) malformedInventory.push(`${id}:pointer`);
            }
        });

        Object.entries(generated.specs || {}).forEach(([id, spec]) => {
            increment(verificationCounts, spec?.verification?.status);
            increment(runtimeCounts, spec?.runtime?.status);
            const rootKeys = new Set(["id", "entity", "sourceRefs", "interpretation", "timing", "execution", "lifecycle", "energy", "elementApplication", "unknownFields", "verification", "runtime", "inventoryCandidateId", "inventoryCandidateIds", "unknownCandidateIds"]);
            if (mode === "batch5") Object.keys(spec || {}).filter((key) => !rootKeys.has(key)).forEach((key) => schemaViolations.push(`${id}:root:${key}`));
            if (!spec || spec.id !== id || !spec.entity?.kind || !spec.entity?.id || !spec.entity?.component
                || !Array.isArray(spec.sourceRefs) || spec.sourceRefs.length !== 1 || !spec.interpretation
                || spec.interpretation.method !== "deterministicParser" || !spec.timing || !spec.execution || !spec.lifecycle || !spec.energy || !spec.elementApplication
                || spec.verification?.status !== "needsReview" || spec.verification.reviewedBy !== null || spec.verification.reviewedAt !== null
                || spec.verification.sourceAgreement !== "unknown" || !spec.verification.claims || !Array.isArray(spec.verification.discrepancies)
                || spec.runtime?.status !== "blocked" || !Array.isArray(spec.runtime.modifierIds) || spec.runtime.modifierIds.length !== 0 || spec.runtime.generator !== null
                || !Array.isArray(spec.unknownFields) || !spec.inventoryCandidateId || !generated.inventoryCandidates?.[spec.inventoryCandidateId]
                || !Array.isArray(spec.inventoryCandidateIds) || !Array.isArray(spec.unknownCandidateIds)) {
                malformedSpecs.push(id);
                return;
            }
            spec.sourceRefs.forEach((ref) => { if (!generated.sourceRecords?.[ref]) missingSourceRefs.push({ owner: id, sourceRef: ref }); });
            const seenCandidateIds = new Set();
            spec.inventoryCandidateIds.forEach((candidateId) => {
                if (seenCandidateIds.has(candidateId)) inventoryCandidateViolations.push({ owner: id, candidateId, reason: "duplicateCandidateId" });
                seenCandidateIds.add(candidateId);
                const candidate = inventory.candidates?.[candidateId];
                if (!candidate) missingInventoryRefs.push({ owner: id, candidateId });
                else if (candidate.entity?.id !== spec.entity.id || candidate.entity?.component !== spec.entity.component) inventoryCandidateViolations.push({ owner: id, candidateId, reason: "entityMismatch" });
            });
            spec.unknownCandidateIds.forEach((candidateId) => { const candidate = inventory.candidates?.[candidateId]; if (!candidate || candidate.status !== "unknown") inventoryCandidateViolations.push({ owner: id, candidateId, reason: "unknownStatusMismatch" }); });
            if (spec.inventoryCandidateIds.some((candidateId) => !spec.unknownCandidateIds.includes(candidateId) && inventory.candidates?.[candidateId]?.status !== "candidate")) inventoryCandidateViolations.push({ owner: id, reason: "candidateStatusMismatch" });
            if (mode === "batch6" && !spec.inventoryCandidateIds.includes(spec.inventoryCandidateId) && !spec.inventoryCandidateId.startsWith(`behavior-inventory:batch-${batch}:`)) inventoryCandidateViolations.push({ owner: id, reason: "localCandidatePointerMissing" });
            if (spec.unknownFields.includes("burstCost") && spec.energy.burstCost !== undefined) unknownFieldViolations.push(id);

            const sections = ["timing", "execution", "energy", "elementApplication"];
            sections.forEach((section) => Object.entries(spec[section] || {}).forEach(([field, measurement]) => {
                const fieldPath = `/${section}/${field}`;
                if (!SAFE_MEASUREMENT_PATHS.has(fieldPath) || !isMeasurement(measurement)
                    || (mode === "batch5" && (!ALLOWED_UNITS.has(measurement.unit) || !String(measurement.notes || "").includes("operation=")))) schemaViolations.push(`${id}:${fieldPath}`);
                (measurement.sourceRefs || []).forEach((ref) => { if (!generated.sourceRecords?.[ref]) missingSourceRefs.push({ owner: id, sourceRef: ref }); });
            }));
            if (!REFRESH_VALUES.has(spec.lifecycle.refreshMode) || !EXPIRATION_VALUES.has(spec.lifecycle.expiration)) schemaViolations.push(`${id}:lifecycle`);
            Object.values(spec.verification.claims).forEach((claim) => { if (claim.status !== "needsReview" || !Array.isArray(claim.sourceRefs) || !claim.sourceRefs.length) malformedSpecs.push(`${id}:claim`); });

            const evidence = candidateGroups(inventory, spec);
            const explicitByPath = new Map();
            evidence.filter((candidate) => candidate.status === "candidate").forEach((candidate) => { const list = explicitByPath.get(candidate.fieldPath) || []; list.push(candidate); explicitByPath.set(candidate.fieldPath, list); });
            explicitByPath.forEach((candidates, fieldPath) => {
                const mapped = pathValue(spec, fieldPath);
                const measurementOperations = mode === "batch11" ? ["set"] : ["set", "replace", "setMaximum"];
                if (candidates.length === 1 && candidates[0].value !== null && SAFE_MEASUREMENT_PATHS.has(fieldPath)
                    && measurementOperations.includes(candidates[0].operation)) {
                    if (!isMeasurement(mapped) || stableJson(mapped.value) !== stableJson(candidates[0].value) || mapped.unit !== candidates[0].unit) inventoryCandidateViolations.push({ owner: id, fieldPath, reason: "explicitValueNotCopied" });
                    if (!String(mapped?.notes || "").includes(`operation=${candidates[0].operation}`)) inventoryCandidateViolations.push({ owner: id, fieldPath, reason: "operationNotRetained" });
                } else if (candidates.length === 1 && LIFECYCLE_PATHS.has(fieldPath) && candidates[0].value !== null
                    && (mode === "batch11" ? candidates[0].operation === "set" : ["set", "replace"].includes(candidates[0].operation))) {
                    if (spec.lifecycle[fieldPath.slice("/lifecycle/".length)] !== candidates[0].value) inventoryCandidateViolations.push({ owner: id, fieldPath, reason: "lifecycleValueNotCopied" });
                } else if (candidates.length > 1) {
                    if (!spec.verification.discrepancies.some((entry) => entry.code === "INVENTORY_OPERATION_CONFLICT" && entry.fieldPath === fieldPath)) inventoryCandidateViolations.push({ owner: id, fieldPath, reason: "operationConflictNotRecorded" });
                } else if (candidates.length === 1 && (candidates[0].value === null || (mode === "batch11" && candidates[0].value === undefined))) {
                    const allowed = mode === "batch5" ? ["INVENTORY_NULL_RESET", "INVENTORY_NULL_VALUE"] : ["INVENTORY_NULL_RESET", "INVENTORY_OPERATION_REQUIRES_REVIEW", "INVENTORY_LIFECYCLE_VALUE_INVALID"];
                    if (!spec.verification.discrepancies.some((entry) => allowed.includes(entry.code) && entry.fieldPath === fieldPath)) inventoryCandidateViolations.push({ owner: id, fieldPath, reason: "nullResetNotRecorded" });
                } else if (mode !== "batch5" && candidates.length === 1 && !SAFE_MEASUREMENT_PATHS.has(fieldPath) && !LIFECYCLE_PATHS.has(fieldPath)
                    && !spec.verification.discrepancies.some((entry) => entry.code === "INVENTORY_FIELD_PATH_UNSUPPORTED" && entry.fieldPath === fieldPath)) inventoryCandidateViolations.push({ owner: id, fieldPath, reason: "unsupportedPathNotRecorded" });
            });
            if (mode === "batch5") evidence.filter((candidate) => candidate.status === "unknown").forEach((candidate) => {
                if (!spec.verification.discrepancies.some((entry) => entry.code === "BEHAVIOR_INVENTORY_UNKNOWN" && (entry.candidateId === candidate.id || entry.id === candidate.id))) inventoryCandidateViolations.push({ owner: id, candidateId: candidate.id, reason: "unknownNotRetained" });
            });
            sections.forEach((section) => Object.entries(spec[section] || {}).forEach(([field, measurement]) => {
                if (!containsNumber(measurement)) return;
                const fieldPath = `/${section}/${field}`;
                const candidates = explicitByPath.get(fieldPath) || [];
                if (!candidates.some((candidate) => stableJson(candidate.value) === stableJson(measurement.value) && candidate.unit === measurement.unit)) numericInferenceViolations.push(`${id}:${fieldPath}`);
            }));
        });

        Object.entries(generated.byCharacter || {}).forEach(([characterId, index]) => {
            if (!index || index.characterId !== characterId || index.canonical !== 0 || !Array.isArray(index.sourceRecordIds) || !Array.isArray(index.inventoryCandidateIds) || !Array.isArray(index.specIds) || !Array.isArray(index.modifierIds) || index.modifierIds.length !== 0) {
                malformedByCharacter.push(characterId);
                return;
            }
            index.sourceRecordIds.forEach((sourceId) => { if (!generated.sourceRecords?.[sourceId]) missingSourceRefs.push({ characterId, sourceId }); });
            index.inventoryCandidateIds.forEach((candidateId) => { if (!generated.inventoryCandidates?.[candidateId]) missingInventoryRefs.push({ characterId, candidateId }); });
            index.specIds.forEach((specId) => { if (!generated.specs?.[specId] || generated.specs[specId].entity?.id !== characterId) malformedByCharacter.push(`${characterId}:spec:${specId}`); });
        });
        if (duplicateValues(Object.keys(generated.sourceRecords || {})).length || duplicateValues(Object.keys(generated.inventoryCandidates || {})).length || duplicateValues(Object.keys(generated.specs || {})).length) errors.push("duplicate IDs detected");
        if (Object.keys(generated.modifiers || {}).length !== 0 || generated.summary?.modifiers !== 0 || generated.summary?.canonical !== 0) errors.push(mode === "batch5" ? "runtime modifiers/canonical must remain empty/zero" : "summary canonical/modifiers must remain zero");
        if (Object.keys(generated.byCharacter || {}).sort().join(",") !== [...BATCH_IDS].sort().join(",")) errors.push("byCharacter keys do not match batch IDs");
        if (missingSourceRefs.length || missingInventoryRefs.length || malformedSources.length || malformedInventory.length || malformedSpecs.length || malformedByCharacter.length || inputDigestMismatches.length || unknownFieldViolations.length || numericInferenceViolations.length || inventoryCandidateViolations.length || schemaViolations.length) errors.push("behavior batch coverage/contract failure");

        const summary = {
            schemaVersion: 2, status: errors.length ? "failed" : "passed", batch,
            batchCharacters: BATCH_IDS.length, sourceRecords: Object.keys(generated.sourceRecords || {}).length,
            inventoryCandidates: Object.keys(generated.inventoryCandidates || {}).length, specs: Object.keys(generated.specs || {}).length,
            modifiers: Object.keys(generated.modifiers || {}).length, canonical: 0,
            inventoryInputCandidates: generated.summary?.inventoryInputCandidates || 0,
            ...(mode === "batch5" ? { inventoryCandidateStatusCounts: generated.summary?.inventoryCandidateStatusCounts || {} } : {}),
            explicitCandidateOperations: generated.summary?.explicitCandidateOperations || 0, unknownCandidateIds: generated.summary?.unknownCandidateIds || 0,
            sourceInventoryCandidates: generated.summary?.sourceInventoryCandidates || 0, explicitInventoryCandidates: generated.summary?.explicitInventoryCandidates || 0, unknownInventoryCandidates: generated.summary?.unknownInventoryCandidates || 0,
            ...((mode === "batch6" || mode === "batch11") ? { inventoryExplicitCandidates: generated.summary?.inventoryExplicitCandidates || 0, inventoryUnknownCandidates: generated.summary?.inventoryUnknownCandidates || 0 } : {}),
            verificationByStatus: verificationCounts, runtimeByStatus: runtimeCounts, sourceKinds: sourceKindCounts,
            contract: {
                malformedSources: malformedSources.length, malformedInventory: malformedInventory.length, malformedSpecs: malformedSpecs.length, malformedByCharacter: malformedByCharacter.length,
                missingSourceRefs: missingSourceRefs.length, missingInventoryRefs: missingInventoryRefs.length, inputDigestMismatches: inputDigestMismatches.length,
                unknownFieldViolations: unknownFieldViolations.length, numericInferenceViolations: numericInferenceViolations.length, inventoryCandidateViolations: inventoryCandidateViolations.length, schemaViolations: schemaViolations.length
            },
            generatedFromDisk: Boolean(generated.generatedFromDisk), deterministic: !errors.includes("behavior batch artifact is not deterministic for current source files")
        };
        const characterCoverage = BATCH_IDS.map((characterId) => {
            const index = generated.byCharacter?.[characterId] || {};
            return { characterId, characterName: index.characterName || null, sourceRecords: index.sourceRecordIds?.length || 0, inventoryCandidates: index.inventoryCandidateIds?.length || 0, specs: index.specIds?.length || 0, inventoryInputCandidates: index.inventoryInputCandidateIds?.length || 0, explicitCandidateOperations: index.explicitCandidateIds?.length || 0, unknownCandidateIds: index.unknownCandidateIds?.length || 0, modifiers: index.modifierIds?.length || 0, canonical: index.canonical ?? null };
        });
        return { schemaVersion: 2, status: summary.status, summary, errors, malformedSources, malformedInventory, malformedSpecs, malformedByCharacter, missingSourceRefs, missingInventoryRefs, inputDigestMismatches, unknownFieldViolations, numericInferenceViolations, inventoryCandidateViolations, schemaViolations, characterCoverage, generatedFromDisk: Boolean(generated.generatedFromDisk) };
    }

    function markdownReport(report) {
        const summary = report.summary || {};
        const lines = [
            `# Genshin behavior v2 batch ${batch} audit`, "", `- Status: **${summary.status}**`,
            `- Fixed batch characters: ${summary.batchCharacters}`, `- Raw source records: ${summary.sourceRecords}`,
            mode === "batch5" ? `- Local raw-context candidates: ${summary.inventoryCandidates}` : `- Batch-local inventory candidates: ${summary.inventoryCandidates}`,
            mode === "batch5" ? `- Source inventory candidates: ${summary.sourceInventoryCandidates} (${summary.explicitInventoryCandidates} explicit / ${summary.unknownInventoryCandidates} unknown)` : `- Source inventory candidates: ${summary.sourceInventoryCandidates}`,
            ...(mode === "batch5" ? [] : [`- Explicit inventory candidates: ${summary.explicitInventoryCandidates}`, `- Unknown inventory candidates: ${summary.unknownInventoryCandidates}`]),
            `- Review-gated BehaviorSpec candidates: ${summary.specs}`, `- Runtime modifiers: ${summary.modifiers}`, `- Canonical records: ${summary.canonical}`,
            "", mode === "batch5" ? "Only singleton explicit set candidates are copied into schema measurements. Conflicts, nulls, and add/replace/setMaximum/extend operations remain discrepancies; raw pointers and runtime promotion remain review-gated." : mode === "batch6" ? "Explicit singleton inventory fields are copied only as review-gated schema measurements; conflicts, resets, add operations, and unknown signals remain discrepancies. Runtime connection is blocked." : "Explicit inventory fields are copied only as review-gated measurements; operation conflicts, resets, and unknown signals remain discrepancies. Runtime connection is blocked.",
            "", "## Character coverage", "", "| Character ID | Name | Sources | Inventory | Specs | Input candidates | Explicit | Unknown | Modifiers | Canonical |", "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
            ...(report.characterCoverage || []).map((entry) => `| ${entry.characterId} | ${entry.characterName || ""} | ${entry.sourceRecords} | ${entry.inventoryCandidates} | ${entry.specs} | ${entry.inventoryInputCandidates} | ${entry.explicitCandidateOperations} | ${entry.unknownCandidateIds} | ${entry.modifiers} | ${entry.canonical} |`),
            "", "## Contract", "", `- Deterministic: ${summary.deterministic}`, `- Errors: ${(report.errors || []).length}`
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
    return {
        [`auditBehaviorBatch${batch}`]: auditBehaviorBatch,
        [`auditGenshinCharacterV2BehaviorBatch${batch}`]: auditBehaviorBatch,
        auditBehaviorBatch,
        defaultReportJson,
        defaultReportMarkdown,
        duplicateValues,
        loadGenerated,
        markdownReport,
        writeReports
    };
}

module.exports = { createBehaviorBatchAudit };
