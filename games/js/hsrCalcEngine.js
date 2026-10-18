(function () {
    "use strict";

    const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
    const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

    function resistanceMultiplier(resistancePercent) {
        // HSR uses 1 - effective RES after RES reduction and RES PEN, with no 75% branch.
        // https://srl.keqingmains.com/combat-mechanics/damage/damage-formula
        // Effective RES bounds (-100% to 90%): https://www.prydwen.gg/star-rail/guides/damage-formula
        return 1 - clamp(number(resistancePercent), -100, 90) / 100;
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

    // Published Elation level table; do not derive this from rounded Break coefficients.
    // https://honkai-star-rail.fandom.com/wiki/Elation_DMG
    const ELATION_LEVEL_BASE = Object.freeze({ 80: 7535.1070 });

    function supportedElationAttack(attack) {
        return attack.id === "150520" && attack.damageFormula === "elation" && attack.type === "elation"
            && attack.elationContext === "ahaInstant" && attack.target === "aoe" && attack.hitCount === 1;
    }

    function elationInputWarnings(input = {}) {
        const character = input.character || {};
        const stats = character.stats || {};
        const values = input.elation || {};
        const warnings = [];
        if (!ELATION_LEVEL_BASE[character.level] || (character.eidolon ?? 0) !== 0) warnings.push("この愉悦攻撃はLv80・星魂0のみ計算対応です。");
        if (values.context !== "ahaInstant") warnings.push("この愉悦攻撃はアッハタイム中のみ計算対応です。爆笑の褒美を参照する攻撃は対象外です。");
        if (!Number.isInteger(values.punchline) || values.punchline < 0) warnings.push("攻撃時点の爆笑ネタに0以上の整数を入力してください。");
        if (!Number.isFinite(values.merrymake) || values.merrymake < 0) warnings.push("上笑に0以上の数値を入力してください。補正なしは0です。");
        for (const [key, label] of [["elation", "愉悦度"], ["critRate", "会心率"], ["critDamage", "会心ダメージ"]]) {
            if (!Number.isFinite(stats[key]) || stats[key] < 0) warnings.push(`${label}に0以上の最終値を入力してください。`);
        }
        if (!Number.isInteger(input.attack?.traceLevel) || input.attack.traceLevel < 1 || input.attack.traceLevel > 10) warnings.push("星魂0の愉悦スキルLvに1～10の整数を選択してください。");
        if (!Number.isFinite(input.attack?.multiplier) || input.attack.multiplier < 0) warnings.push("愉悦スキルの倍率を取得できません。");
        return warnings;
    }

    // Scoped to one final, non-True damage instance; no automatic result chaining.
    function supportedTrueAttack(attack) {
        return attack.id === "1415021" && attack.damageFormula === "trueDamage"
            && attack.type === "trueDamage" && attack.sourceSkillId === "141502"
            && attack.target === "single" && attack.hitCount === 1;
    }

    function trueDamageInputWarnings(input = {}) {
        const values = input.trueDamage || {};
        const warnings = [];
        if ((input.character?.eidolon ?? 0) !== 0) warnings.push("キュレネの領域の確定ダメージは星魂0のみ計算対応です。");
        if (values.active !== true) warnings.push("領域が有効でキュレネが生存している場合のみ計算できます。");
        if (values.sourceKind !== "finalNonTrueDamage") warnings.push("参照元には追加確定ダメージを含まない、味方が敵1体へ与えた補正適用後のダメージ1回分を指定してください。");
        if (!Number.isFinite(values.originalDamage) || values.originalDamage < 0) warnings.push("元ダメージに0以上の数値を入力してください。");
        const level = input.attack?.traceLevel;
        if (!Number.isInteger(level) || level < 1 || level > 10) warnings.push("星魂0の戦闘スキルLvに1～10の整数を選択してください。");
        const expected = input.attack?.multipliers?.[level - 1];
        if (!Number.isFinite(expected) || !Number.isFinite(input.attack?.multiplier) || Math.abs(input.attack.multiplier - expected) > 1e-9) warnings.push("領域の確定ダメージ倍率を確認できません。");
        return warnings;
    }

    function calculateTrueDamage(input) {
        const warnings = trueDamageInputWarnings(input);
        if (warnings.length) return { supported: false, reason: warnings.join(" ") };
        const originalDamage = input.trueDamage.originalDamage;
        const multiplierPercent = input.attack.multiplier;
        const value = originalDamage * (multiplierPercent / 100);
        return {
            attack: { name: input.attack.name, hitCount: 1, target: "single", canCrit: false },
            nonCrit: value,
            breakdown: { damageFormula: "trueDamage", originalDamage, multiplierPercent, condition: "領域有効・キュレネ生存／確定ダメージを含まない元ダメージ1回分" },
            applied: [],
            skipped: (input.modifiers || []).map(normalizeModifier).map((item) => ({ ...item, applicable: false, reason: "確定ダメージへ補正を再適用しません。元ダメージに含まれる補正は保持します。" }))
        };
    }

    function unsupportedAttackReason(attack = {}) {
        if (attack.support?.status === "displayOnly") return attack.support.reason || "この攻撃は表示のみのため、ダメージを計算しません。";
        if (supportedElationAttack(attack) || supportedTrueAttack(attack)) return "";
        const terms = [...(attack.scalingTerms || []), ...(attack.adjacentScalingTerms || [])];
        if ([attack.type, attack.attackType, attack.scalingStat, ...terms.map((term) => term.stat)].includes("elation")) return "愉悦ダメージの専用計算は未対応です。通常式では計算しません。";
        if (attack.damageFormula && !["statMultiplier", "enemyHpCappedByAtk"].includes(attack.damageFormula)) return "このダメージ計算方式は未対応です。通常式では計算しません。";
        const types = ["normal", "enhancedNormal", "skill", "enhancedSkill", "ultimate", "talent", "followUp", "additional", "dot", "memospriteSkill", "memospriteTalent", "assist"];
        if ([attack.type, attack.attackType].some((type) => type && !types.includes(type))) return "この攻撃種別の専用計算は未対応です。通常式では計算しません。";
        return "";
    }

    function calculate(input) {
        const character = input?.character || {};
        const enemy = input?.enemy || {};
        const attack = input?.attack || {};
        const unsupportedReason = unsupportedAttackReason(attack);
        if (unsupportedReason) return { supported: false, reason: unsupportedReason };
        if (supportedElationAttack(attack)) return calculateElation(input);
        if (supportedTrueAttack(attack)) return calculateTrueDamage(input);
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
        const damageBonusMultiplier = 1 + damageBonus / 100;
        const commonWithoutVulnerability = damageBonusMultiplier * defense * resistance * weakness * toughness * independentMultiplier;
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
        const expectedCritMultiplier = canCrit ? 1 + critRate * (critMultiplier - 1) : 1;
        const expectedPerHit = nonCritPerHit * expectedCritMultiplier;

        return {
            attack: { name: attack.name || "手動攻撃", hitCount, target: attack.target || "single", canCrit, scalingStat },
            nonCrit: nonCritTotal,
            crit: nonCritTotal * critMultiplier,
            expected: nonCritTotal * expectedCritMultiplier,
            perHit: { nonCrit: nonCritPerHit, crit: critPerHit, expected: expectedPerHit },
            breakdown: {
                referenceValue, multiplierPercent: scalingTerms.reduce((sum, term) => sum + term.multiplierPercent, 0), multiplierAddition, scalingTerms, flatDamage,
                damageFormula: attack.damageFormula || "statMultiplier", enemyHpPercent: number(attack.enemyHpPercent), atkCapPercent: number(attack.atkCapPercent), cappedEnemyHpDamage,
                damageBonus, takenDamage, progressiveVulnerability: progressiveVulnerability.map((item) => ({ id: item.id, perHit: item.value, maximumStacks: number(item.stacking?.maximumStacks, 1) })), vulnerabilityFactors, defense, resistance, weakness, toughness,
                damageBonusMultiplier, commonWithoutVulnerability, vulnerabilityFactorSum, critMultiplier, expectedCritMultiplier,
                baseDamage, commonMultiplier, independentMultiplier, critRatePercent: critRate * 100, critDamagePercent: number(effectiveStats.critDamage), critTakenDamage
            },
            applied,
            skipped
        };
    }

    function calculateElation(input) {
        const warnings = elationInputWarnings(input);
        if (warnings.length) return { supported: false, reason: warnings.join(" ") };
        const { character, enemy = {}, attack, elation: values } = input;
        const stats = character.stats;
        const modifiers = (input.modifiers || []).map(normalizeModifier);
        const allowed = ["elation", "critRate", "critRateOverride", "critDamage", "critTakenDamage", "defenseReduction", "defenseIgnore", "resistanceReduction", "resistancePenetration", "takenDamage"];
        modifiers.forEach((item) => {
            if (!item.enabled || !item.applicable) return;
            if (!item.calculable || (item.support?.status && item.support.status !== "calculable") || !modifierAppliesToAttack(item, attack)) {
                item.applicable = false;
                item.reason = item.support?.reason || "この愉悦攻撃は補正の対象外です";
            } else if (!allowed.includes(item.category)) {
                item.applicable = false;
                item.reason = ["damageBonus", "dotDamage"].includes(item.category) ? "通常の与ダメージ補正は愉悦ダメージに適用しません" : "この愉悦攻撃では適用しない補正です";
            }
        });
        enforceStackingRules(modifiers);
        const applied = modifiers.filter((item) => item.enabled && item.applicable);
        const skipped = modifiers.filter((item) => !item.enabled || !item.applicable);
        const sum = (category) => applied.filter((item) => item.category === category).reduce((total, item) => total + item.value, 0);
        const levelBase = ELATION_LEVEL_BASE[character.level];
        const baseDamage = levelBase * attack.multiplier / 100;
        const elationPercent = stats.elation + sum("elation");
        const elationMultiplier = 1 + elationPercent / 100;
        const punchlineMultiplier = 1 + 5 * values.punchline / (values.punchline + 240);
        const merrymakeMultiplier = 1 + values.merrymake / 100;
        const defense = defenseMultiplier(character.level, enemy.level, number(enemy.defenseReduction) + sum("defenseReduction"), number(enemy.defenseIgnore) + sum("defenseIgnore"));
        const resistance = resistanceMultiplier(number(enemy.resistance) - number(enemy.resistancePenetration) - sum("resistanceReduction") - sum("resistancePenetration"));
        const toughness = enemy.toughnessActive ? 0.9 : 1;
        const takenDamage = number(enemy.takenDamage) + sum("takenDamage");
        const vulnerability = 1 + takenDamage / 100;
        const commonWithoutVulnerability = elationMultiplier * punchlineMultiplier * merrymakeMultiplier * defense * resistance * toughness;
        const commonMultiplier = commonWithoutVulnerability * vulnerability;
        const nonCrit = baseDamage * commonMultiplier;
        const critRate = clamp(Math.max(stats.critRate + sum("critRate"), ...applied.filter((item) => item.category === "critRateOverride").map((item) => item.value)), 0, 100);
        const critDamage = stats.critDamage + sum("critDamage");
        const critTakenDamage = sum("critTakenDamage");
        const critMultiplier = 1 + (critDamage + critTakenDamage) / 100;
        const expectedCritMultiplier = 1 + critRate / 100 * (critMultiplier - 1);
        const crit = nonCrit * critMultiplier;
        const expected = nonCrit * expectedCritMultiplier;
        return {
            attack: { name: attack.name, hitCount: 1, target: attack.target, canCrit: true, scalingStat: "elation" },
            nonCrit, crit, expected, perHit: { nonCrit, crit, expected }, applied, skipped,
            breakdown: {
                damageFormula: "elation", levelBase, referenceValue: levelBase, multiplierPercent: attack.multiplier,
                multiplierAddition: 0, scalingTerms: [], flatDamage: 0, baseDamage,
                elationPercent, elationMultiplier, punchline: values.punchline, punchlineMultiplier,
                merrymakePercent: values.merrymake, merrymakeMultiplier,
                damageBonus: 0, damageBonusMultiplier: 1, independentMultiplier: 1,
                defense, resistance, weakness: 1, toughness, takenDamage, vulnerabilityFactors: [vulnerability],
                progressiveVulnerability: [], vulnerabilityFactorSum: vulnerability, commonWithoutVulnerability, commonMultiplier,
                critMultiplier, expectedCritMultiplier, critRatePercent: critRate, critDamagePercent: critDamage, critTakenDamage
            }
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
        const resistancePenetration = number(enemy.resistancePenetration) + applied.filter((item) => ["resistancePenetration", "resistanceReduction"].includes(item.category)).reduce((sum, item) => sum + item.value, 0);
        const takenDamage = number(enemy.takenDamage) + applied.filter((item) => item.category === "takenDamage").reduce((sum, item) => sum + item.value, 0);
        const defense = defenseMultiplier(character.level, enemy.level, defenseReduction, defenseIgnore);
        const resistance = resistanceMultiplier(number(enemy.resistance) - resistancePenetration);
        const toughnessScale = 0.5 + Math.max(0, number(enemy.maxToughness, 30)) / 120;
        const vulnerability = 1 + takenDamage / 100;
        return { supported: true, value: base * multiplier * effect * defense * resistance * toughnessScale * vulnerability, base, multiplier, effect, defense, resistance, toughnessScale, vulnerability, applied, skipped: modifiers.filter((item) => !item.enabled || !item.applicable) };
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

    window.HsrCalcEngine = Object.freeze({ trueDamageInputWarnings, elationInputWarnings, unsupportedAttackReason, calculate, calculateBreak, calculateSuperBreak, defenseMultiplier, resistanceMultiplier, actionSummary });
})();
