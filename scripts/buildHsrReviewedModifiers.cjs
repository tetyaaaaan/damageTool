const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "games/hsr/data/catalog.json"), "utf8"));
const specPath = process.argv[2] || "games/hsr/data/calc/modifier-specs-1206-1210.json";
const outputPath = process.argv[3] || "games/hsr/data/calc/modifiers-1206-1210.json";
const specs = JSON.parse(fs.readFileSync(path.join(root, specPath), "utf8"));
const skills = new Map(catalog.characters.flatMap((character) => [...(character.skills || []), ...(character.traces || [])].map((skill) => [String(skill.id), skill])));
const stageByCategory = { statFlat:"baseStats",statPercent:"baseStats",breakEffect:"baseStats",critRate:"critical",critDamage:"critical",damageBonus:"damageBonus",multiplierAddition:"attackMultiplier",resistancePenetration:"resistance",takenDamage:"vulnerability" };

function sourceValues(valueFrom) {
  const skill = skills.get(String(valueFrom.skillId));
  if (!skill) throw new Error(`Unknown skill/trace ${valueFrom.skillId}`);
  return (skill.params || []).map((params) => Math.round(Number(params[valueFrom.paramIndex]) * 1000000) / 10000);
}

function expand(record) {
  const category = record.category || "damageBonus";
  const value = { ...(record.value || { kind:"fixed",fixed:0 }) };
  if (value.valueFrom) { value.values = sourceValues(value.valueFrom); delete value.valueFrom; }
  const included = Boolean(record.includedReason);
  const display = Boolean(record.displayReason || included);
  const activation = record.activation || { mode:"always",conditionText: included ? "対象の小軌跡または星魂を反映済み" : "対象効果を確認" };
  const target = { owner:record.owner || "self",attackTypes:record.attackTypes || ["all"],elements:record.elements || [] };
  if (record.attackIds) target.attackIds = record.attackIds;
  return {
    id:record.id,source:record.source,name:record.name,description:record.description,category,
    ...(record.stat ? { stat:record.stat } : {}),unit:record.unit || "percent",value,target,activation,
    stacking:record.stacking || { group:record.id,rule:"nonStacking" },
    calculation:{ stage:record.stage || stageByCategory[category] || "finalDamage",operation:"add" },
    inputPolicy:included ? "includedInFinalStats" : display ? "manual" : "conditional",
    support:display ? { status:"displayOnly",verified:true,reason:record.includedReason || record.displayReason } : { status:"calculable",verified:true },
    provenance:{sourceName:"Mar-7th/StarRailRes",sourceUrl:"https://github.com/Mar-7th/StarRailRes",sourceFile:record.source.kind === "eidolon" ? "index_new/jp/character_ranks.json" : record.source.traceId && !record.source.skillId ? "index_new/jp/character_skill_trees.json" : "index_new/jp/character_skills.json",gameVersion:"snapshot-2026-07-28",verifiedAt:"2026-08-01",notes:"IDと数値パラメータ位置をレビュー表で固定"}
  };
}

const output = { schemaVersion:1,generatedFrom:specPath.replaceAll("\\","/"),modifiers:specs.records.map(expand) };
fs.writeFileSync(path.join(root, outputPath), `${JSON.stringify(output,null,2)}\n`, "utf8");
console.log(`generated ${output.modifiers.length} modifiers -> ${outputPath}`);
