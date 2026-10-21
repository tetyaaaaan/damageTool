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
// HSR RES formula: KQM SRL damage-formula; effective RES bounds: Prydwen damage-formula.
test("HSR resistance stays linear across 75% and clamps effective RES bounds", () => {
    const calc = engine();
    for (const [resistance, expected] of [[0, 1], [20, 0.8], [74, 0.26], [75, 0.25], [80, 0.2], [-20, 1.2], [-100, 2], [-120, 2], [90, 0.1], [120, 0.1]]) {
        assert.ok(Math.abs(calc.resistanceMultiplier(resistance) - expected) < 1e-12, `RES ${resistance}%`);
    }
});

test("HSR damage subtracts manual PEN and applicable RES modifiers before clamping", () => {
    const calc = engine();
    for (const [baseResistance, expectedResistance] of [[80, 0.67], [20, 1.27], [120, 0.27], [-80, 2]]) {
        const input = baseInput();
        input.enemy.resistance = baseResistance;
        input.enemy.resistancePenetration = 15;
        input.attack.element = "Ice";
        input.modifiers = [
            { id: "res-down", category: "resistanceReduction", value: 12, enabled: true, target: { elements: ["Ice"] } },
            { id: "res-pen", category: "resistancePenetration", value: 20, enabled: true },
            { id: "off", category: "resistanceReduction", value: 99, enabled: false },
            { id: "wrong-element", category: "resistanceReduction", value: 99, enabled: true, target: { elements: ["Fire"] } }
        ];
        const result = calc.calculate(input);
        assert.ok(Math.abs(result.breakdown.resistance - expectedResistance) < 1e-12);
        assert.ok(Math.abs(result.nonCrit - 500 * expectedResistance) < 1e-9);
        assert.equal(result.applied.length, 2);
        assert.equal(result.skipped.length, 2);
        const common = { character: input.character, enemy: input.enemy, modifiers: input.modifiers, breakBaseDamage: { 80: 3767.5533 } };
        const broken = calc.calculateBreak({ ...common, element: "Ice" });
        const superBreak = calc.calculateSuperBreak({ ...common, attack: { type: "skill", element: "Ice", toughnessDamage: 30 } });
        assert.equal(broken.supported, true);
        assert.equal(superBreak.supported, true);
        assert.ok(Math.abs(broken.resistance - expectedResistance) < 1e-12);
        assert.ok(Math.abs(superBreak.resistance - expectedResistance) < 1e-12);
    }
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


test("returned breakdown factors reproduce single-hit and critical totals", () => {
    const input = baseInput();
    input.character.stats.damageBonus = 50;
    input.enemy.resistance = 20;
    input.enemy.toughnessActive = true;
    input.enemy.takenDamage = 20;
    input.modifiers = [{ category: "independentMultiplier", value: 30, enabled: true }];
    const result = engine().calculate(input);
    const b = result.breakdown;
    assert.equal(b.damageBonusMultiplier, 1.5);
    assert.ok(Math.abs(result.nonCrit - 842.4) < 1e-9);
    assert.ok(Math.abs(b.baseDamage * b.commonWithoutVulnerability * b.vulnerabilityFactorSum - result.nonCrit) < 1e-9);
    assert.equal(result.crit, result.nonCrit * b.critMultiplier);
    assert.equal(result.expected, result.nonCrit * b.expectedCritMultiplier);
    input.attack.canCrit = false;
    const dot = engine().calculate(input);
    assert.equal(dot.breakdown.critMultiplier, 1);
    assert.equal(dot.breakdown.expectedCritMultiplier, 1);
    assert.equal(dot.nonCrit, dot.crit);
});

test("unsupported damage kinds and formulas never fall through to ordinary damage", () => {
    const calc = engine();
    const attacks = [
        { type: "elation" }, { attackType: "elation" }, { scalingStat: "elation" },
        { type: "normal", scalingTerms: [{ stat: "atk", multiplier: 100 }, { stat: "elation", multiplier: 20 }] },
        { type: "trueDamage" }, { damageFormula: "trueDamage" }, { damageFormula: "futureFormula" }, { type: "futureDamage" },
        { support: { status: "displayOnly", reason: "Mixed damage is not separated" } }
    ];
    for (const attack of attacks) {
        const input = baseInput(); input.attack = { ...input.attack, ...attack };
        const result = calc.calculate(input);
        assert.equal(result.supported, false);
        assert.ok(result.reason);
        assert.ok(!("nonCrit" in result) && !("crit" in result) && !("expected" in result));
    }
    for (const type of ["normal", "dot"]) {
        const input = baseInput(); input.attack.type = type; input.attack.canCrit = type !== "dot";
        assert.equal(calc.calculate(input).nonCrit, 500);
    }
});

function elationInput() {
    const input = baseInput();
    const generated = JSON.parse(fs.readFileSync(path.join(root, "games/hsr/data/attacks.generated.json"), "utf8")).attacks.find((item) => item.id === "150520");
    const override = JSON.parse(fs.readFileSync(path.join(root, "games/hsr/data/attack-overrides.json"), "utf8")).overrides.find((item) => item.id === "150520");
    input.attack = { ...generated, ...override, multiplier: 110, traceLevel: 10 };
    input.character.eidolon = 0;
    input.character.stats = { ...input.character.stats, elation: 50, critRate: 0 };
    input.enemy = { ...input.enemy, resistance: 20, toughnessActive: true };
    input.elation = { context: "ahaInstant", punchline: 20, merrymake: 0 };
    return input;
}

test("Evanescia Elation agrees with independently calculated Lv80 reference values", () => {
    // Fandom Elation_DMG: Lv80=7535.1070, (1+E), 1+5P/(P+240), (1+M).
    // StarRailRes dbe8cdf, skill150520 Lv10 params[1]=1.1. Expected numbers use rational arithmetic.
    const cases = [
        [{}, {}, {}, 6197.335695692308, 12394.671391384616, 6197.335695692308],
        [{ elation: 100 }, {}, {}, 8263.114260923077, 16526.228521846155, 8263.114260923077],
        [{}, { punchline: 60 }, {}, 8951.707116, 17903.414232, 8951.707116],
        [{ critRate: 50 }, {}, {}, 6197.335695692308, 12394.671391384616, 9296.003543538462],
        [{ critRate: 50 }, {}, { level: 90, defenseReduction: 30, resistancePenetration: 40, toughnessActive: false }, 11671.065340286832, 23342.130680573664, 17506.598010430247],
        [{ critRate: 50 }, { merrymake: 25 }, {}, 7746.669619615384, 15493.339239230769, 11620.004429423077]
    ];
    for (const [stats, values, enemy, nonCrit, crit, expected] of cases) {
        const input = elationInput();
        Object.assign(input.character.stats, stats); Object.assign(input.elation, values); Object.assign(input.enemy, enemy);
        const result = engine().calculate(input);
        for (const [key, value] of Object.entries({ nonCrit, crit, expected })) assert.ok(Math.abs(result[key] - value) < 1e-8, `${key}: ${result[key]} versus ${value}`);
        assert.equal(result.breakdown.baseDamage, 8288.6177);
        assert.ok(Math.abs(result.breakdown.baseDamage * result.breakdown.commonWithoutVulnerability * result.breakdown.vulnerabilityFactorSum - result.nonCrit) < 1e-8);
    }
});

test("Elation excludes ATK and ordinary damage boosts and never substitutes Certified Banger", () => {
    const input = elationInput(); const calc = engine(); const baseline = calc.calculate(input).nonCrit;
    input.character.stats.atk = 999999; input.character.stats.damageBonus = 200;
    input.elation.certifiedBanger = 1000;
    input.modifiers = [{ id: "ordinary", category: "damageBonus", value: 200 }, { id: "normal-independent", category: "independentMultiplier", value: 100 }];
    const result = calc.calculate(input);
    assert.equal(result.nonCrit, baseline);
    assert.equal(result.applied.length, 0);
    assert.match(result.skipped.find((item) => item.id === "ordinary").reason, /通常の与ダメージ/);
    input.elation.context = "certifiedBanger";
    assert.equal(calc.calculate(input).supported, false);
});

test("Elation refuses missing inputs and unverified contexts without rejecting valid zero values", () => {
    const calc = engine();
    for (const value of [NaN, -1, 1.5, Infinity]) { const input = elationInput(); input.elation.punchline = value; assert.equal(calc.calculate(input).supported, false); }
    for (const key of ["elation", "critRate", "critDamage"]) { const input = elationInput(); input.character.stats[key] = NaN; assert.equal(calc.calculate(input).supported, false); }
    for (const change of [(i) => i.character.level = 79, (i) => i.character.eidolon = 1, (i) => i.elation.merrymake = NaN, (i) => i.attack.multiplier = NaN, (i) => i.attack.traceLevel = 11]) {
        const input = elationInput(); change(input); assert.equal(calc.calculate(input).supported, false);
    }
    const input = elationInput(); input.elation.punchline = 0; input.elation.merrymake = 0; input.character.stats.elation = 0;
    assert.ok(calc.calculate(input).nonCrit > 0);
});

test("Elation reuses scoped critical, defense, resistance and vulnerability modifiers", () => {
    const input = elationInput(); input.character.stats.critRate = 50;
    input.modifiers = [
        { id: "elation", category: "elation", value: 20 },
        { id: "crit", category: "critDamage", value: 30 },
        { id: "def", category: "defenseReduction", value: 30 },
        { id: "res", category: "resistancePenetration", value: 10 },
        { id: "vuln", category: "takenDamage", value: 20 },
        { id: "skill-only", category: "takenDamage", value: 99, target: { attackTypes: ["skill"] } }
    ];
    const result = engine().calculate(input);
    assert.ok(Math.abs(result.nonCrit - 11155.204252246154) < 1e-8);
    assert.ok(Math.abs(result.crit - 25656.969780166153) < 1e-8);
    assert.ok(Math.abs(result.expected - 18406.087016206155) < 1e-8);
    assert.equal(result.applied.length, 5);
    assert.equal(result.skipped.find((item) => item.id === "skill-only").applicable, false);
});

function cyreneTrueInput(level = 10, originalDamage = 1080) {
    const attack = JSON.parse(fs.readFileSync(path.join(root, 'games/hsr/data/attack-overrides.json'), 'utf8')).overrides.find(item => item.id === '1415021');
    return { ...baseInput(), character: { ...baseInput().character, eidolon: 0 }, attack: { ...attack, traceLevel: level, multiplier: attack.multipliers[level - 1] }, trueDamage: { active: true, sourceKind: 'finalNonTrueDamage', originalDamage } };
}

test('Cyrene zone True DMG matches independent final-damage percentages without any second multiplier', () => {
    const calc = engine();
    const sourceInput = baseInput(); sourceInput.character.stats.atk = 3000; sourceInput.enemy.resistance = 20; sourceInput.enemy.toughnessActive = true;
    const original = calc.calculate(sourceInput);
    assert.ok(Math.abs(original.nonCrit - 1080) < 1e-9); // 3000 * 0.5 DEF * 0.8 RES * 0.9 toughness
    assert.ok(Math.abs(calc.calculate(cyreneTrueInput(10, original.nonCrit)).nonCrit - 259.2) < 1e-9);
    assert.ok(Math.abs(original.nonCrit - 1080) < 1e-9, 'the original result remains unchanged');
    const master = JSON.parse(fs.readFileSync(path.join(root, 'games/hsr/data/catalog.json'), 'utf8')).characters.find(item => item.id === '1415').skills.find(item => item.id === '141502');
    for (const [level, original, expected] of [[10,1080,259.2], [10,2160,518.4], [1,1080,129.6], [7,1080,210.6], [10,0,0]]) {
        const input = cyreneTrueInput(level, original);
        assert.ok(Math.abs(input.attack.multiplier - master.params[level - 1][0] * 100) < 1e-9);
        const result = calc.calculate(input);
        assert.ok(Math.abs(result.nonCrit - expected) < 1e-9);
        assert.equal(result.attack.canCrit, false);
        assert.equal('crit' in result, false);
        assert.equal('defense' in result.breakdown, false);
        input.character.stats = { atk: 99999, damageBonus: 500, critRate: 100, critDamage: 999 };
        input.enemy = { level: 95, resistance: 80, toughnessActive: true, takenDamage: 100, defenseReduction: 70 };
        input.modifiers = ['damageBonus','independentMultiplier','critDamage','defenseReduction','resistancePenetration','takenDamage','multiplierAddition'].map(category => ({category,value:100}));
        const modified = calc.calculate(input);
        assert.equal(modified.nonCrit, result.nonCrit, 'source already includes mitigation and buffs');
        assert.equal(modified.applied.length, 0);
        assert.equal(modified.skipped.length, 7);
    }
});

test('True DMG refuses inactive fields, missing sources, recursive sources and unverified scope', () => {
    for (const mutate of [
        input => { input.trueDamage.active = false; },
        input => { input.trueDamage.originalDamage = NaN; },
        input => { input.trueDamage.originalDamage = -1; },
        input => { input.trueDamage.originalDamage = Infinity; },
        input => { input.trueDamage.sourceKind = 'trueDamage'; },
        input => { input.trueDamage.sourceKind = ''; },
        input => { input.character.eidolon = 2; },
        input => { input.attack.traceLevel = 11; },
        input => { input.attack.multiplier = 99; },
        input => { input.attack.id = 'future-true-effect'; }
    ]) {
        const input = cyreneTrueInput(); mutate(input);
        const result = engine().calculate(input);
        assert.equal(result.supported, false);
        assert.ok(result.reason);
        assert.equal('nonCrit' in result, false);
    }
});

function yaoguangInput() {
    const input = elationInput();
    const generated = JSON.parse(fs.readFileSync(path.join(root, "games/hsr/data/attacks.generated.json"), "utf8")).attacks.find(item => item.id === "150220");
    const override = JSON.parse(fs.readFileSync(path.join(root, "games/hsr/data/attack-overrides.json"), "utf8")).overrides.find(item => item.id === "150220");
    input.attack = { ...generated, ...override, traceLevel: 10, multiplier: override.multipliers[9] };
    input.enemy.count = 1;
    input.elation.context = "firstAhaInstant";
    input.character.stats.critRate = 50;
    return input;
}

test("Yao Guang one-enemy first Aha Instant matches independent full-attack values", () => {
    // StarRailRes dbe8cdf 150220 params[1,2,4,5], Prydwen release kit:
    // Lv10 100% AoE + 5 * 20%, 16% vulnerability applied before every hit.
    // Independent rational calculation: 7535.107 * 2 * (1+E/100)
    // * (1+5P/(P+240)) * (1+M/100) * DEF * RES * toughness * 1.16.
    const cases = [
        [{}, {}, {}, 13070.74437636923, 26141.48875273846, 19606.116564553846],
        [{ elation: 100 }, {}, {}, 17427.659168492308, 34855.318336984616, 26141.48875273846],
        [{}, { punchline: 60 }, {}, 18879.9640992, 37759.9281984, 28319.9461488],
        [{}, { merrymake: 25 }, {}, 16338.430470461539, 32676.860940923078, 24507.645705692306],
        [{ critRate: 0 }, {}, {}, 13070.74437636923, 26141.48875273846, 13070.74437636923],
        [{}, {}, { level: 90, defenseReduction: 30, resistancePenetration: 40, toughnessActive: false }, 24615.337808604956, 49230.67561720991, 36923.00671290743]
    ];
    for (const [stats, values, enemy, nonCrit, crit, expected] of cases) {
        const input = yaoguangInput();
        Object.assign(input.character.stats, stats); Object.assign(input.elation, values); Object.assign(input.enemy, enemy);
        const before = JSON.stringify(input);
        const result = engine().calculate(input);
        for (const [key, value] of Object.entries({ nonCrit, crit, expected })) assert.ok(Math.abs(result[key] - value) < 1e-8, `${key}: ${result[key]} vs ${value}`);
        assert.equal(JSON.stringify(input), before, "intrinsic vulnerability must not accumulate on input");
        assert.equal(result.attack.hitCount, 6);
        assert.equal(result.breakdown.takenDamage, 16);
        for (const key of ["nonCrit", "crit", "expected"]) assert.ok(Math.abs(result.breakdown.elationComponents.reduce((sum, item) => sum + item[key], 0) - result[key]) < 1e-8);
        assert.ok(Math.abs(result.breakdown.elationComponents[0].nonCrit - result.nonCrit / 2) < 1e-8);
        assert.ok(Math.abs(result.breakdown.elationComponents[1].perHitNonCrit - result.nonCrit / 10) < 1e-8);
        assert.ok(Math.abs(result.breakdown.baseDamage * result.breakdown.commonWithoutVulnerability * result.breakdown.vulnerabilityFactorSum - result.nonCrit) < 1e-8);
    }
    const master = JSON.parse(fs.readFileSync(path.join(root, "games/hsr/data/catalog.json"), "utf8")).characters.find(item => item.id === "1502").skills.find(item => item.id === "150220");
    for (let level = 1; level <= 10; level++) {
        const input = yaoguangInput(); input.attack.traceLevel = level; input.attack.multiplier = input.attack.multipliers[level - 1];
        const row = master.params[level - 1];
        assert.equal(row[4], 5); assert.equal(row[2], .16);
        assert.ok(Math.abs(input.attack.multiplier - (row[1] + row[4] * row[5]) * 100) < 1e-9);
        const result = engine().calculate(input);
        assert.ok(Math.abs(result.nonCrit - 13070.74437636923 * (row[1] + row[4] * row[5]) / 2) < 1e-8);
    }
});

test("Yao Guang excludes ordinary boosts and refuses unverified distribution and resource contexts", () => {
    const calc = engine(); const input = yaoguangInput(); const baseline = calc.calculate(input).nonCrit;
    input.character.stats.damageBonus = 999; input.character.stats.atk = 999999;
    input.modifiers = [{ category: "damageBonus", value: 999 }, { category: "independentMultiplier", value: 999 }];
    assert.equal(calc.calculate(input).nonCrit, baseline);
    for (const context of ["", "ahaInstant", "laterAhaInstant", "ultimateAhaInstant", "certifiedBanger"]) {
        const changed = yaoguangInput(); changed.elation.context = context; assert.equal(calc.calculate(changed).supported, false);
    }
    for (const change of [i => i.enemy.count = 2, i => delete i.enemy.count, i => i.character.eidolon = 1,
        i => i.character.level = 79, i => i.attack.elationComponents = [], i => i.attack.elationComponents = {},
        i => i.attack.elationComponents = [null, null], i => i.attack.multiplier = 100,
        i => i.attack.traceLevel = 11, i => i.attack.intrinsicTakenDamage = 0,
        ...[NaN, -1, 1.5, Infinity].map(value => i => i.elation.punchline = value),
        i => i.elation.merrymake = NaN, i => i.character.stats.elation = NaN]) {
        const changed = yaoguangInput(); change(changed); const result = calc.calculate(changed);
        assert.equal(result.supported, false); assert.equal("nonCrit" in result, false);
    }
    const zero = yaoguangInput(); zero.elation.punchline = 0; zero.elation.merrymake = 0; zero.character.stats.elation = 0;
    assert.ok(calc.calculate(zero).nonCrit > 0);
    const stacked = yaoguangInput(); stacked.enemy.takenDamage = 20;
    assert.ok(Math.abs(calc.calculate(stacked).nonCrit - baseline * 1.36 / 1.16) < 1e-8);
    stacked.modifiers = [{ id: "same-effect", category: "takenDamage", value: 16, stacking: { group: "yaoguang-woes-whisper", rule: "max" } }];
    assert.equal(calc.calculate(stacked).breakdown.takenDamage, 36, "the same structured effect is not added twice");
});


test("four scoped AoE attacks agree with independent released coefficients and ordinary damage factors", async () => {
    const window = {};
    vm.runInNewContext(fs.readFileSync(path.join(root, "games/js/hsrCalcData.js"), "utf8"), { window, fetch: async url => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(root, url), "utf8")) }) });
    const data = await window.HsrCalcData.load();
    // Fixed SHA dbe8cdf, character_skills.params[][0]; Prydwen release kits.
    // 3000 * MV * 0.5 DEF * 0.8 RES * 0.9 toughness, CR=50%, CD=100%.
    for (const [id, cid, mv, baseline] of [["151302","1513",240,2592], ["151303","1513",400,4320], ["130202","1302",120,1296], ["130203","1302",160,1728]]) {
        const attack = data.attacks.find(item => item.id === id);
        const skill = data.characters.find(item => item.id === cid).skills.find(item => item.id === id);
        assert.equal(attack.support.status, "calculable"); assert.equal(attack.target, "aoe"); assert.equal(attack.canCrit, true);
        assert.equal(attack.maximumEidolon, 0); assert.equal(attack.maximumTraceLevel, 10);
        assert.equal(attack.multipliers[9], mv);
        for (let level = 0; level < 10; level++) assert.ok(Math.abs(attack.multipliers[level] - skill.params[level][0] * 100) < 1e-8);
        const input = { ...baseInput(), character: { ...baseInput().character, stats: { ...baseInput().character.stats, atk: 3000 } },
            enemy: { ...baseInput().enemy, resistance: 20, toughnessActive: true }, attack: { ...attack, traceLevel: 10, multiplier: mv } };
        for (const [stats, enemy, ratio, critRatio, expectedRatio] of [
            [{}, {}, 1, 2, 1.5], [{ atk: 4000 }, {}, 4/3, 2, 1.5], [{ damageBonus: 50 }, {}, 1.5, 2, 1.5],
            [{ critRate: 0, critDamage: 150 }, {}, 1, 2.5, 1], [{}, { takenDamage: 20 }, 1.2, 2, 1.5],
            [{}, { level: 90, defenseReduction: 30, resistancePenetration: 40, toughnessActive: false }, 1000/531, 2, 1.5]
        ]) {
            const request = { ...input, character: { ...input.character, stats: { ...input.character.stats, ...stats } }, enemy: { ...input.enemy, ...enemy } };
            const result = engine().calculate(request);
            for (const [key, expected] of Object.entries({ nonCrit: baseline*ratio, crit: baseline*ratio*critRatio, expected: baseline*ratio*expectedRatio })) assert.ok(Math.abs(result[key]-expected)<1e-8, `${id} ${key}: ${result[key]} / ${expected}`);
            assert.ok(Math.abs(result.breakdown.baseDamage*result.breakdown.commonWithoutVulnerability*result.breakdown.vulnerabilityFactorSum-result.nonCrit)<1e-8);
        }
    }
    assert.equal(data.attacks.find(item => item.id === "140603").support.status, "displayOnly");
    const bounce = data.attacks.find(item => item.id === "130214");
    assert.equal(bounce.support.status, "displayOnly");
    assert.equal(engine().calculate({ ...baseInput(), attack: bounce }).supported, false);
});


