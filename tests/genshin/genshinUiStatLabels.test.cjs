const test = require("node:test");
const assert = require("node:assert/strict");
const { createBrowserScriptHarness } = require("./helpers/browserScriptHarness.cjs");

test("内部stat識別子を維持しながら元素熟知を日本語表示する", () => {
    const { sandbox } = createBrowserScriptHarness([
        "games/js/genshinUiLabels.js",
        "games/js/genshinCalcRenderer.js"
    ]);

    assert.equal(sandbox.GenshinUiLabels.canonicalStatKey("elementalMastery"), "elementalMastery");
    assert.equal(sandbox.GenshinUiLabels.statLabel("elementalMastery"), "元素熟知");
    assert.equal(sandbox.GenshinUiLabels.statLabel("Elemental Mastery"), "元素熟知");
    assert.equal(sandbox.GenshinCalcRenderer.statLabel("elementalMastery"), "元素熟知");

    const result = {
        entry: { attackType: "skill", damageType: "skill", element: "草" },
        breakdown: {
            scalingParts: [{ stat: "elementalMastery", statValue: 500, talentMultiplier: 100, baseDamage: 500 }]
        }
    };
    const view = sandbox.GenshinCalcRenderer.buildDamageBreakdownViewModel(result);
    assert.equal(result.breakdown.scalingParts[0].stat, "elementalMastery");
    assert.equal(view.base.scalingParts[0].stat, "元素熟知");
});

test("同じstat label resolverで代表ステータスを日本語化する", () => {
    const { sandbox } = createBrowserScriptHarness(["games/js/genshinUiLabels.js"]);
    assert.deepEqual(
        JSON.parse(JSON.stringify(Object.fromEntries([
            "hp", "atk", "def", "critRate", "critDamage", "energyRecharge", "elementDamageBonus"
        ].map((key) => [key, sandbox.GenshinUiLabels.statLabel(key)])))),
        {
            hp: "HP",
            atk: "攻撃力",
            def: "防御力",
            critRate: "会心率",
            critDamage: "会心ダメージ",
            energyRecharge: "元素チャージ効率",
            elementDamageBonus: "元素ダメージ"
        }
    );
});
