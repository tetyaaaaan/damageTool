"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { buildNormalizedPolicy, defaultOutputPath: defaultPairPolicyPath } = require("./genshinProviderPairPolicyNormalize.cjs");
const sourceCatalogAudit = require("./genshinSourceCatalogContractAudit.cjs");
const dualSourceAudit = require("./genshinV2DualSourceAudit.cjs");
const { deriveCurrentGameVersion } = require("./genshinGameVersionPolicy.cjs");
const { auditBaseline } = require("./genshinVersionBaseline.cjs");
const { verifySourceArtifactProof } = require("./genshinSourceArtifactProof.cjs");
const { collectCandidates } = require("./genshinCandidateRegistry.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const registryPath = path.join(dataRoot, "v2", "source-family-registry.json");
const sourceCatalogPath = path.join(dataRoot, "v2", "source-catalog.json");
const providerPolicyPath = path.join(dataRoot, "v2", "provider-independence-policy.json");
const defaultOutputPath = path.join(dataRoot, "v2", "eligibility-certificates.json");
const GENERATOR_VERSION = "genshinClaimEligibilityCertificateGenerate/2";
const CAPTURED_AT = "2026-08-28T00:00:00+09:00";

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const stableValue = (value) => Array.isArray(value)
    ? value.map(stableValue)
    : value && typeof value === "object"
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
        : value;
const stableJson = (value) => JSON.stringify(stableValue(value));
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : String(value)).digest("hex");
const valueDigest = (value) => sha256(stableJson(value));
const relativePath = (file) => path.relative(repositoryRoot, file).replaceAll(path.sep, "/");
const unique = (values) => [...new Set((values || []).filter((value) => value !== null && value !== undefined && value !== ""))];
// Source IDs are identities, not search terms. Punctuation/case folding can
// silently bind one provider's evidence to a different catalog record.
const referenceKey = (value) => typeof value === "string" ? value : "";

function fileDigest(file) {
    const bytes = fs.readFileSync(file);
    return { sha256: sha256(bytes), bytes: bytes.length };
}

function buildProviderIndex(registry) {
    const index = new Map();
    Object.entries(registry.providers || {}).forEach(([name, provider]) => {
        [name, provider.canonicalName, ...(provider.aliases || [])].filter(Boolean).forEach((alias) => index.set(String(alias).toLowerCase(), {
            providerId: provider.providerId,
            providerName: provider.canonicalName,
            familyId: provider.familyId,
            family: registry.families?.[provider.familyId] || null
        }));
    });
    return index;
}

function datasetForClaim(claim) {
    if (claim.entityType === "weapon") return "weapons";
    if (claim.entityType === "artifact") return "artifacts";
    if (["character", "behavior"].includes(claim.entityType)) return "characters";
    return String(claim.entityType || "unknown");
}

function pairForClaim(pairs, providerIds, dataset) {
    if (providerIds.length !== 2) return null;
    const wanted = [...providerIds].sort().join("|");
    return pairs.find((pair) => {
        const actual = [pair.providerA?.providerId, pair.providerB?.providerId].filter(Boolean).sort().join("|");
        const datasetMatches = pair.dataset === dataset
            || pair.dataset === `${dataset}AndArtifacts`
            || pair.dataset === "weaponsArtifactsCharactersBehavior"
            || (dataset === "characters" && pair.dataset === "charactersAndBehavior");
        return actual === wanted && datasetMatches;
    }) || null;
}

function evidenceByRef(claim) {
    const result = new Map();
    (claim.evidence || []).forEach((item) => {
        const sourceRef = item?.sourceRef || item?.sourceId || item?.id;
        if (!sourceRef) return;
        result.set(sourceRef, { ...(result.get(sourceRef) || {}), ...item, sourceRef });
    });
    return result;
}

