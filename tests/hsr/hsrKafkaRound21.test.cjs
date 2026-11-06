"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fixedSourceSha, loadProductionFixture, attackOf, makeRequest, independentDirectDamage, assertClose } = require("./helpers/hsrDirectVerification.cjs");

const snapshots = [
    { id: "1005029", triggerTrace: "skill", triggerLevel: 10, ultimateLevel: 1, triggerAttackId: "100502", shockId: "1005031", rateId: "1005021" },
    { id: "1005039", triggerTrace: "ultimate", triggerLevel: 10, ultimateLevel: 10, triggerAttackId: "100503", shockId: "1005031", rateId: "1005032" },
    { id: "11005029", triggerTrace: "skill", triggerLevel: 1, ultimateLevel: 10, triggerAttackId: "1100502", shockId: "11005031", rateId: "11005021" },
    { id: "11005039", triggerTrace: "ultimate", triggerLevel: 10, ultimateLevel: 10, triggerAttackId: "1100503", shockId: "11005031", rateId: "11005032" },
    { id: "11005049", triggerTrace: "talent", triggerLevel: 10, ultimateLevel: 1, triggerAttackId: "1100504", shockId: "11005031", rateId: "11005041" }
];

const profile = {
    characterLevel: 80, eidolon: 0,
    atk: 3471.25, baseAtk: 1127.5,
    hp: 8923.75, baseHp: 1024.25,
    def: 1397.5, baseDef: 823.75,
    critRate: 57.25, critDamage: 132.75, damageBonus: 28.5,
    enemyLevel: 83, resistance: 21.5, defenseReduction: 13.25,
    defenseIgnore: 7.5, resistancePenetration: 6.25, takenDamage: 8.75,
    enemyCount: 1, weakness: false, toughnessActive: true
};

function resolvedComponentRequest(data, aggregate, component, level, profile, productLevels = null) {
    const source = attackOf(data, component.attackId);
    const input = makeRequest(source, level, profile);
    input.attack.damageFormula = "statMultiplier";
    input.attack.target = "single";
    input.attack.hitCount = 1;
    input.attack.attackType = input.attack.type;
    if (component.multiplierProductComponents) {
        const resolved = component.multiplierProductComponents.map((factor) => ({
            traceKey: factor.traceKey,
            level: productLevels[factor.traceKey],
            value: factor.values[productLevels[factor.traceKey] - 1]
        }));
        input.attack.multiplierProductComponents = component.multiplierProductComponents;
        input.attack.resolvedMultiplierComponents = resolved;
        input.attack.multiplier = resolved.reduce((value, factor) => value * factor.value / 100, 100);
    } else {
        input.attack.multiplier = component.multipliers[level - 1];
    }
    return input;
}

function snapshotRequest(data, spec) {
    const aggregate = attackOf(data, spec.id);
    const profileWithConditions = { ...profile };
    const parent = makeRequest(aggregate, spec.triggerLevel, profileWithConditions);
    parent.attack = {
        ...aggregate,
        traceLevel: spec.triggerLevel,
        multiplier: aggregate.multipliers[spec.triggerLevel - 1],
        attackType: aggregate.type
    };
    const shockLevels = { ultimate: spec.ultimateLevel, [spec.triggerTrace]: spec.triggerLevel };
    parent.sequenceComponents = aggregate.damageComponents.map((component) => {
        const isShock = component.key === "shock";
        const level = isShock ? spec.ultimateLevel : spec.triggerLevel;
        const input = resolvedComponentRequest(data, aggregate, component, level, profileWithConditions, shockLevels);
        return { key: component.key, name: component.name, input };
    });
    return { aggregate, parent };
}

