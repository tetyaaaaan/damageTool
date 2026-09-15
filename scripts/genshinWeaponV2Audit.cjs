"use strict";

/** Audit the deterministic weapon v2 evidence/spec output. */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
    buildDataset,
    defaultOutputRoot,
    registryIndex,
    stableJson,
    RUNTIME_NAMESPACE,
    runtimeModifierId
} = (() => {
    const generator = require("./genshinWeaponV2Generate.cjs");
    // defaultOutputRoot is intentionally not part of the public generator API;
    // derive it here so this script remains usable from another checkout.
    return {
        ...generator,
        defaultOutputRoot: path.join(path.resolve(__dirname, ".."), "games", "genshin", "data", "v2", "weapons")
    };
})();

const repositoryRoot = path.resolve(__dirname, "..");
const defaultDataRoot = path.join(repositoryRoot, "games", "genshin", "data");

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function digest(text) {
    return crypto.createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

function increment(map, key) {
    const name = String(key || "unknown");
    map[name] = (map[name] || 0) + 1;
}

function duplicateValues(values) {
    const occurrences = new Map();
    (values || []).forEach((value) => occurrences.set(value, (occurrences.get(value) || 0) + 1));
    return [...occurrences.entries()].filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
}

function legacyDuplicateCandidates(modifiers) {
    const candidates = [];
    Object.entries(modifiers).forEach(([weaponId, entry]) => {
        const byDescription = new Map();
        (entry.modifiers || []).forEach((modifier) => {
            if (!modifier.sourceText) return;
            const key = `${modifier.category}|${modifier.sourceText}`;
            if (!byDescription.has(key)) byDescription.set(key, []);
            byDescription.get(key).push(modifier.id || "");
        });
        byDescription.forEach((modifierIds, key) => {
            if (modifierIds.length > 1) candidates.push({ weaponId, key, modifierIds });
        });
    });
    return candidates;
}

function loadGenerated({ dataRoot = defaultDataRoot, outputRoot = defaultOutputRoot } = {}) {
    const sourcePath = path.join(outputRoot, "source-records.json");
    const specPath = path.join(outputRoot, "spec-candidates.json");
    if (fs.existsSync(sourcePath) && fs.existsSync(specPath)) {
        const indexPath = path.join(outputRoot, "index.json");
        return {
            sourceRecords: readJson(sourcePath),
            specs: readJson(specPath),
            summary: fs.existsSync(indexPath) ? readJson(indexPath).summary || null : null,
            generatedFromDisk: true
        };
    }
    return { ...buildDataset({ dataRoot }), generatedFromDisk: false };
}

function auditWeaponV2({ dataRoot = defaultDataRoot, outputRoot = defaultOutputRoot } = {}) {
    const weapons = readJson(path.join(dataRoot, "weapons.json"));
    const effects = readJson(path.join(dataRoot, "weapon-effects.json"));
    const modifiers = readJson(path.join(dataRoot, "calc", "weapon-modifiers.json"));
    const registry = readJson(path.join(dataRoot, "calc", "weapon-effect-registry.json"));
    const generated = loadGenerated({ dataRoot, outputRoot });
    const sourceRecords = generated.sourceRecords || {};
    const specs = generated.specs || {};
    const expectedWeaponIds = Object.keys(modifiers).sort();
    const expectedModifierById = new Map();
    const expectedWeaponByModifierId = new Map();
    expectedWeaponIds.forEach((weaponId) => {
        (modifiers[weaponId].modifiers || []).forEach((modifier) => {
            const id = String(modifier.id || "");
            expectedModifierById.set(id, modifier);
            expectedWeaponByModifierId.set(id, String(weaponId));
        });
    });
    const expectedModifierIds = [...expectedModifierById.keys()];
    const expectedRuntimeByModifierId = new Map(expectedModifierIds.map((id) => [id, runtimeModifierId(expectedWeaponByModifierId.get(id), id)]));
    const expectedRuntimeIds = [...expectedRuntimeByModifierId.values()];
    const expectedRuntimeSet = new Set(expectedRuntimeIds);
    const generatedIds = Object.keys(specs).sort();
    const expectedSet = new Set(expectedModifierIds);
    const generatedSet = new Set(generatedIds);
    const missingModifierIds = expectedModifierIds.filter((id) => !generatedSet.has(id));
    const unexpectedModifierIds = generatedIds.filter((id) => !expectedSet.has(id));
    const specIdDuplicates = duplicateValues(Object.keys(specs));
    const sourceIdDuplicates = duplicateValues(Object.keys(sourceRecords));
    const missingSourceRefs = [];
    const invalidSourceRecords = [];
    const malformedSpecs = [];
    const runtimeMissingModifierIds = [];
    const runtimeIdMismatches = [];
    const runtimeNamespaceMismatches = [];
    const runtimeDispositionMismatches = [];
    const missingDestinations = [];
    const destinationMismatches = [];
    const missingRuntimeDestinations = [];
    const runtimeDestinationMismatches = [];
    const missingSupersessionIds = [];
    const supersessionMismatches = [];
    const missingRuntimeSupersessionIds = [];
    const runtimeSupersessionMismatches = [];
    const missingUidHandlingIds = [];
    const uidHandlingMismatches = [];
    const missingUidHandlingClaims = [];
    const uidHandlingClaimMismatches = [];
    const missingRuntimeContractClaims = [];
    const runtimeContractClaimMismatches = [];
    const runtimeIdsSeen = [];
    const unverifiedSpecIds = [];
    const claimStatusCounts = {};
    const verificationStatusCounts = {};
    const sourceAgreementCounts = {};
    const runtimeStatusCounts = {};
    const sourceKindCounts = {};
    const missingValueContractIds = [];
    const missingTargetContractIds = [];
    const missingEffectSourceIds = expectedWeaponIds.filter((id) => !effects[id]);
    const registryByModifier = registryIndex(registry);
    const registryModifierIds = [];
    const inputDigestMismatches = [];
    const errors = [];

    // A materialized output must correspond to the exact input bytes used by
    // the deterministic transform.  This catches stale v2 files when a legacy
    // registry or modifier audit is edited without rerunning the generator.
    (generated.summary?.generatedFrom || []).forEach((input) => {
        const relative = String(input.path || "").replace(/^games\/genshin\/data\//, "");
        const absolute = path.join(dataRoot, relative);
        if (!fs.existsSync(absolute)) {
            inputDigestMismatches.push({ path: input.path, reason: "missing" });
            return;
        }
        const actual = crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
        if (actual !== input.integrity?.digest) inputDigestMismatches.push({ path: input.path, reason: "digestMismatch" });
    });

    Object.entries(sourceRecords).forEach(([id, source]) => {
        increment(sourceKindCounts, source.kind);
        const legacyLocator = Boolean(source.locator?.dataset && source.locator?.record);
        const externalLocator = source.kind === "externalPrimaryDataset"
            && Boolean(source.locator?.url && source.locator?.identifier)
            && source.strictGameVersionBinding === true
            && Boolean(source.gameVersion);
        if (!source.id || source.id !== id || (!legacyLocator && !externalLocator) || !source.integrity?.digest) {
            invalidSourceRecords.push(id);
            return;
        }
        if (source.integrity.algorithm !== "sha256" || source.integrity.digest !== digest(source.text)) {
            invalidSourceRecords.push(id);
        }
        if (!source.gameVersion) {
            // Counted below; this is expected for the legacy source layer.
        }
    });

    Object.entries(registry.weapons || {}).forEach(([weaponId, definition]) => {
        (definition.groups || []).forEach((group) => (group.modifierIds || []).forEach((modifierId) => registryModifierIds.push(`${weaponId}:${modifierId}`)));
    });

    Object.entries(specs).forEach(([specId, spec]) => {
        increment(verificationStatusCounts, spec.verification?.status);
        increment(sourceAgreementCounts, spec.verification?.sourceAgreement);
        increment(runtimeStatusCounts, spec.runtime?.status);
        (spec.verification?.claims ? Object.values(spec.verification.claims) : []).forEach((claim) => increment(claimStatusCounts, claim.status));
        if (spec.verification?.status !== "verified") unverifiedSpecIds.push(specId);
        (spec.sourceRefs || []).forEach((ref) => {
            if (!sourceRecords[ref]) missingSourceRefs.push({ specId, sourceRef: ref });
        });
        if (!spec.id || !spec.entity || spec.entity.kind !== "weapon" || !spec.entity.id || !spec.entity.component
            || !spec.sourceRefs?.length || !spec.interpretation || !spec.effect?.kind
            || !Array.isArray(spec.effect.targets) || !spec.effect.targets.length || !spec.effect.activation
            || !spec.verification || !spec.verification.claims || !spec.runtime
            || !Array.isArray(spec.runtime.modifierIds) || !("generator" in spec.runtime)) {
            malformedSpecs.push(specId);
        }
        const modifier = expectedModifierById.get(specId);
        const weaponId = expectedWeaponByModifierId.get(specId);
        const expectedRuntimeId = expectedRuntimeByModifierId.get(specId);
        const expectedDestination = weaponId ? {
            dataset: "weaponModifiers",
            entityId: weaponId,
            collection: "modifiers"
        } : null;
        if (!spec.destination) {
            missingDestinations.push(specId);
        } else if (!expectedDestination || stableJson(spec.destination) !== stableJson(expectedDestination)) {
            destinationMismatches.push({ specId, expected: expectedDestination, actual: spec.destination });
        }
        if (!spec.runtime?.destination) {
            missingRuntimeDestinations.push(specId);
        } else if (!expectedDestination || stableJson(spec.runtime.destination) !== stableJson(expectedDestination)) {
            runtimeDestinationMismatches.push({ specId, expected: expectedDestination, actual: spec.runtime.destination });
        }
        if (!Array.isArray(spec.supersedesLegacyModifierIds) || !spec.supersedesLegacyModifierIds.length) {
            missingSupersessionIds.push(specId);
        } else if (stableJson(spec.supersedesLegacyModifierIds) !== stableJson([specId])) {
            supersessionMismatches.push({ specId, expected: [specId], actual: spec.supersedesLegacyModifierIds });
        }
        if (!Array.isArray(spec.runtime?.supersedesLegacyModifierIds) || !spec.runtime.supersedesLegacyModifierIds.length) {
            missingRuntimeSupersessionIds.push(specId);
        } else if (stableJson(spec.runtime.supersedesLegacyModifierIds) !== stableJson([specId])) {
            runtimeSupersessionMismatches.push({ specId, expected: [specId], actual: spec.runtime.supersedesLegacyModifierIds });
        }
        if (spec.runtime?.modifierIds?.length === 1) {
            runtimeIdsSeen.push(spec.runtime.modifierIds[0]);
        }
        if (spec.runtime?.modifierIds?.length !== 1 || !expectedRuntimeSet.has(spec.runtime.modifierIds[0])) {
            runtimeMissingModifierIds.push(specId);
        }
        if (expectedRuntimeId && spec.runtime?.modifierIds?.length === 1 && spec.runtime.modifierIds[0] !== expectedRuntimeId) {
            runtimeIdMismatches.push({ specId, expected: expectedRuntimeId, actual: spec.runtime.modifierIds[0] });
        }
        if (spec.runtime?.modifierIds?.includes(specId) || (spec.runtime?.modifierIds || []).some((id) => !String(id).startsWith(`${RUNTIME_NAMESPACE}:`))) {
            runtimeNamespaceMismatches.push({ specId, actual: spec.runtime?.modifierIds || [] });
        }
        const expectedRuntimeStatus = spec.verification?.status === "verified" && spec.verification?.canonicalEligibility === true
            ? "canonical"
            : modifier?.calculationSupport === "displayOnly" ? "displayOnly" : "candidate";
        if (expectedRuntimeStatus && spec.runtime?.status !== expectedRuntimeStatus) {
            runtimeDispositionMismatches.push({ specId, expected: expectedRuntimeStatus, actual: spec.runtime?.status });
        }
        const expectedUidHandling = modifier?.uidHandling;
        const actualUidHandling = spec.effect?.activation?.uidHandling;
        if (expectedUidHandling === undefined) {
            if (actualUidHandling !== undefined) missingUidHandlingIds.push(specId);
        } else if (stableJson(actualUidHandling) !== stableJson(expectedUidHandling)) {
            uidHandlingMismatches.push({ specId, expected: expectedUidHandling, actual: actualUidHandling });
        }
        const uidHandlingClaim = spec.verification?.claims?.["effect.activation.uidHandling"];
        if (!uidHandlingClaim) {
            missingUidHandlingClaims.push(specId);
        } else if (!["needsReview", "verified"].includes(uidHandlingClaim.status)) {
            uidHandlingClaimMismatches.push({ specId, status: uidHandlingClaim.status });
        }
        [
            ["destination", spec.verification?.claims?.destination],
            ["supersedesLegacyModifierIds", spec.verification?.claims?.supersedesLegacyModifierIds],
            ["runtime.modifierIds", spec.verification?.claims?.["runtime.modifierIds"]]
        ].forEach(([claimName, fieldClaim]) => {
            if (!fieldClaim) {
                missingRuntimeContractClaims.push({ specId, claim: claimName });
            } else if (!["needsReview", "verified"].includes(fieldClaim.status)) {
                runtimeContractClaimMismatches.push({ specId, claim: claimName, status: fieldClaim.status });
            }
        });
        const sourceValue = spec.effect?.value;
        if (modifier) {
            const explicitValue = [
                "valueByRefinement", "value", "valueByRefinementPerStack",
                "valueByRefinementPerConsumedStack"
            ].map((field) => modifier[field]).find((value) => value !== undefined && value !== null);
            if (explicitValue === undefined || explicitValue === null) missingValueContractIds.push(specId);
            if (!Array.isArray(modifier.applyTo) || !modifier.applyTo.length) missingTargetContractIds.push(specId);
            // Guard against accidental text inference or mutation during generation.
            if (JSON.stringify(spec.effect.targets) !== JSON.stringify(modifier.applyTo)) {
                errors.push(`${specId}: effect.targets differs from legacy applyTo`);
            }
            if (explicitValue !== undefined && explicitValue !== null && JSON.stringify(sourceValue) !== JSON.stringify(explicitValue)) {
                errors.push(`${specId}: effect.value differs from explicit legacy value`);
            }
        }
    });

    const duplicateCandidates = legacyDuplicateCandidates(modifiers);
    const registryCoverageMissing = registryModifierIds.length
        ? registryModifierIds.filter((key) => !expectedSet.has(key.split(":").slice(1).join(":"))).length
        : 0;
    const sourceMissingGameVersion = Object.values(sourceRecords).filter((source) => !source.gameVersion).map((source) => source.id);
    const runtimeConnectedSpecIds = Object.entries(specs).filter(([, spec]) => {
        return spec.runtime?.modifierIds?.length === 1 && expectedRuntimeSet.has(spec.runtime.modifierIds[0]);
    }).map(([id]) => id);
    const generatedWeaponIds = [...new Set(Object.values(specs).map((spec) => spec.entity?.id).filter(Boolean))].sort();
    const missingWeaponIds = expectedWeaponIds.filter((id) => !generatedWeaponIds.includes(id));

    const runtimeIdDuplicates = duplicateValues(runtimeIdsSeen);
    const runtimeContractClaims = Object.values(specs).flatMap((spec) => [
        spec.verification?.claims?.destination,
        spec.verification?.claims?.supersedesLegacyModifierIds,
        spec.verification?.claims?.["runtime.modifierIds"]
    ]).filter(Boolean);
    const uidHandlingClaims = Object.values(specs).map((spec) => spec.verification?.claims?.["effect.activation.uidHandling"]).filter(Boolean);
    if (missingModifierIds.length || unexpectedModifierIds.length || missingSourceRefs.length || invalidSourceRecords.length || malformedSpecs.length || runtimeMissingModifierIds.length || runtimeIdMismatches.length || runtimeNamespaceMismatches.length || runtimeDispositionMismatches.length || missingDestinations.length || destinationMismatches.length || missingRuntimeDestinations.length || runtimeDestinationMismatches.length || missingSupersessionIds.length || supersessionMismatches.length || missingRuntimeSupersessionIds.length || runtimeSupersessionMismatches.length || missingRuntimeContractClaims.length || runtimeContractClaimMismatches.length || missingUidHandlingIds.length || uidHandlingMismatches.length || missingUidHandlingClaims.length || uidHandlingClaimMismatches.length || runtimeIdDuplicates.length || inputDigestMismatches.length) {
        errors.push("weapon v2 coverage/contract failure");
    }

    const summary = {
        schemaVersion: 2,
        status: errors.length ? "failed" : "passed",
        weapons: expectedWeaponIds.length,
        modifiers: expectedModifierIds.length,
        generatedWeapons: generatedWeaponIds.length,
        generatedModifiers: generatedIds.length,
        sourceRecords: Object.keys(sourceRecords).length,
        specs: Object.keys(specs).length,
        coverage: {
            weapons: expectedWeaponIds.length ? generatedWeaponIds.length / expectedWeaponIds.length : 1,
            modifiers: expectedModifierIds.length ? generatedIds.filter((id) => expectedSet.has(id)).length / expectedModifierIds.length : 1
        },
        verification: {
            byStatus: verificationStatusCounts,
            bySourceAgreement: sourceAgreementCounts,
            claimStatuses: claimStatusCounts,
            unverified: unverifiedSpecIds.length,
            verified: verificationStatusCounts.verified || 0,
            sourceAgreementSingleSource: sourceAgreementCounts.singleSource || 0,
            gameVersionMissing: sourceMissingGameVersion.length
        },
        missing: {
            weapons: missingWeaponIds,
            modifiers: missingModifierIds,
            unexpectedModifiers: unexpectedModifierIds,
            sourceRefs: missingSourceRefs,
            sourceRecords: invalidSourceRecords,
            inputDigests: inputDigestMismatches,
            effectSources: missingEffectSourceIds,
            valueContracts: missingValueContractIds,
            targetContracts: missingTargetContractIds,
            destinations: missingDestinations,
            destinationMismatches,
            runtimeDestinations: missingRuntimeDestinations,
            runtimeDestinationMismatches,
            supersessionIds: missingSupersessionIds,
            supersessionMismatches,
            runtimeSupersessionIds: missingRuntimeSupersessionIds,
            runtimeSupersessionMismatches,
            runtimeContractClaims: missingRuntimeContractClaims,
            runtimeContractClaimMismatches,
            uidHandling: missingUidHandlingIds,
            uidHandlingMismatches,
            uidHandlingClaims: missingUidHandlingClaims,
            uidHandlingClaimMismatches,
            runtimeIds: runtimeMissingModifierIds,
            runtimeIdMismatches,
            runtimeNamespaceMismatches,
            runtimeDispositionMismatches,
            registryModifiers: registryModifierIds.filter((key) => !expectedSet.has(key.split(":").slice(1).join(":")))
        },
        duplicates: {
            specIds: specIdDuplicates,
            sourceIds: sourceIdDuplicates,
            legacyCandidateGroups: duplicateCandidates.length,
            legacyCandidates: duplicateCandidates
        },
        runtime: {
            byStatus: runtimeStatusCounts,
            connected: runtimeConnectedSpecIds.length,
            disconnected: runtimeMissingModifierIds.length,
            canonical: runtimeStatusCounts.canonical || 0,
            candidate: runtimeStatusCounts.candidate || 0,
            displayOnly: runtimeStatusCounts.displayOnly || 0,
            blocked: runtimeStatusCounts.blocked || 0,
            connectedSpecIds: runtimeConnectedSpecIds,
            missingModifierIds: runtimeMissingModifierIds,
            namespace: RUNTIME_NAMESPACE,
            idDuplicates: runtimeIdDuplicates,
            idMismatches: runtimeIdMismatches,
            namespaceMismatches: runtimeNamespaceMismatches,
            dispositionMismatches: runtimeDispositionMismatches,
            route: {
                expected: expectedModifierIds.length,
                connected: Object.keys(specs).length - missingDestinations.length - destinationMismatches.length,
                missing: missingDestinations,
                mismatches: destinationMismatches,
                runtimeMirrorConnected: Object.keys(specs).length - missingRuntimeDestinations.length - runtimeDestinationMismatches.length,
                runtimeMirrorMissing: missingRuntimeDestinations,
                runtimeMirrorMismatches: runtimeDestinationMismatches
            },
            supersession: {
                expected: expectedModifierIds.length,
                connected: Object.keys(specs).length - missingSupersessionIds.length - supersessionMismatches.length,
                missing: missingSupersessionIds,
                mismatches: supersessionMismatches,
                runtimeMirrorConnected: Object.keys(specs).length - missingRuntimeSupersessionIds.length - runtimeSupersessionMismatches.length,
                runtimeMirrorMissing: missingRuntimeSupersessionIds,
                runtimeMirrorMismatches: runtimeSupersessionMismatches
            },
            contractClaims: {
                expected: expectedModifierIds.length * 3,
                needsReview: runtimeContractClaims.filter((claim) => claim.status === "needsReview").length,
                verified: runtimeContractClaims.filter((claim) => claim.status === "verified").length,
                missing: missingRuntimeContractClaims,
                mismatches: runtimeContractClaimMismatches
            },
            uidHandling: {
                expected: expectedModifierIds.length,
                copied: expectedModifierIds.length - missingUidHandlingIds.length - uidHandlingMismatches.length,
                claimNeedsReview: uidHandlingClaims.filter((claim) => claim.status === "needsReview").length,
                claimVerified: uidHandlingClaims.filter((claim) => claim.status === "verified").length,
                missing: missingUidHandlingIds,
                mismatches: uidHandlingMismatches,
                missingClaims: missingUidHandlingClaims,
                claimMismatches: uidHandlingClaimMismatches
            }
        },
        sourceKinds: sourceKindCounts,
        legacyAudits: generated.summary?.legacyAudits || [],
        generatedFromDisk: generated.generatedFromDisk
    };
    return {
        schemaVersion: 2,
        status: summary.status,
        summary,
        errors,
        missing: summary.missing,
        duplicates: summary.duplicates,
        unverified: {
            count: unverifiedSpecIds.length,
            specIds: unverifiedSpecIds
        },
        runtime: summary.runtime,
        malformedSpecs
    };
}

function writeAudit(audit = auditWeaponV2(), { outputRoot = defaultOutputRoot } = {}) {
    fs.mkdirSync(outputRoot, { recursive: true });
    fs.writeFileSync(path.join(outputRoot, "audit.json"), `${JSON.stringify(audit, null, 2)}\n`, "utf8");
    return audit;
}

if (require.main === module) {
    const dataRoot = process.env.GENSHIN_DATA_ROOT || defaultDataRoot;
    const outputRoot = process.env.GENSHIN_WEAPON_V2_ROOT || defaultOutputRoot;
    process.stdout.write(`${JSON.stringify(writeAudit(auditWeaponV2({ dataRoot, outputRoot }), { outputRoot }), null, 2)}\n`);
}

module.exports = {
    auditWeaponV2,
    duplicateValues,
    legacyDuplicateCandidates,
    loadGenerated,
    writeAudit
};
