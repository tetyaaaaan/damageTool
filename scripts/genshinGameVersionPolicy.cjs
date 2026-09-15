"use strict";

const STRICT_EVIDENCE_KINDS = new Set([
    "gameClientManifest",
    "providerDatasetManifest",
    "providerReleaseArtifact",
    "releaseNotesWithExplicitGameVersion"
]);

function parseGameVersion(value) {
    if (typeof value !== "string" || !/^\d+(?:\.\d+)*$/.test(value.trim())) return null;
    return value.trim().split(".").map((part) => Number(part));
}

function compareGameVersions(left, right) {
    const a = parseGameVersion(left);
    const b = parseGameVersion(right);
    if (!a || !b) return null;
    const length = Math.max(a.length, b.length);
    for (let index = 0; index < length; index += 1) {
        const delta = (a[index] || 0) - (b[index] || 0);
        if (delta) return Math.sign(delta);
    }
    return 0;
}

function hasStrictSourceBinding(source) {
    const evidence = source?.gameVersionEvidence;
    return Boolean(source?.gameVersion
        && parseGameVersion(source.gameVersion)
        && STRICT_EVIDENCE_KINDS.has(evidence?.kind)
        && evidence?.gameVersion === source.gameVersion
        && typeof source?.revision === "string" && source.revision.trim()
        && typeof evidence?.locator?.dataset === "string" && evidence.locator.dataset.trim()
        && typeof evidence?.locator?.record === "string" && evidence.locator.record.trim()
        && evidence?.integrity?.algorithm === "sha256"
        && /^[a-f0-9]{64}$/.test(evidence?.integrity?.digest || "")
        && evidence?.binding?.revision === source.revision
        && evidence?.binding?.metadataDigest === evidence.integrity.digest);
}

function deriveCurrentGameVersion(sourceCatalog) {
    const bound = Object.entries(sourceCatalog?.sources || {})
        .filter(([, source]) => hasStrictSourceBinding(source))
        .map(([sourceId, source]) => ({ sourceId, gameVersion: source.gameVersion, revision: source.revision }));
    const versions = [...new Set(bound.map((item) => item.gameVersion))].sort(compareGameVersions);
    if (versions.length > 1) {
        return { gameVersion: null, status: "conflict", sources: bound, conflictingVersions: versions };
    }
    const gameVersion = versions[0] || null;
    return {
        gameVersion,
        status: gameVersion ? "strictlyBound" : "unbound",
        sources: bound
    };
}

module.exports = { STRICT_EVIDENCE_KINDS, parseGameVersion, compareGameVersions, hasStrictSourceBinding, deriveCurrentGameVersion };
