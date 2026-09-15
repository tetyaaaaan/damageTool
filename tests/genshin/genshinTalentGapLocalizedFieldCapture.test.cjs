"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const capture = require(path.join(root, "scripts", "genshinTalentGapLocalizedFieldCapture.cjs"));
const { digestStable } = require(path.join(root, "scripts", "genshinVersionEvidenceValidation.cjs"));

function readJson(file) { return JSON.parse(fs.readFileSync(path.join(root, file), "utf8")); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

test("bounded localized capture covers exactly 21 entities, 42 records, and 63 non-Traveler candidate bridges", () => {
    const snapshot = capture.buildSnapshot();
    assert.equal(snapshot.status, "localizedFieldBridgeCaptured");
    assert.equal(snapshot.summary.entities, 21);
    assert.equal(snapshot.summary.candidates, 63);
    assert.equal(snapshot.summary.travelerCandidates, 4);
    assert.equal(snapshot.summary.localizedRecords, 42);
    assert.equal(snapshot.summary.expectedLocalizedRecords, 42);
    assert.equal(snapshot.summary.missingLocalizedRecords, 0);
    assert.equal(snapshot.summary.exactCandidateBridges, 63);
    assert.equal(snapshot.summary.unresolvedCandidateBridges, 0);
    assert.equal(snapshot.claim.entities.length, 21);
    assert.equal(snapshot.claim.candidateBridges.length, 63);
    assert.deepEqual(snapshot.claim.travelerDisposition.entityIds, ["10000005", "10000007"]);
    assert.equal(snapshot.claim.travelerDisposition.capturedRawRecordCount, 0);
    assert.deepEqual(capture.validateSnapshot(snapshot, { compareCurrent: true }), { valid: true, reasons: [] });
});

test("every localized record is pinned to revision, reused full tree proof, raw SHA, Git blob, and embedded Japanese identity", () => {
    const snapshot = capture.buildSnapshot();
    for (const entity of snapshot.claim.entities) {
        assert.equal(entity.revisions.before.status, "captured", entity.entityId);
        assert.equal(entity.revisions.after.status, "captured", entity.entityId);
        for (const side of ["before", "after"]) {
            const revision = entity.revisions[side];
            const artifact = revision.artifact;
            assert.equal(artifact.gameVersion, side === "before" ? "6.7" : "7.0", `${entity.entityId}:${side}`);
            assert.equal(artifact.embeddedId, entity.providerId, `${entity.entityId}:${side}`);
            assert.equal(artifact.embeddedName, entity.localNameJa, `${entity.entityId}:${side}`);
            assert.equal(artifact.explicitLocalizedNameMatch, true, `${entity.entityId}:${side}`);
            assert.match(artifact.rawArtifactSha256, /^[a-f0-9]{64}$/);
            assert.match(artifact.gitBlob, /^[a-f0-9]{40}$/);
            assert.equal(artifact.treeBlobSha, artifact.gitBlob, `${entity.entityId}:${side}`);
            assert.equal(artifact.passiveFields.length > 0, true, `${entity.entityId}:${side}`);
            assert.equal(revision.english.embeddedId, entity.providerId, `${entity.entityId}:${side}`);
            assert.equal(revision.english.embeddedName, entity.providerEnglishName, `${entity.entityId}:${side}`);
        }
    }
    for (const side of ["before", "after"]) {
        const tree = snapshot.claim.reusedTreeProof[side];
        assert.equal(tree.method, "reusedValidatedIdentityBridgeGitTreeProof");
        assert.equal(tree.recursive, false);
        assert.equal(tree.recordKind, "talents");
        assert.equal(tree.selectedEntries.length, 21);
        assert.match(tree.treeFieldDigest, /^[a-f0-9]{64}$/);
    }
});

test("localized-name bridge uses a unique provider Japanese field and the same English provider key without ordinal inference", () => {
    const snapshot = capture.buildSnapshot();
    for (const bridge of snapshot.claim.candidateBridges) {
        assert.equal(bridge.status, "exactLocalizedNameProviderKey", bridge.candidateId);
        assert.equal(bridge.safeExactMapping, true, bridge.candidateId);
        assert.match(bridge.providerFieldKey, /^passive[0-9]+$/, bridge.candidateId);
        assert.equal(bridge.noOrdinalInference, true, bridge.candidateId);
        assert.equal(bridge.noTransliterationInference, true, bridge.candidateId);
        assert.equal(bridge.noSemanticInference, true, bridge.candidateId);
        assert.equal(bridge.revisions.before.localizedMatchCount, 1, bridge.candidateId);
        assert.equal(bridge.revisions.after.localizedMatchCount, 1, bridge.candidateId);
        assert.equal(bridge.revisions.before.sameProviderFieldKey, true, bridge.candidateId);
        assert.equal(bridge.revisions.after.sameProviderFieldKey, true, bridge.candidateId);
        assert.equal(bridge.revisions.before.providerFieldKey, bridge.providerFieldKey, bridge.candidateId);
        assert.equal(bridge.revisions.after.providerFieldKey, bridge.providerFieldKey, bridge.candidateId);
    }
});

test("localized capture remains fail-closed and detects a forged candidate bridge digest", () => {
    const snapshot = capture.buildSnapshot();
    const forged = clone(snapshot);
    forged.claim.candidateBridges[0].providerFieldKey = "passive99";
    const result = capture.validateSnapshot(forged);
    assert.equal(result.valid, false);
    assert.ok(result.reasons.includes("fieldDigestInvalid"));
});

test("rehashed forged bridge and package metadata cannot pass deterministic validation", () => {
    const snapshot = capture.buildSnapshot();

    const forgedBridge = clone(snapshot);
    forgedBridge.claim.candidateBridges[0].providerFieldKey = "passive99";
    forgedBridge.fieldDigest = digestStable(forgedBridge.claim);
    const bridgeResult = capture.validateSnapshot(forgedBridge);
    assert.equal(bridgeResult.valid, false);
    assert.ok(bridgeResult.reasons.includes("candidateBridgeEvidenceInvalid:talent-gap-spec:10000003:passive_1"));
    assert.ok(bridgeResult.reasons.includes("artifactNotDeterministicForCurrentInputs"));

    const forgedPackage = clone(snapshot);
    forgedPackage.claim.versionBindings.before.package.rawArtifactSha256 = "0".repeat(64);
    forgedPackage.fieldDigest = digestStable(forgedPackage.claim);
    const packageResult = capture.validateSnapshot(forgedPackage);
    assert.equal(packageResult.valid, false);
    assert.ok(packageResult.reasons.includes("versionBindingInvalid:before") || packageResult.reasons.includes("packageEvidenceInvalid:before"));
    assert.ok(packageResult.reasons.includes("artifactNotDeterministicForCurrentInputs"));
});

test("same-process validation rechecks raw files after an earlier valid result", () => {
    const snapshot = capture.buildSnapshot();
    assert.equal(capture.validateSnapshot(snapshot, { compareCurrent: false }).valid, true);
    const target = path.resolve(root, snapshot.claim.entities[0].revisions.before.artifact.path);
    const originalReadFileSync = fs.readFileSync;
    let tamper = false;
    fs.readFileSync = function patchedReadFileSync(file, options) {
        const value = originalReadFileSync.call(this, file, options);
        if (!tamper || path.resolve(String(file)) !== target) return value;
        const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
        const forged = JSON.parse(bytes.toString("utf8"));
        forged.name = "forged localized record";
        return Buffer.from(JSON.stringify(forged), "utf8");
    };
    tamper = true;
    try {
        const result = capture.validateSnapshot(snapshot, { compareCurrent: false });
        assert.equal(result.valid, false);
        assert.ok(result.reasons.some((reason) => reason.startsWith("recordIdentityInvalid:6.7:10000003") || reason.startsWith("recordDigestInvalid:6.7:10000003")));
    } finally {
        fs.readFileSync = originalReadFileSync;
    }
});

test("English evidence requires the actual parent version binding, exact pinned raw path, and all raw integrity metadata", () => {
    const entity = capture.entities[0];
    const revision = capture.revisions.before;
    const validIndex = capture.englishEvidenceIndex();
    const valid = capture.findEnglishEvidence(entity, revision, validIndex);
    assert.equal(valid.parentSnapshotRevision, revision.revision);
    assert.equal(valid.parentSnapshotGameVersion, revision.gameVersion);

    for (const [label, mutate] of [
        ["wrong parent record revision", (entry) => { entry.snapshotRevision = "0".repeat(40); }],
        ["missing parent claim revision", (entry) => { delete entry.parentVersionBindingRevision; }],
        ["missing parent snapshot digest", (entry) => { delete entry.parentSnapshotFieldDigest; }],
        ["unknown raw path revision", (entry) => { entry.path = entry.path.replace(revision.revision, "a".repeat(40)); }],
        ["missing raw SHA", (entry) => { entry.rawArtifactSha256 = null; }],
        ["missing Git blob", (entry) => { entry.gitBlob = null; }]
    ]) {
        const forgedIndex = clone(validIndex);
        const selected = forgedIndex.find((entry) => entry.entityId === entity.entityId && entry.side === "before");
        assert.ok(selected, label);
        mutate(selected);
        assert.throws(() => capture.findEnglishEvidence(entity, revision, forgedIndex), /English (parent snapshot revision mismatch|parent snapshot digest metadata missing|raw path revision mismatch|raw integrity metadata missing)/, label);
    }
});

test("checkpoint, snapshot schemas, and materialized artifacts are present and valid", () => {
    const snapshot = readJson("games/genshin/data/v2/version-transitions/6.7-to-7.0/talent-gap-localized-field-capture-standard01-snapshot.json");
    const checkpoint = readJson("games/genshin/data/v2/version-transitions/6.7-to-7.0/talent-gap-localized-field-capture-standard01-checkpoint.json");
    const snapshotSchema = readJson("games/genshin/data/schema/version-transition-talent-gap-localized-field-capture-snapshot.schema.json");
    const checkpointSchema = readJson("games/genshin/data/schema/version-transition-talent-gap-localized-field-capture-checkpoint.schema.json");
    assert.equal(snapshotSchema.$id, "genshin-version-transition-talent-gap-localized-field-capture-snapshot.schema.json");
    assert.equal(checkpointSchema.$id, "genshin-version-transition-talent-gap-localized-field-capture-checkpoint.schema.json");
    assert.equal(snapshotSchema.properties.claim.$ref, "#/$defs/claim");
    assert.equal(checkpointSchema.properties.claim.type, "object");
    assert.deepEqual(capture.validateSnapshot(snapshot, { compareCurrent: true }), { valid: true, reasons: [] });
    assert.deepEqual(capture.validateCheckpoint(checkpoint), { valid: true, reasons: [] });
    assert.equal(checkpoint.status, "complete");
    assert.equal(checkpoint.capturedLocalizedRecordCount, 42);
    assert.equal(checkpoint.gateEligibility.canIssueEligibilityCertificate, false);
    assert.equal(checkpoint.gateEligibility.canPromoteCanonical, false);
});
