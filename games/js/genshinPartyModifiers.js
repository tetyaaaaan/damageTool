(function () {
    "use strict";

    const PARTY_TARGET_RULES = Object.freeze({
        self: { appliesToMain: false, label: "発動者自身" },
        team: { appliesToMain: true, label: "チーム全員" },
        activeCharacter: { appliesToMain: true, label: "フィールド上キャラ" },
        otherPartyMembers: { appliesToMain: true, label: "発動者以外のチームメンバー" },
        enemy: { appliesToMain: true, label: "敵" },
        ambiguous: { appliesToMain: false, label: "対象の確認が必要" }
    });

    const TEAM_PATTERN = /チーム(?:内|中|全員)|チームメンバー|チーム内キャラクター|周囲のキャラクター全員|付近のキャラクター全員/;
    const OTHER_PATTERN = /自身を除く|発動者以外|装備者以外|他のキャラクター|他キャラクター/;
    const ACTIVE_PATTERN = /出場キャラクター|フィールド上(?:にいる)?キャラクター|エリア内のキャラクター|領域内のキャラクター|拾うと/;
    const ENEMY_PATTERN = /敵の(?:元素|物理|全元素)?耐性|敵の防御|敵が受けるダメージ|敵に.*デバフ|受けるダメージ.*アップ/;
    const SELF_PATTERN = /自身の|自分の|発動者の|装備者の/;

    function normalizeText(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function normalizeElement(value) {
        const key = String(value || "").trim().toLowerCase();
        return ({ "炎": "pyro", pyro: "pyro", "水": "hydro", hydro: "hydro", "風": "anemo", anemo: "anemo", "雷": "electro", electro: "electro", "草": "dendro", dendro: "dendro", "氷": "cryo", cryo: "cryo", "岩": "geo", geo: "geo" })[key] || key;
    }

    function inferTargetOwner(modifier, description = "") {
        if (PARTY_TARGET_RULES[modifier?.targetOwner]) {
            return { owner: modifier.targetOwner, confidence: "explicit" };
        }
        if (PARTY_TARGET_RULES[modifier?.target]) {
            return { owner: modifier.target, confidence: "explicit" };
        }
        const text = normalizeText([modifier?.sourceText, description].filter(Boolean).join(" "));
        if (OTHER_PATTERN.test(text)) return { owner: "otherPartyMembers", confidence: "text" };
        if (ACTIVE_PATTERN.test(text)) return { owner: "activeCharacter", confidence: "text" };
        if (ENEMY_PATTERN.test(text)) return { owner: "enemy", confidence: "text" };
        if (TEAM_PATTERN.test(text)) {
            if (SELF_PATTERN.test(text) && !/チーム全員|チーム内の全て/.test(text)) {
                return { owner: "ambiguous", confidence: "mixedText" };
            }
            return { owner: "team", confidence: "text" };
        }
        return { owner: "self", confidence: "default" };
    }

    function targetAppliesToMain(owner) {
        return Boolean(PARTY_TARGET_RULES[owner]?.appliesToMain);
    }

    function talentDescription(calcData, characterId, sourceId) {
        const talents = calcData.characterTalents?.[characterId] || {};
        const normalized = String(sourceId || "").replace(/_/g, "");
        if (normalized === "combat1") return talents.normalAttack?.normalDescriptionJa || "";
        if (normalized === "combat2") return talents.skill?.descriptionJa || "";
        if (normalized === "combat3") return talents.burst?.descriptionJa || "";
        const passives = talents.passives || [];
        return passives.find((passive) => String(passive.sourceId || "").replace(/_/g, "") === normalized)?.descriptionJa || "";
    }

    function talentName(calcData, characterId, sourceId) {
        const talents = calcData.characterTalents?.[characterId] || {};
        const normalized = String(sourceId || "").replace(/_/g, "");
        if (normalized === "combat1") return talents.normalAttack?.nameJa || "通常攻撃";
        if (normalized === "combat2") return talents.skill?.nameJa || "元素スキル";
        if (normalized === "combat3") return talents.burst?.nameJa || "元素爆発";
        const passives = talents.passives || [];
        return passives.find((passive) => String(passive.sourceId || "").replace(/_/g, "") === normalized)?.nameJa || "固有天賦";
    }

    function candidateKey(member, kind, sourceId, modifier, modifierIndex) {
        const modifierId = modifier?.id || `index-${modifierIndex}`;
        return `party:${member.slot}:${member.characterId}:${kind}:${sourceId}:${modifierId}`;
    }

    function candidateToggleKey(member, sourceKind, sourceId, modifier, key) {
        const groupId = modifier?.conditionGroupId || modifier?.effectGroupId;
        return groupId
            ? `party:${member.slot}:${member.characterId}:group:${groupId}`
            : key;
    }

    function dedupeKey(candidate) {
        const modifier = candidate.modifier || {};
        const effect = modifier.effectGroupId || modifier.id || candidate.key;
        const targets = [...(modifier.applyTo || [])].sort().join(",");
        return `${candidate.member.characterId}:${candidate.sourceKind}:${candidate.sourceId}:${effect}:${modifier.category || ""}:${targets}`;
    }

    function providerStatRequirements(modifier, description) {
        const requirements = new Set();
        if (["self", "provider", "selfOrProvider"].includes(modifier?.reference?.source) && modifier?.reference?.stat) requirements.add(modifier.reference.stat);
        if (["statConversion", "scalingBonus"].includes(modifier?.category) && (modifier?.reference?.stat || modifier?.referenceStat)) {
            requirements.add(modifier.reference?.stat || modifier.referenceStat);
        }
        const text = normalizeText(description);
        if (/基礎攻撃力(?:の数値)?(?:を基に|を基準|の\d|\d+%)/.test(text)) requirements.add("baseAtk");
        if (/HP上限(?:の数値)?(?:を基に|を基準|の\d|1につき)/.test(text)) requirements.add("hp");
        if (/防御力(?:の数値)?(?:を基に|を基準|の\d|1につき)/.test(text)) requirements.add("def");
        if (/元素熟知(?:の数値)?(?:を基に|を基準|の\d|1につき)/.test(text)) requirements.add("elementalMastery");
        return [...requirements];
    }

    function descriptionNeedsDynamicInput(description, modifier) {
        if (modifier?.dynamicInputResolved) return false;
        if (/テンション|願力|層数|スタック|ポイントにつき|1ポイント|元素エネルギーを基準|キャラクター数|人数/.test(description)) return true;
        return /変換率/.test(String(modifier?.valueSource?.label || ""));
    }

    function targetBaseStatRequirement(modifier, context) {
        if (modifier?.category !== "statBonus" || modifier?.unit !== "percent") return null;
        const percentTarget = (modifier.applyTo || []).find((target) => ["atkPercent", "hpPercent", "defPercent"].includes(target));
        if (!percentTarget) return null;
        const baseStat = {
            atkPercent: "baseAtk",
            hpPercent: "baseHp",
            defPercent: "baseDef"
        }[percentTarget];
        return Number(context.stats?.[baseStat]) > 0 ? null : baseStat;
    }

    function automaticCondition(modifier) {
        return ["always", "constellationUnlocked"].includes(modifier?.condition || "always");
    }

    function buildCandidate({ calcData, context, member, sourceKind, sourceId, modifier, modifierIndex, description, sourceName }) {
        const requiredProviderStats = providerStatRequirements(modifier, description);
        const memberStats = { ...(member.stats || {}) };
        const usesProviderStats = requiredProviderStats.length > 0;
        const providerContext = {
            ...context,
            characterId: member.characterId,
            constellation: member.constellation,
            refinement: member.equipment?.refinement || 1,
            talentLevels: member.talentLevels || { normal: 10, skill: 10, burst: 10 },
            stats: usesProviderStats ? { ...context.stats, ...memberStats } : context.stats,
            manualInputs: { ...(context.manualInputs || {}), providerStats: memberStats }
        };
        const normalizeSource = sourceKind === "talent"
            ? `talent:${sourceId}`
            : sourceKind === "artifact"
                ? `artifact${sourceId}`
                : `constellation:C${sourceId}`;
        const normalized = sourceKind === "talent" && window.GenshinCalcEngine?.normalizeTalentStateModifier
            ? window.GenshinCalcEngine.normalizeTalentStateModifier(modifier, normalizeSource, calcData, providerContext, modifierIndex)
            : sourceKind === "artifact" && window.GenshinCalcEngine?.normalizeArtifactModifier
                ? window.GenshinCalcEngine.normalizeArtifactModifier(modifier, normalizeSource)
                : modifier;
        const target = inferTargetOwner(normalized, description);
        const partyModifier = {
            ...normalized,
            partySource: true,
            partySourceKind: sourceKind,
            partySourceName: normalized?.effectLabel || sourceName,
            partyProviderName: member.nameJa || `メンバー${member.slot}`,
            partyProviderSlot: member.slot,
            targetOwner: target.owner,
            auditDisposition: normalized?.auditDisposition === "sourceContextRequired" ? undefined : normalized?.auditDisposition,
            uidHandling: normalized?.uidHandling === "displayOnly" ? "displayOnly" : "conditional"
        };
        const key = candidateKey(member, sourceKind, sourceId, normalized, modifierIndex);
        const toggleKey = candidateToggleKey(member, sourceKind, sourceId, partyModifier, key);
        const isAutomatic = automaticCondition(normalized);
        const enabled = isAutomatic || member.buffStates?.[toggleKey] === true || member.buffStates?.[key] === true;
        const relevant = target.owner !== "self" || target.confidence !== "default";
        const targetElement = normalizeElement(calcData.characters?.[context.characterId]?.element || context.party?.members?.find((item) => item.slot === 1)?.element);
        const requiredTargetElement = normalizeElement(partyModifier.requiredTargetElement);
        let status = "ready";
        let reason = "";
        if (target.owner === "self" || !relevant) {
            status = "selfOnly";
            reason = "発動者自身だけが対象のため、メインキャラへは適用しません。";
        } else if (!targetAppliesToMain(target.owner)) {
            status = "ambiguous";
            reason = "対象を安全に特定できないため、計算へは適用しません。";
        } else if (requiredTargetElement && requiredTargetElement !== targetElement) {
            status = "notApplicable";
            reason = `対象キャラの元素が${partyModifier.requiredTargetElement}元素ではないため適用しません。`;
        } else if (requiredProviderStats.some((stat) => !(Number(memberStats[stat]) > 0))) {
            status = "missingProviderStats";
            reason = `発動者の${requiredProviderStats.filter((stat) => !(Number(memberStats[stat]) > 0)).join("・")}が必要なため、現在は表示のみです。`;
        } else if (descriptionNeedsDynamicInput(description, partyModifier)) {
            status = "missingInput";
            reason = "効果量を決める段階・ポイント・人数の入力が必要なため、現在は表示のみです。";
        } else if (targetBaseStatRequirement(partyModifier, context)) {
            status = "missingInput";
            reason = "対象キャラの基礎ステータスが未入力のため、現在は表示のみです。";
        } else if (!enabled) {
            status = "off";
            reason = "発動条件がOFFです。";
        }
        const analysis = window.GenshinModifierAnalyzer?.analyzeModifier?.({
            modifier: partyModifier,
            source: `party:${member.slot}:${member.characterId}:${sourceKind}:${sourceId}`,
            context
        }) || null;
        if (["ready", "off"].includes(status) && analysis && !analysis.calculable) {
            status = analysis.supportStatus === "missingInput" ? "missingInput" : "displayOnly";
            reason = analysis.reason || "この補正は現在の計算方式では未対応です。";
        }
        let resolvedValue = window.GenshinCalcEngine?.resolveModifierValue
            ? window.GenshinCalcEngine.resolveModifierValue(partyModifier, providerContext, context.uiState || {}, analysis || {})
            : null;
        if (["scalingDamageBonus", "scalingReactionBonus"].includes(analysis?.calculation) && partyModifier.reference?.stat) {
            const referenceValue = Number(providerContext.stats?.[partyModifier.reference.stat]) || 0;
            const calculated = referenceValue / (Number(partyModifier.divisor) || 1) * (Number(partyModifier.ratio) || 0);
            resolvedValue = Number.isFinite(Number(partyModifier.maxValue))
                ? Math.min(calculated, Number(partyModifier.maxValue))
                : calculated;
        } else if (analysis?.calculation === "scalingAdditiveBaseDamage" && partyModifier.reference?.stat) {
            resolvedValue = (Number(providerContext.stats?.[partyModifier.reference.stat]) || 0)
                * (Number(partyModifier.ratio ?? partyModifier.value) || 0) / 100;
        }
        return {
            key,
            toggleKey,
            source: `party:${member.slot}:${member.characterId}:${sourceKind}:${sourceId}`,
            sourceKind,
            sourceId: String(sourceId),
            sourceName: normalized?.effectLabel || sourceName,
            description: normalizeText(description),
            member,
            modifier: partyModifier,
            targetOwner: target.owner,
            targetLabel: PARTY_TARGET_RULES[target.owner]?.label || target.owner,
            targetConfidence: target.confidence,
            automatic: isAutomatic,
            enabled,
            status,
            reason,
            analysis,
            resolvedValue,
            providerContext
        };
    }

    function weaponDescription(calcData, weaponId) {
        return normalizeText(calcData.weaponEffects?.[weaponId]?.effectTextTemplate || "");
    }

    function weaponEffectName(calcData, weaponId) {
        return calcData.weaponEffects?.[weaponId]?.effectNameJa || calcData.weapons?.[weaponId]?.nameJa || "武器効果";
    }

    function artifactDescription(calcData, setId, pieceCount) {
        const effect = calcData.artifactSetEffects?.[setId] || {};
        return normalizeText(pieceCount === 4 ? effect.fourPieceEffect : effect.twoPieceEffect);
    }

    function artifactEffectName(calcData, setId, pieceCount) {
        const name = calcData.artifactSets?.[setId]?.nameJa || `聖遺物ID ${setId}`;
        return `${name} ${pieceCount}セット効果`;
    }

    function stackingDescriptor(candidate) {
        const modifier = candidate.modifier || {};
        if (modifier.stackingGroup) return { group: String(modifier.stackingGroup), rule: modifier.stackingRule || "max" };
        const description = candidate.description || modifier.sourceText || "";
        const targets = [...(modifier.applyTo || [])].sort().join(",");
        if (/千年の大楽章/.test(description) && /同種類の効果は重ね掛け不可/.test(description)) {
            return { group: `millennial:${modifier.category}:${targets}`, rule: "max" };
        }
        if (/同名効果.*(?:重ね掛け|重複).*(?:不可|できない)|同名の効果.*同時に.*1つ/.test(description)) {
            return { group: `same-effect:${candidate.sourceKind}:${candidate.sourceId}:${modifier.category}:${targets}`, rule: "max" };
        }
        return null;
    }

    function applyStackingRules(candidates) {
        const accepted = [];
        const indexByGroup = new Map();
        candidates.forEach((candidate) => {
            const descriptor = stackingDescriptor(candidate);
            if (!descriptor) {
                accepted.push(candidate);
                return;
            }
            const previousIndex = indexByGroup.get(descriptor.group);
            if (previousIndex === undefined) {
                indexByGroup.set(descriptor.group, accepted.length);
                accepted.push(candidate);
                return;
            }
            const previous = accepted[previousIndex];
            const replace = descriptor.rule === "refresh"
                || (descriptor.rule === "max" && Number(candidate.resolvedValue) > Number(previous.resolvedValue));
            const rejected = replace ? previous : candidate;
            rejected.status = "duplicate";
            rejected.reason = "同種類の効果は重ね掛けできないため、効果量が高い方だけを適用します。";
            if (replace) accepted[previousIndex] = candidate;
        });
        return accepted;
    }

    function collectPartyModifierCandidates(calcData, context) {
        const candidates = [];
        const isCurrentRecord = (modifier) => ![
            "supersededByStructuredRecord",
            "supersededDuplicate"
        ].includes(modifier?.auditDisposition);
        const members = (context.party?.members || []).filter((member) => member.slot > 1 && member.enabled && member.characterId);
        members.forEach((member) => {
            const passives = calcData.talentModifiers?.[member.characterId]?.passives || [];
            passives.forEach((passive) => {
                const sourceId = passive.sourceId || "unknown";
                const description = talentDescription(calcData, member.characterId, sourceId);
                (passive.modifiers || []).forEach((modifier, modifierIndex) => {
                    if (!isCurrentRecord(modifier)) return;
                    candidates.push(buildCandidate({
                        calcData, context, member, sourceKind: "talent", sourceId, modifier, modifierIndex,
                        description, sourceName: talentName(calcData, member.characterId, sourceId)
                    }));
                });
            });
            const constellations = calcData.constellationModifiers?.[member.characterId]?.constellations || {};
            for (let level = 1; level <= Number(member.constellation || 0); level += 1) {
                (constellations[String(level)] || []).forEach((modifier, modifierIndex) => {
                    if (!isCurrentRecord(modifier)) return;
                    const description = modifier.sourceText || "";
                    candidates.push(buildCandidate({
                        calcData, context, member, sourceKind: "constellation", sourceId: level,
                        modifier, modifierIndex, description, sourceName: `命ノ星座 C${level}`
                    }));
                });
            }
            const weaponId = String(member.equipment?.weaponId || "");
            const weaponModifiers = calcData.weaponModifiers?.[weaponId]?.modifiers || [];
            if (weaponId) {
                const description = weaponDescription(calcData, weaponId);
                const weaponDefinition = calcData.weaponEffectRegistry?.weapons?.[weaponId] || {};
                weaponModifiers.forEach((modifier, modifierIndex) => {
                    if (!isCurrentRecord(modifier)) return;
                    const normalizedWeapon = window.GenshinCalcEngine?.normalizeWeaponModifier?.(modifier, weaponModifiers, weaponDefinition) || modifier;
                    candidates.push(buildCandidate({
                        calcData, context, member, sourceKind: "weapon", sourceId: weaponId,
                        modifier: normalizedWeapon, modifierIndex, description: normalizedWeapon.sourceText || description,
                        sourceName: weaponEffectName(calcData, weaponId)
                    }));
                });
            }
            const artifactMode = member.equipment?.artifactSetMode === "2pc2pc" ? "2pc2pc" : "4pc";
            (member.equipment?.artifactSetIds || []).forEach((setId, index) => {
                const artifact = calcData.artifactSetModifiers?.[setId];
                const addArtifactCandidates = (pieceCount, modifiers) => {
                    const description = artifactDescription(calcData, setId, pieceCount);
                    modifiers.forEach((modifier, modifierIndex) => {
                        if (!isCurrentRecord(modifier)) return;
                        candidates.push(buildCandidate({
                            calcData, context, member, sourceKind: "artifact", sourceId: `${pieceCount}:${setId}`,
                            modifier, modifierIndex, description: modifier.sourceText || description,
                            sourceName: artifactEffectName(calcData, setId, pieceCount)
                        }));
                    });
                };
                addArtifactCandidates(2, artifact?.twoPiece || []);
                if (artifactMode === "4pc" && index === 0) addArtifactCandidates(4, artifact?.fourPiece || []);
            });
        });

        if (window.GenshinElementalResonance) {
            candidates.push(...window.GenshinElementalResonance.collectResonanceCandidates(context));
        }

        const seen = new Set();
        const deduplicated = candidates.filter((candidate) => {
            if (candidate.status === "selfOnly") return false;
            const key = candidate.sourceKind === "resonance" ? candidate.key : dedupeKey(candidate);
            if (seen.has(key)) {
                candidate.status = "duplicate";
                candidate.reason = "同じ発動元の同一効果をすでに採用しているため、重複適用しません。";
                return false;
            }
            seen.add(key);
            return true;
        });
        const accepted = applyStackingRules(deduplicated);
        const renderedToggleKeys = new Set();
        accepted.forEach((candidate) => {
            if (candidate.automatic || !candidate.toggleKey) return;
            candidate.showToggle = !renderedToggleKeys.has(candidate.toggleKey);
            renderedToggleKeys.add(candidate.toggleKey);
        });
        return accepted;
    }

    function collectApplicablePartyModifiers(calcData, context) {
        return collectPartyModifierCandidates(calcData, context)
            .filter((candidate) => candidate.status === "ready" && candidate.enabled);
    }

    window.GenshinPartyModifiers = {
        PARTY_TARGET_RULES,
        inferTargetOwner,
        targetAppliesToMain,
        candidateKey,
        candidateToggleKey,
        dedupeKey,
        providerStatRequirements,
        stackingDescriptor,
        applyStackingRules,
        targetBaseStatRequirement,
        collectPartyModifierCandidates,
        collectApplicablePartyModifiers
    };
})();
