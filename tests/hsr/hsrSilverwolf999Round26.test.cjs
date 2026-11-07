"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProductionFixture, readJson, assertClose } = require("./helpers/hsrDirectVerification.cjs");

const attackRecord = readJson("games/hsr/data/calc/attacks-silverwolf999-round26.json").overrides[0];
const perHit = [45, 49.5, 54, 58.5, 63, 67.5, 73.12, 78.75, 84.38, 90];
const punchline = 137;
const stats = { atk: 3172.5, hp: 8421, def: 1833, critRate: 76.5, critDamage: 181.25, damageBonus: 0, elation: 162.75 };
const enemy = { count: 1, level: 83, resistance: 27.5, weakness: false, toughnessActive: true, defenseReduction: 13.25, defenseIgnore: 5, resistancePenetration: 8.5, takenDamage: 11.75 };

function independentElationDamage(input) {
    const { attack, character, enemy: target, elation } = input;
    const levelBase = 7535.107;
    const defense = (character.level + 20) / ((character.level + 20) + (target.level + 20) * (1 - (target.defenseReduction + target.defenseIgnore) / 100));
    const resistance = 1 - (target.resistance - target.resistancePenetration) / 100;
    const toughness = target.toughnessActive ? 0.9 : 1;
    const punchlineMultiplier = 1 + 5 * elation.punchline / (elation.punchline + 240);
    const nonCrit = levelBase * attack.multiplier / 100 * (1 + character.stats.elation / 100) * punchlineMultiplier * defense * resistance * toughness * (1 + target.takenDamage / 100);
    const critMultiplier = 1 + character.stats.critDamage / 100;
    const expectedCritMultiplier = 1 + character.stats.critRate / 100 * (critMultiplier - 1);
    return { nonCrit, crit: nonCrit * critMultiplier, expected: nonCrit * expectedCritMultiplier };
}

test("Round26 Silver Wolf LV.999 Elation skill matches six fixed-source hits at E0 levels", async () => {
    const { engine } = await loadProductionFixture();
    assert.deepEqual(attackRecord.multipliers, perHit.map((value) => value * 6), "six-hit totals from pinned per-hit coefficients");
    for (const level of [1, 6, 10]) {
        const input = {
            character: { level: 80, eidolon: 0, stats: { ...stats }, baseStats: {} },
            enemy: { ...enemy },
            attack: { ...attackRecord, traceLevel: level, multiplier: attackRecord.multipliers[level - 1], attackType: "elation" },
            modifiers: [],
            modifierInputs: {},
            elation: { context: "ahaInstant", punchline, merrymake: 0 }
        };
        const expected = independentElationDamage(input);
        const actual = engine.calculate(input);
        assert.notEqual(actual.supported, false, actual.reason);
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], "150621 Lv" + level + " " + key);
    }
});

test("Round26 Silver Wolf LV.999 elation attack does not invent SSS boxes or accept multi-enemy state", async () => {
    const { engine } = await loadProductionFixture();
    const input = {
        character: { level: 80, eidolon: 0, stats: { ...stats }, baseStats: {} }, enemy: { ...enemy, count: 2 },
        attack: { ...attackRecord, traceLevel: 10, multiplier: attackRecord.multipliers[9], attackType: "elation" },
        modifiers: [], modifierInputs: {},
        elation: { context: "ahaInstant", punchline, merrymake: 0 }
    };
    assert.equal(attackRecord.hitCount, 6);
    assert.equal(attackRecord.supplyBoxCount, undefined, "six probability resets do not imply SP-triggered SSS box attacks");
    const result = engine.calculate(input);
    assert.equal(result.supported, false);
    for(const change of [q=>q.attack.secretScoreSnapshot=239,q=>q.modifiers=[{category:'critRate',value:10,enabled:true,applicable:true}],q=>q.modifiers=[{category:'statPercent',stat:'speed',value:12,enabled:true,applicable:true}]]){const q=structuredClone(input);q.enemy.count=1;change(q);assert.equal(engine.calculate(q).supported,false);}

});
