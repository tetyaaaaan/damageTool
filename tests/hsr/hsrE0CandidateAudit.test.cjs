"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    fixedSourceSha, loadProductionFixture, attackOf, makeRequest,
    assertClose, assertMatchesIndependent
} = require("./helpers/hsrDirectVerification.cjs");

// These arrays are transcribed from index_new/jp/character_skills.json at
// fixedSourceSha. They are the independent coefficient oracle; production
// attack records are only compared against these values.
const curves = {
    "120301": {
        characterId: "1203", scalingStat: "atk", e0MaxLevel: 6,
        values: [50, 60, 70, 80, 90, 100, 110, 120, 130, 140]
    },
    "120303": {
        characterId: "1203", scalingStat: "atk", e0MaxLevel: 10,
        values: [120, 128, 136, 144, 152, 160, 170, 180, 190, 200, 208, 216, 224, 232, 240]
    },
    "120801": {
        characterId: "1208", scalingStat: "hp", e0MaxLevel: 6,
        values: [25, 30, 35, 40, 45, 50, 55, 60, 65, 70]
    },
    "120803": {
        characterId: "1208", scalingStat: "hp", e0MaxLevel: 10,
        values: [60, 64, 68, 72, 76, 80, 85, 90, 95, 100, 104, 108, 112, 116, 120]
    },
    "110401": {
        characterId: "1104", scalingStat: "atk", e0MaxLevel: 6,
        values: [50, 60, 70, 80, 90, 100, 110, 120, 130, 140]
    },
    "110402": {
        characterId: "1104", scalingStat: "atk", e0MaxLevel: 10,
        values: [100, 110, 120, 130, 140, 150, 162.5, 175, 187.5, 200, 210, 220, 230, 240, 250]
    },
    "1104021": {
        characterId: "1104", scalingStat: "atk", e0MaxLevel: 10, canCrit: false,
        // Skill 110402's fourth parameter is the later Frozen-target tick.
        values: [30, 33, 36, 39, 42, 45, 48.75, 52.5, 56.25, 60, 63, 66, 69, 72, 75]
    }
};

const profiles = [
    {
        atk: 3587.25, hp: 7421.5, def: 1198.75,
        baseAtk: 991.5, baseHp: 1400.25, baseDef: 1100.75,
        critRate: 37.5, critDamage: 146.2, damageBonus: 27.75,
        characterLevel: 80, enemyLevel: 88, resistance: 35,
        defenseReduction: 12, defenseIgnore: 7, resistancePenetration: 5,
        toughnessActive: true
    },
    {
        atk: 2411.75, hp: 5809.25, def: 3517.125,
        baseAtk: 1173.25, baseHp: 903.5, baseDef: 1288.75,
        critRate: 62.25, critDamage: 73.5, damageBonus: 41.3,
        characterLevel: 80, enemyLevel: 75, resistance: 0,
        defenseReduction: 0, defenseIgnore: 0, resistancePenetration: 0,
        toughnessActive: false
    }
];

function inputFor(attack, level, multiplier, config) {
    const input = makeRequest(attack, level, config);
    input.attack.multiplier = multiplier;
    return input;
}

test("fixed-source E0 candidate records match independent direct-damage calculations", async () => {
    assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
    const { data, engine } = await loadProductionFixture();

    for (const [id, spec] of Object.entries(curves)) {
        const attack = attackOf(data, id);
        assert.equal(attack.characterId, spec.characterId, id + " character owner");
        assert.equal(attack.scalingStat, spec.scalingStat, id + " fixed-source reference stat");
        assert.equal(attack.support?.status, "calculable", id + " has a calculable production record");
        assert.equal(attack.support?.verified, true, id + " is marked verified");
        assert.deepEqual(Array.from(attack.multipliers), spec.values, id + " complete fixed-source curve");
        if (spec.canCrit === false) assert.equal(attack.canCrit, false, id + " is non-critical damage");
        else assert.notEqual(attack.canCrit, false, id + " can crit");

        for (const level of Array.from({ length: spec.e0MaxLevel }, (_, index) => index + 1)) {
            const multiplier = spec.values[level - 1];
            for (const [profileIndex, profile] of profiles.entries()) {
                const input = inputFor(attack, level, multiplier, profile);
                const result = assertMatchesIndependent(engine, input, id + " E0 Lv" + level + " profile " + profileIndex);
                assertClose(result.breakdown.referenceValue, profile[spec.scalingStat], id + " final " + spec.scalingStat + " only");
            }
        }
    }
});

