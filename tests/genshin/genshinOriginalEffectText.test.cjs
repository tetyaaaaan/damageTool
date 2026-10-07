"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createScenarioHarness, prepareScenarioInputs } = require("./helpers/calcScenarioHarness.cjs");
const root = path.resolve(__dirname, "../..");

async function fixture(characterId = "10000140", weaponId = "14524") {
    const f = createScenarioHarness();
    f.sandbox.console = { ...console, log() {}, warn() {} };
    f.sandbox.fetch = async (url) => {
        const file = path.join(root, String(url));
        return { ok: fs.existsSync(file), status: 404, json: async () => JSON.parse(fs.readFileSync(file, "utf8")) };
    };
    for (const file of ["genshinIdResolver.js", "genshinCalcData.js", "genshinCalcRenderer.js"]) {
        vm.runInContext(fs.readFileSync(path.join(root, "games/js", file), "utf8"), f.sandbox);
    }
    await f.sandbox.GenshinIdResolver.ready;
    f.calcData = await f.sandbox.GenshinCalcData.loadGenshinCalcData();
    prepareScenarioInputs(f.elements, { characterId, weaponId, stats: { hp: 50500, baseHp: 15000, baseAtk: 900, atk: 2000 } });
    f.elements.genshinJsonConditionCards = { innerHTML: "" };
    return f;
}
function panel(f, request) {
    const context = request || f.sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    const state = f.sandbox.GenshinCalcConditions.conditionPanelState(context, f.calcData);
    f.sandbox.GenshinCalcRenderer.renderConditionCards(state, context);
    return { state, html: f.elements.genshinJsonConditionCards.innerHTML };
}

test("original provenance is explicit; modifier summaries and legacy full labels cannot establish it", async () => {
    const f = await fixture();
    const resolver = f.sandbox.GenshinIdResolver;
    const text = resolver.describeEffect({ data: { weaponEffects: { x: { effectTextTemplate: "編集した説明" } }, weaponModifiers: { x: { sourceText: "原文らしい説明" } } }, kind: "weapon", id: "x" });
    assert.equal(text.originalText, "");
    assert.equal(text.calculationSummary, "編集した説明");
    assert.equal(text.descriptionKind, "summary");
    const artifact = resolver.describeEffect({ data: f.calcData, kind: "artifact", id: "15048", pieceCount: 4 });
    assert.equal(artifact.originalText, f.calcData.originalEffectTexts.artifacts["15048"].fourPiece.originalText);
});

test("Hymn and Key sections display the full original once with Runtime impacts and current refinement", async () => {
    for (const [characterId, weaponId] of [["10000140", "14524"], ["10000003", "11511"]]) {
        const f = await fixture(characterId, weaponId);
        f.elements.genshinWeaponRefinement.value = "R5";
        const { state, html } = panel(f);
        const sections = state.cards.find((card) => card.id === "weapon").sections;
        assert.equal(sections.length, 1);
        assert.equal(sections[0].descriptionKind, "original");
        assert.equal(sections[0].description, f.sandbox.GenshinIdResolver.describeEffect({ data: f.calcData, kind: "weapon", id: weaponId, refinement: 5 }).originalText);
        assert.ok(sections[0].effects.length >= 2);
        assert.match(html, /計算への反映/);
        assert.match(html, /現在の精錬ランク R5 を使用/);
        assert.doesNotMatch(html, />全文<|>要約<|>自動説明</);
        assert.ok(!sections[0].description.includes("現在有効な蜜酒の層数"));
    }
});

test("character and both artifact sections use saved Japanese originals, not modifier descriptions", async () => {
    const f = await fixture();
    const meta = f.sandbox.GenshinCalcConditions.talentSourceMeta("talent:passive2", { characterId: "10000140" }, f.calcData, { effectDescription: "TETINET編集文" });
    assert.equal(meta.descriptionKind, "original");
    assert.equal(meta.description, f.calcData.originalEffectTexts.characters["10000140"].talents.passive2.originalText.replace(/\*\*/g, ""));
    for (const id of ["15047", "15048"]) {
        const context = f.sandbox.GenshinCalcEngine.buildCharacterCalcContext();
        context.artifactSetIds = [id]; context.artifactSetMode = "4pc";
        const { state } = panel(f, context);
        const sections = state.cards.find((card) => card.id === "artifact").sections;
        assert.equal(sections.length, 2);
        for (const section of sections) {
            const raw = f.calcData.originalEffectTexts.artifacts[id][section.pieceCount === 4 ? "fourPiece" : "twoPiece"];
            assert.equal(section.description, raw.originalText);
            assert.equal(section.descriptionKind, "original");
        }
    }
});

test("party provider displays the complete weapon original at its own refinement without changing inferred descriptions or damage", async () => {
    const f = await fixture("10000096", "");
    const request = f.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    request.party = { schemaVersion: 2, focusSlot: 1, conditionStates: {}, members: [
        { slot: 1, enabled: true, characterId: "10000096", level: 90, constellation: 0, stats: request.stats, buffStates: {}, equipment: { weaponId: "", refinement: 1, artifactSetIds: [] } },
        { slot: 2, enabled: true, characterId: "10000003", level: 90, constellation: 0, stats: { hp: 40000, atk: 2000, baseAtk: 900 }, buffStates: {}, equipment: { weaponId: "11511", refinement: 5, artifactSetIds: [] } }
    ] };
    const before = f.sandbox.GenshinCalcEngine.calculateDamageRequest(request, f.calcData);
    const { state, html } = panel(f, before.context);
    const candidate = state.partyModifiers.find((item) => item.sourceKind === "weapon");
    assert.ok(candidate);
    assert.match(candidate.description, /0\.2%/); // Inference continues to use the existing modifier text.
    assert.match(html, /HP\+40%/);
    assert.match(html, /0\.4%/);
    assert.match(html, /計算への反映/);
    const after = f.sandbox.GenshinCalcEngine.calculateDamageRequest(request, f.calcData);
    assert.equal(JSON.stringify(after.results), JSON.stringify(before.results));
});
