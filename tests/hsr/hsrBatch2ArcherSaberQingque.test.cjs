"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    runtime, fixedSourceSha, loadProductionFixture, attackOf, makeRequest,
    independentDirectDamage, assertClose
} = require("./helpers/hsrDirectVerification.cjs");

// Hand-transcribed from the pinned StarRailRes index_new/jp/character_skills.json,
// character_skill_trees.json and character_ranks.json at:
// https://github.com/Mar-7th/StarRailRes/tree/dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487/index_new/jp
// These coefficient/stat oracles never read production curves to choose expectations.
const reviewed = {
    "101501": { characterId: "1015", type: "normal", traceKey: "normal", element: "Quantum", target: "single", values: [50, 60, 70, 80, 90, 100] },
    "101502": { characterId: "1015", type: "skill", traceKey: "skill", element: "Quantum", target: "single", values: [180, 198, 216, 234, 252, 270, 292.5, 315, 337.5, 360] },
    "101503": { characterId: "1015", type: "ultimate", traceKey: "ultimate", element: "Quantum", target: "single", values: [600, 640, 680, 720, 760, 800, 850, 900, 950, 1000] },
    "101504": { characterId: "1015", type: "followUp", traceKey: "talent", element: "Quantum", target: "single", values: [100, 110, 120, 130, 140, 150, 162.5, 175, 187.5, 200] },
    "101401": { characterId: "1014", type: "normal", traceKey: "normal", element: "Wind", target: "single", values: [50, 60, 70, 80, 90, 100] },
    "101402": { characterId: "1014", type: "skill", traceKey: "skill", element: "Wind", target: "blast", values: [75, 82.5, 90, 97.5, 105, 112.5, 121.88, 131.25, 140.62, 150] },
    "101403": { characterId: "1014", type: "ultimate", traceKey: "ultimate", element: "Wind", target: "aoe", values: [140, 154, 168, 182, 196, 210, 227.5, 245, 262.5, 280] },
    "1014031": { characterId: "1014", type: "ultimate", traceKey: "ultimate", element: "Wind", target: "bounce", hits: 10, values: [55, 60.5, 66, 71.5, 77, 82.5, 89.38, 96.25, 103.12, 110] },
    "1014081": { characterId: "1014", type: "enhancedNormal", traceKey: "normal", element: "Wind", target: "aoe", values: [185, 222, 259, 296, 333, 370] },
    "120101": { characterId: "1201", type: "normal", traceKey: "normal", element: "Quantum", target: "single", values: [50, 60, 70, 80, 90, 100] },
    "120108": { characterId: "1201", type: "enhancedNormal", traceKey: "normal", element: "Quantum", target: "blast", values: [120, 144, 168, 192, 216, 240] },
    "120103": { characterId: "1201", type: "ultimate", traceKey: "ultimate", element: "Quantum", target: "aoe", values: [120, 128, 136, 144, 152, 160, 170, 180, 190, 200] }
};
const archerSkillBonus = [60, 64, 68, 72, 76, 80, 85, 90, 95, 100];
const saberResonance = [7, 7.7, 8.4, 9.1, 9.8, 10.5, 11.38, 12.25, 13.13, 14];
const saberTalentBonus = [30, 33, 36, 39, 42, 45, 48.75, 52.5, 56.25, 60];
const qingqueSkillBonus = [14, 15.4, 16.8, 18.2, 19.6, 21, 22.75, 24.5, 26.25, 28];
const qingqueHiddenHand = [36, 39.6, 43.2, 46.8, 50.4, 54, 58.5, 63, 67.5, 72];
const scenarios = [
    { atk: 3123.5, hp: 9876.25, def: 2345.75, baseAtk: 1140.25, baseHp: 1190.5, baseDef: 920.75, critRate: 37.5, critDamage: 83.25, damageBonus: 11.5, enemyLevel: 82, resistance: 27.5, toughnessActive: true },
    { atk: 2678.125, hp: 12345.5, def: 1987.25, baseAtk: 973.5, baseHp: 1350.25, baseDef: 1105.5, critRate: 71.25, critDamage: 142.75, damageBonus: 46.25, enemyLevel: 95, resistance: 5, resistancePenetration: 8.5, defenseReduction: 17, defenseIgnore: 6, takenDamage: 12.5, toughnessActive: true }
];
const mod = (category, value, stat) => ({ category, value, ...(stat ? { stat } : {}) });
const externalModifiers = [
    mod("statPercent", 17.5, "atk"), mod("statFlat", 137.25, "atk"),
    mod("statPercent", 42.5, "hp"), mod("statFlat", 213.75, "def"),
    mod("damageBonus", 28.5), mod("defenseReduction", 9.25), mod("defenseIgnore", 7.5),
    mod("resistancePenetration", 6.25), mod("takenDamage", 13.5),
    mod("critRate", 11.75), mod("critDamage", 22.5)
].map((item, index) => ({ ...item, id: "batch2-external-" + index, enabled: true, applicable: true }));

