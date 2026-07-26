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
    if (record.reasonCode === "SOURCE_CONTEXT_REQUIRED" || record.sourceContextRequired) return "P4";
    if (record.reasonCode === "DEDICATED_FORMULA_DEFERRED") return "P3";
    if (record.inputImplemented) return "DONE";
    if (record.uidHandling === "special" && /FORMULA_REQUIRED/.test(record.reasonCode)) return "P4";
    if (record.reasonCode.startsWith("CATEGORY_MISCLASSIFIED")) return "P0";
    if (["MISSING_VALUE", "MISSING_REFERENCE", "MISSING_TARGET", "INVALID_DATA", "INVALID_STAT_CONTRACT"].includes(record.reasonCode)) return "P1";
    if (/FORMULA_REQUIRED|CUSTOM_UNIT_REQUIRED/.test(record.reasonCode)) return "P2";
    if (/INPUT_REQUIRED/.test(record.reasonCode)) return "P3";
    if (/DISPLAY|SUPERSEDED/.test(record.reasonCode)) return "P4";
    return record.calculable ? "DONE" : "P2";
}

function implementationLane(record) {
    if (["includedInUidStats", "includedInUidTalentLevels"].includes(record.uidHandling)) return "includedInput";
    if (record.reasonCode === "SOURCE_CONTEXT_REQUIRED" || record.sourceContextRequired) return "sourceData";
    if (record.reasonCode === "DEDICATED_FORMULA_DEFERRED") return "deferred";
    if (record.inputImplemented) return "interactiveInput";
    if (record.uidHandling === "special" && /FORMULA_REQUIRED/.test(record.reasonCode)) return "legacyCompat";
    if (record.reasonCode.startsWith("CATEGORY_MISCLASSIFIED")) return "categoryFix";
    if (/^MISSING_|^INVALID_/.test(record.reasonCode)) return "dataFix";
    if (/FORMULA_REQUIRED|CUSTOM_UNIT_REQUIRED/.test(record.reasonCode)) return "formula";
    if (/INPUT_REQUIRED/.test(record.reasonCode)) return "input";
    if (/DISPLAY|SUPERSEDED/.test(record.reasonCode)) return "displayOnly";
    return record.calculable ? "supported" : "formula";
}

function hasImplementedInputContract(modifier, analysis) {
    if (!/INPUT_REQUIRED/.test(String(analysis.reasonCode || ""))) return false;
    if (modifier.conditionInput?.type) return true;
    if (modifier.resource && analysis.resourceClassification === "calculationInput") return true;
    if (modifier.reference?.type === "healingRecorded") return true;
    if (["provider", "selfOrProvider"].includes(modifier.reference?.source)) return true;
    return (analysis.requiredInputs || []).every((key) => /^(?:recordedHealing|providerStats\.|resourceStates\.|conditionByModifier\.)/.test(key));
}

function schemaStatus(modifier) {
    const required = ["id", "category", "applyTo", "condition", "calculationSupport", "uidHandling"];
    return required.every((key) => modifier[key] !== undefined)
        && Array.isArray(modifier.applyTo)
        ? "canonical"
        : "legacyCompatible";
}

function increment(target, key) {
    target[key] = (target[key] || 0) + 1;
}

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function modifierSignature(modifier) {
    const valueKeys = [
        "value", "valueByLevel", "valueByRefinement", "valueByRefinementPerStack",
        "valueByStack", "valuePerStack", "ratio", "divisor", "maxValue", "scalings"
    ];
    const values = Object.fromEntries(valueKeys.filter((key) => modifier[key] !== undefined).map((key) => [key, modifier[key]]));
    return JSON.stringify(stableValue({
        category: modifier.category,
        applyTo: [...(modifier.applyTo || [])].sort(),
        targetGroups: [...(modifier.targetGroups || [])].sort(),
        targetEffect: modifier.targetEffect || null,
        condition: modifier.condition || "always",
        unit: modifier.unit || "",
        reference: modifier.reference || null,
        sourceText: modifier.sourceText || "",
        values
    }));
}

