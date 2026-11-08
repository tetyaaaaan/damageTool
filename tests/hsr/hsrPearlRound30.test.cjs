"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProductionFixture, attackOf, makeRequest, assertClose } = require("./helpers/hsrDirectVerification.cjs");

const fixedMultiplierByLevel = [10, 11, 12, 13, 14, 15];
const stats = { atk: 2719.5, hp: 8234.25, def: 1927.75, critRate: 37.5, critDamage: 148.25, elation: 132.5, merrymake: 18.75 };

function independentElationDamage(percent, certifiedBanger) {
    const levelBase = 7535.107;
    const elation = 1 + stats.elation / 100;
    const banger = 1 + 5 * certifiedBanger / (certifiedBanger + 240);
    const merrymake = 1 + stats.merrymake / 100;
    const defense = 100 / (100 + 100);
    const resistance = 1 - 20 / 100;
    const toughness = 0.9;
    const base = levelBase * percent / 100 * elation * banger * merrymake * defense * resistance * toughness;
    const critMultiplier = 1 + stats.critDamage / 100;
    const expectedCritMultiplier = 1 + stats.critRate / 100 * (critMultiplier - 1);
    return { nonCrit: base, crit: base * critMultiplier, expected: base * expectedCritMultiplier };
}

test("Round30 Pearl 150308 own Elation rider uses only Pearl snapshot and E0 Normal Lv1-6", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "1503081");
    assert.equal(attack.characterId, "1503");
    assert.equal(attack.sourceSkillId, "150308");
    assert.equal(attack.type, "elation");
    assert.equal(attack.elationContext, "certifiedBanger");
    assert.equal(attack.certifiedBangerInputKey, "elation-certified-banger");
    assert.equal(attack.maximumTraceLevel, 6);
    assert.deepEqual(Array.from(attack.multipliers), fixedMultiplierByLevel);
    assert.equal(attack.characterLevelExact, 80);
    assert.equal(attack.enemyCountExact, 1);

    for (const [level, certifiedBanger] of [[1, 1], [6, 40]]) {
        const request = makeRequest(attack, level, { ...stats, resistance: 20, enemyLevel: 80, enemyCount: 1, toughnessActive: true });
        request.character.id = "1503";
        request.character.stats = { ...request.character.stats, elation: stats.elation };
        request.modifierInputs = { "elation-certified-banger": certifiedBanger };
        request.elation = { context: "certifiedBanger", certifiedBanger, merrymake: stats.merrymake };
        // This limited attack uses only Pearl's own complete final stat snapshot; no second-owner snapshot is supplied.
        assert.equal(request.character.id, attack.characterId);
        assert.equal(request.otherCharacter, undefined);
        assert.equal(request.ownerSnapshots, undefined);

        const result = engine.calculate(request);
        assert.notEqual(result.supported, false, result.reason || "Pearl's isolated 150308 Elation component must calculate");
        const expected = independentElationDamage(fixedMultiplierByLevel[level - 1], certifiedBanger);
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], expected[key], "Lv" + level + " Banger" + certifiedBanger + " " + key);
        assert.equal(result.breakdown.multiplierPercent, fixedMultiplierByLevel[level - 1]);
        assert.equal(result.breakdown.certifiedBanger, certifiedBanger);
        assert.equal(result.breakdown.punchlineSource, "certifiedBanger");
    }
});