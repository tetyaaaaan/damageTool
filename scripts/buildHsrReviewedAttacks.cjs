const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "games/hsr/data/catalog.json"), "utf8"));
const specPath = process.argv[2] || "games/hsr/data/calc/attack-specs-1206-1210.json";
const outputPath = process.argv[3] || "games/hsr/data/calc/attacks-1206-1210.json";
const specs = JSON.parse(fs.readFileSync(path.join(root, specPath), "utf8"));
const skills = new Map(catalog.characters.flatMap((character) => [...(character.skills || []), ...(character.traces || [])].map((skill) => [String(skill.id), skill])));

function values(skillId, paramIndex) {
  const skill = skills.get(String(skillId));
  if (!skill) throw new Error(`Unknown skill/trace ${skillId}`);
  return (skill.params || []).map((params) => {
    const value = Number(params[paramIndex]);
    if (!Number.isFinite(value)) throw new Error(`Missing param ${skillId}[${paramIndex}]`);
    return Math.round(value * 1000000) / 10000;
  });
}

function productValues(factors) {
  const lists = factors.map((factor) => values(factor.skillId, factor.paramIndex));
  const length = Math.max(...lists.map((list) => list.length));
  return Array.from({ length }, (_, index) => {
    const product = lists.reduce((result, list) => result * list[Math.min(index, list.length - 1)] / 100, 100);
    return Math.round(product * 10000) / 10000;
  });
}

const overrides = specs.attacks.map((spec) => {
  const { paramIndex, adjacentParamIndex, hitCountParamIndex, factors, multiplierAdditionScale, constantMultiplier, ...attack } = spec;
  const multipliers = factors ? productValues(factors) : paramIndex !== undefined ? values(spec.sourceSkillId, paramIndex) : [Number(constantMultiplier || 0)];
  const result = { ...attack, hitCount: spec.hitCount || 1, multipliers };
  if (adjacentParamIndex !== undefined) result.adjacentMultipliers = values(spec.sourceSkillId, adjacentParamIndex);
  if (hitCountParamIndex !== undefined) {
    const skill = skills.get(String(spec.sourceSkillId));
    result.hitCount = Number(skill.params?.[0]?.[hitCountParamIndex] || 1);
  }
  if (multiplierAdditionScale) result.multiplierAdditionScaleValues = values(multiplierAdditionScale.skillId, multiplierAdditionScale.paramIndex).map((value) => value / 100);
  result.overrideReason = "レビュー表のスキルID・パラメータ位置から生成。説明文解析は実行時に使用しない。";
  return result;
});

const output = {
  schemaVersion: 1,
  generatedFrom: specPath.replaceAll("\\", "/"),
  support: { status: "calculable", verified: true, reason: "レビュー済みのID・パラメータ位置から生成した攻撃データです。" },
  overrides
};
fs.writeFileSync(path.join(root, outputPath), `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`generated ${overrides.length} attacks -> ${outputPath}`);
