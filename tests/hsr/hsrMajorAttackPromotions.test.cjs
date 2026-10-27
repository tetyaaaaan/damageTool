"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const runtime = require("../../games/js/hsrModifierRuntime.js");
const {
    loadProductionFixture,
    attackOf,
    makeRequest,
    assertClose,
    fixedSourceSha,
    independentDirectDamage
} = require("./helpers/hsrDirectVerification.cjs");

// Source curves and scaling stats are transcribed independently from the fixed
// StarRailRes source. The oracle below deliberately does not read either field
// from the production override when choosing a coefficient or reference stat.
const reviewed = {
    "1221031": {
        characterId: "1221", type: "ultimate", element: "Physical", scalingStat: "atk", traceKey: "ultimate",
        multipliers: [],
        maximumTraceLevel: 10, hitCount: 1, target: "single"
    },
    "131203": {
        characterId: "1312", type: "ultimate", element: "Ice", scalingStat: "atk", traceKey: "ultimate",
        multipliers: [36, 38.4, 40.8, 43.2, 45.6, 48, 51, 54, 57, 60],
        maximumTraceLevel: 10, hitCount: 3, target: "bounce", variableHitCount: true
    },
    "131403": {
        characterId: "1314", type: "ultimate", element: "Quantum", scalingStat: "atk", traceKey: "ultimate",
        multipliers: [120, 132, 144, 156, 168, 180, 195, 210, 225, 240],
        maximumTraceLevel: 10, hitCount: 1, target: "aoe"
    },
    "122403": {
        characterId: "1224", type: "ultimate", element: "Imaginary", scalingStat: "atk", traceKey: "ultimate",
        multipliers: [144, 153.6, 163.2, 172.8, 182.4, 192, 204, 216, 228, 240],
        maximumTraceLevel: 10, hitCount: 1, target: "single"
    },
    "122004": {
        characterId: "1220", type: "followUp", element: "Wind", scalingStat: "atk", traceKey: "talent",
        multipliers: [55, 60.5, 66, 71.5, 77, 82.5, 89.38, 96.25, 103.12, 110],
        maximumTraceLevel: 10, hitCount: 1, target: "single", nativeDamageBonus: [30, 33, 36, 39, 42, 45, 48.75, 52.5, 56.25, 60]
    }
};

reviewed["1221031"].multipliers = [
    132 + 6 * 43.2, 140.8 + 6 * 46.08, 149.6 + 6 * 48.96, 158.4 + 6 * 51.84,
    167.2 + 6 * 54.72, 176 + 6 * 57.6, 187 + 6 * 61.2, 198 + 6 * 64.8,
    209 + 6 * 68.4, 220 + 6 * 72
];

const scenarios = [
    {
        stats: { atk: 3123.5, hp: 9876.25, def: 2345.75, critRate: 37.5, critDamage: 83.25, damageBonus: 11.5 },
        baseStats: { atk: 1140.25, hp: 1190.5, def: 920.75 },
        characterLevel: 80, enemyLevel: 82, resistance: 27.5, toughnessActive: true
    },
    {
        stats: { atk: 2678.125, hp: 12345.5, def: 1987.25, critRate: 71.25, critDamage: 142.75, damageBonus: 46.25 },
        baseStats: { atk: 973.5, hp: 1350.25, def: 1105.5 },
        characterLevel: 80, enemyLevel: 95, resistance: 5, resistancePenetration: 8.5,
        defenseReduction: 17, defenseIgnore: 6, takenDamage: 12.5, toughnessActive: false
    }
];

const yunliParryCritDamage = [60, 64, 68, 72, 76, 80, 85, 90, 95, 100];

