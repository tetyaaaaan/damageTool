"use strict";

/**
 * Backend-only version transition lifecycle for the Genshin v2 data contract.
 *
 * A live release notice is discovery evidence, not a data promotion.  This
 * module keeps the accepted baseline immutable while describing an inactive
 * target and the exact work required to revalidate it.  It intentionally does
 * not write a baseline, certificate registry, or Runtime file.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
    buildSnapshot,
    diffSnapshots,
    validateBaseline
} = require("./genshinVersionBaseline.cjs");
const { parseGameVersion, compareGameVersions } = require("./genshinGameVersionPolicy.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const DEFAULT_DATA_ROOT = path.join(repositoryRoot, "games", "genshin", "data");
const DEFAULT_BASELINE_PATH = path.join(DEFAULT_DATA_ROOT, "v2", "version-baseline.json");
const DEFAULT_CERTIFICATE_PATH = path.join(DEFAULT_DATA_ROOT, "v2", "eligibility-certificates.json");
const DEFAULT_RUNTIME_PATH = path.join(DEFAULT_DATA_ROOT, "v2", "runtime", "canonical-runtime.json");
const TRANSITION_SCHEMA_VERSION = 1;
const GENERATOR_VERSION = "genshinVersionTransition/1";

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!isObject(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableJson(value) {
    return JSON.stringify(stableValue(value));
}

function sha256(value) {
    const input = Buffer.isBuffer(value) ? value : typeof value === "string" ? value : stableJson(value);
    return crypto.createHash("sha256").update(input).digest("hex");
}

function digestFile(file) {
    const bytes = fs.readFileSync(file);
    return { sha256: sha256(bytes), bytes: bytes.length };
}

function relativePath(file) {
    return path.relative(repositoryRoot, file).replaceAll(path.sep, "/");
}

function versionOf(value) {
    return value?.targetGameVersion?.gameVersion
        || value?.currentGameVersion?.gameVersion
        || (typeof value?.currentGameVersion === "string" ? value.currentGameVersion : null)
        || null;
}

function snapshotCore(snapshot) {
    if (!isObject(snapshot)) return null;
    const core = { ...snapshot };
    delete core.snapshotId;
    delete core.previousSnapshotId;
    return core;
}

function expectedSnapshotId(snapshot) {
    const version = versionOf(snapshot) || "unbound";
    return `genshin-version:${version}:${sha256(snapshotCore(snapshot))}`;
}

function strictTargetEvidence(snapshot, expectedVersion) {
    const reasons = [];
    if (!isObject(snapshot)) {
        reasons.push("targetSnapshotMissing");
        return { valid: false, reasons };
    }
    if (snapshot.schemaVersion !== 1) reasons.push("targetSnapshotSchemaInvalid");
    if (!["genshinAcceptedVersionBaseline", "genshinTargetVersionSnapshot"].includes(snapshot.kind)) {
        reasons.push("targetSnapshotKindInvalid");
    }
    if (snapshot.targetGameVersion?.status !== "strictlyBound"
        || !parseGameVersion(snapshot.targetGameVersion?.gameVersion)) {
        reasons.push("targetGameVersionNotStrictlyBound");
    }
    if (expectedVersion && snapshot.targetGameVersion?.gameVersion !== expectedVersion) {
        reasons.push("targetGameVersionMismatch");
    }
    if (!/^[a-f0-9]{64}$/.test(snapshot.sourceCatalogDigest || "")) reasons.push("targetSourceCatalogDigestInvalid");
    if (!isObject(snapshot.datasets) || !Object.keys(snapshot.datasets).length) reasons.push("targetDatasetsMissing");
    Object.entries(snapshot.datasets || {}).forEach(([dataset, value]) => {
        if (!isObject(value) || !/^games\/genshin\/data\//.test(value.path || "")
            || !/^[a-f0-9]{64}$/.test(value.digest || "") || !isObject(value.entities)) {
            reasons.push(`targetDatasetInvalid:${dataset}`);
            return;
        }
        Object.entries(value.entities).forEach(([entityId, entityDigest]) => {
            if (!/^[a-f0-9]{64}$/.test(entityDigest || "")) reasons.push(`targetEntityDigestInvalid:${dataset}:${entityId}`);
        });
    });
    if (typeof snapshot.snapshotId !== "string" || snapshot.snapshotId !== expectedSnapshotId(snapshot)) {
        // Existing version-baseline snapshots use exactly this deterministic
        // id.  A supplied target must be content-addressed as well.
        reasons.push("targetSnapshotIdInvalid");
    }
    const sourceRevisions = snapshot.targetGameVersion?.sources || [];
    if (!Array.isArray(sourceRevisions) || !sourceRevisions.length) reasons.push("targetSourceRevisionMissing");
    sourceRevisions.forEach((source, index) => {
        if (!isObject(source) || typeof source.sourceId !== "string" || typeof source.revision !== "string"
            || source.gameVersion !== snapshot.targetGameVersion?.gameVersion) {
            reasons.push(`targetSourceRevisionInvalid:${index}`);
        }
    });
    return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}

function loadTargetSnapshot({ targetSnapshot, targetSnapshotPath, targetDataRoot, expectedVersion } = {}) {
    let snapshot = targetSnapshot || null;
    let source = null;
    if (!snapshot && targetSnapshotPath && fs.existsSync(targetSnapshotPath)) {
        snapshot = readJson(targetSnapshotPath);
        source = relativePath(targetSnapshotPath);
    }
    if (!snapshot && targetDataRoot && fs.existsSync(path.join(targetDataRoot, "v2", "source-catalog.json"))) {
        snapshot = buildSnapshot({ dataRoot: targetDataRoot });
        source = relativePath(targetDataRoot);
    }
    if (!snapshot) return { snapshot: null, source: null, evidence: strictTargetEvidence(null, expectedVersion) };
    return { snapshot, source, evidence: strictTargetEvidence(snapshot, expectedVersion) };
}

function candidateIdentifiers(candidate = {}) {
    const ids = new Set();
    const add = (value) => {
        if (value === null || value === undefined || value === "") return;
        ids.add(String(value));
    };
    add(candidate.id);
    add(candidate.entity?.id);
    add(candidate.destination?.entityId);
    add(candidate.entityId);
    add(candidate.weaponId);
    add(candidate.artifactId);
    add(candidate.characterId);
    add(candidate.subjectId);
    add(candidate.entity?.entityId);
    return [...ids];
}

function normalizeCandidate(entry) {
    if (!isObject(entry)) return null;
    const candidate = entry.candidate && isObject(entry.candidate) ? entry.candidate : entry;
    const id = String(entry.id || candidate.id || "");
    if (!id) return null;
    return {
        id,
        dataset: entry.dataset || candidate.dataset || null,
        layer: entry.layer || candidate.layer || null,
        candidate,
        identifiers: candidateIdentifiers({ id, ...candidate })
    };
}

function normalizeCandidates(candidates) {
    if (Array.isArray(candidates)) return candidates.map(normalizeCandidate).filter(Boolean);
    if (isObject(candidates)) return Object.entries(candidates).map(([id, candidate]) => normalizeCandidate({ id, candidate })).filter(Boolean);
    return [];
}

function candidateMatchesDataset(candidate, dataset) {
    const name = String(dataset || "").toLowerCase();
    const category = String(candidate.dataset || candidate.layer || "").toLowerCase();
    if (name.includes("weapon")) return category.includes("weapon");
    if (name.includes("artifact")) return category.includes("artifact");
    if (name.includes("character") || name.includes("talent") || name.includes("constellation") || name.includes("base-stats")) {
        return category.includes("behavior") || category.includes("talent") || category.includes("character");
    }
    if (name.startsWith("calc/") || name.includes("reaction") || name.includes("attack-mode")) return true;
    return category === name;
}

function buildCandidateClaimIndex({ candidates = [], certificates = [] } = {}) {
    const normalizedCandidates = normalizeCandidates(candidates);
    const candidateById = new Map(normalizedCandidates.map((candidate) => [candidate.id, candidate]));
    const claims = (Array.isArray(certificates) ? certificates : []).filter(isObject).map((certificate) => {
        const candidate = candidateById.get(String(certificate.candidateId || "")) || null;
        return {
            candidateId: certificate.candidateId || candidate?.id || null,
            claimId: certificate.claimId || certificate.certificateId || null,
            field: certificate.field || null,
            dataset: certificate.dataset || candidate?.dataset || null,
            candidate,
            certificate
        };
    });
    const claimsByCandidate = new Map();
    claims.forEach((claim) => {
        const id = String(claim.candidateId || "");
        if (!id) return;
        const list = claimsByCandidate.get(id) || [];
        list.push(claim);
        claimsByCandidate.set(id, list);
    });
    return { candidates: normalizedCandidates, candidateById, claims, claimsByCandidate };
}

function mapChangedEntitiesToClaims(changes, index) {
    const claims = Array.isArray(index?.claims) ? index.claims : [];
    const affected = new Map();
    const unmapped = [];
    const changed = Array.isArray(changes) ? changes.filter((change) => change?.dataset && change.entityId !== undefined) : [];
    changed.forEach((change) => {
        const matchingCandidates = (index?.candidates || []).filter((candidate) => {
            if (!candidateMatchesDataset(candidate, change.dataset)) return false;
            return candidate.identifiers.includes(String(change.entityId));
        });
        const matchingClaims = claims.filter((claim) => matchingCandidates.some((candidate) => candidate.id === claim.candidateId));
        if (!matchingCandidates.length || !matchingClaims.length) {
            unmapped.push({ ...change, reason: !matchingCandidates.length ? "candidateUnmapped" : "claimUnmapped" });
            return;
        }
        matchingClaims.forEach((claim) => {
            const key = `${claim.candidateId}:${claim.claimId}`;
            const list = affected.get(key) || [];
            list.push(change);
            affected.set(key, list);
        });
    });
    return {
        affectedClaims: [...affected.entries()].map(([key, changesForClaim]) => {
            const [candidateId, claimId] = key.split(":");
            return { candidateId, claimId, changes: changesForClaim };
        }),
        unmappedChanges: unmapped
    };
}

function assessCertificateRevalidation(registry, { targetVersion, targetSnapshotId, transitionRequired = true } = {}) {
    const certificates = Array.isArray(registry?.certificates) ? registry.certificates : [];
    const claims = certificates.map((certificate) => {
        const targetBound = !transitionRequired || (
            certificate.targetGameVersion === targetVersion
            && certificate.currentGameVersion === targetVersion
            && certificate.versionSnapshotId === targetSnapshotId
            && certificate.stale === false
            && certificate.invalidated === false
        );
        const reasons = [];
        if (transitionRequired && certificate.targetGameVersion !== targetVersion) reasons.push("targetGameVersionMismatch");
        if (transitionRequired && certificate.currentGameVersion !== targetVersion) reasons.push("currentGameVersionMismatch");
        if (transitionRequired && certificate.versionSnapshotId !== targetSnapshotId) reasons.push("versionSnapshotMismatch");
        if (certificate.stale !== false) reasons.push("certificateStale");
        if (certificate.invalidated !== false) reasons.push("certificateInvalidated");
        return {
            certificateId: certificate.certificateId || null,
            candidateId: certificate.candidateId || null,
            claimId: certificate.claimId || null,
            field: certificate.field || null,
            priorStatus: certificate.status || "unknown",
            targetBound,
            revalidationStatus: targetBound ? "targetBound" : "revalidationRequired",
            reasons: [...new Set(reasons)]
        };
    });
    const staleClaims = claims.filter((claim) => !claim.targetBound);
    const targetBoundClaims = claims.filter((claim) => claim.targetBound);
    const eligibleTargetClaims = claims.filter((claim) => claim.targetBound && claim.priorStatus === "eligible");
    return {
        status: staleClaims.length ? "revalidationRequired" : "targetBound",
        certificateCount: claims.length,
        targetBoundClaimCount: targetBoundClaims.length,
        staleClaimCount: staleClaims.length,
        eligibleTargetClaimCount: eligibleTargetClaims.length,
        claims
    };
}

function assessRuntimeRevalidation(runtime, { targetVersion, targetSnapshotId, transitionRequired = true } = {}) {
    const binding = runtime?.versionBinding || null;
    const targetBound = !transitionRequired || Boolean(
        binding?.status === "strictlyBound"
        && binding.gameVersion === targetVersion
        && binding.acceptedSnapshotId === targetSnapshotId
    );
    const reasons = [];
    if (!binding) reasons.push("runtimeVersionBindingMissing");
    if (transitionRequired && binding?.gameVersion !== targetVersion) reasons.push("runtimeGameVersionMismatch");
    if (transitionRequired && binding?.acceptedSnapshotId !== targetSnapshotId) reasons.push("runtimeSnapshotMismatch");
    if (binding?.status !== "strictlyBound") reasons.push("runtimeVersionBindingNotStrict");
    const modifierIds = Object.keys(runtime?.modifiers || {});
    return {
        status: targetBound ? "targetBound" : "revalidationRequired",
        targetBound,
        modifierCount: modifierIds.length,
        modifierIds,
        reasons: [...new Set(reasons)]
    };
}

function buildVersionTransition({
    dataRoot = DEFAULT_DATA_ROOT,
    baselinePath = path.join(dataRoot, "v2", "version-baseline.json"),
    upstream = null,
    targetSnapshot = null,
    targetSnapshotPath = null,
    targetDataRoot = null,
    certificates = null,
    certificatesPath = path.join(dataRoot, "v2", "eligibility-certificates.json"),
    runtime = null,
    runtimePath = path.join(dataRoot, "v2", "runtime", "canonical-runtime.json"),
    candidates = [],
    now = null
} = {}) {
    const baseline = fs.existsSync(baselinePath) ? readJson(baselinePath) : null;
    const baselineValidation = validateBaseline(baseline);
    const upstreamAudit = upstream || require("./genshinUpstreamVersionAudit.cjs").audit({ dataRoot });
    const acceptedVersion = baseline?.targetGameVersion?.gameVersion || null;
    const observedVersion = upstreamAudit?.observedLiveVersion || null;
    const comparison = acceptedVersion && observedVersion ? compareGameVersions(acceptedVersion, observedVersion) : null;
    const transitionRequired = Boolean(upstreamAudit?.evidenceValid && comparison !== null && comparison !== 0);
    const target = loadTargetSnapshot({ targetSnapshot, targetSnapshotPath, targetDataRoot, expectedVersion: observedVersion });
    const targetEvidenceReady = Boolean(transitionRequired && target.evidence.valid);
    const changes = targetEvidenceReady ? diffSnapshots(baseline, target.snapshot) : [];
    const registry = certificates || (fs.existsSync(certificatesPath) ? readJson(certificatesPath) : null);
    const runtimeValue = runtime || (fs.existsSync(runtimePath) ? readJson(runtimePath) : null);
    const index = buildCandidateClaimIndex({ candidates, certificates: registry?.certificates || [] });
    const mapping = mapChangedEntitiesToClaims(changes, index);
    const certificateState = assessCertificateRevalidation(registry, {
        targetVersion: observedVersion,
        targetSnapshotId: target.snapshot?.snapshotId || null,
        transitionRequired
    });
    const runtimeState = assessRuntimeRevalidation(runtimeValue, {
        targetVersion: observedVersion,
        targetSnapshotId: target.snapshot?.snapshotId || null,
        transitionRequired
    });
    const targetCoverageComplete = targetEvidenceReady && Object.keys(baseline?.datasets || {})
        .every((dataset) => Object.prototype.hasOwnProperty.call(target.snapshot?.datasets || {}, dataset));
    const unknownCoverage = transitionRequired
        ? index.candidates.filter((candidate) => !candidate.id).length
        : 0;
    const gateReasons = [];
    if (!baselineValidation.valid) gateReasons.push("acceptedBaselineInvalid");
    if (!upstreamAudit?.evidenceValid) gateReasons.push("upstreamEvidenceInvalid");
    if (transitionRequired && !targetEvidenceReady) gateReasons.push(...(target.evidence.reasons.length ? target.evidence.reasons : ["targetEvidenceMissing"]));
    if (transitionRequired && !targetCoverageComplete) gateReasons.push("targetDatasetCoverageIncomplete");
    if (transitionRequired && mapping.unmappedChanges.length) gateReasons.push("changedEntityClaimMappingIncomplete");
    if (transitionRequired && certificateState.staleClaimCount) gateReasons.push("certificateRevalidationIncomplete");
    if (transitionRequired && !runtimeState.targetBound) gateReasons.push("runtimeRevalidationIncomplete");
    const gateOpen = !gateReasons.length && (!transitionRequired || (
        certificateState.staleClaimCount === 0
        && certificateState.eligibleTargetClaimCount === certificateState.certificateCount
        && runtimeState.targetBound
    ));
    let state = "current";
    if (!upstreamAudit?.evidenceValid) state = "evidenceInvalid";
    else if (transitionRequired && !targetEvidenceReady) state = "upstreamVersionAvailable";
    else if (transitionRequired && targetEvidenceReady && (certificateState.staleClaimCount || !runtimeState.targetBound || mapping.unmappedChanges.length)) state = "revalidationRequired";
    else if (transitionRequired && gateOpen) state = "readyForBaselinePromotion";
    const transitionId = `genshin-transition:${acceptedVersion || "unbound"}->${observedVersion || "unbound"}:${sha256({
        acceptedSnapshotId: baseline?.snapshotId || null,
        targetSnapshotId: target.snapshot?.snapshotId || null,
        upstreamEvidenceId: upstreamAudit?.evidenceId || null
    }).slice(0, 16)}`;
    return {
        schemaVersion: TRANSITION_SCHEMA_VERSION,
        kind: "genshinVersionTransitionLifecycle",
        generator: { name: "genshinVersionTransition.cjs", version: GENERATOR_VERSION },
        transitionId,
        generatedAt: now || new Date().toISOString(),
        state,
        acceptedBaseline: {
            status: baselineValidation.valid ? "verified" : "invalid",
            gameVersion: acceptedVersion,
            snapshotId: baseline?.snapshotId || null,
            digest: baseline ? sha256(fs.readFileSync(baselinePath)) : null,
            path: relativePath(baselinePath)
        },
        target: {
            status: transitionRequired ? (targetEvidenceReady ? "inactiveReadyForRevalidation" : "inactivePendingEvidence") : "notRequired",
            gameVersion: observedVersion,
            snapshotId: target.snapshot?.snapshotId || null,
            source: target.source,
            evidenceValid: target.evidence.valid,
            evidenceReasons: target.evidence.reasons
        },
        upstream: {
            status: upstreamAudit?.status || null,
            evidenceId: upstreamAudit?.evidenceId || null,
            evidenceValid: upstreamAudit?.evidenceValid === true,
            acceptedTargetVersion: upstreamAudit?.acceptedTargetVersion || acceptedVersion,
            observedLiveVersion: observedVersion
        },
        diff: {
            status: targetEvidenceReady ? "computed" : "pendingTargetEvidence",
            changeCount: changes.length,
            changes,
            targetDatasetCoverageComplete: targetCoverageComplete
        },
        impactMapping: {
            status: targetEvidenceReady ? (mapping.unmappedChanges.length ? "partial" : "complete") : "pendingTargetEvidence",
            candidateCount: index.candidates.length,
            claimCount: index.claims.length,
            affectedClaimCount: mapping.affectedClaims.length,
            affectedClaims: mapping.affectedClaims,
            unmappedChanges: mapping.unmappedChanges,
            unknownCoverageCandidateCount: unknownCoverage
        },
        invalidation: {
            mode: transitionRequired ? "failClosedUntilTargetRevalidated" : "none",
            allPriorVersionClaimsInactive: transitionRequired,
            certificate: certificateState,
            runtime: runtimeState
        },
        regeneration: {
            status: transitionRequired ? (gateOpen ? "complete" : "required") : "notRequired",
            sourceEvidence: targetEvidenceReady ? "targetSnapshotAvailable" : "targetSnapshotRequired",
            certificates: certificateState.staleClaimCount ? "regenerateAndReverify" : "targetBound",
            runtime: runtimeState.targetBound ? "targetBound" : "regenerateAfterCertificateVerification",
            baseline: gateOpen ? "promotionMayBeEvaluated" : "promotionForbidden"
        },
        gate: {
            canonicalGateOpen: gateOpen,
            automaticPromotionAllowed: false,
            baselinePromotionAllowed: gateOpen,
            reasons: [...new Set(gateReasons)]
        }
    };
}

module.exports = {
    DEFAULT_BASELINE_PATH,
    DEFAULT_CERTIFICATE_PATH,
    DEFAULT_DATA_ROOT,
    DEFAULT_RUNTIME_PATH,
    GENERATOR_VERSION,
    TRANSITION_SCHEMA_VERSION,
    assessCertificateRevalidation,
    assessRuntimeRevalidation,
    buildCandidateClaimIndex,
    buildVersionTransition,
    candidateIdentifiers,
    expectedSnapshotId,
    loadTargetSnapshot,
    mapChangedEntitiesToClaims,
    sha256,
    strictTargetEvidence,
    stableJson
};
