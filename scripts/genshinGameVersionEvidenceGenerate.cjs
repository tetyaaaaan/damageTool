"use strict";

/**
 * Build a deterministic, evidence-only audit of Genshin game-version proof.
 *
 * A source revision identifies reproducible bytes.  It does not identify a
 * Genshin patch.  This artifact records the primary metadata locators that a
 * future reviewer may materialize and applies a stricter binding contract:
 * the metadata must name a gameVersion, carry a SHA-256 digest, and bind that
 * claim to the exact source revision (and, for a catalog record, the exact
 * source-file digest).  No network access or candidate mutation occurs here.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultDataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultSourceCatalogPath = path.join(defaultDataRoot, "v2", "source-catalog.json");
const defaultOutputFile = path.join(defaultDataRoot, "v2", "game-version-evidence.json");
const defaultReportJsonPath = path.join(repositoryRoot, "reports", "genshin-game-version-evidence.json");
const defaultReportMarkdownPath = path.join(repositoryRoot, "reports", "genshin-game-version-evidence.md");
const GENERATOR_VERSION = "genshinGameVersionEvidenceGenerate/1";
const CAPTURED_AT = "2026-08-16T00:00:00.000Z";
const PRIMARY_RESEARCH_VERSION = "genshinGameVersionPrimaryResearch/1";
const PRIMARY_RESEARCH_CAPTURED_AT = "2026-08-23T00:00:00.000Z";

// These are immutable observations from the primary provider repositories and
// official release metadata.  They are deliberately kept separate from the
// accepted gameVersionEvidence fields below: a release/tag or an extracted
// provider field is not promoted unless its semantics and exact revision
// binding satisfy strictEvidence().  The snapshots are represented by digest
// and locator only; the original bytes are not bundled in this repository.
const PRIMARY_SOURCE_RESEARCH = {
    gcsim: {
        provider: "genshinsim/gcsim",
        repository: "https://github.com/genshinsim/gcsim",
        pinnedRevision: "3647a07a7cc3004bc1e79d9bb5f7444de20dceaa",
        release: {
            kind: "providerReleaseArtifact",
            locator: {
                dataset: "GitHub release metadata",
                record: "v2.44.2",
                url: "https://github.com/genshinsim/gcsim/releases/tag/v2.44.2"
            },
            releaseTag: "v2.44.2",
            releaseRevision: "3647a07a7cc3004bc1e79d9bb5f7444de20dceaa",
            publishedAt: "2026-08-17T18:37:52Z",
            createdAt: "2026-08-14T01:05:39Z",
            metadataSnapshot: {
                canonicalization: "selected release API fields (tagName, name, targetCommitish, publishedAt, createdAt, htmlUrl, body) with LF body",
                bytes: 1604,
                sha256: "4ab2167682c6ffb1a81f4560fef5ea032d7e9daa083fbeb9bf65dfcb89059037",
                materialized: false,
                observedExternally: true
            },
            gameVersion: null,
            explicitGameVersion: false,
            binding: {
                revision: "3647a07a7cc3004bc1e79d9bb5f7444de20dceaa",
                sourceRecordDigest: null,
                metadataDigest: "4ab2167682c6ffb1a81f4560fef5ea032d7e9daa083fbeb9bf65dfcb89059037"
            },
            exactRevisionBinding: true,
            strictlyBound: false,
            status: "candidate",
            blockedReasons: [
                "gameVersionMissingInReleaseMetadata",
                "metadataSnapshotNotMaterializedForOfflineReplay"
            ],
            nextCandidates: [
                "materialize a primary gcsim manifest or release artifact that explicitly names the Genshin gameVersion",
                "retain the exact release API snapshot and prove its gameVersion field is bound to this revision"
            ]
        },
        corroboration: {
            kind: "officialVersionCorroboration",
            locator: {
                dataset: "HoYoLAB official update article",
                record: "Luna VIII update details",
                url: "https://www.hoyolab.com/article_pre/18014398241022990"
            },
            gameVersion: "6.7",
            explicitText: "Version \"Luna VIII\" Update Details",
            supportsFeature: "Stellar-Conduct",
            binding: {
                revision: null,
                sourceRecordDigest: null,
                metadataDigest: null
            },
            strictlyBound: false,
            status: "candidate",
            blockedReasons: [
                "crossSourceVersionNotRevisionBound",
                "metadataSnapshotNotMaterializedForOfflineReplay"
            ]
        },
        strictBinding: false,
        nextCandidates: [
            "obtain an immutable official/provider manifest with explicit gameVersion and exact gcsim revision binding",
            "do not infer 6.7 from the HoYoLAB article or from the v2.44.2 release date"
        ]
    },
    genshinDb: {
        provider: "theBowja/genshin-db",
        repository: "https://github.com/theBowja/genshin-db",
        pinnedRevision: "1bab2cdba4d218fd5caa46b5f54e7884ee8359a2",
        packageManifest: {
            kind: "providerDatasetManifest",
            locator: {
                dataset: "theBowja/genshin-db package metadata",
                record: "package.json@1bab2cdba4d218fd5caa46b5f54e7884ee8359a2",
                path: "package.json",
                url: "https://raw.githubusercontent.com/theBowja/genshin-db/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/package.json",
                field: "description"
            },
            explicitText: "Genshin Impact v6.7 JSON data.",
            packageVersion: "5.2.12",
            gameVersion: "6.7",
            explicitGameVersion: true,
            metadataSnapshot: {
                canonicalization: "raw UTF-8 bytes at the pinned revision",
                bytes: 1619,
                sha256: "5ded2b3bab58218da17f6a1282209e653c1ec7ecd9297b95569558a737c2e8f6",
                materialized: true,
                observedExternally: true
            },
            binding: {
                revision: "1bab2cdba4d218fd5caa46b5f54e7884ee8359a2",
                sourceRecordDigest: null,
                metadataDigest: "5ded2b3bab58218da17f6a1282209e653c1ec7ecd9297b95569558a737c2e8f6"
            },
            exactRevisionBinding: true,
            strictlyBound: true,
            status: "ready",
            support: {
                maintenancePath: "checklist.txt",
                maintenanceRule: "Genshin version update updates the game version number in README and package description before package publication.",
                publishWorkflowPath: ".github/workflows/manual_publish.yml",
                publishRule: "The workflow checks out the selected revision, assembles data, and publishes the package with provenance."
            },
            blockedReasons: []
        },
        release: {
            kind: "providerReleaseArtifact",
            locator: {
                dataset: "GitHub release metadata",
                record: "v5.2.12",
                url: "https://github.com/theBowja/genshin-db/releases/tag/v5.2.12"
            },
            releaseTag: "v5.2.12",
            releaseRevision: "67f563f693343ea2ec8e8121f1245dcb010a8809",
            publishedAt: "2026-07-01T18:12:31Z",
            createdAt: "2026-07-01T18:12:01Z",
            explicitText: "Genshin 6.7 update",
            gameVersion: "6.7",
            explicitGameVersion: true,
            metadataSnapshot: {
                canonicalization: "selected release API fields (tagName, name, targetCommitish, publishedAt, createdAt, htmlUrl, body) with LF body",
                bytes: 228,
                sha256: "1ef4b50a93c228e647eb38db44145c870dd74809adf5225fe6848dc2c52a5610",
                materialized: false,
                observedExternally: true
            },
            binding: {
                revision: "67f563f693343ea2ec8e8121f1245dcb010a8809",
                sourceRecordDigest: null,
                metadataDigest: "1ef4b50a93c228e647eb38db44145c870dd74809adf5225fe6848dc2c52a5610"
            },
            exactRevisionBinding: false,
            strictlyBound: false,
            status: "candidate",
            blockedReasons: [
                "releaseRevisionIsAncestorOfPinnedRevision",
                "exactPinnedRevisionBindingMissing",
                "metadataSnapshotNotMaterializedForOfflineReplay"
            ],
            nextCandidates: [
                "materialize release metadata for a release whose commit is exactly the pinned revision",
                "prove that any post-release commits preserve the explicit version claim before accepting it"
            ]
        },
        versionManifest: {
            kind: "providerDatasetManifest",
            locator: {
                dataset: "genshin-db source data",
                record: "src/data/version/weapons.json",
                path: "src/data/version/weapons.json",
                url: "https://raw.githubusercontent.com/theBowja/genshin-db/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/src/data/version/weapons.json"
            },
            bytes: 6374,
            metadataSnapshot: {
                canonicalization: "raw UTF-8 bytes at the pinned revision",
                bytes: 6374,
                sha256: "0fd5e817804d59265a4a6c6553fc0bbebf0fb3236ebabf12624b3c45e493f347",
                materialized: false,
                observedExternally: true,
                gitBlobSha1: "fa01b98db5dde03348fc3f4907d74a0251eed6fb"
            },
            semantics: "introducedGameVersionByWeaponSlug",
            globalGameVersion: null,
            explicitGameVersion: false,
            binding: {
                revision: "1bab2cdba4d218fd5caa46b5f54e7884ee8359a2",
                sourceRecordDigest: null,
                metadataDigest: "0fd5e817804d59265a4a6c6553fc0bbebf0fb3236ebabf12624b3c45e493f347"
            },
            exactRevisionBinding: true,
            strictlyBound: false,
            status: "candidate",
            blockedReasons: [
                "manifestSemanticsIntroducedVersionNotSnapshotVersion",
                "globalDatasetGameVersionMissing",
                "metadataSnapshotNotMaterializedForOfflineReplay"
            ]
        },
        compare: {
            baseReleaseRevision: "67f563f693343ea2ec8e8121f1245dcb010a8809",
            pinnedRevision: "1bab2cdba4d218fd5caa46b5f54e7884ee8359a2",
            status: "ahead",
            aheadBy: 2,
            totalCommits: 2,
            changedRelevantWeaponFiles: 0,
            changedRelevantGameDataFiles: 0,
            blockedReasons: [
                "releaseRevisionIsAncestorOfPinnedRevision",
                "bindingIsDerivedFromAncestorAndZeroRelevantDiffNotDirect"
            ]
        },
        fieldCandidates: [
            { slug: "freedomsworn", gameVersion: "1.6", name: "Freedom-Sworn", bytes: 9768, sourceRecordDigest: "d9b3304144ff23cfcbcc1d9635acf91459e719ba267fc11aca4bcacd80b6617b" },
            { slug: "amosbow", gameVersion: "1.0", name: "Amos' Bow", bytes: 5691, sourceRecordDigest: "5316537e61a4bd60b506aa5e449138e2a640245523b5da5c1d35529a9ab6191c" },
            { slug: "thebell", gameVersion: "1.0", name: "The Bell", bytes: 5839, sourceRecordDigest: "d65988672b3b29682c8e115fdc3495165d8d5ec4b49a4bdaa6eac49eab169c55" },
            { slug: "mistsplitterreforged", gameVersion: "2.0", name: "Mistsplitter Reforged", bytes: 8491, sourceRecordDigest: "c9910ceaeb7220e29f3cd77f5793f7114f41a4572a89386f84b83f8844cf2d6b" },
            { slug: "thewidsith", gameVersion: "1.0", name: "The Widsith", bytes: 5632, sourceRecordDigest: "d08ee31fca313a31430546f89bbaa106aae34fbb212a6824a30ea4edc86c4dba" },
            { slug: "thestringless", gameVersion: "1.0", name: "The Stringless", bytes: 4945, sourceRecordDigest: "2f3ce5951a09b5d508dc03924cce7369982a5b3ef488f435878d3ecc7986b89c" },
            { slug: "athameartis", gameVersion: "6.2", name: "Athame Artis", bytes: 10825, sourceRecordDigest: "35d3563e35037a65f133f7576819750d203f2e6101ea5fa26ac2a1aaf2321d31" },
            { slug: "fruitfulhook", gameVersion: "5.1", name: "Fruitful Hook", bytes: 8190, sourceRecordDigest: "24b5080705f86d9fa3c169a074040637dc1d582564e5d406bd77d52f615691e7" },
            { slug: "goldenfrostboundoath", gameVersion: "6.5", name: "Golden Frostbound Oath", bytes: 10893, sourceRecordDigest: "dd98a587359886a81b17238f1d5fd403882b7aea6c2d722f3a49294816fa5358" }
        ],
        strictBinding: true,
        nextCandidates: [
            "propagate the strictly bound 6.7 source-level manifest through provenance without treating per-weapon introduced versions as snapshot versions",
            "retain the exact record digests only as field candidates until introduced-version semantics are independently resolved"
        ]
    }
};

const ACCEPTED_EVIDENCE_KINDS = [
    "gameClientManifest",
    "providerDatasetManifest",
    "providerReleaseArtifact",
    "releaseNotesWithExplicitGameVersion"
];

const REJECTED_VERSION_PROOFS = [
    "repository commit or file SHA-256 alone",
    "Git tag, branch, or commit date",
    "provider package semver alone",
    "capturedAt timestamp",
    "entity path or entity file digest without version metadata",
    "a nearby release or patch note not bound to the pinned revision"
];

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readJsonIfExists(file) {
    return fs.existsSync(file) ? readJson(file) : null;
}

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function fileDigest(file) {
    return sha256(fs.readFileSync(file));
}

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
    const result = {};
    (values || []).forEach((value) => {
        const key = String(value);
        result[key] = (result[key] || 0) + 1;
    });
    return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function relativePath(file) {
    return path.relative(repositoryRoot, file).replaceAll(path.sep, "/");
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

function isGameVersionToken(value) {
    // Keep prose policy notes such as "nullWhenNotExplicit" out of the
    // count.  A provider may use 6.7 or 6.7.0; labels/semver with a leading
    // non-numeric name are not accepted as a game patch here.
    return typeof value === "string" && /^\d+\.\d+(?:\.\d+)?$/.test(value.trim());
}

function inputManifest(paths) {
    return Object.entries(paths).map(([role, file]) => {
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

function sourceRecords(dataRoot) {
    const paths = {
        weapons: path.join(dataRoot, "v2", "weapons", "source-records.json"),
        artifacts: path.join(dataRoot, "v2", "artifacts", "source-records.json"),
        behaviorReviewed: path.join(dataRoot, "v2", "characters", "behavior-reviewed.json")
    };
    const datasets = {};
    const all = [];
    Object.entries(paths).forEach(([dataset, file]) => {
        if (!fs.existsSync(file)) {
            datasets[dataset] = { path: relativePath(file), exists: false, total: 0, gameVersionPresent: 0, evidencePresent: 0 };
            return;
        }
        const document = readJson(file);
        const records = dataset === "behaviorReviewed" ? document.sourceRecords : document;
        const values = Object.values(records || {});
        datasets[dataset] = {
            path: relativePath(file),
            exists: true,
            total: values.length,
            gameVersionPresent: values.filter((record) => nonEmptyString(record?.gameVersion)).length,
            evidencePresent: values.filter((record) => Boolean(record?.gameVersionEvidence)).length,
            strictlyBound: values.filter((record) => strictEvidence({
                source: { revision: record?.revision },
                evidence: record?.gameVersionEvidence,
                record
            }).verified).length
        };
        values.forEach((record) => all.push({ dataset, id: record?.id || null, record }));
    });
    return {
        datasets,
        total: all.length,
        gameVersionPresent: all.filter(({ record }) => nonEmptyString(record?.gameVersion)).length,
        evidencePresent: all.filter(({ record }) => Boolean(record?.gameVersionEvidence)).length,
        strictlyBound: all.filter(({ record }) => strictEvidence({
            source: { revision: record?.revision },
            evidence: record?.gameVersionEvidence,
            record
        }).verified).length
    };
}

function completeEvidence(evidence, expectedGameVersion = null) {
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return false;
    if (!ACCEPTED_EVIDENCE_KINDS.includes(evidence.kind)) return false;
    if (!nonEmptyString(evidence.gameVersion)) return false;
    if (expectedGameVersion && evidence.gameVersion !== expectedGameVersion) return false;
    if (!nonEmptyString(evidence.locator?.dataset) || !nonEmptyString(evidence.locator?.record)) return false;
    return evidence.integrity?.algorithm === "sha256" && validSha256(evidence.integrity?.digest);
}

function evidenceBinding(evidence) {
    const binding = evidence?.binding || evidence?.revisionBinding || null;
    return {
        revision: binding?.revision || evidence?.revision || evidence?.locator?.revision || null,
        sourceRecordDigest: binding?.sourceRecordDigest || binding?.fileDigest || evidence?.sourceRecordDigest || null,
        metadataDigest: binding?.metadataDigest || evidence?.integrity?.digest || null,
        bindingPresent: Boolean(binding)
    };
}

/**
 * Strictly verify a primary version claim.  The current catalog intentionally
 * has no binding objects, so all current sources/records remain blocked.
 */
