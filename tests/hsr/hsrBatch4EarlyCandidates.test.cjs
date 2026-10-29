"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProductionFixture, attackOf, makeRequest, runtime, assertClose, fixedSourceSha } = require("./helpers/hsrDirectVerification.cjs");

// Independently transcribed from fixed SHA dbe8cdf... JP character_skills.json:
// 130401[0], 130403[1,2], 130404[1,2]. Prydwen original Aventurine kit
// (review Patch 4.0, profile 2026-05-31) corroborates DEF and seven bounces.
// The Ultimate test is a pre-existing, same-level Unnerved reference scenario;
// textual ordering does not establish first-application same-hit timing.
const specs = {
    "130401": { type: "normal", trace: "normal", hits: 1, values: [50,60,70,80,90,100] },
    "130403": { type: "ultimate", trace: "ultimate", hits: 1, values: [162,172.8,183.6,194.4,205.2,216,229.5,243,256.5,270] },
    "130404": { type: "followUp", trace: "talent", hits: 7, values: [12.5,13.75,15,16.25,17.5,18.75,20.31,21.88,23.44,25] }
};
const unnerveValues = [9,9.6,10.2,10.8,11.4,12,12.75,13.5,14.25,15];
const unnerveId = "trace:1304:130403:crit-vulnerability";
const scenarios = [
    { atk: 3729.25, hp: 9183.75, def: 2411.5, baseAtk: 1031.25, baseHp: 1371.75, baseDef: 871.5, critRate: 43.75, critDamage: 173.25, damageBonus: 31.5, enemyLevel: 87, resistance: 26.25, resistancePenetration: 9.5, defenseReduction: 13.25, defenseIgnore: 7.75, takenDamage: 12.5 },
    { atk: 2117.75, hp: 11929.5, def: 4273.25, baseAtk: 793.5, baseHp: 1407.25, baseDef: 1129.75, critRate: 81.25, critDamage: 107.75, damageBonus: 62.25, enemyLevel: 95, resistance: 8.75, resistancePenetration: 13.5, defenseReduction: 24.75, defenseIgnore: 6.25, takenDamage: 18.75 }
];
function candidate(data, characterId, level, on, partyIds = []) {
    const record = data.structuredModifiers.find(item => item.id === unnerveId);
    assert.ok(record);
    const all = runtime.buildCandidates([record], { characterId, partyIds, eidolon: 0, partyEidolons: { "1304": 0 }, traceLevelFor: () => level }, { "aventurine-unnerve-active": on });
    assert.equal(all.length, 1);
    return all[0];
}
function applies(modifier, attack) {
    return { ...modifier, applicable: runtime.applicableToAttack(modifier, { ...attack, attackType: attack.type }) };
}
// This oracle uses only the hand-entered source curve and explicit arithmetic;
// production multipliers and runtime-resolved modifier values are not expectations.
function oracle(config, multiplier, hits, unnerve = 0, extra = {}) {
    const finalDef = config.def + config.baseDef * (extra.defPercent || 0) / 100 + (extra.defFlat || 0);
    const defense = 100 / (100 + (config.enemyLevel + 20) * (1 - (config.defenseReduction + config.defenseIgnore + (extra.defenseReduction || 0)) / 100));
    const resistance = 1 - (config.resistance - config.resistancePenetration - (extra.resistancePenetration || 0)) / 100;
    const nonCrit = finalDef * multiplier / 100 * hits * (1 + (config.damageBonus + (extra.damageBonus || 0)) / 100) * defense * resistance * 0.9 * (1 + config.takenDamage / 100);
    const crit = nonCrit * (1 + (config.critDamage + unnerve) / 100);
    const expected = nonCrit * (1 + Math.min(1, Math.max(0, (config.critRate + (extra.critRate || 0)) / 100)) * (config.critDamage + unnerve) / 100);
    return { nonCrit, crit, expected, finalDef, defense, resistance };
}
function check(engine, input, expected, label) {
    const actual = engine.calculate(input);
    assert.notEqual(actual.supported, false, label);
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], label + " " + key);
    assertClose(actual.breakdown.referenceValue, expected.finalDef, label + " final DEF");
    assertClose(actual.breakdown.defense, expected.defense, label + " defense factor");
    assertClose(actual.breakdown.resistance, expected.resistance, label + " resistance factor");
    return actual;
}

