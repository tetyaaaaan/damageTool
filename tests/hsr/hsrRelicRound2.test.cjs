"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { runtime, fixedSourceSha, loadProductionFixture, makeRequest, assertClose, assertMatchesIndependent } = require("./helpers/hsrDirectVerification.cjs");

const partyProvider = (record, activeCharacterId = "1001") => ({
    characterId: activeCharacterId,
    partyIds: ["1002"],
    partyEquipment: [{ characterId: "1002", relicIds: [String(record.source.id)], relicMode: 4 }]
});

test("round2 relic definitions use fixed source, optional trigger state, party ownership, and avoid 2pc final-stat duplication", async () => {
    const { data } = await loadProductionFixture();
    const added = data.structuredModifiers.filter((item) => ["114", "118"].includes(item.source?.id) && item.source?.kind === "relic");
    assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
    assert.deepEqual(Array.from(added, (item) => item.id), ["relic:114:4pc:party-speed", "relic:118:4pc:party-break-effect"]);
    const messenger = added[0], watchmaker = added[1];
    assert.equal(messenger.value.fixed, 12);
    assert.equal(messenger.activation.mode, "toggle");
    assert.equal(messenger.activation.durationTurns, 1);
    assert.equal(messenger.target.owner, "partyAll");
    assert.equal(messenger.category, "statPercent");
    assert.equal(messenger.stat, "speed");
    assert.equal(watchmaker.value.fixed, 30);
    assert.equal(watchmaker.activation.mode, "toggle");
    assert.equal(watchmaker.activation.durationTurns, 2);
    assert.equal(watchmaker.target.owner, "partyAll");
    assert.deepEqual(Array.from(watchmaker.target.attackTypes), ["all"]);
    assert.equal(watchmaker.category, "breakEffect");
    for (const item of added) {
        assert.equal(item.source.setPieces, 4);
        assert.equal(item.provenance.sourceCommit, fixedSourceSha);
        assert.equal(item.support.status, "calculable");
        assert.equal(item.finalStatsInclusion.inputKey, item.activation.inputKey + ":in-final-stats", "conditional four-piece stats can be declared already included");
    }
});

test("Messenger 4pc is an optional party-wide SPD state, requires four pieces, and is removed with its provider", async () => {
    const { data } = await loadProductionFixture();
    const record = data.structuredModifiers.find((item) => item.id === "relic:114:4pc:party-speed");
    const context = partyProvider(record);
    const off = runtime.buildCandidates([record], context, {})[0];
    assert.equal(off.providerId, "1002");
    assert.equal(off.enabled, false, "equipping alone does not pretend the wearer used an ally-targeted Ultimate");
    assert.equal(off.automatic, false);
    const on = runtime.buildCandidates([record], context, { [record.activation.inputKey]: true })[0];
    assert.equal(on.enabled, true);
    assert.equal(on.value, 12);
    assert.equal(on.providerId, "1002");
    assert.equal(on.target.owner, "partyAll");
    assert.equal(runtime.buildCandidates([record], { ...context, partyEquipment: [{ ...context.partyEquipment[0], relicMode: 2 }] }, { [record.activation.inputKey]: true }).length, 0);
    assert.equal(runtime.buildCandidates([record], { ...context, partyEquipment: [] }, { [record.activation.inputKey]: true }).length, 0);
    const self = runtime.buildCandidates([record], { characterId: "1001", relicIds: ["114"], relicMode: 4 }, { [record.activation.inputKey]: true })[0];
    assert.equal(self.enabled, true);
    assert.equal(self.value, 12);
    assert.equal(runtime.buildCandidates([record], { characterId: "1001", relicIds: ["114"], relicMode: 2 }, { [record.activation.inputKey]: true }).length, 0);
    const glam = data.structuredModifiers.find((item) => item.id === "ornament:311:2pc:speed-damage");
    assert.ok(glam, "the existing Gramos threshold is the regression target for party SPD support");
    const evaluate = (speed, active) => runtime.buildCandidates([record, glam], {
        ...context, stats: { speed }, baseStats: { speed: 100 }, ornamentId: "311"
    }, { [record.activation.inputKey]: active });
    assert.equal(evaluate(148, false).find((item) => item.id === glam.id).value, 12, "148 SPD remains below 160 without Messenger");
    const thresholdOn = evaluate(148, true).find((item) => item.id === glam.id);
    assert.equal(thresholdOn.thresholdReferenceValue, 160, "12% of 100 base SPD is included in the existing effective-value pass");
    assert.equal(thresholdOn.value, 18, "the existing Gramos 160-SPD tier updates automatically");
    assert.equal(JSON.parse(JSON.stringify({ [record.activation.inputKey]: true }))[record.activation.inputKey], true, "condition state is serializable for saved calculator state");
});

