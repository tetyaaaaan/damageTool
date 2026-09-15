"use strict";

/**
 * Build the deterministic cross-character coverage index for the Genshin
 * character v2 evidence layer.
 *
 * This generator is intentionally an inventory transform.  It copies no
 * calculation values from prose and never promotes a legacy modifier to the
 * canonical runtime.  The one classification it makes for a missing talent
 * modifier record is evidence based: a non-empty raw talent text is
 * `unstructured`, an explicitly empty/no-effect record is `noEffect`, and a
 * missing text record is `uninvestigated`.  In particular, an empty field is
 * never treated as proof of no effect.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultDataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultOutputFile = path.join(defaultDataRoot, "v2", "characters", "coverage.json");
const CAPTURED_AT = "2026-08-15T00:00:00.000Z";
const GENERATOR_VERSION = "genshinCharacterV2CoverageGenerate/1";

// Allowed dispositions for a character whose talent-modifiers record is
// absent.  Keep all three values explicit so zero-count classes are still
// visible in generated summaries and audits.
const CLASSIFICATION_STATUSES = Object.freeze(["noEffect", "unstructured", "uninvestigated"]);
const CLASSIFICATION_POLICY = Object.freeze({
    version: 1,
    statuses: CLASSIFICATION_STATUSES,
    noEffect: {
        rule: "An explicit raw no-effect statement is present for every inspected passive field.",
        emptyText: "never qualifies",
        requires: ["raw text", "explicit no-effect wording", "no talent-modifiers record"]
    },
    unstructured: {
        rule: "At least one non-empty raw passive text field exists and no talent-modifiers record is present.",
        emptyText: "does not qualify",
        requires: ["non-empty raw passive text", "no talent-modifiers record"]
    },
    uninvestigated: {
        rule: "No non-empty raw passive text is available and no explicit no-effect evidence exists.",
        emptyText: "is treated as uninvestigated, never noEffect",
        requires: ["missing/empty raw passive text", "no explicit no-effect evidence", "no talent-modifiers record"]
    },
    canonical: "Classification is evidence only; canonical runtime promotion remains forbidden."
});

const INPUT_FILES = [
    "characters.json",
    "character-talents.json",
    "character-constellations.json",
    "calc/talent-scalings.json",
    "calc/talent-modifiers.json",
    "calc/constellation-modifiers.json",
    "calc/talent-effect-registry.json",
    "calc/talent-modifiers-needs-review.json"
];

const COMPONENTS = [
    ["rawTalents", "character-talents.json"],
    ["rawConstellations", "character-constellations.json"],
    ["talentScalings", "calc/talent-scalings.json"],
    ["talentModifiers", "calc/talent-modifiers.json"],
    ["constellationModifiers", "calc/constellation-modifiers.json"]
];

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
    return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function fileDigest(file) {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function pointerEscape(value) {
    return String(value).replace(/~/g, "~0").replace(/\//g, "~1");
}

function jsonPath(id, ...parts) {
    return `$/${pointerEscape(id)}${parts.length ? `/${parts.map(pointerEscape).join("/")}` : ""}`;
}

function sourceId(dataset) {
    return `source:${dataset}`;
}

function sourcePointer(dataset, id, field, present = true) {
    const pointer = {
        sourceId: sourceId(dataset),
        dataset,
        record: String(id),
        path: field ? jsonPath(id, field) : jsonPath(id),
        present: Boolean(present)
    };
    if (field) pointer.field = field;
    return pointer;
}

function textDigest(text) {
    return digest(String(text || ""));
}

function nonEmptyText(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function collectRawTalentFields(talents, id) {
    const entry = talents[id] || {};
    const fields = [];
    ["normalAttack", "skill", "burst", "special"].forEach((section) => {
        const value = entry[section];
        if (!isObject(value)) return;
        ["normalDescriptionJa", "chargedDescriptionJa", "plungingDescriptionJa", "descriptionJa"].forEach((field) => {
            if (!Object.prototype.hasOwnProperty.call(value, field)) return;
            const text = String(value[field] || "");
            fields.push({
                field: `${section}.${field}`,
                path: jsonPath(id, section, field),
                present: nonEmptyText(text),
                textLength: text.length,
                textDigest: textDigest(text),
                effectSignal: EFFECT_SIGNAL_RE.test(text),
                numericSignal: NUMERIC_SIGNAL_RE.test(text),
                explicitNoEffect: EXPLICIT_NO_EFFECT_PATTERN.test(text)
            });
        });
    });
    (Array.isArray(entry.passives) ? entry.passives : []).forEach((passive, index) => {
        const source = passive?.sourceId || `passive_${index + 1}`;
        const field = `passives.${index}.descriptionJa`;
        const text = String(passive?.descriptionJa || "");
        fields.push({
            field,
            sourceId: source,
            path: jsonPath(id, "passives", index, "descriptionJa"),
            present: nonEmptyText(text),
            textLength: text.length,
            textDigest: textDigest(text),
            effectSignal: EFFECT_SIGNAL_RE.test(text),
            numericSignal: NUMERIC_SIGNAL_RE.test(text),
            explicitNoEffect: EXPLICIT_NO_EFFECT_PATTERN.test(text)
        });
    });
    return fields;
}

function collectRawConstellationFields(constellations, id) {
    const entry = constellations[id] || {};
    return Object.keys(entry.constellations || {}).sort((a, b) => Number(a) - Number(b)).map((level) => {
        const value = entry.constellations[level] || {};
        const text = String(value.effectText || "");
        return {
            level,
            field: `constellations.${level}.effectText`,
            path: jsonPath(id, "constellations", level, "effectText"),
            present: nonEmptyText(text),
            textLength: text.length,
            textDigest: textDigest(text)
        };
    });
}

function countTalentScalings(value) {
    if (!isObject(value)) return { sections: 0, entries: 0, scalings: 0 };
    let sections = 0;
    let entries = 0;
    let scalings = 0;
    Object.values(value).forEach((section) => {
        if (!isObject(section)) return;
        if (Array.isArray(section.entries)) {
            sections += 1;
            section.entries.forEach((entry) => {
                entries += 1;
                scalings += Array.isArray(entry.scalings) ? entry.scalings.length : 0;
            });
        }
    });
    return { sections, entries, scalings };
}

function countTalentModifiers(value) {
    if (!isObject(value)) return { passives: 0, modifiers: 0 };
    let passives = 0;
    let modifiers = 0;
    (Array.isArray(value.passives) ? value.passives : []).forEach((passive) => {
        passives += 1;
        modifiers += Array.isArray(passive?.modifiers) ? passive.modifiers.length : 0;
    });
    return { passives, modifiers };
}

function countConstellationModifiers(value) {
    if (!isObject(value)) return { levels: 0, modifiers: 0 };
    let levels = 0;
    let modifiers = 0;
    Object.values(value.constellations || {}).forEach((items) => {
        levels += 1;
        modifiers += Array.isArray(items) ? items.length : 0;
    });
    return { levels, modifiers };
}

// These terms identify an explicit effect in source text.  They are only
// evidence flags for the report; no numerical value is parsed or promoted.
const EFFECT_SIGNAL_RE = /(?:ダメージ|与える|攻撃力|防御力|元素熟知|元素エネルギー|回復|治療|シールド|耐性|継続時間|クールタイム|攻撃速度|移動速度|スタミナ|会心|元素付与|反応|発動可能|獲得|重ね掛け|中断耐性)/;
const NUMERIC_SIGNAL_RE = /(?:\d+(?:\.\d+)?\s*[%％]?|[〇一二三四五六七八九十百千万]+\s*(?:秒|回|層|ポイント|名|%|％))/;
// Do not infer noEffect from an empty value.  A field must contain a
// complete, explicit no-effect statement. Japanese forms cover the source
// locale; English forms keep fixture/audit behavior deterministic.
const EXPLICIT_NO_EFFECT_RE = /^\s*(?:(?:no\s+effect|effect\s*:\s*none|has\s+no\s+effect)|(?:効果(?:は|が)?\s*(?:ない|無い|ありません|なし)))\s*[。.!！]?\s*$/iu;

// Use escapes here so the source file remains encoding-independent.
const EXPLICIT_NO_EFFECT_PATTERN = /^\s*(?:(?:no\s+effect|effect\s*:\s*none|has\s+no\s+effect)|(?:\u52b9\u679c(?:\u306f|\u304c)?\s*(?:\u306a\u3044|\u7121\u3044|\u3042\u308a\u307e\u305b\u3093|\u306a\u3057)))\s*[\u3002.!\uFF01]?\s*$/iu;

function emptyClassificationCounts() {
    return Object.fromEntries(CLASSIFICATION_STATUSES.map((status) => [status, 0]));
}

function classificationBoundaries(status) {
    const common = [
        "Independent provider/version agreement has not been established.",
        "EffectSpec values (target, trigger, value, timing, element, and stacking) remain unverified.",
        "No canonical runtime modifier is generated or promoted from this classification."
    ];
    if (status === "noEffect") {
        return [...common, "No-effect wording is limited to the inspected raw fields; absence of a field is not evidence."];
    }
    if (status === "unstructured") {
        return [...common, "Raw prose may describe damage, healing, resources, utility, or state changes; prose is not structured calculation data."];
    }
    return [...common, "The raw passive record/field is unavailable or empty; no effect conclusion may be drawn until a source is found."];
}

function registryEvidence(registry, id) {
    return Object.keys(registry?.records || {}).filter((key) => key === String(id) || key.startsWith(`${id}.`)).sort();
}

function reviewEvidence(needsReview, id) {
    return (Array.isArray(needsReview) ? needsReview : [])
        .map((record, index) => ({ record, index }))
        .filter(({ record }) => String(record?.characterId || "") === String(id))
        .map(({ record, index }) => ({
            index,
            sourceId: record.sourceId || null,
            category: record.category || null,
            reasons: Array.isArray(record.reasons) ? [...record.reasons] : []
        }));
}

function classifyMissingTalentModifiers({ id, talentFields = [], registry, needsReview, sourcePointers = [] }) {
    const fields = Array.isArray(talentFields) ? talentFields : [];
    const texts = fields.filter((field) => field.present);
    const explicitNoEffect = texts.length > 0 && texts.every((field) => field.explicitNoEffect === true);
    const registryKeys = registryEvidence(registry, id);
    const reviewRecords = reviewEvidence(needsReview, id);
    const effectSignalFields = texts.filter((field) => field.effectSignal === true);
    const numericSignalFields = texts.filter((field) => field.numericSignal === true);
    let status;
    const reasons = [];
    if (explicitNoEffect) {
        status = "noEffect";
        reasons.push("RAW_TEXT_EXPLICITLY_NO_EFFECT");
    } else if (texts.length > 0) {
        status = "unstructured";
        reasons.push("RAW_TALENT_TEXT_PRESENT");
        if (effectSignalFields.length) reasons.push("EFFECT_LANGUAGE_PRESENT");
        if (numericSignalFields.length) reasons.push("EXPLICIT_NUMERIC_TOKEN_PRESENT");
    } else {
        status = "uninvestigated";
        reasons.push("RAW_TALENT_TEXT_MISSING");
        // Deliberately do not emit noEffect for an empty source field.
        reasons.push("EMPTY_SOURCE_IS_NOT_NO_EFFECT");
    }
    reasons.push("TALENT_MODIFIER_RECORD_MISSING");
    if (registryKeys.length) reasons.push("EFFECT_REGISTRY_EVIDENCE_PRESENT");
    else reasons.push("NO_EFFECT_REGISTRY_EVIDENCE");
    if (reviewRecords.length) reasons.push("NEEDS_REVIEW_EVIDENCE_PRESENT");
    else reasons.push("NO_NEEDS_REVIEW_EVIDENCE");
    const resolvedSourcePointers = Array.isArray(sourcePointers) && sourcePointers.length
        ? sourcePointers.map((pointer) => ({ ...pointer }))
        : fields.map((field) => ({
            dataset: "character-talents.json",
            record: String(id),
            field: field.field || null,
            path: field.path || null,
            present: Boolean(field.present),
            sourceId: field.sourceId || null
        }));
    const explicitNoEffectFields = texts.filter((field) => field.explicitNoEffect === true).map((field) => field.path);
    const rationaleCode = status === "noEffect"
        ? "EXPLICIT_RAW_NO_EFFECT"
        : status === "unstructured"
            ? "NON_EMPTY_RAW_TEXT_WITHOUT_TALENT_MODIFIERS"
            : "RAW_TEXT_UNAVAILABLE_WITHOUT_EXPLICIT_NO_EFFECT";
    return {
        schemaVersion: 1,
        status,
        rationaleCode,
        criteria: CLASSIFICATION_POLICY[status]?.rule || null,
        reasons,
        sourcePointers: resolvedSourcePointers,
        unverifiedBoundaries: classificationBoundaries(status),
        evidence: {
            rawTextFields: texts.map((field) => field.path),
            rawTextFieldCount: texts.length,
            rawFieldCount: fields.length,
            explicitNoEffectFields,
            explicitNoEffectFieldCount: explicitNoEffectFields.length,
            effectSignalFieldCount: effectSignalFields.length,
            numericSignalFieldCount: numericSignalFields.length,
            effectRegistryKeys: registryKeys,
            needsReviewRecords: reviewRecords
        }
    };
}

function inputManifest(dataRoot) {
    return INPUT_FILES.map((relativePath) => {
        const absolutePath = path.join(dataRoot, relativePath);
        return {
            path: `games/genshin/data/${relativePath.replace(/\\/g, "/")}`,
            integrity: { algorithm: "sha256", digest: fileDigest(absolutePath) }
        };
    });
}

function sourceRecordsFromManifest(manifest) {
    return Object.fromEntries(manifest.map((input) => {
        const dataset = String(input.path).replace(/^games\/genshin\/data\//, "");
        const id = sourceId(dataset);
        return [id, {
            id,
            kind: "rawDataset",
            provider: "damageTool-local",
            locator: { dataset },
            capturedAt: CAPTURED_AT,
            gameVersion: null,
            locale: "ja-JP",
            integrity: clone(input.integrity)
        }];
    }));
}

function buildCharacter({ id, characters, talents, constellations, scalings, talentModifiers, constellationModifiers, registry, needsReview }) {
    const talentFields = collectRawTalentFields(talents, id);
    const constellationFields = collectRawConstellationFields(constellations, id);
    const talentScaling = scalings[id];
    const talentModifier = talentModifiers[id];
    const constellationModifier = constellationModifiers[id];
    const rawTalentPresent = Object.prototype.hasOwnProperty.call(talents, id);
    const rawConstellationPresent = Object.prototype.hasOwnProperty.call(constellations, id);
    const scalingPresent = Object.prototype.hasOwnProperty.call(scalings, id);
    const talentModifierPresent = Object.prototype.hasOwnProperty.call(talentModifiers, id);
    const constellationModifierPresent = Object.prototype.hasOwnProperty.call(constellationModifiers, id);
    const sourcePointers = [
        sourcePointer("characters.json", id),
        sourcePointer("character-talents.json", id, undefined, rawTalentPresent),
        sourcePointer("character-constellations.json", id, undefined, rawConstellationPresent),
        sourcePointer("calc/talent-scalings.json", id, undefined, scalingPresent),
        sourcePointer("calc/talent-modifiers.json", id, undefined, talentModifierPresent),
        sourcePointer("calc/constellation-modifiers.json", id, undefined, constellationModifierPresent)
    ];
    // Talent modifiers describe passive effects. Active skill/attack prose is
    // inventoried separately but must not make an otherwise uninvestigated
    // passive record look structured.
    const passiveTalentFields = talentFields.filter((field) => String(field.field || "").startsWith("passives."));
    const passiveSourcePointers = passiveTalentFields.length
        ? passiveTalentFields.map((field) => sourcePointer("character-talents.json", id, field.field, field.present))
        : [sourcePointer("character-talents.json", id, "passives", rawTalentPresent)];
    const classification = talentModifierPresent
        ? { status: "covered", reasons: [], evidence: { rawTextFields: [], rawTextFieldCount: 0, effectSignalFieldCount: 0, numericSignalFieldCount: 0, effectRegistryKeys: [], needsReviewRecords: [] } }
        : classifyMissingTalentModifiers({ id, talentFields: passiveTalentFields, registry, needsReview, sourcePointers: passiveSourcePointers });
    const reasons = [...classification.reasons];
    if (!rawTalentPresent) reasons.push("RAW_TALENTS_RECORD_MISSING");
    if (!rawConstellationPresent) reasons.push("RAW_CONSTELLATIONS_RECORD_MISSING");
    if (!scalingPresent) reasons.push("TALENT_SCALINGS_RECORD_MISSING");
    if (!constellationModifierPresent) reasons.push("CONSTELLATION_MODIFIER_RECORD_MISSING");
    const modifierCounts = countTalentModifiers(talentModifier);
    const constellationModifierCounts = countConstellationModifiers(constellationModifier);
    const coverageStatus = reasons.length ? "partial" : "complete";
    return {
        id: String(id),
        nameJa: characters[id]?.nameJa || null,
        status: classification.status,
        coverageStatus,
        canonical: 0,
        reasons,
        sourcePointers,
        components: {
            rawTalents: {
                present: rawTalentPresent,
                status: rawTalentPresent ? "present" : "missing",
                fieldCount: talentFields.length,
                nonEmptyFieldCount: talentFields.filter((field) => field.present).length,
                fields: talentFields
            },
            rawConstellations: {
                present: rawConstellationPresent,
                status: rawConstellationPresent ? "present" : "missing",
                levelCount: constellationFields.length,
                nonEmptyLevelCount: constellationFields.filter((field) => field.present).length,
                fields: constellationFields
            },
            talentScalings: {
                present: scalingPresent,
                status: scalingPresent ? "present" : "missing",
                ...countTalentScalings(talentScaling)
            },
            talentModifiers: {
                present: talentModifierPresent,
                status: classification.status,
                ...modifierCounts,
                classification: talentModifierPresent ? null : classification
            },
            constellationModifiers: {
                present: constellationModifierPresent,
                status: constellationModifierPresent ? "present" : "missing",
                ...constellationModifierCounts
            }
        }
    };
}

function buildDataset({ dataRoot = defaultDataRoot } = {}) {
    const characters = readJson(path.join(dataRoot, "characters.json"));
    const talents = readJson(path.join(dataRoot, "character-talents.json"));
    const constellations = readJson(path.join(dataRoot, "character-constellations.json"));
    const scalings = readJson(path.join(dataRoot, "calc", "talent-scalings.json"));
    const talentModifiers = readJson(path.join(dataRoot, "calc", "talent-modifiers.json"));
    const constellationModifiers = readJson(path.join(dataRoot, "calc", "constellation-modifiers.json"));
    const registry = readJson(path.join(dataRoot, "calc", "talent-effect-registry.json"));
    const needsReview = readJson(path.join(dataRoot, "calc", "talent-modifiers-needs-review.json"));
    const ids = Object.keys(characters).sort();
    const byCharacter = Object.fromEntries(ids.map((id) => [id, buildCharacter({
        id, characters, talents, constellations, scalings,
        talentModifiers, constellationModifiers, registry, needsReview
    })]));
    const countsBy = (field) => ids.reduce((result, id) => {
        const value = byCharacter[id][field];
        result[value] = (result[value] || 0) + 1;
        return result;
    }, {});
    const classificationCounts = ids.reduce((result, id) => {
        const value = byCharacter[id].status;
        if (CLASSIFICATION_STATUSES.includes(value)) result[value] += 1;
        return result;
    }, emptyClassificationCounts());
    const missingTalentModifiers = ids
        .filter((id) => !talentModifiers[id])
        .map((id) => {
            const character = byCharacter[id];
            return {
                characterId: id,
                characterName: character.nameJa,
                status: character.status,
                reasons: character.reasons,
                sourcePointers: character.sourcePointers,
                classification: character.components.talentModifiers.classification || null,
                evidence: character.components.talentModifiers.classification?.evidence || null,
                unverifiedBoundaries: character.components.talentModifiers.classification?.unverifiedBoundaries || []
            };
        });
    const componentCoverage = {};
    COMPONENTS.forEach(([name]) => {
        componentCoverage[name] = {
            present: ids.filter((id) => byCharacter[id].components[name].present).length,
            missing: ids.filter((id) => !byCharacter[id].components[name].present).length
        };
    });
    const canonical = 0;
    const generatedFrom = inputManifest(dataRoot);
    const sourceRecords = sourceRecordsFromManifest(generatedFrom);
    return {
        schemaVersion: 2,
        kind: "genshinCharacterV2Coverage",
        generator: {
            name: "genshinCharacterV2CoverageGenerate.cjs",
            version: GENERATOR_VERSION,
            capturedAt: CAPTURED_AT
        },
        policy: {
            canonical,
            canonicalRule: "Coverage is evidence only; no character record is promoted to canonical runtime.",
            classification: {
                noEffect: "Only an explicit raw no-effect statement qualifies; missing/empty text never qualifies.",
                unstructured: "Raw talent text exists but no talent-modifiers record is present.",
                uninvestigated: "Raw talent text is unavailable and no explicit no-effect evidence exists.",
                statuses: CLASSIFICATION_STATUSES,
                schemaVersion: CLASSIFICATION_POLICY.version,
                criteria: {
                    noEffect: CLASSIFICATION_POLICY.noEffect.rule,
                    unstructured: CLASSIFICATION_POLICY.unstructured.rule,
                    uninvestigated: CLASSIFICATION_POLICY.uninvestigated.rule
                },
                emptyTextDisposition: "uninvestigated",
                canonicalRule: CLASSIFICATION_POLICY.canonical
            }
        },
        generatedFrom,
        // Keep a resolvable source-record map alongside the compact digest
        // manifest; character sourcePointers refer to these IDs.
        sourceRecords,
        sources: sourceRecords,
        summary: {
            schemaVersion: 2,
            status: "passed",
            characters: ids.length,
            canonical,
            componentCoverage,
            byStatus: countsBy("status"),
            byClassificationStatus: classificationCounts,
            byCoverageStatus: countsBy("coverageStatus"),
            missingTalentModifiers: missingTalentModifiers.length,
            missingTalentModifierIds: missingTalentModifiers.map((entry) => entry.characterId)
        },
        characters: byCharacter,
        missingTalentModifiers
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
    const outputFile = process.env.GENSHIN_CHARACTER_V2_COVERAGE_FILE || defaultOutputFile;
    process.stdout.write(`${JSON.stringify(writeDataset({ dataRoot, outputFile }).summary, null, 2)}\n`);
}

module.exports = {
    CAPTURED_AT,
    CLASSIFICATION_POLICY,
    CLASSIFICATION_STATUSES,
    COMPONENTS,
    GENERATOR_VERSION,
    INPUT_FILES,
    buildCharacter,
    buildDataset,
    classifyMissingTalentModifiers,
    collectRawConstellationFields,
    collectRawTalentFields,
    countConstellationModifiers,
    countTalentModifiers,
    countTalentScalings,
    defaultDataRoot,
    defaultOutputFile,
    digest,
    inputManifest,
    sourceRecordsFromManifest,
    stableJson,
    // Friendly aliases used by downstream audits and external checks.
    buildCoverage: buildDataset,
    writeCoverage: writeDataset,
    writeDataset
};