test("E0 direct records use only the declared ATK or HP stat and keep skill/ultimate scopes separate", async () => {
    const { data, engine } = await loadProductionFixture();

    for (const [id, spec] of Object.entries(curves)) {
        const attack = attackOf(data, id);
        const level = spec.e0MaxLevel;
        const input = inputFor(attack, level, spec.values[level - 1], profiles[0]);
        const base = engine.calculate(input);
        assert.notEqual(base.supported, false, id + " base action calculates");
        assertClose(base.breakdown.referenceValue, profiles[0][spec.scalingStat], id + " final stat is not rebuilt from base stats");

        for (const stat of ["atk", "hp", "def"]) {
            const changed = {
                ...input,
                character: {
                    ...input.character,
                    stats: { ...input.character.stats, [stat]: input.character.stats[stat] + 317.25 }
                }
            };
            const result = engine.calculate(changed);
            if (stat === spec.scalingStat) {
                assertClose(result.nonCrit / base.nonCrit, (input.character.stats[stat] + 317.25) / input.character.stats[stat], id + " scales with " + stat);
            } else {
                assertClose(result.nonCrit, base.nonCrit, id + " ignores unrelated " + stat);
            }
        }

        if (id === "120301" || id === "120801" || id === "110401") {
            assert.equal(attack.type, "normal", id + " normal action scope");
        } else if (id === "120303" || id === "120803") {
            assert.equal(attack.type, "ultimate", id + " ultimate action scope");
        } else if (id === "110402") {
            assert.equal(attack.type, "skill", id + " skill action scope");
        } else if (id === "1104021") {
            assert.equal(attack.type, "additional", id + " Frozen tick stays a separate event");
        }
    }
});

test("Frozen-target damage is a separate non-critical event, and non-damage support actions stay hidden", async () => {
    const { data, engine } = await loadProductionFixture();
    const skill = attackOf(data, "110402");
    const frozenTick = attackOf(data, "1104021");
    const skillMultiplier = curves["110402"].values[9];
    const tickMultiplier = curves["1104021"].values[9];
    const skillResult = assertMatchesIndependent(
        engine, inputFor(skill, 10, skillMultiplier, profiles[0]), "Gepard E0 Lv10 direct Skill"
    );
    const tickInput = inputFor(frozenTick, 10, tickMultiplier, profiles[0]);
    const tickResult = assertMatchesIndependent(engine, tickInput, "Gepard E0 Lv10 Frozen-target tick");
    assert.equal(tickResult.nonCrit, tickResult.crit);
    assert.equal(tickResult.crit, tickResult.expected);
    assert.notEqual(skillResult.nonCrit, tickResult.nonCrit, "the immediate Skill and later Frozen tick are not silently merged");
    assert.equal(frozenTick.sourceSkillId, skill.sourceSkillId);
    assert.equal(frozenTick.canCrit, false);

    const expectedVisibleDamageIds = {
        "1203": ["120301", "120303"],
        "1208": ["120801", "120803"],
        "1104": ["110401", "110402", "1104021"]
    };
    for (const [characterId, expectedIds] of Object.entries(expectedVisibleDamageIds)) {
        const visible = Array.from(data.attacks
            .filter((attack) => attack.characterId === characterId && !attack.hidden && attack.support?.status !== "displayOnly")
            .map((attack) => attack.id)
            .sort());
        assert.deepEqual(visible, expectedIds, characterId + " E0 visible damage rows exclude non-damage actions");
    }

    for (const id of ["120302", "120304", "120307", "120802", "120804", "120807"]) {
        const record = attackOf(data, id);
        assert.equal(record.hidden, true, id + " healing/support/technique record is not shown as damage");
        assert.ok(record.multipliers.every((value) => value === 0), id + " is not a zero-damage result row");
    }
});
