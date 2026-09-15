"use strict";

/**
 * Triage the field-level gcsim weapon conflicts without modifying a candidate.
 *
 * `external-evidence.json` deliberately compares every projected field with a
 * candidate value.  A unit projection previously appeared in the aggregate
 * `candidateValueConflicts` counter even when the corresponding candidate
 * field was semantically equal.  This artifact separates direct field-value
 * conflicts from semantic scope/parser discrepancies and records the
 * field-aware comparison for every remaining discrepancy plus all six
 * unmapped fields.
 * No source value is inferred and no candidate is promoted.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const repositoryRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultEvidencePath = path.join(dataRoot, "v2", "weapons", "external-evidence.json");
const defaultCandidatePath = path.join(dataRoot, "v2", "weapons", "spec-candidates.json");
const defaultSourceCatalogPath = path.join(dataRoot, "v2", "source-catalog.json");
const defaultLegacyRegistryPath = path.join(dataRoot, "calc", "weapon-effect-registry.json");
const defaultOutputPath = path.join(dataRoot, "v2", "weapons", "conflict-triage.json");
const defaultReportJsonPath = path.join(repositoryRoot, "reports", "genshin-weapon-gcsim-conflict-triage.json");
const defaultReportMarkdownPath = path.join(repositoryRoot, "reports", "genshin-weapon-gcsim-conflict-triage.md");
const GENERATOR_VERSION = "genshinWeaponGcsimConflictTriage/2";
const GENERATED_AT = "2026-08-16T00:00:00.000Z";
const CLASSIFICATIONS = ["resolvedMapping", "genuineConflict", "scopeMismatch", "parserLimitation", "registryLifecycleMapped", "schemaGap", "unmapped"];

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function digestFile(file) {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function stableClone(value) {
    if (Array.isArray(value)) return value.map(stableClone);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableClone(value[key])]));
}

function stableJson(value) {
    return JSON.stringify(stableClone(value));
}

function sortNatural(a, b) {
    return String(a).localeCompare(String(b), "en", { numeric: true });
}

function increment(map, key) {
    const normalized = String(key || "unknown");
    map[normalized] = (map[normalized] || 0) + 1;
}

function relative(file) {
    return path.relative(repositoryRoot, file).replaceAll(path.sep, "/");
}

function candidateMap(candidates) {
    if (Array.isArray(candidates)) return Object.fromEntries(candidates.map((candidate) => [candidate.id, candidate]));
    return candidates || {};
}

function sourceRecordFor(evidence, sourceRecordId) {
    return evidence.records?.[sourceRecordId] || null;
}

function registryGroups(registry, weaponId, candidateId) {
    const groups = registry.weapons?.[String(weaponId)]?.groups || [];
    return groups
        .filter((group) => !candidateId || (group.modifierIds || []).includes(candidateId))
        .map((group) => ({
            id: group.id || null,
            targetOwner: group.targetOwner || null,
            inputPolicy: group.inputPolicy || null,
            activation: group.activation || null,
            modifierIds: Array.isArray(group.modifierIds) ? [...group.modifierIds] : []
        }))
        .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function normalizeActivation(activation, effect = {}) {
    if (!activation || typeof activation !== "object") return null;
    const result = {};
    ["condition", "scope", "maxStacks", "durationSeconds", "intervalSeconds"].forEach((key) => {
        if (activation[key] !== undefined) result[key] = activation[key];
    });
    if (result.durationSeconds === undefined && effect.duration !== undefined) result.durationSeconds = effect.duration;
    if (result.intervalSeconds === undefined && effect.intervalSeconds !== undefined) result.intervalSeconds = effect.intervalSeconds;
    return result;
}

function normalizedStack(stack) {
    if (!stack || typeof stack !== "object") return null;
    const result = {};
    ["min", "max", "default"].forEach((key) => {
        if (stack[key] !== undefined) result[key] = stack[key];
    });
    return result;
}

function compareSemantics(field, sourceField, candidate, valueField) {
    const effect = candidate?.effect || {};
    const sourceUnits = sourceField.units ?? sourceField.unit ?? null;
    const sourceActivation = normalizeActivation(sourceField.activation);
    const candidateActivation = normalizeActivation(effect.activation, effect);
    const targetMatch = sourceField.targets !== null && sourceField.targets !== undefined
        && stableJson(sourceField.targets) === stableJson(effect.targets || null);
    const activationMatch = sourceActivation !== null && candidateActivation !== null
        && stableJson(sourceActivation) === stableJson(candidateActivation);
    const unitMatch = ["duration", "stack", "interval"].includes(field)
        ? null
        : sourceUnits !== null && sourceUnits !== undefined
        && sourceUnits === (effect.unit ?? null);
    const sourceDuration = field === "duration" ? sourceField.structuredValue?.seconds : null;
    const candidateDuration = effect.duration ?? null;
    const durationMatch = field === "duration" && sourceDuration !== null && candidateDuration !== null
        ? sourceDuration === candidateDuration
        : null;
    const sourceStack = field === "stack" ? normalizedStack(sourceField.structuredValue) : null;
    const candidateStack = field === "stack" ? normalizedStack(effect.stack) : null;
    const stackMatch = field === "stack" && sourceStack !== null && candidateStack !== null
        ? stableJson(sourceStack) === stableJson(candidateStack)
        : null;
    const sourceInterval = field === "stack" ? sourceField.structuredValue?.intervalSeconds ?? null : null;
    const candidateInterval = field === "stack" ? effect.intervalSeconds ?? null : null;
    const intervalMatch = field === "stack" && (sourceInterval !== null || candidateInterval !== null)
        ? sourceInterval === candidateInterval
        : null;
    const valueMatch = valueField?.claimComparison?.valueMatch === true
        ? true
        : valueField?.claimComparison?.valueMatch === false
            ? false
            : null;
    return {
        observedValueMatch: sourceField.claimComparison?.valueMatch ?? null,
        semanticValueMatch: valueMatch,
        fieldMatch: sourceField.claimComparison?.fieldCoreMatch ?? sourceField.claimComparison?.valueMatch ?? null,
        fieldCoverage: sourceField.claimComparison?.fieldCoverage ?? null,
        comparisonBasis: sourceField.claimComparison?.comparisonBasis ?? null,
        semanticMismatch: sourceField.claimComparison?.semanticMismatch ?? false,
        semanticMismatchReasons: [...(sourceField.claimComparison?.semanticMismatchReasons || [])],
        unitMatch,
        targetMatch,
        activationMatch,
        durationMatch,
        stackMatch,
        intervalMatch,
        representation: field === "duration"
            ? (durationMatch === true ? "secondsObject-to-number" : null)
            : field === "stack"
                ? (stackMatch === true && intervalMatch !== true ? "stackCore-plus-unmappedInterval" : null)
                : field === "unit"
                    ? "unitProjectionComparedAgainstCandidateValue"
                    : null
    };
}

/*
 * Classification is intentionally explicit.  The evidence extractor owns the
 * observed rows; this small policy owns only review disposition.  Each key is
 * checked against the current 33-row set, so a new conflict cannot silently
 * inherit a guessed classification.
 */
