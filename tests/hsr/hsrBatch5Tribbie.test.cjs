"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fixedSourceSha, loadProductionFixture, attackOf, makeRequest, runtime, independentDirectDamage, assertClose } = require("./helpers/hsrDirectVerification.cjs");

// Hand-transcribed from actual JP and EN records at the fixed SHA (not catalog output):
// https://raw.githubusercontent.com/Mar-7th/StarRailRes/dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487/index_new/en/character_skills.json
// 140301 params0/1; 140303 params0/1/2; 140304 param0; 140302 param0.
// character_skill_trees: 1403001..4 establish E0 maxima 6/10/10/10;
// 1403101 = 72%, 3 stacks, after FUA; 1403102 = completed zone HP +9% party HP sum.
// character_ranks: own-Ult FUA is E6, field True DMG E1, extra field instance E2.
// Primary KQM arithmetic: https://srl.keqingmains.com/combat-mechanics/damage/damage-formula
// Primary category evidence: https://srl.keqingmains.com/evidence/equipment/relics
// KQM confirms FUA -> Zone Additional, without settling A2's intervening application:
// https://hsr.keqingmains.com/cyrene/ (Ode to Passage).
// These are scalar damage-time snapshots. Description order does not establish first-Ult
// zone/A4 timing or A2 timing relative to subsequent Zone Additional. No composite oracle.
const specs = {
    "140301": { type: "normal", key: "normal", source: "140301", values: [15,18,21,24,27,30] },
    "140303": { type: "ultimate", key: "ultimate", source: "140303", values: [15,16.5,18,19.5,21,22.5,24.37,26.25,28.12,30] },
    "1403031": { type: "additional", key: "ultimate", source: "140303", values: [6,6.6,7.2,7.8,8.4,9,9.75,10.5,11.25,12] },
    "140304": { type: "followUp", key: "talent", source: "140304", values: [9,9.9,10.8,11.7,12.6,13.5,14.62,15.75,16.88,18] }
};
const penCurve = [12,13.2,14.4,15.6,16.8,18,19.5,21,22.5,24];
const zoneCurve = [15,16.5,18,19.5,21,22.5,24.37,26.25,28.12,30];
const ids = {
    pen: "trace:1403:140302:resistance-penetration",
    zone: "trace:1403:140303:damage-taken",
    stacks: "traceNode:1403:1403101:damage"
};
const profiles = [
    { atk: 3127.25, hp: 11383.75, def: 1421.5, baseAtk: 941.25, baseHp: 1531.75, baseDef: 683.5, critRate: 43.75, critDamage: 173.25, damageBonus: 31.5, enemyLevel: 87, resistance: 26.25, resistancePenetration: 9.5, defenseReduction: 13.25, defenseIgnore: 7.75, takenDamage: 12.5, toughnessActive: true },
    { atk: 5771.75, hp: 8429.5, def: 3273.25, baseAtk: 1273.5, baseHp: 1807.25, baseDef: 1029.75, critRate: 81.25, critDamage: 107.75, damageBonus: 62.25, enemyLevel: 95, resistance: 8.75, resistancePenetration: 13.5, defenseReduction: 24.75, defenseIgnore: 6.25, takenDamage: 18.75, toughnessActive: false }
];
function context(profile, skillLevel = 1, ultimateLevel = 1) {
    return { characterId: "1403", eidolon: 0, partyIds: ["1001","1002","1003"], partyEidolons: {},
        stats: { ...profile }, baseStats: { atk: profile.baseAtk, hp: profile.baseHp, def: profile.baseDef },
        partyStats: { "1001": { hp: 2299.75 }, "1002": { hp: 5311.5 }, "1003": { hp: 8157.25 } },
        traceLevelFor: source => source?.skillId === "140302" ? skillLevel : source?.skillId === "140303" ? ultimateLevel : 1 };
}
function nativeRecords(data) {
    const records = Object.values(ids).map(id => { const r = data.structuredModifiers.find(m => m.id === id); assert.ok(r, id); return r; });
    assert.equal(records[0].category, "resistancePenetration");
    assert.equal(records[1].category, "takenDamage");
    assert.equal(records[2].category, "damageBonus");
    return records;
}
function state(stacks = 0, pen = false, zone = false) {
    return { "tribbie-followup-damage-stacks": stacks, "tribbie-numinosity-active": pen, "tribbie-zone-active": zone };
}
function scoped(mods, attack) {
    return mods.map(m => ({ ...m, applicable: m.applicable !== false && runtime.applicableToAttack(m, { ...attack, attackType: attack.type }) }));
}
function verify(engine, input, multiplier, literalMods, label, scalingStat = "hp") {
    const expected = independentDirectDamage({ ...input, attack: { scalingStat, multiplier, canCrit: true }, modifiers: literalMods });
    const actual = engine.calculate(input);
    assert.notEqual(actual.supported, false, label + ": " + actual.reason);
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], label + " " + key);
    assertClose(actual.breakdown.referenceValue, expected.effectiveReferenceValue, label + " source stat");
    assertClose(actual.breakdown.damageBonus, expected.damageBonus, label + " damage bonus");
    assertClose(actual.breakdown.defense, expected.defense, label + " DEF");
    assertClose(actual.breakdown.resistance, expected.resistance, label + " RES");
    return actual;
}

