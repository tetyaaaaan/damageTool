"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const paths = {
    dualSource: path.join(root, "reports", "genshin-v2-dual-source-audit.json"),
    conflictTriage: path.join(root, "games", "genshin", "data", "v2", "weapons", "conflict-triage.json"),
    output: path.join(root, "games", "genshin", "data", "v2", "review-readiness.json"),
    reportJson: path.join(root, "reports", "genshin-needs-review-triage.json"),
    reportMarkdown: path.join(root, "reports", "genshin-needs-review-triage.md")
};

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

function candidateKey(claim) {
    return `${claim.entityType}:${claim.entityId}:${claim.candidateId}`;
}

function taskDisposition(classification) {
    return {
        resolvedMapping: "machineResolvedNoHumanDecision",
        scopeMismatch: "machineSourceModelReconciliation",
        parserLimitation: "machineParserImprovement",
        schemaGap: "machineSchemaOrMappingInvestigation",
        registryLifecycleMapped: "machineResolvedNoHumanDecision",
        unmapped: "machineSchemaOrMappingInvestigation",
        genuineConflict: "humanDecisionRequired"
    }[classification] || "machineInvestigationRequired";
}

function buildTriage({ dualSource = readJson(paths.dualSource), conflictTriage = readJson(paths.conflictTriage) } = {}) {
    const claims = Array.isArray(dualSource.claims) ? dualSource.claims : [];
    const candidates = new Map();
    const claimBuckets = {
        total: claims.length,
        needsReview: 0,
        verified: 0,
        notApplicable: 0,
        machineEvidenceRequired: 0,
        humanReviewReady: 0,
        humanSemanticDecisionRequired: 0,
        independentPinnedButVersionBlocked: 0
    };

    for (const claim of claims) {
        if (claim.claimStatus === "needsReview") claimBuckets.needsReview += 1;
        if (claim.claimStatus === "verified") claimBuckets.verified += 1;
        if (claim.claimStatus === "notApplicable") claimBuckets.notApplicable += 1;
        const evidenceReady = claim.machineEvidenceReady === true;
        const semanticConflict = claim.classification === "conflict";
        if (semanticConflict) claimBuckets.humanSemanticDecisionRequired += 1;
        else if (evidenceReady && claim.claimStatus === "needsReview") claimBuckets.humanReviewReady += 1;
        else if (!["notApplicable", "verified"].includes(claim.claimStatus)) claimBuckets.machineEvidenceRequired += 1;
        if (claim.classificationFlags?.includes("independent-provider-pinned-reference")) {
            claimBuckets.independentPinnedButVersionBlocked += 1;
        }

        const key = candidateKey(claim);
        const item = candidates.get(key) || {
            key,
            entityType: claim.entityType,
            entityId: claim.entityId,
            candidateId: claim.candidateId,
            claims: 0,
            evidenceReadyClaims: 0,
            needsReviewClaims: 0,
            verifiedClaims: 0,
            semanticConflictClaims: 0,
            independentPinnedClaims: 0
        };
        item.claims += 1;
        if (evidenceReady || claim.claimStatus === "notApplicable") item.evidenceReadyClaims += 1;
        if (claim.claimStatus === "needsReview") item.needsReviewClaims += 1;
        if (claim.claimStatus === "verified") item.verifiedClaims += 1;
        if (claim.canonicalEligibility === true) item.canonicalEligibility = true;
        if (semanticConflict) item.semanticConflictClaims += 1;
        if (claim.classificationFlags?.includes("independent-provider-pinned-reference")) item.independentPinnedClaims += 1;
        candidates.set(key, item);
    }

    const candidateList = [...candidates.values()].sort((a, b) => a.key.localeCompare(b.key));
    const unresolvedAncillary = (conflictTriage.unmapped || []).filter((item) => ["schemaGap", "unmapped"].includes(item.classification));
    const conflictItems = [...(conflictTriage.conflicts || []), ...unresolvedAncillary]
        .map((item) => ({
            key: item.key,
            weaponId: item.weaponId,
            candidateId: item.candidateId,
            field: item.field,
            classification: item.classification,
            rationaleCode: item.rationaleCode,
            disposition: taskDisposition(item.classification),
            sourceEvidence: {
                sourceRecordId: item.sourceRecordId,
                provider: item.source?.provider || null,
                revision: item.source?.revision || null,
                path: item.source?.path || null,
                sha256: item.source?.sha256 || null,
                locator: item.source?.locator || null,
                sourceField: item.source?.sourceField || null,
                structuredValue: item.source?.structuredValue ?? null,
                units: item.source?.units || null,
                gameVersion: item.source?.gameVersion || null,
                gameVersionVerified: item.source?.gameVersionVerified === true
            },
            recommendedMachineAction: {
                resolvedMapping: "retain semantic mapping and remove the observed projection false-positive",
                scopeMismatch: "reconcile activation/target scope against source control flow",
                parserLimitation: "extend the semantic parser or field projection without inventing values",
                schemaGap: "add a review-gated Spec field or explicit unsupported/display-only disposition",
                unmapped: "add a review-gated Spec field or explicit unsupported/display-only disposition",
                genuineConflict: "preserve both values for later independent human decision"
            }[item.classification] || "investigate with pinned evidence",
            canonicalEligibility: false
        }))
        .sort((a, b) => a.key.localeCompare(b.key));

    const byDisposition = conflictItems.reduce((counts, item) => {
        counts[item.disposition] = (counts[item.disposition] || 0) + 1;
        return counts;
    }, {});
    const independentPinnedCandidates = candidateList.filter((item) => item.independentPinnedClaims > 0);
    const humanReadyCandidates = candidateList.filter((item) => item.claims > 0 && item.evidenceReadyClaims === item.claims && item.needsReviewClaims > 0 && item.verifiedClaims === 0);
    const humanReviewedCandidates = candidateList.filter((item) => item.verifiedClaims > 0 && item.canonicalEligibility === true);
    const humanConflictItems = conflictItems.filter((item) => item.disposition === "humanDecisionRequired");

    return {
        schemaVersion: 1,
        kind: "genshinNeedsReviewTriage",
        generatedAt: "2026-08-23T00:00:00.000Z",
        policy: {
            aiSelfApprovalForbidden: true,
            humanReviewDeferredUntilEvidenceReady: true,
            machineWorkPrecedesHumanReview: true,
            canonicalPromotion: "forbidden"
        },
        generatedFrom: {
            dualSourceAudit: { path: "reports/genshin-v2-dual-source-audit.json", sha256: sha256(paths.dualSource) },
            conflictTriage: { path: "games/genshin/data/v2/weapons/conflict-triage.json", sha256: sha256(paths.conflictTriage) }
        },
        summary: {
            claims: claimBuckets,
            candidates: {
                total: candidateList.length,
                machineEvidenceBlocked: candidateList.length - humanReadyCandidates.length - humanReviewedCandidates.length,
                humanReviewReady: humanReadyCandidates.length,
                humanReviewed: humanReviewedCandidates.length,
                independentPinnedButVersionBlocked: independentPinnedCandidates.length
            },
            conflictFollowup: {
                total: conflictItems.length,
                byDisposition,
                humanDecisionRequiredNow: humanConflictItems.length
            },
            futureIndependentReviewRequired: candidateList.length - humanReviewedCandidates.length,
            canonical: humanReviewedCandidates.length
        },
        priorityMachineWork: independentPinnedCandidates,
        conflictFollowup: conflictItems,
        humanDecisionRequiredNow: humanConflictItems,
        humanReviewReadyCandidates: humanReadyCandidates,
        humanReviewedCandidates
    };
}

