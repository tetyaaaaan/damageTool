"use strict";

/**
 * Capture a provider-owned localized identity bridge for one Genshin entity.
 *
 * This lane is intentionally narrower than a behavior capture.  It binds the
 * local Japanese catalog label to a provider-localized record and to the
 * provider English record by the provider's explicit id.  It never parses
 * prose, infers a translation, issues a certificate, or promotes canonical
 * data.  The first entity is 10000124 (ヤフォダ / Jahoda).
 *
 * The provider tree is walked one level at a time.  A raw URL alone is not
 * accepted as path evidence: the selected blob must be present in the exact
 * non-recursive Git tree at each pinned revision, and its SHA/size must match
 * the fetched bytes.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const base = require("./genshinVersionTransitionBehaviorEntityCapture.cjs");
const { digestStable } = require("./genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const transitionRoot = path.join(repositoryRoot, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0");
const sourceNamespace = "genshin-db-localized-identity-bridge-10000124";
const providerRoot = path.join(transitionRoot, "sources", sourceNamespace);
const outputPath = path.join(transitionRoot, "identity-bridge-10000124-snapshot.json");
const checkpointPath = path.join(transitionRoot, "identity-bridge-10000124-capture-checkpoint.json");
const schemaPath = path.join(repositoryRoot, "games", "genshin", "data", "schema", "version-transition-localized-identity-bridge-snapshot.schema.json");
const checkpointSchemaPath = path.join(repositoryRoot, "games", "genshin", "data", "schema", "version-transition-localized-identity-bridge-capture-checkpoint.schema.json");
const repository = "theBowja/genshin-db";
const apiBase = `https://api.github.com/repos/${repository}`;
const rawBase = `https://raw.githubusercontent.com/${repository}`;
const generatedAt = base.generatedAt;
const recordKinds = ["talents", "constellations"];
const englishSourceNamespace = "genshin-db-behavior-shard15";
const englishSnapshotPath = path.join(transitionRoot, "behavior-shard-15-snapshot.json");
const negativeAliasSnapshotPath = path.join(transitionRoot, "behavior-shard-14-snapshot.json");

const entity = Object.freeze({
    entityId: "10000124",
    nameJa: "ヤフォダ",
    providerSlug: "jahoda",
    providerId: 12401,
    providerEnglishName: "Jahoda"
});

const revisions = Object.freeze(Object.fromEntries(Object.entries(base.revisions).map(([side, revision]) => [side, Object.freeze({
    gameVersion: revision.gameVersion,
    revision: revision.revision,
    packageVersion: revision.packageVersion,
    packagePath: revision.packagePath,
    packageDigest: revision.packageDigest,
    packageBytes: revision.packageBytes,
    packageBlob: revision.packageBlob
})])));

const localIdentityPaths = Object.freeze({
    catalog: "games/genshin/data/characters.json",
    talents: "games/genshin/data/character-talents.json",
    constellations: "games/genshin/data/character-constellations.json",
    consumerMapper: "games/js/genshinProfileMapper.js"
});

function sha256(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function gitBlobSha(bytes) {
    const header = Buffer.from(`blob ${bytes.length}\0`, "utf8");
    return crypto.createHash("sha1").update(Buffer.concat([header, bytes])).digest("hex");
}

function gitTreeSha(entries) {
    const sorted = [...entries].sort((left, right) => Buffer.compare(
        Buffer.from(`${left.mode} ${left.path}\0`, "utf8"),
        Buffer.from(`${right.mode} ${right.path}\0`, "utf8")
    ));
    const body = Buffer.concat(sorted.map((entry) => Buffer.concat([
        Buffer.from(`${entry.mode} ${entry.path}\0`, "utf8"),
        Buffer.from(entry.sha, "hex")
    ])));
    return crypto.createHash("sha1").update(Buffer.concat([Buffer.from(`tree ${body.length}\0`, "utf8"), body])).digest("hex");
}

function relative(file, root = repositoryRoot) {
    return path.relative(root, file).replaceAll("\\", "/");
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readBytes(file) {
    return fs.readFileSync(file);
}

function fileDigest(file, root = repositoryRoot) {
    const bytes = readBytes(file);
    return {
        path: relative(file, root),
        rawArtifactBytes: bytes.length,
        sha256: sha256(bytes),
        gitBlob: gitBlobSha(bytes)
    };
}

function providerPath(revision, language, recordKind) {
    return `src/data/${language}/${recordKind}/${entity.providerSlug}.json`;
}

function localProviderPath(revision, language, recordKind, root = repositoryRoot) {
    return path.join(root, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0", "sources", sourceNamespace, revision, language, recordKind, `${entity.providerSlug}.json`);
}

function packageFile(revision, root = repositoryRoot) {
    return path.join(root, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0", "sources", sourceNamespace, revision.revision, revision.packagePath);
}

function treeEvidenceFile(revision, root = repositoryRoot) {
    return path.join(root, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0", "sources", sourceNamespace, revision.revision, "localized-tree-resolution.json");
}

function treeResponseFile(revision, recordKind, stage, root = repositoryRoot) {
    const revisionId = typeof revision === "string" ? revision : revision.revision;
    return path.join(root, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0", "sources", sourceNamespace, revisionId, "tree-api", `${recordKind}-${stage}.json`);
}

function packageUrl(revision) {
    return `${rawBase}/${revision.revision}/${revision.packagePath}`;
}

function rawUrl(revision, language, recordKind) {
    return `${rawBase}/${revision}/${providerPath(revision, language, recordKind)}`;
}

function localFile(key, root = repositoryRoot) {
    return path.resolve(root, localIdentityPaths[key]);
}

function pointerToken(value) {
    return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}

function fieldDigest(value) {
    return digestStable(value === undefined ? null : value);
}

function hasExactRecordKinds(records) {
    if (!Array.isArray(records) || records.length !== recordKinds.length) return false;
    const observed = records.map((record) => record?.recordKind);
    return recordKinds.every((recordKind) => observed.filter((candidate) => candidate === recordKind).length === 1);
}

function hasExactNegativeAliasPairs(records) {
    if (!Array.isArray(records) || records.length !== recordKinds.length * 2) return false;
    const observed = records.map((record) => `${record?.gameVersion}:${record?.recordKind}`);
    const expected = ["6.7", "7.0"].flatMap((gameVersion) => recordKinds.map((recordKind) => `${gameVersion}:${recordKind}`));
    return expected.every((key) => observed.filter((candidate) => candidate === key).length === 1);
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

async function fetchResponse(url, headers = {}) {
    const response = await fetch(url, { headers: { "User-Agent": "damageTool-genshin-localized-identity-bridge", ...headers } });
    const bytes = Buffer.from(await response.arrayBuffer());
    return { response, bytes };
}

async function fetchBytes(url, headers = {}) {
    const { response, bytes } = await fetchResponse(url, headers);
    if (!response.ok) {
        const error = new Error(`fetch failed ${response.status}: ${url}`);
        error.status = response.status;
        error.url = url;
        throw error;
    }
    return bytes;
}

async function fetchTree(treeRef) {
    const url = `${apiBase}/git/trees/${treeRef}`;
    const { response, bytes } = await fetchResponse(url, { Accept: "application/vnd.github+json" });
    let value;
    try { value = JSON.parse(bytes.toString("utf8")); } catch (error) {
        throw new Error(`tree response JSON invalid ${response.status}: ${url}: ${error.message}`);
    }
    if (!response.ok) {
        const error = new Error(`tree fetch failed ${response.status}: ${url}`);
        error.status = response.status;
        error.url = url;
        throw error;
    }
    if (!Array.isArray(value.tree) || value.truncated === true) throw new Error(`tree response invalid or truncated: ${treeRef}`);
    return { url, value, bytes };
}

function treeResponseEvidence(file, url, bytes, root = repositoryRoot) {
    return {
        path: relative(file, root),
        url,
        rawArtifactBytes: bytes.length,
        rawArtifactSha256: sha256(bytes),
        gitBlob: gitBlobSha(bytes)
    };
}

function writeTreeResponse(revision, recordKind, stage, response, root = repositoryRoot) {
    const file = treeResponseFile(revision, recordKind, stage, root);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, response.bytes);
    return treeResponseEvidence(file, response.url, response.bytes, root);
}

function normalizedTreeEntries(value) {
    return (value?.tree || []).map((entry) => ({
        path: entry.path,
        type: entry.type,
        mode: entry.mode,
        sha: entry.sha,
        size: entry.size === undefined ? null : entry.size,
        url: entry.url || null
    })).sort((a, b) => a.path.localeCompare(b.path));
}

function assertTreeResponseArtifact(rawResponse, expectedUrl, expectedRef, expectedStage, revision, recordKind, root = repositoryRoot) {
    const reasons = [];
    const expectedFile = treeResponseFile(revision.revision, recordKind, expectedStage, root);
    const expectedPath = relative(expectedFile, root);
    if (!rawResponse || rawResponse.path !== expectedPath || rawResponse.url !== expectedUrl) reasons.push("rawResponsePathBindingInvalid");
    if (!rawResponse || !fs.existsSync(expectedFile)) return [...reasons, "rawResponseMissing"];
    const bytes = readBytes(expectedFile);
    if (rawResponse.rawArtifactBytes !== bytes.length || rawResponse.rawArtifactSha256 !== sha256(bytes) || rawResponse.gitBlob !== gitBlobSha(bytes)) reasons.push("rawResponseDigestMismatch");
    let value;
    try { value = JSON.parse(bytes.toString("utf8")); } catch (error) { reasons.push(`rawResponseJsonInvalid:${error.message}`); return reasons; }
    if (value.sha !== expectedRef || value.truncated === true || !Array.isArray(value.tree)) reasons.push("rawResponseRevisionBindingInvalid");
    return { reasons, value };
}

/** Resolve src/data/<language>/<recordKind> without a recursive tree result. */
async function resolveTreeDirectory(revision, language, recordKind, root = repositoryRoot) {
    let treeRef = revision;
    const segments = ["src", "data", language, recordKind];
    const steps = [];
    for (const segment of segments) {
        const response = await fetchTree(treeRef);
        const rawResponse = writeTreeResponse(revision, recordKind, `step-${steps.length}`, response, root);
        const entry = response.value.tree.find((item) => item.path === segment && item.type === "tree");
        if (!entry) throw new Error(`tree segment missing ${revision}/${language}/${recordKind}: ${segment}`);
        steps.push({
            requestedRef: treeRef,
            responseUrl: response.url,
            responseSha: response.value.sha,
            responseTruncated: Boolean(response.value.truncated),
            rawResponse,
            segment,
            treeSha: entry.sha,
            entryType: entry.type
        });
        treeRef = entry.sha;
    }
    const response = await fetchTree(treeRef);
    const rawResponse = writeTreeResponse(revision, recordKind, "final", response, root);
    const entries = normalizedTreeEntries(response.value);
    const selected = entries.find((entry) => entry.type === "blob" && entry.path === `${entity.providerSlug}.json`) || null;
    return {
        language,
        recordKind,
        providerPath: providerPath(revision, language, recordKind),
        method: "gitTreeApiNonRecursive",
        recursive: false,
        requestedRevision: revision,
        pathSegments: segments,
        finalTreeSha: response.value.sha,
        finalTreeUrl: response.url,
        finalTreeTruncated: Boolean(response.value.truncated),
        finalResponse: rawResponse,
        steps,
        entries,
        selectedEntry: selected
    };
}

