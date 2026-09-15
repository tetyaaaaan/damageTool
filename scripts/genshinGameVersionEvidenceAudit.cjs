"use strict";

/** Audit the deterministic game-version evidence artifact without promotion. */

const fs = require("node:fs");
const path = require("node:path");
const {
    ACCEPTED_EVIDENCE_KINDS,
    REJECTED_VERSION_PROOFS,
    buildEvidence,
    defaultDataRoot,
    defaultOutputFile,
    defaultReportJsonPath,
    defaultReportMarkdownPath,
    stableJson
} = require("./genshinGameVersionEvidenceGenerate.cjs");

const repositoryRoot = path.resolve(__dirname, "..");

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function countBy(values) {
    const result = {};
    (values || []).forEach((value) => {
        const key = String(value);
        result[key] = (result[key] || 0) + 1;
    });
    return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function sortNatural(left, right) {
    return String(left).localeCompare(String(right), "en", { numeric: true });
}

function validSha256(value) {
    return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function validRevision(value) {
    return typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
}

function isGameVersionToken(value) {
    return typeof value === "string" && /^\d+\.\d+(?:\.\d+)?$/.test(value.trim());
}

function loadGenerated({ dataRoot = defaultDataRoot, outputFile = defaultOutputFile } = {}) {
    if (fs.existsSync(outputFile)) return { ...readJson(outputFile), generatedFromDisk: true };
    return { ...buildEvidence({ dataRoot, metadataFiles: {} }), generatedFromDisk: false };
}

function auditEvidence({
    dataRoot = defaultDataRoot,
    sourceCatalogFile = path.join(dataRoot, "v2", "source-catalog.json"),
    outputFile = defaultOutputFile
} = {}) {
    const generated = loadGenerated({ dataRoot, outputFile });
    const expected = buildEvidence({ dataRoot, sourceCatalogFile, metadataFiles: {} });
    const errors = [];
    const warnings = [];
    const sourceViolations = [];
    const recordViolations = [];
    const proofViolations = [];
    const canonicalViolations = [];
    const researchViolations = [];

    if (generated.schemaVersion !== 1) errors.push("schemaVersion must be 1");
    if (generated.kind !== "genshinGameVersionEvidence") errors.push("unexpected artifact kind");
    if (generated.policy?.primaryOnly !== true) errors.push("primaryOnly policy must be true");
    if (generated.policy?.networkAccess !== "none") errors.push("networkAccess must be none");
    if (generated.policy?.canonicalPromotion !== "forbidden") errors.push("canonicalPromotion policy must be forbidden");
    if (JSON.stringify(generated.policy?.acceptedEvidenceKinds || []) !== JSON.stringify(ACCEPTED_EVIDENCE_KINDS)) {
        errors.push("acceptedEvidenceKinds changed");
    }
    if (JSON.stringify(generated.policy?.rejectedVersionProofs || []) !== JSON.stringify(REJECTED_VERSION_PROOFS)) {
        errors.push("rejectedVersionProofs changed");
    }

    if (generated.generatedFromDisk) {
        const comparable = { ...generated };
        delete comparable.generatedFromDisk;
        if (stableJson(comparable) !== stableJson(expected)) errors.push("artifact is not deterministic for current source files");
    }

    const sources = generated.sourceCatalog?.sourceStatuses || [];
    if (sources.length !== expected.sourceCatalog.sourceStatuses.length) errors.push("source status count mismatch");
    sources.forEach((source) => {
        if (!source.id || !source.provider || !source.revision) sourceViolations.push(`${source.id || "unknown"}:identity`);
        if (source.revisionPinned !== true) sourceViolations.push(`${source.id}:revisionPin`);
        if (source.gameVersionVerified === true && source.status !== "ready") sourceViolations.push(`${source.id}:verifiedStatus`);
        if (source.gameVersionVerified !== true && source.status === "ready") sourceViolations.push(`${source.id}:unverifiedReady`);
        if (source.gameVersionVerified === true && !source.binding?.bindingPresent) proofViolations.push(`${source.id}:bindingMissing`);
        if (source.gameVersionVerified === true && source.binding?.revision !== source.revision) proofViolations.push(`${source.id}:revisionBinding`);
        if (source.gameVersion !== null && typeof source.gameVersion !== "string") proofViolations.push(`${source.id}:gameVersionType`);
    });

    const records = generated.sourceCatalog?.records || [];
    records.forEach((record) => {
        if (!record.id || !record.source || !record.path) recordViolations.push(`${record.id || "unknown"}:identity`);
        if (record.gameVersionVerified === true && !record.fieldScoped) recordViolations.push(`${record.id}:fieldScope`);
        if (record.gameVersionVerified === true && record.binding?.sourceRecordDigest !== record.sha256) {
            proofViolations.push(`${record.id}:sourceRecordDigestBinding`);
        }
        if (record.status === "ready" && record.gameVersionVerified !== true) recordViolations.push(`${record.id}:unverifiedReady`);
    });

    const officialLocators = generated.sourceCatalog?.officialLocators || {};
    Object.entries(officialLocators).forEach(([sourceId, review]) => {
        if (!Array.isArray(review.locators) || review.locators.length < 2) errors.push(`${sourceId}:official locator review incomplete`);
        (review.locators || []).forEach((locator) => {
            if (!ACCEPTED_EVIDENCE_KINDS.includes(locator.kind)) errors.push(`${sourceId}:unsupported locator kind`);
            if (locator.status === "accepted") proofViolations.push(`${sourceId}:locator unexpectedly accepted`);
        });
    });

    const externalArtifacts = generated.externalEvidence?.artifacts || {};
    Object.entries(externalArtifacts).forEach(([role, artifact]) => {
        if (artifact.gameVersion?.verified > 0) proofViolations.push(`${role}:externalVersionUnexpectedlyVerified`);
    });

    const primaryResearch = generated.primaryResearch || null;
    const expectedPrimaryResearch = expected.primaryResearch || null;
    if (!primaryResearch) {
        researchViolations.push("primaryResearch:missing");
    } else {
        if (primaryResearch.schemaVersion !== 1) researchViolations.push("primaryResearch:schemaVersion");
        if (primaryResearch.kind !== "genshinGameVersionPrimaryResearch") researchViolations.push("primaryResearch:kind");
        if (primaryResearch.policy?.canonicalPromotion !== "forbidden") researchViolations.push("primaryResearch:canonicalPromotion");
        if (primaryResearch.policy?.selfApproval !== "forbidden") researchViolations.push("primaryResearch:selfApproval");
        if (primaryResearch.version !== "genshinGameVersionPrimaryResearch/1") researchViolations.push("primaryResearch:version");
        if (expectedPrimaryResearch && stableJson(primaryResearch) !== stableJson(expectedPrimaryResearch)) {
            researchViolations.push("primaryResearch:notDeterministic");
        }
        const researchSources = primaryResearch.sources || {};
        const catalogSourceById = Object.fromEntries(sources.map((source) => [source.id, source]));
        Object.entries(researchSources).forEach(([sourceId, research]) => {
            const catalogSource = catalogSourceById[sourceId];
            if (!catalogSource) researchViolations.push(`${sourceId}:notInSourceCatalog`);
            if (!validRevision(research.pinnedRevision)) researchViolations.push(`${sourceId}:pinnedRevision`);
            if (catalogSource && research.pinnedRevision !== catalogSource.revision) researchViolations.push(`${sourceId}:pinnedRevisionBinding`);
            if (research.strictBinding === true && sourceId !== "genshinDb") researchViolations.push(`${sourceId}:unexpectedStrictBinding`);
            if (research.status === "ready" && sourceId !== "genshinDb") researchViolations.push(`${sourceId}:unexpectedlyPromoted`);
            if (research.packageManifest) {
                const manifest = research.packageManifest;
                if (manifest.kind !== "providerDatasetManifest") researchViolations.push(`${sourceId}:packageManifestKind`);
                if (!isGameVersionToken(manifest.gameVersion)) researchViolations.push(`${sourceId}:packageManifestGameVersion`);
                if (!validSha256(manifest.metadataSnapshot?.sha256)) researchViolations.push(`${sourceId}:packageManifestDigest`);
                if (manifest.metadataSnapshot?.materialized !== true) researchViolations.push(`${sourceId}:packageManifestNotMaterialized`);
                if (manifest.binding?.revision !== research.pinnedRevision) researchViolations.push(`${sourceId}:packageManifestRevisionBinding`);
                if (manifest.binding?.metadataDigest !== manifest.metadataSnapshot?.sha256) researchViolations.push(`${sourceId}:packageManifestMetadataBinding`);
                if (manifest.exactRevisionBinding !== true || manifest.strictlyBound !== true || manifest.status !== "ready") {
                    researchViolations.push(`${sourceId}:packageManifestNotStrictlyBound`);
                }
            }
            if (research.release) {
                const release = research.release;
                if (!validRevision(release.releaseRevision)) researchViolations.push(`${sourceId}:releaseRevision`);
                if (!validRevision(release.binding?.revision)) researchViolations.push(`${sourceId}:releaseBindingRevision`);
                if (release.binding?.revision !== release.releaseRevision) researchViolations.push(`${sourceId}:releaseBindingMismatch`);
                if (!validSha256(release.metadataSnapshot?.sha256)) researchViolations.push(`${sourceId}:releaseMetadataDigest`);
                if (release.binding?.metadataDigest !== release.metadataSnapshot?.sha256) researchViolations.push(`${sourceId}:releaseMetadataBinding`);
                if (release.metadataSnapshot?.materialized !== false) researchViolations.push(`${sourceId}:releaseSnapshotMaterialization`);
                if (release.strictlyBound === true || release.status === "ready") researchViolations.push(`${sourceId}:releaseUnexpectedlyPromoted`);
                if (release.releaseRevision === research.pinnedRevision && release.exactRevisionBinding !== true) {
                    researchViolations.push(`${sourceId}:exactReleaseBindingMissing`);
                }
                if (release.releaseRevision !== research.pinnedRevision && release.exactRevisionBinding === true) {
                    researchViolations.push(`${sourceId}:falseExactReleaseBinding`);
                }
            } else {
                researchViolations.push(`${sourceId}:releaseMissing`);
            }
            if (research.versionManifest) {
                const manifest = research.versionManifest;
                if (!validRevision(manifest.binding?.revision)) researchViolations.push(`${sourceId}:manifestBindingRevision`);
                if (catalogSource && manifest.binding?.revision !== catalogSource.revision) researchViolations.push(`${sourceId}:manifestRevisionBinding`);
                if (!validSha256(manifest.metadataSnapshot?.sha256)) researchViolations.push(`${sourceId}:manifestMetadataDigest`);
                if (manifest.binding?.metadataDigest !== manifest.metadataSnapshot?.sha256) researchViolations.push(`${sourceId}:manifestMetadataBinding`);
                if (manifest.metadataSnapshot?.materialized !== false) researchViolations.push(`${sourceId}:manifestSnapshotMaterialization`);
                if (manifest.strictlyBound === true || manifest.status === "ready") researchViolations.push(`${sourceId}:manifestUnexpectedlyPromoted`);
            }
            (research.fieldCandidates || []).forEach((field) => {
                const label = `${sourceId}:${field.slug || "unknown"}`;
                if (!field.sourceId || field.sourceId !== sourceId || !field.sourceRecordId || !field.path || field.field !== "recordSnapshot") researchViolations.push(`${label}:identity`);
                if (!isGameVersionToken(field.gameVersion)) researchViolations.push(`${label}:gameVersion`);
                if (!isGameVersionToken(field.introducedGameVersion)) researchViolations.push(`${label}:introducedGameVersion`);
                if (!validSha256(field.sourceRecordDigest)) researchViolations.push(`${label}:sourceRecordDigest`);
                if (!validSha256(field.metadataSnapshot?.sha256)) researchViolations.push(`${label}:metadataDigest`);
                if (field.metadataSnapshot?.sha256 !== field.sourceRecordDigest) researchViolations.push(`${label}:metadataDigestMismatch`);
                if (field.metadataSnapshot?.materialized !== false) researchViolations.push(`${label}:snapshotMaterialization`);
                if (!validRevision(field.binding?.revision) || field.binding?.revision !== research.pinnedRevision) researchViolations.push(`${label}:revisionBinding`);
                if (field.binding?.sourceRecordDigest !== field.sourceRecordDigest) researchViolations.push(`${label}:sourceRecordDigestBinding`);
                if (field.binding?.metadataDigest !== field.snapshotVersionProvenance?.gameVersionEvidence?.integrity?.digest) researchViolations.push(`${label}:metadataBinding`);
                if (field.snapshotVersionProvenance?.sourceRecordId !== field.sourceRecordId) researchViolations.push(`${label}:provenanceRecord`);
                if (field.snapshotVersionProvenance?.sourceRecordDigest !== field.sourceRecordDigest) researchViolations.push(`${label}:provenanceDigest`);
                if (field.snapshotVersionProvenance?.gameVersion !== field.gameVersion) researchViolations.push(`${label}:provenanceVersion`);
                if (field.exactRevisionBinding !== true || field.recordDigestBinding !== true) researchViolations.push(`${label}:exactBinding`);
                if (sourceId === "genshinDb") {
                    if (field.strictlyBound !== true || field.status !== "ready" || field.blockedReasons?.length !== 0) researchViolations.push(`${label}:notStrictlyBound`);
                } else if (field.strictlyBound === true || field.status === "ready") {
                    researchViolations.push(`${label}:unexpectedlyPromoted`);
                }
            });
        });
        const researchFields = Object.values(researchSources).flatMap((source) => source.fieldCandidates || []);
        const researchReleases = Object.values(researchSources).map((source) => source.release).filter(Boolean);
        const expectedSummary = {
            sources: Object.keys(researchSources).length,
            releaseCandidates: researchReleases.length,
            explicitGameVersionReleaseCandidates: researchReleases.filter((release) => isGameVersionToken(release.gameVersion)).length,
            exactReleaseRevisionBindings: researchReleases.filter((release) => release.exactRevisionBinding === true).length,
            fieldCandidates: researchFields.length,
            exactRevisionFieldCandidates: researchFields.filter((field) => field.exactRevisionBinding === true).length,
            recordDigestBoundFieldCandidates: researchFields.filter((field) => field.recordDigestBinding === true).length,
            strictlyBoundSources: Object.values(researchSources).filter((source) => source.strictBinding === true).length,
            strictlyBoundFields: researchFields.filter((field) => field.strictlyBound === true).length
        };
        Object.entries(expectedSummary).forEach(([key, value]) => {
            if (primaryResearch.summary?.[key] !== value) researchViolations.push(`primaryResearch:summary:${key}`);
        });
        if (primaryResearch.summary?.strictlyBoundSources !== 1) researchViolations.push("primaryResearch:strictlyBoundSources");
        if (primaryResearch.summary?.strictlyBoundFields !== 9) researchViolations.push("primaryResearch:strictlyBoundFields");
    }

    const feasibilityAudit = generated.feasibilityAudit || null;
    if (!feasibilityAudit) {
        researchViolations.push("feasibilityAudit:missing");
    } else {
        if (feasibilityAudit.contractUnchanged !== true) researchViolations.push("feasibilityAudit:contractChanged");
        if (feasibilityAudit.canonicalPromotion !== "forbidden") researchViolations.push("feasibilityAudit:canonicalPromotion");
        if (feasibilityAudit.providerAssessment?.gcsim?.strictBinding !== false) researchViolations.push("feasibilityAudit:gcsimStrictBinding");
        if (feasibilityAudit.providerAssessment?.genshinDb?.strictBinding !== true) researchViolations.push("feasibilityAudit:genshinDbStrictBinding");
        if (feasibilityAudit.impact?.canonicalCandidates?.total !== 2268) researchViolations.push("feasibilityAudit:candidateTotal");
        if (feasibilityAudit.impact?.claims?.total !== 12122) researchViolations.push("feasibilityAudit:claimTotal");
        if (feasibilityAudit.impact?.claims?.dualSourceEligible !== 5) researchViolations.push("feasibilityAudit:unexpectedDualSourceEligibility");
        if (feasibilityAudit.impact?.review?.humanDecisionRequiredNow !== 0) researchViolations.push("feasibilityAudit:unexpectedHumanDecision");
        const models = feasibilityAudit.evidenceModels || [];
        if (models.length !== 2 || models[0]?.status !== "current" || models[1]?.status !== "proposalOnlyNotImplemented") {
            researchViolations.push("feasibilityAudit:evidenceModels");
        }
    }

    if (generated.summary?.canonicalEligibility !== 0) canonicalViolations.push("summary:canonicalEligibility");
    if (generated.summary?.promotionGate !== "blocked") canonicalViolations.push("summary:promotionGate");
    if (generated.summary?.strictlyBoundSources !== 1) proofViolations.push("summary:strictlyBoundSources");
    if (generated.summary?.strictlyBoundRecords !== 9) proofViolations.push("summary:strictlyBoundRecords");
    if (sourceViolations.length) errors.push("source contract violation");
    if (recordViolations.length) errors.push("record contract violation");
    if (proofViolations.length) errors.push("primary evidence binding violation");
    if (canonicalViolations.length) errors.push("canonical promotion detected");
    if (researchViolations.length) errors.push("primary research contract violation");

    const summary = {
        schemaVersion: 1,
        status: errors.length ? "failed" : "passed",
        promotionGate: generated.summary?.promotionGate || "blocked",
        canonicalEligibility: generated.summary?.canonicalEligibility || 0,
        scopedCanonicalEligibility: generated.summary?.scopedCanonicalEligibility || 0,
        sources: sources.length,
        revisionPinnedSources: sources.filter((source) => source.revisionPinned).length,
        explicitGameVersionSources: sources.filter((source) => typeof source.gameVersion === "string" && source.gameVersion.length > 0).length,
        strictlyBoundSources: sources.filter((source) => source.gameVersionVerified).length,
        catalogRecords: records.length,
        fieldScopedRecords: records.filter((record) => record.fieldScoped).length,
        explicitGameVersionRecords: records.filter((record) => typeof record.gameVersion === "string" && record.gameVersion.length > 0).length,
        strictlyBoundRecords: records.filter((record) => record.gameVersionVerified).length,
        localSourceRecords: generated.localSourceRecords?.total || 0,
        localGameVersionPresent: generated.localSourceRecords?.gameVersionPresent || 0,
        externalEvidenceExplicitGameVersion: generated.externalEvidence?.explicit || 0,
        externalEvidenceVerifiedGameVersion: generated.externalEvidence?.verified || 0,
        primaryResearchSources: generated.summary?.primaryResearchSources || 0,
        primaryResearchFieldCandidates: generated.summary?.primaryResearchFieldCandidates || 0,
        primaryResearchExactRevisionFieldCandidates: generated.summary?.primaryResearchExactRevisionFieldCandidates || 0,
        primaryResearchStrictlyBoundSources: generated.summary?.primaryResearchStrictlyBoundSources || 0,
        primaryResearchStrictlyBoundFields: generated.summary?.primaryResearchStrictlyBoundFields || 0,
        blockedReasons: generated.blockedReasons?.length || 0,
        blockedReasonCounts: countBy(generated.blockedReasons || []),
        contract: {
            sourceViolations: sourceViolations.length,
            recordViolations: recordViolations.length,
            primaryEvidenceBindingViolations: proofViolations.length,
            canonicalViolations: canonicalViolations.length,
            primaryResearchViolations: researchViolations.length
        },
        generatedFromDisk: Boolean(generated.generatedFromDisk),
        deterministic: !errors.includes("artifact is not deterministic for current source files")
    };

    return {
        schemaVersion: 1,
        audit: "genshin-game-version-evidence-audit",
        status: summary.status,
        promotionGate: summary.promotionGate,
        canonicalEligibility: summary.canonicalEligibility,
        summary,
        methodology: {
            primarySourcesOnly: true,
            noNetwork: "The generator does not fetch URLs. Official provider/release locators are retained as review targets; acceptance requires materialized immutable metadata and exact revision/digest binding.",
            strictBinding: "An explicit gameVersion plus metadata SHA-256 is insufficient without binding.revision == source.revision; field-scoped records additionally require binding.sourceRecordDigest == record.sha256.",
            failClosed: "Missing or nearby/unbound metadata remains blocked and cannot promote canonical runtime data.",
            rejectedVersionProofs: REJECTED_VERSION_PROOFS
        },
        sourceCatalog: {
            sourceStatuses: sources,
            records: records,
            officialLocators
        },
        localSourceRecords: generated.localSourceRecords || null,
        externalEvidence: generated.externalEvidence || null,
        primaryResearch,
        feasibilityAudit,
        blockedReasons: generated.blockedReasons || [],
        errors,
        warnings,
        sourceViolations,
        recordViolations,
        primaryEvidenceBindingViolations: proofViolations,
        primaryResearchViolations: researchViolations,
        canonicalViolations,
        generatedFromDisk: Boolean(generated.generatedFromDisk)
    };
}

function renderMarkdown(report) {
    const s = report.summary;
    const sourceRows = (report.sourceCatalog?.sourceStatuses || []).slice().sort((a, b) => sortNatural(a.id, b.id)).map((source) => `| ${source.id} | ${source.revisionPinned ? "yes" : "no"} | ${source.gameVersion || "-"} | ${source.gameVersionVerified ? "yes" : "no"} | ${(source.blockedReasons || []).join(", ") || "none"} |`);
    const research = report.primaryResearch || {};
    const researchRows = Object.entries(research.sources || {}).sort(([a], [b]) => sortNatural(a, b)).map(([sourceId, source]) => `| ${sourceId} | ${source.release?.releaseTag || "-"} | ${source.release?.releaseRevision || "-"} | ${source.release?.gameVersion || "-"} | ${source.release?.exactRevisionBinding ? "yes" : "no"} | ${source.strictBinding ? "yes" : "no"} | ${(source.release?.blockedReasons || []).join(", ") || "none"} |`);
    const nextCandidates = research.nextCandidates || Object.values(research.sources || {}).flatMap((source) => source.nextCandidates || []);
    const feasibility = report.feasibilityAudit || {};
    const impact = feasibility.impact || {};
    const modelRows = (feasibility.evidenceModels || []).map((model) => `| ${model.id} | ${model.status} | ${model.falsePromotionRisk} | ${model.versionDriftRisk} | ${model.auditability} | ${model.reproducibility} |`);
    return [
        "# Genshin game-version primary evidence audit",
        "",
        `Status: **${report.status}**; promotion gate: **${report.promotionGate}**; canonical eligibility: **${report.canonicalEligibility}**`,
        "",
        "This report separates repository reproducibility from Genshin game-version proof. A commit/file digest is never treated as a patch version. The generator performs no network access and records official provider locators only as review targets.",
        "",
        "## Strict primary-evidence contract",
        "",
        `- Accepted kinds: ${ACCEPTED_EVIDENCE_KINDS.map((kind) => `\`${kind}\``).join(", ")}.`,
        "- Required: explicit gameVersion, metadata SHA-256, and `binding.revision` equal to the pinned source revision.",
        "- Field-scoped records additionally require `binding.sourceRecordDigest` equal to the exact pinned entity-file SHA-256.",
        `- Rejected as proof: ${REJECTED_VERSION_PROOFS.join("; ")}.`,
        "",
        "## Current source status",
        "",
        "| source | revision pinned | gameVersion | strictly bound | blocked reasons |",
        "| --- | --- | --- | --- | --- |",
        ...sourceRows,
        "",
        `- Sources: **${s.sources}**; revision-pinned: **${s.revisionPinnedSources}**; explicit gameVersion: **${s.explicitGameVersionSources}**; strictly bound: **${s.strictlyBoundSources}**.`,
        `- Catalog records: **${s.catalogRecords}**; field-scoped: **${s.fieldScopedRecords}**; explicit gameVersion: **${s.explicitGameVersionRecords}**; strictly bound: **${s.strictlyBoundRecords}**.`,
        `- Local SourceRecords: **${s.localSourceRecords}**; gameVersion present: **${s.localGameVersionPresent}**.`,
        `- Existing external field-evidence artifacts with explicit/verified gameVersion: **${s.externalEvidenceExplicitGameVersion}/${s.externalEvidenceVerifiedGameVersion}**.`,
        "",
        "## Current-contract feasibility and impact",
        "",
        `- gcsim: **${feasibility.providerAssessment?.gcsim?.classification || "unknown"}**; strict binding: **${feasibility.providerAssessment?.gcsim?.strictBinding ? "yes" : "no"}**.`,
        `- genshin-db: **${feasibility.providerAssessment?.genshinDb?.classification || "unknown"}**; strict binding: **${feasibility.providerAssessment?.genshinDb?.strictBinding ? "yes" : "no"}** (${feasibility.providerAssessment?.genshinDb?.gameVersion || "-"}).`,
        `- Current candidate exposure: **${impact.canonicalCandidates?.currentlyExcluded || 0}/${impact.canonicalCandidates?.total || 0}**; directly exposed to the missing gcsim revision version: **${impact.canonicalCandidates?.directlyExposedToMissingGcsimRevisionVersion || 0} candidates / ${impact.claims?.directlyExposedToMissingGcsimRevisionVersion || 0} claims**.`,
        `- Claim exposure: **${impact.claims?.missingVersion || 0}/${impact.claims?.total || 0}** missing version; dual-source eligible: **${impact.claims?.dualSourceEligible || 0}**.`,
        `- Dataset exposure: weapons **${impact.byDataset?.weapons?.candidates || 0} candidates / ${impact.byDataset?.weapons?.claims || 0} claims**; artifacts **${impact.byDataset?.artifacts?.candidates || 0} / ${impact.byDataset?.artifacts?.claims || 0}**; characters **${impact.byDataset?.characters?.candidates || 0} candidates**.`,
        "",
        "## Evidence-model comparison (no contract change)",
        "",
        "| model | status | false-promotion risk | version-drift risk | auditability | reproducibility |",
        "| --- | --- | --- | --- | --- | --- |",
        ...modelRows,
        "",
        "The alternative is a proposal only. Adoption requires explicit user approval and a separate DataContract/canonical-gate change.",
        "",
        "## Primary-source investigation (non-promoting)",
        "",
        "The following observations retain the strict genshin-db snapshot binding while keeping canonical runtime unchanged; AI self-approval is prohibited.",
        "",
        "| source | release | release revision | explicit gameVersion | exact pinned revision | strictly bound | blocked reasons |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        ...researchRows,
        "",
        `- Research sources: **${research.summary?.sources || 0}**; release candidates with explicit gameVersion: **${research.summary?.explicitGameVersionReleaseCandidates || 0}**; exact-revision field candidates: **${research.summary?.exactRevisionFieldCandidates || 0}**; strictly bound sources/fields: **${research.summary?.strictlyBoundSources || 0}/${research.summary?.strictlyBoundFields || 0}**.`,
        "- genshin-db record provenance uses the provider-authored package manifest as snapshot version 6.7. `src/data/version/weapons.json` remains introduction-version history and is retained separately; it never substitutes for the snapshot version.",
        "- gcsim v2.44.2 resolves to the pinned revision, but the release metadata has no explicit Genshin gameVersion. HoYoLAB 6.7 corroboration is cross-source and is not revision-bound.",
        "",
        "### Next candidates",
        "",
        ...(nextCandidates.length ? nextCandidates.map((candidate) => `- ${candidate}`) : ["- none"]),
        "",
        "## Result",
        "",
        "The genshin-db source and nine exact weapon records now carry accepted same-revision snapshot-version provenance for 6.7. gcsim still lacks revision-specific Genshin gameVersion evidence, and local/second-provider claim gates remain blocked; canonical eligibility remains zero.",
        "",
        "## Blocked reasons",
        "",
        ...(report.blockedReasons.length ? report.blockedReasons.map((reason) => `- \`${reason}\``) : ["- none"]),
        "",
        `Audit errors: **${report.errors.length}**; warnings: **${report.warnings.length}**; deterministic artifact: **${s.deterministic ? "yes" : "no"}**.`,
        ""
    ].join("\n");
}