function strictEvidence({ source, evidence, record = null } = {}) {
    const reasons = [];
    const expectedGameVersion = source?.gameVersion || record?.gameVersion || null;
    if (!nonEmptyString(expectedGameVersion)) reasons.push("gameVersionMissing");
    if (!completeEvidence(evidence, expectedGameVersion)) reasons.push("primaryMetadataIncomplete");
    const binding = evidenceBinding(evidence);
    if (!binding.bindingPresent) reasons.push("sameRevisionBindingMissing");
    if (!validRevision(binding.revision) || binding.revision !== source?.revision) {
        reasons.push("sameRevisionBindingMismatch");
    }
    if (record && binding.sourceRecordDigest !== record.sha256) reasons.push("sourceRecordDigestBindingMissingOrMismatch");
    if (!validSha256(binding.metadataDigest)) reasons.push("metadataDigestMissing");
    return {
        verified: reasons.length === 0,
        gameVersion: nonEmptyString(expectedGameVersion) ? expectedGameVersion : null,
        binding: {
            revision: binding.revision,
            sourceRecordDigest: binding.sourceRecordDigest,
            metadataDigest: binding.metadataDigest,
            bindingPresent: binding.bindingPresent
        },
        blockedReasons: [...new Set(reasons)].sort()
    };
}

