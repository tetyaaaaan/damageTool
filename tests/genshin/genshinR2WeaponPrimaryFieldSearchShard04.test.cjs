"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const shard = require(path.join(root, "scripts", "genshinR2WeaponPrimaryFieldSearchShard04.cjs"));

function read(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function persistedAudit() {
    return read("games/genshin/data/v2/reviews/r2-weapon-primary-field-search-shard04.json");
}

test("shard selects the exact remaining numeric tail", () => {
    const audit = persistedAudit();
    assert.equal(audit.scope.shardId, "weapons-primary-numeric-shard04");
    assert.equal(audit.scope.candidateCount, 9);
    assert.equal(audit.scope.expectedCandidateCount, 9);
    assert.equal(audit.scope.sourceNumericCandidateCount, 310);
    assert.equal(audit.scope.consumerFreeNumericCandidateCount, 309);
    assert.equal(audit.scope.entityCount, 7);
    assert.equal(audit.scope.candidateIdDigest, "1477137ea0a5dd691bf717cc4e6dbeb69e057e4fb74c667d907d2d1c75c3a63f");
    assert.deepEqual(audit.scope.candidateIds, [
        "w_15507_damageBonus_6894c25e",
        "w_15508_damage_2",
        "w_15508_stat_1",
        "w_15509_stat_1",
        "w_15511_add_base_2",
        "w_15511_damage_1",
        "w_15512_damage_1",
        "w_15513_crit_1",
        "w_15514_statBonus_b409d658"
    ]);
    assert.ok(!audit.scope.candidateIds.includes("w_12516_stat_1"));
    assert.equal(Object.keys(audit.candidates).length, 9);
});

test("shard does not repeat registered shards or legacy decisions", () => {
    const audit = persistedAudit();
    const ids = new Set(audit.scope.candidateIds);
    for (const file of [...shard.PRIOR_SHARDS, shard.LEGACY_DECISIONS]) {
        const previous = read(file);
        const previousIds = file.includes("weapon-primary")
            ? previous.scope?.candidateIds || []
            : (previous.decisions || []).map((item) => String(item.candidateId));
        assert.equal(previousIds.filter((id) => ids.has(String(id))).length, 0);
    }
    assert.ok(!ids.has("w_12516_stat_1"));
});

test("all nine persisted raw pins are valid numeric observations", () => {
    const audit = persistedAudit();
    assert.equal(audit.summary.primaryNumericMatchCandidates, 9);
    assert.equal(audit.summary.primaryRawVersionValuesEqual, 9);
    assert.equal(audit.summary.primaryRawIntegrityValidCandidates, 9);
    assert.equal(audit.summary.primaryRawIntegrityInvalidCandidates, 0);
    assert.equal(audit.summary.officialRawCandidateHits, 0);
    assert.equal(audit.summary.secondIndependentStrictCandidateCount, 0);
    for (const candidate of Object.values(audit.candidates)) {
        assert.equal(candidate.primaryComparison.status, "numericAgreementOnlyNotSemanticIdentity");
        assert.equal(candidate.primaryComparison.rawVersionValuesEqual, true);
        assert.equal(candidate.primaryComparison.semanticIdentityEstablished, false);
        assert.equal(candidate.primaryComparison.semanticMapping, null);
        assert.equal(candidate.rawIntegrity.valid, true);
        assert.equal(candidate.currentQueue.consumerStatus, "notApplicable");
        for (const field of shard.REQUIRED_CLAIMS) {
            const claim = candidate.claims[field];
            assert.equal(claim.claimId, `${candidate.candidateId}:${field}`);
            assert.equal(claim.primaryProvider.comparison.semanticIdentityEstablished, false);
            assert.equal(claim.primaryProvider.comparison.semanticMapping, null);
            assert.equal(claim.primaryProvider.comparison.supportsClaimValue, false);
            assert.equal(claim.disposition.status, "evidenceDeferred");
            assert.equal(claim.disposition.semanticInference, "forbidden");
        }
    }
});

test("frontier is finite, candidate-scoped, and explicitly reopenable", () => {
    const audit = persistedAudit();
    assert.equal(audit.frontier.id, shard.FRONTIER_ID);
    assert.equal(audit.frontier.policyId, shard.FRONTIER_POLICY_ID);
    assert.equal(audit.frontier.status, "searchExhausted");
    assert.equal(audit.frontier.exhausted, true);
    assert.equal(audit.frontier.scopeMatched, true);
    assert.equal(audit.frontier.candidateScoped, true);
    assert.equal(audit.frontier.g06HoldEligible, true);
    assert.equal(audit.frontier.lastSearchedAt, "2026-08-31");
    assert.match(audit.frontier.searchScope, /remaining numeric-match/);
    assert.match(audit.frontier.reopenTrigger, /immutable manifest/);
    assert.deepEqual(audit.frontier.candidateRawHitSummary, {
        hoyowikiCandidates: 0,
        hoyowikiClaimFields: 0,
        candidatesWithoutIndependentCandidateFieldRecord: 9,
        gcsimFiniteLedgerIntersection: 0,
        strictIndependentCandidateFieldBundles: 0
    });
    for (const candidate of Object.values(audit.candidates)) {
        assert.equal(candidate.frontier.status, "searchExhausted");
        assert.equal(candidate.currentQueue.searchFrontier.status, "searchRequired");
        assert.equal(candidate.disposition.status, "evidenceDeferred");
    }
});

test("all strict, certificate, semantic, and canonical gates remain fail-closed", () => {
    const audit = persistedAudit();
    assert.equal(audit.summary.strictVerified, 0);
    assert.equal(audit.summary.certificateEligible, 0);
    assert.equal(audit.summary.canonicalPromotionEligible, 0);
    assert.deepEqual(audit.gate, {
        canIssueEligibilityCertificate: false,
        canPromoteCanonical: false,
        canSelectSemanticMapping: false,
        draftOnly: true,
        reason: "Candidate-scoped finite frontier is an external-evidence hold draft. No independent strict field bundle is present and numeric agreement is not semantic identity.",
        status: "failClosed",
        strictVerified: false
    });
    for (const candidate of Object.values(audit.candidates)) {
        assert.deepEqual(candidate.gate, {
            canonicalPromotionEligible: false,
            certificateEligible: false,
            semanticMappingSelected: false,
            strictVerified: false
        });
    }
});

test("persisted artifact validates against current immutable/raw inputs", () => {
    const audit = persistedAudit();
    const validation = shard.validateAudit(audit, { compareCurrent: true });
    assert.deepEqual(validation, { valid: true, reasons: [] });
    assert.equal(audit.fieldDigest, "624492cc0bff665016b28d5fca5f3379be95f9858b21e831383512112ef8db27");
});

test("tampering semantic identity, raw integrity, or frontier scope fails closed", () => {
    const base = persistedAudit();
    const id = base.scope.candidateIds[0];
    const semantic = clone(base);
    semantic.candidates[id].primaryComparison.semanticMapping = { source: "forged" };
    assert.equal(shard.validateAudit(semantic, { compareCurrent: false }).valid, false);

    const raw = clone(base);
    raw.candidates[id].rawIntegrity.valid = false;
    assert.equal(shard.validateAudit(raw, { compareCurrent: false }).valid, false);

    const frontier = clone(base);
    frontier.frontier.g06HoldEligible = false;
    assert.equal(shard.validateAudit(frontier, { compareCurrent: false }).valid, false);
});

test("dedicated schema pins the nine-candidate tail and fail-closed gate", () => {
    const schema = read("games/genshin/data/schema/r2-weapon-primary-field-search-shard04.schema.json");
    assert.equal(schema.$id, "r2-weapon-primary-field-search-shard04.schema.json");
    assert.equal(schema.properties.kind.const, "genshinR2WeaponPrimaryFieldSearchShard");
    assert.equal(schema.properties.status.const, "draft");
    assert.equal(schema.$defs.scope.properties.candidateCount.const, 9);
    assert.equal(schema.$defs.scope.properties.shardId.const, "weapons-primary-numeric-shard04");
    assert.equal(schema.$defs.frontier.properties.id.const, "weapons-primary-numeric-shard04-independent-field-frontier-7.0");
    assert.equal(schema.$defs.frontier.properties.status.const, "searchExhausted");
    assert.equal(schema.$defs.gate.properties.strictVerified.const, false);
});
