"use strict";

/**
 * Deterministic reconciliation audit for the behavior-modifier source lane.
 *
 * This lane is intentionally evidence-only.  It joins the authoritative
 * queue with the existing behavior pilot, version-transition snapshots, the
 * historical Xiao review, and the canonical runtime artifact.  It does not
 * parse new semantics, alter a candidate, issue a certificate, or promote a
 * canonical record.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { digestStable, stableValue } = require("./genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const transitionRoot = path.join(dataRoot, "v2", "version-transitions", "6.7-to-7.0");
const paths = Object.freeze({
    behaviorPilot: path.join(dataRoot, "v2", "characters", "behavior-pilot.json"),
    behaviorReviewed: path.join(dataRoot, "v2", "characters", "behavior-reviewed.json"),
    queue: path.join(repositoryRoot, "reports", "genshin-evidence-task-queue.json"),
    canonicalRuntime: path.join(dataRoot, "v2", "runtime", "canonical-runtime.json"),
    eligibilityCertificates: path.join(dataRoot, "v2", "eligibility-certificates.json"),
    deterministicAttestations: path.join(dataRoot, "v2", "deterministic-attestations.json"),
    behaviorModifierSchema: path.join(dataRoot, "schema", "behavior-modifier.schema.json"),
    behaviorSpecSchema: path.join(dataRoot, "schema", "behavior-spec.schema.json"),
    artifact: path.join(dataRoot, "v2", "characters", "behavior-modifier-lane-audit.json"),
    reportJson: path.join(repositoryRoot, "reports", "genshin-behavior-modifier-lane-audit.json"),
    reportMarkdown: path.join(repositoryRoot, "reports", "genshin-behavior-modifier-lane-audit.md"),
    schema: path.join(dataRoot, "schema", "behavior-modifier-lane-audit.schema.json")
});

const generatedAt = "2026-08-26T00:00:00.000Z";
const lane = Object.freeze({
    shardId: "behavior:behaviorModifier:semanticDecisionRequired:standard:01",
    clusterId: "source-unlock:behavior:behaviorModifier:semanticDecisionRequired:standard",
    dataset: "behaviorPilot",
    layer: "behaviorModifier",
    primaryBlockReason: "semanticDecisionRequired"
});
const XIAO_MODIFIER_ID = "behavior-modifier:10000026:constellation-1-1:1";
const TRAVELER_ENTITY_IDS = new Set(["10000005", "10000007"]);
// The authoritative queue is also annotated by the parent transition audit.
// Keep this lane's input projection deliberately narrow so that a derived
// reconciliation annotation cannot become an input to its own digest.
const QUEUE_PROJECTION_KEYS = Object.freeze([
    "candidateId",
    "layer",
    "dataset",
    "terminalState",
    "primaryBlockReason",
    "blockReasons",
    "task",
    "deferredLanes",
    "searchFrontier",
    "certificate",
    "officialVersionImpact",
    "transitionLane",
    "preparedTransitionClaimCount",
    "transitionClaimSchemaStatus",
    "transitionProviderCaptureStatus",
    "fieldComparison",
    "mappingStatus",
    "consumerStatus",
    "machineEvidenceReady",
    "autoProcessableNow"
]);
const DERIVED_QUEUE_KEYS = new Set([
    "behaviorModifierReconciliation",
    "behaviorModifierLaneAudit",
    "reconciliationAudit",
    "laneAudit",
    "audit"
]);
const TRANSITION_SNAPSHOT_FILES = [
    "behavior-entity-snapshot.json",
    "affected-entity-snapshot.json",
    ...Array.from({ length: 15 }, (_, index) => `behavior-shard-${String(index + 2).padStart(2, "0")}-snapshot.json`)
];

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sha256(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function stableJson(value) {
    return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function relativePath(file) {
    return path.relative(repositoryRoot, file).replaceAll("\\", "/");
}

function naturalCompare(left, right) {
    return String(left).localeCompare(String(right), "en", { numeric: true });
}

function uniqueSorted(values) {
    return [...new Set((values || []).filter((value) => value !== undefined && value !== null).map(String))]
        .sort(naturalCompare);
}

function countBy(values) {
    const counts = {};
    for (const value of values) {
        const key = String(value ?? "<null>");
        counts[key] = (counts[key] || 0) + 1;
    }
    return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function fileIntegrity(file) {
    if (!file || !fs.existsSync(file)) return { exists: false, bytes: 0, sha256: null };
    const bytes = fs.readFileSync(file);
    return { exists: true, bytes: bytes.length, sha256: sha256(bytes) };
}

function generatedInput(file) {
    return {
        path: relativePath(file),
        ...fileIntegrity(file)
    };
}

function pick(object, keys) {
    const result = {};
    for (const key of keys) result[key] = object?.[key] ?? null;
    return result;
}

function stripDerivedQueueKeys(value) {
    if (Array.isArray(value)) return value.map(stripDerivedQueueKeys);
    if (!value || typeof value !== "object") return value;
    const result = {};
    for (const [key, nested] of Object.entries(value)) {
        if (DERIVED_QUEUE_KEYS.has(key)) continue;
        result[key] = stripDerivedQueueKeys(nested);
    }
    return result;
}

function projectQueueTask(task) {
    if (!task || typeof task !== "object") return null;
    const projection = {};
    for (const key of QUEUE_PROJECTION_KEYS) {
        if (Object.prototype.hasOwnProperty.call(task, key)) {
            projection[key] = stripDerivedQueueKeys(clone(task[key]));
        }
    }
    return projection;
}

function queueInputProjection(queue) {
    const candidateIds = laneCandidateIds(queue);
    const taskById = new Map((queue?.tasks || []).map((task) => [String(task?.candidateId), task]));
    return {
        projectionVersion: "genshinBehaviorModifierLaneAudit/queue-input-v1",
        clusterId: lane.clusterId,
        shardId: lane.shardId,
        candidateIds,
        tasks: candidateIds.map((candidateId) => projectQueueTask(taskById.get(candidateId)))
    };
}

function queueCluster(queue) {
    return (queue.unlockClusters || []).find((cluster) => cluster.clusterId === lane.clusterId) || null;
}

function laneCandidateIds(queue) {
    const cluster = queueCluster(queue);
    const shard = cluster?.shards?.find((item) => item.shardId === lane.shardId);
    return uniqueSorted(shard?.candidateIds || []);
}

function sourceRecordSummary(sourceRef, source) {
    if (!source || typeof source !== "object") {
        return {
            id: sourceRef,
            present: false,
            kind: null,
            provider: null,
            independenceGroup: null,
            providerIndependence: null,
            gameVersion: null,
            strictGameVersionBinding: false,
            strictGameVersionBindingEvidence: false,
            gameVersionEvidence: null,
            locator: null,
            capturedAt: null,
            locale: null,
            integrity: null,
            rawTextPresent: false,
            rawDigestRecomputed: null,
            rawDigestMatches: false,
            lineageEvidencePresent: false,
            independenceEvidenceStatus: "missing"
        };
    }
    const rawTextPresent = typeof source.text === "string";
    const rawDigestRecomputed = rawTextPresent ? sha256(source.text) : null;
    const integrity = clone(source.integrity ?? null);
    const rawDigestMatches = Boolean(
        rawTextPresent
        && integrity?.algorithm === "sha256"
        && typeof integrity.digest === "string"
        && integrity.digest === rawDigestRecomputed
    );
    const gameVersionEvidence = clone(source.gameVersionEvidence ?? null);
    // A source-record boolean is only an observation.  It becomes evidence
    // here only when the immutable raw value is digest-bound and the record
    // carries provider-authored version evidence tied to that record.
    const strictGameVersionBindingEvidence = Boolean(
        source.gameVersion
        && rawDigestMatches
        && gameVersionEvidence
        && typeof gameVersionEvidence === "object"
        && Object.keys(gameVersionEvidence).length > 0
        && source.strictGameVersionBinding === true
    );
    const lineageEvidencePresent = Boolean(
        source.lineageEvidence
        && typeof source.lineageEvidence === "object"
        && Object.keys(source.lineageEvidence).length > 0
    );
    return {
        id: sourceRef,
        present: true,
        kind: source.kind ?? null,
        provider: source.provider ?? null,
        independenceGroup: source.independenceGroup ?? null,
        providerIndependence: source.providerIndependence ?? null,
        gameVersion: source.gameVersion ?? null,
        strictGameVersionBinding: source.strictGameVersionBinding === true,
        strictGameVersionBindingEvidence,
        gameVersionEvidence,
        locator: clone(source.locator ?? null),
        capturedAt: source.capturedAt ?? null,
        locale: source.locale ?? null,
        integrity,
        rawTextPresent,
        rawDigestRecomputed,
        rawDigestMatches,
        lineageEvidencePresent,
        independenceEvidenceStatus: lineageEvidencePresent ? "sourceLineageEvidenceObserved" : "metadataOnly"
    };
}

function sourceEvidence(sourceRefs, sourceRecords) {
    const records = uniqueSorted(sourceRefs).map((sourceRef) => sourceRecordSummary(sourceRef, sourceRecords[sourceRef]));
    const present = records.filter((record) => record.present);
    const groups = uniqueSorted(present.map((record) => record.independenceGroup));
    const providers = uniqueSorted(present.map((record) => record.provider));
    const versions = uniqueSorted(present.map((record) => record.gameVersion));
    const allCorrelated = present.length > 0 && present.every((record) => record.providerIndependence === "correlated");
    const allLocal = present.length > 0 && present.every((record) => record.provider === "damageTool-local");
    const allVersionUnbound = present.length > 0 && present.every((record) => record.gameVersion === null && record.strictGameVersionBinding === false);
    const rawDigestVerifiedCount = present.filter((record) => record.rawDigestMatches).length;
    const lineageEvidenceCount = present.filter((record) => record.lineageEvidencePresent).length;
    const strictVersionEvidenceCount = present.filter((record) => record.strictGameVersionBindingEvidence).length;
    const distinctFamilyCount = new Set(present.map((record) => `${record.provider || "<missing>"}::${record.independenceGroup || "<missing>"}`)).size;
    const allRawDigestsVerified = records.length === present.length && present.length > 0 && rawDigestVerifiedCount === present.length;
    return {
        sourceRefs: records,
        allResolved: records.length === present.length,
        sourceRefCount: records.length,
        resolvedSourceRefCount: present.length,
        rawDigestVerifiedCount,
        allRawDigestsVerified,
        lineageEvidenceCount,
        strictVersionEvidenceCount,
        distinctFamilyCount,
        providers,
        independenceGroups: groups,
        observedGameVersions: versions,
        observedProviderIndependence: uniqueSorted(present.map((record) => record.providerIndependence)),
        classification: allLocal && allCorrelated && allVersionUnbound
            && allRawDigestsVerified
            ? "singleCorrelatedLocalSourceEvidence"
            : allCorrelated
                ? "correlatedSourceEvidence"
                : "mixedOrMissingSourceEvidence",
        // Independence is never established from providerIndependence or a
        // policy boolean in this artifact.  No source record in the pilot
        // carries source-owned lineage evidence for an independent family.
        independentFamilyCount: 0,
        sourceAgreement: {
            status: "notEstablished",
            comparedFamilies: distinctFamilyCount,
            acceptedAsProof: false,
            reason: "same-local-family-or-metadata-only; no independent field-level comparison"
        },
        externalIndependentVersionedPairObserved: false,
        eligibilityProof: {
            strictGameVersionBinding: false,
            fieldLevelAgreement: false,
            accepted: false,
            reason: "source-record metadata is retained as observation only"
        }
    };
}

function transitionEntityIds(snapshot) {
    const claim = snapshot?.claim || {};
    const coverage = claim.coverage || {};
    return new Set([
        ...(coverage.resolvedEntityIds || []),
        ...(coverage.ambiguousEntityIds || []),
        ...(coverage.entityIds || []),
        ...(claim.shard?.authoritativeEntityIds || []),
        ...(claim.queueShard?.authoritativeEntityIds || []),
        ...(claim.resolvedEntities || []).map((entity) => entity?.entityId),
        ...(claim.unresolvedEntities || []).map((entity) => entity?.entityId)
    ].filter(Boolean).map(String));
}

function transitionCoverageStatus(snapshot, entityId) {
    const coverage = snapshot?.claim?.coverage || {};
    if ((coverage.resolvedEntityIds || []).map(String).includes(String(entityId))) return "resolved";
    if ((coverage.ambiguousEntityIds || []).map(String).includes(String(entityId))) return "ambiguous";
    if ((coverage.entityIds || []).map(String).includes(String(entityId))) return "affectedEntity";
    if (transitionEntityIds(snapshot).has(String(entityId))) return "presentInSnapshot";
    return "missing";
}

function transitionSnapshotSummary(file, snapshot, entityId) {
    const claim = snapshot.claim || {};
    const summary = snapshot.summary || {};
    const gate = snapshot.gateEligibility || {};
    const coverage = claim.coverage || {};
    return {
        path: relativePath(file),
        kind: snapshot.kind ?? null,
        fieldDigest: snapshot.fieldDigest ?? null,
        transitionId: claim.transitionId ?? null,
        shardId: claim.shard?.shardId ?? claim.queueShard?.shardId ?? null,
        sourceFamily: claim.sourceFamily ?? null,
        sourceFamilyCount: summary.sourceFamilyCount ?? claim.sourceFamilyCount ?? null,
        entityId: String(entityId),
        coverageStatus: transitionCoverageStatus(snapshot, entityId),
        coverage: {
            authoritativeCandidateCoverage: coverage.authoritativeCandidateCoverage ?? null,
            resolvedEntityRecordCoverage: coverage.resolvedEntityRecordCoverage ?? null,
            repositoryCandidateCoverage: coverage.repositoryCandidateCoverage ?? null,
            authoritativeCandidateCount: coverage.authoritativeCandidateCount ?? null,
            authoritativeEntityCount: coverage.authoritativeEntityCount ?? null,
            resolvedEntityCount: coverage.resolvedEntityCount ?? null,
            resolvedRecordCount: coverage.resolvedRecordCount ?? null,
            changedRecordCount: coverage.changedRecordCount ?? summary.changedRecords ?? null,
            changedFieldCount: coverage.changedFieldCount ?? summary.changedFields ?? null,
            canIssueEligibilityCertificate: coverage.canIssueEligibilityCertificate ?? gate.canIssueEligibilityCertificate ?? null,
            canPromoteCanonical: coverage.canPromoteCanonical ?? gate.canPromoteCanonical ?? null
        },
        gate: {
            status: gate.status ?? null,
            canIssueEligibilityCertificate: gate.canIssueEligibilityCertificate ?? gate.canIssueEligibilityCertificate ?? null,
            canPromoteCanonical: gate.canPromoteCanonical ?? gate.canPromoteCanonical ?? null,
            reasons: uniqueSorted(gate.reasons || [])
        }
    };
}

function loadTransitionSnapshots() {
    const snapshots = [];
    for (const fileName of TRANSITION_SNAPSHOT_FILES) {
        const file = path.join(transitionRoot, fileName);
        if (!fs.existsSync(file)) continue;
        const snapshot = readJson(file);
        snapshots.push({ file, snapshot });
    }
    return snapshots;
}

function transitionEvidenceForEntity(snapshots, entityId) {
    return snapshots
        .filter(({ snapshot }) => transitionEntityIds(snapshot).has(String(entityId)))
        .map(({ file, snapshot }) => transitionSnapshotSummary(file, snapshot, entityId))
        .sort((left, right) => left.path.localeCompare(right.path));
}

function queueCertificateSummary(certificate) {
    if (!certificate || typeof certificate !== "object") {
        return {
            status: "missing",
            strictEligible: false,
            strictGameVersionBinding: false,
            sourceStrictGameVersionBinding: false,
            pairScopeApproved: false,
            revisionPinned: false,
            sourceRecordDigestBound: false,
            providerFrontier: null,
            candidateClaimCount: 0,
            eligibleClaimCount: 0,
            blockedClaimCount: 0,
            attestation: { status: "missing", result: null, qualifying: false, acceptedAsProof: false },
            metadataOnly: true,
            acceptedAsProof: false
        };
    }
    return {
        status: certificate.status ?? "missing",
        strictEligible: certificate.strictEligible === true,
        strictGameVersionBinding: certificate.strictGameVersionBinding === true,
        sourceStrictGameVersionBinding: certificate.sourceStrictGameVersionBinding === true,
        pairScopeApproved: certificate.pairScopeApproved === true,
        revisionPinned: certificate.revisionPinned === true,
        sourceRecordDigestBound: certificate.sourceRecordDigestBound === true,
        providerFrontier: certificate.providerFrontier ?? null,
        candidateClaimCount: certificate.candidateClaimCount ?? 0,
        eligibleClaimCount: certificate.eligibleClaimCount ?? 0,
        blockedClaimCount: certificate.blockedClaimCount ?? 0,
        attestation: {
            status: certificate.attestation?.status ?? "missing",
            result: certificate.attestation?.result ?? null,
            qualifying: certificate.attestation?.qualifying === true,
            acceptedAsProof: false
        },
        metadataOnly: true,
        acceptedAsProof: false
    };
}

function registryMatches(items, candidateId, fields) {
    return (Array.isArray(items) ? items : [])
        .filter((item) => fields.some((field) => String(item?.[field] ?? "") === String(candidateId))
            || String(item?.scope?.candidateId ?? "") === String(candidateId)
            || String(item?.scope?.subjectId ?? "") === String(candidateId)
            || String(item?.subjectId ?? "").startsWith(`${candidateId}:`)
            || String(item?.certificateId ?? item?.attestationId ?? "").startsWith(`${candidateId}:`))
        .map((item) => ({
            id: item.certificateId ?? item.attestationId ?? null,
            status: item.status ?? null,
            claimId: item.claimId ?? null,
            field: item.field ?? item.claimField ?? null,
            targetGameVersion: item.targetGameVersion ?? null,
            canonicalEligibility: item.canonicalEligibility === true,
            metadataOnly: true,
            acceptedAsProof: false
        }))
        .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function historicalProofSummary(canonicalEntry) {
    const claims = canonicalEntry?.provenance?.verification?.claims || {};
    const fields = Object.keys(claims).sort();
    const certificates = fields
        .map((field) => ({ field, proof: claims[field]?.eligibilityCertificate }))
        .filter(({ proof }) => proof && typeof proof === "object")
        .map(({ field, proof }) => ({
            field,
            id: proof.certificateId ?? null,
            status: proof.status ?? null,
            subjectId: proof.subjectId ?? proof.scope?.subjectId ?? null,
            claimField: proof.claimField ?? proof.scope?.claimField ?? null,
            issuedAt: proof.issuedAt ?? null,
            verificationMode: proof.verificationMode ?? null
        }));
    const attestations = fields
        .map((field) => ({ field, proof: claims[field]?.verificationAttestation }))
        .filter(({ proof }) => proof && typeof proof === "object")
        .map(({ field, proof }) => ({
            field,
            id: proof.attestationId ?? null,
            decision: proof.decision ?? null,
            subjectId: proof.subjectId ?? null,
            claimField: proof.claimField ?? null,
            attestedAt: proof.attestedAt ?? null,
            verificationMode: proof.verificationMode ?? null
        }));
    const materializedCertificateCount = certificates.filter((proof) => proof.status === "eligible" && proof.subjectId).length;
    const materializedAttestationCount = attestations.filter((proof) => proof.decision === "approve" && proof.subjectId).length;
    return {
        status: certificates.length || attestations.length ? "historicalEmbedded" : "absent",
        verificationStatus: canonicalEntry?.provenance?.verification?.status ?? null,
        gameVersion: canonicalEntry?.provenance?.gameVersion ?? null,
        claimFields: fields,
        eligibilityCertificates: certificates,
        verificationAttestations: attestations,
        materializedProofs: {
            certificateCount: certificates.length,
            attestationCount: attestations.length,
            eligibleCertificateCount: materializedCertificateCount,
            approvingAttestationCount: materializedAttestationCount,
            status: materializedCertificateCount > 0 && materializedAttestationCount > 0
                ? "historicalProofObjectsObserved"
                : "incomplete"
        }
    };
}

function comparableModifier(modifier) {
    if (!modifier || typeof modifier !== "object") return null;
    return pick(modifier, ["id", "targetSpecId", "path", "operation", "value", "condition"]);
}

function comparableSpec(spec) {
    if (!spec || typeof spec !== "object") return null;
    return pick(spec, ["id", "entity", "timing", "execution", "lifecycle", "unknownFields"]);
}

function reviewSourceBindingSummary(reviewedModifier, reviewedSpec, reviewDecision, sourceRecords, currentModifier, currentSpec) {
    const claims = reviewedModifier?.verification?.claims || reviewedSpec?.verification?.claims || {};
    const externalClaims = Object.entries(claims)
        .filter(([, claim]) => claim?.claimKind === "externalFactual");
    const sourceRefs = uniqueSorted([
        ...(reviewedModifier?.sourceRefs || []),
        ...(reviewedSpec?.sourceRefs || []),
        ...externalClaims.flatMap(([, claim]) => claim?.sourceRefs || [])
    ]);
    const records = sourceRefs.map((sourceRef) => sourceRecordSummary(sourceRef, sourceRecords?.[sourceRef]));
    const present = records.filter((record) => record.present);
    const providers = uniqueSorted(present.map((record) => record.provider));
    const groups = uniqueSorted(present.map((record) => record.independenceGroup));
    const claimSourceRefsBound = externalClaims.length > 0 && externalClaims.every(([, claim]) => {
        const refs = uniqueSorted(claim?.sourceRefs || []);
        return refs.length > 0 && refs.every((ref) => present.some((record) => record.id === ref));
    });
    const rawDigestsVerified = records.length === present.length
        && present.length > 0
        && present.every((record) => record.rawDigestMatches);
    const versionEvidenceVerified = present.length > 0
        && present.every((record) => record.strictGameVersionBindingEvidence)
        && new Set(present.map((record) => record.gameVersion)).size === 1;
    const distinctProviderGroups = providers.length >= 2 && groups.length >= 2;
    const decisionTargetExact = reviewDecision?.decision === "approve"
        && reviewDecision?.target?.modifierId === reviewedModifier?.id
        && reviewDecision?.target?.targetSpecId === reviewedModifier?.targetSpecId;
    const currentModifierMatches = stableJson(comparableModifier(reviewedModifier)) === stableJson(comparableModifier(currentModifier));
    const currentSpecMatches = stableJson(comparableSpec(reviewedSpec)) === stableJson(comparableSpec(currentSpec));
    const reasons = [];
    if (!decisionTargetExact) reasons.push("reviewDecisionTargetOrDecisionInvalid");
    if (!currentModifierMatches) reasons.push("reviewedModifierObservedFieldsDoNotMatchCurrentPilot");
    if (!currentSpecMatches) reasons.push("reviewedSpecObservedFieldsDoNotMatchCurrentPilot");
    if (!claimSourceRefsBound) reasons.push("reviewClaimSourceRefsUnbound");
    if (!rawDigestsVerified) reasons.push("reviewSourceRawDigestMissingOrMismatch");
    if (!versionEvidenceVerified) reasons.push("reviewSourceVersionEvidenceMissingOrMismatch");
    if (!distinctProviderGroups) reasons.push("reviewSourceProviderGroupsNotDistinct");
    return {
        status: reasons.length === 0 ? "bound" : "invalid",
        reasons: uniqueSorted(reasons),
        sourceRefs,
        sourceRecords: records,
        providers,
        independenceGroups: groups,
        externalClaimCount: externalClaims.length,
        claimSourceRefsBound,
        rawDigestsVerified,
        versionEvidenceVerified,
        distinctProviderGroups,
        independentSourceProofAccepted: false,
        evidenceBasis: "materialized-source-records-only; review/policy booleans are observations"
    };
}

function reviewedSummary(reviewedModifier, reviewedSpec, reviewDecision, sourceRecords, currentModifier, currentSpec) {
    if (!reviewedModifier && !reviewedSpec && !reviewDecision) {
        return {
            present: false,
            modifierPresent: false,
            specPresent: false,
            reviewDecisionApplies: false,
            modifierVerificationStatus: null,
            specVerificationStatus: null,
            canonicalEligibility: false,
            canonicalEligibilityMetadataObserved: false,
            reviewedBy: null,
            reviewedAt: null,
            claimFields: [],
            historicalReviewBinding: {
                status: "absent",
                reasons: ["noReviewRecord"],
                sourceRefs: [],
                sourceRecords: [],
                providers: [],
                independenceGroups: [],
                externalClaimCount: 0,
                claimSourceRefsBound: false,
                rawDigestsVerified: false,
                versionEvidenceVerified: false,
                distinctProviderGroups: false,
                independentSourceProofAccepted: false,
                evidenceBasis: "no-review-record"
            }
        };
    }
    const claims = reviewedModifier?.verification?.claims || reviewedSpec?.verification?.claims || {};
    const historicalReviewBinding = reviewSourceBindingSummary(
        reviewedModifier,
        reviewedSpec,
        reviewDecision,
        sourceRecords,
        currentModifier,
        currentSpec
    );
    return {
        present: true,
        modifierPresent: Boolean(reviewedModifier),
        specPresent: Boolean(reviewedSpec),
        reviewDecisionApplies: reviewDecision?.target?.modifierId === reviewedModifier?.id,
        modifierVerificationStatus: reviewedModifier?.verification?.status ?? null,
        specVerificationStatus: reviewedSpec?.verification?.status ?? null,
        // Keep the raw metadata observable, but do not expose it as an
        // authoritative eligibility result.  Classification below uses the
        // materialized binding summary instead of these booleans/labels.
        canonicalEligibility: false,
        canonicalEligibilityMetadataObserved: reviewedModifier?.verification?.canonicalEligibility === true
            || reviewedModifier?.verification?.state === "canonicalEligible"
            || reviewedSpec?.verification?.canonicalEligibility === true,
        reviewedBy: reviewedModifier?.verification?.reviewedBy ?? reviewedSpec?.verification?.reviewedBy ?? reviewDecision?.reviewedBy ?? null,
        reviewedAt: reviewedModifier?.verification?.reviewedAt ?? reviewedSpec?.verification?.reviewedAt ?? reviewDecision?.reviewedAt ?? null,
        claimFields: Object.entries(claims).sort(([left], [right]) => left.localeCompare(right)).map(([field, claim]) => ({
            field,
            status: claim?.status ?? null,
            claimKind: claim?.claimKind ?? null,
            sourceRefs: uniqueSorted(claim?.sourceRefs || []),
            machineEvidenceReady: claim?.machineEvidence?.ready === true,
            machineComparison: claim?.machineEvidence?.comparison ?? null,
            hasEligibilityCertificate: Boolean(claim?.eligibilityCertificate),
            hasVerificationAttestation: Boolean(claim?.verificationAttestation),
            metadataOnlyEvidence: true
        })),
        historicalReviewBinding
    };
}

function canonicalRuntimeSummary(canonicalEntry, canonicalRuntime) {
    const availability = canonicalRuntime?.versionAvailability || {};
    if (!canonicalEntry) {
        return {
            present: false,
            runtimeStatus: null,
            targetSpecId: null,
            destination: null,
            provenanceStatus: null,
            provenanceGameVersion: null,
            versionAvailability: pick(availability, ["status", "activeForProduction", "verifiedGameVersion", "observedLiveVersion", "transitionId"])
        };
    }
    return {
        present: true,
        runtimeStatus: canonicalEntry.runtime?.status ?? null,
        targetSpecId: canonicalEntry.targetSpecId ?? null,
        destination: clone(canonicalEntry.destination ?? null),
        provenanceStatus: canonicalEntry.provenance?.status ?? null,
        provenanceGameVersion: canonicalEntry.provenance?.gameVersion ?? null,
        versionAvailability: pick(availability, ["status", "activeForProduction", "verifiedGameVersion", "observedLiveVersion", "transitionId"])
    };
}

function classifyCandidate({
    id,
    entityId,
    queueTask,
    sourceEvidenceValue,
    reviewed,
    canonical,
    historicalProofs,
    transitionSnapshots
}) {
    const historicalCanonicalPendingRevalidation = id === XIAO_MODIFIER_ID
        && reviewed.present
        && reviewed.reviewDecisionApplies
        && reviewed.historicalReviewBinding?.status === "bound"
        && canonical.present
        && canonical.provenanceStatus === "canonical"
        && canonical.versionAvailability.status === "inactivePendingRevalidation"
        && canonical.provenanceGameVersion === "6.7"
        && historicalProofs.materializedProofs?.status === "historicalProofObjectsObserved";
    const travelerVariant = TRAVELER_ENTITY_IDS.has(String(entityId));
    const classification = historicalCanonicalPendingRevalidation
        ? "historicalCanonicalPendingRevalidation"
        : "singleCorrelatedOrMissingEvidence";
    const reasons = historicalCanonicalPendingRevalidation
        ? [
            "historicalReviewEvidenceBindingVerified",
            "historicalCanonicalRuntimeEntryExists",
            "canonicalRuntimeInactivePendingRevalidation",
            "historicalGameVersion6.7ObservedLiveVersion7.0",
            "historicalProofObjectsObservedNotCurrentProof",
            "currentCertificateRegistryHasNoEntry",
            "bulkTransitionCaptureUnassigned",
            "targetVersionRevalidationRequired"
        ]
        : [
            "noScopedHumanReview",
            "noCanonicalRuntimeEntry",
            sourceEvidenceValue.classification === "singleCorrelatedLocalSourceEvidence"
                ? "singleCorrelatedLocalSourceEvidence"
                : "sourceEvidenceMissingOrMixed",
            "gameVersionUnbound",
            "providerIndependenceCorrelated",
            "externalIndependentEvidenceMissing",
            "bulkTransitionCaptureUnassigned",
            "semanticDecisionRequired"
        ];
    return {
        classification,
        evidenceClass: historicalCanonicalPendingRevalidation
            ? "historicalIndependentReviewEvidence"
            : sourceEvidenceValue.classification,
        reasons: uniqueSorted(reasons),
        entityId: String(entityId),
        travelerVariant: {
            status: travelerVariant ? "variantEvidenceRequired" : "notApplicable",
            entityId: String(entityId),
            policy: "Traveler variants remain separate; no variant identity is inferred or collapsed."
        },
        transitionSnapshotCount: transitionSnapshots.length,
        historicalProofStatus: historicalProofs.status,
        inferencePerformed: false,
        observedValueConditionScopeOnly: true,
        certificateEligible: false,
        canonicalPromotionEligible: false,
        canonicalPromotion: "forbidden",
        queuePrimaryBlockReason: queueTask?.primaryBlockReason ?? null
    };
}

function loadInputs() {
    const behaviorPilot = readJson(paths.behaviorPilot);
    const behaviorReviewed = readJson(paths.behaviorReviewed);
    const queue = readJson(paths.queue);
    const canonicalRuntime = readJson(paths.canonicalRuntime);
    const eligibilityCertificates = readJson(paths.eligibilityCertificates);
    const deterministicAttestations = readJson(paths.deterministicAttestations);
    const transitionSnapshots = loadTransitionSnapshots();
    return {
        behaviorPilot,
        behaviorReviewed,
        queue,
        canonicalRuntime,
        eligibilityCertificates,
        deterministicAttestations,
        transitionSnapshots
    };
}

function loadInputsWithQueue(queue) {
    const inputs = loadInputs();
    if (queue === undefined) return inputs;
    return { ...inputs, queue };
}

function buildCandidate(id, inputs) {
    const modifier = inputs.behaviorPilot.modifiers?.[id] || null;
    const targetSpecId = modifier?.targetSpecId ?? null;
    const targetSpec = targetSpecId ? inputs.behaviorPilot.specs?.[targetSpecId] || null : null;
    const queueTask = (inputs.queue.tasks || []).find((task) => task.candidateId === id) || null;
    const entityId = targetSpec?.entity?.id ?? null;
    const sourceRefs = uniqueSorted([...(modifier?.sourceRefs || []), ...(targetSpec?.sourceRefs || [])]);
    const evidence = sourceEvidence(sourceRefs, inputs.behaviorPilot.sourceRecords || {});
    const transitionSnapshots = transitionEvidenceForEntity(inputs.transitionSnapshots, entityId);
    const reviewedModifier = inputs.behaviorReviewed.modifiers?.[id] || null;
    const reviewedSpec = reviewedModifier?.targetSpecId
        ? inputs.behaviorReviewed.behaviorSpecs?.[reviewedModifier.targetSpecId] || null
        : null;
    const reviewDecision = inputs.behaviorReviewed.reviewDecision?.target?.modifierId === id
        ? inputs.behaviorReviewed.reviewDecision
        : null;
    const canonicalEntry = inputs.canonicalRuntime.modifiers?.[id] || null;
    const historicalProofs = historicalProofSummary(canonicalEntry);
    const certificateMatches = registryMatches(inputs.eligibilityCertificates.certificates, id, ["candidateId", "subjectId"]);
    const attestationMatches = registryMatches(inputs.deterministicAttestations.attestations, id, ["candidateId", "subjectId", "attestationId"]);
    const reviewed = reviewedSummary(
        reviewedModifier,
        reviewedSpec,
        reviewDecision,
        inputs.behaviorReviewed.sourceRecords || {},
        modifier,
        targetSpec
    );
    const canonical = canonicalRuntimeSummary(canonicalEntry, inputs.canonicalRuntime);
    const classification = classifyCandidate({
        id,
        entityId,
        queueTask,
        sourceEvidenceValue: evidence,
        reviewed,
        canonical,
        historicalProofs,
        transitionSnapshots
    });
    return {
        id,
        entityId: entityId === null ? null : String(entityId),
        inventory: {
            dataset: lane.dataset,
            layer: lane.layer,
            present: Boolean(modifier),
            sourcePath: relativePath(paths.behaviorPilot),
            sourceRefs: uniqueSorted(modifier?.sourceRefs || []),
            verification: clone(modifier?.verification ?? null),
            observedModifier: modifier
                ? {
                    targetSpecId: modifier.targetSpecId,
                    path: modifier.path,
                    operation: modifier.operation,
                    value: clone(modifier.value),
                    condition: clone(modifier.condition),
                    sourceRefs: uniqueSorted(modifier.sourceRefs || []),
                    interpretationStatus: "observedOnly"
                }
                : null,
            modifierDigest: modifier ? digestStable(modifier) : null
        },
        sourceBehaviorSpec: {
            status: targetSpec ? "resolved" : "missing",
            sourcePath: relativePath(paths.behaviorPilot),
            id: targetSpec?.id ?? targetSpecId,
            entity: clone(targetSpec?.entity ?? null),
            sourceRefs: uniqueSorted(targetSpec?.sourceRefs || []),
            sourceEvidence: sourceEvidence(targetSpec?.sourceRefs || [], inputs.behaviorPilot.sourceRecords || {}),
            verificationStatus: targetSpec?.verification?.status ?? null,
            specDigest: targetSpec ? digestStable(targetSpec) : null
        },
        bulkTransitionCapture: {
            queuePath: relativePath(paths.queue),
            queueTaskId: queueTask?.task?.taskId ?? null,
            fieldPresent: Boolean(queueTask && Object.prototype.hasOwnProperty.call(queueTask, "bulkTransitionCapture")),
            status: queueTask?.bulkTransitionCapture == null ? "unassigned" : "assigned",
            value: clone(queueTask?.bulkTransitionCapture ?? null)
        },
        mapping: {
            queueStatus: queueTask?.mappingStatus ?? null,
            targetSpecId,
            targetSpecPresent: Boolean(targetSpec),
            targetSpecEntity: clone(targetSpec?.entity ?? null),
            targetSpecSourceRefs: uniqueSorted(targetSpec?.sourceRefs || []),
            status: targetSpec ? "prepared" : "missing",
            inferencePerformed: false
        },
        consumer: {
            queueStatus: queueTask?.consumerStatus ?? null,
            deferredLanes: clone(queueTask?.deferredLanes || []),
            canonicalRuntime: canonical,
            reviewedDecision: reviewed,
            destinationObserved: clone(canonicalEntry?.destination ?? null)
        },
        sourceEvidence: evidence,
        transitionSnapshots,
        certificate: {
            queue: queueCertificateSummary(queueTask?.certificate),
            registry: {
                matchingCount: certificateMatches.length,
                strictEligibleCount: certificateMatches.filter((item) => item.status === "eligible" && item.canonicalEligibility).length,
                acceptedAsProof: false,
                entries: certificateMatches
            },
            historicalEmbedded: historicalProofs.eligibilityCertificates,
            status: certificateMatches.length ? "registryEvidencePresent" : historicalProofs.eligibilityCertificates.length ? "historicalEmbeddedOnly" : "missing",
            strictEligible: false
        },
        attestation: {
            queue: queueCertificateSummary(queueTask?.certificate).attestation,
            registry: {
                matchingCount: attestationMatches.length,
                qualifyingCount: attestationMatches.filter((item) => item.status === "eligible").length,
                acceptedAsProof: false,
                entries: attestationMatches
            },
            historicalEmbedded: historicalProofs.verificationAttestations,
            status: attestationMatches.length ? "registryEvidencePresent" : historicalProofs.verificationAttestations.length ? "historicalEmbeddedOnly" : "missing",
            qualifying: false
        },
        classification
    };
}

function buildAudit({ inputs, queue } = {}) {
    const currentInputs = inputs
        ? { ...inputs, ...(queue === undefined ? {} : { queue }) }
        : loadInputsWithQueue(queue);
    inputs = currentInputs;
    const candidateIds = laneCandidateIds(inputs.queue);
    const modifiers = inputs.behaviorPilot.modifiers || {};
    const candidates = candidateIds.map((id) => buildCandidate(id, inputs));
    const queueTasks = candidates.map((candidate) => (inputs.queue.tasks || []).find((task) => task.candidateId === candidate.id));
    const queueProjection = queueInputProjection(inputs.queue);
    const sourceRefs = candidates.flatMap((candidate) => candidate.sourceEvidence.sourceRefs.map((source) => source.id));
    const transitionPaths = uniqueSorted(candidates.flatMap((candidate) => candidate.transitionSnapshots.map((snapshot) => snapshot.path)));
    const generatedFrom = {
        behaviorPilot: generatedInput(paths.behaviorPilot),
        behaviorReviewed: generatedInput(paths.behaviorReviewed),
        authoritativeQueue: {
            path: relativePath(paths.queue),
            projectionVersion: queueProjection.projectionVersion,
            projectionFields: [...QUEUE_PROJECTION_KEYS],
            candidateCount: queueProjection.candidateIds.length,
            taskCount: queueProjection.tasks.filter(Boolean).length,
            projectionDigest: digestStable(queueProjection)
        },
        canonicalRuntime: generatedInput(paths.canonicalRuntime),
        eligibilityCertificates: generatedInput(paths.eligibilityCertificates),
        deterministicAttestations: generatedInput(paths.deterministicAttestations),
        behaviorModifierSchema: generatedInput(paths.behaviorModifierSchema),
        behaviorSpecSchema: generatedInput(paths.behaviorSpecSchema),
        transitionSnapshots: transitionPaths.map((snapshotPath) => generatedInput(path.join(repositoryRoot, snapshotPath)))
    };
    const queueBulkStatuses = candidates.map((candidate) => candidate.bulkTransitionCapture.status);
    const queueMappingStatuses = candidates.map((candidate) => candidate.mapping.queueStatus);
    const queueConsumerStatuses = candidates.map((candidate) => candidate.consumer.queueStatus);
    // Report the reconciled class here rather than the raw local-source
    // classifier so Xiao's separately proven historical review is not mixed
    // into the 35 still-correlated candidates.  The raw evidence remains
    // preserved on each candidate under sourceEvidence.
    const sourceEvidenceClasses = candidates.map((candidate) => candidate.classification.evidenceClass);
    const classifications = candidates.map((candidate) => candidate.classification.classification);
    const travelerStatuses = candidates.map((candidate) => candidate.classification.travelerVariant.status);
    const transitionGateStatuses = candidates.flatMap((candidate) => candidate.transitionSnapshots.map((snapshot) => snapshot.gate.status));
    const missingQueueTaskCount = queueTasks.filter((task) => !task).length;
    const missingModifierCount = candidateIds.filter((id) => !modifiers[id]).length;
    const missingTargetSpecCount = candidates.filter((candidate) => candidate.sourceBehaviorSpec.status !== "resolved").length;
    const strictCertificates = candidates.filter((candidate) => candidate.certificate.strictEligible).length;
    const strictAttestations = candidates.filter((candidate) => candidate.attestation.qualifying).length;
    const canonicalRuntimeCandidates = candidates.filter((candidate) => candidate.consumer.canonicalRuntime.present);
    const claim = {
        lane,
        candidateIds,
        candidateInventoryDigest: digestStable(candidateIds),
        queueInputProjectionDigest: digestStable(queueProjection),
        queueTaskDigest: digestStable(queueProjection.tasks),
        sourceRefDigest: digestStable(uniqueSorted(sourceRefs)),
        candidates
    };
    const errors = [];
    if (candidateIds.length !== 36) errors.push(`candidateCount:${candidateIds.length}`);
    if (candidateIds.length !== new Set(candidateIds).size) errors.push("candidateIdsDuplicate");
    if (candidateIds.some((id) => !modifiers[id])) errors.push("behaviorPilotModifierMissing");
    if (candidates.some((candidate) => candidate.entityId === null)) errors.push("entityIdMissing");
    if (missingQueueTaskCount) errors.push(`queueTaskMissing:${missingQueueTaskCount}`);
    if (missingModifierCount) errors.push(`modifierMissing:${missingModifierCount}`);
    if (missingTargetSpecCount) errors.push(`targetSpecMissing:${missingTargetSpecCount}`);
    if (candidates.some((candidate) => !candidate.sourceEvidence.allResolved)) errors.push("sourceRecordMissing");
    if (candidates.some((candidate) => !candidate.sourceEvidence.allRawDigestsVerified)) errors.push("sourceRawDigestMismatch");
    if (candidates.some((candidate) => candidate.sourceEvidence.classification !== "singleCorrelatedLocalSourceEvidence")) errors.push("unexpectedSourceEvidenceClass");
    if (candidates.some((candidate) => candidate.sourceEvidence.independentFamilyCount !== 0
        || candidate.sourceEvidence.sourceAgreement?.acceptedAsProof !== false
        || candidate.sourceEvidence.eligibilityProof?.accepted !== false
        || candidate.sourceEvidence.externalIndependentVersionedPairObserved !== false)) errors.push("sourceEvidenceGateInvalid");
    if (candidates.some((candidate) => candidate.classification.inferencePerformed)) errors.push("inferencePerformed");
    if (strictCertificates || strictAttestations) errors.push("strictProofUnexpected");
    if (candidates.some((candidate) => candidate.classification.canonicalPromotionEligible)) errors.push("canonicalPromotionUnexpected");
    if (classifications.filter((value) => value === "historicalCanonicalPendingRevalidation").length !== 1) errors.push("historicalXiaoClassificationInvalid");
    if (classifications.filter((value) => value === "singleCorrelatedOrMissingEvidence").length !== 35) errors.push("singleCorrelatedClassificationInvalid");
    const topGateReasons = uniqueSorted([
        "semanticDecisionRequired",
        "sourceMissing",
        "gameVersionUnbound",
        "providerIndependenceCorrelated",
        "bulkTransitionCaptureUnassigned",
        "certificateMissing",
        "attestationMissing",
        ...transitionGateStatuses.filter(Boolean)
    ]);
    const resultWithoutDigest = {
        schemaVersion: 1,
        kind: "genshinBehaviorModifierLaneAudit",
        status: errors.length ? "failed" : "passed",
        generatedAt,
        scope: {
            ...lane,
            candidateCount: candidateIds.length
        },
        policy: {
            valuesConditionsAndScope: "observedOnlyNoInference",
            semanticInference: "forbidden",
            canonicalPromotion: "forbidden",
            certificateAuthority: "strictRegistryOnly",
            metadataBooleansNotEvidence: true,
            sourceAgreement: "notEstablishedFromSameFamilyRecords",
            independentSourceProof: "sourceOwnedLineageAndRawDigestRequired",
            travelerVariants: "separateAndFailClosed",
            queueMutation: "none",
            queueInputProjection: queueProjection.projectionVersion
        },
        generatedFrom,
        claim,
        summary: {
            candidates: candidateIds.length,
            uniqueTargetSpecs: new Set(candidates.map((candidate) => candidate.sourceBehaviorSpec.id).filter(Boolean)).size,
            sourceRefs: uniqueSorted(sourceRefs).length,
            sourceRefsResolved: candidates.filter((candidate) => candidate.sourceEvidence.allResolved).length,
            byClassification: countBy(classifications),
            bySourceEvidenceClass: countBy(sourceEvidenceClasses),
            byBulkTransitionCapture: countBy(queueBulkStatuses),
            byMappingStatus: countBy(queueMappingStatuses),
            byConsumerStatus: countBy(queueConsumerStatuses),
            byTravelerVariantStatus: countBy(travelerStatuses),
            transitionSnapshots: {
                candidatesWithEvidence: candidates.filter((candidate) => candidate.transitionSnapshots.length > 0).length,
                candidateReferences: candidates.reduce((sum, candidate) => sum + candidate.transitionSnapshots.length, 0),
                uniqueSnapshotFiles: transitionPaths.length,
                gateStatuses: countBy(transitionGateStatuses)
            },
            certificates: {
                queueStatus: countBy(candidates.map((candidate) => candidate.certificate.queue.status)),
                registryEntries: candidates.reduce((sum, candidate) => sum + candidate.certificate.registry.matchingCount, 0),
                historicalEmbeddedCandidates: candidates.filter((candidate) => candidate.certificate.historicalEmbedded.length > 0).length,
                strictEligible: strictCertificates
            },
            attestations: {
                queueStatus: countBy(candidates.map((candidate) => candidate.attestation.queue.status)),
                registryEntries: candidates.reduce((sum, candidate) => sum + candidate.attestation.registry.matchingCount, 0),
                historicalEmbeddedCandidates: candidates.filter((candidate) => candidate.attestation.historicalEmbedded.length > 0).length,
                qualifying: strictAttestations
            },
            canonicalRuntime: {
                laneEntries: canonicalRuntimeCandidates.length,
                activeForProduction: canonicalRuntimeCandidates.filter((candidate) => candidate.consumer.canonicalRuntime.versionAvailability.activeForProduction === true).length,
                inactivePendingRevalidation: canonicalRuntimeCandidates.filter((candidate) => candidate.consumer.canonicalRuntime.versionAvailability.status === "inactivePendingRevalidation").length,
                promotionEligible: 0
            },
            observedValueConditionScopeOnly: candidates.filter((candidate) => candidate.classification.observedValueConditionScopeOnly).length,
            inferredValueConditionScope: 0,
            canonicalPromotion: 0,
            certificateEligible: 0,
            queueTasksMissing: missingQueueTaskCount
        },
        gate: {
            status: "failClosed",
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false,
            certificateEligible: 0,
            canonicalPromotionEligible: 0,
            reasons: topGateReasons,
            xiao: {
                candidateId: XIAO_MODIFIER_ID,
                status: "historicalCanonicalPendingRevalidation",
                currentPromotionAllowed: false
            },
            remainingCandidates: {
                count: 35,
                status: "singleCorrelatedOrMissingEvidence",
                currentPromotionAllowed: false
            }
        },
        errors
    };
    return {
        ...resultWithoutDigest,
        fieldDigestAlgorithm: "sha256-stable-json-v1",
        fieldDigest: digestStable(resultWithoutDigest)
    };
}

function withoutDigest(value) {
    const result = clone(value);
    if (result && typeof result === "object") {
        delete result.fieldDigest;
        delete result.fieldDigestAlgorithm;
    }
    return result;
}

function validateAudit(audit, { compareCurrent = true } = {}) {
    const reasons = [];
    if (!audit || typeof audit !== "object") reasons.push("artifactMissing");
    if (audit?.schemaVersion !== 1) reasons.push("schemaVersionInvalid");
    if (audit?.kind !== "genshinBehaviorModifierLaneAudit") reasons.push("kindInvalid");
    if (audit?.scope?.shardId !== lane.shardId) reasons.push("laneInvalid");
    if (audit?.fieldDigestAlgorithm !== "sha256-stable-json-v1") reasons.push("fieldDigestAlgorithmInvalid");
    if (audit?.fieldDigest !== digestStable(withoutDigest(audit))) reasons.push("fieldDigestInvalid");
    if (audit?.policy?.valuesConditionsAndScope !== "observedOnlyNoInference") reasons.push("inferencePolicyInvalid");
    if (audit?.policy?.canonicalPromotion !== "forbidden") reasons.push("promotionPolicyInvalid");
    if (audit?.gate?.canIssueEligibilityCertificate !== false || audit?.gate?.canPromoteCanonical !== false) reasons.push("gateNotFailClosed");
    if (audit?.summary?.canonicalPromotion !== 0 || audit?.summary?.certificateEligible !== 0) reasons.push("promotionCountInvalid");
    const candidates = Array.isArray(audit?.claim?.candidates) ? audit.claim.candidates : [];
    const ids = candidates.map((candidate) => candidate?.id);
    if (ids.length !== 36 || new Set(ids).size !== ids.length) reasons.push("candidateInventoryInvalid");
    if (candidates.some((candidate) => candidate?.classification?.inferencePerformed !== false)) reasons.push("candidateInferenceInvalid");
    if (candidates.some((candidate) => candidate?.classification?.canonicalPromotionEligible !== false)) reasons.push("candidatePromotionInvalid");
    if (candidates.some((candidate) => candidate?.certificate?.strictEligible !== false || candidate?.attestation?.qualifying !== false)) reasons.push("candidateProofGateInvalid");
    if (audit?.summary?.byClassification?.historicalCanonicalPendingRevalidation !== 1
        || audit?.summary?.byClassification?.singleCorrelatedOrMissingEvidence !== 35) reasons.push("classificationSummaryInvalid");
    if (audit?.policy?.metadataBooleansNotEvidence !== true) reasons.push("metadataBooleanPolicyInvalid");
    if (audit?.policy?.sourceAgreement !== "notEstablishedFromSameFamilyRecords") reasons.push("sourceAgreementPolicyInvalid");
    if (audit?.policy?.queueInputProjection !== "genshinBehaviorModifierLaneAudit/queue-input-v1") reasons.push("queueProjectionPolicyInvalid");
    if (candidates.some((candidate) => candidate?.sourceEvidence?.eligibilityProof?.accepted !== false)) reasons.push("sourceEvidenceAcceptedUnexpectedly");
    if (candidates.some((candidate) => candidate?.sourceEvidence?.sourceAgreement?.acceptedAsProof !== false)) reasons.push("sourceAgreementAcceptedUnexpectedly");
    if (candidates.some((candidate) => candidate?.certificate?.queue?.acceptedAsProof !== false
        || candidate?.certificate?.registry?.acceptedAsProof !== false
        || candidate?.attestation?.queue?.acceptedAsProof !== false
        || candidate?.attestation?.registry?.acceptedAsProof !== false)) reasons.push("registryProofAcceptedUnexpectedly");
    if (candidates.some((candidate) => candidate?.sourceEvidence?.allResolved !== true
        || candidate?.sourceEvidence?.allRawDigestsVerified !== true
        || candidate?.sourceEvidence?.classification !== "singleCorrelatedLocalSourceEvidence"
        || candidate?.sourceEvidence?.independentFamilyCount !== 0
        || candidate?.sourceEvidence?.externalIndependentVersionedPairObserved !== false)) reasons.push("sourceEvidenceInvalid");
    if (audit?.summary?.canonicalRuntime?.activeForProduction !== 0) reasons.push("activeCanonicalUnexpected");
    if (candidates.some((candidate) => candidate?.classification?.certificateEligible !== false || candidate?.classification?.canonicalPromotionEligible !== false)) reasons.push("candidateGateNotFailClosed");
    if (compareCurrent) {
        try {
            const expected = buildAudit();
            if (stableJson(expected) !== stableJson(audit)) reasons.push("artifactNotDeterministicForCurrentInputs");
        } catch (error) {
            reasons.push(`currentInputsInvalid:${error.message}`);
        }
    }
    return { valid: reasons.length === 0, reasons };
}

function renderMarkdown(audit) {
    const s = audit.summary;
    const classificationRows = Object.entries(s.byClassification).sort(([left], [right]) => left.localeCompare(right));
    const sourceRows = Object.entries(s.bySourceEvidenceClass).sort(([left], [right]) => left.localeCompare(right));
    return [
        "# Genshin behavior-modifier lane audit",
        "",
        `Status: **${audit.status}**`,
        "",
        `- shard: **${audit.scope.shardId}**`,
        `- candidates: **${s.candidates}**`,
        `- unique target BehaviorSpecs: **${s.uniqueTargetSpecs}**`,
        `- source refs resolved: **${s.sourceRefsResolved}/${s.candidates}**`,
        `- bulk transition capture: **${s.byBulkTransitionCapture.unassigned || 0} unassigned**`,
        `- certificate eligible: **${s.certificateEligible}**`,
        `- canonical promotion: **forbidden (0)**`,
        "",
        "## Reconciliation classes",
        "",
        "| class | candidates |",
        "| --- | ---: |",
        ...classificationRows.map(([name, count]) => `| ${name} | ${count} |`),
        "",
        "## Source evidence classes",
        "",
        "| class | candidates |",
        "| --- | ---: |",
        ...sourceRows.map(([name, count]) => `| ${name} | ${count} |`),
        "",
        "Xiao's scoped historical review is retained as `historicalCanonicalPendingRevalidation`; it is not reused for the other 35 candidates.",
        "",
        "Source-record provider/version flags and review booleans are retained as observations only. Same-family records do not establish source agreement; no independent-source proof, eligibility certificate, or canonical promotion is accepted by this lane.",
        "",
        "All values, conditions, paths, and target scopes are copied as observed fields only.  No semantic inference, certificate issuance, or canonical promotion is performed.",
        ""
    ].join("\n");
}

function writeArtifacts() {
    const audit = buildAudit();
    fs.mkdirSync(path.dirname(paths.artifact), { recursive: true });
    fs.writeFileSync(paths.artifact, stableJson(audit), "utf8");
    fs.writeFileSync(paths.reportJson, stableJson(audit), "utf8");
    fs.writeFileSync(paths.reportMarkdown, renderMarkdown(audit), "utf8");
    return audit;
}

if (require.main === module) {
    const audit = writeArtifacts();
    process.stdout.write(stableJson({ status: audit.status, summary: audit.summary, errors: audit.errors }));
    if (audit.status !== "passed") process.exitCode = 1;
}

module.exports = {
    XIAO_MODIFIER_ID,
    QUEUE_PROJECTION_KEYS,
    generatedAt,
    lane,
    paths,
    loadInputs,
    projectQueueTask,
    queueInputProjection,
    buildAudit,
    renderMarkdown,
    stableJson,
    validateAudit,
    writeArtifacts
};