function officialLocators(sourceId, source) {
    const repository = source?.repository || null;
    const revision = source?.revision || null;
    const commitUrl = repository && revision ? `${repository}/commit/${revision}` : null;
    const releasesUrl = repository ? `${repository}/releases` : null;
    return {
        sourceId,
        provider: source?.provider || null,
        revision,
        locators: [
            {
                kind: "releaseNotesWithExplicitGameVersion",
                url: commitUrl,
                immutable: Boolean(commitUrl),
                status: "unacceptedWithoutVersionFieldAndBinding",
                required: "commit page or release note must explicitly name gameVersion and bind it to this revision/digest"
            },
            {
                kind: "providerReleaseArtifact",
                url: releasesUrl,
                immutable: false,
                status: "unacceptedWithoutImmutableArtifactAndRevisionBinding",
                required: "release artifact/manifest digest plus explicit gameVersion and exact revision binding"
            }
        ],
        assessment: "No accepted primary metadata is materialized in source-catalog.json; these official provider locators remain review targets only."
    };
}

function probeManifest({ file, sourceId, source, record = null } = {}) {
    const result = {
        sourceId,
        configured: Boolean(file),
        path: file ? relativePath(path.resolve(file)) : null,
        materialized: false,
        digest: null,
        kind: null,
        gameVersion: null,
        strict: null,
        blockedReasons: []
    };
    if (!file) {
        result.blockedReasons.push("metadataManifestNotConfigured");
        return result;
    }
    const absolute = path.resolve(file);
    result.path = relativePath(absolute);
    if (!fs.existsSync(absolute)) {
        result.blockedReasons.push("metadataManifestNotMaterialized");
        return result;
    }
    result.materialized = true;
    result.digest = fileDigest(absolute);
    let metadata;
    try {
        metadata = readJson(absolute);
    } catch (error) {
        result.blockedReasons.push("metadataManifestInvalidJson");
        result.parseError = error.message;
        return result;
    }
    result.kind = metadata?.kind || null;
    result.gameVersion = metadata?.gameVersion || null;
    const strict = strictEvidence({ source, evidence: {
        ...metadata,
        integrity: metadata?.integrity || { algorithm: "sha256", digest: result.digest }
    }, record });
    result.strict = strict;
    result.blockedReasons.push(...strict.blockedReasons);
    return result;
}

function collectGameVersionStats(value, state = { objects: 0, explicit: 0, verified: 0 }) {
    if (Array.isArray(value)) {
        value.forEach((entry) => collectGameVersionStats(entry, state));
        return state;
    }
    if (!value || typeof value !== "object") return state;
    state.objects += 1;
    if (Object.prototype.hasOwnProperty.call(value, "gameVersion")) {
        if (isGameVersionToken(value.gameVersion)) state.explicit += 1;
        if (value.gameVersionVerified === true) state.verified += 1;
    }
    Object.values(value).forEach((entry) => collectGameVersionStats(entry, state));
    return state;
}

function externalEvidenceStats(dataRoot) {
    const paths = {
        weaponExternalFieldEvidence: path.join(dataRoot, "v2", "weapons", "external-evidence.json"),
        characterExternalFieldEvidence: path.join(dataRoot, "v2", "characters", "external-field-evidence.json")
    };
    const artifacts = {};
    Object.entries(paths).forEach(([role, file]) => {
        if (!fs.existsSync(file)) {
            artifacts[role] = { path: relativePath(file), exists: false, bytes: 0, sha256: null, gameVersion: { objects: 0, explicit: 0, verified: 0 } };
            return;
        }
        const value = readJson(file);
        artifacts[role] = {
            path: relativePath(file),
            exists: true,
            bytes: fs.statSync(file).size,
            sha256: fileDigest(file),
            gameVersion: collectGameVersionStats(value),
            summary: clone(value.summary || null)
        };
    });
    const all = Object.values(artifacts);
    return {
        artifacts,
        explicit: all.reduce((sum, artifact) => sum + (artifact.gameVersion?.explicit || 0), 0),
        verified: all.reduce((sum, artifact) => sum + (artifact.gameVersion?.verified || 0), 0)
    };
}

