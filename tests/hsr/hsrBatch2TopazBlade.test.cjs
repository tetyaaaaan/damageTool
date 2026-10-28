"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fixedSourceSha, loadProductionFixture, attackOf, makeRequest, runtime, independentDirectDamage, assertClose } = require("./helpers/hsrDirectVerification.cjs");

// Hand-transcribed from StarRailRes dbe8cdf... character_skills, trees and ranks.
// Percent coefficients below are literal E0 Lv1-6 / Lv1-10, not loader-derived.
const normal = [50, 60, 70, 80, 90, 100];
const numby = [75, 82.5, 90, 97.5, 105, 112.5, 121.88, 131.25, 140.62, 150];
const debt = [25, 27.5, 30, 32.5, 35, 37.5, 40.62, 43.75, 46.88, 50];
const windfallCrit = [12.5, 13.75, 15, 16.25, 17.5, 18.75, 20.31, 21.88, 23.44, 25];
const hellscape = [12, 14.8, 17.6, 20.4, 23.2, 26, 29.5, 33, 36.5, 40];
const blade = {
    "120501": { variant: "previous", type: "normal", stat: "atk", main: normal },
    "120508": { variant: "previous", type: "enhancedNormal", stat: "hp", main: normal, atk: [20,24,28,32,36,40], adjacent: [20,24,28,32,36,40], adjacentAtk: [8,9.6,11.2,12.8,14.4,16] },
    "120503": { variant: "previous", type: "ultimate", stat: "hp", main: [60,64,68,72,76,80,85,90,95,100], atk: [24,25.6,27.2,28.8,30.4,32,34,36,38,40], adjacent: [24,25.6,27.2,28.8,30.4,32,34,36,38,40], adjacentAtk: [9.6,10.24,10.88,11.52,12.16,12.8,13.6,14.4,15.2,16], loss: [.6,.64,.68,.72,.76,.8,.85,.9,.95,1], adjacentLoss: [.24,.256,.272,.288,.304,.32,.34,.36,.38,.4] },
    "120504": { variant: "previous", type: "followUp", stat: "hp", main: [55,60.5,66,71.5,77,82.5,89.38,96.25,103.12,110], atk: [22,24.2,26.4,28.6,30.8,33,35.75,38.5,41.25,44] },
    "120507": { variant: "previous", type: "additional", stat: "hp", main: [40] },
    "1120501": { variant: "enhanced", type: "normal", stat: "hp", main: [25,30,35,40,45,50] },
    "1120508": { variant: "enhanced", type: "enhancedNormal", stat: "hp", main: [65,78,91,104,117,130], adjacent: [26,31.2,36.4,41.6,46.8,52] },
    "1120503": { variant: "enhanced", type: "ultimate", stat: "hp", main: [90,96,102,108,114,120,127.5,135,142.5,150], adjacent: [36,38.4,40.8,43.2,45.6,48,51,54,57,60], loss: [.72,.768,.816,.864,.912,.96,1.02,1.08,1.14,1.2], adjacentLoss: [.36,.384,.408,.432,.456,.48,.51,.54,.57,.6] },
    "1120504": { variant: "enhanced", type: "followUp", stat: "hp", main: [65,71.5,78,84.5,91,97.5,105.62,113.75,121.88,130] },
    "1120507": { variant: "enhanced", type: "additional", stat: "hp", main: [40] }
};
const profile = { atk: 2937.25, hp: 7231.5, def: 1451.75, baseAtk: 1091.25, baseHp: 1812.5, baseDef: 712.75, critRate: 43.5, critDamage: 137.25, damageBonus: 27.4, enemyLevel: 87, resistance: 31, resistancePenetration: 7.5, defenseReduction: 14.25, defenseIgnore: 3.75, takenDamage: 6.5, toughnessActive: true };
const profiles = [profile, { ...profile, atk: 0 }, { ...profile, hp: 0 }, { ...profile, def: 9001.25 }];
function candidates(data, attack, inputs, levels = {}, party = false, weakness = false) {
    return runtime.buildCandidates(data.structuredModifiers, {
        characterId: attack.characterId, eidolon: 0, enhancementState: attack.variant,
        partyIds: party ? ["1309"] : [], partyEidolons: { "1309": 0 },
        enemy: { weakness }, traceLevelFor: source => source.id === "1309" ? 10 : levels[source.skillId] ?? 10
    }, { "robin-talent-crit-in-final-stats": true, ...inputs, ...(attack.comparisonModifierInputs || {}) }).map(c => ({ ...c, applicable: c.applicable !== false && runtime.applicableToAttack(c, attack) }));
}
function resolved(attack, level, adjacent = false) {
    const components = adjacent ? attack.adjacentScalingTermComponents : attack.scalingTermComponents;
    return { ...attack, attackType: attack.type, traceLevel: level,
        target: adjacent ? "adjacent" : attack.target,
        multiplier: (adjacent ? attack.adjacentMultipliers : attack.multipliers)[level - 1],
        scalingTerms: components?.map(c => ({ stat: c.stat, multiplier: c.values[level - 1], receivesMultiplierAddition: c.receivesMultiplierAddition === true })) };
}
function verify(engine, attack, level, stats, mods, base, literalMods, label) {
    const input = makeRequest(attack, level, stats, mods);
    input.attack = { ...input.attack, ...attack };
    const oracle = independentDirectDamage({ ...input,
        character: { ...input.character, stats: { ...input.character.stats, atk: base } },
        attack: { scalingStat: "atk", multiplier: 100, canCrit: true }, modifiers: literalMods });
    const actual = engine.calculate(input);
    assert.notEqual(actual.supported, false, label);
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], oracle[key], label + " " + key);
    assertClose(actual.breakdown.baseDamage, base, label + " base damage");
    return actual;
}

