"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const runtime = require("../../games/js/hsrModifierRuntime.js");
const {
    loadProductionFixture,
    attackOf,
    makeRequest,
    assertClose,
    fixedSourceSha,
    independentDirectDamage
} = require("./helpers/hsrDirectVerification.cjs");

// Curves and source stats are transcribed from the fixed StarRailRes skill table.
// The expected damage function below intentionally takes its source stat from this
// test specification; it never reads attack.scalingStat to choose the reference.
const reviewed = {
    "131201": { characterId: "1312", element: "Ice", scalingStat: "atk", traceKey: "normal", multipliers: [50, 60, 70, 80, 90, 100], maximumTraceLevel: 6 },
    "131202": { characterId: "1312", element: "Ice", scalingStat: "atk", traceKey: "skill", multipliers: [100, 110, 120, 130, 140, 150, 162.5, 175, 187.5, 200], adjacentMultipliers: [40, 44, 48, 52, 56, 60, 65, 70, 75, 80], maximumTraceLevel: 10 },
    "130101": { characterId: "1301", element: "Fire", scalingStat: "atk", traceKey: "normal", multipliers: [50, 60, 70, 80, 90, 100], maximumTraceLevel: 6 },
    "131501": { characterId: "1315", element: "Physical", scalingStat: "atk", traceKey: "normal", multipliers: [50, 60, 70, 80, 90, 100], maximumTraceLevel: 6 },
    "131701": { characterId: "1317", element: "Imaginary", scalingStat: "atk", traceKey: "normal", multipliers: [50, 60, 70, 80, 90, 100], maximumTraceLevel: 6 },
    "140901": { characterId: "1409", element: "Wind", scalingStat: "hp", traceKey: "normal", multipliers: [25, 30, 35, 40, 45, 50], maximumTraceLevel: 6 }
};

const scenarios = [
    {
        stats: { atk: 3123.5, hp: 9876.25, def: 2345.75, critRate: 37.5, critDamage: 83.25, damageBonus: 11.5 },
        baseStats: { atk: 1140.25, hp: 1190.5, def: 920.75 },
        characterLevel: 80, enemyLevel: 82, resistance: 27.5, toughnessActive: true
    },
    {
        stats: { atk: 2678.125, hp: 12345.5, def: 1987.25, critRate: 71.25, critDamage: 142.75, damageBonus: 46.25 },
        baseStats: { atk: 973.5, hp: 1350.25, def: 1105.5 },
        characterLevel: 80, enemyLevel: 95, resistance: 5, resistancePenetration: 8.5,
        defenseReduction: 17, defenseIgnore: 6, takenDamage: 12.5, toughnessActive: false
    }
];

function calculationModifiers(sourceStat) {
    return [
        { id: "test-reference-percent", category: "statPercent", stat: sourceStat, value: 17.5, enabled: true, applicable: true },
        { id: "test-reference-flat", category: "statFlat", stat: sourceStat, value: 137.25, enabled: true, applicable: true },
        { id: "test-unrelated-atk-percent", category: "statPercent", stat: "atk", value: 23.75, enabled: true, applicable: true },
        { id: "test-damage-bonus", category: "damageBonus", value: 28.5, enabled: true, applicable: true },
        { id: "test-defense-reduction", category: "defenseReduction", value: 9.25, enabled: true, applicable: true },
        { id: "test-defense-ignore", category: "defenseIgnore", value: 7.5, enabled: true, applicable: true },
        { id: "test-resistance-penetration", category: "resistancePenetration", value: 6.25, enabled: true, applicable: true },
        { id: "test-taken-damage", category: "takenDamage", value: 13.5, enabled: true, applicable: true },
        { id: "test-crit-rate", category: "critRate", value: 11.75, enabled: true, applicable: true },
        { id: "test-crit-damage", category: "critDamage", value: 22.5, enabled: true, applicable: true },
        { id: "test-disabled", category: "damageBonus", value: 90, enabled: false, applicable: false }
    ];
}

