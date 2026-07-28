const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..", "..");
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const source = fs.readFileSync(path.join(root, "games/js/hsrCalcEngine.js"), "utf8");
const window = {};
vm.runInNewContext(source, { window });
const engine = window.HsrCalcEngine;
const attacks = readJson("games/hsr/data/attacks.json").attacks;
const modifiers = readJson("games/hsr/data/modifiers.json").modifiers;

function request(attack, applied = []) {
    return {
        character: { level: 80, stats: { atk: 1000, hp: 5000, def: 800, critRate: 50, critDamage: 100, damageBonus: 0, breakEffect: 0 } },
        enemy: { level: 80, resistance: 20, weakness: false, toughnessActive: true, defenseReduction: 0, defenseIgnore: 0, resistancePenetration: 0, takenDamage: 0 },
        attack,
        modifiers: applied
    };
}

test("Seele Lv10 normal attack preserves the reviewed direct-damage baseline", () => {
    const attack = attacks.find((item) => item.id === "110201");
    const result = engine.calculate(request({ ...attack, multiplier: attack.multipliers[9] }));
    assert.equal(attack.multipliers[9], 140);
    assert.ok(Math.abs(result.nonCrit - 504) < 1e-9);
    assert.ok(Math.abs(result.crit - 1008) < 1e-9);
    assert.ok(Math.abs(result.expected - 756) < 1e-9);
});

test("Himeko Lv10 blast keeps main and adjacent multipliers separate", () => {
    const attack = attacks.find((item) => item.id === "100302");
    const main = engine.calculate(request({ ...attack, multiplier: attack.multipliers[9] }));
    const adjacent = engine.calculate(request({ ...attack, multiplier: attack.adjacentMultipliers[9], target: "adjacent" }));
    assert.ok(Math.abs(main.nonCrit - 720) < 1e-9);
    assert.ok(Math.abs(adjacent.nonCrit - 288) < 1e-9);
});

test("Dan Heng slowed-target bonus is explicit and not part of the base multiplier", () => {
    const attack = attacks.find((item) => item.id === "100203");
    const base = engine.calculate(request({ ...attack, multiplier: attack.multipliers[9] }));
    const slowed = engine.calculate(request({ ...attack, multiplier: attack.multipliers[9] + attack.condition.bonusMultipliers[9] }));
    assert.ok(Math.abs(base.nonCrit - 1440) < 1e-9);
    assert.ok(Math.abs(slowed.nonCrit - 1872) < 1e-9);
});

test("representative party values stay pinned to reviewed skill IDs and Lv10 params", () => {
    const expected = { "tingyun-ultimate-damage": 50, "bronya-skill-damage": 66, "pela-ultimate-defense": 40, "ruanmei-skill-damage": 32, "ruanmei-ultimate-res": 25 };
    Object.entries(expected).forEach(([id, value]) => {
        const row = modifiers.find((item) => item.id === id);
        assert.ok(row?.sourceSkillId);
        assert.equal(row.valuesByLevel[9], value);
        assert.equal(row.defaultLevel, 10);
    });
});

test("image manifest reports every catalog card image as available", () => {
    const manifest = readJson("games/hsr/data/image-manifest.json");
    assert.equal(manifest.expected, 323);
    assert.equal(manifest.available, 323);
    assert.deepEqual(manifest.missing, []);
});
