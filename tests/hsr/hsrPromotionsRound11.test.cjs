"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    fixedSourceSha,
    loadProductionFixture,
    runtime,
    makeRequest,
    assertMatchesIndependent,
    assertClose,
    readJson
} = require("./helpers/hsrDirectVerification.cjs");

const promotionFile = "games/hsr/data/calc/attacks-promotions-round11.json";
const modifierFile = "games/hsr/data/calc/modifiers-promotions-round11.json";

// Fixed-source params[][0] * 100 copied independently from the pinned JP skill records.
const expectedCurves = {
    "140808": [125, 150, 175, 200, 225, 250],
    "132102": [80, 88, 96, 104, 112, 120, 130, 140, 150, 160],
    "132103": [180, 192, 204, 216, 228, 240, 255, 270, 285, 300],
    "141002": [70, 77, 84, 91, 98, 105, 113.75, 122.5, 131.25, 140],
    "140802": [150, 165, 180, 195, 210, 225, 243.75, 262.5, 281.25, 300],
    "140604": [75, 82.5, 90, 97.5, 105, 112.5, 121.88, 131.25, 140.62, 150]
};

const profiles = [
    {
        atk: 3317, hp: 7159, def: 2411,
        baseAtk: 1043, baseHp: 1217, baseDef: 987,
        critRate: 37, critDamage: 143, damageBonus: 19,
        enemyLevel: 82, resistance: 27, toughnessActive: true,
        defenseReduction: 11, defenseIgnore: 4, resistancePenetration: 7, takenDamage: 9
    },
    {
        atk: 5041, hp: 8923, def: 3869,
        baseAtk: 1179, baseHp: 1003, baseDef: 1109,
        critRate: 71, critDamage: 88, damageBonus: 46,
        enemyLevel: 93, resistance: 5, toughnessActive: false,
        defenseReduction: 0, defenseIgnore: 12, resistancePenetration: 13, takenDamage: 0
    }
];

function nativeCandidates(data, attack, profile, traceLevel, selectedInputs) {
    return runtime.buildCandidates(data.structuredModifiers, {
        characterId: attack.characterId,
        eidolon: 0,
        stats: profile,
        traceLevelFor: (source) => source.skillId === attack.sourceSkillId ? traceLevel : 10
    }, selectedInputs).map((modifier) => ({
        ...modifier,
        applicable: modifier.applicable && runtime.applicableToAttack(modifier, attack)
    }));
}

