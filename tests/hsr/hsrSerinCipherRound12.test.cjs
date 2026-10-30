"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    fixedSourceSha,
    loadProductionFixture,
    runtime,
    makeRequest,
    independentDirectDamage,
    assertMatchesIndependent,
    assertClose,
    readJson
} = require("./helpers/hsrDirectVerification.cjs");

const attackFile = "games/hsr/data/calc/attacks-serin-cipher-round12.json";
const modifierFile = "games/hsr/data/calc/modifiers-serin-cipher-round12.json";

// Fixed-snapshot coefficient curves transcribed independently from the pinned Japanese records.
const expectedCurves = {
    "141001": [50, 60, 70, 80, 90, 100],
    "141003": [120, 128, 136, 144, 152, 160, 170, 180, 190, 200],
    "1410031": [32, 37.28, 42.56, 47.84, 53.12, 58.4, 63.2, 68, 74, 80],
    "1410041": [10, 11.65, 13.3, 14.95, 16.6, 18.25, 19.75, 21.25, 23.13, 25],
    "1410043": [10, 11.65, 13.3, 14.95, 16.6, 18.25, 19.75, 21.25, 23.13, 25],
    "1410044": [10, 11.65, 13.3, 14.95, 16.6, 18.25, 19.75, 21.25, 23.13, 25],
    "140602": [100, 110, 120, 130, 140, 150, 162.5, 175, 187.5, 200],
    "1406031": [60, 66, 72, 78, 84, 90, 97.5, 105, 112.5, 120],
    "1406032": [20, 22, 24, 26, 28, 30, 32.5, 35, 37.5, 40]
};
const expectedBleedCaps = [10, 11.65, 13.3, 14.95, 16.6, 18.25, 19.75, 21.25, 23.13, 25];

const profiles = [
    {
        atk: 3317.25, hp: 7159.5, def: 2411.75,
        baseAtk: 1043.5, baseHp: 1217.25, baseDef: 987.5,
        critRate: 37.25, critDamage: 143.5, damageBonus: 19.75,
        enemyLevel: 82, resistance: 27, toughnessActive: true,
        defenseReduction: 11.5, defenseIgnore: 4.25, resistancePenetration: 7.5, takenDamage: 9.25
    },
    {
        atk: 5041.5, hp: 8923.25, def: 3869.5,
        baseAtk: 1179.25, baseHp: 1003.5, baseDef: 1109.75,
        critRate: 71.5, critDamage: 88.75, damageBonus: 46.25,
        enemyLevel: 93, resistance: 5, toughnessActive: false,
        defenseReduction: 0, defenseIgnore: 12.5, resistancePenetration: 13.25, takenDamage: 0
    }
];

function installRound12(data) {
    data = { ...data, attacks: [...data.attacks], structuredModifiers: [...data.structuredModifiers] };
    const records = readJson(attackFile).overrides;
    const replacements = new Map(records.map(record => [String(record.id), record]));
    data.attacks = data.attacks.map(record => replacements.get(String(record.id)) || record);
    for (const record of records) {
        if (!data.attacks.some(item => String(item.id) === String(record.id))) data.attacks.push(record);
    }
    data.structuredModifiers.push(...readJson(modifierFile).modifiers);
    return { data, records };
}

function candidates(records, characterId, stats, attack, inputs = {}) {
    return runtime.buildCandidates(records, {
        characterId,
        eidolon: 0,
        stats,
        baseStats: { atk: 1100, hp: 1200, def: 900, speed: 100 },
        traceLevelFor: () => 10,
        attack
    }, inputs).map(item => ({
        ...item,
        applicable: item.applicable && runtime.applicableToAttack(item, attack)
    }));
}

