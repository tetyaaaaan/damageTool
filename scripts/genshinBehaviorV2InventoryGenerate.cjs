"use strict";

/**
 * Build the all-character behavior v2 inventory used to expand the eight
 * character pilot set.  This is an evidence transform: only measurements and
 * operations returned by the existing deterministic behavior parser are
 * emitted.  Source text is never used to guess a value, target, or lifecycle
 * rule.  A source signal that the parser cannot map becomes an `unknown`
 * candidate with a null value for review.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const behavior = require("./genshinBehaviorV2Generate.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultDataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultOutputFile = path.join(defaultDataRoot, "v2", "characters", "behavior-inventory.json");
const defaultManifestFile = path.join(defaultDataRoot, "v2", "characters", "behavior-inventory-manifest.json");
const CAPTURED_AT = "2026-08-15T00:00:00.000Z";
const GENERATOR_VERSION = "genshinBehaviorV2InventoryGenerate/1";
const PILOT_IDS = [...behavior.PILOT_IDS];

const TALENT_SECTIONS = ["normalAttack", "skill", "burst", "special"];
const TALENT_FIELDS = ["normalDescriptionJa", "chargedDescriptionJa", "plungingDescriptionJa", "descriptionJa"];
const INPUT_FILES = [
    "characters.json",
    "character-talents.json",
    "character-constellations.json",
    "v2/characters/behavior-pilot.json"
];

const SIGNAL_PATTERNS = {
    timing: [
        /\d+(?:\.\d+)?\s*秒/u,
        /[一二三四五六七八九十百千万億〇零]+\s*秒/u,
        /秒間/u
    ],
    count: [
        /(?:最大|毎|各)?\s*\d+(?:\.\d+)?\s*(?:回|段|個|つ|発|層|体|枚|道|本)/u,
        /(?:最大|毎|各)?\s*[一二三四五六七八九十百千万億〇零]+\s*(?:回|段|個|つ|発|層|体|枚|道|本)/u,
        /(?:回数|段数|層数|個数)/u
    ],
    charge: [
        /チャージ/u,
        /使用可能回数/u,
        /使用回数/u,
        /回使用/u
    ],
    refresh: [
        /リセット/u,
        /再発動/u,
        /延長/u,
        /更新/u,
        /リフレッシュ/u,
        /継承/u
    ],
    icd: [
        /クールタイム/u,
        /内部クールタイム/u,
        /ICD/i,
        /秒毎/u,
        /秒ごと/u,
        /毎秒/u
    ]
};

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stableClone(value) {
    if (Array.isArray(value)) return value.map(stableClone);
    if (!isObject(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableClone(value[key])]));
}

function stableJson(value) {
    return JSON.stringify(stableClone(value));
}

function digest(value) {
    return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function fileDigest(file) {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function pointerEscape(value) {
    return String(value).replace(/~/g, "~0").replace(/\//g, "~1");
}

function jsonPath(...parts) {
    return `$/${parts.map(pointerEscape).join("/")}`;
}

function slug(value) {
    return String(value)
        .replace(/[^A-Za-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "component";
}

function sourceRecord({ id, dataset, record, field, text, structuredValue, notes }) {
    const source = {
        id,
        kind: "primaryDataset",
        provider: "damageTool-local",
        locator: { dataset, record },
        capturedAt: CAPTURED_AT,
        gameVersion: null,
        locale: "ja-JP",
        text: String(text || ""),
        integrity: { algorithm: "sha256", digest: digest(text || "") }
    };
    if (field) source.locator.field = field;
    if (structuredValue !== undefined) source.structuredValue = clone(structuredValue);
    if (notes) source.notes = notes;
    return source;
}

function putSource(records, source) {
    const previous = records[source.id];
    if (previous && stableJson(previous) !== stableJson(source)) throw new Error(`source id collision: ${source.id}`);
    records[source.id] = source;
    return source.id;
}

function sourceIdFor(characterId, kind, component, field, index) {
    const indexPart = index === undefined ? "" : `:${index}`;
    return `behavior-inventory:source:${characterId}:${kind}:${slug(component)}:${slug(field)}${indexPart}`;
}

function sourcePointer({ sourceId, dataset, record, field, text, present = true }) {
    return {
        sourceId,
        dataset,
        record,
        field: field || null,
        path: field ? `${record}/${field}` : record,
        present: Boolean(present),
        textDigest: digest(text || "")
    };
}

function signalKinds(text) {
    const value = String(text || "");
    return Object.entries(SIGNAL_PATTERNS)
        .filter(([, patterns]) => patterns.some((pattern) => pattern.test(value)))
        .map(([kind]) => kind);
}

function unitForPath(pathName) {
    if (pathName.includes("duration") || pathName.includes("cooldown") || pathName.includes("Interval")) return "seconds";
    if (pathName.endsWith("/charges")) return "charges";
    if (pathName.endsWith("/hitCount")) return "hits";
    if (pathName.endsWith("/attackCount")) return "attacks";
    if (pathName.includes("maxTriggers")) return "hits";
    if (pathName.includes("maxInstances") || pathName.includes("targetCount")) return "instances";
    return "unknown";
}

function kindForMeasurement(section, field, text) {
    if (section === "timing") {
        if (["cooldown", "tickInterval", "triggerInterval"].includes(field)) return "icd";
        return "timing";
    }
    if (section === "execution") {
        if (field === "charges") return "charge";
        return "count";
    }
    if (section === "lifecycle" && field === "refreshMode") return "refresh";
    if (section === "energy") return "count";
    return signalKinds(text)[0] || "unknown";
}

function kindForChange(change) {
    const pathName = String(change.path || "");
    if (pathName.endsWith("/charges")) return "charge";
    if (pathName.startsWith("/execution/")) return "count";
    if (pathName.startsWith("/timing/")) {
        if (pathName.includes("cooldown") || pathName.includes("Interval")) return "icd";
        return "refresh";
    }
    return null;
}

function explicitCandidate({ entry, sourceId, pointer, kind, fieldPath, value, unit, operation, notes, signals }) {
    const fingerprint = stableJson({
        characterId: entry.characterId,
        entityKind: entry.entityKind,
        component: entry.component,
        kind,
        fieldPath: fieldPath || null,
        value: value === undefined ? null : value,
        unit: unit || "unknown",
        operation: operation || "set",
        sourceDigest: pointer.textDigest
    });
    return {
        id: null,
        entity: { kind: entry.entityKind, id: String(entry.characterId), component: entry.component },
        sourceRefs: [sourceId],
        sourcePointer: clone(pointer),
        kind,
        fieldPath: fieldPath || null,
        operation: operation || "set",
        value: value === undefined ? null : clone(value),
        unit: unit || "unknown",
        status: "candidate",
        reviewStatus: "needsReview",
        verification: {
            status: "needsReview",
            reviewedBy: null,
            reviewedAt: null,
            sourceAgreement: "singleSource",
            notes: "Explicit parser output is retained as a candidate; no value or target was inferred from unrelated prose."
        },
        extraction: {
            method: "deterministicParser",
            version: GENERATOR_VERSION,
            sourceSignals: [...(signals || [])],
            notes: notes || "Copied from an explicit timing/count/charge/refresh/ICD parser field."
        },
        fingerprint
    };
}

function unknownCandidate({ entry, sourceId, pointer, kind, reason, signals }) {
    return {
        id: null,
        entity: { kind: entry.entityKind, id: String(entry.characterId), component: entry.component },
        sourceRefs: [sourceId],
        sourcePointer: clone(pointer),
        kind,
        fieldPath: null,
        operation: null,
        value: null,
        unit: "unknown",
        status: "unknown",
        reviewStatus: "needsReview",
        verification: {
            status: "needsReview",
            reviewedBy: null,
            reviewedAt: null,
            sourceAgreement: "singleSource",
            notes: "A source signal was observed but no explicit structured measurement was safely extracted."
        },
        extraction: {
            method: "signalOnly",
            version: GENERATOR_VERSION,
            sourceSignals: [...(signals || [])],
            reason
        },
        fingerprint: stableJson({
            characterId: entry.characterId,
            entityKind: entry.entityKind,
            component: entry.component,
            kind,
            fieldPath: null,
            value: null,
            unit: "unknown",
            operation: null,
            sourceDigest: pointer.textDigest
        })
    };
}

function extractEntryCandidates(entry) {
    const text = String(entry.text || "");
    if (!text) return [];
    const signals = signalKinds(text);
    const analysis = behavior.createExtractor(text, [entry.sourceId]);
    const candidates = [];
    const add = (candidate) => {
        const key = candidate.fingerprint;
        if (!candidates.some((existing) => existing.fingerprint === key)) candidates.push(candidate);
    };
    ["timing", "execution"].forEach((section) => {
        Object.entries(analysis[section] || {}).forEach(([field, measurement]) => {
            if (!measurement || measurement.status !== "explicit") return;
            const kind = kindForMeasurement(section, field, text);
            add(explicitCandidate({
                entry,
                sourceId: entry.sourceId,
                pointer: entry.pointer,
                kind,
                fieldPath: `/${section}/${field}`,
                value: measurement.value,
                unit: measurement.unit,
                signals,
                notes: measurement.notes
            }));
        });
    });
    // Refresh mode is a parser-visible lifecycle keyword.  It is kept as an
    // enum candidate, never converted into a duration or trigger count.
    if (analysis.lifecycle?.refreshMode && analysis.lifecycle.refreshMode !== "none") {
        add(explicitCandidate({
            entry,
            sourceId: entry.sourceId,
            pointer: entry.pointer,
            kind: "refresh",
            fieldPath: "/lifecycle/refreshMode",
            value: analysis.lifecycle.refreshMode,
            unit: "enum",
            signals,
            notes: "Copied from an explicit lifecycle refresh keyword."
        }));
    }
    const changes = behavior.extractModifierChanges(text, { sourceKind: entry.sourceKind });
    changes.forEach((change) => {
        const kind = kindForChange(change);
        if (!kind) return;
        add(explicitCandidate({
            entry,
            sourceId: entry.sourceId,
            pointer: entry.pointer,
            kind,
            fieldPath: change.path,
            value: change.value,
            unit: unitForPath(change.path),
            operation: change.operation,
            signals,
            notes: change.notes
        }));
    });
    const extractedKinds = new Set(candidates.map((candidate) => candidate.kind));
    signals.forEach((signal) => {
        if (!extractedKinds.has(signal)) {
            add(unknownCandidate({
                entry,
                sourceId: entry.sourceId,
                pointer: entry.pointer,
                kind: signal,
                signals,
                reason: "EXPLICIT_SOURCE_SIGNAL_NOT_PARSED"
            }));
        }
    });
    return candidates;
}

function collectEntries({ characters, talents, constellations, sourceRecords }) {
    const entries = [];
    Object.keys(characters).sort().forEach((characterId) => {
        const catalogId = `behavior-inventory:source:${characterId}:catalog`;
        putSource(sourceRecords, sourceRecord({
            id: catalogId,
            dataset: "characters.json",
            record: `/${characterId}`,
            text: stableJson(characters[characterId] || {}),
            structuredValue: characters[characterId] || {},
            notes: "Character identity source; behavior inventory never infers values from catalog prose."
        }));
        const talent = talents[characterId] || {};
        TALENT_SECTIONS.forEach((section) => {
            const value = talent[section];
            if (!isObject(value)) return;
            const fields = section === "normalAttack"
                ? ["normalDescriptionJa", "chargedDescriptionJa", "plungingDescriptionJa"]
                : ["descriptionJa"];
            fields.forEach((field) => {
                if (!Object.prototype.hasOwnProperty.call(value, field)) return;
                const text = String(value[field] || "");
                const component = section === "normalAttack"
                    ? `${section}.${field.replace("DescriptionJa", "").replace(/^(normal|charged|plunging)$/, "$1")}`
                    : section;
                const sourceId = sourceIdFor(characterId, "talent", section, field);
                const record = `/${characterId}/${section}`;
                const pointer = sourcePointer({ sourceId, dataset: "character-talents.json", record, field, text, present: text.length > 0 });
                putSource(sourceRecords, sourceRecord({
                    id: sourceId,
                    dataset: "character-talents.json",
                    record,
                    field,
                    text,
                    structuredValue: { characterId, section, field, value: text },
                    notes: "Raw talent text; only explicit parser fields become candidates."
                }));
                entries.push({ characterId, sourceKind: "talent", entityKind: "talent", component, field, text, sourceId, pointer });
            });
        });
        (Array.isArray(talent.passives) ? talent.passives : []).forEach((passive, index) => {
            if (!Object.prototype.hasOwnProperty.call(passive || {}, "descriptionJa")) return;
            const text = String(passive?.descriptionJa || "");
            const sourceKey = passive?.sourceId || `passive_${index + 1}`;
            const sourceId = sourceIdFor(characterId, "talent", `passives.${sourceKey}`, "descriptionJa", index);
            const record = `/${characterId}/passives/${index}`;
            const pointer = sourcePointer({ sourceId, dataset: "character-talents.json", record, field: "descriptionJa", text, present: text.length > 0 });
            putSource(sourceRecords, sourceRecord({
                id: sourceId,
                dataset: "character-talents.json",
                record,
                field: "descriptionJa",
                text,
                structuredValue: { characterId, sourceId: sourceKey, index, field: "descriptionJa", value: text },
                notes: "Raw passive text; only explicit parser fields become candidates."
            }));
            entries.push({ characterId, sourceKind: "talent", entityKind: "talent", component: `passives.${sourceKey}`, field: "descriptionJa", text, sourceId, pointer });
        });
        const constellationSet = constellations[characterId]?.constellations || {};
        Object.keys(constellationSet).sort((a, b) => Number(a) - Number(b)).forEach((level) => {
            const value = constellationSet[level] || {};
            if (!Object.prototype.hasOwnProperty.call(value, "effectText")) return;
            const text = String(value.effectText || "");
            const sourceId = sourceIdFor(characterId, "constellation", `C${level}`, "effectText", Number(level));
            const record = `/${characterId}/constellations/${level}`;
            const pointer = sourcePointer({ sourceId, dataset: "character-constellations.json", record, field: "effectText", text, present: text.length > 0 });
            putSource(sourceRecords, sourceRecord({
                id: sourceId,
                dataset: "character-constellations.json",
                record,
                field: "effectText",
                text,
                structuredValue: { characterId, constellation: Number(level), nameJa: value.nameJa || null, effectText: text },
                notes: "Raw constellation text; only explicit parser fields become candidates."
            }));
            entries.push({ characterId, sourceKind: "constellation", entityKind: "constellation", component: `constellation.${level}`, field: "effectText", level: Number(level), text, sourceId, pointer });
        });
    });
    return entries;
}

function generatedFrom(dataRoot) {
    return INPUT_FILES.filter((fileName) => fs.existsSync(path.join(dataRoot, fileName))).map((fileName) => ({
        dataset: fileName,
        path: `games/genshin/data/${fileName}`,
        integrity: { algorithm: "sha256", digest: fileDigest(path.join(dataRoot, fileName)) }
    }));
}

function pilotFingerprintSet(pilot) {
    const set = new Set();
    Object.values(pilot.specs || {}).forEach((spec) => {
        const sourceId = spec.sourceRefs?.[0];
        const source = pilot.sourceRecords?.[sourceId];
        const sourceDigest = digest(source?.text || "");
        ["timing", "execution", "energy"].forEach((section) => {
            Object.entries(spec[section] || {}).forEach(([field, measurement]) => {
                const kind = kindForMeasurement(section, field, source?.text || "");
                set.add(stableJson({
                    characterId: spec.entity.id,
                    entityKind: spec.entity.kind,
                    component: spec.entity.component,
                    kind,
                    fieldPath: `/${section}/${field}`,
                    value: measurement.value,
                    unit: measurement.unit,
                    operation: "set",
                    sourceDigest
                }));
            });
        });
        if (spec.lifecycle?.refreshMode && spec.lifecycle.refreshMode !== "none") {
            set.add(stableJson({
                characterId: spec.entity.id,
                entityKind: spec.entity.kind,
                component: spec.entity.component,
                kind: "refresh",
                fieldPath: "/lifecycle/refreshMode",
                value: spec.lifecycle.refreshMode,
                unit: "enum",
                operation: "set",
                sourceDigest
            }));
        }
    });
    Object.values(pilot.modifiers || {}).forEach((modifier) => {
        const target = pilot.specs?.[modifier.targetSpecId];
        const source = pilot.sourceRecords?.[modifier.sourceRefs?.[0]];
        const kind = kindForChange({ path: modifier.path });
        if (!target || !kind) return;
        set.add(stableJson({
            characterId: target.entity.id,
            entityKind: target.entity.kind,
            component: target.entity.component,
            kind,
            fieldPath: modifier.path,
            value: modifier.value,
            unit: unitForPath(modifier.path),
            operation: modifier.operation,
            sourceDigest: digest(source?.text || "")
        }));
    });
    return set;
}

function loadPilot(dataRoot) {
    const file = path.join(dataRoot, "v2", "characters", "behavior-pilot.json");
    if (fs.existsSync(file)) return readJson(file);
    return behavior.buildDataset({ dataRoot });
}

function buildDataset({ dataRoot = defaultDataRoot } = {}) {
    const characters = readJson(path.join(dataRoot, "characters.json"));
    const talents = readJson(path.join(dataRoot, "character-talents.json"));
    const constellations = readJson(path.join(dataRoot, "character-constellations.json"));
    const sourceRecords = {};
    const entries = collectEntries({ characters, talents, constellations, sourceRecords });
    const pilot = loadPilot(dataRoot);
    const pilotFingerprints = pilotFingerprintSet(pilot);
    const allCandidates = [];
    const entriesByCharacter = new Map();
    entries.forEach((entry) => {
        const candidates = extractEntryCandidates(entry);
        const list = entriesByCharacter.get(String(entry.characterId)) || [];
        list.push({ entry, candidates });
        entriesByCharacter.set(String(entry.characterId), list);
        candidates.forEach((candidate) => allCandidates.push(candidate));
    });
    const pilotCandidates = allCandidates.filter((candidate) => PILOT_IDS.includes(String(candidate.entity.id)));
    const overlappingPilotCandidates = pilotCandidates.filter((candidate) => pilotFingerprints.has(candidate.fingerprint));
    const expansionCandidates = allCandidates.filter((candidate) => !PILOT_IDS.includes(String(candidate.entity.id)));
    const candidates = {};
    expansionCandidates.forEach((candidate) => {
        const sourcePart = candidate.sourceRefs[0].replace(/^behavior-inventory:source:/, "");
        candidate.id = `behavior-inventory:${sourcePart}:${candidate.kind}:${candidate.status}:${digest(candidate.fingerprint).slice(0, 16)}`;
        candidates[candidate.id] = candidate;
    });
    const statuses = {};
    const kinds = {};
    const charactersIndex = {};
    let rawTalentFields = 0;
    let rawConstellationFields = 0;
    let nonEmptyTalentFields = 0;
    let nonEmptyConstellationFields = 0;
    let signalFields = 0;
    entries.forEach((entry) => {
        const grouped = entriesByCharacter.get(String(entry.characterId)) || [];
        const own = grouped.find((item) => item.entry.sourceId === entry.sourceId);
        const sourceCandidates = own?.candidates || [];
        if (entry.sourceKind === "talent") {
            rawTalentFields += 1;
            if (entry.text) nonEmptyTalentFields += 1;
        } else {
            rawConstellationFields += 1;
            if (entry.text) nonEmptyConstellationFields += 1;
        }
        if (signalKinds(entry.text).length) signalFields += 1;
    });
    Object.values(candidates).forEach((candidate) => {
        statuses[candidate.status] = (statuses[candidate.status] || 0) + 1;
        kinds[candidate.kind] = (kinds[candidate.kind] || 0) + 1;
    });
    Object.keys(characters).sort().forEach((characterId) => {
        const grouped = entriesByCharacter.get(String(characterId)) || [];
        const ownEntries = grouped.flatMap((item) => item.candidates);
        const ownExpansion = ownEntries.filter((candidate) => !PILOT_IDS.includes(String(candidate.entity.id)));
        charactersIndex[characterId] = {
            id: characterId,
            pilot: PILOT_IDS.includes(characterId),
            expansionEligible: !PILOT_IDS.includes(characterId),
            sourceRecordIds: [
                `behavior-inventory:source:${characterId}:catalog`,
                ...grouped.map((item) => item.entry.sourceId)
            ].sort(),
            rawTalentFields: grouped.filter((item) => item.entry.sourceKind === "talent").length,
            rawConstellationFields: grouped.filter((item) => item.entry.sourceKind === "constellation").length,
            sourceSignalFields: grouped.filter((item) => signalKinds(item.entry.text).length).length,
            candidateIds: ownExpansion.map((candidate) => candidate.id).filter(Boolean).sort(),
            suppressedPilotCandidates: PILOT_IDS.includes(characterId) ? ownEntries.length : 0,
            status: ownExpansion.length ? "candidate" : "unknown"
        };
    });
    const sourceKindCounts = {};
    Object.values(sourceRecords).forEach((source) => { sourceKindCounts[source.kind] = (sourceKindCounts[source.kind] || 0) + 1; });
    const summary = {
        schemaVersion: 2,
        characters: Object.keys(characters).length,
        pilotCharacters: PILOT_IDS.length,
        expansionCharacters: Object.keys(characters).length - PILOT_IDS.length,
        rawTalentFields,
        rawConstellationFields,
        rawFields: rawTalentFields + rawConstellationFields,
        nonEmptyTalentFields,
        nonEmptyConstellationFields,
        sourceSignalFields: signalFields,
        sourceRecords: Object.keys(sourceRecords).length,
        extractedCandidatesBeforePilotDedup: allCandidates.length,
        pilotCandidatesSuppressed: pilotCandidates.length,
        pilotOverlapCandidates: overlappingPilotCandidates.length,
        candidates: Object.keys(candidates).length,
        candidateStatusCounts: statuses,
        candidateKindCounts: kinds,
        sourceKindCounts,
        canonical: 0,
        verificationByStatus: { needsReview: Object.keys(candidates).length },
        sourceRefsResolved: true,
        capturedAt: CAPTURED_AT,
        gameVersion: null,
        generatedFrom: generatedFrom(dataRoot)
    };
    return {
        schemaVersion: 2,
        kind: "genshinBehaviorV2Inventory",
        generator: { name: "genshinBehaviorV2InventoryGenerate.cjs", version: GENERATOR_VERSION, capturedAt: CAPTURED_AT },
        summary,
        pilotIds: [...PILOT_IDS],
        characters: charactersIndex,
        sourceRecords,
        candidates,
        pilotOverlap: {
            suppressedCharacterIds: [...PILOT_IDS],
            suppressedCount: pilotCandidates.length,
            fingerprintMatches: overlappingPilotCandidates.length,
            note: "All candidates originating from the eight pilot characters are excluded from expansion candidates; source text remains represented for audit."
        }
    };
}

function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeDataset({ dataRoot = defaultDataRoot, outputFile = defaultOutputFile, manifestFile = defaultManifestFile } = {}) {
    const dataset = buildDataset({ dataRoot });
    writeJson(outputFile, dataset);
    writeJson(manifestFile, {
        schemaVersion: 2,
        kind: "genshinBehaviorV2InventoryManifest",
        generator: dataset.generator,
        summary: dataset.summary,
        paths: {
            inventory: path.basename(outputFile),
            audit: "behavior-inventory-audit.json"
        }
    });
    return dataset;
}

if (require.main === module) {
    const dataRoot = process.env.GENSHIN_DATA_ROOT || defaultDataRoot;
    const outputFile = process.env.GENSHIN_BEHAVIOR_V2_INVENTORY_FILE || defaultOutputFile;
    const manifestFile = process.env.GENSHIN_BEHAVIOR_V2_INVENTORY_MANIFEST || defaultManifestFile;
    process.stdout.write(`${JSON.stringify(writeDataset({ dataRoot, outputFile, manifestFile }).summary, null, 2)}\n`);
}

module.exports = {
    CAPTURED_AT,
    GENERATOR_VERSION,
    INPUT_FILES,
    PILOT_IDS,
    SIGNAL_PATTERNS,
    buildDataset,
    candidatesForEntry: extractEntryCandidates,
    collectEntries,
    digest,
    generatedFrom,
    kindForChange,
    kindForMeasurement,
    loadPilot,
    pilotFingerprintSet,
    signalKinds,
    stableJson,
    writeDataset,
    defaultDataRoot,
    defaultOutputFile,
    defaultManifestFile
};