test("Round11 attack promotions use only fixed E0 direct-damage curves", async () => {
    const promotions = readJson(promotionFile);
    const modifiers = readJson(modifierFile).modifiers;
    assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
    assert.equal(promotions.generatedFrom.includes(fixedSourceSha), true);
    assert.equal(promotions.overrides.length, Object.keys(expectedCurves).length);

    const byId = new Map(promotions.overrides.map((attack) => [attack.id, attack]));
    assert.equal(byId.size, promotions.overrides.length, "promotion IDs are unique");
    for (const [id, curve] of Object.entries(expectedCurves)) {
        const attack = byId.get(id);
        assert.ok(attack, "expected promotion " + id);
        assert.equal(attack.maximumEidolon, 0);
        assert.equal(attack.maximumTraceLevel, curve.length);
        assert.equal(attack.enemyCountExact, ["140802", "140808"].includes(id) ? undefined : 1);
        assert.equal(attack.characterLevelExact, 80);
        assert.equal(attack.damageFormula, "statMultiplier");
        assert.deepEqual(attack.multipliers, curve, id + " fixed-source E0 curve");
        assert.equal(attack.support.status, "calculable");
        assert.equal(attack.support.verified, true);
        assert.equal(attack.provenance.sourceCommit, fixedSourceSha);
    }

    const { data, engine } = await loadProductionFixture();
    for (const [id, promoted] of byId) {
        const index = data.attacks.findIndex((attack) => attack.id === id);
        assert.notEqual(index, -1, "production generated reference row exists for " + id);
        data.attacks[index] = promoted;

        for (let level = 1; level <= promoted.maximumTraceLevel; level += 1) {
            for (const [profileIndex, config] of profiles.entries()) {
                const requiredCondition = modifiers.find((modifier) => modifier.source.skillId === id);
                const selectedInputs = { ...(promoted.comparisonModifierInputs || {}) };
                if (requiredCondition) selectedInputs[requiredCondition.activation.inputKey] = true;
                const input = makeRequest(promoted, level, { ...config, enemyCount: 1 }, requiredCondition
                    ? nativeCandidates(data, promoted, config, level, selectedInputs)
                    : []);
                input.modifierInputs = selectedInputs;
                const result = requiredCondition
                    ? assertMatchesIndependent(engine, input, id + " Lv" + level + " established-state profile" + profileIndex)
                    : assertMatchesIndependent(engine, input, id + " Lv" + level + " profile" + profileIndex);
                assertClose(result.breakdown.referenceValue, config.atk, id + " ATK reference profile" + profileIndex);
                assert.ok(result.nonCrit !== result.crit, id + " exposes distinct crit and non-crit outcomes");

                if (requiredCondition) {
                    assert.equal(requiredCondition.activation.mode, "toggle");
                    assert.equal(requiredCondition.activation.default, false, "unproven first-application order stays off by default");
                    const conditionValue = requiredCondition.value.values[level - 1];
                    const activeNative = input.modifiers.find((modifier) => modifier.id === requiredCondition.id);
                    assert.ok(activeNative.enabled && activeNative.applicable && !activeNative.includedInFinalStats);
                    assertClose(activeNative.value, conditionValue, id + " matched-level native modifier");

                    const offInputs = { [requiredCondition.activation.inputKey]: false };
                    const missingInput = makeRequest(promoted, level, { ...config, enemyCount: 1 }, nativeCandidates(data, promoted, config, level, offInputs));
                    missingInput.modifierInputs = offInputs;
                    const rejected = engine.calculate(missingInput);
                    assert.equal(rejected.supported, false, id + " must reject the unproven first-application state");

                    const inclusionKey = requiredCondition.finalStatsInclusion.inputKey;
                    const includedInputs = { ...selectedInputs, [inclusionKey]: true };
                    const includedNative = nativeCandidates(data, promoted, config, level, includedInputs)
                        .find((modifier) => modifier.id === requiredCondition.id);
                    assert.ok(includedNative && includedNative.includedInFinalStats && !includedNative.enabled);
                    const includedConfig = { ...config, enemyCount: 1 };
                    if (requiredCondition.category === "defenseReduction") includedConfig.defenseReduction += conditionValue;
                    else if (requiredCondition.category === "takenDamage") includedConfig.takenDamage += conditionValue;
                    const includedInput = makeRequest(promoted, level, includedConfig, [includedNative]);
                    includedInput.modifierInputs = includedInputs;
                    const includedResult = assertMatchesIndependent(engine, includedInput, id + " Lv" + level + " included-in-final-input profile" + profileIndex);
                    assertClose(includedResult.expected, result.expected, id + " final-input inclusion does not double-add");
                }
            }
        }
    }
});

test("Round11 follow-up promotion retains its trigger boundary", () => {
    const followUp = readJson(promotionFile).overrides.find((attack) => attack.id === "140604");
    assert.equal(followUp.type, "followUp");
    assert.equal(followUp.traceKey, "talent");
    assert.equal(followUp.hitCount, 1);
    assert.match(followUp.conditionText, /お得意様/);
    assert.match(followUp.calculationNote, /条件成立済み/);
    assert.match(followUp.calculationNote, /ターンごとの発動上限追跡は再現しません/);
    const daliaSkill = readJson(promotionFile).overrides.find((attack) => attack.id === "132102");
    assert.match(daliaSkill.calculationNote, /超撃破は別成分/);
    assert.match(daliaSkill.calculationNote, /攻撃総合値として扱わない/);
});

test("Dalia and Serin skill effects require the known prior-state snapshot", () => {
    const modifiers = readJson(modifierFile).modifiers;
    const attacks = readJson(promotionFile).overrides;
    const dalia = modifiers.find((modifier) => modifier.source.skillId === "132103");
    const serin = modifiers.find((modifier) => modifier.source.skillId === "141002");
    assert.ok(dalia);
    assert.ok(serin);
    assert.equal(dalia.category, "defenseReduction");
    assert.deepEqual(dalia.value.values, [8, 9, 10, 11, 12, 13, 14.25, 15.5, 16.75, 18]);
    assert.equal(serin.category, "takenDamage");
    assert.deepEqual(serin.value.values, [10, 11, 12, 13, 14, 15, 16.25, 17.5, 18.75, 20]);
    for (const modifier of [dalia, serin]) {
        assert.equal(modifier.activation.default, false);
        assert.match(modifier.activation.conditionText, /計算対象のダメージより前に/);
        assert.match(modifier.provenance.scope, /未確定/);
        assert.equal(modifier.inputValidation.maximumEidolon, 0);
        assert.ok(modifier.finalStatsInclusion?.inputKey);
        const attack = attacks.find((item) => item.sourceSkillId === modifier.source.skillId);
        assert.ok(attack);
        assert.equal(attack.enforceSnapshotContract, true);
        assert.equal(attack.comparisonModifierInputs[modifier.activation.inputKey], true);
    }
});
