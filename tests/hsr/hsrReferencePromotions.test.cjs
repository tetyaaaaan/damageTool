"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { runtime, fixedSourceSha, loadProductionFixture, attackOf, makeRequest, assertClose, assertMatchesIndependent } = require("./helpers/hsrDirectVerification.cjs");

test("the three earlier reviewed attacks retain fixed-source provenance", async () => {
    const { data, engine } = await loadProductionFixture();
    const expected = {
        "122101": {
            characterId: "1221", type: "normal", element: "Physical", target: "single",
            multipliers: [50, 60, 70, 80, 90, 100, 110], eidolon: 6, trace: 7
        },
        "130502": {
            characterId: "1305", type: "skill", element: "Imaginary", target: "single",
            multipliers: [75, 82.5, 90, 97.5, 105, 112.5, 121.88, 131.25, 140.62, 150], eidolon: 0, trace: 10
        },
        "131702": {
            characterId: "1317", type: "skill", element: "Imaginary", target: "aoe",
            multipliers: [60, 66, 72, 78, 84, 90, 97.5, 105, 112.5, 120], eidolon: 0, trace: 10
        }
    };

    for (const [id, spec] of Object.entries(expected)) {
        const attack = attackOf(data, id);
        assert.equal(attack.support.status, "calculable", id);
        assert.equal(attack.support.verified, true, id);
        assert.equal(attack.characterId, spec.characterId, id);
        assert.equal(attack.type, spec.type, id);
        assert.equal(attack.element, spec.element, id);
        assert.equal(attack.target, spec.target, id);
        assert.deepEqual(Array.from(attack.multipliers), spec.multipliers, id + " fixed-SHA multipliers");
        assert.equal(attack.maximumEidolon, spec.eidolon, id);
        assert.equal(attack.maximumTraceLevel, spec.trace, id);
        assert.equal(attack.scalingStat, "atk", id);
        assert.equal(attack.damageFormula, "statMultiplier", id);
        assert.equal(attack.canCrit, true, id);
        assert.equal(attack.hitCountLabel, "全段合算", id + " describes an aggregate multiplier, not animation hit count");
        assert.equal(attack.enemyCountExact, 1, id);
        assert.equal(attack.provenance.sourceCommit, fixedSourceSha, id);
        assert.equal(attack.provenance.sourceName, "Mar-7th/StarRailRes", id);
        assert.match(attack.provenance.sourceFile, /character_skills\.json:/, id);
        assert.ok(attack.calculationNote && attack.calculationNote.length > 20, id + " scope is documented");
        assert.equal(engine.unsupportedAttackReason(attack), "", id + " is allowed by the actual engine");
    }

    const rappa = attackOf(data, "131702");
    assert.equal(rappa.requiresNonWeakTarget, true);
    assert.equal(rappa.requiredToughnessActive, true);
    assert.equal(rappa.enemyCountExact, 1);
    assert.match(rappa.calculationNote, /結印外/);
    assert.match(rappa.calculationNote, /未撃破/);

    const counts = data.attacks.reduce((summary, attack) => {
        const status = attack.support?.status || "review";
        summary[status] = (summary[status] || 0) + 1;
        return summary;
    }, {});
    assert.equal(data.attackCoverage.total, data.attacks.length);
    assert.equal(data.attackCoverage.calculable, data.attacks.filter((attack) => attack.support?.status === "calculable" && attack.support?.verified).length);
    assert.equal(data.attackCoverage.review, data.attacks.filter((attack) => attack.support?.status !== "calculable" || !attack.support?.verified).length);
    assert.ok(counts.calculable >= 3);

    assert.equal(attackOf(data, "140602").support.status, "review", "an unrelated unverified skill remains review-only");
    assert.equal(attackOf(data, "151320").support.status, "calculable", "an unrelated existing calculable attack stays calculable");
    assert.equal(attackOf(data, "140603").support.status, "displayOnly", "an unrelated unsupported compound attack stays display-only");
});

