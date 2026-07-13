(function () {
    "use strict";

    const REACTION_OPTIONS = {
        none: { reactionId: "none", reactionType: "none", label: "反応なし", baseMultiplier: 1, enabled: false },
        melt15: { reactionId: "melt", reactionType: "amplifying", label: "溶解 1.5", baseMultiplier: 1.5, enabled: true },
        melt20: { reactionId: "melt", reactionType: "amplifying", label: "溶解 2.0", baseMultiplier: 2, enabled: true },
        vaporize15: { reactionId: "vaporize", reactionType: "amplifying", label: "蒸発 1.5", baseMultiplier: 1.5, enabled: true },
        vaporize20: { reactionId: "vaporize", reactionType: "amplifying", label: "蒸発 2.0", baseMultiplier: 2, enabled: true },
        aggravate: { reactionId: "aggravate", reactionType: "additive", label: "超激化", baseMultiplier: 1, enabled: false },
        spread: { reactionId: "spread", reactionType: "additive", label: "草激化", baseMultiplier: 1, enabled: false },
        overload: { reactionId: "overload", reactionType: "transformative", label: "過負荷", baseMultiplier: 1, enabled: false },
        electroCharged: { reactionId: "electroCharged", reactionType: "transformative", label: "感電", baseMultiplier: 1, enabled: false },
        superconduct: { reactionId: "superconduct", reactionType: "transformative", label: "超電導", baseMultiplier: 1, enabled: false },
        swirl: { reactionId: "swirl", reactionType: "transformative", label: "拡散", baseMultiplier: 1, enabled: false },
        burning: { reactionId: "burning", reactionType: "transformative", label: "燃焼", baseMultiplier: 1, enabled: false },
        bloom: { reactionId: "bloom", reactionType: "transformative", label: "開花", baseMultiplier: 1, enabled: false },
        hyperbloom: { reactionId: "hyperbloom", reactionType: "transformative", label: "超開花", baseMultiplier: 1, enabled: false },
        burgeon: { reactionId: "burgeon", reactionType: "transformative", label: "烈開花", baseMultiplier: 1, enabled: false },
        crystallize: { reactionId: "crystallize", reactionType: "shield", label: "結晶", baseMultiplier: 1, enabled: false },
        lunarBloom: { reactionId: "lunarBloom", reactionType: "lunar", label: "月開花", baseMultiplier: 1, enabled: false },
        lunarCharged: { reactionId: "lunarCharged", reactionType: "lunar", label: "月感電", baseMultiplier: 1, enabled: false },
        lunarCrystallize: { reactionId: "lunarCrystallize", reactionType: "lunar", label: "月結晶", baseMultiplier: 1, enabled: false },
        astralReaction: { reactionId: "astralReaction", reactionType: "special", label: "星反応（未対応）", baseMultiplier: 1, enabled: false }
    };

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
                enemyLevel: readNumber("e_lv", 90),
                enemyResistance: readNumber("e_res", 10),
                resistanceDebuff: readNumber("ele_d", 0),
                defenseDebuff: readNumber("def_d", 0),
                defenseIgnore: readNumber("def_ig", 0)
            },
            mode: "uidMode",
            reactionOption: REACTION_OPTIONS[readText("genshinJsonReactionOption", "none")] || REACTION_OPTIONS.none,
            manualInputs: {
                recordedHealing: readOptionalNumber("genshinJsonRecordedHealing"),
                providerStats: {
                    hp: readOptionalNumber("genshinJsonProviderHp"),
                    atk: readOptionalNumber("genshinJsonProviderAtk"),
                    def: readOptionalNumber("genshinJsonProviderDef"),
                    elementalMastery: readOptionalNumber("genshinJsonProviderElementalMastery")
                },
                resourceStates: readResourceStates()
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
        if (weaponType === "弓" && entry.attackType === "chargedAttack") return ownElement;
        if (weaponType === "法器" && isNormalTalentAttack) return ownElement;
        return entry.element;
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
        groups.forEach(([group, talent]) => {
            (talent?.entries || []).forEach((entry) => {
                entries.push({ ...entry, element: normalizeDamageElement(entry, characterInfo), group });
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
        const resourceStack = consumedResourceStack(modifier, context, analysis);
        const conditionState = uiState.conditionByModifier?.[analysis.conditionStateKey] || {};
        const conditionStack = modifier.conditionInput?.type === "stack" && Number.isFinite(Number(conditionState.stack))
            ? Number(conditionState.stack)
            : null;
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

    function collectActiveModifiers(calcData, context) {
        const applied = [];
        const candidates = [];
        const activeEffectGroups = new Set();

        function addCandidate(modifier, source, reason, analysis) {
            candidates.push({ modifier, source, reason, analysis });
        }

        function consider(modifier, source) {
            if (!modifier) return;
            const analysis = analyzeModifier(modifier, source, context);
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
            (passive.modifiers || []).forEach((modifier) => {
                consider(modifier, `talent:${passive.sourceId || context.characterId}`);
            });
        });

        const weaponModifiers = calcData.weaponModifiers?.[context.weaponId]?.modifiers || [];
        weaponModifiers.forEach((modifier) => {
            consider(modifier, `weapon:${context.weaponId}`);
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
        const target = map[entry.attackType] || map[entry.damageType];
        const elementTarget = elementBonusKey(entry.element);
        return applyTo.includes(target)
            || applyTo.includes(elementTarget)
            || applyTo.includes("allDamageBonus")
            || applyTo.includes("allElementDamageBonus")
            || applyTo.includes("ownElementDamageBonus");
    }

    function modifierTargetsEntry(modifier, entry) {
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
        const resistanceMap = {
            "炎": "pyroResistance",
            "水": "hydroResistance",
            "雷": "electroResistance",
            "氷": "cryoResistance",
            "風": "anemoResistance",
            "岩": "geoResistance",
            "草": "dendroResistance",
            physical: "physicalResistance"
        };
        const target = resistanceMap[entry.element];
        return !applyTo.length || applyTo.includes(target) || applyTo.includes("allResistance");
    }

    function reactionBonusApplies(modifier, reaction) {
        if (!reaction?.enabled) return false;
        const applyTo = modifier.applyTo || [];
        if (!applyTo.length) return true;
        const reactionId = reaction.reactionId;
        const reactionType = reaction.reactionType;
        const reactionTargets = [
            "reactionDamageBonus",
            `${reactionId}DamageBonus`,
            `${reactionId}ReactionBonus`,
            `${reactionType}ReactionBonus`,
            `${reactionType}DamageBonus`
        ];
        return reactionTargets.some((target) => applyTo.includes(target));
    }

    function critBonusApplies(modifier, entry) {
        const damageTargets = (modifier.applyTo || []).filter((target) => !["critRate", "critDamage"].includes(target));
        return damageTargets.length === 0 || modifierTargetsEntry({ ...modifier, applyTo: damageTargets }, entry);
    }

    function applyModifiersToDamageEntry(entry, context, collected) {
        const applied = [];
        const candidates = [...collected.candidates];
        const totals = {
            damageBonus: 0,
            resistanceDebuff: context.enemy.resistanceDebuff,
            defenseDebuff: context.enemy.defenseDebuff,
            defenseIgnore: context.enemy.defenseIgnore,
            statBonus: {},
            critRateBonus: 0,
            critDamageBonus: 0,
            reactionBonus: 0,
            additiveBaseDamage: 0,
            finalDamageMultiplier: 1,
            effectOverrides: [],
            elementOverride: ""
        };
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
        if (effectiveEntry.element !== "physical") {
            totals.damageBonus += context.stats.elementDamageBonus;
        }
        collected.applied.forEach((item) => {
            const { modifier, value, analysis } = item;
            if (modifier.category === "elementOverride" || ["statBonus", "statConversion", "scalingStatBonus"].includes(analysis?.calculation)) {
                return;
            }
            if (modifier.category === "damageBonus" && modifierAppliesToEntry(modifier, effectiveEntry)) {
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
                const applyTo = modifier.applyTo || [];
                if (applyTo.includes("critRate")) {
                    totals.critRateBonus += Number(value) || 0;
                    applied.push(item);
                } else if (applyTo.includes("critDamage")) {
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
            } else if (modifier.category === "defenseDebuff") {
                totals.defenseDebuff += Math.abs(Number(value) || 0);
                applied.push(item);
            } else if (modifier.category === "defenseIgnore") {
                totals.defenseIgnore += Math.abs(Number(value) || 0);
                applied.push(item);
            } else if (modifier.category === "reactionBonus" && reactionBonusApplies(modifier, context.reactionOption)) {
                totals.reactionBonus += Number(value) || 0;
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

    function defenseMultiplier(context) {
        const lv = context.enemy.characterLevel;
        const eLv = context.enemy.enemyLevel;
        return (lv + 100) / ((1 - context.enemy.defenseIgnore / 100) * (1 - context.enemy.defenseDebuff / 100) * (eLv + 100) + lv + 100);
    }

    function resistanceMultiplier(resistance) {
        if (resistance < 0) return 1 - resistance / 200;
        if (resistance < 75) return 1 - resistance / 100;
        return 1 / (resistance / 25 + 1);
    }

    function reactionMultiplier(context, reactionBonus = 0) {
        const reaction = context.reactionOption || REACTION_OPTIONS.none;
        if (!reaction.enabled) return { multiplier: 1, detail: reaction };
        const em = context.stats.elementalMastery;
        const emBonus = 278 * em / (em + 1400);
        return {
            multiplier: reaction.baseMultiplier * (1 + (emBonus + reactionBonus) / 100),
            detail: { ...reaction, elementalMasteryBonus: emBonus, reactionBonus }
        };
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
        const baseDamage = problems.length ? 0 : scalingBaseDamage + (appliedModifiers.totals.additiveBaseDamage || 0);
        const damageBonusMultiplier = 1 + appliedModifiers.totals.damageBonus / 100;
        const defMultiplier = defenseMultiplier({
            ...context,
            enemy: {
                ...context.enemy,
                defenseDebuff: appliedModifiers.totals.defenseDebuff,
                defenseIgnore: appliedModifiers.totals.defenseIgnore
            }
        });
        const effectiveResistance = context.enemy.enemyResistance - appliedModifiers.totals.resistanceDebuff;
        const resMultiplier = resistanceMultiplier(effectiveResistance);
        const reaction = reactionMultiplier(context, appliedModifiers.totals.reactionBonus);
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
                reactionBonus: appliedModifiers.totals.reactionBonus,
                finalDamageMultiplier: appliedModifiers.totals.finalDamageMultiplier,
                effectOverrides: appliedModifiers.totals.effectOverrides,
                critRate,
                critDamage,
                defenseMultiplier: defMultiplier,
                defenseDebuff: appliedModifiers.totals.defenseDebuff,
                defenseIgnore: appliedModifiers.totals.defenseIgnore,
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
            if (message.includes(`weaponModifiers.${context.weaponId}`)) return true;
            if ([...setIds].some((setId) => message.includes(`artifactSetModifiers.${setId}`))) return true;
            if (message.startsWith(`${context.characterId}.`)) return true;
            return false;
        });
    }

    async function runGenshinJsonCalc() {
        const calcData = await window.GenshinCalcData.loadGenshinCalcData();
        const context = buildCharacterCalcContext();
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
                || item.analysis?.supportStatus === "missingInput"
                || item.reason === "条件OFF";
        };
        results.forEach((result) => {
            result.breakdown.skippedModifiers = result.breakdown.skippedModifiers.filter((item) => !isDiagnosticOnlyCandidate(item));
        });
        return {
            context,
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
        runGenshinJsonCalc,
        resolveModifierValue
    };
})();
