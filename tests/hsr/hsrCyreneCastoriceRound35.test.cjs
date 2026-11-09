"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProductionFixture, makeRequest, assertClose } = require("./helpers/hsrDirectVerification.cjs");
const runtime = require("../../games/js/hsrModifierRuntime.js");
const packet = require("../../games/hsr/data/calc/modifiers-cyrene-castorice-round35.json");

const record = packet.modifiers[0];
const levels = [36, 43, 51, 57, 65, 72];
const inputKey = "cyrene-castorice-excess-newbud";
const activeKey = "cyrene-life-death-active";
const hp = 8432;
const dragon = { critRate: 37, critDamage: 143, damageBonus: 19 };
const enemyConfig = { enemyCount: 1, enemyLevel: 83, resistance: 27, defenseReduction: 11, defenseIgnore: 4, resistancePenetration: 7, takenDamage: 9 };

function candidate(level, excess, active = true, hasProvider = true) {
    const inputs = { [activeKey]: active };
    if (excess !== undefined) inputs[inputKey] = excess;
    const context = {
        characterId: "1407",
        eidolon: 0,
        partyIds: hasProvider ? ["1415"] : [],
        partyEidolons: hasProvider ? { "1415": 0 } : {},
        traceLevelFor: () => level
    };
    return runtime.buildCandidates([record], context, inputs)[0];
}

function dragonAttack(id = "1140706") {
    return {
        id, characterId: "1407", sourceSkillId: id, name: "幽墟奪略の晦翼",
        element: "Quantum", type: id === "1140712" ? "memospriteSkill" : "memospriteTalent", traceKey: "memTalent",
        target: "bounce", scalingStat: "hp", damageFormula: "statMultiplier",
        hitCount: 6, canCrit: true, multipliers: [20, 24, 28, 32, 36, 40], multiplier: 40,
        traceLevel: 6, maximumEidolon: 0, maximumTraceLevel: 6,
        requiresIndependentCastorice: true, completedReferenceSnapshot: true,
        damageOwnerId: "11407", cyreneLifeDeathActive: true, cyreneSupportLevel: 6
    };
}

function independent(multiplier, hits) {
    const defense = 100 / (100 + 103 * (1 - (11 + 4) / 100));
    const resistance = 1 - (27 - 7) / 100;
    const oneHit = hp * multiplier / 100 * (1 + dragon.damageBonus / 100) * defense * resistance * 0.9 * 1.09;
    const nonCrit = oneHit * hits;
    return {
        perHit: {
            nonCrit: oneHit,
            crit: oneHit * (1 + dragon.critDamage / 100),
            expected: oneHit * (1 + dragon.critRate / 100 * dragon.critDamage / 100)
        },
        nonCrit,
        crit: nonCrit * (1 + dragon.critDamage / 100),
        expected: nonCrit * (1 + dragon.critRate / 100 * dragon.critDamage / 100)
    };
}

function request(attack, modifier, excess) {
    const input = makeRequest(attack, 6, { ...enemyConfig, ...dragon, hp, characterLevel: 80, eidolon: 0 });
    input.character.id = "11407";
    input.character.stats.hp = hp;
    input.attack.completedReferenceSnapshot = true;
    input.attack.damageOwnerId = "11407";
    input.attack.multiplier = 40;
    input.attack.hitCount = 6;
    input.modifierInputs = { [activeKey]: true, [inputKey]: excess };
    input.modifiers = modifier ? [modifier] : [];
    return input;
}

test("Round35 Life and Death uses the two pinned per-excess coefficients and requires explicit conditions", async () => {
    assert.equal(record.id, "trace:1415:1141517:castorice-deathragon-talent-multiplier");
    assert.equal(record.source.kind, "trace");
    assert.equal(record.source.id, "1415");
    assert.equal(record.source.skillId, "1141517");
    assert.equal(record.value.kind, "inputScaleByLevelPlusByLevel");
    assert.equal(record.value.inputKey, inputKey);
    assert.deepEqual(Array.from(record.value.scaleValues), levels);
    assert.equal(record.activation.inputKey, activeKey);
    assert.equal(record.activation.default, false);
    assert.equal(record.inputValidation.minimum, 0);
    assert.equal(record.inputValidation.maximum, 100);
    assert.equal(record.inputValidation.integer, true);
    assert.deepEqual(Array.from(record.target.attackIds), ["1140706", "1140712"]);

    for (let level = 1; level <= 6; level++) {
        assert.equal(candidate(level, 0).value, 0, `Lv${level} zero overcap`);
        assert.equal(candidate(level, 100).value, levels[level - 1], `Lv${level} full overcap`);
    }
    const missing = candidate(6, undefined);
    assert.equal(missing.enabled, true, "active state remains visible while the value is missing");
    assert.equal(missing.applicable, false, "unknown excess Newbud is not silently treated as a chosen amount");
    assert.equal(missing.strictInput, true);
    assert.equal(candidate(6, 100, false).enabled, false, "unset blessing toggle does not apply");
    assert.equal(candidate(6, 101).applicable, false, "values above the excess-Newbud cap are rejected");
    assert.equal(candidate(6, 12.5).applicable, false, "fractional excess-Newbud values are rejected");
    assert.equal(candidate(6, 100, true, false), undefined, "Cyrene absent from party cannot provide the modifier");
    assert.equal(runtime.applicableToAttack(candidate(6, 100), dragonAttack("1140706")), true);
    assert.equal(runtime.applicableToAttack(candidate(6, 100), dragonAttack("1140712")), true);
    assert.equal(runtime.applicableToAttack(candidate(6, 100), dragonAttack("1140702")), false, "the breath attack is excluded");
    assert.equal(runtime.applicableToAttack(candidate(6, 100), { ...dragonAttack(), type: "normal" }), false);
});

test("Round35 Life and Death adds the six-hit multiplier once per Death Dragon Talent hit", async () => {
    const { engine } = await loadProductionFixture();
    const productionRecord = engine && (await loadProductionFixture()).data.structuredModifiers.find((item) => item.id === record.id);
    assert.ok(productionRecord, "the production loader includes the Round35 modifier");
    const alias = engine.calculate(request(dragonAttack("1140712"), candidate(6, 100), 100));
    assert.notEqual(alias.supported,false,alias.reason);assertClose(alias.expected,independent(112,6).expected,"HP-all-consumption alias");
    for (const excess of [0, 100]) {
        const mod = candidate(6, excess);
        assert.equal(mod.value, excess === 0 ? 0 : 72);
        const input = request(dragonAttack(), mod, excess);
        const result = engine.calculate(input);
        assert.notEqual(result.supported, false, result.reason || `excess Newbud ${excess}%`);
        const effectiveMultiplier = 40 + mod.value;
        const expected = independent(effectiveMultiplier, 6);
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], expected[key], `excess ${excess}% six-hit ${key}`);
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(result.perHit[key], expected.perHit[key], `excess ${excess}% one-hit ${key}`);
        assertClose(result.breakdown.multiplierPercent, effectiveMultiplier, `excess ${excess}% multiplier per hit`);
    }
});
