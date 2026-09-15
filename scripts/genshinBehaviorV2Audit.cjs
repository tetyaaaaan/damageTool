"use strict";

/** Deterministic audit for the character behaviour v2 pilot artifact. */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
    PILOT_IDS,
    buildDataset,
    defaultDataRoot,
    defaultOutputFile,
    stableJson
} = require("./genshinBehaviorV2Generate.cjs");

const OPERATIONS = ["add", "multiply", "replace", "reset", "extend", "consume", "setMaximum", "ignoreCooldown", "refresh"];
const MEASUREMENT_UNITS = ["seconds", "frames", "hits", "attacks", "charges", "instances", "points", "particles", "percent", "boolean", "enum", "unknown"];
const MEASUREMENT_STATUSES = ["explicit", "derived", "unknown", "notApplicable", "disputed"];

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
    return [...occurrences.entries()]
        .filter(([, count]) => count > 1)
        .map(([value, count]) => ({ value, count }));
}

function isMeasurement(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        && Object.prototype.hasOwnProperty.call(value, "value")
        && Object.prototype.hasOwnProperty.call(value, "unit")
        && Object.prototype.hasOwnProperty.call(value, "status")
        && Array.isArray(value.sourceRefs);
}

function loadGenerated({ dataRoot = defaultDataRoot, outputFile = defaultOutputFile } = {}) {
    if (fs.existsSync(outputFile)) return { ...readJson(outputFile), generatedFromDisk: true };
    return { ...buildDataset({ dataRoot }), generatedFromDisk: false };
}