function auditTriage(triage) {
    const errors = [];
    if (triage.policy.aiSelfApprovalForbidden !== true) errors.push("AI self-approval must remain forbidden");
    if (triage.summary.canonical !== triage.humanReviewedCandidates.length) errors.push("canonical observation does not match reviewed candidates");
    if (triage.summary.claims.total !== triage.summary.claims.notApplicable + triage.summary.claims.verified + triage.summary.claims.machineEvidenceRequired + triage.summary.claims.humanReviewReady + triage.summary.claims.humanSemanticDecisionRequired) {
        errors.push("claim buckets do not cover the inventory exactly");
    }
    if (triage.humanDecisionRequiredNow.some((item) => item.disposition !== "humanDecisionRequired")) errors.push("human decision list contains a machine task");
    return { schemaVersion: 1, kind: "genshinNeedsReviewTriageAudit", status: errors.length ? "failed" : "passed", errors, summary: triage.summary };
}

function renderMarkdown(triage, audit) {
    const s = triage.summary;
    const dispositions = Object.entries(s.conflictFollowup.byDisposition).sort(([a], [b]) => a.localeCompare(b));
    return [
        "# Genshin needsReview triage",
        "",
        `Status: **${audit.status}**`,
        "",
        `- claims: **${s.claims.total}**`,
        `- machine evidence required: **${s.claims.machineEvidenceRequired}**`,
        `- human-review ready claims: **${s.claims.humanReviewReady}**`,
        `- already human-reviewed claims: **${s.claims.verified}**`,
        `- human semantic decisions required now: **${s.claims.humanSemanticDecisionRequired}**`,
        `- candidates with pinned independent evidence but missing strict version binding: **${s.candidates.independentPinnedButVersionBlocked}**`,
        `- future independent review scope after machine gates pass: **${s.futureIndependentReviewRequired} candidates**`,
        "",
        "## Conflict follow-up",
        "",
        "| disposition | items |",
        "| --- | ---: |",
        ...dispositions.map(([name, count]) => `| ${name} | ${count} |`),
        "",
        "This artifact does not perform review or promotion. It separates remaining `needsReview` work from already recorded human-reviewed canonical data.",
        ""
    ].join("\n");
}

function writeArtifacts(triage = buildTriage()) {
    const audit = auditTriage(triage);
    fs.mkdirSync(path.dirname(paths.output), { recursive: true });
    fs.writeFileSync(paths.output, stableJson(triage), "utf8");
    fs.writeFileSync(paths.reportJson, stableJson(audit), "utf8");
    fs.writeFileSync(paths.reportMarkdown, renderMarkdown(triage, audit), "utf8");
    return { triage, audit };
}

if (require.main === module) {
    const result = writeArtifacts();
    process.stdout.write(stableJson({ status: result.audit.status, summary: result.triage.summary }));
    if (result.audit.status !== "passed") process.exitCode = 1;
}

module.exports = { paths, buildTriage, auditTriage, renderMarkdown, writeArtifacts, stableJson, taskDisposition };
