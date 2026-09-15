(function () {
    "use strict";

    const STAT_LABELS = Object.freeze({
        hp: "HP",
        baseHp: "基礎HP",
        hpFlat: "HP",
        hpPercent: "HP上限",
        atk: "攻撃力",
        baseAtk: "基礎攻撃力",
        atkFlat: "攻撃力",
        atkPercent: "攻撃力",
        def: "防御力",
        baseDef: "基礎防御力",
        defFlat: "防御力",
        defPercent: "防御力",
        elementalMastery: "元素熟知",
        energyRecharge: "元素チャージ効率",
        critRate: "会心率",
        critDamage: "会心ダメージ",
        elementDamageBonus: "元素ダメージ",
        fixedDamage: "固定基礎ダメージ"
    });

    const NORMALIZED_ALIASES = Object.freeze({
        elementalmastery: "elementalMastery",
        em: "elementalMastery",
        energyrecharge: "energyRecharge",
        critrate: "critRate",
        critdamage: "critDamage",
        elementdamagebonus: "elementDamageBonus"
    });

    function canonicalStatKey(value) {
        const raw = String(value || "").trim();
        if (!raw) return "";
        if (STAT_LABELS[raw]) return raw;
        const normalized = raw.replace(/[\s_-]+/g, "").toLowerCase();
        return NORMALIZED_ALIASES[normalized] || raw;
    }

    function statLabel(value) {
        const key = canonicalStatKey(value);
        return STAT_LABELS[key] || "";
    }

    window.GenshinUiLabels = Object.freeze({
        canonicalStatKey,
        statLabel
    });
})();
