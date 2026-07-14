(function () {
    "use strict";

    const CALC_PATHS = {
        talentScalings: "/games/genshin/data/calc/talent-scalings.json",
        talentModifiers: "/games/genshin/data/calc/talent-modifiers.json",
        weaponModifiers: "/games/genshin/data/calc/weapon-modifiers.json",
        weaponEffectRegistry: "/games/genshin/data/calc/weapon-effect-registry.json",
        artifactSetModifiers: "/games/genshin/data/calc/artifact-set-modifiers.json",
        constellationModifiers: "/games/genshin/data/calc/constellation-modifiers.json",
        constellationEffectRegistry: "/games/genshin/data/calc/constellation-effect-registry.json",
        attackModeRules: "/games/genshin/data/calc/attack-mode-rules.json"
    };

    const DISPLAY_DATA_PATHS = {
        characters: "/games/genshin/data/characters.json",
        weapons: "/games/genshin/data/weapons.json",
        artifactSets: "/games/genshin/data/artifact-sets.json",
        characterTalents: "/games/genshin/data/character-talents.json",
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

    const VALID_CALC_SUPPORT = new Set(["simple", "toggle", "stack", "custom", "special", "displayOnly", "referenceAttackType"]);

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
            "valueByLevel",
            "valuePerStack",
            "valuePerGeneratedStack",
            "valuePerConsumedStack",
            "valuePerExcessStack",
            "valuePer1000",
            "valuePerStep",
            "valueByCondition",
            "critRate",
            "critDamage",
            "ratio",
            "maxValue",
            "scalings",
            "targetEffect",
            "effect",
            "resource"
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
        const requiredKeys = ["category", "condition", "calculationSupport"];
        if (!["resourceEffect", "resourceGeneratedEffect", "resourceCostOverride"].includes(modifier.category)) {
            requiredKeys.push("applyTo");
        }
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
        if (!hasAnyValueSource(modifier) && !options.valueOptional) {
            warnings.push({ level: "warn", message: `${source}.${modifier.id || "unknown"} に値情報がありません。` });
        }
    }

    function talentScalingGroup(sourceId) {
        return {
            combat1: "normalAttack",
            combat2: "skill",
            combat3: "burst"
        }[sourceId] || "";
    }

    function talentModifierRepresentedByScalings(modifier, characterId, sourceId, talentScalings) {
        const group = talentScalingGroup(sourceId);
        return Boolean(
            group
            && modifier?.category === "extraDamage"
            && modifier?.calculationSupport === "special"
            && (modifier.applyTo || []).includes("triggeredDamage")
            && !hasAnyValueSource(modifier)
            && (talentScalings?.[characterId]?.[group]?.entries || []).length
        );
    }

    function walkModifiers(data, warnings, sourceName, options = {}) {
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
                            uidHandlingOptional: sourceName === "talentModifiers",
                            valueOptional: sourceName === "talentModifiers" && talentModifierRepresentedByScalings(
                                modifier,
                                id,
                                passive.sourceId,
                                options.talentScalings
                            )
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

    function validateAttackModeRules(data, warnings) {
        const validGroups = new Set(["skill", "burst"]);
        const validAttackTypes = new Set(["normalAttack", "chargedAttack", "plungingAttack"]);
        const validDamageTypes = new Set(["normal", "charged", "plunging", "skill", "burst"]);
        Object.entries(data?.characters || {}).forEach(([characterId, groups]) => {
            Object.entries(groups || {}).forEach(([group, rule]) => {
                if (!validGroups.has(group)) {
                    warnings.push({ level: "warn", message: `attackModeRules.${characterId}.${group} has an unsupported source group.` });
                }
                Object.entries(rule?.damageTypeByAttackType || {}).forEach(([attackType, damageType]) => {
                    if (!validAttackTypes.has(attackType) || !validDamageTypes.has(damageType)) {
                        warnings.push({ level: "warn", message: `attackModeRules.${characterId}.${group}.${attackType} has an unsupported damage type: ${damageType}` });
                    }
                });
            });
        });
    }

    function validateWeaponEffectRegistry(registry, weaponModifiers, warnings) {
        const validActivationTypes = new Set(["always", "toggle", "stack", "option", "displayOnly"]);
        const validInputPolicies = new Set(["reflected", "calculate", "sourceContext", "displayOnly"]);
        const validTargetOwners = new Set(["self", "team", "activeCharacter", "enemy"]);
        Object.entries(registry?.weapons || {}).forEach(([weaponId, definition]) => {
            const modifierIds = new Set((weaponModifiers?.[weaponId]?.modifiers || []).map((modifier) => modifier.id));
            const seenGroups = new Set();
            (definition.groups || []).forEach((group) => {
                const path = `weaponEffectRegistry.${weaponId}.${group.id || "unknown"}`;
                if (!group.id || seenGroups.has(group.id)) warnings.push({ level: "warn", message: `${path} has a missing or duplicate group id.` });
                seenGroups.add(group.id);
                if (!group.name) warnings.push({ level: "warn", message: `${path} has no display name.` });
                if (!validActivationTypes.has(group.activation?.type)) warnings.push({ level: "warn", message: `${path} has an unsupported activation type.` });
                if (!validInputPolicies.has(group.inputPolicy)) warnings.push({ level: "warn", message: `${path} has an unsupported input policy.` });
                if (!validTargetOwners.has(group.targetOwner)) warnings.push({ level: "warn", message: `${path} has an unsupported target owner.` });
                (group.modifierIds || []).forEach((modifierId) => {
                    if (!modifierIds.has(modifierId)) warnings.push({ level: "warn", message: `${path} references unknown modifier ${modifierId}.` });
                });
            });
        });
    }

    function validateCalcData(data) {
        const warnings = [];
        validateTalentScalings(data.talentScalings, warnings);
        walkModifiers(data.talentModifiers, warnings, "talentModifiers", { talentScalings: data.talentScalings });
        walkModifiers(data.weaponModifiers, warnings, "weaponModifiers");
        validateWeaponEffectRegistry(data.weaponEffectRegistry, data.weaponModifiers, warnings);
        walkModifiers(data.artifactSetModifiers, warnings, "artifactSetModifiers");
        walkModifiers(data.constellationModifiers, warnings, "constellationModifiers");
        validateAttackModeRules(data.attackModeRules, warnings);
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
        validateCalcData,
        talentModifierRepresentedByScalings
    };
})();
