"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createScenarioHarness, prepareScenarioInputs } = require("./helpers/calcScenarioHarness.cjs");
const root = path.resolve(__dirname, "../..");

test("public state controls offer automatic restoration without developer JSON actions", () => {
    const html = fs.readFileSync(path.join(root, "games/genshin/index.html"), "utf8");
    assert.doesNotMatch(html, /id="genshinCurrentCalc(?:Export|Import|File)"/);
    assert.match(html, /id="genshinCurrentCalcStateMessage"/);
    assert.match(html, /前回入力.*自動保存/);
});

test("calculable provisional status and diagnostic keys remain internal", () => {
    const { sandbox, elements } = fixture();
    const classes = new Set();
    const wrap = elements.genshinJsonCalcWarnings = {
        innerHTML: "", hidden: false,
        classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } }
    };
    sandbox.GenshinCalcRenderer.renderWarnings([
        { level: "warn", message: "weaponModifiers.14524.provisional71_w14524_atk_pending" },
        { level: "warn", message: "/games/genshin/data/weapon-effects.json" },
        { level: "warn", message: "stellarSwirl / cryo" },
        { level: "info", message: "この武器効果の一部は暫定仕様で計算しています。" },
        { level: "info", message: "この武器効果の一部は暫定仕様で計算しています。" }
    ]);
    assert.equal(wrap.hidden, true);
    assert.ok(!classes.has("is-provisional"));
    assert.equal(wrap.innerHTML, "");
    assert.doesNotMatch(wrap.innerHTML, /weaponModifiers|provisional71|\.json|stellarSwirl|cryo/);
});

function fixture(characterId = "10000096", constellation = 6) {
    const harness = createScenarioHarness();
    prepareScenarioInputs(harness.elements, { characterId, constellation });
    ["genshinDataContract.js", "genshinCalcData.js", "genshinCalcRenderer.js"].forEach((file) => {
        vm.runInContext(fs.readFileSync(path.join(root, "games/js", file), "utf8"), harness.sandbox);
    });
    harness.sandbox.GenshinCalcData.applyProvisional70Data(harness.calcData, [
        JSON.parse(fs.readFileSync(path.join(root, "games/genshin/data/v2/candidates/7.0-provisional-weapons.json")))
    ], []);
    harness.elements.genshinJsonConditionCards = { innerHTML: "", dataset: {} };
    harness.elements.genshinConditionTabs = { innerHTML: "" };
    const request = harness.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    const render = () => {
        const panel = harness.sandbox.GenshinCalcConditions.conditionPanelState(request, harness.calcData);
        harness.sandbox.GenshinCalcRenderer.renderConditionCards(panel, request);
        return { panel, html: harness.elements.genshinJsonConditionCards.innerHTML };
    };
    return { ...harness, request, render };
}

test("Fanfare distinguishes level coefficient, current total and constellation cap without changing the modifier", () => {
    const { sandbox, calcData } = fixture();
    const modifier = calcData.talentModifiers["10000089"].passives.flatMap((p) => p.modifiers).find((m) => m.valueByLevelPerStack);
    const before = JSON.stringify(modifier);
    for (const [constellation, maximum] of [[0, 75], [1, 100]]) {
        const text = sandbox.GenshinCalcConditions.modifierEffectSummary(modifier, { talentLevels: { burst: 10 }, constellation }, { resolvedValue: 75, stack: 300 });
        assert.match(text, /1テンションにつき\+0.25%/);
        assert.match(text, /現在の合計\+75%/);
        assert.ok(text.includes(`で+${maximum}%`));
        assert.doesNotMatch(text, /22500|75%／層/);
    }
    assert.equal(JSON.stringify(modifier), before);
});

