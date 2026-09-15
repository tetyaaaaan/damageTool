"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const dataRoot = path.join(root, "games", "genshin", "data");
const evidencePath = path.join(dataRoot, "v2", "game-version-evidence.json");
const reportJsonPath = path.join(root, "reports", "genshin-game-version-evidence.json");
const reportMarkdownPath = path.join(root, "reports", "genshin-game-version-evidence.md");
const generator = require(path.join(root, "scripts", "genshinGameVersionEvidenceGenerate.cjs"));
const auditor = require(path.join(root, "scripts", "genshinGameVersionEvidenceAudit.cjs"));

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

test("primary game-version evidence audit is deterministic and fail-closed", () => {
    const report = auditor.auditEvidence({ dataRoot, outputFile: evidencePath });
    assert.equal(report.status, "passed", report.errors.join("\n"));
    assert.equal(report.promotionGate, "blocked");
    assert.equal(report.canonicalEligibility, 0);
    assert.equal(report.summary.sources, 2);
    assert.equal(report.summary.revisionPinnedSources, 2);
    assert.equal(report.summary.explicitGameVersionSources, 1);
    assert.equal(report.summary.strictlyBoundSources, 1);
    assert.equal(report.summary.catalogRecords, 18);
    assert.equal(report.summary.fieldScopedRecords, 9);
    assert.equal(report.summary.explicitGameVersionRecords, 9);
    assert.equal(report.summary.strictlyBoundRecords, 9);
    assert.equal(report.summary.localSourceRecords, 1327);
    assert.equal(report.summary.localGameVersionPresent, 5);
    assert.equal(report.summary.scopedCanonicalEligibility, 2);
    assert.equal(report.summary.externalEvidenceExplicitGameVersion, 0);
    assert.equal(report.summary.externalEvidenceVerifiedGameVersion, 0);
    assert.equal(report.summary.primaryResearchSources, 2);
    assert.equal(report.summary.primaryResearchFieldCandidates, 9);
    assert.equal(report.summary.primaryResearchExactRevisionFieldCandidates, 9);
    assert.equal(report.summary.primaryResearchStrictlyBoundSources, 1);
    assert.equal(report.summary.primaryResearchStrictlyBoundFields, 9);
    assert.equal(report.summary.contract.sourceViolations, 0);
    assert.equal(report.summary.contract.recordViolations, 0);
    assert.equal(report.summary.contract.primaryEvidenceBindingViolations, 0);
    assert.equal(report.summary.contract.canonicalViolations, 0);
    assert.equal(report.summary.contract.primaryResearchViolations, 0);
    assert.equal(report.feasibilityAudit.providerAssessment.gcsim.strictBinding, false);
    assert.equal(report.feasibilityAudit.providerAssessment.genshinDb.strictBinding, true);
    assert.equal(report.feasibilityAudit.impact.canonicalCandidates.total, 2268);
    assert.equal(report.feasibilityAudit.impact.canonicalCandidates.currentlyCanonical, 2);
    assert.equal(report.feasibilityAudit.impact.canonicalCandidates.directlyExposedToMissingGcsimRevisionVersion, 9);
    assert.equal(report.feasibilityAudit.impact.claims.total, 12122);
    assert.equal(report.feasibilityAudit.impact.claims.dualSourceEligible, 5);
    assert.equal(report.feasibilityAudit.impact.claims.directlyExposedToMissingGcsimRevisionVersion, 651);
    assert.equal(report.feasibilityAudit.impact.review.humanDecisionRequiredNow, 0);
    assert.equal(report.feasibilityAudit.evidenceModels[1].status, "proposalOnlyNotImplemented");
    assert.equal(fs.existsSync(reportJsonPath), true);
    assert.equal(fs.existsSync(reportMarkdownPath), true);
    assert.match(fs.readFileSync(reportMarkdownPath, "utf8"), /commit\/file digest is never treated as a patch version/);
    assert.match(fs.readFileSync(reportMarkdownPath, "utf8"), /Primary-source investigation \(non-promoting\)/);
    assert.match(fs.readFileSync(reportMarkdownPath, "utf8"), /introduction-version history/);
    assert.match(fs.readFileSync(reportMarkdownPath, "utf8"), /Current-contract feasibility and impact/);
});

