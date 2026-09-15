"use strict";

/**
 * Capture the authoritative behaviorSpec shard 13 for the 6.7 -> 7.0
 * transition.  This is source evidence only: it records both pinned
 * genshin-db revisions and deterministic raw-record diffs, but never parses
 * prose into runtime semantics, issues a certificate, or promotes canonical
 * data.
 *
 * Provider slugs are accepted only after the concrete raw path in each pinned
 * revision contains the expected English name and embedded $.id.  The local
 * catalog/source-text records are the identity authority.  The legacy profile
 * mapper currently has an entry for 10000108 but no entries for 10000109-15;
 * that incompleteness is recorded explicitly and is never filled by guessing.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const base = require("./genshinVersionTransitionBehaviorEntityCapture.cjs");
const { digestStable } = require("./genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const transitionRoot = path.join(repositoryRoot, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0");
const sourceNamespace = "genshin-db-behavior-shard13";
const providerRoot = path.join(transitionRoot, "sources", sourceNamespace);
const queuePath = path.join(repositoryRoot, "reports", "genshin-evidence-task-queue.json");
const outputPath = path.join(transitionRoot, "behavior-shard-13-snapshot.json");
const checkpointPath = path.join(transitionRoot, "behavior-shard-13-capture-checkpoint.json");
const generatedAt = base.generatedAt;
const revisions = base.revisions;
const repository = "theBowja/genshin-db";
const provider = "genshin-db";
const sourceFamily = "GenshinData-derived";
const recordKinds = ["talents", "constellations"];
const shardId = "behavior:behaviorSpec:semanticDecisionRequired:standard:13";
const travelerEntityIds = ["10000005", "10000007"];
const expectedCandidateCount = 100;
const expectedEntityIds = [
    "10000108", "10000109", "10000110", "10000111",
    "10000112", "10000113", "10000114", "10000115"
];

const localIdentityPaths = {
    catalog: "games/genshin/data/characters.json",
    talents: "games/genshin/data/character-talents.json",
    constellations: "games/genshin/data/character-constellations.json",
    consumerMapper: "games/js/genshinProfileMapper.js"
};

// These mappings were resolved against the non-recursive English trees in
// both pinned revisions.  They are not derived from a numeric suffix alone.
const resolvedEntities = [
    { entityId: "10000108", name: "Lan Yan", nameJa: "藍硯", slug: "lanyan", slugCandidates: ["lanyan"], providerId: 10801 },
    { entityId: "10000109", name: "Yumemizuki Mizuki", nameJa: "夢見月瑞希", slug: "yumemizukimizuki", slugCandidates: ["yumemizukimizuki"], providerId: 10901 },
    { entityId: "10000110", name: "Iansan", nameJa: "イアンサ", slug: "iansan", slugCandidates: ["iansan"], providerId: 11001 },
    { entityId: "10000111", name: "Varesa", nameJa: "ヴァレサ", slug: "varesa", slugCandidates: ["varesa"], providerId: 11101 },
    { entityId: "10000112", name: "Escoffier", nameJa: "エスコフィエ", slug: "escoffier", slugCandidates: ["escoffier"], providerId: 11201 },
    { entityId: "10000113", name: "Ifa", nameJa: "イファ", slug: "ifa", slugCandidates: ["ifa"], providerId: 11301 },
    { entityId: "10000114", name: "Skirk", nameJa: "スカーク", slug: "skirk", slugCandidates: ["skirk"], providerId: 11401 },
    { entityId: "10000115", name: "Dahlia", nameJa: "ダリア", slug: "dahlia", slugCandidates: ["dahlia"], providerId: 11501 }
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

function absolute(root, relativePath) {
    return path.resolve(root, relativePath);
}

function sourcePath(revision, recordKind, slug, root = repositoryRoot) {
    return path.join(root, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0", "sources", sourceNamespace, revision, "English", recordKind, `${slug}.json`);
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
    for (const entity of resolvedEntities) {
        const pattern = new RegExp(`\\"${entity.entityId}\\"\\s*:\\s*\\"([^\\"]*)\\"`, "g");
        const values = [...text.matchAll(pattern)].map((match) => match[1]);
        const uniqueValues = [...new Set(values)];
        entries[entity.entityId] = { values: uniqueValues, expectedNameJa: entity.nameJa };
        if (uniqueValues.length === 0) missingEntityIds.push(entity.entityId);
        else if (uniqueValues.length !== 1 || uniqueValues[0] !== entity.nameJa) {
            identityMismatches.push({ entityId: entity.entityId, expectedNameJa: entity.nameJa, observedValues: uniqueValues });
        }
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
    const entities = resolvedEntities.map((entity) => {
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
    if (candidateIds.length !== expectedCandidateCount || new Set(candidateIds).size !== candidateIds.length || !candidateIds.every((id) => /^behavior:100\d{5}:[^:]+:.+$/.test(id))) {
        throw new Error(`authoritative behaviorSpec shard 13 candidate inventory invalid: ${candidateIds.length}`);
    }
    const entityIds = [...new Set(candidateIds.map((candidateId) => candidateId.split(":")[1]))];
    if (digestStable(entityIds) !== digestStable(expectedEntityIds)) throw new Error(`shard 13 entity inventory mismatch: ${entityIds.join(",")}`);
    if (entityIds.some((entityId) => travelerEntityIds.includes(entityId))) throw new Error("Traveler identity must remain fail-closed");
    return {
        shardId,
        queuePath: relative(queuePath),
        candidateIds,
        candidateIdsDigest: digestStable(candidateIds),
        entityIds,
        entityIdsDigest: digestStable(entityIds),
        candidateCount: candidateIds.length,
        entityCount: entityIds.length
    };
}

async function fetchBytes(url) {
    const response = await fetch(url, { headers: { "User-Agent": "damageTool-genshin-behavior-shard-13" } });
    if (!response.ok) {
        const error = new Error(`fetch failed ${response.status}: ${url}`);
        error.status = response.status;
        throw error;
    }
    return Buffer.from(await response.arrayBuffer());
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

async function acquire() {
    const queue = queueShard();
    const identity = localIdentityEvidence();
    if (identity.identityMismatches.length) throw new Error(`consumer mapper identity mismatch; capture blocked: ${JSON.stringify(identity.identityMismatches)}`);
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
    }
    return { candidateCount: queue.candidateCount, entityCount: queue.entityCount };
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
    if (!beforeObject || !afterObject || Array.isArray(before) !== Array.isArray(after)) return [{
        jsonPointer: pointer || "/",
        beforeValue: before === undefined ? null : before,
        afterValue: after === undefined ? null : after,
        beforeFieldDigest: fieldDigest(before),
        afterFieldDigest: fieldDigest(after)
    }];
    const keys = Array.isArray(before) && Array.isArray(after)
        ? Array.from({ length: Math.max(before.length, after.length) }, (_, index) => String(index))
        : [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].sort();
    return keys.flatMap((key) => fieldDiffs(before?.[key], after?.[key], `${pointer}/${pointerToken(key)}`));
}

function artifact(revision, recordKind, entity, root = repositoryRoot) {
    const file = sourcePath(revision.revision, recordKind, entity.slug, root);
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

function packageEvidence(revision, root = repositoryRoot) {
    const file = packageFile(revision, root);
    if (!fs.existsSync(file)) throw new Error(`captured package manifest missing: ${relative(file)}`);
    const bytes = fs.readFileSync(file);
    const manifest = assertExpectedPackage(revision, bytes);
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
        return {
            recordKind,
            before,
            after,
            comparison: {
                status: diffs.length ? "rawRecordChanged" : "rawRecordMatch",
                changedFieldCount: diffs.length,
                fieldDiffs: diffs,
                comparisonEligible: true,
                beforeFieldDigest: fieldDigest(beforeValue),
                afterFieldDigest: fieldDigest(afterValue),
                beforeArtifactSha256: before.rawArtifactSha256,
                afterArtifactSha256: after.rawArtifactSha256
            }
        };
    });
    return {
        entityId: entity.entityId,
        name: entity.name,
        nameJa: entity.nameJa,
        providerSlug: entity.slug,
        providerId: entity.providerId,
        resolutionStatus: "resolvedUnambiguous",
        identityResolution: {
            status: "resolvedByLocalCatalogAndProviderName",
            localIdentityEvidenceDigest: digestStable(identity),
            providerNameMatches: true,
            providerEmbeddedIdMatches: true
        },
        treeResolution: {
            method: "nonRecursiveGitTreePath",
            resolutionEvidence: "immutableRawPathWithEmbeddedId",
            directoryPaths: recordKinds.map((recordKind) => `src/data/English/${recordKind}`),
            pathResolution: recordKinds.map((recordKind) => ({ recordKind, path: `src/data/English/${recordKind}/${entity.slug}.json` }))
        },
        records
    };
}

function buildSnapshot(root = repositoryRoot) {
    const queue = queueShard();
    const identity = localIdentityEvidence(root);
    const entities = resolvedEntities.map((entity) => buildEntity(entity, identity.entities.find((item) => item.entityId === entity.entityId), root));
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
        treeResolution: {
            method: "nonRecursiveGitTreePath",
            resolutionEvidence: "immutableRawPathWithEmbeddedId",
            note: "Each concrete path is accepted only when both pinned revisions contain the expected provider name and explicit $.id."
        },
        identityResolution: identity,
        shard: {
            shardId,
            queuePath: queue.queuePath,
            authoritativeCandidateCount: queue.candidateCount,
            authoritativeCandidateIds: queue.candidateIds,
            authoritativeCandidateIdsDigest: queue.candidateIdsDigest,
            authoritativeEntityCount: queue.entityCount,
            authoritativeEntityIds: queue.entityIds,
            authoritativeEntityIdsDigest: queue.entityIdsDigest,
            capturedNewEntityIds: resolvedEntities.map((entity) => entity.entityId),
            skippedOverlapEntityIds: [],
            overlapPolicy: "noneWithMaterializedBehaviorShards01To12"
        },
        versionBindings: Object.values(revisions).map((revision) => ({
            gameVersion: revision.gameVersion,
            revision: revision.revision,
            packageVersion: revision.packageVersion,
            status: "strictlyBound",
            package: packageEvidence(revision, root)
        })),
        resolvedEntities: entities,
        travelerVariantEvidence: [],
        variantAmbiguities: [],
        travelerVariantPolicy: {
            status: "notApplicable",
            failClosedOnEncounter: true,
            entityIds: travelerEntityIds,
            note: "No Traveler entity is in shard13; any future Traveler queue entry must remain unresolved until its variant identity is explicit."
        },
        coverage: {
            resolvedEntityIds: resolvedEntities.map((entity) => entity.entityId),
            ambiguousEntityIds: [],
            recordKinds,
            authoritativeCandidateCoverage: "entitySourceRecordsComplete",
            resolvedEntityRecordCoverage: "complete",
            travelerVariantRecordCoverage: "notApplicable",
            repositoryCandidateCoverage: "partial",
            authoritativeCandidateCount: queue.candidateCount,
            authoritativeEntityCount: queue.entityCount,
            resolvedEntityCount: entities.length,
            resolvedRecordCount: records.length,
            changedRecordCount: changedRecords.length,
            changedFieldCount: changedFields,
            overlapEntityCount: 0,
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
            authoritativeCandidates: queue.candidateCount,
            authoritativeEntities: queue.entityCount,
            resolvedEntities: entities.length,
            overlapSkippedEntities: 0,
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
            reasons: ["providerIndependenceInsufficient", "behaviorSemanticsNotParsed"]
        },
        fieldDigestAlgorithm: "sha256-stable-json-v1",
        fieldDigest: digestStable(claim)
    };
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
    if (!binding || binding.gameVersion !== revision.gameVersion || binding.revision !== revision.revision || binding.packageVersion !== revision.packageVersion || binding.status !== "strictlyBound" || !file || !fs.existsSync(file)) {
        reasons.push(`versionBindingInvalid:${revision.gameVersion}`);
        return;
    }
    const bytes = fs.readFileSync(file);
    try { assertExpectedPackage(revision, bytes); } catch (error) { reasons.push(`packageBindingInvalid:${revision.gameVersion}:${error.message}`); }
    if (binding.package.rawArtifactBytes !== bytes.length || binding.package.rawArtifactSha256 !== sha256(bytes) || binding.package.gitBlob !== gitBlobSha(bytes)) reasons.push(`packageMetadataInvalid:${revision.gameVersion}`);
}

function validateBehaviorShard13Snapshot(snapshot, { repositoryRoot: root = repositoryRoot } = {}) {
    const reasons = [];
    if (snapshot?.schemaVersion !== 1 || snapshot?.kind !== "genshinVersionTransitionBehaviorShardSnapshot") reasons.push("identityInvalid");
    if (snapshot?.generatedAt !== generatedAt) reasons.push("generatedAtInvalid");
    if (snapshot?.fieldDigestAlgorithm !== "sha256-stable-json-v1" || snapshot?.fieldDigest !== digestStable(snapshot?.claim)) reasons.push("fieldDigestInvalid");
    if (snapshot?.claim?.transitionId !== "genshin:6.7->7.0" || snapshot?.claim?.fromGameVersion !== "6.7" || snapshot?.claim?.toGameVersion !== "7.0") reasons.push("transitionBindingInvalid");
    if (snapshot?.claim?.provider !== provider || snapshot?.claim?.sourceFamily !== sourceFamily || snapshot?.claim?.sourceNamespace !== sourceNamespace || snapshot?.claim?.repository !== repository) reasons.push("providerBindingInvalid");
    const queue = queueShard();
    const shard = snapshot?.claim?.shard;
    if (shard?.shardId !== shardId || shard?.authoritativeCandidateCount !== queue.candidateCount || digestStable(shard?.authoritativeCandidateIds) !== queue.candidateIdsDigest || digestStable(shard?.authoritativeEntityIds) !== queue.entityIdsDigest || digestStable(shard?.capturedNewEntityIds) !== digestStable(expectedEntityIds) || !Array.isArray(shard?.skippedOverlapEntityIds) || shard.skippedOverlapEntityIds.length !== 0 || shard?.overlapPolicy !== "noneWithMaterializedBehaviorShards01To12") reasons.push("authoritativeShardBindingInvalid");
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
        if (!entity || entity.name !== expected.name || entity.nameJa !== expected.nameJa || entity.providerSlug !== expected.slug || entity.providerId !== expected.providerId || entity.resolutionStatus !== "resolvedUnambiguous") {
            reasons.push(`resolvedEntityInvalid:${expected.entityId}`);
            continue;
        }
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
    if (!Array.isArray(snapshot?.claim?.travelerVariantEvidence) || snapshot.claim.travelerVariantEvidence.length !== 0 || !Array.isArray(snapshot?.claim?.variantAmbiguities) || snapshot.claim.variantAmbiguities.length !== 0) reasons.push("travelerVariantEvidenceUnexpected");
    if (snapshot?.claim?.travelerVariantPolicy?.failClosedOnEncounter !== true || snapshot.claim.travelerVariantPolicy.status !== "notApplicable") reasons.push("travelerPolicyInvalid");
    if (snapshot?.summary?.shardId !== shardId || snapshot?.summary?.authoritativeCandidates !== expectedCandidateCount || snapshot?.summary?.authoritativeEntities !== expectedEntityIds.length || snapshot?.summary?.resolvedEntities !== expectedEntityIds.length || snapshot?.summary?.overlapSkippedEntities !== 0 || snapshot?.summary?.ambiguousEntities !== 0 || snapshot?.summary?.resolvedRecords !== expectedEntityIds.length * recordKinds.length || snapshot?.summary?.sourceFamilyCount !== 1 || snapshot?.summary?.certificateEligibleClaims !== 0) reasons.push("summaryInvalid");
    if (snapshot?.claim?.coverage?.canIssueEligibilityCertificate !== false || snapshot?.claim?.coverage?.canPromoteCanonical !== false || snapshot?.gateEligibility?.sourceFamilyCount !== 1 || snapshot?.gateEligibility?.canIssueEligibilityCertificate !== false || snapshot?.gateEligibility?.canPromoteCanonical !== false) reasons.push("failClosedDispositionInvalid");
    return { valid: reasons.length === 0, reasons };
}

function buildCheckpoint(snapshot = buildSnapshot()) {
    const queue = queueShard();
    const claim = {
        queueShardId: shardId,
        queuePath: queue.queuePath,
        authoritativeCandidateIdsDigest: queue.candidateIdsDigest,
        authoritativeEntityIdsDigest: queue.entityIdsDigest,
        requestedEntityIds: queue.entityIds,
        capturedEntityIds: resolvedEntities.map((entity) => entity.entityId),
        skippedOverlapEntityIds: [],
        materializedSnapshotPath: relative(outputPath),
        materializedSnapshotFieldDigest: snapshot.fieldDigest,
        sourceNamespace,
        identityResolutionStatus: snapshot.claim.identityResolution.status,
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
        authoritativeCandidateCount: queue.candidateCount,
        requestedEntityCount: queue.entityCount,
        capturedEntityCount: resolvedEntities.length,
        skippedOverlapEntityCount: 0,
        revisions: Object.fromEntries(Object.entries(revisions).map(([side, revision]) => [side, {
            gameVersion: revision.gameVersion,
            revision: revision.revision,
            status: "complete",
            completedEntityIds: resolvedEntities.map((entity) => entity.entityId),
            completedArtifactCount: resolvedEntities.length * recordKinds.length
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
    if (checkpoint?.generatedAt !== generatedAt || checkpoint?.transitionId !== "genshin:6.7->7.0" || checkpoint?.shardId !== shardId) reasons.push("transitionBindingInvalid");
    if (checkpoint?.status !== "complete" || checkpoint?.authoritativeCandidateCount !== queue.candidateCount || checkpoint?.requestedEntityCount !== queue.entityCount || checkpoint?.capturedEntityCount !== resolvedEntities.length || checkpoint?.skippedOverlapEntityCount !== 0) reasons.push("checkpointCoverageInvalid");
    if (checkpoint?.fieldDigestAlgorithm !== "sha256-stable-json-v1" || checkpoint?.fieldDigest !== digestStable(checkpoint?.claim)) reasons.push("fieldDigestInvalid");
    if (checkpoint?.claim?.queueShardId !== shardId || checkpoint?.claim?.authoritativeCandidateIdsDigest !== queue.candidateIdsDigest || checkpoint?.claim?.authoritativeEntityIdsDigest !== queue.entityIdsDigest || digestStable(checkpoint?.claim?.requestedEntityIds) !== queue.entityIdsDigest || digestStable(checkpoint?.claim?.capturedEntityIds) !== digestStable(expectedEntityIds) || !Array.isArray(checkpoint?.claim?.skippedOverlapEntityIds) || checkpoint.claim.skippedOverlapEntityIds.length !== 0 || checkpoint?.claim?.sourceNamespace !== sourceNamespace || checkpoint?.claim?.canIssueEligibilityCertificate !== false || checkpoint?.claim?.canPromoteCanonical !== false) reasons.push("checkpointClaimInvalid");
    const materializedPath = checkpoint?.materializedSnapshot?.path ? path.resolve(root, checkpoint.materializedSnapshot.path) : null;
    if (!materializedPath || !fs.existsSync(materializedPath)) reasons.push("materializedSnapshotMissing");
    else {
        let snapshot;
        try { snapshot = readJson(materializedPath); } catch { reasons.push("materializedSnapshotInvalid"); }
        if (snapshot && (checkpoint.materializedSnapshot.fieldDigest !== snapshot.fieldDigest || !validateBehaviorShard13Snapshot(snapshot, { repositoryRoot: root }).valid)) reasons.push("materializedSnapshotInvalid");
    }
    for (const side of ["before", "after"]) {
        const progress = checkpoint?.revisions?.[side];
        if (progress?.status !== "complete" || progress?.completedArtifactCount !== resolvedEntities.length * recordKinds.length || digestStable(progress?.completedEntityIds) !== digestStable(expectedEntityIds)) reasons.push(`revisionCheckpointInvalid:${side}`);
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

module.exports = {
    acquire,
    buildCheckpoint,
    buildSnapshot,
    checkpointPath,
    generatedAt,
    localIdentityEvidence,
    outputPath,
    providerRoot,
    queueShard,
    recordKinds,
    resolvedEntities,
    revisions,
    shardId,
    sourceNamespace,
    validateBehaviorShard13Snapshot,
    validateCheckpoint,
    writeSnapshot
};
