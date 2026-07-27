const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..", "..");
const source = fs.readFileSync(path.join(root, "games/js/hsrCalcEngine.js"), "utf8");
function engine() { const window = {}; vm.runInNewContext(source, { window }); return window.HsrCalcEngine; }
function baseInput() {
    return { character: { level: 80, stats: { atk: 1000, hp: 5000, def: 800, speed: 134, critRate: 50, critDamage: 100, damageBonus: 0, breakEffect: 0 } }, enemy: { level: 80, resistance: 0, weakness: true, toughnessActive: false, defenseReduction: 0, defenseIgnore: 0, resistancePenetration: 0, takenDamage: 0 }, attack: { name: "検証攻撃", multiplier: 100, scalingStat: "atk", hitCount: 1, canCrit: true, target: "single" }, modifiers: [] };
}
test("HSR engine returns non-crit, crit and expected values separately", () => {
    const result = engine().calculate(baseInput());
    assert.ok(result.nonCrit > 0); assert.equal(result.crit, result.nonCrit * 2); assert.equal(result.expected, result.nonCrit * 1.5);
});
test("HSR engine keeps non-critical attacks out of critical calculation", () => {
    const input = baseInput(); input.attack = { ...input.attack, canCrit: false, hitCount: 2 };
    const result = engine().calculate(input);
    assert.equal(result.nonCrit, result.crit); assert.equal(result.nonCrit, result.expected); assert.equal(result.perHit.nonCrit * 2, result.nonCrit);
});
test("HSR engine applies structured party and enemy modifiers and reports them", () => {
    const input = baseInput(); input.modifiers = [{ id: "party", name: "パーティバフ", source: "メンバー2", category: "damageBonus", value: 30, enabled: true }, { id: "off", name: "未発動", source: "メンバー3", category: "damageBonus", value: 100, enabled: false, reason: "条件未達" }];
    const result = engine().calculate(input);
    assert.equal(result.breakdown.damageBonus, 30); assert.equal(result.applied.length, 1); assert.equal(result.skipped.length, 1);
});
test("HSR resistance and defense multipliers have explicit boundary behavior", () => {
    const calc = engine(); assert.ok(calc.resistanceMultiplier(-20) > 1); assert.ok(calc.resistanceMultiplier(90) < calc.resistanceMultiplier(20)); assert.ok(calc.defenseMultiplier(80, 80, 100, 0) > calc.defenseMultiplier(80, 80, 0, 0));
});
test("HSR action-value helper is isolated from damage calculation", () => {
    const result = engine().actionSummary(134, 150); assert.equal(result.actions, 2); assert.ok(result.actionValue > 0);
});
