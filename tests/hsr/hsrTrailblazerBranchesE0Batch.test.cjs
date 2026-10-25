"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    fixedSourceSha, loadProductionFixture, attackOf, makeRequest,
    runtime, independentDirectDamage, assertClose
} = require("./helpers/hsrDirectVerification.cjs");

// Independently transcribed from character_skills.json at this immutable SHA.
// The upstream JSON was fetched in memory; production overrides are not the oracle.
const sourceSha = "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487";
const normal = [50, 60, 70, 80, 90, 100];
const preservation = {
    "01": { type: "normal", target: "single", values: normal, hits: 1 },
    "08": { type: "enhancedNormal", target: "blast", values: [90, 99, 108, 117, 126, 135], adjacent: [36, 39.6, 43.2, 46.8, 50.4, 54], hits: 1 },
    "03": { type: "ultimate", target: "aoe", values: [50, 55, 60, 65, 70, 75, 81.25, 87.5, 93.75, 100], def: [75, 82.5, 90, 97.5, 105, 112.5, 121.88, 131.25, 140.62, 150], hits: 1 }
};
const harmony = {
    "01": { type: "normal", target: "single", values: normal, hits: 1 },
    "02": { type: "skill", target: "bounce", values: [25, 27.5, 30, 32.5, 35, 37.5, 40.62, 43.75, 46.88, 50], hits: 5 }
};
const ultimateBreakEffect = [15, 16.5, 18, 19.5, 21, 22.5, 24.37, 26.25, 28.12, 30];
const profiles = [
    { characterLevel: 80, eidolon: 0, enemyCount: 1,
      atk: 3287.25, hp: 7421.5, def: 1198.75, baseAtk: 991.5, baseHp: 1400.25, baseDef: 1100.75,
      critRate: 37.5, critDamage: 121.75, damageBonus: 27.75, enemyLevel: 88, resistance: 20,
      resistancePenetration: 3.25, defenseReduction: 7.5, defenseIgnore: 2.5, takenDamage: 0, weakness: false, toughnessActive: true },
    { characterLevel: 80, eidolon: 0, enemyCount: 1,
      atk: 2211.75, hp: 5809.25, def: 3517.125, baseAtk: 1173.25, baseHp: 903.5, baseDef: 1288.75,
      critRate: 62.25, critDamage: 73.5, damageBonus: 41.3, enemyLevel: 75, resistance: 0,
      resistancePenetration: 0, defenseReduction: 0, defenseIgnore: 0, takenDamage: 0, weakness: false, toughnessActive: false }
];

function native(data, characterId, level = 10) {
    return runtime.buildCandidates(data.structuredModifiers, {
        characterId, eidolon: 0, enemyCount: 1, traceLevelFor: () => level,
        stats: { atk: profiles[0].atk, def: profiles[0].def, hp: profiles[0].hp, breakEffect: 237.3 }
    }, {});
}
function candidate(candidates, id) {
    const found = candidates.find(item => item.id === id);
    assert.ok(found, id + " is registered");
    return found;
}
function request(attack, level, profile, modifiers = [], adjacent = false) {
    const input = makeRequest(attack, level, profile);
    input.attack.target = adjacent ? "adjacent" : attack.target;
    input.attack.multiplier = (adjacent ? attack.adjacentMultipliers : attack.multipliers)?.[level - 1];
    const components = adjacent ? attack.adjacentScalingTermComponents : attack.scalingTermComponents;
    if (components) input.attack.scalingTerms = Array.from(components, term => ({ stat: term.stat, multiplier: term.values[level - 1] }));
    input.modifiers = modifiers.map(item => ({ ...item, applicable: runtime.applicableToAttack(item, input.attack) }));
    return input;
}
function oracle(input, spec, level, adjacent = false) {
    // Build the complete base independently. The existing single-stat oracle is
    // used only for common combat factors, never for resolving production terms.
    const multiplier = (adjacent ? spec.adjacent : spec.values)[level - 1];
    const base = input.character.stats.atk * multiplier / 100
        + (spec.def ? input.character.stats.def * spec.def[level - 1] / 100 : 0);
    const synthetic = {
        ...input,
        character: { ...input.character, stats: { ...input.character.stats, atk: base } },
        attack: { ...input.attack, scalingStat: "atk", multiplier: 100 }
    };
    const result = independentDirectDamage(synthetic);
    return Object.fromEntries(["nonCrit", "crit", "expected"].map(key => [key, result[key] * spec.hits]));
}
function matches(engine, input, spec, level, label, adjacent = false) {
    const expected = oracle(input, spec, level, adjacent);
    const actual = engine.calculate(input);
    assert.notEqual(actual.supported, false, label + " calculates");
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], label + " " + key);
    return actual;
}

