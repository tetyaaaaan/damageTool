"use strict";

/**
 * Read-only proof adapter for the source catalog.
 *
 * The catalog contains claims about an external repository, but a claim about
 * a digest is not the same thing as replaying the bytes represented by that
 * digest.  This adapter only reads already-saved artifacts.  It deliberately
 * has no fetch or write path: an artifact which cannot be located locally is
 * an unverified artifact.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ACCEPTED_EVIDENCE_KINDS = [
    "gameClientManifest",
    "providerDatasetManifest",
    "providerReleaseArtifact",
    "releaseNotesWithExplicitGameVersion"
];

const DEFAULT_SAVED_SOURCE_ROOT = path.join(
    "games",
    "genshin",
    "data",
    "v2",
    "version-transitions",
    "6.7-to-7.0",
    "sources"
);

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function sha1(value) {
    return crypto.createHash("sha1").update(value).digest("hex");
}

function gitBlobSha(value) {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
    return sha1(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]));
}

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableJson(value) {
    return JSON.stringify(stableValue(value));
}

function valueDigest(value) {
    // JSON.stringify(undefined) returns undefined, which crypto.update does
    // not accept.  Preserve an explicit sentinel for deterministic missing
    // pointer proofs while keeping normal values stable-key hashed.
    return sha256(Buffer.from(stableJson(value === undefined ? { __undefined: true } : value), "utf8"));
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

function normalizeSlash(value) {
    return String(value || "").replaceAll("\\", "/").replace(/^\.\//, "");
}

function normalizeProviderPath(value) {
    const normalized = normalizeSlash(value).replace(/^\/+/, "");
    if (!normalized || normalized.split("/").includes("..")) return null;
    return path.posix.normalize(normalized);
}

function stripProviderSourcePrefix(value) {
    const normalized = normalizeProviderPath(value);
    if (!normalized) return [];
    const variants = [normalized];
    ["src/data/", "src/", "data/"].forEach((prefix) => {
        if (normalized.startsWith(prefix)) variants.push(normalized.slice(prefix.length));
    });
    return [...new Set(variants)];
}

function urlPath(url) {
    if (!nonEmptyString(url)) return null;
    try {
        return normalizeProviderPath(decodeURIComponent(new URL(url).pathname));
    } catch (_error) {
        return null;
    }
}

function pathInside(root, candidate) {
    const relative = path.relative(root, candidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function relativePath(root, file) {
    return normalizeSlash(path.relative(root, file));
}

function unique(values) {
    return [...new Set((values || []).filter(Boolean))];
}

function snapshotPathRevision(value) {
    if (!value) return null;
    const text = String(value);
    const match = text.match(/(?:^|\/)([a-f0-9]{40})(?:\/|$)/i);
    return match ? match[1] : null;
}

function snapshotIdentityCandidate(value, context) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const candidatePath = value.path || value.artifactPath || null;
    const blob = value.gitBlobSha || value.gitBlob || value.blobSha || null;
    if (!nonEmptyString(candidatePath) || !validRevision(blob)) return null;
    return {
        path: normalizeSlash(candidatePath),
        revision: value.revision || snapshotPathRevision(candidatePath) || context.revision || null,
        gitBlobSha: blob,
        rawArtifactSha256: validSha256(value.rawArtifactSha256) ? value.rawArtifactSha256 : null,
        rawArtifactBytes: Number.isInteger(value.rawArtifactBytes) ? value.rawArtifactBytes : null,
        treeSha: value.treeSha || context.treeSha || null,
        snapshotPath: context.snapshotPath || null
    };
}

function readSavedIdentityIndex(repositoryRoot) {
    const index = [];
    const transitionRoot = path.join(repositoryRoot, DEFAULT_SAVED_SOURCE_ROOT, "..");
    if (fs.existsSync(transitionRoot)) {
        let snapshotFiles = [];
        try {
            snapshotFiles = fs.readdirSync(transitionRoot)
                .filter((file) => file === "behavior-entity-snapshot.json"
                    || file.startsWith("weapon-entity-snapshot")
                    || file === "official-weapon-frontier-11301-11303-snapshot.json")
                .sort();
        } catch (_error) {
            snapshotFiles = [];
        }
        for (const file of snapshotFiles) {
            const absolute = path.join(transitionRoot, file);
            let snapshot;
            try {
                snapshot = JSON.parse(fs.readFileSync(absolute, "utf8"));
            } catch (_error) {
                continue;
            }
            const snapshotRelative = relativePath(repositoryRoot, absolute);
            const walk = (value, context = {}) => {
                if (!value || typeof value !== "object") return;
                const nextContext = { ...context, snapshotPath: snapshotRelative };
                if (value.finalTreeSha && validRevision(value.finalTreeSha)) nextContext.treeSha = value.finalTreeSha;
                if (value.treeSha && validRevision(value.treeSha)) nextContext.treeSha = value.treeSha;
                if (value.treeResolution?.finalTreeSha && validRevision(value.treeResolution.finalTreeSha)) {
                    nextContext.treeSha = value.treeResolution.finalTreeSha;
                }
                const candidate = snapshotIdentityCandidate(value, nextContext);
                if (candidate) index.push(candidate);
                for (const child of Object.values(value)) walk(child, nextContext);
            };
            walk(snapshot);
        }
    }
    return index;
}

function identityPathMatch(candidate, { repositoryRoot, file, source, requestedPath } = {}) {
    const actualRelative = file ? relativePath(repositoryRoot, file) : "";
    const candidatePath = normalizeProviderPath(candidate?.path);
    const actualNormalized = normalizeProviderPath(actualRelative);
    const requestedVariants = stripProviderSourcePrefix(requestedPath);
    const candidateVariants = stripProviderSourcePrefix(candidatePath);
    const expectedRootNames = sourceRootNames(source);
    const actualRoot = sourceRootSegment(actualNormalized, source?.revision);
    const candidateRoot = sourceRootSegment(candidatePath, source?.revision);
    const sourceRootMatch = Boolean(actualRoot && expectedRootNames.includes(actualRoot.toLowerCase())
        && (!candidateRoot || expectedRootNames.includes(candidateRoot.toLowerCase())));
    const pathMatch = Boolean(
        sourceRootMatch && (
        (candidatePath && actualNormalized && (candidatePath === actualNormalized || actualNormalized.endsWith(`/${candidatePath}`)))
        || candidateVariants.some((variant) => requestedVariants.includes(variant))
        )
    );
    const revisionMatch = candidate?.revision === source?.revision;
    return { pathMatch, revisionMatch, sourceRootMatch };
}

function findSavedIdentity({ repositoryRoot, source, file, requestedPath, options } = {}) {
    const explicit = options?.identityProof
        || options?.identityProofs?.[requestedPath]
        || options?.identityProofs?.[normalizeProviderPath(requestedPath)]
        || null;
    if (explicit) {
        if (Array.isArray(explicit)) return { ambiguous: true, candidates: explicit, source: "options" };
        return { ...explicit, source: "options" };
    }
    const matches = readSavedIdentityIndex(repositoryRoot)
        .filter((candidate) => identityPathMatch(candidate, { repositoryRoot, file, source, requestedPath }).pathMatch)
        .filter((candidate) => candidate.revision === source?.revision)
        .sort((left, right) => String(left.snapshotPath).localeCompare(String(right.snapshotPath)));
    const distinctIdentities = new Set(matches.map((candidate) => [
        candidate.path,
        candidate.revision,
        candidate.gitBlobSha
    ].join("|")));
    if (distinctIdentities.size > 1) {
        return { ambiguous: true, candidates: matches, source: "savedSnapshot" };
    }
    return matches[0] ? { ...matches[0], source: "savedSnapshot" } : null;
}

function evidenceBinding(evidence) {
    const binding = evidence?.binding || evidence?.revisionBinding || null;
    return {
        revision: binding?.revision || evidence?.revision || evidence?.locator?.revision || null,
        metadataDigest: binding?.metadataDigest || binding?.fileDigest || null,
        sourceRecordDigest: binding?.sourceRecordDigest || binding?.fileDigest || null,
        present: Boolean(binding)
    };
}

function locatorPath(locator) {
    if (!locator || typeof locator !== "object") return null;
    if (nonEmptyString(locator.path)) return normalizeProviderPath(locator.path);
    if (nonEmptyString(locator.record)) {
        const record = String(locator.record).split("@")[0];
        if (record.includes("/") || /\.[A-Za-z0-9]+$/.test(record)) return normalizeProviderPath(record);
    }
    return urlPath(locator.url);
}

function sourceNames(source) {
    const provider = nonEmptyString(source?.provider) ? source.provider.split("/").filter(Boolean).at(-1) : null;
    return unique([source?.id, provider, source?.provider]);
}

function sourceRootNames(source) {
    return sourceNames(source)
        .map((value) => normalizeProviderPath(value))
        .filter(Boolean)
        .map((value) => value.toLowerCase());
}

function sourceRootSegment(value, revision) {
    const normalized = normalizeProviderPath(value);
    if (!normalized || !validRevision(revision)) return null;
    const parts = normalized.split("/");
    const revisionIndex = parts.lastIndexOf(revision);
    return revisionIndex > 0 ? parts[revisionIndex - 1] : null;
}

function repositoryIdentity(value) {
    if (!nonEmptyString(value)) return null;
    let parsed;
    try {
        parsed = new URL(value);
    } catch (_error) {
        return null;
    }
    const parts = parsed.pathname.split("/").filter(Boolean).map((part) => part.replace(/\.git$/i, ""));
    if (parts.length < 2) return null;
    const host = parsed.hostname.toLowerCase();
    // GitHub raw URLs carry the same owner/repository pair immediately after
    // the host as github.com URLs. A shared commit basename must never bind
    // another repository.
    if (host === "github.com" || host === "raw.githubusercontent.com") {
        return `github:${parts[0].toLowerCase()}/${parts[1].toLowerCase()}`;
    }
    return `${host}:${parts.slice(0, 2).join("/").toLowerCase()}`;
}

function repositoryUrlMatch(url, repository) {
    if (!url) return null;
    const actual = repositoryIdentity(url);
    const expected = repositoryIdentity(repository);
    return Boolean(actual && expected && actual === expected);
}

function candidateRoots(repositoryRoot, source, options) {
    const roots = [];
    for (const root of options?.savedArtifactRoots || []) roots.push(root);
    roots.push(path.join(repositoryRoot, DEFAULT_SAVED_SOURCE_ROOT));
    return unique(roots.map((root) => path.resolve(repositoryRoot, root)));
}

function addCandidate(list, repositoryRoot, candidate) {
    if (!candidate) return;
    const resolved = path.resolve(repositoryRoot, candidate);
    if (pathInside(repositoryRoot, resolved) && !list.includes(resolved)) list.push(resolved);
}

/**
 * Resolve an already-saved artifact.  The default lookup is intentionally
 * narrow: only the existing version-transition source root and the exact
 * source revision are considered.  It does not derive a path from a network
 * URL or search arbitrary repository files.
 */
