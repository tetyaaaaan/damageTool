"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readJson, runtime, fixedSourceSha, loadProductionFixture, makeRequest, assertClose, assertMatchesIndependent } = require("./helpers/hsrDirectVerification.cjs");

const sourceRecords = readJson("games/hsr/data/calc/modifiers-sets-round3.json").modifiers;
const byId = (id) => sourceRecords.find((item) => item.id === id);
const ironBreak = byId("relic:119:4pc:break-defense-ignore");
const ironSuperBreak = byId("relic:119:4pc:super-break-defense-ignore");
const valorous = byId("relic:120:4pc:ultimate-damage-after-follow-up");
const rainSpeed = byId("relic:125:4pc:rain-speed");
const rainCritDamage = byId("relic:125:4pc:party-crit-damage");
const setContext = (id, stats = {}) => ({ characterId: "1001", relicIds: [id], relicMode: 4, stats });
const candidate = (record, context, inputs = {}) => runtime.buildCandidates([record], context, inputs)[0];

for (const record of sourceRecords) {
    test("round3 record " + record.id + " is fixed-source, four-piece, calculable, and has an inclusion guard", () => {
        assert.equal(record.source.setPieces, 4);
        assert.equal(record.provenance.sourceCommit, fixedSourceSha);
        assert.equal(record.support.status, "calculable");
        assert.equal(record.finalStatsInclusion.inputKey, record.id + ":in-final-stats");
    });
}

test("fixed data loader registers these relic records without duplicating permanent stats", async () => {
    const { data } = await loadProductionFixture();
    const loaded = data.structuredModifiers.filter((item) => ["119", "120", "125", "128"].includes(item.source?.id) && item.provenance?.sourceCommit === fixedSourceSha);
    assert.deepEqual(Array.from(loaded, (item) => item.id), sourceRecords.map((item) => item.id));
    assert.equal(sourceRecords.some((item) => item.source.id === "119" && item.stat === "breakEffect"), false, "2pc Break Effect stays in final stats");
    assert.equal(sourceRecords.some((item) => item.source.id === "120" && item.stat === "atk"), false, "2pc ATK stays in final stats");
    assert.equal(sourceRecords.some((item) => item.source.id === "120" && item.stat === "critRate"), false, "4pc permanent CR stays in final stats");
    assert.equal(sourceRecords.some((item) => item.source.id === "125" && item.activation.mode === "always" && item.stat === "speed"), false, "2pc SPD stays in final stats");
});