function sourceForClaim({ evidence, record, rawRecord, sourceStatus, provider, claim }) {
    // Re-read the saved artifacts. Neither a packet's extractedValue nor its
    // booleans can certify bytes, a provider revision, or a game version.
    const actual = sourceStatus && rawRecord
        ? verifySourceArtifactProof(sourceStatus, rawRecord, {
            expectedValue: claim.claimValue, fieldPointer: rawRecord.fieldPointer || rawRecord.field
        }) : null;
    const proof = actual?.artifactProof;
    const fieldDigest = proof?.field?.verified === true
        ? valueDigest(proof.field.value) : null;
    const strictGameVersionBinding = Boolean(proof?.rawVerified === true
        && proof?.revisionVerified === true && proof?.version?.verified === true
        && proof.version.gameVersion === record?.gameVersion
        && record?.gameVersionVerified === true
        && sourceStatus?.gameVersionVerified === true
        && rawRecord?.gameVersionEvidence?.binding?.revision === sourceStatus?.revision
        && rawRecord?.gameVersionEvidence?.binding?.sourceRecordDigest === rawRecord?.sha256
        && rawRecord?.gameVersionEvidence?.binding?.metadataDigest === rawRecord?.gameVersionEvidence?.integrity?.digest);
    return {
        sourceRef: evidence?.sourceRef || null,
        providerId: provider?.providerId || null,
        provider: provider?.providerName || evidence?.provider || sourceStatus?.provider || null,
        familyId: provider?.familyId || null,
        lineageStatus: provider?.family?.lineageStatus || null,
        revision: sourceStatus?.revision || null,
        path: rawRecord?.path || record?.path || null,
        rawArtifactDigest: rawRecord?.sha256 || record?.sha256 || null,
        fieldDigest,
        gameVersion: record?.gameVersion || null,
        revisionPinned: record?.revisionPinned === true && proof?.revisionVerified === true,
        rawArtifactDigestBound: Boolean(proof?.rawVerified === true
            && actual?.evidence?.rawArtifact?.actualSha256 === rawRecord?.sha256
            && /^[a-f0-9]{64}$/.test(rawRecord?.sha256 || "")
            && rawRecord?.gameVersionEvidence?.binding?.sourceRecordDigest === rawRecord.sha256),
        fieldScoped: record?.fieldScoped === true && proof?.field?.verified === true,
        exactField: Boolean(proof?.field?.verified === true && rawRecord?.field === claim.field),
        candidateScopeBound: Boolean(rawRecord?.scope?.candidateId === claim.candidateId
            && rawRecord?.scope?.claimId === claim.id
            && typeof claim.entityId === "string" && claim.entityId.length > 0
            && rawRecord?.scope?.entityId === claim.entityId),
        fieldDigestMatches: Boolean(fieldDigest && fieldDigest === claim.claimValueDigest),
        strictGameVersionBinding,
        supportsClaimValue: evidence?.supportsClaimValue === true && fieldDigest !== null && fieldDigest === claim.claimValueDigest,
        artifactProof: actual ? {
            rawArtifact: actual.evidence.rawArtifact,
            versionManifest: actual.evidence.versionManifest,
            field: actual.evidence.field,
            blockedReasons: actual.reasons
        } : null
    };
}

