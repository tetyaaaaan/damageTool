"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8"));
}

function registryIndex(registry) {
    const index = new Map();
    Object.entries(registry?.weapons || {}).forEach(([weaponId, definition]) => {
        (definition.groups || []).forEach((group) => {
            (group.modifierIds || []).forEach((modifierId) => index.set(`${weaponId}:${modifierId}`, group));
        });
    });
    return index;
}

function fallbackPolicy(modifier) {
    if (["displayOnly", "manualOnly", "special"].includes(modifier.uidHandling)) return "displayOnly";
    if (modifier.uidHandling === "conditional") return modifier.calculationSupport === "stack" ? "stack" : "manual";
    if (modifier.uidHandling !== "includedInUidStats") return "calculate";
    const targets = modifier.applyTo || [];
    const inputStats = new Set(["atkPercent", "atkFlat", "hpPercent", "hpFlat", "defPercent", "defFlat", "elementalMastery", "energyRecharge"]);
    const inputCrit = new Set(["critRate", "critDamage"]);
    const inputDamage = new Set(["pyroDamageBonus", "hydroDamageBonus", "electroDamageBonus", "cryoDamageBonus", "anemoDamageBonus", "geoDamageBonus", "dendroDamageBonus", "physicalDamageBonus", "allElementDamageBonus", "ownElementDamageBonus"]);
    const dynamic = /(?:時|後|間|毎|状態|以下|以上|につき|1ポイント|1名いるごと|層|影響を受け|付着|命中|消費|解除|獲得|基づき|同じ場合|異なる|チームに|周囲のチーム|シールドが存在|命の契約を有|詠唱|叙唱|間奏曲|継続期間中|この効果により|「[^」]+」効果|元素爆発の会心|落下攻撃の会心|月反応ダメージの会心|さらに.*(?:会心|ダメージ))/.test(String(modifier.sourceText || ""));
    if (modifier.calculationSupport === "stack") return "stack";
    if (dynamic) return "manual";
    if (modifier.category === "statBonus" && targets.length && targets.every((target) => inputStats.has(target))) return "reflected";
    if (modifier.category === "critBonus" && targets.length && targets.every((target) => inputCrit.has(target))) return "reflected";
    if (modifier.category === "damageBonus" && targets.length && targets.every((target) => inputDamage.has(target))) return "reflected";
    return "calculate";
}

function buildAudit() {
    const weapons = readJson("games/genshin/data/weapons.json");
    const modifiers = readJson("games/genshin/data/calc/weapon-modifiers.json");
    const registry = readJson("games/genshin/data/calc/weapon-effect-registry.json");
    const index = registryIndex(registry);
    const records = [];
    const duplicateCandidates = [];

    Object.entries(modifiers).forEach(([weaponId, entry]) => {
        const byDescription = new Map();
        (entry.modifiers || []).forEach((modifier) => {
            const group = index.get(`${weaponId}:${modifier.id}`);
            const policy = group?.inputPolicy || fallbackPolicy(modifier);
            records.push({
                weaponId,
                weaponName: weapons[weaponId]?.nameJa || "",
                modifierId: modifier.id || "",
                structured: Boolean(group),
                effectGroupId: group?.id || "",
                effectName: group?.name || "",
                targetOwner: group?.targetOwner || "self",
                activationType: group?.activation?.type || (modifier.calculationSupport === "stack" ? "stack" : modifier.condition || "always"),
                inputPolicy: policy
            });
            const key = `${modifier.category}|${modifier.sourceText || ""}`;
            if (!modifier.sourceText) return;
            if (!byDescription.has(key)) byDescription.set(key, []);
            byDescription.get(key).push(modifier.id || "");
        });
        byDescription.forEach((modifierIds, key) => {
            if (modifierIds.length > 1) duplicateCandidates.push({ weaponId, key, modifierIds });
        });
    });

    const countBy = (field) => records.reduce((summary, record) => {
        const key = String(record[field]);
        summary[key] = (summary[key] || 0) + 1;
        return summary;
    }, {});
    return {
        summary: {
            weapons: Object.keys(modifiers).length,
            modifiers: records.length,
            structuredWeapons: Object.keys(registry.weapons || {}).length,
            structuredGroups: Object.values(registry.weapons || {}).reduce((sum, definition) => sum + (definition.groups || []).length, 0),
            structuredModifiers: records.filter((record) => record.structured).length,
            fallbackModifiers: records.filter((record) => !record.structured).length,
            duplicateCandidateGroups: duplicateCandidates.length,
            byInputPolicy: countBy("inputPolicy"),
            byTargetOwner: countBy("targetOwner")
        },
        records,
        duplicateCandidates
    };
}

function renderMarkdown(audit) {
    const policyRows = Object.entries(audit.summary.byInputPolicy).map(([key, value]) => `| \`${key}\` | ${value} |`);
    return [
        "# 原神 武器効果構造化監査",
        "",
        "このファイルは `node scripts/genshinWeaponEffectAudit.cjs` で再生成します。",
        "",
        `- 武器: ${audit.summary.weapons}`,
        `- 補正: ${audit.summary.modifiers}`,
        `- 構造化済み武器: ${audit.summary.structuredWeapons}`,
        `- 構造化済み効果グループ: ${audit.summary.structuredGroups}`,
        `- 構造化済み補正: ${audit.summary.structuredModifiers}`,
        `- フォールバック分類: ${audit.summary.fallbackModifiers}`,
        `- 同一説明・同一カテゴリの重複候補: ${audit.summary.duplicateCandidateGroups}`,
        "",
        "## 入力方針",
        "",
        "| policy | count |",
        "| --- | ---: |",
        ...policyRows,
        ""
    ].join("\n");
}

function writeAudit(audit = buildAudit()) {
    const reportDirectory = path.join(repositoryRoot, "reports");
    fs.mkdirSync(reportDirectory, { recursive: true });
    fs.writeFileSync(path.join(reportDirectory, "genshin-weapon-effect-audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
    fs.writeFileSync(path.join(reportDirectory, "genshin-weapon-effect-audit.md"), renderMarkdown(audit));
    return audit;
}

if (require.main === module) {
    process.stdout.write(`${JSON.stringify(writeAudit().summary, null, 2)}\n`);
}

module.exports = { buildAudit, fallbackPolicy, registryIndex, renderMarkdown, writeAudit };
