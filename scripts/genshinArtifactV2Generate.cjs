"use strict";

/**
 * Build the Genshin artifact-set v2 evidence/spec layer.
 *
 * This transform is intentionally copy-only.  Values, targets, conditions,
 * stack/duration fields, and input-policy fields are copied from the legacy
 * structured modifier contract.  The Japanese effect text is retained as a
 * source record, but is never parsed for a number, target, timing, or
 * condition.  All generated candidates therefore remain review gated.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultDataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultOutputRoot = path.join(defaultDataRoot, "v2", "artifacts");
const CAPTURED_AT = "2026-08-15T00:00:00.000Z";
const GENERATOR_VERSION = "genshinArtifactV2Generate/1";
const PIECE_SLOTS = ["onePiece", "twoPiece", "fourPiece"];
const PIECE_COUNTS = { onePiece: 1, twoPiece: 2, fourPiece: 4 };
// Runtime IDs intentionally live in a namespace that cannot be confused with
// the v2 EffectSpec IDs or with the legacy calculator modifier IDs.  The
// components are all stable identity inputs: set id, piece collection, and
// the exact legacy modifier id.  No value or effect text is involved.  The
// runtime ID namespace is deliberately separate from the engine destination
// dataset name so future routes cannot accidentally reuse an ID as a label.
const RUNTIME_MODIFIER_NAMESPACE = "genshin:v2:artifactSet";
const RUNTIME_DESTINATION_DATASET = "artifactSetModifiers";

// Artifact sets that have a raw set-effect document but no structured legacy
// modifier record.  These are intentionally reviewed as evidence gaps rather
// than filled from localized prose.  The list is derived again at generation
// time; this constant only documents the current audit scope and guards the
// review vocabulary from silently drifting.
const GAP_REVIEW_STATUSES = ["noEffect", "displayOnly", "unstructured", "invalid", "needsReview"];

// These are the same explicit-field policy boundaries used by the legacy
// condition audit.  They describe input routing only; no prose is inspected.
const DERIVED_CONDITIONS = new Set([
    "chargedAttack",
    "weaponTypeCatalystOrBow",
    "weaponTypeSwordClaymorePolearm"
]);
const UID_INPUT_STAT_TARGETS = new Set([
    "atkPercent", "atkFlat", "hpPercent", "hpFlat", "defPercent", "defFlat",
    "elementalMastery", "energyRecharge"
]);
const UID_INPUT_CRIT_TARGETS = new Set(["critRate", "critDamage"]);
const UID_INPUT_DAMAGE_TARGETS = new Set([
    "pyroDamageBonus", "hydroDamageBonus", "electroDamageBonus", "cryoDamageBonus",
    "anemoDamageBonus", "geoDamageBonus", "dendroDamageBonus", "physicalDamageBonus",
    "allElementDamageBonus", "ownElementDamageBonus"
]);

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
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
    return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
}

function sourceRecord({ id, kind, provider, dataset, record, field, text, structuredValue, notes }) {
    const source = {
        id,
        kind,
        provider,
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
    if (records[source.id] && stableJson(records[source.id]) !== stableJson(source)) {
        throw new Error(`source id collision: ${source.id}`);
    }
    records[source.id] = source;
    return source.id;
}

function pieceSlot(value) {
    return PIECE_SLOTS.includes(value) ? value : "fourPiece";
}

function pieceCount(slot) {
    return PIECE_COUNTS[pieceSlot(slot)];
}

function legacyCandidateId(setId, slot, modifier, modifierIndex) {
    const base = String(modifier.id || `modifier_${modifierIndex + 1}`);
    return `artifact:${String(setId)}:${pieceSlot(slot)}:${base}`;
}

function legacyModifierId(modifier, modifierIndex) {
    return String(modifier?.id || `modifier_${modifierIndex + 1}`);
}

function artifactRuntimeModifierId(setId, slot, modifier, modifierIndex) {
    return `${RUNTIME_MODIFIER_NAMESPACE}:${String(setId)}:${pieceSlot(slot)}:${legacyModifierId(modifier, modifierIndex)}`;
}

function artifactRuntimeDestination(setId, slot) {
    return {
        dataset: RUNTIME_DESTINATION_DATASET,
        entityId: String(setId),
        collection: pieceSlot(slot)
    };
}

function explicitValueFields(modifier) {
    return [
        "value", "valueByRefinement", "valueByRefinementPerStack",
        "valueByRefinementPerConsumedStack", "valuePerStack",
        "valuePerStackByReaction", "valueByStack", "valueByState", "valueByCondition"
    ].filter((field) => modifier[field] !== undefined && modifier[field] !== null);
}

function explicitValueField(modifier) {
    return explicitValueFields(modifier)[0] || null;
}

function nonEmptyText(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function sourcePointer(sourceRecords, sourceId) {
    const source = (sourceRecords || {})[sourceId];
    if (!source) return { sourceId, present: false };
    return {
        sourceId,
        dataset: source.locator?.dataset || null,
        record: source.locator?.record || null,
        field: source.locator?.field || null,
        present: nonEmptyText(source.text),
        textDigest: source.integrity?.digest || null
    };
}

/**
 * Classify a set with no structured modifiers using only explicit raw-field
 * presence.  A non-empty 2pc/4pc field is unstructured (never parsed); a
 * one-piece-only field is display-only for the 2pc/4pc calculator; an
 * explicitly empty slot is noEffect for that slot.  Malformed input is
 * invalid.  No value, target, timing, or condition is inferred here.
 */
