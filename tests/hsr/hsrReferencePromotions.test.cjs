"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..", "..");
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
            window,
            Object,
            fetch: async (url) => ({
                ok: files.has(url),
                json: async () => files.get(url)
            })
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
    return {
        character: {
            level: config.characterLevel ?? 80,
            eidolon: config.eidolon ?? 0,
            stats: {
                atk,
                critRate: config.critRate ?? 50,
                critDamage: config.critDamage ?? 100,
                damageBonus: config.damageBonus ?? 0,
                breakEffect: 0
            },
            baseStats: { atk: config.baseAtk ?? 1000 }
        },
        enemy: {
            count: config.enemyCount ?? 1,
            level: config.enemyLevel ?? 80,
            resistance: config.resistance ?? 20,
            weakness: config.weakness ?? false,
            toughnessActive: config.toughnessActive ?? true,
            defenseReduction: config.defenseReduction ?? 0,
            defenseIgnore: config.defenseIgnore ?? 0,
            resistancePenetration: config.resistancePenetration ?? 0,
            takenDamage: config.takenDamage ?? 0,
            debuffCount: config.debuffCount
        },
        attack: {
            ...attack,
            traceLevel: level,
            multiplier: attack.multipliers[level - 1],
            attackType: attack.type
        },
        modifiers
    };
}

function independentDirectDamage(input) {
    const attack = input.attack;
    const character = input.character;
    const enemy = input.enemy;
    const mods = (input.modifiers || []).filter((item) => item.enabled !== false && item.applicable !== false);
    const sum = (category, stat) => mods
        .filter((item) => item.category === category && (!stat || item.stat === stat))
        .reduce((total, item) => total + Number(item.value || 0), 0);
    const percent = (value) => Math.max(0, Math.min(100, Number(value) || 0));
    const effectiveAtk = Number(character.stats.atk)
        + Number(character.baseStats?.atk || 0) * sum("statPercent", "atk") / 100
        + sum("statFlat", "atk");
    const damageBonus = Number(character.stats.damageBonus || 0) + sum("damageBonus");
    const defenseReduction = percent(Number(enemy.defenseReduction || 0) + sum("defenseReduction"));
    const defenseIgnore = percent(Number(enemy.defenseIgnore || 0) + sum("defenseIgnore"));
    const defense = (Number(character.level) + 20) /
        ((Number(character.level) + 20) + (Number(enemy.level) + 20) * Math.max(0, 1 - defenseReduction / 100 - defenseIgnore / 100));
    const effectiveResistance = Math.max(-100, Math.min(90,
        Number(enemy.resistance || 0) - Number(enemy.resistancePenetration || 0)
            - sum("resistancePenetration") - sum("resistanceReduction")));
    const resistance = 1 - effectiveResistance / 100;
    const toughness = enemy.toughnessActive ? 0.9 : 1;
    const independent = mods.filter((item) => item.category === "independentMultiplier")
        .reduce((product, item) => product * (1 + Number(item.value || 0) / 100), 1);
    const vulnerability = 1 + (Number(enemy.takenDamage || 0) + sum("takenDamage")) / 100;
    const nonCrit = effectiveAtk * attack.multiplier / 100
        * (1 + damageBonus / 100) * defense * resistance * toughness * independent * vulnerability;
    const canCrit = attack.canCrit !== false;
    const critRate = canCrit ? Math.max(0, Math.min(100, Number(character.stats.critRate || 0) + sum("critRate"))) / 100 : 0;
    const critDamage = canCrit ? 1 + (Number(character.stats.critDamage || 0) + sum("critDamage") + sum("critTakenDamage")) / 100 : 1;
    return {
        nonCrit,
        crit: nonCrit * critDamage,
        expected: nonCrit * (1 + critRate * (critDamage - 1)),
        effectiveAtk,
        damageBonus,
        defense,
        resistance,
        toughness,
        vulnerability
    };
}

function assertClose(actual, expected, label) {
    assert.ok(Number.isFinite(actual), label + " must be finite");
    assert.ok(Math.abs(actual - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-11),
        label + ": actual=" + actual + ", expected=" + expected);
}

