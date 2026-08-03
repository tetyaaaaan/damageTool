const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { loadHsrDataFiles } = require("../../scripts/lib/hsrDataFiles.cjs");

const root = path.resolve(__dirname, "..", "..");
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const source = fs.readFileSync(path.join(root, "games/js/hsrCalcEngine.js"), "utf8");
const window = {};
vm.runInNewContext(source, { window });
const engine = window.HsrCalcEngine;
const generatedAttacks = readJson("games/hsr/data/attacks.generated.json").attacks;
const registeredData = loadHsrDataFiles(root);
const attackOverrides = registeredData.attackOverrides;
const attacksById = new Map(generatedAttacks.map((attack) => [attack.id, attack]));
attackOverrides.forEach((override) => attacksById.set(override.id, { ...attacksById.get(override.id), ...override }));
const attacks = Array.from(attacksById.values());
const modifiers = readJson("games/hsr/data/modifiers.json").modifiers;
const runtime = require(path.join(root, "games/js/hsrModifierRuntime.js"));
const structuredModifiers = registeredData.modifiers
    .filter((modifier) => !String(modifier.id).startsWith("deprecated:"));

function structured(id, context, inputs = {}) {
    return runtime.buildCandidates(structuredModifiers, context, inputs).find((item) => item.id === id);
}

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

test("Castorice reviewed attacks keep HP scaling, blast sides, and six-hit memosprite damage separate", () => {
    const skill = attacks.find((item) => item.id === "140702");
    const main = engine.calculate(request({ ...skill, multiplier: skill.multipliers[9] }));
    const adjacent = engine.calculate(request({ ...skill, multiplier: skill.adjacentMultipliers[9], target: "adjacent" }));
    const memosprite = attacks.find((item) => item.id === "1140706");
    const bounce = engine.calculate(request({ ...memosprite, multiplier: memosprite.multipliers[9] }));
    assert.equal(skill.scalingStat, "hp");
    assert.equal(skill.multipliers[9], 50);
    assert.equal(skill.adjacentMultipliers[9], 30);
    assert.ok(Math.abs(main.nonCrit - 900) < 1e-9);
    assert.ok(Math.abs(adjacent.nonCrit - 540) < 1e-9);
    assert.equal(memosprite.hitCount, 6);
    assert.ok(Math.abs(bounce.nonCrit - 6048) < 1e-9);
});

test("Bronya 1101 golden: Lv10 normal is reviewed and A2 forces 100% expected crit", () => {
    const attack = attacks.find((item) => item.id === "110101");
    const critOverride = structured("traceNode:1101:1101101:normal-crit-override", { characterId: "1101" });
    const result = engine.calculate(request({ ...attack, attackType: attack.type, element: attack.element, multiplier: attack.multipliers[9] }, [critOverride]));
    assert.equal(attack.multipliers[9], 140);
    assert.ok(Math.abs(result.nonCrit - 504) < 1e-9);
    assert.ok(Math.abs(result.crit - 1008) < 1e-9);
    assert.ok(Math.abs(result.expected - 1008) < 1e-9);
    assert.equal(result.applied[0].id, "traceNode:1101:1101101:normal-crit-override");
});

test("Bronya 1101 golden: E4 attack is gated and keeps 80% of normal multiplier", () => {
    const attack = attacks.find((item) => item.id === "1101041");
    assert.equal(attack.requiredEidolon, 4);
    assert.equal(attack.multipliers[9], 112);
    const result = engine.calculate(request({ ...attack, attackType: attack.type, multiplier: attack.multipliers[9] }));
    assert.ok(Math.abs(result.nonCrit - 403.2) < 1e-9);
});

test("Ruan Mei 1303 golden: Lv10 skill and A6 combine to 68% only while enabled", () => {
    const attack = attacks.find((item) => item.id === "130301");
    const context = { characterId: "1102", partyIds: ["1303"], traceLevelFor: () => 10 };
    const inputs = { "ruanmei-skill-active": true, "ruanmei-break-effect": 180 };
    const applied = [
        structured("trace:1303:130302:damage-bonus", context, inputs),
        structured("traceNode:1303:1303103:skill-extra-damage", context, inputs)
    ];
    const result = engine.calculate(request({ ...attack, attackType: attack.type, element: attack.element, multiplier: attack.multipliers[9] }, applied));
    assert.equal(result.breakdown.damageBonus, 68);
    assert.ok(Math.abs(result.nonCrit - 846.72) < 1e-9);
    assert.deepEqual(Array.from(result.applied, (item) => item.id), ["trace:1303:130302:damage-bonus", "traceNode:1303:1303103:skill-extra-damage"]);
    const disabled = structured("trace:1303:130302:damage-bonus", context, {});
    const base = engine.calculate(request({ ...attack, attackType: attack.type, multiplier: attack.multipliers[9] }, [disabled]));
    assert.ok(Math.abs(base.nonCrit - 504) < 1e-9);
});

test("Ruan Mei 1303 golden: residual plum and talent use verified Ice break multipliers", () => {
    const specials = readJson("games/hsr/data/calc/special-break-attacks.json").attacks;
    const plum = specials.find((item) => item.id === "1303031");
    const talent = specials.find((item) => item.id === "1303041");
    assert.equal(plum.multipliers[9], 50);
    assert.equal(talent.multipliers[9], 120);
    assert.equal(talent.eidolon6Bonus, 200);
    const common = { character: { level: 80, stats: { breakEffect: 0 } }, enemy: { level: 80, resistance: 20, weakness: true, maxToughness: 30 }, element: "Ice", breakBaseDamage: { 80: 3767.5533 } };
    const plumResult = engine.calculateBreak({ ...common, multiplier: plum.multipliers[9] / 100 });
    const talentResult = engine.calculateBreak({ ...common, multiplier: talent.multipliers[9] / 100 });
    assert.ok(Math.abs(talentResult.value / plumResult.value - 2.4) < 1e-9);
});

test("Welt 1004 golden: previous and enhanced skill hit counts stay separated", () => {
    const previous = attacks.find((item) => item.id === "100402");
    const enhanced = attacks.find((item) => item.id === "1100402");
    assert.equal(previous.variant, "previous");
    assert.equal(previous.hitCount, 3);
    assert.equal(enhanced.variant, "enhanced");
    assert.equal(enhanced.hitCount, 5);
    assert.equal(previous.multipliers[9], 72);
    assert.equal(enhanced.multipliers[9], 72);
});

test("Welt 1004 golden: enhanced Weightlessness conditions apply to calculation and previous traces stay isolated", () => {
    const context = { characterId: "1004", enhancementState: "enhanced", stats: { effectHitRate: 80 }, traceLevelFor: () => 10 };
    const inputs = { "welt-weightless-active": true, "welt-weightless-damage-stacks": 3 };
    const defense = structured("trace:1004:1100404:weightless-defense-down", context, inputs);
    const stacks = structured("traceNode:1004:11004101:weightless-party-damage", context, inputs);
    const attackBonus = structured("traceNode:1004:11004103:effect-hit-atk", context, inputs);
    assert.equal(defense.value, 40);
    assert.equal(stacks.value, 30);
    assert.equal(attackBonus.value, 80);
    assert.equal(structured("traceNode:1004:1004101:damage-taken", context, { "welt-punishment-active": true }), undefined);

    const attack = attacks.find((item) => item.id === "1100402");
    const result = engine.calculate(request({ ...attack, attackType: attack.type, multiplier: attack.multipliers[9] }, [defense, stacks]));
    assert.ok(Math.abs(result.nonCrit - 2106) < 1e-9);
    assert.deepEqual(Array.from(result.applied, (item) => item.id), ["trace:1004:1100404:weightless-defense-down", "traceNode:1004:11004101:weightless-party-damage"]);
});

test("Welt 1004 golden: previous trace applies only in previous state and E1/E6 attacks are explicitly gated", () => {
    const punishment = structured("traceNode:1004:1004101:damage-taken", { characterId: "1004", enhancementState: "previous" }, { "welt-punishment-active": true });
    assert.equal(punishment.value, 12);
    assert.equal(punishment.enabled, true);
    assert.equal(attacks.find((item) => item.id === "1004011").requiredEidolon, 1);
    assert.equal(attacks.find((item) => item.id === "1004026").requiredEidolon, 6);
    assert.equal(attacks.find((item) => item.id === "11004026").hitCount, 6);
});

test("Kafka 1005 golden: previous and enhanced detonations preserve target and non-critical scope", () => {
    const previous = attacks.find((item) => item.id === "1005021");
    const enhancedMain = attacks.find((item) => item.id === "11005021");
    const enhancedAdjacent = attacks.find((item) => item.id === "11005022");
    assert.equal(previous.variant, "previous");
    assert.equal(previous.canCrit, false);
    assert.equal(previous.multipliers[9], 75);
    assert.equal(enhancedMain.variant, "enhanced");
    assert.equal(enhancedAdjacent.target, "adjacent");
    assert.equal(enhancedAdjacent.multipliers[9], 50);
    const result = engine.calculate(request({ ...enhancedMain, multiplier: enhancedMain.multipliers[9] }));
    assert.equal(result.nonCrit, result.crit);
    assert.equal(result.crit, result.expected);
});

test("Kafka 1005 golden: enhanced effect-hit threshold changes base ATK only at 75 percent", () => {
    const id = "traceNode:1005:11005101:effect-hit-atk";
    const below = structured(id, { characterId: "1005", enhancementState: "enhanced", stats: { effectHitRate: 74 } });
    const reached = structured(id, { characterId: "1005", enhancementState: "enhanced", stats: { effectHitRate: 75 } });
    assert.equal(below.enabled, false);
    assert.equal(below.activation.inputValue, 74);
    assert.equal(reached.enabled, true);
    assert.equal(reached.activation.inputValue, 75);
    const normal = attacks.find((item) => item.id === "1100501");
    const base = request({ ...normal, attackType: normal.type, multiplier: normal.multipliers[9] }, [reached]);
    base.character.baseStats = { atk: 1000 };
    const result = engine.calculate(base);
    assert.ok(Math.abs(result.nonCrit - 1008) < 1e-9);
    assert.equal(result.applied[0].id, id);
});

test("Kafka 1005 golden: E1 and E2 affect DoT but never direct attacks", () => {
    const context = { characterId: "1005", enhancementState: "enhanced", eidolon: 2 };
    const e1 = structured("eidolon:1005:1:dot-vulnerability", context, { "kafka-e1-dot-vulnerability": true });
    const e2 = structured("eidolon:1005:2:party-dot-damage", context);
    const dot = attacks.find((item) => item.id === "11005021");
    const direct = attacks.find((item) => item.id === "1100502");
    const dotResult = engine.calculate(request({ ...dot, attackType: dot.type, multiplier: dot.multipliers[9] }, [e1, e2]));
    const directResult = engine.calculate(request({ ...direct, attackType: direct.type, multiplier: direct.multipliers[9] }, [e1, e2]));
    assert.equal(dotResult.breakdown.damageBonus, 25);
    assert.equal(dotResult.breakdown.takenDamage, 30);
    assert.deepEqual(Array.from(dotResult.applied, (item) => item.id), ["eidolon:1005:1:dot-vulnerability", "eidolon:1005:2:party-dot-damage"]);
    assert.equal(directResult.breakdown.damageBonus, 0);
    assert.equal(directResult.breakdown.takenDamage, 0);
    assert.equal(directResult.applied.length, 0);
});