function classifyStructuredModifierGap({ setId, set, effectDocument, modifierDocument, pieceSourceRefs, sourceRecords }) {
    const slots = {};
    let invalid = !isObject(effectDocument) || !isObject(modifierDocument);
    PIECE_SLOTS.forEach((slot) => {
        const field = `${slot}Effect`;
        const rawText = effectDocument?.[field];
        const textPresent = rawText === undefined ? false : nonEmptyText(rawText);
        const textValid = rawText === undefined || typeof rawText === "string";
        const rawModifiers = modifierDocument?.[slot];
        const modifiersValid = rawModifiers === undefined || Array.isArray(rawModifiers);
        if (!textValid || !modifiersValid) invalid = true;
        const modifierCount = Array.isArray(rawModifiers) ? rawModifiers.length : 0;
        let status = "noEffect";
        if (!textValid || !modifiersValid) status = "invalid";
        else if (modifierCount > 0) status = "needsReview";
        else if (textPresent && slot === "onePiece") status = "displayOnly";
        else if (textPresent) status = "unstructured";
        slots[slot] = {
            pieceCount: PIECE_COUNTS[slot],
            status,
            textPresent,
            modifierCount,
            sourceRefs: [pieceSourceRefs[slot]],
            sourcePointers: [sourcePointer(sourceRecords, pieceSourceRefs[slot])],
            display: {
                status: textPresent ? (slot === "onePiece" ? "displayOnly" : "rawText") : "none",
                sourceRefs: [pieceSourceRefs[slot]]
            },
            calculation: {
                status: modifierCount > 0 ? "candidate" : "blocked",
                reason: modifierCount > 0 ? null : "structuredModifiersMissing"
            }
        };
    });
    const twoOrFourText = slots.twoPiece.textPresent || slots.fourPiece.textPresent;
    const onePieceOnly = slots.onePiece.textPresent && !twoOrFourText;
    const status = invalid ? "invalid" : twoOrFourText ? "unstructured" : onePieceOnly ? "displayOnly" : "noEffect";
    const reasons = [];
    if (invalid) reasons.push("INVALID_RAW_OR_MODIFIER_SHAPE");
    if (slots.onePiece.textPresent) reasons.push("RAW_ONE_PIECE_EFFECT_TEXT_PRESENT");
    if (twoOrFourText) reasons.push("RAW_2PC_4PC_EFFECT_TEXT_PRESENT");
    if (!twoOrFourText) reasons.push("EMPTY_2PC_4PC_EFFECT_FIELDS");
    reasons.push("STRUCTURED_MODIFIER_RECORD_MISSING");
    if (status === "displayOnly") reasons.push("ONE_PIECE_ONLY_NOT_CALCULATED_BY_2PC_4PC_RUNTIME");
    if (status === "unstructured") reasons.push("RAW_TEXT_REQUIRES_STRUCTURING_REVIEW");
    if (status === "noEffect") reasons.push("NO_EXPLICIT_2PC_4PC_EFFECT_TEXT");
    return {
        setId: String(setId),
        setNameJa: set?.nameJa || null,
        status,
        canonical: 0,
        reasons,
        sourceRefs: [
            `artifact:${setId}:catalog`,
            `artifact:${setId}:effects`,
            ...PIECE_SLOTS.map((slot) => pieceSourceRefs[slot])
        ],
        sourcePointers: [
            `artifact:${setId}:catalog`,
            `artifact:${setId}:effects`,
            ...PIECE_SLOTS.map((slot) => pieceSourceRefs[slot])
        ].map((sourceId) => sourcePointer(sourceRecords, sourceId)),
        modifierRecord: {
            present: PIECE_SLOTS.some((slot) => slots[slot].modifierCount > 0),
            totalCount: PIECE_SLOTS.reduce((sum, slot) => sum + slots[slot].modifierCount, 0),
            sourceDataset: "calc/artifact-set-modifiers.json",
            record: `/${setId}`
        },
        pieceSlots: slots
    };
}

/**
 * A missing scalar value is a review classification, not a license to infer
 * one from a ratio/reference or from prose.  The 15020 four-piece candidate
 * is the current instance: explicit scaling fields exist, but `value` is
 * intentionally absent and remains absent in the candidate.
 */
