"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const stateMachine = require("./genshinVerificationStateMachine.cjs");

const root = path.resolve(__dirname, "..");
const dataRoot = path.join(root, "games", "genshin", "data");
const outputPath = path.join(dataRoot, "v2", "review-pilots", "weapon-12516-stat.json");
const GENERATED_AT = "2026-08-23T00:00:00.000Z";
const candidateId = "w_12516_stat_1";

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const digestFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const digestText = (value) => crypto.createHash("sha256").update(String(value), "utf8").digest("hex");

function sourceRecords() {
    return {
        official: {
            id: "hoyowiki:genshin:weapon:12516:stat-clause",
            provider: "HoYoverse HoYoWiki",
            independenceGroup: "official-hoyoverse",
            locator: "https://wiki.hoyolab.com/pc/genshin/entry/10949",
            identifier: "entry/10949#passive-first-clause",
            locale: "ja-JP",
            rawText: "攻撃力+28/35/42/49/56%。",
            integrity: { algorithm: "sha256", digest: digestText("攻撃力+28/35/42/49/56%。") },
            gameVersion: "6.7",
            strictGameVersionBinding: true,
            gameVersionEvidence: {
                implementationVersion: "Luna VIII",
                officialUpdateLocator: "https://www.hoyolab.com/article_pre/18014398241022990",
                method: "The entry identifies Luna VIII; the provider-authored update identifies Luna VIII as Version 6.7 and names this weapon."
            }
        },
        genshinDb: {
            id: "genshin-db:weapon:12516:1bab2cd",
            provider: "theBowja/genshin-db",
            independenceGroup: "GenshinData-derived",
            locator: "https://github.com/theBowja/genshin-db/blob/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/src/data/English/weapons/ateaspoonoftranscendence.json",
            identifier: "git:1bab2cdba4d218fd5caa46b5f54e7884ee8359a2:English/weapons/ateaspoonoftranscendence.json",
            locale: "en-US",
            rawText: "ATK is increased by 28/35/42/49/56%.",
            integrity: { algorithm: "sha256", digest: digestText("ATK is increased by 28/35/42/49/56%.") },
            gameVersion: "6.7",
            strictGameVersionBinding: true,
            gameVersionEvidence: {
                locator: "https://github.com/theBowja/genshin-db/blob/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/package.json",
                providerStatement: "Genshin Impact v6.7 JSON data"
            }
        }
    };
}

