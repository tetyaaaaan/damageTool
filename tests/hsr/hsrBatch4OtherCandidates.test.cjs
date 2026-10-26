"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fixedSourceSha, loadProductionFixture, attackOf, makeRequest, runtime, independentDirectDamage, assertClose } = require("./helpers/hsrDirectVerification.cjs");

// Independently transcribed from EN character_skills / character_skill_trees at
// dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487, not from generated runtime records.
// https://raw.githubusercontent.com/Mar-7th/StarRailRes/dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487/index_new/en/character_skills.json
// Formula/category evidence: https://srl.keqingmains.com/combat-mechanics/damage/damage-formula
const cases = {
    "140401": { type: "normal", key: "normal", values: [25,30,35,40,45,50] },
    "140402": { type: "skill", key: "skill", values: [45,49.5,54,58.5,63,67.5,73.12,78.75,84.38,90], adjacent: [25,27.5,30,32.5,35,37.5,40.62,43.75,46.88,50] },
    "140409": { type: "skill", key: "skill", values: [55,60.5,66,71.5,77,82.5,89.38,96.25,103.12,110], adjacent: [33,36.3,39.6,42.9,46.2,49.5,53.63,57.75,61.88,66] },
    "140411": { type: "skill", key: "skill", values: [140,154,168,182,196,210,227.5,245,262.5,280], adjacent: [84,92.4,100.8,109.2,117.6,126,136.5,147,157.5,168] },
    "140403": { type: "ultimate", key: "ultimate", values: [96,102.4,108.8,115.2,121.6,128,136,144,152,160], adjacent: [60,64,68,72,76,80,85,90,95,100] }
};
const profiles = [
    { hp: 7843.25, atk: 2193.75, def: 1337.5, baseHp: 1552.32, baseAtk: 426.888, baseDef: 194.04, critRate: 67.25, critDamage: 137.3, damageBonus: 33.75, enemyLevel: 87, resistance: 30, defenseReduction: 12.5, defenseIgnore: 7.5, resistancePenetration: 6.25, takenDamage: 11.75, toughnessActive: true },
    { hp: 13001.75, atk: 3456.25, def: 0, baseHp: 2421.75, baseAtk: 1045.5, baseDef: 678.25, critRate: 91.5, critDamage: 96.75, damageBonus: 18.5, enemyLevel: 75, resistance: 10, defenseReduction: 4.25, defenseIgnore: 18.5, resistancePenetration: 13.75, takenDamage: 5.5, toughnessActive: false }
];
function verify(engine, input, multiplier, modifiers, label) {
    const oracle = independentDirectDamage({ ...input, attack: { scalingStat: "hp", multiplier, canCrit: true }, modifiers });
    const result = engine.calculate(input);
    assert.notEqual(result.supported, false, label + " supported: " + result.reason);
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], oracle[key], label + " " + key);
    assertClose(result.breakdown.referenceValue, input.character.stats.hp, label + " final HP");
    return result;
}
function ownCandidates(data, attack, profile, nativeLevel) {
    return runtime.buildCandidates(data.structuredModifiers, {
        characterId: "1404", eidolon: 0, partyIds: [], stats: { ...profile },
        baseStats: { hp: profile.baseHp, atk: profile.baseAtk, def: profile.baseDef }, traceLevelFor: () => nativeLevel
    }, {}).map(m => ({ ...m, applicable: m.applicable !== false && runtime.applicableToAttack(m, attack) }));
}

