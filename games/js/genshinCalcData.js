(function () {
    "use strict";

    const CALC_PATHS = {
        talentScalings: "/games/genshin/data/calc/talent-scalings.json",
        talentModifiers: "/games/genshin/data/calc/talent-modifiers.json",
        weaponModifiers: "/games/genshin/data/calc/weapon-modifiers.json",
        artifactSetModifiers: "/games/genshin/data/calc/artifact-set-modifiers.json",
        constellationModifiers: "/games/genshin/data/calc/constellation-modifiers.json"
    };

    const DISPLAY_DATA_PATHS = {
        weapons: "/games/genshin/data/weapons.json",
        artifactSets: "/games/genshin/data/artifact-sets.json",
        weaponEffects: "/games/genshin/data/weapon-effects.json",
        artifactSetEffects: "/games/genshin/data/artifact-set-effects.json"
    };

    const VALID_UID_HANDLING = new Set([
        "includedInUidStats",
        "includedInUidTalentLevels",
        "conditional",
        "manualOnly",
        "displayOnly",
        "special"
    ]);

    const VALID_CALC_SUPPORT = new Set(["simple", "toggle", "stack", "custom", "special"]);

    let cache = null;

    async function fetchJson(key, path, warnings) {
        try {
            const response = await fetch(path, { cache: "no-cache" });
            if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
            const json = await response.json();
            console.info(`[genshin-calc-data] loaded ${key}: ${path}`);
            return json;
        } catch (error) {
            const message = `${path} の読み込みに失敗しました: ${error.message}`;
            warnings.push({ level: "error", message });
            console.warn(`[genshin-calc-data] ${message}`, error);
            return {};
        }
    }

    function hasAnyValueSource(modifier) {
        return [
            "value",
            "valueByRefinement",
            "valueByStack",
            "valuePerStack",
            "valuePerConsumedStack",
            "valuePerExcessStack",
            "ratio",
            "scalings",
            "targetEffect"
        ].some((key) => Object.prototype.hasOwnProperty.call(modifier, key));
    }

    function validateTalentScalings(data, warnings) {
        Object.entries(data || {}).forEach(([characterId, talents]) => {
            Object.entries(talents || {}).forEach(([talentKey, talent]) => {
                if (!Array.isArray(talent.entries)) {
                    warnings.push({ level: "warn", message: `${characterId}.${talentKey} に entries がありません。` });
                    return;
                }
                talent.entries.forEach((entry) => {
                    ["id", "label", "attackType", "damageType", "element", "hitCount"].forEach((key) => {
                        if (entry[key] === undefined || entry[key] === "") {
                            warnings.push({ level: "warn", message: `${characterId}.${talentKey} のentryに ${key} がありません。` });
                        }
                    });
                    if (!Array.isArray(entry.scalings) || !entry.scalings.length) {
                        warnings.push({ level: "warn", message: `${characterId}.${talentKey}.${entry.id || "unknown"} に scalings がありません。` });
                        return;
                    }
                    entry.scalings.forEach((scaling) => {
                        if (!scaling.stat || !scaling.valuesByLevel) {
                            warnings.push({ level: "warn", message: `${characterId}.${talentKey}.${entry.id} の scaling に stat / valuesByLevel が不足しています。` });
                        }
                    });
                });
            });
        });
    }

    function validateModifier(modifier, source, warnings, options = {}) {
        const requiredKeys = ["category", "applyTo", "condition", "calculationSupport"];
        if (!options.uidHandlingOptional) requiredKeys.push("uidHandling");
        requiredKeys.forEach((key) => {
            if (modifier[key] === undefined) {
                warnings.push({ level: "warn", message: `${source}.${modifier.id || "unknown"} に ${key} がありません。` });
            }
        });
        if (modifier.uidHandling && !VALID_UID_HANDLING.has(modifier.uidHandling)) {
            warnings.push({ level: "warn", message: `${source}.${modifier.id || "unknown"} の uidHandling が未対応です: ${modifier.uidHandling}` });
        }
        if (modifier.calculationSupport && !VALID_CALC_SUPPORT.has(modifier.calculationSupport)) {
            warnings.push({ level: "warn", message: `${source}.${modifier.id || "unknown"} の calculationSupport が未対応です: ${modifier.calculationSupport}` });
        }
        if ((modifier.category === "special" || (modifier.applyTo || []).includes("specialEffect"))) {
            warnings.push({ level: "warn", message: `${source}.${modifier.id || "unknown"} は special 扱いです。候補表示のみ推奨です。` });
        }
        if (!hasAnyValueSource(modifier)) {
            warnings.push({ level: "warn", message: `${source}.${modifier.id || "unknown"} に値情報がありません。` });
        }
    }

    function walkModifiers(data, warnings, sourceName) {
        Object.entries(data || {}).forEach(([id, entry]) => {
            if (Array.isArray(entry.modifiers)) {
                entry.modifiers.forEach((modifier) => validateModifier(modifier, `${sourceName}.${id}`, warnings));
            }
            ["twoPiece", "fourPiece", "onePiece"].forEach((key) => {
                if (Array.isArray(entry[key])) {
                    entry[key].forEach((modifier) => validateModifier(modifier, `${sourceName}.${id}.${key}`, warnings));
                }
            });
            if (Array.isArray(entry.passives)) {
                entry.passives.forEach((passive) => {
                    (passive.modifiers || []).forEach((modifier) => {
                        validateModifier(modifier, `${sourceName}.${id}.passives.${passive.sourceId || "unknown"}`, warnings, {
                            uidHandlingOptional: sourceName === "talentModifiers"
                        });
                    });
                });
            }
            if (entry.constellations) {
                Object.entries(entry.constellations).forEach(([level, modifiers]) => {
                    (modifiers || []).forEach((modifier) => validateModifier(modifier, `${sourceName}.${id}.C${level}`, warnings));
                });
            }
        });
    }

    function validateCalcData(data) {
        const warnings = [];
        validateTalentScalings(data.talentScalings, warnings);
        walkModifiers(data.talentModifiers, warnings, "talentModifiers");
        walkModifiers(data.weaponModifiers, warnings, "weaponModifiers");
        walkModifiers(data.artifactSetModifiers, warnings, "artifactSetModifiers");
        walkModifiers(data.constellationModifiers, warnings, "constellationModifiers");
        if (warnings.length) {
            console.warn(`[genshin-calc-validate] ${warnings.length}件の確認事項があります。`, warnings.slice(0, 10));
        }
        return warnings;
    }

    async function loadGenshinCalcData() {
        if (cache) return cache;
        const warnings = [];
        const entries = await Promise.all(
            Object.entries({ ...CALC_PATHS, ...DISPLAY_DATA_PATHS }).map(async ([key, path]) => [key, await fetchJson(key, path, warnings)])
        );
        const data = Object.fromEntries(entries);
        data.warnings = warnings.concat(validateCalcData(data));
        cache = data;
        return cache;
    }

    window.GenshinCalcData = {
        loadGenshinCalcData,
        validateCalcData
    };
})();
