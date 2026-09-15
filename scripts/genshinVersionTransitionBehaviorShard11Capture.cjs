"use strict";

/**
 * Capture the authoritative behaviorSpec shard 11 for the 6.7 -> 7.0
 * transition.  This lane is intentionally source-only: it records the
 * pinned provider bytes and deterministic raw-record diffs, but does not
 * translate prose, issue an eligibility certificate, or promote Runtime
 * data.
 *
 * Entity 10000093 (Gaming) is the overlap with shard 10 and is recorded as
 * skipped. The eight new entities are accepted only after local catalog/source
 * text identity and both pinned provider records agree by name and embedded
 * id. A future mismatch therefore fails closed.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const base = require("./genshinVersionTransitionBehaviorEntityCapture.cjs");
const { digestStable } = require("./genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const transitionRoot = path.join(repositoryRoot, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0");
const sourceNamespace = "genshin-db-behavior-shard11";
const providerRoot = path.join(transitionRoot, "sources", sourceNamespace);
const queuePath = path.join(repositoryRoot, "reports", "genshin-evidence-task-queue.json");
const outputPath = path.join(transitionRoot, "behavior-shard-11-snapshot.json");
const checkpointPath = path.join(transitionRoot, "behavior-shard-11-capture-checkpoint.json");
const generatedAt = "2026-08-26T00:00:00.000Z";
const repository = "theBowja/genshin-db";
const provider = "genshin-db";
const sourceFamily = "GenshinData-derived";
const recordKinds = ["talents", "constellations"];
const shardId = "behavior:behaviorSpec:semanticDecisionRequired:standard:11";
const overlapEntityIds = ["10000093"];
const travelerEntityIds = ["10000005", "10000007"];

const localIdentityPaths = {
    catalog: "games/genshin/data/characters.json",
    talents: "games/genshin/data/character-talents.json",
    constellations: "games/genshin/data/character-constellations.json"
};

// Provider slugs and embedded ids were resolved against both pinned Git
// revisions. They are never inferred from the local id suffix or display name.
const resolvedEntities = [
    { entityId: "10000094", name: "Chiori", nameJa: "千織", slug: "chiori", slugCandidates: ["chiori"], providerId: 9401 },
    { entityId: "10000095", name: "Sigewinne", nameJa: "シグウィン", slug: "sigewinne", slugCandidates: ["sigewinne"], providerId: 9501 },
    { entityId: "10000096", name: "Arlecchino", nameJa: "アルレッキーノ", slug: "arlecchino", slugCandidates: ["arlecchino"], providerId: 9601 },
    { entityId: "10000097", name: "Sethos", nameJa: "セトス", slug: "sethos", slugCandidates: ["sethos"], providerId: 9701 },
    { entityId: "10000098", name: "Clorinde", nameJa: "クロリンデ", slug: "clorinde", slugCandidates: ["clorinde"], providerId: 9801 },
    { entityId: "10000099", name: "Emilie", nameJa: "エミリエ", slug: "emilie", slugCandidates: ["emilie"], providerId: 9901 },
    { entityId: "10000100", name: "Kachina", nameJa: "カチーナ", slug: "kachina", slugCandidates: ["kachina"], providerId: 10001 },
    { entityId: "10000101", name: "Kinich", nameJa: "キィニチ", slug: "kinich", slugCandidates: ["kinich"], providerId: 10101 }
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

function localFile(key) {
    return path.join(repositoryRoot, localIdentityPaths[key]);
}

function localIdentityEvidence() {
    const catalog = readJson(localFile("catalog"));
    const talents = readJson(localFile("talents"));
    const constellations = readJson(localFile("constellations"));
    const evidence = resolvedEntities.map((entity) => {
        const catalogRecord = catalog[entity.entityId];
        const talentRecord = talents[entity.entityId];
        const constellationRecord = constellations[entity.entityId];
        if (!catalogRecord || catalogRecord.nameJa !== entity.nameJa) {
            throw new Error(`local catalog identity mismatch for ${entity.entityId}: expected ${entity.nameJa}`);
        }
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
    return {
        authority: "data-v2-manifest:characters-catalog-and-source-text",
        paths: localIdentityPaths,
        fileDigests: Object.fromEntries(Object.entries(localIdentityPaths).map(([key]) => {
            const bytes = fs.readFileSync(localFile(key));
            return [key, { sha256: sha256(bytes), rawArtifactBytes: bytes.length, gitBlob: gitBlobSha(bytes) }];
        })),
        entities: evidence,
        swappedProviderIdEvidence: []
    };
}

function queueShard() {
    const queue = readJson(queuePath);
    const clusters = (queue.unlockClusters || []).filter((item) => item.domain === "behavior" && item.layer === "behaviorSpec");
    const shards = clusters.flatMap((cluster) => cluster.shards || []);
    const shard = shards.find((candidate) => String(candidate?.shardId || "") === shardId);
    if (!shard || !Array.isArray(shard.candidateIds)) throw new Error(`authoritative behaviorSpec shard missing: ${shardId}`);
    const candidateIds = shard.candidateIds.map(String);
    if (candidateIds.length !== 100 || new Set(candidateIds).size !== candidateIds.length || !candidateIds.every((id) => /^behavior:10000\d{3}:[^:]+:.+$/.test(id))) {
        throw new Error(`authoritative behaviorSpec shard 11 candidate inventory invalid: ${candidateIds.length}`);
    }
    const entityIds = [...new Set(candidateIds.map((candidateId) => candidateId.split(":")[1]))];
    const expectedEntityIds = [...new Set([...overlapEntityIds, ...resolvedEntities.map((entity) => entity.entityId)])];
    if (digestStable(entityIds) !== digestStable(expectedEntityIds)) throw new Error(`shard 11 entity inventory mismatch: ${entityIds.join(",")}`);
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
    const response = await fetch(url, { headers: { "User-Agent": "damageTool-genshin-behavior-shard-11" } });
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
            if (error.status === 404) continue;
            if (/embedded provider id mismatch|provider name mismatch/.test(error.message)) continue;
            throw error;
        }
    }
    if (valid.length !== 1) throw new Error(`provider path ambiguity for ${entity.entityId}/${recordKind}: ${valid.map((item) => item.slug).join(",") || "none"}`);
    return valid[0];
}

async function acquire() {
    queueShard();
    localIdentityEvidence();
    fs.mkdirSync(providerRoot, { recursive: true });
    for (const revision of Object.values(base.revisions)) {
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

function buildEntity(entity, identity) {
    const records = recordKinds.map((recordKind) => {
        const beforeFile = sourcePath(base.revisions.before.revision, recordKind, entity.slug);
        const afterFile = sourcePath(base.revisions.after.revision, recordKind, entity.slug);
        if (!fs.existsSync(beforeFile) || !fs.existsSync(afterFile)) throw new Error(`source pair missing for ${entity.entityId}/${recordKind}`);
        const beforeValue = parseProviderRecord(fs.readFileSync(beforeFile), { ...entity, recordKind });
        const afterValue = parseProviderRecord(fs.readFileSync(afterFile), { ...entity, recordKind });
        const before = artifact(base.revisions.before, recordKind, entity);
        const after = artifact(base.revisions.after, recordKind, entity);
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
    const identity = localIdentityEvidence();
    const entities = resolvedEntities.map((entity) => buildEntity(entity, identity.entities.find((item) => item.entityId === entity.entityId)));
    const records = entities.flatMap((entity) => entity.records);
    const changedRecords = records.filter((record) => record.comparison.status === "rawRecordChanged");
    const changedFields = records.reduce((sum, record) => sum + record.comparison.changedFieldCount, 0);
    const skipped = queue.entityIds.filter((entityId) => overlapEntityIds.includes(entityId));
    const unknownCaptured = resolvedEntities.map((entity) => entity.entityId).filter((entityId) => !queue.entityIds.includes(entityId));
    const missingNew = queue.entityIds.filter((entityId) => !overlapEntityIds.includes(entityId) && !resolvedEntities.some((entity) => entity.entityId === entityId));
    if (unknownCaptured.length || missingNew.length || skipped.join(",") !== overlapEntityIds.join(",")) {
        throw new Error(`shard 11 entity coverage mismatch unknown=${unknownCaptured.join(",")} missing=${missingNew.join(",")} overlap=${skipped.join(",")}`);
    }
    const claim = {
        transitionId: "genshin:6.7->7.0",
        fromGameVersion: base.revisions.before.gameVersion,
        toGameVersion: base.revisions.after.gameVersion,
        provider,
        sourceFamily,
        sourceNamespace,
        repository,
        treeResolution: {
            method: "nonRecursiveGitTreePath",
            resolutionEvidence: "immutableRawPathWithEmbeddedId",
            note: "Every concrete path is accepted only when both pinned revisions contain the expected provider name and explicit $.id."
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
            skippedOverlapEntityIds: overlapEntityIds,
            overlapPolicy: "alreadyCapturedByBehaviorShard10",
            overlapEvidence: [{
                entityId: "10000093",
                previousShardId: "behavior:behaviorSpec:semanticDecisionRequired:standard:10",
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
            note: "No Traveler entity is in shard11; any future Traveler queue entry must remain unresolved until its variant identity is explicit."
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
            authoritativeCandidates: queue.candidateCount,
            authoritativeEntities: queue.entityCount,
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
            reasons: ["providerIndependenceInsufficient", "behaviorSemanticsNotParsed"]
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

function validateBehaviorShard11Snapshot(snapshot, { repositoryRoot: root = repositoryRoot } = {}) {
    const reasons = [];
    if (snapshot?.schemaVersion !== 1 || snapshot?.kind !== "genshinVersionTransitionBehaviorShardSnapshot") reasons.push("identityInvalid");
    if (snapshot?.generatedAt !== generatedAt) reasons.push("generatedAtInvalid");
    if (snapshot?.fieldDigestAlgorithm !== "sha256-stable-json-v1" || snapshot?.fieldDigest !== digestStable(snapshot?.claim)) reasons.push("fieldDigestInvalid");
    if (snapshot?.claim?.transitionId !== "genshin:6.7->7.0" || snapshot?.claim?.fromGameVersion !== "6.7" || snapshot?.claim?.toGameVersion !== "7.0") reasons.push("transitionBindingInvalid");
    if (snapshot?.claim?.provider !== provider || snapshot?.claim?.sourceFamily !== sourceFamily || snapshot?.claim?.sourceNamespace !== sourceNamespace || snapshot?.claim?.repository !== repository) reasons.push("providerBindingInvalid");
    const queue = queueShard();
    const shard = snapshot?.claim?.shard;
    if (shard?.shardId !== shardId || shard?.authoritativeCandidateCount !== queue.candidateCount || digestStable(shard?.authoritativeCandidateIds) !== queue.candidateIdsDigest || digestStable(shard?.authoritativeEntityIds) !== queue.entityIdsDigest || digestStable(shard?.capturedNewEntityIds) !== digestStable(resolvedEntities.map((entity) => entity.entityId)) || digestStable(shard?.skippedOverlapEntityIds) !== digestStable(overlapEntityIds) || shard?.overlapPolicy !== "alreadyCapturedByBehaviorShard10") reasons.push("authoritativeShardBindingInvalid");
    if (snapshot?.claim?.identityResolution?.authority !== "data-v2-manifest:characters-catalog-and-source-text") reasons.push("localIdentityAuthorityInvalid");
    try {
        const identity = localIdentityEvidence();
        if (digestStable(snapshot.claim.identityResolution) !== digestStable(identity)) reasons.push("localIdentityEvidenceInvalid");
    } catch (error) { reasons.push(`localIdentityEvidenceInvalid:${error.message}`); }
    const bindings = Array.isArray(snapshot?.claim?.versionBindings) ? snapshot.claim.versionBindings : [];
    if (bindings.length !== 2) reasons.push("versionBindingsIncomplete");
    for (const revision of Object.values(base.revisions)) validatePackageBinding(bindings.find((candidate) => candidate.gameVersion === revision.gameVersion), revision, root, reasons);
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
            const before = record.before;
            const after = record.after;
            reasons.push(...validateArtifact(before, base.revisions.before, recordKind, expected, root).map((reason) => `${expected.entityId}:${recordKind}:before:${reason}`));
            reasons.push(...validateArtifact(after, base.revisions.after, recordKind, expected, root).map((reason) => `${expected.entityId}:${recordKind}:after:${reason}`));
            const beforeValue = readJson(path.resolve(root, before.path));
            const afterValue = readJson(path.resolve(root, after.path));
            const diffs = fieldDiffs(beforeValue, afterValue);
            if (record.comparison?.status !== (diffs.length ? "rawRecordChanged" : "rawRecordMatch") || record.comparison?.changedFieldCount !== diffs.length || digestStable(record.comparison?.fieldDiffs) !== digestStable(diffs) || record.comparison?.beforeFieldDigest !== fieldDigest(beforeValue) || record.comparison?.afterFieldDigest !== fieldDigest(afterValue) || record.comparison?.beforeArtifactSha256 !== before.rawArtifactSha256 || record.comparison?.afterArtifactSha256 !== after.rawArtifactSha256) reasons.push(`comparisonInvalid:${expected.entityId}:${recordKind}`);
        }
    }
    if (!Array.isArray(snapshot?.claim?.travelerVariantEvidence) || snapshot.claim.travelerVariantEvidence.length !== 0 || !Array.isArray(snapshot?.claim?.variantAmbiguities) || snapshot.claim.variantAmbiguities.length !== 0) reasons.push("travelerVariantEvidenceUnexpected");
    if (snapshot?.claim?.travelerVariantPolicy?.failClosedOnEncounter !== true || snapshot?.claim?.travelerVariantPolicy?.status !== "notApplicable") reasons.push("travelerPolicyInvalid");
    if (snapshot?.summary?.shardId !== shardId || snapshot?.summary?.authoritativeCandidates !== 100 || snapshot?.summary?.authoritativeEntities !== 9 || snapshot?.summary?.resolvedEntities !== 8 || snapshot?.summary?.overlapSkippedEntities !== 1 || snapshot?.summary?.ambiguousEntities !== 0 || snapshot?.summary?.resolvedRecords !== 16 || snapshot?.summary?.sourceFamilyCount !== 1 || snapshot?.summary?.certificateEligibleClaims !== 0) reasons.push("summaryInvalid");
    if (!Array.isArray(shard?.overlapEvidence) || shard.overlapEvidence.length !== 1 || shard.overlapEvidence[0]?.entityId !== "10000093" || shard.overlapEvidence[0]?.previousShardId !== "behavior:behaviorSpec:semanticDecisionRequired:standard:10" || shard.overlapEvidence[0]?.acquisitionPolicy !== "notReacquired") reasons.push("overlapEvidenceInvalid");
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
        skippedOverlapEntityIds: overlapEntityIds,
        materializedSnapshotPath: relative(outputPath),
        materializedSnapshotFieldDigest: snapshot.fieldDigest,
        sourceNamespace,
        identityResolutionStatus: "resolvedByLocalCatalogAndProviderName",
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
        skippedOverlapEntityCount: overlapEntityIds.length,
        revisions: Object.fromEntries(Object.entries(base.revisions).map(([side, revision]) => [side, {
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
        overlapEvidence: [{
            entityId: "10000093",
            previousShardId: "behavior:behaviorSpec:semanticDecisionRequired:standard:10",
            acquisitionPolicy: "notReacquired"
        }],
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
    if (checkpoint?.status !== "complete" || checkpoint?.authoritativeCandidateCount !== queue.candidateCount || checkpoint?.requestedEntityCount !== queue.entityCount || checkpoint?.capturedEntityCount !== resolvedEntities.length || checkpoint?.skippedOverlapEntityCount !== overlapEntityIds.length) reasons.push("checkpointCoverageInvalid");
    if (checkpoint?.fieldDigestAlgorithm !== "sha256-stable-json-v1" || checkpoint?.fieldDigest !== digestStable(checkpoint?.claim)) reasons.push("fieldDigestInvalid");
    if (checkpoint?.claim?.queueShardId !== shardId || checkpoint?.claim?.authoritativeCandidateIdsDigest !== queue.candidateIdsDigest || checkpoint?.claim?.authoritativeEntityIdsDigest !== queue.entityIdsDigest || digestStable(checkpoint?.claim?.requestedEntityIds) !== queue.entityIdsDigest || digestStable(checkpoint?.claim?.capturedEntityIds) !== digestStable(resolvedEntities.map((entity) => entity.entityId)) || digestStable(checkpoint?.claim?.skippedOverlapEntityIds) !== digestStable(overlapEntityIds) || checkpoint?.claim?.sourceNamespace !== sourceNamespace || checkpoint?.claim?.canIssueEligibilityCertificate !== false || checkpoint?.claim?.canPromoteCanonical !== false) reasons.push("checkpointClaimInvalid");
    const materializedPath = checkpoint?.materializedSnapshot?.path ? path.resolve(root, checkpoint.materializedSnapshot.path) : null;
    if (!materializedPath || !fs.existsSync(materializedPath)) reasons.push("materializedSnapshotMissing");
    else {
        let snapshot;
        try { snapshot = readJson(materializedPath); } catch { reasons.push("materializedSnapshotInvalid"); }
        if (snapshot && (checkpoint.materializedSnapshot.fieldDigest !== snapshot.fieldDigest || !validateBehaviorShard11Snapshot(snapshot, { repositoryRoot: root }).valid)) reasons.push("materializedSnapshotInvalid");
    }
    if (!Array.isArray(checkpoint?.overlapEvidence) || checkpoint.overlapEvidence.length !== 1 || checkpoint.overlapEvidence[0]?.entityId !== "10000093" || checkpoint.overlapEvidence[0]?.previousShardId !== "behavior:behaviorSpec:semanticDecisionRequired:standard:10" || checkpoint.overlapEvidence[0]?.acquisitionPolicy !== "notReacquired") reasons.push("overlapEvidenceInvalid");
    for (const side of ["before", "after"]) {
        const progress = checkpoint?.revisions?.[side];
        if (progress?.status !== "complete" || progress?.completedArtifactCount !== resolvedEntities.length * recordKinds.length || digestStable(progress?.completedEntityIds) !== digestStable(resolvedEntities.map((entity) => entity.entityId))) reasons.push(`revisionCheckpointInvalid:${side}`);
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
    shardId,
    sourceNamespace,
    overlapEntityIds,
    validateBehaviorShard11Snapshot,
    validateCheckpoint,
    writeSnapshot
};
