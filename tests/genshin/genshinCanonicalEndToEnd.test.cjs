"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const generator = require(path.join(root, "scripts", "genshinCanonicalRuntimeGenerate.cjs"));
const {
    buildSyntheticCanonicalFixture,
    clone
} = require(path.join(root, "scripts", "genshinCanonicalUiRuntimeFixture.cjs"));

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function legacyModifier(id, value, condition = "always") {
    return {
        id,
        category: "damageBonus",
        applyTo: ["allDamageBonus"],
        condition,
        calculationSupport: "simple",
        uidHandling: "conditional",
        value,
        unit: "percent"
    };
}

function buildSyntheticData(fixture) {
    const data = {
        dataManifest: readJson("games/genshin/data/data-v2-manifest.json"),
        versionBaseline: {
            targetGameVersion: { status: "strictlyBound", gameVersion: "6.0" },
            snapshotId: "genshin-version:6.0:synthetic-e2e",
            sourceCatalogDigest: "a".repeat(64)
        },
        upstreamVersionHead: {
            schemaVersion: 1,
            kind: "genshinUpstreamVersionHead",
            observedGameVersion: "6.0",
            evidence: {
                kind: "officialReleaseNotes",
                providerFamily: "official-hoyoverse",
                rawApiResponseDigest: "c".repeat(64),
                fieldDigest: "d".repeat(64),
                claim: { gameVersion: "6.0" }
            }
        },
        canonicalRuntime: clone(fixture.runtime),
        talentScalings: readJson("games/genshin/data/calc/talent-scalings.json"),
        talentModifiers: readJson("games/genshin/data/calc/talent-modifiers.json"),
        talentEffectRegistry: readJson("games/genshin/data/calc/talent-effect-registry.json"),
        weaponModifiers: readJson("games/genshin/data/calc/weapon-modifiers.json"),
        weaponEffectRegistry: readJson("games/genshin/data/calc/weapon-effect-registry.json"),
        artifactSetModifiers: readJson("games/genshin/data/calc/artifact-set-modifiers.json"),
        constellationModifiers: readJson("games/genshin/data/calc/constellation-modifiers.json"),
        constellationEffectRegistry: readJson("games/genshin/data/calc/constellation-effect-registry.json"),
        attackModeRules: readJson("games/genshin/data/calc/attack-mode-rules.json"),
        reactionDefinitions: readJson("games/genshin/data/calc/reaction-definitions.json"),
        characters: readJson("games/genshin/data/characters.json"),
        weapons: readJson("games/genshin/data/weapons.json"),
        artifactSets: readJson("games/genshin/data/artifact-sets.json"),
        enemies: readJson("games/genshin/data/enemies.json"),
        characterTalents: readJson("games/genshin/data/character-talents.json"),
        weaponEffects: readJson("games/genshin/data/weapon-effects.json"),
        artifactSetEffects: readJson("games/genshin/data/artifact-set-effects.json"),
        warnings: []
    };
    data.canonicalRuntime.versionBinding = {
        status: "strictlyBound",
        gameVersion: "6.0",
        acceptedSnapshotId: data.versionBaseline.snapshotId,
        sourceCatalogDigest: data.versionBaseline.sourceCatalogDigest,
        baselineDigest: "b".repeat(64)
    };

    // The fixture is injected only into the in-memory fetch response.  The
    // shipped production JSON files and manifest remain untouched.
    data.weaponModifiers = clone(data.weaponModifiers);
    data.weaponModifiers["fixture-weapon"] = {
        modifiers: [
            legacyModifier("fixture_legacy_damage_bonus", 1),
            legacyModifier("fixture_legacy_conditional", 1, "conditional")
        ]
    };
    data.weaponEffectRegistry = clone(data.weaponEffectRegistry);
    data.weaponEffectRegistry.weapons["fixture-weapon"] = {
        groups: [{
            id: "fixture_group",
            name: "Synthetic fixture weapon",
            activation: {
                type: "option",
                stateKey: "fixture_state",
                label: "Synthetic fixture state",
                options: [
                    { value: "enabled", label: "Enabled" },
                    { value: "disabled", label: "Disabled" }
                ]
            },
            inputPolicy: "calculate",
            targetOwner: "self",
            modifierIds: ["fixture_legacy_damage_bonus", "fixture_legacy_conditional"],
            modifierOverrides: {
                fixture_legacy_damage_bonus: { auditDisposition: "legacyOnly" },
                fixture_legacy_conditional: { auditDisposition: "legacyOnly" }
            }
        }]
    };
    data.weapons = clone(data.weapons);
    data.weapons["fixture-weapon"] = { id: "fixture-weapon", nameJa: "Synthetic fixture weapon" };
    data.weaponEffects = clone(data.weaponEffects);
    data.weaponEffects["fixture-weapon"] = {
        effectNameJa: "Synthetic fixture effect",
        effectTextTemplate: "Synthetic fixture only"
    };

    data.artifactSetModifiers = clone(data.artifactSetModifiers);
    data.artifactSetModifiers["fixture-set"] = {
        fourPiece: [legacyModifier("fixture_legacy_artifact", 1)]
    };
    data.artifactSets = clone(data.artifactSets);
    data.artifactSets["fixture-set"] = { id: "fixture-set", nameJa: "Synthetic fixture set" };
    data.artifactSetEffects = clone(data.artifactSetEffects);
    data.artifactSetEffects["fixture-set"] = {
        fourPieceEffect: "Synthetic fixture only"
    };

    data.talentModifiers = clone(data.talentModifiers);
    data.talentModifiers["10000002"] ||= {};
    data.talentModifiers["10000002"].passives = [
        ...(data.talentModifiers["10000002"].passives || []),
        {
            sourceId: "combat1",
            modifiers: [legacyModifier("fixture_legacy_talent", 1)]
        }
    ];
    return data;
}

