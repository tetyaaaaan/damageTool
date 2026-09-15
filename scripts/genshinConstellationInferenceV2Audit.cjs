"use strict";

/*
 * Read-only audit of the constellation modifiers that carry either
 * inferredFromSourceText or fromSourceText.  The script deliberately does
 * not mutate any existing data file.  `--write` only creates the two v2
 * reports owned by this audit.
 */

const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const calcRoot = path.join(dataRoot, "calc");
const modifiersPath = path.join(calcRoot, "constellation-modifiers.json");
const descriptionsPath = path.join(dataRoot, "character-constellations.json");
const charactersPath = path.join(dataRoot, "characters.json");
const registryPath = path.join(calcRoot, "constellation-effect-registry.json");
const sourceIndexPath = path.join(calcRoot, "constellation-source-index.json");
const reportJsonPath = path.join(repositoryRoot, "reports", "genshin-constellation-source-inference-v2.json");
const reportMarkdownPath = path.join(repositoryRoot, "reports", "genshin-constellation-source-inference-v2.md");

const PROJECT_NAMES = ["genshinOptimizer", "gcsim"];

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sortNumericStrings(entries) {
    return entries.sort(([a], [b]) => Number(a) - Number(b) || String(a).localeCompare(String(b)));
}

function naturalIdCompare(left, right) {
    return String(left).localeCompare(String(right), "en", { numeric: true });
}

function markerPaths(value, basePath = "$") {
    const found = [];
    if (!value || typeof value !== "object") return found;
    Object.entries(value).forEach(([key, child]) => {
        const childPath = `${basePath}.${key}`;
        if ((key === "inferredFromSourceText" || key === "fromSourceText") && child === true) {
            found.push({ kind: key, path: childPath });
        }
        if (child && typeof child === "object") found.push(...markerPaths(child, childPath));
    });
    return found;
}

function modifierGroups(character) {
    const groups = [];
    Object.entries(character || {}).forEach(([key, value]) => {
        if (key === "constellations" && value && typeof value === "object") {
            sortNumericStrings(Object.entries(value)).forEach(([level, modifiers]) => {
                if (Array.isArray(modifiers)) groups.push({ level, container: "constellations", modifiers });
            });
        } else if (/^\d+$/.test(key) && Array.isArray(value)) {
            // Resource/state records from skipped source-text sections live
            // beside (not inside) `constellations`; keep them in the audit.
            groups.push({ level: key, container: key, modifiers: value });
        }
    });
    return groups.sort((a, b) => Number(a.level) - Number(b.level) || a.container.localeCompare(b.container));
}

function compactSourceReference(reference) {
    if (!reference) return null;
    const result = {};
    ["key", "path", "skillParamPath", "constellationPath"].forEach((key) => {
        if (reference[key]) result[key] = reference[key];
    });
    if (Array.isArray(reference.numericTokens)) result.numericHintCount = reference.numericTokens.length;
    return result;
}

function compactRegistryEvidence(effect) {
    if (!effect) return null;
    return {
        verificationStatus: effect.verificationStatus || null,
        category: effect.category || null,
        targets: clone(effect.targets || []),
        condition: effect.condition || null,
        unit: effect.unit || null,
        numericValues: clone(effect.numericValues || []),
        officialTextValueMatch: effect.evidence?.officialTextValueMatch === true,
        externalNumericHints: clone(effect.evidence?.externalNumericHints || [])
    };
}

function allIds(values) {
    return new Set(values.flat());
}

