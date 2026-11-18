"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProductionFixture, attackOf, assertClose, runtime, readJson } = require("./helpers/hsrDirectVerification.cjs");

const ROUND52_MODIFIERS = readJson("games/hsr/data/calc/modifiers-v47-round52.json").modifiers;

const ENEMY = { count: 1, level: 80, resistance: 20, weakness: false, toughnessActive: true, defenseReduction: 0, defenseIgnore: 0, resistancePenetration: 0, takenDamage: 0 };
const AHA = { id: "1511", level: 80, eidolon: 0, stats: { atk: 3000, hp: 6000, def: 2000, critRate: 35, critDamage: 120, damageBonus: 0, elation: 100, merrymake: 0 }, baseStats: { atk: 1000, hp: 1000, def: 1000 } };
const MEMBER = { id: "1502", level: 80, eidolon: 0, stats: { atk: 2700, hp: 7000, def: 1800, critRate: 50, critDamage: 160, damageBonus: 0, elation: 180, merrymake: 0 }, baseStats: { atk: 1000, hp: 1000, def: 1000 } };

function expectedElation(multiplier, character, enemy, punchline, modifiers = []) {
    const sum = (category) => modifiers.filter((item) => item.category === category && item.enabled !== false && item.applicable !== false).reduce((total, item) => total + item.value, 0);
    const defense = 100 / (100 + 100 * (1 - (enemy.defenseReduction + enemy.defenseIgnore + sum("defenseIgnore")) / 100));
    const resistance = 1 - (enemy.resistance - enemy.resistancePenetration - sum("resistancePenetration")) / 100;
    const nonCrit = 7535.107 * multiplier / 100 * (1 + (character.stats.elation + sum("elation")) / 100)
        * (1 + 5 * punchline / (punchline + 240)) * (1 + character.stats.merrymake / 100)
        * defense * resistance * (enemy.toughnessActive ? 0.9 : 1) * (1 + (enemy.takenDamage + sum("takenDamage")) / 100);
    const critRate = Math.min(100, character.stats.critRate + sum("critRate")) / 100;
    const critDamage = (character.stats.critDamage + sum("critDamage")) / 100;
    return { nonCrit, crit: nonCrit * (1 + critDamage), expected: nonCrit * (1 + critRate * critDamage) };
}

function attackInput(attack, level, overrides = {}) {
    const character = overrides.character || AHA;
    const enemy = overrides.enemy || ENEMY;
    const context = attack.elationContext === "certifiedBanger" ? "certifiedBanger" : "ahaInstant";
    const modifiers = overrides.modifiers || [];
    return {
        character: structuredClone(character), enemy: structuredClone(enemy), modifiers,
        modifierInputs: { ...(overrides.modifierInputs || {}) },
        elation: { context, certifiedBanger: 0, punchline: 0, fervor: 0, merrymake: character.stats.merrymake },
        attack: { ...attack, traceLevel: level, multiplier: attack.multipliers[level - 1], attackType: attack.type, ...overrides.attack }
    };
}

test("Round52 Aha adopted basic, follow-up, ultimate, Emanator rider, and Aha Instant curves match independent damage", async () => {
    const { data, engine } = await loadProductionFixture();
    const cases = [
        ["151101", 6], ["151102", 10], ["1511021", 10], ["151103", 10], ["151120", 10]
    ];
    for (const [id, maxLevel] of cases) {
        const source = attackOf(data, id);
        for (let level = 1; level <= maxLevel; level++) {
            const modifiers = id === "151103" ? [
                { id: "aha-e0-crit", category: "critRate", value: 12, enabled: true, applicable: true },
                { id: "aha-e0-def-ignore", category: "defenseIgnore", value: 30, enabled: true, applicable: true }
            ] : [];
            const input = attackInput(source, level, {
                modifiers,
                character: id === "1511021" ? MEMBER : AHA,
                modifierInputs: id === "151103" ? { "aha-wish": 8 + (level % 3) } : {},
                attack: id === "1511021" ? { completedReferenceSnapshot: true, ahaEmanatorId: "1502", damageOwnerId: "1502", element: "Physical" } : {}
            });
            input.elation.certifiedBanger = 0; // Zero is a valid CB snapshot.
            input.elation.punchline = id === "151120" ? 40 : 0;
            const result = engine.calculate(input);
            assert.notEqual(result.supported, false, `${id} Lv${level}: ${result.reason || ""}`);
            const componentMultiplier = id === "151103"
                ? source.elationComponents.reduce((sum, item) => sum + item.count * item.multipliers[level - 1], 0)
                : source.multipliers[level - 1];
            const expected = expectedElation(componentMultiplier, input.character, ENEMY, input.elation.punchline, modifiers);
            for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], expected[key], `${id} Lv${level} ${key}`);
            if (id === "151103") assert.equal(result.breakdown.certifiedBanger, 0);
        }
    }
});

