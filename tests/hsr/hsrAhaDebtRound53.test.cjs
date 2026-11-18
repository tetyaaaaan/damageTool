"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProductionFixture, attackOf, assertClose } = require("./helpers/hsrDirectVerification.cjs");

const AHA = { id: "1511", level: 80, eidolon: 0, stats: { atk: 3000, hp: 6000, def: 2000, critRate: 35, critDamage: 120, damageBonus: 0, elation: 100, merrymake: 0 }, baseStats: { atk: 1000, hp: 1000, def: 1000 } };
const MEMBER = { id: "1502", level: 80, eidolon: 0, stats: { atk: 2700, hp: 7000, def: 1800, critRate: 50, critDamage: 160, damageBonus: 0, elation: 180, merrymake: 0 }, baseStats: { atk: 1000, hp: 1000, def: 1000 } };
const ENEMY = { count: 1, level: 80, resistance: 20, weakness: false, toughnessActive: true, defenseReduction: 0, defenseIgnore: 0, resistancePenetration: 0, takenDamage: 0, maxHp: 100000, hpPercent: 80 };
const SNAPSHOT = { requested: true, singleLayerNoShare: true, priorDebtPercent: 10 };
const DAMAGE_KEYS = ["nonCrit", "crit", "expected"];

function directInput(source, level, overrides = {}) {
    const character = structuredClone(overrides.character || AHA);
    const enemy = structuredClone(overrides.enemy || ENEMY);
    const context = source.elationContext === "certifiedBanger" ? "certifiedBanger" : "ahaInstant";
    return {
        character,
        enemy,
        modifiers: overrides.modifiers || [],
        modifierInputs: { ...(overrides.modifierInputs || {}) },
        elation: { context, certifiedBanger: 0, punchline: 0, fervor: 0, merrymake: character.stats.merrymake },
        attack: { ...source, traceLevel: level, multiplier: source.multipliers[level - 1], attackType: source.type, ...overrides.attack }
    };
}

function setDebt(input, snapshot = SNAPSHOT) {
    return { ...structuredClone(input), ahaDebtSnapshot: structuredClone(snapshot) };
}

function expectedElation(multiplier, character, enemy, punchline, modifiers = []) {
    const sum = (category) => modifiers.filter((item) => item.category === category && item.enabled !== false && item.applicable !== false).reduce((total, item) => total + item.value, 0);
    const defenseIgnore = enemy.defenseReduction + enemy.defenseIgnore + sum("defenseIgnore");
    const defense = 100 / (100 + 100 * (1 - defenseIgnore / 100));
    const resistance = 1 - (enemy.resistance - enemy.resistancePenetration - sum("resistancePenetration")) / 100;
    const toughness = enemy.toughnessActive ? 0.9 : 1;
    const nonCrit = 7535.107 * multiplier / 100 * (1 + character.stats.elation / 100)
        * (1 + 5 * punchline / (punchline + 240)) * (1 + character.stats.merrymake / 100)
        * defense * resistance * toughness * (1 + (enemy.takenDamage + sum("takenDamage")) / 100);
    const critRate = Math.min(100, character.stats.critRate + sum("critRate")) / 100;
    const critDamage = (character.stats.critDamage + sum("critDamage")) / 100;
    return { nonCrit, crit: nonCrit * (1 + critDamage), expected: nonCrit * (1 + critRate * critDamage) };
}

function expectedDamage(data, id) {
    if (id === "1511022") {
        const own = expectedDamage(data, "151102");
        const member = expectedElation(20, MEMBER, ENEMY, 0);
        return Object.fromEntries(DAMAGE_KEYS.map((key) => [key, own[key] + member[key]]));
    }
    if (id === "1511202") {
        const body = expectedDamage(data, "151120");
        const prior = 123456;
        return Object.fromEntries(DAMAGE_KEYS.map((key) => [key, body[key] + (prior + body[key]) * 0.2]));
    }
    const level = id === "151101" ? 6 : 10;
    const input = makeInput(data, id);
    let multiplier = input.attack.multiplier;
    if (Array.isArray(input.attack.elationComponents)) {
        multiplier = input.attack.elationComponents.reduce((sum, component) => sum + component.count * component.multipliers[level - 1], 0);
    }
    if (id === "151103") multiplier = 200 + 5 * 60;
    const punchline = id === "151120" ? 40 : 0;
    return expectedElation(multiplier, input.character, input.enemy, punchline, input.modifiers || []);
}

function expectedDebt(damage, priorDebtPercent, maxHp, initialHp) {
    const debtPercentAfter = priorDebtPercent + damage / maxHp * 25;
    const debtHpAfter = maxHp * debtPercentAfter / 100;
    return {
        normalHpLoss: damage,
        additionalHitDamage: 0,
        hpAfter: initialHp - damage,
        debtPercentAfter,
        debtHpAfter
    };
}

