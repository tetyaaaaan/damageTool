"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const auditor = require(path.join(root, "scripts", "genshinTalentGapLaneAudit.cjs"));
const { digestStable } = require(path.join(root, "scripts", "genshinVersionEvidenceValidation.cjs"));

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function candidate(audit, id) {
    return audit.claim.candidates.find((item) => item.id === id);
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function firstProviderMetadata(inputs, entityId = "10000031", side = "after") {
    const entry = inputs.transitionSnapshots.find((item) => (item.snapshot.claim?.resolvedEntities || [])
        .some((entity) => String(entity.entityId) === String(entityId)));
    assert.ok(entry, `snapshot for ${entityId}`);
    const entity = entry.snapshot.claim.resolvedEntities.find((item) => String(item.entityId) === String(entityId));
    const record = entity.records.find((item) => item.recordKind === "talents");
    return { entry, record, metadata: record[side] };
}

test("talent-gap lane covers exactly the authoritative 67 candidates and 23 entities", () => {
    const audit = auditor.buildAudit();
    assert.equal(audit.status, "passed");
    assert.deepEqual(audit.errors, []);
    assert.equal(audit.scope.candidateCount, 67);
    assert.equal(audit.scope.entityCount, 23);
    assert.deepEqual(audit.claim.entityIds, auditor.EXPECTED_ENTITY_IDS);
    assert.equal(new Set(audit.claim.candidateIds).size, 67);
    assert.equal(audit.summary.queueTasksMissing, 0);
    assert.equal(audit.summary.localSourceStatus.verified, 67);
});

test("local Japanese passive source records are revalidated against current field locators and digests", () => {
    const audit = auditor.buildAudit();
    for (const item of audit.claim.candidates) {
        assert.equal(item.localEvidence.source.status, "verified", item.id);
        assert.equal(item.localEvidence.source.rawDigestMatches, true, item.id);
        assert.equal(item.localEvidence.source.sourceTextMatchesCurrent, true, item.id);
        assert.equal(item.localEvidence.source.fieldLocator.locatorMatches, true, item.id);
        assert.equal(item.localEvidence.spec.effect.allFieldsUnknown, true, item.id);
        assert.equal(item.localEvidence.spec.effect.numericValueObserved, false, item.id);
        assert.equal(item.classification.inferencePerformed, false, item.id);
    }
});

test("existing provider snapshots are checked from raw files, package manifests, revisions, and Git blobs", () => {
    const audit = auditor.buildAudit();
    assert.equal(audit.summary.providerStrictGameVersionBindingEvidence, 67);
    for (const item of audit.claim.candidates) {
        assert.ok(item.transitionEvidence.snapshotCount > 0, item.id);
        assert.equal(item.transitionEvidence.strictGameVersionBindingEvidence, true, item.id);
        for (const snapshot of item.transitionEvidence.snapshots) {
            for (const record of snapshot.providerRecords) {
                for (const side of ["before", "after"]) {
                    const evidence = record[side];
                    assert.equal(evidence.status, "integrityVerified", `${item.id}:${side}`);
                    assert.equal(evidence.metadataDigestMatches, true, `${item.id}:${side}`);
                    assert.equal(evidence.rawGitBlobMatches, true, `${item.id}:${side}`);
                    assert.equal(evidence.packageManifest.bytesMatch, true, `${item.id}:${side}`);
                    assert.equal(evidence.packageManifest.gitBlobMatches, true, `${item.id}:${side}`);
                    assert.equal(evidence.packageManifest.versionMatches, true, `${item.id}:${side}`);
                    assert.equal(evidence.strictGameVersionBindingEvidence, true, `${item.id}:${side}`);
                }
            }
        }
    }
});

test("validated localized bridge is distinguished from an independent semantic claim", () => {
    const audit = auditor.buildAudit();
    assert.equal(audit.summary.providerEvidenceAvailable, 67);
    assert.equal(audit.summary.unresolvedFieldMappings, 4);
    assert.equal(audit.summary.providerFieldMappingStatus.exactLocalizedNameProviderKey, 63);
    assert.equal(audit.summary.providerFieldMappingStatus.ambiguousVariant, 4);
    for (const item of audit.claim.candidates) {
        if (item.entityId === "10000005" || item.entityId === "10000007") {
            assert.equal(item.fieldMapping.safeExactMapping, false, item.id);
            assert.equal(item.fieldMapping.status, "ambiguousVariant", item.id);
        } else {
            assert.equal(item.fieldMapping.safeExactMapping, true, item.id);
            assert.equal(item.fieldMapping.status, "exactLocalizedNameProviderKey", item.id);
            assert.equal(item.fieldMapping.localizedBridge.status, "exactLocalizedNameProviderKey", item.id);
        }
        assert.equal(item.fieldMapping.ordinalRelationObserved?.acceptedAsProof ?? false, false, item.id);
    }
});

test("catalog-backed mapper coverage resolves the four non-Traveler consumer entities without changing semantic gates", () => {
    const audit = auditor.buildAudit();
    const mappedEntityIds = ["10000112", "10000115", "10000121", "10000132"];
    const mappedCandidates = audit.claim.candidates.filter((item) => mappedEntityIds.includes(item.entityId));
    assert.equal(mappedCandidates.length, 12);
    assert.ok(mappedCandidates.every((item) => item.consumerMapping.status === "mapped"));
    assert.deepEqual(audit.summary.consumerMappingStatus, { ambiguousVariant: 4, mapped: 63 });
    assert.equal(audit.summary.semanticDecisionRequired, 67);
    assert.equal(audit.summary.certificateEligible, 0);
    assert.equal(audit.summary.canonicalPromotionEligible, 0);
    assert.equal(audit.gate.canIssueEligibilityCertificate, false);
    assert.equal(audit.gate.canPromoteCanonical, false);
});

test("Traveler 10000005 and 10000007 remain explicit variant ambiguity without ordinal mapping", () => {
    const audit = auditor.buildAudit();
    for (const entityId of ["10000005", "10000007"]) {
        const rows = audit.claim.candidates.filter((item) => item.entityId === entityId);
        assert.equal(rows.length, 2);
        for (const item of rows) {
            assert.equal(item.transitionEvidence.providerEvidenceStatus, "availableButVariantAmbiguous", item.id);
            assert.equal(item.fieldMapping.status, "ambiguousVariant", item.id);
            assert.equal(item.workPacket.status, "travelerVariantIdentityUnresolved", item.id);
            assert.equal(item.workPacket.travelerVariantAmbiguous, true, item.id);
            assert.equal(item.fieldMapping.safeExactMapping, false, item.id);
            assert.equal(item.classification.inferencePerformed, false, item.id);
        }
    }
});

test("missing local raw source fails closed without inventing an EffectSpec", () => {
    const inputs = clone(auditor.loadInputs());
    const id = "talent-gap-spec:10000003:passive_1";
    const sourceId = inputs.talentGap.specs[id].sourceRefs[0];
    delete inputs.talentGap.sourceRecords[sourceId];
    const audit = auditor.buildAudit({ inputs });
    const item = candidate(audit, id);
    assert.equal(audit.status, "failed");
    assert.ok(audit.errors.includes("localSourceEvidenceInvalid"));
    assert.equal(item.localEvidence.source.status, "missing");
    assert.equal(item.localEvidence.spec.effect.allFieldsUnknown, true);
    assert.equal(item.workPacket.noInference, true);
    assert.equal(item.certificate.strictEligible, false);
    assert.equal(item.canonical.promotionEligible, false);
});

test("tampered local raw text is detected by both declared and current-source digest checks", () => {
    const inputs = clone(auditor.loadInputs());
    const id = "talent-gap-spec:10000003:passive_1";
    const sourceId = inputs.talentGap.specs[id].sourceRefs[0];
    inputs.talentGap.sourceRecords[sourceId].text = "forged local passive";
    const audit = auditor.buildAudit({ inputs });
    const item = candidate(audit, id);
    assert.equal(audit.status, "failed");
    assert.ok(audit.errors.includes("localSourceEvidenceInvalid"));
    assert.equal(item.localEvidence.source.status, "rawDigestMismatch");
    assert.equal(item.localEvidence.source.rawDigestMatches, false);
    assert.equal(item.localEvidence.source.sourceTextMatchesCurrent, false);
});

for (const [label, mutate] of [
    ["gameVersion", (metadata) => { metadata.gameVersion = "6.9"; }],
    ["revision", (metadata) => { metadata.revision = "0".repeat(40); }],
    ["raw Git blob", (metadata) => { metadata.gitBlob = "0".repeat(40); }]
]) {
    test(`forged provider ${label} is not accepted as strict version evidence`, () => {
        const inputs = clone(auditor.loadInputs());
        const { metadata } = firstProviderMetadata(inputs);
        mutate(metadata);
        const audit = auditor.buildAudit({ inputs });
        assert.equal(audit.status, "failed");
        assert.ok(audit.errors.includes("providerVersionBindingInvalid"));
        assert.equal(audit.summary.providerStrictGameVersionBindingEvidence < 67, true);
        assert.equal(audit.gate.canIssueEligibilityCertificate, false);
        assert.equal(audit.gate.canPromoteCanonical, false);
    });
}

test("forged package manifest digest is not accepted as strict gameVersion binding", () => {
    const inputs = clone(auditor.loadInputs());
    const { entry } = firstProviderMetadata(inputs);
    const binding = entry.snapshot.claim.versionBindings.find((item) => item.gameVersion === "7.0");
    binding.package.rawArtifactSha256 = "0".repeat(64);
    const audit = auditor.buildAudit({ inputs });
    assert.equal(audit.status, "failed");
    assert.ok(audit.errors.includes("providerVersionBindingInvalid"));
    assert.equal(audit.gate.canIssueEligibilityCertificate, false);
});

test("rehashed localized bridge evidence is rejected and cannot silently restore field mapping", () => {
    const inputs = clone(auditor.loadInputs());
    const bridge = inputs.localizedFieldCapture.claim.candidateBridges[0];
    bridge.providerFieldKey = "passive99";
    inputs.localizedFieldCapture.fieldDigest = digestStable(inputs.localizedFieldCapture.claim);
    const audit = auditor.buildAudit({ inputs });
    assert.equal(audit.status, "failed");
    assert.ok(audit.errors.includes("localizedFieldCaptureInvalid"));
    const item = candidate(audit, "talent-gap-spec:10000003:passive_1");
    assert.equal(item.fieldMapping.status, "unresolvedLabelBridge");
    assert.equal(item.fieldMapping.safeExactMapping, false);
    assert.equal(item.workPacket.mappingUnresolved, true);
    assert.equal(audit.gate.canIssueEligibilityCertificate, false);
    assert.equal(audit.gate.canPromoteCanonical, false);
});

test("provider binding cache keys include expected version and binding metadata", () => {
    const inputs = auditor.loadInputs();
    const { entry, metadata } = firstProviderMetadata(inputs);
    const binding = entry.snapshot.claim.versionBindings.find((item) => item.gameVersion === "7.0");
    const cache = new Map();
    const valid = auditor.providerRecordEvidence(metadata, "7.0", binding, cache);
    const forgedExpectedVersion = auditor.providerRecordEvidence(metadata, "6.9", binding, cache);
    const forgedMetadata = { ...metadata, revision: "0".repeat(40) };
    const forgedRevision = auditor.providerRecordEvidence(forgedMetadata, "7.0", binding, cache);
    assert.equal(valid.strictGameVersionBindingEvidence, true);
    assert.equal(forgedExpectedVersion.strictGameVersionBindingEvidence, false);
    assert.equal(forgedRevision.strictGameVersionBindingEvidence, false);
    assert.notEqual(valid.strictGameVersionBindingEvidence, forgedExpectedVersion.strictGameVersionBindingEvidence);
    assert.notEqual(valid.strictGameVersionBindingEvidence, forgedRevision.strictGameVersionBindingEvidence);
});

test("queue projection excludes parent lane annotations and remains cycle-safe", () => {
    const inputs = auditor.loadInputs();
    const base = auditor.buildAudit({ inputs });
    const queue = clone(inputs.queue);
    queue.talentGapReconciliation = { fieldDigest: "derived" };
    const task = queue.tasks.find((item) => item.candidateId === base.claim.candidateIds[0]);
    task.talentGapReconciliation = { fieldDigest: "derived" };
    task.behaviorModifierReconciliation = { fieldDigest: "derived" };
    assert.equal(
        auditor.stableJson(auditor.queueInputProjection(inputs.queue)),
        auditor.stableJson(auditor.queueInputProjection(queue))
    );
    const rebuilt = auditor.buildAudit({ inputs, queue });
    assert.equal(auditor.stableJson(rebuilt), auditor.stableJson(base));
});

test("artifact, report, validator, and schema are deterministic and fail closed", () => {
    const expected = auditor.buildAudit();
    const artifact = readJson("games/genshin/data/v2/characters/talent-gap-lane-audit.json");
    const report = readJson("reports/genshin-talent-gap-lane-audit.json");
    assert.deepEqual(artifact, expected);
    assert.deepEqual(report, expected);
    assert.deepEqual(auditor.validateAudit(artifact), { valid: true, reasons: [] });
    const schema = readJson("games/genshin/data/schema/talent-gap-lane-audit.schema.json");
    assert.equal(schema.properties.kind.const, "genshinTalentGapLaneAudit");
    assert.equal(schema.properties.policy.$ref, "#/$defs/policy");
    assert.equal(schema.$defs.policy.properties.metadataBooleansNotEvidence.const, true);
    assert.equal(schema.$defs.policy.properties.ordinalPassiveMapping.const, "forbiddenWithoutSourceOwnedBridge");
    assert.equal(schema.$defs.policy.properties.localizedFieldBridge.const, "exactLocalizedNameToSameProviderEnglishKeyBothRevisions");
    assert.equal(schema.$defs.generatedFrom.properties.localizedFieldCapture.$ref, "#/$defs/fileReference");
    assert.equal(schema.$defs.gate.properties.canPromoteCanonical.const, false);
    assert.match(fs.readFileSync(path.join(root, "reports", "genshin-talent-gap-lane-audit.md"), "utf8"), /ordinal similarity alone is not proof/i);
});

test("validator rejects forged lane digest", () => {
    const forged = auditor.buildAudit();
    forged.fieldDigest = "0".repeat(64);
    const result = auditor.validateAudit(forged, { compareCurrent: false });
    assert.equal(result.valid, false);
    assert.ok(result.reasons.includes("fieldDigestInvalid"));
});
