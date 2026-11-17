const fs = require("node:fs");
const path = require("node:path");
const { loadHsrDataFiles } = require("./lib/hsrDataFiles.cjs");

const root = path.resolve(__dirname, "..");
const registeredData = loadHsrDataFiles(root);
const modifiers = registeredData.modifiers;
const allowedStatuses = new Set(["calculable", "displayOnly", "review"]);
const allowedValueKinds = new Set(["fixed", "byLevel", "byRefinement", "perStack", "perStackByLevel", "perStackByRefinement", "perReferenceStack", "threshold", "thresholdDeltaByRefinement", "providerStatPercentByLevel", "inputScaleByLevelPlusByLevel", "targetBasePercentCappedByProviderPercentByLevel", "linearThreshold", "missingHpScaleByLevel"]);
const allowedStackRules = new Set(["add", "max", "replace", "nonStacking"]);
const fieldSets = {
  root: new Set(["id", "variant", "providerScope", "source", "name", "description", "category", "stat", "unit", "value", "inputValidation", "target", "supplementalAttack", "primaryTargetOnly", "adjacentTargetOnly", "activation", "stacking", "calculation", "inputPolicy", "finalStatsInclusion", "support", "provenance", "scope"]),
  source: new Set(["kind", "id", "skillId", "traceId", "eidolonRank", "setPieces", "rankId", "wearerIds"]),
  value: new Set(["kind", "fixed", "values", "perStack", "reference", "multiplierInputKey", "sharedInput", "multiplierInputLabel", "multiplierWhenTrue", "inputKey", "inputLabel", "inputUnit", "providerStat", "targetStat", "default", "minimum", "inputMaximum", "inputStep", "inputMultipliers", "levelInputKey", "levelInputLabel", "levelDefault", "scaleValues", "addValues", "targetPercentValues", "capPercentValues", "threshold", "step", "perStep", "maximum", "maximumAtEidolon", "thresholds"]),
  inputValidation: new Set(["maximumEidolon", "levelMaximum", "levelMaximumAtEidolon", "minimum", "maximum", "integer", "whenToggle"]),
  target: new Set(["owner", "attackTypes", "excludeSelf", "attackIds", "elements"]),
  supplementalAttack: new Set(["name", "element", "type", "scalingStat", "target", "canCrit", "statReference", "triggerActor", "damageBonusInputKey", "damageBonusInputLabel", "ownerInputKey", "requiredStatReferenceId"]),
  activation: new Set(["requiredToggleKey", "recipientInputKey", "requiredCharacterId", "requiredCharacterMaxEidolon", "mode", "conditionText", "inputKey", "inputLabel", "threshold", "thresholdReference", "minimum", "maximum", "maximumAtEidolon", "default", "reference", "operator", "durationTurns", "comparisonDerived", "strictInput", "step", "statSource"]),
  stacking: new Set(["group", "rule", "maximumStacks"]),
  calculation: new Set(["stage", "operation", "cap", "floor"]),
  finalStatsInclusion: new Set(["inputKey", "inputLabel", "legacyToggleKey", "defaultIncluded"]),
  support: new Set(["status", "verified", "reason"]),
  provenance: new Set(["sourceName", "sourceUrl", "sourceFile", "gameVersion", "verifiedAt", "notes", "sourceCommit", "scope", "verification", "referenceUrl", "formulaSource", "mechanicsSource", "precisionNote", "integrationNote", "toughnessNote"])
};
const allowedCategories = new Set(["statFlat", "statPercent", "critRate", "critRateOverride", "critDamage", "damageBonus", "baseDamageAddition", "multiplierAddition", "breakEffect", "breakEfficiency", "defenseReduction", "defenseIgnore", "resistancePenetration", "resistanceReduction", "takenDamage", "progressiveTakenDamage", "critTakenDamage", "independentMultiplier", "toughnessDamage", "extraDamage", "dotDamage", "superBreakDamage", "elation", "attackState", "breakDamage"]);
const allowedStats = new Set(["hp", "atk", "def", "speed", "critRate", "critDamage", "effectHitRate", "effectRes", "breakEffect", "elation", "energy", "energyRegen"]);
const allowedUnits = new Set(["flat", "percent", "ratio", "toughnessPoint", "boolean", "count", "turn", "stack"]);
const allowedAttackTypes = new Set(["all", "normal", "enhancedNormal", "skill", "enhancedSkill", "ultimate", "talent", "followUp", "additional", "dot", "break", "superBreak", "memospriteSkill", "memospriteTalent", "elation", "technique"]);
const allowedElements = new Set(["Physical", "Fire", "Ice", "Thunder", "Wind", "Quantum", "Imaginary"]);
const allowedOwners = new Set(["self", "activeAlly", "partyAll", "enemySingle", "enemyAll", "summon", "memosprite"]);
const allowedStages = new Set(["baseStats", "baseDamage", "attackMultiplier", "damageBonus", "critical", "defense", "resistance", "vulnerability", "independent", "toughness", "extraDamage", "finalDamage", "breakDamage", "baseStat", "attackState", "resistancePenetration", "multiplierAddition", "critDamage", "takenDamage", "breakEffect"]);
const allowedOperations = new Set(["add", "multiply", "replace", "max", "set", "subtract"]);
const allowedReferences = new Set(["self.hp", "self.hpPercent", "self.preCombatSpeed", "self.epPercent", "self.speed", "self.atk", "self.def", "self.critRate", "self.critDamage", "self.effectHitRate", "self.effectRes", "self.breakEffect", "self.elation", "self.preCombatCritDamage", "self.interpretation", "party.eruditionCount", "party.nihilityAllyCount", "self.maxEnergy", "self.preCombatMaxEnergy", "self.speedAbove100Steps", "self.critDamageAbove120Steps", "party.fieldCount", "party.samePathAllyCount", "provider.speed", "provider.effectRes", "provider.breakEffect", "provider.sameElement", "provider.firstSlotRecipient", "mortenax-infinite-fury-active", "enemy.hpPercent", "enemy.weakness", "enemy.quantumWeakness", "enemy.debuffCount", "enemy.count", "enemy.toughnessRemaining", "enemy.toughnessBroken", "party.count", "party.elationCount", "party.sp", "party.punchline"]);
const allowedProviderStats = new Set(["hp", "hpPercent", "atk", "def", "speed", "critRate", "critDamage", "breakEffect", "effectHitRate", "elation"]);
const allowedTargetStats = new Set(["hp", "atk", "def", "speed"]);