function makeInput(data, id) {
    if (id === "1511022") {
        const composite = attackOf(data, id);
        const own = directInput(attackOf(data, "151102"), 10);
        const emanator = directInput(attackOf(data, "1511021"), 10, {
            character: MEMBER,
            attack: { multiplier: 20, attackType: "additional", completedReferenceSnapshot: true, ahaEmanatorId: "1502", damageOwnerId: "1502", element: "Physical" }
        });
        return {
            character: structuredClone(AHA), enemy: structuredClone(ENEMY), modifiers: [], modifierInputs: {},
            elation: { context: "ahaInstant", certifiedBanger: 0, punchline: 0, fervor: 0, merrymake: 0 },
            attack: { ...composite, traceLevel: 10, multiplier: composite.multipliers[9] },
            sequenceComponents: [
                { key: "aha", name: "Aha follow-up", input: own },
                { key: "emanator", name: "Member rider", input: emanator }
            ]
        };
    }
    if (id === "1511202") {
        const source = attackOf(data, id);
        const input = directInput(source, 10, { modifierInputs: { "aha-prior-non-true-damage": 123456 }, attack: { attackType: "elation" } });
        input.elation.punchline = 40;
        return input;
    }
    const level = id === "151101" ? 6 : 10;
    const source = attackOf(data, id);
    const overrides = id === "151103" ? { modifierInputs: { "aha-wish": 18 } }
        : id === "1511021" ? { character: MEMBER, attack: { multiplier: 20, attackType: "additional", completedReferenceSnapshot: true, ahaEmanatorId: "1502", damageOwnerId: "1502", element: "Physical" } }
        : id === "151120" ? { elation: { context: "ahaInstant", punchline: 40, fervor: 0, merrymake: 0 } }
        : {};
    const input = directInput(source, level, overrides);
    if (id === "151103") input.modifiers = [
        { id: "aha-e0-crit", category: "critRate", value: 12, enabled: true, applicable: true },
        { id: "aha-e0-def-ignore", category: "defenseIgnore", value: 30, enabled: true, applicable: true }
    ];
    if (id === "151120") input.elation = { context: "ahaInstant", punchline: 40, fervor: 0, merrymake: 0 };
    return input;
}

test("Round53 Aha debt sidecar is isolated and uses each of the seven adopted Aha damage actions", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const id of ["151101", "151102", "1511021", "1511022", "151103", "151120", "1511202"]) {
        const original = makeInput(data, id);
        const without = engine.calculate(original);
        assert.notEqual(without.supported, false, `${id} baseline: ${without.reason || ""}`);
        assert.equal(Object.hasOwn(without, "ahaDebt"), false, `${id} without an opt-in snapshot has no debt output`);
        const independent = expectedDamage(data, id);
        for (const key of DAMAGE_KEYS) assertClose(without[key], independent[key], `${id} independent E0 ${key}`);

        const withDebt = engine.calculate(setDebt(original));
        assert.notEqual(withDebt.supported, false, `${id} main damage remains supported: ${withDebt.reason || ""}`);
        assert.equal(withDebt.ahaDebt.supported, true, `${id}: ${withDebt.ahaDebt.reason || ""}`);
        for (const key of DAMAGE_KEYS) assertClose(withDebt[key], without[key], `${id} main ${key} is unchanged by the debt sidecar`);

        const { maxHp, initialHp, priorDebtPercent } = withDebt.ahaDebt;
        assert.equal(maxHp, 100000);
        assert.equal(initialHp, 80000);
        assert.equal(priorDebtPercent, 10);
        for (const key of DAMAGE_KEYS) {
            const actual = withDebt.ahaDebt.branches[key];
            const expected = expectedDebt(independent[key], 10, maxHp, initialHp);
            for (const field of Object.keys(expected)) assertClose(actual[field], expected[field], `${id} ${key} ${field}`);
            assert.equal(actual.additionalHitDamage, 0, `${id} debt bookkeeping is not another damage hit`);
        }
        assert.equal(withDebt.ahaDebt.maxHp, original.enemy.maxHp, `${id} uses MaxHP as a snapshot scale without changing it`);
    }
});