test("Round12 direct promotions use fixed-source E0 curves at every adopted level", async () => {
    const records = readJson(attackFile).overrides;
    const byId = new Map(records.map(record => [String(record.id), record]));
    assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");

    for (const [id, curve] of Object.entries(expectedCurves)) {
        const attack = byId.get(id);
        assert.ok(attack, "expected fixed-source attack " + id);
        assert.deepEqual(attack.multipliers, curve, id + " pinned coefficient curve");
        assert.equal(attack.support.status, "calculable");
        assert.equal(attack.support.verified, true);
        assert.equal(attack.provenance.sourceCommit, fixedSourceSha);
        if (["141001", "141003", "140602"].includes(id)) {
            assert.equal(attack.maximumEidolon, 0);
            assert.equal(attack.maximumTraceLevel, curve.length);
            assert.equal(attack.characterLevelExact, 80);
            assert.equal(attack.enemyCountExact, 1);
            assert.equal(attack.damageFormula, "statMultiplier");
        }
    }

    const { data, engine } = await loadProductionFixture();
    const { data: testData } = installRound12(data);
    for (const id of ["141001", "141003", "140602"]) {
        const attack = testData.attacks.find(item => String(item.id) === id);
        const curve = expectedCurves[id];
        for (let level = 1; level <= curve.length; level += 1) {
            for (const [profileIndex, config] of profiles.entries()) {
                const input = makeRequest(attack, level, { ...config, enemyCount: 1 });
                input.attack.multiplier = curve[level - 1];
                if (id === "140602") {
                    input.modifierInputs = { "cipher-skill-atk-active": true };
                    const skillState = testData.structuredModifiers.find(item => item.id === "trace:1406:140602:post-skill-atk");
                    input.modifiers = candidates([skillState], "1406", input.character.stats, input.attack, input.modifierInputs);
                }
                const result = assertMatchesIndependent(engine, input, id + " Lv" + level + " profile" + profileIndex);
                assertClose(result.breakdown.referenceValue, config.atk + (id === "140602" ? config.baseAtk * 0.3 : 0), id + " reads correct final ATK state");
                assert.notEqual(result.nonCrit, result.crit, id + " retains direct-hit crit outcomes");
            }
        }
    }

    const dotCurves = {
        "1410031": expectedCurves["1410031"],
        "1410041": expectedCurves["1410041"],
        "1410043": expectedCurves["1410043"],
        "1410044": expectedCurves["1410044"]
    };
    for (const [id, curve] of Object.entries(dotCurves)) {
        const attack = testData.attacks.find(item => String(item.id) === id);
        assert.equal(attack.type, "dot");
        assert.equal(attack.canCrit, false);
        for (let level = 1; level <= curve.length; level += 1) {
            const config = profiles[level % profiles.length];
            const input = makeRequest(attack, level, { ...config, enemyCount: 1 });
            input.attack.multiplier = curve[level - 1];
            input.attack.type = "dot";
            const result = assertMatchesIndependent(engine, input, id + " DoT Lv" + level);
            assert.equal(result.attack.canCrit, false);
            assertClose(result.crit, result.nonCrit, id + " DoT does not crit Lv" + level);
        }
    }

    const bleed = testData.attacks.find(item => String(item.id) === "1410042");
    assert.equal(bleed.damageFormula, "enemyHpCappedByAtk");
    assert.equal(bleed.canCrit, false);
    assert.deepEqual(bleed.enemyHpPercentMultipliers, Array(10).fill(20));
    assert.deepEqual(bleed.atkCapMultipliers, expectedBleedCaps);
    for (let level = 1; level <= 10; level += 1) {
        const config = profiles[level % profiles.length];
        const input = makeRequest(bleed, level, { ...config, enemyCount: 1 });
        const cap = bleed.atkCapMultipliers[level - 1];
        input.enemy.maxHp = 42000.5;
        input.attack.multiplier = 100;
        input.attack.enemyHpPercent = 20;
        input.attack.atkCapPercent = cap;
        const cappedBase = Math.min(42000.5 * 0.2, config.atk * cap / 100);
        const oracle = {
            ...input,
            character: { ...input.character, stats: { ...input.character.stats, atk: cappedBase } },
            attack: { ...input.attack, damageFormula: "statMultiplier", multiplier: 100 }
        };
        const result = engine.calculate(input);
        const expected = require("./helpers/hsrDirectVerification.cjs").independentDirectDamage(oracle);
        assert.notEqual(result.supported, false, "bleed cap formula calculates at Lv" + level);
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], expected[key], "bleed " + key + " Lv" + level);
        assertClose(result.breakdown.cappedEnemyHpDamage, cappedBase, "bleed HP cap selection Lv" + level);
    }
});

test("Cipher Ultimate separates direct main/area components and explicit 25/75 record snapshots", () => {
    const parent = readJson(attackFile).overrides.find(item => String(item.id) === "140603");
    assert.equal(parent.damageFormula, "componentSequence");
    assert.equal(parent.maximumEidolon, 0);
    assert.equal(parent.enemyCountExact, 1);
    assert.equal(parent.damageComponents.length, 4);
    assert.deepEqual(parent.damageComponents.map(item => item.key), [
        "main-direct", "main-recorded-true", "single-enemy-area-direct", "single-enemy-area-recorded-true"
    ]);
    assert.deepEqual(parent.damageComponents.map(item => item.recordMultiplier || null), [null, 25, null, 75]);
    assert.deepEqual(parent.numericModifierInputs.map(item => item.inputKey), [
        "cipher-recorded-before-25", "cipher-recorded-before-75"
    ]);
    assert.ok(parent.numericModifierInputs.every(item => item.minimum === 0 && item.default === undefined));
    assert.match(parent.calculationNote, /記録の更新/);
    assert.match(parent.calculationNote, /複数敵/);

    const direct = expectedCurves["1406031"].map((value, index) => value + expectedCurves["1406032"][index]);
    assert.deepEqual(parent.multipliers, direct, "single enemy receives both direct ATK components");
    for (let level = 1; level <= 10; level += 1) {
        const recordAtMain = 8000.5 + level * 13.25;
        const recordAtArea = 7300.75 + level * 9.5;
        assertClose(recordAtMain * 25 / 100, recordAtMain * 0.25, "main fixed true-damage share Lv" + level);
        assertClose(recordAtArea * 75 / 100, recordAtArea * 0.75, "single-enemy area fixed true-damage share Lv" + level);
    }
});

