"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const runtime = require("../../games/js/hsrModifierRuntime.js");
const {
    loadProductionFixture,
    attackOf,
    makeRequest,
    assertClose,
    fixedSourceSha,
    independentDirectDamage
} = require("./helpers/hsrDirectVerification.cjs");

// Coefficients below are transcribed from the pinned StarRailRes snapshot;
// they are deliberately independent of the production records under test.
const feixiaoSource = {
    skill: [100, 110, 120, 130, 140, 150, 162.5, 175, 187.5, 200],
    followUp: [55, 60.5, 66, 71.5, 77, 82.5, 89.38, 96.25, 103.12, 110],
    followUpDamageBonus: [30, 33, 36, 39, 42, 45, 48.75, 52.5, 56.25, 60]
};
const jadeSource = {
    followUp: [60, 66, 72, 78, 84, 90, 97.5, 105, 112.5, 120],
    enhancedFollowUpAddition: [40, 44, 48, 52, 56, 60, 65, 70, 75, 80],
    pawnCritDamagePerStack: [1.2, 1.32, 1.44, 1.56, 1.68, 1.8, 1.95, 2.1, 2.25, 2.4]
};
const scenarios = [
    {
        characterLevel: 80, enemyLevel: 82,
        stats: { atk: 3177.25, hp: 8421.5, def: 1265.75, critRate: 42.5, critDamage: 91.25, damageBonus: 17.5 },
        baseStats: { atk: 1120.5, hp: 1100.25, def: 900.5 },
        resistance: 23, toughnessActive: true
    },
    {
        characterLevel: 80, enemyLevel: 95,
        stats: { atk: 4388.75, hp: 12654.25, def: 2211.5, critRate: 68.25, critDamage: 137.5, damageBonus: 38.75 },
        baseStats: { atk: 1375.25, hp: 1470.75, def: 1088.25 },
        resistance: 7, toughnessActive: true, resistancePenetration: 9,
        defenseReduction: 13.5, defenseIgnore: 4.25, takenDamage: 11.5
    }
];

const feixiaoModifierIds = [
    "trace:1220:122004:followup-damage",
    "traceNode:1220:1220102:followup-critical-damage",
    "trace:1220:122004:prior-buff-skill"
];
const jadeModifierId = "trace:1314:131403:followup-multiplier";

function modifierRecords(data, ids) {
    return ids.map((id) => {
        const record = data.structuredModifiers.find((item) => item.id === id);
        assert.ok(record, "fixed-source structured modifier exists: " + id);
        return record;
    });
}

function modifierCandidates(records, characterId, traceLevels, inputs = {}, stats = {}) {
    return runtime.buildCandidates(records, {
        characterId,
        eidolon: 0,
        stats,
        traceLevelFor: (source) => traceLevels[source?.skillId] ?? traceLevels[source?.traceId] ?? 1
    }, inputs);
}

function scopedModifiers(candidates, attack) {
    return candidates.map((candidate) => ({
        ...candidate,
        applicable: !candidate.enabled || runtime.applicableToAttack(candidate, attack)
    }));
}

function oracleInput(input, scalingStat, multiplier, modifiers) {
    return {
        ...input,
        attack: { ...input.attack, scalingStat, multiplier, hitCount: 1 },
        modifiers
    };
}

function assertMatchesOracle(engine, input, expectedInput, label) {
    const expected = independentDirectDamage(expectedInput);
    const actual = engine.calculate(input);
    assert.notEqual(actual.supported, false, label + " is supported");
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], label + " " + key);
    assertClose(actual.breakdown.referenceValue, expected.effectiveReferenceValue, label + " independent reference stat");
    assertClose(actual.breakdown.damageBonus, expected.damageBonus, label + " damage bonus");
    assertClose(actual.breakdown.defense, expected.defense, label + " DEF multiplier");
    assertClose(actual.breakdown.resistance, expected.resistance, label + " RES multiplier");
    return actual;
}

