"use strict";

const crypto = require("node:crypto");
const test = require("node:test");
const assert = require("node:assert/strict");
const { collectCandidates } = require("../../scripts/genshinTerminalStateAudit.cjs");
const {
    buildImpact,
    candidateInventoryDigest,
    validateEntityDiff
} = require("../../scripts/genshinVersionImpact.cjs");

const stableValue = (value) => Array.isArray(value) ? value.map(stableValue)
    : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
        : value;
const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");

test("missing 7.0 target datasets fail closed across unknown candidate coverage", () => {
    const impact = buildImpact();
    assert.equal(impact.status, "transitionEvidenceMissing");
    assert.equal(impact.transition.fromGameVersion, "6.7");
    assert.equal(impact.transition.toGameVersion, "7.0");
    assert.equal(impact.transition.strictTargetDatasetAvailable, false);
    assert.equal(impact.transition.entityDiffAvailable, false);
    assert.equal(impact.transition.state, "awaitingTargetDatasetCoverage");
    assert.equal(impact.transition.targetDatasetEvidence.valid, true);
    assert.equal(impact.transition.targetDatasetEvidence.complete, false);
    assert.equal(impact.transition.targetDatasetEvidence.materializedCandidateCount, 55);
    assert.equal(impact.transition.stages.officialHeadDetected.status, "complete");
    assert.equal(impact.transition.stages.affectedClaimsIdentified.status, "conservativeComplete");
    assert.equal(impact.transition.stages.gateReopened.status, "pending");
    assert.equal(impact.impactMapping.status, "failClosedAllCandidates");
    assert.equal(impact.impactMapping.potentiallyAffectedCandidates, 2268);
    assert.equal(impact.transition.officialChangeIndex.valid, true);
    assert.equal(impact.transition.partialDiscovery.valid, true);
    assert.equal(impact.transition.partialDiscovery.candidateCount, 55);
    assert.equal(impact.transition.partialDiscovery.gateEligible, false);
    assert.ok(impact.transition.stages.entityDiff.validationReasons.includes("fieldDigestInvalid"));
    assert.deepEqual(impact.transition.officialChangeIndex.affectedEntityIds, ["10000022", "10000039", "10000058", "10000071"]);
    assert.equal(impact.impactMapping.knownChangedCandidateIds.length, 55);
    assert.ok(impact.impactMapping.knownChangedCandidateIds.includes("w_12516_reaction_bonus_2"));
    assert.ok(impact.impactMapping.knownChangedCandidateIds.includes("behavior:10000022:constellation:constellation-6"));
    assert.ok(impact.impactMapping.knownChangedCandidateIds.includes("behavior:10000039:talent:skill"));
    assert.equal(impact.invalidation.automaticPromotionAllowed, false);
    assert.equal(impact.productionGate.scope, "versionBoundCanonicalOverlayOnly");
    assert.equal(impact.productionGate.canonicalOverlayActive, false);
    assert.equal(impact.productionGate.legacyCalculationActive, true);
    assert.equal(impact.productionGate.historicalCanonical.status, "historicalVerifiedPendingRevalidation");
    assert.equal(impact.productionGate.historicalCanonical.retainedIds.length, 2);
});

test("entity diff cannot open from descriptive booleans or incomplete arrays", () => {
    const candidates = collectCandidates();
    const weak = {
        kind: "genshinVersionEntityDiff",
        fromGameVersion: "6.7",
        toGameVersion: "7.0",
        changedEntities: [],
        unchangedEntities: []
    };
    const weakResult = validateEntityDiff(weak, {
        fromGameVersion: "6.7",
        toGameVersion: "7.0",
        candidates
    });
    assert.equal(weakResult.valid, false);
    assert.ok(weakResult.reasons.includes("fieldDigestInvalid"));
    assert.ok(weakResult.reasons.includes("candidateCoverageIncomplete"));

    const candidateIds = candidates.map((entry) => entry.id).sort();
    const snapshot = (gameVersion, marker) => ({
        gameVersion,
        provider: "provider-a",
        sourceFamily: "family-a",
        repository: "https://example.invalid/provider-a",
        revision: `revision-${marker}`,
        rawArtifactDigest: marker.repeat(64),
        datasetDigest: marker.repeat(64),
        gameVersionBinding: {
            status: "strictlyBound",
            gameVersion,
            evidenceLocator: `manifest-${gameVersion}.json`,
            evidenceDigest: marker.repeat(64)
        }
    });
    const claim = {
        fromGameVersion: "6.7",
        toGameVersion: "7.0",
        sourceSnapshots: [snapshot("6.7", "a"), snapshot("7.0", "b")],
        coverage: {
            status: "complete",
            candidateInventoryDigest: candidateInventoryDigest(candidates),
            candidateCount: candidateIds.length,
            changedCandidateIds: [],
            unchangedCandidateIds: candidateIds,
            unmappedCandidateIds: []
        }
    };
    const strict = {
        schemaVersion: 1,
        kind: "genshinVersionEntityDiff",
        claim,
        fieldDigestAlgorithm: "sha256-stable-json-v1",
        fieldDigest: digest(claim)
    };
    assert.deepEqual(validateEntityDiff(strict, {
        fromGameVersion: "6.7",
        toGameVersion: "7.0",
        candidates
    }).reasons, []);
});