function locateSavedArtifact({ repositoryRoot, source, requestedPath, explicitPath, options } = {}) {
    const candidates = [];
    const requestedVariants = stripProviderSourcePrefix(requestedPath);
    if (nonEmptyString(explicitPath)) {
        const explicit = path.isAbsolute(explicitPath)
            ? explicitPath
            : path.resolve(repositoryRoot, explicitPath);
        addCandidate(candidates, repositoryRoot, explicit);
    }

    const roots = candidateRoots(repositoryRoot, source, options);
    const revision = source?.revision;
    const names = sourceNames(source);
    roots.forEach((root) => {
        const rootBase = path.basename(root);
        const rootIsRevision = rootBase === revision;
        const rootIsSource = names.includes(rootBase);
        const rootIsSourceCollection = !rootIsRevision && !rootIsSource;
        const sourceRoots = [];
        if (rootIsRevision || rootIsSource) sourceRoots.push(root);
        if (rootIsSourceCollection) {
            names.forEach((name) => sourceRoots.push(path.join(root, name, revision || "")));
            // Existing source roots may use a normalized provider name rather
            // than the catalog source id. Inspect only one directory level,
            // and never accept another provider's root merely because its
            // revision directory has the same basename.
            if (fs.existsSync(root)) {
                try {
                    fs.readdirSync(root, { withFileTypes: true })
                        .filter((entry) => entry.isDirectory())
                        .filter((entry) => sourceRootNames(source).includes(entry.name.toLowerCase()))
                        .forEach((entry) => sourceRoots.push(path.join(root, entry.name, revision || "")));
                } catch (_error) {
                    // An unreadable saved root is simply an unavailable proof.
                }
            }
        }
        sourceRoots.forEach((sourceRoot) => {
            requestedVariants.forEach((variant) => addCandidate(candidates, repositoryRoot, path.join(sourceRoot, variant)));
        });
    });

    const existing = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    return {
        requestedPath: requestedPath || null,
        candidates: candidates.map((candidate) => relativePath(repositoryRoot, candidate)),
        path: existing || null
    };
}

