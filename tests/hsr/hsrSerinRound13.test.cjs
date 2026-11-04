"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    fixedSourceSha, loadProductionFixture, attackOf, makeRequest,
    independentDirectDamage, assertClose
} = require("./helpers/hsrDirectVerification.cjs");

const attackFile = "games/hsr/data/calc/attacks-serin-round13.json";
const { readJson } = require("./helpers/hsrDirectVerification.cjs");
const added = readJson(attackFile).overrides;
const ultimateCurve = [120, 128, 136, 144, 152, 160, 170, 180, 190, 200];
const zoneCurve = [32, 37.28, 42.56, 47.84, 53.12, 58.4, 63.2, 68, 74, 80];
const sourceDoTs = [
    { id: "1410041", detonationId: "14101021", element: "Wind", key: "own-wind-dot-detonation" },
    { id: "1410042", detonationId: "14101022", element: "Physical", key: "own-physical-dot-detonation" },
    { id: "1410043", detonationId: "14101023", element: "Fire", key: "own-fire-dot-detonation" },
    { id: "1410044", detonationId: "14101024", element: "Thunder", key: "own-thunder-dot-detonation" }
];
const profile = {
    atk: 3761.75, baseAtk: 1234.5, hp: 9876.25, def: 1723.5,
    critRate: 63.25, critDamage: 147.75, damageBonus: 28.5,
    enemyLevel: 87, resistance: 23.75, defenseReduction: 13.5,
    defenseIgnore: 7.25, resistancePenetration: 6.5, takenDamage: 11.25
};

function explicitState(values, zoneCount) {
    return {
        "serin-detonation-original:1410041": values[0],
        "serin-detonation-original:1410042": values[1],
        "serin-detonation-original:1410043": values[2],
        "serin-detonation-original:1410044": values[3],
        "serin-zone-proc-count": zoneCount
    };
}

function makeUltimateSequence(data, parent, level, values, zoneCount) {
    const state = explicitState(values, zoneCount);
    const parentRequest = makeRequest(parent, level, profile);
    parentRequest.modifierInputs = state;
    parentRequest.attack = { ...parentRequest.attack, attackType: "ultimate" };
    parentRequest.sequenceComponents = parent.damageComponents.map(definition => {
        const template = attackOf(data, definition.attackId);
        const childLevel = sourceDoTs.some(item => item.detonationId === template.id) ? 1 : level;
        const child = {
            ...template,
            traceLevel: childLevel,
            multiplier: template.multipliers[childLevel - 1],
            attackType: template.type
        };
        return {
            key: definition.key,
            name: definition.name,
            input: {
                ...parentRequest,
                attack: child,
                modifiers: []
            }
        };
    });
    return parentRequest;
}

test("Serin Round13 attack rows are the fixed A4 multiplier over explicit source-owned DoTs", async () => {
    const { data } = await loadProductionFixture();
    const parent = attackOf(data, "1410032");
    assert.equal(parent.provenance.sourceCommit, fixedSourceSha);
    assert.equal(parent.maximumEidolon, 0);
    assert.equal(parent.enemyCountExact, 1);
    assert.deepEqual(Array.from(parent.multipliers), ultimateCurve);
    assert.deepEqual(Array.from(parent.damageComponents, item => item.attackId), ["141003", "14101021", "14101022", "14101023", "14101024", "1410031"]);
    assert.deepEqual(Array.from(parent.numericModifierInputs, item => item.inputKey), [
        ...sourceDoTs.map(item => "serin-detonation-original:" + item.id), "serin-zone-proc-count"
    ]);
    assert.ok(parent.numericModifierInputs.every(item => item.default === undefined), "unknown DoT values and proc counts never receive an inferred default");
    assert.equal(parent.numericModifierInputs[4].minimum, 0);
    assert.equal(parent.numericModifierInputs[4].maximum, 8);
    assert.equal(parent.numericModifierInputs[4].integer, true);

    for (const source of sourceDoTs) {
        const row = attackOf(data, source.detonationId);
        assert.equal(row.sourceDoTId, source.id);
        assert.equal(row.dataOwnerId, "1410");
        assert.equal(row.element, source.element);
        assert.equal(row.type, "dot");
        assert.equal(row.canCrit, false);
        assert.equal(row.damageFormula, "resolvedDamageMultiplier");
        assert.deepEqual(Array.from(row.multipliers), [150], "A4 is one fixed multiplier, independent of Ultimate level");
        assert.equal(row.originalDamageInputKey, "serin-detonation-original:" + source.id);
        assert.equal(row.hidden, true, "only the composite Ultimate is presented as a full attack result");
    }
    assert.equal(added.length, 5, "one visible composite and four internal detonation components");
});