function auditGenshinBehaviorV2({ dataRoot = defaultDataRoot, outputFile = defaultOutputFile } = {}) {
    const generated = loadGenerated({ dataRoot, outputFile });
    const expected = buildDataset({ dataRoot });
    const sourceRecords = generated.sourceRecords || {};
    const specs = generated.specs || {};
    const modifiers = generated.modifiers || {};
    const errors = [];
    const missingSourceRefs = [];
    const missingTargetSpecs = [];
    const malformedSources = [];
    const malformedSpecs = [];
    const malformedModifiers = [];
    const malformedByCharacter = [];
    const forbiddenMeasurements = [];
    const nonExplicitMeasurements = [];
    const unknownFieldViolations = [];
    const operationCounts = {};
    const pathCounts = {};
    const verificationCounts = {};
    const sourceKindCounts = {};
    const sourceRefs = new Set();

    if (generated.schemaVersion !== 2) errors.push("schemaVersion must be 2");
    if (generated.kind !== "genshinBehaviorV2Pilot") errors.push("unexpected dataset kind");
    if (JSON.stringify(generated.pilotIds || []) !== JSON.stringify(PILOT_IDS)) errors.push("pilotIds do not match the fixed pilot set");
    if (generated.generator?.version !== expected.generator?.version) errors.push("generator version mismatch");
    if (!generated.byCharacter || JSON.stringify(Object.keys(generated.byCharacter).sort()) !== JSON.stringify([...PILOT_IDS].sort())) {
        malformedByCharacter.push("keys");
    }
    if (generated.generatedFromDisk) {
        const generatedComparable = { ...generated };
        delete generatedComparable.generatedFromDisk;
        if (stableJson(generatedComparable) !== stableJson(expected)) errors.push("generated artifact is not deterministic for the current source files");
    }

    Object.entries(sourceRecords).forEach(([id, source]) => {
        increment(sourceKindCounts, source?.kind);
        if (!source || source.id !== id || !source.locator?.dataset || !source.locator?.record || !source.integrity?.digest) {
            malformedSources.push(id);
            return;
        }
        if (source.integrity.algorithm !== "sha256" || source.integrity.digest !== digest(source.text)) malformedSources.push(id);
    });

    function checkMeasurement(value, owner, pathName) {
        if (!isMeasurement(value) || !MEASUREMENT_UNITS.includes(value.unit) || !MEASUREMENT_STATUSES.includes(value.status)) {
            malformedSpecs.push(`${owner}:${pathName}`);
            return;
        }
        if (value.status !== "explicit") nonExplicitMeasurements.push(`${owner}:${pathName}`);
        (value.sourceRefs || []).forEach((ref) => {
            sourceRefs.add(ref);
            if (!sourceRecords[ref]) missingSourceRefs.push({ owner, path: pathName, sourceRef: ref });
        });
        if (pathName.endsWith("/burstCost") || pathName.endsWith("/snapshot")) forbiddenMeasurements.push(`${owner}:${pathName}`);
    }

    Object.entries(specs).forEach(([id, spec]) => {
        increment(verificationCounts, spec?.verification?.status);
        if (!spec || spec.id !== id || !spec.entity?.kind || !spec.entity?.id || !spec.entity?.component
            || !Array.isArray(spec.sourceRefs) || spec.sourceRefs.length === 0
            || !spec.timing || !spec.execution || !spec.lifecycle || !spec.verification) {
            malformedSpecs.push(id);
            return;
        }
        if (spec.verification.status !== "needsReview") errors.push(`${id}: candidate status must be needsReview`);
        if (!Array.isArray(spec.unknownFields) || !spec.unknownFields.includes("burstCost") || !spec.unknownFields.includes("snapshot")) {
            unknownFieldViolations.push(id);
        }
        spec.sourceRefs.forEach((ref) => {
            sourceRefs.add(ref);
            if (!sourceRecords[ref]) missingSourceRefs.push({ owner: id, sourceRef: ref });
        });
        ["timing", "execution", "energy", "elementApplication"].forEach((section) => {
            Object.entries(spec[section] || {}).forEach(([key, value]) => checkMeasurement(value, id, `/${section}/${key}`));
        });
        if (spec.execution.snapshot !== undefined || spec.energy?.burstCost !== undefined) forbiddenMeasurements.push(id);
        if (spec.lifecycle.refreshMode === undefined || spec.lifecycle.expiration === undefined) malformedSpecs.push(`${id}:lifecycle`);
    });

    Object.entries(modifiers).forEach(([id, modifier]) => {
        increment(operationCounts, modifier?.operation);
        increment(pathCounts, modifier?.path);
        if (!modifier || modifier.id !== id || !Array.isArray(modifier.sourceRefs) || !modifier.sourceRefs.length
            || !specs[modifier.targetSpecId] || !/^\/(timing|execution|lifecycle|energy|elementApplication)\//.test(String(modifier.path || ""))
            || !OPERATIONS.includes(modifier.operation) || !Object.prototype.hasOwnProperty.call(modifier, "value")
            || !modifier.condition?.kind || !modifier.condition?.stateKey || !modifier.verification) {
            malformedModifiers.push(id);
            if (!specs[modifier?.targetSpecId]) missingTargetSpecs.push({ modifierId: id, targetSpecId: modifier?.targetSpecId });
            return;
        }
        if (modifier.verification.status !== "needsReview") errors.push(`${id}: candidate status must be needsReview`);
        modifier.sourceRefs.forEach((ref) => {
            sourceRefs.add(ref);
            if (!sourceRecords[ref]) missingSourceRefs.push({ owner: id, sourceRef: ref });
        });
    });

    PILOT_IDS.forEach((characterId) => {
        const index = generated.byCharacter?.[characterId];
        if (!index || !Array.isArray(index.sourceRecordIds) || !Array.isArray(index.specIds) || !Array.isArray(index.modifierIds)) {
            malformedByCharacter.push(characterId);
            return;
        }
        index.sourceRecordIds.forEach((sourceId) => {
            if (!sourceRecords[sourceId] || !sourceId.startsWith(`source:${characterId}:`)) {
                malformedByCharacter.push(`${characterId}:source:${sourceId}`);
            }
        });
        index.specIds.forEach((specId) => {
            if (!specs[specId] || specs[specId].entity?.id !== characterId) {
                malformedByCharacter.push(`${characterId}:spec:${specId}`);
            }
        });
        index.modifierIds.forEach((modifierId) => {
            if (!modifiers[modifierId] || !modifierId.startsWith(`behavior-modifier:${characterId}:`)) {
                malformedByCharacter.push(`${characterId}:modifier:${modifierId}`);
            }
        });
        if (index.specIds.length !== (generated.summary?.specsByCharacter?.[characterId] ?? index.specIds.length)) {
            malformedByCharacter.push(`${characterId}:specCount`);
        }
        if (index.modifierIds.length !== (generated.summary?.modifiersByCharacter?.[characterId] ?? index.modifierIds.length)) {
            malformedByCharacter.push(`${characterId}:modifierCount`);
        }
    });

    const duplicateSpecIds = duplicateValues(Object.keys(specs));
    const duplicateModifierIds = duplicateValues(Object.keys(modifiers));
    const duplicateSourceIds = duplicateValues(Object.keys(sourceRecords));
    if (duplicateSpecIds.length || duplicateModifierIds.length || duplicateSourceIds.length) errors.push("duplicate IDs detected");
    if (missingSourceRefs.length || malformedSources.length || malformedSpecs.length || malformedModifiers.length || malformedByCharacter.length || missingTargetSpecs.length) {
        errors.push("behavior v2 contract/reference failure");
    }
    if (forbiddenMeasurements.length || nonExplicitMeasurements.length || unknownFieldViolations.length) {
        errors.push("behavior v2 contains inferred/forbidden measurements");
    }

    const summary = {
        schemaVersion: 2,
        status: errors.length ? "failed" : "passed",
        pilotCharacters: PILOT_IDS.length,
        sourceRecords: Object.keys(sourceRecords).length,
        specs: Object.keys(specs).length,
        modifiers: Object.keys(modifiers).length,
        verificationByStatus: verificationCounts,
        operationCounts,
        pathCounts,
        references: {
            resolved: missingSourceRefs.length === 0 && missingTargetSpecs.length === 0 && malformedByCharacter.length === 0,
            sourceRefs: sourceRefs.size,
            missingSourceRefs: missingSourceRefs.length,
            missingTargetSpecs: missingTargetSpecs.length,
            byCharacter: {
                characters: Object.keys(generated.byCharacter || {}).length,
                malformed: malformedByCharacter.length
            }
        },
        contract: {
            malformedSources: malformedSources.length,
            malformedSpecs: malformedSpecs.length,
            malformedModifiers: malformedModifiers.length,
            malformedByCharacter: malformedByCharacter.length,
            forbiddenMeasurements: forbiddenMeasurements.length,
            nonExplicitMeasurements: nonExplicitMeasurements.length,
            unknownFieldViolations: unknownFieldViolations.length
        },
        generatedFromDisk: Boolean(generated.generatedFromDisk),
        deterministic: !errors.includes("generated artifact is not deterministic for the current source files")
    };
    return {
        schemaVersion: 2,
        status: summary.status,
        summary,
        errors,
        missingSourceRefs,
        missingTargetSpecs,
        malformedSources,
        malformedSpecs,
        malformedModifiers,
        malformedByCharacter,
        forbiddenMeasurements,
        nonExplicitMeasurements,
        unknownFieldViolations,
        generatedFromDisk: Boolean(generated.generatedFromDisk)
    };
}

if (require.main === module) {
    const dataRoot = process.env.GENSHIN_DATA_ROOT || defaultDataRoot;
    const outputFile = process.env.GENSHIN_BEHAVIOR_V2_FILE || defaultOutputFile;
    process.stdout.write(`${JSON.stringify(auditGenshinBehaviorV2({ dataRoot, outputFile }), null, 2)}\n`);
}

module.exports = {
    auditGenshinBehaviorV2,
    duplicateValues,
    loadGenerated
};
