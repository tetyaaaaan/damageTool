"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fixedSourceSha, loadProductionFixture, attackOf, makeRequest, runtime, independentDirectDamage, assertClose } = require("./helpers/hsrDirectVerification.cjs");

// Hand-transcribed 2026-10-26 from both index_new/jp and index_new/en at
// StarRailRes dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487:
// character_skills.json, character_skill_trees.json, character_ranks.json.
// Execution-order cross-checks: https://hsr.keqingmains.com/q/moze-quickguide/
// https://srl.keqingmains.com/characters/quantum/xueyi
// https://srl.keqingmains.com/characters/physical/luka
// An independently verified component is not certification of a whole action.
const basic = [50, 60, 70, 80, 90, 100];
const xueyiSkill = [70, 77, 84, 91, 98, 105, 113.75, 122.5, 131.25, 140];
const xueyiAdjacent = [35, 38.5, 42, 45.5, 49, 52.5, 56.87, 61.25, 65.62, 70];
const xueyiTalent = [45, 49.5, 54, 58.5, 63, 67.5, 73.12, 78.75, 84.38, 90];
const mozeSkill = [75, 82.5, 90, 97.5, 105, 112.5, 121.88, 131.25, 140.62, 150];
const mozeUltimate = [162, 172.8, 183.6, 194.4, 205.2, 216, 229.5, 243, 256.5, 270];
const mozeAdditional = [15, 16.5, 18, 19.5, 21, 22.5, 24.37, 26.25, 28.12, 30];
const mozeFollowUp = [80, 88, 96, 104, 112, 120, 130, 140, 150, 160];
const lukaSkill = [60, 66, 72, 78, 84, 90, 97.5, 105, 112.5, 120];
const lukaUltimate = [198, 211.2, 224.4, 237.6, 250.8, 264, 280.5, 297, 313.5, 330];
const lukaPunch = [10, 12, 14, 16, 18, 20];
const lukaUppercut = [40, 48, 56, 64, 72, 80];
const lukaBleedCap = [130, 143, 156, 169, 182, 201.5, 227.5, 260, 299, 338];
const lukaDetonation = [68, 69.7, 71.4, 73.1, 74.8, 76.5, 78.63, 80.75, 82.87, 85];
const lukaVulnerability = [12, 12.8, 13.6, 14.4, 15.2, 16, 17, 18, 19, 20];
const robinSkill = [25, 27.5, 30, 32.5, 35, 37.5, 40.62, 43.75, 46.88, 50];
const profiles = [
    { atk: 3123.5, hp: 9876.25, def: 2345.75, baseAtk: 1140.25, baseHp: 903.5, baseDef: 712.75, critRate: 37.5, critDamage: 83.25, damageBonus: 11.5, enemyLevel: 82, resistance: 27.5, defenseReduction: 17, defenseIgnore: 6, takenDamage: 12.5, toughnessActive: true },
    { atk: 2678.125, hp: 12345.5, def: 1987.25, baseAtk: 973.5, baseHp: 1812.5, baseDef: 1288.75, critRate: 71.25, critDamage: 142.75, damageBonus: 46.25, enemyLevel: 95, resistance: 5, resistancePenetration: 8.5, toughnessActive: false }
];

function candidate(data, id, owner, level, inputs = {}, attack, party = false) {
    const record = data.structuredModifiers.find(m => m.id === id);
    assert.ok(record, id);
    const context = { characterId: party ? "1214" : owner, partyIds: party ? [owner] : [], partyEidolons: { [owner]: 0 }, eidolon: 0, traceLevelFor: source => String(source.id) === owner ? level : 1 };
    const result = runtime.buildCandidates([record], context, inputs)[0];
    assert.ok(result, id + " selected");
    return { ...result, applicable: result.applicable !== false && (!attack || runtime.applicableToAttack(result, attack)) };
}
function partyBuff(data, attack, level) {
    const record = data.structuredModifiers.find(m => m.id === "trace:1309:130902:party-damage");
    const result = runtime.buildCandidates([record], { characterId: attack.characterId, partyIds: ["1309"], partyEidolons: { "1309": 0 }, eidolon: 0, traceLevelFor: () => level }, { "robin-skill-damage-active": true })[0];
    assert.ok(result?.enabled, "real Robin party Skill is active");
    assertClose(result.value, robinSkill[level - 1], "independent Robin source level");
    return { ...result, applicable: runtime.applicableToAttack(result, attack) };
}
function oracle(engine, input, coefficient, count, literalMods = [], canCrit = true, label = "component") {
    const expected = independentDirectDamage({ ...input, attack: { scalingStat: "atk", multiplier: coefficient, canCrit }, modifiers: literalMods });
    const actual = engine.calculate(input);
    assert.notEqual(actual.supported, false, label + " supported: " + actual.reason);
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key] * count, label + " " + key);
    return actual;
}
function explicitState(attack) {
    return { ...(attack.comparisonModifierInputs || {}), "luka-fighting-will-stacks": 2, "luka-enemy-bleeding": true };
}