test("Iron Cavalry automatically checks the final Break Effect boundaries and scopes each ignore to its damage type", async () => {
    const { engine } = await loadProductionFixture();
    const contextFor = (breakEffect) => setContext("119", { breakEffect });
    const threshold = (record, be) => candidate(record, contextFor(be));
    assert.equal(threshold(ironBreak, 149.99).enabled, false);
    assert.equal(threshold(ironBreak, 150).enabled, true);
    assert.equal(threshold(ironBreak, 250).enabled, true);
    assert.equal(threshold(ironSuperBreak, 249.99).enabled, false);
    assert.equal(threshold(ironSuperBreak, 250).enabled, true);
    assert.equal(threshold(ironBreak, 150).automatic, true);
    assert.equal(runtime.applicableToAttack(threshold(ironBreak, 150), { type: "superBreak", element: "Fire" }), true);
    assert.equal(runtime.applicableToAttack(threshold(ironSuperBreak, 250), { type: "break", element: "Fire" }), false);
    assert.equal(candidate(ironBreak, { ...contextFor(150), relicMode: 2 }), undefined, "the four-piece condition is enforced");

    const breakAt150 = threshold(ironBreak, 150);
    const breakInput = {
        character: { level: 80, stats: { breakEffect: 150 } },
        enemy: { level: 80, count: 1, weakness: true, toughnessActive: true, maxToughness: 60, resistance: 20, defenseReduction: 0, defenseIgnore: 0 },
        element: "Fire", breakBaseDamage: { 80: 3767.5533 }, modifiers: [breakAt150]
    };
    const breakResult = engine.calculateBreak(breakInput);
    const expectedBreak = 3767.5533 * 2 * 2.5 * (100 / (100 + 100 * 0.9)) * 0.8 * 1;
    assertClose(breakResult.value, expectedBreak, "BE=150 Break DEF ignore 10% literal formula");
    assertClose(breakResult.value, 7931.691157894737, "BE=150 fixed independent Break value");
    assert.equal(breakResult.applied.filter((item) => item.id === ironBreak.id).length, 1);

    const belowBreak = threshold(ironBreak, 149.99);
    const belowResult = engine.calculateBreak({ ...breakInput, character: { level: 80, stats: { breakEffect: 149.99 } }, modifiers: [belowBreak] });
    assertClose(belowResult.value, 7534.805195736, "BE=149.99 no set DEF ignore");

    const superCandidate = threshold(ironSuperBreak, 250);
    const superInput = {
        character: { level: 80, eidolon: 0, stats: { atk: 99999, breakEffect: 250 } },
        enemy: { count: 1, level: 80, toughnessActive: false, maxToughness: 120, resistance: 20, defenseReduction: 0, defenseIgnore: 0, resistancePenetration: 0, takenDamage: 0 },
        attack: { type: "superBreak", attackType: "superBreak", element: "Fire", toughnessDamage: 30, superBreakMultiplier: 100 },
        breakBaseDamage: { 80: 3767.5533 }, modifiers: [threshold(ironBreak, 250), superCandidate]
    };
    const superResult = engine.calculateSuperBreak(superInput);
    const expectedSuper = 3767.5533 * 3 * 3.5 * (100 / (100 + 100 * 0.75)) * 0.8;
    assertClose(superResult.value, expectedSuper, "BE=250 Super Break total DEF ignore 25% literal formula");
    assertClose(superResult.value, 18084.25584, "BE=250 fixed independent Super Break value");
    assert.equal(superResult.applied.filter((item) => item.id === ironSuperBreak.id).length, 1);
    const underSuper = threshold(ironSuperBreak, 249.99);
    const underResult = engine.calculateSuperBreak({ ...superInput, character: { level: 80, stats: { breakEffect: 249.99 } }, modifiers: [threshold(ironBreak, 249.99), underSuper] });
    assertClose(underResult.value, 3767.5533 * 3 * 3.4999 * .8 / 1.9, "BE=249.99 keeps the base 10% ignore only");
});

test("Valorous requires an explicit post-Follow-Up state, lasts one turn, and only boosts Ultimate", async () => {
    const { engine } = await loadProductionFixture();
    const context = setContext("120");
    const off = candidate(valorous, context);
    const activeInputs = { [valorous.activation.inputKey]: true };
    const on = candidate(valorous, context, activeInputs);
    assert.equal(off.enabled, false);
    assert.equal(on.enabled, true);
    assert.equal(on.automatic, false);
    assert.equal(valorous.activation.durationTurns, 1);
    assert.equal(runtime.applicableToAttack(on, { type: "ultimate", element: "Fire" }), true);
    assert.equal(runtime.applicableToAttack(on, { type: "skill", element: "Fire" }), false);
    assert.equal(candidate(valorous, { ...context, relicMode: 2 }, activeInputs), undefined);

    const ultimate = { id: "round3-valorous-ultimate", type: "ultimate", attackType: "ultimate", element: "Fire", scalingStat: "atk", multiplier: 100, multipliers: [100], traceLevel: 1 };
    const request = (mods) => makeRequest(ultimate, 1, { atk: 3000, baseAtk: 1000, critRate: 50, critDamage: 100 }, mods);
    const base = assertMatchesIndependent(engine, request([off]), "Valorous off independent damage");
    assertClose(base.nonCrit, 1080, "Valorous off nonCrit fixed value");
    const active = assertMatchesIndependent(engine, request([on]), "Valorous Ultimate +36% independent damage");
    assertClose(active.nonCrit, 1468.8, "Valorous active nonCrit fixed value");
    assertClose(active.crit, 2937.6, "Valorous active crit fixed value");
    assertClose(active.expected, 2203.2, "Valorous active expectation fixed value");
    const alreadyIncluded = candidate(valorous, context, { ...activeInputs, [valorous.finalStatsInclusion.inputKey]: true });
    assert.equal(alreadyIncluded.enabled, false, "an Ultimate bonus already represented in final damage bonus is not added twice");
});