test("Serin A4 scales each resolved own-DoT noncrit amount once and ignores unrelated damage modifiers", async () => {
    const { engine, data } = await loadProductionFixture();
    const amounts = [0, 29.75, 812.625, 1450.125];
    const unrelated = [
        { id: "should-not-reapply-dot-bonus", category: "dotDamage", value: 90, enabled: true, applicable: true },
        { id: "should-not-reapply-target-vulnerability", category: "takenDamage", value: 40, enabled: true, applicable: true },
        { id: "should-not-reapply-defense-ignore", category: "defenseIgnore", value: 35, enabled: true, applicable: true }
    ];
    for (let index = 0; index < sourceDoTs.length; index++) {
        const source = sourceDoTs[index];
        const attack = attackOf(data, source.detonationId);
        const modifierInputs = { [attack.originalDamageInputKey]: amounts[index] };
        const input = makeRequest(attack, 1, profile, unrelated);
        input.modifierInputs = modifierInputs;
        const result = engine.calculate(input);
        assert.notEqual(result.supported, false, source.id + " accepts the explicit own-DoT result");
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], amounts[index] * 1.5, source.id + " resolved amount " + key);
        assert.equal(result.breakdown.sourceDoTId, source.id);
        assert.equal(result.applied.length, 0, "the already-resolved owner and enemy factors are not applied twice");
        assert.equal(result.skipped.length, unrelated.length, "unrelated source/target modifiers are explicitly skipped");
    }
});

test("Serin A4 rejects missing, mismatched-owner, and invalid source snapshots locally", async () => {
    const { engine, data } = await loadProductionFixture();
    const attack = attackOf(data, "14101021");
    const request = makeRequest(attack, 1, profile);
    request.modifierInputs = {};
    assert.equal(engine.calculate(request).supported, false, "unknown is not treated as zero or an assumed active DoT");

    request.modifierInputs = { [attack.originalDamageInputKey]: 100 };
    assert.equal(engine.calculate({ ...request, attack: { ...request.attack, dataOwnerId: "1005" } }).supported, false, "another owner's DoT cannot enter Serin's own-DoT row");
    assert.equal(engine.calculate({ ...request, modifierInputs: { [attack.originalDamageInputKey]: -1 } }).supported, false, "negative resolved damage is rejected");
    assert.equal(engine.calculate({ ...request, modifierInputs: { [attack.originalDamageInputKey]: NaN } }).supported, false, "non-finite resolved damage is rejected");
    assert.equal(engine.calculate({ ...request, enemy: { ...request.enemy, count: 2 } }).supported, false, "multi-enemy allocation is not inferred");
});

test("Serin Ultimate combines one direct hit, four explicit owned DoTs, and only the selected zone proc count", async () => {
    const { data, engine } = await loadProductionFixture();
    const parent = attackOf(data, "1410032");
    const direct = attackOf(data, "141003");
    const zone = attackOf(data, "1410031");
    const amounts = [0, 29.75, 812.625, 1450.125];

    for (let level = 1; level <= 10; level++) {
        assertClose(direct.multipliers[level - 1], ultimateCurve[level - 1], "pinned direct Ultimate coefficient Lv" + level);
        assertClose(zone.multipliers[level - 1], zoneCurve[level - 1], "pinned one-event zone DoT coefficient Lv" + level);
        for (const zoneCount of [0, 1, 8]) {
            const input = makeUltimateSequence(data, parent, level, amounts, zoneCount);
            const actual = engine.calculate(input);
            assert.notEqual(actual.supported, false, "valid explicit composition Lv" + level + " zone " + zoneCount + ": " + actual.reason);

            const directInput = makeRequest(direct, level, profile);
            const directExpected = independentDirectDamage(directInput);
            const zoneInput = makeRequest(zone, level, profile);
            const zoneExpected = independentDirectDamage(zoneInput);
            const detonationTotal = amounts.reduce((sum, value) => sum + value * 1.5, 0);
            const expected = {
                nonCrit: directExpected.nonCrit + detonationTotal + zoneExpected.nonCrit * zoneCount,
                crit: directExpected.crit + detonationTotal + zoneExpected.nonCrit * zoneCount,
                expected: directExpected.expected + detonationTotal + zoneExpected.nonCrit * zoneCount
            };
            for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], "independent composition Lv" + level + " zone " + zoneCount + " " + key);
            assert.equal(actual.components["own-wind-dot-detonation"].nonCrit, amounts[0] * 1.5);
            assert.equal(actual.components["own-physical-dot-detonation"].nonCrit, amounts[1] * 1.5);
            assert.equal(actual.components["own-fire-dot-detonation"].nonCrit, amounts[2] * 1.5);
            assert.equal(actual.components["own-thunder-dot-detonation"].nonCrit, amounts[3] * 1.5);
            assertClose(actual.nonCrit - (directExpected.nonCrit + detonationTotal), zoneExpected.nonCrit * zoneCount, "zone events use only explicit count");
        }
    }
});

test("Serin full Ultimate is locally unresolved when any required snapshot input is omitted or invalid", async () => {
    const { data, engine } = await loadProductionFixture();
    const parent = attackOf(data, "1410032");
    const amounts = [0, 29.75, 812.625, 1450.125];
    const complete = makeUltimateSequence(data, parent, 10, amounts, 0);
    const missing = { ...complete, modifierInputs: { ...complete.modifierInputs } };
    delete missing.modifierInputs["serin-detonation-original:1410043"];
    assert.equal(engine.calculate(missing).supported, false, "missing is not replaced by a zero DoT");

    for (const count of [-1, 1.5, 9]) {
        const invalid = { ...complete, modifierInputs: { ...complete.modifierInputs, "serin-zone-proc-count": count } };
        assert.equal(engine.calculate(invalid).supported, false, "invalid zone count " + count + " is rejected");
    }
});
