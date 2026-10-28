const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { data, issues, validateModifiers } = require("../../scripts/validateHsrModifiers.cjs");

const schemaPath = path.resolve(__dirname, "../../games/hsr/data/calc/modifier-contract.schema.json");
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));

test("HSR production modifiers satisfy the strict registration contract", () => {
  assert.deepEqual(issues, []);
  assert.ok(data.modifiers.length > 0);
  assert.ok(schema.properties.stacking.properties.rule.enum.includes("max"));
  assert.ok(!schema.properties.stacking.properties.rule.enum.includes("multiply"));
});

test("validator rejects unsupported stacking and unknown registration keys", () => {
  const base = structuredClone(data.modifiers[0]);
  const multiply = structuredClone(base);
  multiply.stacking = { group: "bad", rule: "multiply" };
  assert.ok(validateModifiers([multiply]).some((issue) => issue.includes("stacking.rule multiply is unsupported")));

  const unknown = structuredClone(base);
  unknown.runtimeGuess = true;
  assert.ok(validateModifiers([unknown]).some((issue) => issue.includes("unknown field runtimeGuess")));

  const badSource = structuredClone(base);
  badSource.source.unreviewedOwner = "x";
  assert.ok(validateModifiers([badSource]).some((issue) => issue.includes("source: unknown field unreviewedOwner")));
});

test("supported static metadata values remain accepted without inferred dispatch rules", () => {
  const records = data.modifiers.filter((modifier) => ["set", "subtract"].includes(modifier.calculation.operation));
  assert.ok(records.length > 0);
  assert.deepEqual(validateModifiers(records), []);
});