function requestFor(attack, level, scenario, modifiers = []) {
    const input = makeRequest(attack, level, {
        characterLevel: scenario.characterLevel,
        eidolon: 0,
        atk: scenario.stats.atk,
        hp: scenario.stats.hp,
        def: scenario.stats.def,
        baseAtk: scenario.baseStats.atk,
        baseHp: scenario.baseStats.hp,
        baseDef: scenario.baseStats.def,
        critRate: scenario.stats.critRate,
        critDamage: scenario.stats.critDamage,
        damageBonus: scenario.stats.damageBonus,
        enemyLevel: scenario.enemyLevel,
        resistance: scenario.resistance,
        resistancePenetration: scenario.resistancePenetration || 0,
        defenseReduction: scenario.defenseReduction || 0,
        defenseIgnore: scenario.defenseIgnore || 0,
        takenDamage: scenario.takenDamage || 0,
        toughnessActive: attack.requiredToughnessActive ? true : scenario.toughnessActive,
        enemyCount: 1,
        eidolon: 0
    }, modifiers);
    input.character.stats = { ...input.character.stats, ...scenario.stats };
    input.character.baseStats = { ...input.character.baseStats, ...scenario.baseStats };
    return input;
}

function assertIndependent(engine, input, spec, multiplier, label) {
    // Use the independently transcribed test specification as the reference-stat
    // and coefficient oracle, rather than trusting the production attack fields.
    const oracleInput = {
        ...input,
        attack: { ...input.attack, scalingStat: spec.scalingStat, multiplier, canCrit: true }
    };
    const expected = independentDirectDamage(oracleInput);
    const actual = engine.calculate(input);
    assert.notEqual(actual.supported, false, label + " calculates");
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], label + " " + key);
    assertClose(actual.breakdown.referenceValue, expected.effectiveReferenceValue, label + " declared " + spec.scalingStat + " reference");
    assertClose(actual.breakdown.damageBonus, expected.damageBonus, label + " damage bonus");
    assertClose(actual.breakdown.defense, expected.defense, label + " defense multiplier");
    assertClose(actual.breakdown.resistance, expected.resistance, label + " resistance multiplier");
    return actual;
}

test("round 2 direct attacks retain fixed-source E0 metadata and all declared trace curves", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const [id, spec] of Object.entries(reviewed)) {
        const attack = attackOf(data, id);
        assert.equal(attack.support.status, "calculable", id);
        assert.equal(attack.support.verified, true, id);
        assert.equal(attack.characterId, spec.characterId, id);
        assert.equal(typeof attack.name, "string", id + " has a localized display name");
        assert.equal(attack.type, id === "131202" ? "skill" : "normal", id);
        assert.equal(attack.traceKey, spec.traceKey, id);
        assert.equal(attack.element, spec.element, id);
        assert.equal(attack.target, id === "131202" ? "blast" : "single", id);
        assert.equal(attack.scalingStat, spec.scalingStat, id);
        assert.equal(attack.damageFormula, "statMultiplier", id);
        assert.equal(attack.canCrit, true, id);
        assert.equal(attack.hitCountLabel, "全段合算", id);
        assert.equal(attack.maximumEidolon, 0, id);
        assert.equal(attack.maximumTraceLevel, spec.maximumTraceLevel, id);
        assert.equal(attack.enemyCountExact, 1, id);
        assert.deepEqual(Array.from(attack.multipliers), spec.multipliers, id + " fixed-source curve");
        assert.equal(attack.provenance.sourceCommit, fixedSourceSha, id);
        assert.match(attack.provenance.sourceFile, /character_skills\.json:/, id);
        assert.ok(attack.calculationNote.length > 20, id + " states its scope");
        assert.equal(engine.unsupportedAttackReason(attack), "", id + " passes production engine validation");
    }
    const mishaSkill = attackOf(data, "131202");
    assert.deepEqual(Array.from(mishaSkill.provenance.adjacentMultipliers), reviewed["131202"].adjacentMultipliers, "Misha skill keeps the fixed-source adjacent curve as provenance without enabling adjacent damage in this one-enemy calculation");
    assert.equal(mishaSkill.adjacentMultipliers, undefined, "enemy-one scope must not expose the adjacent component to calculation");
});

