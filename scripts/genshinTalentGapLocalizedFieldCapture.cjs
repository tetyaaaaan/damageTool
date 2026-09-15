"use strict";

/**
 * Capture the bounded Japanese/provider field bridge for the 63 non-Traveler
 * talent-gap candidates (21 entities x 3 passive candidates).
 *
 * This lane materializes exactly one Japanese talents record for each entity
 * at each pinned revision (42 raw records).  The Japanese directory tree and
 * package/version evidence are deliberately reused from the already validated
 * identity-bridge-10000124 capture; no recursive tree result, ordinal mapping,
 * transliteration, prose interpretation, certificate, or canonical promotion
 * is accepted here.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const base = require("./genshinVersionTransitionBehaviorEntityCapture.cjs");
const identityCapture = require("./genshinCharacterLocalizedIdentityCapture.cjs");
const { digestStable, stableValue } = require("./genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const transitionRoot = path.join(dataRoot, "v2", "version-transitions", "6.7-to-7.0");
const sourceNamespace = "genshin-db-talent-gap-localized-field-bridge-standard01";
const providerRoot = path.join(transitionRoot, "sources", sourceNamespace);
const outputPath = path.join(transitionRoot, "talent-gap-localized-field-capture-standard01-snapshot.json");
const checkpointPath = path.join(transitionRoot, "talent-gap-localized-field-capture-standard01-checkpoint.json");
const schemaPath = path.join(dataRoot, "schema", "version-transition-talent-gap-localized-field-capture-snapshot.schema.json");
const checkpointSchemaPath = path.join(dataRoot, "schema", "version-transition-talent-gap-localized-field-capture-checkpoint.schema.json");
const queuePath = path.join(repositoryRoot, "reports", "genshin-evidence-task-queue.json");
const talentGapPath = path.join(dataRoot, "v2", "characters", "talent-gap-candidates.json");
const catalogPath = path.join(dataRoot, "characters.json");
const talentsPath = path.join(dataRoot, "character-talents.json");
const identityBridgePath = identityCapture.outputPath;
const generatedAt = "2026-08-28T00:00:00.000Z";
const repository = "theBowja/genshin-db";
const provider = "genshin-db";
const sourceFamily = "GenshinData-derived";
const recordKind = "talents";
const transitionId = "genshin:6.7->7.0";
const lane = Object.freeze({
    clusterId: "source-unlock:talentGap:talentGapEffectSpec:semanticDecisionRequired:standard",
    shardId: "talentGap:talentGapEffectSpec:semanticDecisionRequired:standard:01",
    dataset: "talentGap",
    layer: "talentGapEffectSpec"
});
const travelerEntityIds = Object.freeze(["10000005", "10000007"]);

// Provider ids and slugs are taken from the existing pinned English records;
// they are written explicitly so this capture never derives ids arithmetically
// from local ids or names.
const entities = Object.freeze([
    { entityId: "10000003", nameJa: "ジン", providerSlug: "jean", providerId: 301, providerEnglishName: "Jean" },
    { entityId: "10000014", nameJa: "バーバラ", providerSlug: "barbara", providerId: 1401, providerEnglishName: "Barbara" },
    { entityId: "10000015", nameJa: "ガイア", providerSlug: "kaeya", providerId: 1501, providerEnglishName: "Kaeya" },
    { entityId: "10000031", nameJa: "フィッシュル", providerSlug: "fischl", providerId: 3101, providerEnglishName: "Fischl" },
    { entityId: "10000038", nameJa: "アルベド", providerSlug: "albedo", providerId: 3801, providerEnglishName: "Albedo" },
    { entityId: "10000050", nameJa: "トーマ", providerSlug: "thoma", providerId: 5001, providerEnglishName: "Thoma" },
    { entityId: "10000065", nameJa: "久岐忍", providerSlug: "kukishinobu", providerId: 6501, providerEnglishName: "Kuki Shinobu" },
    { entityId: "10000067", nameJa: "コレイ", providerSlug: "collei", providerId: 6701, providerEnglishName: "Collei" },
    { entityId: "10000068", nameJa: "ドリー", providerSlug: "dori", providerId: 6801, providerEnglishName: "Dori" },
    { entityId: "10000074", nameJa: "レイラ", providerSlug: "layla", providerId: 7401, providerEnglishName: "Layla" },
    { entityId: "10000077", nameJa: "ヨォーヨ", providerSlug: "yaoyao", providerId: 7701, providerEnglishName: "Yaoyao" },
    { entityId: "10000079", nameJa: "ディシア", providerSlug: "dehya", providerId: 7901, providerEnglishName: "Dehya" },
    { entityId: "10000083", nameJa: "リネット", providerSlug: "lynette", providerId: 8301, providerEnglishName: "Lynette" },
    { entityId: "10000088", nameJa: "シャルロット", providerSlug: "charlotte", providerId: 8801, providerEnglishName: "Charlotte" },
    { entityId: "10000101", nameJa: "キィニチ", providerSlug: "kinich", providerId: 10101, providerEnglishName: "Kinich" },
    { entityId: "10000105", nameJa: "オロルン", providerSlug: "ororon", providerId: 10501, providerEnglishName: "Ororon" },
    { entityId: "10000108", nameJa: "藍硯", providerSlug: "lanyan", providerId: 10801, providerEnglishName: "Lan Yan" },
    { entityId: "10000112", nameJa: "エスコフィエ", providerSlug: "escoffier", providerId: 11201, providerEnglishName: "Escoffier" },
    { entityId: "10000115", nameJa: "ダリア", providerSlug: "dahlia", providerId: 11501, providerEnglishName: "Dahlia" },
    { entityId: "10000121", nameJa: "アイノ", providerSlug: "aino", providerId: 12101, providerEnglishName: "Aino" },
    { entityId: "10000132", nameJa: "プルーネ", providerSlug: "prune", providerId: 13201, providerEnglishName: "Prune" }
]);
const entityById = new Map(entities.map((entity) => [entity.entityId, entity]));
const revisions = Object.freeze(Object.fromEntries(Object.entries(base.revisions).map(([side, revision]) => [side, Object.freeze({ ...revision })])));

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function readBytes(file) { return fs.readFileSync(file); }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function sha256(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function gitBlobSha(bytes) { return crypto.createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`, "utf8"), bytes])).digest("hex"); }
function fieldDigest(value) { return digestStable(value === undefined ? null : value); }
function stableJson(value) { return `${JSON.stringify(stableValue(value), null, 2)}\n`; }
function relative(file, root = repositoryRoot) { return path.relative(root, file).replaceAll("\\", "/"); }
function absolute(root, relativePath) { return path.resolve(root, relativePath); }
function repositoryRelative(file) { return relative(file, repositoryRoot); }
function uniqueSorted(values) { return [...new Set((values || []).filter((value) => value !== undefined && value !== null).map(String))].sort((a, b) => a.localeCompare(b, "en", { numeric: true })); }
function pointerToken(value) { return String(value).replaceAll("~", "~0").replaceAll("/", "~1"); }
function jsonPointer(...parts) { return `/${parts.map(pointerToken).join("/")}`; }

function localPath(kind, root = repositoryRoot) {
    const relativePath = ({ catalog: "games/genshin/data/characters.json", talents: "games/genshin/data/character-talents.json" })[kind];
    return path.join(root, relativePath);
}

function sourcePath(revision, slug, root = repositoryRoot) {
    return path.join(root, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0", "sources", sourceNamespace, revision, "Japanese", "talents", `${slug}.json`);
}

function sourceUrl(revision, slug) {
    return `https://raw.githubusercontent.com/${repository}/${revision}/src/data/Japanese/talents/${slug}.json`;
}

function localFileDigest(file, root = repositoryRoot) {
    const bytes = readBytes(file);
    return { path: relative(file, root), rawArtifactBytes: bytes.length, sha256: sha256(bytes), gitBlob: gitBlobSha(bytes) };
}

function loadQueue(root = repositoryRoot) {
    const queueFile = path.join(root, "reports", "genshin-evidence-task-queue.json");
    const queue = readJson(queueFile);
    const cluster = (queue.unlockClusters || []).find((item) => item.clusterId === lane.clusterId);
    const shard = cluster?.shards?.find((item) => item.shardId === lane.shardId);
    if (!shard || !Array.isArray(shard.candidateIds)) throw new Error(`authoritative queue shard missing: ${lane.shardId}`);
    const candidateIds = shard.candidateIds.map(String);
    if (candidateIds.length !== 67 || new Set(candidateIds).size !== candidateIds.length) throw new Error(`authoritative queue candidate count invalid: ${candidateIds.length}`);
    if (candidateIds.some((id) => !id.startsWith("talent-gap-spec:"))) throw new Error("talent-gap queue candidate id shape invalid");
    const entityIds = uniqueSorted(candidateIds.map((id) => id.split(":")[1]));
    const capturedCandidateIds = candidateIds.filter((id) => !travelerEntityIds.includes(id.split(":")[1]));
    if (capturedCandidateIds.length !== 63 || entityIds.filter((id) => !travelerEntityIds.includes(id)).length !== entities.length) throw new Error("talent-gap non-Traveler queue coverage invalid");
    return {
        path: relative(queueFile, root),
        shardId: lane.shardId,
        candidateIds,
        candidateIdsDigest: digestStable(candidateIds),
        entityIds,
        entityIdsDigest: digestStable(entityIds),
        capturedCandidateIds,
        capturedCandidateIdsDigest: digestStable(capturedCandidateIds),
        capturedEntityIds: entities.map((entity) => entity.entityId),
        capturedEntityIdsDigest: digestStable(entities.map((entity) => entity.entityId)),
        candidateCount: candidateIds.length,
        capturedCandidateCount: capturedCandidateIds.length,
        entityCount: entityIds.length,
        capturedEntityCount: entities.length,
        queueFieldDigest: digestStable({ shardId: lane.shardId, candidateIds, entityIds })
    };
}

function localIdentity(queue, root = repositoryRoot) {
    const catalog = readJson(localPath("catalog", root));
    const talents = readJson(localPath("talents", root));
    const entityRecords = entities.map((entity) => {
        const catalogRecord = catalog[entity.entityId];
        const talentRecord = talents[entity.entityId];
        if (!catalogRecord || catalogRecord.nameJa !== entity.nameJa) throw new Error(`local catalog identity mismatch: ${entity.entityId}`);
        if (!talentRecord || !Array.isArray(talentRecord.passives) || talentRecord.passives.length < 3) throw new Error(`local passive source missing: ${entity.entityId}`);
        const passives = talentRecord.passives.slice(0, 3).map((passive, index) => {
            if (!passive || typeof passive.nameJa !== "string" || !passive.nameJa.trim() || typeof passive.descriptionJa !== "string" || !passive.descriptionJa.trim()) throw new Error(`local passive field invalid: ${entity.entityId}:${index}`);
            if (typeof passive.sourceId !== "string" || !passive.sourceId.trim()) throw new Error(`local passive sourceId missing: ${entity.entityId}:${index}`);
            return {
                index,
                sourceId: passive.sourceId,
                nameJa: passive.nameJa,
                nameJaField: `passives.${index}.nameJa`,
                nameJaPointer: jsonPointer(entity.entityId, "passives", index, "nameJa"),
                nameJaDigest: fieldDigest(passive.nameJa),
                descriptionJaField: `passives.${index}.descriptionJa`,
                descriptionJaPointer: jsonPointer(entity.entityId, "passives", index, "descriptionJa"),
                descriptionJaDigest: fieldDigest(passive.descriptionJa)
            };
        });
        return {
            entityId: entity.entityId,
            nameJa: entity.nameJa,
            catalogNameJa: catalogRecord.nameJa,
            catalogRecordDigest: digestStable(catalogRecord),
            talentRecordDigest: digestStable(talentRecord),
            passives,
            status: "localCatalogAndTalentSourceVerified"
        };
    });
    const localFileDigests = { catalog: localFileDigest(localPath("catalog", root), root), talents: localFileDigest(localPath("talents", root), root) };
    return {
        authority: "data-v2-manifest:characters-catalog-and-source-text",
        paths: { catalog: relative(localPath("catalog", root), root), talents: relative(localPath("talents", root), root) },
        fileDigests: localFileDigests,
        queueCoverage: { shardId: queue.shardId, candidateIdsDigest: queue.candidateIdsDigest, candidateCount: queue.candidateCount },
        entities: entityRecords,
        travelerEntityIds: [...travelerEntityIds],
        status: "localCatalogAndTalentSourceVerified"
    };
}

function loadValidatedIdentityBridge(root = repositoryRoot) {
    const file = absolute(root, relative(identityBridgePath));
    if (!fs.existsSync(file)) throw new Error(`identity bridge snapshot missing: ${relative(file, root)}`);
    const snapshot = readJson(file);
    const validation = identityCapture.validateSnapshot(snapshot, { repositoryRoot: root });
    if (!validation.valid) throw new Error(`identity bridge snapshot invalid: ${validation.reasons.join(",")}`);
    if (snapshot.status !== "identityBridgeProven" || snapshot.claim?.identityBridge?.canUseForIdentityReconciliation !== true) throw new Error("identity bridge is not proven");
    return snapshot;
}

function packageEvidence(identitySnapshot, revision, root = repositoryRoot) {
    const side = revision.gameVersion === "6.7" ? "before" : "after";
    const binding = identitySnapshot.claim.revisions?.[side]?.versionBinding?.package;
    if (!binding?.path) throw new Error(`identity package binding missing: ${revision.gameVersion}`);
    const file = absolute(root, binding.path);
    if (!fs.existsSync(file)) throw new Error(`identity package artifact missing: ${binding.path}`);
    const bytes = readBytes(file);
    let manifest;
    try { manifest = JSON.parse(bytes.toString("utf8")); } catch (error) { throw new Error(`package manifest invalid: ${revision.gameVersion}:${error.message}`); }
    const actual = { rawArtifactBytes: bytes.length, rawArtifactSha256: sha256(bytes), gitBlob: gitBlobSha(bytes) };
    if (revision.revision !== identitySnapshot.claim.revisions[side].revision
        || manifest.name !== provider || manifest.version !== revision.packageVersion
        || actual.rawArtifactBytes !== revision.packageBytes || actual.rawArtifactSha256 !== revision.packageDigest || actual.gitBlob !== revision.packageBlob
        || binding.rawArtifactBytes !== actual.rawArtifactBytes || binding.rawArtifactSha256 !== actual.rawArtifactSha256 || binding.gitBlob !== actual.gitBlob) {
        throw new Error(`package binding mismatch: ${revision.gameVersion}`);
    }
    const strictText = `Genshin Impact v${revision.gameVersion} JSON data`;
    if (!String(manifest.description || "").includes(strictText)) throw new Error(`package strict game-version text missing: ${revision.gameVersion}`);
    return {
        gameVersion: revision.gameVersion,
        revision: revision.revision,
        packageVersion: revision.packageVersion,
        path: binding.path,
        url: binding.url || `https://raw.githubusercontent.com/${repository}/${revision.revision}/package.json`,
        rawArtifactBytes: actual.rawArtifactBytes,
        rawArtifactSha256: actual.rawArtifactSha256,
        gitBlob: actual.gitBlob,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        strictGameVersionText: strictText,
        reusedFromIdentityBridge: true,
        sourceSnapshotPath: repositoryRelative(identityBridgePath),
        sourceSnapshotFieldDigest: identitySnapshot.fieldDigest
    };
}

function treeProof(identitySnapshot, root = repositoryRoot) {
    const sourcePath = repositoryRelative(identityBridgePath);
    return Object.fromEntries(Object.entries(revisions).map(([side, revision]) => {
        const identityRevision = identitySnapshot.claim.revisions?.[side];
        const tree = identityRevision?.treeResolution?.trees?.talents;
        if (!tree || tree.method !== "gitTreeApiNonRecursive" || tree.recursive !== false || tree.language !== "Japanese" || tree.recordKind !== "talents" || tree.requestedRevision !== revision.revision || !Array.isArray(tree.pathSegments) || digestStable(tree.pathSegments) !== digestStable(["src", "data", "Japanese", "talents"])) throw new Error(`reusable Japanese talents tree proof invalid: ${revision.gameVersion}`);
        if (!Array.isArray(tree.entries) || tree.entries.length < entities.length) throw new Error(`reusable Japanese talents tree entries incomplete: ${revision.gameVersion}`);
        const selectedEntries = entities.map((entity) => {
            const selected = tree.entries.find((entry) => entry.path === `${entity.providerSlug}.json` && entry.type === "blob");
            if (!selected || !/^[a-f0-9]{40}$/.test(selected.sha) || !Number.isInteger(selected.size) || selected.size < 1) throw new Error(`Japanese talents tree entry missing: ${revision.gameVersion}:${entity.providerSlug}`);
            return { entityId: entity.entityId, providerSlug: entity.providerSlug, providerId: entity.providerId, path: selected.path, type: selected.type, mode: selected.mode, sha: selected.sha, size: selected.size, url: selected.url || null, entryDigest: digestStable(selected) };
        });
        return [side, {
            gameVersion: revision.gameVersion,
            revision: revision.revision,
            repository,
            language: "Japanese",
            recordKind: "talents",
            providerDirectory: "src/data/Japanese/talents",
            method: "reusedValidatedIdentityBridgeGitTreeProof",
            recursive: false,
            sourceSnapshotPath: sourcePath,
            sourceSnapshotFieldDigest: identitySnapshot.fieldDigest,
            sourceClaimPointer: `/claim/revisions/${side}/treeResolution/trees/talents`,
            treeFieldDigest: digestStable(tree),
            finalTreeSha: tree.finalTreeSha,
            finalTreeUrl: tree.finalTreeUrl,
            finalTreeEntryCount: tree.entries.length,
            entriesDigest: digestStable(tree.entries),
            selectedEntries,
            selectedEntriesDigest: digestStable(selectedEntries)
        }];
    }));
}

function passiveFields(value) {
    if (!value || typeof value !== "object") return [];
    return Object.keys(value)
        .filter((key) => /^passive\d+$/.test(key) && value[key] && typeof value[key] === "object")
        .sort((left, right) => Number(left.slice(7)) - Number(right.slice(7)))
        .map((key) => {
            const passive = value[key];
            return {
                key,
                name: typeof passive.name === "string" ? passive.name : null,
                nameDigest: fieldDigest(passive.name),
                descriptionDigest: fieldDigest(passive.description),
                descriptionRawDigest: fieldDigest(passive.descriptionRaw),
                fieldDigest: digestStable({ key, name: passive.name ?? null, description: passive.description ?? null, descriptionRaw: passive.descriptionRaw ?? null }),
                namePointer: jsonPointer(key, "name"),
                descriptionPointer: jsonPointer(key, "description"),
                descriptionRawPointer: jsonPointer(key, "descriptionRaw")
            };
        });
}

function parseProviderRecord(bytes, entity, expectedName, gameVersion) {
    let value;
    try { value = JSON.parse(bytes.toString("utf8")); } catch (error) { throw new Error(`provider JSON invalid: ${gameVersion}:${entity.providerSlug}:${error.message}`); }
    if (!Number.isInteger(value?.id) || value.id !== entity.providerId) throw new Error(`provider id mismatch: ${gameVersion}:${entity.providerSlug}:${value?.id}`);
    if (value.name !== expectedName) throw new Error(`provider name mismatch: ${gameVersion}:${entity.providerSlug}:${value?.name}`);
    if (passiveFields(value).length === 0) throw new Error(`provider passive fields missing: ${gameVersion}:${entity.providerSlug}`);
    return value;
}

function findEnglishEvidence(entity, revision, index, root = repositoryRoot) {
    const candidates = (index || []).filter((item) => item.entityId === entity.entityId && item.side === (revision.gameVersion === "6.7" ? "before" : "after"));
    if (!candidates.length) throw new Error(`existing English evidence missing: ${entity.entityId}:${revision.gameVersion}`);
    const selected = candidates.slice().sort((left, right) => `${left.path}:${left.snapshotPath}`.localeCompare(`${right.path}:${right.snapshotPath}`))[0];
    if (selected.snapshotRevision !== revision.revision
        || selected.snapshotGameVersion !== revision.gameVersion
        || selected.parentVersionBindingRevision !== revision.revision
        || selected.parentVersionBindingGameVersion !== revision.gameVersion
        || selected.parentVersionBindingPackageVersion !== revision.packageVersion) throw new Error(`English parent snapshot revision mismatch: ${entity.entityId}:${revision.gameVersion}`);
    if (!/^[a-f0-9]{64}$/.test(String(selected.parentSnapshotFieldDigest || ""))) throw new Error(`English parent snapshot digest metadata missing: ${entity.entityId}:${revision.gameVersion}`);
    const expectedPathPattern = new RegExp(`^games/genshin/data/v2/version-transitions/6\\.7-to-7\\.0/sources/genshin-db(?:-[a-z0-9]+)*/${revision.revision}/English/talents/${entity.providerSlug}\\.json$`);
    if (!expectedPathPattern.test(selected.path.replaceAll("\\", "/"))) throw new Error(`English raw path revision mismatch: ${entity.entityId}:${revision.gameVersion}`);
    const expectedUrl = `https://raw.githubusercontent.com/${repository}/${revision.revision}/src/data/English/talents/${entity.providerSlug}.json`;
    if (selected.url !== expectedUrl) throw new Error(`English raw URL binding mismatch: ${entity.entityId}:${revision.gameVersion}`);
    if (!Number.isInteger(selected.rawArtifactBytes) || !selected.rawArtifactSha256 || !selected.gitBlob) throw new Error(`English raw integrity metadata missing: ${entity.entityId}:${revision.gameVersion}`);
    const file = absolute(root, selected.path);
    if (!fs.existsSync(file)) throw new Error(`existing English raw missing: ${selected.path}`);
    const bytes = readBytes(file);
    const value = parseProviderRecord(bytes, entity, entity.providerEnglishName, revision.gameVersion);
    if (selected.rawArtifactBytes !== bytes.length) throw new Error(`English raw bytes mismatch: ${selected.path}`);
    if (selected.rawArtifactSha256 !== sha256(bytes)) throw new Error(`English raw SHA mismatch: ${selected.path}`);
    if (selected.gitBlob !== gitBlobSha(bytes)) throw new Error(`English raw Git blob mismatch: ${selected.path}`);
    return {
        gameVersion: revision.gameVersion,
        revision: revision.revision,
        parentSnapshotRevision: selected.snapshotRevision,
        parentSnapshotGameVersion: selected.snapshotGameVersion,
        providerPath: `src/data/English/talents/${entity.providerSlug}.json`,
        path: selected.path,
        url: selected.url || `https://raw.githubusercontent.com/${repository}/${revision.revision}/src/data/English/talents/${entity.providerSlug}.json`,
        sourceSnapshotPaths: uniqueSorted(candidates.map((item) => item.snapshotPath)),
        rawArtifactBytes: bytes.length,
        rawArtifactSha256: sha256(bytes),
        gitBlob: gitBlobSha(bytes),
        embeddedIdPath: "$.id",
        embeddedId: value.id,
        embeddedName: value.name,
        passiveFields: passiveFields(value),
        rawRecordFieldDigest: digestStable(value),
        fieldDigest: digestStable(passiveFields(value)),
        reusedExistingRaw: true,
        noRefetch: true
    };
}

