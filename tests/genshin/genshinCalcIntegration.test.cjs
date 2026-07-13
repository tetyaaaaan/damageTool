const test = require("node:test");
const assert = require("node:assert/strict");
const {
    createBrowserScriptHarness,
    loadCalcData,
    setElement,
    setConditionElement,
    setResourceElement
} = require("./helpers/browserScriptHarness.cjs");

function createCalcHarness() {
    const harness = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]);
    const calcData = loadCalcData();
    harness.sandbox.GenshinCalcData = { loadGenshinCalcData: async () => calcData };
    return { ...harness, calcData };
}

function prepareInputs(elements, { characterId, constellation, weaponId = "" }) {
    Object.keys(elements).forEach((key) => delete elements[key]);
    const values = {
        genshinCalcCharacterId: characterId,
        genshinCalcWeaponId: weaponId,
        genshinReflectCharacter: "test",
        genshinReflectConstellation: `C${constellation}`,
        genshinJsonConstellationLevel: "C6",
        genshinReflectLevel: 90,
        genshinWeaponRefinement: "R1",
        genshinNormalTalentLevel: 10,
        genshinSkillTalentLevel: 10,
        genshinBurstTalentLevel: 10,
        genshinHpInput: 20000,
        genshinAtkInput: 2000,
        genshinDefInput: 1000,
        genshinElementalMasteryInput: 100,
        genshinCritRateInput: 50,
        genshinCritDamageInput: 100,
        genshinEnergyRechargeInput: 100,
        genshinElementalDamageInput: 50,
        e_lv: 90,
        e_res: 10,
        genshinJsonReactionOption: "none"
    };
    Object.entries(values).forEach(([id, value]) => setElement(elements, id, value));
    setElement(elements, "genshinJsonEnableCharacterCondition", "", true);
    setElement(elements, "genshinJsonEnableWeaponLowHpCondition", "", true);
    [1, 2, 4, 6].forEach((level) => {
        setElement(elements, `genshinJsonEnableConstellationC${level}`, "", level <= constellation);
    });
}

test("命ノ星座は条件パネルの古い値ではなく計算入力欄から読む", () => {
    const { sandbox, elements } = createCalcHarness();
    prepareInputs(elements, { characterId: "10000002", constellation: 2 });
    const context = sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    assert.equal(context.constellation, 2);
});

test("共通解析層を通して元ダメージ型と構造化型の追加ダメージを計算する", async () => {
    let { sandbox, elements } = createCalcHarness();
    prepareInputs(elements, { characterId: "10000002", constellation: 2 });
    const ayaka = await sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    const ayakaExtra = ayaka.results.filter((result) => result.entry.group === "extraDamage");
    assert.equal(ayakaExtra.length, 2);
    assert.equal(ayakaExtra.every((result) => result.problems.length === 0 && result.nonCrit > 0), true);

    ({ sandbox, elements } = createCalcHarness());
    prepareInputs(elements, { characterId: "10000020", constellation: 6 });
    const razor = await sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    const razorExtra = razor.results.filter((result) => result.entry.group === "extraDamage");
    assert.equal(razorExtra.length, 1);
    assert.equal(razorExtra[0].problems.length, 0);
    assert.equal(razorExtra[0].nonCrit > 0, true);
});

test("補正ID単位で同じ条件を保持し、選択から消えた補正を削除する", () => {
    const { sandbox, elements, calcData } = createCalcHarness();
    prepareInputs(elements, { characterId: "10000002", constellation: 2 });
    let context = sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    const first = sandbox.GenshinCalcConditions.reconcileConditionState(context, calcData);
    const ayakaKey = Object.keys(first).find((key) => key.includes("constellation:C2"));
    assert.equal(Boolean(ayakaKey), true);
    assert.equal(first[ayakaKey].enabled, true);

    context = sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    const refreshed = sandbox.GenshinCalcConditions.reconcileConditionState(context, calcData);
    assert.equal(refreshed[ayakaKey].enabled, true);

    prepareInputs(elements, { characterId: "10000020", constellation: 6 });
    context = sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    const switched = sandbox.GenshinCalcConditions.reconcileConditionState(context, calcData);
    assert.equal(Object.hasOwn(switched, ayakaKey), false);
    assert.equal(Object.values(switched).some((state) => state.enabled), false);
});

