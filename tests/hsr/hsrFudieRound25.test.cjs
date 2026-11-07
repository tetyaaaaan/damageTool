"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const runtime = require("../../games/js/hsrModifierRuntime.js");
const {
    loadProductionFixture,
    makeRequest,
    independentDirectDamage,
    assertClose,
    fixedSourceSha
} = require("./helpers/hsrDirectVerification.cjs");

const source = require("../../games/hsr/data/calc/attacks-fudie-round25.json");
const modifierRows = require("../../games/hsr/data/calc/modifiers-fudie-round24.json").modifiers;
const profile = {
    characterLevel: 80, eidolon: 0,
    atk: 3187, hp: 8021, def: 1753, baseAtk: 1085, baseHp: 1243, baseDef: 914,
    critRate: 37, critDamage: 143, damageBonus: 17,
    enemyLevel: 82, enemyCount: 1, resistance: 27, weakness: false, toughnessActive: true,
    defenseReduction: 11, defenseIgnore: 4, resistancePenetration: 7, takenDamage: 9
};
const ult = [200, 220, 240, 260, 280, 300, 325, 350, 375, 400];
const talent = [100, 110, 120, 130, 140, 150, 162.5, 175, 187.5, 200];

function install(data) {
    for (const attack of source.overrides) {
        const index = data.attacks.findIndex((item) => item.id === attack.id);
        if (index < 0) data.attacks.push(attack);
        else data.attacks[index] = attack;
    }
}

function modifierCandidates(data, attack, inputs) {
    const records = [
        ...data.structuredModifiers.filter((item) => !modifierRows.some((row) => row.id === item.id)),
        ...modifierRows
    ];
    return runtime.buildCandidates(records, {
        characterId: "1504",
        eidolon: 0,
        stats: profile,
        baseStats: { atk: profile.baseAtk, hp: profile.baseHp, def: profile.baseDef },
        characterElement: "Thunder",
        traceLevelFor: (source) => source?.skillId === "150402" ? 10 : 10
    }, inputs).map((item) => ({
        ...item,
        applicable: item.applicable && runtime.applicableToAttack(item, attack)
    }));
}

function sequenceRequest(data, ultimateLevel, talentLevel, gluttony, flags = {}) {
    const parent = data.attacks.find((item) => item.id === "150403");
    assert.ok(parent, "the aggregate Ultimate override is installed");
    const rootInputs = { "fudie-prey-active": true, "fudie-gluttony-stacks": gluttony, ...flags };
    const root = makeRequest(parent, ultimateLevel, profile);
    root.modifierInputs = rootInputs;
    root.comparisonModifierInputs = { ...rootInputs };
    root.modifiers = modifierCandidates(data, root.attack, rootInputs);

    const componentCount = 2 + Math.floor(gluttony / 4);
    root.sequenceComponents = parent.damageComponents.slice(0, componentCount).map((definition, index) => {
        const row = data.attacks.find((item) => item.id === definition.attackId);
        assert.ok(row, "component source exists: " + definition.attackId);
        const isFreeTalent = definition.key === "freeTalent";
        const isFollowUp = isFreeTalent || definition.key.startsWith("gluttonyBite");
        const level = isFreeTalent ? talentLevel : ultimateLevel;
        const effectiveStacks = isFollowUp
            ? gluttony - 4 * Math.max(0, index - 1)
            : undefined;
        const localInputs = isFollowUp
            ? { ...rootInputs, "fudie-gluttony-stacks": effectiveStacks }
            : rootInputs;
        const input = makeRequest(row, level, profile);
        input.attack = {
            ...input.attack,
            attackType: row.type,
            ...(isFollowUp ? { fudieEffectiveStacks: effectiveStacks } : {})
        };
        input.modifierInputs = localInputs;
        input.comparisonModifierInputs = isFollowUp
            ? { "fudie-prey-active": true, ...flags, "fudie-gluttony-stacks": effectiveStacks }
            : { "fudie-prey-active": true, ...flags };
        if (isFollowUp) input.fudieEffectiveStacks = effectiveStacks;
        input.modifiers = modifierCandidates(data, input.attack, localInputs);
        return { key: definition.key, name: definition.name, input };
    });
    return root;
}