function makeFeixiaoSequence(parent, skill, followUp, skillLevel, talentLevel, scenario, skillModifiers, followUpModifiers) {
    const common = makeRequest(parent, skillLevel, {
        characterLevel: scenario.characterLevel,
        eidolon: 0,
        atk: scenario.stats.atk, hp: scenario.stats.hp, def: scenario.stats.def,
        baseAtk: scenario.baseStats.atk, baseHp: scenario.baseStats.hp, baseDef: scenario.baseStats.def,
        critRate: scenario.stats.critRate, critDamage: scenario.stats.critDamage,
        damageBonus: scenario.stats.damageBonus,
        enemyLevel: scenario.enemyLevel, resistance: scenario.resistance,
        toughnessActive: scenario.toughnessActive, enemyCount: 1, weakness: false,
        resistancePenetration: scenario.resistancePenetration || 0,
        defenseReduction: scenario.defenseReduction || 0,
        defenseIgnore: scenario.defenseIgnore || 0,
        takenDamage: scenario.takenDamage || 0
    });
    common.character.stats = { ...common.character.stats, ...scenario.stats };
    common.character.baseStats = { ...common.character.baseStats, ...scenario.baseStats };
    const skillAttack = {
        ...parent,
        damageFormula: "statMultiplier",
        type: "skill", attackType: "skill", scalingStat: "atk", target: "single", hitCount: 1,
        canCrit: true, traceLevel: skillLevel, multiplier: parent.multipliers[skillLevel - 1]
    };
    const followUpAttack = {
        ...followUp,
        type: "followUp", attackType: "followUp", scalingStat: "atk", target: "single", hitCount: 1,
        canCrit: true, traceLevel: talentLevel, multiplier: followUp.multipliers[talentLevel - 1]
    };
    const skillInput = { ...common, attack: skillAttack, modifiers: skillModifiers };
    const followUpInput = { ...common, attack: followUpAttack, modifiers: followUpModifiers };
    return {
        request: {
            ...common,
            attack: { ...parent, traceLevel: skillLevel },
            sequenceComponents: [
                { key: "skill", name: parent.damageComponents[0].name, input: skillInput },
                { key: "followUp", name: parent.damageComponents[1].name, input: followUpInput }
            ]
        },
        skillInput,
        followUpInput
    };
}

function assertSourceCurve(record, curve, label) {
    assert.equal(record.length, curve.length, label + " has all ten fixed-source levels");
    curve.forEach((value, index) => assertClose(record[index], value, label + " Lv" + (index + 1)));
}

