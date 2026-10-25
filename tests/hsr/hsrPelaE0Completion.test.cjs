"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const runtime = require("../../games/js/hsrModifierRuntime.js");
const {
    fixedSourceSha,
    loadProductionFixture,
    attackOf,
    makeRequest,
    assertClose,
    independentDirectDamage
} = require("./helpers/hsrDirectVerification.cjs");

// Fixed StarRailRes character_skills.json curves and references, transcribed
// independently of the production attack overrides.
const pelaE0 = {
    "110601": { scalingStat: "atk", element: "Ice", traceKey: "normal", target: "single", multipliers: [50, 60, 70, 80, 90, 100] },
    "110602": { scalingStat: "atk", element: "Ice", traceKey: "skill", target: "single", multipliers: [105, 115.5, 126, 136.5, 147, 157.5, 170.63, 183.75, 196.88, 210] },
    "110603": { scalingStat: "atk", element: "Ice", traceKey: "ultimate", target: "aoe", multipliers: [60, 64, 68, 72, 76, 80, 85, 90, 95, 100] }
};

const profiles = [
    {
        characterLevel: 80, eidolon: 0,
        atk: 3000, hp: 7421.5, def: 1198.75,
        baseAtk: 991.5, baseHp: 1400.25, baseDef: 1100.75,
        critRate: 37.5, critDamage: 121.75, damageBonus: 27.75,
        enemyCount: 1, enemyLevel: 83, resistance: 25,
        resistancePenetration: 6.25, defenseReduction: 12.5,
        defenseIgnore: 7.5, takenDamage: 11.5, toughnessActive: true
    },
    {
        characterLevel: 80, eidolon: 0,
        atk: 2411.75, hp: 5809.25, def: 3517.125,
        baseAtk: 1173.25, baseHp: 903.5, baseDef: 1288.75,
        critRate: 62.25, critDamage: 73.5, damageBonus: 41.3,
        enemyCount: 1, enemyLevel: 75, resistance: 0,
        toughnessActive: true
    }
];

function findModifier(data, id) {
    const record = data.structuredModifiers.find((item) => item.id === id);
    assert.ok(record, "production loader must include modifier " + id);
    return record;
}

function candidate(data, id, inputs = {}, contextOverrides = {}) {
    const record = findModifier(data, id);
    const context = {
        characterId: "1106",
        eidolon: 0,
        enemy: { debuffCount: 0 },
        traceLevelFor: () => 10,
        ...contextOverrides
    };
    return runtime.buildCandidates([record], context, inputs)[0];
}

function requestFor(attack, level, spec, profile, modifiers = []) {
    const input = makeRequest(attack, level, profile, modifiers);
    input.attack = {
        ...input.attack,
        id: attack.id,
        characterId: "1106",
        scalingStat: spec.scalingStat,
        element: spec.element,
        target: spec.target,
        traceLevel: level,
        multiplier: spec.multipliers[level - 1],
        canCrit: true
    };
    input.character.eidolon = 0;
    return input;
}

function assertIndependent(engine, input, spec, multiplier, label) {
    const oracleInput = {
        ...input,
        attack: { ...input.attack, scalingStat: spec.scalingStat, multiplier, canCrit: true }
    };
    const expected = independentDirectDamage(oracleInput);
    const actual = engine.calculate(input);
    assert.notEqual(actual.supported, false, label + " calculates");
    for (const key of ["nonCrit", "crit", "expected"]) {
        assertClose(actual[key], expected[key], label + " " + key);
    }
    assertClose(actual.breakdown.referenceValue, expected.effectiveReferenceValue, label + " ATK reference");
    assertClose(actual.breakdown.damageBonus, expected.damageBonus, label + " damage bonus");
    assertClose(actual.breakdown.defense, expected.defense, label + " defense multiplier");
    assertClose(actual.breakdown.resistance, expected.resistance, label + " resistance multiplier");
    return actual;
}

test("Pela E0 direct attack curves match fixed-SHA source for every E0 trace level", async () => {
    assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
    const { data, engine } = await loadProductionFixture();

    for (const [id, spec] of Object.entries(pelaE0)) {
        const attack = attackOf(data, id);
        assert.equal(attack.support?.status, "calculable", id + " is in production calculation scope");
        assert.equal(attack.support?.verified, true, id + " retains verified status");
        assert.equal(attack.characterId, "1106", id + " belongs to Pela");
        assert.equal(attack.scalingStat, "atk", id + " references ATK");
        assert.equal(attack.element, "Ice", id + " is Ice damage");
        assert.equal(attack.traceKey, spec.traceKey, id + " trace selector");
        assert.equal(attack.target, spec.target, id + " target");
        assert.equal(attack.canCrit, true, id + " direct hit can crit");
        assert.equal(attack.hitCount, 1, id + " is one direct hit");
        assert.deepEqual(Array.from(attack.multipliers).slice(0, spec.multipliers.length), spec.multipliers, id + " fixed-source curve");

        for (const [profileIndex, profile] of profiles.entries()) {
            for (let level = 1; level <= spec.multipliers.length; level++) {
                const input = requestFor(attack, level, spec, profile);
                assertIndependent(engine, input, spec, spec.multipliers[level - 1], `${id} E0 Lv${level} profile${profileIndex + 1}`);
            }
        }
    }
});

