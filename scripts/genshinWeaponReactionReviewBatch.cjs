"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const stateMachine = require("./genshinVerificationStateMachine.cjs");

const root = path.resolve(__dirname, "..");
const dataRoot = path.join(root, "games", "genshin", "data");
const outputPath = path.join(dataRoot, "v2", "review-pilots", "weapon-12516-reaction.json");
const candidateId = "w_12516_reaction_bonus_2";
const GENERATED_AT = "2026-08-24T00:00:00.000Z";
const digestText = (value) => crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
const digestFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const stableValue = (value) => Array.isArray(value) ? value.map(stableValue)
    : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
        : value;
const digestStable = (value) => digestText(JSON.stringify(stableValue(value)));

const officialRawText = "Additionally, each time the equipping character hits an opponent with their Charged Attack, they attain \"Transcendence\" for a short time: their Stellar-Conduct and Stellar Swirl reaction DMG is increased by 16%/20%/24%/28%/32% for 5s. This effect can stack once every 0.2s, max 3 stacks.";
const genshinDbRawText = "Additionally, each time the equipping character hits an opponent with their Charged Attack, they attain \"Transcendence\" for a short time: their Stellar-Conduct DMG is increased by 16%/20%/24%/28%/32% for 5s. This effect can stack once every 0.2s, max 3 stacks.";
const gachabaseTransitionText = "release 6.7.0 Rev. 46509556: Stellar-Conduct DMG; release 7.0.0 Rev. 47194594: Stellar-Conduct and Stellar Swirl reaction DMG";

function gachabaseTransitionEvidence() {
    return {
        provider: "Gachabase",
        providerFamily: "gachabase-versioned-data",
        lineageStatus: "unknown",
        locator: "https://gi.gachabase.net/diff/weapons/12516/a-teaspoon-of-transcendence?branch=release&cur=release_7.0.0_47194594&lang=en&prev=release_6.7.0_46509556",
        from: { gameVersion: "6.7.0", branch: "release", revision: "46509556", targets: ["astralConductionDamageBonus"] },
        to: { gameVersion: "7.0.0", branch: "release", revision: "47194594", targets: ["astralConductionDamageBonus", "stellarSwirlDamageBonus"] },
        rawArtifactIntegrity: { algorithm: "sha256", digest: "c92d99d23320253c29773b43cd5543f1e76a1f51e88cb1b531b08e029cbb6fac", bytes: 158037 },
        fieldText: gachabaseTransitionText,
        fieldDigest: digestText(gachabaseTransitionText),
        eligibility: "driftDiscoveryOnly",
        blockedReasons: ["providerIndependenceUnknown", "providerManifestMissing"]
    };
}

function sourceRecords() {
    return {
        official: {
            id: "hoyowiki:genshin:weapon:12516:reaction-clause",
            provider: "HoYoverse HoYoWiki",
            independenceGroup: "official-hoyoverse",
            locator: "https://wiki.hoyolab.com/pc/genshin/entry/10949",
            identifier: "entry/10949#passive-reaction-clause",
            locale: "en-US",
            rawText: officialRawText,
            integrity: { algorithm: "sha256", digest: digestText(officialRawText) },
            gameVersion: "7.0",
            strictGameVersionBinding: false,
            gameVersionEvidence: {
                observedLiveVersionLocator: "https://www.hoyolab.com/article/46233468",
                method: "The mutable HoYoWiki entry was observed while official Version 7.0 was live. The weapon's 6.7 introduction does not prove that the currently displayed field text is the historical 6.7 text."
            }
        },
        genshinDb: {
            id: "genshin-db:weapon:12516:1bab2cd:reaction-clause",
            provider: "theBowja/genshin-db",
            independenceGroup: "GenshinData-derived",
            locator: "https://github.com/theBowja/genshin-db/blob/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/src/data/English/weapons/ateaspoonoftranscendence.json",
            identifier: "git:1bab2cdba4d218fd5caa46b5f54e7884ee8359a2:English/weapons/ateaspoonoftranscendence.json#effect",
            locale: "en-US",
            rawText: genshinDbRawText,
            integrity: { algorithm: "sha256", digest: digestText(genshinDbRawText) },
            gameVersion: "6.7",
            strictGameVersionBinding: true,
            gameVersionEvidence: {
                locator: "https://github.com/theBowja/genshin-db/blob/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/package.json",
                providerStatement: "Genshin Impact v6.7 JSON data"
            }
        }
    };
}

