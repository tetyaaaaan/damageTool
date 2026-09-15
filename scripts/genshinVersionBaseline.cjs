"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { deriveCurrentGameVersion } = require("./genshinGameVersionPolicy.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultDataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultBaselinePath = path.join(defaultDataRoot, "v2", "version-baseline.json");
const defaultReportJsonPath = path.join(repositoryRoot, "reports", "genshin-version-drift-audit.json");
const defaultReportMarkdownPath = path.join(repositoryRoot, "reports", "genshin-version-drift-audit.md");
const GENERATOR_VERSION = "genshinVersionBaseline/1";
const TRACKED_DATASETS = Object.freeze([
    "characters.json",
    "character-talents.json",
    "character-constellations.json",
    "base-stats.json",
    "enemies.json",
    "weapons.json",
    "weapon-effects.json",
    "artifact-sets.json",
    "artifact-set-effects.json",
    "calc/reaction-definitions.json",
    "calc/talent-scalings.json",
    "calc/talent-modifiers.json",
    "calc/talent-effect-registry.json",
    "calc/constellation-modifiers.json",
    "calc/constellation-effect-registry.json",
    "calc/constellation-source-index.json",
    "calc/weapon-modifiers.json",
    "calc/weapon-effect-registry.json",
    "calc/artifact-set-modifiers.json",
    "calc/attack-mode-rules.json"
]);

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const stableValue = (value) => Array.isArray(value)
    ? value.map(stableValue)
    : value && typeof value === "object"
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
        : value;
const digest = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(stableValue(value))).digest("hex");

function datasetSnapshot(dataRoot, relativePath) {
    const file = path.join(dataRoot, relativePath);
    const bytes = fs.readFileSync(file);
    const value = JSON.parse(bytes.toString("utf8"));
    return {
        path: `games/genshin/data/${relativePath}`,
        digest: digest(bytes.toString("utf8")),
        entities: Object.fromEntries(Object.entries(value || {}).sort(([a], [b]) => a.localeCompare(b)).map(([id, entity]) => [id, digest(entity)]))
    };
}

function buildSnapshot({ dataRoot = defaultDataRoot } = {}) {
    const sourceCatalogPath = path.join(dataRoot, "v2", "source-catalog.json");
    const sourceCatalog = readJson(sourceCatalogPath);
    const snapshot = {
        schemaVersion: 1,
        kind: "genshinAcceptedVersionBaseline",
        generator: { name: "genshinVersionBaseline.cjs", version: GENERATOR_VERSION },
        targetGameVersion: deriveCurrentGameVersion(sourceCatalog),
        sourceCatalogDigest: digest(fs.readFileSync(sourceCatalogPath, "utf8")),
        datasets: Object.fromEntries(TRACKED_DATASETS.map((relativePath) => [relativePath, datasetSnapshot(dataRoot, relativePath)]))
    };
    return {
        ...snapshot,
        snapshotId: `genshin-version:${snapshot.targetGameVersion.gameVersion || "unbound"}:${digest(snapshot)}`,
        previousSnapshotId: null
    };
}

function validateBaseline(baseline) {
    const reasons = [];
    if (!baseline || typeof baseline !== "object") return { valid: false, reasons: ["baselineMissing"] };
    if (baseline.schemaVersion !== 1) reasons.push("schemaVersionInvalid");
    if (baseline.kind !== "genshinAcceptedVersionBaseline") reasons.push("kindInvalid");
    if (baseline.targetGameVersion?.status !== "strictlyBound" || !parseVersion(baseline.targetGameVersion?.gameVersion)) reasons.push("targetGameVersionInvalid");
    if (!/^[a-f0-9]{64}$/.test(baseline.sourceCatalogDigest || "")) reasons.push("sourceCatalogDigestInvalid");
    if (!baseline.datasets || typeof baseline.datasets !== "object" || Array.isArray(baseline.datasets)) reasons.push("datasetsInvalid");
    const core = {
        schemaVersion: baseline.schemaVersion,
        kind: baseline.kind,
        generator: baseline.generator,
        targetGameVersion: baseline.targetGameVersion,
        sourceCatalogDigest: baseline.sourceCatalogDigest,
        datasets: baseline.datasets
    };
    const expectedSnapshotId = `genshin-version:${baseline.targetGameVersion?.gameVersion || "unbound"}:${digest(core)}`;
    if (baseline.snapshotId !== expectedSnapshotId) reasons.push("snapshotIdInvalid");
    return { valid: reasons.length === 0, reasons, expectedSnapshotId };
}

function parseVersion(value) {
    return typeof value === "string" && /^\d+(?:\.\d+)*$/.test(value);
}

function diffSnapshots(baseline, current) {
    const changes = [];
    if (baseline?.targetGameVersion?.gameVersion !== current?.targetGameVersion?.gameVersion) {
        changes.push({ kind: "targetGameVersionChanged", before: baseline?.targetGameVersion?.gameVersion || null, after: current?.targetGameVersion?.gameVersion || null });
    }
    if (baseline?.sourceCatalogDigest !== current?.sourceCatalogDigest) changes.push({ kind: "sourceCatalogChanged", dataset: "v2/source-catalog.json" });
    const datasetNames = [...new Set([...Object.keys(baseline?.datasets || {}), ...Object.keys(current?.datasets || {})])].sort();
    datasetNames.forEach((dataset) => {
        const before = baseline?.datasets?.[dataset];
        const after = current?.datasets?.[dataset];
        if (!before || !after) {
            changes.push({ kind: before ? "datasetRemoved" : "datasetAdded", dataset });
            return;
        }
        if (before.digest === after.digest) return;
        const entityIds = [...new Set([...Object.keys(before.entities || {}), ...Object.keys(after.entities || {})])].sort();
        entityIds.forEach((entityId) => {
            if (before.entities?.[entityId] === after.entities?.[entityId]) return;
            changes.push({
                kind: before.entities?.[entityId] === undefined ? "entityAdded" : after.entities?.[entityId] === undefined ? "entityRemoved" : "entityChanged",
                dataset,
                entityId,
                beforeDigest: before.entities?.[entityId] || null,
                afterDigest: after.entities?.[entityId] || null
            });
        });
    });
    return changes;
}

