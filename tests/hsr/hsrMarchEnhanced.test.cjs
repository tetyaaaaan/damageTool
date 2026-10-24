"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const runtime = require("../../games/js/hsrModifierRuntime.js");
const { loadProductionFixture, attackOf, makeRequest, assertClose, fixedSourceSha, independentDirectDamage } = require("./helpers/hsrDirectVerification.cjs");

// Values transcribed independently from StarRailRes at the pinned SHA.
const marchSource = {
    perHit: [40, 48, 56, 64, 72, 80],
    enhancedDamageBonus: [40, 44, 48, 52, 56, 60, 65, 70, 75, 80]
};
const hitStates = [
    { count: 3, label: "3段", state: "通常時" },
    { count: 4, label: "4段", state: "通常時" },
    { count: 5, label: "5段", state: "通常時／必殺技後" },
    { count: 6, label: "6段", state: "通常時／必殺技後" },
    { count: 7, label: "7段", state: "必殺技後" },
    { count: 8, label: "8段", state: "必殺技後" }
];
const scenarios = [
    { level: 80, enemyLevel: 82, stats: { atk: 3177.25, hp: 8421.5, def: 1265.75, critRate: 42.5, critDamage: 91.25, damageBonus: 17.5 }, baseStats: { atk: 1120.5, hp: 1100.25, def: 900.5 }, resistance: 23, defenseReduction: 0, resistancePenetration: 0, takenDamage: 0 },
    { level: 80, enemyLevel: 95, stats: { atk: 4388.75, hp: 12654.25, def: 2211.5, critRate: 68.25, critDamage: 137.5, damageBonus: 38.75 }, baseStats: { atk: 1375.25, hp: 1470.75, def: 1088.25 }, resistance: 7, defenseReduction: 13.5, resistancePenetration: 9, takenDamage: 11.5 }
];
const talentBuffId = "trace:1224:122404:enhanced-damage";

function findTalentBuff(data) {
    const record = data.structuredModifiers.find(item => item.id === talentBuffId);
    assert.ok(record, "March's fixed-source Enhanced Basic DMG buff is present");
    return record;
}

function makeCandidates(record, talentLevel, stats) {
    return runtime.buildCandidates([record], {
        characterId: "1224",
        eidolon: 0,
        stats,
        traceLevelFor: () => talentLevel
    }, {});
}

function forAttack(candidates, attack) {
    return candidates.map(candidate => ({
        ...candidate,
        applicable: !candidate.enabled || runtime.applicableToAttack(candidate, attack)
    }));
}

function expectedForHitCount(input, count) {
    const oneHit = independentDirectDamage({ ...input, attack: { ...input.attack, hitCount: 1 } });
    return Object.fromEntries(["nonCrit", "crit", "expected"].map(key => [key, oneHit[key] * count]));
}