function candidate(data, id, characterId, level, inputs = {}, extra = {}) {
    const record = data.structuredModifiers.find(item => item.id === id);
    assert.ok(record, id + " exists in production loader");
    const result = runtime.buildCandidates([record], { characterId, eidolon: 0, traceLevelFor: () => level, ...extra }, inputs);
    assert.equal(result.length, 1, id + " resolves once");
    return result[0];
}
function assertOracle(engine, input, coefficient, hitCount, expectedModifiers, label) {
    const expected = independentDirectDamage({
        ...input,
        attack: { scalingStat: "atk", multiplier: coefficient, canCrit: true },
        modifiers: expectedModifiers
    });
    const actual = engine.calculate(input);
    assert.notEqual(actual.supported, false, label + ": " + actual.reason);
    for (const metric of ["nonCrit", "crit", "expected"]) assertClose(actual[metric], expected[metric] * hitCount, label + " " + metric);
    assertClose(actual.breakdown.referenceValue, expected.effectiveReferenceValue, label + " ATK reference");
    assertClose(actual.breakdown.damageBonus, expected.damageBonus, label + " damage bonus");
    assertClose(actual.breakdown.defense, expected.defense, label + " DEF");
    assertClose(actual.breakdown.resistance, expected.resistance, label + " RES");
    return actual;
}

test("batch2 Archer, Saber and Qingque direct rows declare fixed-source limited E0 scope", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const [id, spec] of Object.entries(reviewed)) {
        const attack = attackOf(data, id);
        assert.equal(attack.support.status, "calculable", id);
        assert.equal(attack.support.verified, true, id);
        for (const key of ["characterId", "type", "traceKey", "element", "target"]) assert.equal(attack[key], spec[key], id + " " + key);
        assert.equal(attack.scalingStat, "atk", id);
        assert.equal(attack.damageFormula, "statMultiplier", id);
        assert.equal(attack.hitCount, spec.hits || 1, id);
        assert.equal(attack.maximumEidolon, 0, id);
        assert.equal(attack.maximumTraceLevel, spec.values.length, id);
        assert.equal(attack.enemyCountExact, 1, id);
        assert.deepEqual(Array.from(attack.multipliers).slice(0, spec.values.length), spec.values, id + " source curve");
        assert.equal(attack.provenance.sourceCommit, fixedSourceSha, id);
        assert.match(attack.provenance.sourceFile, /character_skills\.json/, id);
        assert.equal(engine.unsupportedAttackReason(attack), "", id);
    }
});

test("all E0 levels independently isolate ATK from HP/DEF and apply combat modifiers", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const [id, spec] of Object.entries(reviewed)) {
        const attack = attackOf(data, id);
        for (let level = 1; level <= spec.values.length; level++) for (const [s, scenario] of scenarios.entries()) {
            const label = `${id} Lv${level} S${s}`;
            const baseline = assertOracle(engine, makeRequest(attack, level, scenario), spec.values[level - 1], spec.hits || 1, [], label);
            for (const stat of ["atk", "hp", "def"]) {
                const changed = assertOracle(engine, makeRequest(attack, level, { ...scenario, [stat]: scenario[stat] * 1.217 + 83.375 }), spec.values[level - 1], spec.hits || 1, [], label + " isolated " + stat);
                if (stat === "atk") assert.notEqual(changed.expected, baseline.expected, label + " depends on ATK");
                else assertClose(changed.expected, baseline.expected, label + " ignores " + stat);
            }
            assertOracle(engine, makeRequest(attack, level, scenario, externalModifiers), spec.values[level - 1], spec.hits || 1, externalModifiers, label + " combat modifiers");
        }
    }
});