async function resolveLocalizedTrees(revision, root = repositoryRoot) {
    const trees = {};
    for (const recordKind of recordKinds) trees[recordKind] = await resolveTreeDirectory(revision.revision, "Japanese", recordKind, root);
    return {
        method: "gitTreeApiNonRecursive",
        recursive: false,
        repository,
        revision: revision.revision,
        language: "Japanese",
        recordKinds,
        trees
    };
}

function assertExpectedPackage(revision, bytes) {
    if (bytes.length !== revision.packageBytes) throw new Error(`${revision.gameVersion} package bytes mismatch`);
    if (sha256(bytes) !== revision.packageDigest) throw new Error(`${revision.gameVersion} package SHA-256 mismatch`);
    if (gitBlobSha(bytes) !== revision.packageBlob) throw new Error(`${revision.gameVersion} package Git blob mismatch`);
    let manifest;
    try { manifest = JSON.parse(bytes.toString("utf8")); } catch (error) { throw new Error(`${revision.gameVersion} package JSON invalid: ${error.message}`); }
    if (manifest.name !== "genshin-db" || manifest.version !== revision.packageVersion) throw new Error(`${revision.gameVersion} package version mismatch`);
    if (!String(manifest.description || "").includes(`Genshin Impact v${revision.gameVersion} JSON data`)) throw new Error(`${revision.gameVersion} strict game-version text missing`);
    return manifest;
}

function parseLocalizedRecord(bytes, revision, recordKind) {
    let value;
    try { value = JSON.parse(bytes.toString("utf8")); } catch (error) { throw new Error(`${revision.gameVersion}/${recordKind} localized JSON invalid: ${error.message}`); }
    if (!Number.isInteger(value?.id) || value.id !== entity.providerId) throw new Error(`${revision.gameVersion}/${recordKind} localized id mismatch: expected ${entity.providerId}, got ${value?.id}`);
    if (value.name !== entity.nameJa) throw new Error(`${revision.gameVersion}/${recordKind} localized name mismatch: expected ${entity.nameJa}, got ${value?.name}`);
    return value;
}

