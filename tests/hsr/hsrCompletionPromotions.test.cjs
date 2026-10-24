"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const runtime = require("../../games/js/hsrModifierRuntime.js");
const {
    loadProductionFixture,
    attackOf,
    makeRequest,
    assertClose,
    independentDirectDamage,
    fixedSourceSha
} = require("./helpers/hsrDirectVerification.cjs");

// These curves and hit counts are transcribed from the pinned Japanese
// StarRailRes character_skills.json, independently of the production records.
const reviewed = {
    "130404": {
        characterId: "1304",
        name: "銃口の右には…",
        type: "followUp",
        element: "Imaginary",
        scalingStat: "def",
        traceKey: "talent",
        target: "single",
        hitCount: 7,
        maximumTraceLevel: 10,
        perHitMultipliers: [12.5, 13.75, 15, 16.25, 17.5, 18.75, 20.31, 21.88, 23.44, 25]
    },
    "130501": {
        characterId: "1305",
        name: "知識は力なり",
        type: "normal",
        element: "Imaginary",
        scalingStat: "atk",
        traceKey: "normal",
        target: "single",
        hitCount: 1,
        maximumTraceLevel: 6,
        perHitMultipliers: [50, 60, 70, 80, 90, 100]
    }
};

const scenarios = [
    {
        stats: { atk: 3571.25, hp: 11234.5, def: 1657.75, critRate: 39.5, critDamage: 121.75, damageBonus: 22.5 },
        baseStats: { atk: 1200.5, hp: 1300.25, def: 910.75 },
        characterLevel: 80, enemyLevel: 83, resistance: 25, resistancePenetration: 6.25,
        defenseReduction: 12.5, defenseIgnore: 7.5, takenDamage: 11.5, toughnessActive: true
    },
    {
        stats: { atk: 2400.4, hp: 8000.8, def: 2800.6, critRate: 75, critDamage: 60, damageBonus: 40 },
        baseStats: { atk: 777.7, hp: 1001.1, def: 888.8 },
        characterLevel: 80, enemyLevel: 95, resistance: 7.5, resistancePenetration: 10.5,
        defenseReduction: 20, defenseIgnore: 5, takenDamage: 18.75, toughnessActive: true
    }
];

function makeScenario(attack, level, scenario, modifiers = []) {
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
        resistancePenetration: scenario.resistancePenetration,
        defenseReduction: scenario.defenseReduction,
        defenseIgnore: scenario.defenseIgnore,
        takenDamage: scenario.takenDamage,
        toughnessActive: scenario.toughnessActive,
        weakness: false,
        enemyCount: 1
    }, modifiers);
    input.character.stats = { ...input.character.stats, ...scenario.stats };
    input.character.baseStats = { ...input.character.baseStats, ...scenario.baseStats };
    input.attack = { ...input.attack, traceLevel: level, hitCount: attack.hitCount };
    return input;
}

function independentPerHit(input, spec, level) {
    return independentDirectDamage({
        ...input,
        attack: {
            ...input.attack,
            scalingStat: spec.scalingStat,
            multiplier: spec.perHitMultipliers[level - 1],
            hitCount: 1
        }
    });
}

function independentWholeAttack(input, spec, level) {
    return independentDirectDamage({
        ...input,
        attack: {
            ...input.attack,
            scalingStat: spec.scalingStat,
            multiplier: spec.perHitMultipliers[level - 1] * spec.hitCount,
            hitCount: 1
        }
    });
}

function assertWholeAttackMatches(engine, input, spec, level, label) {
    const perHit = independentPerHit(input, spec, level);
    const whole = independentWholeAttack(input, spec, level);
    const actual = engine.calculate(input);
    assert.notEqual(actual.supported, false, label + " is calculable");
    assert.equal(actual.attack.hitCount, spec.hitCount, label + " reports every realized hit");
    for (const key of ["nonCrit", "crit", "expected"]) {
        assertClose(actual[key], whole[key], label + " independent all-hit " + key);
        assertClose(actual.perHit[key], perHit[key], label + " independent per-hit " + key);
    }
    assertClose(actual.breakdown.referenceValue, whole.effectiveReferenceValue, label + " uses independently selected " + spec.scalingStat);
    assertClose(actual.breakdown.damageBonus, whole.damageBonus, label + " damage bonus");
    assertClose(actual.breakdown.defense, whole.defense, label + " defense multiplier");
    assertClose(actual.breakdown.resistance, whole.resistance, label + " resistance multiplier");
    return actual;
}

function modifierRecord(data, id) {
    const record = data.structuredModifiers.find((item) => item.id === id);
    assert.ok(record, "production loader must include modifier " + id);
    return record;
}