test("null倍率とspecial追撃を計算せず理由付き候補に残す", async () => {
    const { sandbox, elements } = createCalcHarness();
    prepareInputs(elements, { characterId: "10000002", constellation: 0, weaponId: "11412" });
    const payload = await sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    const extraResults = payload.results.filter((result) => result.entry.group === "extraDamage");
    assert.equal(extraResults.length, 0);
    const nullCandidate = payload.candidateModifiers.find((item) => item.modifier.id === "w_11412_extraDamage_f23c5dd2");
    const specialCandidate = payload.candidateModifiers.find((item) => item.modifier.id === "w_11412_extra_damage_1");
    assert.equal(nullCandidate.reason, "追加ダメージの倍率または参照元データが不足しています");
    assert.equal(specialCandidate.reason, "special未対応");
});

test("同一効果グループの同じ追加ダメージを一度だけ収集する", () => {
    const { sandbox, elements } = createCalcHarness();
    prepareInputs(elements, { characterId: "10000002", constellation: 0, weaponId: "test-weapon" });
    const context = sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    const makeModifier = (id) => ({
        id,
        category: "extraDamage",
        scalings: [{ stat: "atk", value: 100 }],
        condition: "always",
        calculationSupport: "custom",
        uidHandling: "conditional"
    });
    const calcData = {
        talentModifiers: {},
        weaponModifiers: {
            "test-weapon": {
                modifiers: [makeModifier("duplicate_resolved_1"), makeModifier("duplicate_resolved_2")]
            }
        },
        artifactSetModifiers: {},
        constellationModifiers: {},
        weapons: {}
    };
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context);
    assert.equal(collected.applied.length, 1);
    assert.equal(collected.candidates.length, 1);
    assert.equal(collected.candidates[0].reason, "同一効果の計算済みレコードがあるため未適用");
});

test("自己攻撃力参照のadditiveBaseDamageを対象攻撃だけへ加算する", async () => {
    const { sandbox, elements } = createCalcHarness();
    prepareInputs(elements, { characterId: "10000002", constellation: 0 });
    setElement(elements, "genshinArtifactSetMode", "4pc");
    setElement(elements, "genshinArtifactSetOne", "15024");
    const payload = await sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    const normal = payload.results.find((result) => result.entry.attackType === "normalAttack");
    const skill = payload.results.find((result) => result.entry.attackType === "skill");
    assert.equal(normal.breakdown.additiveBaseDamage, 1400);
    assert.equal(skill.breakdown.additiveBaseDamage, 0);
    assert.equal(normal.breakdown.appliedModifiers.some((item) => item.modifier.id === "4pc_normal_attack_atk_additive_damage"), true);
});

test("明示されたcustom直接ステータス補正だけを計算へ適用する", async () => {
    const { sandbox, elements } = createCalcHarness();
    prepareInputs(elements, { characterId: "10000066", constellation: 2 });
    const payload = await sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    const result = payload.results.find((item) => item.entry.attackType === "normalAttack");
    assert.equal(result.breakdown.statBonus.hp, 10000);
    assert.equal(result.breakdown.appliedModifiers.some((item) => item.modifier.id === "c_10000066_2_1_resolved_2"), true);

    const unsafeHarness = createCalcHarness();
    prepareInputs(unsafeHarness.elements, { characterId: "10000023", constellation: 2 });
    const unsafe = await unsafeHarness.sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    const falseStat = unsafe.candidateModifiers.find((item) => item.modifier.id === "c_10000023_2_1_resolved_1");
    assert.equal(falseStat.reason, "custom statBonus の直接補正指定がありません");
});

test("自己ステータス参照のscalingBonusを対象ダメージ補正へ変換する", async () => {
    const { sandbox, elements } = createCalcHarness();
    prepareInputs(elements, { characterId: "10000002", constellation: 0 });
    setElement(elements, "genshinArtifactSetMode", "4pc");
    setElement(elements, "genshinArtifactSetOne", "15020");
    const payload = await sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    const normal = payload.results.find((result) => result.entry.attackType === "normalAttack");
    const burst = payload.results.find((result) => result.entry.attackType === "burst");
    assert.equal(normal.breakdown.appliedModifiers.some((item) => item.modifier.id === "4pc_burst_damage_bonus_from_er"), false);
    const emblem = burst.breakdown.appliedModifiers.find((item) => item.modifier.id === "4pc_burst_damage_bonus_from_er");
    assert.equal(emblem.value, 25);
});