test("Batch2 Topaz: every E0 direct level and independent Skill/Ultimate native curves", async () => {
    assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
    const { data, engine } = await loadProductionFixture();
    for (const id of ["111201", "111202", "111204"]) {
        const source = attackOf(data, id), values = id === "111201" ? normal : numby;
        assert.deepEqual(Array.from(source.multipliers).slice(0, values.length), values, id);
        assert.equal(source.scalingStat, "atk");
        assert.equal(source.traceKey, id === "111201" ? "normal" : id === "111202" ? "skill" : "talent");
        assert.equal(source.hitCount, 1);
        for (let level = 1; level <= values.length; level++) for (let nativeLevel = 1; nativeLevel <= 10; nativeLevel++) {
            for (const active of [false, true]) for (const weakness of [false, true]) {
                const attack = resolved(source, level), inputs = { "topaz-debt-proof": active, "topaz-windfall": active };
                const mods = candidates(data, attack, inputs, { "111202": nativeLevel, "111203": nativeLevel }, true, weakness);
                assert.equal(mods.some(c => c.source?.kind === "eidolon"), false);
                const wind = active && id !== "111201";
                for (const stats of profiles) verify(engine, attack, level, stats, mods,
                    stats.atk * (values[level - 1] + (wind ? numby[nativeLevel - 1] : 0)) / 100,
                    [{ category: "damageBonus", value: weakness ? 15 : 0 },
                     { category: "takenDamage", value: debt[nativeLevel - 1] },
                     { category: "critDamage", value: wind ? windfallCrit[nativeLevel - 1] : 0 }],
                    id + " Lv" + level + "/native" + nativeLevel + "/" + active + "/weak" + weakness);
            }
        }
    }
});

test("Batch2 Topaz: Windfall excludes Basic but Skill keeps both damage tags; party buffs apply once", async () => {
    const { data, engine } = await loadProductionFixture();
    const skill = attackOf(data, "111202");
    assert.ok(skill.type === "skill" || skill.tags?.includes("skill"), "Numby thrown by Skill keeps the Skill damage tag");
    for (const id of ["111201", "111202", "111204"]) {
        const source = attackOf(data, id), attack = resolved(source, 6);
        const inputs = { "topaz-debt-proof": true, "topaz-windfall": true, "robin-skill-damage-active": true };
        const mods = candidates(data, attack, inputs, {}, true, true);
        const wind = id !== "111201", base = profile.atk * ((id === "111201" ? 100 : 112.5) + (wind ? 150 : 0)) / 100;
        verify(engine, attack, 6, profile, mods, base,
            [{ category: "damageBonus", value: 65 }, { category: "takenDamage", value: 50 }, { category: "critDamage", value: wind ? 25 : 0 }], id + " native plus party");
        const cd = mods.find(c => c.id === "trace:1112:111203:windfall-crit-damage");
        assert.equal(cd.applicable, wind, "Windfall belongs to Numby, not the follow-up-tagged Topaz Basic");
    }
});

