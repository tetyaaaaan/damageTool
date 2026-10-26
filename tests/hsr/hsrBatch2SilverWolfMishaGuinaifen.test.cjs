"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    runtime, loadProductionFixture, attackOf, makeRequest,
    assertClose, independentDirectDamage, fixedSourceSha
} = require("./helpers/hsrDirectVerification.cjs");

// Hand-transcribed from StarRailRes at fixedSourceSha, fetched 2026-10-26:
// index_new/jp/character_skills.json, character_skill_trees.json and
// character_ranks.json. These direct-component tests do not certify a whole
// Guinaifen Ultimate: it can detonate other providers' Burns, whose level and
// source stats are independent, and Firekiss is applied AFTER Burn damage.
const basic = [50, 60, 70, 80, 90, 100];
const silverWolfSkill = [98, 107.8, 117.6, 127.4, 137.2, 147, 159.25, 171.5, 183.75, 196];
const silverWolfUltimate = [228, 243.2, 258.4, 273.6, 288.8, 304, 323, 342, 361, 380];
const ownBurn = [83.9, 92.3, 100.69, 109.09, 117.48, 130.07, 146.86, 167.84, 193.03, 218.21];
const direct = {
    "100601": { curve: basic }, "1100601": { curve: basic },
    "100602": { curve: silverWolfSkill }, "1100602": { curve: silverWolfSkill },
    "100603": { curve: silverWolfUltimate }, "1100603": { curve: silverWolfUltimate },
    "100607": { curve: [80] }, "1100607": { curve: [80] },
    "121001": { curve: basic },
    "121002": { curve: [60, 66, 72, 78, 84, 90, 97.5, 105, 112.5, 120], adjacent: [20, 22, 24, 26, 28, 30, 32.5, 35, 37.5, 40] },
    "121003": { curve: [72, 76.8, 81.6, 86.4, 91.2, 96, 102, 108, 114, 120] },
    "1210021": { curve: ownBurn, canCrit: false },
    "1210011": { curve: ownBurn, canCrit: false }
};
const snapshots = [
    { atk: 3123.5, hp: 9876.25, def: 2345.75, baseAtk: 1140.25, critRate: 37.5, critDamage: 83.25, damageBonus: 11.5, enemyLevel: 82, resistance: 27.5, defenseReduction: 17, defenseIgnore: 6, takenDamage: 12.5 },
    { atk: 2678.125, hp: 12345.5, def: 1987.25, baseAtk: 973.5, critRate: 71.25, critDamage: 142.75, damageBonus: 46.25, enemyLevel: 95, resistance: 5, resistancePenetration: 8.5 }
];
const bonuses = [
    { category: "statPercent", stat: "atk", value: 17.5 },
    { category: "statFlat", stat: "atk", value: 137.25 },
    { category: "statPercent", stat: "hp", value: 31.75 },
    { category: "statFlat", stat: "def", value: 217.25 },
    { category: "damageBonus", value: 28.5 },
    { category: "defenseReduction", value: 9.25 },
    { category: "resistanceReduction", value: 6.25 },
    { category: "takenDamage", value: 13.5 },
    { category: "critRate", value: 11.75 },
    { category: "critDamage", value: 22.5 }
].map((modifier, index) => ({ ...modifier, id: "batch2-independent-" + index, enabled: true, applicable: true }));

function matches(engine, input, multiplier, canCrit, label) {
    // The oracle chooses ATK and the source coefficient independently from the
    // loaded attack, so a mistaken production stat/curve cannot validate itself.
    const expected = independentDirectDamage({ ...input, attack: { ...input.attack, scalingStat: "atk", multiplier, canCrit } });
    const actual = engine.calculate(input);
    assert.notEqual(actual.supported, false, label);
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], label + " " + key);
    assertClose(actual.breakdown.referenceValue, expected.effectiveReferenceValue, label + " ATK reference");
    return actual;
}

function attachState(input) {
    // Realized states apply to this component only; no attempt is made to infer
    // a newly applied Burn or a debuff from damage that has not happened yet.
    input.modifierInputs = { "guinaifen-burn-active": true, "guinaifen-normal-burn-active": true };
    return input;
}

