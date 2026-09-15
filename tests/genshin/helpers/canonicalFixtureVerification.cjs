"use strict";

const crypto = require("node:crypto");
const stateMachine = require("../../../scripts/genshinVerificationStateMachine.cjs");
const { buildReviewBinding } = require("../../../scripts/genshinReviewBinding.cjs");

const ALLOWED_FIXTURE_IDS = new Set([
    "fixture:weapon:damage", "fixture:weapon:conditional", "fixture:artifact:damage", "fixture:talent:damage", "fixture:behavior:duration"
]);
const clone = (value) => JSON.parse(JSON.stringify(value));
const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

function materializeHumanFixtureVerification(records, sourceRecords) {
    const output = clone(records || {});
    Object.values(output).forEach((record) => {
        if (!record?.id || !record?.verification) return;
        if (!ALLOWED_FIXTURE_IDS.has(record.id)) throw new Error(`Non-fixture record refused: ${record.id}`);
        const verification = record.verification;
        if (!verification.reviewedBy || !verification.reviewedAt) throw new Error(`Fixture review metadata missing: ${record.id}`);
        verification.verificationMode = "human";
        verification.machineEvidenceReady = true;
        Object.entries(verification.claims || {}).forEach(([field, claim]) => {
            if (!claim || !["verified", "notApplicable"].includes(claim.status)) return;
            const sourceRefs = [...new Set(claim.sourceRefs?.length ? claim.sourceRefs : record.sourceRefs || [])];
            const bundle = sourceRefs.map((sourceRef) => {
                const source = sourceRecords[sourceRef];
                if (!source?.provider || !source?.independenceGroup || !source?.gameVersion || !source?.integrity?.digest) throw new Error(`Fixture source incomplete: ${sourceRef}`);
                return { sourceRef, provider: source.provider, independenceGroup: source.independenceGroup, revision: source.revision || source.commit || `digest:${source.integrity.digest}`, fileDigest: source.integrity.digest, gameVersion: source.gameVersion };
            });
            claim.sourceRefs = sourceRefs;
            const kind = stateMachine.inferClaimKind(field, claim);
            claim.claimKind = kind;
            if (["internalRuntimeRoute", "mappingMaterialization", "derivedDeterministic"].includes(kind)) {
                const codeProvenance = { deterministic: true, path: "tests/genshin/helpers/canonicalFixtureVerification.cjs", locator: `fixture:${record.id}:${field}`, digest: sha256(`${record.id}:${field}`) };
                const focusedTests = [{ id: "canonical-fixture-verification", status: "passed" }];
                claim.machineEvidence = { ready: true, blockedReasons: [], codeProvenance, focusedTests, ...(kind === "mappingMaterialization" ? { sourceInputsVerified: true } : {}) };
                return;
            }
            if (kind === "notApplicable") {
                claim.machineEvidence = { ready: true, blockedReasons: [], applicabilityDetermined: true };
                return;
            }
            const comparisonDigest = sha256(JSON.stringify({ subjectId: record.id, field, sourceRefs }));
            const attestationId = `${record.id}:${field}:fixture-human:attestation`;
            claim.evidence = bundle.map((source) => ({ ...source, gameVersionVerified: true, supportsClaimValue: true }));
            claim.comparison = { status: "match" };
            claim.machineEvidence = { ready: true, blockedReasons: [], comparison: "match", evidenceRefs: sourceRefs };
            claim.verificationAttestation = {
                schemaVersion: 1, attestationId, verificationMode: "human", type: "humanReview", subjectId: record.id, claimField: field,
                attestedAt: verification.reviewedAt, actor: { kind: "human", id: verification.reviewedBy }, decision: "approve",
                engine: { name: "canonicalFixtureVerification.cjs", version: "1" }, policy: { id: "fixture-only", version: "1", digest: sha256("fixture-only/1") },
                sourceBundle: bundle, requiredFields: [field], normalization: { id: "fixture-identity", version: "1", digest: sha256("fixture-identity/1") },
                exactRevisions: bundle.map((source) => ({ sourceRef: source.sourceRef, revision: source.revision, fileDigest: source.fileDigest })),
                gameVersion: { value: bundle[0].gameVersion, sourceRefs }, comparison: { status: "match", digests: { [field]: comparisonDigest } }, semanticStatus: "match", scopeStatus: "match"
            };
            claim.eligibilityCertificate = {
                schemaVersion: 1, certificateId: `${record.id}:${field}:fixture-human:certificate`, status: "eligible", subjectId: record.id,
                claimField: field, verificationMode: "human", attestationId, comparisonDigest, issuedAt: verification.reviewedAt,
                scope: { subjectId: record.id, claimField: field }
            };
        });
        // The human-review contract binds the final review subject, not the
        // pre-materialization fixture.  Add it after claim evidence and
        // attestations have been materialized so every loader/E2E fixture is
        // validated against the same subject digest as production.
        verification.reviewBinding = buildReviewBinding(record, `fixture:${record.id}`);
    });
    return output;
}

module.exports = { materializeHumanFixtureVerification };
