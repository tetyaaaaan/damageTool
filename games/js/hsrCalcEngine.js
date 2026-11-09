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

    function cyreneDeathragonMultiplier(modifier, attack) {
        return ['1140706','1140712'].includes(attack.id) && modifier.id==='trace:1415:1141517:castorice-deathragon-talent-multiplier' && modifier.category==='multiplierAddition';
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
        modifiers.filter((item) => item.enabled && item.applicable && item.stacking?.rule === "multiply").forEach((item) => {
            item.applicable = false;
            item.reason = "乗算スタック規則は未対応です";
        });
        modifiers.filter((item) => item.enabled && item.applicable && item.stacking?.group).forEach((item) => {
            const key = item.stacking.group;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(item);
        });
        groups.forEach((items) => {
            const rule = items[0]?.stacking?.rule || "add";
            if (rule === "add" || rule === "multiply" || items.length < 2) return;
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

    // Fixed-source CB riders reuse the Elation equation, with an owner-specific snapshot.
    function certifiedBangerCurve(attack) {
        if(attack.id==='1503081')return [10,11,12,13,14,15];
        if(attack.id==='1501041')return [24,26.4,28.8,31.2,33.6,36,39,42,45,48];
        if(attack.id==='1501042'){const n=attack.sparxieTrapCount;return Number.isInteger(n)&&n>=1&&n<=20?[20,22,24,26,28,30,32.5,35,37.5,40].map((v,i)=>v+n*[10,11,12,13,14,15,16.25,17.5,18.75,20][i]):[];}
        return ({'1502041':[10,11,12,13,14,15,16.25,17.5,18.75,20], '1513041':[20,22,24,26,28,30,32.5,35,37.5,40], '1513042':[36,39.6,43.2,46.8,50.4,54,58.5,63,67.5,72],
            '1505041':[8,8.8,9.6,10.4,11.2,12,13,14,15,16], '1505042':[138,151.8,165.6,179.4,193.2,207,224.25,241.5,258.75,276], '1505043':[12.5,13.75,15,16.25,17.5,18.75,20.31,21.88,23.44,25], '8009041':[15,16.5,18,19.5,21,22.5,24.37,26.25,28.12,30], '8010041':[15,16.5,18,19.5,21,22.5,24.37,26.25,28.12,30]})[attack.id] || [];
    }

    function supportedElationAttack(attack) {
        if(['1503031','150320','1503201'].includes(attack.id)&&attack.characterId==='1503'&&attack.sourceSkillId===(attack.id==='1503031'?'150303':'150320')&&attack.damageFormula==='elation'&&attack.type==='elation'&&attack.elationContext===(attack.id==='1503031'?'pearlLearnedSnapshot':'pearlNextAttack')&&attack.element===(attack.id==='1503201'?'Physical':'Ice')&&attack.hitCount===1&&attack.target==='single')return true;
        if(attack.id==='1503081'&&attack.characterId==='1503'&&attack.sourceSkillId==='150308'&&attack.element==='Ice'&&attack.damageFormula==='elation'&&attack.type==='elation'&&attack.elationContext==='certifiedBanger'&&attack.hitCount===1&&attack.target==='single')return true;
        if (attack.damageFormula !== "elation" || attack.type !== "elation") return false;
        if(attack.id==='1502041'&&attack.characterId==='1502'&&attack.sourceSkillId==='150204'&&attack.element==='Physical'&&attack.elationContext==='certifiedBanger'&&attack.hitCount===1&&attack.target==='single')return true;
        if(attack.id==='150221'&&attack.characterId==='1502'&&attack.sourceSkillId==='150220'&&attack.element==='Physical'&&attack.elationContext==='ultimateAha'&&attack.fixedPunchline===20&&attack.target==='single'&&attack.hitCount===6)return true;
        if(attack.id==='150621'&&attack.characterId==='1506'&&attack.sourceSkillId==='150621'&&attack.element==='Imaginary'&&attack.elationContext==='ahaInstant'&&attack.target==='single'&&attack.hitCount===6&&attack.secretScoreSnapshot===240)return true;
        if(attack.characterId==='1501'&&attack.element==='Fire'&&attack.sourceSkillId===(attack.id==='150120'?'150120':'150104'))return (['1501041','1501042'].includes(attack.id)&&attack.elationContext==='certifiedBanger'&&attack.hitCount===1&&attack.target==='single')||(attack.id==='150120'&&attack.elationContext==='ahaInstant'&&attack.hitCount===21&&attack.target==='single');
        return (["1505041","1505042","1505043"].includes(attack.id) && attack.characterId==='1505' && attack.sourceSkillId==='150504' && attack.elationContext==='certifiedBanger' && attack.hitCount===(attack.id==='1505042'?10:1) && attack.target==='aoe' && attack.requiresFinalCritDamageConversion===true && attack.minimumCertifiedBanger===(attack.id==='1505042'?480:undefined)) || (["1513041","1513042"].includes(attack.id) && attack.characterId==='1513' && attack.sourceSkillId==='151304' && attack.elationContext==='certifiedBanger' && attack.hitCount===1 && attack.target==='aoe') || (attack.id === "150520" && attack.elationContext === "ahaInstant" && attack.target === "aoe" && attack.hitCount === 1)
            || (attack.id === "150220" && attack.elationContext === "firstAhaInstant" && attack.target === "single" && attack.hitCount === 6)
            || (attack.id === "151320" && attack.elationContext === "fervor10Auto" && attack.target === "single" && attack.hitCount === 11 && attack.fixedPunchline === 20)
            || (attack.id === "151321" && attack.elationContext === "fervorEnhancedAha" && attack.target === "single" && attack.hitCount === 11 && attack.fixedPunchline === undefined)
            || (["800920","801020","150120","1501042"].includes(attack.id) && attack.characterId === attack.id.slice(0,4) && attack.sourceSkillId === attack.id && attack.elationContext === "ahaInstant" && attack.target === "single" && attack.hitCount === 9 && attack.certifiedBangerScope === undefined)
            || (["8009041","8010041"].includes(attack.id) && attack.characterId === attack.id.slice(0,4) && attack.sourceSkillId === (attack.characterId === "8009" ? "800904" : "801004") && attack.elationContext === "certifiedBanger" && attack.certifiedBangerScope === "selfIsPartyMaximum" && attack.target === "aoe" && attack.hitCount === 1);
    }

    function elationComponents(attack, fervor) {
        return (Array.isArray(attack.elationComponents) ? attack.elationComponents : []).map((component) => ({
            name: component?.name, count: attack.id === "151321" && component?.countFrom === "fervor" ? fervor : attack.id === "1501042" && component?.countFrom === "sparxieTraps" ? attack.sparxieTrapCount : component?.count, multiplierPercent: component?.multipliers?.[attack.traceLevel - 1]
        }));
    }

    function elationInputWarnings(input = {}) {
        const character = input.character || {};
        const stats = character.stats || {};
        const values = input.elation || {};
        const warnings = [];
        if(input.attack?.id==='1503081'&&(character.id!=='1503'||input.enemy?.toughnessActive!==true||input.attack.traceLevel>6||values.certifiedBanger>50||(input.modifiers||[]).some(m=>m.enabled!==false&&m.applicable!==false&&(m.category==='progressiveTakenDamage'||['statPercent','statFlat'].includes(m.category)&&m.stat==='def'))))warnings.push('パール本人の最終愉悦度へDEF変換を一度含め、爆笑の褒美1～50を指定してください。未撃破の敵1体・通常Lv1～6のみ対応です。');
        if(input.attack?.id==='150621'){
            const a=input.attack,curve=[270,297,324,351,378,405,438.72,472.5,506.28,540];
            if(input.enemy?.count!==1||input.enemy?.toughnessActive!==true||values.context!=='ahaInstant'||a.secretScoreSnapshot!==240||a.multiplier!==curve[a.traceLevel-1])warnings.push('銀狼LV.999は事前無敵/スコア240・未撃破の敵1体・状態一定の6段のみ対応です。');
        }
        if (!ELATION_LEVEL_BASE[character.level] || (character.eidolon ?? 0) !== 0) warnings.push("この愉悦攻撃はLv80・星魂0のみ計算対応です。");
        if(input.attack?.id==='150120'){
            const a=input.attack,parts=elationComponents(a),per=[12.5,13.75,15,16.25,17.5,18.75,20.31,21.88,23.44,25],aoe=[25,27.5,30,32.5,35,37.5,40.62,43.75,46.88,50],i=a.traceLevel-1;
            if(input.enemy?.count!==1||values.context!=='ahaInstant'||parts.length!==2||parts[0].count!==1||parts[1].count!==20||parts[0].multiplierPercent!==aoe[i]||parts[1].multiplierPercent!==per[i]||Math.abs(a.multiplier-(aoe[i]+20*per[i]))>1e-8)warnings.push('火花の愉悦スキルは敵1体への全体1回＋ランダム20回・状態一定の想定のみ対応です。');
        } else if (["800920","801020"].includes(input.attack?.id)) {
            const a=input.attack,owner=a.id.slice(0,4),random=[10,11,12,13,14,15,16.25,17.5,18.75,20],last=[30,33,36,39,42,45,48.75,52.5,56.25,60];
            const parts=elationComponents(a),expected=8*random[a.traceLevel-1]+last[a.traceLevel-1];
            if(a.characterId!==owner||a.sourceSkillId!==a.id||a.target!=="single"||a.hitCount!==9||values.context!=="ahaInstant"||input.enemy?.count!==1||a.certifiedBangerScope!==undefined||parts.length!==2||parts[0].count!==8||parts[1].count!==1||parts[0].multiplierPercent!==random[a.traceLevel-1]||parts[1].multiplierPercent!==last[a.traceLevel-1]||a.multiplier!==expected||a.multipliers?.[a.traceLevel-1]!==expected)warnings.push("愉悦開拓者の愉悦スキルは固定版のランダム8回＋最後の全体1回・敵1体の想定状態のみです。");
        } else if (['1503031','150320','1503201'].includes(input.attack?.id)) {
            const a=input.attack,l=a.traceLevel,other=a.id!=='150320',learned=a.id==='1503031',curve=learned?[30,33,36,39,42,45,48.75,52.5,56.25,60]:[7.5,8.25,9,9.75,10.5,11.25,12.19,13.13,14.06,15];
            if(a.pearlPairActive!==true||character.id!==(other?'1502':'1503')||input.enemy?.toughnessActive!==true||input.enemy?.count!==1||a.multiplier!==curve[l-1]||values.context!==(learned?'pearlLearnedSnapshot':'pearlNextAttack')||!Number.isInteger(values.punchline)||values.punchline<0||values.punchline>10000||(other&&(!a.completedReferenceSnapshot||a.damageOwnerId!=='1502'||a.statReferenceId!=='1502'||a.referenceOwnerId!=='1502'||a.learnedOwnerId!=='1502'))||(input.modifiers||[]).some(m=>m.enabled!==false&&m.applicable!==false&&(m.category==='progressiveTakenDamage'||other&&!['enemyAll','enemySingle'].includes(m.target?.owner)||!other&&['statFlat','statPercent'].includes(m.category)&&m.stat==='def')))warnings.push('パール＋爻光のLv80/E0・未撃破の敵1体・完成済みの別所有者最終値と、各付加が参照するパール側の爆笑ネタを指定してください。');
        } else if (input.attack?.elationContext === "certifiedBanger") {
            const a=input.attack,curve=certifiedBangerCurve(a);
            if(["8009041","8010041"].includes(a.id)&&(a.certifiedBangerScope!=="selfIsPartyMaximum"||a.characterId!==a.id.slice(0,4)))warnings.push("開拓者の追加愉悦は本人の爆笑の褒美が味方内最大の比較状態のみ計算対応です。");
            if(values.context!=='certifiedBanger'||!Number.isInteger(values.certifiedBanger)||values.certifiedBanger<1||values.certifiedBanger>10000)warnings.push('攻撃時点の爆笑の褒美に1～10000の整数を入力してください。爆笑ネタは使用しません。');
            if(input.enemy?.count!==1||a.multiplier!==curve[a.traceLevel-1])warnings.push('追加愉悦の天賦倍率・敵1体の条件を確認してください。');
            if(a.id==='1501042'){const parts=elationComponents(a);if(parts.length!==2||parts[0].count!==1||parts[1].count!==a.sparxieTrapCount||Math.abs(parts.reduce((n,p)=>n+p.count*p.multiplierPercent,0)-a.multiplier)>1e-8)warnings.push('火花の本人CB・主対象とトラップ回数の成分を確認してください。');}
            if(a.id==='1505042'){const parts=elationComponents(a);if(parts.length!==2||parts[0].count!==1||parts[1].count!==9||parts.some(p=>!Number.isFinite(p.multiplierPercent))||Math.abs(parts.reduce((n,p)=>n+p.count*p.multiplierPercent,0)-a.multiplier)>1e-8)warnings.push('緋英の全体1回・9バウンドの追加愉悦成分を確認してください。');}
        } else if (input.attack?.id === "151321") {
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
        } else if (["150220","150221"].includes(input.attack?.id)) {
            if (values.context !== (input.attack.id === "150221" ? "ultimateAha" : "firstAhaInstant")) warnings.push("爻光は初回の通常アッハタイム（消費済み爆笑ネタ0）のみ計算対応です。発動条件を選択してください。");
            if (input.enemy?.count !== 1) warnings.push("爻光の愉悦スキルは敵が1体の場合のみ計算対応です。複数対象への分配は計算しません。");
            const components = elationComponents(input.attack);
            const curve=[100,110,120,130,140,150,162.5,175,187.5,200];
            if(input.attack.id==='150221'&&(input.enemy?.toughnessActive!==true||input.attack.multiplier!==curve[input.attack.traceLevel-1]))warnings.push('必殺追加アッハは固定20・未撃破の敵1体・固定版倍率を指定してください。');
            if (components.length !== 2 || components[0].count !== 1 || components[1].count !== 5
                || components.some((item) => !Number.isFinite(item.multiplierPercent) || item.multiplierPercent < 0)
                || Math.abs(components.reduce((sum, item) => sum + item.count * item.multiplierPercent, 0) - input.attack.multiplier) > 1e-9
                || input.attack.intrinsicTakenDamage !== 16) warnings.push("爻光の全体攻撃・追撃倍率と被ダメージ補正を確認できません。");
        } else if (values.context !== "ahaInstant") warnings.push("この愉悦攻撃はアッハタイム中のみ計算対応です。爆笑の褒美を参照する攻撃は対象外です。");
        if (input.attack?.elationContext !== "certifiedBanger" && !["151320","150221"].includes(input.attack?.id) && (!Number.isInteger(values.punchline) || values.punchline < 0)) warnings.push("攻撃時点の爆笑ネタに0以上の整数を入力してください。");
        if (!Number.isFinite(values.merrymake) || values.merrymake < 0) warnings.push("上笑に0以上の数値を入力してください。補正なしは0です。");
        for (const [key, label] of [["elation", "愉悦度"], ["critRate", "会心率"], ["critDamage", "会心ダメージ"]]) {
            if (!Number.isFinite(stats[key]) || stats[key] < 0) warnings.push(`${label}に0以上の最終値を入力してください。`);
        }
        if (!Number.isInteger(input.attack?.traceLevel) || input.attack.traceLevel < 1 || input.attack.traceLevel > 10) warnings.push(input.attack?.elationContext === "certifiedBanger" ? "追加愉悦の天賦Lvに1～10の整数を選択してください。" : "星魂0の愉悦スキルLvに1～10の整数を選択してください。");
        if (!Number.isFinite(input.attack?.multiplier) || input.attack.multiplier < 0) warnings.push("愉悦スキルの倍率を取得できません。");
        return warnings;
    }

    // Scoped to one final, non-True damage instance; no automatic result chaining.
    function supportedTrueAttack(attack) {
        if(['1800707','1800807'].includes(attack.id))return attack.characterId===(attack.id==='1800707'?'8007':'8008')&&attack.sourceSkillId==='1800707'&&attack.damageFormula==='trueDamage'&&attack.type==='trueDamage'&&attack.target==='single'&&attack.hitCount===1;

        if (["1406033","1406034"].includes(attack.id)) return attack.characterId === "1406" && attack.sourceSkillId === "140603" && attack.damageFormula === "trueDamage" && attack.type === "trueDamage" && attack.target === "single" && attack.hitCount === 1;
        return attack.id === "1415021" && attack.damageFormula === "trueDamage"
            && attack.type === "trueDamage" && attack.sourceSkillId === "141502"
            && attack.target === "single" && attack.hitCount === 1;
    }

    function trueDamageInputWarnings(input = {}) {
        const values = input.trueDamage || {};
        if(['1800707','1800807'].includes(input.attack?.id)){
            const a=input.attack,l=a.traceLevel,ep=input.modifierInputs?.['mem-beneficiary-max-energy'],v=input.modifierInputs?.['mem-original-damage'];
            return input.character?.level===80&&input.character?.eidolon===0&&input.enemy?.count===1&&Number.isInteger(l)&&l>=1&&l<=6&&Number.isInteger(ep)&&ep>=100&&ep<=200&&ep%10===0&&Number.isFinite(v)&&v>=0&&v<=1e12&&values.active===true&&values.sourceKind==='memSupportFinalNonTrueDamage'&&values.originalDamage===v&&a.multiplier===[18,20,22,24,26,28][l-1]+Math.min(20,(ep-100)/10*2)?[]:['応援が成立した味方の元ダメージ1回と最大EP100～200（10刻み）、精霊スキルLv1～6を指定してください。Lv80/E0・敵1体のみ対応です。'];
        }

        const warnings = [];
        if (["1406033","1406034"].includes(input.attack?.id)) {
            const expected=input.attack.id==="1406033"?25:75;
            if(input.character?.level!==80 || input.character?.eidolon!==0 || input.enemy?.count!==1 || values.sourceKind!=="cipherRecord" || values.active!==true || !Number.isFinite(values.originalDamage) || values.originalDamage<0 || input.attack.multiplier!==expected) warnings.push("サフェルの確定成分はLv80/E0/敵1体・指定した参照時点の記録値0以上と固定25%/75%倍率が必要です。");
            return warnings;
        }
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
            ...(["1406033","1406034","1800707","1800807"].includes(input.attack.id) ? {crit:value,expected:value} : {}),
            breakdown: { damageFormula: "trueDamage", sourceKind:input.trueDamage.sourceKind, originalDamage, multiplierPercent, condition: ['1800707','1800807'].includes(input.attack.id)?'応援が事前成立・元ダメージは確定分を含まない指定味方の補正後1回分': ["1406033","1406034"].includes(input.attack.id) ? "サフェルのこの成分が参照する記録値。補正/会心を再適用しない" : "領域有効・キュレネ生存／確定ダメージを含まない元ダメージ1回分" },
            applied: [],
            skipped: (input.modifiers || []).map(normalizeModifier).map((item) => ({ ...item, applicable: false, reason: "確定ダメージへ補正を再適用しません。元ダメージに含まれる補正は保持します。" }))
        };
    }

    // Same-action body + one Talent proc against a target with a pre-existing DoT.
    const elementalSequences = Object.fromEntries([
        ["1109012","1109","110901","normal","Fire","110904","additional","hook-enemy-burning"],
        ["1109022","1109","110902","skill","Fire","110904","additional","hook-enemy-burning"],
        ["1109092","1109","110909","enhancedSkill","Fire","110904","additional","hook-enemy-burning"],
        ["1109032","1109","110903","ultimate","Fire","110904","additional","hook-enemy-burning"],
        ["1103012","1103","110301","normal","Thunder","110304","talent","serval-target-shocked"],
        ["1103022","1103","110302","skill","Thunder","110304","talent","serval-target-shocked"],
        ["1103032","1103","110303","ultimate","Thunder","110304","talent","serval-target-shocked"]
    ].map(([id,owner,body,type,element,talent,talentType,stateKey]) => [id,{owner,body,type,element,talent,talentType,stateKey}]));

    const weltSequences = {
        "1004012": {body:"100401",variant:"previous",stateKey:"welt-enemy-slowed",type:"normal",parts:[{key:"body",id:"100401",type:"normal"},{key:"talent",id:"100404",type:"additional"}]},
        "1004022": {body:"100402",variant:"previous",stateKey:"welt-enemy-slowed",type:"skill",parts:[{key:"body",id:"100402",type:"skill",hits:3},{key:"talent",id:"100404",type:"additional",hits:3}]},
        "1004032": {body:"100403",variant:"previous",stateKey:"welt-enemy-slowed",type:"ultimate",parts:[{key:"body",id:"100403",type:"ultimate"},{key:"talent",id:"100404",type:"additional",hits:2}]},
        "11004012": {body:"1100401",type:"normal",parts:[{key:"body",id:"1100401",type:"normal"},{key:"judgment",id:"110041021",source:"11004102",type:"additional"},{key:"talent",id:"1100404",type:"additional"}]},
        "11004022": {body:"1100402",type:"skill",parts:[{key:"body",id:"1100402",type:"skill",hits:5},{key:"judgment",id:"110041022",source:"11004102",type:"additional"},{key:"talent",id:"1100404",type:"additional",hits:5}]},
        "11004032": {body:"1100403",type:"ultimate",parts:[{key:"body",id:"1100403",type:"ultimate"},{key:"talent",id:"1100404",type:"additional",hits:2}]}
    };

    // Only Kafka-owned, pre-existing Shock; other owners remain separate.
    const kafkaSequences = {
        "1005029": {body:"100502",shock:"1005031",type:"skill",variant:"previous",trace:"skill"},
        "1005039": {body:"100503",shock:"1005031",type:"ultimate",variant:"previous",trace:"ultimate"},
        "11005029": {body:"1100502",shock:"11005031",type:"skill",variant:"enhanced",trace:"skill"},
        "11005039": {body:"1100503",shock:"11005031",type:"ultimate",variant:"enhanced",trace:"ultimate"},
        "11005049": {body:"1100504",shock:"11005031",type:"followUp",variant:"enhanced",trace:"talent"}
    };

    const bangerActionSequences = {
        "1502012": {owner:"1502",body:"150201",rider:"1502041",riderSource:"150204",type:"normal",element:"Physical"},
        "1501082": {owner:"1501",body:"150108",rider:"1501042",riderSource:"150104",type:"enhancedNormal",element:"Fire"},
        "1501032": {owner:"1501",body:"150103",rider:"1501041",riderSource:"150104",type:"ultimate",element:"Fire"},
        "1505022": {owner:"1505",body:"150502",rider:"1505041",type:"skill",element:"Physical"},
        "1505032": {owner:"1505",body:"150503",rider:"1505042",type:"ultimate",element:"Physical"},
        "1505044": {owner:"1505",body:"150504",rider:"1505043",type:"followUp",element:"Physical"},
        "1513022": {owner:"1513",body:"151302",rider:"1513041",type:"skill",element:"Quantum"},
        "1513032": {owner:"1513",body:"151303",rider:"1513042",type:"ultimate",element:"Quantum"},
        "8009022": {owner:"8009",body:"800902",rider:"8009041",riderSource:"800904",type:"skill",element:"Thunder",scope:"selfIsPartyMaximum"},
        "8010022": {owner:"8010",body:"801002",rider:"8010041",riderSource:"801004",type:"skill",element:"Thunder",scope:"selfIsPartyMaximum"}
    };

    function unsupportedAttackReason(attack = {}) {
        if(attack.id==='150308'&&attack.characterId==='1503'&&attack.sourceSkillId==='150308'&&attack.damageFormula==='componentSequence'&&attack.type==='enhancedNormal'&&attack.element==='Ice')return '';

        if(attack.id==='1414039'&&attack.characterId==='1414'&&attack.sourceSkillId==='141403'&&attack.damageFormula==='componentSequence'&&attack.type==='followUp'&&attack.element==='Physical')return '';

        if(['800708','800808','150805'].includes(attack.id)&&attack.damageFormula==='componentSequence'&&attack.sourceSkillId===attack.id&&attack.characterId===(attack.id==='150805'?'1508':attack.id.slice(0,4)))return '';

        if(attack.id==='140709'&&attack.characterId==='1407'&&attack.sourceSkillId==='140709'&&attack.type==='enhancedSkill'&&attack.element==='Quantum'&&attack.damageFormula==='componentSequence')return '';
        if(attack.id==='11407022'&&attack.characterId==='1407'&&attack.sourceSkillId==='1140702'&&attack.damageFormula==='componentSequence'&&attack.type==='memospriteSkill'&&attack.element==='Quantum')return '';
        if(attack.id==='1140901'&&attack.characterId==='1409'&&attack.sourceSkillId==='1140901'&&attack.type==='memospriteSkill'&&attack.damageFormula==='recordedHealing'&&attack.scalingStat==='healingRecord'&&attack.element==='Wind')return '';
        if(attack.id==='11415012'&&attack.characterId==='1415'&&attack.sourceSkillId==='1141501'&&attack.damageFormula==='componentSequence'&&attack.type==='memospriteSkill'&&attack.element==='Ice')return '';
        if (['1410012','1410022'].includes(attack.id) && attack.characterId==='1410' && attack.damageFormula==='componentSequence' && attack.sourceSkillId===(attack.id==='1410012'?'141001':'141002') && attack.element==='Physical' && attack.type===(attack.id==='1410012'?'normal':'skill')) return '';
        if (/^11415220[1-8]$/.test(attack.id) && attack.characterId==='1410' && attack.sourceSkillId==='1141522' && attack.damageFormula==='resolvedDamageMultiplier' && attack.type==='dot') return '';
        if(['1410013','1410023'].includes(attack.id)&&attack.characterId==='1410'&&attack.damageFormula==='componentSequence')return '';
        if (/^1141522[1-8]$/.test(attack.id) && attack.characterId==='1410' && attack.sourceSkillId==='1141522' && attack.damageFormula==='resolvedDamageMultiplier' && attack.dataOwnerId==='1410' && attack.type==='dot') return '';
        if(attack.id==='1403033'&&attack.characterId==='1403'&&attack.damageFormula==='componentSequence'&&attack.type==='additional'&&attack.element==='Quantum')return '';
        if (attack.damageFormula === "resolvedDamageMultiplier" && ["14101021","14101022","14101023","14101024"].includes(attack.id) && attack.characterId === "1410" && attack.dataOwnerId === "1410" && attack.type === "dot") return "";
        if (attack.support?.status === "displayOnly") return attack.support.reason || "この攻撃は表示のみのため、ダメージを計算しません。";
        if (supportedElationAttack(attack) || supportedTrueAttack(attack)) return "";
        if(["1321042","1321044"].includes(attack.id) && attack.characterId === "1321" && attack.sourceSkillId === "132104" && attack.type === "superBreak" && attack.damageFormula === "dahliaSuperBreak" && attack.element === "Fire") return "";
        if (attack.id === "131718" && attack.characterId === "1317" && attack.sourceSkillId === "131718" && attack.damageFormula === "nativeBreakSequence" && attack.nativeBreakKind === "rappa" && attack.type === "enhancedNormal" && attack.element === "Imaginary") return "";
        if (["131008","131009","1131008","1131009"].includes(attack.id) && attack.characterId === "1310" && attack.damageFormula === "nativeBreakSequence") return "";
        if (attack.id === "131508" && attack.damageFormula === "normalAndBreak" && attack.type === "enhancedNormal") return "";
        if (attack.damageFormula === "componentSequence") {
            const components = attack.damageComponents;
            if (["1402012","140208"].includes(attack.id) && attack.characterId === "1402" && attack.sourceSkillId === (attack.id === "140208" ? "140208" : "140201") && attack.element === "Thunder") return "";
            const elemental = elementalSequences[attack.id];
            const validElementalDefinition = elemental && attack.characterId === elemental.owner && attack.sourceSkillId === elemental.body
                && attack.type === elemental.type && attack.element === elemental.element && components?.length === 2
                && components[0]?.key === "body" && components[0]?.attackId === elemental.body
                && components[1]?.key === "additional" && components[1]?.attackId === elemental.talent;
            const welt = weltSequences[attack.id];
            const validWeltDefinition = welt && attack.characterId === "1004" && attack.variant === (welt.variant || "enhanced") && attack.sourceSkillId === welt.body
                && attack.type === welt.type && attack.element === "Imaginary" && components?.length === welt.parts.length
                && welt.parts.every((p,i) => components[i]?.key === p.key && components[i]?.attackId === p.id);
            if (attack.id === "150905" && attack.characterId === "1509" && attack.sourceSkillId === "150905" && attack.type === "followUp" && attack.element === "Thunder" && components?.length === 2 && components[0]?.key === "lightning" && components[0]?.attackId === "1509051" && components[1]?.key === "wind" && components[1]?.attackId === "supplemental:trace:1509:150905:saber-wind-followup") return "";
            if (attack.id === "150403" && attack.characterId === "1504" && attack.sourceSkillId === "150403" && attack.type === "ultimate" && attack.element === "Thunder" && components?.length>=2 && components.length<=5 && components.every((d,i)=>d.key===["direct","freeTalent","gluttonyBite1","gluttonyBite2","gluttonyBite3"][i] && d.attackId===["1504031","1504032","1504033","1504033","1504033"][i])) return "";
            const mixed = bangerActionSequences[attack.id];
            const validBangerAction = mixed && attack.characterId === mixed.owner && attack.sourceSkillId === mixed.body && attack.type === mixed.type && attack.element === mixed.element
                && (mixed.scope === undefined || attack.certifiedBangerScope === mixed.scope)
                && components?.length === 2 && components[0]?.key === "direct" && components[0]?.attackId === mixed.body && components[1]?.key === "banger" && components[1]?.attackId === mixed.rider;
            const kafka = kafkaSequences[attack.id];
            const validKafkaDefinition = kafka && attack.characterId === "1005" && attack.sourceSkillId === kafka.body && attack.type === kafka.type && attack.variant === kafka.variant && attack.element === "Thunder"
                && components?.length === 2 && components[0]?.key === "direct" && components[0]?.attackId === kafka.body && components[1]?.key === "shock" && components[1]?.attackId === kafka.shock;
            const validGuinaifenDefinition = attack.id === "1210032" && attack.characterId === "1210" && attack.sourceSkillId === "121003" && attack.type === "ultimate" && attack.element === "Fire"
                && components?.length === 2 && components[0]?.key === "direct" && components[0]?.attackId === "121003" && components[1]?.key === "burn" && components[1]?.attackId === "1210031";
            const validAcheronDefinition = attack.id === "130803" && attack.characterId === "1308" && attack.sourceSkillId === "130803" && attack.type === "ultimate" && attack.element === "Thunder" && Array.isArray(components) && components.length === 13;
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
            const validDahliaDefinition = ((attack.id === "1321043" && attack.sourceSkillId === "132104" && attack.type === "followUp") || (attack.id === "1321012" && attack.sourceSkillId === "132101" && attack.type === "normal")) && attack.characterId === "1321" && attack.element === "Fire" && components?.length === 2;
            const validSerinDefinition = attack.id === "1410032" && attack.characterId === "1410" && attack.sourceSkillId === "141003" && attack.type === "ultimate" && components?.length === 6;
            const validCipherDefinition = attack.id === "140603" && attack.characterId === "1406" && attack.sourceSkillId === "140603" && attack.type === "ultimate" && components?.length === 4;
            const validLingshaDefinition = attack.id === "1222062" && attack.characterId === "1222" && attack.sourceSkillId === "122206" && attack.type === "followUp" && attack.element === "Fire" && attack.target === "single" && components?.length === 2;
            const validSushangDefinition = attack.id === "1206022" && attack.characterId === "1206" && attack.sourceSkillId === "120602" && attack.type === "skill" && attack.element === "Physical" && attack.target === "single" && components?.length === 3;
            const validLukaDefinition = attack.id === "1111083" && attack.type === "enhancedNormal" && attack.sourceSkillId === "111108" && attack.element === "Physical" && attack.target === "single"
                && Array.isArray(components) && components.length === 3 && components[0]?.key === "punches" && components[0]?.attackId === "1111081" && components[1]?.key === "uppercut" && components[1]?.attackId === "1111082" && components[2]?.key === "bleed" && components[2]?.attackId === "1111041";
            return ( ["1405011","1405021","1405013","1405024"].includes(attack.id) && attack.characterId==="1405" && attack.type===(["1405011","1405013"].includes(attack.id)?"normal":"skill") ) || (attack.id === "140109" && attack.characterId === "1401" && attack.type === "enhancedSkill" && attack.element === "Ice" && components?.length === 4) || validElementalDefinition || validWeltDefinition || validGuinaifenDefinition || validKafkaDefinition || validBangerAction || validAcheronDefinition || validFeixiaoDefinition || validYukongDefinition || validMozeDefinition || validSushangDefinition || validLingshaDefinition || validCipherDefinition || validSerinDefinition || validDahliaDefinition || validLukaDefinition || (attack.id === "1223031" && attack.type === "ultimate" && attack.sourceSkillId === "122303" && attack.element === "Thunder") || (["1224011","1224081"].includes(attack.id) && attack.characterId === "1224") ? "" : "この複合攻撃の構成は未対応です。";
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
 if(!Number.isInteger(f.stacks)||f.stacks<(f.allowZeroStacks===true?0:1)||f.stacks>3)warnings.push("ポケットアドバンテージに0～3層を指定してください。");
 if(!Number.isInteger(a.traceLevel)||a.traceLevel<1||a.traceLevel>6||!Number.isInteger(f.talentLevel)||f.talentLevel<1||f.talentLevel>10)warnings.push("ファニングは通常Lv1～6・天賦Lv1～10のみ計算対応です。");
 if(!Number.isFinite(c.stats?.atk)||c.stats.atk<=0||!Number.isFinite(c.stats?.breakEffect)||c.stats.breakEffect<0)warnings.push("最終ATKと0以上の撃破特効を入力してください。");
 if((input.modifiers||[]).some(m=>m.enabled&&m.applicable!==false&&m.category==="progressiveTakenDamage"))warnings.push("全段合算のためヒット順で変化する補正には対応していません。");
 if([input.modifiers,input.breakModifiers || input.modifiers].some(mods=>!(mods || []).some(m=>m.id==="trace:1315:131502:standoff-vulnerability" && m.enabled && m.applicable!==false && !(m.inputWarnings || []).length)))warnings.push("九死の決闘の被ダメージ増加を通常部分・天賦撃破の両方へ適用してください。");
 if(f.stacks!==0&&!Number.isFinite(a.breakMultipliersByLevel?.[f.talentLevel-1]?.[f.stacks-1]))warnings.push("天賦の撃破倍率を取得できません。");
 return warnings;
}

function calculateFanning(input) {
 const warnings=fanningInputWarnings(input);if(warnings.length)return{supported:false,reason:warnings.join(" ")};
 const a=input.attack,f=a.fanningInputs;
 const direct=calculate({...input,attack:{...a,name:"ファニング・通常部分（全段合算）",damageFormula:"statMultiplier"}});
 const breakMultiplier=f.stacks===0?0:a.breakMultipliersByLevel[f.talentLevel-1][f.stacks-1]/100;
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
        if(['1414031','1414032','14141031'].includes(input.attack?.id)){
            const a=input.attack,c=input.character||{},e=input.enemy||{},l=a.traceLevel,extra=a.id==='14141031',profile=a.id==='1414031'?'dragon':'additional',curve=extra?[40]:[40,44,48,52,56,60,65,70,75,80];
            if(c.id!=='1414'||c.level!==80||c.eidolon!==0||e.count!==1||e.toughnessActive!==true||a.characterId!=='1414'||a.statReferenceId!=='1414'||a.effectiveProfile!==profile||!a.completedReferenceSnapshot||a.damageFormula!=='statMultiplier'||a.scalingStat!=='atk'||a.element!=='Physical'||a.type!==(profile==='dragon'?'followUp':'additional')||a.sourceSkillId!==(extra?'1414103':'141403')||a.hitCount!==1||a.scalingTerms?.length||!Number.isInteger(l)||l<1||l>curve.length||a.multiplier!==curve[l-1]||!['atk','critRate','critDamage','damageBonus'].every(k=>Number.isFinite(c.stats?.[k])&&(k==='atk'?c.stats[k]>0:c.stats[k]>=0))||!['defenseIgnore','resistancePenetration'].every(k=>Number.isFinite(e[k]))||(input.modifiers||[]).some(m=>m.enabled!==false&&m.applicable!==false&&(!['enemyAll','enemySingle'].includes(m.target?.owner)||m.category==='progressiveTakenDamage')))return {supported:false,reason:'本人を同袍にした強化龍霊の各成分に有効な最終値を指定してください。Lv80/E0・未撃破の敵1体・U Lv1～10・追加能力は固定40%のみ対応です。'};
        }
        if(['151001','151003','151009','151022'].includes(input.attack?.id)){
            const a=input.attack,c=input.character||{},e=input.enemy||{},l=a.traceLevel,curve=({'151001':[50,60,70,80,90,100],'151003':[120,132,144,156,168,180,195,210,225,240],'151009':[10,11,12,13,14,15,16.25,17.5,18.75,20],'151022':[172,187.6,203.2,218.8,234.4,250,269.5,289,308.5,328]})[a.id];
            if(c.level!==80||c.eidolon!==0||e.count!==1||!Number.isInteger(l)||l<1||l>curve.length||a.multiplier!==curve[l-1]||a.damageFormula!=='statMultiplier'||a.scalingStat!=='atk'||a.characterId!=='1510'||c.id&&c.id!=='1510'||a.scalingTerms?.length||a.hitCount!==1||(a.id==='151009'&&input.modifierInputs?.['himeko-departure-drive']!==1))return {supported:false,reason:'姫子・旅立ちはLv80/E0・敵1体の指定した単発成分のみ対応です。パルス砲は攻撃前の原動力1だけを明示してください。'};
        }

        if(input.attack?.id==='11415211'){
            const a=input.attack,c=input.character||{},e=input.enemy||{},v=input.modifierInputs||{},curve=[5,6,7,8,9,10];
            if(c.id!=='1408'||c.level!==80||c.eidolon!==0||e.count!==1||e.toughnessActive!==true||a.cyreneBlessingActive!==true||v['cyrene-phainon-blessing-active']!==true||v['phainon-kaslana-form']!==true||a.characterId!=='1408'||a.statReferenceId!=='1408'||a.sourceSkillId!=='1141521'||a.damageFormula!=='statMultiplier'||a.scalingStat!=='atk'||a.type!=='additional'||a.element!=='Fire'||a.hitCount!==5||!Number.isInteger(a.traceLevel)||a.traceLevel<1||a.traceLevel>6||a.multiplier!==curve[a.traceLevel-1]||c.stats?.damageBonus!==v['element-damage:1408:Fire']||e.resistance!==v['enemy-resistance:Fire']||(input.modifiers||[]).some(m=>m.enabled!==false&&m.applicable!==false&&m.category==='progressiveTakenDamage'))return {supported:false,reason:'世負い祝福が事前成立したカスライナ本人の炎付加5段のみ。キュレネ精霊スキルLv1～6・独立した炎与ダメージ/敵炎耐性・未撃破の敵1体を指定してください。'};
        }

        if(['11415181','1405023'].includes(input.attack?.id)){
            const a=input.attack,c=input.character||{},e=input.enemy||{},curve=[35,38.5,42,45.5,49,52.5,56.87,61.25,65.62,70];
            if(c.id!=='1405'||c.level!==80||c.eidolon!==0||e.count!==1||e.toughnessActive!==false||e.weaknessCount!==7||a.cyreneExtraHitsActive!==true||input.modifierInputs?.['cyrene-anaxa-extra-hits-active']!==true||a.characterId!=='1405'||a.sourceSkillId!==(a.id==='1405023'?'140502':'1141518')||a.type!=='skill'||a.element!=='Wind'||a.scalingStat!=='atk'||a.damageFormula!=='statMultiplier'||a.hitCount!==(a.id==='1405023'?8:3)||!Number.isInteger(a.traceLevel)||a.traceLevel<1||a.traceLevel>10||a.multiplier!==curve[a.traceLevel-1]||a.scalingTerms?.length)return {supported:false,reason:'理性+3ヒットが有効なアナイクス本人・7弱点/本質暴露・事前撃破済みの敵1体・Skill Lv1～10のみ対応です。8段には基本5段を含みます。'};
        }
        if(input.attack?.id==='11415251'){
            const a=input.attack,c=input.character||{},e=input.enemy||{},v=input.modifierInputs||{},shield=v['cyrene-earth-companion-shield'],ratio=[40,48,56,64,72,80][a.traceLevel-1];
            if(c.id!=='1414'||c.level!==80||c.eidolon!==0||e.count!==1||e.toughnessActive!==true||a.characterId!=='1414'||a.sourceSkillId!=='1141525'||a.statReferenceId!=='1414'||a.effectiveProfile!=='additional'||!a.completedReferenceSnapshot||!a.cyreneBlessingActive||v['cyrene-earth-active']!==true||!Number.isInteger(a.traceLevel)||a.traceLevel<1||a.traceLevel>6||!Number.isFinite(shield)||shield<0||shield>1e12||a.flatDamage!==shield*ratio/100||a.shieldRatio!==ratio||a.multiplier!==0||a.damageFormula!=='statMultiplier'||a.element!=='Physical'||a.type!=='additional'||a.hitCount!==1||a.scalingTerms?.length||!['critRate','critDamage','damageBonus'].every(k=>Number.isFinite(c.stats?.[k])&&c.stats[k]>=0)||!['defenseIgnore','resistancePenetration'].every(k=>Number.isFinite(e[k]))||(input.modifiers||[]).some(m=>m.enabled!==false&&m.applicable!==false&&(!['enemyAll','enemySingle'].includes(m.target?.owner)||m.category==='progressiveTakenDamage')))return {supported:false,reason:'大地の付加は本人を同袍にした丹恒・騰荒の指定バリア耐久と、付加に有効な最終値を使う1回比較です。Lv80/E0・未撃破の敵1体・祝福事前成立・MemSkill1～6のみ対応です。'};
        }
        if(input.attack?.id==='11415151'){
            const a=input.attack,c=input.character||{},e=input.enemy||{},curve=[6,6.6,7.2,7.8,8.4,9,9.75,10.5,11.25,12];
            if(c.id!=='1403'||a.characterId!=='1403'||a.sourceSkillId!=='1141515'||a.type!=='additional'||a.element!=='Quantum'||a.scalingStat!=='hp'||a.hitCount!==1||a.multiplier!==curve[a.traceLevel-1]||a.cyreneBarrierActive!==true||input.modifierInputs?.['tribbie-zone-active']!==true||input.modifierInputs?.['trace:1415:1141515:tribbie-defense-ignore-active']!==true||input.modifierInputs?.['tribbie-followup-damage-stacks']!==3||a.scalingTerms?.length)return {supported:false,reason:'門と道が事前成立した追撃後の結界付加のみ。未撃破の敵1体・事前A2が3層で飽和した状態を指定してください。'};
        }

        const round29Attack=input.attack||{};
        if(['800703','800803','1800701','1800801','150803','150809'].includes(round29Attack.id)){
            const a=round29Attack,c=input.character||{},e=input.enemy||{},l=a.traceLevel,memo=['800703','800803','1800701','1800801'].includes(a.id),u=['800703','800803'].includes(a.id),n=input.modifierInputs?.['rin-repeat-count'];
            const curve=memo?(u?[120,132,144,156,168,180,195,210,225,240]:[117,140.4,163.8,187.2,210.6,234]):a.id==='150803'?[300,330,360,390,420,450,487.5,525,562.5,600]:[45,49.5,54,58.5,63,67.5,73.12,78.75,84.38,90];
            const expected=curve[l-1]*(a.id==='150809'?1+n:1);
            if(c.level!==80||c.eidolon!==0||e.count!==1||e.toughnessActive!==true||!Number.isInteger(l)||l<1||l>curve.length||a.damageFormula!=='statMultiplier'||a.scalingStat!=='atk'||a.hitCount!==1||Math.abs(a.multiplier-expected)>1e-8||!Number.isFinite(expected)||a.element!==(memo?'Ice':'Quantum')||a.type!==(memo?(u?'ultimate':'memospriteSkill'):a.id==='150803'?'ultimate':'enhancedSkill')||a.characterId!==(memo?(['800703','1800701'].includes(a.id)?'8007':'8008'):'1508')||a.sourceSkillId!==(memo?u?a.id:'1800701':a.id)||(memo&&(c.id!=='18007'||!a.completedReferenceSnapshot||a.damageOwnerId!=='18007'))||(!memo&&c.id!=='1508')||(memo&&!['defenseIgnore','resistancePenetration'].every(k=>Number.isFinite(e[k])))||(a.id!=='150809'&&a.scalingTerms?.length&&(!['1800701','1800801'].includes(a.id)||a.scalingTerms.length!==2||a.scalingTerms[0].stat!=='atk'||a.scalingTerms[1].stat!=='atk'||Math.abs(a.scalingTerms[0].multiplier-[18,21.6,25.2,28.8,32.4,36][l-1]*4)>1e-8||a.scalingTerms[1].multiplier!==[45,54,63,72,81,90][l-1]))||!['atk','critRate','critDamage','damageBonus'].every(k=>Number.isFinite(c.stats?.[k])&&(k==='atk'?c.stats[k]>0:c.stats[k]>=0))||(a.id==='150809'&&(!Number.isInteger(n)||n<0||n>33||a.scalingTerms?.length!==2||a.scalingTerms[0].stat!=='atk'||a.scalingTerms[1].stat!=='atk'||a.scalingTerms[0].multiplier!==curve[l-1]||a.scalingTerms[1].multiplier!==curve[l-1]*n))||(input.modifiers||[]).some(m=>m.enabled!==false&&m.applicable!==false&&(m.category==='progressiveTakenDamage'||memo&&!['enemyAll','enemySingle'].includes(m.target?.owner))))return {supported:false,reason:'所有者別の最終ATK/会心/属性DMGを指定してください。Lv80/E0・未撃破の敵1体・状態一定、凛の追加回数0～33、精霊スキルLv1～6のみ対応です。'};
        }

        if(['141303','1141301','1141307'].includes(input.attack?.id)){
            const a=input.attack,c=input.character||{},e=input.enemy||{},l=a.traceLevel,q=input.modifierInputs?.['evernight-memoquanta'],ult=a.id==='141303',curve=ult?[100,110,120,130,140,150,162.5,175,187.5,200]:a.id==='1141307'?[96,115.2,134.4,153.6,172.8,192]:[25,30,35,40,45,50],expected=curve[l-1]+(a.id==='1141301'?Math.floor(q/4)*[5,6,7,8,9,10][l-1]:0);
            if(a.characterId!=='1413'||a.sourceSkillId!==a.id||a.damageFormula!=='statMultiplier'||a.scalingStat!=='hp'||a.element!=='Ice'||a.type!==(ult?'ultimate':'memospriteSkill')||a.hitCount!==1||c.id!=='11413'||c.level!==80||c.eidolon!==0||e.count!==1||e.toughnessActive!==true||!a.completedReferenceSnapshot||a.damageOwnerId!=='11413'||!Number.isInteger(l)||l<1||l>curve.length||a.multiplier!==expected||(a.scalingTerms&&(a.id!=='1141301'||a.scalingTerms.length!==2||a.scalingTerms.some(t=>t.stat!=='hp')||a.scalingTerms[0].multiplier!==curve[l-1]||a.scalingTerms[1].multiplier!==Math.floor(q/4)*[5,6,7,8,9,10][l-1]))||(!ult&&(!Number.isInteger(q)||q<0||q>16||a.id==='1141307'&&q!==16))||!['hp','critRate','critDamage','damageBonus'].every(k=>Number.isFinite(c.stats?.[k])&&(k==='hp'?c.stats[k]>0:c.stats[k]>=0))||(input.modifiers||[]).some(m=>m.enabled!==false&&m.applicable!==false&&(!['enemyAll','enemySingle'].includes(m.target?.owner)||m.category==='progressiveTakenDamage')))return {supported:false,reason:'長夜の独立した最終HP/会心/氷DMG、攻撃前の憶質0～16（終結技16）を指定してください。Lv80/E0・未撃破の敵1体・状態一定のみ対応です。'};
        }
        if(input.attack?.id==='1140702'||input.attack?.requiresIndependentCastorice){
            const a=input.attack,c=input.character||{},e=input.enemy||{},l=a.traceLevel,n=input.modifierInputs?.['castorice-breath-stage'],curve=[[12,14.4,16.8,19.2,21.6,24],[14,16.8,19.6,22.4,25.2,28],[17,20.4,23.8,27.2,30.6,34]];
            if(['1140706','1140712'].includes(a.id)){
                if(a.type!==(a.id==='1140706'?'memospriteTalent':'memospriteSkill'))return {supported:false,reason:'死竜の天賦とHP全消費版は固定版の攻撃種別を保持してください。'};
                const mods=(input.modifiers||[]).filter(m=>m.enabled!==false&&m.applicable!==false&&cyreneDeathragonMultiplier(m,a)),x=input.modifierInputs?.['cyrene-castorice-excess-newbud'],level=a.cyreneSupportLevel,active=a.cyreneLifeDeathActive===true;
                if((active||mods.length)&&(input.modifierInputs?.['cyrene-life-death-active']!==true||!active||!Number.isInteger(level)||level<1||level>6||!Number.isInteger(x)||x<0||x>100||mods.length!==1||Math.abs(mods[0].value-x*[.36,.43,.51,.57,.65,.72][level-1])>1e-8))return {supported:false,reason:'生と死は祝福有効・召喚時の敵2体以下の死竜と、消費した超過新蕾0～100%の整数値を指定してください。提供者MemSkill1～6を使用します。'};
            }

            if(a.characterId!=='1407'||c.id!=='11407'||c.level!==80||c.eidolon!==0||e.count!==1||e.toughnessActive!==true||!a.completedReferenceSnapshot||a.damageOwnerId!=='11407'||!Number.isInteger(l)||l<1||l>(a.id==='140709:dragon'?10:6)||!['hp','critRate','critDamage','damageBonus'].every(k=>Number.isFinite(c.stats?.[k])&&(k==='hp'?c.stats[k]>0:c.stats[k]>=0))||a.id==='1140702'&&(!Number.isInteger(n)||n<0||n>2||a.multiplier!==curve[n]?.[l-1]||a.hitCount!==1)||(input.modifiers||[]).some(m=>m.enabled!==false&&m.applicable!==false&&(!['enemyAll','enemySingle'].includes(m.target?.owner)&&!cyreneDeathragonMultiplier(m,a)||m.category==='progressiveTakenDamage')))return {supported:false,reason:'キャストリスの最終HPと死竜の独立した最終会心/量子DMGを指定してください。息吹は事前段階0～2、Lv80/E0・敵1体・精霊Lv1～6のみ対応です。'};
        }
        // A recorded healing amount is a base reference, not HP and not an already resolved damage value.
        if(input.attack?.damageFormula==='recordedHealing'){
            const a=input.attack,c=input.character||{},e=input.enemy||{},v=input.modifierInputs?.['hyacine-recorded-healing'],curve=[10,12,14,16,18,20];
            if(unsupportedAttackReason(a)||c.level!==80||c.eidolon!==0||e.count!==1||e.toughnessActive!==true||c.id!=='11409'||!a.completedReferenceSnapshot||a.damageOwnerId!=='11409'||a.hitCount!==1||!Number.isInteger(a.traceLevel)||a.traceLevel<1||a.traceLevel>6||a.multiplier!==curve[a.traceLevel-1]||!Number.isFinite(v)||v<0||v>1e12||!['critRate','critDamage','damageBonus'].every(k=>Number.isFinite(c.stats?.[k])&&c.stats[k]>=0)||(input.modifiers||[]).some(m=>m.enabled!==false&&m.applicable!==false&&!['enemyAll','enemySingle'].includes(m.target?.owner)))return {supported:false,reason:'イカルンの独立した最終会心/風DMGと攻撃直前の累計治癒量を入力してください。Lv80/E0・未撃破の敵1体・精霊スキルLv1～6のみ対応です。'};
            const result=calculate({...input,character:{...c,stats:{...c.stats,healingRecord:v}},attack:{...a,damageFormula:'statMultiplier'}});
            if(result.breakdown)Object.assign(result.breakdown,{damageFormula:'recordedHealing',referenceStat:'healingRecord',recordedHealing:v,remainingHealingRecord:v*.5});
            return result;
        }
        if(['1141501','1141526'].includes(input.attack?.id)){
            const a=input.attack,c=input.character||{},e=input.enemy||{},curve=[30,36,42,48,54,60];
            if(a.type!=='memospriteSkill'||a.characterId!=='1415'||a.sourceSkillId!==a.id||a.damageFormula!=='statMultiplier'||a.scalingStat!=='hp'||a.element!=='Ice'||c.id!=='11415'||c.level!==80||c.eidolon!==0||e.count!==1||e.toughnessActive!==true||!a.completedReferenceSnapshot||a.damageOwnerId!=='11415'||a.hitCount!==1||!Number.isInteger(a.traceLevel)||a.traceLevel<1||a.traceLevel>6||a.multiplier!==curve[a.traceLevel-1]||!['hp','critRate','critDamage','damageBonus'].every(k=>Number.isFinite(c.stats?.[k])&&(k==='hp'?c.stats[k]>0:c.stats[k]>=0))||(input.modifiers||[]).some(m=>m.enabled!==false&&m.applicable!==false&&!['enemyAll','enemySingle'].includes(m.target?.owner)))return {supported:false,reason:'デミウルゴスの独立した最終HP/会心/氷DMGを入力してください。Lv80/E0・未撃破の敵1体・精霊スキルLv1～6のみ対応です。'};
        }
        if(input.attack?.id === "1321012") return calculateDahliaNormalSnapshot(input);
        if (input.attack?.id === "1321044" || (input.attack?.id === "1321042" && input.attack.damageFormula === "dahliaSuperBreak")) return calculateDahliaSuperBreak(input);
        if (input.attack?.damageFormula === "nativeBreakSequence" && !unsupportedAttackReason(input.attack)) return calculateNativeBreakSequence(input);
        if (input.attack?.id === "131508" && input.attack.damageFormula === "normalAndBreak" && !unsupportedAttackReason(input.attack)) return calculateFanning(input);
        const character = input?.character || {};
        const enemy = input?.enemy || {};
        const attack = input?.attack || {};
        const unsupportedReason = unsupportedAttackReason(attack);
        if (unsupportedReason) return { supported: false, reason: unsupportedReason };
        if (attack.characterId === '1402') {
            if((input.modifiers||[]).some(m=>m.enabled!==false&&m.applicable!==false&&m.includedInFinalStats!==true&&(['statFlat','statPercent'].includes(m.category)&&m.stat==='speed'||m.category==='progressiveTakenDamage')))return {supported:false,reason:'アグライアの比較は速度由来ATKまで完成した最終値・段間状態一定で入力してください。'};
            if(attack.requiresIndependentLaftra && (!attack.completedReferenceSnapshot||attack.damageOwnerId!=='11402'||character.id!=='11402'||!['atk','critRate','critDamage','damageBonus'].every(k=>Number.isFinite(character.stats?.[k])&&(k==='atk'?character.stats[k]>0:character.stats[k]>=0))||(input.modifiers||[]).some(m=>m.enabled!==false&&m.applicable!==false&&!['enemyAll','enemySingle'].includes(m.target?.owner))))return {supported:false,reason:'ラフトラの独立した最終ATK/会心/雷与ダメージを入力し、本人の支援を再加算しないでください。'};
        }
        if (attack.id === "150402" && attack.enforceSnapshotContract && (input.modifiers || []).some(m=>m.category==="progressiveTakenDamage"&&m.enabled!==false&&m.applicable!==false&&modifierAppliesToAttack(m,attack))) return {supported:false,reason:"餌食の本体＋追加成分は状態一定の比較です。段間で更新する被ダメージ補正は扱いません。"};
        if (attack.id === "1014032" && (input.modifiers || []).some(m => m.category === "progressiveTakenDamage" && m.enabled !== false && m.applicable !== false && modifierAppliesToAttack(m, attack))) return {supported:false,reason:"この必殺合計は全11段で補正が一定の状態です。段間で更新する被ダメージ補正は合算できません。"};
        if (attack.id === "1206031" && attack.requiresValidHitCount && attack.hitCount > 1 && input.modifierInputs?.["sushang-sword-stance-stacks"] !== 10) return {supported:false,reason:"複数の追加剣勢は逐寇が事前10層で飽和した状態のみ計算対応です。"};
        if (attack.id === "122204" && (character.eidolon < 3 && attack.traceLevel > 10 || attack.traceLevel > 12)) return {supported:false,reason:"浮元は星魂0～2で天賦Lv1～10、星魂3以上でLv1～12に対応します。"};
        if (attack.enforceSnapshotContract && attack.id === "122204" && character.eidolon === 6 && !(input.modifiers || []).some(m => m.id === "eidolon:1222:6:fuyuan-all-res-down" && (m.includedInFinalStats || m.enabled !== false && m.applicable !== false && !(m.inputWarnings || []).length))) return {supported:false,reason:"浮元が攻撃する星魂6の本体には、在場中の耐性低下の適用または算入済み指定が必要です。"};
        if (["140809","140811"].includes(attack.id)) {
            const key=attack.id==="140809" ? "phainon-counter-flame-stacks" : "phainon-ruin-stacks", n=input.modifierInputs?.[key],level=attack.traceLevel;
            if(character.level!==80 || character.eidolon!==0 || enemy.count!==1 || !Number.isInteger(level) || level<1 || level>10 || !Number.isInteger(n) || n<1 || n>(attack.id==="140809"?99:4)) return {supported:false,reason:"ファイノンのこの構成はLv80/E0/敵1体/スキルLv1～10・明示した層数のみ対応です。"};
            if(attack.id==="140811" && n===4 && [7,8,9].includes(level)) return {supported:false,reason:"壊傷4層のLv7～9は固定版の段別係数と最大合計に差があるため計算対象外です。"};
            const expected=attack.id==="140809" ? (attack.phainonCounterBaseMultipliers?.[level-1]+4*attack.phainonCounterBounceMultipliers?.[level-1])*(1+.2*n) : attack.phainonRuinMultipliers?.[String(n)]?.[level-1];
            if(!Number.isFinite(expected) || Math.abs(attack.multiplier-expected)>1e-8) return {supported:false,reason:"指定層数に対応する攻撃倍率を確認できません。"};
        }
        if(attack.id==="150902" && attack.comparisonModifierInputs?.["gilgamesh-kings-recognition-active"] && !(input.modifiers||[]).some(m=>m.id==="trace:1509:150902:kings-recognition-defense-ignore" && (m.includedInFinalStats || m.enabled!==false && m.applicable!==false && !(m.inputWarnings||[]).length)))return {supported:false,reason:"このスキルは王が認めるの防御無視が攻撃前から有効な状態のみ対応します。"};
        if(attack.id==="140602" && attack.comparisonModifierInputs?.["cipher-skill-atk-active"] && !(input.modifiers||[]).some(m=>m.id==="trace:1406:140602:post-skill-atk" && (m.includedInFinalStats || m.enabled!==false && m.applicable!==false && !(m.inputWarnings||[]).length)))return {supported:false,reason:"このスキルはATK30%が攻撃前から有効な状態のみ対応します。"};
        if (attack.enforceSnapshotContract && attack.id === "121502") {
            for(const id of ["trace:1215:121504:party-damage","traceNode:1215:1215101:sp-recovery-atk"]){
                if(!(input.modifiers||[]).some(m=>m.id===id && (m.includedInFinalStats || m.enabled!==false && m.applicable!==false && !(m.inputWarnings||[]).length))) return {supported:false,reason:"このスキルは承負・懲悪・録事が事前成立した状態のみ計算対応です。"};
            }
        }
        if (attack.enforceSnapshotContract && ["132103","141002"].includes(attack.id)) {
            const required = attack.id === "132103" ? "trace:1321:132103:previous-ultimate-defense-down" : "trace:1410:141002:previous-skill-taken-damage";
            if (!(input.modifiers || []).some(m => m.id === required && (m.includedInFinalStats || m.enabled !== false && m.applicable !== false && !(m.inputWarnings || []).length))) return {supported:false,reason:"初回の付与順は未確認です。同じLvの固有デバフが攻撃前から成立した状態を指定してください。"};
        }
        if (attack.enforceSnapshotContract) {
            const fail=reason=>({supported:false,reason});
            const eidolonMatches = attack.requiredEidolon !== undefined ? Number.isInteger(character.eidolon) && character.eidolon >= attack.requiredEidolon && character.eidolon <= 6 : character.eidolon === 0;
            if(character.level!==attack.characterLevelExact || !eidolonMatches || enemy.count!==1 || !Number.isInteger(attack.traceLevel) || attack.traceLevel<1 || attack.traceLevel>attack.maximumTraceLevel) return fail("この独立検証済み範囲はLv80・" + (attack.requiredEidolon !== undefined ? "星魂" + attack.requiredEidolon + "以上" : "星魂0") + "・敵1体・登録済み軌跡Lvのみ対応です。");
            if(attack.requiredToughnessActive && enemy.toughnessActive!==true) return fail("この比較は未撃破で途中撃破しない敵を想定します。");
            if(attack.requiresBrokenTarget && enemy.toughnessActive!==false) return fail("この比較は攻撃前から撃破状態の敵を想定します。靭性状態を撃破済みにしてください。");
            if(attack.requiredWeaknessCount && enemy.weaknessCount!==attack.requiredWeaknessCount) return fail("攻撃前から7弱点・本質暴露が成立した比較のみ対応です。");
            for(const spec of attack.numericModifierInputs||[]){if(attack.id==='150308'&&spec.inputKey==='pearl-next-punchline'&&input.modifierInputs?.['pearl-next-proc-count']===0)continue;const values=input.modifierInputs||{},v=Object.hasOwn(values,spec.inputKey)?values[spec.inputKey]:spec.default;if(!Number.isFinite(v)||v<spec.minimum||v>spec.maximum||(spec.integer&&!Number.isInteger(v)))return fail(spec.label+"に"+spec.minimum+"～"+spec.maximum+"の"+(spec.integer?"整数":"数値")+"を入力してください。");}
            for(const id of attack.requiredModifierIds||[]){const mods=(input.modifiers||[]).filter(m=>m.id===id&&((m.enabled!==false&&m.applicable!==false)||(["150402","150403","1504031","1504032","1504033","150404"].includes(attack.id)&&m.includedInFinalStats===true)||(["1504032","1504033","150404"].includes(attack.id)&&m.id==="traceNode:1504:1504102:follow-up-stacks"&&m.value===0&&input.modifierInputs?.["fudie-gluttony-stacks"]===0))&&m.calculable!==false&&Number.isFinite(m.value)&&!(m.inputWarnings||[]).length&&modifierAppliesToAttack(m,attack));if(mods.length!==1)return fail("必要な補正が不足しています："+id);}
        }
        if (attack.rejectNormalOnlyModifiers && attack.damageFormula !== "componentSequence") { const reason = normalOnlyModifierReason(input.modifiers || []); if (reason) return { supported: false, reason }; }
        if (attack.damageFormula === "resolvedDamageMultiplier") return calculateSerinResolvedDoT(input);
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
        let nativeMultiplierAddition=0;
        if(attack.characterId==='1501'&&['150103','150108'].includes(attack.id)){
            if(attack.id==='150103'){
                if(attack.sparxieElationScaling!==true||attack.elationMultiplierScale!==0.6||!Number.isFinite(stats.elation)||stats.elation<0)return {supported:false,reason:'火花の必殺はATK係数と最終愉悦度の参照を確認してください。'};
                if(applied.some(m=>['statPercent','statFlat'].includes(m.category)&&m.stat==='atk'))return {supported:false,reason:'ATKからの愉悦再換算は、ATKと愉悦の両方を最終入力へ反映してください。'};
                nativeMultiplierAddition=0.6*effectiveStats.elation;
            }else{
                const n=attack.sparxieTrapCount,l=attack.sparxieSkillLevel;
                if(attack.sparxieTrapScaling!==true||!Number.isInteger(n)||n<1||n>20||!Number.isInteger(l)||l<1||l>10)return {supported:false,reason:'強化通常はトラップ回数1～20とスキルLv1～10を指定してください。'};
                if(applied.some(m=>m.category==='progressiveTakenDamage'))return {supported:false,reason:'この強化通常は途中で補正が変化しない想定です。'};
                nativeMultiplierAddition=n*[10,11,12,13,14,15,16.25,17.5,18.75,20][l-1];
            }
        }
        const multiplierAddition = nativeMultiplierAddition + applied.filter((item) => item.category === "multiplierAddition").reduce((sum, item) => sum + item.value, 0) * number(attack.multiplierAdditionScale, 1);
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
        const damageBonus = number(stats.damageBonuses?.[attack.element], number(stats.damageBonus)) + applied.filter((item) => item.category === "damageBonus" || (item.category === "dotDamage" && attack.type === "dot")).reduce((sum, item) => sum + item.value, 0);
        const takenDamage = number(enemy.takenDamage) + applied.filter((item) => item.category === "takenDamage").reduce((sum, item) => sum + item.value, 0);
        const defenseReduction = number(enemy.defenseReduction) + applied.filter((item) => item.category === "defenseReduction").reduce((sum, item) => sum + item.value, 0);
        const defenseIgnore = number(enemy.defenseIgnore) + applied.filter((item) => item.category === "defenseIgnore").reduce((sum, item) => sum + item.value, 0);
        const resistancePen = number(enemy.resistancePenetration) + applied.filter((item) => ["resistancePenetration", "resistanceReduction"].includes(item.category)).reduce((sum, item) => sum + item.value, 0);
        const baseDamage = (cappedEnemyHpDamage === null
            ? scalingTerms.reduce((sum, term) => sum + term.referenceValue * term.multiplierPercent / 100, 0)
            : cappedEnemyHpDamage * (number(attack.multiplier) + multiplierAddition) / 100) + flatDamage;
        const defense = defenseMultiplier(character.level, enemy.level, defenseReduction, defenseIgnore);
        const resistance = resistanceMultiplier(number(enemy.resistances?.[attack.element], number(enemy.resistance)) - resistancePen);
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
                ...(attack.id==='11415251'?{shieldSnapshot:input.modifierInputs['cyrene-earth-companion-shield'],shieldRatio:attack.shieldRatio}:{}),
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
        if(input.attack?.id==='1403033'){
            const a=input.attack,c=input.character||{},e=input.enemy||{},parts=input.sequenceComponents||[],n=a.cyreneBarrierActive?1:0,curve=[6,6.6,7.2,7.8,8.4,9,9.75,10.5,11.25,12];
            const fail=()=>({supported:false,reason:'結界中・トリビーLv80/E0・未撃破の敵1体・状態一定。門と道ONの2回比較は追撃前からA2=3層の飽和状態のみ対応です。'});
            if(c.id!=='1403'||c.level!==80||c.eidolon!==0||e.count!==1||e.toughnessActive!==true||input.modifierInputs?.['tribbie-zone-active']!==true||!Number.isInteger(a.traceLevel)||a.traceLevel<1||a.traceLevel>10||a.multiplier!==curve[a.traceLevel-1]||parts.length!==1+n||(n&&(input.modifierInputs?.['tribbie-followup-damage-stacks']!==3||input.modifierInputs?.['trace:1415:1141515:tribbie-defense-ignore-active']!==true)))return fail();
            for(let i=0;i<parts.length;i++){
                const q=parts[i]?.input,b=q?.attack||{},id=i?'11415151':'1403031';
                if(parts[i].key!==(i?'blessing':'barrier')||a.damageComponents?.[i]?.attackId!==id||b.id!==id||b.characterId!=='1403'||b.type!=='additional'||b.element!=='Quantum'||b.scalingStat!=='hp'||b.damageFormula!=='statMultiplier'||b.traceLevel!==a.traceLevel||b.multiplier!==curve[a.traceLevel-1]||b.hitCount!==1||JSON.stringify(q?.character)!==JSON.stringify(c)||JSON.stringify(q?.enemy)!==JSON.stringify(e)||JSON.stringify(q?.modifierInputs)!==JSON.stringify(input.modifierInputs))return fail();
            }
            return combineDamageComponents(a,parts,n?'結界基本1回＋門と道追加1回（追撃本体は別）':'結界基本1回（門と道は適用なし）');
        }

        if(['1410013','1410023'].includes(input.attack?.id)){
            const a=input.attack,c=input.character||{},e=input.enemy||{},parts=input.sequenceComponents||[],normal=a.id==='1410013',owners=a.dotOwnerIds||[],ids=['1005','1108','1111','1210'],own=normal?'1410012':'1410022',level=a.cyreneSupportLevel;
            const fail=()=>({supported:false,reason:'海洋の他所有者DoTは編成中のE0付与者ごとの補正済み非会心1回分が必要です。本人4種と別々に明示し、未付与は0を指定してください。'});
            if(c.id!=='1410'||c.level!==80||c.eidolon!==0||e.count!==1||e.toughnessActive!==true||!a.cyreneBlessingActive||input.modifierInputs?.['trace:1415:1141522:serin-damage-active']!==true||!Number.isInteger(level)||level<1||level>6||!owners.length||owners.length>2||new Set(owners).size!==owners.length||owners.some(id=>!ids.includes(id))||parts.length!==1+owners.length)return fail();
            for(let i=0;i<parts.length;i++){
                const q=parts[i]?.input,b=q?.attack||{},owner=owners[i-1],id=i?'11415220'+(ids.indexOf(owner)+1+(normal?0:4)):own;
                if(b.id!==id||parts[i].key!==(i?'foreign-'+owner:'serin')||!a.damageComponents?.some(d=>d.attackId===id&&d.key===parts[i].key)||b.cyreneSupportLevel!==level||b.cyreneBlessingActive!==true||JSON.stringify(q?.character)!==JSON.stringify(c)||JSON.stringify(q?.enemy)!==JSON.stringify(e)||JSON.stringify(q?.modifierInputs)!==JSON.stringify(input.modifierInputs))return fail();
                if(i?(b.dataOwnerId!==owner||b.dotOwnerPresent!==true):(b.traceLevel!==a.traceLevel||b.multiplier!==a.multiplier))return fail();
            }
            return combineDamageComponents(a,parts,'本人直撃・本人4種DoT＋編成中の指定所有者DoT（各1回、領域追加発生は別）');
        }

        if(['1410012','1410022'].includes(input.attack?.id)){
            const a=input.attack,c=input.character||{},e=input.enemy||{},parts=input.sequenceComponents||[],normal=a.id==='1410012',first=normal?'141001':'141002',level=a.cyreneSupportLevel,offset=normal?1:5;
            const fail=()=>({supported:false,reason:'事前成立した海洋祝福・キュレネ精霊スキルLv1～6と、本人4種DoTの補正済み1回分を指定してください。他所有者/新規付与・領域発生回数はこの合計に含みません。'});
            if(c.id!=='1410'||c.level!==80||c.eidolon!==0||e.count!==1||e.toughnessActive!==true||a.cyreneBlessingActive!==true||!Number.isInteger(level)||level<1||level>6||input.modifierInputs?.['trace:1415:1141522:serin-damage-active']!==true||parts.length!==5||a.damageComponents?.length!==5)return fail();
            for(let i=0;i<5;i++){
                const q=parts[i]?.input,b=q?.attack||{},id=i?'1141522'+(offset+i-1):first;
                if(b.id!==id||a.damageComponents[i].attackId!==id||parts[i].key!==(i?'ocean-'+i:'direct')||JSON.stringify(q?.character)!==JSON.stringify(c)||JSON.stringify(q?.enemy)!==JSON.stringify(e)||JSON.stringify(q?.modifierInputs)!==JSON.stringify(input.modifierInputs))return fail();
                if(i?(b.traceLevel!==level||b.cyreneBlessingActive!==true):(b.traceLevel!==a.traceLevel||b.multiplier!==a.multiplier||b.sourceSkillId!==first||b.type!==(normal?'normal':'skill')||b.element!=='Physical'||b.damageFormula!=='statMultiplier'||b.scalingStat!=='atk'||b.hitCount!==1))return fail();
            }
            return combineDamageComponents(a,parts,'本人直撃＋海洋の本人4種DoT起爆（他所有者・領域の追加発生は未合算）');
        }

        if(input.attack?.id==='150308'){
            const a=input.attack,c=input.character||{},e=input.enemy||{},p=input.sequenceComponents||[],n=input.modifierInputs?.['pearl-next-proc-count'],l=a.traceLevel,normal=[50,60,70,80,90,100];
            const fail=()=>({supported:false,reason:'星月の幻造の本人DEF・本人CB・底本の氷愉悦と、事前の次回付加0/1を指定してください。パール＋爻光のLv80/E0・未撃破の敵1体・状態一定のみ対応です。'});
            if(c.id!=='1503'||c.level!==80||c.eidolon!==0||e.count!==1||e.toughnessActive!==true||!a.pearlPairActive||a.learnedOwnerId!=='1502'||![0,1].includes(n)||p.length!==3+n||!Number.isInteger(l)||l<1||l>6||a.multiplier!==normal[l-1]||(input.modifiers||[]).some(m=>m.enabled!==false&&m.applicable!==false&&(['statPercent','statFlat'].includes(m.category)&&m.stat==='def'||m.category==='progressiveTakenDamage')))return fail();
            for(let i=0;i<p.length;i++){
                const q=p[i]?.input,b=q?.attack||{},id=['1503080','1503081','1503031','150320'][i];
                if(p[i].key!==['direct','own','learned','next'][i]||b.id!==id||a.damageComponents?.[i]?.attackId!==id||b.traceLevel!==(i===2?a.pearlUltimateLevel:i===3?a.pearlElationLevel:l)||JSON.stringify(q.modifierInputs)!==JSON.stringify(input.modifierInputs)||['count','level','resistance','defenseReduction','takenDamage','toughnessActive'].some(k=>q.enemy?.[k]!==e[k]))return fail();
                if(i!==2&&(JSON.stringify(q.character)!==JSON.stringify(c)||JSON.stringify(q.enemy)!==JSON.stringify(e)))return fail();
                if(i===0&&(b.damageFormula!=='statMultiplier'||b.scalingStat!=='def'||b.type!=='enhancedNormal'||b.characterId!=='1503'||b.sourceSkillId!=='150308'||b.multiplier!==normal[l-1]||b.hitCount!==1||b.scalingTerms?.length))return fail();
                if((i>1&&q.elation?.punchline!==input.modifierInputs?.[i===2?'pearl-learned-punchline':'pearl-next-punchline'])||(i===1&&q.elation?.certifiedBanger!==input.modifierInputs?.['elation-certified-banger']))return fail();
            }
            return combineDamageComponents(a,p,'本人DEF＋本人CB＋底本の氷愉悦'+(n?'＋本人の次回攻撃付加':''));
        }

        if(input.attack?.id==='1414039'){
            const a=input.attack,c=input.character||{},e=input.enemy||{},parts=input.sequenceComponents||[],l=a.traceLevel,curve=[40,44,48,52,56,60,65,70,75,80],ids=['1414031','1414032','14141031'];
            const fail=()=>({supported:false,reason:'強化龍霊の物理・本人同袍付加・昇格6付加の3成分と、有効な最終値を指定してください。ATK支援は画面の最終ATKへ一度含めて反映済みを指定してください。必殺技本体は合算しません。'});
            if((input.modifiers||[]).some(m=>m.enabled!==false&&m.applicable!==false&&['statPercent','statFlat'].includes(m.category)&&m.stat==='atk')||c.id!=='1414'||c.level!==80||c.eidolon!==0||e.count!==1||e.toughnessActive!==true||a.characterId!=='1414'||a.bondmateCharacterIdExact!=='1414'||parts.length!==3||!Number.isInteger(l)||l<1||l>10||a.multiplier!==2*curve[l-1]+40)return fail();
            for(let i=0;i<3;i++){
                const p=parts[i],q=p?.input||{},b=q.attack||{};
                if(p.key!==['dragon','bondmate','a6'][i]||b.id!==ids[i]||a.damageComponents?.[i]?.attackId!==ids[i]||b.multiplier!==(i===2?40:curve[l-1])||b.traceLevel!==(i===2?1:l)||b.effectiveProfile!==(i?'additional':'dragon')||q.character?.stats?.atk!==c.stats?.atk||['count','level','resistance','defenseReduction','takenDamage','toughnessActive'].some(k=>q.enemy?.[k]!==e[k])||JSON.stringify(q.modifierInputs)!==JSON.stringify(input.modifierInputs))return fail();
            }
            if(JSON.stringify(parts[1].input.character)!==JSON.stringify(parts[2].input.character)||JSON.stringify(parts[1].input.enemy)!==JSON.stringify(parts[2].input.enemy))return fail();
            return combineDamageComponents(a,parts,'強化龍霊1行動（物理＋本人同袍付加＋昇格6付加）');
        }

        if(['800708','800808','150805'].includes(input.attack?.id)){
            const a=input.attack,c=input.character||{},e=input.enemy||{},parts=input.sequenceComponents||[],l=a.traceLevel,rin=a.id==='150805',owner=rin?'1508':a.id.slice(0,4),partner=rin?'1015':'18007',curve=rin?[150,165,180,195,210,225,243.75,262.5,281.25,300]:[60,72,84,96,108,120];
            const fail=()=>({supported:false,reason:'成立済み連携1回の2所有者の最終値を指定してください。Lv80/E0・未撃破の敵1体・全段で状態一定のみ対応です。'});
            if(c.id!==owner||c.level!==80||c.eidolon!==0||e.count!==1||e.toughnessActive!==true||parts.length!==2||!Number.isInteger(l)||l<1||l>curve.length)return fail();
            for(let i=0;i<2;i++){
                const q=parts[i]?.input,b=q?.attack||{},cc=q?.character||{};
                if(parts[i].key!==['caster','partner'][i]||b.id!==a.damageComponents?.[i]?.attackId||b.sourceSkillId!==a.id||b.characterId!==owner||b.damageFormula!=='statMultiplier'||b.type!==(rin?'followUp':'enhancedNormal')||b.element!==(rin?'Quantum':'Ice')||b.scalingStat!=='atk'||b.hitCount!==1||b.scalingTerms||b.multiplier!==curve[l-1]||b.traceLevel!==l||cc.id!==(i?partner:owner)||cc.level!==80||cc.eidolon!==0||!['atk','critRate','critDamage','damageBonus'].every(k=>Number.isFinite(cc.stats?.[k])&&(k==='atk'?cc.stats[k]>0:cc.stats[k]>=0))||i&&(!b.completedReferenceSnapshot||b.damageOwnerId!==partner||!['defenseIgnore','resistancePenetration'].every(k=>Number.isFinite(q.enemy?.[k])))||!i&&(JSON.stringify(cc)!==JSON.stringify(c)||JSON.stringify(q.enemy)!==JSON.stringify(e))||['count','level','resistance','defenseReduction','takenDamage','toughnessActive'].some(k=>q.enemy?.[k]!==e[k])||JSON.stringify(q.modifierInputs)!==JSON.stringify(input.modifierInputs)||(q.modifiers||[]).some(m=>m.enabled!==false&&m.applicable!==false&&(m.category==='progressiveTakenDamage'||i&&!['enemyAll','enemySingle'].includes(m.target?.owner))))return fail();
            }
            return combineDamageComponents(a,parts,'成立済み連携1回（所有者別の最終ATK/会心/属性DMG）');
        }

        if(input.attack?.id==='140709'){
            const a=input.attack,c=input.character||{},e=input.enemy||{},parts=input.sequenceComponents||[],l=a.traceLevel,curves=[[15,16.5,18,19.5,21,22.5,24.37,26.25,28.12,30],[25,27.5,30,32.5,35,37.5,40.62,43.75,46.88,50]];
            if(c.level!==80||c.eidolon!==0||e.count!==1||e.toughnessActive!==true||parts.length!==2||!Number.isInteger(l)||l<1||l>10)return {supported:false,reason:'キャストリスの連携はLv80/E0・未撃破の敵1体・Skill Lv1～10・事前飽和天賦で状態一定のみ対応です。'};
            for(let i=0;i<2;i++){const q=parts[i]?.input,b=q?.attack||{};if(parts[i].key!==['caster','dragon'][i]||b.id!==['140709:caster','140709:dragon'][i]||b.characterId!=='1407'||b.sourceSkillId!=='140709'||b.type!=='enhancedSkill'||b.damageFormula!=='statMultiplier'||b.scalingStat!=='hp'||b.element!=='Quantum'||b.hitCount!==1||b.traceLevel!==l||b.multiplier!==curves[i][l-1]||JSON.stringify(q.modifierInputs)!==JSON.stringify(input.modifierInputs)||(!i&&(JSON.stringify(q.character)!==JSON.stringify(c)||JSON.stringify(q.enemy)!==JSON.stringify(e)))||(i&&(q.character?.id!=='11407'||!b.completedReferenceSnapshot||b.damageOwnerId!=='11407'||q.character.stats?.hp!==c.stats?.hp||['level','count','resistance','defenseReduction','takenDamage','toughnessActive'].some(k=>q.enemy?.[k]!==e[k]))))return {supported:false,reason:'連携の本人HP・所有者別の最終値・Skill Lv・同じ敵条件を確認してください。'};}
            return combineDamageComponents(a,parts,'本人＋死竜の連携スキル（HP参照は本人、会心/DMGは別所有者）');
        }

        if(input.attack?.id==='11407022'){
            const a=input.attack,c=input.character||{},e=input.enemy||{},parts=input.sequenceComponents||[],h=input.modifierInputs?.['castorice-dragon-hp-percent'];
            if(c.id!=='11407'||c.level!==80||c.eidolon!==0||e.count!==1||e.toughnessActive!==true||!Number.isFinite(h)||h<=0||h>100||parts.length!==2||!Number.isInteger(a.traceLevel)||a.traceLevel<1||a.traceLevel>6)return {supported:false,reason:'息吹の合計は死竜の攻撃前HP割合0%超～100%・敵1体を指定してください。HP25%以下だけ同時に発生する退場天賦6段を合算します。'};
            for(let i=0;i<2;i++){const q=parts[i]?.input,b=q?.attack||{};if(parts[i].key!==['breath','exit'][i]||b.id!==['1140702','1140706'][i]||a.damageComponents?.[i]?.attackId!==b.id||!b.requiresIndependentCastorice||b.type!==(i?'memospriteTalent':'memospriteSkill')||b.scalingStat!=='hp'||b.damageFormula!=='statMultiplier'||b.sourceSkillId!==b.id||b.hitCount!==(i?6:1)||!Number.isInteger(b.traceLevel)||b.traceLevel<1||b.traceLevel>6||(!i&&b.traceLevel!==a.traceLevel)||(i&&b.multiplier!==[20,24,28,32,36,40][b.traceLevel-1])||JSON.stringify(q.character)!==JSON.stringify(c)||JSON.stringify(q.enemy)!==JSON.stringify(e)||JSON.stringify(q.modifierInputs)!==JSON.stringify(input.modifierInputs))return {supported:false,reason:'死竜の息吹と同時発生する天賦の所有者・独立Lv・敵・事前状態が一致しません。'};}
            return combineDamageComponents(a,h<=25?parts:[parts[0]],h<=25?'息吹1回＋同時発生する退場天賦6段':'息吹1回（攻撃前HP25%超・退場天賦なし）');
        }

        if(input.attack?.id==='11415012'){
            const a=input.attack,c=input.character||{},e=input.enemy||{},parts=input.sequenceComponents||[],n=input.modifierInputs?.['cyrene-recollection-allies'];
            if(c.id!=='11415'||c.level!==80||c.eidolon!==0||e.count!==1||e.toughnessActive!==true||!Number.isInteger(n)||n<0||n>3||parts.length!==2||a.damageComponents?.length!==2||!Number.isInteger(a.traceLevel)||a.traceLevel<1||a.traceLevel>6)return {supported:false,reason:'精霊の舞曲合計はLv80/E0・敵1体・他精霊なし・追憶を得た異なる味方0～3名の明示が必要です。'};
            for(let i=0;i<2;i++){const q=parts[i]?.input,b=q?.attack||{};if(parts[i].key!==['body','recollection'][i]||b.id!==['1141501','1141526'][i]||a.damageComponents[i].attackId!==b.id||b.traceLevel!==a.traceLevel||JSON.stringify(q.character)!==JSON.stringify(c)||JSON.stringify(q.enemy)!==JSON.stringify(e)||JSON.stringify(q.modifierInputs)!==JSON.stringify(input.modifierInputs))return {supported:false,reason:'舞曲の精霊所有者・Lv・敵・追憶条件が一致しません。'};}
            return combineDamageComponents(a,[parts[0],...Array.from({length:n},(_,i)=>({...parts[1],key:'recollection'+(i+1)}))],'精霊の全体1回＋指定した追憶提供者数の追加ヒット');
        }
        if (["1402012","140208"].includes(input.attack?.id)) return calculateAglaeaSnapshot(input);
        if (input.attack?.id === "150403") return calculateFudieUltimateSnapshot(input);
        if (input.attack?.id === "150905") return calculateGilgameshJoint(input);
        if (bangerActionSequences[input.attack?.id]) return calculateBangerActionSnapshot(input);
        if (kafkaSequences[input.attack?.id]) return calculateKafkaSnapshot(input);
        if (input.attack?.id === "1210032") return calculateGuinaifenSnapshot(input);
        if(input.attack?.id === "1321043") return calculateDahliaSnapshot(input);
        if(input.attack?.id === "1410032") return calculateSerinSnapshot(input);
        if(input.attack?.id === "140603") return calculateCipherSnapshot(input);
        if (input.attack?.id === "130803") return calculateAcheronSnapshot(input);
        if (input.attack?.id === "140109") return calculateHertaSnapshot(input);
        if (input.attack?.id === "1206022") return calculateSushangSnapshot(input);
        if (input.attack?.id === "1222062") return calculateLingshaSnapshot(input);
        if (["1405011","1405021","1405013","1405024"].includes(input.attack?.id)) return calculateAnaxaSequence(input);
        if (input.attack?.id === "1111083") return calculateRealizedLuka(input);
        if (input.attack?.id === "1223031") return calculateMozeUltimate(input);
        if (["1224011","1224081"].includes(input.attack?.id)) return calculateMarchSequence(input);
        const attack = input.attack || {};
        const character = input.character || {};
        const enemy = input.enemy || {};
        const components = input.sequenceComponents || [];
        const yukong = attack.id === "1207011";
        const moze = attack.id === "1223021";
        const elemental = elementalSequences[attack.id];
        const welt = weltSequences[attack.id];
        const snapshot = elemental || (welt && {owner:"1004",stateKey:welt.stateKey || "welt-weightless-active",type:welt.type});
        const element = welt ? "Imaginary" : elemental?.element || (yukong ? "Imaginary" : moze ? "Thunder" : "Wind");
        const expected = welt ? welt.parts : elemental ? [{key:"body",id:elemental.body,type:elemental.type},{key:"additional",id:elemental.talent,type:elemental.talentType}] : yukong ? [{ key:"basic", id:"120701", type:"normal" }, { key:"talent", id:"120704", type:"additional" }] : moze ? [{key:"skill",id:"122302",type:"skill"},{key:"additional",id:"122304",type:"additional"}] : [
            { key: "skill", id: "122002", type: "skill" },
            { key: "followUp", id: "122004", type: "followUp" }
        ];
        const fail = reason => ({ supported: false, reason });
        if ((!snapshot && !yukong && !moze && attack.id !== "122002") || attack.damageFormula !== "componentSequence") return fail("この複合攻撃は未対応です。");
        if (character.level !== 80 || character.eidolon !== 0 || enemy.count !== 1 || enemy.weakness !== false || enemy.toughnessActive !== true) {
            return fail(snapshot ? "本体＋付加合計はLv80・星魂0・敵1体・非弱点・靭性ありの事前状態のみ計算対応です。" : yukong ? "通常＋徹札矢はLv80・星魂0・虚数弱点なし・敵1体・靭性ありのみ計算対応です。" : moze ? "モゼの初回スキル＋付加はLv80・星魂0・雷弱点なし・敵1体・靭性ありのみ計算対応です。" : "飛霄のスキル＋追加攻撃はLv80・星魂0・風弱点なし・敵1体・靭性ありのみ計算対応です。");
        }
        if (snapshot && (attack.characterId !== snapshot.owner || input.modifierInputs?.[snapshot.stateKey] !== true)) return fail("この合計に必要な敵の事前状態（燃焼・感電・減速・無重力）を指定してください。");
        if(welt?.variant === "previous" && character.id !== "1004")return fail("原版ヴェルト本人の最終ステータスを使用してください。");
        if (welt && !welt.variant && input.modifierInputs?.["welt-weightless-damage-stacks"] !== 10) return fail("この強化版合計は攻撃前から懲戒10層が有効な状態のみ計算対応です。");
        if (!(Number.isFinite(character.stats?.atk) && character.stats.atk > 0)
            || !Number.isFinite(character.stats?.critRate) || !Number.isFinite(character.stats?.critDamage)
            || !Number.isFinite(character.stats?.damageBonus)) {
            return fail("攻撃者の最終攻撃力・会心率・会心ダメージ・与ダメージ補正をすべて入力してください。");
        }
        if (!Number.isInteger(attack.traceLevel) || attack.traceLevel < 1 || attack.traceLevel > (yukong || snapshot?.type === "normal" ? 6 : 10)) return fail(yukong ? "通常Lv1～6を指定してください。" : "スキルLv1～10を指定してください。");
        if (components.length !== expected.length) return fail("本体と追加成分の両方が必要です。");
        for (let index = 0; index < expected.length; index++) {
            const spec = expected[index];
            const component = components[index];
            const childInput = component?.input || {};
            const childAttack = childInput.attack || {};
            if (component?.key !== spec.key || component?.name !== attack.damageComponents?.[index]?.name
                || attack.damageComponents?.[index]?.key !== spec.key || attack.damageComponents?.[index]?.attackId !== spec.id
                || childAttack.id !== spec.id || childAttack.type !== spec.type || childAttack.attackType !== spec.type
                || childAttack.sourceSkillId !== (spec.source || spec.id) || !Number.isInteger(childAttack.traceLevel) || childAttack.traceLevel < 1 || childAttack.traceLevel > (spec.type === "normal" ? 6 : 10)
                || (["skill", "basic", "body", "judgment"].includes(spec.key) && childAttack.traceLevel !== attack.traceLevel)
                || childAttack.damageFormula !== "statMultiplier" || childAttack.element !== element
                || childAttack.scalingStat !== "atk" || childAttack.target !== "single" || childAttack.hitCount !== (spec.hits || 1)
                || childAttack.canCrit === false || !Number.isFinite(childAttack.multiplier) || childAttack.multiplier <= 0) {
                return fail("本体または追加成分のデータが、対応している構成と一致しません。");
            }
            if (snapshot && (childInput.modifierInputs?.[snapshot.stateKey] !== true
                || (welt && !welt.variant && childInput.modifierInputs?.["welt-weightless-damage-stacks"] !== 10)
                || (childInput.modifiers || []).some(m => m.enabled !== false && m.applicable !== false && m.category === "progressiveTakenDamage"))) return fail("各成分で同じ事前状態を指定してください。段間で増加する補正はこの合計では扱いません。");
            if (welt && !welt.variant && [["trace:1004:1100404:weightless-defense-down",40],["traceNode:1004:11004101:weightless-party-damage",100]].some(([id,value]) => {
                const rows = (childInput.modifiers || []).filter(m => m.id === id && m.enabled === true && m.applicable === true);
                return rows.length !== 1 || rows[0].value !== value;
            })) return fail("各成分に事前無重力の防御低下40%と懲戒10層100%を1回ずつ反映してください。");
            if(welt?.variant === "previous" && welt.type === "ultimate") {
                const rows=(childInput.modifiers||[]).filter(m=>m.id==="traceNode:1004:1004101:damage-taken");
                if(rows.length!==1 || rows[0].value!==12 || !(rows[0].enabled===true&&rows[0].applicable===true || rows[0].includedInFinalStats===true&&enemy.takenDamage>=12))return fail("原版必殺の各成分へA2懲戒12%を1回適用するか、敵入力への算入済みを指定してください。");
            }
            if (JSON.stringify(childInput.character) !== JSON.stringify(character)
                || JSON.stringify(childInput.enemy) !== JSON.stringify(enemy)) {
                return fail("複合攻撃の各成分は同じ攻撃時点のステータス・敵条件で計算してください。");
            }
        }
        if (yukong && !components[1].input.attack.tags?.includes("normal")) return fail("徹札矢の通常攻撃タグを確認できません。構成データを再読み込みしてください。");
        const followUpModifiers = Array.isArray(components[1].input.modifiers) ? components[1].input.modifiers : [];
        const nativeFollowUpBonus = followUpModifiers.filter(item => item.id === "trace:1220:122004:followup-damage");
        if (!snapshot && !yukong && !moze && (nativeFollowUpBonus.length !== 1 || nativeFollowUpBonus[0].enabled !== true || nativeFollowUpBonus[0].applicable !== true
            || !Number.isFinite(nativeFollowUpBonus[0].value))) {
            return fail("天賦追加攻撃に必須の発動時与ダメージ補正を、補正条件から1件だけ有効にしてください。");
        }
        return combineDamageComponents(attack, components, welt ? (welt.variant === "previous" ? "原版本体＋天賦付加の合計（事前減速）" : "本体＋審判/天賦付加の合計（事前無重力・懲戒10層）") : elemental ? "本体＋事前DoT状態への天賦付加1回の合計" : yukong ? "通常本体＋徹札矢の合計" : moze ? "スキル本体＋天賦付加の合計" : "スキル本体＋追加攻撃の合計");
    }

    // The joint action has two owners; both use completed, explicitly separate stat snapshots.
    function calculateAglaeaSnapshot(input) {
        const a=input.attack||{},c=input.character||{},e=input.enemy||{},parts=input.sequenceComponents||[],joint=a.id==='140208',level=a.traceLevel,fail=reason=>({supported:false,reason});
        if(a.characterId!=='1402'||a.element!=='Thunder'||a.preexistingSilkStitch!==true||c.level!==80||c.eidolon!==0||e.count!==1||e.toughnessActive!==true||!Number.isInteger(level)||level<1||level>6||parts.length!==(joint?3:2))return fail('この合計はLv80/E0・未撃破の敵1体・事前の隙を縫う糸・本人/精霊の状態一定のみ対応です。');
        const specs=joint?[['aglaea','140208:aglaea','enhancedNormal'],['laftra','140208:laftra','enhancedNormal'],['silkTalent','140204','additional']]:[['aglaea','140201','normal'],['silkTalent','140204','additional']];
        for(let i=0;i<parts.length;i++){
            const q=parts[i]?.input||{},b=q.attack||{},talent=specs[i][0]==='silkTalent',memo=specs[i][0]==='laftra',curve=talent?[12,13.8,15.6,17.4,19.2,21,23.25,25.5,27.75,30]:joint?[100,120,140,160,180,200]:[50,60,70,80,90,100];
            if(parts[i].key!==specs[i][0]||b.id!==specs[i][1]||b.characterId!=='1402'||b.sourceSkillId!==(talent?'140204':joint?'140208':'140201')||b.type!==specs[i][2]||b.element!=='Thunder'||b.damageFormula!=='statMultiplier'||b.hitCount!==1||!Number.isInteger(b.traceLevel)||b.traceLevel<1||b.traceLevel>curve.length||(!talent&&b.traceLevel!==level)||b.multiplier!==curve[b.traceLevel-1]||JSON.stringify(q.modifierInputs)!==JSON.stringify(input.modifierInputs))return fail('アグライア/ラフトラ/天賦の所有者別成分と独立Lvを確認してください。');
            if(!memo&&(JSON.stringify(q.character)!==JSON.stringify(c)||JSON.stringify(q.enemy)!==JSON.stringify(e)))return fail('本人と天賦はアグライアの同じ最終値を参照してください。');
            if(memo&&(!b.requiresIndependentLaftra||!b.completedReferenceSnapshot||b.damageOwnerId!=='11402'||q.character?.id!=='11402'||q.character.level!==80||q.character.eidolon!==0||['level','count','resistance','defenseReduction','takenDamage','toughnessActive'].some(k=>q.enemy?.[k]!==e[k])))return fail('ラフトラの完成済み最終値と同じ敵条件を指定してください。');
        }
        return combineDamageComponents(a,parts,joint?'本人＋ラフトラ＋事前の糸の天賦1回':'本人通常＋事前の糸の天賦1回');
    }

    function calculateFudieUltimateSnapshot(input) {
        const a=input.attack||{},c=input.character||{},e=input.enemy||{},values=input.modifierInputs||{},n=values['fudie-gluttony-stacks'],u=a.traceLevel,parts=input.sequenceComponents||[],fail=reason=>({supported:false,reason});
        const ult=[200,220,240,260,280,300,325,350,375,400],fua=[100,110,120,130,140,150,162.5,175,187.5,200];
        if(c.level!==80||c.eidolon!==0||e.count!==1||e.toughnessActive!==true||!Number.isInteger(u)||u<1||u>10||a.multiplier!==ult[u-1]||!Number.isInteger(n)||n<2||n>12||parts.length!==2+Math.floor(n/4))return fail('不死途の必殺合計はLv80/E0・未撃破の敵1体・暴食2～12層・全成分で敵が生存する想定です。');
        if(['fudie-a4-base-in-final','fudie-a4-stack-in-final','fudie-a6-follow-up-crit-damage-in-final'].some(k=>values[k]===true))return fail('この合計では追加攻撃限定DMG/CDを共有の最終入力から外し、補正条件で成分別に加算してください。一般CDと餌食DEFの算入済みは使用できます。');
        for(let i=0;i<parts.length;i++){
            const p=parts[i],q=p?.input||{},b=q.attack||{},effective=n-4*Math.max(0,i-1),expectedInputs=i?{...values,'fudie-gluttony-stacks':effective}:values;
            if(p.key!==['direct','freeTalent','gluttonyBite1','gluttonyBite2','gluttonyBite3'][i]||b.id!==['1504031','1504032','1504033','1504033','1504033'][i]||b.characterId!=='1504'||b.sourceSkillId!==(i===1?'150404':'150403')||b.type!==(i?'followUp':'ultimate')||b.element!=='Thunder'||b.damageFormula!=='statMultiplier'||b.hitCount!==1||!Number.isInteger(b.traceLevel)||b.traceLevel<1||b.traceLevel>10||(i!==1&&b.traceLevel!==u)||b.multiplier!==(i?fua:ult)[b.traceLevel-1]||JSON.stringify(q.character)!==JSON.stringify(c)||JSON.stringify(q.enemy)!==JSON.stringify(e)||JSON.stringify(q.modifierInputs)!==JSON.stringify(expectedInputs)||(i&&b.fudieEffectiveStacks!==effective))return fail('必殺/天賦の独立Lvと、消費前後の暴食層に対応する本人の登録成分を指定してください。');
            const mods=q.modifiers||[];
            for(const [id,value]of [['traceNode:1504:1504103:crit-damage:self',40],...(i?[['traceNode:1504:1504102:follow-up-base',80],['traceNode:1504:1504102:follow-up-stacks',10*effective],['traceNode:1504:1504103:follow-up-crit-damage:self',80]]:[])]){const found=mods.filter(m=>m.id===id&&m.calculable!==false&&!(m.inputWarnings||[]).length&&((m.enabled!==false&&m.applicable!==false)||m.includedInFinalStats===true||(id==='traceNode:1504:1504102:follow-up-stacks'&&effective===0&&m.value===0)));if(found.length!==1||found[0].value!==value)return fail('各成分の暴食層と追加攻撃限定補正を1回ずつ適用してください。');}
            if(mods.some(m=>m.category==='progressiveTakenDamage'&&m.enabled!==false&&m.applicable!==false&&modifierAppliesToAttack(m,b)))return fail('この合計は暴食消費以外の段間補正更新を扱いません。');
        }
        return combineDamageComponents(a,parts,'必殺直撃＋無料強化天賦＋暴食消費追加攻撃（撃破なし）');
    }

    function calculateGilgameshJoint(input) {
        const a=input.attack||{},parts=input.sequenceComponents||[],c=input.character||{},e=input.enemy||{},fail=reason=>({supported:false,reason}),level=a.traceLevel;
        const thunder=[200,220,240,260,280,300,325,350,375,400],wind=[300,330,360,390,420,450,487.5,525,562.5,600];
        if(c.level!==80||c.eidolon!==0||e.count!==1||parts.length!==2||!Number.isInteger(level)||level<1||level>10||a.multiplier!==thunder[level-1])return fail("連携合計はLv80/E0・敵1体・天賦Lv1～10の成立済み1回です。");
        for(let i=0;i<2;i++){
            const p=parts[i],q=p?.input||{},b=q.attack||{},roles=b.referenceRoles;
            if(p?.key!==["lightning","wind"][i]||b.id!==["1509051","supplemental:trace:1509:150905:saber-wind-followup"][i]||b.sourceSkillId!=="150905"||b.characterId!==["1509","1014"][i]||b.type!=="followUp"||b.element!==["Thunder","Wind"][i]||b.hitCount!==1||b.traceLevel!==level||b.multiplier!==(i?wind:thunder)[level-1]||JSON.stringify(q.modifierInputs)!==JSON.stringify(input.modifierInputs))return fail("雷はギルガメッシュ、風はセイバーの登録済み連携成分を指定してください。");
            if(i===0 && (JSON.stringify(q.character)!==JSON.stringify(c)||JSON.stringify(q.enemy)!==JSON.stringify(e)))return fail("雷成分は本人の戦闘値と敵状態を参照してください。");
            if(i===1 && (b.referenceIssue||!b.completedReferenceSnapshot||roles?.damageOwnerId!=="1014"||roles?.statReferenceId!=="1014"||roles?.sourceCharacterId!=="1509"||roles?.traceOwnerId!=="1509"||q.character?.level!==80||q.character?.eidolon!==0||["count","level","defenseReduction","takenDamage","toughnessActive"].some(k=>q.enemy?.[k]!==e[k])))return fail("編成内セイバーの独立した完成済み戦闘値と同じ敵の風耐性を指定してください。");
            if((q.modifiers||[]).some(m=>m.enabled!==false&&m.applicable!==false&&modifierAppliesToAttack(m,b)&&(m.category==="progressiveTakenDamage"||i===1&&!['enemySingle','enemyAll'].includes(m.target?.owner))))return fail("連携の途中更新や、完成済みセイバー値への本人支援の再加算は扱いません。");
        }
        const result=combineDamageComponents(a,parts,"本人雷＋セイバー風の同一連携合計（所有者別の完成値）");
        if(result.breakdown)result.breakdown.condition="同じ敵の雷/風耐性を分離し、各所有者の独立した戦闘値と補正を参照";
        return result;
    }

    function calculateBangerActionSnapshot(input) {
        const a=input.attack||{},c=input.character||{},e=input.enemy||{},parts=input.sequenceComponents||[],spec=bangerActionSequences[a.id],values=input.modifierInputs||{};
        const fail=reason=>({supported:false,reason});
        if(c.level!==80 || c.eidolon!==0 || e.count!==1 || e.toughnessActive!==true || parts.length!==2 || !Number.isInteger(a.traceLevel) || a.traceLevel<1 || a.traceLevel>10)return fail("通常＋追加愉悦の合計はLv80/E0・未撃破の敵1体・状態一定の単発計算です。");
        if(spec.owner==="1513" && (a.hasOtherElation!==true || a.startingFervor!==0))return fail("この合計は他の愉悦キャラを編成し、攻撃前の熱気0を想定した行です。");
        if(spec.scope && (a.certifiedBangerScope!==spec.scope || a.characterId!==spec.owner))return fail("この合計は本人の爆笑の褒美が味方内最大の限定状態です。");
        const key=spec.owner==="1505"?"hiyu-certified-banger":"elation-certified-banger",cb=values[key];
        if(!Number.isInteger(cb)||cb<1||cb>10000)return fail("本人の追加愉悦が参照する爆笑の褒美1～10000を入力してください。");
        const prior=values["hiyu-prior-vulnerability"]===true || values["hiyu-prior-fox-vulnerability"]===true;
        for(let i=0;i<2;i++){
            const p=parts[i],b=p?.input?.attack||{},d=a.damageComponents?.[i],mods=p?.input?.modifiers||[];
            if(p?.key!==["direct","banger"][i] || b.id!==[spec.body,spec.rider][i] || d?.attackId!==b.id || b.characterId!==spec.owner || b.element!==spec.element || b.canCrit!==true || b.damageFormula!==(i===0?"statMultiplier":"elation") || b.type!==(i===0?spec.type:"elation") || b.attackType!==b.type || b.hitCount!==(i===1&&spec.rider==="1505042"?10:1) || !Number.isInteger(b.traceLevel) || b.traceLevel<1 || b.traceLevel>10 || b.multiplier!==b.multipliers?.[b.traceLevel-1] || JSON.stringify(p.input.character)!==JSON.stringify(c) || JSON.stringify(p.input.enemy)!==JSON.stringify(e) || JSON.stringify(p.input.modifierInputs)!==JSON.stringify(input.modifierInputs))return fail("同じ本人・敵・状態と、行動Lv/天賦Lvに対応する登録済み2成分を指定してください。");
            if(i===0 && (b.sourceSkillId!==spec.body || b.traceLevel!==a.traceLevel || b.multiplier!==a.multipliers?.[a.traceLevel-1]))return fail("通常成分の行動Lvと倍率を確認してください。");
            if(i===1 && (b.sourceSkillId!==(spec.riderSource || (spec.owner==="1505"?"150504":"151304")) || b.elationContext!=="certifiedBanger" || p.input.elation?.context!=="certifiedBanger" || p.input.elation?.certifiedBanger!==cb || (spec.scope && b.certifiedBangerScope!==spec.scope)))return fail("追加愉悦の所有者・天賦Lv・本人の爆笑の褒美条件を確認してください。");
            if(mods.some(m=>m.category==="progressiveTakenDamage"&&m.enabled!==false&&m.applicable!==false&&modifierAppliesToAttack(m,b)))return fail("この合計は段間で更新する被ダメージ補正を扱いません。");
            if(spec.owner==="1505" && (spec.type==="followUp" || spec.type==="ultimate" || prior)){
                const id=spec.type==="followUp" ? (i===0?"traceNode:1505:1505102:fox-prior-vulnerability":"traceNode:1505:1505102:fox-cb-prior-vulnerability") : (i===0?"traceNode:1505:1505102:prior-vulnerability":"traceNode:1505:1505102:cb-prior-vulnerability");
                const rows=mods.filter(m=>m.id===id&&m.enabled!==false&&m.applicable!==false&&modifierAppliesToAttack(m,b));
                if(rows.length!==1 || rows[0].value!==12)return fail("同一の敵に事前成立した緋英A4 12%を各対象成分へ1回適用してください。");
            }
        }
        return combineDamageComponents(a,parts,"通常ダメージ＋同一行動の本人追加愉悦（各式・補正対象を分離）");
    }

    function calculateKafkaSnapshot(input) {
        const a=input.attack||{},c=input.character||{},e=input.enemy||{},parts=input.sequenceComponents||[],spec=kafkaSequences[a.id];
        const fail=reason=>({supported:false,reason});
        if(c.level!==80 || c.eidolon!==0 || e.count!==1 || parts.length!==2 || !Number.isInteger(a.traceLevel) || a.traceLevel<1 || a.traceLevel>10)return fail("カフカの合計はLv80/E0・敵1体・本人の感電1種だけが事前成立した状態に限定します。");
        for(let i=0;i<2;i++){
            const p=parts[i],b=p?.input?.attack||{},d=a.damageComponents?.[i];
            if(p?.key!==["direct","shock"][i] || p.name!==d?.name || b.id!==[spec.body,spec.shock][i] || d.attackId!==b.id || b.characterId!=="1005" || b.variant!==spec.variant || b.type!==(i===0?spec.type:"dot") || b.attackType!==b.type || b.element!=="Thunder" || b.scalingStat!=="atk" || b.target!=="single" || b.hitCount!==1 || b.damageFormula!=="statMultiplier" || b.canCrit!==(i===0) || !Number.isFinite(b.multiplier) || JSON.stringify(p.input.character)!==JSON.stringify(c) || JSON.stringify(p.input.enemy)!==JSON.stringify(e) || JSON.stringify(p.input.modifierInputs)!==JSON.stringify(input.modifierInputs))return fail("同じカフカ本人・版・敵・入力を参照する直撃と本人感電を指定してください。");
            if(i===0 && (b.sourceSkillId!==spec.body || b.traceLevel!==a.traceLevel || b.multiplier!==d.multipliers?.[a.traceLevel-1]))return fail("本体の軌跡Lv・倍率が登録曲線と一致しません。");
            if(i===1){
                const values=b.resolvedMultiplierComponents||[];
                if(b.sourceSkillId!==(spec.variant==="previous"?"100503":"1100503") || values.length!==2 || values.some((v,j)=>v.traceKey!==["ultimate",spec.trace][j] || !Number.isInteger(v.level) || v.level<1 || v.level>10 || (j===1&&v.level!==a.traceLevel) || v.value!==d.multiplierProductComponents?.[j]?.values?.[v.level-1]) || Math.abs(b.multiplier-values[0].value*values[1].value/100)>1e-9)return fail("本人感電の必殺Lvと、今回の攻撃の起爆割合を独立に指定してください。");
            }
        }
        return combineDamageComponents(a,parts,"直撃＋本人の事前感電1種の起爆（他者/撃破DoTは対象外）");
    }

    function calculateGuinaifenSnapshot(input) {
        const a=input.attack||{},c=input.character||{},e=input.enemy||{},parts=input.sequenceComponents||[];
        const fail=reason=>({supported:false,reason});
        if(c.level!==80 || c.eidolon!==0 || e.count!==1 || e.weakness!==false || e.toughnessActive!==true || parts.length!==2 || !Number.isInteger(a.traceLevel) || a.traceLevel<1 || a.traceLevel>10 || !Number.isInteger(a.talentTraceLevel) || a.talentTraceLevel<1 || a.talentTraceLevel>10) return fail("この必殺合計はLv80/E0・炎非弱点/未撃破の敵1体・各軌跡Lv1～10・事前火喰い3層/自身スキル燃焼1種のみの状態です。");
        const perStack=[4,4.3,4.6,4.9,5.2,5.5,5.87,6.25,6.63,7];
        for(let i=0;i<2;i++){
            const p=parts[i],b=p?.input?.attack||{},d=a.damageComponents?.[i],mods=p?.input?.modifiers||[];
            if(p?.key!==["direct","burn"][i] || p.name!==d?.name || b.id!==["121003","1210031"][i] || d.attackId!==b.id || b.characterId!=="1210" || b.sourceSkillId!=="121003" || b.type!==["ultimate","dot"][i] || b.attackType!==b.type || b.element!=="Fire" || b.scalingStat!=="atk" || b.target!=="single" || b.hitCount!==1 || !Number.isFinite(b.multiplier) || b.canCrit!==(i===0) || b.traceLevel!==a.traceLevel || JSON.stringify(p.input.character)!==JSON.stringify(c) || JSON.stringify(p.input.enemy)!==JSON.stringify(e))return fail("桂乃芬本人・同一の敵/ステータス・必殺Lvの直撃/燃焼起爆成分を指定してください。");
            if(i===0 && b.multiplier!==d.multipliers?.[a.traceLevel-1])return fail("必殺直撃の倍率が登録曲線と一致しません。");
            if(i===1){const values=b.resolvedMultiplierComponents||[];
                if(values.length!==2 || values.some((v,j)=>v.traceKey!==["skill","ultimate"][j] || !Number.isInteger(v.level) || v.level<1 || v.level>10 || (j===1&&v.level!==a.traceLevel) || v.value!==d.multiplierProductComponents?.[j]?.values?.[v.level-1]) || Math.abs(b.multiplier-values[0].value*values[1].value/100)>1e-9)return fail("燃焼倍率のスキルLvと起爆割合の必殺Lvを独立に指定してください。");
            }
            for(const [id,value] of [["trace:1210:121004:firekiss",3*perStack[a.talentTraceLevel-1]],["traceNode:1210:1210103:burn-damage",20]]){
                const rows=mods.filter(m=>m.id===id&&m.enabled===true&&m.applicable===true);
                if(rows.length!==1 || !Number.isFinite(rows[0].value) || Math.abs(rows[0].value-value)>1e-9)return fail("各成分に事前火喰い3層と燃焼対象への20%を1回ずつ適用してください。");
            }
            if(mods.some(m=>m.enabled!==false&&m.applicable!==false&&m.category==="progressiveTakenDamage"))return fail("段間で更新する被ダメージ補正はこの状態一定の合計では扱いません。");
        }
        return combineDamageComponents(a,parts,"必殺直撃＋自身スキル燃焼1種の起爆（事前火喰い3層）");
    }

    function calculateDahliaNormalSnapshot(input) {
        const a=input.attack||{},c=input.character||{},e=input.enemy||{},parts=input.sequenceComponents||[];
        const fail=reason=>({supported:false,reason});
        if(a.damageFormula!=="componentSequence"||a.characterId!=="1321"||a.sourceSkillId!=="132101"||a.type!=="normal"||a.element!=="Fire"||a.hitCount!==1||!Array.isArray(a.damageComponents)||a.damageComponents.length!==2||unsupportedAttackReason(a)||c.id!=="1321"||c.level!==80||c.eidolon!==0||e.count!==1||e.weakness!==true||e.toughnessActive!==false||!Number.isInteger(a.traceLevel)||a.traceLevel<1||a.traceLevel>6||a.multiplier!==[50,60,70,80,90,100][a.traceLevel-1]||parts.length!==2)return fail("本人通常の合計はLv80/E0・事前撃破済みの炎弱点敵1体・通常Lv1～6に限定します。");
        for(let i=0;i<2;i++){
            const p=parts[i],q=p?.input,b=q?.attack||{};
            if(p?.key!==["direct","superBreak"][i]||b.id!==["132101","1321044"][i]||a.damageComponents[i]?.attackId!==b.id||b.characterId!=="1321"||b.sourceSkillId!==["132101","132104"][i]||b.type!==["normal","superBreak"][i]||b.element!=="Fire"||b.hitCount!==1||JSON.stringify(q.character)!==JSON.stringify(c)||JSON.stringify(q.enemy)!==JSON.stringify(e)||q.modifierInputs?.["dahlia-normal-base-toughness"]!==input.modifierInputs?.["dahlia-normal-base-toughness"])return fail("同じ本人通常の所有者・敵・基礎削靭値を使用してください。");
            if(i===0&&(b.damageFormula!=="statMultiplier"||b.scalingStat!=="atk"||b.traceLevel!==a.traceLevel||b.multiplier!==a.multiplier))return fail("通常の直接成分と通常Lvが一致しません。");
            if(i===1&&b.damageFormula!=="dahliaSuperBreak")return fail("天賦の超撃破成分を指定してください。");
        }
        return combineDamageComponents(a,parts,"本人通常の直接成分＋同じ通常の共に舞う者超撃破（攻撃前撃破済み）");
    }

    function calculateDahliaSnapshot(input) {
        const a=input.attack||{},c=input.character||{},e=input.enemy||{},parts=input.sequenceComponents||[];
        const fail=reason=>({supported:false,reason});
        if(c.level!==80 || c.eidolon!==0 || e.count!==1 || e.weakness!==true || e.toughnessActive!==false || !Number.isInteger(a.traceLevel) || a.traceLevel<1 || a.traceLevel>10 || parts.length!==2 || a.damageComponents?.length!==2)return fail("ダリアの同一追撃成分はLv80/E0/事前撃破済みの炎弱点敵1体/天賦Lv1～10に限定します。");
        for(let i=0;i<2;i++){
            const p=parts[i],child=p?.input?.attack||{};
            if(child.id!==["132104","1321042"][i] || a.damageComponents[i].attackId!==child.id || child.characterId!=="1321" || child.sourceSkillId!=="132104" || child.traceLevel!==a.traceLevel || child.multiplier!==child.multipliers?.[a.traceLevel-1] || child.type!==(i===0?"followUp":"superBreak") || child.damageFormula!==(i===0?"statMultiplier":"dahliaSuperBreak") || JSON.stringify(p.input.character)!==JSON.stringify(c) || JSON.stringify(p.input.enemy)!==JSON.stringify(e) || p.input.modifierInputs?.["dahlia-fua-base-toughness"]!==input.modifierInputs?.["dahlia-fua-base-toughness"])return fail("同じ追撃の提供者・敵・天賦Lv・基礎削靭値を使用してください。");
        }
        return combineDamageComponents(a,parts,"天賦追撃5段＋追撃固有の超撃破（共に舞う者の変換は未合算）");
    }

    function calculateDahliaSuperBreak(input) {
        const a=input.attack||{},c=input.character||{},e=input.enemy||{},normal=a.id==="1321044",key=normal?"dahlia-normal-base-toughness":"dahlia-fua-base-toughness",v=input.modifierInputs?.[key];
        if(normal&&(a.damageFormula!=="dahliaSuperBreak"||unsupportedAttackReason(a)||c.id!=="1321"||a.hitCount!==1||a.canCrit!==false||a.multiplier!==[30,33,36,39,42,45,48.75,52.5,56.25,60][a.traceLevel-1]))return {supported:false,reason:"本人通常に付随する共に舞う者の天賦Lv1～10の変換率を使用してください。"};
        if(!Number.isFinite(c.stats?.breakEffect) || c.stats.breakEffect<0 || c.level!==80 || c.eidolon!==0 || e.count!==1 || e.weakness!==true || e.toughnessActive!==false || !Number.isInteger(a.traceLevel) || a.traceLevel<1 || a.traceLevel>10 || !Number.isFinite(v) || v<0 || v>99999 || a.multiplier!==a.multipliers?.[a.traceLevel-1]) return {supported:false,reason:"ダリアの超撃破はLv80/E0/炎弱点の敵1体が事前撃破済み・天賦Lv1～10・基礎削靭値の指定が必要です。"};
        const sb=calculateSuperBreak({...input,attack:{...a,superBreakMultiplier:a.multiplier,toughnessDamage:v}});
        if(!sb.supported)return sb;
        return {attack:{name:a.name,canCrit:false,hitCount:1,target:"single"},nonCrit:sb.value,crit:sb.value,expected:sb.value,applied:sb.applied,skipped:sb.skipped,breakdown:{damageFormula:"breakComponent",kind:"superBreak",...sb,finalBreakEffect:(sb.breakEffect-1)*100}};
    }

    // A resolved tick already contains the DoT owner's offensive and enemy multipliers.
    // This narrow A4 path only scales that explicit snapshot, and never attributes it to another owner.
    function calculateSerinResolvedDoT(input) {
        const a=input.attack||{},c=input.character||{},e=input.enemy||{};
        if(/^11415220[1-8]$/.test(a.id)){
            const n=Number(a.id.slice(-1)),index=(n-1)%4,owners=['1005','1108','1111','1210'],sources=['100503','110804','111102','121002'],elements=['Thunder','Wind','Physical','Fire'],owner=owners[index],source=sources[index],key='ocean-foreign-original:'+owner+':'+source,original=input.modifierInputs?.[key],ratio=(n<=4?[30,36,42,48,54,60]:[40,48,56,64,72,80])[a.traceLevel-1];
            if(c.id!=='1410'||c.level!==80||c.eidolon!==0||e.count!==1||e.toughnessActive!==true||a.dataOwnerId!==owner||a.sourceDoTId!==source||a.triggerActorId!=='1410'||a.element!==elements[index]||a.type!=='dot'||a.canCrit!==false||a.sourceSkillId!=='1141522'||a.originalDamageInputKey!==key||a.dotOwnerPresent!==true||a.cyreneBlessingActive!==true||input.modifierInputs?.['trace:1415:1141522:serin-damage-active']!==true||!Number.isInteger(a.traceLevel)||a.traceLevel<1||a.traceLevel>6||a.multiplier!==ratio||!Number.isFinite(original)||original<0||original>1e12)return {supported:false,reason:'編成中のE0付与者の事前DoT1回分を明示してください。起爆者のATK/属性や別所有者の値で代用しません。'};
            const value=original*ratio/100;
            return {attack:{name:a.name,canCrit:false,hitCount:1,target:'single'},nonCrit:value,crit:value,expected:value,applied:[],skipped:(input.modifiers||[]).map(m=>({...m,applicable:false,reason:'DoT所有者の補正済み1回分へ算入済みのため再適用しません。'})),breakdown:{damageFormula:'resolvedDamageMultiplier',referenceValue:original,multiplier:ratio,sourceDoTId:source,dataOwnerId:owner,triggerActorId:'1410',condition:'所有者別の成立済みDoT1回分へ起爆率だけを適用。本人の4種DoTと重複させません。'}};
        }
        const ocean=/^1141522[1-8]$/.test(a.id),number=ocean?Number(a.id.slice(-1)):0;
        const index=ocean?(number-1)%4:["14101021","14101022","14101023","14101024"].indexOf(a.id);
        const sourceId=["1410041","1410042","1410043","1410044"][index];
        const key="serin-detonation-original:"+sourceId, original=input.modifierInputs?.[key];
        const curve=number<=4?[30,36,42,48,54,60]:[40,48,56,64,72,80],ratio=ocean?curve[a.traceLevel-1]:150;
        if(index<0 || c.level!==80 || c.eidolon!==0 || e.count!==1 || a.characterId!=='1410' || a.dataOwnerId!=="1410" || a.sourceDoTId!==sourceId || a.originalDamageInputKey!==key || a.multiplier!==ratio || !Number.isFinite(ratio) || a.canCrit!==false || !Number.isFinite(original) || original<0 || original>1e12 || (ocean&&(c.id!=='1410'||a.sourceSkillId!=='1141522'||!Number.isInteger(a.traceLevel)||a.traceLevel<1||a.traceLevel>6||e.toughnessActive!==true||a.cyreneBlessingActive!==true||input.modifierInputs?.['trace:1415:1141522:serin-damage-active']!==true))) return {supported:false,reason:"セイレンス本人の事前DoT1回分（補正済み非会心値）と成立済み祝福を明示してください。他所有者のDoT・未指定値は代用しません。"};
        const value=original*(ratio/100);
        return {attack:{name:a.name,canCrit:false,hitCount:1,target:"single"},nonCrit:value,crit:value,expected:value,applied:[],skipped:(input.modifiers||[]).map(m=>({...m,applicable:false,reason:"元のDoT1回分へ算入済みのため、起爆へ補正を再適用しません。"})),breakdown:{damageFormula:"resolvedDamageMultiplier",referenceValue:original,multiplier:ratio,sourceDoTId:sourceId,dataOwnerId:"1410",condition:"本人所有の成立済みDoTのみ。元の非会心値へ起爆率"+ratio+"%だけを適用"}};
    }

    function calculateSerinSnapshot(input) {
        const a=input.attack||{},c=input.character||{},e=input.enemy||{},parts=input.sequenceComponents||[],n=input.modifierInputs?.["serin-zone-proc-count"];
        const ids=["141003","14101021","14101022","14101023","14101024","1410031"];
        const fail=reason=>({supported:false,reason});
        if(c.level!==80 || c.eidolon!==0 || e.count!==1 || !Number.isInteger(a.traceLevel) || a.traceLevel<1 || a.traceLevel>10 || !Number.isInteger(n) || n<0 || n>8 || parts.length!==6 || a.damageComponents?.length!==6)return fail("必殺の本人DoT比較はLv80/E0/敵1体/必殺Lv1～10・本人4種の既存DoT値と結界発動数0～8の明示が必要です。");
        for(let i=0;i<6;i++){
            const child=parts[i]?.input?.attack||{};
            if(child.id!==ids[i] || a.damageComponents[i].attackId!==ids[i] || child.characterId!=="1410" || JSON.stringify(parts[i].input.character)!==JSON.stringify(c) || JSON.stringify(parts[i].input.enemy)!==JSON.stringify(e) || JSON.stringify(parts[i].input.modifierInputs)!==JSON.stringify(input.modifierInputs))return fail("セイレンス必殺の参照者・敵・事前DoT・構成が一致しません。");
            if([0,5].includes(i) && (child.traceLevel!==a.traceLevel || child.type!==(i===0?"ultimate":"dot") || child.multiplier!==child.multipliers?.[a.traceLevel-1]))return fail("必殺直撃・結界DoTのLv/倍率を確認してください。");
        }
        // The count is a supplied event snapshot. No new DoT assignment or proc recursion is simulated.
        const expanded=parts.slice(0,5).concat(Array.from({length:n},(_,i)=>({...parts[5],key:"zone-"+(i+1),name:parts[5].name+" "+(i+1)+"回目"})));
        return combineDamageComponents(a,expanded,"必殺直撃＋本人4種の事前DoT150%起爆＋指定回数の結界DoT（他所有者は対象外）");
    }

    function calculateCipherSnapshot(input) {
        const a=input.attack||{}, c=input.character||{}, e=input.enemy||{},parts=input.sequenceComponents||[];
        const fail=reason=>({supported:false,reason});
        if(c.level!==80 || c.eidolon!==0 || e.count!==1 || !Number.isInteger(a.traceLevel) || a.traceLevel<1 || a.traceLevel>10 || parts.length!==4 || a.damageComponents?.length!==4)return fail("サフェル必殺の指定記録値比較はLv80/E0/敵1体/必殺Lv1～10のみ対応です。");
        for(let i=0;i<4;i++){
            const p=parts[i], d=a.damageComponents[i], child=p?.input?.attack||{},isTrue=[1,3].includes(i);
            if(child.id!==["1406031","1406033","1406032","1406034"][i] || child.id!==d.attackId || child.sourceSkillId!=="140603" || child.characterId!=="1406" || JSON.stringify(p.input.character)!==JSON.stringify(c) || JSON.stringify(p.input.enemy)!==JSON.stringify(e))return fail("サフェル必殺の各成分・参照者・敵入力が一致しません。");
            if(isTrue){const expected=i===1?25:75,key=i===1?"cipher-recorded-before-25":"cipher-recorded-before-75";if(child.damageFormula!=="trueDamage" || child.multiplier!==expected || d.recordInputKey!==key || p.input.trueDamage?.originalDamage!==input.modifierInputs?.[key])return fail("確定成分ごとの記録値と倍率を確認してください。");}
            else if(child.type!=="ultimate" || child.element!=="Quantum" || child.scalingStat!=="atk" || child.multiplier!==d.multipliers?.[a.traceLevel-1] || child.traceLevel!==a.traceLevel)return fail("必殺直撃の倍率・攻撃種類が一致しません。");
        }
        return combineDamageComponents(a,parts,"必殺直撃2成分＋各参照時点の記録値25%/75%の合計（記録更新は自動再現しない）");
    }

    function calculateLingshaSnapshot(input) {
        const a=input.attack||{}, c=input.character||{}, e=input.enemy||{}, parts=input.sequenceComponents||[];
        const fail=reason=>({supported:false,reason});
        if(c.level!==80 || c.eidolon!==6 || e.count!==1 || !Number.isInteger(a.traceLevel) || a.traceLevel<1 || a.traceLevel>12 || parts.length!==2 || a.damageComponents?.length!==2) return fail("浮元の本体＋追加4段はLv80・星魂6・敵1体・天賦Lv1～12のみ対応です。");
        const specs=[['fuyuan-main-two-hit','122204','122204',2,a.traceLevel],['e6-four-extra-hit','1222061','122206',4,1]];
        for(let i=0;i<2;i++){
            const [key,id,source,hits,level]=specs[i],d=a.damageComponents[i],p=parts[i],child=p?.input?.attack||{};
            if(d.key!==key || d.attackId!==id || p.key!==key || child.id!==id || child.sourceSkillId!==source || child.characterId!=="1222" || child.type!=="followUp" || child.element!=="Fire" || child.scalingStat!=="atk" || child.target!=="single" || child.traceLevel!==level || child.hitCount!==hits || child.multiplier!==d.multipliers?.[level-1] || child.canCrit===false || child.damageFormula!=="statMultiplier") return fail("浮元本体と星魂6追加段の定義・順序・係数が一致しません。");
            if(JSON.stringify(p.input.character)!==JSON.stringify(c) || JSON.stringify(p.input.enemy)!==JSON.stringify(e)) return fail("浮元の全成分には同じ最終ATKと敵条件が必要です。");
            if(!(p.input.modifiers||[]).some(m=>m.id==="eidolon:1222:6:fuyuan-all-res-down" && (m.includedInFinalStats || m.enabled!==false && m.applicable!==false && !(m.inputWarnings||[]).length))) return fail("浮元在場の星魂6耐性低下を、算入済み指定を含めて確認してください。");
        }
        return combineDamageComponents(a,parts,"同じ浮元攻撃の本体2ヒット＋星魂6追加4ヒットの合計");
    }

    function calculateSushangSnapshot(input) {
        const a=input.attack||{}, c=input.character||{}, e=input.enemy||{}, parts=input.sequenceComponents||[];
        const fail=reason=>({supported:false,reason});
        if(c.level!==80 || c.eidolon!==0 || e.count!==1 || e.toughnessActive!==false || !Number.isInteger(a.traceLevel) || a.traceLevel<1 || a.traceLevel>10 || input.modifierInputs?.["sushang-sword-stance-stacks"]!==10) return fail("必殺後のスキル合計はLv80・星魂0・敵1体・事前撃破済み・逐寇事前10層のみ対応です。");
        const specs=[['skill','120602',1,'skill'],['primary','1206021',1,'additional'],['extra','1206031',2,'additional']];
        if(parts.length!==3 || a.damageComponents?.length!==3) return fail("スキル本体と剣勢の3成分が必要です。");
        for(let i=0;i<3;i++) {
            const part=parts[i], child=part?.input?.attack||{}, [key,id,hits,type]=specs[i];
            if(part.key!==key || a.damageComponents[i].key!==key || a.damageComponents[i].attackId!==id || child.id!==id || child.characterId!=="1206" || child.element!=="Physical" || child.type!==type || child.scalingStat!=="atk" || child.hitCount!==hits || child.traceLevel!==a.traceLevel || child.multiplier!==child.multipliers?.[a.traceLevel-1] || child.canCrit===false || child.damageFormula!=="statMultiplier") return fail("素裳の成分・倍率・段数が登録構成と一致しません。");
            if(JSON.stringify(part.input.character)!==JSON.stringify(c) || JSON.stringify(part.input.enemy)!==JSON.stringify(e)) return fail("全成分に同じ最終値と敵条件が必要です。");
        }
        return combineDamageComponents(a,parts,"戦闘スキル本体＋剣勢1回＋必殺後追加剣勢2回の合計");
    }

    // Interpretation is already capped before the attack; only the final AoE receives it.
    function calculateHertaSnapshot(input) {
        const a = input.attack || {}, c = input.character || {}, e = input.enemy || {};
        const fail = reason => ({ supported: false, reason });
        const definitions = a.damageComponents || [], parts = input.sequenceComponents || [];
        if (c.level !== 80 || c.eidolon !== 0 || e.count !== 1 || !Number.isInteger(a.traceLevel) || a.traceLevel < 1 || a.traceLevel > 10) return fail("マダム・ヘルタの強化スキルはLv80・星魂0・敵1体・スキルLv1～10・指定した解読状態のみ対応です。");
        const finalStacks = input.modifierInputs?.["herta-final-interpretation"];
        if (a.numericModifierInputs?.length && (!Number.isInteger(finalStacks) || finalStacks < 0 || finalStacks > 42)) return fail("最後の全体攻撃が参照する解読層数を0～42の整数で入力してください。");
        if (definitions.length !== 4 || parts.length !== 4) return fail("強化スキルの4成分が不足しています。");
        for (let i = 0; i < 4; i++) {
            const d = definitions[i], part = parts[i], child = part?.input?.attack || {};
            if (part?.key !== d.key || part?.name !== d.name || child.id !== (i === 3 ? "140109:final" : "140109")
                || child.type !== "enhancedSkill" || child.attackType !== "enhancedSkill" || child.element !== "Ice"
                || child.scalingStat !== "atk" || child.damageFormula !== "statMultiplier" || child.traceLevel !== a.traceLevel
                || child.hitCount !== 1 || child.canCrit === false || !Number.isFinite(child.multiplier)
                || child.multiplier <= 0 || child.multiplier !== d.multipliers?.[a.traceLevel - 1]) return fail("強化スキルの成分が固定状態の定義と一致しません。");
            if (JSON.stringify(part.input.character) !== JSON.stringify(c) || JSON.stringify(part.input.enemy) !== JSON.stringify(e)) return fail("強化スキルの全成分には同じ最終ステータスと敵条件が必要です。");
        }
        return combineDamageComponents(a, parts, `強化スキル3段＋最後の全体攻撃（最後撃の解読${a.numericModifierInputs?.length ? finalStacks : 42}層）`);
    }

    // Fixed single-target snapshot: 9 initial Knots and a pre-existing full A6 buff.
    // This adds no battle-state iteration; every child uses the same completed inputs.
    function calculateAcheronSnapshot(input) {
        const a = input.attack || {}, c = input.character || {}, e = input.enemy || {};
        const fail = reason => ({ supported: false, reason });
        const templates = a.damageComponents || [], parts = input.sequenceComponents || [];
        const dynamic = a.numericModifierInputs?.some(spec => spec.inputKey === "acheron-initial-knots");
        const knots = dynamic ? input.modifierInputs?.["acheron-initial-knots"] : 9;
        if (c.level !== 80 || c.eidolon !== 0 || e.count !== 1 || !Number.isInteger(a.traceLevel) || a.traceLevel < 1 || a.traceLevel > 10) return fail("黄泉の固定状態必殺技はLv80・星魂0・敵1体・必殺Lv1～10のみ対応です。");
        if (!Number.isInteger(knots) || knots < 0 || knots > 9) return fail("必殺技開始時の集真赤を0～9の整数で入力してください。");
        const keys = ["rainblade-1-direct", "rainblade-1-knots", "rainblade-2-direct", "rainblade-2-knots", "rainblade-3-direct", "rainblade-3-knots", "resurge", ...Array.from({length:6}, (_, i) => "a6-extra-" + (i + 1))];
        if (templates.length !== 13 || templates.some((d,i) => d.key !== keys[i])) return fail("黄泉の必殺技の成分定義が不足しています。");
        let remaining = knots;
        const expected = templates.flatMap(d => {
            if (!d.key.endsWith("-knots")) return [{d, multiplier:d.multipliers?.[a.traceLevel - 1]}];
            const removed = Math.min(3, remaining); remaining -= removed;
            if (!removed) return [];
            const multiplier = dynamic ? Math.min(d.capMultipliers?.[a.traceLevel - 1], d.perKnotMultipliers?.[a.traceLevel - 1] * (1 + removed)) : d.multipliers?.[a.traceLevel - 1];
            return [{d, multiplier}];
        });
        if (parts.length !== expected.length) return fail("開始時の集真赤に対応する必殺技成分が不足しています。");
        for (let i = 0; i < expected.length; i++) {
            const {d, multiplier} = expected[i], part = parts[i], child = part?.input?.attack || {};
            if (part?.key !== d.key || part?.name !== d.name || child.id !== d.attackId
                || child.sourceSkillId !== "130803" || child.type !== "ultimate" || child.attackType !== "ultimate"
                || child.element !== "Thunder" || child.scalingStat !== "atk" || child.damageFormula !== "statMultiplier"
                || child.traceLevel !== a.traceLevel || child.hitCount !== 1 || child.canCrit === false
                || !Number.isFinite(child.multiplier) || child.multiplier <= 0 || Math.abs(child.multiplier - multiplier) > 1e-9
                || (d.key.startsWith("a6-extra-") && child.multiplier !== 25)) return fail("黄泉の必殺技成分が指定した開始状態と一致しません。");
            if (JSON.stringify(part.input.character) !== JSON.stringify(c) || JSON.stringify(part.input.enemy) !== JSON.stringify(e)) return fail("黄泉の全成分には同じ最終ステータスと敵条件が必要です。");
        }
        return combineDamageComponents(a, parts, `啼沢斬り3回＋黄泉返り＋雷心6ヒット（集真赤事前${knots}層・雷心事前3層）`);
    }

    function combineDamageComponents(attack, components, totalLabel) {
        const fail = reason => ({ supported: false, reason });
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
            breakdown: { damageFormula: "componentSequence", totalLabel: totalLabel, componentNames: resolved.map(component => component.name), condition: attack.id === "150308" ? "同じ敵に対し、パール本人と底本の独立した最終ステータスを成分ごとに参照。単独行を合計へ再加算しないでください。" : "同じ敵・最終ステータスを参照し、各成分の固有補正は別々に適用" },
            applied,
            skipped
        };
    }






    // Combines only a pre-broken snapshot; it never creates or advances a Break event.
    function calculateNativeBreakSequence(input) {
        const {attack:a,character:c={},enemy:e={}}=input,fail=reason=>({supported:false,reason});
        if (a.id === "131718" && a.nativeBreakKind === "rappa") {
            const level=a.traceLevel,talent=a.nativeTalentLevel,ult=a.nativeUltimateLevel,charge=input.modifierInputs?.["rappa-consumed-charge"],curve=[180,204,228,252,276,300];
            if(a.sourceSkillId!=="131718"||a.characterId!=="1317"||a.type!=="enhancedNormal"||a.element!=="Imaginary"||a.scalingStat!=="atk"||a.hitCount!==1||!Number.isInteger(level)||level<1||level>6||a.multiplier!==curve[level-1]||!Number.isInteger(talent)||talent<1||talent>10||!Number.isInteger(ult)||ult<1||ult>10)return fail("乱破の通常/天賦/必殺Lvと登録済み成分を確認してください。");
            if(c.level!==80||c.eidolon!==0||e.count!==1||e.toughnessActive!==false||e.weakness!==true||!Number.isFinite(e.maxToughness)||e.maxToughness<=0||!Number.isInteger(charge)||charge<0||charge>10)return fail("この合計はLv80/E0・事前撃破済みの虚数弱点敵1体・消費チャージ0～10のみ対応です。");
            for(const k of ['atk','critRate','critDamage','damageBonus','breakEffect'])if(!Number.isFinite(c.stats?.[k])||(k==='atk'&&c.stats[k]<=0)||(k==='breakEffect'&&c.stats[k]<0))return fail("乱破の完成済み最終ステータスと結印分を含む撃破特効を入力してください。");
            const bm=input.breakModifiers||[],sm=input.superBreakModifiers||[],leaf='traceNode:1317:1317103:prior-break-vulnerability',eff='trace:1317:131703:sealform-super-break-efficiency';
            for(const ms of [bm,sm]){const rows=ms.filter(m=>m.id===leaf&&m.calculable!==false&&!(m.inputWarnings||[]).length&&((m.enabled!==false&&m.applicable!==false)||m.includedInFinalStats===true));if(rows.length!==1||!Number.isFinite(rows[0].value)||rows[0].value<2||rows[0].value>10)return fail("事前成立した枯葉の2～10%を指定し、敵入力への算入済みを区別してください。");}
            const efficiency=sm.filter(m=>m.id===eff&&m.enabled!==false&&m.applicable!==false&&m.calculable!==false&&!(m.inputWarnings||[]).length);if(efficiency.length!==1||efficiency[0].value!==50)return fail("結印中の撃破効率50%を1回だけ超撃破へ適用してください。");
            if((input.modifiers||[]).some(m=>m.category==='progressiveTakenDamage'&&m.enabled!==false&&m.applicable!==false&&modifierAppliesToAttack(m,a)))return fail("この合計は全3段で状態一定の比較です。段間で変わる補正は扱いません。");
            // The shared enemy field may contain the Break-only leaf; remove it from ordinary damage.
            const includedLeaf=bm.find(m=>m.id===leaf&&m.includedInFinalStats===true);
            const directEnemy=includedLeaf?{...e,takenDamage:(e.takenDamage||0)-includedLeaf.value}:e;
            const direct=calculate({...input,enemy:directEnemy,attack:{...a,damageFormula:'statMultiplier',requiredModifierIds:undefined}});if(direct.supported===false)return direct;
            const extra=calculateAdditionalBreak({...input,character:{...c,id:'1317'},attack:{id:'1317041',characterId:'1317',sourceSkillId:'131704',breakEvent:'additional',type:'break',element:'Imaginary',traceLevel:talent,multiplier:[30,33,36,39,42,45,48.75,52.5,56.25,60][talent-1]},modifiers:bm});if(extra.supported===false)return extra;
            const sb=calculateSuperBreak({...input,attack:{...a,type:'superBreak',attackType:'superBreak',toughnessDamage:27+charge,superBreakMultiplier:60},modifiers:sm});if(sb.supported===false)return sb;
            const wrap=(r,name,kind)=>({...r,attack:{name,canCrit:false,hitCount:1,target:'single'},nonCrit:r.value,crit:r.value,expected:r.value,breakdown:{damageFormula:'breakComponent',kind,...r,finalBreakEffect:((r.breakEffect ?? r.effect)-1)*100}});
            return {attack:{...direct.attack,name:a.name,hitCountLabel:'直接3段＋天賦撃破＋超撃破'},nonCrit:direct.nonCrit+extra.value+sb.value,crit:direct.crit+extra.value+sb.value,expected:direct.expected+extra.value+sb.value,components:{direct,additionalBreak:wrap(extra,'天賦追加撃破','break'),superBreak:wrap(sb,'本人A4超撃破','superBreak')},applied:[...direct.applied,...extra.applied,...sb.applied],skipped:[...direct.skipped,...extra.skipped,...sb.skipped],breakdown:{damageFormula:'componentSequence',componentNames:['直接3段','天賦追加撃破','本人A4超撃破'],totalLabel:'直接＋天賦追加撃破＋本人超撃破',condition:'虚数弱点の敵1体が事前撃破済み・状態一定。結印BEは最終入力、効率は1回適用。'}};
        }
        const enhanced=a.id.startsWith('11310'),skill=a.id.endsWith('09'),level=a.traceLevel,ult=a.nativeUltimateLevel;
        const curve=skill?[100,110,120,130,140,150,162.5,175,187.5,200]:[100,120,140,160,180,200];
        if(a.characterId!=='1310'||a.nativeBreakKind!=='firefly'||a.sourceSkillId!==a.id||a.variant!==(enhanced?'enhanced':'previous')||a.type!==(skill?'enhancedSkill':'enhancedNormal')||a.element!=='Fire'||a.scalingStat!=='atk'||a.hitCount!==1||!Number.isInteger(level)||level<1||level>curve.length||a.multiplier!==curve[level-1])return fail('ホタルの版・攻撃種別・全採用Lvの成分定義を確認してください。');
        if(c.level!==80||c.eidolon!==0||e.count!==1||e.toughnessActive!==false||e.weakness!==true)return fail('この想定はLv80・星魂0・攻撃前から炎弱点かつ撃破済みの敵1体・状態一定のみ対応です。');
        if(!Number.isInteger(ult)||ult<1||ult>10)return fail('完全燃焼の必殺技Lv1～10を入力してください。');
        for(const key of ['atk','critRate','critDamage','damageBonus','breakEffect'])if(!Number.isFinite(c.stats?.[key])||(key==='atk'?c.stats[key]<=0:key==='breakEffect'&&c.stats[key]<0))return fail('ホタルの最終ATK・会心・炎与ダメージ・撃破特効を入力してください。');
        const bm=input.breakModifiers||[],sbAttack={...a,type:'superBreak',attackType:'superBreak',toughnessDamage:skill?30:15,superBreakMultiplier:100};
        const prefix=enhanced?'11310':'1310',taken=[10,11,12,13,14,15,16.25,17.5,18.75,20][ult-1];
        const required=[['trace:1310:'+prefix+'03:native-break-taken',taken],['trace:1310:'+prefix+'03:native-efficiency',50],...(enhanced?[['trace:1310:11310101:native-be',25]]:[])];
        for(const[id,value]of required){const matches=bm.filter(m=>m.id===id&&m.enabled!==false&&m.applicable!==false&&m.calculable!==false&&!(m.inputWarnings||[]).length&&modifierAppliesToAttack(m,sbAttack));if(matches.length!==1||Math.abs(matches[0].value-value)>1e-9)return fail('完全燃焼の必須補正が不足しています：'+id);}
        if((input.modifiers||[]).some(m=>m.enabled!==false&&m.applicable!==false&&modifierAppliesToAttack(m,a)&&['statFlat','statPercent'].includes(m.category)&&m.stat==='atk'))return fail('ATK支援によるA6の撃破特効再変換は未対応です。この結果では支援をOFFにするか、ATKと撃破特効の両方を最終入力へ反映してください。');
        const sb=calculateSuperBreak({...input,attack:sbAttack,modifiers:bm});if(!sb.supported)return sb;
        const be=(sb.breakEffect-1)*100,conversion=enhanced?(be>=300-1e-9?150:be>=150-1e-9?100:0):(be>=360-1e-9?50:be>=200-1e-9?35:0);
        sb.value*=conversion/100;sb.conversionMultiplier=conversion/100;
        const direct=calculate({...input,attack:{...a,damageFormula:'statMultiplier',multiplier:a.multiplier+(skill?Math.min(360,be)*.2:0),requiredModifierIds:undefined}});if(direct.supported===false)return direct;
        const extra={attack:{name:'本人A4・超撃破',canCrit:false,hitCount:1,target:'single'},nonCrit:sb.value,crit:sb.value,expected:sb.value,applied:sb.applied,skipped:sb.skipped,breakdown:{damageFormula:'breakComponent',kind:'superBreak',...sb,finalBreakEffect:be}};
        return {attack:{...direct.attack,name:a.name},nonCrit:direct.nonCrit+sb.value,crit:direct.crit+sb.value,expected:direct.expected+sb.value,components:{direct,superBreak:extra},applied:[...direct.applied,...sb.applied],skipped:[...direct.skipped,...sb.skipped],breakdown:{damageFormula:'componentSequence',componentNames:['直接ダメージ','本人A4・超撃破（会心不可）'],totalLabel:'直接＋本人超撃破',condition:'攻撃前から撃破済み・同一敵・状態一定。初回撃破/外部の別ダメージは合算しません。'}};
    }

    function calculateAnaxaSequence(input) {
        const {attack:a,character:c={},enemy:e={}}=input,p=input.sequenceComponents||[],boosted=['1405013','1405024'].includes(a.id),normal=['1405011','1405013'].includes(a.id),fail=reason=>({supported:false,reason});
        if(c.level!==80||c.eidolon!==0||e.count!==1||e.toughnessActive!==false||e.weaknessCount!==7||a.qualitativeDisclosureActive!==true||p.length!==2) return fail('アナイクスの合計はLv80・星魂0・7弱点/本質暴露・撃破済みの敵1体・状態一定のみ対応です。');
        if(boosted&&(a.cyreneExtraHitsActive!==true||input.modifierInputs?.['cyrene-anaxa-extra-hits-active']!==true))return fail('理性の追加3ヒットが有効な状態とキュレネE0の編成を指定してください。');
        const skillId=boosted?'1405023':'140502';
        const specs=normal?[['normal','140501','normal'],['extraSkill',skillId,'skill']]:[['skill',skillId,'skill'],['extraSkill',skillId,'skill']];
        for(let i=0;i<2;i++){const [key,id,type]=specs[i],r=p[i],b=r?.input?.attack||{};
            if(r?.key!==key||a.damageComponents?.[i]?.attackId!==id||r.name!==a.damageComponents[i]?.name||b.id!==id||b.type!==type||b.attackType!==type||b.element!=='Wind'||b.scalingStat!=='atk'||b.hitCount!==(boosted&&type==='skill'?8:1)||b.damageFormula!=='statMultiplier'||!Number.isInteger(b.traceLevel)||b.traceLevel<1||b.traceLevel>(type==='normal'?6:10)||b.multiplier!==b.multipliers?.[b.traceLevel-1]) return fail('本体と非再帰の追加スキルの構成が一致しません。');
            if(JSON.stringify(r.input.character)!==JSON.stringify(c)||JSON.stringify(r.input.enemy)!==JSON.stringify(e))return fail('全成分に同じ攻撃者/敵のスナップショットが必要です。');
            const required=['trace:1405:140504:qualitative-disclosure','traceNode:1405:1405103:seven-weakness-defense-ignore',...(type==='skill'?['trace:1405:140502:single-enemy-damage']:[])];
            for(const rid of required)if((r.input.modifiers||[]).filter(m=>m.id===rid&&m.enabled!==false&&m.applicable!==false&&m.calculable!==false&&Number.isFinite(m.value)&&modifierAppliesToAttack(m,b)).length!==1)return fail('各成分の必須補正が不足しています：'+rid);
        }
        return combineDamageComponents(a,p,normal?'通常本体＋追加スキル1回':'スキル本体＋追加スキル1回');
    }

    function calculateMarchSequence(input) {
        const {attack:a,character:c={},enemy:e={}}=input, parts=input.sequenceComponents||[], enhanced=a.id==="1224081";
        const fail=reason=>({supported:false,reason});
        if(c.level!==80||c.eidolon!==0||e.count!==1||e.weakness!==false||e.toughnessActive!==true) return fail("師匠付加を含む合計はLv80・星魂0・全成分非弱点/未撃破の敵1体・状態一定のみ対応です。");
        if(!['Erudition','Destruction','Hunt','Remembrance','Elation'].includes(a.shifuPath)||!['Physical','Fire','Ice','Thunder','Wind','Quantum','Imaginary'].includes(a.shifuElement)) return fail("攻撃型の師匠の運命と属性を補正条件で指定してください。");
        if(!Number.isInteger(a.hitCount)||a.hitCount<(enhanced?3:1)||a.hitCount>(enhanced?8:1)||!Number.isInteger(a.traceLevel)||a.traceLevel<1||a.traceLevel>6||parts.length!==2) return fail("通常Lv1～6と、通常1段/強化3～8段の実現段数を指定してください。");
        const native=[40,44,48,52,56,60,65,70,75,80], base=enhanced?[40,48,56,64,72,80]:[50,60,70,80,90,100], added=[10,11,12,13,14,15,16.25,17.5,18.75,20];
        if(enhanced&&(!Number.isInteger(a.talentLevel)||a.talentLevel<1||a.talentLevel>10)) return fail("強化通常の天賦Lv1～10が必要です。");
        for(let i=0;i<2;i++) {
            const p=parts[i],b=p?.input?.attack||{},key=i?'additional':'basic',id=i?'122402':enhanced?'122408':'122401',type=i?'additional':enhanced?'enhancedNormal':'normal',element=i?a.shifuElement:'Imaginary';
            if(p?.key!==key||a.damageComponents?.[i]?.key!==key||a.damageComponents?.[i]?.attackId!==id||p.name!==a.damageComponents[i].name||b.id!==id||b.sourceSkillId!==id||b.type!==type||b.attackType!==type||b.element!==element||b.scalingStat!=="atk"||b.damageFormula!=="statMultiplier"||b.target!=="single"||b.hitCount!==a.hitCount||b.canCrit===false||!Number.isInteger(b.traceLevel)||b.traceLevel<1||b.traceLevel>(i?10:6)||b.multiplier!==(i?added:base)[b.traceLevel-1]||(!i&&b.traceLevel!==a.traceLevel)) return fail("師匠付加と通常本体の倍率・属性・段数が一致しません。");
            if(JSON.stringify(p.input.character)!==JSON.stringify(c)||JSON.stringify(p.input.enemy)!==JSON.stringify(e)) return fail("各成分は同じなのかのステータスと敵条件を使用してください。師匠のATKは参照しません。");
            if(!Number.isFinite(c.stats?.damageBonuses?.[element])||!Number.isFinite(e.resistances?.[element])) return fail("各成分の属性与ダメージと敵属性耐性を入力してください。補正なしは0を指定します。");
            const mods=p.input.modifiers||[];
            if(mods.some(m=>m.enabled!==false&&m.applicable!==false&&m.category==='progressiveTakenDamage')) return fail("段間で変化する被ダメージ補正はこの師匠付加の合計では計算対象外です。");
            const n=mods.filter(m=>m.id==='trace:1224:122404:enhanced-damage'&&m.enabled!==false&&m.applicable!==false);
            if(enhanced&&(n.length!==1||n[0].value!==native[a.talentLevel-1]||n[0].calculable===false||!modifierAppliesToAttack(n[0],b))) return fail("強化状態の天賦与ダメージを各成分に1回だけ適用してください。");
            if(!enhanced&&n.length) return fail("通常手番へ強化状態の天賦補正は適用しません。");
        }
        return combineDamageComponents(a,parts,"なのかの通常本体＋師匠属性の付加（"+a.hitCount+"段）");
    }

    // Only a fresh 9-charge Prey or no Prey: no threshold/expiration event is inferred.
    function calculateMozeUltimate(input) {
        const {attack:a,character:c={},enemy:e={}}=input, parts=input.sequenceComponents||[];
        const fail=reason=>({supported:false,reason});
        if(c.level!==80||c.eidolon!==0||e.count!==1||e.weakness!==false||e.toughnessActive!==true) return fail("モゼ必殺合計はLv80・星魂0・雷非弱点/未撃破の敵1体・状態一定のみ対応です。");
        if(typeof a.preyActive!=="boolean" || (a.preyActive && a.preyCharges!==9)) return fail("獲物なし、または付与直後の9チャージを指定してください。閾値・消滅分岐は未対応です。");
        const specs=[['ultimate','122303','ultimate'],['followUp','1223041','followUp'],...(a.preyActive?[['additional1','122304','additional'],['additional2','122304','additional']]:[])];
        if(parts.length!==specs.length) return fail("必殺本体・直後追撃・獲物付加の構成が不足しています。");
        for(let i=0;i<specs.length;i++) {
            const [key,id,type]=specs[i],p=parts[i],b=p?.input?.attack||{};
            if(p?.key!==key||a.damageComponents?.[i]?.key!==key||a.damageComponents?.[i]?.attackId!==id||p.name!==a.damageComponents[i].name||b.id!==id||b.type!==type||b.attackType!==type||b.element!=="Thunder"||b.scalingStat!=="atk"||b.hitCount!==1||b.damageFormula!=="statMultiplier"||!Number.isInteger(b.traceLevel)||b.traceLevel<1||b.traceLevel>10||!Number.isFinite(b.multiplier)||b.multiplier!==b.multipliers?.[b.traceLevel-1]) return fail("必殺合計の成分・倍率・軌跡Lvが一致しません。");
            if(i===0&&b.traceLevel!==a.traceLevel) return fail("必殺Lvが一致しません。");
            if(JSON.stringify(p.input.character)!==JSON.stringify(c)||JSON.stringify(p.input.enemy)!==JSON.stringify(e)) return fail("各成分は同じ攻撃時点の最終ステータスと敵条件を使用してください。");
            if((p.input.modifiers||[]).some(m=>m.enabled!==false&&m.applicable!==false&&m.category==="progressiveTakenDamage")) return fail("段間で更新する補正は、この状態一定の合計では扱いません。");
        }
        return combineDamageComponents(a,parts,"必殺本体＋直後追撃"+(a.preyActive?"＋獲物付加2回":""));
    }

    function calculateRealizedLuka(input) {
        const {attack, character = {}, enemy = {}} = input;
        const components = input.sequenceComponents || [];
        const fail = reason => ({supported:false, reason});
        const n = attack.realizedExtraPunches;
        if (!(Number.isFinite(character.stats?.atk) && character.stats.atk > 0) || !Number.isFinite(character.stats?.critRate) || !Number.isFinite(character.stats?.critDamage) || !Number.isFinite(character.stats?.damageBonus)) return fail("攻撃者の最終ATK・会心率・会心ダメージ・与ダメージを入力してください。");
        if (character.level !== 80 || character.eidolon !== 0 || enemy.count !== 1 || enemy.weakness !== false || enemy.toughnessActive !== true) return fail("ルカの合計はLv80・星魂0・物理非弱点/未撃破の敵1体・状態一定のみ計算対応です。");
        if (!Number.isInteger(n) || n < 0 || n > 3 || typeof attack.ownBleed !== "boolean") return fail("実現した追加拳0～3回と、自分の裂創の有無を指定してください。");
        if (!Number.isInteger(attack.traceLevel) || attack.traceLevel < 1 || attack.traceLevel > 6 || components.length !== (attack.ownBleed ? 3 : 2)) return fail("通常Lv1～6と、この状態に必要な直接/起爆成分が必要です。");
        const specs = [{key:"punches",id:"1111081",type:"enhancedNormal",count:3+n},{key:"uppercut",id:"1111082",type:"enhancedNormal",count:1},...(attack.ownBleed?[{key:"bleed",id:"1111041",type:"dot",count:1}]:[])];
        for (let i=0;i<specs.length;i++) {
            const spec=specs[i], component=components[i], child=component?.input, a=child?.attack || {};
            if (component?.key !== spec.key || component?.name !== attack.damageComponents?.[i]?.name || attack.damageComponents?.[i]?.attackId !== spec.id || a.id !== spec.id || a.type !== spec.type || a.attackType !== spec.type || a.element !== "Physical" || a.target !== "single" || a.hitCount !== spec.count || !Number.isFinite(a.multiplier) || a.multiplier <= 0) return fail("合計に必要な成分または実現段数が一致しません。");
            if (JSON.stringify(child.character)!==JSON.stringify(character) || JSON.stringify(child.enemy)!==JSON.stringify(enemy)) return fail("各成分は同じ攻撃時点の最終ステータス・敵条件で計算してください。");
            if ((child.modifiers||[]).some(m=>m.enabled!==false && m.applicable!==false && m.category==="progressiveTakenDamage")) return fail("段間で増加する被ダメージ補正は、この状態一定の合計には対応していません。");
            if (spec.type !== "dot") {
                if (a.damageFormula!=="statMultiplier" || a.scalingStat!=="atk" || a.canCrit===false || a.traceLevel!==attack.traceLevel || a.multiplier!==a.multipliers?.[a.traceLevel-1] || a.sourceSkillId!=="111108") return fail("直接成分の通常Lv・参照値・種別が一致しません。");
            } else {
                const skill=a.formulaTraceLevel, talent=a.traceLevel;
                if (!Number.isInteger(skill)||skill<1||skill>10||!Number.isInteger(talent)||talent<1||talent>10 || a.damageFormula!=="enemyHpCappedByAtk" || a.sourceSkillId!=="111104" || a.scalingStat!=="enemyHp" || a.canCrit!==false || a.multiplier!==a.multipliers?.[talent-1] || a.enemyHpPercent!==24 || a.atkCapPercent!==a.atkCapMultipliers?.[skill-1] || !(Number.isFinite(enemy.maxHp)&&enemy.maxHp>0)) return fail("自己裂創のスキルLv1～10・起爆天賦Lv1～10・敵最大HP・攻撃力上限が必要です。");
            }
        }
        return combineDamageComponents(attack,components,"直接ダメージ＋自己裂創起爆（会心なし）の合計");
    }

    function calculateElation(input) {
        const warnings = elationInputWarnings(input);
        if (warnings.length) return { supported: false, reason: warnings.join(" ") };
        const { character, enemy = {}, attack, elation: values } = input;
        const stats = character.stats;
        const modifiers = (input.modifiers || []).map(normalizeModifier);
        if (["800920","801020","150120","1501042"].includes(attack.id)
            && (input.modifiers || []).some(m => m.enabled !== false && m.applicable !== false && m.category === "progressiveTakenDamage" && modifierAppliesToAttack(m, attack))) {
            return {supported:false,reason:"アッハタイムの段間で変化する被ダメージ補正は、この敵1体の状態一定計算では扱いません。"};
        }
        if (["8009041","8010041","800920","801020","1501041","1501042","150120"].includes(attack.id)
            && (input.modifiers || []).some(m => m.enabled !== false && m.applicable !== false && m.includedInFinalStats !== true && ["statPercent","statFlat"].includes(m.category) && m.stat === "atk")) {
            return {supported:false,reason:"愉悦度へのATK変換は最終入力へ算入してください。この愉悦結果ではATK支援からの再変換を扱いません。"};
        }
        if(attack.characterId==='1502'&&(input.modifiers||[]).some(m=>m.enabled!==false&&m.applicable!==false&&m.includedInFinalStats!==true&&((['statFlat','statPercent'].includes(m.category)&&m.stat==='speed')||m.category==='progressiveTakenDamage')))return {supported:false,reason:'爻光のSPD由来愉悦度まで最終値へ含め、段間の状態を一定にしてください。'};
        if(attack.id==='150621'&&(input.modifiers||[]).some(m=>m.enabled!==false&&m.applicable!==false&&m.includedInFinalStats!==true&&(m.category==='progressiveTakenDamage'||['critRate','critRateOverride'].includes(m.category)||['statFlat','statPercent'].includes(m.category)&&m.stat==='speed')))return {supported:false,reason:'スコア由来会心とSPD由来愉悦を完成済み最終値に反映してください。この6段は途中補正更新を扱いません。'};
        if (["150220","150221"].includes(attack.id)) modifiers.push(normalizeModifier({
            id: "yaoguang-woes-whisper", name: "爻光・被ダメージ増加（攻撃前に付与）", source: "愉悦スキル150220",
            category: "takenDamage", value: attack.intrinsicTakenDamage, conditionText: attack.id==='150221'?'必殺による追加アッハ・敵1体':"初回の通常アッハタイム・敵1体",
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
        if (attack.requiresFinalCritDamageConversion && applied.some(item => item.category === "critDamage" && item.value !== 0)) return {supported:false,reason:"緋英の会心ダメージ支援による愉悦度の再変換は未検証です。攻撃時点の最終会心ダメージ・愉悦度に反映し、同じ支援をOFFにしてください。"};
        const levelBase = ELATION_LEVEL_BASE[character.level];
        const components = elationComponents(attack, values.fervor);
        const multiplierPercent = attack.id === "151321" ? components.reduce((total, p) => total + p.count * p.multiplierPercent, 0) : attack.multiplier;
        const hitCount = attack.id === "151321" ? 11 + values.fervor : attack.hitCount;
        const baseDamage = levelBase * multiplierPercent / 100;
        const elationPercent = stats.elation + sum("elation");
        const elationMultiplier = 1 + elationPercent / 100;
        // Fervor-triggered 151320 uses the Talent's fixed value, never the shared manual input.
        const punchline = attack.elationContext === "certifiedBanger" ? Math.max(values.certifiedBanger,attack.minimumCertifiedBanger || 0) : ["151320","150221"].includes(attack.id) ? 20 : values.punchline;
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
            attack: { name: attack.name, hitCount, hitCountLabel:attack.hitCountLabel, target: attack.target, canCrit: true, scalingStat: "elation" },
            nonCrit, crit, expected, perHit: { nonCrit: nonCrit / hitCount, crit: crit / hitCount, expected: expected / hitCount }, applied, skipped,
            breakdown: {
                ...(["150220", "150221", "151320", "151321", "1505042", "800920", "801020"].includes(attack.id) ? { elationComponents: components.map((component) => {
                    const perHitNonCrit = levelBase * component.multiplierPercent / 100 * commonMultiplier;
                    return { ...component, perHitNonCrit, nonCrit: perHitNonCrit * component.count,
                        crit: perHitNonCrit * component.count * critMultiplier, expected: perHitNonCrit * component.count * expectedCritMultiplier };
                }) } : {}),
                damageFormula: "elation", levelBase, referenceValue: levelBase, multiplierPercent,
                multiplierAddition: 0, scalingTerms: [], flatDamage: 0, baseDamage,
                elationPercent, elationMultiplier, punchline, punchlineMultiplier,
                ...(attack.elationContext === "certifiedBanger" ? {certifiedBanger:punchline,inputCertifiedBanger:values.certifiedBanger,minimumCertifiedBanger:attack.minimumCertifiedBanger || 0,punchlineSource:"certifiedBanger",elationScopeNote:attack.characterId==='1505'?"緋英本人の爆笑の褒美による追加愉悦成分のみ。必殺技は固定版の最大EP480を参照下限に使用。9バウンドと全体分は状態一定で合算し、通常ダメージ・キツネ先生・他の追加愉悦を自動合算しません。":"爆笑の褒美を使う独立した天賦追加愉悦。爆笑ネタ/熱気は参照せず、直撃と自動合算しません。"} : {}),
                ...(['1503081','1503031','150320','1503201'].includes(attack.id) ? {elationScopeNote: attack.id==='1503081' ? 'パール本人の爆笑の褒美による追加愉悦1回。複合行では直接攻撃と同じ合計に含めます。単独行と合計を重複加算しないでください。' : attack.id==='1503031' ? '深層学習中の強化通常後に発生する氷付加1回。底本の最終愉悦・会心と、パール側の爆笑ネタを参照します。' : '150320成立後の次回攻撃に付く愉悦1回。攻撃者本人の最終値・攻撃属性と、パール側の爆笑ネタを参照します。アッハ自体の直接ダメージではありません。'} : {}),
                ...(attack.id === "150221" ? {punchlineSource:'fixedUltimate',elationScopeNote:'必殺技が追加したアッハの本人6段。固定爆笑ネタ20を使い、通常アッハの手動入力や消費履歴を参照しません。全体1回＋ランダム5回・敵1体・状態一定。'} : {}),
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
        const breakAttack = { ...(input?.attack || {}), attackType: "break", type: "break", element: input?.element || "" };
        modifiers.forEach((item) => {
            if (item.enabled && item.applicable && !modifierAppliesToAttack(item, breakAttack)) {
                item.applicable = false;
                item.reason = "弱点撃破ダメージは対象外です";
            }
            if (item.enabled && item.applicable && (!item.calculable || (item.support?.status && item.support.status !== "calculable"))) {
                item.applicable = false;
                item.reason = item.support?.reason || "計算反映前の確認が必要です";
            }
            if (item.enabled && item.applicable && !["breakEffect","breakDamage","defenseReduction","defenseIgnore","resistanceReduction","resistancePenetration","takenDamage"].includes(item.category)) {
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
        const breakDamageBonus = applied.filter((item) => item.category === "breakDamage").reduce((sum, item) => sum + item.value, 0);
        const breakDamageMultiplier = 1 + breakDamageBonus / 100;
        const defenseReduction = number(enemy.defenseReduction) + applied.filter((item) => item.category === "defenseReduction").reduce((sum, item) => sum + item.value, 0);
        const defenseIgnore = number(enemy.defenseIgnore) + applied.filter((item) => item.category === "defenseIgnore").reduce((sum, item) => sum + item.value, 0);
        const resistancePenetration = number(enemy.resistancePenetration) + applied.filter((item) => ["resistancePenetration", "resistanceReduction"].includes(item.category)).reduce((sum, item) => sum + item.value, 0);
        const takenDamage = number(enemy.takenDamage) + applied.filter((item) => item.category === "takenDamage").reduce((sum, item) => sum + item.value, 0);
        const defense = defenseMultiplier(character.level, enemy.level, defenseReduction, defenseIgnore);
        const resistance = resistanceMultiplier(number(enemy.resistance) - resistancePenetration);
        const toughnessScale = 0.5 + Math.max(0, number(enemy.maxToughness, 30)) / 120;
        const vulnerability = 1 + takenDamage / 100;
        return { supported: true, value: base * multiplier * effect * breakDamageMultiplier * defense * resistance * toughnessScale * vulnerability, base, multiplier, effect, breakDamageBonus, breakDamageMultiplier, defense, resistance, toughnessScale, vulnerability, applied, skipped: modifiers.filter((item) => !item.enabled || !item.applicable) };
    }


    function calculateAdditionalBreak(input = {}) {
        const {character = {},enemy = {},attack = {}}=input;
        const fail=reason=>({supported:false,reason});
        const id=attack.id, level=attack.traceLevel;
        if(id==='1317041'){
            const base=[30,33,36,39,42,45,48.75,52.5,56.25,60],per=[25,27.5,30,32.5,35,37.5,40.62,43.75,46.88,50];
            const charge=Object.hasOwn(input.modifierInputs||{},'rappa-consumed-charge')?input.modifierInputs['rappa-consumed-charge']:0;
            if(attack.characterId!=='1317'||character.id!=='1317'||attack.sourceSkillId!=='131704'||attack.breakEvent!=='additional'||attack.type!=='break'||attack.element!=='Imaginary'||character.level!==80||character.eidolon!==0||enemy.count!==1||!Number.isInteger(level)||level<1||level>10||attack.multiplier!==base[level-1]||!Number.isInteger(charge)||charge<0||charge>10)return fail('乱破の天賦追加撃破はLv80・星魂0・敵1体・天賦Lv1～10・チャージ0～10のみ対応です。');
            if(!Number.isFinite(character.stats?.breakEffect)||character.stats.breakEffect<0||!Number.isFinite(enemy.maxToughness)||enemy.maxToughness<=0)return fail('乱破本人の最終撃破特効と敵最大靭性を入力してください。');
            const coefficient=base[level-1]+per[level-1]*charge;
            const result=calculateBreak({...input,element:'Imaginary',multiplier:.5*coefficient/100,enemy:{...enemy,weakness:true}});
            return result.supported?{...result,breakEvent:'additional',sourceCharacterId:character.id,charge,coefficient,condition:'第三段で発生した天賦追加撃破1回。直撃・超撃破・初回撃破との合算なし。'}:result;
        }
        const curves={"1303041":[60,66,72,78,84,90,97.5,105,112.5,120],"1303031":[30,32,34,36,38,40,42.5,45,47.5,50]};
        const source=id==="1303041"?"130304":"130303";
        if (!curves[id] || attack.breakEvent!=="additional" || attack.characterId!=="1303" || character.id!=="1303" || attack.sourceSkillId!==source || attack.type!=="break" || attack.element!=="Ice") return fail("追加撃破の提供者・独立イベント・成分定義を確認してください。");
        if (character.level!==80 || character.eidolon!==0 || enemy.count!==1 || !Number.isInteger(level) || level<1 || level>10 || attack.multiplier!==curves[id][level-1]) return fail("ルアン・メェイの追加撃破はLv80・星魂0・敵1体・軌跡Lv1～10のみ計算対応です。");
        if (!(Number.isFinite(character.stats?.breakEffect)&&character.stats.breakEffect>=0) || !(Number.isFinite(enemy.maxToughness)&&enemy.maxToughness>0)) return fail("提供者本人の最終撃破特効と敵の最大靭性を入力してください。");
        const result=calculateBreak({...input,element:"Ice",multiplier:attack.multiplier/100,enemy:{...enemy,weakness:true}});
        return result.supported ? {...result,breakEvent:"additional",sourceCharacterId:character.id,condition:"発動済みの追加撃破1回を想定。初回撃破・通常ダメージとは合算しません。"}:result;
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
            if (item.enabled && item.applicable && !["breakEffect","breakDamage","breakEfficiency","superBreakDamage","defenseReduction","defenseIgnore","resistanceReduction","resistancePenetration","takenDamage"].includes(item.category)) {
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
        const breakDamageMultiplier = 1 + sum(["breakDamage"]) / 100;
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
        const value = conversionMultiplier * base * (effectiveToughnessDamage / 10) * breakEffect * breakDamageMultiplier * defense * resistance * vulnerability * superBreakBonus;
        return { supported: true, value, base, conversionMultiplier, toughnessDamage, effectiveToughnessDamage, breakEffect, breakDamageMultiplier, breakEfficiency, superBreakBonus, defense, resistance, vulnerability, applied, skipped: modifiers.filter((item) => !item.enabled || !item.applicable) };
    }

    window.HsrCalcEngine = Object.freeze({ normalOnlyModifierReason, fanningInputWarnings, songbirdInputWarnings, trueDamageInputWarnings, elationInputWarnings, unsupportedAttackReason, calculate, calculateBreak, calculateAdditionalBreak, calculateSuperBreak, defenseMultiplier, resistanceMultiplier, actionSummary });
})();