test("batch5 Tribbie all E0 scalar curves independently use her own completed HP and correct damage category", async () => {
    const { data, engine } = await loadProductionFixture();
    assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
    for (const [id, spec] of Object.entries(specs)) {
        const attack = attackOf(data, id);
        assert.equal(attack.characterId, "1403");
        assert.equal(attack.sourceSkillId, spec.source);
        assert.equal(attack.type, spec.type);
        assert.equal(attack.traceKey, spec.key);
        assert.equal(attack.element, "Quantum");
        assert.equal(attack.scalingStat, "hp");
        assert.equal(attack.hitCount, 1, "one realized instance, not the number of eligible ally Ultimates or targets");
        assert.equal(attack.canCrit, true);
        assert.equal(attack.support.status, "calculable");
        assert.equal(attack.support.verified, true);
        assert.equal(attack.provenance.sourceCommit, fixedSourceSha);
        assert.equal(attack.maximumEidolon, 0);
        assert.equal(attack.characterLevelExact, 80);
        assert.equal(attack.enemyCountExact, 1);
        assert.equal(attack.maximumTraceLevel, spec.values.length);
        assert.notEqual(attack.damageFormula, "componentSequence");
        for (let level = 1; level <= spec.values.length; level++) for (const profile of profiles) {
            assertClose(attack.multipliers[level - 1], spec.values[level - 1], id + " literal Lv" + level);
            const input = makeRequest(attack, level, profile);
            const baseline = verify(engine, input, spec.values[level - 1], [], id + " Lv" + level);
            for (const stat of ["atk", "hp", "def"]) {
                const changed = structuredClone(input);
                changed.character.stats[stat] += 1349.75;
                const actual = engine.calculate(changed);
                for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key] / baseline[key], stat === "hp" ? changed.character.stats.hp / profile.hp : 1, id + " isolated " + stat);
            }
            const changed = structuredClone(input);
            changed.character.baseStats = { atk: 54321.75, hp: 65432.5, def: 76543.25 };
            for (const key of ["nonCrit", "crit", "expected"]) assertClose(engine.calculate(changed)[key], baseline[key], id + " uses final HP without rebuilding minor traces");
            if (id === "140301") assert.equal(baseline.adjacent, undefined, "no adjacent target damage enters enemy-one result");
        }
    }
});

test("batch5 Tribbie native PEN zone vulnerability and existing A2 stacks apply once at independent source levels", async () => {
    const { data, engine } = await loadProductionFixture();
    const records = nativeRecords(data);
    for (let skill = 1; skill <= 10; skill++) for (let ultimate = 1; ultimate <= 10; ultimate++) for (const stacks of [0,1,2,3]) {
        for (const [id, spec] of Object.entries(specs)) {
            const attack = attackOf(data, id), profile = profiles[(skill + ultimate) % 2];
            const active = scoped(runtime.buildCandidates(records, context(profile, skill, ultimate), state(stacks, true, true)), attack);
            assert.equal(active.length, 3);
            assertClose(active.find(m => m.id === ids.pen).value, penCurve[skill - 1], "independent skill level");
            assertClose(active.find(m => m.id === ids.zone).value, zoneCurve[ultimate - 1], "independent ultimate level");
            assertClose(active.find(m => m.id === ids.stacks).value, 72 * stacks, "prior completed FUA stacks");
            const level = 1 + (skill + ultimate + stacks) % spec.values.length;
            const input = makeRequest(attack, level, profile, active);
            const before = JSON.stringify(input);
            const actual = verify(engine, input, spec.values[level - 1], [{ category: "resistancePenetration", value: penCurve[skill - 1] }, { category: "takenDamage", value: zoneCurve[ultimate - 1] }, { category: "damageBonus", value: 72 * stacks }], id + " native s" + skill + " u" + ultimate + " stack" + stacks);
            assertClose(actual.breakdown.takenDamage, profile.takenDamage + zoneCurve[ultimate - 1], "zone does not multiply twice");
            assert.equal(JSON.stringify(input), before, "a scalar snapshot does not advance A2 stacks, ally trigger allowances or field state");
        }
    }
    const off = runtime.buildCandidates(records, context(profiles[0], 10, 10), state());
    assert.ok(off.every(m => !m.enabled), "membership and selecting an attack do not activate Numinosity, field, or A2");
});

