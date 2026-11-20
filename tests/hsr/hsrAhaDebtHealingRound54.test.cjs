"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProductionFixture, attackOf, assertClose } = require("./helpers/hsrDirectVerification.cjs");

const AHA = { id: "1511", level: 80, eidolon: 0, stats: { atk: 3000, hp: 6000, def: 2000, critRate: 35, critDamage: 120, damageBonus: 0, elation: 100, merrymake: 0 }, baseStats: { atk: 1000, hp: 1000, def: 1000 } };
const DAMAGE_KEYS = ["nonCrit", "crit", "expected"];
const MAX_HP = 100000;

function healingInput(data, { hpPercent = 40, change = 20000, layerCount = 2, priorDebtPercent = 10, hpOwner = "independent", reason = "normal" } = {}) {
    const source = attackOf(data, "151101");
    return {
        character: structuredClone(AHA),
        enemy: { count: 1, level: 80, resistance: 20, weakness: false, toughnessActive: true, defenseReduction: 0, defenseIgnore: 0, resistancePenetration: 0, takenDamage: 0, maxHp: MAX_HP, hpPercent },
        modifiers: [],
        modifierInputs: { "elation-certified-banger": 0 },
        elation: { context: source.elationContext, certifiedBanger: 0, punchline: 0, fervor: 0, merrymake: 0 },
        attack: { ...source, traceLevel: 6, multiplier: source.multipliers[5], attackType: source.type },
        ahaDebtSnapshot: {
            requested: true,
            priorDebtPercent,
            hpEvent: { kind: "heal", change, layerCount, hpOwner, reason }
        }
    };
}

// Literal test-side transcription of the pinned plural-HP heal task sequence.
// It is deliberately independent of HsrCalcEngine.calculateAhaHpEvent.
function expectedPluralHeal({ maxHp, initialHp, priorDebtPercent, change, layerCount }) {
    const perLayer = maxHp / layerCount;
    const occupiedLayer = Math.max(0, Math.min(Math.ceil(initialHp / perLayer), layerCount) - 1);
    const hpInOccupiedLayer = initialHp - perLayer * occupiedLayer;
    const effectiveLayerCap = perLayer * (1 - priorDebtPercent / 100);
    const normalHpAfter = initialHp + change;
    const healLayer = priorDebtPercent > 0 ? Math.min(
        Math.floor((hpInOccupiedLayer + change) / effectiveLayerCap),
        (layerCount - 1) - occupiedLayer
    ) : 0;
    const dirtyHpHeal = healLayer * perLayer * priorDebtPercent / 100;
    const afterDirtyHeal = normalHpAfter + dirtyHpHeal;
    const currentLayer = afterDirtyHeal - perLayer * Math.max(0, Math.min(Math.ceil(afterDirtyHeal / perLayer), layerCount) - 1);
    const dirtyHpLoss = priorDebtPercent > 0 ? Math.max(0, currentLayer - effectiveLayerCap) : 0;
    const hpAfter = dirtyHpLoss > 0
        ? Math.max(Math.min(afterDirtyHeal, 1), afterDirtyHeal - dirtyHpLoss)
        : afterDirtyHeal;
    return {
        normalHpAfter,
        hpAfter,
        debtPercentAfter: priorDebtPercent,
        debtHpAfter: perLayer * priorDebtPercent / 100,
        dirtyHpHeal,
        dirtyHpLoss,
        actualDirtyHpLoss: Math.max(0, afterDirtyHeal - hpAfter),
        crossedLayers: healLayer,
        additionalHitDamage: 0
    };
}

function assertEventMatchesOracle(result, oracle, label) {
    assert.equal(result.ahaDebt.supported, true, `${label}: ${result.ahaDebt.reason || ""}`);
    const update = result.ahaDebt.update;
    assert.equal(result.ahaDebt.kind, "hpEvent");
    for (const [field, expected] of Object.entries(oracle)) assertClose(update[field], expected, `${label} ${field}`);
}

function assertDamageUnaffected(actual, baseline, label) {
    assert.notEqual(actual.supported, false, `${label}: primary damage remains calculable`);
    for (const key of DAMAGE_KEYS) assertClose(actual[key], baseline[key], `${label} preserves primary ${key}`);
}

test("Round54 plural-HP healing follows the fixed layer formula and keeps debt as HP state", async () => {
    const { data, engine } = await loadProductionFixture();
    const input = healingInput(data);
    const baseline = engine.calculate({ ...input, ahaDebtSnapshot: undefined });
    const result = engine.calculate(input);
    const expected = expectedPluralHeal({ maxHp: MAX_HP, initialHp: 40000, priorDebtPercent: 10, change: 20000, layerCount: 2 });

    assertDamageUnaffected(result, baseline, "two-layer heal");
    assertEventMatchesOracle(result, expected, "two-layer heal");
    assert.equal(result.ahaDebt.update.normalHpAfter, 60000);
    assert.equal(result.ahaDebt.update.hpAfter, 65000);
    assert.equal(result.ahaDebt.update.dirtyHpHeal, 5000);
    assert.equal(result.ahaDebt.update.dirtyHpLoss, 0);
    assert.equal(result.ahaDebt.update.debtPercentAfter, 10);
    assert.equal(result.ahaDebt.update.additionalHitDamage, 0);
});

