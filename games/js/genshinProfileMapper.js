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

    const CHARACTER_NAME_BY_AVATAR_ID = {
        "10000002": "神里綾華",
        "10000003": "ジン",
        "10000005": "旅人",
        "10000006": "リサ",
        "10000007": "旅人",
        "10000014": "バーバラ",
        "10000015": "ガイア",
        "10000016": "ディルック",
        "10000020": "レザー",
        "10000021": "アンバー",
        "10000022": "ウェンティ",
        "10000023": "香菱",
        "10000024": "北斗",
        "10000025": "行秋",
        "10000026": "魈",
        "10000027": "凝光",
        "10000029": "クレー",
        "10000030": "鍾離",
        "10000031": "フィッシュル",
        "10000032": "ベネット",
        "10000033": "タルタリヤ",
        "10000034": "ノエル",
        "10000035": "七七",
        "10000036": "重雲",
        "10000037": "甘雨",
        "10000038": "アルベド",
        "10000039": "ディオナ",
        "10000041": "モナ",
        "10000042": "刻晴",
        "10000043": "スクロース",
        "10000044": "辛炎",
        "10000045": "ロサリア",
        "10000046": "胡桃",
        "10000047": "楓原万葉",
        "10000048": "煙緋",
        "10000049": "宵宮",
        "10000050": "トーマ",
        "10000051": "エウルア",
        "10000052": "雷電将軍",
        "10000053": "早柚",
        "10000054": "珊瑚宮心海",
        "10000055": "ゴロー",
        "10000056": "九条裟羅",
        "10000057": "荒瀧一斗",
        "10000058": "八重神子",
        "10000059": "鹿野院平蔵",
        "10000060": "夜蘭",
        "10000062": "アーロイ",
        "10000063": "申鶴",
        "10000064": "雲菫",
        "10000065": "久岐忍",
        "10000066": "神里綾人",
        "10000067": "コレイ",
        "10000068": "ドリー",
        "10000069": "ティナリ",
        "10000070": "ニィロウ",
        "10000071": "セノ",
        "10000072": "キャンディス",
        "10000073": "ナヒーダ",
        "10000074": "レイラ",
        "10000075": "放浪者",
        "10000076": "ファルザン",
        "10000077": "ヨォーヨ",
        "10000078": "アルハイゼン",
        "10000079": "ディシア",
        "10000080": "ミカ",
        "10000081": "カーヴェ",
        "10000082": "白朮",
        "10000083": "リネット",
        "10000084": "リネ",
        "10000085": "フレミネ",
        "10000086": "リオセスリ",
        "10000087": "ヌヴィレット",
        "10000088": "シャルロット",
        "10000089": "フリーナ",
        "10000090": "シュヴルーズ",
        "10000091": "ナヴィア",
        "10000092": "嘉明",
        "10000093": "閑雲",
        "10000094": "千織",
        "10000095": "シグウィン",
        "10000096": "アルレッキーノ",
        "10000097": "セトス",
        "10000098": "クロリンデ",
        "10000099": "エミリエ",
        "10000100": "カチーナ",
        "10000101": "キィニチ",
        "10000102": "ムアラニ",
        "10000103": "シロネン",
        "10000104": "チャスカ",
        "10000105": "オロルン",
        "10000106": "マーヴィカ",
        "10000107": "シトラリ",
        "10000108": "藍硯"
    };

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
        return Math.abs(num) <= 10 ? num * 100 : num;
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
        const mappedName = CHARACTER_NAME_BY_AVATAR_ID[avatarId];

        return {
            id: avatarId,
            name: pickText(avatar?.name || avatar?.avatarName || mappedName, `\u30ad\u30e3\u30e9\u30af\u30bf\u30fcID: ${avatarId}`),
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
