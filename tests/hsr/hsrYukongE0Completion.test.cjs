"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    fixedSourceSha, loadProductionFixture, attackOf, makeRequest,
    independentDirectDamage, assertClose
} = require("./helpers/hsrDirectVerification.cjs");

// Fixed StarRailRes character_skills.json curves for Yukong, transcribed
// independently from the production overrides. E0 limits Normal to Lv1-6.
const normalCurve = [50, 60, 70, 80, 90, 100];
const talentCurve = [40, 44, 48, 52, 56, 60, 65, 70, 75, 80];
const ultimateCurve = [228, 243.2, 258.4, 273.6, 288.8, 304, 323, 342, 361, 380];

const profiles = [
    {
        characterLevel: 80, eidolon: 0,
        atk: 3287.25, hp: 7421.5, def: 1198.75,
        baseAtk: 991.5, baseHp: 1400.25, baseDef: 1100.75,
        critRate: 37.5, critDamage: 121.75, damageBonus: 27.75,
        enemyCount: 1, enemyLevel: 80, resistance: 20,
        resistancePenetration: 3.25, defenseReduction: 7.5,
        defenseIgnore: 2.5, takenDamage: 4.5, weakness: false,
        toughnessActive: true
    },
    {
        characterLevel: 80, eidolon: 0,
        atk: 2211.75, hp: 5809.25, def: 3517.125,
        baseAtk: 1173.25, baseHp: 903.5, baseDef: 1288.75,
        critRate: 62.25, critDamage: 73.5, damageBonus: 41.3,
        enemyCount: 1, enemyLevel: 75, resistance: 0,
        resistancePenetration: 0, defenseReduction: 0,
        defenseIgnore: 0, takenDamage: 0, weakness: false,
        toughnessActive: true
    }
];

function directRequest(attack, level, multiplier, profile, modifiers = []) {
    const input = makeRequest(attack, level, profile, modifiers);
    input.attack = {
        ...input.attack,
        id: attack.id,
        characterId: "1207",
        sourceSkillId: attack.sourceSkillId,
        type: attack.type,
        attackType: attack.type,
        scalingStat: "atk",
        element: "Imaginary",
        target: "single",
        traceLevel: level,
        multiplier,
        canCrit: true,
        damageFormula: "statMultiplier",
        hitCount: 1
    };
    return input;
}

function sequenceRequest(data, normalLevel, talentLevel, profile, options = {}) {
    const root = attackOf(data, "1207011");
    const input = makeRequest(root, normalLevel, profile, options.rootModifiers || []);
    input.attack = {
        ...root,
        characterId: "1207",
        sourceSkillId: "120701",
        type: "normal",
        attackType: "normal",
        scalingStat: "atk",
        element: "Imaginary",
        target: "single",
        traceLevel: normalLevel,
        multiplier: normalCurve[normalLevel - 1],
        canCrit: true,
        damageFormula: "componentSequence",
        hitCount: 1
    };

    const basicAttack = attackOf(data, "120701");
    const talentAttack = attackOf(data, "120704");
    const child = (attack, level, multiplier, modifiers) => ({
        character: input.character,
        enemy: input.enemy,
        attack: {
            ...attack,
            characterId: "1207",
            type: attack.id === "120701" ? "normal" : "additional",
            attackType: attack.id === "120701" ? "normal" : "additional",
            sourceSkillId: attack.id,
            scalingStat: "atk",
            element: "Imaginary",
            target: "single",
            traceLevel: level,
            multiplier,
            canCrit: true,
            damageFormula: "statMultiplier",
            hitCount: 1
        },
        modifiers
    });
    input.sequenceComponents = [
        {
            key: "basic",
            name: "通常攻撃本体",
            input: child(basicAttack, normalLevel, normalCurve[normalLevel - 1], options.basicModifiers || [])
        },
        {
            key: "talent",
            name: "徹札矢・追加成分",
            input: child(talentAttack, talentLevel, talentCurve[talentLevel - 1], options.talentModifiers || [])
        }
    ];
    return input;
}

