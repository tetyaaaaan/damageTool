const test = require("node:test");
const assert = require("node:assert/strict");
const { createBrowserScriptHarness, readJson } = require("./helpers/browserScriptHarness.cjs");

function loadAnalyzer() {
    return createBrowserScriptHarness(["games/js/genshinModifierAnalyzer.js"]).sandbox.GenshinModifierAnalyzer;
}

function findObject(value, predicate) {
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findObject(item, predicate);
            if (found) return found;
        }
        return null;
    }
    if (!value || typeof value !== "object") return null;
    if (predicate(value)) return value;
    for (const item of Object.values(value)) {
        const found = findObject(item, predicate);
        if (found) return found;
    }
    return null;
}

test("nullの追加ダメージ倍率を計算可能と判定しない", () => {
    const analyzer = loadAnalyzer();
    const modifier = {
        id: "null-extra-damage",
        category: "extraDamage",
        value: null,
        reference: { stat: "atk" },
        sourceText: "攻撃力100%分のダメージを与える"
    };
    assert.equal(analyzer.hasComputableExtraDamage(modifier), false);
    const analysis = analyzer.analyzeModifier({ modifier, source: "weapon:1", context: { mode: "uidMode" } });
    assert.equal(analysis.status, "invalidData");
    assert.equal(analysis.supportStatus, "invalidData");
});

test("元ダメージ参照型の追加ダメージを解析する", () => {
    const analyzer = loadAnalyzer();
    const data = readJson("games/genshin/data/calc/constellation-modifiers.json");
    const modifier = data["10000002"].constellations["2"][0];
    const analysis = analyzer.analyzeModifier({
        modifier,
        source: "constellation:C2",
        context: { mode: "uidMode" }
    });
    assert.equal(analysis.calculable, true);
    assert.equal(analysis.calculation, "extraDamage");
    assert.equal(analyzer.extraDamageBaseAttackType(modifier), "burst");
});

test("効果対象を持つeffectOverrideを解析する", () => {
    const analyzer = loadAnalyzer();
    const data = readJson("games/genshin/data/calc/constellation-modifiers.json");
    const modifier = data["10000128"].constellations["1"][0];
    const resourceKey = analyzer.resourceStateKey(modifier, "constellation:C1", { characterId: "10000128" });
    const analysis = analyzer.analyzeModifier({
        modifier,
        source: "constellation:C1",
        context: { mode: "uidMode", characterId: "10000128", manualInputs: { resourceStates: { [resourceKey]: 1 } } }
    });
    assert.equal(analysis.calculable, true);
    assert.equal(analysis.calculation, "effectOverride");
    assert.equal(analyzer.classifyEffectOverride(modifier), "calculable");
});

test("effectOverrideは空のvalueより有効なeffectMultiplierを使用する", () => {
    const analyzer = loadAnalyzer();
    const modifier = {
        category: "effectOverride",
        unit: "percentOfOriginalDamage",
        value: "",
        effectMultiplier: 200
    };
    assert.equal(analyzer.hasComputableEffectOverride(modifier), true);
    assert.equal(analyzer.effectOverrideValue(modifier), 200);
});

test("計算可能性と入力ポリシーを分離する", () => {
    const analyzer = loadAnalyzer();
    const modifier = {
        id: "manual-extra-damage",
        category: "extraDamage",
        scalings: [{ stat: "atk", value: 100 }],
        uidHandling: "manualOnly",
        condition: "always"
    };
    const analysis = analyzer.analyzeModifier({ modifier, source: "weapon:1", context: { mode: "uidMode" } });
    assert.equal(analysis.calculable, true);
    assert.equal(analysis.inputStatus, "manualOnly");
    assert.equal(analysis.inputReason, "manualOnlyのため未適用");
    assert.equal(analysis.status, "manualOnly");
    assert.equal(analysis.requiresConditionEvaluation, false);
});

test("入力へ反映済みの種類ごとに理由を保持する", () => {
    const analyzer = loadAnalyzer();
    const stats = analyzer.analyzeModifier({
        modifier: { category: "statBonus", uidHandling: "includedInUidStats" },
        context: { mode: "uidMode" }
    });
    const talent = analyzer.analyzeModifier({
        modifier: { category: "talentLevelBonus", uidHandling: "includedInUidTalentLevels" },
        context: { mode: "uidMode" }
    });
    assert.equal(stats.inputStatus, "includedInInput");
    assert.equal(stats.inputReason, "includedInUidStatsのため未適用");
    assert.equal(talent.inputStatus, "includedInInput");
    assert.equal(talent.inputReason, "UID天賦Lv反映済みの可能性があるため未適用");
});