test("Cipher Ultimate computes independent direct and explicit recorded-true components without chaining", async () => {
    const { data, engine } = await loadProductionFixture();
    const parent = data.attacks.find(item => String(item.id) === "140603");
    assert.ok(parent);
    const directMain = data.attacks.find(item => String(item.id) === "1406031");
    const directArea = data.attacks.find(item => String(item.id) === "1406032");
    const trueMain = data.attacks.find(item => String(item.id) === "1406033");
    const trueArea = data.attacks.find(item => String(item.id) === "1406034");
    assert.ok(directMain && directArea && trueMain && trueArea);
    const native = data.structuredModifiers.filter(item => [
        "trace:1406:1406101:speed-crit-rate",
        "trace:1406:1406103:follow-up-crit-damage",
        "trace:1406:1406103:enemy-taken-damage"
    ].includes(item.id));
    const profile = { ...profiles[1], speed: 170 };
    const stats = { ...makeRequest(parent, 1, profile).character.stats, speed: profile.speed };
    const baseStats = makeRequest(parent, 1, profile).character.baseStats;
    const enemy = makeRequest(parent, 1, profile).enemy;
    const records = { "cipher-recorded-before-25": 8102.25, "cipher-recorded-before-75": 7033.5 };

    for (let level = 1; level <= 10; level += 1) {
        const levelDirectMain = { ...directMain, traceLevel: level, multiplier: expectedCurves["1406031"][level - 1], attackType: "ultimate" };
        const levelDirectArea = { ...directArea, traceLevel: level, multiplier: expectedCurves["1406032"][level - 1], attackType: "ultimate" };
        const activeCandidates = attack => candidates(native, "1406", stats, attack);
        const requestFor = (attack, modifiers, trueDamage) => ({
            character: { level: 80, eidolon: 0, stats: { ...stats }, baseStats: { ...baseStats } },
            enemy: { ...enemy },
            attack,
            modifiers,
            modifierInputs: { ...records },
            ...(trueDamage ? { trueDamage } : {})
        });
        const mainMods = activeCandidates(levelDirectMain);
        const areaMods = activeCandidates(levelDirectArea);
        const mainInput = requestFor(levelDirectMain, mainMods);
        const areaInput = requestFor(levelDirectArea, areaMods);
        const mainExpected = independentDirectDamage(mainInput);
        const areaExpected = independentDirectDamage(areaInput);
        const trueMainInput = requestFor({ ...trueMain, traceLevel: 1, multiplier: 25, attackType: "trueDamage" }, [], {
            active: true, sourceKind: "cipherRecord", originalDamage: records["cipher-recorded-before-25"]
        });
        const trueAreaInput = requestFor({ ...trueArea, traceLevel: 1, multiplier: 75, attackType: "trueDamage" }, [], {
            active: true, sourceKind: "cipherRecord", originalDamage: records["cipher-recorded-before-75"]
        });
        const expectedTrueMain = records["cipher-recorded-before-25"] * 0.25;
        const expectedTrueArea = records["cipher-recorded-before-75"] * 0.75;
        const sequenceComponents = [
            { key: "main-direct", name: parent.damageComponents[0].name, input: mainInput },
            { key: "main-recorded-true", name: parent.damageComponents[1].name, input: trueMainInput },
            { key: "single-enemy-area-direct", name: parent.damageComponents[2].name, input: areaInput },
            { key: "single-enemy-area-recorded-true", name: parent.damageComponents[3].name, input: trueAreaInput }
        ];
        const request = makeRequest(parent, level, { ...profile, enemyCount: 1 });
        request.character.stats = { ...stats };
        request.character.baseStats = { ...baseStats };
        request.enemy = { ...enemy };
        request.modifierInputs = { ...records };
        request.sequenceComponents = sequenceComponents;
        const result = engine.calculate(request);
        assert.notEqual(result.supported, false, "Cipher Ultimate snapshot calculates at Lv" + level + ": " + result.reason);
        const expected = {
            nonCrit: mainExpected.nonCrit + expectedTrueMain + areaExpected.nonCrit + expectedTrueArea,
            crit: mainExpected.crit + expectedTrueMain + areaExpected.crit + expectedTrueArea,
            expected: mainExpected.expected + expectedTrueMain + areaExpected.expected + expectedTrueArea
        };
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], expected[key], "Cipher Ult " + key + " Lv" + level);
        assertClose(result.components["main-recorded-true"].nonCrit, expectedTrueMain, "recorded 25% independent snapshot");
        assertClose(result.components["single-enemy-area-recorded-true"].nonCrit, expectedTrueArea, "recorded 75% independent snapshot");

        const missing = { ...request, modifierInputs: {}, sequenceComponents: sequenceComponents.map(component => ({
            ...component,
            input: component.input.attack.damageFormula === "trueDamage" ? { ...component.input, modifierInputs: {}, trueDamage: { ...component.input.trueDamage, originalDamage: undefined } } : component.input
        })) };
        assert.equal(engine.calculate(missing).supported, false, "missing record value only rejects this snapshot composite");
    }
});

