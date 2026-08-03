(function () {
    "use strict";

    const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
    const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

    function resistanceMultiplier(resistancePercent) {
        const resistance = number(resistancePercent) / 100;
        // Star Rail keeps the full benefit below 0% RES (unlike Genshin's
        // halved negative-resistance branch).
        if (resistance < 0) return 1 - resistance;
        if (resistance < 0.75) return 1 - resistance;
        return 1 / (1 + resistance * 4);
    }

    function defenseMultiplier(characterLevel, enemyLevel, defenseReduction, defenseIgnore) {
        const attacker = Math.max(1, number(characterLevel, 80)) + 20;
        const defender = Math.max(1, number(enemyLevel, 80)) + 20;
        const reduction = clamp(defenseReduction, 0, 100) / 100;
        const ignore = clamp(defenseIgnore, 0, 100) / 100;
        const effectiveDefense = defender * Math.max(0, 1 - reduction - ignore);
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
            stat: modifier?.stat || null,
            value: number(modifier?.value),
            enabled: modifier?.enabled !== false,
            applicable: modifier?.applicable !== false,
            reason: modifier?.reason || "",
            conditionText: modifier?.conditionText || modifier?.activation?.conditionText || "",
            unit: modifier?.unit || "percent",
            target: modifier?.target || null,
            calculation: modifier?.calculation || null,
            support: modifier?.support || null,
            stacking: modifier?.stacking || null,
            provenance: modifier?.provenance || null,
            primaryTargetOnly: modifier?.primaryTargetOnly === true,
            adjacentTargetOnly: modifier?.adjacentTargetOnly === true,
            calculable: modifier?.calculable !== false
        };
    }

    function modifierAppliesToAttack(modifier, attack) {
        if (modifier.primaryTargetOnly && attack?.target === "adjacent") return false;
        if (modifier.adjacentTargetOnly && attack?.target !== "adjacent") return false;
        const attackTypes = modifier.target?.attackTypes || ["all"];
        const elements = modifier.target?.elements || [];
        const attackType = attack?.attackType || attack?.type || "normal";
        const attackTags = Array.isArray(attack?.tags) ? attack.tags : [];
        const element = attack?.element || "";
        return (attackTypes.includes("all") || attackTypes.includes(attackType) || attackTags.some((tag) => attackTypes.includes(tag)))
            && (!elements.length || elements.includes(element));
    }

    function enforceStackingRules(modifiers) {
        const groups = new Map();
        modifiers.filter((item) => item.enabled && item.applicable && item.stacking?.group).forEach((item) => {
            const key = item.stacking.group;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(item);
        });
        groups.forEach((items) => {
            const rule = items[0]?.stacking?.rule || "add";
            if (rule === "add" || items.length < 2) return;
            const keep = rule === "replace" ? items[items.length - 1] : items.reduce((best, item) => item.value > best.value ? item : best, items[0]);
            items.forEach((item) => {
                if (item === keep) return;
                item.applicable = false;
                item.reason = rule === "replace" ? "同一効果グループの後続効果で上書きされました" : "同一効果グループでは最大値のみ適用します";
            });
        });
    }

    function calculate(input) {
        const character = input?.character || {};
        const enemy = input?.enemy || {};
        const attack = input?.attack || {};
        const stats = character.stats || {};
        const modifiers = (input?.modifiers || []).map(normalizeModifier);
        modifiers.forEach((item) => {
            if (item.enabled && item.applicable && !modifierAppliesToAttack(item, attack)) {
                item.applicable = false;
                item.reason = "この攻撃種別・属性は対象外です";
            }
            if (item.enabled && item.applicable && (!item.calculable || (item.support?.status && item.support.status !== "calculable"))) {
                item.applicable = false;
                item.reason = item.support?.reason || "計算反映前の確認が必要です";
            }
            if (item.enabled && item.applicable && item.category === "statPercent" && !Number.isFinite(Number(character.baseStats?.[item.stat]))) {
                item.applicable = false;
                item.reason = `基礎${item.stat || "ステータス"}が未入力です`;
            }
        });
        enforceStackingRules(modifiers);
        const applied = modifiers.filter((item) => item.enabled && item.applicable);
        const skipped = modifiers.filter((item) => !item.enabled || !item.applicable);

        const statBonus = (category, stat) => applied.filter((item) => item.category === category && (!stat || item.stat === stat)).reduce((sum, item) => sum + item.value, 0);
        const resolvedStat = (stat) => number(stats[stat]) + statBonus("statFlat", stat)
            + number(character.baseStats?.[stat]) * statBonus("statPercent", stat) / 100;
        const effectiveStats = {
            ...stats,
            hp: resolvedStat("hp"),
            atk: resolvedStat("atk"),
            def: resolvedStat("def"),
            speed: resolvedStat("speed"),
            critRate: Math.max(number(stats.critRate) + statBonus("critRate"), number(attack.critRateOverride), ...applied.filter((item) => item.category === "critRateOverride").map((item) => item.value)),
            critDamage: number(stats.critDamage) + statBonus("critDamage"),
            breakEffect: number(stats.breakEffect) + statBonus("breakEffect"),
            elation: number(stats.elation) + statBonus("elation")
        };

        const scalingStat = attack.scalingStat || "atk";
        const multiplierAddition = applied.filter((item) => item.category === "multiplierAddition").reduce((sum, item) => sum + item.value, 0) * number(attack.multiplierAdditionScale, 1);
        const scalingTerms = Array.isArray(attack.scalingTerms) && attack.scalingTerms.length
            ? attack.scalingTerms.map((term) => ({ stat: term.stat || "atk", referenceValue: number(effectiveStats[term.stat || "atk"]), multiplierPercent: number(term.multiplier) + (term.receivesMultiplierAddition ? multiplierAddition : 0) }))
            : [{ stat: scalingStat, referenceValue: number(effectiveStats[scalingStat]), multiplierPercent: number(attack.multiplier) + multiplierAddition }];
        const cappedEnemyHpDamage = attack.damageFormula === "enemyHpCappedByAtk"
            ? Math.min(
                Math.max(0, number(enemy.maxHp)) * Math.max(0, number(attack.enemyHpPercent)) / 100,
                Math.max(0, number(effectiveStats.atk)) * Math.max(0, number(attack.atkCapPercent)) / 100
            )
            : null;
        const referenceValue = cappedEnemyHpDamage === null
            ? (scalingTerms.length === 1 ? scalingTerms[0].referenceValue : scalingTerms.reduce((sum, term) => sum + term.referenceValue, 0))
            : cappedEnemyHpDamage;
        const flatDamage = number(attack.flatDamage);
        const hitCount = attack.hitCountReference ? Math.max(0, Math.floor(number(attack.hitCount))) : Math.max(1, Math.floor(number(attack.hitCount, 1)));
        const damageBonus = number(stats.damageBonus) + applied.filter((item) => item.category === "damageBonus" || (item.category === "dotDamage" && attack.type === "dot")).reduce((sum, item) => sum + item.value, 0);
        const takenDamage = number(enemy.takenDamage) + applied.filter((item) => item.category === "takenDamage").reduce((sum, item) => sum + item.value, 0);
        const defenseReduction = number(enemy.defenseReduction) + applied.filter((item) => item.category === "defenseReduction").reduce((sum, item) => sum + item.value, 0);
        const defenseIgnore = number(enemy.defenseIgnore) + applied.filter((item) => item.category === "defenseIgnore").reduce((sum, item) => sum + item.value, 0);
        const resistancePen = number(enemy.resistancePenetration) + applied.filter((item) => ["resistancePenetration", "resistanceReduction"].includes(item.category)).reduce((sum, item) => sum + item.value, 0);
        const baseDamage = (cappedEnemyHpDamage === null
            ? scalingTerms.reduce((sum, term) => sum + term.referenceValue * term.multiplierPercent / 100, 0)
            : cappedEnemyHpDamage * (number(attack.multiplier) + multiplierAddition) / 100) + flatDamage;
        const defense = defenseMultiplier(character.level, enemy.level, defenseReduction, defenseIgnore);
        const resistance = resistanceMultiplier(number(enemy.resistance) - resistancePen);
        // Weakness itself is not a separate direct-damage multiplier.  It
        // controls toughness reduction and break eligibility; base RES is an
        // explicit enemy input.
        const weakness = 1;
        const toughness = enemy.toughnessActive ? 0.9 : 1;
        const independentMultiplier = applied.filter((item) => item.category === "independentMultiplier").reduce((product, item) => product * (1 + item.value / 100), 1);
        const commonWithoutVulnerability = (1 + damageBonus / 100) * defense * resistance * weakness * toughness * independentMultiplier;
        const progressiveVulnerability = applied.filter((item) => item.category === "progressiveTakenDamage");
        const vulnerabilityFactors = Array.from({ length: hitCount }, (_, hitIndex) => 1 + (takenDamage + progressiveVulnerability.reduce((sum, item) => sum + item.value * Math.min(hitIndex, number(item.stacking?.maximumStacks, 1)), 0)) / 100);
        const vulnerabilityFactorSum = vulnerabilityFactors.reduce((sum, value) => sum + value, 0);
        const commonMultiplier = commonWithoutVulnerability * vulnerabilityFactorSum / hitCount;
        const nonCritTotal = baseDamage * commonWithoutVulnerability * vulnerabilityFactorSum;
        const nonCritPerHit = nonCritTotal / hitCount;
        const canCrit = attack.canCrit !== false;
        const critRate = clamp(effectiveStats.critRate, 0, 100) / 100;
        const critTakenDamage = applied.filter((item) => item.category === "critTakenDamage").reduce((sum, item) => sum + item.value, 0);
        const critMultiplier = canCrit ? 1 + (number(effectiveStats.critDamage) + critTakenDamage) / 100 : 1;
        const critPerHit = canCrit ? nonCritPerHit * critMultiplier : nonCritPerHit;
        const expectedPerHit = canCrit ? nonCritPerHit * (1 + critRate * (critMultiplier - 1)) : nonCritPerHit;

        return {
            attack: { name: attack.name || "手動攻撃", hitCount, target: attack.target || "single", canCrit, scalingStat },
            nonCrit: nonCritTotal,
            crit: nonCritTotal * critMultiplier,
            expected: nonCritTotal * (canCrit ? 1 + critRate * (critMultiplier - 1) : 1),
            perHit: { nonCrit: nonCritPerHit, crit: critPerHit, expected: expectedPerHit },
            breakdown: {
                referenceValue, multiplierPercent: scalingTerms.reduce((sum, term) => sum + term.multiplierPercent, 0), multiplierAddition, scalingTerms, flatDamage,
                damageFormula: attack.damageFormula || "statMultiplier", enemyHpPercent: number(attack.enemyHpPercent), atkCapPercent: number(attack.atkCapPercent), cappedEnemyHpDamage,
                damageBonus, takenDamage, progressiveVulnerability: progressiveVulnerability.map((item) => ({ id: item.id, perHit: item.value, maximumStacks: number(item.stacking?.maximumStacks, 1) })), vulnerabilityFactors, defense, resistance, weakness, toughness,
                baseDamage, commonMultiplier, independentMultiplier, critRatePercent: critRate * 100, critDamagePercent: number(effectiveStats.critDamage), critTakenDamage
            },
            applied,
            skipped
        };
    }

    function calculateBreak(input) {
        const character = input?.character || {};
        const enemy = input?.enemy || {};
        const modifiers = (input?.modifiers || []).map(normalizeModifier);
        const breakAttack = { attackType: "break", type: "break", element: input?.element || "" };
        modifiers.forEach((item) => {
            if (item.enabled && item.applicable && !modifierAppliesToAttack(item, breakAttack)) {
                item.applicable = false;
                item.reason = "弱点撃破ダメージは対象外です";
            }
            if (item.enabled && item.applicable && (!item.calculable || (item.support?.status && item.support.status !== "calculable"))) {
                item.applicable = false;
                item.reason = item.support?.reason || "計算反映前の確認が必要です";
            }
        });
        enforceStackingRules(modifiers);
        const applied = modifiers.filter((item) => item.enabled && item.applicable);
        const level = Math.max(1, Math.min(80, Math.round(number(character.level, 80))));
        const table = input?.breakBaseDamage || {};
        const base = number(table[level], NaN);
        if (!Number.isFinite(base) || enemy.weakness === false) {
            return { supported: false, reason: enemy.weakness === false ? "選択中の属性は敵の弱点ではありません。" : `Lv.${level}の撃破基礎値は未検証です。` };
        }
        const elementMultipliers = { Physical: 2, Fire: 2, Wind: 1.5, Ice: 1, Thunder: 1, Quantum: 0.5, Imaginary: 0.5 };
        const explicitMultiplier = Number(input?.multiplier);
        const multiplier = Number.isFinite(explicitMultiplier) ? explicitMultiplier : elementMultipliers[input?.element];
        if (!Number.isFinite(multiplier)) return { supported: false, reason: "撃破属性倍率を特定できません。" };
        const breakEffectBonus = applied.filter((item) => item.category === "breakEffect").reduce((sum, item) => sum + item.value, 0);
        const effect = 1 + (number(character.stats?.breakEffect) + breakEffectBonus) / 100;
        const defenseReduction = number(enemy.defenseReduction) + applied.filter((item) => item.category === "defenseReduction").reduce((sum, item) => sum + item.value, 0);
        const defenseIgnore = number(enemy.defenseIgnore) + applied.filter((item) => item.category === "defenseIgnore").reduce((sum, item) => sum + item.value, 0);
        const resistancePenetration = number(enemy.resistancePenetration) + applied.filter((item) => item.category === "resistancePenetration").reduce((sum, item) => sum + item.value, 0);
        const takenDamage = number(enemy.takenDamage) + applied.filter((item) => item.category === "takenDamage").reduce((sum, item) => sum + item.value, 0);
        const defense = defenseMultiplier(character.level, enemy.level, defenseReduction, defenseIgnore);
        const resistance = resistanceMultiplier(number(enemy.resistance) - resistancePenetration);
        const toughnessScale = 0.5 + Math.max(0, number(enemy.maxToughness, 30)) / 120;
        const vulnerability = 1 + takenDamage / 100;
        return { supported: true, value: base * multiplier * effect * defense * resistance * toughnessScale * vulnerability, base, multiplier, effect, defense, resistance, toughnessScale, vulnerability, applied };
    }

    function calculateSuperBreak(input) {
        const character = input?.character || {};
        const enemy = input?.enemy || {};
        const attack = input?.attack || {};
        const modifiers = (input?.modifiers || []).map(normalizeModifier);
        modifiers.forEach((item) => {
            if (item.enabled && item.applicable && !modifierAppliesToAttack(item, attack)) {
                item.applicable = false;
                item.reason = "この攻撃の超撃破ダメージは対象外です";
            }
            if (item.enabled && item.applicable && (!item.calculable || (item.support?.status && item.support.status !== "calculable"))) {
                item.applicable = false;
                item.reason = item.support?.reason || "計算反映前の確認が必要です";
            }
        });
        enforceStackingRules(modifiers);
        const applied = modifiers.filter((item) => item.enabled && item.applicable);
        const level = Math.max(1, Math.min(80, Math.round(number(character.level, 80))));
        const base = number(input?.breakBaseDamage?.[level], NaN);
        const toughnessDamage = number(attack.toughnessDamage, NaN);
        if (!Number.isFinite(base)) return { supported: false, reason: `Lv.${level}の撃破基礎値は未検証です。` };
        if (!Number.isFinite(toughnessDamage) || toughnessDamage <= 0) return { supported: false, reason: "攻撃の基礎削靭値が未登録です。" };
        if (enemy.toughnessActive !== false) return { supported: false, reason: "超撃破は弱点撃破状態の敵にのみ発生します。" };
        const sum = (categories) => applied.filter((item) => categories.includes(item.category)).reduce((total, item) => total + item.value, 0);
        const breakEffect = 1 + (number(character.stats?.breakEffect) + sum(["breakEffect"])) / 100;
        const breakEfficiency = 1 + sum(["breakEfficiency"]) / 100;
        const superBreakBonus = 1 + sum(["superBreakDamage"]) / 100;
        const defenseReduction = number(enemy.defenseReduction) + sum(["defenseReduction"]);
        const defenseIgnore = number(enemy.defenseIgnore) + sum(["defenseIgnore"]);
        const resistancePenetration = number(enemy.resistancePenetration) + sum(["resistancePenetration", "resistanceReduction"]);
        const vulnerability = 1 + (number(enemy.takenDamage) + sum(["takenDamage"])) / 100;
        const defense = defenseMultiplier(character.level, enemy.level, defenseReduction, defenseIgnore);
        const resistance = resistanceMultiplier(number(enemy.resistance) - resistancePenetration);
        const effectiveToughnessDamage = toughnessDamage * breakEfficiency;
        const value = base * (effectiveToughnessDamage / 10) * breakEffect * defense * resistance * vulnerability * superBreakBonus;
        return { supported: true, value, base, toughnessDamage, effectiveToughnessDamage, breakEffect, breakEfficiency, superBreakBonus, defense, resistance, vulnerability, applied, skipped: modifiers.filter((item) => !item.enabled || !item.applicable) };
    }

    window.HsrCalcEngine = Object.freeze({ calculate, calculateBreak, calculateSuperBreak, defenseMultiplier, resistanceMultiplier, actionSummary });
})();