for (const [branch, ids, specs] of [["Preservation", ["8003", "8004"], preservation], ["Harmony", ["8005", "8006"], harmony]]) {
    test(`${branch} Trailblazer both bodies retain fixed-source E0 curves and all direct levels`, async () => {
        assert.equal(fixedSourceSha, sourceSha);
        const { data, engine } = await loadProductionFixture();
        for (const id of ids) {
            for (const [suffix, spec] of Object.entries(specs)) {
                const attack = attackOf(data, id + suffix);
                assert.equal(attack.characterId, id);
                assert.equal(attack.sourceSkillId, id + suffix);
                assert.equal(attack.support?.status, "calculable");
                assert.equal(attack.support?.verified, true);
                assert.equal(attack.provenance?.sourceCommit, sourceSha);
                assert.equal(attack.maximumEidolon, 0);
                assert.equal(attack.maximumTraceLevel, spec.values.length);
                assert.equal(attack.type, spec.type);
                assert.equal(attack.target, spec.target);
                assert.equal(attack.element, branch === "Preservation" ? "Fire" : "Imaginary");
                assert.equal(attack.hitCount, spec.hits);
                assert.notEqual(attack.canCrit, false);
                assert.deepEqual(Array.from(attack.multipliers).slice(0, spec.values.length), spec.values);
                if (spec.adjacent) assert.deepEqual(Array.from(attack.adjacentMultipliers).slice(0, 6), spec.adjacent);
                if (spec.def) {
                    assert.deepEqual(Array.from(attack.scalingTermComponents, term => term.stat), ["atk", "def"]);
                    assert.deepEqual(Array.from(attack.scalingTermComponents[0].values).slice(0, 10), spec.values);
                    assert.deepEqual(Array.from(attack.scalingTermComponents[1].values).slice(0, 10), spec.def);
                } else assert.equal(attack.scalingStat, "atk");
                for (let level = 1; level <= spec.values.length; level++) {
                    for (const [index, profile] of profiles.entries()) {
                        matches(engine, request(attack, level, profile), spec, level, `${id}${suffix} Lv${level} profile${index}`);
                        if (spec.adjacent) matches(engine, request(attack, level, profile, [], true), spec, level, `${id}${suffix} adjacent Lv${level}`, true);
                    }
                }
            }
        }
    });
}

test("Preservation enhanced Basic already owns Talent damage; A6 ATK belongs to final input", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const id of ["8003", "8004"]) {
        const own = native(data, id);
        const shieldAtk = candidate(own, `traceNode:${id}:${id}103:shield-atk`);
        assert.equal(shieldAtk.value, 15);
        assert.equal(shieldAtk.inputPolicy, "includedInFinalStats");
        assert.equal(shieldAtk.displayOnly, true);
        assert.equal(shieldAtk.enabled, false);
        assert.equal(data.attacks.some(attack => attack.id === id + "04" && attack.support?.status === "calculable"), false, "Talent is not an extra direct damage instance");
        assert.equal(own.some(item => item.source?.kind === "eidolon"), false);
        for (const [suffix, spec] of Object.entries(preservation)) {
            const attack = attackOf(data, id + suffix);
            for (let level = 1; level <= spec.values.length; level++) {
                for (const profile of profiles) {
                    for (const shieldActive of [false, true]) {
                        const completed = { ...profile, atk: profile.atk + (shieldActive ? profile.baseAtk * 0.15 : 0) };
                        const input = request(attack, level, completed, own);
                        const result = matches(engine, input, spec, level, `${id}${suffix} shield${shieldActive} Lv${level}`);
                        const withoutNative = engine.calculate(request(attack, level, completed));
                        assertClose(result.nonCrit, withoutNative.nonCrit, "native ATK is already in final input");
                        const changed = { ...input, character: { ...input.character, baseStats: { atk: 9999, hp: 8888, def: 7777 } } };
                        assertClose(engine.calculate(changed).nonCrit, result.nonCrit, "base stats cannot rebuild final ATK/DEF");
                    }
                }
            }
        }
    }
});