function pathBinding({ repositoryRoot, file, source, requestedPath, url } = {}) {
    const relative = file ? relativePath(repositoryRoot, file) : null;
    const revision = source?.revision || null;
    const marker = revision ? `/${revision}/` : null;
    const markerIndex = marker && relative ? relative.indexOf(marker) : -1;
    const tail = markerIndex >= 0 ? relative.slice(markerIndex + marker.length) : null;
    const requestedVariants = stripProviderSourcePrefix(requestedPath);
    const pathMatch = Boolean(tail && requestedVariants.includes(tail));
    const revisionMatch = Boolean(validRevision(revision) && markerIndex >= 0);
    const expectedRootNames = sourceRootNames(source);
    const actualRoot = sourceRootSegment(relative, revision);
    const sourceRootMatch = Boolean(actualRoot && expectedRootNames.includes(actualRoot.toLowerCase()));
    const requestedUrlPath = urlPath(url);
    const urlRevisionMatch = Boolean(
        requestedUrlPath
        && revision
        && requestedUrlPath.split("/").includes(revision)
    );
    const urlPathMatch = !requestedUrlPath || requestedVariants.some((variant) => (
        requestedUrlPath === variant || requestedUrlPath.endsWith(`/${variant}`)
    ));
    const urlRepositoryMatch = url ? repositoryUrlMatch(url, source?.repository) : null;
    return {
        relativePath: relative,
        requestedPath: requestedPath || null,
        revision,
        revisionMatch,
        pathMatch,
        sourceRoot: actualRoot,
        sourceRootMatch,
        urlRevisionMatch: requestedUrlPath ? urlRevisionMatch : null,
        urlPathMatch: requestedUrlPath ? urlPathMatch : null,
        urlRepositoryMatch,
        exact: revisionMatch && pathMatch && sourceRootMatch
            && (!requestedUrlPath || (urlRevisionMatch && urlPathMatch && urlRepositoryMatch))
    };
}