test("batch3 Xueyi, Moze and Luka independently match every adopted E0 direct-component level", async () => {
    assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
    const { data, engine } = await loadProductionFixture();
    const specs = [
        ["121401", basic, 1], ["121402", xueyiSkill, 1], ["121404", xueyiTalent, 3],
        ["122301", basic, 1], ["122302", mozeSkill, 1], ["122303", mozeUltimate, 1],
        ["122304", mozeAdditional, 1], ["1223041", mozeFollowUp, 1],
        ["111101", basic, 1], ["111102", lukaSkill, 1],
        ["111103", lukaUltimate, 1], ["1111081", lukaPunch, 3], ["1111082", lukaUppercut, 1]
    ];
    for (const [id, curve, count] of specs) {
        const attack = attackOf(data, id);
        assert.equal(attack.support.status, "calculable", id);
        assert.equal(attack.scalingStat, "atk", id);
        assert.equal(attack.canCrit, true, id);
        assert.equal(attack.hitCount, count, id + " complete direct hit count");
        assert.deepEqual(Array.from(attack.multipliers).slice(0, curve.length), curve, id + " independent pinned curve");
        for (let level = 1; level <= curve.length; level++) for (const profile of profiles) for (const withParty of [false, true]) {
            const mods = withParty ? [partyBuff(data, attack, level > 6 ? level : 7)] : [];
            const literal = withParty ? [{ category: "damageBonus", value: robinSkill[(level > 6 ? level : 7) - 1] }] : [];
            const input = makeRequest(attack, level, profile, mods);
            input.modifierInputs = explicitState(attack);
            const baseline = oracle(engine, input, curve[level - 1], count, literal, true, id + " Lv" + level);
            for (const stat of ["atk", "hp", "def"]) {
                const changed = { ...input, character: { ...input.character, stats: { ...input.character.stats, [stat]: input.character.stats[stat] * 1.217 + 83.375 } } };
                const result = oracle(engine, changed, curve[level - 1], count, literal, true, id + " only " + stat);
                if (stat === "atk") assert.notEqual(result.expected, baseline.expected, id + " owner ATK responds");
                else assertClose(result.expected, baseline.expected, id + " ignores unrelated " + stat);
            }
        }
    }
    const skill = attackOf(data, "121402");
    assert.deepEqual(Array.from(skill.adjacentMultipliers).slice(0, 10), xueyiAdjacent, "Xueyi adjacent coefficient is independent, including rounded Lv7/Lv9");
    for (let level = 1; level <= 10; level++) for (const profile of profiles) {
        const input = makeRequest(skill, level, profile);
        input.attack = { ...input.attack, target: "adjacent", multiplier: skill.adjacentMultipliers[level - 1] };
        oracle(engine, input, xueyiAdjacent[level - 1], 1, [], true, "Xueyi adjacent Lv" + level);
    }
});

