(function () {
    "use strict";

    const DATA_PATH = "/games/genshin/data/base-stats.json";
    const PROVISIONAL_PATHS = [
        "/games/genshin/data/v2/candidates/7.0-provisional-characters.json",
        "/games/genshin/data/v2/candidates/7.0-provisional-weapons.json"
    ];
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
        if (Array.isArray(source.resolvedCheckpoints)) {
            const normalizedLevel = clampLevel(level);
            const inferredStage = ASCENSION_LEVELS.filter((threshold) => normalizedLevel >= threshold).length;
            const requestedStage = ascension === null || ascension === undefined || ascension === ""
                ? Math.min(inferredStage, 6)
                : Math.min(Math.max(Number(ascension) || 0, 0), 6);
            const checkpointStage = (row) => {
                if (Number.isInteger(Number(row.ascension))) return Number(row.ascension);
                const boundaryIndex = ASCENSION_LEVELS.indexOf(Number(row.level));
                if (boundaryIndex < 0) return Number(row.level) <= 1 ? 0 : 6;
                return row.ascension === "after" ? boundaryIndex + 1 : boundaryIndex;
            };
            const row = source.resolvedCheckpoints.find((item) => Number(item.level) === normalizedLevel && checkpointStage(item) === requestedStage);
            if (!row) return null;
            return {
                characterId: String(characterId),
                level: normalizedLevel,
                ascension: requestedStage,
                baseHp: Number(row.hp) || 0,
                characterBaseAtk: Number(row.atk) || 0,
                baseDef: Number(row.def) || 0,
                dataStatus: "provisional"
            };
        }
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
        if (source.levelStats && typeof source.levelStats === "object") {
            const weaponLevel = Math.min(clampLevel(level), 90);
            const row = source.levelStats[String(weaponLevel)];
            if (!row || !Number.isFinite(Number(row.baseAtk))) return null;
            return {
                weaponId: String(weaponId),
                level: weaponLevel,
                ascension: ascension === null || ascension === undefined || ascension === "" ? null : Number(ascension),
                weaponBaseAtk: Number(row.baseAtk),
                dataStatus: "provisional"
            };
        }
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

    function applyProvisionalBaseStats(target, document) {
        const boundary = document?.statusDetails || document;
        if (document?.schemaVersion !== 1 || document?.status !== "candidatePrepared"
            || document?.nonCanonical !== true || document?.targetGameVersion !== "7.0"
            || boundary?.canonical !== false || boundary?.verificationComplete !== false
            || boundary?.runtimeConnected !== false || boundary?.failClosedCanonical !== true) return;
        let source = document.baseStats || {};
        if (!source.characters && Array.isArray(document.characters)) {
            const levelOneHp = { "10000148": 1003, "10000150": 1011 };
            source = {
                characters: Object.fromEntries(Object.entries(source).map(([key, value]) => {
                    const id = String(value?.sourceCharacterId || key).replace(/^provisional70_character_/, "");
                    const first = (value.levelRows || [])[0] || {};
                    const last = [...(value.levelRows || [])].reverse().find((row) => Number(row.level) === 90) || {};
                    return [id, {
                        resolvedCheckpoints: [
                            { level: 1, ascension: 0, hp: levelOneHp[id], atk: first.atk, def: first.def },
                            { level: 90, ascension: 6, hp: last.hp, atk: last.atk, def: last.def }
                        ]
                    }];
                }))
            };
        }
        ["characters", "weapons"].forEach((kind) => {
            target[kind] ||= {};
            Object.entries(source[kind] || {}).forEach(([id, value]) => {
                if (!Object.prototype.hasOwnProperty.call(target[kind], id)) {
                    target[kind][id] = { ...value, dataStatus: "provisional", verificationLabel: document.labelJa || "検証中" };
                }
            });
        });
        target.curves ||= {};
        Object.entries(source.curves || {}).forEach(([id, value]) => {
            if (!Object.prototype.hasOwnProperty.call(target.curves, id)) target.curves[id] = value;
        });
    }

    const ready = Promise.all([
        fetch(DATA_PATH, { cache: "no-cache" }).then((response) => {
            if (!response.ok) throw new Error(`${DATA_PATH}: ${response.status}`);
            return response.json();
        }),
        ...PROVISIONAL_PATHS.map((path) => fetch(path, { cache: "no-cache" })
            .then((response) => response.ok ? response.json() : null)
            .catch(() => null))
    ])
        .then(([json, ...provisional]) => {
            data = json;
            provisional.forEach((document) => applyProvisionalBaseStats(data, document));
            return data;
        })
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
