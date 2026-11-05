"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    fixedSourceSha,
    loadProductionFixture,
    attackOf,
    independentDirectDamage,
    assertClose
} = require("./helpers/hsrDirectVerification.cjs");

// Hand-transcribed from pinned StarRailRes JP character_skills.json:
// 122401 params[0..5] (basic), 122408 params[0..5] (enhanced basic, per hit),
// 122402 params[0..9] (Shifu-type Additional DMG, once per normal / each enhanced hit).
// 122404 talent is the 80% Enhanced Basic ATK DMG bonus at Lv10. E0 trace caps:
// Normal 6, Skill 10. This test treats the realized enhanced hit count as a state,
// not a probability average. Enemy and DMG bonus are looked up per component element.
// Fixed Fribbels independently models the Shifu component with standardAdditional / DamageTag.ADDITIONAL,
// while the body is standardBasic / DamageTag.BASIC. The 122404 buff explicitly covers both tags.
// https://github.com/Fribbels/hsr-optimizer/blob/90bc8401408b17dba0a6743d882eb096ee236816/src/lib/conditionals/character/1200/March7thImaginary.ts#L229-L239
// https://github.com/Fribbels/hsr-optimizer/blob/90bc8401408b17dba0a6743d882eb096ee236816/src/lib/conditionals/character/1200/March7thImaginary.ts#L283-L286
const sourceUrl = "https://github.com/Mar-7th/StarRailRes/blob/dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487/index_new/jp/character_skills.json";
const basicCurve = [50, 60, 70, 80, 90, 100];
const enhancedPerHitCurve = [40, 48, 56, 64, 72, 80];
const additionalCurve = [10, 11, 12, 13, 14, 15, 16.25, 17.5, 18.75, 20];
const enhancedDamageCurve = [40, 44, 48, 52, 56, 60, 65, 70, 75, 80];
const nativeEnhancedId = "trace:1224:122404:enhanced-damage";

const profile = {
    atk: 4317.25, hp: 12731.5, def: 1942.75,
    baseAtk: 1121.5, baseHp: 1532.25, baseDef: 684.75,
    critRate: 67.25, critDamage: 143.75,
    damageBonus: 4.5,
    damageBonuses: { Imaginary: 27.25, Fire: 41.75, Thunder: 9.5, Physical: 18.25, Ice: 23.75, Wind: 31.5, Quantum: 42.75 },
    characterLevel: 80, eidolon: 0
};
const enemyProfile = {
    enemyCount: 1, enemyLevel: 91, resistance: 12.5,
    resistances: { Imaginary: 12.5, Fire: 35.25, Thunder: 8.75, Physical: 19.25, Ice: 28.75, Wind: 33.5, Quantum: 7.25 },
    weakness: false, toughnessActive: true,
    defenseReduction: 13.25, defenseIgnore: 7.75,
    resistancePenetration: 4.5, takenDamage: 11.25
};

function componentRequest(attack, level, hits, element, perHitPercent, shifuDamageBonus, modifiers = [], actionType = attack.type) {
    const multiplier = perHitPercent;
    return {
        character: {
            level: 80, eidolon: 0,
            stats: { atk: profile.atk, hp: profile.hp, def: profile.def,
                critRate: profile.critRate, critDamage: profile.critDamage,
            damageBonus: profile.damageBonus, damageBonuses: { ...profile.damageBonuses } },
            baseStats: { atk: profile.baseAtk, hp: profile.baseHp, def: profile.baseDef }
        },
        enemy: {
            count: enemyProfile.enemyCount, level: enemyProfile.enemyLevel,
            resistance: enemyProfile.resistance, resistances: { ...enemyProfile.resistances },
            weakness: enemyProfile.weakness, toughnessActive: enemyProfile.toughnessActive,
            defenseReduction: enemyProfile.defenseReduction, defenseIgnore: enemyProfile.defenseIgnore,
            resistancePenetration: enemyProfile.resistancePenetration, takenDamage: enemyProfile.takenDamage
        },
        attack: {
            ...attack,
            ...(attack.id === "122408" ? { type: "enhancedNormal" } : {}),
            ...(attack.id === "122402" ? { type: "additional" } : {}),
            element, traceLevel: level, hitCount: hits, damageFormula: "statMultiplier",
            multiplier, attackType: actionType, scalingStat: "atk", target: "single"
        },
        modifiers: modifiers.map(modifier => ({ ...modifier, value: modifier.id === nativeEnhancedId ? shifuDamageBonus : modifier.value }))
    };
}

