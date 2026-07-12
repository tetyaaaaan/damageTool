(function () {
    "use strict";

    const DATA_PATHS = {
        characters: "/games/genshin/data/characters.json",
        weapons: "/games/genshin/data/weapons.json",
        artifactSets: "/games/genshin/data/artifact-sets.json"
    };

    const data = {
        characters: {},
        weapons: {},
        artifactSets: {}
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
        loadJson("weapons", DATA_PATHS.weapons),
        loadJson("artifactSets", DATA_PATHS.artifactSets)
    ]);

    function findEntry(collection, id) {
        const normalizedId = normalizeId(id);
        if (!normalizedId) return null;
        return collection[normalizedId] || null;
    }

    function resolveCharacter(id) {
        return findEntry(data.characters, id);
    }

    function resolveWeapon(id) {
        return findEntry(data.weapons, id);
    }

    function resolveArtifactSet(id) {
        return findEntry(data.artifactSets, id);
    }

    function listArtifactSets() {
        return Object.entries(data.artifactSets).map(([id, entry]) => ({ id, ...entry }));
    }

    window.GenshinIdResolver = {
        ready,
        resolveCharacter,
        resolveWeapon,
        resolveArtifactSet,
        listArtifactSets
    };
})();