// These are semantic-review hazards, not verification claims.  The rules
// identify known places where a numeric token can be right while the target,
// branch, stack, timing, or category is still too broad for canonical data.
const DANGER_ID_SETS = {
    overlapDuplicateScope: allIds([
        ["c_10000035_2_1", "c_10000035_2_2", "c_10000035_2_3"],
        ["c_10000042_6_1", "c_10000042_6_2", "c_10000042_6_3", "c_10000042_6_4", "c_10000042_6_5", "c_10000042_6_6"],
        ["c_10000050_6_1", "c_10000050_6_2", "c_10000050_6_3", "c_10000050_6_4"],
        ["c_10000054_6_1", "c_10000054_6_2", "c_10000054_6_3", "c_10000054_6_4"],
        ["c_10000071_2_1", "c_10000071_2_2"]
    ]),
    broadTarget: allIds([
        ["c_10000003_1_1", "c_10000053_2_1", "c_10000079_2_1"]
    ]),
    missingTemporalScope: allIds([
        ["c_10000016_6_1", "c_10000038_4_1", "c_10000041_6_1", "c_10000045_1_1", "c_10000064_2_1", "c_10000079_2_1", "c_10000079_2_2"]
    ]),
    missingChance: allIds([
        ["c_10000049_6_1", "c_10000113_6_1"]
    ]),
    missingStackOrCap: allIds([
        [
            "c_10000041_6_1",
            "c_10000042_6_1", "c_10000042_6_2", "c_10000042_6_3", "c_10000042_6_4", "c_10000042_6_5", "c_10000042_6_6",
            "c_10000053_2_1",
            "c_10000071_2_1", "c_10000071_2_2",
            "c_10000075_6_1", "c_10000087_6_1", "c_10000098_6_4",
            "c_10000107_1_1", "c_10000107_1_2_resolved_2", "c_10000119_6_1", "c_10000119_6_4"
        ]
    ]),
    categoryMismatch: allIds([
        ["c_10000074_4_1", "c_10000119_6_1"]
    ]),
    branchDependent: allIds([
        ["c_10000111_4_1", "c_10000111_4_2"]
    ]),
    missingTriggerOrCondition: allIds([
        [
            "c_10000002_6_1", "c_10000003_1_1", "c_10000016_6_1", "c_10000024_4_1", "c_10000034_2_1",
            "c_10000035_2_1", "c_10000035_2_2", "c_10000035_2_3", "c_10000036_1_1", "c_10000036_6_1",
            "c_10000038_4_1", "c_10000041_6_1", "c_10000042_6_1", "c_10000042_6_2", "c_10000042_6_3",
            "c_10000042_6_4", "c_10000042_6_5", "c_10000042_6_6", "c_10000045_1_1", "c_10000049_6_1",
            "c_10000050_6_1", "c_10000050_6_2", "c_10000050_6_3", "c_10000050_6_4", "c_10000053_2_1",
            "c_10000054_1_1", "c_10000054_6_1", "c_10000054_6_2", "c_10000054_6_3", "c_10000054_6_4",
            "c_10000060_2_1", "c_10000064_2_1", "c_10000065_4_1", "c_10000071_2_1", "c_10000071_2_2",
            "c_10000072_6_1", "c_10000074_4_1", "c_10000075_6_1", "c_10000079_2_1", "c_10000081_6_1",
            "c_10000084_6_1", "c_10000086_6_3", "c_10000087_6_1", "c_10000088_6_1", "c_10000098_1_1",
            "c_10000098_6_4", "c_10000107_1_1", "c_10000107_1_2_resolved_2", "c_10000107_4_1",
            "c_10000111_4_1", "c_10000111_4_2", "c_10000112_6_1", "c_10000113_6_1", "c_10000119_6_1",
            "c_10000119_6_4", "c_10000120_2_2", "c_10000129_2_2", "c_10000133_4_1"
        ]
    ])
};

const DANGER_DESCRIPTIONS = {
    resourceSkipped: "fromSourceText resource/state record was stored outside the registry traversal; no numeric/effect registry corroboration",
    supersededByStructuredRecord: "record is explicitly marked supersededByStructuredRecord",
    existingQuarantine: "existing effect registry quarantine",
    overlapDuplicateScope: "same source claim is represented by overlapping per-target and combined modifiers; double-count risk",
    broadTarget: "modifier target is broader than the source claim (for example allDamageBonus)",
    missingTemporalScope: "source duration/next-hit/area/limited-hit scope is not encoded in the modifier target",
    missingChance: "source probability/chance clause is not encoded",
    missingStackOrCap: "source stack, cap, per-time, or count constraint is not fully represented",
    categoryMismatch: "modifier category/target does not match the source mechanic (buff/reaction vs extra damage)",
    branchDependent: "source has mutually exclusive state/branch wording; one unconditional modifier cannot represent both",
    missingTriggerOrCondition: "source trigger/affected actor/attack condition is represented only by inferred marker or a broad condition"
};

