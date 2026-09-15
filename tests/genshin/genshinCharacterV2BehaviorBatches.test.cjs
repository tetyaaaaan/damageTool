"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { auditBehaviorBatches } = require("../../scripts/genshinCharacterV2BehaviorBatchesAudit.cjs");

const root = path.resolve(__dirname, "../..");

test("behavior batches form a contiguous non-overlapping non-pilot prefix", () => {
    const report = auditBehaviorBatches();
    assert.equal(report.status, "passed", report.errors.join("\n"));
    assert.equal(new Set(report.batchIds).size, report.batchIds.length);
    assert.equal(report.summary.batchCharacters + report.summary.remainingCharacters, report.summary.expansionCharacters);
    assert.equal(report.summary.modifiers, 0);
    assert.equal(report.summary.canonical, 0);
    assert.equal(report.summary.needsReview, report.summary.specs);
    assert.equal(report.summary.runtimeBlocked, report.summary.specs);
});

test("materialized batch index matches the current deterministic audit", () => {
    const indexPath = path.join(root, "games", "genshin", "data", "v2", "characters", "behavior-batches", "index.json");
    const materialized = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    assert.deepEqual(materialized, auditBehaviorBatches());
});