const TRIAGE_POLICY = Object.freeze({
    "gcsim:weapon:11503:w_11503_damage_1:unit": { classification: "resolvedMapping", dimensions: ["unit", "parserProjection"], rationaleCode: "UNIT_MATCH" },
    "gcsim:weapon:11503:w_11503_damage_3:unit": { classification: "scopeMismatch", dimensions: ["unit", "activation"], rationaleCode: "ACTIVATION_BRANCH" },
    "gcsim:weapon:11503:w_11503_stat_2:unit": { classification: "scopeMismatch", dimensions: ["unit", "activation"], rationaleCode: "ACTIVATION_BRANCH" },
    "gcsim:weapon:11509:w_11509_damageBonus_ae1b42da:stack": { classification: "scopeMismatch", dimensions: ["stack", "activation"], rationaleCode: "ACTIVATION_BRANCH" },
    "gcsim:weapon:11509:w_11509_damage_1:unit": { classification: "resolvedMapping", dimensions: ["unit", "parserProjection"], rationaleCode: "UNIT_MATCH" },
    "gcsim:weapon:11509:w_11509_damageBonus_ae1b42da:unit": { classification: "scopeMismatch", dimensions: ["unit", "activation"], rationaleCode: "ACTIVATION_BRANCH" },
    "gcsim:weapon:11509:w_11509_damage_2:unit": { classification: "scopeMismatch", dimensions: ["unit", "target", "activation"], rationaleCode: "TARGET_SCOPE" },
    "gcsim:weapon:11518:w_11518_stat_3:duration": { classification: "scopeMismatch", dimensions: ["duration", "activation", "representation"], rationaleCode: "ACTIVATION_BRANCH" },
    "gcsim:weapon:11518:w_11518_stat_4:duration": { classification: "scopeMismatch", dimensions: ["duration", "activation", "representation"], rationaleCode: "ACTIVATION_BRANCH" },
    "gcsim:weapon:11518:w_11518_stat_3:unit": { classification: "parserLimitation", dimensions: ["unit", "refinementSeries", "activation"], rationaleCode: "CONDITIONAL_REFINEMENT_SERIES" },
    "gcsim:weapon:11518:w_11518_stat_4:unit": { classification: "parserLimitation", dimensions: ["unit", "refinementSeries", "activation"], rationaleCode: "CONDITIONAL_REFINEMENT_SERIES" },
    "gcsim:weapon:12402:w_12402_damage_1:unit": { classification: "scopeMismatch", dimensions: ["unit", "activation"], rationaleCode: "ACTIVATION_BRANCH" },
    "gcsim:weapon:12402:w_12402_extraDamage_4ff89bef:unit": { classification: "resolvedMapping", dimensions: ["unit", "defensiveEffect"], rationaleCode: "UNIT_MATCH" },
    "gcsim:weapon:12430:w_12430_damageBonus_c7243261:duration": { classification: "scopeMismatch", dimensions: ["duration", "activation", "representation"], rationaleCode: "ACTIVATION_BRANCH" },
    "gcsim:weapon:12430:w_12430_crit_1:unit": { classification: "resolvedMapping", dimensions: ["unit", "parserProjection"], rationaleCode: "UNIT_MATCH" },
    "gcsim:weapon:12430:w_12430_critBonus_ef236f15:unit": { classification: "scopeMismatch", dimensions: ["unit", "target"], rationaleCode: "TARGET_SCOPE" },
    "gcsim:weapon:12430:w_12430_damageBonus_c7243261:unit": { classification: "scopeMismatch", dimensions: ["unit", "activation"], rationaleCode: "ACTIVATION_BRANCH" },
    "gcsim:weapon:14402:w_14402_stat_1:unit": { classification: "scopeMismatch", dimensions: ["unit", "activation"], rationaleCode: "ACTIVATION_BRANCH" },
    "gcsim:weapon:14402:w_14402_stat_3:unit": { classification: "scopeMismatch", dimensions: ["unit", "activation"], rationaleCode: "ACTIVATION_BRANCH" },
    "gcsim:weapon:14402:w_14402_damage_2:unit": { classification: "scopeMismatch", dimensions: ["unit", "activation"], rationaleCode: "ACTIVATION_BRANCH" },
    "gcsim:weapon:15402:w_15402_damage_1:unit": { classification: "resolvedMapping", dimensions: ["unit", "parserProjection"], rationaleCode: "UNIT_MATCH" },
    "gcsim:weapon:15502:w_15502_damageBonus_fc388315:stack": { classification: "parserLimitation", dimensions: ["stack", "interval", "parserMapping"], rationaleCode: "STACK_INTERVAL_NOT_CANDIDATE_FIELD" },
    "gcsim:weapon:15502:w_15502_damage_1:unit": { classification: "resolvedMapping", dimensions: ["unit", "parserProjection"], rationaleCode: "UNIT_MATCH" },
    "gcsim:weapon:15502:w_15502_damageBonus_fc388315:unit": { classification: "parserLimitation", dimensions: ["unit", "interval", "parserMapping"], rationaleCode: "STACK_INTERVAL_NOT_CANDIDATE_FIELD" },
    "gcsim:weapon:15516:w_15516_stat_1:unit": { classification: "resolvedMapping", dimensions: ["unit", "parserProjection"], rationaleCode: "UNIT_MATCH" },
    "gcsim:weapon:15516:w_15516_damage_2:unit": { classification: "scopeMismatch", dimensions: ["unit", "activation"], rationaleCode: "ACTIVATION_BRANCH" },
    "gcsim:weapon:15516:w_15516_reaction_bonus_3:unit": { classification: "scopeMismatch", dimensions: ["unit", "activation"], rationaleCode: "ACTIVATION_BRANCH" },
    "gcsim:weapon:15516:w_15516_damage_5:unit": { classification: "scopeMismatch", dimensions: ["unit", "activation", "targetScope"], rationaleCode: "TEAM_NEARBY_SCOPE" },
    "gcsim:weapon:15516:w_15516_reaction_bonus_4:unit": { classification: "scopeMismatch", dimensions: ["unit", "activation", "targetScope"], rationaleCode: "TEAM_NEARBY_SCOPE" },
    "gcsim:weapon:15516:w_15516_damageBonus_1923e8e9:unit": { classification: "scopeMismatch", dimensions: ["unit", "target", "targetScope"], rationaleCode: "TEAM_NEARBY_SCOPE" },
    "gcsim:weapon:15516:w_15516_damageBonus_f827969c:unit": { classification: "scopeMismatch", dimensions: ["unit", "target"], rationaleCode: "ELEMENT_SCOPE" },
    "gcsim:weapon:15516:w_15516_reactionBonus_232c59cc:unit": { classification: "scopeMismatch", dimensions: ["unit", "target", "targetScope"], rationaleCode: "TEAM_NEARBY_SCOPE" },
    "gcsim:weapon:15516:w_15516_reactionBonus_999a052c:unit": { classification: "scopeMismatch", dimensions: ["unit", "target"], rationaleCode: "ELEMENT_SCOPE" }
});

