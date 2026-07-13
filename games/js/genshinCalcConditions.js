(function () {
    "use strict";

    function parseSource(source) {
        const [type, id = ""] = String(source || "").split(":");
        return { type, id };
    }

    function setModifierStack(context, modifier, stack) {
        if (!modifier?.id) return;
        context.uiState.stackByModifier[modifier.id] = stack;
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
        "resistanceDebuff",
        "scalingBonus",
        "statConversion",
        "statBonus"
    ]);

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
        const add = (modifier, source, display = {}) => selected.push({ modifier, source, ...display });
        const talentPassives = calcData.talentModifiers?.[context.characterId]?.passives || [];
        const talentDisplays = calcData.characterTalents?.[context.characterId]?.passives || [];
        talentPassives.forEach((passive) => {
            const normalizedSourceId = String(passive.sourceId || "").replace(/_/g, "");
            const display = talentDisplays.find((item) => String(item.sourceId || "").replace(/_/g, "") === normalizedSourceId) || {};
            (passive.modifiers || []).forEach((modifier) => add(modifier, `talent:${passive.sourceId || context.characterId}`, {
                sourceName: display.nameJa || "",
                sourceDescription: display.descriptionJa || ""
            }));
        });
        (calcData.weaponModifiers?.[context.weaponId]?.modifiers || [])
            .forEach((modifier) => add(modifier, `weapon:${context.weaponId}`));
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
        if (sourceInfo.type === "weapon" || sourceInfo.type === "artifact4" || sourceInfo.type === "artifact2") {
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
                key: analysis.conditionStateKey,
                group: conditionUiGroup(item.modifier, item.source, context)
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
            definitions.set(key, {
                key,
                id: modifier.resource?.id || modifier.id || "",
                label: modifier.resource?.nameJa || modifier.resource?.id || "リソース",
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
        return collectSelectedModifiers(context, calcData).flatMap(({ modifier, source }) => {
            if (modifier.resource) return [];
            const analysis = analyzeModifier(modifier, source, context);
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
                type,
                min: Number(configured?.min ?? modifier.stack?.min ?? 0),
                max: Number(configured?.max ?? modifier.stack?.max ?? 0),
                options: configured?.options || [],
                source
            }];
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
            const state = incomingState || storedState;
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
                ...state
            };
            if (definition.type === "stack" && definition.modifierId) {
                context.uiState.stackByModifier[definition.modifierId] = state.stack;
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
            const previous = conditionStateByModifier[definition.key];
            if (previous) {
                nextState[definition.key] = { ...previous };
                return;
            }
            if (hadActiveDefinitions && definition.group) {
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
            return { enabled: Boolean(state.enabled), stack: state.stack, option: state.option };
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
            const isRelevantCategory = USER_TOGGLE_CATEGORIES.has(item.modifier.category);
            const isResourceInput = analysis.resourceClassification === "calculationInput";
            if (!isRelevantCategory && !isResourceInput) return;
            if (analysis.inputStatus !== "applicable" && analysis.inputStatus !== "includedInInput") return;
            if (["unsupported", "invalidData"].includes(analysis.supportStatus) && analysis.inputStatus !== "includedInInput") return;

            const sourceInfo = parseSource(item.source);
            const conditionState = conditionStateByModifier[analysis.conditionStateKey] || {};
            const controls = [];
            const complex = complexByKey.get(analysis.conditionStateKey);
            const resource = resourceByKey.get(analysis.resourceStateKey || analysis.conditionStateKey);
            if (item.modifier.condition === "arrowFlightTime") {
                controls.push({ type: "amosStack", value: context.uiState.amosStack, min: 0, max: 5, label: "飛翔時間段階" });
            } else if (sourceInfo.type === "artifact4" && sourceInfo.id === "15006" && item.modifier.condition === "afterSkill") {
                controls.push({ type: "crimsonWitchStack", value: context.uiState.crimsonWitchStack, min: 0, max: 3, label: "元素スキル使用後の強化段階" });
            } else if (complex) {
                controls.push({ type: "complex", ...complex });
            } else if (resource && isResourceInput) {
                controls.push({ type: "resource", ...resource });
            } else if (analysis.requiresConditionEvaluation && analysis.condition !== "always" && analysis.calculable) {
                controls.push({
                    type: "toggle",
                    key: analysis.conditionStateKey,
                    checked: Boolean(conditionState.enabled),
                    label: "この発動条件を適用する"
                });
            }

            (analysis.requiredInputs || []).forEach((key) => {
                if (dedicatedOwners.has(key)) return;
                const dedicatedMap = {
                    recordedHealing: { id: "genshinJsonRecordedHealing", label: "記録治療量", value: context.manualInputs.recordedHealing },
                    "providerStats.hp": { id: "genshinJsonProviderHp", label: "補正提供者のHP", value: context.manualInputs.providerStats.hp },
                    "providerStats.atk": { id: "genshinJsonProviderAtk", label: "補正提供者の攻撃力", value: context.manualInputs.providerStats.atk },
                    "providerStats.def": { id: "genshinJsonProviderDef", label: "補正提供者の防御力", value: context.manualInputs.providerStats.def },
                    "providerStats.elementalMastery": { id: "genshinJsonProviderElementalMastery", label: "補正提供者の元素熟知", value: context.manualInputs.providerStats.elementalMastery }
                };
                if (dedicatedMap[key]) {
                    controls.push({ type: "dedicated", key, ...dedicatedMap[key] });
                    dedicatedOwners.add(key);
                }
            });

            let status = "auto";
            if (analysis.inputStatus === "includedInInput") status = "reflected";
            else if (analysis.supportStatus === "missingInput") status = "missing";
            else if (controls.length) status = "userInput";
            else if (analysis.supportStatus === "displayOnly") status = "displayOnly";

            const stack = item.modifier.condition === "arrowFlightTime" ? Number(context.uiState.amosStack) || 0 : null;
            cards.find((card) => card.id === cardId).effects.push({
                id: item.modifier.id || analysis.key,
                name: `${sourceInfo.type === "constellation" ? `${sourceInfo.id} ` : ""}${item.modifier.effectLabel || item.sourceName || categoryLabel(item.modifier.category)}`,
                description: item.modifier.sourceText || item.sourceDescription || `${categoryLabel(item.modifier.category)}を計算に反映します。`,
                status,
                statusReason: analysis.reason || analysis.inputReason || "",
                target: (item.modifier.applyTo || []).join(" / "),
                impact: modifierDisplayValue(item.modifier, context, stack),
                controls
            });
        });

        cards.forEach((card) => {
            const priority = { auto: 0, reflected: 1, userInput: 2, missing: 3, displayOnly: 4 };
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
        conditionPanelState
    };
})();
