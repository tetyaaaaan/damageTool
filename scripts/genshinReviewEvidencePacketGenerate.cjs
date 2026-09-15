"use strict";

/**
 * Build deterministic, fail-closed review evidence packets for a small set of
 * weapon candidates.  This artifact is deliberately review material only: it
 * never changes a candidate's verification state, runtime status, or canonical
 * eligibility.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const repositoryRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultWeaponRoot = path.join(dataRoot, "v2", "weapons");
const defaultPacketDirectory = path.join(dataRoot, "v2", "review-packets");
const defaultPacketIndexPath = path.join(defaultPacketDirectory, "index.json");
const defaultReportJsonPath = path.join(repositoryRoot, "reports", "genshin-review-evidence-packets.json");
const defaultReportMarkdownPath = path.join(repositoryRoot, "reports", "genshin-review-evidence-packets.md");
const GENERATOR_VERSION = "genshinReviewEvidencePacketGenerate/1";
const GENERATED_AT = "2026-08-23T00:00:00.000Z";
const DEFAULT_WEAPON_IDS = ["11503", "15502"];
const RECOMMENDATIONS = ["machineReady", "holdForEvidence", "humanDecisionRequired"];

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
}

function stableClone(value) {
    if (Array.isArray(value)) return value.map(stableClone);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableClone(value[key])]));
}

function stableJson(value) {
    return JSON.stringify(stableClone(value));
}

function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function sortNatural(a, b) {
    return String(a).localeCompare(String(b), "en", { numeric: true });
}

function unique(values) {
    return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))];
}

function asArray(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") return Object.values(value);
    return [];
}

function findRecord(records, id) {
    if (!records || !id) return null;
    return records[id] || null;
}

function blocked(value, reason, extra = {}) {
    return { value: value === undefined ? null : clone(value), blockedReason: reason, ...clone(extra) };
}

function sourceDescriptor(source, { originalText = null, blockedReason = null, fieldClaim = null } = {}) {
    if (!source) return null;
    const descriptor = {
        id: source.id || source.sourceRecordId || null,
        provider: source.provider || null,
        providerIndependence: source.providerIndependence || null,
        independenceGroup: source.independenceGroup || null,
        repository: source.repository || null,
        revision: source.revision || null,
        revisionKind: source.revisionKind || null,
        revisionPinned: source.revisionPinned === undefined ? null : Boolean(source.revisionPinned),
        path: source.path || source.sourceFile || null,
        sha256: source.sha256 || null,
        locator: clone(source.locator || null),
        gameVersion: source.gameVersion === undefined ? null : source.gameVersion,
        gameVersionVerified: source.gameVersionVerified === undefined ? false : Boolean(source.gameVersionVerified),
        originalText: originalText === undefined ? null : originalText,
        fieldClaim: clone(fieldClaim),
        blockedReason: blockedReason || null
    };
    if (source.url !== undefined) descriptor.url = source.url;
    if (source.title !== undefined) descriptor.title = source.title;
    if (source.role !== undefined) descriptor.role = source.role;
    if (source.sourceReviewStatus !== undefined) descriptor.sourceReviewStatus = source.sourceReviewStatus;
    if (source.snapshot?.sha256 !== undefined) descriptor.snapshotSha256 = source.snapshot.sha256;
    return descriptor;
}

function localSourceDescriptor(record, id) {
    if (!record) return { id, provider: null, independenceGroup: null, gameVersion: null, blockedReason: "sourceRecordMissing" };
    return {
        id,
        provider: record.provider || null,
        independenceGroup: record.independenceGroup || null,
        gameVersion: record.gameVersion === undefined ? null : record.gameVersion,
        gameVersionVerified: record.gameVersionVerified === undefined ? false : Boolean(record.gameVersionVerified),
        locator: clone(record.locator || null),
        originalText: record.text === undefined ? null : record.text,
        blockedReason: record.text === undefined ? "sourceTextMissing" : null,
        excludedReason: record.provider === "damageTool-local"
            ? "sameLocalDatasetNotIndependent"
            : record.provider === "damageTool-reviewRegistry"
                ? "derivedReviewRegistryNotIndependent"
                : "notSelectedAsIndependentProvider"
    };
}

function officialSourceDescriptor(source, { claim = null } = {}) {
    if (!source) return null;
    const snapshot = source.snapshot || {};
    const text = snapshot.text || null;
    return sourceDescriptor({
        ...source,
        path: source.url || null,
        sha256: snapshot.sha256 || source.gameVersionEvidence?.integrity?.digest || null,
        locator: source.gameVersionEvidence?.locator || null
    }, {
        originalText: text,
        blockedReason: text ? null : "officialSnapshotTextMissing",
        fieldClaim: claim
    });
}

function externalSourceDescriptor(record, field = null) {
    const source = record?.sourceRecord || record;
    if (!source) return null;
    const anchor = field?.locator?.anchor || null;
    return sourceDescriptor({ ...source, id: record.sourceRecordId || source.id }, {
        originalText: anchor,
        blockedReason: anchor ? null : "fieldLocatorAnchorMissing",
        fieldClaim: field
    });
}

function claimValue(claim, field) {
    if (!claim) return null;
    if (["value", "refinement", "stack"].includes(field)) {
        return clone(claim.structuredValue !== undefined ? claim.structuredValue : claim.value);
    }
    if (field === "unit") return claim.unit === undefined ? (claim.units === undefined ? null : claim.units) : claim.unit;
    if (field === "targets") return clone(claim.targets === undefined ? null : claim.targets);
    if (field === "activation") return clone(claim.activation === undefined ? null : claim.activation);
    if (field === "duration") {
        return claim.structuredValue?.durationSeconds ?? claim.activation?.durationSeconds ?? null;
    }
    if (field === "interval") {
        return claim.structuredValue?.intervalSeconds ?? claim.activation?.intervalSeconds ?? null;
    }
    return clone(claim.structuredValue !== undefined ? claim.structuredValue : claim.value);
}

function evidenceValue(fieldEvidence, field) {
    if (!fieldEvidence) return null;
    if (["value", "refinement", "stack"].includes(field)) {
        return clone(fieldEvidence.structuredValue !== undefined ? fieldEvidence.structuredValue : fieldEvidence.value);
    }
    if (field === "unit") return fieldEvidence.unit === undefined ? (fieldEvidence.units === undefined ? null : fieldEvidence.units) : fieldEvidence.unit;
    if (field === "targets") return clone(fieldEvidence.targets === undefined ? null : fieldEvidence.targets);
    if (field === "activation") return clone(fieldEvidence.activation === undefined ? null : fieldEvidence.activation);
    if (field === "duration") {
        return fieldEvidence.structuredValue?.durationSeconds ?? fieldEvidence.activation?.durationSeconds ?? null;
    }
    if (field === "interval") {
        return fieldEvidence.structuredValue?.intervalSeconds ?? fieldEvidence.activation?.intervalSeconds ?? null;
    }
    return clone(fieldEvidence.structuredValue !== undefined ? fieldEvidence.structuredValue : fieldEvidence.value);
}

function specValue(candidate, field) {
    const effect = candidate?.effect || {};
    if (["value", "refinement"].includes(field)) return clone(effect.valueByRefinement ?? effect.value ?? null);
    if (field === "unit") return clone(effect.unit ?? null);
    if (field === "targets") return clone(effect.targets ?? null);
    if (field === "activation") return clone(effect.activation ?? null);
    if (field === "stack") return clone(effect.stack && typeof effect.stack === "object"
        ? { ...effect.stack, ...(effect.intervalSeconds !== undefined ? { intervalSeconds: effect.intervalSeconds } : {}) }
        : effect.stack ?? null);
    if (field === "duration") return clone(effect.activation?.durationSeconds ?? effect.durationSeconds ?? null);
    if (field === "interval") return clone(effect.stack?.intervalSeconds ?? effect.activation?.intervalSeconds ?? null);
    return null;
}

function sourceRecordText(sourceRecords, sourceRef) {
    const record = findRecord(sourceRecords, sourceRef);
    if (!record) return { sourceRef, text: null, blockedReason: "sourceRecordMissing" };
    return {
        sourceRef,
        provider: record.provider || null,
        locator: clone(record.locator || null),
        text: record.text === undefined ? null : record.text,
        blockedReason: record.text === undefined ? "sourceTextMissing" : null
    };
}

function fieldCandidates({ candidateId, externalRecord, officialRecord }) {
    const external = (externalRecord?.fields || []).filter((field) => field.candidateId === candidateId).map((field) => field.field);
    const official = (officialRecord?.officialClaims || []).filter((claim) => claim.candidateId === candidateId).map((claim) => claim.field);
    return unique([...external, ...official]).sort(sortNatural);
}

function bestExternalField(record, candidateId, field) {
    const fields = (record?.fields || []).filter((item) => item.candidateId === candidateId && item.field === field);
    return fields.sort((a, b) => {
        const statusOrder = { eligible: 0, needsReview: 1 };
        return (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9) || stableJson(a).localeCompare(stableJson(b));
    })[0] || null;
}

function officialClaimsFor(record, candidateId, field) {
    return (record?.officialClaims || []).filter((claim) => claim.candidateId === candidateId && claim.field === field);
}

function firstOfficialClaim(record, candidateId, field) {
    return officialClaimsFor(record, candidateId, field)[0] || null;
}

function arrayKeys(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return Object.keys(value).sort(sortNatural);
}

function compareValues(sourceAValue, sourceBValue, candidateValue, field) {
    const missingA = sourceAValue === null || sourceAValue === undefined;
    const missingB = sourceBValue === null || sourceBValue === undefined;
    const missingSpec = candidateValue === null || candidateValue === undefined;
    const result = {
        status: "notComparable",
        agreement: "判定不能",
        sourceAgreement: "notComparable",
        specAgreement: "notComparable",
        sourceACompared: !missingA,
        sourceBCompared: !missingB,
        specCompared: !missingSpec,
        overlap: null,
        mismatches: [],
        blockedReasons: []
    };
    if (missingA) result.blockedReasons.push("officialFieldClaimMissing");
    if (missingB) result.blockedReasons.push("independentFieldEvidenceMissing");
    if (missingSpec) result.blockedReasons.push("specValueMissing");
    if (missingA || missingB) return result;

    const keysA = arrayKeys(sourceAValue);
    const keysB = arrayKeys(sourceBValue);
    const keysS = arrayKeys(candidateValue);
    if (keysA && keysB) {
        const overlap = keysA.filter((key) => keysB.includes(key));
        result.overlap = { sourceA: keysA, sourceB: keysB, spec: keysS || [] };
        if (!overlap.length) {
            result.status = "mismatch";
            result.agreement = "不一致";
            result.sourceAgreement = "mismatch";
            result.blockedReasons.push("noComparableRefinementRanks");
            return result;
        }
        for (const key of overlap) {
            if (stableJson(sourceAValue[key]) !== stableJson(sourceBValue[key])) result.mismatches.push({ key, sourceA: clone(sourceAValue[key]), sourceB: clone(sourceBValue[key]) });
        }
        result.sourceAgreement = result.mismatches.length ? "mismatch" : "match";
        if (!missingSpec && keysS) {
            const specMismatchesA = keysA.filter((key) => Object.prototype.hasOwnProperty.call(candidateValue, key) && stableJson(sourceAValue[key]) !== stableJson(candidateValue[key]));
            const specMismatchesB = keysB.filter((key) => Object.prototype.hasOwnProperty.call(candidateValue, key) && stableJson(sourceBValue[key]) !== stableJson(candidateValue[key]));
            if (specMismatchesA.length || specMismatchesB.length) {
                result.specAgreement = "mismatch";
                result.mismatches.push(...specMismatchesA.map((key) => ({ key, source: "sourceA", spec: clone(candidateValue[key]), observed: clone(sourceAValue[key]) })));
                result.mismatches.push(...specMismatchesB.map((key) => ({ key, source: "sourceB", spec: clone(candidateValue[key]), observed: clone(sourceBValue[key]) })));
            } else {
                result.specAgreement = "match";
            }
        } else {
            result.blockedReasons.push("specRefinementSeriesMissing");
        }
        const complete = keysA.length === keysB.length && (!keysS || keysS.length === keysA.length);
        result.status = result.mismatches.length ? "mismatch" : complete ? "match" : "partialMatch";
        result.agreement = result.status === "match" ? "一致" : result.status === "partialMatch" ? "部分一致" : "不一致";
        if (result.status === "partialMatch") result.blockedReasons.push("incompleteComparableCoverage");
        return result;
    }

    result.overlap = { sourceA: sourceAValue, sourceB: sourceBValue, spec: clone(candidateValue) };
    result.sourceAgreement = stableJson(sourceAValue) === stableJson(sourceBValue) ? "match" : "mismatch";
    result.specAgreement = missingSpec ? "notComparable" : stableJson(sourceBValue) === stableJson(candidateValue) ? "match" : "mismatch";
    if (result.sourceAgreement === "mismatch" || result.specAgreement === "mismatch") {
        result.status = "mismatch";
        result.agreement = "不一致";
        result.mismatches.push({ sourceA: clone(sourceAValue), sourceB: clone(sourceBValue), spec: clone(candidateValue) });
    } else {
        result.status = "match";
        result.agreement = "一致";
    }
    return result;
}

function triageFor(triage, weaponId, candidateId, field) {
    return [...(triage?.conflicts || []), ...(triage?.reconciled || [])].filter((item) => String(item.weaponId) === String(weaponId) && item.candidateId === candidateId && item.field === field).map((item) => ({
        key: item.key,
        status: item.status,
        classification: item.classification,
        previousClassification: item.previousClassification || null,
        dimensions: clone(item.dimensions || []),
        rationaleCode: item.rationaleCode || null,
        rationale: item.rationale || null,
        canonicalEligibility: item.canonicalEligibility === true,
        promotionDecision: item.promotionDecision || null
    }));
}

function recommendation({ comparison, triage, gameVersion, sourceAClaim, sourceBField }) {
    const reasons = unique([
        ...comparison.blockedReasons,
        ...(gameVersion.blockedReasons || []),
        sourceAClaim ? null : "officialFieldClaimMissing",
        sourceBField ? null : "independentFieldEvidenceMissing",
        ...triage.flatMap((item) => item.dimensions || []).map((dimension) => `triage:${dimension}`)
    ]);
    // Human judgement is reserved for a semantic conflict after the machine
    // evidence gate is complete.  Missing gameVersion, absent source claims,
    // and partial/not-comparable coverage remain machine work and therefore
    // must stay holdForEvidence even when triage has already identified a
    // possible scope/parser discrepancy.
    const technicalEvidenceBlocked = Boolean(gameVersion.blockedReasons?.length)
        || !sourceAClaim
        || !sourceBField
        || ["notComparable", "partialMatch"].includes(comparison.status);
    if (technicalEvidenceBlocked) return { status: "holdForEvidence", blockedReasons: reasons, selfApprovalForbidden: true };
    const hardConflict = comparison.status === "mismatch" || triage.some((item) => ["genuineConflict", "scopeMismatch", "parserLimitation"].includes(item.classification));
    if (hardConflict) return { status: "humanDecisionRequired", blockedReasons: reasons, selfApprovalForbidden: true };
    const evidenceComplete = comparison.status === "match" && !gameVersion.blockedReasons?.length && sourceAClaim && sourceBField;
    if (evidenceComplete) return { status: "machineReady", blockedReasons: [], selfApprovalForbidden: true };
    return { status: "holdForEvidence", blockedReasons: reasons, selfApprovalForbidden: true };
}

function reviewDecisionOptions(recommendationStatus) {
    const decisionReady = recommendationStatus === "humanDecisionRequired";
    return [
        { value: "approve", enabled: decisionReady, blockedReason: decisionReady ? null : "technicalEvidenceIncomplete" },
        { value: "reject", enabled: decisionReady, blockedReason: decisionReady ? null : "technicalEvidenceIncomplete" },
        { value: "hold", enabled: true, blockedReason: null }
    ];
}

function buildInputs({
    candidatePath = path.join(defaultWeaponRoot, "spec-candidates.json"),
    sourceRecordsPath = path.join(defaultWeaponRoot, "source-records.json"),
    externalEvidencePath = path.join(defaultWeaponRoot, "external-evidence.json"),
    officialPilotPath = path.join(defaultWeaponRoot, "official-pilot.json"),
    conflictTriagePath = path.join(defaultWeaponRoot, "conflict-triage.json")
} = {}) {
    return {
        candidates: readJson(candidatePath),
        sourceRecords: readJson(sourceRecordsPath),
        externalEvidence: readJson(externalEvidencePath),
        officialPilot: readJson(officialPilotPath),
        conflictTriage: readJson(conflictTriagePath),
        paths: { candidatePath, sourceRecordsPath, externalEvidencePath, officialPilotPath, conflictTriagePath }
    };
}

function buildPacket(weaponId, inputs) {
    const candidates = inputs.candidates || {};
    const specs = Object.values(candidates).filter((candidate) => String(candidate?.entity?.id) === String(weaponId)).sort((a, b) => sortNatural(a.id, b.id));
    const officialRecord = findRecord(inputs.officialPilot?.records, weaponId);
    const externalRecord = findRecord(inputs.externalEvidence?.records, `gcsim:weapon:${weaponId}`);
    const officialSourceIds = officialRecord?.officialSourceIds || [];
    const officialSources = officialSourceIds.map((id) => officialSourceDescriptor(findRecord(inputs.officialPilot?.sources, id))).filter(Boolean);
    const externalSource = externalSourceDescriptor(externalRecord, null);
    const sourceRefs = unique(specs.flatMap((spec) => spec.sourceRefs || []));
    const excludedSources = sourceRefs
        .filter((id) => !id.startsWith(`gcsim:weapon:${weaponId}`))
        .sort(sortNatural)
        .map((id) => localSourceDescriptor(findRecord(inputs.sourceRecords, id), id));
    const weaponName = officialRecord?.name || null;
    const independentVersions = [externalRecord?.gameVersion, externalRecord?.sourceRecord?.gameVersion].filter((value) => value !== null && value !== undefined && value !== "");
    const officialVersions = unique([
        ...(officialRecord?.officialGameVersions || []),
        ...officialSources.map((source) => source.gameVersion).filter(Boolean)
    ]);
    const versionBlockedReasons = [];
    if (!officialVersions.length) versionBlockedReasons.push("officialGameVersionMissing");
    if (!independentVersions.length) versionBlockedReasons.push("independentSourceGameVersionMissing");
    const targetGameVersion = {
        value: officialVersions.length === 1 && independentVersions.length === 1 && officialVersions[0] === independentVersions[0] ? officialVersions[0] : null,
        sourceA: officialVersions.length === 1 ? officialVersions[0] : null,
        sourceB: independentVersions.length === 1 ? independentVersions[0] : null,
        sourceAVerified: officialSources.length > 0 && officialSources.every((source) => source.gameVersionVerified === true),
        sourceBVerified: externalRecord?.gameVersionVerified === true || externalRecord?.sourceRecord?.gameVersionVerified === true,
        status: versionBlockedReasons.length ? "blocked" : "bound",
        blockedReasons: versionBlockedReasons,
        evidence: officialSources.map((source) => ({ id: source.id, gameVersion: source.gameVersion, gameVersionVerified: source.gameVersionVerified, locator: source.locator, originalText: source.originalText }))
    };

    const items = [];
    for (const candidate of specs) {
        const fields = fieldCandidates({ candidateId: candidate.id, externalRecord, officialRecord });
        for (const field of fields) {
            const sourceAClaim = firstOfficialClaim(officialRecord, candidate.id, field);
            const sourceBField = bestExternalField(externalRecord, candidate.id, field);
            const sourceAValues = sourceAClaim ? claimValue(sourceAClaim, field) : null;
            const sourceBValues = sourceBField ? evidenceValue(sourceBField, field) : null;
            const candidateValues = specValue(candidate, field);
            const comparisons = compareValues(sourceAValues, sourceBValues, candidateValues, field);
            const triage = triageFor(inputs.conflictTriage, weaponId, candidate.id, field);
            const sourceA = officialSources.map((source) => officialSourceDescriptor(findRecord(inputs.officialPilot?.sources, source.id), { claim: sourceAClaim })).filter(Boolean);
            const sourceB = externalSource ? externalSourceDescriptor(externalRecord, sourceBField) : null;
            const localOriginalText = (candidate.sourceRefs || []).map((sourceRef) => sourceRecordText(inputs.sourceRecords, sourceRef));
            const interpretationNotes = unique([
                candidate.interpretation?.notes,
                sourceAClaim?.notes,
                sourceBField?.extractionMethod?.note,
                sourceBField?.gameVersionEvidence?.note,
                ...triage.map((item) => item.rationale),
                ...(targetGameVersion.blockedReasons.length ? ["Source A and source B are not both bound to the same explicit Genshin gameVersion."] : []),
                "This packet is evidence only; AI must not self-approve, set verification.status=verified, or promote canonical runtime data."
            ]);
            const itemRecommendation = recommendation({ comparison: comparisons, triage, gameVersion: targetGameVersion, sourceAClaim, sourceBField });
            items.push({
                id: `${weaponId}:${candidate.id}:${field}`,
                target: {
                    kind: "weapon",
                    id: String(weaponId),
                    name: weaponName,
                    candidateId: candidate.id,
                    field
                },
                originalText: {
                    sourceA: sourceA.length ? sourceA.map((source) => ({ sourceId: source.id, text: source.originalText, blockedReason: source.originalText ? null : "officialSnapshotTextMissing" })) : [{ text: null, blockedReason: "officialSourceMissing" }],
                    sourceB: sourceB ? { sourceId: sourceB.id, text: sourceB.originalText, blockedReason: sourceB.originalText ? null : sourceB.blockedReason } : { text: null, blockedReason: "independentSourceMissing" },
                    spec: localOriginalText.length ? localOriginalText : [{ sourceRef: null, text: null, blockedReason: "specSourceTextMissing" }]
                },
                sourceA: {
                    records: sourceA,
                    fieldClaim: sourceAClaim ? clone(sourceAClaim) : null,
                    extractedValue: sourceAClaim ? sourceAValues : null,
                    blockedReason: sourceAClaim ? null : "officialFieldClaimMissing"
                },
                sourceB: {
                    record: sourceB,
                    fieldEvidence: sourceBField ? clone(sourceBField) : null,
                    extractedValue: sourceBField ? sourceBValues : null,
                    blockedReason: sourceBField ? null : "independentFieldEvidenceMissing"
                },
                gameVersion: clone(targetGameVersion),
                targetGameVersion: clone(targetGameVersion),
                extractedValue: {
                    sourceA: sourceAClaim ? sourceAValues : null,
                    sourceB: sourceBField ? sourceBValues : null,
                    blockedReasons: unique([sourceAClaim ? null : "officialFieldClaimMissing", sourceBField ? null : "independentFieldEvidenceMissing"])
                },
                specValue: candidateValues === null ? blocked(null, "specValueMissing") : { value: candidateValues, blockedReason: null },
                comparison: {
                    ...comparisons,
                    triage
                },
                interpretationNotes,
                runtimeTarget: {
                    destination: clone(candidate.runtime?.destination || candidate.destination || null),
                    modifierIds: clone(candidate.runtime?.modifierIds || []),
                    supersedesLegacyModifierIds: clone(candidate.runtime?.supersedesLegacyModifierIds || candidate.supersedesLegacyModifierIds || []),
                    blockedReason: candidate.runtime?.destination ? null : "runtimeDestinationMissing"
                },
                recommendation: itemRecommendation,
                reviewDecisionOptions: reviewDecisionOptions(itemRecommendation.status),
                verification: {
                    status: candidate.verification?.status || "needsReview",
                    sourceAgreement: candidate.verification?.sourceAgreement || null,
                    reviewedBy: candidate.verification?.reviewedBy || null,
                    reviewedAt: candidate.verification?.reviewedAt || null,
                    selfApprovalForbidden: true
                },
                canonicalEligibility: false
            });
        }
    }
    items.sort((a, b) => sortNatural(a.id, b.id));
    const recommendationCounts = Object.fromEntries(RECOMMENDATIONS.map((status) => [status, items.filter((item) => item.recommendation.status === status).length]));
    const packetRecommendation = recommendationCounts.humanDecisionRequired > 0
        ? "humanDecisionRequired"
        : recommendationCounts.holdForEvidence > 0
            ? "holdForEvidence"
            : "machineReady";
    return {
        schemaVersion: 1,
        packet: "genshin-review-evidence-packet",
        packetId: `genshin:weapon:${weaponId}`,
        generator: GENERATOR_VERSION,
        generatedAt: GENERATED_AT,
        batch: {
            id: "weapon-11503-15502",
            targetWeaponIds: DEFAULT_WEAPON_IDS.slice(),
            selection: "Small deterministic evidence batch requested by the user."
        },
        target: {
            kind: "weapon",
            id: String(weaponId),
            name: weaponName,
            candidateIds: specs.map((candidate) => candidate.id),
            sourceCount: unique(specs.flatMap((candidate) => candidate.sourceRefs || [])).length
        },
        sourceSelection: {
            sourceA: {
                role: "officialPrimary",
                sourceIds: officialSources.map((source) => source.id),
                independenceGroup: unique(officialSources.map((source) => source.independenceGroup)),
                rationale: "Official HoYoLAB primary source is selected for explicit patch/version and any explicitly printed fields."
            },
            sourceB: externalSource ? {
                role: "independentImplementation",
                sourceIds: [externalSource.id],
                independenceGroup: [externalSource.independenceGroup],
                rationale: "Pinned gcsim source is selected as an independent implementation; its revision is not treated as gameVersion."
            } : {
                role: "independentImplementation",
                sourceIds: [],
                independenceGroup: [],
                rationale: "No independent source record was available.",
                blockedReason: "independentSourceMissing"
            },
            twoProviderCheck: {
                status: officialSources.length && externalSource ? "twoProviders" : "blocked",
                providerA: officialSources.map((source) => source.provider),
                providerB: externalSource ? [externalSource.provider] : [],
                independenceGroups: unique([...officialSources.map((source) => source.independenceGroup), externalSource?.independenceGroup]),
                blockedReasons: unique([officialSources.length ? null : "officialSourceMissing", externalSource ? null : "independentSourceMissing"])
            },
            excluded: excludedSources,
            exclusionPolicy: "damageTool-local, review-registry, and other same-series/derived records are retained as context only and are not counted as independent source A/B evidence."
        },
        targetGameVersion,
        gameVersion: clone(targetGameVersion),
        items,
        recommendation: {
            status: packetRecommendation,
            counts: recommendationCounts,
            blockedReasons: unique(items.flatMap((item) => item.recommendation.blockedReasons || [])),
            selfApprovalForbidden: true
        },
        reviewDecisionOptions: reviewDecisionOptions(packetRecommendation),
        canonicalEligibility: false,
        policy: {
            verificationPromotion: "forbidden",
            canonicalPromotion: "forbidden",
            aiSelfApproval: "forbidden",
            missingInformation: "Represent unavailable values as null with blockedReason; never infer or silently omit.",
            recommendationEnum: RECOMMENDATIONS
        },
        inputDigests: Object.fromEntries(Object.entries(inputs.paths).map(([key, file]) => [key, sha256(fs.readFileSync(file))]))
    };
}

function buildPackets({ weaponIds = DEFAULT_WEAPON_IDS, ...paths } = {}) {
    const inputs = buildInputs(paths);
    return weaponIds.map(String).sort(sortNatural).map((weaponId) => buildPacket(weaponId, inputs));
}

function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writePackets(packets, { packetDirectory = defaultPacketDirectory, packetIndexPath = defaultPacketIndexPath } = {}) {
    fs.mkdirSync(packetDirectory, { recursive: true });
    packets.forEach((packet) => writeJson(path.join(packetDirectory, `weapon-${packet.target.id}.json`), packet));
    writeJson(packetIndexPath, {
        schemaVersion: 1,
        index: "genshin-review-evidence-packets",
        generator: GENERATOR_VERSION,
        generatedAt: GENERATED_AT,
        packetIds: packets.map((packet) => packet.packetId),
        files: packets.map((packet) => ({ packetId: packet.packetId, weaponId: packet.target.id, path: `weapon-${packet.target.id}.json`, recommendation: packet.recommendation.status, items: packet.items.length })),
        canonicalEligibility: 0,
        verificationPromotions: 0
    });
}

function parseArgs(argv) {
    const args = { packetDirectory: defaultPacketDirectory, packetIndexPath: defaultPacketIndexPath, weaponIds: DEFAULT_WEAPON_IDS.slice() };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--candidates") args.candidatePath = path.resolve(argv[++i]);
        else if (arg === "--source-records") args.sourceRecordsPath = path.resolve(argv[++i]);
        else if (arg === "--external-evidence") args.externalEvidencePath = path.resolve(argv[++i]);
        else if (arg === "--official-pilot") args.officialPilotPath = path.resolve(argv[++i]);
        else if (arg === "--conflict-triage") args.conflictTriagePath = path.resolve(argv[++i]);
        else if (arg === "--packet-directory") args.packetDirectory = path.resolve(argv[++i]);
        else if (arg === "--packet-index") args.packetIndexPath = path.resolve(argv[++i]);
        else if (arg === "--weapons") args.weaponIds = String(argv[++i]).split(",").map((value) => value.trim()).filter(Boolean);
        else if (arg === "--help") args.help = true;
        else throw new Error(`unknown argument: ${arg}`);
    }
    return args;
}

if (require.main === module) {
    try {
        const args = parseArgs(process.argv.slice(2));
        if (args.help) {
            console.log("Usage: node scripts/genshinReviewEvidencePacketGenerate.cjs [--weapons 11503,15502] [--packet-directory <path>]");
            process.exit(0);
        }
        const packets = buildPackets(args);
        writePackets(packets, args);
        process.stdout.write(`${JSON.stringify({ packets: packets.length, items: packets.reduce((count, packet) => count + packet.items.length, 0), canonicalEligibility: 0 }, null, 2)}\n`);
    } catch (error) {
        console.error(error.stack || error.message);
        process.exitCode = 1;
    }
}

module.exports = {
    DEFAULT_WEAPON_IDS,
    GENERATED_AT,
    GENERATOR_VERSION,
    RECOMMENDATIONS,
    buildInputs,
    buildPacket,
    buildPackets,
    compareValues,
    stableJson,
    writePackets
};