const UNMAPPED_POLICY = Object.freeze({
    "gcsim:weapon:12402:shieldDuration": { classification: "registryLifecycleMapped", dimensions: ["duration", "registryMapping"], rationaleCode: "SHARED_LIFECYCLE_MAPPED" },
    "gcsim:weapon:12402:cooldown": { classification: "registryLifecycleMapped", dimensions: ["cooldown", "registryMapping"], rationaleCode: "SHARED_LIFECYCLE_MAPPED" },
    "gcsim:weapon:14402:duration": { classification: "registryLifecycleMapped", dimensions: ["duration", "registryMapping"], rationaleCode: "SHARED_LIFECYCLE_MAPPED" },
    "gcsim:weapon:14402:cooldown": { classification: "registryLifecycleMapped", dimensions: ["cooldown", "registryMapping"], rationaleCode: "SHARED_LIFECYCLE_MAPPED" }
});

function candidateSnapshot(candidate) {
    if (!candidate) return null;
    const effect = candidate.effect || {};
    return {
        id: candidate.id || null,
        entity: candidate.entity || null,
        sourceRefs: Array.isArray(candidate.sourceRefs) ? [...candidate.sourceRefs] : [],
        effect: {
            kind: effect.kind ?? null,
            value: effect.value ?? null,
            valueByRefinement: effect.valueByRefinement ?? null,
            unit: effect.unit ?? null,
            targets: effect.targets ?? null,
            activation: effect.activation ?? null,
            duration: effect.duration ?? null,
            stack: effect.stack ?? null,
            intervalSeconds: effect.intervalSeconds ?? null
        },
        verification: {
            status: candidate.verification?.status ?? null,
            sourceAgreement: candidate.verification?.sourceAgreement ?? null
        },
        runtime: {
            status: candidate.runtime?.status ?? null,
            blockedReasons: Array.isArray(candidate.runtime?.blockedReasons) ? [...candidate.runtime.blockedReasons] : []
        },
        canonicalEligibility: false
    };
}

