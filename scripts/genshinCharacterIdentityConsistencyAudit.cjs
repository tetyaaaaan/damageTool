"use strict";

/**
 * Read-only identity consistency audit for the Genshin v2 character data.
 *
 * The DataContract manifest identifies the catalog and source-text datasets;
 * the legacy profile mapper contains two duplicated name maps.  This audit
 * compares those inputs mechanically and records the distinction between a
 * missing mapper entry, disagreement between the duplicated mapper maps, a
 * mapper name mismatch, and a catalog/source-text binding mismatch.
 *
 * Source-text files do not expose a top-level character identity field.  The
 * audit therefore compares their entity-id coverage (and only an explicitly
 * present top-level name/nameJa field); it never infers identity from prose.
 * No source file, mapper, verification state, or canonical runtime data is
 * changed by this script.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { digestStable } = require("./genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const manifestPath = path.join(dataRoot, "data-v2-manifest.json");
const mapperPath = path.join(repositoryRoot, "games", "js", "genshinProfileMapper.js");
const artifactPath = path.join(dataRoot, "v2", "characters", "identity-consistency-audit.json");
const reportJsonPath = path.join(repositoryRoot, "reports", "genshin-character-identity-consistency-audit.json");
const reportMarkdownPath = path.join(repositoryRoot, "reports", "genshin-character-identity-consistency-audit.md");
const schemaPath = path.join(dataRoot, "schema", "genshin-character-identity-consistency-audit.schema.json");

function pathsFor(customDataRoot = dataRoot, customMapperPath = mapperPath) {
    const resolvedDataRoot = path.resolve(customDataRoot);
    return {
        dataRoot: resolvedDataRoot,
        manifestPath: path.join(resolvedDataRoot, "data-v2-manifest.json"),
        mapperPath: path.resolve(customMapperPath),
        artifactPath: path.join(resolvedDataRoot, "v2", "characters", "identity-consistency-audit.json"),
        reportJsonPath: path.join(repositoryRoot, "reports", "genshin-character-identity-consistency-audit.json"),
        reportMarkdownPath: path.join(repositoryRoot, "reports", "genshin-character-identity-consistency-audit.md"),
        schemaPath: path.join(resolvedDataRoot, "schema", "genshin-character-identity-consistency-audit.schema.json")
    };
}

// Keep the evidence artifact reproducible.  This is the repository's current
// audit date, not a runtime timestamp.
const generatedAt = "2026-08-26T00:00:00.000Z";
const mapperMapNames = [
    { key: "ja", constantName: "CHARACTER_NAME_BY_AVATAR_ID_JA" },
    { key: "fallback", constantName: "CHARACTER_NAME_BY_AVATAR_ID" }
];
const datasetSpecs = [
    { role: "catalog", dataset: "characters", expectedLayer: "raw", expectedAuthority: "catalog" },
    { role: "sourceTextTalents", dataset: "characterTalents", expectedLayer: "raw", expectedAuthority: "sourceText" },
    { role: "sourceTextConstellations", dataset: "characterConstellations", expectedLayer: "raw", expectedAuthority: "sourceText" }
];
const classifications = [
    "match",
    "mapperMissing",
    "mapperDuplicateDisagreement",
    "catalogSourceTextMismatch",
    "mapperNameMismatch",
    "malformedEvidence"
];
const promotionBlockingClassifications = [
    "mapperDuplicateDisagreement",
    "catalogSourceTextMismatch",
    "mapperNameMismatch",
    "malformedEvidence"
];

const identityAssessmentStatuses = Object.freeze([
    "clear",
    "blockedMismatch",
    "missingCoverage",
    "malformedEvidence",
    "auditInvalid",
    "entityMissing"
]);

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function sha256(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function relativePath(file) {
    return path.relative(repositoryRoot, file).replaceAll("\\", "/");
}

function sortIds(left, right) {
    return String(left).localeCompare(String(right), "en", { numeric: true });
}

function uniqueSorted(values) {
    return [...new Set((values || []).map(String))].sort(sortIds);
}

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function fileIntegrity(file) {
    if (!file || !fs.existsSync(file)) return { exists: false, bytes: 0, sha256: null };
    const bytes = fs.readFileSync(file);
    return { exists: true, bytes: bytes.length, sha256: sha256(bytes) };
}

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function datasetRecordEvidence(spec, id, record) {
    const reasons = [];
    if (!isRecord(record)) {
        reasons.push(`dataset:${spec.dataset}:${id}:recordMalformed`);
        return { status: "malformed", reasons };
    }
    if (spec.role === "catalog" && !nonEmptyString(record.nameJa)) {
        reasons.push(`dataset:${spec.dataset}:${id}:nameJaMalformed`);
    }
    if (spec.role !== "catalog" && Object.keys(record).length === 0) {
        reasons.push(`dataset:${spec.dataset}:${id}:emptyRecord`);
    }
    ["name", "nameJa"].forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(record, field) && !nonEmptyString(record[field])) {
            reasons.push(`dataset:${spec.dataset}:${id}:${field}Malformed`);
        }
    });
    return { status: reasons.length ? "malformed" : "parsed", reasons };
}

function inspectDatasetDocument(spec, document, errors) {
    if (!isRecord(document)) {
        const reason = `dataset:${spec.dataset}:rootMalformed`;
        errors.push(reason);
        return { status: "malformed", recordStatuses: {}, malformedIds: [], reasons: [reason] };
    }
    const recordStatuses = {};
    const malformedIds = [];
    const reasons = [];
    Object.entries(document).forEach(([id, record]) => {
        const evidence = datasetRecordEvidence(spec, id, record);
        recordStatuses[id] = evidence;
        if (evidence.status === "malformed") {
            malformedIds.push(id);
            evidence.reasons.forEach((reason) => {
                errors.push(reason);
                reasons.push(reason);
            });
        }
    });
    return {
        status: reasons.length ? "malformed" : "parsed",
        recordStatuses,
        malformedIds: uniqueSorted(malformedIds),
        reasons: [...new Set(reasons)].sort()
    };
}

function readSourceFile(file, label, errors) {
    const integrity = fileIntegrity(file);
    if (!integrity.exists) {
        errors.push(`${label}:missing`);
        return { document: {}, integrity, parseStatus: "missing" };
    }
    try {
        return { document: readJson(file), integrity, parseStatus: "parsed" };
    } catch (error) {
        errors.push(`${label}:invalidJson:${error.message}`);
        return { document: {}, integrity, parseStatus: "malformed" };
    }
}

function readTextFile(file, label, errors) {
    const integrity = fileIntegrity(file);
    if (!integrity.exists) {
        errors.push(`${label}:missing`);
        return { text: "", integrity, parseStatus: "missing" };
    }
    return { text: fs.readFileSync(file, "utf8"), integrity, parseStatus: "parsed" };
}

function resolveManifestDataset(manifest, spec, errors, paths = pathsFor()) {
    const metadata = manifest?.datasets?.[spec.dataset];
    if (!metadata || typeof metadata !== "object") {
        errors.push(`manifestDataset:${spec.dataset}:missing`);
        return {
            ...spec,
            path: null,
            expectedLayer: spec.expectedLayer,
            expectedAuthority: spec.expectedAuthority,
            layer: null,
            authority: null,
            metadata: null,
            file: null,
            document: {},
            integrity: { exists: false, bytes: 0, sha256: null },
            evidence: { status: "missing", recordStatuses: {}, malformedIds: [], reasons: [`manifestDataset:${spec.dataset}:missing`] }
        };
    }
    if (metadata.layer !== spec.expectedLayer) errors.push(`manifestDataset:${spec.dataset}:layerMismatch`);
    if (metadata.authority !== spec.expectedAuthority) errors.push(`manifestDataset:${spec.dataset}:authorityMismatch`);
    const relative = typeof metadata.path === "string" ? metadata.path : null;
    const file = relative ? path.resolve(paths.dataRoot, relative) : null;
    const dataRootPrefix = `${paths.dataRoot}${path.sep}`;
    if (!file || (file !== paths.dataRoot && !file.startsWith(dataRootPrefix))) errors.push(`manifestDataset:${spec.dataset}:pathInvalid`);
    const source = readSourceFile(file, `dataset:${spec.dataset}`, errors);
    const evidence = source.parseStatus === "parsed"
        ? inspectDatasetDocument(spec, source.document, errors)
        : {
            status: source.parseStatus === "missing" ? "missing" : "malformed",
            recordStatuses: {},
            malformedIds: [],
            reasons: [`dataset:${spec.dataset}:${source.parseStatus}`]
        };
    return {
        ...spec,
        path: relative,
        layer: metadata.layer || null,
        authority: metadata.authority || null,
        metadata: clone(metadata),
        file,
        document: source.document,
        integrity: source.integrity,
        evidence
    };
}

function loadInputs(paths = pathsFor()) {
    const errors = [];
    const manifestSource = readSourceFile(paths.manifestPath, "manifest:data-v2-manifest", errors);
    const manifest = manifestSource.document;
    const datasets = Object.fromEntries(datasetSpecs.map((spec) => [spec.role, resolveManifestDataset(manifest, spec, errors, paths)]));
    const mapperSource = readTextFile(paths.mapperPath, "consumerMapper", errors);
    return {
        errors,
        manifest,
        manifestSource,
        datasets,
        mapperSource,
        paths
    };
}

function extractObjectLiteral(source, constantName) {
    const declaration = `const ${constantName}`;
    let declarationIndex = source.indexOf(declaration);
    while (declarationIndex >= 0 && /[A-Za-z0-9_$]/.test(source[declarationIndex + declaration.length] || "")) {
        declarationIndex = source.indexOf(declaration, declarationIndex + declaration.length);
    }
    if (declarationIndex < 0) return { status: "missing", block: null };
    const openIndex = source.indexOf("{", declarationIndex);
    if (openIndex < 0) return { status: "malformed", block: null };
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = openIndex; index < source.length; index += 1) {
        const character = source[index];
        if (inString) {
            if (escaped) escaped = false;
            else if (character === "\\") escaped = true;
            else if (character === '"') inString = false;
            continue;
        }
        if (character === '"') {
            inString = true;
            continue;
        }
        if (character === "{") depth += 1;
        else if (character === "}") {
            depth -= 1;
            if (depth === 0) return { status: "parsed", block: source.slice(openIndex, index + 1) };
        }
    }
    return { status: "malformed", block: null };
}

function decodeString(raw) {
    try {
        return JSON.parse(`"${raw}"`);
    } catch {
        return raw;
    }
}

function parseNameMap(source, spec) {
    const extracted = extractObjectLiteral(source, spec.constantName);
    if (extracted.status === "missing") {
        return {
            key: spec.key,
            constantName: spec.constantName,
            status: "missing",
            malformedReasons: [],
            occurrences: [],
            entries: [],
            entryMap: {},
            digest: digestStable({ key: spec.key, constantName: spec.constantName, occurrences: [] })
        };
    }
    if (extracted.status !== "parsed") {
        return {
            key: spec.key,
            constantName: spec.constantName,
            status: "malformed",
            malformedReasons: ["objectLiteralUnterminated"],
            occurrences: [],
            entries: [],
            entryMap: {},
            digest: digestStable({ key: spec.key, constantName: spec.constantName, occurrences: [] })
        };
    }
    const block = extracted.block;
    const malformedReasons = [];
    let parsedObject;
    try {
        parsedObject = JSON.parse(block);
    } catch {
        malformedReasons.push("objectLiteralInvalidJson");
    }
    if (!isRecord(parsedObject)) malformedReasons.push("objectLiteralNotRecord");
    if (isRecord(parsedObject)) {
        Object.entries(parsedObject).forEach(([id, name]) => {
            if (!nonEmptyString(id)) malformedReasons.push("entryIdMalformed");
            if (!nonEmptyString(name)) malformedReasons.push(`entryNameMalformed:${id}`);
        });
    }
    const occurrences = [];
    const pairPattern = /"((?:\\.|[^"\\])*)"\s*:\s*"((?:\\.|[^"\\])*)"/g;
    for (const match of block.matchAll(pairPattern)) {
        occurrences.push({ id: decodeString(match[1]), name: decodeString(match[2]) });
    }
    if (isRecord(parsedObject) && occurrences.length < Object.keys(parsedObject).length) {
        malformedReasons.push("entryPairCoverageIncomplete");
    }
    const grouped = new Map();
    occurrences.forEach(({ id, name }) => {
        if (!grouped.has(id)) grouped.set(id, []);
        grouped.get(id).push(name);
    });
    const entries = [...grouped.entries()].sort(([left], [right]) => sortIds(left, right)).map(([id, names]) => ({
        id,
        values: [...new Set(names)],
        occurrenceCount: names.length,
        duplicateDisagreement: new Set(names).size > 1
    }));
    return {
        key: spec.key,
        constantName: spec.constantName,
        status: malformedReasons.length ? "malformed" : "parsed",
        malformedReasons: [...new Set(malformedReasons)].sort(),
        occurrences,
        entries,
        entryMap: Object.fromEntries(entries.map((entry) => [entry.id, entry.values])),
        digest: digestStable({ key: spec.key, constantName: spec.constantName, occurrences })
    };
}

function parseMapper(mapperSource, paths = pathsFor()) {
    const source = mapperSource.text;
    const maps = mapperMapNames.map((spec) => parseNameMap(typeof source === "string" ? source : "", spec));
    const malformedReasons = maps.flatMap((map) => map.malformedReasons || []).map((reason) => `${reason}`);
    if (mapperSource.parseStatus === "malformed") malformedReasons.push("mapperSourceMalformed");
    return {
        path: relativePath(paths.mapperPath),
        status: malformedReasons.length ? "malformed" : (maps.every((map) => map.status === "parsed") ? "parsed" : "incomplete"),
        maps,
        mapIds: uniqueSorted(maps.flatMap((map) => map.entries.map((entry) => entry.id))),
        sourceIntegrity: mapperSource.integrity,
        malformedReasons: [...new Set(malformedReasons)].sort(),
        sourceStatus: mapperSource.parseStatus || (mapperSource.integrity?.exists ? "parsed" : "missing")
    };
}

function recordIds(document) {
    return document && typeof document === "object" && !Array.isArray(document)
        ? Object.keys(document).map(String)
        : [];
}

function directNameValues(record) {
    if (!isRecord(record)) return [];
    return [...new Set([record.nameJa, record.name].filter((value) => typeof value === "string" && value.trim()))];
}

function datasetEntityEvidence(dataset, id) {
    const evidence = dataset?.evidence;
    if (!evidence || evidence.status === "missing") return { status: "missing", reasons: [`dataset:${dataset?.dataset || "unknown"}:missing`] };
    if (evidence.status === "malformed" && !evidence.recordStatuses?.[id]) {
        return { status: "malformed", reasons: evidence.reasons?.length ? [...evidence.reasons] : [`dataset:${dataset?.dataset || "unknown"}:malformed`] };
    }
    const recordEvidence = evidence.recordStatuses?.[id];
    if (!recordEvidence) return { status: "missing", reasons: [`dataset:${dataset?.dataset || "unknown"}:${id}:missing`] };
    return {
        status: recordEvidence.status,
        reasons: [...(recordEvidence.reasons || [])]
    };
}

function mapperObservation(map, id) {
    const values = map.entryMap?.[id] || [];
    const mapStatus = map?.status || "malformed";
    const malformedReasons = mapStatus === "malformed"
        ? (map.malformedReasons?.length ? map.malformedReasons.map((reason) => `mapper:${map.key}:${reason}`) : [`mapper:${map.key}:malformed`])
        : [];
    return {
        present: mapStatus === "parsed" && values.length > 0,
        values: [...values],
        occurrenceCount: map.entries.find((entry) => entry.id === id)?.occurrenceCount || 0,
        duplicateDisagreement: map.entries.find((entry) => entry.id === id)?.duplicateDisagreement || false,
        evidenceStatus: mapStatus === "parsed" ? (values.length > 0 ? "parsed" : "missing") : mapStatus,
        malformedReasons
    };
}

function buildRecord(id, inputs, mapper) {
    const catalog = inputs.datasets.catalog.document?.[id];
    const talents = inputs.datasets.sourceTextTalents.document?.[id];
    const constellations = inputs.datasets.sourceTextConstellations.document?.[id];
    const catalogEvidence = datasetEntityEvidence(inputs.datasets.catalog, id);
    const talentsEvidence = datasetEntityEvidence(inputs.datasets.sourceTextTalents, id);
    const constellationsEvidence = datasetEntityEvidence(inputs.datasets.sourceTextConstellations, id);
    const catalogPresent = catalogEvidence.status === "parsed";
    const catalogNameJa = catalogPresent && typeof catalog?.nameJa === "string" ? catalog.nameJa : null;
    const sourceText = {
        talentsPresent: talentsEvidence.status === "parsed",
        constellationsPresent: constellationsEvidence.status === "parsed",
        talentsDirectNameValues: directNameValues(talents),
        constellationsDirectNameValues: directNameValues(constellations),
        talentsEvidenceStatus: talentsEvidence.status,
        constellationsEvidenceStatus: constellationsEvidence.status,
        identityEvidence: "entityIdCoverageAndExplicitTopLevelNameOnly"
    };
    const sourceTextNames = [...new Set([...sourceText.talentsDirectNameValues, ...sourceText.constellationsDirectNameValues])];
    const sourceTextCoverageMismatch = !catalogPresent
        || !sourceText.talentsPresent
        || !sourceText.constellationsPresent
        || (sourceTextNames.length > 0 && sourceTextNames.some((name) => name !== catalogNameJa));
    const sourceTextStatus = sourceTextCoverageMismatch ? "catalogSourceTextMismatch" : "catalogAndSourceTextMatch";
    const mapperValues = Object.fromEntries(mapper.maps.map((map) => [map.key, mapperObservation(map, id)]));
    const presentMapValues = mapper.maps.flatMap((map) => mapperValues[map.key].values);
    const uniqueMapperNames = [...new Set(presentMapValues)];
    const mapperMissing = mapper.maps.some((map) => !mapperValues[map.key].present);
    const mapperDuplicateDisagreement = mapper.maps.some((map) => mapperValues[map.key].duplicateDisagreement)
        || (mapper.maps.every((map) => mapperValues[map.key].present) && uniqueMapperNames.length > 1);
    const mapperNameMismatch = !mapperDuplicateDisagreement
        && uniqueMapperNames.some((name) => name !== catalogNameJa);
    const evidenceReasons = [
        ...catalogEvidence.reasons,
        ...talentsEvidence.reasons,
        ...constellationsEvidence.reasons,
        ...mapper.maps.flatMap((map) => mapperValues[map.key].malformedReasons)
    ];
    const malformedEvidence = [catalogEvidence, talentsEvidence, constellationsEvidence].some((item) => item.status === "malformed")
        || mapper.maps.some((map) => map.status === "malformed")
        || mapper.sourceStatus === "malformed";
    let classification = "match";
    if (malformedEvidence) classification = "malformedEvidence";
    else if (sourceTextCoverageMismatch) classification = "catalogSourceTextMismatch";
    else if (mapperDuplicateDisagreement) classification = "mapperDuplicateDisagreement";
    else if (mapperNameMismatch) classification = "mapperNameMismatch";
    else if (mapperMissing) classification = "mapperMissing";
    const findings = [];
    if (malformedEvidence) findings.push("malformedEvidence");
    if (sourceTextCoverageMismatch) findings.push("catalogSourceTextMismatch");
    if (mapperDuplicateDisagreement) findings.push("mapperDuplicateDisagreement");
    if (mapperMissing) findings.push("mapperMissing");
    if (mapperNameMismatch) findings.push("mapperNameMismatch");
    if (!findings.length) findings.push("match");
    return {
        id,
        catalogPresent,
        catalogNameJa,
        evidence: {
            catalog: { status: catalogEvidence.status, reasons: [...catalogEvidence.reasons] },
            sourceTextTalents: { status: talentsEvidence.status, reasons: [...talentsEvidence.reasons] },
            sourceTextConstellations: { status: constellationsEvidence.status, reasons: [...constellationsEvidence.reasons] },
            mapperSourceStatus: mapper.sourceStatus,
            malformed: malformedEvidence,
            reasons: [...new Set(evidenceReasons)].sort()
        },
        sourceText,
        sourceTextStatus,
        mapper: mapperValues,
        mapperObservedNames: uniqueMapperNames,
        classification,
        findings
    };
}

function inputDescriptor(input) {
    return {
        role: input.role,
        dataset: input.dataset,
        path: input.path,
        layer: input.layer,
        authority: input.authority,
        expectedLayer: input.expectedLayer,
        expectedAuthority: input.expectedAuthority,
        metadata: clone(input.metadata),
        integrity: clone(input.integrity),
        evidence: clone(input.evidence)
    };
}

function generatedFrom(inputs, mapper, paths = pathsFor()) {
    return {
        manifest: {
            path: relativePath(paths.manifestPath),
            integrity: clone(inputs.manifestSource.integrity)
        },
        datasets: datasetSpecs.map((spec) => inputDescriptor(inputs.datasets[spec.role])),
        consumerMapper: {
            path: relativePath(paths.mapperPath),
            integrity: clone(mapper.sourceIntegrity)
        }
    };
}

function buildAudit({ dataRoot: customDataRoot, mapperPath: customMapperPath } = {}) {
    const paths = pathsFor(customDataRoot || dataRoot, customMapperPath || mapperPath);
    const inputs = loadInputs(paths);
    const mapper = parseMapper(inputs.mapperSource, paths);
    const catalogIds = recordIds(inputs.datasets.catalog.document);
    const talentIds = recordIds(inputs.datasets.sourceTextTalents.document);
    const constellationIds = recordIds(inputs.datasets.sourceTextConstellations.document);
    const sourceTextIds = uniqueSorted([...talentIds, ...constellationIds]);
    const ids = uniqueSorted([...catalogIds, ...sourceTextIds]);
    const records = ids.map((id) => buildRecord(id, inputs, mapper));
    const classificationIds = Object.fromEntries(classifications.map((classification) => [
        classification,
        records.filter((record) => record.classification === classification).map((record) => record.id)
    ]));
    const mapperOrphanIds = mapper.mapIds.filter((id) => !catalogIds.includes(id));
    const mismatchIds = records.filter((record) => promotionBlockingClassifications.includes(record.classification)).map((record) => record.id);
    const missingIds = classificationIds.mapperMissing;
    const malformedInput = inputs.errors.length > 0
        || mapper.status === "malformed"
        || datasetSpecs.some((spec) => inputs.datasets[spec.role]?.evidence?.status !== "parsed");
    const blockingIds = uniqueSorted([
        ...mismatchIds,
        ...(malformedInput ? ["__input__"] : [])
    ]);
    const summary = {
        catalogEntityCount: catalogIds.length,
        sourceTextTalentsEntityCount: talentIds.length,
        sourceTextConstellationsEntityCount: constellationIds.length,
        comparedEntityCount: records.length,
        mapperMapCount: mapper.maps.length,
        mapperEntryCounts: Object.fromEntries(mapper.maps.map((map) => [map.key, map.entries.length])),
        classificationCounts: Object.fromEntries(classifications.map((classification) => [classification, classificationIds[classification].length])),
        matchCount: classificationIds.match.length,
        mapperMissingCount: missingIds.length,
        mapperDuplicateDisagreementCount: classificationIds.mapperDuplicateDisagreement.length,
        catalogSourceTextMismatchCount: classificationIds.catalogSourceTextMismatch.length,
        mapperNameMismatchCount: classificationIds.mapperNameMismatch.length,
        mapperMissingIds: missingIds,
        mapperNameMismatchIds: classificationIds.mapperNameMismatch,
        mapperDuplicateDisagreementIds: classificationIds.mapperDuplicateDisagreement,
        catalogSourceTextMismatchIds: classificationIds.catalogSourceTextMismatch,
        malformedEvidenceCount: classificationIds.malformedEvidence.length,
        malformedEvidenceIds: classificationIds.malformedEvidence,
        mapperOrphanIds,
        mapperMissingFromEntityId: missingIds.filter((id) => Number(id) >= 10000109),
        canonicalPromotionCount: 0
    };
    const gate = {
        identitySensitivePromotion: {
            status: blockingIds.length ? "failClosed" : "clear",
            failClosed: blockingIds.length > 0,
            allowed: false,
            blockingClassifications: promotionBlockingClassifications,
            blockingIds
        },
        consumerCoverage: {
            status: missingIds.length ? "gap" : "complete",
            classification: "mapperMissing",
            gapIds: missingIds,
            doesNotReclassifyAsMismatch: true
        },
        canonicalPromotion: {
            status: "forbidden",
            eligible: 0,
            changed: false
        }
    };
    const policy = {
        readOnly: true,
        comparison: "machineCompareDataContractCatalogSourceTextAgainstBothProfileMapperNameMaps",
        mapperMissing: "consumer coverage gap; never inferred or relabeled as mapperNameMismatch",
        mapperDuplicateDisagreement: "fail closed when duplicate key/value observations disagree within or across the two mapper maps",
        catalogSourceTextMismatch: "fail closed when catalog and source-text entity coverage or explicit top-level identity fields disagree",
        mapperNameMismatch: "fail closed when both mapper maps provide one name that differs from the catalog name",
        malformedEvidence: "fail closed when the manifest, catalog, source-text record, or mapper cannot be parsed into the required evidence shape",
        sourceTextIdentity: "source-text records have no top-level character identity in this dataset; prose is not parsed for identity",
        identitySensitivePromotion: "blocked by mapperDuplicateDisagreement, catalogSourceTextMismatch, mapperNameMismatch, malformedEvidence, or any input error",
        canonicalPromotion: "forbidden; this audit never mutates verification or canonical runtime data"
    };
    const claim = {
        schemaVersion: 1,
        kind: "genshinCharacterIdentityConsistencyAudit",
        generatedAt,
        policy,
        generatedFrom: generatedFrom(inputs, mapper, paths),
        mapper: {
            path: mapper.path,
            status: mapper.status,
            maps: mapper.maps.map((map) => ({
                key: map.key,
                constantName: map.constantName,
                status: map.status,
                malformedReasons: map.malformedReasons,
                occurrenceCount: map.occurrences.length,
                entries: map.entries,
                digest: map.digest
            })),
            orphanIds: mapperOrphanIds,
            malformedReasons: mapper.malformedReasons,
            sourceStatus: mapper.sourceStatus
        },
        records,
        classifications: classificationIds,
        summary,
        gate,
        errors: [...new Set(inputs.errors)].sort()
    };
    return {
        ...claim,
        status: claim.errors.length ? "failed" : "passed",
        fieldDigestAlgorithm: "sha256-stable-json-v1",
        fieldDigest: digestStable(claim)
    };
}

function withoutDigest(value) {
    const cloneValue = clone(value);
    if (cloneValue && typeof cloneValue === "object") {
        delete cloneValue.fieldDigest;
        delete cloneValue.fieldDigestAlgorithm;
        delete cloneValue.status;
    }
    return cloneValue;
}

function deriveRecordClassification(record) {
    if (!isRecord(record)) return "malformedEvidence";
    const catalogEvidenceStatus = record.evidence?.catalog?.status;
    const talentsEvidenceStatus = record.evidence?.sourceTextTalents?.status;
    const constellationsEvidenceStatus = record.evidence?.sourceTextConstellations?.status;
    const mapperValues = isRecord(record.mapper) ? Object.values(record.mapper) : [];
    const malformed = [catalogEvidenceStatus, talentsEvidenceStatus, constellationsEvidenceStatus]
        .some((status) => status === "malformed")
        || mapperValues.some((observation) => observation?.evidenceStatus === "malformed")
        || (record.evidence?.reasons || []).some((reason) => /Malformed|malformed|Invalid|invalid/.test(String(reason)));
    if (malformed) return "malformedEvidence";
    const sourceMismatch = record.catalogPresent !== true
        || record.sourceText?.talentsEvidenceStatus !== "parsed"
        || record.sourceText?.constellationsEvidenceStatus !== "parsed"
        || [...new Set([
            ...(record.sourceText?.talentsDirectNameValues || []),
            ...(record.sourceText?.constellationsDirectNameValues || [])
        ])].some((name) => name !== record.catalogNameJa);
    if (sourceMismatch) return "catalogSourceTextMismatch";
    const duplicateDisagreement = mapperValues.some((observation) => observation?.duplicateDisagreement === true)
        || (mapperValues.length === 2
            && mapperValues.every((observation) => observation?.evidenceStatus === "parsed" && Array.isArray(observation.values) && observation.values.length > 0)
            && new Set(mapperValues.flatMap((observation) => observation.values)).size > 1);
    if (duplicateDisagreement) return "mapperDuplicateDisagreement";
    const mapperMissing = mapperValues.length !== mapperMapNames.length
        || mapperValues.some((observation) => observation?.evidenceStatus !== "parsed" || !Array.isArray(observation.values) || observation.values.length === 0);
    const observedNames = [...new Set(mapperValues.flatMap((observation) => observation.values))];
    if (observedNames.some((name) => name !== record.catalogNameJa)) return "mapperNameMismatch";
    if (mapperMissing) return "mapperMissing";
    return "match";
}

function inputHasFailure(audit) {
    return (Array.isArray(audit?.errors) && audit.errors.length > 0)
        || audit?.mapper?.status !== "parsed"
        || (audit?.generatedFrom?.datasets || []).some((input) => input?.evidence?.status !== "parsed");
}

function validateAuditShape(audit) {
    const reasons = [];
    if (!isRecord(audit)) return ["identityInvalid"];
    const records = Array.isArray(audit.records) ? audit.records : [];
    if (!Array.isArray(audit.records)) reasons.push("recordsInvalid");
    const recordIds = records.map((record) => String(record?.id || ""));
    if (recordIds.some((id) => !id) || new Set(recordIds).size !== recordIds.length || JSON.stringify(recordIds) !== JSON.stringify([...recordIds].sort(sortIds))) {
        reasons.push("recordIdsInvalid");
    }
    const derivedClassifications = Object.fromEntries(classifications.map((classification) => [
        classification,
        records.filter((record) => deriveRecordClassification(record) === classification).map((record) => String(record.id))
    ]));
    if (!isRecord(audit.classifications)) reasons.push("classificationsInvalid");
    else if (JSON.stringify(audit.classifications) !== JSON.stringify(derivedClassifications)) reasons.push("classificationsNotDerivedFromEvidence");
    records.forEach((record) => {
        if (record?.classification !== deriveRecordClassification(record)) reasons.push(`recordClassificationNotDerived:${record?.id || "unknown"}`);
        if (!Array.isArray(record?.findings) || !record.findings.includes(record.classification)) reasons.push(`recordFindingsInvalid:${record?.id || "unknown"}`);
    });
    const summary = audit.summary || {};
    classifications.forEach((classification) => {
        const ids = derivedClassifications[classification] || [];
        if (summary.classificationCounts?.[classification] !== ids.length) reasons.push(`summaryClassificationCountInvalid:${classification}`);
        const idKey = `${classification}Ids`;
        if (classification === "match") {
            if (JSON.stringify(summary.matchCount) !== JSON.stringify(ids.length)) reasons.push("summaryMatchCountInvalid");
        } else if (JSON.stringify(summary[idKey]) !== JSON.stringify(ids)) {
            reasons.push(`summaryClassificationIdsInvalid:${classification}`);
        }
    });
    if (summary.canonicalPromotionCount !== 0) reasons.push("canonicalPromotionInvalid");
    const blockingIds = uniqueSorted([
        ...records.filter((record) => promotionBlockingClassifications.includes(deriveRecordClassification(record))).map((record) => String(record.id)),
        ...(inputHasFailure(audit) ? ["__input__"] : [])
    ]);
    if (JSON.stringify(audit.gate?.identitySensitivePromotion?.blockingIds) !== JSON.stringify(blockingIds)) reasons.push("identityBlockingIdsNotDerived");
    if (Boolean(audit.gate?.identitySensitivePromotion?.failClosed) !== (blockingIds.length > 0)) reasons.push("identityFailClosedNotDerived");
    if (JSON.stringify(audit.gate?.consumerCoverage?.gapIds) !== JSON.stringify(derivedClassifications.mapperMissing)) reasons.push("consumerCoverageNotDerived");
    return [...new Set(reasons)];
}

function validateAudit(audit, { compareCurrent = true, dataRoot: customDataRoot, mapperPath: customMapperPath } = {}) {
    const reasons = [];
    if (audit?.schemaVersion !== 1 || audit?.kind !== "genshinCharacterIdentityConsistencyAudit" || !["passed", "failed"].includes(audit?.status)) reasons.push("identityInvalid");
    if (audit?.generatedAt !== generatedAt) reasons.push("generatedAtInvalid");
    if (audit?.fieldDigestAlgorithm !== "sha256-stable-json-v1" || audit?.fieldDigest !== digestStable(withoutDigest(audit))) reasons.push("fieldDigestInvalid");
    if (!audit?.policy?.readOnly || audit?.policy?.canonicalPromotion?.includes("forbidden") !== true) reasons.push("policyInvalid");
    if (audit?.summary?.canonicalPromotionCount !== 0 || audit?.gate?.canonicalPromotion?.eligible !== 0 || audit?.gate?.canonicalPromotion?.changed !== false) reasons.push("canonicalPromotionInvalid");
    if (audit?.gate?.consumerCoverage?.doesNotReclassifyAsMismatch !== true) reasons.push("missingCoveragePolicyInvalid");
    reasons.push(...validateAuditShape(audit));
    if (compareCurrent) {
        const expected = buildAudit({ dataRoot: customDataRoot, mapperPath: customMapperPath });
        if (JSON.stringify(audit) !== JSON.stringify(expected)) reasons.push("artifactNotDeterministicForCurrentInputs");
    }
    return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}

function identityAssessment(id, status, classification, blocked, reasons, consumerCoverageGap) {
    return {
        entityId: id,
        status,
        blocked: Boolean(blocked),
        reasons: [...new Set(reasons.filter(Boolean).map(String))].sort(),
        classification,
        consumerCoverageGap: Boolean(consumerCoverageGap),
        canonicalEligible: false
    };
}

function assessmentFromRecord(record) {
    const classification = deriveRecordClassification(record);
    const evidenceStatuses = [
        record?.evidence?.catalog?.status,
        record?.evidence?.sourceTextTalents?.status,
        record?.evidence?.sourceTextConstellations?.status,
        ...(Object.values(record?.mapper || {}).map((observation) => observation?.evidenceStatus))
    ];
    const hasMalformed = classification === "malformedEvidence" || evidenceStatuses.includes("malformed");
    const hasSourceMissing = evidenceStatuses.slice(0, 3).includes("missing");
    const hasMissing = classification === "mapperMissing"
        || evidenceStatuses.includes("missing")
        || !record?.catalogPresent
        || record?.sourceText?.talentsEvidenceStatus !== "parsed"
        || record?.sourceText?.constellationsEvidenceStatus !== "parsed";
    const reasons = [classification, ...(record?.evidence?.reasons || [])];
    if (hasMalformed) return identityAssessment(record.id, "malformedEvidence", "malformedEvidence", true, reasons, hasMissing);
    if (["mapperNameMismatch", "mapperDuplicateDisagreement", "catalogSourceTextMismatch"].includes(classification)) {
        return identityAssessment(record.id, "blockedMismatch", classification, true, reasons, hasMissing);
    }
    if (hasMissing) {
        const optionalMapperGapOnly = classification === "mapperMissing"
            && !hasSourceMissing
            && record?.evidence?.mapperSourceStatus === "parsed"
            && Object.values(record?.mapper || {})
                .flatMap((observation) => observation?.evidenceStatus === "parsed" ? (observation.values || []) : [])
                .every((name) => name === record?.catalogNameJa);
        return identityAssessment(record.id, "missingCoverage", classification, !optionalMapperGapOnly, reasons, true);
    }
    if (classification !== "match") return identityAssessment(record.id, "blockedMismatch", classification, true, reasons, false);
    return identityAssessment(record.id, "clear", "match", false, [], false);
}

/**
 * Reconcile one entity against a freshly validated identity audit.  This is a
 * veto/diagnostic helper only: even a clear identity never grants canonical
 * eligibility.  Callers should cache buildEntityIdentityAssessments() when
 * evaluating many candidates so the raw inputs are read and validated once.
 */
