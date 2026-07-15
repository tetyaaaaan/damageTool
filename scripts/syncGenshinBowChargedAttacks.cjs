"use strict";

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const repositoryRoot = path.resolve(__dirname, "..");
const targetPath = path.join(repositoryRoot, "games/genshin/data/calc/talent-scalings.json");
const API_ROOT = "https://genshin-db-api.vercel.app/api/v5/talents";

// The source parameter positions are deliberately pinned. This makes upstream
// label changes visible instead of silently attaching the wrong multiplier.
const BOW_CHARACTERS = {
    "10000021": { query: "Amber", aimed: "param6", charged: "param7" },
    "10000022": { query: "Venti", aimed: "param7", charged: "param8" },
    "10000031": { query: "Fischl", aimed: "param6", charged: "param7" },
    "10000033": { query: "Tartaglia", aimed: "param7", charged: "param8" },
    "10000037": { query: "Ganyu", aimed: "param7", charged: "param8", levelOne: true },
    "10000039": { query: "Diona", aimed: "param7", charged: "param8" },
    "10000049": { query: "Yoimiya", aimed: "param6", charged: "param7" },
    "10000055": { query: "Gorou", aimed: "param5", charged: "param6" },
    "10000056": { query: "Kujou Sara", aimed: "param6", charged: "param7" },
    "10000060": { query: "Yelan", aimed: "param5", charged: "param6" },
    "10000062": { query: "Aloy", aimed: "param6", charged: "param7" },
    "10000067": { query: "Collei", aimed: "param5", charged: "param6" },
    "10000069": { query: "Tighnari", aimed: "param5", charged: "param6", levelOne: true },
    "10000076": { query: "Faruzan", aimed: "param5", charged: "param6" },
    "10000084": { query: "Lyney", aimed: "param9", charged: "param10", chargedFormat: "F1P", levelOne: true },
    "10000095": { query: "Sigewinne", aimed: "param7", charged: "param8", chargedFormat: "F1P" },
    "10000097": { query: "Sethos", aimed: "param5", charged: "param6", chargedFormat: "F1P", levelOne: true },
    "10000104": { query: "Chasca", aimed: "param5", charged: "param6" },
    "10000105": { query: "Ororon", aimed: "param4", charged: "param5" },
    "10000124": { query: "Jahoda", aimed: "param4", charged: "param5" },
    "10000130": { query: "Linnea", aimed: "param4", charged: "param5" }
};

const CHARGED_DERIVED_ENTRIES = {
    "10000037": ["damage", "damage_2"],
    "10000049": ["damage"],
    "10000060": ["damage"],
    "10000069": ["damage", "damage_2"],
    "10000084": ["damage", "damage_2", "damage_3"],
    "10000095": ["damage"],
    "10000097": ["damage"]
};

function valuesByLevel(values) {
    if (!Array.isArray(values) || values.length < 15) throw new Error("Expected 15 talent levels");
    return Object.fromEntries(values.slice(0, 15).map((value, index) => [
        String(index + 1),
        Number((Number(value) * 100).toFixed(4))
    ]));
}

function createEntry(id, label, param, values, element, stage, format) {
    return {
        id,
        label,
        attackType: "chargedAttack",
        damageType: "charged",
        element,
        chargedAttackStage: stage,
        hitCount: 1,
        levelSource: "normalAttack",
        source: { oss: "genshin-db", talentKey: "combat1", param, format },
        scalings: [{ stat: "atk", valuesByLevel: valuesByLevel(values) }]
    };
}

async function fetchTalent(query) {
    const response = await fetch(`${API_ROOT}?query=${encodeURIComponent(query)}&resultLanguage=English`);
    if (!response.ok) throw new Error(`${query}: HTTP ${response.status}`);
    return response.json();
}

function characterRange(source, characterId) {
    const start = source.indexOf(`  "${characterId}": {`);
    if (start < 0) throw new Error(`${characterId}: character block is missing`);
    const next = source.slice(start + 1).search(/\n  "\d+": \{/);
    return [start, next < 0 ? source.length : start + 1 + next];
}

function matchingBrace(source, start) {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
        const char = source[index];
        if (quoted) {
            if (escaped) escaped = false;
            else if (char === "\\") escaped = true;
            else if (char === "\"") quoted = false;
            continue;
        }
        if (char === "\"") quoted = true;
        else if (char === "{") depth += 1;
        else if (char === "}" && --depth === 0) return index;
    }
    throw new Error("Unterminated JSON object");
}

