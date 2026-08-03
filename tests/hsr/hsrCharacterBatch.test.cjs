const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");

test("the next character batch collects exact pending records without runtime text inference", () => {
  const report = JSON.parse(fs.readFileSync(path.join(root, "games/hsr/data/calc/batches/characters-1206-1210.json"), "utf8"));
  const source = fs.readFileSync(path.join(root, "scripts/buildHsrCharacterBatch.cjs"), "utf8");
  assert.deepEqual(report.ids, ["1206", "1207", "1208", "1209", "1210"]);
  assert.equal(report.summary.characters, 5);
  assert.ok(report.summary.pendingAttacks > 0);
  assert.ok(report.summary.pendingModifierCandidates > 0);
  assert.ok(report.characters.every((character) => Array.isArray(character.pendingAttacks) && Array.isArray(character.pendingModifierCandidates)));
  assert.ok(report.characters.flatMap((character) => character.pendingAttacks).every((attack) => attack.sourceSkill));
  assert.ok(Object.values(report.attackPatternGroups).every((ids) => ids.length > 0));
  assert.match(report.purpose, /does not infer calculation values/);
  assert.doesNotMatch(source, /description\.match|new RegExp|parseFloat\(.*description/);
});
