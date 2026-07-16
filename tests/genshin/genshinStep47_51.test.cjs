const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createBrowserScriptHarness, repositoryRoot } = require("./helpers/browserScriptHarness.cjs");

function mockResult(overrides = {}) {
    const { entry: entryOverrides = {}, breakdown: breakdownOverrides = {}, ...topOverrides } = overrides;
    const entry = {
        id: "normal_1damage",
        label: "1段ダメージ",
        attackType: "normalAttack",
        damageType: "normal",
        element: "physical",
        ...entryOverrides
    };
    return {
        entry,
        nonCrit: 1000,
        crit: 2500,
        expected: 1300,
        total: { nonCrit: 1000, crit: 2500, expected: 1300 },
        problems: [],
        breakdown: {
            talentLevel: 10,
            hitCount: 1,
            scalingParts: [{ stat: "atk", statValue: 2000, talentMultiplier: 100, baseDamage: 2000 }],
            damageBonus: 50,
            additiveBaseDamage: 0,
            finalDamageMultiplier: 1,
            effectOverrides: [],
            critRate: 20,
            critDamage: 150,
            defenseReduction: 20,
            defenseIgnore: 10,
            defenseMultiplier: 0.5789,
            resistance: 10,
            resistanceMultiplier: 0.9,
            reactionBonus: 0,
            reactionBaseDamageBonus: 0,
            reaction: { reactionId: "none", label: "反応なし", baseMultiplier: 1, elementalMasteryBonus: 0 },
            appliedModifiers: [],
            skippedModifiers: [],
            inputStats: { hp: 20000, atk: 2000, def: 800, elementalMastery: 0, critRate: 20, critDamage: 150, elementDamageBonus: 50 },
            ...breakdownOverrides
        },
        ...topOverrides
    };
}

function rendererHarness() {
    const resultWrap = {
        hidden: true,
        innerHTML: "",
        querySelectorAll() { return []; }
    };
    const sandbox = createBrowserScriptHarness(["games/js/genshinCalcRenderer.js"], {
        genshinJsonCalcResults: resultWrap
    }).sandbox;
    return { renderer: sandbox.GenshinCalcRenderer, resultWrap };
}

test("STEP47 groups normal, charged, and plunging results into one explicit basic tab", () => {
    const { renderer } = rendererHarness();
    assert.deepEqual(Array.from(renderer.RESULT_TABS, (tab) => [tab.id, tab.label]), [
        ["basic", "通常・重撃・落下"],
        ["skill", "元素スキル"],
        ["burst", "元素爆発"],
        ["reaction", "元素反応"],
        ["other", "その他"]
    ]);
    const cases = [
        ["normalAttack", "normal"],
        ["chargedAttack", "charged"],
        ["plungingAttack", "plunging"]
    ];
    cases.forEach(([attackType, damageType]) => {
        const result = mockResult({ entry: { attackType, damageType } });
        const before = JSON.stringify(result.entry);
        assert.equal(renderer.classifyResult(result), "basic");
        assert.equal(JSON.stringify(result.entry), before, `${attackType} remains an independent calculation type`);
    });
});

test("STEP48 renders a damage comparison table and only shows hit total for multi-hit attacks", () => {
    const { renderer, resultWrap } = rendererHarness();
    const single = mockResult();
    const multi = mockResult({
        entry: { id: "normal_2damage", label: "2段ダメージ" },
        total: { nonCrit: 2000, crit: 5000, expected: 2600 },
        breakdown: { hitCount: 2 }
    });
    renderer.renderDamageTabs({
        context: { characterId: "1", weaponId: "", reactionOption: { label: "反応なし" } },
        displayData: { characters: { 1: { nameJa: "テスト" } }, weapons: {} },
        results: [single, multi],
        inputNotices: []
    });
    assert.match(resultWrap.innerHTML, /<th scope="col">攻撃名<\/th>/);
    assert.match(resultWrap.innerHTML, /<th scope="col">非会心<\/th>/);
    assert.match(resultWrap.innerHTML, /<th scope="col">会心<\/th>/);
    assert.match(resultWrap.innerHTML, /<th scope="col">期待値<\/th>/);
    assert.doesNotMatch(resultWrap.innerHTML, /通常ダメージ/);
    assert.equal((resultWrap.innerHTML.match(/全ヒット期待値/g) || []).length, 1);
});

test("STEP49 builds a user-facing ordered breakdown without mutating calculation results", () => {
    const { renderer } = rendererHarness();
    const result = mockResult({
        breakdown: {
            additiveBaseDamage: 300,
            finalDamageMultiplier: 1.2,
            reactionBonus: 15,
            reaction: { reactionId: "melt", label: "溶解", baseMultiplier: 2, elementalMasteryBonus: 18.5 }
        }
    });
    const before = JSON.stringify(result);
    const view = renderer.buildDamageBreakdownViewModel(result);
    assert.equal(view.element, "物理");
    assert.equal(view.attackType, "通常攻撃");
    assert.equal(view.base.scalingParts[0].stat, "攻撃力");
    assert.equal(view.reaction.label, "溶解");
    assert.equal(view.enemy.defenseReduction, 20);
    assert.equal(view.special.visible, true);
    assert.equal(JSON.stringify(result), before);
});

