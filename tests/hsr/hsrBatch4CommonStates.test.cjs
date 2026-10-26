"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fixedSourceSha, loadProductionFixture, runtime, assertClose } = require("./helpers/hsrDirectVerification.cjs");

// Hand-transcribed from character_skills.json / character_skill_trees.json /
// character_ranks.json, jp AND en, at the pinned StarRailRes commit below.
// Primary mechanics cross-checks (read 2026-10-26):
// https://hsr.keqingmains.com/q/moze-quickguide/
// https://srl.keqingmains.com/characters/physical/luka
// https://hsr.keqingmains.com/ruan-mei/
// The Ruan Mei Talent is a separate, provider-owned event after the breaker
// finishes attacking; this oracle does not certify the triggering action.
const talentBreak = [60, 66, 72, 78, 84, 90, 97.5, 105, 112.5, 120];
const rebloomBreak = [30, 32, 34, 36, 38, 40, 42.5, 45, 47.5, 50];
const fieldPenetration = [15, 16, 17, 18, 19, 20, 21.25, 22.5, 23.75, 25];

function breakOracle(input, coefficient, penetration) {
    const { character: c, enemy: e } = input;
    const defense = (c.level + 20) / ((c.level + 20) + (e.level + 20) * Math.max(0, 1 - (e.defenseReduction + e.defenseIgnore) / 100));
    const resistance = 1 - (e.resistance - e.resistancePenetration - penetration) / 100;
    return 3767.5533 * coefficient / 100 * (1 + c.stats.breakEffect / 100)
        * defense * resistance * (0.5 + e.maxToughness / 120) * (1 + e.takenDamage / 100);
}

function ruanInput(data, attack, level, breakEffect, maxToughness, providerLevel, active = true) {
    const record = data.structuredModifiers.find(m => m.id === "trace:1303:130303:resistance-penetration");
    const native = runtime.buildCandidates([record], {
        characterId: "1303", partyIds: [], eidolon: 0, traceLevelFor: () => providerLevel
    }, { "ruanmei-field-active": active })[0];
    assert.ok(native);
    assertClose(native.value, fieldPenetration[providerLevel - 1], "independent Ultimate provider curve");
    return {
        character: { level: 80, eidolon: 0, stats: { atk: 3123.5, hp: 9821.75, def: 1789.5, critRate: 37.5, critDamage: 83.25, damageBonus: 41.25, breakEffect }, baseStats: { atk: 1034.25, hp: 901.5, def: 845.75 } },
        enemy: { count: 1, level: 87, weakness: true, toughnessActive: false, maxToughness, resistance: 27.5, defenseReduction: 17, defenseIgnore: 6, resistancePenetration: 8.5, takenDamage: 12.5 },
        element: "Ice", multiplier: attack.multipliers[level - 1] / 100,
        modifiers: [native], breakBaseDamage: data.breakBaseDamage
    };
}

test("batch4 Ruan Mei independent E0 Talent and Rebloom break events match all adopted levels and own provider state", async () => {
    assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
    const { data, engine } = await loadProductionFixture();
    for (const [id, traceKey, curve] of [["1303041", "talent", talentBreak], ["1303031", "ultimate", rebloomBreak]]) {
        const attack = data.specialBreakAttacks.find(a => a.id === id);
        assert.ok(attack, id);
        assert.equal(attack.characterId, "1303");
        assert.equal(attack.type, "break");
        assert.equal(attack.element, "Ice");
        assert.equal(attack.traceKey, traceKey);
        assert.deepEqual(Array.from(attack.multipliers).slice(0, 10), curve, id + " fixed jp/en curve");
        for (let level = 1; level <= 10; level++) for (const breakEffect of [0, 183.75, 341.125]) for (const maxToughness of [30, 300, 480]) for (const providerLevel of [2, 9]) for (const active of [false, true]) {
            const input = ruanInput(data, attack, level, breakEffect, maxToughness, providerLevel, active);
            const result = engine.calculateBreak(input);
            assert.equal(result.supported, true, id + " independent event is supported");
            assertClose(result.value, breakOracle(input, curve[level - 1], active ? fieldPenetration[providerLevel - 1] : 0), id + " Lv" + level + "/BE" + breakEffect + "/toughness" + maxToughness);
            assert.equal("crit" in result, false, "break event has no crit result");
            assert.equal("expected" in result, false, "break event has no expected crit result");
        }
    }
});

