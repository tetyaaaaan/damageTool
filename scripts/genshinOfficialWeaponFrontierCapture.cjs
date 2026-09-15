"use strict";

/*
 * Bounded first-party capture for the three weapon entities which are still
 * source-missing in the v2 queue (11301-11303).  This lane deliberately
 * captures HoYoWiki's raw API responses only.  A current/mutable official
 * page is useful for identity and field-availability evidence, but it is not
 * an immutable 7.0 source revision and therefore cannot issue a certificate
 * or promote canonical data.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { digestStable, stableValue } = require("./genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const transitionRoot = path.join(dataRoot, "v2", "version-transitions", "6.7-to-7.0");
const sourceNamespace = "hoyowiki-official-weapon-frontier-11301-11303";
const providerRoot = path.join(transitionRoot, "sources", sourceNamespace);
const outputPath = path.join(transitionRoot, "official-weapon-frontier-11301-11303-snapshot.json");
const checkpointPath = path.join(transitionRoot, "official-weapon-frontier-11301-11303-capture-checkpoint.json");
const reportJsonPath = path.join(repositoryRoot, "reports", "genshin-official-weapon-frontier-11301-11303.json");
const reportMarkdownPath = path.join(repositoryRoot, "reports", "genshin-official-weapon-frontier-11301-11303.md");
const schemaPath = path.join(dataRoot, "schema", "version-transition-official-weapon-frontier-snapshot.schema.json");
const checkpointSchemaPath = path.join(dataRoot, "schema", "version-transition-official-weapon-frontier-capture-checkpoint.schema.json");
const queuePath = path.join(repositoryRoot, "reports", "genshin-evidence-task-queue.json");
const weaponsPath = path.join(dataRoot, "weapons.json");
const effectsPath = path.join(dataRoot, "weapon-effects.json");
const verificationPath = path.join(dataRoot, "v2", "weapons", "verification.json");
const existingWeaponSnapshotPath = path.join(transitionRoot, "weapon-entity-snapshot.json");
const existingWeaponRevision = "8b15995fa220c88a4d0d7ffe1e21b041d0b32588";
const existingWeaponPackagePath = path.join(transitionRoot, "sources", "genshin-db", existingWeaponRevision, "package.json");
const generatedAt = "2026-08-28T00:00:00.000Z";
const transitionId = "genshin:6.7->7.0";
const targetGameVersion = "7.0";
const officialApiBase = "https://sg-wiki-api.hoyolab.com/hoyowiki/wapi";
const aggregateUrl = `${officialApiBase}/get_entry_page_list`;
const directUrl = `${officialApiBase}/entry_page`;
const sourceFamily = "official-hoyoverse";
const providerId = "hoyoverse-hoyowiki";
const providerName = "HoYoverse HoYoWiki";
const lineage = "First-party HoYoverse/HoYoLAB publication.";

const entities = Object.freeze([
    {
        entityId: "11301",
        localNameJa: "冷刃",
        localEffectNameJa: "水と氷の破滅",
        officialName: "Cool Steel",
        entryPageId: "1938",
        aggregatePage: 8,
        passiveKey: "Bane of Water and Ice",
        candidateIds: ["w_11301_damage_1", "w_11301_damageBonus_91cc873a"],
        existingGenshinDbSlug: "coolsteel"
    },
    {
        entityId: "11302",
        localNameJa: "黎明の神剣",
        localEffectNameJa: "奮い立てる",
        officialName: "Harbinger of Dawn",
        entryPageId: "2052",
        aggregatePage: 5,
        passiveKey: "Vigorous",
        candidateIds: ["w_11302_crit_1"],
        existingGenshinDbSlug: "harbingerofdawn"
    },
    {
        entityId: "11303",
        localNameJa: "旅道の剣",
        localEffectNameJa: "旅路",
        officialName: "Traveler's Handy Sword",
        entryPageId: "1977",
        aggregatePage: 7,
        passiveKey: "Journey",
        candidateIds: [],
        existingGenshinDbSlug: "travelershandysword"
    }
]);
const expectedEntityIds = entities.map((entity) => entity.entityId);
const expectedCandidateIds = entities.flatMap((entity) => entity.candidateIds);
const requiredClaimFields = ["activation", "refinement", "targets", "value"];

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stableJson(value) { return `${JSON.stringify(stableValue(value), null, 2)}\n`; }
function sha256(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function gitBlobSha(bytes) { return crypto.createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`, "utf8"), bytes])).digest("hex"); }
function relative(file) { return path.relative(repositoryRoot, file).replaceAll("\\", "/"); }
function absolute(relativePath) { return path.resolve(repositoryRoot, relativePath); }
function fileDigest(file) {
    const bytes = fs.readFileSync(file);
    return { path: relative(file), bytes: bytes.length, sha256: sha256(bytes) };
}
function pointerToken(value) { return String(value).replaceAll("~", "~0").replaceAll("/", "~1"); }
function pointer(...parts) { return `/${parts.map(pointerToken).join("/")}`; }
function textFromHtml(value) {
    const values = Array.isArray(value) ? value : [value];
    if (!values.every((item) => typeof item === "string")) return null;
    return values.map((item) => item.replace(/<[^>]*>/g, "").replaceAll("&amp;", "&")).join("");
}

function sourceFile(revision, slug) {
    return path.join(transitionRoot, "sources", "genshin-db", revision, "English", "weapons", `${slug}.json`);
}

function validatedExistingGenshinDbAid(entity) {
    if (!fs.existsSync(existingWeaponSnapshotPath)) return null;
    const snapshot = readJson(existingWeaponSnapshotPath);
    if (snapshot.kind !== "genshinVersionTransitionWeaponEntitySnapshot"
        || snapshot.status !== "completeProviderSnapshot"
        || snapshot.fieldDigest !== digestStable(snapshot.claim)
        || snapshot.claim?.after?.gameVersion !== "7.0"
        || snapshot.claim?.after?.revision !== existingWeaponRevision
        || snapshot.claim?.after?.sourceFamily !== "GenshinData-derived"
        || snapshot.claim?.after?.versionBinding?.status !== "strictlyBound") {
        throw new Error(`existing pinned GenshinData snapshot invalid: ${relative(existingWeaponSnapshotPath)}`);
    }
    const record = snapshot.claim.after.records?.find((candidate) => candidate.entityId === entity.entityId && candidate.selectedSlug === entity.existingGenshinDbSlug);
    if (!record?.artifact?.path || !fs.existsSync(absolute(record.artifact.path))) return null;
    const rawFile = absolute(record.artifact.path);
    const rawBytes = fs.readFileSync(rawFile);
    const rawValue = JSON.parse(rawBytes.toString("utf8"));
    const actualSha = sha256(rawBytes);
    const actualBlob = gitBlobSha(rawBytes);
    if (record.artifact.gameVersion !== "7.0"
        || record.artifact.revision !== existingWeaponRevision
        || record.artifact.rawArtifactBytes !== rawBytes.length
        || record.artifact.rawArtifactDigest !== actualSha
        || record.artifact.blobSha !== actualBlob
        || String(rawValue.id) !== entity.entityId
        || rawValue.name !== entity.officialName) {
        throw new Error(`existing pinned GenshinData raw artifact mismatch: ${entity.entityId}`);
    }
    const packageBinding = snapshot.claim.after.versionBinding;
    if (packageBinding.evidenceArtifact !== relative(existingWeaponPackagePath) || !fs.existsSync(existingWeaponPackagePath)) throw new Error(`existing pinned GenshinData package binding missing: ${entity.entityId}`);
    const packageBytes = fs.readFileSync(existingWeaponPackagePath);
    const packageValue = JSON.parse(packageBytes.toString("utf8"));
    const packageSha = sha256(packageBytes);
    const packageBlob = gitBlobSha(packageBytes);
    if (packageBinding.evidenceBytes !== packageBytes.length
        || packageBinding.evidenceDigest !== packageSha
        || packageBinding.evidenceBlobSha !== packageBlob
        || packageBinding.gameVersion !== "7.0"
        || !String(packageValue.description || "").includes("Genshin Impact v7.0 JSON data")) {
        throw new Error(`existing pinned GenshinData package evidence mismatch: ${entity.entityId}`);
    }
    return {
        status: "reusedValidatedPinnedRevisionAid",
        sourceFamily: "GenshinData-derived",
        revision: existingWeaponRevision,
        gameVersion: "7.0",
        path: record.artifact.path,
        bytes: rawBytes.length,
        sha256: actualSha,
        gitBlobSha: actualBlob,
        embeddedId: String(rawValue.id),
        embeddedName: rawValue.name,
        snapshotPath: relative(existingWeaponSnapshotPath),
        snapshotFieldDigest: snapshot.fieldDigest,
        packageEvidence: {
            path: relative(existingWeaponPackagePath),
            bytes: packageBytes.length,
            sha256: packageSha,
            gitBlobSha: packageBlob,
            description: packageValue.description,
            status: "strictlyBound"
        }
    };
}

function localIdentity() {
    const catalog = readJson(weaponsPath);
    const effects = readJson(effectsPath);
    const verification = readJson(verificationPath);
    const records = entities.map((entity) => {
        const catalogRecord = catalog[entity.entityId];
        const effectRecord = effects[entity.entityId];
        if (!catalogRecord || catalogRecord.nameJa !== entity.localNameJa) throw new Error(`local catalog identity mismatch: ${entity.entityId}`);
        if (!effectRecord || effectRecord.effectNameJa !== entity.localEffectNameJa) throw new Error(`local effect identity mismatch: ${entity.entityId}`);
        const candidateRecords = entity.candidateIds.map((candidateId) => {
            const queueRecord = verification[candidateId];
            if (!queueRecord?.verification?.claims) throw new Error(`local verification candidate missing: ${candidateId}`);
            const fields = Object.keys(queueRecord.verification.claims).filter((field) => requiredClaimFields.includes(field)).sort();
            if (fields.join(",") !== requiredClaimFields.join(",")) throw new Error(`local required claim field set mismatch: ${candidateId}`);
            return {
                candidateId,
                requiredClaimFields,
                verificationStatus: queueRecord.verification.status || null,
                sourceAgreement: queueRecord.verification.sourceAgreement || null,
                legacyRuntimeStatus: queueRecord.runtime?.status || null,
                legacyCandidateDigest: digestStable(queueRecord)
            };
        });
        const existingProvider = validatedExistingGenshinDbAid(entity);
        return {
            entityId: entity.entityId,
            localNameJa: catalogRecord.nameJa,
            catalogRecordDigest: digestStable(catalogRecord),
            effectNameJa: effectRecord.effectNameJa,
            effectTextTemplate: effectRecord.effectTextTemplate,
            effectRecordDigest: digestStable(effectRecord),
            candidateRecords,
            existingGenshinDbProvider: existingProvider,
            identityStatus: existingProvider ? "localCatalogAndValidatedPinnedGenshinDbAid" : "localNumericIdNotBoundToOfficialEnglishName"
        };
    });
    return {
        authority: "repository-local weapons.json and weapon-effects.json",
        paths: { catalog: relative(weaponsPath), effects: relative(effectsPath), verification: relative(verificationPath) },
        fileDigests: { catalog: fileDigest(weaponsPath), effects: fileDigest(effectsPath), verification: fileDigest(verificationPath) },
        records,
        status: "localIdentityAndCandidateClaimsReadOnly"
    };
}

function queueInventory() {
    const queue = readJson(queuePath);
    const shardId = "weapons:weaponEffectSpec:sourceMissing:standard:01";
    // unlockClusters contain only still-open work and therefore shrink after
    // a valid evidence deferral.  Evidence identity must instead bind to the
    // full authoritative candidate ledger, where deferred candidates remain.
    const taskIds = new Set((queue.tasks || [])
        .filter((task) => task?.dataset === "weapons" && task?.layer === "weaponEffectSpec")
        .map((task) => String(task.candidateId)));
    const candidateIds = expectedCandidateIds.filter((candidateId) => taskIds.has(candidateId));
    if (candidateIds.join(",") !== expectedCandidateIds.join(",")) throw new Error(`authoritative queue candidate scope mismatch: ${candidateIds.join(",")}`);
    return {
        path: relative(queuePath),
        shardId,
        candidateIds,
        candidateIdsDigest: digestStable(candidateIds),
        candidateCount: candidateIds.length,
        // This capture was scoped against the fixed 100-candidate source
        // shard.  Keep that capture-scope cardinality stable even after work
        // disposition removes candidates from the open unlock cluster.
        expectedShardCandidateCount: 100,
        status: "authoritativeQueueReadOnly"
    };
}

function requests() {
    const aggregate = entities.map((entity) => ({
        requestId: `aggregate-page-${String(entity.aggregatePage).padStart(2, "0")}`,
        method: "POST",
        url: aggregateUrl,
        body: { filters: [], menu_id: "4", page_num: entity.aggregatePage, page_size: 30, use_es: true },
        rawPath: path.posix.join("aggregate", `page-${String(entity.aggregatePage).padStart(2, "0")}.json`),
        expected: { entryPageId: entity.entryPageId, name: entity.officialName, entityId: entity.entityId }
    }));
    const direct = entities.map((entity) => ({
        requestId: `entry-${entity.entryPageId}`,
        method: "GET",
        url: `${directUrl}?entry_page_id=${entity.entryPageId}&game_id=2`,
        body: null,
        rawPath: path.posix.join("entries", `${entity.entryPageId}.json`),
        expected: { entryPageId: entity.entryPageId, name: entity.officialName, entityId: entity.entityId }
    }));
    return [...aggregate, ...direct];
}

function requestHeaders(isAggregate) {
    return {
        "User-Agent": "damageTool-genshin-official-frontier-capture",
        "Referer": isAggregate ? "https://wiki.hoyolab.com/pc/genshin/aggregate/weapon" : "https://wiki.hoyolab.com/",
        "x-rpc-language": "en-us",
        ...(isAggregate ? { "x-rpc-wiki_app": "ys" } : {})
    };
}

async function fetchRequest(request) {
    const options = { method: request.method, headers: requestHeaders(request.method === "POST") };
    if (request.body) {
        options.body = JSON.stringify(request.body);
        options.headers["Content-Type"] = "application/json";
    }
    let response;
    try { response = await fetch(request.url, options); } catch (error) {
        const wrapped = new Error(`official provider access unavailable: ${request.method} ${request.url}: ${error.message}`);
        wrapped.url = request.url;
        wrapped.requestId = request.requestId;
        throw wrapped;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!response.ok) {
        const error = new Error(`official provider HTTP ${response.status}: ${request.method} ${request.url}`);
        error.url = request.url;
        error.requestId = request.requestId;
        error.statusCode = response.status;
        throw error;
    }
    try { JSON.parse(bytes.toString("utf8")); } catch (error) {
        const wrapped = new Error(`official provider returned invalid JSON: ${request.url}: ${error.message}`);
        wrapped.url = request.url;
        wrapped.requestId = request.requestId;
        throw wrapped;
    }
    return {
        requestId: request.requestId,
        method: request.method,
        url: request.url,
        body: clone(request.body),
        rawPath: request.rawPath,
        expected: clone(request.expected),
        statusCode: response.status,
        contentType: response.headers.get("content-type") || null,
        etag: response.headers.get("etag") || null,
        bytes: bytes.length,
        sha256: sha256(bytes),
        captured: bytes
    };
}

function manifestPath() { return path.join(providerRoot, "capture-manifest.json"); }

function manifestDigest(manifest) {
    const { capturedAt, fieldDigest, ...stable } = manifest;
    return digestStable(stable);
}

function writeManifest(captures) {
    const manifest = {
        schemaVersion: 1,
        kind: "genshinOfficialWeaponFrontierCaptureManifest",
        generatedAt,
        capturedAt: new Date().toISOString(),
        provider: providerName,
        providerId,
        sourceFamily,
        independenceGroup: sourceFamily,
        lineage,
        immutable: false,
        status: "complete",
        requests: captures.map((capture) => ({ ...capture, captured: undefined })).map((capture) => {
            delete capture.captured;
            return capture;
        }),
        fieldDigestAlgorithm: "sha256-stable-json-v1"
    };
    manifest.fieldDigest = manifestDigest(manifest);
    fs.writeFileSync(manifestPath(), stableJson(manifest), "utf8");
    return manifest;
}

function readManifest() {
    const file = manifestPath();
    if (!fs.existsSync(file)) throw new Error(`official capture manifest missing: ${relative(file)}`);
    const bytes = fs.readFileSync(file);
    const manifest = JSON.parse(bytes.toString("utf8"));
    if (manifest.kind !== "genshinOfficialWeaponFrontierCaptureManifest" || manifest.status !== "complete" || manifest.fieldDigest !== manifestDigest(manifest)) throw new Error("official capture manifest invalid or forged");
    const expectedRequests = requests();
    if (!Array.isArray(manifest.requests) || manifest.requests.length !== expectedRequests.length) throw new Error("official capture manifest request count invalid");
    for (const expected of expectedRequests) {
        const actual = manifest.requests.find((request) => request.requestId === expected.requestId);
        if (!actual || actual.url !== expected.url || actual.method !== expected.method || actual.rawPath !== expected.rawPath || digestStable(actual.body) !== digestStable(expected.body)) throw new Error(`official capture manifest request mismatch: ${expected.requestId}`);
        const rawFile = path.join(providerRoot, actual.rawPath);
        if (!fs.existsSync(rawFile)) throw new Error(`official raw artifact missing: ${actual.rawPath}`);
        const rawBytes = fs.readFileSync(rawFile);
        if (actual.bytes !== rawBytes.length || actual.sha256 !== sha256(rawBytes) || actual.statusCode !== 200) throw new Error(`official raw artifact digest mismatch: ${actual.requestId}`);
    }
    return { manifest, digest: sha256(bytes), bytes: bytes.length, path: relative(file) };
}

function parseComponentData(component) {
    if (!component || component.data === undefined) return null;
    if (typeof component.data === "string") {
        try { return JSON.parse(component.data); } catch (error) { throw new Error(`HoYoWiki component data JSON invalid: ${error.message}`); }
    }
    return component.data;
}

function parseDirectPage(raw, entity, rawArtifact) {
    if (raw?.retcode !== 0 || !raw?.data?.page) throw new Error(`HoYoWiki entry payload invalid: ${entity.entryPageId}`);
    const page = raw.data.page;
    if (String(page.id) !== entity.entryPageId || page.name !== entity.officialName) throw new Error(`HoYoWiki entry identity mismatch: ${entity.entityId}`);
    const modules = Array.isArray(page.modules) ? page.modules : [];
    const moduleIndex = modules.findIndex((module) => module?.name === "Attributes");
    const componentIndex = moduleIndex < 0 ? -1 : (Array.isArray(modules[moduleIndex].components) ? modules[moduleIndex].components : []).findIndex((component) => component?.component_id === "baseInfo");
    if (moduleIndex < 0 || componentIndex < 0) throw new Error(`HoYoWiki Attributes/baseInfo missing: ${entity.entityId}`);
    const component = modules[moduleIndex].components[componentIndex];
    const embedded = parseComponentData(component);
    if (!Array.isArray(embedded?.list)) throw new Error(`HoYoWiki baseInfo list missing: ${entity.entityId}`);
    const fields = {};
    for (let index = 0; index < embedded.list.length; index += 1) {
        const entry = embedded.list[index];
        if (!entry || typeof entry.key !== "string") continue;
        fields[entry.key] = {
            key: entry.key,
            providerEntryId: entry.id || null,
            valueRaw: entry.value === undefined ? null : entry.value,
            valueDigest: digestStable(entry.value === undefined ? null : entry.value),
            outerJsonPointer: pointer("data", "page", "modules", moduleIndex, "components", componentIndex, "data"),
            embeddedJsonPointer: pointer("list", index),
            embeddedValuePointer: pointer("list", index, "value"),
            rawArtifactPath: rawArtifact.path,
            rawArtifactBytes: rawArtifact.bytes,
            rawArtifactSha256: rawArtifact.sha256
        };
    }
    if (!fields[entity.passiveKey]) throw new Error(`HoYoWiki passive field missing: ${entity.entityId}:${entity.passiveKey}`);
    if (!fields["Version Released"]) throw new Error(`HoYoWiki Version Released field missing: ${entity.entityId}`);
    const passive = fields[entity.passiveKey];
    const released = fields["Version Released"];
    return {
        pageId: String(page.id),
        pageName: page.name,
        baseInfoModule: { name: modules[moduleIndex].name, id: modules[moduleIndex].id ?? null, index: moduleIndex },
        baseInfoComponent: { componentId: component.component_id, index: componentIndex },
        fieldAvailability: fields,
        passiveField: passive,
        versionReleasedField: released,
        versionEvidence: {
            status: "releaseVersionOnly",
            observedRawValue: released.valueRaw,
            observedText: textFromHtml(released.valueRaw),
            strictTargetGameVersion: targetGameVersion,
            strictGameVersionBinding: "missing",
            reason: "HoYoWiki Version Released is an introduction-version field; current-page capture and capture timestamp do not bind the mutable page to Genshin 7.0."
        }
    };
}

function parseAggregate(raw, entity, rawArtifact) {
    if (raw?.retcode !== 0 || !Array.isArray(raw?.data?.list)) throw new Error(`HoYoWiki aggregate payload invalid: page ${entity.aggregatePage}`);
    const matches = raw.data.list.filter((entry) => String(entry.entry_page_id) === entity.entryPageId);
    if (matches.length !== 1 || matches[0].name !== entity.officialName) throw new Error(`HoYoWiki aggregate identity mismatch: ${entity.entityId}`);
    return {
        menuId: "4",
        pageNumber: entity.aggregatePage,
        pageSize: 30,
        totalObserved: raw.data.total ?? null,
        entry: {
            entryPageId: String(matches[0].entry_page_id),
            name: matches[0].name,
            providerRecord: clone(matches[0]),
            rawJsonPointer: pointer("data", "list", raw.data.list.indexOf(matches[0])),
            rawArtifactPath: rawArtifact.path,
            rawArtifactBytes: rawArtifact.bytes,
            rawArtifactSha256: rawArtifact.sha256
        }
    };
}

function readRawCapture(request) {
    const rawFile = path.join(providerRoot, request.rawPath);
    const bytes = fs.readFileSync(rawFile);
    const manifest = readManifest().manifest;
    const capture = manifest.requests.find((item) => item.requestId === request.requestId);
    if (!capture || capture.bytes !== bytes.length || capture.sha256 !== sha256(bytes)) throw new Error(`official raw capture metadata mismatch: ${request.requestId}`);
    return { path: relative(rawFile), bytes: bytes.length, sha256: capture.sha256, value: JSON.parse(bytes.toString("utf8")) };
}

function candidateClaims(entity, parsed, localRecord) {
    return entity.candidateIds.flatMap((candidateId) => localRecord.candidateRecords.find((record) => record.candidateId === candidateId).requiredClaimFields.map((field) => ({
        candidateId,
        claimId: `weapon:${candidateId}:${field}`,
        entityId: entity.entityId,
        field,
        localCandidateEvidence: {
            source: "authoritative queue + local v2 verification",
            status: "legacyCandidateNeedsIndependentReview",
            verificationCandidateDigest: localRecord.candidateRecords.find((record) => record.candidateId === candidateId).legacyCandidateDigest,
            localEffectRecordDigest: localRecord.effectRecordDigest
        },
        providerField: {
            status: "rawFieldPresent",
            key: parsed.passiveField.key,
            providerEntryId: parsed.passiveField.providerEntryId,
            rawValue: parsed.passiveField.valueRaw,
            valueDigest: parsed.passiveField.valueDigest,
            rawLocator: {
                rawArtifactPath: parsed.passiveField.rawArtifactPath,
                rawArtifactBytes: parsed.passiveField.rawArtifactBytes,
                rawArtifactSha256: parsed.passiveField.rawArtifactSha256,
                outerJsonPointer: parsed.passiveField.outerJsonPointer,
                embeddedJsonPointer: parsed.passiveField.embeddedJsonPointer,
                embeddedValuePointer: parsed.passiveField.embeddedValuePointer
            }
        },
        fieldCoverage: {
            exactFieldIdentity: "passiveTextField",
            rawTextAvailable: true,
            structuredClaimValue: "notMaterialized",
            conditionScope: "notMaterialized",
            refinementScope: "rawTextContainsObservedTableButNotStructuredHere",
            targetScope: "notMaterialized",
            semanticComparison: "notPerformed",
            noTranslationInference: true,
            noNumericInference: true
        },
        strictGameVersionBinding: {
            targetGameVersion,
            status: "missing",
            providerReleaseField: parsed.versionEvidence.observedText,
            captureTimestampIsNotVersionEvidence: true
        },
        disposition: {
            status: "blocked",
            blockers: ["officialEndpointMutableNoImmutableRevision", "strictGameVersionBindingMissing", "candidateClaimSemanticFieldMappingNotMaterialized", "singleOfficialSourceFamily"],
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false
        }
    })));
}

function buildEntity(entity, aggregateCapture, directCapture, localRecord) {
    const aggregate = parseAggregate(aggregateCapture.value, entity, aggregateCapture);
    const direct = parseDirectPage(directCapture.value, entity, directCapture);
    const existingProvider = localRecord.existingGenshinDbProvider;
    const identityStatus = existingProvider
        ? (existingProvider.embeddedId === entity.entityId && existingProvider.embeddedName === entity.officialName ? "resolvedByLocalCatalogAndValidatedPinnedGenshinDbAid" : "identityConflict")
        : "officialEntryResolvedButLocalNumericIdUnbound";
    if (identityStatus === "identityConflict") throw new Error(`existing GenshinData identity conflict: ${entity.entityId}`);
    const claims = candidateClaims(entity, direct, localRecord);
    return {
        entityId: entity.entityId,
        localNameJa: entity.localNameJa,
        localEffectNameJa: entity.localEffectNameJa,
        provider: { name: providerName, providerId, entryPageId: entity.entryPageId, englishName: entity.officialName },
        identityResolution: {
            status: identityStatus,
            localCatalogPath: relative(weaponsPath),
            localCatalogNameJa: entity.localNameJa,
            existingPinnedGenshinDbAid: clone(existingProvider),
            officialAggregateName: aggregate.entry.name,
            officialEntryPageName: direct.pageName,
            noArithmeticalIdInference: true,
            noTranslationInference: true
        },
        sourceEvidence: {
            aggregate,
            entry: {
                pageUrl: `https://wiki.hoyolab.com/pc/genshin/entry/${entity.entryPageId}`,
                apiUrl: `${directUrl}?entry_page_id=${entity.entryPageId}&game_id=2`,
                rawArtifactPath: directCapture.path,
                rawArtifactBytes: directCapture.bytes,
                rawArtifactSha256: directCapture.sha256,
                statusCode: 200
            }
        },
        parsedFields: {
            name: clone(direct.fieldAvailability.Name || null),
            weaponType: clone(direct.fieldAvailability.Type || null),
            secondaryAttribute: clone(direct.fieldAvailability["Secondary Attributes"] || null),
            passive: clone(direct.passiveField),
            versionReleased: clone(direct.versionReleasedField)
        },
        providerVersionEvidence: direct.versionEvidence,
        candidateClaims: claims,
        candidateCoverage: entity.candidateIds.length ? "queueClaimsPresent" : "noV2CandidateClaimForEntity",
        sourceFamilyCount: 1,
        canIssueEligibilityCertificate: false,
        canPromoteCanonical: false
    };
}

function buildClaim() {
    const queue = queueInventory();
    const local = localIdentity();
    const capture = readManifest();
    const reqs = requests();
    const captureById = new Map(reqs.map((request) => [request.requestId, readRawCapture(request)]));
    const entitiesOutput = entities.map((entity) => {
        const localRecord = local.records.find((record) => record.entityId === entity.entityId);
        return buildEntity(entity, captureById.get(`aggregate-page-${String(entity.aggregatePage).padStart(2, "0")}`), captureById.get(`entry-${entity.entryPageId}`), localRecord);
    });
    const candidateClaims = entitiesOutput.flatMap((entity) => entity.candidateClaims);
    const aggregatePages = entities.map((entity) => entity.aggregatePage).sort((a, b) => a - b);
    return {
        transitionId,
        targetGameVersion,
        dataset: "weapons",
        lane: "officialWeaponFrontier",
        scope: { entityIds: expectedEntityIds, entityCount: entities.length, candidateIds: expectedCandidateIds, candidateCount: expectedCandidateIds.length },
        provider: providerName,
        providerId,
        sourceFamily,
        independenceGroup: sourceFamily,
        lineageStatus: "declared",
        lineage,
        immutable: false,
        revision: { status: "mutableEndpointNoRevision", value: null },
        searchScope: {
            status: "boundedOfficialProviderCapture",
            provider: providerName,
            providersExamined: [providerName],
            exactEntityIds: expectedEntityIds,
            aggregateEndpoint: { method: "POST", url: aggregateUrl, menuId: "4", pageSize: 30, pages: aggregatePages, totalObserved: entitiesOutput.map((entity) => entity.sourceEvidence.aggregate.totalObserved).sort((a, b) => a - b) },
            directEndpoint: { method: "GET", url: directUrl, entryPageIds: entities.map((entity) => entity.entryPageId).sort((a, b) => Number(a) - Number(b)) },
            exhaustive: false,
            accessStatus: "captured",
            reopenTrigger: "immutable official 7.0-bound snapshot/release artifact or a newly disclosed independent source family"
        },
        queue,
        localIdentity: local,
        captureManifest: capture,
        entities: entitiesOutput,
        candidateClaims,
        notRepresentedEntities: entitiesOutput.filter((entity) => entity.candidateCoverage === "noV2CandidateClaimForEntity").map((entity) => ({ entityId: entity.entityId, status: entity.candidateCoverage, reason: "No authoritative v2 queue candidate claim exists for 11303; no claim is invented." })),
        gateDisposition: {
            status: "officialRawAvailableButTargetVersionUnbound",
            sourceFamilyCount: 1,
            providerIndependence: "notPairableWithinThisLane",
            strictGameVersionBinding: "missing",
            reason: "The captured official API exposes exact identity and passive fields, but its mutable current endpoint has no immutable revision or explicit Genshin 7.0 binding. HoYoWiki and HoYoLAB also normalize to the same official-hoyoverse family.",
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false
        }
    };
}

function buildSnapshot() {
    const claim = buildClaim();
    return {
        schemaVersion: 1,
        kind: "genshinVersionTransitionOfficialWeaponFrontierSnapshot",
        generatedAt,
        status: "officialRawCapturedTargetVersionUnbound",
        claim,
        summary: {
            entities: claim.entities.length,
            directRawRecords: claim.entities.length,
            aggregateRawRecords: claim.entities.length,
            candidateClaims: claim.candidateClaims.length,
            candidateFieldClaims: claim.candidateClaims.length,
            rawPassiveFields: claim.entities.length,
            noV2CandidateClaimEntities: claim.notRepresentedEntities.length,
            identityUnboundEntities: claim.entities.filter((entity) => entity.identityResolution.status === "officialEntryResolvedButLocalNumericIdUnbound").length,
            strictTargetVersionBoundEntities: 0,
            sourceFamilyCount: 1,
            certificateEligibleClaims: 0,
            canonicalPromotionCount: 0
        },
        gateEligibility: {
            status: "officialRawAvailableButTargetVersionUnbound",
            sourceFamilyCount: 1,
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false
        },
        fieldDigestAlgorithm: "sha256-stable-json-v1",
        fieldDigest: digestStable(claim)
    };
}

function checkpointClaim(checkpoint) {
    return {
        transitionId,
        sourceNamespace,
        requestedEntityIds: checkpoint.requestedEntityIds,
        capturedEntityIds: checkpoint.capturedEntityIds,
        capturedAggregatePages: checkpoint.capturedAggregatePages,
        status: checkpoint.status,
        blocker: checkpoint.blocker || null,
        gateEligibility: checkpoint.gateEligibility,
        nextTask: checkpoint.nextTask
    };
}

function baseCheckpoint(status = "capturePending") {
    return {
        schemaVersion: 1,
        kind: "genshinVersionTransitionOfficialWeaponFrontierCaptureCheckpoint",
        generatedAt,
        transitionId,
        targetGameVersion,
        sourceNamespace,
        provider: providerName,
        providerId,
        sourceFamily,
        requestedEntityCount: entities.length,
        requestedEntityIds: expectedEntityIds,
        capturedEntityIds: [],
        capturedAggregatePages: [],
        status,
        captures: [],
        blocker: null,
        accessStatus: "notAttempted",
        nextTask: "fetch official aggregate pages 5, 7, 8 and entry pages 1938, 2052, 1977",
        gateEligibility: { status: "failClosed", canIssueEligibilityCertificate: false, canPromoteCanonical: false },
        fieldDigestAlgorithm: "sha256-stable-json-v1",
        fieldDigest: null
    };
}

function persistCheckpoint(checkpoint) {
    checkpoint.fieldDigest = digestStable(checkpointClaim(checkpoint));
    fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
    fs.writeFileSync(checkpointPath, stableJson(checkpoint), "utf8");
}

async function acquire() {
    const checkpoint = baseCheckpoint("inProgress");
    checkpoint.accessStatus = "attempting";
    persistCheckpoint(checkpoint);
    const captures = [];
    try {
        for (const request of requests()) {
            const result = await fetchRequest(request);
            const target = path.join(providerRoot, request.rawPath);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, result.captured);
            captures.push({ ...result, captured: undefined });
            if (request.method === "GET") checkpoint.capturedEntityIds.push(request.expected.entityId);
            if (request.method === "POST") checkpoint.capturedAggregatePages.push(request.body.page_num);
            checkpoint.captures = captures.map((capture) => ({ ...capture, captured: undefined }));
            checkpoint.nextTask = `capture remaining official raw request (${captures.length}/${requests().length})`;
            persistCheckpoint(checkpoint);
        }
        const manifest = writeManifest(captures);
        checkpoint.status = "complete";
        checkpoint.accessStatus = "capturedMutableOfficialEndpoint";
        checkpoint.captures = manifest.requests;
        checkpoint.capturedEntityIds = entities.map((entity) => entity.entityId);
        checkpoint.capturedAggregatePages = entities.map((entity) => entity.aggregatePage).sort((a, b) => a - b);
        checkpoint.nextTask = "build and validate official-weapon-frontier-11301-11303-snapshot.json; keep certificate and canonical gates closed";
        persistCheckpoint(checkpoint);
        return checkpoint;
    } catch (error) {
        checkpoint.status = "captureError";
        checkpoint.accessStatus = "accessUnavailable";
        checkpoint.blocker = {
            kind: "providerAccessUnavailable",
            requestId: error.requestId || null,
            url: error.url || null,
            statusCode: error.statusCode || null,
            message: String(error.message)
        };
        checkpoint.nextTask = "resume the bounded official capture from the first missing request; accessUnavailable is not searchExhausted";
        persistCheckpoint(checkpoint);
        throw error;
    }
}

function buildReport(snapshot) {
    const rows = snapshot.claim.entities.map((entity) => ({
        entityId: entity.entityId,
        localNameJa: entity.localNameJa,
        officialName: entity.provider.englishName,
        entryPageId: entity.provider.entryPageId,
        passiveKey: entity.parsedFields.passive.key,
        passiveRawValue: entity.parsedFields.passive.valueRaw,
        versionReleasedRawValue: entity.parsedFields.versionReleased.valueRaw,
        directRaw: { path: entity.sourceEvidence.entry.rawArtifactPath, bytes: entity.sourceEvidence.entry.rawArtifactBytes, sha256: entity.sourceEvidence.entry.rawArtifactSha256 },
        candidateClaimCount: entity.candidateClaims.length,
        identityStatus: entity.identityResolution.status,
        disposition: "blocked: mutable endpoint and strict 7.0 binding missing"
    }));
    return {
        schemaVersion: 1,
        kind: "genshinOfficialWeaponFrontierReport",
        generatedAt,
        status: snapshot.status,
        snapshotPath: relative(outputPath),
        snapshotFieldDigest: snapshot.fieldDigest,
        provider: { name: providerName, providerId, sourceFamily, independenceGroup: sourceFamily, lineage, immutable: false },
        targetGameVersion,
        boundedScope: { entityIds: expectedEntityIds, providersExamined: [providerName], noOtherProviders: true },
        entities: rows,
        findings: [
            "HoYoWiki aggregate pages 5, 7, and 8 resolve official entry IDs 2052, 1977, and 1938 to the exact English names captured here.",
            "All three current entry payloads expose a raw passive field and a Version Released field; raw bytes, URL, size, and SHA-256 are retained.",
            "Version Released is release/introduction evidence only. The mutable API has no immutable revision and no explicit Genshin 7.0 binding; capture time is not gameVersion evidence.",
            "HoYoWiki is the official-hoyoverse family. HoYoLAB notices normalize to the same family and cannot provide a second independent family in this lane.",
            "11303 has no authoritative v2 candidate claim, so no candidate or promotion claim is invented; its numeric local ID is not silently bound to the official entry by translation inference."
        ],
        gateDisposition: snapshot.claim.gateDisposition,
        fieldDigestAlgorithm: "sha256-stable-json-v1",
        fieldDigest: digestStable({ status: snapshot.status, targetGameVersion, rows, gateDisposition: snapshot.claim.gateDisposition })
    };
}

function renderMarkdown(report) {
    const rows = report.entities.map((entity) => `| ${entity.entityId} | ${entity.localNameJa} | ${entity.officialName} | ${entity.entryPageId} | ${entity.passiveKey} | ${entity.candidateClaimCount} | blocked |`);
    return [
        "# Genshin official weapon frontier (11301-11303)",
        "",
        `Status: **${report.status}**; target: **${report.targetGameVersion}**; certificate/canonical: **blocked/0**`,
        "",
        "This is a bounded HoYoWiki raw-API capture. It does not modify queue, source catalog, candidates, runtime, or canonical data.",
        "",
        "| entity | local name | official name | entry page | raw passive key | candidate claims | disposition |",
        "| --- | --- | --- | ---: | --- | ---: | --- |",
        ...rows,
        "",
        ...report.findings.map((finding) => `- ${finding}`),
        "",
        "## Gate",
        "",
        "- Official raw field availability is recorded, but strict 7.0 binding is missing.",
        "- The endpoint is mutable (`immutable: false`); the raw SHA-256 is an integrity digest, not a historical revision.",
        "- No eligibility certificate or canonical promotion is issued.",
        "- Reopen with an immutable official artifact explicitly bound to Genshin 7.0, or a newly disclosed independent source family.",
        ""
    ].join("\n");
}

function writeReport(report) {
    fs.writeFileSync(reportJsonPath, stableJson(report), "utf8");
    fs.writeFileSync(reportMarkdownPath, renderMarkdown(report), "utf8");
}

function writeSnapshot() {
    const snapshot = buildSnapshot();
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, stableJson(snapshot), "utf8");
    const report = buildReport(snapshot);
    writeReport(report);
    const checkpoint = fs.existsSync(checkpointPath) ? readJson(checkpointPath) : baseCheckpoint("complete");
    checkpoint.status = "complete";
    checkpoint.accessStatus = "capturedMutableOfficialEndpoint";
    checkpoint.capturedEntityIds = expectedEntityIds;
    checkpoint.capturedAggregatePages = entities.map((entity) => entity.aggregatePage).sort((a, b) => a - b);
    checkpoint.materializedSnapshot = { path: relative(outputPath), fieldDigest: snapshot.fieldDigest, status: snapshot.status };
    checkpoint.nextTask = "retain fail-closed status until immutable explicit 7.0 official evidence and an independent pair are available";
    persistCheckpoint(checkpoint);
    return snapshot;
}

function validateSnapshot(snapshot, { compareCurrent = false } = {}) {
    const reasons = [];
    if (!snapshot || snapshot.schemaVersion !== 1 || snapshot.kind !== "genshinVersionTransitionOfficialWeaponFrontierSnapshot") reasons.push("identityInvalid");
    if (snapshot?.generatedAt !== generatedAt || snapshot?.status !== "officialRawCapturedTargetVersionUnbound") reasons.push("bindingInvalid");
    if (snapshot?.fieldDigestAlgorithm !== "sha256-stable-json-v1" || snapshot?.fieldDigest !== digestStable(snapshot?.claim)) reasons.push("fieldDigestInvalid");
    if (snapshot?.claim?.providerId !== providerId || snapshot?.claim?.sourceFamily !== sourceFamily || snapshot?.claim?.immutable !== false || snapshot?.claim?.gateDisposition?.strictGameVersionBinding !== "missing") reasons.push("providerGateInvalid");
    if (snapshot?.gateEligibility?.canIssueEligibilityCertificate !== false || snapshot?.gateEligibility?.canPromoteCanonical !== false || snapshot?.summary?.certificateEligibleClaims !== 0 || snapshot?.summary?.canonicalPromotionCount !== 0) reasons.push("failClosedDispositionInvalid");
    try {
        const queue = queueInventory();
        if (snapshot.claim.queue.candidateIdsDigest !== queue.candidateIdsDigest || snapshot.claim.scope.candidateIds.join(",") !== expectedCandidateIds.join(",")) reasons.push("queueScopeInvalid");
    } catch (error) { reasons.push(`queueInvalid:${error.message}`); }
    try { readManifest(); } catch (error) { reasons.push(`rawManifestInvalid:${error.message}`); }
    if (!Array.isArray(snapshot?.claim?.entities) || snapshot.claim.entities.length !== entities.length) reasons.push("entityCoverageInvalid");
    for (const expected of entities) {
        const actual = snapshot?.claim?.entities?.find((entity) => entity.entityId === expected.entityId);
        if (!actual || actual.provider.entryPageId !== expected.entryPageId || actual.provider.englishName !== expected.officialName || actual.parsedFields.passive.key !== expected.passiveKey) reasons.push(`entityBindingInvalid:${expected.entityId}`);
        if (actual?.candidateClaims?.some((claim) => claim.disposition?.canIssueEligibilityCertificate !== false || claim.disposition?.canPromoteCanonical !== false)) reasons.push(`candidateGateInvalid:${expected.entityId}`);
    }
    if (snapshot?.claim?.candidateClaims?.length !== expectedCandidateIds.length * requiredClaimFields.length) reasons.push("candidateClaimCoverageInvalid");
    if (compareCurrent) {
        try { if (stableJson(buildSnapshot()) !== stableJson(snapshot)) reasons.push("artifactNotDeterministicForCurrentInputs"); } catch (error) { reasons.push(`currentInputsInvalid:${error.message}`); }
    }
    return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}

function validateCheckpoint(checkpoint) {
    const reasons = [];
    if (!checkpoint || checkpoint.schemaVersion !== 1 || checkpoint.kind !== "genshinVersionTransitionOfficialWeaponFrontierCaptureCheckpoint") reasons.push("identityInvalid");
    if (checkpoint?.generatedAt !== generatedAt || checkpoint?.transitionId !== transitionId || checkpoint?.sourceNamespace !== sourceNamespace) reasons.push("bindingInvalid");
    if (checkpoint?.fieldDigestAlgorithm !== "sha256-stable-json-v1" || checkpoint?.fieldDigest !== digestStable(checkpointClaim(checkpoint))) reasons.push("fieldDigestInvalid");
    if (checkpoint?.gateEligibility?.canIssueEligibilityCertificate !== false || checkpoint?.gateEligibility?.canPromoteCanonical !== false) reasons.push("failClosedDispositionInvalid");
    if (checkpoint?.requestedEntityCount !== entities.length || checkpoint?.requestedEntityIds?.join(",") !== expectedEntityIds.join(",")) reasons.push("scopeInvalid");
    if (checkpoint?.status === "complete" && checkpoint.capturedEntityIds?.length !== entities.length) reasons.push("captureCoverageInvalid");
    return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
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
    buildSnapshot,
    buildClaim,
    buildReport,
    checkpointPath,
    entities,
    expectedEntityIds,
    expectedCandidateIds,
    generatedAt,
    outputPath,
    providerRoot,
    reportJsonPath,
    reportMarkdownPath,
    requests,
    schemaPath,
    checkpointSchemaPath,
    sourceNamespace,
    validateSnapshot,
    validateCheckpoint,
    writeSnapshot
};