function classifyValueContractGap({ candidateId, setId, slot, modifier, sourceRefs, sourceRecords }) {
    if (explicitValueField(modifier)) return null;
    const structuredFields = Object.keys(modifier || {}).filter((field) =>
        !["id", "category", "applyTo", "unit", "condition", "calculationSupport", "uidHandling"].includes(field)
    ).sort();
    const reasons = ["EXPLICIT_VALUE_FIELD_MISSING"];
    if (structuredFields.some((field) => ["reference", "ratio", "maxValue", "valueByRefinement", "valueByStack"].includes(field))) {
        reasons.push("SCALING_REFERENCE_FIELDS_PRESENT");
    }
    if (Array.isArray(modifier?.applyTo) && modifier.applyTo.length) reasons.push("TARGET_CONTRACT_PRESENT");
    else reasons.push("TARGET_CONTRACT_MISSING");
    reasons.push("NO_VALUE_INFERRED_FROM_SOURCE_TEXT_OR_RATIO");
    return {
        candidateId,
        setId: String(setId),
        slot,
        status: "needsReview",
        canonical: 0,
        value: null,
        explicitValueFields: [],
        structuredFields,
        reasons,
        sourceRefs: [...sourceRefs],
        sourcePointers: sourceRefs.map((sourceId) => sourcePointer(sourceRecords, sourceId)),
        legacyModifierPath: `calc/artifact-set-modifiers.json#/${setId}/${slot}/0`
    };
}

function classifyInputPolicy(modifier) {
    const targets = Array.isArray(modifier.applyTo) ? modifier.applyTo : [];
    const represented = modifier.uidHandling === "includedInUidStats" && (
        (modifier.category === "statBonus" && targets.length && targets.every((target) => UID_INPUT_STAT_TARGETS.has(target)))
        || (modifier.category === "critBonus" && targets.length && targets.every((target) => UID_INPUT_CRIT_TARGETS.has(target)))
        || (modifier.category === "damageBonus" && targets.length && targets.every((target) => UID_INPUT_DAMAGE_TARGETS.has(target)))
        || (modifier.category === "healingBonus" && targets.length && targets.every((target) => target === "outgoingHealingBonus"))
    );
    if (represented) return "reflected";
    if ((modifier.condition || "always") === "always") return "automatic";
    if (DERIVED_CONDITIONS.has(modifier.condition)) return "derived";
    if (modifier.calculationSupport === "stack" && modifier.stack) return "stack";
    return "userToggle";
}

function automaticDetectability(modifier) {
    const policy = classifyInputPolicy(modifier);
    const status = policy === "automatic" || policy === "reflected"
        ? "automatic"
        : policy === "derived" ? "derived" : "manual";
    return {
        status,
        policy,
        source: "explicitStructuredFields",
        notes: "Classification uses condition, calculationSupport, uidHandling, category, and applyTo only; effect text is not interpreted."
    };
}

function claim(status, sourceRefs, notes) {
    const result = { status, sourceRefs: [...sourceRefs] };
    if (notes) result.notes = notes;
    return result;
}

function buildClaims(modifier, sourceRefs, slot, destination, runtimeId, supersedesLegacyModifierIds) {
    const values = explicitValueFields(modifier);
    const claims = {
        pieceCount: claim("needsReview", sourceRefs, "Piece count is copied from the structured modifier slot."),
        value: values.length
            ? claim("needsReview", sourceRefs, "Value fields are copied from the legacy modifier contract; no prose parsing was performed.")
            : claim("notApplicable", sourceRefs, "The legacy modifier has no explicit value field; the generator did not infer one from text."),
        condition: modifier.condition !== undefined
            ? claim("needsReview", sourceRefs, "Condition is copied verbatim from the legacy modifier contract.")
            : claim("notApplicable", sourceRefs),
        activation: claim("needsReview", sourceRefs, "Activation/input fields are copied; independent source and version review are required."),
        targets: Array.isArray(modifier.applyTo) && modifier.applyTo.length
            ? claim("needsReview", sourceRefs, "Targets are copied verbatim from applyTo; prose was not interpreted.")
            : claim("notApplicable", sourceRefs, "No explicit applyTo target exists in the legacy record."),
        inputPolicy: claim("needsReview", sourceRefs, "Input policy is deterministically classified from explicit structured fields."),
        automaticDetectability: claim("needsReview", sourceRefs, "Automatic/derived/manual routing remains unverified until independent review.")
    };
    if (slot) claims.pieceSlot = claim("needsReview", sourceRefs);
    [
        ["duration", "duration"], ["stack", "stack"], ["cooldown", "cooldown"],
        ["interval", "interval"], ["maxTriggerCount", "maxTriggerCount"],
        ["maxActiveElements", "maxActiveElements"], ["target", "target"],
        ["targetOwner", "targetOwner"], ["conditionInput", "conditionInput"]
    ].forEach(([claimName, field]) => {
        if (modifier[field] !== undefined) claims[claimName] = claim("needsReview", sourceRefs, `Copied from legacy field ${field}; independent verification is required.`);
        else claims[claimName] = claim("notApplicable", sourceRefs);
    });
    claims.registryStructure = claim("notApplicable", sourceRefs, "No artifact effect registry is present in the legacy data root.");
    // These three claims make the route identity and legacy replacement
    // boundary explicit.  They remain needsReview until independent evidence
    // confirms the engine route, the namespaced ID, and exact supersession.
    claims.destination = claim("needsReview", sourceRefs, `Runtime route is ${destination.dataset}/${destination.entityId}/${destination.collection}; independent route review is required.`);
    claims["runtime.modifierIds"] = claim("needsReview", sourceRefs, `Runtime modifier ID ${runtimeId} is deterministic and namespaced; independent ID review is required.`);
    claims.supersedesLegacyModifierIds = claim("needsReview", sourceRefs, `Supersession is limited to the exact legacy modifier ID(s): ${supersedesLegacyModifierIds.join(", ")}.`);
    return claims;
}

