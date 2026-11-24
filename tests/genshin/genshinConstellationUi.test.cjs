const test = require("node:test");
const assert = require("node:assert/strict");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");
const {
    createScenarioHarness,
    prepareScenarioInputs
} = require("./helpers/calcScenarioHarness.cjs");

function constellationState(characterId, constellation = 6) {
    const harness = createScenarioHarness();
    prepareScenarioInputs(harness.elements, { characterId, constellation });
    const context = harness.sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    const state = harness.sandbox.GenshinCalcConditions.conditionPanelState(context, harness.calcData);
    return { harness, context, state, card: state.cards.find((card) => card.id === "constellation") };
}

test("Skirk C6 is one named section with one shared resource input", () => {
    const { card } = constellationState("10000114");
    const c6 = card.sections.find((section) => section.level === 6);
    assert.equal(c6.nameJa, "至源");
    assert.equal(JSON.stringify(c6.impactLabels), JSON.stringify([
        "専用効果「極悪技・斬」の獲得・消費",
        "元素爆発の追加ダメージ",
        "通常攻撃の追加ダメージ",
        "被弾時の反撃"
    ]));
    assert.equal(c6.controls.length, 1);
    assert.equal(c6.controls[0].label, "極悪技・斬の現在層数");
    assert.equal(c6.controls[0].unit, "層");
    assert.match(c6.controls[0].help, /元素爆発.*すべて消費/);
    assert.equal(c6.effects.length, 4);
    assert.equal(c6.effects.every((effect) => effect.description === ""), true);
});

test("all constellation sections have names, semantic impact labels, and deduplicated explained controls", () => {
    const harness = createScenarioHarness();
    const characters = harness.calcData.characters;
    const internalCategoryNames = new Set([
        "resourceGeneratedEffect", "resourceEffect", "extraDamage", "statBonus",
        "damageBonus", "reactionBonus", "scalingBonus", "effectOverride"
    ]);
    Object.keys(characters).forEach((characterId) => {
        prepareScenarioInputs(harness.elements, { characterId, constellation: 6 });
        const context = harness.sandbox.GenshinCalcEngine.buildCharacterCalcContext();
        const state = harness.sandbox.GenshinCalcConditions.conditionPanelState(context, harness.calcData);
        const card = state.cards.find((item) => item.id === "constellation");
        card.sections.forEach((section) => {
            assert.ok(section.nameJa && section.nameJa !== "星座効果", `${characterId} C${section.level} has no constellation name`);
            assert.ok(section.description, `${characterId} C${section.level} has no description`);
            assert.equal(section.impactLabels.some((label) => internalCategoryNames.has(label)), false);
            const controlKeys = section.controls.map((control) => `${control.type}:${control.key || control.id}`);
            assert.equal(new Set(controlKeys).size, controlKeys.length, `${characterId} C${section.level} has duplicate controls`);
            section.controls.forEach((control) => {
                assert.ok(control.label, `${characterId} C${section.level} has an unlabeled control`);
                assert.ok(control.help, `${characterId} C${section.level} ${control.label} has no help text`);
                if (control.type === "resource" || control.type === "stack") {
                    assert.ok(control.unit, `${characterId} C${section.level} ${control.label} has no unit`);
                    assert.ok(Number.isFinite(Number(control.min)), `${characterId} C${section.level} ${control.label} has no minimum`);
                }
            });
        });
    });
});

test("constellation data validation emits no user-facing JSON warning", () => {
    const sandbox = createBrowserScriptHarness(["games/js/genshinCalcData.js"]).sandbox;
    sandbox.console.warn = () => {};
    const warnings = sandbox.GenshinCalcData.validateCalcData(loadCalcData());
    assert.equal(warnings.filter((warning) => warning.message.includes("constellationModifiers")).length, 0);
});

test("Linnea C2 labels both scopes and displays their separate amounts", () => {
    const { sandbox, elements } = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js",
        "games/js/genshinCalcRenderer.js"
    ]);
    const calcData = loadCalcData();
    prepareScenarioInputs(elements, { characterId: "10000130", constellation: 3 });
    elements.genshinJsonConditionCards = { innerHTML: "" };
    const engine = sandbox.GenshinCalcEngine;
    const request = engine.buildCalculationRequestFromForm();
    const panel = sandbox.GenshinCalcConditions.conditionPanelState(request, calcData);
    const c2 = panel.cards.find((card) => card.id === "constellation").sections.find((section) => section.level === 2);
    const toggles = c2.controls.filter((control) => control.type === "toggle");
    assert.equal(toggles.length, 2);
    assert.match(toggles[0].label, /＋40%.*水・岩/);
    assert.match(toggles[0].help, /月籠の共鳴.*8秒間/);
    assert.match(toggles[1].label, /＋150%.*100万トンハンマー/);
    assert.match(toggles[1].help, /さいごのきりふだ形態/);
    for (const control of toggles) request.uiState.conditionByModifier[control.key].enabled = true;

    const renderer = sandbox.GenshinCalcRenderer;
    renderer.renderConditionCards(panel, request, calcData);
    assert.deepEqual(Array.from(c2.runtimeRows, (row) => row.value), [40, 150]);
    const result = engine.calculateDamageRequest(request, calcData).results.find((row) => row.entry.id === "100_damage");
    const detail = renderer.renderDamageBreakdown(result);
    assert.match(detail, /水・岩元素キャラクターの会心ダメージ/);
    assert.match(detail, /100万トンハンマーの会心ダメージ/);
});

test("Skirk C6 renderer outputs the description and shared input only once", () => {
    const elements = { genshinJsonConditionCards: { innerHTML: "" } };
    const harness = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js",
        "games/js/genshinCalcRenderer.js"
    ], elements);
    const calcData = loadCalcData();
    prepareScenarioInputs(elements, { characterId: "10000114", constellation: 6 });
    elements.genshinJsonConditionCards = { innerHTML: "" };
    const context = harness.sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    const state = harness.sandbox.GenshinCalcConditions.conditionPanelState(context, calcData);
    harness.sandbox.GenshinCalcRenderer.renderConditionCards(state, context);
    const html = elements.genshinJsonConditionCards.innerHTML;
    assert.equal((html.match(/data-constellation-level="C6"/g) || []).length, 1);
    assert.equal((html.match(/極悪技・斬の現在層数/g) || []).length, 1);
    assert.equal((html.match(/元素爆発極悪技・滅を発動時/g) || []).length, 1);
    assert.doesNotMatch(html, /genshin-constellation-summary/);
    assert.equal((html.match(/genshin-constellation-impact-row/g) || []).length >= 4, true);
    assert.doesNotMatch(html, /resourceGeneratedEffect|extraDamage/);
});