test("batch3 Luka own-Bleed and detonation use independent Skill and Talent levels on both sides of the HP cap", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const id of ["1111021", "1111071", "1111041"]) {
        const attack = attackOf(data, id);
        assert.equal(attack.damageFormula, "enemyHpCappedByAtk");
        assert.equal(attack.formulaTraceKey, "skill");
        assert.equal(attack.canCrit, false);
        assert.deepEqual(Array.from(attack.atkCapMultipliers).slice(0, 10), lukaBleedCap);
        assert.deepEqual(Array.from(attack.enemyHpPercentMultipliers).slice(0, 10), Array(10).fill(24));
        if (id === "1111041") assert.deepEqual(Array.from(attack.multipliers).slice(0, 10), lukaDetonation);
        for (let skillLevel = 1; skillLevel <= 10; skillLevel++) for (let talentLevel = 1; talentLevel <= (id === "1111041" ? 10 : 1); talentLevel++) {
            const level = id === "1111041" ? talentLevel : skillLevel;
            const coefficient = id === "1111041" ? lukaDetonation[talentLevel - 1] : 100;
            for (const profile of profiles) for (const enemyMaxHp of [1000, 1000000]) for (const withParty of [false, true]) {
                const mods = withParty ? [partyBuff(data, attack, 10)] : [];
                const input = makeRequest(attack, level, profile, mods);
                input.enemy.maxHp = enemyMaxHp;
                input.attack = { ...input.attack, enemyHpPercent: attack.enemyHpPercentMultipliers[skillLevel - 1], atkCapPercent: attack.atkCapMultipliers[skillLevel - 1] };
                input.modifierInputs = explicitState(attack);
                const expectedBase = Math.min(enemyMaxHp * .24, profile.atk * lukaBleedCap[skillLevel - 1] / 100);
                const oracleInput = { ...input, character: { ...input.character, stats: { ...input.character.stats, atk: expectedBase } } };
                const expected = independentDirectDamage({ ...oracleInput, attack: { scalingStat: "atk", multiplier: coefficient, canCrit: false }, modifiers: withParty ? [{ category: "damageBonus", value: 50 }] : [] });
                const result = engine.calculate(input);
                assert.notEqual(result.supported, false, id);
                for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], expected[key], id + " Skill" + skillLevel + "/Talent" + talentLevel + " " + key);
                assertClose(result.breakdown.cappedEnemyHpDamage, expectedBase, "HP cap before damage and detonation factors");
                for (const stat of ["atk", "hp", "def"]) {
                    const newAtk = profile.atk * 1.3 + 111;
                    const changed = { ...input, character: { ...input.character, stats: { ...input.character.stats, [stat]: stat === "atk" ? newAtk : input.character.stats[stat] + 1000 } } };
                    const changedBase = Math.min(enemyMaxHp * .24, (stat === "atk" ? newAtk : profile.atk) * lukaBleedCap[skillLevel - 1] / 100);
                    const actual = engine.calculate(changed);
                    assertClose(actual.nonCrit / result.nonCrit, changedBase / expectedBase, id + " independent " + stat + " isolation");
                }
            }
        }
    }
});

test("batch3 Luka successful Ultimate vulnerability precedes its hit and benefits teammates at every independent provider level", async () => {
    const { data, engine } = await loadProductionFixture();
    for (let providerLevel = 1; providerLevel <= 10; providerLevel++) for (const party of [false, true]) {
        const attack = attackOf(data, party ? "121401" : "111103");
        const active = candidate(data, "trace:1111:111103:damage-taken", "1111", providerLevel, { "luka-ultimate-vulnerability": true }, attack, party);
        const off = candidate(data, "trace:1111:111103:damage-taken", "1111", providerLevel, {}, attack, party);
        assert.equal(active.providerId, "1111");
        assert.equal(active.enabled, true);
        assert.equal(off.enabled, false, "debuff success is explicit");
        assertClose(active.value, lukaVulnerability[providerLevel - 1], "pinned vulnerability curve");
        for (let attackLevel = 1; attackLevel <= (party ? 6 : 10); attackLevel++) {
            const input = makeRequest(attack, attackLevel, profiles[0], [active, partyBuff(data, attack, 9)]);
            input.modifierInputs = explicitState(attack);
            oracle(engine, input, (party ? basic : lukaUltimate)[attackLevel - 1], 1, [{ category: "takenDamage", value: lukaVulnerability[providerLevel - 1] }, { category: "damageBonus", value: 46.88 }], true, "Luka independent vulnerability Lv" + providerLevel);
        }
    }
});

