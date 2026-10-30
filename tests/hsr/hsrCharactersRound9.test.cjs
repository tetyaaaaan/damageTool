"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    fixedSourceSha, loadProductionFixture, attackOf, makeRequest,
    independentDirectDamage, assertClose, readJson
} = require("./helpers/hsrDirectVerification.cjs");
const runtime = require("../../games/js/hsrModifierRuntime.js");

// Hand-transcribed from fixed StarRailRes dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487
// parameter curves; expected damage below is computed independently from production output.
const yanqingSource = {
    "120901": [50, 60, 70, 80, 90, 100, 110, 120, 130, 140],
    "120902": [110, 121, 132, 143, 154, 165, 178.75, 192.5, 206.25, 220],
    "120903": [210, 224, 238, 252, 266, 280, 297.5, 315, 332.5, 350],
    "120904": [25, 27.5, 30, 32.5, 35, 37.5, 40.62, 43.75, 46.88, 50],
    "1209041": [25, 27.5, 30, 32.5, 35, 37.5, 40.62, 43.75, 46.88, 50]
};

const source = {
    aoe: [168, 179.2, 190.4, 201.6, 212.8, 224, 238, 252, 266, 280],
    bounce: [57, 60.8, 64.6, 68.4, 72.2, 76, 80.75, 85.5, 90.25, 95],
    critRatePerGlory: [1, 1.15, 1.3, 1.45, 1.6, 1.75, 1.94, 2.13, 2.31, 2.5]
};
const profiles = [
    { atk: 3175.25, hp: 9432.5, def: 1288.75, critRate: 37.5, critDamage: 113.25, damageBonus: 27.5, enemyLevel: 83, resistance: 30, defenseReduction: 12.5, defenseIgnore: 7.5, resistancePenetration: 6.25 },
    { atk: 2143.75, hp: 14321.25, def: 3541.5, critRate: 71.25, critDamage: 87.5, damageBonus: 11.75, enemyLevel: 76, resistance: 10, defenseReduction: 4.25, defenseIgnore: 18.5, resistancePenetration: 13.75 }
];

test("Argenti 180-EP Ultimate is calculable only for a stable pre-existing 10-Glory enemy snapshot", async () => {
    assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
    const { data, engine } = await loadProductionFixture();
    const authored = readJson("games/hsr/data/calc/attacks-characters-round9.json").overrides;
    assert.equal(authored.length, 1);
    assert.equal(authored[0].id, "130214");
    const attack = attackOf(data, "130214");
    assert.equal(attack.support.status, "calculable");
    assert.equal(attack.support.verified, true);
    assert.equal(attack.provenance.sourceCommit, fixedSourceSha);
    assert.equal(attack.maximumEidolon, 0);
    assert.equal(attack.maximumTraceLevel, 10);
    assert.equal(attack.enemyCountExact, 1);
    assert.equal(attack.multiplierComponents.length, 2);

    const a6 = data.structuredModifiers.find((item) => item.id === "traceNode:1302:1302103:low-hp-damage");
    assert.ok(a6, "Argenti A6 uses the existing enemy HP threshold modifier");
    for (let level = 1; level <= 10; level++) {
        const aoe = source.aoe[level - 1];
        const oneBounce = source.bounce[level - 1];
        const total = aoe + 6 * oneBounce;
        assertClose(attack.multiplierComponents[0].values[level - 1], aoe, `AoE coefficient Lv${level}`);
        assertClose(attack.multiplierComponents[1].values[level - 1], 6 * oneBounce, `six-bounce coefficient Lv${level}`);
        assertClose(attack.multipliers[level - 1], total, `full action coefficient Lv${level}`);

        for (const profile of profiles) for (const [enemyHpPercent, expectedA6] of [[75, false], [40, true]]) {
            // The 10 pre-existing Glory stacks are already reflected in final CRIT Rate.
            // The numeric target HP is the calculator's existing enemy HP-percent input;
            // each case holds it on one side of 50% throughout this single-action snapshot.
            const finalStats = { ...profile, critRate: profile.critRate + 10 * source.critRatePerGlory[level - 1] };
            const modifierContext = {
                characterId: "1302", eidolon: 0, stats: finalStats,
                enemy: { hpPercent: enemyHpPercent }, traceLevelFor: () => level
            };
            const [candidate] = runtime.buildCandidates([a6], modifierContext, {});
            assert.equal(candidate.automatic, true);
            assert.equal(candidate.enabled, expectedA6, `A6 HP threshold ${enemyHpPercent}%`);
            assert.equal(candidate.value, 15);

            const input = makeRequest(attack, level, finalStats, [candidate]);
            input.enemy.hpPercent = enemyHpPercent;
            const actual = engine.calculate(input);
            assert.notEqual(actual.supported, false, actual.reason);
            const oracle = independentDirectDamage({ ...input, attack: { ...input.attack, multiplier: total, hitCount: 1 } });
            for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], oracle[key], `Lv${level} HP${enemyHpPercent} ${key}`);

            const aoeOracle = independentDirectDamage({ ...input, attack: { ...input.attack, multiplier: aoe, hitCount: 1 } });
            const bounceOracle = independentDirectDamage({ ...input, attack: { ...input.attack, multiplier: oneBounce, hitCount: 1 } });
            for (const key of ["nonCrit", "crit", "expected"]) {
                assertClose(actual[key], aoeOracle[key] + 6 * bounceOracle[key], `separate AoE + six bounces Lv${level} ${key}`);
            }
        }
    }
    assertClose(attack.multipliers[9], 850, "Lv10 total is 280% + 6×95%");
});