test("Kafka 1005 golden: E6 shock is a separate attack and does not overwrite the base record", () => {
    const base = attacks.find((item) => item.id === "11005031");
    const eidolon6 = attacks.find((item) => item.id === "11005036");
    assert.equal(eidolon6.requiredEidolon, 6);
    assert.equal(eidolon6.multipliers[9] - base.multipliers[9], 156);
    assert.equal(base.canCrit, false);
    assert.equal(eidolon6.canCrit, false);
});

test("Silver Wolf 1006 golden: previous and enhanced ultimate targets remain distinct", () => {
    const previous = attacks.find((item) => item.id === "100603");
    const enhanced = attacks.find((item) => item.id === "1100603");
    assert.equal(previous.variant, "previous");
    assert.equal(previous.target, "single");
    assert.equal(enhanced.variant, "enhanced");
    assert.equal(enhanced.target, "aoe");
    assert.equal(previous.multipliers[9], 380);
    assert.equal(enhanced.multipliers[9], 380);
});

test("Silver Wolf 1006 golden: enhanced effect-hit trace reaches 50% ATK cap", () => {
    const id = "traceNode:1006:11006103:effect-hit-atk";
    const below = structured(id, { characterId: "1006", enhancementState: "enhanced", stats: { effectHitRate: 9.9 } });
    const capped = structured(id, { characterId: "1006", enhancementState: "enhanced", stats: { effectHitRate: 70 } });
    assert.equal(below.enabled, false);
    assert.equal(capped.enabled, true);
    assert.equal(capped.value, 50);
    const normal = attacks.find((item) => item.id === "1100601");
    const input = request({ ...normal, attackType: normal.type, multiplier: normal.multipliers[9] }, [capped]);
    input.character.baseStats = { atk: 1000 };
    assert.ok(Math.abs(engine.calculate(input).nonCrit - 756) < 1e-9);
});

test("Silver Wolf 1006 golden: Annotation requires both its toggle and three enemy debuffs", () => {
    const id = "traceNode:1006:1006103:extra-resistance";
    const off = structured(id, { characterId: "1006", enhancementState: "previous", enemy: { debuffCount: 3 } });
    const short = structured(id, { characterId: "1006", enhancementState: "previous", enemy: { debuffCount: 2 } }, { "silverwolf-annotation-active": true });
    const active = structured(id, { characterId: "1006", enhancementState: "previous", enemy: { debuffCount: 3 } }, { "silverwolf-annotation-active": true });
    assert.equal(off.enabled, false);
    assert.equal(off.activation.toggled, false);
    assert.equal(short.enabled, false);
    assert.equal(short.activation.toggled, true);
    assert.equal(active.enabled, true);
    assert.equal(active.value, 3);
});

test("Silver Wolf 1006 golden: E6 and E4 share the capped enemy debuff count", () => {
    const e6 = structured("eidolon:1006:6:damage-per-debuff", { characterId: "1006", enhancementState: "enhanced", eidolon: 6, enemy: { debuffCount: 7 } });
    assert.equal(e6.value, 100);
    assert.equal(e6.enabled, true);
    const extra = attacks.find((item) => item.id === "1006034");
    const zero = engine.calculate(request({ ...extra, hitCount: 0, multiplier: 20 }));
    const three = engine.calculate(request({ ...extra, hitCount: 3, multiplier: 20 }));
    assert.equal(zero.nonCrit, 0);
    assert.ok(Math.abs(three.nonCrit - 216) < 1e-9);
    assert.equal(extra.hitCountReference, "enemy.debuffCount");
    assert.equal(extra.hitCountMaximum, 5);
});

test("Arlan 1008 golden: ultimate main, adjacent, and E6 adjacent multipliers stay separate", () => {
    const base = attacks.find((item) => item.id === "100803");
    const eidolon6 = attacks.find((item) => item.id === "1008036");
    assert.equal(base.multipliers[9], 320);
    assert.equal(base.adjacentMultipliers[9], 160);
    assert.equal(eidolon6.requiredEidolon, 6);
    assert.equal(eidolon6.hpPercentMaximum, 50);
    assert.equal(eidolon6.adjacentMultipliers[9], 320);
});

test("Arlan 1008 golden: talent scales continuously from missing HP", () => {
    const id = "trace:1008:100804:missing-hp-damage";
    const full = structured(id, { characterId: "1008", stats: { hpPercent: 100 }, traceLevelFor: () => 10 });
    const half = structured(id, { characterId: "1008", stats: { hpPercent: 50 }, traceLevelFor: () => 10 });
    const low = structured(id, { characterId: "1008", stats: { hpPercent: 25 }, traceLevelFor: () => 10 });
    assert.equal(full.value, 0);
    assert.equal(half.value, 36);
    assert.equal(low.value, 54);
    assert.equal(half.enabled, true);
});

test("Arlan 1008 golden: HP threshold eidolons apply only to skill and ultimate", () => {
    const context = { characterId: "1008", eidolon: 6, stats: { hpPercent: 50 }, traceLevelFor: () => 10 };
    const e1 = structured("eidolon:1008:1:skill-damage", context);
    const e6 = structured("eidolon:1008:6:ultimate-damage", context);
    assert.equal(e1.enabled, true);
    assert.equal(e6.enabled, true);
    const skill = attacks.find((item) => item.id === "100802");
    const normal = attacks.find((item) => item.id === "100801");
    const skillResult = engine.calculate(request({ ...skill, attackType: skill.type, multiplier: skill.multipliers[9] }, [e1, e6]));
    const normalResult = engine.calculate(request({ ...normal, attackType: normal.type, multiplier: normal.multipliers[9] }, [e1, e6]));
    assert.equal(skillResult.breakdown.damageBonus, 10);
    assert.equal(normalResult.breakdown.damageBonus, 0);
    assert.equal(normalResult.applied.length, 0);
});

test("Asta 1009 golden: skill keeps five hits and E1 adds exactly one hit", () => {
    const base = attacks.find((item) => item.id === "100902");
    const eidolon1 = attacks.find((item) => item.id === "1009021");
    assert.equal(base.hitCount, 5);
    assert.equal(eidolon1.hitCount, 6);
    assert.equal(eidolon1.requiredEidolon, 1);
    assert.equal(base.multipliers[9], 50);
    assert.equal(eidolon1.multipliers[9], 50);
});

test("Asta 1009 golden: Charging uses the current talent level and caps at five stacks", () => {
    const id = "trace:1009:100904:charging-atk";
    const zero = structured(id, { characterId: "1009", traceLevelFor: () => 10 }, { "asta-charging-stacks": 0 });
    const three = structured(id, { characterId: "1009", traceLevelFor: () => 10 }, { "asta-charging-stacks": 3 });
    const capped = structured(id, { characterId: "1009", traceLevelFor: () => 10 }, { "asta-charging-stacks": 9 });
    assert.equal(zero.enabled, false);
    assert.equal(three.value, 42);
    assert.equal(capped.value, 70);
    assert.equal(capped.activation.inputValue, 5);
});

test("Asta 1009 golden: Ignite affects only Fire attacks and burn remains non-critical", () => {
    const ignite = structured("traceNode:1009:1009102:party-fire-damage", { characterId: "1009", traceLevelFor: () => 10 });
    const normal = attacks.find((item) => item.id === "100901");
    const burn = attacks.find((item) => item.id === "1009011");
    const fireResult = engine.calculate(request({ ...normal, attackType: normal.type, multiplier: normal.multipliers[9] }, [ignite]));
    const offElement = engine.calculate(request({ ...normal, element: "Ice", attackType: normal.type, multiplier: normal.multipliers[9] }, [ignite]));
    assert.equal(fireResult.breakdown.damageBonus, 18);
    assert.equal(offElement.breakdown.damageBonus, 0);
    assert.equal(burn.canCrit, false);
    assert.equal(burn.multipliers[9], 70);
});

test("Herta 1013 golden: enemy HP threshold applies the skill bonus only at 50 percent or above", () => {
    const id = "trace:1013:101302:high-hp-skill-damage";
    const below = structured(id, { characterId: "1013", enemy: { hpPercent: 49.9 } });
    const threshold = structured(id, { characterId: "1013", enemy: { hpPercent: 50 } });
    assert.equal(below.enabled, false);
    assert.equal(threshold.enabled, true);
    const skill = attacks.find((item) => item.id === "101302");
    const normal = attacks.find((item) => item.id === "101301");
    assert.equal(engine.calculate(request({ ...skill, attackType: skill.type, multiplier: skill.multipliers[9] }, [threshold])).breakdown.damageBonus, 20);
    assert.equal(engine.calculate(request({ ...normal, attackType: normal.type, multiplier: normal.multipliers[9] }, [threshold])).breakdown.damageBonus, 0);
});

test("Herta 1013 golden: E1 extra hit is gated by enemy HP and E4 reaches only follow-up attacks", () => {
    const extra = attacks.find((item) => item.id === "1013011");
    assert.equal(extra.requiredEidolon, 1);
    assert.equal(extra.enemyHpPercentMaximum, 50);
    assert.equal(extra.multipliers[0], 40);
    const e4 = structured("eidolon:1013:4:follow-up-damage", { characterId: "1013", eidolon: 4 });
    const followUp = attacks.find((item) => item.id === "101304");
    const ultimate = attacks.find((item) => item.id === "101303");
    assert.equal(engine.calculate(request({ ...followUp, attackType: followUp.type, multiplier: followUp.multipliers[9] }, [e4])).breakdown.damageBonus, 10);
    assert.equal(engine.calculate(request({ ...ultimate, attackType: ultimate.type, multiplier: ultimate.multipliers[9] }, [e4])).breakdown.damageBonus, 0);
});

test("Herta 1013 golden: E2 critical rate caps at five triggers and frozen bonus is manual", () => {
    const context = { characterId: "1013", eidolon: 6 };
    const e2 = structured("eidolon:1013:2:follow-up-crit-rate", context, { "herta-e2-follow-up-stacks": 8 });
    const frozenOff = structured("traceNode:1013:1013103:frozen-ultimate-damage", context);
    const frozenOn = structured("traceNode:1013:1013103:frozen-ultimate-damage", context, { "herta-target-frozen": true });
    assert.equal(e2.value, 15);
    assert.equal(e2.activation.inputValue, 5);
    assert.equal(frozenOff.enabled, false);
    assert.equal(frozenOn.enabled, true);
    assert.equal(frozenOn.value, 20);
});

test("Saber 1014 golden: ultimate keeps the AOE hit and ten random hits separate", () => {
    const aoe = attacks.find((item) => item.id === "101403");
    const bounce = attacks.find((item) => item.id === "1014031");
    assert.equal(aoe.hitCount, 1);
    assert.equal(aoe.multipliers[9], 280);
    assert.equal(bounce.hitCount, 10);
    assert.equal(bounce.multipliers[9], 110);
});

test("Saber 1014 golden: enhanced normal attack resolves exact enemy-count multipliers", () => {
    const one = attacks.find((item) => item.id === "1014081");
    const two = attacks.find((item) => item.id === "1014082");
    const three = attacks.find((item) => item.id === "1014083");
    assert.equal(one.enemyCountExact, 1);
    assert.equal(two.enemyCountExact, 2);
    assert.equal(three.enemyCountMinimum, 3);
    assert.equal(one.multipliers[9], 518);
    assert.equal(two.multipliers[9], 420);
    assert.equal(three.multipliers[9], 210);
    assert.equal(attacks.find((item) => item.id === "101408").hidden, true);
});