function englishEvidenceIndex(root = repositoryRoot) {
    const entries = [];
    const rootTransition = path.join(root, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0");
    const files = fs.readdirSync(rootTransition).filter((name) => /^behavior(?:-entity|-shard-\d{2})-snapshot\.json$/.test(name)).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
    for (const fileName of files) {
        const snapshotPath = path.join(rootTransition, fileName);
        const snapshot = readJson(snapshotPath);
        if (snapshot.claim?.provider !== provider || snapshot.claim?.sourceFamily !== sourceFamily || snapshot.claim?.transitionId !== transitionId) throw new Error(`English parent snapshot binding invalid: ${fileName}`);
        if (snapshot.fieldDigestAlgorithm !== "sha256-stable-json-v1" || snapshot.fieldDigest !== digestStable(snapshot.claim)) throw new Error(`English parent snapshot digest invalid: ${fileName}`);
        const versionBindings = Array.isArray(snapshot.claim?.versionBindings) ? snapshot.claim.versionBindings : [];
        for (const resolved of snapshot.claim?.resolvedEntities || []) {
            const entity = entityById.get(String(resolved.entityId));
            if (!entity) continue;
            const record = (resolved.records || []).find((candidate) => candidate.recordKind === recordKind);
            if (!record) continue;
            for (const side of ["before", "after"]) {
                const metadata = record[side];
                if (!metadata?.path) continue;
                const expectedRevision = side === "before" ? revisions.before.revision : revisions.after.revision;
                const expectedGameVersion = side === "before" ? revisions.before.gameVersion : revisions.after.gameVersion;
                const parentVersionBinding = versionBindings.find((binding) => binding.gameVersion === expectedGameVersion);
                if (!parentVersionBinding || parentVersionBinding.revision !== expectedRevision || parentVersionBinding.status !== "strictlyBound") throw new Error(`English parent version binding invalid: ${fileName}:${side}`);
                entries.push({
                    entityId: entity.entityId,
                    side,
                    snapshotPath: relative(snapshotPath, root),
                    path: metadata.path,
                    url: metadata.url,
                    snapshotRevision: metadata.revision,
                    snapshotGameVersion: metadata.gameVersion,
                    parentVersionBindingRevision: parentVersionBinding.revision,
                    parentVersionBindingGameVersion: parentVersionBinding.gameVersion,
                    parentVersionBindingPackageVersion: parentVersionBinding.packageVersion,
                    parentSnapshotFieldDigest: snapshot.fieldDigest,
                    rawArtifactBytes: metadata.rawArtifactBytes,
                    rawArtifactSha256: metadata.rawArtifactSha256,
                    gitBlob: metadata.gitBlob
                });
            }
        }
    }
    return entries;
}

function localizedArtifact(entity, revision, treeProofClaim, root = repositoryRoot) {
    const selected = treeProofClaim.selectedEntries.find((entry) => entry.entityId === entity.entityId);
    if (!selected) throw new Error(`Japanese talents selected tree entry missing: ${revision.gameVersion}:${entity.entityId}`);
    const file = sourcePath(revision.revision, entity.providerSlug, root);
    if (!fs.existsSync(file)) return { gameVersion: revision.gameVersion, revision: revision.revision, providerPath: `src/data/Japanese/talents/${entity.providerSlug}.json`, status: "missing", artifact: null };
    const bytes = readBytes(file);
    const value = parseProviderRecord(bytes, entity, entity.nameJa, revision.gameVersion);
    const actualBlob = gitBlobSha(bytes);
    if (bytes.length !== selected.size || actualBlob !== selected.sha) throw new Error(`Japanese tree/raw binding mismatch: ${revision.gameVersion}:${entity.providerSlug}`);
    const fields = passiveFields(value);
    return {
        gameVersion: revision.gameVersion,
        revision: revision.revision,
        providerPath: `src/data/Japanese/talents/${entity.providerSlug}.json`,
        status: "captured",
        artifact: {
            gameVersion: revision.gameVersion,
            revision: revision.revision,
            packageVersion: revisions[revision.gameVersion === "6.7" ? "before" : "after"].packageVersion,
            providerPath: `src/data/Japanese/talents/${entity.providerSlug}.json`,
            path: relative(file, root),
            url: sourceUrl(revision.revision, entity.providerSlug),
            treeBlobSha: selected.sha,
            treeBlobBytes: selected.size,
            gitBlob: actualBlob,
            rawArtifactBytes: bytes.length,
            rawArtifactSha256: sha256(bytes),
            embeddedIdPath: "$.id",
            embeddedId: value.id,
            embeddedName: value.name,
            explicitLocalizedNameMatch: value.name === entity.nameJa,
            rawRecordFieldDigest: digestStable(value),
            passiveFields: fields,
            passiveFieldDigest: digestStable(fields),
            noSemanticInterpretation: true
        },
        value
    };
}

function localEntity(local, entityId) { return local.entities.find((entity) => entity.entityId === entityId) || null; }
function localCandidateSpecs(talentGap, queue, entityId) {
    return queue.capturedCandidateIds.filter((id) => id.split(":")[1] === entityId).map((id) => {
        const spec = talentGap.specs?.[id];
        if (!spec) throw new Error(`talent-gap spec missing: ${id}`);
        const sourceRef = spec.sourceRefs?.[0];
        const source = talentGap.sourceRecords?.[sourceRef];
        const match = /^passives\.(\d+)\.descriptionJa$/.exec(String(source?.locator?.field || ""));
        const passiveIndex = match ? Number(match[1]) : null;
        if (!source || passiveIndex === null) throw new Error(`talent-gap passive locator missing: ${id}`);
        return { candidateId: id, specId: id, sourceRef, passiveIndex };
    });
}

function bridgeForCandidate(candidate, entity, local, beforeArtifact, afterArtifact, beforeEnglish, afterEnglish) {
    const passive = local.passives.find((item) => item.index === candidate.passiveIndex);
    if (!passive) throw new Error(`local passive missing for candidate: ${candidate.candidateId}`);
    const revisionsEvidence = { before: { artifact: beforeArtifact, english: beforeEnglish }, after: { artifact: afterArtifact, english: afterEnglish } };
    const perRevision = {};
    for (const side of ["before", "after"]) {
        const localized = revisionsEvidence[side].artifact;
        const english = revisionsEvidence[side].english;
        if (localized.status !== "captured") {
            perRevision[side] = { status: "localizedRecordMissing", localNameJa: passive.nameJa, matches: [], providerFieldKey: null };
            continue;
        }
        const localizedMatches = (localized.artifact.passiveFields || []).filter((field) => field.name === passive.nameJa);
        const englishKeys = new Set((english.passiveFields || []).map((field) => field.key));
        const sameKeyMatches = localizedMatches.filter((field) => englishKeys.has(field.key));
        let status = "exactLocalizedNameProviderKey";
        if (localizedMatches.length === 0) status = "localizedNameMissing";
        else if (localizedMatches.length !== 1) status = "localizedNameAmbiguous";
        else if (sameKeyMatches.length !== 1) status = "englishProviderFieldKeyMissing";
        const field = sameKeyMatches[0] || localizedMatches[0] || null;
        const englishField = field ? english.passiveFields.find((candidateField) => candidateField.key === field.key) || null : null;
        perRevision[side] = {
            status,
            localNameJa: passive.nameJa,
            localNameJaDigest: passive.nameJaDigest,
            localizedMatchCount: localizedMatches.length,
            providerFieldKey: field?.key || null,
            providerJapaneseField: field ? {
                key: field.key,
                name: field.name,
                nameDigest: field.nameDigest,
                fieldDigest: field.fieldDigest,
                jsonPointer: field.namePointer,
                rawRecordFieldDigest: localized.artifact.rawRecordFieldDigest
            } : null,
            providerEnglishField: englishField ? {
                key: englishField.key,
                name: englishField.name,
                nameDigest: englishField.nameDigest,
                fieldDigest: englishField.fieldDigest,
                jsonPointer: englishField.namePointer,
                rawRecordFieldDigest: english.rawRecordFieldDigest
            } : null,
            sameProviderFieldKey: Boolean(field && englishField && field.key === englishField.key),
            noOrdinalInference: true,
            noTransliterationInference: true,
            noSemanticInference: true
        };
    }
    const beforeKey = perRevision.before.providerFieldKey;
    const afterKey = perRevision.after.providerFieldKey;
    let status = "exactLocalizedNameProviderKey";
    if (perRevision.before.status !== status || perRevision.after.status !== status) status = perRevision.before.status !== status ? perRevision.before.status : perRevision.after.status;
    else if (beforeKey !== afterKey) status = "versionProviderFieldKeyMismatch";
    const exact = status === "exactLocalizedNameProviderKey" && perRevision.before.sameProviderFieldKey === true && perRevision.after.sameProviderFieldKey === true && beforeKey === afterKey;
    return {
        candidateId: candidate.candidateId,
        entityId: entity.entityId,
        sourceRef: candidate.sourceRef,
        passiveIndex: candidate.passiveIndex,
        localField: {
            sourceId: passive.sourceId,
            nameJa: passive.nameJa,
            nameJaPointer: passive.nameJaPointer,
            nameJaDigest: passive.nameJaDigest,
            descriptionJaPointer: passive.descriptionJaPointer,
            descriptionJaDigest: passive.descriptionJaDigest
        },
        status: exact ? "exactLocalizedNameProviderKey" : status,
        safeExactMapping: exact,
        providerFieldKey: exact ? beforeKey : null,
        revisions: perRevision,
        noOrdinalInference: true,
        noTransliterationInference: true,
        noSemanticInference: true,
        reason: exact
            ? "Local Japanese passive name exactly matches one provider Japanese passive field in both pinned revisions, and that same provider field key exists in the existing English record."
            : "A unique exact local-name-to-provider-field-key bridge was not established in both pinned revisions; no ordinal or translation inference is accepted."
    };
}

function fieldDiffs(before, after, pointer = "") {
    if (fieldDigest(before) === fieldDigest(after)) return [];
    const beforeObject = before && typeof before === "object";
    const afterObject = after && typeof after === "object";
    if (!beforeObject || !afterObject || Array.isArray(before) !== Array.isArray(after)) return [{ jsonPointer: pointer || "/", beforeFieldDigest: fieldDigest(before), afterFieldDigest: fieldDigest(after) }];
    const keys = Array.isArray(before) && Array.isArray(after)
        ? Array.from({ length: Math.max(before.length, after.length) }, (_, index) => String(index))
        : [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].sort();
    return keys.flatMap((key) => fieldDiffs(before?.[key], after?.[key], `${pointer}/${pointerToken(key)}`));
}

function buildSnapshot(root = repositoryRoot) {
    const queue = loadQueue(root);
    const talentGap = readJson(path.join(root, "games", "genshin", "data", "v2", "characters", "talent-gap-candidates.json"));
    const local = localIdentity(queue, root);
    const identitySnapshot = loadValidatedIdentityBridge(root);
    const trees = treeProof(identitySnapshot, root);
    const englishIndex = englishEvidenceIndex(root);
    const entitiesClaim = [];
    const candidateBridges = [];
    for (const entity of entities) {
        const localRecord = localEntity(local, entity.entityId);
        const beforeLocalized = localizedArtifact(entity, revisions.before, trees.before, root);
        const afterLocalized = localizedArtifact(entity, revisions.after, trees.after, root);
        const beforeEnglish = findEnglishEvidence(entity, revisions.before, englishIndex, root);
        const afterEnglish = findEnglishEvidence(entity, revisions.after, englishIndex, root);
        const beforeValue = beforeLocalized.value || null;
        const afterValue = afterLocalized.value || null;
        const entityCandidates = localCandidateSpecs(talentGap, queue, entity.entityId);
        for (const candidate of entityCandidates) candidateBridges.push(bridgeForCandidate(candidate, entity, localRecord, beforeLocalized, afterLocalized, beforeEnglish, afterEnglish));
        entitiesClaim.push({
            entityId: entity.entityId,
            localNameJa: entity.nameJa,
            providerSlug: entity.providerSlug,
            providerId: entity.providerId,
            providerEnglishName: entity.providerEnglishName,
            localIdentity: clone(localRecord),
            revisions: {
                before: { ...beforeLocalized, value: undefined, english: beforeEnglish },
                after: { ...afterLocalized, value: undefined, english: afterEnglish }
            },
            comparison: beforeValue && afterValue ? {
                status: fieldDiffs(beforeValue, afterValue).length ? "rawRecordChanged" : "rawRecordMatch",
                changedFieldCount: fieldDiffs(beforeValue, afterValue).length,
                fieldDiffs: fieldDiffs(beforeValue, afterValue),
                beforeRawRecordFieldDigest: digestStable(beforeValue),
                afterRawRecordFieldDigest: digestStable(afterValue),
                beforeRawArtifactSha256: beforeLocalized.artifact?.rawArtifactSha256 || null,
                afterRawArtifactSha256: afterLocalized.artifact?.rawArtifactSha256 || null
            } : { status: "notComparable", changedFieldCount: null, fieldDiffs: [] }
        });
    }
    const exact = candidateBridges.filter((candidate) => candidate.safeExactMapping === true);
    const missing = candidateBridges.filter((candidate) => candidate.safeExactMapping !== true);
    const localizedRecords = entitiesClaim.flatMap((entity) => [entity.revisions.before, entity.revisions.after]).filter((revision) => revision.status === "captured");
    const sourceRecords = localizedRecords.map((record) => record.artifact);
    const claim = {
        transitionId,
        lane,
        provider,
        sourceFamily,
        repository,
        sourceNamespace,
        recordKind,
        scope: {
            entityIds: entities.map((entity) => entity.entityId),
            entityCount: entities.length,
            candidateIds: queue.candidateIds,
            candidateCount: queue.candidateCount,
            capturedCandidateIds: queue.capturedCandidateIds,
            capturedCandidateCount: queue.capturedCandidateCount,
            travelerEntityIds: [...travelerEntityIds],
            travelerCandidateIds: queue.candidateIds.filter((id) => travelerEntityIds.includes(id.split(":")[1])),
            localizedRawRecordCount: sourceRecords.length,
            expectedLocalizedRawRecordCount: entities.length * 2
        },
        queue,
        localIdentity: local,
        reusedTreeProof: trees,
        versionBindings: Object.fromEntries(Object.entries(revisions).map(([side, revision]) => [side, {
            gameVersion: revision.gameVersion,
            revision: revision.revision,
            packageVersion: revision.packageVersion,
            package: packageEvidence(identitySnapshot, revision, root),
            japaneseTalentsTreeProof: trees[side]
        }])),
        entities: entitiesClaim,
        candidateBridges,
        travelerDisposition: {
            status: "preservedVariantAmbiguity",
            entityIds: [...travelerEntityIds],
            candidateIds: queue.candidateIds.filter((id) => travelerEntityIds.includes(id.split(":")[1])),
            capturedRawRecordCount: 0,
            reason: "Traveler candidates are excluded from this non-Traveler localized bridge; element variants remain unresolved and no shared 旅人 record is captured."
        },
        bridge: {
            status: missing.length === 0 && sourceRecords.length === entities.length * 2 ? "localizedFieldBridgeCaptured" : "localizedFieldBridgeIncomplete",
            localizedRecordCount: sourceRecords.length,
            expectedLocalizedRecordCount: entities.length * 2,
            exactCandidateBridgeCount: exact.length,
            expectedCandidateBridgeCount: queue.capturedCandidateCount,
            unresolvedCandidateBridgeCount: missing.length,
            noOrdinalInference: true,
            noTransliterationInference: true,
            noSemanticInference: true
        },
        disposition: {
            status: "fieldBridgeOnlyFailClosed",
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false,
            sourceFamilyCount: 1,
            reasons: ["singleProviderFamily", "providerIndependenceNotEstablished", "semanticEffectFieldsNotParsed", "travelerVariantsPreservedSeparate"]
        }
    };
    const complete = claim.bridge.status === "localizedFieldBridgeCaptured" && claim.bridge.exactCandidateBridgeCount === claim.bridge.expectedCandidateBridgeCount;
    return {
        schemaVersion: 1,
        kind: "genshinVersionTransitionTalentGapLocalizedFieldCapture",
        generatedAt,
        status: complete ? "localizedFieldBridgeCaptured" : "localizedFieldBridgeIncomplete",
        claim,
        summary: {
            lane: lane.shardId,
            entities: entities.length,
            candidates: queue.capturedCandidateCount,
            travelerCandidates: claim.travelerDisposition.candidateIds.length,
            localizedRecords: sourceRecords.length,
            expectedLocalizedRecords: entities.length * 2,
            missingLocalizedRecords: entities.length * 2 - sourceRecords.length,
            exactCandidateBridges: exact.length,
            expectedCandidateBridges: queue.capturedCandidateCount,
            unresolvedCandidateBridges: missing.length,
            sourceFamilyCount: 1,
            changedRecords: entitiesClaim.filter((entity) => entity.comparison.status === "rawRecordChanged").length,
            changedFields: entitiesClaim.reduce((sum, entity) => sum + (entity.comparison.changedFieldCount || 0), 0),
            certificateEligibleClaims: 0,
            canonicalPromotionCount: 0
        },
        gateEligibility: {
            status: "singleCorrelatedFamilyFailClosed",
            sourceFamilyCount: 1,
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false,
            reasons: claim.disposition.reasons
        },
        fieldDigestAlgorithm: "sha256-stable-json-v1",
        fieldDigest: digestStable(claim)
    };
}

function checkpointClaim(snapshot, progress, root = repositoryRoot) {
    const queue = loadQueue(root);
    const identitySnapshot = loadValidatedIdentityBridge(root);
    const trees = treeProof(identitySnapshot, root);
    const capturedEntityIds = uniqueSorted(Object.values(progress?.revisions || {}).flatMap((revision) => revision.completedEntityIds || []));
    const materialized = snapshot ? { path: relative(outputPath, root), status: snapshot.status, fieldDigest: snapshot.fieldDigest } : null;
    return {
        transitionId,
        lane,
        sourceNamespace,
        queueShardId: lane.shardId,
        authoritativeCandidateCount: queue.candidateCount,
        authoritativeCandidateIdsDigest: queue.candidateIdsDigest,
        capturedCandidateCount: queue.capturedCandidateCount,
        capturedCandidateIdsDigest: queue.capturedCandidateIdsDigest,
        authoritativeEntityIds: queue.entityIds,
        capturedEntityIds,
        expectedLocalizedRecordCount: entities.length * 2,
        capturedLocalizedRecordCount: capturedEntityIds.length * 2,
        reusedTreeProofPath: repositoryRelative(identityBridgePath),
        reusedTreeProofFieldDigest: identitySnapshot.fieldDigest,
        reusedTreeProof: trees,
        materializedSnapshot: materialized,
        sourceFamilyCount: 1,
        canIssueEligibilityCertificate: false,
        canPromoteCanonical: false,
        nextTask: snapshot?.status === "localizedFieldBridgeCaptured"
            ? "Integrate the validated exact localized-name/provider-key bridge into candidate×claim reconciliation; keep semantic, independent-provider, certificate, and canonical gates fail-closed."
            : "Resume this bounded capture at the first incomplete revision/entity; do not infer ordinal, translation, or semantics."
    };
}

function buildCheckpoint(snapshot = null, progress = null, root = repositoryRoot) {
    const claim = checkpointClaim(snapshot, progress, root);
    return {
        schemaVersion: 1,
        kind: "genshinVersionTransitionTalentGapLocalizedFieldCaptureCheckpoint",
        generatedAt,
        transitionId,
        lane,
        sourceNamespace,
        status: progress?.status || (snapshot?.status === "localizedFieldBridgeCaptured" ? "complete" : "capturePending"),
        revisions: progress?.revisions || Object.fromEntries(Object.entries(revisions).map(([side, revision]) => [side, {
            gameVersion: revision.gameVersion,
            revision: revision.revision,
            status: snapshot?.claim?.entities?.every((entity) => entity.revisions?.[side]?.status === "captured") ? "complete" : "pending",
            completedEntityIds: snapshot?.claim?.entities?.filter((entity) => entity.revisions?.[side]?.status === "captured").map((entity) => entity.entityId) || [],
            completedRecordCount: snapshot?.claim?.entities?.filter((entity) => entity.revisions?.[side]?.status === "captured").length || 0
        }])) ,
        authoritativeCandidateCount: claim.authoritativeCandidateCount,
        capturedCandidateCount: claim.capturedCandidateCount,
        authoritativeEntityCount: claim.authoritativeEntityIds.length,
        capturedEntityCount: claim.capturedEntityIds.length,
        expectedLocalizedRecordCount: claim.expectedLocalizedRecordCount,
        capturedLocalizedRecordCount: claim.capturedLocalizedRecordCount,
        materializedSnapshot: claim.materializedSnapshot,
        blocker: progress?.blocker || null,
        nextTask: claim.nextTask,
        gateEligibility: {
            sourceFamilyCount: 1,
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false
        },
        claim,
        fieldDigestAlgorithm: "sha256-stable-json-v1",
        fieldDigest: digestStable(claim)
    };
}

async function fetchBytes(url) {
    const response = await fetch(url, { headers: { "User-Agent": "damageTool-genshin-talent-gap-localized-capture" } });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!response.ok) {
        const error = new Error(`fetch failed ${response.status}: ${url}`);
        error.status = response.status;
        error.url = url;
        error.bytes = bytes;
        throw error;
    }
    return bytes;
}