function waveflairElationInput(level=10) {
    const input=elationInput();
    const attack=JSON.parse(fs.readFileSync(path.join(root,"games/hsr/data/attack-overrides.json"),"utf8")).overrides.find(a=>a.id==="151320");
    input.attack={...attack,traceLevel:level,multiplier:attack.multipliers[level-1]};
    input.enemy.count=1;input.character.stats.critRate=50;
    input.elation={context:"fervor10Auto",stableEnemy:true,punchline:999,merrymake:0};
    return input;
}

test("Waveflair normal Elation matches independent AoE plus ten-hit values with fixed Talent Punchline", () => {
    const catalog=JSON.parse(fs.readFileSync(path.join(root,"games/hsr/data/catalog.json"),"utf8"));
    const master=catalog.characters.find(c=>c.id==="1513").skills.find(s=>s.id==="151320");
    for(let level=1;level<=10;level++) {
        const input=waveflairElationInput(level), a=input.attack;
        assert.ok(Math.abs(a.elationComponents[0].multipliers[level-1]-master.params[level-1][0]*100)<1e-9);
        assert.ok(Math.abs(a.elationComponents[1].multipliers[level-1]-master.params[level-1][2]*100)<1e-9);
        assert.equal(master.params[level-1][1],10);
        const r=engine().calculate(input), parts=r.breakdown.elationComponents;
        for(const field of ["nonCrit","crit","expected"])assert.ok(Math.abs(parts.reduce((sum,p)=>sum+p[field],0)-r[field])<1e-8);
        assert.equal(r.breakdown.punchline,20);assert.equal(input.elation.punchline,999);
        assert.equal(r.attack.hitCount,11);assert.equal(parts[0].count,1);assert.equal(parts[1].count,10);
    }
    // Independent rational evaluation: 7535.107 * MV * (1+E) * (1+5*20/260) * (1+M) * DEF * RES * toughness.
    const cases=[
      [10,{}, {}, {},3380.364924923077,10141.09477476923,13521.459699692308,27042.919399384616,20282.18954953846],
      [1,{}, {}, {},1690.1824624615385,5070.547387384615,6760.729849846154,13521.459699692308,10141.09477476923],
      [10,{elation:80}, {}, {},4056.437909907692,12169.313729723077,16225.75163963077,32451.50327926154,24338.627459446154],
      [10,{}, {merrymake:25}, {},4225.456156153846,12676.368468461539,16901.824624615384,33803.64924923077,25352.736936923077],
      [10,{critRate:25,critDamage:150}, {}, {},3380.364924923077,10141.09477476923,13521.459699692308,33803.64924923077,18592.007087076924],
      [10,{}, {}, {level:90,resistance:40,defenseReduction:20},2697.099674140753,8091.299022422259,10788.398696563012,21576.797393126023,16182.598044844517],
      [10,{damageBonus:9999}, {punchline:NaN}, {},3380.364924923077,10141.09477476923,13521.459699692308,27042.919399384616,20282.18954953846]
    ];
    for(const [level,stats,values,enemy,aoe,extra,nc,crit,expected]of cases) {
        const input=waveflairElationInput(level);Object.assign(input.character.stats,stats);Object.assign(input.elation,values);Object.assign(input.enemy,enemy);
        const r=engine().calculate(input);assert.ok(Number.isFinite(r.nonCrit));
        const actual=[r.breakdown.elationComponents[0].nonCrit,r.breakdown.elationComponents[1].nonCrit,r.nonCrit,r.crit,r.expected];
        actual.forEach((v,i)=>assert.ok(Math.abs(v-[aoe,extra,nc,crit,expected][i])<1e-8));
    }
    const input=waveflairElationInput();
    const runtime=require(path.join(root,"games/js/hsrModifierRuntime.js"));const {loadHsrDataFiles}=require(path.join(root,"scripts/lib/hsrDataFiles.cjs"));
    input.modifiers=runtime.buildCandidates(loadHsrDataFiles(root).modifiers,{characterId:"1513",lightConeId:"21066",refinement:1},{});
    const r=engine().calculate(input);assert.ok(Math.abs(r.nonCrit-14084.853853846154)<1e-8);assert.equal(r.breakdown.defense,100/192);
    assert.ok(r.applied.some(m=>m.id==="lightCone:21066:elation-defense-ignore"));assert.equal(r.breakdown.elationPercent,50);
});