test("Feixiao Skill composition independently verifies both parts across all Skill and Talent levels", async () => {
    const { data, engine } = await loadProductionFixture();
    const parent = attackOf(data, "122002");
    const followUp = attackOf(data, "122004");
    const [nativeDamage, a4CritDamage, priorSkillDamage] = modifierRecords(data, feixiaoModifierIds);

    assert.equal(parent.support?.status, "calculable");
    assert.equal(parent.support?.verified, true);
    assert.equal(parent.damageFormula, "componentSequence");
    assert.equal(parent.provenance?.sourceCommit, fixedSourceSha);
    assert.deepEqual(Array.from(parent.damageComponents, (item) => [item.key, item.attackId]), [["skill", "122002"], ["followUp", "122004"]]);
    assertSourceCurve(parent.multipliers, feixiaoSource.skill, "Feixiao Skill source curve");
    assertSourceCurve(followUp.multipliers, feixiaoSource.followUp, "Feixiao Talent FUA source curve");
    assertSourceCurve(nativeDamage.value.values, feixiaoSource.followUpDamageBonus, "Feixiao native FUA DMG bonus");
    assert.equal(a4CritDamage.value.fixed, 36, "A4 is a separate +36% Crit DMG effect");
    assert.equal(a4CritDamage.activation.inputKey, "feixiao-formshift-unlocked");
    assertSourceCurve(priorSkillDamage.value.values, feixiaoSource.followUpDamageBonus, "Feixiao preexisting Skill DMG bonus source curve");
    assert.equal(priorSkillDamage.activation.inputKey, "feixiao-previous-followup-buff");
    assert.equal(priorSkillDamage.activation.default, false);
    assert.deepEqual(Array.from(priorSkillDamage.target.attackIds), ["122002"], "preexisting follow-up buff is scoped only to Skill body");

    const records = [nativeDamage, a4CritDamage, priorSkillDamage];
    for (const scenario of scenarios) {
        for (let skillLevel = 1; skillLevel <= 10; skillLevel++) {
            for (let talentLevel = 1; talentLevel <= 10; talentLevel++) {
                for (const priorBuff of [false, true]) {
                    for (const a4Unlocked of [false, true]) {
                        const candidates = modifierCandidates(records, "1220", { "122004": talentLevel }, {
                            "feixiao-formshift-unlocked": a4Unlocked,
                            "feixiao-previous-followup-buff": priorBuff
                        }, scenario.stats);
                        const native = candidates.find((item) => item.id === nativeDamage.id);
                        assert.equal(native.enabled, true, "native FUA damage bonus is automatic Lv" + talentLevel);
                        assertClose(native.value, feixiaoSource.followUpDamageBonus[talentLevel - 1], "native FUA bonus Lv" + talentLevel);
                        const all = makeFeixiaoSequence(parent, parent, followUp, skillLevel, talentLevel, scenario,
                            scopedModifiers(candidates, { id: "122002", type: "skill", attackType: "skill", element: "Wind", target: "single" }),
                            scopedModifiers(candidates, { id: "122004", type: "followUp", attackType: "followUp", element: "Wind", target: "single" }));
                        const skillOracle = oracleInput(all.skillInput, "atk", feixiaoSource.skill[skillLevel - 1], all.skillInput.modifiers);
                        const followUpOracle = oracleInput(all.followUpInput, "atk", feixiaoSource.followUp[talentLevel - 1], all.followUpInput.modifiers);
                        const expectedSkill = independentDirectDamage(skillOracle);
                        const expectedFollowUp = independentDirectDamage(followUpOracle);
                        const result = engine.calculate(all.request);
                        const suffix = `/prior=${priorBuff}/A4=${a4Unlocked}`;
                        if (!a4Unlocked) {
                            assert.equal(result.supported, false, "required A4 missing stops this FUA and its aggregate");
                            assert.equal(result.nonCrit, undefined, "no partial positive aggregate is returned without A4");
                            continue;
                        }
                        assert.notEqual(result.supported, false, `Feixiao E0 Skill Lv${skillLevel}/Talent Lv${talentLevel}${suffix} calculates`);
                        for (const key of ["nonCrit", "crit", "expected"]) {
                            assertClose(result.components.skill[key], expectedSkill[key], `Feixiao skill Lv${skillLevel}/${talentLevel}${suffix} ${key}`);
                            assertClose(result.components.followUp[key], expectedFollowUp[key], `Feixiao FUA Lv${skillLevel}/${talentLevel}${suffix} ${key}`);
                            assertClose(result[key], expectedSkill[key] + expectedFollowUp[key], `Feixiao combined Lv${skillLevel}/${talentLevel}${suffix} ${key}`);
                        }
                        assertClose(result.components.skill.breakdown.referenceValue, scenario.stats.atk, "Feixiao Skill references the final ATK snapshot");
                        assertClose(result.components.followUp.breakdown.referenceValue, scenario.stats.atk, "Feixiao FUA reuses the same final ATK snapshot");
                        assertClose(result.components.skill.breakdown.critDamagePercent, scenario.stats.critDamage, "Skill body preserves permanent final CD without FUA A4");
                        assertClose(result.components.followUp.breakdown.critDamagePercent, scenario.stats.critDamage + 36, "required A4 adds 36 scoped CD exactly once");
                    }
                }
            }
        }
    }
});