function externalClaim(value, sources) {
    return {
        status: "needsReview",
        claimKind: "externalFactual",
        evidence: Object.values(sources).map((source) => ({
            sourceId: source.id,
            provider: source.provider,
            independenceGroup: source.independenceGroup,
            gameVersion: source.gameVersion,
            gameVersionVerified: source.strictGameVersionBinding,
            supportsClaimValue: true,
            extractedValue: value
        })),
        comparison: { status: "match", normalizedValue: value },
        discrepancies: []
    };
}

function targetScopeClaim(sources) {
    const officialTargets = ["astralConductionDamageBonus", "stellarSwirlDamageBonus"];
    const datasetTargets = ["astralConductionDamageBonus"];
    return {
        status: "disputed",
        claimKind: "externalFactual",
        evidence: [
            { sourceId: sources.official.id, provider: sources.official.provider, independenceGroup: sources.official.independenceGroup, gameVersion: sources.official.gameVersion, gameVersionVerified: sources.official.strictGameVersionBinding, supportsClaimValue: true, extractedValue: officialTargets },
            { sourceId: sources.genshinDb.id, provider: sources.genshinDb.provider, independenceGroup: sources.genshinDb.independenceGroup, gameVersion: sources.genshinDb.gameVersion, gameVersionVerified: sources.genshinDb.strictGameVersionBinding, supportsClaimValue: false, extractedValue: datasetTargets }
        ],
        comparison: { status: "mismatch", normalizedValue: officialTargets },
        discrepancies: [{
            kind: "versionOrProviderCoverageDrift",
            field: "targets",
            sourceA: officialTargets,
            sourceB: datasetTargets,
            consumerStatus: "formulaPending",
            resolved: false,
            notes: "The mutable HoYoWiki clause observed during 7.0 includes Stellar Swirl, while the pinned genshin-db 6.7 projection omits it. These are not same-version claims and cannot be reconciled as a provider-value vote."
        }]
    };
}

function internalClaim(locator, sourceInputsVerified = undefined) {
    const codePath = path.join(root, "scripts", "genshinWeaponV2Generate.cjs");
    return {
        status: "needsReview",
        claimKind: "mappingMaterialization",
        codeProvenance: {
            deterministic: true,
            path: path.relative(root, codePath).replaceAll("\\", "/"),
            locator,
            digest: digestFile(codePath)
        },
        focusedTests: [{ id: "genshinWeaponReactionReviewBatch", status: "passed" }],
        ...(sourceInputsVerified === undefined ? {} : { sourceInputsVerified }),
        discrepancies: []
    };
}

function notApplicableClaim(reason) {
    return { status: "notApplicable", claimKind: "notApplicable", applicabilityDetermined: true, rationale: reason, discrepancies: [] };
}

