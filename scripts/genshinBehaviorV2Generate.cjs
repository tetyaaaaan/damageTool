"use strict";

/**
 * Generate the character behaviour v2 pilot layer.
 *
 * This file intentionally performs a small, deterministic extraction from the
 * Japanese source strings.  A value is emitted only when the source sentence
 * contains that value explicitly (for example `3秒毎`, `最大6回`, or
 * `使用可能回数+1`).  It never guesses burst cost, snapshot behaviour, or a
 * missing duration.  All records remain candidates until independently
 * reviewed; this generator is an evidence transform, not a runtime builder.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultDataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultOutputFile = path.join(defaultDataRoot, "v2", "characters", "behavior-pilot.json");
const CAPTURED_AT = "2026-08-15T00:00:00.000Z";
const GENERATOR_VERSION = "genshinBehaviorV2Generate/1";

const PILOT_IDS = [
    "10000026", "10000031", "10000037", "10000046",
    "10000058", "10000089", "10000094", "10000098"
];

const TALENT_FIELDS = [
    ["normalAttack", "normalDescriptionJa"],
    ["normalAttack", "chargedDescriptionJa"],
    ["normalAttack", "plungingDescriptionJa"],
    ["skill", "descriptionJa"],
    ["burst", "descriptionJa"]
];

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
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
    return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function slug(value) {
    return String(value)
        .replace(/[^A-Za-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "component";
}

function sourceRecord({ id, dataset, record, field, text, structuredValue, notes }) {
    const source = {
        id,
        kind: "primaryDataset",
        provider: "damageTool-local",
        independenceGroup: "damageTool-local-derived",
        providerIndependence: "correlated",
        locator: { dataset, record },
        capturedAt: CAPTURED_AT,
        gameVersion: null,
        locale: "ja-JP",
        text: String(text || ""),
        integrity: { algorithm: "sha256", digest: digest(text || "") }
    };
    if (field) source.locator.field = field;
    if (structuredValue !== undefined) source.structuredValue = clone(structuredValue);
    if (notes) source.notes = notes;
    return source;
}

function putSource(records, source) {
    const previous = records[source.id];
    if (previous && stableJson(previous) !== stableJson(source)) {
        throw new Error(`source id collision: ${source.id}`);
    }
    records[source.id] = source;
    return source.id;
}

const KANJI_DIGITS = {
    "零": 0, "〇": 0, "一": 1, "二": 2, "三": 3, "四": 4,
    "五": 5, "六": 6, "七": 7, "八": 8, "九": 9,
    "壱": 1, "弐": 2, "参": 3
};

function parseNumberToken(token) {
    const value = String(token || "");
    if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value);
    if (!value || value === "一定") return null;
    if (![...value].every((char) => Object.prototype.hasOwnProperty.call(KANJI_DIGITS, char) || char === "十" || char === "百")) return null;
    // The source strings in the pilot set mostly use single kanji numerals.
    // This also handles the common 十/百 forms without attempting to
    // interpret prose such as 一定時間.
    if (value.length === 1 && value !== "十" && value !== "百") return KANJI_DIGITS[value];
    let total = 0;
    let section = 0;
    let digit = 0;
    for (const char of value) {
        if (char === "十" || char === "百") {
            const unit = char === "十" ? 10 : 100;
            section += (digit || 1) * unit;
            digit = 0;
        } else {
            digit = KANJI_DIGITS[char];
        }
    }
    return total + section + digit;
}

function numericPattern() {
    return "(?:\\d+(?:\\.\\d+)?|[零〇一二三四五六七八九十百壱弐参]+)";
}

function measurement(value, unit, sourceRefs, notes) {
    const result = {
        value,
        unit,
        status: "explicit",
        sourceRefs: [...sourceRefs]
    };
    if (notes) result.notes = notes;
    return result;
}

function createExtractor(text, sourceRefs) {
    const timing = {};
    const execution = {};
    const energy = {};
    const unknownFields = new Set(["burstCost", "snapshot"]);
    const durationValues = [];
    const intervalValues = [];

    function addMeasurement(target, key, value, unit, notes) {
        if (value === null || value === undefined || Number.isNaN(value)) return;
        if (!target[key]) target[key] = measurement(value, unit, sourceRefs, notes);
    }

    function matches(regex, callback) {
        let match;
        const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
        const scanner = new RegExp(regex.source, flags);
        while ((match = scanner.exec(text))) callback(match, scanner.lastIndex);
    }

    const number = numericPattern();

    // Normal/charged attack multiplicity.  `最大N段` is an explicit hit count,
    // while a sentence saying it performs N attacks is an attack count.
    matches(new RegExp(`最大(${number})段`, "g"), (match) => {
        addMeasurement(execution, "hitCount", parseNumberToken(match[1]), "hits", "Copied from the explicit maximum combo count.");
    });
    matches(new RegExp(`(?:連携攻撃|連携|斬撃|射撃)を(${number})回(?:行う|行い|放つ|繰り出す)`, "g"), (match) => {
        addMeasurement(execution, "hitCount", parseNumberToken(match[1]), "hits", "Copied from the explicit attack count.");
    });
    matches(new RegExp(`攻撃を(${number})回行う`, "g"), (match) => {
        addMeasurement(execution, "attackCount", parseNumberToken(match[1]), "attacks", "Copied from the explicit attack count.");
    });

    matches(new RegExp(`(?:初期)?使用可能回数は?(${number})回`, "g"), (match) => {
        addMeasurement(execution, "charges", parseNumberToken(match[1]), "charges", "Copied from the explicit available-use count.");
    });
    matches(new RegExp(`同時に最大(${number})(?:株|体|個)まで存在`, "g"), (match) => {
        addMeasurement(execution, "maxInstances", parseNumberToken(match[1]), "instances", "Copied from the explicit simultaneous instance cap.");
    });
    matches(new RegExp(`最大(${number})(?:株|体|個)まで存在`, "g"), (match) => {
        addMeasurement(execution, "maxInstances", parseNumberToken(match[1]), "instances", "Copied from the explicit simultaneous instance cap.");
    });
    matches(new RegExp(`最大(${number})回(?:まで|発動可能|発動|のみ|召喚できる)`, "g"), (match) => {
        addMeasurement(execution, "maxTriggers", parseNumberToken(match[1]), "hits", "Copied from the explicit trigger cap.");
    });
    matches(new RegExp(`(${number})回のみ(?:発動可能|有効)`, "g"), (match) => {
        addMeasurement(execution, "maxTriggers", parseNumberToken(match[1]), "hits", "Copied from the explicit one-trigger limit.");
    });
    matches(new RegExp(`最大(${number})体まで効果が発動`, "g"), (match) => {
        addMeasurement(execution, "maxTriggers", parseNumberToken(match[1]), "instances", "Copied from the explicit affected-target trigger cap.");
    });
    matches(new RegExp(`(?:攻撃|効果)を(${number})回行う、または`, "g"), (match) => {
        addMeasurement(execution, "attackCount", parseNumberToken(match[1]), "attacks", "Copied from the explicit attack count.");
    });
    matches(new RegExp(`(${number})体以上の敵`, "g"), (match) => {
        addMeasurement(execution, "targetCount", parseNumberToken(match[1]), "instances", "Copied from the explicit target threshold.");
    });

    // Interval and duration extraction is deliberately context based.  A
    // number followed by 秒 is not promoted unless the surrounding Japanese
    // sentence identifies it as a duration or an interval.
    matches(new RegExp(`(${number})秒`, "g"), (match) => {
        const value = parseNumberToken(match[1]);
        const start = Math.max(0, match.index - 24);
        const end = Math.min(text.length, (match.index || 0) + match[0].length + 18);
        const before = text.slice(start, match.index || 0);
        const after = text.slice((match.index || 0) + match[0].length, end);
        const isEvery = /毎(?:に|$)/.test(after.slice(0, 4)) || /毎$/.test(before);
        const isCooldown = isEvery && (/クールタイム/.test(after + before)
            || (value >= 30 && /1回のみ(?:発動可能|可能)/.test(after))
            || (/(?:効果|上記効果)は/.test(before) && /1回のみ発動可能/.test(after)));
        if (isEvery) {
            intervalValues.push({ value, before, after, isCooldown });
            return;
        }
        const durationContext = /(?:継続時間|持続時間|存在時間|次の|後の|以内|続く|継続期間|継続中)/.test(before + after);
        if (durationContext) durationValues.push({ value, before, after });
    });
    if (durationValues.length) {
        // The first duration is the outer state duration.  Nested durations
        // are not guessed into another field; they remain audit-visible.
        addMeasurement(timing, "duration", durationValues[0].value, "seconds", "Copied from an explicit duration phrase.");
        if (durationValues.length > 1) unknownFields.add("nestedDuration");
    }
    intervalValues.forEach(({ value, before, after, isCooldown }) => {
        const procOnly = /(?:発動可能|回のみ|のみ可能|召喚できる)/.test(before + after);
        const key = isCooldown ? "cooldown" : procOnly ? "triggerInterval" : "tickInterval";
        if (!timing[key]) {
            addMeasurement(timing, key, value, "seconds", `Copied from the explicit ${key} phrase.`);
        }
    });
    if (/一定時間(?:ごと|毎)/.test(text)) {
        unknownFields.add("tickInterval");
    }

    matches(new RegExp(`元素エネルギーを(${number})ポイント(?:回復|獲得)`, "g"), (match) => {
        addMeasurement(energy, "gain", parseNumberToken(match[1]), "points", "Copied from the explicit energy gain.");
    });

    if (new RegExp(`最大${number}重`).test(text)) unknownFields.add("stackMaximum");
    if (/継続時間|存在時間|持続時間/.test(text) && !timing.duration) unknownFields.add("duration");
    if (/一定時間(?:ごと|毎)/.test(text) && !timing.tickInterval && !timing.triggerInterval) unknownFields.add("triggerInterval");
    if (/スナップショット|snapshot/i.test(text)) unknownFields.add("snapshot");
    if (/元素爆発|爆発コスト|元素エネルギー上限/.test(text)) unknownFields.add("burstCost");

    const lifecycle = {
        refreshMode: /延長/.test(text) ? "extend" : /リセット/.test(text) ? "refresh" : /独立してカウント/.test(text) ? "independent" : /継承/.test(text) ? "replace" : "none",
        expiration: timing.duration ? "duration" : execution.maxTriggers ? "triggerLimit" : /(?:効果|スタック|回数|使用)[^。\n]{0,8}消費/.test(text) ? "consumed" : /解除|退場|戦闘不能/.test(text) ? "stateEnd" : "unknown",
        instanceScope: /召喚|存在/.test(text) ? "summon" : /重ね掛け|独立してカウント|最大[^。\n]{0,8}重(?:まで|$)/.test(text) ? "stack" : /敵/.test(text) ? "target" : /チーム/.test(text) ? "party" : /自身|自分/.test(text) ? "owner" : "unknown"
    };
    const behaviorKeyword = /(?:秒|回|段|体|株|使用可能|継続|持続|存在|召喚|発動|クールタイム)/.test(text);
    if (!behaviorKeyword || (lifecycle.refreshMode === "none" && lifecycle.expiration === "unknown" && lifecycle.instanceScope === "unknown" && !Object.keys(timing).length && !Object.keys(execution).length && !Object.keys(energy).length)) {
        return { timing, execution, lifecycle, energy, unknownFields: [...unknownFields].sort(), hasBehavior: false };
    }
    return { timing, execution, lifecycle, energy, unknownFields: [...unknownFields].sort(), hasBehavior: true };
}

function explicitDuration(text, pattern) {
    const match = String(text).match(pattern);
    return match ? parseNumberToken(match[1]) : null;
}

function explicitNumber(text, pattern) {
    const match = String(text).match(pattern);
    return match ? parseNumberToken(match[1]) : null;
}

function addChange(changes, change) {
    if (change.value === undefined) return;
    const key = `${change.path}|${change.operation}|${JSON.stringify(change.value)}`;
    if (!changes.some((item) => `${item.path}|${item.operation}|${JSON.stringify(item.value)}` === key)) changes.push(change);
}

/** Extract only explicit deltas and common lifecycle operations. */
function extractModifierChanges(text, { sourceKind = "constellation" } = {}) {
    const valuePattern = numericPattern();
    const changes = [];
    const source = String(text || "");

    matchesIn(source, new RegExp(`使用可能回数\\s*\\+\\s*(${valuePattern})回?`, "g"), (match) => {
        addChange(changes, { path: "/execution/charges", operation: "add", value: parseNumberToken(match[1]), notes: "Explicit charge addition." });
    });
    matchesIn(source, new RegExp(`存在時間\\s*\\+\\s*(${valuePattern})秒`, "g"), (match) => {
        addChange(changes, { path: "/timing/duration", operation: "add", value: parseNumberToken(match[1]), notes: "Explicit duration extension." });
    });
    matchesIn(source, new RegExp(`クールタイム\\s*-\\s*(${valuePattern})秒`, "g"), (match) => {
        addChange(changes, { path: "/timing/cooldown", operation: "add", value: -parseNumberToken(match[1]), notes: "Explicit cooldown reduction." });
    });
    if (/クールタイム[^。\n]*関係なく/.test(source)) {
        addChange(changes, { path: "/timing/cooldown", operation: "ignoreCooldown", value: true, notes: "Explicit cooldown bypass." });
    }
    if (/クールタイム[^。\n]*(?:リセット|を[一二三四五六七八九十0-9]+回分リセット)/.test(source)) {
        const count = explicitNumber(source, new RegExp(`クールタイム[^。\\n]*?(${valuePattern})回分リセット`));
        addChange(changes, { path: "/timing/cooldown", operation: "reset", value: count === null ? null : count, notes: "Explicit cooldown reset." });
    }
    if (/継続時間[^。\n]*(?:リセット|再び発動)/.test(source)) {
        addChange(changes, { path: "/timing/duration", operation: "reset", value: null, notes: "Explicit duration reset." });
    }
    if (/継続時間[^。\n]*延長/.test(source)) {
        addChange(changes, { path: "/timing/duration", operation: "extend", value: null, notes: "Explicit duration extension without a guessed amount." });
    }

    if (sourceKind === "constellation") {
        matchesIn(source, new RegExp(`最大(${valuePattern})回(?:まで|発動可能|発動|のみ|召喚できる)`, "g"), (match) => {
            addChange(changes, { path: "/execution/maxTriggers", operation: "setMaximum", value: parseNumberToken(match[1]), notes: "Explicit maximum trigger count." });
        });
        matchesIn(source, new RegExp(`最大(${valuePattern})(?:株|体|個)まで(?:存在|召喚|。|、)`, "g"), (match) => {
            addChange(changes, { path: "/execution/maxInstances", operation: "setMaximum", value: parseNumberToken(match[1]), notes: "Explicit maximum instance count." });
        });
        matchesIn(source, new RegExp(`(?:追加で|追加召喚[^。\n]*?)(${valuePattern})体`, "g"), (match) => {
            addChange(changes, { path: "/execution/maxInstances", operation: "add", value: parseNumberToken(match[1]), notes: "Explicit additional instance count." });
        });
        matchesIn(source, new RegExp(`連携攻撃を(${valuePattern})回`, "g"), (match) => {
            addChange(changes, { path: "/execution/hitCount", operation: "add", value: parseNumberToken(match[1]), notes: "Explicit follow-up hit count." });
        });
        matchesIn(source, new RegExp(`元素エネルギーを(${valuePattern})ポイント(?:回復|獲得)`, "g"), (match) => {
            addChange(changes, { path: "/energy/gain", operation: "add", value: parseNumberToken(match[1]), notes: "Explicit energy gain." });
        });
        matchesIn(source, new RegExp(`(?:継続時間|継続期間)(?:は)?(${valuePattern})秒`, "g"), (match) => {
            if (!changes.some((item) => item.path === "/timing/duration" && item.operation === "replace")) {
                addChange(changes, { path: "/timing/duration", operation: "replace", value: parseNumberToken(match[1]), notes: "Explicit duration." });
            }
        });
        matchesIn(source, new RegExp(`(?:存在時間|継続時間)\\+?(${valuePattern})秒`, "g"), (match) => {
            // Keep explicit plain duration on a constellation as a candidate,
            // but do not duplicate an already captured delta.
            const value = parseNumberToken(match[1]);
            if (value !== null && !changes.some((item) => item.path === "/timing/duration" && item.operation === "replace")) {
                addChange(changes, { path: "/timing/duration", operation: "replace", value, notes: "Explicit duration." });
            }
        });
        matchesIn(source, new RegExp(`(${valuePattern})秒毎`, "g"), (match) => {
            const value = parseNumberToken(match[1]);
            const after = source.slice((match.index || 0) + match[0].length, (match.index || 0) + match[0].length + 18);
            const before = source.slice(Math.max(0, (match.index || 0) - 20), match.index || 0);
            const pathName = (value >= 30 && /1回のみ(?:発動可能|可能)/.test(after))
                || (/(?:効果|上記効果)は/.test(before) && /1回のみ発動可能/.test(after))
                ? "/timing/cooldown"
                : /発動可能|回のみ|のみ可能/.test(after) ? "/timing/triggerInterval" : "/timing/tickInterval";
            addChange(changes, { path: pathName, operation: "replace", value, notes: "Explicit interval." });
        });
        matchesIn(source, new RegExp(`(${valuePattern})秒(?:毎に)?1回のみ発動可能`, "g"), (match) => {
            addChange(changes, { path: "/execution/maxTriggers", operation: "setMaximum", value: 1, notes: "Explicit one-trigger limit." });
        });
    }
    return changes;
}