function buildPrimaryResearch(sourceEntries, catalogRecordEntries = []) {
    const catalogSources = Object.fromEntries(sourceEntries || []);
    const catalogRecords = Object.fromEntries(catalogRecordEntries || []);
    const sources = {};
    Object.entries(PRIMARY_SOURCE_RESEARCH).sort(([a], [b]) => sortNatural(a, b)).forEach(([id, template]) => {
        const source = clone(template);
        const catalogSource = catalogSources[id] || null;
        source.catalogRevision = catalogSource?.revision || null;
        source.pinnedRevisionMatchesCatalog = source.pinnedRevision === catalogSource?.revision;
        if (!source.pinnedRevisionMatchesCatalog) {
            source.strictBinding = false;
            source.status = "blocked";
            source.blockedReasons = [...new Set([
                ...(source.blockedReasons || []),
                "catalogPinnedRevisionMismatch"
            ])].sort();
        }
        if (source.fieldCandidates) {
            source.fieldCandidates = source.fieldCandidates
                .slice()
                .sort((left, right) => sortNatural(left.slug, right.slug))
                .map((candidate) => {
                    const recordPath = `src/data/English/weapons/${candidate.slug}.json`;
                    const exactRevisionBinding = source.pinnedRevisionMatchesCatalog;
                    const catalogRecordEntry = Object.entries(catalogRecords).find(([, record]) => (
                        record?.source === id && record?.path === recordPath && record?.sha256 === candidate.sourceRecordDigest
                    ));
                    const catalogRecordId = catalogRecordEntry?.[0] || null;
                    const catalogRecord = catalogRecordEntry?.[1] || null;
                    const strict = strictEvidence({
                        source: catalogSource,
                        evidence: catalogRecord?.gameVersionEvidence,
                        record: catalogRecord
                    });
                    return {
                        sourceId: id,
                        sourceRecordId: catalogRecordId,
                        slug: candidate.slug,
                        name: candidate.name,
                        field: catalogRecord?.field || "recordSnapshot",
                        introducedGameVersion: candidate.gameVersion,
                        gameVersion: strict.gameVersion,
                        path: recordPath,
                        locator: {
                            dataset: "genshin-db source record",
                            record: recordPath,
                            url: `https://raw.githubusercontent.com/theBowja/genshin-db/${source.pinnedRevision}/${recordPath}`
                        },
                        bytes: candidate.bytes,
                        sourceRecordDigest: candidate.sourceRecordDigest,
                        metadataSnapshot: {
                            canonicalization: "raw UTF-8 bytes at the pinned revision",
                            bytes: candidate.bytes,
                            sha256: candidate.sourceRecordDigest,
                            materialized: false,
                            observedExternally: true
                        },
                        binding: {
                            revision: strict.binding.revision,
                            sourceRecordDigest: strict.binding.sourceRecordDigest,
                            metadataDigest: strict.binding.metadataDigest
                        },
                        exactRevisionBinding,
                        recordDigestBinding: strict.binding.sourceRecordDigest === candidate.sourceRecordDigest,
                        snapshotVersionProvenance: {
                            providerSnapshot: `${id}@${source.pinnedRevision}`,
                            sourceRecordId: catalogRecordId,
                            sourceRecordDigest: candidate.sourceRecordDigest,
                            gameVersion: strict.gameVersion,
                            gameVersionEvidence: clone(catalogRecord?.gameVersionEvidence || null),
                            semantics: "providerSnapshotVersion; introducedGameVersion is retained separately and is never used as the snapshot version"
                        },
                        strictlyBound: exactRevisionBinding && strict.verified,
                        status: exactRevisionBinding && strict.verified ? "ready" : "blocked",
                        blockedReasons: [...new Set([
                            ...(catalogRecord ? [] : ["fieldProvenanceCatalogRecordMissing"]),
                            ...(exactRevisionBinding ? [] : ["catalogPinnedRevisionMismatch"]),
                            ...strict.blockedReasons
                        ])].sort()
                    };
                });
        }
        sources[id] = source;
    });
    const sourceValues = Object.values(sources);
    const fields = sourceValues.flatMap((source) => source.fieldCandidates || []);
    const releaseCandidates = sourceValues.map((source) => source.release).filter(Boolean);
    const nextCandidates = sourceValues.flatMap((source) => source.nextCandidates || []);
    return {
        schemaVersion: 1,
        kind: "genshinGameVersionPrimaryResearch",
        version: PRIMARY_RESEARCH_VERSION,
        researchedAt: PRIMARY_RESEARCH_CAPTURED_AT,
        policy: {
            canonicalPromotion: "forbidden",
            selfApproval: "forbidden",
            revisionOnlyProof: "forbidden",
            sourceSnapshotMaterialization: "required-for-acceptance",
            strictBinding: "explicit gameVersion plus metadata digest plus exact pinned revision binding; field candidates additionally require exact sourceRecordDigest binding",
            candidateSemantics: "observations remain non-promoting until snapshot-version semantics are proven"
        },
        sources,
        summary: {
            sources: sourceValues.length,
            releaseCandidates: releaseCandidates.length,
            explicitGameVersionReleaseCandidates: releaseCandidates.filter((release) => isGameVersionToken(release.gameVersion)).length,
            exactReleaseRevisionBindings: releaseCandidates.filter((release) => release.exactRevisionBinding === true).length,
            fieldCandidates: fields.length,
            exactRevisionFieldCandidates: fields.filter((field) => field.exactRevisionBinding === true).length,
            recordDigestBoundFieldCandidates: fields.filter((field) => field.recordDigestBinding === true).length,
            strictlyBoundSources: sourceValues.filter((source) => source.strictBinding === true).length,
            strictlyBoundFields: fields.filter((field) => field.strictlyBound === true).length,
            nextCandidates
        },
        nextCandidates
    };
}

