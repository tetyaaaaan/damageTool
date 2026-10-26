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
        const resolvedSpeed = Number.isFinite(Number(speed)) && Number(speed) > 0 ? Number(speed) : 100;
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
        const attackIds = modifier.target?.attackIds || [];
        const elements = modifier.target?.elements || [];
        const attackType = attack?.attackType || attack?.type || "normal";
        const attackTags = Array.isArray(attack?.tags) ? attack.tags : [];
        const element = attack?.element || "";
        return (!attackIds.length || attackIds.includes(String(attack?.id || "")))
            && (attackTypes.includes("all") || attackTypes.includes(attackType) || attackTags.some((tag) => attackTypes.includes(tag)))
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
        if (attack.damageFormula !== "elation" || attack.type !== "elation") return false;
        return (attack.id === "150520" && attack.elationContext === "ahaInstant" && attack.target === "aoe" && attack.hitCount === 1)
            || (attack.id === "150220" && attack.elationContext === "firstAhaInstant" && attack.target === "single" && attack.hitCount === 6)
            || (attack.id === "151320" && attack.elationContext === "fervor10Auto" && attack.target === "single" && attack.hitCount === 11 && attack.fixedPunchline === 20)
            || (attack.id === "151321" && attack.elationContext === "fervorEnhancedAha" && attack.target === "single" && attack.hitCount === 11 && attack.fixedPunchline === undefined);
    }

    function elationComponents(attack, fervor) {
        return (Array.isArray(attack.elationComponents) ? attack.elationComponents : []).map((component) => ({
            name: component?.name, count: attack.id === "151321" && component?.countFrom === "fervor" ? fervor : component?.count, multiplierPercent: component?.multipliers?.[attack.traceLevel - 1]
        }));
    }

    function elationInputWarnings(input = {}) {
        const character = input.character || {};
        const stats = character.stats || {};
        const values = input.elation || {};
        const warnings = [];
        if (!ELATION_LEVEL_BASE[character.level] || (character.eidolon ?? 0) !== 0) warnings.push("この愉悦攻撃はLv80・星魂0のみ計算対応です。");
        if (input.attack?.id === "151321") {
            if (values.context !== "fervorEnhancedAha" || values.stableEnemy !== true) warnings.push("熱気10到達の通常版発動後、次のアッハタイムの強化版で全ヒット中に撃破・敵条件変化がないことを確認してください。");
            if (input.enemy?.count !== 1) warnings.push("強化版151321は敵1体のみ計算対応です。");
            if (values.hasOtherElation !== true) warnings.push("強化版151321は他の愉悦キャラを編成した場合のみ計算対応です。A4の追加攻撃扱いは計算しません。");
            if (!Number.isInteger(values.fervor) || values.fervor < 10 || values.fervor > 30) warnings.push("強化版が消費する熱気に10～30の整数を入力してください。");
            const parts = elationComponents(input.attack, values.fervor);
            if (parts.length !== 3 || parts[0].count !== 1 || parts[1].count !== 10 || input.attack.elationComponents[2]?.countFrom !== "fervor"
                || parts.some(p => !Number.isFinite(p.multiplierPercent) || p.multiplierPercent < 0)
                || Math.abs(parts[0].multiplierPercent + 10 * parts[1].multiplierPercent - input.attack.multiplier) > 1e-9) warnings.push("強化版151321の全体・固定10ヒット・熱気追加倍率を確認できません。");
        } else if (input.attack?.id === "151320") {
            if (values.context !== "fervor10Auto" || values.stableEnemy !== true) warnings.push("熱気10到達による通常版の自動発動で、全11ヒット中に撃破・敵条件変化がないことを確認してください。");
            if (input.enemy?.count !== 1) warnings.push("夏アベンチュリンの通常版愉悦は敵1体のみ計算対応です。複数敵への分配は計算しません。");
            const components = elationComponents(input.attack);
            if (components.length !== 2 || components[0].count !== 1 || components[1].count !== 10
                || components.some((item) => !Number.isFinite(item.multiplierPercent) || item.multiplierPercent < 0)
                || Math.abs(components.reduce((sum, item) => sum + item.count * item.multiplierPercent, 0) - input.attack.multiplier) > 1e-9) warnings.push("通常版151320の全体攻撃・追加10ヒットの倍率を確認できません。");
        } else if (input.attack?.id === "150220") {
            if (values.context !== "firstAhaInstant") warnings.push("爻光は初回の通常アッハタイム（消費済み爆笑ネタ0）のみ計算対応です。発動条件を選択してください。");
            if (input.enemy?.count !== 1) warnings.push("爻光の愉悦スキルは敵が1体の場合のみ計算対応です。複数対象への分配は計算しません。");
            const components = elationComponents(input.attack);
            if (components.length !== 2 || components[0].count !== 1 || components[1].count !== 5
                || components.some((item) => !Number.isFinite(item.multiplierPercent) || item.multiplierPercent < 0)
                || Math.abs(components.reduce((sum, item) => sum + item.count * item.multiplierPercent, 0) - input.attack.multiplier) > 1e-9
                || input.attack.intrinsicTakenDamage !== 16) warnings.push("爻光の全体攻撃・追撃倍率と被ダメージ補正を確認できません。");
        } else if (values.context !== "ahaInstant") warnings.push("この愉悦攻撃はアッハタイム中のみ計算対応です。爆笑の褒美を参照する攻撃は対象外です。");
        if (input.attack?.id !== "151320" && (!Number.isInteger(values.punchline) || values.punchline < 0)) warnings.push("攻撃時点の爆笑ネタに0以上の整数を入力してください。");
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
        if (attack.id === "131508" && attack.damageFormula === "normalAndBreak" && attack.type === "enhancedNormal") return "";
        if (attack.damageFormula === "componentSequence") {
            const components = attack.damageComponents;
            const validFeixiaoDefinition = attack.id === "122002" && Array.isArray(components) && components.length === 2
                && attack.type === "skill" && (!attack.attackType || attack.attackType === "skill") && attack.target === "single"
                && attack.element === "Wind" && attack.sourceSkillId === "122002"
                && components[0]?.key === "skill" && components[0]?.attackId === "122002"
                && components[1]?.key === "followUp" && components[1]?.attackId === "122004";
            const validYukongDefinition = attack.id === "1207011" && Array.isArray(components) && components.length === 2
                && attack.type === "normal" && (!attack.attackType || attack.attackType === "normal") && attack.target === "single"
                && attack.element === "Imaginary" && attack.sourceSkillId === "120701"
                && components[0]?.key === "basic" && components[0]?.attackId === "120701"
                && components[1]?.key === "talent" && components[1]?.attackId === "120704";
            const validMozeDefinition = attack.id === "1223021" && Array.isArray(components) && components.length === 2
                && attack.type === "skill" && (!attack.attackType || attack.attackType === "skill") && attack.target === "single"
                && attack.element === "Thunder" && attack.sourceSkillId === "122302"
                && components[0]?.key === "skill" && components[0]?.attackId === "122302"
                && components[1]?.key === "additional" && components[1]?.attackId === "122304";
            return validFeixiaoDefinition || validYukongDefinition || validMozeDefinition ? "" : "この複合攻撃の構成は未対応です。";
        }
        const terms = [...(attack.scalingTerms || []), ...(attack.adjacentScalingTerms || [])];
        if ([attack.type, attack.attackType, attack.scalingStat, ...terms.map((term) => term.stat)].includes("elation")) return "愉悦ダメージの専用計算は未対応です。通常式では計算しません。";
        if (attack.damageFormula && !["statMultiplier", "enemyHpCappedByAtk"].includes(attack.damageFormula)) return "このダメージ計算方式は未対応です。通常式では計算しません。";
        const types = ["normal", "enhancedNormal", "skill", "enhancedSkill", "ultimate", "talent", "followUp", "additional", "dot", "memospriteSkill", "memospriteTalent", "assist"];
        if ([attack.type, attack.attackType].some((type) => type && !types.includes(type))) return "この攻撃種別の専用計算は未対応です。通常式では計算しません。";
        return "";
    }


    function songbirdInputWarnings(input = {}) {
        const a=input.attack || {}, c=input.character || {}, s=input.songbird || {}, warnings=[];
        if (c.level !== 80 || c.eidolon !== 0 || input.enemy?.count !== 1) warnings.push("夏の歌鳥はLv80・ロビン星魂0・敵1体分のみ計算対応です。");
        if (s.context !== "feverStable" || s.fever !== true || s.songbirdsActive !== true || s.count !== 3) warnings.push("精霊のターンの1回分・フィーバーON・夏の歌鳥3体・攻撃中の状態不変を確認してください。");
        if (!Number.isInteger(s.vibes) || s.vibes < 1 || s.vibes > 50) warnings.push("攻撃時点のバイブスに1～50の整数を入力してください。");
        if (!Number.isInteger(s.talentLevel) || s.talentLevel < 1 || s.talentLevel > 6) warnings.push("精霊天賦Lvに1～6を選択してください。");
        if (!Number.isInteger(s.normalTalentLevel) || s.normalTalentLevel < 1 || s.normalTalentLevel > 10) warnings.push("ロビン本体の天賦Lvに1～10を選択してください。");
        if (!(Number.isFinite(s.hp) && s.hp > 0)) warnings.push("精霊自身の最終HPに0より大きい値を入力してください。");
        for(const [key,label]of [["critRate","精霊の最終会心率"],["critDamage","精霊の最終会心ダメージ"],["damageBonus","精霊の最終風属性与ダメージ"]]) if (!Number.isFinite(s[key]) || s[key]<0) warnings.push(label+"に0以上の数値を入力してください。");
        if (a.type !== "memospriteSkill" || a.element !== "Wind" || a.scalingStat !== "hp" || a.hitCount !== 1 || !Number.isInteger(a.traceLevel) || a.traceLevel<1 || a.traceLevel>6 || !Number.isFinite(a.multiplier) || a.multiplier !== a.multipliers?.[a.traceLevel-1]
            || !Number.isFinite(a.feverDamageBase?.[s.talentLevel-1]) || !Number.isFinite(a.feverDamagePerVibe?.[s.talentLevel-1])) warnings.push("精霊スキルとフィーバー固有倍率を確認できません。");
        for(const id of ["trace:1512:151204:fever-defense-ignore","trace:1512:1151203:songbirds-vulnerability"]) if (!(input.modifiers || []).some(m=>m.id===id && m.enabled && m.applicable!==false && m.calculable!==false && Number.isFinite(m.value) && !(m.inputWarnings || []).length)) warnings.push("精霊の計算にはフィーバー防御無視と夏の歌鳥の被ダメージ増加を補正条件で有効にしてください。");
        return warnings;
    }

    function calculateSongbird(input) {
        const warnings=songbirdInputWarnings(input);
        if(warnings.length) return {supported:false,reason:warnings.join(" ")};
        const s=input.songbird,a=input.attack;
        const bonus=a.feverDamageBase[s.talentLevel-1]+s.vibes*a.feverDamagePerVibe[s.talentLevel-1];
        // Other friendly buffs belong in this unit's explicit final snapshot, never the owner's equipment route.
        const keep=["trace:1512:151204:fever-defense-ignore","trace:1512:1151203:songbirds-vulnerability"];
        const mods=(input.modifiers || []).map(m=>keep.includes(m.id)?m:{...m,applicable:false,reason:"精霊専用の最終入力で管理するか、今回の自動適用範囲外です。敵補正は敵条件欄で指定してください。"});
        mods.push({id:"songbirds-fever-own-damage",name:"精霊天賦・フィーバー固有与ダメージ",source:"夏ロビン・精霊天賦1151203",calculation:{stage:"damageBonus",operation:"add"},category:"damageBonus",value:bonus,enabled:true,applicable:true,conditionText:"精霊天賦Lv"+s.talentLevel+"・攻撃時点のバイブス"+s.vibes});
        const result=calculate({...input,character:{level:80,eidolon:0,stats:{hp:s.hp,critRate:s.critRate,critDamage:s.critDamage,damageBonus:s.damageBonus},baseStats:{}},
            attack:{...a,id:"1151201:resolved"},modifiers:mods});
        result.breakdown.actorKind="memosprite"; result.breakdown.feverDamageBonusPercent=bonus;
        result.breakdown.spriteTalentLevel=s.talentLevel; result.breakdown.vibes=s.vibes;
        return result;
    }