/*
 * Semantic review is intentionally independent from the old evidence class.
 * `officialTextValueMatch` proves only that a numeric token occurs in the
 * description.  It cannot prove that the modifier has the same target,
 * trigger, timing, stack/cap, branch, or attack scope.  The sets below are
 * the deterministic exceptions found while comparing the structured
 * modifier with the raw Japanese constellation description.  A mismatch is
 * reserved for a claim that the modifier actively says something different
 * from the description (for example all-damage vs a single attack, or a
 * bonus represented as a summoned hit).  Missing detail remains partial.
 */
const SEMANTIC_MISMATCH_REASONS = {
    c_10000003_1_1: "source limits the bonus to Jean's long-press skill damage; modifier applies it to all damage",
    c_10000036_6_2: "source's 15% skill-damage bonus is represented as a 15% extra summoned hit; record is also registry-quarantined",
    c_10000053_2_1: "source limits the 3.3% values to tap/hold Wind Wheel damage; modifier applies all damage",
    c_10000074_4_1: "source grants a temporary normal/charged damage bonus; modifier classifies it as generic extra damage",
    c_10000079_2_1: "source limits 50% to the next coordinated attack in the field; modifier applies all damage",
    c_10000107_1_2_resolved_2: "source increases nearby non-Citlali attack damage while consuming Star Blades; modifier models an unconditional additional hit/projectile",
    c_10000111_4_1: "source has mutually exclusive state branches; this record unconditionally applies the burst branch to burst damage",
    c_10000111_4_2: "source has mutually exclusive state branches; this record combines branch-specific plunge and burst effects",
    c_10000119_6_1: "source's +25% Moon-Bloom reaction clause is a team reaction bonus; modifier targets normal/skill damage"
};

const SEMANTIC_MISMATCH_IDS = new Set(Object.keys(SEMANTIC_MISMATCH_REASONS));

// Named conditions whose trigger is represented by a stable structured
// condition rather than the generic `conditional`/`constellationUnlocked`
// placeholder.  Timing/target checks can still remain partial for these
// records when the source contains additional scope (for example "next
// attack" or a probability clause).
const STRUCTURED_TRIGGER_IDS = new Set([
    "c_10000049_6_1",
    "c_10000060_2_1",
    "c_10000065_4_1",
    "c_10000086_6_3",
    "c_10000094_2_1_resolved_1"
]);

// Source clauses contain a temporal/count constraint that is not represented
// by the modifier's duration/cooldown/stack fields.  The existing danger tags
// cover most of these; the explicit additions cover compound/resolved records
// whose old audit had no danger tag.
const SEMANTIC_TIMING_PARTIAL_IDS = new Set([
    "c_10000002_6_1", // 10s state, 0.5s clear-after-hit
    "c_10000029_1_1_resolved_1", // chance-triggered attack (no timing/count)
    "c_10000032_4_1_resolved_1", // second attack window
    "c_10000072_6_1", // 2.3s cooldown
    "c_10000074_4_1", // 3s/0.05s clear window
    "c_10000081_6_1", // 3s cooldown
    "c_10000088_6_1", // 6s cooldown
    "c_10000094_2_1_resolved_1", // 10s/3s summon cadence
    "c_10000098_1_1", // 1.2s cooldown
    "c_10000107_4_1", // 8s cooldown
    "c_10000112_6_1", // 0.5s cooldown
    "c_10000113_6_1", // chance clause (no timing/count)
    "c_10000119_6_4", // eight-per-field-duration cap
    "c_10000120_2_2", // six-second post-skill window
    "c_10000129_2_2", // four-second acquisition/once-next-attack window
    "c_10000133_4_1" // four-second cooldown
]);