test("Trailblazer direct modes isolate ATK, HP, DEF and preserve native final-stat inputs", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const [ids, specs] of [[["8003", "8004"], preservation], [["8005", "8006"], harmony]]) {
        for (const id of ids) {
            const own = native(data, id);
            for (const [suffix, spec] of Object.entries(specs)) {
                const attack = attackOf(data, id + suffix), level = spec.values.length;
                const baselineInput = request(attack, level, profiles[0], own);
                baselineInput.character.stats.breakEffect = 237.3;
                const baseline = matches(engine, baselineInput, spec, level, id + suffix + " native");
                for (const stat of ["atk", "hp", "def", "breakEffect"]) {
                    const changed = { ...baselineInput, character: { ...baselineInput.character, stats: { ...baselineInput.character.stats, [stat]: baselineInput.character.stats[stat] + 731.25 } } };
                    const result = matches(engine, changed, spec, level, id + suffix + " isolated " + stat);
                    if (stat === "hp" || stat === "breakEffect" || (stat === "def" && !spec.def)) assertClose(result.nonCrit, baseline.nonCrit, stat + " is inert for this direct action");
                    else assert.notEqual(result.nonCrit, baseline.nonCrit, stat + " changes this action");
                }
                const changedBase = { ...baselineInput, character: { ...baselineInput.character, baseStats: { atk: 9191, hp: 8282, def: 7373 } } };
                assertClose(engine.calculate(changedBase).nonCrit, baseline.nonCrit, "completed input owns permanent stat traces");
            }
        }
    }
});

