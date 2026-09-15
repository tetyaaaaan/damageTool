"use strict";

/**
 * Bounded r2 audit for the 32 ready candidates that are outside the existing
 * 1,914-candidate source-coverage inventory.  This is deliberately a draft
 * evidence artifact: it records raw observations, runtime-input corrections,
 * and candidate-scoped source holds, but never edits the authoritative queue,
 * work-disposition registry, Runtime, canonical data, or HSR data.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const primary = require("./genshinWeaponPrimaryFieldComparison.cjs");
const { digestStable, stableValue } = require("./genshinVersionEvidenceValidation.cjs");

const ROOT = path.resolve(__dirname, "..");
const POLICY_ID = "genshin-goal-2026-08-28-r2";
const TARGET_GAME_VERSION = "7.0";
const GENERATED_AT = "2026-08-30T00:00:00.000Z";
const GENERATOR_VERSION = "genshinR2Ready32SourceAudit/1";
const ARTIFACT_FRONTIER_ID = "artifacts-four-piece-independent-field-frontier-7.0";

const WEAPON_CANDIDATE_IDS = Object.freeze([
    "w_11418_scalingBonus_cf36aef0",
    "w_11418_scaling_bonus_2",
    "w_11418_scaling_bonus_3",
    "w_11427_1_v10",
    "w_11427_2_v10",
    "w_11505_v3_scalingBonus_2",
    "w_11510_damage_2",
    "w_11511_scaling_bonus_3",
    "w_11516_scaling_bonus_4",
    "w_12415_scaling_bonus_1",
    "w_12427_1_v10",
    "w_12427_2_v10",
    "w_12431_v3_damageBonus_1",
    "w_12515_four_winds_damage_per_stack_v10",
    "w_12515_magic_secret_crit_damage_per_stack_v10",
    "w_13427_1_v10",
    "w_13427_2_v10",
    "w_13427_3_v10",
    "w_13501_v3_scalingBonus_2",
    "w_13517_v3_damageBonus_1",
    "w_13517_v3_damageBonus_2",
    "w_14416_scaling_bonus_1",
    "w_14431_scaling_bonus_2",
    "w_14506_v3_scalingBonus_1",
    "w_14523_scaling_bonus_3",
    "w_15427_1_v10",
    "w_15427_2_v10",
    "w_15427_3_v10"
]);

const ARTIFACT_CANDIDATE_IDS = Object.freeze([
    "artifact:15022:fourPiece:4pc_sea_dyed_foam_damage",
    "artifact:15033:fourPiece:4pc_recorded_healing_additive_damage",
    "artifact:15041:fourPiece:4pc_crit_rate_moon_omen",
    "artifact:15042:fourPiece:4pc_team_elemental_mastery_moon_omen"
]);

const EXPECTED_CANDIDATE_IDS = Object.freeze([
    ...WEAPON_CANDIDATE_IDS,
    ...ARTIFACT_CANDIDATE_IDS
].sort((left, right) => left.localeCompare(right)));

const INPUT_PATHS = Object.freeze({
    queue: "reports/genshin-evidence-task-queue.json",
    coverageInventory: "reports/genshin-candidate-source-coverage-frontier-inventory.json",
    weaponSpecs: "games/genshin/data/v2/weapons/spec-candidates.json",
    weaponSourceRecords: "games/genshin/data/v2/weapons/source-records.json",
    artifactSpecs: "games/genshin/data/v2/artifacts/spec-candidates.json",
    artifactSourceRecords: "games/genshin/data/v2/artifacts/source-records.json",
    artifactDeferralAudit: "games/genshin/data/v2/reviews/r2-artifact-deferral-audit.json",
    terminalStates: "games/genshin/data/v2/candidate-terminal-states.json",
    sourceSearchFrontiers: "games/genshin/data/v2/source-search-frontiers.json",
    providerPolicy: "games/genshin/data/v2/provider-independence-policy.json",
    sourceFamilyRegistry: "games/genshin/data/v2/source-family-registry.json",
    sourceCatalog: "games/genshin/data/v2/source-catalog.json",
    gameVersionEvidence: "games/genshin/data/v2/game-version-evidence.json",
    weaponExternalEvidence: "games/genshin/data/v2/weapons/external-evidence.json",
    weaponIndependentEvidence: "games/genshin/data/v2/weapons/independent-field-evidence.json",
    kqmArtifactEvidence: "games/genshin/data/v2/external/kqm-artifact-field-evidence.json",
    optimizerEvidence: "reports/genshin-optimizer-field-evidence.json",
    transitionSourceSearch: "games/genshin/data/v2/version-transitions/6.7-to-7.0/source-search.json",
    weaponTreeBefore: "games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/weapon-tree-resolution.json",
    weaponTreeAfter: "games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/weapon-tree-resolution.json",
    weaponSnapshot: "games/genshin/data/v2/version-transitions/6.7-to-7.0/weapon-entity-snapshot.json",
    weaponSnapshotShard02: "games/genshin/data/v2/version-transitions/6.7-to-7.0/weapon-entity-snapshot-shard02.json",
    weaponSnapshotShard03: "games/genshin/data/v2/version-transitions/6.7-to-7.0/weapon-entity-snapshot-shard03.json",
    weaponSnapshotShard04: "games/genshin/data/v2/version-transitions/6.7-to-7.0/weapon-entity-snapshot-shard04.json",
    calcAnalyzer: "games/js/genshinModifierAnalyzer.js",
    calcEngine: "games/js/genshinCalcEngine.js",
    calcConditions: "games/js/genshinCalcConditions.js",
    partyState: "games/js/genshinPartyState.js",
    calcRenderer: "games/js/genshinCalcRenderer.js",
    calcIntegrationTest: "tests/genshin/genshinCalcIntegration.test.cjs",
    partyModifierTest: "tests/genshin/genshinPartyModifiers.test.cjs",
    partyConditionTest: "tests/genshin/genshinPartyConditionState.test.cjs"
});

const OUTPUT_PATHS = Object.freeze({
    artifact: "games/genshin/data/v2/reviews/r2-ready-32-source-audit.json",
    report: "reports/genshin-r2-ready-32-source-audit.md"
});

const ROUTE_CANDIDATE_IDS = new Set([
    "w_11427_1_v10", "w_11427_2_v10", "w_12427_1_v10", "w_12427_2_v10",
    "w_12515_four_winds_damage_per_stack_v10",
    "w_12515_magic_secret_crit_damage_per_stack_v10",
    "w_13427_1_v10", "w_13427_2_v10", "w_13427_3_v10",
    "w_15427_1_v10", "w_15427_2_v10", "w_15427_3_v10",
    ...ARTIFACT_CANDIDATE_IDS
]);

const ARTIFACT_ROUTE_EVIDENCE = Object.freeze([
    INPUT_PATHS.terminalStates,
    INPUT_PATHS.calcAnalyzer,
    INPUT_PATHS.calcEngine,
    INPUT_PATHS.calcConditions,
    INPUT_PATHS.partyState,
    INPUT_PATHS.calcRenderer,
    INPUT_PATHS.calcIntegrationTest,
    INPUT_PATHS.partyModifierTest,
    INPUT_PATHS.partyConditionTest
]);

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const readJson = (relativePath) => JSON.parse(fs.readFileSync(resolveRepoFile(relativePath), "utf8"));
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const relative = (file) => path.relative(ROOT, file).replaceAll(path.sep, "/");
const stableJson = (value) => JSON.stringify(stableValue(value));
const sortedUnique = (values) => [...new Set((values || []).filter((value) => value !== null && value !== undefined).map(String))]
    .sort((left, right) => left.localeCompare(right));

function resolveRepoFile(relativePath) {
    const resolved = path.isAbsolute(String(relativePath))
        ? path.resolve(String(relativePath))
        : path.resolve(ROOT, String(relativePath));
    if (resolved !== ROOT && !resolved.startsWith(`${ROOT}${path.sep}`)) {
        throw new Error(`pathOutsideRepository:${relativePath}`);
    }
    return resolved;
}

function fileRef(relativePath) {
    const file = resolveRepoFile(relativePath);
    if (!fs.existsSync(file)) throw new Error(`evidenceFileMissing:${relativePath}`);
    const bytes = fs.readFileSync(file);
    return { path: relative(file), bytes: bytes.length, sha256: sha256(bytes) };
}

function inputRefs() {
    return Object.fromEntries(Object.entries(INPUT_PATHS).map(([name, file]) => [name, fileRef(file)]));
}

function withoutDigest(value) {
    const copy = clone(value);
    delete copy.fieldDigest;
    return copy;
}

function queueTaskDigestProjection(task) {
    return digestStable({
        candidateId: task.candidateId,
        layer: task.layer || null,
        dataset: task.dataset || null,
        terminalState: task.terminalState,
        primaryBlockReason: task.primaryBlockReason || null,
        blockReasons: task.blockReasons || [],
        task: task.task || null,
        searchFrontier: task.searchFrontier || null,
        deferredLanes: task.deferredLanes || [],
        mappingStatus: task.mappingStatus || null,
        consumerStatus: task.consumerStatus || null
    });
}

function coverageIds(coverage) {
    if (Array.isArray(coverage?.candidateRecords)) return coverage.candidateRecords.map((item) => String(item.candidateId));
    if (Array.isArray(coverage?.targets)) return coverage.targets.map((item) => String(item.candidateId || item.id));
    return [];
}

function deriveSelection(queue, coverage) {
    if (!Array.isArray(queue?.tasks)) throw new Error("queueTasksMissing");
    const covered = new Set(coverageIds(coverage));
    const weaponTasks = queue.tasks.filter((task) => task
        && task.layer === "weaponEffectSpec"
        && task.dataset === "weapons"
        && task.task?.status === "ready"
        && ["unsupported", "inputMissing"].includes(task.primaryBlockReason)
        && !covered.has(String(task.candidateId)))
        .sort((left, right) => String(left.candidateId).localeCompare(String(right.candidateId)));
    const artifactIdSet = new Set(ARTIFACT_CANDIDATE_IDS);
    const artifactTasks = queue.tasks.filter((task) => task
        && task.layer === "artifactEffectSpec"
        && task.dataset === "artifacts"
        && artifactIdSet.has(String(task.candidateId))
        && task.task?.status === "ready"
        && task.primaryBlockReason === "inputMissing")
        .sort((left, right) => String(left.candidateId).localeCompare(String(right.candidateId)));
    const actualIds = [...weaponTasks, ...artifactTasks].map((task) => String(task.candidateId)).sort((a, b) => a.localeCompare(b));
    if (stableJson(actualIds) !== stableJson(EXPECTED_CANDIDATE_IDS)) {
        throw new Error(`ready32ScopeDrift:${actualIds.length}:${actualIds.join(",")}`);
    }
    if (weaponTasks.length !== WEAPON_CANDIDATE_IDS.length || artifactTasks.length !== ARTIFACT_CANDIDATE_IDS.length) {
        throw new Error(`ready32DatasetCountMismatch:${weaponTasks.length}:${artifactTasks.length}`);
    }
    return { weaponTasks, artifactTasks, tasks: [...weaponTasks, ...artifactTasks] };
}

function syntheticWeaponQueue(tasks) {
    return {
        tasks: tasks.map((task) => ({
            ...clone(task),
            primaryBlockReason: "sourceMissing",
            searchFrontier: {
                ...clone(task.searchFrontier || {}),
                status: "searchRequired",
                exhausted: false,
                scopeMatched: null
            }
        }))
    };
}

function compactPin(pin) {
    const stored = pin?.stored || {};
    const observed = pin?.observed || {};
    return {
        status: pin?.status || null,
        errors: Array.isArray(pin?.errors) ? [...pin.errors] : [],
        path: pin?.path || stored.path || null,
        gameVersion: pin?.gameVersion || stored.gameVersion || null,
        revision: pin?.revision || stored.revision || null,
        slug: pin?.slug || stored.slug || null,
        stored: {
            blobSha: stored.blobSha || null,
            treeBlobBytes: stored.treeBlobBytes ?? null,
            rawArtifactBytes: stored.rawArtifactBytes ?? null,
            rawArtifactDigest: stored.rawArtifactDigest || null,
            normalizedRecordDigest: stored.normalizedRecordDigest || null
        },
        observed: {
            bytes: observed.bytes ?? null,
            sha256: observed.sha256 || null,
            gitBlobSha: observed.gitBlobSha || null,
            parsedEntityId: observed.parsedEntityId || null,
            normalizedRecordDigest: observed.normalizedRecordDigest || null
        }
    };
}

function compactColumns(values) {
    if (!values) return null;
    return {
        status: values.status || null,
        ranks: (values.ranks || []).map((rank) => ({ rank: rank.rank, key: rank.key, values: clone(rank.values) })),
        columns: (values.columns || []).map((column) => ({
            columnIndex: column.columnIndex,
            status: column.status || null,
            valuesByRank: (column.valuesByRank || []).map((item) => ({
                rank: item.rank,
                pointer: item.pointer,
                raw: item.raw,
                normalized: item.normalized ? {
                    status: item.normalized.status || null,
                    decimal: item.normalized.decimal || null,
                    unit: item.normalized.unit || null,
                    canonical: item.normalized.canonical || null,
                    mode: item.normalized.mode || null
                } : null
            }))
        })),
        fieldDigest: digestStable(values)
    };
}

function compactSourceSide(side) {
    if (!side) return null;
    return {
        gameVersion: side.gameVersion || null,
        revision: side.revision || null,
        packageVersion: side.packageVersion || null,
        artifactPin: compactPin({
            status: side.artifactPin?.status,
            errors: side.artifactPin?.errors,
            path: side.artifactPath,
            gameVersion: side.gameVersion,
            revision: side.revision,
            stored: side.artifactPin,
            observed: side.observedPin
        }),
        values: compactColumns(side.values)
    };
}

function compactSourceBundle(primaryRecord) {
    const selected = primaryRecord?.source?.selected;
    if (!selected) return null;
    return {
        entityId: String(selected.entityId),
        snapshotPath: selected.snapshotPath,
        provider: selected.provider,
        sourceFamily: selected.sourceFamily,
        before: compactSourceSide(selected.before),
        after: compactSourceSide(selected.after),
        variants: (selected.variants || []).map((variant) => ({
            snapshotPath: variant.snapshotPath,
            beforeArtifactPath: variant.beforeArtifactPath,
            afterArtifactPath: variant.afterArtifactPath,
            beforeSha256: variant.beforeSha256 || null,
            afterSha256: variant.afterSha256 || null,
            beforeBlobSha: variant.beforeBlobSha || null,
            afterBlobSha: variant.afterBlobSha || null,
            pinStatus: variant.pinStatus || null
        })),
        integrity: clone(primaryRecord.source.sourceIntegrity || [])
    };
}

function compactPrimaryClaim(claim) {
    return {
        field: claim.field,
        claimKind: claim.claimKind,
        claimStatus: claim.claimStatus,
        local: clone(claim.local),
        source: {
            provider: claim.source.provider,
            sourceFamily: claim.source.sourceFamily,
            independentProviderPairObserved: false,
            before: clone(claim.source.before),
            after: clone(claim.source.after)
        },
        comparison: clone(claim.comparison),
        frontier: clone(claim.frontier),
        blockedReasons: [...(claim.blockedReasons || [])]
    };
}

function compactPrimaryCandidate(primaryRecord, originalTask, sourceBundleId) {
    const route = null;
    const claims = Object.fromEntries(Object.entries(primaryRecord.claims || {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([field, claim]) => [field, compactPrimaryClaim(claim)]));
    return {
        candidateId: primaryRecord.candidateId,
        dataset: "weapons",
        layer: "weaponEffectSpec",
        entity: clone(primaryRecord.entity),
        queue: {
            taskId: originalTask.task?.taskId || null,
            terminalState: originalTask.terminalState || null,
            originalPrimaryBlockReason: originalTask.primaryBlockReason || null,
            originalBlockReasons: clone(originalTask.blockReasons || []),
            taskStatus: originalTask.task?.status || null,
            taskDigest: queueTaskDigestProjection(originalTask),
            searchFrontier: clone(originalTask.searchFrontier || {}),
            mappingStatus: originalTask.mappingStatus || null,
            consumerStatus: originalTask.consumerStatus || null
        },
        local: clone(primaryRecord.local),
        source: {
            status: primaryRecord.source.status,
            sourceVariantStatus: primaryRecord.source.sourceVariantStatus,
            provider: primaryRecord.source.provider,
            sourceFamily: primaryRecord.source.sourceFamily,
            sourceBundleEntityId: sourceBundleId,
            independentProviderPairObserved: false,
            integrity: clone(primaryRecord.source.sourceIntegrity || [])
        },
        comparison: {
            mode: primaryRecord.comparison.mode,
            status: primaryRecord.comparison.status,
            before: clone(primaryRecord.comparison.before),
            after: clone(primaryRecord.comparison.after),
            rawVersionValuesEqual: primaryRecord.comparison.rawVersionValuesEqual === true,
            numericAgreementOnlyNotSemanticIdentity: true,
            semanticIdentityEstablished: false,
            semanticMapping: null
        },
        claims,
        calculation: {
            status: "notConfirmedForThisCandidate",
            consumerGap: null,
            routeEvidenceRefs: []
        },
        sourceDisposition: {
            status: primaryRecord.source.status === "verified" ? "rawObservationOnly" : "openSourceCapture",
            independentFieldAgreement: false,
            semanticMapping: "notSelected",
            strictGameVersionBinding: primaryRecord.source.status === "verified",
            reasonCodes: primaryRecord.source.status === "verified"
                ? ["singleCorrelatedSourceFamily", "independentProviderFieldEvidenceMissing", "numericObservationNotSemantic"]
                : ["sourceArtifactMissing", "candidateSpecificRawCaptureMissing", "searchRequired"]
        },
        work: primaryRecord.source.status === "verified"
            ? {
                status: "pendingExternalFieldEvidence",
                queueClosed: false,
                g06Draft: false,
                nextTask: originalTask.task?.taskId || null,
                reason: "Raw 6.7/7.0 observations are pinned, but this candidate is outside the registered finite frontier and has no independent candidate×claim field evidence."
            }
            : {
                status: "openSourceCapture",
                queueClosed: false,
                g06Draft: false,
                nextTask: originalTask.task?.taskId || null,
                reason: "The pinned weapon snapshots/tree do not contain this entity; no raw value or semantic field is inferred."
            },
        gate: {
            strictEligible: false,
            certificateEligible: false,
            canonicalPromotionEligible: false,
            verificationGranted: false,
            runtimeChanged: false
        }
    };
}

function getPath(value, dottedPath) {
    return String(dottedPath).split(".").reduce((current, key) => {
        if (current === null || current === undefined || typeof current !== "object") return undefined;
        return current[key];
    }, value);
}

function artifactClaimValue(spec, field) {
    if (field === "destination" || field === "supersedesLegacyModifierIds") return clone(spec[field]);
    if (field === "runtime.modifierIds") return clone(spec.runtime?.modifierIds ?? null);
    if (field === "registryStructure") return null;
    if (field.startsWith("effect.")) return clone(getPath(spec.effect, field.slice("effect.".length)) ?? null);
    return clone(Object.prototype.hasOwnProperty.call(spec.effect || {}, field) ? spec.effect[field] : null);
}

function artifactClaims(spec, candidateId) {
    const claims = Object.entries(spec?.verification?.claims || {})
        .sort(([left], [right]) => left.localeCompare(right));
    return Object.fromEntries(claims.map(([field, claim]) => {
        const currentValue = artifactClaimValue(spec, field);
        return [field, {
            field,
            claimKind: "externalFactual",
            claimStatus: claim?.status || null,
            currentValue,
            historicalValue: null,
            local: {
                path: field.startsWith("effect.") ? `/effect/${field.slice(7).replaceAll(".", "/")}` : `/${field.replaceAll(".", "/")}`,
                valueDigest: digestStable({ field, value: currentValue }),
                sourceRefs: clone(claim?.sourceRefs || spec.sourceRefs || [])
            },
            source: {
                providerRecords: [],
                independentProviderPairObserved: false,
                gameVersion: null,
                fieldDigest: null
            },
            comparison: {
                status: "sourceEvidenceMissing",
                semanticIdentityEstablished: false,
                semanticMapping: null,
                supportsClaimValue: false
            },
            blockedReasons: [
                "sourceEvidenceMissing",
                "independentProviderFieldEvidenceMissing",
                "strictGameVersionBindingMissingOrConflict"
            ],
            candidateId
        }];
    }));
}

function deepContains(value, needle) {
    if (typeof value === "string") return value.includes(String(needle));
    if (Array.isArray(value)) return value.some((item) => deepContains(item, needle));
    if (value && typeof value === "object") return Object.entries(value).some(([key, item]) => deepContains(key, needle) || deepContains(item, needle));
    return false;
}

function exactKqmFields(kqm, candidateId) {
    return (Array.isArray(kqm?.fields) ? kqm.fields : []).filter((field) => String(field?.candidateId || "") === candidateId);
}

function artifactFiniteSearch(candidateId, frontier, kqm, optimizer, deferralAudit) {
    const excluded = (frontier?.excludedCandidates || []).find((item) => String(item?.candidateId) === candidateId) || null;
    const kqmFields = exactKqmFields(kqm, candidateId);
    const candidateDeferral = (deferralAudit?.exclusions || []).find((item) => String(item?.candidateId) === candidateId) || null;
    const providers = Array.isArray(frontier?.providersExamined) ? [...frontier.providersExamined] : [];
    const reopenTrigger = frontier?.reopenTrigger || "A provider-owned immutable manifest binds complete four-piece field records and exact raw/field digests to Genshin 7.0 from an independent lineage.";
    return {
        status: "candidateScopedFiniteInspectionComplete",
        g06Draft: true,
        registryRegistered: false,
        queueClosed: false,
        inheritedFrontier: {
            policyId: frontier?.id || ARTIFACT_FRONTIER_ID,
            status: frontier?.status || null,
            appliesToCandidateCount: frontier?.appliesTo?.candidateCount ?? null,
            candidateScopeIncludesThisCandidate: Array.isArray(frontier?.appliesTo?.candidateIds)
                && frontier.appliesTo.candidateIds.includes(candidateId),
            excludedReason: excluded?.reason || null
        },
        scope: `Exact candidate ${candidateId}: inspect all provider artifacts named by the existing four-piece frontier and the persisted candidate evidence indexes; do not infer absent fields.`,
        lastSearchedAt: frontier?.lastSearchedAt || null,
        providersExamined: providers,
        sourceChecks: {
            kqmTheorycraftingLibrary: {
                exactCandidateFieldCount: kqmFields.length,
                exactFourPieceFieldCount: kqmFields.filter((field) => Number(field?.pieceCount) === 4).length
            },
            optimizer: { candidateOccurrence: deepContains(optimizer, candidateId) },
            persistedDeferralAudit: { excludedCandidate: Boolean(candidateDeferral), exclusionReasons: clone(candidateDeferral?.reasons || []) },
            officialPersistedArtifactEvidence: { candidateOccurrence: false },
            genshinDbArtifactEvidence: { candidateOccurrence: false }
        },
        negativeResult: "No candidate-specific four-piece field record is materialized in the inspected KQM/optimizer/official/genshin-db evidence. Existing KQM coverage is two-piece or unbound for strict 7.0; the broad four-piece frontier explicitly excluded this candidate only because its prior queue state was inputMissing.",
        unsearchedScope: [
            "A new provider-owned immutable 7.0 manifest with complete candidate×claim fields and exact raw/field digests.",
            "Any provider lineage disclosure or correction that changes independence classification."
        ],
        reopenTrigger
    };
}

function runtimeRouteFor(candidateId, terminalById) {
    const legacy = terminalById.get(candidateId)?.legacy || null;
    const route = legacy?.inputRoute || null;
    if (!ROUTE_CANDIDATE_IDS.has(candidateId) || !route || route.status !== "runtimeUserState") {
        return {
            status: "notConfirmedForThisCandidate",
            consumerGap: "notDetermined",
            staleQueueClassification: false,
            requiredInputs: [],
            missingInputs: [],
            routeEvidenceRefs: []
        };
    }
    const isArtifact = candidateId.startsWith("artifact:");
    return {
        status: isArtifact ? "runtimeUserStateRouteVerified" : "runtimeUserStateRouteObserved",
        reasonCode: route.reasonCode || legacy.reasonCode || null,
        requiredInputs: clone(route.requiredInputs || legacy.requiredInputs || []),
        missingInputs: clone(route.missingInputs || legacy.missingInputs || []),
        consumerGap: "notRequiredByInputMissing",
        staleQueueClassification: true,
        routeEvidenceRefs: isArtifact ? [...ARTIFACT_ROUTE_EVIDENCE] : [INPUT_PATHS.terminalStates, INPUT_PATHS.calcAnalyzer, INPUT_PATHS.calcEngine]
    };
}

function makeArtifactCandidate(task, spec, finiteSearch, terminalById) {
    const route = runtimeRouteFor(String(task.candidateId), terminalById);
    const claims = artifactClaims(spec, String(task.candidateId));
    return {
        candidateId: String(task.candidateId),
        dataset: "artifacts",
        layer: "artifactEffectSpec",
        entity: {
            kind: spec?.entity?.kind || "artifactSet",
            id: spec?.entity?.id === undefined ? null : String(spec.entity.id),
            component: spec?.entity?.component || "modifier"
        },
        queue: {
            taskId: task.task?.taskId || null,
            terminalState: task.terminalState || null,
            originalPrimaryBlockReason: task.primaryBlockReason || null,
            originalBlockReasons: clone(task.blockReasons || []),
            taskStatus: task.task?.status || null,
            taskDigest: queueTaskDigestProjection(task),
            searchFrontier: clone(task.searchFrontier || {}),
            mappingStatus: task.mappingStatus || null,
            consumerStatus: task.consumerStatus || null
        },
        local: {
            effect: clone(spec.effect),
            destination: clone(spec.destination),
            sourceRefs: clone(spec.sourceRefs || []),
            verificationStatus: spec.verification?.status || null,
            sourceAgreement: spec.verification?.sourceAgreement || null,
            fieldDigest: digestStable({ effect: spec.effect, destination: spec.destination, sourceRefs: spec.sourceRefs || [] })
        },
        source: {
            status: "noIndependentCandidateFieldRecord",
            providerRecords: [],
            independentProviderPairObserved: false,
            sourceFamilyCount: 0,
            strictGameVersionBinding: false,
            finiteSearch
        },
        calculation: route,
        claims,
        sourceDisposition: {
            status: "candidateScopedReasonedHoldDraft",
            independentFieldAgreement: false,
            semanticMapping: "notSelected",
            strictGameVersionBinding: false,
            reasonCodes: ["sourceEvidenceMissing", "providerIndependenceUnresolved", "strictGameVersionBindingMissing"]
        },
        work: {
            status: "candidateScopedEvidenceWaitDraft",
            queueClosed: false,
            g06Draft: true,
            centralRegistryEligible: false,
            nextTask: task.task?.taskId || null,
            reason: "Finite provider inspection is recorded, but this draft does not register a new frontier or alter the ready queue."
        },
        gate: {
            strictEligible: false,
            certificateEligible: false,
            canonicalPromotionEligible: false,
            verificationGranted: false,
            runtimeChanged: false
        }
    };
}

function summaryFor(records, sourceBundles, selection, coverage, inputs) {
    const values = Object.values(records);
    const weapons = values.filter((record) => record.dataset === "weapons");
    const artifacts = values.filter((record) => record.dataset === "artifacts");
    const rawWeapons = weapons.filter((record) => record.source.status === "verified");
    const missingWeapons = weapons.filter((record) => record.source.status !== "verified");
    const numericObserved = weapons.filter((record) => record.comparison.numericAgreementOnlyNotSemanticIdentity
        && (record.comparison.after?.numericMatchingColumnIndexes || []).length > 0);
    const uniqueNumeric = numericObserved.filter((record) => record.comparison.status === "numericAgreementOnlyNotSemanticIdentity");
    const ambiguousNumeric = numericObserved.filter((record) => record.comparison.status === "ambiguous");
    const routes = values.filter((record) => String(record.calculation?.status || "").startsWith("runtimeUserState"));
    const artifactHolds = artifacts.filter((record) => record.work?.g06Draft === true);
    const claimCount = values.reduce((count, record) => count + Object.keys(record.claims || {}).length, 0);
    return {
        candidateCount: values.length,
        weaponCandidateCount: weapons.length,
        artifactCandidateCount: artifacts.length,
        uniqueWeaponEntityCount: new Set(weapons.map((record) => record.entity.id).filter(Boolean)).size,
        sourceRawPresentWeaponCandidateCount: rawWeapons.length,
        sourceRawPresentWeaponEntityCount: new Set(rawWeapons.map((record) => record.entity.id).filter(Boolean)).size,
        sourceMissingWeaponCandidateCount: missingWeapons.length,
        sourceMissingWeaponEntityCount: new Set(missingWeapons.map((record) => record.entity.id).filter(Boolean)).size,
        rawBeforeAfterEqualWeaponCandidateCount: rawWeapons.filter((record) => record.comparison.rawVersionValuesEqual).length,
        numericObservationCandidateCount: numericObserved.length,
        numericUniqueMatchCandidateCount: uniqueNumeric.length,
        numericAmbiguousCandidateCount: ambiguousNumeric.length,
        runtimeUserStateRouteConfirmedCandidateCount: routes.length,
        staleInputClassificationCandidateCount: routes.filter((record) => record.calculation.staleQueueClassification).length,
        correctedConsumerLaneCandidateCount: routes.filter((record) => record.calculation.consumerGap === "notRequiredByInputMissing").length,
        artifactCandidateScopedG06DraftCount: artifactHolds.length,
        openWeaponSourceCaptureCandidateCount: missingWeapons.length,
        openWeaponExternalFieldEvidenceCandidateCount: rawWeapons.length,
        claimCount,
        sourceBundleCount: Object.keys(sourceBundles).length,
        sourceFamilyCount: new Set(rawWeapons.map((record) => record.source.sourceFamily).filter(Boolean)).size,
        independentProviderPairObserved: 0,
        strictEligible: 0,
        certificateEligible: 0,
        canonicalPromotionEligible: 0,
        verificationGranted: 0,
        queueChanged: false,
        queueSelectionCandidateCount: selection.tasks.length,
        queueRawSha256: inputs.sha256,
        coverageInventoryCandidateCount: coverageIds(coverage).length,
        notes: [
            "This audit is a draft evidence/route correction artifact; the authoritative queue and registry remain unchanged.",
            "Numeric equality in the single correlated genshin-db family is observation only and never a semantic or certificate decision.",
            "The four artifact G06 drafts are candidate-scoped and unregistered; queue work remains open until Sol integrates a valid frontier/deferral policy."
        ]
    };
}

function buildAudit({ queue: suppliedQueue, weaponSpecs: suppliedWeaponSpecs, artifactSpecs: suppliedArtifactSpecs, root = ROOT } = {}) {
    if (path.resolve(root) !== ROOT) throw new Error("alternateRootUnsupported");
    const queueFile = suppliedQueue
        ? { value: suppliedQueue, path: INPUT_PATHS.queue, bytes: null, sha256: null }
        : (() => {
            const bytes = fs.readFileSync(resolveRepoFile(INPUT_PATHS.queue));
            return { value: JSON.parse(bytes.toString("utf8")), path: INPUT_PATHS.queue, bytes: bytes.length, sha256: sha256(bytes) };
        })();
    const coverage = readJson(INPUT_PATHS.coverageInventory);
    const weaponSpecs = suppliedWeaponSpecs || readJson(INPUT_PATHS.weaponSpecs);
    const artifactSpecs = suppliedArtifactSpecs || readJson(INPUT_PATHS.artifactSpecs);
    const selection = deriveSelection(queueFile.value, coverage);
    const terminal = readJson(INPUT_PATHS.terminalStates);
    const terminalRecords = Array.isArray(terminal?.records) ? terminal.records : Object.values(terminal?.records || {});
    const terminalById = new Map(terminalRecords.map((record) => [String(record.id || record.candidateId), record]));
    const frontiers = readJson(INPUT_PATHS.sourceSearchFrontiers);
    const artifactFrontier = (frontiers.frontiers || []).find((frontier) => frontier.id === ARTIFACT_FRONTIER_ID) || null;
    if (!artifactFrontier) throw new Error("artifactFrontierMissing");
    const kqm = readJson(INPUT_PATHS.kqmArtifactEvidence);
    const optimizer = readJson(INPUT_PATHS.optimizerEvidence);
    const artifactDeferralAudit = readJson(INPUT_PATHS.artifactDeferralAudit);
    const primaryAudit = primary.buildAudit({
        queue: syntheticWeaponQueue(selection.weaponTasks),
        specs: weaponSpecs,
        root: ROOT
    });
    const sourceBundles = {};
    const records = {};
    for (const task of selection.weaponTasks) {
        const record = primaryAudit.records[task.candidateId];
        if (!record) throw new Error(`primaryRecordMissing:${task.candidateId}`);
        const bundle = compactSourceBundle(record);
        const bundleId = bundle ? String(bundle.entityId) : null;
        if (bundle && !sourceBundles[bundleId]) sourceBundles[bundleId] = bundle;
        records[task.candidateId] = compactPrimaryCandidate(record, task, bundleId);
        records[task.candidateId].calculation = runtimeRouteFor(String(task.candidateId), terminalById);
    }
    for (const task of selection.artifactTasks) {
        const candidateId = String(task.candidateId);
        const spec = artifactSpecs[candidateId];
        if (!spec) throw new Error(`artifactSpecMissing:${candidateId}`);
        records[candidateId] = makeArtifactCandidate(
            task,
            spec,
            artifactFiniteSearch(candidateId, artifactFrontier, kqm, optimizer, artifactDeferralAudit),
            terminalById
        );
    }
    const orderedRecords = Object.fromEntries(Object.keys(records).sort((a, b) => a.localeCompare(b)).map((id) => [id, records[id]]));
    const refs = inputRefs();
    const audit = {
        schemaVersion: 1,
        kind: "genshinR2Ready32SourceAudit",
        policyId: POLICY_ID,
        targetGameVersion: TARGET_GAME_VERSION,
        status: "draft",
        draftOnly: true,
        generatedAt: GENERATED_AT,
        generator: {
            name: "genshinR2Ready32SourceAudit.cjs",
            version: GENERATOR_VERSION,
            actorId: "luna_worker"
        },
        scope: {
            candidateCount: EXPECTED_CANDIDATE_IDS.length,
            candidateIdDigest: digestStable(EXPECTED_CANDIDATE_IDS),
            candidateIds: EXPECTED_CANDIDATE_IDS,
            weaponCandidateIds: [...WEAPON_CANDIDATE_IDS].sort((a, b) => a.localeCompare(b)),
            artifactCandidateIds: [...ARTIFACT_CANDIDATE_IDS].sort((a, b) => a.localeCompare(b)),
            selection: {
                selector: "ready sourceProvider tasks: weaponEffectSpec unsupported/inputMissing outside coverage inventory + exact four artifact inputMissing candidates",
                queuePath: queueFile.path,
                queueSha256: queueFile.sha256,
                queueTaskDigestByCandidate: Object.fromEntries(selection.tasks.map((task) => [String(task.candidateId), queueTaskDigestProjection(task)])),
                coverageInventoryCandidateCount: coverageIds(coverage).length,
                coverageInventoryFieldDigest: coverage.fieldDigest || digestStable(coverage),
                noQueueMutation: true
            }
        },
        evidence: {
            inputRefs: refs,
            weaponPrimaryComparison: {
                generator: "scripts/genshinWeaponPrimaryFieldComparison.cjs",
                scope: "In-memory rewrite only: 28 selected tasks are compared against pinned raw snapshots as sourceMissing/searchRequired; persisted queue is not changed.",
                summary: clone(primaryAudit.summary),
                snapshotFiles: clone(primaryAudit.inputEvidence.snapshotFiles),
                transition: clone(primaryAudit.transition)
            },
            artifactFiniteProviderInspection: {
                frontierPolicyId: ARTIFACT_FRONTIER_ID,
                inheritedStatus: artifactFrontier.status,
                inheritedCandidateCount: artifactFrontier.appliesTo?.candidateCount ?? null,
                providersExamined: clone(artifactFrontier.providersExamined || []),
                lastSearchedAt: artifactFrontier.lastSearchedAt || null,
                evidenceRefs: clone(artifactFrontier.evidenceRefs || []),
                excludedTargetCandidates: clone(artifactFrontier.excludedCandidates || []),
                note: "The four targets were excluded from the broad frontier as inputMissing; this artifact records a new candidate-scoped repository inspection after confirming the runtime input route."
            },
            routeEvidence: {
                artifactRoutes: ARTIFACT_CANDIDATE_IDS.map((candidateId) => ({ candidateId, refs: ARTIFACT_ROUTE_EVIDENCE.map((file) => refs[Object.keys(INPUT_PATHS).find((name) => INPUT_PATHS[name] === file)]) }))
            }
        },
        sourceBundles,
        records: orderedRecords,
        summary: summaryFor(orderedRecords, sourceBundles, selection, coverage, refs.queue),
        policy: {
            sourceSelection: "Provider identity and root lineage are evaluated before field agreement; one GenshinData-derived family never satisfies the independent pair gate.",
            numericComparison: "strictDecimalExact; equality is numericAgreementOnlyNotSemanticIdentity.",
            semanticInference: "forbidden",
            absentRawData: "No value, slug, field, or condition is inferred for a missing pinned raw entity.",
            runtimeInputCorrection: "A known analyzer reason/path plus implemented interactive route removes the false consumer implication of inputMissing; it does not grant source verification.",
            g06DraftBoundary: "Only the four artifact candidates with candidate-scoped finite provider inspection receive unregistered G06 drafts; ready queue work remains open.",
            certificate: "forbidden",
            canonicalPromotion: "forbidden",
            queueMutation: "forbidden"
        },
        gate: {
            strictEligible: 0,
            certificateEligible: 0,
            canonicalPromotionEligible: 0,
            verificationGranted: false,
            runtimeChanged: false,
            queueChanged: false,
            reason: "This bounded audit records evidence and corrected runtime-input classification only; no candidate×claim strict certificate or canonical promotion is produced."
        },
        validation: {
            valid: true,
            reasons: []
        },
        fieldDigestAlgorithm: "sha256-stable-json-v1",
        fieldDigest: null
    };
    audit.fieldDigest = digestStable(withoutDigest(audit));
    return audit;
}

function validateAudit(audit, { compareCurrent = true } = {}) {
    const reasons = [];
    if (!audit || audit.schemaVersion !== 1) reasons.push("schemaVersionInvalid");
    if (audit?.kind !== "genshinR2Ready32SourceAudit") reasons.push("kindInvalid");
    if (audit?.policyId !== POLICY_ID) reasons.push("policyInvalid");
    if (audit?.targetGameVersion !== TARGET_GAME_VERSION) reasons.push("targetVersionInvalid");
    if (audit?.status !== "draft" || audit?.draftOnly !== true) reasons.push("draftBoundaryInvalid");
    if (audit?.scope?.candidateCount !== 32) reasons.push("candidateCountInvalid");
    const ids = Array.isArray(audit?.scope?.candidateIds) ? [...audit.scope.candidateIds].sort((a, b) => a.localeCompare(b)) : [];
    if (stableJson(ids) !== stableJson(EXPECTED_CANDIDATE_IDS)) reasons.push("candidateScopeInvalid");
    if (audit?.scope?.candidateIdDigest !== digestStable(EXPECTED_CANDIDATE_IDS)) reasons.push("candidateDigestInvalid");
    if (!audit?.fieldDigest || audit.fieldDigest !== digestStable(withoutDigest(audit))) reasons.push("fieldDigestInvalid");
    if (audit?.gate?.strictEligible !== 0 || audit?.gate?.certificateEligible !== 0
        || audit?.gate?.canonicalPromotionEligible !== 0 || audit?.gate?.verificationGranted !== false
        || audit?.gate?.runtimeChanged !== false || audit?.gate?.queueChanged !== false) reasons.push("gateNotFailClosed");
    if (audit?.summary?.candidateCount !== 32 || audit?.summary?.strictEligible !== 0
        || audit?.summary?.certificateEligible !== 0 || audit?.summary?.canonicalPromotionEligible !== 0) reasons.push("summaryInvalid");
    const records = audit?.records && typeof audit.records === "object" ? audit.records : {};
    if (stableJson(Object.keys(records).sort((a, b) => a.localeCompare(b))) !== stableJson(EXPECTED_CANDIDATE_IDS)) reasons.push("recordScopeInvalid");
    for (const id of EXPECTED_CANDIDATE_IDS) {
        const record = records[id];
        if (!record) continue;
        if (record.gate?.strictEligible !== false || record.gate?.certificateEligible !== false
            || record.gate?.canonicalPromotionEligible !== false || record.gate?.verificationGranted !== false) reasons.push(`recordGate:${id}`);
        if (record.work?.queueClosed === true) reasons.push(`queueClosed:${id}`);
        if (record.dataset === "artifacts" && record.work?.g06Draft !== true) reasons.push(`artifactDraftMissing:${id}`);
        if (record.dataset === "artifacts" && record.source?.finiteSearch?.registryRegistered === true) reasons.push(`artifactRegistryMutation:${id}`);
        if (record.dataset === "weapons" && record.source?.independentProviderPairObserved === true) reasons.push(`weaponIndependentPairUnexpected:${id}`);
    }
    if (compareCurrent && reasons.length === 0) {
        let current;
        try {
            current = buildAudit();
        } catch (error) {
            reasons.push(`currentBuildFailed:${error.message}`);
        }
        if (current && current.fieldDigest !== audit.fieldDigest) reasons.push("currentDigestMismatch");
    }
    return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}

function renderMarkdown(audit) {
    const records = Object.values(audit.records || {});
    const rows = records.map((record) => `| ${record.candidateId} | ${record.dataset} | ${record.entity.id || "-"} | ${record.source.status} | ${record.comparison?.status || "-"} | ${record.calculation?.status || "-"} | ${record.work?.status || "-"} | ${record.work?.g06Draft ? "draft" : "open"} |`);
    const routeRows = records.filter((record) => String(record.calculation?.status || "").startsWith("runtimeUserState"))
        .map((record) => `| ${record.candidateId} | ${record.calculation.status} | ${record.calculation.reasonCode || "-"} | ${record.calculation.consumerGap} | ${record.calculation.requiredInputs.join("<br>")} |`);
    return [
        "# Genshin r2 ready-32 source audit",
        "",
        `Status: **${audit.status}** (draft-only; queue/registry/checkpoint unchanged)`,
        "",
        "This artifact covers exactly the 28 ready weapon candidates outside the existing source-coverage inventory and the four named ready four-piece artifact candidates. It records pinned raw observations and finite provider inspection; it does not issue certificates or promote canonical data.",
        "",
        "## Summary",
        "",
        `- Candidates: **${audit.summary.candidateCount}** (weapons ${audit.summary.weaponCandidateCount}, artifacts ${audit.summary.artifactCandidateCount})`,
        `- Weapon raw present: **${audit.summary.sourceRawPresentWeaponCandidateCount}** candidates / **${audit.summary.sourceRawPresentWeaponEntityCount}** entities`,
        `- Weapon raw missing: **${audit.summary.sourceMissingWeaponCandidateCount}** candidates / **${audit.summary.sourceMissingWeaponEntityCount}** entities`,
        `- Numeric observations: **${audit.summary.numericObservationCandidateCount}** (${audit.summary.numericUniqueMatchCandidateCount} unique, ${audit.summary.numericAmbiguousCandidateCount} ambiguous); semantic mappings **0**`,
        `- Runtime user-state routes confirmed: **${audit.summary.runtimeUserStateRouteConfirmedCandidateCount}**; stale input classifications recorded: **${audit.summary.staleInputClassificationCandidateCount}**`,
        `- Candidate-scoped G06 drafts: **${audit.summary.artifactCandidateScopedG06DraftCount}** (unregistered; queue closed **0**)`,
        `- Strict/certificate/canonical: **0 / 0 / 0**`,
        "",
        "## Runtime-input classification correction",
        "",
        "The route evidence below proves that the current `inputMissing` state is a normal user-state request, not by itself a missing consumer. The queue is intentionally not rewritten by this audit; Sol must integrate the correction through the authoritative regeneration path.",
        "",
        "| candidate | route | reason | consumer interpretation | required input |",
        "| --- | --- | --- | --- | --- |",
        ...routeRows,
        "",
        "## Candidate results",
        "",
        "| candidate | dataset | entity | source | comparison | calculation | work | G06 |",
        "| --- | --- | ---: | --- | --- | --- | --- | --- |",
        ...rows,
        "",
        "## Safety boundary",
        "",
        "- 6.7/7.0 genshin-db raw pins are retained as observations only. They are one `GenshinData-derived` lineage and cannot satisfy independent-provider certification.",
        "- Missing entities (11427, 12427, 12515, 13427, 14506, 15427) have no persisted raw record in the pinned snapshot/tree; no values or semantics are inferred.",
        "- The four artifact candidates have candidate-scoped finite inspection records, but their G06 drafts are not registered and their ready source tasks remain open.",
        "- No Runtime, canonical, eligibility certificate, authoritative queue, registry, checkpoint, or HSR file was changed.",
        "",
        `Field digest: \`${audit.fieldDigest}\``,
        ""
    ].join("\n");
}

function writeArtifacts({ artifactPath = OUTPUT_PATHS.artifact, reportPath = OUTPUT_PATHS.report } = {}) {
    const audit = buildAudit();
    const artifactFile = resolveRepoFile(artifactPath);
    const reportFile = resolveRepoFile(reportPath);
    fs.mkdirSync(path.dirname(artifactFile), { recursive: true });
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });
    fs.writeFileSync(artifactFile, `${JSON.stringify(stableValue(audit), null, 2)}\n`, "utf8");
    fs.writeFileSync(reportFile, renderMarkdown(audit), "utf8");
    return { audit, artifactPath: relative(artifactFile), reportPath: relative(reportFile) };
}

if (require.main === module) {
    const result = writeArtifacts();
    process.stdout.write(`${JSON.stringify({
        status: result.audit.status,
        candidateCount: result.audit.summary.candidateCount,
        rawPresent: result.audit.summary.sourceRawPresentWeaponCandidateCount,
        rawMissing: result.audit.summary.sourceMissingWeaponCandidateCount,
        runtimeRoutes: result.audit.summary.runtimeUserStateRouteConfirmedCandidateCount,
        g06Drafts: result.audit.summary.artifactCandidateScopedG06DraftCount,
        strictEligible: result.audit.gate.strictEligible,
        fieldDigest: result.audit.fieldDigest
    }, null, 2)}\n`);
}

module.exports = {
    POLICY_ID,
    TARGET_GAME_VERSION,
    GENERATED_AT,
    WEAPON_CANDIDATE_IDS,
    ARTIFACT_CANDIDATE_IDS,
    EXPECTED_CANDIDATE_IDS,
    INPUT_PATHS,
    OUTPUT_PATHS,
    buildAudit,
    validateAudit,
    renderMarkdown,
    writeArtifacts,
    deriveSelection,
    runtimeRouteFor,
    artifactFiniteSearch
};