test("Pela E0 direct attacks depend on ATK only, not HP or DEF", async () => {
    const { data, engine } = await loadProductionFixture();
    const profile = profiles[1];

    for (const [id, spec] of Object.entries(pelaE0)) {
        const attack = attackOf(data, id);
        const level = Math.min(6, spec.multipliers.length);
        const baselineInput = requestFor(attack, level, spec, profile);
        const baseline = assertIndependent(engine, baselineInput, spec, spec.multipliers[level - 1], id + " baseline");

        for (const stat of ["atk", "hp", "def"]) {
            const changedProfile = { ...profile, [stat]: profile[stat] + 317.25 };
            const changedInput = requestFor(attack, level, spec, changedProfile);
            const changed = assertIndependent(engine, changedInput, spec, spec.multipliers[level - 1], id + " change " + stat);
            for (const metric of ["nonCrit", "crit", "expected"]) {
                if (stat === "atk") assert.notEqual(changed[metric], baseline[metric], id + " must use ATK");
                else assertClose(changed[metric], baseline[metric], id + " must ignore " + stat + " for " + metric);
            }
        }
    }
});

test("Pela A2 and A6 are additive damage bonuses; prior debuffs and Technique are separate DEF stages", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "110601");
    const spec = pelaE0["110601"];
    const level = 6;
    const profile = profiles[1];
    const baseInput = requestFor(attack, level, spec, profile);
    const base = assertIndependent(engine, baseInput, spec, 100, "Pela Basic with no optional conditions");

    const a2Off = candidate(data, "traceNode:1106:1106101:debuffed-damage", {}, { enemy: { debuffCount: 0 } });
    const a2On = candidate(data, "traceNode:1106:1106101:debuffed-damage", {}, { enemy: { debuffCount: 1 } });
    const a6Off = candidate(data, "traceNode:1106:1106103:after-dispel-damage");
    const a6On = candidate(data, "traceNode:1106:1106103:after-dispel-damage", { "pela-after-dispel-damage": true });
    assert.equal(a2Off.enabled, false, "A2 is not active without an existing enemy debuff");
    assert.equal(a2On.enabled, true, "A2 activates against an already debuffed target");
    assert.equal(a6Off.enabled, false, "A6 is OFF unless the next-attack state is selected");
    assert.equal(a6On.enabled, true, "A6 can be selected for the next attack after a dispel");

    const a2Result = assertIndependent(engine, { ...baseInput, modifiers: [a2On] }, spec, 100, "A2 only");
    const a6Result = assertIndependent(engine, { ...baseInput, modifiers: [a6On] }, spec, 100, "A6 only");
    const both = assertIndependent(engine, { ...baseInput, modifiers: [a2On, a6On] }, spec, 100, "A2 plus A6");
    assertClose(a2Result.breakdown.damageBonus - base.breakdown.damageBonus, 20, "A2 contributes +20% damage bonus");
    assertClose(a6Result.breakdown.damageBonus - base.breakdown.damageBonus, 20, "A6 contributes +20% damage bonus");
    assertClose(both.breakdown.damageBonus - base.breakdown.damageBonus, 40, "A2 and A6 add in the damage-bonus stage");

    const ultimateDebuff = candidate(data, "trace:1106:110603:defense-reduction", { "pela-general-solution": true });
    const techniqueDebuff = candidate(data, "trace:1106:110607:defense-reduction", { "pela-technique-defense-down": true });
    const ultimateOff = candidate(data, "trace:1106:110603:defense-reduction");
    const techniqueOff = candidate(data, "trace:1106:110607:defense-reduction");
    assert.equal(ultimateOff.enabled, false, "the separately selected General Solution state defaults OFF");
    assert.equal(techniqueOff.enabled, false, "Technique DEF reduction defaults OFF");
    assert.equal(ultimateDebuff.value, 40, "Ultimate Lv10 DEF reduction is 40%");
    assert.equal(techniqueDebuff.value, 20, "Technique DEF reduction is 20%");

    // These inputs mean the debuffs are already active before the evaluated
    // hit. This test does not infer whether an Ultimate's newly applied debuff
    // changes that same Ultimate hit; fixed-source text alone does not establish
    // that event ordering.
    const priorDebuffs = [ultimateDebuff, techniqueDebuff];
    for (const [id, directSpec] of Object.entries(pelaE0)) {
        const directAttack = attackOf(data, id);
        const directLevel = directSpec.multipliers.length;
        const directInput = requestFor(directAttack, directLevel, directSpec, profile);
        const directBase = assertIndependent(engine, directInput, directSpec, directSpec.multipliers[directLevel - 1], id + " no selected DEF state");
        const defOnly = assertIndependent(engine, { ...directInput, modifiers: priorDebuffs }, directSpec, directSpec.multipliers[directLevel - 1], id + " prior Ultimate DEF down plus Technique");
        assertClose(defOnly.breakdown.damageBonus, directBase.breakdown.damageBonus, id + " DEF effects do not become damage bonuses");
        const full = assertIndependent(engine, { ...directInput, modifiers: [...priorDebuffs, a2On, a6On] }, directSpec, directSpec.multipliers[directLevel - 1], id + " prior DEF effects plus A2/A6");
        assertClose(full.breakdown.damageBonus - directBase.breakdown.damageBonus, 40, id + " damage bonuses remain independent from DEF reduction");
        assert.ok(full.nonCrit > defOnly.nonCrit, id + " A2/A6 increase damage separately from DEF down");
    }

    const permanentAttack = candidate(data, "traceStats:1106:attack");
    assert.equal(permanentAttack.displayOnly, true, "minor-trace ATK belongs in the completed final-stat input");
    assert.equal(permanentAttack.enabled, false, "the permanent ATK minor trace is not recalculated as a battle bonus");
    const withDisplayOnly = assertIndependent(engine, { ...baseInput, modifiers: [permanentAttack] }, spec, 100, "completed ATK input avoids minor-trace re-addition");
    assertClose(withDisplayOnly.nonCrit, base.nonCrit, "included-in-final-stats trace does not double-add");
});
