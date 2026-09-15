"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { collectCandidates } = require("./genshinTerminalStateAudit.cjs");
const { digestStable, validatePartialDiscovery } = require("./genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const discoveryRelativePath = "v2/version-transitions/6.7-to-7.0/partial-discovery.json";
const defaultOutput = path.join(dataRoot, "v2", "version-transitions", "6.7-to-7.0", "claim-reacquisition.json");
const candidateInputPaths = [
    "v2/weapons/spec-candidates.json",
    "v2/artifacts/spec-candidates.json",
    "v2/characters/talent-gap-candidates.json",
    "v2/characters/behavior-pilot.json",
    "v2/characters/behavior-reviewed.json",
    ...Array.from({ length: 12 }, (_, index) => `v2/characters/behavior-batch-${index + 1}/spec-candidates.json`)
];

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(dataRoot, relativePath), "utf8"));
}

function fileDigest(file) {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function generatedInput(relativePath) {
    const absolutePath = path.join(dataRoot, relativePath);
    return {
        path: path.relative(repositoryRoot, absolutePath).replaceAll("\\", "/"),
        sha256: fileDigest(absolutePath)
    };
}

function buildClaimQueue() {
    const candidates = collectCandidates();
    const candidateIndex = new Map(candidates.map((entry) => [entry.id, entry]));
    const discovery = readJson(discoveryRelativePath);
    const targetEvidence = readJson("v2/version-transitions/6.7-to-7.0/target-dataset-evidence.json");
    const affectedSnapshot = readJson("v2/version-transitions/6.7-to-7.0/affected-entity-snapshot.json");
    const validation = validatePartialDiscovery(discovery, {
        fromGameVersion: "6.7",
        toGameVersion: "7.0",
        candidateIds: candidates.map((entry) => entry.id)
    });
    if (!validation.valid) throw new Error(`partial discovery invalid: ${validation.reasons.join(",")}`);
    if (targetEvidence?.fieldDigest !== digestStable(targetEvidence?.claim)
        || affectedSnapshot?.fieldDigest !== digestStable(affectedSnapshot?.claim)) throw new Error("target source evidence invalid");

    const packets = discovery.claim.candidateMappings.map((mapping) => {
        const entry = candidateIndex.get(mapping.candidateId);
        if (!entry) throw new Error(`candidate missing: ${mapping.candidateId}`);
        const claims = entry.candidate?.verification?.claims;
        const standardized = claims && typeof claims === "object" && !Array.isArray(claims);
        const providerCaptureStatus = mapping.mappingStatus === "reactionConsumerTransition"
            ? "targetFieldEvidenceCapturedSingleFamily"
            : "targetDisplayRecordCapturedNoMechanicFieldEvidence";
        const claimPackets = standardized
            ? Object.entries(claims).sort(([left], [right]) => left.localeCompare(right)).map(([claimName, claim]) => ({
                claimName,
                currentStatus: claim?.status || "unknown",
                sourceRefs: [...new Set(Array.isArray(claim?.sourceRefs) ? claim.sourceRefs.map(String) : [])].sort(),
                targetGameVersion: "7.0",
                reacquisitionStatus: providerCaptureStatus,
                eligibilityStatus: "blocked"
            }))
            : [];
        return {
            candidateId: mapping.candidateId,
            dataset: mapping.dataset,
            layer: mapping.layer,
            entityId: mapping.entityId,
            transitionLane: mapping.mappingStatus,
            officialChangeId: mapping.officialChangeId,
            claimScope: mapping.claimScope,
            claimSchemaStatus: standardized ? "available" : "missing",
            providerCaptureStatus,
            claimPackets,
            gateEligibility: {
                canIssueCertificate: false,
                canPromoteCanonical: false,
                reasons: standardized
                    ? providerCaptureStatus === "targetFieldEvidenceCapturedSingleFamily"
                        ? ["strictIndependentSourcePairMissing"]
                        : ["mechanicFieldEvidenceMissing", "strictIndependentSourcePairMissing"]
                    : ["claimSchemaMissing", "mechanicFieldEvidenceMissing", "strictIndependentSourcePairMissing"]
            }
        };
    }).sort((left, right) => left.candidateId.localeCompare(right.candidateId));

    const summary = packets.reduce((result, packet) => {
        result.candidates += 1;
        result.claimPackets += packet.claimPackets.length;
        result.byTransitionLane[packet.transitionLane] = (result.byTransitionLane[packet.transitionLane] || 0) + 1;
        result.claimPacketsByTransitionLane[packet.transitionLane] = (result.claimPacketsByTransitionLane[packet.transitionLane] || 0) + packet.claimPackets.length;
        if (packet.claimSchemaStatus === "missing") result.claimSchemaMissingCandidates += 1;
        result.byProviderCaptureStatus[packet.providerCaptureStatus] = (result.byProviderCaptureStatus[packet.providerCaptureStatus] || 0) + 1;
        return result;
    }, {
        candidates: 0,
        claimPackets: 0,
        claimSchemaMissingCandidates: 0,
        eligibleClaims: 0,
        byTransitionLane: {},
        claimPacketsByTransitionLane: {},
        byProviderCaptureStatus: {}
    });
    const generatedFrom = Object.fromEntries([
        ["partialDiscovery", generatedInput(discoveryRelativePath)],
        ["targetDatasetEvidence", generatedInput("v2/version-transitions/6.7-to-7.0/target-dataset-evidence.json")],
        ["affectedEntitySnapshot", generatedInput("v2/version-transitions/6.7-to-7.0/affected-entity-snapshot.json")],
        ...candidateInputPaths.map((relativePath) => [relativePath.replaceAll("/", ":"), generatedInput(relativePath)])
    ]);
    const claim = {
        transitionId: discovery.claim.transitionId,
        fromGameVersion: discovery.claim.fromGameVersion,
        toGameVersion: discovery.claim.toGameVersion,
        partialDiscoveryFieldDigest: discovery.fieldDigest,
        candidateInventoryDigest: discovery.claim.candidateInventoryDigest,
        packets
    };
    return {
        schemaVersion: 1,
        kind: "genshinVersionTransitionClaimReacquisitionQueue",
        generatedAt: "2026-08-25T00:00:00.000Z",
        generatedFrom,
        claim,
        summary,
        gateEligibility: {
            status: "preparationOnlyFailClosed",
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false
        },
        fieldDigestAlgorithm: "sha256-stable-json-v1",
        fieldDigest: digestStable(claim)
    };
}

function writeClaimQueue() {
    const result = buildClaimQueue();
    fs.writeFileSync(defaultOutput, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    return result;
}

if (require.main === module) process.stdout.write(`${JSON.stringify(writeClaimQueue().summary, null, 2)}\n`);

module.exports = { buildClaimQueue, candidateInputPaths, defaultOutput, writeClaimQueue };
