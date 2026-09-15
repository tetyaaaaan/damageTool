"use strict";

const fs = require("node:fs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildEvidence, outputPath } = require("../../scripts/genshinVersionTransitionTargetAcquire.cjs");

test("materialized genshin-db 7.0 evidence binds raw bytes but remains partial and correlated", () => {
    const evidence = buildEvidence();
    assert.equal(evidence.claim.gameVersion, "7.0");
    assert.equal(evidence.claim.versionBinding.status, "strictlyBound");
    assert.equal(evidence.claim.lineage.status, "correlated");
    assert.deepEqual(evidence.claim.candidateClaims[0].fields.targets, ["stellarConduct", "stellarSwirl"]);
    assert.deepEqual(evidence.claim.candidateClaims[0].fields.refinements.map((item) => item.reactionDamageBonus), [0.16, 0.2, 0.24, 0.28, 0.32]);
    assert.equal(evidence.claim.coverage.canSatisfyStrictTargetDataset, false);
    assert.equal(evidence.claim.coverage.canSatisfyCompleteEntityDiff, false);
    assert.equal(evidence.claim.coverage.materializedCandidateCount, 55);
    assert.equal(evidence.claim.coverage.fieldComparableCandidateCount, 1);
    assert.equal(evidence.claim.affectedEntitySnapshot.changedRecordCount, 0);
});

test("checked-in target dataset evidence is deterministic", () => {
    assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, "utf8")), buildEvidence());
});
