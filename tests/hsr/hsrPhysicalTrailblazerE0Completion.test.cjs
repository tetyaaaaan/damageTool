"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    fixedSourceSha, loadProductionFixture, attackOf, makeRequest,
    runtime, assertClose, assertMatchesIndependent
} = require("./helpers/hsrDirectVerification.cjs");

// Independent transcription of pinned character_skills.json, not generated data.
const curves = {
    "01": { type: "normal", target: "single", values: [50, 60, 70, 80, 90, 100] },
    "02": { type: "skill", target: "blast", values: [62.5, 68.75, 75, 81.25, 87.5, 93.75, 101.56, 109.38, 117.19, 125] },
    "08": { type: "ultimate", target: "single", values: [300, 315, 330, 345, 360, 375, 393.75, 412.5, 431.25, 450] },
    "09": { type: "ultimate", target: "blast", values: [180, 189, 198, 207, 216, 225, 236.25, 247.5, 258.75, 270], adjacent: [108, 113.4, 118.8, 124.2, 129.6, 135, 141.75, 148.5, 155.25, 162] }
};
const talentCurve = [10, 11, 12, 13, 14, 15, 16.25, 17.5, 18.75, 20];
const profiles = [
    { atk: 3274.25, hp: 6417.5, def: 1188.25, baseAtk: 1200.5, baseHp: 1000.25, baseDef: 980.5,
      critRate: 33.5, critDamage: 146.25, damageBonus: 22.4, characterLevel: 80, enemyLevel: 88,
      resistance: 35, defenseReduction: 12, defenseIgnore: 4, resistancePenetration: 5, toughnessActive: true },
    { atk: 2401.75, hp: 8526.5, def: 3311.25, baseAtk: 861.25, baseHp: 1564.75, baseDef: 1260.5,
      critRate: 71.25, critDamage: 85.5, damageBonus: 7.75, characterLevel: 80, enemyLevel: 75,
      resistance: 0, defenseReduction: 0, defenseIgnore: 0, resistancePenetration: 0, toughnessActive: false }
];

function native(data, characterId, talentLevel, extraContext = {}) {
    return runtime.buildCandidates(data.structuredModifiers, {
        characterId, eidolon: 0, traceLevelFor: () => talentLevel, ...extraContext
    }, {});
}
function inputFor(attack, level, multiplier, profile, modifiers = [], target = attack.target) {
    const effectiveAttack = { ...attack, target };
    const input = makeRequest(effectiveAttack, level, profile);
    input.attack.multiplier = multiplier;
    input.modifiers = modifiers.map(item => ({ ...item, applicable: runtime.applicableToAttack(item, effectiveAttack) }));
    return input;
}
function candidateBySuffix(candidates, characterId, suffix) {
    const candidate = candidates.find(item => item.id === suffix.replaceAll("CHAR", characterId));
    assert.ok(candidate, suffix.replaceAll("CHAR", characterId) + " native modifier exists");
    return candidate;
}

test("both Physical Trailblazer E0 bodies expose every direct mode and fixed-source curve", async () => {
    assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
    const { data, engine } = await loadProductionFixture();
    for (const characterId of ["8001", "8002"]) {
        for (const [suffix, spec] of Object.entries(curves)) {
            const attack = attackOf(data, characterId + suffix);
            assert.equal(attack.characterId, characterId);
            assert.equal(attack.sourceSkillId, characterId + suffix);
            assert.equal(attack.support?.status, "calculable");
            assert.equal(attack.support?.verified, true);
            assert.equal(attack.provenance?.sourceCommit, fixedSourceSha);
            assert.equal(attack.maximumEidolon, 0);
            assert.equal(attack.maximumTraceLevel, spec.values.length);
            assert.equal(attack.type, spec.type);
            assert.equal(attack.target, spec.target);
            assert.equal(attack.scalingStat, "atk");
            assert.notEqual(attack.canCrit, false);
            assert.equal(attack.hitCount, 1, "whole-action aggregate is not multiplied by animation hits");
            assert.deepEqual(Array.from(attack.multipliers), spec.values);
            if (spec.target === "blast") assert.deepEqual(Array.from(attack.adjacentMultipliers), spec.adjacent || spec.values);
            for (let level = 1; level <= spec.values.length; level++) {
                for (const [index, profile] of profiles.entries()) {
                    const primary = assertMatchesIndependent(engine, inputFor(attack, level, spec.values[level - 1], profile), characterId + suffix + " Lv" + level + " profile" + index);
                    assertClose(primary.breakdown.referenceValue, profile.atk, "direct damage uses final ATK");
                    if (spec.target === "blast") {
                        const adjacentMultiplier = (spec.adjacent || spec.values)[level - 1];
                        const adjacent = assertMatchesIndependent(engine, inputFor(attack, level, adjacentMultiplier, profile, [], "adjacent"), characterId + suffix + " adjacent Lv" + level);
                        assertClose(adjacent.nonCrit / primary.nonCrit, adjacentMultiplier / spec.values[level - 1], "correct per-target adjacent ratio");
                    }
                }
            }
        }
        const container = attackOf(data, characterId + "03");
        assert.equal(container.support?.status, "displayOnly", "Stardust Ace chooses a concrete mode and is not a third attack");
        assert.equal(engine.calculate(makeRequest(container, 10, profiles[0])).supported, false);
    }
});