test("batch3 saved calculation snapshots preserve independent trace levels and realized state without filling missing values", async () => {
    const snapshots = require("../../games/js/hsrCalcState.js");
    const { data } = await loadProductionFixture();
    const state = {
        characterId: "1111", coneId: "", relicId: "", relicSecondId: "", relicMode: "4pc", ornamentId: "", level: 80, eidolon: 0,
        enhancementState: "enhanced", coneLevel: 80, coneRank: 1, partySp: 3, attackerPosition: 1,
        traceLevels: { normal: 3, skill: 7, ultimate: 2, talent: 9 }, source: "manual",
        stats: { atk: 3123.5, hp: 9876.25, def: 2345.75, damageBonus: 11.5, critRate: 37.5, critDamage: 83.25 },
        trueDamageInputs: {}, elationInputs: {}, songbirdInputs: {}, breakInputs: {}, party: [], enemyId: "custom",
        enemy: { level: 82, maxHp: 1000000, resistance: 27.5, weakness: false, toughnessActive: true, maxToughness: 300, hpPercent: 100, count: 1, debuffCount: 1, defenseReduction: 17, defenseIgnore: 6, resistancePenetration: 0, takenDamage: 12.5 },
        modifierInputs: { "luka-fighting-will-stacks": 2, "luka-enemy-bleeding": true, "luka-ultimate-vulnerability": false }, conditions: []
    };
    for (const characterId of ["1111", "1214", "1223"]) {
        const current = { ...state, characterId };
        const encoded = JSON.parse(JSON.stringify(snapshots.create(current)));
        const restored = snapshots.restore(encoded, current, data, []);
        assert.ok(restored);
        assert.deepEqual(restored.state.traceLevels, { normal: 3, skill: 7, ultimate: 2, talent: 9 });
        assert.deepEqual(restored.state.modifierInputs, current.modifierInputs);
        assert.equal(restored.state.enemy.maxHp, 1000000);
        assert.equal(restored.state.stats.atk, 3123.5);
        encoded.state.traceLevels.skill = null;
        encoded.modifierInputs["luka-fighting-will-stacks"] = null;
        const unknown = snapshots.restore(encoded, current, data, []);
        assert.equal(Number.isNaN(unknown.state.traceLevels.skill), true, "explicit unknown Skill level stays unknown");
        assert.equal(Number.isNaN(unknown.state.modifierInputs["luka-fighting-will-stacks"]), true, "unknown realized state stays unknown");
        assert.equal(unknown.state.traceLevels.talent, 9, "missing Skill input cannot overwrite Talent level");
    }
});

test("batch3 Xueyi A2 conversion stays in final damage input and the three-hit follow-up is not a one-hit coefficient", async () => {
    const { data, engine } = await loadProductionFixture();
    const record = data.structuredModifiers.find(m => m.source?.id === "1214" && m.source?.traceId === "1214101");
    assert.ok(record, "A2 conversion has an explicit final-stat record");
    assert.equal(record.inputPolicy, "includedInFinalStats");
    assert.equal(record.support.status, "displayOnly");
    const talent = attackOf(data, "121404");
    assert.equal(talent.type, "followUp");
    assert.equal(talent.hitCount, 3);
    assert.equal(talent.enemyCountExact, 1, "random allocation is only certain with one enemy");
    for (const breakEffect of [0, 100, 239.5, 240, 350]) {
        const convertedDamage = Math.min(breakEffect, 240);
        const final = { ...profiles[0], damageBonus: profiles[0].damageBonus + convertedDamage };
        const candidates = runtime.buildCandidates([record], { characterId: "1214", eidolon: 0, stats: { breakEffect }, traceLevelFor: () => 1 }, {});
        assert.equal(candidates.length, 1);
        assert.equal(candidates[0].enabled, false, "input already includes A2 conversion");
        assert.equal(candidates[0].displayOnly, true);
        for (let level = 1; level <= 10; level++) {
            const input = makeRequest(talent, level, final, candidates);
            input.character.stats.breakEffect = breakEffect;
            input.modifierInputs = explicitState(talent);
            const result = oracle(engine, input, xueyiTalent[level - 1], 3, [], true, "Xueyi final DMG + A2 Lv" + level);
            const withoutRecord = engine.calculate({ ...input, modifiers: [] });
            assertClose(result.nonCrit, withoutRecord.nonCrit, "A2 is not added twice");
            const unrelatedBreakEffect = engine.calculate({ ...input, character: { ...input.character, stats: { ...input.character.stats, breakEffect: breakEffect + 1000 } } });
            assertClose(unrelatedBreakEffect.nonCrit, result.nonCrit, "final damage input is not rebuilt from current BE");
        }
    }
});

