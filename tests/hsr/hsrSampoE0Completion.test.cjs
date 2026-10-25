"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const runtime = require("../../games/js/hsrModifierRuntime.js");
const {
    fixedSourceSha,
    loadProductionFixture,
    attackOf,
    makeRequest,
    independentDirectDamage,
    assertClose
} = require("./helpers/hsrDirectVerification.cjs");

const sampoSourceSha = "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487";
const curves = {
    normal: [50, 60, 70, 80, 90, 100],
    skill: [28, 30.8, 33.6, 36.4, 39.2, 42, 45.5, 49, 52.5, 56],
    ultimate: [96, 102.4, 108.8, 115.2, 121.6, 128, 136, 144, 152, 160],
    windShear: [20, 22, 24, 26, 28, 31, 35, 40, 46, 52],
    ultimateDotTaken: [20, 21, 22, 23, 24, 25, 26.25, 27.5, 28.75, 30]
};

const profiles = [
    { atk: 3587.25, hp: 7421.5, def: 1198.75, baseAtk: 991.5, baseHp: 1400.25, baseDef: 1100.75, critRate: 37.5, critDamage: 121.75, damageBonus: 27.75, enemyCount: 1, enemyLevel: 83, resistance: 25, defenseReduction: 12.5, defenseIgnore: 7.5, resistancePenetration: 6.25, takenDamage: 11.5, toughnessActive: true },
    { atk: 2411.75, hp: 5809.25, def: 3517.125, baseAtk: 1173.25, baseHp: 903.5, baseDef: 1288.75, critRate: 62.25, critDamage: 73.5, damageBonus: 41.3, enemyCount: 1, enemyLevel: 75, resistance: 0, defenseReduction: 0, defenseIgnore: 0, resistancePenetration: 0, takenDamage: 0, toughnessActive: true }
];

function modifier(data, id, traceLevels, inputs = {}, attack) {
    const record = data.structuredModifiers.find((item) => item.id === id);
    assert.ok(record, "production loader includes " + id);
    const context = {
        characterId: "1108",
        eidolon: 0,
        traceLevelFor: (source) => traceLevels[source.skillId] ?? 10
    };
    const candidate = runtime.buildCandidates([record], context, inputs)[0];
    assert.ok(candidate, "E0 selects " + id);
    return attack ? { ...candidate, applicable: candidate.applicable && runtime.applicableToAttack(candidate, attack) } : candidate;
}

function requestFor(attack, level, profile, hitCount, modifiers = [], hitCountReference) {
    const input = makeRequest(attack, level, profile, modifiers);
    input.attack = {
        ...input.attack,
        traceLevel: level,
        multiplier: attack.multipliers[level - 1],
        hitCount,
        hitCountReference
    };
    return input;
}

function assertMatchesRepeatedIndependent(engine, input, count, label) {
    const perHitInput = {
        ...input,
        attack: { ...input.attack, hitCount: 1, hitCountReference: undefined }
    };
    const expectedPerHit = independentDirectDamage(perHitInput);
    const result = engine.calculate(input);
    assert.notEqual(result.supported, false, label + " is supported");
    for (const key of ["nonCrit", "crit", "expected"]) {
        assertClose(result[key], expectedPerHit[key] * count, label + " " + key + " for " + count + " instance(s)");
    }
    assertClose(result.breakdown.referenceValue, expectedPerHit.effectiveReferenceValue, label + " uses owner ATK");
    assertClose(result.breakdown.multiplierPercent, input.attack.multiplier, label + " keeps per-hit multiplier");
    assert.equal(result.attack.hitCount, count, label + " preserves the requested count");
    if (count === 0) {
        for (const key of ["nonCrit", "crit", "expected", "perHit.nonCrit", "perHit.crit", "perHit.expected"]) {
            const value = key.startsWith("perHit.") ? result.perHit[key.slice(7)] : result[key];
            assert.ok(Number.isFinite(value), label + " exposes finite zero-state " + key);
            assert.equal(value, 0, label + " has no damage at zero stacks: " + key);
        }
    }
    return result;
}