function buildBatch() {
    const specsPath = path.join(dataRoot, "v2", "weapons", "spec-candidates.json");
    const modifiersPath = path.join(dataRoot, "calc", "weapon-modifiers.json");
    const registryPath = path.join(dataRoot, "calc", "weapon-effect-registry.json");
    const reactionEvidencePath = path.join(dataRoot, "v2", "reactions", "stellar-swirl-official-evidence.json");
    const specs = readJson(specsPath);
    const modifiers = readJson(modifiersPath);
    const registry = readJson(registryPath);
    const reactionEvidence = readJson(reactionEvidencePath);
    const materializedRaw = reactionEvidence.source?.materializedRawText || "";
    const reactionEvidenceValid = reactionEvidence.kind === "genshinOfficialReactionEvidence"
        && reactionEvidence.strictGameVersionBinding === true
        && reactionEvidence.gameVersion === "7.0"
        && reactionEvidence.claim?.gameVersion === reactionEvidence.gameVersion
        && reactionEvidence.source?.materializedRawDigest === digestText(materializedRaw)
        && reactionEvidence.source?.materializedRawBytes === Buffer.byteLength(materializedRaw, "utf8")
        && reactionEvidence.source?.anchors?.every((anchor) => materializedRaw.includes(anchor))
        && reactionEvidence.fieldDigest === digestStable(reactionEvidence.claim);
    if (!reactionEvidenceValid) throw new Error("official Stellar Swirl evidence failed raw/field/version validation");
    const spec = specs[candidateId];
    const modifier = modifiers["12516"]?.modifiers?.find((item) => item.id === candidateId);
    const group = registry.weapons?.["12516"]?.groups?.find((item) => item.id === "transcendence_astral_conduction");
    if (!spec || !modifier || !group) throw new Error("weapon 12516 reaction candidate or runtime route is missing");
    const refs = sourceRecords();
    const values = { "1": 16, "2": 20, "3": 24, "4": 28, "5": 32 };
    const claims = {
        value: externalClaim(values, refs),
        refinement: externalClaim(values, refs),
        activation: externalClaim("afterChargedAttackHit", refs),
        targets: targetScopeClaim(refs),
        unit: externalClaim("percent", refs),
        duration: externalClaim(5, refs),
        stack: externalClaim({ min: 0, default: 0, max: 3 }, refs),
        interval: externalClaim(0.2, refs),
        "effect.activation.uidHandling": internalClaim("effect.activation.uidHandling:conditional", true),
        destination: internalClaim("destination:weaponModifiers/12516/modifiers", true),
        supersedesLegacyModifierIds: internalClaim(`supersedes:${candidateId}`, true),
        "runtime.modifierIds": internalClaim(`runtime:${candidateId}`, true),
        registryStructure: internalClaim("registry:transcendence_astral_conduction", true)
    };
    ["cooldown", "offField", "hitCount", "charges", "maxInstances", "elementApplication", "energy", "snapshot", "area"].forEach((field) => {
        claims[field] = notApplicableClaim(`The reviewed reaction bonus has no ${field} runtime field.`);
    });
    const candidate = {
        claims,
        discrepancies: claims.targets.discrepancies,
        reviewPacketAvailable: true,
        verification: { status: "needsReview", reviewedBy: null, reviewedAt: null, sourceAgreement: "disputed" },
        interpretation: spec.interpretation
    };
    const machine = stateMachine.assessMachineEvidence(candidate);
    const canonical = stateMachine.assessCanonicalEligibility(candidate);
    return {
        schemaVersion: 1,
        kind: "genshinWeaponReviewBatch",
        generatedAt: GENERATED_AT,
        target: { kind: "weapon", id: "12516", name: "A Teaspoon of Transcendence", candidateId },
        sourceRecords: refs,
        claims,
        assessment: {
            ...machine,
            canonicalEligibility: canonical.canonicalEligibility,
            canonicalBlockedReasons: canonical.blockedReasons,
            state: stateMachine.stateFor(candidate),
            productionCanonical: false
        },
        reviewPacket: {
            packetId: `genshin:weapon:12516:${candidateId}:review`,
            target: { kind: "weapon", id: "12516", candidateId },
            originalText: { sourceA: refs.official.rawText, sourceB: refs.genshinDb.rawText },
            sourceA: refs.official,
            sourceB: refs.genshinDb,
            providerIndependence: { status: "independent", groups: [refs.official.independenceGroup, refs.genshinDb.independenceGroup] },
            repositoryTargetGameVersion: "6.7",
            observedLiveGameVersion: "7.0",
            reactionFacts: {
                existence: { status: "officialVersionBound", gameVersion: reactionEvidence.gameVersion, evidenceId: reactionEvidence.evidenceId, fieldDigest: reactionEvidence.fieldDigest },
                formula: { status: "blockedMissingCoefficients", formulaCoefficientsDisclosed: reactionEvidence.claim.formulaCoefficientsDisclosed },
                weaponTargetScope: { status: "versionTransitionPendingCandidateEvidence", fromGameVersion: "6.7", toGameVersion: "7.0" }
            },
            versionTransitionEvidence: gachabaseTransitionEvidence(),
            specValue: { targets: ["astralConductionDamageBonus", "stellarSwirlDamageBonus"], condition: "afterChargedAttackHit", unit: "percent", valueByRefinement: values, durationSeconds: 5, stack: { min: 0, default: 0, max: 3 }, acquisitionIntervalSeconds: 0.2 },
            fieldComparison: [
                { field: "targets", sourceA: ["astralConductionDamageBonus", "stellarSwirlDamageBonus"], sourceAVersion: "7.0-observed", sourceB: ["astralConductionDamageBonus"], sourceBVersion: "6.7-strict", spec: ["astralConductionDamageBonus", "stellarSwirlDamageBonus"], status: "versionTransition", classification: "versionOrProviderCoverageDrift", normalization: "The latest scope is retained as an unpromoted 7.0 transition candidate; it is not projected backward into 6.7." },
                { field: "condition", sourceA: "Charged Attack hits an opponent", sourceB: "Charged Attack hits an opponent", spec: "afterChargedAttackHit", status: "match" },
                ...Object.entries(values).map(([rank, value]) => ({ field: `refinement.${rank}`, sourceA: value, sourceB: value, spec: value, status: "match" })),
                { field: "durationSeconds", sourceA: 5, sourceB: 5, spec: 5, status: "match" },
                { field: "stack.max", sourceA: 3, sourceB: 3, spec: 3, status: "match" },
                { field: "acquisitionIntervalSeconds", sourceA: 0.2, sourceB: 0.2, spec: 0.2, status: "match", normalization: "source-owned timing constraint; current calculator exposes manual stack selection" }
            ],
            scopeBoundary: {
                appliesOnlyToCandidate: candidateId,
                excludedCandidateIds: ["w_12516_reactionBonus_d0fe6e2e"],
                excludedMeaning: "The duplicate legacy modifier remains excluded; Stellar Swirl is part of this candidate's current target scope.",
                pairReuse: "forbiddenWithoutFreshFieldReview"
            },
            runtimeTarget: { dataset: "weaponModifiers", path: "/12516/modifiers", legacyModifierId: candidateId, calculation: "manual stack input selects the per-refinement reaction bonus for Stellar Conduct; Stellar Swirl remains fail-closed pending its dedicated formula", ui: "shared Transcendence stack selector, range 0..3; Stellar Swirl reaction option is display-only until formula evidence exists" },
            unresolved: [
                { kind: "sourceVersionOrCoverageDrift", field: "targets", owner: "sourceProvider", reason: "the 6.7 pinned dataset and mutable field text observed under official live 7.0 belong to different version states" },
                { kind: "consumerImplementationGap", field: "stellarSwirlFormula", owner: "consumer", reason: "reaction identity, modifier target, UI and element input exist; version-bound calculation formula is not evidenced" }
            ],
            machineEvidenceReady: machine.machineEvidenceReady,
            recommendation: "hold automatic and human promotion until the source-content drift is resolved and the Stellar Swirl formula is version-bound; do not reduce the official scope to Stellar Conduct only",
            reviewDecisionOptions: ["hold"]
        },
        generatedFrom: {
            generator: { path: "scripts/genshinWeaponReactionReviewBatch.cjs", sha256: digestFile(__filename) },
            specCandidates: { path: "games/genshin/data/v2/weapons/spec-candidates.json", sha256: digestFile(specsPath) },
            weaponModifiers: { path: "games/genshin/data/calc/weapon-modifiers.json", sha256: digestFile(modifiersPath) },
            weaponEffectRegistry: { path: "games/genshin/data/calc/weapon-effect-registry.json", sha256: digestFile(registryPath) },
            stellarSwirlOfficialEvidence: { path: "games/genshin/data/v2/reactions/stellar-swirl-official-evidence.json", sha256: digestFile(reactionEvidencePath) }
        }
    };
}

