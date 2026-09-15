"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
    createScenarioHarness,
    prepareScenarioInputs,
    setElement
} = require("./helpers/calcScenarioHarness.cjs");

const ROOT = path.resolve(__dirname, "../..");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));

const CHARACTER_IDS = ["10000120", "10000122", "10000125", "10000126", "10000130", "10000133"];

test("7.0ローカルキャラクターの計算依存データとdirect reaction mappingが接続されている", () => {
    const characters = readJson("games/genshin/data/characters.json");
    const baseStats = readJson("games/genshin/data/base-stats.json");
    const talents = readJson("games/genshin/data/character-talents.json");
    const constellations = readJson("games/genshin/data/character-constellations.json");
    const scalings = readJson("games/genshin/data/calc/talent-scalings.json");
    const reactions = readJson("games/genshin/data/calc/reaction-definitions.json");

    for (const characterId of CHARACTER_IDS) {
        assert.ok(characters[characterId], `${characterId}: catalog`);
        assert.ok(baseStats.characters?.[characterId], `${characterId}: base stats`);
        assert.ok(talents[characterId], `${characterId}: source-text talents`);
        assert.ok(constellations[characterId], `${characterId}: source-text constellations`);
        assert.ok(scalings[characterId], `${characterId}: talent scalings`);

        const rules = reactions.directReactionEntryRules?.[characterId] || {};
        assert.ok(Object.keys(rules).length, `${characterId}: direct reaction rules`);
        for (const [group, entries] of Object.entries(rules)) {
            for (const [entryId, reactionId] of Object.entries(entries)) {
                assert.ok(
                    (scalings[characterId]?.[group]?.entries || []).some((entry) => entry.id === entryId),
                    `${characterId}.${group}.${entryId}: scaling entry`
                );
                assert.equal(
                    reactions.options?.[reactionId]?.calculationStatus,
                    "supported",
                    `${characterId}.${group}.${entryId}: supported reaction`
                );
            }
        }
    }
});

test("7.0 direct reaction entries reach the engine without an unresolved route", () => {
    const reactions = readJson("games/genshin/data/calc/reaction-definitions.json");
    for (const characterId of CHARACTER_IDS) {
        const { sandbox, calcData, elements } = createScenarioHarness();
        prepareScenarioInputs(elements, { characterId, stats: { atk: 2000, baseAtk: 1000 } });
        const request = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
        const output = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
        const expected = Object.values(reactions.directReactionEntryRules[characterId] || {})
            .flatMap((entries) => Object.entries(entries));
        for (const [entryId, reactionId] of expected) {
            const result = output.results.find((item) => item.entry?.id === entryId);
            assert.ok(result, `${characterId}.${entryId}: result`);
            assert.equal(result.entry.dedicatedReactionId, reactionId, `${characterId}.${entryId}: reaction id`);
            assert.equal(result.problems?.length || 0, 0, `${characterId}.${entryId}: no unresolved problem`);
        }
    }
});

test("星拡散は公式存在証拠を表示経路へ接続するが、式未確定のまま計算を有効化しない", () => {
    const reactions = readJson("games/genshin/data/calc/reaction-definitions.json");
    const stellarSwirl = reactions.options.stellarSwirl;
    assert.equal(stellarSwirl.existenceVerification, "officialVersionBound");
    assert.equal(stellarSwirl.existenceGameVersion, "7.0");
    assert.equal(stellarSwirl.calculationStatus, "dedicatedFormulaRequired");
    assert.equal(Object.prototype.hasOwnProperty.call(stellarSwirl, "directCoefficient"), false);

    const { sandbox, calcData, elements } = createScenarioHarness();
    prepareScenarioInputs(elements, { characterId: "10000133", stats: { atk: 2000, baseAtk: 1000 } });
    setElement(elements, "genshinJsonReactionOption", "stellarSwirl");
    setElement(elements, "genshinJsonReactionElement", "炎");
    const request = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    const output = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    assert.equal(output.reactionState.reactionId, "stellarSwirl");
    assert.equal(output.reactionState.calculated, false);
    assert.match(output.reactionState.unsupportedReason, /証拠|係数|式/);
});