function fanningInputWarnings(input={}) {
 const a=input.attack||{},c=input.character||{},enemy=input.enemy||{},f=a.fanningInputs||{},warnings=[];
 if(c.level!==80 || c.eidolon!==0 || enemy.count!==1)warnings.push("ファニングはLv80・星魂0・敵1体のみ計算対応です。");
 if(!f.confirmed || enemy.toughnessActive!==false || enemy.weakness!==true)warnings.push("攻撃前から物理弱点の敵が撃破済み・九死の決闘中・超撃破や外部追加ダメージなしを確認してください。");
 if(!Number.isFinite(enemy.maxToughness)||enemy.maxToughness<=0||enemy.maxToughness>480)warnings.push("ファニングの対象の最大靭性（旧単位）は0より大きく480以下に限定しています。");
 if(!Number.isInteger(f.stacks)||f.stacks<1||f.stacks>3)warnings.push("ポケットアドバンテージに1～3層を指定してください。");
 if(!Number.isInteger(a.traceLevel)||a.traceLevel<1||a.traceLevel>6||!Number.isInteger(f.talentLevel)||f.talentLevel<1||f.talentLevel>10)warnings.push("ファニングは通常Lv1～6・天賦Lv1～10のみ計算対応です。");
 if(!Number.isFinite(c.stats?.atk)||c.stats.atk<=0||!Number.isFinite(c.stats?.breakEffect)||c.stats.breakEffect<0)warnings.push("最終ATKと0以上の撃破特効を入力してください。");
 if((input.modifiers||[]).some(m=>m.enabled&&m.applicable!==false&&m.category==="progressiveTakenDamage"))warnings.push("全段合算のためヒット順で変化する補正には対応していません。");
 if([input.modifiers,input.breakModifiers || input.modifiers].some(mods=>!(mods || []).some(m=>m.id==="trace:1315:131502:standoff-vulnerability" && m.enabled && m.applicable!==false && !(m.inputWarnings || []).length)))warnings.push("九死の決闘の被ダメージ増加を通常部分・天賦撃破の両方へ適用してください。");
 if(!Number.isFinite(a.breakMultipliersByLevel?.[f.talentLevel-1]?.[f.stacks-1]))warnings.push("天賦の撃破倍率を取得できません。");
 return warnings;
}