test("Watchmaker 4pc party Break Effect feeds Break damage only while its ally-Ultimate state is active", async () => {
    const { data, engine } = await loadProductionFixture();
    const record = data.structuredModifiers.find((item) => item.id === "relic:118:4pc:party-break-effect"), context = partyProvider(record);
    const candidate = (active, equipment = context.partyEquipment) => runtime.buildCandidates([record], { ...context, partyEquipment: equipment }, { [record.activation.inputKey]: active })[0];
    const off = candidate(false), on = candidate(true);
    assert.equal(off.enabled, false);
    assert.equal(on.enabled, true);
    assert.equal(on.providerId, "1002");
    assert.equal(runtime.applicableToAttack(on, { type: "break", element: "Fire" }), true);
    assert.equal(runtime.applicableToAttack(on, { type: "superBreak", element: "Fire" }), true);
    assert.equal(runtime.applicableToAttack(on, { type: "skill", element: "Fire" }), true, "Break Effect is a character stat input and feeds any supported Break conversion");
    assert.equal(candidate(true, []), undefined);

    const input = {
        character: { level: 80, stats: { breakEffect: 200 } },
        enemy: { level: 80, count: 1, weakness: true, toughnessActive: true, maxToughness: 60, resistance: 20, defenseReduction: 0, defenseIgnore: 0 },
        element: "Fire", breakBaseDamage: { 80: 3767.5533 }
    };
    const baseline = engine.calculateBreak({ ...input, modifiers: [] });
    const actual = engine.calculateBreak({ ...input, modifiers: [on] });
    assert.equal(actual.supported, true);
    assertClose(baseline.value, 9042.12792, "independent Break without Watchmaker");
    assertClose(actual.value, 9946.340712, "independent Break with +30 percentage-point Break Effect");
    assertClose(actual.effect, 3.3, "Break Effect factor after support");
    assert.equal(actual.applied.filter((item) => item.id === record.id).length, 1, "provider/recipient resolution applies the party record once");
    const removed = engine.calculateBreak({ ...input, modifiers: [candidate(true, [])].filter(Boolean) });
    assertClose(removed.value, baseline.value, "provider removal clears the support");

    const superBreakInput = {
        character: { level: 80, stats: { breakEffect: 200 } },
        enemy: { level: 80, count: 1, weakness: true, toughnessActive: false, maxToughness: 120, resistance: 20, defenseReduction: 0, defenseIgnore: 0, resistancePenetration: 0, takenDamage: 0 },
        attack: { id: "round2-watchmaker-super-break", type: "superBreak", attackType: "superBreak", element: "Fire", toughnessDamage: 30, superBreakMultiplier: 100 },
        breakBaseDamage: { 80: 3767.5533 }, modifiers: [on], breakModifiers: [on]
    };
    const superBreak = engine.calculateSuperBreak(superBreakInput);
    assert.equal(superBreak.supported, true);
    assertClose(superBreak.value, 14919.511068, "independent Super Break with Watchmaker Break Effect");
    assertClose(superBreak.breakEffect, 3.3, "Super Break Effect factor after support");
});