function expectedChild(input) {
    const element = input.attack.element;
    const expectedInput = structuredClone(input);
    expectedInput.modifiers = (expectedInput.modifiers || []).filter(modifier => modifierMatchesAttack(modifier, expectedInput.attack));
    expectedInput.character.stats.damageBonus = expectedInput.character.stats.damageBonuses[element];
    expectedInput.enemy.resistance = expectedInput.enemy.resistances[element];
    delete expectedInput.character.stats.damageBonuses;
    delete expectedInput.enemy.resistances;
    const perHit = independentDirectDamage(expectedInput);
    return Object.fromEntries(["nonCrit", "crit", "expected"].map(key => [key, perHit[key] * input.attack.hitCount]));
}

function verifyChild(engine, input, label) {
    const expected = expectedChild(input);
    const actual = engine.calculate(input);
    assert.notEqual(actual.supported, false, label + ": " + actual.reason);
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], label + " " + key);
    assertClose(actual.breakdown.referenceValue, profile.atk, label + " March ATK owner");
    assertClose(actual.breakdown.damageBonus, input.character.stats.damageBonuses[input.attack.element]
        + (input.modifiers || []).filter(modifier => modifier.enabled !== false && modifier.applicable !== false && modifier.category === "damageBonus" && modifierMatchesAttack(modifier, input.attack)).reduce((sum, modifier) => sum + Number(modifier.value || 0), 0), label + " element DMG bonus");
    assertClose(actual.breakdown.resistance, 1 - (input.enemy.resistances[input.attack.element] - input.enemy.resistancePenetration) / 100, label + " element RES");
    return actual;
}

function modifierMatchesAttack(modifier, attack) {
    const target = modifier.target || {};
    const types = target.attackTypes || modifier.attackTypes || ["all"];
    const ids = target.attackIds || [];
    const elements = target.elements || [];
    const type = attack.attackType || attack.type || "normal";
    const tags = Array.isArray(attack.tags) ? attack.tags : [];
    return (!ids.length || ids.includes(String(attack.id || "")))
        && (types.includes("all") || types.includes(type) || tags.some(tag => types.includes(tag)))
        && (!elements.length || elements.includes(attack.element || ""));
}

function sumExpected(children) {
    return Object.fromEntries(["nonCrit", "crit", "expected"].map(key => [key, children.reduce((sum, child) => sum + child[key], 0)]));
}

function nativeModifier(record, value) {
    return { ...record, value, enabled: true, applicable: true, calculable: true };
}

