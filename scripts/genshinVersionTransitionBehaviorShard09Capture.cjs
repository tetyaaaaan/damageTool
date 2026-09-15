"use strict";

/**
 * Immutable source capture for behaviorSpec shard 09 of the 6.7 -> 7.0
 * transition.  This lane records raw provider evidence only: it does not
 * parse prose into Runtime fields, issue a certificate, or promote canonical
 * data.  The authoritative inventory is read from the evidence queue at
 * runtime so a stale worker cannot silently capture a different shard.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const base = require("./genshinVersionTransitionBehaviorEntityCapture.cjs");
const { digestStable } = require("./genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const transitionRoot = path.join(repositoryRoot, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0");
const sourceNamespace = "genshin-db-behavior-shard09";
const providerRoot = path.join(transitionRoot, "sources", sourceNamespace);
const queuePath = path.join(repositoryRoot, "reports", "genshin-evidence-task-queue.json");
const outputPath = path.join(transitionRoot, "behavior-shard-09-snapshot.json");
const checkpointPath = path.join(transitionRoot, "behavior-shard-09-capture-checkpoint.json");
const generatedAt = "2026-08-26T00:00:00.000Z";
const repository = "theBowja/genshin-db";
const sourceFamily = "GenshinData-derived";
const recordKinds = ["talents", "constellations"];
const shardId = "behavior:behaviorSpec:semanticDecisionRequired:standard:09";
const overlapEntityIds = [];
const travelerEntityIds = ["10000005", "10000007"];
const expectedCandidateIdsDigest = "4e81f90bebcee15bfc6f8c20cb63102f20ba60ad8750c56d1c9e01bcf1472c62";

// These are the persisted inventory's exact provider identities.  The slug is
// accepted only after $.id and $.name validate for every record/revision.
const resolvedEntities = [
    { entityId: "10000078", name: "Alhaitham", nameJa: "アルハイゼン", providerId: 7801, slug: "alhaitham", slugCandidates: ["alhaitham"] },
    { entityId: "10000079", name: "Dehya", nameJa: "ディシア", providerId: 7901, slug: "dehya", slugCandidates: ["dehya"] },
    { entityId: "10000080", name: "Mika", nameJa: "ミカ", providerId: 8001, slug: "mika", slugCandidates: ["mika"] },
    { entityId: "10000081", name: "Kaveh", nameJa: "カーヴェ", providerId: 8101, slug: "kaveh", slugCandidates: ["kaveh"] },
    { entityId: "10000082", name: "Baizhu", nameJa: "白朮", providerId: 8201, slug: "baizhu", slugCandidates: ["baizhu"] },
    { entityId: "10000083", name: "Lynette", nameJa: "リネット", providerId: 8301, slug: "lynette", slugCandidates: ["lynette"] },
    { entityId: "10000084", name: "Lyney", nameJa: "リネ", providerId: 8401, slug: "lyney", slugCandidates: ["lyney"] },
    { entityId: "10000085", name: "Freminet", nameJa: "フレミネ", providerId: 8501, slug: "freminet", slugCandidates: ["freminet"] }
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
    const clusters = (queue.unlockClusters || []).filter((item) => item.domain === "behavior" && item.layer === "behaviorSpec");
    const shard = clusters.flatMap((cluster) => cluster.shards || []).find((item) => String(item?.shardId || "") === shardId);
    if (!shard || !Array.isArray(shard.candidateIds) || shard.candidateIds.length !== 100) {
        throw new Error(`authoritative behaviorSpec shard 09 missing or count is not 100: ${shardId}`);
    }
    const candidateIds = shard.candidateIds.map(String);
    if (new Set(candidateIds).size !== candidateIds.length || !candidateIds.every((id) => /^behavior:100000\d+:/.test(id))) {
        throw new Error("authoritative behaviorSpec shard 09 candidate IDs are malformed or duplicated");
    }
    const candidateIdsDigest = digestStable(candidateIds);
    if (candidateIdsDigest !== expectedCandidateIdsDigest) {
        throw new Error(`shard 09 candidate digest mismatch: ${candidateIdsDigest}`);
    }
    const entityIds = [...new Set(candidateIds.map((candidateId) => candidateId.split(":")[1]))];
    const expectedEntityIds = resolvedEntities.map((entity) => entity.entityId);
    if (digestStable(entityIds) !== digestStable(expectedEntityIds)) {
        throw new Error(`shard 09 entity inventory mismatch: ${entityIds.join(",")}`);
    }
    if (entityIds.some((entityId) => travelerEntityIds.includes(entityId))) {
        throw new Error("Traveler variant ambiguity must remain fail-closed");
    }
    return {
        shardId,
        queuePath: relative(queuePath),
        candidateIds,
        candidateIdsDigest,
        entityIds,
        entityIdsDigest: digestStable(entityIds),
        candidateCount: candidateIds.length,
        entityCount: entityIds.length
    };
}

async function fetchBytes(url) {
    const response = await fetch(url, { headers: { "User-Agent": "damageTool-genshin-behavior-shard-09" } });
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
    if (manifest.name !== "genshin-db" || manifest.version !== revision.packageVersion) throw new Error(`${revision.gameVersion} package version mismatch`);
    if (!String(manifest.description || "").includes(`Genshin Impact v${revision.gameVersion} JSON data`)) throw new Error(`${revision.gameVersion} strict game-version text missing`);
    if (!String(manifest.description || "").includes("fandom wiki and GenshinData repo")) throw new Error(`${revision.gameVersion} lineage text missing`);
    return manifest;
}

function parseProviderRecord(bytes, expected) {
    let record;
    try {
        record = JSON.parse(bytes.toString("utf8"));
    } catch (error) {
        throw new Error(`invalid provider JSON for ${expected.entityId}/${expected.recordKind}: ${error.message}`);
    }
    if (!Number.isInteger(record.id) || record.id !== expected.providerId) throw new Error(`embedded provider id mismatch for ${expected.entityId}/${expected.recordKind}: expected ${expected.providerId}, got ${record.id}`);
    if (record.name !== expected.name) throw new Error(`embedded provider name mismatch for ${expected.entityId}/${expected.recordKind}: expected ${expected.name}, got ${record.name}`);
    return record;
}

async function resolveAndFetch(revision, entity, recordKind) {
    const valid = [];
    for (const slug of entity.slugCandidates) {
        const bytes = await fetchBytes(sourceUrl(revision.revision, recordKind, slug));
        const record = parseProviderRecord(bytes, { ...entity, recordKind });
        valid.push({ slug, bytes, record });
    }
    if (valid.length !== 1) throw new Error(`provider path ambiguity for ${entity.entityId}/${recordKind}`);
    return valid[0];
}

async function acquire() {
    queueShard();
    fs.mkdirSync(providerRoot, { recursive: true });
    for (const revision of Object.values(base.revisions)) {
        const manifestBytes = await fetchBytes(`https://raw.githubusercontent.com/${repository}/${revision.revision}/${revision.packagePath}`);
        assertExpectedPackage(revision, manifestBytes);
        fs.mkdirSync(path.dirname(packageFile(revision)), { recursive: true });
        fs.writeFileSync(packageFile(revision), manifestBytes);
        for (const entity of resolvedEntities) {
            const selected = [];
            for (const recordKind of recordKinds) selected.push({ recordKind, ...(await resolveAndFetch(revision, entity, recordKind)) });
            if ([...new Set(selected.map((item) => item.slug))].length !== 1) throw new Error(`cross-record provider path mismatch for ${entity.entityId}`);
            for (const item of selected) {
                const file = sourcePath(revision.revision, item.recordKind, item.slug);
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file, item.bytes);
            }
        }
    }
}

function fieldDigest(value) {
    return digestStable(value === undefined ? null : value);
}

function pointerToken(value) {
    return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
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

function buildEntity(entity) {
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
        treeResolution: {
            method: "nonRecursiveGitTreePath",
            resolutionEvidence: "immutableRawPathWithEmbeddedId",
            directoryPaths: recordKinds.map((recordKind) => `src/data/English/${recordKind}`),
            pathResolution: recordKinds.map((recordKind) => ({ recordKind, path: `src/data/English/${recordKind}/${entity.slug}.json` }))
        },
        records
    };
}

function buildSnapshot() {
    const queue = queueShard();
    const entities = resolvedEntities.map(buildEntity);
    const records = entities.flatMap((entity) => entity.records);
    const changedRecords = records.filter((record) => record.comparison.status === "rawRecordChanged");
    const changedFields = records.reduce((sum, record) => sum + record.comparison.changedFieldCount, 0);
    const capturedEntityIds = resolvedEntities.map((entity) => entity.entityId);
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
            queuePath: queue.queuePath,
            authoritativeCandidateCount: queue.candidateCount,
            authoritativeCandidateIds: queue.candidateIds,
            authoritativeCandidateIdsDigest: queue.candidateIdsDigest,
            authoritativeEntityIds: queue.entityIds,
            capturedNewEntityIds: capturedEntityIds,
            skippedOverlapEntityIds: overlapEntityIds,
            overlapPolicy: "noneWithMaterializedBehaviorShards01To08"
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
            note: "No Traveler entity is in shard09; any future Traveler queue entry must remain unresolved until its variant identity is explicit."
        },
        coverage: {
            resolvedEntityIds: capturedEntityIds,
            ambiguousEntityIds: [],
            recordKinds,
            authoritativeCandidateCoverage: "entitySourceRecordsForNewEntitiesComplete",
            resolvedEntityRecordCoverage: "complete",
            travelerVariantRecordCoverage: "notApplicable",
            repositoryCandidateCoverage: "partial",
            authoritativeCandidateCount: queue.candidateCount,
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
            reasons: ["providerIndependenceInsufficient", "behaviorSemanticsNotParsed", "noIndependentSourceFamily"]
        },
        fieldDigestAlgorithm: "sha256-stable-json-v1",
        fieldDigest: digestStable(claim)
    };
}

function validateArtifact(candidate, expectedRevision, recordKind, entity, root = repositoryRoot) {
    const reasons = [];
    const file = candidate?.path ? path.resolve(root, candidate.path) : null;
    const expected = sourcePath(expectedRevision.revision, recordKind, entity.slug);
    if (!file || path.resolve(file) !== path.resolve(expected)) reasons.push("pathMismatch");
    if (!file || !fs.existsSync(file)) return [...reasons, "missing"];
    const bytes = fs.readFileSync(file);
    if (candidate.gameVersion !== expectedRevision.gameVersion || candidate.revision !== expectedRevision.revision) reasons.push("versionBindingMismatch");
    if (candidate.packageVersion !== expectedRevision.packageVersion) reasons.push("packageVersionMismatch");
    if (candidate.rawArtifactBytes !== bytes.length) reasons.push("bytesMismatch");
    if (candidate.rawArtifactSha256 !== sha256(bytes)) reasons.push("sha256Mismatch");
    if (candidate.gitBlob !== gitBlobSha(bytes)) reasons.push("gitBlobMismatch");
    let value;
    try { value = parseProviderRecord(bytes, { ...entity, recordKind }); } catch { reasons.push("embeddedIdInvalid"); }
    if (candidate.embeddedIdPath !== "$.id" || candidate.embeddedId !== entity.providerId || value?.id !== entity.providerId) reasons.push("embeddedIdMismatch");
    if (candidate.embeddedName !== value?.name) reasons.push("embeddedNameMismatch");
    return reasons;
}

function validatePackageBinding(binding, revision, root, reasons) {
    const file = binding?.package?.path ? path.resolve(root, binding.package.path) : null;
    if (!binding || binding.gameVersion !== revision.gameVersion || binding.revision !== revision.revision || binding.packageVersion !== revision.packageVersion || binding.status !== "strictlyBound" || !file || !fs.existsSync(file)) {
        reasons.push(`versionBindingInvalid:${revision.gameVersion}`);
        return;
    }
    const bytes = fs.readFileSync(file);
    if (bytes.length !== revision.packageBytes || sha256(bytes) !== revision.packageDigest || gitBlobSha(bytes) !== revision.packageBlob) reasons.push(`packageBindingInvalid:${revision.gameVersion}`);
    try {
        const manifest = JSON.parse(bytes.toString("utf8"));
        if (binding.package.rawArtifactBytes !== bytes.length || binding.package.rawArtifactSha256 !== sha256(bytes) || binding.package.gitBlob !== gitBlobSha(bytes) || binding.package.name !== manifest.name || binding.package.description !== manifest.description) reasons.push(`packageMetadataInvalid:${revision.gameVersion}`);
        if (manifest.name !== "genshin-db" || manifest.version !== revision.packageVersion) reasons.push(`packageVersionInvalid:${revision.gameVersion}`);
    } catch { reasons.push(`packageJsonInvalid:${revision.gameVersion}`); }
}

function validateBehaviorShard09Snapshot(snapshot, { repositoryRoot: root = repositoryRoot } = {}) {
    const reasons = [];
    if (snapshot?.schemaVersion !== 1 || snapshot?.kind !== "genshinVersionTransitionBehaviorShardSnapshot") reasons.push("identityInvalid");
    if (snapshot?.generatedAt !== generatedAt) reasons.push("generatedAtInvalid");
    if (snapshot?.fieldDigestAlgorithm !== "sha256-stable-json-v1" || snapshot?.fieldDigest !== digestStable(snapshot?.claim)) reasons.push("fieldDigestInvalid");
    if (snapshot?.claim?.transitionId !== "genshin:6.7->7.0" || snapshot?.claim?.fromGameVersion !== "6.7" || snapshot?.claim?.toGameVersion !== "7.0") reasons.push("transitionBindingInvalid");
    if (snapshot?.claim?.provider !== "genshin-db" || snapshot?.claim?.sourceFamily !== sourceFamily || snapshot?.claim?.sourceNamespace !== sourceNamespace || snapshot?.claim?.repository !== repository) reasons.push("providerBindingInvalid");
    const queue = queueShard();
    const shard = snapshot?.claim?.shard;
    if (shard?.shardId !== shardId || shard?.authoritativeCandidateCount !== queue.candidateCount || digestStable(shard?.authoritativeCandidateIds) !== queue.candidateIdsDigest || digestStable(shard?.authoritativeEntityIds) !== digestStable(queue.entityIds) || digestStable(shard?.capturedNewEntityIds) !== digestStable(resolvedEntities.map((entity) => entity.entityId)) || digestStable(shard?.skippedOverlapEntityIds) !== digestStable(overlapEntityIds) || shard?.overlapPolicy !== "noneWithMaterializedBehaviorShards01To08") reasons.push("authoritativeShardBindingInvalid");
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
        if (!Array.isArray(entity.records) || entity.records.length !== recordKinds.length) {
            reasons.push(`recordsIncomplete:${expected.entityId}`);
            continue;
        }
        for (const recordKind of recordKinds) {
            const record = entity.records.find((candidate) => candidate.recordKind === recordKind);
            if (!record) { reasons.push(`recordMissing:${expected.entityId}:${recordKind}`); continue; }
            for (const side of ["before", "after"]) {
                const revision = side === "before" ? base.revisions.before : base.revisions.after;
                reasons.push(...validateArtifact(record[side], revision, recordKind, expected, root).map((reason) => `${expected.entityId}:${recordKind}:${side}:${reason}`));
            }
            const beforePath = path.resolve(root, record.before?.path || "");
            const afterPath = path.resolve(root, record.after?.path || "");
            if (!fs.existsSync(beforePath) || !fs.existsSync(afterPath)) { reasons.push(`comparisonSourceMissing:${expected.entityId}:${recordKind}`); continue; }
            const beforeValue = parseProviderRecord(fs.readFileSync(beforePath), { ...expected, recordKind });
            const afterValue = parseProviderRecord(fs.readFileSync(afterPath), { ...expected, recordKind });
            const diffs = fieldDiffs(beforeValue, afterValue);
            if (record.comparison?.status !== (diffs.length ? "rawRecordChanged" : "rawRecordMatch") || record.comparison?.changedFieldCount !== diffs.length || digestStable(record.comparison?.fieldDiffs) !== digestStable(diffs) || record.comparison?.beforeFieldDigest !== fieldDigest(beforeValue) || record.comparison?.afterFieldDigest !== fieldDigest(afterValue) || record.comparison?.beforeArtifactSha256 !== record.before.rawArtifactSha256 || record.comparison?.afterArtifactSha256 !== record.after.rawArtifactSha256) reasons.push(`comparisonInvalid:${expected.entityId}:${recordKind}`);
        }
    }
    if (!Array.isArray(snapshot?.claim?.travelerVariantEvidence) || snapshot.claim.travelerVariantEvidence.length !== 0) reasons.push("travelerVariantEvidenceUnexpected");
    if (!Array.isArray(snapshot?.claim?.variantAmbiguities) || snapshot.claim.variantAmbiguities.length !== 0) reasons.push("variantAmbiguitiesUnexpected");
    if (snapshot?.claim?.travelerVariantPolicy?.failClosedOnEncounter !== true || snapshot.claim.travelerVariantPolicy.status !== "notApplicable") reasons.push("travelerPolicyInvalid");
    if (snapshot?.summary?.shardId !== shardId || snapshot.summary.authoritativeCandidates !== queue.candidateCount || snapshot.summary.authoritativeEntities !== queue.entityCount || snapshot.summary.resolvedEntities !== resolvedEntities.length || snapshot.summary.overlapSkippedEntities !== 0 || snapshot.summary.ambiguousEntities !== 0 || snapshot.summary.resolvedRecords !== resolvedEntities.length * recordKinds.length || snapshot.summary.sourceFamilyCount !== 1 || snapshot.summary.certificateEligibleClaims !== 0) reasons.push("summaryInvalid");
    if (snapshot?.claim?.coverage?.overlapEntityCount !== 0 || snapshot?.claim?.coverage?.canIssueEligibilityCertificate !== false || snapshot?.claim?.coverage?.canPromoteCanonical !== false || snapshot?.gateEligibility?.sourceFamilyCount !== 1 || snapshot?.gateEligibility?.canIssueEligibilityCertificate !== false || snapshot?.gateEligibility?.canPromoteCanonical !== false) reasons.push("failClosedDispositionInvalid");
    return { valid: reasons.length === 0, reasons };
}

function buildCheckpoint(snapshot = buildSnapshot()) {
    const queue = queueShard();
    const capturedEntityIds = resolvedEntities.map((entity) => entity.entityId);
    const claim = {
        queueShardId: shardId,
        queuePath: queue.queuePath,
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
        authoritativeCandidateCount: queue.candidateCount,
        authoritativeEntityCount: queue.entityCount,
        requestedEntityCount: queue.entityCount,
        requestedEntityIds: queue.entityIds,
        capturedEntityCount: capturedEntityIds.length,
        capturedEntityIds,
        skippedOverlapEntityCount: 0,
        skippedOverlapEntityIds: overlapEntityIds,
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
    const expectedIds = resolvedEntities.map((entity) => entity.entityId);
    if (checkpoint?.schemaVersion !== 1 || checkpoint?.kind !== "genshinVersionTransitionBehaviorShardCaptureCheckpoint") reasons.push("identityInvalid");
    if (checkpoint?.generatedAt !== generatedAt || checkpoint?.transitionId !== "genshin:6.7->7.0" || checkpoint?.shardId !== shardId || checkpoint?.status !== "complete") reasons.push("transitionBindingInvalid");
    if (checkpoint?.authoritativeCandidateCount !== queue.candidateCount || checkpoint?.requestedEntityCount !== queue.entityCount || checkpoint?.capturedEntityCount !== expectedIds.length || checkpoint?.skippedOverlapEntityCount !== 0 || digestStable(checkpoint?.requestedEntityIds) !== digestStable(expectedIds) || digestStable(checkpoint?.capturedEntityIds) !== digestStable(expectedIds) || digestStable(checkpoint?.skippedOverlapEntityIds) !== digestStable(overlapEntityIds)) reasons.push("checkpointCoverageInvalid");
    if (checkpoint?.fieldDigestAlgorithm !== "sha256-stable-json-v1" || checkpoint?.fieldDigest !== digestStable(checkpoint?.claim)) reasons.push("fieldDigestInvalid");
    if (checkpoint?.claim?.queueShardId !== shardId || checkpoint?.claim?.queuePath !== queue.queuePath || checkpoint?.claim?.authoritativeCandidateIdsDigest !== queue.candidateIdsDigest || digestStable(checkpoint?.claim?.requestedEntityIds) !== digestStable(expectedIds) || digestStable(checkpoint?.claim?.capturedEntityIds) !== digestStable(expectedIds) || digestStable(checkpoint?.claim?.skippedOverlapEntityIds) !== digestStable(overlapEntityIds) || checkpoint?.claim?.sourceNamespace !== sourceNamespace || checkpoint?.claim?.canIssueEligibilityCertificate !== false || checkpoint?.claim?.canPromoteCanonical !== false) reasons.push("checkpointClaimInvalid");
    const materializedPath = checkpoint?.materializedSnapshot?.path ? path.resolve(root, checkpoint.materializedSnapshot.path) : null;
    if (!materializedPath || !fs.existsSync(materializedPath)) reasons.push("materializedSnapshotMissing");
    else {
        let snapshot;
        try { snapshot = readJson(materializedPath); } catch { reasons.push("materializedSnapshotInvalid"); }
        if (snapshot && (checkpoint.materializedSnapshot.fieldDigest !== snapshot.fieldDigest || !validateBehaviorShard09Snapshot(snapshot, { repositoryRoot: root }).valid)) reasons.push("materializedSnapshotInvalid");
    }
    for (const side of ["before", "after"]) {
        const progress = checkpoint?.revisions?.[side];
        const revision = base.revisions[side];
        if (!progress || progress.gameVersion !== revision.gameVersion || progress.revision !== revision.revision || progress.status !== "complete" || progress.completedArtifactCount !== expectedIds.length * recordKinds.length || digestStable(progress.completedEntityIds) !== digestStable(expectedIds)) reasons.push(`revisionCheckpointInvalid:${side}`);
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
    outputPath,
    overlapEntityIds,
    providerRoot,
    queueShard,
    recordKinds,
    resolvedEntities,
    revisions: base.revisions,
    shardId,
    sourceNamespace,
    validateBehaviorShard09Snapshot,
    validateCheckpoint,
    writeSnapshot
};