test("batch2 Silver Wolf and Guinaifen direct components match pinned E0 curves and independent damage", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const [id, spec] of Object.entries(direct)) {
        const attack = attackOf(data, id);
        assert.equal(attack.scalingStat, "atk", id);
        assert.equal(attack.canCrit, spec.canCrit !== false, id);
        assert.deepEqual(Array.from(attack.multipliers).slice(0, spec.curve.length), spec.curve, id + " pinned E0 curve");
        for (let level = 1; level <= spec.curve.length; level++) {
            for (const snapshot of snapshots) {
                for (const modifiers of [[], bonuses]) {
                    const input = attachState(makeRequest(attack, level, snapshot, modifiers));
                    const baseline = matches(engine, input, spec.curve[level - 1], spec.canCrit !== false, id + " Lv" + level);
                    for (const stat of ["atk", "hp", "def"]) {
                        const changed = { ...input, character: { ...input.character, stats: { ...input.character.stats, [stat]: input.character.stats[stat] * 1.217 + 83.375 } } };
                        const result = matches(engine, changed, spec.curve[level - 1], spec.canCrit !== false, id + " only " + stat);
                        if (stat === "atk") assert.notEqual(result.expected, baseline.expected, id + " ATK must affect damage");
                        else assertClose(result.expected, baseline.expected, id + " unrelated " + stat);
                    }
                }
            }
        }
        if (spec.adjacent) {
            const stored = attack.adjacentMultipliers || attack.provenance?.adjacentMultipliers;
            assert.deepEqual(Array.from(stored).slice(0, 10), spec.adjacent, id + " pinned adjacent evidence");
        }
    }
});

const debuffCurves = {
    "trace:1006:100602:all-resistance": [7.5, 7.75, 8, 8.25, 8.5, 8.75, 9.06, 9.38, 9.69, 10],
    "trace:1006:1100602:all-resistance": [10.5, 10.75, 11, 11.25, 11.5, 11.75, 12.06, 12.37, 12.69, 13],
    "trace:1006:100603:defense": [36, 36.9, 37.8, 38.7, 39.6, 40.5, 41.63, 42.75, 43.87, 45],
    "trace:1006:1100603:defense": [36, 36.9, 37.8, 38.7, 39.6, 40.5, 41.63, 42.75, 43.87, 45],
    "trace:1006:100604:defense-flaw": [4, 4.4, 4.8, 5.2, 5.6, 6, 6.5, 7, 7.5, 8],
    "trace:1006:1100604:defense-flaw": [6, 6.6, 7.2, 7.8, 8.4, 9, 9.75, 10.5, 11.25, 12]
};

function candidatesFor(record, level, characterId, inputs, party = false) {
    const context = {
        characterId: party ? "1312" : characterId,
        partyIds: party ? [characterId] : [],
        eidolon: 0, partyEidolons: { [characterId]: 0 },
        enhancementState: record.variant,
        traceLevelFor: (source) => String(source.id) === characterId ? level : 1
    };
    return runtime.buildCandidates([record], context, inputs);
}

test("batch2 Silver Wolf explicit existing debuffs retain provider levels and party damage categories", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const [id, curve] of Object.entries(debuffCurves)) {
        const record = data.structuredModifiers.find((item) => item.id === id);
        assert.ok(record, id);
        for (let level = 1; level <= 10; level++) {
            for (const party of [false, true]) {
                const off = candidatesFor(record, level, "1006", {}, party);
                assert.equal(off.length, 1, id);
                assert.equal(off[0].enabled, false, id + " does not infer a successful debuff");
                const active = candidatesFor(record, level, "1006", { [record.activation.inputKey]: true }, party);
                assert.equal(active[0].enabled, true, id);
                assert.equal(active[0].providerId, "1006", id);
                assertClose(active[0].value, curve[level - 1], id + " Lv" + level);
                const attack = attackOf(data, party ? "131201" : record.variant === "enhanced" ? "1100601" : "100601");
                const input = makeRequest(attack, 1, snapshots[0], active);
                matches(engine, input, 50, true, id + " native debuff" + (party ? " from teammate" : " self"));
            }
        }
    }
});

