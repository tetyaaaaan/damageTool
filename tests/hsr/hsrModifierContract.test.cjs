const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadHsrDataFiles } = require("../../scripts/lib/hsrDataFiles.cjs");

const root = path.resolve(__dirname, "../..");
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const registeredData = loadHsrDataFiles(root);
const data = { modifiers: registeredData.modifiers };

test("HSR structured modifiers have stable source, condition, calculation and provenance contracts", () => {
  const ids = new Set();
  assert.ok(data.modifiers.length >= 55);
  for (const modifier of data.modifiers) {
    assert.ok(modifier.id && !ids.has(modifier.id));
    ids.add(modifier.id);
    assert.ok(modifier.source.kind && modifier.source.id);
    assert.ok(modifier.activation.mode && modifier.activation.conditionText !== undefined);
    assert.ok(modifier.calculation.stage && modifier.calculation.operation);
    assert.ok(["calculable", "displayOnly", "review"].includes(modifier.support.status));
    assert.match(modifier.provenance.verifiedAt, /^\d{4}-\d{2}-\d{2}$/);
    if (modifier.support.status === "calculable") assert.equal(modifier.support.verified, true);
  }
});

test("representative HSR modifiers cover source types, conditions and attack scoping", () => {
  const calculable = data.modifiers.filter((modifier) => modifier.support.status === "calculable");
  const sourceKinds = new Set(calculable.map((modifier) => modifier.source.kind));
  const modes = new Set(calculable.map((modifier) => modifier.activation.mode));
  const categories = new Set(calculable.map((modifier) => modifier.category));
  assert.deepEqual([...sourceKinds].sort(), ["eidolon", "lightCone", "ornament", "relic", "trace"]);
  for (const mode of ["toggle", "stack", "statThreshold", "numericThreshold"]) assert.ok(modes.has(mode));
  for (const category of ["damageBonus", "defenseReduction", "resistancePenetration", "takenDamage"]) assert.ok(categories.has(category));
  assert.ok(data.modifiers.some((modifier) => modifier.category === "statPercent" && modifier.support.status === "calculable"));
  assert.equal(data.modifiers.filter((modifier) => modifier.support.status === "review").length, 0);
  assert.ok(calculable.some((modifier) => modifier.target.attackTypes.includes("dot")));
  assert.ok(calculable.some((modifier) => modifier.target.attackTypes.includes("ultimate") && modifier.target.attackTypes.includes("followUp")));
});

test("persistent final-stat modifiers stay display-only and no unresolved structured effects remain", () => {
  const persistent = data.modifiers.filter((modifier) => modifier.inputPolicy === "includedInFinalStats");
  assert.ok(persistent.length);
  assert.ok(persistent.every((modifier) => modifier.support.status === "displayOnly"));
  const unresolved = data.modifiers.filter((modifier) => modifier.support.status === "review");
  assert.equal(unresolved.length, 0);
});

test("HSR production modifier data does not encode calculation values by parsing descriptions", () => {
  const source = registeredData.modifierSources.map((entry) => JSON.stringify(entry.records)).join("\n");
  assert.doesNotMatch(source, /regex|RegExp|description-primary-term/);
  for (const modifier of data.modifiers) {
    assert.ok(modifier.value.kind);
    assert.ok(modifier.unit);
    assert.ok(modifier.target.owner);
  }
});