test("Saber 1014 golden: Core Resonance adds to skill multiplier at the attack-multiplier stage", () => {
    const context = { characterId: "1014", eidolon: 2, traceLevelFor: () => 10 };
    const base = structured("trace:1014:101402:resonance-multiplier", context, { "saber-resonance-consumed": 3 });
    const e2 = structured("eidolon:1014:2:skill-multiplier", context, { "saber-resonance-consumed": 3 });
    assert.equal(base.value, 42);
    assert.equal(e2.value, 21);
    const skill = attacks.find((item) => item.id === "101402");
    const result = engine.calculate(request({ ...skill, attackType: skill.type, multiplier: skill.multipliers[9] }, [base, e2]));
    assert.equal(result.breakdown.multiplierAddition, 63);
    assert.equal(result.breakdown.multiplierPercent, 213);
});

test("Saber 1014 golden: critical and resistance stacks cap and keep ultimate-only E6 scope", () => {
    const context = { characterId: "1014", eidolon: 6 };
    const crit = structured("traceNode:1014:1014103:resonance-crit-damage", context, { "saber-resonance-acquired": 12 });
    const e4 = structured("eidolon:1014:4:ultimate-resistance-penetration", context, { "saber-e4-ultimate-stacks": 9 });
    const e6 = structured("eidolon:1014:6:ultimate-resistance-penetration", context);
    assert.equal(crit.value, 32);
    assert.equal(e4.value, 12);
    const ultimate = attacks.find((item) => item.id === "101403");
    const normal = attacks.find((item) => item.id === "101401");
    const ultimateResult = engine.calculate(request({ ...ultimate, attackType: ultimate.type, multiplier: ultimate.multipliers[9] }, [e4, e6]));
    const normalResult = engine.calculate(request({ ...normal, attackType: normal.type, multiplier: normal.multipliers[9] }, [e4, e6]));
    assert.equal(ultimateResult.breakdown.resistance, 1.12);
    assert.equal(normalResult.breakdown.resistance, 0.92);
});

test("Archer 1015 golden: all five damage entries preserve reviewed multipliers", () => {
    const expected = {
        "101501": { type: "normal", level: 8, value: 130 },
        "101502": { type: "skill", level: 9, value: 360 },
        "101503": { type: "ultimate", level: 9, value: 1000 },
        "101504": { type: "followUp", level: 9, value: 200 },
        "101507": { type: "additional", level: 0, value: 200 }
    };
    Object.entries(expected).forEach(([id, value]) => {
        const attack = attacks.find((item) => item.id === id);
        assert.equal(attack.type, value.type);
        assert.equal(attack.multipliers[value.level], value.value);
        assert.equal(attack.element, "Quantum");
    });
    assert.equal(attacks.find((item) => item.id === "101501").multipliers.length, 9);
});

test("Archer 1015 golden: Circuit Connection caps at two stacks and E6 unlocks the third", () => {
    const id = "trace:1015:101502:circuit-skill-damage";
    const base = structured(id, { characterId: "1015", eidolon: 0, traceLevelFor: () => 10 }, { "archer-circuit-stacks": 3 });
    const eidolon6 = structured(id, { characterId: "1015", eidolon: 6, traceLevelFor: () => 10 }, { "archer-circuit-stacks": 3 });
    assert.equal(base.value, 200);
    assert.equal(base.activation.inputValue, 2);
    assert.equal(base.activation.maximum, 2);
    assert.equal(eidolon6.value, 300);
    assert.equal(eidolon6.activation.inputValue, 3);
    assert.equal(eidolon6.activation.maximum, 3);
});

test("Archer 1015 golden: Guardian follows current SP automatically", () => {
    const id = "traceNode:1015:1015103:crit-damage";
    const below = structured(id, { characterId: "1015", party: { sp: 3 } });
    const threshold = structured(id, { characterId: "1015", party: { sp: 4 } });
    assert.equal(below.enabled, false);
    assert.equal(threshold.enabled, true);
    assert.equal(threshold.value, 120);
    assert.equal(threshold.activation.automatic, true);
});

test("Archer 1015 golden: E4 and E6 retain attack scope while E2 stays Quantum-only", () => {
    const context = { characterId: "1015", eidolon: 6 };
    const e2 = structured("eidolon:1015:2:quantum-resistance-reduction", context, { "archer-e2-quantum-resistance-reduction": true });
    const e4 = structured("eidolon:1015:4:ultimate-damage", context);
    const e6 = structured("eidolon:1015:6:skill-defense-ignore", context);
    const skill = attacks.find((item) => item.id === "101502");
    const ultimate = attacks.find((item) => item.id === "101503");
    const skillResult = engine.calculate(request({ ...skill, attackType: skill.type, multiplier: skill.multipliers[9] }, [e2, e4, e6]));
    const ultimateResult = engine.calculate(request({ ...ultimate, attackType: ultimate.type, multiplier: ultimate.multipliers[9] }, [e2, e4, e6]));
    const offElement = engine.calculate(request({ ...skill, element: "Ice", attackType: skill.type, multiplier: skill.multipliers[9] }, [e2, e4, e6]));
    assert.ok(Math.abs(skillResult.breakdown.defense - (100 / 180)) < 1e-9);
    assert.equal(skillResult.breakdown.damageBonus, 0);
    assert.equal(ultimateResult.breakdown.damageBonus, 150);
    assert.equal(ultimateResult.breakdown.defense, 0.5);
    assert.equal(skillResult.breakdown.resistance, 1);
    assert.equal(offElement.breakdown.resistance, 0.8);
});

test("Seele 1102 golden: previous and enhanced attack records remain separate", () => {
    const previousSkill = attacks.find((item) => item.id === "110202");
    const enhancedSkill = attacks.find((item) => item.id === "1110202");
    const enhancedUltimate = attacks.find((item) => item.id === "1110203");
    assert.equal(previousSkill.variant, "previous");
    assert.equal(enhancedSkill.variant, "enhanced");
    assert.equal(previousSkill.multipliers[9], 220);
    assert.equal(enhancedSkill.multipliers[9], 360);
    assert.equal(enhancedUltimate.multipliers[9], 720);
});

test("Seele 1102 golden: amplified state synchronizes damage and Quantum RES penetration", () => {
    const context = { characterId: "1102", enhancementState: "enhanced", traceLevelFor: () => 10 };
    const inputs = { "seele-amplified": true };
    const talent = structured("trace:1102:1110204:amplified-damage", context, inputs);
    const penetration = structured("traceNode:1102:11102102:quantum-res-pen", context, inputs);
    assert.equal(talent.value, 80);
    assert.equal(penetration.value, 25);
    assert.equal(talent.enabled, true);
    assert.equal(penetration.enabled, true);
    const normal = attacks.find((item) => item.id === "1110201");
    const result = engine.calculate(request({ ...normal, attackType: normal.type, multiplier: normal.multipliers[9] }, [talent, penetration]));
    assert.equal(result.breakdown.damageBonus, 80);
    assert.equal(result.breakdown.resistance, 1.05);
    assert.ok(Math.abs(result.nonCrit - 1190.7) < 1e-9);
});

test("Seele 1102 golden: enhanced kill stacks cap at three and E1 follows enemy HP", () => {
    const context = { characterId: "1102", enhancementState: "enhanced", eidolon: 1 };
    const stacks = structured("traceNode:1102:11102101:kill-damage", context, { "seele-kill-damage-stacks": 7 });
    const above = structured("eidolon:1102:1:low-hp-crit-rate", { ...context, enemy: { hpPercent: 80.1 } });
    const threshold = structured("eidolon:1102:1:low-hp-crit-rate", { ...context, enemy: { hpPercent: 80 } });
    assert.equal(stacks.activation.inputValue, 3);
    assert.equal(stacks.value, 150);
    assert.equal(above.enabled, false);
    assert.equal(threshold.enabled, true);
    assert.equal(threshold.value, 15);
});

test("Seele 1102 golden: technique guarantees critical and E6 uses fifteen percent of ultimate", () => {
    const technique = attacks.find((item) => item.id === "1110207");
    const e6 = attacks.find((item) => item.id === "11102036");
    assert.equal(technique.critRateOverride, 100);
    assert.equal(technique.multipliers[9], 360);
    const techniqueResult = engine.calculate(request({ ...technique, attackType: technique.type, multiplier: technique.multipliers[9] }));
    assert.equal(techniqueResult.breakdown.critRatePercent, 100);
    assert.equal(techniqueResult.expected, techniqueResult.crit);
    assert.equal(e6.requiredEidolon, 6);
    assert.equal(e6.multipliers[9], 108);
    assert.equal(e6.multipliers[9], attacks.find((item) => item.id === "1110203").multipliers[9] * 0.15);
});

test("Serval 1103 golden: direct, blast, talent, technique, and Shock records preserve reviewed values", () => {
    const normal = attacks.find((item) => item.id === "110301");
    const skill = attacks.find((item) => item.id === "110302");
    const shock = attacks.find((item) => item.id === "1103021");
    const ultimate = attacks.find((item) => item.id === "110303");
    const talent = attacks.find((item) => item.id === "110304");
    const technique = attacks.find((item) => item.id === "110307");
    const techniqueShock = attacks.find((item) => item.id === "1103071");
    assert.equal(normal.multipliers[9], 140);
    assert.equal(skill.multipliers[9], 140);
    assert.equal(skill.adjacentMultipliers[9], 60);
    assert.equal(shock.multipliers[9], 104);
    assert.equal(shock.canCrit, false);
    assert.equal(ultimate.multipliers[9], 180);
    assert.equal(talent.multipliers[9], 72);
    assert.equal(technique.type, "technique");
    assert.equal(technique.multipliers[0], 50);
    assert.equal(techniqueShock.canCrit, false);
    assert.equal(techniqueShock.multipliers[0], 50);
});

test("Serval 1103 golden: E1 adjacent hit is exactly sixty percent of the normal attack", () => {
    const normal = attacks.find((item) => item.id === "110301");
    const eidolon1 = attacks.find((item) => item.id === "1103011");
    assert.equal(eidolon1.requiredEidolon, 1);
    assert.equal(eidolon1.target, "adjacent");
    normal.multipliers.forEach((value, index) => assert.equal(eidolon1.multipliers[index], value * 0.6));
});

test("Serval 1103 golden: Frenzy uses base ATK and E6 applies only when the Shock condition is enabled", () => {
    const context = { characterId: "1103", eidolon: 6 };
    const frenzyOff = structured("traceNode:1103:1103103:defeat-atk", context);
    const frenzyOn = structured("traceNode:1103:1103103:defeat-atk", context, { "serval-after-defeat-atk": true });
    const e6Off = structured("eidolon:1103:6:shocked-damage", context);
    const e6On = structured("eidolon:1103:6:shocked-damage", context, { "serval-target-shocked": true });
    assert.equal(frenzyOff.enabled, false);
    assert.equal(frenzyOn.value, 20);
    assert.equal(e6Off.enabled, false);
    assert.equal(e6On.value, 30);
    const normal = attacks.find((item) => item.id === "110301");
    const baseInput = request({ ...normal, attackType: normal.type, multiplier: normal.multipliers[9] }, [frenzyOn, e6On]);
    baseInput.character.baseStats = { atk: 1000 };
    const result = engine.calculate(baseInput);
    assert.equal(result.breakdown.referenceValue, 1200);
    assert.equal(result.breakdown.damageBonus, 30);
    assert.deepEqual(Array.from(result.applied, (item) => item.id), ["traceNode:1103:1103103:defeat-atk", "eidolon:1103:6:shocked-damage"]);
});