test("Round25 Fudie Ultimate sums exact direct, free FUA, and conditional Gluttony spends", async () => {
    const { data, engine } = await loadProductionFixture();
    install(data);
    const aggregate = data.attacks.find((item) => item.id === "150403");
    const bite = data.attacks.find((item) => item.id === "1504033");

    assert.equal(aggregate.support.status, "calculable");
    assert.equal(aggregate.provenance.sourceCommit, fixedSourceSha);
    assert.equal(aggregate.damageFormula, "componentSequence");
    assert.deepEqual(Array.from(aggregate.damageComponents, (item) => item.key), ["direct", "freeTalent", "gluttonyBite1", "gluttonyBite2", "gluttonyBite3"]);
    assert.deepEqual(Array.from(aggregate.damageComponents, (item) => item.attackId), ["1504031", "1504032", "1504033", "1504033", "1504033"]);
    assert.deepEqual(Array.from(aggregate.numericModifierInputs, (item) => [item.inputKey, item.minimum, item.maximum]), [["fudie-gluttony-stacks", 2, 12]]);
    assert.deepEqual(Array.from(data.attacks.find((item) => item.id === "1504031").multipliers), ult);
    assert.deepEqual(Array.from(data.attacks.find((item) => item.id === "1504032").multipliers), talent);
    assert.deepEqual(Array.from(bite.multipliers), talent, "the spend coefficient is params[3], independently equal to the verified Ultimate/Talent curve");
    assert.equal(bite.hidden, true);

    for (const { stacks, ultimateLevel, talentLevel } of [
        { stacks: 3, ultimateLevel: 1, talentLevel: 10 },
        { stacks: 4, ultimateLevel: 10, talentLevel: 1 },
        { stacks: 8, ultimateLevel: 7, talentLevel: 5 },
        { stacks: 12, ultimateLevel: 10, talentLevel: 1 }
    ]) {
        const request = sequenceRequest(data, ultimateLevel, talentLevel, stacks);
        const result = engine.calculate(request);
        assert.notEqual(result.supported, false, result.reason);
        assert.equal(request.sequenceComponents.length, 2 + Math.floor(stacks / 4), "only established 4-stack spends appear");

        const oracleParts = request.sequenceComponents.map((component) => independentDirectDamage(component.input));
        for (const key of ["nonCrit", "crit", "expected"]) {
            assertClose(result[key], oracleParts.reduce((sum, item) => sum + item[key], 0), `N=${stacks} ${key}`);
        }
        assert.equal(Object.keys(result.components).length, oracleParts.length);
        if (stacks >= 4) {
            const firstBite = request.sequenceComponents[2].input;
            assert.equal(firstBite.modifierInputs["fudie-gluttony-stacks"], stacks - 4);
            const stackBonus = firstBite.modifiers.find((item) => item.id === "traceNode:1504:1504102:follow-up-stacks");
            assertClose(stackBonus.value, (stacks - 4) * 10, `N=${stacks} first bite post-spend stack bonus`);
        }
    }
});

test("Round25 Fudie Ultimate rejects missing prey, invalid scope, and mixed final-only FUA modifiers", async () => {
    const { data, engine } = await loadProductionFixture();
    install(data);
    const getResult = (options) => {
        const request = sequenceRequest(data, 10, 10, 8, options?.flags || {});
        if (options?.enemyCount !== undefined) request.enemy.count = options.enemyCount;
        if (options?.eidolon !== undefined) request.character.eidolon = options.eidolon;
        if (options?.toughnessActive !== undefined) request.enemy.toughnessActive = options.toughnessActive;
        if (options?.prey === false) {
            request.modifierInputs["fudie-prey-active"] = false;
            request.comparisonModifierInputs["fudie-prey-active"] = false;
        }
        if (options?.stacks !== undefined) request.modifierInputs["fudie-gluttony-stacks"] = options.stacks;
        return engine.calculate(request);
    };

    for (const stacks of [1, 13]) assert.equal(getResult({ stacks }).supported, false, "effective stack input must remain 2..12");
    assert.equal(getResult({ prey: false }).supported, false, "initial prey must be confirmed");
    assert.equal(getResult({ enemyCount: 2 }).supported, false, "only a single enemy is supported");
    assert.equal(getResult({ eidolon: 1 }).supported, false, "only E0 is supported");
    assert.equal(getResult({ toughnessActive: false }).supported, false, "the declared unbroken-enemy scope is enforced");
    for (const flags of [
        { "fudie-a4-base-in-final": true },
        { "fudie-a4-stack-in-final": true },
        { "fudie-a6-follow-up-crit-damage-in-final": true }
    ]) assert.equal(getResult({ flags }).supported, false, "a FUA-only final-stat inclusion cannot be applied to the mixed Ultimate");

    const safeFinal = sequenceRequest(data, 10, 10, 8, {
        "fudie-a6-crit-damage-in-final": true,
        "fudie-prey-defense-in-final": true
    });
    safeFinal.character.stats.critDamage += 40;
    safeFinal.enemy.defenseReduction += 40;
    for(const part of safeFinal.sequenceComponents){part.input.character=safeFinal.character;part.input.enemy=safeFinal.enemy;}
    const accepted = engine.calculate(safeFinal);
    assert.notEqual(accepted.supported, false, accepted.reason);
    const expected = safeFinal.sequenceComponents.map((part) => independentDirectDamage(part.input));
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(accepted[key], expected.reduce((sum, item) => sum + item[key], 0), "safe general final inclusion " + key);
});
