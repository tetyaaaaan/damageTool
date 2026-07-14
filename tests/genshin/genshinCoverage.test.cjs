const test = require("node:test");
const assert = require("node:assert/strict");
const { createBrowserScriptHarness, readJson } = require("./helpers/browserScriptHarness.cjs");

function loadAnalyzer() {
    return createBrowserScriptHarness(["games/js/genshinModifierAnalyzer.js"]).sandbox.GenshinModifierAnalyzer;
}

test("STEP 17 coverage contract keeps the complete modifier inventory classified", () => {
    const analyzer = loadAnalyzer();
    const files = [
        "artifact-set-modifiers.json",
        "constellation-modifiers.json",
        "talent-modifiers.json",
        "weapon-modifiers.json"
    ];
    const categoryTotals = new Map();
    const resourceClassifications = new Map();
    let modifierCount = 0;
    let complexConditionCount = 0;

    function walk(value, source) {
        if (Array.isArray(value)) {
            value.forEach((item, index) => walk(item, `${source}.${index}`));
            return;
        }
        if (!value || typeof value !== "object") return;
        if (value.category) {
            const analysis = analyzer.analyzeModifier({
                modifier: value,
                source,
                context: { mode: "uidMode" }
            });
            modifierCount += 1;
            categoryTotals.set(value.category, (categoryTotals.get(value.category) || 0) + 1);
            if (value.conditionInput) complexConditionCount += 1;
            if (analysis.resourceClassification) {
                resourceClassifications.set(
                    analysis.resourceClassification,
                    (resourceClassifications.get(analysis.resourceClassification) || 0) + 1
                );
            }
        }
        Object.entries(value).forEach(([key, item]) => walk(item, `${source}.${key}`));
    }

    files.forEach((file) => walk(readJson(`games/genshin/data/calc/${file}`), file));

    assert.equal(modifierCount, 1561);
    assert.equal(categoryTotals.get("statBonus"), 302);
    assert.equal(categoryTotals.get("extraDamage"), 156);
    assert.equal(categoryTotals.get("effectOverride"), 43);
    assert.equal(categoryTotals.get("additiveBaseDamage"), 32);
    assert.equal(categoryTotals.get("scalingBonus"), 27);
    assert.equal(complexConditionCount, 8);
    assert.equal(resourceClassifications.get("calculationInput"), 27);
    assert.equal(resourceClassifications.get("displayOnly"), 22);
    assert.equal(resourceClassifications.get("unsupported") || 0, 0);
});
