"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    fixedSourceSha,
    loadProductionFixture,
    attackOf,
    makeRequest,
    runtime,
    assertClose,
    assertMatchesIndependent
} = require("./helpers/hsrDirectVerification.cjs");

// Transcribed from index_new/jp/character_skills.json at fixedSourceSha.
// Normal uses E0 Lv1-6; Skill, Ultimate, and Talent use E0 Lv1-10.
const curves = {
    "101301": { trace: "normal", scalingStat: "atk", values: [50, 60, 70, 80, 90, 100] },
    "101302": { trace: "skill", scalingStat: "atk", values: [50, 55, 60, 65, 70, 75, 81.25, 87.5, 93.75, 100] },
    "101303": { trace: "ultimate", scalingStat: "atk", values: [120, 128, 136, 144, 152, 160, 170, 180, 190, 200] },
    // Source ability 101304.params[][1] is its AoE damage multiplier.
    "101304": { trace: "talent", scalingStat: "atk", values: [25, 26.5, 28, 29.5, 31, 32.5, 34.38, 36.25, 38.12, 40] }
};

const profiles = [
    {
        atk: 3274.25, hp: 6417.5, def: 1188.25,
        baseAtk: 1200.5, baseHp: 1000.25, baseDef: 980.5,
        critRate: 33.5, critDamage: 146.25, damageBonus: 22.4,
        characterLevel: 80, enemyLevel: 88, resistance: 35,
        defenseReduction: 12, defenseIgnore: 4, resistancePenetration: 5,
        toughnessActive: true
    },
    {
        atk: 2401.75, hp: 8526.5, def: 3311.25,
        baseAtk: 861.25, baseHp: 1564.75, baseDef: 1260.5,
        critRate: 71.25, critDamage: 85.5, damageBonus: 7.75,
        characterLevel: 80, enemyLevel: 75, resistance: 0,
        defenseReduction: 0, defenseIgnore: 0, resistancePenetration: 0,
        toughnessActive: false
    }
];

function hertaContext(enemyHp = 100, extra = {}) {
    return {
        characterId: "1013",
        eidolon: 0,
        traceLevelFor: () => 10,
        enemy: { hpPercent: enemyHp },
        ...extra
    };
}

function buildHertaModifiers(data, enemyHp, inputs = {}) {
    return runtime.buildCandidates(data.structuredModifiers, hertaContext(enemyHp), inputs);
}

function resultInput(attack, level, profile, modifiers = []) {
    const input = makeRequest(attack, level, profile);
    input.attack.multiplier = curves[attack.id].values[level - 1];
    input.enemy.count = 1;
    input.modifiers = modifiers.filter((modifier) => runtime.applicableToAttack(modifier, attack));
    return input;
}

test("Herta E0 fixed-source direct attacks match independent damage across all E0 levels and two asymmetric profiles", async () => {
    assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
    const { data, engine } = await loadProductionFixture();

    for (const [id, spec] of Object.entries(curves)) {
        const attack = attackOf(data, id);
        assert.equal(attack.characterId, "1013", id + " owner");
        assert.equal(attack.scalingStat, spec.scalingStat, id + " reads ATK");
        assert.equal(attack.support?.status, "calculable", id + " production status");
        assert.equal(attack.support?.verified, true, id + " retains verification provenance");
        assert.deepEqual(Array.from(attack.multipliers.slice(0, spec.values.length)), spec.values, id + " fixed-source E0 curve");
        assert.equal(attack.target, id === "101301" ? "single" : "aoe", id + " target shape");
        assert.equal(attack.hitCount, 1, id + " is one damage event");

        for (let level = 1; level <= spec.values.length; level += 1) {
            for (const [profileIndex, profile] of profiles.entries()) {
                const input = resultInput(attack, level, profile);
                const result = assertMatchesIndependent(engine, input, id + " E0 Lv" + level + " profile " + profileIndex);
                assertClose(result.breakdown.referenceValue, profile.atk, id + " uses final ATK only");
            }
        }
    }
});

