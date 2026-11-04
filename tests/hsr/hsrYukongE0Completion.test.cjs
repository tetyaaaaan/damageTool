"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    fixedSourceSha, loadProductionFixture, attackOf, makeRequest,
    independentDirectDamage, assertClose, runtime
} = require("./helpers/hsrDirectVerification.cjs");

// Fixed StarRailRes character_skills.json curves for Yukong, transcribed
// independently from the production overrides. E0 limits Normal to Lv1-6.
const normalCurve = [50, 60, 70, 80, 90, 100];
const talentCurve = [40, 44, 48, 52, 56, 60, 65, 70, 75, 80];
const ultimateCurve = [228, 243.2, 258.4, 273.6, 288.8, 304, 323, 342, 361, 380];
const skillAtkCurve = [40, 44, 48, 52, 56, 60, 65, 70, 75, 80];
const ultimateCurveCR = [21, 21.7, 22.4, 23.1, 23.8, 24.5, 25.37, 26.25, 27.12, 28];
const ultimateCurveCD = [39, 41.6, 44.2, 46.8, 49.4, 52, 55.25, 58.5, 61.75, 65];

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
        assert.equal(attack.target, "single", id + " targets one selected enemy");
        assert.deepEqual(Array.from(attack.multipliers).slice(0, curve.length), curve, id + " fixed-source curve");
        assert.equal(attack.requiredEidolon || 0, 0, id + " exists at E0");
    }
    const talent = attackOf(data, "120704");
    assert.equal(talent.type, "additional", "Talent damage is a distinct additional-damage instance");
    assert.deepEqual(Array.from(talent.tags || []), ["normal"], "Talent additional damage retains Basic attack modifier applicability");
    assert.equal(talent.sourceSkillId, "120704", "Talent contribution has its own source ID");
    assert.equal(attackOf(data, "1207011").support?.verified, true, "only the compound row represents the full Talent-triggered Basic action");
});

test("Yukong E0 support records preserve full curves, activation conditions, and final-stat ownership", async () => {
    const { data } = await loadProductionFixture();
    const modifier = (id) => {
        const record = data.structuredModifiers.find((item) => item.id === id);
        assert.ok(record, "production loader includes modifier " + id);
        return record;
    };
    const skillAtk = modifier("trace:1207:120702:party-atk");
    assert.deepEqual(Array.from(skillAtk.value.values).slice(0, 10), [40, 44, 48, 52, 56, 60, 65, 70, 75, 80]);
    assert.deepEqual([skillAtk.finalStatsInclusion.inputKey, skillAtk.finalStatsInclusion.inputLabel], ["trace:1207:120702:party-atk-in-final", "鳴弦号令の攻撃力上昇を最終ATKに反映済み"]);
    assert.deepEqual(Array.from(skillAtk.target.attackTypes), ["all"]);
    assert.equal(skillAtk.target.owner, "partyAll");
    assert.deepEqual([skillAtk.activation.inputKey, skillAtk.activation.default], ["yukong-roaring-bowstrings-active", false]);

    const critRate = modifier("trace:1207:120703:party-crit-rate");
    const critDamage = modifier("trace:1207:120703:party-crit-damage");
    assert.deepEqual([critRate.finalStatsInclusion.inputKey, critRate.finalStatsInclusion.inputLabel], ["trace:1207:120703:party-crit-rate-in-final", "貫雲箭の会心率上昇を最終会心率に反映済み"]);
    assert.deepEqual([critDamage.finalStatsInclusion.inputKey, critDamage.finalStatsInclusion.inputLabel], ["trace:1207:120703:party-crit-damage-in-final", "貫雲箭の会心ダメージ上昇を最終会心ダメージに反映済み"]);
    assert.deepEqual(Array.from(critRate.value.values).slice(0, 10), [21, 21.7, 22.4, 23.1, 23.8, 24.5, 25.37, 26.25, 27.12, 28]);
    assert.deepEqual(Array.from(critDamage.value.values).slice(0, 10), [39, 41.6, 44.2, 46.8, 49.4, 52, 55.25, 58.5, 61.75, 65]);
    for (const record of [critRate, critDamage]) {
        assert.equal(record.target.owner, "partyAll");
        assert.deepEqual([record.activation.inputKey, record.activation.default], ["yukong-ultimate-buffs-active", false]);
    }

    const talentReady = modifier("trace:1207:120704:talent-ready");
    assert.equal(talentReady.support.status, "displayOnly", "the Talent condition does not add a second damage modifier");
    assert.deepEqual([talentReady.activation.inputKey, talentReady.activation.default], ["yukong-bowshot-ready", false]);
    assert.deepEqual(Array.from(talentReady.target.attackIds), ["120704"]);

    const teamImaginary = modifier("traceNode:1207:1207102:imaginary-damage");
    const selfImaginary = modifier("traceNode:1207:1207102:imaginary-damage:self");
    assert.equal(teamImaginary.value.fixed, 12);
    assert.equal(teamImaginary.target.owner, "partyAll");
    assert.deepEqual(Array.from(teamImaginary.target.elements), ["Imaginary"]);
    assert.equal(teamImaginary.providerScope, "party");
    assert.equal(selfImaginary.inputPolicy, "includedInFinalStats");
    assert.equal(selfImaginary.support.status, "displayOnly", "Yukong's own A6 is included in her final Imaginary damage input");

    for (const [id, value] of [["traceStats:1207:imaginary", 22.4], ["traceStats:1207:hp", 18], ["traceStats:1207:atk", 10]]) {
        const traceStat = modifier(id);
        assert.equal(traceStat.value.fixed, value, id + " fixed E0 trace subtotal");
        assert.equal(traceStat.inputPolicy, "includedInFinalStats", id + " is not added a second time");
    }

    const supportRecords = [skillAtk, critRate, critDamage, teamImaginary];
    const supportContext = {
        characterId: "1002", partyIds: ["1207"], partyEidolons: { "1207": 0 },
        stats: { atk: 3000, critRate: 50, critDamage: 100, damageBonus: 22.4 },
        traceLevelFor: (source) => source?.skillId === "120702" || source?.skillId === "120703" ? 10 : 1,
        attack: { type: "normal", attackType: "normal", target: "single", element: "Imaginary" }
    };
    const byId = (records, id) => records.find((item) => item.id === id);
    const off = runtime.buildCandidates(supportRecords, supportContext, {});
    for (const record of [skillAtk, critRate, critDamage]) assert.equal(byId(off, record.id).enabled, false, record.id + " defaults off until the timed state is entered");
    const on = runtime.buildCandidates(supportRecords, supportContext, {
        "yukong-roaring-bowstrings-active": true,
        "yukong-ultimate-buffs-active": true
    });
    assert.deepEqual([byId(on, skillAtk.id).value, byId(on, skillAtk.id).enabled], [80, true]);
    assert.deepEqual([byId(on, critRate.id).value, byId(on, critRate.id).enabled], [28, true]);
    assert.deepEqual([byId(on, critDamage.id).value, byId(on, critDamage.id).enabled], [65, true]);
    assert.equal(byId(on, teamImaginary.id).enabled, true, "the A6 Imaginary party buff is always on while Yukong is fielded");
    assert.equal(runtime.applicableToAttack(byId(on, teamImaginary.id), { ...supportContext.attack, element: "Physical" }), false, "Imaginary A6 does not affect non-Imaginary attacks");
});

