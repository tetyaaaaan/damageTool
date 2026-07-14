"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");
const VALUE_KEYS = [
    "value", "valueByRefinement", "valueByStack", "valueByLevel", "valuePerStack",
    "valuePerGeneratedStack", "valuePerConsumedStack", "valuePerExcessStack", "valuePer1000",
    "valuePerStep", "valueByCondition", "critRate", "critDamage", "ratio", "maxValue",
    "scalings", "targetEffect", "effect", "resource"
];
const TALENT_GROUP_BY_SOURCE = {
    combat1: "normalAttack",
    combat2: "skill",
    combat3: "burst"
};

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8"));
}

function hasValueSource(modifier) {
    return VALUE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(modifier, key));
}

function representedByTalentScalings(modifier, characterId, sourceId, talentScalings) {
    const group = TALENT_GROUP_BY_SOURCE[sourceId];
    return Boolean(
        group
        && modifier.category === "extraDamage"
        && modifier.calculationSupport === "special"
        && (modifier.applyTo || []).includes("triggeredDamage")
        && !hasValueSource(modifier)
        && (talentScalings?.[characterId]?.[group]?.entries || []).length
    );
}

function classify(modifier, characterId, sourceId, talentScalings) {
    if (representedByTalentScalings(modifier, characterId, sourceId, talentScalings)) {
        return {
            classification: "representedByTalentScalings",
            action: "suppressDuplicate",
            reason: "The dedicated damage entries in talent-scalings.json are the calculation source."
        };
    }
    if (modifier.category === "extraDamage") {
        return {
            classification: "unsupportedSpecialEffect",
            action: "keepWarning",
            reason: "This is a distinct extra-damage effect and still needs a structured formula."
        };
    }
    return {
        classification: "missingStructuredValue",
        action: "keepWarning",
        reason: "No supported structured value source is present."
    };
}

function buildAudit() {
    const modifiers = readJson("games/genshin/data/calc/talent-modifiers.json");
    const talentScalings = readJson("games/genshin/data/calc/talent-scalings.json");
    const characters = readJson("games/genshin/data/characters.json");
    const talents = readJson("games/genshin/data/character-talents.json");
    const records = [];

    Object.entries(modifiers).forEach(([characterId, entry]) => {
        (entry.passives || []).forEach((passive) => {
            (passive.modifiers || []).forEach((modifier, modifierIndex) => {
                if (hasValueSource(modifier)) return;
                const result = classify(modifier, characterId, passive.sourceId, talentScalings);
                const talentGroup = TALENT_GROUP_BY_SOURCE[passive.sourceId] || passive.sourceId;
                records.push({
                    characterId,
                    characterName: characters[characterId]?.nameJa || "",
                    sourceId: passive.sourceId || "unknown",
                    sourceName: talents[characterId]?.[talentGroup]?.nameJa || "",
                    modifierIndex,
                    modifierId: modifier.id || "unknown",
                    category: modifier.category || "",
                    ...result
                });
            });
        });
    });

    const byClassification = records.reduce((summary, record) => {
        summary[record.classification] = (summary[record.classification] || 0) + 1;
        return summary;
    }, {});
    return {
        generatedFrom: [
            "games/genshin/data/calc/talent-modifiers.json",
            "games/genshin/data/calc/talent-scalings.json"
        ],
        summary: { total: records.length, byClassification },
        records
    };
}

function renderMarkdown(audit) {
    const counts = audit.summary.byClassification;
    const lines = [
        "# Genshin talent modifier value audit",
        "",
        `- Total value-less modifiers: ${audit.summary.total}`,
        `- Represented by dedicated talent scalings: ${counts.representedByTalentScalings || 0}`,
        `- Unsupported distinct extra-damage effects: ${counts.unsupportedSpecialEffect || 0}`,
        `- Missing structured values: ${counts.missingStructuredValue || 0}`,
        "",
        "| Character | Source | Modifier | Category | Classification | Action |",
        "| --- | --- | --- | --- | --- | --- |"
    ];
    audit.records.forEach((record) => {
        lines.push(`| ${record.characterName} (${record.characterId}) | ${record.sourceName || record.sourceId} | ${record.modifierId} | ${record.category} | ${record.classification} | ${record.action} |`);
    });
    return `${lines.join("\n")}\n`;
}

if (require.main === module) {
    const audit = buildAudit();
    process.stdout.write(renderMarkdown(audit));
}

module.exports = {
    VALUE_KEYS,
    buildAudit,
    classify,
    hasValueSource,
    renderMarkdown,
    representedByTalentScalings
};