test("Warrior Goddess Rain is one shared optional state for wearer SPD and party CRIT DMG, and feeds effective SPD thresholds", async () => {
    const { data, engine } = await loadProductionFixture();
    const records = [rainSpeed, rainCritDamage];
    const activeKey = rainSpeed.activation.inputKey;
    assert.equal(activeKey, rainCritDamage.activation.inputKey, "both effects derive from the same Rain state");
    const wearerContext = { ...setContext("125", { speed: 134.5 }), baseStats: { speed: 100 }, ornamentId: "311" };
    const rainOff = runtime.buildCandidates([...records, data.structuredModifiers.find((item) => item.id === "ornament:311:2pc:speed-damage")], wearerContext, {});
    const rainOn = runtime.buildCandidates([...records, data.structuredModifiers.find((item) => item.id === "ornament:311:2pc:speed-damage")], wearerContext, { [activeKey]: true });
    const speedOff = rainOff.find((item) => item.id === rainSpeed.id), speedOn = rainOn.find((item) => item.id === rainSpeed.id);
    const gramsOff = rainOff.find((item) => item.id === "ornament:311:2pc:speed-damage"), gramsOn = rainOn.find((item) => item.id === "ornament:311:2pc:speed-damage");
    assert.equal(speedOff.enabled, false);
    assert.equal(speedOn.enabled, true);
    assert.equal(speedOn.value, 6);
    assert.equal(speedOn.automatic, false);
    assert.equal(gramsOff.value, 0, "134.5 SPD is below the Gramos threshold without Rain");
    assert.equal(gramsOn.thresholdReferenceValue, 140.5, "the +6% wearer SPD uses final base SPD once");
    assert.equal(gramsOn.value, 12, "the automatic Gramos threshold reevaluates from the supported SPD state");
    const speedInputs = JSON.parse(JSON.stringify({ [activeKey]: true }));
    assert.equal(candidate(rainSpeed, wearerContext, speedInputs).enabled, true, "saved Rain state restores the same wearer-speed effect");

    const providerContext = { characterId: "1001", partyIds: ["1002"], partyEquipment: [{ characterId: "1002", relicIds: ["125"], relicMode: 4 }] };
    const partyOff = candidate(rainCritDamage, providerContext);
    const partyOn = candidate(rainCritDamage, providerContext, { [activeKey]: true });
    assert.equal(partyOff.enabled, false);
    assert.equal(partyOn.enabled, true);
    assert.equal(partyOn.providerId, "1002");
    assert.equal(partyOn.target.owner, "partyAll");
    assert.equal(candidate(rainSpeed, providerContext, { [activeKey]: true }), undefined, "wearer SPD is not granted to another active ally");
    assert.equal(candidate(rainCritDamage, { ...providerContext, partyEquipment: [] }, { [activeKey]: true }), undefined, "provider removal clears the party support");
    assert.equal(candidate(rainCritDamage, { ...providerContext, partyEquipment: [{ characterId: "1002", relicIds: ["125"], relicMode: 2 }] }, { [activeKey]: true }), undefined, "the provider must have four pieces");

    const attack = { id: "round3-rain-crit", type: "skill", attackType: "skill", element: "Fire", scalingStat: "atk", multiplier: 100, multipliers: [100], traceLevel: 1 };
    const request = makeRequest(attack, 1, { atk: 3000, baseAtk: 1000, critRate: 50, critDamage: 100 }, [partyOn]);
    const result = assertMatchesIndependent(engine, request, "party-wide Rain CRIT DMG +15% independent damage");
    assertClose(result.nonCrit, 1080, "party CRIT DMG does not alter nonCrit");
    assertClose(result.crit, 2322, "party Rain CRIT DMG fixed crit value");
    assertClose(result.expected, 1701, "party Rain CRIT DMG fixed expected value");
    const excluded = candidate(rainCritDamage, providerContext, { [activeKey]: true, [rainCritDamage.finalStatsInclusion.inputKey]: true });
    assert.equal(excluded.enabled, false, "a party CRIT DMG already included in recipient CD is not added twice");
});