test("Sampo E0 production rows match the fixed-source direct and separate DoT composition", async () => {
    assert.equal(fixedSourceSha, sampoSourceSha);
    const { data } = await loadProductionFixture();
    const expected = ["110801", "110802", "110803", "110804"];
    const sampoAttacks = data.attacks.filter((item) => item.characterId === "1108");
    for (const id of expected) {
        const attack = attackOf(data, id);
        assert.equal(attack.support?.status, "calculable", id + " is enabled by the production loader");
        assert.equal(attack.scalingStat, "atk", id + " references ATK");
        assert.equal(attack.maximumEidolon ?? 0, 0, id + " is scoped to E0 where declared");
    }
    assert.equal(sampoAttacks.filter((item) => expected.includes(item.id)).map((item) => item.id).sort().join(","), expected.slice().sort().join(","), "basic, skill, ultimate, and Wind Shear remain separate E0 rows");

    const normal = attackOf(data, "110801");
    const skill = attackOf(data, "110802");
    const ultimate = attackOf(data, "110803");
    const windShear = attackOf(data, "110804");
    assert.deepEqual(normal.multipliers.slice(0, 6), curves.normal);
    assert.deepEqual(skill.multipliers.slice(0, 10), curves.skill);
    assert.equal(skill.hitCount, 5, "E0 skill consists of the selected hit plus four bounces");
    assert.deepEqual(skill.hitCountAtEidolon, { rank: 1, value: 6 }, "the sixth hit is E1-only");
    assert.deepEqual(ultimate.multipliers.slice(0, 10), curves.ultimate);
    assert.deepEqual(windShear.multipliers.slice(0, 10), curves.windShear);
    assert.equal(windShear.canCrit, false);
    assert.equal(windShear.hitCountInputKey, "sampo-wind-shear-stacks");
    assert.equal(windShear.hitCountMinimum, 0);
    assert.equal(windShear.hitCountMaximum, 5);
    assert.equal(windShear.damageComponents, undefined, "future DoT is not folded into the five-hit skill");
    assert.equal(attackOf(data, "1108044").requiredEidolon, 4, "the detonation is not an E0 damage component");
});

test("Sampo E0 normal, five-hit skill, and ultimate match independent values at every E0 level", async () => {
    const { data, engine } = await loadProductionFixture();
    const direct = [
        [attackOf(data, "110801"), curves.normal, 1],
        [attackOf(data, "110802"), curves.skill, 5],
        [attackOf(data, "110803"), curves.ultimate, 1]
    ];

    for (const [attack, curve, hitCount] of direct) {
        for (let index = 0; index < curve.length; index++) {
            const level = index + 1;
            assert.equal(attack.multipliers[index], curve[index], attack.id + " fixed-source Lv" + level);
            for (const [profileIndex, profile] of profiles.entries()) {
                const input = requestFor(attack, level, profile, hitCount, [], attack.id === "110802" ? "sampo-skill-single-enemy-five-bounces" : undefined);
                const result = assertMatchesRepeatedIndependent(engine, input, hitCount, attack.id + " Lv" + level + " profile " + profileIndex);
                assert.equal(result.attack.canCrit, true, attack.id + " direct damage can crit");
            }
        }
    }
});

test("Sampo E0 Wind Shear has exact one-to-five non-critical ticks at every Talent level", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "110804");
    const stacksRecord = data.structuredModifiers.find((item) => item.id === "trace:1108:110804:wind-shear-stacks");
    assert.ok(stacksRecord, "the production stack input is registered");

    for (let index = 0; index < curves.windShear.length; index++) {
        const level = index + 1;
        assert.equal(attack.multipliers[index], curves.windShear[index], "fixed-source Talent Lv" + level);
        for (const stacks of [1, 2, 3, 4, 5]) {
            for (const [profileIndex, profile] of profiles.entries()) {
                const inputs = { "sampo-wind-shear-stacks": stacks };
                const state = modifier(data, "trace:1108:110804:wind-shear-stacks", { "110804": level }, inputs, attack);
                assert.equal(state.enabled, true, "Wind Shear " + stacks + " stack(s) is selected");
                assert.equal(state.applicable, true, "stack state targets its separate DoT row");
                const input = requestFor(attack, level, profile, stacks, [state], attack.hitCountInputKey);
                const result = assertMatchesRepeatedIndependent(engine, input, stacks, "Sampo DoT Lv" + level + " x " + stacks + " profile " + profileIndex);
                assert.equal(result.attack.canCrit, false, "Wind Shear cannot crit");
                assert.equal(result.crit, result.nonCrit);
                assert.equal(result.expected, result.nonCrit);
            }
        }
    }
});

