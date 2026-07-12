(function () {
    "use strict";

    const DATA_PATHS = {
        characters: "/games/genshin/data/characters.json",
        characterConstellations: "/games/genshin/data/character-constellations.json",
        weapons: "/games/genshin/data/weapons.json",
        artifactSets: "/games/genshin/data/artifact-sets.json",
        artifactSetEffects: "/games/genshin/data/artifact-set-effects.json",
        weaponEffects: "/games/genshin/data/weapon-effects.json"
    };

    const data = {
        characters: {},
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

    const ready = Promise.all([
        loadJson("characters", DATA_PATHS.characters),
        loadJson("characterConstellations", DATA_PATHS.characterConstellations),
        loadJson("weapons", DATA_PATHS.weapons),
        loadJson("artifactSets", DATA_PATHS.artifactSets),
        loadJson("artifactSetEffects", DATA_PATHS.artifactSetEffects),
        loadJson("weaponEffects", DATA_PATHS.weaponEffects)
    ]);

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

    window.GenshinIdResolver = {
        ready,
        resolveCharacter,
        resolveCharacterConstellation,
        resolveWeapon,
        resolveWeaponEffect,
        resolveArtifactSet,
        resolveArtifactSetEffect,
        listArtifactSets
    };
})();