test("batch2 Guinaifen already-present Firekiss uses Talent Lv, caps E0 at three, and supports teammates", async () => {
    const { data, engine } = await loadProductionFixture();
    const firekiss = data.structuredModifiers.find((item) => item.id === "trace:1210:121004:firekiss");
    const burnBonus = data.structuredModifiers.find((item) => item.id === "traceNode:1210:1210103:burn-damage");
    assert.ok(firekiss);
    assert.ok(burnBonus);
    const perStack = [4, 4.3, 4.6, 4.9, 5.2, 5.5, 5.87, 6.25, 6.63, 7];
    for (let level = 1; level <= 10; level++) {
        for (const stacks of [0, 1, 3, 4]) {
            for (const party of [false, true]) {
                const mods = candidatesFor(firekiss, level, "1210", { "guinaifen-firekiss-stacks": stacks }, party);
                assertClose(mods[0].value, perStack[level - 1] * Math.min(stacks, 3), "E0 existing Firekiss");
                const attack = attackOf(data, party ? "131201" : "121001");
                matches(engine, makeRequest(attack, 1, snapshots[0], mods), 50, true, "Firekiss existing stack damage");
            }
        }
    }
    const context = { characterId: "1210", eidolon: 0, traceLevelFor: () => 1 };
    assert.equal(runtime.buildCandidates([burnBonus], context, {})[0].enabled, false, "burning state is explicit");
    const on = runtime.buildCandidates([burnBonus], context, { "enemy-burning": true });
    assert.equal(on[0].value, 20);
    assert.equal(on[0].enabled, true);
    matches(engine, makeRequest(attackOf(data, "121001"), 1, snapshots[0], on), 50, true, "A6 versus preexisting Burn");
    assert.deepEqual(runtime.buildCandidates([burnBonus], { characterId: "1312", partyIds: ["1210"], eidolon: 0 }, { "enemy-burning": true }), [], "A6 remains Guinaifen-only");
});

test("batch2 Misha retains prefrozen E0 scope instead of claiming general Ultimate proc simulation", async () => {
    const { data } = await loadProductionFixture();
    const attack = attackOf(data, "131203");
    assert.equal(attack.provenance.sourceCommit, fixedSourceSha);
    assert.equal(attack.maximumEidolon, 0);
    assert.equal(attack.enemyCountExact, 1);
    assert.equal(attack.hitCountMinimum, 3);
    assert.equal(attack.hitCountMaximum, 10);
    assert.equal(attack.requiresValidHitCount, true);
    assert.equal(attack.modifierInputKey, "misha-prefrozen-ultimate");
    assert.equal(attack.modifierInputMinimum, 1);
    assert.equal(attack.requiredToughnessActive, true);
    assert.equal(attack.requiresNonWeakTarget, true);
});

test("batch2 Silver Wolf Annotation preserves the realized cast condition and enhanced ATK stays in final stats", async () => {
    const { data, engine } = await loadProductionFixture();
    const annotation = data.structuredModifiers.find((item) => item.id === "traceNode:1006:1006103:extra-resistance");
    assert.ok(annotation);
    assert.equal(annotation.value.fixed, 3);
    for (const debuffCount of [0, 2, 3, 5]) {
        const context = { characterId: "1006", enhancementState: "previous", eidolon: 0, enemy: { debuffCount }, traceLevelFor: () => 10 };
        const off = runtime.buildCandidates([annotation], context, {});
        assert.equal(off[0].enabled, false, "current debuffs cannot establish the earlier cast condition");
        const on = runtime.buildCandidates([annotation], context, { "silverwolf-annotation-active": true });
        assert.equal(on[0].enabled, true, "confirmed A6 RES remains active independent of later debuff count");
        assert.equal(on[0].value, 3);
        matches(engine, makeRequest(attackOf(data, "100601"), 1, snapshots[0], on), 50, true, "A6 persisted RES reduction");
    }
    const enhancedAtk = data.structuredModifiers.find((item) => item.id === "traceNode:1006:11006103:effect-hit-atk");
    assert.ok(enhancedAtk);
    assert.equal(enhancedAtk.inputPolicy, "includedInFinalStats");
    for (const effectHitRate of [9.9, 17.5, 50, 70]) {
        const candidates = runtime.buildCandidates([enhancedAtk], { characterId: "1006", enhancementState: "enhanced", stats: { effectHitRate }, eidolon: 0 }, {});
        assert.equal(candidates[0].enabled, false, "final ATK already contains enhanced A6");
        assert.equal(candidates[0].displayOnly, true);
    }
});