function buildAudit() {
    const analyzer = loadAnalyzer();
    const records = [];
    const duplicateCandidates = [];
    const contractViolations = [];

    function walk(value, file, jsonPath) {
        if (Array.isArray(value)) {
            const modifiers = value.filter((item) => item && typeof item === "object" && item.category);
            const bySignature = new Map();
            modifiers.forEach((modifier) => {
                const signature = modifierSignature(modifier);
                if (!bySignature.has(signature)) bySignature.set(signature, []);
                bySignature.get(signature).push(modifier);
            });
            bySignature.forEach((items, signature) => {
                if (items.length < 2) return;
                const groupIds = new Set(items.map((item) => item.effectGroupId).filter(Boolean));
                const controlled = items.some((item) => /superseded/i.test(String(item.auditDisposition || "")))
                    || (groupIds.size === 1 && items.every((item) => item.effectGroupId));
                duplicateCandidates.push({
                    file,
                    jsonPath,
                    modifierIds: items.map((item) => item.id || "anonymous"),
                    controlled,
                    signature
                });
            });
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
            record.inputImplemented = hasImplementedInputContract(value, analysis);
            record.schemaStatus = schemaStatus(value);
            record.sourceContextRequired = !record.id
                && ["CATEGORY_MISCLASSIFIED", "MISSING_VALUE", "MISSING_REFERENCE"].includes(record.reasonCode);
            record.priority = priorityFor(record);
            record.lane = implementationLane(record);
            records.push(record);
            if (value.calculationSupport === "stack" && !value.resource && value.stack
                && ["min", "max", "default"].some((key) => !Number.isFinite(Number(value.stack[key])))) {
                contractViolations.push({ file, jsonPath, id: value.id || "", reason: "STACK_RANGE_INCOMPLETE" });
            }
            if (value.conditionInput?.type === "stack") {
                const inputMin = Number(value.conditionInput.min);
                const inputMax = Number(value.conditionInput.max);
                if (!Number.isFinite(inputMin) || !Number.isFinite(inputMax) || inputMin > inputMax) {
                    contractViolations.push({ file, jsonPath, id: value.id || "", reason: "STACK_INPUT_RANGE_INCOMPLETE" });
                }
                if (value.stack) {
                    const stackMin = Number(value.stack.min);
                    const stackMax = Number(value.stack.max);
                    if (Number.isFinite(inputMin) && Number.isFinite(inputMax)
                        && Number.isFinite(stackMin) && Number.isFinite(stackMax)
                        && (inputMin !== stackMin || inputMax !== stackMax)) {
                        contractViolations.push({ file, jsonPath, id: value.id || "", reason: "STACK_INPUT_RANGE_MISMATCH" });
                    }
                }
            }
            if (value.customCalculation === "thresholdStatBonus"
                && (!value.reference?.stat || !Number.isFinite(Number(value.ratio)) || !Number.isFinite(Number(value.divisor)))) {
                contractViolations.push({ file, jsonPath, id: value.id || "", reason: "DYNAMIC_REFERENCE_INCOMPLETE" });
            }
            if (value.targetOwner && !["self", "team", "activeCharacter", "otherPartyMembers", "enemy"].includes(value.targetOwner)) {
                contractViolations.push({ file, jsonPath, id: value.id || "", reason: "TARGET_OWNER_INVALID" });
            }
            if (value.conditionInput?.type && !["option", "stack", "targetCount"].includes(value.conditionInput.type)) {
                contractViolations.push({ file, jsonPath, id: value.id || "", reason: "CONDITION_INPUT_TYPE_INVALID" });
            }
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
        byLane: {},
        bySchemaStatus: {}
    };
    records.forEach((record) => {
        increment(summary.byCategory, record.category);
        increment(summary.bySupportStatus, record.supportStatus);
        increment(summary.byReasonCode, record.reasonCode || "SUPPORTED");
        increment(summary.byPriority, record.priority);
        increment(summary.byLane, record.lane);
        increment(summary.bySchemaStatus, record.schemaStatus);
    });
    summary.exactDuplicateGroups = duplicateCandidates.length;
    summary.uncontrolledExactDuplicateGroups = duplicateCandidates.filter((item) => !item.controlled).length;
    summary.contractViolations = contractViolations.length;
    return { generatedFrom: modifierFiles, summary, duplicateCandidates, contractViolations, records };
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
        `- 完全一致の重複候補: ${audit.summary.exactDuplicateGroups}`,
        `- 未制御の完全一致重複: ${audit.summary.uncontrolledExactDuplicateGroups}`,
        `- データ契約違反: ${audit.summary.contractViolations}`,
        "",
        `- 入力契約実装済み: ${audit.records.filter((record) => record.inputImplemented).length}`,
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
        "## JSONスキーマ移行状況",
        "",
        markdownTable(audit.summary.bySchemaStatus, "schemaStatus"),
        "",
        "## P0 / P1 candidates",
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
