const test = require("node:test");
const assert = require("node:assert/strict");
const { createScenarioHarness } = require("./helpers/calcScenarioHarness.cjs");

function context(enemy = {}) {
    return {
        enemy: {
            characterLevel: 90,
            enemyLevel: 90,
            defenseReduction: 0,
            defenseIgnore: 0,
            ...enemy
        }
    };
}

test("STEP42 multiplies defense reduction and defense ignore as separate factors", () => {
    const { sandbox } = createScenarioHarness();
    const engine = sandbox.GenshinCalcEngine;
    const actual = engine.defenseMultiplier(context({ defenseReduction: 30, defenseIgnore: 60 }));
    const expected = 190 / (190 + 190 * 0.7 * 0.4);

    assert.equal(actual, expected);
    assert.notEqual(actual, engine.defenseMultiplier(context({ defenseReduction: 90, defenseIgnore: 0 })));
});

test("STEP42 caps defense reduction at 90 percent and defense ignore at 100 percent", () => {
    const { sandbox } = createScenarioHarness();
    const engine = sandbox.GenshinCalcEngine;

    assert.equal(engine.resolveDefenseReduction({ defenseReduction: 120 }), 90);
    assert.equal(engine.resolveDefenseReduction({ defenseDebuff: 30 }), 30);
    assert.equal(engine.resolveDefenseIgnore({ defenseIgnore: 120 }), 100);
    assert.equal(
        engine.defenseMultiplier(context({ defenseReduction: 120 })),
        engine.defenseMultiplier(context({ defenseReduction: 90 }))
    );
});

test("STEP42 respects attack scopes and excludes reaction-only entries", () => {
    const { sandbox } = createScenarioHarness();
    const engine = sandbox.GenshinCalcEngine;
    const burstOnly = { category: "defenseIgnore", applyTo: ["enemyDefense", "burstDamage"] };

    assert.equal(engine.defenseModifierAppliesToEntry(burstOnly, { attackType: "burst", damageType: "burst" }), true);
    assert.equal(engine.defenseModifierAppliesToEntry(burstOnly, { attackType: "normalAttack", damageType: "normalAttack" }), false);
    assert.equal(engine.defenseModifierAppliesToEntry(
        { category: "defenseIgnore", applyTo: ["enemyDefense"], targetGroups: ["burst"] },
        { attackType: "burst", damageType: "burst", group: "burst" }
    ), true);
    assert.equal(engine.defenseModifierAppliesToEntry(
        { category: "defenseIgnore", applyTo: ["enemyDefense"], targetGroups: ["burst"] },
        { attackType: "skill", damageType: "skill", group: "skill" }
    ), false);
    assert.equal(engine.defenseModifierAppliesToEntry(
        { category: "defenseDebuff", applyTo: ["enemyDefense"] },
        { attackType: "reaction", damageType: "reaction" }
    ), false);
    assert.equal(engine.defenseModifierAppliesToEntry(
        { category: "defenseDebuff", applyTo: ["enemyDefense"] },
        { attackType: "skill", damageType: "skill" }
    ), true);
});