test("condition inputs retain the declared decimal step and concise constellation names", () => {
    const { html, panel } = fixture().render();
    const bond = panel.complexConditionInputs.find((input) => input.label === "現在の命の契約");
    assert.equal(bond.step, 0.1);
    assert.match(html, /data-genshin-condition-kind="stack"[^>]*step="0.1"/);
    assert.match(html, /C2追加攻撃を適用/);
    assert.match(html, /C6会心補正を適用/);
    assert.doesNotMatch(html, /追加ダメージの追加ダメージ/);
});

test("party cards name the provider, recipient and the specific salon attacks", () => {
    const f = fixture("10000052", 4);
    const member = { slot: 2, enabled: true, characterId: "10000089", nameJa: "フリーナ", level: 90, constellation: 0, stats: { hp: 40000 }, equipment: {} };
    f.request.party = { schemaVersion: 2, members: [member], conditionStates: {}, resonanceStates: {} };
    const panel = f.sandbox.GenshinCalcConditions.conditionPanelState(f.request, f.calcData);
    const modifier = f.calcData.talentModifiers["10000089"].passives.flatMap((p) => p.modifiers).find((m) => m.id?.includes("passive2_salon"));
    panel.partyModifiers = [{ key: "salon", member, modifier, sourceName: "サロンメンバー補正", targetOwner: "activeCharacter", status: "ready", enabled: true, automatic: true, providerContext: { stats: { hp: 40000 } } }];
    f.sandbox.GenshinCalcRenderer.renderConditionCards(panel, f.request);
    const html = f.elements.genshinJsonConditionCards.innerHTML;
    assert.match(html, /<dt>提供者<\/dt><dd>フリーナ/);
    assert.match(html, /<dt>受け手<\/dt><dd>フリーナの対象攻撃/);
    assert.match(html, /ジェントルマン/);
    assert.doesNotMatch(html, /damage_4|targetOwner|targetEffect/);
});

test("display rounding removes binary tails without losing small coefficients", () => {
    const { sandbox } = fixture();
    const c = sandbox.GenshinCalcConditions;
    assert.equal(c.formatDisplayNumber(0.2 * 3), "0.6");
    assert.equal(c.formatDisplayNumber(0.0025), "0.0025");
    assert.equal(c.formatDisplayNumber(300), "300");
    assert.match(c.modifierEffectSummary({ category: "scalingBonus", valueByRefinementPerStack: { 1: 0.2 }, stack: { max: 3 }, applyTo: ["elementalMastery"] }, { refinement: 1 }), /最大\+0.6%/);
});

test("11435 current reflection contains only the selected endpoint and explains the limitation", () => {
    const f = fixture("10000089", 0);
    f.request.weaponId = "11435";
    f.request.stats.baseAtk = 1000;
    let panel = f.render().panel;
    const definition = panel.complexConditionInputs.find((input) => input.source === "weapon:11435");
    assert.ok(definition);
    for (const option of definition.options) {
        const value = typeof option === "object" ? option.value : option;
        f.request.uiState.complexConditionByModifier[definition.key] = { option: value };
        const { html } = f.render();
        const weaponHtml = html.split('data-condition-card="weapon"')[1].split('data-condition-card="artifact"')[0];
        const current = weaponHtml.match(/<dt>現在の反映<\/dt><dd>(.*?)<\/dd>/)?.[1];
        assert.ok(current);
        assert.equal((current.match(/\+18%|\+36%/g) || []).length, 1, current);
        assert.match(weaponHtml, /中間距離の対応式は仕様確認中/);
    }
});

test("condition tabs render a single keyboard tab stop with the tablist contract", () => {
    const f = fixture(); f.render();
    assert.equal((f.elements.genshinConditionTabs.innerHTML.match(/tabindex="0"/g) || []).length, 1);
    assert.equal((f.elements.genshinConditionTabs.innerHTML.match(/tabindex="-1"/g) || []).length, 5);
    const html = fs.readFileSync(path.join(root, "games/genshin/index.html"), "utf8");
    assert.match(html, /id="genshinConditionTabs" role="tablist"/);
});
