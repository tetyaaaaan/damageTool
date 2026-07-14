"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");
const calcDirectory = path.join(repositoryRoot, "games", "genshin", "data", "calc");
const modifierFiles = [
    "artifact-set-modifiers.json",
    "constellation-modifiers.json",
    "talent-modifiers.json",
    "weapon-modifiers.json"
];

function readJson(file) {
    return JSON.parse(fs.readFileSync(path.join(calcDirectory, file), "utf8"));
}

function reactionIds(definitions) {
    return [...new Set(Object.values(definitions.options || {}).map((option) => option.reactionId))];
}

function targetScope(target, definitions) {
    const ids = reactionIds(definitions);
    if (target === "reactionDamageBonus" || target === "reactionCrit") return ids.filter((id) => id !== "none");
    if (target === "moonReactionDamageBonus") {
        return ["lunarBloom", "lunarCharged", "lunarCrystallize"];
    }
    const aliases = {
        overloaded: "overload",
        astralConduction: "stellarConduct",
        lunarSuperconduct: "stellarConduct"
    };
    const base = String(target).replace(/(?:Reaction)?DamageBonus$|Crit$/u, "");
    const id = aliases[base] || base;
    return ids.includes(id) ? [id] : [];
}

function buildAudit() {
    const definitions = readJson("reaction-definitions.json");
    const records = [];
    function walk(value, file, jsonPath) {
        if (Array.isArray(value)) {
            value.forEach((item, index) => walk(item, file, `${jsonPath}[${index}]`));
            return;
        }
        if (!value || typeof value !== "object") return;
        if (["reactionBonus", "reactionCritBonus"].includes(value.category)) {
            const targets = value.applyTo || [];
            const resolvedReactionIds = [...new Set(targets.flatMap((target) => targetScope(target, definitions)))];
            records.push({
                file,
                jsonPath,
                id: value.id || "",
                category: value.category,
                targets,
                resolvedReactionIds,
                resolution: resolvedReactionIds.length ? "resolved" : "unresolved",
                calculationStatuses: [...new Set(resolvedReactionIds.map((id) => {
                    return Object.values(definitions.options).find((option) => option.reactionId === id)?.calculationStatus || "unknown";
                }))]
            });
        }
        Object.entries(value).forEach(([key, child]) => walk(child, file, `${jsonPath}.${key}`));
    }
    modifierFiles.forEach((file) => walk(readJson(file), file, "$"));
    return {
        generatedFrom: [...modifierFiles, "reaction-definitions.json"],
        summary: {
            total: records.length,
            reactionBonus: records.filter((record) => record.category === "reactionBonus").length,
            reactionCritBonus: records.filter((record) => record.category === "reactionCritBonus").length,
            resolved: records.filter((record) => record.resolution === "resolved").length,
            unresolved: records.filter((record) => record.resolution === "unresolved").length,
            dedicatedFormulaRecords: records.filter((record) => record.calculationStatuses.includes("dedicatedFormulaRequired")).length
        },
        records
    };
}

function renderMarkdown(audit) {
    const lines = [
        "# Genshin reaction modifier audit",
        "",
        `- Total: ${audit.summary.total}`,
        `- Reaction damage bonus: ${audit.summary.reactionBonus}`,
        `- Reaction critical bonus: ${audit.summary.reactionCritBonus}`,
        `- Resolved target scope: ${audit.summary.resolved}`,
        `- Unresolved target scope: ${audit.summary.unresolved}`,
        `- Dedicated-formula records: ${audit.summary.dedicatedFormulaRecords}`,
        "",
        "| File | Modifier | Category | Targets | Resolved reactions | Status |",
        "| --- | --- | --- | --- | --- | --- |"
    ];
    audit.records.forEach((record) => {
        lines.push(`| ${record.file} | ${record.id || record.jsonPath} | ${record.category} | ${record.targets.join(", ")} | ${record.resolvedReactionIds.join(", ")} | ${record.resolution} |`);
    });
    return `${lines.join("\n")}\n`;
}

function writeAudit(audit = buildAudit()) {
    const reportDirectory = path.join(repositoryRoot, "reports");
    fs.mkdirSync(reportDirectory, { recursive: true });
    fs.writeFileSync(path.join(reportDirectory, "genshin-reaction-audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
    fs.writeFileSync(path.join(reportDirectory, "genshin-reaction-audit.md"), renderMarkdown(audit));
    return audit;
}

if (require.main === module) writeAudit();

module.exports = { buildAudit, renderMarkdown, targetScope, writeAudit };
