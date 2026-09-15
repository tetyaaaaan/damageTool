"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createBrowserScriptHarness } = require("./helpers/browserScriptHarness.cjs");

function createHarness() {
    return createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
}

function context(overrides = {}) {
    return {
        characterId: "10000002",
        weaponId: "test-base-percent",
        stats: {
            hp: 20000,
            baseHp: 10000,
            atk: 2000,
            baseAtk: 1000,
            def: 1500,
            baseDef: 500,
            energyRecharge: 100,
            elementalMastery: 100,
            critRate: 50,
            critDamage: 100,
            elementDamageBonus: 0
        },
        inputProvenance: { includesPersistentBonuses: false },
        ...overrides
    };
}

function applied(modifier, value, valueContext) {
    return {
        modifier,
        value,
        valueContext,
        analysis: { calculation: "statBonus", uidHandling: "conditional" }
    };
}

test("通常の割合ステータス補正は対応する基礎ステータスだけを参照する", () => {
    const sandbox = createHarness();
    const calcContext = context();
    const collected = {
        applied: [
            applied({ id: "atk-percent", category: "statBonus", applyTo: ["atkPercent"], unit: "percent" }, 20),
            applied({ id: "hp-percent", category: "statBonus", applyTo: ["hpPercent"], unit: "percent" }, 25),
            applied({ id: "def-percent", category: "statBonus", applyTo: ["defPercent"], unit: "percent" }, 30),
            applied(
                { id: "party-atk-percent", category: "statBonus", applyTo: ["atkPercent"], unit: "percent", partySource: true },
                20,
                context({ stats: { baseAtk: 800, atk: 1600 } })
            )
        ]
    };
    const resolved = sandbox.GenshinCalcEngine.buildEffectiveStats(calcContext, collected);
    assert.equal(resolved.effectiveStats.atk, 2360);
    assert.equal(resolved.effectiveStats.hp, 22500);
    assert.equal(resolved.effectiveStats.def, 1650);
    assert.equal(resolved.trace.find((item) => item.modifierId === "party-atk-percent").value, 160);
});

test("不足する基礎ステータスは具体的な入力パスで停止し、UID入力済み判定は維持する", () => {
    const sandbox = createHarness();
    const cases = [
        ["atkPercent", "baseAtk", { atk: 2000 }],
        ["hpPercent", "baseHp", { hp: 20000 }],
        ["defPercent", "baseDef", { def: 1500 }],
        ["atkPercent", "baseAtk", { atk: 2000, baseAtk: 0 }],
        ["hpPercent", "baseHp", { hp: 20000, baseHp: -1 }],
        ["defPercent", "baseDef", { def: 1500, baseDef: "" }],
        ["atkPercent", "baseAtk", { atk: 2000, baseAtk: Infinity }],
        ["atkPercent", "baseAtk", undefined]
    ];
    cases.forEach(([target, baseStat, stats]) => {
        const modifier = {
            id: `missing-${target}`,
            category: "statBonus",
            applyTo: [target],
            unit: "percent",
            value: 20,
            condition: "always",
            calculationSupport: "simple",
            uidHandling: "conditional"
        };
        const analysis = sandbox.GenshinModifierAnalyzer.analyzeModifier({
            modifier,
            source: "weapon:test-base-percent",
            context: { stats, mode: "manualMode" }
        });
        assert.equal(analysis.calculable, false, target);
        assert.equal(analysis.status, "missingInput", target);
        assert.equal(analysis.supportStatus, "missingInput", target);
        assert.equal(JSON.stringify(analysis.missingInputs), JSON.stringify([`stats.${baseStat}`]), target);
        assert.equal(analysis.reasonCode, "BASE_STAT_INPUT_REQUIRED", target);
    });

    const uidAnalysis = sandbox.GenshinModifierAnalyzer.analyzeModifier({
        modifier: {
            id: "uid-atk-percent",
            category: "statBonus",
            applyTo: ["atkPercent"],
            unit: "percent",
            value: 20,
            condition: "always",
            calculationSupport: "simple",
            uidHandling: "includedInUidStats"
        },
        source: "weapon:test-base-percent",
        context: {
            stats: { atk: 2000, baseAtk: 1000 },
            inputProvenance: { includesPersistentBonuses: true },
            mode: "uidMode"
        }
    });
    assert.equal(uidAnalysis.calculable, true);
    assert.equal(uidAnalysis.inputStatus, "includedInInput");
    assert.equal(uidAnalysis.uidHandling, "includedInUidStats");
});

test("基礎値が欠けた直接適用でも合計ステータスへフォールバックせず、参照割合は従来通り", () => {
    const sandbox = createHarness();
    const noBase = context({ stats: { atk: 2000, hp: 20000, def: 1500 } });
    const direct = sandbox.GenshinCalcEngine.buildEffectiveStats(noBase, {
        applied: [applied({ id: "missing-base", category: "statBonus", applyTo: ["atkPercent"], unit: "percent" }, 20)]
    });
    assert.equal(direct.effectiveStats.atk, 2000);

    const reference = sandbox.GenshinCalcEngine.buildEffectiveStats(context(), {
        applied: [applied({
            id: "hp-reference",
            category: "statBonus",
            applyTo: ["atkPercent"],
            unit: "percentOfReference",
            reference: { stat: "hp" }
        }, 10)]
    });
    assert.equal(reference.trace.find((item) => item.modifierId === "hp-reference").value, 2000);
    assert.equal(reference.effectiveStats.atk, 4000);
});