function pathDataMap(data) {
    return {
        "/games/genshin/data/data-v2-manifest.json": data.dataManifest,
        "/games/genshin/data/v2/version-baseline.json": data.versionBaseline,
        "/games/genshin/data/v2/upstream-version-head.json": data.upstreamVersionHead,
        "/games/genshin/data/v2/runtime/canonical-runtime.json": data.canonicalRuntime,
        "/games/genshin/data/calc/talent-scalings.json": data.talentScalings,
        "/games/genshin/data/calc/talent-modifiers.json": data.talentModifiers,
        "/games/genshin/data/calc/talent-effect-registry.json": data.talentEffectRegistry,
        "/games/genshin/data/calc/weapon-modifiers.json": data.weaponModifiers,
        "/games/genshin/data/calc/weapon-effect-registry.json": data.weaponEffectRegistry,
        "/games/genshin/data/calc/artifact-set-modifiers.json": data.artifactSetModifiers,
        "/games/genshin/data/calc/constellation-modifiers.json": data.constellationModifiers,
        "/games/genshin/data/calc/constellation-effect-registry.json": data.constellationEffectRegistry,
        "/games/genshin/data/calc/attack-mode-rules.json": data.attackModeRules,
        "/games/genshin/data/calc/reaction-definitions.json": data.reactionDefinitions,
        "/games/genshin/data/characters.json": data.characters,
        "/games/genshin/data/weapons.json": data.weapons,
        "/games/genshin/data/artifact-sets.json": data.artifactSets,
        "/games/genshin/data/enemies.json": data.enemies,
        "/games/genshin/data/character-talents.json": data.characterTalents,
        "/games/genshin/data/weapon-effects.json": data.weaponEffects,
        "/games/genshin/data/artifact-set-effects.json": data.artifactSetEffects
    };
}

function createHarness(data) {
    const elements = {};
    const document = {
        addEventListener() {},
        getElementById(id) {
            return elements[id] || null;
        },
        querySelectorAll(selector) {
            if (selector === "[data-genshin-resource-key]") {
                return Object.values(elements).filter((item) => item.dataset?.genshinResourceKey);
            }
            if (selector === "[data-genshin-condition-key]") {
                return Object.values(elements).filter((item) => item.dataset?.genshinConditionKey);
            }
            if (selector === "[data-genshin-toggle-key]") {
                return Object.values(elements).filter((item) => item.dataset?.genshinToggleKey);
            }
            return [];
        }
    };
    const map = pathDataMap(data);
    const sandbox = {
        console,
        document,
        fetch: async (requestPath) => {
            if (!Object.prototype.hasOwnProperty.call(map, requestPath)) {
                return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) };
            }
            return { ok: true, status: 200, statusText: "OK", json: async () => clone(map[requestPath]) };
        }
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    [
        "games/js/genshinDataContract.js",
        "games/js/genshinCalcData.js",
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinPartyModifiers.js",
        "games/js/genshinCalcEngine.js"
    ].forEach((relativePath) => {
        const absolutePath = path.join(root, relativePath);
        vm.runInContext(fs.readFileSync(absolutePath, "utf8"), sandbox, { filename: absolutePath });
    });
    return { sandbox, elements };
}

