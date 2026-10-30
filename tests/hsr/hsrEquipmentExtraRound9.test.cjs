"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    fixedSourceSha, loadProductionFixture, attackOf, makeRequest,
    independentDirectDamage, assertClose, readJson, runtime
} = require("./helpers/hsrDirectVerification.cjs");

const authored = readJson("games/hsr/data/calc/modifiers-equipment-extra-round9.json").modifiers;
const record = (id, part) => {
    const value = authored.find((item) => item.id === `lightCone:${id}:${part}`);
    assert.ok(value, `light cone ${id} ${part} is registered`);
    return value;
};
const values = {
    "24004:base-atk-final": [8, 9, 10, 11, 12],
    "24004:attack-stacks": [4, 5, 6, 7, 8],
    "24004:three-target-speed": [8, 10, 12, 14, 16],
    "23037:base-crit-rate-final": [12, 14, 16, 18, 20],
    "23037:ultimate-triggered-skill-ult-damage": [60, 70, 80, 90, 100],
    "23040:base-hp-final": [30, 37.5, 45, 52.5, 60],
    "23040:hellflower-defense-ignore": [30, 35, 40, 45, 50],
    "23057:base-speed-final": [18, 21, 24, 27, 30],
    "23057:elation-defense-ignore": [20, 24, 28, 32, 36],
    "23063:base-hp-final": [30, 37.5, 45, 52.5, 60],
    "23063:new-song-party-speed": [20, 25, 30, 35, 40],
    "23056:base-crit-rate-final": [18, 21, 24, 27, 30],
    "23056:shadow-eater-atk": [40, 50, 60, 70, 80],
    "23056:shadow-eater-enemy-taken": [20, 22.5, 25, 27.5, 30],
    "23058:base-crit-damage-final": [60, 75, 90, 105, 120],
    "23058:elation-skill-enemy-taken": [15, 18.75, 22.5, 26.25, 30],
    "23059:base-hp-final": [30, 37.5, 45, 52.5, 60],
    "23059:inferno-enemy-crit-taken": [30, 37.5, 45, 52.5, 60],
    "23059:inferno-wearer-extra-crit-taken": [30, 37.5, 45, 52.5, 60]
};
const profiles = [
    { atk: 3175.25, hp: 9432.5, def: 1288.75, critRate: 42.5, critDamage: 113.25, damageBonus: 27.5, enemyLevel: 83, resistance: 30, defenseReduction: 12.5, defenseIgnore: 7.5, resistancePenetration: 6.25, takenDamage: 4.5, toughnessActive: true, baseAtk: 1043, baseHp: 1287, baseDef: 743 },
    { atk: 2143.75, hp: 14321.25, def: 3541.5, critRate: 71.25, critDamage: 87.5, damageBonus: 11.75, enemyLevel: 76, resistance: 10, defenseReduction: 4.25, defenseIgnore: 18.5, resistancePenetration: 13.75, takenDamage: 5.5, toughnessActive: false, baseAtk: 891, baseHp: 1523, baseDef: 1009 }
];

function chosen(id, part, rank, context = {}, inputs = {}) {
    const row = record(id, part);
    const [candidate] = runtime.buildCandidates([row], {
        characterId: context.characterId || "1302",
        lightConeId: context.lightConeId === undefined ? String(id) : context.lightConeId,
        refinement: rank,
        partyEquipment: context.partyEquipment || [],
        partyIds: context.partyIds || [],
        partyStats: context.partyStats || {},
        stats: context.stats || {},
        enemy: context.enemy || {},
        traceLevelFor: () => 10
    }, inputs);
    assert.ok(candidate, `candidate ${id}/${part} S${rank}`);
    return candidate;
}

function withScope(candidate, attack) {
    return { ...candidate, applicable: candidate.applicable !== false && runtime.applicableToAttack(candidate, attack) };
}

function directAttack(type) {
    return { id: `round9-${type}`, type, attackType: type, element: "Physical", target: "single", scalingStat: "atk", damageFormula: "statMultiplier", multiplier: 100, multipliers: [100], hitCount: 1, canCrit: true };
}

