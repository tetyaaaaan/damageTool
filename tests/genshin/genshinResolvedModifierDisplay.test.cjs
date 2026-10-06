"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const { createScenarioHarness, prepareScenarioInputs } = require("./helpers/calcScenarioHarness.cjs");

const repositoryRoot = path.resolve(__dirname, "..", "..");

function loadRenderer() {
    const sandbox = {
        document: { addEventListener() {} },
        window: {}
    };
    vm.createContext(sandbox);
    const rendererPath = path.join(repositoryRoot, "games/js/genshinCalcRenderer.js");
    vm.runInContext(fs.readFileSync(rendererPath, "utf8"), sandbox, { filename: rendererPath });
    return sandbox.window.GenshinCalcRenderer;
}

function makeResult(trace) {
    return {
        entry: {},
        breakdown: {
            appliedModifiers: [{
                source: "test",
                value: 0.5,
                modifier: { category: "statBonus", effectLabel: "HPから攻撃力", unit: "flat" }
            }],
            statTrace: [trace]
        }
    };
}

test("resolved modifier display uses trace value without a raw coefficient in parentheses", () => {
    const renderer = loadRenderer();
    const result = makeResult({ source: "test", stat: "atk", value: 50 });

    const effect = renderer.buildDamageBreakdownViewModel(result).base.effects[0];

    assert.equal(effect.value, "+50");
    assert.equal(effect.value.includes("(") || effect.value.includes("（"), false);
});

test("reference stat traces continue to show their calculation basis", () => {
    const renderer = loadRenderer();
    const result = makeResult({
        source: "test",
        stat: "atk",
        value: 200,
        referenceStat: "hp",
        referenceValue: 1000,
        coefficient: 0.2
    });

    const effect = renderer.buildDamageBreakdownViewModel(result).base.effects[0];

    assert.match(effect.value, /\+200/);
    assert.match(effect.value, /HP/);
    assert.match(effect.value, /1,000 × 0\.2/);
});

test("Nilou C6 passes the actual fractional critical bonus to the display", () => {
    const fixture = createScenarioHarness();
    prepareScenarioInputs(fixture.elements, {
        characterId: "10000070", constellation: 6,
        stats: { hp: 49999, atk: 1000, critRate: 0, critDamage: 0 }
    });
    const engine = fixture.sandbox.GenshinCalcEngine;
    const payload = engine.calculateDamageRequest(engine.buildCalculationRequestFromForm(), fixture.calcData);
    const row = payload.results.find((item) => item.breakdown.appliedModifiers.some((effect) => effect.modifier.id === "c_10000070_6_1"));
    assert.ok(row, "a critical damage result contains Nilou C6");
    const actual = row.breakdown.appliedModifiers.filter((item) => /^c_10000070_6_[12]$/.test(item.modifier.id));
    assert.equal(actual.length, 2);
    assert.ok(Math.abs(actual.find((item) => item.modifier.id.endsWith("_1")).value - 29.9994) < 1e-9);
    assert.ok(Math.abs(actual.find((item) => item.modifier.id.endsWith("_2")).value - 59.9988) < 1e-9);
    const effects = loadRenderer().buildDamageBreakdownViewModel(row).critical.effects;
    assert.ok(effects.some((effect) => effect.value.startsWith("+30")));
    assert.ok(effects.some((effect) => effect.value.startsWith("+60")));
    assert.ok(!effects.some((effect) => effect.value.includes("（+0")));
});