test("Physical Trailblazer current Talent stacks belong to completed final ATK at every E0 level", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const characterId of ["8001", "8002"]) {
        const attack = attackOf(data, characterId + "01");
        const candidates = native(data, characterId, 10);
        const talent = candidateBySuffix(candidates, characterId, "trace:CHAR:CHAR04:atk-stacks");
        assert.equal(talent.inputPolicy, "includedInFinalStats");
        assert.equal(talent.displayOnly, true);
        assert.equal(talent.enabled, false, "already completed Talent ATK is never added a second time");
        for (let level = 1; level <= 10; level++) {
            for (const stacks of [0, 1, 2]) {
                for (const profile of profiles) {
                    // Completed ATK includes the current state's base-ATK Talent increase.
                    // A break/kill occurring during this action cannot change this snapshot.
                    const finalAtk = profile.atk + profile.baseAtk * talentCurve[level - 1] * stacks / 100;
                    const completed = { ...profile, atk: finalAtk };
                    const input = inputFor(attack, 6, 100, completed, candidates);
                    const result = assertMatchesIndependent(engine, input, characterId + " Talent Lv" + level + " stacks" + stacks);
                    assertClose(result.breakdown.referenceValue, finalAtk, "input ATK already owns the current Talent contribution");
                    const baseChanged = { ...input, character: { ...input.character, baseStats: { ...input.character.baseStats, atk: profile.baseAtk + 3333 } } };
                    assertClose(engine.calculate(baseChanged).nonCrit, result.nonCrit, "base ATK is not used to rebuild the completed snapshot");
                    const baseline = engine.calculate(inputFor(attack, 6, 100, profile));
                    assertClose(result.nonCrit / baseline.nonCrit, finalAtk / profile.atk, "current stack state changes damage only through final ATK");
                }
            }
        }
        const absent = runtime.buildCandidates(data.structuredModifiers, { characterId: "1001", eidolon: 0, partyIds: [characterId], traceLevelFor: () => 10 }, {});
        assert.equal(absent.some(item => item.id === `trace:${characterId}:${characterId}04:atk-stacks`), false, "self-only Talent does not become a party ATK buff");
    }
});
test("Physical Trailblazer Fighting Will boosts only Skill and blast Ultimate primary targets", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const characterId of ["8001", "8002"]) {
        const candidates = native(data, characterId, 10);
        const bonus = candidateBySuffix(candidates, characterId, "traceNode:CHAR:CHAR103:primary-blast-damage");
        assert.equal(bonus.value, 25);
        assert.equal(bonus.enabled, true, "Lv80 assumes the unlocked E0 A6 trace");
        assert.equal(bonus.automatic, true, "A6 needs no optional stack or state toggle");
        assert.equal(bonus.primaryTargetOnly, true);
        for (const [suffix, spec] of Object.entries(curves)) {
            const attack = attackOf(data, characterId + suffix);
            const boosted = suffix === "02" || suffix === "09";
            assert.equal(runtime.applicableToAttack(bonus, attack), boosted);
            for (let level = 1; level <= spec.values.length; level++) {
                for (const profile of profiles) {
                    const result = assertMatchesIndependent(engine, inputFor(attack, level, spec.values[level - 1], profile, candidates), characterId + suffix + " all native primary Lv" + level);
                    assertClose(result.breakdown.damageBonus, profile.damageBonus + (boosted ? 25 : 0), "A6 enters additive DMG bucket once");
                    assertClose(result.breakdown.referenceValue, profile.atk, "Talent is already included in final ATK");
                    if (spec.target === "blast") {
                        assert.equal(runtime.applicableToAttack(bonus, { ...attack, target: "adjacent" }), false, "A6 never applies to an adjacent target");
                        const adjacent = assertMatchesIndependent(engine, inputFor(attack, level, (spec.adjacent || spec.values)[level - 1], profile, candidates, "adjacent"), characterId + suffix + " all native adjacent Lv" + level);
                        assertClose(adjacent.breakdown.damageBonus, profile.damageBonus, "adjacent damage excludes A6");
                    }
                }
            }
        }
    }
});

