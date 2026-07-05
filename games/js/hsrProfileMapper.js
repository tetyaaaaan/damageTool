(function () {
    "use strict";

    function pickNumber(value, fallback = 0) {
        const num = Number(value);
        return Number.isFinite(num) ? num : fallback;
    }

    function pickText(value, fallback = "-") {
        return typeof value === "string" && value.trim() ? value : fallback;
    }

    function readPath(source, paths, fallback = undefined) {
        for (const path of paths) {
            let current = source;
            let found = true;
            for (const key of path) {
                if (current && Object.prototype.hasOwnProperty.call(current, key)) {
                    current = current[key];
                } else {
                    found = false;
                    break;
                }
            }
            if (found && current !== undefined && current !== null) {
                return current;
            }
        }
        return fallback;
    }

    function findProperty(properties, names) {
        if (!Array.isArray(properties)) return undefined;
        return properties.find((item) => names.includes(item?.field) || names.includes(item?.type) || names.includes(item?.name));
    }

    function readStat(character, names, fallback = 0) {
        const properties = [
            ...(Array.isArray(character.properties) ? character.properties : []),
            ...(Array.isArray(character.propertyList) ? character.propertyList : []),
            ...(Array.isArray(character.avatarPropertyList) ? character.avatarPropertyList : []),
            ...(Array.isArray(character.additions) ? character.additions : []),
            ...(Array.isArray(character.attributes) ? character.attributes : [])
        ];
        const found = findProperty(properties, names);
        return pickNumber(found?.value ?? found?.display ?? found?.percent, fallback);
    }

    function normalizePercent(value) {
        const num = pickNumber(value, 0);
        return Math.abs(num) <= 10 ? num * 100 : num;
    }

    function mapElement(character) {
        return pickText(readPath(character, [["element", "name"], ["element"], ["damage_type", "name"]], "-"));
    }

    function mapPath(character) {
        return pickText(readPath(character, [["path", "name"], ["path"], ["destiny", "name"], ["destiny"]], "-"));
    }

    function mapLightCone(character) {
        const lightCone = readPath(character, [["light_cone"], ["weapon"]], null);
        if (!lightCone) return null;
        return {
            name: pickText(lightCone.name),
            level: pickNumber(lightCone.level),
            rank: pickNumber(lightCone.rank)
        };
    }

    function mapRelics(character) {
        const relics = readPath(character, [["relics"]], []);
        if (!Array.isArray(relics)) return [];
        return relics.map((relic) => ({
            name: pickText(relic.name),
            level: pickNumber(relic.level),
            rarity: pickNumber(relic.rarity)
        }));
    }

    function mapTraces(character) {
        const skills = readPath(character, [["skills"]], []);
        if (!Array.isArray(skills)) return [];
        return skills.map((skill) => ({
            name: pickText(skill.name),
            level: pickNumber(skill.level)
        }));
    }

    function mapCharacter(character) {
        const stats = {
            hp: pickNumber(readPath(character, [["attributes", "hp"], ["stats", "hp"], ["final_stats", "hp"]], readStat(character, ["hp", "HP"]))),
            atk: pickNumber(readPath(character, [["attributes", "atk"], ["stats", "atk"], ["final_stats", "atk"]], readStat(character, ["atk", "attack", "攻撃力"]))),
            def: pickNumber(readPath(character, [["attributes", "def"], ["stats", "def"], ["final_stats", "def"]], readStat(character, ["def", "defence", "防御力"]))),
            speed: pickNumber(readPath(character, [["attributes", "spd"], ["stats", "spd"], ["final_stats", "spd"]], readStat(character, ["spd", "speed", "速度"]))),
            critRate: normalizePercent(readStat(character, ["crit_rate", "critRate", "会心率"])),
            critDamage: normalizePercent(readStat(character, ["crit_dmg", "critDamage", "会心ダメージ"])),
            breakEffect: normalizePercent(readStat(character, ["break_dmg", "breakEffect", "撃破特効"])),
            energyRegen: normalizePercent(readStat(character, ["energy_recovery", "energyRegen", "EP回復効率"])),
            elementalDamage: normalizePercent(readStat(character, ["element_dmg", "damage_boost", "属性与ダメージ"]))
        };

        return {
            id: String(character.id ?? character.name ?? Math.random()),
            name: pickText(character.name),
            level: pickNumber(character.level),
            element: mapElement(character),
            path: mapPath(character),
            eidolon: pickNumber(character.rank ?? character.eidolon),
            lightCone: mapLightCone(character),
            relics: mapRelics(character),
            traces: mapTraces(character),
            stats
        };
    }

    function mapProfileResponse(response) {
        const player = readPath(response, [["player"], ["detailInfo", "recordInfo"], ["detailInfo"], ["recordInfo"]], {});
        const rawCharacters = readPath(response, [["characters"], ["avatar_list"], ["avatars"], ["detailInfo", "avatarDetailList"], ["detailInfo", "assistAvatarList"]], []);
        const characters = Array.isArray(rawCharacters) ? rawCharacters.map(mapCharacter) : [];
        return {
            player: {
                nickname: pickText(player.nickname ?? player.name, "プレイヤー"),
                level: pickNumber(player.level),
                uid: pickText(player.uid)
            },
            characters
        };
    }

    window.HsrProfileMapper = { mapProfileResponse };
})();