function progressTemplate() {
    return {
        status: "inProgress",
        revisions: Object.fromEntries(Object.entries(revisions).map(([side, revision]) => [side, {
            gameVersion: revision.gameVersion,
            revision: revision.revision,
            status: "pending",
            completedEntityIds: [],
            completedRecordCount: 0
        }]))
    };
}

function writeProgress(progress) {
    fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
    const checkpoint = buildCheckpoint(null, progress);
    fs.writeFileSync(checkpointPath, stableJson(checkpoint), "utf8");
    return checkpoint;
}

function validExistingArtifact(entity, revision, treeClaim) {
    const file = sourcePath(revision.revision, entity.providerSlug);
    if (!fs.existsSync(file)) return false;
    try { localizedArtifact(entity, revision, treeClaim); return true; } catch { return false; }
}

async function acquire() {
    const queue = loadQueue();
    const identitySnapshot = loadValidatedIdentityBridge();
    const trees = treeProof(identitySnapshot);
    void queue;
    fs.mkdirSync(providerRoot, { recursive: true });
    const progress = progressTemplate();
    try {
        for (const [side, revision] of Object.entries(revisions)) {
            const state = progress.revisions[side];
            state.status = "records";
            for (const entity of entities) {
                if (!validExistingArtifact(entity, revision, trees[side])) {
                    const bytes = await fetchBytes(sourceUrl(revision.revision, entity.providerSlug));
                    const value = parseProviderRecord(bytes, entity, entity.nameJa, revision.gameVersion);
                    const selected = trees[side].selectedEntries.find((entry) => entry.entityId === entity.entityId);
                    if (!selected || bytes.length !== selected.size || gitBlobSha(bytes) !== selected.sha) throw new Error(`fetched Japanese tree/raw mismatch: ${revision.gameVersion}:${entity.entityId}`);
                    const file = sourcePath(revision.revision, entity.providerSlug);
                    fs.mkdirSync(path.dirname(file), { recursive: true });
                    fs.writeFileSync(file, bytes);
                    void value;
                }
                if (!state.completedEntityIds.includes(entity.entityId)) state.completedEntityIds.push(entity.entityId);
                state.completedEntityIds.sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
                state.completedRecordCount = state.completedEntityIds.length;
                writeProgress(progress);
            }
            state.status = "complete";
            writeProgress(progress);
        }
        progress.status = "captured";
        writeProgress(progress);
        return progress;
    } catch (error) {
        progress.status = error.status === 403 || /rate limit|API rate/i.test(String(error.message)) ? "blockedByProviderEvidence" : "captureError";
        progress.blocker = {
            kind: progress.status === "blockedByProviderEvidence" ? "providerTreeOrRawUnavailable" : "providerCaptureError",
            message: String(error.message),
            status: error.status || null,
            url: error.url || null
        };
        progress.nextTask = "Resume this bounded Japanese talents capture from the first incomplete revision/entity; no ordinal, transliteration, semantic, certificate, or canonical inference.";
        writeProgress(progress);
        throw error;
    }
}

