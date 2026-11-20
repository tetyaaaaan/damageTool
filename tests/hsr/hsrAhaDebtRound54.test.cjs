"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProductionFixture, attackOf, assertClose } = require("./helpers/hsrDirectVerification.cjs");

const AHA = { id: "1511", level: 80, eidolon: 0, stats: { atk: 3000, hp: 6000, def: 2000, critRate: 35, critDamage: 120, damageBonus: 0, elation: 100, merrymake: 0 }, baseStats: { atk: 1000, hp: 1000, def: 1000 } };
const ENEMY = { count: 1, level: 80, resistance: 20, weakness: false, toughnessActive: true, defenseReduction: 0, defenseIgnore: 0, resistancePenetration: 0, takenDamage: 0 };
const DAMAGE_KEYS = ["nonCrit", "crit", "expected"];

function makeInput(data, { maxHp = 300000, hpBefore = 250000 } = {}) {
    const source = attackOf(data, "151101");
    const context = source.elationContext === "certifiedBanger" ? "certifiedBanger" : "ahaInstant";
    return {
        character: structuredClone(AHA),
        enemy: { ...structuredClone(ENEMY), maxHp, hpPercent: hpBefore / maxHp * 100 },
        modifiers: [],
        modifierInputs: {},
        elation: { context, certifiedBanger: 0, punchline: 0, fervor: 0, merrymake: 0 },
        attack: { ...source, traceLevel: 6, multiplier: source.multipliers[5], attackType: source.type }
    };
}

function withDebtEvent(input, priorDebtPercent, hpEvent) {
    return { ...structuredClone(input), ahaDebtSnapshot: { requested: true, priorDebtPercent, hpEvent: hpEvent && structuredClone(hpEvent) } };
}

function assertPrimaryUnchanged(actual, baseline, label) {
    assert.notEqual(actual.supported, false, `${label}: the attack itself remains supported`);
    for (const key of DAMAGE_KEYS) assertClose(actual[key], baseline[key], `${label}: primary ${key} remains unchanged`);
}

function assertUpdate(update, expected, label) {
    for (const [key, value] of Object.entries(expected)) assertClose(update[key], value, `${label} ${key}`);
}

const normalDamage = (layerCount, change, hpOwner = "independent") => ({ layerCount, change, hpOwner, kind: "damage", reason: "normal" });

test("Round54 observed multi-layer HP loss follows the ordered phase carry loop", async () => {
    const { data, engine } = await loadProductionFixture();
    const cases = [
        {
            name: "capped carry with remaining damage",
            maxHp: 300000, hpBefore: 250000, prior: 10,
            event: normalDamage(3, -60000),
            expected: { normalHpAfter: 190000, hpAfter: 180000, debtPercentAfter: 12.5, debtHpAfter: 12500, dirtyHpLoss: 10000, dirtyHpHeal: 0, actualDirtyHpLoss: 10000, crossedLayers: 1, additionalHitDamage: 0 }
        },
        {
            name: "below-cap carry retains the ratio across one crossed layer",
            maxHp: 300000, hpBefore: 230000, prior: 0,
            event: normalDamage(3, -50000),
            expected: { normalHpAfter: 180000, hpAfter: 172500, debtPercentAfter: 12.5, debtHpAfter: 12500, dirtyHpLoss: 7500, dirtyHpHeal: 0, actualDirtyHpLoss: 7500, crossedLayers: 1, additionalHitDamage: 0 }
        },
        {
            name: "batch cap counts multiple layers in order",
            maxHp: 500000, hpBefore: 450000, prior: 10,
            event: normalDamage(5, -230000),
            expected: { normalHpAfter: 220000, hpAfter: 190000, debtPercentAfter: 10, debtHpAfter: 10000, dirtyHpLoss: 30000, dirtyHpHeal: 0, actualDirtyHpLoss: 30000, crossedLayers: 3, additionalHitDamage: 0 }
        }
    ];

    for (const scenario of cases) {
        const input = makeInput(data, scenario);
        const baseline = engine.calculate(input);
        const actual = engine.calculate(withDebtEvent(input, scenario.prior, scenario.event));
        assertPrimaryUnchanged(actual, baseline, scenario.name);
        assert.equal(actual.ahaDebt.supported, true, `${scenario.name}: ${actual.ahaDebt.reason || ""}`);
        assert.equal(actual.ahaDebt.kind, "hpEvent");
        assert.equal(actual.ahaDebt.hpOwner, "independent");
        assert.equal(actual.ahaDebt.layerCount, scenario.event.layerCount);
        assertClose(actual.ahaDebt.maxHpPerLayer, scenario.maxHp / scenario.event.layerCount, `${scenario.name} max HP per layer`);
        assertUpdate(actual.ahaDebt.update, scenario.expected, scenario.name);
    }
});

