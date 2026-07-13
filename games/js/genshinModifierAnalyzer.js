(function () {
    "use strict";

    const ENGINE_CATEGORIES = new Set([
        "additiveBaseDamage",
        "critBonus",
        "damageBonus",
        "defenseDebuff",
        "defenseIgnore",
        "effectOverride",
        "elementOverride",
        "extraDamage",
        "reactionBonus",
        "resistanceDebuff",
        "scalingBonus",
        "statBonus",
        "statConversion"
    ]);

    const UID_STATUS = {
        includedInUidStats: "includedInInput",
        includedInUidTalentLevels: "includedInInput",
        manualOnly: "manualOnly",
        displayOnly: "displayOnly",
        special: "unsupported"
    };

    const UID_REASON = {
        includedInUidStats: "includedInUidStatsのため未適用",
        includedInUidTalentLevels: "UID天賦Lv反映済みの可能性があるため未適用",
        manualOnly: "manualOnlyのため未適用",
        displayOnly: "displayOnly",
        special: "special未対応"
    };

    function finiteNumber(value) {
        return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
    }

    function valueMapHasFiniteNumber(map) {
        return Object.values(map || {}).some(finiteNumber);
    }

    function hasResolvableValue(modifier) {
        return finiteNumber(modifier?.value)
            || valueMapHasFiniteNumber(modifier?.valueByRefinement)
            || valueMapHasFiniteNumber(modifier?.valueByLevel)
            || valueMapHasFiniteNumber(modifier?.valueByStack)
            || valueMapHasFiniteNumber(modifier?.valueByCondition)
            || finiteNumber(modifier?.valuePerStack);
    }

    function extraDamageBaseAttackType(modifier) {
        if (["normalAttack", "chargedAttack", "plungingAttack", "skill", "burst"].includes(modifier?.referenceAttackType)) {
            return modifier.referenceAttackType;
        }
        const base = String(modifier?.base || "");
        if (/normalAttack/i.test(base)) return "normalAttack";
        if (/chargedAttack|breakthroughBarb|rebukeVaultingFist/i.test(base)) return "chargedAttack";
        if (/plungingAttack/i.test(base)) return "plungingAttack";
        if (/burst/i.test(base)) return "burst";
        if (/skill/i.test(base)) return "skill";
        const applyTo = modifier?.applyTo || [];
        return ["normalAttack", "chargedAttack", "plungingAttack", "skill", "burst"]
            .find((attackType) => applyTo.includes(attackType)) || "";
    }

    function hasStructuredScaling(modifier) {
        return Array.isArray(modifier?.scalings) && modifier.scalings.some((scaling) => {
            return finiteNumber(scaling?.value)
                || finiteNumber(scaling?.valuePerStack)
                || valueMapHasFiniteNumber(scaling?.valuesByLevel);
        });
    }

    function hasComputableExtraDamage(modifier) {
        if (modifier?.category !== "extraDamage") return false;
        if (hasStructuredScaling(modifier)) return true;
        const looksLikeDamage = /ダメージを与|追加ダメージ|範囲ダメージ|ダメージを与える/
            .test(String(modifier.sourceText || ""));
        if (!looksLikeDamage || !hasResolvableValue(modifier)) return false;
        return Boolean(modifier.reference?.stat || extraDamageBaseAttackType(modifier));
    }

    function hasComputableEffectOverride(modifier) {
        if (modifier?.category !== "effectOverride") return false;
        if (modifier.unit === "percentOfOriginalDamage") return finiteNumber(effectOverrideValue(modifier));
        if (modifier.unit === "percentOfOriginalEffect") {
            return modifier.targetEffect === "previousDamageBonusEffects"
                && finiteNumber(modifier.effectMultiplierPercent ?? modifier.value);
        }
        return false;
    }

    function effectOverrideKind(modifier) {
        if (modifier?.unit === "percentOfOriginalDamage") return "damageMultiplier";
        if (modifier?.unit === "percentOfOriginalEffect" && modifier.targetEffect === "previousDamageBonusEffects") {
            return "effectValueMultiplier";
        }
        return "unsupported";
    }

    function effectOverrideValue(modifier) {
        if (modifier?.unit === "percentOfOriginalEffect" && finiteNumber(modifier.effectMultiplierPercent)) {
            return Number(modifier.effectMultiplierPercent);
        }
        return finiteNumber(modifier?.value) ? Number(modifier.value) : modifier?.effectMultiplier;
    }

    function classifyEffectOverride(modifier) {
        if (hasComputableEffectOverride(modifier)) return "calculable";
        if (modifier?.unit === "percentOfOriginalDamage"
            && !finiteNumber(modifier.value ?? modifier.effectMultiplier)) {
            return "damageOverrideMissingValue";
        }
        if (modifier?.unit === "percentOfOriginalEffect") return "effectMultiplier";
        const text = String(modifier?.sourceText || "");
        if (/クールタイム|継続時間|回復|シールド|元素エネルギー|攻撃速度|召喚|存在可能|ストック|夜魂|粒子|消費|耐性\+|受けるダメージ-|中断耐性/.test(text)) {
            return "displayOrState";
        }
        if (/元の.*\d+%.*ダメージ|本来の\d+%.*ダメージ|範囲ダメージを与える|ダメージを与える|追加で.*攻撃/.test(text)) {
            return "extraDamageMissingData";
        }
        if (/攻撃力[+-]|会心率|会心ダメージ|受けるダメージがアップ|防御力[-+]|耐性[-+]|ダメージアップ/.test(text)) {
            return "modifierMissingData";
        }
        return "unknown";
    }

    function effectOverrideReason(modifier) {
        const type = classifyEffectOverride(modifier);
        if (type === "damageOverrideMissingValue") return "計算値変更候補ですが、value が未登録です";
        if (type === "effectMultiplier") return "既存効果の倍率変更のため専用処理が必要です";
        if (type === "displayOrState") return "表示・状態管理系の効果のため計算には未適用です";
        if (type === "extraDamageMissingData") return "追加ダメージ候補ですが、倍率データが未登録です";
        if (type === "modifierMissingData") return "バフ/デバフ候補ですが、構造化データが未登録です";
        if (type === "unknown") return "effectOverride の分類が未確認です";
        return "";
    }

    function extraDamageReason(modifier) {
        if (!modifier) return "追加ダメージのデータが不足しています";
        if (!/ダメージを与|追加ダメージ|範囲ダメージ|ダメージを与える/.test(String(modifier.sourceText || ""))) {
            return "追加ダメージ以外の効果として登録されているため未適用です";
        }
        return "追加ダメージの倍率または参照元データが不足しています";
    }

    function referenceInputInfo(modifier, context = {}) {
        if (modifier?.reference?.type === "healingRecorded") {
            const value = context.manualInputs?.recordedHealing;
            return {
                requiredInputs: ["recordedHealing"],
                missingInputs: finiteNumber(value) ? [] : ["recordedHealing"],
                reason: finiteNumber(value) ? "" : "記録治療量の専用入力がありません"
            };
        }
        if (modifier?.reference?.source === "provider") {
            const stat = modifier.reference?.stat || "";
            const key = `providerStats.${stat || "unknown"}`;
            const value = context.manualInputs?.providerStats?.[stat];
            return {
                requiredInputs: [key],
                missingInputs: finiteNumber(value) ? [] : [key],
                reason: finiteNumber(value) ? "" : `提供キャラクターの${stat || "参照ステータス"}入力がありません`
            };
        }
        return { requiredInputs: [], missingInputs: [], reason: "" };
    }

    function dedicatedExtraDamageInfo(modifier, context = {}) {
        if (modifier?.reference?.type !== "healingRecorded") return null;
        if (!hasResolvableValue(modifier) || modifier.unit !== "percent") {
            return { calculable: false, supportStatus: "invalidData", reason: "記録治療量ダメージの倍率または単位が不正です", requiredInputs: [], missingInputs: [] };
        }
        const input = referenceInputInfo(modifier, context);
        return {
            calculable: input.missingInputs.length === 0,
            supportStatus: input.missingInputs.length ? "missingInput" : "supported",
            reason: input.reason,
            ...input
        };
    }

    function additiveBaseDamageInfo(modifier, context = {}) {
        if (modifier?.category !== "additiveBaseDamage") {
            return { calculable: false, supportStatus: "unsupported", reason: "additiveBaseDamage ではありません" };
        }
        const special = modifier.calculationSupport === "custom" || modifier.calculationSupport === "special";
        if (!special) return { calculable: true, supportStatus: "supported", reason: "" };
        const supportedStats = new Set(["atk", "hp", "def", "elementalMastery"]);
        const isRecordedHealing = modifier.reference?.type === "healingRecorded";
        const isSupportedStatReference = supportedStats.has(modifier.reference?.stat)
            && ["self", "provider"].includes(modifier.reference?.source);
        if (!isRecordedHealing && !isSupportedStatReference) {
            return { calculable: false, supportStatus: "invalidData", reason: "加算ダメージの参照ステータスが不足しています" };
        }
        if (!hasResolvableValue(modifier)) {
            return { calculable: false, supportStatus: "invalidData", reason: "加算ダメージの倍率データが不足しています" };
        }
        if (!["percent", "percentOfReference"].includes(modifier.unit)) {
            return { calculable: false, supportStatus: "unsupported", reason: "加算ダメージの単位に専用処理が必要です" };
        }
        if (!Array.isArray(modifier.applyTo) || !modifier.applyTo.length) {
            return { calculable: false, supportStatus: "invalidData", reason: "加算ダメージの適用対象が不足しています" };
        }
        const input = referenceInputInfo(modifier, context);
        return {
            calculable: input.missingInputs.length === 0,
            supportStatus: input.missingInputs.length ? "missingInput" : "supported",
            reason: input.reason,
            ...input
        };
    }

    function resourceEffectInfo(modifier) {
        const categories = new Set(["resourceEffect", "resourceGeneratedEffect", "resourceCostOverride"]);
        if (!categories.has(modifier?.category)) return null;
        const resource = modifier.resource;
        if (!resource || typeof resource !== "object") {
            return { resourceClassification: "unsupported", supportStatus: "unsupported", reason: "リソース構造が未登録です" };
        }
        if (resource.fromSourceText) {
            return { resourceClassification: "displayOnly", supportStatus: "displayOnly", reason: "原文由来のリソース情報として表示のみ行います" };
        }
        const hasIdentity = Boolean(resource.id || resource.nameJa);
        const hasStateValue = finiteNumber(resource.gain)
            || finiteNumber(resource.consume)
            || finiteNumber(resource.consumeMultiplier)
            || (resource.consume && typeof resource.consume === "object");
        if (hasIdentity && hasStateValue) {
            return { resourceClassification: "calculationInput", supportStatus: "stateInput", reason: "構造化リソース状態として計算入力に利用します" };
        }
        if (hasIdentity) {
            return { resourceClassification: "displayOnly", supportStatus: "displayOnly", reason: "リソース名のみ構造化済みのため表示専用です" };
        }
        return { resourceClassification: "unsupported", supportStatus: "unsupported", reason: "リソースIDと増減量が不足しています" };
    }

    function resourceStateKey(modifier, source = "", context = {}) {
        const resourceId = modifier?.resource?.id || modifier?.resource?.nameJa || modifier?.id || "anonymous";
        if (source.startsWith("weapon:")) return `${source}:resource:${resourceId}`;
        if (source.startsWith("artifact")) return `${source}:resource:${resourceId}`;
        if (source.startsWith("talent:") || source.startsWith("constellation:")) {
            return `character:${context.characterId || "unknown"}:resource:${resourceId}`;
        }
        return `${source || "unknown"}:resource:${resourceId}`;
    }

    function statBonusInfo(modifier) {
        if (modifier?.category !== "statBonus") {
            return { calculable: false, supportStatus: "unsupported", reason: "statBonus ではありません" };
        }
        const special = modifier.calculationSupport === "custom" || modifier.calculationSupport === "special";
        if (!special) return { calculable: true, supportStatus: "supported", reason: "" };
        if (modifier.customCalculation !== "directStatBonus") {
            return { calculable: false, supportStatus: "unsupported", reason: "custom statBonus の直接補正指定がありません" };
        }
        const targets = modifier.applyTo || [];
        const percentTargets = new Set(["atkPercent", "hpPercent", "defPercent"]);
        const flatTargets = new Set(["atkFlat", "hpFlat", "defFlat", "elementalMastery", "energyRecharge"]);
        const target = targets.length === 1 ? targets[0] : "";
        if (!finiteNumber(modifier.value) && !valueMapHasFiniteNumber(modifier.valueByCondition)) {
            return { calculable: false, supportStatus: "invalidData", reason: "直接ステータス補正の値が不足しています" };
        }
        if ((modifier.unit === "percent" && percentTargets.has(target))
            || (modifier.unit === "flat" && flatTargets.has(target))) {
            return { calculable: true, supportStatus: "supported", reason: "" };
        }
        return { calculable: false, supportStatus: "invalidData", reason: "直接ステータス補正の対象または単位が不正です" };
    }

    function scalingBonusInfo(modifier) {
        if (modifier?.category !== "scalingBonus") {
            return { calculable: false, calculation: "", supportStatus: "unsupported", reason: "scalingBonus ではありません" };
        }
        if (modifier.reference?.source !== "self" || !modifier.reference?.stat) {
            return { calculable: false, calculation: "scalingBonus", supportStatus: "invalidData", reason: "参照ステータスが不足しています" };
        }
        const targets = modifier.applyTo || [];
        const statTargets = new Set(["atkPercent", "hpPercent", "defPercent", "elementalMastery", "energyRecharge"]);
        const damageTargets = new Set([
            "allDamageBonus", "allElementDamageBonus", "normalAttackDamageBonus",
            "chargedAttackDamageBonus", "plungingAttackDamageBonus", "skillDamageBonus", "burstDamageBonus"
        ]);
        const isCustom = modifier.calculationSupport === "custom" || modifier.calculationSupport === "special";
        if (isCustom && !modifier.customCalculation) {
            return { calculable: false, calculation: "scalingBonus", supportStatus: "unsupported", reason: "custom scalingBonus の計算方式が未指定です" };
        }
        if (targets.length === 1 && statTargets.has(targets[0]) && hasResolvableValue(modifier) && modifier.unit === "percent") {
            return { calculable: true, calculation: "scalingStatBonus", supportStatus: "supported", reason: "" };
        }
        if (targets.length > 0 && targets.every((target) => damageTargets.has(target))
            && finiteNumber(modifier.ratio) && ["percent", "percentPerPoint"].includes(modifier.unit)) {
            return { calculable: true, calculation: "scalingDamageBonus", supportStatus: "supported", reason: "" };
        }
        return { calculable: false, calculation: "scalingBonus", supportStatus: "invalidData", reason: "scalingBonus の倍率・対象・単位が不足しています" };
    }

    function scalingAdditiveBaseDamageInfo(modifier, context = {}) {
        if (modifier?.customCalculation !== "scalingAdditiveBaseDamage") return null;
        if (!modifier.reference?.stat || !["self", "provider"].includes(modifier.reference?.source)) {
            return { calculable: false, calculation: "scalingAdditiveBaseDamage", supportStatus: "invalidData", reason: "加算基礎ダメージの参照元が不足しています" };
        }
        if (!finiteNumber(modifier.ratio) && !finiteNumber(modifier.value)) {
            return { calculable: false, calculation: "scalingAdditiveBaseDamage", supportStatus: "invalidData", reason: "加算基礎ダメージの倍率が不足しています" };
        }
        if (!Array.isArray(modifier.applyTo) || !modifier.applyTo.length) {
            return { calculable: false, calculation: "scalingAdditiveBaseDamage", supportStatus: "invalidData", reason: "加算基礎ダメージの対象が不足しています" };
        }
        const input = referenceInputInfo(modifier, context);
        return {
            calculable: input.missingInputs.length === 0,
            calculation: "scalingAdditiveBaseDamage",
            supportStatus: input.missingInputs.length ? "missingInput" : "supported",
            reason: input.reason,
            ...input
        };
    }

    function inputStatus(modifier, context) {
        if (context?.mode !== "uidMode") return "applicable";
        return UID_STATUS[modifier?.uidHandling] || "applicable";
    }

    function inputReason(modifier, context) {
        if (context?.mode !== "uidMode") return "";
        return UID_REASON[modifier?.uidHandling] || "";
    }

    function analysisReasonCode(modifier, calculation = {}) {
        if (modifier?.auditDisposition === "supersededByStructuredRecord") return "SUPERSEDED_RECORD";
        if (modifier?.auditDisposition === "displayOnlyMisclassification") return "DISPLAY_ONLY_MISCLASSIFICATION";
        const status = calculation.supportStatus || "";
        if (["supported", "stateInput"].includes(status)) return "";
        if (status === "missingInput") {
            if (calculation.resourceStateKey || modifier?.resource) return "RESOURCE_INPUT_REQUIRED";
            if (modifier?.conditionInput) return "CONDITION_INPUT_REQUIRED";
            if ((calculation.missingInputs || []).includes("recordedHealing")) return "RECORDED_HEALING_INPUT_REQUIRED";
            if ((calculation.missingInputs || []).some((key) => key.startsWith("providerStats."))) return "PROVIDER_INPUT_REQUIRED";
            return "MANUAL_INPUT_REQUIRED";
        }
        if (status === "displayOnly") return "DISPLAY_ONLY_SOURCE_TEXT";
        if (modifier?.category === "effectOverride") {
            const classification = classifyEffectOverride(modifier);
            const codes = {
                damageOverrideMissingValue: "MISSING_VALUE",
                effectMultiplier: "EFFECT_MULTIPLIER_FORMULA_REQUIRED",
                displayOrState: "DISPLAY_OR_STATE_EFFECT",
                extraDamageMissingData: "CATEGORY_MISCLASSIFIED_EXTRA_DAMAGE",
                modifierMissingData: "CATEGORY_MISCLASSIFIED_MODIFIER",
                unknown: "EFFECT_OVERRIDE_FORMULA_REQUIRED"
            };
            return codes[classification] || "EFFECT_OVERRIDE_FORMULA_REQUIRED";
        }
        if (modifier?.category === "extraDamage") {
            const text = String(modifier.sourceText || "");
            if (!/ダメージを与|追加ダメージ|範囲ダメージ|ダメージを与える/.test(text)) {
                return "CATEGORY_MISCLASSIFIED";
            }
            if (!hasResolvableValue(modifier) && !hasStructuredScaling(modifier)) return "MISSING_VALUE";
            if (!modifier.reference?.stat && !extraDamageBaseAttackType(modifier) && !hasStructuredScaling(modifier)) {
                return "MISSING_REFERENCE";
            }
            return "EXTRA_DAMAGE_FORMULA_REQUIRED";
        }
        if (modifier?.category === "additiveBaseDamage") {
            if (!modifier.reference?.stat && modifier.reference?.type !== "healingRecorded") return "MISSING_REFERENCE";
            if (!hasResolvableValue(modifier)) return "MISSING_VALUE";
            if (!Array.isArray(modifier.applyTo) || !modifier.applyTo.length) return "MISSING_TARGET";
            if (!["percent", "percentOfReference"].includes(modifier.unit)) return "CUSTOM_UNIT_REQUIRED";
            return "ADDITIVE_FORMULA_REQUIRED";
        }
        if (modifier?.category === "scalingBonus") {
            if (!modifier.reference?.stat) return "MISSING_REFERENCE";
            if (!Array.isArray(modifier.applyTo) || !modifier.applyTo.length) return "MISSING_TARGET";
            if (!modifier.customCalculation && ["custom", "special"].includes(modifier.calculationSupport)) {
                return "CUSTOM_FORMULA_REQUIRED";
            }
            return "SCALING_FORMULA_REQUIRED";
        }
        if (modifier?.category === "statBonus") {
            if (!modifier.customCalculation && ["custom", "special"].includes(modifier.calculationSupport)) {
                return "CATEGORY_MISCLASSIFIED_OR_CUSTOM_FORMULA_REQUIRED";
            }
            if (!hasResolvableValue(modifier)) return "MISSING_VALUE";
            if (!Array.isArray(modifier.applyTo) || !modifier.applyTo.length) return "MISSING_TARGET";
            return "INVALID_STAT_CONTRACT";
        }
        if (status === "invalidData") return "INVALID_DATA";
        if (["custom", "special"].includes(modifier?.calculationSupport)) return "CUSTOM_FORMULA_REQUIRED";
        return "UNSUPPORTED_CATEGORY";
    }

    function calculationInfo(modifier, context = {}, source = "") {
        if (!modifier || !modifier.category) {
            return { calculable: false, calculation: "", supportStatus: "invalidData", reason: "category が未登録です" };
        }
        if (modifier.auditDisposition === "supersededByStructuredRecord") {
            return { calculable: false, calculation: "", supportStatus: "displayOnly", reason: "同じ効果の構造化済みレコードへ統合済みです" };
        }
        if (modifier.auditDisposition === "displayOnlyMisclassification") {
            return { calculable: false, calculation: "", supportStatus: "displayOnly", reason: "旧カテゴリ誤分類を表示専用として隔離しています" };
        }
        const scalingAdditive = scalingAdditiveBaseDamageInfo(modifier, context);
        if (scalingAdditive) return scalingAdditive;
        if (modifier.customCalculation === "extraDamage") {
            const calculable = hasResolvableValue(modifier) && Boolean(modifier.reference?.stat || hasStructuredScaling(modifier));
            return {
                calculable,
                calculation: "extraDamage",
                supportStatus: calculable ? "supported" : "invalidData",
                reason: calculable ? "" : "明示追加ダメージの倍率または参照元が不足しています"
            };
        }
        if (modifier.category === "extraDamage") {
            const dedicated = dedicatedExtraDamageInfo(modifier, context);
            if (dedicated) return { ...dedicated, calculation: "extraDamage" };
            const calculable = hasComputableExtraDamage(modifier);
            return {
                calculable,
                calculation: "extraDamage",
                supportStatus: calculable ? "supported" : "invalidData",
                reason: calculable ? "" : extraDamageReason(modifier)
            };
        }
        if (modifier.category === "effectOverride") {
            const calculable = hasComputableEffectOverride(modifier);
            const classification = classifyEffectOverride(modifier);
            return {
                calculable,
                calculation: "effectOverride",
                supportStatus: calculable ? "supported" : classification === "damageOverrideMissingValue" ? "invalidData" : "unsupported",
                reason: calculable ? "" : effectOverrideReason(modifier)
            };
        }
        if (modifier.category === "additiveBaseDamage") {
            const info = additiveBaseDamageInfo(modifier, context);
            return {
                ...info,
                calculation: "additiveBaseDamage"
            };
        }
        if (modifier.category === "statBonus") {
            const info = statBonusInfo(modifier);
            return { ...info, calculation: "statBonus" };
        }
        if (modifier.category === "scalingBonus") {
            return scalingBonusInfo(modifier);
        }
        const resource = resourceEffectInfo(modifier);
        if (resource) {
            const needsStackInput = resource.resourceClassification === "calculationInput";
            const resourceKey = resourceStateKey(modifier, source, context);
            const hasStackInput = finiteNumber(context.manualInputs?.resourceStates?.[resourceKey]);
            return {
                calculable: false,
                calculation: "resourceState",
                ...resource,
                supportStatus: needsStackInput && !hasStackInput ? "missingInput" : resource.supportStatus,
                reason: needsStackInput && !hasStackInput
                    ? "現在リソース層数の専用入力がありません"
                    : resource.reason,
                resourceStateKey: resourceKey,
                requiredInputs: needsStackInput ? [`resourceStates.${resourceKey}`] : [],
                missingInputs: needsStackInput && !hasStackInput ? [`resourceStates.${resourceKey}`] : []
            };
        }
        const special = modifier.calculationSupport === "custom" || modifier.calculationSupport === "special";
        const calculable = ENGINE_CATEGORIES.has(modifier.category) && !special;
        return {
            calculable,
            calculation: ENGINE_CATEGORIES.has(modifier.category) ? modifier.category : "",
            supportStatus: calculable ? "supported" : "unsupported",
            reason: calculable ? "" : special ? "専用処理が必要です" : "未対応カテゴリです"
        };
    }

    function effectGroupKey(modifier, source = "") {
        if (modifier?.effectGroupId) return `${source}:${modifier.effectGroupId}`;
        const id = String(modifier?.id || "");
        const normalizedId = id.replace(/_resolved_\d+(?=_v\d+$|$)/, "");
        return `${source}:${normalizedId || "anonymous"}`;
    }

    function modifierDedupeKey(analysis) {
        if (!analysis?.dedupeEligible || !analysis.calculation) return "";
        return `${analysis.effectGroupKey}:${analysis.calculation}`;
    }

    function modifierStateKey(modifier, source = "") {
        if (modifier?.id) return `${source}:${modifier.id}`;
        const anonymousSignature = [
            modifier?.category || "",
            modifier?.condition || "always",
            ...(modifier?.applyTo || []),
            ...(Array.isArray(modifier?.targetEffect)
                ? modifier.targetEffect
                : modifier?.targetEffect ? [modifier.targetEffect] : []),
            modifier?.sourceText || ""
        ].join("|");
        return `${source}:anonymous:${anonymousSignature}`;
    }

    function analyzeModifier({ modifier, source = "", context = {} }) {
        let calculation = calculationInfo(modifier, context, source);
        const dependentResourceKey = modifier?.resource && calculation.calculation !== "resourceState"
            ? resourceStateKey(modifier, source, context)
            : calculation.resourceStateKey || "";
        if (dependentResourceKey && calculation.calculable) {
            const hasResourceInput = finiteNumber(context.manualInputs?.resourceStates?.[dependentResourceKey]);
            calculation = {
                ...calculation,
                calculable: hasResourceInput,
                supportStatus: hasResourceInput ? calculation.supportStatus : "missingInput",
                reason: hasResourceInput ? calculation.reason : "対象リソースの現在層数が入力されていません",
                requiredInputs: [...(calculation.requiredInputs || []), `resourceStates.${dependentResourceKey}`],
                missingInputs: hasResourceInput ? (calculation.missingInputs || []) : [`resourceStates.${dependentResourceKey}`]
            };
        }
        const complexConditionKey = modifier?.conditionInput ? modifierStateKey(modifier, source) : "";
        if (complexConditionKey && calculation.calculable) {
            const conditionKind = modifier.conditionInput.type || "option";
            const conditionState = context.uiState?.conditionByModifier?.[complexConditionKey]
                || context.uiState?.complexConditionByModifier?.[complexConditionKey];
            const hasConditionInput = conditionKind === "option"
                ? conditionState?.option !== undefined && conditionState.option !== ""
                : finiteNumber(conditionState?.[conditionKind]);
            calculation = {
                ...calculation,
                calculable: hasConditionInput,
                supportStatus: hasConditionInput ? calculation.supportStatus : "missingInput",
                reason: hasConditionInput ? calculation.reason : `${modifier.conditionInput.label || "詳細条件"}の入力がありません`,
                requiredInputs: [...(calculation.requiredInputs || []), `conditionByModifier.${complexConditionKey}.${conditionKind}`],
                missingInputs: hasConditionInput ? (calculation.missingInputs || []) : [`conditionByModifier.${complexConditionKey}.${conditionKind}`]
            };
        }
        const input = inputStatus(modifier, context);
        const uidHandling = modifier?.uidHandling || "conditional";
        const status = input !== "applicable"
            ? input
            : calculation.calculable ? "applicable" : calculation.supportStatus;
        return {
            key: modifierStateKey(modifier, source),
            conditionStateKey: modifierStateKey(modifier, source),
            effectGroupKey: effectGroupKey(modifier, source),
            dedupeEligible: Boolean(modifier?.effectGroupId || modifier?.id),
            category: modifier?.category || "",
            status,
            calculable: calculation.calculable,
            calculation: calculation.calculation,
            supportStatus: calculation.supportStatus,
            reason: calculation.reason,
            reasonCode: analysisReasonCode(modifier, calculation),
            requiredInputs: calculation.requiredInputs || [],
            missingInputs: calculation.missingInputs || [],
            resourceClassification: calculation.resourceClassification || "",
            resourceStateKey: dependentResourceKey,
            inputStatus: input,
            inputReason: inputReason(modifier, context),
            uidHandling,
            requiresConditionEvaluation: uidHandling === "conditional",
            condition: modifier?.condition || "always",
            targets: Array.isArray(modifier?.applyTo) ? modifier.applyTo : [],
            customHandlingRequired: Boolean(modifier?.customHandlingRequired)
        };
    }

    window.GenshinModifierAnalyzer = {
        analyzeModifier,
        analysisReasonCode,
        additiveBaseDamageInfo,
        classifyEffectOverride,
        effectGroupKey,
        effectOverrideReason,
        effectOverrideKind,
        effectOverrideValue,
        extraDamageBaseAttackType,
        extraDamageReason,
        finiteNumber,
        hasComputableEffectOverride,
        hasComputableExtraDamage,
        hasResolvableValue,
        modifierDedupeKey,
        modifierStateKey,
        referenceInputInfo,
        resourceEffectInfo,
        resourceStateKey,
        scalingBonusInfo,
        scalingAdditiveBaseDamageInfo,
        statBonusInfo
    };
})();
