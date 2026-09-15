"use strict";

/**
 * Generate review-gated EffectSpec candidates for the 25 characters that do
 * not yet have a legacy talent-modifiers entry.
 *
 * This is an evidence transform, not a prose parser.  Every passive gets one
 * SourceRecord containing the exact raw text and one EffectSpec candidate
 * whose effect fields are explicitly unknown.  No number, target, condition,
 * duration, element, or runtime modifier is inferred from the description.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
    CLASSIFICATION_POLICY,
    CLASSIFICATION_STATUSES,
    classifyMissingTalentModifiers,
    collectRawTalentFields
} = require("./genshinCharacterV2CoverageGenerate.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultDataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultOutputFile = path.join(defaultDataRoot, "v2", "characters", "talent-gap-candidates.json");
const CAPTURED_AT = "2026-08-15T00:00:00.000Z";
const GENERATOR_VERSION = "genshinCharacterV2TalentGapCandidatesGenerate/1";

const INPUT_FILES = [
    "characters.json",
    "character-talents.json",
    "calc/talent-modifiers.json",
    "calc/talent-effect-registry.json",
    "calc/talent-modifiers-needs-review.json"
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
    return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function fileDigest(file) {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function pointerEscape(value) {
    return String(value).replace(/~/g, "~0").replace(/\//g, "~1");
}

function jsonPath(id, ...parts) {
    return `/${pointerEscape(id)}${parts.length ? `/${parts.map(pointerEscape).join("/")}` : ""}`;
}

function safeToken(value) {
    return String(value || "unknown").replace(/[^A-Za-z0-9_-]+/g, "_");
}

function inputManifest(dataRoot) {
    return INPUT_FILES.map((relativePath) => ({
        path: `games/genshin/data/${relativePath.replace(/\\/g, "/")}`,
        integrity: { algorithm: "sha256", digest: fileDigest(path.join(dataRoot, relativePath)) }
    }));
}

function registryKeys(registry, characterId) {
    return Object.keys(registry?.records || {})
        .filter((key) => key === String(characterId) || key.startsWith(`${characterId}.`))
        .sort();
}

function needsReviewRecords(needsReview, characterId) {
    return (Array.isArray(needsReview) ? needsReview : [])
        .map((record, index) => ({ record, index }))
        .filter(({ record }) => String(record?.characterId || "") === String(characterId))
        .map(({ record, index }) => ({
            index,
            sourceId: record.sourceId || null,
            category: record.category || null,
            reasons: Array.isArray(record.reasons) ? [...record.reasons] : []
        }));
}

function classifyTalentGapCharacter({ characterId, talents, registry, needsReview, sourceRecordIds, sourceRecords }) {
    const fields = collectRawTalentFields(talents, characterId)
        .filter((field) => String(field.field || "").startsWith("passives."));
    const sourcePointers = fields.length
        ? fields.map((field, index) => ({
            sourceId: sourceRecordIds[index] || null,
            dataset: "character-talents.json",
            record: String(characterId),
            field: field.field || null,
            path: field.path || null,
            present: Boolean(field.present)
        }))
        : [{
            sourceId: null,
            dataset: "character-talents.json",
            record: String(characterId),
            field: "passives",
            path: `/${String(characterId)}/passives`,
            present: false
        }];
    const classification = classifyMissingTalentModifiers({
        id: characterId,
        talentFields: fields,
        registry,
        needsReview,
        sourcePointers
    });
    classification.sourcePointers = classification.sourcePointers.map((pointer, index) => ({
        ...pointer,
        sourceId: pointer.sourceId || sourceRecordIds[index] || null,
        record: String(characterId),
        dataset: "character-talents.json",
        path: pointer.path || sourceRecords?.[sourceRecordIds[index]]?.locator?.field || null
    }));
    classification.evidence.passiveCount = fields.length;
    classification.evidence.nonEmptyPassiveCount = fields.filter((field) => field.present).length;
    classification.evidence.sourceRecordIds = sourceRecordIds;
    return classification;
}

function sourceRecordId(characterId, passiveSourceId) {
    return `talent-gap-source:${String(characterId)}:${safeToken(passiveSourceId)}`;
}

function specId(characterId, passiveSourceId) {
    return `talent-gap-spec:${String(characterId)}:${safeToken(passiveSourceId)}`;
}

function buildSourceRecord({ characterId, character, passive, passiveIndex }) {
    const passiveSourceId = passive?.sourceId || `passive_${passiveIndex + 1}`;
    const text = String(passive?.descriptionJa || "");
    const id = sourceRecordId(characterId, passiveSourceId);
    return {
        id,
        kind: "primaryDataset",
        provider: "damageTool-local",
        independenceGroup: "damageTool-local-derived",
        providerIndependence: "correlated",
        locator: {
            dataset: "character-talents.json",
            record: String(characterId),
            field: `passives.${passiveIndex}.descriptionJa`
        },
        capturedAt: CAPTURED_AT,
        gameVersion: null,
        locale: "ja-JP",
        text,
        integrity: { algorithm: "sha256", digest: digest(text) },
        structuredValue: {
            characterId: String(characterId),
            characterName: character?.nameJa || null,
            passiveIndex,
            passiveSourceId,
            passiveName: passive?.nameJa || null
        },
        notes: "Raw passive text copied verbatim. No numeric, target, condition, or timing interpretation was performed."
    };
}

function unknownEffect() {
    return {
        kind: "unknown",
        targets: ["unknown"],
        activation: {
            status: "unknown",
            source: "rawPassiveTextOnly",
            trigger: "unknown",
            condition: "unknown"
        },
        value: { status: "unknown" },
        durationSeconds: null,
        intervalSeconds: null,
        cooldownSeconds: null,
        hitCount: null,
        charges: null,
        maxInstances: null,
        stack: null,
        elementApplication: null,
        energy: null,
        snapshot: "unknown",
        offField: "unknown",
        area: "unknown",
        unknownFields: [
            "kind", "targets", "activation", "value", "durationSeconds",
            "intervalSeconds", "cooldownSeconds", "hitCount", "charges",
            "maxInstances", "stack", "elementApplication", "energy",
            "snapshot", "offField", "area"
        ]
    };
}

function claim(sourceRef, notes) {
    return { status: "needsReview", sourceRefs: [sourceRef], notes };
}

function buildSpec({ characterId, character, passive, passiveIndex, sourceRef }) {
    const passiveSourceId = passive?.sourceId || `passive_${passiveIndex + 1}`;
    const id = specId(characterId, passiveSourceId);
    return {
        id,
        entity: {
            kind: "talent",
            id: String(characterId),
            component: `passive:${passiveSourceId}`
        },
        sourceRefs: [sourceRef],
        interpretation: {
            method: "deterministicParser",
            author: "genshinCharacterV2TalentGapCandidatesGenerate.cjs",
            version: GENERATOR_VERSION,
            notes: "Source text is retained as evidence only; no prose fields were parsed or promoted."
        },
        effect: unknownEffect(),
        verification: {
            status: "needsReview",
            reviewedBy: null,
            reviewedAt: null,
            sourceAgreement: "unknown",
            unverifiedBoundaries: [
                "Independent provider/version agreement and game version are unavailable.",
                "Effect kind, target, trigger, value, timing, element, and stacking remain unknown.",
                "Canonical runtime promotion is forbidden until independent review completes."
            ],
            claims: {
                sourceText: claim(sourceRef, "Raw passive text is the sole local source and requires independent review."),
                effectKind: claim(sourceRef, "Effect kind remains unknown until a reviewer structures the passive."),
                targets: claim(sourceRef, "Targets are unknown; the generator never inferred them from prose."),
                activation: claim(sourceRef, "Activation and condition are unknown; the generator never inferred them from prose."),
                value: claim(sourceRef, "All values remain unknown; no numeric token was copied into the EffectSpec."),
                timing: claim(sourceRef, "Duration, interval, cooldown, hit count, and charges remain unknown."),
                runtimeEligibility: claim(sourceRef, "Runtime eligibility is blocked until independent review and a versioned source exist.")
            },
            discrepancies: [
                {
                    code: "RAW_PROSE_UNSTRUCTURED",
                    sourceRefs: [sourceRef],
                    fields: ["effect.kind", "effect.targets", "effect.activation", "effect.value"]
                },
                {
                    code: "INDEPENDENT_SOURCE_REQUIRED",
                    sourceRefs: [sourceRef]
                },
                {
                    code: "CANONICAL_RUNTIME_FORBIDDEN",
                    sourceRefs: [sourceRef]
                }
            ]
        },
        runtime: {
            status: "blocked",
            modifierIds: [],
            generator: null,
            blockedReasons: [
                "verificationStatusNeedsReview",
                "rawPassiveUnstructured",
                "independentSourceRequired",
                "canonicalPromotionForbidden"
            ]
        }
    };
}

function buildDataset({ dataRoot = defaultDataRoot } = {}) {
    const characters = readJson(path.join(dataRoot, "characters.json"));
    const talents = readJson(path.join(dataRoot, "character-talents.json"));
    const talentModifiers = readJson(path.join(dataRoot, "calc", "talent-modifiers.json"));
    const registry = readJson(path.join(dataRoot, "calc", "talent-effect-registry.json"));
    const needsReview = readJson(path.join(dataRoot, "calc", "talent-modifiers-needs-review.json"));
    const characterIds = Object.keys(characters).filter((id) => !Object.prototype.hasOwnProperty.call(talentModifiers, id)).sort();
    const sourceRecords = {};
    const specs = {};
    const byCharacter = {};
    characterIds.forEach((characterId) => {
        const character = characters[characterId] || {};
        const talent = talents[characterId] || {};
        const passives = Array.isArray(talent.passives) ? talent.passives : [];
        const sourceRecordIds = [];
        const specIds = [];
        passives.forEach((passive, passiveIndex) => {
            const source = buildSourceRecord({ characterId, character, passive, passiveIndex });
            const sourceRef = source.id;
            const spec = buildSpec({ characterId, character, passive, passiveIndex, sourceRef });
            if (sourceRecords[source.id] && stableJson(sourceRecords[source.id]) !== stableJson(source)) {
                throw new Error(`source id collision: ${source.id}`);
            }
            if (specs[spec.id] && stableJson(specs[spec.id]) !== stableJson(spec)) {
                throw new Error(`spec id collision: ${spec.id}`);
            }
            sourceRecords[source.id] = source;
            specs[spec.id] = spec;
            sourceRecordIds.push(source.id);
            specIds.push(spec.id);
        });
        const classification = classifyTalentGapCharacter({
            characterId,
            talents,
            registry,
            needsReview,
            sourceRecordIds,
            sourceRecords
        });
        byCharacter[characterId] = {
            characterId,
            characterName: character.nameJa || null,
            status: classification.status,
            canonical: 0,
            reasons: [
                ...classification.reasons,
                "EFFECT_SPECS_NEEDS_REVIEW",
                "RUNTIME_BLOCKED"
            ],
            classification,
            unverifiedBoundaries: classification.unverifiedBoundaries,
            sourceRecordIds,
            specIds,
            sourcePointers: sourceRecordIds.map((sourceId) => ({ sourceId, path: sourceRecords[sourceId].locator.field })),
            evidence: {
                ...classification.evidence,
                sourcePointers: classification.sourcePointers,
                effectRegistryKeys: classification.evidence.effectRegistryKeys,
                needsReviewRecords: classification.evidence.needsReviewRecords,
                passiveCount: passives.length,
                nonEmptyPassiveCount: passives.filter((passive) => String(passive?.descriptionJa || "").trim()).length
            }
        };
    });
    const generatedFrom = inputManifest(dataRoot);
    const byVerificationStatus = {};
    Object.values(specs).forEach((spec) => {
        const status = spec.verification?.status || "unknown";
        byVerificationStatus[status] = (byVerificationStatus[status] || 0) + 1;
    });
    const byRuntimeStatus = {};
    Object.values(specs).forEach((spec) => {
        const status = spec.runtime?.status || "unknown";
        byRuntimeStatus[status] = (byRuntimeStatus[status] || 0) + 1;
    });
    const byCharacterStatus = Object.fromEntries(CLASSIFICATION_STATUSES.map((status) => [
        status,
        Object.values(byCharacter).filter((character) => character.status === status).length
    ]));
    return {
        schemaVersion: 2,
        kind: "genshinCharacterV2TalentGapCandidates",
        generator: {
            name: "genshinCharacterV2TalentGapCandidatesGenerate.cjs",
            version: GENERATOR_VERSION,
            capturedAt: CAPTURED_AT
        },
        policy: {
            canonical: 0,
            runtimePromotion: "forbidden",
            proseParsing: "forbidden",
            classification: {
                schemaVersion: CLASSIFICATION_POLICY.version,
                statuses: CLASSIFICATION_STATUSES,
                noEffect: CLASSIFICATION_POLICY.noEffect.rule,
                unstructured: CLASSIFICATION_POLICY.unstructured.rule,
                uninvestigated: CLASSIFICATION_POLICY.uninvestigated.rule,
                emptyTextDisposition: "uninvestigated",
                canonicalRule: CLASSIFICATION_POLICY.canonical
            },
            unknownFields: "EffectSpec fields remain explicitly unknown until independent human review and versioned source agreement."
        },
        generatedFrom,
        summary: {
            schemaVersion: 2,
            status: "passed",
            characters: characterIds.length,
            passiveSourceRecords: Object.keys(sourceRecords).length,
            effectSpecCandidates: Object.keys(specs).length,
            canonical: 0,
            byCharacterStatus,
            byVerificationStatus,
            byRuntimeStatus,
            characterIds,
            coverage: {
                characterIds: characterIds.length,
                sourceRecords: Object.keys(sourceRecords).length,
                specs: Object.keys(specs).length
            }
        },
        sourceRecords,
        specs,
        byCharacter
    };
}

function writeDataset({ dataRoot = defaultDataRoot, outputFile = defaultOutputFile } = {}) {
    const dataset = buildDataset({ dataRoot });
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
    return dataset;
}

if (require.main === module) {
    const dataRoot = process.env.GENSHIN_DATA_ROOT || defaultDataRoot;
    const outputFile = process.env.GENSHIN_CHARACTER_V2_TALENT_GAP_CANDIDATES_FILE || defaultOutputFile;
    process.stdout.write(`${JSON.stringify(writeDataset({ dataRoot, outputFile }).summary, null, 2)}\n`);
}

module.exports = {
    CAPTURED_AT,
    CLASSIFICATION_POLICY,
    CLASSIFICATION_STATUSES,
    GENERATOR_VERSION,
    INPUT_FILES,
    buildDataset,
    buildTalentGapCandidates: buildDataset,
    buildSourceRecord,
    buildSpec,
    classifyTalentGapCharacter,
    defaultDataRoot,
    defaultOutputFile,
    digest,
    inputManifest,
    needsReviewRecords,
    registryKeys,
    sourceRecordId,
    specId,
    stableJson,
    unknownEffect,
    writeDataset
};
