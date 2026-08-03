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
test("HSR engine applies selectable source stat conditions without mutating input stats", () => {
    const input = baseInput(); const original = structuredClone(input.character.stats);
    input.modifiers = [{ id: "source:crit", name: "会心補正", source: "装備", category: "critRate", value: 50, enabled: true }, { id: "source:cd", name: "会心ダメージ補正", source: "装備", category: "critDamage", value: 50, enabled: true }];
    const result = engine().calculate(input);
    assert.equal(result.breakdown.critRatePercent, 100);
    assert.equal(result.breakdown.critDamagePercent, 150);
    assert.equal(result.expected, result.crit);
    assert.deepEqual(input.character.stats, original);
});
test("HSR engine supports explicit mixed-stat scaling without parsing descriptions", () => {
    const input = baseInput(); input.attack = { ...input.attack, scalingTerms: [{ stat: "atk", multiplier: 50 }, { stat: "hp", multiplier: 10, receivesMultiplierAddition: true }] };
    input.modifiers = [{ id: "mixed-add", name: "HP倍率加算", category: "multiplierAddition", value: 20, enabled: true }];
    const result = engine().calculate(input);
    assert.equal(result.breakdown.baseDamage, 2000);
    assert.deepEqual(Array.from(result.breakdown.scalingTerms, (term) => term.multiplierPercent), [50, 30]);
    assert.equal(result.breakdown.multiplierPercent, 80);
    assert.equal(result.breakdown.scalingTerms.length, 2);
});

test("enemy-HP damage caps use the smaller of enemy max HP and effective ATK limits", () => {
    const input = baseInput();
    input.enemy.maxHp = 10000;
    input.attack = { name: "裂創", type: "dot", damageFormula: "enemyHpCappedByAtk", enemyHpPercent: 24, atkCapPercent: 338, multiplier: 100, scalingStat: "enemyHp", canCrit: false };
    const hpLimited = engine().calculate(input);
    assert.equal(hpLimited.breakdown.cappedEnemyHpDamage, 2400);
    input.enemy.maxHp = 100000;
    const atkLimited = engine().calculate(input);
    assert.equal(atkLimited.breakdown.cappedEnemyHpDamage, 3380);
    input.attack.multiplier = 85;
    const detonation = engine().calculate(input);
    assert.equal(detonation.breakdown.baseDamage, 2873);
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
test("structured attack scope is enforced inside the engine", () => {
    const calc = engine(); const input = baseInput();
    input.attack.type = "normal";
    input.modifiers = [{ id: "dot-only", name: "持続被ダメージ増加", category: "takenDamage", value: 30, enabled: true, target: { attackTypes: ["dot"], elements: [] }, support: { status: "calculable" } }];
    const normal = calc.calculate(input);
    input.attack.type = "dot";
    const dot = calc.calculate(input);
    assert.equal(normal.applied.length, 0);
    assert.equal(normal.skipped[0].reason, "この攻撃種別・属性は対象外です");
    assert.ok(dot.nonCrit > normal.nonCrit);
});
test("review modifiers cannot enter calculation even if enabled", () => {
    const calc = engine(); const input = baseInput();
    input.modifiers = [{ id: "review", name: "未検証", category: "damageBonus", value: 999, enabled: true, support: { status: "review", reason: "検証待ち" } }];
    const result = calc.calculate(input);
    assert.equal(result.applied.length, 0);
    assert.equal(result.skipped[0].reason, "検証待ち");
});
test("flat and percentage stat buffs use explicit stat keys and base stats", () => {
    const calc = engine(); const input = baseInput(); input.character.baseStats = { atk: 600 };
    input.modifiers = [
        { category: "statFlat", stat: "atk", value: 100, enabled: true },
        { category: "statPercent", stat: "atk", value: 50, enabled: true }
    ];
    const result = calc.calculate(input);
    assert.equal(result.breakdown.baseDamage, 1400);
    delete input.character.baseStats;
    const missingBase = calc.calculate(input);
    assert.equal(missingBase.breakdown.baseDamage, 1100);
    assert.match(missingBase.skipped.find((item) => item.category === "statPercent").reason, /基礎atk/);
});
test("critical vulnerability affects only critical and expected damage", () => {
    const calc = engine(); const input = baseInput();
    input.modifiers = [{ category: "critTakenDamage", value: 20, enabled: true }];
    const result = calc.calculate(input);
    assert.equal(result.breakdown.critTakenDamage, 20);
    assert.equal(result.crit, result.nonCrit * 2.2);
});
test("super break requires broken toughness and explicit toughness damage", () => {
    const calc = engine(); const input = baseInput();
    input.enemy.toughnessActive = false;
    const common = { character: input.character, enemy: input.enemy, attack: { type: "enhancedSkill", attackType: "enhancedSkill", toughnessDamage: 30 }, breakBaseDamage: { 80: 3767.5533 } };
    const base = calc.calculateSuperBreak(common);
    const buffed = calc.calculateSuperBreak({ ...common, modifiers: [{ category: "breakEfficiency", value: 50, enabled: true, target: { attackTypes: ["enhancedSkill"], elements: [] }, support: { status: "calculable" } }] });
    assert.equal(base.supported, true);
    assert.ok(Math.abs(buffed.value / base.value - 1.5) < 1e-12);
    assert.equal(calc.calculateSuperBreak({ ...common, attack: {} }).supported, false);
    assert.equal(calc.calculateSuperBreak({ ...common, enemy: { ...input.enemy, toughnessActive: true } }).supported, false);
});
test("non-stacking groups apply only their largest active value", () => {
    const calc = engine(); const input = baseInput();
    input.modifiers = [
        { id: "small", category: "damageBonus", value: 10, enabled: true, stacking: { group: "same", rule: "nonStacking" } },
        { id: "large", category: "damageBonus", value: 20, enabled: true, stacking: { group: "same", rule: "nonStacking" } }
    ];
    const result = calc.calculate(input);
    assert.equal(result.breakdown.damageBonus, 20);
    assert.equal(result.applied[0].id, "large");
    assert.match(result.skipped[0].reason, /最大値/);
});

test("progressive vulnerability follows hit order and primary-target scope", () => {
    const progressive = { id: "progressive", name: "累進被ダメージ", source: "星魂6", category: "progressiveTakenDamage", value: 12, enabled: true, applicable: true, target: { attackTypes: ["followUp"], elements: ["Thunder"] }, stacking: { group: "progressive", rule: "add", maximumStacks: 3 }, primaryTargetOnly: true };
    const main = engine().calculate({ ...baseInput(), attack: { type: "followUp", attackType: "followUp", element: "Thunder", target: "bounce", multiplier: 100, hitCount: 5 }, modifiers: [progressive] });
    assert.deepEqual(Array.from(main.breakdown.vulnerabilityFactors, (value) => Math.round(value * 100) / 100), [1, 1.12, 1.24, 1.36, 1.36]);
    const adjacent = engine().calculate({ ...baseInput(), attack: { type: "followUp", attackType: "followUp", element: "Thunder", target: "adjacent", multiplier: 100, hitCount: 5 }, modifiers: [progressive] });
    assert.deepEqual(adjacent.applied, []);
});