test("Cipher A4 SPD thresholds are automatic and A6 Crit DMG applies to FUA only", async () => {
    const { data, engine } = await loadProductionFixture();
    const installed = installRound12(data);
    const testData = installed.data;
    const records = readJson(modifierFile).modifiers;
    const a4 = records.find(item => item.id === "trace:1406:1406101:speed-crit-rate");
    const a6 = records.find(item => item.id === "trace:1406:1406103:follow-up-crit-damage");
    assert.ok(a4 && a6);
    assert.equal(a4.activation.mode, "statThreshold");
    assert.equal(a4.activation.statSource, "effective");
    assert.equal(a4.finalStatsInclusion.inputKey, "cipher-a4-speed-crit-in-final-stats");
    assert.equal(a6.activation.mode, "always");
    assert.equal(a6.finalStatsInclusion.inputKey, "cipher-fua-crit-damage-in-final-stats");
    assert.deepEqual(a6.target.attackTypes, ["followUp"]);

    for (const [speed, expected] of [[139.99, 0], [140, 25], [169.99, 25], [170, 50], [191, 50]]) {
        const attack = { id: "140604", type: "followUp", attackType: "followUp", element: "Quantum" };
        const found = candidates([a4], "1406", { speed }, attack)[0];
        assert.equal(found.enabled, expected > 0, "SPD " + speed + " auto threshold activation");
        assert.equal(found.value, expected, "SPD " + speed + " selects one replace tier");
        const included = candidates([a4], "1406", { speed }, attack, { "cipher-a4-speed-crit-in-final-stats": true })[0];
        assert.equal(included.enabled, false, "already-input CR is not added twice");
    }

    const followUp = testData.attacks.find(item => String(item.id) === "140604");
    const skill = testData.attacks.find(item => String(item.id) === "140602");
    const ctx = { critRate: 50, critDamage: 100, speed: 170 };
    const followUpMods = candidates([a4, a6], "1406", ctx, followUp);
    assert.ok(followUpMods.find(item => item.id === a6.id).enabled);
    const skillMods = candidates([a4, a6], "1406", ctx, skill);
    assert.equal(skillMods.find(item => item.id === a6.id).applicable, false, "A6 bonus excludes Skill");

    const request = makeRequest(followUp, 10, { atk: 3601.25, critRate: 50, critDamage: 100 });
    request.modifiers = followUpMods;
    const result = engine.calculate(request);
    assert.notEqual(result.supported, false);
    const base = makeRequest(followUp, 10, { atk: 3601.25, critRate: 50, critDamage: 100 });
    const baseline = engine.calculate(base);
    assertClose(result.nonCrit, baseline.nonCrit, "A4/A6 do not change non-crit direct damage");
    assertClose(result.crit / result.nonCrit, 3, "100% A6 FUA CD is applied exactly once at CR 50%, base CD 100%");
});

