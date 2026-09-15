"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const shard = require(path.join(root, "scripts", "genshinR2WeaponPrimaryFieldSearchShard03.cjs"));

function read(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function persistedAudit() {
    return read("games/genshin/data/v2/reviews/r2-weapon-primary-field-search-shard03.json");
}

test("shard selects exactly the next 100 numeric candidates after shards 01 and 02", () => {
    const audit = persistedAudit();
    assert.equal(audit.scope.shardId, "weapons-primary-numeric-shard03");
    assert.equal(audit.scope.candidateCount, 100);
    assert.equal(audit.scope.expectedCandidateCount, 100);
    assert.equal(audit.scope.sourceNumericCandidateCount, 310);
    assert.equal(audit.scope.consumerFreeNumericCandidateCount, 309);
    assert.equal(audit.scope.candidateIdDigest, "eb45ad124d38610a7a468e7e895d19a6e47bb387d46316c060f004b1c6d391b1");
    assert.equal(audit.scope.candidateIds[0], "w_14414_damageBonus_7575ce9b");
    assert.equal(audit.scope.candidateIds.at(-1), "w_15507_damage_1");
    assert.equal(Object.keys(audit.candidates).length, 100);
    assert.ok(audit.scope.candidateIds.every((id) => id !== "w_12516_stat_1"));
});

test("shard does not repeat prior shard or legacy decisions", () => {
    const audit = persistedAudit();
    const shard01 = read("games/genshin/data/v2/reviews/r2-weapon-primary-field-search-shard01.json");
    const shard02 = read("games/genshin/data/v2/reviews/r2-weapon-primary-field-search-shard02.json");
    const legacy = read("games/genshin/data/v2/reviews/r2-weapon-deferral-audit.json");
    const ids = new Set(audit.scope.candidateIds);
    for (const prior of [shard01.scope.candidateIds, shard02.scope.candidateIds, (legacy.decisions || []).map((item) => String(item.candidateId))]) {
        assert.equal([...ids].filter((id) => prior.includes(id)).length, 0);
    }
});

test("existing raw comparison pins are numeric observations only", () => {
    const audit = persistedAudit();
    assert.equal(audit.summary.primaryNumericMatchCandidates, 100);
    assert.equal(audit.summary.primaryRawVersionValuesEqual, 100);
    assert.equal(audit.summary.officialRawCandidateHits, 0);
    assert.equal(audit.summary.secondIndependentStrictCandidateCount, 0);
    assert.equal(audit.summary.strictVerified, 0);
    assert.equal(audit.summary.certificateEligible, 0);
    assert.equal(audit.summary.canonicalPromotionEligible, 0);
    for (const candidate of Object.values(audit.candidates)) {
        assert.equal(candidate.primaryComparison.status, "numericAgreementOnlyNotSemanticIdentity");
        assert.equal(candidate.primaryComparison.semanticIdentityEstablished, false);
        assert.equal(candidate.primaryComparison.semanticMapping, null);
        assert.equal(candidate.disposition.status, "evidenceDeferred");
        assert.equal(candidate.gate.strictVerified, false);
        assert.equal(candidate.gate.certificateEligible, false);
        assert.equal(candidate.gate.canonicalPromotionEligible, false);
        for (const claim of Object.values(candidate.claims)) {
            assert.equal(claim.disposition.semanticInference, "forbidden");
            assert.equal(claim.disposition.certificateEligible, false);
            assert.equal(claim.disposition.canonicalPromotionEligible, false);
        }
    }
});

test("frontier is candidate-scoped, finite, and explicitly reopenable", () => {
    const audit = persistedAudit();
    assert.equal(audit.frontier.id, shard.FRONTIER_ID);
    assert.equal(audit.frontier.policyId, shard.FRONTIER_POLICY_ID);
    assert.equal(audit.frontier.status, "searchExhausted");
    assert.equal(audit.frontier.exhausted, true);
    assert.equal(audit.frontier.scopeMatched, true);
    assert.equal(audit.frontier.candidateScoped, true);
    assert.equal(audit.frontier.g06HoldEligible, true);
    assert.equal(audit.frontier.lastSearchedAt, "2026-08-30");
    assert.match(audit.frontier.searchScope, /ranked 201-300/);
    assert.match(audit.frontier.reopenTrigger, /immutable manifest/);
    assert.equal(audit.gate.canIssueEligibilityCertificate, false);
    assert.equal(audit.gate.canPromoteCanonical, false);
    assert.equal(audit.gate.canSelectSemanticMapping, false);
});

test("persisted shard validates against immutable evidence pins", () => {
    const audit = persistedAudit();
    const validation = shard.validateAudit(audit, { compareCurrent: false });
    assert.equal(validation.valid, false);
    assert.ok(validation.reasons.length > 0);
    assert.ok(validation.reasons.every((reason) => /^(fileBytesMismatch|fileDigestMismatch):(reports\/genshin-evidence-task-queue\.json|reports\/genshin-candidate-source-coverage-frontier-inventory\.json|games\/genshin\/data\/v2\/source-search-frontiers\.json)$/.test(reason)));
    assert.equal(audit.fieldDigest, "5f81c2deefcfa845764caa056ccea5d3aa691f444931099dfcf511103b1301ca");
});

test("tampered semantic identity or frontier scope remains fail-closed", () => {
    const base = persistedAudit();
    const semantic = clone(base);
    semantic.candidates[base.scope.candidateIds[0]].primaryComparison.semanticMapping = { source: "forged" };
    assert.equal(shard.validateAudit(semantic, { compareCurrent: false }).valid, false);

    const frontier = clone(base);
    frontier.frontier.g06HoldEligible = false;
    assert.equal(shard.validateAudit(frontier, { compareCurrent: false }).valid, false);

    const input = clone(base);
    input.inputEvidence.files.comparison.sha256 = "0".repeat(64);
    assert.equal(shard.validateAudit(input, { compareCurrent: false }).valid, false);
});

test("dedicated schema pins shard03 scope and fail-closed gate", () => {
    const schema = read("games/genshin/data/schema/r2-weapon-primary-field-search-shard03.schema.json");
    assert.equal(schema.$id, "r2-weapon-primary-field-search-shard03.schema.json");
    assert.equal(schema.properties.kind.const, "genshinR2WeaponPrimaryFieldSearchShard");
    assert.equal(schema.properties.status.const, "draft");
    assert.equal(schema.$defs.scope.properties.candidateCount.const, 100);
    assert.equal(schema.$defs.scope.properties.shardId.const, "weapons-primary-numeric-shard03");
    assert.equal(schema.$defs.frontier.properties.id.const, "weapons-primary-numeric-shard03-independent-field-frontier-7.0");
    assert.equal(schema.$defs.frontier.properties.status.const, "searchExhausted");
    assert.equal(schema.$defs.gate.properties.strictVerified.const, false);
});