// The source explicitly names an attack kind/affected actor, but the
// modifier keeps only an inferred marker or generic triggeredDamage target.
// These remain partial even when the numeric value and named trigger match.
const SEMANTIC_ATTACK_SCOPE_PARTIAL_IDS = new Set([
    "c_10000002_6_1", "c_10000003_1_1", "c_10000016_6_1", "c_10000024_4_1",
    "c_10000029_1_1_resolved_1", "c_10000032_4_1_resolved_1", "c_10000034_2_1",
    "c_10000035_2_1", "c_10000035_2_2", "c_10000035_2_3", "c_10000036_1_1",
    "c_10000036_6_1", "c_10000038_4_1", "c_10000041_6_1", "c_10000042_6_1",
    "c_10000042_6_2", "c_10000042_6_3", "c_10000042_6_4", "c_10000042_6_5",
    "c_10000042_6_6", "c_10000045_1_1", "c_10000049_6_1", "c_10000050_6_1",
    "c_10000050_6_2", "c_10000050_6_3", "c_10000050_6_4", "c_10000053_2_1",
    "c_10000054_1_1", "c_10000054_6_1", "c_10000054_6_2", "c_10000054_6_3",
    "c_10000054_6_4", "c_10000060_2_1", "c_10000064_2_1", "c_10000065_4_1",
    "c_10000071_2_1", "c_10000071_2_2", "c_10000072_6_1", "c_10000074_4_1",
    "c_10000075_6_1", "c_10000079_2_1", "c_10000079_2_2", "c_10000081_6_1",
    "c_10000084_6_1", "c_10000086_6_3", "c_10000087_6_1", "c_10000088_6_1",
    "c_10000098_1_1", "c_10000098_6_4", "c_10000107_1_1", "c_10000107_1_2_resolved_2",
    "c_10000107_4_1", "c_10000111_4_1", "c_10000111_4_2", "c_10000112_6_1",
    "c_10000113_6_1", "c_10000119_6_1", "c_10000119_6_4", "c_10000120_2_2",
    "c_10000129_2_2", "c_10000133_4_1"
]);

function dangerTags(id, modifier, markers, registryEffect) {
    const tags = [];
    if (modifier.category === "resourceEffect" && markers.some((item) => item.kind === "fromSourceText")) tags.push("resourceSkipped");
    if (modifier.auditDisposition === "supersededByStructuredRecord") tags.push("supersededByStructuredRecord");
    if (registryEffect?.verificationStatus === "quarantined") tags.push("existingQuarantine");
    Object.entries(DANGER_ID_SETS).forEach(([tag, ids]) => {
        if (ids.has(id)) tags.push(tag);
    });
    return tags;
}

function semanticStatus(isResource, status, reason = "") {
    return {
        status,
        ...(reason ? { reason } : {})
    };
}

/*
 * Build a dimension-by-dimension semantic record.  Status values deliberately
 * use a small vocabulary so consumers can count them without interpreting
 * prose: confirmed, partial, unconfirmed, or mismatch.  `quarantine` is
 * intentionally not folded into this object; it is an orthogonal registry
 * disposition and is exposed separately on every record.
 */
