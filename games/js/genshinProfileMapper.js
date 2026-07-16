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
        { key: 40, element: "炎", label: "炎元素ダメージ" },
        { key: 41, element: "雷", label: "雷元素ダメージ" },
        { key: 42, element: "水", label: "水元素ダメージ" },
        { key: 43, element: "草", label: "草元素ダメージ" },
        { key: 44, element: "風", label: "風元素ダメージ" },
        { key: 45, element: "岩", label: "岩元素ダメージ" },
        { key: 46, element: "氷", label: "氷元素ダメージ" },
        { key: 30, element: "物理", label: "物理ダメージ" }
    ];

    const LOCALE_KEYS = ["ja", "JP", "ja-JP", "ja_jp", "JPN", "Japanese", "en", "EN", "en-US", "ENG", "English"];

    const EQUIP_TYPE_NAMES = {
        EQUIP_BRACER: "\u751f\u306e\u82b1",
        EQUIP_NECKLACE: "\u6b7b\u306e\u7fbd",
        EQUIP_SHOES: "\u6642\u306e\u7802",
        EQUIP_RING: "\u7a7a\u306e\u676f",
        EQUIP_DRESS: "\u7406\u306e\u51a0"
    };

    const CHARACTER_NAME_BY_AVATAR_ID_JA = {
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

    function pickLocalizedName(nameTextMap, fallback = "") {
        if (!nameTextMap || typeof nameTextMap !== "object") return fallback;
        for (const key of LOCALE_KEYS) {
            const text = nameTextMap[key];
            if (typeof text === "string" && text.trim()) return text.trim();
        }
        const firstText = Object.values(nameTextMap).find((text) => typeof text === "string" && text.trim());
        return firstText ? firstText.trim() : fallback;
    }
    function pickFlatName(flat, fallback = "") {
        if (!flat || typeof flat !== "object") return fallback;
        const directName = pickText(flat.itemName || flat.name || flat.displayName, "");
        if (directName) return directName;
        return pickLocalizedName(flat.nameTextMap, "") ||
            pickLocalizedName(flat.setNameTextMap, "") ||
            pickLocalizedName(flat.reliquarySetNameTextMap, "") ||
            fallback;
    }
    function unknownName(id) {
        return `\u540d\u79f0\u4e0d\u660e\uff08ID: ${id || "-"}\uff09`;
    }

    function unsupportedName(type, id) {
        return `未対応${type}（ID: ${id || "-"}）`;
    }

    function readPromoteLevel(item) {
        return pickNumber(item?.weapon?.promoteLevel ?? item?.reliquary?.promoteLevel ?? item?.promoteLevel);
    }

    function normalizeAffixRank(value) {
        const affixRank = pickNumber(value, 0);
        if (affixRank >= 0 && affixRank <= 4) return affixRank + 1;
        return 1;
    }

    function mapTalentLevels(avatar) {
        const raw = avatar?.skillLevelMap || avatar?.avatarSkillLevelMap || {};
        const values = Object.values(raw).map((value) => pickNumber(value)).filter((value) => value > 0);
        return {
            normal: values[0] || 1,
            skill: values[1] || 1,
            burst: values[2] || 1
        };
    }

    function readFlatText(flat, keys) {
        if (!flat || typeof flat !== "object") return "";
        for (const key of keys) {
            const value = flat[key];
            if (typeof value === "string" && value.trim()) return value.trim();
            const localized = pickLocalizedName(value, "");
            if (localized) return localized;
        }
        return "";
    }

    function getGenshinResolverEntry(kind, id) {
        const resolver = window.GenshinIdResolver;
        if (!resolver) return null;
        if (kind === "character" && typeof resolver.resolveCharacter === "function") return resolver.resolveCharacter(id);
        if (kind === "weapon" && typeof resolver.resolveWeapon === "function") return resolver.resolveWeapon(id);
        if (kind === "artifactSet" && typeof resolver.resolveArtifactSet === "function") return resolver.resolveArtifactSet(id);
        return null;
    }

    function warnUnsupportedId(kind, id) {
        if (!id || id === "-") return;
        console.warn(`[genshin-id-resolver] 未登録ID: ${kind} ${id}`);
    }

    function resolveNameFromJson(kind, id, fallback, unsupportedType) {
        const entry = getGenshinResolverEntry(kind, id);
        const jsonName = pickText(entry?.nameJa || entry?.name, "");
        if (jsonName) return jsonName;
        warnUnsupportedId(kind, id);
        return unsupportedName(unsupportedType, id);
    }

    function resolveNumberFromJson(kind, id, key, fallback = 0) {
        const entry = getGenshinResolverEntry(kind, id);
        return pickNumber(entry?.[key], fallback);
    }

    function resolveTextFromJson(kind, id, key, fallback = "-") {
        const entry = getGenshinResolverEntry(kind, id);
        return pickText(entry?.[key], fallback);
    }

    function readArtifactSetId(item) {
        return String(
            item?.flat?.setId ||
            item?.flat?.reliquarySetId ||
            item?.flat?.reliquarySet?.id ||
            item?.reliquary?.setId ||
            item?.reliquary?.mainPropId ||
            ""
        );
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

    function mapElementDamageStats(avatar) {
        const details = ELEMENT_DAMAGE_PROPS.map((item) => ({
            key: item.key,
            element: item.element,
            label: item.label,
            value: normalizePercent(readFightProp(avatar, item.key))
        }));
        const byElement = details.reduce((acc, item) => {
            acc[item.element] = item.value;
            return acc;
        }, {});
        return { details, byElement };
    }

    function resolveCharacterElement(avatarId) {
        const entry = getGenshinResolverEntry("character", avatarId);
        const element = pickText(entry?.element, "");
        if (element) return element;
        warnUnsupportedId("character.element", avatarId);
        return "未対応";
    }

    function mapWeapon(avatar) {
        const weapon = (avatar?.equipList || []).find((item) => item?.flat?.itemType === "ITEM_WEAPON");
        if (!weapon) return null;

        const id = String(weapon.itemId || "-");
        return {
            id,
            name: resolveNameFromJson("weapon", id, pickFlatName(weapon.flat, ""), "武器"),
            level: pickNumber(weapon.weapon?.level),
            // Enka-compatible profile responses expose weapon affix ranks as 0..4,
            // while the calculator and UI use refinement ranks R1..R5.
            rank: normalizeAffixRank(weapon.weapon?.affixMap ? Object.values(weapon.weapon.affixMap)[0] : 0),
            type: resolveTextFromJson("weapon", id, "weaponType", pickText(weapon.flat?.weaponType || weapon.flat?.itemType, "-")),
            rarity: resolveNumberFromJson("weapon", id, "rarity", pickNumber(weapon.flat?.rankLevel)),
            effect: readFlatText(weapon.flat, ["descTextMap", "weaponDescTextMap", "effectTextMap", "awakenNameTextMap"]) || "武器効果データは未対応です。"
        };
    }

    function mapArtifacts(avatar) {
        return (avatar?.equipList || [])
            .filter((item) => item?.flat?.itemType === "ITEM_RELIQUARY")
            .map((item) => {
                const id = String(item.itemId || "-");
                const setId = readArtifactSetId(item);
                const fallbackSetName = pickLocalizedName(item.flat?.setNameTextMap, "") ||
                    pickLocalizedName(item.flat?.reliquarySetNameTextMap, "") ||
                    pickFlatName(item.flat?.reliquarySet, "") ||
                    pickFlatName(item.flat, "");
                const setName = resolveNameFromJson("artifactSet", setId, fallbackSetName, "聖遺物セット");
                return {
                    id,
                    setId,
                    name: pickFlatName(item.flat, setName || unsupportedName("聖遺物", id)),
                    level: pickNumber(item.reliquary?.level),
                    slot: pickText(EQUIP_TYPE_NAMES[item.flat?.equipType] || item.flat?.equipType, "-"),
                    setName,
                    effect: readFlatText(item.flat, ["setDescTextMap", "reliquarySetDescTextMap", "descTextMap"]) || "聖遺物効果データは未対応です。"
                };
            });
    }

    function mapCharacter(avatar) {
        const elementDamageStats = mapElementDamageStats(avatar);
        const avatarId = String(avatar?.avatarId || "-");
        const level = readPropMapValue(avatar, 4001);
        const mappedName = resolveNameFromJson("character", avatarId, pickLocalizedName(avatar?.flat?.nameTextMap) || CHARACTER_NAME_BY_AVATAR_ID_JA[avatarId], "キャラクター");
        const characterElement = resolveCharacterElement(avatarId);
        const representativeElementDamage = elementDamageStats.byElement[characterElement] || 0;

        return {
            id: avatarId,
            name: mappedName,
            level,
            element: characterElement,
            constellation: Array.isArray(avatar?.talentIdList) ? avatar.talentIdList.length : 0,
            constellationEffect: "命ノ星座効果データは未対応です。",
            weaponType: resolveTextFromJson("character", avatarId, "weaponType", pickText(avatar?.flat?.weaponType || avatar?.weaponType, "-")),
            rarity: resolveNumberFromJson("character", avatarId, "rarity", pickNumber(avatar?.flat?.rankLevel || avatar?.rankLevel)),
            talents: mapTalentLevels(avatar),
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
                elementalDamage: representativeElementDamage,
                elementalDamageDetails: elementDamageStats.details
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