function assertMatchesIndependent(engine, input, label) {
    const expected = independentDirectDamage(input);
    const result = engine.calculate(input);
    assert.notEqual(result.supported, false, label + " must calculate");
    assert.equal(typeof result.nonCrit, "number", label + " exposes direct damage");
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(result[key], expected[key], label + " " + key);
    assertClose(result.breakdown.referenceValue, expected.effectiveAtk, label + " effective ATK");
    assertClose(result.breakdown.damageBonus, expected.damageBonus, label + " damage bonus");
    assertClose(result.breakdown.defense, expected.defense, label + " DEF multiplier");
    assertClose(result.breakdown.resistance, expected.resistance, label + " RES multiplier");
    return result;
}

test("the production HSR loader promotes only the three reviewed attacks with fixed-source provenance", async () => {
    const { data, engine } = await loadProductionFixture();
    const expected = {
        "122101": {
            characterId: "1221", type: "normal", element: "Physical", target: "single",
            multipliers: [50, 60, 70, 80, 90, 100, 110], eidolon: 6, trace: 7
        },
        "130502": {
            characterId: "1305", type: "skill", element: "Imaginary", target: "single",
            multipliers: [75, 82.5, 90, 97.5, 105, 112.5, 121.88, 131.25, 140.62, 150], eidolon: 0, trace: 10
        },
        "131702": {
            characterId: "1317", type: "skill", element: "Imaginary", target: "aoe",
            multipliers: [60, 66, 72, 78, 84, 90, 97.5, 105, 112.5, 120], eidolon: 0, trace: 10
        }
    };

    for (const [id, spec] of Object.entries(expected)) {
        const attack = attackOf(data, id);
        assert.equal(attack.support.status, "calculable", id);
        assert.equal(attack.support.verified, true, id);
        assert.equal(attack.characterId, spec.characterId, id);
        assert.equal(attack.type, spec.type, id);
        assert.equal(attack.element, spec.element, id);
        assert.equal(attack.target, spec.target, id);
        assert.deepEqual(Array.from(attack.multipliers), spec.multipliers, id + " fixed-SHA multipliers");
        assert.equal(attack.maximumEidolon, spec.eidolon, id);
        assert.equal(attack.maximumTraceLevel, spec.trace, id);
        assert.equal(attack.scalingStat, "atk", id);
        assert.equal(attack.damageFormula, "statMultiplier", id);
        assert.equal(attack.canCrit, true, id);
        assert.equal(attack.hitCountLabel, "全段合算", id + " describes an aggregate multiplier, not animation hit count");
        assert.equal(attack.enemyCountExact, 1, id);
        assert.equal(attack.provenance.sourceCommit, fixedSourceSha, id);
        assert.equal(attack.provenance.sourceName, "Mar-7th/StarRailRes", id);
        assert.match(attack.provenance.sourceFile, /character_skills\.json:/, id);
        assert.ok(attack.calculationNote && attack.calculationNote.length > 20, id + " scope is documented");
        assert.equal(engine.unsupportedAttackReason(attack), "", id + " is allowed by the actual engine");
    }

    const rappa = attackOf(data, "131702");
    assert.equal(rappa.requiresNonWeakTarget, true);
    assert.equal(rappa.requiredToughnessActive, true);
    assert.equal(rappa.enemyCountExact, 1);
    assert.match(rappa.calculationNote, /結印外/);
    assert.match(rappa.calculationNote, /未撃破/);

    const counts = data.attacks.reduce((summary, attack) => {
        const status = attack.support?.status || "review";
        summary[status] = (summary[status] || 0) + 1;
        return summary;
    }, {});
    assert.equal(data.attackCoverage.total, data.attacks.length);
    assert.equal(data.attackCoverage.calculable, data.attacks.filter((attack) => attack.support?.status === "calculable" && attack.support?.verified).length);
    assert.equal(data.attackCoverage.review, data.attacks.filter((attack) => attack.support?.status !== "calculable" || !attack.support?.verified).length);
    assert.ok(counts.calculable >= 3);

    assert.equal(attackOf(data, "130501").support.status, "review", "an unrelated reference attack remains review-only");
    assert.equal(attackOf(data, "151320").support.status, "calculable", "an unrelated existing calculable attack stays calculable");
    assert.equal(attackOf(data, "140603").support.status, "displayOnly", "an unrelated unsupported compound attack stays display-only");
});

