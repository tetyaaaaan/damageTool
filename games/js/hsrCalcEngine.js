(function () {
    "use strict";

    const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
    const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

    function resistanceMultiplier(resistancePercent) {
        const resistance = number(resistancePercent) / 100;
        if (resistance < 0) return 1 - resistance / 2;
        if (resistance < 0.75) return 1 - resistance;
        return 1 / (1 + resistance * 4);
    }

    function defenseMultiplier(characterLevel, enemyLevel, defenseReduction, defenseIgnore) {
        const attacker = Math.max(1, number(characterLevel, 80)) + 20;
        const defender = Math.max(1, number(enemyLevel, 80)) + 20;
        const reduction = clamp(defenseReduction, 0, 100) / 100;
        const ignore = clamp(defenseIgnore, 0, 100) / 100;
        const effectiveDefense = defender * Math.max(0, 1 - reduction) * Math.max(0, 1 - ignore);
        return attacker / (attacker + effectiveDefense);
    }

    function actionValue(speed) {
        const resolvedSpeed = Math.max(1, number(speed, 100));
        return 10000 / resolvedSpeed;
    }

    function actionSummary(speed, windowValue) {
        const av = actionValue(speed);
        const budget = Math.max(1, number(windowValue, 150));
        return {
            speed: number(speed, 100),
            actionValue: av,
            windowValue: budget,
            actions: Math.floor(budget / av),
            nextActionValue: av
        };
    }

    function normalizeModifier(modifier) {
        return {
            id: String(modifier?.id || "manual"),
            name: String(modifier?.name || "手動補正"),
            source: String(modifier?.source || "手動入力"),
            category: modifier?.category || "damageBonus",
            value: number(modifier?.value),
            enabled: modifier?.enabled !== false,
            applicable: modifier?.applicable !== false,
            reason: modifier?.reason || ""
        };
    }

    function calculate(input) {
        const character = input?.character || {};
        const enemy = input?.enemy || {};
        const attack = input?.attack || {};
        const stats = character.stats || {};
        const modifiers = (input?.modifiers || []).map(normalizeModifier);
        const applied = modifiers.filter((item) => item.enabled && item.applicable);
        const skipped = modifiers.filter((item) => !item.enabled || !item.applicable);

        const scalingStat = attack.scalingStat || "atk";
        const referenceValue = number(stats[scalingStat]);
        const multiplier = number(attack.multiplier) / 100;
        const flatDamage = number(attack.flatDamage);
        const hitCount = Math.max(1, Math.floor(number(attack.hitCount, 1)));
        const damageBonus = number(stats.damageBonus) + applied.filter((item) => item.category === "damageBonus").reduce((sum, item) => sum + item.value, 0);
        const takenDamage = number(enemy.takenDamage) + applied.filter((item) => item.category === "takenDamage").reduce((sum, item) => sum + item.value, 0);
        const defenseReduction = number(enemy.defenseReduction) + applied.filter((item) => item.category === "defenseReduction").reduce((sum, item) => sum + item.value, 0);
        const defenseIgnore = number(enemy.defenseIgnore) + applied.filter((item) => item.category === "defenseIgnore").reduce((sum, item) => sum + item.value, 0);
        const resistancePen = number(enemy.resistancePenetration) + applied.filter((item) => item.category === "resistancePenetration").reduce((sum, item) => sum + item.value, 0);
        const baseDamage = referenceValue * multiplier + flatDamage;
        const defense = defenseMultiplier(character.level, enemy.level, defenseReduction, defenseIgnore);
        const resistance = resistanceMultiplier(number(enemy.resistance) - resistancePen);
        const weakness = enemy.weakness === false ? 0.8 : 1;
        const toughness = enemy.toughnessActive ? 0.9 : 1;
        const commonMultiplier = (1 + damageBonus / 100) * (1 + takenDamage / 100) * defense * resistance * weakness * toughness;
        const nonCritPerHit = baseDamage * commonMultiplier;
        const canCrit = attack.canCrit !== false;
        const critRate = clamp(stats.critRate, 0, 100) / 100;
        const critMultiplier = canCrit ? 1 + number(stats.critDamage) / 100 : 1;
        const critPerHit = canCrit ? nonCritPerHit * critMultiplier : nonCritPerHit;
        const expectedPerHit = canCrit ? nonCritPerHit * (1 + critRate * (critMultiplier - 1)) : nonCritPerHit;

        return {
            attack: { name: attack.name || "手動攻撃", hitCount, target: attack.target || "single", canCrit, scalingStat },
            nonCrit: nonCritPerHit * hitCount,
            crit: critPerHit * hitCount,
            expected: expectedPerHit * hitCount,
            perHit: { nonCrit: nonCritPerHit, crit: critPerHit, expected: expectedPerHit },
            breakdown: {
                referenceValue, multiplierPercent: number(attack.multiplier), flatDamage,
                damageBonus, takenDamage, defense, resistance, weakness, toughness,
                baseDamage, commonMultiplier, critRatePercent: critRate * 100, critDamagePercent: number(stats.critDamage)
            },
            applied,
            skipped
        };
    }

    function calculateBreak(input) {
        const character = input?.character || {};
        const enemy = input?.enemy || {};
        const level = Math.max(1, Math.min(80, Math.round(number(character.level, 80))));
        const table = input?.breakBaseDamage || {};
        const base = number(table[level], 3767);
        const multiplier = number(input?.multiplier, 1);
        const effect = 1 + number(character.stats?.breakEffect) / 100;
        const defense = defenseMultiplier(character.level, enemy.level, enemy.defenseReduction, enemy.defenseIgnore);
        const resistance = resistanceMultiplier(number(enemy.resistance) - number(enemy.resistancePenetration));
        const toughnessScale = 0.5 + Math.max(0, number(enemy.currentToughness, 30)) / 120;
        return { value: base * multiplier * effect * defense * resistance * toughnessScale, base, effect, defense, resistance, toughnessScale };
    }

    window.HsrCalcEngine = Object.freeze({ calculate, calculateBreak, defenseMultiplier, resistanceMultiplier, actionSummary });
})();
