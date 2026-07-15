const test = require("node:test");
const assert = require("node:assert/strict");
const { createScenarioHarness } = require("./helpers/calcScenarioHarness.cjs");

test("STEP41 uses the final attack element for ordinary damage", () => {
    const { sandbox } = createScenarioHarness();
    const engine = sandbox.GenshinCalcEngine;

    assert.equal(engine.resolveDamageResistanceElement({ attackType: "normalAttack", element: "炎" }), "pyro");
    assert.equal(engine.resolveDamageResistanceElement({ attackType: "normalAttack", element: "physical" }), "physical");
    assert.equal(
        engine.resolveDamageResistanceElement(
            { attackType: "normalAttack", element: "水" },
            { damageElement: "炎" }
        ),
        "hydro"
    );
});

test("STEP41 maps standalone reaction damage to its defined resistance lane", () => {
    const { sandbox, calcData } = createScenarioHarness();
    const engine = sandbox.GenshinCalcEngine;
    const reactionEntry = { attackType: "reaction", damageType: "reaction" };
    const expected = {
        overload: "pyro",
        electroCharged: "electro",
        superconduct: "cryo",
        bloom: "dendro",
        burgeon: "dendro",
        hyperbloom: "dendro",
        shatter: "physical"
    };

    Object.entries(expected).forEach(([reactionId, element]) => {
        const reaction = calcData.reactionDefinitions.options[reactionId];
        assert.equal(engine.resolveDamageResistanceElement(reactionEntry, reaction), element, reactionId);
    });
});

test("STEP41 uses the selected swirl element and dedicated reaction element", () => {
    const { sandbox, calcData } = createScenarioHarness();
    const engine = sandbox.GenshinCalcEngine;
    const context = {
        reactionOptionKey: "swirl",
        reactionElement: "水"
    };
    const swirl = engine.hydrateReactionContext(context, calcData);

    assert.equal(
        engine.resolveDamageResistanceElement({ attackType: "reaction", damageType: "reaction" }, swirl),
        "hydro"
    );
    assert.equal(
        engine.resolveDamageResistanceElement(
            { directReactionId: "stellarConduct", element: "physical" },
            calcData.reactionDefinitions.options.stellarConduct
        ),
        "cryo"
    );
});