test("batch3 Moze A6 classifies Ultimate body and Talent follow-up separately from Additional DMG", async () => {
    const { data, engine } = await loadProductionFixture();
    const record = data.structuredModifiers.find(m => m.source?.id === "1223" && m.source?.traceId === "1223103" && m.category === "takenDamage");
    assert.ok(record, "Moze A6 Prey follow-up vulnerability is registered");
    assert.equal(record.value.fixed, 25);
    assert.ok(record.activation.inputKey, "Prey state is explicit");
    const ids = ["122301", "122302", "122303", "122304", "1223041"];
    const curves = [basic, mozeSkill, mozeUltimate, mozeAdditional, mozeFollowUp];
    assert.equal(attackOf(data, "122304").type, "additional");
    assert.equal(attackOf(data, "1223041").type, "followUp");
    const ultimate = attackOf(data, "122303");
    assert.ok(ultimate.type === "ultimate" || ultimate.tags?.includes("ultimate"), "Ultimate damage tag is retained");
    assert.ok(ultimate.type === "followUp" || ultimate.tags?.includes("followUp"), "A6 also classifies Ultimate body as follow-up");
    for (let index = 0; index < ids.length; index++) {
        const attack = attackOf(data, ids[index]);
        const receivesVulnerability = ["122303", "1223041"].includes(attack.id);
        for (const prey of [false, true]) {
            const inputs = { [record.activation.inputKey]: prey };
            const candidate = runtime.buildCandidates([record], { characterId: "1223", eidolon: 0, traceLevelFor: () => 1 }, inputs)[0];
            assert.ok(candidate);
            assert.equal(candidate.enabled, prey);
            assert.equal(runtime.applicableToAttack(candidate, attack), prey && receivesVulnerability, attack.id + " active follow-up scope");
            const scoped = { ...candidate, applicable: candidate.applicable !== false && runtime.applicableToAttack(candidate, attack) };
            for (let level = 1; level <= curves[index].length; level++) {
                const party = partyBuff(data, attack, 7);
                const input = makeRequest(attack, level, profiles[0], [scoped, party]);
                input.modifierInputs = { ...explicitState(attack), ...inputs };
                oracle(engine, input, curves[index][level - 1], 1, [{ category: "takenDamage", value: prey && receivesVulnerability ? 25 : 0 }, { category: "damageBonus", value: 40.62 }], true, attack.id + " Prey=" + prey + " Lv" + level);
            }
        }
    }
    for (const type of ["normal", "skill", "followUp", "additional"]) {
        const attack = { ...attackOf(data, "121401"), id: "party-type-" + type, type, attackType: type, tags: [] };
        const context = { characterId: "1214", partyIds: ["1223"], partyEidolons: { "1223": 0 }, eidolon: 0, traceLevelFor: () => 10 };
        const native = runtime.buildCandidates([record], context, { [record.activation.inputKey]: true })[0];
        assert.ok(native, "party receives enemy vulnerability");
        assert.equal(native.providerId, "1223");
        const scoped = { ...native, applicable: runtime.applicableToAttack(native, attack) };
        const input = makeRequest(attack, 1, profiles[1], [scoped]);
        oracle(engine, input, 50, 1, [{ category: "takenDamage", value: type === "followUp" ? 25 : 0 }], true, "Moze party " + type);
    }
});

test("batch3 Moze Technique damage bonus is native, explicit, and combines once with party support", async () => {
    const { data, engine } = await loadProductionFixture();
    const record = data.structuredModifiers.find(m => m.source?.id === "1223" && m.source?.skillId === "122307" && m.category === "damageBonus");
    assert.ok(record, "Technique has its own realized-duration state");
    assert.equal(record.value.fixed, 30);
    assert.ok(record.activation.inputKey);
    for (const id of ["122301", "122302", "122303", "122304", "1223041"]) {
        const attack = attackOf(data, id);
        const curve = id === "122301" ? basic : id === "122302" ? mozeSkill : id === "122303" ? mozeUltimate : id === "122304" ? mozeAdditional : mozeFollowUp;
        for (const active of [false, true]) {
            const native = runtime.buildCandidates([record], { characterId: "1223", eidolon: 0, traceLevelFor: () => 1 }, { [record.activation.inputKey]: active })[0];
            assert.equal(native.enabled, active);
            for (let level = 1; level <= curve.length; level++) {
                const input = makeRequest(attack, level, profiles[0], [native, partyBuff(data, attack, 10)]);
                input.modifierInputs = { ...explicitState(attack), [record.activation.inputKey]: active };
                oracle(engine, input, curve[level - 1], 1, [{ category: "damageBonus", value: 50 + (active ? 30 : 0) }], true, "Moze technique " + id + " Lv" + level);
            }
        }
    }
    const party = runtime.buildCandidates([record], { characterId: "1214", partyIds: ["1223"], eidolon: 0 }, { [record.activation.inputKey]: true });
    assert.deepEqual(party, [], "Technique bonus remains Moze's own damage");
});

