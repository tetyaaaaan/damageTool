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
