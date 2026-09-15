"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { createBrowserScriptHarness } = require("./helpers/browserScriptHarness.cjs");
const { createScenarioHarness, prepareScenarioInputs } = require("./helpers/calcScenarioHarness.cjs");

const root = path.resolve(__dirname, "..", "..");
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));

test("weapon 12516 retains its verified 6.7 route while production holds the overlay for 7.0 revalidation", () => {
    const sources = read("games/genshin/data/v2/weapons/source-records.json");
    const spec = read("games/genshin/data/v2/weapons/spec-candidates.json").w_12516_stat_1;
    const runtime = read("games/genshin/data/v2/runtime/canonical-runtime.json");
    const modifierId = "genshin:v2:weapon:12516:w_12516_stat_1";
    assert.deepEqual(spec.sourceRefs.sort(), ["genshin-db:weapon:12516:1bab2cd", "hoyowiki:genshin:weapon:12516:stat-clause"].sort());
    spec.sourceRefs.forEach((ref) => {
        assert.equal(sources[ref].gameVersion, "6.7");
        assert.equal(sources[ref].strictGameVersionBinding, true);
    });
    assert.equal(spec.verification.status, "verified");
    assert.equal(spec.verification.canonicalEligibility, true);
    assert.ok(runtime.modifiers[modifierId]);

    const scenario = createScenarioHarness();
    const loader = createBrowserScriptHarness(["games/js/genshinDataContract.js", "games/js/genshinCalcData.js"]).sandbox.GenshinCalcData;
    const productionSummary = loader.applyCanonicalRuntime(scenario.calcData, runtime, scenario.calcData.warnings);
    assert.equal(productionSummary.applied, 0);
    assert.equal(productionSummary.inactivePendingRevalidation, 2);
    assert.equal(scenario.calcData.weaponModifiers["12516"].modifiers.some((item) => item.id === "w_12516_stat_1"), true);
    const historicalRuntime = structuredClone(runtime);
    historicalRuntime.versionAvailability = { status: "active", activeForProduction: true };
    const summary = loader.applyCanonicalRuntime(scenario.calcData, historicalRuntime, scenario.calcData.warnings);
    assert.deepEqual(
        JSON.parse(JSON.stringify(summary)),
        { offered: 2, applied: 2, rejected: 0, superseded: 1 },
        JSON.stringify(scenario.calcData.warnings, null, 2)
    );
    const weaponModifiers = scenario.calcData.weaponModifiers["12516"].modifiers;
    assert.equal(weaponModifiers.some((item) => item.id === "w_12516_stat_1"), false);
    const canonical = weaponModifiers.find((item) => item.id === modifierId);
    assert.ok(canonical);
    assert.deepEqual(canonical.valueByRefinement, { "1": 28, "2": 35, "3": 42, "4": 49, "5": 56 });
    assert.equal(canonical.stack, undefined);

    prepareScenarioInputs(scenario.elements, { characterId: "10000016", weaponId: "12516", stats: { atk: 2000, baseAtk: 1000 } });
    scenario.elements.genshinWeaponRefinement.value = "R5";
    const request = scenario.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    assert.equal(request.weaponId, "12516");
    assert.equal(request.refinement, 5);
    request.inputProvenance = { source: "manual", includesPersistentBonuses: true, additivePolicy: "externalModifiersOnly" };
    const panel = scenario.sandbox.GenshinCalcConditions.conditionPanelState(request, scenario.calcData);
    assert.equal(panel.complexConditionInputs.some((item) => item.modifierId === modifierId), false, "always reflected ATK must not create a result-value toggle");
    const analysis = scenario.sandbox.GenshinModifierAnalyzer.analyzeModifier({ modifier: canonical, source: "weapon:12516", context: request });
    assert.equal(analysis.inputStatus, "includedInInput");
    const calculation = scenario.sandbox.GenshinCalcEngine.calculateDamageRequest(request, scenario.calcData);
    assert.ok(calculation.results.length > 0);
    assert.equal(calculation.context.effectiveStats.atk, 2000, "canonical persistent ATK must not be double-added to the final ATK input");
    assert.equal(calculation.statTrace.some((item) => item.modifierId === modifierId), false);
});