function buildEffect(modifier, slot, modifierIndex) {
    const piece = pieceSlot(slot);
    const effect = {
        kind: String(modifier.category || "unknown"),
        legacyModifierId: legacyModifierId(modifier, modifierIndex),
        targets: clone(modifier.applyTo || []),
        activation: {},
        pieceSlot: piece,
        pieceCount: pieceCount(piece),
        inputPolicy: {
            uidHandling: modifier.uidHandling === undefined ? null : clone(modifier.uidHandling),
            calculationSupport: modifier.calculationSupport === undefined ? null : clone(modifier.calculationSupport),
            policy: classifyInputPolicy(modifier),
            source: "explicitStructuredFields"
        },
        automaticDetectability: automaticDetectability(modifier)
    };
    // Keep activation fields visible in the generic effect shape while also
    // copying every legacy property below without interpretation.
    [
        "condition", "conditionGroupId", "conditionInput", "conditionLabel", "trigger",
        "target", "targetOwner", "resource", "effect", "customHandlingRequired",
        "calculationSupport", "uidHandling", "damageCalculation", "damageRelevance",
        "durationAfterEnteringField", "relatedElementsByReaction", "relatedElementMap",
        "reactionTargetRule", "lunarCrystallizeTargetElement", "appliesElements"
    ].forEach((field) => {
        if (modifier[field] !== undefined) effect.activation[field] = clone(modifier[field]);
    });
    // Losslessly carry explicit structured fields.  The identifying fields are
    // represented by the normalized slots above and are omitted only to avoid
    // duplicate aliases; no field value is synthesized.
    Object.keys(modifier).sort().forEach((field) => {
        if (["id", "category", "applyTo", "uidHandling", "calculationSupport"].includes(field)) return;
        effect[field] = clone(modifier[field]);
    });
    // Keep the two policy inputs at the root as lossless aliases as well as
    // inside inputPolicy/activation; consumers can therefore resolve the
    // legacy contract without consulting prose or a hidden side channel.
    if (modifier.uidHandling !== undefined) effect.uidHandling = clone(modifier.uidHandling);
    if (modifier.calculationSupport !== undefined) effect.calculationSupport = clone(modifier.calculationSupport);
    const valueField = explicitValueField(modifier);
    if (valueField) effect.value = clone(modifier[valueField]);
    if (modifier.duration !== undefined && typeof modifier.duration === "number") effect.durationSeconds = modifier.duration;
    if (modifier.cooldown !== undefined && typeof modifier.cooldown === "number") effect.cooldownSeconds = modifier.cooldown;
    return effect;
}

function runtimeFor({ setId, slot, modifier, modifierIndex }) {
    const runtimeId = artifactRuntimeModifierId(setId, slot, modifier, modifierIndex);
    const destination = artifactRuntimeDestination(setId, slot);
    const supersedesLegacyModifierIds = [legacyModifierId(modifier, modifierIndex)];
    return {
        status: "candidate",
        modifierIds: [runtimeId],
        generator: "genshinArtifactV2Generate.cjs",
        destination,
        supersedesLegacyModifierIds,
        blockedReasons: [
            "verificationStatusNeedsReview",
            "sourceAgreementSingleSource",
            "gameVersionMissing",
            "independentSourceRequired"
        ]
    };
}

