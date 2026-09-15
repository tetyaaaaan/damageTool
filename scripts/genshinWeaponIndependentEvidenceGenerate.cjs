"use strict";

/**
 * Build a read-only, field-level evidence bridge between the pinned official
 * HoYoLAB material and the independent gcsim extraction for the nine weapon
 * pilots.  This artifact is deliberately not a verification artifact: it
 * preserves the two sides, version gaps, semantic mismatches, and the exact
 * runtime destination without promoting any candidate.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const repositoryRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultExternalEvidencePath = path.join(dataRoot, "v2", "weapons", "external-evidence.json");
const defaultSpecPath = path.join(dataRoot, "v2", "weapons", "spec-candidates.json");
const defaultOfficialPilotPath = path.join(dataRoot, "v2", "weapons", "official-pilot.json");
const defaultOutputPath = path.join(dataRoot, "v2", "weapons", "independent-field-evidence.json");
const GENERATOR_VERSION = "genshinWeaponIndependentEvidenceGenerate/1";
const GENERATED_AT = "2026-08-23T00:00:00Z";

const WEAPON_CONFIG = {
    "11503": {
        name: "Freedom-Sworn",
        officialSourceIds: ["hoyolab:article:415463", "hoyolab:article:491022"],
        batch: "pilot-primary",
        notes: ["Official Version 1.6 material identifies the weapon but does not publish its numeric passive/refinement table."]
    },
    "11509": {
        name: "Mistsplitter Reforged",
        officialSourceIds: ["hoyolab:article:578314"],
        batch: "versioned-primary",
        claims: [
            {
                candidateId: "w_11509_damageBonus_ae1b42da",
                field: "stack",
                structuredValue: { min: 0, max: 3 },
                originalText: "Gain up to 3 stacks of Mistsplitter's Emblems.",
                notes: "The official text supports the maximum stack count, not the complete refinement value table."
            }
        ],
        notes: ["Official Version 2.0 material states the three-stack triggers and element scope, but the indexed excerpt has no numeric refinement table."]
    },
    "11518": {
        name: "Athame Artis",
        officialSourceIds: ["hoyolab:article:42528497"],
        batch: "versioned-primary",
        notes: ["Official Version Luna III material identifies Athame Artis as a new sword; numeric effect text is image-backed and not safely materialized here."]
    },
    "12402": {
        name: "The Bell",
        officialSourceIds: ["hoyolab:article:31070419"],
        batch: "legacy-identity",
        notes: ["The official Version 4.8 wish notice establishes weapon identity/version only; it does not publish the passive numeric fields."]
    },
    "12430": {
        name: "Fruitful Hook",
        officialSourceIds: ["hoyolab:article:37812874"],
        batch: "versioned-primary",
        notes: ["The official Version 5.5 wish notice establishes weapon identity/version only; it does not publish the passive numeric fields."]
    },
    "14402": {
        name: "The Widsith",
        officialSourceIds: ["hoyolab:article:24708380"],
        batch: "legacy-identity",
        notes: ["The official Version 4.4 wish notice establishes weapon identity/version only; it does not publish the passive numeric fields."]
    },
    "15402": {
        name: "The Stringless",
        officialSourceIds: ["hoyolab:article:24708380"],
        batch: "legacy-identity",
        notes: ["The official Version 4.4 wish notice establishes weapon identity/version only; it does not publish the passive numeric fields."]
    },
    "15502": {
        name: "Amos' Bow",
        officialSourceIds: ["hoyolab:article:111067"],
        batch: "pilot-primary",
        notes: ["The official Version 1.2 patch notes explicitly state the revised R1 effect and stack cap, but not the complete refinement table."]
    },
    "15516": {
        name: "Golden Frostbound Oath",
        officialSourceIds: ["hoyolab:article:44539280"],
        batch: "versioned-primary",
        claims: [
            { candidateId: "w_15516_stat_1", field: "value", structuredValue: { "1": 16 }, originalText: "Increases DEF by 16%.", notes: "R1 value is explicit; the complete refinement table is not in the official excerpt." },
            { candidateId: "w_15516_damage_2", field: "value", structuredValue: { "1": 40 }, originalText: "Geo DMG inflicted by the equipping character increases by 40%.", notes: "R1 self Geo value is explicit; the complete refinement table is not in the official excerpt." },
            { candidateId: "w_15516_reaction_bonus_3", field: "value", structuredValue: { "1": 40 }, originalText: "Lunar-Crystallize Reaction DMG increases by 40%.", notes: "R1 self reaction value is explicit; the complete refinement table is not in the official excerpt." },
            { candidateId: "w_15516_damage_5", field: "value", structuredValue: { "1": 20 }, originalText: "All other nearby party members will gain ... Geo DMG dealt increases by 20%.", notes: "R1 party Geo value is explicit, but the candidate scope/trigger remains review-gated." },
            { candidateId: "w_15516_reaction_bonus_4", field: "value", structuredValue: { "1": 20 }, originalText: "All other nearby party members will gain ... Lunar-Crystallize Reaction DMG increases by 20%.", notes: "R1 party reaction value is explicit, but the candidate scope/trigger remains review-gated." }
        ],
        notes: ["The official Version Luna VI update details explicitly publish R1 values; refinement ranks 2-5 and full trigger semantics remain unverified."]
    }
};

const OFFICIAL_SOURCE_DETAILS = {
    "hoyolab:article:415463": {
        provider: "Genshin Impact Official / HoYoLAB", role: "officialPrimary", domain: "hoyolab.com", independenceGroup: "official-genshin-hoyolab",
        url: "https://www.hoyolab.com/article/415463", title: "Midsummer Island Adventure Version 1.6 Update Notice", publishedAt: "2021-06-07", gameVersion: "1.6",
        explicitText: "Version 1.6", excerpt: "New Weapons: Freedom-Sworn (5-Star Sword)."
    },
    "hoyolab:article:491022": {
        provider: "Genshin Impact Official / HoYoLAB", role: "officialPrimary", domain: "hoyolab.com", independenceGroup: "official-genshin-hoyolab",
        url: "https://www.hoyolab.com/article/491022", title: "Version 1.6 Midsummer Island Adventure New Weapon Overview Part II", publishedAt: "2021-06-27", gameVersion: "1.6",
        explicitText: "Version 1.6", excerpt: "New Weapon Overview Part II ... Freedom-Sworn (Sword)."
    },
    "hoyolab:article:578314": {
        provider: "Genshin Impact Official / HoYoLAB", role: "officialPrimary", domain: "hoyolab.com", independenceGroup: "official-genshin-hoyolab",
        url: "https://www.hoyolab.com/article/578314", title: "Version 2.0 The Immovable God and the Eternal Euthymia Update Details Part 1", publishedAt: "2021-07-20", gameVersion: "2.0",
        explicitText: "Version 2.0", excerpt: "Gain up to 3 stacks of Mistsplitter's Emblems."
    },
    "hoyolab:article:42528497": {
        provider: "Genshin Impact Official / HoYoLAB", role: "officialPrimary", domain: "hoyolab.com", independenceGroup: "official-genshin-hoyolab",
        url: "https://www.hoyolab.com/article/42528497", title: "A Nocturne of the Far North Version Luna III New Weapon Overview", publishedAt: "2025-11-28", gameVersion: "Luna III",
        explicitText: "Version Luna III", excerpt: "During this period, weapons such as the Athame Artis (Sword) ... will receive a huge drop-rate boost."
    },
    "hoyolab:article:31070419": {
        provider: "Genshin Impact Official / HoYoLAB", role: "officialPrimary", domain: "hoyolab.com", independenceGroup: "official-genshin-hoyolab",
        url: "https://www.hoyolab.com/article/31070419", title: "Version 4.8 Event Wishes Notice Phase I", publishedAt: "2024-07-15", gameVersion: "4.8",
        explicitText: "Version 4.8", excerpt: "The Bell (Claymore) ... will receive a huge drop-rate boost."
    },
    "hoyolab:article:37812874": {
        provider: "Genshin Impact Official / HoYoLAB", role: "officialPrimary", domain: "hoyolab.com", independenceGroup: "official-genshin-hoyolab",
        url: "https://www.hoyolab.com/article/37812874", title: "Version 5.5 Event Wishes Notice Phase I", publishedAt: "2025-03-24", gameVersion: "5.5",
        explicitText: "Version 5.5", excerpt: "The event-exclusive 4-star weapons ... Fruitful Hook (Claymore) ... will receive a huge drop-rate boost."
    },
    "hoyolab:article:24708380": {
        provider: "Genshin Impact Official / HoYoLAB", role: "officialPrimary", domain: "hoyolab.com", independenceGroup: "official-genshin-hoyolab",
        url: "https://www.hoyolab.com/article/24708380", title: "Version 4.4 Event Wishes Notice Phase II", publishedAt: "2024-01-30", gameVersion: "4.4",
        explicitText: "Version 4.4", excerpt: "The Widsith (Catalyst) and The Stringless (Bow) ... will receive a huge drop-rate boost."
    },
    "hoyolab:article:111067": {
        provider: "Genshin Impact Official / HoYoLAB", role: "officialPrimary", domain: "hoyolab.com", independenceGroup: "official-genshin-hoyolab",
        url: "https://www.hoyolab.com/article/111067?crawler=Googlebot", title: "The Chalk Prince and the Dragon Version 1.2 Update Details Part 3", publishedAt: "2020-12-22", gameVersion: "1.2",
        explicitText: "Version 1.2", excerpt: "Amos' Bow Weapon Effect — New Description: Increases Normal and Charged Attack DMG by 12%."
    },
    "hoyolab:article:44539280": {
        provider: "Genshin Impact Official / HoYoLAB", role: "officialPrimary", domain: "hoyolab.com", independenceGroup: "official-genshin-hoyolab",
        url: "https://www.hoyolab.com/article/44539280", title: "Song of the Welkin Moon: Rondo — Augured Homecoming Version Luna VI Update Details", publishedAt: "2026-04-01", gameVersion: "Luna VI",
        explicitText: "Version Luna VI", excerpt: "Examples based on Refinement Rank 1: Increases DEF by 16%."
    }
};

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function stableClone(value) {
    if (Array.isArray(value)) return value.map(stableClone);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableClone(value[key])]));
}
function stableJson(value) { return JSON.stringify(stableClone(value)); }
function unique(values) { return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))]; }
function portable(value) { return typeof value === "string" && value.length > 0 && !path.isAbsolute(value) && !/^[A-Za-z]:[\\/]/.test(value) && !value.startsWith("\\\\") && !value.split(/[\\/]/).includes(".."); }
function equal(a, b) { return stableJson(a) === stableJson(b); }

function subset(expected, actual) {
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
        if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
        return Object.keys(expected).every((key) => Object.prototype.hasOwnProperty.call(actual, key) && subset(expected[key], actual[key]));
    }
    return equal(expected, actual);
}

function compareExpected(expected, actual) {
    if (expected === undefined || expected === null) return { status: "notComparable", matchedRanks: [], mismatchedRanks: [] };
    if (equal(expected, actual)) return { status: "fullMatch", matchedRanks: [], mismatchedRanks: [] };
    if (subset(expected, actual)) {
        const expectedRanks = expected && typeof expected === "object" && !Array.isArray(expected) ? Object.keys(expected).filter((key) => /^\d+$/.test(key)) : [];
        return { status: "partialMatch", matchedRanks: expectedRanks, mismatchedRanks: [] };
    }
    if (expected && actual && typeof expected === "object" && typeof actual === "object" && !Array.isArray(expected) && !Array.isArray(actual)) {
        const expectedRanks = Object.keys(expected).filter((key) => /^\d+$/.test(key));
        const matchedRanks = expectedRanks.filter((key) => equal(expected[key], actual[key]));
        return { status: "mismatch", matchedRanks, mismatchedRanks: expectedRanks.filter((key) => !matchedRanks.includes(key)) };
    }
    return { status: "mismatch", matchedRanks: [], mismatchedRanks: [] };
}

function fieldSpecValue(spec, field) {
    const effect = spec?.effect || {};
    if (field === "value" || field === "refinement") return clone(effect.valueByRefinement || effect.value || null);
    if (field === "unit") return effect.unit || null;
    if (field === "targets") return clone(effect.targets || null);
    if (field === "activation") return clone(effect.activation || null);
    if (field === "duration") return effect.durationSeconds === undefined ? null : { seconds: effect.durationSeconds };
    if (field === "stack") return clone(effect.stack || null);
    return null;
}

function comparableSpecValue(field, value) {
    if (field !== "activation" || !value || typeof value !== "object" || Array.isArray(value)) return value;
    const normalized = clone(value);
    delete normalized.calculationSupport;
    delete normalized.uidHandling;
    return normalized;
}

function sourceFromPilot(pilotSource, fallback) {
    const text = pilotSource?.snapshot?.text || fallback.excerpt;
    return {
        sourceId: pilotSource?.id || fallback.sourceId,
        provider: pilotSource?.provider || fallback.provider,
        role: pilotSource?.role || fallback.role,
        independenceGroup: pilotSource?.independenceGroup || fallback.independenceGroup,
        domain: pilotSource?.domain || fallback.domain,
        url: pilotSource?.url || fallback.url,
        title: pilotSource?.title || fallback.title,
        publishedAt: pilotSource?.publishedAt || fallback.publishedAt,
        revision: pilotSource?.revision || null,
        revisionKind: pilotSource?.revisionKind || null,
        gameVersion: pilotSource?.gameVersion || fallback.gameVersion || null,
        gameVersionEvidence: clone(pilotSource?.gameVersionEvidence || {
            status: "explicit", kind: "releaseNotesWithExplicitGameVersion", explicitText: fallback.explicitText,
            locator: { dataset: "hoyolabArticle", record: fallback.sourceId.split(":").pop(), field: "titleAndArticleBody" }
        }),
        contentRevisionPinned: pilotSource?.contentRevisionPinned === true,
        identityPinned: pilotSource?.identityPinned !== false,
        excerpt: text,
        excerptIntegrity: { algorithm: "sha256", digest: sha256(Buffer.from(text, "utf8")) },
        fieldScope: clone(pilotSource?.fieldScope || [])
    };
}

function staticSource(sourceId) {
    const detail = OFFICIAL_SOURCE_DETAILS[sourceId];
    if (!detail) throw new Error(`official source definition missing: ${sourceId}`);
    const text = detail.excerpt;
    return {
        sourceId,
        provider: detail.provider,
        role: detail.role,
        independenceGroup: detail.independenceGroup,
        domain: detail.domain,
        url: detail.url,
        title: detail.title,
        publishedAt: detail.publishedAt,
        revision: `hoyolab-article-${sourceId.split(":").pop()}`,
        revisionKind: "hoyolabArticleId",
        gameVersion: detail.gameVersion,
        gameVersionEvidence: {
            status: "explicit", kind: "releaseNotesWithExplicitGameVersion", explicitText: detail.explicitText,
            locator: { dataset: "hoyolabArticle", record: sourceId.split(":").pop(), field: "titleAndArticleBody" }
        },
        contentRevisionPinned: false,
        identityPinned: true,
        excerpt: text,
        excerptIntegrity: { algorithm: "sha256", digest: sha256(Buffer.from(text, "utf8")) },
        fieldScope: []
    };
}

function officialSourcesFor(config, pilot) {
    return config.officialSourceIds.map((sourceId) => {
        const pilotSource = pilot?.sources?.[sourceId];
        if (pilotSource) {
            const fallback = OFFICIAL_SOURCE_DETAILS[sourceId] ? staticSource(sourceId) : {
                sourceId,
                provider: pilotSource.provider || "Genshin Impact Official / HoYoLAB",
                role: pilotSource.role || "officialPrimary",
                domain: pilotSource.domain || "hoyolab.com",
                independenceGroup: pilotSource.independenceGroup || "official-genshin-hoyolab",
                url: pilotSource.url || null,
                title: pilotSource.title || sourceId,
                publishedAt: pilotSource.publishedAt || null,
                gameVersion: pilotSource.gameVersion || null,
                explicitText: pilotSource.gameVersionEvidence?.explicitText || null,
                excerpt: pilotSource.snapshot?.text || sourceId
            };
            return sourceFromPilot(pilotSource, { ...fallback, sourceId });
        }
        return staticSource(sourceId);
    });
}

function pilotClaimsFor(config, weaponId, pilot) {
    const pilotRecord = pilot?.records?.[weaponId];
    const claims = [];
    for (const claim of pilotRecord?.officialClaims || []) {
        claims.push({
            candidateId: claim.candidateId,
            field: claim.field,
            structuredValue: clone(claim.structuredValue),
            unit: claim.unit || null,
            targets: clone(claim.targets || null),
            activation: clone(claim.activation || null),
            sourceId: claim.sourceId,
            refinementRanks: clone(claim.scope?.refinementRanks || []),
            completeRefinementTable: claim.scope?.completeRefinementTable === true,
            originalText: claim.notes || null,
            notes: claim.notes || null
        });
    }
    for (const claim of config.claims || []) claims.push(clone(claim));
    return claims;
}

function findClaim(claims, candidateId, field) {
    return claims.find((claim) => claim.candidateId === candidateId && (claim.field === field || (claim.field === "value" && ["value", "refinement"].includes(field)))) || null;
}

function dedupeFields(fields) {
    const map = new Map();
    for (const field of fields || []) {
        const key = `${field.candidateId || "unmapped"}:${field.field || "unknown"}`;
        if (!map.has(key)) map.set(key, field);
    }
    return [...map.values()];
}

function sourceBRecord(external) {
    const source = external.sourceRecord || {};
    const locators = [];
    for (const field of external.fields || []) {
        const locator = field.locator;
        if (!locator?.anchor) continue;
        const key = `${locator.lineStart}:${locator.lineEnd}:${locator.anchor}`;
        if (!locators.some((item) => item.key === key)) locators.push({ key, lineStart: locator.lineStart, lineEnd: locator.lineEnd, anchor: locator.anchor });
    }
    return {
        sourceId: external.sourceRecordId,
        role: "independentImplementation",
        provider: external.provider,
        repository: external.repository,
        independenceGroup: external.independenceGroup || source.independenceGroup || "gcsim-implementation",
        revision: external.revision,
        revisionKind: "gitCommit",
        path: external.path,
        sha256: external.sha256,
        gameVersion: external.gameVersion || null,
        gameVersionEvidence: clone(external.gameVersionEvidence || { status: "missing" }),
        revisionVerified: external.revisionVerified === true,
        originalText: locators.map(({ key, ...locator }) => ({ locator, excerpt: locator.anchor }))
    };
}

function sourceACard(sources, claims) {
    const gameVersions = unique(sources.map((source) => source.gameVersion));
    return {
        sourceIds: sources.map((source) => source.sourceId),
        role: "officialPrimary",
        provider: unique(sources.map((source) => source.provider)).join(" + "),
        independenceGroup: unique(sources.map((source) => source.independenceGroup)).join(" + "),
        gameVersions,
        exactGameVersion: gameVersions.length === 1 ? gameVersions[0] : null,
        gameVersionStatus: sources.every((source) => source.gameVersionEvidence?.status === "explicit") ? "explicit" : "blocked",
        sources,
        claims
    };
}

function sourceTextForField(sourceA, claim, candidateId) {
    const scoped = sourceA.sources.filter((source) => source.fieldScope?.includes(candidateId));
    const selected = scoped.length ? scoped : sourceA.sources;
    const text = selected.map((source) => ({ sourceId: source.sourceId, excerpt: source.excerpt }));
    if (claim?.originalText) text.push({ sourceId: claim.sourceId || sourceA.sourceIds[0], excerpt: claim.originalText });
    return text;
}

function comparisonFor({ field, external, spec, sourceA, claims }) {
    const candidateId = field.candidateId || null;
    const claim = findClaim(claims, candidateId, field.field);
    const extractedValueB = clone(field.structuredValue);
    const extractedValueA = claim ? clone(claim.structuredValue) : null;
    const sourceAgreement = compareExpected(extractedValueA, extractedValueB);
    const specValue = fieldSpecValue(spec, field.field);
    const specAgreement = compareExpected(comparableSpecValue(field.field, specValue), comparableSpecValue(field.field, extractedValueB));
    const humanReasons = [];
    const machineReasons = ["independentImplementationGameVersionMissing", "canonicalPromotionForbidden"];
    if (!claim) machineReasons.push("officialFieldValuesMissing");
    else if (sourceAgreement.status === "mismatch") humanReasons.push("officialGcsimValueMismatch");
    else if (sourceAgreement.status === "partialMatch" && claim.completeRefinementTable !== true) machineReasons.push("officialRefinementTableMissing");
    const sourceReason = String(field.reason || "");
    const genericActivationNote = /source activation differs from or is richer than the existing candidate claim/i.test(sourceReason);
    const semanticReason = Boolean(sourceReason) && !genericActivationNote;
    if (field.status === "needsReview" && semanticReason) humanReasons.push("gcsimFieldNeedsReview");
    if (semanticReason) humanReasons.push("semanticMappingNeedsReview");
    if (specAgreement.status === "mismatch") humanReasons.push("gcsimSpecValueMismatch");
    // A fixed gcsim revision is not a gameVersion binding. Keep semantic/value
    // conflicts as deferred evidence, but do not ask for human judgment until
    // the independent implementation is tied to the target game version.
    const humanReviewDeferredByVersionGate = !sourceA.exactGameVersion || !external.gameVersion || sourceA.exactGameVersion !== external.gameVersion;
    if (humanReviewDeferredByVersionGate) machineReasons.push("humanReviewDeferredUntilGameVersionBinding");
    const immediateHumanReasons = humanReviewDeferredByVersionGate ? [] : humanReasons;
    const blockedReasons = unique([...machineReasons, ...humanReasons, "independentReviewRequired"]);
    const runtime = {
        destination: clone(spec?.destination || null),
        modifierIds: clone(spec?.runtime?.modifierIds || []),
        supersedesLegacyModifierIds: clone(spec?.runtime?.supersedesLegacyModifierIds || spec?.supersedesLegacyModifierIds || spec?.supersedes || []),
        status: spec?.runtime?.status || "blocked",
        blockedReasons: clone(spec?.runtime?.blockedReasons || [])
    };
    return {
        candidateId,
        field: field.field,
        status: "needsReview",
        verificationStatus: "needsReview",
        canonicalEligibility: false,
        originalText: {
            sourceA: sourceTextForField(sourceA, claim, candidateId),
            sourceB: [{ sourceId: external.sourceRecordId, path: external.path, locator: clone(field.locator), excerpt: field.locator?.anchor || null }]
        },
        gameVersion: {
            target: sourceA.exactGameVersion,
            sourceA: sourceA.exactGameVersion,
            sourceB: external.gameVersion || null,
            exactMatch: Boolean(sourceA.exactGameVersion && external.gameVersion && sourceA.exactGameVersion === external.gameVersion),
            status: "blocked",
            blockedReasons: ["independentImplementationGameVersionMissing"]
        },
        extractedValueA,
        extractedValueB,
        specValue,
        unit: { sourceA: claim?.unit || null, sourceB: field.unit || null, spec: spec?.effect?.unit || null },
        targets: { sourceA: clone(claim?.targets || null), sourceB: clone(field.targets || null), spec: clone(spec?.effect?.targets || null) },
        activation: { sourceA: clone(claim?.activation || null), sourceB: clone(field.activation || null), spec: clone(spec?.effect?.activation || null) },
        match: {
            sourceAgreement: sourceAgreement.status,
            sourceAgreementMatchedRanks: sourceAgreement.matchedRanks,
            sourceAgreementMismatchedRanks: sourceAgreement.mismatchedRanks,
            specAgreement: specAgreement.status,
            specAgreementMatchedRanks: specAgreement.matchedRanks,
            specAgreementMismatchedRanks: specAgreement.mismatchedRanks
        },
        correlation: {
            sameProvider: false,
            sameIndependenceGroup: false,
            derivedFromSameDatamine: false,
            independentProviderPair: true,
            status: "independent-but-version-unmatched",
            excludedLineages: ["GenshinData-derived", "third-party-HoYoLAB-guide"],
            note: "The official source is a HoYoLAB first-party post; gcsim is a separate implementation. No derived datamine or repost is counted as source B."
        },
        interpretationNotes: unique([
            claim?.notes,
            field.reason,
            field.extractionMethod?.note,
            sourceAgreement.status === "partialMatch" ? "Only the explicitly published official subset matches; unlisted refinement ranks remain unproven." : null,
            specAgreement.status === "mismatch" ? "The extracted implementation value or scope differs from the existing Spec and must not be silently rewritten." : null
        ]),
        runtime,
        review: {
            humanJudgmentRequiredNow: immediateHumanReasons.length > 0,
            machineFollowUpRequired: machineReasons.length > 0,
            humanReasons: immediateHumanReasons,
            deferredHumanReasons: humanReviewDeferredByVersionGate ? humanReasons : [],
            machineReasons,
            humanReviewDeferredByVersionGate
        },
        blockedReasons,
        recommendedDecision: immediateHumanReasons.length > 0 ? "hold_and_investigate" : "retain_needsReview_until_version_and_independent_review"
    };
}

function buildEvidence({ externalEvidence, specs, officialPilot } = {}) {
    if (!externalEvidence || externalEvidence.evidence !== "genshin-weapon-gcsim-field-evidence") throw new Error("invalid gcsim external evidence input");
    const records = {};
    const sourceIds = Object.keys(externalEvidence.records || {}).sort((a, b) => String(a).localeCompare(String(b), "en", { numeric: true }));
    for (const sourceId of sourceIds) {
        const external = externalEvidence.records[sourceId];
        const weaponId = String(external.entity?.id || sourceId.split(":").pop());
        const config = WEAPON_CONFIG[weaponId];
        if (!config) throw new Error(`unexpected gcsim pilot weapon: ${weaponId}`);
        const officialSources = officialSourcesFor(config, officialPilot);
        const claims = pilotClaimsFor(config, weaponId, officialPilot);
        const sourceA = sourceACard(officialSources, claims);
        const sourceB = sourceBRecord(external);
        const specFields = dedupeFields(external.fields).map((field) => ({
            ...field,
            comparison: comparisonFor({ field, external, spec: specs[field.candidateId] || {}, sourceA, claims })
        }));
        const comparisons = specFields.map((field) => field.comparison);
        const blockedReasons = unique(comparisons.flatMap((comparison) => comparison.blockedReasons));
        records[weaponId] = {
            weaponId,
            name: config.name,
            batch: config.batch,
            target: { kind: "weapon", id: weaponId, name: config.name },
            originalText: {
                sourceA: officialSources.map((source) => ({ sourceId: source.sourceId, url: source.url, title: source.title, excerpt: source.excerpt, gameVersion: source.gameVersion })),
                sourceB: sourceB.originalText.map((item) => ({ sourceId: sourceB.sourceId, path: sourceB.path, locator: item.locator, excerpt: item.excerpt }))
            },
            sourceA,
            sourceB,
            gameVersion: {
                target: sourceA.exactGameVersion,
                official: sourceA.exactGameVersion,
                independentImplementation: sourceB.gameVersion,
                exactBinding: false,
                status: "blocked",
                blockedReasons: ["independentImplementationGameVersionMissing"]
            },
            sourceCorrelation: {
                providerPair: [sourceA.provider, sourceB.provider],
                independenceGroups: [sourceA.independenceGroup, sourceB.independenceGroup],
                independent: sourceA.independenceGroup !== sourceB.independenceGroup && sourceA.provider !== sourceB.provider,
                derivedFromSameDatamine: false,
                status: "independent-but-version-unmatched",
                excludedSources: ["theBowja/genshin-db", "GenshinData-derived projections", "third-party HoYoLAB guides"]
            },
            fieldComparisons: comparisons,
            runtimeApplication: {
                destinations: unique(comparisons.map((comparison) => JSON.stringify(comparison.runtime.destination)).filter(Boolean)).map((value) => JSON.parse(value)),
                modifierIds: unique(comparisons.flatMap((comparison) => comparison.runtime.modifierIds || [])),
                supersedesLegacyModifierIds: unique(comparisons.flatMap((comparison) => comparison.runtime.supersedesLegacyModifierIds || [])),
                statuses: unique(comparisons.map((comparison) => comparison.runtime.status)),
                canonicalPromotion: "forbidden"
            },
            reviewDisposition: {
                humanJudgmentRequiredNow: comparisons.some((comparison) => comparison.review.humanJudgmentRequiredNow),
                machineFollowUpRequired: comparisons.some((comparison) => comparison.review.machineFollowUpRequired),
                humanFieldCount: comparisons.filter((comparison) => comparison.review.humanJudgmentRequiredNow).length,
                machineFieldCount: comparisons.filter((comparison) => comparison.review.machineFollowUpRequired && !comparison.review.humanJudgmentRequiredNow).length,
                deferredHumanFieldCount: comparisons.filter((comparison) => (comparison.review.deferredHumanReasons || []).length > 0).length
            },
            status: "blocked",
            canonicalEligibility: false,
            blockedReasons,
            notes: config.notes,
            recommendedDecision: "retain_all_candidates_as_needsReview; do_not_promote"
        };
    }
    const fields = Object.values(records).flatMap((record) => record.fieldComparisons);
    const batches = {
        "pilot-primary": { id: "pilot-primary", purpose: "Official numeric pilot evidence versus gcsim; version gap remains explicit.", weaponIds: ["11503", "15502"] },
        "versioned-primary": { id: "versioned-primary", purpose: "Newer weapon official release/update material with field-level comparison where R1 text exists.", weaponIds: ["11509", "11518", "12430", "15516"] },
        "legacy-identity": { id: "legacy-identity", purpose: "Official identity/version evidence; numeric field source is still absent from the first-party excerpt.", weaponIds: ["12402", "14402", "15402"] }
    };
    return {
        schemaVersion: 1,
        evidence: "genshin-weapon-independent-field-evidence",
        generator: GENERATOR_VERSION,
        generatedAt: GENERATED_AT,
        policy: {
            primarySourcesOnly: true,
            independentProviderPairRequired: true,
            sameDatamineOrRepostExcluded: true,
            canonicalPromotion: "forbidden",
            selfApprovalForbidden: true,
            noInferenceFromMissingGameVersion: true,
            allVerificationStatuses: "needsReview"
        },
        input: {
            externalEvidence: { path: "games/genshin/data/v2/weapons/external-evidence.json", sha256: sha256(Buffer.from(stableJson(externalEvidence), "utf8")), sourceGeneratedAt: externalEvidence.generatedAt || null },
            specCandidates: { path: "games/genshin/data/v2/weapons/spec-candidates.json", sha256: sha256(Buffer.from(stableJson(specs), "utf8")) },
            officialPilot: { path: "games/genshin/data/v2/weapons/official-pilot.json", sha256: sha256(Buffer.from(stableJson(officialPilot), "utf8")) }
        },
        reviewBatches: batches,
        records,
        summary: {
            records: Object.keys(records).length,
            expectedRecords: Object.keys(WEAPON_CONFIG).length,
            fieldComparisons: fields.length,
            officialGameVersionLinkedRecords: Object.values(records).filter((record) => Boolean(record.gameVersion.official)).length,
            independentGameVersionMissingRecords: Object.values(records).filter((record) => record.sourceB.gameVersion === null).length,
            independentProviderPairs: Object.values(records).filter((record) => record.sourceCorrelation.independent).length,
            sameDataminePairs: Object.values(records).filter((record) => record.sourceCorrelation.derivedFromSameDatamine).length,
            sourceAgreementFullMatches: fields.filter((field) => field.match.sourceAgreement === "fullMatch").length,
            sourceAgreementPartialMatches: fields.filter((field) => field.match.sourceAgreement === "partialMatch").length,
            sourceAgreementMismatches: fields.filter((field) => field.match.sourceAgreement === "mismatch").length,
            sourceAgreementNotComparable: fields.filter((field) => field.match.sourceAgreement === "notComparable").length,
            specAgreementMatches: fields.filter((field) => ["fullMatch", "partialMatch"].includes(field.match.specAgreement)).length,
            specAgreementMismatches: fields.filter((field) => field.match.specAgreement === "mismatch").length,
            humanJudgmentRequiredNow: fields.filter((field) => field.review.humanJudgmentRequiredNow).length,
            machineFollowUpOnly: fields.filter((field) => field.review.machineFollowUpRequired && !field.review.humanJudgmentRequiredNow).length,
            canonicalEligible: 0,
            verificationStatuses: { needsReview: fields.length },
            blocked: true
        }
    };
}

function parseArgs(argv) {
    const args = { externalEvidencePath: defaultExternalEvidencePath, specPath: defaultSpecPath, officialPilotPath: defaultOfficialPilotPath, outputPath: defaultOutputPath };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--external-evidence") args.externalEvidencePath = path.resolve(argv[++i]);
        else if (arg === "--specs") args.specPath = path.resolve(argv[++i]);
        else if (arg === "--official-pilot") args.officialPilotPath = path.resolve(argv[++i]);
        else if (arg === "--output") args.outputPath = path.resolve(argv[++i]);
        else if (arg === "--help") args.help = true;
        else throw new Error(`unknown argument: ${arg}`);
    }
    return args;
}

if (require.main === module) {
    try {
        const args = parseArgs(process.argv.slice(2));
        if (args.help) {
            console.log("Usage: node scripts/genshinWeaponIndependentEvidenceGenerate.cjs [--external-evidence <path>] [--specs <path>] [--official-pilot <path>] [--output <path>]");
            process.exit(0);
        }
        const artifact = buildEvidence({ externalEvidence: readJson(args.externalEvidencePath), specs: readJson(args.specPath), officialPilot: readJson(args.officialPilotPath) });
        fs.mkdirSync(path.dirname(args.outputPath), { recursive: true });
        fs.writeFileSync(args.outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
        console.log(JSON.stringify(artifact.summary, null, 2));
    } catch (error) {
        console.error(error.stack || error.message);
        process.exitCode = 1;
    }
}

module.exports = {
    WEAPON_CONFIG,
    OFFICIAL_SOURCE_DETAILS,
    buildEvidence,
    compareExpected,
    fieldSpecValue,
    stableJson
};