test("Round53 Aha debt sidecar rejects missing or impossible snapshots without blocking ordinary damage", async () => {
    const { data, engine } = await loadProductionFixture();
    const input = makeInput(data, "151101");
    const baseline = engine.calculate(input);
    assert.notEqual(baseline.supported, false, baseline.reason || "");

    const invalids = [
        { name: "maxHP missing", update: (x) => { delete x.enemy.maxHp; } },
        { name: "maxHP zero", update: (x) => { x.enemy.maxHp = 0; } },
        { name: "HP percentage missing", update: (x) => { delete x.enemy.hpPercent; } },
        { name: "HP percentage out of range", update: (x) => { x.enemy.hpPercent = 100.01; } },
        { name: "debt ratio negative", snapshot: { ...SNAPSHOT, priorDebtPercent: -0.01 } },
        { name: "debt ratio reaches cap", snapshot: { ...SNAPSHOT, priorDebtPercent: 100 } },
        { name: "HP plus debt exceeds MaxHP", snapshot: { ...SNAPSHOT, priorDebtPercent: 20 }, update: (x) => { x.enemy.hpPercent = 90; } },
        { name: "HP loss is lethal", update: (x) => { x.enemy.hpPercent = 0.01; } },
        { name: "ratio would reach cap", snapshot: { ...SNAPSHOT, priorDebtPercent: 99.5 }, update: (x) => { x.enemy.hpPercent = 0.4; } },
        { name: "share or layer state is outside the snapshot", snapshot: { ...SNAPSHOT, singleLayerNoShare: false } }
    ];

    for (const item of invalids) {
        const changed = structuredClone(input);
        item.update?.(changed);
        const result = engine.calculate(setDebt(changed, item.snapshot || SNAPSHOT));
        assert.notEqual(result.supported, false, `${item.name}: ordinary damage should remain calculable`);
        assert.equal(result.ahaDebt.supported, false, `${item.name}: ${result.ahaDebt.reason || ""}`);
        for (const key of DAMAGE_KEYS) assertClose(result[key], baseline[key], `${item.name} leaves primary ${key} unchanged`);
    }
});

test("Round53 Aha debt sidecar does not infer zero prior debt or alter enemy MaxHP", async () => {
    const { data, engine } = await loadProductionFixture();
    const input = makeInput(data, "151101");
    const noDebtSnapshot = { requested: true, singleLayerNoShare: true };
    const missing = engine.calculate(setDebt(input, noDebtSnapshot));
    assert.notEqual(missing.supported, false);
    assert.equal(missing.ahaDebt.supported, false, "missing prior dirty ratio is not silently treated as 0%");

    const withDebt = engine.calculate(setDebt(input));
    assert.equal(withDebt.ahaDebt.supported, true);
    assert.equal(withDebt.ahaDebt.maxHp, input.enemy.maxHp);
    assert.equal(withDebt.ahaDebt.branches.nonCrit.hpAfter + withDebt.ahaDebt.branches.nonCrit.normalHpLoss, 80000);
    assert.notEqual(withDebt.ahaDebt.branches.nonCrit.debtHpAfter, withDebt.ahaDebt.branches.nonCrit.normalHpLoss, "debt HP is an independent snapshot field, not extra immediate HP loss");
});

test("Round53 one-layer debt ratio uses 25% of exact damage and preserves fractional damage", async () => {
    const { data, engine } = await loadProductionFixture();
    const input = makeInput(data, "151101");
    const maxHp = 100000;
    const nonElationScale = 7535.107 * 0.5 * 0.5 * 0.8 * 0.9;
    input.character.stats.elation = (4000 / nonElationScale - 1) * 100;
    input.enemy.maxHp = maxHp;
    input.enemy.hpPercent = 80;
    const source = engine.calculate(setDebt(input, { requested: true, singleLayerNoShare: true, priorDebtPercent: 10 }));
    assert.notEqual(source.supported, false);
    assert.equal(source.ahaDebt.supported, true);
    assertClose(source.nonCrit, 4000, "independent Lv6 normal formula is tuned to 4,000 nonCrit");
    assertClose(source.ahaDebt.branches.nonCrit.normalHpLoss, 4000);
    assertClose(source.ahaDebt.branches.nonCrit.hpAfter, 76000);
    assertClose(source.ahaDebt.branches.nonCrit.debtPercentAfter, 11);
    assertClose(source.ahaDebt.branches.nonCrit.debtHpAfter, 11000);
    assert.equal(source.ahaDebt.branches.nonCrit.additionalHitDamage, 0);

    const fractional = structuredClone(input);
    fractional.character.stats.elation = (4000.5 / nonElationScale - 1) * 100;
    const fractionalResult = engine.calculate(setDebt(fractional, { requested: true, singleLayerNoShare: true, priorDebtPercent: 10 }));
    assertClose(fractionalResult.nonCrit, 4000.5, "fractional damage remains unrounded");
    assertClose(fractionalResult.ahaDebt.branches.nonCrit.debtPercentAfter, 10 + 4000.5 / maxHp * 25);
    assertClose(fractionalResult.ahaDebt.branches.nonCrit.hpAfter, 80000 - 4000.5);
});
