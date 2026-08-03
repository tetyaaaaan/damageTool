const fs = require("node:fs");
const path = require("node:path");
const { loadHsrDataFiles } = require("./lib/hsrDataFiles.cjs");

const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "games", "hsr", "data");
const calcDir = path.join(dataDir, "calc");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const catalog = readJson(path.join(dataDir, "catalog.json"));
const manifest = readJson(path.join(calcDir, "character-completion.json"));
const coverage = readJson(path.join(calcDir, "coverage-report.json"));
const registeredData = loadHsrDataFiles(root);
const reviewedAttacks = registeredData.attackOverrides;
const modifiers = registeredData.modifiers;
const goldenSource = fs.readFileSync(path.join(root, "tests", "hsr", "hsrGoldenScenarios.test.cjs"), "utf8");

const complete = new Set(manifest.complete.map(String));
const provisional = new Map(manifest.provisional.map((entry) => [String(entry.id), entry.missing || []]));
const knownIds = new Set(catalog.characters.map((character) => String(character.id)));
const errors = [];
for (const id of complete) {
  if (!knownIds.has(id)) errors.push(`complete に未知のキャラクターID ${id} があります。`);
  if (provisional.has(id)) errors.push(`${id} が complete と provisional に重複しています。`);
  if (!goldenSource.includes(`${id} golden:`)) errors.push(`complete の ${id} にキャラ単位ゴールデンテストがありません。`);
}
for (const id of provisional.keys()) if (!knownIds.has(id)) errors.push(`provisional に未知のキャラクターID ${id} があります。`);

const countBy = (items, key) => items.reduce((result, item) => {
  const value = key(item);
  result[value] = (result[value] || 0) + 1;
  return result;
}, {});
const reviewedByCharacter = countBy(reviewedAttacks, (attack) => String(attack.characterId));
const pendingByCharacter = countBy(coverage.attacks.pendingIds || [], (attack) => String(attack.characterId));
const modifierByCharacter = countBy(modifiers.filter((modifier) => ["trace", "eidolon"].includes(modifier.source?.kind)), (modifier) => String(modifier.source.id));
const calculableByCharacter = countBy(modifiers.filter((modifier) => ["trace", "eidolon"].includes(modifier.source?.kind) && modifier.support?.status === "calculable"), (modifier) => String(modifier.source.id));
const pendingCandidateByCharacter = countBy((coverage.modifiers.pendingCandidates || []).filter((candidate) => ["trace", "traceNode", "eidolon"].includes(candidate.kind)), (candidate) => String(candidate.sourceId));
const goldenIds = new Set([...goldenSource.matchAll(/([0-9]+) golden:/g)].map((match) => match[1]));

const characters = catalog.characters.map((character) => {
  const id = String(character.id);
  const status = complete.has(id) ? "complete" : provisional.has(id) ? "provisional" : "incomplete";
  return {
    id,
    name: character.name,
    status,
    missing: provisional.get(id) || [],
    reviewedAttacks: reviewedByCharacter[id] || 0,
    pendingGeneratedAttacks: pendingByCharacter[id] || 0,
    structuredModifiers: modifierByCharacter[id] || 0,
    calculableModifiers: calculableByCharacter[id] || 0,
    pendingModifierCandidates: pendingCandidateByCharacter[id] || 0,
    goldenTest: goldenIds.has(id),
    browserVerified: complete.has(id)
  };
});
const statusCounts = countBy(characters, (character) => character.status);
if ((statusCounts.complete || 0) + (statusCounts.provisional || 0) + (statusCounts.incomplete || 0) !== catalog.characters.length) {
  errors.push("キャラクター状態の合計がカタログ件数と一致しません。");
}

const report = {
  generatedAt: new Date().toISOString().slice(0, 10),
  definition: manifest.definition,
  summary: {
    catalogCharacters: catalog.characters.length,
    complete: statusCounts.complete || 0,
    provisional: statusCounts.provisional || 0,
    incomplete: statusCounts.incomplete || 0,
    uiConnectedModifiers: modifiers.length,
    calculationConnectedModifiers: modifiers.filter((modifier) => modifier.support?.status === "calculable").length,
    breakdownConnectedModifiers: modifiers.filter((modifier) => modifier.support?.status === "calculable").length,
    goldenTestCharacters: goldenIds.size,
    browserVerifiedCharacters: complete.size,
    pendingGeneratedAttacks: coverage.attacks.pendingReview,
    pendingModifierCandidates: coverage.modifiers.pendingCandidateRecords
  },
  commonPatterns: {
    activationModes: countBy(modifiers, (modifier) => modifier.activation?.mode || "none"),
    valueKinds: countBy(modifiers, (modifier) => modifier.value?.kind || "scalar"),
    calculationStages: countBy(modifiers, (modifier) => modifier.calculation?.stage || "none"),
    categories: countBy(modifiers, (modifier) => modifier.category || "none")
  },
  characters,
  errors
};

fs.writeFileSync(path.join(calcDir, "character-coverage-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`HSR character completion: complete ${report.summary.complete}, provisional ${report.summary.provisional}, incomplete ${report.summary.incomplete}`);
console.log(`Connected modifiers: UI ${report.summary.uiConnectedModifiers}, calculation/audit ${report.summary.calculationConnectedModifiers}`);
console.log(`Remaining: attacks ${report.summary.pendingGeneratedAttacks}, modifier candidates ${report.summary.pendingModifierCandidates}`);
if (errors.length) {
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
}
