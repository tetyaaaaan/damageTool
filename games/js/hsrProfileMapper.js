(function () {
    "use strict";

    function number(value, fallback = 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function text(value, fallback = "-") {
        return typeof value === "string" && value.trim() ? value : fallback;
    }

    function percent(value) {
        return number(value) * 100;
    }

    function byId(items, id) {
        return items?.find((item) => String(item.id) === String(id));
    }

    function addProperties(target, properties) {
        if (!Array.isArray(properties)) return;
        properties.forEach((property) => {
            const type = String(property?.type || "");
            if (type) target[type] = (target[type] || 0) + number(property.value);
        });
    }

    function mapRelicSets(character, catalog) {
        const counts = new Map();
        (character.relicList || []).forEach((relic) => {
            const id = String(relic?._flat?.setID || "");
            if (id) counts.set(id, (counts.get(id) || 0) + 1);
        });
        return [...counts.entries()].map(([id, pieces]) => {
            const set = byId(catalog?.relicSets, id);
            return {
                id,
                name: text(set?.name),
                pieces,
                image: set?.image || "",
                effects: (set?.effects || []).filter((effect) => pieces >= number(effect.pieces)),
                properties: []
            };
        });
    }

    function mapTraces(character, characterData, traceSkillMap) {
        return (character.skillTreeList || []).map((tree) => {
            const id = String(tree.pointId || "");
            const linkedSkillIds = traceSkillMap?.[String(characterData?.id || "")]?.[id]?.skillIds;
            const basicSkillIds = /^(001|002|003)$/.test(id.slice(-3)) && id.startsWith(String(characterData?.id || ""))
                ? [id, `${characterData.id}${id.slice(-2)}`] : [];
            const skillIds = Array.isArray(linkedSkillIds) && linkedSkillIds.length
                ? linkedSkillIds.map(String)
                : basicSkillIds.find((skillId) => byId(characterData?.skills, skillId))
                    ? [basicSkillIds.find((skillId) => byId(characterData?.skills, skillId))] : [];
            const skills = skillIds.map((skillId) => byId(characterData?.skills, skillId)).filter(Boolean);
            const skill = skills[0];
            const trace = byId(characterData?.traces, id);
            return {
                id,
                name: text(skill?.name || trace?.name),
                type: text(skill?.type, ""),
                skillIds,
                level: number(tree.level),
                maxLevel: number(skill?.params?.length || trace?.maxLevel),
                description: text(skill?.description || trace?.description, ""),
                params: skill?.params || [],
                properties: trace?.levels?.[0]?.properties || []
            };
        });
    }

    function collectProperties(character, characterData, lightCone, relicSets, catalog) {
        const totals = {};
        (character.relicList || []).forEach((relic) => addProperties(totals, relic?._flat?.props));
        (character.skillTreeList || []).forEach((tree) => {
            if (number(tree.level) <= 0) return;
            addProperties(totals, byId(characterData?.traces, tree.pointId)?.levels?.[0]?.properties);
        });
        const rank = Math.max(1, number(character.equipment?.rank, 1));
        addProperties(totals, lightCone?.effect?.propertiesByRank?.[rank - 1]);
        relicSets.forEach((selected) => {
            const set = byId(catalog?.relicSets, selected.id);
            (set?.effects || [])
                .filter((effect) => selected.pieces >= number(effect.pieces))
                .forEach((effect) => addProperties(totals, effect.properties));
        });
        return totals;
    }

    function calculateStats(character, characterData, lightCone, relicSets, catalog) {
        const props = collectProperties(character, characterData, lightCone, relicSets, catalog);
        const coneProps = character.equipment?._flat?.props || [];
        const finiteValue = (value) => value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value)) ? Number(value) : undefined;
        const coneBase = (type) => character.equipment ? finiteValue(coneProps.find((item) => item?.type === type)?.value) : 0;
        const base = (stat, type) => {
            const own = finiteValue(characterData?.base?.[stat]); const cone = coneBase(type);
            return own === undefined || cone === undefined ? undefined : own + cone;
        };
        const exactLevel = number(character.level) === 80;
        const hpBase = base("hp", "BaseHP");
        const atkBase = base("atk", "BaseAttack");
        const defBase = base("def", "BaseDefence");
        const elements = { "物理": "Physical", "炎": "Fire", "氷": "Ice", "雷": "Thunder", "風": "Wind", "量子": "Quantum", "虚数": "Imaginary" };
        const element = characterData?.element || elements[characterData?.elementName];
        const damageBonus = element ? (props[`${element}AddedRatio`] || 0) + (props.AllDamageTypeAddedRatio || 0) : undefined;
        const rank = finiteValue(character.equipment?.rank);
        const incomplete = !characterData || (character.equipment && (!lightCone || !Number.isInteger(rank) || rank < 1 || rank > 5))
            || (character.relicList || []).some((relic) => !Array.isArray(relic?._flat?.props));
        if (incomplete) return {};

        return {
            // The local catalog currently records exact character bases at Lv.80.
            // Lower-level HP/ATK/DEF are intentionally left unset instead of interpolated.
            hp: exactLevel && Number.isFinite(hpBase) ? hpBase * (1 + (props.HPAddedRatio || 0)) + (props.HPDelta || 0) : undefined,
            atk: exactLevel && Number.isFinite(atkBase) ? atkBase * (1 + (props.AttackAddedRatio || 0)) + (props.AttackDelta || 0) : undefined,
            def: exactLevel && Number.isFinite(defBase) ? defBase * (1 + (props.DefenceAddedRatio || 0)) + (props.DefenceDelta || 0) : undefined,
            speed: Number.isFinite(finiteValue(characterData?.base?.speed)) ? number(characterData.base.speed) * (1 + (props.SpeedAddedRatio || 0)) + (props.SpeedDelta || 0) : undefined,
            critRate: percent(0.05 + (props.CriticalChanceBase || 0) + (props.CriticalChance || 0)),
            critDamage: percent(0.5 + (props.CriticalDamageBase || 0) + (props.CriticalDamage || 0)),
            breakEffect: percent((props.BreakDamageAddedRatioBase || 0) + (props.BreakDamageAddedRatio || 0)),
            effectHitRate: percent((props.StatusProbabilityBase || 0) + (props.StatusProbability || 0)),
            effectRes: percent((props.StatusResistanceBase || 0) + (props.StatusResistance || 0)),
            energyRegen: percent(1 + (props.SPRatioBase || 0)),
            damageBonus: Number.isFinite(damageBonus) ? percent(damageBonus) : undefined,
            elation: percent((props.ElationDamageAddedRatioBase || 0) + (props.ElationDamageAddedRatio || 0))
        };
    }

    function mapCharacter(character, catalog, traceSkillMap) {
        const id = String(character.avatarId || "");
        const characterData = byId(catalog?.characters, id);
        const coneId = String(character.equipment?.tid || "");
        const lightConeData = byId(catalog?.lightCones, coneId);
        const relicSets = mapRelicSets(character, catalog);
        const lightCone = character.equipment ? {
            id: coneId,
            name: text(lightConeData?.name),
            level: number(character.equipment.level),
            rank: Number.isInteger(character.equipment.rank) && character.equipment.rank >= 1 && character.equipment.rank <= 5 ? character.equipment.rank : undefined,
            image: lightConeData?.image || ""
        } : null;
        const relics = (character.relicList || []).map((relic) => {
            const set = byId(catalog?.relicSets, relic?._flat?.setID);
            const properties = relic?._flat?.props || [];
            return {
                id: String(relic.tid || ""),
                name: text(set?.name),
                level: number(relic.level),
                rarity: 0,
                setName: text(set?.name),
                mainAffix: text(properties[0]?.type),
                subAffixes: properties.slice(1).map((item) => text(item?.type)).filter((item) => item !== "-"),
                image: set?.image || ""
            };
        });
        return {
            id,
            name: text(characterData?.name),
            level: number(character.level),
            element: text(characterData?.elementName),
            path: text(characterData?.pathName),
            eidolon: number(character.rank),
            lightCone,
            relics,
            relicSets,
            traces: mapTraces(character, characterData, traceSkillMap),
            image: characterData?.image || "",
            stats: calculateStats(character, characterData, lightConeData, relicSets, catalog)
        };
    }

    function mapProfileResponse(response, catalog) {
        const player = response?.detailInfo || {};
        const characters = Array.isArray(player.avatarDetailList)
            ? player.avatarDetailList.map((character) => mapCharacter(character, catalog, catalog?.traceSkillMap))
            : [];
        return {
            provider: "Enka.Network",
            player: {
                nickname: text(player.nickname, "プレイヤー"),
                level: number(player.level),
                uid: String(player.uid ?? response?.uid ?? "-")
            },
            characters
        };
    }

    window.HsrProfileMapper = Object.freeze({ mapProfileResponse });
})();
