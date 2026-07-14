"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repositoryRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const calcRoot = path.join(dataRoot, "calc");
const registryPath = path.join(calcRoot, "constellation-effect-registry.json");
const sourceIndexPath = path.join(calcRoot, "constellation-source-index.json");
const reportJsonPath = path.join(repositoryRoot, "reports", "genshin-constellation-audit.json");
const reportMarkdownPath = path.join(repositoryRoot, "reports", "genshin-constellation-audit.md");

const NUMERIC_CATEGORIES = new Set([
    "additiveBaseDamage", "critBonus", "damageBonus", "defenseDebuff", "defenseIgnore",
    "extraDamage", "healingBonus", "reactionBonus", "reactionCritBonus", "resistanceDebuff",
    "scalingBonus", "statBonus", "statConversion", "talentLevelBonus"
]);

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function normalizeName(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function gitRevision(root) {
    if (!root || !fs.existsSync(root)) return "";
    try {
        return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    } catch {
        return "";
    }
}

function walkFiles(root, fileName, result = []) {
    if (!root || !fs.existsSync(root)) return result;
    fs.readdirSync(root, { withFileTypes: true }).forEach((entry) => {
        const absolute = path.join(root, entry.name);
        if (entry.isDirectory()) walkFiles(absolute, fileName, result);
        else if (entry.name === fileName) result.push(absolute);
    });
    return result;
}

function parseGcsimCharacters(root) {
    const base = path.join(root || "", "internal", "characters");
    const result = {};
    walkFiles(base, "config.yml").forEach((file) => {
        const text = fs.readFileSync(file, "utf8");
        const id = text.match(/^genshin_id:\s*(\d+)/m)?.[1];
        const key = text.match(/^key:\s*([^\s#]+)/m)?.[1] || text.match(/^package_name:\s*([^\s#]+)/m)?.[1];
        if (!id || !key) return;
        const directory = path.dirname(file);
        const relative = path.relative(root, directory).replace(/\\/g, "/");
        const consFile = path.join(directory, "cons.go");
        result[id] = {
            key,
            path: relative,
            constellationPath: fs.existsSync(consFile) ? `${relative}/cons.go` : "",
            source: fs.existsSync(consFile) ? fs.readFileSync(consFile, "utf8") : ""
        };
    });
    return result;
}

function matchGoKey(gcsimKey, goKeys) {
    const key = normalizeName(gcsimKey);
    const exact = goKeys.find((candidate) => normalizeName(candidate) === key);
    if (exact) return exact;
    const suffixMatches = goKeys.filter((candidate) => {
        const normalized = normalizeName(candidate);
        return normalized.endsWith(key) || normalized.startsWith(key) || key.endsWith(normalized);
    });
    return suffixMatches.sort((a, b) => normalizeName(a).length - normalizeName(b).length)[0] || "";
}

function parseGoCharacters(root, gcsimCharacters) {
    const statsRoot = path.join(root || "", "libs", "gi", "stats", "Data", "Characters");
    const sheetRoot = path.join(root || "", "libs", "gi", "sheets", "src", "Characters");
    if (!fs.existsSync(statsRoot)) return {};
    const goKeys = fs.readdirSync(statsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    const result = {};
    Object.entries(gcsimCharacters).forEach(([id, gcsim]) => {
        const key = matchGoKey(gcsim.key, goKeys);
        if (!key) return;
        const skillParamPath = path.join(statsRoot, key, "skillParam.json");
        const sheetPath = path.join(sheetRoot, key, "index.tsx");
        result[id] = {
            key,
            path: `libs/gi/sheets/src/Characters/${key}/index.tsx`,
            skillParamPath: `libs/gi/stats/Data/Characters/${key}/skillParam.json`,
            source: `${fs.existsSync(sheetPath) ? fs.readFileSync(sheetPath, "utf8") : ""}\n${fs.existsSync(skillParamPath) ? fs.readFileSync(skillParamPath, "utf8") : ""}`
        };
    });
    return result;
}

function numericValues(modifier) {
    const result = [];
    const add = (value, field) => {
        const number = Number(value);
        if (value !== null && value !== "" && Number.isFinite(number)) result.push({ field, value: number });
    };
    add(modifier.value, "value");
    add(modifier.valuePerStack, "valuePerStack");
    add(modifier.valuePerGeneratedStack, "valuePerGeneratedStack");
    add(modifier.valuePerConsumedStack, "valuePerConsumedStack");
    add(modifier.valuePerExcessStack, "valuePerExcessStack");
    add(modifier.valuePer1000, "valuePer1000");
    add(modifier.critRate, "critRate");
    add(modifier.critDamage, "critDamage");
    add(modifier.ratio, "ratio");
    add(modifier.cap, "cap");
    add(modifier.maxValue, "maxValue");
    add(modifier.effectMultiplier, "effectMultiplier");
    add(modifier.effectMultiplierPercent, "effectMultiplierPercent");
    Object.entries(modifier.valueByCondition || {}).forEach(([key, value]) => add(value, `valueByCondition.${key}`));
    Object.entries(modifier.valueByStack || {}).forEach(([key, value]) => add(value, `valueByStack.${key}`));
    (modifier.scalings || []).forEach((scaling, index) => {
        add(scaling.value, `scalings.${index}.value`);
        add(scaling.valuePerStack, `scalings.${index}.valuePerStack`);
    });
    return result;
}

function escapedNumber(value) {
    return String(Math.abs(value)).replace(/\.0+$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textContainsValue(text, value, unit) {
    const abs = Math.abs(Number(value));
    if (!Number.isFinite(abs)) return false;
    const token = escapedNumber(abs);
    const normalized = String(text || "").replace(/,/g, "");
    if (["percent", "percentOfReference", "percentOfOriginalDamage", "percentOfOriginalEffect"].includes(unit)) {
        return new RegExp(`${token}\\s*%`).test(normalized);
    }
    return new RegExp(`(^|[^0-9.])${token}([^0-9.]|$)`).test(normalized);
}

function sourceContainsValue(text, value, unit) {
    const abs = Math.abs(Number(value));
    if (!Number.isFinite(abs) || abs < 2) return false;
    const candidates = [abs];
    if (unit === "percent") candidates.push(abs / 100);
    return candidates.some((candidate) => {
        const token = escapedNumber(candidate);
        return new RegExp(`(^|[^0-9.])[-+]?${token}([^0-9.]|$)`).test(String(text || ""));
    });
}

function sourceNumericTokens(text) {
    return [...new Set((String(text || "").match(/[-+]?\d+(?:\.\d+)?/g) || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
}

function tokensContainValue(tokens, value, unit) {
    const abs = Math.abs(Number(value));
    if (!Number.isFinite(abs) || abs < 2) return false;
    const candidates = [abs, -abs];
    if (unit === "percent") candidates.push(abs / 100, -abs / 100);
    return candidates.some((candidate) => (tokens || []).some((token) => Math.abs(Number(token) - candidate) < 1e-9));
}

function buildSourceIndex({ goRoot = "", gcsimRoot = "" } = {}) {
    if (!goRoot && !gcsimRoot && fs.existsSync(sourceIndexPath)) return readJson(sourceIndexPath);
    const gcsim = parseGcsimCharacters(gcsimRoot);
    const go = parseGoCharacters(goRoot, gcsim);
    const characterIds = new Set([...Object.keys(gcsim), ...Object.keys(go)]);
    const characters = {};
    characterIds.forEach((id) => {
        characters[id] = {
            genshinOptimizer: go[id] ? {
                key: go[id].key,
                path: go[id].path,
                skillParamPath: go[id].skillParamPath,
                numericTokens: sourceNumericTokens(go[id].source)
            } : null,
            gcsim: gcsim[id] ? {
                key: gcsim[id].key,
                path: gcsim[id].path,
                constellationPath: gcsim[id].constellationPath,
                numericTokens: sourceNumericTokens(gcsim[id].source)
            } : null
        };
    });
    return {
        projects: {
            genshinOptimizer: { repository: "https://github.com/frzyc/genshin-optimizer", revision: gitRevision(goRoot), license: "MIT" },
            gcsim: { repository: "https://github.com/genshinsim/gcsim", revision: gitRevision(gcsimRoot), license: "MIT" }
        },
        characters,
        _sources: { go, gcsim }
    };
}

function buildRegistry({ sourceIndex = null, goRoot = "", gcsimRoot = "" } = {}) {
    const characters = readJson(path.join(dataRoot, "characters.json"));
    const descriptions = readJson(path.join(dataRoot, "character-constellations.json"));
    const modifiers = readJson(path.join(calcRoot, "constellation-modifiers.json"));
    const index = sourceIndex || buildSourceIndex({ goRoot, gcsimRoot });
    const liveSources = index._sources || {
        go: parseGoCharacters(goRoot, parseGcsimCharacters(gcsimRoot)),
        gcsim: parseGcsimCharacters(gcsimRoot)
    };
    const effectsById = {};
    const registryCharacters = {};
    const issues = [];

    Object.keys(characters).sort().forEach((characterId) => {
        const levels = {};
        for (let level = 1; level <= 6; level += 1) {
            const description = descriptions[characterId]?.constellations?.[String(level)] || {};
            const levelModifiers = modifiers[characterId]?.constellations?.[String(level)] || [];
            const effects = levelModifiers.map((modifier, effectIndex) => {
                const values = numericValues(modifier);
                const requiresValue = NUMERIC_CATEGORIES.has(modifier.category);
                const hasValue = values.length > 0
                    || Array.isArray(modifier.scalings)
                    || modifier.reference?.type === "healingRecorded"
                    || ["displayOnlyMisclassification", "sourceContextRequired", "supersededByStructuredRecord"].includes(modifier.auditDisposition);
                const primaryValue = values.find((item) => item.field === "value");
                const textMatch = !primaryValue || textContainsValue(description.effectText, primaryValue.value, modifier.unit);
                const goSource = liveSources.go?.[characterId]?.source || "";
                const gcsimSource = liveSources.gcsim?.[characterId]?.source || "";
                const goTokens = index.characters?.[characterId]?.genshinOptimizer?.numericTokens || [];
                const gcsimTokens = index.characters?.[characterId]?.gcsim?.numericTokens || [];
                const externalMatches = primaryValue ? [
                    (sourceContainsValue(goSource, primaryValue.value, modifier.unit) || tokensContainValue(goTokens, primaryValue.value, modifier.unit)) ? "genshinOptimizer" : "",
                    (sourceContainsValue(gcsimSource, primaryValue.value, modifier.unit) || tokensContainValue(gcsimTokens, primaryValue.value, modifier.unit)) ? "gcsim" : ""
                ].filter(Boolean) : [];
                let verificationStatus = "manualReview";
                if (["displayOnlyMisclassification", "supersededByStructuredRecord"].includes(modifier.auditDisposition)) verificationStatus = "quarantined";
                else if (modifier.auditDisposition === "sourceContextRequired") verificationStatus = "sourceContextRequired";
                else if (!requiresValue) verificationStatus = "mechanicOnly";
                else if (!hasValue) verificationStatus = "missingNumericContract";
                else if (!textMatch) verificationStatus = "sourceMismatch";
                else if (externalMatches.length) verificationStatus = "corroborated";
                else verificationStatus = "textVerified";
                const effectId = modifier.id || `c_${characterId}_${level}_${effectIndex + 1}`;
                const effect = {
                    id: effectId,
                    category: modifier.category,
                    targets: modifier.applyTo || [],
                    condition: modifier.condition || "always",
                    unit: modifier.unit || "",
                    numericValues: values,
                    requiresNumericValue: requiresValue,
                    hasNumericContract: hasValue,
                    verificationStatus,
                    evidence: {
                        officialTextValueMatch: textMatch,
                        externalNumericHints: externalMatches
                    }
                };
                effectsById[effectId] = { characterId, constellation: level, ...effect };
                if (["sourceMismatch", "missingNumericContract"].includes(verificationStatus)) {
                    issues.push({ characterId, characterName: characters[characterId].nameJa, constellation: level, effectId, category: modifier.category, verificationStatus });
                }
                return effect;
            });
            levels[String(level)] = {
                nameJa: description.nameJa || "",
                effectText: description.effectText || "",
                effects,
                classification: effects.length ? "calculationEffectsPresent" : "noRegisteredCalculationEffect"
            };
        }
        const compactSources = Object.fromEntries(Object.entries(index.characters?.[characterId] || {}).map(([project, source]) => {
            if (!source) return [project, null];
            const { numericTokens, ...reference } = source;
            return [project, reference];
        }));
        registryCharacters[characterId] = {
            nameJa: characters[characterId].nameJa,
            sources: Object.keys(compactSources).length ? compactSources : { genshinOptimizer: null, gcsim: null },
            constellations: levels
        };
    });

    const statuses = {};
    Object.values(effectsById).forEach((effect) => {
        statuses[effect.verificationStatus] = (statuses[effect.verificationStatus] || 0) + 1;
    });
    return {
        schemaVersion: 1,
        generatedFrom: ["characters.json", "character-constellations.json", "calc/constellation-modifiers.json"],
        externalProjects: index.projects,
        summary: {
            characters: Object.keys(registryCharacters).length,
            constellationLevels: Object.keys(registryCharacters).length * 6,
            effects: Object.keys(effectsById).length,
            byVerificationStatus: statuses,
            issues: issues.length
        },
        characters: registryCharacters,
        effectsById,
        issues
    };
}

function renderMarkdown(registry) {
    const rows = registry.issues.map((issue) => `| ${issue.characterName} | C${issue.constellation} | \`${issue.effectId}\` | \`${issue.category}\` | \`${issue.verificationStatus}\` |`);
    return [
        "# 原神 命ノ星座効果監査",
        "",
        "命ノ星座の計算効果を、公式効果文中の数値と外部OSS実装の参照情報付きで監査します。外部照合は数値候補の存在確認であり、単独では正しさの根拠にしません。",
        "",
        `- キャラクター: ${registry.summary.characters}`,
        `- C1〜C6: ${registry.summary.constellationLevels}`,
        `- 計算効果: ${registry.summary.effects}`,
        `- 要確認: ${registry.summary.issues}`,
        "",
        "## 検証状態",
        "",
        ...Object.entries(registry.summary.byVerificationStatus).sort().map(([status, count]) => `- \`${status}\`: ${count}`),
        "",
        "## 要確認効果",
        "",
        "| キャラクター | 星座 | effectId | category | status |",
        "| --- | ---: | --- | --- | --- |",
        ...rows,
        ""
    ].join("\n");
}

function serializableSourceIndex(index) {
    const { _sources, ...rest } = index;
    return rest;
}

function writeOutputs(options = {}) {
    const sourceIndex = buildSourceIndex(options);
    const registry = buildRegistry({ ...options, sourceIndex });
    fs.mkdirSync(path.dirname(reportJsonPath), { recursive: true });
    fs.writeFileSync(sourceIndexPath, `${JSON.stringify(serializableSourceIndex(sourceIndex), null, 2)}\n`);
    fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
    fs.writeFileSync(reportJsonPath, `${JSON.stringify({ summary: registry.summary, issues: registry.issues }, null, 2)}\n`);
    fs.writeFileSync(reportMarkdownPath, renderMarkdown(registry));
    return registry;
}

if (require.main === module) {
    const goRoot = process.env.GENSHIN_OPTIMIZER_ROOT || "";
    const gcsimRoot = process.env.GCSIM_ROOT || "";
    const registry = writeOutputs({ goRoot, gcsimRoot });
    console.log(JSON.stringify(registry.summary, null, 2));
}

module.exports = { buildRegistry, buildSourceIndex, renderMarkdown, writeOutputs };
