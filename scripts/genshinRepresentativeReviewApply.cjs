"use strict";

const fs = require("node:fs");
const path = require("node:path");
const pilotModule = require("./genshinRepresentativeReviewPilot.cjs");
const { auditBaseline } = require("./genshinVersionBaseline.cjs");
const { buildReviewBinding } = require("./genshinReviewBinding.cjs");

const root = path.resolve(__dirname, "..");
const dataRoot = path.join(root, "games", "genshin", "data");
const decisionPath = path.join(dataRoot, "v2", "reviews", "weapon-12516-stat.json");
const specPath = path.join(dataRoot, "v2", "weapons", "spec-candidates.json");
const sourcePath = path.join(dataRoot, "v2", "weapons", "source-records.json");
const verificationPath = path.join(dataRoot, "v2", "weapons", "verification.json");
const pairPolicyPath = path.join(dataRoot, "v2", "provider-pair-policy.json");
const candidateId = "w_12516_stat_1";

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function assertReviewStillApplies({ decision, pilot, spec, pairPolicy = readJson(pairPolicyPath), versionBaseline = auditBaseline() }) {
    if (versionBaseline.canonicalGateOpen !== true || versionBaseline.status !== "current") throw new Error("accepted version baseline drifted");
    const currentVersion = versionBaseline.targetGameVersion?.gameVersion;
    if (!currentVersion) throw new Error("current game version is not strictly bound");
    if (decision.target?.candidateId !== spec.id || spec.entity?.kind !== "weapon" || spec.entity?.id !== "12516") throw new Error("candidate identity changed");
    if (!sameJson(spec.effect?.valueByRefinement, decision.approvedScope?.valueByRefinement)) throw new Error("approved refinement values changed");
    if (!sameJson(spec.effect?.targets, ["atkPercent"]) || decision.approvedScope?.target !== "self.atkPercent") throw new Error("approved target changed");
    if (spec.effect?.activation?.condition !== "always" || decision.approvedScope?.activation !== "always") throw new Error("approved activation changed");
    if (spec.effect?.stack !== undefined || spec.effect?.duration !== undefined || spec.effect?.durationSeconds !== undefined) throw new Error("approved clause scope changed");
    if (pilot.target?.candidateId !== spec.id || !pilot.reviewPacket?.fieldComparison?.every((row) => row.status === "match")) throw new Error("review comparison no longer exactly matches");
    const sources = Object.values(pilot.sourceRecords || {});
    if (sources.length !== 2 || sources.some((source) => source.strictGameVersionBinding !== true || source.gameVersion !== currentVersion || source.integrity?.algorithm !== "sha256" || !/^[a-f0-9]{64}$/.test(source.integrity?.digest || ""))) {
        throw new Error("review source binding changed");
    }
    const policy = pairPolicy.pairs?.find((entry) => entry.id === "weapons:hoyowiki+genshin-db");
    if (!policy || policy.status !== "candidateApprovedOnly" || !sameJson(policy.scope, [candidateId])) throw new Error("provider-pair review scope changed");
    const groups = new Set(sources.map((source) => source.independenceGroup));
    if (!groups.has(policy.providerA.independenceGroup) || !groups.has(policy.providerB.independenceGroup) || groups.size !== 2) throw new Error("provider lineage changed");
    const boundRevision = versionBaseline.targetGameVersion.sources?.find((source) => source.sourceId === "genshinDb")?.revision;
    if (!boundRevision || !pilot.sourceRecords?.genshinDb?.locator?.includes(boundRevision)) throw new Error("genshin-db revision changed");
}

function externalSourceRecord(source) {
    return {
        id: source.id,
        kind: "externalPrimaryDataset",
        provider: source.provider,
        independenceGroup: source.independenceGroup,
        locator: { url: source.locator, identifier: source.identifier },
        capturedAt: "2026-08-23T00:00:00.000Z",
        gameVersion: source.gameVersion,
        gameVersionEvidence: source.gameVersionEvidence,
        locale: source.locale,
        text: source.rawText,
        integrity: source.integrity,
        strictGameVersionBinding: source.strictGameVersionBinding
    };
}