test("Yukong party buffs independently match each E0 level and do not double-count completed stats", async () => {
    const { data, engine } = await loadProductionFixture();
    const supportIds = ["trace:1207:120702:party-atk", "trace:1207:120703:party-crit-rate", "trace:1207:120703:party-crit-damage"];
    const records = data.structuredModifiers.filter((item) => supportIds.includes(item.id));
    assert.equal(records.length, 3);
    const profile = {
        characterLevel: 80, eidolon: 0,
        atk: 2437.25, baseAtk: 1321.75, hp: 5927.5, def: 1103.25, baseHp: 1050.5, baseDef: 841.75,
        critRate: 31.75, critDamage: 123.25, damageBonus: 27.5,
        enemyCount: 1, enemyLevel: 83, resistance: 17.5, weakness: false, toughnessActive: true,
        defenseReduction: 8.25, defenseIgnore: 3.5, resistancePenetration: 4.25, takenDamage: 6.75
    };
    const activeInputs = { "yukong-roaring-bowstrings-active": true, "yukong-ultimate-buffs-active": true };
    const normalAttack = { id: "support-recipient-normal", characterId: "1002", sourceSkillId: "100201", type: "normal", attackType: "normal", element: "Imaginary", target: "single", scalingStat: "atk", canCrit: true, hitCount: 1, multipliers: [100] };
    const ultimateAttack = { ...normalAttack, id: "support-recipient-ultimate", sourceSkillId: "100203", type: "ultimate", attackType: "ultimate", multipliers: [300] };
    const candidatesFor = (attack, level, inputs) => runtime.buildCandidates(records, {
        characterId: "1002", partyIds: ["1207"], partyEidolons: { "1207": 0 },
        stats: { atk: profile.atk, critRate: profile.critRate, critDamage: profile.critDamage, damageBonus: profile.damageBonus },
        baseStats: { atk: profile.baseAtk },
        traceLevelFor: (source) => source?.skillId === "120702" ? level : level,
        attack
    }, inputs).map((candidate) => ({ ...candidate, applicable: candidate.applicable !== false && runtime.applicableToAttack(candidate, attack) }));
    const candidate = (list, id) => {
        const found = list.find((item) => item.id === id);
        assert.ok(found, "native candidate exists: " + id);
        assert.equal(found.providerId, "1207", id + " is provided by party member Yukong");
        return found;
    };
    const calculate = (attack, stats, modifiers, level, label) => {
        const input = makeRequest(attack, 1, { ...profile, ...stats }, modifiers);
        const expected = independentDirectDamage(input);
        const actual = engine.calculate(input);
        assert.notEqual(actual.supported, false, label + " calculates");
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], label + " independent " + key);
        return actual;
    };

    for (let level = 1; level <= 10; level += 1) {
        const activeAtk = candidate(candidatesFor(normalAttack, level, activeInputs), supportIds[0]);
        assert.deepEqual([activeAtk.value, activeAtk.enabled, activeAtk.applicable], [skillAtkCurve[level - 1], true, true]);
        const skillResult = calculate(normalAttack, {}, [activeAtk], level, "Skill ATK Lv" + level);
        const completedAtk = profile.atk + profile.baseAtk * activeAtk.value / 100;
        const includedAtk = candidate(candidatesFor(normalAttack, level, { ...activeInputs, [records[0].finalStatsInclusion.inputKey]: true }), supportIds[0]);
        assert.deepEqual([includedAtk.enabled, includedAtk.includedInFinalStats], [false, true]);
        const includedSkillResult = calculate(normalAttack, { atk: completedAtk }, [includedAtk], level, "Skill ATK included Lv" + level);
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(includedSkillResult[key], skillResult[key], "ATK inclusion does not double count " + key + " Lv" + level);

        const atkOff = candidate(candidatesFor(normalAttack, level, {}), supportIds[0]);
        assert.equal(atkOff.enabled, false, "Roaring Bowstrings off Lv" + level);
        const offSkillResult = calculate(normalAttack, {}, [atkOff], level, "Skill ATK off Lv" + level);
        const noAtkResult = calculate(normalAttack, {}, [], level, "Skill ATK absent Lv" + level);
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(offSkillResult[key], noAtkResult[key], "ATK toggle off " + key + " Lv" + level);

        const activeCritRate = candidate(candidatesFor(ultimateAttack, level, activeInputs), supportIds[1]);
        const activeCritDamage = candidate(candidatesFor(ultimateAttack, level, activeInputs), supportIds[2]);
        assert.deepEqual([activeCritRate.value, activeCritRate.enabled, activeCritRate.applicable], [ultimateCurveCR[level - 1], true, true]);
        assert.deepEqual([activeCritDamage.value, activeCritDamage.enabled, activeCritDamage.applicable], [ultimateCurveCD[level - 1], true, true]);
        const critRateResult = calculate(ultimateAttack, {}, [activeCritRate], level, "Ultimate CR Lv" + level);
        const critDamageResult = calculate(ultimateAttack, {}, [activeCritDamage], level, "Ultimate CD Lv" + level);
        const bothCritResult = calculate(ultimateAttack, {}, [activeCritRate, activeCritDamage], level, "Ultimate CR+CD Lv" + level);

        const includedCritRate = candidate(candidatesFor(ultimateAttack, level, { ...activeInputs, [records[1].finalStatsInclusion.inputKey]: true }), supportIds[1]);
        const includedCritRateResult = calculate(ultimateAttack, { critRate: profile.critRate + activeCritRate.value }, [includedCritRate], level, "Ultimate CR included Lv" + level);
        assert.deepEqual([includedCritRate.enabled, includedCritRate.includedInFinalStats], [false, true]);
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(includedCritRateResult[key], critRateResult[key], "CR inclusion does not double count " + key + " Lv" + level);

        const includedCritDamage = candidate(candidatesFor(ultimateAttack, level, { ...activeInputs, [records[2].finalStatsInclusion.inputKey]: true }), supportIds[2]);
        const includedCritDamageResult = calculate(ultimateAttack, { critDamage: profile.critDamage + activeCritDamage.value }, [includedCritDamage], level, "Ultimate CD included Lv" + level);
        assert.deepEqual([includedCritDamage.enabled, includedCritDamage.includedInFinalStats], [false, true]);
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(includedCritDamageResult[key], critDamageResult[key], "CD inclusion does not double count " + key + " Lv" + level);

        const ultOffCandidates = candidatesFor(ultimateAttack, level, { "yukong-roaring-bowstrings-active": true });
        for (const id of supportIds.slice(1)) assert.equal(candidate(ultOffCandidates, id).enabled, false, "Ultimate buff toggle off " + id + " Lv" + level);
        const ultOffResult = calculate(ultimateAttack, {}, ultOffCandidates.filter((item) => supportIds.slice(1).includes(item.id)), level, "Ultimate buffs off Lv" + level);
        const noUltResult = calculate(ultimateAttack, {}, [], level, "Ultimate buffs absent Lv" + level);
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(ultOffResult[key], noUltResult[key], "Ultimate toggle off " + key + " Lv" + level);
        assert.ok(bothCritResult.expected >= critRateResult.expected && bothCritResult.expected >= critDamageResult.expected, "combined CR/CD state is independently calculable Lv" + level);
    }
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

