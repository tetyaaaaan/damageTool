const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createScenarioHarness, prepareScenarioInputs } = require("./helpers/calcScenarioHarness.cjs");
const test = require("node:test");

const rendererPath = path.resolve(__dirname, "../../games/js/genshinCalcRenderer.js");
const enginePath = path.resolve(__dirname, "../../games/js/genshinCalcEngine.js");
const definitionsPath = path.resolve(__dirname, "../../games/genshin/data/calc/reaction-definitions.json");
const weaponModifiersPath = path.resolve(__dirname, "../../games/genshin/data/calc/weapon-modifiers.json");

test("増幅反応の選択肢は倍率とダメージ元素を表示する", () => {
    const source = fs.readFileSync(rendererPath, "utf8");

    assert.doesNotMatch(source, /増幅反応（計算対応）/);
    assert.match(source, /\["増幅反応",/);
    assert.match(source, /\["melt15", "溶解 1\.5　氷ダメ"\]/);
    assert.match(source, /\["melt20", "溶解 2\.0　炎ダメ"\]/);
    assert.match(source, /\["vaporize15", "蒸発 1\.5　炎ダメ"\]/);
    assert.match(source, /\["vaporize20", "蒸発 2\.0　水ダメ"\]/);
});

test("星拡散は共通reaction経路へ登録され、式未確定時はfail-closedで表示する", () => {
    const renderer = fs.readFileSync(rendererPath, "utf8");
    const engine = fs.readFileSync(enginePath, "utf8");
    const definitions = JSON.parse(fs.readFileSync(definitionsPath, "utf8"));
    const modifiers = JSON.parse(fs.readFileSync(weaponModifiersPath, "utf8"));
    const stellarSwirl = definitions.options.stellarSwirl;
    const transcendence = modifiers["12516"].modifiers.find((item) => item.id === "w_12516_reaction_bonus_2");

    assert.equal(stellarSwirl.reactionId, "stellarSwirl");
    assert.equal(stellarSwirl.calculationStatus, "dedicatedFormulaRequired");
    assert.equal(stellarSwirl.existenceVerification, "officialVersionBound");
    assert.equal(stellarSwirl.existenceGameVersion, "7.0");
    assert.deepEqual(stellarSwirl.triggerElements, ["Anemo", "Cryo"]);
    assert.equal(stellarSwirl.canCrit, true);
    assert.match(stellarSwirl.unsupportedReasonJa, /証拠/);
    assert.ok(transcendence.applyTo.includes("stellarSwirlDamageBonus"));
    assert.match(engine, /stellarSwirl:\s*"stellarSwirlDamageBonus"/);
    assert.match(renderer, /context\.reactionDefinitions\?\.options/);
    assert.match(renderer, /星拡散する元素/);
});

test("式未確定の星拡散をdirect reactionへ誤接続しても係数1で計算しない", () => {
    const { sandbox, calcData, elements } = createScenarioHarness();
    calcData.reactionDefinitions.directReactionEntryRules["10000016"] = { normalAttack: { normal_1damage: "stellarSwirl" } };
    prepareScenarioInputs(elements, { characterId: "10000016", stats: { atk: 2000, baseAtk: 1000 } });
    const request = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    const calculation = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const result = calculation.results.find((entry) => entry.entry?.id === "normal_1damage");
    assert.ok(result);
    assert.equal(result.entry.dedicatedReactionId, "stellarSwirl");
    assert.equal(result.nonCrit, 0);
    assert.ok(result.problems.some((message) => /未登録|fail-closed|証拠/.test(message)));
});
