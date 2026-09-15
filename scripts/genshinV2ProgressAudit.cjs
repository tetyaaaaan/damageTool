"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { buildAudit: buildLegacyAudit } = require("./genshinModifierAudit.cjs");
const { buildTerminalStateAudit } = require("./genshinTerminalStateAudit.cjs");
const { audit: auditUpstreamVersion } = require("./genshinUpstreamVersionAudit.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8"));

function declaredTestInventory() {
    const testRoot = path.join(repositoryRoot, "tests", "genshin");
    const files = fs.readdirSync(testRoot).filter((name) => name.endsWith(".test.cjs")).sort();
    const declared = files.reduce((count, name) => {
        const source = fs.readFileSync(path.join(testRoot, name), "utf8");
        return count + (source.match(/\btest\s*\(/g) || []).length;
    }, 0);
    return { files: files.length, declaredTestCalls: declared, note: "Dynamic loop-generated cases are counted by the Node test runner, not this static inventory." };
}

function buildCompletionMetrics(taskQueue, eligibilityCertificates) {
    const tasks = taskQueue.tasks;
    const count = (rows, predicate) => rows.filter(predicate).length;
    const ratio = (numerator, denominator, unit, basis) => ({
        numerator, denominator,
        percent: denominator > 0 ? Number((100 * numerator / denominator).toFixed(4)) : null,
        unit, basis
    });
    const complete = (row) => row.task.status === "complete";
    const behavior = tasks.filter((row) => row.layer === "behaviorSpec");
    const runtimeLayers = ["weaponEffectSpec", "artifactEffectSpec", "talentGapEffectSpec", "behaviorModifier"];
    const runtime = tasks.filter((row) => runtimeLayers.includes(row.layer) && row.terminalState !== "nonCalculativeComplete");
    const coverage = tasks.filter((row) => row.sourceCoverageReconciliation);
    const talentGap = tasks.filter((row) => row.talentGapReconciliation);
    return {
        overallWorkPercent: null,
        interpretation: "Finite candidate acceptance ratios, not effort/time estimates. Evidence inventory and raw-capture linkage do not satisfy verification or production gates. Cohorts are the current authoritative queue, not an expanding backlog.",
        candidateCompletion: ratio(count(tasks, complete), tasks.length, "candidate", "Current queue task.status=complete; historical verifiedSpec awaiting target-version re-verification is excluded."),
        currentBehaviorSpecCompletion: ratio(count(behavior, complete), behavior.length, "BehaviorSpec candidate", "BehaviorSpec completion only; no Runtime requirement is imposed on this layer and old-version verification is not counted."),
        productionCanonicalCandidates: ratio(count(runtime, (row) => row.terminalState === "productionCanonical" && complete(row)), runtime.length, "Runtime-bearing candidate", "Weapon/artifact/talent-gap EffectSpec and behaviorModifier, excluding explicitly completed non-calculative candidates; counts candidates, not generated modifiers."),
        strictClaimEligibility: ratio(eligibilityCertificates.summary.eligibleCount, eligibilityCertificates.summary.candidateClaimCount, "registered candidate × claim", "Current certificate registry only; not a claim that all required fields of all candidates have been materialized."),
        bulkCaptureLinkage: ratio(count(tasks, (row) => Boolean(row.bulkTransitionCapture)), tasks.length, "candidate annotation", "Queue links to captured transition snapshots; may include historical, partial or ambiguous records. This is not complete field evidence or independent-source coverage."),
        sourceCoverageReconciliation: ratio(taskQueue.summary.sourceCoverageReconciled || 0, coverage.length, "inventory candidate", "Fresh raw-integrity/coverage reconciliation of the explicitly annotated cohort, not source agreement or verification."),
        localizedTalentFieldMapping: ratio(taskQueue.summary.talentGapFieldMappingsResolved || 0, talentGap.length, "talent-gap candidate", "Validated localized-name/provider-key mapping in the bounded reconciliation lane; unresolved Traveler variants remain in the denominator. Mapping does not approve semantics."),
        byDataset: Object.fromEntries([...new Set(tasks.map((row) => row.dataset))].sort().map((dataset) => {
            const rows = tasks.filter((row) => row.dataset === dataset);
            return [dataset, ratio(count(rows, complete), rows.length, "candidate", "Current-version authoritative queue completion within this dataset.")];
        }))
    };
}

function buildProgressAudit() {
    const legacy = buildLegacyAudit();
    const weapons = readJson("games/genshin/data/v2/weapons/index.json").summary;
    const weaponRuntime = readJson("games/genshin/data/v2/weapons/audit.json").summary.runtime;
    const weaponExternalEvidence = readJson("games/genshin/data/v2/weapons/external-evidence.json").summary;
    const weaponConflictTriage = readJson("games/genshin/data/v2/weapons/conflict-triage.json").summary;
    const officialWeaponPilot = readJson("games/genshin/data/v2/weapons/official-pilot.json").summary;
    const optimizerFieldEvidence = readJson("games/genshin/data/v2/external/optimizer-field-evidence.json").summary;
    const kqmArtifactEvidence = readJson("games/genshin/data/v2/external/kqm-artifact-field-evidence.json").summary;
    const gameVersionArtifact = readJson("games/genshin/data/v2/game-version-evidence.json");
    const gameVersionEvidence = gameVersionArtifact.summary;
    const independentWeaponEvidence = readJson("games/genshin/data/v2/weapons/independent-field-evidence.json").summary;
    const reviewReadiness = readJson("games/genshin/data/v2/review-readiness.json").summary;
    const reviewPackets = readJson("games/genshin/data/v2/review-packets/index.json");
    const artifacts = readJson("games/genshin/data/v2/artifacts/index.json").summary;
    const artifactRuntime = readJson("games/genshin/data/v2/artifacts/audit.json").summary.runtime;
    const behavior = readJson("games/genshin/data/v2/characters/behavior-pilot.json").summary;
    const behaviorInventory = readJson("games/genshin/data/v2/characters/behavior-inventory-audit.json").summary;
    const behaviorBatches = readJson("games/genshin/data/v2/characters/behavior-batches/index.json").summary;
    const characters = readJson("games/genshin/data/v2/characters/coverage.json").summary;
    const talentGaps = readJson("games/genshin/data/v2/characters/talent-gap-candidates.json").summary;
    const characterExternalEvidence = readJson("games/genshin/data/v2/characters/external-field-evidence.json").summary;
    const characterFieldMaterialization = readJson("games/genshin/data/v2/characters/field-materialization.json").summary;
    const constellations = readJson("reports/genshin-constellation-source-inference-v2.json").summary;
    const dualSource = readJson("reports/genshin-v2-dual-source-audit.json").summary;
    const canonicalRuntime = readJson("games/genshin/data/v2/runtime/canonical-runtime.json").summary;
    const canonicalAudit = readJson("reports/genshin-canonical-runtime-audit.json").repository;
    const weaponSpecs = readJson("games/genshin/data/v2/weapons/spec-candidates.json");
    const weaponVerificationCounts = Object.values(weaponSpecs).reduce((counts, spec) => {
        const status = spec.verification?.status || "unknown";
        counts[status] = (counts[status] || 0) + 1;
        return counts;
    }, {});
    const canonicalUiRuntimeGap = readJson("reports/genshin-canonical-ui-runtime-gap.json");
    const representativeCanonicalE2e = readJson("reports/genshin-representative-canonical-e2e.json");
    const uidPartyBridge = readJson("reports/genshin-uid-party-bridge-audit.json");
    const manifest = readJson("games/genshin/data/data-v2-manifest.json");
    const eligibilityCertificates = readJson("games/genshin/data/v2/eligibility-certificates.json");
    // Rebuild the terminal audit from the current candidate/source artifacts.
    // Reading the last generated JSON here allowed a stale report to become
    // the progress authority and hid newly available machine tasks.
    const terminalStates = buildTerminalStateAudit();
    const providerPolicy = readJson("games/genshin/data/v2/provider-independence-policy.json");
    const upstreamVersion = auditUpstreamVersion();
    return {
        schemaVersion: 2,
        generatedAt: "2026-08-24T00:00:00.000Z",
        status: upstreamVersion.status === "upstreamVersionAvailable"
            ? "upstreamVersionAvailable"
            : terminalStates.summary.totals.unclassified === 0
            ? terminalStates.taskQueue.status === "machineActionAvailable"
                ? "machineActionAvailable"
                : terminalStates.taskQueue.status === "humanActionAvailable"
                    ? "humanActionAvailable"
                    : terminalStates.taskQueue.status === "reconciliationAvailable"
                        ? "reconciliationAvailable"
                    : terminalStates.taskQueue.status === "complete"
                        ? "complete"
                        : "terminallyClassifiedExternalWait"
            : "migrationInProgress",
        policy: {
            canonicalMeaning: "verified spec, independent providers, game version, human review, generated runtime, UI/calculation regression",
            candidateIsNotCanonical: true,
            percentagePolicy: "Only finite queue-derived ratios are reported; no subjective overall effort percentage or blending of evidence acquisition with completion."
        },
        completionMetrics: buildCompletionMetrics(terminalStates.taskQueue, eligibilityCertificates),
        upstreamVersion,
        goalContinuation: {
            state: terminalStates.taskQueue.summary.readyTasks > 0 ? "active"
                : terminalStates.taskQueue.status === "humanActionAvailable" ? "awaitingUserDecision"
                    : terminalStates.taskQueue.summary.genuinelyBlocked > 0 ? "genuinelyBlocked"
                        : terminalStates.taskQueue.status === "complete" && upstreamVersion.status === "current" ? "complete"
                            : "active",
            complete: terminalStates.taskQueue.status === "complete" && upstreamVersion.status === "current",
            awaitingUserDecision: terminalStates.taskQueue.summary.readyTasks === 0 && terminalStates.taskQueue.status === "humanActionAvailable",
            usageLimited: false,
            genuinelyBlocked: terminalStates.taskQueue.summary.readyTasks === 0 && terminalStates.taskQueue.summary.genuinelyBlocked > 0,
            rule: "blocked classification, partial progress, or retained human/source waits never imply completion while ready lanes or a version transition remain."
        },
        totals: {
            legacyRuntimeModifiers: legacy.summary.total,
            legacyCompatibleRemaining: legacy.summary.total,
            v2CanonicalRuntimeModifiers: canonicalRuntime.activeForProduction || 0,
            v2EffectSpecCandidates: weapons.specs + artifacts.specs + talentGaps.effectSpecCandidates,
            v2BehaviorSpecCandidates: behavior.specs,
            v2BehaviorModifierCandidates: behavior.modifiers,
            v2BehaviorInventoryCandidates: behaviorInventory.candidates,
            v2BehaviorNormalizedCandidates: behaviorBatches.specs
        },
        legacyRuntime: {
            calculable: legacy.summary.calculable,
            bySupportStatus: legacy.summary.bySupportStatus,
            byReasonCode: legacy.summary.byReasonCode,
            displayOnly: legacy.summary.bySupportStatus.displayOnly || 0,
            missingInput: legacy.summary.bySupportStatus.missingInput || 0,
            invalidData: legacy.summary.bySupportStatus.invalidData || 0,
            unsupported: legacy.summary.bySupportStatus.unsupported || 0
        },
        statusInventory: {
            canonicalRuntime: canonicalRuntime.activeForProduction || 0,
            historicalCanonicalPendingRevalidation: canonicalRuntime.inactivePendingRevalidation || 0,
            legacyCompatibleRuntime: legacy.summary.total,
            v2CandidatesAudited: canonicalRuntime.candidatesAudited,
            v2CandidatesExcludedFromCanonical: canonicalRuntime.excluded,
            unverifiedCandidates: canonicalRuntime.excluded,
            sourceInsufficientFieldClaims: dualSource.missingVersionClaims,
            sourceComparisonMismatchesObserved: weaponExternalEvidence.candidateValueConflicts,
            sourceValueConflictsObserved: weaponConflictTriage.genuineValueConflicts,
            sourceRevisionMismatchObserved: (characterFieldMaterialization.blockedReasonCounts?.sourceCatalogRevisionMismatch || 0) > 0,
            unsupportedLegacyRuntime: legacy.summary.bySupportStatus.unsupported || 0,
            displayOnlyLegacyRuntime: legacy.summary.bySupportStatus.displayOnly || 0,
            inputMissingLegacyRuntime: legacy.summary.bySupportStatus.missingInput || 0,
            invalidLegacyRuntime: legacy.summary.bySupportStatus.invalidData || 0,
            explicitGameVersionSources: gameVersionEvidence.explicitGameVersionSources,
            officialVersionScopedSources: officialWeaponPilot.explicitGameVersionSources,
            strictlyBoundGameVersionSources: gameVersionEvidence.strictlyBoundSources,
            eligibilityCertificateEligibleClaims: eligibilityCertificates.summary?.eligibleCount || 0,
            eligibilityCertificateBlockedClaims: eligibilityCertificates.summary?.blockedCount || 0
        },
        targets: {
            weapons: {
                totalEntities: weapons.weapons,
                totalModifiers: weapons.modifiers,
                candidateSpecs: weapons.specs,
                canonical: canonicalAudit.categories?.weapons?.canonical || 0,
                needsReview: weaponVerificationCounts.needsReview || 0,
                verified: weaponVerificationCounts.verified || 0,
                sourceInsufficient: weapons.sourceAgreementByStatus.singleSource || 0,
                runtimeCandidate: weapons.runtimeByStatus.candidate || 0,
                displayOnly: weapons.runtimeByStatus.displayOnly || 0,
                runtimeRouteConnected: weaponRuntime.route.connected,
                runtimeRouteMirrorConnected: weaponRuntime.route.runtimeMirrorConnected,
                supersessionConnected: weaponRuntime.supersession.connected,
                supersessionMirrorConnected: weaponRuntime.supersession.runtimeMirrorConnected,
                namespacedRuntimeIds: weaponRuntime.connected - weaponRuntime.idMismatches.length - weaponRuntime.namespaceMismatches.length,
                contractClaimsNeedsReview: weaponRuntime.contractClaims.needsReview,
                uidHandlingCopied: weaponRuntime.uidHandling.copied,
                uidHandlingClaimsNeedsReview: weaponRuntime.uidHandling.claimNeedsReview
            },
            weaponExternalEvidence: {
                sourceRecords: weaponExternalEvidence.sourceRecords,
                fieldRecords: weaponExternalEvidence.fieldRecords,
                extractedFields: weaponExternalEvidence.eligibleFields,
                supportsClaimValue: weaponExternalEvidence.supportsClaimValueFields,
                candidateValueAgreements: weaponExternalEvidence.candidateValueAgreements,
                candidateValueConflicts: weaponExternalEvidence.candidateValueConflicts,
                needsReview: weaponExternalEvidence.needsReviewFields,
                unmappedSourceFields: weaponExternalEvidence.unmappedSourceFields,
                gameVersionMissingSources: weaponExternalEvidence.gameVersionMissingSourceRecords,
                canonicalEligibleFields: weaponExternalEvidence.canonicalEligibleFields,
                canonical: weaponExternalEvidence.canonicalEligibleCandidates
            },
            weaponConflictTriage: {
                comparisonMismatches: weaponConflictTriage.candidateValueConflicts,
                semanticDiscrepancies: weaponConflictTriage.semanticConflicts,
                mechanicallyResolvedRows: weaponConflictTriage.mechanicallyResolvedRows,
                unmappedSourceFields: weaponConflictTriage.unmappedSourceFields,
                registryMappedSourceFields: weaponConflictTriage.registryMappedSourceFields,
                schemaGapSourceFields: weaponConflictTriage.schemaGapSourceFields,
                classifications: weaponConflictTriage.byClassification,
                dimensions: weaponConflictTriage.byDimension,
                genuineValueConflicts: weaponConflictTriage.genuineValueConflicts,
                canonicalEligibleItems: weaponConflictTriage.canonicalEligibleItems,
                candidatesPromoted: weaponConflictTriage.candidatesPromoted
            },
            officialWeaponPilot: {
                weapons: officialWeaponPilot.weapons,
                officialSources: officialWeaponPilot.officialSources,
                explicitGameVersionSources: officialWeaponPilot.explicitGameVersionSources,
                sourceReviewNeedsReview: officialWeaponPilot.sourceReviewNeedsReview,
                officialClaimFields: officialWeaponPilot.officialClaimFields,
                completeOfficialRefinementClaims: officialWeaponPilot.completeOfficialRefinementClaims,
                rankOneMatches: officialWeaponPilot.rankOneMatches,
                promotionGate: officialWeaponPilot.promotionGate,
                blockedReasonCounts: officialWeaponPilot.blockedReasonCounts,
                canonical: officialWeaponPilot.canonicalEligibility
            },
            optimizerFieldEvidence: {
                sourceRecords: optimizerFieldEvidence.sourceRecords,
                weaponSources: optimizerFieldEvidence.weaponSourceRecords,
                artifactSources: optimizerFieldEvidence.artifactSourceRecords,
                fieldRecords: optimizerFieldEvidence.fieldRecords,
                candidateValueAgreements: optimizerFieldEvidence.supportsClaimValueFields,
                providerIndependence: optimizerFieldEvidence.providerIndependenceCounts,
                independenceGroups: optimizerFieldEvidence.independenceGroups,
                gameVersionMissingSources: optimizerFieldEvidence.gameVersionMissingSourceRecords,
                canonicalEligibleFields: optimizerFieldEvidence.canonicalEligibleFields,
                canonical: optimizerFieldEvidence.canonicalEligibleCandidates
            },
            kqmArtifactEvidence,
            artifacts: {
                totalEntities: artifacts.sets,
                totalModifiers: artifacts.modifiers,
                candidateSpecs: artifacts.specs,
                canonical: 0,
                needsReview: artifacts.verificationByStatus.needsReview || 0,
                sourceInsufficient: artifacts.sourceAgreementByStatus.singleSource || 0,
                structuredModifierMissingEntities: artifacts.blockedSets || artifacts.setsWithoutStructuredModifiers || 7,
                structuredModifierGapReview: artifacts.structuredModifierGapReview,
                inputPolicy: artifacts.inputPolicyByStatus,
                runtimeRouteConnected: artifactRuntime.routeConnected,
                supersessionConnected: artifactRuntime.supersessionConnected,
                namespacedRuntimeIds: artifactRuntime.namespacedIds,
                contractClaimsReviewGated: artifactRuntime.claimsReviewGated
            },
            independentEvidence: {
                claims: dualSource.claims.total,
                dualSourceEligibleClaims: dualSource.dualSourceEligibleClaims,
                dualSourceEligibleCandidates: dualSource.dualSourceEligibleCandidates,
                sameProviderDuplicateClaims: dualSource.sameProviderDuplicateClaims,
                missingVersionClaims: dualSource.missingVersionClaims,
                conflicts: dualSource.conflictClaims,
                canonical: dualSource.canonicalEligibility
            },
            gameVersionEvidence: {
                sources: gameVersionEvidence.sources,
                revisionPinnedSources: gameVersionEvidence.revisionPinnedSources,
                explicitGameVersionSources: gameVersionEvidence.explicitGameVersionSources,
                strictlyBoundSources: gameVersionEvidence.strictlyBoundSources,
                fieldScopedRecords: gameVersionEvidence.fieldScopedRecords,
                strictlyBoundFieldProvenance: gameVersionEvidence.strictlyBoundRecords,
                localSourceRecords: gameVersionEvidence.localSourceRecords,
                localGameVersionPresent: gameVersionEvidence.localGameVersionPresent,
                promotionGate: gameVersionEvidence.promotionGate,
                scopedCanonicalEligibility: gameVersionEvidence.scopedCanonicalEligibility,
                feasibilityStatus: gameVersionArtifact.feasibilityAudit?.status || null,
                providerAssessment: gameVersionArtifact.feasibilityAudit?.providerAssessment || null,
                impact: gameVersionArtifact.feasibilityAudit?.impact || null,
                evidenceModels: gameVersionArtifact.feasibilityAudit?.evidenceModels || [],
                canonical: gameVersionEvidence.canonicalEligibility
            },
            independentWeaponEvidence: {
                records: independentWeaponEvidence.records,
                fieldComparisons: independentWeaponEvidence.fieldComparisons,
                independentProviderPairs: independentWeaponEvidence.independentProviderPairs,
                sameDataminePairs: independentWeaponEvidence.sameDataminePairs,
                fullMatches: independentWeaponEvidence.sourceAgreementFullMatches,
                partialMatches: independentWeaponEvidence.sourceAgreementPartialMatches,
                mismatches: independentWeaponEvidence.sourceAgreementMismatches,
                notComparable: independentWeaponEvidence.sourceAgreementNotComparable,
                independentGameVersionMissingRecords: independentWeaponEvidence.independentGameVersionMissingRecords,
                humanJudgmentRequiredNow: independentWeaponEvidence.humanJudgmentRequiredNow,
                canonical: independentWeaponEvidence.canonicalEligible
            },
            reviewReadiness: {
                claims: reviewReadiness.claims,
                candidates: reviewReadiness.candidates,
                conflictFollowup: reviewReadiness.conflictFollowup,
                futureIndependentReviewRequired: reviewReadiness.futureIndependentReviewRequired,
                canonical: reviewReadiness.canonical
            },
            reviewPackets: {
                packets: reviewPackets.files.length,
                items: reviewPackets.files.reduce((sum, file) => sum + file.items, 0),
                byRecommendation: reviewPackets.files.reduce((counts, file) => {
                    counts[file.recommendation] = (counts[file.recommendation] || 0) + 1;
                    return counts;
                }, {}),
                canonical: reviewPackets.canonicalEligibility,
                verificationPromotions: reviewPackets.verificationPromotions
            },
            canonicalRuntime: {
                candidatesAudited: canonicalRuntime.candidatesAudited,
                generated: canonicalRuntime.canonical,
                activeForProduction: canonicalRuntime.activeForProduction || 0,
                inactivePendingRevalidation: canonicalRuntime.inactivePendingRevalidation || 0,
                excluded: canonicalRuntime.excluded,
                generatorConnected: true,
                loaderGateConnected: true,
                behaviorRuntimeRouteConnected: true,
                explicitDestinationRequired: true,
                explicitSupersessionRequired: true,
                canonical: canonicalRuntime.activeForProduction || 0
            },
            canonicalUiRuntimeE2e: {
                scope: "human-reviewed production representative plus synthetic regression fixture",
                productionCanonical: canonicalRuntime.activeForProduction || 0,
                historicalCanonicalPendingRevalidation: canonicalRuntime.inactivePendingRevalidation || 0,
                fixtureShipped: canonicalUiRuntimeGap.production.fixtureShipped,
                syntheticRawRecords: canonicalUiRuntimeGap.synthetic.rawRecords,
                syntheticCanonicalModifiers: canonicalUiRuntimeGap.synthetic.canonicalModifiers,
                loader: canonicalUiRuntimeGap.synthetic.loader,
                conditionChangesCalculation: canonicalUiRuntimeGap.synthetic.conditionUi.enabledAndDisabledStatesAffectCalculation,
                representative: {
                    target: representativeCanonicalE2e.target,
                    routeEstablished: representativeCanonicalE2e.routeEstablished,
                    strictSources: representativeCanonicalE2e.trace.rawSource.length,
                    loader: representativeCanonicalE2e.trace.canonicalRuntime.loader,
                    ui: representativeCanonicalE2e.trace.ui,
                    calculation: representativeCanonicalE2e.trace.calculation
                },
                result: representativeCanonicalE2e.status
            },
            characters: {
                totalEntities: characters.characters,
                completeLegacyCoverage: characters.byCoverageStatus.complete,
                partialLegacyCoverage: characters.byCoverageStatus.partial,
                unstructuredTalentModifierEntities: characters.missingTalentModifiers,
                referencePackages: manifest.characterPackages.length,
                behaviorPilotEntities: behavior.pilotCharacters,
                behaviorSpecCandidates: behavior.specs,
                behaviorModifierCandidates: behavior.modifiers,
                normalizedBehaviorEntities: behaviorBatches.batchCharacters,
                normalizedBehaviorSpecs: behaviorBatches.specs,
                talentGapSpecCandidates: talentGaps.effectSpecCandidates,
                canonical: 0
            },
            characterExternalEvidence: {
                candidates: characterExternalEvidence.candidates,
                evidenceMappings: characterExternalEvidence.evidenceMappings,
                externalSources: characterExternalEvidence.externalSources,
                materializedSources: characterExternalEvidence.materializationByStatus?.materialized || 0,
                claimValueEvidence: 0,
                gameVersionVerified: characterExternalEvidence.gameVersion !== null,
                needsReview: characterExternalEvidence.verificationByStatus?.needsReview || 0,
                runtimeBlocked: characterExternalEvidence.runtimeByStatus?.blocked || 0,
                canonical: characterExternalEvidence.canonical
            },
            characterFieldMaterialization: {
                characters: characterFieldMaterialization.characters,
                fieldEvidence: characterFieldMaterialization.fieldEvidence,
                materializedSources: characterFieldMaterialization.materializedSources,
                pathVerifiedSources: characterFieldMaterialization.pathVerifiedSources,
                namedSymbolEvidence: characterFieldMaterialization.namedSymbolEvidence,
                gameVersionVerified: characterFieldMaterialization.gameVersionVerified,
                runtimeBlocked: characterFieldMaterialization.runtimeByStatus?.blocked || 0,
                canonical: characterFieldMaterialization.canonical
            },
            eligibilityCertificates: {
                kind: eligibilityCertificates.kind,
                candidateClaimCount: eligibilityCertificates.summary?.candidateClaimCount || 0,
                eligibleCount: eligibilityCertificates.summary?.eligibleCount || 0,
                blockedCount: eligibilityCertificates.summary?.blockedCount || 0,
                eligibleCandidates: terminalStates.eligibilityCertificates.summary.eligibleCandidateCount,
                autoAttestationEligible: terminalStates.taskQueue.summary.autoAttestationEligible,
                promotionEligible: terminalStates.taskQueue.summary.promotionEligible,
                authority: "candidate×claim registry; legacy pair/pilot metadata is diagnostic only"
            },
            talentModifierGaps: {
                totalEntities: talentGaps.characters,
                sourceRecords: talentGaps.passiveSourceRecords,
                candidateSpecs: talentGaps.effectSpecCandidates,
                classification: talentGaps.byCharacterStatus,
                needsReview: talentGaps.byVerificationStatus.needsReview || 0,
                runtimeBlocked: talentGaps.byRuntimeStatus.blocked || 0,
                canonical: talentGaps.canonical
            },
            constellationSourceInference: {
                totalFlagged: constellations.totalFlagged,
                audited: constellations.totalFlagged,
                explicitValueEvidenceOnly: constellations.evidenceClassCounts.explicitEvidence,
                semanticClassification: constellations.semanticClassificationCounts,
                unconfirmed: constellations.evidenceClassCounts.unconfirmed,
                quarantined: constellations.evidenceClassCounts.quarantined,
                canonical: constellations.canonicalEligible
            },
            timingAndCounts: {
                pilotEntities: behavior.pilotCharacters,
                totalCharacterEntities: characters.characters,
                candidateSpecs: behavior.specs,
                candidateModifiers: behavior.modifiers,
                inventoryExpansionEntities: behaviorInventory.expansionCharacters,
                inventoryCandidates: behaviorInventory.candidates,
                inventoryCandidateStatus: behaviorInventory.candidateStatusCounts,
                normalizedBatchEntities: behaviorBatches.batchCharacters,
                normalizedBatchSpecs: behaviorBatches.specs,
                normalizedBatchNeedsReview: behaviorBatches.needsReview,
                normalizedBatchRuntimeBlocked: behaviorBatches.runtimeBlocked,
                normalizedBatchRemainingEntities: behaviorBatches.remainingCharacters,
                normalizedExplicitMeasurements: behaviorBatches.explicitMeasurements,
                canonical: 0
            },
            uidParty: {
                sharedCalculationInput: true,
                profileEvent: true,
                supportMemberConversion: true,
                losslessSupportMember: uidPartyBridge.verdict?.losslessSupportMember === true,
                losslessSupportProjection: uidPartyBridge.verdict?.losslessSupportProjection || null,
                profileSnapshotCalculationInput: uidPartyBridge.verdict?.profileSnapshotCalculationInput === true,
                existingSlotAutoFillOnSelection: true,
                combatStateAutoEnabled: false,
                domE2eClaim: uidPartyBridge.verdict?.domE2eClaim === true,
                talentOrderSourceVerified: false,
                talentOrderFailClosed: true
            },
            terminalStates: {
                status: terminalStates.status,
                totals: terminalStates.summary.totals,
                byLayer: terminalStates.summary.byLayer,
                byDataset: terminalStates.summary.byDataset,
                goalExecution: terminalStates.goalExecution,
                taskQueue: terminalStates.taskQueue,
                completionBoundary: terminalStates.taskQueue.status === "complete"
                    ? "All candidates have completed terminal tasks under the current strict contract."
                    : ["machineActionAvailable", "sourceResearchAvailable", "reconciliationAvailable", "workAvailable"].includes(terminalStates.taskQueue.status)
                        ? "Evidence-derived work remains available; deferred source, semantic, consumer, and human gates remain separate."
                        : "No safe automatic transition remains; reopen only when a recorded source/provider, human-semantic, or consumer precondition changes.",
                providerPolicies: providerPolicy.policies.reduce((counts, policy) => {
                    counts[policy.status] = (counts[policy.status] || 0) + 1;
                    return counts;
                }, {})
            }
        },
        tests: declaredTestInventory()
    };
}

function renderMarkdown(audit) {
    const t = audit.targets;
    return [
        "# Genshin v2 migration progress",
        "",
        "## Finite completion and evidence KPIs",
        "",
        audit.completionMetrics.interpretation,
        "",
        "| KPI | numerator / denominator | percent | basis |",
        "| --- | ---: | ---: | --- |",
        ...Object.entries(audit.completionMetrics).filter(([, metric]) => metric && typeof metric === "object" && "numerator" in metric).map(([name, metric]) =>
            `| ${name} | ${metric.numerator} / ${metric.denominator} | ${metric.percent === null ? "N/A" : `${metric.percent}%`} | ${metric.basis} |`),
        "",
        `- legacy Runtime modifiers: **${audit.totals.legacyRuntimeModifiers}**（全件 legacyCompatible）`,
        `- canonical Runtime modifiers: **${audit.totals.v2CanonicalRuntimeModifiers}**`,
        `- v2 effect candidates: **${audit.totals.v2EffectSpecCandidates}**`,
        `- v2 behavior pilot: **${audit.totals.v2BehaviorSpecCandidates} specs / ${audit.totals.v2BehaviorModifierCandidates} modifiers**`,
        `- v2 behavior inventory: **${audit.totals.v2BehaviorInventoryCandidates} candidates**`,
        `- normalized behavior batches: **${audit.totals.v2BehaviorNormalizedCandidates} specs**（全件 needsReview / Runtime blocked）`,
        `- independently audited field claims: **${t.independentEvidence.claims}**（dual-source eligible ${t.independentEvidence.dualSourceEligibleClaims}）`,
        `- gameVersion evidence: **${t.gameVersionEvidence.revisionPinnedSources} revision-pinned sources / ${t.gameVersionEvidence.strictlyBoundSources} strictly bound sources / ${t.gameVersionEvidence.strictlyBoundFieldProvenance} field provenance / ${t.gameVersionEvidence.canonical} canonical**`,
        `- independent weapon evidence: **${t.independentWeaponEvidence.records} records / ${t.independentWeaponEvidence.fieldComparisons} field comparisons / ${t.independentWeaponEvidence.independentProviderPairs} independent provider pairs / ${t.independentWeaponEvidence.sameDataminePairs} same-lineage pairs / ${t.independentWeaponEvidence.canonical} canonical**`,
        `- review readiness: **${t.reviewReadiness.claims.machineEvidenceRequired} claims require machine evidence / ${t.reviewReadiness.claims.humanReviewReady} human-review ready / ${t.reviewReadiness.conflictFollowup.humanDecisionRequiredNow} human semantic decisions now**`,
        `- review packets: **${t.reviewPackets.packets} packets / ${t.reviewPackets.items} field items / ${t.reviewPackets.byRecommendation.holdForEvidence || 0} held for evidence / ${t.reviewPackets.canonical} canonical**`,
        `- gcsim weapon field evidence: **${t.weaponExternalEvidence.fieldRecords} fields / ${t.weaponExternalEvidence.candidateValueAgreements} candidate-value agreements / ${t.weaponExternalEvidence.candidateValueConflicts} conflicts / ${t.weaponExternalEvidence.canonicalEligibleFields} canonical-eligible**`,
        `- gcsim mismatch triage: **${t.weaponConflictTriage.mechanicallyResolvedRows} mechanically resolved / ${t.weaponConflictTriage.comparisonMismatches} direct value mismatch / ${t.weaponConflictTriage.semanticDiscrepancies} semantic discrepancies / ${t.weaponConflictTriage.classifications.scopeMismatch} scope mismatch / ${t.weaponConflictTriage.classifications.parserLimitation} parser limitation / ${t.weaponConflictTriage.schemaGapSourceFields} schema gaps / ${t.weaponConflictTriage.registryMappedSourceFields} registry lifecycle mapped / ${t.weaponConflictTriage.genuineValueConflicts} genuine value conflicts / ${t.weaponConflictTriage.unmappedSourceFields} unmapped**`,
        `- official weapon pilot: **${t.officialWeaponPilot.officialSources} official sources (${t.officialWeaponPilot.sourceReviewNeedsReview} snapshot reviews pending) / ${t.officialWeaponPilot.rankOneMatches} R1 matches / ${t.officialWeaponPilot.completeOfficialRefinementClaims} complete refinement claims / ${t.officialWeaponPilot.canonical} canonical**`,
        `- Optimizer pilot evidence: **${t.optimizerFieldEvidence.fieldRecords} fields / ${t.optimizerFieldEvidence.candidateValueAgreements} candidate-value agreements / correlated provider / ${t.optimizerFieldEvidence.canonicalEligibleFields} canonical-eligible**`,
        `- KQM artifact evidence: **${t.kqmArtifactEvidence.fieldComparisonCount} two-piece field comparisons / ${t.kqmArtifactEvidence.fieldAgreementCount} agreements / ${t.kqmArtifactEvidence.gameVersionUnboundCount} KQM gameVersion-unbound / ${t.kqmArtifactEvidence.canonicalEligibleCount} canonical-eligible**`,
        `- weapon Runtime route contract: **${t.weapons.runtimeRouteConnected} routed / ${t.weapons.supersessionConnected} supersession-linked / ${t.weapons.namespacedRuntimeIds} namespaced / ${t.weapons.uidHandlingCopied} uidHandling copied**（${t.weapons.contractClaimsNeedsReview} route claims needsReview）`,
        `- artifact Runtime route contract: **${t.artifacts.runtimeRouteConnected} routed / ${t.artifacts.supersessionConnected} supersession-linked / ${t.artifacts.namespacedRuntimeIds} namespaced**（${t.artifacts.contractClaimsReviewGated} specs review-gated）`,
        `- artifact gap review: **${t.artifacts.structuredModifierGapReview.statuses.unstructured} unstructured / ${t.artifacts.structuredModifierGapReview.statuses.displayOnly} display-only sets / ${t.artifacts.structuredModifierGapReview.valueContractStatuses.needsReview} value contract needs review**`,
        `- character external locator evidence: **${t.characterExternalEvidence.evidenceMappings} mappings / ${t.characterExternalEvidence.claimValueEvidence} value-supporting / ${t.characterExternalEvidence.canonical} canonical**`,
        `- character field materialization: **${t.characterFieldMaterialization.fieldEvidence} fields / ${t.characterFieldMaterialization.materializedSources} materialized sources / ${t.characterFieldMaterialization.canonical} canonical**`,
        `- canonical Runtime gate: **${t.canonicalRuntime.candidatesAudited} audited / ${t.canonicalRuntime.generated} retained / ${t.canonicalRuntime.activeForProduction} active / ${t.canonicalRuntime.inactivePendingRevalidation} pending revalidation**（overlay-only loader gate, legacy remains active）`,
        `- canonical UI/calculation synthetic E2E: **${t.canonicalUiRuntimeE2e.syntheticCanonicalModifiers} generated / ${t.canonicalUiRuntimeE2e.loader.applied} loaded / production ${t.canonicalUiRuntimeE2e.productionCanonical} canonical**`,
        `- terminal states: **${t.terminalStates.totals.productionCanonical} productionCanonical / ${t.terminalStates.totals.awaitingHumanReview} awaitingHumanReview / ${t.terminalStates.totals.verifiedSpec} verifiedSpec / ${t.terminalStates.totals.nonCalculativeComplete || 0} nonCalculativeComplete / ${t.terminalStates.totals.blocked} blocked / ${t.terminalStates.totals.unclassified} unclassified**`,
        `- evidence-derived task queue: **${t.terminalStates.taskQueue.status}**（next **${t.terminalStates.taskQueue.goal.nextTask?.task?.taskId || "none"}**）`,
        `- automatic transitions remaining now: **${t.terminalStates.taskQueue.summary.autoProcessableNow}**（machine task only; human/source/consumer gates remain separate）`,
        `- task waits: **human ${t.terminalStates.taskQueue.summary.humanWait} / reconciliation ${t.terminalStates.taskQueue.summary.reconciliationWait} / consumer ${t.terminalStates.taskQueue.summary.consumerWait} / source-provider ${t.terminalStates.taskQueue.summary.sourceProviderWait} / search-exhausted ${t.terminalStates.taskQueue.summary.searchExhausted} / deferred ${t.terminalStates.taskQueue.summary.searchDeferred}**`,
        `- candidate×claim eligibility certificates: **${t.eligibilityCertificates.candidateClaimCount} claims / ${t.eligibilityCertificates.eligibleCount} eligible / ${t.eligibilityCertificates.blockedCount} blocked / auto-attestation ${t.eligibilityCertificates.autoAttestationEligible} / promotion ${t.eligibilityCertificates.promotionEligible}**`,
        `- status inventory: **${audit.statusInventory.unverifiedCandidates} unverified candidates / ${audit.statusInventory.sourceInsufficientFieldClaims} source-insufficient claims / ${audit.statusInventory.sourceComparisonMismatchesObserved} comparison mismatches / ${audit.statusInventory.sourceValueConflictsObserved} genuine value conflicts**`,
        `- legacy classifications: **${audit.statusInventory.unsupportedLegacyRuntime} unsupported / ${audit.statusInventory.displayOnlyLegacyRuntime} display-only / ${audit.statusInventory.inputMissingLegacyRuntime} input-missing / ${audit.statusInventory.invalidLegacyRuntime} invalid**`,
        "",
        "| target | total | candidate/audited | canonical | remaining evidence |",
        "| --- | ---: | ---: | ---: | ---: |",
        `| weapons | ${t.weapons.totalModifiers} modifiers | ${t.weapons.candidateSpecs} | ${t.weapons.canonical} | ${t.weapons.sourceInsufficient} needs independent evidence |`,
        `| weapon external field evidence | ${t.weaponExternalEvidence.sourceRecords} pinned files | ${t.weaponExternalEvidence.fieldRecords} fields | ${t.weaponExternalEvidence.canonical} | ${t.weaponExternalEvidence.gameVersionMissingSources} sources lack gameVersion |`,
        `| official weapon pilot | ${t.officialWeaponPilot.weapons} weapons | ${t.officialWeaponPilot.officialClaimFields} official claim fields | ${t.officialWeaponPilot.canonical} | ${t.officialWeaponPilot.completeOfficialRefinementClaims} complete refinement claims |`,
        `| Optimizer field evidence | ${t.optimizerFieldEvidence.sourceRecords} pinned files | ${t.optimizerFieldEvidence.fieldRecords} fields | ${t.optimizerFieldEvidence.canonical} | correlated provider; ${t.optimizerFieldEvidence.gameVersionMissingSources} sources lack gameVersion |`,
        `| artifacts | ${t.artifacts.totalModifiers} modifiers | ${t.artifacts.candidateSpecs} | ${t.artifacts.canonical} | ${t.artifacts.sourceInsufficient} needs independent evidence |`,
        `| characters | ${t.characters.totalEntities} | ${t.characters.completeLegacyCoverage} complete / ${t.characters.partialLegacyCoverage} partial | ${t.characters.canonical} | ${t.characters.unstructuredTalentModifierEntities} unstructured |`,
        `| character external evidence | ${t.characterExternalEvidence.externalSources} locators | ${t.characterExternalEvidence.evidenceMappings} mappings | ${t.characterExternalEvidence.canonical} | ${t.characterExternalEvidence.materializedSources} materialized / ${t.characterExternalEvidence.needsReview} needs review |`,
        `| character field materialization | ${t.characterFieldMaterialization.characters} characters | ${t.characterFieldMaterialization.fieldEvidence} fields | ${t.characterFieldMaterialization.canonical} | ${t.characterFieldMaterialization.materializedSources} sources materialized / ${t.characterFieldMaterialization.runtimeBlocked} blocked |`,
        `| talent modifier gaps | ${t.talentModifierGaps.totalEntities} characters | ${t.talentModifierGaps.candidateSpecs} blocked specs | ${t.talentModifierGaps.canonical} | ${t.talentModifierGaps.classification.noEffect} no-effect / ${t.talentModifierGaps.classification.unstructured} unstructured / ${t.talentModifierGaps.classification.uninvestigated} uninvestigated |`,
        `| constellation text inference | ${t.constellationSourceInference.totalFlagged} | ${t.constellationSourceInference.audited} | ${t.constellationSourceInference.canonical} | ${t.constellationSourceInference.semanticClassification.explicitlyConfirmed || 0} explicit / ${t.constellationSourceInference.semanticClassification.partiallyConfirmed || 0} partial / ${t.constellationSourceInference.semanticClassification.unconfirmed || 0} unconfirmed / ${t.constellationSourceInference.semanticClassification.sourceMismatch || 0} mismatch; ${t.constellationSourceInference.quarantined} quarantined |`,
        `| timing/count behavior | ${t.timingAndCounts.totalCharacterEntities} characters | ${t.timingAndCounts.pilotEntities} pilot / ${t.timingAndCounts.inventoryCandidates} inventory / ${t.timingAndCounts.normalizedBatchSpecs} normalized | ${t.timingAndCounts.canonical} | ${t.timingAndCounts.normalizedBatchRemainingEntities} characters remain |`,
        "",
        "候補件数とcanonical件数は分離している。Spec候補の生成だけでは完了とせず、複数情報源のフィールド一致、独立レビュー、Runtime接続、UI・計算回帰まで完了したものだけをcanonicalとして数える。",
        "",
        `Static test inventory: ${audit.tests.files} files / ${audit.tests.declaredTestCalls} direct test calls. ${audit.tests.note}`,
        ""
    ].join("\n");
}

function writeProgressAudit(audit = buildProgressAudit()) {
    const reportRoot = path.join(repositoryRoot, "reports");
    fs.mkdirSync(reportRoot, { recursive: true });
    fs.writeFileSync(path.join(reportRoot, "genshin-v2-progress.json"), `${JSON.stringify(audit, null, 2)}\n`, "utf8");
    fs.writeFileSync(path.join(reportRoot, "genshin-v2-progress.md"), renderMarkdown(audit), "utf8");
    return audit;
}

if (require.main === module) process.stdout.write(`${JSON.stringify(writeProgressAudit(), null, 2)}\n`);

module.exports = { buildProgressAudit, buildCompletionMetrics, declaredTestInventory, renderMarkdown, writeProgressAudit };