test("batch5 Tribbie party PEN and vulnerability use provider levels without leaking her A2 or HP into an ally", async () => {
    const { data, engine } = await loadProductionFixture();
    const records = nativeRecords(data), attack = attackOf(data, "100201"), basic = [50,60,70,80,90,100];
    for (let skill = 1; skill <= 10; skill++) for (let ultimate = 1; ultimate <= 10; ultimate++) for (let level = 1; level <= 6; level++) {
        const profile = profiles[level % 2], c = { ...context(profile, skill, ultimate), characterId: "1002", partyIds: ["1403"], partyEidolons: { "1403": 0 }, partyStats: { "1403": { hp: 99999.75, atk: 88888.5, def: 77777.25 } } };
        const active = scoped(runtime.buildCandidates(records, c, state(3, true, true)), attack);
        assert.equal(active.length, 2, "Tribbie's own A2 cannot buff a party attacker");
        assert.ok(active.every(m => m.enabled && m.applicable && m.providerId === "1403"));
        verify(engine, makeRequest(attack, level, profile, active), basic[level - 1], [{ category: "resistancePenetration", value: penCurve[skill - 1] }, { category: "takenDamage", value: zoneCurve[ultimate - 1] }], "ally independent provider levels", "atk");
        assert.ok(runtime.buildCandidates(records, c, state()).every(m => !m.enabled), "putting Tribbie into party does not assert successful active effects");
    }
    assert.equal(runtime.buildCandidates(records, { characterId: "1002", partyIds: [] }, state(3, true, true)).length, 0, "unselected provider cannot contribute");
});

test("batch5 Tribbie completed A4 HP is consumed once without recursive party HP reconstruction", async () => {
    const { data, engine } = await loadProductionFixture();
    const a4 = data.structuredModifiers.find(m => m.source?.id === "1403" && m.source?.traceId === "1403102");
    assert.ok(a4, "A4 final HP policy is explicit");
    assert.equal(a4.inputPolicy, "includedInFinalStats");
    assert.equal(a4.support.status, "displayOnly");
    for (const completedHp of [6197.25,10839.5,17911.75]) for (const partyHp of [0,13579.25,987654.5]) {
        const profile = { ...profiles[0], hp: completedHp }, c = context(profile, 10, 10);
        c.partyStats = { "1001": { hp: partyHp }, "1002": { hp: partyHp + 2199.75 }, "1003": { hp: partyHp + 7483.5 } };
        const candidates = runtime.buildCandidates([a4], c, state(3, true, true));
        assert.equal(candidates.length, 1);
        assert.equal(candidates[0].enabled, false);
        assert.equal(candidates[0].calculable, false);
        for (const [id, spec] of Object.entries(specs)) for (let level = 1; level <= spec.values.length; level++) {
            verify(engine, makeRequest(attackOf(data, id), level, profile, candidates), spec.values[level - 1], [], id + " completed A4 HP");
        }
    }
});

test("batch5 Tribbie accepts external party damage at independent levels while external ATK does not replace HP scaling", async () => {
    const { data, engine } = await loadProductionFixture();
    const records = ["trace:1202:120202:benediction-atk", "trace:1202:120203:ultimate-damage"].map(id => { const r = data.structuredModifiers.find(m => m.id === id); assert.ok(r, id); return r; });
    const atkCurve = [25,27.5,30,32.5,35,37.5,40.62,43.75,46.88,50];
    const capCurve = [15,16,17,18,19,20,21.25,22.5,23.75,25];
    const damageCurve = [20,23,26,29,32,35,38.75,42.5,46.25,50];
    for (let provider = 1; provider <= 10; provider++) for (const [id, spec] of Object.entries(specs)) for (let level = 1; level <= spec.values.length; level++) {
        const attack = attackOf(data, id), profile = profiles[provider % 2], providerAtk = 2017.75;
        const c = { ...context(profile), partyIds: ["1202"], partyEidolons: { "1202": 0 }, partyStats: { "1202": { atk: providerAtk, hp: 99999.25 } }, traceLevelFor: () => provider };
        const active = scoped(runtime.buildCandidates(records, c, { "tingyun-benediction": true, "tingyun-ultimate-active": true }), attack);
        assert.equal(active.length, 2);
        assert.ok(active.every(m => m.enabled && m.applicable));
        const atkBonus = Math.min(profile.baseAtk * atkCurve[provider - 1] / 100, providerAtk * capCurve[provider - 1] / 100);
        verify(engine, makeRequest(attack, level, profile, active), spec.values[level - 1], [{ category: "statFlat", stat: "atk", value: atkBonus }, { category: "damageBonus", value: damageCurve[provider - 1] }], id + " external Lv" + provider);
    }
    const followUpOnly = { id: "independent-fua-only", category: "damageBonus", value: 79.25, enabled: true, applicable: true, calculable: true, target: { attackTypes: ["followUp"] } };
    for (const [id, spec] of Object.entries(specs)) {
        const attack = attackOf(data, id), applies = id === "140304";
        assert.equal(runtime.applicableToAttack(followUpOnly, attack), applies, "field Additional is not Ultimate or FUA damage");
        verify(engine, makeRequest(attack, 1, profiles[0], scoped([followUpOnly], attack)), spec.values[0], applies ? [{ category: "damageBonus", value: 79.25 }] : [], id + " follow-up category");
    }
});
