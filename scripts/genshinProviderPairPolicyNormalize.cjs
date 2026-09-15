"use strict";

/**
 * Normalize the persisted dataset-by-provider policy into stable provider and
 * lineage identities.  This is intentionally a policy adapter: it does not
 * promote a candidate, infer a game version, or rewrite the source policy.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const repositoryRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const sourceFamilyRegistryPath = path.join(dataRoot, "v2", "source-family-registry.json");
const sourcePolicyPath = path.join(dataRoot, "v2", "provider-independence-policy.json");
const defaultOutputPath = path.join(dataRoot, "v2", "provider-pair-policy.json");
const GENERATOR_VERSION = "genshinProviderPairPolicyNormalize/1";
const CAPTURED_AT = "2026-08-25T00:00:00+09:00";

const STATUS_ENUM = Object.freeze([
    "reusable",
    "candidateApprovedOnly",
    "evidenceOnlyBlocked",
    "forbiddenCorrelated",
    "unknown",
    "searchExhausted"
]);

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function fileDigest(file) {
    const bytes = fs.readFileSync(file);
    return { sha256: sha256(bytes), bytes: bytes.length };
}

function relativePath(file) {
    return path.relative(repositoryRoot, file).replaceAll(path.sep, "/");
}

function sortNatural(left, right) {
    return String(left).localeCompare(String(right), "en", { numeric: true });
}

function countBy(values) {
    const counts = {};
    for (const value of values) {
        const key = String(value);
        counts[key] = (counts[key] || 0) + 1;
    }
    return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function resolveProviderName(name, registry) {
    if (registry.providers?.[name]) return name;
    const match = Object.entries(registry.providers || {}).find(([, provider]) => (provider.aliases || []).includes(name));
    return match ? match[0] : null;
}

function normalizeProvider(name, registry) {
    const resolvedName = resolveProviderName(name, registry);
    const provider = resolvedName ? registry.providers[resolvedName] : null;
    if (!provider) throw new Error(`provider is not registered: ${name}`);
    const family = registry.families?.[provider.familyId];
    if (!family) throw new Error(`provider family is not registered: ${provider.familyId}`);
    return {
        providerId: provider.providerId,
        name: provider.canonicalName,
        sourcePolicyName: resolvedName,
        familyId: provider.familyId,
        independenceGroup: family.independenceGroup,
        rootLineage: family.independenceGroup,
        lineageStatus: family.lineageStatus,
        independenceClass: family.independenceClass,
        lineage: family.lineage,
        risk: family.risk
    };
}

function normalizeGroup(rawGroup, family) {
    if (rawGroup === null || rawGroup === undefined) return null;
    if (!family) return rawGroup;
    if (rawGroup === family.independenceGroup) return family.independenceGroup;
    if ((family.legacyGroupAliases || []).includes(rawGroup)) return family.independenceGroup;
    return rawGroup;
}

function gateCheck(value, status, reason = null) {
    return { value: Boolean(value), status, reason };
}

function normalizePair(raw, registry) {
    const providerA = normalizeProvider(raw.providerA, registry);
    const providerB = normalizeProvider(raw.providerB, registry);
    const familyA = registry.families[providerA.familyId];
    const familyB = registry.families[providerB.familyId];
    const rawIndependenceGroupA = raw.independenceGroupA || null;
    const rawIndependenceGroupB = raw.independenceGroupB || null;
    const normalizedIndependenceGroupA = normalizeGroup(rawIndependenceGroupA, familyA);
    const normalizedIndependenceGroupB = normalizeGroup(rawIndependenceGroupB, familyB);
    const blockReasons = [...new Set(raw.blockReasons || [])].sort();
    const scope = Array.isArray(raw.scope) ? [...raw.scope] : [];
    const sourceOwnedLineage = providerA.lineageStatus === "declared"
        && providerB.lineageStatus === "declared";
    const sourceMissing = blockReasons.includes("sourceMissing");
    const gameVersionUnbound = blockReasons.includes("gameVersionUnbound");
    const providerNamesDistinct = providerA.providerId !== providerB.providerId;
    const independenceGroupsDistinct = normalizedIndependenceGroupA !== normalizedIndependenceGroupB;
    const gateChecks = {
        distinctProviderNames: gateCheck(providerNamesDistinct, providerNamesDistinct ? "pass" : "blocked", providerNamesDistinct ? null : "sameProvider"),
        distinctIndependenceGroups: gateCheck(independenceGroupsDistinct, independenceGroupsDistinct ? "pass" : "blocked", independenceGroupsDistinct ? null : "sharedIndependenceGroup"),
        sourceOwnedLineage: gateCheck(sourceOwnedLineage, sourceOwnedLineage ? "pass" : "blocked", sourceOwnedLineage ? null : "lineageNotProvenIndependent"),
        immutableRevisionAndFieldDigest: gateCheck(
            Boolean(raw.revisionAndRelease && raw.evidenceRefs?.length && !sourceMissing),
            sourceMissing ? "blocked" : "scopedEvidence",
            sourceMissing ? "sourceMissing" : null
        ),
        explicitGameVersionBinding: gateCheck(
            Boolean(raw.gameVersionBinding && !gameVersionUnbound),
            gameVersionUnbound ? "blocked" : "scopedEvidence",
            gameVersionUnbound ? "gameVersionUnbound" : null
        ),
        fieldLevelComparableClaims: gateCheck(
            Boolean(scope.length && !sourceMissing),
            sourceMissing ? "blocked" : "scopedEvidence",
            sourceMissing ? "sourceMissing" : null
        ),
        noUnresolvedGaps: gateCheck(blockReasons.length === 0, blockReasons.length ? "blocked" : "pass", blockReasons.length ? blockReasons.join(",") : null),
        approvedBatchScope: gateCheck(scope.length > 0 && raw.status !== "searchExhausted", scope.length ? "scoped" : "blocked", scope.length ? null : "scopeMissing")
    };
    // Pair policy is an allow-listing input, never evidence.  Strict reuse is
    // decided only by candidate×claim Eligibility Certificates built from
    // immutable source artifacts.  Keeping this false prevents a status or
    // prose-only policy edit from becoming an automatic-verification bypass.
    const policyReusable = raw.status === "reusable";
    const strictReusable = false;
    return {
        id: raw.id,
        dataset: raw.dataset,
        providerA,
        providerB,
        rawIndependenceGroups: {
            providerA: rawIndependenceGroupA,
            providerB: rawIndependenceGroupB
        },
        normalizedIndependenceGroups: {
            providerA: normalizedIndependenceGroupA,
            providerB: normalizedIndependenceGroupB
        },
        status: raw.status,
        blockReasons,
        appliesTo: raw.appliesTo || null,
        scope,
        evidenceRefs: clone(raw.evidenceRefs || []),
        upstreamLineage: clone(raw.upstreamLineage || null),
        revisionAndRelease: clone(raw.revisionAndRelease || null),
        gameVersionBinding: clone(raw.gameVersionBinding || null),
        invalidationConditions: clone(raw.invalidationConditions || []),
        searchScope: raw.searchScope || null,
        lastSearchedAt: raw.lastSearchedAt || null,
        providersExamined: clone(raw.providersExamined || []),
        reopenTrigger: raw.reopenTrigger || null,
        normalization: {
            providerNamesDistinct,
            providerIdsDistinct: providerNamesDistinct,
            independenceGroupsDistinct,
            sourceOwnedLineage,
            legacyGroupAliasesApplied: [
                ...(rawIndependenceGroupA !== normalizedIndependenceGroupA ? [rawIndependenceGroupA] : []),
                ...(rawIndependenceGroupB !== normalizedIndependenceGroupB ? [rawIndependenceGroupB] : [])
            ],
            gateChecks,
            policyReusable,
            strictReusable,
            canonicalPromotion: "forbiddenByCertificate"
        }
    };
}

function buildNormalizedPolicy({
    registryPath = sourceFamilyRegistryPath,
    policyPath = sourcePolicyPath
} = {}) {
    const registry = readJson(registryPath);
    const sourcePolicy = readJson(policyPath);
    const policies = (sourcePolicy.policies || [])
        .slice()
        .sort((left, right) => sortNatural(left.id, right.id));
    const pairs = policies.map((policy) => normalizePair(policy, registry));
    const registryDigest = fileDigest(registryPath);
    const policyDigest = fileDigest(policyPath);
    return {
        schemaVersion: 1,
        kind: "genshinProviderPairPolicy",
        generatedBy: {
            name: "genshinProviderPairPolicyNormalize.cjs",
            version: GENERATOR_VERSION,
            capturedAt: CAPTURED_AT
        },
        sourceFamilyRegistry: {
            path: relativePath(registryPath),
            schemaVersion: registry.schemaVersion,
            sha256: registryDigest.sha256,
            bytes: registryDigest.bytes
        },
        sourcePolicy: {
            path: relativePath(policyPath),
            policyVersion: sourcePolicy.policyVersion || null,
            schemaVersion: sourcePolicy.schemaVersion || null,
            sha256: policyDigest.sha256,
            bytes: policyDigest.bytes
        },
        statusEnum: [...STATUS_ENUM],
        strictGate: clone(sourcePolicy.principles?.strictGate || []),
        semantics: {
            sourcePolicyIsAuthoritative: true,
            normalizationOnly: true,
            revisionIsNotGameVersion: sourcePolicy.principles?.revisionIsNotGameVersion || null,
            candidateApprovalReuse: sourcePolicy.principles?.candidateApprovalReuse || null,
            claimScopedVersionTriangulation: sourcePolicy.principles?.claimScopedVersionTriangulation || null,
            aiSelfApproval: sourcePolicy.principles?.aiSelfApproval || null
        },
        pairs,
        summary: {
            pairCount: pairs.length,
            statusCounts: countBy(pairs.map((pair) => pair.status)),
            strictReusablePairs: pairs.filter((pair) => pair.normalization.strictReusable).map((pair) => pair.id),
            blockedPairs: pairs.filter((pair) => !pair.normalization.strictReusable).map((pair) => pair.id),
            distinctProviderPairs: pairs.filter((pair) => pair.normalization.providerNamesDistinct).length,
            distinctIndependenceGroupPairs: pairs.filter((pair) => pair.normalization.independenceGroupsDistinct).length
        }
    };
}

function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeNormalizedPolicy(options = {}) {
    const outputPath = options.outputPath || defaultOutputPath;
    const normalized = buildNormalizedPolicy(options);
    writeJson(outputPath, normalized);
    return { normalized, outputPath };
}

if (require.main === module) {
    const result = writeNormalizedPolicy();
    console.log(JSON.stringify({
        outputPath: relativePath(result.outputPath),
        pairs: result.normalized.summary.pairCount,
        statusCounts: result.normalized.summary.statusCounts,
        strictReusablePairs: result.normalized.summary.strictReusablePairs
    }, null, 2));
}

module.exports = {
    STATUS_ENUM,
    GENERATOR_VERSION,
    CAPTURED_AT,
    defaultOutputPath,
    sourceFamilyRegistryPath,
    sourcePolicyPath,
    buildNormalizedPolicy,
    resolveProviderName,
    normalizeGroup,
    normalizeProvider,
    normalizePair,
    writeNormalizedPolicy
};