test("Serin A6 EHR damage threshold, Cipher post-Skill ATK state and A6 vulnerability remain scoped", async () => {
    const { data, engine } = await loadProductionFixture();
    const { data: testData } = installRound12(data);
    const records = readJson(modifierFile).modifiers;
    const serinA6 = records.find(item => item.id === "trace:1410:1410103:effect-hit-damage");
    const cipherSkill = records.find(item => item.id === "trace:1406:140602:post-skill-atk");
    const cipherA6 = records.find(item => item.id === "trace:1406:1406103:enemy-taken-damage");
    assert.ok(serinA6 && cipherSkill && cipherA6);
    assert.equal(serinA6.activation.mode, "statThreshold");
    assert.equal(serinA6.activation.operator, ">");
    assert.equal(cipherSkill.activation.default, false, "post-skill ATK requires explicit state");
    assert.equal(cipherSkill.finalStatsInclusion.inputKey, "cipher-skill-atk-in-final-stats");
    assert.equal(cipherA6.activation.mode, "always", "on-field E0 A6 vulnerability is automatic");
    assert.equal(cipherA6.category, "takenDamage");

    for (const [ehr, expected] of [[59.99, 0], [60, 0], [69.99, 0], [70, 15], [80, 30], [120, 90], [145, 90]]) {
        const attack = { id: "141003", type: "ultimate", attackType: "ultimate", element: "Physical" };
        const modifier = runtime.buildCandidates([serinA6], { characterId: "1410", eidolon: 0, stats: { effectHitRate: ehr }, attack }, {})[0];
        assert.equal(modifier.enabled, ehr > 60);
        assert.equal(modifier.value, expected, "Serin EHR " + ehr + " maps to threshold value");
    }
    const serinUlt = testData.attacks.find(item => String(item.id) === "141003");
    const serinConfig = { ...profiles[0], effectHitRate: 120 };
    const serinInput = makeRequest(serinUlt, 10, { ...serinConfig, enemyCount: 1 });
    serinInput.character.stats.effectHitRate = 120;
    const serinNative = runtime.buildCandidates([serinA6], { characterId: "1410", eidolon: 0, stats: serinInput.character.stats, attack: serinInput.attack }, {})
        .map(item => ({ ...item, applicable: item.applicable && runtime.applicableToAttack(item, serinInput.attack) }));
    serinInput.modifiers = serinNative;
    const serinActual = engine.calculate(serinInput);
    const serinExpected = independentDirectDamage(serinInput);
    assertClose(serinNative[0].value, 90, "Serin A6 EHR-derived damage cap");
    assertClose(serinActual.nonCrit, serinExpected.nonCrit, "Serin EHR bonus reaches direct Ultimate damage");

    const skill = testData.attacks.find(item => String(item.id) === "140602");
    const skillContext = { characterId: "1406", eidolon: 0, stats: {}, baseStats: { atk: 1100 }, traceLevelFor: () => 10, attack: skill };
    const off = runtime.buildCandidates([cipherSkill], skillContext, {});
    assert.equal(off[0].enabled, false);
    const on = runtime.buildCandidates([cipherSkill], skillContext, { "cipher-skill-atk-active": true });
    assert.equal(on[0].enabled, true, "pre-existing state is user-selected");
    assert.equal(on[0].value, 30);
    assert.equal(on[0].includedInFinalStats, false);
    const included = runtime.buildCandidates([cipherSkill], skillContext, { "cipher-skill-atk-active": true, "cipher-skill-atk-in-final-stats": true });
    assert.equal(included[0].enabled, false, "final ATK inclusion prevents duplicate");
    const followUp = testData.attacks.find(item => String(item.id) === "140604");
    const onFollowUp = runtime.buildCandidates([cipherSkill], { ...skillContext, attack: followUp }, { "cipher-skill-atk-active": true });
    const followUpBase = makeRequest(followUp, 10, { atk: 3601.25, baseAtk: 1100 });
    followUpBase.modifiers = onFollowUp;
    const followUpBuffed = engine.calculate(followUpBase);
    const followUpOracle = independentDirectDamage(followUpBase);
    assertClose(followUpBuffed.nonCrit, followUpOracle.nonCrit, "pre-existing +30% post-Skill ATK reaches a later FUA");
    assertClose(followUpBuffed.breakdown.referenceValue, 3931.25, "ATK threshold uses final ATK plus base-ATK percentage once");
    const followUpIncluded = makeRequest(followUp, 10, { atk: 3931.25, baseAtk: 1100 });
    followUpIncluded.modifiers = runtime.buildCandidates([cipherSkill], { ...skillContext, attack: followUp }, { "cipher-skill-atk-active": true, "cipher-skill-atk-in-final-stats": true });
    assertClose(engine.calculate(followUpIncluded).nonCrit, followUpBuffed.nonCrit, "final ATK inclusion does not add the post-Skill ATK twice");

    const enemy = runtime.buildCandidates([cipherA6], { characterId: "1406", partyIds: [], stats: {}, attack: skill }, {})[0];
    assert.equal(enemy.enabled, true);
    assert.equal(enemy.value, 40);
    assert.equal(enemy.target.owner, "enemyAll");
    assert.equal(runtime.buildCandidates([cipherA6], { characterId: "1406", stats: {}, attack: skill }, { "cipher-a6-taken-damage-in-enemy-input": true })[0].enabled, false);
    const cipherInput = makeRequest(skill, 10, { atk: 3601.25, takenDamage: 0 });
    cipherInput.modifierInputs = { "cipher-skill-atk-active": true };
    cipherInput.modifiers = candidates([cipherSkill, cipherA6], "1406", cipherInput.character.stats, cipherInput.attack, cipherInput.modifierInputs);
    const cipherActual = engine.calculate(cipherInput);
    assertClose(cipherActual.nonCrit, independentDirectDamage(cipherInput).nonCrit, "Cipher A6 vulnerability reaches Skill damage");
    const cipherIncluded = makeRequest(skill, 10, { atk: 3601.25, takenDamage: 40 });
    cipherIncluded.modifierInputs = { "cipher-skill-atk-active": true, "cipher-a6-taken-damage-in-enemy-input": true };
    cipherIncluded.modifiers = candidates([cipherSkill, cipherA6], "1406", cipherIncluded.character.stats, cipherIncluded.attack, cipherIncluded.modifierInputs);
    assertClose(engine.calculate(cipherIncluded).nonCrit, cipherActual.nonCrit, "enemy input inclusion prevents Cipher A6 vulnerability double-count");
});