test("Yukong E0 Ultimate independently matches all adopted levels and asymmetric battle profiles", async () => {
    const { data, engine } = await loadProductionFixture();
    const ultimate = attackOf(data, "120703");
    for (let level = 1; level <= 10; level += 1) {
        for (const [profileIndex, profile] of profiles.entries()) {
            const input = directRequest(ultimate, level, ultimateCurve[level - 1], profile);
            const expected = independentDirectDamage(input);
            const actual = engine.calculate(input);
            assert.notEqual(actual.supported, false, "Ultimate Lv" + level + " profile" + (profileIndex + 1) + " calculates");
            for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], "Ultimate Lv" + level + " profile" + (profileIndex + 1) + " independent " + key);
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

test("Yukong sequence applies generic bonuses to both components and Basic-only bonuses to the Talent hit", async () => {
    const { data, engine } = await loadProductionFixture();
    const profile = profiles[1];
    const baselineInput = sequenceRequest(data, 6, 10, profile);
    const baseline = assertSequenceMatches(engine, baselineInput, "generic modifier baseline");

    const generic = { id: "test-generic-damage", name: "汎用与ダメージ", category: "damageBonus", value: 12.5, enabled: true, applicable: true };
    const genericResult = assertSequenceMatches(engine, sequenceRequest(data, 6, 10, profile, { basicModifiers: [generic], talentModifiers: [generic] }), "generic damage bonus");
    assert.ok(genericResult.components.basic.nonCrit > baseline.components.basic.nonCrit);
    assert.ok(genericResult.components.talent.nonCrit > baseline.components.talent.nonCrit);

    const basicOnly = { id: "test-basic-only-damage", name: "通常攻撃限定与ダメージ", category: "damageBonus", value: 20, enabled: true, applicable: true, target: { attackTypes: ["normal"] } };
    const normalOnlyResult = assertSequenceMatches(engine, sequenceRequest(data, 6, 10, profile, { basicModifiers: [basicOnly], talentModifiers: [basicOnly] }), "Basic-only bonus applies to both components");
    for (const component of [normalOnlyResult.components.basic, normalOnlyResult.components.talent]) {
        assertClose(component.breakdown.damageBonus, profile.damageBonus + 20, "Basic-only bonus included in component damage bonus");
    }

    const talentInput = directRequest(attackOf(data, "120704"), 10, 80, profile, [basicOnly]);
    const talentWithBasicBonus = engine.calculate(talentInput);
    assert.notEqual(talentWithBasicBonus.supported, false, "the additional hit remains calculable with a Basic-only modifier");
    assertClose(talentWithBasicBonus.breakdown.damageBonus, profile.damageBonus + 20, "standalone Talent hit inherits Basic-only bonus");

    const ultimate = attackOf(data, "120703");
    const ultimateInput = directRequest(ultimate, 10, ultimateCurve[9], profile);
    const ultimateBaseline = engine.calculate(ultimateInput);
    const ultimateWithBasicOnly = engine.calculate({ ...ultimateInput, modifiers: [basicOnly] });
    assertClose(ultimateWithBasicOnly.nonCrit, ultimateBaseline.nonCrit, "Basic-only bonus does not affect Yukong Ultimate");

    const disabled = { ...basicOnly, enabled: false, applicable: false };
    const disabledSequence = assertSequenceMatches(engine, sequenceRequest(data, 6, 10, profile, { basicModifiers: [disabled], talentModifiers: [disabled] }), "disabled Basic-only bonus");
    assertClose(disabledSequence.nonCrit, baseline.nonCrit, "off toggle restores baseline total");

    const missingTalentTag = sequenceRequest(data, 6, 10, profile, { basicModifiers: [basicOnly], talentModifiers: [basicOnly] });
    delete missingTalentTag.sequenceComponents[1].input.attack.tags;
    const missingTagResult = engine.calculate(missingTalentTag);
    assert.equal(missingTagResult.supported, false, "the compound action is withheld if the Talent hit loses its Basic tag");

    const multiTarget = sequenceRequest(data, 6, 10, { ...profile, enemyCount: 2 });
    assert.equal(engine.calculate(multiTarget).supported, false, "the verified Yukong composite is single-target only");
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