test("Gepard 1104 golden: direct skill and Frozen additional damage remain separate", () => {
    const normal = attacks.find((item) => item.id === "110401");
    const skill = attacks.find((item) => item.id === "110402");
    const frozen = attacks.find((item) => item.id === "1104021");
    assert.equal(normal.multipliers[5], 100);
    assert.equal(normal.multipliers[9], 140);
    assert.equal(skill.multipliers[9], 200);
    assert.equal(skill.multipliers[14], 250);
    assert.equal(frozen.type, "additional");
    assert.equal(frozen.multipliers[9], 60);
    assert.equal(frozen.canCrit, false);
    const result = engine.calculate(request({ ...frozen, attackType: frozen.type, multiplier: frozen.multipliers[9] }));
    assert.equal(result.nonCrit, result.crit);
    assert.equal(result.crit, result.expected);
});

test("Gepard 1104 golden: Fighting Spirit converts exactly thirty-five percent of current DEF to flat ATK", () => {
    const fightingSpirit = structured("traceNode:1104:1104103:defense-to-atk", { characterId: "1104", stats: { def: 1000 }, traceLevelFor: () => 1 });
    assert.equal(fightingSpirit.enabled, true);
    assert.equal(fightingSpirit.value, 350);
    assert.equal(fightingSpirit.valueInput.providerStat, "def");
    const normal = attacks.find((item) => item.id === "110401");
    const result = engine.calculate(request({ ...normal, attackType: normal.type, multiplier: normal.multipliers[5] }, [fightingSpirit]));
    assert.equal(result.breakdown.referenceValue, 1350);
    assert.ok(Math.abs(result.nonCrit - 486) < 1e-9);
    assert.equal(result.applied[0].id, "traceNode:1104:1104103:defense-to-atk");
});

test("Gepard 1104 golden: minor traces are summarized and eidolon utility remains quarantined", () => {
    const context = { characterId: "1104", eidolon: 6 };
    const ice = structured("traceStats:1104:ice-damage", context);
    const effectRes = structured("traceStats:1104:effect-res", context);
    const defense = structured("traceStats:1104:defense", context);
    const e4 = structured("eidolon:1104:4:party-effect-res", context);
    assert.equal(ice.value, 22.4);
    assert.equal(effectRes.value, 18);
    assert.equal(defense.value, 12.5);
    [ice, effectRes, defense, e4].forEach((item) => {
        assert.equal(item.displayOnly, true);
        assert.equal(item.enabled, false);
    });
    assert.equal(structured("eidolon:1104:4:party-effect-res", { characterId: "1104", eidolon: 3 }), undefined);
});

test("Natasha 1105 golden: normal, technique, and E6 HP damage use independent records", () => {
    const normal = attacks.find((item) => item.id === "110501");
    const technique = attacks.find((item) => item.id === "110507");
    const eidolon6 = attacks.find((item) => item.id === "1105016");
    assert.equal(normal.multipliers[5], 100);
    assert.equal(normal.multipliers[9], 140);
    assert.equal(technique.type, "technique");
    assert.equal(technique.multipliers[0], 80);
    assert.equal(eidolon6.requiredEidolon, 6);
    assert.equal(eidolon6.type, "additional");
    assert.equal(eidolon6.scalingStat, "hp");
    assert.equal(eidolon6.multipliers[0], 40);
});

test("Natasha 1105 golden: E6 additional damage scales from HP and remains critical-capable", () => {
    const eidolon6 = attacks.find((item) => item.id === "1105016");
    const result = engine.calculate(request({ ...eidolon6, attackType: eidolon6.type, multiplier: eidolon6.multipliers[0] }));
    assert.equal(result.breakdown.referenceValue, 5000);
    assert.ok(Math.abs(result.nonCrit - 720) < 1e-9);
    assert.ok(Math.abs(result.crit - 1440) < 1e-9);
    assert.ok(Math.abs(result.expected - 1080) < 1e-9);
});

test("Natasha 1105 golden: healing and utility stay display-only while minor traces are summarized", () => {
    const context = { characterId: "1105", eidolon: 6, traceLevelFor: () => 10 };
    const selected = runtime.buildCandidates(structuredModifiers, context, {}).filter((item) => String(item.source?.id) === "1105");
    assert.equal(selected.length, 17);
    assert.ok(selected.every((item) => item.displayOnly && !item.enabled));
    assert.equal(structured("trace:1105:110502:initial-heal", context).value, 10.5);
    assert.equal(structured("trace:1105:110502:heal-over-time", context).value, 7.2);
    assert.equal(structured("trace:1105:110503:party-heal", context).value, 13.8);
    assert.equal(structured("traceStats:1105:hp", context).value, 28);
    assert.equal(structured("traceStats:1105:effect-res", context).value, 18);
    assert.equal(structured("traceStats:1105:defense", context).value, 12.5);
});

test("Pela 1106 golden: normal, skill, ultimate, technique, and E6 additional attacks are exact records", () => {
    const normal = attacks.find((item) => item.id === "110601");
    const skill = attacks.find((item) => item.id === "110602");
    const ultimate = attacks.find((item) => item.id === "110603");
    const technique = attacks.find((item) => item.id === "110607");
    const eidolon6 = attacks.find((item) => item.id === "1106016");
    assert.equal(normal.multipliers[5], 100);
    assert.equal(skill.multipliers[9], 210);
    assert.equal(ultimate.multipliers[9], 100);
    assert.equal(technique.multipliers[0], 80);
    assert.equal(technique.type, "technique");
    assert.equal(eidolon6.requiredEidolon, 6);
    assert.equal(eidolon6.enemyDebuffMinimum, 1);
    assert.equal(eidolon6.type, "additional");
    assert.equal(eidolon6.multipliers[0], 40);
});

test("Pela 1106 golden: automatic debuff condition and manual effects retain independent stages", () => {
    const context = { characterId: "1106", eidolon: 6, enemy: { debuffCount: 1 }, traceLevelFor: () => 10 };
    const inputs = { "pela-general-solution": true, "pela-technique-defense-down": true, "pela-after-dispel-damage": true, "pela-e4-ice-res-down": true };
    const ids = [
        "trace:1106:110603:defense-reduction",
        "trace:1106:110607:defense-reduction",
        "traceNode:1106:1106101:debuffed-damage",
        "traceNode:1106:1106103:after-dispel-damage",
        "eidolon:1106:4:ice-resistance-reduction"
    ];
    const applied = ids.map((id) => structured(id, context, inputs));
    assert.ok(applied.every((item) => item?.enabled));
    assert.equal(applied.find((item) => item.id.includes("1106101")).automatic, true);
    const normal = attacks.find((item) => item.id === "110601");
    const result = engine.calculate(request({ ...normal, attackType: normal.type, multiplier: normal.multipliers[5], element: "Ice" }, applied));
    assert.ok(Math.abs(result.nonCrit - 828) < 1e-9);
    assert.ok(Math.abs(result.crit - 1656) < 1e-9);
    assert.deepEqual(result.applied.map((item) => item.id).sort(), ids.sort());
});

test("Pela 1106 golden: all traces and eidolons are classified without double-applying final stats", () => {
    const context = { characterId: "1106", eidolon: 6, enemy: { debuffCount: 0 }, traceLevelFor: () => 10 };
    const selected = runtime.buildCandidates(structuredModifiers, context, {}).filter((item) => String(item.source?.id) === "1106");
    assert.equal(selected.length, 16);
    assert.equal(structured("traceNode:1106:1106101:debuffed-damage", context).enabled, false);
    assert.equal(structured("traceNode:1106:1106101:debuffed-damage", { ...context, enemy: { debuffCount: 1 } }).enabled, true);
    assert.equal(structured("traceStats:1106:ice-damage", context).value, 22.4);
    assert.equal(structured("traceStats:1106:attack", context).value, 18);
    assert.equal(structured("traceStats:1106:effect-hit", context).value, 10);
    ["traceStats:1106:ice-damage", "traceStats:1106:attack", "traceStats:1106:effect-hit", "traceNode:1106:1106102:party-effect-hit", "eidolon:1106:2:speed"].forEach((id) => {
        const item = structured(id, context);
        assert.equal(item.displayOnly, true);
        assert.equal(item.enabled, false);
    });
});

test("Clara 1107 golden: marked skill and both counter forms remain separate attacks", () => {
    const normal = attacks.find((item) => item.id === "110701");
    const skill = attacks.find((item) => item.id === "110702");
    const marked = attacks.find((item) => item.id === "1107021");
    const counter = attacks.find((item) => item.id === "110704");
    const enhanced = attacks.find((item) => item.id === "1107031");
    assert.equal(normal.multipliers[5], 100);
    assert.equal(skill.multipliers[9], 120);
    assert.equal(marked.multipliers[9], 240);
    assert.equal(counter.multipliers[9], 160);
    assert.equal(enhanced.multipliers[9], 320);
    assert.equal(enhanced.adjacentMultipliers[9], 160);
    assert.deepEqual(enhanced.multiplierComponents.map((item) => item.traceKey), ["talent", "ultimate"]);
    assert.equal(enhanced.multiplierComponents[0].values[7] + enhanced.multiplierComponents[1].values[5], 268);
});

test("Clara 1107 golden: Revenge affects counters only and E2 uses base ATK", () => {
    const context = { characterId: "1107", eidolon: 6, traceLevelFor: () => 10 };
    const revenge = structured("traceNode:1107:1107103:counter-damage", context);
    const eidolon2 = structured("eidolon:1107:2:ultimate-atk", context, { "clara-e2-ultimate-atk": true });
    assert.ok(revenge.enabled && revenge.automatic);
    assert.ok(eidolon2.enabled && !eidolon2.automatic);
    const counter = attacks.find((item) => item.id === "110704");
    const counterResult = engine.calculate(request({ ...counter, attackType: counter.type, multiplier: counter.multipliers[9], element: "Physical" }, [revenge]));
    assert.ok(Math.abs(counterResult.nonCrit - 748.8) < 1e-9);
    const normal = attacks.find((item) => item.id === "110701");
    const normalRequest = request({ ...normal, attackType: normal.type, multiplier: normal.multipliers[5], element: "Physical" }, [revenge, eidolon2]);
    normalRequest.character.baseStats = { atk: 1000 };
    const normalResult = engine.calculate(normalRequest);
    assert.ok(Math.abs(normalResult.nonCrit - 468) < 1e-9);
    assert.deepEqual(normalResult.applied.map((item) => item.id), ["eidolon:1107:2:ultimate-atk"]);
});