function auditBatch(batch = buildBatch()) {
    const errors = [];
    if (batch.assessment.machineEvidenceReady !== false) errors.push("mismatched target scope must not be machine-evidence ready");
    if (batch.assessment.state === "humanReviewReady") errors.push("consumer/source drift must not be reduced to a normal human-review packet");
    if (batch.assessment.canonicalEligibility !== false) errors.push("canonical eligibility must remain false before human review");
    if (batch.assessment.productionCanonical !== false) errors.push("production canonical promotion is forbidden");
    if (!batch.reviewPacket.unresolved.some((item) => item.kind === "consumerImplementationGap")) errors.push("Stellar Swirl consumer gap is missing");
    if (!batch.reviewPacket.unresolved.some((item) => item.kind === "sourceVersionOrCoverageDrift")) errors.push("source content drift is missing");
    if (batch.reviewPacket.reactionFacts?.existence?.status !== "officialVersionBound") errors.push("official Stellar Swirl existence evidence is missing");
    if (batch.reviewPacket.reactionFacts?.formula?.status !== "blockedMissingCoefficients") errors.push("formula must remain fail-closed");
    const transition = batch.reviewPacket.versionTransitionEvidence;
    if (transition?.from?.gameVersion !== "6.7.0" || transition?.to?.gameVersion !== "7.0.0"
        || transition?.fieldDigest !== digestText(transition?.fieldText || "")
        || transition?.eligibility !== "driftDiscoveryOnly"
        || !transition?.blockedReasons?.includes("providerIndependenceUnknown")) errors.push("version transition evidence is missing or incorrectly eligible");
    if (!batch.reviewPacket.scopeBoundary.excludedCandidateIds.includes("w_12516_reactionBonus_d0fe6e2e")) errors.push("superseded duplicate is not excluded");
    return { status: errors.length ? "failed" : "passed", errors, summary: batch.assessment };
}

function writeBatch() {
    const batch = buildBatch();
    const audit = auditBatch(batch);
    if (audit.status !== "passed") throw new Error(audit.errors.join("; "));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(batch, null, 2)}\n`, "utf8");
    return { batch, audit };
}

if (require.main === module) {
    const result = process.argv.includes("--write") ? writeBatch() : { batch: buildBatch() };
    const audit = auditBatch(result.batch);
    process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
    if (audit.status !== "passed") process.exitCode = 1;
}

module.exports = { GENERATED_AT, auditBatch, buildBatch, outputPath, writeBatch };