function buildFeasibilityAudit(dataRoot) {
    const canonical = readJsonIfExists(path.join(repositoryRoot, "reports", "genshin-canonical-runtime-audit.json"));
    const dual = readJsonIfExists(path.join(repositoryRoot, "reports", "genshin-v2-dual-source-audit.json"));
    const independent = readJsonIfExists(path.join(dataRoot, "v2", "weapons", "independent-field-evidence.json"));
    const external = readJsonIfExists(path.join(dataRoot, "v2", "weapons", "external-evidence.json"));
    const optimizer = readJsonIfExists(path.join(dataRoot, "v2", "external", "optimizer-field-evidence.json"));
    const characterFields = readJsonIfExists(path.join(dataRoot, "v2", "characters", "field-materialization.json"));
    const reviewReadiness = readJsonIfExists(path.join(dataRoot, "v2", "review-readiness.json"));
    const weaponSpecs = readJsonIfExists(path.join(dataRoot, "v2", "weapons", "spec-candidates.json")) || {};
    const categories = canonical?.repository?.categories || {};
    const totalFor = (names) => names.reduce((sum, name) => sum + (categories[name]?.excluded || 0), 0);
    const characterCategoryNames = Object.keys(categories).filter((name) => name === "talentGap" || name === "behavior" || name.startsWith("behaviorBatch"));
    const pilotClaims = (dual?.claims || []).filter((claim) => claim.entityType === "weapon"
        && claim.classificationFlags?.includes("independent-provider-pinned-reference"));
    const runtimeContractFields = new Set([
        "destination",
        "effect.activation.uidHandling",
        "registryStructure",
        "runtime.modifierIds",
        "supersedesLegacyModifierIds"
    ]);
    const claimCategory = (claim) => {
        if (claim.claimStatus === "notApplicable") return "notApplicable";
        if (runtimeContractFields.has(claim.field)) return "damageToolRuntimeContract";
        if (claim.field === "activation") return "triggerCondition";
        if (claim.field === "targets") return "targetScope";
        if (["duration", "cooldown", "interval"].includes(claim.field)) return `timing.${claim.field}`;
        if (["stack", "charges", "hitCount", "maxInstances"].includes(claim.field)) return "stackOrCount";
        const effect = weaponSpecs[claim.candidateId]?.effect || {};
        const targets = Array.isArray(effect.targets) ? effect.targets : [];
        if (effect.kind === "shieldGeneration" || targets.includes("shieldCapacity")) return "shieldParameter";
        if (claim.candidateId.includes("crit") || targets.some((target) => /Crit/.test(target))) return "critBonus";
        if (targets.some((target) => ["atkPercent", "defPercent", "elementalMastery"].includes(target))) return "statBonus";
        if (targets.some((target) => /reaction|Crystallize/i.test(target))) return "reactionBonus";
        if (["value", "refinement"].includes(claim.field)) return "damageBonusScalar";
        return "otherGameSemantic";
    };
    const genshinDbEvidenceFor = (claim) => claim.evidence?.find((item) => item.provider === "theBowja/genshin-db") || null;
    const coverageRows = pilotClaims.map((claim) => {
        const category = claimCategory(claim);
        const notApplicable = claim.claimStatus === "notApplicable";
        const runtimeOnly = runtimeContractFields.has(claim.field);
        return {
            weaponId: claim.entityId,
            candidateId: claim.candidateId,
            fieldPath: claim.field,
            fieldCategory: category,
            claimStatus: claim.claimStatus,
            genshinDb: (() => {
                const evidence = genshinDbEvidenceFor(claim);
                return evidence ? {
                    provider: evidence.provider,
                    revision: evidence.revision,
                    gameVersion: evidence.gameVersion,
                    strictBinding: evidence.gameVersionVerified === true,
                    locator: clone(evidence.locator),
                    supportsClaimValue: evidence.supportsClaimValue === true
                } : null;
            })(),
            secondProvider: null,
            providerIndependence: null,
            secondProviderGameVersion: null,
            valueAgreement: "notEvaluated",
            dualSourceEligible: false,
            canonicalSecondProviderRequirement: notApplicable ? "notRequiredForNotApplicableClaim" : "requiredForVerifiedClaim",
            failureReason: notApplicable
                ? "notApplicableClaimDoesNotRequireIndependentSecondProvider"
                : runtimeOnly
                    ? "externalGameDataProviderCannotAttestDamageToolRuntimeContract"
                    : "noStrict67IndependentFieldValueProvider"
        };
    });
    const countsForRows = (rows) => ({
        totalClaims: rows.length,
        assertedClaims: rows.filter((row) => row.claimStatus !== "notApplicable").length,
        notApplicableClaims: rows.filter((row) => row.claimStatus === "notApplicable").length,
        gameSemanticClaims: rows.filter((row) => row.claimStatus !== "notApplicable" && row.fieldCategory !== "damageToolRuntimeContract").length,
        runtimeContractClaims: rows.filter((row) => row.fieldCategory === "damageToolRuntimeContract").length,
        secondProviderEvidenceMaterialized: rows.filter((row) => row.secondProvider).length,
        dualSourceEligible: rows.filter((row) => row.dualSourceEligible).length
    });
    const byWeapon = [...new Set(coverageRows.map((row) => row.weaponId))].sort(sortNatural).map((weaponId) => {
        const rows = coverageRows.filter((row) => row.weaponId === weaponId);
        return { weaponId, ...countsForRows(rows) };
    });
    const byFieldCategory = [...new Set(coverageRows.map((row) => row.fieldCategory))].sort(sortNatural).map((fieldCategory) => {
        const rows = coverageRows.filter((row) => row.fieldCategory === fieldCategory);
        return { fieldCategory, ...countsForRows(rows) };
    });
    return {
        schemaVersion: 1,
        status: "currentContractPartiallyFeasible",
        contractUnchanged: true,
        canonicalPromotion: "forbidden",
        providerAssessment: {
            gcsim: {
                revision: "3647a07a7cc3004bc1e79d9bb5f7444de20dceaa",
                classification: "revisionLevelGameVersionNotManagedInInspectedArtifacts",
                availability: "structurallyUnavailableInProviderRepository",
                strictBinding: false,
                observations: [
                    "The exact release v2.44.2 identifies the gcsim revision but does not name a Genshin gameVersion.",
                    "The release workflow input named version is a gcsim/container release label, not a Genshin gameVersion.",
                    "The pipeline accepts an arbitrary DM_REPO workflow input and commits generated files without persisting a Genshin gameVersion manifest in the revision.",
                    "The nine audited weapon implementations are hand-maintained source files and are not bound to a pipeline input manifest."
                ],
                externalAttestationSearch: {
                    capturedAt: "2026-08-23T00:00:00.000Z",
                    result: "noQualifyingRevisionSpecificAttestationFound",
                    inspected: [
                        {
                            kind: "providerRelease",
                            locator: "https://github.com/genshinsim/gcsim/releases/tag/v2.44.2",
                            observation: "The signed v2.44.2 release identifies commit 3647a07 but its release body does not state a Genshin gameVersion.",
                            qualification: "insufficient"
                        },
                        {
                            kind: "providerReleasePredecessor",
                            locator: "https://github.com/genshinsim/gcsim/releases/tag/v2.44.0",
                            observation: "The provider-authored release notes include Add 6.7 Pipeline (#2685), but identify the earlier 5d1ec8c release rather than the target revision.",
                            qualification: "relatedButNotRevisionSpecific"
                        },
                        {
                            kind: "providerPullRequest",
                            locator: "https://github.com/genshinsim/gcsim/pull/2711",
                            observation: "The pull request is immutably linked to merge commit 3647a07 and says the Stellar-Conduct work prepares for Sandrone, but does not name Genshin 6.7.",
                            qualification: "revisionSpecificButVersionMissing"
                        },
                        {
                            kind: "providerChecksAndPublicSearch",
                            locator: "https://github.com/genshinsim/gcsim/commit/3647a07a7cc3004bc1e79d9bb5f7444de20dceaa",
                            observation: "The merge records three passing checks; public issue, discussion, release, deployment, and indexed workflow searches exposed no immutable output that states both the target revision and Genshin gameVersion.",
                            qualification: "insufficient"
                        }
                    ],
                    excluded: [
                        "release-series ancestry or date proximity",
                        "feature-name inference from 6.7 content",
                        "non-exported Discord conversation without an immutable public locator"
                    ]
                },
                remainingExternalPossibility: "A new provider-authored immutable statement or workflow attestation naming both revision 3647a07 and Genshin 6.7 could supply the binding later; none was found in the searched external surfaces."
            },
            genshinDb: {
                revision: "1bab2cdba4d218fd5caa46b5f54e7884ee8359a2",
                classification: "evidenceFoundAndStrictlyBound",
                availability: "availableInExactRevisionPackageMetadata",
                strictBinding: true,
                gameVersion: "6.7",
                evidencePath: "package.json#description",
                evidenceDigest: "5ded2b3bab58218da17f6a1282209e653c1ec7ecd9297b95569558a737c2e8f6",
                observations: [
                    "The exact revision package.json description explicitly says Genshin Impact v6.7 JSON data.",
                    "The provider checklist instructs maintainers to update the game version in the package description during a Genshin version update.",
                    "The manual publish workflow checks out the selected revision, assembles the dataset, and publishes it with npm provenance."
                ]
            }
        },
        providerSubstitutionAssessment: {
            contractRequiresSpecificGcsimProvider: false,
            contractRequirement: "At least two provider names in at least two independent evidence groups, with consistent gameVersion and field-level claim evidence.",
            substitutionWithoutContractChange: true,
            contractGranularity: {
                unit: "fieldClaim",
                sameSecondProviderRequiredAcrossCandidate: false,
                evidence: [
                    "genshinCanonicalRuntimeGenerate.cjs: assessVerifiedSpec evaluates evidenceForRefs for every verified claim independently",
                    "genshinV2DualSourceAudit.cjs: claimSourceRefs and sourceEvidence join evidence at field-claim granularity"
                ],
                caveat: "Every required Runtime field must still have its own qualifying two-provider evidence; candidate-level eligibility summaries do not waive that per-field gate."
            },
            scoringCapturedAt: "2026-08-23T00:00:00.000Z",
            candidates: [
                {
                    provider: "HoYoverse official HoYoLAB/release notices",
                    classification: "partiallyUsable",
                    independence: "independentFirstParty",
                    strictGenshin67Binding: "availableForNamedOfficialNoticesOnly",
                    nineWeaponCoverage: "partial",
                    requiredFieldCoverage: "partial",
                    refinementCoverage: "incomplete",
                    machineReadable: "limited",
                    immutableLocator: "article locator is stable but no complete revisioned weapon dataset was found",
                    provenanceTraceability: "firstParty",
                    upstreamDependency: "none",
                    longTermMaintainability: "medium",
                    currentResult: "usableForVersionScopedPartialClaimsOnly",
                    limitation: "The current nine-record weapon comparison has explicit version linkage but does not publish complete comparable refinement and semantic fields."
                },
                {
                    provider: "KQM Theorycrafting Library",
                    classification: "partiallyUsable",
                    independence: "independentHumanResearch",
                    strictGenshin67Binding: false,
                    nineWeaponCoverage: "partial",
                    requiredFieldCoverage: "partial mechanics prose",
                    refinementCoverage: "incomplete",
                    machineReadable: false,
                    immutableLocator: "repository revisions are immutable",
                    provenanceTraceability: "human-authored pages, per-page source depth varies",
                    upstreamDependency: "independent research with cited game observations",
                    longTermMaintainability: "medium",
                    currentResult: "researchCandidateNotYetEligible",
                    limitation: "Immutable pages exist for weapon mechanics, but the inspected index does not bind every required field to Genshin 6.7 or provide complete value tables."
                },
                {
                    provider: "Genshin Optimizer",
                    classification: "sameLineage",
                    independence: "correlatedGenshinDataDerived",
                    strictGenshin67Binding: true,
                    nineWeaponCoverage: "complete",
                    requiredFieldCoverage: "broad",
                    refinementCoverage: "broad",
                    machineReadable: true,
                    immutableLocator: "git revision",
                    provenanceTraceability: "auditable build, correlated upstream",
                    upstreamDependency: "GenshinData-derived",
                    longTermMaintainability: "high",
                    currentResult: "notIndependentFromGenshinDb",
                    limitation: "Its 6.7 release workflow is revision-pinnable, but the existing source-lineage audit groups its data with GenshinData-derived sources."
                },
                {
                    provider: "DimbreathBot/AnimeGameData or Enka projections",
                    classification: "sameLineage",
                    independence: "correlatedDatamineLineage",
                    strictGenshin67Binding: "snapshotDependent",
                    nineWeaponCoverage: "completeWhenCurrent",
                    requiredFieldCoverage: "broad raw tables",
                    refinementCoverage: "broad",
                    machineReadable: true,
                    immutableLocator: "git revision",
                    provenanceTraceability: "auditable revision, shared datamine lineage",
                    upstreamDependency: "datamined client tables",
                    longTermMaintainability: "medium",
                    currentResult: "notIndependentFromGenshinDb",
                    limitation: "Exact release-data snapshots may be reproducible, but they are upstream or downstream projections of the same datamine lineage and do not form a second independent source."
                },
                {
                    provider: "genshin.dev API",
                    inspectedRevision: "f0014c3389bcf7969bde19a9d7c53837a2b3ce18",
                    locator: "https://github.com/genshindev/api/commit/f0014c3389bcf7969bde19a9d7c53837a2b3ce18",
                    classification: "structurallyInsufficient",
                    independence: "communityMaintainedButUpstreamUndisclosed",
                    strictGenshin67Binding: false,
                    nineWeaponCoverage: "6/9",
                    requiredFieldCoverage: "partial passive descriptions",
                    refinementCoverage: "inconsistent; some records provide only one refinement description",
                    machineReadable: true,
                    immutableLocator: "git revision",
                    provenanceTraceability: "repository history is visible; value acquisition and upstream lineage are not documented sufficiently",
                    upstreamDependency: "undisclosed",
                    longTermMaintainability: "lowForCanonicalEvidence",
                    currentResult: "notEligible",
                    limitation: "The fixed snapshot omits three pilot weapons, has no provider-authored 6.7 manifest, and does not consistently expose all refinement values."
                },
                {
                    provider: "Honey Hunter World",
                    locator: "https://gensh.honeyhunterworld.com/i_n11503/?lang=EN",
                    classification: "versionUnbound",
                    independence: "independentCommunityDatabase",
                    strictGenshin67Binding: false,
                    nineWeaponCoverage: "current site appears broad",
                    requiredFieldCoverage: "broad passive prose and refinement tables",
                    refinementCoverage: "broad",
                    machineReadable: "HTML tables",
                    immutableLocator: false,
                    provenanceTraceability: "current rendered values are visible; snapshot generation and immutable history are not exposed",
                    upstreamDependency: "undisclosed",
                    longTermMaintainability: "lowForReproducibleEvidence",
                    currentResult: "notEligible",
                    limitation: "The live page identifies newer live data rather than an immutable 6.7 snapshot, so otherwise useful field tables cannot be strictly version-bound."
                },
                {
                    provider: "Snap Hutao Remastered",
                    inspectedRevision: "86cbb29fac16ae51c02f7e3b68fa8adfce92c8b0",
                    locator: "https://github.com/SnapHutaoRemasteringProject/Snap.Hutao.Remastered/releases/tag/1.19.6",
                    classification: "structurallyInsufficient",
                    independence: "providerApplicationWithRemoteMetadata",
                    strictGenshin67Binding: "releaseOnly",
                    nineWeaponCoverage: "not fixed in the application revision",
                    requiredFieldCoverage: "remote metadata, not release-embedded field evidence",
                    refinementCoverage: "not established",
                    machineReadable: true,
                    immutableLocator: "application release is immutable; fetched metadata endpoint is mutable",
                    provenanceTraceability: "download and hash validation are auditable, but the release does not bind hashes/bytes and generation lineage to 6.7",
                    upstreamDependency: "provider-operated remote metadata with generation source not fixed in this revision",
                    longTermMaintainability: "highAsApplicationLowAsCanonicalEvidence",
                    currentResult: "notEligible",
                    limitation: "The 1.19.6 release attests application adaptation to 6.7, but weapon values are obtained from a remote metadata service rather than fixed by that release."
                },
                {
                    provider: "Irminsul",
                    inspectedRevision: "6580147cd0229ab9b3dfcd033a17c666db1af3b2",
                    locator: "https://github.com/konkers/irminsul/releases/tag/v0.1.18",
                    classification: "sameLineage",
                    independence: "applicationAuthorIndependentButDatasetDependencyCorrelated",
                    strictGenshin67Binding: true,
                    nineWeaponCoverage: "application inventory export only; passive field evidence is not its purpose",
                    requiredFieldCoverage: "insufficient",
                    refinementCoverage: "owned-item refinement only",
                    machineReadable: true,
                    immutableLocator: "release revision and dependency revision",
                    provenanceTraceability: "strong; Cargo manifest pins anime-game-data",
                    upstreamDependency: "konkers/anime-game-data",
                    longTermMaintainability: "highAsApplicationNotSuitableAsIndependentProvider",
                    currentResult: "notEligible",
                    limitation: "The provider-authored commit says 6.7 support, but bundled game data is built from a pinned anime-game-data dependency and does not independently publish the required passive fields."
                },
                {
                    provider: "Genshin Impact Wiki / MediaWiki revisions",
                    classification: "versionUnbound",
                    independence: "independentCommunityEditing",
                    strictGenshin67Binding: false,
                    nineWeaponCoverage: "broad",
                    requiredFieldCoverage: "broad prose/tables",
                    refinementCoverage: "broad",
                    machineReadable: "MediaWiki API and wikitext",
                    immutableLocator: "page oldid",
                    provenanceTraceability: "revision history is auditable; a revision-to-gameVersion manifest is absent",
                    upstreamDependency: "human-edited with mixed citations",
                    longTermMaintainability: "medium",
                    currentResult: "notEligible",
                    limitation: "Individual oldids are immutable, but the provider does not strictly attest that one coherent nine-weapon snapshot represents Genshin 6.7."
                },
                {
                    provider: "gridhead/gi-loadouts",
                    inspectedRevision: "7f0a5ddb4558785025794e828a5ad9028ec0ec9c",
                    locator: "https://github.com/gridhead/gi-loadouts/releases/tag/0.1.18",
                    classification: "sameLineage",
                    independence: "providerMaintainedSnapshotButFandomWikiDerived",
                    strictGenshin67Binding: true,
                    nineWeaponCoverage: "9/9",
                    requiredFieldCoverage: "all 134 asserted game-semantic pilot claims are represented in R1-R5 passive prose; damageTool runtime-contract fields are outside its scope",
                    refinementCoverage: "R1-R5 for all nine weapons",
                    machineReadable: "Python class records with refi_list arrays",
                    immutableLocator: "annotated tag 0.1.18 and exact commit 7f0a5ddb4558785025794e828a5ad9028ec0ec9c",
                    provenanceTraceability: "strong snapshot/release traceability; CONTRIBUTING.md explicitly directs weapon statistics to be fetched from Genshin Impact Wiki",
                    upstreamDependency: "Genshin Impact Fandom Wiki",
                    longTermMaintainability: "highAsVersionedSnapshotLowAsIndependentEvidence",
                    currentResult: "notEligible",
                    limitation: "genshin-db documents Fandom Wiki/GenshinData as its sources, so the passive prose shares the Fandom Wiki upstream and cannot constitute an independent second provider even though the snapshot is strictly bound to 6.7."
                },
                {
                    provider: "hazarsozer/genshin-calculator",
                    inspectedRevision: "0e190fd1624cea6f58533fd790a1c14fe6491a67",
                    locator: "https://github.com/hazarsozer/genshin-calculator/commit/0e190fd1624cea6f58533fd790a1c14fe6491a67",
                    classification: "versionUnbound",
                    independence: "mixedPortedImplementationsAndProjectAmberFixtures",
                    strictGenshin67Binding: false,
                    nineWeaponCoverage: "at least 8/9 named weapon implementation modules were found; full pilot coverage was not pursued after the version gate failed",
                    requiredFieldCoverage: "broad implementation fields",
                    refinementCoverage: "broad",
                    machineReadable: true,
                    immutableLocator: "git revision",
                    provenanceTraceability: "implementation comments and fixtures are traceable, but no repository-wide 6.7 manifest was found",
                    upstreamDependency: "ported calculator code plus Project Amber fixtures",
                    longTermMaintainability: "medium",
                    currentResult: "notEligible",
                    limitation: "The repository has no strict 6.7 binding and labels Golden Frostbound Oath v6.5 in revision history, so field extraction was stopped before value comparison."
                }
            ],
            conclusion: "The contract permits replacing gcsim, but no inspected alternative currently supplies complete, version-bound, independent field values for the nine candidates. gridhead/gi-loadouts closes the version-and-coverage dimensions but fails independence because its weapon values are explicitly Fandom Wiki-derived. Official/KQM evidence can still reduce claim-level gaps without changing the contract."
        },
        pilotFieldCoverage: {
            schemaVersion: 1,
            scope: "the 651 field claims attached to the nine independently pinned weapon candidates",
            contractObservation: "External factual claims require strict independent provider agreement. Internal Runtime, mapping, derived, and notApplicable claims now use claim-kind-specific deterministic evidence and do not require impossible external attestations.",
            summary: countsForRows(coverageRows),
            byWeapon,
            byFieldCategory,
            highestPotentialExternalCoverage: byWeapon.length ? [...byWeapon].sort((a, b) => b.gameSemanticClaims - a.gameSemanticClaims || sortNatural(a.weaponId, b.weaponId))[0] : null,
            newlyInspectedProviderArtifacts: [
                {
                    provider: "gridhead/gi-loadouts",
                    result: "sameLineage",
                    strict67: true,
                    weaponCoverage: "9/9",
                    potentiallyComparableGameSemanticClaims: coverageRows.filter((row) => row.claimStatus !== "notApplicable" && row.fieldCategory !== "damageToolRuntimeContract").length,
                    eligibleClaims: 0,
                    reason: "Fandom Wiki-derived passive values overlap genshin-db's documented Fandom Wiki upstream."
                },
                {
                    provider: "hazarsozer/genshin-calculator",
                    result: "versionUnbound",
                    strict67: false,
                    eligibleClaims: 0,
                    reason: "No strict 6.7 manifest; one target weapon is explicitly labeled v6.5 in provider history."
                }
            ],
            claimKindEvidenceContract: {
                implemented: true,
                externalFactual: "strict 6.7 independent dual-source field agreement plus human review",
                internalRuntimeRoute: "deterministic code provenance plus focused Runtime/Calculation tests",
                mappingMaterialization: "verified source inputs plus deterministic mapping provenance and tests",
                notApplicable: "explicit applicability determination",
                safetyNote: "Production canonical promotion still requires recorded human approval; the audit never self-approves."
            },
            rows: coverageRows
        },
        impact: {
            canonicalCandidates: {
                total: canonical?.repository?.totalCandidates || 0,
                currentlyCanonical: canonical?.repository?.canonical || 0,
                currentlyExcluded: canonical?.repository?.excluded || 0,
                potentiallyUnableUnderCurrentEvidenceInventory: canonical?.repository?.excluded || 0,
                directlyExposedToMissingGcsimRevisionVersion: dual?.summary?.independentPinnedWeaponCandidates || 0,
                note: "The total is current inventory exposure, not a claim that every candidate must use gcsim; other exact-version providers could satisfy the unchanged contract."
            },
            byDataset: {
                weapons: { candidates: categories.weapons?.excluded || 0, claims: dual?.summary?.claims?.weapons || 0 },
                artifacts: { candidates: categories.artifacts?.excluded || 0, claims: dual?.summary?.claims?.artifacts || 0 },
                characters: { candidates: totalFor(characterCategoryNames), claims: null, note: "The current claim audit covers weapon/artifact candidates only." }
            },
            claims: {
                total: dual?.summary?.claims?.total || 0,
                missingVersion: dual?.summary?.missingVersionClaims || 0,
                directlyExposedToMissingGcsimRevisionVersion: dual?.summary?.classificationCounts?.["missing-version"] || 0,
                dualSourceEligible: dual?.summary?.dualSourceEligibleClaims || 0
            },
            providers: {
                damageToolLocal: { sourceRecordsMissingGameVersion: 1322 },
                gcsim: {
                    pinnedEntityRecords: external?.summary?.sourceRecords || 0,
                    extractedFields: external?.summary?.fieldRecords || 0,
                    recordsMissingGameVersion: external?.summary?.gameVersionMissingSourceRecords || 0,
                    affectedClaims: dual?.summary?.classificationCounts?.["missing-version"] || 0
                },
                genshinDb: {
                    strictlyBoundSourceSnapshots: 1,
                    strictlyBoundFieldProvenance: 9,
                    fieldCandidatesAwaitingProvenancePropagation: 0
                },
                officialHoyolab: { versionLinkedWeaponRecords: independent?.summary?.officialGameVersionLinkedRecords || 0 },
                genshinOptimizer: {
                    recordsMissingGameVersion: optimizer?.summary?.gameVersionMissingSourceRecords || 0,
                    correlatedFieldRecords: optimizer?.summary?.fieldRecords || 0
                },
                genshinDataCharacterMaterialization: {
                    materializedSources: characterFields?.summary?.materializedSources || 0,
                    fieldsMissingGameVersion: characterFields?.summary?.fieldEvidence || 0
                }
            },
            review: {
                candidatesHumanReviewReady: reviewReadiness?.summary?.candidates?.humanReviewReady || 0,
                candidatesHumanReviewed: reviewReadiness?.summary?.candidates?.humanReviewed || 0,
                humanDecisionRequiredNow: reviewReadiness?.summary?.conflictFollowup?.humanDecisionRequiredNow || 0
            }
        },
        evidenceModels: [
            {
                id: "strictExactRevision",
                status: "current",
                requirement: "Every participating provider/field has an explicit Genshin gameVersion in immutable metadata bound to the exact revision and field digest.",
                guarantees: ["exact snapshot-to-gameVersion identity", "low silent version-drift risk", "high auditability", "byte-reproducible evidence"],
                doesNotGuarantee: ["semantic correctness without independent field comparison and human review"],
                falsePromotionRisk: "lowest",
                versionDriftRisk: "lowest",
                auditability: "highest",
                reproducibility: "highest",
                operationalFeasibility: "provider-dependent; structurally unavailable for the inspected gcsim revision"
            },
            {
                id: "claimScopedVersionTriangulation",
                status: "proposalOnlyNotImplemented",
                requirement: "Bind each field to exact provider bytes and compare it with a version-explicit first-party field source; permit a provider snapshot without a global version only when the same claim is independently version-bound and no conflicting later semantics are present.",
                guarantees: ["claim-level values and semantics are tied to an explicit target gameVersion", "exact provider bytes remain reproducible", "independence and human review remain mandatory"],
                doesNotGuarantee: ["the provider repository as a whole represents one gameVersion", "unexamined fields share the reviewed version"],
                falsePromotionRisk: "low-to-medium; bounded to reviewed fields",
                versionDriftRisk: "medium; requires per-field invalidation when semantics change",
                auditability: "high when both raw excerpts, digests, locators, and comparison output are retained",
                reproducibility: "high for reviewed fields",
                adoption: "requires explicit user approval and a DataContract/canonical-gate change; this audit does not adopt it"
            }
        ]
    };
}