function nativeModifiersFor(data, attackId, level) {
    const specs = [];
    if (attackId === "1221031") {
        const record = data.structuredModifiers.find((item) => item.id === "trace:1221:122103:slash-critical-damage");
        assert.ok(record, "Yunli Parry CRIT DMG source is available");
        specs.push({ record, characterId: "1221", expected: yunliParryCritDamage[level - 1], label: "Yunli Parry CRIT DMG" });
    }
    if (attackId === "122004") {
        const record = data.structuredModifiers.find((item) => item.id === "trace:1220:122004:followup-damage");
        assert.ok(record, "Feixiao Talent native damage source is available");
        specs.push({ record, characterId: "1220", expected: reviewed["122004"].nativeDamageBonus[level - 1], label: "Feixiao Talent damage bonus" });
        const a4 = data.structuredModifiers.find((item) => item.id === "traceNode:1220:1220102:followup-critical-damage");
        assert.ok(a4, "Feixiao required A4 source is available");
        specs.push({ record: a4, characterId: "1220", expected: 36, label: "Feixiao A4 scoped CRIT DMG" });
    }
    return specs.flatMap(({ record, characterId, expected, label }) => {
        const candidates = runtime.buildCandidates([record], {
            characterId,
            eidolon: 0,
            traceLevelFor: () => level
        }, attackId === "122004" ? { "feixiao-formshift-unlocked": true } : {});
        assert.equal(candidates.length, 1, label + " resolves exactly once at Lv" + level);
        assert.equal(candidates[0].enabled, true, label + " is active for its guaranteed eligible attack event");
        assertClose(candidates[0].value, expected, label + " source curve at Lv" + level);
        return candidates;
    });
}

function makePromotionRequest(attack, level, spec, scenario, modifiers = [], options = {}) {
    const input = makeRequest(attack, level, {
        characterLevel: scenario.characterLevel,
        eidolon: 0,
        atk: scenario.stats.atk,
        hp: scenario.stats.hp,
        def: scenario.stats.def,
        baseAtk: scenario.baseStats.atk,
        baseHp: scenario.baseStats.hp,
        baseDef: scenario.baseStats.def,
        critRate: scenario.stats.critRate,
        critDamage: scenario.stats.critDamage,
        damageBonus: scenario.stats.damageBonus,
        enemyLevel: scenario.enemyLevel,
        resistance: scenario.resistance,
        resistancePenetration: scenario.resistancePenetration || 0,
        defenseReduction: scenario.defenseReduction || 0,
        defenseIgnore: scenario.defenseIgnore || 0,
        takenDamage: scenario.takenDamage || 0,
        // All five reviewed scopes require an unbroken target; retain that
        // invariant even when alternate scenarios vary other enemy fields.
        toughnessActive: true,
        enemyCount: 1
    }, modifiers);
    input.character.stats = { ...input.character.stats, ...scenario.stats };
    input.character.baseStats = { ...input.character.baseStats, ...scenario.baseStats };
    input.attack = {
        ...input.attack,
        // Keep the production record intact. Only the user-selected realized
        // hit count for Misha is resolved here; the oracle substitutes its own
        // independently transcribed coefficient and reference stat below.
        ...(options.hitCount === undefined ? {} : { hitCount: options.hitCount }),
        hitCountLabel: options.hitCountLabel || (options.hitCount ? "全段合算" : input.attack.hitCountLabel),
        traceLevel: level
    };
    return input;
}

function independentFor(input, spec, level, hitCount = spec.hitCount) {
    // The independent calculator accepts a single coefficient. For Misha, the
    // oracle represents the total coefficient explicitly; the engine receives
    // a per-hit coefficient plus an independently specified actual hit count.
    const totalMultiplier = spec.multipliers[level - 1] * hitCount;
    return independentDirectDamage({
        ...input,
        attack: { ...input.attack, scalingStat: spec.scalingStat, multiplier: totalMultiplier, hitCount: 1 }
    });
}

function assertEngineMatchesOracle(engine, input, spec, level, hitCount = spec.hitCount, label = "attack") {
    const expected = independentFor(input, spec, level, hitCount);
    const actual = engine.calculate(input);
    assert.notEqual(actual.supported, false, label + " is calculable");
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], label + " " + key);
    assertClose(actual.breakdown.referenceValue, expected.effectiveReferenceValue, label + " independently selected " + spec.scalingStat + " reference");
    assertClose(actual.breakdown.damageBonus, expected.damageBonus, label + " damage bonus");
    assertClose(actual.breakdown.defense, expected.defense, label + " defense");
    assertClose(actual.breakdown.resistance, expected.resistance, label + " resistance");
    return actual;
}

