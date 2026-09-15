"use strict";

/**
 * Repository-local synthetic fixture for the canonical Runtime -> browser ->
 * calculator audit.  This is intentionally not referenced by the production
 * manifest or by any shipped data file.  It reuses the shape of the existing
 * canonical promotion fixture, but gives each synthetic source a distinct
 * independence group so it exercises the current promotion gate as well.
 */

const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");
const fixtureFile = path.join(repositoryRoot, "games", "genshin", "data", "v2", "runtime", "fixtures.json");
const generator = require(path.join(repositoryRoot, "scripts", "genshinCanonicalRuntimeGenerate.cjs"));
const { materializeHumanFixtureVerification } = require(path.join(repositoryRoot, "tests", "genshin", "helpers", "canonicalFixtureVerification.cjs"));

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function claim(status, sourceRefs) {
    return { status, sourceRefs: [...sourceRefs] };
}

function addClaimCoverage(spec, activation) {
    const sourceRefs = [...spec.sourceRefs];
    const claims = {};
    [
        "effect.kind",
        "effect.targets",
        "effect.activation.condition",
        "effect.activation.calculationSupport",
        "effect.activation.uidHandling",
        "destination",
        "supersedesLegacyModifierIds",
        "runtime.modifierIds",
        "entity",
        "interpretation",
        "effect.value",
        "effect.unit"
    ].forEach((fieldPath) => {
        claims[fieldPath] = claim("verified", sourceRefs);
    });
    Object.keys(activation || {}).forEach((field) => {
        if (["condition", "calculationSupport", "uidHandling"].includes(field)) return;
        claims[`effect.activation.${field}`] = claim("verified", sourceRefs);
    });
    // A notApplicable field is retained to prove that it cannot weaken the
    // independence gate.  It still carries both fixture references here.
    claims.duration = claim("notApplicable", sourceRefs);
    spec.verification.claims = claims;
}

function makeSpec(baseSpec, config) {
    const spec = clone(baseSpec);
    const activation = {
        condition: config.condition || "always",
        calculationSupport: config.calculationSupport || "simple",
        uidHandling: "conditional",
        ...(config.activation || {})
    };
    spec.id = config.id;
    spec.entity = clone(config.entity);
    spec.destination = clone(config.destination);
    spec.supersedesLegacyModifierIds = [...config.supersedesLegacyModifierIds];
    spec.effect = {
        kind: "damageBonus",
        targets: ["allDamageBonus"],
        activation,
        value: config.value,
        unit: "percent"
    };
    spec.runtime = { status: "candidate", modifierIds: [config.runtimeId] };
    spec.verification = {
        status: "verified",
        reviewedBy: "canonical-ui-fixture-reviewer",
        reviewedAt: "2026-08-16T00:00:00.000Z",
        sourceAgreement: "agreed",
        discrepancies: []
    };
    addClaimCoverage(spec, activation);
    return spec;
}

function buildSyntheticCanonicalFixture() {
    const input = JSON.parse(fs.readFileSync(fixtureFile, "utf8"));
    const sourceRecords = clone(input.sourceRecords);
    sourceRecords["fixture:official"].independenceGroup = "official";
    sourceRecords["fixture:independent"].independenceGroup = "independent-calc";
    const baseSpec = input.specs["fixture:weapon:damage"];
    const specs = {};
    const records = [
        {
            id: "fixture:weapon:damage",
            runtimeId: "fixture_runtime_damage",
            value: 12,
            entity: { kind: "weapon", id: "fixture-weapon", component: "modifier" },
            destination: { dataset: "weaponModifiers", entityId: "fixture-weapon", collection: "modifiers" },
            supersedesLegacyModifierIds: ["fixture_legacy_damage_bonus"]
        },
        {
            id: "fixture:weapon:conditional",
            runtimeId: "fixture_runtime_conditional",
            value: 5,
            condition: "conditional",
            calculationSupport: "toggle",
            entity: { kind: "weapon", id: "fixture-weapon", component: "conditionalModifier" },
            destination: { dataset: "weaponModifiers", entityId: "fixture-weapon", collection: "modifiers" },
            supersedesLegacyModifierIds: ["fixture_legacy_conditional"],
            activation: {
                conditionInput: {
                    type: "option",
                    label: "Synthetic fixture state",
                    options: [
                        { value: "enabled", label: "Enabled" },
                        { value: "disabled", label: "Disabled" }
                    ]
                },
                conditionOptionValue: "enabled"
            }
        },
        {
            id: "fixture:artifact:damage",
            runtimeId: "fixture_runtime_artifact",
            value: 8,
            entity: { kind: "artifactSet", id: "fixture-set", component: "fourPiece" },
            destination: { dataset: "artifactSetModifiers", entityId: "fixture-set", collection: "fourPiece" },
            supersedesLegacyModifierIds: ["fixture_legacy_artifact"]
        },
        {
            id: "fixture:talent:damage",
            runtimeId: "fixture_runtime_talent",
            value: 6,
            entity: { kind: "character", id: "10000002", component: "passive" },
            destination: {
                dataset: "talentModifiers",
                entityId: "10000002",
                collection: "passive",
                sourceId: "combat1"
            },
            supersedesLegacyModifierIds: ["fixture_legacy_talent"],
            activation: { targetOwner: "team" }
        }
    ];
    const rawRecords = records.map((config) => ({
        id: `raw:${config.id}`,
        kind: "syntheticRawEffect",
        sourceRefs: ["fixture:official", "fixture:independent"],
        fields: clone(config)
    }));
    rawRecords.forEach((raw) => {
        // This small deterministic Raw -> Spec projection is deliberately
        // explicit: no prose parsing or value inference is involved.
        specs[raw.fields.id] = makeSpec(baseSpec, {
            ...raw.fields,
            sourceRefs: raw.sourceRefs
        });
        specs[raw.fields.id].sourceRefs = ["fixture:official", "fixture:independent"];
    });
    const verifiedSpecs = materializeHumanFixtureVerification(specs, sourceRecords);
    const runtime = generator.buildCanonicalRuntime({
        specs: verifiedSpecs,
        sourceRecords,
        behaviorModifiers: {}
    });
    return {
        schemaVersion: 2,
        kind: "genshinCanonicalUiRuntimeSyntheticFixture",
        rawRecords,
        sourceRecords,
        specs: verifiedSpecs,
        runtime
    };
}

module.exports = {
    buildSyntheticCanonicalFixture,
    clone
};