function buildEvidence({
    dataRoot = defaultDataRoot,
    sourceCatalogFile = defaultSourceCatalogPath,
    metadataFiles = {}
} = {}) {
    const sourceCatalog = readJson(sourceCatalogFile);
    const sourceEntries = Object.entries(sourceCatalog.sources || {}).sort(([a], [b]) => sortNatural(a, b));
    const catalogRecords = Object.entries(sourceCatalog.records || {}).sort(([a], [b]) => sortNatural(a, b));
    const sourceStatuses = sourceEntries.map(([id, source]) => {
        const strict = strictEvidence({ source, evidence: source?.gameVersionEvidence });
        const revisionPinned = validRevision(source?.revision) && source?.revisionKind === "gitCommit";
        return {
            id,
            provider: source?.provider || null,
            repository: source?.repository || null,
            revision: source?.revision || null,
            revisionPinned,
            gameVersion: strict.gameVersion,
            gameVersionEvidence: clone(source?.gameVersionEvidence || null),
            gameVersionVerified: strict.verified,
            binding: strict.binding,
            blockedReasons: [...new Set([
                ...(revisionPinned ? [] : ["revisionPinInvalid"]),
                ...strict.blockedReasons
            ])].sort(),
            status: revisionPinned && strict.verified ? "ready" : "blocked"
        };
    });
    const recordStatuses = catalogRecords.map(([id, record]) => {
        const source = sourceCatalog.sources?.[record?.source] || null;
        const strict = strictEvidence({ source, evidence: record?.gameVersionEvidence, record });
        const fieldScoped = nonEmptyString(record?.field);
        const blockedReasons = [...new Set([
            ...(fieldScoped ? [] : ["fieldScopeMissing"]),
            ...strict.blockedReasons
        ])].sort();
        return {
            id,
            source: record?.source || null,
            path: record?.path || null,
            sha256: record?.sha256 || null,
            fieldScoped,
            gameVersion: strict.gameVersion,
            gameVersionEvidence: clone(record?.gameVersionEvidence || null),
            gameVersionVerified: fieldScoped && strict.verified,
            binding: strict.binding,
            blockedReasons,
            status: fieldScoped && strict.verified ? "ready" : "blocked"
        };
    });
    const local = sourceRecords(dataRoot);
    const external = externalEvidenceStats(dataRoot);
    const primaryResearch = buildPrimaryResearch(sourceEntries, catalogRecords);
    const feasibilityAudit = buildFeasibilityAudit(dataRoot);
    const providerManifests = {};
    sourceEntries.forEach(([id, source]) => {
        providerManifests[id] = probeManifest({
            sourceId: id,
            source,
            file: metadataFiles[id] || null
        });
    });
    const blockedReasons = [];
    sourceStatuses.forEach((source) => source.blockedReasons.forEach((reason) => blockedReasons.push(`source:${source.id}:${reason}`)));
    recordStatuses.forEach((record) => record.blockedReasons.forEach((reason) => blockedReasons.push(`record:${record.id}:${reason}`)));
    if (local.gameVersionMissing || local.gameVersionPresent === 0) blockedReasons.push(`localSourceRecords:gameVersionMissing:${local.gameVersionMissing || local.total}`);
    if (external.explicit === 0) blockedReasons.push("externalEvidence:gameVersionMissing");
    Object.entries(providerManifests).forEach(([id, probe]) => {
        const sourceStatus = sourceStatuses.find((source) => source.id === id);
        if (sourceStatus?.gameVersionVerified) return;
        probe.blockedReasons.forEach((reason) => blockedReasons.push(`providerManifest:${id}:${reason}`));
    });
    blockedReasons.push("canonicalGate:gameVersionEvidenceNotStrictlyBound");
    const uniqueBlockedReasons = [...new Set(blockedReasons)].sort();
    const paths = {
        sourceCatalog: sourceCatalogFile,
        weaponSourceRecords: path.join(dataRoot, "v2", "weapons", "source-records.json"),
        artifactSourceRecords: path.join(dataRoot, "v2", "artifacts", "source-records.json"),
        behaviorReviewedSourceRecords: path.join(dataRoot, "v2", "characters", "behavior-reviewed.json"),
        weaponExternalEvidence: path.join(dataRoot, "v2", "weapons", "external-evidence.json"),
        characterExternalEvidence: path.join(dataRoot, "v2", "characters", "external-field-evidence.json"),
        characterFieldMaterialization: path.join(dataRoot, "v2", "characters", "field-materialization.json"),
        independentWeaponEvidence: path.join(dataRoot, "v2", "weapons", "independent-field-evidence.json"),
        optimizerFieldEvidence: path.join(dataRoot, "v2", "external", "optimizer-field-evidence.json"),
        reviewReadiness: path.join(dataRoot, "v2", "review-readiness.json"),
        dualSourceAudit: path.join(repositoryRoot, "reports", "genshin-v2-dual-source-audit.json"),
        canonicalRuntimeAudit: path.join(repositoryRoot, "reports", "genshin-canonical-runtime-audit.json")
    };
    return {
        schemaVersion: 1,
        kind: "genshinGameVersionEvidence",
        generator: { name: "genshinGameVersionEvidenceGenerate.cjs", version: GENERATOR_VERSION, capturedAt: CAPTURED_AT },
        policy: {
            primaryOnly: true,
            networkAccess: "none",
            revisionSemantics: "repositoryRevisionOnly",
            gameVersionSemantics: "explicitGameVersionEvidenceRequired",
            sameRevisionBinding: "gameVersionEvidence.binding.revision must equal source.revision",
            recordBinding: "for field-scoped catalog records, binding.sourceRecordDigest must equal record.sha256",
            metadataIntegrity: "gameVersionEvidence.integrity.algorithm=sha256 with a content digest is required",
            canonicalPromotion: "forbidden",
            acceptedEvidenceKinds: ACCEPTED_EVIDENCE_KINDS,
            rejectedVersionProofs: REJECTED_VERSION_PROOFS
        },
        generatedFrom: inputManifest(paths),
        sourceCatalog: {
            path: relativePath(sourceCatalogFile),
            sha256: fileDigest(sourceCatalogFile),
            capturedAt: sourceCatalog.capturedAt || null,
            sourceStatuses,
            records: recordStatuses,
            officialLocators: Object.fromEntries(sourceEntries.map(([id, source]) => [id, officialLocators(id, source)])),
            providerManifests
        },
        localSourceRecords: local,
        externalEvidence: external,
        primaryResearch,
        feasibilityAudit,
        summary: {
            sources: sourceStatuses.length,
            revisionPinnedSources: sourceStatuses.filter((source) => source.revisionPinned).length,
            explicitGameVersionSources: sourceStatuses.filter((source) => nonEmptyString(source.gameVersion)).length,
            strictlyBoundSources: sourceStatuses.filter((source) => source.gameVersionVerified).length,
            catalogRecords: recordStatuses.length,
            fieldScopedRecords: recordStatuses.filter((record) => record.fieldScoped).length,
            explicitGameVersionRecords: recordStatuses.filter((record) => nonEmptyString(record.gameVersion)).length,
            strictlyBoundRecords: recordStatuses.filter((record) => record.gameVersionVerified).length,
            localSourceRecords: local.total,
            localGameVersionPresent: local.gameVersionPresent,
            externalEvidenceExplicitGameVersion: external.explicit,
            externalEvidenceVerifiedGameVersion: external.verified,
            primaryResearchSources: primaryResearch.summary.sources,
            primaryResearchFieldCandidates: primaryResearch.summary.fieldCandidates,
            primaryResearchExactRevisionFieldCandidates: primaryResearch.summary.exactRevisionFieldCandidates,
            primaryResearchStrictlyBoundSources: primaryResearch.summary.strictlyBoundSources,
            primaryResearchStrictlyBoundFields: primaryResearch.summary.strictlyBoundFields,
            canonicalEligibility: 0,
            scopedCanonicalEligibility: feasibilityAudit?.impact?.canonicalCandidates?.currentlyCanonical || 0,
            promotionGate: "blocked",
            blockedReasonCounts: countBy(uniqueBlockedReasons)
        },
        blockedReasons: uniqueBlockedReasons,
        errors: []
    };
}

