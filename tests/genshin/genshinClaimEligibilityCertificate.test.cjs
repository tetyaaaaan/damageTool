"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const generator = require("../../scripts/genshinClaimEligibilityCertificateGenerate.cjs");
const pairPolicy = require("../../scripts/genshinProviderPairPolicyNormalize.cjs");

const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));

test("missing raw digests and forged packet provider cannot create source proof", () => {
    const context = {
        normalizedPolicy: { pairs: [] }, sourceCatalogDigest: { sha256: "fixture" },
        registryDigest: { sha256: "fixture" }, providerPolicyDigest: { sha256: "fixture" },
        versionBaseline: { canonicalGateOpen: false },
        recordByKey: new Map([["source:A", { id: "source:A", source: "actual" }]]),
        rawRecordById: new Map(), sourceById: new Map([["actual", { provider: "actual" }]]),
        providerIndex: new Map([
            ["actual", { providerId: "actual", providerName: "Actual", familyId: "root-A" }],
            ["forged", { providerId: "forged", providerName: "Forged", familyId: "root-B" }]
        ])
    };
    const certificate = generator.certificateForClaim({
        id: "fixture:claim", candidateId: "fixture:candidate", field: "value",
        entityType: "weapon", claimKind: "externalFactual", classification: "dual-source eligible",
        evidence: [{ sourceRef: "source:A", provider: "forged", supportsClaimValue: true }]
    }, context);
    assert.equal(certificate.status, "blocked");
    assert.equal(certificate.sources[0].rawArtifactDigestBound, false);
    assert.equal(certificate.sources[0].providerId, "actual");
    assert.notEqual(generator.referenceKey("source:A"), generator.referenceKey("source-A"));
    assert.notEqual(generator.referenceKey("source:A"), generator.referenceKey("source:a"));
});

test("certificate diagnostics preserve strict-audit conflicts without inventing them from missing evidence", () => {
    const context = {
        normalizedPolicy: { pairs: [] }, sourceCatalogDigest: { sha256: "fixture" },
        registryDigest: { sha256: "fixture" }, providerPolicyDigest: { sha256: "fixture" },
        versionBaseline: { canonicalGateOpen: false }
    };
    for (const [classification, expected] of [["missing-version", "notMatch"], ["conflict", "conflict"]]) {
        const certificate = generator.certificateForClaim({
            id: "fixture:claim", candidateId: "fixture:candidate", field: "value",
            entityType: "weapon", claimKind: "externalFactual", classification, evidence: []
        }, context);
        assert.equal(certificate.comparison.status, expected);
        assert.equal(certificate.status, "blocked");
        assert.equal(certificate.canonicalEligibility, false);
    }
});

test("claim certificates are recomputed from strict catalog evidence and currently fail closed", () => {
    const registry = generator.buildCertificates();
    assert.equal(registry.kind, "genshinClaimEligibilityCertificateRegistry");
    assert.ok(registry.summary.candidateClaimCount > 0);
    assert.equal(registry.summary.eligibleCount, 0);
    assert.equal(registry.summary.blockedCount, registry.summary.candidateClaimCount);
    const queue = readJson("reports/genshin-evidence-task-queue.json");
    assert.equal(registry.inputCoverage.candidateCount, queue.tasks.length);
    assert.ok(registry.certificates.some((c) => c.dataset === "characters"));
    assert.ok(registry.inputCoverage.missingClaimDefinitions.length > 0);
    assert.equal(registry.inputCoverage.complete, false);
    assert.equal(registry.currentGameVersion.gameVersion, "7.0");
    assert.equal(registry.verificationTarget.productionActivationGranted, false);
    assert.ok(registry.certificates.every((c) => !c.blockedReasons.includes("acceptedVersionBaselineDrift")));
    assert.ok(registry.certificates.every((c) => c.versionSnapshotId.startsWith("genshin-verification:7.0:")));
    registry.certificates.forEach((certificate) => {
        assert.ok(certificate.candidateId);
        assert.ok(certificate.claimId);
        assert.ok(certificate.field);
        assert.equal(certificate.authority.id, "genshinSourceCatalogContractAudit");
        assert.match(certificate.authority.sourceCatalogDigest, /^[a-f0-9]{64}$/);
        assert.equal(certificate.canonicalEligibility, false);
    });
});