function elationOracle(input) {
    const a = input.attack, c = input.character, e = input.enemy;
    const active = (input.modifiers || []).filter((item) => item.enabled !== false && item.applicable !== false);
    const sum = (category) => active.filter((item) => item.category === category).reduce((total, item) => total + Number(item.value || 0), 0);
    const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
    const baseDamage = 7535.107 * Number(a.multiplier) / 100;
    const elationMultiplier = 1 + (Number(c.stats.elation || 0) + sum("elation")) / 100;
    const certifiedBanger = input.elation.certifiedBanger;
    const punchlineMultiplier = 1 + 5 * certifiedBanger / (certifiedBanger + 240);
    const merrymakeMultiplier = 1 + input.elation.merrymake / 100;
    const defenseReduction = Number(e.defenseReduction || 0) + sum("defenseReduction");
    const defenseIgnore = Number(e.defenseIgnore || 0) + sum("defenseIgnore");
    const defense = (Number(c.level) + 20) / ((Number(c.level) + 20) + (Number(e.level) + 20) * Math.max(0, 1 - defenseReduction / 100 - defenseIgnore / 100));
    const effectiveResistance = clamp(Number(e.resistance || 0) - Number(e.resistancePenetration || 0) - sum("resistancePenetration") - sum("resistanceReduction"), -100, 90);
    const resistance = 1 - effectiveResistance / 100;
    const toughness = e.toughnessActive ? 0.9 : 1;
    const takenDamage = 1 + (Number(e.takenDamage || 0) + sum("takenDamage")) / 100;
    const nonCrit = baseDamage * elationMultiplier * punchlineMultiplier * merrymakeMultiplier * defense * resistance * toughness * takenDamage;
    const critMultiplier = 1 + (Number(c.stats.critDamage || 0) + sum("critTakenDamage")) / 100;
    const critRate = clamp(Number(c.stats.critRate || 0) + sum("critRate"), 0, 100) / 100;
    return { nonCrit, crit: nonCrit * critMultiplier, expected: nonCrit * (1 + critRate * (critMultiplier - 1)) };
}

test("Round 9 light-cone definitions match the pinned S1-S5 values, load once, and separate final-stat properties", async () => {
    assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
    const { data } = await loadProductionFixture();
    assert.equal(authored.length, 19);
    const expectedIds = ["24004", "23037", "23040", "23057", "23063", "23056", "23058", "23059"];
    assert.deepEqual([...new Set(authored.map((item) => item.source.id))].sort(), expectedIds.sort());
    for (const [key, expected] of Object.entries(values)) {
        const [id, part] = key.split(":");
        const row = record(id, part);
        assert.equal(data.structuredModifiers.filter((item) => item.id === row.id).length, 1, `${key} loaded exactly once`);
        assert.equal(row.support.verified, true, key);
        assert.equal(row.provenance.sourceCommit, fixedSourceSha, key);
        assert.deepEqual(Array.from(row.value.values), expected, key);
        for (let rank = 1; rank <= 5; rank++) {
            const activeInputs = row.activation.mode === "stack" ? { [row.activation.inputKey]: 3 } : { [row.activation.inputKey]: true };
            const candidate = chosen(id, part, rank, {}, activeInputs);
            assertClose(candidate.value, row.value.kind === "perStackByRefinement" ? expected[rank - 1] * 3 : expected[rank - 1], `${key} S${rank}`);
            if (row.inputPolicy === "includedInFinalStats") {
                assert.equal(candidate.enabled, false, `${key} is not added again to final stats`);
                assert.equal(candidate.displayOnly, true, `${key} is presented as a final-input property`);
            }
            if (row.finalStatsInclusion && row.inputPolicy === "conditional") {
                const included = chosen(id, part, rank, {}, { ...activeInputs, [row.finalStatsInclusion.inputKey]: true });
                assert.equal(included.enabled, false, `${key} final inclusion is local`);
                assert.equal(included.includedInFinalStats, true, `${key} has explicit final-input ownership`);
            }
            if (row.activation.mode === "toggle") {
                const off = chosen(id, part, rank, {}, { [row.activation.inputKey]: false });
                assert.equal(off.enabled, false, `${key} OFF`);
            }
        }
    }
    const memospriteExcluded = record("23040", "hellflower-defense-ignore");
    for (const type of ["normal", "skill", "ultimate", "followUp", "additional", "dot", "elation", "superBreak"]) {
        assert.ok(memospriteExcluded.target.attackTypes.includes(type), type);
    }
    for (const type of ["memospriteSkill", "memospriteTalent"]) {
        assert.equal(memospriteExcluded.target.attackTypes.includes(type), false, type);
    }
});

