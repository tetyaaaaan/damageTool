"use strict";

/**
 * Build the third review-gated character behavior-v2 batch.
 *
 * This is deliberately an inventory transform.  Raw source pointers are
 * retained as SourceRecords and one unknown BehaviorSpec candidate is emitted
 * for every talent/constellation pointer.  No prose parsing or value
 * inference is performed: runtime modifiers and canonical records remain
 * empty/blocked until independent review.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultDataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultOutputRoot = path.join(defaultDataRoot, "v2", "characters", "behavior-batch-3");
const CAPTURED_AT = "2026-08-15T00:00:00.000Z";
const GENERATOR_VERSION = "genshinCharacterV2BehaviorBatch3Generate/1";

const PILOT_IDS = [
    "10000026", "10000031", "10000037", "10000046",
    "10000058", "10000089", "10000094", "10000098"
];

// Fixed by the sorted non-pilot inventory.  Do not infer or extend this set.
const BATCH_IDS = [
    "10000033", "10000034", "10000035", "10000036", "10000038",
    "10000039", "10000041", "10000042", "10000043", "10000044"
];

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
    return ["characters.json", "character-talents.json", "character-constellations.json", "v2/characters/behavior-inventory.json"].map((dataset) => ({
        dataset,
        path: `games/genshin/data/${dataset}`,
        integrity: { algorithm: "sha256", digest: fileDigest(path.join(dataRoot, dataset)) }
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
    return `behavior-inventory:batch-3:${characterId}:${slug(component)}`;
}

function specId(characterId, component) {
    const kind = String(component).startsWith("constellation.") ? "constellation" : "talent";
    return `behavior:${characterId}:${kind}:${slug(component)}`;
}

function sourceContext({ characterId, kind, component, field, text, sourceId, level, passiveIndex }) {
    const context = { characterId, kind, component, field, text, sourceId, level: level === undefined ? null : level };
    if (passiveIndex !== undefined) context.passiveIndex = passiveIndex;
    return context;
}

function unknownLifecycle() {
    return { refreshMode: "unknown", expiration: "unknown", instanceScope: "unknown" };
}

function claim(sourceRef, notes) {
    return { status: "needsReview", sourceRefs: [sourceRef], notes };
}

const SAFE_MEASUREMENT_PATHS = new Set([
    "/timing/cooldown", "/timing/duration", "/timing/tickInterval", "/timing/triggerInterval",
    "/timing/activationDelay", "/execution/hitCount", "/execution/attackCount",
    "/execution/maxTriggers", "/execution/charges", "/execution/maxInstances",
    "/execution/offField", "/execution/snapshot", "/execution/area", "/execution/targetCount"
]);
const SAFE_LIFECYCLE_PATHS = new Set(["/lifecycle/refreshMode", "/lifecycle/expiration"]);

function candidateDetail(candidate, sourceRef) {
    return {
        id: candidate.id,
        fieldPath: candidate.fieldPath,
        operation: candidate.operation,
        value: clone(candidate.value),
        unit: candidate.unit,
        sourceRefs: [sourceRef]
    };
}

function measurementFromCandidate(candidate, sourceRef) {
    return {
        value: clone(candidate.value),
        unit: candidate.unit || "unknown",
        status: "explicit",
        sourceRefs: [sourceRef],
        notes: `Copied from behavior-inventory candidate ${candidate.id}; operation=${candidate.operation}; no value inference.`
    };
}

function inventoryCandidatesForContext(inventory, characterId, context) {
    const character = inventory?.characters?.[characterId];
    if (!character) return [];
    return (character.candidateIds || [])
        .map((candidateId) => inventory.candidates?.[candidateId])
        .filter((candidate) => candidate
            && candidate.entity?.id === String(characterId)
            && candidate.entity?.component === context.component);
}

function applyInventoryEvidence({ spec, context, inventoryCandidates }) {
    const allIds = inventoryCandidates.map((candidate) => candidate.id).sort();
    const unknownIds = inventoryCandidates.filter((candidate) => candidate.status === "unknown").map((candidate) => candidate.id).sort();
    const explicit = inventoryCandidates.filter((candidate) => candidate.status === "candidate");
    // These root arrays are the traceability bridge back to the existing
    // behavior-inventory artifact.  They intentionally preserve IDs, even
    // when a candidate cannot be mapped without an operation decision.
    spec.inventoryCandidateIds = allIds;
    spec.unknownCandidateIds = unknownIds;
    const discrepancies = spec.verification.discrepancies;
    const grouped = new Map();
    explicit.forEach((candidate) => {
        const key = String(candidate.fieldPath || "");
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(candidate);
    });
    for (const [fieldPath, candidates] of grouped.entries()) {
        const sourceRefs = [context.sourceId];
        const details = candidates.map((candidate) => candidateDetail(candidate, context.sourceId));
        if (!SAFE_MEASUREMENT_PATHS.has(fieldPath) && !SAFE_LIFECYCLE_PATHS.has(fieldPath)) {
            discrepancies.push({ code: "INVENTORY_FIELD_PATH_UNSUPPORTED", fieldPath, sourceRefs, inventoryCandidateIds: candidates.map((candidate) => candidate.id), candidates: details });
            continue;
        }
        if (candidates.length !== 1) {
            discrepancies.push({ code: "INVENTORY_OPERATION_CONFLICT", fieldPath, sourceRefs, inventoryCandidateIds: candidates.map((candidate) => candidate.id), candidates: details });
            continue;
        }
        const candidate = candidates[0];
        if (candidate.value === null && (candidate.operation === "reset" || candidate.operation === "replace")) {
            discrepancies.push({ code: "INVENTORY_NULL_RESET", fieldPath, sourceRefs, inventoryCandidateIds: [candidate.id], candidates: details });
            continue;
        }
        if (SAFE_LIFECYCLE_PATHS.has(fieldPath)) {
            const lifecycleField = fieldPath.slice("/lifecycle/".length);
            // Lifecycle enum values are copied only when the inventory entry
            // itself is explicit and valid; no prose interpretation occurs.
            if (typeof candidate.value === "string" && (lifecycleField === "refreshMode"
                ? ["none", "refresh", "extend", "replace", "independent", "unknown"].includes(candidate.value)
                : ["duration", "triggerLimit", "consumed", "destroyed", "stateEnd", "unknown"].includes(candidate.value))) {
                spec.lifecycle[lifecycleField] = candidate.value;
                spec.unknownFields = spec.unknownFields.filter((field) => field !== lifecycleField);
            } else {
                discrepancies.push({ code: "INVENTORY_LIFECYCLE_VALUE_INVALID", fieldPath, sourceRefs, inventoryCandidateIds: [candidate.id], candidates: details });
                continue;
            }
        } else {
            const [section, field] = fieldPath.slice(1).split("/");
            spec[section][field] = measurementFromCandidate(candidate, context.sourceId);
            spec.unknownFields = spec.unknownFields.filter((unknownField) => unknownField !== field);
        }
        if (candidate.operation !== "set") {
            discrepancies.push({ code: "INVENTORY_OPERATION_REQUIRES_REVIEW", fieldPath, sourceRefs, inventoryCandidateIds: [candidate.id], candidates: details });
        }
    }
    unknownIds.forEach((candidateId) => {
        discrepancies.push({ code: "INVENTORY_UNKNOWN_CANDIDATE", sourceRefs: [context.sourceId], inventoryCandidateIds: [candidateId] });
    });
    return spec;
}

function buildSpec({ context, inventoryId, inventoryCandidates = [] }) {
    const sourceRef = context.sourceId;
    const spec = {
        id: specId(context.characterId, context.component),
        entity: {
            kind: context.kind === "constellation" ? "constellation" : "talent",
            id: String(context.characterId),
            component: context.component
        },
        sourceRefs: [sourceRef],
        interpretation: {
            method: "deterministicParser",
            author: "genshinCharacterV2BehaviorBatch3Generate.cjs",
            version: GENERATOR_VERSION,
            notes: "Raw source pointer and inventory candidate only; no prose parsing or value inference was performed."
        },
        timing: {},
        execution: {},
        lifecycle: unknownLifecycle(),
        energy: {},
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
    return applyInventoryEvidence({ spec, context, inventoryCandidates });
}

function buildInventoryCandidate({ context, sourceRef }) {
    const talentRecord = context.component.startsWith("normalAttack.")
        ? `/${context.characterId}/normalAttack`
        : context.component.startsWith("passives.")
            ? `/${context.characterId}/passives/${context.passiveIndex ?? 0}`
            : `/${context.characterId}/${context.component}`;
    return {
        id: inventoryCandidateId(context.characterId, context.component),
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
            record: context.kind === "constellation"
                ? `/${context.characterId}/constellations/${context.level}`
                : talentRecord,
            field: context.field
        },
        notes: "Inventory pointer only. Values, units, targets, and lifecycle are not inferred from source text."
    };
}

function appendTalentContexts({ characterId, talent, sourceRecords, contexts }) {
    const add = (component, field, text, sourceId, structuredValue) => {
        if (typeof text !== "string" || !text) return;
        const record = component.startsWith("normalAttack.")
            ? `/${characterId}/normalAttack`
            : component.startsWith("passives.")
                ? `/${characterId}/passives/${structuredValue?.passiveIndex ?? 0}`
                : `/${characterId}/${component}`;
        putRecord(sourceRecords, sourceRecord({
            id: sourceId,
            dataset: "character-talents.json",
            record,
            field,
            text,
            structuredValue,
            notes: "Original Japanese talent text; no behavior values are inferred in batch 3."
        }));
        contexts.push(sourceContext({ characterId, kind: "talent", component, field, text, sourceId, passiveIndex: structuredValue?.passiveIndex }));
    };
    const normal = talent.normalAttack || {};
    [["normal", "normalDescriptionJa"], ["charged", "chargedDescriptionJa"], ["plunging", "plungingDescriptionJa"]]
        .forEach(([component, field]) => add(`normalAttack.${component}`, field, normal[field], talentSourceId(characterId, "normalAttack", field), {
            characterId, component: `normalAttack.${component}`, field
        }));
    ["skill", "burst", "special"].forEach((component) => add(
        component,
        "descriptionJa",
        talent[component]?.descriptionJa,
        talentSourceId(characterId, component, "descriptionJa"),
        { characterId, component, field: "descriptionJa" }
    ));
    (talent.passives || []).forEach((passive, index) => {
        const passiveSource = passive?.sourceId || `passive_${index + 1}`;
        const component = `passives.${passiveSource}`;
        add(component, "descriptionJa", passive?.descriptionJa, passiveSourceId(characterId, passiveSource), {
            characterId,
            component,
            field: "descriptionJa",
            passiveIndex: index,
            passiveSourceId: passiveSource,
            passiveName: passive?.nameJa || null
        });
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
                notes: "Original Japanese constellation text; no behavior values are inferred in batch 3."
            }));
            contexts.push(sourceContext({ characterId, kind: "constellation", component: `constellation.${level}`, field: "effectText", text, sourceId, level: Number(level) }));
        });
}

function buildDataset({ dataRoot = defaultDataRoot } = {}) {
    const characters = readJson(path.join(dataRoot, "characters.json"));
    const talents = readJson(path.join(dataRoot, "character-talents.json"));
    const constellations = readJson(path.join(dataRoot, "character-constellations.json"));
    const behaviorInventory = readJson(path.join(dataRoot, "v2", "characters", "behavior-inventory.json"));
    const allIds = Object.keys(characters).sort();
    const eligibleIds = allIds.filter((id) => !PILOT_IDS.includes(id));
    const selectedIds = BATCH_IDS.filter((id) => eligibleIds.includes(id));
    if (stableJson(selectedIds) !== stableJson(BATCH_IDS)) {
        throw new Error(`batch 3 IDs do not match the fixed sorted non-pilot inventory: ${selectedIds.join(",")}`);
    }

    const sourceRecords = {};
    const inventoryCandidates = {};
    const specs = {};
    const modifiers = {};
    const byCharacter = {};

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
        const inputCandidateIds = [];
        const unknownCandidateIds = [];
        const explicitCandidateIds = [];
        contexts.forEach((context) => {
            const inventory = buildInventoryCandidate({ context, sourceRef: context.sourceId });
            const inventoryEvidence = inventoryCandidatesForContext(behaviorInventory, characterId, context);
            const spec = buildSpec({ context, inventoryId: inventory.id, inventoryCandidates: inventoryEvidence });
            putRecord(inventoryCandidates, inventory);
            putRecord(specs, spec);
            inventoryIds.push(inventory.id);
            specIds.push(spec.id);
            inputCandidateIds.push(...spec.inventoryCandidateIds);
            unknownCandidateIds.push(...spec.unknownCandidateIds);
            explicitCandidateIds.push(...inventoryEvidence.filter((candidate) => candidate.status === "candidate").map((candidate) => candidate.id));
        });
        byCharacter[characterId] = {
            characterId,
            characterName: character.nameJa || null,
            status: "needsReview",
            canonical: 0,
            sourceRecordIds: sourceRecordIds.sort(),
            inventoryCandidateIds: inventoryIds.sort(),
            specIds: specIds.sort(),
            modifierIds: [],
            inventoryInputCandidateIds: [...new Set(inputCandidateIds)].sort(),
            explicitCandidateIds: [...new Set(explicitCandidateIds)].sort(),
            unknownCandidateIds: [...new Set(unknownCandidateIds)].sort(),
            reasons: ["FIXED_BATCH_3", "PILOT_EXCLUDED", "RAW_SOURCE_POINTER_ONLY", "RUNTIME_CONNECTION_ZERO"]
        };
    });

    const verificationByStatus = {};
    const runtimeByStatus = {};
    Object.values(specs).forEach((spec) => {
        verificationByStatus[spec.verification.status] = (verificationByStatus[spec.verification.status] || 0) + 1;
        runtimeByStatus[spec.runtime.status] = (runtimeByStatus[spec.runtime.status] || 0) + 1;
    });
    const generatedFrom = inputManifest(dataRoot);
    const inventoryInputCandidates = BATCH_IDS.flatMap((characterId) => {
        const character = behaviorInventory.characters?.[characterId];
        return (character?.candidateIds || []).map((candidateId) => behaviorInventory.candidates?.[candidateId]).filter(Boolean);
    });
    const inventoryCandidateStatusCounts = inventoryInputCandidates.reduce((result, candidate) => {
        result[candidate.status] = (result[candidate.status] || 0) + 1;
        return result;
    }, {});
    const summary = {
        schemaVersion: 2,
        batch: 3,
        batchCharacters: selectedIds.length,
        inventoryCharacters: eligibleIds.length,
        sourceRecords: Object.keys(sourceRecords).length,
        inventoryCandidates: Object.keys(inventoryCandidates).length,
        specs: Object.keys(specs).length,
        modifiers: Object.keys(modifiers).length,
        canonical: 0,
        verificationByStatus,
        runtimeByStatus,
        inventoryInputCandidates: inventoryInputCandidates.length,
        inventoryCandidateStatusCounts,
        explicitCandidateOperations: inventoryInputCandidates.filter((candidate) => candidate.status === "candidate").length,
        unknownCandidateIds: inventoryInputCandidates.filter((candidate) => candidate.status === "unknown").length,
        sourceInventoryCandidates: inventoryInputCandidates.length,
        explicitInventoryCandidates: inventoryInputCandidates.filter((candidate) => candidate.status === "candidate").length,
        unknownInventoryCandidates: inventoryInputCandidates.filter((candidate) => candidate.status === "unknown").length,
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
        generator: { name: "genshinCharacterV2BehaviorBatch3Generate.cjs", version: GENERATOR_VERSION, capturedAt: CAPTURED_AT },
        policy: {
            canonical: 0,
            runtimeConnection: "forbidden",
            proseParsing: "forbidden",
            unknownFields: "Unstated values remain unknown; this batch only inventories raw source pointers."
        },
        summary,
        batch: 3,
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
    const outputRoot = process.env.GENSHIN_CHARACTER_V2_BEHAVIOR_BATCH_3_ROOT || defaultOutputRoot;
    process.stdout.write(`${JSON.stringify(writeDataset({ dataRoot, outputRoot }).summary, null, 2)}\n`);
}

module.exports = {
    BATCH_IDS,
    CAPTURED_AT,
    GENERATOR_VERSION,
    PILOT_IDS,
    UNKNOWN_FIELDS,
    appendConstellationContexts,
    appendTalentContexts,
    buildDataset,
    buildInventoryCandidate,
    buildSpec,
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