test("Herta skill's fixed 20% HP threshold and A1 25% skill bonus stay distinct and scoped", async () => {
    const { data, engine } = await loadProductionFixture();
    const skill = attackOf(data, "101302");
    const hpBonusId = "trace:1013:101302:high-hp-skill-damage";
    const a1BonusId = "traceNode:1013:1013101:skill-damage";
    const baseline = resultInput(skill, 10, profiles[0]);

    for (const [hp, thresholdEnabled] of [[50, true], [49.99, false]]) {
        const candidates = buildHertaModifiers(data, hp);
        const hpBonus = candidates.find((item) => item.id === hpBonusId);
        const a1Bonus = candidates.find((item) => item.id === a1BonusId);
        assert.ok(hpBonus, "source skill's HP-threshold bonus is registered");
        assert.ok(a1Bonus, "unlocked E0 A1 is registered separately");
        assert.equal(hpBonus.value, 20, "StarRailRes skill 101302 parameter #3 is +20%, not +25%");
        assert.equal(hpBonus.enabled, thresholdEnabled, "HP threshold is inclusive at 50%");
        assert.equal(a1Bonus.value, 25, "A1 trace 1013101 parameter #1 is a separate +25%");
        assert.equal(a1Bonus.enabled, true, "A1 is active for the assumed Skill event");

        const applied = [hpBonus, a1Bonus];
        const input = resultInput(skill, 10, profiles[0], applied);
        input.enemy.hpPercent = hp;
        const result = assertMatchesIndependent(engine, input, "Herta E0 Skill Lv10 HP " + hp);
        const base = engine.calculate(baseline);
        const expectedAddedDamageBonus = 25 + (thresholdEnabled ? 20 : 0);
        assertClose(result.breakdown.damageBonus, profiles[0].damageBonus + expectedAddedDamageBonus, "only the selected skill bonuses add to the final input");
        assertClose(result.nonCrit / base.nonCrit,
            (1 + profiles[0].damageBonus / 100 + expectedAddedDamageBonus / 100) / (1 + profiles[0].damageBonus / 100),
            "high-HP +20% and A1 +25% combine in the additive damage-bonus bucket");
        assert.deepEqual(Array.from(result.applied, (item) => item.id), thresholdEnabled ? [hpBonusId, a1BonusId] : [a1BonusId]);
    }

    const allCandidates = buildHertaModifiers(data, 50);
    const hpBonus = allCandidates.find((item) => item.id === hpBonusId);
    assert.equal(runtime.applicableToAttack(hpBonus, attackOf(data, "101301")), false, "Skill threshold bonus cannot affect Normal");
    assert.equal(runtime.applicableToAttack(hpBonus, attackOf(data, "101303")), false, "Skill threshold bonus cannot affect Ultimate");
    assert.equal(runtime.applicableToAttack(allCandidates.find((item) => item.id === a1BonusId), attackOf(data, "101304")), false,
        "A1 Skill bonus cannot leak to Talent follow-up");
});

test("Herta Frozen-target Ultimate bonus is optional, attack-scoped, and never changes Skill", async () => {
    const { data, engine } = await loadProductionFixture();
    const ultimate = attackOf(data, "101303");
    const skill = attackOf(data, "101302");
    const id = "traceNode:1013:1013103:frozen-ultimate-damage";
    const offCandidates = buildHertaModifiers(data, 100, { "herta-target-frozen": false });
    const onCandidates = buildHertaModifiers(data, 100, { "herta-target-frozen": true });
    const off = offCandidates.find((item) => item.id === id);
    const on = onCandidates.find((item) => item.id === id);
    assert.equal(off.enabled, false);
    assert.equal(on.enabled, true);
    assert.equal(on.value, 20, "fixed-source A6 frozen-target bonus is +20%");
    assert.equal(runtime.applicableToAttack(on, ultimate), true);
    assert.equal(runtime.applicableToAttack(on, skill), false);

    const baseInput = resultInput(ultimate, 10, profiles[1]);
    const base = assertMatchesIndependent(engine, baseInput, "Herta E0 Ultimate Lv10 not Frozen");
    const frozenInput = resultInput(ultimate, 10, profiles[1], [on]);
    const frozen = assertMatchesIndependent(engine, frozenInput, "Herta E0 Ultimate Lv10 Frozen");
    const expectedDamageBonus = profiles[1].damageBonus + 20;
    assertClose(frozen.breakdown.damageBonus, expectedDamageBonus, "frozen-only Ultimate bonus is additive with final damage bonus");
    assertClose(frozen.nonCrit / base.nonCrit, (1 + expectedDamageBonus / 100) / (1 + profiles[1].damageBonus / 100), "Frozen Ultimate ratio");
    assert.deepEqual(Array.from(frozen.applied, (item) => item.id), [id]);

    const skillWithFrozenToggle = assertMatchesIndependent(engine,
        resultInput(skill, 10, profiles[1], [on]), "Herta Skill remains unchanged by Frozen Ultimate toggle");
    assertClose(skillWithFrozenToggle.nonCrit, engine.calculate(resultInput(skill, 10, profiles[1])).nonCrit,
        "Frozen bonus does not apply to Skill");
    assert.deepEqual(Array.from(skillWithFrozenToggle.applied), []);
});

test("Herta E0 attacks reference final ATK only and do not re-add permanent Ice DMG or CR traces", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "101303");
    // Herta's permanent traces (Ice DMG 22.4%, CR 6.7%) are already part of these completed final inputs.
    const finalProfile = { ...profiles[0], critRate: 56.7, damageBonus: 22.4 };
    const candidates = buildHertaModifiers(data, 100, { "herta-target-frozen": false });
    const input = resultInput(attack, 10, finalProfile, candidates);
    const result = assertMatchesIndependent(engine, input, "Herta final-stat trace contract");
    assertClose(result.breakdown.referenceValue, finalProfile.atk, "permanent traces do not rebuild ATK");
    assertClose(result.breakdown.damageBonus, 22.4, "permanent Ice DMG remains only in completed final input");
    assert.deepEqual(Array.from(result.applied, (item) => item.id), [], "unselected optional effects are not silently applied");

    const base = engine.calculate(input);
    for (const stat of ["atk", "hp", "def"]) {
        const changed = {
            ...input,
            character: { ...input.character, stats: { ...input.character.stats, [stat]: input.character.stats[stat] + 317.25 } }
        };
        const changedResult = engine.calculate(changed);
        if (stat === "atk") assertClose(changedResult.nonCrit / base.nonCrit, (finalProfile.atk + 317.25) / finalProfile.atk, "only ATK scales Herta's direct attack");
        else assertClose(changedResult.nonCrit, base.nonCrit, "Herta attack ignores unrelated " + stat);
    }
});