test("five promoted attacks carry the reviewed fixed-source scope and curves", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const [id, spec] of Object.entries(reviewed)) {
        const attack = attackOf(data, id);
        assert.equal(attack.support?.status, "calculable", id + " has calculable status");
        assert.equal(attack.support?.verified, true, id + " is explicitly verified");
        assert.equal(String(attack.characterId), spec.characterId, id + " owner");
        assert.equal(attack.type, spec.type, id + " damage type");
        assert.equal(attack.element, spec.element, id + " element");
        assert.equal(attack.scalingStat, spec.scalingStat, id + " reference stat");
        assert.equal(attack.damageFormula, "statMultiplier", id + " direct-damage formula");
        assert.equal(attack.canCrit, true, id + " can crit");
        assert.equal(attack.target, spec.target, id + " target scope");
        assert.equal(attack.hitCount, spec.hitCount, id + " base hit count");
        assert.equal(attack.maximumEidolon, 0, id + " E0 scope");
        assert.equal(attack.maximumTraceLevel, spec.maximumTraceLevel, id + " trace scope");
        assert.equal(attack.enemyCountExact, 1, id + " enemy-one scope");
        assert.equal(attack.requiredToughnessActive, true, id + " requires an unbroken target");
        assert.equal(attack.requiresNonWeakTarget, true, id + " requires a non-weakness target");
        assert.equal(attack.multipliers.length, spec.multipliers.length, id + " fixed-source curve length");
        spec.multipliers.forEach((value, index) => assertClose(attack.multipliers[index], value, id + " fixed-source coefficient Lv" + (index + 1)));
        assert.equal(attack.provenance?.sourceCommit, fixedSourceSha, id + " fixed source commit");
        assert.match(attack.provenance?.sourceFile || "", /character_skills\.json:/, id + " provenance points to the source table");
        assert.ok(attack.calculationNote?.length > 20, id + " explains its limited calculation scope");
        assert.equal(engine.unsupportedAttackReason(attack), "", id + " passes engine validation");
    }
    const yunli = attackOf(data, "1221031");
    assert.equal(yunli.hitCountLabel, "全段合算");
    assert.equal(yunli.multipliers[9], 652, "Yunli's first 220% hit plus six 72% hits is represented as one complete coefficient");
    assert.deepEqual(Array.from(yunli.provenance.initialMultipliers), [132, 140.8, 149.6, 158.4, 167.2, 176, 187, 198, 209, 220]);
    assert.deepEqual(Array.from(yunli.provenance.extraHitMultipliers), [43.2, 46.08, 48.96, 51.84, 54.72, 57.6, 61.2, 64.8, 68.4, 72]);
    assert.equal(yunli.provenance.extraHitCount, 6, "the six random additional hits remain visible in evidence");
    assert.equal(yunli.modifierInputKey, "yunli-intuit-cull-instance", "the attack event is described as a condition, separate from its full damage result");
    const misha = attackOf(data, "131203");
    assert.equal(misha.hitCountInputKey, "misha-ultimate-hits");
    assert.equal(misha.hitCountMinimum, 3);
    assert.equal(misha.hitCountMaximum, 10);
    assert.equal(misha.hitCountDefault, 3);
    assert.equal(misha.requiresValidHitCount, true);
});