test("Waveflair refuses enhanced, multi-enemy, unstable and incomplete contexts without changing other Punchline inputs", () => {
    for(const mutate of [
      i=>i.character.level=79, i=>i.character.eidolon=1, i=>i.enemy.count=2,
      i=>i.elation.context="ahaInstant", i=>i.elation.stableEnemy=false, i=>delete i.elation.stableEnemy,
      i=>i.attack.id="151321", i=>i.attack.hitCount=12, i=>i.attack.fixedPunchline=999,
      i=>i.attack.elationComponents=i.attack.elationComponents.slice(0,1), i=>i.attack.multiplier=99,
      i=>i.attack.traceLevel=11, i=>i.character.stats.elation=NaN, i=>i.elation.merrymake=NaN
    ]) {
      const input=waveflairElationInput();mutate(input);const r=engine().calculate(input);
      assert.equal(r.supported,false);assert.ok(r.reason);assert.equal("nonCrit" in r,false);
    }
    const regular=elationInput();regular.elation.punchline=60;assert.ok(Math.abs(engine().calculate(regular).nonCrit-8951.707116)<1e-8);
    const yao=yaoguangInput();yao.elation.punchline=60;assert.equal(engine().calculate(yao).breakdown.punchline,60);
});


test("combined Elation gear and party buffs expose the exact defense inputs used by the breakdown", () => {
    const runtime=require(path.join(root,"games/js/hsrModifierRuntime.js"));
    const {loadHsrDataFiles}=require(path.join(root,"scripts/lib/hsrDataFiles.cjs"));
    const input=waveflairElationInput(); input.enemy.defenseReduction=20;
    input.modifiers=runtime.buildCandidates(loadHsrDataFiles(root).modifiers,{
        characterId:"1513",lightConeId:"21066",refinement:1,
        partyIds:["1503","1502","1512"],partyEidolons:{"1503":1,"1512":0},
        partyPaths:{"1513":"Elation","1503":"Elation","1502":"Elation","1512":"Remembrance"},traceLevelFor:()=>10
    },{"pearl-e1-party-elation":true,"robin-summeretto-fever":true,"robin-summeretto-vibes":12,
       "robin-songbirds-vulnerability":true,"robin-songbirds-talent-level":6,"robin-songbirds-count":3});
    const result=engine().calculate(input), b=result.breakdown;
    assert.equal(b.defenseReductionPercent,20);assert.equal(b.defenseIgnorePercent,29);
    assert.equal(b.defense,100/151);assert.equal(b.takenDamage,16);assert.equal(b.elationPercent,70);
    // Independent: Lv80 base * total MV * final+party Elation * fixed20 * DEF * RES * toughness * vulnerability.
    const expected=7535.107*2.4*1.7*(18/13)*(100/151)*.8*.9*1.16;
    assert.ok(Math.abs(result.nonCrit-expected)<1e-8);
    assert.ok(Math.abs(result.crit-expected*2)<1e-8);assert.ok(Math.abs(result.expected-expected*1.5)<1e-8);
    for(const key of ["nonCrit","crit","expected"])assert.ok(Math.abs(b.elationComponents.reduce((sum,p)=>sum+p[key],0)-result[key])<1e-8);
    const unbuffed=engine().calculate(waveflairElationInput()).breakdown;
    assert.equal(unbuffed.defenseReductionPercent,0);assert.equal(unbuffed.defenseIgnorePercent,0);
});