function parseEnglishRecord(file, revision, recordKind) {
    const bytes = readBytes(file);
    let value;
    try { value = JSON.parse(bytes.toString("utf8")); } catch (error) { throw new Error(`${revision.gameVersion}/${recordKind} English JSON invalid: ${error.message}`); }
    if (!Number.isInteger(value?.id) || value.id !== entity.providerId) throw new Error(`${revision.gameVersion}/${recordKind} English id mismatch: expected ${entity.providerId}, got ${value?.id}`);
    if (value.name !== entity.providerEnglishName) throw new Error(`${revision.gameVersion}/${recordKind} English name mismatch: expected ${entity.providerEnglishName}, got ${value?.name}`);
    return { value, bytes };
}

function localIdentityEvidence(root = repositoryRoot) {
    const catalog = readJson(localFile("catalog", root));
    const talents = readJson(localFile("talents", root));
    const constellations = readJson(localFile("constellations", root));
    const catalogRecord = catalog[entity.entityId];
    const talentRecord = talents[entity.entityId];
    const constellationRecord = constellations[entity.entityId];
    if (!catalogRecord || catalogRecord.nameJa !== entity.nameJa) throw new Error(`local catalog identity mismatch: expected ${entity.nameJa}`);
    if (!talentRecord || !constellationRecord) throw new Error(`local source text missing: ${entity.entityId}`);
    const mapperBytes = readBytes(localFile("consumerMapper", root));
    const mapperText = mapperBytes.toString("utf8");
    const mapperObservedNames = [...mapperText.matchAll(new RegExp(`\\"${entity.entityId}\\"\\s*:\\s*\\"([^\\"]*)\\"`, "g"))].map((match) => match[1]);
    return {
        authority: "data-v2-manifest:characters-catalog-and-source-text",
        identityEvidence: "catalogExplicitNameAndEntityIdCoverageOnly",
        noProseIdentityInference: true,
        paths: localIdentityPaths,
        fileDigests: Object.fromEntries(Object.keys(localIdentityPaths).map((key) => [key, fileDigest(localFile(key, root), root)])),
        entity: {
            entityId: entity.entityId,
            catalogNameJa: catalogRecord.nameJa,
            catalogRecordDigest: digestStable(catalogRecord),
            talentEntityIdPresent: true,
            constellationEntityIdPresent: true,
            talentSourceDigest: digestStable(talentRecord),
            constellationSourceDigest: digestStable(constellationRecord),
            talentDirectNameValues: [],
            constellationDirectNameValues: []
        },
        consumerMapper: {
            path: localIdentityPaths.consumerMapper,
            observedNames: [...new Set(mapperObservedNames)],
            coverage: mapperObservedNames.length ? "observed" : "missing",
            usedForBridge: false
        },
        status: "localCatalogNameAndSourceCoverageVerified"
    };
}