function writeReports(report, { reportJsonPath = defaultReportJsonPath, reportMarkdownPath = defaultReportMarkdownPath } = {}) {
    fs.mkdirSync(path.dirname(reportJsonPath), { recursive: true });
    fs.writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    fs.writeFileSync(reportMarkdownPath, renderMarkdown(report), "utf8");
}

function parseArgs(argv) {
    const args = {
        dataRoot: defaultDataRoot,
        sourceCatalogFile: path.join(defaultDataRoot, "v2", "source-catalog.json"),
        evidencePath: defaultOutputFile,
        reportJsonPath: defaultReportJsonPath,
        reportMarkdownPath: defaultReportMarkdownPath
    };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--data-root") args.dataRoot = path.resolve(argv[++index]);
        else if (arg === "--source-catalog") args.sourceCatalogFile = path.resolve(argv[++index]);
        else if (arg === "--evidence") args.evidencePath = path.resolve(argv[++index]);
        else if (arg === "--report-json") args.reportJsonPath = path.resolve(argv[++index]);
        else if (arg === "--report-md") args.reportMarkdownPath = path.resolve(argv[++index]);
        else if (arg === "--help") args.help = true;
        else throw new Error(`unknown argument: ${arg}`);
    }
    return args;
}

if (require.main === module) {
    try {
        const args = parseArgs(process.argv.slice(2));
        if (args.help) {
            console.log("Usage: node scripts/genshinGameVersionEvidenceAudit.cjs [--evidence <path>] [--source-catalog <path>]");
            process.exit(0);
        }
        const report = auditEvidence({
            dataRoot: args.dataRoot,
            sourceCatalogFile: args.sourceCatalogFile,
            outputFile: args.evidencePath
        });
        writeReports(report, args);
        console.log(JSON.stringify(report.summary, null, 2));
        if (report.status !== "passed") process.exitCode = 1;
    } catch (error) {
        console.error(error.stack || error.message);
        process.exitCode = 1;
    }
}

module.exports = {
    auditEvidence,
    defaultDataRoot,
    defaultOutputFile,
    defaultReportJsonPath,
    defaultReportMarkdownPath,
    loadGenerated,
    renderMarkdown,
    writeReports
};
