(function () {
    "use strict";

    const DATA_PATH = "/games/genshin/data/base-stats.json";
    const ASCENSION_LEVELS = [20, 40, 50, 60, 70, 80];
    let data = { curves: {}, characters: {}, weapons: {}, maxLevel: 100 };

    function clampLevel(value, fallback = 90) {
        const number = Math.round(Number(value));
        return Number.isFinite(number) ? Math.min(Math.max(number, 1), Number(data.maxLevel) || 100) : fallback;
    }

    function inferredAscension(level, availableStages) {
        const normalizedLevel = clampLevel(level);
        const maxStage = Math.max(0, Number(availableStages || 1) - 1);
        const stage = ASCENSION_LEVELS.filter((threshold) => normalizedLevel >= threshold).length;
        return Math.min(stage, maxStage);
    }

    function stageIndex(level, requested, availableStages) {
        const maxStage = Math.max(0, Number(availableStages || 1) - 1);
        if (requested === null || requested === undefined || requested === "") return inferredAscension(level, availableStages);
        const numeric = Number(requested);
        if (Number.isInteger(numeric)) return Math.min(Math.max(numeric, 0), maxStage);
        return inferredAscension(level, availableStages);
    }

    function curveValue(curveId, level) {
        const curve = data.curves?.[String(curveId)] || [];
        return Number(curve[clampLevel(level) - 1]) || 0;
    }

    function resolveCharacter(characterId, level = 90, ascension = null) {
        const source = data.characters?.[String(characterId)];
        if (!source) return null;
        const stages = source.promoteProps || [];
        const stage = stageIndex(level, ascension, stages.length);
        const promoted = stages[stage] || {};
        const resolve = (propId) => {
            const base = Number(source.baseProps?.[propId]) || 0;
            const growth = curveValue(source.curveIds?.[propId], level);
            return base * growth + (Number(promoted[propId]) || 0);
        };
        return {
            characterId: String(characterId),
            level: clampLevel(level),
            ascension: stage,
            baseHp: resolve("1"),
            characterBaseAtk: resolve("4"),
            baseDef: resolve("7")
        };
    }

    function resolveWeapon(weaponId, level = 90, ascension = null) {
        const source = data.weapons?.[String(weaponId)];
        if (!source) return null;
        const stages = source.basePromote || [];
        const weaponLevel = Math.min(clampLevel(level), 90);
        const stage = stageIndex(weaponLevel, ascension, stages.length);
        const base = Number(source.baseProps?.["4"]) || 0;
        return {
            weaponId: String(weaponId),
            level: weaponLevel,
            ascension: stage,
            weaponBaseAtk: base * curveValue(source.curveIds?.["4"], weaponLevel) + (Number(stages[stage]) || 0)
        };
    }

    function resolveMember({ characterId, weaponId, level = 90, weaponLevel = 90, ascension = null, weaponAscension = null } = {}) {
        const character = resolveCharacter(characterId, level, ascension);
        if (!character) return null;
        const weapon = resolveWeapon(weaponId, weaponLevel, weaponAscension);
        return {
            ...character,
            ...(weapon || { weaponId: "", weaponLevel: clampLevel(weaponLevel), weaponBaseAtk: 0 }),
            baseAtk: character.characterBaseAtk + (weapon?.weaponBaseAtk || 0)
        };
    }

    function writeDerivedInput(id, value) {
        const input = document.getElementById(id);
        if (!input) return;
        if (!Number.isFinite(value) || value <= 0) {
            input.value = "";
            delete input.dataset.preciseValue;
            return;
        }
        input.value = String(value);
        input.dataset.preciseValue = String(value);
        input.dataset.valueOrigin = "manual";
        input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function syncMainInputs() {
        const resolved = resolveMember({
            characterId: document.getElementById("genshinCalcCharacterId")?.value,
            weaponId: document.getElementById("genshinCalcWeaponId")?.value,
            level: document.getElementById("genshinReflectLevel")?.value,
            weaponLevel: document.getElementById("genshinWeaponLevel")?.value
        });
        writeDerivedInput("genshinBaseHpInput", resolved?.baseHp);
        writeDerivedInput("genshinBaseAtkInput", resolved?.baseAtk);
        writeDerivedInput("genshinBaseDefInput", resolved?.baseDef);
        return resolved;
    }

    const ready = fetch(DATA_PATH, { cache: "no-cache" })
        .then((response) => {
            if (!response.ok) throw new Error(`${DATA_PATH}: ${response.status}`);
            return response.json();
        })
        .then((json) => { data = json; return data; })
        .catch((error) => {
            console.warn("Genshin base stat data load failed", error);
            return data;
        });

    async function initialize() {
        await ready;
        ["genshinCalcCharacterId", "genshinCalcWeaponId", "genshinReflectLevel", "genshinWeaponLevel"].forEach((id) => {
            const input = document.getElementById(id);
            input?.addEventListener("input", syncMainInputs);
            input?.addEventListener("change", syncMainInputs);
        });
        syncMainInputs();
    }

    window.GenshinBaseStats = {
        ready,
        clampLevel,
        inferredAscension,
        resolveCharacter,
        resolveWeapon,
        resolveMember,
        syncMainInputs
    };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
    else initialize();
})();
