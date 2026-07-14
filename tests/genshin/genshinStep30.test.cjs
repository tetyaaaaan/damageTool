const test = require("node:test");
const assert = require("node:assert/strict");
const {
    createBrowserScriptHarness,
    loadCalcData,
    readJson
} = require("./helpers/browserScriptHarness.cjs");
const { buildRegistry, renderMarkdown } = require("../../scripts/genshinConstellationRegistry.cjs");

function createHarness() {
    return createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
}

test("STEP30 registry covers every character from C1 through C6", () => {
    const characters = readJson("games/genshin/data/characters.json");
    const registry = readJson("games/genshin/data/calc/constellation-effect-registry.json");
    assert.equal(registry.summary.characters, Object.keys(characters).length);
    assert.equal(registry.summary.constellationLevels, Object.keys(characters).length * 6);
    assert.equal(registry.summary.issues, 0);
    Object.keys(characters).forEach((characterId) => {
        assert.deepEqual(Object.keys(registry.characters[characterId].constellations), ["1", "2", "3", "4", "5", "6"]);
    });
});

test("STEP30 registry is reproducible from the pinned source index", () => {
    const sourceIndex = readJson("games/genshin/data/calc/constellation-source-index.json");
    const committed = readJson("games/genshin/data/calc/constellation-effect-registry.json");
    assert.deepEqual(buildRegistry({ sourceIndex }), committed);
    assert.equal(sourceIndex.projects.genshinOptimizer.revision, "0c9bde8f99ec1561e66aa0114668e8cdc0b8aca2");
    assert.equal(sourceIndex.projects.gcsim.revision, "6d373678e949d30e91d390f418d930de09eeb547");
    assert.equal(sourceIndex.projects.genshinOptimizer.license, "MIT");
    assert.equal(sourceIndex.projects.gcsim.license, "MIT");
});

test("Ganyu C1 is corroborated by both pinned OSS implementations", () => {
    const registry = readJson("games/genshin/data/calc/constellation-effect-registry.json");
    const effect = registry.effectsById.c_10000037_1_1;
    assert.equal(effect.verificationStatus, "corroborated");
    assert.deepEqual(effect.evidence.externalNumericHints, ["genshinOptimizer", "gcsim"]);
    assert.equal(effect.numericValues[0].value, -15);
});

test("misclassified constellation records are quarantined and corrected damage records are calculable", () => {
    const sandbox = createHarness();
    const data = loadCalcData().constellationModifiers;
    const quarantined = [
        data["10000044"].constellations["2"].find((item) => item.id === "c_10000044_2_1"),
        data["10000048"].constellations["1"].find((item) => item.id === "c_10000048_1_1_resolved_2"),
        data["10000103"].constellations["1"].find((item) => item.id === "c_10000103_1_1_resolved_2"),
        data["10000103"].constellations["6"].find((item) => item.id === "c_10000103_6_1_resolved_3")
    ];
    quarantined.forEach((modifier) => {
        const analysis = sandbox.GenshinModifierAnalyzer.analyzeModifier({ modifier, source: "constellation:C6", context: { mode: "manualMode" } });
        assert.equal(analysis.supportStatus, "displayOnly");
        assert.equal(analysis.calculable, false);
    });

    const chiori = data["10000094"].constellations["6"].find((item) => item.id === "c_10000094_6_1_resolved_1");
    const xilonen = data["10000103"].constellations["6"].find((item) => item.id === "c_10000103_6_1_resolved_2");
    [chiori, xilonen].forEach((modifier) => {
        const analysis = sandbox.GenshinModifierAnalyzer.analyzeModifier({ modifier, source: "constellation:C6", context: { mode: "manualMode", manualInputs: {} } });
        assert.equal(modifier.category, "additiveBaseDamage");
        assert.equal(analysis.calculable, true);
    });
    assert.equal(sandbox.GenshinCalcEngine.resolveModifierValue(chiori, { manualInputs: {}, uiState: {} }), 235);
    assert.equal(sandbox.GenshinCalcEngine.resolveModifierValue(xilonen, { manualInputs: {}, uiState: {} }), 300);
});

test("structured constellation values do not fall back to MISSING_VALUE", () => {
    const sandbox = createHarness();
    const modifiers = loadCalcData().constellationModifiers;
    const missing = [];
    Object.entries(modifiers).forEach(([characterId, entry]) => {
        Object.entries(entry.constellations || {}).forEach(([level, items]) => {
            items.forEach((modifier) => {
                const analysis = sandbox.GenshinModifierAnalyzer.analyzeModifier({
                    modifier,
                    source: `constellation:C${level}`,
                    context: { mode: "manualMode", characterId, manualInputs: { providerStats: {}, resourceStates: {} }, uiState: {} }
                });
                if (analysis.reasonCode === "MISSING_VALUE") missing.push(modifier.id);
            });
        });
    });
    assert.deepEqual(missing, []);

    const alhaitham = modifiers["10000078"].constellations["2"].find((item) => item.id === "c_10000078_2_1_v10");
    const value = sandbox.GenshinCalcEngine.resolveModifierValue(alhaitham, {
        manualInputs: {},
        uiState: { stackByModifier: { [alhaitham.id]: 3 } }
    });
    assert.equal(value, 150);
});

test("calc-data validation accepts constellation-specific structured value fields", () => {
    const sandbox = createBrowserScriptHarness(["games/js/genshinCalcData.js"]).sandbox;
    sandbox.console.warn = () => {};
    const warnings = sandbox.GenshinCalcData.validateCalcData(loadCalcData());
    const structuredIds = [
        "c_10000073_2_1_resolved_1",
        "c_10000078_2_1_v10",
        "c_10000078_4_1_v10",
        "c_10000078_4_2_v10",
        "c_10000091_6_1_v10",
        "c_10000109_6_1_resolved_1",
        "c_10000130_1_3"
    ];
    structuredIds.forEach((id) => {
        assert.equal(warnings.some((warning) => warning.message.includes(id)), false, `${id} produced a validation warning`);
    });
});

test("STEP30 report is readable and records no unresolved numeric issue", () => {
    const registry = readJson("games/genshin/data/calc/constellation-effect-registry.json");
    const markdown = renderMarkdown(registry);
    assert.match(markdown, /原神 命ノ星座効果監査/);
    assert.match(markdown, /要確認: 0/);
});