test("resolved分割レコードを同じ効果グループへ正規化する", () => {
    const analyzer = loadAnalyzer();
    const first = analyzer.analyzeModifier({
        modifier: { id: "c_effect_resolved_1", category: "extraDamage", scalings: [{ stat: "atk", value: 100 }] },
        source: "constellation:C2"
    });
    const second = analyzer.analyzeModifier({
        modifier: { id: "c_effect_resolved_2", category: "extraDamage", scalings: [{ stat: "atk", value: 100 }] },
        source: "constellation:C2"
    });
    assert.equal(first.effectGroupKey, second.effectGroupKey);
    assert.equal(analyzer.modifierDedupeKey(first), analyzer.modifierDedupeKey(second));
});

test("全補正JSONを例外なく解析できる", () => {
    const analyzer = loadAnalyzer();
    const files = [
        "artifact-set-modifiers.json",
        "constellation-modifiers.json",
        "talent-modifiers.json",
        "weapon-modifiers.json"
    ];
    let analyzedCount = 0;
    function walk(value, source) {
        if (Array.isArray(value)) {
            value.forEach((item, index) => walk(item, `${source}.${index}`));
            return;
        }
        if (!value || typeof value !== "object") return;
        if (value.category) {
            const analysis = analyzer.analyzeModifier({ modifier: value, source, context: { mode: "uidMode" } });
            assert.equal(typeof analysis.status, "string");
            assert.equal(typeof analysis.effectGroupKey, "string");
            analyzedCount += 1;
        }
        Object.entries(value).forEach(([key, item]) => walk(item, `${source}.${key}`));
    }
    files.forEach((file) => {
        walk(readJson(`games/genshin/data/calc/${file}`), file);
    });
    assert.equal(analyzedCount > 1500, true);
});

test("自己ステータス参照のadditiveBaseDamageだけを安全に有効化する", () => {
    const analyzer = loadAnalyzer();
    const artifacts = readJson("games/genshin/data/calc/artifact-set-modifiers.json");
    const selfReference = artifacts["15024"].fourPiece[0];
    const healingReference = artifacts["15033"].fourPiece[0];
    const selfAnalysis = analyzer.analyzeModifier({ modifier: selfReference, source: "artifact4:15024", context: { mode: "uidMode" } });
    const healingAnalysis = analyzer.analyzeModifier({ modifier: healingReference, source: "artifact4:15033", context: { mode: "uidMode" } });
    const providerAnalysis = analyzer.analyzeModifier({
        modifier: {
            category: "additiveBaseDamage",
            calculationSupport: "custom",
            uidHandling: "conditional",
            value: 50,
            unit: "percent",
            reference: { stat: "def", source: "provider" },
            applyTo: ["normalAttack"]
        },
        source: "constellation:C4",
        context: { mode: "uidMode" }
    });
    assert.equal(selfAnalysis.calculable, true);
    assert.equal(selfAnalysis.calculation, "additiveBaseDamage");
    assert.equal(healingAnalysis.calculable, false);
    assert.equal(healingAnalysis.reason, "記録治療量の専用入力がありません");
    assert.deepEqual(Array.from(healingAnalysis.missingInputs), ["recordedHealing"]);
    assert.equal(providerAnalysis.calculable, false);
    assert.equal(providerAnalysis.reason, "提供キャラクターのdef入力がありません");
});

test("専用参照入力が揃った時だけ記録治療量と提供者ステータスを計算可能にする", () => {
    const analyzer = loadAnalyzer();
    const artifacts = readJson("games/genshin/data/calc/artifact-set-modifiers.json");
    const constellations = readJson("games/genshin/data/calc/constellation-modifiers.json");
    const healing = artifacts["15033"].fourPiece[0];
    const provider = constellations["10000103"].constellations["4"]
        .find((modifier) => modifier.id === "c_xilonen_4_glory_blessing_def_add_v7");
    const context = {
        mode: "uidMode",
        manualInputs: {
            recordedHealing: 12000,
            providerStats: { def: 3000 }
        }
    };
    const healingAnalysis = analyzer.analyzeModifier({ modifier: healing, source: "artifact4:15033", context });
    const providerAnalysis = analyzer.analyzeModifier({ modifier: provider, source: "constellation:C4", context });
    assert.equal(healingAnalysis.calculable, true);
    assert.deepEqual(Array.from(healingAnalysis.requiredInputs), ["recordedHealing"]);
    assert.equal(providerAnalysis.calculable, true);
    assert.deepEqual(Array.from(providerAnalysis.requiredInputs), ["providerStats.def"]);
});

