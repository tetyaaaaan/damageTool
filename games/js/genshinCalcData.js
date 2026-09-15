(function () {
    "use strict";

    const CALC_PATHS = {
        dataManifest: "/games/genshin/data/data-v2-manifest.json",
        versionBaseline: "/games/genshin/data/v2/version-baseline.json",
        upstreamVersionHead: "/games/genshin/data/v2/upstream-version-head.json",
        canonicalRuntime: "/games/genshin/data/v2/runtime/canonical-runtime.json",
        talentScalings: "/games/genshin/data/calc/talent-scalings.json",
        talentModifiers: "/games/genshin/data/calc/talent-modifiers.json",
        talentEffectRegistry: "/games/genshin/data/calc/talent-effect-registry.json",
        weaponModifiers: "/games/genshin/data/calc/weapon-modifiers.json",
        weaponEffectRegistry: "/games/genshin/data/calc/weapon-effect-registry.json",
        artifactSetModifiers: "/games/genshin/data/calc/artifact-set-modifiers.json",
        constellationModifiers: "/games/genshin/data/calc/constellation-modifiers.json",
        constellationEffectRegistry: "/games/genshin/data/calc/constellation-effect-registry.json",
        attackModeRules: "/games/genshin/data/calc/attack-mode-rules.json",
        reactionDefinitions: "/games/genshin/data/calc/reaction-definitions.json"
    };

    const DISPLAY_DATA_PATHS = {
        characters: "/games/genshin/data/characters.json",
        weapons: "/games/genshin/data/weapons.json",
        artifactSets: "/games/genshin/data/artifact-sets.json",
        enemies: "/games/genshin/data/enemies.json",
        characterTalents: "/games/genshin/data/character-talents.json",
        weaponEffects: "/games/genshin/data/weapon-effects.json",
        artifactSetEffects: "/games/genshin/data/artifact-set-effects.json"
    };

    const VALID_UID_HANDLING = new Set([
        "includedInUidStats",
        "includedInUidTalentLevels",
        "conditional",
        "manualOnly",
        "displayOnly",
        "special"
    ]);
    const VALID_BEHAVIOR_OPERATIONS = new Set([
        "add", "multiply", "replace", "reset", "extend", "consume", "setMaximum", "ignoreCooldown", "refresh"
    ]);

    const VALID_CALC_SUPPORT = new Set(["simple", "toggle", "stack", "custom", "dynamic", "special", "displayOnly", "referenceAttackType"]);

    let cache = null;
    const CANONICAL_GENERATOR = "genshinCanonicalRuntimeGenerate/2";

    function behaviorConditionMatches(condition, context = {}) {
        if (!condition || typeof condition !== "object") return false;
        if (condition.kind === "always") return true;
        const stateKey = String(condition.stateKey || "");
        const activeStateKeys = new Set(context.activeBehaviorStateKeys || []);
        if (activeStateKeys.has(stateKey)) return true;
        if (condition.kind === "constellation") {
            const match = stateKey.match(/^([^:]+):C([1-6])$/);
            return Boolean(match)
                && String(context.characterId || "") === match[1]
                && Number(context.constellation || 0) >= Number(match[2]);
        }
        return false;
    }

    function behaviorValueAtPath(spec, pointer) {
        const parts = String(pointer || "").split("/").slice(1);
        let current = spec;
        for (const part of parts) {
            if (!current || typeof current !== "object" || !Object.prototype.hasOwnProperty.call(current, part)) {
                return { found: false, value: null };
            }
            current = current[part];
        }
        if (current && typeof current === "object" && Object.prototype.hasOwnProperty.call(current, "value")) {
            return { found: true, value: current.value, measurement: current };
        }
        return { found: true, value: current };
    }

    function behaviorOperationResult(modifier, baseValue) {
        const value = modifier.value;
        if (["add", "extend"].includes(modifier.operation)) return { mode: "delta", baseValue, delta: value, resolvedValue: Number(baseValue) + Number(value) };
        if (modifier.operation === "consume") return { mode: "delta", baseValue, delta: -Number(value || 0), resolvedValue: Number(baseValue) - Number(value || 0) };
        if (modifier.operation === "multiply") return { mode: "factor", baseValue, factor: value, resolvedValue: Number(baseValue) * Number(value) };
        if (["replace", "setMaximum", "reset", "ignoreCooldown", "refresh"].includes(modifier.operation)) {
            return { mode: "absolute", baseValue, value, resolvedValue: value };
        }
        return { mode: "unknown", baseValue, value, resolvedValue: null };
    }

    function resolveBehaviorModifiers(data, context = {}) {
        const applied = [];
        Object.values(data?.behaviorModifiers || {}).forEach((entry) => {
            const modifiers = Array.isArray(entry) ? entry : entry?.modifiers;
            (Array.isArray(modifiers) ? modifiers : []).forEach((modifier) => {
                if (!behaviorConditionMatches(modifier?.condition, context)) return;
                const targetSpec = data?.behaviorSpecs?.[modifier.targetSpecId];
                const targetValue = behaviorValueAtPath(targetSpec, modifier.path);
                if (!targetValue.found || targetValue.value === null || targetValue.value === undefined) return;
                applied.push({
                    id: modifier.id,
                    targetSpecId: modifier.targetSpecId,
                    path: modifier.path,
                    operation: modifier.operation,
                    value: modifier.value,
                    condition: modifier.condition,
                    result: behaviorOperationResult(modifier, targetValue.value),
                    provenance: modifier.provenance || null
                });
            });
        });
        applied.sort((a, b) => String(a.id).localeCompare(String(b.id)));
        return {
            appliedCount: applied.length,
            applied,
            byTarget: Object.groupBy
                ? Object.groupBy(applied, (item) => item.targetSpecId)
                : applied.reduce((acc, item) => {
                    (acc[item.targetSpecId] ||= []).push(item);
                    return acc;
                }, {})
        };
    }

    async function fetchJson(key, path, warnings) {
        try {
            const response = await fetch(path, { cache: "no-cache" });
            if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
            const json = await response.json();
            console.info(`[genshin-calc-data] loaded ${key}: ${path}`);
            return json;
        } catch (error) {
            const message = `${path} の読み込みに失敗しました: ${error.message}`;
            warnings.push({ level: "error", message });
            console.warn(`[genshin-calc-data] ${message}`, error);
            return {};
        }
    }

    function hasAnyValueSource(modifier) {
        return [
            "value",
            "valueByRefinement",
            "valueByRefinementPerStack",
            "valueByStack",
            "valueByLevel",
            "valuePerStack",
            "valuePerGeneratedStack",
            "valuePerConsumedStack",
            "valuePerExcessStack",
            "valuePer1000",
            "valuePerStep",
            "valueByCondition",
            "effectiveAdditionalValuePerStack",
            "critRate",
            "critDamage",
            "ratio",
            "maxValue",
            "scalings",
            "targetEffect",
            "effect",
            "resource"
        ].some((key) => Object.prototype.hasOwnProperty.call(modifier, key));
    }

    function validateTalentScalings(data, warnings) {
        Object.entries(data || {}).forEach(([characterId, talents]) => {
            Object.entries(talents || {}).forEach(([talentKey, talent]) => {
                if (!Array.isArray(talent.entries)) {
                    warnings.push({ level: "warn", message: `${characterId}.${talentKey} に entries がありません。` });
                    return;
                }
                talent.entries.forEach((entry) => {
                    ["id", "label", "attackType", "damageType", "element", "hitCount"].forEach((key) => {
                        if (entry[key] === undefined || entry[key] === "") {
                            warnings.push({ level: "warn", message: `${characterId}.${talentKey} のentryに ${key} がありません。` });
                        }
                    });
                    if (!Array.isArray(entry.scalings) || !entry.scalings.length) {
                        warnings.push({ level: "warn", message: `${characterId}.${talentKey}.${entry.id || "unknown"} に scalings がありません。` });
                        return;
                    }
                    entry.scalings.forEach((scaling) => {
                        if (!scaling.stat || !scaling.valuesByLevel) {
                            warnings.push({ level: "warn", message: `${characterId}.${talentKey}.${entry.id} の scaling に stat / valuesByLevel が不足しています。` });
                        }
                    });
                });
            });
        });
    }

    function validateModifier(modifier, source, warnings, options = {}) {
        const requiredKeys = ["category", "condition", "calculationSupport"];
        if (!["resourceEffect", "resourceGeneratedEffect", "resourceCostOverride"].includes(modifier.category)) {
            requiredKeys.push("applyTo");
        }
        if (!options.uidHandlingOptional) requiredKeys.push("uidHandling");
        requiredKeys.forEach((key) => {
            if (modifier[key] === undefined) {
                warnings.push({ level: "warn", message: `${source}.${modifier.id || "unknown"} に ${key} がありません。` });
            }
        });
        if (modifier.uidHandling && !VALID_UID_HANDLING.has(modifier.uidHandling)) {
            warnings.push({ level: "warn", message: `${source}.${modifier.id || "unknown"} の uidHandling が未対応です: ${modifier.uidHandling}` });
        }
        if (modifier.calculationSupport && !VALID_CALC_SUPPORT.has(modifier.calculationSupport)) {
            warnings.push({ level: "warn", message: `${source}.${modifier.id || "unknown"} の calculationSupport が未対応です: ${modifier.calculationSupport}` });
        }
        if ((modifier.category === "special" || (modifier.applyTo || []).includes("specialEffect"))) {
            warnings.push({ level: "warn", message: `${source}.${modifier.id || "unknown"} は special 扱いです。候補表示のみ推奨です。` });
        }
        if (!hasAnyValueSource(modifier) && !options.valueOptional) {
            warnings.push({ level: "warn", message: `${source}.${modifier.id || "unknown"} に値情報がありません。` });
        }
    }

    function talentScalingGroup(sourceId) {
        return {
            combat1: "normalAttack",
            combat2: "skill",
            combat3: "burst"
        }[sourceId] || "";
    }

    function talentModifierRepresentedByScalings(modifier, characterId, sourceId, talentScalings) {
        const group = talentScalingGroup(sourceId);
        return Boolean(
            group
            && modifier?.category === "extraDamage"
            && modifier?.calculationSupport === "special"
            && (modifier.applyTo || []).includes("triggeredDamage")
            && !hasAnyValueSource(modifier)
            && (talentScalings?.[characterId]?.[group]?.entries || []).length
        );
    }

    function walkModifiers(data, warnings, sourceName, options = {}) {
        Object.entries(data || {}).forEach(([id, entry]) => {
            if (Array.isArray(entry.modifiers)) {
                entry.modifiers.forEach((modifier) => validateModifier(modifier, `${sourceName}.${id}`, warnings));
            }
            ["twoPiece", "fourPiece", "onePiece"].forEach((key) => {
                if (Array.isArray(entry[key])) {
                    entry[key].forEach((modifier) => validateModifier(modifier, `${sourceName}.${id}.${key}`, warnings));
                }
            });
            if (Array.isArray(entry.passives)) {
                entry.passives.forEach((passive) => {
                    (passive.modifiers || []).forEach((modifier, modifierIndex) => {
                        const registryKey = `${id}.${passive.sourceId || "unknown"}.${modifierIndex}`;
                        validateModifier(modifier, `${sourceName}.${id}.passives.${passive.sourceId || "unknown"}`, warnings, {
                            uidHandlingOptional: sourceName === "talentModifiers",
                            valueOptional: sourceName === "talentModifiers" && (
                                Boolean(options.talentEffectRegistry?.records?.[registryKey])
                                || talentModifierRepresentedByScalings(modifier, id, passive.sourceId, options.talentScalings)
                            )
                        });
                    });
                });
            }
            if (entry.constellations) {
                Object.entries(entry.constellations).forEach(([level, modifiers]) => {
                    (modifiers || []).forEach((modifier) => validateModifier(modifier, `${sourceName}.${id}.C${level}`, warnings));
                });
            }
        });
    }

    function validateAttackModeRules(data, warnings) {
        const validGroups = new Set(["skill", "burst"]);
        const validAttackTypes = new Set(["normalAttack", "chargedAttack", "plungingAttack"]);
        const validDamageTypes = new Set(["normal", "charged", "plunging", "skill", "burst"]);
        Object.entries(data?.characters || {}).forEach(([characterId, groups]) => {
            Object.entries(groups || {}).forEach(([group, rule]) => {
                if (!validGroups.has(group)) {
                    warnings.push({ level: "warn", message: `attackModeRules.${characterId}.${group} has an unsupported source group.` });
                }
                Object.entries(rule?.damageTypeByAttackType || {}).forEach(([attackType, damageType]) => {
                    if (!validAttackTypes.has(attackType) || !validDamageTypes.has(damageType)) {
                        warnings.push({ level: "warn", message: `attackModeRules.${characterId}.${group}.${attackType} has an unsupported damage type: ${damageType}` });
                    }
                });
            });
        });
    }

    function validateWeaponEffectRegistry(registry, weaponModifiers, warnings) {
        const validActivationTypes = new Set(["always", "toggle", "stack", "option", "displayOnly"]);
        const validInputPolicies = new Set(["reflected", "calculate", "sourceContext", "displayOnly"]);
        const validTargetOwners = new Set(["self", "team", "activeCharacter", "otherPartyMembers", "enemy"]);
        Object.entries(registry?.weapons || {}).forEach(([weaponId, definition]) => {
            const modifierIds = new Set((weaponModifiers?.[weaponId]?.modifiers || []).map((modifier) => modifier.id));
            const seenGroups = new Set();
            (definition.groups || []).forEach((group) => {
                const path = `weaponEffectRegistry.${weaponId}.${group.id || "unknown"}`;
                if (!group.id || seenGroups.has(group.id)) warnings.push({ level: "warn", message: `${path} has a missing or duplicate group id.` });
                seenGroups.add(group.id);
                if (!group.name) warnings.push({ level: "warn", message: `${path} has no display name.` });
                if (!validActivationTypes.has(group.activation?.type)) warnings.push({ level: "warn", message: `${path} has an unsupported activation type.` });
                if (!validInputPolicies.has(group.inputPolicy)) warnings.push({ level: "warn", message: `${path} has an unsupported input policy.` });
                if (!validTargetOwners.has(group.targetOwner)) warnings.push({ level: "warn", message: `${path} has an unsupported target owner.` });
                (group.modifierIds || []).forEach((modifierId) => {
                    if (!modifierIds.has(modifierId)) warnings.push({ level: "warn", message: `${path} references unknown modifier ${modifierId}.` });
                });
            });
        });
    }

    function sameStringSet(left, right) {
        const normalize = (value) => [...new Set(Array.isArray(value) ? value : [])].sort();
        return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
    }

    function sameDestination(left, right) {
        const keys = ["dataset", "entityId", "collection", "sourceId", "level"];
        if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
        if (Object.keys(left).some((key) => !keys.includes(key)) || Object.keys(right).some((key) => !keys.includes(key))) return false;
        return keys.every((key) => left[key] === right[key]);
    }

    function canonicalTargetArray(data, destination, create = true) {
        if (!destination || typeof destination !== "object") return null;
        const entityId = String(destination.entityId || "");
        if (!entityId) return null;
        if (destination.dataset === "weaponModifiers" && destination.collection === "modifiers"
            && destination.sourceId === undefined && destination.level === undefined) {
            data.weaponModifiers ||= {};
            if (!create && !Array.isArray(data.weaponModifiers?.[entityId]?.modifiers)) return null;
            data.weaponModifiers[entityId] ||= { modifiers: [] };
            data.weaponModifiers[entityId].modifiers ||= [];
            return Array.isArray(data.weaponModifiers[entityId].modifiers) ? data.weaponModifiers[entityId].modifiers : null;
        }
        if (destination.dataset === "artifactSetModifiers" && ["onePiece", "twoPiece", "fourPiece"].includes(destination.collection)
            && destination.sourceId === undefined && destination.level === undefined) {
            data.artifactSetModifiers ||= {};
            if (!create && !Array.isArray(data.artifactSetModifiers?.[entityId]?.[destination.collection])) return null;
            data.artifactSetModifiers[entityId] ||= {};
            data.artifactSetModifiers[entityId][destination.collection] ||= [];
            return Array.isArray(data.artifactSetModifiers[entityId][destination.collection])
                ? data.artifactSetModifiers[entityId][destination.collection]
                : null;
        }
        if (destination.dataset === "talentModifiers" && destination.collection === "passive" && destination.sourceId
            && destination.level === undefined) {
            data.talentModifiers ||= {};
            if (!create) {
                const existing = data.talentModifiers?.[entityId]?.passives?.find((item) => item?.sourceId === destination.sourceId);
                return Array.isArray(existing?.modifiers) ? existing.modifiers : null;
            }
            data.talentModifiers[entityId] ||= { passives: [] };
            data.talentModifiers[entityId].passives ||= [];
            if (!Array.isArray(data.talentModifiers[entityId].passives)) return null;
            let passive = data.talentModifiers[entityId].passives.find((item) => item?.sourceId === destination.sourceId);
            if (!passive) {
                passive = { sourceId: destination.sourceId, modifiers: [] };
                data.talentModifiers[entityId].passives.push(passive);
            }
            passive.modifiers ||= [];
            return Array.isArray(passive.modifiers) ? passive.modifiers : null;
        }
        if (destination.dataset === "constellationModifiers" && destination.collection === "constellation"
            && Number.isInteger(destination.level) && destination.sourceId === undefined) {
            data.constellationModifiers ||= {};
            if (!create && !Array.isArray(data.constellationModifiers?.[entityId]?.constellations?.[String(destination.level)])) return null;
            data.constellationModifiers[entityId] ||= { constellations: {} };
            data.constellationModifiers[entityId].constellations ||= {};
            const level = String(destination.level);
            data.constellationModifiers[entityId].constellations[level] ||= [];
            return Array.isArray(data.constellationModifiers[entityId].constellations[level])
                ? data.constellationModifiers[entityId].constellations[level]
                : null;
        }
        if (destination.dataset === "behaviorModifiers" && destination.collection === "modifiers"
            && destination.sourceId === undefined && destination.level === undefined) {
            data.behaviorModifiers ||= {};
            if (!create && !Array.isArray(data.behaviorModifiers?.[entityId]?.modifiers)) return null;
            data.behaviorModifiers[entityId] ||= { modifiers: [] };
            data.behaviorModifiers[entityId].modifiers ||= [];
            return Array.isArray(data.behaviorModifiers[entityId].modifiers)
                ? data.behaviorModifiers[entityId].modifiers
                : null;
        }
        return null;
    }

    function remapCanonicalRegistryReferences(data, destination, supersedes, canonicalId) {
        if (destination.dataset !== "weaponModifiers") return;
        const groups = data.weaponEffectRegistry?.weapons?.[destination.entityId]?.groups;
        if (!Array.isArray(groups)) return;
        groups.forEach((group) => {
            if (!Array.isArray(group.modifierIds) || !group.modifierIds.some((id) => supersedes.includes(id))) return;
            group.modifierIds = [...new Set(group.modifierIds.map((id) => supersedes.includes(id) ? canonicalId : id))];
            if (group.modifierOverrides && typeof group.modifierOverrides === "object") {
                supersedes.forEach((id) => delete group.modifierOverrides[id]);
            }
        });
    }

    function compareGameVersions(left, right) {
        const parse = (value) => /^\d+(?:\.\d+)*$/.test(String(value || ""))
            ? String(value).split(".").map((part) => Number(part))
            : null;
        const a = parse(left);
        const b = parse(right);
        if (!a || !b) return null;
        for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
            const difference = (a[index] || 0) - (b[index] || 0);
            if (difference) return Math.sign(difference);
        }
        return 0;
    }

    function assessCanonicalVersionAvailability(runtimeDocument, versionBaseline, upstreamVersionHead) {
        const acceptedVersion = versionBaseline?.targetGameVersion?.gameVersion || runtimeDocument?.versionBinding?.gameVersion || null;
        const runtimeAvailability = runtimeDocument?.versionAvailability;
        if (runtimeAvailability && runtimeAvailability.activeForProduction !== true) {
            return { active: false, reason: runtimeAvailability.reason || "canonical runtime is pending target-version revalidation", acceptedVersion, observedLiveVersion: runtimeAvailability.observedLiveVersion || null };
        }
        if (!upstreamVersionHead) {
            return versionBaseline
                ? { active: false, reason: "official live-version evidence is missing", acceptedVersion, observedLiveVersion: null }
                : { active: true, reason: null, acceptedVersion, observedLiveVersion: null };
        }
        const observedLiveVersion = upstreamVersionHead?.observedGameVersion;
        const headValid = upstreamVersionHead?.schemaVersion === 1
            && upstreamVersionHead?.kind === "genshinUpstreamVersionHead"
            && upstreamVersionHead?.evidence?.kind === "officialReleaseNotes"
            && upstreamVersionHead?.evidence?.providerFamily === "official-hoyoverse"
            && upstreamVersionHead?.evidence?.claim?.gameVersion === observedLiveVersion
            && /^[a-f0-9]{64}$/.test(upstreamVersionHead?.evidence?.rawApiResponseDigest || "")
            && /^[a-f0-9]{64}$/.test(upstreamVersionHead?.evidence?.fieldDigest || "");
        const comparison = headValid ? compareGameVersions(acceptedVersion, observedLiveVersion) : null;
        if (!headValid || comparison === null) {
            return { active: false, reason: "official live-version evidence is invalid or unbound", acceptedVersion, observedLiveVersion: observedLiveVersion || null };
        }
        if (comparison < 0) {
            return { active: false, reason: `accepted canonical version ${acceptedVersion} is behind official live version ${observedLiveVersion}`, acceptedVersion, observedLiveVersion };
        }
        return { active: true, reason: null, acceptedVersion, observedLiveVersion };
    }

    function applyCanonicalRuntime(data, runtimeDocument, warnings = [], versionBaseline = null, upstreamVersionHead = null) {
        const modifiers = runtimeDocument?.modifiers;
        const summary = { offered: 0, applied: 0, rejected: 0, superseded: 0 };
        if (!modifiers || typeof modifiers !== "object" || Array.isArray(modifiers)) return summary;
        const binding = runtimeDocument?.versionBinding;
        if (versionBaseline) {
            const expectedVersion = versionBaseline?.targetGameVersion?.gameVersion;
            const bindingReady = versionBaseline?.targetGameVersion?.status === "strictlyBound"
                && typeof versionBaseline?.snapshotId === "string" && versionBaseline.snapshotId
                && typeof versionBaseline?.sourceCatalogDigest === "string" && versionBaseline.sourceCatalogDigest
                && binding?.status === "strictlyBound"
                && binding?.gameVersion === expectedVersion
                && binding?.acceptedSnapshotId === versionBaseline.snapshotId
                && binding?.sourceCatalogDigest === versionBaseline.sourceCatalogDigest;
            if (!bindingReady) {
                summary.offered = Object.keys(modifiers).length;
                summary.rejected = summary.offered;
                warnings.push({ level: "warn", message: "canonicalRuntime rejected: version baseline binding mismatch" });
                return summary;
            }
        }
        const availability = assessCanonicalVersionAvailability(runtimeDocument, versionBaseline, upstreamVersionHead);
        if (!availability.active) {
            summary.offered = Object.keys(modifiers).length;
            summary.rejected = summary.offered;
            summary.inactivePendingRevalidation = summary.offered;
            summary.versionAvailability = availability;
            warnings.push({ level: "warn", message: `canonicalRuntime inactive pending revalidation: ${availability.reason}` });
            return summary;
        }
        Object.keys(modifiers).sort().forEach((key) => {
            summary.offered += 1;
            const modifier = modifiers[key];
            const reject = (reason) => {
                summary.rejected += 1;
                warnings.push({ level: "warn", message: `canonicalRuntime.${key} rejected: ${reason}` });
            };
            if (!modifier || modifier.id !== key) return reject("modifier id mismatch");
            if (modifier.runtime?.status !== "canonical" || modifier.runtime?.generator !== CANONICAL_GENERATOR) {
                return reject("unsupported runtime producer");
            }
            if (modifier.provenance?.status !== "canonical") return reject("canonical provenance missing");
            const assessment = window.GenshinDataContract?.assessRuntimeEligibility(modifier, {
                currentGameVersion: versionBaseline?.targetGameVersion?.gameVersion || binding?.gameVersion || null
            });
            if (!assessment?.eligible || assessment.mode !== "v2") return reject(assessment?.reason || "v2 verification failed");
            if (!Array.isArray(modifier.provenance?.providers) || new Set(modifier.provenance.providers).size < 2) {
                return reject("independent providers missing");
            }
            if (!Array.isArray(modifier.provenance?.independenceGroups) || new Set(modifier.provenance.independenceGroups).size < 2) {
                return reject("independent evidence groups missing");
            }
            if (!sameDestination(modifier.destination, modifier.runtime.destination)) {
                return reject("destination mismatch");
            }
            let canonicalBehaviorSpec = null;
            if (modifier.destination.dataset === "behaviorModifiers") {
                if (modifier.runtimeKind !== "behavior" || modifier.category !== "behavior"
                    || !Array.isArray(modifier.applyTo) || modifier.applyTo.length !== 1 || modifier.applyTo[0] !== "behavior"
                    || modifier.calculationSupport !== "special" || modifier.uidHandling !== "special"
                    || typeof modifier.targetSpecId !== "string" || !modifier.targetSpecId
                    || typeof modifier.path !== "string" || !/^\/(timing|execution|lifecycle|energy|elementApplication|triggers|stackRules|stateMachine|actor|enemyCountBehavior)\//.test(modifier.path)
                    || !VALID_BEHAVIOR_OPERATIONS.has(modifier.operation)
                    || !Object.prototype.hasOwnProperty.call(modifier, "value")
                    || !modifier.condition || typeof modifier.condition !== "object") {
                    return reject("malformed behavior runtime modifier");
                }
                canonicalBehaviorSpec = modifier.targetSpec;
                const targetMeasurement = behaviorValueAtPath(canonicalBehaviorSpec, modifier.path);
                if (!canonicalBehaviorSpec || canonicalBehaviorSpec.id !== modifier.targetSpecId
                    || canonicalBehaviorSpec.verification?.status !== "verified"
                    || canonicalBehaviorSpec.verification?.canonicalEligibility !== true
                    || canonicalBehaviorSpec.verification?.sourceAgreement !== "agreed"
                    || canonicalBehaviorSpec.verification?.reviewedBy !== modifier.provenance?.reviewedBy
                    || canonicalBehaviorSpec.verification?.reviewedAt !== modifier.provenance?.reviewedAt
                    || !targetMeasurement.found || targetMeasurement.value === null || targetMeasurement.value === undefined) {
                    return reject("verified behavior target spec missing or inconsistent");
                }
            }
            if (!sameStringSet(modifier.supersedesLegacyModifierIds, modifier.runtime.supersedesLegacyModifierIds)) {
                return reject("supersession mismatch");
            }
            if (!Array.isArray(modifier.runtime.modifierIds) || modifier.runtime.modifierIds.length !== 1 || modifier.runtime.modifierIds[0] !== key) {
                return reject("runtime modifier id mismatch");
            }
            const supersedes = [...new Set(modifier.supersedesLegacyModifierIds || [])];
            const existingTarget = canonicalTargetArray(data, modifier.destination, false);
            if (supersedes.length && !existingTarget) return reject("declared legacy supersession route is absent");
            const target = existingTarget || canonicalTargetArray(data, modifier.destination, true);
            if (!target) return reject("unsupported or malformed destination");
            if (supersedes.some((id) => !target.some((item) => item?.id === id))) {
                return reject("declared legacy supersession target is absent");
            }
            if (modifier.destination.dataset === "weaponModifiers") {
                const groups = data.weaponEffectRegistry?.weapons?.[modifier.destination.entityId]?.groups;
                const supersessionIds = new Set(supersedes);
                const structuredGroup = Array.isArray(groups) && groups.some((group) =>
                    Array.isArray(group.modifierIds)
                    && group.modifierIds.some((id) => id === key || supersessionIds.has(id))
                );
                // Without an explicit registry group the calculation engine's
                // legacy fallback derives target/condition metadata from
                // sourceText. Canonical records must never enter that path.
                if (!structuredGroup) return reject("canonical weapon registry route missing");
            }
            if (target.some((item) => item?.id === key && !supersedes.includes(key))) {
                return reject("canonical modifier id already exists");
            }
            if (canonicalBehaviorSpec) {
                data.behaviorSpecs ||= {};
                const existingSpec = data.behaviorSpecs[canonicalBehaviorSpec.id];
                if (existingSpec && JSON.stringify(existingSpec) !== JSON.stringify(canonicalBehaviorSpec)) {
                    return reject("canonical behavior target spec collision");
                }
                data.behaviorSpecs[canonicalBehaviorSpec.id] = canonicalBehaviorSpec;
            }
            const retained = target.filter((item) => !supersedes.includes(item?.id));
            summary.superseded += target.length - retained.length;
            target.splice(0, target.length, ...retained, modifier);
            remapCanonicalRegistryReferences(data, modifier.destination, supersedes, key);
            summary.applied += 1;
        });
        return summary;
    }

    function validateCalcData(data) {
        const warnings = [];
        (window.GenshinDataContract?.validateManifest(data.dataManifest) || []).forEach((message) => {
            warnings.push({ level: "warn", message });
        });
        validateTalentScalings(data.talentScalings, warnings);
        walkModifiers(data.talentModifiers, warnings, "talentModifiers", {
            talentScalings: data.talentScalings,
            talentEffectRegistry: data.talentEffectRegistry
        });
        walkModifiers(data.weaponModifiers, warnings, "weaponModifiers");
        validateWeaponEffectRegistry(data.weaponEffectRegistry, data.weaponModifiers, warnings);
        walkModifiers(data.artifactSetModifiers, warnings, "artifactSetModifiers");
        walkModifiers(data.constellationModifiers, warnings, "constellationModifiers");
        validateAttackModeRules(data.attackModeRules, warnings);
        if (warnings.length) {
            console.warn(`[genshin-calc-validate] ${warnings.length}件の確認事項があります。`, warnings.slice(0, 10));
        }
        return warnings;
    }

    async function loadGenshinCalcData() {
        if (cache) return cache;
        const warnings = [];
        const entries = await Promise.all(
            Object.entries({ ...CALC_PATHS, ...DISPLAY_DATA_PATHS }).map(async ([key, path]) => [key, await fetchJson(key, path, warnings)])
        );
        const data = Object.fromEntries(entries);
        data.canonicalRuntimeSummary = applyCanonicalRuntime(data, data.canonicalRuntime, warnings, data.versionBaseline, data.upstreamVersionHead);
        data.warnings = warnings.concat(validateCalcData(data));
        cache = data;
        return cache;
    }

    window.GenshinCalcData = {
        loadGenshinCalcData,
        validateCalcData,
        applyCanonicalRuntime,
        assessCanonicalVersionAvailability,
        canonicalTargetArray,
        behaviorConditionMatches,
        resolveBehaviorModifiers,
        talentModifierRepresentedByScalings
    };
})();
