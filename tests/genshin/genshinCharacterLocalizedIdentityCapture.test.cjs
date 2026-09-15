"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const capture = require("../../scripts/genshinCharacterLocalizedIdentityCapture.cjs");
const { digestStable } = require("../../scripts/genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "../..");

function checkedInSnapshot() {
    return JSON.parse(fs.readFileSync(capture.outputPath, "utf8"));
}

function checkedInCheckpoint() {
    return JSON.parse(fs.readFileSync(capture.checkpointPath, "utf8"));
}

test("localized identity bridge captures the exact Japanese/English id bridge and stays fail-closed", () => {
    const snapshot = checkedInSnapshot();
    assert.deepEqual(snapshot, capture.buildSnapshot());
    assert.equal(snapshot.status, "identityBridgeProven");
    assert.equal(snapshot.claim.identityBridge.status, "explicitLocalizedNameBridge");
    assert.equal(snapshot.claim.identityBridge.localizedRecordCount, 4);
    assert.equal(snapshot.claim.identityBridge.missingLocalizedRecordCount, 0);
    assert.equal(snapshot.claim.identityBridge.canUseForIdentityReconciliation, true);
    assert.ok(snapshot.claim.revisions.before.localizedRecords.every((record) => record.artifact.embeddedId === 12401 && record.artifact.embeddedName === "ヤフォダ"));
    assert.ok(snapshot.claim.revisions.after.localizedRecords.every((record) => record.artifact.embeddedId === 12401 && record.artifact.embeddedName === "ヤフォダ"));
    assert.ok(Object.values(snapshot.claim.revisions).every((revision) => revision.localizedRecords.length === 2 && revision.englishLinkage.records.length === 2));
    assert.equal(snapshot.claim.negativeAliasEvidence.records.length, 4);
    assert.equal(snapshot.gateEligibility.canIssueEligibilityCertificate, false);
    assert.equal(snapshot.gateEligibility.canPromoteCanonical, false);
    assert.equal(capture.validateSnapshot(snapshot, { repositoryRoot }).valid, true);
});

test("localized bridge persists complete nonrecursive tree API evidence for both record kinds and revisions", () => {
    const snapshot = checkedInSnapshot();
    for (const revision of Object.values(snapshot.claim.revisions)) {
        assert.deepEqual(revision.treeResolution.recordKinds, capture.recordKinds);
        for (const recordKind of capture.recordKinds) {
            const tree = revision.treeResolution.trees[recordKind];
            assert.equal(tree.steps.length, 4);
            assert.deepEqual(tree.pathSegments, ["src", "data", "Japanese", recordKind]);
            assert.ok(tree.steps.every((step) => step.responseTruncated === false && step.rawResponse.rawArtifactBytes > 0));
            assert.ok(tree.finalResponse.rawArtifactBytes > 0);
            assert.equal(tree.entries.some((entry) => entry.path === `${capture.entity.providerSlug}.json` && entry.type === "blob"), true);
        }
    }
    assert.deepEqual(capture.validateSnapshot(snapshot, { repositoryRoot }), { valid: true, reasons: [] });
});

test("validator rejects duplicate/unknown record kinds after an attacker rehashes the claim", () => {
    const duplicate = checkedInSnapshot();
    duplicate.claim.revisions.before.localizedRecords[1].recordKind = "talents";
    duplicate.fieldDigest = digestStable(duplicate.claim);
    const duplicateResult = capture.validateSnapshot(duplicate, { repositoryRoot });
    assert.equal(duplicateResult.valid, false);
    assert.ok(duplicateResult.reasons.includes("localizedRecordSetInvalid:before"));

    const unknown = checkedInSnapshot();
    unknown.claim.revisions.after.localizedRecords[1].recordKind = "unknown";
    unknown.fieldDigest = digestStable(unknown.claim);
    const unknownResult = capture.validateSnapshot(unknown, { repositoryRoot });
    assert.equal(unknownResult.valid, false);
    assert.ok(unknownResult.reasons.includes("localizedRecordSetInvalid:after"));
});

test("validator recomputes bridge and summary counts instead of trusting rehashed metadata", () => {
    const summary = checkedInSnapshot();
    summary.summary.localizedRecordCount = 3;
    const summaryResult = capture.validateSnapshot(summary, { repositoryRoot });
    assert.equal(summaryResult.valid, false);
    assert.ok(summaryResult.reasons.includes("summaryCountsInvalid"));

    const bridge = checkedInSnapshot();
    bridge.claim.identityBridge.localizedRecordCount = 3;
    bridge.fieldDigest = digestStable(bridge.claim);
    const bridgeResult = capture.validateSnapshot(bridge, { repositoryRoot });
    assert.equal(bridgeResult.valid, false);
    assert.ok(bridgeResult.reasons.includes("identityBridgeCountsInvalid"));
});

test("validator rejects forged tree steps and raw-response metadata even when the outer claim is rehashed", () => {
    const step = checkedInSnapshot();
    step.claim.revisions.before.treeResolution.trees.talents.steps[0].treeSha = "0".repeat(40);
    step.claim.revisions.before.treeResolution.fieldDigest = step.claim.revisions.before.treeResolution.fieldDigest;
    step.fieldDigest = digestStable(step.claim);
    const stepResult = capture.validateSnapshot(step, { repositoryRoot });
    assert.equal(stepResult.valid, false);
    assert.ok(stepResult.reasons.includes("treeEvidenceInvalid:before") || stepResult.reasons.some((reason) => reason.startsWith("revisionEvidenceInvalid:before")));

    const response = checkedInSnapshot();
    response.claim.revisions.after.treeResolution.trees.constellations.finalResponse.rawArtifactSha256 = "0".repeat(64);
    response.fieldDigest = digestStable(response.claim);
    const responseResult = capture.validateSnapshot(response, { repositoryRoot });
    assert.equal(responseResult.valid, false);
    assert.ok(responseResult.reasons.includes("treeEvidenceInvalid:after") || responseResult.reasons.some((reason) => reason.startsWith("revisionEvidenceInvalid:after")));
});

test("checkpoint remains tied to the materialized bridge and fail-closed gates", () => {
    const snapshot = checkedInSnapshot();
    const checkpoint = checkedInCheckpoint();
    assert.deepEqual(checkpoint, capture.buildCheckpoint(snapshot));
    assert.equal(checkpoint.status, "complete");
    assert.equal(checkpoint.gateEligibility.canIssueEligibilityCertificate, false);
    assert.equal(checkpoint.gateEligibility.canPromoteCanonical, false);
    assert.deepEqual(capture.validateCheckpoint(checkpoint, { repositoryRoot }), { valid: true, reasons: [] });
});

test("dedicated schemas require raw tree responses and do not hard-code talents for constellations", () => {
    const snapshotSchema = JSON.parse(fs.readFileSync(capture.schemaPath, "utf8"));
    const checkpointSchema = JSON.parse(fs.readFileSync(capture.checkpointSchemaPath, "utf8"));
    assert.equal(snapshotSchema.$id, "genshin-version-transition-localized-identity-bridge-snapshot.schema.json");
    assert.ok(snapshotSchema.$defs.rawTreeResponse);
    assert.ok(snapshotSchema.$defs.treeStep.properties.rawResponse.$ref.includes("rawTreeResponse"));
    assert.ok(snapshotSchema.$defs.tree.properties.finalResponse.$ref.includes("rawTreeResponse"));
    assert.equal(snapshotSchema.$defs.tree.properties.pathSegments.type, "array");
    assert.equal(checkpointSchema.$id, "genshin-version-transition-localized-identity-bridge-capture-checkpoint.schema.json");
});