test("Clara 1107 golden: all trace and eidolon effects are explicitly classified", () => {
    const context = { characterId: "1107", eidolon: 6, traceLevelFor: () => 10 };
    const selected = runtime.buildCandidates(structuredModifiers, context, {}).filter((item) => String(item.source?.id) === "1107");
    assert.equal(selected.length, 19);
    assert.equal(structured("trace:1107:110703:damage-reduction", context).value, 25);
    assert.equal(structured("trace:1107:110704:counter", context).value, 160);
    assert.equal(structured("traceStats:1107:attack", context).value, 28);
    assert.equal(structured("traceStats:1107:physical-damage", context).value, 14.4);
    assert.equal(structured("traceStats:1107:hp", context).value, 10);
    assert.equal(structured("eidolon:1107:6:ally-counter", { ...context, eidolon: 5 }), undefined);
    assert.equal(selected.filter((item) => item.displayOnly).length, 17);
});

test("Sampo 1108 golden: direct attacks, bounce hits, Wind Shear, and E4 detonation stay separate", () => {
    const normal = attacks.find((item) => item.id === "110801");
    const skill = attacks.find((item) => item.id === "110802");
    const ultimate = attacks.find((item) => item.id === "110803");
    const windShear = attacks.find((item) => item.id === "110804");
    const detonation = attacks.find((item) => item.id === "1108044");
    assert.equal(normal.multipliers[5], 100);
    assert.equal(skill.multipliers[9], 56);
    assert.equal(skill.hitCount, 5);
    assert.deepEqual(skill.hitCountAtEidolon, { rank: 1, value: 6 });
    assert.equal(ultimate.multipliers[9], 160);
    assert.equal(windShear.multipliers[9], 52);
    assert.equal(windShear.canCrit, false);
    assert.equal(detonation.requiredEidolon, 4);
    assert.equal(detonation.modifierInputMinimum, 5);
    assert.equal(detonation.multipliers[9], 4.16);
    assert.equal(detonation.multiplierAdditionScale, 0.08);
});

test("Sampo 1108 golden: five Wind Shear stacks, E6, and ultimate vulnerability use independent stages", () => {
    const context = { characterId: "1108", eidolon: 6, traceLevelFor: () => 10 };
    const stacks = structured("trace:1108:110804:wind-shear-stacks", context, { "sampo-wind-shear-stacks": 5 });
    const eidolon6 = structured("eidolon:1108:6:wind-shear-multiplier", context);
    const vulnerability = structured("trace:1108:110803:dot-vulnerability", context, { "sampo-ultimate-dot-vulnerability": true });
    assert.equal(stacks.value, 5);
    assert.equal(eidolon6.value, 15);
    assert.equal(vulnerability.value, 30);
    const attack = attacks.find((item) => item.id === "110804");
    const result = engine.calculate(request({ ...attack, attackType: attack.type, element: "Wind", multiplier: attack.multipliers[9], hitCount: 5, hitCountReference: attack.hitCountInputKey }, [stacks, eidolon6, vulnerability]));
    assert.ok(Math.abs(result.nonCrit - 1567.8) < 1e-9);
    assert.equal(result.crit, result.nonCrit);
    assert.equal(result.breakdown.multiplierAddition, 15);
    assert.equal(result.breakdown.takenDamage, 30);
    const normal = attacks.find((item) => item.id === "110801");
    const normalResult = engine.calculate(request({ ...normal, attackType: normal.type, element: "Wind", multiplier: normal.multipliers[5] }, [eidolon6, vulnerability]));
    assert.equal(normalResult.applied.length, 0);
});

test("Sampo 1108 golden: E4 detonation scales both the talent multiplier and E6 addition by eight percent", () => {
    const context = { characterId: "1108", eidolon: 6, traceLevelFor: () => 10 };
    const eidolon6 = structured("eidolon:1108:6:wind-shear-multiplier", context);
    const vulnerability = structured("trace:1108:110803:dot-vulnerability", context, { "sampo-ultimate-dot-vulnerability": true });
    const attack = attacks.find((item) => item.id === "1108044");
    const result = engine.calculate(request({ ...attack, attackType: attack.type, element: "Wind", multiplier: attack.multipliers[9], hitCount: 5, hitCountReference: attack.hitCountInputKey }, [eidolon6, vulnerability]));
    assert.ok(Math.abs(result.nonCrit - 125.424) < 1e-9);
    assert.ok(Math.abs(result.breakdown.multiplierAddition - 1.2) < 1e-9);
    const selected = runtime.buildCandidates(structuredModifiers, context, {}).filter((item) => String(item.source?.id) === "1108");
    assert.equal(selected.length, 16);
    assert.equal(selected.filter((item) => item.displayOnly).length, 13);
    assert.equal(structured("traceStats:1108:attack", context).value, 28);
    assert.equal(structured("traceStats:1108:effect-hit", context).value, 18);
    assert.equal(structured("traceStats:1108:effect-res", context).value, 10);
});

test("Hook 1109 golden: direct, enhanced, Burn, talent, and technique attacks stay separate", () => {
    const normal = attacks.find((item) => item.id === "110901");
    const skill = attacks.find((item) => item.id === "110902");
    const burn = attacks.find((item) => item.id === "1109021");
    const enhanced = attacks.find((item) => item.id === "110909");
    const ultimate = attacks.find((item) => item.id === "110903");
    const talent = attacks.find((item) => item.id === "110904");
    const technique = attacks.find((item) => item.id === "110907");
    const techniqueBurn = attacks.find((item) => item.id === "1109071");
    assert.equal(normal.multipliers[5], 100);
    assert.equal(skill.multipliers[9], 240);
    assert.equal(burn.multipliers[9], 65);
    assert.equal(burn.canCrit, false);
    assert.equal(enhanced.multipliers[9], 280);
    assert.equal(enhanced.adjacentMultipliers[9], 80);
    assert.equal(ultimate.multipliers[9], 400);
    assert.equal(talent.multipliers[9], 100);
    assert.equal(talent.modifierInputKey, "hook-enemy-burning");
    assert.equal(technique.multipliers[0], 50);
    assert.equal(techniqueBurn.canCrit, false);
});

test("Hook 1109 golden: E1 stays enhanced-skill-only and E6 follows the shared Burn condition", () => {
    const context = { characterId: "1109", eidolon: 6, traceLevelFor: () => 10 };
    const burning = structured("trace:1109:110902:burning-state", context, { "hook-enemy-burning": true });
    const e1 = structured("eidolon:1109:1:enhanced-skill-damage", context);
    const e6 = structured("eidolon:1109:6:burned-damage", context, { "hook-enemy-burning": true });
    assert.ok(burning.enabled && e1.enabled && e6.enabled);
    const enhanced = attacks.find((item) => item.id === "110909");
    const enhancedResult = engine.calculate(request({ ...enhanced, attackType: enhanced.type, element: "Fire", multiplier: enhanced.multipliers[9] }, [burning, e1, e6]));
    const adjacentResult = engine.calculate(request({ ...enhanced, attackType: enhanced.type, element: "Fire", multiplier: enhanced.adjacentMultipliers[9], target: "adjacent" }, [burning, e1, e6]));
    assert.ok(Math.abs(enhancedResult.nonCrit - 1411.2) < 1e-9);
    assert.ok(Math.abs(adjacentResult.nonCrit - 403.2) < 1e-9);
    const normal = attacks.find((item) => item.id === "110901");
    const normalResult = engine.calculate(request({ ...normal, attackType: normal.type, element: "Fire", multiplier: normal.multipliers[5] }, [burning, e1, e6]));
    assert.ok(Math.abs(normalResult.nonCrit - 432) < 1e-9);
    assert.deepEqual(normalResult.applied.map((item) => item.id), ["trace:1109:110902:burning-state", "eidolon:1109:6:burned-damage"]);
});

test("Hook 1109 golden: Burn and talent remain non-critical/conditional and every modifier is classified", () => {
    const context = { characterId: "1109", eidolon: 6, traceLevelFor: () => 10 };
    const burning = structured("trace:1109:110902:burning-state", context, { "hook-enemy-burning": true });
    const e6 = structured("eidolon:1109:6:burned-damage", context, { "hook-enemy-burning": true });
    const burn = attacks.find((item) => item.id === "1109021");
    const burnResult = engine.calculate(request({ ...burn, attackType: burn.type, element: "Fire", multiplier: burn.multipliers[9] }, [burning, e6]));
    assert.ok(Math.abs(burnResult.nonCrit - 280.8) < 1e-9);
    assert.equal(burnResult.crit, burnResult.nonCrit);
    const talent = attacks.find((item) => item.id === "110904");
    const talentResult = engine.calculate(request({ ...talent, attackType: talent.type, element: "Fire", multiplier: talent.multipliers[9] }, [burning, e6]));
    assert.ok(Math.abs(talentResult.nonCrit - 432) < 1e-9);
    const selected = runtime.buildCandidates(structuredModifiers, context, {}).filter((item) => String(item.source?.id) === "1109");
    assert.equal(selected.length, 17);
    assert.equal(selected.filter((item) => item.displayOnly).length, 14);
    assert.equal(structured("traceStats:1109:attack", context).value, 22);
    assert.equal(structured("traceStats:1109:hp", context).value, 18);
    assert.equal(structured("traceStats:1109:crit-damage", context).value, 13.3);
});

test("Lynx 1110 golden: normal attack uses max HP rather than ATK", () => {
    const normal = attacks.find((item) => item.id === "111001");
    assert.equal(normal.scalingStat, "hp");
    assert.equal(normal.multipliers[5], 50);
    const result = engine.calculate(request({ ...normal, attackType: normal.type, element: "Quantum", multiplier: normal.multipliers[5] }));
    assert.ok(Math.abs(result.nonCrit - 900) < 1e-9);
    assert.ok(Math.abs(result.crit - 1800) < 1e-9);
});

test("Lynx 1110 golden: Survival Response synchronizes skill, E4, and E6 provider-HP buffs", () => {
    const context = { characterId: "1110", eidolon: 6, stats: { hp: 5000 }, traceLevelFor: () => 10 };
    const inputs = { "lynx-survival-response": true };
    const skill = structured("trace:1110:111002:max-hp", context, inputs);
    const e4 = structured("eidolon:1110:4:hp-to-atk", context, inputs);
    const e6 = structured("eidolon:1110:6:max-hp", context, inputs);
    assert.equal(skill.value, 575);
    assert.equal(e4.value, 150);
    assert.equal(e6.value, 300);
    const normal = attacks.find((item) => item.id === "111001");
    const result = engine.calculate(request({ ...normal, attackType: normal.type, element: "Quantum", multiplier: normal.multipliers[5] }, [skill, e4, e6]));
    assert.ok(Math.abs(result.nonCrit - 1057.5) < 1e-9);
    assert.equal(result.breakdown.referenceValue, 5875);
    assert.deepEqual(result.applied.map((item) => item.id), ["trace:1110:111002:max-hp", "eidolon:1110:4:hp-to-atk", "eidolon:1110:6:max-hp"]);
});

test("Lynx 1110 golden: healing and utility remain quarantined and every effect is classified", () => {
    const context = { characterId: "1110", eidolon: 6, stats: { hp: 5000 }, traceLevelFor: () => 10 };
    const selected = runtime.buildCandidates(structuredModifiers, context, {}).filter((item) => String(item.source?.id) === "1110");
    assert.equal(selected.length, 18);
    assert.equal(selected.filter((item) => item.displayOnly).length, 15);
    assert.equal(structured("traceStats:1110:hp", context).value, 28);
    assert.equal(structured("traceStats:1110:defense", context).value, 22.5);
    assert.equal(structured("traceStats:1110:effect-res", context).value, 10);
    ["trace:1110:111002:heal", "trace:1110:111003:party-heal", "trace:1110:111004:continuous-heal", "trace:1110:111007:technique-heal"].forEach((id) => assert.equal(structured(id, context).displayOnly, true));
});