function certificateForClaim(claim, context) {
    const evidenceMap = evidenceByRef(claim);
    const support = [...evidenceMap.values()].filter((item) => item.supportsClaimValue === true);
    const sources = support.map((evidence) => {
        const record = context.recordByKey.get(referenceKey(evidence.sourceRef));
        const rawRecord = record ? context.rawRecordById.get(record.id) : null;
        const sourceStatus = record ? context.sourceById.get(record.source) : null;
        // A packet cannot rename its upstream provider to obtain independence.
        const provider = context.providerIndex.get(String(sourceStatus?.provider || "").toLowerCase()) || null;
        return sourceForClaim({ evidence, record, rawRecord, sourceStatus, provider, claim });
    });
    const providerIds = unique(sources.map((source) => source.providerId));
    const familyIds = unique(sources.map((source) => source.familyId));
    const versions = unique(sources.map((source) => source.gameVersion));
    const targetGameVersion = versions.length === 1 ? versions[0] : null;
    const stale = Boolean(targetGameVersion && context.currentGameVersion && targetGameVersion !== context.currentGameVersion);
    const dataset = datasetForClaim(claim);
    const pair = pairForClaim(context.normalizedPolicy.pairs, providerIds, dataset);
    const reasons = [];
    if (claim.claimKind !== "externalFactual") reasons.push("claimKindNotExternalFactual");
    if (support.length < 2) reasons.push("sourceEvidenceInsufficient");
    if (sources.some((source) => !source.rawArtifactDigest)) reasons.push("sourceCatalogRecordMissing");
    if (providerIds.length < 2) reasons.push("providerIndependenceInsufficient");
    if (familyIds.length < 2) reasons.push("sourceFamilyIndependenceInsufficient");
    if (sources.some((source) => source.lineageStatus !== "declared")) reasons.push("sourceFamilyLineageUnresolved");
    if (sources.some((source) => !source.revisionPinned)) reasons.push("revisionPinMissing");
    if (sources.some((source) => !source.rawArtifactDigestBound)) reasons.push("rawArtifactDigestBindingMissing");
    if (sources.some((source) => !source.fieldScoped || !source.exactField)) reasons.push("exactFieldScopeMissing");
    if (sources.some((source) => !source.candidateScopeBound)) reasons.push("candidateClaimScopeMissingOrMismatch");
    if (sources.some((source) => !source.fieldDigestMatches)) reasons.push("fieldDigestBindingMissingOrMismatch");
    if (sources.some((source) => !source.strictGameVersionBinding) || versions.length !== 1) reasons.push("strictGameVersionBindingMissingOrConflict");
    if (stale) reasons.push("sourceGameVersionNotCurrent");
    // Eligibility verifies target-version facts, not permission to deploy.
    // An unrelated accepted baseline must not prevent target pre-validation.
    if (claim.classification !== "dual-source eligible") reasons.push("fieldAgreementNotExactMatch");
    if (!pair) reasons.push("providerPairPolicyMissing");
    else if (pair.status !== "reusable") reasons.push(`providerPairNotReusable:${pair.status}`);
    const blockedReasons = unique(reasons).sort();
    const claimScope = { candidateId: claim.candidateId, claimId: claim.id, field: claim.field, valueDigest: claim.claimValueDigest };
    return {
        schemaVersion: 1,
        kind: "genshinClaimEligibilityCertificate",
        certificateId: `eligibility:${claim.id}`,
        candidateId: claim.candidateId,
        claimId: claim.id,
        field: claim.field,
        claimKind: claim.claimKind || null,
        dataset,
        status: blockedReasons.length ? "blocked" : "eligible",
        verificationMode: "deterministicConsensus",
        issuedAt: CAPTURED_AT,
        authority: {
            id: "genshinSourceCatalogContractAudit",
            version: "1",
            sourceCatalogDigest: context.sourceCatalogDigest.sha256,
            sourceFamilyRegistryDigest: context.registryDigest.sha256,
            providerPolicyDigest: context.providerPolicyDigest.sha256
        },
        policy: pair ? {
            id: pair.id,
            version: context.normalizedPolicy.sourcePolicy?.policyVersion || null,
            status: pair.status,
            automaticVerificationAllowed: pair.status === "reusable"
        } : null,
        scope: claimScope,
        targetGameVersion,
        currentGameVersion: context.currentGameVersion || null,
        versionSnapshotId: context.verificationSnapshotId || context.versionBaseline?.acceptedSnapshotId || null,
        requiredFieldCoverage: { status: sources.length >= 2 && sources.every((source) => source.exactField) ? "complete" : "incomplete", requiredFields: [claim.field], digest: valueDigest([claim.field]) },
        comparison: {
            status: claim.classification === "dual-source eligible" ? "match"
                : claim.classification === "conflict" ? "conflict" : "notMatch",
            claimValueDigest: claim.claimValueDigest,
            sourceFieldDigests: Object.fromEntries(sources.map((source) => [source.sourceRef, source.fieldDigest]))
        },
        sources,
        sourceBundleDigest: valueDigest(sources),
        normalization: { id: "stable-json-exact-value", version: "1", digest: valueDigest({ algorithm: "stable-json", equality: "exact" }) },
        stale,
        invalidated: false,
        blockedReasons,
        canonicalEligibility: false,
        invalidationDigest: valueDigest({ claimScope, sources, pairId: pair?.id || null, policyStatus: pair?.status || null })
    };
}