test("Batch2 Blade: both versions use literal full E0 mixed-stat and adjacent coefficients", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const [id, spec] of Object.entries(blade)) {
        const source = attackOf(data, id);
        assert.equal(source.variant, spec.variant, id);
        assert.equal(source.type, spec.type, id);
        assert.equal(source.scalingStat, spec.stat, id);
        if (spec.type === "enhancedNormal") assert.equal(source.comparisonModifierInputs?.["blade-hellscape-active"], true, id + " legally requires Hellscape");
        assert.deepEqual(Array.from(source.multipliers).slice(0, spec.main.length), spec.main, id);
        if (spec.adjacent) assert.deepEqual(Array.from(source.adjacentMultipliers).slice(0, spec.main.length), spec.adjacent, id);
        for (let level = 1; level <= spec.main.length; level++) for (const adjacent of spec.adjacent ? [false, true] : [false]) {
            const attack = resolved(source, level, adjacent);
            for (const active of spec.type === "additional" ? [false] : [false, true]) for (let skillLevel = 1; skillLevel <= 10; skillLevel++) {
                for (const tally of spec.loss ? [0, 31.75, 90] : [0]) {
                    const inputs = { "blade-hellscape-active": active, "blade-ult-hp-loss-percent": tally };
                    const levels = { "120502": skillLevel, "1120502": skillLevel, "120503": level, "1120503": level };
                    const mods = candidates(data, attack, inputs, levels);
                    assert.equal(mods.some(c => c.source?.kind === "eidolon"), false);
                    const main = (adjacent ? spec.adjacent : spec.main)[level - 1];
                    const atk = (adjacent ? spec.adjacentAtk : spec.atk)?.[level - 1] || 0;
                    const loss = (adjacent ? spec.adjacentLoss : spec.loss)?.[level - 1] || 0;
                    for (const stats of profiles) {
                        const base = stats[spec.stat] * (main + tally * loss) / 100 + stats.atk * atk / 100;
                        const bonus = (active || spec.type === "enhancedNormal" ? hellscape[skillLevel - 1] : 0) + (spec.type === "followUp" ? 20 : 0);
                        verify(engine, attack, level, stats, mods, base, [{ category: "damageBonus", value: bonus }], id + " Lv" + level + "/skill" + skillLevel + "/tally" + tally + "/adj" + adjacent);
                    }
                }
            }
        }
    }
});

test("Batch2 Blade: completed HP and ATK inputs, party buffs and native damage bonuses never double count traces", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const [id, spec] of Object.entries(blade)) {
        if (spec.type === "additional") continue; // Battle-entry Technique has no pre-existing combat buffs.
        const source = attackOf(data, id), level = spec.main.length, attack = resolved(source, level);
        const inputs = { "blade-hellscape-active": true, "blade-ult-hp-loss-percent": 90, "robin-skill-damage-active": true };
        const mods = candidates(data, attack, inputs, {}, true);
        const base = profile[spec.stat] * (spec.main[level - 1] + 90 * (spec.loss?.[level - 1] || 0)) / 100 + profile.atk * (spec.atk?.[level - 1] || 0) / 100;
        verify(engine, attack, level, profile, mods, base, [{ category: "damageBonus", value: 90 + (spec.type === "followUp" ? 20 : 0) }], id + " native plus party");
        assert.equal(mods.filter(c => c.enabled && c.inputPolicy === "includedInFinalStats").length, 0, "HP/CR small traces already belong to completed stats");
    }
});

test("Batch2 Topaz: Skill and Ultimate levels remain independent, with distinct native state buckets", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const id of ["111201", "111202", "111204"]) {
        // Synthetic routing isolation deliberately removes the prior-Debt comparison assumption.
        const attack = resolved({ ...attackOf(data, id), comparisonModifierInputs: undefined }, 1);
        for (let skillLevel = 1; skillLevel <= 10; skillLevel++) for (let ultLevel = 1; ultLevel <= 10; ultLevel++) {
            for (const debtActive of [false, true]) for (const windfall of [false, true]) {
                const inputs = { "topaz-debt-proof": debtActive, "topaz-windfall": windfall };
                const mods = candidates(data, attack, inputs, { "111202": skillLevel, "111203": ultLevel });
                const wind = windfall && id !== "111201";
                verify(engine, attack, 1, profile, mods,
                    profile.atk * ((id === "111201" ? 50 : 75) + (wind ? numby[ultLevel - 1] : 0)) / 100,
                    [{ category: "takenDamage", value: debtActive ? debt[skillLevel - 1] : 0 },
                     { category: "critDamage", value: wind ? windfallCrit[ultLevel - 1] : 0 }],
                    id + "/Skill" + skillLevel + "/Ultimate" + ultLevel + "/debt" + debtActive + "/wind" + windfall);
            }
        }
    }
});