test("Archer Circuit uses 0/1/2 stacks and Guardian is an explicit lasting event state", async () => {
    const { data, engine } = await loadProductionFixture();
    const guardianId = "traceNode:1015:1015103:crit-damage";
    const record = data.structuredModifiers.find(item => item.id === guardianId);
    assert.equal(record.activation.mode, "toggle");
    assert.equal(record.activation.inputKey, "archer-guardian-active");
    assert.equal(record.activation.default, false);
    for (const sp of [0, 3, 4, 7]) {
        const off = candidate(data, guardianId, "1015", 10, {}, { party: { sp } });
        const on = candidate(data, guardianId, "1015", 10, { "archer-guardian-active": true }, { party: { sp } });
        assert.equal(off.enabled, false, "SP alone never establishes the earlier gain event");
        assert.equal(on.enabled, true, "confirmed one-turn buff can persist after SP falls");
        assert.equal(on.value, 120);
    }
    for (let level = 1; level <= 10; level++) for (const stacks of [0, 1, 2, 3]) for (const guardian of [false, true]) {
        const circuit = candidate(data, "trace:1015:101502:circuit-skill-damage", "1015", level, { "archer-circuit-stacks": stacks });
        const cd = candidate(data, guardianId, "1015", level, { "archer-guardian-active": guardian });
        assertClose(circuit.value, archerSkillBonus[level - 1] * Math.min(2, stacks), "E0 Circuit cap");
        for (const id of ["101501", "101502", "101503", "101504"]) {
            const spec = reviewed[id], attack = attackOf(data, id), attackLevel = Math.min(level, spec.values.length);
            const expected = [mod("damageBonus", id === "101502" ? archerSkillBonus[level - 1] * Math.min(2, stacks) : 0), mod("critDamage", guardian ? 120 : 0)];
            assertOracle(engine, makeRequest(attack, attackLevel, scenarios[0], [circuit, cd]), spec.values[attackLevel - 1], 1, expected, `${id} Circuit${stacks} Guardian${guardian} Lv${level}`);
        }
    }
    const own = data.structuredModifiers.filter(item => item.source?.id === "1015");
    assert.equal(runtime.buildCandidates(own, { characterId: "1014", partyIds: ["1015"], eidolon: 0 }, { "archer-guardian-active": true }).length, 0, "Archer self effects do not leak to a teammate");
});

// These are already-resolved damage-time snapshots. They do not establish
// event order for buffs/Core Resonance gained by the attack currently being used.
test("Saber E0 damage-time snapshots keep resonance, Talent, technique and Crown in separate stages", async () => {
    const { data, engine } = await loadProductionFixture();
    for (let level = 1; level <= 10; level++) for (const stacks of [0, 3, 25, 30]) {
        const inputs = { "saber-resonance-consumed": stacks, "saber-ally-ultimate-damage-active": true, "saber-technique-atk-active": true, "saber-skill-crit-damage-active": true, "saber-resonance-acquired": 12 };
        const actualMods = ["trace:1014:101402:resonance-multiplier", "trace:1014:101404:ally-ultimate-damage", "trace:1014:101407:technique-atk", "traceNode:1014:1014103:skill-crit-damage", "traceNode:1014:1014103:resonance-crit-damage"].map(id => candidate(data, id, "1014", level, inputs));
        const addition = saberResonance[level - 1] * Math.min(25, stacks);
        assertClose(actualMods[0].value, addition, "Core Resonance source coefficient");
        const expectedMods = [mod("damageBonus", saberTalentBonus[level - 1]), mod("statPercent", 35, "atk"), mod("critDamage", 50 + 4 * 8)];
        for (const id of ["101402", "101403", "1014031", "1014081"]) {
            const spec = reviewed[id], attackLevel = Math.min(level, spec.values.length);
            assertOracle(engine, makeRequest(attackOf(data, id), attackLevel, scenarios[0], actualMods), spec.values[attackLevel - 1] + (id === "101402" ? addition : 0), spec.hits || 1, expectedMods, `${id} Lv${level} resonance${stacks}`);
        }
    }
    const offInputs = {};
    for (const id of ["trace:1014:101404:ally-ultimate-damage", "trace:1014:101407:technique-atk", "traceNode:1014:1014103:skill-crit-damage", "traceNode:1014:1014103:resonance-crit-damage"]) assert.equal(candidate(data, id, "1014", 10, offInputs).enabled, false, id + " OFF without explicit event state");
});