test("batch4 Ruan Mei break events use own final BE and ignore direct-damage stats and damage bonuses", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const id of ["1303041", "1303031"]) {
        const attack = data.specialBreakAttacks.find(a => a.id === id);
        const input = ruanInput(data, attack, 7, 213.375, 300, 4);
        const baseline = engine.calculateBreak(input);
        for (const stat of ["atk", "hp", "def", "critRate", "critDamage", "damageBonus"]) {
            const changed = { ...input, character: { ...input.character, stats: { ...input.character.stats, [stat]: input.character.stats[stat] + 1000.25 } } };
            assertClose(engine.calculateBreak(changed).value, baseline.value, id + " ignores " + stat);
        }
        const changedBE = { ...input, character: { ...input.character, stats: { ...input.character.stats, breakEffect: 317.125 } } };
        assertClose(engine.calculateBreak(changedBE).value / baseline.value, 4.17125 / 3.13375, id + " own BE responds independently");
        const forbidden = ["damageBonus", "critRate", "critDamage", "statPercent", "statFlat", "breakEfficiency"].map((category, index) => ({ id: "irrelevant-" + index, category, stat: "atk", value: 77.5, enabled: true, applicable: true }));
        const withForbidden = engine.calculateBreak({ ...input, modifiers: [...input.modifiers, ...forbidden] });
        assertClose(withForbidden.value, baseline.value, id + " ignores non-break categories");
        assert.equal(withForbidden.applied.some(m => m.id.startsWith("irrelevant-")), false);
    }
});

const { attackOf, makeRequest, independentDirectDamage } = require("./helpers/hsrDirectVerification.cjs");
const punchCurve = [10, 12, 14, 16, 18, 20];
const uppercutCurve = [40, 48, 56, 64, 72, 80];
const bleedCapCurve = [130, 143, 156, 169, 182, 201.5, 227.5, 260, 299, 338];
const detonationCurve = [68, 69.7, 71.4, 73.1, 74.8, 76.5, 78.63, 80.75, 82.87, 85];
const robinCurve = [25, 27.5, 30, 32.5, 35, 37.5, 40.62, 43.75, 46.88, 50];
const lukaProfiles = [
    { atk: 3123.5, hp: 9821.75, def: 1789.5, baseAtk: 1034.25, baseHp: 901.5, baseDef: 845.75, critRate: 37.5, critDamage: 83.25, damageBonus: 41.25, enemyLevel: 87, resistance: 27.5, defenseReduction: 17, defenseIgnore: 6, resistancePenetration: 8.5, takenDamage: 12.5 },
    { atk: 2641.125, hp: 12000.25, def: 3012.75, baseAtk: 997.25, baseHp: 1820.5, baseDef: 1145.75, critRate: 71.25, critDamage: 142.75, damageBonus: 11.5, enemyLevel: 95, resistance: 5, defenseReduction: 0, defenseIgnore: 0, resistancePenetration: 0, takenDamage: 0 }
];

