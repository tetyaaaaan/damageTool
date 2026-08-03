const fs = require("node:fs");
const path = require("node:path");
const { loadHsrDataFiles } = require("./lib/hsrDataFiles.cjs");

const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "games", "hsr", "data", "calc");
const registeredData = loadHsrDataFiles(root);
const data = { modifiers: registeredData.modifiers };

const ids = new Set();
const issues = [];
const allowedStatuses = new Set(["calculable", "displayOnly", "review"]);
const allowedValueKinds = new Set(["fixed", "byLevel", "byRefinement", "perStack", "perStackByLevel", "perStackByRefinement", "perReferenceStack", "threshold", "providerStatPercentByLevel", "inputScaleByLevelPlusByLevel", "targetBasePercentCappedByProviderPercentByLevel", "linearThreshold", "missingHpScaleByLevel"]);
const required = ["id", "source", "name", "description", "category", "unit", "value", "target", "activation", "calculation", "support", "provenance"];

for (const [index, modifier] of (data.modifiers || []).entries()) {
  const at = `modifiers[${index}]`;
  for (const key of required) if (modifier[key] === undefined || modifier[key] === null) issues.push(`${at}: missing ${key}`);
  if (!modifier.id || ids.has(modifier.id)) issues.push(`${at}: duplicate or empty id ${modifier.id || ""}`);
  ids.add(modifier.id);
  if (!modifier.source?.kind || !modifier.source?.id) issues.push(`${at}: source kind/id required`);
  if (!allowedStatuses.has(modifier.support?.status)) issues.push(`${at}: invalid support status`);
  if (!allowedValueKinds.has(modifier.value?.kind)) issues.push(`${at}: invalid value kind`);
  if (!Array.isArray(modifier.target?.attackTypes) || !modifier.target.attackTypes.length) issues.push(`${at}: attackTypes required`);
  if (!Array.isArray(modifier.target?.elements)) issues.push(`${at}: elements must be an array`);
  if (modifier.support?.status === "calculable" && modifier.support?.verified !== true) issues.push(`${at}: calculable record must be verified`);
  if (modifier.support?.status !== "calculable" && !modifier.support?.reason) issues.push(`${at}: non-calculable record needs a reason`);
  if (modifier.inputPolicy === "includedInFinalStats" && modifier.support?.status === "calculable") issues.push(`${at}: persistent final-stat record cannot be calculable`);
  if (modifier.supplementalAttack) {
    for (const key of ["name", "element", "type", "scalingStat", "canCrit"]) if (modifier.supplementalAttack[key] === undefined) issues.push(`${at}: supplementalAttack missing ${key}`);
    if (modifier.category !== "extraDamage") issues.push(`${at}: supplementalAttack requires extraDamage category`);
    if (modifier.support?.status !== "calculable") issues.push(`${at}: supplementalAttack must be calculable`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(modifier.provenance?.verifiedAt || "")) issues.push(`${at}: verifiedAt must be YYYY-MM-DD`);
  const value = modifier.value || {};
  if (value.kind === "fixed" && !Number.isFinite(value.fixed)) issues.push(`${at}: fixed value required`);
  if (["byLevel", "byRefinement", "perStackByLevel", "perStackByRefinement"].includes(value.kind) && (!Array.isArray(value.values) || !value.values.every(Number.isFinite))) issues.push(`${at}: numeric values required`);
  if (["byRefinement", "perStackByRefinement"].includes(value.kind) && value.values?.length !== 5) issues.push(`${at}: refinement values must contain R1-R5`);
  if (value.kind === "perStack" && (!Number.isFinite(value.perStack) || !Number.isInteger(modifier.stacking?.maximumStacks))) issues.push(`${at}: per-stack value and maximumStacks required`);
  if (value.kind === "perStackByLevel" && !Number.isInteger(modifier.stacking?.maximumStacks)) issues.push(`${at}: level per-stack value needs maximumStacks`);
  if (value.kind === "perStackByRefinement" && !Number.isInteger(modifier.stacking?.maximumStacks)) issues.push(`${at}: refinement per-stack value needs maximumStacks`);
  if (value.kind === "perReferenceStack" && (!value.reference || !Number.isFinite(value.perStack) || !Number.isInteger(value.maximum))) issues.push(`${at}: reference, per-stack value and maximum required`);
  if (value.kind === "inputScaleByLevelPlusByLevel" && (!value.inputKey || value.scaleValues?.length !== value.addValues?.length)) issues.push(`${at}: input scale/add level tables must align`);
  if (value.kind === "targetBasePercentCappedByProviderPercentByLevel" && (!value.inputKey || !value.providerStat || !value.targetStat || value.targetPercentValues?.length !== value.capPercentValues?.length)) issues.push(`${at}: target/provider capped level tables must align`);
  if (value.kind === "providerStatPercentByLevel" && (!value.inputKey || !value.providerStat || !Array.isArray(value.values) || !value.values.every(Number.isFinite))) issues.push(`${at}: provider stat and numeric level percentages required`);
  if (value.kind === "linearThreshold" && (!value.inputKey || !Number.isFinite(value.threshold) || !Number.isFinite(value.step) || !Number.isFinite(value.perStep))) issues.push(`${at}: linear threshold fields required`);
  if (value.kind === "missingHpScaleByLevel" && (!value.providerStat || !Array.isArray(value.values) || !value.values.every(Number.isFinite))) issues.push(`${at}: provider stat and numeric level values required`);
  if (value.kind === "threshold" && (!Array.isArray(value.thresholds) || !value.thresholds.length)) issues.push(`${at}: thresholds required`);
}

const summary = (data.modifiers || []).reduce((result, modifier) => {
  result.total += 1;
  result[modifier.support?.status] = (result[modifier.support?.status] || 0) + 1;
  result.bySource[modifier.source?.kind] = (result.bySource[modifier.source?.kind] || 0) + 1;
  result.byCategory[modifier.category] = (result.byCategory[modifier.category] || 0) + 1;
  return result;
}, { total: 0, calculable: 0, displayOnly: 0, review: 0, bySource: {}, byCategory: {} });

if (issues.length) {
  console.error(JSON.stringify({ summary, issues }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ summary, issues: [] }, null, 2));
}

module.exports = { data, dataFiles: registeredData.manifest.modifiers, summary, issues };