test("Round52 Aha Instant ultimate requires Wish 8–18 and all E0 damage actions reject later eidolons", async () => {
    const { data, engine } = await loadProductionFixture();
    const ultimate = attackOf(data, "151103");
    for (const wish of [8, 9, 10, 11, 17, 18]) {
        const input = attackInput(ultimate, 10, { modifierInputs: { "aha-wish": wish }, modifiers: [
            { id: "aha-e0-crit", category: "critRate", value: 12, enabled: true, applicable: true },
            { id: "aha-e0-def-ignore", category: "defenseIgnore", value: 30, enabled: true, applicable: true }
        ] });
        const result = engine.calculate(input);
        assert.notEqual(result.supported, false, `Wish ${wish}: ${result.reason || ""}`);
    }
    for (const wish of [7, 19, 8.5, NaN]) {
        const input = attackInput(ultimate, 10, { modifierInputs: { "aha-wish": wish } });
        assert.equal(engine.calculate(input).supported, false, `Wish ${wish} must be outside the verified boundary`);
    }
    for (const id of ["151101", "151102", "151103", "151120"]) {
        const input = attackInput(attackOf(data, id), id === "151101" ? 6 : 10, { modifierInputs: { "aha-wish": 8 } });
        input.character.eidolon = 1;
        assert.equal(engine.calculate(input).supported, false, `${id} must reject non-E0`);
    }

    for (const mutate of [
        (attack) => { attack.hitCount = 99; },
        (attack) => { attack.elationComponents[0].count = 2; },
        (attack) => { attack.elationComponents[1].multipliers[9] += 1; }
    ]) {
        const input = attackInput(ultimate, 10, { modifierInputs: { "aha-wish": 8 } });
        mutate(input.attack);
        assert.equal(engine.calculate(input).supported, false, "Aha Ultimate component/hit layout mutations must be rejected");
    }
});

test("Round52 Emanator sequence uses the recipient's own final stats and rejects a mismatched snapshot owner", async () => {
    const { data, engine } = await loadProductionFixture();
    const rootAttack = attackOf(data, "1511022");
    const own = attackInput(attackOf(data, "151102"), 10);
    const memberAttack = { ...attackOf(data, "1511021"), traceLevel: 10, multiplier: 20, attackType: "additional", completedReferenceSnapshot: true, ahaEmanatorId: "1502", damageOwnerId: "1502", element: "Physical" };
    const member = { character: structuredClone(MEMBER), enemy: structuredClone(ENEMY), modifiers: [], modifierInputs: {}, elation: { context: "certifiedBanger", certifiedBanger: 0, punchline: 0, merrymake: 0 }, attack: memberAttack };
    const input = { character: structuredClone(AHA), enemy: structuredClone(ENEMY), attack: { ...rootAttack, traceLevel: 10, multiplier: rootAttack.multipliers[9] }, modifierInputs: {}, sequenceComponents: [
        { key: "aha", name: "Aha follow-up", input: own },
        { key: "emanator", name: "Member rider", input: member }
    ] };
    const result = engine.calculate(input);
    assert.notEqual(result.supported, false, result.reason || "");
    const ownExpected = expectedElation(50, AHA, ENEMY, 0);
    const memberExpected = expectedElation(20, MEMBER, ENEMY, 0);
    for (const key of ["nonCrit", "crit", "expected"]) {
        assertClose(result.components.aha[key], ownExpected[key], `Aha ${key}`);
        assertClose(result.components.emanator[key], memberExpected[key], `recipient ${key}`);
        assertClose(result[key], ownExpected[key] + memberExpected[key], `sequence ${key}`);
    }
    const bad = structuredClone(input);
    bad.sequenceComponents[1].input.attack.damageOwnerId = "1511";
    assert.equal(engine.calculate(bad).supported, false, "the member component may not borrow Aha's owner snapshot");
    const foreignBuff = structuredClone(input);
    foreignBuff.sequenceComponents[1].input.modifiers = [{
        id: "foreign-aha-final-stat", category: "critDamage", value: 200, enabled: true, applicable: true,
        source: { kind: "trace", id: "1511", skillId: "151102" },
        target: { owner: "self", attackTypes: ["all"], elements: [] }
    }];
    assert.equal(engine.calculate(foreignBuff).supported, false, "the recipient's completed snapshot may not accept Aha owner's own modifiers");
});