test("記録治療量は専用入力がある時だけ加算ダメージへ使用する", async () => {
    let harness = createCalcHarness();
    prepareInputs(harness.elements, { characterId: "10000002", constellation: 0 });
    setElement(harness.elements, "genshinArtifactSetMode", "4pc");
    setElement(harness.elements, "genshinArtifactSetOne", "15033");
    let payload = await harness.sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    const missing = payload.candidateModifiers.find((item) => item.modifier.id === "4pc_recorded_healing_additive_damage");
    assert.equal(missing.reason, "記録治療量の専用入力がありません");

    harness = createCalcHarness();
    prepareInputs(harness.elements, { characterId: "10000002", constellation: 0 });
    setElement(harness.elements, "genshinArtifactSetMode", "4pc");
    setElement(harness.elements, "genshinArtifactSetOne", "15033");
    setElement(harness.elements, "genshinJsonRecordedHealing", 10000);
    payload = await harness.sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    const normal = payload.results.find((result) => result.entry.attackType === "normalAttack");
    assert.equal(normal.breakdown.additiveBaseDamage, 800);
});

test("記録治療量型の独立ダメージは上限適用後の固定ダメージを生成する", async () => {
    const { sandbox, elements } = createCalcHarness();
    prepareInputs(elements, { characterId: "10000002", constellation: 0 });
    setElement(elements, "genshinArtifactSetMode", "4pc");
    setElement(elements, "genshinArtifactSetOne", "15022");
    setElement(elements, "genshinJsonRecordedHealing", 40000);
    const payload = await sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    const foam = payload.results.find((result) => result.entry.effectId === "4pc_sea_dyed_foam_damage");
    assert.equal(foam.breakdown.scalingParts[0].baseDamage, 27000);
});

test("提供キャラクターの専用ステータス入力を加算ダメージへ使用する", async () => {
    const { sandbox, elements } = createCalcHarness();
    prepareInputs(elements, { characterId: "10000103", constellation: 4 });
    setElement(elements, "genshinJsonProviderDef", 3000);
    const payload = await sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    const normal = payload.results.find((result) => result.entry.attackType === "normalAttack");
    assert.equal(normal.breakdown.additiveBaseDamage, 1950);
});

test("構造化リソース効果を現在層数付きの計算入力として返す", async () => {
    const { sandbox, elements } = createCalcHarness();
    prepareInputs(elements, { characterId: "10000002", constellation: 0, weaponId: "11427" });
    const modifier = loadCalcData().weaponModifiers["11427"].modifiers
        .find((item) => item.category === "resourceGeneratedEffect");
    const key = sandbox.GenshinModifierAnalyzer.resourceStateKey(modifier, "weapon:11427", { characterId: "10000002" });
    setResourceElement(elements, key, 2);
    const payload = await sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    const resource = payload.resourceStateInputs.find((item) => item.id === "unityOrStalwartMark");
    assert.equal(resource.current, 2);
    assert.equal(resource.max, 3);
});

test("動的リソース状態は同じ安定キーだけを保持し、消えたキーを削除する", () => {
    const { sandbox, elements, calcData } = createCalcHarness();
    prepareInputs(elements, { characterId: "10000002", constellation: 0, weaponId: "11427" });
    const modifier = calcData.weaponModifiers["11427"].modifiers
        .find((item) => item.category === "resourceGeneratedEffect");
    const key = sandbox.GenshinModifierAnalyzer.resourceStateKey(modifier, "weapon:11427", { characterId: "10000002" });
    setResourceElement(elements, key, 2);
    let context = sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    let definitions = sandbox.GenshinCalcConditions.reconcileResourceState(context, calcData);
    assert.equal(definitions[0].value, 2);

    prepareInputs(elements, { characterId: "10000002", constellation: 0, weaponId: "11427" });
    context = sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    definitions = sandbox.GenshinCalcConditions.reconcileResourceState(context, calcData);
    assert.equal(definitions[0].value, 2);

    prepareInputs(elements, { characterId: "10000002", constellation: 0, weaponId: "" });
    context = sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    assert.equal(sandbox.GenshinCalcConditions.reconcileResourceState(context, calcData).length, 0);

    prepareInputs(elements, { characterId: "10000002", constellation: 0, weaponId: "11427" });
    context = sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    definitions = sandbox.GenshinCalcConditions.reconcileResourceState(context, calcData);
    assert.equal(definitions[0].value, null);
});

test("リソース消費層数を武器の1層ごとのステータス補正へ反映する", async () => {
    const { sandbox, elements, calcData } = createCalcHarness();
    prepareInputs(elements, { characterId: "10000002", constellation: 0, weaponId: "11427" });
    const generator = calcData.weaponModifiers["11427"].modifiers
        .find((item) => item.category === "resourceGeneratedEffect");
    const key = sandbox.GenshinModifierAnalyzer.resourceStateKey(generator, "weapon:11427", { characterId: "10000002" });
    setResourceElement(elements, key, 2);
    const payload = await sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    const normal = payload.results.find((result) => result.entry.attackType === "normalAttack");
    assert.equal(normal.breakdown.statBonus.elementalMastery, 80);
});

