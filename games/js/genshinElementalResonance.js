(function () {
    "use strict";

    const RESONANCES = Object.freeze([
        {
            id: "pyro", element: "炎", nameJa: "熱誠の炎",
            description: "チーム全員の攻撃力+25%。",
            effects: [{ id: "atk", label: "攻撃力+25%", modifier: { category: "statBonus", applyTo: ["atkPercent"], unit: "percent", value: 25 } }]
        },
        {
            id: "hydro", element: "水", nameJa: "治療の水",
            description: "チーム全員のHP上限+25%。",
            effects: [{ id: "hp", label: "HP上限+25%", modifier: { category: "statBonus", applyTo: ["hpPercent"], unit: "percent", value: 25 } }]
        },
        {
            id: "anemo", element: "風", nameJa: "迅速の風",
            description: "スタミナ消費とスキルクールタイムを軽減し、移動速度を上げます。ダメージ計算の対象外です。",
            effects: [{ id: "utility", label: "探索・クールタイム効果", displayOnly: true }]
        },
        {
            id: "electro", element: "雷", nameJa: "強能の雷",
            description: "雷元素反応時に雷元素粒子を生成します。ダメージ計算の対象外です。",
            effects: [{ id: "particle", label: "元素粒子生成", displayOnly: true }]
        },
        {
            id: "cryo", element: "氷", nameJa: "粉砕の氷",
            description: "氷元素付着または凍結状態の敵に対する会心率+15%。",
            effects: [{ id: "crit", label: "条件対象への会心率+15%", toggle: true, modifier: { category: "critBonus", applyTo: ["critRate"], unit: "percent", value: 15 } }]
        },
        {
            id: "geo", element: "岩", nameJa: "不動の岩",
            description: "シールド中の与えるダメージ+15%。さらに敵へダメージを与えると岩元素耐性-20%。",
            effects: [
                { id: "damage", label: "シールド中の与えるダメージ+15%", toggle: true, modifier: { category: "damageBonus", applyTo: ["allDamageBonus"], unit: "percent", value: 15 } },
                { id: "resistance", label: "敵の岩元素耐性-20%", sharedToggle: "damage", modifier: { category: "resistanceDebuff", applyTo: ["geoResistance"], unit: "percent", value: 20 } }
            ]
        },
        {
            id: "dendro", element: "草", nameJa: "蔓生の草",
            description: "元素熟知+50。草元素反応の種類に応じて、さらに元素熟知が上がります。",
            effects: [
                { id: "base", label: "元素熟知+50", modifier: { category: "statBonus", applyTo: ["elementalMastery"], unit: "flat", value: 50 } },
                { id: "first", label: "燃焼・原激化・開花後：元素熟知+30", toggle: true, modifier: { category: "statBonus", applyTo: ["elementalMastery"], unit: "flat", value: 30 } },
                { id: "second", label: "超激化・草激化・超開花・烈開花後：元素熟知+20", toggle: true, modifier: { category: "statBonus", applyTo: ["elementalMastery"], unit: "flat", value: 20 } }
            ]
        }
    ]);

    const PROTECTIVE_CANOPY = Object.freeze({
        id: "protective", nameJa: "交錯の護り",
        description: "異なる4元素で編成した時、全元素耐性と物理耐性+15%。ダメージ計算の対象外です。",
        effects: [{ id: "resistance", label: "全元素・物理耐性+15%", displayOnly: true }]
    });

    function activeMembers(party) {
        return (party?.members || []).filter((member) => member?.enabled && member?.characterId && member?.element);
    }

    function detectActiveResonances(party) {
        const members = activeMembers(party);
        const counts = members.reduce((map, member) => {
            map[member.element] = (map[member.element] || 0) + 1;
            return map;
        }, {});
        const active = RESONANCES.filter((resonance) => (counts[resonance.element] || 0) >= 2);
        if (!active.length && members.length === 4 && Object.keys(counts).length === 4) active.push(PROTECTIVE_CANOPY);
        return active;
    }

    function stateKey(resonanceId, effectId) {
        return `resonance:${resonanceId}:${effectId}`;
    }

    function missingBaseStat(modifier, context) {
        if (modifier?.category !== "statBonus" || modifier?.unit !== "percent") return "";
        const target = modifier.applyTo?.[0];
        const base = { atkPercent: "baseAtk", hpPercent: "baseHp", defPercent: "baseDef" }[target];
        return base && !(Number(context?.stats?.[base]) > 0) ? base : "";
    }

    function collectResonanceCandidates(context) {
        const states = context?.party?.resonanceStates || {};
        const member = { slot: 0, role: "resonance", enabled: true, characterId: "resonance", nameJa: "元素共鳴" };
        return detectActiveResonances(context?.party).flatMap((resonance) => resonance.effects.map((effect) => {
            const toggleEffectId = effect.sharedToggle || effect.id;
            const key = stateKey(resonance.id, effect.id);
            const toggleKey = stateKey(resonance.id, toggleEffectId);
            const automatic = !effect.toggle && !effect.sharedToggle;
            const enabled = automatic || states[toggleKey] === true;
            const modifier = effect.displayOnly ? {
                id: key, category: "displayOnly", applyTo: [], value: 0, uidHandling: "displayOnly"
            } : {
                id: key,
                ...effect.modifier,
                condition: automatic ? "always" : "manualActivation",
                calculationSupport: "simple",
                uidHandling: "conditional",
                partySource: true,
                provenance: "externalModifier",
                targetOwner: "team",
                sourceText: resonance.description
            };
            const baseStat = missingBaseStat(modifier, context);
            const status = effect.displayOnly ? "displayOnly" : baseStat ? "missingInput" : enabled ? "ready" : "off";
            return {
                key,
                toggleKey,
                source: `resonance:${resonance.id}`,
                sourceKind: "resonance",
                sourceId: resonance.id,
                sourceName: resonance.nameJa,
                resonanceId: resonance.id,
                description: resonance.description,
                effectLabel: effect.label,
                member,
                modifier,
                targetOwner: "team",
                targetLabel: "チーム全員",
                automatic,
                showToggle: Boolean(effect.toggle),
                enabled,
                status,
                reason: baseStat ? "基礎ステータスを取得できないため、現在は表示のみです。" : effect.displayOnly ? "現在のダメージ計算へ直接影響しない効果です。" : status === "off" ? "発動条件がOFFです。" : "",
                resolvedValue: Number(effect.modifier?.value) || 0,
                providerContext: context
            };
        }));
    }

    window.GenshinElementalResonance = {
        RESONANCES,
        PROTECTIVE_CANOPY,
        activeMembers,
        detectActiveResonances,
        stateKey,
        collectResonanceCandidates
    };
})();