function sourceSnapshot(record, field) {
    return {
        sourceRecordId: record?.sourceRecordId || null,
        provider: record?.provider || null,
        revision: record?.revision || null,
        path: record?.path || null,
        sha256: record?.sha256 || null,
        locator: field?.locator || null,
        sourceField: field?.sourceField || null,
        status: field?.status || null,
        structuredValue: field?.structuredValue ?? null,
        value: field?.value ?? null,
        units: field?.units ?? field?.unit ?? null,
        targets: field?.targets ?? null,
        activation: field?.activation ?? null,
        extractionMethod: field?.extractionMethod || null,
        mapping: field?.mapping || null,
        claimComparison: field?.claimComparison || null,
        gameVersion: record?.gameVersion ?? null,
        gameVersionVerified: field?.gameVersionVerified ?? false,
        canonicalEligibility: false
    };
}

function buildConflictItem({ sourceRecordId, record, field, candidate, valueField, registry }) {
    const key = `${sourceRecordId}:${field.candidateId}:${field.field}`;
    const policy = TRIAGE_POLICY[key];
    if (!policy) throw new Error(`missing explicit triage policy for conflict ${key}`);
    return {
        key,
        sourceRecordId,
        weaponId: String(record.entity?.id || candidate?.entity?.id || ""),
        candidateId: field.candidateId,
        field: field.field,
        status: field.status,
        supportsClaimValue: field.supportsClaimValue === true,
        observed: {
            valueMatch: field.claimComparison?.valueMatch ?? null,
            unitMatch: field.claimComparison?.unitMatch ?? null,
            targetMatch: field.claimComparison?.targetMatch ?? null,
            activationMatch: field.claimComparison?.activationMatch ?? null
        },
        source: sourceSnapshot(record, field),
        candidate: candidateSnapshot(candidate),
        legacyRegistry: registryGroups(registry, record.entity?.id, field.candidateId),
        comparison: compareSemantics(field.field, field, candidate, valueField),
        classification: policy.classification,
        mapping: field.mapping || null,
        dimensions: [...policy.dimensions],
        rationaleCode: policy.rationaleCode,
        rationale: rationaleFor(policy.rationaleCode),
        canonicalEligibility: false,
        promotionDecision: "blocked"
    };
}

function rationaleFor(code) {
    const values = {
        UNIT_MATCH: "The source unit equals candidate.effect.unit; the observed conflict is a projected unit field compared with candidate.value.",
        ACTIVATION_BRANCH: "Source and candidate numeric/field data are retained, but the source event/condition branch differs from the legacy candidate activation.",
        TARGET_SCOPE: "The source target set is narrower or otherwise different from the candidate target set; numeric agreement does not establish scope agreement.",
        CONDITIONAL_REFINEMENT_SERIES: "The pinned implementation exposes an additional conditional refinement series that the candidate schema does not represent.",
        SHIELD_CAPACITY_NOT_DAMAGE: "The legacy parser maps a shield-capacity assignment to a triggered-damage candidate; no semantic promotion is allowed.",
        STACK_INTERVAL_NOT_CANDIDATE_FIELD: "The source stack has an interval/flight-time detail that is absent from the candidate stack schema.",
        SHARED_LIFECYCLE_MAPPED: "The source lifecycle value is mapped once to the shared registry group instead of being duplicated across modifier candidates.",
        TEAM_NEARBY_SCOPE: "The source assignment is team/nearby/moondrift scoped while the legacy candidate is broader or condition-only.",
        ELEMENT_SCOPE: "The source assignment is element/reaction-specific while the legacy candidate uses a broader target.",
        NO_CANDIDATE_FIELD: "The source field has no corresponding v2 candidate field; it remains unmapped evidence."
    };
    return values[code] || "Disposition is retained as review evidence; no value is inferred or promoted.";
}