test("batch2 Guinaifen own-Burn detonation resolves every independent Skill and Ultimate level", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "1210031");
    const factors = attack.multiplierProductComponents;
    const ultimatePercent = [72, 74, 76, 78, 80, 82, 84.5, 87, 89.5, 92];
    assert.ok(Array.isArray(factors), "detonation must resolve two independent trace levels");
    assert.equal(factors.length, 2);
    const skillFactor = factors.find((item) => item.traceKey === "skill");
    const ultimateFactor = factors.find((item) => item.traceKey === "ultimate");
    assert.ok(skillFactor, "own Burn comes from Skill Lv");
    assert.ok(ultimateFactor, "detonation fraction comes from Ultimate Lv");
    assert.deepEqual(Array.from(skillFactor.values), ownBurn, "independently transcribed Burn curve");
    assert.deepEqual(Array.from(ultimateFactor.values), ultimatePercent, "independently transcribed detonation curve");
    assert.equal(attack.canCrit, false, "a Burn detonation cannot crit");
    assert.equal(attack.type, "dot", "detonation retains the Burn damage type");
    assert.equal(attack.maximumEidolon, 0, "E2 snapshot and E6 state changes are outside this scope");
    const firekiss = data.structuredModifiers.find((item) => item.id === "trace:1210:121004:firekiss");
    const burningBonus = data.structuredModifiers.find((item) => item.id === "traceNode:1210:1210103:burn-damage");
    assert.ok(firekiss);
    assert.ok(burningBonus);
    const talentPerStack = [4, 4.3, 4.6, 4.9, 5.2, 5.5, 5.87, 6.25, 6.63, 7];
    for (let skillLevel = 1; skillLevel <= 10; skillLevel++) {
        for (let ultimateLevel = 1; ultimateLevel <= 10; ultimateLevel++) {
            const levels = { skill: skillLevel, ultimate: ultimateLevel };
            const resolvedMultiplier = factors.reduce((product, component) => product * component.values[levels[component.traceKey] - 1] / 100, 100);
            const expectedMultiplier = ownBurn[skillLevel - 1] * ultimatePercent[ultimateLevel - 1] / 100;
            assertClose(resolvedMultiplier, expectedMultiplier, `own Burn Skill${skillLevel}/Ult${ultimateLevel} coefficient`);
            const talentLevel = (skillLevel + ultimateLevel) % 10 + 1;
            const native = [
                ...candidatesFor(firekiss, talentLevel, "1210", { [firekiss.activation.inputKey]: 3 }),
                ...candidatesFor(burningBonus, talentLevel, "1210", { [burningBonus.activation.inputKey]: true })
            ];
            assertClose(native[0].value, talentPerStack[talentLevel - 1] * 3, "three prior Firekiss layers at independent Talent Lv");
            assert.equal(native[0].enabled, true);
            assert.equal(native[1].value, 20, "unlocked A6 versus prior Burn");
            assert.equal(native[1].enabled, true);
            for (const snapshot of snapshots) {
                for (const modifiers of [native, [...native, ...bonuses]]) {
                    const input = attachState(makeRequest(attack, ultimateLevel, snapshot, modifiers));
                    Object.assign(input.modifierInputs, { [firekiss.activation.inputKey]: 3, [burningBonus.activation.inputKey]: true });
                    input.attack.multiplier = resolvedMultiplier;
                    input.attack.resolvedMultiplierProductComponents = factors.map((component) => ({ ...component, level: levels[component.traceKey], value: component.values[levels[component.traceKey] - 1] }));
                    const baseline = matches(engine, input, expectedMultiplier, false, `own Burn Skill${skillLevel}/Ult${ultimateLevel}`);
                    assertClose(baseline.crit, baseline.nonCrit, "detonated Burn does not crit");
                    assertClose(baseline.expected, baseline.nonCrit, "detonated Burn has no critical expectation");
                    for (const stat of ["atk", "hp", "def"]) {
                        const changed = { ...input, character: { ...input.character, stats: { ...input.character.stats, [stat]: input.character.stats[stat] * 1.217 + 83.375 } } };
                        const result = matches(engine, changed, expectedMultiplier, false, `own Burn independent ${stat}`);
                        if (stat === "atk") assert.notEqual(result.nonCrit, baseline.nonCrit, "own-Burn ATK affects detonation");
                        else assertClose(result.nonCrit, baseline.nonCrit, "unrelated " + stat + " cannot affect detonation");
                    }
                }
            }
        }
    }
});

