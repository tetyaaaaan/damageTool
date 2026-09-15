"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildClaimQueue, defaultOutput } = require("../../scripts/genshinVersionTransitionClaimQueue.cjs");

test("7.0 transition claim queue expands only existing candidate claim schemas", () => {
    const queue = buildClaimQueue();
    assert.equal(queue.summary.candidates, 55);
    assert.equal(queue.summary.eligibleClaims, 0);
    assert.equal(queue.gateEligibility.canIssueEligibilityCertificate, false);
    assert.equal(queue.gateEligibility.canPromoteCanonical, false);
    assert.ok(queue.summary.claimPackets > 300);
    assert.ok(queue.summary.claimSchemaMissingCandidates > 0);
    const venti = queue.claim.packets.find((packet) => packet.candidateId === "behavior:10000022:constellation:constellation-6");
    assert.equal(venti.transitionLane, "exactCandidateMapped");
    assert.deepEqual(venti.claimPackets.map((claim) => claim.claimName).sort(), ["energy", "execution", "lifecycle", "runtime", "snapshot", "sourceText", "timing"]);
    assert.equal(venti.providerCaptureStatus, "targetDisplayRecordCapturedNoMechanicFieldEvidence");
    const yae = queue.claim.packets.find((packet) => packet.candidateId === "behavior:10000058:talent:passives-passive-1");
    assert.equal(yae.claimSchemaStatus, "missing");
    assert.deepEqual(yae.claimPackets, []);
    const weapon = queue.claim.packets.find((packet) => packet.candidateId === "w_12516_reaction_bonus_2");
    assert.equal(weapon.providerCaptureStatus, "targetFieldEvidenceCapturedSingleFamily");
});

test("checked-in 7.0 transition claim queue is deterministic", () => {
    const generated = buildClaimQueue();
    const checkedIn = JSON.parse(fs.readFileSync(path.resolve(defaultOutput), "utf8"));
    assert.deepEqual(checkedIn, generated);
});
