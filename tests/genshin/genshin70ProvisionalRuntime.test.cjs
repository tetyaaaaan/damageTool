"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { createScenarioHarness, prepareScenarioInputs } = require("./helpers/calcScenarioHarness.cjs");

const root = path.resolve(__dirname, "../..");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));

function loaderApi() {
    const sandbox = { window: {}, console, fetch: async () => { throw new Error("fetch is not used"); } };
    vm.createContext(sandbox);
    ["genshinDataContract.js", "genshinCalcData.js"].forEach((name) => {
        vm.runInContext(fs.readFileSync(path.join(root, "games/js", name), "utf8"), sandbox, { filename: name });
    });
    return sandbox.window.GenshinCalcData;
}

function emptyCalcData() {
    return {
        characters: {}, weapons: {}, characterTalents: {}, characterConstellations: {},
        talentScalings: {}, talentModifiers: {}, constellationModifiers: {},
        weaponEffects: {}, weaponModifiers: {}, weaponEffectRegistry: { weapons: {} },
        reactionDefinitions: {
            options: { stellarSwirl: { calculationStatus: "dedicatedFormulaRequired", dedicatedKind: "formulaPending", standaloneDamage: false } },
            characterLevelMultipliers: {}
        }
    };
}

test("7.0 provisional loader connects actual IDs while preserving the non-canonical boundary", () => {
    const data = emptyCalcData();
    const warnings = [];
    const summary = loaderApi().applyProvisional70Data(data, [
        readJson("games/genshin/data/v2/candidates/7.0-provisional-characters.json"),
        readJson("games/genshin/data/v2/candidates/7.0-provisional-weapons.json"),
        readJson("games/genshin/data/v2/candidates/7.0-provisional-stellar-swirl.json")
    ], warnings);

    assert.equal(summary.active, true);
    assert.equal(summary.canonicalEligibilityGranted, false);
    assert.equal(summary.rejected, 0);
    assert.deepEqual(warnings, []);
    assert.deepEqual(Object.keys(data.characters), ["10000148", "10000150"]);
    assert.equal(Object.keys(data.weapons).length, 12);
    assert.equal(data.characters["10000148"].dataStatus, "provisional");
    assert.equal(data.characterTalents["10000150"].skill.nameJa, "柔きファントムの夜の舞");
    assert.ok(data.talentScalings["10000148"].skill.entries.length > 0);
    assert.equal(data.characterConstellations["10000150"].constellations["6"].nameJa.includes("永遠の空"), true);
    assert.equal(data.reactionDefinitions.options.stellarSwirl.calculationStatus, "supported");
    assert.equal(data.reactionDefinitions.options.stellarSwirl.dataStatus, "provisional");
});

test("7.0 provisional loader never replaces an existing canonical entity", () => {
    const data = emptyCalcData();
    data.characters["10000148"] = { nameJa: "canonical sentinel" };
    const summary = loaderApi().applyProvisional70Data(data, [
        readJson("games/genshin/data/v2/candidates/7.0-provisional-characters.json")
    ], []);

    assert.equal(data.characters["10000148"].nameJa, "canonical sentinel");
    assert.ok(summary.skippedCanonical >= 1);
});

test("7.0 provisional loader rejects contradictory boundary flags and protects a canonical reaction sentinel", () => {
    const api = loaderApi();
    const contradictory = readJson("games/genshin/data/v2/candidates/7.0-provisional-characters.json");
    contradictory.canonical = true;
    const rejectedData = emptyCalcData();
    const rejected = api.applyProvisional70Data(rejectedData, [contradictory], []);
    assert.equal(rejected.rejected, 1);
    assert.deepEqual(Object.keys(rejectedData.characters), []);

    const data = emptyCalcData();
    data.reactionDefinitions.options.stellarSwirl = {
        reactionId: "stellarSwirl",
        dedicatedKind: "formulaPending",
        calculationStatus: "dedicatedFormulaRequired",
        standaloneDamage: false,
        dataStatus: "canonical"
    };
    const summary = api.applyProvisional70Data(data, [
        readJson("games/genshin/data/v2/candidates/7.0-provisional-stellar-swirl.json")
    ], []);
    assert.equal(data.reactionDefinitions.options.stellarSwirl.dataStatus, "canonical");
    assert.equal(summary.skippedCanonical, 1);
});

test("Alyosha and Odette talent entries calculate, and Alyosha's ER condition changes production output", () => {
    const h = createScenarioHarness();
    loaderApi().applyProvisional70Data(h.calcData, [
        readJson("games/genshin/data/v2/candidates/7.0-provisional-characters.json"),
        readJson("games/genshin/data/v2/candidates/7.0-provisional-stellar-swirl.json")
    ], []);

    prepareScenarioInputs(h.elements, {
        characterId: "10000148",
        stats: { atk: 2000, energyRecharge: 200, critRate: 0, critDamage: 0 }
    });
    h.elements.genshinJsonEnableCharacterCondition.checked = false;
    const offRequest = h.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    const off = h.sandbox.GenshinCalcEngine.calculateDamageRequest(offRequest, h.calcData);
    const skillEntry = off.results.find((item) => item.entry?.group === "skill");
    assert.ok(skillEntry?.nonCrit > 0);

    h.elements.genshinJsonEnableCharacterCondition.checked = true;
    const onRequest = h.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    const on = h.sandbox.GenshinCalcEngine.calculateDamageRequest(onRequest, h.calcData);
    const boostedSkill = on.results.find((item) => item.entry?.id === skillEntry.entry.id);
    assert.ok(boostedSkill.nonCrit > skillEntry.nonCrit, JSON.stringify({
        off: skillEntry.nonCrit,
        on: boostedSkill.nonCrit,
        requestComplex: onRequest.uiState.complexConditionByModifier,
        conditionState: on.context.uiState.conditionByModifier,
        candidates: on.candidateModifiers.filter((item) => String(item.modifier?.id).includes("passive2")).map((item) => ({ reason: item.reason, analysis: item.analysis }))
    }));

    prepareScenarioInputs(h.elements, {
        characterId: "10000150",
        stats: { atk: 2000, critRate: 0, critDamage: 0 }
    });
    const odette = h.sandbox.GenshinCalcEngine.calculateDamageRequest(
        h.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm(), h.calcData
    );
    assert.ok(odette.results.some((item) => item.entry?.group === "skill" && item.nonCrit > 0));
});