function matchesIn(source, regex, callback) {
    let match;
    const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
    const scanner = new RegExp(regex.source, flags);
    while ((match = scanner.exec(source))) callback(match, scanner.lastIndex);
}

function specId(characterId, kind, component) {
    return `behavior:${characterId}:${kind}:${slug(component)}`;
}

function modifierId(characterId, component, index) {
    return `behavior-modifier:${characterId}:${slug(component)}:${index + 1}`;
}

function buildSpec({ id, entity, sourceRefs, analysis }) {
    const spec = {
        id,
        entity,
        sourceRefs: [...sourceRefs],
        timing: clone(analysis.timing),
        execution: clone(analysis.execution),
        lifecycle: clone(analysis.lifecycle),
        unknownFields: [...analysis.unknownFields],
        verification: {
            status: "needsReview",
            reviewedBy: null,
            reviewedAt: null,
            discrepancies: [
                { code: "SINGLE_LOCAL_SOURCE", sourceRefs: [...sourceRefs] },
                { code: "INDEPENDENT_REVIEW_REQUIRED", fields: ["timing", "execution", "lifecycle"] }
            ]
        }
    };
    if (Object.keys(analysis.energy).length) spec.energy = clone(analysis.energy);
    return spec;
}

function conditionFor(kind, key) {
    return { kind, stateKey: String(key) };
}

