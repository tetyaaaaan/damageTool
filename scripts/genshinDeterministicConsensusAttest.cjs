"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const verificationStateMachine = require("./genshinVerificationStateMachine.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(repositoryRoot, "games", "genshin", "data", "v2");
const certificatePath = path.join(dataRoot, "eligibility-certificates.json");
const defaultOutputPath = path.join(dataRoot, "deterministic-attestations.json");
const GENERATOR_VERSION = "genshinDeterministicConsensusAttest/1";
const POLICY = Object.freeze({ id: "genshin-deterministic-consensus", version: "1" });

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const stableValue = (value) => Array.isArray(value)
    ? value.map(stableValue)
    : value && typeof value === "object"
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
        : value;
const stableJson = (value) => JSON.stringify(stableValue(value));
const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const relativePath = (file) => path.relative(repositoryRoot, file).replaceAll(path.sep, "/");

function attestationForCertificate(certificate) {
    if (certificate?.kind !== "genshinClaimEligibilityCertificate" || certificate?.status !== "eligible"
        || certificate?.verificationMode !== "deterministicConsensus" || certificate?.stale !== false
        || certificate?.invalidated !== false || (certificate?.blockedReasons || []).length) return null;
    const field = certificate.field;
    const attestation = {
        schemaVersion: verificationStateMachine.ATTESTATION_SCHEMA_VERSION,
        kind: "genshinDeterministicConsensusAttestation",
        attestationId: `attestation:${certificate.claimId}`,
        verificationMode: "deterministicConsensus",
        type: "deterministicConsensus",
        subjectId: certificate.candidateId,
        claimId: certificate.claimId,
        claimField: field,
        attestedAt: certificate.issuedAt,
        generatedAt: certificate.issuedAt,
        actor: { kind: "machine", id: GENERATOR_VERSION },
        engine: { name: "genshinDeterministicConsensusAttest.cjs", version: GENERATOR_VERSION },
        policy: { ...POLICY, digest: sha256(stableJson(POLICY)) },
        eligibilityCertificateId: certificate.certificateId,
        versionSnapshotId: certificate.versionSnapshotId,
        sourceBundleDigest: certificate.sourceBundleDigest,
        sourceBundle: certificate.sources.map((source) => ({
            sourceRef: source.sourceRef,
            provider: source.provider,
            independenceGroup: source.familyId,
            revision: source.revision,
            fileDigest: source.rawArtifactDigest,
            fieldDigest: source.fieldDigest,
            gameVersion: source.gameVersion
        })),
        requiredFields: [field],
        requiredFieldSetDigest: certificate.requiredFieldCoverage.digest,
        normalization: certificate.normalization,
        exactRevisions: certificate.sources.map((source) => ({
            sourceRef: source.sourceRef,
            revision: source.revision,
            fileDigest: source.rawArtifactDigest
        })),
        gameVersion: { value: certificate.targetGameVersion, sourceRefs: certificate.sources.map((source) => source.sourceRef) },
        comparison: { status: "match", digests: { [field]: certificate.comparison.claimValueDigest } },
        semanticStatus: "match",
        scopeStatus: "match",
        decision: "approve"
    };
    const validation = verificationStateMachine.assessEligibilityCertificate({
        candidate: { id: certificate.candidateId },
        field,
        claim: { id: certificate.claimId },
        verification: { verificationMode: "deterministicConsensus" },
        attestation,
        certificate
    });
    if (!validation.ready) throw new Error(`Eligible certificate failed attestation validation: ${certificate.certificateId}: ${validation.blockedReasons.join(", ")}`);
    return attestation;
}

function buildAttestations({ certificates = readJson(certificatePath) } = {}) {
    const attestations = (certificates.certificates || []).map(attestationForCertificate).filter(Boolean);
    return {
        schemaVersion: 1,
        kind: "genshinDeterministicConsensusAttestationRegistry",
        generatedBy: { name: "genshinDeterministicConsensusAttest.cjs", version: GENERATOR_VERSION },
        authority: { eligibilityCertificates: relativePath(certificatePath), certificateGenerator: certificates.generatedBy || null },
        policy: { humanReviewerMetadataForbidden: true, eligibleCertificateRequired: true, exactMatchOnly: true },
        attestations,
        summary: { eligibleCertificates: attestations.length, attestations: attestations.length }
    };
}

function writeAttestations({ outputPath = defaultOutputPath } = {}) {
    const result = buildAttestations();
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    return { result, outputPath };
}

if (require.main === module) {
    const { result, outputPath } = writeAttestations();
    process.stdout.write(`${JSON.stringify({ outputPath: relativePath(outputPath), ...result.summary }, null, 2)}\n`);
}

module.exports = { GENERATOR_VERSION, POLICY, defaultOutputPath, attestationForCertificate, buildAttestations, writeAttestations };