function lukaSequence(data, normalLevel, skillLevel, talentLevel, n, ownBleed, profile = lukaProfiles[0], enemyMaxHp = 1000000, providerLevel = 9, enhancedOnly = true) {
    const parent = attackOf(data, "1111083");
    const request = makeRequest(parent, normalLevel, profile);
    request.attack.realizedExtraPunches = n;
    request.attack.ownBleed = ownBleed;
    request.enemy.maxHp = enemyMaxHp;
    request.modifierInputs = { "luka-fighting-will-stacks": 2, "luka-enemy-bleeding": ownBleed };
    const robinRecord = data.structuredModifiers.find(m => m.id === "trace:1309:130902:party-damage");
    const robin = runtime.buildCandidates([robinRecord], { characterId: "1111", partyIds: ["1309"], partyEidolons: { "1309": 0 }, eidolon: 0, traceLevelFor: () => providerLevel }, { "robin-skill-damage-active": true })[0];
    assert.ok(robin?.enabled);
    assertClose(robin.value, robinCurve[providerLevel - 1], "independent Robin provider level");
    const vulnerabilityRecord = data.structuredModifiers.find(m => m.id === "trace:1111:111103:damage-taken");
    const vulnerability = runtime.buildCandidates([vulnerabilityRecord], { characterId: "1111", eidolon: 0, traceLevelFor: () => 4 }, { "luka-ultimate-vulnerability": true })[0];
    assert.ok(vulnerability?.enabled);
    assertClose(vulnerability.value, 14.4, "independent native Ultimate Lv4 vulnerability");
    const normalOnly = { id: "batch4-enhanced-only", name: "enhanced normal only", category: "damageBonus", value: 37.25, enabled: enhancedOnly, applicable: true, target: { attackTypes: ["enhancedNormal"], elements: [] } };
    const dotOnly = { id: "batch4-dot-only", name: "DoT only", category: "dotDamage", value: 18.75, enabled: true, applicable: true, target: { attackTypes: ["dot"], elements: [] } };
    function component(key, id, level) {
        const record = attackOf(data, id);
        const child = makeRequest(record, level, profile, [robin, vulnerability, normalOnly, dotOnly]);
        child.enemy.maxHp = enemyMaxHp;
        child.modifierInputs = { ...request.modifierInputs };
        child.attack.damageFormula = id === "1111041" ? "enemyHpCappedByAtk" : "statMultiplier";
        if (id === "1111081") child.attack.hitCount = 3 + n;
        if (id === "1111041") {
            child.attack.formulaTraceLevel = skillLevel;
            child.attack.enemyHpPercent = record.enemyHpPercentMultipliers[skillLevel - 1];
            child.attack.atkCapPercent = record.atkCapMultipliers[skillLevel - 1];
        }
        return { key, name: parent.damageComponents.find(c => c.key === key).name, input: child };
    }
    request.sequenceComponents = [component("punches", "1111081", normalLevel), component("uppercut", "1111082", normalLevel)];
    if (ownBleed) request.sequenceComponents.push(component("bleed", "1111041", talentLevel));
    return request;
}

function lukaOracle(request, normalLevel, skillLevel, talentLevel, n, ownBleed, providerLevel, enhancedOnly) {
    const input = request.sequenceComponents[0].input;
    const common = robinCurve[providerLevel - 1];
    const normalMods = [{ category: "damageBonus", value: common + (enhancedOnly ? 37.25 : 0) }, { category: "takenDamage", value: 14.4 }];
    const direct = coefficient => independentDirectDamage({ ...input, attack: { scalingStat: "atk", multiplier: coefficient, canCrit: true }, modifiers: normalMods });
    const punches = direct(punchCurve[normalLevel - 1]);
    const uppercut = direct(uppercutCurve[normalLevel - 1]);
    const capped = Math.min(input.enemy.maxHp * .24, input.character.stats.atk * bleedCapCurve[skillLevel - 1] / 100);
    const bleed = ownBleed ? independentDirectDamage({ ...input, character: { ...input.character, stats: { ...input.character.stats, atk: capped } }, attack: { scalingStat: "atk", multiplier: detonationCurve[talentLevel - 1], canCrit: false }, modifiers: [{ category: "damageBonus", value: common + 18.75 }, { category: "takenDamage", value: 14.4 }] }) : { nonCrit: 0, crit: 0, expected: 0 };
    return Object.fromEntries(["nonCrit", "crit", "expected"].map(key => [key, { punches: punches[key] * (3 + n), uppercut: uppercut[key], bleed: bleed[key], total: punches[key] * (3 + n) + uppercut[key] + bleed[key] }]));
}