function buildSpec({ setId, slot, modifier, modifierIndex, sourceRefs }) {
    const id = legacyCandidateId(setId, slot, modifier, modifierIndex);
    const runtime = runtimeFor({ setId, slot, modifier, modifierIndex });
    const destination = artifactRuntimeDestination(setId, slot);
    const supersedesLegacyModifierIds = [legacyModifierId(modifier, modifierIndex)];
    return {
        id,
        entity: { kind: "artifactSet", id: String(setId), component: "modifier" },
        sourceRefs: [...sourceRefs],
        interpretation: {
            method: "deterministicParser",
            author: "genshinArtifactV2Generate.cjs",
            version: GENERATOR_VERSION,
            notes: "Explicit legacy fields were copied; artifact effect text was retained as evidence and never interpreted."
        },
        effect: buildEffect(modifier, slot, modifierIndex),
        destination,
        supersedesLegacyModifierIds,
        verification: {
            status: "needsReview",
            reviewedBy: null,
            reviewedAt: null,
            sourceAgreement: "singleSource",
            claims: buildClaims(modifier, sourceRefs, slot, destination, runtime.modifierIds[0], supersedesLegacyModifierIds),
            discrepancies: [
                { code: "GAME_VERSION_MISSING", sourceRefs: [...sourceRefs] },
                { code: "SINGLE_SOURCE", sourceRefs: [...sourceRefs] },
                { code: "INDEPENDENT_REVIEW_REQUIRED", fields: ["pieceCount", "value", "condition", "activation", "targets", "inputPolicy"] }
            ]
        },
        runtime
    };
}

function generatedFrom(dataRoot, fileNames) {
    return fileNames.filter((fileName) => fs.existsSync(path.join(dataRoot, fileName))).map((fileName) => {
        const absolute = path.join(dataRoot, fileName);
        const bytes = fs.readFileSync(absolute);
        return {
            dataset: fileName.replace(/\\/g, "/"),
            path: `games/genshin/data/${fileName.replace(/\\/g, "/")}`,
            integrity: { algorithm: "sha256", digest: crypto.createHash("sha256").update(bytes).digest("hex") }
        };
    });
}

function legacyAuditMetadata(dataRoot) {
    const candidates = [
        {
            id: "artifact-set-modifiers-audit-v10",
            absolute: path.join(dataRoot, "calc", "artifact-set-modifiers-audit-v10.json"),
            path: "games/genshin/data/calc/artifact-set-modifiers-audit-v10.json"
        }
    ];
    return candidates.filter((candidate) => fs.existsSync(candidate.absolute)).map((candidate) => {
        const bytes = fs.readFileSync(candidate.absolute);
        let summary = null;
        try { summary = readJson(candidate.absolute).summary || null; } catch { /* digest remains useful */ }
        return {
            id: candidate.id,
            path: candidate.path,
            integrity: { algorithm: "sha256", digest: crypto.createHash("sha256").update(bytes).digest("hex") },
            summary
        };
    });
}

function registryCandidates(dataRoot) {
    return [
        "calc/artifact-set-effect-registry.json",
        "calc/artifact-effect-registry.json",
        "calc/artifact-registry.json"
    ].filter((fileName) => fs.existsSync(path.join(dataRoot, fileName)));
}

