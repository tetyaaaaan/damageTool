"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

process.argv.push("--shard=02");
const capture = require("../../scripts/genshinVersionTransitionWeaponEntityCapture.cjs");

test("weapon shard02 snapshot binds 55 entities and the exact queue shard", () => {
    assert.equal(capture.selectedShard, "02");
    assert.equal(capture.entities.length, 55);
    assert.equal(fs.existsSync(capture.outputPath), true);
    const snapshot = capture.buildSnapshot();
    assert.equal(snapshot.claim.queueShard.shardId, "weapons:weaponEffectSpec:sourceMissing:standard:02");
    assert.equal(snapshot.claim.records.length, 55);
    assert.equal(snapshot.summary.queueCandidates, 100);
    assert.equal(snapshot.summary.candidateEligibleClaims, 0);
    assert.equal(snapshot.gateEligibility.canPromoteCanonical, false);
});

test("weapon shard02 retains the 12516 scope transition as raw evidence only", () => {
    const snapshot = capture.buildSnapshot();
    const changed = snapshot.claim.records.filter((record) => record.comparison.changedFieldCount > 0);
    assert.deepEqual(changed.map((record) => record.entityId), ["12516"]);
    assert.equal(changed[0].comparison.changedFieldCount, 6);
    assert.equal(changed[0].comparison.fieldDiffs.some((diff) => diff.jsonPointer === "/effectTemplateRaw"), true);
    assert.equal(changed[0].comparison.fieldDiffs.filter((diff) => /^\/r[1-5]\/description$/.test(diff.jsonPointer)).length, 5);
});

test("weapon shard02 checked-in snapshot is deterministic", () => {
    const checkedIn = JSON.parse(fs.readFileSync(capture.outputPath, "utf8"));
    assert.deepEqual(capture.buildSnapshot(), checkedIn);
});