function entryBounds(source, characterId, entryId) {
    const [start, end] = characterRange(source, characterId);
    const token = `"id": "${entryId}"`;
    const idIndex = source.indexOf(token, start);
    if (idIndex < 0 || idIndex >= end) return null;
    const objectStart = source.lastIndexOf("\n        {", idIndex) + 1;
    return [objectStart, matchingBrace(source, objectStart) + 1];
}

function removeEntry(source, characterId, entryId) {
    const bounds = entryBounds(source, characterId, entryId);
    if (!bounds) return source;
    const [start, end] = bounds;
    if (source.slice(end, end + 3) === ",\r\n") return source.slice(0, start) + source.slice(end + 3);
    if (source.slice(end, end + 2) === ",\n") return source.slice(0, start) + source.slice(end + 2);
    const comma = source.lastIndexOf(",", start);
    return source.slice(0, comma) + source.slice(end);
}

function renderEntry(entry) {
    return JSON.stringify(entry, null, 2).split("\n").map((line) => `        ${line}`).join("\n");
}

function insertAfterEntry(source, characterId, entryId, entries) {
    const bounds = entryBounds(source, characterId, entryId);
    if (!bounds) throw new Error(`${characterId}.${entryId}: insertion anchor is missing`);
    const end = bounds[1];
    return `${source.slice(0, end)},\n${entries.map(renderEntry).join(",\n")}${source.slice(end)}`;
}

function markDerivedCharged(source, characterId, entryId) {
    const bounds = entryBounds(source, characterId, entryId);
    if (!bounds) throw new Error(`${characterId}.${entryId}: derived entry is missing`);
    const [start, end] = bounds;
    let entry = source.slice(start, end)
        .replace(/"attackType": "[^"]+"/, '"attackType": "chargedAttack"')
        .replace(/"damageType": "[^"]+"/, '"damageType": "charged"')
        .replace(/"element": "[^"]+"/, '"element": "ownElement"');
    if (!entry.includes('"chargedAttackStage"')) {
        entry = entry.replace('"element": "ownElement",', '"element": "ownElement",\n          "chargedAttackStage": "derived",');
    }
    return source.slice(0, start) + entry + source.slice(end);
}

async function main() {
    let source = process.argv.includes("--from-head")
        ? childProcess.execFileSync("git", ["show", "HEAD:games/genshin/data/calc/talent-scalings.json"], {
            encoding: "utf8",
            maxBuffer: 8 * 1024 * 1024
        })
        : fs.readFileSync(targetPath, "utf8");
    source = removeEntry(removeEntry(source, "10000123", "aimed_shot"), "10000123", "fully_charged_aimed_shot");
    for (const [characterId, spec] of Object.entries(BOW_CHARACTERS)) {
        const talent = await fetchTalent(spec.query);
        const parameters = talent?.combat1?.attributes?.parameters || {};
        const aimedValues = parameters[spec.aimed];
        const chargedValues = parameters[spec.charged];
        if (!aimedValues || !chargedValues) throw new Error(`${spec.query}: missing ${spec.aimed}/${spec.charged}`);

        const data = JSON.parse(source);
        const normal = data[characterId]?.normalAttack;
        if (!normal?.entries) throw new Error(`${spec.query}: normal attack group is missing`);
        const entries = [
            createEntry("aimed_shot", "狙い撃ち", spec.aimed, aimedValues, "physical", "aimed", "F1P"),
            createEntry(
                "fully_charged_aimed_shot",
                spec.levelOne ? "狙い撃ち・1段チャージ" : "フルチャージ狙い撃ち",
                spec.charged,
                chargedValues,
                "ownElement",
                "fullyCharged",
                spec.chargedFormat || "P"
            )
        ];
        source = removeEntry(removeEntry(source, characterId, "aimed_shot"), characterId, "fully_charged_aimed_shot");
        const lastNormalId = normal.entries.filter((entry) => /^normal_/.test(entry.id)).at(-1)?.id;
        source = insertAfterEntry(source, characterId, lastNormalId, entries);
        (CHARGED_DERIVED_ENTRIES[characterId] || []).forEach((entryId) => {
            source = markDerivedCharged(source, characterId, entryId);
        });
    }
    JSON.parse(source);
    fs.writeFileSync(targetPath, source.endsWith("\n") ? source : `${source}\n`, "utf8");
    process.stdout.write(`Updated ${Object.keys(BOW_CHARACTERS).length} bow characters.\n`);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = { BOW_CHARACTERS, CHARGED_DERIVED_ENTRIES, createEntry, valuesByLevel };
