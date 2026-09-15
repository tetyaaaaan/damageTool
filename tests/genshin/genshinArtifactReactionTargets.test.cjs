"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createBrowserScriptHarness, loadCalcData } = require("./helpers/browserScriptHarness.cjs");

function harness() {
    const sandbox = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinPartyState.js",
        "games/js/genshinPartyModifiers.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
    return { sandbox, calcData: loadCalcData() };
}

function context(setId, characterElement) {
    return {
        characterId: "test-holder",
        characterElement,
        weaponId: "",
        refinement: 1,
        artifactSetMode: "4pc",
        artifactSetIds: [setId],
        constellation: 0,
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        stats: {
            hp: 20000, baseHp: 10000, atk: 2000, baseAtk: 1000,
            def: 1000, baseDef: 500, elementalMastery: 0,
            energyRecharge: 100, critRate: 5, critDamage: 50, elementDamageBonus: 0
        },
        enemy: { defenseReduction: 0, defenseIgnore: 0, resistance: { base: { defaultElemental: 10, physical: 10, byElement: {} }, manualDebuff: { allElemental: 0, physical: 0, byElement: {} } }, immunities: [] },
        manualInputs: { providerStats: {}, resourceStates: {} },
        uiState: {
            stackByModifier: {}, resolvedConditionByModifier: {}, conditionByModifier: {},
            toggleByModifier: {}, complexConditionByModifier: {}
        },
        party: {
            members: [{ slot: 1, enabled: true, characterId: "test-holder", element: characterElement }]
        },
        mode: "manualMode"
    };
}

function setOption(sandbox, calcContext, rawModifier, source, option) {
    const normalized = sandbox.GenshinCalcEngine.normalizeArtifactModifier(rawModifier, source, calcContext);
    const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(normalized, source);
    const state = { enabled: option !== "inactive", option, stack: 0 };
    calcContext.uiState.conditionByModifier[key] = state;
    calcContext.uiState.complexConditionByModifier[key] = state;
    return { normalized, key };
}

function damageBonus(sandbox, calcData, calcContext, element) {
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
    const entry = { id: `test-${element}`, attackType: "skill", damageType: "skill", element, scalings: [] };
    return sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(entry, calcContext, collected).totals.damageBonus;
}

test("悠久の磐岩は装備者が取得した結晶片の1元素だけを対象にする", () => {
    const { sandbox, calcData } = harness();
    const calcContext = context("15014", "岩");
    const modifier = calcData.artifactSetModifiers["15014"].fourPiece[0];
    setOption(sandbox, calcContext, modifier, "artifact4:15014", "shard|hydro");

    assert.equal(damageBonus(sandbox, calcData, calcContext, "水"), 35);
    assert.equal(damageBonus(sandbox, calcData, calcContext, "炎"), 0);
    assert.equal(damageBonus(sandbox, calcData, calcContext, "岩"), 15, "2セット効果だけを維持する");
});

test("悠久の磐岩の月結晶経路は水元素だけを対象にし未発動は安全に0になる", () => {
    const { sandbox, calcData } = harness();
    const calcContext = context("15014", "岩");
    const modifier = calcData.artifactSetModifiers["15014"].fourPiece[0];
    setOption(sandbox, calcContext, modifier, "artifact4:15014", "lunarCrystallize|hydro");
    assert.equal(damageBonus(sandbox, calcData, calcContext, "水"), 35);
    assert.equal(damageBonus(sandbox, calcData, calcContext, "岩"), 15, "月結晶でも4セット効果を岩へ漏らさない");

    setOption(sandbox, calcContext, modifier, "artifact4:15014", "inactive");
    assert.equal(damageBonus(sandbox, calcData, calcContext, "水"), 0);
});

test("絵巻は装備者元素で反応候補を絞り対象元素を自動導出する", () => {
    const { sandbox } = harness();
    const anemoOptions = sandbox.GenshinCalcEngine.artifactReactionOptions("anemo").map((option) => option.value);
    assert.ok(anemoOptions.includes("normal|swirl|hydro"));
    assert.ok(anemoOptions.includes("nightsoul|swirl|pyro"));
    assert.equal(anemoOptions.some((value) => value.includes("overload")), false);

    const electroOptions = sandbox.GenshinCalcEngine.artifactReactionOptions("electro").map((option) => option.value);
    assert.ok(electroOptions.includes("normal|hyperbloom|"));
    assert.ok(electroOptions.includes("normal|aggravate|"));
});

test("既存の聖遺物条件カードへ対象元素ではなく発動反応の選択肢を出す", () => {
    const { sandbox, calcData } = harness();
    const calcContext = context("15037", "風");
    const panel = sandbox.GenshinCalcConditions.conditionPanelState(calcContext, calcData);
    const artifactCard = panel.cards.find((card) => card.id === "artifact");
    const section = artifactCard.sections.find((item) => item.setId === "15037" && item.pieceCount === 4);
    assert.ok(section);
    assert.equal(section.controls.length, 1, "12%と夜魂28%は同じ発動状態を共有する");
    const control = section.controls[0];
    assert.match(control.label, /装備者が起こした反応/);
    const values = control.options.map((option) => option.value);
    assert.ok(values.includes("normal|swirl|hydro"));
    assert.ok(values.includes("nightsoul|swirl|hydro"));
    assert.equal(values.some((value) => value.includes("overload")), false);
    assert.equal(values.some((value) => /target|bonus/i.test(value)), false, "バフ対象元素を直接入力させない");
});

