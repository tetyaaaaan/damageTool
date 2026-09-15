"use strict";

/**
 * Deterministic, fail-closed reconciliation for the authoritative talent-gap
 * semantic lane.
 *
 * This is an evidence inventory, not a prose parser.  It joins the exact
 * queue shard to the existing local passive SourceRecords, the already
 * materialised 6.7 -> 7.0 provider snapshots, and the current consumer
 * identity observation.  It never infers an EffectSpec value, maps a passive
 * by ordinal when the source schemas do not prove that bridge, issues a
 * certificate, or promotes a canonical/runtime record.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { digestStable, stableValue } = require("./genshinVersionEvidenceValidation.cjs");
const identityAuditModule = require("./genshinCharacterIdentityConsistencyAudit.cjs");
const localizedCaptureModule = require("./genshinTalentGapLocalizedFieldCapture.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const transitionRoot = path.join(dataRoot, "v2", "version-transitions", "6.7-to-7.0");
const paths = Object.freeze({
    talentGapArtifact: path.join(dataRoot, "v2", "characters", "talent-gap-candidates.json"),
    characters: path.join(dataRoot, "characters.json"),
    characterTalents: path.join(dataRoot, "character-talents.json"),
    queue: path.join(repositoryRoot, "reports", "genshin-evidence-task-queue.json"),
    canonicalRuntime: path.join(dataRoot, "v2", "runtime", "canonical-runtime.json"),
    eligibilityCertificates: path.join(dataRoot, "v2", "eligibility-certificates.json"),
    deterministicAttestations: path.join(dataRoot, "v2", "deterministic-attestations.json"),
    mapper: path.join(repositoryRoot, "games", "js", "genshinProfileMapper.js"),
    artifact: path.join(dataRoot, "v2", "characters", "talent-gap-lane-audit.json"),
    reportJson: path.join(repositoryRoot, "reports", "genshin-talent-gap-lane-audit.json"),
    reportMarkdown: path.join(repositoryRoot, "reports", "genshin-talent-gap-lane-audit.md"),
    schema: path.join(dataRoot, "schema", "talent-gap-lane-audit.schema.json"),
    localizedFieldCapture: path.join(transitionRoot, "talent-gap-localized-field-capture-standard01-snapshot.json")
});

// Keep the generated artifact reproducible.  This is the repository audit
// date, not a runtime clock and therefore cannot introduce nondeterminism.
const generatedAt = "2026-08-27T00:00:00.000Z";
const lane = Object.freeze({
    shardId: "talentGap:talentGapEffectSpec:semanticDecisionRequired:standard:01",
    clusterId: "source-unlock:talentGap:talentGapEffectSpec:semanticDecisionRequired:standard",
    dataset: "talentGap",
    layer: "talentGapEffectSpec",
    primaryBlockReason: "semanticDecisionRequired"
});
const EXPECTED_CANDIDATE_COUNT = 67;
const EXPECTED_ENTITY_IDS = Object.freeze([
    "10000003", "10000005", "10000007", "10000014", "10000015", "10000031",
    "10000038", "10000050", "10000065", "10000067", "10000068", "10000074",
    "10000077", "10000079", "10000083", "10000088", "10000101", "10000105",
    "10000108", "10000112", "10000115", "10000121", "10000132"
]);
const EXPECTED_ENTITY_SET = new Set(EXPECTED_ENTITY_IDS);
const TRAVELER_ENTITY_IDS = new Set(["10000005", "10000007"]);
const EXACT_MAPPING_STATUSES = new Set(["exactSourceOwnedLabel", "exactLocalizedNameProviderKey"]);
// Immutable provider pins already materialised by the 6.7 -> 7.0 capture.
// A mutable snapshot boolean or a self-consistent forged manifest cannot
// replace these repository-backed revision/package/raw-digest pins.
const KNOWN_PROVIDER_PINS = Object.freeze({
    "6.7": Object.freeze({
        provider: "genshin-db",
        revision: "1bab2cdba4d218fd5caa46b5f54e7884ee8359a2",
        packageVersion: "5.2.12",
        packageBytes: 1619,
        packageSha256: "5ded2b3bab58218da17f6a1282209e653c1ec7ecd9297b95569558a737c2e8f6",
        packageGitBlob: "e78cc92e75db21ea15edadbeafdf9152896d934c"
    }),
    "7.0": Object.freeze({
        provider: "genshin-db",
        revision: "8b15995fa220c88a4d0d7ffe1e21b041d0b32588",
        packageVersion: "5.2.13",
        packageBytes: 1619,
        packageSha256: "3faf0b2220539a07af9260f5dd83afd0e964aa42868c9b3b73c6cb14065085c6",
        packageGitBlob: "cfccefd470f420159b1376440e1a0f86a247030d"
    })
});

// Only these queue-owned fields are inputs to this derived lane.  In
// particular, parent/root annotations are recursively removed before the
// projection digest is calculated, so attaching this audit back to the queue
// cannot make its own input cycle.
const QUEUE_PROJECTION_KEYS = Object.freeze([
    "candidateId",
    "layer",
    "dataset",
    "terminalState",
    "primaryBlockReason",
    "blockReasons",
    "task",
    "deferredLanes",
    "searchFrontier",
    "certificate",
    "officialVersionImpact",
    "transitionLane",
    "preparedTransitionClaimCount",
    "transitionClaimSchemaStatus",
    "transitionProviderCaptureStatus",
    "fieldComparison",
    "mappingStatus",
    "consumerStatus",
    "machineEvidenceReady",
    "autoProcessableNow"
]);
const DERIVED_QUEUE_KEYS = new Set([
    "talentGapReconciliation",
    "talentGapLaneAudit",
    "behaviorModifierReconciliation",
    "behaviorModifierLaneAudit",
    "reconciliationAudit",
    "laneAudit",
    "audit"
]);

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256Text(value) {
    return sha256(Buffer.from(String(value), "utf8"));
}

function gitBlobSha1(bytes) {
    return crypto.createHash("sha1")
        .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`, "utf8"), bytes]))
        .digest("hex");
}

function stableJson(value) {
    return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function relativePath(file) {
    return path.relative(repositoryRoot, file).replaceAll("\\", "/");
}

function naturalCompare(left, right) {
    return String(left).localeCompare(String(right), "en", { numeric: true });
}

function uniqueSorted(values) {
    return [...new Set((values || [])
        .filter((value) => value !== undefined && value !== null)
        .map(String))].sort(naturalCompare);
}

function countBy(values) {
    const result = {};
    for (const value of values || []) {
        const key = String(value ?? "<null>");
        result[key] = (result[key] || 0) + 1;
    }
    return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function fileIntegrity(file) {
    if (!file || !fs.existsSync(file)) return { exists: false, bytes: 0, sha256: null };
    const bytes = fs.readFileSync(file);
    return { exists: true, bytes: bytes.length, sha256: sha256(bytes) };
}

function generatedInput(file) {
    return {
        path: relativePath(file),
        ...fileIntegrity(file)
    };
}

function stripDerivedQueueKeys(value) {
    if (Array.isArray(value)) return value.map(stripDerivedQueueKeys);
    if (!value || typeof value !== "object") return value;
    const result = {};
    for (const [key, nested] of Object.entries(value)) {
        if (DERIVED_QUEUE_KEYS.has(key)) continue;
        result[key] = stripDerivedQueueKeys(nested);
    }
    return result;
}

function projectQueueTask(task) {
    if (!task || typeof task !== "object") return null;
    const result = {};
    for (const key of QUEUE_PROJECTION_KEYS) {
        if (Object.prototype.hasOwnProperty.call(task, key)) {
            result[key] = stripDerivedQueueKeys(clone(task[key]));
        }
    }
    return result;
}

function queueCluster(queue) {
    return (queue?.unlockClusters || []).find((cluster) => cluster.clusterId === lane.clusterId) || null;
}

function laneCandidateIds(queue) {
    const shard = queueCluster(queue)?.shards?.find((item) => item.shardId === lane.shardId);
    return uniqueSorted(shard?.candidateIds || []);
}

function queueInputProjection(queue) {
    const candidateIds = laneCandidateIds(queue);
    const taskById = new Map((queue?.tasks || []).map((task) => [String(task?.candidateId), task]));
    return {
        projectionVersion: "genshinTalentGapLaneAudit/queue-input-v1",
        clusterId: lane.clusterId,
        shardId: lane.shardId,
        candidateIds,
        tasks: candidateIds.map((candidateId) => projectQueueTask(taskById.get(candidateId)))
    };
}

function loadTransitionSnapshots() {
    if (!fs.existsSync(transitionRoot)) return [];
    return fs.readdirSync(transitionRoot)
        .filter((fileName) => /^behavior(?:-entity|-shard-\d{2})-snapshot\.json$/.test(fileName))
        .sort(naturalCompare)
        .map((fileName) => {
            const file = path.join(transitionRoot, fileName);
            return { file, snapshot: readJson(file) };
        });
}

function loadInputs() {
    return {
        talentGap: readJson(paths.talentGapArtifact),
        characters: readJson(paths.characters),
        characterTalents: readJson(paths.characterTalents),
        queue: readJson(paths.queue),
        canonicalRuntime: readJson(paths.canonicalRuntime),
        eligibilityCertificates: readJson(paths.eligibilityCertificates),
        deterministicAttestations: readJson(paths.deterministicAttestations),
        identityAudit: identityAuditModule.buildAudit(),
        transitionSnapshots: loadTransitionSnapshots(),
        localizedFieldCapture: readJson(paths.localizedFieldCapture)
    };
}

function loadInputsWithQueue(queue) {
    const inputs = loadInputs();
    if (queue === undefined) return inputs;
    return { ...inputs, queue };
}

function pointerEscape(value) {
    return String(value).replace(/~/g, "~0").replace(/\//g, "~1");
}

function jsonPointer(...parts) {
    return `/${parts.map(pointerEscape).join("/")}`;
}

function sourceRecordEvidence(sourceRef, source, characterTalents, entityId, expectedPassiveSourceId) {
    const record = characterTalents?.[String(entityId)] || null;
    const locator = source?.locator || null;
    const field = String(locator?.field || "");
    const match = /^passives\.(\d+)\.descriptionJa$/.exec(field);
    const passiveIndex = match ? Number(match[1]) : null;
    const passive = passiveIndex === null ? null : record?.passives?.[passiveIndex];
    const currentText = passive && typeof passive.descriptionJa === "string" ? passive.descriptionJa : null;
    const sourceText = typeof source?.text === "string" ? source.text : null;
    const sourceTextDigest = sourceText === null ? null : sha256Text(sourceText);
    const currentTextDigest = currentText === null ? null : sha256Text(currentText);
    const declaredDigest = source?.integrity?.algorithm === "sha256" && typeof source?.integrity?.digest === "string"
        ? source.integrity.digest
        : null;
    const locatorMatches = Boolean(
        source
        && locator?.dataset === "character-talents.json"
        && String(locator?.record || "") === String(entityId)
        && passiveIndex !== null
        && passive
        && typeof passive.descriptionJa === "string"
        && (!expectedPassiveSourceId || String(passive.sourceId || "") === String(expectedPassiveSourceId))
    );
    let status = "missing";
    if (source) {
        status = "invalid";
        if (!locatorMatches) status = "locatorMismatch";
        else if (sourceText === null || declaredDigest === null || declaredDigest !== sourceTextDigest) status = "rawDigestMismatch";
        else if (sourceText !== currentText) status = "currentRawMismatch";
        else status = "verified";
    }
    return {
        sourceRecordId: sourceRef,
        present: Boolean(source),
        status,
        provider: source?.provider ?? null,
        independenceGroup: source?.independenceGroup ?? null,
        providerIndependence: source?.providerIndependence ?? null,
        gameVersion: source?.gameVersion ?? null,
        locale: source?.locale ?? null,
        capturedAt: source?.capturedAt ?? null,
        sourceRecordDigest: source ? digestStable(source) : null,
        declaredRawDigest: declaredDigest,
        sourceTextDigest,
        currentTextDigest,
        rawDigestMatches: Boolean(sourceTextDigest && declaredDigest && sourceTextDigest === declaredDigest),
        sourceTextMatchesCurrent: Boolean(sourceText !== null && currentText !== null && sourceText === currentText),
        fieldLocator: {
            dataset: locator?.dataset ?? null,
            record: locator?.record ?? null,
            field: locator?.field ?? null,
            jsonPointer: passiveIndex === null ? null : jsonPointer(entityId, "passives", passiveIndex, "descriptionJa"),
            passiveIndex,
            passiveSourceId: passive?.sourceId ?? null,
            expectedPassiveSourceId: expectedPassiveSourceId ?? null,
            locatorMatches,
            rawValueDigest: currentTextDigest,
            sourceTextDigest
        },
        rawTextLength: sourceText === null ? null : sourceText.length,
        rawTextPresent: Boolean(sourceText && sourceText.trim()),
        structuredValue: clone(source?.structuredValue ?? null),
        notes: "Raw local Japanese passive text is observed only; no effect semantics were inferred."
    };
}

function effectHasNumericValue(value) {
    if (typeof value === "number") return true;
    if (Array.isArray(value)) return value.some(effectHasNumericValue);
    if (!value || typeof value !== "object") return false;
    return Object.values(value).some(effectHasNumericValue);
}

function localCandidateEvidence(id, inputs) {
    const spec = inputs.talentGap?.specs?.[id] || null;
    const entityId = spec?.entity?.id ? String(spec.entity.id) : String(id).split(":")[2] || null;
    const sourceRef = spec?.sourceRefs?.[0] || null;
    const source = sourceRef ? inputs.talentGap?.sourceRecords?.[sourceRef] || null : null;
    const passiveSourceId = spec?.entity?.component?.replace(/^passive:/, "") || null;
    const sourceEvidence = sourceRecordEvidence(
        sourceRef,
        source,
        inputs.characterTalents,
        entityId,
        passiveSourceId
    );
    const effect = spec?.effect || null;
    const unknownFields = Array.isArray(effect?.unknownFields) ? uniqueSorted(effect.unknownFields) : [];
    const claims = spec?.verification?.claims && typeof spec.verification.claims === "object"
        ? Object.entries(spec.verification.claims).sort(([left], [right]) => left.localeCompare(right)).map(([field, claim]) => ({
            field,
            status: claim?.status ?? null,
            sourceRefs: uniqueSorted(claim?.sourceRefs || [])
        }))
        : [];
    const effectContract = {
        present: Boolean(spec?.effect),
        kind: effect?.kind ?? null,
        unknownFields,
        allFieldsUnknown: Boolean(
            effect
            && effect.kind === "unknown"
            && unknownFields.length > 0
            && effect.activation?.status === "unknown"
            && effect.value?.status === "unknown"
            && effect.snapshot === "unknown"
            && effect.offField === "unknown"
            && effect.area === "unknown"
        ),
        numericValueObserved: effectHasNumericValue(effect),
        inferencePerformed: false
    };
    const catalog = inputs.characters?.[String(entityId)] || null;
    return {
        entityId,
        characterNameJa: catalog?.nameJa ?? inputs.talentGap?.byCharacter?.[entityId]?.characterName ?? null,
        catalogIdentity: {
            present: Boolean(catalog),
            nameJa: catalog?.nameJa ?? null,
            recordDigest: catalog ? digestStable(catalog) : null
        },
        spec: {
            present: Boolean(spec),
            id: spec?.id ?? null,
            digest: spec ? digestStable(spec) : null,
            sourceRefs: uniqueSorted(spec?.sourceRefs || []),
            verificationStatus: spec?.verification?.status ?? null,
            runtimeStatus: spec?.runtime?.status ?? null,
            effect: effectContract,
            claims
        },
        source: sourceEvidence,
        requiredFieldGaps: {
            effectFields: unknownFields,
            claimFields: claims.filter((claim) => claim.status !== "verified" && claim.status !== "accepted").map((claim) => claim.field),
            semanticDecisionRequired: true
        }
    };
}

function transitionEntityIds(snapshot) {
    const claim = snapshot?.claim || {};
    const coverage = claim.coverage || {};
    return new Set([
        ...(coverage.resolvedEntityIds || []),
        ...(coverage.ambiguousEntityIds || []),
        ...(coverage.entityIds || []),
        ...(claim.shard?.authoritativeEntityIds || []),
        ...(claim.queueShard?.authoritativeEntityIds || []),
        ...(claim.resolvedEntities || []).map((entity) => entity?.entityId),
        ...(claim.unresolvedEntities || []).map((entity) => entity?.entityId)
    ].filter(Boolean).map(String));
}

function safeRepositoryFile(relativeOrAbsolute) {
    if (!relativeOrAbsolute) return null;
    const file = path.resolve(repositoryRoot, String(relativeOrAbsolute));
    const relative = path.relative(repositoryRoot, file);
    if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
    return file;
}

function providerPassiveFields(raw) {
    if (!raw || typeof raw !== "object") return [];
    return Object.keys(raw)
        .filter((key) => /^passive\d+$/.test(key))
        .sort((left, right) => Number(left.slice(7)) - Number(right.slice(7)))
        .map((key) => {
            const value = raw[key] || {};
            const description = typeof value.description === "string" ? value.description : null;
            const descriptionRaw = typeof value.descriptionRaw === "string" ? value.descriptionRaw : null;
            return {
                key,
                ordinal: Number(key.slice(7)),
                name: typeof value.name === "string" ? value.name : null,
                sourceId: typeof value.sourceId === "string" ? value.sourceId : null,
                sourceOwnedBridge: value.sourceOwnedBridge === true,
                fieldLocators: [
                    {
                        field: `${key}.name`,
                        jsonPointer: jsonPointer(key, "name"),
                        rawValueDigest: value.name === undefined ? null : sha256Text(value.name)
                    },
                    {
                        field: `${key}.description`,
                        jsonPointer: jsonPointer(key, "description"),
                        rawValueDigest: description === null ? null : sha256Text(description)
                    },
                    {
                        field: `${key}.descriptionRaw`,
                        jsonPointer: jsonPointer(key, "descriptionRaw"),
                        rawValueDigest: descriptionRaw === null ? null : sha256Text(descriptionRaw)
                    }
                ],
                fieldDigest: digestStable({ key, name: value.name ?? null, description, descriptionRaw })
            };
        });
}

function providerRecordEvidence(metadata, expectedGameVersion, versionBinding, cache) {
    if (!metadata || typeof metadata !== "object") {
        return { status: "missingMetadata", gameVersion: expectedGameVersion, fieldLocators: [] };
    }
    const bindingPackage = versionBinding?.package || null;
    // Include the expected version and every binding input in the cache key;
    // otherwise a malformed claim could reuse an earlier valid path result.
    const key = digestStable({ metadata, expectedGameVersion, versionBinding });
    if (cache.has(key)) return clone(cache.get(key));
    const file = safeRepositoryFile(metadata.path);
    const integrity = fileIntegrity(file);
    let raw = null;
    let parseStatus = "missing";
    if (integrity.exists) {
        try {
            raw = readJson(file);
            parseStatus = "parsed";
        } catch {
            parseStatus = "malformed";
        }
    }
    const actualGitBlob = integrity.exists ? gitBlobSha1(fs.readFileSync(file)) : null;
    const metadataDigestMatches = Boolean(
        integrity.exists
        && Number(metadata.rawArtifactBytes) === integrity.bytes
        && String(metadata.rawArtifactSha256 || "") === integrity.sha256
    );
    const rawGitBlobMatches = Boolean(
        integrity.exists
        && typeof metadata.gitBlob === "string"
        && metadata.gitBlob === actualGitBlob
    );
    const packageFile = safeRepositoryFile(bindingPackage?.path);
    const packageIntegrity = fileIntegrity(packageFile);
    let packageJson = null;
    let packageParseStatus = "missing";
    if (packageIntegrity.exists) {
        try {
            packageJson = readJson(packageFile);
            packageParseStatus = "parsed";
        } catch {
            packageParseStatus = "malformed";
        }
    }
    const packageBytesMatch = Boolean(
        packageIntegrity.exists
        && Number(bindingPackage?.rawArtifactBytes) === packageIntegrity.bytes
        && String(bindingPackage?.rawArtifactSha256 || "") === packageIntegrity.sha256
    );
    const packageGitBlob = packageIntegrity.exists ? gitBlobSha1(fs.readFileSync(packageFile)) : null;
    const packageGitBlobMatches = Boolean(
        packageIntegrity.exists
        && typeof bindingPackage?.gitBlob === "string"
        && bindingPackage.gitBlob === packageGitBlob
    );
    const packageVersionMatches = Boolean(
        packageParseStatus === "parsed"
        && packageJson?.name === bindingPackage?.name
        && packageJson?.version === bindingPackage?.packageVersion
        && packageJson?.name === "genshin-db"
        && typeof packageJson?.description === "string"
        && packageJson.description.includes(`Genshin Impact v${expectedGameVersion} JSON data`)
    );
    const knownPin = KNOWN_PROVIDER_PINS[expectedGameVersion] || null;
    const knownRevisionMatches = Boolean(knownPin && metadata.revision === knownPin.revision);
    const knownPackageMatches = Boolean(
        knownPin
        && bindingPackage?.name === knownPin.provider
        && bindingPackage?.gameVersion === expectedGameVersion
        && bindingPackage?.revision === knownPin.revision
        && bindingPackage?.packageVersion === knownPin.packageVersion
        && Number(bindingPackage?.rawArtifactBytes) === knownPin.packageBytes
        && bindingPackage?.rawArtifactSha256 === knownPin.packageSha256
        && bindingPackage?.gitBlob === knownPin.packageGitBlob
        && packageIntegrity.bytes === knownPin.packageBytes
        && packageIntegrity.sha256 === knownPin.packageSha256
        && packageGitBlob === knownPin.packageGitBlob
    );
    const pathAfterRevision = typeof metadata.path === "string" && typeof metadata.revision === "string"
        ? metadata.path.split(`/${metadata.revision}/`)[1] || null
        : null;
    const providerLayoutMatches = Boolean(
        typeof metadata.path === "string"
        && typeof metadata.revision === "string"
        && /^games\/genshin\/data\/v2\/version-transitions\/6\.7-to-7\.0\/sources\/genshin-db(?:-[^/]+)?\/[0-9a-f]{40}\/English\/(?:talents|constellations)\/[^/]+\.json$/.test(metadata.path)
        && pathAfterRevision
        && /^(?:English)\/(?:talents|constellations)\/[^/]+\.json$/.test(pathAfterRevision)
    );
    const providerPathSuffixMatches = Boolean(
        providerLayoutMatches
        && metadata.providerPath
        && metadata.path.endsWith(`/${String(metadata.providerPath).replace(/^src\/data\//, "")}`)
    );
    const providerPathEvidence = providerPathSuffixMatches
        ? "explicitProviderPathSuffix"
        : providerLayoutMatches
            ? "pinnedRepositoryLayoutDerivedProviderPath"
            : "missingOrInvalidProviderPath";
    const pathRevisionMatches = Boolean(
        typeof metadata.path === "string"
        && typeof metadata.revision === "string"
        && metadata.path.includes(`/${metadata.revision}/`)
        && (!metadata.providerPath
            || metadata.path.endsWith(`/${String(metadata.providerPath).replace(/^src\/data\//, "")}`))
        && bindingPackage?.path
        && metadata.path.includes(`/${metadata.revision}/`)
        && String(bindingPackage.path).includes(`/${metadata.revision}/`)
    );
    const revisionBindingMatches = Boolean(
        versionBinding
        && versionBinding.gameVersion === expectedGameVersion
        && versionBinding.revision === metadata.revision
        && versionBinding.packageVersion === metadata.packageVersion
        && versionBinding.status === "strictlyBound"
        && bindingPackage?.gameVersion === expectedGameVersion
        && bindingPackage?.revision === metadata.revision
        && bindingPackage?.packageVersion === metadata.packageVersion
    );
    const strictGameVersionBindingEvidence = Boolean(
        parseStatus === "parsed"
        && metadataDigestMatches
        && rawGitBlobMatches
        && packageParseStatus === "parsed"
        && packageBytesMatch
        && packageGitBlobMatches
        && packageVersionMatches
        && pathRevisionMatches
        && revisionBindingMatches
        && knownRevisionMatches
        && knownPackageMatches
        && providerLayoutMatches
        && typeof metadata.gameVersion === "string"
        && metadata.gameVersion === expectedGameVersion
        && typeof metadata.revision === "string"
        && /^[0-9a-f]{40}$/.test(metadata.revision)
        && typeof metadata.path === "string"
        && typeof metadata.rawArtifactSha256 === "string"
    );
    const result = {
        status: parseStatus !== "parsed"
            ? parseStatus
            : !metadataDigestMatches || !rawGitBlobMatches
                ? "integrityMismatch"
                : !strictGameVersionBindingEvidence
                    ? "versionBindingUnbound"
                    : "integrityVerified",
        path: metadata.path ?? null,
        providerPath: metadata.providerPath ?? null,
        gameVersion: metadata.gameVersion ?? null,
        expectedGameVersion,
        revision: metadata.revision ?? null,
        packageVersion: metadata.packageVersion ?? null,
        providerRecordId: metadata.providerRecordId ?? null,
        gitBlob: metadata.gitBlob ?? null,
        declaredIntegrity: {
            bytes: metadata.rawArtifactBytes ?? null,
            sha256: metadata.rawArtifactSha256 ?? null,
            gitBlob: metadata.gitBlob ?? null
        },
        actualIntegrity: integrity,
        metadataDigestMatches,
        actualGitBlob,
        rawGitBlobMatches,
        knownPin: clone(knownPin),
        knownRevisionMatches,
        knownPackageMatches,
        providerLayoutMatches,
        providerPathEvidence,
        packageManifest: {
            path: bindingPackage?.path ?? null,
            declaredIntegrity: {
                bytes: bindingPackage?.rawArtifactBytes ?? null,
                sha256: bindingPackage?.rawArtifactSha256 ?? null,
                gitBlob: bindingPackage?.gitBlob ?? null
            },
            actualIntegrity: packageIntegrity,
            actualGitBlob: packageGitBlob,
            parseStatus: packageParseStatus,
            bytesMatch: packageBytesMatch,
            gitBlobMatches: packageGitBlobMatches,
            versionMatches: packageVersionMatches
        },
        pathRevisionMatches,
        revisionBindingMatches,
        strictGameVersionBindingEvidence,
        rawRecordDigest: raw ? digestStable(raw) : null,
        fieldLocators: providerPassiveFields(raw)
    };
    cache.set(key, result);
    return clone(result);
}

function entityCoverageStatus(snapshot, entityId) {
    const coverage = snapshot?.claim?.coverage || {};
    const id = String(entityId);
    if ((coverage.resolvedEntityIds || []).map(String).includes(id)) return "resolved";
    if ((coverage.ambiguousEntityIds || []).map(String).includes(id)) return "ambiguous";
    if ((coverage.entityIds || []).map(String).includes(id)) return "affected";
    return transitionEntityIds(snapshot).has(id) ? "present" : "missing";
}

function transitionSnapshotForEntity(entry, entityId, providerCache) {
    const snapshot = entry.snapshot || {};
    const claim = snapshot.claim || {};
    const id = String(entityId);
    const coverageStatus = entityCoverageStatus(snapshot, id);
    const resolved = (claim.resolvedEntities || []).filter((entity) => String(entity?.entityId) === id);
    const variants = TRAVELER_ENTITY_IDS.has(id) && coverageStatus === "ambiguous"
        ? (claim.travelerVariantEvidence || [])
        : [];
    if (!resolved.length && !variants.length) return null;
    const providerRecords = [];
    for (const entity of resolved) {
        for (const record of entity.records || []) {
            if (record?.recordKind !== "talents") continue;
            providerRecords.push({
                variant: null,
                recordKind: record.recordKind,
                before: providerRecordEvidence(
                    record.before,
                    "6.7",
                    (claim.versionBindings || []).find((binding) => binding.gameVersion === "6.7" && binding.revision === record.before?.revision),
                    providerCache
                ),
                after: providerRecordEvidence(
                    record.after,
                    "7.0",
                    (claim.versionBindings || []).find((binding) => binding.gameVersion === "7.0" && binding.revision === record.after?.revision),
                    providerCache
                )
            });
        }
    }
    for (const variant of variants) {
        for (const record of variant.records || []) {
            if (record?.recordKind !== "talents") continue;
            providerRecords.push({
                variant: variant.variant ?? null,
                recordKind: record.recordKind,
                before: providerRecordEvidence(
                    record.before,
                    "6.7",
                    (claim.versionBindings || []).find((binding) => binding.gameVersion === "6.7" && binding.revision === record.before?.revision),
                    providerCache
                ),
                after: providerRecordEvidence(
                    record.after,
                    "7.0",
                    (claim.versionBindings || []).find((binding) => binding.gameVersion === "7.0" && binding.revision === record.after?.revision),
                    providerCache
                )
            });
        }
    }
    const allRecords = providerRecords.flatMap((record) => [record.before, record.after]);
    const afterRecords = providerRecords.map((record) => record.after);
    const fieldCount = allRecords.reduce((sum, record) => sum + (record.fieldLocators?.length || 0), 0);
    const providerSlugs = uniqueSorted([
        ...resolved.map((entity) => entity?.providerSlug),
        ...variants.map((variant) => variant?.providerSlug)
    ]);
    return {
        path: relativePath(entry.file),
        fileIntegrity: fileIntegrity(entry.file),
        kind: snapshot.kind ?? null,
        transitionId: claim.transitionId ?? null,
        sourceFamily: claim.sourceFamily ?? null,
        provider: claim.provider ?? null,
        sourceFamilyCount: claim.sourceFamilyCount ?? snapshot.summary?.sourceFamilyCount ?? null,
        coverageStatus,
        entityResolutionStatus: resolved.length ? "resolved" : "ambiguousVariant",
        providerSlugs,
        variantNames: uniqueSorted(variants.map((variant) => variant.variant)),
        observedSnapshotFieldDigest: snapshot.fieldDigest ?? null,
        providerRecords,
        providerFieldCount: fieldCount,
        strictGameVersionBindingEvidence: afterRecords.length > 0 && afterRecords.every((record) => record.strictGameVersionBindingEvidence),
        rawProviderEvidenceAvailable: providerRecords.length > 0 && providerRecords.some((record) => (record.after.fieldLocators || []).length > 0),
        gateMetadataObserved: clone(snapshot.gateEligibility ?? null),
        gateMetadataAcceptedAsProof: false
    };
}

function transitionEvidenceForEntity(entityId, snapshots, providerCache) {
    return snapshots
        .map((entry) => transitionSnapshotForEntity(entry, entityId, providerCache))
        .filter(Boolean)
        .sort((left, right) => left.path.localeCompare(right.path));
}

function allProviderFields(transitionEvidence) {
    return transitionEvidence.flatMap((snapshot) => snapshot.providerRecords.flatMap((record) => {
        const versions = [
            ["6.7", record.before],
            ["7.0", record.after]
        ];
        return versions.flatMap(([gameVersion, evidence]) => (evidence.fieldLocators || []).map((field) => ({
            variant: record.variant,
            gameVersion,
            path: evidence.path,
            key: field.key,
            ordinal: field.ordinal,
            name: field.name,
            sourceId: field.sourceId,
            sourceOwnedBridge: field.sourceOwnedBridge,
            fieldDigest: field.fieldDigest,
            fieldLocators: clone(field.fieldLocators)
        })));
    })).sort((left, right) => `${left.path}:${left.gameVersion}:${left.key}:${left.variant || ""}`
        .localeCompare(`${right.path}:${right.gameVersion}:${right.key}:${right.variant || ""}`));
}

function localizedCaptureValidation(snapshot) {
    const reasons = [];
    if (!snapshot || typeof snapshot !== "object") reasons.push("snapshotMissing");
    if (snapshot?.kind !== "genshinVersionTransitionTalentGapLocalizedFieldCapture") reasons.push("snapshotKindInvalid");
    if (snapshot?.status !== "localizedFieldBridgeCaptured") reasons.push("snapshotStatusInvalid");
    if (snapshot?.fieldDigestAlgorithm !== "sha256-stable-json-v1" || snapshot?.fieldDigest !== digestStable(snapshot?.claim)) reasons.push("snapshotDigestInvalid");
    if (snapshot?.claim?.transitionId !== "genshin:6.7->7.0"
        || snapshot?.claim?.provider !== "genshin-db"
        || snapshot?.claim?.sourceFamily !== "GenshinData-derived"
        || snapshot?.claim?.sourceNamespace !== "genshin-db-talent-gap-localized-field-bridge-standard01"
        || snapshot?.claim?.recordKind !== "talents") reasons.push("snapshotBindingInvalid");
    const bridges = Array.isArray(snapshot?.claim?.candidateBridges) ? snapshot.claim.candidateBridges : [];
    if (bridges.length !== 63 || new Set(bridges.map((bridge) => bridge?.candidateId)).size !== bridges.length) reasons.push("snapshotBridgeInventoryInvalid");
    for (const bridge of bridges) {
        if (TRAVELER_ENTITY_IDS.has(String(bridge?.entityId))
            || bridge?.status !== "exactLocalizedNameProviderKey"
            || bridge?.safeExactMapping !== true
            || !/^passive\d+$/.test(String(bridge?.providerFieldKey || ""))
            || bridge?.noOrdinalInference !== true
            || bridge?.noTransliterationInference !== true
            || bridge?.noSemanticInference !== true
            || bridge?.revisions?.before?.status !== "exactLocalizedNameProviderKey"
            || bridge?.revisions?.after?.status !== "exactLocalizedNameProviderKey"
            || bridge?.revisions?.before?.sameProviderFieldKey !== true
            || bridge?.revisions?.after?.sameProviderFieldKey !== true
            || bridge?.revisions?.before?.providerFieldKey !== bridge.providerFieldKey
            || bridge?.revisions?.after?.providerFieldKey !== bridge.providerFieldKey
            || bridge?.revisions?.before?.providerJapaneseField?.key !== bridge.providerFieldKey
            || bridge?.revisions?.after?.providerJapaneseField?.key !== bridge.providerFieldKey
            || bridge?.revisions?.before?.providerEnglishField?.key !== bridge.providerFieldKey
            || bridge?.revisions?.after?.providerEnglishField?.key !== bridge.providerFieldKey) reasons.push(`bridgeEvidenceInvalid:${bridge?.candidateId || "unknown"}`);
    }
    if (reasons.length > 0) return { valid: false, reasons: [...new Set(reasons)] };
    let result;
    try {
        result = localizedCaptureModule.validateSnapshot(snapshot, { compareCurrent: true });
    } catch (error) {
        result = { valid: false, reasons: [`validatorError:${error.message}`] };
    }
    const normalized = { valid: result.valid === true, reasons: [...new Set(result.reasons || [])] };
    return clone(normalized);
}

function localizedBridgeMatchesEvidence(bridge, passiveSourceId, entityId, localNameJa, fields) {
    if (!bridge || bridge.entityId !== String(entityId) || bridge.status !== "exactLocalizedNameProviderKey" || bridge.safeExactMapping !== true) return false;
    if (bridge.localField?.sourceId !== passiveSourceId || bridge.localField?.nameJa !== localNameJa || bridge.localField?.nameJaDigest !== digestStable(localNameJa)) return false;
    if (!/^passive\d+$/.test(String(bridge.providerFieldKey || ""))) return false;
    if (bridge.noOrdinalInference !== true || bridge.noTransliterationInference !== true || bridge.noSemanticInference !== true) return false;
    for (const [side, gameVersion] of [["before", "6.7"], ["after", "7.0"]]) {
        const evidence = bridge.revisions?.[side];
        if (evidence?.status !== "exactLocalizedNameProviderKey"
            || evidence.localizedMatchCount !== 1
            || evidence.sameProviderFieldKey !== true
            || evidence.providerFieldKey !== bridge.providerFieldKey
            || evidence.providerJapaneseField?.key !== bridge.providerFieldKey
            || evidence.providerEnglishField?.key !== bridge.providerFieldKey
            || evidence.providerJapaneseField?.name !== localNameJa) return false;
        const matchingEnglishFields = fields.filter((field) => field.variant === null
            && field.gameVersion === gameVersion
            && field.key === bridge.providerFieldKey
            && field.fieldDigest === evidence.providerEnglishField.fieldDigest);
        if (matchingEnglishFields.length === 0) return false;
    }
    return true;
}

function providerFieldMapping(passiveSourceId, entityId, transitionEvidence, localizedFieldCapture = null, candidateId = null, localNameJa = null, localizedCaptureIsValid = false) {
    const fields = allProviderFields(transitionEvidence);
    const ordinalMatch = /^passive_(\d+)$/.exec(String(passiveSourceId || ""));
    const normalizedLocal = String(passiveSourceId || "").replace(/_/g, "");
    // An internal provider key/sourceId is not itself a cross-locale bridge.
    // Only an explicitly source-owned bridge marker can make a mapping exact;
    // the current genshin-db records carry no such marker.
    const directMatches = fields.filter((field) => field.sourceId === passiveSourceId && field.sourceOwnedBridge === true);
    const normalizedOrdinalMatches = ordinalMatch
        ? fields.filter((field) => field.key === `passive${ordinalMatch[1]}`)
        : [];
    let status = "unresolvedLabelBridge";
    let reason = "Local Japanese sourceId and provider English passive field have no validated cross-locale mapping evidence; ordinal normalization is observed only and not accepted as a mapping.";
    let localizedBridge = null;
    if (TRAVELER_ENTITY_IDS.has(String(entityId))) {
        status = "ambiguousVariant";
        reason = "Provider records are keyed by Traveler element variants while local IDs 10000005/10000007 share the display name 旅人; variant identity and passive field bridge are unresolved.";
    } else if (directMatches.length > 0) {
        status = "exactSourceOwnedLabel";
        reason = "Provider field carries an explicit source-owned label equal to the local passive sourceId.";
    } else if (localizedCaptureIsValid) {
        localizedBridge = (localizedFieldCapture?.claim?.candidateBridges || []).find((bridge) => String(bridge?.candidateId) === String(candidateId)) || null;
        if (localizedBridgeMatchesEvidence(localizedBridge, passiveSourceId, entityId, localNameJa, fields)) {
            status = "exactLocalizedNameProviderKey";
            reason = "Validated localized capture proves one exact Japanese passive name and the same provider English field key in both pinned revisions; this is an identity/key bridge only, not an independent semantic claim source.";
        } else {
            localizedBridge = null;
        }
    }
    return {
        status,
        safeExactMapping: EXACT_MAPPING_STATUSES.has(status),
        passiveSourceId: passiveSourceId ?? null,
        normalizedLocalSourceId: normalizedLocal,
        directMatches: directMatches.map((field) => ({ path: field.path, gameVersion: field.gameVersion, key: field.key })),
        localizedBridge: localizedBridge ? clone(localizedBridge) : null,
        ordinalRelationObserved: ordinalMatch ? {
            localOrdinal: Number(ordinalMatch[1]),
            providerKeys: uniqueSorted(normalizedOrdinalMatches.map((field) => field.key)),
            acceptedAsProof: false
        } : null,
        candidateProviderFields: fields.map((field) => ({
            variant: field.variant,
            gameVersion: field.gameVersion,
            path: field.path,
            key: field.key,
            ordinal: field.ordinal,
            name: field.name,
            sourceId: field.sourceId,
            sourceOwnedBridge: field.sourceOwnedBridge,
            fieldDigest: field.fieldDigest,
            fieldLocators: field.fieldLocators
        })),
        reason,
        inferencePerformed: false
    };
}

function mapperObservation(entityId, identityAudit) {
    const record = (identityAudit?.records || []).find((item) => String(item?.id) === String(entityId)) || null;
    const classification = record?.classification ?? "missingIdentityAuditRecord";
    let status = "missing";
    if (TRAVELER_ENTITY_IDS.has(String(entityId))) status = "ambiguousVariant";
    else if (classification === "match") status = "mapped";
    else if (classification === "mapperMissing") status = "missing";
    else if (classification === "mapperNameMismatch" || classification === "mapperDuplicateDisagreement" || classification === "malformedEvidence") status = "mismatch";
    return {
        status,
        classification,
        mapperObservedNames: clone(record?.mapperObservedNames || []),
        mapperSourceStatus: record?.evidence?.mapperSourceStatus ?? null,
        sourceTextStatus: record?.sourceTextStatus ?? null,
        identityRecordDigest: record ? digestStable(record) : null,
        reason: status === "ambiguousVariant"
            ? "Legacy consumer mapping exposes the shared 旅人 label but does not select a Traveler element variant."
            : status === "missing"
                ? "No exact legacy consumer mapper entry was observed; this is a consumer coverage gap, not a source mismatch."
                : status === "mismatch"
                    ? "Consumer identity evidence is not a clear match; fail closed."
                    : "Exact local catalog name was observed in the identity audit." 
    };
}

function registryMatches(items, candidateId) {
    return (Array.isArray(items) ? items : [])
        .filter((item) => ["candidateId", "subjectId", "claimId", "certificateId", "attestationId"].some((key) => String(item?.[key] ?? "") === String(candidateId))
            || String(item?.subjectId ?? "").startsWith(`${candidateId}:`)
            || String(item?.certificateId ?? item?.attestationId ?? "").startsWith(`${candidateId}:`))
        .map((item) => ({
            id: item.certificateId ?? item.attestationId ?? item.claimId ?? null,
            status: item.status ?? null,
            targetGameVersion: item.targetGameVersion ?? null,
            strictEligibleObserved: item.strictEligible === true,
            acceptedAsProof: false
        }))
        .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function queueCertificateObservation(task) {
    const certificate = task?.certificate;
    return {
        status: certificate?.status ?? "missing",
        strictEligibleObserved: certificate?.strictEligible === true,
        strictGameVersionBindingObserved: certificate?.strictGameVersionBinding === true,
        sourceStrictGameVersionBindingObserved: certificate?.sourceStrictGameVersionBinding === true,
        revisionPinnedObserved: certificate?.revisionPinned === true,
        sourceRecordDigestBoundObserved: certificate?.sourceRecordDigestBound === true,
        eligibleClaimCount: certificate?.eligibleClaimCount ?? 0,
        blockedClaimCount: certificate?.blockedClaimCount ?? 0,
        acceptedAsProof: false
    };
}

function buildCandidate(id, inputs, providerCache, localizedCaptureCheck) {
    const queueTask = (inputs.queue?.tasks || []).find((task) => String(task?.candidateId) === String(id)) || null;
    const local = localCandidateEvidence(id, inputs);
    const transitionSnapshots = transitionEvidenceForEntity(local.entityId, inputs.transitionSnapshots || [], providerCache);
    const providerFields = allProviderFields(transitionSnapshots);
    const providerEvidenceStatus = transitionSnapshots.length === 0
        ? "missing"
        : providerFields.length === 0
            ? "snapshotPresentNoPassiveFields"
            : TRAVELER_ENTITY_IDS.has(String(local.entityId))
                ? "availableButVariantAmbiguous"
                : "available";
    const strictTargetBinding = transitionSnapshots.length > 0
        && transitionSnapshots.some((snapshot) => snapshot.providerRecords.length > 0)
        && transitionSnapshots.every((snapshot) => snapshot.strictGameVersionBindingEvidence);
    const passiveSourceId = local.spec.id ? local.spec.id.split(":").slice(2).join(":") : null;
    const localPassive = inputs.characterTalents?.[String(local.entityId)]?.passives?.[local.source.fieldLocator.passiveIndex] || null;
    const providerMapping = providerFieldMapping(
        passiveSourceId,
        local.entityId,
        transitionSnapshots,
        inputs.localizedFieldCapture,
        id,
        localPassive?.nameJa ?? null,
        localizedCaptureCheck?.valid === true
    );
    const consumer = mapperObservation(local.entityId, inputs.identityAudit);
    const certificates = registryMatches(inputs.eligibilityCertificates?.certificates, id);
    const attestations = registryMatches(inputs.deterministicAttestations?.attestations, id);
    const canonicalEntry = inputs.canonicalRuntime?.modifiers?.[id]
        || inputs.canonicalRuntime?.talentGaps?.[id]
        || inputs.canonicalRuntime?.effects?.[id]
        || null;
    const localValid = local.source.status === "verified" && local.spec.present && local.spec.effect.allFieldsUnknown && !local.spec.effect.numericValueObserved;
    const variantAmbiguity = TRAVELER_ENTITY_IDS.has(String(local.entityId));
    let workStatus = "providerFieldMappingUnresolved";
    if (!localValid) workStatus = "localEvidenceInvalid";
    else if (variantAmbiguity) workStatus = "travelerVariantIdentityUnresolved";
    else if (providerEvidenceStatus === "missing") workStatus = "providerEvidenceMissing";
    else if (providerEvidenceStatus === "snapshotPresentNoPassiveFields") workStatus = "providerPassiveFieldMissing";
    else if (EXACT_MAPPING_STATUSES.has(providerMapping.status)) workStatus = "semanticDecisionRequired";
    const nextTasks = [];
    if (workStatus === "travelerVariantIdentityUnresolved") nextTasks.push({
        kind: "identityMapping",
        status: "required",
        deliverable: "Bind local Traveler entity 10000005 or 10000007 to an explicitly named provider element variant; do not collapse variants."
    });
    if ((providerEvidenceStatus === "available" || providerEvidenceStatus === "availableButVariantAmbiguous") && !EXACT_MAPPING_STATUSES.has(providerMapping.status)) nextTasks.push({
        kind: "localizedFieldBridge",
        status: "required",
        deliverable: "Acquire an immutable, version-bound Japanese/provider field bridge for this passive; provider English passive fields are inventoried but ordinal normalization is not proof.",
        entityId: local.entityId,
        providerSlugs: uniqueSorted(transitionSnapshots.flatMap((snapshot) => snapshot.providerSlugs || [])),
        providerFields: uniqueSorted(providerFields.map((field) => field.key)),
        localField: local.source.fieldLocator.field
    });
    if (providerEvidenceStatus === "missing" || providerEvidenceStatus === "snapshotPresentNoPassiveFields") nextTasks.push({
        kind: "providerFieldAcquisition",
        status: "required",
        deliverable: "Acquire the missing exact provider passive field record with immutable revision, raw digest, and strict gameVersion binding."
    });
    nextTasks.push({
        kind: "semanticReview",
        status: "deferred",
        deliverable: "Only after a field-level independent source bridge is established, structure effect kind/target/condition/value/timing; this audit performs no semantic inference."
    });
    return {
        id,
        entityId: local.entityId,
        characterNameJa: local.characterNameJa,
        inventory: {
            queueTaskId: queueTask?.task?.taskId ?? null,
            queueTerminalState: queueTask?.terminalState ?? null,
            queuePrimaryBlockReason: queueTask?.primaryBlockReason ?? null,
            queueBlockReasons: uniqueSorted(queueTask?.blockReasons || []),
            queueMappingStatus: queueTask?.mappingStatus ?? null,
            queueConsumerStatus: queueTask?.consumerStatus ?? null,
            queueAutoProcessableNow: queueTask?.autoProcessableNow === true
        },
        localEvidence: local,
        transitionEvidence: {
            targetGameVersion: "7.0",
            fromGameVersion: "6.7",
            provider: uniqueSorted(transitionSnapshots.map((snapshot) => snapshot.provider)),
            providerSlugs: uniqueSorted(transitionSnapshots.flatMap((snapshot) => snapshot.providerSlugs || [])),
            sourceFamilies: uniqueSorted(transitionSnapshots.map((snapshot) => snapshot.sourceFamily)),
            sourceFamilyCount: new Set(transitionSnapshots.map((snapshot) => snapshot.sourceFamily).filter(Boolean)).size,
            snapshotCount: transitionSnapshots.length,
            snapshots: transitionSnapshots,
            providerEvidenceStatus,
            providerFieldCount: providerFields.length,
            strictGameVersionBindingEvidence: strictTargetBinding,
            metadataGateAcceptedAsProof: false
        },
        fieldMapping: providerMapping,
        consumerMapping: consumer,
        certificate: {
            queue: queueCertificateObservation(queueTask),
            registryCount: certificates.length,
            registry: certificates,
            acceptedAsProof: false,
            strictEligible: false
        },
        attestation: {
            registryCount: attestations.length,
            registry: attestations,
            acceptedAsProof: false,
            qualifying: false
        },
        canonical: {
            present: Boolean(canonicalEntry),
            runtimeStatus: canonicalEntry?.runtime?.status ?? null,
            activeForProduction: canonicalEntry?.provenance?.status === "canonical"
                && canonicalEntry?.runtime?.status === "activeForProduction",
            promotionEligible: false,
            acceptedAsProof: false
        },
        workPacket: {
            status: workStatus,
            evidenceAvailable: providerEvidenceStatus === "available" || providerEvidenceStatus === "availableButVariantAmbiguous",
            mappingUnresolved: !EXACT_MAPPING_STATUSES.has(providerMapping.status),
            travelerVariantAmbiguous: variantAmbiguity,
            semanticDecisionRequired: true,
            noInference: true,
            requiredFieldGaps: local.requiredFieldGaps,
            nextExecutableTasks: nextTasks
        },
        observedSourceMetadata: {
            localProviderIndependence: local.source.providerIndependence,
            localIndependenceGroup: local.source.independenceGroup,
            independentFieldAgreement: false,
            reason: "The local SourceRecord is a single damageTool-local correlated family; the validated localized bridge and provider snapshot are one GenshinData-derived family and are not an independent second field claim."
        },
        classification: {
            status: workStatus,
            sourceEvidenceStatus: local.source.status,
            providerEvidenceStatus,
            providerFieldMappingStatus: providerMapping.status,
            consumerMappingStatus: consumer.status,
            travelerVariant: variantAmbiguity ? "ambiguous" : "notApplicable",
            sourceFamilyCount: new Set(transitionSnapshots.map((snapshot) => snapshot.sourceFamily).filter(Boolean)).size,
            strictGameVersionBindingEvidence: strictTargetBinding,
            semanticDecisionRequired: true,
            inferencePerformed: false,
            certificateEligible: false,
            canonicalPromotionEligible: false,
            canonicalPromotion: "forbidden"
        }
    };
}

function withoutDigest(value) {
    const result = clone(value);
    if (result && typeof result === "object") {
        delete result.fieldDigest;
        delete result.fieldDigestAlgorithm;
    }
    return result;
}

function buildAudit({ inputs, queue } = {}) {
    const currentInputs = inputs
        ? { ...inputs, ...(queue === undefined ? {} : { queue }) }
        : loadInputsWithQueue(queue);
    const currentQueue = currentInputs.queue;
    const candidateIds = laneCandidateIds(currentQueue);
    const queueProjection = queueInputProjection(currentQueue);
    const providerCache = new Map();
    const localizedCaptureCheck = localizedCaptureValidation(currentInputs.localizedFieldCapture);
    const candidates = candidateIds.map((id) => buildCandidate(id, currentInputs, providerCache, localizedCaptureCheck));
    const taskById = new Map((currentQueue?.tasks || []).map((task) => [String(task?.candidateId), task]));
    const transitionPaths = uniqueSorted(candidates.flatMap((candidate) => candidate.transitionEvidence.snapshots.map((snapshot) => snapshot.path)));
    const sourceRefs = uniqueSorted(candidates.flatMap((candidate) => [candidate.localEvidence.source.sourceRecordId]));
    const generatedFrom = {
        talentGapArtifact: generatedInput(paths.talentGapArtifact),
        characters: generatedInput(paths.characters),
        characterTalents: generatedInput(paths.characterTalents),
        consumerMapper: generatedInput(paths.mapper),
        authoritativeQueue: {
            path: relativePath(paths.queue),
            projectionVersion: queueProjection.projectionVersion,
            projectionFields: [...QUEUE_PROJECTION_KEYS],
            candidateCount: queueProjection.candidateIds.length,
            taskCount: queueProjection.tasks.filter(Boolean).length,
            projectionDigest: digestStable(queueProjection)
        },
        localizedFieldCapture: generatedInput(paths.localizedFieldCapture),
        transitionSnapshots: transitionPaths.map((snapshotPath) => generatedInput(path.join(repositoryRoot, snapshotPath)))
    };
    const errors = [];
    const entityIds = uniqueSorted(candidates.map((candidate) => candidate.entityId));
    const expectedEntityMismatch = entityIds.length !== EXPECTED_ENTITY_IDS.length
        || entityIds.some((id) => !EXPECTED_ENTITY_SET.has(id))
        || EXPECTED_ENTITY_IDS.some((id) => !entityIds.includes(id));
    if (candidateIds.length !== EXPECTED_CANDIDATE_COUNT) errors.push(`candidateCount:${candidateIds.length}`);
    if (candidateIds.length !== new Set(candidateIds).size) errors.push("candidateIdsDuplicate");
    if (expectedEntityMismatch) errors.push("entityCoverageMismatch");
    if (candidates.some((candidate) => !candidate.entityId)) errors.push("entityIdMissing");
    if (candidates.some((candidate) => !taskById.has(candidate.id))) errors.push("queueTaskMissing");
    if (candidates.some((candidate) => candidate.localEvidence.source.status !== "verified")) errors.push("localSourceEvidenceInvalid");
    if (candidates.some((candidate) => !candidate.localEvidence.spec.present)) errors.push("talentGapSpecMissing");
    if (candidates.some((candidate) => !candidate.localEvidence.spec.effect.allFieldsUnknown || candidate.localEvidence.spec.effect.numericValueObserved)) errors.push("semanticInferenceOrNumericEffectObserved");
    if (candidates.some((candidate) => candidate.transitionEvidence.providerEvidenceStatus !== "missing"
        && candidate.transitionEvidence.snapshotCount > 0
        && candidate.transitionEvidence.strictGameVersionBindingEvidence !== true)) errors.push("providerVersionBindingInvalid");
    if (!localizedCaptureCheck.valid) errors.push("localizedFieldCaptureInvalid");
    if (candidates.some((candidate) => candidate.certificate.strictEligible || candidate.certificate.acceptedAsProof)) errors.push("certificateGateUnexpected");
    if (candidates.some((candidate) => candidate.attestation.qualifying || candidate.attestation.acceptedAsProof)) errors.push("attestationGateUnexpected");
    if (candidates.some((candidate) => candidate.canonical.promotionEligible || candidate.canonical.activeForProduction)) errors.push("canonicalGateUnexpected");
    if (candidates.some((candidate) => candidate.workPacket.mappingUnresolved === false && !EXACT_MAPPING_STATUSES.has(candidate.classification.providerFieldMappingStatus))) errors.push("mappingClassificationInvalid");
    const providerEvidenceStatuses = candidates.map((candidate) => candidate.transitionEvidence.providerEvidenceStatus);
    const mappingStatuses = candidates.map((candidate) => candidate.fieldMapping.status);
    const workStatuses = candidates.map((candidate) => candidate.workPacket.status);
    const consumerStatuses = candidates.map((candidate) => candidate.consumerMapping.status);
    const localStatuses = candidates.map((candidate) => candidate.localEvidence.source.status);
    const strictCount = candidates.filter((candidate) => candidate.transitionEvidence.strictGameVersionBindingEvidence).length;
    const independentAgreementCount = candidates.filter((candidate) => candidate.observedSourceMetadata.independentFieldAgreement).length;
    const resultWithoutDigest = {
        schemaVersion: 1,
        kind: "genshinTalentGapLaneAudit",
        status: errors.length ? "failed" : "passed",
        generatedAt,
        scope: {
            ...lane,
            candidateCount: candidateIds.length,
            entityCount: entityIds.length,
            expectedEntityIds: [...EXPECTED_ENTITY_IDS]
        },
        policy: {
            valuesConditionsAndScope: "observedOnlyNoInference",
            semanticInference: "forbidden",
            canonicalPromotion: "forbidden",
            certificateAuthority: "strictCandidateClaimRegistryOnly",
            metadataBooleansNotEvidence: true,
            sourceAgreement: "candidateClaimFieldLevelIndependentAgreementRequired",
            independentSourceProof: "sourceOwnedLineageRawDigestAndStrictVersionBindingRequired",
            ordinalPassiveMapping: "forbiddenWithoutSourceOwnedBridge",
            localizedFieldBridge: "exactLocalizedNameToSameProviderEnglishKeyBothRevisions",
            travelerVariants: "separateAndFailClosed",
            queueMutation: "none",
            queueInputProjection: queueProjection.projectionVersion
        },
        generatedFrom,
        claim: {
            lane,
            candidateIds,
            candidateInventoryDigest: digestStable(candidateIds),
            entityIds,
            entityInventoryDigest: digestStable(entityIds),
            queueInputProjectionDigest: digestStable(queueProjection),
            queueTaskDigest: digestStable(queueProjection.tasks),
            sourceRefDigest: digestStable(sourceRefs),
            candidates
        },
        summary: {
            candidates: candidateIds.length,
            entities: entityIds.length,
            sourceRefs: sourceRefs.length,
            localSourceStatus: countBy(localStatuses),
            providerEvidenceStatus: countBy(providerEvidenceStatuses),
            providerFieldMappingStatus: countBy(mappingStatuses),
            consumerMappingStatus: countBy(consumerStatuses),
            workPacketStatus: countBy(workStatuses),
            travelerCandidates: candidates.filter((candidate) => candidate.workPacket.travelerVariantAmbiguous).length,
            providerEvidenceAvailable: candidates.filter((candidate) => candidate.workPacket.evidenceAvailable).length,
            providerStrictGameVersionBindingEvidence: strictCount,
            independentFieldAgreement: independentAgreementCount,
            unresolvedFieldMappings: candidates.filter((candidate) => candidate.workPacket.mappingUnresolved).length,
            semanticDecisionRequired: candidates.filter((candidate) => candidate.workPacket.semanticDecisionRequired).length,
            unknownEffectCandidates: candidates.filter((candidate) => candidate.localEvidence.spec.effect.allFieldsUnknown).length,
            certificateEligible: 0,
            canonicalPromotionEligible: 0,
            canonicalPromotion: 0,
            queueTasksMissing: candidates.filter((candidate) => !taskById.has(candidate.id)).length,
            transitionSnapshots: {
                uniqueFiles: transitionPaths.length,
                candidateReferences: candidates.reduce((sum, candidate) => sum + candidate.transitionEvidence.snapshotCount, 0),
                candidatesWithEvidence: candidates.filter((candidate) => candidate.transitionEvidence.snapshotCount > 0).length
            }
        },
        gate: {
            status: "failClosed",
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false,
            certificateEligible: 0,
            canonicalPromotionEligible: 0,
            reasons: uniqueSorted([
                "semanticDecisionRequired",
                "sourceMissing",
                "providerIndependenceCorrelated",
                "gameVersionBindingNotSufficientForIndependentAgreement",
                "queueMutationForbidden",
                ...(candidates.some((candidate) => candidate.workPacket.mappingUnresolved) ? ["providerFieldMappingUnresolved", "ordinalPassiveMappingForbiddenWithoutSourceOwnedBridge"] : []),
                ...(localizedCaptureCheck.valid ? [] : ["localizedFieldCaptureInvalid"]),
                ...candidates.filter((candidate) => candidate.workPacket.travelerVariantAmbiguous).map(() => "travelerVariantAmbiguous")
            ]),
            sourceAgreement: {
                independentFieldAgreementCandidates: independentAgreementCount,
                acceptedAsProof: false,
                reason: "Local damageTool-local-derived text and genshin-db/GenshinData-derived snapshots are not two independent candidate×claim field sources."
            },
            travelerVariants: {
                entityIds: [...TRAVELER_ENTITY_IDS],
                candidateCount: candidates.filter((candidate) => candidate.workPacket.travelerVariantAmbiguous).length,
                policy: "Keep 10000005 and 10000007 separate; never infer a variant or compare across variants."
            }
        },
        errors
    };
    return {
        ...resultWithoutDigest,
        fieldDigestAlgorithm: "sha256-stable-json-v1",
        fieldDigest: digestStable(resultWithoutDigest)
    };
}

function validateAudit(audit, { compareCurrent = true } = {}) {
    const reasons = [];
    if (!audit || typeof audit !== "object") reasons.push("artifactMissing");
    if (audit?.schemaVersion !== 1) reasons.push("schemaVersionInvalid");
    if (audit?.kind !== "genshinTalentGapLaneAudit") reasons.push("kindInvalid");
    if (audit?.scope?.shardId !== lane.shardId) reasons.push("laneInvalid");
    if (audit?.scope?.candidateCount !== EXPECTED_CANDIDATE_COUNT) reasons.push("candidateCountInvalid");
    if (audit?.fieldDigestAlgorithm !== "sha256-stable-json-v1") reasons.push("fieldDigestAlgorithmInvalid");
    if (audit?.fieldDigest !== digestStable(withoutDigest(audit))) reasons.push("fieldDigestInvalid");
    if (audit?.policy?.semanticInference !== "forbidden") reasons.push("inferencePolicyInvalid");
    if (audit?.policy?.ordinalPassiveMapping !== "forbiddenWithoutSourceOwnedBridge") reasons.push("ordinalMappingPolicyInvalid");
    if (audit?.policy?.localizedFieldBridge !== "exactLocalizedNameToSameProviderEnglishKeyBothRevisions") reasons.push("localizedBridgePolicyInvalid");
    if (audit?.policy?.canonicalPromotion !== "forbidden") reasons.push("promotionPolicyInvalid");
    if (audit?.gate?.status !== "failClosed" || audit?.gate?.canIssueEligibilityCertificate !== false || audit?.gate?.canPromoteCanonical !== false) reasons.push("gateNotFailClosed");
    if (audit?.summary?.certificateEligible !== 0 || audit?.summary?.canonicalPromotionEligible !== 0 || audit?.summary?.canonicalPromotion !== 0) reasons.push("promotionCountInvalid");
    const candidates = Array.isArray(audit?.claim?.candidates) ? audit.claim.candidates : [];
    const ids = candidates.map((candidate) => candidate?.id);
    if (ids.length !== EXPECTED_CANDIDATE_COUNT || new Set(ids).size !== ids.length) reasons.push("candidateInventoryInvalid");
    if (candidates.some((candidate) => candidate?.workPacket?.noInference !== true || candidate?.classification?.inferencePerformed !== false)) reasons.push("inferencePolicyCandidateInvalid");
    if (candidates.some((candidate) => candidate?.certificate?.strictEligible !== false || candidate?.certificate?.acceptedAsProof !== false || candidate?.attestation?.qualifying !== false || candidate?.canonical?.promotionEligible !== false)) reasons.push("candidateGateInvalid");
    if (candidates.some((candidate) => candidate?.localEvidence?.spec?.effect?.numericValueObserved === true)) reasons.push("numericEffectObserved");
    if (candidates.some((candidate) => EXACT_MAPPING_STATUSES.has(candidate?.fieldMapping?.status) && candidate?.fieldMapping?.safeExactMapping !== true)) reasons.push("mappingEvidenceInvalid");
    if (candidates.some((candidate) => candidate?.fieldMapping?.status === "exactLocalizedNameProviderKey" && !candidate?.fieldMapping?.localizedBridge)) reasons.push("localizedBridgeEvidenceMissing");
    if (audit?.policy?.metadataBooleansNotEvidence !== true) reasons.push("metadataBooleanPolicyInvalid");
    if (audit?.summary?.independentFieldAgreement !== 0) reasons.push("independentAgreementUnexpected");
    if (audit?.claim?.entityIds?.some((id) => !EXPECTED_ENTITY_SET.has(String(id))) || audit?.claim?.entityIds?.length !== EXPECTED_ENTITY_IDS.length) reasons.push("entityInventoryInvalid");
    if (compareCurrent) {
        try {
            const expected = buildAudit();
            if (stableJson(expected) !== stableJson(audit)) reasons.push("artifactNotDeterministicForCurrentInputs");
        } catch (error) {
            reasons.push(`currentInputsInvalid:${error.message}`);
        }
    }
    return { valid: reasons.length === 0, reasons };
}

function renderMarkdown(audit) {
    const summary = audit.summary || {};
    const statusRows = Object.entries(summary.workPacketStatus || {}).sort(([left], [right]) => left.localeCompare(right));
    const mappingRows = Object.entries(summary.providerFieldMappingStatus || {}).sort(([left], [right]) => left.localeCompare(right));
    return [
        "# Genshin talent-gap semantic lane audit",
        "",
        `Status: **${audit.status}**` ,
        "",
        `- shard: **${audit.scope?.shardId}**`,
        `- candidates/entities: **${summary.candidates || 0}/${summary.entities || 0}**`,
        `- local source records verified: **${summary.localSourceStatus?.verified || 0}**`,
        `- provider entity/field evidence available: **${summary.providerEvidenceAvailable || 0}** (field-level mapping remains separately gated)`,
        `- unresolved provider field mappings: **${summary.unresolvedFieldMappings || 0}**`,
        `- Traveler variant-ambiguous candidates: **${summary.travelerCandidates || 0}**`,
        `- strict candidate×claim certificate eligible: **0**`,
        `- canonical promotion: **forbidden (0)**`,
        "",
        "## Work packets",
        "",
        "| status | candidates |",
        "| --- | ---: |",
        ...statusRows.map(([name, count]) => `| ${name} | ${count} |`),
        "",
        "## Provider field mapping",
        "",
        "| status | candidates |",
        "| --- | ---: |",
        ...mappingRows.map(([name, count]) => `| ${name} | ${count} |`),
        "",
        "The existing 6.7/7.0 genshin-db snapshots are inventoried by immutable path, raw SHA-256, field locator, and observed gameVersion. Their single GenshinData-derived family is not an independent second claim source, and snapshot gate booleans are not treated as proof.",
        "",
        "Japanese local passive text and provider English passiveN fields are retained as separate observations. The bounded localized capture supplies an exact Japanese-name → same-provider-key bridge for the 63 non-Traveler candidates in both pinned revisions; it is an identity/key bridge only, not independent semantic evidence. `passive_1` → `passive1` ordinal similarity alone is not proof; Traveler IDs 10000005 and 10000007 remain separate and variant-ambiguous.",
        "",
        "No prose semantic inference, review approval, eligibility certificate, canonical promotion, queue mutation, or source reacquisition was performed.",
        "",
        `Field digest: \`${audit.fieldDigest || "unknown"}\``,
        ""
    ].join("\n");
}

function writeArtifacts() {
    const audit = buildAudit();
    fs.mkdirSync(path.dirname(paths.artifact), { recursive: true });
    fs.mkdirSync(path.dirname(paths.reportJson), { recursive: true });
    fs.writeFileSync(paths.artifact, stableJson(audit), "utf8");
    fs.writeFileSync(paths.reportJson, stableJson(audit), "utf8");
    fs.writeFileSync(paths.reportMarkdown, renderMarkdown(audit), "utf8");
    return audit;
}

if (require.main === module) {
    const audit = writeArtifacts();
    process.stdout.write(stableJson({ status: audit.status, summary: audit.summary, errors: audit.errors }));
    if (audit.status !== "passed") process.exitCode = 1;
}

module.exports = {
    EXPECTED_CANDIDATE_COUNT,
    EXPECTED_ENTITY_IDS,
    KNOWN_PROVIDER_PINS,
    QUEUE_PROJECTION_KEYS,
    TRAVELER_ENTITY_IDS,
    generatedAt,
    lane,
    paths,
    loadInputs,
    projectQueueTask,
    queueInputProjection,
    providerPassiveFields,
    providerRecordEvidence,
    providerFieldMapping,
    buildAudit,
    renderMarkdown,
    stableJson,
    validateAudit,
    writeArtifacts
};