function writeEvidence({ dataRoot = defaultDataRoot, sourceCatalogFile = defaultSourceCatalogPath, outputFile = defaultOutputFile, metadataFiles = {} } = {}) {
    const evidence = buildEvidence({ dataRoot, sourceCatalogFile, metadataFiles });
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    return evidence;
}

if (require.main === module) {
    const dataRoot = process.env.GENSHIN_DATA_ROOT || defaultDataRoot;
    const sourceCatalogFile = process.env.GENSHIN_SOURCE_CATALOG_FILE || defaultSourceCatalogPath;
    const outputFile = process.env.GENSHIN_GAME_VERSION_EVIDENCE_FILE || defaultOutputFile;
    const metadataFiles = {
        gcsim: process.env.GENSHIN_GCSIM_GAME_VERSION_MANIFEST || null,
        genshinDb: process.env.GENSHIN_DB_GAME_VERSION_MANIFEST || null
    };
    const evidence = writeEvidence({ dataRoot, sourceCatalogFile, outputFile, metadataFiles });
    process.stdout.write(`${JSON.stringify(evidence.summary, null, 2)}\n`);
}

module.exports = {
    ACCEPTED_EVIDENCE_KINDS,
    CAPTURED_AT,
    GENERATOR_VERSION,
    PRIMARY_RESEARCH_CAPTURED_AT,
    PRIMARY_RESEARCH_VERSION,
    PRIMARY_SOURCE_RESEARCH,
    REJECTED_VERSION_PROOFS,
    buildEvidence,
    buildFeasibilityAudit,
    buildPrimaryResearch,
    collectGameVersionStats,
    completeEvidence,
    defaultDataRoot,
    defaultOutputFile,
    defaultReportJsonPath,
    defaultReportMarkdownPath,
    evidenceBinding,
    officialLocators,
    sourceRecords,
    stableJson,
    strictEvidence,
    writeEvidence
};
