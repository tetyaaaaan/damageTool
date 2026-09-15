"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { audit: auditUpstreamVersion } = require("./genshinUpstreamVersionAudit.cjs");
const { collectCandidates } = require("./genshinTerminalStateAudit.cjs");
const {
    digestStable: digest,
    validateOfficialChangeIndex,
    validatePartialDiscovery,
    validateTargetDatasetEvidence
} = require("./genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(repositoryRoot, relative), "utf8"));
const transitionOutput = path.join(dataRoot, "v2", "version-transition.json");

function optionalJson(relative) {
    const file = path.join(repositoryRoot, relative);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}
function candidateInventoryDigest(candidates) {
    return digest((candidates || []).map((entry) => String(entry.id)).sort());
}

function validateEntityDiff(entityDiff, { fromGameVersion, toGameVersion, candidates }) {
    const reasons = [];
    const validSha256 = (value) => /^[a-f0-9]{64}$/.test(String(value || ""));
    const candidateIds = (candidates || []).map((entry) => String(entry.id)).sort();
    const claim = entityDiff?.claim;
    if (entityDiff?.schemaVersion !== 1) reasons.push("schemaVersionInvalid");
    if (entityDiff?.kind !== "genshinVersionEntityDiff") reasons.push("kindInvalid");
    if (entityDiff?.fieldDigestAlgorithm !== "sha256-stable-json-v1"
        || !validSha256(entityDiff?.fieldDigest)
        || entityDiff?.fieldDigest !== digest(claim)) reasons.push("fieldDigestInvalid");
    if (claim?.fromGameVersion !== fromGameVersion || claim?.toGameVersion !== toGameVersion) {
        reasons.push("transitionVersionMismatch");
    }
    const snapshots = Array.isArray(claim?.sourceSnapshots) ? claim.sourceSnapshots : [];
    if (snapshots.length < 2) reasons.push("sourceSnapshotsIncomplete");
    [fromGameVersion, toGameVersion].forEach((gameVersion) => {
        const snapshot = snapshots.find((item) => item?.gameVersion === gameVersion);
        if (!snapshot) {
            reasons.push(`sourceSnapshotMissing:${gameVersion}`);
            return;
        }
        if (!snapshot.provider || !snapshot.sourceFamily || !snapshot.repository || !snapshot.revision) {
            reasons.push(`sourceSnapshotIdentityMissing:${gameVersion}`);
        }
        if (!validSha256(snapshot.rawArtifactDigest) || !validSha256(snapshot.datasetDigest)) {
            reasons.push(`sourceSnapshotDigestMissing:${gameVersion}`);
        }
        const binding = snapshot.gameVersionBinding;
        if (binding?.status !== "strictlyBound"
            || binding?.gameVersion !== gameVersion
            || !binding?.evidenceLocator
            || !validSha256(binding?.evidenceDigest)) {
            reasons.push(`strictGameVersionBindingMissing:${gameVersion}`);
        }
    });
    const coverage = claim?.coverage || {};
    if (coverage.status !== "complete") reasons.push("coverageNotComplete");
    if (coverage.candidateInventoryDigest !== candidateInventoryDigest(candidates)) reasons.push("candidateInventoryDigestMismatch");
    if (coverage.candidateCount !== candidateIds.length) reasons.push("candidateCountMismatch");
    const changed = Array.isArray(coverage.changedCandidateIds) ? coverage.changedCandidateIds.map(String) : [];
    const unchanged = Array.isArray(coverage.unchangedCandidateIds) ? coverage.unchangedCandidateIds.map(String) : [];
    const unmapped = Array.isArray(coverage.unmappedCandidateIds) ? coverage.unmappedCandidateIds.map(String) : [];
    if (unmapped.length !== 0) reasons.push("unmappedCandidatesRemain");
    if (new Set([...changed, ...unchanged, ...unmapped]).size !== changed.length + unchanged.length + unmapped.length) {
        reasons.push("candidateCoverageOverlapsOrDuplicates");
    }
    const covered = [...new Set([...changed, ...unchanged, ...unmapped])].sort();
    if (JSON.stringify(covered) !== JSON.stringify(candidateIds)) reasons.push("candidateCoverageIncomplete");
    return {
        valid: reasons.length === 0,
        reasons,
        candidateInventoryDigest: candidateInventoryDigest(candidates),
        changedCandidateIds: changed.sort(),
        unchangedCandidateIds: unchanged.sort(),
        unmappedCandidateIds: unmapped.sort()
    };
}

function buildImpact() {
    const upstream = auditUpstreamVersion({ dataRoot });
    const upstreamHead = readJson("games/genshin/data/v2/upstream-version-head.json");
    const candidates = collectCandidates();
    const certificates = readJson("games/genshin/data/v2/eligibility-certificates.json");
    const runtime = readJson("games/genshin/data/v2/runtime/canonical-runtime.json");
    const reactionPilot = readJson("games/genshin/data/v2/review-pilots/weapon-12516-reaction.json");
    const existingTransition = optionalJson("games/genshin/data/v2/version-transition.json");
    const transitionPending = upstream.status === "upstreamVersionAvailable";
    const transitionFromVersion = existingTransition?.toGameVersion === upstream.observedLiveVersion
        && existingTransition?.fromGameVersion !== existingTransition?.toGameVersion
        ? existingTransition.fromGameVersion
        : upstream.acceptedTargetVersion;
    const transitionDirectory = `games/genshin/data/v2/version-transitions/${transitionFromVersion || "unbound"}-to-${upstream.observedLiveVersion || "unbound"}`;
    const targetDatasetEvidencePath = `${transitionDirectory}/target-dataset-evidence.json`;
    const targetDatasetEvidence = optionalJson(targetDatasetEvidencePath);
    const targetDatasetValidation = validateTargetDatasetEvidence(targetDatasetEvidence, {
        toGameVersion: upstream.observedLiveVersion,
        repositoryRoot
    });
    const strictTargetDatasetAvailable = targetDatasetValidation.valid && targetDatasetValidation.complete;
    const entityDiffPath = `${transitionDirectory}/entity-diff.json`;
    const entityDiff = optionalJson(entityDiffPath);
    const entityDiffValidation = validateEntityDiff(entityDiff, {
        fromGameVersion: transitionFromVersion,
        toGameVersion: upstream.observedLiveVersion,
        candidates
    });
    const entityDiffAvailable = entityDiffValidation.valid;
    const officialChangeIndexPath = `${transitionDirectory}/official-change-index.json`;
    const officialChangeIndex = optionalJson(officialChangeIndexPath);
    const officialChangeIndexValidation = validateOfficialChangeIndex(
        officialChangeIndex,
        upstreamHead,
        upstream.observedLiveVersion
    );
    const officialChangeIndexValid = officialChangeIndexValidation.valid;
    const partialDiscoveryPath = `${transitionDirectory}/partial-discovery.json`;
    const partialDiscovery = optionalJson(partialDiscoveryPath);
    const partialDiscoveryValidation = validatePartialDiscovery(partialDiscovery, {
        fromGameVersion: transitionFromVersion,
        toGameVersion: upstream.observedLiveVersion,
        candidateIds: candidates.map((entry) => entry.id)
    });
    const partialDiscoveryInputsFresh = partialDiscoveryValidation.valid
        && Object.values(partialDiscovery?.generatedFrom || {}).every((input) => {
            const file = input?.path ? path.join(repositoryRoot, input.path) : null;
            return file && fs.existsSync(file)
                && crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") === input.sha256;
        });
    const partialDiscoveryValid = partialDiscoveryValidation.valid && partialDiscoveryInputsFresh;
    const knownChangedCandidateIds = new Set(reactionPilot.reviewPacket?.fieldComparison?.some((item) => item.status === "versionTransition")
        ? [reactionPilot.target.candidateId]
        : []);
    const knownChangedEntityIds = new Set();
    if (officialChangeIndexValid) {
        officialChangeIndex.claim.changes.forEach((change) => {
            (change.candidateIds || []).forEach((candidateId) => knownChangedCandidateIds.add(candidateId));
            if (change.entityKind === "character") knownChangedEntityIds.add(change.entityId);
        });
        candidates.forEach((entry) => {
            if (knownChangedEntityIds.has(String(entry.candidate?.entity?.id || ""))) knownChangedCandidateIds.add(entry.id);
        });
    }
    if (partialDiscoveryValid) {
        knownChangedCandidateIds.clear();
        partialDiscovery.claim.candidateMappings.forEach((mapping) => knownChangedCandidateIds.add(mapping.candidateId));
    }
    const knownChangedCandidateIdList = [...knownChangedCandidateIds].sort();
    const retainedCanonicalIds = Object.keys(runtime.modifiers || {}).sort();
    const allClaimsTargetCurrent = certificates.certificates.length > 0
        && certificates.certificates.every((certificate) => certificate.targetGameVersion === upstream.observedLiveVersion);
    const runtimeTargetRegenerated = runtime.versionBinding?.gameVersion === upstream.observedLiveVersion;
    const consumerVerificationPath = `${transitionDirectory}/consumer-verification.json`;
    const consumerVerification = optionalJson(consumerVerificationPath);
    const consumersVerified = Boolean(consumerVerification
        && consumerVerification.kind === "genshinVersionTransitionConsumerVerification"
        && consumerVerification.fromGameVersion === transitionFromVersion
        && consumerVerification.toGameVersion === upstream.observedLiveVersion
        && consumerVerification.status === "passed"
        && /^[a-f0-9]{64}$/.test(consumerVerification.runtimeDigest || "")
        && Array.isArray(consumerVerification.testCommands)
        && consumerVerification.testCommands.length > 0);
    const reopenEligible = upstream.status === "current"
        && strictTargetDatasetAvailable
        && entityDiffAvailable
        && allClaimsTargetCurrent
        && runtimeTargetRegenerated
        && consumersVerified;
    const runtimeActive = runtime.versionAvailability?.activeForProduction === true;
    const stages = {
        officialHeadDetected: { status: upstream.evidenceValid ? "complete" : "blocked", evidenceRef: "v2/upstream-version-head.json" },
        strictTargetDataset: { status: strictTargetDatasetAvailable ? "complete" : "pending", requiredGameVersion: upstream.observedLiveVersion },
        entityDiff: {
            status: entityDiffAvailable ? "complete" : "pending",
            artifact: entityDiffPath,
            validationReasons: entityDiffValidation.reasons,
            candidateInventoryDigest: entityDiffValidation.candidateInventoryDigest
        },
        affectedClaimsIdentified: {
            status: transitionPending && !entityDiffAvailable ? "conservativeComplete" : entityDiffAvailable ? "complete" : "notRequired",
            coverage: transitionPending && !entityDiffAvailable ? "allCandidatesFailClosed" : "entityDiffMapped"
        },
        claimEvidenceRevalidated: { status: allClaimsTargetCurrent ? "complete" : "pending" },
        certificatesRegenerated: { status: allClaimsTargetCurrent ? "complete" : "pending" },
        runtimeRegenerated: { status: runtimeTargetRegenerated ? "complete" : "pending" },
        consumersVerified: { status: consumersVerified ? "complete" : "pending", artifact: consumerVerificationPath },
        gateReopened: { status: reopenEligible && runtimeActive ? "complete" : "pending" }
    };
    const transitionState = stages.gateReopened.status === "complete" ? "current"
        : !upstream.evidenceValid ? "officialHeadInvalid"
            : !strictTargetDatasetAvailable ? targetDatasetValidation.valid ? "awaitingTargetDatasetCoverage" : "awaitingTargetDataset"
                : !entityDiffAvailable ? "awaitingEntityDiff"
                    : "revalidationInProgress";
    return {
        schemaVersion: 1,
        kind: "genshinVersionImpactAudit",
        status: transitionPending ? "transitionEvidenceMissing" : "current",
        transition: {
            fromGameVersion: transitionFromVersion,
            toGameVersion: upstream.observedLiveVersion,
            officialHeadEvidenceValid: upstream.evidenceValid,
            strictTargetDatasetAvailable,
            entityDiffAvailable,
            targetDatasetEvidence: {
                artifact: targetDatasetEvidencePath,
                valid: targetDatasetValidation.valid,
                complete: targetDatasetValidation.complete,
                validationReasons: targetDatasetValidation.reasons,
                materializedCandidateCount: targetDatasetValidation.valid
                    ? targetDatasetEvidence.claim.coverage.materializedCandidateCount
                    : 0,
                gateEligible: strictTargetDatasetAvailable
            },
            sourceSearch: {
                artifact: `${transitionDirectory}/source-search.json`,
                strictTargetDatasetFound: optionalJson(`${transitionDirectory}/source-search.json`)?.strictTargetDatasetFound === true,
                searchExhausted: optionalJson(`${transitionDirectory}/source-search.json`)?.searchExhausted === true
            },
            officialChangeIndex: {
                artifact: officialChangeIndexPath,
                valid: officialChangeIndexValid,
                validationReasons: officialChangeIndexValidation.reasons,
                affectedEntityIds: [...knownChangedEntityIds].sort()
            },
            partialDiscovery: {
                artifact: partialDiscoveryPath,
                valid: partialDiscoveryValid,
                validationReasons: [
                    ...partialDiscoveryValidation.reasons,
                    ...(partialDiscoveryValidation.valid && !partialDiscoveryInputsFresh ? ["generatedInputsStale"] : [])
                ],
                candidateCount: partialDiscoveryValid ? partialDiscovery.claim.candidateMappings.length : 0,
                gateEligible: false
            },
            state: transitionState,
            stages
        },
        productionGate: {
            scope: "versionBoundCanonicalOverlayOnly",
            canonicalOverlayActive: reopenEligible && runtimeActive,
            reopenEligible,
            legacyCalculationActive: true,
            historicalCanonical: {
                verifiedGameVersion: runtime.versionBinding?.gameVersion || null,
                status: transitionPending ? "historicalVerifiedPendingRevalidation" : "current",
                retainedIds: retainedCanonicalIds
            }
        },
        impactMapping: {
            status: transitionPending ? "failClosedAllCandidates" : "notRequired",
            reason: transitionPending
                ? "No strict target-version dataset/entity diff exists, so absence from a change list cannot prove a candidate is unchanged."
                : null,
            potentiallyAffectedCandidates: transitionPending ? candidates.length : 0,
            knownChangedCandidateIds: knownChangedCandidateIdList,
            unknownCoverageCandidateCount: transitionPending ? candidates.length - knownChangedCandidateIdList.length : 0
        },
        invalidation: {
            certificateClaimsRequiringTargetVersionRevalidation: transitionPending ? certificates.certificates.length : 0,
            productionCanonicalRecordsRequiringTargetVersionRevalidation: transitionPending ? Object.keys(runtime.modifiers || {}).length : 0,
            automaticPromotionAllowed: false
        },
        nextSteps: transitionPending ? [
            targetDatasetValidation.valid
                ? "Expand the validated target-version provider snapshot from candidate-scoped materialization to complete repository-candidate coverage."
                : "Acquire an exact-revision provider dataset manifest explicitly bound to the observed live version.",
            "Materialize the target-version raw datasets and compute entity-level diffs.",
            "Map each changed or unmapped entity to candidate×claim IDs; unknown mappings remain invalidated.",
            "Recompute source/raw/field digests, certificates, Runtime, consumer routes, and regression evidence before accepting a new baseline."
        ] : []
    };
}

function markdown(report) {
    return [
        "# Genshin version impact audit", "",
        `Status: **${report.status}**`, "",
        `Transition: **${report.transition.fromGameVersion || "unbound"} → ${report.transition.toGameVersion || "unbound"}**`, "",
        `Potentially affected candidates: **${report.impactMapping.potentiallyAffectedCandidates}**`, "",
        `Known changed candidates: **${report.impactMapping.knownChangedCandidateIds.join(", ") || "none"}**`, "",
        `Certificates requiring target-version revalidation: **${report.invalidation.certificateClaimsRequiringTargetVersionRevalidation}**`, "",
        ...report.nextSteps.map((item) => `- ${item}`), ""
    ].join("\n");
}

function writeImpact() {
    const report = buildImpact();
    fs.writeFileSync(transitionOutput, `${JSON.stringify({
        schemaVersion: 1,
        kind: "genshinVersionTransition",
        transitionId: `genshin:${report.transition.fromGameVersion || "unbound"}->${report.transition.toGameVersion || "unbound"}`,
        ...report.transition,
        productionGate: report.productionGate,
        reopenCondition: "All stages through consumersVerified must be complete and accepted/live versions must match."
    }, null, 2)}\n`, "utf8");
    fs.writeFileSync(path.join(repositoryRoot, "reports", "genshin-version-impact.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    fs.writeFileSync(path.join(repositoryRoot, "reports", "genshin-version-impact.md"), markdown(report), "utf8");
    return report;
}

if (require.main === module) process.stdout.write(`${JSON.stringify(writeImpact(), null, 2)}\n`);

module.exports = {
    buildImpact,
    candidateInventoryDigest,
    markdown,
    transitionOutput,
    validateEntityDiff,
    writeImpact
};
