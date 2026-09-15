"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const generator = require("./genshinArtifactV2Generate.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultDataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultOutputRoot = path.join(defaultDataRoot, "v2", "artifacts");

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function increment(summary, key) {
    if (key === undefined || key === null) return;
    summary[key] = (summary[key] || 0) + 1;
}

function duplicateValues(values) {
    const counts = new Map();
    values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    return [...counts.entries()].filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
}

function expectedRecords(modifiers) {
    const records = [];
    Object.entries(modifiers).forEach(([setId, entry]) => {
        generator.PIECE_SLOTS.forEach((slot) => {
            (entry?.[slot] || []).forEach((modifier, modifierIndex) => {
                records.push({
                    setId,
                    slot,
                    pieceCount: generator.PIECE_COUNTS[slot],
                    modifier,
                    modifierIndex,
                    id: generator.legacyCandidateId(setId, slot, modifier, modifierIndex),
                    legacyModifierId: generator.legacyModifierId(modifier, modifierIndex),
                    runtimeModifierId: generator.artifactRuntimeModifierId(setId, slot, modifier, modifierIndex),
                    destination: generator.artifactRuntimeDestination(setId, slot)
                });
            });
        });
    });
    return records;
}

function loadGenerated({ dataRoot = defaultDataRoot, outputRoot = defaultOutputRoot } = {}) {
    const sourcePath = path.join(outputRoot, "source-records.json");
    const specPath = path.join(outputRoot, "spec-candidates.json");
    if (fs.existsSync(sourcePath) && fs.existsSync(specPath)) {
        const indexPath = path.join(outputRoot, "index.json");
        const gapReviewPath = path.join(outputRoot, "gap-review.json");
        return {
            sourceRecords: readJson(sourcePath),
            specs: readJson(specPath),
            gapReview: fs.existsSync(gapReviewPath) ? readJson(gapReviewPath) : null,
            packages: Object.fromEntries(fs.existsSync(path.join(outputRoot, "packages"))
                ? fs.readdirSync(path.join(outputRoot, "packages"), { withFileTypes: true })
                    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
                    .map((entry) => [entry.name.replace(/\.json$/, ""), readJson(path.join(outputRoot, "packages", entry.name))])
                : []),
            summary: fs.existsSync(indexPath) ? readJson(indexPath).summary || null : null,
            generatedFromDisk: true
        };
    }
    return { ...generator.buildDataset({ dataRoot }), generatedFromDisk: false };
}