test("batch2 Misha delayed Freeze damage independently matches every pinned E0 Ultimate level", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "1312032");
    // character_skills.json:131203.params[0..9][3], fetched directly from the
    // pinned upstream source on 2026-10-26. This is damage on the frozen enemy's
    // later turn, without the freeze success probability or instant hit damage.
    const curve = [18, 19.2, 20.4, 21.6, 22.8, 24, 25.5, 27, 28.5, 30];
    assert.equal(attack.sourceSkillId, "131203");
    assert.equal(attack.characterId, "1312");
    assert.equal(attack.element, "Ice");
    assert.equal(attack.type, "additional", "Freeze damage is additional damage, not Burn-style DoT");
    assert.equal(attack.canCrit, false);
    assert.equal(attack.scalingStat, "atk");
    assert.equal(attack.damageFormula, "statMultiplier");
    assert.equal(attack.hitCount, 1);
    assert.equal(attack.enemyCountExact, 1);
    assert.equal(attack.maximumEidolon, 0);
    assert.equal(attack.maximumTraceLevel, 10);
    assert.equal(attack.provenance.sourceCommit, fixedSourceSha);
    assert.deepEqual(Array.from(attack.multipliers), curve);
    const a6 = data.structuredModifiers.find((item) => item.id === "traceNode:1312:1312103:frozen-critical-damage");
    assert.ok(a6);
    const frozenCrit = runtime.buildCandidates([a6], { characterId: "1312", eidolon: 0, traceLevelFor: () => 10 }, { [a6.activation.inputKey]: true });
    assert.equal(frozenCrit[0].value, 30);
    assert.equal(runtime.applicableToAttack(frozenCrit[0], attack), false, "A6 critical damage does not apply to the delayed tick");
    const dotOnly = { id: "freeze-must-not-use-dot-bonus", category: "dotDamage", value: 250, enabled: true, applicable: true };
    for (let level = 1; level <= 10; level++) {
        for (const snapshot of snapshots) {
            for (const modifiers of [[], bonuses]) {
                const input = makeRequest(attack, level, snapshot, modifiers);
                input.modifierInputs = { ...(attack.comparisonModifierInputs || {}), ...(attack.modifierInputKey ? { [attack.modifierInputKey]: true } : {}) };
                const baseline = matches(engine, input, curve[level - 1], false, `Misha delayed Freeze Lv${level}`);
                assertClose(baseline.crit, baseline.nonCrit, "Freeze cannot crit");
                assertClose(baseline.expected, baseline.nonCrit, "Freeze has no critical expectation");
                const irrelevantBonuses = { ...input, modifiers: [...modifiers, ...frozenCrit, dotOnly] };
                const unchanged = matches(engine, irrelevantBonuses, curve[level - 1], false, "Freeze excludes CRIT and DoT-only bonuses");
                assertClose(unchanged.nonCrit, baseline.nonCrit, "DoT-only bonus cannot change Freeze damage");
                assertClose(unchanged.expected, baseline.expected, "frozen-target CRIT bonus cannot change Freeze damage");
                for (const stat of ["atk", "hp", "def"]) {
                    const changed = { ...input, character: { ...input.character, stats: { ...input.character.stats, [stat]: input.character.stats[stat] * 1.217 + 83.375 } } };
                    const result = matches(engine, changed, curve[level - 1], false, "Misha delayed Freeze only " + stat);
                    if (stat === "atk") assert.notEqual(result.nonCrit, baseline.nonCrit);
                    else assertClose(result.nonCrit, baseline.nonCrit, "unrelated " + stat + " cannot affect Freeze");
                }
            }
        }
    }
});