function writeSnapshot() {
    const snapshot = buildSnapshot();
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, stableJson(snapshot), "utf8");
    const progress = {
        status: snapshot.status === "localizedFieldBridgeCaptured" ? "complete" : "blockedByFieldBridge",
        revisions: Object.fromEntries(Object.entries(revisions).map(([side, revision]) => [side, {
            gameVersion: revision.gameVersion,
            revision: revision.revision,
            status: snapshot.claim.entities.every((entity) => entity.revisions?.[side]?.status === "captured") ? "complete" : "incomplete",
            completedEntityIds: snapshot.claim.entities.filter((entity) => entity.revisions?.[side]?.status === "captured").map((entity) => entity.entityId),
            completedRecordCount: snapshot.claim.entities.filter((entity) => entity.revisions?.[side]?.status === "captured").length
        }]))
    };
    fs.writeFileSync(checkpointPath, stableJson(buildCheckpoint(snapshot, progress)), "utf8");
    return snapshot;
}

function validateArtifact(artifact, entity, revision, treeClaim, root, reasons) {
    if (!artifact || artifact.status !== "captured" || !artifact.artifact) { reasons.push(`recordMissing:${revision.gameVersion}:${entity.entityId}`); return; }
    const record = artifact.artifact;
    const expected = sourcePath(revision.revision, entity.providerSlug, root);
    const file = record.path ? absolute(root, record.path) : null;
    const selected = treeClaim.selectedEntries.find((entry) => entry.entityId === entity.entityId);
    if (!file || path.resolve(file) !== path.resolve(expected)) reasons.push(`recordPathInvalid:${revision.gameVersion}:${entity.entityId}`);
    if (!file || !fs.existsSync(file)) { reasons.push(`recordFileMissing:${revision.gameVersion}:${entity.entityId}`); return; }
    const bytes = readBytes(file);
    try { parseProviderRecord(bytes, entity, entity.nameJa, revision.gameVersion); } catch (error) { reasons.push(`recordIdentityInvalid:${revision.gameVersion}:${entity.entityId}:${error.message}`); }
    const actualBlob = gitBlobSha(bytes);
    if (!selected || record.treeBlobSha !== selected.sha || record.treeBlobBytes !== selected.size || actualBlob !== selected.sha || record.gitBlob !== actualBlob || record.rawArtifactBytes !== bytes.length || record.rawArtifactSha256 !== sha256(bytes)) reasons.push(`recordDigestInvalid:${revision.gameVersion}:${entity.entityId}`);
    if (record.gameVersion !== revision.gameVersion || record.revision !== revision.revision || record.packageVersion !== revision.packageVersion || record.providerPath !== `src/data/Japanese/talents/${entity.providerSlug}.json` || record.url !== sourceUrl(revision.revision, entity.providerSlug) || record.embeddedId !== entity.providerId || record.embeddedName !== entity.nameJa || record.explicitLocalizedNameMatch !== true) reasons.push(`recordBindingInvalid:${revision.gameVersion}:${entity.entityId}`);
    const value = JSON.parse(bytes.toString("utf8"));
    const fields = passiveFields(value);
    if (record.rawRecordFieldDigest !== digestStable(value) || record.passiveFieldDigest !== digestStable(fields) || digestStable(record.passiveFields) !== digestStable(fields)) reasons.push(`recordFieldDigestInvalid:${revision.gameVersion}:${entity.entityId}`);
}