test("24004, 23037, 23040, 23056, and 23059 change only their intended direct-damage inputs", async () => {
    const { data, engine } = await loadProductionFixture();
    for (let rank = 1; rank <= 5; rank++) {
        for (const profile of profiles) {
            const basic = directAttack("normal");
            const base = makeRequest(basic, 1, { ...profile, speed: 121, baseAtk: profile.baseAtk }, []);
            base.character.baseStats.speed = 100;
            const baseResult = engine.calculate(base);

            const stacks = rank;
            const atkInput = { "lc-24004-atk-stacks": stacks, "lc-24004-three-target-speed-active": true };
            const atkStack = withScope(chosen("24004", "attack-stacks", rank, {}, atkInput), basic);
            const speedBonus = withScope(chosen("24004", "three-target-speed", rank, {}, atkInput), basic);
            const stacked = engine.calculate({ ...base, modifiers: [atkStack, speedBonus] });
            const stackedOracle = independentDirectDamage({ ...base, attack: { ...base.attack, multiplier: 100 }, modifiers: [atkStack, speedBonus] });
            for (const key of ["nonCrit", "crit", "expected"]) assertClose(stacked[key], stackedOracle[key], `24004 S${rank} stack ${stacks} ${key}`);
            assert.ok(stacked.nonCrit > baseResult.nonCrit, `24004 S${rank} adds prior-action ATK stacks`);
            assert.equal(speedBonus.value, [8, 10, 12, 14, 16][rank - 1]);

            const skill = directAttack("skill");
            const ult = directAttack("ultimate");
            const lc37 = chosen("23037", "ultimate-triggered-skill-ult-damage", rank, {}, { "lc-23037-ultimate-state-active": true });
            for (const attack of [skill, ult]) {
                const scoped = withScope(lc37, attack);
                const input = makeRequest(attack, 1, profile, [scoped]);
                const expected = independentDirectDamage({ ...input, attack: { ...input.attack, multiplier: 100 } });
                const actual = engine.calculate(input);
                for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], `23037 S${rank} ${attack.type} ${key}`);
                assertClose(actual.breakdown.damageBonus, profile.damageBonus + [60,70,80,90,100][rank - 1], `23037 S${rank} scoped damage bonus`);
            }
            assert.equal(runtime.applicableToAttack(lc37, basic), false, "23037 must not buff normal attacks");

            const defIgnore = chosen("23040", "hellflower-defense-ignore", rank, {}, { "lc-23040-hellflower-active": true });
            const defInput = makeRequest(basic, 1, profile, [withScope(defIgnore, basic)]);
            const defExpected = independentDirectDamage({ ...defInput, attack: { ...defInput.attack, multiplier: 100 } });
            const defActual = engine.calculate(defInput);
            for (const key of ["nonCrit", "crit", "expected"]) assertClose(defActual[key], defExpected[key], `23040 S${rank} ${key}`);
            assert.equal(defActual.breakdown.defenseIgnorePercent, profile.defenseIgnore + [30,35,40,45,50][rank - 1]);

            const l56Inputs = { "lc-23056-shadow-eater-active": true };
            const atk56 = withScope(chosen("23056", "shadow-eater-atk", rank, {}, l56Inputs), basic);
            const taken56 = withScope(chosen("23056", "shadow-eater-enemy-taken", rank, {}, l56Inputs), basic);
            const lc56Input = makeRequest(basic, 1, { ...profile, baseAtk: profile.baseAtk }, [atk56, taken56]);
            const lc56Expected = independentDirectDamage({ ...lc56Input, attack: { ...lc56Input.attack, multiplier: 100 } });
            const lc56Actual = engine.calculate(lc56Input);
            for (const key of ["nonCrit", "crit", "expected"]) assertClose(lc56Actual[key], lc56Expected[key], `23056 S${rank} ${key}`);
            assertClose(lc56Actual.breakdown.referenceValue, profile.atk + profile.baseAtk * [40,50,60,70,80][rank - 1] / 100, `23056 S${rank} wearer ATK`);
            assertClose(lc56Actual.breakdown.takenDamage, profile.takenDamage + [20,22.5,25,27.5,30][rank - 1], `23056 S${rank} enemy vulnerability`);

            const generic59 = chosen("23059", "inferno-enemy-crit-taken", rank, {}, { "lc-23059-inferno-active": true });
            const wearerExtra59 = chosen("23059", "inferno-wearer-extra-crit-taken", rank, {}, { "lc-23059-inferno-active": true });
            const crit59Input = makeRequest(basic, 1, profile, [withScope(generic59, basic), withScope(wearerExtra59, basic)]);
            const crit59Expected = independentDirectDamage({ ...crit59Input, attack: { ...crit59Input.attack, multiplier: 100 } });
            const crit59Actual = engine.calculate(crit59Input);
            for (const key of ["nonCrit", "crit", "expected"]) assertClose(crit59Actual[key], crit59Expected[key], `23059 S${rank} wearer ${key}`);
            assertClose(crit59Actual.breakdown.critTakenDamage, 2 * [30,37.5,45,52.5,60][rank - 1], `23059 S${rank} wearer receives general + additional crit vulnerability`);
        }
    }
});

