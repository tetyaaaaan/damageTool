const test = require("node:test");
const assert = require("node:assert/strict");
const {
    createBrowserScriptHarness,
    loadCalcData,
    setElement,
    setConditionElement
} = require("./helpers/browserScriptHarness.cjs");

function createHarness({ constellation = 0, hp = 40000 } = {}) {
    const harness = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]);
    const calcData = loadCalcData();
    harness.sandbox.GenshinCalcData = { loadGenshinCalcData: async () => calcData };
    const values = {
        genshinCalcCharacterId: "10000089",
        genshinCalcWeaponId: "",
        genshinReflectCharacter: "furina-current-calc",
        genshinReflectConstellation: `C${constellation}`,
        genshinJsonConstellationLevel: `C${constellation}`,
        genshinReflectLevel: 90,
        genshinWeaponRefinement: "R1",
        genshinNormalTalentLevel: 10,
        genshinSkillTalentLevel: 10,
        genshinBurstTalentLevel: 10,
        genshinHpInput: hp,
        genshinAtkInput: 1000,
        genshinDefInput: 1000,
        genshinElementalMasteryInput: 0,
        genshinCritRateInput: 0,
        genshinCritDamageInput: 0,
        genshinEnergyRechargeInput: 100,
        genshinElementalDamageInput: 0,
        e_lv: 90,
        e_res: 10,
        genshinJsonReactionOption: "none"
    };
    Object.entries(values).forEach(([id, value]) => setElement(harness.elements, id, value));
    setElement(harness.elements, "genshinJsonEnableCharacterCondition", "", true);
    [1, 2, 4, 6].forEach((level) => {
        setElement(harness.elements, `genshinJsonEnableConstellationC${level}`, "", level <= constellation);
    });
    return { ...harness, calcData };
}

function findResult(payload, effectId) {
    return payload.results.find((result) => result.entry.effectId === effectId || result.entry.id === effectId);
}

test("フリーナのアルケー追撃は水元素で、攻撃間隔はダメージ候補に含めない", async () => {
    const { sandbox, calcData } = createHarness();
    const normalEntries = calcData.talentScalings["10000089"].normalAttack.entries;
    const arkhe = normalEntries.find((entry) => entry.label === "霊息の棘/迸発の刃のダメージ");

    assert.equal(arkhe.element, "水");
    assert.equal(normalEntries.some((entry) => entry.source?.format === "I"), true);

    const payload = await sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    const result = payload.results.find((item) => item.entry.label === arkhe.label);
    assert.equal(result.entry.element, "水");
    assert.equal(payload.results.some((item) => /ダメージ間隔/.test(item.entry.label)), false);
});

test("HP50%以上の人数補正はサロンメンバー3種だけを元ダメージ110〜140%にする", async () => {
    const one = createHarness();
    const modifier = one.calcData.talentModifiers["10000089"].passives
        .find((passive) => passive.sourceId === "combat2").modifiers[0];
    const key = one.sandbox.GenshinModifierAnalyzer.modifierStateKey(modifier, "talent:combat2");
    setConditionElement(one.elements, key, "targetCount", 1);
    const onePayload = await one.sandbox.GenshinCalcEngine.runGenshinJsonCalc();

    const four = createHarness();
    setConditionElement(four.elements, key, "targetCount", 4);
    const fourPayload = await four.sandbox.GenshinCalcEngine.runGenshinJsonCalc();

    for (const effectId of ["damage_4", "damage_5", "damage_6"]) {
        const oneResult = findResult(onePayload, effectId);
        const fourResult = findResult(fourPayload, effectId);
        assert.equal(oneResult.breakdown.finalDamageMultiplier, 1.1);
        assert.equal(fourResult.breakdown.finalDamageMultiplier, 1.4);
        assert.ok(fourResult.nonCrit > oneResult.nonCrit);
    }
    assert.equal(findResult(onePayload, "damage_3").breakdown.finalDamageMultiplier, 1);
    assert.equal(findResult(fourPayload, "damage_3").breakdown.finalDamageMultiplier, 1);
});

test("固有天賦2は最大HP1000刻み・上限28%でサロンメンバーだけに適用する", async () => {
    const belowStep = createHarness({ hp: 39999 });
    const belowPayload = await belowStep.sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    const capped = createHarness({ hp: 40000 });
    const cappedPayload = await capped.sandbox.GenshinCalcEngine.runGenshinJsonCalc();

    assert.ok(Math.abs(findResult(belowPayload, "damage_4").breakdown.damageBonus - 27.3) < 1e-9);
    assert.equal(findResult(cappedPayload, "damage_4").breakdown.damageBonus, 28);
    assert.equal(findResult(cappedPayload, "damage_5").breakdown.damageBonus, 28);
    assert.equal(findResult(cappedPayload, "damage_6").breakdown.damageBonus, 28);
    assert.equal(findResult(cappedPayload, "damage_3").breakdown.damageBonus, 0);
    assert.equal(findResult(cappedPayload, "damage").breakdown.damageBonus, 0);
});

test("C6は共通18%とプネウマ追加25%を別効果として対象攻撃だけへ加算する", async () => {
    const common = createHarness({ constellation: 6, hp: 40000 });
    const commonPayload = await common.sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    assert.equal(findResult(commonPayload, "normal_1damage").breakdown.additiveBaseDamage, 7200);

    const pneuma = createHarness({ constellation: 6, hp: 40000 });
    const pneumaModifier = pneuma.calcData.constellationModifiers["10000089"].constellations["6"]
        .find((modifier) => modifier.id === "c_10000089_6_3_resolved_2");
    const pneumaKey = pneuma.sandbox.GenshinModifierAnalyzer.modifierStateKey(pneumaModifier, "constellation:C6");
    setConditionElement(pneuma.elements, pneumaKey, "option", "pneuma");
    const pneumaPayload = await pneuma.sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    const normal = findResult(pneumaPayload, "normal_1damage");

    assert.equal(normal.breakdown.additiveBaseDamage, 17200);
    assert.deepEqual(
        JSON.parse(JSON.stringify(normal.breakdown.appliedModifiers
            .filter((item) => ["c_10000089_6_1", "c_10000089_6_3_resolved_2"].includes(item.modifier.id))
            .map((item) => [item.modifier.id, item.value]))),
        [
            ["c_10000089_6_1", 7200],
            ["c_10000089_6_3_resolved_2", 10000]
        ]
    );
    assert.equal(findResult(pneumaPayload, "damage_3").breakdown.additiveBaseDamage, 0);
    assert.equal(findResult(pneumaPayload, "skilldamage").breakdown.additiveBaseDamage, 0);
});