function validateSnapshot(snapshot, { repositoryRoot: root = repositoryRoot, compareCurrent = true } = {}) {
    const reasons = [];
    if (!snapshot || typeof snapshot !== "object") reasons.push("artifactMissing");
    if (snapshot?.schemaVersion !== 1 || snapshot?.kind !== "genshinVersionTransitionTalentGapLocalizedFieldCapture") reasons.push("identityInvalid");
    if (snapshot?.generatedAt !== generatedAt) reasons.push("generatedAtInvalid");
    if (snapshot?.fieldDigestAlgorithm !== "sha256-stable-json-v1" || snapshot?.fieldDigest !== digestStable(snapshot?.claim)) reasons.push("fieldDigestInvalid");
    if (snapshot?.claim?.transitionId !== transitionId || snapshot?.claim?.provider !== provider || snapshot?.claim?.sourceFamily !== sourceFamily || snapshot?.claim?.repository !== repository || snapshot?.claim?.sourceNamespace !== sourceNamespace || snapshot?.claim?.recordKind !== recordKind) reasons.push("providerBindingInvalid");
    const queue = (() => { try { return loadQueue(root); } catch (error) { reasons.push(`queueInvalid:${error.message}`); return null; } })();
    const identitySnapshot = (() => { try { return loadValidatedIdentityBridge(root); } catch (error) { reasons.push(`treeProofSourceInvalid:${error.message}`); return null; } })();
    let trees = null;
    if (identitySnapshot) { try { trees = treeProof(identitySnapshot, root); } catch (error) { reasons.push(`treeProofInvalid:${error.message}`); } }
    if (!queue) return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
    if (snapshot?.claim?.scope?.candidateCount !== queue.candidateCount || snapshot?.claim?.scope?.capturedCandidateCount !== queue.capturedCandidateCount || snapshot?.claim?.scope?.entityCount !== entities.length || snapshot?.claim?.scope?.localizedRawRecordCount !== snapshot?.summary?.localizedRecords || snapshot?.claim?.scope?.expectedLocalizedRawRecordCount !== entities.length * 2) reasons.push("scopeInvalid");
    if (digestStable(snapshot?.claim?.scope?.candidateIds) !== queue.candidateIdsDigest || digestStable(snapshot?.claim?.scope?.capturedCandidateIds) !== queue.capturedCandidateIdsDigest || digestStable(snapshot?.claim?.scope?.entityIds) !== digestStable(entities.map((entity) => entity.entityId))) reasons.push("queueCoverageInvalid");
    if (snapshot?.claim?.travelerDisposition?.capturedRawRecordCount !== 0 || digestStable(snapshot?.claim?.travelerDisposition?.candidateIds) !== digestStable(queue.candidateIds.filter((id) => travelerEntityIds.includes(id.split(":")[1])))) reasons.push("travelerDispositionInvalid");
    if (!Array.isArray(snapshot?.claim?.entities) || snapshot.claim.entities.length !== entities.length || new Set(snapshot.claim.entities.map((entity) => entity.entityId)).size !== entities.length) reasons.push("entityCoverageInvalid");
    for (const expected of entities) {
        const candidate = snapshot?.claim?.entities?.find((entity) => entity.entityId === expected.entityId);
        if (!candidate || candidate.localNameJa !== expected.nameJa || candidate.providerSlug !== expected.providerSlug || candidate.providerId !== expected.providerId || candidate.providerEnglishName !== expected.providerEnglishName) { reasons.push(`entityBindingInvalid:${expected.entityId}`); continue; }
        if (trees) {
            for (const side of ["before", "after"]) validateArtifact(candidate.revisions?.[side], expected, revisions[side], trees[side], root, reasons);
        }
    }
    const bridges = Array.isArray(snapshot?.claim?.candidateBridges) ? snapshot.claim.candidateBridges : [];
    if (bridges.length !== queue.capturedCandidateCount || new Set(bridges.map((candidate) => candidate.candidateId)).size !== bridges.length || bridges.some((candidate) => travelerEntityIds.includes(String(candidate.entityId)))) reasons.push("candidateBridgeInventoryInvalid");
    for (const bridge of bridges) {
        if (bridge.safeExactMapping === true) {
            if (bridge.status !== "exactLocalizedNameProviderKey" || !bridge.providerFieldKey || bridge.noOrdinalInference !== true || bridge.noTransliterationInference !== true || bridge.noSemanticInference !== true || bridge.revisions?.before?.sameProviderFieldKey !== true || bridge.revisions?.after?.sameProviderFieldKey !== true || bridge.revisions.before.providerFieldKey !== bridge.providerFieldKey || bridge.revisions.after.providerFieldKey !== bridge.providerFieldKey) reasons.push(`candidateBridgeEvidenceInvalid:${bridge.candidateId}`);
        } else if (bridge.noOrdinalInference !== true || bridge.noTransliterationInference !== true || bridge.noSemanticInference !== true) reasons.push(`candidateBridgePolicyInvalid:${bridge.candidateId}`);
    }
    if (snapshot?.claim?.bridge?.expectedCandidateBridgeCount !== queue.capturedCandidateCount || snapshot?.summary?.expectedCandidateBridges !== queue.capturedCandidateCount || snapshot?.summary?.certificateEligibleClaims !== 0 || snapshot?.summary?.canonicalPromotionCount !== 0) reasons.push("summaryInvalid");
    if (snapshot?.claim?.disposition?.canIssueEligibilityCertificate !== false || snapshot?.claim?.disposition?.canPromoteCanonical !== false || snapshot?.gateEligibility?.canIssueEligibilityCertificate !== false || snapshot?.gateEligibility?.canPromoteCanonical !== false || snapshot?.gateEligibility?.sourceFamilyCount !== 1) reasons.push("failClosedDispositionInvalid");
    if (trees && identitySnapshot) {
        if (digestStable(snapshot.claim.reusedTreeProof) !== digestStable(trees)) reasons.push("reusedTreeProofMismatch");
        for (const side of ["before", "after"]) {
            let actualPackage = null;
            try { actualPackage = packageEvidence(identitySnapshot, revisions[side], root); } catch (error) { reasons.push(`packageEvidenceInvalid:${side}:${error.message}`); }
            if (snapshot.claim.versionBindings?.[side]?.revision !== revisions[side].revision || snapshot.claim.versionBindings?.[side]?.japaneseTalentsTreeProof?.treeFieldDigest !== trees[side].treeFieldDigest || snapshot.claim.versionBindings?.[side]?.package?.sourceSnapshotFieldDigest !== identitySnapshot.fieldDigest || (actualPackage && digestStable(snapshot.claim.versionBindings?.[side]?.package) !== digestStable(actualPackage))) reasons.push(`versionBindingInvalid:${side}`);
        }
    }
    if (compareCurrent) {
        try { if (stableJson(buildSnapshot(root)) !== stableJson(snapshot)) reasons.push("artifactNotDeterministicForCurrentInputs"); } catch (error) { reasons.push(`currentInputsInvalid:${error.message}`); }
    }
    return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}