function buildDataset({ dataRoot = defaultDataRoot } = {}) {
    const sets = readJson(path.join(dataRoot, "artifact-sets.json"));
    const effects = readJson(path.join(dataRoot, "artifact-set-effects.json"));
    const modifiers = readJson(path.join(dataRoot, "calc", "artifact-set-modifiers.json"));
    const registryFiles = registryCandidates(dataRoot);
    const registry = registryFiles.length ? readJson(path.join(dataRoot, registryFiles[0])) : null;
    const sourceRecords = {};
    const specs = {};
    const packages = {};
    const setIds = [...new Set([...Object.keys(sets), ...Object.keys(effects), ...Object.keys(modifiers)])].sort();
    const modifierIds = [];
    const legacyModifierIds = [];
    const policyCounts = {};
    const duplicateLegacyIds = new Map();
    const registryRefs = new Set();
    const structuredModifierGapEntries = {};

    setIds.forEach((setId) => {
        const set = sets[setId] || {};
        const effectDocument = effects[setId] || {};
        const modifierDocument = modifiers[setId] || {};
        const catalogSourceId = `artifact:${setId}:catalog`;
        const effectsSourceId = `artifact:${setId}:effects`;
        putSource(sourceRecords, sourceRecord({
            id: catalogSourceId,
            kind: "primaryDataset",
            provider: "damageTool-local",
            independenceGroup: "damageTool-local-derived",
            providerIndependence: "correlated",
            dataset: "artifact-sets.json",
            record: `/${setId}`,
            text: stableJson(set),
            structuredValue: set,
            notes: "Catalog identity record; game version is not recorded in the legacy dataset."
        }));
        putSource(sourceRecords, sourceRecord({
            id: effectsSourceId,
            kind: "primaryDataset",
            provider: "damageTool-local",
            independenceGroup: "damageTool-local-derived",
            providerIndependence: "correlated",
            dataset: "artifact-set-effects.json",
            record: `/${setId}`,
            text: stableJson(effectDocument),
            structuredValue: effectDocument,
            notes: "Raw set effect text; no values, targets, timings, or conditions are inferred from it."
        }));

        const pieceSourceRefs = {};
        const packageSpecIds = [];
        const packageModifierIds = [];
        const packageRuntimeModifierIds = [];
        PIECE_SLOTS.forEach((slot) => {
            const slotText = effectDocument[`${slot}Effect`] === undefined ? "" : effectDocument[`${slot}Effect`];
            const effectSourceId = `artifact:${setId}:effect:${slot}`;
            pieceSourceRefs[slot] = effectSourceId;
            putSource(sourceRecords, sourceRecord({
                id: effectSourceId,
                kind: "primaryDataset",
                provider: "damageTool-local",
                independenceGroup: "damageTool-local-derived",
                providerIndependence: "correlated",
                dataset: "artifact-set-effects.json",
                record: `/${setId}`,
                field: `${slot}Effect`,
                text: slotText,
                structuredValue: slotText,
                notes: "Raw localized effect text; no prose interpretation was performed."
            }));
            const slotModifiers = Array.isArray(modifierDocument[slot]) ? modifierDocument[slot] : [];
            slotModifiers.forEach((modifier, modifierIndex) => {
                const candidateId = legacyCandidateId(setId, slot, modifier, modifierIndex);
                const modifierSourceId = `artifact:${setId}:modifier:${slot}:${modifierIndex}`;
                putSource(sourceRecords, sourceRecord({
                    id: modifierSourceId,
                    kind: "primaryDataset",
                    provider: "damageTool-local",
                    independenceGroup: "damageTool-local-derived",
                    providerIndependence: "correlated",
                    dataset: "calc/artifact-set-modifiers.json",
                    record: `/${setId}/${slot}/${modifierIndex}`,
                    field: modifier.sourceText !== undefined ? "sourceText" : `${slot}[${modifierIndex}]`,
                    text: modifier.sourceText !== undefined ? modifier.sourceText : stableJson(modifier),
                    structuredValue: modifier,
                    notes: "Legacy structured modifier record; no effect values or targets were inferred from localized prose."
                }));
                const refs = [catalogSourceId, effectsSourceId, effectSourceId, modifierSourceId];
                // Preserve a registry source if a future dataset supplies one,
                // but never promote its structure to a verified candidate.
                if (registry) {
                    const registrySourceId = `artifact:${setId}:registry:${slot}:${modifierIndex}`;
                    const registryValue = registry?.artifacts?.[setId]?.[slot]?.[modifierIndex]
                        || registry?.[setId]?.[slot]?.[modifierIndex];
                    if (registryValue !== undefined) {
                        putSource(sourceRecords, sourceRecord({
                            id: registrySourceId,
                            kind: "manualTranscription",
                            provider: "damageTool-reviewRegistry",
                            independenceGroup: "damageTool-local-derived",
                            providerIndependence: "correlated",
                            dataset: registryFiles[0],
                            record: `/${setId}/${slot}/${modifierIndex}`,
                            text: stableJson(registryValue),
                            structuredValue: registryValue,
                            notes: "Existing registry evidence is retained as unverified."
                        }));
                        refs.push(registrySourceId);
                        registryRefs.add(registrySourceId);
                    }
                }
                const spec = buildSpec({ setId, slot, modifier, modifierIndex, sourceRefs: refs });
                specs[spec.id] = spec;
                packageSpecIds.push(spec.id);
                packageModifierIds.push(spec.id);
                packageRuntimeModifierIds.push(spec.runtime.modifierIds[0]);
                modifierIds.push(spec.id);
                legacyModifierIds.push({ id: String(modifier.id || `modifier_${modifierIndex + 1}`), setId, slot, modifierIndex, candidateId: spec.id });
                const legacyId = String(modifier.id || `modifier_${modifierIndex + 1}`);
                if (!duplicateLegacyIds.has(legacyId)) duplicateLegacyIds.set(legacyId, []);
                duplicateLegacyIds.get(legacyId).push({ setId, slot, modifierIndex, candidateId: spec.id });
                const policy = classifyInputPolicy(modifier);
                policyCounts[policy] = (policyCounts[policy] || 0) + 1;
            });
        });
        const hasStructuredModifiers = PIECE_SLOTS.some((slot) =>
            Array.isArray(modifierDocument[slot]) && modifierDocument[slot].length > 0
        );
        const gapReview = hasStructuredModifiers ? null : classifyStructuredModifierGap({
            setId,
            set,
            effectDocument,
            modifierDocument,
            pieceSourceRefs,
            sourceRecords
        });
        if (gapReview) structuredModifierGapEntries[setId] = gapReview;
        const status = packageSpecIds.length ? "candidate" : "blocked";
        packages[setId] = {
            schemaVersion: 2,
            entity: { kind: "artifactSet", id: String(setId) },
            sourceRefs: [catalogSourceId, effectsSourceId],
            pieceSlots: Object.fromEntries(PIECE_SLOTS.map((slot) => [slot, {
                pieceCount: PIECE_COUNTS[slot],
                sourceRefs: [pieceSourceRefs[slot]],
                modifierIds: packageSpecIds.filter((id) => id.startsWith(`artifact:${setId}:${slot}:`)),
                specIds: packageSpecIds.filter((id) => id.startsWith(`artifact:${setId}:${slot}:`))
            }])),
            modifierIds: packageModifierIds,
            specIds: packageSpecIds,
            verification: {
                status: "needsReview",
                sourceAgreement: "singleSource",
                reviewedBy: null,
                reviewedAt: null,
                notes: "Artifact package remains review-gated because legacy sources have no game version or independent corroboration."
            },
            gapReview,
            runtime: {
                status,
                modifierIds: packageRuntimeModifierIds,
                generator: "genshinArtifactV2Generate.cjs",
                blockedReasons: [
                    "verificationStatusNeedsReview",
                    "sourceAgreementSingleSource",
                    "gameVersionMissing",
                    ...(packageSpecIds.length ? [] : ["structuredModifiersMissing"])
                ]
            }
        };
    });

    const duplicateLegacyGroups = [...duplicateLegacyIds.entries()]
        .filter(([, occurrences]) => occurrences.length > 1)
        .map(([id, occurrences]) => ({ id, occurrences }));
    const pieceModifierCounts = Object.fromEntries(PIECE_SLOTS.map((slot) => [slot, legacyModifierIds.filter((entry) => entry.slot === slot).length]));
    const structuredModifiersMissing = setIds.filter((setId) => !legacyModifierIds.some((entry) => entry.setId === setId));
    const valueContractGaps = Object.values(specs).map((spec) => {
        const record = legacyModifierIds.find((entry) => entry.candidateId === spec.id);
        if (!record) return null;
        return classifyValueContractGap({
            candidateId: spec.id,
            setId: record.setId,
            slot: record.slot,
            modifier: (modifiers[record.setId]?.[record.slot] || [])[record.modifierIndex] || {},
            sourceRefs: spec.sourceRefs,
            sourceRecords
        });
    }).filter(Boolean);
    const reviewStatusCounts = Object.fromEntries(GAP_REVIEW_STATUSES.map((status) => [status, 0]));
    const reviewSlotStatusCounts = Object.fromEntries(GAP_REVIEW_STATUSES.map((status) => [status, 0]));
    Object.values(structuredModifierGapEntries).forEach((entry) => {
        reviewStatusCounts[entry.status] = (reviewStatusCounts[entry.status] || 0) + 1;
        Object.values(entry.pieceSlots || {}).forEach((slot) => {
            reviewSlotStatusCounts[slot.status] = (reviewSlotStatusCounts[slot.status] || 0) + 1;
        });
    });
    const valueReviewStatusCounts = Object.fromEntries(GAP_REVIEW_STATUSES.map((status) => [status, 0]));
    valueContractGaps.forEach((entry) => { valueReviewStatusCounts[entry.status] = (valueReviewStatusCounts[entry.status] || 0) + 1; });
    const statusCounts = {};
    const sourceAgreementCounts = {};
    const runtimeCounts = {};
    Object.values(specs).forEach((spec) => {
        statusCounts[spec.verification.status] = (statusCounts[spec.verification.status] || 0) + 1;
        sourceAgreementCounts[spec.verification.sourceAgreement] = (sourceAgreementCounts[spec.verification.sourceAgreement] || 0) + 1;
        runtimeCounts[spec.runtime.status] = (runtimeCounts[spec.runtime.status] || 0) + 1;
    });
    const sourceKinds = {};
    Object.values(sourceRecords).forEach((source) => { sourceKinds[source.kind] = (sourceKinds[source.kind] || 0) + 1; });
    const summary = {
        schemaVersion: 2,
        sets: setIds.length,
        generatedSets: Object.keys(packages).length,
        modifiers: legacyModifierIds.length,
        specs: Object.keys(specs).length,
        pieceModifierCounts,
        structuredModifiersMissing,
        structuredModifierGapReview: {
            sets: Object.keys(structuredModifierGapEntries).length,
            statuses: reviewStatusCounts,
            slotStatuses: reviewSlotStatusCounts,
            valueContracts: valueContractGaps.length,
            valueContractStatuses: valueReviewStatusCounts,
            canonical: 0,
            path: "gap-review.json"
        },
        evidenceHierarchy: {
            aggregateEffectSources: setIds.length,
            slotEffectSources: setIds.length * PIECE_SLOTS.length,
            note: "Aggregate effect records prove complete legacy documents; slot records provide field-level raw text references and are not duplicate modifiers."
        },
        sourceRecords: Object.keys(sourceRecords).length,
        sourceKinds,
        verificationByStatus: statusCounts,
        sourceAgreementByStatus: sourceAgreementCounts,
        runtimeByStatus: runtimeCounts,
        inputPolicyByStatus: policyCounts,
        duplicateLegacyIdGroups: duplicateLegacyGroups.length,
        duplicateLegacyIds: duplicateLegacyGroups,
        registryPresent: Boolean(registry),
        registryFiles,
        registryReferences: registryRefs.size,
        capturedAt: CAPTURED_AT,
        gameVersion: null,
        legacyAudits: legacyAuditMetadata(dataRoot),
        generatedFrom: generatedFrom(dataRoot, [
            "artifact-sets.json",
            "artifact-set-effects.json",
            "calc/artifact-set-modifiers.json",
            "calc/artifact-set-effect-registry.json",
            "calc/artifact-effect-registry.json",
            "calc/artifact-registry.json"
        ])
    };
    const gapReview = {
        schemaVersion: 2,
        kind: "genshinArtifactV2GapReview",
        generator: {
            name: "genshinArtifactV2Generate.cjs",
            version: GENERATOR_VERSION,
            capturedAt: CAPTURED_AT
        },
        policy: {
            canonical: 0,
            statuses: GAP_REVIEW_STATUSES,
            proseParsing: "forbidden",
            notes: "Raw source text and pointers are retained for review. No value, target, condition, timing, or 2pc/4pc runtime effect is inferred."
        },
        summary: {
            sets: Object.keys(structuredModifierGapEntries).length,
            statuses: reviewStatusCounts,
            slotStatuses: reviewSlotStatusCounts,
            valueContracts: valueContractGaps.length,
            valueContractStatuses: valueReviewStatusCounts,
            canonical: 0
        },
        structuredModifierMissing: structuredModifiersMissing.map((setId) => structuredModifierGapEntries[setId]),
        valueContracts: valueContractGaps
    };
    return {
        schemaVersion: 2,
        kind: "genshinArtifactV2",
        generator: { name: "genshinArtifactV2Generate.cjs", version: GENERATOR_VERSION, capturedAt: CAPTURED_AT },
        summary,
        gapReview,
        sourceRecords,
        specs,
        packages,
        setIds,
        modifierIds,
        legacyModifierIds
    };
}