test("Harmony Backup Dancer is separate Super Break with completed BE and one-enemy A2/A4", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const id of ["8005", "8006"]) {
        assert.equal(data.attacks.some(attack => attack.id === id + "03" && attack.support?.status === "calculable"), false, "Ultimate grants support and is not a direct attack");
        for (let level = 1; level <= 10; level++) {
            const own = native(data, id, level);
            const ultimate = candidate(own, `trace:${id}:${id}03:backup-break-effect`);
            assertClose(ultimate.value, ultimateBreakEffect[level - 1], "pinned Ultimate BE at every E0 level");
            assert.equal(ultimate.inputPolicy, "includedInFinalStats");
            assert.equal(ultimate.displayOnly, true);
            assert.equal(ultimate.enabled, false, "completed BE is not increased twice");
            const conversion = candidate(own, `traceNode:${id}:${id}101:super-break-scaling`);
            assert.equal(conversion.displayOnly, true);
            assert.equal(conversion.enabled, false, "manual one-enemy conversion is not applied a second time");
            for (const [suffix, toughness] of [["01", 10], ["02", 40]]) {
                for (const profile of profiles) {
                    const attack = attackOf(data, id + suffix);
                    const input = request(attack, suffix === "01" ? 6 : 10, profile, own);
                    input.enemy.toughnessActive = false;
                    // 200% already includes permanent 37.3% BE from minor traces.
                    // Ultimate contributes exactly once to the completed state.
                    input.character.stats.breakEffect = 200 + ultimateBreakEffect[level - 1];
                    input.attack.toughnessDamage = toughness; // Skill: first 20 + four 5, not five enhanced hits.
                    input.attack.superBreakMultiplier = 160; // A2: one enemy.
                    input.breakBaseDamage = { 80: 3767.5533 };
                    const defense = 100 / (100 + (profile.enemyLevel + 20) * (1 - (profile.defenseReduction + profile.defenseIgnore) / 100));
                    const resistance = 1 - (profile.resistance - profile.resistancePenetration) / 100;
                    const expected = 3767.5533 * (toughness / 10) * (1 + (200 + ultimateBreakEffect[level - 1]) / 100) * defense * resistance * 1.6;
                    const result = engine.calculateSuperBreak(input);
                    assert.equal(result.supported, true);
                    assertClose(result.value, expected, `${id}${suffix} Super Break Ult Lv${level}`);
                    assertClose(result.breakEffect, 1 + (200 + ultimateBreakEffect[level - 1]) / 100, "completed BE is consumed once");
                    assertClose(result.conversionMultiplier, 1.6, "one-enemy A2 conversion");
                    const noNative = engine.calculateSuperBreak({ ...input, modifiers: [] });
                    assertClose(noNative.value, result.value, "minor 37.3% BE and Ultimate BE are already in the completed input");
                    const omittedMinor = { ...input, character: { ...input.character, stats: { ...input.character.stats, breakEffect: 162.7 + ultimateBreakEffect[level - 1] } } };
                    assertClose(engine.calculateSuperBreak(omittedMinor).value / result.value, (1 + (162.7 + ultimateBreakEffect[level - 1]) / 100) / (1 + (200 + ultimateBreakEffect[level - 1]) / 100), "omitting minor 37.3% BE changes damage only through input BE");
                    const changed = { ...input, character: { ...input.character, stats: { ...input.character.stats, damageBonus: profile.damageBonus + 14.4, atk: 99999, critRate: 100, critDamage: 999 } } };
                    assertClose(engine.calculateSuperBreak(changed).value, result.value, "minor Imaginary 14.4%, ATK and crit do not affect Super Break");
                    const direct = engine.calculate(input);
                    const ordinary = engine.calculate({ ...input, character: { ...input.character, stats: { ...input.character.stats, breakEffect: 0 } } });
                    assertClose(direct.nonCrit, ordinary.nonCrit, "direct damage remains independent of the separately calculated Super Break");
                    assert.equal(engine.calculateSuperBreak({ ...input, enemy: { ...input.enemy, toughnessActive: true } }).supported, false, "Backup Dancer requires an already broken enemy");
                }
            }
        }
    }
});

test("Trailblazer native effects compose once with explicitly toggled Robin party damage", async () => {
    const { data, engine } = await loadProductionFixture();
    const record = data.structuredModifiers.find(item => item.id === "trace:1309:130902:party-damage");
    assert.ok(record);
    for (const [ids, specs] of [[["8003", "8004"], preservation], [["8005", "8006"], harmony]]) {
        for (const id of ids) {
            const context = { characterId: id, eidolon: 0, partyIds: ["1309"], partyEidolons: { "1309": 0 }, traceLevelFor: () => 10 };
            assert.equal(runtime.buildCandidates([record], context, { "robin-skill-damage-active": false })[0].enabled, false);
            assert.equal(runtime.buildCandidates([record], { ...context, partyIds: [] }, { "robin-skill-damage-active": true }).length, 0);
            const party = runtime.buildCandidates([record], context, { "robin-skill-damage-active": true });
            assert.equal(party[0].value, 50);
            const own = native(data, id);
            for (const [suffix, spec] of Object.entries(specs)) {
                const attack = attackOf(data, id + suffix), level = spec.values.length;
                for (const profile of profiles) {
                    const input = request(attack, level, profile, [...own, ...party]);
                    const result = matches(engine, input, spec, level, id + suffix + " Robin on");
                    assertClose(result.breakdown.damageBonus, profile.damageBonus + 50, "Robin adds exactly once alongside native effects");
                    if (spec.adjacent) matches(engine, request(attack, level, profile, [...own, ...party], true), spec, level, id + suffix + " adjacent Robin", true);
                }
            }
        }
    }
});