function validateCheckpoint(checkpoint, { repositoryRoot: root = repositoryRoot } = {}) {
    const reasons = [];
    if (!checkpoint || checkpoint.schemaVersion !== 1 || checkpoint.kind !== "genshinVersionTransitionTalentGapLocalizedFieldCaptureCheckpoint") reasons.push("identityInvalid");
    if (checkpoint?.generatedAt !== generatedAt || checkpoint?.transitionId !== transitionId || checkpoint?.sourceNamespace !== sourceNamespace) reasons.push("bindingInvalid");
    if (checkpoint?.fieldDigestAlgorithm !== "sha256-stable-json-v1" || checkpoint?.fieldDigest !== digestStable(checkpoint?.claim)) reasons.push("fieldDigestInvalid");
    if (checkpoint?.gateEligibility?.sourceFamilyCount !== 1 || checkpoint?.gateEligibility?.canIssueEligibilityCertificate !== false || checkpoint?.gateEligibility?.canPromoteCanonical !== false) reasons.push("failClosedDispositionInvalid");
    try {
        const queue = loadQueue(root);
        if (checkpoint.authoritativeCandidateCount !== queue.candidateCount || checkpoint.capturedCandidateCount !== queue.capturedCandidateCount || checkpoint.authoritativeEntityCount !== queue.entityIds.length || checkpoint.capturedCandidateCount !== 63 || checkpoint.claim?.authoritativeCandidateIdsDigest !== queue.candidateIdsDigest || checkpoint.claim?.capturedCandidateIdsDigest !== queue.capturedCandidateIdsDigest) reasons.push("queueCoverageInvalid");
    } catch (error) { reasons.push(`queueInvalid:${error.message}`); }
    for (const side of ["before", "after"]) {
        const revision = revisions[side];
        const progress = checkpoint?.revisions?.[side];
        if (!progress || progress.gameVersion !== revision.gameVersion || progress.revision !== revision.revision || !["pending", "records", "complete", "incomplete"].includes(progress.status) || !Array.isArray(progress.completedEntityIds) || progress.completedRecordCount !== progress.completedEntityIds.length || progress.completedEntityIds.some((id) => !entityById.has(String(id)))) reasons.push(`revisionCheckpointInvalid:${side}`);
    }
    if (checkpoint.materializedSnapshot?.path) {
        const file = absolute(root, checkpoint.materializedSnapshot.path);
        if (!fs.existsSync(file)) reasons.push("materializedSnapshotMissing");
        else {
            try {
                const snapshot = readJson(file);
                if (checkpoint.materializedSnapshot.fieldDigest !== snapshot.fieldDigest || !validateSnapshot(snapshot, { repositoryRoot: root }).valid) reasons.push("materializedSnapshotInvalid");
            } catch (error) { reasons.push(`materializedSnapshotInvalid:${error.message}`); }
        }
    }
    return { valid: [...new Set(reasons)].length === 0, reasons: [...new Set(reasons)] };
}

async function main() {
    if (process.argv.includes("--fetch")) await acquire();
    const snapshot = writeSnapshot();
    process.stdout.write(`${JSON.stringify(snapshot.summary, null, 2)}\n`);
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
    entities,
    entityById,
    generatedAt,
    lane,
    outputPath,
    providerRoot,
    revisions,
    schemaPath,
    checkpointSchemaPath,
    sourceNamespace,
    travelerEntityIds,
    validateCheckpoint,
    validateSnapshot,
    writeSnapshot,
    passiveFields,
    sourcePath,
    sourceUrl,
    loadQueue,
    treeProof,
    englishEvidenceIndex,
    findEnglishEvidence
};