test("絵巻の拡散は風と選択した相手元素だけに適用する", () => {
    const { sandbox, calcData } = harness();
    const calcContext = context("15037", "風");
    const modifiers = calcData.artifactSetModifiers["15037"].fourPiece;
    modifiers.forEach((modifier) => setOption(sandbox, calcContext, modifier, "artifact4:15037", "normal|swirl|hydro"));

    assert.equal(damageBonus(sandbox, calcData, calcContext, "風"), 12);
    assert.equal(damageBonus(sandbox, calcData, calcContext, "水"), 12);
    assert.equal(damageBonus(sandbox, calcData, calcContext, "炎"), 0);
});

test("絵巻の超開花と超激化は派生反応の対象元素表を使う", () => {
    const { sandbox, calcData } = harness();
    const calcContext = context("15037", "雷");
    const modifiers = calcData.artifactSetModifiers["15037"].fourPiece;

    modifiers.forEach((modifier) => setOption(sandbox, calcContext, modifier, "artifact4:15037", "normal|hyperbloom|"));
    assert.equal(damageBonus(sandbox, calcData, calcContext, "雷"), 12);
    assert.equal(damageBonus(sandbox, calcData, calcContext, "草"), 12);
    assert.equal(damageBonus(sandbox, calcData, calcContext, "水"), 0);

    modifiers.forEach((modifier) => setOption(sandbox, calcContext, modifier, "artifact4:15037", "normal|aggravate|"));
    assert.equal(damageBonus(sandbox, calcData, calcContext, "雷"), 12);
    assert.equal(damageBonus(sandbox, calcData, calcContext, "草"), 12);
});

test("絵巻の夜魂状態は同じ反応選択から12%+28%を適用する", () => {
    const { sandbox, calcData } = harness();
    const calcContext = context("15037", "岩");
    const modifiers = calcData.artifactSetModifiers["15037"].fourPiece;
    modifiers.forEach((modifier) => setOption(sandbox, calcContext, modifier, "artifact4:15037", "nightsoul|crystallize|pyro"));

    assert.equal(damageBonus(sandbox, calcData, calcContext, "岩"), 40);
    assert.equal(damageBonus(sandbox, calcData, calcContext, "炎"), 40);
    assert.equal(damageBonus(sandbox, calcData, calcContext, "水"), 0);
});

test("絵巻は装備者元素と矛盾する状態や未知反応をfail-closedにする", () => {
    const { sandbox, calcData } = harness();
    const calcContext = context("15037", "岩");
    const modifiers = calcData.artifactSetModifiers["15037"].fourPiece;

    for (const option of ["normal|vaporize|", "normal|unknownReaction|"]) {
        modifiers.forEach((modifier) => setOption(sandbox, calcContext, modifier, "artifact4:15037", option));
        assert.equal(damageBonus(sandbox, calcData, calcContext, "炎"), 0);
        assert.equal(damageBonus(sandbox, calcData, calcContext, "岩"), 0);
    }
});

test("雷のような怒りと影に沈む幻の既存星電導補正は星拡散へ漏れない", () => {
    const { sandbox, calcData } = harness();
    const stellarConduct = calcData.reactionDefinitions.options.stellarConduct;
    const stellarSwirl = calcData.reactionDefinitions.options.stellarSwirl;
    const thunderingFury = calcData.artifactSetModifiers["15005"].fourPiece
        .find((item) => item.id === "4pc_lunar_charged_and_superconduct_bonus");
    const silkenMoon = calcData.artifactSetModifiers["15046"].fourPiece
        .find((item) => item.id === "4pc_lunar_superconduct_damage_bonus");

    for (const modifier of [thunderingFury, silkenMoon]) {
        assert.equal(sandbox.GenshinCalcEngine.reactionBonusApplies(modifier, stellarConduct), true);
        assert.equal(sandbox.GenshinCalcEngine.reactionBonusApplies(modifier, stellarSwirl), false);
    }
    assert.equal(stellarSwirl.calculationStatus, "dedicatedFormulaRequired");
});

test("影に沈む幻の会心条件は超電導または星電導として表示する", () => {
    const { sandbox, calcData } = harness();
    const calcContext = context("15046", "氷");
    const panel = sandbox.GenshinCalcConditions.conditionPanelState(calcContext, calcData);
    const artifactCard = panel.cards.find((card) => card.id === "artifact");
    const section = artifactCard.sections.find((item) => item.setId === "15046" && item.pieceCount === 4);
    const control = section.controls.find((item) => /超電導または星電導/.test(item.label || ""));
    assert.ok(control);
    assert.match(control.label, /超電導または星電導/);
    assert.doesNotMatch(control.label, /月感電/);
});
