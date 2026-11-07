"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProductionFixture, makeRequest, assertClose } = require("./helpers/hsrDirectVerification.cjs");
const records = require("../../games/hsr/data/calc/attacks-castorice-round28.json").overrides;
const breath = records.find((item) => item.id === "1140702");
const total = records.find((item) => item.id === "11407022");
const stageCurves = [
    [12, 14.4, 16.8, 19.2, 21.6, 24],
    [14, 16.8, 19.6, 22.4, 25.2, 28],
    [17, 20.4, 23.8, 27.2, 30.6, 34]
];
const expExit = [20, 24, 28, 32, 36, 40];
const caster = { hp: 8432 };
const dragon = { critRate: 37, critDamage: 143, damageBonus: 19 };
const enemyConfig = { enemyCount: 1, enemyLevel: 83, resistance: 27, defenseReduction: 11, defenseIgnore: 4, resistancePenetration: 7, takenDamage: 9 };
const defense = 100 / (100 + 103 * (1 - (11 + 4) / 100));
const resistance = 1 - (27 - 7) / 100;
const vulnerability = 1.09;
function expected(multiplier, hitCount = 1) {
    const one = caster.hp * multiplier / 100 * (1 + dragon.damageBonus / 100) * defense * resistance * 0.9 * vulnerability;
    return { nonCrit: one * hitCount, crit: one * hitCount * (1 + dragon.critDamage / 100), expected: one * hitCount * (1 + dragon.critRate / 100 * dragon.critDamage / 100) };
}
function componentInput(template, level, multiplier, modifierInputs) {
    const request = makeRequest({ ...template, characterId: "1407", traceKey: template.id === "1140706" ? "memTalent" : "memSkill" }, level, { ...enemyConfig, ...caster, ...dragon });
    request.character.id = "11407";
    request.attack.completedReferenceSnapshot = true;
    request.attack.damageOwnerId = "11407";
    request.attack.multiplier = multiplier;
    request.modifierInputs = modifierInputs;
    request.character.stats.hp = caster.hp;
    return request;
}
function independentOwner(request, multiplier, hits = 1) {
    const v = expected(multiplier, hits);
    return v;
}

test("Round28 Castorice breath uses independent caster HP and fixed E0 prior-stage curves", async () => {
    const { engine } = await loadProductionFixture();
    assert.equal(breath.maximumTraceLevel, 6, "E0 cap comes from tree 1407301, not raw skill max_level 10");
    assert.equal(breath.damageOwnerId, "11407");
    assert.equal(breath.requiresIndependentCastorice, true);
    assert.deepEqual(Array.from(breath.breathStageMultipliers, (curve) => Array.from(curve)), stageCurves);
    for (let stage = 0; stage <= 2; stage++) {
        for (let level = 1; level <= 6; level++) {
            const modifierInputs = { "castorice-breath-stage": stage };
            const request = componentInput(breath, level, stageCurves[stage][level - 1], modifierInputs);
            const result = engine.calculate(request);
            assert.notEqual(result.supported, false, result.reason || `stage ${stage}/Lv${level}`);
            for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], independentOwner(request, stageCurves[stage][level - 1])[key], `stage ${stage}/Lv${level} ${key}`);
        }
    }
    const wrongOwner = componentInput(breath, 6, stageCurves[2][5], { "castorice-breath-stage": 2 });
    wrongOwner.character.id = "1407";
    assert.equal(engine.calculate(wrongOwner).supported, false, "Dragon stats cannot masquerade as Castorice's completed reference snapshot");
    const missingStage = componentInput(breath, 6, stageCurves[0][5], {});
    assert.equal(engine.calculate(missingStage).supported, false);
});

test("Round28 Castorice threshold total uses one breath plus six E0 exit hits only at Dragon HP <=25%", async () => {
    const { engine } = await loadProductionFixture();
    assert.equal(total.maximumTraceLevel, 6);
    assert.equal(total.damageFormula, "componentSequence");
    assert.deepEqual(Array.from(total.damageComponents, (part) => part.key), ["breath", "exit"]);
    assert.equal(total.damageComponents[1].attackId, "1140706");
    assert.equal(total.requiredTraceLevelRanges.memTalent.maximum, 6);
    for (const dragonHp of [25, 0.001, 26]) {
        const level = 6, stage = 2, modifierInputs = { "castorice-breath-stage": stage, "castorice-dragon-hp-percent": dragonHp };
        const root = componentInput(total, level, stageCurves[stage][level - 1], modifierInputs);
        const breathInput = componentInput(breath, level, stageCurves[stage][level - 1], modifierInputs);
        const exitInput = componentInput({ id: "1140706", characterId: "1407", sourceSkillId: "1140706", element: "Quantum", type: "memospriteTalent", target: "bounce", scalingStat: "hp", damageFormula: "statMultiplier", hitCount: 6, canCrit: true, multipliers: [20, 24, 28, 32, 36, 40], maximumEidolon: 0, maximumTraceLevel: 6, requiresIndependentCastorice: true }, 6, expExit[5], modifierInputs);
        exitInput.attack.traceKey = "memTalent";
        root.attack.traceLevel = level;
        root.sequenceComponents = [
            { key: "breath", name: total.damageComponents[0].name, input: breathInput },
            { key: "exit", name: total.damageComponents[1].name, input: exitInput }
        ];
        const result = engine.calculate(root);
        assert.notEqual(result.supported, false, result.reason || `Dragon HP ${dragonHp}%`);
        const breathExpected = expected(stageCurves[stage][level - 1]);
        const exitExpected = dragonHp <= 25 ? expected(expExit[5], 6) : { nonCrit: 0, crit: 0, expected: 0 };
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], breathExpected[key] + exitExpected[key], `Dragon HP ${dragonHp}% ${key}`);
        assert.equal(Object.keys(result.components || {}).length, dragonHp <= 25 ? 2 : 1);
    }
    const invalid = componentInput(total, 6, stageCurves[2][5], { "castorice-breath-stage": 2, "castorice-dragon-hp-percent": 25 });
    invalid.character.id = "1407";
    assert.equal(engine.calculate(invalid).supported, false, "threshold sequence requires the independent completed Castorice owner snapshot");
});