test("Aventurine Talent follow-up is a fixed-source E0 seven-hit single-enemy attack", async () => {
    const { data, engine } = await loadProductionFixture();
    const spec = reviewed["130404"];
    const attack = attackOf(data, "130404");

    assert.equal(data.attacks.length, data.attackCoverage.total, "attack registry remains loader-derived");
    assert.equal(attack.support.status, "calculable");
    assert.equal(attack.support.verified, true);
    assert.equal(attack.characterId, spec.characterId);
    assert.ok(attack.name.startsWith(spec.name), "official name with a scope annotation");
    assert.equal(attack.type, spec.type);
    assert.equal(attack.traceKey, spec.traceKey);
    assert.equal(attack.element, spec.element);
    assert.equal(attack.scalingStat, spec.scalingStat);
    assert.equal(attack.target, spec.target, "enemy-one scope resolves random bounce to one target");
    assert.equal(attack.hitCount, spec.hitCount);
    assert.equal(attack.canCrit, true);
    assert.equal(attack.damageFormula, "statMultiplier");
    assert.equal(attack.maximumEidolon, 0);
    assert.equal(attack.maximumTraceLevel, spec.maximumTraceLevel);
    assert.equal(attack.enemyCountExact, 1);
    assert.equal(attack.requiredToughnessActive, true);
    assert.equal(attack.requiresNonWeakTarget, true);
    assert.deepEqual(Array.from(attack.multipliers), spec.perHitMultipliers, "per-hit curve matches the pinned source");
    assert.equal(attack.provenance.sourceCommit, fixedSourceSha);
    assert.match(attack.provenance.sourceFile, /character_skills\.json:130404/);
    assert.match(attack.calculationNote, /星魂0/);
    assert.match(attack.calculationNote, /敵1体/);
    assert.match(attack.calculationNote, /7/);
    assert.equal(engine.unsupportedAttackReason(attack), "");

    const unnerve = modifierRecord(data, "trace:1304:130403:crit-vulnerability");
    assert.equal(unnerve.category, "critTakenDamage");
    assert.equal(unnerve.activation.default, false, "existing enemy state remains an optional manual condition");
    const expectedCritTakenByLevel = [9, 9.6, 10.2, 10.8, 11.4, 12, 12.75, 13.5, 14.25, 15];

    for (let level = 1; level <= spec.maximumTraceLevel; level++) {
        const context = { characterId: "1304", eidolon: 0, traceLevelFor: () => level };
        const off = runtime.buildCandidates([unnerve], context, { "aventurine-unnerve-active": false });
        const on = runtime.buildCandidates([unnerve], context, { "aventurine-unnerve-active": true });
        assert.equal(off.length, 1);
        assert.equal(off[0].enabled, false);
        assert.equal(on.length, 1);
        assert.equal(on[0].enabled, true);
        assertClose(on[0].value, expectedCritTakenByLevel[level - 1], "Unnerved CRIT DMG taken Lv" + level);
        assert.equal(runtime.applicableToAttack(on[0], { id: attack.id, type: attack.type, attackType: attack.type, element: attack.element }), true);

        for (const [scenarioIndex, scenario] of scenarios.entries()) {
            const offInput = makeScenario(attack, level, scenario, off);
            const onInput = makeScenario(attack, level, scenario, on);
            const offResult = assertWholeAttackMatches(engine, offInput, spec, level, "Aventurine Talent Lv" + level + " scenario" + scenarioIndex + " Unnerved OFF");
            const onResult = assertWholeAttackMatches(engine, onInput, spec, level, "Aventurine Talent Lv" + level + " scenario" + scenarioIndex + " Unnerved ON");
            assertClose(onResult.nonCrit, offResult.nonCrit, "Unnerved changes crit only");
            assertClose(onResult.breakdown.critTakenDamage, expectedCritTakenByLevel[level - 1], "Unnerved is applied exactly once");
            assertClose(offResult.breakdown.critTakenDamage, 0, "Unnerved OFF adds no crit-taken damage");
            assertClose(onResult.breakdown.critRatePercent, scenario.stats.critRate, "Aventurine Leverage is already in final CRIT Rate and is not re-added");
        }
    }
});

test("Aventurine follow-up uses DEF only and respects its one-enemy E0 fixed-hit scope", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "130404");
    const spec = reviewed["130404"];
    const baseline = makeScenario(attack, 10, scenarios[0]);
    const baselineResult = assertWholeAttackMatches(engine, baseline, spec, 10, "Aventurine Talent stat baseline");

    for (const changedStat of ["atk", "hp", "def"]) {
        const changedScenario = {
            ...scenarios[0],
            stats: { ...scenarios[0].stats, [changedStat]: scenarios[0].stats[changedStat] * 1.217 + 83.375 }
        };
        const changed = assertWholeAttackMatches(engine, makeScenario(attack, 10, changedScenario), spec, 10, "Aventurine Talent only " + changedStat);
        for (const metric of ["nonCrit", "crit", "expected"]) {
            if (changedStat === "def") assert.notEqual(changed[metric], baselineResult[metric], "DEF changes Aventurine's talent damage");
            else assertClose(changed[metric], baselineResult[metric], changedStat + " does not affect DEF-scaling talent damage");
        }
    }

    const e1 = { ...attack, maximumEidolon: 0 };
    assert.equal(engine.unsupportedAttackReason(e1), "", "E0 scope is explicitly recorded on the attack");
    assert.equal(attackOf(data, "130401").support.status, "calculable", "Aventurine Basic remains calculable");
});

