"use strict";

/**
 * Build the fixed character behavior-v2 batch 4 inventory.
 *
 * This is deliberately a source-pointer transform.  Talent and constellation
 * prose is retained verbatim, but no values or behavior are inferred from it.
 * Every candidate therefore remains review-gated, runtime-blocked, and
 * canonical-zero until an independent review promotes it.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultDataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultOutputRoot = path.join(defaultDataRoot, "v2", "characters", "behavior-batch-4");
const CAPTURED_AT = "2026-08-15T00:00:00.000Z";
const GENERATOR_NAME = "genshinCharacterV2BehaviorBatch4Generate.cjs";
const GENERATOR_VERSION = `${GENERATOR_NAME.replace(/\.cjs$/, "")}/1`;
const BATCH = 4;

const PILOT_IDS = [
    "10000026", "10000031", "10000037", "10000046",
    "10000058", "10000089", "10000094", "10000098"
];

const BATCH_IDS = [
    "10000045", "10000047", "10000048", "10000049", "10000050",
    "10000051", "10000052", "10000053", "10000054", "10000055"
];

const UNKNOWN_FIELDS = [
    "burstCost", "snapshot", "duration", "tickInterval", "triggerInterval",
    "cooldown", "hitCount", "attackCount", "charges", "maxInstances",
    "maxTriggers", "targetCount", "refreshMode", "expiration", "instanceScope",
    "elementApplication", "energy"
];

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stableClone(value) {
    if (Array.isArray(value)) return value.map(stableClone);
    if (!isObject(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableClone(value[key])]));
}
function stableJson(value) { return JSON.stringify(stableClone(value)); }
function digest(value) { return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex"); }
function fileDigest(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function slug(value) {
    return String(value || "component").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "component";
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
function catalogSourceId(characterId) { return `source:${characterId}:catalog`; }
function talentSourceId(characterId, component, field) { return `source:${characterId}:talent:${slug(component)}:${field}`; }
function passiveSourceId(characterId, passiveSource) { return `source:${characterId}:talent:passive:${slug(passiveSource)}:descriptionJa`; }
function constellationSourceId(characterId, level) { return `source:${characterId}:constellation:${level}:effectText`; }
function inventoryCandidateId(characterId, component) { return `behavior-inventory:batch-${BATCH}:${characterId}:${slug(component)}`; }
function specId(characterId, component) {
    const kind = String(component).startsWith("constellation.") ? "constellation" : "talent";
    return `behavior:${characterId}:${kind}:${slug(component)}`;
}
function sourceContext({ characterId, kind, component, field, text, sourceId, level, passiveIndex }) {
    const context = { characterId, kind, component, field, text, sourceId, level: level === undefined ? null : level };
    if (passiveIndex !== undefined) context.passiveIndex = passiveIndex;
    return context;
}
function unknownLifecycle() { return { refreshMode: "unknown", expiration: "unknown", instanceScope: "unknown" }; }
function claim(sourceRef, notes) { return { status: "needsReview", sourceRefs: [sourceRef], notes }; }

// behavior-inventory.json uses a separate source-id namespace.  Candidates
// are copied only after their source pointer is resolved to the direct raw
// SourceRecord emitted by this batch.  Matching by dataset/field/text digest
// also handles passive records whose array-index path differs between the two
// inventories.
function resolveInventorySourceRef(inventory, directSources, sourceRef) {
    const source = inventory?.sourceRecords?.[sourceRef];
    if (!source) throw new Error(`inventory source ref is missing: ${sourceRef}`);
    const sourceDigest = source.integrity?.digest || digest(source.text || "");
    const dataset = source.locator?.dataset;
    const record = source.locator?.record;
    const field = source.locator?.field || null;
    const exact = Object.values(directSources).filter((candidate) =>
        candidate.locator?.dataset === dataset
        && candidate.locator?.field === field
        && candidate.integrity?.digest === sourceDigest
        && candidate.locator?.record === record
    );
    const relaxed = Object.values(directSources).filter((candidate) =>
        candidate.locator?.dataset === dataset
        && candidate.locator?.field === field
        && candidate.integrity?.digest === sourceDigest
    );
    const matches = exact.length ? exact : relaxed;
    if (matches.length !== 1) {
        throw new Error(`inventory source ref cannot be resolved deterministically: ${sourceRef} (${matches.length} matches)`);
    }
    return matches[0].id;
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
    ["/energy/particleCount", ["energy", "particleCount", "particleCount"]],
    ["/energy/particleElement", ["energy", "particleElement", "particleElement"]],
    ["/elementApplication/element", ["elementApplication", "element", "elementApplication"]],
    ["/elementApplication/gaugeUnits", ["elementApplication", "gaugeUnits", "elementApplication"]],
    ["/elementApplication/icdInterval", ["elementApplication", "icdInterval", "icdInterval"]],
    ["/elementApplication/icdHitRule", ["elementApplication", "icdHitRule", "icdHitRule"]],
    ["/elementApplication/icdScope", ["elementApplication", "icdScope", "icdScope"]]
]);
const SAFE_LIFECYCLE_PATHS = new Set(["/lifecycle/refreshMode", "/lifecycle/expiration"]);

function measurementPath(pathName) {
    return MEASUREMENT_PATHS.has(pathName) || SAFE_LIFECYCLE_PATHS.has(pathName) ? pathName : null;
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

function candidateEvidence(candidate, resolvedSourceRefs) {
    return {
        code: "INVENTORY_CANDIDATE",
        candidateId: candidate.id,
        status: candidate.status,
        kind: candidate.kind,
        fieldPath: candidate.fieldPath || null,
        operation: candidate.operation || null,
        value: clone(candidate.value),
        unit: candidate.unit || "unknown",
        sourceRefs: [...resolvedSourceRefs],
        inventorySourceRefs: [...(candidate.sourceRefs || [])],
        notes: "Inventory candidate retained as evidence; operation was not executed or normalized."
    };
}

function buildSpec({ context, inventoryId, inventoryCandidates = [], inventorySourceResolver = () => context.sourceId }) {
    const sourceRef = context.sourceId;
    const matchingCandidates = inventoryCandidates
        .filter((candidate) => candidate?.entity?.id === String(context.characterId)
            && candidate?.entity?.component === context.component)
        .sort((left, right) => String(left.id).localeCompare(String(right.id)));
    const explicitCandidates = matchingCandidates.filter((candidate) => candidate.status === "candidate");
    const unknownCandidateIds = matchingCandidates.filter((candidate) => candidate.status === "unknown").map((candidate) => candidate.id);
    const resolvedByCandidate = new Map();
    matchingCandidates.forEach((candidate) => {
        resolvedByCandidate.set(candidate.id, (candidate.sourceRefs || []).map((ref) => inventorySourceResolver(ref)));
    });
    const timing = {}, execution = {}, lifecycle = unknownLifecycle(), energy = {}, elementApplication = {};
    const operationDiscrepancies = [];
    const grouped = new Map();
    explicitCandidates.forEach((candidate) => {
        const key = String(candidate.fieldPath || "");
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(candidate);
        const refs = resolvedByCandidate.get(candidate.id) || [sourceRef];
        operationDiscrepancies.push({
            ...candidateEvidence(candidate, refs),
            code: "BEHAVIOR_INVENTORY_CANDIDATE"
        });
    });
    matchingCandidates.filter((candidate) => candidate.status === "unknown").forEach((candidate) => {
        const refs = resolvedByCandidate.get(candidate.id) || [sourceRef];
        operationDiscrepancies.push({
            ...candidateEvidence(candidate, refs),
            code: "BEHAVIOR_INVENTORY_UNKNOWN"
        });
    });
    const unknownFields = new Set(UNKNOWN_FIELDS);
    grouped.forEach((candidates, fieldPath) => {
        const refs = [...new Set(candidates.flatMap((candidate) => resolvedByCandidate.get(candidate.id) || [sourceRef]))];
        const details = candidates.map((candidate) => candidateEvidence(candidate, resolvedByCandidate.get(candidate.id) || [sourceRef]));
        const route = MEASUREMENT_PATHS.get(fieldPath);
        if (!route && !SAFE_LIFECYCLE_PATHS.has(fieldPath)) {
            operationDiscrepancies.push({ code: "INVENTORY_FIELD_PATH_UNSUPPORTED", fieldPath, sourceRefs: refs, inventoryCandidateIds: candidates.map((candidate) => candidate.id), candidates: details });
            return;
        }
        if (candidates.length !== 1) {
            operationDiscrepancies.push({ code: "INVENTORY_OPERATION_CONFLICT", fieldPath, sourceRefs: refs, inventoryCandidateIds: candidates.map((candidate) => candidate.id), candidates: details });
            return;
        }
        const candidate = candidates[0];
        if (candidate.value === null && ["reset", "replace"].includes(candidate.operation)) {
            operationDiscrepancies.push({ code: "INVENTORY_NULL_RESET", fieldPath, sourceRefs: refs, inventoryCandidateIds: [candidate.id], candidates: details });
            return;
        }
        if (SAFE_LIFECYCLE_PATHS.has(fieldPath)) {
            const lifecycleField = fieldPath.slice("/lifecycle/".length);
            const valid = typeof candidate.value === "string" && (lifecycleField === "refreshMode"
                ? ["none", "refresh", "extend", "replace", "independent", "unknown"].includes(candidate.value)
                : ["duration", "triggerLimit", "consumed", "destroyed", "stateEnd", "unknown"].includes(candidate.value));
            if (!valid || !["set", "replace"].includes(candidate.operation)) {
                operationDiscrepancies.push({ code: "INVENTORY_LIFECYCLE_VALUE_INVALID", fieldPath, sourceRefs: refs, inventoryCandidateIds: [candidate.id], candidates: details });
                return;
            }
            lifecycle[lifecycleField] = candidate.value;
            unknownFields.delete(lifecycleField);
        } else {
            const [section, field, unknownField] = route;
            if (!["set", "replace", "setMaximum"].includes(candidate.operation)) {
                operationDiscrepancies.push({ code: "INVENTORY_OPERATION_REQUIRES_REVIEW", fieldPath, sourceRefs: refs, inventoryCandidateIds: [candidate.id], candidates: details });
                return;
            }
            const resolvedRef = (resolvedByCandidate.get(candidate.id) || [sourceRef])[0];
            if (!({ timing, execution, energy, elementApplication }[section])) return;
            ({ timing, execution, energy, elementApplication }[section])[field] = measurementFromCandidate(candidate, resolvedRef);
            unknownFields.delete(unknownField);
        }
        if (candidate.operation !== "set") {
            operationDiscrepancies.push({ code: "INVENTORY_OPERATION_REQUIRES_REVIEW", fieldPath, sourceRefs: refs, inventoryCandidateIds: [candidate.id], candidates: details });
        }
    });
    const sourceRefsForClaims = [...new Set([sourceRef, ...explicitCandidates.flatMap((candidate) => resolvedByCandidate.get(candidate.id) || [])])];
    const discrepancies = [
        { code: "RAW_SOURCE_INVENTORY_ONLY", sourceRefs: [sourceRef] },
        { code: "INDEPENDENT_SOURCE_REQUIRED", sourceRefs: [sourceRef] },
        { code: "CANONICAL_RUNTIME_FORBIDDEN", sourceRefs: [sourceRef] },
        ...operationDiscrepancies
    ];
    return {
        id: specId(context.characterId, context.component),
        entity: {
            kind: context.kind === "constellation" ? "constellation" : "talent",
            id: String(context.characterId),
            component: context.component
        },
        sourceRefs: [sourceRef],
        interpretation: {
            method: "deterministicParser",
            author: GENERATOR_NAME,
            version: GENERATOR_VERSION,
            notes: "Raw source pointer and inventory candidate only; no prose parsing or value inference was performed."
        },
        timing,
        execution,
        lifecycle,
        energy,
        elementApplication,
        unknownFields: [...unknownFields].sort(),
        verification: {
            status: "needsReview",
            reviewedBy: null,
            reviewedAt: null,
            sourceAgreement: "unknown",
            claims: {
                sourceText: { status: "needsReview", sourceRefs: sourceRefsForClaims, notes: "Raw source text is retained; independent review is required." },
                timing: { status: "needsReview", sourceRefs: sourceRefsForClaims, notes: "Timing fields are unknown unless copied from an explicit behavior-inventory candidate." },
                execution: { status: "needsReview", sourceRefs: sourceRefsForClaims, notes: "Execution fields are unknown unless copied from an explicit behavior-inventory candidate." },
                lifecycle: { status: "needsReview", sourceRefs: sourceRefsForClaims, notes: "Refresh, expiration, and instance scope remain review-gated." },
                energy: { status: "needsReview", sourceRefs: sourceRefsForClaims, notes: "Energy and burst cost remain review-gated; no prose inference was performed." },
                snapshot: { status: "needsReview", sourceRefs: sourceRefsForClaims, notes: "Snapshot behavior is unknown and intentionally unmodeled." },
                runtime: { status: "needsReview", sourceRefs: sourceRefsForClaims, notes: "Runtime connection is blocked until independent review and versioned source agreement." }
            },
            discrepancies
        },
        runtime: {
            status: "blocked",
            modifierIds: [],
            generator: null,
            blockedReasons: [
                "verificationStatusNeedsReview", "inventoryCandidateOnly",
                "independentSourceRequired", "canonicalPromotionForbidden"
            ]
        },
        inventoryCandidateId: inventoryId,
        inventoryCandidateIds: matchingCandidates.map((candidate) => candidate.id),
        unknownCandidateIds
    };
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
    const add = (component, field, text, sourceId, structuredValue, record = `/${characterId}/${component}`) => {
        if (typeof text !== "string" || !text) return;
        putRecord(sourceRecords, sourceRecord({
            id: sourceId,
            dataset: "character-talents.json",
            record,
            field,
            text,
            structuredValue,
            notes: "Original Japanese talent text; no behavior values are inferred in batch 4."
        }));
        contexts.push(sourceContext({ characterId, kind: "talent", component, field, text, sourceId,
            passiveIndex: structuredValue?.passiveIndex }));
    };
    const normal = talent.normalAttack || {};
    [["normal", "normalDescriptionJa"], ["charged", "chargedDescriptionJa"], ["plunging", "plungingDescriptionJa"]]
        .forEach(([component, field]) => add(`normalAttack.${component}`, field, normal[field], talentSourceId(characterId, "normalAttack", field), {
            characterId, component: `normalAttack.${component}`, field
        }, `/${characterId}/normalAttack`));
    ["skill", "burst", "special"].forEach((component) => add(component, "descriptionJa", talent[component]?.descriptionJa,
        talentSourceId(characterId, component, "descriptionJa"), { characterId, component, field: "descriptionJa" }));
    (talent.passives || []).forEach((passive, index) => {
        const passiveSource = passive?.sourceId || `passive_${index + 1}`;
        add(`passives.${passiveSource}`, "descriptionJa", passive?.descriptionJa, passiveSourceId(characterId, passiveSource), {
            characterId,
            component: `passives.${passiveSource}`,
            field: "descriptionJa",
            passiveIndex: index,
            passiveSourceId: passiveSource,
            passiveName: passive?.nameJa || null
        }, `/${characterId}/passives/${index}`);
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
                notes: "Original Japanese constellation text; no behavior values are inferred in batch 4."
            }));
            contexts.push(sourceContext({ characterId, kind: "constellation", component: `constellation.${level}`,
                field: "effectText", text, sourceId, level: Number(level) }));
        });
}

function buildDataset({ dataRoot = defaultDataRoot } = {}) {
    const characters = readJson(path.join(dataRoot, "characters.json"));
    const talents = readJson(path.join(dataRoot, "character-talents.json"));
    const constellations = readJson(path.join(dataRoot, "character-constellations.json"));
    const behaviorInventory = readJson(path.join(dataRoot, "v2", "characters", "behavior-inventory.json"));
    const allIds = Object.keys(characters).sort();
    const eligibleIds = allIds.filter((id) => !PILOT_IDS.includes(id));
    BATCH_IDS.forEach((id) => {
        if (!characters[id]) throw new Error(`batch ${BATCH} character is missing from characters.json: ${id}`);
        if (PILOT_IDS.includes(id)) throw new Error(`batch ${BATCH} contains a pilot ID: ${id}`);
    });
    const sourceRecords = {}, inventoryCandidates = {}, specs = {}, modifiers = {}, byCharacter = {};
    BATCH_IDS.forEach((characterId) => {
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
        const inventoryCharacter = behaviorInventory.characters?.[characterId] || {};
        const inputCandidates = (inventoryCharacter.candidateIds || [])
            .map((candidateId) => behaviorInventory.candidates?.[candidateId])
            .filter(Boolean);
        const resolveSource = (sourceRef) => resolveInventorySourceRef(behaviorInventory, sourceRecords, sourceRef);
        const inventoryIds = [], specIds = [];
        const inputCandidateIds = [], unknownCandidateIds = [], explicitCandidateIds = [];
        contexts.forEach((context) => {
            const inventory = buildInventoryCandidate({ context, sourceRef: context.sourceId });
            const spec = buildSpec({
                context,
                inventoryId: inventory.id,
                inventoryCandidates: inputCandidates,
                inventorySourceResolver: resolveSource
            });
            putRecord(inventoryCandidates, inventory);
            putRecord(specs, spec);
            inventoryIds.push(inventory.id);
            specIds.push(spec.id);
            inputCandidateIds.push(...(spec.inventoryCandidateIds || []));
            unknownCandidateIds.push(...(spec.unknownCandidateIds || []));
            explicitCandidateIds.push(...inputCandidates.filter((candidate) => candidate.entity?.component === context.component && candidate.status === "candidate").map((candidate) => candidate.id));
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
            reasons: [`FIXED_BATCH_${BATCH}`, "PILOT_EXCLUDED", "RAW_SOURCE_POINTER_ONLY", "RUNTIME_CONNECTION_ZERO"]
        };
    });
    const verificationByStatus = {}, runtimeByStatus = {};
    Object.values(specs).forEach((spec) => {
        verificationByStatus[spec.verification.status] = (verificationByStatus[spec.verification.status] || 0) + 1;
        runtimeByStatus[spec.runtime.status] = (runtimeByStatus[spec.runtime.status] || 0) + 1;
    });
    const inventoryCandidateStatusCounts = {};
    const inventoryCandidateKindCounts = {};
    BATCH_IDS.forEach((characterId) => {
        const inventoryCharacter = behaviorInventory.characters?.[characterId] || {};
        (inventoryCharacter.candidateIds || []).forEach((candidateId) => {
            const candidate = behaviorInventory.candidates?.[candidateId];
            if (!candidate) return;
            inventoryCandidateStatusCounts[candidate.status] = (inventoryCandidateStatusCounts[candidate.status] || 0) + 1;
            inventoryCandidateKindCounts[candidate.kind] = (inventoryCandidateKindCounts[candidate.kind] || 0) + 1;
        });
    });
    const generatedFrom = inputManifest(dataRoot);
    const summary = {
        schemaVersion: 2,
        batch: BATCH,
        batchCharacters: BATCH_IDS.length,
        inventoryCharacters: eligibleIds.length,
        sourceRecords: Object.keys(sourceRecords).length,
        inventoryCandidates: Object.keys(inventoryCandidates).length,
        specs: Object.keys(specs).length,
        modifiers: Object.keys(modifiers).length,
        canonical: 0,
        verificationByStatus,
        runtimeByStatus,
        inventoryCandidateStatusCounts,
        inventoryCandidateKindCounts,
        inventoryInputCandidates: Object.values(inventoryCandidateStatusCounts).reduce((sum, count) => sum + count, 0),
        explicitCandidateOperations: inventoryCandidateStatusCounts.candidate || 0,
        unknownCandidateIds: inventoryCandidateStatusCounts.unknown || 0,
        sourceInventoryCandidates: Object.values(inventoryCandidateStatusCounts).reduce((sum, count) => sum + count, 0),
        explicitInventoryCandidates: inventoryCandidateStatusCounts.candidate || 0,
        unknownInventoryCandidates: inventoryCandidateStatusCounts.unknown || 0,
        sourceRefsResolved: true,
        generatedFrom,
        batchIds: [...BATCH_IDS],
        excludedPilotIds: [...PILOT_IDS],
        sourceKinds: Object.values(sourceRecords).reduce((result, source) => {
            result[source.kind] = (result[source.kind] || 0) + 1;
            return result;
        }, {})
    };
    return {
        schemaVersion: 2,
        kind: "genshinBehaviorV2Batch",
        generator: { name: GENERATOR_NAME, version: GENERATOR_VERSION, capturedAt: CAPTURED_AT },
        policy: {
            canonical: 0,
            runtimeConnection: "forbidden",
            proseParsing: "forbidden",
            unknownFields: "Unstated values remain unknown; this batch only inventories raw source pointers."
        },
        summary,
        batch: BATCH,
        batchIds: [...BATCH_IDS],
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
    const outputRoot = process.env.GENSHIN_CHARACTER_V2_BEHAVIOR_BATCH_4_ROOT || defaultOutputRoot;
    process.stdout.write(`${JSON.stringify(writeDataset({ dataRoot, outputRoot }).summary, null, 2)}\n`);
}

module.exports = {
    BATCH,
    BATCH_IDS,
    CAPTURED_AT,
    GENERATOR_NAME,
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