test("Round54 healing crosses the debt-adjusted 45,000 HP layer cap at the exact floor boundary", async () => {
    const { data, engine } = await loadProductionFixture();
    const baselineInput = healingInput(data, { change: 0 });
    const baseline = engine.calculate({ ...baselineInput, ahaDebtSnapshot: undefined });

    for (const [change, expectedDirtyHeal, expectedHp] of [[4999, 0, 44999], [5000, 5000, 45000], [5001, 5000, 50001]]) {
        const input = healingInput(data, { change });
        const result = engine.calculate(input);
        const expected = expectedPluralHeal({ maxHp: MAX_HP, initialHp: 40000, priorDebtPercent: 10, change, layerCount: 2 });
        assertDamageUnaffected(result, baseline, `layer boundary ${change}`);
        assertEventMatchesOracle(result, expected, `layer boundary ${change}`);
        assert.equal(result.ahaDebt.update.dirtyHpHeal, expectedDirtyHeal);
        assert.equal(result.ahaDebt.update.hpAfter, expectedHp);
    }
});

test("Round54 healing trims only the excess above the current debt-adjusted layer cap", async () => {
    const { data, engine } = await loadProductionFixture();
    const input = healingInput(data, { hpPercent: 65, change: 31000 });
    const baseline = engine.calculate({ ...input, ahaDebtSnapshot: undefined });
    const result = engine.calculate(input);
    const expected = expectedPluralHeal({ maxHp: MAX_HP, initialHp: 65000, priorDebtPercent: 10, change: 31000, layerCount: 2 });

    assertDamageUnaffected(result, baseline, "upper layer heal");
    assertEventMatchesOracle(result, expected, "upper layer heal");
    assert.equal(result.ahaDebt.update.normalHpAfter, 96000);
    assert.equal(result.ahaDebt.update.dirtyHpHeal, 0);
    assert.equal(result.ahaDebt.update.dirtyHpLoss, 1000);
    assert.equal(result.ahaDebt.update.actualDirtyHpLoss, 1000);
    assert.equal(result.ahaDebt.update.hpAfter, 95000);
});

test("Round54 zero debt and internally generated DirtyHPHeal do not repeat the conversion", async () => {
    const { data, engine } = await loadProductionFixture();
    const zeroDebt = engine.calculate(healingInput(data, { priorDebtPercent: 0 }));
    const zeroOracle = expectedPluralHeal({ maxHp: MAX_HP, initialHp: 40000, priorDebtPercent: 0, change: 20000, layerCount: 2 });
    assertEventMatchesOracle(zeroDebt, zeroOracle, "zero debt");
    assert.equal(zeroDebt.ahaDebt.update.hpAfter, 60000);
    assert.equal(zeroDebt.ahaDebt.update.dirtyHpHeal, 0);

    const internal = engine.calculate(healingInput(data, { reason: "DirtyHPHeal" }));
    assert.equal(internal.ahaDebt.supported, true, internal.ahaDebt.reason || "");
    assert.equal(internal.ahaDebt.event.ignoredForDebt, true);
    assert.equal(internal.ahaDebt.update.normalHpAfter, 60000);
    assert.equal(internal.ahaDebt.update.hpAfter, 60000);
    assert.equal(internal.ahaDebt.update.dirtyHpHeal, 0);
    assert.equal(internal.ahaDebt.update.dirtyHpLoss, 0);
    assert.equal(internal.ahaDebt.update.debtPercentAfter, 10);
});

test("Round54 single-layer healing preserves debt, while invalid or out-of-scope heal snapshots stop locally", async () => {
    const { data, engine } = await loadProductionFixture();
    const oneLayer = healingInput(data, { hpPercent: 40, change: 20000, layerCount: 1 });
    const baseline = engine.calculate({ ...oneLayer, ahaDebtSnapshot: undefined });
    const oneLayerResult = engine.calculate(oneLayer);
    assert.equal(oneLayerResult.ahaDebt.supported, true, oneLayerResult.ahaDebt.reason || "");
    assert.equal(oneLayerResult.ahaDebt.update.hpAfter, 60000);
    assert.equal(oneLayerResult.ahaDebt.update.debtPercentAfter, 10);
    assert.equal(oneLayerResult.ahaDebt.update.dirtyHpHeal, 0);
    assert.equal(oneLayerResult.ahaDebt.update.dirtyHpLoss, 0);
    assertDamageUnaffected(oneLayerResult, baseline, "single-layer ordinary heal");

    const invalid = [
        { label: "missing actual heal", event: { kind: "heal", layerCount: 2, hpOwner: "independent", reason: "normal" } },
        { label: "negative actual heal", event: { kind: "heal", change: -1, layerCount: 2, hpOwner: "independent", reason: "normal" } },
        { label: "unknown owner", event: { kind: "heal", change: 20000, layerCount: 2, hpOwner: "displayChild", reason: "normal" } },
        { label: "debt bonus beyond total maximum", event: { kind: "heal", change: 60000, layerCount: 2, hpOwner: "independent", reason: "normal" } }
    ];
    for (const item of invalid) {
        const changed = structuredClone(oneLayer);
        changed.ahaDebtSnapshot.hpEvent = item.event;
        if (item.label === "debt bonus beyond total maximum") changed.ahaDebtSnapshot.hpEvent = item.event;
        const result = engine.calculate(changed);
        assertDamageUnaffected(result, baseline, item.label);
        assert.equal(result.ahaDebt.supported, false, `${item.label}: ${result.ahaDebt.reason || ""}`);
    }

    const overlap = healingInput(data, { hpPercent: 80, layerCount: 1 });
    const overlapBaseline = engine.calculate({ ...overlap, ahaDebtSnapshot: undefined });
    const overlapResult = engine.calculate(overlap);
    assert.equal(overlapResult.ahaDebt.supported, false, "overlapping one-layer HP and prior debt stops only the sidecar");
    assertDamageUnaffected(overlapResult, overlapBaseline, "one-layer overlap");
});