function readArtifact({ repositoryRoot, source, requestedPath, explicitPath, expectedDigest, expectedBytes, url, role, options } = {}) {
    const located = locateSavedArtifact({ repositoryRoot, source, requestedPath, explicitPath, options });
    const evidence = {
        role,
        requestedPath: requestedPath || null,
        resolvedPath: located.path ? relativePath(repositoryRoot, located.path) : null,
        exists: Boolean(located.path),
        bytes: null,
        actualSha256: null,
        expectedSha256: validSha256(expectedDigest) ? expectedDigest : (expectedDigest || null),
        expectedBytes: Number.isInteger(expectedBytes) ? expectedBytes : null,
        revision: source?.revision || null,
        revisionMatch: false,
        pathMatch: false,
        urlRevisionMatch: null,
        urlPathMatch: null,
        digestMatch: false,
        bytesMatch: expectedBytes === undefined || expectedBytes === null,
        gitBlobSha: null,
        expectedGitBlobSha: null,
        gitBlobShaMatch: false,
        identityPathMatch: false,
        identityRevisionMatch: false,
        identityVerified: false,
        revisionVerified: false,
        pathBinding: null,
        verified: false
    };
    const reasons = [];
    if (!located.path) {
        reasons.push(`${role}:missing`);
        return { evidence, reasons };
    }
    let bytes;
    try {
        bytes = fs.readFileSync(located.path);
    } catch (_error) {
        reasons.push(`${role}:unreadable`);
        return { evidence, reasons };
    }
    evidence.bytes = bytes.length;
    evidence.actualSha256 = sha256(bytes);
    evidence.pathBinding = pathBinding({ repositoryRoot, file: located.path, source, requestedPath, url });
    evidence.revisionMatch = evidence.pathBinding.revisionMatch;
    evidence.pathMatch = evidence.pathBinding.pathMatch;
    evidence.urlRevisionMatch = evidence.pathBinding.urlRevisionMatch;
    evidence.urlPathMatch = evidence.pathBinding.urlPathMatch;
    evidence.digestMatch = validSha256(expectedDigest) && evidence.actualSha256 === expectedDigest;
    evidence.bytesMatch = expectedBytes === undefined || expectedBytes === null || evidence.bytes === expectedBytes;
    if (!validRevision(source?.revision)) reasons.push(`${role}:revision:invalid`);
    if (!evidence.revisionMatch) reasons.push(`${role}:revision:pathMismatch`);
    if (!evidence.pathMatch) reasons.push(`${role}:path:mismatch`);
    if (!evidence.pathBinding.sourceRootMatch) reasons.push(`${role}:sourceRoot:mismatch`);
    if (evidence.urlRevisionMatch === false) reasons.push(`${role}:url:revisionMismatch`);
    if (evidence.urlPathMatch === false) reasons.push(`${role}:url:pathMismatch`);
    if (evidence.pathBinding.urlRepositoryMatch === false) reasons.push(`${role}:url:repositoryMismatch`);
    if (!validSha256(expectedDigest)) reasons.push(`${role}:expectedDigest:missingOrInvalid`);
    else if (!evidence.digestMatch) reasons.push(`${role}:digest:mismatch`);
    if (!evidence.bytesMatch) reasons.push(`${role}:bytes:mismatch`);
    const contentVerified = reasons.length === 0;
    const identity = findSavedIdentity({ repositoryRoot, source, file: located.path, requestedPath, options });
    evidence.identity = identity ? (identity.ambiguous
        ? {
            source: identity.source || null,
            ambiguous: true,
            candidates: (identity.candidates || []).map((candidate) => ({
                snapshotPath: candidate.snapshotPath || null,
                path: candidate.path || null,
                revision: candidate.revision || null,
                gitBlobSha: candidate.gitBlobSha || null
            }))
        }
        : {
            source: identity.source || null,
            snapshotPath: identity.snapshotPath || null,
            path: identity.path || null,
            revision: identity.revision || null,
            treeSha: identity.treeSha || null
        }) : null;
    evidence.expectedGitBlobSha = validRevision(identity?.gitBlobSha)
        ? identity.gitBlobSha
        : (validRevision(options?.gitBlobSha) ? options.gitBlobSha : null);
    evidence.gitBlobSha = gitBlobSha(bytes);
    evidence.gitBlobShaMatch = Boolean(evidence.expectedGitBlobSha && evidence.gitBlobSha === evidence.expectedGitBlobSha);
    evidence.identityPathMatch = Boolean(identity && !identity.ambiguous
        && identityPathMatch(identity, { repositoryRoot, file: located.path, source, requestedPath }).pathMatch);
    evidence.identityRevisionMatch = Boolean(identity && !identity.ambiguous && identity.revision === source?.revision);
    evidence.identityVerified = evidence.gitBlobShaMatch && evidence.identityPathMatch && evidence.identityRevisionMatch;
    evidence.revisionVerified = evidence.revisionMatch && evidence.pathMatch && evidence.identityVerified;
    if (!identity) reasons.push(`${role}:revision:identityMissing`);
    else if (identity.ambiguous) reasons.push(`${role}:revision:identityAmbiguous`);
    else if (!evidence.identityPathMatch) reasons.push(`${role}:identity:pathMismatch`);
    else if (!evidence.identityRevisionMatch) reasons.push(`${role}:identity:revisionMismatch`);
    else if (!evidence.gitBlobShaMatch) reasons.push(`${role}:identity:gitBlobMismatch`);
    evidence.bytesVerified = contentVerified;
    // `verified` is the local raw-byte/digest assertion.  Exact revision
    // provenance is deliberately separate and stricter.
    evidence.verified = contentVerified;
    return { evidence, reasons };
}