function buildUnmappedItem({ sourceRecordId, record, field, registry }) {
    const key = `${sourceRecordId}:${field.field}`;
    const policy = UNMAPPED_POLICY[key];
    if (!policy) throw new Error(`missing explicit triage policy for unmapped field ${key}`);
    return {
        key,
        sourceRecordId,
        weaponId: String(record.entity?.id || ""),
        candidateId: null,
        field: field.field,
        mapping: field.mapping || null,
        status: "unmapped",
        supportsClaimValue: false,
        observed: { valueMatch: null, unitMatch: null, targetMatch: null, activationMatch: null },
        source: sourceSnapshot(record, field),
        candidate: null,
        legacyRegistry: registryGroups(registry, record.entity?.id, null),
        comparison: { semanticValueMatch: null, unitMatch: null, targetMatch: null, activationMatch: null, durationMatch: null, stackMatch: null, intervalMatch: null, representation: null },
        classification: policy.classification,
        dimensions: [...policy.dimensions],
        rationaleCode: policy.rationaleCode,
        rationale: rationaleFor(policy.rationaleCode),
        canonicalEligibility: false,
        promotionDecision: "blocked"
    };
}

function isSemanticConflict(field) {
    if (field?.supportsClaimValue !== true) return false;
    const comparison = field.claimComparison || {};
    // A value record already carries the source branch in its own activation
    // payload.  Keep the triage rows focused on projection/schema fields and
    // direct value disagreements; activation/target differences are emitted
    // as their dedicated needsReview fields instead of duplicating every
    // value row.
    if (["value", "refinement"].includes(field.field)) return comparison.valueMatch === false;
    if (!["unit", "duration", "stack", "interval", "targets", "activation"].includes(field.field)) return false;
    return comparison.fieldCoreMatch === false || comparison.fieldCoverage === "partial";
}

function buildTriage({ evidencePath = defaultEvidencePath, candidatePath = defaultCandidatePath, sourceCatalogPath = defaultSourceCatalogPath, legacyRegistryPath = defaultLegacyRegistryPath } = {}) {
    const evidence = readJson(evidencePath);
    const candidates = candidateMap(readJson(candidatePath));
    const sourceCatalog = readJson(sourceCatalogPath);
    const registry = readJson(legacyRegistryPath);
    const conflicts = [];
    const reconciled = [];
    const unmapped = [];
    const allFields = Object.values(evidence.records || {}).flatMap((record) => record.fields || []);
    Object.entries(evidence.records || {}).forEach(([sourceRecordId, record]) => {
        const fields = Array.isArray(record.fields) ? record.fields : [];
        fields.filter(isSemanticConflict).forEach((field) => {
            const candidate = candidates[field.candidateId];
            const valueField = fields.find((item) => item.candidateId === field.candidateId && item.field === "value");
            conflicts.push(buildConflictItem({ sourceRecordId, record, field, candidate, valueField, registry }));
        });
        fields.filter((field) => {
            const key = `${sourceRecordId}:${field.candidateId}:${field.field}`;
            return TRIAGE_POLICY[key] && !isSemanticConflict(field);
        }).forEach((field) => {
            const candidate = candidates[field.candidateId];
            const valueField = fields.find((item) => item.candidateId === field.candidateId && item.field === "value");
            const item = buildConflictItem({ sourceRecordId, record, field, candidate, valueField, registry });
            item.previousClassification = item.classification;
            item.classification = "resolvedMapping";
            item.resolutionCode = "FIELD_AXIS_RECONCILED";
            item.resolution = "The projected field itself agrees. Activation/target differences remain in their dedicated evidence rows and are not duplicated as a unit/duration/stack conflict.";
            reconciled.push(item);
        });
        (record.unmappedSourceFields || []).forEach((field) => unmapped.push(buildUnmappedItem({ sourceRecordId, record, field, registry })));
    });
    conflicts.sort((left, right) => left.key.localeCompare(right.key, "en", { numeric: true }));
    reconciled.sort((left, right) => left.key.localeCompare(right.key, "en", { numeric: true }));
    unmapped.sort((left, right) => left.key.localeCompare(right.key, "en", { numeric: true }));
    const byClassification = {};
    const byDimension = {};
    conflicts.forEach((item) => {
        increment(byClassification, item.classification);
        item.dimensions.forEach((dimension) => increment(byDimension, dimension));
    });
    reconciled.forEach((item) => {
        increment(byClassification, item.classification);
        item.dimensions.forEach((dimension) => increment(byDimension, dimension));
    });
    unmapped.forEach((item) => increment(byClassification, item.classification));
    unmapped.forEach((item) => item.dimensions.forEach((dimension) => increment(byDimension, dimension)));
    return {
        schemaVersion: 1,
        triage: "genshin-weapon-gcsim-conflict-triage",
        generator: GENERATOR_VERSION,
        generatedAt: GENERATED_AT,
        policy: {
            classifications: [...CLASSIFICATIONS],
            canonicalEligibility: false,
            runtimePromotion: "forbidden",
            valuePolicy: "Source values are copied from pinned evidence only; no value is inferred, corrected, or promoted.",
            conflictDefinition: "Remaining conflict rows are exactly evidence fields with supportsClaimValue=true and a direct field-value mismatch, semantic mismatch, or partial field coverage. Direct candidate-value conflicts are reported separately from semantic scope/parser discrepancies.",
            ancillaryDefinition: "Ancillary source rows are mapped once to shared registry lifecycle metadata; no schema-gap row remains in the nine-weapon pilot."
        },
        inputs: {
            externalEvidence: { path: relative(evidencePath), sha256: digestFile(evidencePath), summary: evidence.summary || null },
            candidateSpecs: { path: relative(candidatePath), sha256: digestFile(candidatePath) },
            sourceCatalog: { path: relative(sourceCatalogPath), sha256: digestFile(sourceCatalogPath), provider: sourceCatalog.sources?.gcsim || null },
            legacyRegistry: { path: relative(legacyRegistryPath), sha256: digestFile(legacyRegistryPath) }
        },
        summary: {
            sourceRecords: Object.keys(evidence.records || {}).length,
            candidateValueConflicts: allFields.filter((field) => field.supportsClaimValue === true && field.claimComparison?.valueMatch === false).length,
            semanticConflicts: conflicts.length,
            mechanicallyResolvedRows: reconciled.length + 2,
            fieldAxisReconciledRows: reconciled.length,
            correctedWrongCandidateMappings: 2,
            ancillarySourceFields: unmapped.length,
            registryMappedSourceFields: unmapped.filter((item) => item.classification === "registryLifecycleMapped").length,
            schemaGapSourceFields: unmapped.filter((item) => item.classification === "schemaGap").length,
            unmappedSourceFields: unmapped.filter((item) => item.classification === "unmapped").length,
            conflictItems: conflicts.length,
            unmappedItems: unmapped.length,
            byClassification: Object.fromEntries(CLASSIFICATIONS.map((classification) => [classification, byClassification[classification] || 0])),
            byDimension: Object.fromEntries(Object.entries(byDimension).sort(([a], [b]) => a.localeCompare(b))),
            genuineValueConflicts: conflicts.filter((item) => item.classification === "genuineConflict").length,
            canonicalEligibleItems: 0,
            candidatesPromoted: 0
        },
        conflicts,
        reconciled,
        mappingCorrections: [{
            key: "gcsim:weapon:11518:w_11518_crit_1:value",
            resolutionCode: "GCSIM_CD_ATTRIBUTE_IDENTIFIED_AS_CRITICAL_DAMAGE",
            sourceField: "burstCD",
            formerInterpretation: "burstCooldownReduction",
            retainedAs: "effect.value for burstCritDamage",
            canonicalEligibility: false
        }, {
            key: "gcsim:weapon:12402:w_12402_extraDamage_4ff89bef:value",
            resolutionCode: "SHIELD_CAPACITY_CANDIDATE_RECLASSIFIED",
            sourceField: "hp",
            formerCategory: "extraDamage",
            retainedAs: "shieldGeneration/shieldCapacity display-only effect",
            canonicalEligibility: false
        }],
        unmapped
    };
}