test("revision, metadata digest, and nearby release notes cannot substitute for strict binding", () => {
    const source = {
        revision: "a".repeat(40),
        gameVersion: "6.7"
    };
    const metadataDigest = "b".repeat(64);
    const revisionOnly = generator.strictEvidence({
        source,
        evidence: {
            kind: "releaseNotesWithExplicitGameVersion",
            gameVersion: "6.7",
            locator: { dataset: "release-notes", record: "v2.0.0" },
            integrity: { algorithm: "sha256", digest: metadataDigest }
        }
    });
    assert.equal(revisionOnly.verified, false);
    assert.ok(revisionOnly.blockedReasons.includes("sameRevisionBindingMissing"));
    const mismatchedRecord = generator.strictEvidence({
        source,
        evidence: {
            kind: "providerDatasetManifest",
            gameVersion: "6.7",
            locator: { dataset: "manifest", record: "version" },
            integrity: { algorithm: "sha256", digest: metadataDigest },
            binding: { revision: source.revision, sourceRecordDigest: "c".repeat(64) }
        },
        record: { sha256: "d".repeat(64) }
    });
    assert.equal(mismatchedRecord.verified, false);
    assert.ok(mismatchedRecord.blockedReasons.includes("sourceRecordDigestBindingMissingOrMismatch"));
    const fullyBound = generator.strictEvidence({
        source,
        evidence: {
            kind: "providerDatasetManifest",
            gameVersion: "6.7",
            locator: { dataset: "manifest", record: "version" },
            integrity: { algorithm: "sha256", digest: metadataDigest },
            binding: { revision: source.revision }
        }
    });
    assert.equal(fullyBound.verified, true);
});

test("official provider locators remain review targets, never implicit version claims", () => {
    const evidence = readJson(evidencePath);
    const locators = evidence.sourceCatalog.officialLocators;
    assert.equal(locators.gcsim.revision, "3647a07a7cc3004bc1e79d9bb5f7444de20dceaa");
    assert.equal(locators.genshinDb.revision, "1bab2cdba4d218fd5caa46b5f54e7884ee8359a2");
    for (const review of Object.values(locators)) {
        assert.equal(review.locators.length, 2);
        for (const locator of review.locators) {
            assert.ok(generator.ACCEPTED_EVIDENCE_KINDS.includes(locator.kind));
            assert.notEqual(locator.status, "accepted");
            if (locator.kind === "releaseNotesWithExplicitGameVersion") assert.equal(locator.immutable, true);
            if (locator.kind === "providerReleaseArtifact") assert.equal(locator.immutable, false);
        }
    }
});

test("materialized artifact matches a fresh no-network build", () => {
    const artifact = readJson(evidencePath);
    const rebuilt = generator.buildEvidence({ dataRoot, metadataFiles: {} });
    assert.equal(generator.stableJson(artifact), generator.stableJson(rebuilt));
    assert.equal(artifact.summary.canonicalEligibility, 0);
    assert.equal(artifact.summary.promotionGate, "blocked");
    assert.ok(artifact.blockedReasons.includes("externalEvidence:gameVersionMissing"));
    assert.ok(artifact.blockedReasons.includes("providerManifest:gcsim:metadataManifestNotConfigured"));
    assert.ok(!artifact.blockedReasons.includes("providerManifest:genshinDb:metadataManifestNotConfigured"));
});

