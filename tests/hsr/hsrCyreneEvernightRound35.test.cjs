"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProductionFixture, makeRequest, runtime, assertClose } = require("./helpers/hsrDirectVerification.cjs");
const modifierFile = require("../../games/hsr/data/calc/modifiers-cyrene-evernight-round35.json");
const attackFile = require("../../games/hsr/data/calc/attacks-evernight-round28.json");

const profile = {
    hp: 8123.5,
    critRate: 82.5,
    critDamage: 201.25,
    damageBonus: 137.5,
    enemyLevel: 83,
    resistance: 27,
    defenseReduction: 11,
    defenseIgnore: 4,
    resistancePenetration: 7,
    takenDamage: 39,
    toughnessActive: true
};

function makeInput(id, level, traceLevel, values = {}) {
    const attack = attackFile.overrides.find((entry) => entry.id === id);
    const input = makeRequest(attack, level, profile);
    input.character.id = "11413";
    input.attack.requiresIndependentEvernight = true;
    input.attack.completedReferenceSnapshot = true;
    input.attack.damageOwnerId = "11413";
    input.modifierInputs = { "evernight-memoquanta": 16, ...values };
    const context = {
        // Resolve Cyrene's party trace for Evernight as the selected recipient,
        // then pass only exact Long-owner rows into its separate damage snapshot.
        characterId: "1413",
        eidolon: 0,
        partyIds: ["1415"],
        partyEidolons: { "1415": 0 },
        stats: input.character.stats,
        traceLevelFor: () => traceLevel
    };
    input.modifiers = [];
    input.round35Candidates = runtime.buildCandidates(modifierFile.modifiers, context, input.modifierInputs)
        .map((candidate) => ({
            ...candidate,
            targetMatches: runtime.applicableToAttack(candidate, attack),
            applicable: candidate.applicable && runtime.applicableToAttack(candidate, attack)
        }));
    if (id === "1141301") input.attack.multiplier = 50 + Math.floor(16 / 4) * 10;
    return input;
}

function applyLongSnapshotModifiers(input) {
    for (const candidate of input.round35Candidates) {
        if (!candidate.enabled || !candidate.applicable || candidate.includedInFinalStats) continue;
        if (!candidate.targetMatches) continue;
        if (candidate.category === "damageBonus") input.character.stats.damageBonus += candidate.value;
        if (candidate.category === "critDamage") input.character.stats.critDamage += candidate.value;
    }
    return input.round35Candidates;
}

function expected(input, multiplier, damageBonus = 0, critDamage = 0) {
    const c = input.character;
    const e = input.enemy;
    const defense = (c.level + 20) / ((c.level + 20) + (e.level + 20) * (1 - (e.defenseReduction + e.defenseIgnore) / 100));
    const resistance = 1 - (e.resistance - e.resistancePenetration) / 100;
    const nonCrit = c.stats.hp * multiplier / 100 * (1 + (c.stats.damageBonus + damageBonus) / 100) * defense * resistance * (e.toughnessActive ? 0.9 : 1) * (1 + e.takenDamage / 100);
    const effectiveCD = c.stats.critDamage + critDamage;
    return {
        nonCrit,
        crit: nonCrit * (1 + effectiveCD / 100),
        expected: nonCrit * (1 + c.stats.critRate / 100 * effectiveCD / 100)
    };
}

test("Round35 Years damage applies only to Long's Ice finisher and matches the fixed E0 levels", async () => {
    const { engine } = await loadProductionFixture();
    const row = modifierFile.modifiers.find((entry) => entry.id === "trace:1415:1141524:long-memosprite-skill-damage");
    assert.deepEqual(row.value.values, [9, 10.8, 12.6, 14.4, 16.2, 18]);
    for (const [level, bonus] of [[1, 9], [6, 18]]) {
        const input = makeInput("1141307", 6, level, { "cyrene-years-active": true });
        const candidates = applyLongSnapshotModifiers(input);
        assert.equal(candidates.find((candidate) => candidate.id === row.id).value, bonus);
        assert.equal(input.character.stats.damageBonus, profile.damageBonus + bonus, "the completed Long snapshot contains the blessing once");
        const result = engine.calculate(input);
        assert.notEqual(result.supported, false, result.reason);
        const oracle = expected(input, 192);
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], oracle[key], `Years S${level} finisher ${key}`);

        const inactive = makeInput("1141307", 6, level);
        applyLongSnapshotModifiers(inactive);
        const inactiveResult = engine.calculate(inactive);
        assertClose(inactiveResult.expected, expected(inactive, 192).expected, `Years S${level} blessing absent`);

        const otherLongSkill = makeInput("1141301", 6, level, { "cyrene-years-active": true });
        const wrongTarget = otherLongSkill.round35Candidates.find((candidate) => candidate.id === row.id);
        assert.equal(wrongTarget.applicable, false, "the damage increase belongs only to Long's named finisher");
        applyLongSnapshotModifiers(otherLongSkill);
        const otherResult = engine.calculate(otherLongSkill);
        assertClose(otherResult.expected, expected(otherLongSkill, 90).expected, `Years S${level} does not affect Long's other Skill`);
    }
});