function setElement(elements, id, value, checked = false) {
    elements[id] = { value: String(value), checked };
}

function prepareContext(harness) {
    const { elements, sandbox } = harness;
    const values = {
        genshinCalcCharacterId: "10000002",
        genshinCalcWeaponId: "fixture-weapon",
        genshinReflectCharacter: "fixture-character",
        genshinReflectConstellation: "C0",
        genshinReflectLevel: 90,
        genshinWeaponRefinement: "R1",
        genshinNormalTalentLevel: 10,
        genshinSkillTalentLevel: 10,
        genshinBurstTalentLevel: 10,
        genshinHpInput: 20000,
        genshinBaseHpInput: 10000,
        genshinBaseAtkInput: 1000,
        genshinAtkInput: 2000,
        genshinBaseDefInput: 500,
        genshinDefInput: 1000,
        genshinElementalMasteryInput: 100,
        genshinCritRateInput: 50,
        genshinCritDamageInput: 100,
        genshinEnergyRechargeInput: 100,
        genshinElementalDamageInput: 50,
        genshinEnemyLevelInput: 90,
        genshinEnemyElementalResistanceInput: 10,
        genshinEnemyPhysicalResistanceInput: 10,
        genshinElementalResistanceDebuffInput: 0,
        genshinPhysicalResistanceDebuffInput: 0,
        genshinDefenseReductionInput: 0,
        genshinDefenseIgnoreInput: 0,
        genshinJsonReactionOption: "none",
        genshinArtifactSetMode: "4pc",
        genshinArtifactSetOne: "fixture-set",
        genshinArtifactSetTwo: ""
    };
    Object.entries(values).forEach(([id, value]) => setElement(elements, id, value));
    setElement(elements, "genshinJsonEnableCharacterCondition", "", true);
    setElement(elements, "genshinJsonEnableWeaponLowHpCondition", "", true);
    const context = sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    context.party = {
        members: [{
            slot: 2,
            enabled: true,
            characterId: "10000002",
            nameJa: "Synthetic support",
            constellation: 0,
            talentLevels: { normal: 10, skill: 10, burst: 10 },
            equipment: {
                weaponId: "",
                weaponLevel: 90,
                refinement: 1,
                artifactSetMode: "none",
                artifactSetIds: []
            },
            stats: {
                baseHp: 10000,
                baseAtk: 1000,
                baseDef: 500,
                hp: 20000,
                atk: 2000,
                def: 1000,
                elementalMastery: 100
            },
            buffStates: {}
        }]
    };
    return context;
}

function normalResult(payload) {
    return payload.results.find((item) => item.entry.attackType === "normalAttack" && item.entry.group !== "extraDamage");
}