function englishLinkage(revision, root = repositoryRoot) {
    const snapshotFile = path.join(root, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0", "behavior-shard-15-snapshot.json");
    const snapshot = fs.existsSync(snapshotFile) ? readJson(snapshotFile) : null;
    const entries = recordKinds.map((recordKind) => {
        const file = path.join(root, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0", "sources", englishSourceNamespace, revision.revision, "English", recordKind, `${entity.providerSlug}.json`);
        if (!fs.existsSync(file)) throw new Error(`existing English linkage missing: ${relative(file, root)}`);
        const { value, bytes } = parseEnglishRecord(file, revision, recordKind);
        const snapshotEntity = snapshot?.claim?.resolvedEntities?.find((candidate) => candidate.entityId === entity.entityId);
        const snapshotRecord = snapshotEntity?.records?.find((candidate) => candidate.recordKind === recordKind)?.[revision.gameVersion === "6.7" ? "before" : "after"];
        if (snapshotRecord && (snapshotRecord.path !== relative(file, root) || snapshotRecord.embeddedId !== entity.providerId || snapshotRecord.embeddedName !== entity.providerEnglishName || snapshotRecord.rawArtifactSha256 !== sha256(bytes) || snapshotRecord.gitBlob !== gitBlobSha(bytes))) {
            throw new Error(`English linkage snapshot mismatch: ${revision.gameVersion}/${recordKind}`);
        }
        return {
            recordKind,
            language: "English",
            providerPath: providerPath(revision.revision, "English", recordKind),
            localPath: relative(file, root),
            sourceEvidenceRef: relative(snapshotFile, root),
            rawArtifactBytes: bytes.length,
            rawArtifactSha256: sha256(bytes),
            gitBlob: gitBlobSha(bytes),
            embeddedIdPath: "$.id",
            embeddedId: value.id,
            embeddedName: value.name,
            explicitEnglishNameMatch: value.name === entity.providerEnglishName
        };
    });
    return {
        sourceNamespace: englishSourceNamespace,
        snapshotPath: relative(snapshotFile, root),
        snapshotFieldDigest: snapshot?.fieldDigest || null,
        records: entries
    };
}

function negativeAliasEvidence(root = repositoryRoot) {
    const snapshotFile = path.join(root, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0", "behavior-shard-14-snapshot.json");
    if (!fs.existsSync(snapshotFile)) throw new Error(`negative alias snapshot missing: ${relative(snapshotFile, root)}`);
    const snapshot = readJson(snapshotFile);
    const unresolved = (snapshot.claim?.unresolvedEntities || []).find((candidate) => candidate.entityId === entity.entityId);
    if (!unresolved || unresolved.resolutionStatus !== "unresolvedProviderRecord" || unresolved.nameJa !== entity.nameJa || JSON.stringify(unresolved.candidateSlugs) !== JSON.stringify(["yafoda"])) {
        throw new Error("negative yafoda evidence is missing or malformed");
    }
    const records = unresolved.providerEvidence.map((evidence) => {
        const file = path.resolve(root, evidence.path);
        if (!fs.existsSync(file)) throw new Error(`negative alias raw evidence missing: ${relative(file, root)}`);
        const bytes = readBytes(file);
        if (bytes.toString("utf8") !== "404: Not Found") throw new Error(`negative alias evidence content changed: ${relative(file, root)}`);
        if (evidence.httpStatus !== 404 || evidence.status !== "notFound" || evidence.rawArtifactBytes !== bytes.length || evidence.rawArtifactSha256 !== sha256(bytes) || evidence.gitBlob !== gitBlobSha(bytes)) {
            throw new Error(`negative alias evidence digest/status mismatch: ${relative(file, root)}`);
        }
        return {
            gameVersion: evidence.gameVersion,
            revision: evidence.revision,
            recordKind: evidence.recordKind,
            slug: evidence.slug,
            status: evidence.status,
            httpStatus: evidence.httpStatus,
            path: evidence.path,
            url: evidence.url,
            rawArtifactBytes: bytes.length,
            rawArtifactSha256: sha256(bytes),
            gitBlob: gitBlobSha(bytes)
        };
    });
    return {
        status: "preservedNegativeAliasEvidence",
        sourceSnapshotPath: relative(snapshotFile, root),
        sourceSnapshotFieldDigest: snapshot.fieldDigest,
        entityId: entity.entityId,
        nameJa: entity.nameJa,
        candidateSlug: "yafoda",
        records
    };
}

function assertTreeEntry(tree, revision, recordKind) {
    const selected = tree?.trees?.[recordKind]?.selectedEntry;
    if (!selected) return null;
    if (selected.path !== `${entity.providerSlug}.json` || selected.type !== "blob" || !/^[a-f0-9]{40}$/.test(selected.sha) || !Number.isInteger(selected.size) || selected.size < 1) {
        throw new Error(`localized tree selected entry invalid: ${revision.gameVersion}/${recordKind}`);
    }
    return selected;
}

function localizedArtifact(revision, tree, recordKind, root = repositoryRoot) {
    const selected = assertTreeEntry(tree, revision, recordKind);
    if (!selected) return {
        recordKind,
        language: "Japanese",
        providerPath: providerPath(revision.revision, "Japanese", recordKind),
        status: "treeEntryMissing",
        artifact: null
    };
    const file = localProviderPath(revision.revision, "Japanese", recordKind, root);
    if (!fs.existsSync(file)) throw new Error(`localized raw artifact missing: ${relative(file, root)}`);
    const bytes = readBytes(file);
    const value = parseLocalizedRecord(bytes, revision, recordKind);
    const computedBlob = gitBlobSha(bytes);
    if (bytes.length !== selected.size || computedBlob !== selected.sha) throw new Error(`localized tree/raw binding mismatch: ${revision.gameVersion}/${recordKind}`);
    return {
        recordKind,
        language: "Japanese",
        providerPath: providerPath(revision.revision, "Japanese", recordKind),
        status: "captured",
        artifact: {
            gameVersion: revision.gameVersion,
            revision: revision.revision,
            packageVersion: revision.packageVersion,
            providerPath: providerPath(revision.revision, "Japanese", recordKind),
            path: relative(file, root),
            url: rawUrl(revision.revision, "Japanese", recordKind),
            treeBlobSha: selected.sha,
            treeBlobBytes: selected.size,
            gitBlob: computedBlob,
            rawArtifactBytes: bytes.length,
            rawArtifactSha256: sha256(bytes),
            embeddedIdPath: "$.id",
            embeddedId: value.id,
            embeddedName: value.name,
            explicitLocalizedNameMatch: value.name === entity.nameJa
        }
    };
}

function packageEvidence(revision, root = repositoryRoot) {
    const file = packageFile(revision, root);
    if (!fs.existsSync(file)) throw new Error(`provider package manifest missing: ${relative(file, root)}`);
    const bytes = readBytes(file);
    const manifest = assertExpectedPackage(revision, bytes);
    return {
        gameVersion: revision.gameVersion,
        revision: revision.revision,
        packageVersion: revision.packageVersion,
        path: relative(file, root),
        url: packageUrl(revision),
        gitBlob: gitBlobSha(bytes),
        rawArtifactBytes: bytes.length,
        rawArtifactSha256: sha256(bytes),
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        strictGameVersionText: `Genshin Impact v${revision.gameVersion} JSON data`
    };
}

function loadTreeEvidence(revision, root = repositoryRoot) {
    const file = treeEvidenceFile(revision, root);
    if (!fs.existsSync(file)) throw new Error(`localized tree evidence missing: ${relative(file, root)}`);
    const evidence = readJson(file);
    const expectedClaim = {
        method: evidence.method,
        recursive: evidence.recursive,
        repository: evidence.repository,
        revision: evidence.revision,
        language: evidence.language,
        recordKinds: evidence.recordKinds,
        trees: evidence.trees
    };
    if (evidence.method !== "gitTreeApiNonRecursive" || evidence.recursive !== false || evidence.repository !== repository || evidence.language !== "Japanese" || evidence.revision !== revision.revision || evidence.fieldDigestAlgorithm !== "sha256-stable-json-v1" || evidence.fieldDigest !== digestStable(expectedClaim)) throw new Error(`localized tree evidence invalid: ${revision.gameVersion}`);
    for (const recordKind of recordKinds) {
        const tree = evidence.trees?.[recordKind];
        if (!tree || tree.language !== "Japanese" || tree.recordKind !== recordKind || tree.method !== "gitTreeApiNonRecursive" || tree.recursive !== false || tree.requestedRevision !== revision.revision || tree.providerPath !== providerPath(revision.revision, "Japanese", recordKind) || !Array.isArray(tree.pathSegments) || digestStable(tree.pathSegments) !== digestStable(["src", "data", "Japanese", recordKind]) || !Array.isArray(tree.steps) || tree.steps.length !== 4 || !Array.isArray(tree.entries)) throw new Error(`localized tree evidence incomplete: ${revision.gameVersion}/${recordKind}`);
        let currentRef = revision.revision;
        for (let index = 0; index < tree.steps.length; index += 1) {
            const step = tree.steps[index];
            const segment = tree.pathSegments[index];
            if (!step || step.requestedRef !== currentRef || step.responseSha !== currentRef || step.responseTruncated !== false || step.segment !== segment || step.entryType !== "tree" || !/^[a-f0-9]{40}$/.test(step.treeSha)) throw new Error(`localized tree step chain invalid: ${revision.gameVersion}/${recordKind}/${index}`);
            const response = assertTreeResponseArtifact(step.rawResponse, `${apiBase}/git/trees/${currentRef}`, currentRef, `step-${index}`, revision, recordKind, root);
            if (Array.isArray(response) || response.reasons.length) throw new Error(`localized tree step raw response invalid: ${revision.gameVersion}/${recordKind}/${index}:${Array.isArray(response) ? response.join(",") : response.reasons.join(",")}`);
            const selectedSegment = response.value.tree.find((entry) => entry.path === segment && entry.type === "tree");
            if (!selectedSegment || selectedSegment.sha !== step.treeSha) throw new Error(`localized tree step response mismatch: ${revision.gameVersion}/${recordKind}/${index}`);
            currentRef = step.treeSha;
        }
        if (tree.finalTreeSha !== currentRef || tree.finalTreeUrl !== `${apiBase}/git/trees/${currentRef}` || tree.finalTreeTruncated !== false) throw new Error(`localized tree final binding invalid: ${revision.gameVersion}/${recordKind}`);
        const finalResponse = assertTreeResponseArtifact(tree.finalResponse, tree.finalTreeUrl, currentRef, "final", revision, recordKind, root);
        if (Array.isArray(finalResponse) || finalResponse.reasons.length) throw new Error(`localized tree final raw response invalid: ${revision.gameVersion}/${recordKind}:${Array.isArray(finalResponse) ? finalResponse.join(",") : finalResponse.reasons.join(",")}`);
        const responseEntries = normalizedTreeEntries(finalResponse.value);
        if (digestStable(responseEntries) !== digestStable(tree.entries) || gitTreeSha(tree.entries) !== tree.finalTreeSha) throw new Error(`localized tree entries/sha mismatch: ${revision.gameVersion}/${recordKind}`);
        if (new Set(tree.entries.map((entry) => entry.path)).size !== tree.entries.length || tree.entries.some((entry) => !entry || !/^[a-zA-Z0-9._-]+$/.test(entry.path) || !/^[a-f0-9]{40}$/.test(entry.sha) || !["blob", "tree"].includes(entry.type) || typeof entry.mode !== "string" || (entry.type === "blob" && (!Number.isInteger(entry.size) || entry.size < 1)))) throw new Error(`localized tree entry shape invalid: ${revision.gameVersion}/${recordKind}`);
        const selected = assertTreeEntry(evidence, revision, recordKind);
        const responseSelected = tree.entries.find((entry) => entry.path === `${entity.providerSlug}.json` && entry.type === "blob") || null;
        if ((selected && !responseSelected) || (!selected && responseSelected) || (selected && digestStable(selected) !== digestStable(responseSelected))) throw new Error(`localized tree selection invalid: ${revision.gameVersion}/${recordKind}`);
    }
    return evidence;
}

function buildRevisionClaim(revision, root = repositoryRoot) {
    const tree = loadTreeEvidence(revision, root);
    const localizedRecords = recordKinds.map((recordKind) => localizedArtifact(revision, tree, recordKind, root));
    const english = englishLinkage(revision, root);
    return {
        gameVersion: revision.gameVersion,
        revision: revision.revision,
        packageVersion: revision.packageVersion,
        versionBinding: {
            status: "strictlyBound",
            package: packageEvidence(revision, root)
        },
        treeResolution: tree,
        localizedRecords,
        englishLinkage: english
    };
}

function buildSnapshot(root = repositoryRoot) {
    const local = localIdentityEvidence(root);
    const before = buildRevisionClaim(revisions.before, root);
    const after = buildRevisionClaim(revisions.after, root);
    const localizedRecords = [...before.localizedRecords, ...after.localizedRecords];
    const captured = localizedRecords.filter((record) => record.status === "captured");
    const missing = localizedRecords.filter((record) => record.status !== "captured");
    const bridgeProven = captured.length === recordKinds.length * 2
        && captured.every((record) => record.artifact.embeddedId === entity.providerId && record.artifact.embeddedName === entity.nameJa)
        && [...before.englishLinkage.records, ...after.englishLinkage.records].every((record) => record.embeddedId === entity.providerId && record.embeddedName === entity.providerEnglishName);
    const comparisons = recordKinds.map((recordKind) => {
        const beforeRecord = before.localizedRecords.find((record) => record.recordKind === recordKind);
        const afterRecord = after.localizedRecords.find((record) => record.recordKind === recordKind);
        if (!beforeRecord || !afterRecord || beforeRecord.status !== "captured" || afterRecord.status !== "captured") return { recordKind, status: "notComparable", changedFieldCount: null, fieldDiffs: [] };
        const beforeValue = readJson(path.resolve(root, beforeRecord.artifact.path));
        const afterValue = readJson(path.resolve(root, afterRecord.artifact.path));
        const diffs = fieldDiffs(beforeValue, afterValue);
        return {
            recordKind,
            status: diffs.length ? "rawRecordChanged" : "rawRecordMatch",
            changedFieldCount: diffs.length,
            fieldDiffs: diffs,
            beforeFieldDigest: fieldDigest(beforeValue),
            afterFieldDigest: fieldDigest(afterValue),
            beforeRawArtifactSha256: beforeRecord.artifact.rawArtifactSha256,
            afterRawArtifactSha256: afterRecord.artifact.rawArtifactSha256
        };
    });
    const claim = {
        transitionId: "genshin:6.7->7.0",
        dataset: "characterIdentity",
        entity: {
            entityId: entity.entityId,
            localNameJa: entity.nameJa,
            providerSlug: entity.providerSlug,
            providerId: entity.providerId,
            providerEnglishName: entity.providerEnglishName
        },
        provider: "genshin-db",
        sourceFamily: "GenshinData-derived",
        repository,
        sourceNamespace,
        localIdentity: local,
        revisions: { before, after },
        comparisons,
        negativeAliasEvidence: negativeAliasEvidence(root),
        identityBridge: {
            status: bridgeProven ? "explicitLocalizedNameBridge" : "providerLocalizedPathMissing",
            bindingRule: "same pinned revision: Japanese $.id=12401 and $.name=ヤフォダ, English $.id=12401 and $.name=Jahoda",
            evidenceBasis: "providerOwnedLocalizedRecordAndEnglishRecordSameExplicitId",
            noTransliterationInference: true,
            noIdArithmeticInference: true,
            localizedRecordCount: captured.length,
            missingLocalizedRecordCount: missing.length,
            canUseForIdentityReconciliation: bridgeProven
        },
        disposition: {
            status: bridgeProven ? "identityBridgeCapturedButCanonicalStillFailClosed" : "identityBridgeUnproven",
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false,
            reasons: ["singleProviderFamily", "behaviorSemanticsNotParsed", "independentProviderPairMissing"]
        }
    };
    return {
        schemaVersion: 1,
        kind: "genshinVersionTransitionLocalizedIdentityBridge",
        generatedAt,
        status: bridgeProven ? "identityBridgeProven" : "identityBridgeUnproven",
        claim,
        summary: {
            entityId: entity.entityId,
            localNameJa: entity.nameJa,
            providerSlug: entity.providerSlug,
            providerId: entity.providerId,
            revisions: 2,
            localizedRecordCount: captured.length,
            expectedLocalizedRecordCount: recordKinds.length * 2,
            missingLocalizedRecordCount: missing.length,
            englishLinkageRecordCount: before.englishLinkage.records.length + after.englishLinkage.records.length,
            negativeAliasEvidenceCount: claim.negativeAliasEvidence.records.length,
            identityBridgeProven: bridgeProven,
            certificateEligibleClaims: 0,
            canonicalPromotionCount: 0
        },
        gateEligibility: {
            status: "identityBridgeOnlyFailClosed",
            sourceFamilyCount: 1,
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false,
            reasons: claim.disposition.reasons
        },
        fieldDigestAlgorithm: "sha256-stable-json-v1",
        fieldDigest: digestStable(claim)
    };
}

function buildCheckpoint(snapshot = null, progress = null) {
    const snapshotValue = snapshot || (fs.existsSync(outputPath) ? readJson(outputPath) : null);
    const claim = {
        transitionId: "genshin:6.7->7.0",
        entityId: entity.entityId,
        localNameJa: entity.nameJa,
        provider: "genshin-db",
        sourceFamily: "GenshinData-derived",
        sourceNamespace,
        revisions: Object.fromEntries(Object.values(revisions).map((revision) => [revision.gameVersion, {
            revision: revision.revision,
            status: progress?.revisions?.[revision.gameVersion === "6.7" ? "before" : "after"]?.status || "complete",
            localizedRecordCount: snapshotValue?.claim?.revisions?.[revision.gameVersion === "6.7" ? "before" : "after"]?.localizedRecords?.filter((record) => record.status === "captured").length ?? 0,
            expectedLocalizedRecordCount: recordKinds.length
        }])),
        materializedArtifact: snapshotValue ? {
            path: relative(outputPath),
            fieldDigest: snapshotValue.fieldDigest,
            status: snapshotValue.status
        } : null,
        identityBridgeStatus: snapshotValue?.claim?.identityBridge?.status || "capturePending",
        canIssueEligibilityCertificate: false,
        canPromoteCanonical: false,
        blocker: progress?.blocker || null,
        nextTask: snapshotValue?.claim?.identityBridge?.status === "explicitLocalizedNameBridge"
            ? "Integrate this identity bridge into candidate×claim reconciliation; keep provider independence, semantic, certificate, and canonical gates fail closed."
            : "Resolve exact provider localized path/record and rerun this bounded capture; do not infer translation or promote canonical."
    };
    const checkpoint = {
        schemaVersion: 1,
        kind: "genshinVersionTransitionLocalizedIdentityBridgeCaptureCheckpoint",
        generatedAt,
        transitionId: "genshin:6.7->7.0",
        entityId: entity.entityId,
        localNameJa: entity.nameJa,
        provider: "genshin-db",
        sourceNamespace,
        status: progress?.status || (snapshotValue?.status === "identityBridgeProven" ? "complete" : "identityBridgeUnproven"),
        revisions: progress?.revisions || Object.fromEntries(Object.values(revisions).map((revision) => [revision.gameVersion === "6.7" ? "before" : "after", {
            gameVersion: revision.gameVersion,
            revision: revision.revision,
            status: "complete",
            completedRecordKinds: recordKinds
        }])),
        materializedArtifact: claim.materializedArtifact,
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
    return checkpoint;
}

function writeCheckpoint(checkpoint) {
    fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
    fs.writeFileSync(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
    return checkpoint;
}

function writeTreeEvidence(revision, evidence) {
    const file = treeEvidenceFile(revision);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const claim = { method: evidence.method, recursive: evidence.recursive, repository: evidence.repository, revision: evidence.revision, language: evidence.language, recordKinds: evidence.recordKinds, trees: evidence.trees };
    fs.writeFileSync(file, `${JSON.stringify({ ...claim, fieldDigestAlgorithm: "sha256-stable-json-v1", fieldDigest: digestStable(claim) }, null, 2)}\n`, "utf8");
}

async function acquire({ fetchRecords = true } = {}) {
    fs.mkdirSync(providerRoot, { recursive: true });
    const progress = {
        status: "inProgress",
        revisions: Object.fromEntries(Object.entries(revisions).map(([side, revision]) => [side, {
            gameVersion: revision.gameVersion,
            revision: revision.revision,
            status: "pending",
            completedRecordKinds: []
        }]))
    };
    try {
        for (const [side, revision] of Object.entries(revisions)) {
            progress.revisions[side].status = "treeResolution";
            const tree = await resolveLocalizedTrees(revision);
            writeTreeEvidence(revision, tree);
            progress.revisions[side].status = "manifest";
            const manifestBytes = await fetchBytes(packageUrl(revision));
            assertExpectedPackage(revision, manifestBytes);
            fs.mkdirSync(path.dirname(packageFile(revision)), { recursive: true });
            fs.writeFileSync(packageFile(revision), manifestBytes);
            progress.revisions[side].status = "records";
            for (const recordKind of recordKinds) {
                const selected = tree.trees[recordKind].selectedEntry;
                if (!selected || !fetchRecords) continue;
                const bytes = await fetchBytes(rawUrl(revision.revision, "Japanese", recordKind));
                const value = parseLocalizedRecord(bytes, revision, recordKind);
                if (bytes.length !== selected.size || gitBlobSha(bytes) !== selected.sha) throw new Error(`localized tree/raw binding mismatch: ${revision.gameVersion}/${recordKind}`);
                const file = localProviderPath(revision.revision, "Japanese", recordKind);
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file, bytes);
                void value;
                progress.revisions[side].completedRecordKinds.push(recordKind);
            }
            progress.revisions[side].status = "complete";
            writeCheckpoint(buildCheckpoint(null, progress));
        }
        progress.status = "captured";
        writeCheckpoint(buildCheckpoint(null, progress));
        return progress;
    } catch (error) {
        progress.status = error.status === 403 || /rate limit|API rate/i.test(String(error.message)) ? "blockedByProviderEvidence" : "captureError";
        progress.blocker = { kind: progress.status === "blockedByProviderEvidence" ? "providerTreeUnavailable" : "providerCaptureError", message: String(error.message), status: error.status || null, url: error.url || null };
        progress.nextTask = "Resume this bounded localized identity capture from the first incomplete revision/record; no transliteration inference, certificate, or canonical promotion.";
        writeCheckpoint(buildCheckpoint(null, progress));
        throw error;
    }
}

function writeSnapshot() {
    const snapshot = buildSnapshot();
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    writeCheckpoint(buildCheckpoint(snapshot, { status: "complete", revisions: Object.fromEntries(Object.entries(revisions).map(([side, revision]) => [side, { gameVersion: revision.gameVersion, revision: revision.revision, status: "complete", completedRecordKinds: recordKinds }])) }));
    return snapshot;
}

function validateSnapshot(snapshot, { repositoryRoot: root = repositoryRoot } = {}) {
    const reasons = [];
    if (snapshot?.schemaVersion !== 1 || snapshot?.kind !== "genshinVersionTransitionLocalizedIdentityBridge") reasons.push("identityInvalid");
    if (snapshot?.generatedAt !== generatedAt) reasons.push("generatedAtInvalid");
    if (snapshot?.fieldDigestAlgorithm !== "sha256-stable-json-v1" || snapshot?.fieldDigest !== digestStable(snapshot?.claim)) reasons.push("fieldDigestInvalid");
    const claim = snapshot?.claim;
    if (claim?.transitionId !== "genshin:6.7->7.0" || claim?.dataset !== "characterIdentity" || claim?.provider !== "genshin-db" || claim?.sourceFamily !== "GenshinData-derived" || claim?.repository !== repository || claim?.sourceNamespace !== sourceNamespace) reasons.push("providerBindingInvalid");
    if (claim?.entity?.entityId !== entity.entityId || claim?.entity?.localNameJa !== entity.nameJa || claim?.entity?.providerSlug !== entity.providerSlug || claim?.entity?.providerId !== entity.providerId || claim?.entity?.providerEnglishName !== entity.providerEnglishName) reasons.push("entityBindingInvalid");
    if (!hasExactRecordKinds(claim?.comparisons)) reasons.push("comparisonRecordSetInvalid");
    try {
        const local = localIdentityEvidence(root);
        if (digestStable(claim?.localIdentity) !== digestStable(local)) reasons.push("localIdentityEvidenceInvalid");
    } catch (error) { reasons.push(`localIdentityEvidenceInvalid:${error.message}`); }
    for (const [side, revision] of Object.entries(revisions)) {
        const revisionClaim = claim?.revisions?.[side];
        if (!revisionClaim || revisionClaim.gameVersion !== revision.gameVersion || revisionClaim.revision !== revision.revision || revisionClaim.packageVersion !== revision.packageVersion || revisionClaim.versionBinding?.status !== "strictlyBound") {
            reasons.push(`revisionBindingInvalid:${side}`);
            continue;
        }
        if (!hasExactRecordKinds(revisionClaim.localizedRecords)) reasons.push(`localizedRecordSetInvalid:${side}`);
        try {
            validatePackageEvidence(revisionClaim.versionBinding.package, revision, root, reasons);
            const tree = loadTreeEvidence(revision, root);
            if (digestStable(revisionClaim.treeResolution) !== digestStable(tree)) reasons.push(`treeEvidenceInvalid:${side}`);
            for (const recordKind of recordKinds) {
                const record = revisionClaim.localizedRecords?.find((candidate) => candidate.recordKind === recordKind);
                if (!record) { reasons.push(`localizedRecordMissing:${side}:${recordKind}`); continue; }
                const selected = assertTreeEntry(tree, revision, recordKind);
                if (!selected) {
                    if (record.status !== "treeEntryMissing" || record.artifact !== null) reasons.push(`localizedMissingDispositionInvalid:${side}:${recordKind}`);
                    continue;
                }
                if (record.status !== "captured") { reasons.push(`localizedRecordStatusInvalid:${side}:${recordKind}`); continue; }
                reasons.push(...validateLocalizedArtifact(record.artifact, revision, selected, recordKind, root).map((reason) => `${side}:${recordKind}:${reason}`));
            }
            validateEnglishLinkage(revisionClaim.englishLinkage, revision, root, reasons);
        } catch (error) { reasons.push(`revisionEvidenceInvalid:${side}:${error.message}`); }
    }
    try { validateNegativeAliasEvidence(claim?.negativeAliasEvidence, root, reasons); } catch (error) { reasons.push(`negativeAliasEvidenceInvalid:${error.message}`); }
    const sides = ["before", "after"];
    const localizedBySide = Object.fromEntries(sides.map((side) => [side, claim?.revisions?.[side]?.localizedRecords]));
    const englishBySide = Object.fromEntries(sides.map((side) => [side, claim?.revisions?.[side]?.englishLinkage?.records]));
    const localizedRecordSetsValid = sides.every((side) => hasExactRecordKinds(localizedBySide[side]));
    const englishRecordSetsValid = sides.every((side) => hasExactRecordKinds(englishBySide[side]));
    const localizedRecords = sides.flatMap((side) => Array.isArray(localizedBySide[side]) ? localizedBySide[side] : []);
    const englishRecords = sides.flatMap((side) => Array.isArray(englishBySide[side]) ? englishBySide[side] : []);
    const capturedRecords = localizedRecords.filter((record) => record?.status === "captured");
    const capturedCount = capturedRecords.length;
    const expectedCount = recordKinds.length * sides.length;
    const missingCount = localizedRecords.length - capturedCount;
    const localizedIdentityValid = localizedRecordSetsValid
        && localizedRecords.length === expectedCount
        && capturedCount === expectedCount
        && capturedRecords.every((record) => record.artifact?.embeddedId === entity.providerId && record.artifact?.embeddedName === entity.nameJa && record.artifact?.explicitLocalizedNameMatch === true);
    const englishIdentityValid = englishRecordSetsValid
        && englishRecords.length === expectedCount
        && englishRecords.every((record) => record.embeddedId === entity.providerId && record.embeddedName === entity.providerEnglishName && record.explicitEnglishNameMatch === true);
    const bridgeProven = localizedIdentityValid && englishIdentityValid;
    const expectedBridgeStatus = bridgeProven ? "explicitLocalizedNameBridge" : "providerLocalizedPathMissing";
    const expectedSnapshotStatus = bridgeProven ? "identityBridgeProven" : "identityBridgeUnproven";
    if (claim?.identityBridge?.status !== expectedBridgeStatus || claim?.identityBridge?.localizedRecordCount !== capturedCount || claim?.identityBridge?.missingLocalizedRecordCount !== missingCount || claim?.identityBridge?.canUseForIdentityReconciliation !== bridgeProven) reasons.push("identityBridgeCountsInvalid");
    if (snapshot?.status !== expectedSnapshotStatus) reasons.push("snapshotStatusInvalid");
    const summary = snapshot?.summary;
    if (summary?.entityId !== entity.entityId || summary?.localNameJa !== entity.nameJa || summary?.providerSlug !== entity.providerSlug || summary?.providerId !== entity.providerId || summary?.revisions !== sides.length || summary?.localizedRecordCount !== capturedCount || summary?.expectedLocalizedRecordCount !== expectedCount || summary?.missingLocalizedRecordCount !== missingCount || summary?.englishLinkageRecordCount !== englishRecords.length || summary?.negativeAliasEvidenceCount !== (claim?.negativeAliasEvidence?.records?.length || 0) || summary?.identityBridgeProven !== bridgeProven) reasons.push("summaryCountsInvalid");
    if (claim?.identityBridge?.noTransliterationInference !== true || claim?.identityBridge?.noIdArithmeticInference !== true) reasons.push("identityInferencePolicyInvalid");
    if (claim?.disposition?.canIssueEligibilityCertificate !== false || claim?.disposition?.canPromoteCanonical !== false || snapshot?.gateEligibility?.canIssueEligibilityCertificate !== false || snapshot?.gateEligibility?.canPromoteCanonical !== false) reasons.push("failClosedDispositionInvalid");
    if (snapshot?.summary?.certificateEligibleClaims !== 0 || snapshot?.summary?.canonicalPromotionCount !== 0) reasons.push("promotionSummaryInvalid");
    return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}

function validatePackageEvidence(binding, revision, root, reasons) {
    const file = binding?.path ? path.resolve(root, binding.path) : null;
    if (!file || !fs.existsSync(file)) { reasons.push(`packageMissing:${revision.gameVersion}`); return; }
    let bytes;
    try { bytes = readBytes(file); assertExpectedPackage(revision, bytes); } catch (error) { reasons.push(`packageInvalid:${revision.gameVersion}:${error.message}`); return; }
    if (binding.gameVersion !== revision.gameVersion || binding.revision !== revision.revision || binding.packageVersion !== revision.packageVersion || binding.gitBlob !== gitBlobSha(bytes) || binding.rawArtifactBytes !== bytes.length || binding.rawArtifactSha256 !== sha256(bytes) || binding.strictGameVersionText !== `Genshin Impact v${revision.gameVersion} JSON data`) reasons.push(`packageMetadataInvalid:${revision.gameVersion}`);
}

function validateLocalizedArtifact(artifact, revision, selected, recordKind, root) {
    const reasons = [];
    const file = artifact?.path ? path.resolve(root, artifact.path) : null;
    if (!file || !fs.existsSync(file)) return ["missing"];
    const bytes = readBytes(file);
    let value;
    try { value = parseLocalizedRecord(bytes, revision, recordKind); } catch (error) { reasons.push(`embeddedIdentityInvalid:${error.message}`); }
    if (artifact.gameVersion !== revision.gameVersion || artifact.revision !== revision.revision || artifact.packageVersion !== revision.packageVersion || artifact.providerPath !== providerPath(revision.revision, "Japanese", recordKind) || artifact.url !== rawUrl(revision.revision, "Japanese", recordKind)) reasons.push("versionOrPathBindingMismatch");
    if (artifact.treeBlobSha !== selected.sha || artifact.treeBlobBytes !== selected.size || artifact.gitBlob !== selected.sha || artifact.gitBlob !== gitBlobSha(bytes) || artifact.rawArtifactBytes !== bytes.length || artifact.rawArtifactSha256 !== sha256(bytes)) reasons.push("treeRawDigestMismatch");
    if (artifact.embeddedIdPath !== "$.id" || artifact.embeddedId !== entity.providerId || value?.id !== entity.providerId || artifact.embeddedName !== entity.nameJa || value?.name !== entity.nameJa || artifact.explicitLocalizedNameMatch !== true) reasons.push("localizedIdentityMismatch");
    return reasons;
}

function validateEnglishLinkage(linkage, revision, root, reasons) {
    if (!linkage || linkage.sourceNamespace !== englishSourceNamespace || linkage.snapshotPath !== relative(englishSnapshotPath, root)) { reasons.push(`englishLinkageBindingInvalid:${revision.gameVersion}`); return; }
    if (!hasExactRecordKinds(linkage.records)) reasons.push(`englishLinkageRecordSetInvalid:${revision.gameVersion}`);
    for (const recordKind of recordKinds) {
        const record = linkage.records?.find((candidate) => candidate.recordKind === recordKind);
        const file = path.join(root, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0", "sources", englishSourceNamespace, revision.revision, "English", recordKind, `${entity.providerSlug}.json`);
        if (!record || !fs.existsSync(file)) { reasons.push(`englishLinkageMissing:${revision.gameVersion}:${recordKind}`); continue; }
        try {
            const { value, bytes } = parseEnglishRecord(file, revision, recordKind);
            if (record.localPath !== path.relative(root, file).replaceAll("\\", "/") || record.sourceEvidenceRef !== relative(englishSnapshotPath, root) || record.providerPath !== providerPath(revision.revision, "English", recordKind) || record.rawArtifactBytes !== bytes.length || record.rawArtifactSha256 !== sha256(bytes) || record.gitBlob !== gitBlobSha(bytes) || record.embeddedIdPath !== "$.id" || record.embeddedId !== value.id || record.embeddedName !== value.name || record.explicitEnglishNameMatch !== true) reasons.push(`englishLinkageMismatch:${revision.gameVersion}:${recordKind}`);
        } catch (error) { reasons.push(`englishLinkageInvalid:${revision.gameVersion}:${recordKind}:${error.message}`); }
    }
}

function validateNegativeAliasEvidence(evidence, root, reasons) {
    if (!evidence || evidence.status !== "preservedNegativeAliasEvidence" || evidence.sourceSnapshotPath !== relative(negativeAliasSnapshotPath, root) || evidence.entityId !== entity.entityId || evidence.nameJa !== entity.nameJa || evidence.candidateSlug !== "yafoda" || !Array.isArray(evidence.records) || evidence.records.length !== 4) { reasons.push("negativeAliasShapeInvalid"); return; }
    if (!hasExactNegativeAliasPairs(evidence.records)) reasons.push("negativeAliasRecordSetInvalid");
    for (const record of evidence.records) {
        const file = path.resolve(root, record.path);
        if (!fs.existsSync(file)) { reasons.push(`negativeAliasMissing:${record.path}`); continue; }
        const bytes = readBytes(file);
        if (record.status !== "notFound" || record.httpStatus !== 404 || bytes.toString("utf8") !== "404: Not Found" || record.rawArtifactBytes !== bytes.length || record.rawArtifactSha256 !== sha256(bytes) || record.gitBlob !== gitBlobSha(bytes)) reasons.push(`negativeAliasMismatch:${record.path}`);
    }
}

function validateCheckpoint(checkpoint, { repositoryRoot: root = repositoryRoot } = {}) {
    const reasons = [];
    if (checkpoint?.schemaVersion !== 1 || checkpoint?.kind !== "genshinVersionTransitionLocalizedIdentityBridgeCaptureCheckpoint") reasons.push("identityInvalid");
    if (checkpoint?.generatedAt !== generatedAt || checkpoint?.transitionId !== "genshin:6.7->7.0" || checkpoint?.entityId !== entity.entityId || checkpoint?.provider !== "genshin-db" || checkpoint?.sourceNamespace !== sourceNamespace) reasons.push("bindingInvalid");
    if (checkpoint?.fieldDigestAlgorithm !== "sha256-stable-json-v1" || checkpoint?.fieldDigest !== digestStable(checkpoint?.claim)) reasons.push("fieldDigestInvalid");
    if (checkpoint?.gateEligibility?.canIssueEligibilityCertificate !== false || checkpoint?.gateEligibility?.canPromoteCanonical !== false) reasons.push("failClosedDispositionInvalid");
    const materialized = checkpoint?.materializedArtifact?.path ? path.resolve(root, checkpoint.materializedArtifact.path) : null;
    if (!materialized || !fs.existsSync(materialized)) reasons.push("materializedArtifactMissing");
    else {
        try {
            const snapshot = readJson(materialized);
            if (checkpoint.materializedArtifact.fieldDigest !== snapshot.fieldDigest || !validateSnapshot(snapshot, { repositoryRoot: root }).valid) reasons.push("materializedArtifactInvalid");
        } catch (error) { reasons.push(`materializedArtifactInvalid:${error.message}`); }
    }
    for (const [side, revision] of Object.entries(revisions)) {
        const progress = checkpoint?.revisions?.[side];
        if (!progress || progress.gameVersion !== revision.gameVersion || progress.revision !== revision.revision || progress.status !== "complete" || digestStable(progress.completedRecordKinds) !== digestStable(recordKinds)) reasons.push(`revisionCheckpointInvalid:${side}`);
    }
    return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}

async function main() {
    if (process.argv.includes("--fetch")) await acquire({ fetchRecords: !process.argv.includes("--tree-only") });
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
    entity,
    generatedAt,
    localIdentityPaths,
    outputPath,
    providerRoot,
    recordKinds,
    revisions,
    schemaPath,
    checkpointSchemaPath,
    sourceNamespace,
    validateCheckpoint,
    validateSnapshot,
    writeSnapshot
};