test("every curve level is independently checked under asymmetric stats and isolated ATK/HP/DEF changes", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const [id, spec] of Object.entries(reviewed)) {
        const attack = attackOf(data, id);
        for (const [scenarioIndex, scenario] of scenarios.entries()) {
            for (let level = 1; level <= spec.maximumTraceLevel; level++) {
                const label = `${id} Lv${level} scenario ${scenarioIndex}`;
                const nativeModifiers = nativeModifiersFor(data, id, level);
                const baselineInput = makePromotionRequest(attack, level, spec, scenario, nativeModifiers);
                const baseline = assertEngineMatchesOracle(engine, baselineInput, spec, level, spec.hitCount, label + " baseline");
                assert.equal(baseline.attack.hitCount, spec.hitCount, label + " baseline hit count");

                for (const changedStat of ["atk", "hp", "def"]) {
                    const alternate = {
                        ...scenario,
                        stats: { ...scenario.stats, [changedStat]: scenario.stats[changedStat] * 1.217 + 83.375 }
                    };
                    const changedInput = makePromotionRequest(attack, level, spec, alternate, nativeModifiers);
                    const changed = assertEngineMatchesOracle(engine, changedInput, spec, level, spec.hitCount, label + " only " + changedStat);
                    for (const metric of ["nonCrit", "crit", "expected"]) {
                        if (changedStat === spec.scalingStat) assert.notEqual(changed[metric], baseline[metric], label + " source " + changedStat + " changes " + metric);
                        else assertClose(changed[metric], baseline[metric], label + " unrelated " + changedStat + " leaves " + metric + " unchanged");
                    }
                }
            }
        }
    }
});

test("Misha Ultimate uses every explicitly selected 3–10 hit count without changing the per-hit curve", async () => {
    const { data, engine } = await loadProductionFixture();
    const spec = reviewed["131203"];
    const attack = attackOf(data, "131203");
    for (let hitCount = 3; hitCount <= 10; hitCount++) {
        const input = makePromotionRequest(attack, 10, spec, scenarios[0], [], { hitCount, hitCountLabel: "全段合算" });
        const actual = assertEngineMatchesOracle(engine, input, spec, 10, hitCount, "Misha Lv10 realized hits " + hitCount);
        assert.equal(actual.attack.hitCount, hitCount, "Misha result reports the selected hit count");
    }
    for (let level = 1; level <= spec.maximumTraceLevel; level++) {
        const input = makePromotionRequest(attack, level, spec, scenarios[1], [], { hitCount: 3 });
        assertEngineMatchesOracle(engine, input, spec, level, 3, "Misha Lv" + level + " minimum-hit case");
    }
});

test("Misha A6 frozen-target Crit DMG remains optional, applies to the Ultimate only when ON, and preserves its full-hit result", async () => {
    const { data, engine } = await loadProductionFixture();
    const record = data.structuredModifiers.find((item) => item.id === "traceNode:1312:1312103:frozen-critical-damage");
    assert.ok(record, "Misha A6 is loaded as a structured effect");
    assert.equal(record.activation?.inputKey, "misha-frozen-crit-active");
    assert.equal(record.activation?.default, false);
    assert.ok(record.target?.attackIds?.includes("131203"), "frozen-target A6 scope includes Misha Ultimate");
    const context = { characterId: "1312", eidolon: 0, traceLevelFor: () => 6 };
    const off = runtime.buildCandidates([record], context, { "misha-frozen-crit-active": false });
    const on = runtime.buildCandidates([record], context, { "misha-frozen-crit-active": true });
    assert.equal(off[0].enabled, false);
    assert.equal(on[0].enabled, true);
    assert.equal(on[0].value, 30);
    for (const attackId of ["131201", "131202"]) {
        assert.equal(runtime.applicableToAttack(on[0], { id: attackId, type: attackId === "131201" ? "normal" : "skill", attackType: attackId === "131201" ? "normal" : "skill", element: "Ice" }), true, "existing Misha A6 coverage is retained for " + attackId);
    }
    assert.equal(runtime.applicableToAttack(on[0], { id: "131203", type: "ultimate", attackType: "ultimate", element: "Ice" }), true);
    assert.equal(runtime.applicableToAttack(on[0], { id: "122001", type: "normal", attackType: "normal", element: "Wind" }), false, "Misha's condition cannot leak to another character's attack");

    const attack = attackOf(data, "131203");
    const spec = reviewed["131203"];
    const offInput = makePromotionRequest(attack, 10, spec, scenarios[0], off, { hitCount: 10 });
    const onInput = makePromotionRequest(attack, 10, spec, scenarios[0], on, { hitCount: 10 });
    const offResult = assertEngineMatchesOracle(engine, offInput, spec, 10, 10, "Misha Ult A6 OFF");
    const onResult = assertEngineMatchesOracle(engine, onInput, spec, 10, 10, "Misha Ult A6 ON");
    assertClose(onResult.breakdown.critDamagePercent, offResult.breakdown.critDamagePercent + 30, "A6 adds 30% Crit DMG when frozen condition is selected");
    assertClose(onResult.nonCrit, offResult.nonCrit, "A6 does not alter noncritical damage");
    assertClose(onResult.crit, offResult.crit * ((1 + (scenarios[0].stats.critDamage + 30) / 100) / (1 + scenarios[0].stats.critDamage / 100)), "A6 changes only critical damage across all 10 realized hits");
});

