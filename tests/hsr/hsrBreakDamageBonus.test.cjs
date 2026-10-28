"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..", "..");
const source = fs.readFileSync(path.join(root, "games/js/hsrCalcEngine.js"), "utf8");
function engine() {
    const window = {};
    vm.runInNewContext(source, { window });
    return window.HsrCalcEngine;
}

const LC_21056_BREAK_BONUS = Object.freeze({ 1: 16, 2: 18, 3: 20, 4: 22, 5: 24 });

test("Light Cone 21056 Break DMG ranks independently scale Break and Additional Break", () => {
    const calc = engine();
    for (const [rank, bonus] of Object.entries(LC_21056_BREAK_BONUS)) {
        const modifier = { id: "lightCone:21056:party-break-damage", category: "breakDamage", value: bonus, enabled: true, applicable: true, stacking: { group: "lc21056", rule: "nonStacking" } };
        const common = {
            character: { level: 80, eidolon: 0, stats: { breakEffect: 173 } },
            enemy: { level: 90, count: 1, weakness: true, toughnessActive: true, maxToughness: 60, resistance: 20, defenseReduction: 10, defenseIgnore: 0, resistancePenetration: 0, takenDamage: 0 },
            element: "Fire", breakBaseDamage: { 80: 3767.5533 }, modifiers: [modifier]
        };
        const breakBase = 3767.5533 * 2 * (1 + 1.73) * (100 / (100 + 110 * .9)) * .8 * (0.5 + 60 / 120);
        const broken = calc.calculateBreak(common);
        assert.equal(broken.supported, true, `S${rank}`);
        assert.ok(Math.abs(broken.value - breakBase * (1 + bonus / 100)) < 1e-8, `Break S${rank}`);
        assert.equal(broken.breakDamageBonus, bonus);
        assert.equal(broken.applied.length, 1);

        const additional = calc.calculateAdditionalBreak({
            ...common,
            character: { ...common.character, id: "1303", eidolon: 0 },
            attack: { id: "1303031", characterId: "1303", sourceSkillId: "130303", type: "break", element: "Ice", breakEvent: "additional", traceLevel: 10, multiplier: 50 }
        });
        const additionalBase = 3767.5533 * .5 * (1 + 1.73) * (100 / (100 + 110 * .9)) * .8 * (0.5 + 60 / 120);
        assert.equal(additional.supported, true, `additional S${rank}`);
        assert.ok(Math.abs(additional.value - additionalBase * (1 + bonus / 100)) < 1e-8, `additional S${rank}`);

    }
});

test("The breakDamage category has an explicit Super Break pathway without importing ordinary damage bonus", () => {
    const calc = engine();
    const input = {
        character: { level: 80, stats: { breakEffect: 173 } },
        enemy: { level: 90, count: 1, weakness: false, toughnessActive: false, resistance: 20, defenseReduction: 10 },
        attack: { type: "skill", element: "Fire", toughnessDamage: 30, superBreakMultiplier: 100 },
        breakBaseDamage: { 80: 3767.5533 },
        modifiers: [
            { id: "break-dmg", category: "breakDamage", value: 20 },
            { id: "ordinary-dmg", category: "damageBonus", value: 900 }
        ]
    };
    const result = calc.calculateSuperBreak(input);
    const expected = 3767.5533 * 3 * 2.73 * (100 / (100 + 110 * .9)) * .8 * 1.2;
    assert.equal(result.supported, true);
    assert.ok(Math.abs(result.value - expected) < 1e-8);
    assert.equal(result.breakDamageMultiplier, 1.2);
    assert.deepEqual(Array.from(result.applied, (item) => item.id), ["break-dmg"]);
    assert.ok(result.skipped.some((item) => item.id === "ordinary-dmg"));
});

test("Break DMG bonus is separated from Break Effect and generic damage bonus", () => {
    const calc = engine();
    const input = {
        character: { level: 80, stats: { breakEffect: 200 } },
        enemy: { level: 80, weakness: true, toughnessActive: true, maxToughness: 30, resistance: 0 },
        element: "Ice", breakBaseDamage: { 80: 3767.5533 },
        modifiers: [
            { id: "weakness-break", category: "breakDamage", value: 20 },
            { id: "break-effect", category: "breakEffect", value: 30 },
            { id: "ordinary-dmg", category: "damageBonus", value: 900 }
        ]
    };
    const result = calc.calculateBreak(input);
    const expected = 3767.5533 * (1 + 2.3) * (1 + .2) * .5 * .75;
    assert.ok(Math.abs(result.value - expected) < 1e-8);
    assert.equal(result.breakDamageMultiplier, 1.2);
    assert.equal(result.applied.length, 2);
    assert.ok(result.skipped.some((item) => item.id === "ordinary-dmg"));
});

test("unsupported multiply stacking fails closed even for a single candidate and does not block other modifiers", () => {
    const calc = engine();
    const result = calc.calculateBreak({
        character: { level: 80, stats: { breakEffect: 0 } },
        enemy: { level: 80, weakness: true, toughnessActive: true, maxToughness: 30, resistance: 0 },
        element: "Ice", breakBaseDamage: { 80: 3767.5533 },
        modifiers: [
            { id: "unsupported-single", category: "breakDamage", value: 50, stacking: { group: "unsupported", rule: "multiply" } },
            { id: "supported", category: "breakDamage", value: 20 }
        ]
    });
    assert.equal(result.supported, true);
    assert.equal(result.breakDamageBonus, 20);
    assert.equal(result.applied.length, 1);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0].id, "unsupported-single");
    assert.equal(result.skipped[0].reason, "乗算スタック規則は未対応です");
});