test("Luka 1111 golden: direct attacks, enhanced-normal segments, Bleed, and detonations stay separate", () => {
    const normal = attacks.find((item) => item.id === "111101");
    const skill = attacks.find((item) => item.id === "111102");
    const bleed = attacks.find((item) => item.id === "1111021");
    const ultimate = attacks.find((item) => item.id === "111103");
    const punches = attacks.find((item) => item.id === "1111081");
    const finisher = attacks.find((item) => item.id === "1111082");
    const expectedPunch = attacks.find((item) => item.id === "11111031");
    const talentDetonation = attacks.find((item) => item.id === "1111041");
    assert.equal(normal.multipliers[5], 100);
    assert.equal(skill.multipliers[9], 120);
    assert.equal(ultimate.multipliers[9], 330);
    assert.equal(bleed.damageFormula, "enemyHpCappedByAtk");
    assert.equal(bleed.atkCapMultipliers[9], 338);
    assert.equal(bleed.canCrit, false);
    assert.equal(punches.hitCount, 3);
    assert.equal(punches.multipliers[5], 20);
    assert.equal(finisher.multipliers[5], 80);
    assert.equal(expectedPunch.multipliers[5], 30);
    assert.equal(talentDetonation.multipliers[9], 85);
    assert.equal(talentDetonation.modifierConditions.length, 2);
});

test("Luka 1111 golden: Bleed switches from enemy-HP basis to the ATK cap and E4 raises that cap", () => {
    const context = { characterId: "1111", eidolon: 6, traceLevelFor: () => 10 };
    const inputs = { "luka-enemy-bleeding": true, "luka-fighting-will-stacks": 4 };
    const bleeding = structured("trace:1111:111102:bleeding-state", context, inputs);
    const e4 = structured("eidolon:1111:4:fighting-will-atk", context, inputs);
    assert.equal(e4.value, 20);
    const bleed = attacks.find((item) => item.id === "1111021");
    const commonAttack = { ...bleed, attackType: bleed.type, element: "Physical", multiplier: 100, enemyHpPercent: 24, atkCapPercent: 338 };
    const lowHpRequest = request(commonAttack, [bleeding, e4]);
    lowHpRequest.character.baseStats = { atk: 500 };
    lowHpRequest.enemy.maxHp = 10000;
    const hpLimited = engine.calculate(lowHpRequest);
    assert.ok(Math.abs(hpLimited.breakdown.cappedEnemyHpDamage - 2400) < 1e-9);
    assert.ok(Math.abs(hpLimited.nonCrit - 864) < 1e-9);
    const highHpRequest = request(commonAttack, [bleeding, e4]);
    highHpRequest.character.baseStats = { atk: 500 };
    highHpRequest.enemy.maxHp = 100000;
    const atkLimited = engine.calculate(highHpRequest);
    assert.ok(Math.abs(atkLimited.breakdown.cappedEnemyHpDamage - 3718) < 1e-9);
    assert.ok(Math.abs(atkLimited.nonCrit - 1338.48) < 1e-9);
});

test("Luka 1111 golden: E1 and ultimate vulnerability use independent stages without making Bleed critical", () => {
    const context = { characterId: "1111", eidolon: 6, traceLevelFor: () => 10 };
    const inputs = { "luka-enemy-bleeding": true, "luka-ultimate-vulnerability": true };
    const bleeding = structured("trace:1111:111102:bleeding-state", context, inputs);
    const e1 = structured("eidolon:1111:1:bleeding-damage", context, inputs);
    const vulnerability = structured("trace:1111:111103:damage-taken", context, inputs);
    assert.ok(bleeding.enabled && e1.enabled && vulnerability.enabled);
    const bleed = attacks.find((item) => item.id === "1111021");
    const bleedRequest = request({ ...bleed, attackType: bleed.type, element: "Physical", multiplier: 100, enemyHpPercent: 24, atkCapPercent: 338 }, [bleeding, e1, vulnerability]);
    bleedRequest.enemy.maxHp = 10000;
    const result = engine.calculate(bleedRequest);
    assert.ok(Math.abs(result.nonCrit - 1192.32) < 1e-9);
    assert.equal(result.crit, result.nonCrit);
    assert.equal(result.breakdown.damageBonus, 15);
    assert.equal(result.breakdown.takenDamage, 20);
});

test("Luka 1111 golden: talent and E6 detonations share the current Bleed base but remain separate attacks", () => {
    const talent = attacks.find((item) => item.id === "1111041");
    const e6Fixed = attacks.find((item) => item.id === "1111061");
    const e6Expected = attacks.find((item) => item.id === "1111062");
    const common = { attackType: "dot", element: "Physical", enemyHpPercent: 24, atkCapPercent: 338 };
    const talentRequest = request({ ...talent, ...common, multiplier: talent.multipliers[9] });
    talentRequest.enemy.maxHp = 100000;
    const talentResult = engine.calculate(talentRequest);
    assert.ok(Math.abs(talentResult.nonCrit - 1034.28) < 1e-9);
    const fixedRequest = request({ ...e6Fixed, ...common, multiplier: 24 }); fixedRequest.enemy.maxHp = 100000;
    const expectedRequest = request({ ...e6Expected, ...common, multiplier: 12 }); expectedRequest.enemy.maxHp = 100000;
    assert.ok(Math.abs(engine.calculate(fixedRequest).nonCrit - 292.032) < 1e-9);
    assert.ok(Math.abs(engine.calculate(expectedRequest).nonCrit - 146.016) < 1e-9);
    const selected = runtime.buildCandidates(structuredModifiers, { characterId: "1111", eidolon: 6, traceLevelFor: () => 10 }, { "luka-enemy-bleeding": true, "luka-fighting-will-stacks": 4 });
    const own = selected.filter((item) => String(item.source?.id) === "1111");
    assert.equal(own.length, 17);
    assert.equal(own.filter((item) => item.displayOnly).length, 12);
    assert.equal(structured("traceStats:1111:attack", { characterId: "1111" }).value, 28);
    assert.equal(structured("traceStats:1111:effect-hit", { characterId: "1111" }).value, 18);
    assert.equal(structured("traceStats:1111:defense", { characterId: "1111" }).value, 12.5);
});

test("Topaz 1112 golden: normal, skill Numby, and talent Numby attacks remain separate", () => {
    const normal = attacks.find((item) => item.id === "111201");
    const skill = attacks.find((item) => item.id === "111202");
    const talent = attacks.find((item) => item.id === "111204");
    const ultimate = attacks.find((item) => item.id === "111203");
    const technique = attacks.find((item) => item.id === "111207");
    assert.equal(normal.multipliers[5], 100);
    assert.ok(normal.tags.includes("followUp"));
    assert.equal(skill.multipliers[9], 150);
    assert.equal(talent.multipliers[9], 150);
    assert.equal(skill.type, "followUp");
    assert.equal(talent.type, "followUp");
    assert.equal(ultimate.hidden, true);
    assert.equal(technique.hidden, true);
});

test("Topaz 1112 golden: Debt Proof and Windfall affect follow-up tags but not unrelated attacks", () => {
    const context = { characterId: "1112", eidolon: 0, traceLevelFor: () => 10, enemy: { weakness: false } };
    const inputs = { "topaz-debt-proof": true, "topaz-windfall": true };
    const debt = structured("trace:1112:111202:debt-proof", context, inputs);
    const multiplier = structured("trace:1112:111203:windfall-multiplier", context, inputs);
    const critDamage = structured("trace:1112:111203:windfall-crit-damage", context, inputs);
    assert.equal(debt.value, 50);
    assert.equal(multiplier.value, 150);
    assert.equal(critDamage.value, 25);
    const topazNormal = attacks.find((item) => item.id === "111201");
    const tagged = engine.calculate(request({ ...topazNormal, attackType: "normal", element: "Fire", multiplier: 100 }, [debt, multiplier, critDamage]));
    assert.ok(Math.abs(tagged.nonCrit - 1350) < 1e-9);
    assert.ok(Math.abs(tagged.crit - 3037.5) < 1e-9);
    const unrelated = engine.calculate(request({ attackType: "normal", type: "normal", element: "Fire", multiplier: 100 }, [debt, multiplier, critDamage]));
    assert.ok(Math.abs(unrelated.nonCrit - 360) < 1e-9);
    assert.deepEqual(unrelated.applied, []);
});

test("Topaz 1112 golden: weakness, E1 stacks, and E6 resistance penetration keep independent conditions", () => {
    const context = { characterId: "1112", eidolon: 6, traceLevelFor: () => 10, enemy: { weakness: true } };
    const inputs = { "topaz-debt-proof": true, "topaz-windfall": true, "topaz-forced-execution-stacks": 2 };
    const weakness = structured("traceNode:1112:1112102:fire-weakness-damage", context, inputs);
    const e1 = structured("eidolon:1112:1:forced-execution", context, inputs);
    const e6 = structured("eidolon:1112:6:windfall-res-penetration", context, inputs);
    assert.equal(weakness.enabled, true);
    assert.equal(weakness.value, 15);
    assert.equal(e1.value, 50);
    assert.equal(e6.value, 10);
    const talent = attacks.find((item) => item.id === "111204");
    const result = engine.calculate(request({ ...talent, attackType: talent.type, element: "Fire", multiplier: talent.multipliers[9] }, [weakness, e1, e6]));
    assert.ok(Math.abs(result.nonCrit - 698.625) < 1e-9);
    assert.ok(Math.abs(result.crit - 1746.5625) < 1e-9);
    assert.equal(result.breakdown.damageBonus, 15);
    assert.equal(result.breakdown.resistance, 0.9);
    assert.ok(result.applied.some((item) => item.id === "eidolon:1112:6:windfall-res-penetration"));
    const own = runtime.buildCandidates(structuredModifiers, context, inputs).filter((item) => String(item.source?.id) === "1112");
    assert.equal(own.length, 19);
    assert.equal(own.filter((item) => item.displayOnly).length, 13);
    assert.equal(structured("traceStats:1112:fire-damage", context).value, 22.4);
    assert.equal(structured("traceStats:1112:crit-rate", context).value, 12);
    assert.equal(structured("traceStats:1112:hp", context).value, 10);
});

test("Qingque 1201 golden: normal, enhanced blast, ultimate, and Autarky attacks remain separate", () => {
    const normal = attacks.find((item) => item.id === "120101");
    const enhanced = attacks.find((item) => item.id === "120108");
    const ultimate = attacks.find((item) => item.id === "120103");
    const normalFollowUp = attacks.find((item) => item.id === "1201041");
    const enhancedFollowUp = attacks.find((item) => item.id === "1201042");
    assert.equal(normal.multipliers[5], 100);
    assert.equal(enhanced.multipliers[5], 240);
    assert.equal(enhanced.adjacentMultipliers[5], 100);
    assert.equal(ultimate.multipliers[9], 200);
    assert.equal(normalFollowUp.requiredEidolon, 4);
    assert.deepEqual(normalFollowUp.tags, ["normal"]);
    assert.deepEqual(enhancedFollowUp.tags, ["enhancedNormal"]);
    assert.equal(enhancedFollowUp.modifierInputKey, "qingque-autarky-active");
});