function assessEntityIdentity(entityId, audit = buildAudit(), options = {}) {
    const id = String(entityId);
    const validation = options.validation || validateAudit(audit, {
        compareCurrent: options.compareCurrent !== false,
        dataRoot: options.dataRoot,
        mapperPath: options.mapperPath
    });
    if (!validation.valid) {
        return identityAssessment(
            id,
            "auditInvalid",
            "malformedEvidence",
            true,
            validation.reasons.map((reason) => `audit:${reason}`),
            false
        );
    }
    const record = audit.records?.find((candidate) => String(candidate?.id) === id);
    if (!record) {
        const malformedInput = (audit.errors || []).some((reason) => /invalid|malformed|Malformed|rootMalformed/i.test(String(reason)))
            || audit.mapper?.status === "malformed"
            || (audit.generatedFrom?.datasets || []).some((input) => input?.evidence?.status === "malformed");
        if (malformedInput) {
            return identityAssessment(id, "malformedEvidence", "malformedEvidence", true, ["identityAudit:entityMissing", "identityAudit:inputMalformed", ...(audit.errors || [])], false);
        }
        return identityAssessment(id, "entityMissing", "entityMissing", true, ["identityAudit:entityMissing"], true);
    }
    return assessmentFromRecord(record);
}

/**
 * Build a deterministic per-entity veto map from the current raw bytes.
 * The returned Map intentionally contains assessments, never certificates or
 * a positive promotion decision.
 */