function calculateFanning(input) {
 const warnings=fanningInputWarnings(input);if(warnings.length)return{supported:false,reason:warnings.join(" ")};
 const a=input.attack,f=a.fanningInputs;
 const direct=calculate({...input,attack:{...a,name:"ファニング・通常部分（全段合算）",damageFormula:"statMultiplier"}});
 const breakMultiplier=a.breakMultipliersByLevel[f.talentLevel-1][f.stacks-1]/100;
 const extra=calculateBreak({...input,element:"Physical",multiplier:2*breakMultiplier,modifiers:input.breakModifiers||input.modifiers});
 if(!extra.supported)return extra;
 return {attack:{...direct.attack,name:a.name},nonCrit:direct.nonCrit+extra.value,crit:direct.crit+extra.value,expected:direct.expected+extra.value,components:{direct,break:extra},
 breakdown:{damageFormula:"normalAndBreak",breakMultiplierPercent:breakMultiplier*100,stacks:f.stacks},applied:[...direct.applied,...extra.applied].filter((m,i,all)=>all.findIndex(v=>v.id===m.id)===i),skipped:[]};
}

    function normalOnlyModifierReason(modifiers = []) {
        const item = modifiers.find(m => { const types = m.target?.attackTypes || m.attackTypes || ["all"]; return m.enabled !== false && m.applicable !== false && !m.displayOnly && modifierAppliesToAttack(m,{id:"120701",type:"normal",element:"Imaginary"}) && types.includes("normal") && !types.includes("all") && !types.includes("additional"); });
        return item ? (item.name || item.id || "通常攻撃限定補正") + "：徹札矢への通常攻撃限定補正の適用範囲は未検証です。追加成分と合計を停止します。" : "";
    }

    function calculate(input) {
        if (input.attack?.id === "131508" && input.attack.damageFormula === "normalAndBreak" && !unsupportedAttackReason(input.attack)) return calculateFanning(input);
        const character = input?.character || {};
        const enemy = input?.enemy || {};
        const attack = input?.attack || {};
        const unsupportedReason = unsupportedAttackReason(attack);
        if (unsupportedReason) return { supported: false, reason: unsupportedReason };
        if (attack.rejectNormalOnlyModifiers && attack.damageFormula !== "componentSequence") { const reason = normalOnlyModifierReason(input.modifiers || []); if (reason) return { supported: false, reason }; }
        if (attack.damageFormula === "componentSequence") return calculateComponentSequence(input);
        if (supportedElationAttack(attack)) return calculateElation(input);
        if (supportedTrueAttack(attack)) return calculateTrueDamage(input);
        if (attack.id === "1151201") return calculateSongbird(input);
        const fixedCrit = attack.fixedCritStats;
        if (fixedCrit && (attack.id !== "130903" || fixedCrit.critRate !== 100 || fixedCrit.critDamage !== 150 || attack.type !== "additional" || attack.element !== "Physical")) return { supported:false, reason:"この固定会心の構成データは計算対象外です。" };
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
        if (fixedCrit) modifiers.forEach(item => { if (item.enabled && item.applicable && ["critRate","critRateOverride","critDamage"].includes(item.category)) { item.applicable=false; item.reason="協奏追加ダメージは会心率100%・会心ダメージ150%固定のため再加算しません。"; } });
        enforceStackingRules(modifiers);
        const applied = modifiers.filter((item) => item.enabled && item.applicable);
        const skipped = modifiers.filter((item) => !item.enabled || !item.applicable);

        if (fixedCrit && applied.some(item => item.category === "critTakenDamage" && item.value !== 0)) return {supported:false,reason:"協奏追加ダメージと会心被ダメージ増加の併用は未検証です。この補正をOFFにしてください。"};

        const statBonus = (category, stat) => applied.filter((item) => item.category === category && (!stat || item.stat === stat)).reduce((sum, item) => sum + item.value, 0);
        const resolvedStat = (stat) => number(stats[stat]) + statBonus("statFlat", stat)
            + number(character.baseStats?.[stat]) * statBonus("statPercent", stat) / 100;
        const effectiveStats = {
            ...stats,
            hp: resolvedStat("hp"),
            atk: resolvedStat("atk"),
            def: resolvedStat("def"),
            speed: resolvedStat("speed"),
            critRate: fixedCrit ? fixedCrit.critRate : Math.max(number(stats.critRate) + statBonus("critRate"), number(attack.critRateOverride), ...applied.filter((item) => item.category === "critRateOverride").map((item) => item.value)),
            critDamage: fixedCrit ? fixedCrit.critDamage : number(stats.critDamage) + statBonus("critDamage"),
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
        const commonMultiplier = hitCount ? commonWithoutVulnerability * vulnerabilityFactorSum / hitCount : 0;
        const nonCritTotal = baseDamage * commonWithoutVulnerability * vulnerabilityFactorSum;
        const nonCritPerHit = hitCount ? nonCritTotal / hitCount : 0;
        const canCrit = attack.canCrit !== false;
        const critRate = clamp(effectiveStats.critRate, 0, 100) / 100;
        const critTakenDamage = applied.filter((item) => item.category === "critTakenDamage").reduce((sum, item) => sum + item.value, 0);
        const critMultiplier = canCrit ? 1 + (number(effectiveStats.critDamage) + critTakenDamage) / 100 : 1;
        const critPerHit = canCrit ? nonCritPerHit * critMultiplier : nonCritPerHit;
        const expectedCritMultiplier = canCrit ? 1 + critRate * (critMultiplier - 1) : 1;
        const expectedPerHit = nonCritPerHit * expectedCritMultiplier;

        return {
            attack: { name: attack.name || "手動攻撃", hitCount, hitCountLabel: attack.hitCountLabel, target: attack.target || "single", canCrit, scalingStat },
            nonCrit: nonCritTotal,
            crit: nonCritTotal * critMultiplier,
            expected: nonCritTotal * expectedCritMultiplier,
            perHit: { nonCrit: nonCritPerHit, crit: critPerHit, expected: expectedPerHit },
            breakdown: {
                referenceValue, multiplierPercent: scalingTerms.reduce((sum, term) => sum + term.multiplierPercent, 0), multiplierAddition, scalingTerms, flatDamage,
                damageFormula: attack.damageFormula || "statMultiplier", enemyHpPercent: number(attack.enemyHpPercent), atkCapPercent: number(attack.atkCapPercent), cappedEnemyHpDamage,
                damageBonus, takenDamage, progressiveVulnerability: progressiveVulnerability.map((item) => ({ id: item.id, perHit: item.value, maximumStacks: number(item.stacking?.maximumStacks, 1) })), vulnerabilityFactors, defense, resistance, weakness, toughness, defenseReductionPercent: defenseReduction, defenseIgnorePercent: defenseIgnore,
                damageBonusMultiplier, commonWithoutVulnerability, vulnerabilityFactorSum, critMultiplier, expectedCritMultiplier,
                baseDamage, commonMultiplier, independentMultiplier, critRatePercent: critRate * 100, critDamagePercent: number(effectiveStats.critDamage), critTakenDamage
            },
            applied,
            skipped
        };
    }

    function calculateComponentSequence(input = {}) {
        const attack = input.attack || {};
        const character = input.character || {};
        const enemy = input.enemy || {};
        const components = input.sequenceComponents || [];
        const yukong = attack.id === "1207011";
        const moze = attack.id === "1223021";
        const element = yukong ? "Imaginary" : moze ? "Thunder" : "Wind";
        const expected = yukong ? [{ key:"basic", id:"120701", type:"normal" }, { key:"talent", id:"120704", type:"additional" }] : moze ? [{key:"skill",id:"122302",type:"skill"},{key:"additional",id:"122304",type:"additional"}] : [
            { key: "skill", id: "122002", type: "skill" },
            { key: "followUp", id: "122004", type: "followUp" }
        ];
        const fail = reason => ({ supported: false, reason });
        if ((!yukong && !moze && attack.id !== "122002") || attack.damageFormula !== "componentSequence") return fail("この複合攻撃は未対応です。");
        if (character.level !== 80 || character.eidolon !== 0 || enemy.count !== 1 || enemy.weakness !== false || enemy.toughnessActive !== true) {
            return fail(yukong ? "通常＋徹札矢はLv80・星魂0・虚数弱点なし・敵1体・靭性ありのみ計算対応です。" : moze ? "モゼの初回スキル＋付加はLv80・星魂0・雷弱点なし・敵1体・靭性ありのみ計算対応です。" : "飛霄のスキル＋追加攻撃はLv80・星魂0・風弱点なし・敵1体・靭性ありのみ計算対応です。");
        }
        if (!(Number.isFinite(character.stats?.atk) && character.stats.atk > 0)
            || !Number.isFinite(character.stats?.critRate) || !Number.isFinite(character.stats?.critDamage)
            || !Number.isFinite(character.stats?.damageBonus)) {
            return fail("攻撃者の最終攻撃力・会心率・会心ダメージ・与ダメージ補正をすべて入力してください。");
        }
        if (!Number.isInteger(attack.traceLevel) || attack.traceLevel < 1 || attack.traceLevel > (yukong ? 6 : 10)) return fail(yukong ? "通常Lv1～6を指定してください。" : "スキルLv1～10を指定してください。");
        if (components.length !== expected.length) return fail("本体と追加成分の両方が必要です。");
        for (let index = 0; index < expected.length; index++) {
            const spec = expected[index];
            const component = components[index];
            const childInput = component?.input || {};
            const childAttack = childInput.attack || {};
            if (component?.key !== spec.key || component?.name !== attack.damageComponents?.[index]?.name
                || attack.damageComponents?.[index]?.key !== spec.key || attack.damageComponents?.[index]?.attackId !== spec.id
                || childAttack.id !== spec.id || childAttack.type !== spec.type || childAttack.attackType !== spec.type
                || childAttack.sourceSkillId !== spec.id || !Number.isInteger(childAttack.traceLevel) || childAttack.traceLevel < 1 || childAttack.traceLevel > (spec.type === "normal" ? 6 : 10)
                || (["skill", "basic"].includes(spec.key) && childAttack.traceLevel !== attack.traceLevel)
                || childAttack.damageFormula !== "statMultiplier" || childAttack.element !== element
                || childAttack.scalingStat !== "atk" || childAttack.target !== "single" || childAttack.hitCount !== 1
                || childAttack.canCrit === false || !Number.isFinite(childAttack.multiplier) || childAttack.multiplier <= 0) {
                return fail("本体または追加成分のデータが、対応している構成と一致しません。");
            }
            if (JSON.stringify(childInput.character) !== JSON.stringify(character)
                || JSON.stringify(childInput.enemy) !== JSON.stringify(enemy)) {
                return fail("複合攻撃の各成分は同じ攻撃時点のステータス・敵条件で計算してください。");
            }
        }
        if (yukong) { const reason = normalOnlyModifierReason(components.flatMap(c=>c.input.modifiers || [])); if(reason) return fail(reason); }
        const followUpModifiers = Array.isArray(components[1].input.modifiers) ? components[1].input.modifiers : [];
        const nativeFollowUpBonus = followUpModifiers.filter(item => item.id === "trace:1220:122004:followup-damage");
        if (!yukong && !moze && (nativeFollowUpBonus.length !== 1 || nativeFollowUpBonus[0].enabled !== true || nativeFollowUpBonus[0].applicable !== true
            || !Number.isFinite(nativeFollowUpBonus[0].value))) {
            return fail("天賦追加攻撃に必須の発動時与ダメージ補正を、補正条件から1件だけ有効にしてください。");
        }
        const resolved = components.map(component => ({
            key: component.key,
            name: component.name,
            result: calculate(component.input)
        }));
        const unsupported = resolved.find(component => component.result?.supported === false);
        if (unsupported) return fail(`${unsupported.name}：${unsupported.result.reason}`);
        if (resolved.some(component => !["nonCrit", "crit", "expected"].every(key => Number.isFinite(component.result[key])))) {
            return fail("本体または追加成分の計算結果が数値として成立しません。入力と補正条件を確認してください。");
        }
        const total = key => resolved.reduce((sum, component) => sum + number(component.result[key]), 0);
        const applied = resolved.flatMap(component => component.result.applied || []);
        const skipped = resolved.flatMap(component => component.result.skipped || []);
        return {
            attack: { name: attack.name || "スキル本体＋追加攻撃", hitCount: 1, hitCountLabel: attack.hitCountLabel || "本体＋追加攻撃1回", target: "single", canCrit: true, scalingStat: "atk" },
            nonCrit: total("nonCrit"),
            crit: total("crit"),
            expected: total("expected"),
            components: Object.fromEntries(resolved.map(component => [component.key, { ...component.result, componentName: component.name }])),
            breakdown: { damageFormula: "componentSequence", totalLabel: yukong ? "通常本体＋徹札矢の合計" : moze ? "スキル本体＋天賦付加の合計" : "スキル本体＋追加攻撃の合計", componentNames: resolved.map(component => component.name), condition: "同じ敵・最終ステータスを参照し、各成分の固有補正は別々に適用" },
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
        if (attack.id === "150220") modifiers.push(normalizeModifier({
            id: "yaoguang-woes-whisper", name: "爻光・被ダメージ増加（攻撃前に付与）", source: "愉悦スキル150220",
            category: "takenDamage", value: attack.intrinsicTakenDamage, conditionText: "初回の通常アッハタイム・敵1体",
            stacking: { group: "yaoguang-woes-whisper", rule: "max" }
        }));
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
        const components = elationComponents(attack, values.fervor);
        const multiplierPercent = attack.id === "151321" ? components.reduce((total, p) => total + p.count * p.multiplierPercent, 0) : attack.multiplier;
        const hitCount = attack.id === "151321" ? 11 + values.fervor : attack.hitCount;
        const baseDamage = levelBase * multiplierPercent / 100;
        const elationPercent = stats.elation + sum("elation");
        const elationMultiplier = 1 + elationPercent / 100;
        // Fervor-triggered 151320 uses the Talent's fixed value, never the shared manual input.
        const punchline = attack.id === "151320" ? 20 : values.punchline;
        const punchlineMultiplier = 1 + 5 * punchline / (punchline + 240);
        const merrymakeMultiplier = 1 + values.merrymake / 100;
        const defenseReduction = number(enemy.defenseReduction) + sum("defenseReduction");
        const defenseIgnore = number(enemy.defenseIgnore) + sum("defenseIgnore");
        const defense = defenseMultiplier(character.level, enemy.level, defenseReduction, defenseIgnore);
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
            attack: { name: attack.name, hitCount, target: attack.target, canCrit: true, scalingStat: "elation" },
            nonCrit, crit, expected, perHit: { nonCrit: nonCrit / hitCount, crit: crit / hitCount, expected: expected / hitCount }, applied, skipped,
            breakdown: {
                ...(["150220", "151320", "151321"].includes(attack.id) ? { elationComponents: components.map((component) => {
                    const perHitNonCrit = levelBase * component.multiplierPercent / 100 * commonMultiplier;
                    return { ...component, perHitNonCrit, nonCrit: perHitNonCrit * component.count,
                        crit: perHitNonCrit * component.count * critMultiplier, expected: perHitNonCrit * component.count * expectedCritMultiplier };
                }) } : {}),
                damageFormula: "elation", levelBase, referenceValue: levelBase, multiplierPercent,
                multiplierAddition: 0, scalingTerms: [], flatDamage: 0, baseDamage,
                elationPercent, elationMultiplier, punchline, punchlineMultiplier,
                ...(attack.id === "151320" ? { punchlineSource: "fixedTalent", elationScopeNote: "熱気10到達の通常版自動発動・敵1体・全体1ヒット＋追加10ヒット。爆笑ネタは天賦固定20。全ヒット中の撃破・敵条件変化なし。" } : {}),
                ...(attack.id === "151321" ? { fervor: values.fervor, punchlineSource: "ahaInput", elationScopeNote: "熱気10到達の通常版発動後、次のアッハタイムの強化版・敵1体。全体1＋固定10＋消費熱気分の追加ヒット。全ヒット中の撃破・敵条件変化なし。爆笑ネタは入力値を使用し、固定20は使いません。" } : {}),
                merrymakePercent: values.merrymake, merrymakeMultiplier,
                damageBonus: 0, damageBonusMultiplier: 1, independentMultiplier: 1,
                defense, defenseReductionPercent: defenseReduction, defenseIgnorePercent: defenseIgnore,
                resistance, weakness: 1, toughness, takenDamage, vulnerabilityFactors: [vulnerability],
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
            if (item.enabled && item.applicable && !["breakEffect","defenseReduction","defenseIgnore","resistanceReduction","resistancePenetration","takenDamage"].includes(item.category)) {
                item.applicable = false;
                item.reason = "弱点撃破には適用しない補正です";
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
            if (item.enabled && item.applicable && !modifierAppliesToAttack(item, { ...attack, tags: [...(attack.tags || []), "superBreak"] })) {
                item.applicable = false;
                item.reason = "この攻撃の超撃破ダメージは対象外です";
            }
            if (item.enabled && item.applicable && (!item.calculable || (item.support?.status && item.support.status !== "calculable"))) {
                item.applicable = false;
                item.reason = item.support?.reason || "計算反映前の確認が必要です";
            }
            if (item.enabled && item.applicable && !["breakEffect","breakEfficiency","superBreakDamage","defenseReduction","defenseIgnore","resistanceReduction","resistancePenetration","takenDamage"].includes(item.category)) {
                item.applicable = false;
                item.reason = "超撃破には適用しない補正です";
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
        const conversionInput = attack.superBreakMultiplier === undefined ? 100 : attack.superBreakMultiplier;
        const conversionMultiplier = conversionInput / 100;
        if (!Number.isFinite(conversionInput) || conversionMultiplier < 0) return { supported: false, reason: "超撃破の発生倍率に0以上の数値を入力してください。" };
        const value = conversionMultiplier * base * (effectiveToughnessDamage / 10) * breakEffect * defense * resistance * vulnerability * superBreakBonus;
        return { supported: true, value, base, conversionMultiplier, toughnessDamage, effectiveToughnessDamage, breakEffect, breakEfficiency, superBreakBonus, defense, resistance, vulnerability, applied, skipped: modifiers.filter((item) => !item.enabled || !item.applicable) };
    }

    window.HsrCalcEngine = Object.freeze({ normalOnlyModifierReason, fanningInputWarnings, songbirdInputWarnings, trueDamageInputWarnings, elationInputWarnings, unsupportedAttackReason, calculate, calculateBreak, calculateSuperBreak, defenseMultiplier, resistanceMultiplier, actionSummary });
})();
