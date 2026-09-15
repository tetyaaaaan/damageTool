"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { collectCandidates } = require("./genshinTerminalStateAudit.cjs");
const { digestStable, validateOfficialChangeIndex, validateTargetDatasetEvidence } = require("./genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const transitionDirectory = path.join(repositoryRoot, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0");
const defaultOutput = path.join(transitionDirectory, "partial-discovery.json");
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(repositoryRoot, relative), "utf8"));
const fileDigest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function pilotFresh(pilot) {
    const generatedInputsFresh = Object.values(pilot?.generatedFrom || {}).every((input) => {
        const file = input?.path ? path.join(repositoryRoot, input.path) : null;
        return file && fs.existsSync(file) && fileDigest(file) === input.sha256;
    });
    const sourceDigestsFresh = Object.values(pilot?.sourceRecords || {}).every((source) => source?.rawText
        && source?.integrity?.algorithm === "sha256"
        && crypto.createHash("sha256").update(String(source.rawText), "utf8").digest("hex") === source.integrity.digest);
    const versionTransition = (pilot?.reviewPacket?.fieldComparison || [])
        .some((field) => field?.status === "versionTransition");
    return generatedInputsFresh && sourceDigestsFresh && versionTransition;
}

function structuralScopeCandidate(change, candidateId) {
    if (change?.candidateMappingStatus !== "entityMappedCandidatePending") return false;
    if (String(change?.changeId || "").includes(":passive:")) {
        return String(candidateId).includes(":passives-") || String(candidateId).includes(":passive_");
    }
    return false;
}

function buildDiscovery() {
    const head = readJson("games/genshin/data/v2/upstream-version-head.json");
    const index = readJson("games/genshin/data/v2/version-transitions/6.7-to-7.0/official-change-index.json");
    const pilot = readJson("games/genshin/data/v2/review-pilots/weapon-12516-reaction.json");
    const targetEvidence = readJson("games/genshin/data/v2/version-transitions/6.7-to-7.0/target-dataset-evidence.json");
    const candidates = collectCandidates();
    const indexValidation = validateOfficialChangeIndex(index, head, "7.0");
    if (!indexValidation.valid) throw new Error(`official change index invalid: ${indexValidation.reasons.join(",")}`);
    if (!pilotFresh(pilot)) throw new Error("weapon 12516 transition pilot is stale");
    const targetValidation = validateTargetDatasetEvidence(targetEvidence, { toGameVersion: "7.0", repositoryRoot });
    if (!targetValidation.valid) throw new Error(`target dataset evidence invalid: ${targetValidation.reasons.join(",")}`);

    const candidateMappings = [];
    index.claim.changes.filter((change) => change.entityKind === "character").forEach((change) => {
        const exact = new Set((change.candidateIds || []).map(String));
        candidates.filter((entry) => String(entry.candidate?.entity?.id || "") === String(change.entityId)).forEach((entry) => {
            const mappingStatus = exact.has(entry.id) ? "exactCandidateMapped"
                : structuralScopeCandidate(change, entry.id) ? "structuralScopeCandidate"
                    : "conservativeEntityInvalidation";
            candidateMappings.push({
                candidateId: entry.id,
                dataset: entry.dataset,
                layer: entry.layer,
                entityId: String(change.entityId),
                officialChangeId: change.changeId,
                mappingStatus,
                claimScope: mappingStatus === "exactCandidateMapped" ? "allCandidateClaimsReacquire"
                    : mappingStatus === "structuralScopeCandidate" ? "candidateIdentityPending"
                        : "unknownUntilEntityDiff"
            });
        });
    });
    candidateMappings.push({
        candidateId: pilot.target.candidateId,
        dataset: "weapons",
        layer: "weaponEffectSpec",
        entityId: pilot.target.id,
        officialChangeId: "reaction:stellarSwirl:introduced",
        mappingStatus: "reactionConsumerTransition",
        claimScope: "targetsAndFormulaReacquire"
    });
    candidateMappings.sort((a, b) => a.candidateId.localeCompare(b.candidateId));
    const counts = candidateMappings.reduce((result, item) => {
        result[item.mappingStatus] = (result[item.mappingStatus] || 0) + 1;
        return result;
    }, {});
    const generatedFrom = {
        upstreamVersionHead: {
            path: "games/genshin/data/v2/upstream-version-head.json",
            sha256: fileDigest(path.join(repositoryRoot, "games/genshin/data/v2/upstream-version-head.json"))
        },
        officialChangeIndex: {
            path: "games/genshin/data/v2/version-transitions/6.7-to-7.0/official-change-index.json",
            sha256: fileDigest(path.join(transitionDirectory, "official-change-index.json"))
        },
        weaponReactionPilot: {
            path: "games/genshin/data/v2/review-pilots/weapon-12516-reaction.json",
            sha256: fileDigest(path.join(repositoryRoot, "games/genshin/data/v2/review-pilots/weapon-12516-reaction.json"))
        },
        targetDatasetEvidence: {
            path: "games/genshin/data/v2/version-transitions/6.7-to-7.0/target-dataset-evidence.json",
            sha256: fileDigest(path.join(transitionDirectory, "target-dataset-evidence.json"))
        }
    };
    const claim = {
        transitionId: "genshin:6.7->7.0",
        fromGameVersion: "6.7",
        toGameVersion: "7.0",
        status: "partialEvidence",
        candidateInventoryDigest: digestStable(candidates.map((entry) => entry.id).sort()),
        officialChangeIndexFieldDigest: index.fieldDigest,
        weaponReactionComparisonDigest: digestStable(pilot.reviewPacket.fieldComparison),
        candidateMappings
    };
    return {
        schemaVersion: 1,
        kind: "genshinVersionTransitionPartialDiscovery",
        generatedAt: "2026-08-25T00:00:00.000Z",
        generatedFrom,
        completeness: {
            targetDataset: targetValidation.complete ? "complete" : "partial",
            entityCoverage: "partial",
            claimCoverage: "unknown",
            completeEntityDiffAvailable: false
        },
        claim,
        summary: {
            candidates: candidateMappings.length,
            byMappingStatus: counts,
            promotionEligible: 0
        },
        gateEligibility: {
            status: "discoveryOnlyFailClosed",
            canSatisfyEntityDiff: false,
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false
        },
        fieldDigestAlgorithm: "sha256-stable-json-v1",
        fieldDigest: digestStable(claim)
    };
}

function writeDiscovery() {
    const result = buildDiscovery();
    fs.writeFileSync(defaultOutput, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    return result;
}

if (require.main === module) process.stdout.write(`${JSON.stringify(writeDiscovery(), null, 2)}\n`);

module.exports = { buildDiscovery, defaultOutput, pilotFresh, structuralScopeCandidate, writeDiscovery };