test("batch5 Hunt March full normal/enhanced comparison uses pinned E0 curves and separates body from Shifu Additional DMG", async () => {
    const { data, engine } = await loadProductionFixture();
    assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
    const normal = attackOf(data, "1224011");
    const enhanced = attackOf(data, "1224081");
    const basic = attackOf(data, "122401");
    const enhancedBasic = attackOf(data, "122408");
    const additional = attackOf(data, "122402");
    const native = data.structuredModifiers.find(modifier => modifier.id === nativeEnhancedId);
    assert.ok(native, "pinned enhanced-normal trace exists once as a structured effect");
    assert.equal(normal.support.status, "calculable");
    assert.equal(enhanced.support.status, "calculable");
    assert.equal(normal.provenance.sourceCommit, fixedSourceSha);
    assert.equal(enhanced.provenance.sourceCommit, fixedSourceSha);
    assert.equal(normal.maximumEidolon, 0);
    assert.equal(enhanced.maximumEidolon, 0);
    assert.deepEqual(basic.multipliers.slice(0, 6), basicCurve);
    assert.deepEqual(enhancedBasic.multipliers.slice(0, 6), enhancedPerHitCurve);
    additionalCurve.forEach((value, index) => assertClose(additional.multipliers[index], value, "122402 params[1] Lv" + (index + 1)));
    assert.equal(normal.damageComponents?.length, 2);
    assert.equal(enhanced.damageComponents?.length, 2);

    for (const shifuElement of ["Fire", "Thunder", "Physical", "Wind", "Quantum", "Imaginary", "Ice"]) {
        for (const shifuPath of ["Erudition", "Destruction", "Hunt", "Remembrance", "Elation"]) {
            for (let normalLevel = 1; normalLevel <= 6; normalLevel++) for (let skillLevel = 1; skillLevel <= 10; skillLevel++) {
                const talentLevel = (normalLevel + skillLevel - 2) % 10 + 1;
                const normalInput = {
                    character: { level: 80, eidolon: 0, stats: { atk: profile.atk, hp: profile.hp, def: profile.def, critRate: profile.critRate, critDamage: profile.critDamage, damageBonus: profile.damageBonus, damageBonuses: { ...profile.damageBonuses } }, baseStats: { atk: profile.baseAtk, hp: profile.baseHp, def: profile.baseDef } },
                    enemy: { count: 1, level: enemyProfile.enemyLevel, resistance: enemyProfile.resistance, resistances: { ...enemyProfile.resistances }, weakness: false, toughnessActive: true, defenseReduction: enemyProfile.defenseReduction, defenseIgnore: enemyProfile.defenseIgnore, resistancePenetration: enemyProfile.resistancePenetration, takenDamage: enemyProfile.takenDamage },
                    attack: { ...normal, traceLevel: normalLevel, multiplier: normal.multipliers?.[normalLevel - 1], hitCount: 1, attackType: "normal", shifuElement, shifuPath, talentLevel }
                };
                const normalOnly = { id: "test-march-normal-only", name: "通常限定与ダメージ", category: "damageBonus", value: 18.75, enabled: true, applicable: true, calculable: true, target: { attackTypes: ["normal"], elements: ["Imaginary"] } };
                const additionalOnly = { id: "test-march-additional-only", name: "師匠付加限定与ダメージ", category: "damageBonus", value: 13.25, enabled: true, applicable: true, calculable: true, target: { attackIds: ["122402"], attackTypes: ["additional"], elements: [shifuElement] } };
                const nativeValue = enhancedDamageCurve[talentLevel - 1];
                const normalBody = componentRequest(basic, normalLevel, 1, "Imaginary", basicCurve[normalLevel - 1], 0, [normalOnly, additionalOnly]);
                const normalAdditional = componentRequest(additional, skillLevel, 1, shifuElement, additionalCurve[skillLevel - 1], 0, [normalOnly, additionalOnly], "additional");
                normalInput.sequenceComponents = [
                    { key: "basic", name: normal.damageComponents[0].name, input: normalBody },
                    { key: "additional", name: normal.damageComponents[1].name, input: normalAdditional }
                ];
                const normalBodyResult = verifyChild(engine, normalBody, "normal body E0 N" + normalLevel + " / skill" + skillLevel + " " + shifuElement);
                const normalAdditionalResult = verifyChild(engine, normalAdditional, "normal Shifu DMG E0 N" + normalLevel + " / skill" + skillLevel + " " + shifuElement);
                assert.equal(normalBodyResult.applied.filter(modifier => modifier.id === normalOnly.id).length, 1, "normal-only bonus applies to normal body");
                assert.equal(normalBodyResult.applied.filter(modifier => modifier.id === additionalOnly.id).length, 0, "Additional-only bonus does not apply to normal body");
                assert.equal(normalAdditionalResult.applied.filter(modifier => modifier.id === normalOnly.id).length, 0, "normal-only bonus is excluded from Shifu Additional DMG even when passed applicable");
                assert.equal(normalAdditionalResult.applied.filter(modifier => modifier.id === additionalOnly.id).length, 1, "generic Additional bonus applies only to Shifu component");
                const normalResult = engine.calculate(normalInput);
                assert.notEqual(normalResult.supported, false, "normal aggregate: " + normalResult.reason);
                const normalExpected = sumExpected([expectedChild(normalBody), expectedChild(normalAdditional)]);
                for (const key of ["nonCrit", "crit", "expected"]) assertClose(normalResult[key], normalExpected[key], "normal total " + key);
                assert.equal(normalResult.components?.basic?.attack?.hitCount, 1);
                assert.equal(normalResult.components?.additional?.attack?.hitCount, 1);

                if (shifuElement === "Fire" && shifuPath === "Erudition" && normalLevel === 1 && skillLevel === 1) {
                    const off = structuredClone(normalInput);
                    for (const child of off.sequenceComponents) child.input.modifiers.forEach(modifier => { modifier.enabled = false; });
                    const offResult = engine.calculate(off);
                    assert.notEqual(offResult.supported, false, "disabled type-specific bonuses remain calculable");
                    const offExpected = sumExpected(off.sequenceComponents.map(component => expectedChild(component.input)));
                    for (const key of ["nonCrit", "crit", "expected"]) assertClose(offResult[key], offExpected[key], "normal/additional modifier OFF " + key);
                }

                for (let realizedHits = 3; realizedHits <= 8; realizedHits++) {
                    const bodyBonus = { ...nativeModifier(native, nativeValue), target: { ...native.target, attackTypes: ["enhancedNormal"] } };
                    const additionalBonus = { ...nativeModifier(native, nativeValue), target: { ...native.target, owner: "self", attackIds: ["122402"], attackTypes: ["additional"], elements: [shifuElement] } };
                    const enhancedOnly = { ...normalOnly, id: "test-march-enhanced-only", name: "強化通常限定与ダメージ", target: { attackTypes: ["enhancedNormal"], elements: ["Imaginary"] } };
                    const enhancedAdditionalOnly = { ...additionalOnly, id: "test-march-enhanced-additional-only" };
                    const enhancedInput = {
                        character: structuredClone(normalInput.character), enemy: structuredClone(normalInput.enemy),
                        attack: { ...enhanced, traceLevel: normalLevel, multiplier: enhanced.multipliers?.[normalLevel - 1], hitCount: realizedHits, attackType: "enhancedNormal", shifuElement, shifuPath, talentLevel }
                    };
                    const enhancedBody = componentRequest(enhancedBasic, normalLevel, realizedHits, "Imaginary", enhancedPerHitCurve[normalLevel - 1], nativeValue, [bodyBonus, enhancedOnly, enhancedAdditionalOnly], "enhancedNormal");
                    const enhancedAdditional = componentRequest(additional, skillLevel, realizedHits, shifuElement, additionalCurve[skillLevel - 1], nativeValue, [additionalBonus, enhancedOnly, enhancedAdditionalOnly], "additional");
                    enhancedInput.sequenceComponents = [
                        { key: "basic", name: enhanced.damageComponents[0].name, input: enhancedBody },
                        { key: "additional", name: enhanced.damageComponents[1].name, input: enhancedAdditional }
                    ];
                    const bodyResult = verifyChild(engine, enhancedBody, "enhanced body Lv" + normalLevel + "/" + skillLevel + " hits" + realizedHits);
                    const additionalResult = verifyChild(engine, enhancedAdditional, "enhanced Shifu DMG Lv" + normalLevel + "/" + skillLevel + " hits" + realizedHits + " " + shifuElement);
                    assert.equal(bodyResult.applied.filter(modifier => modifier.id === nativeEnhancedId).length, 1, "native 122404 buff applies once to the enhanced body");
                    assert.equal(additionalResult.applied.filter(modifier => modifier.id === nativeEnhancedId).length, 1, "native 122404 buff applies once to Shifu Additional DMG");
                    assert.equal(bodyResult.applied.filter(modifier => modifier.id === enhancedOnly.id).length, 1, "enhanced-normal-only bonus applies to the body");
                    assert.equal(bodyResult.applied.filter(modifier => modifier.id === enhancedAdditionalOnly.id).length, 0, "Additional-only bonus is excluded from the enhanced body");
                    assert.equal(additionalResult.applied.filter(modifier => modifier.id === enhancedOnly.id).length, 0, "enhanced-normal-only bonus is excluded from Additional DMG even when passed applicable");
                    assert.equal(additionalResult.applied.filter(modifier => modifier.id === enhancedAdditionalOnly.id).length, 1, "generic Additional bonus applies only to Shifu component");
                    const total = engine.calculate(enhancedInput);
                    assert.notEqual(total.supported, false, "enhanced aggregate: " + total.reason);
                    const expected = sumExpected([expectedChild(enhancedBody), expectedChild(enhancedAdditional)]);
                    for (const key of ["nonCrit", "crit", "expected"]) assertClose(total[key], expected[key], "enhanced total " + key);
                    assert.equal(total.components?.basic?.attack?.hitCount, realizedHits);
                    assert.equal(total.components?.additional?.attack?.hitCount, realizedHits);
                    assert.equal(total.applied?.filter(modifier => modifier.id === nativeEnhancedId).length, 2, "the enhanced-state modifier is carried once per component");
                    assert.ok(total.nonCrit > total.components.basic.nonCrit, "additional damage is a separate summed component");
                    if (shifuElement === "Fire" && shifuPath === "Erudition" && normalLevel === 1 && skillLevel === 1 && realizedHits === 3) {
                        const wrongScope=structuredClone(enhancedInput);wrongScope.sequenceComponents[1].input.modifiers[0].target.attackIds=["122408"];assert.equal(engine.calculate(wrongScope).supported,false,"native ID alone cannot replace actual per-component application");
                        const off=structuredClone(enhancedInput);for(const child of off.sequenceComponents)child.input.modifiers.filter(modifier=>modifier.id!==nativeEnhancedId).forEach(modifier=>{modifier.enabled=false;});const offResult=engine.calculate(off);assert.notEqual(offResult.supported,false,"type-specific modifier OFF leaves required native talent buff intact");const offExpected=sumExpected(off.sequenceComponents.map(component=>expectedChild(component.input)));for(const key of ["nonCrit","crit","expected"])assertClose(offResult[key],offExpected[key],"enhanced type-specific modifier OFF "+key);
                        const progressive=structuredClone(enhancedInput);progressive.sequenceComponents[0].input.modifiers.push({id:"test-march-progressive-taken",category:"progressiveTakenDamage",value:5,enabled:true,applicable:true,target:{attackTypes:["enhancedNormal"]}});const progressiveResult=engine.calculate(progressive);assert.equal(progressiveResult.supported,false,"progressive per-hit taken damage remains outside the fixed-state sum");assert.match(progressiveResult.reason,/段間/);
                        for (const stat of ["atk", "hp", "def"]) {
                            const changed = structuredClone(enhancedInput);
                            changed.character.stats[stat] += 1387.25;
                            changed.sequenceComponents.forEach(component => { component.input.character.stats[stat] += 1387.25; });
                            const changedResult = engine.calculate(changed);
                            assert.notEqual(changedResult.supported, false, "stat isolation remains supported for " + stat);
                            const expectedRatio = stat === "atk" ? (profile.atk + 1387.25) / profile.atk : 1;
                            assertClose(changedResult.nonCrit / total.nonCrit, expectedRatio, "both components reference March final ATK only; changing " + stat);
                        }
                        const shifuStats = structuredClone(enhancedInput);
                        shifuStats.attack.shifuAtk = 999999;
                        assertClose(engine.calculate(shifuStats).nonCrit, total.nonCrit, "Shifu ATK is not a damage reference");
                    }
                }
            }
        }
    }
});