test("batch4 Mydei all five E0 direct actions match independent pinned HP curves at every adopted level", async () => {
    assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
    const { data, engine } = await loadProductionFixture();
    for (const [id, spec] of Object.entries(cases)) {
        const attack = attackOf(data, id);
        assert.equal(attack.characterId, "1404");
        assert.equal(attack.element, "Imaginary");
        assert.equal(attack.scalingStat, "hp");
        assert.equal(attack.type, spec.type);
        assert.equal(attack.traceKey, spec.key);
        assert.equal(attack.hitCount, 1);
        assert.equal(attack.canCrit, true);
        assert.equal(attack.support.status, "calculable");
        assert.equal(attack.support.verified, true);
        assert.equal(attack.provenance.sourceCommit, fixedSourceSha);
        assert.equal(attack.characterLevelExact, 80);
        assert.equal(attack.maximumEidolon, 0);
        assert.equal(attack.maximumTraceLevel, spec.values.length);
        assert.equal(attack.enemyCountExact, 1);
        assert.deepEqual(Array.from(attack.multipliers).slice(0, spec.values.length), spec.values, id + " literal E0 main curve");
        if (spec.adjacent) assert.deepEqual(Array.from(attack.adjacentMultipliers).slice(0, spec.values.length), spec.adjacent, id + " adjacent coefficient remains distinct");
        for (let level = 1; level <= spec.values.length; level++) for (const profile of profiles) {
            const mods = ownCandidates(data, attack, profile, level);
            const input = makeRequest(attack, level, profile, mods);
            const result = verify(engine, input, spec.values[level - 1], [], id + " Lv" + level);
            for (const stat of ["atk", "hp", "def"]) {
                const changed = structuredClone(input);
                changed.character.stats[stat] += 983.75;
                const actual = engine.calculate(changed);
                if (stat === "hp") assertClose(actual.nonCrit / result.nonCrit, changed.character.stats.hp / input.character.stats.hp, id + " scales with HP only");
                else for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], result[key], id + " ignores " + stat);
            }
            const changed = structuredClone(input);
            changed.character.baseStats = { hp: 44444.5, atk: 33333.25, def: 22222.75 };
            for (const key of ["nonCrit", "crit", "expected"]) assertClose(engine.calculate(changed)[key], result[key], id + " does not reconstruct final inputs");
        }
    }
});

test("batch4 Mydei Vendetta HP and battle-start A6 CR are already in final inputs and never added again", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const battleStartHp of [3999.75, 6000.25, 8000, 10000.5]) for (const vendetta of [false, true]) {
        // A6 measures battle-start HP, not the enlarged HP during Vendetta.
        const a6Crit = Math.max(0, Math.min(4000, battleStartHp - 4000)) / 100 * 1.2;
        const profile = { ...profiles[0], hp: battleStartHp * (vendetta ? 1.5 : 1), def: vendetta ? 0 : 1337.5, critRate: 37.5 + a6Crit };
        for (const [id, spec] of Object.entries(cases)) {
            if (!vendetta && ["140409", "140411"].includes(id)) continue;
            const attack = attackOf(data, id), level = spec.values.length;
            for (let talentLevel = 1; talentLevel <= 10; talentLevel++) {
                const mods = ownCandidates(data, attack, profile, talentLevel);
                assert.equal(mods.some(m => m.enabled && m.source?.kind === "eidolon"), false, "E1 coefficient and E2 DEF ignore stay out of E0");
                const result = verify(engine, makeRequest(attack, level, profile, mods), spec.values[level - 1], [], id + " completed native snapshot");
                assertClose(result.expected / result.nonCrit, 1 + profile.critRate / 100 * profile.critDamage / 100, id + " A6 CR is counted once");
            }
        }
    }
});

