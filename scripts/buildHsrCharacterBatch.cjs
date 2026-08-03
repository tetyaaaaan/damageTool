const fs = require("node:fs");
const path = require("node:path");
const { loadHsrDataFiles } = require("./lib/hsrDataFiles.cjs");

const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "games", "hsr", "data");
const calcDir = path.join(dataDir, "calc");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const option = (name, fallback = "") => {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) || fallback;
};

const ids = option("ids", "1206,1207,1208,1209,1210").split(",").map((id) => id.trim()).filter(Boolean);
const outputName = option("output", `characters-${ids[0]}-${ids.at(-1)}.json`);
const catalog = readJson(path.join(dataDir, "catalog.json"));
const coverage = readJson(path.join(calcDir, "coverage-report.json"));
const generatedAttacks = readJson(path.join(dataDir, "attacks.generated.json")).attacks || [];
const registeredData = loadHsrDataFiles(root);
const overrides = registeredData.attackOverrides;
const modifiers = registeredData.modifiers;
const pendingAttackIds = new Set((coverage.attacks.pendingIds || []).map((attack) => String(attack.id)));
const pendingCandidateKeys = new Set((coverage.modifiers.pendingCandidates || []).map((candidate) => `${candidate.kind}:${candidate.sourceId}:${candidate.recordId}`));
const attackPatternKey = (attack) => [attack.scalingStat || "atk", attack.type, attack.target, attack.canCrit === false ? "nonCrit" : "crit"].join(":");
const establishedAttackPatterns = new Set(overrides.map(attackPatternKey));

const sourceRecord = (character, candidate) => {
  if (candidate.kind === "eidolon") {
    const rank = Number(String(candidate.recordId).split("E").at(-1));
    return character.eidolons?.find((entry) => Number(entry.rank) === rank) || null;
  }
  return [...(character.skills || []), ...(character.traces || [])].find((entry) => String(entry.id) === String(candidate.recordId)) || null;
};

const characters = ids.map((id) => {
  const character = catalog.characters.find((entry) => String(entry.id) === id);
  if (!character) throw new Error(`Unknown character ID: ${id}`);
  const pendingCandidates = (coverage.modifiers.pendingCandidates || []).filter((candidate) => String(candidate.sourceId) === id).map((candidate) => ({
    ...candidate,
    sourceRecord: sourceRecord(character, candidate)
  }));
  const attacks = generatedAttacks.filter((attack) => String(attack.characterId) === id && pendingAttackIds.has(String(attack.id)));
  return {
    id,
    name: character.name,
    element: character.element,
    path: character.path,
    base: character.base,
    pendingAttacks: attacks.map((attack) => ({
      ...attack,
      patternKey: attackPatternKey(attack),
      establishedPattern: establishedAttackPatterns.has(attackPatternKey(attack)),
      sourceSkill: character.skills?.find((skill) => String(skill.id) === String(attack.sourceSkillId || attack.id)) || null
    })),
    pendingModifierCandidates: pendingCandidates,
    existingOverrides: overrides.filter((attack) => String(attack.characterId) === id),
    existingStructuredModifiers: modifiers.filter((modifier) => ["trace", "eidolon"].includes(modifier.source?.kind) && String(modifier.source.id) === id),
    sourceCounts: {
      skills: character.skills?.length || 0,
      traces: character.traces?.length || 0,
      eidolons: character.eidolons?.length || 0
    }
  };
});

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString().slice(0, 10),
  purpose: "Offline candidate packet for batch classification. It does not infer calculation values and is never loaded by the browser runtime.",
  ids,
  summary: {
    characters: characters.length,
    pendingAttacks: characters.reduce((sum, character) => sum + character.pendingAttacks.length, 0),
    pendingModifierCandidates: characters.reduce((sum, character) => sum + character.pendingModifierCandidates.length, 0),
    existingOverrides: characters.reduce((sum, character) => sum + character.existingOverrides.length, 0),
    existingStructuredModifiers: characters.reduce((sum, character) => sum + character.existingStructuredModifiers.length, 0)
  },
  knownPatternKeys: [...new Set(characters.flatMap((character) => character.pendingAttacks.map((attack) => attack.patternKey)))].sort(),
  newPatternKeys: [...new Set(characters.flatMap((character) => character.pendingAttacks.filter((attack) => !attack.establishedPattern).map((attack) => attack.patternKey)))].sort(),
  attackPatternGroups: Object.fromEntries([...new Set(characters.flatMap((character) => character.pendingAttacks.map((attack) => attack.patternKey)))].sort().map((pattern) => [pattern, characters.flatMap((character) => character.pendingAttacks.filter((attack) => attack.patternKey === pattern).map((attack) => `${character.id}:${attack.id}`))])),
  characters
};

const outputDir = path.join(calcDir, "batches");
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, outputName);
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`HSR batch ${ids.join(", ")}: attacks ${report.summary.pendingAttacks}, modifier candidates ${report.summary.pendingModifierCandidates}`);
console.log(path.relative(root, outputPath));
