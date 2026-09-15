"use strict";

/*
 * Bounded, first-provider-only materialization for the 381 weapon-effect
 * candidates whose queue state is sourceMissing/searchRequired.
 *
 * This lane compares one already-materialized local scalar/stack vector
 * (`/effect/valueByRefinement`) with every explicit `r1.values` ...
 * `r5.values` column in the pinned genshin-db transition snapshots.  Slash
 * separated raw stack values are normalized element-by-element; a
 * numeric match is deliberately not a semantic mapping: this file never
 * selects a raw column, target, condition, scope, or canonical value.
 * There is no network or provider search in this module.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { digestStable, stableValue } = require("./genshinVersionEvidenceValidation.cjs");
const verificationStateMachine = require("./genshinVerificationStateMachine.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const transitionRoot = path.join(repositoryRoot, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0");
const queuePath = path.join(repositoryRoot, "reports", "genshin-evidence-task-queue.json");
const specsPath = path.join(repositoryRoot, "games", "genshin", "data", "v2", "weapons", "spec-candidates.json");
const sourceCoveragePath = path.join(repositoryRoot, "reports", "genshin-candidate-source-coverage-frontier-inventory.json");
const sourceSearchFrontiersPath = path.join(repositoryRoot, "games", "genshin", "data", "v2", "source-search-frontiers.json");

const paths = {
    artifact: path.join(repositoryRoot, "games", "genshin", "data", "v2", "weapons", "primary-field-comparison.json"),
    reportJson: path.join(repositoryRoot, "reports", "genshin-weapon-primary-field-comparison.json"),
    reportMarkdown: path.join(repositoryRoot, "reports", "genshin-weapon-primary-field-comparison.md"),
    schema: path.join(repositoryRoot, "games", "genshin", "data", "schema", "weapon-primary-field-comparison.schema.json")
};

const generatedAt = "2026-08-28T00:00:00.000Z";
const LANE = "firstProviderRefinementScalarComparison";
const NORMALIZATION_MODE = "strictDecimalExact";
const EXPECTED_CANDIDATE_COUNT = 381;
const EXPECTED_SOURCE_FAMILY = "GenshinData-derived";
const EXPECTED_PROVIDER = "genshin-db";
const SNAPSHOT_FILES = [
    "weapon-entity-snapshot.json",
    "weapon-entity-snapshot-shard02.json",
    "weapon-entity-snapshot-shard03.json",
    "weapon-entity-snapshot-shard04.json"
];

const REVISION_BINDINGS = {
    before: {
        gameVersion: "6.7",
        revision: "1bab2cdba4d218fd5caa46b5f54e7884ee8359a2",
        packageVersion: "5.2.12",
        manifestDigest: "5ded2b3bab58218da17f6a1282209e653c1ec7ecd9297b95569558a737c2e8f6",
        manifestBlobSha: "e78cc92e75db21ea15edadbeafdf9152896d934c",
        manifestBytes: 1619
    },
    after: {
        gameVersion: "7.0",
        revision: "8b15995fa220c88a4d0d7ffe1e21b041d0b32588",
        packageVersion: "5.2.13",
        manifestDigest: "3faf0b2220539a07af9260f5dd83afd0e964aa42868c9b3b73c6cb14065085c6",
        manifestBlobSha: "cfccefd470f420159b1376440e1a0f86a247030d",
        manifestBytes: 1619
    }
};

const BOUNDED_STATUSES = new Set([
    "numericAgreementOnlyNotSemanticIdentity",
    "ambiguous",
    "mismatch",
    "unitMismatch",
    "missing",
    "localvalueunsupported",
    "rawvalueunsupported",
    "sourceIntegrityInvalid",
    "sourceVariantConflict",
    "entityIdentityInvalid",
    "localProjectionMismatch"
]);

const CLAIM_FIELDS_REQUIRED_FOR_RUNTIME = ["value", "refinement", "activation", "targets"];

function stableJson(value) {
    return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function withoutDigest(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const copy = { ...value };
    delete copy.fieldDigest;
    return copy;
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function sha256(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function gitBlobSha(bytes) {
    // String.fromCharCode(0) is intentional.  A literal "\\0" is not the
    // Git blob header and would make every valid capture appear tampered.
    const header = Buffer.from(`blob ${bytes.length}${String.fromCharCode(0)}`, "utf8");
    return crypto.createHash("sha1").update(Buffer.concat([header, bytes])).digest("hex");
}

function relativePath(file) {
    return path.relative(repositoryRoot, file).replaceAll(path.sep, "/");
}

function safeResolve(root, relative) {
    const absoluteRoot = path.resolve(root);
    const absolute = path.resolve(root, relative);
    if (absolute !== absoluteRoot && !absolute.startsWith(`${absoluteRoot}${path.sep}`)) {
        throw new Error(`path escapes repository root: ${relative}`);
    }
    return absolute;
}

function pointerToken(value) {
    return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}

function normalizeDecimal(value) {
    const text = String(value).trim();
    const match = text.match(/^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/);
    if (!match) return null;
    const sign = match[1] === "-" ? "-" : "";
    const integer = match[2] || "0";
    const fraction = match[3] !== undefined ? match[3] : (match[4] || "");
    const exponent = match[5] ? Number(match[5]) : 0;
    if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 10000) return null;
    const digits = `${integer}${fraction}`.replace(/^0+(?=\d)/, "");
    let decimalPosition = integer.length + exponent;
    let whole;
    let fractional;
    if (decimalPosition <= 0) {
        whole = "0";
        fractional = `${"0".repeat(-decimalPosition)}${digits}`;
    } else if (decimalPosition >= digits.length) {
        whole = `${digits}${"0".repeat(decimalPosition - digits.length)}`;
        fractional = "";
    } else {
        whole = digits.slice(0, decimalPosition);
        fractional = digits.slice(decimalPosition);
    }
    whole = whole.replace(/^0+(?=\d)/, "") || "0";
    fractional = fractional.replace(/0+$/, "");
    const canonical = fractional ? `${whole}.${fractional}` : whole;
    return canonical === "0" ? "0" : `${sign}${canonical}`;
}

function normalizeUnit(unit) {
    if (unit === undefined || unit === null || unit === "") return null;
    const text = String(unit).trim().toLowerCase();
    if (text === "percent" || text === "%") return "percent";
    if (["percentofreference", "percent-of-reference", "percent_of_reference"].includes(text)) return "percentOfReference";
    if (["number", "numeric", "flat", "raw"].includes(text)) return "number";
    return "unknown";
}

function normalizeScalar(value, { declaredUnit = null, side = "raw", mode = NORMALIZATION_MODE } = {}) {
    if (mode !== NORMALIZATION_MODE) return { status: "unknownmode", raw: value, mode };
    if (typeof value === "boolean" || value === null || value === undefined || typeof value === "object") {
        return { status: "unsupported", raw: value, mode };
    }
    let text;
    let explicitUnit = null;
    if (typeof value === "number") {
        if (!Number.isFinite(value)) return { status: "unsupported", raw: value, mode };
        text = String(value);
    } else {
        text = String(value).trim();
        if (text.endsWith("%")) {
            explicitUnit = "percent";
            text = text.slice(0, -1).trim();
        }
    }
    const decimal = normalizeDecimal(text);
    if (decimal === null) return { status: "unsupported", raw: value, mode };
    const declared = normalizeUnit(declaredUnit);
    if (declared === "unknown") return { status: "unsupported", raw: value, mode, reason: "unknownDeclaredUnit" };
    const unit = explicitUnit || (side === "local" && declared) || "number";
    if (explicitUnit && declared && explicitUnit !== declared) {
        return { status: "unsupported", raw: value, mode, reason: "declaredUnitConflict", unit: explicitUnit };
    }
    return { status: "ok", raw: value, decimal, unit, canonical: `${unit}:${decimal}`, mode };
}

function normalizeVectorElements(values, {
    declaredUnit = null,
    side = "raw",
    representation = "stackVector",
    unitSource = "declared",
    sourceTokens = null,
    mode = NORMALIZATION_MODE
} = {}) {
    if (mode !== NORMALIZATION_MODE) return { status: "unknownmode", raw: values, mode };
    if (!Array.isArray(values) || values.length === 0) {
        return { status: "unsupported", raw: values, mode, reason: "emptyVector" };
    }
    const elements = values.map((value, index) => {
        const sourceToken = Array.isArray(sourceTokens) && index < sourceTokens.length
            ? sourceTokens[index]
            : value;
        const normalized = normalizeScalar(value, { declaredUnit, side, mode });
        return {
            ...normalized,
            index,
            sourceToken,
            unitSource
        };
    });
    const unsupported = elements.find((element) => element.status !== "ok");
    if (unsupported) {
        return {
            status: "unsupported",
            raw: values,
            mode,
            representation,
            elements,
            length: values.length,
            reason: unsupported.reason || "arrayElementUnsupported",
            unsupportedIndex: unsupported.index
        };
    }
    const units = [...new Set(elements.map((element) => element.unit))];
    if (units.length !== 1) {
        return {
            status: "unsupported",
            raw: values,
            mode,
            representation,
            elements,
            length: values.length,
            reason: "mixedElementUnits"
        };
    }
    return {
        status: "ok",
        raw: values,
        mode,
        representation,
        elements,
        length: values.length,
        unit: units[0],
        unitSource
    };
}

function normalizeSlashSeparatedVector(value, { mode = NORMALIZATION_MODE } = {}) {
    if (mode !== NORMALIZATION_MODE) return { status: "unknownmode", raw: value, mode };
    if (typeof value !== "string" || !value.includes("/")) {
        return { status: "unsupported", raw: value, mode, reason: "notSlashSeparated" };
    }
    const sourceTokens = value.split("/").map((token) => token.trim());
    if (sourceTokens.length < 2 || sourceTokens.some((token) => token === "")) {
        return { status: "unsupported", raw: value, mode, reason: "invalidSlashSeparatedShape" };
    }
    const trailingPercent = /%$/.test(sourceTokens[sourceTokens.length - 1]);
    const earlierPercent = sourceTokens.slice(0, -1).some((token) => /%$/.test(token));
    const appliedTrailingUnit = trailingPercent && !earlierPercent ? "percent" : null;
    const normalizedTokens = appliedTrailingUnit
        ? sourceTokens.map((token) => /%$/.test(token) ? token : `${token}%`)
        : sourceTokens;
    const normalized = normalizeVectorElements(normalizedTokens, {
        side: "raw",
        representation: "slashSeparatedVector",
        unitSource: appliedTrailingUnit ? "trailingSuffix" : "perElement",
        sourceTokens,
        mode
    });
    return {
        ...normalized,
        raw: value,
        sourceTokens,
        delimiter: "/",
        trailingUnit: appliedTrailingUnit
    };
}

function decodePointerToken(value) {
    return String(value).replaceAll("~1", "/").replaceAll("~0", "~");
}

function valueAtPath(value, pointer) {
    if (!pointer || pointer === "/") return value;
    return String(pointer).split("/").slice(1).map(decodePointerToken).reduce((current, key) => {
        if (current === null || current === undefined || typeof current !== "object") return undefined;
        return current[key];
    }, value);
}

function claimFieldPath(field) {
    const pathsByField = {
        value: "/effect/value",
        refinement: "/effect/valueByRefinement",
        unit: "/effect/unit",
        "effect.kind": "/effect/kind",
        "effect.activation.calculationSupport": "/effect/activation/calculationSupport",
        "effect.activation.uidHandling": "/effect/activation/uidHandling",
        activation: "/effect/activation",
        targets: "/effect/targets",
        duration: "/effect/duration",
        stack: "/effect/stack",
        cooldown: "/effect/cooldown",
        interval: "/effect/interval",
        offField: "/effect/offField",
        hitCount: "/effect/hitCount",
        charges: "/effect/charges",
        maxInstances: "/effect/maxInstances",
        elementApplication: "/effect/elementApplication",
        energy: "/effect/energy",
        snapshot: "/effect/snapshot",
        area: "/effect/area",
        entity: "/entity",
        interpretation: "/interpretation",
        destination: "/destination",
        supersedesLegacyModifierIds: "/supersedesLegacyModifierIds",
        "runtime.modifierIds": "/runtime/modifierIds",
        registryStructure: "/runtime/destination"
    };
    return pathsByField[field] || `/${String(field).split(".").map(pointerToken).join("/")}`;
}

function claimValueForField(spec, field) {
    const value = valueAtPath(spec, claimFieldPath(field));
    return value === undefined ? null : value;
}

function claimValueDigest(value, fieldPath) {
    return digestStable({ fieldPath, value: value === undefined ? null : value });
}

function extractLocalVector(spec) {
    const effect = spec && spec.effect;
    if (!effect || effect.valueByRefinement === undefined || effect.valueByRefinement === null) {
        return {
            status: "missing",
            path: "/effect/valueByRefinement",
            declaredUnit: effect?.unit ?? null,
            rawByRefinement: null,
            normalizedByRefinement: null,
            fieldDigest: digestStable({ path: "/effect/valueByRefinement", value: null })
        };
    }
    const values = effect.valueByRefinement;
    if (!values || typeof values !== "object" || Array.isArray(values)) {
        return {
            status: "localvalueunsupported",
            path: "/effect/valueByRefinement",
            declaredUnit: effect.unit ?? null,
            rawByRefinement: values,
            normalizedByRefinement: null,
            fieldDigest: digestStable({ path: "/effect/valueByRefinement", declaredUnit: effect.unit ?? null, value: values })
        };
    }
    const unexpectedRankKeys = Object.keys(values).filter((key) => !/^[1-5]$/.test(key));
    if (unexpectedRankKeys.length > 0) {
        return {
            status: "localvalueunsupported",
            path: "/effect/valueByRefinement",
            declaredUnit: effect.unit ?? null,
            rawByRefinement: values,
            normalizedByRefinement: null,
            unsupportedReason: "unexpectedRankKeys",
            unsupportedKeys: unexpectedRankKeys.sort(),
            fieldDigest: digestStable({ path: "/effect/valueByRefinement", declaredUnit: effect.unit ?? null, value: values })
        };
    }
    const rawByRefinement = {};
    const normalizedByRefinement = {};
    const declaredUnit = effect.unit ?? null;
    const stackMax = Number.isInteger(effect.stack?.max) && effect.stack.max > 0 ? effect.stack.max : null;
    let shape = null;
    let vectorLength = null;
    for (let rank = 1; rank <= 5; rank += 1) {
        const key = String(rank);
        if (!Object.prototype.hasOwnProperty.call(values, key)) {
            return {
                status: "missing",
                path: "/effect/valueByRefinement",
                declaredUnit,
                rawByRefinement: values,
                normalizedByRefinement,
                fieldDigest: digestStable({ path: "/effect/valueByRefinement", declaredUnit, value: values })
            };
        }
        rawByRefinement[key] = values[key];
        const isVector = Array.isArray(values[key]);
        const currentShape = isVector ? "vector" : "scalar";
        if (shape && shape !== currentShape) {
            return {
                status: "localvalueunsupported",
                path: "/effect/valueByRefinement",
                declaredUnit,
                rawByRefinement,
                normalizedByRefinement,
                unsupportedRank: rank,
                unsupportedReason: "mixedRefinementShape",
                fieldDigest: digestStable({ path: "/effect/valueByRefinement", declaredUnit, value: values })
            };
        }
        shape = shape || currentShape;
        if (isVector) {
            if (vectorLength === null) vectorLength = values[key].length;
            if (values[key].length !== vectorLength) {
                return {
                    status: "localvalueunsupported",
                    path: "/effect/valueByRefinement",
                    declaredUnit,
                    rawByRefinement,
                    normalizedByRefinement,
                    unsupportedRank: rank,
                    unsupportedReason: "arrayLengthMismatch",
                    expectedArrayLength: vectorLength,
                    actualArrayLength: values[key].length,
                    fieldDigest: digestStable({ path: "/effect/valueByRefinement", declaredUnit, value: values })
                };
            }
            if (stackMax !== null && values[key].length !== stackMax) {
                return {
                    status: "localvalueunsupported",
                    path: "/effect/valueByRefinement",
                    declaredUnit,
                    rawByRefinement,
                    normalizedByRefinement,
                    unsupportedRank: rank,
                    unsupportedReason: "arrayLengthStackMismatch",
                    expectedArrayLength: stackMax,
                    actualArrayLength: values[key].length,
                    fieldDigest: digestStable({ path: "/effect/valueByRefinement", declaredUnit, value: values })
                };
            }
        }
        const normalized = isVector
            ? normalizeVectorElements(values[key], {
                declaredUnit,
                side: "local",
                representation: "stackVector",
                unitSource: declaredUnit ? "declared" : "implicitDefault"
            })
            : normalizeScalar(values[key], { declaredUnit, side: "local" });
        if (normalized.status !== "ok") {
            return {
                status: "localvalueunsupported",
                path: "/effect/valueByRefinement",
                declaredUnit,
                rawByRefinement,
                normalizedByRefinement,
                unsupportedRank: rank,
                unsupportedReason: normalized.reason || normalized.status,
                fieldDigest: digestStable({ path: "/effect/valueByRefinement", declaredUnit, value: values })
            };
        }
        normalizedByRefinement[key] = normalized;
    }
    return {
        status: "ok",
        path: "/effect/valueByRefinement",
        declaredUnit,
        rawByRefinement,
        normalizedByRefinement,
        fieldDigest: digestStable({ path: "/effect/valueByRefinement", declaredUnit, value: values })
    };
}

function extractRawColumns(raw) {
    const ranks = [];
    let columnCount = 0;
    for (let rank = 1; rank <= 5; rank += 1) {
        const key = `r${rank}`;
        const values = raw && raw[key] && raw[key].values;
        if (!Array.isArray(values)) {
            return { status: "missing", ranks, columns: [], missingRank: rank };
        }
        columnCount = Math.max(columnCount, values.length);
        ranks.push({ rank, key, values });
    }
    if (columnCount === 0) return { status: "missing", ranks, columns: [] };
    const columns = [];
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
        const valuesByRank = [];
        let columnStatus = "ok";
        let columnShape = null;
        let vectorLength = null;
        for (const { rank, key, values } of ranks) {
            if (columnIndex >= values.length) {
                columnStatus = "missing";
                valuesByRank.push({ rank, pointer: `/${key}/values/${columnIndex}`, raw: null, normalized: null });
                continue;
            }
            const rawValue = values[columnIndex];
            const scalar = normalizeScalar(rawValue, { side: "raw" });
            const normalized = scalar.status === "ok"
                ? scalar
                : normalizeSlashSeparatedVector(rawValue);
            valuesByRank.push({ rank, pointer: `/${key}/values/${columnIndex}`, raw: rawValue, normalized });
            if (normalized.status !== "ok" && columnStatus === "ok") columnStatus = "rawvalueunsupported";
            if (normalized.status === "ok") {
                const currentShape = normalized.representation || "scalar";
                if (columnShape && columnShape !== currentShape && columnStatus === "ok") columnStatus = "rawvalueunsupported";
                columnShape = columnShape || currentShape;
                if (normalized.representation) {
                    if (vectorLength === null) vectorLength = normalized.length;
                    if (normalized.length !== vectorLength && columnStatus === "ok") columnStatus = "rawvalueunsupported";
                }
            }
        }
        columns.push({ columnIndex, status: columnStatus, valuesByRank });
    }
    return { status: "ok", ranks, columns };
}

function normalizedElements(value) {
    return value && value.status === "ok" && Array.isArray(value.elements) ? value.elements : null;
}

function compareVector(local, rawColumn) {
    if (local.status !== "ok") return { status: local.status, numericEqual: false, unitEqual: false };
    if (!rawColumn || rawColumn.status === "missing") return { status: "missing", numericEqual: false, unitEqual: false };
    if (rawColumn.status === "rawvalueunsupported") return { status: "rawvalueunsupported", numericEqual: false, unitEqual: false };
    let numericEqual = true;
    let unitEqual = true;
    for (const item of rawColumn.valuesByRank) {
        const localValue = local.normalizedByRefinement[String(item.rank)];
        if (!item.normalized || item.normalized.status !== "ok" || !localValue) {
            numericEqual = false;
            unitEqual = false;
            continue;
        }
        const localElements = normalizedElements(localValue);
        const rawElements = normalizedElements(item.normalized);
        if (Boolean(localElements) !== Boolean(rawElements)) {
            numericEqual = false;
            unitEqual = false;
            continue;
        }
        if (localElements && rawElements) {
            if (localElements.length !== rawElements.length) {
                numericEqual = false;
                unitEqual = false;
                continue;
            }
            for (let index = 0; index < localElements.length; index += 1) {
                if (localElements[index].decimal !== rawElements[index].decimal) numericEqual = false;
                if (localElements[index].unit !== rawElements[index].unit) unitEqual = false;
            }
            continue;
        }
        if (localValue.decimal !== item.normalized.decimal) numericEqual = false;
        if (localValue.unit !== item.normalized.unit) unitEqual = false;
    }
    if (numericEqual && unitEqual) return { status: "numericAgreementOnlyNotSemanticIdentity", numericEqual: true, unitEqual: true };
    if (numericEqual && !unitEqual) return { status: "unitMismatch", numericEqual: true, unitEqual: false };
    return { status: "mismatch", numericEqual: false, unitEqual, };
}

function compareRefinementVectors(local, rawColumns) {
    if (local.status !== "ok") {
        return {
            status: local.status,
            numericAgreementOnlyNotSemanticIdentity: false,
            semanticIdentityEstablished: false,
            numericMatchingColumnIndexes: [],
            columnComparisons: []
        };
    }
    if (!rawColumns || rawColumns.status === "missing") {
        return {
            status: "missing",
            numericAgreementOnlyNotSemanticIdentity: false,
            semanticIdentityEstablished: false,
            numericMatchingColumnIndexes: [],
            columnComparisons: []
        };
    }
    if (!Array.isArray(rawColumns.columns) || rawColumns.columns.length === 0) {
        return {
            status: "missing",
            numericAgreementOnlyNotSemanticIdentity: false,
            semanticIdentityEstablished: false,
            numericMatchingColumnIndexes: [],
            columnComparisons: []
        };
    }
    const columnComparisons = rawColumns.columns.map((column) => ({
        columnIndex: column.columnIndex,
        ...compareVector(local, column)
    }));
    const matches = columnComparisons.filter((comparison) => comparison.numericEqual && comparison.unitEqual).map((comparison) => comparison.columnIndex);
    let status;
    if (matches.length === 1) status = "numericAgreementOnlyNotSemanticIdentity";
    else if (matches.length > 1) status = "ambiguous";
    else if (columnComparisons.some((comparison) => comparison.status === "unitMismatch")) status = "unitMismatch";
    else if (columnComparisons.some((comparison) => comparison.status === "rawvalueunsupported")) status = "rawvalueunsupported";
    else status = "mismatch";
    return {
        status,
        numericAgreementOnlyNotSemanticIdentity: true,
        semanticIdentityEstablished: false,
        numericMatchingColumnIndexes: matches,
        columnComparisons
    };
}

function normalizeRecord(value) {
    if (Array.isArray(value)) return value.map(normalizeRecord);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalizeRecord(value[key])]));
    }
    if (typeof value === "string") return value.replaceAll("\r\n", "\n");
    return value;
}

function validatePackageBinding(root, binding, expected) {
    const errors = [];
    const relative = binding?.evidenceArtifact;
    let file;
    let bytes = null;
    let parsed = null;
    if (!relative) errors.push("packagePathMissing");
    else {
        try {
            file = safeResolve(root, relative);
            bytes = fs.readFileSync(file);
            parsed = JSON.parse(bytes.toString("utf8"));
        } catch (error) {
            errors.push(`packageReadFailed:${error.message}`);
        }
    }
    const observed = bytes ? {
        bytes: bytes.length,
        sha256: sha256(bytes),
        gitBlobSha: gitBlobSha(bytes),
        packageVersion: parsed?.version ?? null,
        description: parsed?.description ?? null
    } : null;
    if (binding?.status !== "strictlyBound") errors.push("packageBindingNotStrict");
    if (binding?.gameVersion !== expected.gameVersion) errors.push("packageGameVersionMismatch");
    if (binding?.evidenceBytes !== expected.manifestBytes) errors.push("packageStoredBytesMismatch");
    if (binding?.evidenceDigest !== expected.manifestDigest) errors.push("packageStoredShaMismatch");
    if (binding?.evidenceBlobSha !== expected.manifestBlobSha) errors.push("packageStoredBlobMismatch");
    if (observed) {
        if (observed.bytes !== expected.manifestBytes) errors.push("packageActualBytesMismatch");
        if (observed.sha256 !== expected.manifestDigest) errors.push("packageActualShaMismatch");
        if (observed.gitBlobSha !== expected.manifestBlobSha) errors.push("packageActualBlobMismatch");
        if (observed.packageVersion !== expected.packageVersion) errors.push("packageVersionMismatch");
        if (!String(observed.description || "").startsWith(`Genshin Impact v${expected.gameVersion} JSON data.`)) errors.push("packageDescriptionMismatch");
    }
    return {
        status: errors.length === 0 ? "verified" : "invalid",
        errors,
        binding: binding || null,
        expected,
        path: relative || null,
        observed
    };
}

function validateArtifactPin(root, artifact, record, side, snapshotPath) {
    const expected = REVISION_BINDINGS[side];
    const errors = [];
    let bytes = null;
    let parsed = null;
    let file = null;
    if (!artifact || typeof artifact !== "object") errors.push("artifactMissing");
    else {
        try {
            file = safeResolve(root, artifact.path);
            bytes = fs.readFileSync(file);
            parsed = JSON.parse(bytes.toString("utf8"));
        } catch (error) {
            errors.push(`artifactReadFailed:${error.message}`);
        }
    }
    const observed = bytes ? {
        bytes: bytes.length,
        sha256: sha256(bytes),
        gitBlobSha: gitBlobSha(bytes),
        parsedEntityId: parsed && parsed.id !== undefined ? String(parsed.id) : null,
        normalizedRecordDigest: parsed ? digestStable(normalizeRecord(parsed)) : null
    } : null;
    if (artifact?.gameVersion !== expected.gameVersion) errors.push("artifactGameVersionMismatch");
    if (artifact?.revision !== expected.revision) errors.push("artifactRevisionMismatch");
    if (artifact?.slug !== record?.selectedSlug) errors.push("artifactSlugMismatch");
    if (artifact?.treeBlobBytes !== artifact?.rawArtifactBytes) errors.push("storedByteFieldsDisagree");
    if (artifact?.rawArtifactBytes !== expectedBytes(observed)) errors.push("storedActualBytesMismatch");
    if (observed) {
        if (observed.bytes !== artifact.rawArtifactBytes) errors.push("actualBytesMismatch");
        if (observed.sha256 !== artifact.rawArtifactDigest) errors.push("actualShaMismatch");
        if (observed.gitBlobSha !== artifact.blobSha) errors.push("actualBlobMismatch");
        if (observed.normalizedRecordDigest !== artifact.normalizedRecordDigest) errors.push("actualNormalizedDigestMismatch");
        if (observed.parsedEntityId !== String(record?.entityId)) errors.push("parsedEntityIdentityMismatch");
    }
    const checked = Array.isArray(record?.checkedCandidates) ? record.checkedCandidates.find((candidate) => candidate.slug === artifact?.slug) : null;
    if (!checked) errors.push("checkedCandidateMissing");
    else {
        if (checked.blobSha !== artifact.blobSha) errors.push("checkedBlobMismatch");
        if (checked.treeBlobBytes !== artifact.treeBlobBytes) errors.push("checkedBytesMismatch");
    }
    return {
        status: errors.length === 0 ? "verified" : "invalid",
        errors,
        snapshotPath,
        path: artifact?.path || null,
        slug: artifact?.slug || null,
        gameVersion: artifact?.gameVersion || null,
        revision: artifact?.revision || null,
        stored: artifact || null,
        observed,
        parsed: parsed || null
    };
}

function expectedBytes(observed) {
    return observed ? observed.bytes : null;
}

function snapshotEvidence(root, fileName) {
    const file = safeResolve(root, path.join("games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0", fileName));
    const bytes = fs.readFileSync(file);
    const snapshot = JSON.parse(bytes.toString("utf8"));
    const errors = [];
    if (snapshot.schemaVersion !== 1) errors.push("schemaVersionInvalid");
    if (snapshot.kind !== "genshinVersionTransitionWeaponEntitySnapshot") errors.push("kindInvalid");
    if (snapshot.claim?.transitionId !== "6.7-to-7.0") errors.push("transitionIdInvalid");
    if (snapshot.claim?.provider !== EXPECTED_PROVIDER) errors.push("providerInvalid");
    if (snapshot.claim?.sourceFamily !== EXPECTED_SOURCE_FAMILY) errors.push("sourceFamilyInvalid");
    if (snapshot.fieldDigestAlgorithm !== "sha256-stable-json-v1") errors.push("fieldDigestAlgorithmInvalid");
    if (snapshot.fieldDigest !== digestStable(snapshot.claim)) errors.push("snapshotFieldDigestInvalid");
    const packageEvidence = {};
    for (const side of ["before", "after"]) {
        const claim = snapshot.claim?.[side];
        const expected = REVISION_BINDINGS[side];
        if (claim?.gameVersion !== expected.gameVersion || claim?.revision !== expected.revision) errors.push(`${side}RevisionBindingInvalid`);
        packageEvidence[side] = validatePackageBinding(root, claim?.versionBinding, expected);
        if (packageEvidence[side].status !== "verified") errors.push(`${side}PackageInvalid`);
    }
    return {
        file: relativePath(file),
        sha256: sha256(bytes),
        fieldDigest: snapshot.fieldDigest || null,
        fieldDigestVerified: !errors.includes("snapshotFieldDigestInvalid"),
        transitionId: snapshot.claim?.transitionId || null,
        provider: snapshot.claim?.provider || null,
        sourceFamily: snapshot.claim?.sourceFamily || null,
        queueShard: snapshot.claim?.queueShard || null,
        recordCount: Array.isArray(snapshot.claim?.records) ? snapshot.claim.records.length : 0,
        packageEvidence,
        errors,
        snapshot
    };
}

function collectSnapshotIndex(root) {
    const snapshots = SNAPSHOT_FILES.map((fileName) => snapshotEvidence(root, fileName));
    const byEntity = new Map();
    for (const evidence of snapshots) {
        for (const record of evidence.snapshot.claim?.records || []) {
            const entityId = String(record.entityId);
            if (!byEntity.has(entityId)) byEntity.set(entityId, []);
            byEntity.get(entityId).push({ evidence, record });
        }
    }
    return { snapshots, byEntity };
}

function sourceVariant(root, entry) {
    const before = validateArtifactPin(root, entry.record.before?.artifact, entry.record.before, "before", entry.evidence.file);
    const after = validateArtifactPin(root, entry.record.after?.artifact, entry.record.after, "after", entry.evidence.file);
    const beforeValues = before.parsed ? extractRawColumns(before.parsed) : { status: "missing", columns: [] };
    const afterValues = after.parsed ? extractRawColumns(after.parsed) : { status: "missing", columns: [] };
    return {
        snapshotPath: entry.evidence.file,
        entityId: String(entry.record.entityId),
        nameJa: entry.record.nameJa || null,
        sourceFamily: entry.evidence.sourceFamily,
        provider: entry.evidence.provider,
        before: { pin: before, columns: beforeValues },
        after: { pin: after, columns: afterValues },
        comparison: entry.record.comparison || null
    };
}

function sourceForEntity(root, index, entityId) {
    const entries = index.byEntity.get(String(entityId)) || [];
    if (entries.length === 0) {
        return { status: "missing", entityId: String(entityId), variants: [], selected: null, sourceVariantStatus: "missing" };
    }
    const variants = entries.map((entry) => sourceVariant(root, entry));
    const rawPairDigests = new Set(variants.map((variant) => digestStable({
        before: variant.before.pin.observed?.sha256 || null,
        after: variant.after.pin.observed?.sha256 || null,
        beforeColumns: variant.before.columns,
        afterColumns: variant.after.columns
    })));
    const sourceVariantStatus = rawPairDigests.size > 1 ? "conflict" : "consistent";
    const selected = [...variants].sort((left, right) => {
        const leftMain = left.snapshotPath.endsWith("/weapon-entity-snapshot.json") ? 0 : 1;
        const rightMain = right.snapshotPath.endsWith("/weapon-entity-snapshot.json") ? 0 : 1;
        return leftMain - rightMain || left.snapshotPath.localeCompare(right.snapshotPath);
    })[0];
    const pinInvalid = variants.some((variant) => variant.before.pin.status !== "verified" || variant.after.pin.status !== "verified");
    return {
        status: pinInvalid ? "sourceIntegrityInvalid" : sourceVariantStatus === "conflict" ? "sourceVariantConflict" : "verified",
        entityId: String(entityId),
        variants,
        selected,
        sourceVariantStatus
    };
}

function sourceClaimSide(selected, side, field) {
    const sideEvidence = selected?.[side] || null;
    const pin = sideEvidence?.pin || null;
    const columns = sideEvidence?.columns || null;
    const stored = pin?.stored || null;
    const observed = pin?.observed || null;
    const numericField = field === "value" || field === "refinement";
    const pointerCandidates = numericField && Array.isArray(columns?.columns)
        ? columns.columns.flatMap((column) => (column.valuesByRank || []).map((item) => item.pointer))
        : [];
    const fieldStatus = !sideEvidence
        ? "sourceRecordMissing"
        : pin.status !== "verified"
            ? "sourceIntegrityInvalid"
            : numericField && columns.status === "ok"
                ? "rawColumnCandidatesMaterialized"
                : numericField
                    ? `rawColumn${columns.status || "missing"}`
                    : "rawRecordOnlyNoStructuredClaimField";
    return {
        status: fieldStatus,
        provider: selected?.provider || null,
        sourceFamily: selected?.sourceFamily || null,
        gameVersion: pin?.gameVersion || stored?.gameVersion || null,
        revision: pin?.revision || stored?.revision || null,
        artifact: pin ? {
            path: pin.path || stored?.path || null,
            bytes: observed?.bytes ?? stored?.rawArtifactBytes ?? null,
            rawArtifactDigest: observed?.sha256 || stored?.rawArtifactDigest || null,
            blobSha: observed?.gitBlobSha || stored?.blobSha || null,
            normalizedRecordDigest: observed?.normalizedRecordDigest || stored?.normalizedRecordDigest || null
        } : null,
        fieldDigest: numericField && columns?.status === "ok" ? digestStable(columns) : null,
        fieldPointers: pointerCandidates,
        semanticMapping: null
    };
}

function claimComparisonStatus({ field, claimValue, local, comparison }) {
    if (field !== "value" && field !== "refinement") return "notMaterialized";
    if (field === "value" && (!claimValue || typeof claimValue !== "object" || Array.isArray(claimValue))) {
        return "localProjectionMismatch";
    }
    if (local.status === "missing") return "localValueMissing";
    if (local.status === "localvalueunsupported") return "localFormatUnsupported";
    if (comparison.status === "numericAgreementOnlyNotSemanticIdentity") return "observedNumericOnly";
    if (comparison.status === "ambiguous") return "ambiguousColumn";
    if (comparison.status === "unitMismatch") return "unitMismatch";
    if (comparison.status === "rawvalueunsupported") return "rawFormatUnsupported";
    if (comparison.status === "missing") return "rawColumnMissing";
    return comparison.status || "mismatch";
}

function claimFrontierProjection(frontier) {
    const finiteLedgerIds = Array.isArray(frontier.finiteLedger)
        ? frontier.finiteLedger.map((ledger) => ledger.id).filter(Boolean)
        : frontier.finiteLedger?.id ? [frontier.finiteLedger.id] : [];
    const candidateScopedLedgerId = Array.isArray(frontier.finiteLedger)
        ? null : frontier.finiteLedger?.candidateScoped ? frontier.finiteLedger.id : null;
    return {
        status: frontier.status,
        exhausted: frontier.exhausted,
        scopeMatched: frontier.scopeMatched,
        scopeUnit: frontier.scopeUnit,
        policyId: frontier.policyId,
        disposition: frontier.disposition,
        g06HoldEligible: frontier.g06HoldEligible,
        candidateScopedLedgerId,
        finiteLedgerIds
    };
}

function buildClaimEvidence({ candidateId, spec, claim, local, source, beforeComparison, afterComparison, frontier }) {
    const field = String(claim?.field || "");
    const fieldPath = claimFieldPath(field);
    const value = claimValueForField(spec, field);
    const claimKind = verificationStateMachine.inferClaimKind(field, claim || {});
    const numericField = field === "value" || field === "refinement";
    const comparisonStatus = claimKind !== "externalFactual"
        ? "internalClaimNotCompared"
        : source.status !== "verified"
            ? source.status
            : numericField
                ? claimComparisonStatus({ field, claimValue: value, local, comparison: afterComparison })
                : "notMaterialized";
    const blockedReasons = [];
    if (claimKind !== "externalFactual") blockedReasons.push("internalClaimRequiresRouteEvidence");
    if (source.status !== "verified") blockedReasons.push("sourceIntegrityInvalid");
    if (claimKind === "externalFactual" && !numericField) blockedReasons.push("providerStructuredClaimFieldMissing");
    if (numericField && comparisonStatus !== "observedNumericOnly") blockedReasons.push(comparisonStatus);
    blockedReasons.push("independentProviderFieldEvidenceMissing");
    return {
        claimId: `${candidateId}:${field}`,
        field,
        claimKind,
        claimStatus: claim?.status || null,
        local: {
            path: fieldPath,
            value,
            valueDigest: claimValueDigest(value, fieldPath)
        },
        source: {
            provider: source.selected?.provider || EXPECTED_PROVIDER,
            sourceFamily: source.selected?.sourceFamily || EXPECTED_SOURCE_FAMILY,
            independentProviderPairObserved: false,
            before: sourceClaimSide(source.selected, "before", field),
            after: sourceClaimSide(source.selected, "after", field)
        },
        comparison: {
            status: comparisonStatus,
            rawVectorStatus: numericField ? afterComparison.status : "notCompared",
            numericMatchingColumnIndexes: numericField ? [...afterComparison.numericMatchingColumnIndexes] : [],
            semanticIdentityEstablished: false,
            semanticMapping: null,
            supportsClaimValue: false,
            before: numericField ? { status: beforeComparison.status } : null,
            after: numericField ? { status: afterComparison.status } : null
        },
        frontier: claimFrontierProjection(frontier),
        blockedReasons: [...new Set(blockedReasons)].sort()
    };
}

function candidateEntityId(candidate, spec) {
    const specEntityId = spec?.entity?.id === undefined || spec?.entity?.id === null ? null : String(spec.entity.id);
    const prefix = String(candidate.candidateId || "").match(/^w_(\d+)_/);
    const prefixEntityId = prefix ? prefix[1] : null;
    return {
        entityId: specEntityId,
        prefixEntityId,
        identityStatus: specEntityId && prefixEntityId === specEntityId ? "verified" : "invalid"
    };
}

function projectQueueTask(task, spec) {
    const searchFrontier = task?.searchFrontier || {};
    return {
        candidateId: String(task?.candidateId || ""),
        layer: task?.layer || null,
        status: task?.terminalState || null,
        searchFrontier: {
            status: searchFrontier.status ?? null,
            exhausted: searchFrontier.exhausted ?? null,
            scopeMatched: searchFrontier.scopeMatched ?? null,
            scopeUnit: searchFrontier.scopeUnit ?? null,
            providersExamined: Array.isArray(searchFrontier.providersExamined) ? [...searchFrontier.providersExamined] : [],
            blockingReasons: Array.isArray(searchFrontier.blockingReasons) ? [...searchFrontier.blockingReasons] : []
        },
        localSpecRelevantRefs: {
            specPath: `${relativePath(specsPath)}#/${pointerToken(task?.candidateId || "")}`,
            entityId: spec?.entity?.id === undefined ? null : String(spec.entity.id),
            sourceRefs: Array.isArray(spec?.sourceRefs) ? [...spec.sourceRefs] : [],
            effectValueByRefinementPath: "/effect/valueByRefinement",
            declaredUnit: spec?.effect?.unit ?? null
        }
    };
}

function fileEvidence(root, file) {
    const bytes = fs.readFileSync(file);
    return {
        path: relativePath(file),
        bytes: bytes.length,
        sha256: sha256(bytes)
    };
}

function loadSourceSearchContext(root) {
    const coverageFile = path.join(root, "reports", "genshin-candidate-source-coverage-frontier-inventory.json");
    const searchFile = path.join(root, "games", "genshin", "data", "v2", "source-search-frontiers.json");
    const coverage = readJson(coverageFile);
    const search = readJson(searchFile);
    const batches = Array.isArray(coverage.batches) ? coverage.batches : [];
    const byCandidate = new Map();
    for (const batch of batches) {
        for (const candidateId of batch.candidateIds || []) {
            byCandidate.set(String(candidateId), batch);
        }
    }
    const ledgers = (Array.isArray(search.frontiers) ? search.frontiers : [])
        .filter((frontier) => frontier?.appliesTo?.dataset === "weapons")
        .map((frontier) => ({
            id: frontier.id || null,
            status: frontier.status || null,
            dataset: frontier.appliesTo?.dataset || null,
            layer: frontier.appliesTo?.layer || null,
            candidateCount: frontier.appliesTo?.candidateCount || 0,
            candidateIdDigest: frontier.appliesTo?.candidateIdDigest || null,
            candidateIds: Array.isArray(frontier.appliesTo?.candidateIds) ? [...frontier.appliesTo.candidateIds].sort() : [],
            searchScope: frontier.searchScope || null,
            lastSearchedAt: frontier.lastSearchedAt || null,
            providersExamined: Array.isArray(frontier.providersExamined) ? [...frontier.providersExamined] : [],
            reopenTrigger: frontier.reopenTrigger || null,
            evidenceRefs: Array.isArray(frontier.evidenceRefs) ? [...frontier.evidenceRefs] : []
        }));
    return {
        coverage: {
            evidence: fileEvidence(root, coverageFile),
            fieldDigest: coverage.fieldDigest || digestStable(coverage),
            byCandidate
        },
        search: {
            evidence: fileEvidence(root, searchFile),
            fieldDigest: search.fieldDigest || digestStable(search),
            ledgers
        }
    };
}

function claimFrontier({ task, candidateId, sourceContext }) {
    const queueFrontier = task?.searchFrontier || {};
    const batch = sourceContext.coverage.byCandidate.get(String(candidateId)) || null;
    const candidateLedger = sourceContext.search.ledgers.find((ledger) => ledger.candidateIds.includes(String(candidateId))) || null;
    return {
        status: queueFrontier.status ?? null,
        exhausted: queueFrontier.exhausted ?? null,
        scopeMatched: queueFrontier.scopeMatched ?? null,
        scopeUnit: queueFrontier.scopeUnit ?? null,
        providersExamined: Array.isArray(queueFrontier.providersExamined) ? [...queueFrontier.providersExamined] : [],
        policyId: queueFrontier.policyId ?? null,
        disposition: queueFrontier.status === "searchExhausted" && queueFrontier.scopeMatched === true
            ? "candidateScopedEvidenceDeferred"
            : "searchRequired",
        g06HoldEligible: queueFrontier.status === "searchExhausted" && queueFrontier.scopeMatched === true,
        g06HoldReason: candidateLedger
            ? "An existing finite ledger covers this exact candidate."
            : "No candidate-scoped searchExhausted ledger covers this candidate; do not close as G06 hold.",
        sourceCoverageBatch: batch ? {
            batchId: batch.batchId || null,
            shardId: batch.shardId || null,
            candidateCount: batch.candidateCount || 0,
            candidateIdDigest: batch.candidateIdDigest || null,
            transitionEntityRecordStatus: batch.transitionEntityRecordStatuses || {},
            sourceLookupStatuses: batch.sourceLookupStatuses || {},
            fieldMaterializationCanExecuteNow: batch.fieldMaterializationCanExecuteNow ?? null,
            sourceLookupCanExecuteNow: batch.sourceLookupCanExecuteNow ?? null,
            sourceLookupReopenOnTriggerOnly: batch.sourceLookupReopenOnTriggerOnly ?? null,
            searchExhausted: batch.searchExhausted ?? null,
            evidenceStatus: batch.status || null
        } : null,
        finiteLedger: candidateLedger ? {
            id: candidateLedger.id,
            status: candidateLedger.status,
            candidateScoped: true,
            candidateCount: candidateLedger.candidateCount,
            candidateIdDigest: candidateLedger.candidateIdDigest,
            lastSearchedAt: candidateLedger.lastSearchedAt,
            providersExamined: candidateLedger.providersExamined,
            reopenTrigger: candidateLedger.reopenTrigger,
            evidenceRefs: candidateLedger.evidenceRefs
        } : sourceContext.search.ledgers.map((ledger) => ({
            id: ledger.id,
            status: ledger.status,
            candidateScoped: false,
            candidateCount: ledger.candidateCount,
            candidateIdDigest: ledger.candidateIdDigest,
            lastSearchedAt: ledger.lastSearchedAt,
            providersExamined: ledger.providersExamined,
            reopenTrigger: ledger.reopenTrigger,
            evidenceRefs: ledger.evidenceRefs
        }))
    };
}

function selectQueueTasks(queue) {
    if (!queue || !Array.isArray(queue.tasks)) throw new Error("queue.tasks missing");
    return queue.tasks
        .filter((task) => task && task.layer === "weaponEffectSpec"
            && task.primaryBlockReason === "sourceMissing"
            && task.searchFrontier?.status === "searchRequired")
        .sort((left, right) => String(left.candidateId).localeCompare(String(right.candidateId)));
}

function loadPersistedBoundedScopeTasks(root, queue) {
    // The primary comparison artifact is a fixed 381-candidate observation
    // lane.  After downstream queue work closes the numeric-match candidates,
    // the live queue no longer has the original searchRequired projection.
    // Reuse the persisted lane projection rather than silently shrinking the
    // artifact or reclassifying completed candidates.  This keeps a rerun
    // limited to the normalizer change while retaining the original scope.
    const artifactPath = path.join(root, "games", "genshin", "data", "v2", "weapons", "primary-field-comparison.json");
    let persisted;
    try {
        persisted = readJson(artifactPath);
    } catch (_) {
        return null;
    }
    const projections = persisted?.scope?.queueProjection;
    if (!Array.isArray(projections) || projections.length !== EXPECTED_CANDIDATE_COUNT) return null;
    const queueById = new Map((queue.tasks || []).map((task) => [String(task.candidateId), task]));
    const tasks = projections.map((projection) => {
        const candidateId = String(projection?.candidateId || "");
        const current = queueById.get(candidateId);
        if (!candidateId || !current) return null;
        return {
            ...current,
            candidateId,
            layer: projection.layer,
            terminalState: projection.status,
            primaryBlockReason: "sourceMissing",
            searchFrontier: projection.searchFrontier
        };
    });
    return tasks.every(Boolean) ? tasks : null;
}

function loadInputs({ queue: suppliedQueue, specs: suppliedSpecs, root = repositoryRoot } = {}) {
    const effectiveQueuePath = path.join(root, "reports", "genshin-evidence-task-queue.json");
    const effectiveSpecsPath = path.join(root, "games", "genshin", "data", "v2", "weapons", "spec-candidates.json");
    const queue = suppliedQueue || readJson(effectiveQueuePath);
    const specs = suppliedSpecs || readJson(effectiveSpecsPath);
    let selected = selectQueueTasks(queue);
    if (suppliedQueue === undefined && selected.length !== EXPECTED_CANDIDATE_COUNT) {
        selected = loadPersistedBoundedScopeTasks(root, queue) || selected;
    }
    const queueProjection = selected.map((task) => projectQueueTask(task, specs[task.candidateId]));
    const sourceContext = loadSourceSearchContext(root);
    return { queue, specs, selected, queueProjection, sourceContext, effectiveQueuePath, effectiveSpecsPath };
}

function buildCandidate({ root, task, spec, source, sourceContext }) {
    const identity = candidateEntityId(task, spec);
    const local = extractLocalVector(spec);
    const selected = source.selected;
    const beforeComparison = selected ? compareRefinementVectors(local, selected.before.columns) : { status: "missing", numericAgreementOnlyNotSemanticIdentity: false, semanticIdentityEstablished: false, numericMatchingColumnIndexes: [], columnComparisons: [] };
    const afterComparison = selected ? compareRefinementVectors(local, selected.after.columns) : { status: "missing", numericAgreementOnlyNotSemanticIdentity: false, semanticIdentityEstablished: false, numericMatchingColumnIndexes: [], columnComparisons: [] };
    const frontier = claimFrontier({ task, candidateId: task.candidateId, sourceContext });
    const claimEntries = Object.entries(spec?.verification?.claims || {}).sort(([left], [right]) => left.localeCompare(right));
    const claims = Object.fromEntries(claimEntries.map(([field, claim]) => [field, buildClaimEvidence({
        candidateId: String(task.candidateId),
        spec,
        claim: { ...claim, field },
        local,
        source,
        beforeComparison,
        afterComparison,
        frontier
    })]));
    let status = afterComparison.status;
    if (identity.identityStatus !== "verified") status = "entityIdentityInvalid";
    else if (source.status !== "verified") status = source.status;
    const selectedEvidence = selected ? {
        snapshotPath: selected.snapshotPath,
        entityId: selected.entityId,
        sourceFamily: selected.sourceFamily,
        provider: selected.provider,
        before: {
            gameVersion: REVISION_BINDINGS.before.gameVersion,
            revision: REVISION_BINDINGS.before.revision,
            packageVersion: REVISION_BINDINGS.before.packageVersion,
            artifactPath: selected.before.pin.path,
            rawPointerBase: `${selected.before.pin.path}#`,
            artifactPin: selected.before.pin.stored,
            observedPin: selected.before.pin.observed,
            values: selected.before.columns
        },
        after: {
            gameVersion: REVISION_BINDINGS.after.gameVersion,
            revision: REVISION_BINDINGS.after.revision,
            packageVersion: REVISION_BINDINGS.after.packageVersion,
            artifactPath: selected.after.pin.path,
            rawPointerBase: `${selected.after.pin.path}#`,
            artifactPin: selected.after.pin.stored,
            observedPin: selected.after.pin.observed,
            values: selected.after.columns
        },
        variants: source.variants.map((variant) => ({
            snapshotPath: variant.snapshotPath,
            beforeArtifactPath: variant.before.pin.path,
            afterArtifactPath: variant.after.pin.path,
            beforeSha256: variant.before.pin.observed?.sha256 || null,
            afterSha256: variant.after.pin.observed?.sha256 || null,
            beforeBlobSha: variant.before.pin.observed?.gitBlobSha || null,
            afterBlobSha: variant.after.pin.observed?.gitBlobSha || null,
            pinStatus: variant.before.pin.status === "verified" && variant.after.pin.status === "verified" ? "verified" : "invalid"
        }))
    } : null;
    return {
        candidateId: String(task.candidateId),
        layer: task.layer,
        entity: {
            id: identity.entityId,
            prefixId: identity.prefixEntityId,
            identityStatus: identity.identityStatus
        },
        queue: projectQueueTask(task, spec),
        frontier,
        claims,
        local: {
            path: local.path,
            declaredUnit: local.declaredUnit,
            rawByRefinement: local.rawByRefinement,
            normalizedByRefinement: local.normalizedByRefinement,
            status: local.status,
            fieldDigest: local.fieldDigest
        },
        source: {
            status: source.status,
            sourceVariantStatus: source.sourceVariantStatus,
            sourceFamily: EXPECTED_SOURCE_FAMILY,
            provider: EXPECTED_PROVIDER,
            independentProviderPairObserved: false,
            selected: selectedEvidence,
            variantCount: source.variants.length,
            sourceIntegrity: source.variants.map((variant) => ({
                snapshotPath: variant.snapshotPath,
                before: { status: variant.before.pin.status, errors: variant.before.pin.errors },
                after: { status: variant.after.pin.status, errors: variant.after.pin.errors }
            }))
        },
        comparison: {
            mode: NORMALIZATION_MODE,
            status,
            numericAgreementOnlyNotSemanticIdentity: true,
            semanticIdentityEstablished: false,
            semanticMapping: null,
            before: beforeComparison,
            after: afterComparison,
            rawVersionValuesEqual: selected ? digestStable(selected.before.columns) === digestStable(selected.after.columns) : false
        },
        gate: {
            certificateEligible: false,
            canonicalPromotionEligible: false,
            reviewEligible: false,
            reason: "A first-provider numeric vector comparison does not prove field, target, condition, or scope identity."
        }
    };
}

function countBy(records, getter) {
    return Object.values(records).reduce((counts, record) => {
        const key = getter(record);
        counts[key] = (counts[key] || 0) + 1;
        return counts;
    }, {});
}

function buildAudit({ queue: suppliedQueue, specs: suppliedSpecs, root = repositoryRoot } = {}) {
    const inputs = loadInputs({ queue: suppliedQueue, specs: suppliedSpecs, root });
    if (suppliedQueue === undefined && inputs.selected.length !== EXPECTED_CANDIDATE_COUNT) {
        throw new Error(`bounded queue selector expected ${EXPECTED_CANDIDATE_COUNT}, got ${inputs.selected.length}`);
    }
    const index = collectSnapshotIndex(root);
    const sourceCache = new Map();
    const records = {};
    for (const task of inputs.selected) {
        const spec = inputs.specs[task.candidateId] || null;
        const identity = candidateEntityId(task, spec);
        if (!sourceCache.has(identity.entityId || "")) sourceCache.set(identity.entityId || "", sourceForEntity(root, index, identity.entityId));
        const source = sourceCache.get(identity.entityId || "") || { status: "missing", variants: [], selected: null, sourceVariantStatus: "missing" };
        records[task.candidateId] = buildCandidate({ root, task, spec, source, sourceContext: inputs.sourceContext });
    }
    const candidateIds = Object.keys(records).sort();
    const localFieldProjection = candidateIds.map((candidateId) => ({
        candidateId,
        path: records[candidateId].local.path,
        declaredUnit: records[candidateId].local.declaredUnit,
        valueByRefinement: records[candidateId].local.rawByRefinement
    }));
    const sourceFamilySet = new Set(Object.values(records).map((record) => record.source.sourceFamily).filter(Boolean));
    const statusCounts = countBy(records, (record) => record.comparison.status);
    const sourceCounts = countBy(records, (record) => record.source.status);
    const localCounts = countBy(records, (record) => record.local.status);
    const rawVersionAgreementCount = Object.values(records).filter((record) => record.comparison.rawVersionValuesEqual).length;
    const numericMatchCount = Object.values(records).filter((record) => record.comparison.after.numericMatchingColumnIndexes.length > 0).length;
    const claimRecords = Object.values(records).flatMap((record) => Object.values(record.claims || {}));
    const claimStatusCounts = countBy(claimRecords, (claim) => claim.comparison.status);
    const claimKindCounts = countBy(claimRecords, (claim) => claim.claimKind);
    const candidateScopedHoldCount = Object.values(records).filter((record) => record.frontier?.g06HoldEligible === true).length;
    const candidateScopedSearchRequiredCount = Object.values(records).filter((record) => record.frontier?.disposition === "searchRequired").length;
    const observedNumericClaimCount = claimRecords.filter((claim) => claim.comparison.status === "observedNumericOnly").length;
    const snapshotSummaries = index.snapshots.map((snapshot) => ({
        file: snapshot.file,
        sha256: snapshot.sha256,
        fieldDigest: snapshot.fieldDigest,
        fieldDigestVerified: snapshot.fieldDigestVerified,
        transitionId: snapshot.transitionId,
        provider: snapshot.provider,
        sourceFamily: snapshot.sourceFamily,
        queueShard: snapshot.queueShard,
        recordCount: snapshot.recordCount,
        packageEvidence: snapshot.packageEvidence,
        errors: snapshot.errors
    }));
    const audit = {
        schemaVersion: 1,
        kind: "genshinWeaponPrimaryFieldComparison",
        generatedAt,
        status: "passed",
        lane: LANE,
        transition: {
            transitionId: "6.7-to-7.0",
            before: REVISION_BINDINGS.before,
            after: REVISION_BINDINGS.after,
            provider: EXPECTED_PROVIDER,
            sourceFamily: EXPECTED_SOURCE_FAMILY,
            sourceFamilyCount: sourceFamilySet.size,
            independentProviderPairObserved: false
        },
        policy: {
            normalization: NORMALIZATION_MODE,
            queueSelector: "layer=weaponEffectSpec AND primaryBlockReason=sourceMissing AND searchFrontier.status=searchRequired",
            queueInputProjection: "candidateId/layer/status/searchFrontier/localSpecRelevantRefs-v1",
            numericAgreementOnlyNotSemanticIdentity: true,
            semanticInference: "forbidden",
            selectedSemanticMapping: "forbidden",
            independentSourceClaim: "not established",
            candidateClaimEvidence: "materialize local claim scope and raw provider field observations; no semantic inference",
            g06Hold: "forbidden until the candidate-scoped finite frontier is searchExhausted",
            networkFetch: "forbidden",
            eligibilityCertificate: "forbidden",
            canonicalPromotion: "forbidden"
        },
        scope: {
            candidateCount: candidateIds.length,
            expectedCandidateCount: EXPECTED_CANDIDATE_COUNT,
            candidateIdDigest: digestStable(candidateIds),
            selectedQueueProjectionDigest: digestStable(inputs.queueProjection),
            queueProjection: inputs.queueProjection,
            sourceSnapshotFiles: SNAPSHOT_FILES.map((file) => relativePath(path.join(transitionRoot, file)))
        },
        inputEvidence: {
            queuePath: relativePath(inputs.effectiveQueuePath),
            specsPath: relativePath(inputs.effectiveSpecsPath),
            specsSha256: sha256(fs.readFileSync(inputs.effectiveSpecsPath)),
            localCandidateFieldDigest: digestStable(localFieldProjection),
            snapshotFiles: snapshotSummaries,
            sourceCoverageFrontier: {
                ...inputs.sourceContext.coverage.evidence,
                fieldDigest: inputs.sourceContext.coverage.fieldDigest
            },
            sourceSearchLedgers: {
                ...inputs.sourceContext.search.evidence,
                fieldDigest: inputs.sourceContext.search.fieldDigest,
                ledgers: inputs.sourceContext.search.ledgers
            }
        },
        records,
        summary: {
            candidates: candidateIds.length,
            uniqueEntities: new Set(Object.values(records).map((record) => record.entity.id).filter(Boolean)).size,
            statusByComparison: statusCounts,
            statusBySource: sourceCounts,
            statusByLocalValue: localCounts,
            claimCount: claimRecords.length,
            claimStatusCounts,
            claimKindCounts,
            observedNumericClaimCount,
            candidateScopedG06HoldCount: candidateScopedHoldCount,
            candidateScopedSearchRequiredCount,
            rawVersionValuesEqual: rawVersionAgreementCount,
            numericMatchObserved: numericMatchCount,
            numericAgreementOnlyNotSemanticIdentity: numericMatchCount,
            sourceFamilyCount: sourceFamilySet.size,
            independentProviderPairObserved: 0,
            semanticMappingsSelected: 0,
            reviewEligible: 0,
            certificateEligible: 0,
            canonicalPromotion: 0,
            allCandidatesBounded: candidateIds.length === (suppliedQueue === undefined ? EXPECTED_CANDIDATE_COUNT : candidateIds.length),
            errors: []
        },
        gate: {
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false,
            canSelectSemanticMapping: false,
            status: "failClosed",
            reason: "One correlated GenshinData-derived provider can establish only explicit raw-vector observations; numeric equality cannot establish field/target/condition/scope identity."
        },
        fieldDigestAlgorithm: "sha256-stable-json-v1"
    };
    audit.fieldDigest = digestStable(audit);
    return audit;
}

function validateAudit(audit, { compareCurrent = true, root = repositoryRoot } = {}) {
    const reasons = [];
    if (!audit || typeof audit !== "object") reasons.push("artifactMissing");
    if (audit?.schemaVersion !== 1) reasons.push("schemaVersionInvalid");
    if (audit?.kind !== "genshinWeaponPrimaryFieldComparison") reasons.push("kindInvalid");
    if (audit?.lane !== LANE) reasons.push("laneInvalid");
    if (audit?.fieldDigestAlgorithm !== "sha256-stable-json-v1") reasons.push("fieldDigestAlgorithmInvalid");
    if (audit?.fieldDigest !== digestStable(withoutDigest(audit))) reasons.push("fieldDigestInvalid");
    if (audit?.policy?.numericAgreementOnlyNotSemanticIdentity !== true) reasons.push("numericOnlyPolicyInvalid");
    if (audit?.policy?.semanticInference !== "forbidden") reasons.push("semanticInferencePolicyInvalid");
    if (audit?.policy?.selectedSemanticMapping !== "forbidden") reasons.push("semanticMappingPolicyInvalid");
    if (audit?.gate?.canIssueEligibilityCertificate !== false || audit?.gate?.canPromoteCanonical !== false || audit?.gate?.canSelectSemanticMapping !== false) reasons.push("gateNotFailClosed");
    const records = audit?.records && typeof audit.records === "object" && !Array.isArray(audit.records) ? audit.records : {};
    const ids = Object.keys(records);
    if (audit?.scope?.candidateCount !== ids.length) reasons.push("candidateCountInvalid");
    if (ids.length === 0) reasons.push("candidateInventoryMissing");
    for (const [candidateId, record] of Object.entries(records)) {
        if (record?.candidateId !== candidateId) reasons.push(`candidateIdMismatch:${candidateId}`);
        if (!BOUNDED_STATUSES.has(record?.comparison?.status)) reasons.push(`unboundedStatus:${candidateId}`);
        if (record?.comparison?.semanticIdentityEstablished !== false) reasons.push(`semanticIdentityUnexpected:${candidateId}`);
        if (record?.comparison?.semanticMapping !== null) reasons.push(`semanticMappingUnexpected:${candidateId}`);
        if (record?.gate?.certificateEligible !== false || record?.gate?.canonicalPromotionEligible !== false) reasons.push(`candidateGateInvalid:${candidateId}`);
        if (record?.source?.independentProviderPairObserved !== false) reasons.push(`independentPairUnexpected:${candidateId}`);
        if (!record?.frontier || record.frontier.g06HoldEligible !== false || record.frontier.disposition !== "searchRequired") reasons.push(`frontierNotFailClosed:${candidateId}`);
        const claims = record?.claims && typeof record.claims === "object" && !Array.isArray(record.claims) ? record.claims : {};
        if (!CLAIM_FIELDS_REQUIRED_FOR_RUNTIME.every((field) => Object.prototype.hasOwnProperty.call(claims, field))) reasons.push(`requiredClaimMissing:${candidateId}`);
        for (const [field, claim] of Object.entries(claims)) {
            if (claim?.claimId !== `${candidateId}:${field}`) reasons.push(`claimIdMismatch:${candidateId}:${field}`);
            if (claim?.comparison?.semanticIdentityEstablished !== false || claim?.comparison?.semanticMapping !== null || claim?.comparison?.supportsClaimValue !== false) reasons.push(`claimGateNotFailClosed:${candidateId}:${field}`);
            if (claim?.source?.independentProviderPairObserved !== false) reasons.push(`claimIndependentPairUnexpected:${candidateId}:${field}`);
            if (claim?.frontier?.g06HoldEligible !== false || claim?.frontier?.disposition !== "searchRequired") reasons.push(`claimFrontierNotFailClosed:${candidateId}:${field}`);
        }
    }
    if (compareCurrent) {
        try {
            const expected = buildAudit({ root });
            if (stableJson(expected) !== stableJson(audit)) reasons.push("artifactNotDeterministicForCurrentInputs");
        } catch (error) {
            reasons.push(`currentInputsInvalid:${error.message}`);
        }
    }
    return { valid: reasons.length === 0, reasons };
}

function renderMarkdown(audit) {
    const summary = audit.summary || {};
    const rows = Object.entries(summary.statusByComparison || {}).sort(([left], [right]) => left.localeCompare(right));
    const sourceRows = Object.entries(summary.statusBySource || {}).sort(([left], [right]) => left.localeCompare(right));
    return [
        "# Genshin weapon primary-field comparison",
        "",
        `Status: **${audit.status}**`,
        "",
        `- lane: **${audit.lane}**`,
        `- bounded candidates: **${summary.candidates}**`,
        `- unique entities: **${summary.uniqueEntities}**`,
        `- numeric matches observed: **${summary.numericMatchObserved}** (numeric agreement only; no semantic identity)`,
        "- normalization: **strict scalar, stack-vector, and slash-separated vector**; `percentOfReference` remains a distinct unit",
        `- source family count: **${summary.sourceFamilyCount}**; independent provider pair: **${summary.independentProviderPairObserved}**`,
        `- candidate×claim records: **${summary.claimCount}**; raw numeric claim observations: **${summary.observedNumericClaimCount}**`,
        `- candidate-scoped G06 holds: **${summary.candidateScopedG06HoldCount}**; still search-required: **${summary.candidateScopedSearchRequiredCount}**`,
        `- eligibility certificate: **forbidden (${summary.certificateEligible})**; canonical promotion: **forbidden (${summary.canonicalPromotion})**`,
        "",
        "## Comparison statuses",
        "",
        "| status | candidates |",
        "| --- | ---: |",
        ...rows.map(([name, count]) => `| ${name} | ${count} |`),
        "",
        "## Source pin statuses",
        "",
        "| status | candidates |",
        "| --- | ---: |",
        ...sourceRows.map(([name, count]) => `| ${name} | ${count} |`),
        "",
        "## Candidate×claim frontier",
        "",
        "| claim comparison status | claims |",
        "| --- | ---: |",
        ...Object.entries(summary.claimStatusCounts || {}).sort(([left], [right]) => left.localeCompare(right)).map(([name, count]) => `| ${name} | ${count} |`),
        "",
        "All 381 selected queue tasks remain `searchRequired`; the existing finite weapon ledger covers a different 30-candidate scope and is recorded as non-matching context. No candidate is closed as a G06 hold.",
        "",
        "Raw values are pinned to the captured genshin-db 6.7/7.0 revision/package artifacts and rechecked for bytes, SHA-256, Git blob SHA, parsed entity id, and normalized digest. The queue projection is bounded to the requested 381 sourceMissing/searchRequired weaponEffectSpec candidates.",
        "",
        "A matching numeric refinement vector does not identify the raw field/column's semantic role. This artifact records observation only: no target, condition, field, review approval, eligibility certificate, or canonical promotion is selected.",
        ""
    ].join("\n");
}

function writeArtifacts({ audit = buildAudit(), outputPaths = paths } = {}) {
    fs.mkdirSync(path.dirname(outputPaths.artifact), { recursive: true });
    fs.mkdirSync(path.dirname(outputPaths.reportJson), { recursive: true });
    fs.writeFileSync(outputPaths.artifact, stableJson(audit), "utf8");
    fs.writeFileSync(outputPaths.reportJson, stableJson(audit), "utf8");
    fs.writeFileSync(outputPaths.reportMarkdown, renderMarkdown(audit), "utf8");
    return audit;
}

if (require.main === module) {
    const audit = writeArtifacts();
    process.stdout.write(stableJson({ status: audit.status, summary: audit.summary, fieldDigest: audit.fieldDigest }));
}

module.exports = {
    BOUNDED_STATUSES,
    EXPECTED_CANDIDATE_COUNT,
    LANE,
    NORMALIZATION_MODE,
    REVISION_BINDINGS,
    SNAPSHOT_FILES,
    generatedAt,
    paths,
    stableJson,
    digestStable,
    gitBlobSha,
    normalizeDecimal,
    normalizeUnit,
    normalizeScalar,
    normalizeVectorElements,
    normalizeSlashSeparatedVector,
    claimFieldPath,
    claimValueForField,
    claimValueDigest,
    extractLocalVector,
    extractRawColumns,
    compareVector,
    compareRefinementVectors,
    sourceClaimSide,
    claimFrontierProjection,
    buildClaimEvidence,
    projectQueueTask,
    selectQueueTasks,
    loadInputs,
    buildAudit,
    renderMarkdown,
    validateAudit,
    writeArtifacts
};