test("existing Scholar and Genius four-piece records have correct attack and enemy-condition scope in calculation", async () => {
    const { data, engine } = await loadProductionFixture();
    const scholarSkill = data.structuredModifiers.find((item) => item.id === "relic:122:4pc:skill-ultimate-damage");
    const scholarNextSkill = data.structuredModifiers.find((item) => item.id === "relic:122:4pc:next-skill-damage");
    const geniusBase = data.structuredModifiers.find((item) => item.id === "relic:108:4pc:defense-ignore");
    const geniusQuantum = data.structuredModifiers.find((item) => item.id === "relic:108:4pc:quantum-weakness-defense-ignore");
    const geniusNonQuantum = geniusQuantum;
    assert.ok(scholarSkill && scholarNextSkill && geniusBase && geniusQuantum && geniusNonQuantum);
    assert.deepEqual(Array.from(scholarSkill.target.attackTypes), ["skill", "ultimate"]);
    assert.deepEqual(Array.from(scholarNextSkill.target.attackTypes), ["skill"]);
    assert.deepEqual(Array.from(geniusQuantum.target.elements), []);
    assert.equal(geniusQuantum.activation.mode, "statThreshold", "the standard enemy-weakness input is automatic only for Quantum attacks");
    assert.deepEqual(Array.from(geniusNonQuantum.target.elements), []);
    assert.equal(geniusNonQuantum.activation.reference, "enemy.quantumWeakness", "non-Quantum characters use the separate Quantum-weakness input");

    const context = { characterId: "1001", relicIds: ["122"], relicMode: 4 };
    const inputFor = (type, activeNextSkill) => {
        const attack = { id: "independent-test-" + type, characterId: "1001", type, attackType: type, element: "Fire", scalingStat: "atk", multiplier: 100, multipliers: [100], traceLevel: 1 };
        const records = [scholarSkill, scholarNextSkill];
        const inputs = { [scholarNextSkill.activation.inputKey]: activeNextSkill };
        const candidates = runtime.buildCandidates(records, context, inputs)
            .filter((item) => runtime.applicableToAttack(item, attack));
        return makeRequest(attack, 1, {}, candidates);
    };
    const skillOff = assertMatchesIndependent(engine, inputFor("skill", false), "Scholar Skill +20%");
    assertClose(skillOff.nonCrit, 1296, "Scholar Skill fixed independent output");
    const skillOn = assertMatchesIndependent(engine, inputFor("skill", true), "Scholar next Skill +45% total");
    assertClose(skillOn.nonCrit, 1566, "Scholar next Skill independent output");
    const normal = assertMatchesIndependent(engine, inputFor("normal", true), "Scholar does not affect Normal");
    assertClose(normal.nonCrit, 1080, "Scholar Normal remains unchanged");

    const quantumRecords = [geniusBase, geniusQuantum];
    const geniusContext = { characterId: "1001", relicIds: ["108"], relicMode: 4 };
    const fire = { id: "genius-engine-fire", type: "skill", attackType: "skill", element: "Fire", scalingStat: "atk", multiplier: 100, multipliers: [100], traceLevel: 1 };
    const fireCandidates = runtime.buildCandidates(quantumRecords, { ...geniusContext, enemy: { weakness: false } }, { [geniusNonQuantum.activation.inputKey]: true })
        .filter((item) => runtime.applicableToAttack(item, fire));
    const fireActual = assertMatchesIndependent(engine, makeRequest(fire, 1, { weakness: false }, fireCandidates), "Genius manual Quantum-weakness condition for non-Quantum attack");
    assertClose(fireActual.nonCrit, 1200, "Genius +20% DEF ignore across non-Quantum attack");
    assert.equal(fireCandidates.filter((item) => item.category === "defenseIgnore").reduce((sum, item) => sum + Number(item.enabled ? item.value : 0), 0), 20);

    const fireOff = runtime.buildCandidates(quantumRecords, { ...geniusContext, enemy: { weakness: false } }, {})
        .filter((item) => runtime.applicableToAttack(item, fire));
    const fireWithoutToggle = assertMatchesIndependent(engine, makeRequest(fire, 1, { weakness: false }, fireOff), "Genius non-Quantum attack does not infer Quantum weakness from generic enemy weakness");
    assertClose(fireWithoutToggle.nonCrit, 1136.8421052631577, "Genius base 10% DEF ignore only");

    const quantum = { ...fire, id: "genius-engine-quantum", element: "Quantum" };
    const quantumCandidates = runtime.buildCandidates(quantumRecords, { ...geniusContext, characterElement: "Quantum", enemy: { weakness: true } }, {})
        .filter((item) => runtime.applicableToAttack(item, quantum));
    const quantumActual = assertMatchesIndependent(engine, makeRequest(quantum, 1, { weakness: true }, quantumCandidates), "Genius automatically detects weakness for Quantum attack");
    assertClose(quantumActual.nonCrit, 1200, "Genius +20% DEF ignore for Quantum attack on a Quantum-weak enemy");
    assert.equal(quantumCandidates.find((item) => item.id === geniusQuantum.id).automatic, true);
    // Quantum weakness is an enemy property shared by every element component.
    const mixed = runtime.buildCandidates(quantumRecords, { ...geniusContext, characterElement: "Quantum", enemy: { weakness: true } }, {});
    const fireFromQuantum = assertMatchesIndependent(engine, makeRequest(fire, 1, {}, mixed.filter(m => runtime.applicableToAttack(m, fire))), "Quantum owner Fire component");
    assertClose(fireFromQuantum.nonCrit, 1200, "off-element component still receives the same ignore");
    const foreign = runtime.buildCandidates(quantumRecords, { ...geniusContext, characterElement: "Fire", enemy: { weakness: true } }, {});
    assertClose(assertMatchesIndependent(engine, makeRequest(quantum, 1, {}, foreign.filter(m => runtime.applicableToAttack(m, quantum))), "Fire owner Quantum component").nonCrit, 1136.8421052631577, "Fire weakness does not prove Quantum weakness");
    const composed = makeRequest(fire, 1, { defenseReduction: 40, defenseIgnore: 10 }, fireCandidates);
    assertClose(assertMatchesIndependent(engine, composed, "Genius composes with other defense modifiers").nonCrit, 2160 / 1.3, "70% combined defense reduction/ignore");
    const quantumNotWeak = runtime.buildCandidates(quantumRecords, { ...geniusContext, characterElement: "Quantum", enemy: { weakness: false } }, {});
    assert.equal(quantumNotWeak.find((item) => item.id === geniusQuantum.id).enabled, false);
});