test("batch5 Hunt March rejects unsupported Shifu paths and never substitutes the Imaginary resistance for another element", async () => {
    const { data, engine } = await loadProductionFixture();
    const enhanced = attackOf(data, "1224081");
    const invalidPath = { character: { level: 80, eidolon: 0, stats: { atk: 3000, critRate: 50, critDamage: 100, damageBonus: 0, damageBonuses: { Imaginary: 0, Fire: 0 } }, baseStats: { atk: 1000 } }, enemy: { count: 1, level: 80, resistance: 20, resistances: { Imaginary: 20, Fire: 20 }, weakness: false, toughnessActive: true }, attack: { ...enhanced, traceLevel: 6, multiplier: enhanced.multipliers?.[5], hitCount: 3, attackType: "enhancedNormal", shifuElement: "Fire", shifuPath: "Harmony", talentLevel: 10 }, sequenceComponents: [] };
    const invalid = engine.calculate(invalidPath);
    assert.equal(invalid.supported, false, "Harmony is not an offensive Shifu path for the enhanced basic state");
    assert.match(invalid.reason, /運命|対象|師匠/);

    const missingMap = structuredClone(invalidPath);
    const basic = attackOf(data, "122408"), additional = attackOf(data, "122402");
    const nativeBonus = nativeModifier(data.structuredModifiers.find(modifier => modifier.id === nativeEnhancedId), 80);
    missingMap.attack.shifuPath = "Hunt";
    missingMap.attack.damageComponents = [{ key: "basic", attackId: "122408", name: "本体" }, { key: "additional", attackId: "122402", name: "師匠属性の追加" }];
    const body = componentRequest(basic, 6, 3, "Imaginary", 80, 80, [{ ...nativeBonus, target: { ...nativeBonus.target, attackTypes: ["enhancedNormal"] } }], "enhancedNormal");
    const shifu = componentRequest(additional, 10, 3, "Fire", 20, 80, [{ ...nativeBonus, target: { ...nativeBonus.target, owner: "self", attackIds: ["122402"], attackTypes: ["additional"], elements: ["Fire"] } }], "additional");
    missingMap.character = structuredClone(body.character);
    missingMap.enemy = structuredClone(body.enemy);
    delete missingMap.character.stats.damageBonuses.Fire;
    delete missingMap.enemy.resistances.Fire;
    for (const child of [body, shifu]) {
        delete child.character.stats.damageBonuses.Fire;
        delete child.enemy.resistances.Fire;
    }
    missingMap.sequenceComponents = [
        { key: "basic", name: "本体", input: body },
        { key: "additional", name: "師匠属性の追加", input: shifu }
    ];
    const native = engine.calculate(missingMap);
    assert.equal(native.supported, false, "a required Shifu-element bonus map cannot silently fall back to the active Imaginary scalar");
    assert.match(native.reason, /属性|入力|補正/);
});