test("batch4 Luka realized E0 full enhanced Basic compares 0..3 extra punches and own-Bleed states across every independent adopted level", async () => {
    const { data, engine } = await loadProductionFixture();
    const parent = attackOf(data, "1111083");
    assert.equal(parent.damageFormula, "componentSequence");
    assert.equal(parent.support.status, "calculable");
    assert.equal(parent.provenance.sourceCommit, fixedSourceSha);
    assert.deepEqual(Array.from(attackOf(data, "1111081").multipliers).slice(0, 6), punchCurve);
    assert.deepEqual(Array.from(attackOf(data, "1111082").multipliers).slice(0, 6), uppercutCurve);
    for (let normalLevel = 1; normalLevel <= 6; normalLevel++) for (let skillLevel = 1; skillLevel <= 10; skillLevel++) for (let talentLevel = 1; talentLevel <= 10; talentLevel++) for (const n of [0, 1, 2, 3]) for (const ownBleed of [false, true]) {
        // A state without Bleed has no Skill/Talent dependency.
        if (!ownBleed && (skillLevel !== 1 || talentLevel !== 1)) continue;
        for (const enemyMaxHp of [1000, 1000000]) {
            const providerLevel = n % 2 ? 3 : 9;
            const enhancedOnly = n % 2 === 0;
            const request = lukaSequence(data, normalLevel, skillLevel, talentLevel, n, ownBleed, lukaProfiles[n % 2], enemyMaxHp, providerLevel, enhancedOnly);
            const expected = lukaOracle(request, normalLevel, skillLevel, talentLevel, n, ownBleed, providerLevel, enhancedOnly);
            const result = engine.calculate(request);
            const label = "normal" + normalLevel + "/skill" + skillLevel + "/talent" + talentLevel + "/extra" + n + "/ownBleed" + ownBleed + "/HP" + enemyMaxHp;
            assert.notEqual(result.supported, false, label + ": " + result.reason);
            for (const key of ["nonCrit", "crit", "expected"]) {
                assertClose(result.components.punches[key], expected[key].punches, label + " punches " + key);
                assertClose(result.components.uppercut[key], expected[key].uppercut, label + " uppercut " + key);
                if (ownBleed) assertClose(result.components.bleed[key], expected[key].bleed, label + " one noncrit detonation " + key);
                assertClose(result[key], expected[key].total, label + " total " + key);
            }
            if (ownBleed) {
                assert.equal(result.components.bleed.applied.some(m => m.id === "batch4-enhanced-only"), false, "normal-only bonus cannot leak into Bleed");
                assertClose(result.components.bleed.crit, result.components.bleed.nonCrit, "Bleed cannot crit");
            }
            assert.equal(result.components.punches.applied.some(m => m.id === "batch4-dot-only"), false, "DoT-only bonus cannot leak into punches");
        }
    }
});

test("batch4 Luka full realized action isolates owner/provider inputs and rejects partial, impossible and mismatched states", async () => {
    const { data, engine } = await loadProductionFixture();
    const make = (profile = lukaProfiles[0], providerLevel = 9) => lukaSequence(data, 4, 7, 8, 2, true, profile, 1000000, providerLevel);
    const baseline = engine.calculate(make());
    assert.notEqual(baseline.supported, false, baseline.reason);
    for (const stat of ["atk", "hp", "def"]) {
        const profile = { ...lukaProfiles[0], [stat]: lukaProfiles[0][stat] * 1.217 + 81.25 };
        const result = engine.calculate(make(profile));
        assertClose(result.expected / baseline.expected, stat === "atk" ? profile.atk / lukaProfiles[0].atk : 1, "whole realized action isolates " + stat);
    }
    const changedProvider = engine.calculate(make(lukaProfiles[0], 3));
    assert.notEqual(changedProvider.expected, baseline.expected, "independent provider trace level changes total");
    assertClose(changedProvider.components.punches.breakdown.multiplierPercent, baseline.components.punches.breakdown.multiplierPercent, "provider does not change owner normal curve");
    assertClose(changedProvider.components.bleed.breakdown.multiplierPercent, baseline.components.bleed.breakdown.multiplierPercent, "provider does not change owner talent curve");
    const invalid = [
        r => { delete r.attack.realizedExtraPunches; },
        r => { r.attack.realizedExtraPunches = 1.5; },
        r => { r.attack.realizedExtraPunches = -1; },
        r => { r.attack.realizedExtraPunches = 4; },
        r => { delete r.attack.ownBleed; },
        r => { r.attack.ownBleed = "true"; },
        r => { r.sequenceComponents.pop(); },
        r => { r.attack.ownBleed = false; },
        r => { r.sequenceComponents[0].input.attack.hitCount = 3; },
        r => { r.sequenceComponents[0].input.attack.traceLevel = 7; },
        r => { r.sequenceComponents[0].input.attack.multiplier += 1; },
        r => { r.sequenceComponents[2].input.attack.multiplier += 1; },
        r => { r.sequenceComponents[1].input.attack.traceLevel = 3; },
        r => { r.sequenceComponents[2].input.attack.traceLevel = 11; },
        r => { r.sequenceComponents[2].input.attack.formulaTraceLevel = 0; },
        r => { r.sequenceComponents[2].input.attack.atkCapPercent += 1; },
        r => { r.sequenceComponents[2].input.attack.enemyHpPercent = 25; },
        r => { r.sequenceComponents[2].input.attack.canCrit = true; },
        r => { r.sequenceComponents[2].input.attack.id = "1111061"; },
        r => { r.sequenceComponents[0].input.modifiers.push({ id: "progressive", category: "progressiveTakenDamage", value: 12, enabled: true, applicable: true }); },
        r => { r.sequenceComponents[0].input.character.stats.atk += 1; },
        r => { r.sequenceComponents[1].input.enemy.resistance += 1; },
        r => { r.character.eidolon = 1; },
        r => { r.character.level = 79; },
        r => { r.enemy.count = 2; },
        r => { r.enemy.weakness = true; },
        r => { r.enemy.toughnessActive = false; }
    ];
    invalid.forEach((mutate, index) => {
        const request = JSON.parse(JSON.stringify(make()));
        mutate(request);
        assert.equal(engine.calculate(request).supported, false, "invalid realized full action " + index + " must not return partial sum");
    });
    const noBleed = lukaSequence(data, 4, NaN, NaN, 2, false);
    assert.notEqual(engine.calculate(noBleed).supported, false, "no-Bleed action does not depend on absent Skill/Talent levels");
    noBleed.sequenceComponents.push(JSON.parse(JSON.stringify(make().sequenceComponents[2])));
    assert.equal(engine.calculate(noBleed).supported, false, "no-Bleed state rejects an extra detonation");
});



