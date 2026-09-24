(function () {
    "use strict";

    const DATA_PATHS = {
        characters: "/games/genshin/data/characters.json",
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
        "/games/genshin/data/v2/candidates/7.0-provisional-weapons.json"
    ];

    const data = {
        characters: {},
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
                || document?.nonCanonical !== true || document?.targetGameVersion !== "7.0"
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

    function resolveCharacter(id) {
        return findEntry(data.characters, id);
    }

    function resolveCharacterConstellation(id) {
        return findEntry(data.characterConstellations, id);
    }

    function resolveCharacterTalent(id) {
        return findEntry(data.characterTalents, id);
    }

    function resolveUidTalentSkillMap(skillDepotId) {
        return findEntry(data.uidTalentSkillMap?.bySkillDepotId || {}, skillDepotId);
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

    function resolveArtifactSetEffect(id) {
        return findEntry(data.artifactSetEffects, id);
    }

    function listArtifactSets() {
        return Object.entries(data.artifactSets).map(([id, entry]) => ({ id, ...entry }));
    }

    function listCharacters() {
        return Object.entries(data.characters).map(([id, entry]) => ({ id, ...entry }));
    }

    function listWeapons() {
        return Object.entries(data.weapons).map(([id, entry]) => ({ id, ...entry }));
    }

    window.GenshinIdResolver = {
        ready,
        resolveCharacter,
        resolveCharacterTalent,
        resolveUidTalentSkillMap,
        resolveCharacterConstellation,
        resolveWeapon,
        resolveWeaponEffect,
        resolveArtifactSet,
        resolveArtifactSetEffect,
        listCharacters,
        listWeapons,
        listArtifactSets
    };
})();
