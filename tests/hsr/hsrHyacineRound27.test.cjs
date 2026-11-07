"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    loadProductionFixture,
    makeRequest,
    assertClose
} = require("./helpers/hsrDirectVerification.cjs");
const file = require("../../games/hsr/data/calc/attacks-hyacine-round27.json");
const attack = file.overrides.find((item) => item.id === "1140901");
const owner = {
    hp: 8123.5,
    critRate: 100,
    critDamage: 143,
    damageBonus: 175,
    enemyLevel: 83,
    resistance: 27,
    defenseReduction: 11,
    defenseIgnore: 4,
    resistancePenetration: 7,
    takenDamage: 9
};

function request(level, recordedHealing = 12345) {
    const input = makeRequest(attack, level, owner);
    input.character.id = "11409";
    input.attack.requiresIndependentHyacine = true;
    input.attack.completedReferenceSnapshot = true;
    input.attack.damageOwnerId = "11409";
    input.modifierInputs = { "hyacine-recorded-healing": recordedHealing };
    return input;
}

// Independent oracle uses the manually transcribed recorded-healing ratios and does not read engine output.
function expected(input) {
    const record = input.modifierInputs["hyacine-recorded-healing"];
    const ratio = input.attack.traceLevel === 1 ? 0.10 : 0.20;
    const character = input.character;
    const enemy = input.enemy;
    const defense = (character.level + 20) / ((character.level + 20) + (enemy.level + 20) * (1 - (enemy.defenseReduction + enemy.defenseIgnore) / 100));
    const resistance = 1 - (enemy.resistance - enemy.resistancePenetration) / 100;
    const nonCrit = record * ratio * (1 + character.stats.damageBonus / 100) * defense * resistance * (enemy.toughnessActive ? 0.9 : 1) * (1 + enemy.takenDamage / 100);
    const crit = nonCrit * (1 + character.stats.critDamage / 100);
    return { nonCrit, crit, expected: nonCrit * (1 + character.stats.critRate / 100 * character.stats.critDamage / 100) };
}

test("Round27 Hyacine Ica uses explicit recorded healing and independent E0 trace Lv1/Lv6 ratios", async () => {
    const { engine } = await loadProductionFixture();
    assert.equal(attack.sourceSkillId, "1140901");
    assert.equal(attack.damageFormula, "recordedHealing");
    assert.equal(attack.scalingStat, "healingRecord");
    assert.equal(attack.maximumTraceLevel, 6, "E0 memosprite skill cap comes from tree 1409301");
    for (const level of [1, 6]) {
        const input = request(level);
        const result = engine.calculate(input);
        assert.notEqual(result.supported, false, result.reason);
        const oracle = expected(input);
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], oracle[key], "Lv" + level + " " + key);
        assert.equal(result.breakdown.referenceStat, "healingRecord");
        assertClose(result.breakdown.referenceValue, 12345);
    }
});

test("Round27 Hyacine Ica requires an explicit record and independent spirit owner", async () => {
    const { engine } = await loadProductionFixture();
    const zero = engine.calculate(request(6, 0));
    assert.notEqual(zero.supported, false, zero.reason);
    assertClose(zero.nonCrit, 0);
    const missingRecord = request(6);
    delete missingRecord.modifierInputs["hyacine-recorded-healing"];
    assert.equal(engine.calculate(missingRecord).supported, false);
    for (const mutate of [
        (input) => { input.character.id = "1409"; },
        (input) => { input.character.stats.critDamage = undefined; },
        (input) => { input.attack.completedReferenceSnapshot = false; },
        (input) => { input.attack.damageOwnerId = "1409"; }
    ]) {
        const invalid = request(6);
        mutate(invalid);
        assert.equal(engine.calculate(invalid).supported, false);
    }
});
