"use strict";

/**
 * Materialize the authoritative behaviorSpec shard 08 source records for the
 * 6.7 -> 7.0 transition.
 *
 * This is deliberately a source-capture lane.  It binds every artifact to an
 * immutable genshin-db revision, package manifest, raw SHA-256, Git blob SHA,
 * and the provider record's embedded id.  It never parses description prose
 * into Runtime fields and never issues an eligibility certificate or promotes
 * canonical data.  Entity 10000070 is the overlap with shard 07 and is
 * recorded as skipped; it is not fetched again by this lane.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const base = require("./genshinVersionTransitionBehaviorEntityCapture.cjs");
const { digestStable } = require("./genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const transitionRoot = path.join(
    repositoryRoot,
    "games",
    "genshin",
    "data",
    "v2",
    "version-transitions",
    "6.7-to-7.0"
);
const sourceNamespace = "genshin-db-behavior-shard08";
const providerRoot = path.join(transitionRoot, "sources", sourceNamespace);
const queuePath = path.join(repositoryRoot, "reports", "genshin-evidence-task-queue.json");
const outputPath = path.join(transitionRoot, "behavior-shard-08-snapshot.json");
const checkpointPath = path.join(transitionRoot, "behavior-shard-08-capture-checkpoint.json");
const generatedAt = "2026-08-26T00:00:00.000Z";
const repository = "theBowja/genshin-db";
const sourceFamily = "GenshinData-derived";
const recordKinds = ["talents", "constellations"];
const shardId = "behavior:behaviorSpec:semanticDecisionRequired:standard:08";
const overlapEntityIds = ["10000070"];
const travelerEntityIds = ["10000005", "10000007"];

// Slugs are concrete provider paths, not translations or fuzzy display-name
// guesses.  providerId is verified against $.id in every raw record for both
// revisions before a file is materialized.
const resolvedEntities = [
    { entityId: "10000072", name: "Candace", nameJa: "キャンディス", providerId: 7201, slug: "candace", slugCandidates: ["candace"] },
    { entityId: "10000073", name: "Nahida", nameJa: "ナヒーダ", providerId: 7301, slug: "nahida", slugCandidates: ["nahida"] },
    { entityId: "10000074", name: "Layla", nameJa: "レイラ", providerId: 7401, slug: "layla", slugCandidates: ["layla"] },
    { entityId: "10000075", name: "Wanderer", nameJa: "放浪者", providerId: 7501, slug: "wanderer", slugCandidates: ["wanderer"] },
    { entityId: "10000076", name: "Faruzan", nameJa: "ファルザン", providerId: 7601, slug: "faruzan", slugCandidates: ["faruzan"] },
    { entityId: "10000077", name: "Yaoyao", nameJa: "ヨォーヨ", providerId: 7701, slug: "yaoyao", slugCandidates: ["yaoyao"] },
    { entityId: "10000078", name: "Alhaitham", nameJa: "アルハイゼン", providerId: 7801, slug: "alhaitham", slugCandidates: ["alhaitham"] }
];

function sha256(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function gitBlobSha(bytes) {
    const header = Buffer.from(`blob ${bytes.length}\0`, "utf8");
    return crypto.createHash("sha1").update(Buffer.concat([header, bytes])).digest("hex");
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

function packageFile(revision) {
    return path.join(providerRoot, revision.revision, revision.packagePath);
}

function queueShard() {
    const queue = readJson(queuePath);
    const cluster = (queue.unlockClusters || []).find((item) => item.domain === "behavior" && item.layer === "behaviorSpec");
    const shard = cluster?.shards?.find((item) => item.shardId === shardId);
    if (!shard || !Array.isArray(shard.candidateIds) || shard.candidateIds.length === 0) {
        throw new Error(`authoritative queue shard missing: ${shardId}`);
    }
    const candidateIds = shard.candidateIds.map(String);
    const entityIds = [...new Set(candidateIds.map((candidateId) => candidateId.split(":")[1]))];
    if (candidateIds.length !== 100) throw new Error(`unexpected authoritative candidate count: ${candidateIds.length}`);
    if (entityIds.some((entityId) => !/^100000\d{2}$/.test(entityId))) throw new Error("authoritative queue contains invalid entity id");
    return {
        shardId,
        candidateIds,
        candidateIdsDigest: digestStable(candidateIds),
        entityIds,
        path: relative(queuePath)
    };
}

async function fetchBytes(url) {
    const response = await fetch(url, { headers: { "User-Agent": "damageTool-genshin-behavior-shard-08" } });
    if (!response.ok) {
        const error = new Error(`fetch failed ${response.status}: ${url}`);
        error.status = response.status;
        throw error;
    }
    return Buffer.from(await response.arrayBuffer());
}

function assertExpectedRevisionManifest(revision, bytes) {
    if (bytes.length !== revision.packageBytes) throw new Error(`${revision.gameVersion} package bytes mismatch`);
    if (sha256(bytes) !== revision.packageDigest) throw new Error(`${revision.gameVersion} package SHA-256 mismatch`);
    if (gitBlobSha(bytes) !== revision.packageBlob) throw new Error(`${revision.gameVersion} package Git blob mismatch`);
    const manifest = JSON.parse(bytes.toString("utf8"));
    if (manifest.name !== "genshin-db" || manifest.version !== revision.packageVersion) {
        throw new Error(`${revision.gameVersion} package version mismatch`);
    }
}

function parseProviderRecord(bytes, expected) {
    let record;
    try {
        record = JSON.parse(bytes.toString("utf8"));
    } catch (error) {
        throw new Error(`invalid provider JSON for ${expected.entityId}/${expected.recordKind}: ${error.message}`);
    }
    if (!Number.isInteger(record.id) || record.id !== expected.providerId) {
        throw new Error(`embedded provider id mismatch for ${expected.entityId}/${expected.recordKind}: expected ${expected.providerId}, got ${record.id}`);
    }
    if (record.name !== expected.name) {
        throw new Error(`embedded provider name mismatch for ${expected.entityId}/${expected.recordKind}: expected ${expected.name}, got ${record.name}`);
    }
    return record;
}

async function resolveAndFetch(revision, entity, recordKind) {
    const valid = [];
    for (const slug of entity.slugCandidates) {
        const url = sourceUrl(revision.revision, recordKind, slug);
        const bytes = await fetchBytes(url);
        const record = parseProviderRecord(bytes, { ...entity, recordKind });
        valid.push({ slug, bytes, record });
    }
    if (valid.length !== 1) {
        throw new Error(`provider path ambiguity for ${entity.entityId}/${recordKind}: ${valid.map((item) => item.slug).join(",")}`);
    }
    return valid[0];
}

async function acquire() {
    fs.mkdirSync(providerRoot, { recursive: true });
    for (const revision of Object.values(base.revisions)) {
        const manifest = await fetchBytes(`https://raw.githubusercontent.com/${repository}/${revision.revision}/${revision.packagePath}`);
        assertExpectedRevisionManifest(revision, manifest);
        fs.mkdirSync(path.dirname(packageFile(revision)), { recursive: true });
        fs.writeFileSync(packageFile(revision), manifest);
        for (const entity of resolvedEntities) {
            const selected = [];
            for (const recordKind of recordKinds) {
                selected.push({ recordKind, ...(await resolveAndFetch(revision, entity, recordKind)) });
            }
            const slugs = [...new Set(selected.map((item) => item.slug))];
            if (slugs.length !== 1) throw new Error(`cross-record provider path mismatch for ${entity.entityId}: ${slugs.join(",")}`);
            for (const item of selected) {
                const file = sourcePath(revision.revision, item.recordKind, item.slug);
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file, item.bytes);
            }
        }
    }
}

function pointerToken(value) {
    return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}

function fieldDigest(value) {
    return digestStable(value === undefined ? null : value);
}

function fieldDiffs(before, after, pointer = "") {
    if (fieldDigest(before) === fieldDigest(after)) return [];
    const beforeObject = before && typeof before === "object";
    const afterObject = after && typeof after === "object";
    if (!beforeObject || !afterObject || Array.isArray(before) !== Array.isArray(after)) {
        return [{
            jsonPointer: pointer || "/",
            beforeValue: before === undefined ? null : before,
            afterValue: after === undefined ? null : after,
            beforeFieldDigest: fieldDigest(before),
            afterFieldDigest: fieldDigest(after)
        }];
    }
    const keys = Array.isArray(before) && Array.isArray(after)
        ? Array.from({ length: Math.max(before.length, after.length) }, (_, index) => String(index))
        : [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].sort();
    return keys.flatMap((key) => fieldDiffs(before?.[key], after?.[key], `${pointer}/${pointerToken(key)}`));
}

function artifact(revision, recordKind, entity) {
    const file = sourcePath(revision.revision, recordKind, entity.slug);
    if (!fs.existsSync(file)) throw new Error(`captured source missing: ${relative(file)}`);
    const bytes = fs.readFileSync(file);
    const value = parseProviderRecord(bytes, { ...entity, recordKind });
    return {
        gameVersion: revision.gameVersion,
        revision: revision.revision,
        packageVersion: revision.packageVersion,
        path: relative(file),
        url: sourceUrl(revision.revision, recordKind, entity.slug),
        gitBlob: gitBlobSha(bytes),
        rawArtifactBytes: bytes.length,
        rawArtifactSha256: sha256(bytes),
        embeddedIdPath: "$.id",
        embeddedId: value.id,
        embeddedName: value.name
    };
}

function packageEvidence(revision) {
    const file = packageFile(revision);
    if (!fs.existsSync(file)) throw new Error(`captured package manifest missing: ${relative(file)}`);
    const bytes = fs.readFileSync(file);
    const manifest = readJson(file);
    assertExpectedRevisionManifest(revision, bytes);
    return {
        gameVersion: revision.gameVersion,
        revision: revision.revision,
        packageVersion: revision.packageVersion,
        path: relative(file),
        url: `https://raw.githubusercontent.com/${repository}/${revision.revision}/${revision.packagePath}`,
        gitBlob: gitBlobSha(bytes),
        rawArtifactBytes: bytes.length,
        rawArtifactSha256: sha256(bytes),
        name: manifest.name,
        description: manifest.description
    };
}

function recordComparison(before, after, beforeValue, afterValue) {
    const diffs = fieldDiffs(beforeValue, afterValue);
    return {
        status: diffs.length === 0 ? "rawRecordMatch" : "rawRecordChanged",
        changedFieldCount: diffs.length,
        fieldDiffs: diffs,
        comparisonEligible: true,
        beforeFieldDigest: fieldDigest(beforeValue),
        afterFieldDigest: fieldDigest(afterValue),
        beforeArtifactSha256: before.rawArtifactSha256,
        afterArtifactSha256: after.rawArtifactSha256
    };
}

function buildEntity(entity) {
    const records = recordKinds.map((recordKind) => {
        const beforeFile = sourcePath(base.revisions.before.revision, recordKind, entity.slug);
        const afterFile = sourcePath(base.revisions.after.revision, recordKind, entity.slug);
        if (!fs.existsSync(beforeFile) || !fs.existsSync(afterFile)) throw new Error(`source pair missing for ${entity.entityId}/${recordKind}`);
        const beforeValue = parseProviderRecord(fs.readFileSync(beforeFile), { ...entity, recordKind });
        const afterValue = parseProviderRecord(fs.readFileSync(afterFile), { ...entity, recordKind });
        const before = artifact(base.revisions.before, recordKind, entity);
        const after = artifact(base.revisions.after, recordKind, entity);
        return { recordKind, before, after, comparison: recordComparison(before, after, beforeValue, afterValue) };
    });
    return {
        entityId: entity.entityId,
        name: entity.name,
        nameJa: entity.nameJa,
        providerSlug: entity.slug,
        providerId: entity.providerId,
        resolutionStatus: "resolvedUnambiguous",
        treeResolution: {
            method: "nonRecursiveGitTreePath",
            resolutionEvidence: "immutableRawPathWithEmbeddedId",
            directoryPaths: recordKinds.map((recordKind) => `src/data/English/${recordKind}`),
            pathResolution: recordKinds.map((recordKind) => ({
                recordKind,
                path: `src/data/English/${recordKind}/${entity.slug}.json`
            }))
        },
        records
    };
}

function buildSnapshot() {
    const queue = queueShard();
    const expectedEntityIds = [...new Set(queue.entityIds)];
    const queueTravelerIds = expectedEntityIds.filter((entityId) => travelerEntityIds.includes(entityId));
    if (queueTravelerIds.length) throw new Error(`Traveler variant ambiguity must remain fail-closed: ${queueTravelerIds.join(",")}`);
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
        sourceNamespace,
        repository,
        treeResolution: {
            method: "nonRecursiveGitTreePath",
            resolutionEvidence: "immutableRawPathWithEmbeddedId",
            note: "Each captured path is a concrete entry under src/data/English/{talents,constellations}; selection is accepted only when $.id equals the explicit providerId."
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
            overlapPolicy: "alreadyCapturedByBehaviorShard07",
            overlapEvidence: [{
                entityId: "10000070",
                previousShardId: "behavior:behaviorSpec:semanticDecisionRequired:standard:07",
                acquisitionPolicy: "notReacquired"
            }]
        },
        versionBindings: Object.values(base.revisions).map((revision) => ({
            gameVersion: revision.gameVersion,
            revision: revision.revision,
            packageVersion: revision.packageVersion,
            status: "strictlyBound",
            package: packageEvidence(revision)
        })),
        resolvedEntities: entities,
        travelerVariantEvidence: [],
        variantAmbiguities: [],
        travelerVariantPolicy: {
            status: "notApplicable",
            failClosedOnEncounter: true,
            entityIds: travelerEntityIds,
            note: "No Traveler entity is in shard 08; any future Traveler queue entry must remain unresolved until its variant identity is explicit."
        },
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

function validateArtifact(candidate, expectedRevision, expectedRecordKind, entity, root = repositoryRoot) {
    const reasons = [];
    const file = candidate?.path ? path.resolve(root, candidate.path) : null;
    const expected = sourcePath(expectedRevision.revision, expectedRecordKind, entity.slug);
    if (!file || path.resolve(file) !== path.resolve(expected)) reasons.push("pathMismatch");
    if (!file || !fs.existsSync(file)) return [...reasons, "missing"];
    const bytes = fs.readFileSync(file);
    if (candidate.gameVersion !== expectedRevision.gameVersion || candidate.revision !== expectedRevision.revision) reasons.push("versionBindingMismatch");
    if (candidate.packageVersion !== expectedRevision.packageVersion) reasons.push("packageVersionMismatch");
    if (candidate.rawArtifactBytes !== bytes.length) reasons.push("bytesMismatch");
    if (candidate.rawArtifactSha256 !== sha256(bytes)) reasons.push("sha256Mismatch");
    if (candidate.gitBlob !== gitBlobSha(bytes)) reasons.push("gitBlobMismatch");
    let value;
    try { value = parseProviderRecord(bytes, { ...entity, recordKind: expectedRecordKind }); } catch { reasons.push("embeddedIdInvalid"); }
    if (candidate.embeddedIdPath !== "$.id" || candidate.embeddedId !== entity.providerId || value?.id !== entity.providerId) reasons.push("embeddedIdMismatch");
    if (candidate.embeddedName !== value?.name) reasons.push("embeddedNameMismatch");
    return reasons;
}

function validatePackageBinding(binding, revision, root, reasons) {
    const file = binding?.package?.path ? path.resolve(root, binding.package.path) : null;
    if (!binding || binding.gameVersion !== revision.gameVersion || binding.revision !== revision.revision
        || binding.packageVersion !== revision.packageVersion || binding.status !== "strictlyBound"
        || !file || !fs.existsSync(file)) {
        reasons.push(`versionBindingInvalid:${revision.gameVersion}`);
        return;
    }
    const bytes = fs.readFileSync(file);
    if (bytes.length !== revision.packageBytes || sha256(bytes) !== revision.packageDigest || gitBlobSha(bytes) !== revision.packageBlob) {
        reasons.push(`packageBindingInvalid:${revision.gameVersion}`);
    }
    try {
        const manifest = JSON.parse(bytes.toString("utf8"));
        if (binding.package.rawArtifactBytes !== bytes.length
            || binding.package.rawArtifactSha256 !== sha256(bytes)
            || binding.package.gitBlob !== gitBlobSha(bytes)
            || binding.package.name !== manifest.name
            || binding.package.description !== manifest.description) {
            reasons.push(`packageMetadataInvalid:${revision.gameVersion}`);
        }
        if (manifest.name !== "genshin-db" || manifest.version !== revision.packageVersion) reasons.push(`packageVersionInvalid:${revision.gameVersion}`);
    } catch { reasons.push(`packageJsonInvalid:${revision.gameVersion}`); }
}

function validateBehaviorShard08Snapshot(snapshot, { repositoryRoot: root = repositoryRoot } = {}) {
    const reasons = [];
    if (snapshot?.schemaVersion !== 1 || snapshot?.kind !== "genshinVersionTransitionBehaviorShardSnapshot") reasons.push("identityInvalid");
    if (snapshot?.generatedAt !== generatedAt) reasons.push("generatedAtInvalid");
    if (snapshot?.fieldDigestAlgorithm !== "sha256-stable-json-v1" || snapshot?.fieldDigest !== digestStable(snapshot?.claim)) reasons.push("fieldDigestInvalid");
    if (snapshot?.claim?.transitionId !== "genshin:6.7->7.0" || snapshot?.claim?.fromGameVersion !== "6.7" || snapshot?.claim?.toGameVersion !== "7.0") reasons.push("transitionBindingInvalid");
    if (snapshot?.claim?.provider !== "genshin-db" || snapshot?.claim?.sourceFamily !== sourceFamily
        || snapshot?.claim?.sourceNamespace !== sourceNamespace || snapshot?.claim?.repository !== repository) reasons.push("providerBindingInvalid");
    const queue = queueShard();
    const shard = snapshot?.claim?.shard;
    if (shard?.shardId !== shardId || shard?.authoritativeCandidateCount !== queue.candidateIds.length
        || digestStable(shard?.authoritativeCandidateIds) !== queue.candidateIdsDigest
        || digestStable(shard?.authoritativeEntityIds) !== digestStable(queue.entityIds)
        || digestStable(shard?.capturedNewEntityIds) !== digestStable(resolvedEntities.map((entity) => entity.entityId))
        || digestStable(shard?.skippedOverlapEntityIds) !== digestStable(overlapEntityIds)
        || shard?.overlapPolicy !== "alreadyCapturedByBehaviorShard07") reasons.push("authoritativeShardBindingInvalid");
    const bindings = Array.isArray(snapshot?.claim?.versionBindings) ? snapshot.claim.versionBindings : [];
    if (bindings.length !== 2) reasons.push("versionBindingsIncomplete");
    for (const revision of Object.values(base.revisions)) {
        validatePackageBinding(bindings.find((candidate) => candidate.gameVersion === revision.gameVersion), revision, root, reasons);
    }
    const entities = Array.isArray(snapshot?.claim?.resolvedEntities) ? snapshot.claim.resolvedEntities : [];
    if (entities.length !== resolvedEntities.length || new Set(entities.map((entity) => entity.entityId)).size !== entities.length) reasons.push("resolvedEntitiesIncomplete");
    for (const expected of resolvedEntities) {
        const entity = entities.find((candidate) => candidate.entityId === expected.entityId);
        if (!entity || entity.providerSlug !== expected.slug || entity.providerId !== expected.providerId || entity.resolutionStatus !== "resolvedUnambiguous") {
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
                reasons.push(...validateArtifact(record[side], revision, recordKind, expected, root).map((reason) => `${expected.entityId}:${recordKind}:${side}:${reason}`));
            }
            const beforePath = path.resolve(root, record.before?.path || "");
            const afterPath = path.resolve(root, record.after?.path || "");
            if (!fs.existsSync(beforePath) || !fs.existsSync(afterPath)) {
                reasons.push(`comparisonSourceMissing:${expected.entityId}:${recordKind}`);
                continue;
            }
            const beforeValue = parseProviderRecord(fs.readFileSync(beforePath), { ...expected, recordKind });
            const afterValue = parseProviderRecord(fs.readFileSync(afterPath), { ...expected, recordKind });
            const diffs = fieldDiffs(beforeValue, afterValue);
            if (record.comparison?.status !== (diffs.length ? "rawRecordChanged" : "rawRecordMatch")
                || record.comparison?.changedFieldCount !== diffs.length
                || digestStable(record.comparison?.fieldDiffs) !== digestStable(diffs)
                || record.comparison?.beforeFieldDigest !== fieldDigest(beforeValue)
                || record.comparison?.afterFieldDigest !== fieldDigest(afterValue)
                || record.comparison?.beforeArtifactSha256 !== record.before.rawArtifactSha256
                || record.comparison?.afterArtifactSha256 !== record.after.rawArtifactSha256) {
                reasons.push(`comparisonInvalid:${expected.entityId}:${recordKind}`);
            }
        }
    }
    if (!Array.isArray(snapshot?.claim?.travelerVariantEvidence) || snapshot.claim.travelerVariantEvidence.length !== 0) reasons.push("travelerVariantEvidenceUnexpected");
    if (!Array.isArray(snapshot?.claim?.variantAmbiguities) || snapshot.claim.variantAmbiguities.length !== 0) reasons.push("variantAmbiguitiesUnexpected");
    if (snapshot?.claim?.travelerVariantPolicy?.failClosedOnEncounter !== true
        || snapshot?.claim?.travelerVariantPolicy?.status !== "notApplicable") reasons.push("travelerPolicyInvalid");
    if (snapshot?.summary?.shardId !== shardId
        || snapshot?.summary?.authoritativeCandidates !== 100
        || snapshot?.summary?.authoritativeEntities !== queue.entityIds.length
        || snapshot?.summary?.resolvedEntities !== resolvedEntities.length
        || snapshot?.summary?.overlapSkippedEntities !== overlapEntityIds.length
        || snapshot?.summary?.ambiguousEntities !== 0
        || snapshot?.summary?.resolvedRecords !== resolvedEntities.length * recordKinds.length
        || snapshot?.summary?.sourceFamilyCount !== 1
        || snapshot?.summary?.certificateEligibleClaims !== 0) reasons.push("summaryInvalid");
    if (!Array.isArray(shard?.overlapEvidence) || shard.overlapEvidence.length !== 1
        || shard.overlapEvidence[0]?.entityId !== "10000070"
        || shard.overlapEvidence[0]?.previousShardId !== "behavior:behaviorSpec:semanticDecisionRequired:standard:07"
        || shard.overlapEvidence[0]?.acquisitionPolicy !== "notReacquired") reasons.push("overlapEvidenceInvalid");
    if (snapshot?.claim?.coverage?.canIssueEligibilityCertificate !== false || snapshot?.claim?.coverage?.canPromoteCanonical !== false
        || snapshot?.gateEligibility?.sourceFamilyCount !== 1 || snapshot?.gateEligibility?.canIssueEligibilityCertificate !== false
        || snapshot?.gateEligibility?.canPromoteCanonical !== false) reasons.push("failClosedDispositionInvalid");
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
        sourceNamespace,
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
        overlapEvidence: [{
            entityId: "10000070",
            previousShardId: "behavior:behaviorSpec:semanticDecisionRequired:standard:07",
            acquisitionPolicy: "notReacquired"
        }],
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
    if (checkpoint?.generatedAt !== generatedAt || checkpoint?.transitionId !== "genshin:6.7->7.0" || checkpoint?.shardId !== shardId) reasons.push("transitionBindingInvalid");
    if (checkpoint?.status !== "complete" || checkpoint?.authoritativeCandidateCount !== queue.candidateIds.length
        || checkpoint?.requestedEntityCount !== queue.entityIds.length || checkpoint?.capturedEntityCount !== resolvedEntities.length
        || checkpoint?.skippedOverlapEntityCount !== overlapEntityIds.length) reasons.push("checkpointCoverageInvalid");
    if (checkpoint?.fieldDigestAlgorithm !== "sha256-stable-json-v1" || checkpoint?.fieldDigest !== digestStable(checkpoint?.claim)) reasons.push("fieldDigestInvalid");
    if (checkpoint?.claim?.queueShardId !== shardId || checkpoint?.claim?.authoritativeCandidateIdsDigest !== queue.candidateIdsDigest
        || digestStable(checkpoint?.claim?.requestedEntityIds) !== digestStable(queue.entityIds)
        || digestStable(checkpoint?.claim?.capturedEntityIds) !== digestStable(resolvedEntities.map((entity) => entity.entityId))
        || digestStable(checkpoint?.claim?.skippedOverlapEntityIds) !== digestStable(overlapEntityIds)
        || checkpoint?.claim?.sourceNamespace !== sourceNamespace
        || checkpoint?.claim?.canIssueEligibilityCertificate !== false
        || checkpoint?.claim?.canPromoteCanonical !== false) reasons.push("checkpointClaimInvalid");
    const materializedPath = checkpoint?.materializedSnapshot?.path ? path.resolve(root, checkpoint.materializedSnapshot.path) : null;
    if (!materializedPath || !fs.existsSync(materializedPath)) reasons.push("materializedSnapshotMissing");
    else {
        let snapshot;
        try { snapshot = readJson(materializedPath); } catch { reasons.push("materializedSnapshotInvalid"); }
        if (snapshot && (checkpoint.materializedSnapshot.fieldDigest !== snapshot.fieldDigest
            || !validateBehaviorShard08Snapshot(snapshot, { repositoryRoot: root }).valid)) reasons.push("materializedSnapshotInvalid");
    }
    for (const side of ["before", "after"]) {
        if (checkpoint?.revisions?.[side]?.completedArtifactCount !== resolvedEntities.length * recordKinds.length
            || checkpoint?.revisions?.[side]?.status !== "complete"
            || digestStable(checkpoint?.revisions?.[side]?.completedEntityIds) !== digestStable(resolvedEntities.map((entity) => entity.entityId))) reasons.push(`revisionCheckpointInvalid:${side}`);
    }
    if (checkpoint?.gateEligibility?.sourceFamilyCount !== 1 || checkpoint?.gateEligibility?.canIssueEligibilityCertificate !== false
        || checkpoint?.gateEligibility?.canPromoteCanonical !== false) reasons.push("failClosedDispositionInvalid");
    return { valid: reasons.length === 0, reasons };
}

function writeSnapshot() {
    const snapshot = buildSnapshot();
    const checkpoint = buildCheckpoint(snapshot);
    fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    fs.writeFileSync(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
    return { snapshot, checkpoint };
}

async function main() {
    if (process.argv.includes("--fetch")) await acquire();
    const result = writeSnapshot();
    process.stdout.write(`${JSON.stringify(result.snapshot.summary, null, 2)}\n`);
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
    overlapEntityIds,
    outputPath,
    providerRoot,
    queueShard,
    recordKinds,
    resolvedEntities,
    shardId,
    sourceNamespace,
    validateBehaviorShard08Snapshot,
    validateCheckpoint,
    writeSnapshot
};
