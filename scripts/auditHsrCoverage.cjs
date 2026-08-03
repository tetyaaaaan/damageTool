const fs = require("node:fs");
const path = require("node:path");
const { loadHsrDataFiles } = require("./lib/hsrDataFiles.cjs");

const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "games", "hsr", "data");
const calcDir = path.join(dataDir, "calc");
const catalog = JSON.parse(fs.readFileSync(path.join(dataDir, "catalog.json"), "utf8"));
const generatedAttacks = JSON.parse(fs.readFileSync(path.join(dataDir, "attacks.generated.json"), "utf8")).attacks || [];
const registeredData = loadHsrDataFiles(root);
const reviewedAttacks = registeredData.attackOverrides;
const specialBreakAttacks = JSON.parse(fs.readFileSync(path.join(calcDir, "special-break-attacks.json"), "utf8")).attacks || [];
const modifiers = registeredData.modifiers;
const damageTerms = /与ダメージ|被ダメージ|会心率|会心ダメージ|攻撃力|防御力|防御無視|耐性|撃破特効|弱点撃破効率|ダメージ倍率|追加ダメージ|付加ダメージ/;
const isCandidate = (text) => damageTerms.test(String(text || ""));
const candidates = [];

for (const character of catalog.characters) {
  for (const skill of character.skills || []) if (isCandidate(skill.description)) candidates.push({ kind: "trace", sourceId: String(character.id), recordId: String(skill.id), sourceName: character.name, recordName: skill.name });
  for (const trace of character.traces || []) if (trace.name && isCandidate(trace.description)) candidates.push({ kind: "traceNode", sourceId: String(character.id), recordId: String(trace.id), sourceName: character.name, recordName: trace.name });
  for (const eidolon of character.eidolons || []) if (isCandidate(eidolon.description)) candidates.push({ kind: "eidolon", sourceId: String(character.id), recordId: `${character.id}:E${eidolon.rank}`, sourceName: character.name, recordName: eidolon.name });
}
for (const cone of catalog.lightCones) if (isCandidate(cone.effect?.description)) candidates.push({ kind: "lightCone", sourceId: String(cone.id), recordId: String(cone.id), sourceName: cone.name, recordName: cone.effect.name });
for (const set of catalog.relicSets) for (const effect of set.effects || []) if (isCandidate(effect.description)) candidates.push({ kind: set.type === "ornament" ? "ornament" : "relic", sourceId: String(set.id), recordId: `${set.id}:${effect.pieces}`, sourceName: set.name, recordName: `${effect.pieces}セット` });

const registeredRecordKeys = new Set();
for (const attack of reviewedAttacks) if (attack.sourceSkillId) registeredRecordKeys.add(`trace:${attack.characterId}:${attack.sourceSkillId}`);
for (const modifier of modifiers) {
  const source = modifier.source || {};
  if (source.kind === "trace") {
    if (source.skillId) registeredRecordKeys.add(`trace:${source.id}:${source.skillId}`);
    if (source.traceId) {
      registeredRecordKeys.add(`trace:${source.id}:${source.traceId}`);
      registeredRecordKeys.add(`traceNode:${source.id}:${source.traceId}`);
    }
  } else if (source.kind === "eidolon") registeredRecordKeys.add(`eidolon:${source.id}:${source.id}:E${source.eidolonRank}`);
  else if (["relic", "ornament"].includes(source.kind)) registeredRecordKeys.add(`${source.kind}:${source.id}:${source.id}:${source.setPieces}`);
  else registeredRecordKeys.add(`${source.kind}:${source.id}:${source.id}`);
}
const candidateKey = (candidate) => `${candidate.kind}:${candidate.sourceId}:${candidate.recordId}`;
const coveredCandidates = candidates.filter((candidate) => registeredRecordKeys.has(candidateKey(candidate)));
const pendingCandidates = candidates.filter((candidate) => !registeredRecordKeys.has(candidateKey(candidate)));
const reviewedAttackIds = new Set(reviewedAttacks.map((attack) => String(attack.id)));
const generatedAttackIds = new Set(generatedAttacks.map((attack) => String(attack.id)));
const reviewedGeneratedAttackIds = new Set([...reviewedAttackIds].filter((id) => generatedAttackIds.has(id)));
const byKind = (items) => items.reduce((result, item) => { result[item.kind] = (result[item.kind] || 0) + 1; return result; }, {});
const report = {
  generatedAt: new Date().toISOString().slice(0, 10),
  definition: "Damage-affecting candidates are detected only for coverage auditing. Runtime calculation never parses descriptions.",
  catalog: {
    characters: catalog.characters.length,
    skills: catalog.characters.reduce((sum, item) => sum + item.skills.length, 0),
    namedTraceNodes: catalog.characters.reduce((sum, item) => sum + item.traces.filter((trace) => trace.name && trace.description).length, 0),
    eidolons: catalog.characters.reduce((sum, item) => sum + item.eidolons.length, 0),
    lightCones: catalog.lightCones.length,
    relicSets: catalog.relicSets.length,
    enemies: catalog.enemies.length
  },
  attacks: {
    generated: generatedAttacks.length,
    reviewed: reviewedGeneratedAttackIds.size,
    additionalReviewed: reviewedAttackIds.size - reviewedGeneratedAttackIds.size,
    specialBreakReviewed: specialBreakAttacks.length,
    pendingReview: generatedAttacks.filter((attack) => !reviewedGeneratedAttackIds.has(String(attack.id))).length,
    pendingIds: generatedAttacks.filter((attack) => !reviewedGeneratedAttackIds.has(String(attack.id))).map((attack) => ({ id: String(attack.id), characterId: String(attack.characterId), name: attack.name }))
  },
  modifiers: {
    registered: modifiers.length,
    calculable: modifiers.filter((modifier) => modifier.support?.status === "calculable").length,
    review: modifiers.filter((modifier) => modifier.support?.status === "review").length,
    displayOnly: modifiers.filter((modifier) => modifier.support?.status === "displayOnly").length,
    candidateRecords: candidates.length,
    candidateRecordsByKind: byKind(candidates),
    sourceCoveredCandidates: coveredCandidates.length,
    pendingCandidateRecords: pendingCandidates.length,
    pendingCandidateRecordsByKind: byKind(pendingCandidates),
    pendingCandidates
  },
  limitations: [
    "Candidate detection is intentionally broad and may include healing, shields, or non-damage utility that shares a stat keyword.",
    "Coverage is matched by exact skill, trace-node, eidolon-rank, light-cone, and set-piece record ID.",
    "The local enemy catalog contains only three verification presets and is not a complete game enemy database."
  ]
};

fs.writeFileSync(path.join(calcDir, "coverage-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  attacks: {
    generated: report.attacks.generated,
    reviewed: report.attacks.reviewed,
    pendingReview: report.attacks.pendingReview
  },
  modifiers: { ...report.modifiers, pendingCandidates: undefined },
  limitations: report.limitations
}, null, 2));
