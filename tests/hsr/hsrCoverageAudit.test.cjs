const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const report = JSON.parse(fs.readFileSync(path.join(root, "games/hsr/data/calc/coverage-report.json"), "utf8"));

test("HSR coverage audit identifies remaining attacks and modifier candidates instead of treating representatives as complete", () => {
  assert.equal(report.attacks.generated, 344);
  assert.equal(report.attacks.reviewed, 124);
  assert.equal(report.attacks.additionalReviewed, 94);
  assert.equal(report.attacks.specialBreakReviewed, 2);
  assert.equal(report.attacks.pendingReview, 220);
  assert.equal(report.attacks.pendingIds.length, report.attacks.pendingReview);
  assert.equal(report.modifiers.registered, 566);
  assert.equal(report.modifiers.calculable, 218);
  assert.equal(report.modifiers.displayOnly, 348);
  assert.equal(report.modifiers.review, 0);
  assert.ok(report.modifiers.pendingCandidateRecords > 0);
  assert.equal(report.modifiers.pendingCandidates.length, report.modifiers.pendingCandidateRecords);
});

test("coverage parsing is confined to the offline audit and not the HSR browser runtime", () => {
  const app = fs.readFileSync(path.join(root, "games/js/hsrApp.js"), "utf8");
  const runtime = fs.readFileSync(path.join(root, "games/js/hsrModifierRuntime.js"), "utf8");
  assert.doesNotMatch(app, /CONDITION_EFFECT_PATTERNS|parsedSourceConditions/);
  assert.doesNotMatch(runtime, /description\.match|new RegExp/);
  assert.match(report.definition, /Runtime calculation never parses descriptions/);
});
