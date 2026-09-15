"use strict";

/**
 * Capture behaviorSpec shard 14 for the 6.7 -> 7.0 transition.
 *
 * This lane is deliberately source-only.  It records pinned provider bytes,
 * raw diffs, queue inventory, local identity evidence, and an explicit
 * unresolved-provider checkpoint.  It never infers behavior semantics,
 * issues an eligibility certificate, or promotes canonical runtime data.
 * Entity 10000115 is already fully materialized by shard 13 and is therefore
 * recorded as an overlap instead of being reacquired.  Entity 10000124 is
 * present in the local catalog but has no matching provider record at either
 * pinned revision, so it remains ambiguous and is fail-closed.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const base = require("./genshinVersionTransitionBehaviorEntityCapture.cjs");
const previousCapture = require("./genshinVersionTransitionBehaviorShard13Capture.cjs");
const { digestStable } = require("./genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const transitionRoot = path.join(repositoryRoot, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0");
const sourceNamespace = "genshin-db-behavior-shard14";
const providerRoot = path.join(transitionRoot, "sources", sourceNamespace);
const queuePath = path.join(repositoryRoot, "reports", "genshin-evidence-task-queue.json");
const outputPath = path.join(transitionRoot, "behavior-shard-14-snapshot.json");
const checkpointPath = path.join(transitionRoot, "behavior-shard-14-capture-checkpoint.json");
const previousSnapshotPath = path.join(transitionRoot, "behavior-shard-13-snapshot.json");
const previousSnapshotRelativePath = "games/genshin/data/v2/version-transitions/6.7-to-7.0/behavior-shard-13-snapshot.json";
const generatedAt = base.generatedAt;
const revisions = base.revisions;
const repository = "theBowja/genshin-db";
const provider = "genshin-db";
const sourceFamily = "GenshinData-derived";
const recordKinds = ["talents", "constellations"];
const shardId = "behavior:behaviorSpec:semanticDecisionRequired:standard:14";
const previousShardId = "behavior:behaviorSpec:semanticDecisionRequired:standard:13";
const travelerEntityIds = ["10000005", "10000007"];
const expectedCandidateCount = 100;
const authoritativeEntityIds = ["10000115", "10000116", "10000119", "10000120", "10000121", "10000122", "10000123", "10000124"];
const overlapEntityIds = ["10000115"];
const ambiguousEntityIds = ["10000124"];
const resolvedEntities = [
    { entityId: "10000116", name: "Ineffa", nameJa: "イネファ", slug: "ineffa", slugCandidates: ["ineffa"], providerId: 11601 },
    { entityId: "10000119", name: "Lauma", nameJa: "ラウマ", slug: "lauma", slugCandidates: ["lauma"], providerId: 11901 },
    { entityId: "10000120", name: "Flins", nameJa: "フリンズ", slug: "flins", slugCandidates: ["flins"], providerId: 12001 },
    { entityId: "10000121", name: "Aino", nameJa: "アイノ", slug: "aino", slugCandidates: ["aino"], providerId: 12101 },
    { entityId: "10000122", name: "Nefer", nameJa: "ネフェル", slug: "nefer", slugCandidates: ["nefer"], providerId: 12201 },
    { entityId: "10000123", name: "Durin", nameJa: "ドゥリン", slug: "durin", slugCandidates: ["durin"], providerId: 12301 }
];
const overlapEntity = { entityId: "10000115", name: "Dahlia", nameJa: "ダリア", slug: "dahlia", providerId: 11501 };
const ambiguousEntity = { entityId: "10000124", nameJa: "ヤフォダ", candidateSlugs: ["yafoda"] };

const localIdentityPaths = {
    catalog: "games/genshin/data/characters.json",
    talents: "games/genshin/data/character-talents.json",
    constellations: "games/genshin/data/character-constellations.json",
    consumerMapper: "games/js/genshinProfileMapper.js"
};

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

function absolute(root, relativePath) {
    return path.resolve(root, relativePath);
}

function sourcePath(revision, recordKind, slug, root = repositoryRoot) {
    return path.join(root, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0", "sources", sourceNamespace, revision, "English", recordKind, `${slug}.json`);
}

function missingEvidencePath(revision, recordKind, slug, root = repositoryRoot) {
    return path.join(root, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0", "sources", sourceNamespace, revision, "unresolved", recordKind, `${slug}.not-found.txt`);
}

function sourceUrl(revision, recordKind, slug) {
    return `https://raw.githubusercontent.com/${repository}/${revision}/src/data/English/${recordKind}/${slug}.json`;
}

function packageFile(revision, root = repositoryRoot) {
    return path.join(root, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0", "sources", sourceNamespace, revision.revision, revision.packagePath);
}

function localFile(key, root = repositoryRoot) {
    return absolute(root, localIdentityPaths[key]);
}

function mapperIdentityEvidence(root = repositoryRoot) {
    const file = localFile("consumerMapper", root);
    const bytes = fs.readFileSync(file);
    const text = bytes.toString("utf8");
    const entries = {};
    const missingEntityIds = [];
    const identityMismatches = [];
    const allEntities = [overlapEntity, ...resolvedEntities, { entityId: ambiguousEntity.entityId, nameJa: ambiguousEntity.nameJa }];
    for (const entity of allEntities) {
        const pattern = new RegExp(`\\"${entity.entityId}\\"\\s*:\\s*\\"([^\\"]*)\\"`, "g");
        const values = [...text.matchAll(pattern)].map((match) => match[1]);
        const uniqueValues = [...new Set(values)];
        entries[entity.entityId] = { values: uniqueValues, expectedNameJa: entity.nameJa };
        if (uniqueValues.length === 0) missingEntityIds.push(entity.entityId);
        else if (uniqueValues.length !== 1 || uniqueValues[0] !== entity.nameJa) identityMismatches.push({ entityId: entity.entityId, expectedNameJa: entity.nameJa, observedValues: uniqueValues });
    }
    return {
        path: localIdentityPaths.consumerMapper,
        sha256: sha256(bytes),
        rawArtifactBytes: bytes.length,
        gitBlob: gitBlobSha(bytes),
        status: identityMismatches.length ? "consumerMapperIdentityMismatchFailClosed" : (missingEntityIds.length ? "consumerMapperPartial" : "consumerMapperMatches"),
        entries,
        missingEntityIds,
        identityMismatches,
        policy: "absence is reported; mismatch is fail-closed; no name is inferred from the mapper"
    };
}

function localIdentityEvidence(root = repositoryRoot) {
    const catalog = readJson(localFile("catalog", root));
    const talents = readJson(localFile("talents", root));
    const constellations = readJson(localFile("constellations", root));
    const allEntities = [overlapEntity, ...resolvedEntities, { entityId: ambiguousEntity.entityId, nameJa: ambiguousEntity.nameJa }];
    const entities = allEntities.map((entity) => {
        const catalogRecord = catalog[entity.entityId];
        const talentRecord = talents[entity.entityId];
        const constellationRecord = constellations[entity.entityId];
        if (!catalogRecord || catalogRecord.nameJa !== entity.nameJa) throw new Error(`local catalog identity mismatch for ${entity.entityId}: expected ${entity.nameJa}`);
        if (!talentRecord || !constellationRecord) throw new Error(`local source text missing for ${entity.entityId}`);
        return {
            entityId: entity.entityId,
            nameJa: entity.nameJa,
            catalogNameJa: catalogRecord.nameJa,
            catalogDigest: digestStable(catalogRecord),
            talentSourceDigest: digestStable(talentRecord),
            constellationSourceDigest: digestStable(constellationRecord),
            identityStatus: "localCatalogAndSourceTextMatch"
        };
    });
    const mapper = mapperIdentityEvidence(root);
    return {
        authority: "data-v2-manifest:characters-catalog-and-source-text",
        paths: localIdentityPaths,
        fileDigests: Object.fromEntries(Object.entries(localIdentityPaths).map(([key]) => {
            const bytes = fs.readFileSync(localFile(key, root));
            return [key, { sha256: sha256(bytes), rawArtifactBytes: bytes.length, gitBlob: gitBlobSha(bytes) }];
        })),
        entities,
        consumerMapper: mapper,
        identityMismatches: mapper.identityMismatches,
        status: mapper.identityMismatches.length ? "ambiguousConsumerMapperIdentity" : "localCatalogProviderIdentityResolved"
    };
}

function queueShard() {
    const queue = readJson(queuePath);
    const clusters = (queue.unlockClusters || []).filter((item) => item.domain === "behavior" && item.layer === "behaviorSpec");
    const shards = clusters.flatMap((cluster) => cluster.shards || []);
    const shard = shards.find((candidate) => String(candidate?.shardId || "") === shardId);
    if (!shard || !Array.isArray(shard.candidateIds)) throw new Error(`authoritative behaviorSpec shard missing: ${shardId}`);
    const candidateIds = shard.candidateIds.map(String);
    if (candidateIds.length !== expectedCandidateCount || new Set(candidateIds).size !== candidateIds.length || !candidateIds.every((id) => /^behavior:100\d{5}:[^:]+:.+$/.test(id))) throw new Error(`authoritative behaviorSpec shard 14 candidate inventory invalid: ${candidateIds.length}`);
    const entityIds = [...new Set(candidateIds.map((candidateId) => candidateId.split(":")[1]))];
    if (digestStable(entityIds) !== digestStable(authoritativeEntityIds)) throw new Error(`shard 14 entity inventory mismatch: ${entityIds.join(",")}`);
    if (entityIds.some((entityId) => travelerEntityIds.includes(entityId))) throw new Error("Traveler identity must remain fail-closed");
    return {
        shardId,
        queuePath: relative(queuePath),
        candidateIds,
        candidateIdsDigest: digestStable(candidateIds),
        entityIds,
        entityIdsDigest: digestStable(entityIds),
        candidateCount: candidateIds.length,
        entityCount: entityIds.length,
        overlapEntityIds,
        ambiguousEntityIds
    };
}

function previousOverlapEvidence(root = repositoryRoot) {
    const file = absolute(root, previousSnapshotRelativePath);
    if (!fs.existsSync(file)) throw new Error(`previous shard snapshot missing: ${previousSnapshotRelativePath}`);
    const snapshot = readJson(file);
    const validation = previousCapture.validateBehaviorShard13Snapshot(snapshot, { repositoryRoot: root });
    if (!validation.valid) throw new Error(`previous shard 13 snapshot invalid: ${validation.reasons.join(",")}`);
    const entity = snapshot.claim.resolvedEntities.find((candidate) => candidate.entityId === overlapEntity.entityId);
    if (!entity || entity.records.length !== recordKinds.length) throw new Error("previous shard 13 overlap entity is not complete");
    return {
        entityId: overlapEntity.entityId,
        previousShardId,
        previousSnapshotPath: previousSnapshotRelativePath,
        previousSnapshotFieldDigest: snapshot.fieldDigest,
        previousEntityFieldDigest: digestStable(entity),
        previousRecordCount: entity.records.length,
        previousRecordEvidence: entity.records.map((record) => ({
            recordKind: record.recordKind,
            beforePath: record.before.path,
            afterPath: record.after.path,
            beforeRawArtifactSha256: record.before.rawArtifactSha256,
            afterRawArtifactSha256: record.after.rawArtifactSha256,
            beforeGitBlob: record.before.gitBlob,
            afterGitBlob: record.after.gitBlob
        })),
        acquisitionPolicy: "notReacquired"
    };
}

async function fetchBytes(url) {
    const response = await fetch(url, { headers: { "User-Agent": "damageTool-genshin-behavior-shard-14" } });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!response.ok) {
        const error = new Error(`fetch failed ${response.status}: ${url}`);
        error.status = response.status;
        error.bytes = bytes;
        throw error;
    }
    return bytes;
}

function assertExpectedPackage(revision, bytes) {
    if (bytes.length !== revision.packageBytes) throw new Error(`${revision.gameVersion} package bytes mismatch`);
    if (sha256(bytes) !== revision.packageDigest) throw new Error(`${revision.gameVersion} package SHA-256 mismatch`);
    if (gitBlobSha(bytes) !== revision.packageBlob) throw new Error(`${revision.gameVersion} package Git blob mismatch`);
    const manifest = JSON.parse(bytes.toString("utf8"));
    if (manifest.name !== provider || manifest.version !== revision.packageVersion) throw new Error(`${revision.gameVersion} package version mismatch`);
    if (!String(manifest.description || "").includes(`Genshin Impact v${revision.gameVersion} JSON data`)) throw new Error(`${revision.gameVersion} strict game-version text missing`);
    return manifest;
}

function parseProviderRecord(bytes, expected) {
    let value;
    try { value = JSON.parse(bytes.toString("utf8")); } catch (error) { throw new Error(`invalid provider JSON for ${expected.entityId}/${expected.recordKind}: ${error.message}`); }
    if (!Number.isInteger(value?.id) || value.id !== expected.providerId) throw new Error(`embedded provider id mismatch for ${expected.entityId}/${expected.recordKind}: expected ${expected.providerId}, got ${value?.id}`);
    if (value.name !== expected.name) throw new Error(`provider name mismatch for ${expected.entityId}/${expected.recordKind}: expected ${expected.name}, got ${value?.name}`);
    return value;
}

async function resolveAndFetch(revision, entity, recordKind) {
    const valid = [];
    for (const slug of entity.slugCandidates) {
        try {
            const bytes = await fetchBytes(sourceUrl(revision.revision, recordKind, slug));
            const value = parseProviderRecord(bytes, { ...entity, recordKind });
            valid.push({ slug, bytes, value });
        } catch (error) {
            if (error.status === 404 || /embedded provider id mismatch|provider name mismatch/.test(error.message)) continue;
            throw error;
        }
    }
    if (valid.length !== 1) throw new Error(`provider path ambiguity for ${entity.entityId}/${recordKind}: ${valid.map((item) => item.slug).join(",") || "none"}`);
    return valid[0];
}

async function probeAmbiguousProvider(revision, recordKind) {
    const evidence = [];
    for (const slug of ambiguousEntity.candidateSlugs) {
        const url = sourceUrl(revision.revision, recordKind, slug);
        try {
            const bytes = await fetchBytes(url);
            evidence.push({ slug, status: "unexpectedRecord", httpStatus: 200, url, rawArtifactBytes: bytes.length, rawArtifactSha256: sha256(bytes), gitBlob: gitBlobSha(bytes) });
        } catch (error) {
            if (error.status !== 404) throw error;
            const file = missingEvidencePath(revision.revision, recordKind, slug);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, error.bytes || Buffer.from(""));
            evidence.push({ slug, status: "notFound", httpStatus: 404, url, evidencePath: relative(file), rawArtifactBytes: (error.bytes || Buffer.alloc(0)).length, rawArtifactSha256: sha256(error.bytes || Buffer.alloc(0)), gitBlob: gitBlobSha(error.bytes || Buffer.alloc(0)) });
        }
    }
    return evidence;
}

async function acquire() {
    queueShard();
    const identity = localIdentityEvidence();
    if (identity.identityMismatches.length) throw new Error(`consumer mapper identity mismatch; capture blocked: ${JSON.stringify(identity.identityMismatches)}`);
    previousOverlapEvidence();
    fs.mkdirSync(providerRoot, { recursive: true });
    for (const revision of Object.values(revisions)) {
        const manifestBytes = await fetchBytes(`https://raw.githubusercontent.com/${repository}/${revision.revision}/${revision.packagePath}`);
        assertExpectedPackage(revision, manifestBytes);
        fs.mkdirSync(path.dirname(packageFile(revision)), { recursive: true });
        fs.writeFileSync(packageFile(revision), manifestBytes);
        for (const entity of resolvedEntities) {
            for (const recordKind of recordKinds) {
                const selected = await resolveAndFetch(revision, entity, recordKind);
                const file = sourcePath(revision.revision, recordKind, selected.slug);
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file, selected.bytes);
            }
        }
        for (const recordKind of recordKinds) await probeAmbiguousProvider(revision, recordKind);
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
    if (!beforeObject || !afterObject || Array.isArray(before) !== Array.isArray(after)) return [{ jsonPointer: pointer || "/", beforeValue: before === undefined ? null : before, afterValue: after === undefined ? null : after, beforeFieldDigest: fieldDigest(before), afterFieldDigest: fieldDigest(after) }];
    const keys = Array.isArray(before) && Array.isArray(after) ? Array.from({ length: Math.max(before.length, after.length) }, (_, index) => String(index)) : [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].sort();
    return keys.flatMap((key) => fieldDiffs(before?.[key], after?.[key], `${pointer}/${pointerToken(key)}`));
}

function artifact(revision, recordKind, entity, root = repositoryRoot) {
    const file = sourcePath(revision.revision, recordKind, entity.slug, root);
    if (!fs.existsSync(file)) throw new Error(`captured source missing: ${relative(file)}`);
    const bytes = fs.readFileSync(file);
    const value = parseProviderRecord(bytes, { ...entity, recordKind });
    return { gameVersion: revision.gameVersion, revision: revision.revision, packageVersion: revision.packageVersion, path: relative(file), url: sourceUrl(revision.revision, recordKind, entity.slug), gitBlob: gitBlobSha(bytes), rawArtifactBytes: bytes.length, rawArtifactSha256: sha256(bytes), embeddedIdPath: "$.id", embeddedId: value.id, embeddedName: value.name };
}

function packageEvidence(revision, root = repositoryRoot) {
    const file = packageFile(revision, root);
    if (!fs.existsSync(file)) throw new Error(`captured package manifest missing: ${relative(file)}`);
    const bytes = fs.readFileSync(file);
    const manifest = assertExpectedPackage(revision, bytes);
    return { gameVersion: revision.gameVersion, revision: revision.revision, packageVersion: revision.packageVersion, path: relative(file), url: `https://raw.githubusercontent.com/${repository}/${revision.revision}/${revision.packagePath}`, gitBlob: gitBlobSha(bytes), rawArtifactBytes: bytes.length, rawArtifactSha256: sha256(bytes), name: manifest.name, description: manifest.description };
}

function buildEntity(entity, identity, root = repositoryRoot) {
    const records = recordKinds.map((recordKind) => {
        const beforeFile = sourcePath(revisions.before.revision, recordKind, entity.slug, root);
        const afterFile = sourcePath(revisions.after.revision, recordKind, entity.slug, root);
        if (!fs.existsSync(beforeFile) || !fs.existsSync(afterFile)) throw new Error(`source pair missing for ${entity.entityId}/${recordKind}`);
        const beforeValue = parseProviderRecord(fs.readFileSync(beforeFile), { ...entity, recordKind });
        const afterValue = parseProviderRecord(fs.readFileSync(afterFile), { ...entity, recordKind });
        const before = artifact(revisions.before, recordKind, entity, root);
        const after = artifact(revisions.after, recordKind, entity, root);
        const diffs = fieldDiffs(beforeValue, afterValue);
        return { recordKind, before, after, comparison: { status: diffs.length ? "rawRecordChanged" : "rawRecordMatch", changedFieldCount: diffs.length, fieldDiffs: diffs, comparisonEligible: true, beforeFieldDigest: fieldDigest(beforeValue), afterFieldDigest: fieldDigest(afterValue), beforeArtifactSha256: before.rawArtifactSha256, afterArtifactSha256: after.rawArtifactSha256 } };
    });
    return { entityId: entity.entityId, name: entity.name, nameJa: entity.nameJa, providerSlug: entity.slug, providerId: entity.providerId, resolutionStatus: "resolvedUnambiguous", identityResolution: { status: "resolvedByLocalCatalogAndProviderName", localIdentityEvidenceDigest: digestStable(identity), providerNameMatches: true, providerEmbeddedIdMatches: true }, treeResolution: { method: "nonRecursiveGitTreePath", resolutionEvidence: "immutableRawPathWithEmbeddedId", directoryPaths: recordKinds.map((recordKind) => `src/data/English/${recordKind}`), pathResolution: recordKinds.map((recordKind) => ({ recordKind, path: `src/data/English/${recordKind}/${entity.slug}.json` })) }, records };
}

function buildAmbiguousEntity(root = repositoryRoot) {
    const evidence = Object.values(revisions).flatMap((revision) => recordKinds.flatMap((recordKind) => {
        const file = missingEvidencePath(revision.revision, recordKind, ambiguousEntity.candidateSlugs[0], root);
        if (!fs.existsSync(file)) throw new Error(`ambiguous provider evidence missing: ${relative(file)}`);
        const bytes = fs.readFileSync(file);
        return { gameVersion: revision.gameVersion, revision: revision.revision, recordKind, slug: ambiguousEntity.candidateSlugs[0], status: "notFound", httpStatus: 404, path: relative(file), url: sourceUrl(revision.revision, recordKind, ambiguousEntity.candidateSlugs[0]), rawArtifactBytes: bytes.length, rawArtifactSha256: sha256(bytes), gitBlob: gitBlobSha(bytes) };
    }));
    return { entityId: ambiguousEntity.entityId, nameJa: ambiguousEntity.nameJa, resolutionStatus: "unresolvedProviderRecord", providerSlug: null, providerId: null, candidateSlugs: ambiguousEntity.candidateSlugs, providerEvidence: evidence, reason: "No candidate English provider path returned a record in either pinned revision; provider name and embedded id cannot be proven.", canonicalMapping: null, canonicalPromotion: "forbiddenUntilProviderIdentityIsResolved" };
}

function buildSnapshot(root = repositoryRoot) {
    const queue = queueShard();
    const identity = localIdentityEvidence(root);
    const overlap = previousOverlapEvidence(root);
    const entities = resolvedEntities.map((entity) => buildEntity(entity, identity.entities.find((item) => item.entityId === entity.entityId), root));
    const unresolved = [buildAmbiguousEntity(root)];
    const records = entities.flatMap((entity) => entity.records);
    const changedRecords = records.filter((record) => record.comparison.status === "rawRecordChanged");
    const changedFields = records.reduce((sum, record) => sum + record.comparison.changedFieldCount, 0);
    const claim = {
        transitionId: "genshin:6.7->7.0",
        fromGameVersion: revisions.before.gameVersion,
        toGameVersion: revisions.after.gameVersion,
        provider,
        sourceFamily,
        sourceNamespace,
        repository,
        treeResolution: { method: "nonRecursiveGitTreePath", resolutionEvidence: "immutableRawPathWithEmbeddedId", note: "Resolved paths are accepted only when both pinned revisions contain the expected provider name and explicit $.id; missing provider paths remain unresolved." },
        identityResolution: identity,
        shard: { shardId, queuePath: queue.queuePath, authoritativeCandidateCount: queue.candidateCount, authoritativeCandidateIds: queue.candidateIds, authoritativeCandidateIdsDigest: queue.candidateIdsDigest, authoritativeEntityCount: queue.entityCount, authoritativeEntityIds: queue.entityIds, authoritativeEntityIdsDigest: queue.entityIdsDigest, capturedNewEntityIds: resolvedEntities.map((entity) => entity.entityId), skippedOverlapEntityIds: overlapEntityIds, overlapPolicy: "alreadyCapturedByBehaviorShard13", overlapEvidence: [overlap] },
        versionBindings: Object.values(revisions).map((revision) => ({ gameVersion: revision.gameVersion, revision: revision.revision, packageVersion: revision.packageVersion, status: "strictlyBound", package: packageEvidence(revision, root) })),
        resolvedEntities: entities,
        unresolvedEntities: unresolved,
        travelerVariantEvidence: [],
        variantAmbiguities: [],
        travelerVariantPolicy: { status: "notApplicable", failClosedOnEncounter: true, entityIds: travelerEntityIds, note: "No Traveler entity is in shard14; any future Traveler queue entry must remain unresolved until its variant identity is explicit." },
        coverage: { resolvedEntityIds: resolvedEntities.map((entity) => entity.entityId), ambiguousEntityIds, recordKinds, authoritativeCandidateCoverage: "entitySourceRecordsForNewEntitiesCompleteWithOverlapAndAmbiguity", resolvedEntityRecordCoverage: "complete", travelerVariantRecordCoverage: "notApplicable", repositoryCandidateCoverage: "partial", authoritativeCandidateCount: queue.candidateCount, authoritativeEntityCount: queue.entityCount, resolvedEntityCount: entities.length, ambiguousEntityCount: unresolved.length, resolvedRecordCount: records.length, changedRecordCount: changedRecords.length, changedFieldCount: changedFields, overlapEntityCount: overlapEntityIds.length, crossVariantComparisons: 0, canIssueEligibilityCertificate: false, canPromoteCanonical: false }
    };
    return { schemaVersion: 1, kind: "genshinVersionTransitionBehaviorShardSnapshot", generatedAt, claim, summary: { shardId, authoritativeCandidates: queue.candidateCount, authoritativeEntities: queue.entityCount, resolvedEntities: entities.length, overlapSkippedEntities: overlapEntityIds.length, ambiguousEntities: unresolved.length, resolvedRecords: records.length, changedRecords: changedRecords.length, changedFields, sourceFamilyCount: 1, certificateEligibleClaims: 0 }, gateEligibility: { status: "singleCorrelatedFamilyFailClosed", sourceFamilyCount: 1, canIssueEligibilityCertificate: false, canPromoteCanonical: false, reasons: ["providerIndependenceInsufficient", "behaviorSemanticsNotParsed", "providerRecordMissing"] }, fieldDigestAlgorithm: "sha256-stable-json-v1", fieldDigest: digestStable(claim) };
}

function validateArtifact(candidate, expectedRevision, expectedRecordKind, entity, root = repositoryRoot) {
    const reasons = [];
    const file = candidate?.path ? path.resolve(root, candidate.path) : null;
    const expected = sourcePath(expectedRevision.revision, expectedRecordKind, entity.slug, root);
    if (!file || path.resolve(file) !== path.resolve(expected)) reasons.push("pathMismatch");
    if (!file || !fs.existsSync(file)) return [...reasons, "missing"];
    const bytes = fs.readFileSync(file);
    let value;
    try { value = parseProviderRecord(bytes, { ...entity, recordKind: expectedRecordKind }); } catch (error) { reasons.push(`embeddedIdentityInvalid:${error.message}`); }
    if (candidate.gameVersion !== expectedRevision.gameVersion || candidate.revision !== expectedRevision.revision || candidate.packageVersion !== expectedRevision.packageVersion) reasons.push("versionBindingMismatch");
    if (candidate.rawArtifactBytes !== bytes.length) reasons.push("bytesMismatch");
    if (candidate.rawArtifactSha256 !== sha256(bytes)) reasons.push("sha256Mismatch");
    if (candidate.gitBlob !== gitBlobSha(bytes)) reasons.push("gitBlobMismatch");
    if (candidate.embeddedIdPath !== "$.id" || candidate.embeddedId !== entity.providerId || value?.id !== entity.providerId) reasons.push("embeddedIdMismatch");
    if (candidate.embeddedName !== entity.name || value?.name !== entity.name) reasons.push("embeddedNameMismatch");
    return reasons;
}

function validatePackageBinding(binding, revision, root, reasons) {
    const file = binding?.package?.path ? path.resolve(root, binding.package.path) : null;
    if (!binding || binding.gameVersion !== revision.gameVersion || binding.revision !== revision.revision || binding.packageVersion !== revision.packageVersion || binding.status !== "strictlyBound" || !file || !fs.existsSync(file)) { reasons.push(`versionBindingInvalid:${revision.gameVersion}`); return; }
    const bytes = fs.readFileSync(file);
    try { assertExpectedPackage(revision, bytes); } catch (error) { reasons.push(`packageBindingInvalid:${revision.gameVersion}:${error.message}`); }
    if (binding.package.rawArtifactBytes !== bytes.length || binding.package.rawArtifactSha256 !== sha256(bytes) || binding.package.gitBlob !== gitBlobSha(bytes)) reasons.push(`packageMetadataInvalid:${revision.gameVersion}`);
}

function validateBehaviorShard14Snapshot(snapshot, { repositoryRoot: root = repositoryRoot } = {}) {
    const reasons = [];
    if (snapshot?.schemaVersion !== 1 || snapshot?.kind !== "genshinVersionTransitionBehaviorShardSnapshot") reasons.push("identityInvalid");
    if (snapshot?.generatedAt !== generatedAt) reasons.push("generatedAtInvalid");
    if (snapshot?.fieldDigestAlgorithm !== "sha256-stable-json-v1" || snapshot?.fieldDigest !== digestStable(snapshot?.claim)) reasons.push("fieldDigestInvalid");
    if (snapshot?.claim?.transitionId !== "genshin:6.7->7.0" || snapshot?.claim?.fromGameVersion !== "6.7" || snapshot?.claim?.toGameVersion !== "7.0") reasons.push("transitionBindingInvalid");
    if (snapshot?.claim?.provider !== provider || snapshot?.claim?.sourceFamily !== sourceFamily || snapshot?.claim?.sourceNamespace !== sourceNamespace || snapshot?.claim?.repository !== repository) reasons.push("providerBindingInvalid");
    const queue = queueShard();
    const shard = snapshot?.claim?.shard;
    if (shard?.shardId !== shardId || shard?.authoritativeCandidateCount !== queue.candidateCount || digestStable(shard?.authoritativeCandidateIds) !== queue.candidateIdsDigest || digestStable(shard?.authoritativeEntityIds) !== queue.entityIdsDigest || digestStable(shard?.capturedNewEntityIds) !== digestStable(resolvedEntities.map((entity) => entity.entityId)) || digestStable(shard?.skippedOverlapEntityIds) !== digestStable(overlapEntityIds) || shard?.overlapPolicy !== "alreadyCapturedByBehaviorShard13" || !Array.isArray(shard?.overlapEvidence) || shard.overlapEvidence.length !== 1) reasons.push("authoritativeShardBindingInvalid");
    try {
        const identity = localIdentityEvidence(root);
        if (digestStable(snapshot?.claim?.identityResolution) !== digestStable(identity)) reasons.push("localIdentityEvidenceInvalid");
        if (identity.identityMismatches.length) reasons.push("consumerMapperIdentityMismatch");
    } catch (error) { reasons.push(`localIdentityEvidenceInvalid:${error.message}`); }
    const bindings = Array.isArray(snapshot?.claim?.versionBindings) ? snapshot.claim.versionBindings : [];
    if (bindings.length !== 2) reasons.push("versionBindingsIncomplete");
    for (const revision of Object.values(revisions)) validatePackageBinding(bindings.find((candidate) => candidate.gameVersion === revision.gameVersion), revision, root, reasons);
    const entities = Array.isArray(snapshot?.claim?.resolvedEntities) ? snapshot.claim.resolvedEntities : [];
    if (entities.length !== resolvedEntities.length || new Set(entities.map((entity) => entity.entityId)).size !== entities.length) reasons.push("resolvedEntitiesIncomplete");
    for (const expected of resolvedEntities) {
        const entity = entities.find((candidate) => candidate.entityId === expected.entityId);
        if (!entity || entity.name !== expected.name || entity.nameJa !== expected.nameJa || entity.providerSlug !== expected.slug || entity.providerId !== expected.providerId || entity.resolutionStatus !== "resolvedUnambiguous") { reasons.push(`resolvedEntityInvalid:${expected.entityId}`); continue; }
        if (!Array.isArray(entity.records) || entity.records.length !== recordKinds.length) { reasons.push(`recordsIncomplete:${expected.entityId}`); continue; }
        for (const recordKind of recordKinds) {
            const record = entity.records.find((candidate) => candidate.recordKind === recordKind);
            if (!record) { reasons.push(`recordMissing:${expected.entityId}:${recordKind}`); continue; }
            reasons.push(...validateArtifact(record.before, revisions.before, recordKind, expected, root).map((reason) => `${expected.entityId}:${recordKind}:before:${reason}`));
            reasons.push(...validateArtifact(record.after, revisions.after, recordKind, expected, root).map((reason) => `${expected.entityId}:${recordKind}:after:${reason}`));
            const beforeValue = readJson(path.resolve(root, record.before.path));
            const afterValue = readJson(path.resolve(root, record.after.path));
            const diffs = fieldDiffs(beforeValue, afterValue);
            if (record.comparison?.status !== (diffs.length ? "rawRecordChanged" : "rawRecordMatch") || record.comparison?.changedFieldCount !== diffs.length || digestStable(record.comparison?.fieldDiffs) !== digestStable(diffs) || record.comparison?.beforeFieldDigest !== fieldDigest(beforeValue) || record.comparison?.afterFieldDigest !== fieldDigest(afterValue) || record.comparison?.beforeArtifactSha256 !== record.before.rawArtifactSha256 || record.comparison?.afterArtifactSha256 !== record.after.rawArtifactSha256) reasons.push(`comparisonInvalid:${expected.entityId}:${recordKind}`);
        }
    }
    const unresolved = Array.isArray(snapshot?.claim?.unresolvedEntities) ? snapshot.claim.unresolvedEntities : [];
    if (unresolved.length !== ambiguousEntityIds.length) reasons.push("ambiguousEntitiesIncomplete");
    for (const expected of [ambiguousEntity]) {
        const candidate = unresolved.find((entity) => entity.entityId === expected.entityId);
        if (!candidate || candidate.resolutionStatus !== "unresolvedProviderRecord" || candidate.providerSlug !== null || candidate.providerId !== null || candidate.canonicalMapping !== null || candidate.canonicalPromotion !== "forbiddenUntilProviderIdentityIsResolved") reasons.push(`ambiguousEntityInvalid:${expected.entityId}`);
        if (!Array.isArray(candidate?.providerEvidence) || candidate.providerEvidence.length !== Object.keys(revisions).length * recordKinds.length || candidate.providerEvidence.some((evidence) => evidence.status !== "notFound" || evidence.httpStatus !== 404)) reasons.push(`ambiguousProviderEvidenceInvalid:${expected.entityId}`);
        for (const evidence of candidate?.providerEvidence || []) {
            const file = evidence.path ? path.resolve(root, evidence.path) : null;
            if (!file || !fs.existsSync(file)) { reasons.push(`ambiguousProviderEvidenceMissing:${expected.entityId}`); continue; }
            const bytes = fs.readFileSync(file);
            if (evidence.rawArtifactBytes !== bytes.length || evidence.rawArtifactSha256 !== sha256(bytes) || evidence.gitBlob !== gitBlobSha(bytes)) reasons.push(`ambiguousProviderEvidenceDigestInvalid:${expected.entityId}`);
        }
    }
    if (!Array.isArray(snapshot?.claim?.travelerVariantEvidence) || snapshot.claim.travelerVariantEvidence.length !== 0 || !Array.isArray(snapshot?.claim?.variantAmbiguities) || snapshot.claim.variantAmbiguities.length !== 0) reasons.push("travelerVariantEvidenceUnexpected");
    if (snapshot?.claim?.travelerVariantPolicy?.failClosedOnEncounter !== true || snapshot.claim.travelerVariantPolicy.status !== "notApplicable") reasons.push("travelerPolicyInvalid");
    if (snapshot?.summary?.shardId !== shardId || snapshot?.summary?.authoritativeCandidates !== expectedCandidateCount || snapshot?.summary?.authoritativeEntities !== authoritativeEntityIds.length || snapshot?.summary?.resolvedEntities !== resolvedEntities.length || snapshot?.summary?.overlapSkippedEntities !== overlapEntityIds.length || snapshot?.summary?.ambiguousEntities !== ambiguousEntityIds.length || snapshot?.summary?.resolvedRecords !== resolvedEntities.length * recordKinds.length || snapshot?.summary?.sourceFamilyCount !== 1 || snapshot?.summary?.certificateEligibleClaims !== 0) reasons.push("summaryInvalid");
    if (snapshot?.claim?.coverage?.canIssueEligibilityCertificate !== false || snapshot?.claim?.coverage?.canPromoteCanonical !== false || snapshot?.gateEligibility?.sourceFamilyCount !== 1 || snapshot?.gateEligibility?.canIssueEligibilityCertificate !== false || snapshot?.gateEligibility?.canPromoteCanonical !== false) reasons.push("failClosedDispositionInvalid");
    return { valid: reasons.length === 0, reasons };
}

function buildCheckpoint(snapshot = buildSnapshot()) {
    const queue = queueShard();
    const claim = { queueShardId: shardId, queuePath: queue.queuePath, authoritativeCandidateIdsDigest: queue.candidateIdsDigest, authoritativeEntityIdsDigest: queue.entityIdsDigest, requestedEntityIds: queue.entityIds, capturedEntityIds: resolvedEntities.map((entity) => entity.entityId), skippedOverlapEntityIds: overlapEntityIds, ambiguousEntityIds, materializedSnapshotPath: relative(outputPath), materializedSnapshotFieldDigest: snapshot.fieldDigest, sourceNamespace, identityResolutionStatus: snapshot.claim.identityResolution.status, sourceFamilyCount: 1, canIssueEligibilityCertificate: false, canPromoteCanonical: false };
    return { schemaVersion: 1, kind: "genshinVersionTransitionBehaviorShardCaptureCheckpoint", generatedAt, transitionId: "genshin:6.7->7.0", shardId, status: "blockedByIdentityAmbiguity", authoritativeCandidateCount: queue.candidateCount, requestedEntityCount: queue.entityCount, capturedEntityCount: resolvedEntities.length, skippedOverlapEntityCount: overlapEntityIds.length, ambiguousEntityCount: ambiguousEntityIds.length, revisions: Object.fromEntries(Object.entries(revisions).map(([side, revision]) => [side, { gameVersion: revision.gameVersion, revision: revision.revision, status: "complete", completedEntityIds: resolvedEntities.map((entity) => entity.entityId), completedArtifactCount: resolvedEntities.length * recordKinds.length, ambiguousEntityIds }])), materializedSnapshot: { path: relative(outputPath), fieldDigest: snapshot.fieldDigest, entityCount: snapshot.summary.resolvedEntities, recordCount: snapshot.summary.resolvedRecords, changedRecordCount: snapshot.summary.changedRecords, changedFieldCount: snapshot.summary.changedFields }, nextTask: "Resolve provider identity for local entity 10000124 (Yafoda) against a later or independently enumerated provider source; do not capture or promote it while unresolved.", gateEligibility: snapshot.gateEligibility, claim, fieldDigestAlgorithm: "sha256-stable-json-v1", fieldDigest: digestStable(claim) };
}

function validateCheckpoint(checkpoint, { repositoryRoot: root = repositoryRoot } = {}) {
    const reasons = [];
    const queue = queueShard();
    if (checkpoint?.schemaVersion !== 1 || checkpoint?.kind !== "genshinVersionTransitionBehaviorShardCaptureCheckpoint") reasons.push("identityInvalid");
    if (checkpoint?.generatedAt !== generatedAt || checkpoint?.transitionId !== "genshin:6.7->7.0" || checkpoint?.shardId !== shardId) reasons.push("transitionBindingInvalid");
    if (checkpoint?.status !== "blockedByIdentityAmbiguity" || checkpoint?.authoritativeCandidateCount !== queue.candidateCount || checkpoint?.requestedEntityCount !== queue.entityCount || checkpoint?.capturedEntityCount !== resolvedEntities.length || checkpoint?.skippedOverlapEntityCount !== overlapEntityIds.length || checkpoint?.ambiguousEntityCount !== ambiguousEntityIds.length) reasons.push("checkpointCoverageInvalid");
    if (checkpoint?.fieldDigestAlgorithm !== "sha256-stable-json-v1" || checkpoint?.fieldDigest !== digestStable(checkpoint?.claim)) reasons.push("fieldDigestInvalid");
    if (checkpoint?.claim?.queueShardId !== shardId || checkpoint?.claim?.authoritativeCandidateIdsDigest !== queue.candidateIdsDigest || checkpoint?.claim?.authoritativeEntityIdsDigest !== queue.entityIdsDigest || digestStable(checkpoint?.claim?.requestedEntityIds) !== queue.entityIdsDigest || digestStable(checkpoint?.claim?.capturedEntityIds) !== digestStable(resolvedEntities.map((entity) => entity.entityId)) || digestStable(checkpoint?.claim?.skippedOverlapEntityIds) !== digestStable(overlapEntityIds) || digestStable(checkpoint?.claim?.ambiguousEntityIds) !== digestStable(ambiguousEntityIds) || checkpoint?.claim?.sourceNamespace !== sourceNamespace || checkpoint?.claim?.canIssueEligibilityCertificate !== false || checkpoint?.claim?.canPromoteCanonical !== false) reasons.push("checkpointClaimInvalid");
    const materializedPath = checkpoint?.materializedSnapshot?.path ? path.resolve(root, checkpoint.materializedSnapshot.path) : null;
    if (!materializedPath || !fs.existsSync(materializedPath)) reasons.push("materializedSnapshotMissing");
    else {
        let snapshot;
        try { snapshot = readJson(materializedPath); } catch { reasons.push("materializedSnapshotInvalid"); }
        if (snapshot && (checkpoint.materializedSnapshot.fieldDigest !== snapshot.fieldDigest || !validateBehaviorShard14Snapshot(snapshot, { repositoryRoot: root }).valid)) reasons.push("materializedSnapshotInvalid");
    }
    for (const side of ["before", "after"]) {
        const progress = checkpoint?.revisions?.[side];
        if (progress?.status !== "complete" || progress?.completedArtifactCount !== resolvedEntities.length * recordKinds.length || digestStable(progress?.completedEntityIds) !== digestStable(resolvedEntities.map((entity) => entity.entityId)) || digestStable(progress?.ambiguousEntityIds) !== digestStable(ambiguousEntityIds)) reasons.push(`revisionCheckpointInvalid:${side}`);
    }
    if (checkpoint?.gateEligibility?.sourceFamilyCount !== 1 || checkpoint?.gateEligibility?.canIssueEligibilityCertificate !== false || checkpoint?.gateEligibility?.canPromoteCanonical !== false) reasons.push("failClosedDispositionInvalid");
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

module.exports = { acquire, ambiguousEntityIds, buildCheckpoint, buildSnapshot, checkpointPath, generatedAt, localIdentityEvidence, outputPath, overlapEntityIds, previousOverlapEvidence, providerRoot, queueShard, recordKinds, resolvedEntities, revisions, shardId, sourceNamespace, validateBehaviorShard14Snapshot, validateCheckpoint, writeSnapshot };