test("each promoted direct attack matches independent NC, C, and expected-value calculations at every supported level", async () => {
    const { data, engine } = await loadProductionFixture();
    const cases = [
        { atk: 3000, critRate: 50, critDamage: 100, damageBonus: 0, enemyLevel: 80, resistance: 20, toughnessActive: true },
        { atk: 4123.5, critRate: 25, critDamage: 155, damageBonus: 48, enemyLevel: 90, resistance: 40, defenseReduction: 20, defenseIgnore: 10, toughnessActive: false },
        { atk: 2876.25, critRate: 75, critDamage: 65, damageBonus: 23.5, enemyLevel: 70, resistance: 0, defenseIgnore: 30, resistancePenetration: 10, takenDamage: 15, toughnessActive: true }
    ];
    const targets = [
        ["122101", [50, 60, 70, 80, 90, 100, 110]],
        ["130502", [75, 82.5, 90, 97.5, 105, 112.5, 121.88, 131.25, 140.62, 150]],
        ["131702", [60, 66, 72, 78, 84, 90, 97.5, 105, 112.5, 120]]
    ];
    for (const [id, sourceValues] of targets) {
        const attack = attackOf(data, id);
        for (let level = 1; level <= sourceValues.length; level++) {
            assertClose(attack.multipliers[level - 1], sourceValues[level - 1], id + " Lv" + level + " source coefficient");
            for (const config of cases) {
                const allowedCase = { ...config, eidolon: id === "122101" && level === 7 ? 3 : 0, ...(id === "131702" ? { toughnessActive: true } : {}) };
                const input = makeRequest(attack, level, allowedCase);
                const result = assertMatchesIndependent(engine, input, id + " Lv" + level);
                assert.equal(result.attack.hitCount, 1, id);
                assert.equal(result.attack.hitCountLabel, "全段合算", id);
            }
        }
    }
});

test("Yunli True Sunder applies 30% of base ATK once to basic attacks and respects final-stat input", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "122101");
    const id = "traceNode:1221:1221103:true-sunder";
    const record = data.structuredModifiers.find((item) => item.id === id);
    assert.ok(record, "existing structured True Sunder effect is reused");
    assert.equal(record.value.fixed, 30);
    assert.deepEqual(Array.from(record.target.attackTypes), ["normal", "skill", "followUp", "ultimate"]);
    assert.equal(record.inputPolicy, "conditional");

    for (const baseAtk of [679.14, 879.14]) {
        const finalAtk = 3000;
        const context = { characterId: "1221", eidolon: 0, stats: { atk: finalAtk }, baseStats: { atk: baseAtk } };
        const enabled = runtime.buildCandidates(data.structuredModifiers, context, { "yunli-true-sunder-active": true }).find((item) => item.id === id);
        const disabled = runtime.buildCandidates(data.structuredModifiers, context, { "yunli-true-sunder-active": false }).find((item) => item.id === id);
        assert.ok(enabled);
        assert.equal(enabled.enabled, true);
        assert.equal(enabled.value, 30);
        assert.equal(runtime.applicableToAttack(enabled, attack), true);
        assert.equal(disabled.enabled, false);

        const withBuff = makeRequest(attack, 6, { atk: finalAtk, baseAtk });
        withBuff.modifiers = [enabled];
        const buffed = assertMatchesIndependent(engine, withBuff, "Yunli Sunder base ATK " + baseAtk);
        assertClose(buffed.breakdown.referenceValue, finalAtk + baseAtk * 0.3, "Yunli adjusted ATK");
        assert.equal(withBuff.character.stats.atk, finalAtk, "the entered final ATK remains unchanged");

        const alreadyIncluded = makeRequest(attack, 6, { atk: finalAtk + baseAtk * 0.3, baseAtk });
        const noReapplication = assertMatchesIndependent(engine, alreadyIncluded, "Yunli Sunder already included in final ATK " + baseAtk);
        assertClose(noReapplication.nonCrit, buffed.nonCrit, "final ATK with the effect already included");
        assert.equal(withBuff.character.stats.atk, finalAtk, "the UI input is never mutated by the calculation");
    }

    const wrongCharacter = runtime.buildCandidates(data.structuredModifiers, { characterId: "1222", partyIds: ["1221"] }, { "yunli-true-sunder-active": true })
        .find((item) => item.id === id);
    assert.equal(wrongCharacter, undefined, "True Sunder is self-only and cannot be granted by a party Yunli");
});