test("Feixiao optional prior buff remains component-scoped with required A4 and never duplicates the separate FUA", async () => {
    const { data, engine } = await loadProductionFixture();
    const parent = attackOf(data, "122002"), followUp = attackOf(data, "122004");
    const records = modifierRecords(data, feixiaoModifierIds), scenario = scenarios[0];
    const make = (prior, a4 = true) => {
        const candidates = modifierCandidates(records, "1220", { "122004": 10 }, {
            "feixiao-formshift-unlocked": a4,
            "feixiao-previous-followup-buff": prior
        }, scenario.stats);
        const built = makeFeixiaoSequence(parent, parent, followUp, 10, 10, scenario,
            scopedModifiers(candidates, { id: "122002", type: "skill", attackType: "skill", element: "Wind", target: "single" }),
            scopedModifiers(candidates, { id: "122004", type: "followUp", attackType: "followUp", element: "Wind", target: "single" }));
        const result = engine.calculate(built.request);
        if (!a4) {
            assert.equal(result.supported, false, "required A4 OFF stops the aggregate locally");
            assert.equal(result.nonCrit, undefined, "invalid A4 state has no positive comparison value");
            return { built, result };
        }
        assert.notEqual(result.supported, false, result.reason);
        const skill = result.components.skill, fua = result.components.followUp;
        assert.equal(skill.applied.some((item) => item.id === records[2].id), prior, "prior FUA buff applies to Skill body only when selected");
        assert.equal(fua.applied.some((item) => item.id === records[2].id), false, "prior buff does not repeat on immediate FUA");
        assert.equal(skill.applied.some((item) => item.id === records[1].id), false, "A4 cannot affect Skill body");
        assert.equal(fua.applied.filter((item) => item.id === records[1].id).length, 1, "required A4 applies to FUA exactly once");
        assert.equal(skill.applied.some((item) => item.id === records[0].id), false, "fresh native FUA bonus excludes Skill body");
        assert.equal(fua.applied.filter((item) => item.id === records[0].id).length, 1, "native FUA damage applies once");
        assertClose(fua.breakdown.critDamagePercent, scenario.stats.critDamage + 36, "permanent final CD plus separate A4 36");
        return { built, result };
    };
    make(false, false);
    make(true, false);
    const baseline = make(false), priorOn = make(true);
    assert.ok(priorOn.result.components.skill.nonCrit > baseline.result.components.skill.nonCrit);
    for (const key of ["nonCrit", "crit", "expected"]) {
        assertClose(priorOn.result.components.followUp[key], baseline.result.components.followUp[key], "prior toggle cannot change immediate FUA " + key);
        assertClose(baseline.result[key], baseline.result.components.skill[key] + baseline.result.components.followUp[key], "aggregate contains exactly one FUA " + key);
    }
    const separateCandidates = modifierCandidates(records.slice(0, 2), "1220", { "122004": 10 }, { "feixiao-formshift-unlocked": true }, scenario.stats);
    const separate = makeRequest(followUp, 10, {
        characterLevel: 80, eidolon: 0, atk: scenario.stats.atk, hp: scenario.stats.hp, def: scenario.stats.def,
        baseAtk: scenario.baseStats.atk, baseHp: scenario.baseStats.hp, baseDef: scenario.baseStats.def,
        critRate: scenario.stats.critRate, critDamage: scenario.stats.critDamage, damageBonus: scenario.stats.damageBonus,
        enemyLevel: scenario.enemyLevel, resistance: scenario.resistance, toughnessActive: true, enemyCount: 1, weakness: false
    }, scopedModifiers(separateCandidates, { id: "122004", type: "followUp", attackType: "followUp", element: "Wind", target: "single" }));
    const standalone = assertMatchesOracle(engine, separate, oracleInput(separate, "atk", feixiaoSource.followUp[9], separate.modifiers), "separate FUA with mandatory native effects");
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(standalone[key], baseline.result.components.followUp[key], "separate row represents the same single FUA " + key);
    assertClose(separate.attack.multiplier, feixiaoSource.followUp[9], "separate FUA never includes Skill aggregate coefficient");
});