function auditTriage({ triage, evidence, candidates, sourceCatalog, registry } = {}) {
    const errors = [];
    const expectedCandidates = candidateMap(candidates || {});
    const expectedConflicts = [];
    const expectedReconciled = [];
    const expectedCandidateValueConflicts = [];
    const expectedUnmapped = [];
    Object.entries(evidence?.records || {}).forEach(([sourceRecordId, record]) => {
        (record.fields || []).filter(isSemanticConflict).forEach((field) => expectedConflicts.push(`${sourceRecordId}:${field.candidateId}:${field.field}`));
        (record.fields || []).filter((field) => TRIAGE_POLICY[`${sourceRecordId}:${field.candidateId}:${field.field}`] && !isSemanticConflict(field)).forEach((field) => expectedReconciled.push(`${sourceRecordId}:${field.candidateId}:${field.field}`));
        (record.fields || []).filter((field) => field.supportsClaimValue === true && field.claimComparison?.valueMatch === false).forEach((field) => expectedCandidateValueConflicts.push(`${sourceRecordId}:${field.candidateId}:${field.field}`));
        (record.unmappedSourceFields || []).forEach((field) => expectedUnmapped.push(`${sourceRecordId}:${field.field}`));
    });
    const actualConflicts = (triage?.conflicts || []).map((item) => item.key);
    const actualReconciled = (triage?.reconciled || []).map((item) => item.key);
    const actualUnmapped = (triage?.unmapped || []).map((item) => item.key);
    const sorted = (items) => [...items].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
    if (stableJson(actualConflicts) !== stableJson(sorted(expectedConflicts))) errors.push("conflict key set does not match evidence semantic discrepancy set");
    if (stableJson(actualReconciled) !== stableJson(sorted(expectedReconciled))) errors.push("reconciled key set does not match field-axis resolution set");
    if (stableJson(actualUnmapped) !== stableJson(sorted(expectedUnmapped))) errors.push("unmapped key set does not match external-evidence unmappedSourceFields");
    const seen = new Set();
    [...(triage?.conflicts || []), ...(triage?.reconciled || []), ...(triage?.unmapped || [])].forEach((item) => {
        if (seen.has(item.key)) errors.push(`duplicate triage key ${item.key}`);
        seen.add(item.key);
        if (!CLASSIFICATIONS.includes(item.classification)) errors.push(`${item.key}: invalid classification`);
        if (item.canonicalEligibility !== false) errors.push(`${item.key}: canonicalEligibility must be false`);
        if (item.promotionDecision !== "blocked") errors.push(`${item.key}: promotionDecision must be blocked`);
        if (["unmapped", "schemaGap", "registryLifecycleMapped"].includes(item.classification) && item.candidateId !== null) errors.push(`${item.key}: ancillary item unexpectedly has candidateId`);
        if (!["unmapped", "schemaGap", "registryLifecycleMapped"].includes(item.classification) && !expectedCandidates[item.candidateId]) errors.push(`${item.key}: candidate is missing from spec-candidates`);
        if (item.source?.provider !== sourceCatalog?.sources?.gcsim?.provider) errors.push(`${item.key}: source provider mismatch`);
        const catalogRecord = sourceCatalog?.records?.[item.sourceRecordId];
        if (!catalogRecord || item.source.path !== catalogRecord.path || item.source.sha256 !== catalogRecord.sha256) errors.push(`${item.key}: source catalog locator/digest mismatch`);
        if (item.classification === "registryLifecycleMapped") {
            const mapping = item.mapping || item.source?.mapping;
            const group = (item.legacyRegistry || []).find((entry) => entry.id === mapping?.registryGroupId);
            const lifecycleField = String(mapping?.registryField || "").split(".").at(-1);
            if (!group || !lifecycleField || group.activation?.[lifecycleField] !== item.source?.structuredValue?.seconds) {
                errors.push(`${item.key}: registry lifecycle mapping mismatch`);
            }
        }
        if (item.classification === "schemaGap" && item.mapping?.status !== "schemaGap") errors.push(`${item.key}: schema gap mapping missing`);
    });
    if (triage?.schemaVersion !== 1 || triage?.triage !== "genshin-weapon-gcsim-conflict-triage") errors.push("invalid triage schema");
    if (triage?.generator !== GENERATOR_VERSION) errors.push("generator version mismatch");
    if (triage?.summary?.candidateValueConflicts !== expectedCandidateValueConflicts.length) errors.push("summary candidateValueConflicts mismatch");
    if (triage?.summary?.semanticConflicts !== expectedConflicts.length) errors.push("summary semanticConflicts mismatch");
    if (triage?.summary?.ancillarySourceFields !== expectedUnmapped.length) errors.push("summary ancillarySourceFields mismatch");
    if (triage?.summary?.schemaGapSourceFields !== (triage?.unmapped || []).filter((item) => item.classification === "schemaGap").length) errors.push("summary schemaGapSourceFields mismatch");
    if (triage?.summary?.registryMappedSourceFields !== (triage?.unmapped || []).filter((item) => item.classification === "registryLifecycleMapped").length) errors.push("summary registryMappedSourceFields mismatch");
    if ((triage?.summary?.canonicalEligibleItems || 0) !== 0 || (triage?.summary?.candidatesPromoted || 0) !== 0) errors.push("canonical promotion policy violation");
    const summary = {
        status: errors.length ? "failed" : "passed",
        candidateValueConflicts: expectedCandidateValueConflicts.length,
        semanticConflicts: expectedConflicts.length,
        ancillarySourceFields: expectedUnmapped.length,
        unmappedSourceFields: triage?.summary?.unmappedSourceFields || 0,
        schemaGapSourceFields: triage?.summary?.schemaGapSourceFields || 0,
        registryMappedSourceFields: triage?.summary?.registryMappedSourceFields || 0,
        conflictItems: triage?.conflicts?.length || 0,
        unmappedItems: triage?.unmapped?.length || 0,
        byClassification: triage?.summary?.byClassification || {},
        genuineValueConflicts: triage?.summary?.genuineValueConflicts || 0,
        canonicalEligibleItems: triage?.summary?.canonicalEligibleItems || 0,
        candidatesPromoted: triage?.summary?.candidatesPromoted || 0,
        errors: errors.length
    };
    return { schemaVersion: 1, audit: "genshin-weapon-gcsim-conflict-triage-audit", status: summary.status, generatedAt: GENERATED_AT, summary, errors };
}