function sourceDigest(file) {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function auditArtifactV2({ dataRoot = defaultDataRoot, outputRoot = defaultOutputRoot } = {}) {
    const sets = readJson(path.join(dataRoot, "artifact-sets.json"));
    const effects = readJson(path.join(dataRoot, "artifact-set-effects.json"));
    const modifiers = readJson(path.join(dataRoot, "calc", "artifact-set-modifiers.json"));
    const expectedSetIds = Object.keys(sets).sort();
    const expected = expectedRecords(modifiers);
    const expectedIds = expected.map((record) => record.id);
    const expectedSet = new Set(expectedIds);
    const expectedRuntimeIds = expected.map((record) => record.runtimeModifierId);
    const duplicateRuntimeIds = duplicateValues(expectedRuntimeIds);
    const generated = loadGenerated({ dataRoot, outputRoot });
    const sourceRecords = generated.sourceRecords || {};
    const specs = generated.specs || {};
    const packages = generated.packages || {};
    const generatedIds = Object.keys(specs).sort();
    const generatedSetIds = Object.keys(packages).sort();
    const errors = [];
    const missingModifierIds = expectedIds.filter((id) => !Object.prototype.hasOwnProperty.call(specs, id));
    const unexpectedModifierIds = generatedIds.filter((id) => !expectedSet.has(id));
    const missingSetIds = expectedSetIds.filter((id) => !Object.prototype.hasOwnProperty.call(packages, id));
    const unexpectedSetIds = generatedSetIds.filter((id) => !expectedSetIds.includes(id));
    const missingSourceRefs = [];
    const invalidSourceRecords = [];
    const malformedSpecs = [];
    const runtimeMissingModifierIds = [];
    const runtimeIdMismatches = [];
    const runtimeRouteMismatches = [];
    const supersessionMismatches = [];
    const runtimeClaimMismatches = [];
    if (duplicateRuntimeIds.length) errors.push("artifact v2 runtime modifier ID collision");
    const unverifiedSpecIds = [];
    const missingValueContractIds = [];
    const missingTargetContractIds = [];
    const valueMismatches = [];
    const targetMismatches = [];
    const pieceMismatches = [];
    const durationMismatches = [];
    const stackMismatches = [];
    const policyMismatches = [];
    const inputDigestMismatches = [];
    const gapReviewIssues = [];
    const verificationStatusCounts = {};
    const sourceAgreementCounts = {};
    const claimStatusCounts = {};
    const runtimeStatusCounts = {};
    const inputPolicyCounts = {};
    const automaticDetectabilityCounts = {};
    const sourceKindCounts = {};

    Object.entries(sourceRecords).forEach(([id, source]) => {
        increment(sourceKindCounts, source.kind);
        if (!source.id || source.id !== id || !source.locator?.dataset || !source.locator?.record || !source.integrity?.digest) {
            invalidSourceRecords.push(id);
            return;
        }
        if (source.integrity.algorithm !== "sha256" || source.integrity.digest !== generator.digest(source.text)) invalidSourceRecords.push(id);
        if (source.gameVersion !== null) invalidSourceRecords.push(id);
    });

    Object.entries(specs).forEach(([id, spec]) => {
        increment(verificationStatusCounts, spec.verification?.status);
        increment(sourceAgreementCounts, spec.verification?.sourceAgreement);
        increment(runtimeStatusCounts, spec.runtime?.status);
        increment(inputPolicyCounts, spec.effect?.inputPolicy?.policy);
        increment(automaticDetectabilityCounts, spec.effect?.automaticDetectability?.status);
        Object.values(spec.verification?.claims || {}).forEach((claim) => increment(claimStatusCounts, claim.status));
        // A needsReview candidate is intentionally unverified.  Keep this
        // count distinct from the contract check below so coverage reports
        // make the review gate visible (122 candidates, 0 verified).
        if (spec.verification?.status !== "verified") unverifiedSpecIds.push(id);
        (spec.sourceRefs || []).forEach((ref) => {
            if (!sourceRecords[ref]) missingSourceRefs.push({ specId: id, sourceRef: ref });
        });
        if (!spec.id || spec.id !== id || spec.entity?.kind !== "artifactSet" || !spec.entity?.id
            || spec.entity?.component !== "modifier" || !spec.sourceRefs?.length
            || !spec.interpretation || !spec.effect?.kind || !Array.isArray(spec.effect.targets)
            || !spec.effect.targets.length || !spec.effect.activation || !spec.verification
            || !spec.verification.claims || !spec.runtime || !Array.isArray(spec.runtime.modifierIds)
            || !("generator" in spec.runtime) || !spec.destination
            || !Array.isArray(spec.supersedesLegacyModifierIds)) {
            malformedSpecs.push(id);
        }
        if (spec.runtime?.status !== "candidate" || spec.runtime?.modifierIds?.length !== 1) runtimeMissingModifierIds.push(id);
        if (spec.runtime?.status === "canonical") errors.push(`${id}: canonical runtime is forbidden for migration candidates`);
    });

    const byId = new Map(expected.map((record) => [record.id, record]));
    Object.entries(specs).forEach(([id, spec]) => {
        const expectedRecord = byId.get(id);
        if (!expectedRecord) return;
        const modifier = expectedRecord.modifier;
        const explicitValueField = generator.explicitValueField(modifier);
        if (!explicitValueField) missingValueContractIds.push(id);
        if (!Array.isArray(modifier.applyTo) || !modifier.applyTo.length) missingTargetContractIds.push(id);
        if (JSON.stringify(spec.effect?.targets) !== JSON.stringify(modifier.applyTo)) targetMismatches.push(id);
        if (explicitValueField && JSON.stringify(spec.effect?.value) !== JSON.stringify(modifier[explicitValueField])) valueMismatches.push(id);
        if (spec.effect?.pieceSlot !== expectedRecord.slot || spec.effect?.pieceCount !== expectedRecord.pieceCount) pieceMismatches.push(id);
        if (modifier.duration !== undefined && JSON.stringify(spec.effect?.duration) !== JSON.stringify(modifier.duration)) durationMismatches.push(id);
        if (modifier.stack !== undefined && JSON.stringify(spec.effect?.stack) !== JSON.stringify(modifier.stack)) stackMismatches.push(id);
        if (spec.effect?.inputPolicy?.policy !== generator.classifyInputPolicy(modifier)) policyMismatches.push(id);
        if (spec.effect?.automaticDetectability?.policy !== generator.classifyInputPolicy(modifier)) policyMismatches.push(id);
        if (spec.effect?.legacyModifierId !== expectedRecord.legacyModifierId) supersessionMismatches.push(`${id}:effect.legacyModifierId`);
        if (spec.runtime?.modifierIds?.[0] !== expectedRecord.runtimeModifierId) runtimeIdMismatches.push(id);
        if (JSON.stringify(spec.destination) !== JSON.stringify(expectedRecord.destination)
            || JSON.stringify(spec.runtime?.destination) !== JSON.stringify(expectedRecord.destination)) runtimeRouteMismatches.push(id);
        const expectedSupersession = [expectedRecord.legacyModifierId];
        if (JSON.stringify(spec.supersedesLegacyModifierIds) !== JSON.stringify(expectedSupersession)
            || JSON.stringify(spec.runtime?.supersedesLegacyModifierIds) !== JSON.stringify(expectedSupersession)) supersessionMismatches.push(id);
        ["destination", "runtime.modifierIds", "supersedesLegacyModifierIds"].forEach((claimName) => {
            const claim = spec.verification?.claims?.[claimName];
            if (claim?.status !== "needsReview" || !Array.isArray(claim.sourceRefs) || !claim.sourceRefs.length
                || claim.sourceRefs.some((ref) => !sourceRecords[ref])) runtimeClaimMismatches.push(`${id}:${claimName}`);
        });
    });

    const structuredModifiersMissing = expectedSetIds.filter((setId) => expected.filter((record) => record.setId === setId).length === 0);
    const blockedMissingReasons = [];
    Object.entries(packages).forEach(([setId, pkg]) => {
        if (!pkg.entity || pkg.entity.kind !== "artifactSet" || String(pkg.entity.id) !== String(setId)) malformedSpecs.push(`package:${setId}`);
        (pkg.sourceRefs || []).forEach((ref) => { if (!sourceRecords[ref]) missingSourceRefs.push({ packageId: setId, sourceRef: ref }); });
        if (structuredModifiersMissing.includes(setId)) {
            if (pkg.runtime?.status !== "blocked") blockedMissingReasons.push({ setId, reason: "status" });
            if (!(pkg.runtime?.blockedReasons || []).includes("structuredModifiersMissing")) blockedMissingReasons.push({ setId, reason: "structuredModifiersMissing" });
        }
    });

    // The seven unstructured packages and the single missing scalar value are
    // reviewed as evidence records.  This check deliberately validates only
    // raw-field presence, source pointers, and package wiring; it never
    // interprets localized effect prose or synthesizes a value.
    const gapReview = generated.gapReview || {};
    const reviewedMissing = Array.isArray(gapReview.structuredModifierMissing)
        ? gapReview.structuredModifierMissing : [];
    const reviewedBySet = new Map(reviewedMissing.map((entry) => [String(entry?.setId), entry]));
    const gapStatuses = new Set(generator.GAP_REVIEW_STATUSES || ["noEffect", "displayOnly", "unstructured", "invalid", "needsReview"]);
    const expectedGapIds = new Set(structuredModifiersMissing.map(String));
    if (gapReview.policy?.canonical !== 0 || gapReview.summary?.canonical !== 0) gapReviewIssues.push("gapReview:canonicalMustBeZero");
    reviewedMissing.forEach((entry) => {
        const setId = String(entry?.setId || "");
        if (!expectedGapIds.has(setId)) gapReviewIssues.push(`gapReview:unexpectedSet:${setId}`);
        if (!gapStatuses.has(entry?.status)) gapReviewIssues.push(`gapReview:invalidStatus:${setId}`);
        if (entry?.canonical !== 0) gapReviewIssues.push(`gapReview:canonical:${setId}`);
        (entry?.sourceRefs || []).forEach((ref) => {
            if (!sourceRecords[ref]) gapReviewIssues.push(`gapReview:missingSourceRef:${setId}:${ref}`);
        });
        (entry?.sourcePointers || []).forEach((pointer) => {
            if (!pointer?.sourceId || !sourceRecords[pointer.sourceId]) gapReviewIssues.push(`gapReview:missingSourcePointer:${setId}`);
        });
        const pkg = packages[setId];
        if (!pkg || pkg.gapReview?.status !== entry.status) gapReviewIssues.push(`gapReview:packageMismatch:${setId}`);
        generator.PIECE_SLOTS.forEach((slot) => {
            const slotReview = entry?.pieceSlots?.[slot];
            const slotSource = sourceRecords[`artifact:${setId}:effect:${slot}`];
            const rawText = slotSource?.text || "";
            if (!slotReview || !gapStatuses.has(slotReview.status)) gapReviewIssues.push(`gapReview:invalidSlotStatus:${setId}:${slot}`);
            if (Boolean(slotReview?.textPresent) !== generator.nonEmptyText(rawText)) gapReviewIssues.push(`gapReview:textPresence:${setId}:${slot}`);
            if (slotReview?.sourceRefs?.some((ref) => !sourceRecords[ref])) gapReviewIssues.push(`gapReview:slotSourceRef:${setId}:${slot}`);
            const pkgSlot = pkg?.pieceSlots?.[slot];
            if (!pkgSlot) gapReviewIssues.push(`gapReview:missingPackageSlot:${setId}:${slot}`);
            if (pkgSlot && slotReview?.modifierCount === 0 && (pkgSlot.specIds?.length || pkgSlot.modifierIds?.length)) {
                gapReviewIssues.push(`gapReview:unexpectedRuntimeModifier:${setId}:${slot}`);
            }
        });
    });
    expectedGapIds.forEach((setId) => {
        if (!reviewedBySet.has(setId)) gapReviewIssues.push(`gapReview:missingSet:${setId}`);
    });
    const reviewedValues = Array.isArray(gapReview.valueContracts) ? gapReview.valueContracts : [];
    const expectedValueIds = new Set(missingValueContractIds);
    const reviewedValueIds = new Set();
    reviewedValues.forEach((entry) => {
        const id = String(entry?.candidateId || "");
        reviewedValueIds.add(id);
        if (!expectedValueIds.has(id)) gapReviewIssues.push(`gapReview:unexpectedValueContract:${id}`);
        if (entry?.status !== "needsReview") gapReviewIssues.push(`gapReview:valueContractStatus:${id}`);
        if (entry?.canonical !== 0) gapReviewIssues.push(`gapReview:valueContractCanonical:${id}`);
        if (entry?.value !== null) gapReviewIssues.push(`gapReview:valueMustRemainNull:${id}`);
        (entry?.sourceRefs || []).forEach((ref) => {
            if (!sourceRecords[ref]) gapReviewIssues.push(`gapReview:valueSourceRef:${id}:${ref}`);
        });
    });
    expectedValueIds.forEach((id) => {
        if (!reviewedValueIds.has(id)) gapReviewIssues.push(`gapReview:missingValueContract:${id}`);
    });

    (generated.summary?.generatedFrom || []).forEach((input) => {
        const relative = String(input.path || "").replace(/^games\/genshin\/data\//, "");
        const absolute = path.join(dataRoot, relative);
        if (!fs.existsSync(absolute)) inputDigestMismatches.push({ path: input.path, reason: "missing" });
        else if (sourceDigest(absolute) !== input.integrity?.digest) inputDigestMismatches.push({ path: input.path, reason: "digestMismatch" });
    });

    const duplicateLegacyIds = new Map();
    expected.forEach((record) => {
        const key = String(record.modifier.id || `modifier_${record.modifierIndex + 1}`);
        if (!duplicateLegacyIds.has(key)) duplicateLegacyIds.set(key, []);
        duplicateLegacyIds.get(key).push({ setId: record.setId, slot: record.slot, modifierIndex: record.modifierIndex, candidateId: record.id });
    });
    const legacyDuplicateCandidates = [...duplicateLegacyIds.entries()]
        .filter(([, occurrences]) => occurrences.length > 1)
        .map(([id, occurrences]) => ({ id, occurrences }));

    if (missingModifierIds.length || unexpectedModifierIds.length || missingSetIds.length || unexpectedSetIds.length
        || missingSourceRefs.length || invalidSourceRecords.length || malformedSpecs.length || runtimeMissingModifierIds.length
        || inputDigestMismatches.length || targetMismatches.length || valueMismatches.length || pieceMismatches.length || policyMismatches.length
        || durationMismatches.length || stackMismatches.length || blockedMissingReasons.length || gapReviewIssues.length
        || runtimeIdMismatches.length || runtimeRouteMismatches.length || supersessionMismatches.length || runtimeClaimMismatches.length) errors.push("artifact v2 coverage/contract failure");

    const summary = {
        schemaVersion: 2,
        status: errors.length ? "failed" : "passed",
        sets: expectedSetIds.length,
        generatedSets: generatedSetIds.length,
        modifiers: expected.length,
        generatedModifiers: generatedIds.length,
        sourceRecords: Object.keys(sourceRecords).length,
        specs: Object.keys(specs).length,
        coverage: {
            sets: expectedSetIds.length ? generatedSetIds.filter((id) => expectedSetIds.includes(id)).length / expectedSetIds.length : 1,
            modifiers: expected.length ? generatedIds.filter((id) => expectedSet.has(id)).length / expected.length : 1
        },
        verification: {
            byStatus: verificationStatusCounts,
            bySourceAgreement: sourceAgreementCounts,
            claimStatuses: claimStatusCounts,
            unverified: unverifiedSpecIds.length,
            needsReview: verificationStatusCounts.needsReview || 0,
            verified: verificationStatusCounts.verified || 0,
            canonical: runtimeStatusCounts.canonical || 0
        },
        runtime: {
            byStatus: runtimeStatusCounts,
            connected: expected.length - runtimeMissingModifierIds.length,
            disconnected: runtimeMissingModifierIds.length,
            canonical: runtimeStatusCounts.canonical || 0,
            candidate: runtimeStatusCounts.candidate || 0,
            blockedPackages: Object.values(packages).filter((pkg) => pkg.runtime?.status === "blocked").length,
            namespacedIds: expected.length - runtimeIdMismatches.length,
            routeConnected: expected.length - runtimeRouteMismatches.length,
            supersessionConnected: expected.length - supersessionMismatches.length,
            claimsReviewGated: expected.length - new Set(runtimeClaimMismatches.map((entry) => entry.split(":").slice(0, -1).join(":"))).size
        },
        inputPolicy: {
            byStatus: inputPolicyCounts,
            automaticDetectability: automaticDetectabilityCounts
        },
        gapReview: {
            sets: reviewedMissing.length,
            statuses: gapReview.summary?.statuses || {},
            slotStatuses: gapReview.summary?.slotStatuses || {},
            valueContracts: reviewedValues.length,
            valueContractStatuses: gapReview.summary?.valueContractStatuses || {},
            canonical: gapReview.summary?.canonical || 0,
            issues: gapReviewIssues.length
        },
        evidenceHierarchy: generated.summary?.evidenceHierarchy || {
            aggregateEffectSources: expectedSetIds.length,
            slotEffectSources: expectedSetIds.length * generator.PIECE_SLOTS.length,
            note: "Aggregate effect records and slot field records are hierarchical evidence, not duplicate modifiers."
        },
        missing: {
            sets: missingSetIds,
            unexpectedSets: unexpectedSetIds,
            modifiers: missingModifierIds,
            unexpectedModifiers: unexpectedModifierIds,
            sourceRefs: missingSourceRefs,
            sourceRecords: invalidSourceRecords,
            inputDigests: inputDigestMismatches,
            valueContracts: missingValueContractIds,
            targetContracts: missingTargetContractIds,
            valueMismatches,
            targetMismatches,
            pieceMismatches,
            durationMismatches,
            stackMismatches,
            policyMismatches,
            runtimeIdMismatches,
            runtimeRouteMismatches,
            supersessionMismatches,
            runtimeClaimMismatches,
            structuredModifiers: structuredModifiersMissing,
            blockedMissingReasons,
            gapReview: gapReviewIssues
        },
        duplicates: {
            specIds: duplicateValues(Object.keys(specs)),
            sourceIds: duplicateValues(Object.keys(sourceRecords)),
            runtimeIds: duplicateRuntimeIds,
            legacyCandidateGroups: legacyDuplicateCandidates.length,
            legacyCandidates: legacyDuplicateCandidates
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
        unverified: { count: unverifiedSpecIds.length, specIds: unverifiedSpecIds },
        runtime: summary.runtime,
        malformedSpecs
    };
}

function writeAudit(audit = auditArtifactV2(), { outputRoot = defaultOutputRoot } = {}) {
    fs.mkdirSync(outputRoot, { recursive: true });
    fs.writeFileSync(path.join(outputRoot, "audit.json"), `${JSON.stringify(audit, null, 2)}\n`, "utf8");
    return audit;
}

if (require.main === module) {
    const dataRoot = process.env.GENSHIN_DATA_ROOT || defaultDataRoot;
    const outputRoot = process.env.GENSHIN_ARTIFACT_V2_ROOT || defaultOutputRoot;
    process.stdout.write(`${JSON.stringify(writeAudit(auditArtifactV2({ dataRoot, outputRoot }), { outputRoot }), null, 2)}\n`);
}

module.exports = {
    auditArtifactV2,
    duplicateValues,
    expectedRecords,
    loadGenerated,
    writeAudit
};