test("Feixiao Skill composition rejects incomplete or altered component requests instead of showing a partial total", async () => {
    const { data, engine } = await loadProductionFixture();
    const parent = attackOf(data, "122002"), followUp = attackOf(data, "122004");
    const scenario = scenarios[0];
    const built = makeFeixiaoSequence(parent, parent, followUp, 10, 10, scenario, [], []);
    const incomplete = engine.calculate({ ...built.request, sequenceComponents: built.request.sequenceComponents.slice(0, 1) });
    assert.equal(incomplete.supported, false);
    assert.equal(incomplete.nonCrit, undefined, "no partial damage scalar is returned");
    const wrongComponent = structuredClone(built.request);
    wrongComponent.sequenceComponents[1].input.attack.id = "122003";
    const invalid = engine.calculate(wrongComponent);
    assert.equal(invalid.supported, false);
    assert.equal(invalid.nonCrit, undefined, "changed component cannot leak a plausible partial value");
    const wrongEnemy = structuredClone(built.request);
    wrongEnemy.sequenceComponents[1].input.enemy = { ...wrongEnemy.sequenceComponents[1].input.enemy, resistance: 40 };
    assert.equal(engine.calculate(wrongEnemy).supported, false, "both components must use the same enemy snapshot");

    const [nativeDamage, a4CritDamage] = modifierRecords(data, feixiaoModifierIds.slice(0, 2));
    const validNative = modifierCandidates([nativeDamage, a4CritDamage], "1220", { "122004": 10 }, { "feixiao-formshift-unlocked": true }, scenario.stats);
    const valid = makeFeixiaoSequence(parent, parent, followUp, 10, 10, scenario, [], validNative);
    assert.notEqual(engine.calculate(valid.request).supported, false, "negative mutations start from a complete required-native request");
    const missingRequiredBonus = engine.calculate(built.request);
    assert.equal(missingRequiredBonus.supported, false, "required native FUA bonus cannot be silently omitted");
    assert.equal(missingRequiredBonus.nonCrit, undefined, "missing required FUA bonus returns no partial total");
    assert.match(missingRequiredBonus.reason, /必須の発動時与ダメージ補正/);

    const duplicateNative = structuredClone(valid.request);
    duplicateNative.sequenceComponents[1].input.modifiers.push({ ...validNative[0] });
    assert.equal(engine.calculate(duplicateNative).supported, false, "duplicate native FUA bonus is rejected");

    const invalidStats = structuredClone(valid.request);
    invalidStats.character.stats.critDamage = undefined;
    invalidStats.sequenceComponents.forEach((component) => { component.input.character = { ...invalidStats.character }; });
    const missingStat = engine.calculate(invalidStats);
    assert.equal(missingStat.supported, false, "required final stats cannot produce an apparently valid result when absent");
    assert.equal(missingStat.nonCrit, undefined);
});