function renderMarkdown(triage, audit) {
    const s = triage.summary || {};
    const lines = [
        "# Genshin weapon gcsim conflict triage",
        "",
        "This report audits the existing gcsim evidence counters without changing candidate values or canonical status.",
        "",
        `- Audit status: **${audit?.status || "unknown"}**`,
        `- Direct candidate-value conflicts: **${s.candidateValueConflicts}**`,
        `- Remaining semantic discrepancy rows: **${s.semanticConflicts ?? s.conflictItems ?? 0}**`,
        `- Mechanically resolved projection rows: **${s.mechanicallyResolvedRows ?? 0}**`,
        `- Ancillary source rows: **${s.ancillarySourceFields}** (registry-mapped **${s.registryMappedSourceFields}**, schema gaps **${s.schemaGapSourceFields}**, unmapped **${s.unmappedSourceFields}**)`,
        `- Classification: **${JSON.stringify(s.byClassification || {})}**`,
        `- Genuine numeric/value conflicts: **${s.genuineValueConflicts}**`,
        `- Canonical-eligible/promoted: **${s.canonicalEligibleItems}/${s.candidatesPromoted}**`,
        "",
        "## Classification policy",
        "",
        "`resolvedMapping` means the field-specific source value agrees after projection; `scopeMismatch` means activation/target scope differs; `parserLimitation` means the legacy candidate shape cannot represent an observed branch or source mapping; `genuineConflict` is reserved for a direct semantic value disagreement; `unmapped` has no candidate field.",
        "",
        "| Classification | Count |",
        "| --- | ---: |",
        ...CLASSIFICATIONS.map((classification) => `| ${classification} | ${(s.byClassification || {})[classification] || 0} |`),
        "",
        "## Conflict rows",
        "",
        "| Key | Field | Classification | Dimensions | Rationale |",
        "| --- | --- | --- | --- | --- |",
        ...(triage.conflicts || []).map((item) => `| ${item.key} | ${item.field} | ${item.classification} | ${item.dimensions.join(", ")} | ${item.rationaleCode} |`),
        "",
        "## Reconciled field projections",
        "",
        ...(triage.reconciled || []).map((item) => `- ${item.key}: ${item.previousClassification} -> resolvedMapping (${item.resolutionCode})`),
        "",
        "## Unmapped rows",
        "",
        "| Key | Field | Dimensions | Rationale |",
        "| --- | --- | --- | --- |",
        ...(triage.unmapped || []).map((item) => `| ${item.key} | ${item.field} | ${item.dimensions.join(", ")} | ${item.rationaleCode} |`),
        "",
        "## Errors",
        "",
        ...(audit?.errors?.length ? audit.errors.map((error) => `- ${error}`) : ["- none"]),
        ""
    ];
    return lines.join("\n");
}

