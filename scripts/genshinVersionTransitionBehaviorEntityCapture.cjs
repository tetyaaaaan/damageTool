"use strict";

/**
 * Materialize the pinned genshin-db behavior records needed for the first
 * character transition shard.
 *
 * This capture deliberately stops at source evidence.  It does not parse
 * prose into Runtime fields, choose a Traveler element, or issue a
 * certificate.  Every materialized record is tied to both the Git revision
 * and the bytes that were checked in.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { digestStable } = require("./genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const transitionRoot = path.join(repositoryRoot, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0");
const providerRoot = path.join(transitionRoot, "sources", "genshin-db");
const outputPath = path.join(transitionRoot, "behavior-entity-snapshot.json");
const generatedAt = "2026-08-26T00:00:00.000Z";
const repository = "theBowja/genshin-db";
const sourceFamily = "GenshinData-derived";
const recordKinds = ["talents", "constellations"];

const revisions = {
    before: {
        gameVersion: "6.7",
        revision: "1bab2cdba4d218fd5caa46b5f54e7884ee8359a2",
        packageVersion: "5.2.12",
        packagePath: "package.json",
        packageDigest: "5ded2b3bab58218da17f6a1282209e653c1ec7ecd9297b95569558a737c2e8f6",
        packageBytes: 1619,
        packageBlob: "e78cc92e75db21ea15edadbeafdf9152896d934c"
    },
    after: {
        gameVersion: "7.0",
        revision: "8b15995fa220c88a4d0d7ffe1e21b041d0b32588",
        packageVersion: "5.2.13",
        packagePath: "package.json",
        packageDigest: "3faf0b2220539a07af9260f5dd83afd0e964aa42868c9b3b73c6cb14065085c6",
        packageBytes: 1619,
        packageBlob: "cfccefd470f420159b1376440e1a0f86a247030d"
    }
};

// Provider slugs are resolved from each revision's non-recursive
// src/data/English/{talents,constellations} tree.  They are not derived from
// the local display name or from a fuzzy search.
const resolvedEntities = [
    { entityId: "10000002", name: "Ayaka", nameJa: "神里綾華", slug: "kamisatoayaka" },
    { entityId: "10000003", name: "Jean", nameJa: "ジン", slug: "jean" },
    { entityId: "10000006", name: "Lisa", nameJa: "リサ", slug: "lisa" },
    { entityId: "10000014", name: "Barbara", nameJa: "バーバラ", slug: "barbara" },
    { entityId: "10000015", name: "Kaeya", nameJa: "ガイア", slug: "kaeya" },
    { entityId: "10000016", name: "Diluc", nameJa: "ディルック", slug: "diluc" }
];

const travelerVariants = ["anemo", "geo", "electro", "dendro", "hydro", "pyro", "cryo"];
const ambiguousEntities = [
    { entityId: "10000005", name: "Traveler", nameJa: "旅人" },
    { entityId: "10000007", name: "Traveler", nameJa: "旅人" }
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

async function fetchBytes(url) {
    const response = await fetch(url, { headers: { "User-Agent": "damageTool-genshin-behavior-capture" } });
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

async function acquire() {
    for (const revision of Object.values(revisions)) {
        const root = path.join(providerRoot, revision.revision);
        fs.mkdirSync(root, { recursive: true });
        const manifest = await fetchBytes(`https://raw.githubusercontent.com/${repository}/${revision.revision}/${revision.packagePath}`);
        assertExpectedRevisionManifest(revision, manifest);
        fs.writeFileSync(packageFile(revision), manifest);
        const entities = [...resolvedEntities, ...travelerVariants.map((variant) => ({ slug: `traveler${variant}` }))];
        for (const entity of entities) {
            for (const recordKind of recordKinds) {
                let bytes;
                try {
                    bytes = await fetchBytes(sourceUrl(revision.revision, recordKind, entity.slug));
                } catch (error) {
                    // Some elemental Traveler variants were not materialized
                    // by the provider at an older revision.  Preserve that
                    // absence as evidence; it must never be treated as an
                    // empty record or resolved to another element.
                    if (entity.slug.startsWith("traveler") && error.status === 404) continue;
                    throw error;
                }
                const file = sourcePath(revision.revision, recordKind, entity.slug);
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file, bytes);
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

function artifact(revision, recordKind, slug, { allowMissing = false } = {}) {
    const file = sourcePath(revision.revision, recordKind, slug);
    if (!fs.existsSync(file)) {
        if (!allowMissing) throw new Error(`captured source missing: ${relative(file)}`);
        return {
            status: "sourcePathMissing",
            gameVersion: revision.gameVersion,
            revision: revision.revision,
            packageVersion: revision.packageVersion,
            path: relative(file),
            url: sourceUrl(revision.revision, recordKind, slug),
            gitBlob: null,
            rawArtifactBytes: null,
            rawArtifactSha256: null
        };
    }
    const bytes = fs.readFileSync(file);
    const digest = sha256(bytes);
    return {
        gameVersion: revision.gameVersion,
        revision: revision.revision,
        packageVersion: revision.packageVersion,
        path: relative(file),
        url: sourceUrl(revision.revision, recordKind, slug),
        gitBlob: gitBlobSha(bytes),
        rawArtifactBytes: bytes.length,
        rawArtifactSha256: digest,
        value: JSON.parse(bytes.toString("utf8"))
    };
}

function packageEvidence(revision) {
    const file = packageFile(revision);
    if (!fs.existsSync(file)) throw new Error(`captured package manifest missing: ${relative(file)}`);
    const bytes = fs.readFileSync(file);
    const manifest = readJson(file);
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

function recordComparison(before, after) {
    if (before.status === "sourcePathMissing" || after.status === "sourcePathMissing") {
        return {
            status: "sourcePathMissing",
            changedFieldCount: null,
            fieldDiffs: [],
            comparisonEligible: false
        };
    }
    const diffs = fieldDiffs(before.value, after.value);
    return {
        status: diffs.length === 0 ? "rawRecordMatch" : "rawRecordChanged",
        changedFieldCount: diffs.length,
        fieldDiffs: diffs
    };
}

function behaviorRecords(slug, { allowMissing = false } = {}) {
    return recordKinds.map((recordKind) => {
        const before = artifact(revisions.before, recordKind, slug, { allowMissing });
        const after = artifact(revisions.after, recordKind, slug, { allowMissing });
        return { recordKind, before, after, comparison: recordComparison(before, after) };
    });
}

function stripValue(record) {
    const clone = JSON.parse(JSON.stringify(record));
    delete clone.before.value;
    delete clone.after.value;
    return clone;
}

function buildResolvedEntity(entity) {
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
        records: behaviorRecords(entity.slug).map(stripValue)
    };
}

function buildTravelerVariant(variant) {
    const slug = `traveler${variant}`;
    const records = behaviorRecords(slug, { allowMissing: true });
    return {
        variant,
        providerSlug: slug,
        records: records.map(stripValue),
        comparisonPolicy: "sameVariantPathOnly",
        crossVariantComparison: "forbidden"
    };
}

function buildSnapshot() {
    const resolved = resolvedEntities.map(buildResolvedEntity);
    const variantEvidence = travelerVariants.map(buildTravelerVariant);
    const ambiguities = ambiguousEntities.map((entity) => ({
        entityId: entity.entityId,
        name: entity.name,
        nameJa: entity.nameJa,
        resolutionStatus: "unresolvedVariantAmbiguity",
        reason: "Provider exposes multiple elemental Traveler records and the local entity ID does not encode an elemental variant.",
        candidateVariantCount: variantEvidence.length,
        candidateVariants: travelerVariants,
        variantEvidenceRef: "claim.travelerVariantEvidence",
        canonicalMapping: null,
        canonicalPromotion: "forbiddenUntilVariantIdentityIsResolved"
    }));
    const allRecords = resolved.flatMap((entity) => entity.records);
    const changedRecords = allRecords.filter((record) => record.comparison.status === "rawRecordChanged");
    const changedFields = allRecords.reduce((sum, record) => sum + record.comparison.changedFieldCount, 0);
    const claim = {
        transitionId: "genshin:6.7->7.0",
        fromGameVersion: revisions.before.gameVersion,
        toGameVersion: revisions.after.gameVersion,
        provider: "genshin-db",
        sourceFamily,
        repository,
        treeResolution: {
            method: "nonRecursiveGitTreePath",
            note: "Each path is a concrete entry under src/data/English/{talents,constellations}; no recursive tree result or fuzzy name match is used."
        },
        versionBindings: Object.values(revisions).map((revision) => ({
            gameVersion: revision.gameVersion,
            revision: revision.revision,
            packageVersion: revision.packageVersion,
            status: "strictlyBound",
            package: packageEvidence(revision)
        })),
        resolvedEntities: resolved,
        travelerVariantEvidence: variantEvidence,
        variantAmbiguities: ambiguities,
        coverage: {
            resolvedEntityIds: resolvedEntities.map((entity) => entity.entityId),
            ambiguousEntityIds: ambiguousEntities.map((entity) => entity.entityId),
            recordKinds,
            resolvedEntityRecordCoverage: "complete",
            travelerVariantRecordCoverage: "complete",
            repositoryCandidateCoverage: "partial",
            crossVariantComparisons: 0,
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false
        }
    };
    return {
        schemaVersion: 1,
        kind: "genshinVersionTransitionBehaviorEntitySnapshot",
        generatedAt,
        claim,
        summary: {
            resolvedEntities: resolved.length,
            ambiguousEntities: ambiguities.length,
            travelerVariants: variantEvidence.length,
            resolvedRecords: allRecords.length,
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
            reasons: ["providerIndependenceInsufficient", "behaviorSemanticsNotParsed", "travelerVariantAmbiguity"]
        },
        fieldDigestAlgorithm: "sha256-stable-json-v1",
        fieldDigest: digestStable(claim)
    };
}

function validateArtifact(candidate, expectedRevision, expectedRecordKind, expectedSlug, repositoryRootForValidation) {
    const reasons = [];
    const file = candidate?.path ? path.resolve(repositoryRootForValidation, candidate.path) : null;
    const expectedPath = sourcePath(expectedRevision.revision, expectedRecordKind, expectedSlug);
    if (!file || path.resolve(file) !== path.resolve(expectedPath)) reasons.push("pathMismatch");
    if (candidate?.status === "sourcePathMissing") {
        if (file && fs.existsSync(file)) reasons.push("unexpectedMaterializedMissingPath");
        if (candidate.gameVersion !== expectedRevision.gameVersion || candidate.revision !== expectedRevision.revision) reasons.push("versionBindingMismatch");
        if (candidate.packageVersion !== expectedRevision.packageVersion) reasons.push("packageVersionMismatch");
        if (candidate.gitBlob !== null || candidate.rawArtifactBytes !== null || candidate.rawArtifactSha256 !== null) reasons.push("missingArtifactHasIntegrity");
        return reasons;
    }
    if (!file || !fs.existsSync(file)) return [...reasons, "missing"];
    const bytes = fs.readFileSync(file);
    if (candidate.gameVersion !== expectedRevision.gameVersion || candidate.revision !== expectedRevision.revision) reasons.push("versionBindingMismatch");
    if (candidate.packageVersion !== expectedRevision.packageVersion) reasons.push("packageVersionMismatch");
    if (candidate.rawArtifactBytes !== bytes.length) reasons.push("bytesMismatch");
    if (candidate.rawArtifactSha256 !== sha256(bytes)) reasons.push("sha256Mismatch");
    if (candidate.gitBlob !== gitBlobSha(bytes)) reasons.push("gitBlobMismatch");
    try {
        JSON.parse(bytes.toString("utf8"));
    } catch {
        reasons.push("jsonInvalid");
    }
    return reasons;
}

function validateBehaviorEntitySnapshot(snapshot, { repositoryRoot: root = repositoryRoot } = {}) {
    const reasons = [];
    if (snapshot?.schemaVersion !== 1 || snapshot?.kind !== "genshinVersionTransitionBehaviorEntitySnapshot") reasons.push("identityInvalid");
    if (snapshot?.generatedAt !== generatedAt) reasons.push("generatedAtInvalid");
    if (snapshot?.fieldDigestAlgorithm !== "sha256-stable-json-v1" || snapshot?.fieldDigest !== digestStable(snapshot?.claim)) reasons.push("fieldDigestInvalid");
    if (snapshot?.claim?.transitionId !== "genshin:6.7->7.0" || snapshot?.claim?.fromGameVersion !== "6.7" || snapshot?.claim?.toGameVersion !== "7.0") reasons.push("transitionBindingInvalid");
    if (snapshot?.claim?.provider !== "genshin-db" || snapshot?.claim?.sourceFamily !== sourceFamily || snapshot?.claim?.repository !== repository) reasons.push("providerBindingInvalid");
    const bindings = Array.isArray(snapshot?.claim?.versionBindings) ? snapshot.claim.versionBindings : [];
    if (bindings.length !== 2) reasons.push("versionBindingsIncomplete");
    for (const revision of Object.values(revisions)) {
        const binding = bindings.find((candidate) => candidate.gameVersion === revision.gameVersion);
        if (!binding || binding.revision !== revision.revision || binding.packageVersion !== revision.packageVersion || binding.status !== "strictlyBound") {
            reasons.push(`versionBindingInvalid:${revision.gameVersion}`);
            continue;
        }
        const packageEvidenceValue = binding.package;
        const file = packageEvidenceValue?.path ? path.resolve(root, packageEvidenceValue.path) : null;
        if (!file || !fs.existsSync(file)) {
            reasons.push(`packageMissing:${revision.gameVersion}`);
            continue;
        }
        const bytes = fs.readFileSync(file);
        if (bytes.length !== revision.packageBytes || sha256(bytes) !== revision.packageDigest || gitBlobSha(bytes) !== revision.packageBlob) reasons.push(`packageBindingInvalid:${revision.gameVersion}`);
        let manifest;
        try { manifest = JSON.parse(bytes.toString("utf8")); } catch { reasons.push(`packageJsonInvalid:${revision.gameVersion}`); }
        if (manifest && (manifest.name !== "genshin-db" || manifest.version !== revision.packageVersion)) reasons.push(`packageVersionInvalid:${revision.gameVersion}`);
    }
    const resolved = Array.isArray(snapshot?.claim?.resolvedEntities) ? snapshot.claim.resolvedEntities : [];
    if (resolved.length !== resolvedEntities.length || new Set(resolved.map((entity) => entity.entityId)).size !== resolved.length) reasons.push("resolvedEntitiesIncomplete");
    for (const entity of resolvedEntities) {
        const candidate = resolved.find((item) => item.entityId === entity.entityId);
        if (!candidate || candidate.providerSlug !== entity.slug || candidate.resolutionStatus !== "resolvedUnambiguous") {
            reasons.push(`resolvedEntityInvalid:${entity.entityId}`);
            continue;
        }
        if (!Array.isArray(candidate.records) || candidate.records.length !== recordKinds.length) {
            reasons.push(`recordsIncomplete:${entity.entityId}`);
            continue;
        }
        for (const recordKind of recordKinds) {
            const record = candidate.records.find((item) => item.recordKind === recordKind);
            if (!record) {
                reasons.push(`recordMissing:${entity.entityId}:${recordKind}`);
                continue;
            }
            for (const side of ["before", "after"]) {
                const expectedRevision = side === "before" ? revisions.before : revisions.after;
                reasons.push(...validateArtifact(record[side], expectedRevision, recordKind, entity.slug, root).map((reason) => `${entity.entityId}:${recordKind}:${side}:${reason}`));
            }
            const before = record.before?.value;
            const after = record.after?.value;
            // Values are intentionally omitted from checked-in records; recompute
            // from materialized files instead of trusting a supplied comparison.
            const beforeFile = path.resolve(root, record.before?.path || "");
            const afterFile = path.resolve(root, record.after?.path || "");
            if (fs.existsSync(beforeFile) && fs.existsSync(afterFile)) {
                const beforeValue = JSON.parse(fs.readFileSync(beforeFile, "utf8"));
                const afterValue = JSON.parse(fs.readFileSync(afterFile, "utf8"));
                const diffs = fieldDiffs(beforeValue, afterValue);
                if (record.comparison?.status !== (diffs.length ? "rawRecordChanged" : "rawRecordMatch")
                    || record.comparison?.changedFieldCount !== diffs.length
                    || digestStable(record.comparison?.fieldDiffs) !== digestStable(diffs)) reasons.push(`comparisonInvalid:${entity.entityId}:${recordKind}`);
            }
            void before;
            void after;
        }
    }
    const ambiguities = Array.isArray(snapshot?.claim?.variantAmbiguities) ? snapshot.claim.variantAmbiguities : [];
    if (ambiguities.length !== ambiguousEntities.length) reasons.push("travelerAmbiguitiesIncomplete");
    for (const entity of ambiguousEntities) {
        const ambiguity = ambiguities.find((item) => item.entityId === entity.entityId);
        if (!ambiguity || ambiguity.resolutionStatus !== "unresolvedVariantAmbiguity" || ambiguity.canonicalMapping !== null
            || ambiguity.candidateVariantCount !== travelerVariants.length
            || digestStable(ambiguity.candidateVariants) !== digestStable(travelerVariants)) reasons.push(`travelerAmbiguityInvalid:${entity.entityId}`);
    }
    const variantEvidence = Array.isArray(snapshot?.claim?.travelerVariantEvidence) ? snapshot.claim.travelerVariantEvidence : [];
    if (variantEvidence.length !== travelerVariants.length) reasons.push("travelerVariantEvidenceIncomplete");
    for (const variant of travelerVariants) {
        const candidate = variantEvidence.find((item) => item.variant === variant);
        if (!candidate || candidate.providerSlug !== `traveler${variant}` || candidate.comparisonPolicy !== "sameVariantPathOnly" || candidate.crossVariantComparison !== "forbidden") {
            reasons.push(`travelerVariantInvalid:${variant}`);
            continue;
        }
        if (!Array.isArray(candidate.records) || candidate.records.length !== recordKinds.length) reasons.push(`travelerVariantRecordsIncomplete:${variant}`);
        for (const recordKind of recordKinds) {
            const record = candidate.records.find((item) => item.recordKind === recordKind);
            if (!record) continue;
            for (const side of ["before", "after"]) {
                const expectedRevision = side === "before" ? revisions.before : revisions.after;
                reasons.push(...validateArtifact(record[side], expectedRevision, recordKind, `traveler${variant}`, root).map((reason) => `traveler:${variant}:${recordKind}:${side}:${reason}`));
            }
            if ((record.before?.status === "sourcePathMissing" || record.after?.status === "sourcePathMissing")
                && record.comparison?.status !== "sourcePathMissing") reasons.push(`travelerComparisonInvalid:${variant}:${recordKind}`);
        }
    }
    if (snapshot?.claim?.coverage?.canIssueEligibilityCertificate !== false || snapshot?.claim?.coverage?.canPromoteCanonical !== false
        || snapshot?.gateEligibility?.canIssueEligibilityCertificate !== false || snapshot?.gateEligibility?.canPromoteCanonical !== false) reasons.push("failClosedDispositionInvalid");
    return { valid: reasons.length === 0, reasons };
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

module.exports = {
    acquire,
    ambiguousEntities,
    artifact,
    behaviorRecords,
    buildSnapshot,
    fieldDiffs,
    gitBlobSha,
    generatedAt,
    outputPath,
    packageEvidence,
    recordKinds,
    recordComparison,
    resolvedEntities,
    revisions,
    sha256,
    stripValue,
    sourcePath,
    sourceUrl,
    travelerVariants,
    validateArtifact,
    validateBehaviorEntitySnapshot,
    writeSnapshot
};