function semanticReview({ id, modifier, markers, registryEffect, dangerTagList }) {
    const isResource = modifier.category === "resourceEffect"
        && markers.some((item) => item.kind === "fromSourceText");
    if (isResource) {
        const unconfirmed = (reason) => semanticStatus(true, "unconfirmed", reason);
        return {
            value: unconfirmed("resource/state value has no registry numeric contract"),
            category: unconfirmed("resource/state category is represented only by fromSourceText"),
            applyTo: unconfirmed("resource/state target is represented only by fromSourceText"),
            trigger: unconfirmed("resource/state trigger is not independently registered"),
            timing: unconfirmed("resource/state timing is not independently registered"),
            stack: unconfirmed("resource/state stack/cap is not independently registered"),
            branch: unconfirmed("resource/state branch is not independently registered"),
            attackType: unconfirmed("resource/state attack scope is not independently registered"),
            duplicateScope: semanticStatus(true, "confirmed", "no duplicate check is possible without a registered effect"),
            evidenceBasis: "fromSourceText-without-registry"
        };
    }

    const valueStatus = registryEffect?.evidence?.officialTextValueMatch === true
        ? semanticStatus(false, "confirmed", "registry officialTextValueMatch confirms the numeric token")
        : semanticStatus(false, "unconfirmed", "no official numeric value match");
    const category = SEMANTIC_MISMATCH_IDS.has(id)
        && ["c_10000003_1_1", "c_10000053_2_1", "c_10000074_4_1", "c_10000079_2_1", "c_10000107_1_2_resolved_2", "c_10000119_6_1", "c_10000036_6_2"].includes(id)
        ? semanticStatus(false, "mismatch", SEMANTIC_MISMATCH_REASONS[id])
        : semanticStatus(false, "confirmed", "modifier category is compatible with the represented clause");
    const applyTo = ["c_10000003_1_1", "c_10000053_2_1", "c_10000079_2_1", "c_10000111_4_1", "c_10000111_4_2"].includes(id)
        ? semanticStatus(false, "mismatch", SEMANTIC_MISMATCH_REASONS[id])
        : SEMANTIC_ATTACK_SCOPE_PARTIAL_IDS.has(id)
            ? semanticStatus(false, "partial", "source attack/actor scope is retained only by an inferred or generic target")
            : semanticStatus(false, "confirmed", "structured applyTo scope matches the represented clause");
    const trigger = STRUCTURED_TRIGGER_IDS.has(id)
        ? semanticStatus(false, "confirmed", "named modifier condition represents the source trigger")
        : dangerTagList.includes("missingTriggerOrCondition")
            ? semanticStatus(false, "partial", DANGER_DESCRIPTIONS.missingTriggerOrCondition)
            : semanticStatus(false, "partial", "source trigger is not independently represented by a named condition");
    const timing = dangerTagList.includes("missingTemporalScope") || SEMANTIC_TIMING_PARTIAL_IDS.has(id)
        ? semanticStatus(false, "partial", "source duration/cooldown/next-hit/count scope is not fully represented")
        : semanticStatus(false, "confirmed", "no additional source timing constraint is present or the structured field covers it");
    const stack = dangerTagList.includes("missingStackOrCap")
        ? semanticStatus(false, "partial", DANGER_DESCRIPTIONS.missingStackOrCap)
        : semanticStatus(false, "confirmed", "no source stack/cap constraint is omitted");
    const branch = dangerTagList.includes("branchDependent")
        ? semanticStatus(false, "mismatch", SEMANTIC_MISMATCH_REASONS[id])
        : semanticStatus(false, "confirmed", "source has no mutually exclusive branch omitted by this record");
    const duplicateScope = dangerTagList.includes("overlapDuplicateScope")
        ? semanticStatus(false, "partial", DANGER_DESCRIPTIONS.overlapDuplicateScope)
        : semanticStatus(false, "confirmed", "no overlapping duplicate scope was identified");
    const attackType = SEMANTIC_ATTACK_SCOPE_PARTIAL_IDS.has(id)
        ? semanticStatus(false, "partial", "source attack kind is present only in inferred marker/condition text")
        : semanticStatus(false, "confirmed", "source attack kind is represented by structured applyTo/condition");

    return {
        value: valueStatus,
        category,
        applyTo,
        trigger,
        timing,
        stack,
        branch,
        attackType,
        duplicateScope,
        evidenceBasis: registryEffect?.evidence?.officialTextValueMatch === true
            ? "registry-numeric-plus-structured-review"
            : "registry-without-official-numeric-match"
    };
}

function semanticClassification(review) {
    const statuses = Object.entries(review)
        .filter(([key]) => key !== "evidenceBasis")
        .map(([, value]) => value.status);
    if (statuses.every((status) => status === "unconfirmed" || status === "confirmed")) {
        return statuses.includes("unconfirmed") ? "unconfirmed" : "explicitlyConfirmed";
    }
    if (statuses.includes("mismatch")) return "sourceMismatch";
    return "partiallyConfirmed";
}

function evidenceClass(registryEffect) {
    if (registryEffect?.verificationStatus === "quarantined") return "quarantined";
    if (registryEffect?.evidence?.officialTextValueMatch === true) return "explicitEvidence";
    return "unconfirmed";
}

function canonicalReason(classification) {
    if (classification === "quarantined") return "Existing registry quarantine/supersession prevents canonical promotion.";
    if (classification === "unconfirmed") return "No effect-registry entry; source-text state/resource inference is not independently verified.";
    return "Registry confirms numeric value text only; the complete target, trigger, scope, branch, and category claim is not fully verified.";
}