test("リソース効果を計算入力・表示専用・未対応へ分類する", () => {
    const analyzer = loadAnalyzer();
    const weapons = readJson("games/genshin/data/calc/weapon-modifiers.json");
    const constellations = readJson("games/genshin/data/calc/constellation-modifiers.json");
    const structured = weapons["11427"].modifiers.find((modifier) => modifier.category === "resourceGeneratedEffect");
    const sourceTextOnly = findObject(constellations["10000005"], (modifier) => {
        return modifier.category === "resourceEffect" && modifier.resource?.fromSourceText;
    });
    const resourceKey = analyzer.resourceStateKey(structured, "weapon:11427", { characterId: "10000002" });
    const inputAnalysis = analyzer.analyzeModifier({
        modifier: structured,
        source: "weapon:11427",
        context: { mode: "uidMode", characterId: "10000002", manualInputs: { resourceStates: { [resourceKey]: 2 } } }
    });
    const displayAnalysis = analyzer.analyzeModifier({ modifier: sourceTextOnly, source: "constellation:C2", context: { mode: "uidMode" } });
    const unsupportedAnalysis = analyzer.analyzeModifier({
        modifier: { category: "resourceEffect", uidHandling: "conditional" },
        source: "talent:test",
        context: { mode: "uidMode" }
    });
    assert.equal(inputAnalysis.resourceClassification, "calculationInput");
    assert.equal(inputAnalysis.supportStatus, "stateInput");
    assert.equal(displayAnalysis.resourceClassification, "displayOnly");
    assert.equal(unsupportedAnalysis.resourceClassification, "unsupported");
});

test("custom statBonusは直接補正指定のある構造だけを有効化する", () => {
    const analyzer = loadAnalyzer();
    const constellations = readJson("games/genshin/data/calc/constellation-modifiers.json");
    const direct = constellations["10000066"].constellations["2"]
        .find((modifier) => modifier.id === "c_10000066_2_1_resolved_2");
    const misclassifiedDamage = constellations["10000023"].constellations["2"]
        .find((modifier) => modifier.category === "statBonus");
    const directAnalysis = analyzer.analyzeModifier({ modifier: direct, source: "constellation:C2", context: { mode: "uidMode" } });
    const damageAnalysis = analyzer.analyzeModifier({ modifier: misclassifiedDamage, source: "constellation:C2", context: { mode: "uidMode" } });
    assert.equal(directAnalysis.calculable, true);
    assert.equal(directAnalysis.calculation, "statBonus");
    assert.equal(damageAnalysis.calculable, false);
    assert.equal(damageAnalysis.reason, "同じ効果の構造化済みレコードへ統合済みです");
});

test("scalingBonusをステータス変換とダメージ補正へ分類する", () => {
    const analyzer = loadAnalyzer();
    const artifacts = readJson("games/genshin/data/calc/artifact-set-modifiers.json");
    const emblem = artifacts["15020"].fourPiece[0];
    const emblemAnalysis = analyzer.analyzeModifier({ modifier: emblem, source: "artifact4:15020", context: { mode: "uidMode" } });
    const unsupported = analyzer.analyzeModifier({
        modifier: {
            category: "scalingBonus",
            calculationSupport: "custom",
            unit: "percent",
            reference: { stat: "hp", source: "self" },
            applyTo: ["allDamageBonus"]
        },
        source: "constellation:C1",
        context: { mode: "uidMode" }
    });
    assert.equal(emblemAnalysis.calculable, true);
    assert.equal(emblemAnalysis.calculation, "scalingDamageBonus");
    assert.equal(unsupported.calculable, false);
    assert.equal(unsupported.reason, "custom scalingBonus の計算方式が未指定です");
});