test("Qingque skill stacks and Hidden Hand ATK apply to E0 enhanced Basic and in-state Ultimate", async () => {
    const { data, engine } = await loadProductionFixture();
    const talentId = "trace:1201:120104:concealed-kong-atk";
    const talentRecord = data.structuredModifiers.find(item => item.id === talentId);
    assert.equal(talentRecord.activation.mode, "toggle");
    assert.equal(talentRecord.activation.default, false);
    const inState = candidate(data, talentId, "1201", 10, { "qingque-concealed-kong": true });
    assert.equal(runtime.applicableToAttack(inState, attackOf(data, "120101")), false, "Hidden Hand cannot leak into the distinct ordinary Basic comparison");
    for (let level = 1; level <= 10; level++) for (const stacks of [0, 1, 4, 8]) for (const hiddenHand of [false, true]) {
        const inputs = { "qingque-skill-stacks": stacks, "qingque-concealed-kong": hiddenHand };
        const actualMods = ["trace:1201:120102:skill-damage-stacks", "traceNode:1201:1201102:skill-damage-addition", talentId].map(id => candidate(data, id, "1201", level, inputs));
        assertClose(actualMods[0].value, qingqueSkillBonus[level - 1] * Math.min(4, stacks), "Skill source curve and four-stack cap");
        assertClose(actualMods[1].value, 10 * Math.min(4, stacks), "Bide Time adds ten percentage points per stack");
        assertClose(actualMods[2].value, qingqueHiddenHand[level - 1], "Talent source ATK curve");
        for (const id of hiddenHand ? ["120108", "120103"] : ["120101", "120108", "120103"]) {
            const spec = reviewed[id], attack = attackOf(data, id), attackLevel = Math.min(level, spec.values.length);
            const expectedMods = [mod("damageBonus", (qingqueSkillBonus[level - 1] + 10) * Math.min(4, stacks)), mod("statPercent", hiddenHand ? qingqueHiddenHand[level - 1] : 0, "atk")];
            assertOracle(engine, makeRequest(attack, attackLevel, scenarios[0], actualMods), spec.values[attackLevel - 1], 1, expectedMods, `${id} Lv${level} stacks${stacks} HiddenHand${hiddenHand}`);
        }
    }
    // Final input can already contain the state-dependent ATK. Leaving the option
    // OFF must preserve that value, avoiding a second Talent application.
    const attack = attackOf(data, "120103"), included = { ...scenarios[0], atk: scenarios[0].atk + scenarios[0].baseAtk * .72 };
    const off = candidate(data, talentId, "1201", 10, {});
    assertOracle(engine, makeRequest(attack, 10, included, [off]), 200, 1, [], "Qingque preincluded Hidden Hand ATK");
    assert.equal(runtime.buildCandidates([talentRecord], { characterId: "1015", partyIds: ["1201"], eidolon: 0 }, { "qingque-concealed-kong": true }).length, 0, "Hidden Hand is not a party ATK buff");
});

test("all three characters combine party and native effects without duplicate self effects", async () => {
    const { data, engine } = await loadProductionFixture();
    const bronyaId = "trace:1101:110102:damage-bonus";
    for (const [id, nativeId, inputs, nativeExpected] of [
        ["101502", "trace:1015:101502:circuit-skill-damage", { "archer-circuit-stacks": 2 }, [mod("damageBonus", 200)]],
        ["101402", "trace:1014:101404:ally-ultimate-damage", { "saber-ally-ultimate-damage-active": true }, [mod("damageBonus", 60)]],
        ["120103", "trace:1201:120104:concealed-kong-atk", { "qingque-concealed-kong": true }, [mod("statPercent", 72, "atk")]]
    ]) {
        const spec = reviewed[id], attack = attackOf(data, id);
        const native = candidate(data, nativeId, spec.characterId, 10, inputs);
        const party = candidate(data, bronyaId, spec.characterId, 10, { "bronya-skill-active": true }, { partyIds: ["1101"], partyEidolons: { "1101": 0 } });
        assert.equal(party.providerId, "1101");
        assert.equal(party.value, 66);
        assert.equal(party.enabled, true);
        const result = assertOracle(engine, makeRequest(attack, 10, scenarios[1], [native, party, ...externalModifiers]), spec.values[9], 1, [...nativeExpected, mod("damageBonus", 66), ...externalModifiers], id + " party plus native");
        assert.equal(result.applied.filter(item => item.id === nativeId).length, 1);
        const record = data.structuredModifiers.find(item => item.id === bronyaId);
        assert.equal(runtime.buildCandidates([record], { characterId: spec.characterId, eidolon: 0 }, { "bronya-skill-active": true }).length, 0, "absent Bronya cannot supply party buff");
    }
});