test("Cipher limited E0 core attacks match independent all-level snapshots with native traces", async () => {
    const { data, engine } = await loadProductionFixture();
    const { data: testData } = installRound12(data);
    const native = readJson(modifierFile).modifiers.filter(item => String(item.source?.id) === "1406");
    const byModifierId = new Map(native.map(item => [item.id, item]));
    const a4 = byModifierId.get("trace:1406:1406101:speed-crit-rate");
    const skillAtk = byModifierId.get("trace:1406:140602:post-skill-atk");
    const fuaCritDamage = byModifierId.get("trace:1406:1406103:follow-up-crit-damage");
    const enemyTaken = byModifierId.get("trace:1406:1406103:enemy-taken-damage");
    assert.ok(a4 && skillAtk && fuaCritDamage && enemyTaken, "all four E0 native Modifier paths are present");
    assert.equal(a4.support.status, "calculable");
    assert.equal(skillAtk.support.status, "calculable");
    assert.equal(fuaCritDamage.support.status, "calculable");
    assert.equal(enemyTaken.support.status, "calculable");

    const profile = {
        atk: 3271.75, baseAtk: 1123.5, hp: 8121.25, def: 2334.5,
        critRate: 21.25, critDamage: 137.75, damageBonus: 18.5,
        speed: 139.99, enemyLevel: 87, resistance: 24.5,
        defenseReduction: 8.25, defenseIgnore: 3.5, resistancePenetration: 6.75, takenDamage: 4.25,
        toughnessActive: true, enemyCount: 1
    };
    const inputKeys = {
        skillActive: "cipher-skill-atk-active",
        skillIncluded: "cipher-skill-atk-in-final-stats",
        critIncluded: "cipher-a4-speed-crit-in-final-stats",
        fuaCritIncluded: "cipher-fua-crit-damage-in-final-stats",
        takenIncluded: "cipher-a6-taken-damage-in-enemy-input"
    };
    const makeNative = (attack, stats, extra = {}) => candidates(native, "1406", stats, attack, extra);
    const expectedCurve = {
        "140601": [50, 60, 70, 80, 90, 100],
        "140602": expectedCurves["140602"],
        "140604": [75, 82.5, 90, 97.5, 105, 112.5, 121.88, 131.25, 140.62, 150]
    };
    const boundarySpeeds = [139.99, 140, 169.99, 170];

    // E0 uses Normal Lv1-6 and Skill/Ultimate/Talent Lv1-10. Each trace is
    // independently compared with an oracle that does not call the engine.
    for (const id of ["140601", "140602", "140604"]) {
        const attack = testData.attacks.find(item => String(item.id) === id);
        assert.ok(attack, "Cipher core attack " + id);
        assert.deepEqual(attack.multipliers.slice(0, expectedCurve[id].length), expectedCurve[id], id + " pinned E0 curve");
        for (const speed of boundarySpeeds) {
            const activeTier = speed >= 170 ? 50 : speed >= 140 ? 25 : 0;
            for (let level = 1; level <= expectedCurve[id].length; level += 1) {
                const config = { ...profile, speed };
                const input = makeRequest(attack, level, config);
                input.attack.multiplier = expectedCurve[id][level - 1];
                input.modifierInputs = { [inputKeys.skillActive]: true };
                input.modifiers = makeNative(input.attack, { ...input.character.stats, speed }, input.modifierInputs);
                const result = assertMatchesIndependent(engine, input, "Cipher " + id + " SPD" + speed + " Lv" + level);
                assertClose(result.breakdown.referenceValue, config.atk + config.baseAtk * 0.3, id + " reads final ATK plus pre-existing +30% exactly once");
                const crModifier = input.modifiers.find(item => item.id === a4.id);
                assert.equal(crModifier.value, activeTier, id + " A4 threshold at SPD " + speed);
                const vulnerability = input.modifiers.find(item => item.id === enemyTaken.id);
                assert.equal(vulnerability.enabled, true, id + " A6 enemy vulnerability is automatic");
                const fuaBonus = input.modifiers.find(item => item.id === fuaCritDamage.id);
                assert.equal(Boolean(fuaBonus?.applicable), id === "140604", "A6 +100% CD is restricted to the FUA");
            }
        }
    }

    const skill = testData.attacks.find(item => String(item.id) === "140602");
    const missingState = makeRequest(skill, 10, { ...profile, speed: 170 });
    missingState.modifiers = makeNative(missingState.attack, { ...missingState.character.stats, speed: 170 }, {});
    assert.equal(engine.calculate(missingState).supported, false, "Skill is rejected without a declared pre-active ATK+30 state");

    // The user can either apply the prior-state modifier or say final ATK
    // already includes it; both paths must produce the same result.
    const attackState = makeRequest(skill, 10, { ...profile, speed: 170 });
    attackState.modifierInputs = { [inputKeys.skillActive]: true };
    attackState.modifiers = makeNative(attackState.attack, { ...attackState.character.stats, speed: 170 }, attackState.modifierInputs);
    const appliedState = engine.calculate(attackState);
    assert.notEqual(appliedState.supported, false, appliedState.reason);
    const alreadyIncluded = makeRequest(skill, 10, { ...profile, atk: profile.atk + profile.baseAtk * 0.3, speed: 170 });
    alreadyIncluded.modifierInputs = { [inputKeys.skillActive]: true, [inputKeys.skillIncluded]: true };
    alreadyIncluded.modifiers = makeNative(alreadyIncluded.attack, { ...alreadyIncluded.character.stats, speed: 170 }, alreadyIncluded.modifierInputs);
    const includedState = engine.calculate(alreadyIncluded);
    assert.notEqual(includedState.supported, false, includedState.reason);
    assertClose(includedState.expected, appliedState.expected, "final ATK inclusion avoids duplicate +30% and preserves damage");

    // A4's CR and A6's enemy vulnerability may each already be present in
    // their respective final inputs. Removal of the separate candidate must
    // leave the same result, with no double counting.
    const followUp = testData.attacks.find(item => String(item.id) === "140604");
    const fuaBase = makeRequest(followUp, 10, { ...profile, speed: 170 });
    fuaBase.modifierInputs = { [inputKeys.skillActive]: true };
    fuaBase.modifiers = makeNative(fuaBase.attack, { ...fuaBase.character.stats, speed: 170 }, fuaBase.modifierInputs);
    const fuaAuto = engine.calculate(fuaBase);
    const fuaIncluded = makeRequest(followUp, 10, {
        ...profile, speed: 170, critRate: profile.critRate + 50,
        critDamage: profile.critDamage + 100, takenDamage: profile.takenDamage + 40
    });
    fuaIncluded.modifierInputs = {
        [inputKeys.skillActive]: true,
        [inputKeys.critIncluded]: true,
        [inputKeys.fuaCritIncluded]: true,
        [inputKeys.takenIncluded]: true
    };
    fuaIncluded.modifiers = makeNative(fuaIncluded.attack, { ...fuaIncluded.character.stats, speed: 170 }, fuaIncluded.modifierInputs);
    assert.equal(fuaIncluded.modifiers.find(item => item.id === a4.id).enabled, false, "A4 is removed when CR is included in final input");
    assert.equal(fuaIncluded.modifiers.find(item => item.id === fuaCritDamage.id).enabled, false, "A6 FUA CD is removed when its +100% is included in final input");
    assert.equal(fuaIncluded.modifiers.find(item => item.id === enemyTaken.id).enabled, false, "A6 vulnerability is removed when enemy input already includes it");
    assertClose(engine.calculate(fuaIncluded).expected, fuaAuto.expected, "CR, FUA CD, and enemy vulnerability inclusion preserve expected damage exactly");

    // Preserve and verify the Round11 FUA definition: no new activation gate,
    // same fixed coefficient series, and same condition scope.
    const oldFua = data.attacks.find(item => String(item.id) === "140604");
    assert.ok(oldFua);
    assert.deepEqual(oldFua.multipliers, [75, 82.5, 90, 97.5, 105, 112.5, 121.88, 131.25, 140.62, 150]);
    assert.equal(oldFua.conditionText, "Lv80・星魂0・天賦Lv1～10。お得意様の敵にサフェル以外の味方が攻撃した時に発生する追加攻撃1回。1ターン中の発動上限を超える追加発生は含みません。");
});

