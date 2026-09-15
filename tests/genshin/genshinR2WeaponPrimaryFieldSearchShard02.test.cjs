"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const shard = require(path.join(root, "scripts", "genshinR2WeaponPrimaryFieldSearchShard02.cjs"));

function read(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function persistedAudit() {
    return read("games/genshin/data/v2/reviews/r2-weapon-primary-field-search-shard02.json");
}

test("shard selects exactly the next 100 unique numeric candidates", () => {
    const audit = persistedAudit();
    assert.equal(audit.scope.candidateCount, 100);
    assert.equal(audit.scope.expectedCandidateCount, 100);
    assert.equal(audit.scope.sourceNumericCandidateCount, 310);
    assert.equal(audit.scope.entityCount, 56);
    assert.equal(audit.scope.candidateIdDigest, "d247d68d39d9472e1add23e7cf6d4be6e14b31ee76b1dcf314f1a30a63fe4e9b");
    assert.equal(audit.scope.consumerFreeNumericCandidateCount, 309);
    assert.equal(Object.keys(audit.candidates).length, 100);
    assert.equal(audit.summary.primaryNumericMatchCandidates, 100);
    assert.equal(audit.summary.primaryRawVersionValuesEqual, 100);
    assert.equal(audit.summary.officialRawCandidateHits, 0);
    assert.equal(audit.summary.officialRawClaimFieldHits, 0);
    assert.equal(audit.summary.candidatesWithoutIndependentCandidateFieldRecord, 100);
    assert.ok(audit.scope.candidateIds.every((id) => id !== "w_12516_stat_1"));
    assert.ok(Object.values(audit.candidates).every((candidate) => candidate.currentQueue.consumerStatus === "notApplicable"));
});

test("shard does not repeat registered shard01 or legacy weapon decisions", () => {
    const audit = persistedAudit();
    const shard01 = read("games/genshin/data/v2/reviews/r2-weapon-primary-field-search-shard01.json");
    const legacy = read("games/genshin/data/v2/reviews/r2-weapon-deferral-audit.json");
    const ids = new Set(audit.scope.candidateIds);
    const priorShardIds = new Set(shard01.scope.candidateIds);
    const legacyIds = new Set((legacy.decisions || []).map((decision) => String(decision.candidateId)));
    assert.equal([...ids].filter((id) => priorShardIds.has(id)).length, 0);
    assert.equal([...ids].filter((id) => legacyIds.has(id)).length, 0);
});

test("no candidate-specific independent raw record remains explicit", () => {
    const audit = persistedAudit();
    const noHit = Object.values(audit.candidates).filter((candidate) => candidate.officialRawClaims.length === 0);
    assert.equal(noHit.length, 100);
    assert.ok(noHit.every((candidate) => candidate.providerResults.hoyowiki.status === "noCandidateFieldRecord"));
    assert.ok(noHit.every((candidate) => candidate.providerResults.gcsim.status === "outOfScopeNoCandidateRecord"));
});

test("frontier is candidate-scoped and queue remains searchRequired", () => {
    const audit = persistedAudit();
    assert.equal(audit.frontier.id, shard.FRONTIER_ID);
    assert.equal(audit.frontier.policyId, shard.FRONTIER_POLICY_ID);
    assert.equal(audit.frontier.status, "searchExhausted");
    assert.equal(audit.frontier.exhausted, true);
    assert.equal(audit.frontier.scopeMatched, true);
    assert.equal(audit.frontier.candidateScoped, true);
    assert.equal(audit.frontier.g06HoldEligible, true);
    assert.equal(audit.frontier.lastSearchedAt, "2026-08-30");
    assert.deepEqual(audit.frontier.candidateRawHitSummary, {
        hoyowikiCandidates: 0,
        hoyowikiClaimFields: 0,
        candidatesWithoutIndependentCandidateFieldRecord: 100,
        gcsimFiniteLedgerIntersection: 0,
        strictIndependentCandidateFieldBundles: 0
    });
    for (const candidate of Object.values(audit.candidates)) {
        assert.equal(candidate.frontier.status, "searchExhausted");
        assert.equal(candidate.frontier.g06HoldEligible, true);
        assert.equal(candidate.currentQueue.searchFrontier.status, "searchRequired");
        assert.equal(candidate.currentQueue.task.status, "ready");
        assert.equal(candidate.disposition.status, "evidenceDeferred");
    }
});

test("strict, semantic, certificate, and promotion gates remain fail-closed", () => {
    const audit = persistedAudit();
    assert.equal(audit.summary.secondIndependentStrictCandidateCount, 0);
    assert.equal(audit.summary.strictVerified, 0);
    assert.equal(audit.summary.certificateEligible, 0);
    assert.equal(audit.summary.canonicalPromotionEligible, 0);
    assert.equal(audit.gate.canIssueEligibilityCertificate, false);
    assert.equal(audit.gate.canPromoteCanonical, false);
    assert.equal(audit.gate.canSelectSemanticMapping, false);
    for (const candidate of Object.values(audit.candidates)) {
        assert.equal(candidate.primaryComparison.semanticIdentityEstablished, false);
        assert.equal(candidate.primaryComparison.semanticMapping, null);
        assert.deepEqual(candidate.gate, {
            strictVerified: false,
            certificateEligible: false,
            canonicalPromotionEligible: false,
            semanticMappingSelected: false
        });
        for (const field of shard.REQUIRED_CLAIMS) {
            const claim = candidate.claims[field];
            assert.equal(claim.primaryProvider.comparison.semanticIdentityEstablished, false);
            assert.equal(claim.primaryProvider.comparison.semanticMapping, null);
            assert.equal(claim.primaryProvider.comparison.supportsClaimValue, false);
            assert.equal(claim.disposition.certificateEligible, false);
            assert.equal(claim.disposition.canonicalPromotionEligible, false);
        }
    }
});

test("persisted artifact keeps immutable evidence pins after coordination state advances", () => {
    const persisted = persistedAudit();
    // Queue/frontier/coverage files are mutable coordination state and now
    // include this registered shard.  No immutable evidence-pin failure may
    // be hidden by that expected observation drift.
    const validation = shard.validateAudit(persisted, { compareCurrent: false });
    assert.equal(validation.valid, false);
    assert.ok(validation.reasons.length > 0);
    assert.ok(validation.reasons.every((reason) => /^(fileBytesMismatch|fileDigestMismatch):(reports\/genshin-evidence-task-queue\.json|reports\/genshin-candidate-source-coverage-frontier-inventory\.json|games\/genshin\/data\/v2\/source-search-frontiers\.json)$/.test(reason)));
    assert.equal(persisted.fieldDigest, "76f3b3ea1dd00324b4782532b08200ec2450dad4fb8fa3a9159bf7d366845f94");
});

test("tampered semantic mapping, frontier, and input pin are rejected", () => {
    const base = persistedAudit();
    const semantic = clone(base);
    semantic.candidates.w_12431_damageBonus_f365c31c.primaryComparison.semanticMapping = { source: "forged" };
    assert.equal(shard.validateAudit(semantic, { compareCurrent: false }).valid, false);

    const frontier = clone(base);
    frontier.candidates.w_12431_damageBonus_f365c31c.frontier.g06HoldEligible = false;
    assert.equal(shard.validateAudit(frontier, { compareCurrent: false }).valid, false);

    const pin = clone(base);
    pin.inputEvidence.files.comparison.sha256 = "0".repeat(64);
    assert.equal(shard.validateAudit(pin, { compareCurrent: false }).valid, false);

});

test("fresh terminal rebind prepares exactly this shard without writes", () => {
    const result = shard.prepareRegistry();
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
    assert.equal(result.candidateCount, 100);
    assert.equal(result.decisionCount, 100);
    assert.equal(result.writesPerformed, false);
    assert.equal(result.progress.summary.disposed, 100);
    assert.equal(result.progress.summary.evidenceDeferred, 100);
    assert.equal(result.progress.summary.pending, 0);
    assert.ok(result.decisionResults.every((item) => item.valid));
    assert.ok(result.tasks.every((task) => task.primaryBlockReason === "sourceMissing"));
    assert.ok(result.tasks.every((task) => task.deferredLanes.length === 0));
    assert.deepEqual(result.combinedExpectedKpi.expectedAfterBothShards, {
        disposed: 608, evidenceDeferred: 593, pending: 1660, strictVerified: 0
    });
});

test("local shard hold predicate rejects an unsafe task mutation", () => {
    const result = shard.prepareRegistry();
    const task = clone(result.tasks[0]);
    assert.equal(shard.isAllowedWeaponShard02ExternalEvidenceWait(task, {
        scope: { candidateIds: [task.candidateId], candidateIdDigest: result.frontier.candidateIdDigest },
        fieldDigest: task.searchFrontier.auditDigest
    }), true);
    task.consumerStatus = "consumerMissing";
    assert.equal(shard.isAllowedWeaponShard02ExternalEvidenceWait(task, {
        scope: { candidateIds: [task.candidateId], candidateIdDigest: result.frontier.candidateIdDigest },
        fieldDigest: task.searchFrontier.auditDigest
    }), false);
});

test("dedicated schema fixes the shard and keeps draft gate requirements explicit", () => {
    const schema = read("games/genshin/data/schema/r2-weapon-primary-field-search-shard02.schema.json");
    assert.equal(schema.$id, "r2-weapon-primary-field-search-shard02.schema.json");
    assert.equal(schema.properties.kind.const, "genshinR2WeaponPrimaryFieldSearchShard");
    assert.equal(schema.properties.status.const, "draft");
    assert.equal(schema.properties.scope.$ref, "#/$defs/scope");
    assert.equal(schema.$defs.scope.properties.candidateCount.const, 100);
    assert.equal(schema.$defs.frontier.properties.status.const, "searchExhausted");
    assert.equal(schema.$defs.frontier.properties.lastSearchedAt.format, "date");
    assert.equal(schema.$defs.scope.properties.shardId.const, "weapons-primary-numeric-shard02");
    assert.equal(schema.$defs.frontier.properties.id.const, "weapons-primary-numeric-shard02-independent-field-frontier-7.0");
    assert.equal(schema.$defs.gate.properties.strictVerified.const, false);

    const frontierSchema = read("games/genshin/data/schema/source-search-frontiers.schema.json");
    assert.equal(frontierSchema.properties.frontiers.items.properties.sourceAuditDigest.pattern, "^[a-f0-9]{64}$");
    assert.equal(frontierSchema.properties.frontiers.items.properties.auditDigest.pattern, "^[a-f0-9]{64}$");
});