test("every supported trace level uses the declared reference stat, with ATK/HP/DEF isolation", async () => {
    const { data, engine } = await loadProductionFixture();
    const statusKeys = ["atk", "hp", "def"];

    for (const [id, spec] of Object.entries(reviewed)) {
        const attack = attackOf(data, id);
        for (const [scenarioIndex, scenario] of scenarios.entries()) {
            for (let level = 1; level <= spec.maximumTraceLevel; level++) {
                const curveMultiplier = spec.multipliers[level - 1];
                const baselineInput = requestFor(attack, level, scenario);
                const baseline = assertIndependent(engine, baselineInput, spec, curveMultiplier, `${id} Lv${level} S${scenarioIndex} baseline`);
                assert.equal(baseline.attack.hitCount, 1, `${id} Lv${level} enemy-one scope produces one target result`);

                for (const changedStat of statusKeys) {
                    const alternateScenario = {
                        ...scenario,
                        stats: { ...scenario.stats, [changedStat]: scenario.stats[changedStat] * 1.217 + 83.375 }
                    };
                    const changedInput = requestFor(attack, level, alternateScenario);
                    const changed = assertIndependent(engine, changedInput, spec, curveMultiplier, `${id} Lv${level} S${scenarioIndex} only-${changedStat}`);
                    const affectsDamage = changedStat === spec.scalingStat;
                    for (const metric of ["nonCrit", "crit", "expected"]) {
                        if (affectsDamage) {
                            assert.notEqual(changed[metric], baseline[metric], `${id} Lv${level} source ${changedStat} must affect ${metric}`);
                        } else {
                            assertClose(changed[metric], baseline[metric], `${id} Lv${level} unrelated ${changedStat} must not affect ${metric}`);
                        }
                    }
                }

                const modifiedInput = requestFor(attack, level, scenario, calculationModifiers(spec.scalingStat));
                assertIndependent(engine, modifiedInput, spec, curveMultiplier, `${id} Lv${level} S${scenarioIndex} stat modifiers and combat bonuses`);
            }
        }
    }
});

test("Misha A6 frozen-target critical-damage option is self-scoped, attack-scoped, and OFF by default", async () => {
    const { data } = await loadProductionFixture();
    const id = "traceNode:1312:1312103:frozen-critical-damage";
    const record = data.structuredModifiers.find((item) => item.id === id);
    assert.ok(record, "the fixed-source Misha A6 effect is available through production loader");
    assert.equal(record.source.kind, "trace");
    assert.equal(String(record.source.id), "1312");
    assert.equal(String(record.source.traceId), "1312103");
    assert.equal(record.inputPolicy, "conditional");
    assert.equal(record.category, "critDamage");
    assert.equal(record.value.kind, "fixed");
    assert.equal(record.value.fixed, 30);
    assert.equal(record.activation.mode, "toggle");
    assert.equal(record.activation.inputKey, "misha-frozen-crit-active");
    assert.equal(record.activation.default, false);
    assert.deepEqual(Array.from(record.target.attackIds), ["131201", "131202", "131203"]);

    const context = { characterId: "1312", eidolon: 0, traceLevelFor: () => 6 };
    const off = runtime.buildCandidates([record], context, { "misha-frozen-crit-active": false });
    assert.equal(off.length, 1);
    assert.equal(off[0].enabled, false);
    assert.equal(off[0].value, 30);
    const on = runtime.buildCandidates([record], context, { "misha-frozen-crit-active": true });
    assert.equal(on.length, 1);
    assert.equal(on[0].enabled, true);
    assert.equal(on[0].value, 30);
    for (const attackId of ["131201", "131202"]) {
        assert.equal(runtime.applicableToAttack(on[0], { id: attackId, type: attackId === "131201" ? "normal" : "skill", attackType: attackId === "131201" ? "normal" : "skill", element: "Ice" }), true, attackId + " accepts A6 CD");
    }
    assert.equal(runtime.applicableToAttack(on[0], { id: "131203", type: "ultimate", attackType: "ultimate", element: "Ice" }), true, "the newly verified stable prefrozen Ultimate shares A6 with Basic and Skill");
    assert.deepEqual(runtime.buildCandidates([record], { characterId: "1301", partyIds: ["1312"], eidolon: 0 }, { "misha-frozen-crit-active": true }), [], "self A6 effect is not offered as a party buff when Misha is another character's teammate");
});
