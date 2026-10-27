"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    loadProductionFixture,
    attackOf,
    makeRequest,
    assertClose,
    assertMatchesIndependent,
    independentDirectDamage,
    fixedSourceSha
} = require("./helpers/hsrDirectVerification.cjs");

const promotions = {
    "121101": { characterId: "1211", name: "望・聞・問…蹴！", element: "Thunder", scalingStat: "atk", multipliers: [50, 60, 70, 80, 90, 100] },
    "121501": { characterId: "1215", name: "冥兆天筆", element: "Physical", scalingStat: "atk", multipliers: [50, 60, 70, 80, 90, 100] },
    "121701": { characterId: "1217", name: "令旗・風雨招来", element: "Wind", scalingStat: "hp", multipliers: [25, 30, 35, 40, 45, 50] },
    "130401": { characterId: "1304", name: "ストレートべット", element: "Imaginary", scalingStat: "def", multipliers: [50, 60, 70, 80, 90, 100] },
    "131301": { characterId: "1313", name: "光を纏う告諭", element: "Imaginary", scalingStat: "atk", multipliers: [50, 60, 70, 80, 90, 100] }
};

const variedModifiers = (stat) => [
    { id: "reviewed-reference-stat", category: "statPercent", stat, value: 20, enabled: true, applicable: true },
    { id: "unrelated-atk-stat", category: "statPercent", stat: "atk", value: 50, enabled: true, applicable: true },
    { id: "flat-reference-stat", category: "statFlat", stat, value: 125.5, enabled: true, applicable: true },
    { id: "damage-bonus", category: "damageBonus", value: 35, enabled: true, applicable: true },
    { id: "defense-reduction", category: "defenseReduction", value: 12, enabled: true, applicable: true },
    { id: "resistance-penetration", category: "resistancePenetration", value: 8, enabled: true, applicable: true },
    { id: "crit-rate", category: "critRate", value: 15, enabled: true, applicable: true },
    { id: "crit-damage", category: "critDamage", value: 25, enabled: true, applicable: true },
    { id: "taken-damage", category: "takenDamage", value: 10, enabled: true, applicable: true },
    { id: "disabled-bonus", category: "damageBonus", value: 80, enabled: false, applicable: false }
];

test("five direct single-target Basic attacks are promoted only with fixed-source E0 scope", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const [id, spec] of Object.entries(promotions)) {
        const attack = attackOf(data, id);
        assert.equal(attack.support.status, "calculable", id);
        assert.equal(attack.support.verified, true, id);
        assert.equal(attack.characterId, spec.characterId, id);
        assert.equal(attack.name, spec.name, id);
        assert.equal(attack.type, "normal", id);
        assert.equal(attack.traceKey, "normal", id);
        assert.equal(attack.element, spec.element, id);
        assert.equal(attack.target, "single", id);
        assert.equal(attack.scalingStat, spec.scalingStat, id);
        assert.equal(attack.damageFormula, "statMultiplier", id);
        assert.equal(attack.canCrit, true, id);
        assert.equal(attack.hitCountLabel, "全段合算", id);
        assert.equal(attack.maximumEidolon, 0, id);
        assert.equal(attack.maximumTraceLevel, 6, id);
        assert.equal(attack.enemyCountExact, 1, id);
        assert.deepEqual(Array.from(attack.multipliers), spec.multipliers, id + " source coefficients");
        assert.equal(attack.provenance.sourceCommit, fixedSourceSha, id);
        assert.match(attack.provenance.sourceFile, /character_skills\.json:/, id);
        assert.ok(attack.calculationNote.length > 20, id + " explains its scope");
        assert.equal(engine.unsupportedAttackReason(attack), "", id + " passes engine validation");
    }

    assert.equal(attackOf(data, "140601").support.status, "review", "an unverified sibling remains a reference value");
    assert.equal(attackOf(data, "140603").support.status, "displayOnly", "an unsupported compound attack remains unavailable");
    assert.equal(data.attacks.length, data.attackCoverage.total, "loader totals remain derived from the actual attack list");
});

test("grouped ATK, HP, and DEF Basic attacks match independent NC, C, and EV arithmetic at every supported level", async () => {
    const { data, engine } = await loadProductionFixture();
    const scenarios = [
        { stats: { atk: 3000, hp: 6000, def: 3000 }, baseStats: { atk: 1000, hp: 1000, def: 1000 }, critRate: 50, critDamage: 100, damageBonus: 0, resistance: 20, enemyLevel: 80, toughnessActive: true },
        { stats: { atk: 4123.5, hp: 8234.25, def: 3567.75 }, baseStats: { atk: 1100, hp: 1200, def: 900 }, critRate: 25, critDamage: 155, damageBonus: 48, resistance: 40, enemyLevel: 90, defenseReduction: 20, defenseIgnore: 10, toughnessActive: false },
        { stats: { atk: 2876.25, hp: 7345.5, def: 2789.125 }, baseStats: { atk: 900, hp: 1050, def: 1100 }, critRate: 75, critDamage: 65, damageBonus: 23.5, resistance: 0, enemyLevel: 70, defenseIgnore: 30, resistancePenetration: 10, takenDamage: 15, toughnessActive: true }
    ];

    for (const [id, spec] of Object.entries(promotions)) {
        const attack = attackOf(data, id);
        for (let level = 1; level <= spec.multipliers.length; level++) {
            for (const [index, scenario] of scenarios.entries()) {
                const config = {
                    characterLevel: 80,
                    eidolon: 0,
                    atk: scenario.stats.atk,
                    hp: scenario.stats.hp,
                    def: scenario.stats.def,
                    baseAtk: scenario.baseStats.atk,
                    baseHp: scenario.baseStats.hp,
                    baseDef: scenario.baseStats.def,
                    critRate: scenario.critRate,
                    critDamage: scenario.critDamage,
                    damageBonus: scenario.damageBonus,
                    resistance: scenario.resistance,
                    enemyLevel: scenario.enemyLevel,
                    defenseReduction: scenario.defenseReduction || 0,
                    defenseIgnore: scenario.defenseIgnore || 0,
                    resistancePenetration: scenario.resistancePenetration || 0,
                    takenDamage: scenario.takenDamage || 0,
                    toughnessActive: scenario.toughnessActive,
                    enemyCount: 1
                };
                const input = makeRequest(attack, level, config, index === 0 ? [] : variedModifiers(spec.scalingStat));
                input.character.stats = { ...input.character.stats, ...scenario.stats };
                input.character.baseStats = { ...input.character.baseStats, ...scenario.baseStats };
                const result = assertMatchesIndependent(engine, input, id + " Lv" + level + " scenario" + index);
                assertClose(result.breakdown.referenceValue, independentDirectDamage(input).effectiveReferenceValue, id + " uses its own " + spec.scalingStat + "");
                assert.equal(result.attack.hitCountLabel, "全段合算", id + " scope does not claim animation hit count");
            }
        }
    }
});