test("Jing Yuan's completed E0 action rows cover every stable LL count without asserting first-skill order", async () => {
    const { data } = await loadProductionFixture();
    const attacks = ["120401", "120402", "120403", "120404"].map((id) => attackOf(data, id));
    for (const attack of attacks) {
        assert.equal(attack.characterId, "1204");
        assert.equal(attack.support.status, "calculable", attack.id);
        assert.equal(attack.provenance.sourceCommit, fixedSourceSha, attack.id);
        assert.equal(attack.requiredEidolon, undefined, attack.id + " is available at E0");
    }
    const lightningLord = attacks.find((attack) => attack.id === "120404");
    assert.equal(lightningLord.hitCountMinimum, 3);
    assert.equal(lightningLord.hitCountMaximum, 10);
    assert.equal(lightningLord.hitCountInputKey, "jingyuan-lightning-lord-hits");
    assert.equal(lightningLord.adjacentMultiplierRatio, 25);
    assert.match(lightningLord.calculationNote, /敵2体以上.*未対応/);
    assert.match(attacks.find((attack) => attack.id === "120402").calculationNote, /初回スキル.*未確認|初回.*未確認/);
});

test("Yanqing E0 main attacks and separate conditional components match fixed-source curves in a stable Soulsteel state", async () => {
    assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
    const { data, engine } = await loadProductionFixture();
    const records = data.structuredModifiers.filter((item) => item.source?.id === "1209");
    const profile = { atk: 3127.25, hp: 7432.5, def: 1288.75, critRate: 42.5, critDamage: 117.25, damageBonus: 34.4, enemyLevel: 82, resistance: 20, defenseReduction: 7.5, defenseIgnore: 12.5, resistancePenetration: 4.25 };
    const states = [
        { soulsteel: false, technique: false, hp: 75 },
        { soulsteel: true, technique: true, hp: 75 },
        { soulsteel: true, technique: true, hp: 40 }
    ];

    for (const [id, curve] of Object.entries(yanqingSource)) {
        const attack = attackOf(data, id);
        assert.equal(attack.characterId, "1209");
        assert.equal(attack.support.status, "calculable", id);
        assert.equal(attack.scalingStat, "atk", id);
        assert.deepEqual(Array.from(attack.multipliers).slice(0, curve.length), curve, id + " fixed source curve");
        const acceptedLevels = id === "120901" ? 6 : 10;
        for (let level = 1; level <= acceptedLevels; level++) {
            for (const state of states) {
                const inputs = {
                    "yanqing-soulsteel-active": state.soulsteel,
                    "yanqing-technique-active": state.technique,
                    "yanqing-followup-triggered": id === "120904",
                    "enemy-frozen": id === "1209041",
                    "enemy-ice-weakness": true
                };
                const context = {
                    characterId: "1209", eidolon: 0,
                    stats: { ...profile, hpPercent: 100 },
                    enemy: { hpPercent: state.hp, weakness: true },
                    traceLevelFor: () => level
                };
                const candidates = runtime.buildCandidates(records, context, inputs)
                    .filter((item) => runtime.applicableToAttack(item, attack));
                const input = makeRequest(attack, level, profile, candidates);
                input.enemy.hpPercent = state.hp;
                input.enemy.weakness = true;
                const actual = engine.calculate(input);
                assert.notEqual(actual.supported, false, actual.reason);
                const oracle = independentDirectDamage({ ...input, attack: { ...input.attack, multiplier: curve[level - 1], hitCount: 1 } });
                for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], oracle[key], `${id} Lv${level} Soulsteel=${state.soulsteel} HP${state.hp} ${key}`);
            }
        }
    }

    const addition = attackOf(data, "1209101");
    assert.equal(addition.scalingStat, "atk");
    assert.equal(addition.canCrit, true);
    assert.equal(addition.multipliers[0], 30);
    const attack = attackOf(data, "120903");
    const inputs = { "yanqing-soulsteel-active": true, "yanqing-technique-active": true };
    const context = { characterId: "1209", eidolon: 0, stats: profile, enemy: { hpPercent: 75, weakness: true }, traceLevelFor: () => 10 };
    const selected = runtime.buildCandidates(records, context, inputs).filter((item) => runtime.applicableToAttack(item, addition));
    const additionInput = makeRequest(addition, 1, profile, selected);
    additionInput.enemy.hpPercent = 75;
    additionInput.enemy.weakness = true;
    const additionActual = engine.calculate(additionInput);
    const additionOracle = independentDirectDamage({ ...additionInput, attack: { ...additionInput.attack, multiplier: 30, hitCount: 1 } });
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(additionActual[key], additionOracle[key], `1209101 ice-weakness addition ${key}`);
});
