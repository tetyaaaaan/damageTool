"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fixedSourceSha, loadProductionFixture, attackOf, makeRequest, runtime, independentDirectDamage, assertClose } = require("./helpers/hsrDirectVerification.cjs");

// Literal EN source curves at dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487.
// character_skills: 141201/141203 param0; 141204 param2 (Cerydra's ATK).
// https://raw.githubusercontent.com/Mar-7th/StarRailRes/dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487/index_new/en/character_skills.json
// Own/holder boundary and damage category are explicit in that source.
// Independent formula: https://srl.keqingmains.com/combat-mechanics/damage/damage-formula
const specs = {
    "141201": { type: "normal", key: "normal", values: [50,60,70,80,90,100] },
    "141203": { type: "ultimate", key: "ultimate", values: [144,153.6,163.2,172.8,182.4,192,204,216,228,240] },
    "141204": { type: "additional", key: "talent", values: [30,33,36,39,42,45,48.75,52.5,56.25,60] }
};
const profiles = [
    { atk: 3175.25, hp: 9432.5, def: 1288.75, baseAtk: 1043, baseHp: 1287, baseDef: 743, critRate: 100, critDamage: 278.795, damageBonus: 27.5, enemyLevel: 83, resistance: 30, toughnessActive: true, defenseReduction: 12.5, defenseIgnore: 7.5, resistancePenetration: 6.25, takenDamage: 11.5 },
    { atk: 4213.75, hp: 14321.25, def: 3541.5, baseAtk: 891, baseHp: 1523, baseDef: 1009, critRate: 100, critDamage: 447.5, damageBonus: 11.75, enemyLevel: 76, resistance: 10, toughnessActive: false, defenseReduction: 4.25, defenseIgnore: 18.5, resistancePenetration: 13.75, takenDamage: 5.5 }
];
function context(profile, level, holder = {}) {
    return { characterId: "1412", eidolon: 0, partyIds: ["1001"], partyEidolons: { "1001": 0 },
        partyStats: { "1001": { atk: 19999, hp: 29999, def: 3999, critRate: 77.5, critDamage: 233.75, ...holder } },
        stats: { ...profile }, baseStats: { atk: profile.baseAtk, hp: profile.baseHp, def: profile.baseDef }, traceLevelFor: () => level };
}
function scoped(mods, attack) {
    return mods.map(m => ({ ...m, applicable: m.applicable !== false && runtime.applicableToAttack(m, attack) }));
}
function verify(engine, input, multiplier, literalMods, label) {
    const expected = independentDirectDamage({ ...input, attack: { scalingStat: "atk", multiplier, canCrit: true }, modifiers: literalMods });
    const actual = engine.calculate(input);
    assert.notEqual(actual.supported, false, label + " supported: " + actual.reason);
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], label + " " + key);
    assertClose(actual.breakdown.referenceValue, expected.effectiveAtk, label + " Cerydra ATK");
    return actual;
}

test("batch4 Cerydra all adopted E0 Basic Ultimate and realized Talent proc levels match independent own-ATK damage", async () => {
    const { data, engine } = await loadProductionFixture();
    assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
    for (const [id, spec] of Object.entries(specs)) {
        const attack = attackOf(data, id);
        assert.equal(attack.characterId, "1412");
        assert.equal(attack.sourceSkillId, id);
        assert.equal(attack.type, spec.type);
        assert.equal(attack.traceKey, spec.key);
        assert.equal(attack.element, "Wind");
        assert.equal(attack.scalingStat, "atk");
        assert.equal(attack.hitCount, 1, "a realized proc is one release, not the twenty-proc allowance");
        assert.equal(attack.canCrit, true);
        assert.equal(attack.support.status, "calculable");
        assert.equal(attack.support.verified, true);
        assert.equal(attack.provenance.sourceCommit, fixedSourceSha);
        assert.equal(attack.characterLevelExact, 80);
        assert.equal(attack.maximumEidolon, 0);
        assert.equal(attack.maximumTraceLevel, spec.values.length);
        assert.equal(attack.enemyCountExact, 1);
        for (let level = 1; level <= spec.values.length; level++) for (const profile of profiles) {
            assertClose(attack.multipliers[level - 1], spec.values[level - 1], id + " pinned coefficient Lv" + level);
            const mods = scoped(runtime.buildCandidates(data.structuredModifiers, context(profile, level), {}), attack);
            const input = makeRequest(attack, level, profile, mods);
            const baseline = verify(engine, input, spec.values[level - 1], [], id + " Lv" + level);
            for (const stat of ["atk", "hp", "def"]) {
                const changed = structuredClone(input);
                changed.character.stats[stat] += 1234.75;
                const result = engine.calculate(changed);
                for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key] / baseline[key], stat === "atk" ? changed.character.stats.atk / input.character.stats.atk : 1, id + " isolated " + stat);
            }
            const changed = structuredClone(input);
            changed.character.baseStats = { atk: 54321.75, hp: 65432.5, def: 76543.25 };
            for (const key of ["nonCrit", "crit", "expected"]) assertClose(engine.calculate(changed)[key], baseline[key], id + " does not reconstruct completed stats");
        }
    }
});