test("Physical Trailblazer uses completed final inputs and ignores HP/DEF for every direct action", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const characterId of ["8001", "8002"]) {
        const candidates = native(data, characterId, 10);
        assert.equal(candidates.some(item => item.source?.kind === "eidolon"), false, "E4 crit and all other eidolons remain absent at E0");
        for (const [suffix, spec] of Object.entries(curves)) {
            const attack = attackOf(data, characterId + suffix);
            const level = spec.values.length;
            const input = inputFor(attack, level, spec.values[level - 1], profiles[0], candidates);
            const base = assertMatchesIndependent(engine, input, characterId + suffix + " final-stat contract");
            assertClose(base.breakdown.referenceValue, profiles[0].atk, "permanent ATK traces and inactive Talent are not added again");
            assertClose(base.breakdown.damageBonus, profiles[0].damageBonus + (["02", "09"].includes(suffix) ? 25 : 0), "only the explicit unlocked A6 native bonus adds damage");
            for (const stat of ["atk", "hp", "def"]) {
                const changed = { ...input, character: { ...input.character, stats: { ...input.character.stats, [stat]: input.character.stats[stat] + 731.25 } } };
                const result = engine.calculate(changed);
                assertClose(result.nonCrit / base.nonCrit, stat === "atk" ? (profiles[0].atk + 731.25) / profiles[0].atk : 1, "isolated " + stat);
            }
            const baseChanged = { ...input, character: { ...input.character, baseStats: { atk: 9999, hp: 8888, def: 7777 } } };
            assertClose(engine.calculate(baseChanged).nonCrit, base.nonCrit, "completed final inputs do not add the base values a second time");
        }
    }
});

test("Physical Trailblazer native bonuses compose once with an explicitly enabled party modifier", async () => {
    const { data, engine } = await loadProductionFixture();
    const record = data.structuredModifiers.find(item => item.id === "trace:1309:130902:party-damage");
    assert.ok(record, "existing Robin skill modifier is reused");
    for (const characterId of ["8001", "8002"]) {
        const context = { characterId, eidolon: 0, partyIds: ["1309"], partyEidolons: { "1309": 0 }, traceLevelFor: () => 10 };
        assert.equal(runtime.buildCandidates([record], context, { "robin-skill-damage-active": false })[0].enabled, false);
        assert.equal(runtime.buildCandidates([record], { ...context, partyIds: [] }, { "robin-skill-damage-active": true }).length, 0);
        const party = runtime.buildCandidates([record], context, { "robin-skill-damage-active": true });
        assert.equal(party[0].value, 50);
        const own = native(data, characterId, 10);
        for (const [suffix, spec] of Object.entries(curves)) {
            const attack = attackOf(data, characterId + suffix);
            const result = assertMatchesIndependent(engine, inputFor(attack, spec.values.length, spec.values.at(-1), profiles[1], [...own, ...party]), characterId + suffix + " native and party");
            assertClose(result.breakdown.damageBonus, profiles[1].damageBonus + 50 + (["02", "09"].includes(suffix) ? 25 : 0), "separate native and party bonus are added once");
        }
    }
});