test("Dr. Ratio Deduction applies only to eligible attacks at the manually entered pre-hit debuff count", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "130502");
    const followUp = attackOf(data, "130504");
    const normal = attackOf(data, "130501");
    const id = "traceNode:1305:1305103:deduction";
    const record = data.structuredModifiers.find((item) => item.id === id);
    assert.ok(record);
    assert.deepEqual(Array.from(record.target.attackTypes), ["skill", "ultimate", "followUp"]);
    assert.equal(record.activation.reference, "enemy.debuffCount");
    assert.equal(record.activation.inputKey, "ratio-deduction-unlocked");

    const expectedBonus = new Map([[3, 30], [4, 40], [5, 50]]);
    for (const [debuffCount, bonus] of expectedBonus) {
        const context = {
            characterId: "1305",
            eidolon: 0,
            enemy: { debuffCount },
            traceLevelFor: () => 10
        };
        const selected = runtime.buildCandidates(data.structuredModifiers, context, { "ratio-deduction-unlocked": true }).find((item) => item.id === id);
        assert.ok(selected);
        assert.equal(selected.enabled, true);
        assert.equal(selected.value, bonus);
        assert.equal(runtime.applicableToAttack(selected, attack), true);
        assert.equal(runtime.applicableToAttack(selected, followUp), true);
        assert.equal(runtime.applicableToAttack(selected, normal), false);

        const input = makeRequest(attack, 10, { debuffCount });
        input.modifiers = [selected];
        const result = assertMatchesIndependent(engine, input, "Ratio Deduction " + debuffCount + " debuffs");
        assertClose(result.breakdown.damageBonus, bonus, "Ratio Deduction damage-bonus bucket");
        assert.equal(result.applied.filter((item) => item.id === id).length, 1, "the same trace is applied exactly once");

        const inputWithoutDeduction = makeRequest(attack, 10, { debuffCount });
        const baseline = engine.calculate(inputWithoutDeduction);
        assertClose(result.nonCrit / baseline.nonCrit, (1 + bonus / 100), "Ratio Deduction is additive in the damage-bonus bucket");
    }

    const offContext = {
        characterId: "1305",
        eidolon: 0,
        enemy: { debuffCount: 5 },
        traceLevelFor: () => 10
    };
    const off = runtime.buildCandidates(data.structuredModifiers, offContext, { "ratio-deduction-unlocked": false }).find((item) => item.id === id);
    assert.ok(off);
    assert.equal(off.enabled, false, "Deduction is optional and defaults to OFF");
    assert.equal(runtime.applicableToAttack(off, attack), false);
    const noEffect = engine.calculate(makeRequest(attack, 10, { debuffCount: 5 }, [off]));
    const baseline = engine.calculate(makeRequest(attack, 10, { debuffCount: 5 }));
    assertClose(noEffect.nonCrit, baseline.nonCrit, "Deduction OFF preserves the base calculation");

    const belowThreshold = runtime.buildCandidates(data.structuredModifiers, {
        characterId: "1305", eidolon: 0, enemy: { debuffCount: 2 }, traceLevelFor: () => 10
    }, { "ratio-deduction-unlocked": true }).find((item) => item.id === id);
    assert.ok(belowThreshold);
    assert.equal(belowThreshold.enabled, false, "fewer than three enemy debuffs cannot activate Deduction");
    assert.equal(runtime.applicableToAttack(belowThreshold, attack), false);
});




