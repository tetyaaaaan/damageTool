"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { digestStable } = require("./genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const transitionRoot = path.join(repositoryRoot, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0");
const providerRoot = path.join(transitionRoot, "sources", "genshin-db");
const outputPath = path.join(transitionRoot, "affected-entity-snapshot.json");
const revisions = {
    before: {
        gameVersion: "6.7",
        revision: "1bab2cdba4d218fd5caa46b5f54e7884ee8359a2",
        manifestDigest: "5ded2b3bab58218da17f6a1282209e653c1ec7ecd9297b95569558a737c2e8f6",
        manifestBytes: 1619
    },
    after: {
        gameVersion: "7.0",
        revision: "8b15995fa220c88a4d0d7ffe1e21b041d0b32588",
        manifestDigest: "3faf0b2220539a07af9260f5dd83afd0e964aa42868c9b3b73c6cb14065085c6",
        manifestBytes: 1619
    }
};
const entities = [
    { entityId: "10000022", slug: "venti" },
    { entityId: "10000039", slug: "diona" },
    { entityId: "10000058", slug: "yaemiko" },
    { entityId: "10000071", slug: "cyno" }
];
const recordKinds = ["talents", "constellations"];

function sha256(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function sourcePath(revision, recordKind, slug) {
    return path.join(providerRoot, revision, "English", recordKind, `${slug}.json`);
}

async function fetchBytes(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`fetch failed ${response.status}: ${url}`);
    return Buffer.from(await response.arrayBuffer());
}

async function acquire() {
    for (const revision of Object.values(revisions)) {
        const root = path.join(providerRoot, revision.revision);
        fs.mkdirSync(root, { recursive: true });
        const manifest = await fetchBytes(`https://raw.githubusercontent.com/theBowja/genshin-db/${revision.revision}/package.json`);
        if (manifest.length !== revision.manifestBytes || sha256(manifest) !== revision.manifestDigest) throw new Error(`${revision.gameVersion} manifest binding mismatch`);
        fs.writeFileSync(path.join(root, "package.json"), manifest);
        for (const entity of entities) {
            for (const recordKind of recordKinds) {
                const bytes = await fetchBytes(`https://raw.githubusercontent.com/theBowja/genshin-db/${revision.revision}/src/data/English/${recordKind}/${entity.slug}.json`);
                const file = sourcePath(revision.revision, recordKind, entity.slug);
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file, bytes);
            }
        }
    }
}

function rawArtifact(revision, recordKind, entity) {
    const file = sourcePath(revision.revision, recordKind, entity.slug);
    const bytes = fs.readFileSync(file);
    return {
        path: path.relative(repositoryRoot, file).replaceAll("\\", "/"),
        url: `https://raw.githubusercontent.com/theBowja/genshin-db/${revision.revision}/src/data/English/${recordKind}/${entity.slug}.json`,
        rawArtifactBytes: bytes.length,
        rawArtifactDigest: sha256(bytes),
        value: JSON.parse(bytes.toString("utf8"))
    };
}

function pointerToken(value) {
    return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}

function fieldDiffs(before, after, pointer = "") {
    if (digestStable(before) === digestStable(after)) return [];
    const beforeObject = before && typeof before === "object";
    const afterObject = after && typeof after === "object";
    if (!beforeObject || !afterObject || Array.isArray(before) !== Array.isArray(after)) {
        return [{
            jsonPointer: pointer || "/",
            beforeValue: before === undefined ? null : before,
            afterValue: after === undefined ? null : after,
            beforeFieldDigest: digestStable(before === undefined ? null : before),
            afterFieldDigest: digestStable(after === undefined ? null : after)
        }];
    }
    const keys = Array.isArray(before) && Array.isArray(after)
        ? Array.from({ length: Math.max(before.length, after.length) }, (_, index) => String(index))
        : [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].sort();
    return keys.flatMap((key) => fieldDiffs(before?.[key], after?.[key], `${pointer}/${pointerToken(key)}`));
}

function buildSnapshot() {
    const records = entities.flatMap((entity) => recordKinds.map((recordKind) => {
        const before = rawArtifact(revisions.before, recordKind, entity);
        const after = rawArtifact(revisions.after, recordKind, entity);
        const diffs = fieldDiffs(before.value, after.value);
        return {
            entityId: entity.entityId,
            slug: entity.slug,
            recordKind,
            before: {
                gameVersion: revisions.before.gameVersion,
                revision: revisions.before.revision,
                path: before.path,
                url: before.url,
                rawArtifactBytes: before.rawArtifactBytes,
                rawArtifactDigest: before.rawArtifactDigest
            },
            after: {
                gameVersion: revisions.after.gameVersion,
                revision: revisions.after.revision,
                path: after.path,
                url: after.url,
                rawArtifactBytes: after.rawArtifactBytes,
                rawArtifactDigest: after.rawArtifactDigest
            },
            comparison: {
                status: diffs.length === 0 ? "rawRecordMatch" : "rawRecordChanged",
                changedFieldCount: diffs.length,
                fieldDiffs: diffs
            }
        };
    }));
    const claim = {
        transitionId: "genshin:6.7->7.0",
        provider: "genshin-db",
        sourceFamily: "GenshinData-derived",
        versionBindings: Object.values(revisions).map((revision) => ({
            gameVersion: revision.gameVersion,
            revision: revision.revision,
            status: "strictlyBound",
            manifestPath: path.relative(repositoryRoot, path.join(providerRoot, revision.revision, "package.json")).replaceAll("\\", "/"),
            manifestDigest: revision.manifestDigest
        })),
        records,
        coverage: {
            entityIds: entities.map((entity) => entity.entityId),
            recordKinds,
            officialAffectedEntityCoverage: "complete",
            repositoryCandidateCoverage: "partial",
            canSatisfyCompleteEntityDiff: false,
            canIssueEligibilityCertificate: false
        }
    };
    return {
        schemaVersion: 1,
        kind: "genshinVersionTransitionAffectedEntitySnapshot",
        generatedAt: "2026-08-26T00:00:00.000Z",
        claim,
        summary: {
            entities: entities.length,
            records: records.length,
            changedRecords: records.filter((record) => record.comparison.status === "rawRecordChanged").length,
            changedFields: records.reduce((total, record) => total + record.comparison.changedFieldCount, 0),
            certificateEligibleClaims: 0
        },
        gateEligibility: {
            status: "providerDiffOnlyFailClosed",
            canSatisfyCompleteEntityDiff: false,
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false
        },
        fieldDigestAlgorithm: "sha256-stable-json-v1",
        fieldDigest: digestStable(claim)
    };
}

function writeSnapshot() {
    const snapshot = buildSnapshot();
    fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    return snapshot;
}

async function main() {
    if (process.argv.includes("--fetch")) await acquire();
    process.stdout.write(`${JSON.stringify(writeSnapshot().summary, null, 2)}\n`);
}

if (require.main === module) main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
});

module.exports = { acquire, buildSnapshot, entities, outputPath, recordKinds, revisions, writeSnapshot };