function writeArtifacts(triage, audit, { outputPath = defaultOutputPath, reportJsonPath = defaultReportJsonPath, reportMarkdownPath = defaultReportMarkdownPath } = {}) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.mkdirSync(path.dirname(reportJsonPath), { recursive: true });
    fs.mkdirSync(path.dirname(reportMarkdownPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(triage, null, 2)}\n`, "utf8");
    fs.writeFileSync(reportJsonPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
    fs.writeFileSync(reportMarkdownPath, renderMarkdown(triage, audit), "utf8");
}

function parseArgs(argv) {
    const args = { evidencePath: defaultEvidencePath, candidatePath: defaultCandidatePath, sourceCatalogPath: defaultSourceCatalogPath, legacyRegistryPath: defaultLegacyRegistryPath, outputPath: defaultOutputPath, reportJsonPath: defaultReportJsonPath, reportMarkdownPath: defaultReportMarkdownPath };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--evidence") args.evidencePath = path.resolve(argv[++i]);
        else if (arg === "--candidates") args.candidatePath = path.resolve(argv[++i]);
        else if (arg === "--source-catalog") args.sourceCatalogPath = path.resolve(argv[++i]);
        else if (arg === "--legacy-registry") args.legacyRegistryPath = path.resolve(argv[++i]);
        else if (arg === "--output") args.outputPath = path.resolve(argv[++i]);
        else if (arg === "--report-json") args.reportJsonPath = path.resolve(argv[++i]);
        else if (arg === "--report-md") args.reportMarkdownPath = path.resolve(argv[++i]);
        else if (arg === "--help") args.help = true;
        else throw new Error(`unknown argument: ${arg}`);
    }
    return args;
}

if (require.main === module) {
    try {
        const args = parseArgs(process.argv.slice(2));
        if (args.help) {
            console.log("Usage: node scripts/genshinWeaponGcsimConflictTriage.cjs [--output <path>] [--report-json <path>] [--report-md <path>]");
            process.exit(0);
        }
        const triage = buildTriage(args);
        const evidence = readJson(args.evidencePath);
        const candidates = readJson(args.candidatePath);
        const sourceCatalog = readJson(args.sourceCatalogPath);
        const registry = readJson(args.legacyRegistryPath);
        const audit = auditTriage({ triage, evidence, candidates, sourceCatalog, registry });
        writeArtifacts(triage, audit, args);
        process.stdout.write(`${JSON.stringify(audit.summary, null, 2)}\n`);
        if (audit.status !== "passed") process.exitCode = 1;
    } catch (error) {
        console.error(error.stack || error.message);
        process.exitCode = 1;
    }
}

module.exports = {
    CLASSIFICATIONS,
    GENERATED_AT,
    GENERATOR_VERSION,
    TRIAGE_POLICY,
    UNMAPPED_POLICY,
    auditTriage,
    buildTriage,
    candidateMap,
    renderMarkdown,
    stableJson,
    isSemanticConflict,
    writeArtifacts
};
