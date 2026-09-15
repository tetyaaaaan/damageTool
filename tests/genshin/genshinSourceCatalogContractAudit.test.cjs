"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const auditor = require(path.join(root, "scripts", "genshinSourceCatalogContractAudit.cjs"));

test("source catalog keeps repository revision separate from gameVersion", () => {
    const audit = auditor.buildAudit();
    assert.equal(audit.status, "passed", audit.errors.join("\n"));
    assert.equal(audit.promotionGate, "blocked");
    assert.equal(audit.canonicalEligibility, 0);
    assert.equal(audit.sourceCatalog.recordSummary.revisionPinned, 0);
    assert.equal(audit.sourceCatalog.recordSummary.versionManifestVerified, 9);
    assert.equal(audit.sourceCatalog.recordSummary.fieldScoped, 0);
    assert.equal(audit.sourceCatalog.recordSummary.fieldProofVerified, 0);
    assert.equal(audit.sourceCatalog.recordSummary.gameVersionVerified, 0);
    const genshinDb = audit.sourceCatalog.sourceStatuses.find((source) => source.id === "genshinDb");
    const gcsim = audit.sourceCatalog.sourceStatuses.find((source) => source.id === "gcsim");
    assert.equal(genshinDb.revisionPinned, true);
    assert.equal(genshinDb.gameVersion, "6.7");
    assert.equal(genshinDb.gameVersionVerified, true);
    assert.equal(genshinDb.sourceArtifactProof.versionManifestVerified, true);
    assert.equal(genshinDb.sourceArtifactProof.revisionVerified, true);
    assert.equal(genshinDb.blockedReasons.length, 0);
    // Keep the source-level metadata pin visible for contract reporting, but
    // require the replayable artifact proof on records below.
    assert.equal(gcsim.revisionPinned, true);
    assert.equal(gcsim.sourceArtifactProof.revisionVerified, false);
    assert.equal(gcsim.gameVersion, null);
    assert.equal(gcsim.gameVersionVerified, false);
    assert.ok(gcsim.blockedReasons.includes("revisionPin:notGameVersionProof"));
    audit.sourceCatalog.records.filter((record) => record.source === "gcsim").forEach((record) => {
        assert.equal(record.revisionPinned, false, record.id);
        assert.equal(record.rawArtifactVerified, false, record.id);
        assert.equal(record.fieldScoped, false, record.id);
        assert.equal(record.gameVersionVerified, false, record.id);
    });
    audit.sourceCatalog.records.filter((record) => record.source === "genshinDb").forEach((record) => {
        assert.equal(record.revisionPinned, false, record.id);
        assert.equal(record.rawArtifactVerified, false, record.id);
        assert.equal(record.versionManifestVerified, true, record.id);
        assert.equal(record.fieldScoped, false, record.id);
        assert.equal(record.fieldProofVerified, false, record.id);
        assert.equal(record.gameVersion, "6.7", record.id);
        assert.equal(record.gameVersionVerified, false, record.id);
        assert.ok(record.blockedReasons.includes("fieldScope:entitySnapshotOnly"), record.id);
        assert.ok(record.sourceArtifactProof.reasons.includes("rawArtifact:missing"), record.id);
    });
});

test("primary game-version metadata contract is explicit and fail-closed", () => {
    const audit = auditor.buildAudit();
    assert.deepEqual(audit.primaryMetadataContract.acceptedEvidenceKinds, auditor.GAME_VERSION_EVIDENCE_KINDS);
    assert.ok(audit.primaryMetadataContract.requiredFields.includes("gameVersionEvidence.integrity.digest"));
    assert.ok(audit.primaryMetadataContract.rejectedAsGameVersionProof.includes("revision"));
    assert.ok(audit.blockedReasons.includes("localSourceRecords:gameVersion:missing:1322"));
    assert.ok(audit.blockedReasons.includes("dualSource:fieldGameVersion:missing:12117"));
    assert.ok(audit.blockedReasons.includes("sourceCatalog:go:records:missing"));
    assert.equal(audit.localSourceRecords.total, 1324);
    assert.equal(audit.localSourceRecords.gameVersionPresent, 2);
    assert.equal(audit.dualSourceAudit.dualSourceEligibleClaims, 5);
    assert.equal(audit.dualSourceAudit.dualSourceEligibleCandidates, 1);
});

test("source catalog contract audit is deterministic and materialized report remains fail-closed", () => {
    const first = auditor.buildAudit();
    const second = auditor.buildAudit();
    assert.equal(auditor.stableJson(first), auditor.stableJson(second));
    const reportPath = path.join(root, "reports", "genshin-source-catalog-contract-audit.json");
    const markdownPath = path.join(root, "reports", "genshin-source-catalog-contract-audit.md");
    assert.equal(fs.existsSync(reportPath), true);
    assert.equal(fs.existsSync(markdownPath), true);
    const materialized = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    assert.equal(materialized.status, "passed");
    assert.equal(materialized.promotionGate, "blocked");
    assert.equal(materialized.canonicalEligibility, 0);
    assert.match(fs.readFileSync(markdownPath, "utf8"), /revision\/file pins/);
    assert.match(fs.readFileSync(markdownPath, "utf8"), /do not identify a Genshin patch/);
});
