const fs = require("node:fs");
const path = require("node:path");
const { loadHsrDataFiles } = require("./lib/hsrDataFiles.cjs");

const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "games", "hsr", "data");
const generated = JSON.parse(fs.readFileSync(path.join(dataDir, "attacks.generated.json"), "utf8"));
const registeredData = loadHsrDataFiles(root);
const catalog = JSON.parse(fs.readFileSync(path.join(dataDir, "catalog.json"), "utf8"));
const characterIds = new Set(catalog.characters.map((item) => String(item.id)));
const issues = [];
const validStatuses = new Set(["calculable", "displayOnly", "review"]);
const validElements = new Set(["Physical", "Fire", "Ice", "Thunder", "Wind", "Quantum", "Imaginary"]);

function validateSupport(support, location) {
  if (!support || !validStatuses.has(support.status) || typeof support.verified !== "boolean" || !String(support.reason || "").trim()) issues.push(`${location}: invalid support contract`);
  if (support?.status === "calculable" && support.verified !== true) issues.push(`${location}: calculable data must be verified`);
}

function validateAttack(attack, location) {
  if (!/^\d+$/.test(String(attack.id || ""))) issues.push(`${location}: invalid id`);
  if (!characterIds.has(String(attack.characterId))) issues.push(`${location}: unknown characterId ${attack.characterId}`);
  if (!validElements.has(attack.element)) issues.push(`${location}: invalid element ${attack.element}`);
  if (!Array.isArray(attack.multipliers) || !attack.multipliers.length || attack.multipliers.some((value) => !Number.isFinite(value) || value < 0)) issues.push(`${location}: invalid multipliers`);
  if (!/^\d+$/.test(String(attack.sourceSkillId || ""))) issues.push(`${location}: invalid sourceSkillId`);
  if (attack.support) validateSupport(attack.support, `${location}.support`);
}

validateSupport(generated.support, "attacks.generated.json.support");
registeredData.attackOverrideSources.forEach((source) => validateSupport(source.support, `${source.file}.support`));
generated.attacks.forEach((attack, index) => validateAttack(attack, `generated[${index}]`));
registeredData.attackOverrides.forEach((attack, index) => validateAttack(attack, `overrides[${index}]`));
const overrideIds = new Set(registeredData.attackOverrides.map((attack) => String(attack.id)));
const summary = {
  total: generated.attacks.length,
  reviewedOverrides: overrideIds.size,
  pendingReview: generated.attacks.filter((attack) => !overrideIds.has(String(attack.id))).length,
  charactersWithGeneratedAttacks: new Set(generated.attacks.map((attack) => String(attack.characterId))).size,
  charactersWithReviewedAttacks: new Set(registeredData.attackOverrides.map((attack) => String(attack.characterId))).size
};
console.log(JSON.stringify({ summary, issues }, null, 2));
if (issues.length) process.exitCode = 1;