function extractFlaggedRecords({ modifiers, descriptions, characters, registry, sourceIndex }) {
    const records = [];
    Object.keys(modifiers).sort((a, b) => Number(a) - Number(b)).forEach((characterId) => {
        modifierGroups(modifiers[characterId]).forEach(({ level, container, modifiers: levelModifiers }) => {
            levelModifiers.forEach((modifier, modifierIndex) => {
                const markers = markerPaths(modifier);
                if (!markers.length) return;
                const levelDescription = descriptions[characterId]?.constellations?.[String(level)] || {};
                const registryEffect = registry.effectsById?.[modifier.id] || null;
                const indexCharacter = sourceIndex.characters?.[characterId] || {};
                const sourceIndexReferences = {};
                PROJECT_NAMES.forEach((project) => {
                    sourceIndexReferences[project] = compactSourceReference(indexCharacter[project]);
                });
                const flagKinds = [...new Set(markers.map((item) => item.kind))].sort();
                const classification = evidenceClass(registryEffect);
                const id = modifier.id || `c_${characterId}_${level}_${modifierIndex + 1}`;
                const tags = dangerTags(id, modifier, markers, registryEffect);
                const semantic = semanticReview({
                    id,
                    modifier,
                    markers,
                    registryEffect,
                    dangerTagList: tags
                });
                const semanticClass = semanticClassification(semantic);
                records.push({
                    id,
                    characterId,
                    characterName: characters[characterId]?.nameJa || "",
                    constellationLevel: Number(level),
                    markerKinds: flagKinds,
                    markerPaths: markers.map((item) => item.path),
                    sourceRecordPath: `games/genshin/data/character-constellations.json:$.${characterId}.constellations.${level}.effectText`,
                    modifierPath: `games/genshin/data/calc/constellation-modifiers.json:$.${characterId}.${container}.${levelModifiers === modifiers[characterId]?.constellations?.[level] ? "" : ""}`,
                    source: {
                        nameJa: levelDescription.nameJa || "",
                        effectText: levelDescription.effectText || ""
                    },
                    modifier: clone(modifier),
                    registry: compactRegistryEvidence(registryEffect),
                    registryStatus: registryEffect?.verificationStatus || null,
                    sourceIndexReferences,
                    externalNumericHints: clone(registryEffect?.evidence?.externalNumericHints || []),
                    evidenceClass: classification,
                    explicitEvidence: classification === "explicitEvidence",
                    unconfirmed: classification === "unconfirmed",
                    quarantined: classification === "quarantined",
                    semanticClassification: semanticClass,
                    semanticReview: semantic,
                    semanticMismatch: SEMANTIC_MISMATCH_IDS.has(id),
                    semanticMismatchReason: SEMANTIC_MISMATCH_REASONS[id] || null,
                    quarantine: {
                        flagged: classification === "quarantined",
                        registryStatus: registryEffect?.verificationStatus || null,
                        disposition: modifier.auditDisposition || null
                    },
                    fullClaimVerified: false,
                    canonicalEligibility: false,
                    canonicalEligibilityReason: canonicalReason(classification),
                    dangerTags: tags
                });
            });
        });
    });
    // The path above intentionally avoids array offsets in the source part;
    // replace it with stable, human-readable paths after sorting by character,
    // level, and the original array index.
    records.sort((a, b) => Number(a.characterId) - Number(b.characterId)
        || a.constellationLevel - b.constellationLevel
        || naturalIdCompare(a.id, b.id));
    records.forEach((record) => {
        const character = modifiers[record.characterId];
        const standard = character?.constellations?.[String(record.constellationLevel)] || [];
        let container = "constellations";
        let array = standard;
        if (!standard.some((modifier) => modifier.id === record.id)) {
            container = String(record.constellationLevel);
            array = Array.isArray(character?.[container]) ? character[container] : [];
        }
        const index = array.findIndex((modifier) => modifier.id === record.id);
        record.modifierPath = `games/genshin/data/calc/constellation-modifiers.json:$.${record.characterId}.${container}.${index >= 0 ? index : "?"}`;
    });
    return records;
}

