const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DATA_ROOT = path.join(ROOT, "games", "genshin", "data");

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function resolvePointer(document, pointer) {
    return String(pointer || "").split("/").slice(1).reduce((value, segment) => {
        const key = segment.replace(/~1/g, "/").replace(/~0/g, "~");
        return value == null ? undefined : value[key];
    }, document);
}

function collectModifiers(data) {
    const records = [];
    function walk(value, entityId = "") {
        if (Array.isArray(value)) return value.forEach((item) => walk(item, entityId));
        if (!value || typeof value !== "object") return;
        if (typeof value.category === "string") {
            records.push({ entityId, record: value });
            return;
        }
        Object.entries(value).forEach(([key, child]) => walk(child, entityId || key));
    }
    walk(data);
    return records;
}

function audit() {
    const manifest = readJson(path.join(DATA_ROOT, "data-v2-manifest.json"));
    const datasets = Object.fromEntries(Object.entries(manifest.datasets).map(([id, metadata]) => [
        id,
        { metadata, document: readJson(path.join(DATA_ROOT, metadata.path)) }
    ]));
    const errors = [];
    const packages = manifest.characterPackages.map((relativePath) => {
        const packageDocument = readJson(path.join(DATA_ROOT, relativePath));
        if (packageDocument.schemaVersion !== 2) errors.push(`${relativePath}: schemaVersion must be 2`);
        for (const [layer, references] of Object.entries(packageDocument.layers || {})) {
            for (const reference of references || []) {
                const dataset = datasets[reference.dataset];
                if (!dataset) {
                    errors.push(`${relativePath}: unknown dataset ${reference.dataset}`);
                    continue;
                }
                if (dataset.metadata.layer !== layer) {
                    errors.push(`${relativePath}: ${reference.dataset} is ${dataset.metadata.layer}, not ${layer}`);
                }
                if (resolvePointer(dataset.document, reference.pointer) === undefined) {
                    errors.push(`${relativePath}: unresolved pointer ${reference.dataset}${reference.pointer}`);
                }
            }
        }
        return packageDocument;
    });

    const runtimeDatasets = Object.entries(datasets).filter(([, value]) => value.metadata.layer === "runtime");
    const runtimeRecords = runtimeDatasets.flatMap(([datasetId, value]) => (
        collectModifiers(value.document).map((item) => ({ datasetId, ...item }))
    ));
    const provenanceCounts = runtimeRecords.reduce((counts, item) => {
        const status = item.record?.provenance?.verification?.status || "legacyCompatible";
        counts[status] = (counts[status] || 0) + 1;
        return counts;
    }, {});

    return {
        schemaVersion: 2,
        status: errors.length ? "failed" : "passed",
        errors,
        summary: {
            datasets: Object.keys(datasets).length,
            characterPackages: packages.length,
            runtimeRecords: runtimeRecords.length,
            provenanceCounts
        }
    };
}

if (require.main === module) {
    const result = audit();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.errors.length) process.exitCode = 1;
}

module.exports = { audit, collectModifiers, resolvePointer };