test("primary research preserves exact observations without canonical promotion", () => {
    const artifact = readJson(evidencePath);
    const research = artifact.primaryResearch;
    assert.equal(research.schemaVersion, 1);
    assert.equal(research.policy.canonicalPromotion, "forbidden");
    assert.equal(research.policy.selfApproval, "forbidden");
    assert.equal(research.summary.sources, 2);
    assert.equal(research.summary.explicitGameVersionReleaseCandidates, 1);
    assert.equal(research.summary.fieldCandidates, 9);
    assert.equal(research.summary.exactRevisionFieldCandidates, 9);
    assert.equal(research.summary.strictlyBoundSources, 1);
    assert.equal(research.summary.strictlyBoundFields, 9);

    const gcsim = research.sources.gcsim;
    assert.equal(gcsim.pinnedRevision, "3647a07a7cc3004bc1e79d9bb5f7444de20dceaa");
    assert.equal(gcsim.release.releaseRevision, gcsim.pinnedRevision);
    assert.equal(gcsim.release.exactRevisionBinding, true);
    assert.equal(gcsim.release.gameVersion, null);
    assert.equal(gcsim.release.strictlyBound, false);
    assert.ok(gcsim.release.blockedReasons.includes("gameVersionMissingInReleaseMetadata"));
    assert.equal(gcsim.corroboration.gameVersion, "6.7");
    assert.ok(gcsim.corroboration.blockedReasons.includes("crossSourceVersionNotRevisionBound"));

    const genshinDb = research.sources.genshinDb;
    assert.equal(genshinDb.packageManifest.gameVersion, "6.7");
    assert.equal(genshinDb.packageManifest.binding.revision, genshinDb.pinnedRevision);
    assert.equal(genshinDb.packageManifest.metadataSnapshot.sha256, "5ded2b3bab58218da17f6a1282209e653c1ec7ecd9297b95569558a737c2e8f6");
    assert.equal(genshinDb.packageManifest.strictlyBound, true);
    assert.equal(genshinDb.strictBinding, true);
    assert.equal(genshinDb.release.gameVersion, "6.7");
    assert.notEqual(genshinDb.release.releaseRevision, genshinDb.pinnedRevision);
    assert.equal(genshinDb.release.exactRevisionBinding, false);
    assert.equal(genshinDb.versionManifest.binding.revision, genshinDb.pinnedRevision);
    assert.equal(genshinDb.versionManifest.semantics, "introducedGameVersionByWeaponSlug");
    assert.ok(genshinDb.versionManifest.blockedReasons.includes("manifestSemanticsIntroducedVersionNotSnapshotVersion"));
    const amos = genshinDb.fieldCandidates.find((field) => field.slug === "amosbow");
    assert.ok(amos);
    assert.equal(amos.exactRevisionBinding, true);
    assert.equal(amos.recordDigestBinding, true);
    assert.equal(amos.binding.revision, genshinDb.pinnedRevision);
    assert.equal(amos.binding.sourceRecordDigest, amos.sourceRecordDigest);
    assert.equal(amos.gameVersion, "6.7");
    assert.equal(amos.introducedGameVersion, "1.0");
    assert.equal(amos.sourceRecordId, "genshinDb:weapon:15502");
    assert.equal(amos.snapshotVersionProvenance.gameVersion, "6.7");
    assert.equal(amos.strictlyBound, true);
    assert.equal(amos.status, "ready");
    assert.deepEqual(amos.blockedReasons, []);
});

test("nine-weapon field coverage separates game facts, runtime contracts, and not-applicable claims", () => {
    const artifact = readJson(evidencePath);
    const coverage = artifact.feasibilityAudit.pilotFieldCoverage;
    assert.deepEqual(coverage.summary, {
        totalClaims: 651,
        assertedClaims: 289,
        notApplicableClaims: 362,
        gameSemanticClaims: 134,
        runtimeContractClaims: 155,
        secondProviderEvidenceMaterialized: 0,
        dualSourceEligible: 0
    });
    assert.equal(coverage.rows.length, 651);
    assert.equal(coverage.highestPotentialExternalCoverage.weaponId, "15516");
    assert.equal(coverage.highestPotentialExternalCoverage.gameSemanticClaims, 36);
    assert.equal(coverage.claimKindEvidenceContract.implemented, true);
    assert.match(coverage.claimKindEvidenceContract.internalRuntimeRoute, /deterministic code provenance/);
    assert.ok(coverage.rows.every((row) => row.weaponId && row.candidateId && row.fieldPath));
    assert.ok(coverage.rows.filter((row) => row.claimStatus === "notApplicable")
        .every((row) => row.canonicalSecondProviderRequirement === "notRequiredForNotApplicableClaim"));

    const loadouts = artifact.feasibilityAudit.providerSubstitutionAssessment.candidates
        .find((candidate) => candidate.provider === "gridhead/gi-loadouts");
    assert.ok(loadouts);
    assert.equal(loadouts.classification, "sameLineage");
    assert.equal(loadouts.strictGenshin67Binding, true);
    assert.equal(loadouts.nineWeaponCoverage, "9/9");
});
