"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { createScenarioHarness } = require("./helpers/calcScenarioHarness.cjs");
const { repositoryRoot } = require("./helpers/browserScriptHarness.cjs");

const candidate = require("../../games/genshin/data/v2/candidates/7.0-provisional-weapons.json");
const WEAPON_IDS = ["11520", "11521", "11436", "12436", "13436", "14436", "15436", "11435", "12435", "13435", "14435", "15435"];

function installCandidate(calcData) {
    Object.assign(calcData.weapons, candidate.weapons);
    Object.assign(calcData.weaponModifiers, candidate.weaponModifiers);
    calcData.weaponEffectRegistry.weapons = {
        ...calcData.weaponEffectRegistry.weapons,
        ...candidate.weaponEffectRegistry.weapons
    };
    Object.assign(calcData.weaponEffects || (calcData.weaponEffects = {}), candidate.weaponEffects);
}

function context({ weaponId, refinement = 1 } = {}) {
    return {
        characterId: "10000037",
        weaponId,
        refinement,
        artifactSetMode: "",
        artifactSetIds: [],
        constellation: 0,
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        stats: {
            hp: 20000,
            baseAtk: 1000,
            atk: 2000,
            baseDef: 1000,
            def: 1000,
            elementalMastery: 100,
            energyRecharge: 100,
            critRate: 50,
            critDamage: 100,
            elementDamageBonus: 0
        },
        enemy: { resistanceDebuff: 0, defenseDebuff: 0, defenseIgnore: 0 },
        manualInputs: { recordedHealing: null, providerStats: {}, resourceStates: {} },
        uiState: {
            enableCharacterCondition: false,
            enableWeaponLowHpCondition: false,
            constellationConditions: {},
            stackByModifier: {},
            conditionByModifier: {},
            toggleByModifier: {},
            complexConditionByModifier: {}
        },
        mode: "uidMode"
    };
}

function weaponConditionKey(sandbox, weaponId) {
    const raw = candidate.weaponModifiers[weaponId].modifiers[0];
    const definition = candidate.weaponEffectRegistry.weapons[weaponId];
    const normalized = sandbox.GenshinCalcEngine.normalizeWeaponModifier(raw, candidate.weaponModifiers[weaponId].modifiers, definition);
    return sandbox.GenshinModifierAnalyzer.modifierStateKey(normalized, `weapon:${weaponId}`);
}

test("7.0 provisional weapons expose all metadata and synced image assets", () => {
    assert.equal(candidate.status, "candidatePrepared");
    assert.equal(candidate.nonCanonical, true);
    assert.equal(candidate.labelJa, "検証中");
    assert.deepEqual(Object.keys(candidate.weapons).sort(), [...WEAPON_IDS].sort());

    WEAPON_IDS.forEach((id) => {
        const weapon = candidate.weapons[id];
        assert.ok(weapon.nameJa);
        assert.ok(weapon.weaponType);
        assert.ok(Number.isInteger(weapon.rarity));
        assert.match(weapon.imagePath, new RegExp(`/weapons/${id}\\.webp$`));
        const imagePath = path.join(repositoryRoot, "games", "images", "genshin", "weapons", `${id}.webp`);
        assert.equal(fs.existsSync(imagePath), true, `missing provisional weapon image: ${id}`);
    });
});

test("7.0 provisional weapon registry references only declared provisional modifiers", () => {
    WEAPON_IDS.forEach((weaponId) => {
        const declared = new Set(candidate.weaponModifiers[weaponId].modifiers.map((modifier) => modifier.id));
        const groups = candidate.weaponEffectRegistry.weapons[weaponId].groups;
        assert.ok(groups.length > 0);
        groups.forEach((group) => {
            assert.ok(group.id);
            assert.ok(group.name);
            assert.ok(["always", "toggle", "stack", "option", "displayOnly"].includes(group.activation.type));
            assert.ok(["reflected", "calculate", "sourceContext", "displayOnly"].includes(group.inputPolicy));
            group.modifierIds.forEach((modifierId) => {
                assert.equal(declared.has(modifierId), true, `${weaponId}/${group.id} references ${modifierId}`);
                assert.match(modifierId, /^provisional70_/);
            });
        });
    });
});

test("異端を狩る熔刃は距離補間なしの最小／最大選択でATK計算結果が変わる", () => {
    const { sandbox, calcData } = createScenarioHarness();
    installCandidate(calcData);
    const entry = { id: "provisional_weapon_entry", attackType: "normalAttack", damageType: "normal", element: "炎", scalings: [] };
    const values = {};

    ["min", "max"].forEach((option) => {
        const calcContext = context({ weaponId: "11435" });
        calcContext.uiState.conditionByModifier[weaponConditionKey(sandbox, "11435")] = {
            enabled: true,
            stack: 0,
            option
        };
        const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
        const applied = sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(entry, calcContext, collected);
        values[option] = applied.totals.statBonus.atk;
        assert.equal(collected.applied.filter((item) => item.source === "weapon:11435").length, 1);
    });

    assert.equal(values.min, 180);
    assert.equal(values.max, 360);
    assert.ok(values.max > values.min);
    assert.equal(candidate.weapons["11435"].distanceInterpolation, "deferred");
    assert.match(candidate.weapons["11435"].distanceNoteJa, /自動補間/);
});

test("星鋒の剣はR1-R3のみ計算し、未確認R4/R5はmodifierを適用せず警告候補にする", () => {
    assert.deepEqual(candidate.weapons["11521"].confirmedRefinements, [1, 2, 3]);
    assert.deepEqual(candidate.weapons["11521"].disabledRefinements, [4, 5]);
    assert.deepEqual(candidate.weaponModifiers["11521"].confirmedRefinements, [1, 2, 3]);
    assert.deepEqual(candidate.weaponModifiers["11521"].disabledRefinements, [4, 5]);

    const { sandbox, calcData } = createScenarioHarness();
    installCandidate(calcData);

    const confirmed = context({ weaponId: "11521", refinement: 3 });
    confirmed.uiState.conditionByModifier[weaponConditionKey(sandbox, "11521")] = {
        enabled: true,
        stack: 1,
        option: ""
    };
    const confirmedCollected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, confirmed);
    assert.ok(confirmedCollected.applied.some((item) => item.modifier.id === "provisional70_w11521_resonance_crit"));
    assert.equal(confirmedCollected.candidates.some((item) => item.analysis?.reasonCode === "UNVERIFIED_REFINEMENT"), false);

    [4, 5].forEach((refinement) => {
        const unverified = context({ weaponId: "11521", refinement });
        unverified.uiState.conditionByModifier[weaponConditionKey(sandbox, "11521")] = {
            enabled: true,
            stack: 1,
            option: ""
        };
        const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, unverified);
        assert.equal(collected.applied.some((item) => item.source === "weapon:11521"), false);
        const warnings = collected.candidates.filter((item) => item.source === "weapon:11521");
        assert.ok(warnings.length > 0);
        assert.ok(warnings.every((item) => item.analysis?.reasonCode === "UNVERIFIED_REFINEMENT"));
        assert.ok(warnings.every((item) => String(item.reason).includes(`R${refinement}は未確認`)));
    });
});