function waveflairEnhancedInput(level=10,fervor=10,punchline=20) {
    const input=waveflairElationInput(level);
    const attack=JSON.parse(fs.readFileSync(path.join(root,"games/hsr/data/attack-overrides.json"),"utf8")).overrides.find(a=>a.id==="151321");
    input.attack={...attack,traceLevel:level,multiplier:attack.multipliers[level-1]};
    input.elation={context:"fervorEnhancedAha",stableEnemy:true,hasOtherElation:true,fervor,punchline,merrymake:0};
    return input;
}
test("Waveflair enhanced Elation independently sums all three hit groups and keeps Punchline separate",()=>{
    const source=JSON.parse(fs.readFileSync(path.join(root,"games/hsr/data/catalog.json"),"utf8")).characters.find(c=>c.id==="1513").skills.find(s=>s.id==="151321");
    for(let lv=1;lv<=10;lv++)for(const heat of [10,30]){
        const input=waveflairEnhancedInput(lv,heat,60),r=engine().calculate(input),p=source.params[lv-1];
        const expected=7535.107*(p[0]+10*p[3]+heat*p[1])*1.5*2*.5*.8*.9;
        assert.ok(Math.abs(r.nonCrit-expected)<1e-8);
        assert.ok(Math.abs(r.crit-expected*2)<1e-8);assert.ok(Math.abs(r.expected-expected*1.5)<1e-8);
        assert.equal(r.attack.hitCount,11+heat);assert.equal(r.breakdown.punchline,60);
        assert.deepEqual(Array.from(r.breakdown.elationComponents,p=>p.count),[1,10,heat]);
        for(const key of ["nonCrit","crit","expected"])assert.ok(Math.abs(r.breakdown.elationComponents.reduce((s,p)=>s+p[key],0)-r[key])<1e-8);
    }
    const i=waveflairEnhancedInput();Object.assign(i.character.stats,{elation:80,critRate:25,critDamage:150,damageBonus:9999});
    Object.assign(i.enemy,{level:90,resistance:40,defenseReduction:20});i.elation.merrymake=25;
    const r=engine().calculate(i),expected=7535.107*4.5*1.8*(18/13)*1.25*(100/188)*.6*.9;
    assert.ok(Math.abs(r.nonCrit-expected)<1e-8);assert.ok(Math.abs(r.crit-expected*2.5)<1e-8);assert.ok(Math.abs(r.expected-expected*1.375)<1e-8);
    for(const mutate of [i=>i.elation.fervor=0,i=>i.elation.fervor=31,i=>i.elation.fervor=10.5,i=>i.elation.fervor=NaN,i=>i.elation.punchline=NaN,i=>i.elation.hasOtherElation=false,i=>i.elation.stableEnemy=false,i=>i.elation.context="ahaInstant",i=>i.enemy.count=2,i=>i.character.level=79,i=>i.character.eidolon=1]){
        const i=waveflairEnhancedInput();mutate(i);assert.equal(engine().calculate(i).supported,false);
    }
    assert.equal(engine().calculate(waveflairElationInput()).breakdown.punchline,20);
});


