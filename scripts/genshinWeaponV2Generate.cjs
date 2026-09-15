"use strict";

/**
 * Build the weapon v2 evidence/spec layer from the four legacy weapon files.
 *
 * This generator is deliberately a copy-only transform.  It never parses the
 * Japanese effect text to create values, targets, timings, or conditions.  A
 * candidate is therefore always marked needsReview until an independent source
 * and a game-versioned review are supplied.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultDataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultOutputRoot = path.join(defaultDataRoot, "v2", "weapons");
const CAPTURED_AT = "2026-08-15T00:00:00.000Z";
const GENERATOR_VERSION = "genshinWeaponV2Generate/2";
// Runtime IDs deliberately live in a namespace separate from the legacy
// calculator modifier IDs.  The latter remain the stable supersession keys;
// the former are the IDs a future structured runtime route will consume.
const RUNTIME_NAMESPACE = "genshin:v2:weapon";

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

function registryIndex(registry) {
    const result = new Map();
    Object.entries(registry?.weapons || {}).forEach(([weaponId, definition]) => {
        (definition.groups || []).forEach((group, groupIndex) => {
            const record = { weaponId, group, groupIndex };
            (group.modifierIds || []).forEach((modifierId) => result.set(`${weaponId}:${modifierId}`, record));
        });
    });
    return result;
}

function explicitValueFields(modifier) {
    return [
        "value", "valueByRefinement", "valueByRefinementPerStack",
        "valueByRefinementPerConsumedStack"
    ].filter((field) => modifier[field] !== undefined && modifier[field] !== null);
}

function runtimeModifierId(weaponId, legacyModifierId) {
    const entityId = String(weaponId || "");
    const legacyId = String(legacyModifierId || "");
    if (!entityId || !legacyId) throw new Error("weapon runtime modifier IDs require weapon and legacy modifier IDs");
    return `${RUNTIME_NAMESPACE}:${entityId}:${legacyId}`;
}

function runtimeDestination(weaponId) {
    return {
        dataset: "weaponModifiers",
        entityId: String(weaponId),
        collection: "modifiers"
    };
}

function runtimeSupersession(legacyModifierId) {
    return [String(legacyModifierId)];
}

function claim(status, sourceRefs, notes) {
    const result = { status, sourceRefs: [...sourceRefs] };
    if (notes) result.notes = notes;
    return result;
}

function buildClaims(modifier, sourceRefs, registryGroup) {
    const claims = {};
    const values = explicitValueFields(modifier);
    claims.value = values.length
        ? claim("needsReview", sourceRefs, "Copied from the legacy modifier contract; no independent source has been reviewed.")
        : claim("notApplicable", sourceRefs, "The legacy modifier has no explicit value field; the parser did not infer one from text.");
    claims.refinement = modifier.valueByRefinement !== undefined
        ? claim("needsReview", sourceRefs, "Refinement values are copied verbatim and require versioned source review.")
        : claim("notApplicable", sourceRefs);
    claims.activation = claim("needsReview", sourceRefs, "Condition/activation was copied from the legacy contract; prose was not interpreted.");
    claims.targets = claim("needsReview", sourceRefs, "Targets were copied from applyTo; prose was not interpreted.");
    claims["effect.activation.uidHandling"] = modifier.uidHandling !== undefined
        ? claim("needsReview", sourceRefs, "UID handling is copied losslessly from the legacy modifier; independent review is required.")
        : claim("notApplicable", sourceRefs, "The legacy modifier has no explicit UID handling policy; none was inferred.");
    claims.destination = claim("needsReview", sourceRefs, "Runtime destination is a deterministic route declaration; independent review is required.");
    claims.supersedesLegacyModifierIds = claim("needsReview", sourceRefs, "Legacy supersession is copied as an explicit compatibility boundary; independent review is required.");
    claims["runtime.modifierIds"] = claim("needsReview", sourceRefs, "Runtime modifier IDs are deterministic namespaced IDs; independent review is required.");

    const optionalFields = [
        ["duration", "durationSeconds"],
        ["stack", "stack"],
        ["cooldown", "cooldownSeconds"],
        ["interval", "intervalSeconds"],
        ["offField", "offField"],
        ["hitCount", "hitCount"],
        ["charges", "charges"],
        ["maxInstances", "maxInstances"],
        ["elementApplication", "elementApplication"],
        ["energy", "energy"],
        ["snapshot", "snapshot"],
        ["area", "area"]
    ];
    optionalFields.forEach(([field, effectField]) => {
        if (modifier[field] !== undefined) {
            claims[field] = claim("needsReview", sourceRefs, `Copied from legacy field ${field}; independent verification is required.`);
        } else {
            claims[field] = claim("notApplicable", sourceRefs);
        }
        // Keep the claim name expected by the effect-spec contract as well as
        // the legacy field name when they differ (duration/interval/cooldown).
        if (effectField !== field && modifier[effectField] !== undefined) {
            claims[effectField] = claim("needsReview", sourceRefs);
        }
    });
    if (registryGroup) {
        claims.registryStructure = claim(
            "needsReview",
            sourceRefs,
            "The existing review registry is preserved as evidence, not promoted to verified without independent sources and a game version."
        );
    } else {
        claims.registryStructure = claim("notApplicable", sourceRefs, "No existing hand-structured registry group covers this modifier.");
    }
    return claims;
}

function buildEffect(modifier) {
    // Every value below is an explicit legacy field.  Deliberately do not use
    // regexes or number extraction against sourceText/effectTextTemplate.
    const activation = {};
    [
        "condition", "calculationSupport", "uidHandling", "conditionInput", "conditionLabel",
        "conditionOptionValue", "targetEffect", "trigger", "resource",
        "effect", "customHandlingRequired"
    ].forEach((field) => {
        if (modifier[field] !== undefined) activation[field] = clone(modifier[field]);
    });
    const effect = {
        kind: String(modifier.category || "unknown"),
        targets: clone(modifier.applyTo || []),
        activation
    };
    const directFields = [
        "value", "valueByRefinement", "valueByRefinementPerStack",
        "valueByRefinementPerConsumedStack", "valueRole", "unit", "reference",
        "stackReferenceId", "effectMultiplierPercent", "duration", "effectLabel",
        "originalCategory", "customCalculation", "threshold", "maxValueByRefinement",
        "inputPolicy"
    ];
    directFields.forEach((field) => {
        if (modifier[field] !== undefined && modifier[field] !== null) effect[field] = clone(modifier[field]);
    });
    // The v2 contract exposes one generic value slot in addition to the
    // lossless legacy field names.  Pick only an explicit field (never text).
    if (effect.value === undefined) {
        const valueField = [
            "valueByRefinement", "value", "valueByRefinementPerStack",
            "valueByRefinementPerConsumedStack"
        ].find((field) => modifier[field] !== undefined && modifier[field] !== null);
        if (valueField) effect.value = clone(modifier[valueField]);
    }
    if (modifier.duration !== undefined) effect.durationSeconds = Number(modifier.duration);
    if (modifier.stack !== undefined) effect.stack = clone(modifier.stack);
    // These fields are absent from the current legacy data.  If a future
    // dataset supplies them explicitly, preserve them without deriving them.
    ["interval", "cooldown", "hitCount", "charges", "maxInstances", "elementApplication", "energy", "snapshot", "offField", "area"].forEach((field) => {
        if (modifier[field] !== undefined) {
            const target = field === "interval" ? "intervalSeconds" : field === "cooldown" ? "cooldownSeconds" : field;
            effect[target] = clone(modifier[field]);
        }
    });
    return effect;
}

function runtimeFor(modifier, registryGroup, weaponId) {
    const modifierIds = modifier.id ? [runtimeModifierId(weaponId, modifier.id)] : [];
    const destination = runtimeDestination(weaponId);
    const supersedesLegacyModifierIds = runtimeSupersession(modifier.id);
    if (modifier.calculationSupport === "displayOnly") {
        return {
            status: "displayOnly",
            modifierIds,
            generator: null,
            blockedReasons: ["displayOnlyNonDamageEffect"],
            destination,
            supersedesLegacyModifierIds
        };
    }
    const blockedReasons = [
        "verificationStatusNeedsReview",
        "sourceAgreementSingleSource",
        "gameVersionMissing",
        "independentSourceRequired"
    ];
    if (registryGroup) blockedReasons.push("registryStructureNeedsReview");
    if (modifier.auditDisposition === "supersededByStructuredRecord") blockedReasons.push("legacyModifierSuperseded");
    if (modifier.auditDisposition === "sourceContextRequired") blockedReasons.push("sourceContextRequired");
    return {
        status: "candidate",
        modifierIds,
        generator: "genshinWeaponV2Generate.cjs",
        blockedReasons,
        destination,
        supersedesLegacyModifierIds
    };
}

function buildSpec({ weaponId, weapon, effect, modifier, modifierIndex, sourceRecords, registryGroup }) {
    const catalogSourceId = `weapon:${weaponId}:catalog`;
    const effectSourceId = `weapon:${weaponId}:effect`;
    const modifierSourceId = `weapon:${weaponId}:modifier:${modifier.id}`;
    const refs = [catalogSourceId, effectSourceId, modifierSourceId];
    if (registryGroup) refs.push(`weapon:${weaponId}:registry:${registryGroup.id}`);
    const runtime = runtimeFor(modifier, registryGroup, weaponId);
    const discrepancies = [
        { code: "GAME_VERSION_MISSING", sourceRefs: refs },
        { code: "SINGLE_SOURCE", sourceRefs: refs },
        { code: "INDEPENDENT_REVIEW_REQUIRED", fields: ["value", "refinement", "activation", "targets"] }
    ];
    if (modifier.auditDisposition === "supersededByStructuredRecord") {
        discrepancies.push({ code: "SUPERSEDED_LEGACY_RECORD", sourceRefs: [modifierSourceId] });
    }
    return {
        id: modifier.id,
        entity: { kind: "weapon", id: String(weaponId), component: "modifier" },
        sourceRefs: refs,
        destination: runtime.destination,
        supersedesLegacyModifierIds: runtime.supersedesLegacyModifierIds,
        interpretation: {
            method: "deterministicParser",
            author: "genshinWeaponV2Generate.cjs",
            version: GENERATOR_VERSION,
            notes: "Explicit legacy fields were copied; description text was not interpreted."
        },
        effect: buildEffect(modifier),
        verification: {
            status: "needsReview",
            reviewedBy: null,
            reviewedAt: null,
            sourceAgreement: "singleSource",
            claims: buildClaims(modifier, refs, registryGroup),
            discrepancies
        },
        runtime
    };
}

function generatedFrom(dataRoot, fileNames) {
    return fileNames.map((fileName) => {
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
            id: "weapon-modifiers-audit-v10",
            absolute: path.join(dataRoot, "calc", "weapon-modifiers-audit-v10.json"),
            path: "games/genshin/data/calc/weapon-modifiers-audit-v10.json"
        },
        {
            id: "weapon-effect-audit",
            absolute: path.join(repositoryRoot, "reports", "genshin-weapon-effect-audit.json"),
            path: "reports/genshin-weapon-effect-audit.json"
        }
    ];
    return candidates.filter((candidate) => fs.existsSync(candidate.absolute)).map((candidate) => {
        const bytes = fs.readFileSync(candidate.absolute);
        let summary = null;
        try {
            summary = readJson(candidate.absolute).summary || null;
        } catch {
            // The digest still provides deterministic evidence if a report is
            // malformed; the audit will surface that condition separately.
        }
        return {
            id: candidate.id,
            path: candidate.path,
            integrity: { algorithm: "sha256", digest: crypto.createHash("sha256").update(bytes).digest("hex") },
            summary
        };
    });
}

function buildDataset({ dataRoot = defaultDataRoot } = {}) {
    const weapons = readJson(path.join(dataRoot, "weapons.json"));
    const effects = readJson(path.join(dataRoot, "weapon-effects.json"));
    const modifiers = readJson(path.join(dataRoot, "calc", "weapon-modifiers.json"));
    const registry = readJson(path.join(dataRoot, "calc", "weapon-effect-registry.json"));
    const registryByModifier = registryIndex(registry);
    const sourceRecords = {};
    const specs = {};
    const packages = {};
    const modifierIds = [];
    const registryGroupIds = new Set();

    const weaponIds = Object.keys(modifiers).sort();
    weaponIds.forEach((weaponId) => {
        const weapon = weapons[weaponId] || {};
        const effect = effects[weaponId] || {};
        const weaponModifiers = modifiers[weaponId]?.modifiers || [];
        putSource(sourceRecords, sourceRecord({
            id: `weapon:${weaponId}:catalog`,
            kind: "primaryDataset",
            provider: "damageTool-local",
            independenceGroup: "damageTool-local-derived",
            providerIndependence: "correlated",
            dataset: "weapons.json",
            record: `/${weaponId}`,
            text: stableJson(weapon),
            structuredValue: weapon,
            notes: "Catalog identity record; game version is not recorded in the legacy dataset."
        }));
        putSource(sourceRecords, sourceRecord({
            id: `weapon:${weaponId}:effect`,
            kind: "primaryDataset",
            provider: "damageTool-local",
            independenceGroup: "damageTool-local-derived",
            providerIndependence: "correlated",
            dataset: "weapon-effects.json",
            record: `/${weaponId}`,
            field: "effectTextTemplate",
            text: effect.effectTextTemplate || "",
            structuredValue: effect,
            notes: "Raw effect text; no values or targets are inferred from this text."
        }));
        const packageSpecs = [];
        weaponModifiers.forEach((modifier, modifierIndex) => {
            const modifierId = String(modifier.id || `w_${weaponId}_modifier_${modifierIndex + 1}`);
            if (!modifier.id) modifier.id = modifierId;
            modifierIds.push(modifierId);
            const modifierSourceId = `weapon:${weaponId}:modifier:${modifierId}`;
            putSource(sourceRecords, sourceRecord({
                id: modifierSourceId,
                kind: "primaryDataset",
                provider: "damageTool-local",
                independenceGroup: "damageTool-local-derived",
                providerIndependence: "correlated",
                dataset: "calc/weapon-modifiers.json",
                record: `/${weaponId}/modifiers/${modifierIndex}`,
                field: "sourceText",
                text: modifier.sourceText || "",
                structuredValue: modifier,
                notes: "Legacy structured modifier record; not an independent game-versioned source."
            }));
            const registryRecord = registryByModifier.get(`${weaponId}:${modifierId}`);
            const registryGroup = registryRecord?.group || null;
            if (registryGroup) {
                registryGroupIds.add(`${weaponId}:${registryGroup.id}`);
                putSource(sourceRecords, sourceRecord({
                    id: `weapon:${weaponId}:registry:${registryGroup.id}`,
                    kind: "manualTranscription",
                    provider: "damageTool-reviewRegistry",
                    independenceGroup: "damageTool-local-derived",
                    providerIndependence: "correlated",
                    dataset: "calc/weapon-effect-registry.json",
                    record: `/weapons/${weaponId}/groups/${(registryRecord.groupIndex ?? 0)}`,
                    text: registryGroup.description || stableJson(registryGroup),
                    structuredValue: registryGroup,
                    notes: "Existing hand-structured registry evidence retained as unverified."
                }));
            }
            const spec = buildSpec({
                weaponId,
                weapon,
                effect,
                modifier,
                modifierIndex,
                sourceRecords,
                registryGroup
            });
            specs[spec.id] = spec;
            packageSpecs.push(spec.id);
        });
        const packageRuntimeStatuses = packageSpecs.map((id) => specs[id].runtime.status);
        const packageStatus = packageRuntimeStatuses.includes("candidate")
            ? "candidate"
            : packageRuntimeStatuses.includes("displayOnly") ? "displayOnly" : "blocked";
        packages[weaponId] = {
            schemaVersion: 2,
            entity: { kind: "weapon", id: String(weaponId) },
            sourceRefs: [`weapon:${weaponId}:catalog`, `weapon:${weaponId}:effect`],
                modifierIds: packageSpecs,
                specIds: packageSpecs,
            verification: {
                status: "needsReview",
                sourceAgreement: "singleSource",
                reviewedBy: null,
                reviewedAt: null,
                notes: "Weapon package remains review-gated because legacy sources have no game version or independent corroboration."
            },
            runtime: {
                status: packageStatus,
                modifierIds: packageSpecs.map((id) => specs[id].runtime.modifierIds[0]),
                generator: "genshinWeaponV2Generate.cjs",
                blockedReasons: ["verificationStatusNeedsReview", "sourceAgreementSingleSource", "gameVersionMissing"]
            }
        };
    });

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
        weapons: weaponIds.length,
        modifiers: modifierIds.length,
        sourceRecords: Object.keys(sourceRecords).length,
        specs: Object.keys(specs).length,
        registryWeapons: Object.keys(registry.weapons || {}).length,
        registryGroups: registryGroupIds.size,
        sourceKinds,
        verificationByStatus: statusCounts,
        sourceAgreementByStatus: sourceAgreementCounts,
        runtimeByStatus: runtimeCounts,
        runtimeNamespace: RUNTIME_NAMESPACE,
        runtimeRoute: {
            dataset: "weaponModifiers",
            collection: "modifiers"
        },
        capturedAt: CAPTURED_AT,
        gameVersion: null,
        legacyAudits: legacyAuditMetadata(dataRoot),
        generatedFrom: generatedFrom(dataRoot, [
            "weapons.json",
            "weapon-effects.json",
            "calc/weapon-modifiers.json",
            "calc/weapon-effect-registry.json"
        ])
    };
    return {
        schemaVersion: 2,
        kind: "genshinWeaponV2",
        generator: { name: "genshinWeaponV2Generate.cjs", version: GENERATOR_VERSION, capturedAt: CAPTURED_AT },
        summary,
        sourceRecords,
        specs,
        packages,
        weaponIds,
        modifierIds
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
    writeJson(path.join(outputRoot, "verification.json"), Object.fromEntries(Object.entries(dataset.specs).map(([id, spec]) => [id, {
        entity: spec.entity,
        sourceRefs: spec.sourceRefs,
        verification: spec.verification,
        runtime: spec.runtime
    }])));
    writeJson(path.join(outputRoot, "index.json"), {
        schemaVersion: 2,
        kind: "genshinWeaponV2Index",
        generator: dataset.generator,
        summary: dataset.summary,
        weaponIds: dataset.weaponIds,
        modifierIds: dataset.modifierIds,
        paths: {
            sourceRecords: "source-records.json",
            specs: "spec-candidates.json",
            verification: "verification.json",
            packages: "packages"
        }
    });
    writeJson(path.join(outputRoot, "manifest.json"), {
        schemaVersion: 2,
        kind: "genshinWeaponV2Manifest",
        generator: dataset.generator,
        summary: dataset.summary,
        paths: {
            index: "index.json",
            sourceRecords: "source-records.json",
            specs: "spec-candidates.json",
            verification: "verification.json",
            packages: "packages"
        }
    });
    Object.entries(dataset.packages).forEach(([weaponId, packageDocument]) => {
        writeJson(path.join(outputRoot, "packages", `${weaponId}.json`), packageDocument);
    });
    return dataset;
}

if (require.main === module) {
    const dataRoot = process.env.GENSHIN_DATA_ROOT || defaultDataRoot;
    const outputRoot = process.env.GENSHIN_WEAPON_V2_ROOT || defaultOutputRoot;
    const dataset = writeDataset({ dataRoot, outputRoot });
    process.stdout.write(`${JSON.stringify(dataset.summary, null, 2)}\n`);
}

module.exports = {
    CAPTURED_AT,
    GENERATOR_VERSION,
    RUNTIME_NAMESPACE,
    buildClaims,
    buildDataset,
    buildEffect,
    buildSpec,
    digest,
    explicitValueFields,
    legacyAuditMetadata,
    registryIndex,
    runtimeDestination,
    runtimeModifierId,
    runtimeSupersession,
    sourceRecord,
    stableJson,
    writeDataset
};