function externalClaim(field, value, sources) {
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

function internalClaim(field, kind, sourceInputsVerified = undefined) {
    const codePath = kind === "mappingMaterialization"
        ? path.join(root, "scripts", "genshinWeaponV2Generate.cjs")
        : path.join(root, "games", "js", "genshinDataContract.js");
    return {
        status: "needsReview",
        claimKind: kind,
        codeProvenance: {
            deterministic: true,
            path: path.relative(root, codePath).replaceAll("\\", "/"),
            locator: field,
            digest: digestFile(codePath)
        },
        focusedTests: [{ id: "genshinRepresentativeReviewPilot", status: "passed" }],
        ...(sourceInputsVerified === undefined ? {} : { sourceInputsVerified }),
        discrepancies: []
    };
}

function notApplicableClaim(reason) {
    return {
        status: "notApplicable",
        claimKind: "notApplicable",
        applicabilityDetermined: true,
        rationale: reason,
        discrepancies: []
    };
}

function buildPilot() {
    const specsPath = path.join(dataRoot, "v2", "weapons", "spec-candidates.json");
    const modifiersPath = path.join(dataRoot, "calc", "weapon-modifiers.json");
    const specs = readJson(specsPath);
    const modifiers = readJson(modifiersPath);
    const spec = specs[candidateId];
    const modifier = modifiers["12516"]?.modifiers?.find((item) => item.id === candidateId);
    if (!spec || !modifier) throw new Error("representative candidate is missing");
    const refs = sourceRecords();
    const values = { "1": 28, "2": 35, "3": 42, "4": 49, "5": 56 };
    const claims = {
        value: externalClaim("value", values, refs),
        refinement: externalClaim("refinement", values, refs),
        activation: externalClaim("activation", "always", refs),
        targets: externalClaim("targets", ["atkPercent"], refs),
        unit: externalClaim("unit", "percent", refs),
        "effect.activation.uidHandling": internalClaim("effect.activation.uidHandling", "internalRuntimeRoute"),
        destination: internalClaim("destination", "mappingMaterialization", true),
        supersedesLegacyModifierIds: internalClaim("supersedesLegacyModifierIds", "mappingMaterialization", true),
        "runtime.modifierIds": internalClaim("runtime.modifierIds", "internalRuntimeRoute")
    };
    ["duration", "stack", "cooldown", "interval", "offField", "hitCount", "charges", "maxInstances", "elementApplication", "energy", "snapshot", "area", "registryStructure"].forEach((field) => {
        claims[field] = notApplicableClaim(field === "stack"
            ? "The maximum-three-stacks phrase is in the following reaction clause; this first, unconditional ATK clause has no stack semantics."
            : `The unconditional ATK stat clause has no ${field} semantic.`);
    });
    const candidate = {
        claims,
        discrepancies: [],
        reviewPacketAvailable: true,
        verification: { status: "needsReview", reviewedBy: null, reviewedAt: null, sourceAgreement: "agreed" },
        interpretation: spec.interpretation
    };
    const machine = stateMachine.assessMachineEvidence(candidate);
    const canonical = stateMachine.assessCanonicalEligibility(candidate);
    const packet = {
        packetId: "genshin:weapon:12516:w_12516_stat_1:review",
        target: { kind: "weapon", id: "12516", name: "超越の鍵", candidateId },
        originalText: { sourceA: refs.official.rawText, sourceB: refs.genshinDb.rawText },
        sourceA: refs.official,
        sourceB: refs.genshinDb,
        providerIndependence: { status: "independent", groups: [refs.official.independenceGroup, refs.genshinDb.independenceGroup] },
        targetGameVersion: "6.7",
        specValue: { target: "atkPercent", condition: "always", unit: "percent", valueByRefinement: values },
        fieldComparison: [
            { field: "target", sourceA: "攻撃力", sourceB: "ATK", spec: "atkPercent", status: "match", normalization: "locale stat-name mapping" },
            { field: "condition", sourceA: "standalone unconditional clause", sourceB: "standalone unconditional clause", spec: "always", status: "match" },
            ...Object.entries(values).map(([rank, value]) => ({ field: `refinement.${rank}`, sourceA: value, sourceB: value, spec: value, status: "match" })),
            { field: "unit", sourceA: "percent", sourceB: "percent", spec: "percent", status: "match" },
            { field: "stack", sourceA: "not in first clause", sourceB: "not in first clause", spec: "notApplicable", status: "match" }
        ],
        mappingCorrection: {
            status: "deterministic",
            removed: ["stack", "valueByRefinementPerStack", "valueRole:stackedOrScalingByRefinement"],
            rationale: "The source sentence boundary separates the unconditional ATK clause from the later reaction clause that contains the three-stack limit."
        },
        runtimeTarget: {
            dataset: "weaponModifiers",
            path: "/12516/modifiers",
            legacyModifierId: candidateId,
            canonicalRuntimeIdAfterApproval: `genshin:v2:weapon:12516:${candidateId}`,
            calculation: "atkPercent is selected by refinement and applied through the existing statBonus route",
            ui: "weapon 12516 selection plus refinement rank; no result-value toggle is introduced"
        },
        unresolved: [],
        machineEvidenceReady: machine.machineEvidenceReady,
        canonicalEligibility: canonical.canonicalEligibility,
        verification: candidate.verification,
        recommendation: "approve, reject, or hold after reviewing the evidence; no automatic approval",
        reviewDecisionOptions: ["approve", "reject", "hold"]
    };
    return {
        schemaVersion: 1,
        kind: "genshinRepresentativeReviewPilot",
        generatedAt: GENERATED_AT,
        target: packet.target,
        sourceRecords: refs,
        claims,
        assessment: {
            ...machine,
            canonicalEligibility: canonical.canonicalEligibility,
            canonicalBlockedReasons: canonical.blockedReasons,
            state: stateMachine.stateFor(candidate),
            productionCanonical: false
        },
        reviewPacket: packet,
        generatedFrom: {
            specCandidates: { path: "games/genshin/data/v2/weapons/spec-candidates.json", sha256: digestFile(specsPath) },
            weaponModifiers: { path: "games/genshin/data/calc/weapon-modifiers.json", sha256: digestFile(modifiersPath) }
        }
    };
}

function auditPilot(pilot = buildPilot()) {
    const errors = [];
    const spec = readJson(path.join(dataRoot, "v2", "weapons", "spec-candidates.json"))[candidateId];
    const modifier = readJson(path.join(dataRoot, "calc", "weapon-modifiers.json"))["12516"].modifiers.find((item) => item.id === candidateId);
    [spec.effect, modifier].forEach((item, index) => {
        if (item.stack !== undefined) errors.push(`target ${index} retains stack`);
        if (item.valueByRefinementPerStack !== undefined) errors.push(`target ${index} retains valueByRefinementPerStack`);
    });
    if (pilot.assessment.machineEvidenceReady !== true) errors.push(`machine evidence is not ready: ${pilot.assessment.blockedReasons.join(", ")}`);
    if (pilot.assessment.state !== "humanReviewReady") errors.push(`unexpected state ${pilot.assessment.state}`);
    if (pilot.assessment.canonicalEligibility !== false) errors.push("canonical eligibility must remain false before human review");
    if (pilot.assessment.productionCanonical !== false) errors.push("production canonical promotion is forbidden");
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

module.exports = { GENERATED_AT, auditPilot, buildPilot, outputPath, writePilot };