test("Sampo Ultimate DoT vulnerability follows all source levels and never leaks to direct attacks", async () => {
    const { data, engine } = await loadProductionFixture();
    const recordId = "trace:1108:110803:dot-vulnerability";
    const modifierRecord = data.structuredModifiers.find((item) => item.id === recordId);
    assert.ok(modifierRecord, "Ultimate DoT vulnerability exists in the production loader");
    assert.deepEqual(modifierRecord.target.attackTypes, ["dot"]);

    for (let ultimateLevel = 1; ultimateLevel <= curves.ultimateDotTaken.length; ultimateLevel++) {
        const expectedVulnerability = curves.ultimateDotTaken[ultimateLevel - 1];
        const candidate = modifier(data, recordId, { "110803": ultimateLevel }, { "sampo-ultimate-dot-vulnerability": true });
        assert.equal(candidate.value, expectedVulnerability, "fixed-source Ultimate Lv" + ultimateLevel + " DoT vulnerability");
        assert.equal(candidate.enabled, true, "the assumed active debuff can be selected");

        for (const [profileIndex, profile] of profiles.entries()) {
            const dot = attackOf(data, "110804");
            const offState = modifier(data, recordId, { "110803": ultimateLevel }, {}, dot);
            const onState = modifier(data, recordId, { "110803": ultimateLevel }, { "sampo-ultimate-dot-vulnerability": true }, dot);
            const stack = modifier(data, "trace:1108:110804:wind-shear-stacks", { "110804": 10 }, { "sampo-wind-shear-stacks": 5 }, dot);
            const offInput = requestFor(dot, 10, profile, 5, [offState, stack], dot.hitCountInputKey);
            const onInput = requestFor(dot, 10, profile, 5, [onState, stack], dot.hitCountInputKey);
            const off = assertMatchesRepeatedIndependent(engine, offInput, 5, "DoT vulnerability OFF at Ultimate Lv" + ultimateLevel + " profile " + profileIndex);
            const on = assertMatchesRepeatedIndependent(engine, onInput, 5, "DoT vulnerability ON at Ultimate Lv" + ultimateLevel + " profile " + profileIndex);
            assertClose(on.nonCrit / off.nonCrit, (100 + profile.takenDamage + expectedVulnerability) / (100 + profile.takenDamage), "Ultimate Lv" + ultimateLevel + " changes only the DoT vulnerability factor");
            assert.equal(on.applied.some((item) => item.id === recordId), true);
            assert.equal(off.applied.some((item) => item.id === recordId), false);
        }

        for (const id of ["110801", "110802", "110803"]) {
            const attack = attackOf(data, id);
            const oneLevel = id === "110801" ? 6 : 10;
            const hitCount = id === "110802" ? 5 : 1;
            const onState = modifier(data, recordId, { "110803": ultimateLevel }, { "sampo-ultimate-dot-vulnerability": true }, attack);
            assert.equal(onState.applicable, false, recordId + " is excluded from direct attack " + id);
            const input = requestFor(attack, oneLevel, profiles[0], hitCount, [onState], id === "110802" ? "sampo-skill-single-enemy-five-bounces" : undefined);
            const result = assertMatchesRepeatedIndependent(engine, input, hitCount, id + " remains unchanged with DoT vulnerability selected");
            assert.equal(result.applied.some((item) => item.id === recordId), false);
        }
    }
});

test("Sampo E0 direct rows use only ATK and a zero Wind Shear stack state stays at zero", async () => {
    const { data, engine } = await loadProductionFixture();
    const cases = [
        [attackOf(data, "110801"), 6, 1, undefined],
        [attackOf(data, "110802"), 10, 5, "sampo-skill-single-enemy-five-bounces"],
        [attackOf(data, "110803"), 10, 1, undefined],
        [attackOf(data, "110804"), 10, 5, attackOf(data, "110804").hitCountInputKey]
    ];
    for (const [attack, level, hitCount, hitCountReference] of cases) {
        const base = requestFor(attack, level, profiles[0], hitCount, [], hitCountReference);
        const baseline = engine.calculate(base);
        for (const stat of ["atk", "hp", "def"]) {
            const changed = {
                ...base,
                character: { ...base.character, stats: { ...base.character.stats, [stat]: base.character.stats[stat] + 317.25 } }
            };
            const actual = engine.calculate(changed);
            if (stat === "atk") assertClose(actual.nonCrit / baseline.nonCrit, (profiles[0].atk + 317.25) / profiles[0].atk, attack.id + " responds to ATK");
            else assertClose(actual.nonCrit, baseline.nonCrit, attack.id + " ignores " + stat);
        }
    }

    const dot = attackOf(data, "110804");
    const zeroState = modifier(data, "trace:1108:110804:wind-shear-stacks", { "110804": 10 }, { "sampo-wind-shear-stacks": 0 }, dot);
    assert.equal(zeroState.activation.inputValue, 0);
    assert.equal(zeroState.enabled, false, "zero stacks do not enable a one-stack modifier");
    const zeroInput = requestFor(dot, 10, profiles[0], 0, [zeroState], dot.hitCountInputKey);
    const zeroResult = assertMatchesRepeatedIndependent(engine, zeroInput, 0, "Sampo zero-stack DoT");
    assert.equal(zeroResult.attack.hitCount, 0);

    const skill = attackOf(data, "110802");
    const skillInput = requestFor(skill, 10, profiles[0], 5, [zeroState], "sampo-skill-single-enemy-five-bounces");
    const skillResult = assertMatchesRepeatedIndependent(engine, skillInput, 5, "the current DoT stack state does not add a tick to the direct Skill");
    assert.equal(skillResult.applied.some((item) => item.id === zeroState.id), false, "Wind Shear stack state remains DoT-only");
});