function buildEntityIdentityAssessments({ dataRoot: customDataRoot, mapperPath: customMapperPath, audit } = {}) {
    const sourceAudit = audit || buildAudit({ dataRoot: customDataRoot, mapperPath: customMapperPath });
    const validation = validateAudit(sourceAudit, {
        // A fresh build already read the authoritative bytes. Only an injected
        // report needs a second build to rule out stale/forged observations.
        compareCurrent: audit !== undefined,
        dataRoot: customDataRoot,
        mapperPath: customMapperPath
    });
    const assessments = new Map();
    (sourceAudit.records || []).forEach((record) => {
        const id = String(record?.id || "");
        if (id) assessments.set(id, assessEntityIdentity(id, sourceAudit, { validation, compareCurrent: false }));
    });
    return assessments;
}

function renderMarkdown(audit) {
    const summary = audit.summary || {};
    const count = (key) => summary.classificationCounts?.[key] || 0;
    const lines = [
        "# Genshin character ID identity consistency audit",
        "",
        `Status: **${audit.status}**; identity-sensitive promotion: **${audit.gate?.identitySensitivePromotion?.status || "unknown"}**; canonical promotion: **forbidden (0)**`,
        "",
        "This read-only audit mechanically compares the DataContract catalog/source-text datasets with both legacy profile-mapper name maps. Missing mapper entries are reported as consumer coverage gaps; they are not treated as name mismatches. No identity is inferred from source prose and no canonical data is promoted.",
        "",
        "## Summary",
        "",
        `- Catalog entities: **${summary.catalogEntityCount || 0}**; source-text talents: **${summary.sourceTextTalentsEntityCount || 0}**; source-text constellations: **${summary.sourceTextConstellationsEntityCount || 0}**.`,
        `- Compared entities: **${summary.comparedEntityCount || 0}**; mapper maps: **${summary.mapperMapCount || 0}**.`,
        `- Identity-sensitive gate: **${audit.gate?.identitySensitivePromotion?.status || "unknown"}**; blocking IDs: ${(audit.gate?.identitySensitivePromotion?.blockingIds || []).join(", ") || "none"}.`,
        `- Consumer coverage: **${audit.gate?.consumerCoverage?.status || "unknown"}**; missing mapper IDs: **${summary.mapperMissingCount || 0}**.`,
        "",
        "## Classification",
        "",
        "| Classification | Count | IDs |",
        "| --- | ---: | --- |",
        ...classifications.map((classification) => `| ${classification} | ${count(classification)} | ${(audit.classifications?.[classification] || []).join(", ") || "—"} |`),
        "",
        `Observed catalog-vs-mapper mismatches: ${(summary.mapperNameMismatchIds || []).map((id) => `\`${id}\``).join(", ") || "none"}. Missing mapper coverage remains a separate \`mapperMissing\` classification and is never relabeled as a mismatch.`,
        "",
        "## Inputs",
        "",
        "| Role | Dataset | Path | Layer | Authority | SHA-256 |",
        "| --- | --- | --- | --- | --- | --- |",
        ...((audit.generatedFrom?.datasets || []).map((input) => `| ${input.role} | ${input.dataset} | ${input.path || "—"} | ${input.layer || "—"} | ${input.authority || "—"} | ${input.integrity?.sha256 || "—"} |`)),
        `| manifest | — | ${audit.generatedFrom?.manifest?.path || "—"} | — | DataContract | ${audit.generatedFrom?.manifest?.integrity?.sha256 || "—"} |`,
        `| consumerMapper | — | ${audit.generatedFrom?.consumerMapper?.path || "—"} | legacy | profile mapper | ${audit.generatedFrom?.consumerMapper?.integrity?.sha256 || "—"} |`,
        "",
        "## Gate policy",
        "",
        "- `mapperDuplicateDisagreement`, `catalogSourceTextMismatch`, `mapperNameMismatch`, and `malformedEvidence` fail closed for identity-sensitive promotion.",
        "- `mapperMissing` is a consumer coverage gap and remains a distinct classification.",
        "- Canonical promotion is forbidden and remains zero; this report does not mutate any source, verification status, or runtime data.",
        "",
        `Field digest: \`${audit.fieldDigest || "unknown"}\``,
        ""
    ];
    return `${lines.join("\n")}\n`;
}

