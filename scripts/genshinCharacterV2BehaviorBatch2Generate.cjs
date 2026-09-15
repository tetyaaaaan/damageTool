"use strict";

/**
 * Build behavior-v2 batch 2 from the fixed second slice of non-pilot
 * characters.
 *
 * This is intentionally an inventory transform. It retains raw source
 * pointers/text and creates review-gated BehaviorSpec candidates without
 * parsing prose or inferring values. Runtime modifiers and canonical records
 * remain empty/blocked until an independently reviewed source is available.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultDataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultOutputRoot = path.join(defaultDataRoot, "v2", "characters", "behavior-batch-2");
const CAPTURED_AT = "2026-08-16T00:00:00.000Z";
const GENERATOR_VERSION = "genshinCharacterV2BehaviorBatch2Generate/1";

const PILOT_IDS = [
    "10000026", "10000031", "10000037", "10000046",
    "10000058", "10000089", "10000094", "10000098"
];

// Fixed by the sorted non-pilot inventory: the second ten-character slice.
const BATCH_IDS = [
    "10000020", "10000021", "10000022", "10000023", "10000024",
    "10000025", "10000027", "10000029", "10000030", "10000032"
];
const BATCH_OFFSET = 8;

const UNKNOWN_FIELDS = [
    "burstCost", "snapshot", "duration", "tickInterval", "triggerInterval",
    "cooldown", "hitCount", "attackCount", "charges", "maxInstances",
    "maxTriggers", "targetCount", "refreshMode", "expiration", "instanceScope",
    "elementApplication", "energy"
];

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
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

function slug(value) {
    return String(value || "component")
        .replace(/[^A-Za-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "component";
}

function inputManifest(dataRoot) {
    return ["characters.json", "character-talents.json", "character-constellations.json", "v2/characters/behavior-inventory.json"].map((relativePath) => ({
        dataset: relativePath,
        path: `games/genshin/data/${relativePath}`,
        integrity: { algorithm: "sha256", digest: fileDigest(path.join(dataRoot, relativePath)) }
    }));
}

function sourceRecord({ id, dataset, record, field, text, structuredValue, notes }) {
    const source = {
        id,
        kind: "primaryDataset",
        provider: "damageTool-local",
        independenceGroup: "damageTool-local-derived",
        providerIndependence: "correlated",
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

function putRecord(records, record) {
    const previous = records[record.id];
    if (previous && stableJson(previous) !== stableJson(record)) throw new Error(`record id collision: ${record.id}`);
    records[record.id] = record;
    return record.id;
}

function catalogSourceId(characterId) {
    return `source:${characterId}:catalog`;
}

function talentSourceId(characterId, component, field) {
    return `source:${characterId}:talent:${slug(component)}:${field}`;
}

function passiveSourceId(characterId, passiveSource) {
    return `source:${characterId}:talent:passive:${slug(passiveSource)}:descriptionJa`;
}

function constellationSourceId(characterId, level) {
    return `source:${characterId}:constellation:${level}:effectText`;
}

function inventoryCandidateId(characterId, component) {
    return `behavior-inventory:batch-2:${characterId}:${slug(component)}`;
}

function specId(characterId, component) {
    const kind = String(component).startsWith("constellation.") ? "constellation" : "talent";
    return `behavior:${characterId}:${kind}:${slug(component)}`;
}

function sourceContext({ characterId, kind, component, field, text, sourceId, level, record }) {
    return { characterId, kind, component, field, text, sourceId, level: level === undefined ? null : level, record: record || null };
}

function unknownLifecycle() {
    return { refreshMode: "unknown", expiration: "unknown", instanceScope: "unknown" };
}

function claim(sourceRef, notes) {
    return { status: "needsReview", sourceRefs: [sourceRef], notes };
}

const MEASUREMENT_PATHS = new Set([
    "/timing/cooldown", "/timing/duration", "/timing/tickInterval", "/timing/triggerInterval", "/timing/activationDelay",
    "/execution/hitCount", "/execution/attackCount", "/execution/maxTriggers", "/execution/charges",
    "/execution/maxInstances", "/execution/offField", "/execution/snapshot", "/execution/area", "/execution/targetCount",
    "/energy/burstCost", "/energy/gain", "/energy/particleCount", "/energy/particleElement",
    "/elementApplication/element", "/elementApplication/gaugeUnits", "/elementApplication/icdInterval",
    "/elementApplication/icdHitRule", "/elementApplication/icdScope"
]);

function measurementFromInventory(candidate, sourceRefs) {
    return {
        value: clone(candidate.value),
        unit: candidate.unit || "unknown",
        status: "explicit",
        sourceRefs: [...sourceRefs],
        notes: `Inventory candidate ${candidate.id}; operation=${candidate.operation || "set"}.`
    };
}

function discrepancyFromInventory(candidate, sourceRefs, resolvedSourceRefs) {
    return {
        code: candidate.status === "candidate" ? "INVENTORY_CANDIDATE_OPERATION" : "INVENTORY_UNKNOWN_CANDIDATE",
        candidateId: candidate.id,
        candidateStatus: candidate.status,
        kind: candidate.kind || null,
        fieldPath: candidate.fieldPath || null,
        operation: candidate.operation || null,
        value: clone(candidate.value),
        unit: candidate.unit || "unknown",
        sourceRefs: [...resolvedSourceRefs],
        inventorySourceRefs: [...sourceRefs]
    };
}

function applyInventoryCandidates({ spec, candidates = [], sourceRefMap = {} }) {
    const inventoryCandidateIds = candidates.map((candidate) => candidate.id).filter(Boolean).sort();
    const unknownCandidateIds = candidates.filter((candidate) => candidate.status === "unknown").map((candidate) => candidate.id).filter(Boolean).sort();
    const discrepancies = spec.verification.discrepancies;
    const grouped = new Map();
    const lifecycleRefresh = [];
    candidates.forEach((candidate) => {
        const sourceRefs = (candidate.sourceRefs || []).map((sourceRef) => sourceRefMap[sourceRef]).filter(Boolean);
        const resolved = sourceRefs.length ? sourceRefs : [spec.sourceRefs[0]];
        discrepancies.push(discrepancyFromInventory(candidate, candidate.sourceRefs || [], resolved));
        if (candidate.status !== "candidate" || !candidate.fieldPath) return;
        if (candidate.fieldPath === "/lifecycle/refreshMode") {
            lifecycleRefresh.push({ candidate, sourceRefs: resolved });
            return;
        }
        if (!MEASUREMENT_PATHS.has(candidate.fieldPath)) return;
        const [section, field] = String(candidate.fieldPath).split("/").slice(1);
        if (!spec[section] || !Object.prototype.hasOwnProperty.call(spec[section], field)) return;
        const list = grouped.get(candidate.fieldPath) || [];
        list.push({ candidate, sourceRefs: resolved });
        grouped.set(candidate.fieldPath, list);
    });
    grouped.forEach((entries, fieldPath) => {
        entries.sort((left, right) => {
            const leftNull = left.candidate.value === null || left.candidate.value === undefined;
            const rightNull = right.candidate.value === null || right.candidate.value === undefined;
            if (leftNull !== rightNull) return leftNull ? 1 : -1;
            const leftSet = left.candidate.operation === "set" ? 0 : 1;
            const rightSet = right.candidate.operation === "set" ? 0 : 1;
            if (leftSet !== rightSet) return leftSet - rightSet;
            return String(left.candidate.id).localeCompare(String(right.candidate.id));
        });
        const [section, field] = String(fieldPath).split("/").slice(1);
        const first = entries[0];
        spec[section][field] = measurementFromInventory(first.candidate, first.sourceRefs);
        const distinctValues = [...new Set(entries.map((entry) => stableJson(entry.candidate.value)))];
        if (distinctValues.length > 1) {
            discrepancies.push({
                code: "FIELD_CONFLICT",
                fieldPath,
                candidateIds: entries.map((entry) => entry.candidate.id),
                values: entries.map((entry) => clone(entry.candidate.value)),
                sourceRefs: [...new Set(entries.flatMap((entry) => entry.sourceRefs))]
            });
        }
    });
    if (lifecycleRefresh.length) {
        const values = [...new Set(lifecycleRefresh.map((entry) => stableJson(entry.candidate.value)))];
        if (values.length === 1 && lifecycleRefresh[0].candidate.value !== null && lifecycleRefresh[0].candidate.value !== undefined) {
            spec.lifecycle.refreshMode = lifecycleRefresh[0].candidate.value;
        } else {
            spec.lifecycle.refreshMode = "unknown";
            discrepancies.push({
                code: "FIELD_CONFLICT",
                fieldPath: "/lifecycle/refreshMode",
                candidateIds: lifecycleRefresh.map((entry) => entry.candidate.id),
                values: lifecycleRefresh.map((entry) => clone(entry.candidate.value)),
                sourceRefs: [...new Set(lifecycleRefresh.flatMap((entry) => entry.sourceRefs))]
            });
        }
    }
    return { inventoryCandidateIds, unknownCandidateIds };
}

function buildSpec({ context, inventoryId, inventoryCandidates = [], sourceRefMap = {} }) {
    const id = specId(context.characterId, context.component);
    const sourceRef = context.sourceId;
    const spec = {
        id,
        entity: {
            kind: context.kind === "constellation" ? "constellation" : "talent",
            id: String(context.characterId),
            component: context.component
        },
        sourceRefs: [sourceRef],
        interpretation: {
            method: "deterministicParser",
            author: "genshinCharacterV2BehaviorBatch2Generate.cjs",
            version: GENERATOR_VERSION,
            notes: "Raw source pointer and inventory candidate only; no prose parsing or value inference was performed."
        },
        timing: { cooldown: undefined, duration: undefined, tickInterval: undefined, triggerInterval: undefined, activationDelay: undefined },
        execution: { hitCount: undefined, attackCount: undefined, maxTriggers: undefined, charges: undefined, maxInstances: undefined, offField: undefined, snapshot: undefined, area: undefined, targetCount: undefined },
        lifecycle: unknownLifecycle(),
        energy: { burstCost: undefined, gain: undefined, particleCount: undefined, particleElement: undefined },
        elementApplication: { element: undefined, gaugeUnits: undefined, icdInterval: undefined, icdHitRule: undefined, icdScope: undefined },
        unknownFields: [...UNKNOWN_FIELDS],
        verification: {
            status: "needsReview",
            reviewedBy: null,
            reviewedAt: null,
            sourceAgreement: "unknown",
            claims: {
                sourceText: claim(sourceRef, "Raw source text is retained; independent review is required."),
                timing: claim(sourceRef, "Duration, interval, and cooldown are unknown; no prose was parsed."),
                execution: claim(sourceRef, "Hit/count/charge fields are unknown; no prose was parsed."),
                lifecycle: claim(sourceRef, "Refresh, expiration, and instance scope are unknown."),
                energy: claim(sourceRef, "Energy and burst cost are unknown; burstCost remains a forbidden inferred field."),
                snapshot: claim(sourceRef, "Snapshot behavior is unknown and intentionally unmodeled."),
                runtime: claim(sourceRef, "Runtime connection is blocked until independent review and versioned source agreement.")
            },
            discrepancies: [
                { code: "RAW_SOURCE_INVENTORY_ONLY", sourceRefs: [sourceRef] },
                { code: "INDEPENDENT_SOURCE_REQUIRED", sourceRefs: [sourceRef] },
                { code: "CANONICAL_RUNTIME_FORBIDDEN", sourceRefs: [sourceRef] }
            ]
        },
        runtime: {
            status: "blocked",
            modifierIds: [],
            generator: null,
            blockedReasons: [
                "verificationStatusNeedsReview",
                "inventoryCandidateOnly",
                "independentSourceRequired",
                "canonicalPromotionForbidden"
            ]
        },
        inventoryCandidateId: inventoryId
    };
    const inventory = applyInventoryCandidates({ spec, candidates: inventoryCandidates, sourceRefMap });
    // Remove undefined measurement placeholders after applying explicit
    // inventory values. This keeps the object compatible with the strict
    // behavior-spec measurement schema while retaining unknown fields in the
    // separate unknownFields list.
    ["timing", "execution", "energy", "elementApplication"].forEach((section) => {
        Object.keys(spec[section]).forEach((field) => {
            if (spec[section][field] === undefined) delete spec[section][field];
        });
    });
    spec.inventoryCandidateIds = inventory.inventoryCandidateIds;
    spec.unknownCandidateIds = inventory.unknownCandidateIds;
    return spec;
}

function buildInventoryCandidate({ context, sourceRef }) {
    const id = inventoryCandidateId(context.characterId, context.component);
    return {
        id,
        entity: {
            kind: context.kind === "constellation" ? "constellation" : "talent",
            id: String(context.characterId),
            component: context.component
        },
        sourceRefs: [sourceRef],
        status: "needsReview",
        unknown: true,
        sourcePointer: {
            dataset: context.kind === "constellation" ? "character-constellations.json" : "character-talents.json",
            record: context.record || (context.kind === "constellation"
                ? `/${context.characterId}/constellations/${context.level}`
                : `/${context.characterId}`),
            field: context.field
        },
        notes: "Inventory pointer only. Values, units, targets, and lifecycle are not inferred from source text."
    };
}

function appendTalentContexts({ characterId, talent, sourceRecords, contexts }) {
    const add = (component, field, text, sourceId, structuredValue, record, extra = {}) => {
        if (typeof text !== "string" || !text) return;
        putRecord(sourceRecords, sourceRecord({
            id: sourceId,
            dataset: "character-talents.json",
            record: record || `/${characterId}/${component}`,
            field,
            text,
            structuredValue,
            notes: "Original Japanese talent text; no behavior values are inferred in batch 2."
        }));
        contexts.push(sourceContext({ characterId, kind: "talent", component, field, text, sourceId, record: record || `/${characterId}/${component}`, ...extra }));
    };
    const normal = talent.normalAttack || {};
    [["normal", "normalDescriptionJa"], ["charged", "chargedDescriptionJa"], ["plunging", "plungingDescriptionJa"]].forEach(([component, field]) => {
        add(`normalAttack.${component}`, field, normal[field], talentSourceId(characterId, "normalAttack", field), { characterId, component: `normalAttack.${component}`, field }, `/${characterId}/normalAttack`);
    });
    ["skill", "burst", "special"].forEach((component) => {
        add(component, "descriptionJa", talent[component]?.descriptionJa, talentSourceId(characterId, component, "descriptionJa"), { characterId, component, field: "descriptionJa" });
    });
    (talent.passives || []).forEach((passive, index) => {
        const passiveSource = passive?.sourceId || `passive_${index + 1}`;
        add(`passives.${passiveSource}`, "descriptionJa", passive?.descriptionJa, passiveSourceId(characterId, passiveSource), {
            characterId,
            component: `passives.${passiveSource}`,
            field: "descriptionJa",
            passiveIndex: index,
            passiveSourceId: passiveSource,
            passiveName: passive?.nameJa || null
        }, `/${characterId}/passives/${index}`, { passiveIndex: index });
    });
}

function appendConstellationContexts({ characterId, constellations, sourceRecords, contexts }) {
    Object.entries(constellations[characterId]?.constellations || {})
        .sort(([left], [right]) => Number(left) - Number(right))
        .forEach(([level, entry]) => {
            const text = entry?.effectText;
            if (typeof text !== "string" || !text) return;
            const sourceId = constellationSourceId(characterId, level);
            putRecord(sourceRecords, sourceRecord({
                id: sourceId,
                dataset: "character-constellations.json",
                record: `/${characterId}/constellations/${level}`,
                field: "effectText",
                text,
                structuredValue: { characterId, level: Number(level), nameJa: entry?.nameJa || null },
                notes: "Original Japanese constellation text; no behavior values are inferred in batch 2."
            }));
            contexts.push(sourceContext({ characterId, kind: "constellation", component: `constellation.${level}`, field: "effectText", text, sourceId, level: Number(level) }));
        });
}

function buildInventorySourceMap({ inventory, sourceRecords }) {
    const map = {};
    const direct = Object.values(sourceRecords || {});
    Object.entries(inventory?.sourceRecords || {}).forEach(([inventorySourceId, source]) => {
        const dataset = source?.locator?.dataset;
        const digestValue = source?.integrity?.digest;
        const record = source?.locator?.record;
        const field = source?.locator?.field;
        const matches = direct.filter((candidate) => (
            candidate?.locator?.dataset === dataset
            && candidate?.integrity?.digest === digestValue
            && (!field || candidate?.locator?.field === field)
        ));
        const exact = matches.find((candidate) => candidate?.locator?.record === record) || matches[0];
        if (exact?.id) map[inventorySourceId] = exact.id;
    });
    return map;
}

function inventoryCandidatesForContext({ inventory, characterId, component }) {
    return Object.values(inventory?.candidates || {})
        .filter((candidate) => String(candidate?.entity?.id) === String(characterId) && candidate?.entity?.component === component)
        .map(clone)
        .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function buildDataset({ dataRoot = defaultDataRoot } = {}) {
    const characters = readJson(path.join(dataRoot, "characters.json"));
    const talents = readJson(path.join(dataRoot, "character-talents.json"));
    const constellations = readJson(path.join(dataRoot, "character-constellations.json"));
    const behaviorInventory = readJson(path.join(dataRoot, "v2", "characters", "behavior-inventory.json"));
    const allIds = Object.keys(characters).sort();
    const eligibleIds = allIds.filter((id) => !PILOT_IDS.includes(id));
    const selectedIds = eligibleIds.slice(BATCH_OFFSET, BATCH_OFFSET + BATCH_IDS.length);
    if (stableJson(selectedIds) !== stableJson(BATCH_IDS)) {
        throw new Error(`batch 2 IDs do not match the second sorted non-pilot inventory slice: ${selectedIds.join(",")}`);
    }
    const sourceRecords = {};
    const inventoryCandidates = {};
    const specs = {};
    const modifiers = {};
    const byCharacter = {};
    const inventorySignalCandidates = Object.values(behaviorInventory.candidates || {})
        .filter((candidate) => BATCH_IDS.includes(String(candidate?.entity?.id)))
        .map(clone)
        .sort((left, right) => String(left.id).localeCompare(String(right.id)));

    selectedIds.forEach((characterId) => {
        const character = characters[characterId] || {};
        const talent = talents[characterId] || {};
        const contexts = [];
        const catalogId = catalogSourceId(characterId);
        putRecord(sourceRecords, sourceRecord({
            id: catalogId,
            dataset: "characters.json",
            record: `/${characterId}`,
            text: stableJson(character),
            structuredValue: character,
            notes: "Character identity source for batch membership; no behavior values are inferred."
        }));
        appendTalentContexts({ characterId, talent, sourceRecords, contexts });
        appendConstellationContexts({ characterId, constellations, sourceRecords, contexts });

        const sourceRecordIds = [catalogId, ...contexts.map((context) => context.sourceId)];
        const inventoryIds = [];
        const specIds = [];
        const inventorySignalIds = [];
        const unknownSignalIds = [];
        const sourceRefMap = buildInventorySourceMap({ inventory: behaviorInventory, sourceRecords });
        contexts.forEach((context) => {
            const inventory = buildInventoryCandidate({ context, sourceRef: context.sourceId });
            const inventorySignals = inventoryCandidatesForContext({ inventory: behaviorInventory, characterId, component: context.component });
            const spec = buildSpec({ context, inventoryId: inventory.id, inventoryCandidates: inventorySignals, sourceRefMap });
            putRecord(inventoryCandidates, inventory);
            putRecord(specs, spec);
            inventoryIds.push(inventory.id);
            specIds.push(spec.id);
            inventorySignalIds.push(...(spec.inventoryCandidateIds || []));
            unknownSignalIds.push(...(spec.unknownCandidateIds || []));
        });
        byCharacter[characterId] = {
            characterId,
            characterName: character.nameJa || null,
            status: "needsReview",
            canonical: 0,
            sourceRecordIds: sourceRecordIds.sort(),
            inventoryCandidateIds: inventoryIds.sort(),
            inventorySignalCandidateIds: [...new Set(inventorySignalIds)].sort(),
            unknownCandidateIds: [...new Set(unknownSignalIds)].sort(),
            specIds: specIds.sort(),
            modifierIds: [],
            reasons: ["FIXED_BATCH_2", "PILOT_EXCLUDED", "RAW_SOURCE_POINTER_ONLY", "RUNTIME_CONNECTION_ZERO"]
        };
    });

    const verificationByStatus = {};
    const runtimeByStatus = {};
    Object.values(specs).forEach((spec) => {
        verificationByStatus[spec.verification.status] = (verificationByStatus[spec.verification.status] || 0) + 1;
        runtimeByStatus[spec.runtime.status] = (runtimeByStatus[spec.runtime.status] || 0) + 1;
    });
    const generatedFrom = inputManifest(dataRoot);
    const summary = {
        schemaVersion: 2,
        batch: 2,
        batchCharacters: selectedIds.length,
        inventoryCharacters: eligibleIds.length,
        sourceRecords: Object.keys(sourceRecords).length,
        inventoryCandidates: Object.keys(inventoryCandidates).length,
        inventorySignalCandidates: inventorySignalCandidates.length,
        inventorySignalCandidateStatusCounts: inventorySignalCandidates.reduce((result, candidate) => {
            result[candidate.status] = (result[candidate.status] || 0) + 1;
            return result;
        }, {}),
        sourceInventoryCandidates: inventorySignalCandidates.length,
        explicitInventoryCandidates: inventorySignalCandidates.filter((candidate) => candidate.status === "candidate").length,
        unknownInventoryCandidates: inventorySignalCandidates.filter((candidate) => candidate.status === "unknown").length,
        inventoryExplicitCandidates: inventorySignalCandidates.filter((candidate) => candidate.status === "candidate").length,
        inventoryUnknownCandidates: inventorySignalCandidates.filter((candidate) => candidate.status === "unknown").length,
        specs: Object.keys(specs).length,
        modifiers: Object.keys(modifiers).length,
        canonical: 0,
        verificationByStatus,
        runtimeByStatus,
        sourceRefsResolved: true,
        generatedFrom,
        batchIds: [...selectedIds],
        excludedPilotIds: [...PILOT_IDS],
        sourceKinds: Object.values(sourceRecords).reduce((result, source) => {
            result[source.kind] = (result[source.kind] || 0) + 1;
            return result;
        }, {})
    };
    return {
        schemaVersion: 2,
        kind: "genshinBehaviorV2Batch",
        generator: { name: "genshinCharacterV2BehaviorBatch2Generate.cjs", version: GENERATOR_VERSION, capturedAt: CAPTURED_AT },
        policy: {
            canonical: 0,
            runtimeConnection: "forbidden",
            proseParsing: "forbidden",
            unknownFields: "Unstated values remain unknown; this batch only inventories raw source pointers."
        },
        summary,
        batch: 2,
        batchIds: [...selectedIds],
        excludedPilotIds: [...PILOT_IDS],
        generatedFrom,
        byCharacter,
        sourceRecords,
        inventoryCandidates,
        specs,
        modifiers
    };
}

function writeDataset({ dataRoot = defaultDataRoot, outputRoot = defaultOutputRoot } = {}) {
    const dataset = buildDataset({ dataRoot });
    fs.mkdirSync(outputRoot, { recursive: true });
    fs.writeFileSync(path.join(outputRoot, "source-records.json"), `${JSON.stringify(dataset.sourceRecords, null, 2)}\n`, "utf8");
    fs.writeFileSync(path.join(outputRoot, "inventory-candidates.json"), `${JSON.stringify(dataset.inventoryCandidates, null, 2)}\n`, "utf8");
    fs.writeFileSync(path.join(outputRoot, "spec-candidates.json"), `${JSON.stringify(dataset.specs, null, 2)}\n`, "utf8");
    fs.writeFileSync(path.join(outputRoot, "modifiers.json"), `${JSON.stringify(dataset.modifiers, null, 2)}\n`, "utf8");
    const index = {
        schemaVersion: dataset.schemaVersion,
        kind: "genshinBehaviorV2BatchIndex",
        generator: dataset.generator,
        policy: dataset.policy,
        summary: dataset.summary,
        batch: dataset.batch,
        batchIds: dataset.batchIds,
        excludedPilotIds: dataset.excludedPilotIds,
        generatedFrom: dataset.generatedFrom,
        byCharacter: dataset.byCharacter
    };
    fs.writeFileSync(path.join(outputRoot, "index.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");
    fs.writeFileSync(path.join(outputRoot, "manifest.json"), `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
    return dataset;
}

if (require.main === module) {
    const dataRoot = process.env.GENSHIN_DATA_ROOT || defaultDataRoot;
    const outputRoot = process.env.GENSHIN_CHARACTER_V2_BEHAVIOR_BATCH_2_ROOT || defaultOutputRoot;
    process.stdout.write(`${JSON.stringify(writeDataset({ dataRoot, outputRoot }).summary, null, 2)}\n`);
}

module.exports = {
    BATCH_IDS,
    BATCH_OFFSET,
    CAPTURED_AT,
    GENERATOR_VERSION,
    MEASUREMENT_PATHS,
    PILOT_IDS,
    UNKNOWN_FIELDS,
    appendConstellationContexts,
    appendTalentContexts,
    buildDataset,
    buildInventoryCandidate,
    buildSpec,
    applyInventoryCandidates,
    buildInventorySourceMap,
    inventoryCandidatesForContext,
    buildSourceRecord: sourceRecord,
    defaultDataRoot,
    defaultOutputRoot,
    digest,
    inputManifest,
    inventoryCandidateId,
    specId,
    stableJson,
    writeDataset
};