test("Round21 Kafka E0 action totals combine a direct hit with exactly one pre-existing own Shock snapshot", async () => {
    const { data, engine } = await loadProductionFixture();

    for (const spec of snapshots) {
        const { aggregate, parent } = snapshotRequest(data, spec);
        const directRecord = attackOf(data, spec.triggerAttackId);
        const shockRecord = attackOf(data, spec.shockId);
        const rateRecord = attackOf(data, spec.rateId);
        assert.equal(aggregate.provenance.sourceCommit, fixedSourceSha, spec.id + " pinned data");
        assert.equal(aggregate.support.status, "calculable", spec.id + " support");
        assert.equal(aggregate.maximumEidolon, 0, spec.id + " E0 scope");
        assert.equal(aggregate.enemyCountExact, 1, spec.id + " one target");
        assert.equal(aggregate.damageComponents.length, 2, spec.id + " only direct plus own Shock");
        assert.deepEqual(aggregate.damageComponents.map((part) => part.attackId), [spec.triggerAttackId, spec.shockId]);
        assert.deepEqual(aggregate.damageComponents[0].multipliers, directRecord.multipliers.slice(0, 10));
        assert.deepEqual(aggregate.damageComponents[1].multiplierProductComponents[0].values, shockRecord.multipliers.slice(0, 10));
        const expectedRateCurve = spec.rateId === "11005041"
            ? Array(10).fill(rateRecord.multipliers[0])
            : rateRecord.multipliers.slice(0, 10);
        assert.deepEqual(aggregate.damageComponents[1].multiplierProductComponents[1].values, expectedRateCurve);

        const result = engine.calculate(parent);
        assert.notEqual(result.supported, false, spec.id + ": " + result.reason);
        const expected = parent.sequenceComponents.map((component) => independentDirectDamage(component.input));
        for (const key of ["nonCrit", "crit", "expected"]) {
            assertClose(result.components.direct[key], expected[0][key], spec.id + " direct " + key);
            assertClose(result.components.shock[key], expected[1][key], spec.id + " own Shock " + key);
            assertClose(result[key], expected[0][key] + expected[1][key], spec.id + " action total " + key);
        }
        assertClose(result.components.shock.crit, result.components.shock.nonCrit, spec.id + " DoT cannot crit");
    }
});

test("Round21 Kafka snapshot totals keep triggering and pre-applied Shock trace levels separate", async () => {
    const { data, engine } = await loadProductionFixture();
    const spec = snapshots[0];
    const baseline = snapshotRequest(data, spec);
    const changedUltimate = snapshotRequest(data, { ...spec, ultimateLevel: 10 });
    const first = engine.calculate(baseline.parent);
    const second = engine.calculate(changedUltimate.parent);
    assert.notEqual(first.supported, false, first.reason);
    assert.notEqual(second.supported, false, second.reason);
    assertClose(first.components.direct.expected, second.components.direct.expected, "skill direct is independent of the applied Shock level");
    assert.notEqual(first.components.shock.expected, second.components.shock.expected, "the own Shock tick changes with its applying ultimate level");

    const changedSkill = snapshotRequest(data, { ...spec, triggerLevel: 1 });
    const third = engine.calculate(changedSkill.parent);
    assert.notEqual(third.supported, false, third.reason);
    assert.notEqual(first.components.direct.expected, third.components.direct.expected, "direct skill changes with skill level");
    assert.notEqual(first.components.shock.expected, third.components.shock.expected, "skill detonation rate changes with skill level");

    const wrongOwner = structuredClone(baseline.parent);
    wrongOwner.sequenceComponents[1].input.attack.characterId = "1103";
    assert.equal(engine.calculate(wrongOwner).supported, false, "another owner's Shock must not use Kafka stats");
    const wrongCrit = structuredClone(baseline.parent);
    wrongCrit.sequenceComponents[1].input.attack.canCrit = true;
    assert.equal(engine.calculate(wrongCrit).supported, false, "Shock cannot inherit direct-hit crit");
    const invalid = structuredClone(baseline.parent);
    invalid.sequenceComponents[1].input.attack.resolvedMultiplierComponents[0].level = 11;
    assert.equal(engine.calculate(invalid).supported, false, "reject a Shock snapshot outside the adopted E0 trace range");
});
