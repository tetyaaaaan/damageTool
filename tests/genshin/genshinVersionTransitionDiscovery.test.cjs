"use strict";

const fs = require("node:fs");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
    buildDiscovery,
    defaultOutput
} = require("../../scripts/genshinVersionTransitionDiscovery.cjs");
const { validatePartialDiscovery } = require("../../scripts/genshinVersionEvidenceValidation.cjs");
const { collectCandidates } = require("../../scripts/genshinTerminalStateAudit.cjs");

test("7.0 partial discovery separates exact, structural, conservative, and reaction lanes without opening gates", () => {
    const discovery = buildDiscovery();
    assert.equal(discovery.summary.candidates, 55);
    assert.deepEqual(discovery.summary.byMappingStatus, {
        conservativeEntityInvalidation: 45,
        exactCandidateMapped: 2,
        structuralScopeCandidate: 7,
        reactionConsumerTransition: 1
    });
    assert.equal(discovery.gateEligibility.canSatisfyEntityDiff, false);
    assert.equal(discovery.gateEligibility.canIssueEligibilityCertificate, false);
    assert.equal(discovery.gateEligibility.canPromoteCanonical, false);
    assert.equal(discovery.completeness.targetDataset, "partial");
    const venti = discovery.claim.candidateMappings
        .find((item) => item.candidateId === "behavior:10000022:constellation:constellation-6");
    const reaction = discovery.claim.candidateMappings
        .find((item) => item.candidateId === "w_12516_reaction_bonus_2");
    assert.equal(venti.mappingStatus, "exactCandidateMapped");
    assert.equal(reaction.mappingStatus, "reactionConsumerTransition");
    assert.equal(validatePartialDiscovery(discovery, {
        fromGameVersion: "6.7",
        toGameVersion: "7.0",
        candidateIds: collectCandidates().map((entry) => entry.id)
    }).valid, true);
});

test("materialized partial discovery is deterministic and current", () => {
    const materialized = JSON.parse(fs.readFileSync(defaultOutput, "utf8"));
    assert.deepEqual(materialized, buildDiscovery());
});