test("STEP49-50 renders friendly sections and hides raw element enums from the user breakdown", () => {
    const { renderer } = rendererHarness();
    const html = renderer.renderDamageBreakdown(mockResult());
    assert.match(html, /計算の流れ/);
    assert.match(html, /1\. 基礎ダメージ/);
    assert.match(html, /2\. ダメージバフ/);
    assert.match(html, /3\. 敵への補正/);
    assert.match(html, /4\. 会心/);
    assert.match(html, /攻撃力/);
    assert.match(html, /敵の物理耐性/);
    assert.doesNotMatch(html, />physical</);
    assert.match(html, /検証用データを見る/);
    assert.doesNotMatch(html, /詳細データ・検証情報/);
});

test("STEP48 places one compact detail toggle beside each attack name", () => {
    const { renderer, resultWrap } = rendererHarness();
    renderer.renderDamageTabs({
        context: { characterId: "1", weaponId: "", reactionOption: { label: "反応なし" } },
        displayData: { characters: { 1: { nameJa: "テスト" } }, weapons: {} },
        results: [mockResult()],
        inputNotices: []
    });
    assert.match(resultWrap.innerHTML, /class="genshin-result-attack-head"/);
    assert.match(resultWrap.innerHTML, /aria-label="1段ダメージの詳細"/);
    assert.match(resultWrap.innerHTML, /<span>詳細<\/span><span class="genshin-detail-toggle-icon" aria-hidden="true">▼<\/span>/);
    assert.match(resultWrap.innerHTML, /class="genshin-damage-detail-row"[^>]*hidden/);
    assert.doesNotMatch(resultWrap.innerHTML, /計算の流れを見る/);
});

test("STEP50 renders constant basic subtabs without counts and accessible relationships", () => {
    const { renderer, resultWrap } = rendererHarness();
    renderer.renderDamageTabs({
        context: { characterId: "1", weaponId: "", reactionOption: { label: "反応なし" } },
        displayData: { characters: { 1: { nameJa: "テスト" } }, weapons: {} },
        results: [
            mockResult(),
            mockResult({ entry: { id: "aimed", label: "狙い撃ち", attackType: "chargedAttack", damageType: "charged" } }),
            mockResult({ entry: { id: "plunge", label: "落下中", attackType: "plungingAttack", damageType: "plunging" } })
        ],
        inputNotices: []
    });
    assert.match(resultWrap.innerHTML, /通常・重撃・落下/);
    assert.match(resultWrap.innerHTML, /data-basic-tab="normal">通常攻撃<\/button>/);
    assert.match(resultWrap.innerHTML, /data-basic-tab="charged">重撃<\/button>/);
    assert.match(resultWrap.innerHTML, /data-basic-tab="plunging">落下攻撃<\/button>/);
    assert.match(resultWrap.innerHTML, /data-basic-panel="normal"/);
    assert.match(resultWrap.innerHTML, /data-basic-panel="charged"/);
    assert.match(resultWrap.innerHTML, /data-basic-panel="plunging"/);
    assert.doesNotMatch(resultWrap.innerHTML, /通常攻撃\s*\(\d+\)/);
    assert.match(resultWrap.innerHTML, /role="tab" aria-selected="true"/);
    assert.match(resultWrap.innerHTML, /role="tabpanel"/);
    assert.doesNotMatch(resultWrap.innerHTML, /data-json-tab="charged"/);
});

test("STEP50 keeps every basic subtab visible and explains an empty attack type", () => {
    const { renderer, resultWrap } = rendererHarness();
    renderer.renderDamageTabs({
        context: { characterId: "1", weaponId: "", reactionOption: { label: "反応なし" } },
        displayData: { characters: { 1: { nameJa: "テスト" } }, weapons: {} },
        results: [mockResult()],
        inputNotices: []
    });
    assert.match(resultWrap.innerHTML, /data-basic-tab="charged">重撃<\/button>/);
    assert.match(resultWrap.innerHTML, /計算可能な重撃データがありません。/);
    assert.match(resultWrap.innerHTML, /計算可能な落下攻撃データがありません。/);
});

test("STEP47-51 design and responsive equal-width CSS are committed", () => {
    const css = fs.readFileSync(path.join(repositoryRoot, "games/css/tetinet.css"), "utf8");
    const design = fs.readFileSync(path.join(repositoryRoot, "docs/GENSHIN_CALC_STEP47_51.md"), "utf8");
    assert.match(css, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(css, /@media \(max-width: 980px\)[\s\S]*?\.genshin-tool-grid\s*\{\s*grid-template-columns: 1fr/);
    assert.match(css, /\.genshin-damage-table[\s\S]*?table-layout: fixed/);
    assert.match(css, /\.genshin-result-attack-head strong\s*\{[\s\S]*font-size:\s*0\.78rem/);
    assert.match(css, /\.genshin-json-breakdown\s*\{[\s\S]*font-size:\s*0\.74rem/);
    assert.match(css, /\.genshin-json-calc-results \+ \.genshin-info-box\s*\{[\s\S]*margin-top:\s*22px/);
    assert.match(css, /@media \(max-width: 560px\)[\s\S]*?\.genshin-damage-result-row\s*\{[\s\S]*?grid-template-columns: repeat\(3/);
    assert.match(design, /STEP47: レイアウトと表示グループ/);
    assert.match(design, /STEP51: 検証/);
});
