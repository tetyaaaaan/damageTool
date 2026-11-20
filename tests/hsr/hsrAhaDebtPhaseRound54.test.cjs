"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProductionFixture, attackOf, assertClose } = require("./helpers/hsrDirectVerification.cjs");

const DAMAGE_KEYS = ["nonCrit", "crit", "expected"];

function makeInput(data) {
    const attack = attackOf(data, "151101");
    return {
        character: {
            id: "1511", level: 80, eidolon: 0,
            stats: { atk: 3000, hp: 6000, def: 2000, critRate: 35, critDamage: 120, damageBonus: 0, elation: 100, merrymake: 0 },
            baseStats: { atk: 1000, hp: 1000, def: 1000 }
        },
        enemy: {
            count: 1, level: 80, resistance: 20, weakness: false, toughnessActive: true,
            defenseReduction: 0, defenseIgnore: 0, resistancePenetration: 0, takenDamage: 0,
            maxHp: 200000, hpPercent: 100
        },
        modifiers: [], modifierInputs: {},
        elation: { context: attack.elationContext === "certifiedBanger" ? "certifiedBanger" : "ahaInstant", certifiedBanger: 0, punchline: 0, fervor: 0, merrymake: 0 },
        attack: { ...attack, traceLevel: 6, multiplier: attack.multipliers[5], attackType: attack.type }
    };
}

function withEvent(input, priorDebtPercent, hpEvent) {
    return {
        ...structuredClone(input),
        ahaDebtSnapshot: { requested: true, priorDebtPercent, hpEvent: structuredClone(hpEvent) }
    };
}

async function calculateEvent(engine, input, priorDebtPercent, hpEvent) {
    return engine.calculate(withEvent(input, priorDebtPercent, hpEvent));
}

test("Round54 phase clear and restore follow the fixed callback order and independent HP math", async () => {
    const { data, engine } = await loadProductionFixture();
    const input = makeInput(data);
    const baseline = engine.calculate(input);
    input.enemy.hpPercent = 90;

    const cleared = await calculateEvent(engine, input, 10, {
        kind: "phaseClear", change: 0, layerCount: 2, hpOwner: "independent", reason: "normal"
    });
    assert.notEqual(cleared.supported, false, cleared.reason || "");
    assert.equal(cleared.ahaDebt.supported, true, cleared.ahaDebt.reason || "");
    assert.equal(cleared.ahaDebt.event.storedDebtPercent, 10);
    assertClose(cleared.ahaDebt.update.hpAfter, 180000, "phase clear does not change HP");
    assertClose(cleared.ahaDebt.update.debtPercentAfter, 0, "phase clear sets current debt to zero");
    assertClose(cleared.ahaDebt.update.dirtyHpLoss, 0, "phase clear has no HP loss");

    const cases = [
        { saved: 30, hp: 100, currentDebt: 0, expectedDebt: 10, expectedHp: 190000, expectedLoss: 10000 },
        { saved: 8, hp: 100, currentDebt: 0, expectedDebt: 8, expectedHp: 192000, expectedLoss: 8000 },
        { saved: 30, hp: 90, currentDebt: 12, expectedDebt: 12, expectedHp: 180000, expectedLoss: 0 }
    ];

    for (const item of cases) {
        const changed = structuredClone(input);
        changed.enemy.hpPercent = item.hp;
        const restored = await calculateEvent(engine, changed, item.currentDebt, {
            kind: "phaseRestore", change: 0, layerCount: 2, hpOwner: "independent",
            savedDebtPercent: item.saved, reason: "normal"
        });
        assert.notEqual(restored.supported, false, restored.reason || "");
        assert.equal(restored.ahaDebt.supported, true, restored.ahaDebt.reason || "");
        assert.equal(restored.ahaDebt.event.storedDebtPercent, 0, "restore consumes the saved phase snapshot");
        assertClose(restored.ahaDebt.update.debtPercentAfter, item.expectedDebt, `restored ratio for saved ${item.saved}%`);
        assertClose(restored.ahaDebt.update.hpAfter, item.expectedHp, `post-refresh HP for saved ${item.saved}%`);
        assertClose(restored.ahaDebt.update.dirtyHpLoss, item.expectedLoss, `separate dirty HP loss for saved ${item.saved}%`);
        assert.equal(restored.ahaDebt.update.additionalHitDamage, 0, "HP reconciliation is not another attack hit");
    }

    for (const result of [cleared, ...await Promise.all(cases.map(async (item) => {
        const changed = structuredClone(input);
        changed.enemy.hpPercent = item.hp;
        return calculateEvent(engine, changed, item.currentDebt, {
            kind: "phaseRestore", change: 0, layerCount: 2, hpOwner: "independent",
            savedDebtPercent: item.saved, reason: "normal"
        });
    }))]) {
        for (const key of DAMAGE_KEYS) assertClose(result[key], baseline[key], `phase event leaves primary ${key} damage unchanged`);
    }
});

test("Round54 phase HP sidecar rejects missing or mixed phase snapshots locally", async () => {
    const { data, engine } = await loadProductionFixture();
    const input = makeInput(data);
    const baseline = engine.calculate(input);
    const invalidEvents = [
        { name: "phase clear requires multiple layers", prior: 10, event: { kind: "phaseClear", change: 0, layerCount: 1, hpOwner: "independent" } },
        { name: "phase event requires zero HP delta", prior: 10, event: { kind: "phaseClear", change: -1, layerCount: 2, hpOwner: "independent" } },
        { name: "restore requires saved phase ratio", prior: 0, event: { kind: "phaseRestore", change: 0, layerCount: 2, hpOwner: "independent" } },
        { name: "phase event requires an explicit HP owner", prior: 0, event: { kind: "phaseRestore", change: 0, layerCount: 2, savedDebtPercent: 30 } },
        { name: "lethal HP state is not inferred", prior: 0, event: { kind: "damage", change: -1, layerCount: 2, hpOwner: "independent", reason: "normal" }, hpPercent: 0.0005 }
    ];

    for (const item of invalidEvents) {
        const changed = structuredClone(input);
        if (item.hpPercent !== undefined) changed.enemy.hpPercent = item.hpPercent;
        const result = await calculateEvent(engine, changed, item.prior, item.event);
        assert.notEqual(result.supported, false, `${item.name}: main damage remains available`);
        assert.equal(result.ahaDebt.supported, false, `${item.name}: ${result.ahaDebt.reason || ""}`);
        for (const key of DAMAGE_KEYS) assertClose(result[key], baseline[key], `${item.name} leaves primary ${key} damage unchanged`);
    }
});