test("Round54 last-layer and fractional or zero HP events do not invent a layer crossing", async () => {
    const { data, engine } = await loadProductionFixture();
    const cases = [
        {
            name: "last HP layer",
            params: { maxHp: 300000, hpBefore: 80000, prior: 0 },
            event: normalDamage(3, -10000),
            expected: { normalHpAfter: 70000, hpAfter: 70000, debtPercentAfter: 2.5, debtHpAfter: 2500, dirtyHpLoss: 0, dirtyHpHeal: 0, actualDirtyHpLoss: 0, crossedLayers: 0, additionalHitDamage: 0 }
        },
        {
            name: "fractional loss remains fractional",
            params: { maxHp: 300000, hpBefore: 80000, prior: 0 },
            event: normalDamage(3, -0.5),
            expected: { normalHpAfter: 79999.5, hpAfter: 79999.5, debtPercentAfter: 0.000125, debtHpAfter: 0.125, dirtyHpLoss: 0, dirtyHpHeal: 0, actualDirtyHpLoss: 0, crossedLayers: 0, additionalHitDamage: 0 }
        },
        {
            name: "zero loss preserves existing ratio",
            params: { maxHp: 300000, hpBefore: 80000, prior: 5 },
            event: normalDamage(3, 0),
            expected: { normalHpAfter: 80000, hpAfter: 80000, debtPercentAfter: 5, debtHpAfter: 5000, dirtyHpLoss: 0, dirtyHpHeal: 0, actualDirtyHpLoss: 0, crossedLayers: 0, additionalHitDamage: 0 }
        },
        {
            name: "dirty HP floor prevents debt mutation from reducing HP below one",
            params: { maxHp: 300, hpBefore: 101, prior: 0 },
            event: normalDamage(3, -100),
            expected: { normalHpAfter: 1, hpAfter: 1, debtPercentAfter: 25, debtHpAfter: 25, dirtyHpLoss: 0.25, dirtyHpHeal: 0, actualDirtyHpLoss: 0, crossedLayers: 1, additionalHitDamage: 0 }
        }
    ];

    for (const scenario of cases) {
        const input = makeInput(data, scenario.params);
        const baseline = engine.calculate(input);
        const actual = engine.calculate(withDebtEvent(input, scenario.params.prior, scenario.event));
        assertPrimaryUnchanged(actual, baseline, scenario.name);
        assert.equal(actual.ahaDebt.supported, true, `${scenario.name}: ${actual.ahaDebt.reason || ""}`);
        assertUpdate(actual.ahaDebt.update, scenario.expected, scenario.name);
    }
});

test("Round54 HPShare Main owns one debt update while a live Sub is rejected", async () => {
    const { data, engine } = await loadProductionFixture();
    const input = makeInput(data, { maxHp: 300000, hpBefore: 80000 });
    const baseline = engine.calculate(input);
    const event = normalDamage(3, -1000);
    const main = engine.calculate(withDebtEvent(input, 1, { ...event, hpOwner: "shareMain" }));
    const independent = engine.calculate(withDebtEvent(input, 1, event));
    assertPrimaryUnchanged(main, baseline, "HPShare Main");
    assertPrimaryUnchanged(independent, baseline, "independent owner");
    assert.equal(main.ahaDebt.supported, true);
    assert.equal(main.ahaDebt.hpOwner, "shareMain");
    assert.equal(independent.ahaDebt.supported, true);
    assert.deepEqual(main.ahaDebt.update, independent.ahaDebt.update, "the same single main-owned event applies once, with no Sub propagation");

    const sub = engine.calculate(withDebtEvent(input, 1, { ...event, hpOwner: "shareSub" }));
    assertPrimaryUnchanged(sub, baseline, "HPShare Sub");
    assert.equal(sub.ahaDebt.supported, false);
    assert.match(sub.ahaDebt.reason, /共有HP/);
    assert.equal(Object.hasOwn(sub.ahaDebt, "update"), false);
});

