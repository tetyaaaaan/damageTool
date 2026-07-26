(function () {
    "use strict";

    function parseSource(source) {
        const [type, id = ""] = String(source || "").split(":");
        return { type, id };
    }

    function setModifierStack(context, modifier, stack) {
        if (!modifier?.id) return;
        context.uiState.stackByModifier[modifier.id] = stack;
        if (modifier.stack?.id) context.uiState.stackByModifier[modifier.stack.id] = stack;
    }

    function readWeaponType(context, calcData) {
        return calcData.weapons?.[context.weaponId]?.weaponType || "";
    }

    function isUnlockedConstellation(sourceId, context) {
        const level = Number(String(sourceId || "").replace(/^C/, ""));
        return Number.isFinite(level) && context.constellation >= level;
    }

    const CONSTELLATION_UI_LEVELS = ["C1", "C2", "C4", "C6"];
    const USER_TOGGLE_CATEGORIES = new Set([
        "additiveBaseDamage",
        "critBonus",
        "damageBonus",
        "defenseDebuff",
        "defenseIgnore",
        "effectOverride",
        "elementOverride",
        "extraDamage",
        "reactionBonus",
        "reactionCritBonus",
        "resistanceDebuff",
        "scalingBonus",
        "statConversion",
        "statBonus"
    ]);

    const ARTIFACT_DERIVED_CONDITIONS = new Set([
        "chargedAttack",
        "weaponTypeCatalystOrBow",
        "weaponTypeSwordClaymorePolearm"
    ]);

    const ARTIFACT_CONDITION_LABELS = {
        chargedAttack: "重撃に適用",
        enemyHpAtLeast50: "敵のHPが50%以上",
        hpAtMost70: "キャラクターのHPが70%以下",
        enemyAffectedByCryo: "敵が氷元素の影響を受けている",
        enemyAffectedByElectro: "敵が雷元素の影響を受けている",
        enemyAffectedByPyro: "敵が炎元素の影響を受けている",
        weaponTypeSwordClaymorePolearm: "武器種が片手剣・両手剣・長柄武器",
        weaponTypeCatalystOrBow: "武器種が法器または弓",
        afterSkill: "元素スキル使用後",
        afterReaction: "元素反応を起こした後",
        afterBurst: "元素爆発使用後",
        afterSkillHit: "元素スキルが命中した後",
        afterSwirlCorrespondingElement: "対応元素の拡散反応を起こした後",
        afterDefeatingEnemy: "敵を倒した後",
        afterPickingCrystallizeShardOrTriggeringMoonCrystallize: "結晶の欠片を拾うか月結晶反応を起こした後",
        whileShielded: "シールド状態",
        paleFlameTwoStacks: "蒼白の炎が2層",
        afterSkillWithEnergyAtLeast15: "元素エネルギー15以上で元素スキルを使用した後",
        huskCuriosityStacks: "問答効果の段階",
        afterHealingRecorded: "治療量を記録した後",
        afterHpLossDuringLatentLight: "潜光効果中にHPが減少した後",
        normalAttackHitProc: "通常攻撃命中時に幽谷祭祀が発動",
        afterSkillOrBurstHit: "元素スキルまたは元素爆発が命中した後",
        afterChargedAttackHit: "重撃が命中した後",
        haranWavepikeStacks: "元素スキル発動後、「波穂」を消費した時",
        afterOwnerTriggersBloomRelatedReaction: "装備者が開花系反応を起こした後",
        mirroredNymphStacks: "鏡中の水仙効果の段階",
        afterTakingDamage: "ダメージを受けた後",
        afterHpChanges: "HPが増減した後",
        afterHealingRecordedAndConverted: "治療量の記録と変換が完了した後",
        afterSkillAndCrystallizeShieldOrMoonCrystallizeObjectNearby: "元素スキル使用後、結晶シールドまたは月結晶生成物が存在",
        bondOfLifeChanges: "命の契約の数値が増減した後",
        burningEnemyNearbyOrOutOfCombat: "燃焼状態の敵が付近にいる、または非戦闘状態",
        afterTriggeringRelatedElementReaction: "装備者が自身の元素タイプに関連する元素反応を起こした後",
        afterTriggeringRelatedElementReactionWhileInNightsoulBlessing: "装備者が夜魂の加護状態で、自身の元素タイプに関連する元素反応を起こした後",
        nightsoulBlessingOnField: "夜魂の加護状態でフィールド上にいる",
        afterConsumingNightsoulPointOnField: "フィールド上で夜魂値を消費した後",
        afterPlungingChargedOrSkillHit: "落下攻撃・重撃・元素スキルが命中した後",
        energyIsZeroAndNotDisabledByBurstHit: "元素エネルギーが0で、元素爆発命中による無効化中ではない",
        energyIsZeroAndNotDisabledByNormalHit: "元素エネルギーが0で、通常攻撃命中による無効化中ではない",
        moonReactionWhileOnField: "フィールド上で月反応を起こした後",
        perMoonglowEffectInTeam: "チーム内の月輝効果数",
        afterElementalDamage: "元素ダメージを与えた後",
        offField: "キャラクターが待機中",
        teamMoonOmenAtLeastAscendantGleam: "チームの月兆が昇揚の月輝以上",
        afterNormalChargedSkillOrBurstHit: "通常攻撃・重撃・元素スキル・元素爆発が命中した後",
        witchAssignmentCompletedAndFavorEnhanced: "魔女の課題を完了し恩恵が強化されている",
        afterSkillAndWitchAssignmentCompleted: "元素スキル使用後かつ魔女の課題を完了済み",
        magicalSecretRiteActiveAfterSkill: "元素スキル使用後に魔導秘儀が有効",
        attackingEnemyAffectedBySuperconductOrLunarSuperconduct: "超電導または月感電の影響を受けた敵を攻撃"
    };

    const COMMON_CONDITION_LABELS = {
        always: "常時",
        active: "効果の発動中",
        conditional: "効果固有の発動条件を満たす",
        stateActive: "固有状態の発動中",
        specialCondition: "武器固有の発動条件を満たす",
        constellationUnlocked: "対象の命ノ星座を解放",
        passiveUnlocked: "対象の固有天賦を解放",
        afterCast: "対象の攻撃を発動した後",
        afterHit: "対象の攻撃が命中した後",
        onHit: "対象の攻撃が命中した時",
        afterTalentUse: "対象の天賦を使用した後",
        afterBurstHit: "元素爆発が命中した後",
        afterNormalAttackHit: "通常攻撃が命中した後",
        afterNormalOrChargedHit: "通常攻撃または重撃が命中した後",
        afterElementalReaction: "元素反応を起こした後",
        afterSkillCast: "元素スキルを発動した後",
        afterSkillOrBurst: "元素スキルまたは元素爆発を発動した後",
        afterSkillOrBurstConsumesMarks: "元素スキルまたは元素爆発で印を消費した後",
        afterSwirl: "拡散反応を起こした後",
        afterCrystallize: "結晶反応を起こした後",
        afterQuickenAggravateSpread: "激化系反応を起こした後",
        hpChanged: "HPが増減した後",
        hpCondition: "指定されたHP条件を満たす",
        hpAtLeast90: "HPが90%以上",
        hpBelow50: "HPが50%未満",
        shielded: "シールド状態",
        onField: "フィールド上にいる間",
        nearbyPartyActive: "付近にチームメンバーがいる時",
        duringBurst: "元素爆発の継続中",
        duringSkill: "元素スキルの継続中",
        insideBurstField: "元素爆発の領域内",
        insideBurstFieldForMeleeCharacters: "元素爆発の領域内に近接武器キャラがいる時",
        onBurstCast: "元素爆発を発動した時",
        onSkillCast: "元素スキルを発動した時",
        onShieldBrokenOrReplaced: "シールドが破壊または更新された時",
        arrowFlightTime: "矢の飛翔時間に応じて適用",
        fourWindsPoemStacks: "四風の詩の段階に応じて適用",
        fourWindsPoemStacksAndMagicSecretActive: "四風の詩の段階があり、魔導秘儀が発動中",
        burstSummonDamage: "元素爆発の召喚物によるダメージ",
        exquisiteThrowCoordinatedAttack: "「虹剣勢」の連携攻撃時",
        enemyHitByBurst: "元素爆発が命中した敵を攻撃",
        lastNormalAttackDuringBurst: "元素爆発中の通常攻撃最終段",
        normalOrChargedAttackTriggersIcyQuill: "通常攻撃または重撃で氷翎を発動",
        moonsignFullIllumination: "月兆が満照状態",
        afterLunarResonance: "月共鳴を起こした後",
        afterMoonReactionInMoonField: "月の領域内で月反応を起こした後",
        activeCharacterNA_CA_PA_HitWhileRingActive: "越祓草輪を受けたフィールド上キャラの通常攻撃・重撃・落下攻撃が命中した時",
        afterEnteringGaleState: "疾風怒濤状態に入った時",
        cangyaOathActive: "疾風怒濤状態で追加の「蒼牙」または「出づる四風」を発動した時",
        convictionActive: "「正論」効果が付与されている時",
        duringBurstMusouIsshinOrSecretArt: "元素爆発「夢想の一心」状態中",
        duringCraneCloudTransmogrification: "「鶴雲幻化」状態中",
        galeStateShortWindow: "「出づる四風」または「蒼牙」発動後の短時間",
        graciousRebukeActive: "「恩典の戒め」を獲得している時",
        guidanceBlessing: "対象キャラが「導きの加護」を持っている時",
        lifelineExplosionPerEnemyMarked: "「命の糸」が爆発した時",
        lumiMegatonHammerInFinalTrickMode: "ルミが「さいごのきりふだ形態」で100万トンハンマーを使用した時",
        mirrorGeneratedAtLimit: "琢光鏡が上限の状態で、新たに琢光鏡を生成した時",
        nextShunsuikenAfterSkill: "神里流・鏡花発動後、次の瞬水剣が敵に命中した時",
        onCeremonialCrystalshotCast: "セレモニアル・クリスタルショットを発動した時",
        onCeremonialCrystalshotCastWithMoreThan3Shards: "裂晶の欠片を4個以上消費してセレモニアル・クリスタルショットを発動した時",
        onChiselLightMirrorGenerated: "琢光鏡を生成した時",
        onHeartstopperStrikeCast: "戮心拳を発動した時",
        passiveTranscendenceActive: "固有天賦「理の超越」で「極悪技・斬」を獲得している時",
        perCoolingBeamFiredInCalculationMode: "同じ「演算」モード中に冷却ビームを発射するたび",
        rebukeVaultingFist: "誅罰・ヴォールティングアッパーを発動した時",
        rebukeVaultingFistCast: "誅罰・ヴォールティングアッパーを発動した時",
        rebukeVaultingFistHitsDuringChillingPenalty: "烈霜の懲戒状態中に誅罰・ヴォールティングアッパーが命中した時",
        secretLawCountActive: "「秘律カウント」を獲得している時",
        sesshouSakuraDamage: "殺生櫻が攻撃する時",
        sevenPhaseMode: "「七相一閃」モード中",
        skillCastOrLunarResonance: "元素スキル「ルミのやっふー作戦」または月籠の共鳴が発動した時",
        spiritConversionEligibleTeamElement: "チームにスピリット転化の元素条件を満たすキャラがいる時",
        stardriveChargedBeam: "輝映・星電導の重撃で冷却ビームを発射した時",
        usuhiButouActive: "「薄氷の舞」状態中",
        whenLiteratureResearchConsumed: "「文献調査」を消費する時",
        whenPartyMemberDealsLunarCrystallizeDamage: "近くのチームメンバーが月結晶反応ダメージを与えた時",
        hpChangedDuringChillingPenalty: "HPが増減し、「烈霜の懲戒」状態中",
        adeptalAssistanceRemaining: "「竹星」の補助仙力が残っている時",
        fewerThanTwoConvertedSourceSamples: "元素変化した「サンプル音源」が2つ未満の時"
    };

    function conditionLabelForKey(condition, sourceName = "") {
        if (["active", "stateActive"].includes(condition) && sourceName) return `「${sourceName}」が発動中`;
        if (["conditional", "specialCondition"].includes(condition) && sourceName) return `「${sourceName}」の発動条件を満たす`;
        if (["afterCast", "afterTalentUse"].includes(condition) && sourceName) return `「${sourceName}」を発動した後`;
        if (condition === "afterHit" && sourceName) return `「${sourceName}」が命中した後`;
        if (condition === "onHit" && sourceName) return `「${sourceName}」が命中した時`;
        return ARTIFACT_CONDITION_LABELS[condition] || COMMON_CONDITION_LABELS[condition] || "";
    }

    function hpConditionLabelFromText(sourceText, modifier = {}) {
        const text = normalizeConditionDescription(sourceText);
        const sentences = text.split(/[。\n]/).map((sentence) => sentence.trim()).filter(Boolean);
        const value = Number(modifier.value);
        const valueToken = Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value}%` : "";
        const candidates = sentences.map((sentence) => {
            const match = sentence.match(/(?:現在)?HP(?:上限)?が(?:上限の)?\s*(\d+(?:\.\d+)?)%\s*(以上|以下|未満|を超えている|を超える)/);
            if (!match) return null;
            let score = 0;
            if (valueToken && sentence.includes(valueToken)) score += 4;
            modifierTargetLabels(modifier).forEach((label) => {
                if (sentence.includes(label)) score += 1;
            });
            return { match, score };
        }).filter(Boolean).sort((left, right) => right.score - left.score);
        const match = candidates[0]?.match;
        if (!match) return "";
        const comparator = match[2] === "を超えている" || match[2] === "を超える" ? "を超えている" : match[2];
        return comparator.startsWith("を")
            ? `HPが${match[1]}%${comparator}時`
            : `HPが${match[1]}%${comparator}の時`;
    }

    function conditionLabelFromSourceText(sourceText) {
        const text = normalizeConditionDescription(sourceText).replace(/^(?:また、|は)/, "");
        if (!text) return "";
        const match = text.match(/^(.{1,96}?(?:した時|する時|した後|する際|すると|している時|状態の時|状態中|継続中|存在する場合|以上の時|以下の時|時))(?:、|。|$)/);
        return match ? match[1] : "";
    }

    function modifierActivationCondition(modifier, controls = [], artifactPolicy = null, sourceName = "", sourceDescription = "") {
        if (modifier.display?.activationCondition) return modifier.display.activationCondition;
        if (modifier.activationCondition) return modifier.activationCondition;
        if (modifier.activation?.label) return modifier.activation.label;
        if (artifactPolicy?.label) return artifactPolicy.label;
        const condition = modifier.condition || "always";
        if (modifier.conditionLabel && modifier.conditionLabelKind !== "generated") return modifier.conditionLabel;
        if (condition === "hpCondition") {
            const hpLabel = hpConditionLabelFromText(modifier.sourceText || sourceDescription, modifier);
            if (hpLabel) return hpLabel;
        }
        if (["conditional", "specialCondition"].includes(condition)) {
            const sourceLabel = conditionLabelFromSourceText(modifier.sourceText || sourceDescription);
            if (sourceLabel) return sourceLabel;
        }
        const semanticLabel = conditionLabelForKey(condition, sourceName);
        if (semanticLabel) return semanticLabel;
        const controlLabels = controls.map((control) => control.label).filter(Boolean);
        if (controlLabels.length) return [...new Set(controlLabels)].join("／");
        if (modifier.conditionLabel) return modifier.conditionLabel;
        if (/^after/.test(condition)) return "対象効果の発動後";
        if (/^(during|inside)/.test(condition)) return "対象効果の継続中";
        if (/^(on|when)/.test(condition)) return "対象効果が発生した時";
        return "効果固有の発動条件を満たす";
    }

    function modifierEffectSummary(modifier, context) {
        if (modifier.display?.effectSummary) return modifier.display.effectSummary;
        if (modifier.effectSummary) return modifier.effectSummary;
        const targets = modifierTargetLabels(modifier);
        const targetCategories = new Set(["damageBonus", "reactionBonus", "reactionCritBonus", "critBonus", "statBonus"]);
        const label = targetCategories.has(modifier.category) && targets.length
            ? targets.join("・")
            : modifierImpactLabel(modifier);
        if (modifier.customCalculation === "thresholdStatBonus" && modifier.reference?.stat) {
            const per = Number(modifier.ratio) || 0;
            const divisor = Number(modifier.divisor) || 1;
            const max = Number(modifier.maxValue);
            const referenceLabel = STAT_LABELS[modifier.reference.stat] || "参照ステータス";
            return `${label}：${referenceLabel}${divisor}ごとに+${per}${Number.isFinite(max) ? `（最大+${max}）` : ""}`;
        }
        if (modifier.valueByRefinementPerStack || modifier.valueByRefinementPerConsumedStack) {
            const values = modifier.valueByRefinementPerStack || modifier.valueByRefinementPerConsumedStack;
            const perStack = Number(values[String(context.refinement)] ?? values["1"]);
            const maxStack = Number(modifier.stack?.max);
            if (Number.isFinite(perStack)) {
                const maxValue = Number.isFinite(maxStack) ? perStack * maxStack : null;
                return `${label}：+${perStack}%／層${maxValue === null ? "" : `（最大+${maxValue}%）`}`;
            }
        }
        if (modifier.calculationSupport === "stack" && Number.isFinite(Number(modifier.value))) {
            const perStack = Number(modifier.value);
            const maxStack = Number(modifier.stack?.max);
            const maxValue = Number.isFinite(maxStack) ? perStack * maxStack : null;
            return `${label}：+${perStack}%／層${maxValue === null ? "" : `（最大+${maxValue}%）`}`;
        }
        const value = structuredImpactValue(modifier, context);
        return value ? `${label}：${value}` : label;
    }

    function sourceAwareActivationCondition(effect, sourceName, sourceDescription = "") {
        const current = String(effect.activationCondition || "");
        if (!/(?:指定されたHP条件|対象の攻撃|対象の天賦|効果固有の発動条件|固有状態の発動中|武器固有の発動条件)/.test(current)) return current;
        if (effect.modifier?.condition === "hpCondition") {
            const hpLabel = hpConditionLabelFromText(effect.modifier.sourceText || sourceDescription, effect.modifier);
            if (hpLabel) return hpLabel;
        }
        return conditionLabelForKey(effect.modifier?.condition || "always", sourceName) || current;
    }

    function artifactConditionPolicy(modifier, source, context, calcData) {
        const sourceInfo = parseSource(source);
        if (!["artifact2", "artifact4"].includes(sourceInfo.type)) return null;
        const condition = modifier.condition || "always";
        const label = modifier.conditionLabel
            || ARTIFACT_CONDITION_LABELS[condition]
            || COMMON_CONDITION_LABELS[condition]
            || "効果固有の発動条件を満たす";
        const uidHandling = window.GenshinModifierAnalyzer?.effectiveUidHandling
            ? window.GenshinModifierAnalyzer.effectiveUidHandling(modifier)
            : modifier.uidHandling;
        if (uidHandling === "includedInUidStats") {
            return { policy: "reflected", enabled: false, label, reason: "計算入力欄のステータスに反映済みです。再加算しません。" };
        }
        if (condition === "always") {
            return { policy: "automatic", enabled: true, label: "常時適用", reason: "4セット選択時に自動適用します。" };
        }
        if (ARTIFACT_DERIVED_CONDITIONS.has(condition)) {
            const weaponType = readWeaponType(context, calcData);
            let enabled = true;
            if (condition === "weaponTypeCatalystOrBow") enabled = ["弓", "法器"].includes(weaponType);
            if (condition === "weaponTypeSwordClaymorePolearm") enabled = ["片手剣", "両手剣", "長柄武器"].includes(weaponType);
            const reason = condition === "chargedAttack"
                ? "重撃の計算結果だけへ自動適用します。"
                : enabled ? `現在の武器種「${weaponType || "未選択"}」が条件を満たすため自動適用します。`
                    : `現在の武器種「${weaponType || "未選択"}」は条件を満たしません。`;
            return { policy: "derived", enabled, label, reason };
        }
        if (modifier.calculationSupport === "stack" && modifier.stack) {
            const stackLabel = {
                sameElementTeammates: "装備者と同じ元素タイプのチームメンバー数",
                differentElementTeammates: "装備者と異なる元素タイプのチームメンバー数"
            }[modifier.stack.type] || label;
            return { policy: "stack", enabled: false, label: stackLabel, reason: "現在の段階・人数を指定してください。0は未発動です。" };
        }
        return { policy: "userToggle", enabled: false, label, reason: "戦闘中の状態に合わせて指定してください。" };
    }

    function userEnabledConstellation(sourceInfo, context) {
        return Boolean(context.uiState.constellationConditions?.[sourceInfo.id]);
    }

    function supportsConstellationToggle(modifier, sourceInfo, context) {
        if (sourceInfo.type !== "constellation") return false;
        return USER_TOGGLE_CATEGORIES.has(modifier.category);
    }

    function shortSourceText(text) {
        return String(text || "")
            .replace(/\s+/g, " ")
            .replace(/。.*$/, "。")
            .slice(0, 42);
    }

    function categoryLabel(category) {
        const labels = {
            additiveBaseDamage: "基礎ダメージ加算",
            critBonus: "会心補正",
            damageBonus: "ダメージバフ",
            defenseDebuff: "防御デバフ",
            defenseIgnore: "防御無視",
            effectOverride: "効果上書き",
            elementOverride: "元素変化",
            extraDamage: "追加ダメージ",
            reactionBonus: "元素反応補正",
            resistanceDebuff: "耐性デバフ",
            resourceCostOverride: "専用効果の消費量変更",
            resourceEffect: "専用効果の獲得・消費",
            resourceGeneratedEffect: "専用効果の獲得",
            scalingBonus: "参照ステータス補正",
            statConversion: "ステータス変換",
            statBonus: "ステータス補正"
        };
        return labels[category] || category || "補正";
    }

    const TARGET_LABELS = {
        normalAttack: "通常攻撃",
        normalAttackDamage: "通常攻撃",
        normalAttackDamageBonus: "通常攻撃",
        chargedAttack: "重撃",
        chargedAttackDamage: "重撃",
        chargedAttackDamageBonus: "重撃",
        plungingAttack: "落下攻撃",
        plungingAttackDamage: "落下攻撃",
        plungingAttackDamageBonus: "落下攻撃",
        skill: "元素スキル",
        skillDamage: "元素スキル",
        skillDamageBonus: "元素スキル",
        burst: "元素爆発",
        burstDamage: "元素爆発",
        burstDamageBonus: "元素爆発",
        allDamageBonus: "すべてのダメージ",
        allElementDamageBonus: "元素ダメージ",
        ownElementDamageBonus: "装備者の元素ダメージ",
        geoDamageBonus: "岩元素ダメージ",
        enemyDefense: "敵の防御力",
        correspondingElementResistance: "対応元素の耐性",
        elementalMastery: "元素熟知",
        atkPercent: "攻撃力",
        hpPercent: "HP上限",
        defPercent: "防御力",
        critRate: "会心率",
        critDamage: "会心ダメージ",
        reactionCrit: "元素反応の会心",
        lunarBloomCrit: "月開花反応の会心",
        reactionDamageBonus: "元素反応ダメージ",
        lunarCrystallizeDamageBonus: "月結晶反応ダメージ",
        triggeredDamage: "追加ダメージ",
        burstTalentLevel: "元素爆発の天賦レベル",
        skillTalentLevel: "元素スキルの天賦レベル",
        normalAttackTalentLevel: "通常攻撃の天賦レベル",
        talentLevel: "天賦レベル",
        resourceState: "専用効果の状態",
        effect: "固有効果",
        mark: "専用マーク",
        special: "特殊効果",
        atk: "攻撃力",
        atkFlat: "攻撃力",
        hpFlat: "HP上限",
        defFlat: "防御力",
        energyRecharge: "元素チャージ効率",
        outgoingHealingBonus: "与える治療効果",
        hydroDamageBonus: "水元素ダメージ",
        pyroDamageBonus: "炎元素ダメージ",
        electroDamageBonus: "雷元素ダメージ",
        cryoDamageBonus: "氷元素ダメージ",
        anemoDamageBonus: "風元素ダメージ",
        dendroDamageBonus: "草元素ダメージ",
        physicalDamageBonus: "物理ダメージ",
        correspondingElementDamageBonus: "対応元素ダメージ",
        correspondingSwirledElementDamageBonus: "拡散した元素のダメージ",
        swirledElementDamageBonus: "拡散した元素",
        ownAndActiveCharacterElementDamageBonus: "装備者とフィールド上キャラの元素ダメージ",
        bloomDamageBonus: "開花反応ダメージ",
        hyperbloomDamageBonus: "超開花反応ダメージ",
        burgeonDamageBonus: "烈開花反応ダメージ",
        burningDamageBonus: "燃焼反応ダメージ",
        swirlDamageBonus: "拡散反応ダメージ",
        overloadedDamageBonus: "過負荷反応ダメージ",
        superconductDamageBonus: "超電導反応ダメージ",
        electroChargedDamageBonus: "感電反応ダメージ",
        vaporizeDamageBonus: "蒸発反応ダメージ",
        meltDamageBonus: "溶解反応ダメージ",
        aggravateDamageBonus: "超激化反応ダメージ",
        lunarChargedDamageBonus: "月感電反応ダメージ",
        lunarBloomDamageBonus: "月開花反応ダメージ",
        lunarSuperconductDamageBonus: "星電導反応ダメージ",
        astralConductionDamageBonus: "星電導反応ダメージ",
        moonReactionDamageBonus: "月反応ダメージ",
        reactionRelatedElementDamageBonus: "反応に関連する元素ダメージ",
        physicalResistance: "物理耐性",
        dendroResistance: "草元素耐性",
        electroResistance: "雷元素耐性",
        hydroResistance: "水元素耐性",
        cryoResistance: "氷元素耐性",
        geoResistance: "岩元素耐性",
        anemoResistance: "風元素耐性",
        pyroResistance: "炎元素耐性",
        allResistance: "全元素耐性と物理耐性",
        skillCritRate: "元素スキルの会心率",
        burstCritRate: "元素爆発の会心率",
        normalAttackCritRate: "通常攻撃の会心率",
        plungingAttackCritRate: "落下攻撃の会心率",
        burstCritDamage: "元素爆発の会心ダメージ",
        plungingAttackCritDamage: "落下攻撃の会心ダメージ",
        correspondingElementCritDamage: "対応元素ダメージの会心ダメージ",
        burningCrit: "燃焼反応の会心",
        bloomCrit: "開花反応の会心",
        hyperbloomCrit: "超開花反応の会心",
        burgeonCrit: "烈開花反応の会心",
        swirlCrit: "拡散反応の会心",
        lunarChargedDamage: "月感電反応ダメージ",
        lunarCrystallizeDamage: "月結晶反応ダメージ",
        physicalDamage: "物理ダメージ",
        fatalReckoning: "「死生の辻」の効果",
        fatalBlossomDamage: "「死生の辻」の追加ダメージ",
        bloodBlossomDamage: "血梅香ダメージ",
        skillSummonDamageBonus: "元素スキル召喚物のダメージ",
        frostyMantra: "氷翎効果",
        icyQuillTriggerCount: "氷翎の発動回数",
        chiselLightMirror: "琢光鏡",
        spiritveinDamage: "霊脈ダメージ",
        graciousRebuke: "恩典の戒め",
        rebukeVaultingFist: "誅罰・ヴォールティングアッパー",
        chillingPenaltyDuration: "烈霜の懲戒の継続時間",
        shockwaveCritDamage: "衝撃波の会心ダメージ",
        secretLawCount: "秘律カウント",
        ultimateSkillSlash: "元素爆発の斬撃",
        chargedAttackDamage: "重撃ダメージ",
        specialChargedAttack: "特殊重撃",
        specialSkill: "特殊元素スキル",
        lunarResonance: "月籠の共鳴",
        literatureResearch: "文献調査",
        previousDamageBonusMultiplier: "直前のダメージアップ効果"
    };

    const STAT_LABELS = {
        atk: "攻撃力",
        hp: "HP上限",
        def: "防御力",
        elementalMastery: "元素熟知"
    };

    const RESOURCE_LABELS = {
        unityOrStalwartMark: "強靭マーク",
        fatalReckoning: "死生の辻",
        declension: "変格",
        frostyMantra: "氷翎",
        icyQuill: "氷翎",
        chiselLightMirror: "琢光鏡",
        prosecutionEdict: "抵罪の赦免",
        crystalShrapnel: "裂晶の欠片",
        sourceResource: "専用効果",
        secretLawCount: "秘律カウント",
        ultimateSkillSlash: "極悪技・斬",
        praisedWine: "謳われる美酒",
        cangyaOath: "蒼牙の誓い",
        literatureResearch: "文献調査",
        lunarResonance: "月籠の共鳴"
    };

    function modifierTargetLabels(modifier) {
        const labels = (modifier.applyTo || []).map(targetLabel).filter(Boolean);
        return [...new Set(labels)];
    }

    function targetLabel(target) {
        return TARGET_LABELS[target] || "対象効果";
    }

    function modifierImpactLabel(modifier) {
        if (modifier.category === "elementOverride") {
            const attackModeTargets = modifierTargetLabels(modifier);
            const attackModeTargetText = attackModeTargets.length ? attackModeTargets.join("・") : "対象攻撃";
            return `攻撃モード: ${attackModeTargetText}を${modifier.value || "指定"}元素に変化`;
        }
        const explicitResourceName = /[\u3040-\u30ff\u3400-\u9fff]/.test(String(modifier.resource?.nameJa || ""))
            ? modifier.resource.nameJa
            : "";
        const resourceName = explicitResourceName || RESOURCE_LABELS[modifier.resource?.id] || "専用効果";
        if (["resourceEffect", "resourceGeneratedEffect", "resourceCostOverride"].includes(modifier.category)) {
            return `専用効果「${resourceName}」の獲得・消費`;
        }
        if (modifier.trigger === "onTakingDamageInSevenPhaseMode") {
            if (modifier.category === "extraDamage") return "被弾時の反撃";
        }
        const targets = modifierTargetLabels(modifier);
        const targetText = targets.length ? targets.join("・") : "対象ダメージ";
        if (modifier.category === "extraDamage") return `${targetText}の追加ダメージ`;
        if (modifier.category === "critBonus" || modifier.category === "reactionCritBonus") return `${targetText}の会心補正`;
        if (modifier.category === "damageBonus" || modifier.category === "reactionBonus") return `${targetText}のダメージ補正`;
        if (modifier.category === "defenseDebuff") return "敵の防御力低下";
        if (modifier.category === "defenseIgnore") return "敵の防御力無視";
        if (modifier.category === "resistanceDebuff") return `${targetText}低下`;
        if (modifier.category === "statBonus" || modifier.category === "statConversion") return `${targetText}のステータス補正`;
        if (modifier.category === "additiveBaseDamage") return `${targetText}の基礎ダメージ加算`;
        if (modifier.category === "scalingBonus") {
            return (modifier.applyTo || []).some((target) => /DamageBonus$/.test(target))
                ? `${targetText}のダメージ補正`
                : `${targetText}の参照ステータス補正`;
        }
        if (modifier.category === "elementOverride") return `${targetText}の元素変化`;
        if (modifier.category === "effectOverride") return `${targetText}の効果変更`;
        return "計算補正";
    }

    function structuredImpactValue(modifier, context) {
        if (Array.isArray(modifier.scalings) && modifier.scalings.length) {
            const parts = modifier.scalings.map((scaling) => {
                const stat = STAT_LABELS[scaling.stat] || scaling.stat || "参照値";
                if (Number.isFinite(Number(scaling.valuePerStack))) return `${stat}${Number(scaling.valuePerStack)}% × 入力層数`;
                if (Number.isFinite(Number(scaling.value))) return `${stat}${Number(scaling.value)}%`;
                return "";
            }).filter(Boolean);
            const hitCount = Number(modifier.hitCount);
            if (parts.length) return `${parts.join(" + ")}${Number.isFinite(hitCount) && hitCount > 1 ? ` × ${hitCount}回` : ""}`;
        }
        if (["resourceEffect", "resourceGeneratedEffect"].includes(modifier.category) && modifier.resource) {
            const gain = Number(modifier.resource.gain);
            const max = Number(modifier.resource.max ?? modifier.stack?.max);
            const pieces = [];
            if (Number.isFinite(gain)) pieces.push(`1回につき${gain}層獲得`);
            if (Number.isFinite(max)) pieces.push(`最大${max}層`);
            return pieces.join(" / ");
        }
        return modifierDisplayValue(modifier, context);
    }

    function plainConstellationText(text) {
        return String(text || "").replace(/\*\*/g, "");
    }

    function normalizeConditionDescription(text) {
        return String(text || "")
            .replace(/\*\*/g, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function analyzeModifier(modifier, source = "", context = {}) {
        if (!window.GenshinModifierAnalyzer) {
            throw new Error("GenshinModifierAnalyzer が読み込まれていません");
        }
        return window.GenshinModifierAnalyzer.analyzeModifier({ modifier, source, context });
    }

    let activeConditionDefinitions = [];
    let conditionStateByModifier = {};
    let activeResourceDefinitions = [];
    let resourceStateByKey = {};
    let activeComplexDefinitions = [];
    let complexStateByKey = {};

    function collectSelectedModifiers(context, calcData) {
        const selected = [];
        const add = (modifier, source, display = {}, modifierIndex = 0) => {
            const talentNormalized = window.GenshinCalcEngine?.normalizeTalentStateModifier
                ? window.GenshinCalcEngine.normalizeTalentStateModifier(modifier, source, calcData, context, modifierIndex)
                : modifier;
            const normalized = window.GenshinCalcEngine?.normalizeArtifactModifier
                ? window.GenshinCalcEngine.normalizeArtifactModifier(talentNormalized, source)
                : talentNormalized;
            if (!normalized.syntheticAttackMode && (normalized.attackModeEncodedInScaling || normalized.attackModeConflict)) return;
            selected.push({ modifier: normalized, source, ...display });
        };
        const talentPassives = calcData.talentModifiers?.[context.characterId]?.passives || [];
        const talentDisplays = calcData.characterTalents?.[context.characterId]?.passives || [];
        talentPassives.forEach((passive) => {
            const normalizedSourceId = String(passive.sourceId || "").replace(/_/g, "");
            const display = talentDisplays.find((item) => String(item.sourceId || "").replace(/_/g, "") === normalizedSourceId) || {};
            (passive.modifiers || []).forEach((modifier, modifierIndex) => add(modifier, `talent:${passive.sourceId || context.characterId}`, {
                sourceName: display.nameJa || "",
                sourceDescription: display.descriptionJa || ""
            }, modifierIndex));
        });
        (window.GenshinCalcEngine?.buildAttackModeDefinitions?.(calcData, context) || []).forEach((mode) => {
            add({
                id: `attack_mode_${context.characterId}_${mode.group}`,
                category: "elementOverride",
                applyTo: mode.attackTypes,
                value: mode.element,
                unit: "element",
                condition: "active",
                calculationSupport: "toggle",
                uidHandling: "conditional",
                conditionGroupId: mode.conditionGroupId,
                syntheticAttackMode: true,
                attackModeStateName: mode.stateName,
                attackModeGroup: mode.group
            }, `talent:${mode.sourceId}`, {
                sourceName: mode.sourceName,
                sourceDescription: mode.sourceDescription
            });
        });
        const weaponModifiers = calcData.weaponModifiers?.[context.weaponId]?.modifiers || [];
        const weaponDefinition = calcData.weaponEffectRegistry?.weapons?.[context.weaponId] || {};
        weaponModifiers.forEach((modifier) => {
            const normalized = window.GenshinCalcEngine?.normalizeWeaponModifier
                ? window.GenshinCalcEngine.normalizeWeaponModifier(modifier, weaponModifiers, weaponDefinition)
                : modifier;
            add(normalized, `weapon:${context.weaponId}`, {
                sourceName: calcData.weapons?.[context.weaponId]?.nameJa || "武器効果"
            });
        });
        (context.artifactSetIds || []).forEach((setId, index) => {
            const artifact = calcData.artifactSetModifiers?.[setId] || {};
            (artifact.twoPiece || []).forEach((modifier) => add(modifier, `artifact2:${setId}`, {
                sourceDescription: calcData.artifactSetEffects?.[setId]?.twoPieceEffect || ""
            }));
            if (context.artifactSetMode === "4pc" && index === 0) {
                (artifact.fourPiece || []).forEach((modifier) => add(modifier, `artifact4:${setId}`, {
                    sourceDescription: calcData.artifactSetEffects?.[setId]?.fourPieceEffect || ""
                }));
            }
        });
        const constellations = calcData.constellationModifiers?.[context.characterId]?.constellations || {};
        for (let level = 1; level <= context.constellation; level += 1) {
            (constellations[String(level)] || [])
                .forEach((modifier) => add(modifier, `constellation:C${level}`));
        }
        return selected;
    }

    function conditionUiGroup(modifier, source, context) {
        const sourceInfo = parseSource(source);
        const condition = modifier.condition || "always";
        if (condition === "arrowFlightTime") return "amosStack";
        if (condition === "hpCondition") return "lowHp";
        if (sourceInfo.type === "constellation" && supportsConstellationToggle(modifier, sourceInfo, context)) {
            return `constellation:${sourceInfo.id}`;
        }
        if (sourceInfo.type === "artifact4" && sourceInfo.id === "15006" && condition === "afterSkill") {
            return "crimsonWitchStack";
        }
        if (sourceInfo.type === "artifact4" || sourceInfo.type === "artifact2") return "";
        if (sourceInfo.type === "weapon") {
            return "equipment";
        }
        if (sourceInfo.type === "talent") return "character";
        return "";
    }

    function stateFromUiGroup(group, uiState) {
        if (group === "character") return { enabled: Boolean(uiState.enableCharacterCondition), stack: 0, option: "" };
        if (group === "lowHp") return { enabled: Boolean(uiState.enableLowHpCondition), stack: 0, option: "" };
        if (group === "equipment") return { enabled: Boolean(uiState.enableWeaponLowHpCondition), stack: 0, option: "" };
        if (group === "amosStack") {
            const stack = Number(uiState.amosStack) || 0;
            return { enabled: stack > 0, stack, option: "" };
        }
        if (group === "crimsonWitchStack") {
            const stack = Number(uiState.crimsonWitchStack) || 0;
            return { enabled: stack > 0, stack, option: "" };
        }
        if (group.startsWith("constellation:")) {
            const level = group.slice("constellation:".length);
            return { enabled: Boolean(uiState.constellationConditions?.[level]), stack: 0, option: "" };
        }
        return null;
    }

    function buildConditionDefinitions(context, calcData) {
        return collectSelectedModifiers(context, calcData).reduce((definitions, item) => {
            const analysis = analyzeModifier(item.modifier, item.source, context);
            if (!analysis.requiresConditionEvaluation || analysis.condition === "always") return definitions;
            definitions.push({
                ...item,
                modifier: { ...item.modifier, condition: analysis.condition },
                key: analysis.conditionStateKey,
                group: conditionUiGroup(item.modifier, item.source, context),
                artifactPolicy: artifactConditionPolicy(item.modifier, item.source, context, calcData)
            });
            return definitions;
        }, []);
    }

    function captureActiveConditionState(uiState) {
        activeConditionDefinitions.forEach((definition) => {
            if (Object.prototype.hasOwnProperty.call(uiState.toggleByModifier || {}, definition.key)) {
                conditionStateByModifier[definition.key] = {
                    ...(conditionStateByModifier[definition.key] || { stack: 0, option: "" }),
                    enabled: Boolean(uiState.toggleByModifier[definition.key])
                };
                return;
            }
            const uiValue = stateFromUiGroup(definition.group, uiState);
            if (uiValue) conditionStateByModifier[definition.key] = uiValue;
        });
    }

    function buildResourceInputDefinitions(context, calcData) {
        const definitions = new Map();
        collectSelectedModifiers(context, calcData).forEach(({ modifier, source }) => {
            const analysis = analyzeModifier(modifier, source, context);
            if (analysis.resourceClassification !== "calculationInput") return;
            const key = analysis.resourceStateKey;
            const existing = definitions.get(key);
            const min = Number(modifier.stack?.min ?? 0);
            const maxRaw = modifier.stack?.max ?? modifier.resource?.max;
            const max = Number.isFinite(Number(maxRaw)) ? Number(maxRaw) : null;
            const resourceName = modifier.resource?.nameJa || modifier.resource?.id || "専用リソース";
            definitions.set(key, {
                key,
                id: modifier.resource?.id || modifier.id || "",
                label: `${resourceName}の現在層数`,
                help: `現在の所持数を入力します。${max === null ? "この値を参照する効果の計算に使用します。" : `入力範囲は${min}～${max}層です。`}`,
                unit: "層",
                min: existing ? Math.min(existing.min, min) : min,
                max: existing?.max ?? max,
                source
            });
        });
        return [...definitions.values()];
    }

    function reconcileResourceState(context, calcData) {
        const incoming = context.manualInputs?.resourceStates || {};
        activeResourceDefinitions.forEach((definition) => {
            if (Number.isFinite(Number(incoming[definition.key]))) {
                resourceStateByKey[definition.key] = Number(incoming[definition.key]);
            }
        });
        const definitions = buildResourceInputDefinitions(context, calcData);
        const nextState = {};
        definitions.forEach((definition) => {
            const incomingValue = incoming[definition.key];
            const storedValue = resourceStateByKey[definition.key];
            const value = Number.isFinite(Number(incomingValue)) ? incomingValue : storedValue;
            if (!Number.isFinite(Number(value))) return;
            const raw = Number(value);
            nextState[definition.key] = Math.min(
                Math.max(raw, definition.min),
                definition.max === null ? Number.POSITIVE_INFINITY : definition.max
            );
        });
        activeResourceDefinitions = definitions;
        resourceStateByKey = nextState;
        context.manualInputs.resourceStates = { ...nextState };
        return definitions.map((definition) => ({
            ...definition,
            value: nextState[definition.key] ?? null
        }));
    }

    function buildComplexConditionDefinitions(context, calcData) {
        const definitions = collectSelectedModifiers(context, calcData).flatMap(({ modifier, source }) => {
            if (modifier.resource) return [];
            if (modifier.condition === "arrowFlightTime") return [];
            if (source === "artifact4:15006" && modifier.condition === "afterSkill") return [];
            const analysis = analyzeModifier(modifier, source, context);
            if (analysis.inputStatus !== "applicable") return [];
            const configured = modifier.conditionInput;
            const conditionGroupId = modifier.conditionGroupId || modifier.activation?.stateKey || modifier.effectGroupId || "";
            const stableConditionKey = conditionGroupId
                ? `${source}:group:${conditionGroupId}`
                : analysis.conditionStateKey;
            const hasImplicitStackContract = modifier.calculationSupport === "stack"
                || Boolean(modifier.valueByRefinementPerStack)
                || Boolean(modifier.valueByRefinementPerConsumedStack)
                || Boolean(modifier.valueByStack)
                || Boolean(modifier.effectiveAdditionalValuePerStack)
                || (modifier.scalings || []).some((scaling) => Number.isFinite(Number(scaling.valuePerStack)));
            const numericStack = hasImplicitStackContract && modifier.stack
                && Number.isFinite(Number(modifier.stack.min))
                && Number.isFinite(Number(modifier.stack.max));
            if (!configured && !numericStack) return [];
            const type = configured?.type || "stack";
            return [{
                key: stableConditionKey,
                modifierId: modifier.id || "",
                label: configured?.label || `${categoryLabel(modifier.category)}: ${shortSourceText(modifier.sourceText)}`,
                help: configured?.help || (type === "option" ? "適用する状態を選択します。" : "この効果の現在の段階・回数を入力します。"),
                unit: configured?.unit || (type === "stack" ? "段" : ""),
                type,
                min: Number(configured?.min ?? modifier.stack?.min ?? 0),
                max: Number(configured?.max ?? modifier.stack?.max ?? 0),
                options: configured?.options || [],
                configured: Boolean(configured),
                source,
                modifier,
                conditionGroupId
            }];
        });
        return definitions.filter((definition, index) => {
            return definitions.findIndex((candidate) => candidate.key === definition.key) === index;
        });
    }

    function reconcileComplexConditionState(context, calcData) {
        const incoming = context.uiState.complexConditionByModifier || {};
        activeComplexDefinitions.forEach((definition) => {
            if (incoming[definition.key]) complexStateByKey[definition.key] = { ...incoming[definition.key] };
        });
        const definitions = buildComplexConditionDefinitions(context, calcData);
        const nextState = {};
        definitions.forEach((definition) => {
            const incomingState = incoming[definition.key];
            const storedState = complexStateByKey[definition.key];
            const useConfiguredStackDefault = definition.type === "stack"
                && (definition.configured
                    || String(definition.source).startsWith("artifact")
                    || String(definition.source).startsWith("weapon:"));
            const configuredDefault = useConfiguredStackDefault
                ? { stack: Number.isFinite(Number(definition.modifier?.stack?.default))
                    ? Number(definition.modifier.stack.default)
                    : definition.min }
                : definition.type === "option" && definition.options.length
                    ? { option: typeof definition.options[0] === "object" ? definition.options[0].value : definition.options[0] }
                    : null;
            const state = incomingState || storedState || configuredDefault;
            if (!state) return;
            nextState[definition.key] = { ...state };
            const numericValue = Number(state[definition.type]);
            if (definition.type !== "option" && Number.isFinite(numericValue)) {
                nextState[definition.key][definition.type] = Math.min(Math.max(numericValue, definition.min), definition.max);
            }
        });
        activeComplexDefinitions = definitions;
        complexStateByKey = nextState;
        definitions.forEach((definition) => {
            const state = nextState[definition.key];
            if (!state) return;
            context.uiState.conditionByModifier[definition.key] = {
                ...(context.uiState.conditionByModifier[definition.key] || {}),
                ...state,
                enabled: definition.type === "stack"
                    ? Number(state.stack) > 0
                    : definition.type === "option"
                        ? state.option !== undefined && state.option !== null && state.option !== ""
                        : Number.isFinite(Number(state[definition.type]))
            };
            if (definition.type === "stack" && definition.modifierId) {
                context.uiState.stackByModifier[definition.modifierId] = state.stack;
                context.uiState.resolvedConditionByModifier ||= {};
                context.uiState.resolvedConditionByModifier[definition.modifierId] = state.stack;
                context.uiState.resolvedConditionByGroup ||= {};
                if (definition.conditionGroupId) {
                    context.uiState.resolvedConditionByGroup[definition.conditionGroupId] = state.stack;
                }
                collectSelectedModifiers(context, calcData)
                    .filter((item) => item.source === definition.source
                        && item.modifier?.conditionInput?.type === "stack"
                        && Number(item.modifier?.stack?.max) === Number(definition.max))
                    .forEach((item) => {
                        if (item.modifier.id) context.uiState.resolvedConditionByModifier[item.modifier.id] = state.stack;
                    });
                const selected = collectSelectedModifiers(context, calcData)
                    .find(({ modifier }) => modifier.id === definition.modifierId)?.modifier;
                if (selected?.stack?.id) context.uiState.stackByModifier[selected.stack.id] = state.stack;
            }
        });
        return definitions.map((definition) => ({
            ...definition,
            value: nextState[definition.key]?.[definition.type] ?? null
        }));
    }

    function buildConstellationRows(context, calcData) {
        const constellations = calcData.constellationModifiers?.[context.characterId]?.constellations || {};
        return CONSTELLATION_UI_LEVELS.reduce((rows, cLabel) => {
            const level = Number(cLabel.slice(1));
            const modifiers = constellations[String(level)] || [];
            const visibleModifiers = modifiers.filter((modifier) => {
                if (modifier.uidHandling === "includedInUidTalentLevels") return false;
                if (!supportsConstellationToggle(modifier, { type: "constellation", id: cLabel }, context)) return false;
                const analysis = analyzeModifier(modifier, `constellation:${cLabel}`, context);
                if (modifier.calculationSupport === "custom" || modifier.calculationSupport === "special") {
                    return analysis.calculable || analysis.supportStatus === "missingInput";
                }
                return true;
            });
            const first = visibleModifiers[0];
            rows[cLabel] = {
                visible: context.constellation >= level && visibleModifiers.length > 0,
                label: first
                    ? `${level}C ${categoryLabel(first.category)}: ${shortSourceText(first.sourceText)}`
                    : `${level}C 補正`
            };
            return rows;
        }, {});
    }

    function evaluateLegacyModifierCondition({ modifier, source, context, calcData }) {
        const condition = modifier.condition || "always";
        const sourceInfo = parseSource(source);

        if (condition === "always") {
            return { enabled: true };
        }

        if (condition === "arrowFlightTime") {
            const enabled = sourceInfo.type === "weapon"
                && context.weaponId === "15502"
                && context.uiState.amosStack > 0;
            if (enabled) setModifierStack(context, modifier, context.uiState.amosStack);
            return { enabled };
        }

        if (["hpBelow50", "hpLessThan50"].includes(condition)) {
            return { enabled: sourceInfo.type === "weapon" && context.uiState.enableWeaponLowHpCondition };
        }

        if (condition === "hpCondition") {
            return { enabled: sourceInfo.type === "talent" && context.uiState.enableLowHpCondition };
        }

        if (condition === "weaponTypeCatalystOrBow") {
            const weaponType = readWeaponType(context, calcData);
            return {
                enabled: sourceInfo.type === "artifact4"
                    && sourceInfo.id === "15003"
                    && ["弓", "法器"].includes(weaponType)
            };
        }

        if (condition === "afterSkill") {
            if (sourceInfo.type === "artifact4" && sourceInfo.id === "15006") {
                const enabled = context.uiState.crimsonWitchStack > 0;
                if (enabled) setModifierStack(context, modifier, context.uiState.crimsonWitchStack);
                return { enabled };
            }
            if (sourceInfo.type === "weapon") {
                return { enabled: context.uiState.enableWeaponLowHpCondition };
            }
            if (sourceInfo.type === "talent" || sourceInfo.type === "constellation") {
                return { enabled: context.uiState.enableCharacterCondition };
            }
            return { enabled: context.uiState.enableCharacterCondition };
        }

        if (condition === "active") {
            return {
                enabled: sourceInfo.type === "talent"
                    && context.uiState.enableCharacterCondition
            };
        }

        if ([
            "afterHit",
            "afterNormalAttackHit",
            "afterChargedAttackHit",
            "afterNormalOrChargedHit",
            "afterReaction",
            "afterBurst",
            "afterCrystallize",
            "afterTalentUse",
            "afterSkillOrBurst",
            "afterCast",
            "afterEnteringGaleState",
            "stateActive",
            "duringBurst",
            "chargedAttack",
            "conditional",
            "nearbyPartyActive",
            "moonsignFullIllumination"
        ].includes(condition)) {
            if (sourceInfo.type === "constellation" && supportsConstellationToggle(modifier, sourceInfo, context)) {
                return {
                    enabled: isUnlockedConstellation(sourceInfo.id, context)
                        && userEnabledConstellation(sourceInfo, context)
                };
            }
            if (sourceInfo.type === "weapon" || sourceInfo.type === "artifact4" || sourceInfo.type === "artifact2") {
                return { enabled: context.uiState.enableWeaponLowHpCondition };
            }
            return { enabled: context.uiState.enableCharacterCondition };
        }

        if (condition === "constellationUnlocked") {
            if (!isUnlockedConstellation(sourceInfo.id, context)) {
                return { enabled: false };
            }
            if (supportsConstellationToggle(modifier, sourceInfo, context)) {
                return { enabled: userEnabledConstellation(sourceInfo, context) };
            }
            return { enabled: false };
        }

        if (USER_TOGGLE_CATEGORIES.has(modifier.category)) {
            if (sourceInfo.type === "constellation") {
                return {
                    enabled: isUnlockedConstellation(sourceInfo.id, context)
                        && userEnabledConstellation(sourceInfo, context)
                };
            }
            if (sourceInfo.type === "weapon" || sourceInfo.type === "artifact4" || sourceInfo.type === "artifact2") {
                return { enabled: context.uiState.enableWeaponLowHpCondition };
            }
            if (sourceInfo.type === "talent") {
                return { enabled: context.uiState.enableCharacterCondition };
            }
        }

        return { enabled: false };
    }

    function reconcileConditionState(context, calcData) {
        const hadActiveDefinitions = activeConditionDefinitions.length > 0;
        const incomingState = context.uiState?.conditionByModifier || {};
        captureActiveConditionState(context.uiState || {});
        const definitions = buildConditionDefinitions(context, calcData);
        const nextState = {};
        definitions.forEach((definition) => {
            if (["derived", "automatic", "reflected"].includes(definition.artifactPolicy?.policy)) {
                nextState[definition.key] = {
                    enabled: Boolean(definition.artifactPolicy.enabled),
                    stack: 0,
                    option: ""
                };
                return;
            }
            const previous = incomingState[definition.key] || conditionStateByModifier[definition.key];
            if (previous) {
                nextState[definition.key] = { ...previous };
                return;
            }
            if (hadActiveDefinitions && definition.group) {
                nextState[definition.key] = { enabled: false, stack: 0, option: "" };
                return;
            }
            if (definition.artifactPolicy && !definition.group && hadActiveDefinitions) {
                nextState[definition.key] = { enabled: false, stack: 0, option: "" };
                return;
            }
            const evaluated = evaluateLegacyModifierCondition({
                modifier: definition.modifier,
                source: definition.source,
                context,
                calcData
            });
            nextState[definition.key] = {
                enabled: Boolean(evaluated.enabled),
                stack: Number(context.uiState.stackByModifier?.[definition.modifier.id]) || 0,
                option: ""
            };
        });
        activeConditionDefinitions = definitions;
        conditionStateByModifier = nextState;
        context.uiState.conditionByModifier = Object.fromEntries(
            Object.entries(nextState).map(([key, value]) => [key, { ...value }])
        );
        definitions.forEach((definition) => {
            const state = nextState[definition.key];
            if (state?.stack > 0) setModifierStack(context, definition.modifier, state.stack);
        });
        return context.uiState.conditionByModifier;
    }

    function evaluateModifierCondition({ modifier, source, context, calcData }) {
        if (modifier.requiredTargetElement) {
            const normalizeElement = (value) => ({ "炎": "pyro", pyro: "pyro", "水": "hydro", hydro: "hydro", "風": "anemo", anemo: "anemo", "雷": "electro", electro: "electro", "草": "dendro", dendro: "dendro", "氷": "cryo", cryo: "cryo", "岩": "geo", geo: "geo" })[String(value || "").trim().toLowerCase()] || String(value || "").trim().toLowerCase();
            const currentElement = normalizeElement(calcData.characters?.[context.characterId]?.element);
            if (currentElement !== normalizeElement(modifier.requiredTargetElement)) {
                return { enabled: false, derived: true, reason: "対象キャラクターの元素が一致しません。" };
            }
        }
        const key = analyzeModifier(modifier, source, context).conditionStateKey;
        const state = context.uiState.conditionByModifier?.[key];
        if (state) {
            if (state.stack > 0) setModifierStack(context, modifier, state.stack);
            const optionMatches = modifier.conditionOptionValue === undefined
                || String(state.option) === String(modifier.conditionOptionValue);
            return { enabled: Boolean(state.enabled) && optionMatches, stack: state.stack, option: state.option };
        }
        return evaluateLegacyModifierCondition({ modifier, source, context, calcData });
    }

    function conditionControlState() {
        const result = {};
        const groups = [...new Set(activeConditionDefinitions.map((definition) => definition.group).filter(Boolean))];
        groups.forEach((group) => {
            const states = activeConditionDefinitions
                .filter((definition) => definition.group === group)
                .map((definition) => conditionStateByModifier[definition.key])
                .filter(Boolean);
            result[group] = {
                enabled: states.length > 0 && states.every((state) => state.enabled),
                stack: states.find((state) => state.stack > 0)?.stack || 0
            };
        });
        return result;
    }

    const CARD_DEFINITIONS = [
        { id: "weapon", title: "武器補正" },
        { id: "artifact", title: "聖遺物補正" },
        { id: "talent", title: "天賦補正" },
        { id: "constellation", title: "命ノ星座補正" }
    ];

    function cardIdForSource(source) {
        const type = parseSource(source).type;
        if (type === "weapon") return "weapon";
        if (type === "artifact2" || type === "artifact4") return "artifact";
        if (type === "talent") return "talent";
        if (type === "constellation") return "constellation";
        return "";
    }

    function modifierDisplayValue(modifier, context, stack = null) {
        const activeStack = stack !== null
            ? Number(stack) || 0
            : modifier.conditionInput?.type === "stack"
                ? Number(context.uiState?.resolvedConditionByModifier?.[modifier.id]
                    ?? context.uiState?.resolvedConditionByGroup?.[modifier.conditionGroupId]
                    ?? context.uiState?.stackByModifier?.[modifier.id]
                    ?? modifier.stack?.default ?? 0) || 0
                : null;
        if (modifier.customCalculation === "thresholdStatBonus" && modifier.reference?.stat) {
            const referenceValue = Number(context.stats?.[modifier.reference.stat]) || 0;
            const divisor = Number(modifier.divisor) || 1;
            const ratio = Number(modifier.ratio) || 0;
            const calculated = Math.floor(referenceValue / divisor) * ratio;
            const value = Number.isFinite(Number(modifier.maxValue)) ? Math.min(calculated, Number(modifier.maxValue)) : calculated;
            return `${value >= 0 ? "+" : ""}${value}${modifier.unit === "percent" ? "%" : ""}`;
        }
        let value = modifier.value;
        if (modifier.valueByRefinement) {
            value = modifier.valueByRefinement[String(context.refinement)] ?? modifier.valueByRefinement["1"];
        }
        if (modifier.valueByRefinementPerStack || modifier.valueByRefinementPerConsumedStack) {
            const values = modifier.valueByRefinementPerStack || modifier.valueByRefinementPerConsumedStack;
            value = values[String(context.refinement)] ?? values["1"];
        }
        if (modifier.valueByCondition && modifier.conditionInput?.type === "option") {
            const values = [...new Set(Object.values(modifier.valueByCondition).map(Number).filter(Number.isFinite))];
            return values.map((item) => `${item >= 0 ? "+" : ""}${item}${modifier.unit === "percent" ? "%" : ""}`).join(" / ");
        }
        if (value === undefined || Array.isArray(value)) return "";
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) return String(value);
        if (activeStack !== null) return `${numericValue}% × ${activeStack}段 = ${numericValue * activeStack}%`;
        const suffix = ["percent", "percentPerPoint"].includes(modifier.unit) || modifier.valueByRefinement ? "%" : "";
        return `${numericValue >= 0 ? "+" : ""}${numericValue}${suffix}`;
    }

    function cardSubtitle(cardId, context, calcData) {
        if (cardId === "weapon") {
            if (!context.weaponId) return "武器は選択されていません";
            return `${calcData.weapons?.[context.weaponId]?.nameJa || `武器ID ${context.weaponId}`} R${context.refinement}`;
        }
        if (cardId === "artifact") {
            if (!(context.artifactSetIds || []).length) return "聖遺物セットは選択されていません";
            return context.artifactSetIds.map((id) => calcData.artifactSets?.[id]?.nameJa || `聖遺物ID ${id}`).join(" / ");
        }
        if (cardId === "talent") {
            return calcData.characters?.[context.characterId]?.nameJa || "キャラクター未選択";
        }
        return `現在の解放段階：C${context.constellation}`;
    }

    function controlIdentity(control) {
        return `${control.type || "input"}:${control.key || control.id || control.label || "unknown"}`;
    }

    function constellationSectionStatus(effects, controls) {
        if (controls.some((control) => control.type !== "toggle" && (control.value === null || control.value === undefined || control.value === ""))) return "missing";
        if (controls.length || effects.some((effect) => effect.status === "userInput")) return "userInput";
        if (effects.some((effect) => effect.status === "missing")) return "missing";
        if (effects.every((effect) => effect.status === "reflected")) return "reflected";
        if (effects.every((effect) => effect.status === "displayOnly")) return "displayOnly";
        return "auto";
    }

    function resourceConsumptionHelp(control, effects) {
        if (control.type !== "resource") return control.help || "";
        const messages = [];
        effects.forEach((effect) => {
            const consume = effect.modifier?.resource?.consume;
            if (consume === undefined || consume === null) return;
            const target = modifierImpactLabel(effect.modifier);
            if (consume === "all") messages.push(`${target}では入力した層をすべて消費します。`);
            else if (Number.isFinite(Number(consume))) messages.push(`${target}では${Number(consume)}層消費します。`);
        });
        return [control.help, ...new Set(messages)].filter(Boolean).join(" ");
    }

    function buildConstellationSections(card, context, calcData) {
        const sectionMap = new Map();
        const registryLevels = calcData.constellationEffectRegistry?.characters?.[context.characterId]?.constellations || {};
        (card.effects || []).forEach((effect) => {
            const level = effect.constellationLevel;
            if (!level) return;
            const registryLevel = registryLevels[String(level)] || {};
            if (!sectionMap.has(level)) {
                sectionMap.set(level, {
                    level,
                    label: `C${level}`,
                    nameJa: registryLevel.nameJa || "星座効果",
                    description: normalizeConditionDescription(plainConstellationText(registryLevel.effectText || effect.description || "")),
                    descriptionKind: "full",
                    impactLabels: [],
                    controls: [],
                    effects: []
                });
            }
            const section = sectionMap.get(level);
            const impactLabel = modifierImpactLabel(effect.modifier);
            section.impactLabels.push(impactLabel);
            section.effects.push({
                ...effect,
                name: impactLabel,
                description: "",
                impact: effect.impact || structuredImpactValue(effect.modifier, context),
                activationCondition: effect.modifier.condition === "constellationUnlocked"
                    ? `C${level}「${section.nameJa}」を解放`
                    : sourceAwareActivationCondition(effect, `C${level}「${section.nameJa}」`, section.description)
            });
            effect.controls.forEach((control) => {
                if (!section.controls.some((current) => controlIdentity(current) === controlIdentity(control))) {
                    section.controls.push({
                        ...control,
                        label: control.type === "toggle" ? `${impactLabel}を適用` : control.label,
                        help: control.type === "toggle" ? "この星座効果が発動している場合に有効にします。" : control.help
                    });
                }
            });
        });
        return [...sectionMap.values()].sort((a, b) => a.level - b.level).map((section) => {
            section.impactLabels = [...new Set(section.impactLabels)];
            section.controls = section.controls.map((control) => ({
                ...control,
                help: resourceConsumptionHelp(control, section.effects)
            }));
            if (section.controls.length) {
                section.effects = section.effects.map((effect) => ({ ...effect, statusReason: "" }));
            }
            section.status = constellationSectionStatus(section.effects, section.controls);
            return section;
        });
    }

    function talentSourceMeta(source, context, calcData) {
        const sourceId = parseSource(source).id;
        const normalizedId = String(sourceId).replace(/_/g, "");
        const talents = calcData.characterTalents?.[context.characterId] || {};
        const sourceOverride = calcData.attackModeRules?.talentSourceOverrides?.[context.characterId]?.[normalizedId];
        if (sourceOverride) {
            return {
                order: sourceOverride.order ?? 4,
                typeLabel: sourceOverride.typeLabel || "天賦",
                nameJa: sourceOverride.nameJa || "天賦効果",
                description: normalizeConditionDescription(sourceOverride.description || ""),
                descriptionKind: "summary"
            };
        }
        if (normalizedId === "combat1") {
            return { order: 1, typeLabel: "通常攻撃", nameJa: talents.normalAttack?.nameJa || "通常攻撃", description: normalizeConditionDescription(talents.normalAttack?.normalDescriptionJa || ""), descriptionKind: "full" };
        }
        if (normalizedId === "combat2") {
            return { order: 2, typeLabel: "元素スキル", nameJa: talents.skill?.nameJa || "元素スキル", description: normalizeConditionDescription(talents.skill?.descriptionJa || ""), descriptionKind: "full" };
        }
        if (normalizedId === "combat3") {
            return { order: 3, typeLabel: "元素爆発", nameJa: talents.burst?.nameJa || "元素爆発", description: normalizeConditionDescription(talents.burst?.descriptionJa || ""), descriptionKind: "full" };
        }
        const passives = talents.passives || [];
        const exactPassive = passives.find((item) => String(item.sourceId || "").replace(/_/g, "") === normalizedId);
        const numberedPassiveIndex = /^passive(\d+)$/.test(normalizedId) ? Math.max(0, Number(normalizedId.match(/\d+/)[0]) - 1) : 0;
        const passive = exactPassive || passives[numberedPassiveIndex] || {};
        const passiveIndex = Math.max(0, passives.indexOf(passive));
        return {
            order: 10 + passiveIndex,
            typeLabel: normalizedId.startsWith("passive") ? `固有天賦${passiveIndex + 1}` : "天賦",
            nameJa: passive.nameJa || "天賦効果",
            description: normalizeConditionDescription(passive.descriptionJa || ""),
            descriptionKind: "full"
        };
    }

    function buildTalentSections(card, context, calcData) {
        const sectionMap = new Map();
        (card.effects || []).forEach((effect) => {
            const meta = talentSourceMeta(effect.source, context, calcData);
            const key = effect.source;
            if (!sectionMap.has(key)) {
                sectionMap.set(key, {
                    key,
                    ...meta,
                    controls: [],
                    effects: [],
                    impactLabels: []
                });
            }
            const section = sectionMap.get(key);
            const impactLabel = effect.modifier?.syntheticAttackMode
                ? `攻撃モードを${effect.modifier.attackModeStateName}へ切り替え`
                : effect.modifier?.effectLabel
                    || effect.modifier?.valueSource?.label
                    || modifierImpactLabel(effect.modifier);
            section.impactLabels.push(impactLabel);
            section.effects.push({
                ...effect,
                name: impactLabel,
                description: "",
                impact: effect.modifier?.syntheticAttackMode
                    ? `${modifierTargetLabels(effect.modifier).join("・")}を${effect.modifier.value}元素の専用倍率へ変更`
                    : effect.impact || structuredImpactValue(effect.modifier, context),
                activationCondition: sourceAwareActivationCondition(effect, meta.nameJa, meta.description)
            });
            effect.controls.forEach((control) => {
                if (section.controls.some((current) => controlIdentity(current) === controlIdentity(control))) return;
                section.controls.push({
                    ...control,
                    label: control.type === "toggle"
                        ? effect.modifier?.condition === "hpCondition"
                            ? `${effect.activationCondition.replace(/の?時$/, "")}として計算する`
                            : `${effect.modifier?.attackModeStateName || meta.nameJa}を発動する`
                        : control.label,
                    help: control.type === "toggle"
                        ? effect.modifier?.condition === "hpCondition"
                            ? "現在のHPがこの条件を満たしている場合に有効にします。"
                            : "この天賦状態が発動している場合に有効にします。同じ状態に属する効果をまとめて切り替えます。"
                        : control.help
                });
            });
        });
        return [...sectionMap.values()]
            .sort((a, b) => a.order - b.order)
            .map((section) => {
                section.impactLabels = [...new Set(section.impactLabels)];
                section.status = constellationSectionStatus(section.effects, section.controls);
                return section;
            });
    }

    function artifactSectionStatus(effects, controls) {
        if (controls.some((control) => control.type !== "toggle" && (control.value === null || control.value === undefined || control.value === ""))) return "missing";
        if (controls.length || effects.some((effect) => effect.status === "userInput")) return "userInput";
        if (effects.some((effect) => effect.status === "missing")) return "missing";
        if (effects.every((effect) => effect.status === "reflected")) return "reflected";
        if (effects.every((effect) => effect.status === "notApplicable")) return "notApplicable";
        if (effects.every((effect) => effect.status === "displayOnly")) return "displayOnly";
        return "auto";
    }

    function buildArtifactSections(card, context, calcData) {
        const sectionMap = new Map();
        const setOrder = new Map((context.artifactSetIds || []).map((id, index) => [String(id), index]));
        (card.effects || []).forEach((effect) => {
            const sourceInfo = parseSource(effect.source);
            const setId = sourceInfo.id;
            const pieceCount = sourceInfo.type === "artifact4" ? 4 : 2;
            const key = `${setId}:${pieceCount}`;
            if (!sectionMap.has(key)) {
                const effectText = calcData.artifactSetEffects?.[setId] || {};
                sectionMap.set(key, {
                    key,
                    setId,
                    pieceCount,
                    order: (setOrder.get(String(setId)) ?? 99) * 10 + pieceCount,
                    nameJa: calcData.artifactSets?.[setId]?.nameJa || `聖遺物ID ${setId}`,
                    description: normalizeConditionDescription(pieceCount === 4 ? effectText.fourPieceEffect || "" : effectText.twoPieceEffect || ""),
                    descriptionKind: "full",
                    controls: [],
                    effects: []
                });
            }
            const section = sectionMap.get(key);
            section.effects.push({
                ...effect,
                name: effect.modifier.effectLabel || modifierImpactLabel(effect.modifier),
                description: "",
                impact: effect.impact || structuredImpactValue(effect.modifier, context)
            });
            effect.controls.forEach((control) => {
                const policy = artifactConditionPolicy(effect.modifier, effect.source, context, calcData);
                const normalizedControl = policy ? {
                    ...control,
                    label: policy.label,
                    help: policy.reason
                } : control;
                if (!section.controls.some((current) => controlIdentity(current) === controlIdentity(normalizedControl))) {
                    section.controls.push(normalizedControl);
                }
            });
        });
        return [...sectionMap.values()].sort((a, b) => a.order - b.order).map((section) => {
            section.status = artifactSectionStatus(section.effects, section.controls);
            return section;
        });
    }

    function buildWeaponSections(card) {
        const sections = new Map();
        (card.effects || []).forEach((effect) => {
            const groupId = effect.modifier.effectGroupId || effect.id;
            if (!sections.has(groupId)) {
                sections.set(groupId, {
                    id: groupId,
                    name: effect.modifier.effectLabel || effect.name,
                    order: Number(effect.modifier.effectGroupOrder) || 0,
                    description: normalizeConditionDescription(effect.modifier.effectDescription || effect.description || ""),
                    descriptionKind: effect.modifier.sourceText ? "full" : "summary",
                    targetOwner: effect.modifier.targetOwner || "self",
                    controls: [],
                    effects: []
                });
            }
            const section = sections.get(groupId);
            section.effects.push({ ...effect, description: "" });
            effect.controls.forEach((control) => {
                if (!section.controls.some((current) => controlIdentity(current) === controlIdentity(control))) {
                    section.controls.push(control);
                }
            });
        });
        return [...sections.values()].sort((a, b) => a.order - b.order).map((section) => {
            section.status = artifactSectionStatus(section.effects, section.controls);
            return section;
        });
    }

    function buildConditionCards(context, calcData, resourceInputs, complexConditionInputs) {
        const cards = CARD_DEFINITIONS.map((definition) => ({
            ...definition,
            subtitle: cardSubtitle(definition.id, context, calcData),
            effects: []
        }));
        const cardById = Object.fromEntries(cards.map((card) => [card.id, card]));
        const complexByKey = new Map(complexConditionInputs.map((input) => [input.key, input]));
        const resourceByKey = new Map(resourceInputs.map((input) => [input.key, input]));
        const dedicatedOwners = new Set();

        collectSelectedModifiers(context, calcData).forEach((item) => {
            const cardId = cardIdForSource(item.source);
            if (!cardId) return;
            const analysis = analyzeModifier(item.modifier, item.source, context);
            if (analysis.reasonCode === "SUPERSEDED_RECORD") return;
            const isRelevantCategory = USER_TOGGLE_CATEGORIES.has(item.modifier.category);
            const isResourceInput = analysis.resourceClassification === "calculationInput";
            if (!isRelevantCategory && !isResourceInput) return;
            if (!["applicable", "includedInInput", "displayOnly"].includes(analysis.inputStatus)) return;
            if (["unsupported", "invalidData"].includes(analysis.supportStatus) && analysis.inputStatus !== "includedInInput") return;

            const sourceInfo = parseSource(item.source);
            const artifactPolicy = artifactConditionPolicy(item.modifier, item.source, context, calcData);
            const conditionGroupId = item.modifier.conditionGroupId || item.modifier.activation?.stateKey || item.modifier.effectGroupId || "";
            const conditionKey = conditionGroupId
                ? `${item.source}:group:${conditionGroupId}`
                : analysis.conditionStateKey;
            const conditionState = conditionStateByModifier[conditionKey]
                || conditionStateByModifier[analysis.conditionStateKey]
                || {};
            const controls = [];
            const complex = complexByKey.get(conditionKey) || complexByKey.get(analysis.conditionStateKey);
            const resource = resourceByKey.get(analysis.resourceStateKey || conditionKey || analysis.conditionStateKey);
            if (item.modifier.condition === "arrowFlightTime") {
                controls.push({ type: "amosStack", value: context.uiState.amosStack, min: 0, max: 5, label: item.modifier.conditionLabel || "矢の飛翔時間" });
            } else if (sourceInfo.type === "artifact4" && sourceInfo.id === "15006" && item.modifier.condition === "afterSkill") {
                controls.push({ type: "crimsonWitchStack", value: context.uiState.crimsonWitchStack, min: 0, max: 3, label: "元素スキル使用後の強化段階" });
            } else if (complex) {
                controls.push({ type: "complex", ...complex });
            } else if (resource && isResourceInput) {
                controls.push({ type: "resource", ...resource });
            } else if (analysis.requiresConditionEvaluation
                && analysis.condition !== "always"
                && analysis.calculable
                && !["derived", "automatic", "reflected"].includes(artifactPolicy?.policy)) {
                controls.push({
                    type: "toggle",
                    key: analysis.conditionStateKey,
                    checked: Boolean(conditionState.enabled),
                    label: artifactPolicy?.label || item.modifier.conditionLabel || "この発動条件を適用する",
                    help: artifactPolicy?.reason || ""
                });
            }

            (analysis.requiredInputs || []).forEach((key) => {
                if (dedicatedOwners.has(key)) return;
                const dedicatedMap = {
                    recordedHealing: { id: "genshinJsonRecordedHealing", label: "記録治療量", help: "この効果が参照する、直前に記録された治療量を入力します。", value: context.manualInputs.recordedHealing },
                    "providerStats.hp": { id: "genshinJsonProviderHp", label: "補正提供者のHP", help: "この補正を提供する別キャラクターのHPを入力します。", value: context.manualInputs.providerStats.hp },
                    "providerStats.atk": { id: "genshinJsonProviderAtk", label: "補正提供者の攻撃力", help: "この補正を提供する別キャラクターの攻撃力を入力します。", value: context.manualInputs.providerStats.atk },
                    "providerStats.def": { id: "genshinJsonProviderDef", label: "補正提供者の防御力", help: "この補正を提供する別キャラクターの防御力を入力します。", value: context.manualInputs.providerStats.def },
                    "providerStats.elementalMastery": { id: "genshinJsonProviderElementalMastery", label: "補正提供者の元素熟知", help: "この補正を提供する別キャラクターの元素熟知を入力します。", value: context.manualInputs.providerStats.elementalMastery }
                };
                if (dedicatedMap[key]) {
                    controls.push({ type: "dedicated", key, ...dedicatedMap[key] });
                    dedicatedOwners.add(key);
                }
            });

            let status = "auto";
            if (analysis.inputStatus === "includedInInput") status = "reflected";
            else if (analysis.supportStatus === "missingInput") status = "missing";
            else if (artifactPolicy?.policy === "derived" && !artifactPolicy.enabled) status = "notApplicable";
            else if (controls.length) status = "userInput";
            else if (analysis.supportStatus === "displayOnly") status = "displayOnly";

            const stack = item.modifier.condition === "arrowFlightTime"
                ? Number(context.uiState.amosStack) || 0
                : item.modifier.artifactPieceCount === 4 && item.modifier.artifactSetId === "15006" && item.modifier.condition === "afterSkill"
                    ? Number(context.uiState.crimsonWitchStack) || 0
                    : null;
            const sourceDescription = item.modifier.sourceText || item.sourceDescription || `${categoryLabel(item.modifier.category)}を計算に反映します。`;
            const descriptionKind = item.modifier.sourceText
                ? "full"
                : item.sourceDescription ? "summary" : "generated";
            cards.find((card) => card.id === cardId).effects.push({
                id: item.modifier.id || analysis.key,
                name: `${sourceInfo.type === "constellation" ? `${sourceInfo.id} ` : ""}${item.modifier.effectLabel || item.sourceName || categoryLabel(item.modifier.category)}`,
                description: normalizeConditionDescription(sourceDescription),
                descriptionKind: descriptionKind,
                status,
                statusReason: artifactPolicy?.reason || analysis.reason || analysis.inputReason || "",
                target: modifierTargetLabels(item.modifier).join(" / "),
                displayTarget: modifierTargetLabels(item.modifier).join("・") || item.modifier.effectLabel || categoryLabel(item.modifier.category),
                impact: modifierDisplayValue(item.modifier, context, stack),
                activationCondition: modifierActivationCondition(item.modifier, controls, artifactPolicy, item.sourceName || "", item.sourceDescription || ""),
                effectSummary: modifierEffectSummary(item.modifier, context),
                controls,
                modifier: item.modifier,
                source: item.source,
                constellationLevel: sourceInfo.type === "constellation" ? Number(sourceInfo.id.replace(/^C/, "")) : 0
            });
        });

        cardById.constellation.sections = buildConstellationSections(cardById.constellation, context, calcData);
        cardById.talent.sections = buildTalentSections(cardById.talent, context, calcData);
        cardById.artifact.sections = buildArtifactSections(cardById.artifact, context, calcData);
        cardById.weapon.sections = buildWeaponSections(cardById.weapon);

        cards.forEach((card) => {
            const priority = { auto: 0, reflected: 1, notApplicable: 2, userInput: 3, missing: 4, displayOnly: 5 };
            card.effects.sort((a, b) => (priority[a.status] ?? 9) - (priority[b.status] ?? 9));
            if (card.effects.length) return;
            if (card.id === "weapon" && !context.weaponId) card.emptyText = "武器を選択すると、武器効果と必要な条件が表示されます。";
            else if (card.id === "artifact" && !(context.artifactSetIds || []).length) card.emptyText = "聖遺物セットは選択されていません。入力済みステータスをそのまま使用します。";
            else if (card.id === "constellation") card.emptyText = "現在の解放段階では、手動指定が必要な命ノ星座効果はありません。";
            else card.emptyText = "手動で指定する条件はありません。入力値に反映済みの値を使用します。";
        });
        return cards;
    }

    function conditionPanelState(context, calcData) {
        reconcileConditionState(context, calcData);
        const resourceInputs = reconcileResourceState(context, calcData);
        const complexConditionInputs = reconcileComplexConditionState(context, calcData);
        const dedicatedReferenceInputs = collectSelectedModifiers(context, calcData).reduce((state, item) => {
            const analysis = analyzeModifier(item.modifier, item.source, context);
            (analysis.requiredInputs || []).forEach((key) => {
                if (key === "recordedHealing") state.recordedHealing = true;
                if (key === "providerStats.hp") state.providerHp = true;
                if (key === "providerStats.atk") state.providerAtk = true;
                if (key === "providerStats.def") state.providerDef = true;
                if (key === "providerStats.elementalMastery") state.providerElementalMastery = true;
            });
            return state;
        }, {
            recordedHealing: false,
            providerHp: false,
            providerAtk: false,
            providerDef: false,
            providerElementalMastery: false
        });
        dedicatedReferenceInputs.visible = Object.values(dedicatedReferenceInputs).some(Boolean);
        const cards = buildConditionCards(context, calcData, resourceInputs, complexConditionInputs);
        const partyModifiers = window.GenshinPartyModifiers?.collectPartyModifierCandidates?.(calcData, context) || [];
        const hasCharacter = Boolean(context.characterId);
        const hasWeapon = Boolean(context.weaponId);
        const characterName = hasCharacter ? calcData.characters?.[context.characterId]?.nameJa || `キャラクターID ${context.characterId}` : "キャラクター未選択";
        const weaponName = hasWeapon ? calcData.weapons?.[context.weaponId]?.nameJa || `武器ID ${context.weaponId}` : "武器未選択";
        const hasAmos = context.weaponId === "15502";
        const hasHoma = context.weaponId === "13501";
        const hasHuTao = context.characterId === "10000046";
        const hasGanyu = context.characterId === "10000037";
        const hasCrimsonWitch = (context.artifactSetIds || []).includes("15006");
        const constellationRows = buildConstellationRows(context, calcData);
        const weaponModifiers = calcData.weaponModifiers?.[context.weaponId]?.modifiers || [];
        const artifactModifiers = (context.artifactSetIds || []).flatMap((setId, index) => {
            const artifact = calcData.artifactSetModifiers?.[setId] || {};
            return [
                ...(artifact.twoPiece || []),
                ...(context.artifactSetMode === "4pc" && index === 0 ? (artifact.fourPiece || []) : [])
            ];
        });
        const talentModifiers = calcData.talentModifiers?.[context.characterId]?.passives || [];
        const hasGenericEquipmentCondition = [...weaponModifiers, ...artifactModifiers].some((modifier) => {
            if (modifier.uidHandling && modifier.uidHandling !== "conditional") return false;
            if (modifier.condition === "always") return false;
            return Boolean(modifier.condition);
        });
        const hasGenericCharacterCondition = talentModifiers.some((passive) => {
            return (passive.modifiers || []).some((modifier) => {
                if (modifier.uidHandling && modifier.uidHandling !== "conditional") return false;
                const analysis = analyzeModifier(modifier, `talent:${passive.sourceId || "unknown"}`, context);
                if ((modifier.calculationSupport === "custom" || modifier.calculationSupport === "special")
                    && !analysis.calculable) return false;
                return USER_TOGGLE_CATEGORIES.has(modifier.category) && modifier.condition && modifier.condition !== "always";
            });
        });

        return {
            controlState: conditionControlState(),
            resourceInputs,
            complexConditionInputs,
            dedicatedReferenceInputs,
            cards,
            partyModifiers,
            weaponCondition: {
                visible: hasAmos,
                label: "アモス距離補正"
            },
            characterCondition: {
                visible: hasHuTao || hasGenericCharacterCondition,
                label: hasHuTao
                    ? "蝶導来世中（通常/重撃/落下を炎元素化し、HP参照で攻撃力アップ）"
                    : "キャラ固有・天賦の条件付き補正を適用"
            },
            lowHpCondition: {
                visible: hasHuTao,
                label: "胡桃 HP50%以下条件（炎元素ダメージ+33%）"
            },
            weaponLowHpCondition: {
                visible: hasHoma || hasGenericEquipmentCondition,
                label: hasHoma
                    ? "護摩の杖 HP50%未満条件（追加攻撃力）"
                    : "装備枠の条件付き効果を適用"
            },
            constellationCondition: {
                visible: Object.values(constellationRows).some((row) => row.visible),
                label: "解放段階"
            },
            constellationRows,
            crimsonWitchCondition: {
                visible: hasCrimsonWitch,
                label: "火魔女4セット（元素スキル使用後）"
            },
            helpText: hasCharacter
                ? `${characterName} / ${weaponName} に合わせて補正条件を更新しました。命ノ星座は現在の入力欄の値を初期選択しています。必要な条件を選んでからダメージ計算を実行してください。`
                : "計算入力欄でキャラクター・武器・聖遺物を選ぶと、利用できる補正条件がここに表示されます。"
        };
    }

    window.GenshinCalcConditions = {
        buildConditionDefinitions,
        buildResourceInputDefinitions,
        buildComplexConditionDefinitions,
        reconcileConditionState,
        reconcileComplexConditionState,
        reconcileResourceState,
        evaluateModifierCondition,
        conditionPanelState,
        talentSourceMeta,
        artifactConditionPolicy,
        conditionLabelForKey,
        targetLabel,
        modifierActivationCondition,
        modifierEffectSummary
    };
})();
