"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultDataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultBatchesRoot = path.join(defaultDataRoot, "v2", "characters");
const defaultOutputRoot = path.join(defaultBatchesRoot, "behavior-batches");
const defaultReportJson = path.join(repositoryRoot, "reports", "genshin-character-v2-behavior-batches.json");
const defaultReportMarkdown = path.join(repositoryRoot, "reports", "genshin-character-v2-behavior-batches.md");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const stableClone = (value) => Array.isArray(value) ? value.map(stableClone)
    : isObject(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableClone(value[key])])) : value;
const stableJson = (value) => JSON.stringify(stableClone(value));

function resolvePointer(document, pointer) {
    return String(pointer || "").split("/").slice(1).reduce((value, segment) => {
        const key = segment.replace(/~1/g, "/").replace(/~0/g, "~");
        return value == null ? undefined : value[key];
    }, document);
}

function discoverBatches({ batchesRoot = defaultBatchesRoot } = {}) {
    if (!fs.existsSync(batchesRoot)) return [];
    return fs.readdirSync(batchesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^behavior-batch-\d+$/.test(entry.name))
        .map((entry) => ({
            batch: Number(entry.name.slice("behavior-batch-".length)),
            directory: entry.name,
            manifestPath: path.join(batchesRoot, entry.name, "manifest.json")
        }))
        .sort((left, right) => left.batch - right.batch);
}

function auditBehaviorBatches({ dataRoot = defaultDataRoot, batchesRoot = defaultBatchesRoot } = {}) {
    const errors = [];
    const characters = readJson(path.join(dataRoot, "characters.json"));
    const pilot = readJson(path.join(dataRoot, "v2", "characters", "behavior-pilot.json"));
    const behaviorSchema = readJson(path.join(dataRoot, "schema", "behavior-spec.schema.json"));
    const allowedSpecKeys = new Set(Object.keys(behaviorSchema.properties || {}));
    const allowedVerificationKeys = new Set(Object.keys(behaviorSchema.properties?.verification?.properties || {}));
    const rawDocuments = {};
    const rawDocument = (dataset) => {
        if (!rawDocuments[dataset]) rawDocuments[dataset] = readJson(path.join(dataRoot, dataset));
        return rawDocuments[dataset];
    };
    const pilotIds = new Set(pilot.pilotIds || []);
    const expectedExpansionIds = Object.keys(characters).filter((id) => !pilotIds.has(id)).sort((a, b) => Number(a) - Number(b));
    const discovered = discoverBatches({ batchesRoot });
    const manifests = discovered.map((entry, index) => {
        if (entry.batch !== index + 1) errors.push(`batch sequence gap: expected ${index + 1}, found ${entry.batch}`);
        if (!fs.existsSync(entry.manifestPath)) {
            errors.push(`${entry.directory}/manifest.json is missing`);
            return { ...entry, manifest: null };
        }
        return { ...entry, manifest: readJson(entry.manifestPath), digest: sha256(entry.manifestPath) };
    });
    const ids = [];
    const seen = new Set();
    let sourceRecords = 0;
    let inventoryCandidates = 0;
    let specs = 0;
    let modifiers = 0;
    let canonical = 0;
    let explicitMeasurements = 0;
    let sourceInventoryCandidates = 0;
    let unknownInventoryCandidates = 0;
    manifests.forEach(({ batch, directory, manifest }) => {
        if (!manifest) return;
        if (manifest.schemaVersion !== 2 || manifest.kind !== "genshinBehaviorV2Batch") errors.push(`${directory}: invalid contract`);
        if (manifest.batch !== batch || manifest.summary?.batch !== batch) errors.push(`${directory}: batch metadata mismatch`);
        if (manifest.policy?.canonical !== 0 || manifest.policy?.runtimeConnection !== "forbidden") errors.push(`${directory}: unsafe runtime policy`);
        if (Object.keys(manifest.modifiers || {}).length || manifest.summary?.modifiers !== 0 || manifest.summary?.canonical !== 0) errors.push(`${directory}: runtime/canonical must remain zero`);
        const localInventoryCount = Object.keys(manifest.inventoryCandidates || {}).length;
        const specCount = Object.keys(manifest.specs || {}).length;
        if (localInventoryCount !== specCount || Number(manifest.summary?.inventoryCandidates) !== localInventoryCount) errors.push(`${directory}: batch-local inventory/spec count mismatch`);
        ["sourceInventoryCandidates", "explicitInventoryCandidates", "unknownInventoryCandidates"].forEach((field) => {
            if (!Number.isInteger(manifest.summary?.[field])) errors.push(`${directory}: standardized summary field missing ${field}`);
        });
        (manifest.batchIds || []).forEach((id) => {
            if (seen.has(id)) errors.push(`${directory}: duplicate character ${id}`);
            if (pilotIds.has(id)) errors.push(`${directory}: pilot character repeated ${id}`);
            seen.add(id);
            ids.push(id);
        });
        Object.values(manifest.specs || {}).forEach((spec) => {
            if (spec.verification?.status !== "needsReview" || spec.runtime?.status !== "blocked" || spec.runtime?.modifierIds?.length) {
                errors.push(`${directory}: non-gated spec ${spec.id || "unknown"}`);
            }
            Object.keys(spec).filter((key) => !allowedSpecKeys.has(key)).forEach((key) => errors.push(`${directory}: schema root property not allowed ${spec.id}.${key}`));
            Object.keys(spec.verification || {}).filter((key) => !allowedVerificationKeys.has(key)).forEach((key) => errors.push(`${directory}: schema verification property not allowed ${spec.id}.${key}`));
            ["timing", "execution", "energy", "elementApplication"].forEach((section) => {
                const allowedFields = new Set(Object.keys(behaviorSchema.properties?.[section]?.properties || {}));
                Object.entries(spec[section] || {}).forEach(([field, measurement]) => {
                    if (!allowedFields.has(field)) errors.push(`${directory}: schema ${section} property not allowed ${spec.id}.${field}`);
                    if (measurement?.status === "explicit") explicitMeasurements += 1;
                    if (!Array.isArray(measurement?.sourceRefs) || !measurement.sourceRefs.length) errors.push(`${directory}: measurement source missing ${spec.id}.${section}.${field}`);
                });
            });
        });
        Object.values(manifest.sourceRecords || {}).forEach((source) => {
            try {
                const record = resolvePointer(rawDocument(source.locator?.dataset), source.locator?.record);
                const value = source.locator?.field ? record?.[source.locator.field] : record;
                const expectedText = typeof value === "string" ? value : stableJson(value);
                if (value === undefined || source.text !== expectedText) errors.push(`${directory}: unresolved or mismatched raw pointer ${source.id}`);
            } catch (error) {
                errors.push(`${directory}: raw pointer error ${source.id}: ${error.message}`);
            }
        });
        sourceRecords += Number(manifest.summary?.sourceRecords || 0);
        inventoryCandidates += localInventoryCount;
        specs += specCount;
        modifiers += Number(manifest.summary?.modifiers || 0);
        canonical += Number(manifest.summary?.canonical || 0);
        sourceInventoryCandidates += Number(manifest.summary?.sourceInventoryCandidates || 0);
        unknownInventoryCandidates += Number(manifest.summary?.unknownInventoryCandidates || 0);
    });
    const expectedPrefix = expectedExpansionIds.slice(0, ids.length);
    if (JSON.stringify(ids) !== JSON.stringify(expectedPrefix)) errors.push("batch IDs are not one contiguous sorted non-pilot prefix");
    const remainingIds = expectedExpansionIds.slice(ids.length);
    const summary = {
        batches: manifests.length,
        batchCharacters: ids.length,
        pilotCharacters: pilotIds.size,
        totalCharacters: Object.keys(characters).length,
        expansionCharacters: expectedExpansionIds.length,
        remainingCharacters: remainingIds.length,
        sourceRecords,
        inventoryCandidates,
        specs,
        modifiers,
        canonical,
        sourceInventoryCandidates,
        unknownInventoryCandidates,
        explicitMeasurements,
        needsReview: specs,
        runtimeBlocked: specs
    };
    return {
        schemaVersion: 2,
        kind: "genshinBehaviorV2BatchesAudit",
        generatedAt: "2026-08-15T00:00:00.000Z",
        status: errors.length ? "failed" : "passed",
        policy: {
            order: "contiguous sorted non-pilot character IDs",
            inference: "forbidden",
            canonical: 0,
            runtime: "blocked until verified"
        },
        summary,
        batchIds: ids,
        remainingIds,
        batches: manifests.map(({ batch, directory, digest, manifest }) => ({
            batch,
            directory,
            digest: digest || null,
            characterIds: manifest?.batchIds || [],
            sourceRecords: manifest?.summary?.sourceRecords || 0,
            specs: manifest?.summary?.specs || 0,
            canonical: manifest?.summary?.canonical || 0
        })),
        errors
    };
}