function countBy(records, selector) {
    const counts = {};
    records.forEach((record) => {
        const key = selector(record);
        counts[key] = (counts[key] || 0) + 1;
    });
    return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function dangerSummary(records) {
    const result = {};
    const tags = new Set(records.flatMap((record) => record.dangerTags));
    [...tags].sort().forEach((tag) => {
        const ids = records.filter((record) => record.dangerTags.includes(tag)).map((record) => record.id);
        result[tag] = { count: ids.length, description: DANGER_DESCRIPTIONS[tag] || "", ids };
    });
    return result;
}

function buildAudit() {
    const modifiers = readJson(modifiersPath);
    const descriptions = readJson(descriptionsPath);
    const characters = readJson(charactersPath);
    const registry = readJson(registryPath);
    const sourceIndex = readJson(sourceIndexPath);
    const records = extractFlaggedRecords({ modifiers, descriptions, characters, registry, sourceIndex });
    const markerCounts = {};
    records.forEach((record) => record.markerKinds.forEach((kind) => {
        markerCounts[kind] = (markerCounts[kind] || 0) + 1;
    }));
    const registryStatusCounts = countBy(records, (record) => record.registryStatus || "missing");
    const evidenceClassCounts = countBy(records, (record) => record.evidenceClass);
    const semanticClassificationCounts = countBy(records, (record) => record.semanticClassification);
    const quarantineCounts = countBy(records, (record) => record.quarantine.flagged ? "quarantined" : "notQuarantined");
    const externalHintCounts = countBy(records, (record) => record.externalNumericHints.join(",") || "none");
    const projects = {};
    PROJECT_NAMES.forEach((project) => {
        projects[project] = clone(sourceIndex.projects?.[project] || null);
    });
    return {
        schemaVersion: 2,
        audit: "genshin-constellation-source-inference-v2",
        generatedFrom: [
            "games/genshin/data/calc/constellation-modifiers.json",
            "games/genshin/data/character-constellations.json",
            "games/genshin/data/characters.json",
            "games/genshin/data/calc/constellation-effect-registry.json",
            "games/genshin/data/calc/constellation-source-index.json"
        ],
        methodology: {
            extraction: "Walk every character modifier array, including numeric sibling arrays outside .constellations (resource/state records), and recursively detect true inferredFromSourceText/fromSourceText markers.",
            explicitEvidence: "Registry evidence.officialTextValueMatch=true; this verifies a numeric token in the official description, not the complete semantic claim.",
            semanticClassification: "Each flagged record is classified from value, category, applyTo, trigger, timing, stack/cap, branch, attack type, and duplicate-scope checks. explicitlyConfirmed requires every source-relevant dimension to be structured and corroborated; missing detail is partiallyConfirmed, active contradiction is sourceMismatch, and no registry support is unconfirmed.",
            semanticMismatch: "sourceMismatch is reserved for a structured claim that contradicts the raw description. Registry quarantine is kept as an orthogonal quarantine flag and does not choose the semantic class.",
            unconfirmed: "No matching effect-registry entry (all 21 are fromSourceText resource/state records).",
            quarantined: "Existing registry verificationStatus=quarantined; do not promote.",
            canonicalEligibility: "False unless a reviewer verifies the complete source claim (target, trigger, timing, branch, stack/cap, element, and category). This audit performs no such promotion.",
            externalSources: "Pinned OSS source-index references and registry externalNumericHints are treated as numeric corroboration hints only; they are not independent semantic verification."
        },
        externalProjects: projects,
        summary: {
            totalFlagged: records.length,
            inferredFromSourceText: markerCounts.inferredFromSourceText || 0,
            fromSourceText: markerCounts.fromSourceText || 0,
            evidenceClassCounts,
            semanticClassificationCounts,
            quarantineCounts,
            registryStatusCounts,
            externalNumericHintCounts: externalHintCounts,
            canonicalEligible: records.filter((record) => record.canonicalEligibility).length,
            canonicalIneligible: records.filter((record) => !record.canonicalEligibility).length,
            dangerPatternCounts: Object.fromEntries(Object.entries(dangerSummary(records)).map(([tag, data]) => [tag, data.count]))
        },
        dangerPatterns: dangerSummary(records),
        records
    };
}

function renderMarkdown(audit) {
    const summary = audit.summary;
    const statusRows = Object.entries(summary.registryStatusCounts).map(([key, value]) => `| \`${key}\` | ${value} |`).join("\n");
    const evidenceRows = Object.entries(summary.evidenceClassCounts).map(([key, value]) => `| \`${key}\` | ${value} |`).join("\n");
    const semanticRows = Object.entries(summary.semanticClassificationCounts).map(([key, value]) => `| \`${key}\` | ${value} |`).join("\n");
    const quarantineRows = Object.entries(summary.quarantineCounts).map(([key, value]) => `| \`${key}\` | ${value} |`).join("\n");
    const dangerRows = Object.entries(audit.dangerPatterns).map(([key, value]) => `| \`${key}\` | ${value.count} | ${value.description} |`).join("\n");
    const recordRows = audit.records.map((record) => {
        const tags = record.dangerTags.length ? record.dangerTags.join(", ") : "—";
        const dimensions = ["value", "category", "applyTo", "trigger", "timing", "stack", "branch", "attackType", "duplicateScope"]
            .map((key) => `${key}=${record.semanticReview[key].status}`).join("; ");
        return `| \`${record.id}\` | ${record.characterName} C${record.constellationLevel} | ${record.markerKinds.join(", ")} | ${record.evidenceClass} | ${record.registryStatus || "missing"} | ${record.semanticClassification} | ${record.quarantine.flagged ? "quarantined" : "—"} | ${dimensions} | ${tags} |`;
    }).join("\n");
    return [
        "# Genshin constellation source-text inference v2 audit",
        "",
        "This is a read-only, reproducible audit of every modifier carrying `inferredFromSourceText` or `fromSourceText`. Numeric registry matches are evidence for a value token only; they are not full semantic verification.",
        "",
        "## Counts",
        "",
        `- flagged records: **${summary.totalFlagged}** (inferredFromSourceText **${summary.inferredFromSourceText}**, fromSourceText **${summary.fromSourceText}**)`,
        `- canonical eligibility: **${summary.canonicalEligible} true**, **${summary.canonicalIneligible} false** (all records remain conservative false)`,
        "",
        "### Evidence class",
        "",
        "| class | count |",
        "| --- | ---: |",
        evidenceRows,
        "",
        "### Semantic classification",
        "",
        "| classification | count |",
        "| --- | ---: |",
        semanticRows,
        "",
        "`explicitlyConfirmed` is emitted only when every source-relevant dimension is structured and corroborated; numeric token matches alone remain `partiallyConfirmed`. `sourceMismatch` is an active contradiction, while missing detail is `partiallyConfirmed`. `unconfirmed` is reserved for records without an effect-registry contract.",
        "",
        "### Quarantine (orthogonal)",
        "",
        "| registry disposition | count |",
        "| --- | ---: |",
        quarantineRows,
        "",
        "### Existing registry status",
        "",
        "| status | count |",
        "| --- | ---: |",
        statusRows,
        "",
        "### Danger patterns",
        "",
        "| pattern | count | interpretation |",
        "| --- | ---: | --- |",
        dangerRows,
        "",
        "Pinned external projects:",
        "",
        ...PROJECT_NAMES.map((project) => {
            const source = audit.externalProjects[project] || {};
            return `- ${project}: ${source.repository || "(none)"} @ \`${source.revision || "(none)"}\` (${source.license || "unknown license"})`;
        }),
        "",
        "## Per-record classification",
        "",
        "`explicitEvidence` means registry `officialTextValueMatch=true`; it does not imply semantic confirmation. The per-record dimension statuses cover value, category, applyTo/target, trigger/condition, timing, stack/cap, branch, attack type, and duplicate scope. Registry `quarantined` is an orthogonal flag. `canonicalEligibility` is false for all records until the complete claim is independently verified.",
        "",
        "| id | character/level | marker | evidence | registry | semantic | quarantine | dimension status | danger tags |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
        recordRows,
        ""
    ].join("\n");
}

function writeReports(audit) {
    fs.mkdirSync(path.dirname(reportJsonPath), { recursive: true });
    fs.writeFileSync(reportJsonPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
    fs.writeFileSync(reportMarkdownPath, renderMarkdown(audit), "utf8");
}

if (require.main === module) {
    const audit = buildAudit();
    if (process.argv.includes("--write")) writeReports(audit);
    console.log(JSON.stringify(audit.summary, null, 2));
}

module.exports = {
    buildAudit,
    extractFlaggedRecords,
    renderMarkdown,
    writeReports,
    paths: { reportJsonPath, reportMarkdownPath }
};