test("Qingque 1201 golden: skill stacks, Tenpai, and Concealed Kong keep independent stages and scopes", () => {
    const context = { characterId: "1201", eidolon: 6, traceLevelFor: () => 10 };
    const inputs = { "qingque-skill-stacks": 4, "qingque-concealed-kong": true, "qingque-autarky-active": true };
    const skill = structured("trace:1201:120102:skill-damage-stacks", context, inputs);
    const tenpai = structured("traceNode:1201:1201102:skill-damage-addition", context, inputs);
    const talent = structured("trace:1201:120104:concealed-kong-atk", context, inputs);
    assert.equal(skill.value, 112);
    assert.equal(tenpai.value, 40);
    assert.equal(talent.value, 72);
    const enhanced = attacks.find((item) => item.id === "120108");
    const enhancedRequest = request({ ...enhanced, attackType: enhanced.type, element: "Quantum", multiplier: enhanced.multipliers[5] }, [skill, tenpai, talent]);
    enhancedRequest.character.baseStats = { atk: 500 };
    const enhancedResult = engine.calculate(enhancedRequest);
    assert.ok(Math.abs(enhancedResult.nonCrit - 2961.1008) < 1e-9);
    const normal = attacks.find((item) => item.id === "120101");
    const normalRequest = request({ ...normal, attackType: normal.type, element: "Quantum", multiplier: normal.multipliers[5] }, [skill, tenpai, talent]);
    normalRequest.character.baseStats = { atk: 500 };
    const normalResult = engine.calculate(normalRequest);
    assert.ok(Math.abs(normalResult.nonCrit - 907.2) < 1e-9);
    assert.ok(normalResult.skipped.some((item) => item.id === talent.id));
    const enhancedFollowUp = attacks.find((item) => item.id === "1201042");
    const followUpRequest = request({ ...enhancedFollowUp, attackType: enhancedFollowUp.type, element: "Quantum", multiplier: enhancedFollowUp.multipliers[5] }, [talent]);
    followUpRequest.character.baseStats = { atk: 500 };
    assert.ok(engine.calculate(followUpRequest).applied.some((item) => item.id === talent.id));
});

test("Qingque 1201 golden: E1 is ultimate-only and every trace and eidolon effect is classified", () => {
    const context = { characterId: "1201", eidolon: 6, traceLevelFor: () => 10 };
    const e1 = structured("eidolon:1201:1:ultimate-damage", context);
    const ultimate = attacks.find((item) => item.id === "120103");
    const ultimateResult = engine.calculate(request({ ...ultimate, attackType: ultimate.type, element: "Quantum", multiplier: ultimate.multipliers[9] }, [e1]));
    assert.ok(Math.abs(ultimateResult.nonCrit - 792) < 1e-9);
    const normal = attacks.find((item) => item.id === "120101");
    const normalResult = engine.calculate(request({ ...normal, attackType: normal.type, element: "Quantum", multiplier: normal.multipliers[5] }, [e1]));
    assert.ok(Math.abs(normalResult.nonCrit - 360) < 1e-9);
    assert.deepEqual(normalResult.applied, []);
    const own = runtime.buildCandidates(structuredModifiers, context, {}).filter((item) => String(item.source?.id) === "1201");
    assert.equal(own.length, 15);
    assert.equal(own.filter((item) => item.displayOnly).length, 10);
    assert.equal(structured("traceStats:1201:attack", context).value, 28);
    assert.equal(structured("traceStats:1201:quantum-damage", context).value, 14.4);
    assert.equal(structured("traceStats:1201:defense", context).value, 12.5);
});

test("Tingyun 1202 golden: normal attack and Disaster Expeller keep self-only scope", () => {
    const normal = attacks.find((item) => item.id === "120201");
    const a2 = structured("traceNode:1202:1202102:normal-damage", { characterId: "1202", traceLevelFor: () => 10 });
    assert.equal(normal.multipliers[5], 100);
    assert.equal(a2.value, 40);
    const result = engine.calculate(request({ ...normal, attackType: normal.type, element: "Thunder", multiplier: normal.multipliers[5] }, [a2]));
    assert.ok(Math.abs(result.nonCrit - 504) < 1e-9);
    const unrelated = engine.calculate(request({ attackType: "skill", type: "skill", element: "Thunder", multiplier: 100 }, [a2]));
    assert.ok(Math.abs(unrelated.nonCrit - 360) < 1e-9);
    assert.deepEqual(unrelated.applied, []);
});

test("Tingyun 1202 golden: Benediction ATK uses target base ATK and Tingyun current ATK cap", () => {
    const baseContext = { characterId: "1102", partyIds: ["1202"], partyEidolons: { "1202": 6 }, partyStats: { "1202": { atk: 1000 } }, baseStats: { atk: 600 }, traceLevelFor: () => 10 };
    const capped = structured("trace:1202:120202:benediction-atk", baseContext, { "tingyun-benediction": true });
    assert.equal(capped.value, 250);
    const uncapped = structured("trace:1202:120202:benediction-atk", { ...baseContext, partyStats: { "1202": { atk: 2000 } } }, { "tingyun-benediction": true });
    assert.equal(uncapped.value, 300);
    const targetAttack = { attackType: "normal", type: "normal", element: "Quantum", multiplier: 100 };
    const targetRequest = request(targetAttack, [capped]);
    targetRequest.character.baseStats = { atk: 600 };
    assert.ok(Math.abs(engine.calculate(targetRequest).nonCrit - 450) < 1e-9);
});

test("Tingyun 1202 golden: supplemental Lightning attacks use the blessed ally and E4 only changes their multiplier", () => {
    const context = { characterId: "1102", partyIds: ["1202"], partyEidolons: { "1202": 6 }, partyStats: { "1202": { atk: 2000 } }, baseStats: { atk: 600 }, traceLevelFor: () => 10 };
    const ultimate = structured("trace:1202:120203:ultimate-damage", context, { "tingyun-ultimate-active": true });
    assert.equal(ultimate.value, 50);
    const result = engine.calculate(request({ attackType: "normal", type: "normal", element: "Quantum", multiplier: 100 }, [ultimate]));
    assert.ok(Math.abs(result.nonCrit - 540) < 1e-9);
    const skillExtra = structured("trace:1202:120202:benediction-extra-damage", context, { "tingyun-benediction": true });
    const talentExtra = structured("trace:1202:120204:talent-extra-damage", context, { "tingyun-benediction": true });
    const e4 = structured("eidolon:1202:4:extra-damage", context, { "tingyun-benediction": true });
    assert.equal(skillExtra.supplementalAttack.element, "Thunder");
    assert.equal(skillExtra.supplementalAttack.canCrit, true);
    assert.equal(skillExtra.value, 40);
    assert.equal(talentExtra.value, 60);
    assert.equal(e4.value, 20);
    const skillAttack = { ...skillExtra.supplementalAttack, attackType: "additional", multiplier: skillExtra.value };
    const skillResult = engine.calculate(request(skillAttack, [skillExtra, e4]));
    assert.ok(Math.abs(skillResult.nonCrit - 216) < 1e-9);
    assert.ok(Math.abs(skillResult.crit - 432) < 1e-9);
    assert.equal(skillResult.breakdown.multiplierPercent, 60);
    const talentAttack = { ...talentExtra.supplementalAttack, attackType: "additional", multiplier: talentExtra.value };
    const talentResult = engine.calculate(request(talentAttack, [talentExtra, e4]));
    assert.ok(Math.abs(talentResult.nonCrit - 288) < 1e-9);
    assert.equal(talentResult.breakdown.multiplierPercent, 80);
    const unrelated = engine.calculate(request({ attackType: "normal", type: "normal", element: "Quantum", multiplier: 100 }, [e4]));
    assert.deepEqual(unrelated.applied, []);
    const own = runtime.buildCandidates(structuredModifiers, { characterId: "1202", eidolon: 6, stats: { atk: 2000 }, baseStats: { atk: 600 }, traceLevelFor: () => 10 }, {}).filter((item) => String(item.source?.id) === "1202");
    assert.equal(own.length, 18);
    assert.equal(own.filter((item) => item.displayOnly).length, 12);
    assert.equal(own.filter((item) => item.calculable).length, 6);
});

test("Luocha 1203 golden: normal and ultimate keep exact reviewed multipliers while healing skills stay hidden", () => {
    const normal = attacks.find((item) => item.id === "120301");
    const ultimate = attacks.find((item) => item.id === "120303");
    const hidden = ["120302", "120304", "120307"].map((id) => attacks.find((item) => item.id === id));
    assert.equal(normal.multipliers[5], 100);
    assert.equal(ultimate.multipliers[9], 200);
    assert.equal(ultimate.target, "aoe");
    assert.ok(hidden.every((item) => item.hidden && item.multipliers.every((value) => value === 0)));
    const normalResult = engine.calculate(request({ ...normal, attackType: normal.type, element: "Imaginary", multiplier: normal.multipliers[5] }));
    const ultimateResult = engine.calculate(request({ ...ultimate, attackType: ultimate.type, element: "Imaginary", multiplier: ultimate.multipliers[9] }));
    assert.ok(Math.abs(normalResult.nonCrit - 360) < 1e-9);
    assert.ok(Math.abs(ultimateResult.nonCrit - 720) < 1e-9);
});

test("Luocha 1203 golden: E1 field ATK and E6 RES reduction use independent stages", () => {
    const context = { characterId: "1203", eidolon: 6, baseStats: { atk: 600 }, traceLevelFor: () => 10 };
    const e1 = structured("eidolon:1203:1:field-atk", context, { "luocha-field-active": true });
    const e6 = structured("eidolon:1203:6:all-res-down", context, { "luocha-e6-res-down": true });
    assert.equal(e1.value, 20);
    assert.equal(e6.value, 20);
    const attack = { attackType: "normal", type: "normal", element: "Imaginary", multiplier: 100 };
    const input = request(attack, [e1, e6]);
    input.character.baseStats = { atk: 600 };
    const result = engine.calculate(input);
    assert.ok(Math.abs(result.nonCrit - 504) < 1e-9);
    assert.equal(result.breakdown.resistance, 1);
    assert.deepEqual(Array.from(result.applied, (item) => item.id), ["eidolon:1203:1:field-atk", "eidolon:1203:6:all-res-down"]);
    const e1Off = structured("eidolon:1203:1:field-atk", context, { "luocha-field-active": false });
    const e6Off = structured("eidolon:1203:6:all-res-down", context, { "luocha-e6-res-down": false });
    const offInput = request(attack, [e1Off, e6Off]);
    offInput.character.baseStats = { atk: 600 };
    assert.ok(Math.abs(engine.calculate(offInput).nonCrit - 360) < 1e-9);
});

