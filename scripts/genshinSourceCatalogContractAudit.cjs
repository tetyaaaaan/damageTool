"use strict";

/**
 * Deterministic, read-only audit of the external-source contract.
 *
 * A Git revision and a file digest prove which repository bytes were pinned;
 * they do not prove which Genshin game patch those bytes describe.  This
 * audit keeps those dimensions separate and reports the exact metadata still
 * required before a source can participate in the canonical gate.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { verifySourceArtifactProof } = require("./genshinSourceArtifactProof.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const sourceCatalogPath = path.join(dataRoot, "v2", "source-catalog.json");
const sourceCatalogSchemaPath = path.join(dataRoot, "schema", "source-catalog.schema.json");
const sourceRecordSchemaPath = path.join(dataRoot, "schema", "source-record.schema.json");
const reportJsonPath = path.join(repositoryRoot, "reports", "genshin-source-catalog-contract-audit.json");
const reportMarkdownPath = path.join(repositoryRoot, "reports", "genshin-source-catalog-contract-audit.md");

const GAME_VERSION_EVIDENCE_KINDS = [
    "gameClientManifest",
    "providerDatasetManifest",
    "providerReleaseArtifact",
    "releaseNotesWithExplicitGameVersion"
];

const REQUIRED_CONTRACT = {
    revisionSemantics: "repositoryRevisionOnly",
    gameVersionSemantics: "explicitGameVersionEvidenceRequired",
    independenceSemantics: "distinctProviderAndIndependenceGroup",
    canonicalGate: "revisionAndFileDigestNeverSubstituteForGameVersion"
};

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableJson(value) {
    return JSON.stringify(stableValue(value));
}

function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function fileDigest(file) {
    return sha256(fs.readFileSync(file));
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

function relativePath(file) {
    return path.relative(repositoryRoot, file).replaceAll(path.sep, "/");
}

function inputManifest() {
    return [
        ["sourceCatalog", sourceCatalogPath],
        ["sourceCatalogSchema", sourceCatalogSchemaPath],
        ["sourceRecordSchema", sourceRecordSchemaPath],
        ["weaponSourceRecords", path.join(dataRoot, "v2", "weapons", "source-records.json")],
        ["artifactSourceRecords", path.join(dataRoot, "v2", "artifacts", "source-records.json")]
    ].map(([role, file]) => {
        if (!fs.existsSync(file)) return { role, path: relativePath(file), exists: false, sha256: null, bytes: 0 };
        return {
            role,
            path: relativePath(file),
            exists: true,
            sha256: fileDigest(file),
            bytes: fs.statSync(file).size
        };
    });
}

function validSha256(value) {
    return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function validRevision(value) {
    return typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
}

function nonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function isVersionEvidenceComplete(evidence, expectedGameVersion = null) {
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return false;
    if (!GAME_VERSION_EVIDENCE_KINDS.includes(evidence.kind)) return false;
    if (!nonEmptyString(evidence.gameVersion)) return false;
    if (expectedGameVersion && evidence.gameVersion !== expectedGameVersion) return false;
    const locator = evidence.locator;
    if (!locator || !nonEmptyString(locator.dataset) || !nonEmptyString(locator.record)) return false;
    return evidence.integrity?.algorithm === "sha256" && validSha256(evidence.integrity?.digest);
}

function inspectCatalogContract(catalog, options = {}) {
    const errors = [];
    const blockedReasons = [];
    const contract = catalog?.contract || {};
    Object.entries(REQUIRED_CONTRACT).forEach(([key, expected]) => {
        if (contract[key] !== expected) errors.push(`contract:${key}:invalid`);
    });
    if (!Array.isArray(contract.gameVersionEvidenceKinds)
        || contract.gameVersionEvidenceKinds.join("|") !== GAME_VERSION_EVIDENCE_KINDS.join("|")) {
        errors.push("contract:gameVersionEvidenceKinds:invalid");
    }
    const sourceEntries = Object.entries(catalog?.sources || {}).sort(([a], [b]) => sortNatural(a, b));
    const sourceStatuses = sourceEntries.map(([id, source]) => {
        const reasons = [];
        const revisionPinned = validRevision(source?.revision) && source?.revisionKind === "gitCommit";
        if (!revisionPinned) reasons.push("revisionPin:invalid");
        if (!nonEmptyString(source?.provider)) reasons.push("provider:missing");
        if (!nonEmptyString(source?.repository)) reasons.push("repository:missing");
        if (!nonEmptyString(source?.independenceGroup)) reasons.push("independenceGroup:missing");
        const hasGameVersion = nonEmptyString(source?.gameVersion);
        const gameVersionEvidence = source?.gameVersionEvidence || null;
        const artifactProof = verifySourceArtifactProof(
            { id, ...source },
            null,
            { repositoryRoot, ...options }
        );
        const gameVersionVerified = hasGameVersion
            && isVersionEvidenceComplete(gameVersionEvidence, source.gameVersion)
            && gameVersionEvidence?.binding?.revision === source?.revision
            && gameVersionEvidence?.binding?.metadataDigest === gameVersionEvidence?.integrity?.digest;
        const materializedVersionProof = artifactProof.versionManifestVerified === true;
        if (!materializedVersionProof) reasons.push("gameVersionEvidence:artifactUnverified");
        if (artifactProof.reasons.length) reasons.push(...artifactProof.reasons);
        if (!hasGameVersion) reasons.push("gameVersion:missing");
        if (!gameVersionEvidence) reasons.push("gameVersionEvidence:missing");
        else if (!isVersionEvidenceComplete(gameVersionEvidence, source.gameVersion || null)) reasons.push("gameVersionEvidence:invalid");
        // This is intentionally a separate axis from revisionPinned.  A
        // commit can be reproducible while still lacking a game patch claim.
        if (revisionPinned && (!gameVersionVerified || !materializedVersionProof)) reasons.push("revisionPin:notGameVersionProof");
        if (reasons.some((reason) => reason.startsWith("gameVersion") || reason === "revisionPin:notGameVersionProof")) {
            blockedReasons.push(...reasons.filter((reason) => reason.startsWith("gameVersion") || reason === "revisionPin:notGameVersionProof").map((reason) => `source:${id}:${reason}`));
        }
        return {
            id,
            provider: source?.provider || null,
            repository: source?.repository || null,
            independenceGroup: source?.independenceGroup || null,
            role: source?.role || null,
            revision: source?.revision || null,
            revisionKind: source?.revisionKind || null,
            revisionPinned,
            gameVersion: source?.gameVersion || null,
            gameVersionEvidence: clone(gameVersionEvidence),
            gameVersionVerified: Boolean(gameVersionVerified && materializedVersionProof),
            artifactProof: clone(artifactProof.artifactProof),
            sourceArtifactProof: clone(artifactProof),
            rawArtifactVerified: artifactProof.rawArtifactVerified,
            versionManifestVerified: artifactProof.versionManifestVerified,
            fieldProofVerified: artifactProof.fieldProofVerified,
            status: reasons.length ? "blocked" : "ready",
            blockedReasons: [...new Set(reasons)].sort()
        };
    });
    const groups = sourceStatuses.map((source) => source.independenceGroup).filter(Boolean);
    if (new Set(groups).size < 2 && sourceStatuses.length >= 2) {
        blockedReasons.push("catalog:independenceGroups:insufficient");
    }
    return {
        errors,
        blockedReasons: [...new Set(blockedReasons)].sort(),
        contract: clone(contract),
        sources: sourceStatuses,
        independence: {
            providerCount: new Set(sourceStatuses.map((source) => source.provider).filter(Boolean)).size,
            independenceGroupCount: new Set(groups).size,
            declaredGroups: [...new Set(groups)].sort(sortNatural),
            distinctGroupsDeclared: new Set(groups).size >= 2
        }
    };
}

function inspectCatalogRecords(catalog, sourceStatuses, options = {}) {
    const sourceMap = new Map(sourceStatuses.map((source) => [source.id, source]));
    const blockedReasons = [];
    const errors = [];
    const records = Object.entries(catalog?.records || {}).sort(([a], [b]) => sortNatural(a, b)).map(([id, record]) => {
        const reasons = [];
        const source = sourceMap.get(record?.source);
        if (!source) {
            errors.push(`record:${id}:source:unresolved`);
            reasons.push("source:unresolved");
        }
        const artifactProof = source
            ? verifySourceArtifactProof(source, { id, ...record }, { repositoryRoot, ...options })
            : null;
        const revisionPinned = Boolean(artifactProof?.revisionVerified === true);
        if (!source?.revisionPinned || !nonEmptyString(record?.path) || !validSha256(record?.sha256)) {
            reasons.push("revisionPin:invalid");
        }
        // Catalog records are entity/file pins today.  A future field-level
        // record must carry a gameVersion and matching primary evidence; a
        // source-level commit pin is not inherited as proof automatically.
        const fieldPointer = record?.fieldPointer || null;
        const fieldDeclared = nonEmptyString(fieldPointer) || nonEmptyString(record?.field);
        const entityScoped = !fieldPointer && ["recordSnapshot", "entitySnapshot", "snapshot"].includes(record?.field);
        const fieldScoped = Boolean(nonEmptyString(fieldPointer) && !entityScoped);
        const versionEvidenceVerified = Boolean(artifactProof?.versionManifestVerified === true
            && artifactProof?.rawArtifactVerified === true
            && artifactProof?.revisionVerified === true);
        const gameVersionVerified = Boolean(versionEvidenceVerified && artifactProof?.fieldProofVerified === true);
        if (!fieldDeclared) reasons.push("fieldScope:missing");
        if (entityScoped) reasons.push("fieldScope:entitySnapshotOnly");
        if (!artifactProof?.rawArtifactVerified) reasons.push("rawArtifact:unverified");
        if (!source?.revisionPinned) reasons.push("revisionPin:invalid");
        else if (!artifactProof?.revisionVerified) reasons.push("revisionPin:unverified");
        if (!artifactProof?.versionManifestVerified) reasons.push("versionManifest:unverified");
        if (artifactProof?.reasons?.length) reasons.push(...artifactProof.reasons);
        if (!gameVersionVerified) reasons.push("gameVersionEvidence:missing");
        if (reasons.some((reason) => reason.startsWith("gameVersion"))) blockedReasons.push(`record:${id}:gameVersionEvidence:missing`);
        return {
            id,
            source: record?.source || null,
            path: record?.path || null,
            sha256: record?.sha256 || null,
            revisionPinned,
            rawArtifactVerified: artifactProof?.rawArtifactVerified === true,
            versionManifestVerified: artifactProof?.versionManifestVerified === true,
            versionEvidenceVerified,
            fieldProofVerified: artifactProof?.fieldProofVerified === true,
            artifactProof: clone(artifactProof?.artifactProof || null),
            sourceArtifactProof: clone(artifactProof || null),
            fieldDeclared,
            fieldPointer,
            entityScoped,
            fieldScoped,
            gameVersion: record?.gameVersion || null,
            gameVersionEvidence: clone(record?.gameVersionEvidence || null),
            gameVersionVerified,
            status: reasons.length ? "blocked" : "ready",
            blockedReasons: [...new Set(reasons)].sort()
        };
    });
    return {
        errors,
        blockedReasons: [...new Set(blockedReasons)].sort(),
        total: records.length,
        revisionPinned: records.filter((record) => record.revisionPinned).length,
        rawArtifactVerified: records.filter((record) => record.rawArtifactVerified).length,
        versionManifestVerified: records.filter((record) => record.versionManifestVerified).length,
        versionEvidenceVerified: records.filter((record) => record.versionEvidenceVerified).length,
        fieldScoped: records.filter((record) => record.fieldScoped).length,
        fieldProofVerified: records.filter((record) => record.fieldProofVerified).length,
        gameVersionVerified: records.filter((record) => record.gameVersionVerified).length,
        records
    };
}

function inspectLocalSourceRecords() {
    const datasets = [
        ["weapons", path.join(dataRoot, "v2", "weapons", "source-records.json")],
        ["artifacts", path.join(dataRoot, "v2", "artifacts", "source-records.json")]
    ];
    const byDataset = {};
    const errors = [];
    datasets.forEach(([name, file]) => {
        if (!fs.existsSync(file)) {
            errors.push(`${name}:sourceRecords:missing`);
            byDataset[name] = { total: 0, gameVersionPresent: 0, gameVersionMissing: 0, evidencePresent: 0, providers: {}, capturedAt: {} };
            return;
        }
        const records = Object.values(readJson(file));
        const gameVersionPresent = records.filter((record) => nonEmptyString(record?.gameVersion)).length;
        const evidencePresent = records.filter((record) => isVersionEvidenceComplete(record?.gameVersionEvidence, record?.gameVersion || null)).length;
        byDataset[name] = {
            total: records.length,
            gameVersionPresent,
            gameVersionMissing: records.length - gameVersionPresent,
            evidencePresent,
            providers: countBy(records.map((record) => record?.provider || "unknown")),
            capturedAt: countBy(records.map((record) => record?.capturedAt || "unknown"))
        };
    });
    return {
        errors,
        byDataset,
        total: Object.values(byDataset).reduce((sum, dataset) => sum + dataset.total, 0),
        gameVersionPresent: Object.values(byDataset).reduce((sum, dataset) => sum + dataset.gameVersionPresent, 0),
        gameVersionMissing: Object.values(byDataset).reduce((sum, dataset) => sum + dataset.gameVersionMissing, 0),
        evidencePresent: Object.values(byDataset).reduce((sum, dataset) => sum + dataset.evidencePresent, 0)
    };
}

function buildAudit() {
    const catalog = readJson(sourceCatalogPath);
    const catalogContract = inspectCatalogContract(catalog);
    const catalogRecords = inspectCatalogRecords(catalog, catalogContract.sources);
    const localRecords = inspectLocalSourceRecords();
    const dualSource = require(path.join(repositoryRoot, "scripts", "genshinV2DualSourceAudit.cjs")).buildAudit();
    const canonical = require(path.join(repositoryRoot, "scripts", "genshinCanonicalRuntimeGenerate.cjs")).buildRepositoryAuditReport({ dataRoot });
    const errors = [
        ...catalogContract.errors,
        ...catalogRecords.errors,
        ...localRecords.errors,
        ...dualSource.errors
    ];
    const blockedReasons = [
        ...catalogContract.blockedReasons,
        ...catalogRecords.blockedReasons,
        ...(localRecords.gameVersionMissing ? [`localSourceRecords:gameVersion:missing:${localRecords.gameVersionMissing}`] : []),
        ...(dualSource.summary.missingVersionClaims ? [`dualSource:fieldGameVersion:missing:${dualSource.summary.missingVersionClaims}`] : []),
        ...(dualSource.summary.independentPinnedWeaponCandidates ? [`dualSource:pinnedEntityFiles:gameVersionProofMissing:${dualSource.summary.independentPinnedWeaponCandidates}`] : []),
        ...(dualSource.sourceCatalog.gcsimArtifactRecordCount === 0 ? ["sourceCatalog:gcsim:artifactRecords:missing"] : []),
        ...(dualSource.sourceCatalog.goEvidence?.found !== true ? ["sourceCatalog:go:records:missing"] : []),
        ...(canonical.repository.canonical === 0 ? ["canonicalGate:canonicalEligibility:zero"] : [])
    ];
    const deduplicatedBlockedReasons = [...new Set(blockedReasons)].sort();
    return {
        schemaVersion: 1,
        audit: "genshin-source-catalog-contract-audit",
        status: errors.length ? "failed" : "passed",
        promotionGate: deduplicatedBlockedReasons.length ? "blocked" : "eligible",
        canonicalEligibility: 0,
        methodology: {
            readOnly: true,
            revision: "A 40-hex Git commit plus file SHA-256 proves reproducible repository bytes only; it is never interpreted as gameVersion.",
            gameVersion: "A source must publish an explicit gameVersion and a matching primary metadata locator/digest. capturedAt, package semver, Git tag/date, branch, commit, and file path are not game-version proof.",
            fieldEligibility: "Only field-scoped evidence with supportsClaimValue and gameVersionVerified may satisfy the dual-source/canonical field gate.",
            independence: "Two providers must resolve to distinct independenceGroup values; same-provider local layers remain one group.",
            candidateMutation: "No candidate verification, runtime status, or claim values are changed by this audit."
        },
        primaryMetadataContract: {
            acceptedEvidenceKinds: GAME_VERSION_EVIDENCE_KINDS,
            requiredFields: ["gameVersion", "gameVersionEvidence.kind", "gameVersionEvidence.locator.dataset", "gameVersionEvidence.locator.record", "gameVersionEvidence.integrity.algorithm", "gameVersionEvidence.integrity.digest"],
            rejectedAsGameVersionProof: ["revision", "revisionKind", "repository commit/date", "Git tag or branch", "package semver", "capturedAt", "entity file path", "entity file SHA-256 without version metadata"],
            note: "A provider release note is acceptable only when it explicitly names the Genshin game version and is pinned/digested; a library release number alone is not."
        },
        generatedFrom: inputManifest(),
        sourceCatalog: {
            contract: catalogContract.contract,
            sourceStatuses: catalogContract.sources,
            independence: catalogContract.independence,
            recordSummary: {
                total: catalogRecords.total,
                revisionPinned: catalogRecords.revisionPinned,
                rawArtifactVerified: catalogRecords.rawArtifactVerified,
                versionManifestVerified: catalogRecords.versionManifestVerified,
                versionEvidenceVerified: catalogRecords.versionEvidenceVerified,
                fieldScoped: catalogRecords.fieldScoped,
                fieldProofVerified: catalogRecords.fieldProofVerified,
                gameVersionVerified: catalogRecords.gameVersionVerified
            },
            records: catalogRecords.records
        },
        localSourceRecords: localRecords,
        dualSourceAudit: {
            status: dualSource.status,
            candidates: clone(dualSource.summary.candidates),
            claims: clone(dualSource.summary.claims),
            classificationCounts: clone(dualSource.summary.classificationCounts),
            dualSourceEligibleClaims: dualSource.summary.dualSourceEligibleClaims,
            dualSourceEligibleCandidates: dualSource.summary.dualSourceEligibleCandidates,
            missingVersionClaims: dualSource.summary.missingVersionClaims,
            pinnedEntityWeaponCandidates: dualSource.summary.independentPinnedWeaponCandidates,
            gcsimArtifactRecordCount: dualSource.sourceCatalog.gcsimArtifactRecordCount,
            goEvidence: clone(dualSource.sourceCatalog.goEvidence)
        },
        canonicalGate: {
            status: canonical.status,
            totalCandidates: canonical.repository.totalCandidates,
            canonical: canonical.repository.canonical,
            excluded: canonical.repository.excluded,
            policy: clone(canonical.policy),
            categories: Object.fromEntries(Object.entries(canonical.repository.categories).map(([name, category]) => [name, {
                candidates: category.candidates,
                canonical: category.canonical,
                excluded: category.excluded,
                primaryBlocks: clone(category.primaryBlocks)
            }]))
        },
        blockedReasons: deduplicatedBlockedReasons,
        errors: [...new Set(errors)].sort()
    };
}

function renderMarkdown(audit) {
    const sourceRows = audit.sourceCatalog.sourceStatuses.map((source) => {
        const reasons = source.blockedReasons.join(", ") || "none";
        return `| ${source.id} | ${source.provider} | ${source.independenceGroup} | ${source.revisionPinned ? "yes" : "no"} | ${source.gameVersion || "—"} | ${source.gameVersionVerified ? "yes" : "no"} | ${reasons} |`;
    });
    const recordRows = audit.sourceCatalog.records.slice(0, 12).map((record) => `| \`${record.id}\` | ${record.source} | ${record.revisionPinned ? "yes" : "no"} | ${record.fieldScoped ? "yes" : "no"} | ${record.gameVersionVerified ? "yes" : "no"} | ${record.blockedReasons.join(", ") || "none"} |`);
    const local = audit.localSourceRecords;
    return [
        "# Genshin external source catalog contract audit",
        "",
        `Status: **${audit.status}**; promotion gate: **${audit.promotionGate}**; canonical eligibility: **${audit.canonicalEligibility}**`,
        "",
        "This read-only report separates repository reproducibility from game-version proof. A pinned Git revision and file digest identify bytes, but they do not identify a Genshin patch.",
        "",
        "## Contract",
        "",
        "- Required game-version proof: explicit `gameVersion` plus a matching primary metadata locator and SHA-256 digest.",
        `- Accepted metadata kinds: ${audit.primaryMetadataContract.acceptedEvidenceKinds.map((kind) => `\`${kind}\``).join(", ")}.`,
        "- Rejected as game-version proof: Git commit/tag/date, package semver, branch, capturedAt, entity path, or entity digest alone.",
        "- Field-level dual-source evidence still requires comparable values, two independent groups, and `supportsClaimValue`; entity-only pins never satisfy it.",
        "",
        "## Catalog source status",
        "",
        "| source | provider | independence group | revision pinned | gameVersion | game-version verified | blocked reasons |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        ...sourceRows,
        "",
        `Catalog records: **${audit.sourceCatalog.recordSummary.total}**; revision/file pins: **${audit.sourceCatalog.recordSummary.revisionPinned}**; field-scoped: **${audit.sourceCatalog.recordSummary.fieldScoped}**; game-version verified: **${audit.sourceCatalog.recordSummary.gameVersionVerified}**.`,
        "",
        "### Pinned record sample",
        "",
        "| record | source | revision pinned | field scoped | game-version verified | blocked reasons |",
        "| --- | --- | --- | --- | --- | --- |",
        ...recordRows,
        "",
        "## Local records and gates",
        "",
        `- Local SourceRecords: **${local.total}** total; **${local.gameVersionPresent}** with gameVersion; **${local.gameVersionMissing}** missing gameVersion; **${local.evidencePresent}** with complete primary version evidence.`,
        `- Dual-source claims: **${audit.dualSourceAudit.claims.total}**; eligible claims/candidates: **${audit.dualSourceAudit.dualSourceEligibleClaims}/${audit.dualSourceAudit.dualSourceEligibleCandidates}**; missing-version claims: **${audit.dualSourceAudit.missingVersionClaims}**.`,
        `- gcsim pinned weapon entities: **${audit.dualSourceAudit.pinnedEntityWeaponCandidates}**; gcsim artifact records: **${audit.dualSourceAudit.gcsimArtifactRecordCount}**; GO evidence present: **${audit.dualSourceAudit.goEvidence.found ? "yes" : "no"}**.`,
        `- Canonical gate: **${audit.canonicalGate.canonical}** canonical of **${audit.canonicalGate.totalCandidates}** candidates; fail-closed status **${audit.canonicalGate.status}**.`,
        "",
        "## Blocked reasons",
        "",
        ...audit.blockedReasons.map((reason) => `- \`${reason}\``),
        "",
        "No candidate was marked verified or canonical by this audit. Full deterministic details are in the adjacent JSON report.",
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
    process.stdout.write(`${JSON.stringify({
        status: audit.status,
        promotionGate: audit.promotionGate,
        canonicalEligibility: audit.canonicalEligibility,
        blockedReasons: audit.blockedReasons.length,
        sourceRecords: audit.localSourceRecords.total,
        gameVersionPresent: audit.localSourceRecords.gameVersionPresent,
        catalogPins: audit.sourceCatalog.recordSummary.revisionPinned,
        fieldVersionVerified: audit.sourceCatalog.recordSummary.gameVersionVerified
    }, null, 2)}\n`);
    if (audit.errors.length) process.exitCode = 1;
}

module.exports = {
    buildAudit,
    inspectCatalogContract,
    inspectCatalogRecords,
    inspectLocalSourceRecords,
    renderMarkdown,
    writeReports,
    paths: { reportJsonPath, reportMarkdownPath, sourceCatalogPath, sourceCatalogSchemaPath, sourceRecordSchemaPath },
    stableJson,
    GAME_VERSION_EVIDENCE_KINDS
};