function auditBaseline({ dataRoot = defaultDataRoot, baselinePath = defaultBaselinePath } = {}) {
    const current = buildSnapshot({ dataRoot });
    const baseline = fs.existsSync(baselinePath) ? readJson(baselinePath) : null;
    const validity = validateBaseline(baseline);
    const changes = baseline ? diffSnapshots(baseline, current) : [{ kind: "baselineMissing" }];
    validity.reasons.filter((reason) => reason !== "baselineMissing").forEach((reason) => changes.unshift({ kind: "baselineInvalid", reason }));
    return {
        schemaVersion: 1,
        kind: "genshinVersionDriftAudit",
        generator: GENERATOR_VERSION,
        status: changes.length ? "driftDetected" : "current",
        canonicalGateOpen: validity.valid && changes.length === 0 && current.targetGameVersion.status === "strictlyBound",
        acceptedSnapshotId: baseline?.snapshotId || null,
        acceptedSourceCatalogDigest: baseline?.sourceCatalogDigest || null,
        acceptedBaselineDigest: baseline ? digest(baseline) : null,
        currentSnapshotId: current.snapshotId,
        targetGameVersion: current.targetGameVersion,
        changes,
        nextSteps: changes.length ? [
            "Regenerate affected Raw -> Spec candidates and field evidence.",
            "Invalidate prior certificates/reviews whose source revision, digest, field value, scope, or gameVersion changed.",
            "Re-run deterministic verification, Runtime generation, consumer tests, and only then accept a new baseline."
        ] : []
    };
}

function markdown(report) {
    return [
        "# Genshin version drift audit", "",
        `Status: **${report.status}**`, "",
        `Current strictly-bound game version: **${report.targetGameVersion.gameVersion || "unbound"}**`, "",
        `Canonical gate: **${report.canonicalGateOpen ? "open" : "closed"}**`, "",
        `Detected changes: **${report.changes.length}**`, "",
        ...report.changes.map((item) => `- ${item.kind}${item.dataset ? `: ${item.dataset}` : ""}${item.entityId ? `#${item.entityId}` : ""}`),
        ""
    ].join("\n");
}

function assertBaselineReplacementAllowed(previous, current, acceptDrift = false) {
    if (previous?.snapshotId && previous.snapshotId !== current.snapshotId && acceptDrift !== true) {
        throw new Error("accepted baseline differs; inspect the drift audit and pass acceptDrift only after affected Spec, Runtime, canonical, legacy, UI, and regression validation");
    }
}

function writeBaseline({ dataRoot = defaultDataRoot, baselinePath = defaultBaselinePath, acceptDrift = false } = {}) {
    const previous = fs.existsSync(baselinePath) ? readJson(baselinePath) : null;
    const current = buildSnapshot({ dataRoot });
    assertBaselineReplacementAllowed(previous, current, acceptDrift);
    const snapshot = { ...current, previousSnapshotId: previous?.snapshotId && previous.snapshotId !== current.snapshotId ? previous.snapshotId : previous?.previousSnapshotId || null };
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    if (previous?.snapshotId && previous.snapshotId !== current.snapshotId) {
        const archiveRoot = path.join(path.dirname(baselinePath), "version-snapshots");
        const archiveName = `${previous.snapshotId.replace(/[^a-zA-Z0-9._-]/g, "_")}.json`;
        fs.mkdirSync(archiveRoot, { recursive: true });
        const archivePath = path.join(archiveRoot, archiveName);
        if (!fs.existsSync(archivePath)) fs.writeFileSync(archivePath, `${JSON.stringify(previous, null, 2)}\n`, "utf8");
    }
    fs.writeFileSync(baselinePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    return snapshot;
}

function writeAudit({ dataRoot = defaultDataRoot, baselinePath = defaultBaselinePath, reportJsonPath = defaultReportJsonPath, reportMarkdownPath = defaultReportMarkdownPath } = {}) {
    const report = auditBaseline({ dataRoot, baselinePath });
    fs.mkdirSync(path.dirname(reportJsonPath), { recursive: true });
    fs.writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    fs.writeFileSync(reportMarkdownPath, markdown(report), "utf8");
    return report;
}

if (require.main === module) {
    if (process.argv.includes("--write-baseline")) writeBaseline({ acceptDrift: process.argv.includes("--accept-drift") });
    const report = writeAudit();
    process.stdout.write(`${JSON.stringify({ status: report.status, canonicalGateOpen: report.canonicalGateOpen, changes: report.changes.length }, null, 2)}\n`);
    if (!report.canonicalGateOpen) process.exitCode = 1;
}

module.exports = { GENERATOR_VERSION, TRACKED_DATASETS, assertBaselineReplacementAllowed, auditBaseline, buildSnapshot, diffSnapshots, validateBaseline, writeAudit, writeBaseline };
