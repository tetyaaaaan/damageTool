(function () {
    "use strict";

    const DATA_PATHS = {
        originalEffectTexts: "/games/genshin/data/original/effect-texts-ja.json",
        characters: "/games/genshin/data/characters.json",
        characterOrder: "/games/genshin/data/character-release-order.json",
        uidTalentSkillMap: "/games/genshin/data/uid-talent-skill-map.json",
        characterTalents: "/games/genshin/data/character-talents.json",
        characterConstellations: "/games/genshin/data/character-constellations.json",
        weapons: "/games/genshin/data/weapons.json",
        artifactSets: "/games/genshin/data/artifact-sets.json",
        artifactSetEffects: "/games/genshin/data/artifact-set-effects.json",
        weaponEffects: "/games/genshin/data/weapon-effects.json"
    };
    const PROVISIONAL_PATHS = [
        "/games/genshin/data/v2/candidates/7.0-provisional-characters.json",
        "/games/genshin/data/v2/candidates/7.0-provisional-traveler-cryo.json",
        "/games/genshin/data/v2/candidates/7.0-provisional-weapons.json",
        "/games/genshin/data/v2/version-transitions/7.0-to-7.1/vesna-currentcalc.json",
        "/games/genshin/data/v2/version-transitions/7.0-to-7.1/vodyanitsa-currentcalc.json",
        "/games/genshin/data/v2/version-transitions/7.0-to-7.1/weapons-currentcalc-batch1.json",
        "/games/genshin/data/v2/version-transitions/7.0-to-7.1/weapon14524-currentcalc.json",
        "/games/genshin/data/v2/version-transitions/7.0-to-7.1/weapons-currentcalc-batch2.json"
    ];

    const data = {
        originalEffectTexts: {},
        characters: {},
        characterOrder: {},
        uidTalentSkillMap: {},
        characterTalents: {},
        characterConstellations: {},
        weapons: {},
        artifactSets: {},
        artifactSetEffects: {},
        weaponEffects: {}
    };

    function normalizeId(id) {
        return String(id ?? "").trim();
    }

    async function loadJson(key, path) {
        try {
            const response = await fetch(path, { cache: "no-cache" });
            if (!response.ok) throw new Error(`${path}: ${response.status}`);
            data[key] = await response.json();
        } catch (error) {
            console.warn(`Genshin data load failed: ${path}`, error);
            data[key] = {};
        }
    }

    async function loadProvisional(path) {
        try {
            const response = await fetch(path, { cache: "no-cache" });
            if (!response.ok) return;
            const document = await response.json();
            const boundary = document?.statusDetails || document;
            if (document?.schemaVersion !== 1 || document?.status !== "candidatePrepared"
                || document?.nonCanonical !== true || !["7.0", "7.1"].includes(document?.targetGameVersion)
                || boundary?.canonical !== false || boundary?.verificationComplete !== false
                || boundary?.runtimeConnected !== false || boundary?.failClosedCanonical !== true) return;
            if (Array.isArray(document.characters)) {
                const characterId = (value, key = "") => String(value?.sourceCharacterId || key).replace(/^provisional70_character_/, "");
                document.characters = Object.fromEntries(document.characters.map((value) => [characterId(value), {
                    nameJa: value.nameJa,
                    element: value.elementJa || value.element,
                    weaponType: value.weaponTypeJa || value.weaponType,
                    rarity: value.rarity,
                    imagePath: value.imagePath,
                    selectionLabelJa: value.selectionLabelJa
                }]));
                document.characterTalents = Object.fromEntries(Object.entries(document.characterTalents || {}).map(([key, value]) => {
                    const talents = value.talents || {};
                    return [characterId(value, key), {
                        normalAttack: talents.normalAttack ? { nameJa: talents.normalAttack.nameJa, normalDescriptionJa: talents.normalAttack.descriptionJa } : undefined,
                        skill: talents.skill ? { nameJa: talents.skill.nameJa, descriptionJa: talents.skill.descriptionJa } : undefined,
                        burst: talents.burst ? { nameJa: talents.burst.nameJa, descriptionJa: talents.burst.descriptionJa } : undefined,
                        passives: Object.entries(talents).filter(([talentKey]) => /^passive\d+$/.test(talentKey)).map(([sourceId, passive]) => ({
                            sourceId, nameJa: passive.nameJa, descriptionJa: passive.descriptionJa
                        }))
                    }];
                }));
                document.characterConstellations = Object.fromEntries(Object.entries(document.characterConstellations || {}).map(([key, value]) => [
                    characterId(value, key), {
                        constellations: Object.fromEntries(Object.entries(value.constellations || {}).map(([level, item]) => [
                            level.replace(/^c/, ""), { nameJa: item.nameJa, effectText: item.descriptionJa }
                        ]))
                    }
                ]));
            }
            const directCharacters = document.directcharacters || document.directCharacters || document.charactersById;
            if (directCharacters && typeof directCharacters === "object" && !Array.isArray(directCharacters)) {
                Object.entries(directCharacters).forEach(([id, value]) => {
                    if (!Object.prototype.hasOwnProperty.call(data.characters, id)) {
                        data.characters[id] = {
                            ...value,
                            dataStatus: "provisional",
                            verificationLabel: document.labelJa || "検証中"
                        };
                    }
                });
            }
            ["characters", "characterTalents", "characterConstellations", "weapons", "weaponEffects"].forEach((key) => {
                Object.entries(document[key] || {}).forEach(([id, value]) => {
                    if (!Object.prototype.hasOwnProperty.call(data[key], id)) {
                        data[key][id] = {
                            ...value,
                            dataStatus: "provisional",
                            verificationLabel: document.labelJa || "検証中"
                        };
                    }
                });
            });
        } catch (error) {
            console.warn(`Genshin provisional data load failed: ${path}`, error);
        }
    }

    const ready = Promise.all([
        loadJson("characters", DATA_PATHS.characters),
        loadJson("originalEffectTexts", DATA_PATHS.originalEffectTexts),
        loadJson("characterOrder", DATA_PATHS.characterOrder),
        loadJson("uidTalentSkillMap", DATA_PATHS.uidTalentSkillMap),
        loadJson("characterTalents", DATA_PATHS.characterTalents),
        loadJson("characterConstellations", DATA_PATHS.characterConstellations),
        loadJson("weapons", DATA_PATHS.weapons),
        loadJson("artifactSets", DATA_PATHS.artifactSets),
        loadJson("artifactSetEffects", DATA_PATHS.artifactSetEffects),
        loadJson("weaponEffects", DATA_PATHS.weaponEffects)
    ]).then(() => Promise.all(PROVISIONAL_PATHS.map(loadProvisional)));

    function findEntry(collection, id) {
        const normalizedId = normalizeId(id);
        if (!normalizedId) return null;
        return collection[normalizedId] || null;
    }


    // Display provenance is explicit. Modifier sourceText/labels are not original-text evidence.
    function describeEffect({ data: collection = data, kind, id, sourceId, pieceCount, refinement = 1 } = {}) {
        const originals = collection.originalEffectTexts || {};
        let original = null;
        let calculationSummary = "";
        if (kind === "weapon") {
            original = originals.weapons?.[id];
            const effect = collection.weaponEffects?.[id] || {};
            calculationSummary = substituteEffectParams(effect.effectTextTemplate, effect.effectParamsByRefinement?.[String(refinement)]);
        } else if (kind === "artifact") {
            original = originals.artifacts?.[id]?.[Number(pieceCount) === 4 ? "fourPiece" : "twoPiece"];
            const effect = collection.artifactSetEffects?.[id] || {};
            calculationSummary = Number(pieceCount) === 4 ? effect.fourPieceEffect : effect.twoPieceEffect;
        } else if (kind === "talent") {
            const key = String(sourceId || "").replace(/_/g, "");
            original = originals.characters?.[id]?.talents?.[key];
            const talents = collection.characterTalents?.[id] || {};
            const item = ({ combat1: talents.normalAttack, combat2: talents.skill, combat3: talents.burst, special: talents.special })[key]
                || (talents.passives || []).find((passive) => String(passive.sourceId || "").replace(/_/g, "") === key)
                || (/^passive\d+$/.test(key) ? talents.passives?.[Number(key.match(/\d+/)[0]) - 1] : null);
            if (!original && item && (talents.passives || []).includes(item)) {
                original = originals.characters?.[id]?.talents?.[`passive${talents.passives.indexOf(item) + 1}`];
            }
            calculationSummary = key === "combat1"
                ? [...new Set([item?.normalDescriptionJa, item?.chargedDescriptionJa, item?.plungingDescriptionJa].filter(Boolean))].join("\n\n")
                : item?.descriptionJa || "";
        } else if (kind === "constellation") {
            original = originals.characters?.[id]?.constellations?.[String(sourceId).replace(/^C/, "")];
            calculationSummary = collection.characterConstellations?.[id]?.constellations?.[String(sourceId).replace(/^C/, "")]?.effectText || "";
        }
        const originalText = original?.originalTextByRefinement?.[String(refinement)]
            || substituteEffectParams(original?.originalTextTemplate, original?.originalParamsByRefinement?.[String(refinement)])
            || original?.originalText || "";
        return {
            originalText: cleanOriginalText(originalText),
            relatedEffects: resolveRelatedEffectTexts(original?.relatedEffects, originalText),
            calculationSummary: originalText ? "" : cleanOriginalText(calculationSummary),
            descriptionKind: originalText ? (original?.isExcerpt ? "originalExcerpt" : "original") : "summary"
        };
    }

    // Only independently saved full originals become related-effect cards.
    function resolveRelatedEffectTexts(effects) {
        return (effects || []).filter(effect => effect.originalText && !effect.originalFromParent
            && !effect.isExcerpt && !['B','C'].includes(effect.classification)
            && effect.descriptionKind === 'original').map(effect => ({
                ...effect, originalText: cleanOriginalText(effect.originalText), descriptionKind: 'original',
                relatedEffects: resolveRelatedEffectTexts(effect.relatedEffects)
            }));
    }

    function substituteEffectParams(template, params) {
        const text = String(template || "").replace(/\{([^}]+)\}/g, (token, key) => params?.[key] ?? token);
        // A partially expanded source is not suitable for user-facing text.
        return /\{[^}]+\}/.test(text) ? "" : text;
    }

    function cleanOriginalText(text) {
        return String(text || "").replace(/\*\*/g, "").trim();
    }

    function resolveCharacter(id) {
        return findEntry(data.characters, id);
    }

    function resolveCharacterConstellation(id) {
        return findEntry(data.characterConstellations, id);
    }

    function resolveCharacterTalent(id) {
        return findEntry(data.characterTalents, id);
    }

    function resolveUidTalentSkillMap(skillDepotId, characterId) {
        return findEntry(data.uidTalentSkillMap?.byCharacterId || {}, characterId)
            || findEntry(data.uidTalentSkillMap?.bySkillDepotId || {}, skillDepotId);
    }

    function resolveWeapon(id) {
        return findEntry(data.weapons, id);
    }

    function resolveWeaponEffect(id) {
        return findEntry(data.weaponEffects, id);
    }

    function resolveArtifactSet(id) {
        return findEntry(data.artifactSets, id);
    }

    function imagePathFor(kind, id) {
        const normalizedId = normalizeId(id);
        if (!normalizedId) return "";
        const collections = {
            character: data.characters,
            weapon: data.weapons,
            artifactSet: data.artifactSets
        };
        const folders = { character: "characters", weapon: "weapons", artifactSet: "artifacts" };
        const entry = findEntry(collections[kind] || {}, normalizedId);
        const mappedPath = typeof entry?.imagePath === "string" ? entry.imagePath.trim() : "";
        if (mappedPath) {
            const localPath = mappedPath.replace(/^\/?games\/images\/genshin\//, "/games/images/genshin/");
            if (localPath.startsWith("/games/images/genshin/")) return localPath;
        }
        const folder = folders[kind];
        return folder ? `/games/images/genshin/${folder}/${encodeURIComponent(normalizedId)}.webp` : "";
    }

    function resolveCharacterImagePath(id) { return imagePathFor("character", id); }
    function resolveWeaponImagePath(id) { return imagePathFor("weapon", id); }
    function resolveArtifactSetImagePath(id) { return imagePathFor("artifactSet", id); }

    function resolveArtifactSetEffect(id) {
        return findEntry(data.artifactSetEffects, id);
    }

    function listArtifactSets() {
        return Object.entries(data.artifactSets).map(([id, entry]) => ({ id, ...entry }));
    }

    function listCharacters() {
        return sortCharacters(Object.entries(data.characters).map(([id, entry]) => ({ id, ...entry })));
    }

    function compareCharacters(left, right) {
        const order = data.characterOrder.order || [];
        const leftRank = order.indexOf(normalizeId(left.id));
        const rightRank = order.indexOf(normalizeId(right.id));
        return (leftRank < 0 ? Infinity : leftRank) - (rightRank < 0 ? Infinity : rightRank) || 0;
    }

    function sortCharacters(characters) {
        return [...characters].sort(compareCharacters);
    }

    function listWeapons() {
        return Object.entries(data.weapons).map(([id, entry]) => ({ id, ...entry }));
    }

    window.GenshinIdResolver = {
        ready,
        describeEffect,
        resolveCharacter,
        resolveCharacterTalent,
        resolveUidTalentSkillMap,
        resolveCharacterConstellation,
        resolveWeapon,
        resolveWeaponEffect,
        resolveArtifactSet,
        resolveArtifactSetEffect,
        resolveCharacterImagePath,
        resolveWeaponImagePath,
        resolveArtifactSetImagePath,
        listCharacters,
        compareCharacters,
        sortCharacters,
        listWeapons,
        listArtifactSets
    };
})();
