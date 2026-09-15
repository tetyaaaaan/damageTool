"use strict";

/** Audit the all-character behavior v2 inventory and pilot exclusion. */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const generator = require("./genshinBehaviorV2InventoryGenerate.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultDataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultOutputFile = path.join(defaultDataRoot, "v2", "characters", "behavior-inventory.json");
const defaultAuditFile = path.join(defaultDataRoot, "v2", "characters", "behavior-inventory-audit.json");
const defaultReportFile = path.join(repositoryRoot, "reports", "genshin-behavior-v2-inventory.md");
const ALLOWED_KINDS = new Set(["timing", "count", "charge", "refresh", "icd"]);
const ALLOWED_STATUSES = new Set(["candidate", "unknown"]);

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function stableClone(value) {
    if (Array.isArray(value)) return value.map(stableClone);
    if (value === null || typeof value !== "object") return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableClone(value[key])]));
}

function stableJson(value) {
    return JSON.stringify(stableClone(value));
}

function digest(value) {
    return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function increment(map, key) {
    const value = String(key || "unknown");
    map[value] = (map[value] || 0) + 1;
}

function duplicateValues(values) {
    const counts = new Map();
    (values || []).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    return [...counts.entries()].filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
}

function loadGenerated({ dataRoot = defaultDataRoot, outputFile = defaultOutputFile } = {}) {
    if (fs.existsSync(outputFile)) return { ...readJson(outputFile), generatedFromDisk: true };
    return { ...generator.buildDataset({ dataRoot }), generatedFromDisk: false };
}

function auditBehaviorInventory({ dataRoot = defaultDataRoot, outputFile = defaultOutputFile } = {}) {
    const generated = loadGenerated({ dataRoot, outputFile });
    const expected = generator.buildDataset({ dataRoot });
    const errors = [];
    const sourceRecords = generated.sourceRecords || {};
    const candidates = generated.candidates || {};
    const characters = generated.characters || {};
    const missingSourceRefs = [];
    const malformedSources = [];
    const malformedCandidates = [];
    const malformedCharacters = [];
    const pilotLeakCandidates = [];
    const canonicalCandidates = [];
    const unknownValueViolations = [];
    const candidateValueViolations = [];
    const pointerViolations = [];
    const inputDigestMismatches = [];
    const statusCounts = {};
    const kindCounts = {};
    const perCharacterCounts = {};
    const sourceKindCounts = {};
    const pilotSet = new Set(generator.PILOT_IDS);

    if (generated.schemaVersion !== 2) errors.push("schemaVersion must be 2");
    if (generated.kind !== "genshinBehaviorV2Inventory") errors.push("unexpected dataset kind");
    if (stableJson(generated.pilotIds || []) !== stableJson(generator.PILOT_IDS)) errors.push("pilotIds do not match behavior pilot set");
    if (generated.generator?.version !== expected.generator?.version) errors.push("generator version mismatch");
    if (generated.generatedFromDisk) {
        const comparable = { ...generated };
        delete comparable.generatedFromDisk;
        if (stableJson(comparable) !== stableJson(expected)) errors.push("generated artifact is not deterministic for current source files");
    }

    Object.entries(sourceRecords).forEach(([id, source]) => {
        increment(sourceKindCounts, source?.kind);
        if (!source || source.id !== id || !source.locator?.dataset || !source.locator?.record || !source.integrity?.digest) {
            malformedSources.push(id);
            return;
        }
        if (source.integrity.algorithm !== "sha256" || source.integrity.digest !== digest(source.text)) malformedSources.push(id);
        if (source.gameVersion !== null) malformedSources.push(id);
    });

    Object.entries(candidates).forEach(([id, candidate]) => {
        increment(statusCounts, candidate?.status);
        increment(kindCounts, candidate?.kind);
        const characterId = String(candidate?.entity?.id || "");
        perCharacterCounts[characterId] = (perCharacterCounts[characterId] || 0) + 1;
        if (!candidate || candidate.id !== id || !ALLOWED_STATUSES.has(candidate.status)
            || !ALLOWED_KINDS.has(candidate.kind) || candidate.reviewStatus !== "needsReview"
            || candidate.verification?.status !== "needsReview"
            || candidate.verification?.sourceAgreement !== "singleSource"
            || !candidate.entity?.kind || !candidate.entity?.id || !candidate.entity?.component
            || !Array.isArray(candidate.sourceRefs) || candidate.sourceRefs.length !== 1
            || !candidate.sourcePointer || !candidate.extraction) malformedCandidates.push(id);
        if (pilotSet.has(characterId)) pilotLeakCandidates.push(id);
        if (candidate.canonical !== undefined || candidate.runtime?.status === "canonical") canonicalCandidates.push(id);
        candidate.sourceRefs?.forEach((ref) => { if (!sourceRecords[ref]) missingSourceRefs.push({ candidateId: id, sourceRef: ref }); });
        if (candidate.sourcePointer?.sourceId !== candidate.sourceRefs?.[0]) pointerViolations.push(`${id}:sourceId`);
        const source = sourceRecords[candidate.sourceRefs?.[0]];
        if (source && candidate.sourcePointer?.textDigest !== digest(source.text)) pointerViolations.push(`${id}:textDigest`);
        if (candidate.status === "unknown") {
            if (candidate.value !== null || candidate.unit !== "unknown" || candidate.fieldPath !== null || candidate.operation !== null) unknownValueViolations.push(id);
        } else if (candidate.status === "candidate") {
            // Reset/refresh/ignore operations can intentionally carry a null
            // value; the operation itself is the explicit source claim.
            if (candidate.value === null && candidate.operation === "set" && candidate.kind !== "refresh") candidateValueViolations.push(id);
            if (!candidate.fieldPath) candidateValueViolations.push(id);
        }
    });

    const expectedCharacterIds = Object.keys(expected.characters || {}).sort();
    const actualCharacterIds = Object.keys(characters).sort();
    if (stableJson(actualCharacterIds) !== stableJson(expectedCharacterIds)) malformedCharacters.push("keys");
    expectedCharacterIds.forEach((id) => {
        const character = characters[id];
        if (!character || character.id !== id || character.pilot !== pilotSet.has(id)
            || character.expansionEligible === pilotSet.has(id) || !Array.isArray(character.sourceRecordIds)
            || !Array.isArray(character.candidateIds)) {
            malformedCharacters.push(id);
            return;
        }
        character.sourceRecordIds.forEach((sourceId) => {
            if (!sourceRecords[sourceId] || !sourceId.startsWith(`behavior-inventory:source:${id}:`)) malformedCharacters.push(`${id}:source:${sourceId}`);
        });
        character.candidateIds.forEach((candidateId) => {
            if (!candidates[candidateId] || candidates[candidateId].entity?.id !== id) malformedCharacters.push(`${id}:candidate:${candidateId}`);
        });
        if (character.pilot && character.candidateIds.length !== 0) malformedCharacters.push(`${id}:pilotCandidates`);
        if (!character.pilot && character.suppressedPilotCandidates !== 0) malformedCharacters.push(`${id}:suppressed`);
        if (character.candidateIds.length !== (perCharacterCounts[id] || 0)) malformedCharacters.push(`${id}:candidateCount`);
    });

    (generated.summary?.generatedFrom || []).forEach((input) => {
        const relative = String(input.path || "").replace(/^games\/genshin\/data\//, "");
        const absolute = path.join(dataRoot, relative);
        if (!fs.existsSync(absolute)) inputDigestMismatches.push({ path: input.path, reason: "missing" });
        else {
            const actual = crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
            if (actual !== input.integrity?.digest) inputDigestMismatches.push({ path: input.path, reason: "digestMismatch" });
        }
    });

    const duplicateCandidateIds = duplicateValues(Object.keys(candidates));
    const duplicateSourceIds = duplicateValues(Object.keys(sourceRecords));
    if (pilotLeakCandidates.length || canonicalCandidates.length || missingSourceRefs.length || malformedSources.length
        || malformedCandidates.length || malformedCharacters.length || unknownValueViolations.length || candidateValueViolations.length
        || pointerViolations.length || inputDigestMismatches.length || duplicateCandidateIds.length || duplicateSourceIds.length) {
        errors.push("behavior inventory coverage/contract failure");
    }

    const summary = {
        schemaVersion: 2,
        status: errors.length ? "failed" : "passed",
        characters: expectedCharacterIds.length,
        pilotCharacters: generator.PILOT_IDS.length,
        expansionCharacters: expectedCharacterIds.length - generator.PILOT_IDS.length,
        sourceRecords: Object.keys(sourceRecords).length,
        candidates: Object.keys(candidates).length,
        coverage: {
            characters: expectedCharacterIds.length ? actualCharacterIds.length / expectedCharacterIds.length : 1,
            expansionCharacters: expectedCharacterIds.length - generator.PILOT_IDS.length
                ? actualCharacterIds.filter((id) => !pilotSet.has(id)).length / (expectedCharacterIds.length - generator.PILOT_IDS.length) : 1,
            sourceRefs: missingSourceRefs.length === 0 ? 1 : 0
        },
        candidateStatusCounts: statusCounts,
        candidateKindCounts: kindCounts,
        perCharacterCandidates: perCharacterCounts,
        pilotExclusion: {
            leakedCandidates: pilotLeakCandidates.length,
            suppressed: generated.summary?.pilotCandidatesSuppressed || 0,
            fingerprintMatches: generated.summary?.pilotOverlapCandidates || 0,
            canonical: 0
        },
        references: {
            resolved: missingSourceRefs.length === 0 && pointerViolations.length === 0,
            missingSourceRefs: missingSourceRefs.length,
            pointerViolations: pointerViolations.length
        },
        contract: {
            malformedSources: malformedSources.length,
            malformedCandidates: malformedCandidates.length,
            malformedCharacters: malformedCharacters.length,
            unknownValueViolations: unknownValueViolations.length,
            candidateValueViolations: candidateValueViolations.length,
            canonicalCandidates: canonicalCandidates.length,
            duplicateCandidateIds: duplicateCandidateIds.length,
            duplicateSourceIds: duplicateSourceIds.length,
            inputDigestMismatches: inputDigestMismatches.length
        },
        sourceKinds: sourceKindCounts,
        generatedFromDisk: Boolean(generated.generatedFromDisk),
        deterministic: !errors.includes("generated artifact is not deterministic for current source files")
    };
    return {
        schemaVersion: 2,
        status: summary.status,
        summary,
        errors,
        missingSourceRefs,
        malformedSources,
        malformedCandidates,
        malformedCharacters,
        pilotLeakCandidates,
        canonicalCandidates,
        unknownValueViolations,
        candidateValueViolations,
        pointerViolations,
        inputDigestMismatches,
        duplicates: { candidates: duplicateCandidateIds, sources: duplicateSourceIds },
        generatedFromDisk: Boolean(generated.generatedFromDisk)
    };
}

function markdownReport(audit) {
    const summary = audit.summary || {};
    const status = audit.status || "failed";
    const statuses = Object.entries(summary.candidateStatusCounts || {}).map(([key, value]) => `| ${key} | ${value} |`).join("\n");
    const kinds = Object.entries(summary.candidateKindCounts || {}).map(([key, value]) => `| ${key} | ${value} |`).join("\n");
    return `# Genshin behavior v2 inventory\n\nStatus: **${status}**\n\nThis report is generated from the deterministic all-character inventory audit. It is an evidence/coverage layer; it does not promote runtime behavior or infer values from prose.\n\n## Coverage\n\n| Metric | Count |\n| --- | ---: |\n| Raw characters | ${summary.characters || 0} |\n| Pilot characters excluded | ${summary.pilotCharacters || 0} |\n| Expansion characters | ${summary.expansionCharacters || 0} |\n| Source records | ${summary.sourceRecords || 0} |\n| Expansion candidates | ${summary.candidates || 0} |\n| Pilot candidates leaked | ${summary.pilotExclusion?.leakedCandidates || 0} |\n| Canonical candidates | ${summary.pilotExclusion?.canonical || 0} |\n\n## Candidate status\n\n| Status | Count |\n| --- | ---: |\n${statuses}\n\n## Candidate kinds\n\n| Kind | Count |\n| --- | ---: |\n${kinds}\n\nAll candidate records remain needsReview/singleSource; unknown records retain a null value and a source pointer for later review.\n`;
}

function writeAudit(audit = auditBehaviorInventory(), { outputFile = defaultAuditFile, reportFile = defaultReportFile } = {}) {
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });
    fs.writeFileSync(reportFile, markdownReport(audit), "utf8");
    return audit;
}

if (require.main === module) {
    const dataRoot = process.env.GENSHIN_DATA_ROOT || defaultDataRoot;
    const outputFile = process.env.GENSHIN_BEHAVIOR_V2_INVENTORY_FILE || defaultOutputFile;
    const auditFile = process.env.GENSHIN_BEHAVIOR_V2_INVENTORY_AUDIT || defaultAuditFile;
    const reportFile = process.env.GENSHIN_BEHAVIOR_V2_INVENTORY_REPORT || defaultReportFile;
    process.stdout.write(`${JSON.stringify(writeAudit(auditBehaviorInventory({ dataRoot, outputFile }), { outputFile: auditFile, reportFile }), null, 2)}\n`);
}

module.exports = {
    auditBehaviorInventory,
    defaultAuditFile,
    defaultDataRoot,
    defaultOutputFile,
    defaultReportFile,
    duplicateValues,
    loadGenerated,
    markdownReport,
    writeAudit
};
