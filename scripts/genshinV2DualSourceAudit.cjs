"use strict";

/**
 * Deterministic, read-only cross-source audit for the weapon and artifact
 * migration candidates.  This report deliberately never changes a v2
 * candidate's verification or runtime status.  It only joins the existing
 * SourceRecord/source-catalog evidence at field (claim) granularity and
 * records why a claim is, or is not, eligible for independent review.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const verificationStateMachine = require("./genshinVerificationStateMachine.cjs");
const representativePilot = require("./genshinRepresentativeReviewPilot.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const v2Root = path.join(dataRoot, "v2");
const reportJsonPath = path.join(repositoryRoot, "reports", "genshin-v2-dual-source-audit.json");
const reportMarkdownPath = path.join(repositoryRoot, "reports", "genshin-v2-dual-source-audit.md");

const CLASSIFICATIONS = [
    "dual-source eligible",
    "same-provider duplicate",
    "single-source",
    "conflict",
    "missing-version"
];

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
}

function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function fileDigest(file) {
    return sha256(fs.readFileSync(file));
}

/** Canonical JSON is used for claim fingerprints and deterministic reports. */
function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableJson(value) {
    return JSON.stringify(stableValue(value));
}

function sortNatural(left, right) {
    return String(left).localeCompare(String(right), "en", { numeric: true });
}