test("batch4 Cerydra Talent uses her ATK and completed A2/A4 crit regardless of Military Merit holder stats", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "141204"), curve = specs["141204"].values;
    for (const atk of [1999.75, 2000, 2345.5, 4000, 6789.25]) {
        const conversion = Math.min(360, Math.max(0, atk - 2000) / 100 * 18);
        const profile = { ...profiles[0], atk, critRate: 100, critDamage: 87.5 + conversion };
        for (let level = 1; level <= 10; level++) {
            let baseline;
            for (const holder of [{ atk: 0, hp: 0, def: 0, critRate: 0, critDamage: 0 }, { atk: 77777.75, hp: 88888.5, def: 99999.25, critRate: 100, critDamage: 9999.75 }]) {
                const mods = scoped(runtime.buildCandidates(data.structuredModifiers, context(profile, level, holder), {}), attack);
                assert.equal(mods.some(m => m.enabled && m.source?.kind === "eidolon"), false, "E2 personal DMG and E6 personal PEN do not enter E0");
                const result = verify(engine, makeRequest(attack, level, profile, mods), curve[level - 1], [], "Talent own ATK and final crit");
                assertClose(result.expected, result.crit, "completed A4 guarantees CRIT");
                if (baseline) for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], baseline[key], "Military Merit holder " + key + " is not Cerydra's damage source");
                baseline = result;
            }
        }
    }
});

test("batch4 Cerydra receives explicitly activated party support at independent trace levels and keeps Talent Additional category", async () => {
    const { data, engine } = await loadProductionFixture();
    const sourceIds = ["trace:1202:120202:benediction-atk", "trace:1202:120203:ultimate-damage"];
    const records = sourceIds.map(id => { const m = data.structuredModifiers.find(m => m.id === id); assert.ok(m, id); return m; });
    const recipientAtkCurve = [25,27.5,30,32.5,35,37.5,40.62,43.75,46.88,50];
    const providerCapCurve = [15,16,17,18,19,20,21.25,22.5,23.75,25];
    const damageCurve = [20,23,26,29,32,35,38.75,42.5,46.25,50];
    for (const [id, spec] of Object.entries(specs)) {
        const attack = attackOf(data, id);
        for (let level = 1; level <= spec.values.length; level++) for (let providerLevel = 1; providerLevel <= 10; providerLevel++) {
            const profile = profiles[0], providerAtk = 1751.25;
            const c = { ...context(profile, level), partyIds: ["1202"], partyEidolons: { "1202": 0 }, partyStats: { "1202": { atk: providerAtk } }, traceLevelFor: () => providerLevel };
            const mods = scoped(runtime.buildCandidates(records, c, { "tingyun-benediction": true, "tingyun-ultimate-active": true }), attack);
            assert.equal(mods.length, 2);
            assert.ok(mods.every(m => m.enabled && m.applicable));
            const atkBonus = Math.min(profile.baseAtk * recipientAtkCurve[providerLevel - 1] / 100, providerAtk * providerCapCurve[providerLevel - 1] / 100);
            // The entered CD snapshot already includes A2 at the supported ATK. The engine must not convert that ATK again.
            const completed = { ...profile, critDamage: 67.25 + Math.min(360, Math.max(0, profile.atk + atkBonus - 2000) / 100 * 18) };
            verify(engine, makeRequest(attack, level, completed, mods), spec.values[level - 1], [{ category: "statFlat", stat: "atk", value: atkBonus }, { category: "damageBonus", value: damageCurve[providerLevel - 1] }], id + " party Lv" + providerLevel);
            assert.ok(runtime.buildCandidates(records, c, {}).every(m => !m.enabled), "party membership alone is inactive");
        }
        const typed = { id: "follow-up-only-independent", category: "damageBonus", value: 999, enabled: true, applicable: true, calculable: true, target: { attackTypes: ["followUp"] } };
        if (id === "141204") {
            assert.equal(runtime.applicableToAttack(typed, attack), false, "Talent's Additional DMG is not Follow-Up DMG");
            const input = makeRequest(attack, 10, profiles[0], [{ ...typed, applicable: false }]);
            verify(engine, input, spec.values[9], [], "Additional ignores a follow-up-only buff");
        }
    }
});