function mozeSkillSequence(data, skillLevel, talentLevel, profile, nativeActive = false, providerLevel = 9, skillOnlyActive = true) {
    const parent = attackOf(data, "1223021");
    const bodyRecord = attackOf(data, "122302");
    const additionalRecord = attackOf(data, "122304");
    const common = makeRequest(parent, skillLevel, { ...profile, toughnessActive: true, weakness: false, enemyCount: 1 });
    const technique = data.structuredModifiers.find(m => m.source?.id === "1223" && m.source?.skillId === "122307" && m.category === "damageBonus");
    assert.ok(technique);
    const native = runtime.buildCandidates([technique], { characterId: "1223", eidolon: 0, traceLevelFor: () => 1 }, { [technique.activation.inputKey]: nativeActive })[0];
    const skillOnlyRecord = data.structuredModifiers.find(m => m.id === "lightCone:23048:party-skill-damage");
    assert.ok(skillOnlyRecord);
    const skillOnly = runtime.buildCandidates([skillOnlyRecord], {
        characterId: "1223", eidolon: 0, partyIds: ["1309"],
        partyEquipment: [{ characterId: "1309", lightConeId: "23048", refinement: 1 }]
    }, { "lc-23048-party-skill-active": skillOnlyActive })[0];
    assert.ok(skillOnly);
    assertClose(skillOnly.value, 54, "independent S1 party Skill-only bonus");
    function child(record, level) {
        const attack = { ...record, damageFormula: "statMultiplier", attackType: record.type, traceLevel: level, multiplier: record.multipliers[level - 1] };
        return { ...common, attack, modifiers: [native, partyBuff(data, attack, providerLevel), skillOnly], modifierInputs: { ...explicitState(record), [technique.activation.inputKey]: nativeActive } };
    }
    const skill = child(bodyRecord, skillLevel);
    const additional = child(additionalRecord, talentLevel);
    const request = {
        ...common, modifierInputs: { ...explicitState(parent), [technique.activation.inputKey]: nativeActive },
        sequenceComponents: [
            { key: "skill", name: parent.damageComponents[0].name, input: skill },
            { key: "additional", name: parent.damageComponents[1].name, input: additional }
        ]
    };
    return { request, skill, additional };
}

test("batch3 Moze full fresh-Prey Skill independently composes every Skill and Talent level with separate damage buckets", async () => {
    const { data, engine } = await loadProductionFixture();
    const parent = attackOf(data, "1223021");
    assert.equal(parent.support.status, "calculable");
    assert.equal(parent.damageFormula, "componentSequence");
    assert.equal(parent.provenance.sourceCommit, fixedSourceSha);
    assert.deepEqual(Array.from(parent.damageComponents, c => [c.key, c.attackId]), [["skill", "122302"], ["additional", "122304"]]);
    for (let skillLevel = 1; skillLevel <= 10; skillLevel++) for (let talentLevel = 1; talentLevel <= 10; talentLevel++) {
        for (const profile of profiles) for (const nativeActive of [false, true]) for (const providerLevel of [3, 9]) {
            const all = mozeSkillSequence(data, skillLevel, talentLevel, profile, nativeActive, providerLevel);
            const commonBonus = (nativeActive ? 30 : 0) + robinSkill[providerLevel - 1];
            const bodyOracle = independentDirectDamage({ ...all.skill, attack: { scalingStat: "atk", multiplier: mozeSkill[skillLevel - 1], canCrit: true }, modifiers: [{ category: "damageBonus", value: commonBonus + 54 }] });
            const additionalOracle = independentDirectDamage({ ...all.additional, attack: { scalingStat: "atk", multiplier: mozeAdditional[talentLevel - 1], canCrit: true }, modifiers: [{ category: "damageBonus", value: commonBonus }] });
            const result = engine.calculate(all.request);
            const label = "Moze Skill" + skillLevel + "/Talent" + talentLevel + "/provider" + providerLevel + "/native" + nativeActive;
            assert.notEqual(result.supported, false, label + ": " + result.reason);
            for (const key of ["nonCrit", "crit", "expected"]) {
                assertClose(result.components.skill[key], bodyOracle[key], label + " body " + key);
                assertClose(result.components.additional[key], additionalOracle[key], label + " Additional " + key);
                assertClose(result[key], bodyOracle[key] + additionalOracle[key], label + " total " + key);
            }
            assertClose(result.components.skill.breakdown.damageBonus, profile.damageBonus + commonBonus + 54, "Skill-only bonus enters body bucket");
            assertClose(result.components.additional.breakdown.damageBonus, profile.damageBonus + commonBonus, "Skill-only bonus is absent from Additional bucket");
            assert.equal(result.components.additional.applied.some(m => m.id === "lightCone:23048:party-skill-damage"), false, "Skill-only support cannot leak into Additional DMG");
        }
    }
});