test("Feixiao's Talent event requires its native damage bonus and unlocked A4 CD exactly once", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "122004");
    const spec = reviewed["122004"];
    const records = data.structuredModifiers;
    const guaranteed = records.find((record) => record.source?.id === "1220" && record.target?.attackIds?.includes("122004")
        && record.category === "damageBonus" && record.support?.status === "calculable");
    assert.ok(guaranteed, "Feixiao's guaranteed per-Talent-hit damage bonus is represented by a structured modifier");
    assert.equal(guaranteed.inputPolicy, "conditional", "the attack-local native bonus is not part of every attack's final damage bonus");
    assert.ok(guaranteed.provenance?.sourceCommit === fixedSourceSha, "fixed-source evidence is retained");
    const context = { characterId: "1220", eidolon: 0, traceLevelFor: () => 10 };
    const nativeCandidate = runtime.buildCandidates([guaranteed], context, {});
    assert.equal(nativeCandidate.length, 1);
    assert.equal(nativeCandidate[0].enabled, true, "guaranteed effect for this event is available without a user toggle");
    assert.equal(nativeCandidate[0].value, 60, "Lv10 native Talent bonus is 60%");
    assert.equal(runtime.applicableToAttack(nativeCandidate[0], { ...attack, attackType: "followUp" }), true);
    assert.equal(runtime.applicableToAttack(nativeCandidate[0], { id: "122001", type: "normal", attackType: "normal", element: "Wind" }), false, "bonus does not leak to Feixiao Basic ATK");

    const a4 = records.find((record) => record.source?.id === "1220" && record.activation?.inputKey === "feixiao-formshift-unlocked");
    assert.ok(a4, "A4 unlock condition is represented");
    assert.equal(attack.comparisonModifierInputs["feixiao-formshift-unlocked"], true, "the verified FUA comparison assumes A4 unlocked");
    assert.ok(attack.requiredModifierIds.includes(a4.id), "A4 is required by this FUA snapshot");
    assert.ok(attack.requiredModifierIds.includes(guaranteed.id), "native Talent damage is required by this FUA snapshot");
    assert.equal(String(a4.source.traceId), "1220102");
    assert.equal(a4.category, "critDamage");
    assert.equal(a4.activation.default, false);
    assert.equal(a4.value.fixed, 36);
    const off = runtime.buildCandidates([a4], context, { "feixiao-formshift-unlocked": false });
    const on = runtime.buildCandidates([a4], context, { "feixiao-formshift-unlocked": true });
    assert.equal(off[0].enabled, false);
    assert.equal(on[0].enabled, true);
    assert.equal(on[0].value, 36);
    assert.equal(runtime.applicableToAttack(on[0], { ...attack, attackType: "followUp" }), true);
    assert.equal(runtime.applicableToAttack(on[0], { id: "122001", type: "normal", attackType: "normal", element: "Wind" }), false, "A4 state is limited to Feixiao's Talent Follow-Up");

    const withNative = makePromotionRequest(attack, 10, spec, scenarios[0], nativeCandidate);
    assert.equal(engine.calculate(withNative).supported, false, "missing required A4 stops this FUA locally");
    const a4Disabled = makePromotionRequest(attack, 10, spec, scenarios[0], [...nativeCandidate, ...off]);
    assert.equal(engine.calculate(a4Disabled).supported, false, "disabled required A4 cannot become a positive FUA comparison");
    const withoutNative = makePromotionRequest(attack, 10, spec, scenarios[0], on);
    assert.equal(engine.calculate(withoutNative).supported, false, "missing required native damage stops this FUA locally");
    const basic = makeRequest(attackOf(data, "122001"), 6, { ...scenarios[0].stats, toughnessActive: true, enemyCount: 1 });
    assert.notEqual(engine.calculate(basic).supported, false, "unrelated Basic ATK stays calculable without FUA-specific native effects");
    const withA4 = makePromotionRequest(attack, 10, spec, scenarios[0], [...nativeCandidate, ...on]);
    const a4Result = assertEngineMatchesOracle(engine, withA4, spec, 10, 1, "Feixiao Talent with native bonus and A4");
    assertClose(a4Result.breakdown.critDamagePercent, scenarios[0].stats.critDamage + 36, "A4's scoped 36% Crit DMG is added only to this eligible attack");
    assertClose(a4Result.breakdown.damageBonus, scenarios[0].stats.damageBonus + 60, "native Talent damage is added exactly once");
    assertClose(withA4.character.stats.critDamage, scenarios[0].stats.critDamage, "final input preserves permanent CD and excludes the separate scoped A4 36%");
});

