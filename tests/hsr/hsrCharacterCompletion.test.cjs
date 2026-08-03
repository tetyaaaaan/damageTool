const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));

test("character completion report separates complete, provisional, and incomplete work", () => {
  const report = readJson("games/hsr/data/calc/character-coverage-report.json");
  assert.equal(report.summary.complete, 26);
  assert.equal(report.summary.provisional, 4);
  assert.equal(report.summary.incomplete, 65);
  assert.equal(report.summary.catalogCharacters, 95);
  assert.equal(report.summary.uiConnectedModifiers, 487);
  assert.equal(report.summary.calculationConnectedModifiers, 196);
  assert.equal(report.summary.goldenTestCharacters, 26);
  assert.deepEqual(report.errors, []);
  assert.equal(report.characters.find((character) => character.id === "1205").status, "complete");
});

test("the character audit keeps human completion gates separate from generated counts", () => {
  const manifest = readJson("games/hsr/data/calc/character-completion.json");
  const source = fs.readFileSync(path.join(root, "scripts/auditHsrCharacterCompletion.cjs"), "utf8");
  assert.match(manifest.definition, /PC\/スマホブラウザ確認/);
  assert.match(source, /browserVerified: complete\.has\(id\)/);
  assert.match(source, /pendingModifierCandidates/);
  assert.doesNotMatch(source, /status = .*reviewedAttacks/);
});