function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function inspectFields(record, fieldSet, at, issues) {
  if (!isRecord(record)) { issues.push(`${at}: must be an object`); return; }
  for (const key of Object.keys(record)) if (!fieldSet.has(key)) issues.push(`${at}: unknown field ${key}`);
}
function checkEnum(value, values, at, issues) {
  if (value !== undefined && !values.has(value)) issues.push(`${at}: unsupported value ${String(value)}`);
}
function checkEnumArray(value, values, at, issues, { required = false, nonEmpty = false } = {}) {
  if (value === undefined) { if (required) issues.push(`${at}: required array`); return; }
  if (!Array.isArray(value) || (nonEmpty && value.length === 0) || (values && value.some((entry) => !values.has(entry)))) issues.push(`${at}: invalid array value`);
}
function validateModifiers(records) {
  const ids = new Set();
  const issues = [];
  const required = ["id", "source", "name", "description", "category", "unit", "value", "target", "activation", "calculation", "support", "provenance"];
  for (const [index, modifier] of (records || []).entries()) {
    const at = `modifiers[${index}]`;
    if (!isRecord(modifier)) { issues.push(`${at}: must be an object`); continue; }
    inspectFields(modifier, fieldSets.root, at, issues);
    for (const key of required) if (modifier[key] === undefined || modifier[key] === null) issues.push(`${at}: missing ${key}`);
    if (typeof modifier.id !== "string" || !modifier.id.trim() || ids.has(modifier.id)) issues.push(`${at}: duplicate or empty id ${modifier.id || ""}`);
    if (typeof modifier.id === "string") ids.add(modifier.id);
    for (const [key, fields] of [["source", fieldSets.source], ["value", fieldSets.value], ["inputValidation", fieldSets.inputValidation], ["target", fieldSets.target], ["supplementalAttack", fieldSets.supplementalAttack], ["activation", fieldSets.activation], ["stacking", fieldSets.stacking], ["calculation", fieldSets.calculation], ["finalStatsInclusion", fieldSets.finalStatsInclusion], ["support", fieldSets.support], ["provenance", fieldSets.provenance]]) {
      if (modifier[key] !== undefined) inspectFields(modifier[key], fields, `${at}.${key}`, issues);
    }
    if (typeof modifier.source?.kind !== "string" || typeof modifier.source?.id !== "string" || !modifier.source.id) issues.push(`${at}: source kind/id required`);
    checkEnum(modifier.source?.kind, new Set(["character", "trace", "eidolon", "lightCone", "relic", "ornament", "enemy", "manual"]), `${at}.source.kind`, issues);
    if (modifier.source?.wearerIds !== undefined) {
      const ids = modifier.source.wearerIds;
      if (modifier.source.kind !== "lightCone" || !Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== "string" || !/^\d+$/.test(id)) || new Set(ids).size !== ids.length) issues.push(`${at}.source.wearerIds: expected unique character IDs for a light cone`);
    }
    checkEnum(modifier.category, allowedCategories, `${at}.category`, issues);
    checkEnum(modifier.stat, allowedStats, `${at}.stat`, issues);
    checkEnum(modifier.unit, allowedUnits, `${at}.unit`, issues);
    checkEnum(modifier.target?.owner, allowedOwners, `${at}.target.owner`, issues);
    checkEnumArray(modifier.target?.attackTypes, allowedAttackTypes, `${at}.target.attackTypes`, issues, { required: true, nonEmpty: true });
    checkEnumArray(modifier.target?.elements, allowedElements, `${at}.target.elements`, issues, { required: true });
    checkEnumArray(modifier.target?.attackIds, null, `${at}.target.attackIds`, issues);
    if (modifier.target?.attackIds !== undefined && (!Array.isArray(modifier.target.attackIds) || modifier.target.attackIds.some((id) => typeof id !== "string" || !id))) issues.push(`${at}.target.attackIds: expected non-empty strings`);
    checkEnum(modifier.value?.kind, allowedValueKinds, `${at}.value.kind`, issues);
    checkEnum(modifier.activation?.mode, new Set(["always", "toggle", "toggleThreshold", "stack", "statThreshold", "numericThreshold"]), `${at}.activation.mode`, issues);
    checkEnum(modifier.providerScope, new Set(["self", "party"]), `${at}.providerScope`, issues);
    checkEnum(modifier.activation?.reference, allowedReferences, `${at}.activation.reference`, issues);
    checkEnum(modifier.activation?.statSource, new Set(["input", "effective"]), `${at}.activation.statSource`, issues);
    checkEnum(modifier.activation?.thresholdReference, new Set(["self.hpPercent"]), `${at}.activation.thresholdReference`, issues);
    if (modifier.activation?.reference === "enemy.quantumWeakness" && (modifier.activation.mode !== "statThreshold" || !modifier.activation.inputKey || modifier.activation.threshold !== 1 || modifier.activation.operator !== "==")) issues.push(`${at}: Quantum weakness requires statThreshold, inputKey and == 1`);
    if (modifier.activation?.thresholdReference !== undefined && (modifier.activation.mode !== "statThreshold" || modifier.activation.reference !== "enemy.hpPercent")) issues.push(`${at}: HP thresholdReference requires statThreshold and enemy.hpPercent`);
    checkEnum(modifier.statSource, new Set(["input", "effective"]), `${at}.statSource`, issues);
    checkEnum(modifier.stacking?.rule, allowedStackRules, `${at}.stacking.rule`, issues);
    if (modifier.stacking?.rule === "multiply") issues.push(`${at}: stacking.rule multiply is unsupported`);
    checkEnum(modifier.calculation?.stage, allowedStages, `${at}.calculation.stage`, issues);
    checkEnum(modifier.calculation?.operation, allowedOperations, `${at}.calculation.operation`, issues);
    if (!allowedStatuses.has(modifier.support?.status)) issues.push(`${at}: invalid support status`);
    if (!allowedValueKinds.has(modifier.value?.kind)) issues.push(`${at}: invalid value kind`);
    if (modifier.support?.status === "calculable" && modifier.support?.verified !== true) issues.push(`${at}: calculable record must be verified`);
    if (modifier.support?.status !== "calculable" && modifier.support?.reason !== undefined && typeof modifier.support.reason !== "string") issues.push(`${at}: support.reason must be text when supplied`);
    if (modifier.inputPolicy === "includedInFinalStats" && modifier.support?.status === "calculable") issues.push(`${at}: persistent final-stat record cannot be calculable`);
    if (modifier.finalStatsInclusion) {
      const inclusion = modifier.finalStatsInclusion;
      if (typeof inclusion.inputKey !== "string" || !inclusion.inputKey || typeof inclusion.inputLabel !== "string" || !inclusion.inputLabel) issues.push(`${at}.finalStatsInclusion: inputKey and inputLabel are required`);
      if (inclusion.legacyToggleKey !== undefined && (typeof inclusion.legacyToggleKey !== "string" || !inclusion.legacyToggleKey)) issues.push(`${at}.finalStatsInclusion.legacyToggleKey: expected non-empty text`);
      if (inclusion.defaultIncluded !== undefined && typeof inclusion.defaultIncluded !== "boolean") issues.push(`${at}.finalStatsInclusion.defaultIncluded: expected boolean`);
      if (modifier.inputPolicy === "includedInFinalStats") issues.push(`${at}: finalStatsInclusion cannot combine with includedInFinalStats policy`);
    }
    if (modifier.category === "baseDamageAddition" && (modifier.source?.kind !== "lightCone" || modifier.stat !== "def" || modifier.value?.kind !== "byRefinement" || modifier.target?.owner !== "self" || modifier.activation?.mode !== "always" || modifier.target.attackTypes?.length !== 1 || modifier.target.attackTypes[0] !== "ultimate" || !modifier.target.attackIds?.length || modifier.target.attackIds.some(id=>!["100103","120803","130403","141403","800303","800403"].includes(id)))) issues.push(`${at}: baseDamageAddition requires the accepted self DEF Ultimate scope`);
    if (modifier.supplementalAttack) {
      for (const key of ["name", "element", "type", "scalingStat", "canCrit"]) if (modifier.supplementalAttack[key] === undefined) issues.push(`${at}: supplementalAttack missing ${key}`);
      checkEnum(modifier.supplementalAttack.statReference, new Set(["activeCharacter", "selectedParty"]), `${at}.supplementalAttack.statReference`, issues);
      checkEnum(modifier.supplementalAttack.element, new Set([...allowedElements,"wearer"]), `${at}.supplementalAttack.element`, issues);
      checkEnum(modifier.supplementalAttack.type, new Set(["additional", "followUp", "dot"]), `${at}.supplementalAttack.type`, issues);
      checkEnum(modifier.supplementalAttack.scalingStat, new Set(["hp", "atk", "def"]), `${at}.supplementalAttack.scalingStat`, issues);
      checkEnum(modifier.supplementalAttack.target, new Set(["single", "blast", "all", "bounce"]), `${at}.supplementalAttack.target`, issues);
      if (modifier.supplementalAttack.requiredStatReferenceId && (modifier.supplementalAttack.statReference !== "selectedParty" || !modifier.supplementalAttack.ownerInputKey || !/^\d+$/.test(modifier.supplementalAttack.requiredStatReferenceId))) issues.push(`${at}: requiredStatReferenceId needs selectedParty and ownerInputKey`);
      if (modifier.category !== "extraDamage") issues.push(`${at}: supplementalAttack requires extraDamage category`);
      if (modifier.support?.status !== "calculable") issues.push(`${at}: supplementalAttack must be calculable`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(modifier.provenance?.verifiedAt || "")) issues.push(`${at}: verifiedAt must be YYYY-MM-DD`);
    const value = modifier.value || {};
    const inputValidation = modifier.inputValidation;
    const eidolonLevel = inputValidation?.levelMaximumAtEidolon;
    if (eidolonLevel && (!Number.isInteger(eidolonLevel.rank) || eidolonLevel.rank < 1 || eidolonLevel.rank > 6 || !Number.isInteger(eidolonLevel.maximum) || eidolonLevel.maximum < 1 || eidolonLevel.maximum > 15 || eidolonLevel.maximum <= inputValidation.levelMaximum)) issues.push(`${at}: levelMaximumAtEidolon must increase levelMaximum at a valid eidolon rank`);
    if (value.kind === "fixed" && !Number.isFinite(value.fixed)) issues.push(`${at}: fixed value required`);
    if (["byLevel", "byRefinement", "perStackByLevel", "perStackByRefinement"].includes(value.kind) && (!Array.isArray(value.values) || !value.values.length || !value.values.every(Number.isFinite))) issues.push(`${at}: numeric values required`);
    if (["byRefinement", "perStackByRefinement"].includes(value.kind) && value.values?.length !== 5) issues.push(`${at}: refinement values must contain R1-R5`);
    if (value.kind === "perStack" && (!Number.isFinite(value.perStack) || !Number.isInteger(modifier.stacking?.maximumStacks ?? modifier.activation?.maximum))) issues.push(`${at}: per-stack value and stack/input maximum required`);
    if (value.kind === "perStackByLevel" && !Number.isInteger(modifier.stacking?.maximumStacks ?? modifier.activation?.maximum)) issues.push(`${at}: level per-stack value needs stack/input maximum`);
    if (value.kind === "perStackByRefinement" && !Number.isInteger(modifier.stacking?.maximumStacks ?? modifier.activation?.maximum)) issues.push(`${at}: refinement per-stack value needs stack/input maximum`);
    if (value.kind === "perReferenceStack") {
      const fixed = Number.isFinite(value.perStack);
      const ranked = modifier.source?.kind === "lightCone" && Array.isArray(value.values) && value.values.length === 5 && value.values.every(Number.isFinite);
      if (!value.reference || !Number.isInteger(value.maximum) || (fixed ? value.values !== undefined : !ranked || value.perStack !== undefined)) issues.push(`${at}: reference, maximum and either fixed perStack or five light-cone rank values required`);
    }
    if (value.kind === "inputScaleByLevelPlusByLevel" && (!value.inputKey || value.scaleValues?.length !== value.addValues?.length)) issues.push(`${at}: input scale/add level tables must align`);
    if (value.kind === "targetBasePercentCappedByProviderPercentByLevel" && (!value.inputKey || !value.providerStat || !value.targetStat || value.targetPercentValues?.length !== value.capPercentValues?.length)) issues.push(`${at}: target/provider capped level tables must align`);
    if (value.kind === "providerStatPercentByLevel" && (!value.inputKey || !value.providerStat || !Array.isArray(value.values) || !value.values.every(Number.isFinite))) issues.push(`${at}: provider stat and numeric level percentages required`);
    if (value.kind === "linearThreshold" && (!value.inputKey || !Number.isFinite(value.threshold) || !Number.isFinite(value.step) || !Number.isFinite(value.perStep))) issues.push(`${at}: linear threshold fields required`);
    if (value.kind === "missingHpScaleByLevel" && (!value.providerStat || !Array.isArray(value.values) || !value.values.every(Number.isFinite))) issues.push(`${at}: provider stat and numeric level values required`);
    if (value.kind === "threshold" && (!Array.isArray(value.thresholds) || !value.thresholds.length)) issues.push(`${at}: thresholds required`);
    if (value.kind === "thresholdDeltaByRefinement" && (!Number.isFinite(value.threshold) || !value.inputKey || !Array.isArray(value.values) || value.values.length !== 5 || !value.values.every(Number.isFinite))) issues.push(`${at}: threshold delta requires a threshold, input key, and five refinement values`);
    if (value.kind === "thresholdDeltaByRefinement" && (!inputValidation || !Number.isFinite(inputValidation.minimum) || !Number.isFinite(inputValidation.maximum) || inputValidation.maximum <= inputValidation.minimum || modifier.source?.kind !== "lightCone" || modifier.source?.id !== "21041" || modifier.category !== "statPercent" || modifier.stat !== "atk" || value.threshold !== 80 || value.reference !== undefined || modifier.activation?.mode !== "toggle" || modifier.activation.default !== false || !modifier.finalStatsInclusion || modifier.finalStatsInclusion.defaultIncluded === true)) issues.push(`${at}: threshold delta currently requires a bounded LC21041 80% EHR-to-ATK input, opt-in toggle, and final-stat inclusion input`);
  }
  return issues;
}

const issues = validateModifiers(modifiers);
const summary = modifiers.reduce((result, modifier) => {
  result.total += 1;
  result[modifier.support?.status] = (result[modifier.support?.status] || 0) + 1;
  result.bySource[modifier.source?.kind] = (result.bySource[modifier.source?.kind] || 0) + 1;
  result.byCategory[modifier.category] = (result.byCategory[modifier.category] || 0) + 1;
  return result;
}, { total: 0, calculable: 0, displayOnly: 0, review: 0, bySource: {}, byCategory: {} });

if (require.main === module) {
  if (issues.length) {
    console.error(JSON.stringify({ summary, issues }, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ summary, issues: [] }, null, 2));
  }
}

module.exports = { data: { modifiers }, dataFiles: registeredData.manifest.modifiers, summary, issues, validateModifiers };