function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeDataset({ dataRoot = defaultDataRoot, outputRoot = defaultOutputRoot } = {}) {
    const dataset = buildDataset({ dataRoot });
    fs.mkdirSync(outputRoot, { recursive: true });
    writeJson(path.join(outputRoot, "source-records.json"), dataset.sourceRecords);
    writeJson(path.join(outputRoot, "spec-candidates.json"), dataset.specs);
    writeJson(path.join(outputRoot, "gap-review.json"), dataset.gapReview);
    writeJson(path.join(outputRoot, "verification.json"), Object.fromEntries(Object.entries(dataset.specs).map(([id, spec]) => [id, {
        entity: spec.entity,
        sourceRefs: spec.sourceRefs,
        verification: spec.verification,
        runtime: spec.runtime
    }])));
    writeJson(path.join(outputRoot, "index.json"), {
        schemaVersion: 2,
        kind: "genshinArtifactV2Index",
        generator: dataset.generator,
        summary: dataset.summary,
        setIds: dataset.setIds,
        modifierIds: dataset.modifierIds,
        legacyModifierIds: dataset.legacyModifierIds,
        paths: { sourceRecords: "source-records.json", specs: "spec-candidates.json", verification: "verification.json", gapReview: "gap-review.json", packages: "packages" }
    });
    writeJson(path.join(outputRoot, "manifest.json"), {
        schemaVersion: 2,
        kind: "genshinArtifactV2Manifest",
        generator: dataset.generator,
        summary: dataset.summary,
        paths: { index: "index.json", sourceRecords: "source-records.json", specs: "spec-candidates.json", verification: "verification.json", gapReview: "gap-review.json", packages: "packages" }
    });
    Object.entries(dataset.packages).forEach(([setId, packageDocument]) => writeJson(path.join(outputRoot, "packages", `${setId}.json`), packageDocument));
    return dataset;
}

