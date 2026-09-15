"use strict";

/**
 * Compatibility entry point for the retired dataset×provider-pair certificate
 * generator.
 *
 * Eligibility is now issued only by
 * `genshinClaimEligibilityCertificateGenerate.cjs`, which evaluates a
 * candidate×claim against materialized source-catalog evidence. This module
 * intentionally does not calculate eligibility from policy status, pair gate
 * booleans, block-reason prose, or a human approval. Its pair records are
 * diagnostic/deprecation records only and are never reusable certificates.
 */

const fs = require("node:fs");
const path = require("node:path");
const {
    defaultOutputPath: defaultPairPolicyPath,
    buildNormalizedPolicy
} = require("./genshinProviderPairPolicyNormalize.cjs");
const claimCertificateGenerator = require("./genshinClaimEligibilityCertificateGenerate.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultOutputPath = path.join(
    repositoryRoot,
    "games",
    "genshin",
    "data",
    "v2",
    "eligibility-certificates-legacy-compatibility.json"
);
const GENERATOR_VERSION = "genshinEligibilityCertificateGenerate/2-legacy-compatibility";
const CAPTURED_AT = "2026-08-25T00:00:00+09:00";
const CERTIFICATE_STATUS_ENUM = Object.freeze([
    "reusable",
    "candidateApprovedOnly",
    "evidenceOnlyBlocked",
    "forbiddenCorrelated",
    "unknown",
    "searchExhausted",
    "blocked",
    "deprecated"
]);

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function relativePath(file) {
    return path.relative(repositoryRoot, file).replaceAll(path.sep, "/");
}

/**
 * Produce a diagnostic record for callers that still pass one normalized pair.
 * The raw pair status and gate booleans are retained as context only. They
 * cannot make this record reusable or eligible.
 */
function certificateForPair(pair) {
    return {
        certificateId: `legacy-pair:${pair?.id || "unknown"}`,
        certificateType: "deprecatedDatasetProviderPair",
        dataset: pair?.dataset || null,
        pairId: pair?.id || null,
        status: "deprecated",
        policyStatus: pair?.status || "unknown",
        strictEligible: false,
        canonicalEligibility: false,
        blockedReasons: [
            "legacyPairCertificateDeprecated",
            "candidateClaimCertificateRequired",
            "pairPolicyIsNotEvidence"
        ],
        diagnosticInput: {
            appliesTo: clone(pair?.appliesTo || null),
            scope: clone(pair?.scope || []),
            providerPair: {
                providerA: clone(pair?.providerA || null),
                providerB: clone(pair?.providerB || null)
            },
            policyGateSnapshot: clone(pair?.normalization || null)
        },
        replacement: {
            module: "scripts/genshinClaimEligibilityCertificateGenerate.cjs",
            certificateKind: "genshinClaimEligibilityCertificate",
            scope: "candidate×claim",
            rule: "Only materialized source-catalog evidence can satisfy the strict gate."
        }
    };
}

function buildCertificates({ normalizedPolicy = null, pairPolicyPath = defaultPairPolicyPath } = {}) {
    // Delegate actual certificate construction to the candidate×claim
    // generator. In particular, do not pass pair status or gate snapshots as
    // evidence and do not transform the delegated result into pair claims.
    const delegated = claimCertificateGenerator.buildCertificates();
    const normalized = normalizedPolicy
        || (fs.existsSync(pairPolicyPath) && readJson(pairPolicyPath).kind === "genshinProviderPairPolicy"
            ? readJson(pairPolicyPath)
            : buildNormalizedPolicy());
    const pairReports = (normalized.pairs || []).map(certificateForPair);
    return {
        schemaVersion: 2,
        kind: "genshinLegacyEligibilityCertificateCompatibilityReport",
        generatedBy: {
            name: "genshinEligibilityCertificateGenerate.cjs",
            version: GENERATOR_VERSION,
            capturedAt: CAPTURED_AT
        },
        deprecated: true,
        policy: {
            path: normalized.sourcePolicy?.path || relativePath(pairPolicyPath),
            sha256: normalized.sourcePolicy?.sha256 || null,
            pairPolicyIsDiagnosticOnly: true,
            pairStatusCannotAuthorizeReuse: true,
            pairGateBooleansCannotAuthorizeReuse: true,
            blockReasonProseCannotAuthorizeReuse: true,
            replacement: "genshinClaimEligibilityCertificateGenerate.cjs"
        },
        replacementResult: {
            kind: delegated.kind,
            summary: clone(delegated.summary),
            source: "scripts/genshinClaimEligibilityCertificateGenerate.cjs"
        },
        certificates: pairReports,
        summary: {
            pairCertificateCount: pairReports.length,
            strictEligibleCount: 0,
            canonicalEligibleCount: 0,
            deprecatedCount: pairReports.length,
            replacementCandidateClaimCount: delegated.summary?.candidateClaimCount || 0,
            replacementEligibleCount: delegated.summary?.eligibleCount || 0,
            replacementBlockedCount: delegated.summary?.blockedCount || 0
        }
    };
}

function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeCertificates({
    outputPath = defaultOutputPath,
    normalizedPolicy = null,
    pairPolicyPath = defaultPairPolicyPath
} = {}) {
    const compatibility = buildCertificates({ normalizedPolicy, pairPolicyPath });
    writeJson(outputPath, compatibility);
    return { certificates: compatibility, outputPath, pairPolicyPath };
}

if (require.main === module) {
    const result = writeCertificates();
    process.stdout.write(`${JSON.stringify({
        outputPath: relativePath(result.outputPath),
        ...result.certificates.summary
    }, null, 2)}\n`);
}

module.exports = {
    CERTIFICATE_STATUS_ENUM,
    GENERATOR_VERSION,
    CAPTURED_AT,
    defaultOutputPath,
    defaultPairPolicyPath,
    certificateForPair,
    buildCertificates,
    writeCertificates
};