test("Round54 observed HP events stay separate from theory damage and unsupported HP states", async () => {
    const { data, engine } = await loadProductionFixture();
    const input = makeInput(data, { maxHp: 300000, hpBefore: 250000 });
    const baseline = engine.calculate(input);
    const theory = engine.calculate({ ...structuredClone(input), ahaDebtSnapshot: { requested: true, singleLayerNoShare: true, priorDebtPercent: 10 } });
    const observed = engine.calculate(withDebtEvent(input, 10, normalDamage(3, -60000)));
    assertPrimaryUnchanged(theory, baseline, "theory sidecar");
    assertPrimaryUnchanged(observed, baseline, "observed event sidecar");
    assert.equal(theory.ahaDebt.kind, "dirtyHPRatio");
    assert.equal(observed.ahaDebt.kind, "hpEvent");
    assert.equal(Object.hasOwn(observed.ahaDebt, "branches"), false);
    assertClose(observed.ahaDebt.update.normalHpAfter, 190000, "observed event uses signed HP delta, not attack damage");

    const invalidCases = [
        { name: "missing event", snapshot: { requested: true, priorDebtPercent: 10 } },
        { name: "invalid layer count", prior: 10, event: normalDamage(0, -1000) },
        { name: "damage with heal sign", prior: 10, event: normalDamage(3, 1000) },
        { name: "unknown HP reason", prior: 10, event: { ...normalDamage(3, -1000), reason: "phaseChange" } },
        { name: "lethal event", prior: 0, hpBefore: 100000, event: normalDamage(3, -100000) }
    ];
    for (const item of invalidCases) {
        const changed = makeInput(data, { maxHp: 300000, hpBefore: item.hpBefore ?? 250000 });
        const snapshot = item.snapshot || { requested: true, priorDebtPercent: item.prior ?? 10, hpEvent: item.event };
        const result = engine.calculate({ ...changed, ahaDebtSnapshot: structuredClone(snapshot) });
        assertPrimaryUnchanged(result, baseline, item.name);
        assert.equal(result.ahaDebt.supported, false, `${item.name}: ${result.ahaDebt.reason || ""}`);
        assert.equal(Object.hasOwn(result.ahaDebt, "update"), false, `${item.name} has no partial update`);
    }
});

test("Round54 native DirtyHPDamage recursion reason is ignored by debt accrual", async () => {
    const { data, engine } = await loadProductionFixture();
    const input = makeInput(data, { maxHp: 300000, hpBefore: 250000 });
    const baseline = engine.calculate(input);
    const event = { ...normalDamage(3, -10000), reason: "DirtyHPDamage" };
    const actual = engine.calculate(withDebtEvent(input, 10, event));
    assertPrimaryUnchanged(actual, baseline, "recursive DirtyHPDamage event");
    assert.equal(actual.ahaDebt.supported, true);
    assert.equal(actual.ahaDebt.event.ignoredForDebt, true);
    assertUpdate(actual.ahaDebt.update, {
        normalHpAfter: 240000, hpAfter: 240000, debtPercentAfter: 10, debtHpAfter: 10000,
        dirtyHpLoss: 0, dirtyHpHeal: 0, actualDirtyHpLoss: 0, crossedLayers: 0, additionalHitDamage: 0
    }, "recursive DirtyHPDamage event");
});

test("Round54 HP event reasons must match their HP change kind", async () => {
    const { data, engine } = await loadProductionFixture();
    const input = makeInput(data, { maxHp: 300000, hpBefore: 250000 });
    const baseline = engine.calculate(input);
    const mismatches = [
        { name: "damage labeled DirtyHPHeal", event: { ...normalDamage(3, -1000), reason: "DirtyHPHeal" } },
        { name: "heal labeled DirtyHPDamage", event: { kind: "heal", change: 1000, layerCount: 3, hpOwner: "independent", reason: "DirtyHPDamage" } }
    ];

    for (const item of mismatches) {
        const actual = engine.calculate(withDebtEvent(input, 10, item.event));
        assertPrimaryUnchanged(actual, baseline, item.name);
        assert.equal(actual.ahaDebt.supported, false, `${item.name}: ${actual.ahaDebt.reason || ""}`);
        assert.equal(Object.hasOwn(actual.ahaDebt, "update"), false, `${item.name} has no partial update`);
    }
});
