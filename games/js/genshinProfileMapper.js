(function () {
    "use strict";

    const FIGHT_PROPS = {
        maxHp: 2000,
        atk: 2001,
        def: 2002,
        elementalMastery: 28,
        critRate: 20,
        critDamage: 22,
        energyRecharge: 23
    };

    const ELEMENT_DAMAGE_PROPS = [
        { key: 40, name: "\u708e" },
        { key: 41, name: "\u96f7" },
        { key: 42, name: "\u6c34" },
        { key: 43, name: "\u8349" },
        { key: 44, name: "\u98a8" },
        { key: 45, name: "\u5ca9" },
        { key: 46, name: "\u6c37" },
        { key: 30, name: "\u7269\u7406" }
    ];

    function pickNumber(value, fallback = 0) {
        const num = Number(value);
        return Number.isFinite(num) ? num : fallback;
    }

    function pickText(value, fallback = "-") {
        return typeof value === "string" && value.trim() ? value : fallback;
    }

    function readFightProp(avatar, key, fallback = 0) {
        return pickNumber(avatar?.fightPropMap?.[String(key)] ?? avatar?.fightPropMap?.[key], fallback);
    }

    function readPropMapValue(avatar, key, fallback = 0) {
        return pickNumber(avatar?.propMap?.[String(key)]?.val ?? avatar?.propMap?.[key]?.val, fallback);
    }

    function normalizePercent(value) {
        const num = pickNumber(value, 0);
        return Math.abs(num) <= 1 ? num * 100 : num;
    }

    function mapBestElementDamage(avatar) {
        const damages = ELEMENT_DAMAGE_PROPS.map((item) => ({
            element: item.name,
            value: normalizePercent(readFightProp(avatar, item.key))
        })).filter((item) => item.value > 0);

        damages.sort((a, b) => b.value - a.value);
        return damages[0] || { element: "-", value: 0 };
    }

    function mapWeapon(avatar) {
        const weapon = (avatar?.equipList || []).find((item) => item?.flat?.itemType === "ITEM_WEAPON");
        if (!weapon) return null;

        return {
            id: String(weapon.itemId || "-"),
            level: pickNumber(weapon.weapon?.level),
            rank: pickNumber(weapon.weapon?.affixMap ? Object.values(weapon.weapon.affixMap)[0] : 0)
        };
    }

    function mapArtifacts(avatar) {
        return (avatar?.equipList || [])
            .filter((item) => item?.flat?.itemType === "ITEM_RELIQUARY")
            .map((item) => ({
                id: String(item.itemId || "-"),
                level: pickNumber(item.reliquary?.level),
                slot: pickText(item.flat?.equipType, "-")
            }));
    }

    function mapCharacter(avatar) {
        const bestDamage = mapBestElementDamage(avatar);
        const avatarId = String(avatar?.avatarId || "-");
        const level = readPropMapValue(avatar, 4001);

        return {
            id: avatarId,
            name: pickText(avatar?.name || avatar?.avatarName, `\u30ad\u30e3\u30e9\u30af\u30bf\u30fcID: ${avatarId}`),
            level,
            element: bestDamage.element,
            constellation: Array.isArray(avatar?.talentIdList) ? avatar.talentIdList.length : 0,
            weapon: mapWeapon(avatar),
            artifacts: mapArtifacts(avatar),
            stats: {
                hp: readFightProp(avatar, FIGHT_PROPS.maxHp),
                atk: readFightProp(avatar, FIGHT_PROPS.atk),
                def: readFightProp(avatar, FIGHT_PROPS.def),
                elementalMastery: readFightProp(avatar, FIGHT_PROPS.elementalMastery),
                critRate: normalizePercent(readFightProp(avatar, FIGHT_PROPS.critRate)),
                critDamage: normalizePercent(readFightProp(avatar, FIGHT_PROPS.critDamage)),
                energyRecharge: normalizePercent(readFightProp(avatar, FIGHT_PROPS.energyRecharge)),
                elementalDamage: bestDamage.value
            }
        };
    }

    function mapProfileResponse(response) {
        const playerInfo = response?.playerInfo || {};
        const rawCharacters = Array.isArray(response?.avatarInfoList) ? response.avatarInfoList : [];

        return {
            player: {
                nickname: pickText(playerInfo.nickname, "\u30d7\u30ec\u30a4\u30e4\u30fc"),
                level: pickNumber(playerInfo.level),
                worldLevel: pickNumber(playerInfo.worldLevel),
                uid: pickText(playerInfo.uid)
            },
            ttl: pickNumber(response?.ttl),
            characters: rawCharacters.map(mapCharacter)
        };
    }

    window.GenshinProfileMapper = { mapProfileResponse };
})();
