"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const stableValue = (value) => Array.isArray(value) ? value.map(stableValue)
    : value && typeof value === "object"
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
        : value;

function digestStable(value) {
    return crypto.createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

function snapshotPointerToken(value) {
    return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}

function recomputeSnapshotFieldDiffs(before, after, pointer = "") {
    if (digestStable(before) === digestStable(after)) return [];
    const beforeObject = before && typeof before === "object";
    const afterObject = after && typeof after === "object";
    if (!beforeObject || !afterObject || Array.isArray(before) !== Array.isArray(after)) {
        return [{
            jsonPointer: pointer || "/",
            beforeValue: before === undefined ? null : before,
            afterValue: after === undefined ? null : after,
            beforeFieldDigest: digestStable(before === undefined ? null : before),
            afterFieldDigest: digestStable(after === undefined ? null : after)
        }];
    }
    const keys = Array.isArray(before) && Array.isArray(after)
        ? Array.from({ length: Math.max(before.length, after.length) }, (_, index) => String(index))
        : [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].sort();
    return keys.flatMap((key) => recomputeSnapshotFieldDiffs(before?.[key], after?.[key], `${pointer}/${snapshotPointerToken(key)}`));
}

function validateOfficialChangeIndex(index, head, expectedGameVersion) {
    const reasons = [];
    const validSha256 = (value) => /^[a-f0-9]{64}$/.test(String(value || ""));
    if (index?.schemaVersion !== 1) reasons.push("schemaVersionInvalid");
    if (index?.kind !== "genshinOfficialVersionChangeIndex") reasons.push("kindInvalid");
    if (index?.claim?.gameVersion !== expectedGameVersion
        || head?.observedGameVersion !== expectedGameVersion) reasons.push("gameVersionMismatch");
    if (index?.source?.postId !== head?.evidence?.postId) reasons.push("officialPostMismatch");
    if (index?.source?.rawDigest !== head?.evidence?.rawApiResponseDigest
        || index?.source?.rawBytes !== head?.evidence?.rawApiResponseBytes
        || !validSha256(index?.source?.rawDigest)) reasons.push("rawArtifactBindingMismatch");
    if (index?.fieldDigestAlgorithm !== "sha256-stable-json-v1"
        || index?.fieldDigest !== digestStable(index?.claim)
        || !validSha256(index?.fieldDigest)) reasons.push("fieldDigestInvalid");
    if (!Array.isArray(index?.claim?.changes) || index.claim.changes.length === 0) reasons.push("changesMissing");
    return { valid: reasons.length === 0, reasons };
}

function validatePartialDiscovery(discovery, { fromGameVersion, toGameVersion, candidateIds }) {
    const reasons = [];
    const ids = (candidateIds || []).map(String).sort();
    const mappings = Array.isArray(discovery?.claim?.candidateMappings) ? discovery.claim.candidateMappings : [];
    const mappedIds = mappings.map((item) => String(item?.candidateId || ""));
    const validStatuses = new Set([
        "exactCandidateMapped",
        "structuralScopeCandidate",
        "conservativeEntityInvalidation",
        "reactionConsumerTransition"
    ]);
    if (discovery?.schemaVersion !== 1 || discovery?.kind !== "genshinVersionTransitionPartialDiscovery") reasons.push("identityInvalid");
    if (discovery?.claim?.fromGameVersion !== fromGameVersion
        || discovery?.claim?.toGameVersion !== toGameVersion) reasons.push("transitionVersionMismatch");
    if (discovery?.claim?.status !== "partialEvidence") reasons.push("statusInvalid");
    if (discovery?.claim?.candidateInventoryDigest !== digestStable(ids)) reasons.push("candidateInventoryDigestMismatch");
    if (discovery?.fieldDigestAlgorithm !== "sha256-stable-json-v1"
        || discovery?.fieldDigest !== digestStable(discovery?.claim)) reasons.push("fieldDigestInvalid");
    if (discovery?.completeness?.completeEntityDiffAvailable !== false
        || discovery?.gateEligibility?.canSatisfyEntityDiff !== false
        || discovery?.gateEligibility?.canIssueEligibilityCertificate !== false
        || discovery?.gateEligibility?.canPromoteCanonical !== false) reasons.push("failClosedDispositionInvalid");
    if (mappedIds.length === 0 || new Set(mappedIds).size !== mappedIds.length) reasons.push("candidateMappingsMissingOrDuplicate");
    if (!mappedIds.every((candidateId) => ids.includes(candidateId))) reasons.push("unknownCandidateMapping");
    if (!mappings.every((item) => validStatuses.has(item?.mappingStatus))) reasons.push("mappingStatusInvalid");
    return { valid: reasons.length === 0, reasons, mappings };
}

function validateClaimReacquisition(queue, { fromGameVersion, toGameVersion, candidateIds, partialDiscoveryFieldDigest }) {
    const reasons = [];
    const ids = (candidateIds || []).map(String).sort();
    const packets = Array.isArray(queue?.claim?.packets) ? queue.claim.packets : [];
    const packetIds = packets.map((packet) => String(packet?.candidateId || ""));
    if (queue?.schemaVersion !== 1 || queue?.kind !== "genshinVersionTransitionClaimReacquisitionQueue") reasons.push("identityInvalid");
    if (queue?.claim?.fromGameVersion !== fromGameVersion || queue?.claim?.toGameVersion !== toGameVersion) reasons.push("transitionVersionMismatch");
    if (queue?.claim?.candidateInventoryDigest !== digestStable(ids)) reasons.push("candidateInventoryDigestMismatch");
    if (queue?.claim?.partialDiscoveryFieldDigest !== partialDiscoveryFieldDigest) reasons.push("partialDiscoveryBindingMismatch");
    if (queue?.fieldDigestAlgorithm !== "sha256-stable-json-v1" || queue?.fieldDigest !== digestStable(queue?.claim)) reasons.push("fieldDigestInvalid");
    if (packetIds.length === 0 || new Set(packetIds).size !== packetIds.length) reasons.push("packetsMissingOrDuplicate");
    if (!packetIds.every((candidateId) => ids.includes(candidateId))) reasons.push("unknownCandidatePacket");
    if (!packets.every((packet) => packet?.gateEligibility?.canIssueCertificate === false
        && packet?.gateEligibility?.canPromoteCanonical === false
        && ["available", "missing"].includes(packet?.claimSchemaStatus)
        && ["targetFieldEvidenceCapturedSingleFamily", "targetDisplayRecordCapturedNoMechanicFieldEvidence"].includes(packet?.providerCaptureStatus)
        && Array.isArray(packet?.claimPackets)
        && packet.claimPackets.every((claim) => claim?.eligibilityStatus === "blocked"
            && ["targetFieldEvidenceCapturedSingleFamily", "targetDisplayRecordCapturedNoMechanicFieldEvidence"].includes(claim?.reacquisitionStatus)
            && claim?.targetGameVersion === toGameVersion))) reasons.push("failClosedPacketInvalid");
    if (queue?.gateEligibility?.canIssueEligibilityCertificate !== false
        || queue?.gateEligibility?.canPromoteCanonical !== false) reasons.push("failClosedDispositionInvalid");
    return { valid: reasons.length === 0, reasons, packets };
}

function validateTargetDatasetEvidence(evidence, { toGameVersion, repositoryRoot }) {
    const reasons = [];
    const validSha256 = (value) => /^[a-f0-9]{64}$/.test(String(value || ""));
    if (evidence?.schemaVersion !== 1 || evidence?.kind !== "genshinVersionTransitionTargetDatasetEvidence") reasons.push("identityInvalid");
    if (evidence?.claim?.gameVersion !== toGameVersion) reasons.push("gameVersionMismatch");
    if (!/^[a-f0-9]{40}$/.test(String(evidence?.claim?.revision || ""))) reasons.push("revisionInvalid");
    if (evidence?.claim?.versionBinding?.status !== "strictlyBound"
        || !validSha256(evidence?.claim?.versionBinding?.evidenceDigest)
        || !evidence?.claim?.versionBinding?.providerOwnedStatement) reasons.push("strictGameVersionBindingInvalid");
    if (!evidence?.claim?.lineage?.status || !Array.isArray(evidence?.claim?.lineage?.disclosedRoots)) reasons.push("lineageDisclosureInvalid");
    if (evidence?.fieldDigestAlgorithm !== "sha256-stable-json-v1" || evidence?.fieldDigest !== digestStable(evidence?.claim)) reasons.push("fieldDigestInvalid");
    const artifacts = Object.values(evidence?.claim?.materializedArtifacts || {});
    if (artifacts.length === 0) reasons.push("materializedArtifactsMissing");
    artifacts.forEach((artifact, index) => {
        const file = artifact?.path && repositoryRoot ? path.join(repositoryRoot, artifact.path) : null;
        if (!file || !fs.existsSync(file)) {
            reasons.push(`rawArtifactMissing:${index}`);
            return;
        }
        const bytes = fs.readFileSync(file);
        if (bytes.length !== artifact.rawArtifactBytes
            || crypto.createHash("sha256").update(bytes).digest("hex") !== artifact.rawArtifactDigest) reasons.push(`rawArtifactBindingInvalid:${index}`);
    });
    const coverage = evidence?.claim?.coverage || {};
    const affectedRef = evidence?.claim?.affectedEntitySnapshot;
    if (affectedRef) {
        const affectedFile = affectedRef.path && repositoryRoot ? path.join(repositoryRoot, affectedRef.path) : null;
        if (!affectedFile || !fs.existsSync(affectedFile)) {
            reasons.push("affectedEntitySnapshotMissing");
        } else {
            const affected = JSON.parse(fs.readFileSync(affectedFile, "utf8"));
            const affectedValidation = validateAffectedEntitySnapshot(affected, { repositoryRoot });
            if (!affectedValidation.valid || affected.fieldDigest !== affectedRef.fieldDigest) {
                reasons.push(...affectedValidation.reasons.map((reason) => `affectedEntitySnapshot:${reason}`));
                if (affected.fieldDigest !== affectedRef.fieldDigest) reasons.push("affectedEntitySnapshot:fieldDigestBindingMismatch");
            }
        }
    }
    const complete = coverage.repositoryCandidateCoverage === "complete"
        && coverage.canSatisfyStrictTargetDataset === true
        && coverage.canSatisfyCompleteEntityDiff === true;
    return { valid: reasons.length === 0, complete, reasons };
}

function validateAffectedEntitySnapshot(snapshot, { repositoryRoot }) {
    const reasons = [];
    const validSha256 = (value) => /^[a-f0-9]{64}$/.test(String(value || ""));
    if (snapshot?.schemaVersion !== 1 || snapshot?.kind !== "genshinVersionTransitionAffectedEntitySnapshot") reasons.push("identityInvalid");
    if (snapshot?.fieldDigestAlgorithm !== "sha256-stable-json-v1" || snapshot?.fieldDigest !== digestStable(snapshot?.claim)) reasons.push("fieldDigestInvalid");
    const bindings = Array.isArray(snapshot?.claim?.versionBindings) ? snapshot.claim.versionBindings : [];
    if (bindings.length !== 2 || !["6.7", "7.0"].every((version) => bindings.some((binding) => binding.gameVersion === version))) reasons.push("versionBindingsIncomplete");
    bindings.forEach((binding) => {
        const file = binding?.manifestPath && repositoryRoot ? path.join(repositoryRoot, binding.manifestPath) : null;
        if (binding?.status !== "strictlyBound" || !file || !fs.existsSync(file)
            || !validSha256(binding?.manifestDigest)
            || crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") !== binding.manifestDigest) reasons.push(`manifestBindingInvalid:${binding?.gameVersion || "unknown"}`);
    });
    const records = Array.isArray(snapshot?.claim?.records) ? snapshot.claim.records : [];
    if (records.length === 0) reasons.push("recordsMissing");
    records.forEach((record, index) => {
        const parsed = [];
        [record?.before, record?.after].forEach((artifact, side) => {
        const file = artifact?.path && repositoryRoot ? path.join(repositoryRoot, artifact.path) : null;
        if (!file || !fs.existsSync(file)) {
            reasons.push(`rawArtifactMissing:${index}:${side}`);
            return;
        }
        const bytes = fs.readFileSync(file);
        if (!validSha256(artifact?.rawArtifactDigest)
            || bytes.length !== artifact?.rawArtifactBytes
            || crypto.createHash("sha256").update(bytes).digest("hex") !== artifact.rawArtifactDigest) reasons.push(`rawArtifactBindingInvalid:${index}:${side}`);
        try { parsed[side] = JSON.parse(bytes.toString("utf8")); } catch { reasons.push(`rawArtifactJsonInvalid:${index}:${side}`); }
        });
        if (parsed.length === 2) {
            const diffs = recomputeSnapshotFieldDiffs(parsed[0], parsed[1]);
            const expectedStatus = diffs.length === 0 ? "rawRecordMatch" : "rawRecordChanged";
            if (record?.comparison?.status !== expectedStatus
                || record?.comparison?.changedFieldCount !== diffs.length
                || digestStable(record?.comparison?.fieldDiffs) !== digestStable(diffs)) reasons.push(`fieldComparisonInvalid:${index}`);
        }
    });
    if (snapshot?.claim?.coverage?.canSatisfyCompleteEntityDiff !== false
        || snapshot?.claim?.coverage?.canIssueEligibilityCertificate !== false
        || snapshot?.gateEligibility?.canSatisfyCompleteEntityDiff !== false
        || snapshot?.gateEligibility?.canIssueEligibilityCertificate !== false
        || snapshot?.gateEligibility?.canPromoteCanonical !== false) reasons.push("failClosedDispositionInvalid");
    return { valid: reasons.length === 0, reasons, records };
}

module.exports = { digestStable, stableValue, validateAffectedEntitySnapshot, validateClaimReacquisition, validateOfficialChangeIndex, validatePartialDiscovery, validateTargetDatasetEvidence };