test("Round35 Years adds only the explicit cast-time CD delta while the blessing and Skill buff are active", async () => {
    const { engine } = await loadProductionFixture();
    const row = modifierFile.modifiers.find((entry) => entry.id === "trace:1415:1141524:long-skill-crit-damage-increment");
    for (const [traceLevel, ratio] of [[1, 6], [6, 12]]) {
        const input = makeInput("141303", 10, traceLevel, {
            "cyrene-years-active": true,
            "cyrene-years-skill-buff-active": true,
            "cyrene-years-longnight-crit-damage-at-skill-application": 200
        });
        const candidates = applyLongSnapshotModifiers(input);
        const candidate = candidates.find((entry) => entry.id === row.id);
        assert.equal(candidate.value, 200 * ratio / 100);
        assert.equal(input.character.stats.critDamage, profile.critDamage + candidate.value, "the cast-time source is applied once to Long's completed snapshot");
        const result = engine.calculate(input);
        assert.notEqual(result.supported, false, result.reason);
        const increment = 200 * ratio / 100;
        const oracle = expected(input, 200);
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], oracle[key], `Years S${traceLevel} skill CD ${key}`);
        assertClose(candidate.value, increment, `Years S${traceLevel} explicit cast-time reference`);

        const noBlessing = makeInput("141303", 10, traceLevel, {
            "cyrene-years-skill-buff-active": true,
            "cyrene-years-longnight-crit-damage-at-skill-application": 200
        });
        applyLongSnapshotModifiers(noBlessing);
        const noBlessingResult = engine.calculate(noBlessing);
        assertClose(noBlessingResult.expected, expected(noBlessing, 200).expected, `Years S${traceLevel} requires blessing`);

        const noSkillBuff = makeInput("141303", 10, traceLevel, {
            "cyrene-years-active": true,
            "cyrene-years-longnight-crit-damage-at-skill-application": 200
        });
        applyLongSnapshotModifiers(noSkillBuff);
        const noSkillBuffResult = engine.calculate(noSkillBuff);
        assertClose(noSkillBuffResult.expected, expected(noSkillBuff, 200).expected, `Years S${traceLevel} requires active Evernight Skill buff`);

        const missingReference = makeInput("141303", 10, traceLevel, {
            "cyrene-years-active": true,
            "cyrene-years-skill-buff-active": true
        });
        const missingCandidate = missingReference.round35Candidates.find((entry) => entry.id === row.id);
        assert.equal(missingCandidate.strictInput, true, "cast-time CD must be explicit");
        assert.equal(missingCandidate.applicable, false, "missing cast-time CD is locally unresolved");
        applyLongSnapshotModifiers(missingReference);
        assert.equal(missingReference.character.stats.critDamage, profile.critDamage, "missing reference does not assume zero or change Long's snapshot");

        const included = makeInput("141303", 10, traceLevel, {
            "cyrene-years-active": true,
            "cyrene-years-skill-buff-active": true,
            "cyrene-years-longnight-crit-damage-at-skill-application": 200,
            "trace:1415:1141524:long-skill-crit-damage-increment-in-final-stats": true
        });
        const includedCandidates = applyLongSnapshotModifiers(included);
        assert.equal(includedCandidates.find((entry) => entry.id === row.id).enabled, false);
        const includedResult = engine.calculate(included);
        assertClose(includedResult.expected, expected(included, 200).expected, `Years S${traceLevel} final CD inclusion prevents duplicate`);
    }
});
