"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    loadProductionFixture,
    makeRequest,
    assertClose
} = require("./helpers/hsrDirectVerification.cjs");
const file = require("../../games/hsr/data/calc/attacks-evernight-round28.json");
const get = (id) => file.overrides.find((item) => item.id === id);
const owner = {
    hp: 8123.5,
    critRate: 82.5,
    critDamage: 201.25,
    damageBonus: 137.5,
    enemyLevel: 83,
    resistance: 27,
    defenseReduction: 11,
    defenseIgnore: 4,
    resistancePenetration: 7,
    takenDamage: 39,
    toughnessActive: true
};

function request(id, level, memoquanta) {
    const attack = get(id);
    const input = makeRequest(attack, level, owner);
    input.character.id = "11413";
    input.attack.requiresIndependentEvernight = true;
    input.attack.completedReferenceSnapshot = true;
    input.attack.damageOwnerId = "11413";
    input.modifierInputs = {};
    if (memoquanta !== undefined) input.modifierInputs["evernight-memoquanta"] = memoquanta;
    if (id === "1141301") {
        input.attack.multiplier = attack.baseCurve[level - 1] + Math.floor(memoquanta / 4) * attack.bonusCurve[level - 1];
    }
    return input;
}

// This oracle hand-calculates the fixed coefficients, independent Longnight snapshot, and normal damage formula.
function expected(input, multiplier) {
    const character = input.character;
    const enemy = input.enemy;
    const defense = (character.level + 20) / ((character.level + 20) + (enemy.level + 20) * (1 - (enemy.defenseReduction + enemy.defenseIgnore) / 100));
    const resistance = 1 - (enemy.resistance - enemy.resistancePenetration) / 100;
    const nonCrit = character.stats.hp * multiplier / 100 * (1 + character.stats.damageBonus / 100) * defense * resistance * (enemy.toughnessActive ? 0.9 : 1) * (1 + enemy.takenDamage / 100);
    const crit = nonCrit * (1 + character.stats.critDamage / 100);
    return { nonCrit, crit, expected: nonCrit * (1 + character.stats.critRate / 100 * character.stats.critDamage / 100) };
}

function assertOracle(result, input, multiplier, label) {
    const oracle = expected(input, multiplier);
    assert.notEqual(result.supported, false, result.reason);
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], oracle[key], label + " " + key);
}

test("Round28 Evernight uses independent Longnight snapshot for Ultimate and Memoquanta skill", async () => {
    const { engine } = await loadProductionFixture();
    const ultimate = request("141303", 10);
    assertOracle(engine.calculate(ultimate), ultimate, 200, "Ultimate Lv10 with preexisting Darkest Enigma");
    for (const memoquanta of [0, 15]) {
        const skill = request("1141301", 6, memoquanta);
        const multiplier = [50, 10][0] + Math.floor(memoquanta / 4) * 10;
        assertOracle(engine.calculate(skill), skill, multiplier, "Memosprite skill Lv6 / Q=" + memoquanta);
    }
});

test("Round28 Evernight finisher fixes its activation state at 16 Memoquanta and rejects another owner", async () => {
    const { engine } = await loadProductionFixture();
    const finisher = request("1141307", 6, 16);
    assertOracle(engine.calculate(finisher), finisher, 192, "Finisher Lv6 / 16 stacks");
    const missing = request("1141307", 6);
    assert.equal(engine.calculate(missing).supported, false);
    for (const mutate of [
        (input) => { input.character.id = "1413"; },
        (input) => { input.attack.damageOwnerId = "1413"; },
        (input) => { input.attack.completedReferenceSnapshot = false; }
    ]) {
        const invalid = request("1141307", 6, 16);
        mutate(invalid);
        assert.equal(engine.calculate(invalid).supported, false);
    }
});
