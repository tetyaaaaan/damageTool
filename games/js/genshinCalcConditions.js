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
        afterOwnerTriggersBloomRelatedReaction: "装備者が開花系反応を起こした後",
        mirroredNymphStacks: "鏡中の水仙効果の段階",
        afterTakingDamage: "ダメージを受けた後",
        afterHpChanges: "HPが増減した後",
        afterHealingRecordedAndConverted: "治療量の記録と変換が完了した後",
        afterSkillAndCrystallizeShieldOrMoonCrystallizeObjectNearby: "元素スキル使用後、結晶シールドまたは月結晶生成物が存在",
        bondOfLifeChanges: "命の契約の数値が増減した後",
        burningEnemyNearbyOrOutOfCombat: "燃焼状態の敵が付近にいる、または非戦闘状態",
        afterTriggeringRelatedElementReaction: "関連元素反応を起こした後",
        afterTriggeringRelatedElementReactionWhileInNightsoulBlessing: "夜魂の加護中に関連元素反応を起こした後",
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

    function artifactConditionPolicy(modifier, source, context, calcData) {
        const sourceInfo = parseSource(source);
        if (!["artifact2", "artifact4"].includes(sourceInfo.type)) return null;
        const condition = modifier.condition || "always";
        const label = modifier.conditionLabel || ARTIFACT_CONDITION_LABELS[condition] || `発動条件: ${condition}`;
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
        enemyDefense: "敵の防御力",
        correspondingElementResistance: "対応元素の耐性",
        elementalMastery: "元素熟知",
        atkPercent: "攻撃力",
        hpPercent: "HP上限",
        defPercent: "防御力",
        critRate: "会心率",
        critDamage: "会心ダメージ",
        reactionCrit: "元素反応の会心",
        lunarBloomCrit: "月開花反応の会心"
    };

    const STAT_LABELS = {
        atk: "攻撃力",
        hp: "HP上限",
        def: "防御力",
        elementalMastery: "元素熟知"
    };

    function modifierTargetLabels(modifier) {
        const labels = (modifier.applyTo || []).map((target) => TARGET_LABELS[target] || "").filter(Boolean);
        return [...new Set(labels)];
    }

    function modifierImpactLabel(modifier) {
        if (modifier.category === "elementOverride") {
            const attackModeTargets = modifierTargetLabels(modifier);
            const attackModeTargetText = attackModeTargets.length ? attackModeTargets.join("・") : "対象攻撃";
            return `攻撃モード: ${attackModeTargetText}を${modifier.value || "指定"}元素に変化`;
        }
        const resourceName = modifier.resource?.nameJa || modifier.resource?.id || "専用効果";
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
        if (modifier.category === "additiveBaseDamage" || modifier.category === "scalingBonus") return `${targetText}の基礎ダメージ加算`;
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
            add(normalized, `weapon:${context.weaponId}`);
        });
        (context.artifactSetIds || []).forEach((setId, index) => {
            const artifact = calcData.artifactSetModifiers?.[setId] || {};
            (artifact.twoPiece || []).forEach((modifier) => add(modifier, `artifact2:${setId}`));
            if (context.artifactSetMode === "4pc" && index === 0) {
                (artifact.fourPiece || []).forEach((modifier) => add(modifier, `artifact4:${setId}`));
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
            const numericStack = modifier.stack
                && Number.isFinite(Number(modifier.stack.min))
                && Number.isFinite(Number(modifier.stack.max));
            if (!configured && !numericStack) return [];
            const type = configured?.type || "stack";
            return [{
                key: analysis.conditionStateKey,
                modifierId: modifier.id || "",
                label: configured?.label || `${categoryLabel(modifier.category)}: ${shortSourceText(modifier.sourceText)}`,
                help: configured?.help || (type === "option" ? "適用する状態を選択します。" : "この効果の現在の段階・回数を入力します。"),
                unit: configured?.unit || (type === "stack" ? "段" : ""),
                type,
                min: Number(configured?.min ?? modifier.stack?.min ?? 0),
                max: Number(configured?.max ?? modifier.stack?.max ?? 0),
                options: configured?.options || [],
                configured: Boolean(configured),
                source
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
            const configuredDefault = definition.type === "stack" && (definition.configured || String(definition.source).startsWith("artifact"))
                ? { stack: definition.min }
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
            const previous = conditionStateByModifier[definition.key];
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
        let value = modifier.value;
        if (modifier.valueByRefinement) {
            value = modifier.valueByRefinement[String(context.refinement)] ?? modifier.valueByRefinement["1"];
        }
        if (modifier.valueByRefinementPerStack) {
            value = modifier.valueByRefinementPerStack[String(context.refinement)] ?? modifier.valueByRefinementPerStack["1"];
        }
        if (modifier.valueByCondition && modifier.conditionInput?.type === "option") {
            const values = [...new Set(Object.values(modifier.valueByCondition).map(Number).filter(Number.isFinite))];
            return values.map((item) => `${item >= 0 ? "+" : ""}${item}${modifier.unit === "percent" ? "%" : ""}`).join(" / ");
        }
        if (value === undefined || Array.isArray(value)) return "";
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) return String(value);
        if (stack !== null) return `${numericValue}% × ${stack}段 = ${numericValue * stack}%`;
        const suffix = modifier.unit === "percent" || modifier.valueByRefinement ? "%" : "";
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
                    description: plainConstellationText(registryLevel.effectText || effect.description || ""),
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
                impact: structuredImpactValue(effect.modifier, context),
                controls: []
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
                description: sourceOverride.description || ""
            };
        }
        if (normalizedId === "combat1") {
            return { order: 1, typeLabel: "通常攻撃", nameJa: talents.normalAttack?.nameJa || "通常攻撃", description: talents.normalAttack?.normalDescriptionJa || "" };
        }
        if (normalizedId === "combat2") {
            return { order: 2, typeLabel: "元素スキル", nameJa: talents.skill?.nameJa || "元素スキル", description: talents.skill?.descriptionJa || "" };
        }
        if (normalizedId === "combat3") {
            return { order: 3, typeLabel: "元素爆発", nameJa: talents.burst?.nameJa || "元素爆発", description: talents.burst?.descriptionJa || "" };
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
            description: passive.descriptionJa || ""
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
                : modifierImpactLabel(effect.modifier);
            section.impactLabels.push(impactLabel);
            section.effects.push({
                ...effect,
                name: impactLabel,
                description: "",
                impact: effect.modifier?.syntheticAttackMode
                    ? `${modifierTargetLabels(effect.modifier).join("・")}を${effect.modifier.value}元素の専用倍率へ変更`
                    : structuredImpactValue(effect.modifier, context),
                controls: []
            });
            effect.controls.forEach((control) => {
                if (section.controls.some((current) => controlIdentity(current) === controlIdentity(control))) return;
                section.controls.push({
                    ...control,
                    label: control.type === "toggle"
                        ? `${effect.modifier?.attackModeStateName || meta.nameJa}を発動する`
                        : control.label,
                    help: control.type === "toggle"
                        ? "この天賦状態が発動している場合に有効にします。同じ状態に属する効果をまとめて切り替えます。"
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
                    description: pieceCount === 4 ? effectText.fourPieceEffect || "" : effectText.twoPieceEffect || "",
                    controls: [],
                    effects: []
                });
            }
            const section = sectionMap.get(key);
            section.effects.push({
                ...effect,
                name: effect.modifier.effectLabel || modifierImpactLabel(effect.modifier),
                description: "",
                impact: structuredImpactValue(effect.modifier, context),
                controls: []
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
                    description: effect.modifier.effectDescription || effect.description || "",
                    targetOwner: effect.modifier.targetOwner || "self",
                    controls: [],
                    effects: []
                });
            }
            const section = sections.get(groupId);
            section.effects.push({ ...effect, description: "", controls: [] });
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
            const conditionState = conditionStateByModifier[analysis.conditionStateKey] || {};
            const controls = [];
            const complex = complexByKey.get(analysis.conditionStateKey);
            const resource = resourceByKey.get(analysis.resourceStateKey || analysis.conditionStateKey);
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

            const stack = item.modifier.condition === "arrowFlightTime" ? Number(context.uiState.amosStack) || 0 : null;
            cards.find((card) => card.id === cardId).effects.push({
                id: item.modifier.id || analysis.key,
                name: `${sourceInfo.type === "constellation" ? `${sourceInfo.id} ` : ""}${item.modifier.effectLabel || item.sourceName || categoryLabel(item.modifier.category)}`,
                description: item.modifier.sourceText || item.sourceDescription || `${categoryLabel(item.modifier.category)}を計算に反映します。`,
                status,
                statusReason: artifactPolicy?.reason || analysis.reason || analysis.inputReason || "",
                target: modifierTargetLabels(item.modifier).join(" / "),
                impact: modifierDisplayValue(item.modifier, context, stack),
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
                ? `${characterName} / ${weaponName} に合わせて補正条件を更新しました。命ノ星座は現在の入力欄の値を初期選択しています。必要な条件を選んでからJSON計算を実行してください。`
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
        artifactConditionPolicy
    };
})();