function buildModifier({ id, sourceRefs, targetSpecId, change, condition }) {
    return {
        id,
        sourceRefs: [...sourceRefs],
        targetSpecId,
        path: change.path,
        operation: change.operation,
        value: change.value,
        condition,
        verification: { status: "needsReview", reviewedBy: null, reviewedAt: null }
    };
}

function componentNameMap(characterId, talent) {
    const entries = [];
    Object.entries(talent || {}).forEach(([component, value]) => {
        if (!isObject(value)) return;
        if (value.nameJa) entries.push({ component, name: value.nameJa });
        (value.passives || []).forEach((passive) => {
            if (passive.nameJa) entries.push({ component: `${component}.${passive.sourceId}`, name: passive.nameJa });
        });
    });
    (talent?.passives || []).forEach((passive) => {
        if (passive?.nameJa) entries.push({ component: `passives.${passive.sourceId}`, name: passive.nameJa });
    });
    return entries.sort((a, b) => b.name.length - a.name.length || a.component.localeCompare(b.component));
}

function findTargetSpec(text, characterId, names, specByComponent) {
    const matching = names.filter((entry) => entry.name && text.includes(entry.name));
    if (matching.length > 1 && text.includes("クールタイム")) {
        const anchor = text.indexOf("クールタイム");
        matching.sort((a, b) => Math.abs(text.indexOf(a.name) - anchor) - Math.abs(text.indexOf(b.name) - anchor));
    }
    const match = matching[0];
    if (match) {
        const id = specByComponent.get(`${characterId}:${match.component}`);
        if (id) return id;
    }
    return null;
}