test("preincluded static trace stats and higher Eidolons never get re-added to E0 damage", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const [id, characterId, expected] of [
        ["traceNode:1014:1014101:crit-rate", "1014", 20],
        ["traceStats:1201:attack", "1201", 28],
        ["traceStats:1201:quantum-damage", "1201", 14.4],
        ["traceStats:1201:defense", "1201", 12.5]
    ]) {
        const value = candidate(data, id, characterId, 10);
        assertClose(value.value, expected, id + " pinned source value");
        assert.equal(value.inputPolicy, "includedInFinalStats", id);
        assert.equal(value.enabled, false, id + " is represented in final input");
        const attackId = characterId === "1014" ? "101402" : "120103";
        const attack = attackOf(data, attackId);
        assertOracle(engine, makeRequest(attack, 10, scenarios[0], [value]), reviewed[attackId].values[9], 1, [], id + " no duplicate application");
    }
    for (const characterId of ["1015", "1014", "1201"]) {
        const ranks = data.structuredModifiers.filter(item => item.source?.kind === "eidolon" && String(item.source.id) === characterId);
        assert.ok(ranks.length > 0, characterId + " audited ranks are present");
        assert.equal(runtime.buildCandidates(ranks, { characterId, eidolon: 0 }, {
            "archer-e2-quantum-resistance-reduction": true, "saber-e4-ultimate-stacks": 3,
            "qingque-autarky-active": true
        }).length, 0, characterId + " E1+ effects cannot leak into E0");
    }
});


test("Saber single-enemy Ultimate snapshot totals the AOE strike and all ten bounces independently", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "1014032");
    const aoe = reviewed["101403"].values;
    const tenBounces = reviewed["1014031"].values.map(value => value * 10);
    assert.equal(attack.characterId, "1014");
    assert.equal(attack.type, "ultimate");
    assert.equal(attack.damageFormula, "statMultiplier");
    assert.equal(attack.scalingStat, "atk");
    assert.equal(attack.hitCount, 1, "component coefficients already contain all ten bounces");
    assert.equal(attack.enemyCountExact, 1);
    assert.equal(attack.maximumEidolon, 0);
    assert.equal(attack.maximumTraceLevel, 10);
    assert.equal(attack.provenance.sourceCommit, fixedSourceSha);
    assert.equal(attack.multiplierComponents.length, 2);
    assert.deepEqual(Array.from(attack.multiplierComponents[0].values).slice(0, 10), aoe, "independent first AOE curve");
    assert.deepEqual(Array.from(attack.multiplierComponents[1].values).slice(0, 10), tenBounces, "independent ten-bounce coefficient curve");
    for (const component of attack.multiplierComponents) assert.equal(component.traceKey, "ultimate", "both components use the same Ultimate level");
    for (let level = 1; level <= 10; level++) for (const [index, scenario] of scenarios.entries()) for (const withBuffs of [false, true]) {
        // A constant known snapshot is required across the strike and bounces.
        // This does not infer the timing of the Ultimate's newly generated buffs.
        const native = [
            candidate(data, "trace:1014:101404:ally-ultimate-damage", "1014", level, { "saber-ally-ultimate-damage-active": withBuffs }),
            candidate(data, "traceNode:1014:1014103:resonance-crit-damage", "1014", level, { "saber-resonance-acquired": withBuffs ? 8 : 0 })
        ];
        const actualMods = [...native, ...(withBuffs ? externalModifiers : [])];
        const expectedMods = withBuffs ? [mod("damageBonus", saberTalentBonus[level - 1]), mod("critDamage", 32), ...externalModifiers] : [];
        const input = makeRequest(attack, level, scenario, actualMods);
        // Match the existing production component-sum request convention.
        input.attack.multiplier = attack.multiplierComponents.reduce((sum, item) => sum + item.values[level - 1], 0);
        const coefficient = aoe[level - 1] + tenBounces[level - 1];
        const result = assertOracle(engine, input, coefficient, 1, expectedMods, `Saber whole Ultimate Lv${level} S${index} buffs${withBuffs}`);
        const first = assertOracle(engine, makeRequest(attackOf(data, "101403"), level, scenario, actualMods), aoe[level - 1], 1, expectedMods, "AOE component");
        const second = assertOracle(engine, makeRequest(attackOf(data, "1014031"), level, scenario, actualMods), reviewed["1014031"].values[level - 1], 10, expectedMods, "ten-bounce component");
        for (const metric of ["nonCrit", "crit", "expected"]) assertClose(result[metric], first[metric] + second[metric], "whole Ultimate equals independent component sum " + metric);
    }
});