function writeReports(audit = buildAudit()) {
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.mkdirSync(path.dirname(reportJsonPath), { recursive: true });
    fs.writeFileSync(artifactPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
    fs.writeFileSync(reportJsonPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
    fs.writeFileSync(reportMarkdownPath, renderMarkdown(audit), "utf8");
    return audit;
}

if (require.main === module) {
    const audit = buildAudit();
    if (process.argv.includes("--write")) writeReports(audit);
    process.stdout.write(`${JSON.stringify({
        status: audit.status,
        identitySensitivePromotion: audit.gate.identitySensitivePromotion.status,
        canonicalPromotion: audit.gate.canonicalPromotion.eligible,
        classificationCounts: audit.summary.classificationCounts,
        mapperNameMismatchIds: audit.summary.mapperNameMismatchIds,
        mapperMissingFromEntityId: audit.summary.mapperMissingFromEntityId
    }, null, 2)}\n`);
    if (audit.errors.length) process.exitCode = 1;
}

module.exports = {
    assessEntityIdentity,
    artifactPath,
    buildAudit,
    buildEntityIdentityAssessments,
    classifications,
    generatedAt,
    identityAssessmentStatuses,
    mapperMapNames,
    promotionBlockingClassifications,
    renderMarkdown,
    reportJsonPath,
    reportMarkdownPath,
    schemaPath,
    validateAudit,
    writeReports
};