test("全消費リソースを自己防御力参照の加算ダメージへ反映する", async () => {
    const { sandbox, elements, calcData } = createCalcHarness();
    prepareInputs(elements, { characterId: "10000038", constellation: 2 });
    const generator = calcData.constellationModifiers["10000038"].constellations["2"]
        .find((item) => item.category === "resourceGeneratedEffect");
    const key = sandbox.GenshinModifierAnalyzer.resourceStateKey(generator, "constellation:C2", { characterId: "10000038" });
    setResourceElement(elements, key, 3);
    const payload = await sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    const burst = payload.results.find((result) => result.entry.attackType === "burst");
    assert.equal(burst.breakdown.additiveBaseDamage, 900);
});

test("リソース層数に応じた追撃倍率を生成する", async () => {
    const { sandbox, elements, calcData } = createCalcHarness();
    prepareInputs(elements, { characterId: "10000114", constellation: 6 });
    const generator = calcData.constellationModifiers["10000114"].constellations["6"]
        .find((item) => item.category === "resourceGeneratedEffect");
    const key = sandbox.GenshinModifierAnalyzer.resourceStateKey(generator, "constellation:C6", { characterId: "10000114" });
    setResourceElement(elements, key, 2);
    const payload = await sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    const extra = payload.results.find((result) => result.entry.effectId === "c_10000114_6_2_v10");
    assert.equal(extra.breakdown.scalingParts[0].talentMultiplier, 1500);
});

test("対象数・選択肢・チーム人数を補正キー単位の詳細条件として扱う", () => {
    const { sandbox, elements } = createCalcHarness();
    prepareInputs(elements, { characterId: "test-character", constellation: 0 });
    const targetModifier = {
        id: "target-count-bonus",
        category: "statBonus",
        applyTo: ["atkPercent"],
        unit: "percent",
        valueByCondition: { "1": 10, "2": 20, "3": 30 },
        conditionInput: { type: "targetCount", label: "命中した敵数", min: 1, max: 3 },
        condition: "conditional",
        calculationSupport: "custom",
        customCalculation: "directStatBonus",
        uidHandling: "conditional"
    };
    const optionModifier = {
        id: "option-bonus",
        category: "damageBonus",
        value: 10,
        applyTo: ["allDamageBonus"],
        conditionInput: { type: "option", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
        condition: "conditional",
        calculationSupport: "toggle",
        uidHandling: "conditional"
    };
    const partyModifier = {
        id: "party-count-bonus",
        category: "damageBonus",
        value: 10,
        applyTo: ["allDamageBonus"],
        conditionInput: { type: "partyCount", min: 1, max: 4 },
        condition: "conditional",
        calculationSupport: "toggle",
        uidHandling: "conditional"
    };
    const calcData = {
        talentModifiers: { "test-character": { passives: [{ sourceId: "combat1", modifiers: [targetModifier, optionModifier, partyModifier] }] } },
        weaponModifiers: {}, artifactSetModifiers: {}, constellationModifiers: {}, weapons: {}
    };
    const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(targetModifier, "talent:combat1");
    setConditionElement(elements, key, "targetCount", 2);
    const context = sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    sandbox.GenshinCalcConditions.reconcileConditionState(context, calcData);
    const definitions = sandbox.GenshinCalcConditions.reconcileComplexConditionState(context, calcData);
    assert.deepEqual(new Set(definitions.map((definition) => definition.type)), new Set(["targetCount", "option", "partyCount"]));
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context);
    assert.equal(collected.applied.find((item) => item.modifier.id === "target-count-bonus").value, 20);
});

test("実データの対象数条件は未入力時に停止し、入力値に対応する補正を使う", async () => {
    let harness = createCalcHarness();
    prepareInputs(harness.elements, { characterId: "10000088", constellation: 2 });
    let payload = await harness.sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    const missing = payload.candidateModifiers.find((item) => item.modifier.id === "c_10000088_2_1_resolved_1");
    assert.equal(missing.reason, "命中した敵数の入力がありません");

    harness = createCalcHarness();
    prepareInputs(harness.elements, { characterId: "10000088", constellation: 2 });
    const modifier = harness.calcData.constellationModifiers["10000088"].constellations["2"]
        .find((item) => item.id === "c_10000088_2_1_resolved_1");
    const key = harness.sandbox.GenshinModifierAnalyzer.modifierStateKey(modifier, "constellation:C2");
    setConditionElement(harness.elements, key, "targetCount", 3);
    payload = await harness.sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    const normal = payload.results.find((result) => result.entry.attackType === "normalAttack");
    assert.equal(normal.breakdown.statBonus.atk, 600);
});
