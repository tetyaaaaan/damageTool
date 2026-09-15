"use strict";

/**
 * Generate field-level evidence for the nine pinned gcsim weapon files.
 *
 * This is intentionally a small, semantic extractor rather than a numeric
 * token matcher.  Every value is read from a named Go assignment (and, where
 * needed, its surrounding event/attribute branch), evaluated for refinements
 * 1..5, and compared with the existing candidate claim without changing it.
 * Pinned source files are entity-level evidence until these field records are
 * independently reviewed; this generator never promotes a candidate to the
 * canonical runtime.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultDataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultOutputPath = path.join(defaultDataRoot, "v2", "weapons", "external-evidence.json");
const defaultSourceCatalogPath = path.join(defaultDataRoot, "v2", "source-catalog.json");
const GENERATOR_VERSION = "genshinWeaponGcsimEvidenceGenerate/3";

/**
 * Evidence may be generated from a checkout outside this repository, but the
 * artifact must never retain that checkout's machine-local path.  Source
 * catalog paths are the provider-relative locators used for both extraction
 * and later review.
 */
function providerRelativePath(value, label = "source path") {
    const candidate = String(value || "");
    if (!candidate || path.isAbsolute(candidate) || /^[A-Za-z]:[\\/]/.test(candidate) || candidate.startsWith("\\\\")) {
        throw new Error(`${label} must be a provider-relative path`);
    }
    const normalized = candidate.replaceAll("\\", "/");
    if (normalized.split("/").includes("..")) {
        throw new Error(`${label} must not escape its provider root`);
    }
    return normalized;
}
const REFINEMENTS = [1, 2, 3, 4, 5];

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
}

function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function stableClone(value) {
    if (Array.isArray(value)) return value.map(stableClone);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableClone(value[key])]));
}

function stableJson(value) {
    return JSON.stringify(stableClone(value));
}

function sortNatural(a, b) {
    return String(a).localeCompare(String(b), "en", { numeric: true });
}

function roundNumber(value) {
    if (!Number.isFinite(value)) throw new Error(`non-finite extracted number: ${value}`);
    const rounded = Math.round((value + Number.EPSILON) * 1e9) / 1e9;
    return Object.is(rounded, -0) ? 0 : rounded;
}

function lineNumber(source, offset) {
    return source.slice(0, offset).split("\n").length;
}

function linesOf(source) {
    return source.split(/\r?\n/);
}