test("batch4 Mydei receives party DMG support at independent provider levels while ATK support leaves HP damage unchanged", async () => {
    const { data, engine } = await loadProductionFixture();
    const ultimateCurve = [20,23,26,29,32,35,38.75,42.5,46.25,50];
    const ids = ["trace:1202:120202:benediction-atk", "trace:1202:120203:ultimate-damage"];
    const records = ids.map(id => { const r = data.structuredModifiers.find(m => m.id === id); assert.ok(r, id); return r; });
    for (const [id, spec] of Object.entries(cases)) {
        const attack = attackOf(data, id);
        for (let ownerLevel = 1; ownerLevel <= spec.values.length; ownerLevel++) for (let providerLevel = 1; providerLevel <= 10; providerLevel++) {
            const profile = profiles[1];
            const context = { characterId: "1404", eidolon: 0, partyIds: ["1202"], partyEidolons: { "1202": 0 }, partyStats: { "1202": { atk: 3141.75 } }, stats: { atk: profile.atk, hp: profile.hp, def: profile.def }, baseStats: { atk: profile.baseAtk, hp: profile.baseHp, def: profile.baseDef }, traceLevelFor: () => providerLevel };
            const mods = runtime.buildCandidates(records, context, { "tingyun-benediction": true, "tingyun-ultimate-active": true }).map(m => ({ ...m, applicable: m.applicable !== false && runtime.applicableToAttack(m, attack) }));
            assert.equal(mods.length, 2);
            assert.ok(mods.every(m => m.enabled && m.applicable));
            verify(engine, makeRequest(attack, ownerLevel, profile, mods), spec.values[ownerLevel - 1], [{ category: "damageBonus", value: ultimateCurve[providerLevel - 1] }], id + " party Lv" + providerLevel);
            const off = runtime.buildCandidates(records, context, {});
            assert.ok(off.every(m => !m.enabled), "party membership alone does not activate support");
        }
    }
});

// The pinned EN source is unambiguous even where the JP pronoun is not:
// 800803: "makes Mem deal ... #1[i]% of Mem's ATK" (params[0]).
// 800808: "#1[i]% of Trailblazer's ATK and #2[i]% of Mem's ATK respectively".
// These literal equal coefficients do not authorize replacing the two owners
// with one Trailblazer snapshot or dropping the Mem component.
const remembranceOwnerBoundaries = {
    "800803": { levelKey: "ultimate", mem: [120,132,144,156,168,180,195,210,225,240] },
    "800808": { levelKey: "normal", trailblazer: [60,72,84,96,108,120], mem: [60,72,84,96,108,120] }
};
test("batch4 Remembrance owner boundaries withhold Mem-only Ultimate and two-owner Joint ATK instead of fabricating Trailblazer damage", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const [id, source] of Object.entries(remembranceOwnerBoundaries)) {
        const attack = attackOf(data, id);
        assert.equal(attack.characterId, "8008");
        assert.equal(attack.sourceSkillId, id);
        assert.equal(attack.support.status, "displayOnly", id + " requires an independently entered Mem ATK snapshot");
        assert.match(attack.support.reason, /Mem|ミュリオン|精霊/, id + " explains the missing owner");
        for (let level = 1; level <= source.mem.length; level++) {
            // Generated coefficients may remain as display data; they are not
            // evidence that the owner reference or full action is calculable.
            assertClose(attack.multipliers[level - 1], (source.trailblazer || source.mem)[level - 1], id + " pinned displayed coefficient Lv" + level);
            for (const profile of [profiles[0], { ...profiles[0], atk: 0 }, { ...profiles[1], atk: 98765.25, hp: 12345.75, def: 54321.5 }]) {
                const result = engine.calculate(makeRequest(attack, level, profile));
                assert.equal(result.supported, false, id + " refuses a request without the Mem snapshot");
                for (const key of ["nonCrit", "crit", "expected"]) assert.equal(result[key], undefined, id + " exposes no fabricated " + key);
                assert.equal(result.breakdown?.referenceValue, undefined, id + " exposes no fabricated Trailblazer reference");
            }
        }
    }
});

test('batch4 Phainon maximum descriptor preserves the complete fixed-source percentage without claiming whole-action verification',async()=>{
 const {data}=await loadProductionFixture();const a=attackOf(data,'140811');
 assert.deepEqual(Array.from(a.multipliers),[585,643.5,702,760.5,819,877.5,950.62,1023.75,1096.88,1170,1228.5,1287,1345.5,1404,1462.5]);
 assert.equal(a.support.status,'review');assert.equal(a.support.verified,false);assert.equal(a.provenance.sourceCommit,fixedSourceSha);
});
