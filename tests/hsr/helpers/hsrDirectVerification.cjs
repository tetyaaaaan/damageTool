"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..", "..", "..");
const readText = (file) => fs.readFileSync(path.join(root, file), "utf8");
const readJson = (file) => JSON.parse(readText(file));
const runtime = require(path.join(root, "games/js/hsrModifierRuntime.js"));
const fixedSourceSha = "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487";

let fixturePromise;
function loadProductionFixture() {
    if (!fixturePromise) fixturePromise = (async () => {
        const files = new Map();
        const put = (url, file) => files.set(url, readJson(file));
        const baseFiles = [
            ["/games/hsr/data/catalog.json", "games/hsr/data/catalog.json"],
            ["/games/hsr/data/attacks.json", "games/hsr/data/attacks.json"],
            ["/games/hsr/data/modifiers.json", "games/hsr/data/modifiers.json"],
            ["/games/hsr/data/calc/data-files.json", "games/hsr/data/calc/data-files.json"],
            ["/games/hsr/data/calc/special-break-attacks.json", "games/hsr/data/calc/special-break-attacks.json"],
            ["/games/hsr/data/trace-level-map.json", "games/hsr/data/trace-level-map.json"]
        ];
        baseFiles.forEach(([url, file]) => put(url, file));
        const manifest = files.get("/games/hsr/data/attacks.json");
        const dataFiles = files.get("/games/hsr/data/calc/data-files.json");
        const generatedUrl = "/games/hsr/data/" + manifest.generated;
        put(generatedUrl, generatedUrl.slice(1));
        for (const item of [...(dataFiles.attackOverrides || []), ...(dataFiles.modifiers || [])]) {
            const url = item.startsWith("/") ? item : "/games/hsr/data/calc/" + item;
            if (!files.has(url)) put(url, url.slice(1));
        }

        const window = {};
        vm.runInNewContext(readText("games/js/hsrCalcData.js"), {
            window, Object,
            fetch: async (url) => ({ ok: files.has(url), json: async () => files.get(url) })
        });
        const data = await window.HsrCalcData.load();
        vm.runInNewContext(readText("games/js/hsrCalcEngine.js"), { window, Object });
        return { data, engine: window.HsrCalcEngine };
    })();
    return fixturePromise;
}

function attackOf(data, id) {
    const attack = data.attacks.find((item) => item.id === id);
    assert.ok(attack, "production loader must include attack " + id);
    return attack;
}

function makeRequest(attack, level, config = {}, modifiers = []) {
    const atk = config.atk ?? 3000;
    const hp = config.hp ?? 6000;
    const def = config.def ?? 3000;
    return {
        character: {
            level: config.characterLevel ?? 80, eidolon: config.eidolon ?? 0,
            stats: { atk, hp, def, critRate: config.critRate ?? 50, critDamage: config.critDamage ?? 100, damageBonus: config.damageBonus ?? 0, breakEffect: 0 },
            baseStats: { atk: config.baseAtk ?? 1000, hp: config.baseHp ?? 1000, def: config.baseDef ?? 1000 }
        },
        enemy: {
            count: config.enemyCount ?? 1, level: config.enemyLevel ?? 80, resistance: config.resistance ?? 20,
            weakness: config.weakness ?? false, toughnessActive: config.toughnessActive ?? true,
            defenseReduction: config.defenseReduction ?? 0, defenseIgnore: config.defenseIgnore ?? 0,
            resistancePenetration: config.resistancePenetration ?? 0, takenDamage: config.takenDamage ?? 0, debuffCount: config.debuffCount
        },
        attack: { ...attack, traceLevel: level, multiplier: attack.multipliers[level - 1], attackType: attack.type },
        modifiers
    };
}

function independentDirectDamage(input) {
    const attack = input.attack, character = input.character, enemy = input.enemy;
    const mods = (input.modifiers || []).filter((item) => item.enabled !== false && item.applicable !== false);
    const sum = (category, stat) => mods.filter((item) => item.category === category && (!stat || item.stat === stat)).reduce((total, item) => total + Number(item.value || 0), 0);
    const percent = (value) => Math.max(0, Math.min(100, Number(value) || 0));
    const resolvedStat = (stat) => Number(character.stats[stat] || 0) + Number(character.baseStats?.[stat] || 0) * sum("statPercent", stat) / 100 + sum("statFlat", stat);
    const effectiveAtk = resolvedStat("atk");
    const referenceStat = attack.scalingStat || "atk";
    const effectiveReferenceValue = resolvedStat(referenceStat);
    const damageBonus = Number(character.stats.damageBonus || 0) + sum("damageBonus");
    const defenseReduction = percent(Number(enemy.defenseReduction || 0) + sum("defenseReduction"));
    const defenseIgnore = percent(Number(enemy.defenseIgnore || 0) + sum("defenseIgnore"));
    const defense = (Number(character.level) + 20) / ((Number(character.level) + 20) + (Number(enemy.level) + 20) * Math.max(0, 1 - defenseReduction / 100 - defenseIgnore / 100));
    const effectiveResistance = Math.max(-100, Math.min(90, Number(enemy.resistance || 0) - Number(enemy.resistancePenetration || 0) - sum("resistancePenetration") - sum("resistanceReduction")));
    const resistance = 1 - effectiveResistance / 100;
    const toughness = enemy.toughnessActive ? 0.9 : 1;
    const independent = mods.filter((item) => item.category === "independentMultiplier").reduce((product, item) => product * (1 + Number(item.value || 0) / 100), 1);
    const vulnerability = 1 + (Number(enemy.takenDamage || 0) + sum("takenDamage")) / 100;
    const nonCrit = effectiveReferenceValue * Number(attack.multiplier) / 100 * (1 + damageBonus / 100) * defense * resistance * toughness * independent * vulnerability;
    const canCrit = attack.canCrit !== false;
    const critRate = canCrit ? Math.max(0, Math.min(100, Number(character.stats.critRate || 0) + sum("critRate"))) / 100 : 0;
    const critDamage = canCrit ? 1 + (Number(character.stats.critDamage || 0) + sum("critDamage") + sum("critTakenDamage")) / 100 : 1;
    return { nonCrit, crit: nonCrit * critDamage, expected: nonCrit * (1 + critRate * (critDamage - 1)), effectiveAtk, effectiveReferenceValue, referenceStat, damageBonus, defense, resistance, toughness, vulnerability };
}

function assertClose(actual, expected, label) {
    assert.ok(Number.isFinite(actual), label + " must be finite");
    assert.ok(Math.abs(actual - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-11), label + ": actual=" + actual + ", expected=" + expected);
}

function assertMatchesIndependent(engine, input, label) {
    const expected = independentDirectDamage(input);
    const result = engine.calculate(input);
    assert.notEqual(result.supported, false, label + " must calculate");
    assert.equal(typeof result.nonCrit, "number", label + " exposes direct damage");
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], expected[key], label + " " + key);
    assertClose(result.breakdown.referenceValue, expected.effectiveReferenceValue, label + " reference value (" + expected.referenceStat + ")");
    assertClose(result.breakdown.damageBonus, expected.damageBonus, label + " damage bonus");
    assertClose(result.breakdown.defense, expected.defense, label + " DEF multiplier");
    assertClose(result.breakdown.resistance, expected.resistance, label + " RES multiplier");
    return result;
}

module.exports = { root, readText, readJson, runtime, fixedSourceSha, loadProductionFixture, attackOf, makeRequest, independentDirectDamage, assertClose, assertMatchesIndependent };
