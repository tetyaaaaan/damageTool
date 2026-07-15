(function () {
    "use strict";

    const REACTION_OPTIONS = {
        none: { reactionId: "none", family: "none", label: "反応なし", enabled: false },
        melt15: { reactionId: "melt", family: "amplifying", label: "溶解 1.5倍", coefficient: 1.5, enabled: true },
        melt20: { reactionId: "melt", family: "amplifying", label: "溶解 2.0倍", coefficient: 2, enabled: true },
        vaporize15: { reactionId: "vaporize", family: "amplifying", label: "蒸発 1.5倍", coefficient: 1.5, enabled: true },
        vaporize20: { reactionId: "vaporize", family: "amplifying", label: "蒸発 2.0倍", coefficient: 2, enabled: true }
    };

    function hydrateReactionContext(context, calcData) {
        const key = context.reactionOptionKey || "none";
        const definition = calcData?.reactionDefinitions?.options?.[key] || REACTION_OPTIONS[key] || REACTION_OPTIONS.none;
        const family = definition.family || definition.reactionType || "none";
        const damageElement = definition.damageElement === "select"
            ? context.reactionElement || "炎"
            : definition.damageElement || "";
        context.reactionDefinitions = calcData?.reactionDefinitions || {};
        context.reactionOption = {
            ...definition,
            key,
            family,
            reactionType: family,
            label: definition.labelJa || definition.label || key,
            coefficient: Number(definition.coefficient ?? definition.baseMultiplier ?? 1),
            baseMultiplier: Number(definition.coefficient ?? definition.baseMultiplier ?? 1),
            damageElement,
            enabled: definition.calculationStatus === "supported" && !["none", "statusOnly"].includes(family)
        };
        return context.reactionOption;
    }

    function getElement(id) {
        return document.getElementById(id);
    }

    function readNumber(id, fallback = 0) {
        const value = Number(getElement(id)?.value);
        return Number.isFinite(value) ? value : fallback;
    }

    function readOptionalNumber(id) {
        const raw = getElement(id)?.value;
        if (raw === undefined || raw === null || raw === "") return null;
        const value = Number(raw);
        return Number.isFinite(value) ? value : null;
    }

    function readText(id, fallback = "") {
        return getElement(id)?.value || fallback;
    }

    const RESISTANCE_ELEMENT_ALIASES = {
        "\u708e": "pyro",
        fire: "pyro",
        pyro: "pyro",
        "\u6c34": "hydro",
        water: "hydro",
        hydro: "hydro",
        "\u96f7": "electro",
        lightning: "electro",
        electro: "electro",
        "\u6c37": "cryo",
        ice: "cryo",
        cryo: "cryo",
        "\u98a8": "anemo",
        wind: "anemo",
        anemo: "anemo",
        "\u5ca9": "geo",
        rock: "geo",
        geo: "geo",
        "\u8349": "dendro",
        grass: "dendro",
        dendro: "dendro",
        "\u7269\u7406": "physical",
        phys: "physical",
        physical: "physical"
    };

    function finiteNumber(value, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function normalizeResistanceElement(element) {
        const normalized = String(element || "").trim().toLocaleLowerCase("en");
        return RESISTANCE_ELEMENT_ALIASES[normalized] || normalized;
    }

    function normalizeResistanceValues(values) {
        if (!values || typeof values !== "object" || Array.isArray(values)) return {};
        return Object.fromEntries(Object.entries(values).flatMap(([element, value]) => {
            const normalizedElement = normalizeResistanceElement(element);
            const normalizedValue = Number(value);
            return normalizedElement && normalizedElement !== "physical" && Number.isFinite(normalizedValue)
                ? [[normalizedElement, normalizedValue]]
                : [];
        }));
    }

    function normalizeEnemyResistance(enemy = {}) {
        const resistance = enemy.resistance || {};
        const base = resistance.base || {};
        const manualDebuff = resistance.manualDebuff || {};
        const legacyBaseResistance = finiteNumber(enemy.enemyResistance, 10);
        const legacyResistanceDebuff = finiteNumber(enemy.resistanceDebuff, 0);
        return {
            base: {
                defaultElemental: finiteNumber(base.defaultElemental, legacyBaseResistance),
                physical: finiteNumber(base.physical, legacyBaseResistance),
                byElement: normalizeResistanceValues(base.byElement)
            },
            manualDebuff: {
                allElemental: finiteNumber(manualDebuff.allElemental, legacyResistanceDebuff),
                physical: finiteNumber(manualDebuff.physical, legacyResistanceDebuff),
                byElement: normalizeResistanceValues(manualDebuff.byElement)
            }
        };
    }

    function resolveBaseResistance(enemy, damageElement) {
        const resistance = normalizeEnemyResistance(enemy);
        const element = normalizeResistanceElement(damageElement);
        if (element === "physical") return resistance.base.physical;
        return resistance.base.byElement[element] ?? resistance.base.defaultElemental;
    }

    function resolveManualResistanceDebuff(enemy, damageElement) {
        const resistance = normalizeEnemyResistance(enemy);
        const element = normalizeResistanceElement(damageElement);
        if (element === "physical") return resistance.manualDebuff.physical;
        return resistance.manualDebuff.allElemental + (resistance.manualDebuff.byElement[element] ?? 0);
    }

    function resolveEffectiveResistance(enemy, damageElement, structuredResistanceDebuff = 0) {
        return resolveBaseResistance(enemy, damageElement)
            - resolveManualResistanceDebuff(enemy, damageElement)
            - finiteNumber(structuredResistanceDebuff, 0);
    }

    function resolveDamageResistanceElement(entry = {}, reaction = {}) {
        const isReactionDamage = Boolean(entry.directReactionId)
            || entry.attackType === "reaction"
            || entry.damageType === "reaction";
        const element = isReactionDamage
            ? reaction.damageElement || entry.element || "physical"
            : entry.element || reaction.damageElement || "physical";
        return normalizeResistanceElement(element);
    }

    function readResourceStates() {
        const states = {};
        const inputs = document.querySelectorAll?.("[data-genshin-resource-key]") || [];
        Array.from(inputs).forEach((input) => {
            const key = input.dataset?.genshinResourceKey || "";
            const value = input.value === "" ? null : Number(input.value);
            if (key && Number.isFinite(value)) states[key] = value;
        });
        return states;
    }

    function readComplexConditionStates() {
        const states = {};
        const inputs = document.querySelectorAll?.("[data-genshin-condition-key]") || [];
        Array.from(inputs).forEach((input) => {
            const key = input.dataset?.genshinConditionKey || "";
            const kind = input.dataset?.genshinConditionKind || "option";
            if (!key) return;
            states[key] ||= {};
            if (kind === "option") states[key].option = input.value;
            else {
                const value = input.value === "" ? null : Number(input.value);
                if (Number.isFinite(value)) states[key][kind] = value;
            }
        });
        return states;
    }

    function readModifierToggleStates() {
        const states = {};
        const inputs = document.querySelectorAll?.("[data-genshin-toggle-key]") || [];
        Array.from(inputs).forEach((input) => {
            const key = input.dataset?.genshinToggleKey || "";
            if (key) states[key] = Boolean(input.checked);
        });
        return states;
    }

    function readReactionContributors() {
        return [2, 3, 4].map((slot) => {
            const level = readOptionalNumber(`genshinReactionContributor${slot}Level`);
            const elementalMastery = readOptionalNumber(`genshinReactionContributor${slot}Em`);
            if (level === null && elementalMastery === null) return null;
            return {
                slot,
                level: Math.min(Math.max(Math.round(level ?? 90), 1), 100),
                elementalMastery: Math.max(elementalMastery ?? 0, 0),
                critRate: Math.min(Math.max(readOptionalNumber(`genshinReactionContributor${slot}CritRate`) ?? 0, 0), 100),
                critDamage: Math.max(readOptionalNumber(`genshinReactionContributor${slot}CritDamage`) ?? 50, 0),
                reactionBonus: readOptionalNumber(`genshinReactionContributor${slot}ReactionBonus`) ?? 0,
                baseDamageBonus: readOptionalNumber(`genshinReactionContributor${slot}BaseBonus`) ?? 0
            };
        }).filter(Boolean);
    }

    function parseConstellation(value) {
        const match = String(value || "").match(/\d+/);
        return match ? Number(match[0]) : 0;
    }

    function normalizeRefinement(value) {
        const match = String(value || "").match(/\d+/);
        const rank = match ? Number(match[0]) : 1;
        return Math.min(Math.max(rank, 1), 5);
    }

    function buildCharacterCalcContext() {
        const artifactSetMode = readText("genshinArtifactSetMode", "");
        const artifactSetOne = readText("genshinArtifactSetOne", "");
        const artifactSetTwo = readText("genshinArtifactSetTwo", "");
        const artifactSetIds = [];
        if (artifactSetOne) artifactSetIds.push(artifactSetOne);
        if (artifactSetMode === "2pc2pc" && artifactSetTwo && artifactSetTwo !== artifactSetOne) {
            artifactSetIds.push(artifactSetTwo);
        }
        const hasReflectedCharacter = Boolean(readText("genshinReflectCharacter", ""));
        const constellationValue = hasReflectedCharacter ? readText("genshinReflectConstellation", "C0") : "C0";
        const selectedConstellation = constellationValue;
        const elementalResistance = readNumber("genshinEnemyElementalResistanceInput", 10);
        const physicalResistance = readNumber("genshinEnemyPhysicalResistanceInput", 10);
        const elementalResistanceDebuff = readNumber("genshinElementalResistanceDebuffInput", 0);
        const physicalResistanceDebuff = readNumber("genshinPhysicalResistanceDebuffInput", 0);
        return {
            characterId: readText("genshinCalcCharacterId", ""),
            weaponId: readText("genshinCalcWeaponId", ""),
            refinement: normalizeRefinement(readText("genshinWeaponRefinement", "R1")),
            artifactSetMode,
            artifactSetIds,
            constellation: parseConstellation(selectedConstellation),
            talentLevels: {
                normal: readNumber("genshinNormalTalentLevel", 10),
                skill: readNumber("genshinSkillTalentLevel", 10),
                burst: readNumber("genshinBurstTalentLevel", 10)
            },
            stats: {
                hp: readNumber("genshinHpInput", 0),
                atk: readNumber("genshinAtkInput", readNumber("atk", 1000)),
                def: readNumber("genshinDefInput", 0),
                elementalMastery: readNumber("genshinElementalMasteryInput", readNumber("ele_m", 0)),
                critRate: readNumber("genshinCritRateInput", 5),
                critDamage: readNumber("genshinCritDamageInput", readNumber("cri_dmg", 50)),
                energyRecharge: readNumber("genshinEnergyRechargeInput", 100),
                elementDamageBonus: readNumber("genshinElementalDamageInput", readNumber("dmg_b", 0))
            },
            enemy: {
                characterLevel: readNumber("genshinReflectLevel", readNumber("lv", 90)),
                enemyLevel: readNumber("genshinEnemyLevelInput", 90),
                resistance: {
                    base: {
                        defaultElemental: elementalResistance,
                        physical: physicalResistance,
                        byElement: {}
                    },
                    manualDebuff: {
                        allElemental: elementalResistanceDebuff,
                        physical: physicalResistanceDebuff,
                        byElement: {}
                    }
                },
                defenseReduction: readNumber("genshinDefenseReductionInput", 0),
                defenseIgnore: readNumber("genshinDefenseIgnoreInput", 0)
            },
            mode: "uidMode",
            reactionOptionKey: readText("genshinJsonReactionOption", "none"),
            reactionOption: REACTION_OPTIONS[readText("genshinJsonReactionOption", "none")] || REACTION_OPTIONS.none,
            reactionElement: readText("genshinJsonReactionElement", "炎"),
            manualInputs: {
                recordedHealing: readOptionalNumber("genshinJsonRecordedHealing"),
                providerStats: {
                    hp: readOptionalNumber("genshinJsonProviderHp"),
                    atk: readOptionalNumber("genshinJsonProviderAtk"),
                    def: readOptionalNumber("genshinJsonProviderDef"),
                    elementalMastery: readOptionalNumber("genshinJsonProviderElementalMastery")
                },
                resourceStates: readResourceStates(),
                reactionContributors: readReactionContributors(),
                stellarConductStacks: Math.min(Math.max(readNumber("genshinStellarConductStacks", 0), 0), 12)
            },
            uiState: {
                amosStack: readNumber("genshinJsonAmosStack", 0),
                crimsonWitchStack: readNumber("genshinJsonCrimsonWitchStack", 0),
                enableCharacterCondition: Boolean(getElement("genshinJsonEnableCharacterCondition")?.checked),
                enableLowHpCondition: Boolean(getElement("genshinJsonEnableLowHpCondition")?.checked),
                enableWeaponLowHpCondition: Boolean(getElement("genshinJsonEnableWeaponLowHpCondition")?.checked),
                constellationConditions: {
                    C1: Boolean(getElement("genshinJsonEnableConstellationC1")?.checked),
                    C2: Boolean(getElement("genshinJsonEnableConstellationC2")?.checked),
                    C4: Boolean(getElement("genshinJsonEnableConstellationC4")?.checked),
                    C6: Boolean(getElement("genshinJsonEnableConstellationC6")?.checked)
                },
                enableConstellation: parseConstellation(selectedConstellation) > 0,
                stackByModifier: {},
                conditionByModifier: {},
                toggleByModifier: readModifierToggleStates(),
                complexConditionByModifier: readComplexConditionStates()
            }
        };
    }

    function getTalentLevel(context, entry) {
        const source = entry.levelSource || entry.attackType;
        if (source === "skill") return context.talentLevels.skill;
        if (source === "burst") return context.talentLevels.burst;
        return context.talentLevels.normal;
    }

    function normalizeDamageElement(entry, characterInfo = {}) {
        const weaponType = characterInfo.weaponType || "";
        const ownElement = characterInfo.element || entry.element;
        const isNormalTalentAttack = ["normalAttack", "chargedAttack", "plungingAttack"].includes(entry.attackType);

        if (entry.element === "ownElement") return ownElement;
        if (weaponType === "弓" && entry.attackType === "chargedAttack") {
            return entry.chargedAttackStage === "aimed" ? "physical" : ownElement;
        }
        if (weaponType === "法器" && isNormalTalentAttack) return ownElement;
        return entry.element;
    }

    const ATTACK_MODE_ACTION_TYPES = new Set(["normalAttack", "chargedAttack", "plungingAttack"]);

    function talentSourceIdForGroup(group) {
        return group === "skill" ? "combat2" : group === "burst" ? "combat3" : "combat1";
    }

    function talentConditionGroupId(characterId, sourceId) {
        return `talent-state:${characterId}:${sourceId}`;
    }

    function talentStateConditionKey(characterId, group) {
        const sourceId = talentSourceIdForGroup(group);
        return `talent:${sourceId}:group:${talentConditionGroupId(characterId, sourceId)}`;
    }

    function buildAttackModeDefinitions(calcData, context) {
        const characterId = context.characterId;
        if (!characterId) return [];
        return ["skill"].flatMap((group) => {
            const entries = calcData.talentScalings?.[characterId]?.[group]?.entries || [];
            const modeEntries = entries.filter((entry) => ATTACK_MODE_ACTION_TYPES.has(entry.attackType));
            if (!modeEntries.length) return [];
            const talent = calcData.characterTalents?.[characterId]?.[group] || {};
            const rule = calcData.attackModeRules?.characters?.[characterId]?.[group] || {};
            const sourceId = talentSourceIdForGroup(group);
            const sourceModifiers = (calcData.talentModifiers?.[characterId]?.passives || [])
                .find((passive) => String(passive.sourceId || "").replace(/_/g, "") === sourceId)?.modifiers || [];
            const hasMatchingElementOverride = sourceModifiers.some((modifier) => {
                return modifier.category === "elementOverride"
                    && modeEntries.some((entry) => entry.element === modifier.value);
            });
            if (!hasMatchingElementOverride && !rule.nameJa) return [];
            const attackTypes = [...new Set(modeEntries.map((entry) => entry.attackType))];
            return [{
                characterId,
                group,
                sourceId,
                sourceName: talent.nameJa || "元素スキル",
                sourceDescription: talent.descriptionJa || "",
                stateName: rule.nameJa || `${talent.nameJa || "元素スキル"}発動中`,
                element: modeEntries[0]?.element || "",
                attackTypes,
                conditionGroupId: talentConditionGroupId(characterId, sourceId),
                conditionStateKey: talentStateConditionKey(characterId, group)
            }];
        });
    }

    function attackModeIsEnabled(calcData, context, group) {
        const definition = buildAttackModeDefinitions(calcData, context).find((item) => item.group === group);
        if (!definition) return false;
        return Boolean(context.uiState?.conditionByModifier?.[definition.conditionStateKey]?.enabled);
    }

    function normalizeAttackModeEntry(entry, group, calcData, context) {
        if (group === "normalAttack" || !ATTACK_MODE_ACTION_TYPES.has(entry.attackType)) return entry;
        const rule = calcData.attackModeRules?.characters?.[context.characterId]?.[group] || {};
        const damageType = rule.damageTypeByAttackType?.[entry.attackType] || entry.damageType;
        return {
            ...entry,
            damageType,
            attackMode: {
                id: `${context.characterId}:${group}`,
                nameJa: rule.nameJa || (group === "skill" ? "元素スキル攻撃モード" : "元素爆発攻撃モード"),
                sourceGroup: group,
                operationType: entry.attackType,
                damageType,
                element: entry.element
            }
        };
    }

    function normalizeElementOverrideModifier(modifier, source, calcData, context) {
        if (modifier.category !== "elementOverride") return modifier;
        if (!String(source).startsWith("talent:")) {
            return { ...modifier, targetGroups: modifier.targetGroups || ["normalAttack"] };
        }
        const sourceId = String(source).slice("talent:".length);
        const expectedGroup = sourceId === "combat2" ? "skill" : sourceId === "combat3" ? "burst" : "";
        if (!expectedGroup) return { ...modifier, targetGroups: modifier.targetGroups || ["normalAttack"] };

        const entries = calcData.talentScalings?.[context.characterId]?.[expectedGroup]?.entries || [];
        const applyTo = new Set(modifier.applyTo || []);
        const modeEntries = entries.filter((entry) => ATTACK_MODE_ACTION_TYPES.has(entry.attackType) && applyTo.has(entry.attackType));
        if (!modeEntries.length) return { ...modifier, targetGroups: ["normalAttack"] };

        const matchingEntries = modeEntries.filter((entry) => normalizeDamageElement(entry, calcData.characters?.[context.characterId] || {}) === modifier.value);
        if (!matchingEntries.length) {
            return {
                ...modifier,
                targetGroups: [],
                attackModeConflict: true,
                attackModeConflictReason: `攻撃モードの元素が専用倍率と不一致: ${modifier.value}`
            };
        }
        return {
            ...modifier,
            targetGroups: [expectedGroup],
            attackModeSourceGroup: expectedGroup,
            attackModeEncodedInScaling: true
        };
    }

    function talentLevelForSource(sourceId, context) {
        if (sourceId === "combat1") return context.talentLevels?.normal || 1;
        if (sourceId === "combat3") return context.talentLevels?.burst || 1;
        return context.talentLevels?.skill || 1;
    }

    function normalizeExclusiveTalentOptions(modifier, sourceId, calcData, context) {
        const config = modifier.exclusiveTalentOptions;
        if (!config?.options?.length) return modifier;
        const siblings = (calcData.talentModifiers?.[context.characterId]?.passives || [])
            .find((passive) => String(passive.sourceId || "").replace(/_/g, "") === String(sourceId).replace(/_/g, ""))
            ?.modifiers || [];
        const talentLevel = Math.min(Math.max(Math.round(talentLevelForSource(sourceId, context)), 1), 15);
        const valueByCondition = {};
        config.options.forEach((option) => {
            const sourceModifier = Number.isInteger(option.modifierIndex) ? siblings[option.modifierIndex] : null;
            const rawValue = option.value !== undefined
                ? option.value
                : sourceModifier?.valueByLevel?.[String(talentLevel)] ?? sourceModifier?.valueByLevel?.["1"] ?? 0;
            valueByCondition[String(option.valueKey)] = numericModifierValue(rawValue);
        });
        return {
            ...modifier,
            id: config.id || modifier.id,
            effectLabel: config.effectLabel || modifier.effectLabel,
            valueByCondition,
            conditionInput: {
                type: "option",
                label: config.label || "効果段階",
                help: config.help || "現在の段階を選択します。各段階は同時には適用されません。",
                options: config.options.map((option) => ({ value: String(option.valueKey), label: option.label }))
            },
            conditionGroupId: config.id || modifier.conditionGroupId,
            calculationSupport: "simple",
            uidHandling: "conditional"
        };
    }

    function normalizeTalentStateModifier(modifier, source, calcData, context, modifierIndex = 0) {
        const sourceId = String(source).startsWith("talent:") ? String(source).slice("talent:".length) : "";
        const registryKey = `${context.characterId}.${sourceId}.${modifierIndex}`;
        const registryRecord = calcData?.talentEffectRegistry?.records?.[registryKey];
        const registered = registryRecord ? {
            ...modifier,
            ...(registryRecord.modifierOverride || {}),
            talentResolution: registryRecord.resolution,
            talentResolutionReason: registryRecord.reasonJa
        } : modifier;
        const optionNormalized = normalizeExclusiveTalentOptions(registered, sourceId, calcData, context);
        const normalized = normalizeElementOverrideModifier(optionNormalized, source, calcData, context);
        if (!String(source).startsWith("talent:")) return normalized;
        if (!["combat2", "combat3"].includes(sourceId)) return normalized;
        if (!["active", "stateActive", "duringBurst"].includes(normalized.condition)) return normalized;
        return {
            ...normalized,
            conditionGroupId: talentConditionGroupId(context.characterId, sourceId)
        };
    }

    function normalizeArtifactModifier(modifier, source) {
        const match = String(source || "").match(/^artifact(2|4):(.+)$/);
        if (!match) return modifier;
        const normalized = {
            ...modifier,
            artifactSetId: match[2],
            artifactPieceCount: Number(match[1])
        };
        if (modifier.condition === "chargedAttack" && normalized.category === "critBonus") {
            normalized.applyTo = [...new Set([...(normalized.applyTo || []), "chargedAttack"] )];
        }
        return normalized;
    }

    function weaponEffectGroup(modifier, weaponDefinition = {}) {
        return (weaponDefinition.groups || []).find((group) => (group.modifierIds || []).includes(modifier?.id)) || null;
    }

    function stableTextHash(value) {
        let hash = 2166136261;
        for (const character of String(value || "")) {
            hash ^= character.charCodeAt(0);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16).padStart(8, "0");
    }

    function fallbackWeaponMetadata(modifier) {
        const sourceText = String(modifier?.sourceText || "");
        const descriptionKey = sourceText || modifier?.id || "unknown";
        const firstClause = sourceText.split(/[、。]/)[0] || "武器効果";
        const targetOwner = /装備者(?:自身)?を除|他のキャラクター|他キャラクター/.test(sourceText)
            ? "activeCharacter"
            : "self";
        const dynamicCondition = /(?:時|後|間|毎|状態|以下|以上|につき|層|影響を受け|付着|命中|消費|解除|獲得|存在する場合)/.test(sourceText);
        const normalized = {
            ...modifier,
            effectGroupId: modifier.effectGroupId || `fallback_${stableTextHash(descriptionKey)}`,
            effectLabel: modifier.effectLabel || firstClause.slice(0, 36),
            effectDescription: modifier.effectDescription || sourceText,
            targetOwner,
            conditionLabel: modifier.conditionLabel || (dynamicCondition ? firstClause.slice(0, 48) : "")
        };
        if (targetOwner !== "self") normalized.auditDisposition = "sourceContextRequired";
        return normalized;
    }

    function duplicateWeaponRecord(modifier, siblings) {
        const signature = (candidate) => JSON.stringify({
            category: candidate.category,
            applyTo: [...(candidate.applyTo || [])].sort(),
            unit: candidate.unit,
            condition: candidate.condition,
            calculationSupport: candidate.calculationSupport,
            sourceText: candidate.sourceText || "",
            value: candidate.value,
            valueByRefinement: candidate.valueByRefinement,
            valueByStack: candidate.valueByStack
        });
        const ownIndex = siblings.indexOf(modifier);
        if (ownIndex < 0) return false;
        const ownSignature = signature(modifier);
        return siblings.slice(0, ownIndex).some((candidate) => signature(candidate) === ownSignature);
    }

    function weaponValueContract(modifier) {
        return JSON.stringify({
            value: modifier?.value,
            valueByRefinement: modifier?.valueByRefinement,
            valueByStack: modifier?.valueByStack,
            valueByRefinementPerStack: modifier?.valueByRefinementPerStack
        });
    }

    function weaponTargetsOverlap(left, right, category) {
        const leftTargets = left?.applyTo || [];
        const rightTargets = right?.applyTo || [];
        if (leftTargets.some((target) => rightTargets.includes(target))) return true;
        const broadTarget = (target, candidates) => {
            if (category === "reactionBonus" && target === "reactionDamageBonus") {
                return candidates.some((candidate) => /(?:Reaction|Bloom|Burgeon|Hyperbloom|Crystallize|Charged|Conduct)DamageBonus$/i.test(candidate));
            }
            if (category === "damageBonus" && target === "allDamageBonus") {
                return candidates.some((candidate) => /DamageBonus$/.test(candidate));
            }
            if (category === "damageBonus" && ["allElementDamageBonus", "ownElementDamageBonus"].includes(target)) {
                return candidates.some((candidate) => /^(?:allElement|ownElement|pyro|hydro|electro|cryo|anemo|geo|dendro)DamageBonus$/.test(candidate));
            }
            if (category === "critBonus" && ["critRate", "critDamage"].includes(target)) {
                const suffix = target === "critRate" ? "CritRate" : "CritDamage";
                return candidates.some((candidate) => candidate.endsWith(suffix));
            }
            return false;
        };
        return leftTargets.some((target) => broadTarget(target, rightTargets))
            || rightTargets.some((target) => broadTarget(target, leftTargets));
    }

    function generatedWeaponRecordSuperseded(modifier, siblings) {
        if (!/_[0-9a-f]{8}$/i.test(String(modifier?.id || ""))) return false;
        const sourceText = String(modifier?.sourceText || "");
        if (!sourceText) return false;
        return siblings.some((candidate) => candidate !== modifier
            && !/_[0-9a-f]{8}$/i.test(String(candidate?.id || ""))
            && candidate?.category === modifier.category
            && String(candidate?.sourceText || "") === sourceText
            && weaponValueContract(candidate) === weaponValueContract(modifier)
            && weaponTargetsOverlap(modifier, candidate, modifier.category));
    }

    function normalizeWeaponModifier(modifier, siblings = [], weaponDefinition = {}) {
        const group = weaponEffectGroup(modifier, weaponDefinition);
        if (group) {
            const activation = group.activation || { type: "always" };
            const override = group.modifierOverrides?.[modifier.id] || {};
            const normalized = {
                ...modifier,
                ...override,
                effectGroupId: group.id,
                effectGroupOrder: (weaponDefinition.groups || []).indexOf(group),
                effectLabel: group.name,
                effectDescription: group.description || "",
                targetOwner: group.targetOwner || "self",
                inputPolicy: group.inputPolicy || "calculate",
                activation
            };
            if (group.inputPolicy === "reflected") normalized.uidHandling = "includedInUidStats";
            if (["calculate", "sourceContext"].includes(group.inputPolicy)) normalized.uidHandling = "conditional";
            if (group.inputPolicy === "displayOnly") {
                normalized.uidHandling = "displayOnly";
                normalized.auditDisposition = normalized.auditDisposition || "displayOnlyMisclassification";
            }
            if (group.inputPolicy === "sourceContext" || !["self", "enemy"].includes(group.targetOwner || "self")) {
                normalized.auditDisposition = normalized.auditDisposition || "sourceContextRequired";
            }
            if (activation.type === "always") normalized.condition = "always";
            if (activation.type === "toggle") {
                normalized.condition = activation.stateKey || "conditional";
                normalized.conditionLabel = activation.label || group.name;
                normalized.calculationSupport = "toggle";
                normalized.conditionGroupId = activation.stateKey || group.id;
            }
            if (activation.type === "stack") {
                normalized.condition = activation.stateKey || "stack";
                normalized.conditionLabel = activation.label || group.name;
                normalized.calculationSupport = "stack";
                normalized.conditionGroupId = activation.stateKey || group.id;
                normalized.stack = {
                    min: Number(activation.min) || 0,
                    max: Number(activation.max) || 0,
                    default: Number(activation.default) || 0
                };
                normalized.conditionInput = {
                    type: "stack",
                    label: activation.label || group.name,
                    min: normalized.stack.min,
                    max: normalized.stack.max,
                    unit: activation.unit || "層"
                };
            }
            if (activation.type === "option") {
                normalized.condition = activation.stateKey || "option";
                normalized.conditionLabel = activation.label || group.name;
                normalized.calculationSupport = "simple";
                normalized.conditionGroupId = activation.stateKey || group.id;
                normalized.conditionInput = {
                    type: "option",
                    label: activation.label || group.name,
                    options: activation.options || []
                };
            }
            return normalized;
        }
        const sourceText = String(modifier?.sourceText || "");
        if (!sourceText) return modifier;
        const targets = modifier.applyTo || [];
        const genericCrit = modifier.category === "critBonus"
            && targets.some((target) => ["critRate", "critDamage"].includes(target));
        const specificCritSibling = siblings.some((candidate) => {
            if (candidate === modifier || candidate.category !== "critBonus" || candidate.sourceText !== sourceText) return false;
            return (candidate.applyTo || []).some((target) => /Crit(?:Rate|Damage)$/.test(target));
        });
        const textWithoutCritDamage = sourceText.replace(/会心ダメージ/g, "会心補正");
        const critOnlyDamageRecord = modifier.category === "damageBonus"
            && /会心(?:率|ダメージ)/.test(sourceText)
            && !/ダメージ\s*[+＋-]/.test(textWithoutCritDamage)
            && siblings.some((candidate) => candidate.category === "critBonus" && candidate.sourceText === sourceText);
        if ((genericCrit && specificCritSibling)
            || critOnlyDamageRecord
            || duplicateWeaponRecord(modifier, siblings)
            || generatedWeaponRecordSuperseded(modifier, siblings)) {
            return fallbackWeaponMetadata({ ...modifier, auditDisposition: "supersededByStructuredRecord" });
        }
        return fallbackWeaponMetadata(modifier);
    }

    function collectTalentDamageEntries(calcData, context) {
        const characterTalents = calcData.talentScalings?.[context.characterId];
        const characterInfo = calcData.characters?.[context.characterId] || {};
        const warnings = [];
        if (!context.characterId) {
            warnings.push("キャラクターが未選択です。計算入力欄でキャラクターを選択してください。");
            return { entries: [], warnings };
        }
        if (!characterTalents) {
            warnings.push(`天賦倍率が未登録です: ${context.characterId}`);
            return { entries: [], warnings };
        }
        const groups = [
            ["normalAttack", characterTalents.normalAttack],
            ["skill", characterTalents.skill],
            ["burst", characterTalents.burst]
        ];
        const entries = [];
        const skillMode = buildAttackModeDefinitions(calcData, context).find((item) => item.group === "skill");
        const skillModeEnabled = Boolean(skillMode && attackModeIsEnabled(calcData, context, "skill"));
        groups.forEach(([group, talent]) => {
            (talent?.entries || []).forEach((entry) => {
                if (group === "skill" && skillMode?.attackTypes.includes(entry.attackType) && !skillModeEnabled) return;
                if (group === "normalAttack" && skillModeEnabled && skillMode?.attackTypes.includes(entry.attackType)) return;
                const directReactionId = calcData.reactionDefinitions?.directReactionEntryRules?.[context.characterId]?.[group]?.[entry.id]
                    || (/月感電/.test(entry.label || "") ? "lunarCharged"
                        : /月開花/.test(entry.label || "") ? "lunarBloom"
                            : /月結晶/.test(entry.label || "") ? "lunarCrystallize"
                                : /星電導/.test(entry.label || "") ? "stellarConduct" : "");
                const normalizedEntry = {
                    ...entry,
                    element: directReactionId
                        ? calcData.reactionDefinitions?.options?.[directReactionId]?.damageElement || normalizeDamageElement(entry, characterInfo)
                        : normalizeDamageElement(entry, characterInfo),
                    group,
                    directReactionId
                };
                entries.push(normalizeAttackModeEntry(normalizedEntry, group, calcData, context));
            });
        });
        return { entries, warnings };
    }

    function numericModifierValue(value) {
        if (typeof value === "string") {
            const parsed = Number(value.replace(/[%％,]/g, "").trim());
            return Number.isFinite(parsed) ? parsed : 0;
        }
        return Number(value) || 0;
    }

    function consumedResourceStack(modifier, context, analysis = {}) {
        const current = Number(context.manualInputs?.resourceStates?.[analysis.resourceStateKey]);
        if (!Number.isFinite(current)) return null;
        const maxConsumed = Number(modifier.resource?.maxConsumed);
        const consume = modifier.resource?.consume;
        if (consume === "all") return Number.isFinite(maxConsumed) ? Math.min(current, maxConsumed) : current;
        if (Number.isFinite(Number(consume))) return Math.min(current, Number(consume));
        if (consume?.type === "upTo") return Math.min(current, Number(consume.max) || current);
        return current;
    }

    function resolveModifierValue(modifier, context, uiState = context.uiState || {}, analysis = {}) {
        if (modifier.category === "reactionBaseDamageBonus") {
            const referenceValue = Number(context.stats?.[modifier.reference?.stat]) || 0;
            const value = Math.floor(referenceValue / (Number(modifier.divisor) || 1)) * (Number(modifier.ratio) || 0);
            return Number.isFinite(Number(modifier.maxValue)) ? Math.min(value, Number(modifier.maxValue)) : value;
        }
        const resourceStack = consumedResourceStack(modifier, context, analysis);
        const conditionState = uiState.conditionByModifier?.[analysis.conditionStateKey] || {};
        const conditionStack = modifier.conditionInput?.type === "stack" && Number.isFinite(Number(conditionState.stack))
            ? Number(conditionState.stack)
            : null;
        if (modifier.category === "reactionBonus" && modifier.effectiveAdditionalValuePerStack) {
            const reactionId = context.reactionOption?.reactionId || "none";
            const targetAliases = {
                overload: "overloadedDamageBonus",
                stellarConduct: "astralConductionDamageBonus"
            };
            const target = targetAliases[reactionId] || `${reactionId}DamageBonus`;
            const perStack = Number(modifier.effectiveAdditionalValuePerStack[target]) || 0;
            const stack = resourceStack ?? conditionStack ?? uiState.stackByModifier?.[modifier.id]
                ?? uiState.stack ?? modifier.stack?.default ?? 0;
            const maxStack = modifier.stack?.max ?? (Number(stack) || 0);
            return perStack * Math.min(Math.max(Number(stack) || 0, modifier.stack?.min ?? 0), maxStack);
        }
        if (modifier.valueByCondition) {
            const conditionKind = modifier.conditionInput?.type || "option";
            const conditionValue = conditionState[conditionKind];
            return numericModifierValue(modifier.valueByCondition[String(conditionValue)] ?? 0);
        }
        if (modifier.value !== undefined && modifier.calculationSupport === "stack" && (modifier.stack || resourceStack !== null)) {
            if (modifier.category === "extraDamage") return modifier.value;
            const min = modifier.stack?.min ?? 0;
            const max = modifier.stack?.max ?? modifier.resource?.maxConsumed ?? resourceStack ?? 0;
            const stack = Math.min(Math.max(resourceStack ?? conditionStack ?? uiState.stackByModifier?.[modifier.id] ?? uiState.stack ?? modifier.stack?.default ?? 0, min), max);
            return numericModifierValue(modifier.value) * stack;
        }
        if (modifier.value !== undefined) return numericModifierValue(modifier.value);
        if (modifier.valueByRefinementPerStack) {
            const perStack = modifier.valueByRefinementPerStack[String(context.refinement)]
                ?? modifier.valueByRefinementPerStack["1"];
            const sharedStackId = modifier.stackReferenceId || modifier.stack?.id || modifier.id;
            const stack = resourceStack ?? conditionStack ?? uiState.stackByModifier?.[sharedStackId]
                ?? uiState.stackByModifier?.[modifier.id] ?? uiState.stack ?? modifier.stack?.default ?? 0;
            const min = modifier.stack?.min ?? 0;
            const max = modifier.stack?.max ?? (Number(stack) || 0);
            return numericModifierValue(perStack) * Math.min(Math.max(Number(stack) || 0, min), max);
        }
        if (modifier.valueByRefinement) {
            const raw = modifier.valueByRefinement[String(context.refinement)] ?? modifier.valueByRefinement["1"];
            if (Array.isArray(raw)) {
                const stack = Math.min(Math.max(resourceStack ?? uiState.stackByModifier?.[modifier.id] ?? uiState.stack ?? modifier.stack?.default ?? 0, modifier.stack?.min ?? 0), modifier.stack?.max ?? raw.length);
                return numericModifierValue(raw[Math.max(stack - 1, 0)] ?? 0);
            }
            if (modifier.calculationSupport === "stack" && (modifier.stack || resourceStack !== null)) {
                if (modifier.category === "extraDamage") return Number(raw) || 0;
                const min = modifier.stack?.min ?? 0;
                const max = modifier.stack?.max ?? modifier.resource?.maxConsumed ?? resourceStack ?? 0;
                const stack = Math.min(Math.max(resourceStack ?? uiState.stackByModifier?.[modifier.id] ?? uiState.amosStack ?? modifier.stack?.default ?? 0, min), max);
                return numericModifierValue(raw) * stack;
            }
            return numericModifierValue(raw);
        }
        if (modifier.valueByLevel) {
            const levelSource = modifier.levelSource || modifier.valueSource?.section || "skill";
            const talentLevel = levelSource === "combat1" || levelSource === "normalAttack"
                ? context.talentLevels.normal
                : levelSource === "combat3" || levelSource === "burst"
                    ? context.talentLevels.burst
                    : context.talentLevels.skill;
            const level = Math.min(Math.max(Math.round(talentLevel || 1), 1), 15);
            return numericModifierValue(modifier.valueByLevel[String(level)] ?? modifier.valueByLevel["1"] ?? 0);
        }
        if (modifier.valueByStack) {
            const stack = resourceStack ?? conditionStack ?? uiState.stackByModifier?.[modifier.id] ?? uiState.stack ?? modifier.stack?.default ?? 0;
            return numericModifierValue(modifier.valueByStack[String(stack)] ?? 0);
        }
        if (modifier.valuePerStack) {
            const stack = resourceStack ?? conditionStack ?? uiState.stackByModifier?.[modifier.id] ?? uiState.stack ?? modifier.stack?.default ?? 0;
            return numericModifierValue(modifier.valuePerStack) * stack;
        }
        const structuredPerStackValue = [
            modifier.valuePerGeneratedStack,
            modifier.valuePerConsumedStack,
            modifier.valuePerExcessStack
        ].find((value) => value !== undefined && value !== null && value !== "");
        if (structuredPerStackValue !== undefined) {
            const stack = resourceStack ?? conditionStack ?? uiState.stackByModifier?.[modifier.id] ?? uiState.stack ?? modifier.stack?.default ?? 0;
            return numericModifierValue(structuredPerStackValue) * stack;
        }
        return 0;
    }

    function analyzeModifier(modifier, source = "", context = {}) {
        if (!window.GenshinModifierAnalyzer) {
            throw new Error("GenshinModifierAnalyzer が読み込まれていません");
        }
        return window.GenshinModifierAnalyzer.analyzeModifier({ modifier, source, context });
    }

    function modifierConditionEnabled(modifier, source, context, calcData) {
        if (!window.GenshinCalcConditions?.evaluateModifierCondition) {
            return false;
        }
        return Boolean(window.GenshinCalcConditions.evaluateModifierCondition({
            modifier,
            source,
            context,
            calcData
        }).enabled);
    }

    function talentModifierRepresentedByScalings(modifier, characterId, sourceId, talentScalings) {
        const group = {
            combat1: "normalAttack",
            combat2: "skill",
            combat3: "burst"
        }[sourceId] || "";
        const valueKeys = [
            "value", "valueByRefinement", "valueByStack", "valueByLevel", "valuePerStack",
            "valuePerGeneratedStack", "valuePerConsumedStack", "valuePerExcessStack", "valuePer1000",
            "valuePerStep", "valueByCondition", "critRate", "critDamage", "ratio", "maxValue",
            "scalings", "targetEffect", "effect", "resource"
        ];
        return Boolean(
            group
            && modifier?.category === "extraDamage"
            && modifier?.calculationSupport === "special"
            && (modifier.applyTo || []).includes("triggeredDamage")
            && !valueKeys.some((key) => Object.prototype.hasOwnProperty.call(modifier, key))
            && (talentScalings?.[characterId]?.[group]?.entries || []).length
        );
    }

    function collectActiveModifiers(calcData, context) {
        const applied = [];
        const candidates = [];
        const activeEffectGroups = new Set();

        function addCandidate(modifier, source, reason, analysis) {
            candidates.push({ modifier, source, reason, analysis });
        }

        function consider(rawModifier, source) {
            const talentSourceId = source.startsWith("talent:") ? source.slice("talent:".length) : "";
            const sourceModifier = rawModifier.modifier || rawModifier;
            const modifierIndex = rawModifier.modifierIndex || 0;
            if (talentSourceId && talentModifierRepresentedByScalings(
                sourceModifier,
                context.characterId,
                talentSourceId,
                calcData.talentScalings
            )) return;
            const modifier = normalizeArtifactModifier(
                normalizeTalentStateModifier(sourceModifier, source, calcData, context, modifierIndex),
                source
            );
            if (!modifier) return;
            const analysis = analyzeModifier(modifier, source, context);
            if (modifier.attackModeConflict) {
                addCandidate(modifier, source, modifier.attackModeConflictReason, {
                    ...analysis,
                    calculable: false,
                    reasonCode: "ATTACK_MODE_ELEMENT_CONFLICT"
                });
                return;
            }
            if (modifier.attackModeEncodedInScaling) return;
            if (analysis.inputStatus !== "applicable") {
                addCandidate(modifier, source, analysis.inputReason || analysis.status, analysis);
                return;
            }
            if (!analysis.calculable) {
                addCandidate(modifier, source, analysis.reason || "special未対応", analysis);
                return;
            }
            const uiEnabled = modifierConditionEnabled(modifier, source, context, calcData);
            if (analysis.requiresConditionEvaluation && !uiEnabled) {
                addCandidate(modifier, source, "条件OFF", analysis);
                return;
            }
            const dedupeKey = ["effectOverride", "extraDamage"].includes(analysis.calculation)
                ? window.GenshinModifierAnalyzer.modifierDedupeKey(analysis)
                : "";
            if (dedupeKey && activeEffectGroups.has(dedupeKey)) {
                addCandidate(modifier, source, "同一効果の計算済みレコードがあるため未適用", analysis);
                return;
            }
            if (dedupeKey) activeEffectGroups.add(dedupeKey);
            applied.push({ modifier, source, value: resolveModifierValue(modifier, context, context.uiState, analysis), analysis });
        }

        const talentPassives = calcData.talentModifiers?.[context.characterId]?.passives || [];
        talentPassives.forEach((passive) => {
            (passive.modifiers || []).forEach((modifier, modifierIndex) => {
                consider({ modifier, modifierIndex }, `talent:${passive.sourceId || context.characterId}`);
            });
        });

        const weaponModifiers = calcData.weaponModifiers?.[context.weaponId]?.modifiers || [];
        const weaponDefinition = calcData.weaponEffectRegistry?.weapons?.[context.weaponId] || {};
        weaponModifiers.forEach((modifier) => {
            consider(normalizeWeaponModifier(modifier, weaponModifiers, weaponDefinition), `weapon:${context.weaponId}`);
        });

        context.artifactSetIds.forEach((setId, index) => {
            const artifact = calcData.artifactSetModifiers?.[setId];
            (artifact?.twoPiece || []).forEach((modifier) => consider(modifier, `artifact2:${setId}`));
            if (context.artifactSetMode === "4pc" && index === 0) {
                (artifact?.fourPiece || []).forEach((modifier) => consider(modifier, `artifact4:${setId}`));
            }
        });

        const constellations = calcData.constellationModifiers?.[context.characterId]?.constellations || {};
        for (let level = 1; level <= context.constellation; level += 1) {
            (constellations[String(level)] || []).forEach((modifier) => consider(modifier, `constellation:C${level}`));
        }

        return { applied, candidates };
    }

    function elementBonusKey(element) {
        const elementMap = {
            "炎": "pyroDamageBonus",
            "水": "hydroDamageBonus",
            "雷": "electroDamageBonus",
            "氷": "cryoDamageBonus",
            "風": "anemoDamageBonus",
            "岩": "geoDamageBonus",
            "草": "dendroDamageBonus",
            physical: "physicalDamageBonus"
        };
        return elementMap[element] || "";
    }

    function modifierAppliesToEntry(modifier, entry) {
        const applyTo = modifier.applyTo || [];
        const map = {
            normalAttack: "normalAttackDamageBonus",
            chargedAttack: "chargedAttackDamageBonus",
            plungingAttack: "plungingAttackDamageBonus",
            skill: "skillDamageBonus",
            burst: "burstDamageBonus"
        };
        const target = map[entry.damageType] || map[entry.attackType];
        const elementTarget = elementBonusKey(entry.element);
        return applyTo.includes(target)
            || applyTo.includes(elementTarget)
            || applyTo.includes("allDamageBonus")
            || applyTo.includes("allElementDamageBonus")
            || applyTo.includes("ownElementDamageBonus");
    }

    function modifierTargetsEntry(modifier, entry) {
        if (Array.isArray(modifier.targetGroups) && !modifier.targetGroups.includes(entry.group)) return false;
        const targetEffects = Array.isArray(modifier.targetEffect)
            ? modifier.targetEffect
            : modifier.targetEffect ? [modifier.targetEffect] : [];
        if (targetEffects.length) {
            return Boolean(entry.effectId && targetEffects.includes(entry.effectId));
        }
        const applyTo = modifier.applyTo || [];
        if (entry.effectId && applyTo.includes(entry.effectId)) return true;
        if (entry.id && applyTo.includes(entry.id)) return true;
        if (applyTo.includes(`${entry.attackType}Damage`) || applyTo.includes(`${entry.damageType}Damage`)) return true;
        return applyTo.includes(entry.attackType)
            || applyTo.includes(entry.damageType)
            || modifierAppliesToEntry(modifier, entry);
    }

    function resolveReferenceBase(modifier, context) {
        if (modifier.reference?.type === "healingRecorded") {
            const recorded = Number(context.manualInputs?.recordedHealing) || 0;
            const maxValue = Number(modifier.reference.maxValue);
            return Number.isFinite(maxValue) ? Math.min(recorded, maxValue) : recorded;
        }
        const referenceStat = modifier.reference?.stat || "hp";
        if (modifier.reference?.source === "provider") {
            return Number(context.manualInputs?.providerStats?.[referenceStat]) || 0;
        }
        return Number(context.stats[referenceStat]) || 0;
    }

    function resolveReferencedValue(modifier, value, context) {
        const referenceValue = resolveReferenceBase(modifier, context);
        return referenceValue * (Number(value) || 0) / 100;
    }

    function normalizeStatTarget(target) {
        const map = {
            atkFlat: "atk",
            atkPercent: "atk",
            hpFlat: "hp",
            hpPercent: "hp",
            defFlat: "def",
            defPercent: "def",
            elementalMastery: "elementalMastery",
            energyRecharge: "energyRecharge",
            critRate: "critRate",
            critDamage: "critDamage"
        };
        return map[target] || target;
    }

    function resolveStatBonusValue(modifier, value, context) {
        const applyTo = modifier.applyTo || [];
        const targetStat = normalizeStatTarget(applyTo.includes("atk") || applyTo.includes("atkPercent") ? "atk" : applyTo[0]);
        if (!targetStat) return null;
        if (modifier.unit === "percentOfReference" || modifier.valueSource?.label === "攻撃力アップ") {
            const referenceStat = modifier.reference?.stat || "hp";
            const referenceValue = Number(context.stats[referenceStat]) || 0;
            return { stat: targetStat, value: referenceValue * (Number(value) || 0) / 100 };
        }
        if (modifier.unit === "percent") {
            return { stat: targetStat, value: (Number(context.stats[targetStat]) || 0) * (Number(value) || 0) / 100 };
        }
        return { stat: targetStat, value: Number(value) || 0 };
    }

    function resolveConversionBonusValue(modifier, value, context) {
        const targetStat = normalizeStatTarget((modifier.applyTo || [])[0]);
        const referenceStat = modifier.reference?.stat;
        if (!targetStat || !referenceStat) return null;
        const referenceValue = Number(context.stats[referenceStat]) || 0;
        if (modifier.customCalculation === "thresholdStatBonus") {
            const calculated = Math.floor(referenceValue / Number(modifier.divisor)) * Number(modifier.ratio);
            return {
                stat: targetStat,
                value: Number.isFinite(Number(modifier.maxValue)) ? Math.min(calculated, Number(modifier.maxValue)) : calculated
            };
        }
        const calculated = referenceValue * (Number(value) || 0) / 100;
        return {
            stat: targetStat,
            value: Number.isFinite(Number(modifier.maxValue)) ? Math.min(calculated, Number(modifier.maxValue)) : calculated
        };
    }

    function resolveScalingDamageBonus(modifier, context) {
        const referenceStat = modifier.reference?.stat;
        if (!referenceStat) return 0;
        const referenceValue = Number(context.stats[referenceStat]) || 0;
        const divisor = Number(modifier.divisor) || 1;
        const calculated = referenceValue / divisor * (Number(modifier.ratio) || 0);
        return Number.isFinite(Number(modifier.maxValue))
            ? Math.min(calculated, Number(modifier.maxValue))
            : calculated;
    }

    function resolveScalingAdditiveBaseDamage(modifier, context) {
        const referenceValue = resolveReferenceBase(modifier, context);
        const ratio = Number(modifier.ratio ?? modifier.value) || 0;
        const calculated = referenceValue * ratio / 100;
        return Number.isFinite(Number(modifier.maxValue))
            ? Math.min(calculated, Number(modifier.maxValue))
            : calculated;
    }

    function resistanceDebuffAppliesToEntry(modifier, entry) {
        const applyTo = modifier.applyTo || [];
        const element = normalizeResistanceElement(entry.element);
        const target = element === "physical" ? "physicalResistance" : `${element}Resistance`;
        return !applyTo.length || applyTo.includes(target) || applyTo.includes("allResistance");
    }

    function defenseModifierAppliesToEntry(modifier, entry) {
        if (entry.directReactionId || entry.attackType === "reaction" || entry.damageType === "reaction") return false;
        if (modifier.targetEffect) return modifierTargetsEntry(modifier, entry);
        if (Array.isArray(modifier.targetGroups) && !modifier.targetGroups.includes(entry.group)) return false;
        const scopedTargets = (modifier.applyTo || []).filter((target) => target !== "enemyDefense");
        if (!scopedTargets.length) return true;
        return modifierTargetsEntry({ ...modifier, applyTo: scopedTargets }, entry);
    }

    function reactionBonusApplies(modifier, reaction) {
        if (!reaction || reaction.reactionId === "none") return false;
        const applyTo = modifier.applyTo || [];
        if (!applyTo.length) return true;
        const reactionId = reaction.reactionId;
        const reactionType = reaction.family || reaction.reactionType;
        const aliases = {
            overload: ["overloaded"],
            stellarConduct: ["astralConduction", "lunarSuperconduct"]
        }[reactionId] || [];
        const reactionTargets = [
            "reactionDamageBonus",
            `${reactionId}DamageBonus`,
            `${reactionId}ReactionBonus`,
            `${reactionType}ReactionBonus`,
            `${reactionType}DamageBonus`,
            ...aliases.flatMap((alias) => [`${alias}DamageBonus`, `${alias}ReactionBonus`])
        ];
        if (["lunarBloom", "lunarCharged", "lunarCrystallize"].includes(reactionId)) {
            reactionTargets.push("moonReactionDamageBonus");
        }
        return reactionTargets.some((target) => applyTo.includes(target));
    }

    function reactionForDamageEntry(entry, context) {
        if (!entry?.directReactionId) return context.reactionOption || REACTION_OPTIONS.none;
        const definition = context.reactionDefinitions?.options?.[entry.directReactionId] || {};
        return {
            ...definition,
            reactionId: entry.directReactionId,
            family: "dedicated",
            reactionType: "dedicated",
            label: definition.labelJa || entry.directReactionId,
            enabled: true
        };
    }

    function reactionBaseDamageBonusApplies(modifier, reaction) {
        if (!reaction || reaction.family !== "dedicated") return false;
        const applyTo = modifier.applyTo || [];
        return applyTo.includes("moonReactionBaseDamageBonus")
            || applyTo.includes("stellarReactionBaseDamageBonus")
            || applyTo.includes(`${reaction.reactionId}BaseDamageBonus`);
    }

    function reactionCritApplies(modifier, reaction) {
        if (!reaction || reaction.reactionId === "none") return false;
        const applyTo = modifier.applyTo || [];
        if (!applyTo.length) return false;
        return applyTo.includes("reactionCrit")
            || applyTo.includes(`${reaction.reactionId}Crit`)
            || applyTo.includes(`${reaction.family || reaction.reactionType}ReactionCrit`);
    }

    function critBonusKind(modifier) {
        const targets = modifier.applyTo || [];
        if (targets.some((target) => target === "critRate" || /CritRate$/.test(target))) return "critRate";
        if (targets.some((target) => target === "critDamage" || /CritDamage$/.test(target))) return "critDamage";
        return "";
    }

    function critBonusApplies(modifier, entry) {
        const attackTargets = {
            normalAttackCritRate: "normalAttackDamageBonus",
            normalAttackCritDamage: "normalAttackDamageBonus",
            chargedAttackCritRate: "chargedAttackDamageBonus",
            chargedAttackCritDamage: "chargedAttackDamageBonus",
            plungingAttackCritRate: "plungingAttackDamageBonus",
            plungingAttackCritDamage: "plungingAttackDamageBonus",
            skillCritRate: "skillDamageBonus",
            skillCritDamage: "skillDamageBonus",
            burstCritRate: "burstDamageBonus",
            burstCritDamage: "burstDamageBonus"
        };
        const scopeTargets = (modifier.applyTo || [])
            .filter((target) => !["critRate", "critDamage"].includes(target))
            .map((target) => attackTargets[target] || target);
        if (!scopeTargets.length) return true;
        return modifierTargetsEntry({ ...modifier, applyTo: scopeTargets }, entry);
    }

    function applyModifiersToDamageEntry(entry, context, collected) {
        const applied = [];
        const candidates = [...collected.candidates];
        const totals = {
            damageBonus: 0,
            resistanceDebuff: 0,
            defenseDebuff: finiteNumber(context.enemy.defenseReduction ?? context.enemy.defenseDebuff, 0),
            defenseIgnore: finiteNumber(context.enemy.defenseIgnore, 0),
            statBonus: {},
            critRateBonus: 0,
            critDamageBonus: 0,
            reactionBonus: 0,
            reactionCritRate: 0,
            reactionCritDamage: 0,
            reactionBaseDamageBonus: 0,
            additiveBaseDamage: 0,
            finalDamageMultiplier: 1,
            effectOverrides: [],
            elementOverride: ""
        };
        const entryReaction = reactionForDamageEntry(entry, context);
        collected.applied.forEach((item) => {
            const { modifier, value, analysis } = item;
            if (modifier.category === "elementOverride" && modifierTargetsEntry(modifier, entry)) {
                totals.elementOverride = value || modifier.value || "";
                applied.push(item);
            } else if (["statBonus", "statConversion", "scalingStatBonus"].includes(analysis?.calculation)) {
                const statBonus = analysis.calculation === "statBonus"
                    ? resolveStatBonusValue(modifier, value, context)
                    : resolveConversionBonusValue(modifier, value, context);
                if (statBonus) {
                    if (["critRate", "critDamage"].includes(statBonus.stat) && !critBonusApplies(modifier, entry)) {
                        return;
                    }
                    if (statBonus.stat === "critRate") {
                        totals.critRateBonus += statBonus.value;
                    } else if (statBonus.stat === "critDamage") {
                        totals.critDamageBonus += statBonus.value;
                    } else {
                        totals.statBonus[statBonus.stat] = (totals.statBonus[statBonus.stat] || 0) + statBonus.value;
                    }
                    applied.push(item);
                } else {
                    candidates.push({ modifier, source: item.source, reason: "対象entry外" });
                }
            }
        });
        const effectiveEntry = totals.elementOverride ? { ...entry, element: totals.elementOverride } : entry;
        if (effectiveEntry.element !== "physical" && !entry.directReactionId) {
            totals.damageBonus += context.stats.elementDamageBonus;
        }
        collected.applied.forEach((item) => {
            const { modifier, value, analysis } = item;
            if (modifier.category === "elementOverride" || ["statBonus", "statConversion", "scalingStatBonus"].includes(analysis?.calculation)) {
                return;
            }
            if (modifier.category === "damageBonus" && modifierAppliesToEntry(modifier, effectiveEntry)) {
                if (entry.directReactionId) {
                    candidates.push({ modifier, source: item.source, reason: "専用反応式では通常ダメージバフ対象外", analysis });
                    return;
                }
                const effectOverrides = collected.applied.filter((overrideItem) => {
                    return overrideItem.source === item.source
                        && overrideItem.analysis?.calculation === "effectOverride"
                        && window.GenshinModifierAnalyzer.effectOverrideKind(overrideItem.modifier) === "effectValueMultiplier";
                });
                const effectValueMultiplier = effectOverrides.reduce((multiplier, overrideItem) => {
                    const increase = Number(window.GenshinModifierAnalyzer.effectOverrideValue(overrideItem.modifier)) || 0;
                    return multiplier * (1 + increase / 100);
                }, 1);
                totals.damageBonus += (Number(value) || 0) * effectValueMultiplier;
                applied.push(item);
                effectOverrides.forEach((overrideItem) => {
                    if (!applied.some((appliedItem) => appliedItem.analysis?.key === overrideItem.analysis?.key)) {
                        applied.push({ ...overrideItem, value: window.GenshinModifierAnalyzer.effectOverrideValue(overrideItem.modifier) });
                        totals.effectOverrides.push({
                            id: overrideItem.modifier.id || "",
                            kind: "effectValueMultiplier",
                            multiplier: 1 + Number(window.GenshinModifierAnalyzer.effectOverrideValue(overrideItem.modifier)) / 100,
                            source: overrideItem.source
                        });
                    }
                });
            } else if (modifier.category === "critBonus" && critBonusApplies(modifier, effectiveEntry)) {
                const kind = critBonusKind(modifier);
                if (kind === "critRate") {
                    totals.critRateBonus += Number(value) || 0;
                    applied.push(item);
                } else if (kind === "critDamage") {
                    totals.critDamageBonus += Number(value) || 0;
                    applied.push(item);
                } else {
                    candidates.push({ modifier, source: item.source, reason: "対象entry外" });
                }
            } else if (analysis?.calculation === "additiveBaseDamage" && modifierTargetsEntry(modifier, effectiveEntry)) {
                const additiveValue = modifier.reference
                    ? resolveReferencedValue(modifier, value, context)
                    : Number(value) || 0;
                totals.additiveBaseDamage += additiveValue;
                applied.push({ ...item, value: additiveValue });
            } else if (analysis?.calculation === "scalingAdditiveBaseDamage" && modifierTargetsEntry(modifier, effectiveEntry)) {
                const additiveValue = resolveScalingAdditiveBaseDamage(modifier, context);
                totals.additiveBaseDamage += additiveValue;
                applied.push({ ...item, value: additiveValue });
            } else if (analysis?.calculation === "scalingDamageBonus" && modifierAppliesToEntry(modifier, effectiveEntry)) {
                const scalingDamageBonus = resolveScalingDamageBonus(modifier, context);
                totals.damageBonus += scalingDamageBonus;
                applied.push({ ...item, value: scalingDamageBonus });
            } else if (modifier.category === "resistanceDebuff" && resistanceDebuffAppliesToEntry(modifier, effectiveEntry)) {
                totals.resistanceDebuff += Math.abs(Number(value) || 0);
                applied.push(item);
            } else if (modifier.category === "defenseDebuff" && defenseModifierAppliesToEntry(modifier, effectiveEntry)) {
                totals.defenseDebuff += Math.abs(Number(value) || 0);
                applied.push(item);
            } else if (modifier.category === "defenseIgnore" && defenseModifierAppliesToEntry(modifier, effectiveEntry)) {
                totals.defenseIgnore += Math.abs(Number(value) || 0);
                applied.push(item);
            } else if (modifier.category === "reactionBonus" && reactionBonusApplies(modifier, entryReaction)) {
                totals.reactionBonus += Number(value) || 0;
                applied.push(item);
            } else if (modifier.category === "reactionCritBonus" && reactionCritApplies(modifier, entryReaction)) {
                totals.reactionCritRate += Number(modifier.critRate) || 0;
                totals.reactionCritDamage += Number(modifier.critDamage) || 0;
                applied.push(item);
            } else if (modifier.category === "reactionBaseDamageBonus" && reactionBaseDamageBonusApplies(modifier, entryReaction)) {
                totals.reactionBaseDamageBonus += Number(value) || 0;
                applied.push(item);
            } else if (analysis?.calculation === "effectOverride") {
                const overrideKind = window.GenshinModifierAnalyzer.effectOverrideKind(modifier);
                if (overrideKind === "effectValueMultiplier") {
                    return;
                }
                if (modifierTargetsEntry(modifier, effectiveEntry)) {
                    const overrideValue = Number(window.GenshinModifierAnalyzer.effectOverrideValue(modifier));
                    totals.finalDamageMultiplier *= overrideValue / 100;
                    applied.push({ ...item, value: overrideValue });
                    totals.effectOverrides.push({
                        id: modifier.id || "",
                        kind: "damageMultiplier",
                        multiplier: overrideValue / 100,
                        source: item.source
                    });
                } else {
                    candidates.push({ modifier, source: item.source, reason: "対象entry外", analysis });
                }
            } else if (analysis?.calculation === "extraDamage") {
                return;
            } else {
                candidates.push({ modifier, source: item.source, reason: "対象entry外" });
            }
        });
        return { entry: effectiveEntry, totals, applied, candidates };
    }

    function clampPercent(value, maximum = 100) {
        return Math.min(Math.max(finiteNumber(value, 0), 0), maximum);
    }

    function resolveDefenseReduction(enemy = {}) {
        return clampPercent(enemy.defenseReduction ?? enemy.defenseDebuff, 90);
    }

    function resolveDefenseIgnore(enemy = {}) {
        return clampPercent(enemy.defenseIgnore, 100);
    }

    function defenseMultiplier(context) {
        const lv = finiteNumber(context.enemy.characterLevel, 90);
        const eLv = finiteNumber(context.enemy.enemyLevel, 90);
        const defenseReduction = resolveDefenseReduction(context.enemy);
        const defenseIgnore = resolveDefenseIgnore(context.enemy);
        return (lv + 100) / ((1 - defenseIgnore / 100) * (1 - defenseReduction / 100) * (eLv + 100) + lv + 100);
    }

    function resistanceMultiplier(resistance) {
        if (resistance < 0) return 1 - resistance / 200;
        if (resistance < 75) return 1 - resistance / 100;
        return 1 / (resistance / 25 + 1);
    }

    function reactionLevelValue(context, tableName) {
        const table = context.reactionDefinitions?.[tableName] || {};
        const level = Math.min(Math.max(Math.round(Number(context.enemy?.characterLevel) || 90), 1), 100);
        if (Number.isFinite(Number(table[String(level)]))) return Number(table[String(level)]);
        const knownLevels = Object.keys(table).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
        const lower = [...knownLevels].reverse().find((value) => value <= level);
        const upper = knownLevels.find((value) => value >= level);
        if (lower === undefined || upper === undefined) return 0;
        if (lower === upper) return Number(table[String(lower)]) || 0;
        const ratio = (level - lower) / (upper - lower);
        return Number(table[String(lower)]) + (Number(table[String(upper)]) - Number(table[String(lower)])) * ratio;
    }

    function reactionEmBonusPercent(family, elementalMastery) {
        const em = Math.max(Number(elementalMastery) || 0, 0);
        if (family === "amplifying") return 278 * em / (em + 1400);
        if (family === "additive") return 500 * em / (em + 1200);
        if (family === "transformative") return 1600 * em / (em + 2000);
        if (family === "shield") return 444 * em / (em + 1400);
        if (family === "dedicated") return 600 * em / (em + 2000);
        return 0;
    }

    function dedicatedDirectCoefficient(reaction, context) {
        if (reaction.reactionId !== "stellarConduct") return Number(reaction.directCoefficient) || 1;
        const stacks = Math.min(Math.max(Number(context.manualInputs?.stellarConductStacks) || 0, 0), Number(reaction.maxFieldStacks) || 12);
        return (Number(reaction.directCoefficientBase) || 1.4) + stacks * (Number(reaction.directCoefficientPerStack) || 0.05);
    }

    function reactionAttackAdjustment(context, reactionBonus = 0) {
        const reaction = context.reactionOption || REACTION_OPTIONS.none;
        const family = reaction.family || reaction.reactionType || "none";
        const emBonus = reactionEmBonusPercent(family, context.stats.elementalMastery);
        const detail = { ...reaction, elementalMasteryBonus: emBonus, reactionBonus };
        if (family === "amplifying" && reaction.enabled) {
            return {
                multiplier: reaction.coefficient * (1 + (emBonus + reactionBonus) / 100),
                additiveBaseDamage: 0,
                detail
            };
        }
        if (family === "additive" && reaction.enabled) {
            const levelMultiplier = reactionLevelValue(context, "characterLevelMultipliers");
            return {
                multiplier: 1,
                additiveBaseDamage: levelMultiplier * reaction.coefficient * (1 + (emBonus + reactionBonus) / 100),
                detail: { ...detail, levelMultiplier }
            };
        }
        return { multiplier: 1, additiveBaseDamage: 0, detail };
    }

    function calculateScalingParts(entry, context, appliedModifiers, talentLevel, problems) {
        const scalings = Array.isArray(entry.scalings) ? entry.scalings : [];
        if (!scalings.length) {
            problems.push("天賦倍率データが不足しています。");
            return [];
        }
        return scalings.map((scaling) => {
            const talentMultiplier = Number(scaling?.valuesByLevel?.[String(talentLevel)]);
            const rawStatValue = scaling?.stat === "fixedDamage" ? 1 : Number(context.stats[scaling?.stat]);
            const statValue = rawStatValue + (appliedModifiers.totals.statBonus?.[scaling?.stat] || 0);
            const valid = Number.isFinite(talentMultiplier) && Number.isFinite(statValue);
            if (!valid) {
                problems.push("天賦倍率または参照ステータスが不足しています。");
            }
            return {
                stat: scaling?.stat || "-",
                statValue: Number.isFinite(statValue) ? statValue : 0,
                talentMultiplier: Number.isFinite(talentMultiplier) ? talentMultiplier : 0,
                baseDamage: valid
                    ? scaling?.stat === "fixedDamage" ? talentMultiplier : statValue * talentMultiplier / 100
                    : 0
            };
        });
    }

    function calculateDamage(entry, context, appliedModifiers) {
        const effectiveEntry = appliedModifiers.entry || entry;
        const talentLevel = Math.min(Math.max(Math.round(getTalentLevel(context, entry)), 1), 15);
        const problems = [];
        const scalingParts = calculateScalingParts(entry, context, appliedModifiers, talentLevel, problems);
        const scalingBaseDamage = scalingParts.reduce((sum, part) => sum + part.baseDamage, 0);
        const directReaction = reactionForDamageEntry(entry, context);
        if (entry.directReactionId) {
            const coefficient = dedicatedDirectCoefficient(directReaction, context);
            const emBonus = reactionEmBonusPercent("dedicated", context.stats.elementalMastery);
            const baseDamageBonus = appliedModifiers.totals.reactionBaseDamageBonus || 0;
            const reactionBonus = appliedModifiers.totals.reactionBonus || 0;
            const baseDamage = problems.length ? 0
                : scalingBaseDamage * coefficient
                    * (1 + baseDamageBonus / 100)
                    * (1 + (emBonus + reactionBonus) / 100)
                    + (appliedModifiers.totals.additiveBaseDamage || 0);
            const resistanceElement = resolveDamageResistanceElement(effectiveEntry, directReaction);
            const effectiveResistance = resolveEffectiveResistance(context.enemy, resistanceElement, appliedModifiers.totals.resistanceDebuff);
            const resMultiplier = resistanceMultiplier(effectiveResistance);
            const nonCrit = baseDamage * resMultiplier * appliedModifiers.totals.finalDamageMultiplier;
            const critRate = context.stats.critRate + (appliedModifiers.totals.critRateBonus || 0) + (appliedModifiers.totals.reactionCritRate || 0);
            const critDamage = context.stats.critDamage + (appliedModifiers.totals.critDamageBonus || 0) + (appliedModifiers.totals.reactionCritDamage || 0);
            const crit = nonCrit * (1 + critDamage / 100);
            const expected = nonCrit * (1 + Math.min(Math.max(critRate, 0), 100) / 100 * critDamage / 100);
            const hitCount = Number(entry.hitCount) || 1;
            return {
                entry: { ...appliedModifiers.entry, dedicatedReactionId: entry.directReactionId },
                problems,
                nonCrit,
                crit,
                expected,
                total: { nonCrit: nonCrit * hitCount, crit: crit * hitCount, expected: expected * hitCount },
                breakdown: {
                    talentLevel,
                    hitCount,
                    scalingParts,
                    damageBonus: 0,
                    statBonus: appliedModifiers.totals.statBonus,
                    additiveBaseDamage: appliedModifiers.totals.additiveBaseDamage,
                    reactionAdditiveBaseDamage: 0,
                    reactionBaseDamageBonus: baseDamageBonus,
                    reactionBonus,
                    finalDamageMultiplier: appliedModifiers.totals.finalDamageMultiplier,
                    effectOverrides: appliedModifiers.totals.effectOverrides,
                    critRate,
                    critDamage,
                    defenseMultiplier: 1,
                    defenseDebuff: 0,
                    defenseIgnore: 0,
                    resistance: effectiveResistance,
                    resistanceMultiplier: resMultiplier,
                    reaction: {
                        ...directReaction,
                        label: `${directReaction.label}（天賦直撃）`,
                        baseMultiplier: coefficient,
                        elementalMasteryBonus: emBonus,
                        reactionBonus,
                        baseDamageBonus,
                        stellarConductStacks: directReaction.reactionId === "stellarConduct" ? context.manualInputs?.stellarConductStacks || 0 : null
                    },
                    appliedModifiers: appliedModifiers.applied,
                    skippedModifiers: appliedModifiers.candidates,
                    inputStats: {
                        hp: context.stats.hp,
                        atk: context.stats.atk,
                        def: context.stats.def,
                        elementalMastery: context.stats.elementalMastery,
                        critRate: context.stats.critRate,
                        critDamage: context.stats.critDamage,
                        elementDamageBonus: context.stats.elementDamageBonus
                    }
                }
            };
        }
        const reaction = reactionAttackAdjustment(context, appliedModifiers.totals.reactionBonus);
        const baseDamage = problems.length ? 0 : scalingBaseDamage
            + (appliedModifiers.totals.additiveBaseDamage || 0)
            + reaction.additiveBaseDamage;
        const damageBonusMultiplier = 1 + appliedModifiers.totals.damageBonus / 100;
        const defenseReduction = resolveDefenseReduction({ defenseReduction: appliedModifiers.totals.defenseDebuff });
        const defenseIgnore = resolveDefenseIgnore({ defenseIgnore: appliedModifiers.totals.defenseIgnore });
        const defMultiplier = defenseMultiplier({
            ...context,
            enemy: {
                ...context.enemy,
                defenseReduction,
                defenseIgnore
            }
        });
        const resistanceElement = resolveDamageResistanceElement(effectiveEntry, reaction.detail);
        const effectiveResistance = resolveEffectiveResistance(context.enemy, resistanceElement, appliedModifiers.totals.resistanceDebuff);
        const resMultiplier = resistanceMultiplier(effectiveResistance);
        const nonCrit = baseDamage * damageBonusMultiplier * defMultiplier * resMultiplier * reaction.multiplier * appliedModifiers.totals.finalDamageMultiplier;
        const critRate = context.stats.critRate + (appliedModifiers.totals.critRateBonus || 0);
        const critDamage = context.stats.critDamage + (appliedModifiers.totals.critDamageBonus || 0);
        const crit = nonCrit * (1 + critDamage / 100);
        const expected = nonCrit * (1 + (critRate / 100) * (critDamage / 100));
        const hitCount = Number(entry.hitCount) || 1;
        return {
            entry: effectiveEntry,
            problems,
            nonCrit,
            crit,
            expected,
            total: {
                nonCrit: nonCrit * hitCount,
                crit: crit * hitCount,
                expected: expected * hitCount
            },
            breakdown: {
                talentLevel,
                hitCount,
                scalingParts,
                damageBonus: appliedModifiers.totals.damageBonus,
                statBonus: appliedModifiers.totals.statBonus,
                additiveBaseDamage: appliedModifiers.totals.additiveBaseDamage,
                reactionAdditiveBaseDamage: reaction.additiveBaseDamage,
                reactionBonus: appliedModifiers.totals.reactionBonus,
                finalDamageMultiplier: appliedModifiers.totals.finalDamageMultiplier,
                effectOverrides: appliedModifiers.totals.effectOverrides,
                critRate,
                critDamage,
                defenseMultiplier: defMultiplier,
                defenseDebuff: defenseReduction,
                defenseReduction,
                defenseIgnore,
                resistance: effectiveResistance,
                resistanceMultiplier: resMultiplier,
                reaction: reaction.detail,
                appliedModifiers: appliedModifiers.applied,
                skippedModifiers: appliedModifiers.candidates,
                inputStats: {
                    hp: context.stats.hp,
                    atk: context.stats.atk,
                    def: context.stats.def,
                    elementalMastery: context.stats.elementalMastery,
                    critRate: context.stats.critRate,
                    critDamage: context.stats.critDamage,
                    elementDamageBonus: context.stats.elementDamageBonus
                }
            }
        };
    }

    function collectReactionTotals(context, collected) {
        const reaction = context.reactionOption || REACTION_OPTIONS.none;
        const reactionEntry = {
            attackType: "reaction",
            damageType: "reaction",
            element: reaction.damageElement || "physical"
        };
        const totals = {
            reactionBonus: 0,
            baseDamageBonus: 0,
            critRate: 0,
            critDamage: 0,
            resistanceDebuff: 0,
            applied: []
        };
        (collected.applied || []).forEach((item) => {
            const { modifier, value } = item;
            if (modifier.category === "reactionBonus" && reactionBonusApplies(modifier, reaction)) {
                totals.reactionBonus += Number(value) || 0;
                totals.applied.push(item);
            } else if (modifier.category === "reactionBaseDamageBonus" && reactionBaseDamageBonusApplies(modifier, reaction)) {
                totals.baseDamageBonus += Number(value) || 0;
                totals.applied.push(item);
            } else if (modifier.category === "reactionCritBonus" && reactionCritApplies(modifier, reaction)) {
                totals.critRate += Number(modifier.critRate) || 0;
                totals.critDamage += Number(modifier.critDamage) || 0;
                totals.applied.push(item);
            } else if (modifier.category === "resistanceDebuff" && resistanceDebuffAppliesToEntry(modifier, reactionEntry)) {
                totals.resistanceDebuff += Math.abs(Number(value) || 0);
                totals.applied.push(item);
            }
        });
        return totals;
    }

    function combineRankedContributions(values, weights) {
        return [...values].sort((a, b) => b - a).reduce((sum, value, index) => sum + value * (weights[index] ?? 0), 0);
    }

    function buildIndirectLunarResult(context, collected, reaction) {
        const totals = collectReactionTotals(context, collected);
        const weights = reaction.contributionWeights || [1, 0.5, 1 / 12, 1 / 12];
        const resistanceElement = resolveDamageResistanceElement({
            attackType: "reaction",
            damageType: "reaction",
            element: reaction.damageElement
        }, reaction);
        const effectiveResistance = resolveEffectiveResistance(context.enemy, resistanceElement, totals.resistanceDebuff);
        const resMultiplier = resistanceMultiplier(effectiveResistance);
        const current = {
            slot: 1,
            source: "currentCharacter",
            level: context.enemy.characterLevel,
            elementalMastery: context.stats.elementalMastery,
            critRate: Math.min(Math.max(context.stats.critRate + totals.critRate, 0), 100),
            critDamage: Math.max(context.stats.critDamage + totals.critDamage, 0),
            reactionBonus: totals.reactionBonus,
            baseDamageBonus: totals.baseDamageBonus
        };
        const contributors = [current, ...(context.manualInputs?.reactionContributors || []).slice(0, 3)].map((contributor) => {
            const levelContext = { ...context, enemy: { ...context.enemy, characterLevel: contributor.level } };
            const levelMultiplier = reactionLevelValue(levelContext, "characterLevelMultipliers");
            const emBonus = reactionEmBonusPercent("dedicated", contributor.elementalMastery);
            const baseDamageBonus = totals.baseDamageBonus + (contributor.slot === 1 ? 0 : Number(contributor.baseDamageBonus) || 0);
            const reactionBonus = contributor.slot === 1 ? totals.reactionBonus : Number(contributor.reactionBonus) || 0;
            const nonCrit = reaction.coefficient * levelMultiplier
                * (1 + baseDamageBonus / 100)
                * (1 + (emBonus + reactionBonus) / 100)
                * resMultiplier;
            return {
                ...contributor,
                levelMultiplier,
                elementalMasteryBonus: emBonus,
                baseDamageBonus,
                reactionBonus,
                nonCrit,
                crit: nonCrit * (1 + contributor.critDamage / 100)
            };
        });
        const nonCrit = combineRankedContributions(contributors.map((item) => item.nonCrit), weights);
        const crit = combineRankedContributions(contributors.map((item) => item.crit), weights);
        let expected = 0;
        const stateCount = 2 ** contributors.length;
        for (let mask = 0; mask < stateCount; mask += 1) {
            let probability = 1;
            const values = contributors.map((item, index) => {
                const didCrit = Boolean(mask & (1 << index));
                const critChance = Math.min(Math.max(item.critRate, 0), 100) / 100;
                probability *= didCrit ? critChance : 1 - critChance;
                return didCrit ? item.crit : item.nonCrit;
            });
            expected += probability * combineRankedContributions(values, weights);
        }
        return {
            entry: {
                id: `reaction_${reaction.reactionId}`,
                label: `${reaction.label}ダメージ（参加者${contributors.length}人）`,
                attackType: "reaction",
                damageType: "reaction",
                element: reaction.damageElement,
                hitCount: 1,
                group: "reaction",
                resultKind: "damage"
            },
            problems: [],
            nonCrit,
            crit,
            expected,
            total: { nonCrit, crit, expected },
            breakdown: {
                talentLevel: null,
                hitCount: 1,
                scalingParts: [],
                damageBonus: 0,
                statBonus: {},
                additiveBaseDamage: 0,
                reactionAdditiveBaseDamage: 0,
                reactionBaseDamageBonus: totals.baseDamageBonus,
                reactionBonus: totals.reactionBonus,
                finalDamageMultiplier: 1,
                effectOverrides: [],
                critRate: current.critRate,
                critDamage: current.critDamage,
                defenseMultiplier: 1,
                defenseDebuff: 0,
                defenseIgnore: 0,
                resistance: effectiveResistance,
                resistanceMultiplier: resMultiplier,
                reaction: {
                    ...reaction,
                    baseMultiplier: reaction.coefficient,
                    label: `${reaction.label}（元素付着）`,
                    contributors,
                    contributionWeights: weights
                },
                appliedModifiers: totals.applied,
                skippedModifiers: [],
                inputStats: {
                    hp: context.stats.hp,
                    atk: context.stats.atk,
                    def: context.stats.def,
                    elementalMastery: context.stats.elementalMastery,
                    critRate: context.stats.critRate,
                    critDamage: context.stats.critDamage,
                    elementDamageBonus: context.stats.elementDamageBonus
                }
            }
        };
    }

    function buildStandaloneReactionResult(context, collected) {
        const reaction = context.reactionOption || REACTION_OPTIONS.none;
        const family = reaction.family || reaction.reactionType || "none";
        if (!reaction.enabled) return null;
        if (family === "dedicated") {
            return reaction.dedicatedKind === "indirectLunar" && reaction.standaloneDamage
                ? buildIndirectLunarResult(context, collected, reaction)
                : null;
        }
        if (!["transformative", "shield"].includes(family)) return null;
        const totals = collectReactionTotals(context, collected);
        const emBonus = reactionEmBonusPercent(family, context.stats.elementalMastery);
        const isShield = family === "shield";
        const levelMultiplier = reactionLevelValue(
            context,
            isShield ? "crystallizeShieldBase" : "characterLevelMultipliers"
        );
        const baseValue = isShield ? levelMultiplier : levelMultiplier * reaction.coefficient;
        const resistanceElement = resolveDamageResistanceElement({
            attackType: "reaction",
            damageType: "reaction",
            element: reaction.damageElement
        }, reaction);
        const effectiveResistance = resolveEffectiveResistance(context.enemy, resistanceElement, totals.resistanceDebuff);
        const resMultiplier = isShield ? 1 : resistanceMultiplier(effectiveResistance);
        const nonCrit = baseValue * (1 + (emBonus + (isShield ? 0 : totals.reactionBonus)) / 100) * resMultiplier;
        const canCrit = !isShield && totals.critRate > 0 && totals.critDamage > 0;
        const crit = canCrit ? nonCrit * (1 + totals.critDamage / 100) : nonCrit;
        const expected = canCrit
            ? nonCrit * (1 + totals.critRate / 100 * totals.critDamage / 100)
            : nonCrit;
        return {
            entry: {
                id: `reaction_${reaction.reactionId}`,
                label: isShield ? `${reaction.label}シールド` : `${reaction.label}ダメージ`,
                attackType: "reaction",
                damageType: "reaction",
                element: reaction.damageElement || "-",
                hitCount: 1,
                group: "reaction",
                resultKind: isShield ? "shield" : "damage"
            },
            problems: [],
            nonCrit,
            crit,
            expected,
            total: { nonCrit, crit, expected },
            breakdown: {
                talentLevel: null,
                hitCount: 1,
                scalingParts: [{
                    stat: isShield ? "crystallizeShieldBase" : "reactionLevelMultiplier",
                    statValue: levelMultiplier,
                    talentMultiplier: isShield ? 100 : reaction.coefficient * 100,
                    baseDamage: baseValue
                }],
                damageBonus: 0,
                statBonus: {},
                additiveBaseDamage: 0,
                reactionAdditiveBaseDamage: 0,
                reactionBonus: totals.reactionBonus,
                finalDamageMultiplier: 1,
                effectOverrides: [],
                critRate: totals.critRate,
                critDamage: totals.critDamage,
                defenseMultiplier: 1,
                defenseDebuff: 0,
                defenseIgnore: 0,
                resistance: isShield ? null : effectiveResistance,
                resistanceMultiplier: resMultiplier,
                reaction: {
                    ...reaction,
                    levelMultiplier,
                    elementalMasteryBonus: emBonus,
                    reactionBonus: totals.reactionBonus,
                    critRate: totals.critRate,
                    critDamage: totals.critDamage
                },
                appliedModifiers: totals.applied,
                skippedModifiers: [],
                inputStats: {
                    hp: context.stats.hp,
                    atk: context.stats.atk,
                    def: context.stats.def,
                    elementalMastery: context.stats.elementalMastery,
                    critRate: context.stats.critRate,
                    critDamage: context.stats.critDamage,
                    elementDamageBonus: context.stats.elementDamageBonus
                }
            }
        };
    }

    function valueAsLevelMap(value) {
        const map = {};
        for (let level = 1; level <= 15; level += 1) {
            map[String(level)] = Number(value) || 0;
        }
        return map;
    }

    function extraDamageLabel(modifier, source) {
        if (modifier.label) return modifier.label;
        if (modifier.sourceText) {
            return String(modifier.sourceText).replace(/\s+/g, " ").slice(0, 36);
        }
        if (source?.startsWith("weapon:")) return "武器追加ダメージ";
        if (source?.startsWith("constellation:")) return "命ノ星座追加ダメージ";
        if (source?.startsWith("talent:")) return "天賦追加ダメージ";
        return "追加ダメージ";
    }

    function normalizeExtraDamageScalings(scalings, modifier, context, analysis) {
        const resourceStack = consumedResourceStack(modifier, context, analysis) ?? 0;
        return (scalings || []).map((scaling) => ({
            ...scaling,
            valuesByLevel: scaling.valuesByLevel || valueAsLevelMap(
                scaling.valuePerStack !== undefined
                    ? numericModifierValue(scaling.valuePerStack) * resourceStack
                    : scaling.value
            )
        }));
    }

    function scaleEntryScalings(entry, rate) {
        return (entry.scalings || []).map((scaling) => ({
            ...scaling,
            valuesByLevel: Object.fromEntries(Object.entries(scaling.valuesByLevel || {}).map(([level, value]) => {
                return [level, (Number(value) || 0) * rate];
            }))
        }));
    }

    function buildExtraDamageEntries(collected, talentEntries, context) {
        return collected.applied
            .filter((item) => item.analysis?.calculable && item.analysis.calculation === "extraDamage")
            .flatMap((item) => {
                const { modifier, source, value } = item;
                const label = extraDamageLabel(modifier, source);
                const baseAttackType = window.GenshinModifierAnalyzer.extraDamageBaseAttackType(modifier);
                if (modifier.reference?.type === "healingRecorded") {
                    const fixedDamage = resolveReferencedValue(modifier, value, context);
                    return [{
                        id: modifier.id || `extra_${source}`,
                        effectId: modifier.id || "",
                        label,
                        attackType: "extraDamage",
                        damageType: "extraDamage",
                        element: modifier.element || "physical",
                        hitCount: Number(modifier.hitCount) || 1,
                        scalings: [{ stat: "fixedDamage", valuesByLevel: valueAsLevelMap(fixedDamage) }],
                        group: "extraDamage",
                        sourceModifier: item
                    }];
                }
                if (!modifier.reference?.stat && !(modifier.scalings || []).length && baseAttackType) {
                    const rate = (Number(value) || 0) / 100;
                    return talentEntries
                        .filter((entry) => entry.attackType === baseAttackType)
                        .map((entry, index) => ({
                            ...entry,
                            id: `${modifier.id || `extra_${source}`}_${entry.id || index}`,
                            effectId: modifier.id || "",
                            label: `${label}: ${entry.label}`,
                            element: modifier.element || entry.element,
                            hitCount: (Number(entry.hitCount) || 1) * (Number(modifier.extraCount) || 1),
                            scalings: scaleEntryScalings(entry, rate),
                            group: "extraDamage",
                            sourceModifier: item
                        }));
                }
                const scalings = Array.isArray(modifier.scalings) && modifier.scalings.length
                    ? normalizeExtraDamageScalings(modifier.scalings, modifier, context, item.analysis)
                    : [{
                        stat: modifier.reference?.stat || "atk",
                        valuesByLevel: valueAsLevelMap(value)
                    }];
                return [{
                    id: modifier.id || `extra_${source}`,
                    effectId: modifier.id || "",
                    label,
                    attackType: modifier.damageType || "extraDamage",
                    damageType: modifier.damageType || "extraDamage",
                    element: modifier.element || "physical",
                    hitCount: Number(modifier.extraCount) || Number(modifier.hitCount) || 1,
                    scalings,
                    group: "extraDamage",
                    sourceModifier: item
                }];
            });
    }

    function filterRelevantWarnings(warnings, context) {
        const setIds = new Set(context.artifactSetIds || []);
        if (!context.characterId) {
            return (warnings || []).filter((warning) => {
                const message = warning.message || "";
                return warning.level === "error" || message.includes("読み込みに失敗");
            });
        }
        return (warnings || []).filter((warning) => {
            const message = warning.message || "";
            if (warning.level === "error" || message.includes("読み込みに失敗")) return true;
            if (message.includes(`talentModifiers.${context.characterId}`)) return true;
            if (message.includes(`constellationModifiers.${context.characterId}`)) return true;
            if (context.weaponId && message.includes(`weaponModifiers.${context.weaponId}`)) return true;
            if ([...setIds].some((setId) => message.includes(`artifactSetModifiers.${setId}`))) return true;
            if (message.startsWith(`${context.characterId}.`)) return true;
            return false;
        });
    }

    async function runGenshinJsonCalc() {
        const calcData = await window.GenshinCalcData.loadGenshinCalcData();
        const context = buildCharacterCalcContext();
        hydrateReactionContext(context, calcData);
        window.GenshinCalcConditions.reconcileConditionState(context, calcData);
        window.GenshinCalcConditions.reconcileResourceState(context, calcData);
        window.GenshinCalcConditions.reconcileComplexConditionState(context, calcData);
        const talentResult = collectTalentDamageEntries(calcData, context);
        const collected = collectActiveModifiers(calcData, context);
        const extraEntries = buildExtraDamageEntries(collected, talentResult.entries, context);
        const results = [...talentResult.entries, ...extraEntries].map((entry) => {
            const entryModifiers = applyModifiersToDamageEntry(entry, context, collected);
            return calculateDamage(entry, context, entryModifiers);
        });
        const reactionResult = buildStandaloneReactionResult(context, collected);
        if (reactionResult) results.push(reactionResult);
        const inputNotices = [...new Map(collected.candidates
            .filter((item) => item.analysis?.supportStatus === "missingInput")
            .filter((item) => item.analysis?.resourceClassification !== "calculationInput")
            .map((item) => [
                `${item.analysis?.reasonCode || "INPUT_REQUIRED"}:${item.modifier?.id || item.source}`,
                {
                    id: item.modifier?.id || "",
                    source: item.source,
                    message: item.reason,
                    reasonCode: item.analysis?.reasonCode || "INPUT_REQUIRED"
                }
            ])).values()];
        const isDiagnosticOnlyCandidate = (item) => {
            return item.analysis?.inputStatus === "includedInInput"
                || item.analysis?.resourceClassification === "calculationInput"
                || item.analysis?.reasonCode === "ATTACK_MODE_ELEMENT_CONFLICT"
                || item.analysis?.supportStatus === "missingInput"
                || item.reason === "条件OFF";
        };
        results.forEach((result) => {
            result.breakdown.skippedModifiers = result.breakdown.skippedModifiers.filter((item) => !isDiagnosticOnlyCandidate(item));
        });
        return {
            context,
            reactionState: {
                ...context.reactionOption,
                calculated: Boolean(reactionResult) || ["amplifying", "additive"].includes(context.reactionOption.family),
                unsupportedReason: context.reactionOption.unsupportedReasonJa || ""
            },
            warnings: [...filterRelevantWarnings(calcData.warnings, context), ...talentResult.warnings.map((message) => ({ level: "warn", message }))],
            results,
            candidateModifiers: collected.candidates,
            inputNotices,
            resourceStateInputs: collected.candidates
                .filter((item) => item.analysis?.resourceClassification === "calculationInput")
                .map((item) => ({
                    key: item.analysis.conditionStateKey,
                    id: item.modifier.resource?.id || item.modifier.id || "",
                    name: item.modifier.resource?.nameJa || item.modifier.resource?.id || "リソース",
                    min: item.modifier.stack?.min ?? 0,
                    max: item.modifier.stack?.max ?? item.modifier.resource?.max ?? null,
                    current: context.manualInputs.resourceStates?.[item.analysis.resourceStateKey] ?? null,
                    source: item.source
                })),
            displayData: {
                characters: calcData.characters || {},
                weapons: calcData.weapons || {},
                artifactSets: calcData.artifactSets || {}
            }
        };
    }

    window.GenshinCalcEngine = {
        REACTION_OPTIONS,
        buildCharacterCalcContext,
        collectTalentDamageEntries,
        collectActiveModifiers,
        applyModifiersToDamageEntry,
        calculateDamage,
        hydrateReactionContext,
        buildStandaloneReactionResult,
        reactionBonusApplies,
        reactionCritApplies,
        reactionEmBonusPercent,
        normalizeResistanceElement,
        normalizeEnemyResistance,
        resolveBaseResistance,
        resolveManualResistanceDebuff,
        resolveEffectiveResistance,
        resolveDamageResistanceElement,
        defenseModifierAppliesToEntry,
        resolveDefenseReduction,
        resolveDefenseIgnore,
        defenseMultiplier,
        resistanceMultiplier,
        runGenshinJsonCalc,
        resolveModifierValue,
        normalizeElementOverrideModifier,
        normalizeTalentStateModifier,
        normalizeArtifactModifier,
        normalizeWeaponModifier,
        weaponEffectGroup,
        buildAttackModeDefinitions,
        talentStateConditionKey,
        talentModifierRepresentedByScalings
    };
})();
