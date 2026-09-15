"use strict";

/**
 * Capture the next authoritative behaviorSpec queue shard after shard 03.
 *
 * The authoritative queue is used only to bind shard identity and coverage.
 * This file materializes source bytes for the new entities in shard 04 and
 * leaves the first entity (10000036) as an explicit overlap with shard 03.
 * No prose is parsed, no field is inferred, and no Runtime/canonical value is
 * produced by this capture.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const base = require("./genshinVersionTransitionBehaviorEntityCapture.cjs");
const { digestStable } = require("./genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const transitionRoot = path.join(repositoryRoot, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0");
const providerRoot = path.join(transitionRoot, "sources", "genshin-db");
const queuePath = path.join(repositoryRoot, "reports", "genshin-evidence-task-queue.json");
const outputPath = path.join(transitionRoot, "behavior-shard-04-snapshot.json");
const checkpointPath = path.join(transitionRoot, "behavior-shard-04-capture-checkpoint.json");
const generatedAt = "2026-08-26T00:00:00.000Z";
const repository = "theBowja/genshin-db";
const sourceFamily = "GenshinData-derived";
const recordKinds = ["talents", "constellations"];
const shardId = "behavior:behaviorSpec:semanticDecisionRequired:standard:04";
const overlapEntityIds = ["10000036"];

// These provider slugs were resolved as concrete entries in the pinned
// non-recursive Git trees.  They are not generated from Japanese display
// names or fuzzy matching.
const resolvedEntities = [
    { entityId: "10000037", name: "Ganyu", nameJa: "甘雨", slug: "ganyu" },
    { entityId: "10000038", name: "Albedo", nameJa: "アルベド", slug: "albedo" },
    { entityId: "10000041", name: "Mona", nameJa: "モナ", slug: "mona" },
    { entityId: "10000042", name: "Keqing", nameJa: "刻晴", slug: "keqing" },
    { entityId: "10000043", name: "Sucrose", nameJa: "スクロース", slug: "sucrose" },
    { entityId: "10000044", name: "Xinyan", nameJa: "辛炎", slug: "xinyan" },
    { entityId: "10000045", name: "Rosaria", nameJa: "ロサリア", slug: "rosaria" },
    { entityId: "10000046", name: "Hu Tao", nameJa: "胡桃", slug: "hutao" }
];

function sha256(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function relative(file) {
    return path.relative(repositoryRoot, file).replaceAll("\\", "/");
}

function sourcePath(revision, recordKind, slug) {
    return path.join(providerRoot, revision, "English", recordKind, `${slug}.json`);
}

function sourceUrl(revision, recordKind, slug) {
    return `https://raw.githubusercontent.com/${repository}/${revision}/src/data/English/${recordKind}/${slug}.json`;
}

function queueShard() {
    const queue = readJson(queuePath);
    const cluster = (queue.unlockClusters || []).find((item) => item.domain === "behavior" && item.layer === "behaviorSpec");
    const shard = cluster?.shards?.find((item) => item.shardId === shardId);
    if (!shard || !Array.isArray(shard.candidateIds) || shard.candidateIds.length === 0) throw new Error(`authoritative queue shard missing: ${shardId}`);
    const candidateIds = shard.candidateIds.map(String);
    const entityIds = [...new Set(candidateIds.map((candidateId) => candidateId.split(":")[1]))];
    return {
        shardId,
        candidateIds,
        candidateIdsDigest: digestStable(candidateIds),
        entityIds,
        path: relative(queuePath)
    };
}

async function fetchBytes(url) {
    const response = await fetch(url, { headers: { "User-Agent": "damageTool-genshin-behavior-shard-04" } });
    if (!response.ok) {
        const error = new Error(`fetch failed ${response.status}: ${url}`);
        error.status = response.status;
        throw error;
    }
    return Buffer.from(await response.arrayBuffer());
}

async function acquire() {
    // Package manifests are shared immutable evidence already captured for
    // the transition.  Only create one if a fresh checkout lacks it.
    for (const revision of Object.values(base.revisions)) {
        const manifest = path.join(providerRoot, revision.revision, "package.json");
        if (!fs.existsSync(manifest)) {
            const bytes = await fetchBytes(`https://raw.githubusercontent.com/${repository}/${revision.revision}/package.json`);
            fs.mkdirSync(path.dirname(manifest), { recursive: true });
            fs.writeFileSync(manifest, bytes);
        }
    }
    for (const entity of resolvedEntities) {
        for (const revision of Object.values(base.revisions)) {
            for (const recordKind of recordKinds) {
                const bytes = await fetchBytes(sourceUrl(revision.revision, recordKind, entity.slug));
                const file = sourcePath(revision.revision, recordKind, entity.slug);
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file, bytes);
            }
        }
    }
}

function stripValues(record) {
    const clone = JSON.parse(JSON.stringify(record));
    delete clone.before.value;
    delete clone.after.value;
    return clone;
}

function buildEntity(entity) {
    return {
        entityId: entity.entityId,
        name: entity.name,
        nameJa: entity.nameJa,
        providerSlug: entity.slug,
        resolutionStatus: "resolvedUnambiguous",
        treeResolution: {
            method: "nonRecursiveGitTreePath",
            directoryPaths: recordKinds.map((recordKind) => `src/data/English/${recordKind}`),
            pathResolution: recordKinds.map((recordKind) => ({
                recordKind,
                path: `src/data/English/${recordKind}/${entity.slug}.json`
            }))
        },
        records: base.behaviorRecords(entity.slug).map(stripValues)
    };
}

function buildSnapshot() {
    const queue = queueShard();
    const expectedEntityIds = [...new Set(queue.entityIds)];
    const skipped = expectedEntityIds.filter((entityId) => overlapEntityIds.includes(entityId));
    const capturedEntityIds = resolvedEntities.map((entity) => entity.entityId);
    const unknownCaptured = capturedEntityIds.filter((entityId) => !expectedEntityIds.includes(entityId));
    const missingNew = expectedEntityIds.filter((entityId) => !overlapEntityIds.includes(entityId) && !capturedEntityIds.includes(entityId));
    if (unknownCaptured.length || missingNew.length || skipped.sort().join(",") !== overlapEntityIds.slice().sort().join(",")) {
        throw new Error(`shard entity coverage mismatch unknown=${unknownCaptured.join(",")} missing=${missingNew.join(",")} overlap=${skipped.join(",")}`);
    }
    const entities = resolvedEntities.map(buildEntity);
    const records = entities.flatMap((entity) => entity.records);
    const changedRecords = records.filter((record) => record.comparison.status === "rawRecordChanged");
    const changedFields = records.reduce((sum, record) => sum + record.comparison.changedFieldCount, 0);
    const claim = {
        transitionId: "genshin:6.7->7.0",
        fromGameVersion: base.revisions.before.gameVersion,
        toGameVersion: base.revisions.after.gameVersion,
        provider: "genshin-db",
        sourceFamily,
        repository,
        treeResolution: {
            method: "nonRecursiveGitTreePath",
            note: "Each captured path is a concrete entry under src/data/English/{talents,constellations}; no recursive tree result or fuzzy name match is used."
        },
        shard: {
            shardId,
            queuePath: queue.path,
            authoritativeCandidateCount: queue.candidateIds.length,
            authoritativeCandidateIds: queue.candidateIds,
            authoritativeCandidateIdsDigest: queue.candidateIdsDigest,
            authoritativeEntityIds: expectedEntityIds,
            capturedNewEntityIds: capturedEntityIds,
            skippedOverlapEntityIds: overlapEntityIds,
            overlapPolicy: "alreadyCapturedByBehaviorShard03"
        },
        versionBindings: Object.values(base.revisions).map((revision) => ({
            gameVersion: revision.gameVersion,
            revision: revision.revision,
            packageVersion: revision.packageVersion,
            status: "strictlyBound",
            package: base.packageEvidence(revision)
        })),
        resolvedEntities: entities,
        travelerVariantEvidence: [],
        variantAmbiguities: [],
        coverage: {
            resolvedEntityIds: capturedEntityIds,
            ambiguousEntityIds: [],
            recordKinds,
            authoritativeCandidateCoverage: "entitySourceRecordsForNewEntitiesComplete",
            resolvedEntityRecordCoverage: "complete",
            travelerVariantRecordCoverage: "notApplicable",
            repositoryCandidateCoverage: "partial",
            authoritativeCandidateCount: queue.candidateIds.length,
            overlapEntityCount: overlapEntityIds.length,
            crossVariantComparisons: 0,
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false
        }
    };
    return {
        schemaVersion: 1,
        kind: "genshinVersionTransitionBehaviorShardSnapshot",
        generatedAt,
        claim,
        summary: {
            shardId,
            authoritativeCandidates: queue.candidateIds.length,
            authoritativeEntities: expectedEntityIds.length,
            resolvedEntities: entities.length,
            overlapSkippedEntities: overlapEntityIds.length,
            ambiguousEntities: 0,
            resolvedRecords: records.length,
            changedRecords: changedRecords.length,
            changedFields,
            sourceFamilyCount: 1,
            certificateEligibleClaims: 0
        },
        gateEligibility: {
            status: "singleCorrelatedFamilyFailClosed",
            sourceFamilyCount: 1,
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false,
            reasons: ["providerIndependenceInsufficient", "behaviorSemanticsNotParsed", "shardOverlapRetained"]
        },
        fieldDigestAlgorithm: "sha256-stable-json-v1",
        fieldDigest: digestStable(claim)
    };
}

function validateArtifact(candidate, expectedRevision, expectedRecordKind, expectedSlug, root) {
    const reasons = [];
    const file = candidate?.path ? path.resolve(root, candidate.path) : null;
    const expected = sourcePath(expectedRevision.revision, expectedRecordKind, expectedSlug);
    if (!file || path.resolve(file) !== path.resolve(expected)) reasons.push("pathMismatch");
    if (!file || !fs.existsSync(file)) return [...reasons, "missing"];
    const bytes = fs.readFileSync(file);
    if (candidate.gameVersion !== expectedRevision.gameVersion || candidate.revision !== expectedRevision.revision) reasons.push("versionBindingMismatch");
    if (candidate.packageVersion !== expectedRevision.packageVersion) reasons.push("packageVersionMismatch");
    if (candidate.rawArtifactBytes !== bytes.length) reasons.push("bytesMismatch");
    if (candidate.rawArtifactSha256 !== sha256(bytes)) reasons.push("sha256Mismatch");
    if (candidate.gitBlob !== base.gitBlobSha(bytes)) reasons.push("gitBlobMismatch");
    try { JSON.parse(bytes.toString("utf8")); } catch { reasons.push("jsonInvalid"); }
    return reasons;
}

function validateBehaviorShardSnapshot(snapshot, { repositoryRoot: root = repositoryRoot } = {}) {
    const reasons = [];
    if (snapshot?.schemaVersion !== 1 || snapshot?.kind !== "genshinVersionTransitionBehaviorShardSnapshot") reasons.push("identityInvalid");
    if (snapshot?.generatedAt !== generatedAt) reasons.push("generatedAtInvalid");
    if (snapshot?.fieldDigestAlgorithm !== "sha256-stable-json-v1" || snapshot?.fieldDigest !== digestStable(snapshot?.claim)) reasons.push("fieldDigestInvalid");
    if (snapshot?.claim?.transitionId !== "genshin:6.7->7.0" || snapshot?.claim?.fromGameVersion !== "6.7" || snapshot?.claim?.toGameVersion !== "7.0") reasons.push("transitionBindingInvalid");
    if (snapshot?.claim?.provider !== "genshin-db" || snapshot?.claim?.sourceFamily !== sourceFamily || snapshot?.claim?.repository !== repository) reasons.push("providerBindingInvalid");
    const queue = queueShard();
    const shard = snapshot?.claim?.shard;
    if (shard?.shardId !== shardId || shard?.authoritativeCandidateCount !== queue.candidateIds.length
        || digestStable(shard?.authoritativeCandidateIds) !== queue.candidateIdsDigest
        || digestStable(shard?.authoritativeEntityIds) !== digestStable(queue.entityIds)
        || digestStable(shard?.skippedOverlapEntityIds) !== digestStable(overlapEntityIds)) reasons.push("authoritativeShardBindingInvalid");
    const bindings = Array.isArray(snapshot?.claim?.versionBindings) ? snapshot.claim.versionBindings : [];
    if (bindings.length !== 2) reasons.push("versionBindingsIncomplete");
    for (const revision of Object.values(base.revisions)) {
        const binding = bindings.find((candidate) => candidate.gameVersion === revision.gameVersion);
        const packageValue = binding?.package;
        const file = packageValue?.path ? path.resolve(root, packageValue.path) : null;
        if (!binding || binding.revision !== revision.revision || binding.packageVersion !== revision.packageVersion || binding.status !== "strictlyBound" || !file || !fs.existsSync(file)) {
            reasons.push(`versionBindingInvalid:${revision.gameVersion}`);
            continue;
        }
        const bytes = fs.readFileSync(file);
        if (bytes.length !== revision.packageBytes || sha256(bytes) !== revision.packageDigest || base.gitBlobSha(bytes) !== revision.packageBlob) reasons.push(`packageBindingInvalid:${revision.gameVersion}`);
        try {
            const manifest = JSON.parse(bytes.toString("utf8"));
            if (manifest.name !== "genshin-db" || manifest.version !== revision.packageVersion) reasons.push(`packageVersionInvalid:${revision.gameVersion}`);
        } catch { reasons.push(`packageJsonInvalid:${revision.gameVersion}`); }
    }
    const entities = Array.isArray(snapshot?.claim?.resolvedEntities) ? snapshot.claim.resolvedEntities : [];
    if (entities.length !== resolvedEntities.length || new Set(entities.map((entity) => entity.entityId)).size !== entities.length) reasons.push("resolvedEntitiesIncomplete");
    for (const expected of resolvedEntities) {
        const entity = entities.find((candidate) => candidate.entityId === expected.entityId);
        if (!entity || entity.providerSlug !== expected.slug || entity.resolutionStatus !== "resolvedUnambiguous") {
            reasons.push(`resolvedEntityInvalid:${expected.entityId}`);
            continue;
        }
        if (!Array.isArray(entity.records) || entity.records.length !== recordKinds.length) {
            reasons.push(`recordsIncomplete:${expected.entityId}`);
            continue;
        }
        for (const recordKind of recordKinds) {
            const record = entity.records.find((candidate) => candidate.recordKind === recordKind);
            if (!record) {
                reasons.push(`recordMissing:${expected.entityId}:${recordKind}`);
                continue;
            }
            for (const side of ["before", "after"]) {
                const revision = side === "before" ? base.revisions.before : base.revisions.after;
                reasons.push(...validateArtifact(record[side], revision, recordKind, expected.slug, root).map((reason) => `${expected.entityId}:${recordKind}:${side}:${reason}`));
            }
            const beforeFile = path.resolve(root, record.before?.path || "");
            const afterFile = path.resolve(root, record.after?.path || "");
            if (fs.existsSync(beforeFile) && fs.existsSync(afterFile)) {
                const before = JSON.parse(fs.readFileSync(beforeFile, "utf8"));
                const after = JSON.parse(fs.readFileSync(afterFile, "utf8"));
                const diffs = base.fieldDiffs(before, after);
                if (record.comparison?.status !== (diffs.length ? "rawRecordChanged" : "rawRecordMatch")
                    || record.comparison?.changedFieldCount !== diffs.length
                    || digestStable(record.comparison?.fieldDiffs) !== digestStable(diffs)) reasons.push(`comparisonInvalid:${expected.entityId}:${recordKind}`);
            }
        }
    }
    if (!Array.isArray(snapshot?.claim?.travelerVariantEvidence) || snapshot.claim.travelerVariantEvidence.length !== 0) reasons.push("travelerVariantEvidenceUnexpected");
    if (!Array.isArray(snapshot?.claim?.variantAmbiguities) || snapshot.claim.variantAmbiguities.length !== 0) reasons.push("variantAmbiguitiesUnexpected");
    if (snapshot?.claim?.coverage?.canIssueEligibilityCertificate !== false || snapshot?.claim?.coverage?.canPromoteCanonical !== false
        || snapshot?.gateEligibility?.canIssueEligibilityCertificate !== false || snapshot?.gateEligibility?.canPromoteCanonical !== false) reasons.push("failClosedDispositionInvalid");
    return { valid: reasons.length === 0, reasons };
}

function buildCheckpoint(snapshot = buildSnapshot()) {
    const queue = queueShard();
    const capturedEntityIds = resolvedEntities.map((entity) => entity.entityId);
    const claim = {
        queueShardId: shardId,
        queuePath: queue.path,
        authoritativeCandidateIdsDigest: queue.candidateIdsDigest,
        requestedEntityIds: queue.entityIds,
        capturedEntityIds,
        skippedOverlapEntityIds: overlapEntityIds,
        materializedSnapshotPath: relative(outputPath),
        materializedSnapshotFieldDigest: snapshot.fieldDigest,
        sourceFamilyCount: 1,
        canIssueEligibilityCertificate: false,
        canPromoteCanonical: false
    };
    return {
        schemaVersion: 1,
        kind: "genshinVersionTransitionBehaviorShardCaptureCheckpoint",
        generatedAt,
        transitionId: "genshin:6.7->7.0",
        shardId,
        status: "complete",
        authoritativeCandidateCount: queue.candidateIds.length,
        requestedEntityCount: queue.entityIds.length,
        capturedEntityCount: capturedEntityIds.length,
        skippedOverlapEntityCount: overlapEntityIds.length,
        revisions: Object.fromEntries(Object.entries(base.revisions).map(([side, revision]) => [side, {
            gameVersion: revision.gameVersion,
            revision: revision.revision,
            status: "complete",
            completedEntityIds: capturedEntityIds,
            completedArtifactCount: capturedEntityIds.length * recordKinds.length
        }])),
        materializedSnapshot: {
            path: relative(outputPath),
            fieldDigest: snapshot.fieldDigest,
            entityCount: snapshot.summary.resolvedEntities,
            recordCount: snapshot.summary.resolvedRecords,
            changedRecordCount: snapshot.summary.changedRecords,
            changedFieldCount: snapshot.summary.changedFields
        },
        nextTask: "Acquire an independent strictly 7.0-bound field source and reconcile behavior semantics; do not promote from this correlated capture.",
        gateEligibility: snapshot.gateEligibility,
        claim,
        fieldDigestAlgorithm: "sha256-stable-json-v1",
        fieldDigest: digestStable(claim)
    };
}

function validateCheckpoint(checkpoint, { repositoryRoot: root = repositoryRoot } = {}) {
    const reasons = [];
    const queue = queueShard();
    if (checkpoint?.schemaVersion !== 1 || checkpoint?.kind !== "genshinVersionTransitionBehaviorShardCaptureCheckpoint") reasons.push("identityInvalid");
    if (checkpoint?.transitionId !== "genshin:6.7->7.0" || checkpoint?.shardId !== shardId || checkpoint?.status !== "complete") reasons.push("statusInvalid");
    if (checkpoint?.fieldDigestAlgorithm !== "sha256-stable-json-v1" || checkpoint?.fieldDigest !== digestStable(checkpoint?.claim)) reasons.push("fieldDigestInvalid");
    if (checkpoint?.authoritativeCandidateCount !== queue.candidateIds.length
        || checkpoint?.claim?.authoritativeCandidateIdsDigest !== queue.candidateIdsDigest
        || digestStable(checkpoint?.claim?.requestedEntityIds) !== digestStable(queue.entityIds)
        || digestStable(checkpoint?.claim?.capturedEntityIds) !== digestStable(resolvedEntities.map((entity) => entity.entityId))
        || digestStable(checkpoint?.claim?.skippedOverlapEntityIds) !== digestStable(overlapEntityIds)) reasons.push("queueBindingInvalid");
    for (const [side, revision] of Object.entries(base.revisions)) {
        const progress = checkpoint?.revisions?.[side];
        if (!progress || progress.gameVersion !== revision.gameVersion || progress.revision !== revision.revision || progress.status !== "complete"
            || progress.completedArtifactCount !== resolvedEntities.length * recordKinds.length) reasons.push(`revisionProgressInvalid:${side}`);
    }
    const snapshotFile = checkpoint?.materializedSnapshot?.path ? path.resolve(root, checkpoint.materializedSnapshot.path) : null;
    if (!snapshotFile || !fs.existsSync(snapshotFile)) reasons.push("materializedSnapshotMissing");
    else {
        const snapshot = readJson(snapshotFile);
        if (checkpoint.materializedSnapshot.fieldDigest !== snapshot.fieldDigest || !validateBehaviorShardSnapshot(snapshot, { repositoryRoot: root }).valid) reasons.push("materializedSnapshotInvalid");
    }
    if (checkpoint?.gateEligibility?.canIssueEligibilityCertificate !== false || checkpoint?.gateEligibility?.canPromoteCanonical !== false) reasons.push("failClosedDispositionInvalid");
    return { valid: reasons.length === 0, reasons };
}

function writeSnapshot() {
    const snapshot = buildSnapshot();
    fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    const checkpoint = buildCheckpoint(snapshot);
    fs.writeFileSync(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
    return { snapshot, checkpoint };
}

async function main() {
    if (process.argv.includes("--fetch")) await acquire();
    process.stdout.write(`${JSON.stringify(writeSnapshot().snapshot.summary, null, 2)}\n`);
}

if (require.main === module) main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
});

module.exports = {
    acquire,
    buildCheckpoint,
    buildSnapshot,
    checkpointPath,
    generatedAt,
    outputPath,
    queueShard,
    recordKinds,
    resolvedEntities,
    shardId,
    validateBehaviorShardSnapshot,
    validateCheckpoint,
    writeSnapshot
};