test("Batch2 Topaz: ordinary and Windfall comparison states carry local prior-Debt assumptions", async () => {
    const { data, engine } = await loadProductionFixture();
    assert.equal(attackOf(data, "111201").comparisonModifierInputs?.["topaz-debt-proof"], true, "one-enemy Basic snapshot also has prior Debt");
    for (const id of ["111202", "111204"]) {
        const source = attackOf(data, id);
        assert.equal(source.comparisonModifierInputs?.["topaz-debt-proof"], true, "Numby action is evaluated on a prior-Debt target");
        assert.equal(source.comparisonStates?.length, 2, "ordinary and Windfall Numby are distinct comparison rows");
        const windStates = new Set();
        for (const state of source.comparisonStates) {
            assert.equal(typeof state.modifierInputs?.["topaz-windfall"], "boolean");
            windStates.add(state.modifierInputs["topaz-windfall"]);
            for (let level = 1; level <= 10; level++) {
                const attack = resolved({ ...source, comparisonModifierInputs: { ...source.comparisonModifierInputs, ...state.modifierInputs } }, level);
                // Saved globals deliberately contradict local assumptions; rendering must isolate each row.
                const inputs = { "topaz-debt-proof": false, "topaz-windfall": !state.modifierInputs["topaz-windfall"] };
                const mods = candidates(data, attack, inputs);
                const wind = state.modifierInputs["topaz-windfall"];
                verify(engine, attack, level, profile, mods,
                    profile.atk * (numby[level - 1] + (wind ? 150 : 0)) / 100,
                    [{ category: "takenDamage", value: 50 }, { category: "critDamage", value: wind ? 25 : 0 }], id + "/" + state.label + "/Lv" + level);
            }
        }
        assert.deepEqual([...windStates].sort(), [false, true]);
    }
});

test("Batch2 Topaz and Blade: asymmetric flat/percent ATK, HP and DEF buffs use only sourced scaling terms", async () => {
    const { data, engine } = await loadProductionFixture();
    const boosts = [
        { category: "statPercent", stat: "atk", value: 17.25 }, { category: "statFlat", stat: "atk", value: 49.5 },
        { category: "statPercent", stat: "hp", value: 23.75 }, { category: "statFlat", stat: "hp", value: 283.25 },
        { category: "statPercent", stat: "def", value: 41.5 }, { category: "statFlat", stat: "def", value: 117.75 }
    ];
    const effective = { ...profile, atk: profile.atk + profile.baseAtk * .1725 + 49.5, hp: profile.hp + profile.baseHp * .2375 + 283.25, def: profile.def + profile.baseDef * .415 + 117.75 };
    for (const id of ["111201", "111202", "111204", ...Object.keys(blade).filter(id => blade[id].type !== "additional")]) {
        const source = attackOf(data, id), spec = blade[id];
        const max = spec ? spec.main.length : id === "111201" ? 6 : 10;
        for (let level = 1; level <= max; level++) {
            const attack = resolved(source, level), inputs = { "topaz-debt-proof": true, "topaz-windfall": true, "blade-hellscape-active": true, "blade-ult-hp-loss-percent": 90 };
            const mods = [...candidates(data, attack, inputs, { "120503": level, "1120503": level }), ...boosts];
            const base = spec
                ? effective[spec.stat] * (spec.main[level - 1] + 90 * (spec.loss?.[level - 1] || 0)) / 100 + effective.atk * (spec.atk?.[level - 1] || 0) / 100
                : effective.atk * ((id === "111201" ? normal : numby)[level - 1] + (id === "111201" ? 0 : 150)) / 100;
            const literalMods = spec ? [{ category: "damageBonus", value: 40 + (spec.type === "followUp" ? 20 : 0) }]
                : [{ category: "takenDamage", value: 50 }, { category: "critDamage", value: id === "111201" ? 0 : 25 }];
            verify(engine, attack, level, profile, mods, base, literalMods, id + "/Lv" + level + "/stat buffs");
        }
    }
});