function ruanAdditionalInput(data, id, level, breakEffect = 213.375, maxToughness = 300, providerLevel = 4) {
    const record = data.specialBreakAttacks.find(a => a.id === id);
    const input = ruanInput(data, record, level, breakEffect, maxToughness, providerLevel);
    input.character.id = "1303";
    input.enemy.weakness = false;
    input.attack = { ...record, breakEvent: "additional", traceLevel: level, multiplier: record.multipliers[level - 1] };
    return input;
}

test("batch4 Ruan Mei additional-break event works on non-Ice weakness and preserves the separate initial-break guard", async () => {
    const { data, engine } = await loadProductionFixture();
    assert.equal(typeof engine.calculateAdditionalBreak, "function");
    for (const [id, curve] of [["1303041", talentBreak], ["1303031", rebloomBreak]]) for (let level = 1; level <= 10; level++) for (const breakEffect of [0, 183.75, 341.125]) for (const maxToughness of [30, 300, 480]) for (const providerLevel of [2, 9]) for (const toughnessActive of [false, true]) {
        const input = ruanAdditionalInput(data, id, level, breakEffect, maxToughness, providerLevel);
        input.enemy.toughnessActive = toughnessActive;
        const result = engine.calculateAdditionalBreak(input);
        assert.equal(result.supported, true, id + " explicit additional event is independent of current Ice weakness/broken flags: " + result.reason);
        assertClose(result.value, breakOracle(input, curve[level - 1], fieldPenetration[providerLevel - 1]), id + " additional event oracle Lv" + level);
        assert.equal("crit" in result, false);
        assert.equal("expected" in result, false);
        assert.equal(engine.calculateBreak(input).supported, false, "initial Ice break still requires Ice weakness");
        const nativeIceWeak = engine.calculateAdditionalBreak({ ...input, enemy: { ...input.enemy, weakness: true } });
        assertClose(nativeIceWeak.value, result.value, "Ice weakness alone cannot alter an explicit additional event");
    }
});