test("Hunt March Enhanced Basic compares only resolved hit-count outcomes against independent direct-damage math", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "122408");
    const talentBuff = findTalentBuff(data);

    assert.equal(attack.support?.status, "calculable");
    assert.equal(attack.support?.verified, true);
    assert.equal(attack.provenance?.sourceCommit, fixedSourceSha);
    assert.equal(attack.type, "enhancedNormal");
    assert.equal(attack.attackType, undefined, "source record remains one enhanced-normal action, not duplicated attack records");
    assert.equal(attack.element, "Imaginary");
    assert.equal(attack.scalingStat, "atk");
    assert.equal(attack.target, "single");
    assert.equal(attack.maximumEidolon, 0);
    assert.equal(attack.characterLevelExact, 80);
    assert.equal(attack.enemyCountExact, 1);
    assert.equal(attack.requiresNonWeakTarget, true);
    assert.equal(attack.requiredToughnessActive, true);
    assert.deepEqual(Array.from(attack.multipliers), marchSource.perHit);
    assert.deepEqual(Array.from(attack.comparisonStates, state => [state.hitCount, state.label]), hitStates.map(state => [state.count, state.label]));
    assert.match(attack.calculationNote, /師匠/);
    assert.match(attack.calculationNote, /付加ダメージ.*含まず/);
    assert.match(attack.calculationNote, /段数.*平均|段数.*確率/);

    assert.equal(talentBuff.activation?.mode, "always");
    assert.deepEqual(Array.from(talentBuff.value.values), marchSource.enhancedDamageBonus);
    assert.equal(talentBuff.category, "damageBonus");
    assert.equal(talentBuff.inputPolicy, "conditional");
    assert.equal(talentBuff.provenance?.sourceCommit, fixedSourceSha);
    assert.ok(talentBuff.target?.attackTypes?.includes("enhancedNormal"));
    assert.ok(talentBuff.target?.attackIds?.includes("122408"));

    for (const scenario of scenarios) {
        for (let normalLevel = 1; normalLevel <= 6; normalLevel++) {
            for (let talentLevel = 1; talentLevel <= 10; talentLevel++) {
                const candidates = makeCandidates(talentBuff, talentLevel, scenario.stats);
                assert.equal(candidates.length, 1);
                assertClose(candidates[0].value, marchSource.enhancedDamageBonus[talentLevel - 1], `E0 Enhanced Basic's Talent Lv${talentLevel} bonus`);
                assert.equal(candidates[0].enabled, true, "enhanced state is assumed for the comparison without an availability toggle");

                for (const state of hitStates) {
                    const attackAtLevel = {
                        ...attack,
                        traceLevel: normalLevel,
                        multiplier: marchSource.perHit[normalLevel - 1],
                        hitCount: state.count,
                        attackType: "enhancedNormal"
                    };
                    const modifiers = forAttack(candidates, attackAtLevel);
                    const request = makeRequest(attackAtLevel, normalLevel, {
                        characterLevel: scenario.level,
                        eidolon: 0,
                        atk: scenario.stats.atk,
                        hp: scenario.stats.hp,
                        def: scenario.stats.def,
                        critRate: scenario.stats.critRate,
                        critDamage: scenario.stats.critDamage,
                        damageBonus: scenario.stats.damageBonus,
                        baseAtk: scenario.baseStats.atk,
                        baseHp: scenario.baseStats.hp,
                        baseDef: scenario.baseStats.def,
                        enemyLevel: scenario.enemyLevel,
                        enemyCount: 1,
                        weakness: false,
                        toughnessActive: true,
                        resistance: scenario.resistance,
                        defenseReduction: scenario.defenseReduction,
                        resistancePenetration: scenario.resistancePenetration,
                        takenDamage: scenario.takenDamage
                    }, modifiers);
                    request.character.stats = { ...request.character.stats, ...scenario.stats };
                    request.character.baseStats = { ...scenario.baseStats };
                    const expected = expectedForHitCount(request, state.count);
                    const actual = engine.calculate(request);
                    const label = `March E0 Normal Lv${normalLevel}/Talent Lv${talentLevel}/${state.label}/${state.state}`;

                    assert.notEqual(actual.supported, false, label + " is supported");
                    assert.equal(actual.attack.hitCount, state.count, label + " exposes the selected realized hit count");
                    assertClose(actual.breakdown.referenceValue, scenario.stats.atk, label + " references March's final ATK");
                    assertClose(actual.breakdown.multiplierPercent, marchSource.perHit[normalLevel - 1], label + " shows per-hit multiplier");
                    assertClose(actual.breakdown.damageBonus, scenario.stats.damageBonus + marchSource.enhancedDamageBonus[talentLevel - 1], label + " adds the enhanced-only native DMG bonus once");
                    for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], label + " " + key);
                    assertClose(actual.nonCrit, actual.perHit.nonCrit * state.count, label + " total is per-hit damage times realized hits");
                    assert.equal(actual.applied.filter(item => item.id === talentBuffId).length, 1, label + " applies the talent buff once");
                }

                for (const [id, type] of [["122401", "normal"], ["122403", "ultimate"]]) {
                    const candidate = makeCandidates(talentBuff, talentLevel, scenario.stats)[0];
                    assert.equal(runtime.applicableToAttack(candidate, { id, type, attackType: type, element: "Imaginary" }), false,
                        `March's Enhanced Basic Talent buff is excluded from ${type}`);
                }
            }
        }
    }
});

 test("Hunt March's own ATK is the only reference and HP/DEF changes cannot alter its enhanced-basic result", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "122408");
    const talentBuff = findTalentBuff(data);
    const scenario = scenarios[1];
    const calculate = stats => {
        const candidate = makeCandidates(talentBuff, 10, stats)[0];
        const selected = { ...attack, traceLevel: 6, multiplier: marchSource.perHit[5], hitCount: 8, attackType: "enhancedNormal" };
        const modifiers = forAttack([candidate], selected);
        const request = makeRequest(selected, 6, {
            characterLevel: 80, eidolon: 0,
            atk: stats.atk, hp: stats.hp, def: stats.def,
            critRate: stats.critRate, critDamage: stats.critDamage, damageBonus: stats.damageBonus,
            baseAtk: scenario.baseStats.atk, baseHp: scenario.baseStats.hp, baseDef: scenario.baseStats.def,
            enemyLevel: scenario.enemyLevel, enemyCount: 1, weakness: false, toughnessActive: true,
            resistance: scenario.resistance, defenseReduction: scenario.defenseReduction,
            resistancePenetration: scenario.resistancePenetration, takenDamage: scenario.takenDamage
        }, modifiers);
        request.character.stats = { ...request.character.stats, ...stats };
        request.character.baseStats = { ...scenario.baseStats };
        return engine.calculate(request);
    };
    const base = calculate(scenario.stats);
    const atk = calculate({ ...scenario.stats, atk: scenario.stats.atk + 1287.5 });
    const hp = calculate({ ...scenario.stats, hp: scenario.stats.hp + 4200.25 });
    const def = calculate({ ...scenario.stats, def: scenario.stats.def + 1333.75 });
    assert.ok(atk.nonCrit > base.nonCrit, "ATK changes an ATK-scaled attack");
    assertClose(hp.nonCrit, base.nonCrit, "HP is not a reference stat");
    assertClose(def.nonCrit, base.nonCrit, "DEF is not a reference stat");
});