test("batch3 Moze full Skill responds independently to owner ATK and provider level and rejects incomplete or mismatched components", async () => {
    const { data, engine } = await loadProductionFixture();
    const profile = { ...profiles[0], toughnessActive: true };
    const make = (stats = profile, skillLevel = 4, talentLevel = 8, providerLevel = 9) => mozeSkillSequence(data, skillLevel, talentLevel, stats, true, providerLevel).request;
    const baseline = engine.calculate(make());
    assert.notEqual(baseline.supported, false, baseline.reason);
    for (const stat of ["atk", "hp", "def"]) {
        const altered = { ...profile, [stat]: profile[stat] * 1.17 + 113.5 };
        const result = engine.calculate(make(altered));
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key] / baseline[key], stat === "atk" ? altered.atk / profile.atk : 1, "full Skill only " + stat);
    }
    const lowerProvider = engine.calculate(make(profile, 4, 8, 3));
    assert.notEqual(lowerProvider.nonCrit, baseline.nonCrit, "independently changing only party Skill Lv changes total");
    assert.equal(lowerProvider.components.skill.breakdown.multiplierPercent, baseline.components.skill.breakdown.multiplierPercent, "provider level cannot change Moze Skill coefficient");
    assert.equal(lowerProvider.components.additional.breakdown.multiplierPercent, baseline.components.additional.breakdown.multiplierPercent, "provider level cannot change Moze Talent coefficient");
    for (const mutate of [
        request => { request.sequenceComponents.pop(); },
        request => { request.sequenceComponents = []; },
        request => { request.sequenceComponents[1].input.character.stats.atk += 1; },
        request => { request.sequenceComponents[1].input.enemy.resistance += 1; },
        request => { request.sequenceComponents[1].input.attack.traceLevel = NaN; },
        request => { request.sequenceComponents[1].input.attack.traceLevel = 11; },
        request => { request.sequenceComponents[1].input.attack.type = "followUp"; },
        request => { request.sequenceComponents[0].input.attack.traceLevel = 7; },
        request => { request.enemy.count = 2; },
        request => { request.enemy.weakness = true; },
        request => { request.enemy.toughnessActive = false; },
        request => { request.character.eidolon = 1; }
    ]) {
        // Clone removes shared references so a single child mutation cannot
        // silently mutate the parent and evade the snapshot-consistency guard.
        const request = JSON.parse(JSON.stringify(make()));
        mutate(request);
        assert.equal(engine.calculate(request).supported, false, "unsupported full-Skill state does not return a partial sum");
    }
});


test("batch3 uncertain whole actions and Luka random extra punches remain distinct from verified components", async () => {
    const { data } = await loadProductionFixture();
    const xueyiUltimate = attackOf(data, "121403");
    assert.equal(xueyiUltimate.requiresBrokenTarget, true, "Round16 admits only prior-broken targets; variable toughness mapping remains unproven");
    assert.equal(xueyiUltimate.enforceSnapshotContract, true, "the partial Ultimate must reject unverified snapshots");
    const extraPunch = attackOf(data, "11111031");
    assert.equal(extraPunch.support.status, "review", "1.5 expected extra punches are not a certain realized attack");
    assert.match(extraPunch.name + " " + extraPunch.conditionText, /期待|平均|確率/, "probabilistic result is labeled");
    assert.equal(attackOf(data, "1111061").requiredEidolon, 6, "E6 extra Bleed detonation is excluded from E0");
    assert.equal(attackOf(data, "1111062").requiredEidolon, 6, "E6 random-punch detonation is excluded from E0");
    const ultimate = attackOf(data, "122303");
    assert.notEqual(ultimate.damageFormula, "componentSequence", "Moze Ultimate body is not a false complete Prey/Charge action");
});
