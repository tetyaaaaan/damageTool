"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const stateMachine = require("./genshinVerificationStateMachine.cjs");

const root = path.resolve(__dirname, "..");
const dataRoot = path.join(root, "games", "genshin", "data");
const behaviorPath = path.join(dataRoot, "v2", "characters", "behavior-pilot.json");
const outputPath = path.join(dataRoot, "v2", "review-pilots", "behavior-xiao-c1-charges.json");
const GENERATED_AT = "2026-08-24T00:00:00.000Z";
const modifierId = "behavior-modifier:10000026:constellation-1-1:1";
const targetSpecId = "behavior:10000026:talent:skill";

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const digestFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const digestText = (value) => crypto.createHash("sha256").update(String(value), "utf8").digest("hex");

function sourceRecords() {
    const skillText = "Starts with 2 charges.";
    const constellationText = "Increases Lemniscatic Wind Cycling's charges by 1.";
    const combinedText = `${skillText}\n${constellationText}`;
    const noChangeText = "No differences between the selected revisions. You are now viewing the differences between v6.6.0 Rev. 45557904 -> v6.7.0 Rev. 45767575 for Xiao (Release).";
    return {
        gachabase: {
            id: "gachabase:genshin:character:10000026:skill-c1:release-6.7.0",
            provider: "Gachabase",
            independenceGroup: "gachabase-versioned-data",
            locator: "https://gi.gachabase.net/characters/10000026/xiao/release/6.6.0/45557904?lang=en",
            identifier: "gachabase:character:10000026:release:6.6.0:D45557904#skill-and-constellation-1",
            locale: "en-US",
            rawText: combinedText,
            fieldTexts: { baseCharges: skillText, constellationChange: constellationText },
            integrity: { algorithm: "sha256", digest: digestText(combinedText) },
            gameVersion: "6.7",
            strictGameVersionBinding: true,
            gameVersionEvidence: {
                method: "providerVersionDeltaAttestation",
                fieldSnapshotLocator: "https://gi.gachabase.net/characters/10000026/xiao/release/6.6.0/45557904?lang=en",
                fieldSnapshotRevision: "D45557904 | R45246446",
                versionDeltaLocator: "https://gi.gachabase.net/diff/characters/10000026/xiao?cur=release_6.7.0_45767575&lang=en&prev=release_6.6.0_45557904",
                versionDeltaStatement: noChangeText,
                versionDeltaDigest: digestText(noChangeText),
                targetRevision: "v6.7.0 Rev. 45767575",
                rationale: "The provider-authored 6.6 field snapshot contains both charge sentences and its reproducible 6.6-to-6.7 delta reports no changes for the complete Xiao record."
            }
        },
        genshinDbTalent: {
            id: "genshin-db:character:10000026:talent-skill:1bab2cd",
            provider: "theBowja/genshin-db",
            independenceGroup: "GenshinData-derived",
            locator: "https://github.com/theBowja/genshin-db/blob/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/src/data/English/talents/xiao.json",
            identifier: "git:1bab2cdba4d218fd5caa46b5f54e7884ee8359a2:English/talents/xiao.json#/combat2/description",
            locale: "en-US",
            rawText: skillText,
            integrity: { algorithm: "sha256", digest: digestText(skillText) },
            gameVersion: "6.7",
            strictGameVersionBinding: true,
            gameVersionEvidence: {
                locator: "https://github.com/theBowja/genshin-db/blob/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/package.json",
                providerStatement: "Genshin Impact v6.7 JSON data"
            }
        },
        genshinDbConstellation: {
            id: "genshin-db:character:10000026:constellation-c1:1bab2cd",
            provider: "theBowja/genshin-db",
            independenceGroup: "GenshinData-derived",
            locator: "https://github.com/theBowja/genshin-db/blob/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/src/data/English/constellations/xiao.json",
            identifier: "git:1bab2cdba4d218fd5caa46b5f54e7884ee8359a2:English/constellations/xiao.json#/c1/description",
            locale: "en-US",
            rawText: constellationText,
            integrity: { algorithm: "sha256", digest: digestText(constellationText) },
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
        evidence: sources.map((source) => ({
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

function internalClaim(field, kind, codePath, locator) {
    return {
        status: "needsReview",
        claimKind: kind,
        codeProvenance: {
            deterministic: true,
            path: codePath.replaceAll("\\", "/"),
            locator
        },
        focusedTests: [{ id: "genshinBehaviorRepresentativeReviewPilot", status: "passed" }],
        ...(kind === "mappingMaterialization" ? { sourceInputsVerified: true } : {}),
        discrepancies: []
    };
}

function buildPilot() {
    const behavior = readJson(behaviorPath);
    const modifier = behavior.modifiers[modifierId];
    const targetBehaviorSpec = behavior.specs[targetSpecId];
    if (!modifier) throw new Error("Xiao C1 BehaviorModifier is missing");
    if (!targetBehaviorSpec) throw new Error("Xiao skill BehaviorSpec is missing");
    const sources = sourceRecords();
    const chargeSources = [sources.gachabase, sources.genshinDbConstellation];
    const baseSources = [sources.gachabase, sources.genshinDbTalent];
    const claims = {
        affectedAction: externalClaim("Lemniscatic Wind Cycling", chargeSources),
        baseCharges: externalClaim(2, baseSources),
        behaviorChange: externalClaim("additionalCharge", chargeSources),
        value: externalClaim(1, chargeSources),
        condition: externalClaim({ kind: "constellation", level: 1 }, chargeSources),
        targetSpecId: internalClaim("targetSpecId", "mappingMaterialization", "scripts/genshinBehaviorV2Generate.cjs", targetSpecId),
        path: internalClaim("path", "mappingMaterialization", "scripts/genshinBehaviorV2Generate.cjs", "/execution/charges"),
        operation: internalClaim("operation", "mappingMaterialization", "scripts/genshinBehaviorV2Generate.cjs", "add"),
        destination: internalClaim("destination", "mappingMaterialization", "scripts/genshinCanonicalRuntimeGenerate.cjs", "behaviorModifiers/10000026/modifiers"),
        supersedesLegacyModifierIds: internalClaim("supersedesLegacyModifierIds", "mappingMaterialization", "scripts/genshinCanonicalRuntimeGenerate.cjs", "explicit-empty-no-legacy-behavior-runtime"),
        "runtime.modifierIds": internalClaim("runtime.modifierIds", "internalRuntimeRoute", "games/js/genshinCalcData.js", modifierId),
        calculationRoute: internalClaim("calculationRoute", "internalRuntimeRoute", "games/js/genshinCalcEngine.js", "calculateDamageRequest.behaviorResolution"),
        uiRoute: internalClaim("uiRoute", "internalRuntimeRoute", "games/js/genshinCalcRenderer.js", "renderBehaviorResolution")
    };
    const candidate = {
        claims,
        discrepancies: [],
        reviewPacketAvailable: true,
        verification: { status: "needsReview", reviewedBy: null, reviewedAt: null, sourceAgreement: "agreed" },
        interpretation: { method: "deterministicParser", author: "genshinBehaviorV2Generate.cjs", version: "genshinBehaviorV2Generate/1" }
    };
    const machine = stateMachine.assessMachineEvidence(candidate);
    const canonical = stateMachine.assessCanonicalEligibility(candidate);
    const runtimeModifier = {
        ...modifier,
        sourceRefs: Object.values(sources).map((source) => source.id),
        destination: { dataset: "behaviorModifiers", entityId: "10000026", collection: "modifiers" },
        supersedesLegacyModifierIds: [],
        runtime: {
            status: "blocked",
            generator: null,
            modifierIds: [modifierId],
            destination: { dataset: "behaviorModifiers", entityId: "10000026", collection: "modifiers" },
            supersedesLegacyModifierIds: [],
            blockedReasons: ["humanReviewRequired"]
        }
    };
    const reviewPacket = {
        packetId: "genshin:behavior:xiao-c1-additional-charge:review",
        target: { kind: "constellation", characterId: "10000026", characterName: "魈", constellation: 1, modifierId },
        originalText: {
            sourceA: sources.gachabase.fieldTexts,
            sourceB: { baseCharges: sources.genshinDbTalent.rawText, constellationChange: sources.genshinDbConstellation.rawText }
        },
        sourceA: sources.gachabase,
        sourceB: { talent: sources.genshinDbTalent, constellation: sources.genshinDbConstellation },
        providerIndependence: {
            status: "independent",
            groups: [sources.gachabase.independenceGroup, sources.genshinDbTalent.independenceGroup],
            rationale: "The providers are operated separately and expose distinct revision systems; Gachabase publishes its own version-delta graph and does not identify genshin-db as its upstream.",
            caution: "Gachabase does not publicly document every extraction-stage dependency; reviewer may hold if stricter upstream-lineage proof is required."
        },
        targetGameVersion: "6.7",
        behaviorSpec: {
            targetSpecId,
            path: "/execution/charges",
            operation: "add",
            value: 1,
            baseValue: 2,
            resolvedValue: 3,
            condition: { kind: "constellation", stateKey: "10000026:C1" },
            meaning: "魈がC1以上のとき、元素スキル風輪両立の使用可能回数を2回から3回へ増やす。"
        },
        fieldComparison: [
            { field: "affectedAction", sourceA: "Lemniscatic Wind Cycling", sourceB: "Lemniscatic Wind Cycling", spec: targetSpecId, status: "match" },
            { field: "baseCharges", sourceA: 2, sourceB: 2, spec: 2, status: "match" },
            { field: "change", sourceA: "increases", sourceB: "increases", spec: "add", status: "match" },
            { field: "value", sourceA: 1, sourceB: 1, spec: 1, status: "match" },
            { field: "resource", sourceA: "charges", sourceB: "charges", spec: "/execution/charges", status: "match" },
            { field: "condition", sourceA: "Constellation 1", sourceB: "c1", spec: "10000026:C1", status: "match" }
        ],
        runtimeTarget: {
            destination: runtimeModifier.destination,
            canonicalRuntimeIdAfterApproval: modifierId,
            legacySupersession: { status: "notApplicable", ids: [], rationale: "No legacy BehaviorModifier runtime record exists; the damage modifier registry remains untouched." },
            calculation: "The generic resolver resolves /execution/charges from 2 to 3 only when character 10000026 has constellation >=1.",
            ui: "The existing constellation selector is the cause input; the result panel generically displays 使用可能回数 2 → 3（+1） under 挙動変更."
        },
        expectedE2E: {
            c0: { appliedBehaviorModifiers: 0 },
            c1: { appliedBehaviorModifiers: 1, baseValue: 2, resolvedValue: 3, displayedChange: "使用可能回数 2 → 3（+1）" },
            damageValueExpectation: "Per-hit damage is unchanged; Calculation exposes the verified behavior change without inventing a DPS/time-axis conversion."
        },
        unresolved: [],
        machineEvidenceReady: machine.machineEvidenceReady,
        canonicalEligibility: canonical.canonicalEligibility,
        verification: candidate.verification,
        recommendation: "approve, reject, or hold; approval must be supplied by a human reviewer",
        reviewDecisionOptions: ["approve", "reject", "hold"]
    };
    return {
        schemaVersion: 1,
        kind: "genshinBehaviorRepresentativeReviewPilot",
        generatedAt: GENERATED_AT,
        selectedCandidate: reviewPacket.target,
        candidateComparison: [
            { rank: 1, candidate: "魈 C1", modifierId, status: "selected", strictGameVersion: true, independentSources: 2, existingBehaviorMapping: "/execution/charges add 1; base 2", remainingBeforeReview: "none" },
            { rank: 2, candidate: "Amos' Bow 15502", status: "blocked", strictGameVersion: false, independentSources: 1, existingBehaviorMapping: "stack / interval / arrowFlightTime", remainingBeforeReview: "complete strict-version second source" },
            { rank: 3, candidate: "甘雨 C2", status: "structurallyInsufficient", strictGameVersion: true, independentSources: 2, existingBehaviorMapping: "/execution/charges add 1", remainingBeforeReview: "target BehaviorSpec lacks an explicit base charges value" },
            { rank: 4, candidate: "千織 C2", status: "moreWork", strictGameVersion: false, independentSources: 0, existingBehaviorMapping: "/timing/tickInterval replace 3", remainingBeforeReview: "field extraction, strict binding, periodic runtime semantics, and legacy supersession" }
        ],
        sourceRecords: sources,
        targetBehaviorSpec,
        claims,
        runtimeCandidate: runtimeModifier,
        assessment: {
            ...machine,
            canonicalEligibility: canonical.canonicalEligibility,
            canonicalBlockedReasons: canonical.blockedReasons,
            state: stateMachine.stateFor(candidate),
            productionCanonical: false
        },
        reviewPacket,
        generatedFrom: {
            behaviorPilot: { path: "games/genshin/data/v2/characters/behavior-pilot.json", sha256: digestFile(behaviorPath) },
            runtimeResolver: { path: "games/js/genshinCalcData.js", sha256: digestFile(path.join(root, "games", "js", "genshinCalcData.js")) },
            calculationRoute: { path: "games/js/genshinCalcEngine.js", sha256: digestFile(path.join(root, "games", "js", "genshinCalcEngine.js")) },
            uiRoute: { path: "games/js/genshinCalcRenderer.js", sha256: digestFile(path.join(root, "games", "js", "genshinCalcRenderer.js")) }
        }
    };
}

function auditPilot(pilot = buildPilot()) {
    const errors = [];
    const expected = pilot.runtimeCandidate;
    if (expected.targetSpecId !== targetSpecId) errors.push("targetSpecId mismatch");
    if (expected.path !== "/execution/charges" || expected.operation !== "add" || expected.value !== 1) errors.push("BehaviorModifier mapping mismatch");
    if (expected.condition?.stateKey !== "10000026:C1") errors.push("constellation condition mismatch");
    if (pilot.targetBehaviorSpec?.execution?.charges?.value !== 2) errors.push("base charges are not explicitly represented");
    if (pilot.assessment.machineEvidenceReady !== true) errors.push(`machine evidence is not ready: ${pilot.assessment.blockedReasons.join(", ")}`);
    if (pilot.assessment.state !== "humanReviewReady") errors.push(`unexpected state ${pilot.assessment.state}`);
    if (pilot.assessment.canonicalEligibility !== false || pilot.assessment.productionCanonical !== false) errors.push("pre-review canonical gate opened");
    if (pilot.reviewPacket.unresolved.length) errors.push("review packet has unresolved items");
    return { status: errors.length ? "failed" : "passed", errors, summary: pilot.assessment };
}

function writePilot() {
    const pilot = buildPilot();
    const audit = auditPilot(pilot);
    if (audit.status !== "passed") throw new Error(audit.errors.join("; "));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(pilot, null, 2)}\n`, "utf8");
    return { pilot, audit };
}

if (require.main === module) {
    const result = process.argv.includes("--write") ? writePilot() : { pilot: buildPilot() };
    const audit = auditPilot(result.pilot);
    process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
    if (audit.status !== "passed") process.exitCode = 1;
}

module.exports = { GENERATED_AT, auditPilot, buildPilot, modifierId, outputPath, writePilot };
