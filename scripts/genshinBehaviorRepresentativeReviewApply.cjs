"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const pilotModule = require("./genshinBehaviorRepresentativeReviewPilot.cjs");
const { auditBaseline } = require("./genshinVersionBaseline.cjs");
const { buildReviewBinding } = require("./genshinReviewBinding.cjs");

const root = path.resolve(__dirname, "..");
const dataRoot = path.join(root, "games", "genshin", "data");
const decisionPath = path.join(dataRoot, "v2", "reviews", "behavior-xiao-c1-charges.json");
const outputPath = path.join(dataRoot, "v2", "characters", "behavior-reviewed.json");
const pairPolicyPath = path.join(dataRoot, "v2", "provider-pair-policy.json");
const modifierId = "behavior-modifier:10000026:constellation-1-1:1";
const targetSpecId = "behavior:10000026:talent:skill";

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
const digestFile = (relativePath) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, relativePath))).digest("hex");

function assertReviewStillApplies({ decision, pilot, pairPolicy = readJson(pairPolicyPath), versionBaseline = auditBaseline() }) {
    if (versionBaseline.canonicalGateOpen !== true || versionBaseline.status !== "current") throw new Error("accepted version baseline drifted");
    const currentVersion = versionBaseline.targetGameVersion?.gameVersion;
    if (!currentVersion) throw new Error("current game version is not strictly bound");
    if (pilot.targetBehaviorSpec?.id !== targetSpecId || pilot.runtimeCandidate?.id !== modifierId) throw new Error("review identity changed");
    if (pilot.targetBehaviorSpec?.execution?.charges?.value !== decision.approvedFacts?.baseCharges
        || pilot.runtimeCandidate?.operation !== decision.approvedFacts?.operation
        || pilot.runtimeCandidate?.value !== decision.approvedFacts?.value
        || pilot.runtimeCandidate?.path !== decision.approvedFacts?.path
        || pilot.runtimeCandidate?.condition?.stateKey !== "10000026:C1") throw new Error("approved behavior facts changed");
    if (!pilot.reviewPacket?.fieldComparison?.every((row) => row.status === "match")) throw new Error("review comparison no longer exactly matches");
    const sources = Object.values(pilot.sourceRecords || {});
    if (sources.length !== 3 || sources.some((source) => source.strictGameVersionBinding !== true || source.gameVersion !== currentVersion || source.integrity?.algorithm !== "sha256" || !/^[a-f0-9]{64}$/.test(source.integrity?.digest || ""))) {
        throw new Error("review source binding changed");
    }
    const policy = pairPolicy.pairs?.find((entry) => entry.id === "characters:gachabase+genshin-db");
    if (!policy || policy.status !== "candidateApprovedOnly" || !policy.scope?.includes("behavior:xiao:c1:charges")) throw new Error("provider-pair review scope changed");
    if (sources.some((source) => source.provider === policy.providerA.name && source.independenceGroup !== policy.providerA.independenceGroup)
        || sources.some((source) => source.provider === policy.providerB.name && source.independenceGroup !== policy.providerB.independenceGroup)) throw new Error("provider lineage changed");
    const groups = new Set(sources.map((source) => source.independenceGroup));
    if (!groups.has(policy.providerA.independenceGroup) || !groups.has(policy.providerB.independenceGroup) || groups.size !== 2) throw new Error("provider lineage changed");
    const boundRevision = versionBaseline.targetGameVersion.sources?.find((source) => source.sourceId === "genshinDb")?.revision;
    if (!boundRevision || sources.filter((source) => source.provider === "theBowja/genshin-db").some((source) => !source.locator.includes(boundRevision))) throw new Error("genshin-db revision changed");
}

function externalSourceRecord(source) {
    return {
        id: source.id,
        kind: "externalPrimaryDataset",
        provider: source.provider,
        independenceGroup: source.independenceGroup,
        locator: { url: source.locator, identifier: source.identifier },
        capturedAt: "2026-08-24T00:00:00.000Z",
        gameVersion: source.gameVersion,
        gameVersionEvidence: source.gameVersionEvidence,
        locale: source.locale,
        text: source.rawText,
        integrity: source.integrity,
        strictGameVersionBinding: source.strictGameVersionBinding
    };
}

