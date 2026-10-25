"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    fixedSourceSha, loadProductionFixture, attackOf, makeRequest,
    assertClose, assertMatchesIndependent, runtime
} = require("./helpers/hsrDirectVerification.cjs");

// Curves transcribed from index_new/jp/character_skills.json at fixedSourceSha.
// E0 uses Normal Lv1-6 and Skill/Talent/Ultimate Lv1-10. Higher native curve
// levels are not part of this E0 completion check.
const normal = [50, 60, 70, 80, 90, 100];
const skill = [60, 66, 72, 78, 84, 90, 97.5, 105, 112.5, 120];
const counterTalent = [80, 88, 96, 104, 112, 120, 130, 140, 150, 160];
const counterUltimate = [96, 102.4, 108.8, 115.2, 121.6, 128, 136, 144, 152, 160];

const profiles = [
    {
        atk: 3587.25, hp: 7421.5, def: 1198.75,
        baseAtk: 991.5, baseHp: 1400.25, baseDef: 1100.75,
        critRate: 37.5, critDamage: 146.2, damageBonus: 27.75,
        characterLevel: 80, enemyLevel: 88, resistance: 35,
        toughnessActive: true
    },
    {
        atk: 2411.75, hp: 5809.25, def: 3517.125,
        baseAtk: 1173.25, baseHp: 903.5, baseDef: 1288.75,
        critRate: 62.25, critDamage: 73.5, damageBonus: 41.3,
        characterLevel: 80, enemyLevel: 75, resistance: 0,
        toughnessActive: false
    }
];

function attackAt(attack, level, multiplier, target) {
    return {
        ...attack,
        traceLevel: level,
        multiplier,
        attackType: attack.type,
        element: "Physical",
        ...(target ? { target } : {})
    };
}

function requestFor(attack, level, multiplier, config, modifiers = []) {
    const input = makeRequest(attack, level, config, modifiers);
    input.attack.multiplier = multiplier;
    return input;
}

function e0CounterPassive(structuredModifiers) {
    const candidates = runtime.buildCandidates(structuredModifiers, {
        characterId: "1107",
        eidolon: 0,
        traceLevelFor: () => 10,
        stats: { atk: profiles[0].atk, hp: profiles[0].hp, def: profiles[0].def }
    }, {});
    return candidates.find((item) => item.id === "traceNode:1107:1107103:counter-damage");
}

test("fixed-source Clara E0 curves match every supported normal, marked-skill, and counter level", async () => {
    assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
    const { data, engine } = await loadProductionFixture();
    const cases = [
        ["110701", normal, 6],
        ["110702", skill, 10],
        ["1107021", skill.map((value) => value * 2), 10],
        ["110704", counterTalent, 10]
    ];

    for (const [id, curve, maxLevel] of cases) {
        const attack = attackOf(data, id);
        assert.equal(attack.characterId, "1107", id + " owner");
        assert.equal(attack.scalingStat, "atk", id + " uses ATK");
        assert.equal(attack.support?.status, "calculable", id + " production support");
        assert.equal(attack.support?.verified, true, id + " production verified flag");
        assert.deepEqual(Array.from(attack.multipliers.slice(0, maxLevel)), curve, id + " fixed-source E0 curve");
        assert.notEqual(attack.canCrit, false, id + " is critical damage");
        assert.equal(attack.requiredEidolon || 0, 0, id + " is available at E0");

        for (let level = 1; level <= maxLevel; level += 1) {
            for (const [profileIndex, profile] of profiles.entries()) {
                const input = requestFor(attackAt(attack, level, curve[level - 1]), level, curve[level - 1], profile);
                const result = assertMatchesIndependent(engine, input, id + " E0 Lv" + level + " profile" + profileIndex);
                assertClose(result.breakdown.referenceValue, profile.atk, id + " uses final ATK");
            }
        }
    }
});

