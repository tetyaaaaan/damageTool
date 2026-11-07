"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProductionFixture, attackOf, makeRequest, assertClose } = require("./helpers/hsrDirectVerification.cjs");

const stats = { atk: 3179.25, hp: 9107.5, def: 1834.75, critRate: 36.5, critDamage: 142.25, damageBonus: 23.5, elation: 127.5, merrymake: 17.5 };
const enemy = { enemyLevel: 87, resistance: 27.5, defenseReduction: 9, defenseIgnore: 5, resistancePenetration: 6, takenDamage: 8 };
const skillMultipliers = [45, 54, 63, 72, 81, 90];
const bangerMultipliers = [10, 11, 12, 13, 14, 15, 16.25, 17.5, 18.75, 20];

function elationExpected(percent, punchline, intrinsicTakenDamage = 0) {
    const defense = 100 / (100 + 107 * (1 - (9 + 5) / 100));
    const resistance = 1 - (27.5 - 6) / 100;
    const base = 7535.107 * percent / 100 * (1 + stats.elation / 100) * (1 + 5 * punchline / (punchline + 240))
        * (1 + stats.merrymake / 100) * defense * resistance * 0.9 * (1 + (8 + intrinsicTakenDamage) / 100);
    return { nonCrit: base, crit: base * (1 + stats.critDamage / 100), expected: base * (1 + stats.critRate / 100 * stats.critDamage / 100) };
}

function withElation(request, elation) {
    request.character.stats = { ...request.character.stats, elation: stats.elation, merrymake: stats.merrymake };
    request.elation = elation;
    return request;
}

test("Round27 Yaoguang own normal plus one self-provided Banger hit uses E0 trace caps", async () => {
    const { data, engine } = await loadProductionFixture();
    const normal = attackOf(data, "150201"), banger = attackOf(data, "1502041"), total = attackOf(data, "1502012");
    assert.deepEqual(Array.from(normal.multipliers), skillMultipliers);
    assert.deepEqual(Array.from(banger.multipliers), bangerMultipliers);
    assert.equal(normal.maximumTraceLevel, 6);
    assert.equal(banger.maximumTraceLevel, 10);
    assert.equal(total.damageFormula, "componentSequence");
    assert.deepEqual(Array.from(total.damageComponents, (part) => part.key), ["direct", "banger"]);
    assert.equal(total.damageComponents[0].attackId, "150201");
    assert.equal(total.damageComponents[1].attackId, "1502041");
    assert.equal(total.maximumTraceLevel, 6);

    for (const [normalLv, talentLv, certifiedBanger] of [[1, 1, 1], [4, 7, 40], [6, 10, 240]]) {
        const rootAttack = { ...total, traceLevel: normalLv, multiplier: total.multipliers[normalLv - 1], attackType: "normal" };
        const modifierInputs = { "elation-certified-banger": certifiedBanger };
        const direct = withElation(makeRequest({ ...normal, characterId: "1502" }, normalLv, { ...enemy, atk: stats.atk, ...stats }), { context: "direct" });
        direct.attack.multiplier = skillMultipliers[normalLv - 1];
        const rider = withElation(makeRequest({ ...banger, characterId: "1502" }, talentLv, { ...enemy, atk: stats.atk, ...stats }), {
            context: "certifiedBanger", certifiedBanger, punchline: certifiedBanger, merrymake: stats.merrymake
        });
        const directBase = stats.atk * skillMultipliers[normalLv - 1] / 100 * (1 + stats.damageBonus / 100)
            * (100 / (100 + 107 * (1 - .14))) * (1 - (27.5 - 6) / 100) * .9 * 1.08;
        const riderExpected = elationExpected(bangerMultipliers[talentLv - 1], certifiedBanger);
        direct.modifierInputs = modifierInputs; rider.modifierInputs = modifierInputs;
        const sequenceComponents = [
            { key: "direct", name: "爻光本人の通常攻撃", input: direct },
            { key: "banger", name: "本人通常攻撃後の大吉大利", input: rider }
        ];
        const result = engine.calculate({ character: direct.character, enemy: direct.enemy, attack: rootAttack, modifierInputs, sequenceComponents });
        assert.notEqual(result.supported, false, result.reason || "Yaoguang N+Banger must calculate");
        for (const [key, directValue, riderValue] of [["nonCrit", directBase, riderExpected.nonCrit], ["crit", directBase * 2.4225, riderExpected.crit], ["expected", directBase * (1 + .365 * 1.4225), riderExpected.expected]]) {
            assertClose(result.components.direct[key], directValue, "direct " + key);
            assertClose(result.components.banger[key], riderValue, "Banger " + key);
            assertClose(result[key], directValue + riderValue, "combined " + key);
        }
    }
});

test("Round27 Yaoguang ultimate Aha uses fixed 20 Punchline independently of manual resource input", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "150221");
    assert.equal(attack.sourceSkillId, "150220");
    assert.equal(attack.elationContext, "ultimateAha");
    assert.equal(attack.fixedPunchline, 20);
    assert.equal(attack.intrinsicTakenDamage, 16);
    assert.equal(attack.maximumTraceLevel, 10);
    assert.deepEqual(Array.from(attack.elationComponents, (part) => part.count), [1, 5]);
    for (const level of [1, 10]) {
        const request = withElation(makeRequest(attack, level, { ...enemy, ...stats }), {
            context: "ultimateAha", punchline: 73, merrymake: stats.merrymake
        });
        const result = engine.calculate(request);
        assert.notEqual(result.supported, false, result.reason || "fixed-20 Aha must calculate");
        const percent = level === 1 ? 100 : 200;
        const expected = elationExpected(percent, 20, 16);
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], expected[key], "Lv" + level + " " + key);
        assert.equal(result.breakdown.punchline, 20);
        assert.equal(result.breakdown.punchlineSource, "fixedUltimate");
        assert.equal(request.elation.punchline, 73, "manual Punchline input is not mutated");
        assert.equal(result.attack.hitCount, 6);
    }
});