function buildDataset({ dataRoot = defaultDataRoot } = {}) {
    const characters = readJson(path.join(dataRoot, "characters.json"));
    const talents = readJson(path.join(dataRoot, "character-talents.json"));
    const constellations = readJson(path.join(dataRoot, "character-constellations.json"));
    const sourceRecords = {};
    const specs = {};
    const modifiers = {};
    const specByComponent = new Map();
    const sourceContext = [];
    const nameMaps = new Map();

    PILOT_IDS.forEach((characterId) => {
        const talent = talents[characterId] || {};
        nameMaps.set(characterId, componentNameMap(characterId, talent));
        const catalogId = `source:${characterId}:catalog`;
        putSource(sourceRecords, sourceRecord({
            id: catalogId,
            dataset: "characters.json",
            record: `/${characterId}`,
            text: stableJson(characters[characterId] || {}),
            structuredValue: characters[characterId] || {},
            notes: "Pilot character identity source; game version is not recorded in the legacy dataset."
        }));

        Object.entries(talent).forEach(([component, value]) => {
            if (!isObject(value)) return;
            const fields = component === "normalAttack"
                ? TALENT_FIELDS.filter(([name]) => name === component).map(([, field]) => field)
                : ["descriptionJa"];
            fields.forEach((field) => {
                const text = value[field];
                if (typeof text !== "string" || !text) return;
                const sourceId = `source:${characterId}:talent:${slug(component)}:${field}`;
                putSource(sourceRecords, sourceRecord({
                    id: sourceId,
                    dataset: "character-talents.json",
                    record: `/${characterId}/${component}`,
                    field,
                    text,
                    structuredValue: { characterId, component, field, value: text },
                    notes: "Original Japanese talent text; no values are inferred outside explicit phrases."
                }));
                sourceContext.push({ characterId, kind: "talent", component: component === "normalAttack" ? `${component}.${field.replace("DescriptionJa", "")}` : component, field, text, sourceId });
            });
        });
        (talent.passives || []).forEach((passive) => {
            if (typeof passive.descriptionJa !== "string" || !passive.descriptionJa) return;
            const sourceId = `source:${characterId}:talent:passive:${slug(passive.sourceId)}:descriptionJa`;
            putSource(sourceRecords, sourceRecord({
                id: sourceId,
                dataset: "character-talents.json",
                record: `/${characterId}/passives/${passive.sourceId}`,
                field: "descriptionJa",
                text: passive.descriptionJa,
                structuredValue: { characterId, sourceId: passive.sourceId, field: "descriptionJa", value: passive.descriptionJa },
                notes: "Original Japanese passive text; no values are inferred outside explicit phrases."
            }));
            sourceContext.push({ characterId, kind: "talent", component: `passives.${passive.sourceId}`, field: "descriptionJa", text: passive.descriptionJa, sourceId });
        });

        const constellationSet = constellations[characterId]?.constellations || {};
        Object.entries(constellationSet).sort(([a], [b]) => Number(a) - Number(b)).forEach(([level, entry]) => {
            const text = entry?.effectText;
            if (typeof text !== "string" || !text) return;
            const sourceId = `source:${characterId}:constellation:${level}:effectText`;
            putSource(sourceRecords, sourceRecord({
                id: sourceId,
                dataset: "character-constellations.json",
                record: `/${characterId}/constellations/${level}`,
                field: "effectText",
                text,
                structuredValue: { characterId, constellation: Number(level), nameJa: entry.nameJa || null, effectText: text },
                notes: "Original Japanese constellation text; only explicit time/count values become candidates."
            }));
            sourceContext.push({ characterId, kind: "constellation", component: `constellation.${level}`, field: "effectText", text, sourceId, level: Number(level) });
        });
    });

    // Build specs first so every modifier can resolve to a target spec.
    sourceContext.forEach((context) => {
        const analysis = createExtractor(context.text, [context.sourceId]);
        if (!analysis.hasBehavior) return;
        const id = specId(context.characterId, context.kind, context.component);
        const entity = context.kind === "constellation"
            ? { kind: "constellation", id: context.characterId, component: context.component }
            : { kind: "talent", id: context.characterId, component: context.component };
        specs[id] = buildSpec({ id, entity, sourceRefs: [context.sourceId], analysis });
        specByComponent.set(`${context.characterId}:${context.component}`, id);
    });

    // Extract common operations from both base talent prose (reset/refresh)
    // and constellation deltas (charge additions, caps, duration changes).
    sourceContext.forEach((context) => {
        const changes = extractModifierChanges(context.text, { sourceKind: context.kind });
        if (!changes.length) return;
        const ownSpec = specByComponent.get(`${context.characterId}:${context.component}`);
        const target = findTargetSpec(context.text, context.characterId, nameMaps.get(context.characterId) || [], specByComponent) || ownSpec;
        if (!target) return;
        const condition = context.kind === "constellation"
            ? conditionFor("constellation", `${context.characterId}:C${context.level}`)
            : conditionFor("talent", `${context.characterId}:${context.component}`);
        changes.forEach((change, index) => {
            const id = modifierId(context.characterId, `${context.component}-${context.level || "base"}`, index);
            modifiers[id] = buildModifier({ id, sourceRefs: [context.sourceId], targetSpecId: target, change, condition });
        });
    });

    const verificationByStatus = {};
    Object.values(specs).forEach((spec) => {
        verificationByStatus[spec.verification.status] = (verificationByStatus[spec.verification.status] || 0) + 1;
    });
    const modifierOperationCounts = {};
    const modifierPathCounts = {};
    Object.values(modifiers).forEach((modifier) => {
        modifierOperationCounts[modifier.operation] = (modifierOperationCounts[modifier.operation] || 0) + 1;
        modifierPathCounts[modifier.path] = (modifierPathCounts[modifier.path] || 0) + 1;
    });
    const specsByCharacter = {};
    const modifiersByCharacter = {};
    const byCharacter = {};
    PILOT_IDS.forEach((id) => {
        specsByCharacter[id] = Object.values(specs).filter((spec) => spec.entity.id === id).length;
        modifiersByCharacter[id] = Object.values(modifiers).filter((modifier) => modifier.id.includes(`:${id}:`)).length;
        byCharacter[id] = {
            sourceRecordIds: Object.keys(sourceRecords)
                .filter((sourceId) => sourceId.startsWith(`source:${id}:`))
                .sort(),
            specIds: Object.values(specs)
                .filter((spec) => spec.entity.id === id)
                .map((spec) => spec.id)
                .sort(),
            modifierIds: Object.values(modifiers)
                .filter((modifier) => modifier.id.startsWith(`behavior-modifier:${id}:`))
                .map((modifier) => modifier.id)
                .sort()
        };
    });
    const summary = {
        schemaVersion: 2,
        pilotCharacters: PILOT_IDS.length,
        sourceRecords: Object.keys(sourceRecords).length,
        specs: Object.keys(specs).length,
        modifiers: Object.keys(modifiers).length,
        verificationByStatus,
        specsByCharacter,
        modifiersByCharacter,
        modifierOperationCounts,
        modifierPathCounts,
        sourceRefsResolved: true,
        capturedAt: CAPTURED_AT,
        gameVersion: null,
        generatedFrom: [
            "games/genshin/data/characters.json",
            "games/genshin/data/character-talents.json",
            "games/genshin/data/character-constellations.json"
        ]
    };
    return {
        schemaVersion: 2,
        kind: "genshinBehaviorV2Pilot",
        generator: { name: "genshinBehaviorV2Generate.cjs", version: GENERATOR_VERSION, capturedAt: CAPTURED_AT },
        summary,
        pilotIds: [...PILOT_IDS],
        byCharacter,
        sourceRecords,
        specs,
        modifiers
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
    const outputFile = process.env.GENSHIN_BEHAVIOR_V2_FILE || defaultOutputFile;
    process.stdout.write(`${JSON.stringify(writeDataset({ dataRoot, outputFile }).summary, null, 2)}\n`);
}

module.exports = {
    CAPTURED_AT,
    GENERATOR_VERSION,
    PILOT_IDS,
    buildDataset,
    buildModifier,
    buildSpec,
    componentNameMap,
    createExtractor,
    defaultDataRoot,
    defaultOutputFile,
    digest,
    extractModifierChanges,
    findTargetSpec,
    measurement,
    stableJson,
    writeDataset
};
