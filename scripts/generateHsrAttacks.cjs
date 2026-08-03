const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "games", "hsr", "data");
const catalog = JSON.parse(fs.readFileSync(path.join(dataDir, "catalog.json"), "utf8"));
const manifestPath = path.join(dataDir, "attacks.json");
const overridesPath = path.join(dataDir, "attack-overrides.json");
const generatedPath = path.join(dataDir, "attacks.generated.json");

const typeRules = {
  Normal: { type: "normal", traceKey: "normal", order: 10 },
  BPSkill: { type: "skill", traceKey: "skill", order: 20 },
  Ultra: { type: "ultimate", traceKey: "ultimate", order: 30 },
  Talent: { type: "talent", traceKey: "talent", order: 40 },
  MemospriteSkill: { type: "memospriteSkill", traceKey: "talent", order: 50 },
  MemospriteTalent: { type: "memospriteTalent", traceKey: "talent", order: 60 },
  ElationDamage: { type: "elation", traceKey: "skill", order: 70 },
  Assist: { type: "assist", traceKey: "ultimate", order: 80 }
};

function readExistingOverrides() {
  if (fs.existsSync(overridesPath)) return JSON.parse(fs.readFileSync(overridesPath, "utf8")).overrides || [];
  if (!fs.existsSync(manifestPath)) return [];
  const previous = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return previous.schemaVersion === 1 ? previous.attacks || [] : [];
}

function paramIndex(description, type) {
  if (type === "ElationDamage") {
    const match = description.match(/#(\d+)\[[^\]]+\]%分の[^。\n]*愉悦ダメージ/);
    if (match) return { index: Number(match[1]) - 1, scalingStat: "elation" };
  }
  const statPatterns = [
    { stat: "hp", regex: /最大HP(?:の)?#(\d+)\[[^\]]+\]%分の[^。\n]*ダメージ/ },
    { stat: "def", regex: /防御力(?:の)?#(\d+)\[[^\]]+\]%分の[^。\n]*ダメージ/ },
    { stat: "atk", regex: /攻撃力(?:の)?#(\d+)\[[^\]]+\]%分の[^。\n]*ダメージ/ }
  ];
  for (const pattern of statPatterns) {
    const match = description.match(pattern.regex);
    if (match) return { index: Number(match[1]) - 1, scalingStat: pattern.stat };
  }
  return null;
}

function targetOf(description) {
  if (/ランダムな敵|バウンド/.test(description)) return "bounce";
  if (/敵全体/.test(description)) return "aoe";
  if (/隣接する敵|隣接するターゲット/.test(description)) return "blast";
  return "single";
}

function percent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.abs(number) <= 10 ? number * 100 : number;
}

function generateAttack(character, skill) {
  const rule = typeRules[skill.type];
  const description = String(skill.description || "");
  if (!rule || !/ダメージを与え|ダメージを.*与え/.test(description)) return null;
  const source = paramIndex(description, skill.type);
  if (!source || !Array.isArray(skill.params) || !skill.params.length) return null;
  const multipliers = skill.params.map((level) => percent(level?.[source.index]));
  if (multipliers.some((value) => value === null)) return null;
  const hitMatch = description.match(/#(\d+)\[[^\]]+\]回ダメージ/);
  const hitIndex = hitMatch ? Number(hitMatch[1]) - 1 : -1;
  const hitCount = hitIndex >= 0 ? Math.max(1, Math.round(Number(skill.params[0]?.[hitIndex]) || 1)) : 1;
  return {
    id: String(skill.id),
    characterId: String(character.id),
    name: skill.name,
    element: character.element,
    type: rule.type,
    traceKey: rule.traceKey,
    target: targetOf(description),
    scalingStat: source.scalingStat,
    hitCount,
    canCrit: skill.type !== "Talent" || !/持続ダメージ/.test(description),
    multipliers,
    sourceSkillId: String(skill.id),
    displayOrder: rule.order,
    generatedFrom: "catalog.json:characters[].skills",
    calculationScope: "description-primary-term"
  };
}

const generated = catalog.characters.flatMap((character) => character.skills.map((skill) => generateAttack(character, skill)).filter(Boolean));
generated.sort((a, b) => Number(a.characterId) - Number(b.characterId) || a.displayOrder - b.displayOrder || Number(a.id) - Number(b.id));
const overrides = readExistingOverrides().map((attack) => ({ ...attack, overrideReason: attack.overrideReason || "既存の検証済み倍率を優先" }));

fs.writeFileSync(generatedPath, `${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString().slice(0, 10), source: "catalog.json", support: { status: "review", verified: false, reason: "説明文の構造から自動抽出した候補です。個別検証が完了するまでは参考値として扱います。" }, attacks: generated }, null, 2)}\n`);
fs.writeFileSync(overridesPath, `${JSON.stringify({ schemaVersion: 1, description: "自動生成では表現できない攻撃だけをID単位で上書きする。", support: { status: "calculable", verified: true, reason: "ID単位で倍率・対象・参照ステータスを確認した計算データです。" }, overrides }, null, 2)}\n`);
fs.writeFileSync(manifestPath, `${JSON.stringify({
  schemaVersion: 2,
  description: "スタレ攻撃倍率データの読込定義。生成データを正本とし、例外だけを上書きする。",
  generated: "attacks.generated.json",
  overrides: "attack-overrides.json",
  generator: "/scripts/generateHsrAttacks.cjs",
  source: "/games/hsr/data/catalog.json"
}, null, 2)}\n`);

console.log(`generated=${generated.length} overrides=${overrides.length}`);