test("batch4 Ruan Mei additional break validates event ownership, pinned trace coefficients and complete final inputs", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const id of ["1303041", "1303031"]) {
        const make = () => ruanAdditionalInput(data, id, 7);
        const baseline = engine.calculateAdditionalBreak(make());
        assert.equal(baseline.supported, true);
        for (const stat of ["atk", "hp", "def", "critRate", "critDamage", "damageBonus"]) {
            const changed = make(); changed.character.stats[stat] += 1000.25;
            assertClose(engine.calculateAdditionalBreak(changed).value, baseline.value, "additional event ignores owner " + stat);
        }
        const changedBE = make(); changedBE.character.stats.breakEffect = 317.125;
        assertClose(engine.calculateAdditionalBreak(changedBE).value / baseline.value, 4.17125 / 3.13375, "additional event uses provider BE");
        const wrong = [
            r => { r.character.id = "1309"; },
            r => { r.attack.characterId = "1309"; },
            r => { r.character.level = 79; },
            r => { r.character.eidolon = 1; },
            r => { r.enemy.count = 2; },
            r => { r.enemy.maxToughness = 0; },
            r => { r.enemy.maxToughness = NaN; },
            r => { r.attack.id = "130301"; },
            r => { r.attack.sourceSkillId = "130301"; },
            r => { r.attack.type = "dot"; },
            r => { r.attack.element = "Fire"; },
            r => { r.attack.traceLevel = 0; },
            r => { r.attack.traceLevel = 11; },
            r => { r.attack.traceLevel = 1.5; },
            r => { r.attack.multiplier += 1; },
            r => { delete r.attack.breakEvent; },
            r => { r.attack.breakEvent = "initial"; },
            r => { r.character.stats.breakEffect = NaN; },
            r => { r.character.stats.breakEffect = -1; },
            r => { r.breakBaseDamage = {}; }
        ];
        wrong.forEach((mutate, index) => {
            const request = make(); mutate(request);
            assert.equal(engine.calculateAdditionalBreak(request).supported, false, id + " refuses invalid event " + index);
        });
        const irrelevant = ["damageBonus", "dotDamage", "critRate", "critDamage", "statPercent", "statFlat", "breakEfficiency"].map((category, index) => ({ id: "additional-irrelevant-" + index, category, stat: "atk", value: 77.5, enabled: true, applicable: true }));
        const input = make(); input.modifiers.push(...irrelevant);
        const withIrrelevant = engine.calculateAdditionalBreak(input);
        assertClose(withIrrelevant.value, baseline.value, "normal damage categories cannot enter additional break");
        assert.equal(withIrrelevant.applied.some(m => m.id.startsWith("additional-irrelevant-")), false);
    }
});

test("batch4 Ruan Mei E0 Basic uses ATK and crit independently across every adopted level with own field and party support", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "130301");
    const curve = [50, 60, 70, 80, 90, 100];
    assert.deepEqual(Array.from(attack.multipliers).slice(0, 6), curve);
    for (let level = 1; level <= 6; level++) for (const profile of lukaProfiles) for (const providerLevel of [3, 9]) {
        const native = ruanInput(data, data.specialBreakAttacks.find(a => a.id === "1303041"), 1, 213.375, 300, providerLevel).modifiers[0];
        const robinRecord = data.structuredModifiers.find(m => m.id === "trace:1309:130902:party-damage");
        const robin = runtime.buildCandidates([robinRecord], { characterId: "1303", partyIds: ["1309"], partyEidolons: { "1309": 0 }, eidolon: 0, traceLevelFor: () => providerLevel }, { "robin-skill-damage-active": true })[0];
        assert.ok(robin?.enabled);
        const input = makeRequest(attack, level, profile, [native, robin]);
        const expected = independentDirectDamage({ ...input, attack: { scalingStat: "atk", multiplier: curve[level - 1], canCrit: true }, modifiers: [{ category: "resistancePenetration", value: fieldPenetration[providerLevel - 1] }, { category: "damageBonus", value: robinCurve[providerLevel - 1] }] });
        const result = engine.calculate(input);
        assert.notEqual(result.supported, false);
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], expected[key], "Ruan Basic Lv" + level + " " + key);
        for (const stat of ["atk", "hp", "def"]) {
            const changed = { ...input, character: { ...input.character, stats: { ...input.character.stats, [stat]: profile[stat] + 1000.25 } } };
            assertClose(engine.calculate(changed).expected / result.expected, stat === "atk" ? (profile.atk + 1000.25) / profile.atk : 1, "Ruan Basic isolates " + stat);
        }
    }
});
