"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const shard = require(path.join(root, "scripts", "genshinR2WeaponPrimaryFieldSearchShard01.cjs"));
const work = require(path.join(root, "scripts", "genshinWorkDisposition.cjs"));

function read(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

let prepared;
function preparedRegistry() {
    if (!prepared) prepared = shard.prepareRegistry();
    return prepared;
}

function persistedAudit() {
    return read("games/genshin/data/v2/reviews/r2-weapon-primary-field-search-shard01.json");
}

test("shard selects exactly the first 100 unique numeric candidates", () => {
    const audit = persistedAudit();
    assert.equal(audit.scope.candidateCount, 100);
    assert.equal(audit.scope.expectedCandidateCount, 100);
    assert.equal(audit.scope.sourceNumericCandidateCount, 310);
    assert.equal(audit.scope.entityCount, 59);
    assert.equal(audit.scope.candidateIdDigest, "829758b116455828f3009fd1dcd7e9dacbe59ab7a716d2ad92eda7b09252a146");
    assert.equal(Object.keys(audit.candidates).length, 100);
    assert.equal(audit.summary.primaryNumericMatchCandidates, 100);
    assert.equal(audit.summary.primaryRawVersionValuesEqual, 100);
    assert.equal(audit.summary.officialRawCandidateHits, 3);
    assert.equal(audit.summary.officialRawClaimFieldHits, 12);
    assert.equal(audit.summary.candidatesWithoutIndependentCandidateFieldRecord, 97);
});

test("official raw hits remain unbound and no-hit candidates remain explicit", () => {
    const audit = persistedAudit();
    const officialIds = [
        "w_11301_damage_1",
        "w_11301_damageBonus_91cc873a",
        "w_11302_crit_1"
    ];
    for (const id of officialIds) {
        const candidate = audit.candidates[id];
        assert.equal(candidate.officialRawClaims.length, 4);
        assert.equal(candidate.providerResults.hoyowiki.strictTargetVersionBinding, false);
        assert.equal(candidate.providerResults.hoyowiki.status, "rawFieldAvailableTargetVersionUnbound");
        for (const claim of Object.values(candidate.claims)) {
            assert.equal(claim.officialIndependentProvider.strictGameVersionBinding, false);
            assert.equal(claim.officialIndependentProvider.semanticMapping, null);
            assert.equal(claim.officialIndependentProvider.supportsClaimValue, false);
        }
    }
    const noHit = Object.values(audit.candidates).filter((candidate) => candidate.officialRawClaims.length === 0);
    assert.equal(noHit.length, 97);
    assert.ok(noHit.every((candidate) => candidate.providerResults.hoyowiki.status === "noCandidateFieldRecord"));
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
        hoyowikiCandidates: 3,
        hoyowikiClaimFields: 12,
        candidatesWithoutIndependentCandidateFieldRecord: 97,
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

test("persisted artifact is deterministic and validates current evidence pins", () => {
    const persisted = read("games/genshin/data/v2/reviews/r2-weapon-primary-field-search-shard01.json");
    assert.deepEqual(shard.validateAudit(persisted, { compareCurrent: false }), { valid: false, reasons: [
        "fileBytesMismatch:reports/genshin-evidence-task-queue.json",
        "fileDigestMismatch:reports/genshin-evidence-task-queue.json",
        "fileBytesMismatch:reports/genshin-candidate-source-coverage-frontier-inventory.json",
        "fileDigestMismatch:reports/genshin-candidate-source-coverage-frontier-inventory.json",
        "fileBytesMismatch:games/genshin/data/v2/source-search-frontiers.json",
        "fileDigestMismatch:games/genshin/data/v2/source-search-frontiers.json"
    ] });
    assert.equal(persisted.fieldDigest, "21b99b37ef406aabc154aa507095addaca32694b10638fca658b86c3e5d97c6f");
});

test("tampered semantic mapping, frontier, input pin, and official raw pin are rejected", () => {
    const base = persistedAudit();
    const semantic = clone(base);
    semantic.candidates.w_11301_damage_1.primaryComparison.semanticMapping = { source: "forged" };
    assert.equal(shard.validateAudit(semantic, { compareCurrent: false }).valid, false);

    const frontier = clone(base);
    frontier.candidates.w_11301_damage_1.frontier.g06HoldEligible = false;
    assert.equal(shard.validateAudit(frontier, { compareCurrent: false }).valid, false);

    const pin = clone(base);
    pin.inputEvidence.files.comparison.sha256 = "0".repeat(64);
    assert.equal(shard.validateAudit(pin, { compareCurrent: false }).valid, false);

    const officialPin = clone(base);
    officialPin.candidates.w_11301_damage_1.officialRawClaims[0].rawLocator.sha256 = "0".repeat(64);
    assert.equal(shard.validateAudit(officialPin, { compareCurrent: false }).valid, false);
});

test("dedicated schema fixes the shard and keeps draft gate requirements explicit", () => {
    const schema = read("games/genshin/data/schema/r2-weapon-primary-field-search-shard01.schema.json");
    assert.equal(schema.$id, "r2-weapon-primary-field-search-shard01.schema.json");
    assert.equal(schema.properties.kind.const, "genshinR2WeaponPrimaryFieldSearchShard");
    assert.equal(schema.properties.status.const, "draft");
    assert.equal(schema.properties.scope.$ref, "#/$defs/scope");
    assert.equal(schema.$defs.scope.properties.candidateCount.const, 100);
    assert.equal(schema.$defs.frontier.properties.status.const, "searchExhausted");
    assert.equal(schema.$defs.frontier.properties.lastSearchedAt.format, "date");
    assert.equal(schema.$defs.gate.properties.strictVerified.const, false);

    const frontierSchema = read("games/genshin/data/schema/source-search-frontiers.schema.json");
    assert.equal(frontierSchema.properties.frontiers.items.properties.sourceAuditDigest.pattern, "^[a-f0-9]{64}$");
    assert.equal(frontierSchema.properties.frontiers.items.properties.auditDigest.pattern, "^[a-f0-9]{64}$");
});

test("fresh terminal/queue rebind prepares exactly 100 weapon decisions without writes", () => {
    const result = preparedRegistry();
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
    assert.ok(result.tasks.every((task) => !Object.hasOwn(task, "weaponPrimaryFieldShard")));
    assert.deepEqual(result.combinedExpectedKpi.expectedAfterBothShards, {
        disposed: 408, evidenceDeferred: 393, pending: 1860, strictVerified: 0
    });
    assert.equal(result.combinedExpectedKpi.baseMatchesExpected, true);
    for (const [index, decision] of result.decisions.entries()) {
        assert.equal(decision.queueTaskDigest, work.taskDigest(result.tasks[index]));
        assert.equal(result.tasks[index].searchFrontier.frontierId, shard.FRONTIER_ID);
        assert.equal(result.tasks[index].searchFrontier.candidateIdDigest, result.frontier.candidateIdDigest);
        assert.equal(result.tasks[index].searchFrontier.auditDigest, result.frontier.auditDigest);
    }
});

test("weapon hold predicate is exact and cannot absorb wider or unsafe work", () => {
    const result = preparedRegistry();
    assert.equal(work.isAllowedWeaponShard01ExternalEvidenceWait(result.tasks[0]), true);
    const mutations = [
        (task) => { task.searchFrontier.auditDigest = "0".repeat(64); },
        (task) => { task.searchFrontier.frontierId = "other-frontier"; },
        (task) => { task.searchFrontier.candidateIdDigest = "0".repeat(64); },
        (task) => { task.consumerStatus = "consumerMissing"; },
        (task) => { task.identityConsistency = { status: "ambiguous", blocked: true }; },
        (task) => { task.fieldComparison.hasMismatch = true; },
        (task) => { task.deferredLanes.push({ kind: "consumer", status: "pending" }); },
        (task) => { task.blockReasons.push("sourceDiscrepancy"); }
    ];
    for (const mutate of mutations) {
        const task = clone(result.tasks[0]);
        mutate(task);
        assert.equal(work.isAllowedWeaponShard01ExternalEvidenceWait(task), false);
    }
});
