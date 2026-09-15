"use strict";

/**
 * Persist the KQM Theorycrafting Library's two-piece artifact claims as an
 * evidence-only join against the local v2 EffectSpec candidates.
 *
 * KQM is a useful independent community-research lead, but the pinned TCL
 * commit/file does not carry an explicit Genshin patch binding.  The artifact
 * therefore deliberately remains evidenceOnlyBlocked/gameVersionUnbound.
 * Revision, Git blob, and raw-file SHA-256 are retained so a later provider
 * manifest can reopen exactly this batch without repeating extraction.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultDataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultCandidatesPath = path.join(
    defaultDataRoot,
    "v2",
    "artifacts",
    "spec-candidates.json"
);
const defaultOutputPath = path.join(
    defaultDataRoot,
    "v2",
    "external",
    "kqm-artifact-field-evidence.json"
);
const defaultReportJsonPath = path.join(
    repositoryRoot,
    "reports",
    "genshin-kqm-artifact-evidence.json"
);
const defaultReportMarkdownPath = path.join(
    repositoryRoot,
    "reports",
    "genshin-kqm-artifact-evidence.md"
);

const GENERATOR_VERSION = "genshinKqmArtifactEvidence/1";
const CAPTURED_AT = "2026-08-26T00:00:00.000Z";
const EXPECTED_COUNT = 50;
const TARGET_GAME_VERSION = "7.0";

const KQM = Object.freeze({
    provider: "KQM Theorycrafting Library",
    repository: "https://github.com/KQM-git/TCL",
    revision: "3d6f2fbcfdc5be69e279b732b17f2dea2be9f597",
    revisionKind: "gitCommit",
    revisionDate: "2026-08-18T09:32:22Z",
    path: "src/data/artifacts.json",
    blob: "a89e0819ba8438815568febdf5967d7f234c0aa8",
    fileSha256: "5cbc835f48bb6b81b33d07e379de9980aa9619855754a8c5417d387e6b81164d",
    gameVersion: null,
    gameVersionEvidence: {
        status: "missing",
        note: "The immutable KQM commit message says '7.0 data', but no provider-authored manifest or release artifact binds Genshin 7.0 to this artifact blob, raw digest, and normalized field digest. A commit message, date, or semantic content cannot substitute for strict gameVersion evidence."
    },
    providerIndependence: "independentCommunityResearch",
    independenceGroup: "KQM-community-research",
    lineage: "Community-submitted theorycrafting knowledge vetted by KQM theorycrafting editors; no GenshinData/HoYoWiki upstream is declared in this artifact.",
    pinAcquisition: {
        revision: "Pin the Git commit SHA and verify the commit tree entry for src/data/artifacts.json.",
        blob: "Read the commit tree entry and retain its Git blob SHA-1.",
        fileSha256: "Fetch raw UTF-8 bytes at the immutable commit URL and compute SHA-256 over the exact response bytes."
    },
    canonicalStatus: "evidenceOnlyBlocked",
    blockedReasons: ["gameVersionUnbound"],
    reopenTrigger: "A KQM provider-authored immutable release/manifest must bind this exact commit, artifact blob, raw-file digest, and normalized field digest to Genshin 7.0, or the contract must explicitly approve a different version-binding rule. Reopen also on disclosed lineage correlation, source revision/blob/digest change, field/condition discrepancy, or scope change."
});

const GENSHIN_DB = Object.freeze({
    provider: "theBowja/genshin-db",
    repository: "https://github.com/theBowja/genshin-db",
    revision: "8b15995fa220c88a4d0d7ffe1e21b041d0b32588",
    revisionKind: "gitCommit",
    gameVersion: TARGET_GAME_VERSION,
    gameVersionEvidence: {
        kind: "providerDatasetManifest",
        gameVersion: TARGET_GAME_VERSION,
        locator: {
            dataset: "theBowja/genshin-db package metadata",
            record: "package.json@8b15995fa220c88a4d0d7ffe1e21b041d0b32588",
            url: "https://raw.githubusercontent.com/theBowja/genshin-db/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/package.json",
            field: "description"
        },
        explicitText: "Genshin Impact v7.0 JSON data."
    },
    providerIndependence: "localizedRawAndDatamineProjection",
    independenceGroup: "GenshinData-derived",
    fieldMaterialization: "notMaterializedInThisArtifact"
});

// Numeric IDs are the stable join key used by the local artifact catalog.
const ARTIFACT_NAMES = Object.freeze({
    "10001": "Resolution of Sojourner",
    "10002": "Brave Heart",
    "10003": "Defender's Will",
    "10005": "Berserker",
    "10006": "Martial Artist",
    "10007": "Instructor",
    "10008": "Gambler",
    "10009": "The Exile",
    "10010": "Adventurer",
    "10011": "Lucky Dog",
    "10012": "Scholar",
    "14001": "Blizzard Strayer",
    "15001": "Gladiator's Finale",
    "15002": "Viridescent Venerer",
    "15003": "Wanderer's Troupe",
    "15005": "Thundering Fury",
    "15006": "Crimson Witch of Flames",
    "15007": "Noblesse Oblige",
    "15008": "Bloodstained Chivalry",
    "15014": "Archaic Petra",
    "15016": "Heart of Depth",
    "15017": "Tenacity of the Millelith",
    "15018": "Pale Flame",
    "15019": "Shimenawa's Reminiscence",
    "15020": "Emblem of Severed Fate",
    "15021": "Husk of Opulent Dreams",
    "15022": "Ocean-Hued Clam",
    "15023": "Vermillion Hereafter",
    "15024": "Echoes of an Offering",
    "15025": "Deepwood Memories",
    "15026": "Gilded Dreams",
    "15027": "Desert Pavilion Chronicle",
    "15028": "Flower of Paradise Lost",
    "15029": "Nymph's Dream",
    "15030": "Vourukasha's Glow",
    "15031": "Marechaussee Hunter",
    "15032": "Golden Troupe",
    "15033": "Song of Days Past",
    "15034": "Nighttime Whispers in the Echoing Woods",
    "15035": "Fragment of Harmonic Whimsy",
    "15036": "Unfinished Reverie",
    "15038": "Obsidian Codex",
    "15039": "Long Night's Oath",
    "15040": "Finale of the Deep Galleries",
    "15041": "Night of the Sky's Unveiling",
    "15042": "Silken Moon's Serenade",
    "15043": "Aubade of Morningstar and Moon",
    "15044": "A Day Carved From Rising Winds",
    "15045": "Celestial Gift",
    "15046": "Disenchantment in Deep Shadow"
});

// These are the exact count=2 desc strings in the pinned KQM JSON record.
const KQM_DESCRIPTIONS = Object.freeze({
    "10001": "ATK +18%.",
    "10002": "ATK +18%.",
    "10003": "DEF +30%",
    "10005": "CRIT Rate +12%",
    "10006": "Normal and Charged Attack DMG +15%",
    "10007": "Increases Elemental Mastery by 80.",
    "10008": "Increases Elemental Skill DMG by 20%.",
    "10009": "Energy Recharge +20%",
    "10010": "Max HP increased by 1,000.",
    "10011": "DEF increased by 100.",
    "10012": "Energy Recharge +20%",
    "14001": "Cryo DMG Bonus +15%",
    "15001": "ATK +18%.",
    "15002": "Anemo DMG Bonus +15%",
    "15003": "Increases Elemental Mastery by 80.",
    "15005": "Electro DMG Bonus +15%",
    "15006": "Pyro DMG Bonus +15%",
    "15007": "Elemental Burst DMG +20%",
    "15008": "Physical DMG +25%",
    "15014": "Gain a 15% Geo DMG Bonus.",
    "15016": "Hydro DMG Bonus +15%",
    "15017": "HP +20%",
    "15018": "Physical DMG is increased by 25%.",
    "15019": "ATK +18%.",
    "15020": "Energy Recharge +20%",
    "15021": "DEF +30%",
    "15022": "Healing Bonus +15%.",
    "15023": "ATK +18%.",
    "15024": "ATK +18%.",
    "15025": "Dendro DMG Bonus +15%.",
    "15026": "Increases Elemental Mastery by 80.",
    "15027": "Anemo DMG Bonus +15%",
    "15028": "Increases Elemental Mastery by 80.",
    "15029": "Hydro DMG Bonus +15%",
    "15030": "HP +20%",
    "15031": "Normal and Charged Attack DMG +15%",
    "15032": "Increases Elemental Skill DMG by 20%.",
    "15033": "Healing Bonus +15%.",
    "15034": "ATK +18%.",
    "15035": "ATK +18%.",
    "15036": "ATK +18%.",
    "15038": "While the equipping character is in Nightsoul's Blessing and is on the field, their DMG dealt is increased by 15%.",
    "15039": "Plunging Attack DMG increased by 25%.",
    "15040": "Cryo DMG Bonus +15%",
    "15041": "Increases Elemental Mastery by 80.",
    "15042": "Energy Recharge +20%.",
    "15043": "Increases Elemental Mastery by 80.",
    "15044": "ATK +18%.",
    "15045": "Energy Recharge +20%.",
    "15046": "ATK +18%."
});

const TARGETS = Object.freeze({
    atk: ["atkPercent"],
    def: ["defPercent"],
    crit: ["critRate"],
    normalCharged: ["normalAttackDamageBonus", "chargedAttackDamageBonus"],
    em: ["elementalMastery"],
    skill: ["skillDamageBonus"],
    er: ["energyRecharge"],
    hpFlat: ["hpFlat"],
    defFlat: ["defFlat"],
    cryo: ["cryoDamageBonus"],
    anemo: ["anemoDamageBonus"],
    electro: ["electroDamageBonus"],
    pyro: ["pyroDamageBonus"],
    burst: ["burstDamageBonus"],
    physical: ["physicalDamageBonus"],
    geo: ["geoDamageBonus"],
    hydro: ["hydroDamageBonus"],
    hp: ["hpPercent"],
    healing: ["outgoingHealingBonus"],
    dendro: ["dendroDamageBonus"],
    all: ["allDamageBonus"],
    plunging: ["plungingAttackDamageBonus"]
});

function claim(value, unit, targets, condition = "always") {
    return { value, unit, targets: [...targets], condition, pieceCount: 2 };
}

// A normalized KQM claim is intentionally explicit.  KQM supplies prose;
// this fixed mapping is the schema bridge to the v2 EffectSpec vocabulary.
const KQM_CLAIMS = Object.freeze({
    "10001": claim(18, "percent", TARGETS.atk),
    "10002": claim(18, "percent", TARGETS.atk),
    "10003": claim(30, "percent", TARGETS.def),
    "10005": claim(12, "percent", TARGETS.crit),
    "10006": claim(15, "percent", TARGETS.normalCharged),
    "10007": claim(80, "flat", TARGETS.em),
    "10008": claim(20, "percent", TARGETS.skill),
    "10009": claim(20, "percent", TARGETS.er),
    "10010": claim(1000, "flat", TARGETS.hpFlat),
    "10011": claim(100, "flat", TARGETS.defFlat),
    "10012": claim(20, "percent", TARGETS.er),
    "14001": claim(15, "percent", TARGETS.cryo),
    "15001": claim(18, "percent", TARGETS.atk),
    "15002": claim(15, "percent", TARGETS.anemo),
    "15003": claim(80, "flat", TARGETS.em),
    "15005": claim(15, "percent", TARGETS.electro),
    "15006": claim(15, "percent", TARGETS.pyro),
    "15007": claim(20, "percent", TARGETS.burst),
    "15008": claim(25, "percent", TARGETS.physical),
    "15014": claim(15, "percent", TARGETS.geo),
    "15016": claim(15, "percent", TARGETS.hydro),
    "15017": claim(20, "percent", TARGETS.hp),
    "15018": claim(25, "percent", TARGETS.physical),
    "15019": claim(18, "percent", TARGETS.atk),
    "15020": claim(20, "percent", TARGETS.er),
    "15021": claim(30, "percent", TARGETS.def),
    "15022": claim(15, "percent", TARGETS.healing),
    "15023": claim(18, "percent", TARGETS.atk),
    "15024": claim(18, "percent", TARGETS.atk),
    "15025": claim(15, "percent", TARGETS.dendro),
    "15026": claim(80, "flat", TARGETS.em),
    "15027": claim(15, "percent", TARGETS.anemo),
    "15028": claim(80, "flat", TARGETS.em),
    "15029": claim(15, "percent", TARGETS.hydro),
    "15030": claim(20, "percent", TARGETS.hp),
    "15031": claim(15, "percent", TARGETS.normalCharged),
    "15032": claim(20, "percent", TARGETS.skill),
    "15033": claim(15, "percent", TARGETS.healing),
    "15034": claim(18, "percent", TARGETS.atk),
    "15035": claim(18, "percent", TARGETS.atk),
    "15036": claim(18, "percent", TARGETS.atk),
    "15038": claim(15, "percent", TARGETS.all, "nightsoulBlessingOnField"),
    "15039": claim(25, "percent", TARGETS.plunging),
    "15040": claim(15, "percent", TARGETS.cryo),
    "15041": claim(80, "flat", TARGETS.em),
    "15042": claim(20, "percent", TARGETS.er),
    "15043": claim(80, "flat", TARGETS.em),
    "15044": claim(18, "percent", TARGETS.atk),
    "15045": claim(20, "percent", TARGETS.er),
    "15046": claim(18, "percent", TARGETS.atk)
});

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

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
        Object.keys(value)
            .sort()
            .map((key) => [key, stableValue(value[key])])
    );
}

function stableJson(value) {
    return JSON.stringify(stableValue(value));
}

function sortNatural(left, right) {
    return String(left).localeCompare(String(right), "en", { numeric: true });
}

function relativePath(file) {
    return path.relative(repositoryRoot, file).replaceAll(path.sep, "/");
}

function inputMetadata(file) {
    const bytes = fs.readFileSync(file);
    return { path: relativePath(file), sha256: sha256(bytes), bytes: bytes.length };
}

function localClaim(spec) {
    const effect = spec?.effect || {};
    return {
        value: effect.value,
        unit: effect.unit,
        targets: clone(effect.targets || []),
        condition: effect.condition,
        pieceCount: effect.pieceCount
    };
}

function compareClaim(kqmClaim, candidateClaim) {
    return {
        valueMatch: kqmClaim.value === candidateClaim.value,
        unitMatch: kqmClaim.unit === candidateClaim.unit,
        targetMatch: stableJson(kqmClaim.targets) === stableJson(candidateClaim.targets),
        conditionMatch: kqmClaim.condition === candidateClaim.condition,
        pieceCountMatch: kqmClaim.pieceCount === candidateClaim.pieceCount,
        fieldAgreement: stableJson(kqmClaim) === stableJson(candidateClaim),
        activationComparable: false,
        activationNote: "KQM count=2 prose does not specify v2 activation calculationSupport or uidHandling; those runtime-policy fields remain local-only."
    };
}

function sourceRecord({ candidateId, artifactId, artifactName, input }) {
    return {
        id: `kqm:tcl:artifact:${artifactId}:twoPiece`,
        entity: { kind: "artifactSet", id: artifactId, name: artifactName },
        provider: KQM.provider,
        repository: KQM.repository,
        revision: KQM.revision,
        revisionKind: KQM.revisionKind,
        revisionDate: KQM.revisionDate,
        path: KQM.path,
        blob: KQM.blob,
        fileSha256: KQM.fileSha256,
        locator: {
            jsonPath: `artifacts[${JSON.stringify(artifactName)}].bonuses[count=2]`,
            field: "desc",
            candidateId
        },
        gameVersion: KQM.gameVersion,
        gameVersionEvidence: clone(KQM.gameVersionEvidence),
        gameVersionVerified: false,
        providerIndependence: KQM.providerIndependence,
        independenceGroup: KQM.independenceGroup,
        lineage: KQM.lineage,
        pinAcquisition: clone(KQM.pinAcquisition),
        sourceMaterialization: {
            materialized: false,
            materializationPolicy: "The checked-in evidence pins the external immutable bytes by commit/blob/SHA; no external checkout is required at runtime.",
            expectedRawSha256: KQM.fileSha256,
            observedRawSha256: null
        },
        inputCandidateFile: clone(input),
        sourceDescription: KQM_DESCRIPTIONS[artifactId],
        sourceField: "bonuses[count=2].desc",
        pieceCount: 2,
        status: KQM.canonicalStatus,
        blockedReasons: [...KQM.blockedReasons],
        canonicalEligibility: false,
        reopenTrigger: KQM.reopenTrigger
    };
}

function candidateSource({ candidateId, spec, input }) {
    return {
        provider: "damageTool-v2-EffectSpec",
        repository: null,
        revision: null,
        revisionKind: null,
        path: input.path,
        fileSha256: input.sha256,
        locator: { candidateId, field: "effect.value/unit/targets/condition/pieceCount" },
        gameVersion: null,
        gameVersionEvidence: {
            status: "notAsserted",
            note: "The local candidate file is used as the comparison target; this artifact does not promote its generated claims to an external provider/version binding."
        },
        providerIndependence: "localCanonicalProjection",
        independenceGroup: "damageTool-v2-local",
        fieldMaterialization: "checkedIn"
    };
}

function makeField({ candidateId, artifactId, artifactName, spec, input }) {
    const kqmClaim = KQM_CLAIMS[artifactId];
    const candidateClaim = localClaim(spec);
    const comparison = compareClaim(kqmClaim, candidateClaim);
    return {
        id: `artifact:${artifactId}:twoPiece:kqm`,
        candidateId,
        entity: { kind: "artifactSet", id: artifactId, name: artifactName },
        dataset: "artifactSetModifiers",
        field: "twoPiece.effect",
        pieceCount: 2,
        sourceA: {
            provider: KQM.provider,
            repository: KQM.repository,
            revision: KQM.revision,
            revisionKind: KQM.revisionKind,
            path: KQM.path,
            blob: KQM.blob,
            fileSha256: KQM.fileSha256,
            gameVersion: KQM.gameVersion,
            gameVersionEvidence: clone(KQM.gameVersionEvidence),
            providerIndependence: KQM.providerIndependence,
            independenceGroup: KQM.independenceGroup,
            sourceRecordId: `kqm:tcl:artifact:${artifactId}:twoPiece`,
            sourceField: "bonuses[count=2].desc",
            rawDescription: KQM_DESCRIPTIONS[artifactId],
            structuredClaim: clone(kqmClaim)
        },
        sourceB: candidateSource({ candidateId, spec, input }),
        // The intended independent pair is KQM x genshin-db.  The local v2
        // field above is a deterministic comparison target, not a claim that
        // genshin-db's 50 artifact files were materialized in this batch.
        intendedProviderB: {
            provider: GENSHIN_DB.provider,
            repository: GENSHIN_DB.repository,
            revision: GENSHIN_DB.revision,
            revisionKind: GENSHIN_DB.revisionKind,
            gameVersion: GENSHIN_DB.gameVersion,
            gameVersionEvidence: clone(GENSHIN_DB.gameVersionEvidence),
            providerIndependence: GENSHIN_DB.providerIndependence,
            independenceGroup: GENSHIN_DB.independenceGroup,
            fieldMaterialization: GENSHIN_DB.fieldMaterialization
        },
        kqmClaim: clone(kqmClaim),
        candidateClaim,
        comparison,
        extractionMethod: {
            type: "explicitKqmArtifactBonusRecord",
            sourceField: "bonuses[count=2].desc",
            tokenMatchingUsed: false,
            normalization: "The exact KQM prose is retained; only the named artifact and count=2 record are mapped to the fixed v2 target vocabulary.",
            targetVocabulary: "games/genshin/data/v2/artifacts/spec-candidates.json effect.targets"
        },
        status: KQM.canonicalStatus,
        gameVersionStatus: "unbound",
        blockedReasons: [...KQM.blockedReasons],
        canonicalEligibility: false,
        reopenTrigger: KQM.reopenTrigger
    };
}

function buildEvidence({ dataRoot = defaultDataRoot } = {}) {
    const candidatesPath = path.join(dataRoot, "v2", "artifacts", "spec-candidates.json");
    const candidates = readJson(candidatesPath);
    const input = inputMetadata(candidatesPath);
    const entries = Object.values(candidates)
        .filter((spec) => spec?.effect?.pieceSlot === "twoPiece")
        .sort((left, right) => sortNatural(left.id, right.id));

    if (entries.length !== EXPECTED_COUNT) {
        throw new Error(`expected ${EXPECTED_COUNT} twoPiece candidates, found ${entries.length}`);
    }

    const fields = [];
    const sourceRecords = {};
    for (const spec of entries) {
        const artifactId = String(spec.entity?.id || "");
        const artifactName = ARTIFACT_NAMES[artifactId];
        if (!artifactName) throw new Error(`missing KQM artifact name mapping for ${artifactId}`);
        if (!KQM_DESCRIPTIONS[artifactId] || !KQM_CLAIMS[artifactId]) {
            throw new Error(`missing KQM two-piece claim for ${artifactId}`);
        }
        const field = makeField({
            candidateId: spec.id,
            artifactId,
            artifactName,
            spec,
            input
        });
        fields.push(field);
        sourceRecords[field.sourceA.sourceRecordId] = sourceRecord({
            candidateId: spec.id,
            artifactId,
            artifactName,
            input
        });
    }

    const comparisons = fields.map((field) => field.comparison);
    const summary = {
        candidateCount: entries.length,
        fieldComparisonCount: fields.length,
        sourceRecordCount: Object.keys(sourceRecords).length,
        fieldAgreementCount: comparisons.filter((comparison) => comparison.fieldAgreement).length,
        valueMatchCount: comparisons.filter((comparison) => comparison.valueMatch).length,
        unitMatchCount: comparisons.filter((comparison) => comparison.unitMatch).length,
        targetMatchCount: comparisons.filter((comparison) => comparison.targetMatch).length,
        conditionMatchCount: comparisons.filter((comparison) => comparison.conditionMatch).length,
        pieceCountMatchCount: comparisons.filter((comparison) => comparison.pieceCountMatch).length,
        activationComparableCount: comparisons.filter((comparison) => comparison.activationComparable).length,
        gameVersionBoundCount: 0,
        gameVersionUnboundCount: fields.length,
        canonicalEligibleCount: 0,
        statusCounts: { evidenceOnlyBlocked: fields.length },
        blockedReasonCounts: { gameVersionUnbound: fields.length }
    };

    return {
        schemaVersion: 1,
        kind: "genshinKqmArtifactFieldEvidence",
        evidence: "genshin-kqm-artifact-field-evidence",
        generator: {
            name: "genshinKqmArtifactEvidence.cjs",
            version: GENERATOR_VERSION,
            capturedAt: CAPTURED_AT
        },
        policy: {
            dataset: "artifactSetModifiers",
            scope: "all 50 local twoPiece EffectSpec candidates",
            sourceField: "KQM TCL artifacts.json bonuses[count=2].desc",
            revisionSemantics: "repositoryRevisionAndGitBlobAndRawFileSha256",
            gameVersionSemantics: "explicitGameVersionEvidenceRequired",
            independenceSemantics: "distinctProviderAndIndependenceGroup",
            canonicalPromotion: "forbiddenUntilVersionBoundIndependentPairAndFieldReview",
            tokenMatching: "forbidden",
            status: "evidenceOnlyBlocked",
            blockedReasons: ["gameVersionUnbound"],
            reopenTrigger: KQM.reopenTrigger
        },
        pairPolicy: {
            dataset: "artifactSetModifiers",
            providerA: KQM.provider,
            providerB: GENSHIN_DB.provider,
            independenceGroupA: KQM.independenceGroup,
            independenceGroupB: GENSHIN_DB.independenceGroup,
            upstreamLineageA: KQM.lineage,
            upstreamLineageB: "GenshinData-derived localized raw projection (as recorded in source-catalog.json).",
            providerARevision: KQM.revision,
            providerAFile: KQM.path,
            providerAFileBlob: KQM.blob,
            providerAFileSha256: KQM.fileSha256,
            providerBRevision: GENSHIN_DB.revision,
            providerBGameVersion: GENSHIN_DB.gameVersion,
            scope: "50 two-piece artifact fields; KQM-to-local normalized field comparison is materialized, while provider-B artifact files are not materialized in this artifact.",
            status: "evidenceOnlyBlocked",
            blockedReasons: ["gameVersionUnbound"],
            invalidationConditions: [
                "KQM revision, artifact blob, or raw-file SHA-256 changes",
                "genshin-db revision, package-manifest version, or field digest changes",
                "KQM or genshin-db field value/condition/scope discrepancy",
                "KQM upstream lineage is disclosed as correlated with GenshinData/HoYoWiki",
                "KQM exact version binding or approved contract scope changes"
            ],
            reopenTrigger: KQM.reopenTrigger,
            evidenceRefs: [
                "scripts/genshinKqmArtifactEvidence.cjs",
                "reports/genshin-kqm-artifact-evidence.md",
                "games/genshin/data/v2/source-catalog.json"
            ]
        },
        input: { artifactSpecs: input },
        kqm: {
            provider: KQM.provider,
            repository: KQM.repository,
            revision: KQM.revision,
            revisionKind: KQM.revisionKind,
            revisionDate: KQM.revisionDate,
            path: KQM.path,
            blob: KQM.blob,
            fileSha256: KQM.fileSha256,
            gameVersion: KQM.gameVersion,
            gameVersionEvidence: clone(KQM.gameVersionEvidence),
            providerIndependence: KQM.providerIndependence,
            independenceGroup: KQM.independenceGroup,
            lineage: KQM.lineage,
            pinAcquisition: clone(KQM.pinAcquisition),
            canonicalStatus: KQM.canonicalStatus,
            blockedReasons: [...KQM.blockedReasons],
            reopenTrigger: KQM.reopenTrigger
        },
        sourceRecords,
        fields,
        summary
    };
}

function auditEvidence(evidence) {
    const errors = [];
    if (!evidence || evidence.kind !== "genshinKqmArtifactFieldEvidence") errors.push("kind");
    if (evidence?.kqm?.revision !== KQM.revision) errors.push("kqm.revision");
    if (evidence?.kqm?.blob !== KQM.blob) errors.push("kqm.blob");
    if (evidence?.kqm?.fileSha256 !== KQM.fileSha256) errors.push("kqm.fileSha256");
    if (evidence?.kqm?.gameVersion !== null) errors.push("kqm.gameVersion");
    if (evidence?.kqm?.canonicalStatus !== "evidenceOnlyBlocked") errors.push("kqm.canonicalStatus");
    if (evidence?.kqm?.blockedReasons?.join(",") !== "gameVersionUnbound") errors.push("kqm.blockedReasons");
    if (evidence?.pairPolicy?.status !== "evidenceOnlyBlocked") errors.push("pairPolicy.status");
    if (evidence?.pairPolicy?.blockedReasons?.join(",") !== "gameVersionUnbound") errors.push("pairPolicy.blockedReasons");
    if (evidence?.fields?.length !== EXPECTED_COUNT) errors.push("fields.length");
    if (Object.keys(evidence?.sourceRecords || {}).length !== EXPECTED_COUNT) errors.push("sourceRecords.length");

    const candidateIds = new Set();
    for (const field of evidence?.fields || []) {
        if (candidateIds.has(field.candidateId)) errors.push(`duplicate:${field.candidateId}`);
        candidateIds.add(field.candidateId);
        if (field.pieceCount !== 2) errors.push(`pieceCount:${field.candidateId}`);
        if (field.status !== "evidenceOnlyBlocked") errors.push(`status:${field.candidateId}`);
        if (field.gameVersionStatus !== "unbound") errors.push(`version:${field.candidateId}`);
        if (field.blockedReasons?.join(",") !== "gameVersionUnbound") errors.push(`blocked:${field.candidateId}`);
        if (field.sourceA?.revision !== KQM.revision) errors.push(`revision:${field.candidateId}`);
        if (field.sourceA?.blob !== KQM.blob) errors.push(`blob:${field.candidateId}`);
        if (field.sourceA?.fileSha256 !== KQM.fileSha256) errors.push(`sha:${field.candidateId}`);
        if (field.sourceA?.gameVersion !== null) errors.push(`sourceVersion:${field.candidateId}`);
        if (!field.comparison?.fieldAgreement) errors.push(`comparison:${field.candidateId}`);
        if (field.canonicalEligibility !== false) errors.push(`canonical:${field.candidateId}`);
    }
    const summary = evidence?.summary || {};
    if (summary.candidateCount !== EXPECTED_COUNT) errors.push("summary.candidateCount");
    if (summary.fieldComparisonCount !== EXPECTED_COUNT) errors.push("summary.fieldComparisonCount");
    if (summary.fieldAgreementCount !== EXPECTED_COUNT) errors.push("summary.fieldAgreementCount");
    if (summary.gameVersionBoundCount !== 0) errors.push("summary.gameVersionBoundCount");
    if (summary.gameVersionUnboundCount !== EXPECTED_COUNT) errors.push("summary.gameVersionUnboundCount");
    if (summary.canonicalEligibleCount !== 0) errors.push("summary.canonicalEligibleCount");
    return { ok: errors.length === 0, errors };
}

function markdownReport(evidence, audit) {
    const lines = [
        "# KQM artifact two-piece field evidence",
        "",
        `Status: **${evidence.pairPolicy.status}** (` + evidence.pairPolicy.blockedReasons.join(", ") + ")",
        "",
        "This is a persisted evidence join for all 50 two-piece artifact EffectSpec candidates. The KQM source is pinned by Git commit, artifact-file blob, and raw-file SHA-256. Its independent community-research lineage is useful for comparison, but the pinned file has no explicit Genshin patch binding, so no field is canonically reusable.",
        "",
        "## Pair policy",
        "",
        `- Provider A: ${evidence.pairPolicy.providerA} (${evidence.pairPolicy.independenceGroupA})` ,
        `- Provider B target: ${evidence.pairPolicy.providerB} (${evidence.pairPolicy.independenceGroupB}); field files are not materialized in this artifact`,
        `- KQM revision: \`${evidence.kqm.revision}\`` ,
        `- KQM file/blob: \`${evidence.kqm.path}\` / \`${evidence.kqm.blob}\`` ,
        `- KQM raw SHA-256: \`${evidence.kqm.fileSha256}\`` ,
        "- KQM gameVersion: **unbound**; revision/date/digest cannot substitute for explicit version evidence",
        `- Reopen: ${evidence.kqm.reopenTrigger}`,
        "",
        "## Materialized comparison summary",
        "",
        `- Candidates and comparisons: **${evidence.summary.fieldComparisonCount}**`
            + `; exact normalized field agreements: **${evidence.summary.fieldAgreementCount}**`,
        `- Value/unit/target/condition/piece matches: ${evidence.summary.valueMatchCount}/${evidence.summary.unitMatchCount}/${evidence.summary.targetMatchCount}/${evidence.summary.conditionMatchCount}/${evidence.summary.pieceCountMatchCount}`,
        `- Game-version bound/unbound: ${evidence.summary.gameVersionBoundCount}/${evidence.summary.gameVersionUnboundCount}`,
        "- Canonical eligible: **0**",
        "",
        "| Candidate | KQM artifact | KQM count=2 description | Value | Unit | Targets | Comparison |",
        "| --- | --- | --- | ---: | --- | --- | --- |"
    ];
    for (const field of evidence.fields) {
        const claim = field.kqmClaim;
        lines.push(
            `| \`${field.candidateId}\` | ${field.entity.name} | ${field.sourceA.rawDescription.replaceAll("|", "\\|")} | ${claim.value} | ${claim.unit} | ${claim.targets.join(", ")} | ${field.comparison.fieldAgreement ? "match; blocked: gameVersionUnbound" : "discrepancy"} |`
        );
    }
    lines.push(
        "",
        `Audit: **${audit.ok ? "passed" : "failed"}**${audit.ok ? "" : ` (${audit.errors.join(", ")})`}.`,
        "",
        "The KQM prose-to-v2 target mapping is explicit and deterministic; activation details not stated by KQM remain non-comparable local runtime policy fields."
    );
    return `${lines.join("\n")}\n`;
}

function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeArtifacts({
    dataRoot = defaultDataRoot,
    outputPath = defaultOutputPath,
    reportJsonPath = defaultReportJsonPath,
    reportMarkdownPath = defaultReportMarkdownPath
} = {}) {
    const evidence = buildEvidence({ dataRoot });
    const audit = auditEvidence(evidence);
    if (!audit.ok) throw new Error(`KQM evidence audit failed: ${audit.errors.join(", ")}`);
    writeJson(outputPath, evidence);
    writeJson(reportJsonPath, {
        schemaVersion: 1,
        kind: "genshinKqmArtifactEvidenceReport",
        generatedBy: GENERATOR_VERSION,
        generatedAt: CAPTURED_AT,
        status: evidence.pairPolicy.status,
        blockedReasons: evidence.pairPolicy.blockedReasons,
        audit,
        summary: evidence.summary,
        pairPolicy: evidence.pairPolicy,
        evidenceRefs: [relativePath(outputPath), relativePath(reportMarkdownPath)]
    });
    fs.mkdirSync(path.dirname(reportMarkdownPath), { recursive: true });
    fs.writeFileSync(reportMarkdownPath, markdownReport(evidence, audit), "utf8");
    return { evidence, audit, outputPath, reportJsonPath, reportMarkdownPath };
}

if (require.main === module) {
    const result = writeArtifacts();
    console.log(JSON.stringify({
        status: result.evidence.pairPolicy.status,
        blockedReasons: result.evidence.pairPolicy.blockedReasons,
        fields: result.evidence.summary.fieldComparisonCount,
        agreements: result.evidence.summary.fieldAgreementCount,
        outputPath: relativePath(result.outputPath),
        reportJsonPath: relativePath(result.reportJsonPath),
        reportMarkdownPath: relativePath(result.reportMarkdownPath)
    }, null, 2));
}

module.exports = {
    ARTIFACT_NAMES,
    KQM,
    KQM_CLAIMS,
    KQM_DESCRIPTIONS,
    GENSHIN_DB,
    CAPTURED_AT,
    GENERATOR_VERSION,
    EXPECTED_COUNT,
    defaultDataRoot,
    defaultOutputPath,
    defaultReportJsonPath,
    defaultReportMarkdownPath,
    buildEvidence,
    auditEvidence,
    markdownReport,
    writeArtifacts
};