if (require.main === module) {
    const dataRoot = process.env.GENSHIN_DATA_ROOT || defaultDataRoot;
    const outputRoot = process.env.GENSHIN_ARTIFACT_V2_ROOT || defaultOutputRoot;
    const dataset = writeDataset({ dataRoot, outputRoot });
    process.stdout.write(`${JSON.stringify(dataset.summary, null, 2)}\n`);
}

module.exports = {
    CAPTURED_AT,
    GAP_REVIEW_STATUSES,
    GENERATOR_VERSION,
    PIECE_SLOTS,
    PIECE_COUNTS,
    RUNTIME_MODIFIER_NAMESPACE,
    RUNTIME_DESTINATION_DATASET,
    artifactRuntimeDestination,
    artifactRuntimeModifierId,
    automaticDetectability,
    buildClaims,
    buildDataset,
    buildEffect,
    buildSpec,
    classifyInputPolicy,
    classifyStructuredModifierGap,
    classifyValueContractGap,
    digest,
    explicitValueField,
    explicitValueFields,
    generatedFrom,
    legacyAuditMetadata,
    legacyModifierId,
    legacyCandidateId,
    pieceCount,
    pieceSlot,
    nonEmptyText,
    sourcePointer,
    sourceRecord,
    stableJson,
    writeDataset
};
