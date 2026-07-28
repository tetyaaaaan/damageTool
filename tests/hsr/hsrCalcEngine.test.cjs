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
test("HSR engine supports explicit mixed-stat scaling without parsing descriptions", () => {
    const input = baseInput(); input.attack = { ...input.attack, scalingTerms: [{ stat: "atk", multiplier: 50 }, { stat: "hp", multiplier: 10 }] };
    const result = engine().calculate(input);
    assert.equal(result.breakdown.baseDamage, 1000);
    assert.equal(result.breakdown.scalingTerms.length, 2);
});
test("HSR resistance and defense multipliers have explicit boundary behavior", () => {
    const calc = engine(); assert.equal(calc.resistanceMultiplier(-20), 1.2); assert.ok(calc.resistanceMultiplier(90) < calc.resistanceMultiplier(20)); assert.equal(calc.defenseMultiplier(80, 80, 50, 50), 1); assert.ok(calc.defenseMultiplier(80, 80, 100, 0) > calc.defenseMultiplier(80, 80, 0, 0));
});
test("HSR action-value helper is isolated from damage calculation", () => {
    const result = engine().actionSummary(134, 150); assert.equal(result.actions, 2); assert.ok(result.actionValue > 0);
});
test("weakness does not add an invented direct-damage multiplier", () => {
    const calc = engine(); const weak = baseInput(); const neutral = baseInput(); neutral.enemy.weakness = false;
    assert.equal(calc.calculate(weak).nonCrit, calc.calculate(neutral).nonCrit);
});
test("break damage refuses unverified levels and non-weak targets", () => {
    const calc = engine(); const input = baseInput();
    assert.equal(calc.calculateBreak({ character: input.character, enemy: input.enemy, breakBaseDamage: {} }).supported, false);
    input.enemy.weakness = false;
    assert.equal(calc.calculateBreak({ character: input.character, enemy: input.enemy, breakBaseDamage: { 80: 3767.5533 } }).supported, false);
});
test("break damage applies the selected element multiplier", () => {
    const calc = engine(); const input = baseInput(); const common = { character: input.character, enemy: input.enemy, breakBaseDamage: { 80: 3767.5533 } };
    const fire = calc.calculateBreak({ ...common, element: "Fire" });
    const imaginary = calc.calculateBreak({ ...common, element: "Imaginary" });
    assert.equal(fire.supported, true); assert.equal(imaginary.supported, true);
    assert.equal(fire.value, imaginary.value * 4);
});
test("break damage applies defense, resistance and vulnerability modifiers but not generic damage bonus", () => {
    const calc = engine(); const input = baseInput(); const common = { character: input.character, enemy: input.enemy, element: "Ice", breakBaseDamage: { 80: 3767.5533 } };
    const base = calc.calculateBreak(common);
    const modified = calc.calculateBreak({ ...common, modifiers: [{ category: "defenseReduction", value: 100, enabled: true }, { category: "takenDamage", value: 20, enabled: true }, { category: "damageBonus", value: 999, enabled: true }] });
    assert.equal(modified.value, base.value * 2.4);
});