test("Dr. Ratio Basic attack is an independent fixed-source ATK hit and A6 Deduction can apply to Normal", async () => {
    const { data, engine } = await loadProductionFixture();
    const spec = reviewed["130501"];
    const attack = attackOf(data, "130501");
    assert.equal(attack.support.status, "calculable");
    assert.equal(attack.support.verified, true);
    assert.equal(attack.characterId, spec.characterId);
    assert.equal(attack.name, spec.name);
    assert.equal(attack.type, spec.type);
    assert.equal(attack.traceKey, spec.traceKey);
    assert.equal(attack.element, spec.element);
    assert.equal(attack.scalingStat, spec.scalingStat);
    assert.equal(attack.target, spec.target);
    assert.equal(attack.hitCount, spec.hitCount);
    assert.equal(attack.canCrit, true);
    assert.equal(attack.damageFormula, "statMultiplier");
    assert.equal(attack.maximumEidolon, 0);
    assert.equal(attack.maximumTraceLevel, spec.maximumTraceLevel);
    assert.equal(attack.enemyCountExact, 1);
    assert.equal(attack.requiredToughnessActive, true);
    assert.equal(attack.requiresNonWeakTarget, true);
    assert.deepEqual(Array.from(attack.multipliers), spec.perHitMultipliers, "Basic curve matches fixed-source levels 1–6");
    assert.equal(attack.provenance.sourceCommit, fixedSourceSha);
    assert.match(attack.provenance.sourceFile, /character_skills\.json:130501/);
    assert.match(attack.calculationNote, /星魂0/);
    assert.match(attack.calculationNote, /敵1体/);
    assert.equal(engine.unsupportedAttackReason(attack), "");

    const deduction = modifierRecord(data, "traceNode:1305:1305103:deduction");
    assert.equal(deduction.activation.default, false, "A6 remains an optional battle-state condition");
    assert.ok(deduction.target.attackTypes.includes("normal"), "Deduction's any-damage scope includes Basic ATK");
    const debuffCases = [
        { count: 0, bonus: 0 }, { count: 2, bonus: 0 }, { count: 3, bonus: 30 },
        { count: 4, bonus: 40 }, { count: 5, bonus: 50 }, { count: 8, bonus: 50 }
    ];

    for (let level = 1; level <= spec.maximumTraceLevel; level++) {
        for (const { count, bonus } of debuffCases) {
            const context = { characterId: "1305", eidolon: 0, enemy: { debuffCount: count }, traceLevelFor: () => 10 };
            const candidate = runtime.buildCandidates([deduction], context, { "ratio-deduction-unlocked": true })[0];
            assert.ok(candidate, "Deduction source resolves for Ratio");
            const applies = runtime.applicableToAttack(candidate, { id: attack.id, type: attack.type, attackType: attack.type, element: attack.element });
            assert.equal(applies, bonus > 0, "A6 eligibility follows debuff count and attack type");
            const modifier = { ...candidate, applicable: applies };
            const input = makeScenario(attack, level, { ...scenarios[0], enemyCount: 1 }, [modifier]);
            input.enemy.debuffCount = count;
            const actual = engine.calculate(input);
            const expected = independentDirectDamage(input);
            assert.notEqual(actual.supported, false, "Ratio Basic Lv" + level + " debuffs=" + count + " calculates");
            for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], "Ratio Basic Lv" + level + " debuffs=" + count + " " + key);
            assertClose(actual.breakdown.referenceValue, expected.effectiveReferenceValue, "Ratio Basic uses ATK");
            assertClose(actual.breakdown.damageBonus, scenarios[0].stats.damageBonus + bonus, "Deduction bonus applies once at its E0 threshold");
            assert.equal(actual.applied.some((item) => item.id === deduction.id), bonus > 0);
        }

        const off = runtime.buildCandidates([deduction], { characterId: "1305", eidolon: 0, enemy: { debuffCount: 5 }, traceLevelFor: () => 10 }, { "ratio-deduction-unlocked": false })[0];
        const offInput = makeScenario(attack, level, scenarios[0], [{ ...off, applicable: runtime.applicableToAttack(off, { id: attack.id, type: attack.type, attackType: attack.type, element: attack.element }) }]);
        const offResult = engine.calculate(offInput);
        const noModifierResult = engine.calculate(makeScenario(attack, level, scenarios[0]));
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(offResult[key], noModifierResult[key], "Deduction OFF preserves Ratio Basic baseline");
    }

    for (const id of ["130502", "130503", "130504"]) {
        assert.equal(attackOf(data, id).support.status, "calculable", "existing Ratio " + id + " remains calculable");
    }
});