function pointerTokens(pointer) {
    if (pointer === "") return [];
    if (!nonEmptyString(pointer) || !pointer.startsWith("/")) return null;
    return pointer.slice(1).split("/").map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function extractJsonPointer(value, pointer) {
    const tokens = pointerTokens(pointer);
    if (!tokens) return { supported: false, value: undefined };
    let current = value;
    for (const token of tokens) {
        if (current === null || current === undefined || typeof current !== "object") return { supported: true, found: false, value: undefined };
        if (!Object.prototype.hasOwnProperty.call(current, token)) return { supported: true, found: false, value: undefined };
        current = current[token];
    }
    return { supported: true, found: true, value: current };
}

function extractManifestField(manifest, field) {
    if (field === "") return { supported: true, found: true, value: manifest, mode: "jsonPointer" };
    if (nonEmptyString(field) && field.startsWith("/")) {
        return { ...extractJsonPointer(manifest, field), mode: "jsonPointer" };
    }
    // Existing source-catalog evidence uses the package top-level key
    // `description`; accepting only a simple own key keeps this adapter
    // deterministic without treating arbitrary prose as a pointer.
    if (nonEmptyString(field) && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(field)) {
        return {
            supported: true,
            found: manifest !== null && typeof manifest === "object" && Object.prototype.hasOwnProperty.call(manifest, field),
            value: manifest !== null && typeof manifest === "object" ? manifest[field] : undefined,
            mode: "topLevelKey"
        };
    }
    return { supported: false, found: false, value: undefined, mode: null };
}

function versionTokenInText(value, expectedVersion, { allowExactGameVersionField = false } = {}) {
    if (allowExactGameVersionField && value === expectedVersion) return true;
    if (!nonEmptyString(value) || !nonEmptyString(expectedVersion)) return false;
    const escaped = String(expectedVersion).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // A prose version claim is accepted only when it explicitly names
    // Genshin Impact and uses the vX.Y/version X.Y form.  The look-ahead
    // prevents 7.0 from matching 7.0.1 (or another longer semver).
    return new RegExp(`\\bGenshin\\s+Impact\\b[^\\r\\n]{0,80}\\b(?:v(?:ersion)?\\s*)${escaped}(?![0-9.])`, "i").test(value);
}

function isExplicitGameVersionField(field) {
    return field === "gameVersion" || field === "/gameVersion";
}

function verifyVersionManifest({ repositoryRoot, source, evidence, options } = {}) {
    const reasons = [];
    const binding = evidenceBinding(evidence);
    const expectedGameVersion = source?.gameVersion || evidence?.gameVersion || null;
    const requestedPath = locatorPath(evidence?.locator);
    const explicitPath = options?.versionManifestPath || evidence?.locator?.localPath || evidence?.localPath || null;
    const raw = readArtifact({
        repositoryRoot,
        source,
        requestedPath,
        explicitPath,
        expectedDigest: evidence?.integrity?.digest,
        expectedBytes: evidence?.integrity?.bytes,
        url: evidence?.locator?.url,
        role: "versionManifest",
        options
    });
    reasons.push(...raw.reasons);
    const manifestEvidence = {
        ...raw.evidence,
        kind: evidence?.kind || null,
        sourceRevision: source?.revision || null,
        bindingRevision: binding.revision,
        bindingMetadataDigest: binding.metadataDigest,
        explicitField: evidence?.locator?.field || null,
        explicitGameVersion: null,
        explicitText: evidence?.explicitText || null,
        parseError: null
    };
    let manifest = null;
    if (raw.evidence.verified) {
        try {
            manifest = JSON.parse(fs.readFileSync(path.resolve(repositoryRoot, raw.evidence.resolvedPath), "utf8"));
        } catch (error) {
            manifestEvidence.parseError = error.message;
            reasons.push("versionManifest:invalidJson");
        }
    }
    if (!ACCEPTED_EVIDENCE_KINDS.includes(evidence?.kind)) reasons.push("versionManifest:kind:invalid");
    if (!nonEmptyString(expectedGameVersion)) reasons.push("versionManifest:gameVersion:missing");
    if (expectedGameVersion && evidence?.gameVersion !== expectedGameVersion) reasons.push("versionManifest:declaredVersion:mismatch");
    if (!binding.present) reasons.push("versionManifest:binding:missing");
    if (binding.revision !== source?.revision) reasons.push("versionManifest:binding:revisionMismatch");
    if (binding.metadataDigest !== evidence?.integrity?.digest) reasons.push("versionManifest:binding:digestMismatch");
    if (manifest !== null) {
        const manifestField = evidence?.locator?.field || "gameVersion";
        const extracted = extractManifestField(manifest, manifestField);
        manifestEvidence.fieldExtraction = {
            supported: extracted.supported,
            found: extracted.found === true,
            mode: extracted.mode,
            value: clone(extracted.value)
        };
        manifestEvidence.versionFieldIsExplicitGameVersion = isExplicitGameVersionField(manifestField);
        if (!extracted.supported) reasons.push("versionManifest:fieldExtraction:unsupported");
        else if (!extracted.found) reasons.push("versionManifest:fieldExtraction:missing");
        else {
            manifestEvidence.explicitGameVersion = typeof extracted.value === "string" && versionTokenInText(extracted.value, expectedGameVersion, {
                allowExactGameVersionField: manifestEvidence.versionFieldIsExplicitGameVersion
            })
                ? expectedGameVersion
                : null;
            if (!versionTokenInText(extracted.value, expectedGameVersion, {
                allowExactGameVersionField: manifestEvidence.versionFieldIsExplicitGameVersion
            })) reasons.push("versionManifest:explicitVersion:mismatch");
            // The catalog's explicitText is the provider's version-bearing
            // statement, not necessarily the whole package description.  It
            // must be present in the field actually read from the manifest;
            // metadata copied into the catalog is never accepted by itself.
            if (nonEmptyString(evidence?.explicitText)
                && (typeof extracted.value !== "string" || !extracted.value.includes(evidence.explicitText))) {
                reasons.push("versionManifest:explicitText:mismatch");
            }
        }
    } else if (raw.evidence.verified) {
        reasons.push("versionManifest:bytes:unavailable");
    }
    const verified = reasons.length === 0;
    manifestEvidence.artifactBytesVerified = raw.evidence.verified === true;
    manifestEvidence.verified = verified;
    return { evidence: manifestEvidence, reasons, verified };
}

function expectedFieldValue(record, options) {
    if (Object.prototype.hasOwnProperty.call(options || {}, "expectedValue")) return options.expectedValue;
    for (const key of ["expectedValue", "claimValue", "fieldValue"]) {
        if (Object.prototype.hasOwnProperty.call(record || {}, key)) return record[key];
    }
    return undefined;
}

function verifyRecordField({ repositoryRoot, record, rawEvidence, options } = {}) {
    const reasons = [];
    if (!record) return {
        evidence: { applicable: false, supported: false, pointer: null, found: false, extracted: null, expected: null, verified: false },
        reasons,
        verified: false
    };
    const pointer = options?.fieldPointer || record.fieldPointer || record.field || null;
    const fieldEvidence = {
        applicable: true,
        supported: false,
        pointer,
        found: false,
        extracted: null,
        expected: null,
        extractedDigest: null,
        expectedDigest: null,
        rawIdentity: null,
        verified: false
    };
    if (!nonEmptyString(pointer)) {
        reasons.push("field:missing");
        return { evidence: fieldEvidence, reasons, verified: false };
    }
    if (["recordSnapshot", "entitySnapshot", "snapshot"].includes(pointer)) {
        reasons.push("field:entitySnapshotOnly");
        return { evidence: fieldEvidence, reasons, verified: false };
    }
    if (!pointer.startsWith("/")) {
        reasons.push("field:jsonPointer:unsupported");
        return { evidence: fieldEvidence, reasons, verified: false };
    }
    if (!rawEvidence?.resolvedPath || rawEvidence.verified !== true) {
        reasons.push("field:rawArtifactUnverified");
        return { evidence: fieldEvidence, reasons, verified: false };
    }
    if (rawEvidence.revisionVerified !== true) {
        reasons.push("field:revisionUnverified");
        return { evidence: fieldEvidence, reasons, verified: false };
    }
    let document;
    try {
        document = JSON.parse(fs.readFileSync(path.resolve(repositoryRoot, rawEvidence.resolvedPath), "utf8"));
    } catch (_error) {
        reasons.push("field:rawArtifactInvalidJson");
        return { evidence: fieldEvidence, reasons, verified: false };
    }
    const extracted = extractJsonPointer(document, pointer);
    fieldEvidence.supported = extracted.supported;
    fieldEvidence.found = extracted.found === true;
    fieldEvidence.extracted = clone(extracted.value);
    fieldEvidence.extractedDigest = valueDigest(extracted.value);
    const rawIdentity = {};
    ["id", "entityId", "itemId", "name", "slug", "key"].forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(document, key)) rawIdentity[key] = clone(document[key]);
    });
    fieldEvidence.rawIdentity = Object.keys(rawIdentity).length ? rawIdentity : null;
    if (!extracted.supported) reasons.push("field:jsonPointer:unsupported");
    else if (!extracted.found) reasons.push("field:jsonPointer:missing");
    const expected = expectedFieldValue(record, options);
    fieldEvidence.comparisonVerified = false;
    if (expected !== undefined) {
        fieldEvidence.expected = clone(expected);
        fieldEvidence.expectedDigest = valueDigest(expected);
        fieldEvidence.comparisonVerified = stableJson(extracted.value) === stableJson(expected);
        if (!fieldEvidence.comparisonVerified) reasons.push("field:value:mismatch");
    }
    // Extraction itself is a valid field proof.  An expected value, when
    // provided by the certificate consumer, adds an exact comparison gate;
    // its absence is not a failure and is never silently treated as a match.
    fieldEvidence.verified = reasons.length === 0;
    return { evidence: fieldEvidence, reasons, verified: fieldEvidence.verified };
}

