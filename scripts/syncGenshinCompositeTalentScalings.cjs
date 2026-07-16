"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");
const targetPath = path.join(repositoryRoot, "games/genshin/data/calc/talent-scalings.json");
const API_URL = "https://genshin-db-api.vercel.app/api/v5/talents?query=names&matchCategories=true&verboseCategories=true&resultLanguage=Japanese";
const GROUP_TO_TALENT = { normalAttack: "combat1", skill: "combat2", burst: "combat3" };

const COMPOSITE_SCALING_SPECS = [
    ["10000078", "skill", "damage", "atk", "param2", "elementalMastery"],
    ["10000078", "skill", "1_damage", "atk", "param5", "elementalMastery"],
    ["10000078", "skill", "2_damage", "atk", "param7", "elementalMastery"],
    ["10000078", "skill", "3_damage", "atk", "param9", "elementalMastery"],
    ["10000078", "burst", "1_damage_2", "atk", "param2", "elementalMastery"],
    ["10000094", "skill", "damage", "atk", "param2", "def"],
    ["10000094", "skill", "damage_2", "atk", "param6", "def"],
    ["10000094", "burst", "skilldamage", "atk", "param2", "def"],
    ["10000079", "skill", "damage_3", "atk", "param4", "hp"],
    ["10000079", "burst", "damage_5", "atk", "param2", "hp"],
    ["10000079", "burst", "damage_6", "atk", "param4", "hp"],
    ["10000127", "skill", "damage", "elementalMastery", "param2", "def"],
    ["10000127", "skill", "damage_2", "elementalMastery", "param4", "def"],
    ["10000127", "burst", "skilldamage", "elementalMastery", "param2", "def"],
    ["10000119", "skill", "damage_3", "atk", "param5", "elementalMastery"],
    ["10000073", "skill", "damage_3", "atk", "param4", "elementalMastery"],
    ["10000097", "normalAttack", "damage", "atk", "param8", "elementalMastery"],
    ["10000126", "skill", "normal_3damage_2", "def", "param9", "def"],
    ["10000126", "skill", "chargeddamage_2", "def", "param12", "def"]
].map(([characterId, group, entryId, primaryStat, secondaryParam, secondaryStat]) => ({
    characterId, group, entryId, primaryStat, secondaryParam, secondaryStat
}));

function valuesByLevel(values) {
    if (!Array.isArray(values) || values.length < 15) throw new Error("Expected 15 talent levels");
    return Object.fromEntries(values.slice(0, 15).map((value, index) => [
        String(index + 1),
        Number((Number(value) * 100).toFixed(4))
    ]));
}

function matchingDelimiter(source, start, open, close) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
        const character = source[index];
        if (inString) {
            if (escaped) escaped = false;
            else if (character === "\\") escaped = true;
            else if (character === "\"") inString = false;
            continue;
        }
        if (character === "\"") inString = true;
        else if (character === open) depth += 1;
        else if (character === close && --depth === 0) return index;
    }
    throw new Error(`Unclosed ${open} at ${start}`);
}

function propertyObjectRange(source, marker, from = 0, until = source.length) {
    const markerIndex = source.indexOf(marker, from);
    if (markerIndex < 0 || markerIndex >= until) throw new Error(`Missing marker: ${marker}`);
    const start = source.indexOf("{", markerIndex + marker.length);
    const end = matchingDelimiter(source, start, "{", "}") + 1;
    if (end > until) throw new Error(`Marker outside expected range: ${marker}`);
    return { start, end };
}

function entryRange(source, spec) {
    const character = propertyObjectRange(source, `"${spec.characterId}":`);
    const group = propertyObjectRange(source, `"${spec.group}":`, character.start, character.end);
    const marker = `"id": "${spec.entryId}"`;
    const markerIndex = source.indexOf(marker, group.start);
    if (markerIndex < 0 || markerIndex >= group.end) throw new Error(`Missing marker: ${marker}`);
    const start = source.lastIndexOf("{", markerIndex);
    return { start, end: matchingDelimiter(source, start, "{", "}") + 1 };
}

function indentJson(value, spaces) {
    const indentation = " ".repeat(spaces);
    return JSON.stringify(value, null, 2).split("\n").map((line) => indentation + line).join("\n");
}

function applySpec(source, parsed, talentsByCharacterId, spec) {
    const entry = parsed[spec.characterId]?.[spec.group]?.entries?.find((item) => item.id === spec.entryId);
    if (!entry) throw new Error(`${spec.characterId}/${spec.group}/${spec.entryId}: entry missing`);
    const range = entryRange(source, spec);
    let entrySource = source.slice(range.start, range.end);
    const currentPrimary = entry.scalings?.[0]?.stat;
    if (currentPrimary !== spec.primaryStat) {
        entrySource = entrySource.replace(`"stat": "${currentPrimary}"`, `"stat": "${spec.primaryStat}"`);
    }
    if ((entry.scalings || []).some((scaling, index) => index > 0 && scaling.stat === spec.secondaryStat)) {
        return source.slice(0, range.start) + entrySource + source.slice(range.end);
    }

    const talentKey = GROUP_TO_TALENT[spec.group];
    const values = talentsByCharacterId[spec.characterId]?.[talentKey]?.attributes?.parameters?.[spec.secondaryParam];
    const scaling = { stat: spec.secondaryStat, valuesByLevel: valuesByLevel(values) };
    const scalingsStart = entrySource.indexOf('"scalings": [');
    const arrayStart = entrySource.indexOf("[", scalingsStart);
    const arrayEnd = matchingDelimiter(entrySource, arrayStart, "[", "]");
    const beforeArrayEnd = entrySource.slice(0, arrayEnd);
    const trailingWhitespace = beforeArrayEnd.match(/\s*$/)?.[0] || "";
    entrySource = beforeArrayEnd.slice(0, beforeArrayEnd.length - trailingWhitespace.length)
        + `,\n${indentJson(scaling, 12)}`
        + trailingWhitespace
        + entrySource.slice(arrayEnd);
    return source.slice(0, range.start) + entrySource + source.slice(range.end);
}

function localCoverageProblems(data) {
    return COMPOSITE_SCALING_SPECS.flatMap((spec) => {
        const entry = data[spec.characterId]?.[spec.group]?.entries?.find((item) => item.id === spec.entryId);
        const stats = (entry?.scalings || []).map((scaling) => scaling.stat);
        return entry && stats[0] === spec.primaryStat && stats.includes(spec.secondaryStat) && stats.length >= 2
            ? []
            : [{ ...spec, stats }];
    });
}

async function fetchTalents() {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error(`genshin-db API failed: ${response.status}`);
    return response.json();
}

async function main() {
    const fix = process.argv.includes("--fix");
    let source = fs.readFileSync(targetPath, "utf8");
    let data = JSON.parse(source);
    if (fix) {
        const talents = await fetchTalents();
        const talentsByCharacterId = Object.fromEntries(talents.map((talent) => [
            String(10000000 + Math.floor(talent.id / 100)), talent
        ]));
        for (const spec of COMPOSITE_SCALING_SPECS) {
            source = applySpec(source, data, talentsByCharacterId, spec);
            data = JSON.parse(source);
        }
        fs.writeFileSync(targetPath, source);
    }
    const problems = localCoverageProblems(data);
    process.stdout.write(`${JSON.stringify({ checked: COMPOSITE_SCALING_SPECS.length, problems }, null, 2)}\n`);
    if (problems.length) process.exitCode = 1;
}

if (require.main === module) main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

module.exports = { COMPOSITE_SCALING_SPECS, applySpec, localCoverageProblems, valuesByLevel };