test("Cipher Ultimate all levels independently include the four direct-path native effects and explicit record snapshots", async () => {
    const { data, engine } = await loadProductionFixture();
    const { data: testData } = installRound12(data);
    const parent = testData.attacks.find(item => String(item.id) === "140603");
    const directMain = testData.attacks.find(item => String(item.id) === "1406031");
    const directArea = testData.attacks.find(item => String(item.id) === "1406032");
    const trueMain = testData.attacks.find(item => String(item.id) === "1406033");
    const trueArea = testData.attacks.find(item => String(item.id) === "1406034");
    const native = readJson(modifierFile).modifiers.filter(item => String(item.source?.id) === "1406");
    assert.ok(parent && directMain && directArea && trueMain && trueArea);
    const recordValues = { "cipher-recorded-before-25": 8102.25, "cipher-recorded-before-75": 7033.5 };
    for (const speed of [139.99, 140, 170]) {
        for (let level = 1; level <= 10; level += 1) {
            const config = { ...profiles[1], ...{ atk: 3271.75, baseAtk: 1123.5, critRate: 21.25, critDamage: 137.75, speed, enemyCount: 1 } };
            const parentInput = makeRequest(parent, level, config);
            const stats = { ...parentInput.character.stats, speed };
            const baseStats = { ...parentInput.character.baseStats };
            const enemy = { ...parentInput.enemy };
            const assumptions = { ...recordValues, "cipher-skill-atk-active": true };
            const directComponentInput = (definition, curve, name) => {
                const attack = { ...definition, traceLevel: level, multiplier: curve[level - 1], attackType: "ultimate" };
                const input = makeRequest(attack, level, config);
                input.character.stats = { ...stats };
                input.character.baseStats = { ...baseStats };
                input.enemy = { ...enemy };
                input.modifierInputs = { ...assumptions };
                input.modifiers = candidates(native, "1406", stats, attack, assumptions);
                return { key: name, name, input };
            };
            const directMainPart = directComponentInput(directMain, expectedCurves["1406031"], "main-direct");
            const directAreaPart = directComponentInput(directArea, expectedCurves["1406032"], "single-enemy-area-direct");
            const trueMainInput = makeRequest({ ...trueMain, traceLevel: 1, multiplier: 25, attackType: "trueDamage" }, 1, config);
            trueMainInput.character.stats = { ...stats };
            trueMainInput.character.baseStats = { ...baseStats };
            trueMainInput.enemy = { ...enemy };
            trueMainInput.modifierInputs = { ...assumptions };
            trueMainInput.trueDamage = { active: true, sourceKind: "cipherRecord", originalDamage: recordValues["cipher-recorded-before-25"] };
            const trueAreaInput = makeRequest({ ...trueArea, traceLevel: 1, multiplier: 75, attackType: "trueDamage" }, 1, config);
            trueAreaInput.character.stats = { ...stats };
            trueAreaInput.character.baseStats = { ...baseStats };
            trueAreaInput.enemy = { ...enemy };
            trueAreaInput.modifierInputs = { ...assumptions };
            trueAreaInput.trueDamage = { active: true, sourceKind: "cipherRecord", originalDamage: recordValues["cipher-recorded-before-75"] };
            const sequenceComponents = [
                directMainPart,
                { key: "main-recorded-true", name: "main-recorded-true", input: trueMainInput },
                directAreaPart,
                { key: "single-enemy-area-recorded-true", name: "single-enemy-area-recorded-true", input: trueAreaInput }
            ];
            parentInput.character.stats = { ...stats };
            parentInput.character.baseStats = { ...baseStats };
            parentInput.enemy = { ...enemy };
            parentInput.modifierInputs = { ...assumptions };
            parentInput.sequenceComponents = sequenceComponents;

            const mainExpected = independentDirectDamage(directMainPart.input);
            const areaExpected = independentDirectDamage(directAreaPart.input);
            const trueExpected = recordValues["cipher-recorded-before-25"] * 0.25 + recordValues["cipher-recorded-before-75"] * 0.75;
            const result = engine.calculate(parentInput);
            assert.notEqual(result.supported, false, "Ultimate snapshot SPD" + speed + " Lv" + level + ": " + result.reason);
            for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], mainExpected[key] + areaExpected[key] + trueExpected, "Cipher Ultimate " + key + " SPD" + speed + " Lv" + level);
            assertClose(result.components["main-recorded-true"].nonCrit, recordValues["cipher-recorded-before-25"] * 0.25, "recorded 25% remains modifier-free");
            assertClose(result.components["single-enemy-area-recorded-true"].nonCrit, recordValues["cipher-recorded-before-75"] * 0.75, "recorded 75% remains modifier-free");
        }
    }
});