function summedOracle(input) {
    const basic = independentDirectDamage(input.sequenceComponents[0].input);
    const talent = independentDirectDamage(input.sequenceComponents[1].input);
    return {
        basic,
        talent,
        total: Object.fromEntries(["nonCrit", "crit", "expected"].map((key) => [key, basic[key] + talent[key]]))
    };
}

function assertSequenceMatches(engine, input, label) {
    const expected = summedOracle(input);
    const actual = engine.calculate(input);
    assert.notEqual(actual.supported, false, label + " calculates");
    for (const key of ["nonCrit", "crit", "expected"]) {
        assertClose(actual[key], expected.total[key], label + " total " + key);
        assertClose(actual.components.basic[key], expected.basic[key], label + " basic component " + key);
        assertClose(actual.components.talent[key], expected.talent[key], label + " Talent component " + key);
        assertClose(actual[key], actual.components.basic[key] + actual.components.talent[key], label + " component sum " + key);
    }
    return actual;
}

test("Yukong E0 fixed-source Normal, Talent, and Ultimate curves are retained", async () => {
    assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
    const { data } = await loadProductionFixture();
    const expected = [
        ["120701", normalCurve],
        ["120704", talentCurve],
        ["120703", ultimateCurve]
    ];
    for (const [id, curve] of expected) {
        const attack = attackOf(data, id);
        assert.equal(attack.characterId, "1207", id + " belongs to Yukong");
        assert.equal(attack.scalingStat, "atk", id + " uses ATK");
        assert.equal(attack.element, "Imaginary", id + " is Imaginary damage");
        assert.deepEqual(Array.from(attack.multipliers).slice(0, curve.length), curve, id + " fixed-source curve");
        assert.equal(attack.requiredEidolon || 0, 0, id + " exists at E0");
    }
    const talent = attackOf(data, "120704");
    assert.equal(talent.type, "additional", "Talent damage is a distinct additional-damage instance");
    assert.equal(talent.sourceSkillId, "120704", "Talent contribution has its own source ID");
    assert.equal(attackOf(data, "1207011").support?.verified, true, "only the compound row represents the full Talent-triggered Basic action");
});

test("Yukong E0 normal plus Talent total independently matches every normal and Talent level", async () => {
    const { data, engine } = await loadProductionFixture();
    const root = attackOf(data, "1207011");
    assert.equal(root.damageFormula, "componentSequence");
    assert.equal(root.damageComponents?.length, 2);
    assert.deepEqual(Array.from(root.damageComponents, (part) => [part.key, part.attackId]), [["basic", "120701"], ["talent", "120704"]]);

    for (let normalLevel = 1; normalLevel <= 6; normalLevel += 1) {
        for (let talentLevel = 1; talentLevel <= 10; talentLevel += 1) {
            for (const [profileIndex, profile] of profiles.entries()) {
                const input = sequenceRequest(data, normalLevel, talentLevel, profile);
                const result = assertSequenceMatches(engine, input, `N${normalLevel}/T${talentLevel}/profile${profileIndex + 1}`);
                assert.equal(result.breakdown.damageFormula, "componentSequence");
                assert.deepEqual(Array.from(result.breakdown.componentNames), ["通常攻撃本体", "徹札矢・追加成分"]);
                assertClose(result.components.basic.breakdown.referenceValue, profile.atk, "Basic uses Yukong final ATK");
                assertClose(result.components.talent.breakdown.referenceValue, profile.atk, "Talent uses Yukong final ATK");
            }
        }
    }
});