test("Hidden Shadow 4pc grants CRIT DMG only for a selected provider shield state", async () => {
    const { data, engine } = await loadProductionFixture();
    const record = byId("relic:128:4pc:provider-shield-crit-damage");
    const loaded = data.structuredModifiers.find((item) => item.id === record.id);
    assert.ok(loaded, "production loader must include the set modifier");
    assert.equal(record.source.setPieces, 4);
    assert.equal(record.target.owner, "partyAll", "the provider is available to self and other allies");
    assert.equal(record.activation.mode, "toggle", "the specific shield possession is not derivable from profile equipment");
    assert.equal(record.activation.default, false);
    assert.match(record.scope, /単一提供者/);
    assert.match(record.scope, /未確定/);
    assert.notEqual(record.stacking.rule, "nonStacking", "do not infer the game stacking rule from missing evidence");
    assert.equal(record.provenance.sourceCommit, fixedSourceSha);

    const context = { characterId: "1001", partyIds: ["1002"], partyEquipment: [{ characterId: "1002", relicIds: ["128"], relicMode: 4 }] };
    const off = candidate(record, context);
    const activeInputs = { [record.activation.inputKey]: true };
    const on = candidate(record, context, activeInputs);
    assert.equal(off.enabled, false);
    assert.equal(on.enabled, true);
    assert.equal(on.automatic, false);
    assert.equal(on.providerId, "1002");
    assert.equal(on.value, 15);
    assert.equal(runtime.applicableToAttack(on, { type: "skill", element: "Fire" }), true);
    assert.equal(runtime.applicableToAttack(on, { type: "break", element: "Fire" }), true);
    assert.equal(candidate(record, { ...context, partyEquipment: [] }, activeInputs), undefined, "provider removal clears the candidate");
    assert.equal(candidate(record, { ...context, partyEquipment: [{ characterId: "1002", relicIds: ["128"], relicMode: 2 }] }, activeInputs), undefined, "four pieces are required");

    const attack = { id: "round3-hidden-shadow-shield", type: "skill", attackType: "skill", element: "Fire", scalingStat: "atk", multiplier: 100, multipliers: [100], traceLevel: 1 };
    const request = makeRequest(attack, 1, { atk: 3000, baseAtk: 1000, critRate: 50, critDamage: 100 }, [on]);
    const result = assertMatchesIndependent(engine, request, "Hidden Shadow party CRIT DMG +15% independent damage");
    assertClose(result.nonCrit, 1080, "shield CRIT DMG does not alter nonCrit");
    assertClose(result.crit, 2322, "shield CRIT DMG +15% literal crit value");
    assertClose(result.expected, 1701, "shield CRIT DMG +15% literal expected value");
    const included = candidate(record, context, { ...activeInputs, [record.finalStatsInclusion.inputKey]: true });
    assert.equal(included.enabled, false, "already included recipient CRIT DMG is not doubled");
    assert.equal(JSON.parse(JSON.stringify(activeInputs))[record.activation.inputKey], true, "the selected shield state round trips as saved input");

    const wearerSelfShield = candidate(record, { characterId: "1001", relicIds: ["128"], relicMode: 4 }, activeInputs);
    assert.equal(wearerSelfShield.enabled, true, "the wearer can be the recipient when holding its own shield");
});