function markdown(report) {
    return [
        "# Genshin character BehaviorSpec batch audit",
        "",
        `- Status: **${report.status}**`,
        `- Completed batches: **${report.summary.batches}**`,
        `- Normalized non-pilot characters: **${report.summary.batchCharacters} / ${report.summary.expansionCharacters}**`,
        `- Remaining characters: **${report.summary.remainingCharacters}**`,
        `- SourceRecords: **${report.summary.sourceRecords}**`,
        `- BehaviorSpecs: **${report.summary.specs}** (all needsReview / Runtime blocked)`,
        `- Inventory candidates linked: **${report.summary.sourceInventoryCandidates}** (${report.summary.unknownInventoryCandidates} unknown)`,
        `- Explicit schema measurements retained: **${report.summary.explicitMeasurements}**`,
        `- Canonical: **${report.summary.canonical}**`,
        "",
        "| Batch | Characters | Sources | Specs | Canonical |",
        "| ---: | ---: | ---: | ---: | ---: |",
        ...report.batches.map((batch) => `| ${batch.batch} | ${batch.characterIds.length} | ${batch.sourceRecords} | ${batch.specs} | ${batch.canonical} |`),
        "",
        "Batches must form one sorted, non-overlapping prefix after excluding the eight pilot characters. Unknown values remain unknown; this audit never promotes candidates.",
        ""
    ].join("\n");
}

function writeArtifacts({ report = auditBehaviorBatches(), outputRoot = defaultOutputRoot, reportJson = defaultReportJson, reportMarkdown = defaultReportMarkdown } = {}) {
    fs.mkdirSync(outputRoot, { recursive: true });
    fs.mkdirSync(path.dirname(reportJson), { recursive: true });
    fs.writeFileSync(path.join(outputRoot, "index.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    fs.writeFileSync(reportJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    fs.writeFileSync(reportMarkdown, markdown(report), "utf8");
    return report;
}

if (require.main === module) {
    const report = writeArtifacts();
    process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
    if (report.errors.length) process.exitCode = 1;
}

module.exports = { auditBehaviorBatches, discoverBatches, markdown, writeArtifacts };