test("Clara E0 enhanced counter totals Talent and Ultimate independently, with adjacent at fifty percent", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "1107031");
    const talentPart = attack.multiplierComponents.find((item) => item.traceKey === "talent");
    const ultimatePart = attack.multiplierComponents.find((item) => item.traceKey === "ultimate");

    assert.ok(talentPart, "enhanced counter carries its Talent component");
    assert.ok(ultimatePart, "enhanced counter carries its Ultimate component");
    assert.equal(attack.requiredEidolon || 0, 0, "the post-Ultimate enhanced counter is an E0 state");
    assert.deepEqual(Array.from(talentPart.values.slice(0, 10)), counterTalent, "Talent Lv1-10");
    assert.deepEqual(Array.from(ultimatePart.values.slice(0, 10)), counterUltimate, "Ultimate Lv1-10");

    for (let talentLevel = 1; talentLevel <= 10; talentLevel += 1) {
        for (let ultimateLevel = 1; ultimateLevel <= 10; ultimateLevel += 1) {
            const total = counterTalent[talentLevel - 1] + counterUltimate[ultimateLevel - 1];
            const recordTotal = talentPart.values[talentLevel - 1] + ultimatePart.values[ultimateLevel - 1];
            assert.equal(recordTotal, total, `component sum T${talentLevel}/U${ultimateLevel}`);

            for (const [profileIndex, profile] of profiles.entries()) {
                const mainAttack = attackAt(attack, talentLevel, total, "main");
                const mainInput = requestFor(mainAttack, talentLevel, total, profile);
                const mainResult = assertMatchesIndependent(engine, mainInput, `enhanced counter main T${talentLevel}/U${ultimateLevel} profile${profileIndex}`);
                const adjacentMultiplier = total * 0.5;
                const adjacentInput = requestFor(attackAt(attack, talentLevel, adjacentMultiplier, "adjacent"), talentLevel, adjacentMultiplier, profile);
                const adjacentResult = assertMatchesIndependent(engine, adjacentInput, `enhanced counter adjacent T${talentLevel}/U${ultimateLevel} profile${profileIndex}`);
                assertClose(adjacentResult.nonCrit, mainResult.nonCrit * 0.5, "adjacent/main multiplier ratio");
            }
        }
    }
});

test("Clara E0 damage uses only final ATK, applies counter trace once, and does not double-add display-only rows", async () => {
    const { data, engine } = await loadProductionFixture();
    const structured = data.structuredModifiers;
    const counterBuff = e0CounterPassive(structured);
    assert.ok(counterBuff?.enabled && counterBuff?.automatic, "E0 counter damage passive is automatic");
    assert.equal(counterBuff.value, 30);

    const cases = [
        ["110701", 6, 100, false],
        ["110702", 10, 120, false],
        ["1107021", 10, 240, false],
        ["110704", 10, 160, true],
        ["1107031", 10, 320, true]
    ];
    for (const [id, level, multiplier, isCounter] of cases) {
        const attack = attackOf(data, id);
        const modifiers = isCounter ? [counterBuff] : [];
        const input = requestFor(attackAt(attack, level, multiplier, id === "1107031" ? "main" : undefined), level, multiplier, profiles[0], modifiers);
        const result = assertMatchesIndependent(engine, input, id + " E0 representative multiplier and passive");
        assertClose(result.breakdown.referenceValue, profiles[0].atk, id + " final ATK reference");
        assert.deepEqual(Array.from(result.applied || [], (item) => item.id), isCounter ? [counterBuff.id] : [], id + " applied modifiers");

        for (const stat of ["atk", "hp", "def"]) {
            const changed = {
                ...input,
                character: {
                    ...input.character,
                    stats: { ...input.character.stats, [stat]: input.character.stats[stat] + 317.25 }
                }
            };
            const changedResult = engine.calculate(changed);
            if (stat === "atk") {
                assertClose(changedResult.nonCrit / result.nonCrit, (profiles[0].atk + 317.25) / profiles[0].atk, id + " responds to ATK only");
            } else {
                assertClose(changedResult.nonCrit, result.nonCrit, id + " ignores " + stat);
            }
        }
    }

    const candidates = runtime.buildCandidates(structured, {
        characterId: "1107", eidolon: 0, traceLevelFor: () => 10,
        stats: { atk: profiles[0].atk, hp: profiles[0].hp, def: profiles[0].def }
    }, {});
    const mark = candidates.find((item) => item.id === "trace:1107:110702:mark-bonus");
    const enhanced = candidates.find((item) => item.id === "trace:1107:110703:enhanced-counter");
    assert.ok(mark?.displayOnly && mark.enabled === false, "marked skill extra is represented by the separate 1107021 attack row");
    assert.ok(enhanced?.displayOnly && enhanced.enabled === false, "Ultimate multiplier is already a component of 1107031");

    const markedSkill = attackOf(data, "1107021");
    const markedInput = requestFor(attackAt(markedSkill, 10, 240), 10, 240, profiles[0], [mark]);
    const markedResult = engine.calculate(markedInput);
    assertClose(markedResult.nonCrit, engine.calculate({ ...markedInput, modifiers: [] }).nonCrit, "mark bonus row is not applied on top of the complete marked-skill row");
    assert.equal(Array.from(markedResult.applied || []).some((item) => item.id === mark.id), false, "display-only marked-skill modifier is excluded");

    const enhancedInput = requestFor(attackAt(attackOf(data, "1107031"), 10, 320, "main"), 10, 320, profiles[0], [counterBuff, enhanced]);
    const enhancedResult = engine.calculate(enhancedInput);
    assertClose(enhancedResult.nonCrit, engine.calculate({ ...enhancedInput, modifiers: [counterBuff] }).nonCrit, "Ultimate multiplier row is not applied again on top of the component-complete counter");
    assert.equal(Array.from(enhancedResult.applied || []).some((item) => item.id === enhanced.id), false, "display-only enhanced-counter modifier is excluded");
});
