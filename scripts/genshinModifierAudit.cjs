"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repositoryRoot = path.resolve(__dirname, "..");
const calcDataDirectory = path.join(repositoryRoot, "games", "genshin", "data", "calc");
const modifierFiles = [
    "artifact-set-modifiers.json",
    "constellation-modifiers.json",
    "talent-modifiers.json",
    "weapon-modifiers.json"
];

function loadAnalyzer() {
    const sandbox = { console };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    const source = fs.readFileSync(path.join(repositoryRoot, "games", "js", "genshinModifierAnalyzer.js"), "utf8");
    vm.runInContext(source, sandbox, { filename: "genshinModifierAnalyzer.js" });
    return sandbox.GenshinModifierAnalyzer;
}

function priorityFor(record) {
    if (["includedInUidStats", "includedInUidTalentLevels"].includes(record.uidHandling)) return "P4";
    if (record.reasonCode.startsWith("CATEGORY_MISCLASSIFIED")) return "P0";
    if (["MISSING_VALUE", "MISSING_REFERENCE", "MISSING_TARGET", "INVALID_DATA", "INVALID_STAT_CONTRACT"].includes(record.reasonCode)) return "P1";
    if (/FORMULA_REQUIRED|CUSTOM_UNIT_REQUIRED/.test(record.reasonCode)) return "P2";
    if (/INPUT_REQUIRED/.test(record.reasonCode)) return "P3";
    if (/DISPLAY|SUPERSEDED/.test(record.reasonCode)) return "P4";
    return record.calculable ? "DONE" : "P2";
}

function implementationLane(record) {
    if (["includedInUidStats", "includedInUidTalentLevels"].includes(record.uidHandling)) return "includedInput";
    if (record.reasonCode.startsWith("CATEGORY_MISCLASSIFIED")) return "categoryFix";
    if (/^MISSING_|^INVALID_/.test(record.reasonCode)) return "dataFix";
    if (/FORMULA_REQUIRED|CUSTOM_UNIT_REQUIRED/.test(record.reasonCode)) return "formula";
    if (/INPUT_REQUIRED/.test(record.reasonCode)) return "input";
    if (/DISPLAY|SUPERSEDED/.test(record.reasonCode)) return "displayOnly";
    return record.calculable ? "supported" : "formula";
}

function increment(target, key) {
    target[key] = (target[key] || 0) + 1;
}

function buildAudit() {
    const analyzer = loadAnalyzer();
    const records = [];

    function walk(value, file, jsonPath) {
        if (Array.isArray(value)) {
            value.forEach((item, index) => walk(item, file, `${jsonPath}[${index}]`));
            return;
        }
        if (!value || typeof value !== "object") return;
        if (value.category) {
            const source = `${file}:${jsonPath}`;
            const analysis = analyzer.analyzeModifier({ modifier: value, source, context: { mode: "audit" } });
            const record = {
                file,
                jsonPath,
                source,
                id: value.id || "",
                effectGroupKey: analysis.effectGroupKey,
                category: value.category,
                calculation: analysis.calculation,
                calculable: analysis.calculable,
                supportStatus: analysis.supportStatus,
                reasonCode: analysis.reasonCode,
                reason: analysis.reason,
                requiredInputs: Array.from(analysis.requiredInputs || []),
                missingInputs: Array.from(analysis.missingInputs || []),
                inputStatus: analysis.inputStatus,
                uidHandling: analysis.uidHandling
            };
            record.priority = priorityFor(record);
            record.lane = implementationLane(record);
            records.push(record);
        }
        Object.entries(value).forEach(([key, item]) => walk(item, file, jsonPath ? `${jsonPath}.${key}` : key));
    }

    modifierFiles.forEach((file) => {
        const data = JSON.parse(fs.readFileSync(path.join(calcDataDirectory, file), "utf8"));
        walk(data, file, "$");
    });

    records.sort((a, b) => {
        return a.priority.localeCompare(b.priority)
            || a.category.localeCompare(b.category)
            || a.source.localeCompare(b.source);
    });
    const summary = {
        total: records.length,
        calculable: records.filter((record) => record.calculable).length,
        byCategory: {},
        bySupportStatus: {},
        byReasonCode: {},
        byPriority: {},
        byLane: {}
    };
    records.forEach((record) => {
        increment(summary.byCategory, record.category);
        increment(summary.bySupportStatus, record.supportStatus);
        increment(summary.byReasonCode, record.reasonCode || "SUPPORTED");
        increment(summary.byPriority, record.priority);
        increment(summary.byLane, record.lane);
    });
    return { generatedFrom: modifierFiles, summary, records };
}

function markdownTable(map, firstColumn) {
    const rows = Object.entries(map).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return [
        `| ${firstColumn} | count |`,
        "| --- | ---: |",
        ...rows.map(([key, count]) => `| \`${key}\` | ${count} |`)
    ].join("\n");
}

function renderMarkdown(audit) {
    const actionable = audit.records.filter((record) => ["P0", "P1", "P2"].includes(record.priority));
    return [
        "# 原神補正監査レポート",
        "",
        "このファイルは `node scripts/genshinModifierAudit.cjs` で再生成します。",
        "",
        `- 全補正: ${audit.summary.total}`,
        `- 数式対応可能: ${audit.summary.calculable}`,
        `- 実装修正候補（P0〜P2）: ${actionable.length}`,
        "",
        "## supportStatus",
        "",
        markdownTable(audit.summary.bySupportStatus, "status"),
        "",
        "## reasonCode",
        "",
        markdownTable(audit.summary.byReasonCode, "reasonCode"),
        "",
        "## 実装レーン",
        "",
        markdownTable(audit.summary.byLane, "lane"),
        "",
        "## P0・P1候補",
        "",
        "| priority | category | reasonCode | id | source |",
        "| --- | --- | --- | --- | --- |",
        ...actionable.filter((record) => ["P0", "P1"].includes(record.priority)).map((record) => {
            return `| ${record.priority} | \`${record.category}\` | \`${record.reasonCode}\` | \`${record.id || "-"}\` | \`${record.source}\` |`;
        }),
        ""
    ].join("\n");
}

function writeAudit(audit = buildAudit()) {
    const reportDirectory = path.join(repositoryRoot, "reports");
    fs.mkdirSync(reportDirectory, { recursive: true });
    fs.writeFileSync(path.join(reportDirectory, "genshin-modifier-audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
    fs.writeFileSync(path.join(reportDirectory, "genshin-modifier-audit.md"), renderMarkdown(audit));
    return audit;
}

if (require.main === module) {
    const audit = writeAudit();
    console.log(JSON.stringify(audit.summary, null, 2));
}

module.exports = { buildAudit, implementationLane, priorityFor, renderMarkdown, writeAudit };