function countBy(values) {
    const counts = {};
    values.forEach((value) => {
        const key = String(value);
        counts[key] = (counts[key] || 0) + 1;
    });
    return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function sourceGroup(source) {
    if (!source) return "unknown";
    // These two records are intentionally different evidence layers in the
    // generated output, but both are maintained by this repository.  They
    // cannot satisfy the independent-provider requirement by themselves.
    if (["damageTool-local", "damageTool-reviewRegistry"].includes(source.provider)) return "damageTool-local";
    return source.independenceGroup || source.provider || "unknown";
}

function sourceProvider(source) {
    return source?.provider || "unknown";
}

function claimValue(spec, field) {
    const effect = spec?.effect || {};
    if (field === "value") return clone(effect.value);
    if (field === "refinement") {
        return clone(effect.valueByRefinement
            ?? effect.valueByRefinementPerStack
            ?? effect.valueByRefinementPerConsumedStack
            ?? effect.value);
    }
    if (field === "registryStructure") return null;
    if (Object.prototype.hasOwnProperty.call(effect, field)) return clone(effect[field]);
    return null;
}

function claimSourceRefs(spec, claim) {
    const refs = Array.isArray(claim?.sourceRefs) && claim.sourceRefs.length
        ? claim.sourceRefs
        : spec.sourceRefs;
    return [...new Set((refs || []).map(String))].sort(sortNatural);
}

function sourceEvidence({ sourceRef, source, field }) {
    const versioned = Boolean(source?.gameVersion);
    return {
        sourceRef,
        scope: "field",
        field,
        provider: sourceProvider(source),
        independenceGroup: sourceGroup(source),
        kind: source?.kind || null,
        gameVersion: source?.gameVersion || null,
        versioned,
        gameVersionVerified: versioned,
        revisionPinned: false,
        versionKind: versioned ? "gameVersion" : null,
        locator: clone(source?.locator || null),
        integrity: clone(source?.integrity || null),
        claimSupport: "rawSourceRecord",
        supportsClaimValue: false,
        valueDigest: null
    };
}

function pinnedEvidence({ entityType, entityId, sourceCatalog }) {
    if (entityType !== "weapon") return [];
    const evidence = [];
    const recordId = `gcsim:weapon:${entityId}`;
    const record = sourceCatalog.records?.[recordId];
    const source = record ? sourceCatalog.sources?.[record.source] : null;
    if (source && record.path && record.sha256 && source.revision) evidence.push({
        sourceRef: recordId,
        scope: "entity",
        field: null,
        provider: source.provider || record.source,
        independenceGroup: source.independenceGroup || record.source,
        kind: "pinnedExternalImplementation",
        gameVersion: null,
        // A repository commit and file digest make this entity reference
        // reproducible, but they do not identify the Genshin game patch.  In
        // particular, do not let a pinned revision satisfy a gameVersion gate.
        versioned: false,
        gameVersionVerified: false,
        revisionPinned: true,
        versionKind: "repositoryRevisionAndFileDigest",
        revision: source.revision,
        repository: source.repository || null,
        locator: { path: record.path },
        integrity: { algorithm: "sha256", digest: record.sha256 },
        claimSupport: "pinnedEntityFileOnly",
        supportsClaimValue: false,
        valueDigest: null,
        note: "Pinned external implementation is evidence that the entity exists in this provider; repository revision/file digest is not a gameVersion proof and no field value was inferred from code."
    });
    const snapshotId = `genshinDb:weapon:${entityId}`;
    const snapshot = sourceCatalog.records?.[snapshotId];
    const snapshotSource = snapshot ? sourceCatalog.sources?.[snapshot.source] : null;
    const binding = snapshot?.gameVersionEvidence?.binding;
    const strictlyBound = Boolean(snapshotSource
        && snapshot.path
        && snapshot.sha256
        && snapshot.gameVersion
        && snapshot.field === "recordSnapshot"
        && snapshotSource.revision
        && binding?.revision === snapshotSource.revision
        && binding?.sourceRecordDigest === snapshot.sha256
        && binding?.metadataDigest === snapshot.gameVersionEvidence?.integrity?.digest);
    if (strictlyBound) evidence.push({
        sourceRef: snapshotId,
        scope: "recordSnapshot",
        field: "recordSnapshot",
        provider: snapshotSource.provider || snapshot.source,
        independenceGroup: snapshotSource.independenceGroup || snapshot.source,
        kind: "strictVersionedProviderSnapshot",
        gameVersion: snapshot.gameVersion,
        versioned: true,
        gameVersionVerified: true,
        revisionPinned: true,
        versionKind: snapshot.gameVersionEvidence.kind,
        revision: snapshotSource.revision,
        repository: snapshotSource.repository || null,
        locator: { path: snapshot.path, versionEvidence: clone(snapshot.gameVersionEvidence.locator) },
        integrity: { algorithm: "sha256", digest: snapshot.sha256, metadataDigest: binding.metadataDigest },
        claimSupport: "strictVersionedRecordSnapshotOnly",
        supportsClaimValue: false,
        valueDigest: null,
        note: "The exact provider record snapshot is strictly bound to Genshin 6.7. It proves snapshot version provenance, but does not by itself publish this projected claim value."
    });
    return evidence;
}

function classifyClaim(evidence, { conflict = false } = {}) {
    const evidenceCount = evidence.length;
    const groups = new Set(evidence.map((item) => item.independenceGroup || item.provider || "unknown"));
    const versionedFieldEvidence = evidence.filter((item) => item.scope === "field" && item.versioned && item.supportsClaimValue);
    const distinctVersionedGroups = new Set(versionedFieldEvidence.map((item) => item.independenceGroup || item.provider || "unknown"));
    const hasMissingVersion = evidence.some((item) => !item.versioned);
    const hasIndependentGroups = groups.size >= 2;
    let classification;
    if (conflict) classification = "conflict";
    else if (distinctVersionedGroups.size >= 2) classification = "dual-source eligible";
    else if (evidenceCount >= 2 && !hasIndependentGroups) classification = "same-provider duplicate";
    else if (evidenceCount === 1 && !hasIndependentGroups) classification = "single-source";
    else if (evidenceCount === 0 || hasMissingVersion || distinctVersionedGroups.size < 2) classification = "missing-version";
    else classification = "missing-version";
    const flags = [];
    if (classification === "same-provider duplicate") flags.push("same-provider duplicate");
    if (classification === "single-source") flags.push("single-source");
    if (classification === "conflict") flags.push("conflict");
    if (classification === "dual-source eligible") flags.push("dual-source eligible");
    if (classification === "missing-version" || hasMissingVersion) flags.push("missing-version");
    if (evidence.some((item) => item.scope === "entity" && item.claimSupport === "pinnedEntityFileOnly")) flags.push("independent-provider-pinned-reference");
    if (evidence.some((item) => item.claimSupport === "strictVersionedRecordSnapshotOnly")) flags.push("strict-versioned-provider-snapshot");
    return {
        classification,
        flags: [...new Set(flags)].sort(),
        evidenceCount,
        providerCount: new Set(evidence.map((item) => item.provider || "unknown")).size,
        independenceGroupCount: groups.size,
        versionedFieldEvidence: versionedFieldEvidence.length,
        versionedIndependentGroups: distinctVersionedGroups.size,
        hasIndependentProviders: hasIndependentGroups,
        hasMissingVersion
    };
}

function inputManifest({ dataRoot: root = dataRoot, sourceCatalogPath }) {
    const paths = [
        ["weaponSpecs", path.join(root, "v2", "weapons", "spec-candidates.json")],
        ["weaponSourceRecords", path.join(root, "v2", "weapons", "source-records.json")],
        ["weaponIndex", path.join(root, "v2", "weapons", "index.json")],
        ["artifactSpecs", path.join(root, "v2", "artifacts", "spec-candidates.json")],
        ["artifactSourceRecords", path.join(root, "v2", "artifacts", "source-records.json")],
        ["artifactIndex", path.join(root, "v2", "artifacts", "index.json")],
        ["sourceCatalog", sourceCatalogPath],
        ["weapons", path.join(root, "weapons.json")],
        ["weaponEffects", path.join(root, "weapon-effects.json")],
        ["weaponModifiers", path.join(root, "calc", "weapon-modifiers.json")],
        ["weaponEffectRegistry", path.join(root, "calc", "weapon-effect-registry.json")],
        ["weaponModifierAudit", path.join(root, "calc", "weapon-modifiers-audit-v10.json")],
        ["artifacts", path.join(root, "artifact-sets.json")],
        ["artifactEffects", path.join(root, "artifact-set-effects.json")],
        ["artifactModifiers", path.join(root, "calc", "artifact-set-modifiers.json")]
    ];
    return paths.map(([role, file]) => {
        const relative = path.relative(repositoryRoot, file).replaceAll(path.sep, "/");
        if (!fs.existsSync(file)) return { role, path: relative, exists: false, sha256: null, bytes: 0 };
        const bytes = fs.statSync(file).size;
        return { role, path: relative, exists: true, sha256: fileDigest(file), bytes };
    });
}

function legacyCoverage({ sourceCatalog, weaponSpecs, artifactSpecs }) {
    const gcsim = Object.entries(sourceCatalog.records || {})
        .filter(([id, record]) => id.startsWith("gcsim:weapon:") && record?.source === "gcsim")
        .map(([id, record]) => ({ id, weaponId: id.slice("gcsim:weapon:".length), path: record.path, sha256: record.sha256 }))
        .sort((a, b) => sortNatural(a.weaponId, b.weaponId));
    const weaponIds = new Set(Object.values(weaponSpecs).map((spec) => String(spec.entity?.id || "")));
    const genshinDb = Object.entries(sourceCatalog.records || {})
        .filter(([id, record]) => id.startsWith("genshinDb:weapon:") && record?.source === "genshinDb" && record?.field === "recordSnapshot")
        .map(([id, record]) => ({ id, weaponId: id.slice("genshinDb:weapon:".length), path: record.path, sha256: record.sha256, gameVersion: record.gameVersion }))
        .sort((a, b) => sortNatural(a.weaponId, b.weaponId));
    const artifactIds = new Set(Object.values(artifactSpecs).map((spec) => String(spec.entity?.id || "")));
    return {
        contract: clone(sourceCatalog.contract || null),
        sourceCatalogSources: Object.fromEntries(Object.entries(sourceCatalog.sources || {}).map(([id, source]) => [id, {
            provider: source.provider || null,
            repository: source.repository || null,
            revision: source.revision || null,
            revisionKind: source.revisionKind || null,
            gameVersion: source.gameVersion || null,
            gameVersionEvidence: clone(source.gameVersionEvidence || null),
            role: source.role || null,
            independenceGroup: source.independenceGroup || source.provider || null
        }])),
        gcsimPinnedRecords: gcsim,
        gcsimMatchedWeaponIds: gcsim.filter((record) => weaponIds.has(record.weaponId)).map((record) => record.weaponId),
        gcsimUnmatchedWeaponIds: gcsim.filter((record) => !weaponIds.has(record.weaponId)).map((record) => record.weaponId),
        gcsimArtifactRecordCount: Object.keys(sourceCatalog.records || {}).filter((id) => id.startsWith("gcsim:artifact:")).length,
        genshinDbStrictSnapshotRecords: genshinDb,
        genshinDbMatchedWeaponIds: genshinDb.filter((record) => weaponIds.has(record.weaponId)).map((record) => record.weaponId),
        goEvidence: {
            found: false,
            records: [],
            note: "No GO/Genshin Optimizer weapon or artifact record is pinned in the current local source catalog."
        },
        artifactCandidateIds: [...artifactIds].sort(sortNatural)
    };
}

function buildClaimRecords({ entityType, specs, sourceRecords, sourceCatalog, resolveClaimValue = claimValue }) {
    const records = [];
    Object.entries(specs).sort(([a], [b]) => sortNatural(a, b)).forEach(([candidateId, spec]) => {
        const claims = spec.verification?.claims || {};
        Object.entries(claims).sort(([a], [b]) => a.localeCompare(b)).forEach(([field, claim]) => {
            const refs = claimSourceRefs(spec, claim);
            const evidence = refs
                .filter((sourceRef) => sourceRecords[sourceRef])
                .map((sourceRef) => sourceEvidence({ sourceRef, source: sourceRecords[sourceRef], field }));
            evidence.push(...pinnedEvidence({ entityType, entityId: String(spec.entity?.id || ""), sourceCatalog }));
            const value = resolveClaimValue(spec, field);
            // The current local SourceRecords retain raw text/structured
            // fields, but do not independently publish a field value.  A
            // future field-aware provider can set supportsClaimValue=true;
            // doing so here would infer values from prose or code.
            const valueDigest = value === null || value === undefined ? null : sha256(stableJson(value));
            const conflict = evidence.filter((item) => item.supportsClaimValue && item.valueDigest).length > 1
                && new Set(evidence.filter((item) => item.supportsClaimValue && item.valueDigest).map((item) => item.valueDigest)).size > 1;
            const classification = classifyClaim(evidence, { conflict });
            const claimKind = verificationStateMachine.inferClaimKind(field, claim);
            const machineAssessment = verificationStateMachine.evidenceResult({
                field,
                status: claim.status,
                claimKind,
                applicabilityDetermined: claim.status === "notApplicable",
                evidence,
                comparison: { status: classification.classification === "dual-source eligible" && !conflict ? "match" : "notComparable" },
                discrepancies: conflict ? [{ resolved: false }] : []
            });
            const storedMachine = claim.machineEvidence || {};
            const storedAssessment = verificationStateMachine.evidenceResult({
                field,
                status: claim.status,
                claimKind,
                applicabilityDetermined: storedMachine.applicabilityDetermined,
                codeProvenance: storedMachine.codeProvenance,
                focusedTests: storedMachine.focusedTests,
                sourceInputsVerified: storedMachine.sourceInputsVerified,
                discrepancies: (storedMachine.blockedReasons || []).map((reason) => ({ resolved: false, reason }))
            });
            const internalStoredReady = claimKind !== "externalFactual"
                && storedMachine.ready === true
                && storedAssessment.machineEvidenceReady === true;
            const canonicalEligibility = spec.verification?.canonicalEligibility === true
                && spec.verification?.status === "verified"
                && ["verified", "notApplicable"].includes(claim.status);
            records.push({
                id: `${entityType}:${candidateId}:${field}`,
                entityType,
                entityId: String(spec.entity?.id || ""),
                candidateId,
                field,
                claimStatus: claim.status || null,
                claimValue: value,
                claimValueDigest: valueDigest,
                sourceRefs: refs,
                evidence,
                classification: classification.classification,
                classificationFlags: classification.flags,
                evidenceSummary: classification,
                claimKind,
                machineEvidenceReady: internalStoredReady || machineAssessment.machineEvidenceReady,
                machineEvidenceBlockedReasons: internalStoredReady ? [] : machineAssessment.blockedReasons,
                canonicalEligibility,
                note: canonicalEligibility
                    ? "Observed a scoped human-reviewed canonical eligibility decision; this audit did not create or promote it."
                    : "Evidence classification only; this audit never promotes the migration candidate or invents a provider value."
            });
        });
    });
    return records;
}

function candidateSummary({ entityType, specs, claims }) {
    const byCandidate = new Map();
    claims.forEach((claim) => {
        if (!byCandidate.has(claim.candidateId)) byCandidate.set(claim.candidateId, []);
        byCandidate.get(claim.candidateId).push(claim);
    });
    const candidates = Object.keys(specs).sort(sortNatural).map((candidateId) => {
        const candidateClaims = byCandidate.get(candidateId) || [];
        const classes = countBy(candidateClaims.map((claim) => claim.classification));
        const flags = [...new Set(candidateClaims.flatMap((claim) => claim.classificationFlags))].sort();
        const hasConflict = candidateClaims.some((claim) => claim.classification === "conflict");
        const hasEligible = candidateClaims.some((claim) => claim.classification === "dual-source eligible");
        const hasMissing = candidateClaims.some((claim) => claim.classification === "missing-version");
        const hasDuplicate = candidateClaims.some((claim) => claim.classification === "same-provider duplicate");
        const hasSingle = candidateClaims.some((claim) => claim.classification === "single-source");
        const externalClaims = candidateClaims.filter((claim) => claim.claimKind === "externalFactual");
        const allExternalEligible = externalClaims.length > 0
            && externalClaims.every((claim) => claim.classification === "dual-source eligible");
        const classification = hasConflict ? "conflict"
            : allExternalEligible ? "dual-source eligible"
                : hasEligible ? "missing-version"
                : hasMissing ? "missing-version"
                    : hasDuplicate ? "same-provider duplicate"
                        : hasSingle ? "single-source" : "missing-version";
        return {
            id: `${entityType}:${candidateId}`,
            entityType,
            candidateId,
            classification,
            classificationFlags: flags,
            claimCount: candidateClaims.length,
            claimClassCounts: classes,
            machineEvidenceReady: candidateClaims.length > 0 && candidateClaims.every((claim) => claim.machineEvidenceReady === true),
            canonicalEligibility: specs[candidateId]?.verification?.canonicalEligibility === true
                && specs[candidateId]?.verification?.status === "verified"
        };
    });
    return candidates;
}

function buildAudit({ root = dataRoot, sourceCatalogPath = path.join(root, "v2", "source-catalog.json") } = {}) {
    const weaponSpecs = readJson(path.join(root, "v2", "weapons", "spec-candidates.json"));
    const weaponSourceRecords = readJson(path.join(root, "v2", "weapons", "source-records.json"));
    const artifactSpecs = readJson(path.join(root, "v2", "artifacts", "spec-candidates.json"));
    const artifactSourceRecords = readJson(path.join(root, "v2", "artifacts", "source-records.json"));
    const sourceCatalog = readJson(sourceCatalogPath);
    const weaponClaims = buildClaimRecords({ entityType: "weapon", specs: weaponSpecs, sourceRecords: weaponSourceRecords, sourceCatalog });
    const pilot = representativePilot.buildPilot();
    const pilotClaimMap = pilot.claims || {};
    weaponClaims.filter((claim) => claim.candidateId === pilot.target.candidateId).forEach((claim) => {
        const evidence = pilotClaimMap[claim.field];
        if (!evidence) return;
        const assessment = verificationStateMachine.evidenceResult({ field: claim.field, ...evidence });
        claim.claimKind = assessment.claimKind;
        claim.machineEvidenceReady = assessment.machineEvidenceReady;
        claim.machineEvidenceBlockedReasons = assessment.blockedReasons;
        claim.evidence = [...claim.evidence, ...(evidence.evidence || [])];
        if (assessment.claimKind === "externalFactual" && assessment.machineEvidenceReady) {
            claim.classification = "dual-source eligible";
            claim.classificationFlags = [...new Set(claim.classificationFlags.filter((flag) => flag !== "missing-version").concat("dual-source eligible"))].sort();
            claim.evidenceSummary = {
                ...claim.evidenceSummary,
                classification: "dual-source eligible",
                providerCount: 2,
                independenceGroupCount: 2,
                versionedFieldEvidence: 2,
                versionedIndependentGroups: 2,
                hasIndependentProviders: true,
                hasMissingVersion: false
            };
        }
        claim.note = claim.canonicalEligibility
            ? "Representative evidence was approved by the scoped human decision; this audit only observes canonical eligibility."
            : "Representative pilot evidence overlay; canonical eligibility remains false until human review completes.";
    });
    const artifactClaims = buildClaimRecords({ entityType: "artifact", specs: artifactSpecs, sourceRecords: artifactSourceRecords, sourceCatalog });
    const claims = [...weaponClaims, ...artifactClaims];
    const candidates = [
        ...candidateSummary({ entityType: "weapon", specs: weaponSpecs, claims: weaponClaims }),
        ...candidateSummary({ entityType: "artifact", specs: artifactSpecs, claims: artifactClaims })
    ];
    const classificationCounts = countBy(claims.map((claim) => claim.classification));
    const flagCounts = countBy(claims.flatMap((claim) => claim.classificationFlags));
    const candidateClassificationCounts = countBy(candidates.map((candidate) => candidate.classification));
    const byEntity = (items, key) => countBy(items.map((item) => item.entityType === key ? item.classification : "other"));
    const coverage = legacyCoverage({ sourceCatalog, weaponSpecs, artifactSpecs });
    const errors = [];
    if (Object.keys(weaponSpecs).length !== 455) errors.push(`weapon candidate count ${Object.keys(weaponSpecs).length} != 455`);
    if (Object.keys(artifactSpecs).length !== 122) errors.push(`artifact candidate count ${Object.keys(artifactSpecs).length} != 122`);
    if (claims.some((claim) => claim.canonicalEligibility && claim.claimStatus !== "verified" && claim.claimStatus !== "notApplicable")) errors.push("unreviewed canonical eligibility detected");
    if (claims.some((claim) => claim.sourceRefs.some((ref) => !claim.evidence.some((evidence) => evidence.sourceRef === ref)))) errors.push("unresolved SourceRecord reference");
    return {
        schemaVersion: 2,
        audit: "genshin-v2-dual-source-audit",
        status: errors.length ? "failed" : "passed",
        methodology: {
            unit: "verification.claims field/claim; sourceRefs are joined without changing candidate data",
            providerGrouping: "damageTool-local and damageTool-reviewRegistry are one local independence group; source-catalog groups are retained",
            dualSourceEligible: "Requires two distinct independence groups with two versioned, field-scoped providers that publish comparable claim values. Pinned entity files without field extraction do not satisfy this gate.",
            sameProviderDuplicate: "Two or more evidence records in one independence group (hierarchical catalog/effect/modifier/registry evidence is retained but not independent).",
            missingVersion: "Any field evidence lacks explicit gameVersion; repository revisions/file digests are reproducibility pins, not gameVersion evidence. Independent entity-file pins are flagged but do not supply a field value.",
            conflict: "Only emitted when two independent field providers publish different claim value digests; no prose/code values are inferred.",
            machineEvidenceReady: "Claim-kind-specific gate: external facts require strict independent agreement; internal routes require deterministic code provenance and tests; notApplicable requires an explicit applicability determination.",
            canonicalEligibility: "Observed only when an independently recorded human review has already made the verified candidate eligible; this audit never promotes data."
        },
        generatedFrom: inputManifest({ dataRoot: root, sourceCatalogPath }),
        sourceCatalog: coverage,
        summary: {
            candidates: {
                weapons: Object.keys(weaponSpecs).length,
                artifacts: Object.keys(artifactSpecs).length,
                total: Object.keys(weaponSpecs).length + Object.keys(artifactSpecs).length
            },
            claims: {
                weapons: weaponClaims.length,
                artifacts: artifactClaims.length,
                total: claims.length
            },
            classificationCounts,
            classificationFlags: flagCounts,
            candidateClassificationCounts,
            byEntityClass: {
                weapons: byEntity(weaponClaims, "weapon"),
                artifacts: byEntity(artifactClaims, "artifact")
            },
            dualSourceEligibleClaims: claims.filter((claim) => claim.classification === "dual-source eligible").length,
            dualSourceEligibleCandidates: candidates.filter((candidate) => candidate.classification === "dual-source eligible").length,
            machineEvidenceReadyClaims: claims.filter((claim) => claim.machineEvidenceReady === true).length,
            machineEvidenceReadyCandidates: candidates.filter((candidate) => candidate.machineEvidenceReady === true).length,
            conflictClaims: claims.filter((claim) => claim.classification === "conflict").length,
            missingVersionClaims: claims.filter((claim) => claim.classificationFlags.includes("missing-version")).length,
            sameProviderDuplicateClaims: claims.filter((claim) => claim.classification === "same-provider duplicate").length,
            singleSourceClaims: claims.filter((claim) => claim.classification === "single-source").length,
            canonicalEligibleClaims: claims.filter((claim) => claim.canonicalEligibility === true).length,
            canonicalEligibility: candidates.filter((candidate) => candidate.canonicalEligibility === true).length,
            independentPinnedWeaponCandidates: coverage.gcsimMatchedWeaponIds.length,
            strictVersionedSnapshotClaims: claims.filter((claim) => claim.evidence.some((item) => item.claimSupport === "strictVersionedRecordSnapshotOnly")).length,
            strictVersionedSnapshotCandidates: coverage.genshinDbMatchedWeaponIds.length,
            strictSnapshotClaimValuesPublished: 0
        },
        errors,
        candidates,
        claims
    };
}

function renderMarkdown(audit) {
    const s = audit.summary;
    const classRows = CLASSIFICATIONS.map((name) => `| \`${name}\` | ${s.classificationCounts[name] || 0} |`).join("\n");
    const candidateRows = CLASSIFICATIONS.map((name) => `| \`${name}\` | ${s.candidateClassificationCounts[name] || 0} |`).join("\n");
    const pinned = audit.sourceCatalog.gcsimMatchedWeaponIds.join(", ") || "none";
    const claimSamples = audit.claims.filter((claim) => claim.classification === "missing-version").slice(0, 20)
        .map((claim) => `| ${claim.entityType} | \`${claim.candidateId}\` | \`${claim.field}\` | ${claim.classification} | ${claim.evidenceSummary.independenceGroupCount} | ${claim.evidenceSummary.versionedIndependentGroups} |`).join("\n");
    return [
        "# Genshin v2 dual-source audit",
        "",
        "This reproducible report joins the existing weapon/artifact SourceRecords, legacy registries and the pinned v2 source catalog at `verification.claims` field granularity. It does not alter or canonicalize any candidate.",
        "",
        "## Counts",
        "",
        `- candidates: **${s.candidates.weapons} weapons**, **${s.candidates.artifacts} artifacts** (total **${s.candidates.total}**)`,
        `- claims: **${s.claims.total}** (${s.claims.weapons} weapon, ${s.claims.artifacts} artifact)`,
        `- dual-source eligible: **${s.dualSourceEligibleClaims} claims / ${s.dualSourceEligibleCandidates} candidates**`,
        `- conflicts: **${s.conflictClaims}**; canonical eligibility: **${s.canonicalEligibility}**`,
        `- gcsim pinned entity files matched to weapons: **${s.independentPinnedWeaponCandidates}** (${pinned})`,
        "",
        "### Claim classifications",
        "",
        "| classification | claims |",
        "| --- | ---: |",
        classRows,
        "",
        "### Candidate classifications (weakest claim gate)",
        "",
        "| classification | candidates |",
        "| --- | ---: |",
        candidateRows,
        "",
        "## Interpretation",
        "",
        "- `damageTool-local` and `damageTool-reviewRegistry` are grouped as one local provider. Aggregate/effect/modifier records remain useful hierarchy evidence, but are not independent providers.",
        "- The nine gcsim entries are pinned by repository revision, path, and SHA-256 in `v2/source-catalog.json`. A repository revision/file digest is not a Genshin game-version proof. They are entity-file references only; this report does not parse Go text into claim values. Therefore they cannot make a field dual-source eligible until a field-level value record with explicit gameVersion evidence is reviewed.",
        "- `missing-version` is also retained as a flag on local claims whose SourceRecords have no `gameVersion`; primary classification may be `same-provider duplicate` when the only extra records are local hierarchy evidence.",
        "- No GO/Genshin Optimizer weapon or artifact record is pinned in the current source catalog.",
        "",
        "## Missing-version sample",
        "",
        "| type | candidate | field | primary class | groups | versioned independent groups |",
        "| --- | --- | --- | --- | ---: | ---: |",
        claimSamples || "| (none) | | | | | |",
        "",
        "Full claim/evidence records are in the adjacent JSON report. Canonical eligibility is observed from scoped human-review records and is never created by this audit.",
        ""
    ].join("\n");
}

function writeReports(audit) {
    fs.mkdirSync(path.dirname(reportJsonPath), { recursive: true });
    fs.writeFileSync(reportJsonPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
    fs.writeFileSync(reportMarkdownPath, renderMarkdown(audit), "utf8");
}

if (require.main === module) {
    const audit = buildAudit();
    if (process.argv.includes("--write")) writeReports(audit);
    console.log(JSON.stringify(audit.summary, null, 2));
    if (audit.errors.length) process.exitCode = 1;
}

module.exports = {
    buildAudit,
    buildClaimRecords,
    classifyClaim,
    renderMarkdown,
    writeReports,
    paths: { reportJsonPath, reportMarkdownPath },
    CLASSIFICATIONS,
    stableJson
};