test("each promoted direct attack matches independent NC, C, and expected-value calculations at every supported level", async () => {
    const { data, engine } = await loadProductionFixture();
    const cases = [
        { atk: 3000, critRate: 50, critDamage: 100, damageBonus: 0, enemyLevel: 80, resistance: 20, toughnessActive: true },
        { atk: 4123.5, critRate: 25, critDamage: 155, damageBonus: 48, enemyLevel: 90, resistance: 40, defenseReduction: 20, defenseIgnore: 10, toughnessActive: false },
        { atk: 2876.25, critRate: 75, critDamage: 65, damageBonus: 23.5, enemyLevel: 70, resistance: 0, defenseIgnore: 30, resistancePenetration: 10, takenDamage: 15, toughnessActive: true }
    ];
    const targets = [
        ["122101", [50, 60, 70, 80, 90, 100, 110]],
        ["130502", [75, 82.5, 90, 97.5, 105, 112.5, 121.88, 131.25, 140.62, 150]],
        ["131702", [60, 66, 72, 78, 84, 90, 97.5, 105, 112.5, 120]]
    ];
    for (const [id, sourceValues] of targets) {
        const attack = attackOf(data, id);
        for (let level = 1; level <= sourceValues.length; level++) {
            assertClose(attack.multipliers[level - 1], sourceValues[level - 1], id + " Lv" + level + " source coefficient");
            for (const config of cases) {
                const allowedCase = { ...config, eidolon: id === "122101" && level === 7 ? 3 : 0, ...(id === "131702" ? { toughnessActive: true } : {}) };
                const input = makeRequest(attack, level, allowedCase);
                const result = assertMatchesIndependent(engine, input, id + " Lv" + level);
                assert.equal(result.attack.hitCount, 1, id);
                assert.equal(result.attack.hitCountLabel, "全段合算", id);
            }
        }
    }
});

test("Yunli True Sunder applies 30% of base ATK once to basic attacks and respects final-stat input", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "122101");
    const id = "traceNode:1221:1221103:true-sunder";
    const record = data.structuredModifiers.find((item) => item.id === id);
    assert.ok(record, "existing structured True Sunder effect is reused");
    assert.equal(record.value.fixed, 30);
    assert.deepEqual(Array.from(record.target.attackTypes), ["normal", "skill", "followUp", "ultimate"]);
    assert.equal(record.inputPolicy, "conditional");

    for (const baseAtk of [679.14, 879.14]) {
        const finalAtk = 3000;
        const context = { characterId: "1221", eidolon: 0, stats: { atk: finalAtk }, baseStats: { atk: baseAtk } };
        const enabled = runtime.buildCandidates(data.structuredModifiers, context, { "yunli-true-sunder-active": true }).find((item) => item.id === id);
        const disabled = runtime.buildCandidates(data.structuredModifiers, context, { "yunli-true-sunder-active": false }).find((item) => item.id === id);
        assert.ok(enabled);
        assert.equal(enabled.enabled, true);
        assert.equal(enabled.value, 30);
        assert.equal(runtime.applicableToAttack(enabled, attack), true);
        assert.equal(disabled.enabled, false);

        const withBuff = makeRequest(attack, 6, { atk: finalAtk, baseAtk });
        withBuff.modifiers = [enabled];
        const buffed = assertMatchesIndependent(engine, withBuff, "Yunli Sunder base ATK " + baseAtk);
        assertClose(buffed.breakdown.referenceValue, finalAtk + baseAtk * 0.3, "Yunli adjusted ATK");
        assert.equal(withBuff.character.stats.atk, finalAtk, "the entered final ATK remains unchanged");

        const alreadyIncluded = makeRequest(attack, 6, { atk: finalAtk + baseAtk * 0.3, baseAtk });
        const noReapplication = assertMatchesIndependent(engine, alreadyIncluded, "Yunli Sunder already included in final ATK " + baseAtk);
        assertClose(noReapplication.nonCrit, buffed.nonCrit, "final ATK with the effect already included");
        assert.equal(withBuff.character.stats.atk, finalAtk, "the UI input is never mutated by the calculation");
    }

    const wrongCharacter = runtime.buildCandidates(data.structuredModifiers, { characterId: "1222", partyIds: ["1221"] }, { "yunli-true-sunder-active": true })
        .find((item) => item.id === id);
    assert.equal(wrongCharacter, undefined, "True Sunder is self-only and cannot be granted by a party Yunli");
});