function buildClaimInputs(rawCatalog, primaryClaims) {
    const candidates = collectCandidates();
    const claims = [...primaryClaims];
    const missingClaimDefinitions = [];
    const sourceCache = new Map();
    const sourcesFor = (dataset) => {
        if (!sourceCache.has(dataset)) {
            const characterFile = (file) => readJson(path.join(dataRoot, "v2/characters", file));
            const records = dataset === "behaviorPilot"
                ? { ...characterFile("behavior-pilot.json").sourceRecords, ...characterFile("behavior-reviewed.json").sourceRecords }
                : dataset === "talentGap" ? characterFile("talent-gap-candidates.json").sourceRecords
                    : characterFile(`behavior-batch-${dataset.slice("behaviorBatch".length)}/source-records.json`);
            sourceCache.set(dataset, records);
        }
        return sourceCache.get(dataset);
    };
    for (const row of candidates) {
        if (["weapons", "artifacts"].includes(row.dataset)) continue;
        const definitions = row.candidate.verification?.claims || {};
        if (!Object.keys(definitions).length) {
            missingClaimDefinitions.push({ candidateId: row.id, dataset: row.dataset, layer: row.layer });
            continue;
        }
        // Only existing structured fields are read. No prose, unknown value,
        // applicability, or provider agreement is inferred from local data.
        const resolveClaimValue = (spec, field) => Object.hasOwn(spec, field)
            ? spec[field] : Object.hasOwn(spec.effect || {}, field) ? spec.effect[field] : null;
        claims.push(...dualSourceAudit.buildClaimRecords({
            entityType: row.layer === "talentGapEffectSpec" ? "character" : "behavior",
            specs: { [row.id]: row.candidate }, sourceRecords: sourcesFor(row.dataset), sourceCatalog: rawCatalog,
            resolveClaimValue
        }));
    }
    const ids = new Set();
    for (const claim of claims) {
        if (ids.has(claim.id)) throw new Error(`duplicateClaimId:${claim.id}`);
        ids.add(claim.id);
    }
    return { claims, coverage: {
        candidateCount: candidates.length,
        candidatesWithDeclaredClaims: candidates.length - missingClaimDefinitions.length,
        missingClaimDefinitions,
        scope: "Existing candidate declarations only; tracked calculation datasets without candidate claims remain explicit acceptance-inventory work, not verified coverage.",
        complete: missingClaimDefinitions.length === 0
    } };
}