test("Yukong sequence responds to ATK only and keeps its two damage components separate", async () => {
    const { data, engine } = await loadProductionFixture();
    const profile = profiles[0];
    const baselineInput = sequenceRequest(data, 6, 10, profile);
    const baseline = assertSequenceMatches(engine, baselineInput, "baseline");
    assertClose(baseline.components.basic.nonCrit, independentDirectDamage(baselineInput.sequenceComponents[0].input).nonCrit, "basic independently calculated");
    assertClose(baseline.components.talent.nonCrit, independentDirectDamage(baselineInput.sequenceComponents[1].input).nonCrit, "Talent independently calculated");

    for (const stat of ["atk", "hp", "def"]) {
        const changedProfile = { ...profile, [stat]: profile[stat] + 317.25 };
        const changedInput = sequenceRequest(data, 6, 10, changedProfile);
        const changed = assertSequenceMatches(engine, changedInput, "change " + stat);
        for (const key of ["nonCrit", "crit", "expected"]) {
            if (stat === "atk") {
                const ratio = (profile.atk + 317.25) / profile.atk;
                assertClose(changed[key] / baseline[key], ratio, "total scales with final ATK only " + key);
            } else {
                assertClose(changed[key], baseline[key], "total ignores " + stat + " " + key);
            }
        }
    }
});

test("Yukong sequence applies generic bonuses to both components but rejects uncertain Basic-only bonuses", async () => {
    const { data, engine } = await loadProductionFixture();
    const profile = profiles[1];
    const baselineInput = sequenceRequest(data, 6, 10, profile);
    const baseline = assertSequenceMatches(engine, baselineInput, "generic modifier baseline");

    const generic = { id: "test-generic-damage", name: "汎用与ダメージ", category: "damageBonus", value: 12.5, enabled: true, applicable: true };
    const genericResult = assertSequenceMatches(engine, sequenceRequest(data, 6, 10, profile, { basicModifiers: [generic], talentModifiers: [generic] }), "generic damage bonus");
    assert.ok(genericResult.components.basic.nonCrit > baseline.components.basic.nonCrit);
    assert.ok(genericResult.components.talent.nonCrit > baseline.components.talent.nonCrit);

    const basicOnly = { id: "test-basic-only-damage", name: "通常攻撃限定与ダメージ", category: "damageBonus", value: 20, enabled: true, applicable: true, target: { attackTypes: ["normal"] } };
    const stoppedSequence = engine.calculate(sequenceRequest(data, 6, 10, profile, { rootModifiers: [basicOnly], basicModifiers: [basicOnly] }));
    assert.equal(stoppedSequence.supported, false, "the complete total is withheld while Talent classification is uncertain");
    assert.equal(stoppedSequence.nonCrit, undefined, "no partial Basic value is presented as the full total");
    const stoppedTalent = engine.calculate(directRequest(attackOf(data, "120704"), 10, 80, profile, [basicOnly]));
    assert.equal(stoppedTalent.supported, false, "standalone additional component is also stopped by the uncertain Basic-only bonus");
});

test("Yukong sequence preserves generic crit, defense, resistance, and damage-bonus behavior", async () => {
    const { data, engine } = await loadProductionFixture();
    const profile = profiles[1];
    const baseline = assertSequenceMatches(engine, sequenceRequest(data, 6, 10, profile), "combat baseline");
    const cases = [
        ["crit rate", { critRate: profile.critRate + 10 }],
        ["crit damage", { critDamage: profile.critDamage + 25 }],
        ["element damage", { damageBonus: profile.damageBonus + 20 }],
        ["enemy defense down", { defenseReduction: 30 }],
        ["enemy resistance", { resistance: profile.resistance + 20 }]
    ];
    for (const [label, change] of cases) {
        const changed = { ...profile, ...change };
        const result = assertSequenceMatches(engine, sequenceRequest(data, 6, 10, changed), label);
        if (label === "crit rate") {
            assertClose(result.nonCrit, baseline.nonCrit, "CRIT Rate leaves non-CRIT damage unchanged");
            assert.notEqual(result.expected, baseline.expected, "CRIT Rate changes expected damage");
        } else if (label === "crit damage") {
            assertClose(result.nonCrit, baseline.nonCrit, "CRIT DMG leaves non-CRIT damage unchanged");
            assert.notEqual(result.crit, baseline.crit, "CRIT DMG changes critical damage");
        } else {
            assert.notEqual(result.nonCrit, baseline.nonCrit, label + " changes the non-CRIT damage");
        }
    }
});