function verifiedClaim(claim, localRef) {
    const external = claim.claimKind === "externalFactual";
    const sourceRefs = external ? claim.evidence.map((item) => item.sourceId) : [localRef];
    const codeProvenance = claim.codeProvenance ? {
        ...claim.codeProvenance,
        digest: digestFile(claim.codeProvenance.path)
    } : undefined;
    return {
        status: "verified",
        claimKind: claim.claimKind,
        sourceRefs,
        machineEvidence: {
            ready: true,
            evidenceRefs: external ? sourceRefs : (claim.focusedTests || []).map((item) => `test:${item.id}`),
            comparison: external ? "match" : "notRequired",
            ...(codeProvenance ? { codeProvenance } : {}),
            ...(claim.focusedTests ? { focusedTests: claim.focusedTests } : {}),
            ...(claim.sourceInputsVerified !== undefined ? { sourceInputsVerified: claim.sourceInputsVerified } : {}),
            blockedReasons: []
        },
        notes: "Approved by the scoped human review decision; this approval and provider-independence decision do not apply to any other candidate."
    };
}

function verification(decision, claims) {
    return {
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
}

function applyReview({ decision = readJson(decisionPath), pilot = pilotModule.buildPilot() } = {}) {
    if (decision.decision !== "approve") throw new Error("review decision is not approve");
    if (decision.target?.modifierId !== modifierId || decision.target?.targetSpecId !== targetSpecId) throw new Error("review target mismatch");
    if (decision.constraints?.appliesOnlyToModifier !== modifierId) throw new Error("review scope mismatch");
    if (decision.constraints?.providerIndependenceReuse !== "forbidden" || decision.constraints?.otherCandidatesRemainUnreviewed !== true) {
        throw new Error("candidate-local independence constraint missing");
    }
    if (decision.constraints?.aiSelfApproval !== "forbidden") throw new Error("AI self-approval policy missing");
    if (pilot.assessment.machineEvidenceReady !== true) throw new Error("machine evidence is not ready");
    if (decision.approvedFacts?.baseCharges !== 2 || decision.approvedFacts?.value !== 1
        || decision.approvedFacts?.resolvedCharges !== 3 || decision.approvedFacts?.operation !== "add"
        || decision.approvedFacts?.path !== "/execution/charges") throw new Error("approved facts mismatch");
    assertReviewStillApplies({ decision, pilot });

    const sourceRecords = Object.fromEntries(Object.values(pilot.sourceRecords).map((source) => [source.id, externalSourceRecord(source)]));
    const localRef = `review:${modifierId}`;
    const modifierClaims = Object.fromEntries(Object.entries(pilot.claims).map(([field, claim]) => [field, verifiedClaim(claim, localRef)]));
    const baseClaim = verifiedClaim(pilot.claims.baseCharges, localRef);
    const targetSpec = {
        ...pilot.targetBehaviorSpec,
        sourceRefs: baseClaim.sourceRefs,
        interpretation: { method: "deterministicParser", author: "genshinBehaviorV2Generate.cjs", version: "genshinBehaviorV2Generate/1" },
        verification: verification(decision, { baseCharges: baseClaim }),
        discrepancies: []
    };
    targetSpec.verification.reviewBinding = buildReviewBinding(targetSpec, "games/genshin/data/v2/reviews/behavior-xiao-c1-charges.json");
    const modifier = {
        ...pilot.runtimeCandidate,
        sourceRefs: Object.keys(sourceRecords),
        targetSpec,
        verification: verification(decision, modifierClaims),
        runtime: { ...pilot.runtimeCandidate.runtime, status: "canonicalEligible", blockedReasons: [] }
    };
    modifier.verification.reviewBinding = buildReviewBinding(modifier, "games/genshin/data/v2/reviews/behavior-xiao-c1-charges.json");
    const output = {
        schemaVersion: 1,
        kind: "genshinReviewedBehaviorRepresentative",
        generatedAt: decision.reviewedAt,
        constraints: decision.constraints,
        reviewDecision: decision,
        sourceRecords,
        behaviorSpecs: { [targetSpecId]: targetSpec },
        modifiers: { [modifierId]: modifier }
    };
    return { output, modifier, targetSpec, decision };
}

function writeAppliedReview() {
    const result = applyReview();
    writeJson(outputPath, result.output);
    return result;
}

if (require.main === module) {
    const result = writeAppliedReview();
    process.stdout.write(`${JSON.stringify({ modifierId, status: result.modifier.verification.status, reviewedBy: result.decision.reviewedBy, canonicalEligibility: result.modifier.verification.canonicalEligibility, providerIndependenceReuse: result.decision.constraints.providerIndependenceReuse }, null, 2)}\n`);
}

module.exports = { applyReview, assertReviewStillApplies, modifierId, outputPath, targetSpecId, writeAppliedReview };