function applyReview({ decision = readJson(decisionPath), pilot = pilotModule.buildPilot(), specs = readJson(specPath), sourceRecords = readJson(sourcePath), verification = readJson(verificationPath) } = {}) {
    if (decision.decision !== "approve") throw new Error("review decision is not approve");
    if (decision.target?.candidateId !== candidateId || decision.constraints?.appliesOnlyToCandidate !== candidateId) throw new Error("review scope mismatch");
    if (decision.constraints?.aiSelfApproval !== "forbidden") throw new Error("AI self-approval policy missing");
    if (pilot.assessment.machineEvidenceReady !== true) throw new Error("machine evidence is not ready");
    const spec = specs[candidateId];
    if (!spec) throw new Error("candidate missing");
    assertReviewStillApplies({ decision, pilot, spec });
    if (spec.effect?.valueByRefinementPerStack !== undefined) throw new Error("clause-boundary correction missing");
    const sources = Object.values(pilot.sourceRecords);
    sources.forEach((source) => { sourceRecords[source.id] = externalSourceRecord(source); });
    const externalRefs = sources.map((source) => source.id);
    const localRef = `weapon:12516:modifier:${candidateId}`;
    const claims = {};
    Object.entries(pilot.claims).forEach(([field, claim]) => {
        const external = claim.claimKind === "externalFactual";
        claims[field] = {
            status: claim.status === "notApplicable" ? "notApplicable" : "verified",
            claimKind: claim.claimKind,
            sourceRefs: external ? externalRefs : [localRef],
            machineEvidence: {
                ready: true,
                evidenceRefs: external ? externalRefs : (claim.focusedTests || []).map((item) => `test:${item.id}`),
                comparison: external ? "match" : "notRequired",
                ...(claim.codeProvenance ? { codeProvenance: claim.codeProvenance } : {}),
                ...(claim.focusedTests ? { focusedTests: claim.focusedTests } : {}),
                ...(claim.sourceInputsVerified !== undefined ? { sourceInputsVerified: claim.sourceInputsVerified } : {}),
                ...(claim.applicabilityDetermined !== undefined ? { applicabilityDetermined: claim.applicabilityDetermined } : {}),
                blockedReasons: []
            },
            notes: claim.rationale || "Approved by the scoped human review decision; no approval is implied for other candidates."
        };
    });
    const mappingClaim = (locator) => ({
        status: "verified",
        claimKind: "mappingMaterialization",
        sourceRefs: [localRef],
        machineEvidence: {
            ready: true,
            evidenceRefs: ["test:genshinRepresentativeReviewPilot:canonicalMappingFields"],
            comparison: "notRequired",
            codeProvenance: { ...pilot.claims.destination.codeProvenance, locator },
            focusedTests: [{ id: "genshinRepresentativeReviewPilot:canonicalMappingFields", status: "passed" }],
            sourceInputsVerified: true,
            blockedReasons: []
        },
        notes: "Exact deterministic mapping asserted by the focused canonical-mapping test."
    });
    claims["effect.kind"] = mappingClaim("buildEffect.kind:statBonus");
    claims["effect.activation.calculationSupport"] = mappingClaim("buildEffect.activation.calculationSupport:simple");
    claims.entity = mappingClaim("buildSpec.entity:weapon:12516");
    claims.interpretation = mappingClaim("buildSpec.interpretation:deterministicParser");
    spec.sourceRefs = externalRefs;
    spec.verification = {
        status: "verified",
        reviewedBy: decision.reviewedBy,
        reviewedAt: decision.reviewedAt,
        sourceAgreement: "agreed",
        machineEvidenceReady: true,
        canonicalEligibility: true,
        state: "canonicalEligible",
        claims,
        discrepancies: []
    };
    spec.runtime = { ...spec.runtime, status: "canonical", blockedReasons: [] };
    spec.verification.reviewBinding = buildReviewBinding(spec, "games/genshin/data/v2/reviews/weapon-12516-stat.json");
    verification[candidateId] = { entity: spec.entity, sourceRefs: spec.sourceRefs, verification: spec.verification, runtime: spec.runtime };
    return { specs, sourceRecords, verification, spec, decision };
}

function writeAppliedReview() {
    const result = applyReview();
    writeJson(specPath, result.specs);
    writeJson(sourcePath, result.sourceRecords);
    writeJson(verificationPath, result.verification);
    return result;
}

if (require.main === module) {
    const result = writeAppliedReview();
    process.stdout.write(`${JSON.stringify({ candidateId, status: result.spec.verification.status, reviewedBy: result.spec.verification.reviewedBy, canonicalEligibility: result.spec.verification.canonicalEligibility }, null, 2)}\n`);
}

module.exports = { applyReview, assertReviewStillApplies, writeAppliedReview };