function songbirdRequest(level=6,vibes=12,talentLevel=6) {
    const a=JSON.parse(fs.readFileSync(path.join(root,"games/hsr/data/attack-overrides.json"),"utf8")).overrides.find(a=>a.id==="1151201");
    const runtime=require(path.join(root,"games/js/hsrModifierRuntime.js"));
    const records=require(path.join(root,"scripts/lib/hsrDataFiles.cjs")).loadHsrDataFiles(root).modifiers;
    return {character:{level:80,eidolon:0,stats:{hp:999999,atk:999999,critRate:100,critDamage:9999,damageBonus:9999}},enemy:{count:1,level:80,resistance:20,toughnessActive:true},
        attack:{...a,traceLevel:level,multiplier:a.multipliers[level-1]},songbird:{context:"feverStable",hp:4200,critRate:50,critDamage:100,damageBonus:0,fever:true,songbirdsActive:true,count:3,vibes,talentLevel,normalTalentLevel:10},
        modifiers:runtime.buildCandidates(records,{characterId:"1512",eidolon:0,traceLevelFor:()=>10},{"robin-summeretto-fever":true,"robin-summeretto-vibes":vibes,"robin-songbirds-vulnerability":true,"robin-songbirds-count":3,"robin-songbirds-talent-level":talentLevel})};
}
test("Summer Songbirds uses its own final snapshot and independently combines Fever, DEF and vulnerability",()=>{
    const catalog=JSON.parse(fs.readFileSync(path.join(root,"games/hsr/data/catalog.json"),"utf8")).characters.find(c=>c.id==="1512");
    const source=catalog.skills.find(s=>s.id==="1151201"),talent=catalog.skills.find(s=>s.id==="1151203");
    for(let lv=1;lv<=6;lv++)for(const [vibes,tl]of [[12,6],[50,1]]){
        const i=songbirdRequest(lv,vibes,tl),r=engine().calculate(i);
        assert.equal(i.attack.multipliers[lv-1],source.params[lv-1][1]*100);
        const bonus=talent.params[tl-1][0]+vibes*talent.params[tl-1][1],taken=talent.params[tl-1][4];
        const nc=4200*source.params[lv-1][1]*(1+bonus)/(2-(15+.5*vibes)/100)*.8*.9*(1+taken);
        for(const [v,w]of [[r.nonCrit,nc],[r.crit,nc*2],[r.expected,nc*1.5]])assert.ok(Math.abs(v-w)<1e-8);
        assert.equal(r.breakdown.referenceValue,4200);assert.equal(r.breakdown.actorKind,"memosprite");assert.equal(r.breakdown.feverDamageBonusPercent,bonus*100);
        assert.equal(r.applied.filter(m=>m.id==="songbirds-fever-own-damage").length,1);
    }
    const i=songbirdRequest();i.songbird.hp=5000;i.songbird.damageBonus=50;i.songbird.critRate=25;i.songbird.critDamage=150;
    Object.assign(i.enemy,{level:90,resistance:40,defenseReduction:20});
    i.modifiers.push({id:"owner-crit",category:"critDamage",value:9999},{id:"owner-bonus",category:"damageBonus",value:9999},{id:"owner-defIgnore",category:"defenseIgnore",value:99});
    const r=engine().calculate(i),nc=5000*1.5*(1+.5+.84)*(100/(100+110*.59))*.6*.9*1.16;
    for(const [v,w]of [[r.nonCrit,nc],[r.crit,nc*2.5],[r.expected,nc*1.375]])assert.ok(Math.abs(v-w)<1e-8);
    assert.ok(r.skipped.some(m=>m.id==="owner-crit"));
    for(const mutate of [i=>i.songbird.hp=NaN,i=>i.songbird.hp=0,i=>i.songbird.critRate=NaN,i=>i.songbird.damageBonus=NaN,i=>i.songbird.fever=false,i=>i.songbird.count=2,i=>i.songbird.context="",i=>i.songbird.vibes=0,i=>i.songbird.vibes=51,i=>i.songbird.talentLevel=7,i=>i.character.eidolon=1,i=>i.character.level=79,i=>i.enemy.count=2,i=>i.attack.traceLevel=7,i=>i.modifiers=[]]){
        const i=songbirdRequest();mutate(i);const r=engine().calculate(i);assert.equal(r.supported,false);assert.equal("nonCrit" in r,false);
    }
    const zero=songbirdRequest();zero.songbird.critRate=0;zero.songbird.critDamage=0;zero.songbird.damageBonus=0;assert.equal(engine().calculate(zero).expected,engine().calculate(zero).nonCrit);
});