test("Round52 finale adds 20% of the prior record and the current Aha body once, without chaining the record attack", async () => {
    const { data, engine } = await loadProductionFixture();
    const source = attackOf(data, "1511202");
    const prior = 123456;
    const input = {
        character: structuredClone(AHA), enemy: structuredClone(ENEMY), modifiers: [],
        modifierInputs: { "aha-prior-non-true-damage": prior },
        elation: { context: "ahaInstant", punchline: 40, fervor: 0, merrymake: 0 },
        attack: { ...source, traceLevel: 10, multiplier: source.multipliers[9], attackType: "elation" }
    };
    const result = engine.calculate(input);
    assert.notEqual(result.supported, false, result.reason || "");
    const body = expectedElation(60, AHA, ENEMY, 40);
    assertClose(result.components.direct.nonCrit, body.nonCrit, "body nonCrit");
    assertClose(result.components.trueDamage.nonCrit, (prior + body.nonCrit) * 0.2, "record includes body nonCrit once");
    assertClose(result.components.trueDamage.crit, (prior + body.crit) * 0.2, "record follows body crit result");
    assertClose(result.nonCrit, body.nonCrit + (prior + body.nonCrit) * 0.2, "finale nonCrit");
    assertClose(result.crit, body.crit + (prior + body.crit) * 0.2, "finale crit");
    assertClose(result.expected, body.expected + (prior + body.expected) * 0.2, "finale expected");
    for (const invalid of [-1, NaN, Infinity, 1e12 + 1]) {
        const changed = structuredClone(input); changed.modifierInputs["aha-prior-non-true-damage"] = invalid;
        assert.equal(engine.calculate(changed).supported, false, `invalid prior record ${invalid}`);
    }
});

test("Round52 Sparxie Elation skill ascension changes the original multiplier by 15% and keeps party DEF ignore separate", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "150120");
    const activeIds = ["1511", "1501"];
    const context = {
        characterId: "1501", eidolon: 0, partyIds: activeIds,
        partyEidolons: { "1511": 0, "1501": 0 }, traceLevelFor: () => 1,
        partyPaths: { "1511": "Elation", "1501": "Elation" }, attack
    };
    const candidates = (active, present = true) => {
        const party = present ? context.partyIds : ["1501"];
        return runtime.buildCandidates(ROUND52_MODIFIERS, { ...context, partyIds: party, partyEidolons: present ? context.partyEidolons : { "1501": 0 } }, {
            "aha-world-active": active,
            ...(active && present ? { "aha-emanator-recipient": "1501" } : {}),
            "aha:emanator-elation-in-final": true,
            "aha:talent-party-cd-in-final": true
        }).map((item) => ({ ...item, applicable: runtime.applicableToAttack(item, attack) }));
    };
    const make = (modifiers) => {
        const input = attackInput(attack, 10, {
            character: { ...structuredClone(AHA), id: "1501", stats: { ...AHA.stats, critRate: 50, critDamage: 150, elation: 110 } },
            attack: { characterId: "1501" }
        });
        input.elation = { context: "ahaInstant", punchline: 20, fervor: 0, merrymake: 0 };
        input.modifiers = modifiers;
        input.modifierInputs = {
            "aha-emanator-recipient": "1501",
            "aha:emanator-elation-in-final": true,
            "aha:talent-party-cd-in-final": true
        };
        return input;
    };
    const baselineInput = make([]);
    const baseline = engine.calculate(baselineInput);
    assert.notEqual(baseline.supported, false, baseline.reason || "");
    const oldExpected = expectedElation(attack.multipliers[9], baselineInput.character, ENEMY, 20);
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(baseline[key], oldExpected[key], `unmodified Sparxie ${key}`);

    const offCandidates = candidates(false);
    const off = engine.calculate(make(offCandidates));
    assertClose(off.nonCrit, baseline.nonCrit, "toggle off preserves original damage");
    const absent = engine.calculate(make(candidates(true, false)));
    assertClose(absent.nonCrit, baseline.nonCrit, "Aha absent preserves original damage");

    const onCandidates = candidates(true);
    const multiplier = onCandidates.find((item) => item.id === "v47:trace:1501:150129:elation-skill-multiplier");
    const defense = onCandidates.find((item) => item.id === "v47:trace:1501:150129:party-defense-ignore");
    assert.equal(multiplier.value, 15);
    assert.equal(defense.value, 10);
    const active = engine.calculate(make(onCandidates));
    assert.notEqual(active.supported, false, active.reason || "");
    const activeExpected = expectedElation(attack.multipliers[9] * 1.15, baselineInput.character, ENEMY, 20, [defense]);
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(active[key], activeExpected[key], `active Sparxie ${key}`);
    assertClose(active.breakdown.multiplierPercent, attack.multipliers[9] * 1.15, "only the original Elation multiplier receives the 15% increase");
    assertClose(active.breakdown.defenseIgnorePercent, 10, "party DEF ignore remains a separate modifier");
});