function buildCertificates({ targetGameVersion } = {}) {
    const registry = readJson(registryPath);
    const rawCatalog = readJson(sourceCatalogPath);
    const currentVersion = deriveCurrentGameVersion(rawCatalog);
    const requestedTarget = targetGameVersion || readJson(path.join(dataRoot, "v2/r2-work-dispositions.json")).targetGameVersion;
    if (!/^\d+\.\d+$/.test(requestedTarget || "")) throw new Error("verificationTargetVersionInvalid");
    const versionBaseline = auditBaseline({ dataRoot });
    const strictAudit = sourceCatalogAudit.buildAudit();
    const claimsAudit = dualSourceAudit.buildAudit();
    const claimInputs = buildClaimInputs(rawCatalog, claimsAudit.claims || []);
    const normalizedPolicy = buildNormalizedPolicy();
    const context = {
        normalizedPolicy,
        sourceById: new Map(strictAudit.sourceCatalog.sourceStatuses.map((source) => [source.id, source])),
        rawRecordById: new Map(Object.entries(rawCatalog.records || {}).map(([id, record]) => [id, { id, ...record }])),
        recordByKey: new Map(strictAudit.sourceCatalog.records.map((record) => [referenceKey(record.id), record])),
        providerIndex: buildProviderIndex(registry),
        sourceCatalogDigest: fileDigest(sourceCatalogPath),
        registryDigest: fileDigest(registryPath),
        providerPolicyDigest: fileDigest(providerPolicyPath),
        // This is the requested verification target, never evidence of the
        // source's game version or a claim that the production gate is open.
        currentGameVersion: requestedTarget,
        verificationSnapshotId: `genshin-verification:${requestedTarget}:${valueDigest({
            targetGameVersion: requestedTarget, sourceCatalog: fileDigest(sourceCatalogPath).sha256,
            sourceFamilies: fileDigest(registryPath).sha256, providerPolicy: fileDigest(providerPolicyPath).sha256
        })}`,
        versionBaseline
    };
    const certificates = claimInputs.claims
        .filter((claim) => claim.claimKind === "externalFactual")
        .map((claim) => certificateForClaim(claim, context));
    return {
        schemaVersion: 2,
        kind: "genshinClaimEligibilityCertificateRegistry",
        generatedBy: { name: "genshinClaimEligibilityCertificateGenerate.cjs", version: GENERATOR_VERSION, capturedAt: CAPTURED_AT },
        authority: { sourceCatalogAudit: "scripts/genshinSourceCatalogContractAudit.cjs", sourceCatalog: relativePath(sourceCatalogPath), sourceFamilyRegistry: relativePath(registryPath), providerPolicy: normalizedPolicy.sourcePolicy?.path || null },
        policy: { pairPolicyIsEvidence: false, exactCandidateClaimScopeRequired: true, exactSourceCatalogRecordRequired: true, exactFieldDigestRequired: true, strictGameVersionBindingRequired: true, currentGameVersionRequired: true, exactMatchOnly: true, scopedMatchForbidden: true, aiSelfApproval: "forbidden" },
        currentGameVersion: { gameVersion: requestedTarget, status: "requestedVerificationTarget", evidence: false },
        catalogSourceVersion: currentVersion,
        verificationTarget: { gameVersion: requestedTarget, snapshotId: context.verificationSnapshotId, productionActivationGranted: false },
        versionBaseline: { status: versionBaseline.status, canonicalGateOpen: versionBaseline.canonicalGateOpen, acceptedSnapshotId: versionBaseline.acceptedSnapshotId, currentSnapshotId: versionBaseline.currentSnapshotId },
        certificates,
        inputCoverage: claimInputs.coverage,
        summary: {
            candidateClaimCount: certificates.length,
            eligibleCount: certificates.filter((certificate) => certificate.status === "eligible").length,
            blockedCount: certificates.filter((certificate) => certificate.status === "blocked").length,
            legacyDualSourceEligibleClaimsObserved: strictAudit.dualSourceAudit.dualSourceEligibleClaims,
            sourceCatalogPromotionGate: strictAudit.promotionGate
        }
    };
}

function writeCertificates({ outputPath = defaultOutputPath, pairPolicyPath = defaultPairPolicyPath } = {}) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(pairPolicyPath, `${JSON.stringify(buildNormalizedPolicy(), null, 2)}\n`, "utf8");
    const certificates = buildCertificates();
    fs.writeFileSync(outputPath, `${JSON.stringify(certificates, null, 2)}\n`, "utf8");
    return { certificates, outputPath, pairPolicyPath };
}

if (require.main === module) {
    const result = writeCertificates();
    process.stdout.write(`${JSON.stringify({ outputPath: relativePath(result.outputPath), ...result.certificates.summary }, null, 2)}\n`);
}

module.exports = { GENERATOR_VERSION, CAPTURED_AT, defaultOutputPath, defaultPairPolicyPath, buildCertificates, buildClaimInputs, certificateForClaim, referenceKey, valueDigest, writeCertificates };