test("Yunli's mandatory Cull CRIT DMG source applies once to both counter results, without changing the old Slash value", async () => {
    const { data, engine } = await loadProductionFixture();
    const record = data.structuredModifiers.find((item) => item.id === "trace:1221:122103:slash-critical-damage");
    assert.ok(record, "the existing Yunli counter CRIT DMG modifier is reused");
    assert.equal(record.activation?.mode, "always", "the inherent Ultimate-counter bonus is not gated behind an unrelated condition toggle");
    assert.equal(record.category, "critDamage");
    assert.deepEqual(Array.from(record.value.values), [60, 64, 68, 72, 76, 80, 85, 90, 95, 100, 104, 108]);
    assert.ok(record.target.attackIds.includes("122103"));
    assert.ok(record.target.attackIds.includes("1221031"));

    const candidate = runtime.buildCandidates([record], { characterId: "1221", eidolon: 0, traceLevelFor: () => 10 }, {})[0];
    assert.ok(candidate);
    assert.equal(candidate.value, 100, "Lv10 counter bonus is 100% CD");
    assert.equal(runtime.applicableToAttack(candidate, { id: "1221031", type: "ultimate", attackType: "ultimate", element: "Physical" }), true);
    assert.equal(runtime.applicableToAttack(candidate, { id: "122103", type: "ultimate", attackType: "ultimate", element: "Physical" }), true);
    assert.equal(runtime.applicableToAttack(candidate, { id: "122101", type: "normal", attackType: "normal", element: "Physical" }), false);

    const newAttack = attackOf(data, "1221031");
    const newSpec = reviewed["1221031"];
    const newInput = makePromotionRequest(newAttack, 10, newSpec, scenarios[0], [candidate]);
    const newActual = assertEngineMatchesOracle(engine, newInput, newSpec, 10, 1, "Yunli Cull with inherent counter CD");
    assertClose(newActual.breakdown.critDamagePercent, scenarios[0].stats.critDamage + 100, "Yunli counter CD is added exactly once");

    const oldAttack = attackOf(data, "122103");
    const oldInput = makeRequest(oldAttack, 10, { atk: scenarios[0].stats.atk, critRate: scenarios[0].stats.critRate, critDamage: scenarios[0].stats.critDamage, damageBonus: scenarios[0].stats.damageBonus, eidolon: 0 });
    oldInput.modifiers = [candidate];
    const oldResult = engine.calculate(oldInput);
    assertClose(oldResult.breakdown.critDamagePercent, scenarios[0].stats.critDamage + 100, "the existing Yunli Slash keeps the same Lv10 total CD");
});