test("Jade one-target Talent FUA uses the final ATK and Pawned Assets Crit DMG snapshot without automatic additions", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "131404");
    const [enhanced] = modifierRecords(data, [jadeModifierId]);
    assert.equal(attack.support?.status, "calculable");
    assert.equal(attack.support?.verified, true);
    assert.equal(attack.type, "followUp");
    assert.equal(attack.damageFormula, "statMultiplier");
    assert.equal(attack.scalingStat, "atk");
    assert.equal(attack.element, "Quantum");
    assert.equal(attack.target, "aoe");
    assert.equal(attack.enemyCountExact, 1);
    assert.equal(attack.maximumEidolon, 0);
    assert.equal(attack.requiredToughnessActive, null);
    assert.equal(attack.requiresNonWeakTarget, null);
    assert.equal(attack.provenance?.sourceCommit, fixedSourceSha);
    assertSourceCurve(attack.multipliers, jadeSource.followUp, "Jade Talent FUA source curve");
    assert.equal(enhanced.activation?.inputKey, "jade-enhanced-followup-active");
    assert.equal(enhanced.activation?.default, false);
    assert.equal(enhanced.calculation?.stage, "attackMultiplier");
    assert.equal(enhanced.calculation?.operation, "add");
    assert.deepEqual(Array.from(enhanced.target?.attackIds), ["131404"]);
    assert.deepEqual(Array.from(enhanced.target?.attackTypes), ["followUp"]);
    assertSourceCurve(enhanced.value.values, jadeSource.enhancedFollowUpAddition, "Jade Ultimate FUA addition source curve");
    assertSourceCurve(attack.provenance?.pawnCritDamagePerStack, jadeSource.pawnCritDamagePerStack, "Jade Pawned Assets Crit DMG source curve");

    for (const scenario of scenarios) {
        for (let talentLevel = 1; talentLevel <= 10; talentLevel++) {
            for (let ultimateLevel = 1; ultimateLevel <= 10; ultimateLevel++) {
                const pawnStacks = 50;
                // All Pawned Assets and A6 effects are already in these final values.
                // The calculation must not add the +25% ATK or stack Crit DMG again.
                const finalCritDamage = scenario.stats.critDamage + jadeSource.pawnCritDamagePerStack[talentLevel - 1] * pawnStacks;
                const finalStats = { ...scenario.stats, critDamage: finalCritDamage };
                const context = { characterId: "1314", eidolon: 0, stats: finalStats,
                    traceLevelFor: (source) => source?.skillId === "131403" ? ultimateLevel : talentLevel };
                for (const active of [false, true]) {
                    const candidates = runtime.buildCandidates([enhanced], context, { "jade-enhanced-followup-active": active });
                    assert.equal(candidates.length, 1);
                    const candidate = candidates[0];
                    assert.equal(candidate.enabled, active, "Jade enhanced-FUA default/off state follows the explicit toggle");
                    assertClose(candidate.value, jadeSource.enhancedFollowUpAddition[ultimateLevel - 1], "Jade ultimate-based addition Lv" + ultimateLevel);
                    const modifiers = scopedModifiers(candidates, attack);
                    const request = makeRequest(attack, talentLevel, {
                        characterLevel: 80, eidolon: 0,
                        atk: finalStats.atk, hp: finalStats.hp, def: finalStats.def,
                        baseAtk: scenario.baseStats.atk, baseHp: scenario.baseStats.hp, baseDef: scenario.baseStats.def,
                        critRate: finalStats.critRate, critDamage: finalStats.critDamage, damageBonus: finalStats.damageBonus,
                        enemyLevel: scenario.enemyLevel, resistance: scenario.resistance, toughnessActive: true, enemyCount: 1, weakness: false,
                        resistancePenetration: scenario.resistancePenetration || 0,
                        defenseReduction: scenario.defenseReduction || 0, defenseIgnore: scenario.defenseIgnore || 0,
                        takenDamage: scenario.takenDamage || 0
                    }, modifiers);
                    request.character.stats = { ...request.character.stats, ...finalStats };
                    request.character.baseStats = { ...request.character.baseStats, ...scenario.baseStats };
                    request.modifierInputs = {"jade-pawned-asset-stacks":50};
                    const addition = active ? jadeSource.enhancedFollowUpAddition[ultimateLevel - 1] : 0;
                    const oracle = oracleInput(request, "atk", jadeSource.followUp[talentLevel - 1] + addition, modifiers);
                    const result = assertMatchesOracle(engine, request, oracle, `Jade E0 Talent Lv${talentLevel}/Ultimate Lv${ultimateLevel}/${active ? "ON" : "OFF"}`);
                    assertClose(result.breakdown.multiplierPercent, jadeSource.followUp[talentLevel - 1] + addition, "Jade enhanced value adds percentage points, not a ratio");
                    assertClose(result.breakdown.referenceValue, finalStats.atk, "Jade references the completed final ATK input");
                    assertClose(result.breakdown.critDamagePercent, finalCritDamage, "Pawned Assets Crit DMG remains in the final stat input once");
                    assertClose(result.breakdown.effectiveAtk ?? result.breakdown.referenceValue, finalStats.atk, "Jade A6 ATK is not automatically added a second time");
                }
            }
        }
    }
});

test("Jade enhanced FUA condition is optional and cannot alter the Ultimate or another character's FUA", async () => {
    const { data } = await loadProductionFixture();
    const [enhanced] = modifierRecords(data, [jadeModifierId]);
    const candidate = runtime.buildCandidates([enhanced], {
        characterId: "1314", eidolon: 0,
        traceLevelFor: (source) => source?.skillId === "131403" ? 10 : 1
    }, { "jade-enhanced-followup-active": true })[0];
    assert.equal(candidate.enabled, true);
    assertClose(candidate.value, 80, "Jade Ultimate Lv10 produces +80 percentage points");
    assert.equal(runtime.applicableToAttack(candidate, { id: "131404", type: "followUp", attackType: "followUp", element: "Quantum" }), true);
    assert.equal(runtime.applicableToAttack(candidate, { id: "131403", type: "ultimate", attackType: "ultimate", element: "Quantum" }), false);
    assert.equal(runtime.applicableToAttack(candidate, { id: "122004", type: "followUp", attackType: "followUp", element: "Wind" }), false);
});