test("Luocha 1203 golden: every trace and eidolon is classified without treating enemy damage reduction as vulnerability", () => {
    const context = { characterId: "1203", eidolon: 6, baseStats: { atk: 600 }, traceLevelFor: () => 10 };
    const own = runtime.buildCandidates(structuredModifiers, context, {}).filter((item) => String(item.source?.id) === "1203");
    assert.equal(own.length, 16);
    assert.equal(own.filter((item) => item.calculable).length, 2);
    assert.equal(own.filter((item) => item.displayOnly).length, 14);
    assert.equal(structured("traceStats:1203:attack", context).value, 28);
    assert.equal(structured("traceStats:1203:hp", context).value, 18);
    assert.equal(structured("traceStats:1203:defense", context).value, 12.5);
    assert.equal(structured("eidolon:1203:4:enemy-damage-down", context, { "luocha-field-active": true }).displayOnly, true);
});

test("Jing Yuan 1204 golden: direct attacks and Lightning-Lord hit/adjacent multipliers remain separate", () => {
    const normal = attacks.find((item) => item.id === "120401");
    const skill = attacks.find((item) => item.id === "120402");
    const ultimate = attacks.find((item) => item.id === "120403");
    const e0Lord = attacks.find((item) => item.id === "120404");
    const e1Lord = attacks.find((item) => item.id === "1204041");
    assert.equal(normal.multipliers[5], 100);
    assert.equal(skill.multipliers[9], 100);
    assert.equal(ultimate.multipliers[9], 200);
    assert.equal(e0Lord.multipliers[9], 66);
    assert.equal(e0Lord.adjacentMultiplierRatio, 25);
    assert.equal(e0Lord.maximumEidolon, 0);
    assert.equal(e1Lord.adjacentMultiplierRatio, 50);
    assert.equal(e1Lord.requiredEidolon, 1);
    assert.equal(e1Lord.hitCountInputKey, "jingyuan-lightning-lord-hits");
});

test("Jing Yuan 1204 golden: six hits enables Battalia Crush and E2 excludes Lightning-Lord", () => {
    const context = { characterId: "1204", eidolon: 6, traceLevelFor: () => 10 };
    const a2Low = structured("traceNode:1204:1204101:followup-crit-damage", context, { "jingyuan-lightning-lord-hits": 5 });
    const a2High = structured("traceNode:1204:1204101:followup-crit-damage", context, { "jingyuan-lightning-lord-hits": 6 });
    const e2 = structured("eidolon:1204:2:damage", context, { "jingyuan-e2-damage-active": true });
    assert.equal(a2Low.enabled, false);
    assert.equal(a2High.enabled, true);
    const lord = { attackType: "followUp", type: "followUp", element: "Thunder", target: "bounce", multiplier: 66, hitCount: 6 };
    const lordResult = engine.calculate(request(lord, [a2High, e2]));
    assert.equal(lordResult.applied.some((item) => item.id === e2.id), false);
    assert.ok(Math.abs(lordResult.nonCrit - 1425.6) < 1e-9);
    assert.ok(Math.abs(lordResult.crit - 3207.6) < 1e-9);
    const skill = { attackType: "skill", type: "skill", element: "Thunder", multiplier: 100 };
    assert.ok(Math.abs(engine.calculate(request(skill, [e2])).nonCrit - 432) < 1e-9);
});

test("Jing Yuan 1204 golden: E6 vulnerability progresses per hit and never leaks to adjacent damage", () => {
    const context = { characterId: "1204", eidolon: 6, traceLevelFor: () => 10 };
    const e6 = structured("eidolon:1204:6:progressive-vulnerability", context, { "jingyuan-e6-vulnerability": true });
    const main = { attackType: "followUp", type: "followUp", element: "Thunder", target: "bounce", multiplier: 66, hitCount: 10 };
    const mainResult = engine.calculate(request(main, [e6]));
    assert.ok(Math.abs(mainResult.nonCrit - 3060.288) < 1e-9);
    assert.deepEqual(Array.from(mainResult.breakdown.vulnerabilityFactors, (value) => Math.round(value * 100) / 100), [1, 1.12, 1.24, 1.36, 1.36, 1.36, 1.36, 1.36, 1.36, 1.36]);
    const adjacent = engine.calculate(request({ ...main, target: "adjacent", multiplier: 33 }, [e6]));
    assert.ok(Math.abs(adjacent.nonCrit - 1188) < 1e-9);
    assert.deepEqual(adjacent.applied, []);
});

test("Jing Yuan 1204 golden: every trace and eidolon is classified", () => {
    const context = { characterId: "1204", eidolon: 6, traceLevelFor: () => 10 };
    const own = runtime.buildCandidates(structuredModifiers, context, {}).filter((item) => String(item.source?.id) === "1204");
    assert.equal(own.length, 16);
    assert.equal(own.filter((item) => item.calculable).length, 4);
    assert.equal(own.filter((item) => item.displayOnly).length, 12);
    assert.equal(structured("traceStats:1204:attack", context).value, 28);
    assert.equal(structured("traceStats:1204:crit-rate", context).value, 12);
    assert.equal(structured("traceStats:1204:defense", context).value, 12.5);
});

function resolveBladeAttack(id, levelIndex, adjacent = false) {
    const attack = attacks.find((item) => item.id === id);
    const components = adjacent ? attack.adjacentScalingTermComponents : attack.scalingTermComponents;
    const scalingTerms = (components || []).map((term) => ({
        stat: term.stat,
        multiplier: term.values[levelIndex],
        receivesMultiplierAddition: term.receivesMultiplierAddition === true
    }));
    return {
        ...attack,
        attackType: attack.type,
        element: "Wind",
        target: adjacent ? "adjacent" : attack.target,
        multiplier: adjacent ? attack.adjacentMultipliers?.[levelIndex] : attack.multipliers[levelIndex],
        scalingTerms: scalingTerms.length ? scalingTerms : undefined
    };
}

test("Blade 1205 golden: enhanced and previous attack records preserve distinct stat references", () => {
    const previousNormal = attacks.find((item) => item.id === "120501");
    const enhancedNormal = attacks.find((item) => item.id === "1120501");
    const previousEnhanced = attacks.find((item) => item.id === "120508");
    const enhancedEnhanced = attacks.find((item) => item.id === "1120508");
    assert.equal(previousNormal.variant, "previous");
    assert.equal(previousNormal.scalingStat, "atk");
    assert.equal(previousNormal.multipliers[5], 100);
    assert.equal(enhancedNormal.variant, "enhanced");
    assert.equal(enhancedNormal.scalingStat, "hp");
    assert.equal(enhancedNormal.multipliers[5], 50);
    assert.deepEqual(Array.from(previousEnhanced.scalingTermComponents, (term) => term.stat), ["atk", "hp"]);
    assert.deepEqual(Array.from(enhancedEnhanced.scalingTermComponents, (term) => term.stat), ["hp"]);
    assert.equal(previousEnhanced.adjacentScalingTermComponents[1].values[5], 40);
    assert.equal(enhancedEnhanced.adjacentScalingTermComponents[0].values[5], 52);
    assert.ok(attacks.find((item) => item.id === "120502").hidden);
    assert.ok(attacks.find((item) => item.id === "1120502").hidden);
});

test("Blade 1205 golden: enhanced HP-loss, E1, E4, E6 and Hellscape apply only to their intended terms", () => {
    const context = { characterId: "1205", eidolon: 6, enhancementState: "enhanced", traceLevelFor: () => 10, baseStats: { hp: 1000 }, stats: { hp: 5000 } };
    const inputs = { "blade-hellscape-active": true, "blade-ult-hp-loss-percent": 90, "blade-e4-hp-stacks": 2 };
    const own = runtime.buildCandidates(structuredModifiers, context, inputs).filter((item) => String(item.source?.id) === "1205" && item.calculable);
    const calc = (attack) => {
        const input = request(attack, own);
        input.character.baseStats = { hp: 1000, atk: 600 };
        return engine.calculate(input);
    };
    const normal = calc(resolveBladeAttack("1120501", 5));
    const enhanced = calc(resolveBladeAttack("1120508", 5));
    const ultimate = calc(resolveBladeAttack("1120503", 9));
    const adjacent = calc(resolveBladeAttack("1120503", 9, true));
    const talent = calc(resolveBladeAttack("1120504", 9));
    assert.ok(Math.abs(normal.nonCrit - 1360.8) < 1e-9);
    assert.ok(Math.abs(enhanced.nonCrit - 7212.24) < 1e-9);
    assert.ok(Math.abs(ultimate.nonCrit - 10206) < 1e-9);
    assert.ok(Math.abs(adjacent.nonCrit - 3102.624) < 1e-9);
    assert.ok(Math.abs(talent.nonCrit - 5598.72) < 1e-9);
    assert.deepEqual(Array.from(ultimate.applied, (item) => item.id).filter((id) => id.includes("hp-loss")), ["trace:1205:1120503:hp-loss-main", "eidolon:1205:1:hp-loss-main:enhanced"]);
    assert.deepEqual(Array.from(adjacent.applied, (item) => item.id).filter((id) => id.includes("hp-loss")), ["trace:1205:1120503:hp-loss-adjacent"]);
    assert.equal(talent.applied.some((item) => item.id === "eidolon:1205:6:talent-hp:enhanced"), true);
    assert.equal(normal.applied.some((item) => item.id.includes("hp-loss")), false);
});

test("Blade 1205 golden: previous mixed ATK/HP formulas and E1 ultimate scope do not use enhanced values", () => {
    const context = { characterId: "1205", eidolon: 1, enhancementState: "previous", traceLevelFor: () => 10 };
    const inputs = { "blade-hellscape-active": false, "blade-ult-hp-loss-percent": 90, "blade-e4-hp-stacks": 0 };
    const own = runtime.buildCandidates(structuredModifiers, context, inputs).filter((item) => String(item.source?.id) === "1205" && item.calculable);
    const calc = (attack) => engine.calculate(request(attack, own));
    const enhancedNormal = calc(resolveBladeAttack("120508", 5));
    const ultimate = calc(resolveBladeAttack("120503", 9));
    const adjacent = calc(resolveBladeAttack("120503", 9, true));
    assert.ok(Math.abs(enhancedNormal.nonCrit - 1944) < 1e-9);
    assert.ok(Math.abs(ultimate.nonCrit - 5994) < 1e-9);
    assert.ok(Math.abs(adjacent.nonCrit - 1425.6) < 1e-9);
    assert.equal(enhancedNormal.applied.some((item) => item.id.includes("eidolon:1205:1")), false);
    assert.equal(ultimate.applied.some((item) => item.id === "eidolon:1205:1:hp-loss-main:previous"), true);
    assert.equal(adjacent.applied.some((item) => item.id === "eidolon:1205:1:hp-loss-main:previous"), false);
});

test("Blade 1205 golden: every selected-version trace and eidolon is classified", () => {
    for (const enhancementState of ["previous", "enhanced"]) {
        const own = runtime.buildCandidates(structuredModifiers, { characterId: "1205", eidolon: 6, enhancementState, traceLevelFor: () => 10 }, {}).filter((item) => String(item.source?.id) === "1205");
        assert.equal(own.length, 19);
        assert.equal(own.filter((item) => item.calculable).length, 8);
        assert.equal(own.filter((item) => item.displayOnly).length, 11);
    }
    assert.equal(structured("traceStats:1205:enhanced-hp", { characterId: "1205", enhancementState: "enhanced" }).value, 28);
    assert.equal(structured("traceStats:1205:enhanced-crit-rate", { characterId: "1205", enhancementState: "enhanced" }).value, 12);
    assert.equal(structured("traceStats:1205:enhanced-effect-res", { characterId: "1205", enhancementState: "enhanced" }).value, 10);
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
