"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProductionFixture, attackOf, assertClose } = require("./helpers/hsrDirectVerification.cjs");

const character = {
    level: 80, eidolon: 0,
    stats: { atk: 3179.25, hp: 9107.5, def: 1834.75, critRate: 36.5, critDamage: 142.25, damageBonus: 23.5, elation: 127.5, merrymake: 17.5 },
    baseStats: { atk: 1000, hp: 1000, def: 1000 }
};
const enemy = { count: 1, level: 87, resistance: 27.5, weakness: false, toughnessActive: true, defenseReduction: 9, defenseIgnore: 5, resistancePenetration: 6, takenDamage: 8 };
const elationExpected = (percent, punchline, critRate = character.stats.critRate, critDamage = character.stats.critDamage) => {
    const defense = 100 / (100 + 107 * (1 - (enemy.defenseReduction + enemy.defenseIgnore) / 100));
    const resistance = 1 - (enemy.resistance - enemy.resistancePenetration) / 100;
    const base = 7535.107 * percent / 100 * (1 + character.stats.elation / 100) * (1 + 5 * punchline / (punchline + 240))
        * (1 + character.stats.merrymake / 100) * defense * resistance * 0.9 * (1 + enemy.takenDamage / 100);
    const crit = base * (1 + critDamage / 100);
    return { nonCrit: base, crit, expected: base * (1 + critRate / 100 * critDamage / 100) };
};

test("TB 8009/8010 Aha uses fixed 8-hit plus final-hit coefficients and rejects out-of-scope states", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const id of ["800920", "801020"]) {
        const attack = attackOf(data, id);
        assert.equal(attack.hitCount, 9);
        for (let level = 1; level <= 10; level++) {
            const request = { character, enemy, modifiers: [], attack: { ...attack, traceLevel: level, multiplier: attack.multipliers[level - 1], attackType: attack.type }, elation: { context: "ahaInstant", punchline: 55, fervor: 0, merrymake: character.stats.merrymake } };
            const result = engine.calculate(request);
            assert.notEqual(result.supported, false, `${id} Lv${level}: ${result.reason || ""}`);
            const components = attack.elationComponents;
            assert.equal(components.length, 2);
            const totalPercent = components.reduce((sum, component) => sum + component.count * component.multipliers[level - 1], 0);
            const expected = elationExpected(totalPercent, 55);
            for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], expected[key], `${id} Lv${level} ${key}`);
            assert.equal(result.breakdown.elationComponents[0].count, 8);
            assert.equal(result.breakdown.elationComponents[1].count, 1);
        }
        const manyEnemies = { character, enemy: { ...enemy, count: 2 }, modifiers: [], attack, elation: { context: "ahaInstant", punchline: 55, fervor: 0, merrymake: 17.5 } };
        assert.equal(engine.calculate(manyEnemies).supported, false);
        const progressive = { character, enemy, attack, elation: { context: "ahaInstant", punchline: 55, fervor: 0, merrymake: 17.5 }, modifiers: [{ id: "test-progressive", category: "progressiveTakenDamage", value: 1, enabled: true, applicable: true, calculable: true }] };
        assert.equal(engine.calculate(progressive).supported, false);
    }
});

test("TB 8009/8010 skill total isolates the direct hit and self-maximum Banger rider", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const [owner, prefix] of [["8009", "800"], ["8010", "801"]]) {
        const totalId = owner + "022", bodyId = owner + "02", riderId = owner + "041";
        const total = attackOf(data, totalId), body = attackOf(data, bodyId), rider = attackOf(data, riderId);
        for (const [skillLv, talentLv, cb] of [[1, 1, 1], [6, 7, 40], [10, 10, 240]]) {
            const rootAttack = { ...total, characterId: owner, traceLevel: skillLv, multiplier: total.multipliers[skillLv - 1], attackType: "skill", certifiedBangerScope: "selfIsPartyMaximum" };
            const modifierInputs = { "elation-certified-banger": cb };
            const directInput = { character, enemy, modifiers: [], modifierInputs, elation: { context: "direct" }, attack: { ...body, characterId: owner, sourceSkillId: bodyId, traceLevel: skillLv, multiplier: body.multipliers[skillLv - 1], attackType: "skill" } };
            const riderInput = { character, enemy, modifiers: [], modifierInputs, elation: { context: "certifiedBanger", certifiedBanger: cb, punchline: cb, merrymake: character.stats.merrymake }, attack: { ...rider, characterId: owner, sourceSkillId: owner + "04", traceLevel: talentLv, multiplier: rider.multipliers[talentLv - 1], attackType: "elation", certifiedBangerScope: "selfIsPartyMaximum" } };
            const sequenceComponents = [
                { key: "direct", name: total.damageComponents[0].name, input: directInput },
                { key: "banger", name: total.damageComponents[1].name, input: riderInput }
            ];
            const result = engine.calculate({ character, enemy, attack: rootAttack, modifierInputs, sequenceComponents });
            assert.notEqual(result.supported, false, `${owner} Lv${skillLv}/TL${talentLv}: ${result.reason || ""}`);
            const directPercent = body.multipliers[skillLv - 1];
            const directBase = 3179.25 * directPercent / 100 * (1 + 23.5 / 100) * 0.9 * (1 - (27.5 - 6) / 100) * (100 / (100 + 107 * (1 - 0.14))) * (1 + 8 / 100);
            const riderPercent = rider.multipliers[talentLv - 1];
            const riderExpected = elationExpected(riderPercent, cb);
            for (const [key, directValue, riderValue] of [["nonCrit", directBase, riderExpected.nonCrit], ["crit", directBase * (1 + 142.25 / 100), riderExpected.crit], ["expected", directBase * (1 + .365 * 1.4225), riderExpected.expected]]) {
                assertClose(result.components.direct[key], directValue, `${owner} direct ${key}`);
                assertClose(result.components.banger[key], riderValue, `${owner} Banger ${key}`);
                assertClose(result[key], directValue + riderValue, `${owner} total ${key}`);
            }
        }
        const invalid = { character, enemy, attack: { ...total, characterId: owner, traceLevel: 10, multiplier: total.multipliers[9], attackType: "skill", certifiedBangerScope: "partyMaximum" }, modifierInputs: { "elation-certified-banger": 240 }, sequenceComponents: [] };
        assert.equal(engine.calculate(invalid).supported, false);
    }
});
