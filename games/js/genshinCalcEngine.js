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

    function readText(id, fallback = "") {
        return getElement(id)?.value || fallback;
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
        const artifactSetOne = readText("genshinArtifactSetOne", "15003") || "15003";
        const hasReflectedCharacter = Boolean(readText("genshinReflectCharacter", ""));
        const constellationValue = hasReflectedCharacter ? readText("genshinReflectConstellation", "C0") : "C1";
        const selectedConstellation = readText("genshinJsonConstellationLevel", constellationValue) || constellationValue;
        return {
            characterId: readText("genshinCalcCharacterId", "10000037") || "10000037",
            weaponId: readText("genshinCalcWeaponId", "15502") || "15502",
            refinement: normalizeRefinement(readText("genshinWeaponRefinement", "R1")),
            artifactSetIds: [artifactSetOne],
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
            uiState: {
                amosStack: readNumber("genshinJsonAmosStack", 5),
                crimsonWitchStack: readNumber("genshinJsonCrimsonWitchStack", 0),
                enableCharacterCondition: Boolean(getElement("genshinJsonEnableCharacterCondition")?.checked),
                enableLowHpCondition: Boolean(getElement("genshinJsonEnableLowHpCondition")?.checked),
                enableWeaponLowHpCondition: Boolean(getElement("genshinJsonEnableWeaponLowHpCondition")?.checked),
                enableConstellation: parseConstellation(selectedConstellation) > 0,
                stackByModifier: {}
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

    function resolveModifierValue(modifier, context, uiState = context.uiState || {}) {
        if (modifier.value !== undefined && modifier.calculationSupport === "stack" && modifier.stack) {
            const stack = Math.min(Math.max(uiState.stackByModifier?.[modifier.id] ?? uiState.stack ?? modifier.stack.default ?? 0, modifier.stack.min ?? 0), modifier.stack.max ?? 0);
            return (Number(modifier.value) || 0) * stack;
        }
        if (modifier.value !== undefined) return modifier.value;
        if (modifier.valueByRefinement) {
            const raw = modifier.valueByRefinement[String(context.refinement)] ?? modifier.valueByRefinement["1"];
            if (Array.isArray(raw)) {
                const stack = Math.min(Math.max(uiState.stackByModifier?.[modifier.id] ?? uiState.stack ?? modifier.stack?.default ?? 0, modifier.stack?.min ?? 0), modifier.stack?.max ?? raw.length);
                return raw[Math.max(stack - 1, 0)] ?? 0;
            }
            if (modifier.calculationSupport === "stack" && modifier.stack) {
                const stack = Math.min(Math.max(uiState.stackByModifier?.[modifier.id] ?? uiState.amosStack ?? modifier.stack.default ?? 0, modifier.stack.min ?? 0), modifier.stack.max ?? 0);
                return (Number(raw) || 0) * stack;
            }
            return raw ?? 0;
        }
        if (modifier.valueByLevel) {
            const levelSource = modifier.levelSource || modifier.valueSource?.section || "skill";
            const talentLevel = levelSource === "combat1" || levelSource === "normalAttack"
                ? context.talentLevels.normal
                : levelSource === "combat3" || levelSource === "burst"
                    ? context.talentLevels.burst
                    : context.talentLevels.skill;
            const level = Math.min(Math.max(Math.round(talentLevel || 1), 1), 15);
            return modifier.valueByLevel[String(level)] ?? modifier.valueByLevel["1"] ?? 0;
        }
        if (modifier.valueByStack) {
            const stack = uiState.stackByModifier?.[modifier.id] ?? uiState.stack ?? modifier.stack?.default ?? 0;
            return modifier.valueByStack[String(stack)] ?? 0;
        }
        if (modifier.valuePerStack) {
            const stack = uiState.stackByModifier?.[modifier.id] ?? uiState.stack ?? modifier.stack?.default ?? 0;
            return modifier.valuePerStack * stack;
        }
        return 0;
    }

    function shouldSkipByUidHandling(modifier, context) {
        const uidHandling = modifier.uidHandling || "conditional";
        if (context.mode !== "uidMode") return "";
        if (uidHandling === "includedInUidStats") return "includedInUidStatsのため未適用";
        if (uidHandling === "includedInUidTalentLevels") return "UID天賦Lv反映済みの可能性があるため未適用";
        if (uidHandling === "manualOnly") return "manualOnlyのため未適用";
        if (uidHandling === "displayOnly") return "displayOnly";
        if (uidHandling === "special") return "special未対応";
        return "";
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

        function consider(modifier, source) {
            if (!modifier) return;
            const uidHandling = modifier.uidHandling || "conditional";
            const uidReason = shouldSkipByUidHandling(modifier, context);
            if (uidReason) {
                candidates.push({ modifier, source, reason: uidReason });
                return;
            }
            if (modifier.calculationSupport === "custom" || modifier.calculationSupport === "special") {
                candidates.push({ modifier, source, reason: "special未対応" });
                return;
            }
            const uiEnabled = modifierConditionEnabled(modifier, source, context, calcData);
            if (uidHandling === "conditional" && !uiEnabled) {
                candidates.push({ modifier, source, reason: "条件OFF" });
                return;
            }
            applied.push({ modifier, source, value: resolveModifierValue(modifier, context) });
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

        context.artifactSetIds.forEach((setId) => {
            const artifact = calcData.artifactSetModifiers?.[setId];
            (artifact?.fourPiece || []).forEach((modifier) => consider(modifier, `artifact4:${setId}`));
            (artifact?.twoPiece || []).forEach((modifier) => consider(modifier, `artifact2:${setId}`));
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
        const applyTo = modifier.applyTo || [];
        return applyTo.includes(entry.attackType) || applyTo.includes(entry.damageType);
    }

    function resolveStatBonusValue(modifier, value, context) {
        const applyTo = modifier.applyTo || [];
        const targetStat = applyTo.includes("atk") || applyTo.includes("atkPercent") ? "atk" : applyTo[0];
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

    function applyModifiersToDamageEntry(entry, context, collected) {
        const applied = [];
        const candidates = [...collected.candidates];
        const totals = {
            damageBonus: 0,
            resistanceDebuff: context.enemy.resistanceDebuff,
            statBonus: {},
            elementOverride: ""
        };
        collected.applied.forEach((item) => {
            const { modifier, value } = item;
            if (modifier.category === "elementOverride" && modifierTargetsEntry(modifier, entry)) {
                totals.elementOverride = value || modifier.value || "";
                applied.push(item);
            } else if (modifier.category === "statBonus") {
                const statBonus = resolveStatBonusValue(modifier, value, context);
                if (statBonus) {
                    totals.statBonus[statBonus.stat] = (totals.statBonus[statBonus.stat] || 0) + statBonus.value;
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
            const { modifier, value } = item;
            if (modifier.category === "elementOverride" || modifier.category === "statBonus") {
                return;
            }
            if (modifier.category === "damageBonus" && modifierAppliesToEntry(modifier, effectiveEntry)) {
                totals.damageBonus += Number(value) || 0;
                applied.push(item);
            } else if (modifier.category === "resistanceDebuff" && resistanceDebuffAppliesToEntry(modifier, effectiveEntry)) {
                totals.resistanceDebuff += Math.abs(Number(value) || 0);
                applied.push(item);
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

    function reactionMultiplier(context) {
        const reaction = context.reactionOption || REACTION_OPTIONS.none;
        if (!reaction.enabled) return { multiplier: 1, detail: reaction };
        const em = context.stats.elementalMastery;
        const emBonus = 278 * em / (em + 1400);
        return {
            multiplier: reaction.baseMultiplier * (1 + emBonus / 100),
            detail: { ...reaction, elementalMasteryBonus: emBonus, reactionBonus: 0 }
        };
    }

    function calculateDamage(entry, context, appliedModifiers) {
        const effectiveEntry = appliedModifiers.entry || entry;
        const scaling = entry.scalings?.[0];
        const talentLevel = Math.min(Math.max(Math.round(getTalentLevel(context, entry)), 1), 15);
        const talentMultiplier = Number(scaling?.valuesByLevel?.[String(talentLevel)]);
        const statValue = Number(context.stats[scaling?.stat]) + (appliedModifiers.totals.statBonus?.[scaling?.stat] || 0);
        const problems = [];
        if (!scaling || !Number.isFinite(talentMultiplier) || !Number.isFinite(statValue)) {
            problems.push("天賦倍率または参照ステータスが不足しています。");
        }
        const baseDamage = problems.length ? 0 : statValue * talentMultiplier / 100;
        const damageBonusMultiplier = 1 + appliedModifiers.totals.damageBonus / 100;
        const defMultiplier = defenseMultiplier(context);
        const effectiveResistance = context.enemy.enemyResistance - appliedModifiers.totals.resistanceDebuff;
        const resMultiplier = resistanceMultiplier(effectiveResistance);
        const reaction = reactionMultiplier(context);
        const nonCrit = baseDamage * damageBonusMultiplier * defMultiplier * resMultiplier * reaction.multiplier;
        const crit = nonCrit * (1 + context.stats.critDamage / 100);
        const expected = nonCrit * (1 + (context.stats.critRate / 100) * (context.stats.critDamage / 100));
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
                stat: scaling?.stat || "-",
                statValue,
                talentLevel,
                talentMultiplier,
                hitCount,
                damageBonus: appliedModifiers.totals.damageBonus,
                statBonus: appliedModifiers.totals.statBonus,
                critRate: context.stats.critRate,
                critDamage: context.stats.critDamage,
                defenseMultiplier: defMultiplier,
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

    function filterRelevantWarnings(warnings, context) {
        const setIds = new Set(context.artifactSetIds || []);
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
        const talentResult = collectTalentDamageEntries(calcData, context);
        const collected = collectActiveModifiers(calcData, context);
        const results = talentResult.entries.map((entry) => {
            const entryModifiers = applyModifiersToDamageEntry(entry, context, collected);
            return calculateDamage(entry, context, entryModifiers);
        });
        return {
            context,
            warnings: [...filterRelevantWarnings(calcData.warnings, context), ...talentResult.warnings.map((message) => ({ level: "warn", message }))],
            results,
            candidateModifiers: collected.candidates,
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