test("23057 elation DEF ignore and 23058 enemy vulnerability independently affect elation results", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "1513042");
    const profile = { atk: 3000, hp: 8000, def: 1400, critRate: 45, critDamage: 130, damageBonus: 55, breakEffect: 0, elation: 137.5, enemyLevel: 91, resistance: 31.5, defenseReduction: 13, defenseIgnore: 8, resistancePenetration: 9, takenDamage: 17, toughnessActive: true };
    for (let rank = 1; rank <= 5; rank++) {
        const lc57 = chosen("23057", "elation-defense-ignore", rank, { characterId: "1513" });
        assert.equal(lc57.automatic, true);
        assert.equal(lc57.enabled, true);
        assert.equal(runtime.applicableToAttack(lc57, attack), true);
        const lc58 = chosen("23058", "elation-skill-enemy-taken", rank,
            { characterId: "1513", lightConeId: "", partyEquipment: [{ characterId: "provider", lightConeId: "23058", refinement: rank }] },
            { "lc-23058-elation-skill-active": true });
        const modifiers = [withScope(lc57, attack), withScope(lc58, attack)];
        const input = makeRequest(attack, 10, profile, modifiers);
        input.character.stats.elation = profile.elation;
        input.elation = { context: "certifiedBanger", certifiedBanger: 40, punchline: 9999, merrymake: 23.5, fervor: 0 };
        const actual = engine.calculate(input);
        const expected = elationOracle(input);
        assert.notEqual(actual.supported, false, actual.reason);
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], `Elation S${rank} ${key}`);
        assertClose(actual.breakdown.defenseIgnorePercent, profile.defenseIgnore + [20,24,28,32,36][rank - 1], `23057 S${rank} Elation-only defense ignore`);
        assertClose(actual.breakdown.vulnerabilityFactors[0], 1 + (profile.takenDamage + [15,18.75,22.5,26.25,30][rank - 1]) / 100, `23058 S${rank} vulnerability`);
    }
    assert.equal(record("23057", "elation-defense-ignore").target.attackTypes.includes("skill"), false);
});