test("Both promotions isolate ATK scaling from HP and DEF changes in asymmetric final-stat inputs", async () => {
    const { data, engine } = await loadProductionFixture();
    const feixiaoParent = attackOf(data, "122002"), feixiaoFua = attackOf(data, "122004"), jade = attackOf(data, "131404");
    const feixiaoRecords = modifierRecords(data, feixiaoModifierIds.slice(0, 2));
    const jadeRecords = modifierRecords(data, [jadeModifierId]);
    const baseline = scenarios[0];

    const makeFeixiao = (stats) => {
        const candidates = modifierCandidates(feixiaoRecords, "1220", { "122004": 6 }, { "feixiao-formshift-unlocked": true }, stats);
        const built = makeFeixiaoSequence(feixiaoParent, feixiaoParent, feixiaoFua, 4, 6, baseline,
            scopedModifiers(candidates, { id: "122002", type: "skill", attackType: "skill", element: "Wind", target: "single" }),
            scopedModifiers(candidates, { id: "122004", type: "followUp", attackType: "followUp", element: "Wind", target: "single" }));
        built.request.character.stats = { ...built.request.character.stats, ...stats };
        for (const item of built.request.sequenceComponents) item.input.character.stats = { ...item.input.character.stats, ...stats };
        const actual = engine.calculate(built.request);
        assert.notEqual(actual.supported, false, actual.reason);
        return actual;
    };
    const fxBase = makeFeixiao(baseline.stats);
    const fxAtk = makeFeixiao({ ...baseline.stats, atk: baseline.stats.atk + 1200 });
    const fxHp = makeFeixiao({ ...baseline.stats, hp: baseline.stats.hp + 5000 });
    const fxDef = makeFeixiao({ ...baseline.stats, def: baseline.stats.def + 1500 });
    assert.ok(fxAtk.nonCrit > fxBase.nonCrit);
    assertClose(fxHp.nonCrit, fxBase.nonCrit, "Feixiao HP does not affect either ATK-scaled component");
    assertClose(fxDef.nonCrit, fxBase.nonCrit, "Feixiao DEF does not affect either ATK-scaled component");

    const jadeResult = (stats) => {
        const request = makeRequest(jade, 8, {
            characterLevel: 80, eidolon: 0, atk: stats.atk, hp: stats.hp, def: stats.def,
            baseAtk: baseline.baseStats.atk, baseHp: baseline.baseStats.hp, baseDef: baseline.baseStats.def,
            critRate: stats.critRate, critDamage: stats.critDamage, damageBonus: stats.damageBonus,
            enemyLevel: baseline.enemyLevel, resistance: baseline.resistance, toughnessActive: true,
            enemyCount: 1, weakness: false
        }, scopedModifiers(runtime.buildCandidates(jadeRecords, {
            characterId: "1314", eidolon: 0, stats,
            traceLevelFor: () => 10
        }, { "jade-enhanced-followup-active": true }), jade));
        request.character.stats = { ...request.character.stats, ...stats };
        request.modifierInputs = {"jade-pawned-asset-stacks":50};
        return engine.calculate(request);
    };
    const jadeBaseStats = { ...baseline.stats, critDamage: baseline.stats.critDamage + jadeSource.pawnCritDamagePerStack[7] * 50 };
    const jdBase = jadeResult(jadeBaseStats);
    const jdAtk = jadeResult({ ...jadeBaseStats, atk: jadeBaseStats.atk + 1200 });
    const jdHp = jadeResult({ ...jadeBaseStats, hp: jadeBaseStats.hp + 5000 });
    const jdDef = jadeResult({ ...jadeBaseStats, def: jadeBaseStats.def + 1500 });
    assert.ok(jdAtk.nonCrit > jdBase.nonCrit);
    assertClose(jdHp.nonCrit, jdBase.nonCrit, "Jade HP does not affect the ATK-scaled FUA");
    assertClose(jdDef.nonCrit, jdBase.nonCrit, "Jade DEF does not affect the ATK-scaled FUA");
});