test("synthetic Raw -> Spec -> canonical -> browser loader -> condition UI -> collection -> calculation path", async () => {
    const fixture = buildSyntheticCanonicalFixture();
    assert.equal(fixture.rawRecords.length, 4);
    assert.equal(fixture.runtime.summary.canonical, 4);
    assert.deepEqual(
        Object.keys(fixture.runtime.modifiers).sort(),
        ["fixture_runtime_artifact", "fixture_runtime_conditional", "fixture_runtime_damage", "fixture_runtime_talent"]
    );
    assert.equal(generator.stableJson(fixture.runtime), generator.stableJson(generator.buildCanonicalRuntime({
        specs: fixture.specs,
        sourceRecords: fixture.sourceRecords,
        behaviorModifiers: {}
    })));

    const data = buildSyntheticData(fixture);
    const harness = createHarness(data);
    const { sandbox } = harness;
    const calcData = await sandbox.GenshinCalcData.loadGenshinCalcData();
    assert.deepEqual(JSON.parse(JSON.stringify(calcData.canonicalRuntimeSummary)), {
        offered: 4,
        applied: 4,
        rejected: 0,
        superseded: 4
    });
    assert.deepEqual(
        [...calcData.weaponModifiers["fixture-weapon"].modifiers.map((item) => item.id)].sort(),
        ["fixture_runtime_conditional", "fixture_runtime_damage"]
    );
    assert.deepEqual(
        [...calcData.artifactSetModifiers["fixture-set"].fourPiece.map((item) => item.id)],
        ["fixture_runtime_artifact"]
    );
    assert.deepEqual(
        [...calcData.talentModifiers["10000002"].passives.find((item) => item.sourceId === "combat1").modifiers.map((item) => item.id)],
        ["fixture_runtime_talent"]
    );
    assert.deepEqual(
        [...calcData.weaponEffectRegistry.weapons["fixture-weapon"].groups[0].modifierIds].sort(),
        ["fixture_runtime_conditional", "fixture_runtime_damage"]
    );

    const context = prepareContext(harness);
    assert.equal(context.calculationInput.schemaVersion, 2);
    assert.equal(context.calculationInput.source, "manual");
    assert.equal(context.characterId, context.calculationInput.characterId);
    assert.equal(context.weaponId, context.calculationInput.weapon.id);
    assert.deepEqual(
        JSON.parse(JSON.stringify(context.talentLevels)),
        JSON.parse(JSON.stringify(context.calculationInput.talents))
    );
    assert.deepEqual(
        JSON.parse(JSON.stringify(context.stats)),
        JSON.parse(JSON.stringify(context.calculationInput.stats))
    );
    const panel = sandbox.GenshinCalcConditions.conditionPanelState(context, calcData);
    const conditionalPanel = panel.complexConditionInputs.find((item) => item.modifierId === "fixture_runtime_conditional");
    assert.ok(conditionalPanel, "canonical conditionInput must reach the condition UI model");
    assert.equal(conditionalPanel.type, "option");
    assert.deepEqual([...conditionalPanel.options.map((item) => item.value)], ["enabled", "disabled"]);

    const enabled = sandbox.GenshinCalcEngine.calculateDamageRequest(context, calcData);
    const enabledNormal = normalResult(enabled);
    assert.ok(enabledNormal);
    const enabledIds = enabledNormal.breakdown.appliedModifiers.map((item) => item.modifier.id);
    [
        "fixture_runtime_damage",
        "fixture_runtime_conditional",
        "fixture_runtime_artifact",
        "fixture_runtime_talent"
    ].forEach((id) => assert.ok(enabledIds.includes(id), `${id} should be collected into the active calculation`));
    const partyCandidate = enabled.partyModifiers.find((item) => item.modifier.id === "fixture_runtime_talent");
    assert.ok(partyCandidate, "canonical talent route must reach party collection");
    assert.equal(partyCandidate.status, "ready");
    assert.equal(partyCandidate.targetOwner, "team");

    const disabledContext = clone(context);
    const conditionKey = "weapon:fixture-weapon:group:fixture_state";
    disabledContext.uiState.complexConditionByModifier = {
        [conditionKey]: { option: "disabled" }
    };
    const disabled = sandbox.GenshinCalcEngine.calculateDamageRequest(disabledContext, calcData);
    const disabledNormal = normalResult(disabled);
    assert.ok(disabledNormal);
    const disabledIds = disabledNormal.breakdown.appliedModifiers.map((item) => item.modifier.id);
    assert.equal(disabledIds.includes("fixture_runtime_conditional"), false);
    assert.ok(enabledNormal.nonCrit > disabledNormal.nonCrit, "condition UI state must affect the calculation result");
});

test("production canonical route contains only the reviewed representatives and synthetic fixture is not shipped", () => {
    const productionRuntime = readJson("games/genshin/data/v2/runtime/canonical-runtime.json");
    assert.equal(productionRuntime.summary.canonical, 2);
    assert.deepEqual(Object.keys(productionRuntime.modifiers), [
        "behavior-modifier:10000026:constellation-1-1:1",
        "genshin:v2:weapon:12516:w_12516_stat_1"
    ]);
    const manifestText = fs.readFileSync(path.join(root, "games", "genshin", "data", "data-v2-manifest.json"), "utf8");
    assert.doesNotMatch(manifestText, /genshinCanonicalUiRuntimeFixture|fixtures\.json/);
});

test("canonical weapons cannot fall through to prose-derived legacy metadata", async () => {
    const fixture = buildSyntheticCanonicalFixture();
    const data = buildSyntheticData(fixture);
    delete data.weaponEffectRegistry.weapons["fixture-weapon"];
    const harness = createHarness(data);
    const calcData = await harness.sandbox.GenshinCalcData.loadGenshinCalcData();
    assert.equal(calcData.canonicalRuntimeSummary.offered, 4);
    assert.equal(calcData.canonicalRuntimeSummary.applied, 2);
    assert.equal(calcData.canonicalRuntimeSummary.rejected, 2);
    assert.equal(calcData.weaponModifiers["fixture-weapon"].modifiers.some((item) => item.id === "fixture_runtime_damage"), false);
    assert.equal(calcData.weaponModifiers["fixture-weapon"].modifiers.some((item) => item.id === "fixture_runtime_conditional"), false);
    assert.ok(calcData.warnings.some((item) => /canonical weapon registry route missing/.test(item.message)));
});