/**
 * Verify one source and, when supplied, one source-catalog record.
 *
 * `recordSnapshot` is an entity-level marker, not a JSON-pointer field.  It
 * is therefore never promoted to field proof, even when its entity bytes are
 * present and correctly hashed.
 */
function verifySourceArtifactProof(source, record = null, options = {}) {
    const repositoryRoot = path.resolve(options.repositoryRoot || path.resolve(__dirname, ".."));
    const evidence = record?.gameVersionEvidence || source?.gameVersionEvidence || null;
    const versionManifest = verifyVersionManifest({ repositoryRoot, source, evidence, options });
    let rawArtifact;
    if (record) {
        rawArtifact = readArtifact({
            repositoryRoot,
            source,
            requestedPath: record.path,
            explicitPath: options.rawArtifactPath || record.localPath || record.artifactPath,
            expectedDigest: record.sha256,
            expectedBytes: record.bytes,
            url: record.url,
            role: "rawArtifact",
            options
        });
    } else {
        rawArtifact = {
            evidence: {
                ...versionManifest.evidence,
                role: "rawArtifact",
                verified: versionManifest.evidence.artifactBytesVerified === true
            },
            reasons: [],
            verified: versionManifest.evidence.artifactBytesVerified === true
        };
    }
    const field = verifyRecordField({
        repositoryRoot,
        record,
        rawEvidence: rawArtifact.evidence,
        options
    });
    const reasons = unique([...versionManifest.reasons, ...rawArtifact.reasons, ...field.reasons]).sort();
    const result = {
        sourceId: source?.id || null,
        provider: source?.provider || null,
        revision: source?.revision || null,
        gameVersion: source?.gameVersion || evidence?.gameVersion || null,
        rawArtifactVerified: rawArtifact.evidence.verified === true,
        versionManifestVerified: versionManifest.verified === true,
        fieldProofVerified: field.verified === true,
        rawVerified: rawArtifact.evidence.verified === true,
        revisionVerified: rawArtifact.evidence.revisionVerified === true,
        gameVersionVerified: versionManifest.verified === true,
        fieldValue: field.evidence.extracted,
        fieldDigest: field.evidence.extractedDigest || null,
        reasons,
        evidence: {
            rawArtifact: rawArtifact.evidence,
            versionManifest: versionManifest.evidence,
            field: field.evidence
        }
    };
    // Keep the consumer-facing shape intentionally small.  The detailed
    // evidence above is for audit/reporting; certificate code should consume
    // this proof shape and never re-read claimed `extractedValue` metadata.
    result.artifactProof = {
        rawVerified: result.rawArtifactVerified,
        revisionVerified: result.revisionVerified,
        field: {
            verified: result.fieldProofVerified,
            field: field.evidence.pointer || null,
            value: field.evidence.extracted,
            digest: result.fieldDigest,
            rawIdentity: field.evidence.rawIdentity || null
        },
        version: {
            verified: result.versionManifestVerified,
            gameVersion: result.versionManifestVerified
                ? (versionManifest.evidence.explicitGameVersion || null)
                : null
        }
    };
    return result;
}

module.exports = {
    ACCEPTED_EVIDENCE_KINDS,
    DEFAULT_SAVED_SOURCE_ROOT,
    extractJsonPointer,
    extractManifestField,
    verifySourceArtifactProof,
    verifyVersionManifest
};
