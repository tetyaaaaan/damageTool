"use strict";

/**
 * Build behavior-v2 batch 1 from the first eight non-pilot characters.
 *
 * This batch is intentionally an inventory transform.  It records every raw
 * talent/constellation source pointer, then creates a review-gated candidate
 * for each non-catalog source.  No prose extraction is performed here: timing,
 * counts, targets, units, lifecycle, energy, and snapshot are all unknown.
 * Runtime modifiers and canonical records remain empty/blocked.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultDataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultOutputRoot = path.join(defaultDataRoot, "v2", "characters", "behavior-batch-1");
const CAPTURED_AT = "2026-08-15T00:00:00.000Z";
const GENERATOR_VERSION = "genshinCharacterV2BehaviorBatch1Generate/1";

const PILOT_IDS = [
    "10000026", "10000031", "10000037", "10000046",
    "10000058", "10000089", "10000094", "10000098"
];

// Fixed by the sorted 109-character inventory after excluding PILOT_IDS.
const BATCH_IDS = [
    "10000002", "10000003", "10000005", "10000006",
    "10000007", "10000014", "10000015", "10000016"
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
    return ["characters.json", "character-talents.json", "character-constellations.json", "v2/characters/behavior-inventory.json"].map((relativePath) => ({
        dataset: relativePath,
        path: `games/genshin/data/${relativePath}`,
        integrity: { algorithm: "sha256", digest: fileDigest(path.join(dataRoot, relativePath)) }
    }));
}

const MEASUREMENT_PATHS = new Map([
    ["/timing/cooldown", ["timing", "cooldown", "cooldown"]],
    ["/timing/duration", ["timing", "duration", "duration"]],
    ["/timing/tickInterval", ["timing", "tickInterval", "tickInterval"]],
    ["/timing/triggerInterval", ["timing", "triggerInterval", "triggerInterval"]],
    ["/timing/activationDelay", ["timing", "activationDelay", "activationDelay"]],
    ["/execution/hitCount", ["execution", "hitCount", "hitCount"]],
    ["/execution/attackCount", ["execution", "attackCount", "attackCount"]],
    ["/execution/maxTriggers", ["execution", "maxTriggers", "maxTriggers"]],
    ["/execution/charges", ["execution", "charges", "charges"]],
    ["/execution/maxInstances", ["execution", "maxInstances", "maxInstances"]],
    ["/execution/offField", ["execution", "offField", "offField"]],
    ["/execution/snapshot", ["execution", "snapshot", "snapshot"]],
    ["/execution/area", ["execution", "area", "area"]],
    ["/execution/targetCount", ["execution", "targetCount", "targetCount"]],
    ["/energy/burstCost", ["energy", "burstCost", "burstCost"]],
    ["/energy/gain", ["energy", "gain", "energy"]],
    ["/energy/particleCount", ["energy", "particleCount", "energy"]],
    ["/elementApplication/element", ["elementApplication", "element", "elementApplication"]],
    ["/elementApplication/gaugeUnits", ["elementApplication", "gaugeUnits", "elementApplication"]],
    ["/elementApplication/icdInterval", ["elementApplication", "icdInterval", "elementApplication"]],
    ["/elementApplication/icdHitRule", ["elementApplication", "icdHitRule", "elementApplication"]],
    ["/elementApplication/icdScope", ["elementApplication", "icdScope", "elementApplication"]]
]);

function attachInventoryEvidence(spec, candidates, sourceRef) {
    const sorted = [...candidates].sort((left, right) => left.id.localeCompare(right.id));
    spec.inventoryCandidateIds = sorted.map((candidate) => candidate.id);
    spec.unknownCandidateIds = sorted.filter((candidate) => candidate.status === "unknown").map((candidate) => candidate.id);
    spec.interpretation.notes = "Raw pointer plus deterministic behavior-inventory candidates; only explicit non-conflicting measurements are copied. Runtime remains blocked.";
    const assigned = new Map();
    const conflicts = new Set();
    sorted.forEach((candidate) => {
        spec.verification.discrepancies.push({
            code: candidate.status === "candidate" ? "BEHAVIOR_INVENTORY_CANDIDATE" : "BEHAVIOR_INVENTORY_UNKNOWN",
            candidateId: candidate.id,
            inventorySourceRefs: [...(candidate.sourceRefs || [])],
            sourceRefs: [sourceRef],
            fieldPath: candidate.fieldPath,
            operation: candidate.operation,
            value: candidate.value,
            unit: candidate.unit
        });
        if (candidate.status !== "candidate" || candidate.value === null || candidate.value === undefined) return;
        if (candidate.fieldPath === "/lifecycle/refreshMode" && ["set", "replace"].includes(candidate.operation)
            && ["none", "refresh", "extend", "replace", "independent", "unknown"].includes(candidate.value)) {
            if (assigned.has(candidate.fieldPath) && assigned.get(candidate.fieldPath) !== stableJson(candidate.value)) conflicts.add(candidate.fieldPath);
            else {
                assigned.set(candidate.fieldPath, stableJson(candidate.value));
                spec.lifecycle.refreshMode = candidate.value;
                spec.unknownFields = spec.unknownFields.filter((field) => field !== "refreshMode");
            }
            return;
        }
        const route = MEASUREMENT_PATHS.get(candidate.fieldPath);
        if (!route || !["set", "replace", "setMaximum"].includes(candidate.operation)) return;
        const [section, field, unknownField] = route;
        const measurement = {
            value: clone(candidate.value),
            unit: candidate.unit || "unknown",
            status: "explicit",
            sourceRefs: [sourceRef],
            notes: `Copied from ${candidate.id}; operation=${candidate.operation}. Independent review is still required.`
        };
        const signature = stableJson(measurement.value);
        if (assigned.has(candidate.fieldPath) && assigned.get(candidate.fieldPath) !== signature) {
            conflicts.add(candidate.fieldPath);
            return;
        }
        assigned.set(candidate.fieldPath, signature);
        spec[section] ||= {};
        spec[section][field] = measurement;
        spec.unknownFields = spec.unknownFields.filter((name) => name !== unknownField);
    });
    conflicts.forEach((fieldPath) => {
        const route = MEASUREMENT_PATHS.get(fieldPath);
        if (route) delete spec[route[0]][route[1]];
        if (fieldPath === "/lifecycle/refreshMode") spec.lifecycle.refreshMode = "unknown";
        spec.verification.discrepancies.push({ code: "BEHAVIOR_INVENTORY_FIELD_CONFLICT", fieldPath, sourceRefs: [sourceRef] });
    });
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
    return `behavior-inventory:batch-1:${characterId}:${slug(component)}`;
}

function specId(characterId, component) {
    const kind = String(component).startsWith("constellation.") ? "constellation" : "talent";
    return `behavior:${characterId}:${kind}:${slug(component)}`;
}

function sourceContext({ characterId, kind, component, field, text, sourceId, level }) {
    return { characterId, kind, component, field, text, sourceId, level: level === undefined ? null : level };
}

function unknownLifecycle() {
    return { refreshMode: "unknown", expiration: "unknown", instanceScope: "unknown" };
}

function claim(sourceRef, notes) {
    return { status: "needsReview", sourceRefs: [sourceRef], notes };
}

function buildSpec({ context, inventoryId }) {
    const id = specId(context.characterId, context.component);
    const sourceRef = context.sourceId;
    return {
        id,
        entity: {
            kind: context.kind === "constellation" ? "constellation" : "talent",
            id: String(context.characterId),
            component: context.component
        },
        sourceRefs: [sourceRef],
        interpretation: {
            method: "deterministicParser",
            author: "genshinCharacterV2BehaviorBatch1Generate.cjs",
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
            record: context.kind === "constellation"
                ? `/${context.characterId}/constellations/${context.level}`
                : `/${context.characterId}`,
            field: context.field
        },
        notes: "Inventory pointer only. Values, units, targets, and lifecycle are not inferred from source text."
    };
}

function appendTalentContexts({ characterId, talent, sourceRecords, contexts }) {
    const add = (component, field, text, sourceId, structuredValue, recordComponent = component) => {
        if (typeof text !== "string" || !text) return;
        putRecord(sourceRecords, sourceRecord({
            id: sourceId,
            dataset: "character-talents.json",
            record: `/${characterId}/${recordComponent}`,
            field,
            text,
            structuredValue,
            notes: "Original Japanese talent text; no behavior values are inferred in batch 1."
        }));
        contexts.push(sourceContext({ characterId, kind: "talent", component, field, text, sourceId }));
    };
    const normal = talent.normalAttack || {};
    [["normal", "normalDescriptionJa"], ["charged", "chargedDescriptionJa"], ["plunging", "plungingDescriptionJa"]].forEach(([component, field]) => {
        add(`normalAttack.${component}`, field, normal[field], talentSourceId(characterId, "normalAttack", field), { characterId, component: `normalAttack.${component}`, field }, "normalAttack");
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
        }, `passives/${index}`);
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
                notes: "Original Japanese constellation text; no behavior values are inferred in batch 1."
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
    const selectedIds = eligibleIds.slice(0, BATCH_IDS.length);
    if (stableJson(selectedIds) !== stableJson(BATCH_IDS)) {
        throw new Error(`batch 1 IDs do not match the sorted non-pilot inventory: ${selectedIds.join(",")}`);
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
        contexts.forEach((context) => {
            const inventory = buildInventoryCandidate({ context, sourceRef: context.sourceId });
            const spec = buildSpec({ context, inventoryId: inventory.id });
            const evidence = Object.values(behaviorInventory.candidates || {}).filter((candidate) => (
                candidate.entity?.id === characterId && candidate.entity?.component === context.component
            ));
            attachInventoryEvidence(spec, evidence, context.sourceId);
            putRecord(inventoryCandidates, inventory);
            putRecord(specs, spec);
            inventoryIds.push(inventory.id);
            specIds.push(spec.id);
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
            reasons: ["FIXED_BATCH_1", "PILOT_EXCLUDED", "RAW_SOURCE_POINTER_ONLY", "RUNTIME_CONNECTION_ZERO"]
        };
    });

    const verificationByStatus = {};
    const runtimeByStatus = {};
    Object.values(specs).forEach((spec) => {
        verificationByStatus[spec.verification.status] = (verificationByStatus[spec.verification.status] || 0) + 1;
        runtimeByStatus[spec.runtime.status] = (runtimeByStatus[spec.runtime.status] || 0) + 1;
    });
    const generatedFrom = inputManifest(dataRoot);
    const sourceInventoryCandidates = Object.values(behaviorInventory.candidates || {}).filter((candidate) => selectedIds.includes(candidate.entity?.id));
    const summary = {
        schemaVersion: 2,
        batch: 1,
        batchCharacters: selectedIds.length,
        inventoryCharacters: eligibleIds.length,
        sourceRecords: Object.keys(sourceRecords).length,
        inventoryCandidates: Object.keys(inventoryCandidates).length,
        sourceInventoryCandidates: sourceInventoryCandidates.length,
        explicitInventoryCandidates: sourceInventoryCandidates.filter((candidate) => candidate.status === "candidate").length,
        unknownInventoryCandidates: sourceInventoryCandidates.filter((candidate) => candidate.status === "unknown").length,
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
        generator: { name: "genshinCharacterV2BehaviorBatch1Generate.cjs", version: GENERATOR_VERSION, capturedAt: CAPTURED_AT },
        policy: {
            canonical: 0,
            runtimeConnection: "forbidden",
            proseParsing: "forbidden",
            unknownFields: "Unstated values remain unknown; this batch only inventories raw source pointers."
        },
        summary,
        batch: 1,
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
    // Keep one self-contained manifest for consumers that do not want to join
    // the four layer files.  It is deterministic and has the same evidence.
    fs.writeFileSync(path.join(outputRoot, "manifest.json"), `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
    return dataset;
}

if (require.main === module) {
    const dataRoot = process.env.GENSHIN_DATA_ROOT || defaultDataRoot;
    const outputRoot = process.env.GENSHIN_CHARACTER_V2_BEHAVIOR_BATCH_1_ROOT || defaultOutputRoot;
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