test("shared candidate inventory preserves every authoritative queue ID exactly once", () => {
    const rows = require("../../scripts/genshinCandidateRegistry.cjs").collectCandidates();
    const queue = readJson("reports/genshin-evidence-task-queue.json");
    assert.deepEqual(rows.map((r) => r.id).sort(), queue.tasks.map((t) => t.candidateId).sort());
    assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
});

test("reaction scoped projection never receives an automatic eligibility certificate", () => {
    const registry = generator.buildCertificates();
    const certificates = registry.certificates.filter((certificate) => certificate.candidateId === "w_12516_reaction_bonus_2");
    assert.ok(certificates.length > 0);
    assert.ok(certificates.every((certificate) => certificate.status === "blocked"));
    assert.ok(certificates.some((certificate) => certificate.blockedReasons.includes("fieldAgreementNotExactMatch")));
});

test("root source families collapse correlated providers and normalize the Gachabase legacy group", () => {
    const registry = readJson("games/genshin/data/v2/source-family-registry.json");
    assert.equal(registry.providers["theBowja/genshin-db"].familyId, "GenshinData-derived");
    assert.equal(registry.providers["Genshin Optimizer"].familyId, "GenshinData-derived");
    assert.equal(registry.providers["HoYoverse HoYoWiki"].familyId, "official-hoyoverse");
    assert.equal(registry.providers["HoYoLAB official notices"].familyId, "official-hoyoverse");
    const normalized = pairPolicy.buildNormalizedPolicy();
    const gachabase = normalized.pairs.find((pair) => pair.id === "characters:gachabase+genshin-db");
    assert.deepEqual(gachabase.normalizedIndependenceGroups, {
        providerA: "gachabase-versioned-data",
        providerB: "GenshinData-derived"
    });
    assert.deepEqual(gachabase.normalization.legacyGroupAliasesApplied, ["gachabase-versioned-snapshots"]);
});

test("source-family registry records auditable root lineage mechanics instead of provider labels alone", () => {
    const registry = JSON.parse(fs.readFileSync(path.join(root, "games", "genshin", "data", "v2", "source-family-registry.json"), "utf8"));
    const required = ["familyId", "rootDataset", "acquisitionMethod", "transformChain", "mirrorOf", "forkOf", "usesApi", "translationOf", "datamineRoot", "revisionSystem", "releaseSystem", "lineageEvidenceRefs"];
    for (const [familyId, family] of Object.entries(registry.families)) {
        assert.equal(family.familyId, familyId);
        for (const field of required) assert.ok(Object.prototype.hasOwnProperty.call(family, field), `${familyId}:${field}`);
        assert.ok(Array.isArray(family.transformChain));
        assert.ok(Array.isArray(family.lineageEvidenceRefs) && family.lineageEvidenceRefs.length > 0);
    }
    assert.equal(registry.providers["Genshin Optimizer"].familyId, registry.providers["theBowja/genshin-db"].familyId);
    assert.equal(registry.providers["HoYoverse HoYoWiki"].familyId, registry.providers["HoYoLAB official notices"].familyId);
    assert.equal(registry.families["gachabase-versioned-data"].lineageStatus, "unknown");
});

test("changing policy prose or status cannot manufacture strict reuse", () => {
    const registry = readJson("games/genshin/data/v2/source-family-registry.json");
    const sourcePolicy = readJson("games/genshin/data/v2/provider-independence-policy.json");
    const raw = structuredClone(sourcePolicy.policies.find((pair) => pair.id === "artifacts:kqm-tcl+genshin-db"));
    raw.status = "reusable";
    raw.blockReasons = [];
    raw.gameVersionBinding = { proseOnly: true };
    const normalized = pairPolicy.normalizePair(raw, registry);
    assert.equal(normalized.normalization.policyReusable, true);
    assert.equal(normalized.normalization.strictReusable, false);
});