test("Dr. Ratio Deduction applies only to eligible attacks at the manually entered pre-hit debuff count", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "130502");
    const followUp = attackOf(data, "130504");
    const normal = attackOf(data, "130501");
    const id = "traceNode:1305:1305103:deduction";
    const record = data.structuredModifiers.find((item) => item.id === id);
    assert.ok(record);
    assert.deepEqual(Array.from(record.target.attackTypes), ["normal", "skill", "ultimate", "followUp"]);
    assert.equal(record.activation.reference, "enemy.debuffCount");
    assert.equal(record.activation.inputKey, "ratio-deduction-unlocked");

    const expectedBonus = new Map([[3, 30], [4, 40], [5, 50]]);
    for (const [debuffCount, bonus] of expectedBonus) {
        const context = {
            characterId: "1305",
            eidolon: 0,
            enemy: { debuffCount },
            traceLevelFor: () => 10
        };
        const selected = runtime.buildCandidates(data.structuredModifiers, context, { "ratio-deduction-unlocked": true }).find((item) => item.id === id);
        assert.ok(selected);
        assert.equal(selected.enabled, true);
        assert.equal(selected.value, bonus);
        assert.equal(runtime.applicableToAttack(selected, attack), true);
        assert.equal(runtime.applicableToAttack(selected, followUp), true);
        assert.equal(runtime.applicableToAttack(selected, normal), true);

        const input = makeRequest(attack, 10, { debuffCount });
        input.modifiers = [selected];
        const result = assertMatchesIndependent(engine, input, "Ratio Deduction " + debuffCount + " debuffs");
        assertClose(result.breakdown.damageBonus, bonus, "Ratio Deduction damage-bonus bucket");
        assert.equal(result.applied.filter((item) => item.id === id).length, 1, "the same trace is applied exactly once");

        const inputWithoutDeduction = makeRequest(attack, 10, { debuffCount });
        const baseline = engine.calculate(inputWithoutDeduction);
        assertClose(result.nonCrit / baseline.nonCrit, (1 + bonus / 100), "Ratio Deduction is additive in the damage-bonus bucket");
    }

    const offContext = {
        characterId: "1305",
        eidolon: 0,
        enemy: { debuffCount: 5 },
        traceLevelFor: () => 10
    };
    const off = runtime.buildCandidates(data.structuredModifiers, offContext, { "ratio-deduction-unlocked": false }).find((item) => item.id === id);
    assert.ok(off);
    assert.equal(off.enabled, false, "Deduction is optional and defaults to OFF");
    assert.equal(runtime.applicableToAttack(off, attack), false);
    const noEffect = engine.calculate(makeRequest(attack, 10, { debuffCount: 5 }, [off]));
    const baseline = engine.calculate(makeRequest(attack, 10, { debuffCount: 5 }));
    assertClose(noEffect.nonCrit, baseline.nonCrit, "Deduction OFF preserves the base calculation");

    const belowThreshold = runtime.buildCandidates(data.structuredModifiers, {
        characterId: "1305", eidolon: 0, enemy: { debuffCount: 2 }, traceLevelFor: () => 10
    }, { "ratio-deduction-unlocked": true }).find((item) => item.id === id);
    assert.ok(belowThreshold);
    assert.equal(belowThreshold.enabled, false, "fewer than three enemy debuffs cannot activate Deduction");
    assert.equal(runtime.applicableToAttack(belowThreshold, attack), false);
});