test("batch4 Aventurine E0 full direct curves and seven-hit aggregate stay source independent", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const [id, spec] of Object.entries(specs)) {
        const attack = attackOf(data, id);
        assert.equal(attack.characterId, "1304");
        assert.equal(attack.type, spec.type);
        assert.equal(attack.traceKey, spec.trace);
        assert.equal(attack.scalingStat, "def");
        assert.equal(attack.element, "Imaginary");
        assert.equal(attack.target, "single");
        assert.equal(attack.hitCount, spec.hits);
        assert.equal(attack.canCrit, true);
        if (id === "130403") {
            assert.equal(attack.support.status, "calculable", "only the pre-existing same-level Unnerved snapshot is promoted");
            assert.equal(attack.support.verified, true);
            assert.ok(attack.requiredModifierIds.includes(unnerveId));
            assert.ok(attack.modifierConditions.some(item => item.inputKey === "aventurine-unnerve-active" && item.minimum === 1 && item.default === 0));
            assert.match(attack.calculationNote, /攻撃前/);
        } else {
            assert.equal(attack.support.status, "calculable");
            assert.equal(attack.maximumEidolon, 0);
            assert.equal(attack.maximumTraceLevel, spec.values.length);
            assert.equal(attack.enemyCountExact, 1);
            assert.equal(attack.provenance.sourceCommit, fixedSourceSha);
        }
        for (let level = 1; level <= spec.values.length; level++) {
            assertClose(attack.multipliers[level - 1], spec.values[level - 1], id + " fixed-source curve Lv" + level);
            for (const config of scenarios) {
                // For Ultimate, Unnerved was already present at the same level.
                for (const on of id === "130403" ? [true] : [false, true]) {
                    const modifier = applies(candidate(data, "1304", level, on), attack);
                    assertClose(modifier.value, unnerveValues[level - 1], "independent Unnerved curve");
                    assert.equal(modifier.enabled, on);
                    const input = makeRequest(attack, level, config, [modifier]);
                    const result = check(engine, input, oracle(config, spec.values[level - 1], spec.hits, on ? unnerveValues[level - 1] : 0), id + " Lv" + level + " pre-existing Unnerved=" + on);
                    assertClose(result.breakdown.critRatePercent, config.critRate, "Leverage is already in final CR, including DEF above 4000");
                    assertClose(result.breakdown.critTakenDamage, on ? unnerveValues[level - 1] : 0, "Unnerved applies once");
                    assertClose(result.perHit.nonCrit * spec.hits, result.nonCrit, "all realized hits included once");
                    assert.equal(result.applied.filter(item => item.id === unnerveId).length, on ? 1 : 0);
                }
            }
        }
    }
});

test("batch4 Aventurine every direct action isolates DEF from ATK and HP", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const [id, spec] of Object.entries(specs)) {
        const attack = attackOf(data, id), level = spec.values.length, config = scenarios[0];
        const modifiers = [applies(candidate(data, "1304", level, true), attack)];
        const baseline = check(engine, makeRequest(attack, level, config, modifiers), oracle(config, spec.values[level - 1], spec.hits, unnerveValues[level - 1]), id + " baseline");
        for (const stat of ["atk", "hp", "def"]) {
            const changed = { ...config, [stat]: config[stat] * 1.237 + 91.125 };
            const result = check(engine, makeRequest(attack, level, changed, modifiers), oracle(changed, spec.values[level - 1], spec.hits, unnerveValues[level - 1]), id + " only " + stat);
            for (const key of ["nonCrit", "crit", "expected"]) {
                if (stat === "def") assert.notEqual(result[key], baseline[key]);
                else assertClose(result[key], baseline[key], id + " does not scale with " + stat);
            }
        }
        const extra = { defPercent: 17.25, defFlat: 103.75, damageBonus: 19.5, defenseReduction: 8.25, resistancePenetration: 7.75, critRate: 6.5 };
        const explicit = [
            { id: "test:def-percent", category: "statPercent", stat: "def", value: extra.defPercent },
            { id: "test:def-flat", category: "statFlat", stat: "def", value: extra.defFlat },
            { id: "test:damage", category: "damageBonus", value: extra.damageBonus },
            { id: "test:def-down", category: "defenseReduction", value: extra.defenseReduction },
            { id: "test:res-pen", category: "resistancePenetration", value: extra.resistancePenetration },
            { id: "test:crit", category: "critRate", value: extra.critRate }
        ];
        check(engine, makeRequest(attack, level, config, [...modifiers, ...explicit]), oracle(config, spec.values[level - 1], spec.hits, unnerveValues[level - 1], extra), id + " explicit correction categories");
    }
});

test("batch4 Aventurine Unnerved party provider is optional and E0 excludes eidolon bonuses", async () => {
    const { data, engine } = await loadProductionFixture();
    const ally = attackOf(data, "100301"), config = scenarios[0];
    // Himeko Basic 50% is an independent ATK recipient, not Aventurine's DEF.
    const allyConfig = { ...config, def: config.atk, baseDef: config.baseAtk };
    for (let level = 1; level <= 10; level++) {
        for (const on of [false, true]) {
            const mod = applies(candidate(data, "1003", level, on, ["1304"]), ally);
            assert.equal(mod.enabled, on);
            const input = makeRequest(ally, 1, config, [mod]);
            const expected = oracle(allyConfig, 50, 1, on ? unnerveValues[level - 1] : 0);
            const actual = engine.calculate(input);
            for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], "party Unnerved Lv" + level + " " + key);
        }
    }
    const own = data.structuredModifiers.filter(item => item.source?.id === "1304");
    const e0 = runtime.buildCandidates(own, { characterId: "1304", eidolon: 0, stats: { def: 4273.25, critRate: 81.25 }, traceLevelFor: () => 10 }, { "aventurine-unnerve-active": true, "aventurine-e2-res-down": true, "aventurine-shielded-allies": 3 });
    assert.deepEqual(Array.from(e0, item => item.id), [unnerveId], "E2 resistance and E6 damage do not leak into E0; A2 is final-stat owned");
});