function locate(source, pattern, occurrence = 0) {
    const regex = pattern instanceof RegExp
        ? new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`)
        : new RegExp(String(pattern), "g");
    let match;
    let index = 0;
    while ((match = regex.exec(source))) {
        if (index++ === occurrence) {
            const start = lineNumber(source, match.index);
            const end = start + String(match[0]).split("\n").length - 1;
            return { lineStart: start, lineEnd: end, anchor: String(match[0]).trim() };
        }
    }
    return null;
}

function requireLocator(source, pattern, label, occurrence = 0) {
    const result = locate(source, pattern, occurrence);
    if (!result) throw new Error(`missing semantic anchor ${label}`);
    return result;
}

function assignmentExpression(source, pattern, label, occurrence = 0) {
    const locator = requireLocator(source, pattern, label, occurrence);
    const expression = locator.anchor.match(/(?:=|:=)\s*([^;\n]+)$/)?.[1]?.trim();
    if (!expression) throw new Error(`assignment expression missing for ${label}`);
    return { expression, locator };
}

/**
 * Evaluate only the tiny arithmetic grammar used by the pinned assignments.
 * Identifiers are replaced from an explicit environment; arbitrary source
 * text is never executed.  The expression must contain no calls except the
 * recognized float64(r) spelling.
 */
function evaluateArithmetic(expression, env = {}) {
    let value = String(expression).replace(/float64\(r\)/g, "r");
    value = value.replace(/\b([A-Za-z_]\w*)\b/g, (token) => {
        if (Object.prototype.hasOwnProperty.call(env, token)) return String(env[token]);
        if (token === "r") return "r";
        throw new Error(`unrecognized identifier in Go expression: ${token}`);
    });
    if (!/^[0-9r+*./()\s-]+$/.test(value)) {
        throw new Error(`unsupported Go arithmetic expression: ${expression}`);
    }
    const fn = Function("r", `"use strict"; return (${value});`); // eslint-disable-line no-new-func
    return REFINEMENTS.reduce((result, refinement) => {
        const number = Number(fn(refinement));
        if (!Number.isFinite(number)) throw new Error(`non-finite Go expression: ${expression}`);
        result[refinement] = roundNumber(number);
        return result;
    }, {});
}

function scalarAssignment(source, variable, label, occurrence = 0) {
    const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return assignmentExpression(source, new RegExp(`\\b${escaped}\\s*:=\\s*[^\\n;]+`), label, occurrence);
}

function attributeAssignment(source, variable, attribute, label, occurrence = 0) {
    const escapedVariable = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedAttribute = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return assignmentExpression(
        source,
        new RegExp(`\\b${escapedVariable}\\s*\\[\\s*attributes\\.${escapedAttribute}\\s*\\]\\s*=\\s*[^\\n;]+`),
        label,
        occurrence
    );
}

function percentageValues(expression, env = {}) {
    const decimals = evaluateArithmetic(expression, env);
    return Object.fromEntries(REFINEMENTS.map((refinement) => [String(refinement), roundNumber(decimals[refinement] * 100)]));
}

function flatValues(expression, env = {}) {
    const values = evaluateArithmetic(expression, env);
    return Object.fromEntries(REFINEMENTS.map((refinement) => [String(refinement), values[refinement]]));
}

function framesToSeconds(expression, env = {}) {
    const frames = evaluateArithmetic(expression, env);
    return Object.fromEntries(REFINEMENTS.map((refinement) => [String(refinement), roundNumber(frames[refinement] / 60)]));
}

function formulaEvidence({
    source,
    candidateId,
    field = "value",
    sourceField,
    expression,
    locator,
    unit,
    structuredValue,
    targets,
    activation,
    status = "eligible",
    reason = null,
    claim = null,
    extractionNote,
    semanticAnchors = [],
    extractionMethod = null
}) {
    const method = {
        type: "semantic-go-assignment",
        sourceField: sourceField || null,
        semanticAnchors: [
            ...semanticAnchors.map(String),
            ...(locator?.anchor ? [String(locator.anchor)] : [])
        ],
        note: extractionNote || "Named Go assignment evaluated for refinement indices 1..5; no unanchored number search was used."
    };
    if (extractionMethod && typeof extractionMethod === "object") {
        Object.assign(method, clone(extractionMethod));
        method.semanticAnchors = [
            ...new Set([
                ...semanticAnchors.map(String),
                ...(locator?.anchor ? [String(locator.anchor)] : []),
                ...(Array.isArray(extractionMethod.semanticAnchors) ? extractionMethod.semanticAnchors.map(String) : [])
            ])
        ];
    }
    const record = {
        candidateId: candidateId || null,
        field,
        sourceField: sourceField || null,
        status,
        structuredValue: clone(structuredValue),
        value: clone(structuredValue),
        units: unit || null,
        unit: unit || null,
        targets: clone(targets || null),
        activation: clone(activation || null),
        locator: clone(locator || null),
        extractionMethod: method,
        gameVersionEvidence: {
            gameVersion: null,
            status: "missing",
            note: "The pinned gcsim revision and file digest identify source bytes, but the source catalog does not declare a Genshin game patch/version."
        },
        gameVersionVerified: false,
        supportsClaimValue: status === "eligible" && ["value", "refinement", "unit", "duration", "stack"].includes(field),
        providerIndependence: "independent",
        independenceGroup: source?.independenceGroup || "gcsim-implementation",
        claimComparison: claim ? compareClaim(claim, { field, structuredValue, unit, targets, activation }) : null,
        canonicalEligibility: false,
        canonicalBlockedReasons: ["gameVersionMissing", "independentReviewRequired"]
    };
    if (reason) record.reason = reason;
    return record;
}

function unresolvedEvidence({ candidateId = null, field = null, reason, locator = null, sourceField = null, structuredValue = null, unit = null, targets = null, activation = null, semanticAnchors = [] }) {
    return formulaEvidence({
        candidateId,
        field,
        sourceField,
        expression: null,
        locator,
        unit,
        structuredValue,
        targets,
        activation,
        status: "needsReview",
        reason,
        semanticAnchors,
        extractionNote: "The source contains related behavior, but this candidate field cannot be safely mapped without semantic review."
    });
}

function compareClaim(claim, evidence) {
    if (!claim) return { status: "noCandidateClaim" };
    const field = evidence.field || "value";
    let expected;
    let actual;
    let comparisonBasis;
    if (field === "unit") {
        expected = claim.unit;
        actual = evidence.unit ?? evidence.units ?? evidence.structuredValue;
        comparisonBasis = "fieldUnit";
    } else if (field === "targets") {
        expected = claim.targets;
        actual = evidence.targets ?? evidence.structuredValue;
        comparisonBasis = "fieldTargets";
    } else if (field === "activation") {
        expected = claim.activation;
        actual = evidence.activation ?? evidence.structuredValue;
        comparisonBasis = "fieldActivation";
    } else if (field === "duration") {
        expected = claim.duration ?? claim.activation?.durationSeconds ?? null;
        actual = evidence.structuredValue?.seconds ?? evidence.structuredValue;
        comparisonBasis = "fieldDurationSeconds";
    } else if (field === "stack") {
        expected = claim.stack && typeof claim.stack === "object"
            ? {
                ...claim.stack,
                ...(claim.intervalSeconds !== undefined ? { intervalSeconds: claim.intervalSeconds } : {})
            }
            : claim.stack;
        actual = evidence.structuredValue;
        comparisonBasis = "fieldStack";
    } else if (field === "interval") {
        expected = claim.intervalSeconds;
        actual = evidence.structuredValue?.intervalSeconds ?? evidence.structuredValue;
        comparisonBasis = "fieldIntervalSeconds";
    } else {
        expected = claim.value;
        actual = evidence.structuredValue;
        comparisonBasis = "candidateValue";
    }
    const expectedMissing = expected === undefined || expected === null;
    const actualMissing = actual === undefined || actual === null;
    let valueMatch = expectedMissing || actualMissing ? null : stableJson(expected) === stableJson(actual);
    let fieldCoverage = expectedMissing || actualMissing ? "missing" : "complete";
    let fieldCoreMatch = valueMatch;
    let missingCandidateFields = [];
    let extraSourceFields = [];
    if (field === "stack" && !expectedMissing && !actualMissing && expected && actual && typeof expected === "object" && typeof actual === "object" && !Array.isArray(expected) && !Array.isArray(actual)) {
        const coreFields = ["min", "max", "default"];
        const coreExpected = Object.fromEntries(coreFields.filter((key) => expected[key] !== undefined).map((key) => [key, expected[key]]));
        const coreActual = Object.fromEntries(coreFields.filter((key) => actual[key] !== undefined).map((key) => [key, actual[key]]));
        fieldCoreMatch = stableJson(coreExpected) === stableJson(coreActual);
        missingCandidateFields = Object.keys(actual).filter((key) => expected[key] === undefined);
        extraSourceFields = Object.keys(expected).filter((key) => actual[key] === undefined);
        fieldCoverage = missingCandidateFields.length || extraSourceFields.length ? "partial" : "complete";
        // Keep an incomplete stack contract as a conflict even when the
        // shared stack core agrees.  The absent interval is real schema
        // information, not a reason to silently discard the evidence.
        valueMatch = fieldCoreMatch && fieldCoverage === "complete";
    }
    const normalizeActivation = (activation) => {
        if (!activation || typeof activation !== "object") return null;
        const normalized = {};
        ["condition", "scope", "maxStacks", "durationSeconds", "intervalSeconds"].forEach((key) => {
            if (activation[key] !== undefined) normalized[key] = activation[key];
        });
        return normalized;
    };
    const expectedActivation = normalizeActivation(claim.activation);
    const actualActivation = normalizeActivation(evidence.activation);
    const comparison = {
        candidateClaimStatus: claim.status || null,
        valueMatch,
        field,
        comparisonBasis,
        fieldCoreMatch,
        fieldCoverage,
        missingCandidateFields,
        extraSourceFields,
        unitMatch: ["duration", "stack", "interval"].includes(field)
            ? null
            : claim.unit === undefined || claim.unit === null || evidence.unit === undefined
            ? null
            : claim.unit === evidence.unit,
        targetMatch: claim.targets === undefined || claim.targets === null || evidence.targets === undefined
            ? null
            : stableJson(claim.targets) === stableJson(evidence.targets),
        activationMatch: expectedActivation === null || evidence.activation === undefined
            ? null
            : stableJson(expectedActivation) === stableJson(actualActivation),
        semanticMismatch: false,
        semanticMismatchReasons: []
    };
    const mismatchReasons = [];
    if (comparison.unitMatch === false && field !== "unit") mismatchReasons.push("unit");
    if (comparison.targetMatch === false && field !== "targets") mismatchReasons.push("target");
    if (comparison.activationMatch === false && field !== "activation") mismatchReasons.push("activation");
    if (comparison.fieldCoverage === "partial") mismatchReasons.push("fieldCoverage");
    if (comparison.valueMatch === false && field === "duration") mismatchReasons.push("duration");
    if (comparison.valueMatch === false && field === "stack") mismatchReasons.push("stack");
    comparison.semanticMismatchReasons = mismatchReasons;
    comparison.semanticMismatch = mismatchReasons.length > 0;
    return comparison;
}

function claimFor(specs, candidateId) {
    const spec = specs[candidateId];
    if (!spec) return null;
    const effect = spec.effect || {};
    return {
        value: effect.value,
        valueByRefinement: effect.valueByRefinement,
        unit: effect.unit,
        targets: effect.targets,
        activation: effect.activation,
        duration: effect.duration,
        stack: effect.stack,
        intervalSeconds: effect.intervalSeconds ?? effect.stack?.intervalSeconds
    };
}

function sourceAssignment({ source, ...params }) {
    return formulaEvidence({ source, ...params });
}

function scalarPercentField({ source, sourceText, variable, candidateId, sourceField, label, unit = "percent", env = {}, claim, targets, activation, ...rest }) {
    const assignment = scalarAssignment(sourceText, variable, label);
    return sourceAssignment({
        source,
        candidateId,
        sourceField: sourceField || variable,
        expression: assignment.expression,
        locator: assignment.locator,
        unit,
        structuredValue: unit === "flat" ? flatValues(assignment.expression, env) : percentageValues(assignment.expression, env),
        targets,
        activation,
        claim,
        semanticAnchors: [`${variable} := ...`, label],
        ...rest
    });
}

function attributePercentField({ source, sourceText, variable, attribute, occurrence = 0, candidateId, sourceField, label, claim, targets, activation, ...rest }) {
    const assignment = attributeAssignment(sourceText, variable, attribute, label, occurrence);
    return sourceAssignment({
        source,
        candidateId,
        sourceField: sourceField || `${variable}[attributes.${attribute}]`,
        expression: assignment.expression,
        locator: assignment.locator,
        unit: "percent",
        structuredValue: percentageValues(assignment.expression),
        targets,
        activation,
        claim,
        semanticAnchors: [`${variable}[attributes.${attribute}] = ...`, label],
        ...rest
    });
}

function makeSourceRecord({ sourceCatalog, sourceId, root, text, weaponId, symbol = "NewWeapon", linePattern }) {
    const catalogRecord = sourceCatalog.records?.[sourceId];
    if (!catalogRecord) throw new Error(`source catalog record missing: ${sourceId}`);
    const source = sourceCatalog.sources?.[catalogRecord.source];
    if (!source) throw new Error(`source catalog provider missing: ${catalogRecord.source}`);
    const bytes = Buffer.from(text, "utf8");
    const actualSha = sha256(bytes);
    if (actualSha !== catalogRecord.sha256) {
        throw new Error(`${sourceId} SHA-256 mismatch: expected ${catalogRecord.sha256}, got ${actualSha}`);
    }
    const providerPath = providerRelativePath(catalogRecord.path, `${sourceId} catalog path`);
    const locator = requireLocator(text, linePattern || /func\s+NewWeapon\s*\(/, "NewWeapon symbol");
    const sourceRecord = {
        sourceRecordId: sourceId,
        entity: { kind: "weapon", id: String(weaponId) },
        provider: source.provider || catalogRecord.source,
        repository: source.repository || null,
        revision: source.revision || null,
        path: providerPath,
        sha256: catalogRecord.sha256,
        // Keep the locator portable.  `root` is an extraction-time input and
        // must not be serialized into repository evidence.
        sourceFile: providerPath,
        locator: { symbol, ...locator },
        gameVersion: null,
        gameVersionEvidence: {
            status: "missing",
            source: "v2/source-catalog.json",
            note: "No game patch/version is pinned by this gcsim source record; repository revision is retained separately."
        },
        gameVersionVerified: false,
        providerIndependence: "independent",
        independenceGroup: source.independenceGroup || "gcsim-implementation",
        revisionVerified: true,
        sourceBytes: bytes.length,
        sourceTextDigest: actualSha,
        fields: [],
        unmappedSourceFields: []
    };
    sourceRecord.sourceRecord = {
        id: sourceRecord.sourceRecordId,
        provider: sourceRecord.provider,
        repository: sourceRecord.repository,
        revision: sourceRecord.revision,
        path: sourceRecord.path,
        sha256: sourceRecord.sha256,
        locator: clone(sourceRecord.locator),
        gameVersion: sourceRecord.gameVersion,
        gameVersionEvidence: clone(sourceRecord.gameVersionEvidence),
        gameVersionVerified: false,
        providerIndependence: "independent",
        independenceGroup: sourceRecord.independenceGroup,
        revisionVerified: true
    };
    return sourceRecord;
}

function addField(record, field) {
    const withRecord = {
        ...field,
        provider: record.provider,
        revision: record.revision,
        path: record.path,
        sha256: record.sha256,
        sourceRecordId: record.sourceRecordId,
        gameVersion: record.gameVersion,
        gameVersionEvidence: clone(record.gameVersionEvidence),
        gameVersionVerified: false,
        supportsClaimValue: field.supportsClaimValue === undefined ? false : field.supportsClaimValue,
        providerIndependence: field.providerIndependence || "independent",
        independenceGroup: field.independenceGroup || record.independenceGroup,
        sourceRecord: clone(record.sourceRecord)
    };
    record.fields.push(withRecord);
    return withRecord;
}

function addUnmapped(record, value) {
    record.unmappedSourceFields.push({
        ...value,
        provider: record.provider,
        revision: record.revision,
        path: record.path,
        sha256: record.sha256,
        sourceRecordId: record.sourceRecordId,
        gameVersion: record.gameVersion,
        gameVersionEvidence: clone(record.gameVersionEvidence),
        sourceRecord: clone(record.sourceRecord),
        gameVersionVerified: false,
        providerIndependence: "independent",
        independenceGroup: record.independenceGroup,
        canonicalEligibility: false
    });
}

function candidateClaim(specs, candidateId) {
    return claimFor(specs, candidateId);
}

function addMapped(record, sourceText, specs, definition) {
    const candidateId = definition.candidateId || null;
    const claim = candidateId ? candidateClaim(specs, candidateId) : null;
    const field = definition.field || "value";
    if (definition.extract) {
        const result = definition.extract({ source: record, sourceText, claim });
        addField(record, { ...result, candidateId, field });
        return result;
    }
    const result = formulaEvidence({ source: record, candidateId, field, claim, ...definition });
    addField(record, result);
    return result;
}

function addNeedsReview(record, specs, definition) {
    const candidateId = definition.candidateId || null;
    const claim = candidateId ? candidateClaim(specs, candidateId) : null;
    const result = unresolvedEvidence({ ...definition, candidateId });
    result.claimComparison = claim ? compareClaim(claim, result) : null;
    addField(record, result);
    return result;
}

function freedomRecord({ sourceCatalog, root, specs }) {
    const sourceId = "gcsim:weapon:11503";
    const file = path.join(root, sourceCatalog.records[sourceId].path.replaceAll("/", path.sep));
    const text = fs.readFileSync(file, "utf8");
    const record = makeSourceRecord({ sourceCatalog, sourceId, root, text, weaponId: "11503" });
    const personal = attributeAssignment(text, "m", "DmgP", "freedom personal damage");
    const unique = attributeAssignment(text, "uniqueVal", "DmgP", "freedom normal/charged/plunge damage");
    const shared = attributeAssignment(text, "sharedVal", "ATKP", "freedom team attack");
    addMapped(record, text, specs, { candidateId: "w_11503_damage_1", field: "value", sourceField: "m[attributes.DmgP]", locator: personal.locator, structuredValue: percentageValues(personal.expression), unit: "percent", targets: ["allDamageBonus"], activation: { condition: "always" }, extractionMethod: { type: "semantic-go-assignment" } });
    addMapped(record, text, specs, { candidateId: "w_11503_damage_3", field: "value", sourceField: "uniqueVal[attributes.DmgP]", locator: unique.locator, structuredValue: percentageValues(unique.expression), unit: "percent", targets: ["normalAttackDamageBonus", "chargedAttackDamageBonus", "plungingAttackDamageBonus"], activation: { condition: "afterTwoSigilsConsumed", durationSeconds: 12 }, status: "eligible", reason: null, extractionMethod: { type: "semantic-go-assignment" } });
    addMapped(record, text, specs, { candidateId: "w_11503_stat_2", field: "value", sourceField: "sharedVal[attributes.ATKP]", locator: shared.locator, structuredValue: percentageValues(shared.expression), unit: "percent", targets: ["atkPercent"], activation: { condition: "afterTwoSigilsConsumed", durationSeconds: 12, scope: "allPartyMembers" }, extractionMethod: { type: "semantic-go-assignment" } });
    addNeedsReview(record, specs, { candidateId: "w_11503_damage_3", field: "activation", reason: "candidate activation is always, but gcsim applies the buff only after two sigils are consumed; source semantics are retained without mutating the candidate.", structuredValue: { condition: "afterTwoSigilsConsumed", durationSeconds: 12, scope: "allPartyMembers" }, unit: null, targets: null, activation: { condition: "afterTwoSigilsConsumed", durationSeconds: 12, scope: "allPartyMembers" }, locator: requireLocator(text, /if\s+stacks\s*==\s*2\s*\{/, "freedom two-sigil branch") });
    addNeedsReview(record, specs, { candidateId: "w_11503_stat_2", field: "activation", reason: "candidate activation is always, but gcsim applies the buff only after two sigils are consumed; source semantics are retained without mutating the candidate.", structuredValue: { condition: "afterTwoSigilsConsumed", durationSeconds: 12, scope: "allPartyMembers" }, unit: null, targets: null, activation: { condition: "afterTwoSigilsConsumed", durationSeconds: 12, scope: "allPartyMembers" }, locator: requireLocator(text, /if\s+stacks\s*==\s*2\s*\{/, "freedom two-sigil branch") });
    return record;
}

function amosRecord({ sourceCatalog, root, specs }) {
    const sourceId = "gcsim:weapon:15502";
    const file = path.join(root, sourceCatalog.records[sourceId].path.replaceAll("/", path.sep));
    const text = fs.readFileSync(file, "utf8");
    const record = makeSourceRecord({ sourceCatalog, sourceId, root, text, weaponId: "15502" });
    const per = scalarAssignment(text, "dmgpers", "amos per-flight increment");
    const flat = scalarAssignment(text, "flat", "amos base normal/charged damage");
    const target = { targetTags: ["normal", "extra"], mappedClaims: ["normalAttackDamageBonus", "chargedAttackDamageBonus"] };
    addMapped(record, text, specs, { candidateId: "w_15502_damage_1", field: "value", sourceField: "flat", locator: flat.locator, structuredValue: percentageValues(flat.expression), unit: "percent", targets: ["normalAttackDamageBonus", "chargedAttackDamageBonus"], activation: { condition: "always" }, extractionMethod: { type: "semantic-go-assignment", semanticAnchors: ["flat := ...", "AttackTagNormal", "AttackTagExtra"] } });
    addMapped(record, text, specs, { candidateId: "w_15502_damageBonus_fc388315", field: "value", sourceField: "dmgpers", locator: per.locator, structuredValue: percentageValues(per.expression), unit: "percent", targets: ["normalAttackDamageBonus", "chargedAttackDamageBonus"], activation: { condition: "arrowFlightTime", intervalSeconds: 0.1 }, extractionMethod: { type: "semantic-go-assignment", semanticAnchors: ["dmgpers := ...", "travel / 0.1", "min(..., 5)"] } });
    addMapped(record, text, specs, { candidateId: "w_15502_damageBonus_fc388315", field: "stack", sourceField: "stacks := min(int(travel/0.1), 5)", locator: requireLocator(text, /stacks\s*:=\s*min\(int\(travel\/0\.1\),\s*5\)/, "amos stack cap"), structuredValue: { min: 0, max: 5, default: 0, intervalSeconds: 0.1 }, unit: "stack", targets: ["normalAttackDamageBonus", "chargedAttackDamageBonus"], activation: { condition: "arrowFlightTime" }, extractionMethod: { type: "semantic-go-branch", semanticAnchors: ["travel := ...", "stacks := min(int(travel/0.1), 5)"] } });
    return record;
}

function bellRecord({ sourceCatalog, root, specs }) {
    const sourceId = "gcsim:weapon:12402";
    const file = path.join(root, sourceCatalog.records[sourceId].path.replaceAll("/", path.sep));
    const text = fs.readFileSync(file, "utf8");
    const record = makeSourceRecord({ sourceCatalog, sourceId, root, text, weaponId: "12402" });
    const hp = scalarAssignment(text, "hp", "bell shield HP fraction");
    const dmg = attributeAssignment(text, "m", "DmgP", "bell shielded damage bonus");
    addMapped(record, text, specs, { candidateId: "w_12402_damage_1", field: "value", sourceField: "m[attributes.DmgP]", locator: dmg.locator, structuredValue: percentageValues(dmg.expression), unit: "percent", targets: ["allDamageBonus"], activation: { condition: "whileShielded" }, extractionMethod: { type: "semantic-go-assignment", semanticAnchors: ["m[attributes.DmgP] = ...", "CharacterIsShielded"] } });
    addNeedsReview(record, specs, { candidateId: "w_12402_damage_1", field: "activation", reason: "gcsim gates the damage bonus on CharacterIsShielded, while the legacy candidate claims always; this evidence cannot silently change that claim.", structuredValue: { condition: "whileShielded" }, activation: { condition: "whileShielded" }, locator: requireLocator(text, /CharacterIsShielded\(/, "bell shield gate") });
    addMapped(record, text, specs, { candidateId: "w_12402_extraDamage_4ff89bef", field: "value", sourceField: "hp", locator: hp.locator, structuredValue: percentageValues(hp.expression), unit: "percent", targets: ["shieldCapacity"], activation: { condition: "afterTakingDamage" }, extractionMethod: { type: "semantic-go-assignment", semanticAnchors: ["hp := ...", "HP: hp * char.MaxHP()"] } });
    addUnmapped(record, { field: "shieldDuration", sourceField: "Expires", structuredValue: { seconds: 10 }, units: "seconds", locator: requireLocator(text, /Expires:\s*c\.F\s*\+\s*600/, "bell shield expiration"), extractionMethod: { type: "semantic-go-constant", semanticAnchors: ["Expires: c.F + 600"] }, mapping: { status: "registryLifecycleMapped", registryGroupId: "bell_shield_generation", registryField: "activation.durationSeconds" }, reason: "Mapped to display-only Bell shield lifecycle metadata; it is not a damage candidate value." });
    addUnmapped(record, { field: "cooldown", sourceField: "icd", structuredValue: { seconds: 45 }, units: "seconds", locator: requireLocator(text, /char\.AddStatus\(icdKey,\s*2700/, "bell cooldown"), extractionMethod: { type: "semantic-go-constant", semanticAnchors: ["AddStatus(icdKey, 2700)"] }, mapping: { status: "registryLifecycleMapped", registryGroupId: "bell_shield_generation", registryField: "activation.cooldownSeconds" }, reason: "Mapped to display-only Bell shield lifecycle metadata; it is not a damage candidate value." });
    return record;
}

function mistsplitterRecord({ sourceCatalog, root, specs }) {
    const sourceId = "gcsim:weapon:11509";
    const file = path.join(root, sourceCatalog.records[sourceId].path.replaceAll("/", path.sep));
    const text = fs.readFileSync(file, "utf8");
    const record = makeSourceRecord({ sourceCatalog, sourceId, root, text, weaponId: "11509" });
    const base = scalarAssignment(text, "base", "mistsplitter base elemental bonus");
    const stack = scalarAssignment(text, "stack", "mistsplitter per-emblem bonus");
    const maxBonus = scalarAssignment(text, "maxBonus", "mistsplitter three-stack bonus");
    const baseValues = percentageValues(base.expression);
    const stackValues = percentageValues(stack.expression);
    const maxValues = percentageValues(maxBonus.expression);
    const stacked = Object.fromEntries(REFINEMENTS.map((refinement) => [String(refinement), [1, 2, 3].map((count) => roundNumber(stackValues[refinement] * count + (count === 3 ? maxValues[refinement] : 0)))]));
    addMapped(record, text, specs, { candidateId: "w_11509_damage_1", field: "value", sourceField: "base", locator: base.locator, structuredValue: baseValues, unit: "percent", targets: ["allElementDamageBonus"], activation: { condition: "always" }, extractionMethod: { type: "semantic-go-assignment", semanticAnchors: ["base := ...", "for i := attributes.PyroP; i <= attributes.DendroP; i++"] } });
    addMapped(record, text, specs, { candidateId: "w_11509_damageBonus_ae1b42da", field: "value", sourceField: "stack/maxBonus", locator: { lineStart: stack.locator.lineStart, lineEnd: maxBonus.locator.lineEnd, anchor: `${stack.locator.anchor}; ${maxBonus.locator.anchor}` }, structuredValue: stacked, unit: "percent", targets: ["ownElementDamageBonus"], activation: { condition: "emblemStacks", maxStacks: 3 }, extractionMethod: { type: "semantic-go-derived-stack", semanticAnchors: ["stack := ...", "maxBonus := ...", "count >= 3"] } });
    addMapped(record, text, specs, { candidateId: "w_11509_damageBonus_ae1b42da", field: "stack", sourceField: "count", locator: requireLocator(text, /if\s+count\s+>=\s+3\s*\{/, "mistsplitter stack branch"), structuredValue: { min: 0, max: 3, default: 0 }, unit: "stack", targets: ["ownElementDamageBonus"], activation: { condition: "energyBelowFullOrElementalNormalHitOrBurst" }, extractionMethod: { type: "semantic-go-branch", semanticAnchors: ["count++", "count >= 3"] } });
    addNeedsReview(record, specs, { candidateId: "w_11509_damageBonus_ae1b42da", field: "activation", reason: "The existing candidate says always; gcsim counts energy-below-full, elemental normal hit, and burst conditions independently.", structuredValue: { condition: "energyBelowFullOrElementalNormalHitOrBurst", maxStacks: 3 }, activation: { condition: "energyBelowFullOrElementalNormalHitOrBurst", maxStacks: 3 }, locator: requireLocator(text, /if\s+char\.Energy\s*<\s*char\.EnergyMax/, "mistsplitter energy condition") });
    addNeedsReview(record, specs, { candidateId: "w_11509_damage_2", field: "value", reason: "The source computes own-element emblem values, but this candidate targets allElementDamageBonus; numeric agreement alone is not semantic evidence.", structuredValue: stacked, unit: "percent", targets: ["ownElementDamageBonus"], activation: { condition: "emblemStacks", maxStacks: 3 }, locator: { lineStart: stack.locator.lineStart, lineEnd: maxBonus.locator.lineEnd, anchor: `${stack.locator.anchor}; ${maxBonus.locator.anchor}` } });
    return record;
}

function widsithRecord({ sourceCatalog, root, specs }) {
    const sourceId = "gcsim:weapon:14402";
    const file = path.join(root, sourceCatalog.records[sourceId].path.replaceAll("/", path.sep));
    const text = fs.readFileSync(file, "utf8");
    const record = makeSourceRecord({ sourceCatalog, sourceId, root, text, weaponId: "14402" });
    const atk = attributeAssignment(text, "mATK", "ATKP", "widsith attack buff");
    const em = attributeAssignment(text, "mEM", "EM", "widsith elemental mastery buff");
    const dmg = scalarAssignment(text, "dmg", "widsith elemental damage buff");
    const mDmg = requireLocator(text, /mDmg\[attributes\.DendroP\]\s*=\s*dmg/, "widsith all-element damage assignment");
    addMapped(record, text, specs, { candidateId: "w_14402_stat_1", field: "value", sourceField: "mATK[attributes.ATKP]", locator: atk.locator, structuredValue: percentageValues(atk.expression), unit: "percent", targets: ["atkPercent"], activation: { condition: "onCharacterSwapRandomBuff" }, extractionMethod: { type: "semantic-go-assignment", semanticAnchors: ["mATK[attributes.ATKP] = ...", "state := c.Rand.Intn(3)"] } });
    addMapped(record, text, specs, { candidateId: "w_14402_stat_3", field: "value", sourceField: "mEM[attributes.EM]", locator: em.locator, structuredValue: flatValues(em.expression), unit: "flat", targets: ["elementalMastery"], activation: { condition: "onCharacterSwapRandomBuff" }, extractionMethod: { type: "semantic-go-assignment", semanticAnchors: ["mEM[attributes.EM] = ...", "state := c.Rand.Intn(3)"] } });
    addMapped(record, text, specs, { candidateId: "w_14402_damage_2", field: "value", sourceField: "mDmg[attributes.PyroP..DendroP]", locator: mDmg, structuredValue: percentageValues(dmg.expression), unit: "percent", targets: ["allElementDamageBonus"], activation: { condition: "onCharacterSwapRandomBuff" }, extractionMethod: { type: "semantic-go-assignment", semanticAnchors: ["dmg := ...", "mDmg[attributes.PyroP] = dmg", "mDmg[attributes.DendroP] = dmg"] } });
    const duration = requireLocator(text, /BaseWithHitlag\("widsith",\s*600\)/, "widsith buff duration");
    addNeedsReview(record, specs, { candidateId: "w_14402_stat_1", field: "activation", reason: "The candidate claims always; gcsim selects one of three buffs on swap and applies a 10 second status.", structuredValue: { condition: "onCharacterSwapRandomBuff", durationSeconds: 10, choices: ["elementalMastery", "elementalDamage", "attackPercent"] }, activation: { condition: "onCharacterSwapRandomBuff", durationSeconds: 10 }, locator: duration });
    addUnmapped(record, { field: "duration", sourceField: "BaseWithHitlag", structuredValue: { seconds: 10 }, units: "seconds", locator: duration, extractionMethod: { type: "semantic-go-constant", semanticAnchors: ["NewBaseWithHitlag(\"widsith\", 600)"] }, mapping: { status: "registryLifecycleMapped", registryGroupId: "widsith_song", registryField: "activation.durationSeconds" }, reason: "Mapped once to the shared Widsith song lifecycle instead of duplicating it across three modifier candidates." });
    addUnmapped(record, { field: "cooldown", sourceField: "icd", structuredValue: { seconds: 30 }, units: "seconds", locator: requireLocator(text, /const\s+icdKey[\s\S]*?icd\s*:=\s*1800/, "widsith cooldown"), extractionMethod: { type: "semantic-go-constant", semanticAnchors: ["icd := 1800"] }, mapping: { status: "registryLifecycleMapped", registryGroupId: "widsith_song", registryField: "activation.cooldownSeconds" }, reason: "Mapped once to the shared Widsith song lifecycle instead of duplicating it across three modifier candidates." });
    return record;
}

function stringlessRecord({ sourceCatalog, root, specs }) {
    const sourceId = "gcsim:weapon:15402";
    const file = path.join(root, sourceCatalog.records[sourceId].path.replaceAll("/", path.sep));
    const text = fs.readFileSync(file, "utf8");
    const record = makeSourceRecord({ sourceCatalog, sourceId, root, text, weaponId: "15402" });
    const assignment = attributeAssignment(text, "m", "DmgP", "stringless skill/burst damage");
    addMapped(record, text, specs, { candidateId: "w_15402_damage_1", field: "value", sourceField: "m[attributes.DmgP]", locator: assignment.locator, structuredValue: percentageValues(assignment.expression), unit: "percent", targets: ["skillDamageBonus", "burstDamageBonus"], activation: { condition: "always" }, extractionMethod: { type: "semantic-go-assignment", semanticAnchors: ["m[attributes.DmgP] = ...", "AttackTagElementalArt", "AttackTagElementalBurst"] } });
    return record;
}

function athameRecord({ sourceCatalog, root, specs }) {
    const sourceId = "gcsim:weapon:11518";
    const file = path.join(root, sourceCatalog.records[sourceId].path.replaceAll("/", path.sep));
    const text = fs.readFileSync(file, "utf8");
    const record = makeSourceRecord({ sourceCatalog, sourceId, root, text, weaponId: "11518" });
    const self = scalarAssignment(text, "selfATK", "athame self attack");
    const team = scalarAssignment(text, "teamATK", "athame team attack");
    // In gcsim's attributes namespace `CD` is Critical Damage (the config
    // stat paired with `CR`), not an action cooldown. Action cooldowns live in
    // combat/action state. Keep the upstream variable spelling but label the
    // extracted meaning explicitly so it cannot be misclassified again.
    const burstCritDamage = scalarAssignment(text, "burstCD", "athame burst critical damage");
    const selfBase = percentageValues(self.expression);
    const teamBase = percentageValues(team.expression);
    const selfConditional = Object.fromEntries(REFINEMENTS.map((refinement) => [String(refinement), roundNumber(selfBase[refinement] * 1.75)]));
    const teamConditional = Object.fromEntries(REFINEMENTS.map((refinement) => [String(refinement), roundNumber(teamBase[refinement] * 1.75)]));
    addMapped(record, text, specs, { candidateId: "w_11518_stat_3", field: "value", sourceField: "selfATK", locator: self.locator, structuredValue: { baseByRefinement: selfBase, hexereiCountAtLeast2ByRefinement: selfConditional, multiplier: 1.75 }, unit: "percent", targets: ["atkPercent"], activation: { condition: "afterOwnBurstHit" }, status: "needsReview", reason: "The source applies a 1.75x branch when at least two Hexerei characters are present; the legacy candidate exposes only one value series.", extractionMethod: { type: "semantic-go-assignment", semanticAnchors: ["selfATK := ...", "GetHexereiCount() >= 2", "selfATK * 1.75"] } });
    addMapped(record, text, specs, { candidateId: "w_11518_stat_4", field: "value", sourceField: "teamATK", locator: team.locator, structuredValue: { baseByRefinement: teamBase, hexereiCountAtLeast2ByRefinement: teamConditional, multiplier: 1.75 }, unit: "percent", targets: ["atkPercent"], activation: { condition: "afterOwnBurstHit", scope: "otherNearbyActiveFieldCharacter" }, status: "needsReview", reason: "The source applies a 1.75x branch when at least two Hexerei characters are present; the legacy candidate exposes only one value series.", extractionMethod: { type: "semantic-go-assignment", semanticAnchors: ["teamATK := ...", "GetHexereiCount() >= 2", "teamATK * 1.75"] } });
    addMapped(record, text, specs, { candidateId: "w_11518_stat_3", field: "duration", sourceField: "buffDur", locator: requireLocator(text, /buffDur\s*=\s*3\s*\*\s*60/, "athame buff duration"), structuredValue: { seconds: 3 }, unit: "seconds", targets: ["atkPercent"], activation: { condition: "afterOwnBurstHit" }, extractionMethod: { type: "semantic-go-constant", semanticAnchors: ["buffDur = 3 * 60"] } });
    addMapped(record, text, specs, { candidateId: "w_11518_stat_4", field: "duration", sourceField: "buffDur", locator: requireLocator(text, /buffDur\s*=\s*3\s*\*\s*60/, "athame team buff duration"), structuredValue: { seconds: 3 }, unit: "seconds", targets: ["atkPercent"], activation: { condition: "afterOwnBurstHit", scope: "otherNearbyActiveFieldCharacter" }, extractionMethod: { type: "semantic-go-constant", semanticAnchors: ["buffDur = 3 * 60", "QueueCharTask"] } });
    addNeedsReview(record, specs, { candidateId: "w_11518_stat_3", field: "activation", reason: "The candidate claims always; gcsim applies this attack buff only after the wielder's elemental burst hits an enemy.", structuredValue: { condition: "afterOwnBurstHit" }, activation: { condition: "afterOwnBurstHit" }, locator: requireLocator(text, /AttackTagElementalBurst/, "athame burst trigger") });
    addNeedsReview(record, specs, { candidateId: "w_11518_stat_4", field: "activation", reason: "The candidate claims always; gcsim applies the team buff after the wielder's burst and only to another nearby active field character.", structuredValue: { condition: "afterOwnBurstHit", scope: "otherNearbyActiveFieldCharacter" }, activation: { condition: "afterOwnBurstHit", scope: "otherNearbyActiveFieldCharacter" }, locator: requireLocator(text, /active\.Index\(\) == w\.char\.Index\(\)/, "athame team scope") });
    addMapped(record, text, specs, { candidateId: "w_11518_crit_1", field: "value", sourceField: "burstCD", locator: burstCritDamage.locator, structuredValue: percentageValues(burstCritDamage.expression), unit: "percent", targets: ["burstCritDamage"], activation: { condition: "always" }, extractionMethod: { type: "semantic-go-assignment", semanticAnchors: ["burstCD := ...", "AffectedStat: attributes.CD", "gcsim attribute CD = Critical Damage"] } });
    ["w_11518_critBonus_765ef224", "w_11518_damage_2"].forEach((candidateId) => addNeedsReview(record, specs, { candidateId, field: "value", reason: "No corresponding semantic assignment in the pinned Athame Artis implementation supports this duplicate legacy crit/damage claim.", structuredValue: null, locator: record.locator }));
    return record;
}

function fruitfulRecord({ sourceCatalog, root, specs }) {
    const sourceId = "gcsim:weapon:12430";
    const file = path.join(root, sourceCatalog.records[sourceId].path.replaceAll("/", path.sep));
    const text = fs.readFileSync(file, "utf8");
    const record = makeSourceRecord({ sourceCatalog, sourceId, root, text, weaponId: "12430" });
    const cr = attributeAssignment(text, "mCR", "CR", "fruitful hook plunge crit rate");
    const dmg = attributeAssignment(text, "mDMG", "DmgP", "fruitful hook post-plunge damage");
    addMapped(record, text, specs, { candidateId: "w_12430_crit_1", field: "value", sourceField: "mCR[attributes.CR]", locator: cr.locator, structuredValue: percentageValues(cr.expression), unit: "percent", targets: ["plungingAttackCritRate"], activation: { condition: "always" }, extractionMethod: { type: "semantic-go-assignment", semanticAnchors: ["mCR[attributes.CR] = ...", "AttackTagPlunge"] } });
    addMapped(record, text, specs, { candidateId: "w_12430_critBonus_ef236f15", field: "value", sourceField: "mCR[attributes.CR]", locator: cr.locator, structuredValue: percentageValues(cr.expression), unit: "percent", targets: ["plungingAttackCritRate"], activation: { condition: "always" }, status: "needsReview", reason: "The source is plunge-only, while this legacy candidate targets generic critRate; numeric agreement is not enough to map scope.", extractionMethod: { type: "semantic-go-assignment", semanticAnchors: ["mCR[attributes.CR] = ...", "AttackTagPlunge"] } });
    addMapped(record, text, specs, { candidateId: "w_12430_damageBonus_c7243261", field: "value", sourceField: "mDMG[attributes.DmgP]", locator: dmg.locator, structuredValue: percentageValues(dmg.expression), unit: "percent", targets: ["normalAttackDamageBonus", "chargedAttackDamageBonus", "plungingAttackDamageBonus"], activation: { condition: "afterPlungeHit", durationSeconds: 10 }, extractionMethod: { type: "semantic-go-assignment", semanticAnchors: ["mDMG[attributes.DmgP] = ...", "OnEnemyDamage", "AttackTagPlunge"] } });
    addMapped(record, text, specs, { candidateId: "w_12430_damageBonus_c7243261", field: "duration", sourceField: "BaseWithHitlag", locator: requireLocator(text, /NewBaseWithHitlag\("fruitful-hook-dmg%",\s*10\s*\*\s*60\)/, "fruitful hook duration"), structuredValue: { seconds: 10 }, unit: "seconds", targets: ["normalAttackDamageBonus", "chargedAttackDamageBonus", "plungingAttackDamageBonus"], activation: { condition: "afterPlungeHit" }, extractionMethod: { type: "semantic-go-constant", semanticAnchors: ["10 * 60"] } });
    addNeedsReview(record, specs, { candidateId: "w_12430_damageBonus_c7243261", field: "stack", reason: "The legacy candidate exposes a max stack of 3, but the pinned gcsim implementation adds a timed attack modifier without an explicit stack cap.", structuredValue: null, locator: requireLocator(text, /AddAttackMod\(character\.AttackMod\{/, "fruitful hook timed modifier") });
    return record;
}

function goldenRecord({ sourceCatalog, root, specs }) {
    const sourceId = "gcsim:weapon:15516";
    const file = path.join(root, sourceCatalog.records[sourceId].path.replaceAll("/", path.sep));
    const text = fs.readFileSync(file, "utf8");
    const record = makeSourceRecord({ sourceCatalog, sourceId, root, text, weaponId: "15516" });
    const def = attributeAssignment(text, "m", "DEFP", "golden frostbound oath defense");
    const geo = attributeAssignment(text, "n", "GeoP", "golden frostbound oath self geo");
    const lcr = scalarAssignment(text, "lcrBuff", "golden frostbound oath self lunar crystallize");
    const teamGeo = attributeAssignment(text, "teamM", "GeoP", "golden frostbound oath team geo");
    const teamLcr = scalarAssignment(text, "teamLcrBuff", "golden frostbound oath team lunar crystallize");
    const trigger = { condition: "afterElementalSkillOrLunarCrystallize", durationSeconds: 6 };
    const teamTrigger = { condition: "afterElementalSkillOrLunarCrystallizeAndNearbyMoondrift", durationSeconds: 2, scope: "otherNearbyPartyMembers" };
    addMapped(record, text, specs, { candidateId: "w_15516_stat_1", field: "value", sourceField: "m[attributes.DEFP]", locator: def.locator, structuredValue: percentageValues(def.expression), unit: "percent", targets: ["defPercent"], activation: { condition: "always" }, extractionMethod: { type: "semantic-go-assignment", semanticAnchors: ["m[attributes.DEFP] = ...", "AddStatMod"] } });
    addMapped(record, text, specs, { candidateId: "w_15516_damage_2", field: "value", sourceField: "n[attributes.GeoP]", locator: geo.locator, structuredValue: percentageValues(geo.expression), unit: "percent", targets: ["geoDamageBonus"], activation: trigger, extractionMethod: { type: "semantic-go-assignment", semanticAnchors: ["n[attributes.GeoP] = ...", "OnEnemyDamage", "AttackTagElementalArt"] } });
    addMapped(record, text, specs, { candidateId: "w_15516_reaction_bonus_3", field: "value", sourceField: "lcrBuff", locator: lcr.locator, structuredValue: percentageValues(lcr.expression), unit: "percent", targets: ["lunarCrystallizeDamageBonus"], activation: trigger, extractionMethod: { type: "semantic-go-assignment", semanticAnchors: ["lcrBuff := ...", "ReactBonusMod"] } });
    addMapped(record, text, specs, { candidateId: "w_15516_damage_5", field: "value", sourceField: "teamM[attributes.GeoP]", locator: teamGeo.locator, structuredValue: percentageValues(teamGeo.expression), unit: "percent", targets: ["geoDamageBonus"], activation: teamTrigger, status: "needsReview", reason: "The numeric assignment is direct, but this candidate does not encode the team/nearby scope or moondrift requirement.", extractionMethod: { type: "semantic-go-assignment", semanticAnchors: ["teamM[attributes.GeoP] = ...", "moondriftnearby"] } });
    addMapped(record, text, specs, { candidateId: "w_15516_reaction_bonus_4", field: "value", sourceField: "teamLcrBuff", locator: teamLcr.locator, structuredValue: percentageValues(teamLcr.expression), unit: "percent", targets: ["lunarCrystallizeDamageBonus"], activation: teamTrigger, status: "needsReview", reason: "The numeric assignment is direct, but this candidate does not encode the team/nearby scope or moondrift requirement.", extractionMethod: { type: "semantic-go-assignment", semanticAnchors: ["teamLcrBuff := ...", "moondriftnearby"] } });
    addNeedsReview(record, specs, { candidateId: "w_15516_damage_2", field: "activation", reason: "The candidate claims always; gcsim applies the self Geo buff after a qualifying skill or Lunar Crystallize event.", structuredValue: trigger, activation: trigger, locator: requireLocator(text, /switch\s+atk\.Info\.AttackTag\s*\{/, "golden trigger switch") });
    addNeedsReview(record, specs, { candidateId: "w_15516_reaction_bonus_3", field: "activation", reason: "The candidate claims afterCrystallize, but gcsim also accepts an elemental skill and applies a six-second self buff.", structuredValue: trigger, activation: trigger, locator: requireLocator(text, /AttackTagElementalArt,/, "golden skill trigger") });
    addNeedsReview(record, specs, { candidateId: "w_15516_damage_5", field: "activation", reason: "The team Geo buff requires a nearby moondrift and is refreshed on a ticker; the candidate condition is incomplete.", structuredValue: teamTrigger, activation: teamTrigger, locator: requireLocator(text, /moondriftnearby/, "golden nearby construct gate") });
    addNeedsReview(record, specs, { candidateId: "w_15516_reaction_bonus_4", field: "activation", reason: "The team Lunar Crystallize buff requires a nearby moondrift and is refreshed on a ticker; the candidate condition is incomplete.", structuredValue: teamTrigger, activation: teamTrigger, locator: requireLocator(text, /moondriftnearby/, "golden nearby construct gate") });
    [
        ["w_15516_damageBonus_1923e8e9", teamGeo, "team Geo assignment", "candidate ownElementDamageBonus is not scoped to other nearby characters"],
        ["w_15516_damageBonus_f827969c", geo, "self Geo assignment", "candidate ownElementDamageBonus is broader than the Geo-specific assignment"],
        ["w_15516_reactionBonus_232c59cc", teamLcr, "team Lunar assignment", "candidate reactionDamageBonus is broader than Lunar Crystallize and team-scoped"],
        ["w_15516_reactionBonus_999a052c", lcr, "self Lunar assignment", "candidate reactionDamageBonus is broader than Lunar Crystallize"]
    ].forEach(([candidateId, assignment, label, reason]) => addNeedsReview(record, specs, { candidateId, field: "value", reason, structuredValue: percentageValues(assignment.expression), unit: "percent", locator: assignment.locator, sourceField: label }));
    return record;
}

const BUILDERS = {
    "11503": freedomRecord,
    "15502": amosRecord,
    "12402": bellRecord,
    "11509": mistsplitterRecord,
    "14402": widsithRecord,
    "15402": stringlessRecord,
    "11518": athameRecord,
    "12430": fruitfulRecord,
    "15516": goldenRecord
};

function sourcePathFor(root, sourceCatalog, sourceId) {
    const record = sourceCatalog.records?.[sourceId];
    if (!record?.path) throw new Error(`source catalog path missing for ${sourceId}`);
    return path.join(root, providerRelativePath(record.path, `${sourceId} catalog path`).replaceAll("/", path.sep));
}

function buildEvidence({
    gcsimRoot = process.env.GCSIM_ROOT || "",
    sourceCatalogPath = defaultSourceCatalogPath,
    dataRoot = defaultDataRoot
} = {}) {
    if (!gcsimRoot) throw new Error("gcsimRoot is required (set GCSIM_ROOT or pass --gcsim-root)");
    const sourceCatalog = readJson(sourceCatalogPath);
    const specs = readJson(path.join(dataRoot, "v2", "weapons", "spec-candidates.json"));
    const records = {};
    Object.keys(BUILDERS).sort(sortNatural).forEach((weaponId) => {
        const builder = BUILDERS[weaponId];
        const record = builder({ sourceCatalog, root: gcsimRoot, specs });
        // The builder reads the expected catalog path; this second check keeps
        // the output honest if a future builder accidentally opens another file.
        const expected = sourcePathFor(gcsimRoot, sourceCatalog, record.sourceRecordId);
        const actualSha = sha256(fs.readFileSync(expected));
        if (actualSha !== record.sha256) throw new Error(`${record.sourceRecordId}: source bytes changed during extraction`);
        records[record.sourceRecordId] = record;
    });
    // Materialize the same evidence at the v2 claim-field granularity used by
    // the verification contract.  A value assignment is also a refinement
    // record; explicit target/activation/unit records are emitted only when
    // the extractor has a structured value for that field.  Existing specs
    // remain read-only inputs and are never rewritten here.
    Object.values(records).forEach((record) => {
        const original = [...record.fields];
        const existing = new Set(original.map((field) => `${field.candidateId || ""}:${field.field}`));
        const append = (field, base, status, structuredValue, reason = null) => {
            const key = `${base.candidateId || ""}:${field}`;
            if (existing.has(key) || structuredValue === undefined || structuredValue === null) return;
            existing.add(key);
            const copy = {
                ...clone(base),
                field,
                status,
                sourceField: `${base.sourceField || ""}${base.sourceField ? ":" : ""}${field}`,
                structuredValue: clone(structuredValue),
                value: clone(structuredValue),
                reason: reason || base.reason || undefined,
                claimComparison: null,
                extractionMethod: {
                    ...clone(base.extractionMethod),
                    type: field === "refinement" ? "semantic-go-refinement-projection" : "semantic-go-field-projection",
                    projectedFrom: base.field
                },
                supportsClaimValue: status === "eligible" && ["refinement", "unit", "duration", "stack"].includes(field),
                gameVersionVerified: false,
                providerIndependence: "independent",
                independenceGroup: record.independenceGroup,
                claimComparison: compareClaim(candidateClaim(specs, base.candidateId), {
                    field,
                    structuredValue,
                    unit: base.unit,
                    targets: base.targets,
                    activation: base.activation
                })
            };
            record.fields.push(copy);
        };
        original.forEach((base) => {
            if (!base.candidateId || base.structuredValue === undefined || base.structuredValue === null) return;
            if (base.field === "value") {
                append("refinement", base, base.status, base.structuredValue);
                if (base.targets) append("targets", base, base.status === "eligible" ? "eligible" : "needsReview", base.targets, base.status === "eligible" ? null : "Target scope is retained as review-gated evidence.");
                if (base.activation) {
                    const activationStatus = base.claimComparison?.activationMatch === true ? "eligible" : "needsReview";
                    append("activation", base, activationStatus, base.activation, activationStatus === "eligible" ? null : "Source activation differs from or is richer than the existing candidate claim.");
                }
                if (base.units) append("unit", base, "eligible", base.units);
            }
        });
    });
    const fields = Object.values(records).flatMap((record) => record.fields);
    const unresolved = fields.filter((field) => field.status === "needsReview");
    const eligible = fields.filter((field) => field.status === "eligible");
    const supportsClaimValue = fields.filter((field) => field.supportsClaimValue === true);
    const unmapped = Object.values(records).flatMap((record) => record.unmappedSourceFields);
    const sourceCatalogDigest = sha256(fs.readFileSync(sourceCatalogPath));
    return {
        schemaVersion: 1,
        evidence: "genshin-weapon-gcsim-field-evidence",
        generator: GENERATOR_VERSION,
        generatedAt: "2026-08-16T00:00:00.000Z",
        methodology: {
            extraction: "Named Go assignments and surrounding event/attribute branches only; no free numeric-token matching.",
            refinement: "Expressions are evaluated at gcsim WeaponProfile.Refine values 1..5.",
            units: "Attribute percentages are normalized to percent; EM remains flat; frame constants are normalized to seconds.",
            canonicalization: "This artifact never changes v2 specs and canonicalEligibility is false for every field.",
            gameVersion: "The pinned repository revision/file digest is retained, but source-catalog records contain no Genshin game patch/version; this blocks canonical promotion."
        },
        input: {
            sourceCatalog: {
                path: path.relative(repositoryRoot, sourceCatalogPath).replaceAll(path.sep, "/"),
                sha256: sourceCatalogDigest,
                capturedAt: sourceCatalog.capturedAt || null
            },
            candidateSpecs: {
                path: "games/genshin/data/v2/weapons/spec-candidates.json",
                sha256: sha256(fs.readFileSync(path.join(dataRoot, "v2", "weapons", "spec-candidates.json")))
            }
        },
        sourceProvider: sourceCatalog.sources?.gcsim ? {
            provider: sourceCatalog.sources.gcsim.provider,
            repository: sourceCatalog.sources.gcsim.repository,
            revision: sourceCatalog.sources.gcsim.revision,
            independenceGroup: sourceCatalog.sources.gcsim.independenceGroup || "gcsim-implementation",
            gameVersion: null,
            gameVersionEvidence: { status: "missing", note: "Revision is pinned but no game patch/version is declared." }
        } : null,
        records,
        summary: {
            sourceRecords: Object.keys(records).length,
            fieldRecords: fields.length,
            eligibleFields: eligible.length,
            eligibleButCanonicalBlocked: eligible.length,
            supportsClaimValueFields: supportsClaimValue.length,
            candidateValueAgreements: supportsClaimValue.filter((field) => field.claimComparison?.valueMatch === true).length,
            candidateValueConflicts: supportsClaimValue.filter((field) => field.claimComparison?.valueMatch === false).length,
            needsReviewFields: unresolved.length,
            unresolvedFields: unresolved.length + unmapped.filter((field) => field.mapping?.status === "schemaGap").length,
            ancillarySourceFields: unmapped.length,
            registryMappedSourceFields: unmapped.filter((field) => field.mapping?.status === "registryLifecycleMapped").length,
            schemaGapSourceFields: unmapped.filter((field) => field.mapping?.status === "schemaGap").length,
            unmappedSourceFields: unmapped.filter((field) => !field.mapping?.status).length,
            canonicalEligibleFields: fields.filter((field) => field.canonicalEligibility).length,
            canonicalEligibleCandidates: 0,
            gameVersionMissingSourceRecords: Object.values(records).filter((record) => !record.gameVersion).length,
            fieldStatusCounts: Object.fromEntries(["eligible", "needsReview"].map((status) => [status, fields.filter((field) => field.status === status).length]))
        }
    };
}

function writeEvidence(evidence, outputPath = defaultOutputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
    return outputPath;
}

function parseArgs(argv) {
    const args = { gcsimRoot: process.env.GCSIM_ROOT || "", outputPath: defaultOutputPath, sourceCatalogPath: defaultSourceCatalogPath, dataRoot: defaultDataRoot };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--gcsim-root") args.gcsimRoot = argv[++i];
        else if (arg === "--output") args.outputPath = path.resolve(argv[++i]);
        else if (arg === "--source-catalog") args.sourceCatalogPath = path.resolve(argv[++i]);
        else if (arg === "--data-root") args.dataRoot = path.resolve(argv[++i]);
        else if (arg === "--help") args.help = true;
        else throw new Error(`unknown argument: ${arg}`);
    }
    return args;
}

if (require.main === module) {
    try {
        const args = parseArgs(process.argv.slice(2));
        if (args.help) {
            console.log("Usage: node scripts/genshinWeaponGcsimEvidenceGenerate.cjs --gcsim-root <pinned-gcsim-checkout> [--output <path>]");
            process.exit(0);
        }
        const evidence = buildEvidence(args);
        const output = writeEvidence(evidence, args.outputPath);
        console.log(JSON.stringify({ output, summary: evidence.summary }, null, 2));
    } catch (error) {
        console.error(error.stack || error.message);
        process.exitCode = 1;
    }
}

module.exports = {
    BUILDERS,
    GENERATOR_VERSION,
    buildEvidence,
    writeEvidence,
    evaluateArithmetic,
    percentageValues,
    flatValues,
    framesToSeconds,
    locate,
    stableJson
};