test("23063 party SPD and 23056/23058/23059 team debuffs use selected providers and one shared active-state input", () => {
    for (let rank = 1; rank <= 5; rank++) {
        const partyEquipment = [
            { characterId: "provider", lightConeId: "23063", refinement: rank },
            { characterId: "provider", lightConeId: "23056", refinement: rank },
            { characterId: "provider", lightConeId: "23058", refinement: rank },
            { characterId: "provider", lightConeId: "23059", refinement: rank }
        ];
        const context = { characterId: "recipient", lightConeId: "", partyEquipment, stats: { speed: 120 } };
        const partySpeed = chosen("23063", "new-song-party-speed", rank, context, { "lc-23063-new-song-active": true });
        assert.equal(partySpeed.tab, "パーティ");
        assert.equal(partySpeed.providerId, "provider");
        assert.equal(partySpeed.value, [20,25,30,35,40][rank - 1]);
        assert.equal(partySpeed.enabled, true);

        const taken56 = chosen("23056", "shadow-eater-enemy-taken", rank, context, { "lc-23056-shadow-eater-active": true });
        const taken58 = chosen("23058", "elation-skill-enemy-taken", rank, context, { "lc-23058-elation-skill-active": true });
        const crit59 = chosen("23059", "inferno-enemy-crit-taken", rank, context, { "lc-23059-inferno-active": true });
        for (const candidate of [taken56, taken58, crit59]) {
            assert.equal(candidate.tab, "パーティ");
            assert.equal(candidate.providerId, "provider");
            assert.equal(candidate.enabled, true);
        }
        const partyAtk = runtime.buildCandidates([record("23056", "shadow-eater-atk")], {
            characterId: "recipient", lightConeId: "", refinement: rank, partyEquipment, stats: {}
        }, { "lc-23056-shadow-eater-active": true });
        const partyExtraCrit = runtime.buildCandidates([record("23059", "inferno-wearer-extra-crit-taken")], {
            characterId: "recipient", lightConeId: "", refinement: rank, partyEquipment, stats: {}
        }, { "lc-23059-inferno-active": true });
        assert.equal(partyAtk.length, 0, "wearer-only ATK does not leak to party recipients");
        assert.equal(partyExtraCrit.length, 0, "wearer-only extra crit vulnerability does not leak to party recipients");

        for (const [id, part, key] of [
            ["23063", "new-song-party-speed", "lc-23063-new-song-active"],
            ["23056", "shadow-eater-enemy-taken", "lc-23056-shadow-eater-active"],
            ["23058", "elation-skill-enemy-taken", "lc-23058-elation-skill-active"],
            ["23059", "inferno-enemy-crit-taken", "lc-23059-inferno-active"]
        ]) {
            const duplicate = [partyEquipment.find((item) => item.lightConeId === id), { characterId: "provider2", lightConeId: id, refinement: rank }];
            const unresolved = chosen(id, part, rank, { characterId: "recipient", lightConeId: "", partyEquipment: duplicate }, { [key]: true });
            assert.equal(unresolved.enabled, false, `${id} duplicate party providers are not silently stacked`);
            assert.equal(unresolved.activation.unresolved, true, `${id} duplicate provider state is locally unresolved`);
        }
    }
});

test("party-provided 23063 speed, 23056 vulnerability, and 23059 crit vulnerability reach recipient calculations", async () => {
    const { engine } = await loadProductionFixture();
    const attack = directAttack("normal");
    const profile = profiles[0];
    for (let rank = 1; rank <= 5; rank++) {
        const partyEquipment = [
            { characterId: "provider", lightConeId: "23063", refinement: rank },
            { characterId: "provider", lightConeId: "23056", refinement: rank },
            { characterId: "provider", lightConeId: "23059", refinement: rank }
        ];
        const context = { characterId: "recipient", lightConeId: "", partyEquipment };
        const request = makeRequest(attack, 1, { ...profile, speed: 120 }, []);
        request.character.baseStats.speed = 100;
        for (const [id, part, inputKey, expectedValue] of [
            ["23063", "new-song-party-speed", "lc-23063-new-song-active", [20,25,30,35,40][rank - 1]],
            ["23056", "shadow-eater-enemy-taken", "lc-23056-shadow-eater-active", [20,22.5,25,27.5,30][rank - 1]],
            ["23059", "inferno-enemy-crit-taken", "lc-23059-inferno-active", [30,37.5,45,52.5,60][rank - 1]]
        ]) {
            const candidate = withScope(chosen(id, part, rank, context, { [inputKey]: true }), attack);
            assert.equal(candidate.enabled, true, `${id} party provider active S${rank}`);
            assertClose(candidate.value, expectedValue, `${id} party provider amount S${rank}`);
            const input = { ...request, modifiers: [candidate] };
            const expected = independentDirectDamage({ ...input, attack: { ...input.attack, multiplier: 100 } });
            const actual = engine.calculate(input);
            for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], `${id} party S${rank} ${key}`);
        }
    }
});
