const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { loadHsrDataFiles } = require("../../scripts/lib/hsrDataFiles.cjs");

const root = path.resolve(__dirname, "../..");
const runtime = require(path.join(root, "games/js/hsrModifierRuntime.js"));
const records = loadHsrDataFiles(root).modifiers.filter((modifier) => !String(modifier.id).startsWith("deprecated:"));

function candidate(id, context, inputs = {}) {
  return runtime.buildCandidates(records, context, inputs).find((entry) => entry.id === id);
}

function calcEngine() {
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, "games/js/hsrCalcEngine.js"), "utf8"), { window });
  return window.HsrCalcEngine;
}

test("stack, trace level, and refinement values resolve from structured fields", () => {
  assert.equal(candidate("trace:1407:140704:damage-stack", { characterId: "1407" }, { "castorice-damage-stacks": 3 }).value, 60);
  assert.equal(candidate("trace:1101:110102:damage-bonus", { characterId: "1101", traceLevelFor: () => 10 }).value, 66);
  assert.equal(candidate("lightCone:24005:skill-party-damage", { lightConeId: "24005", refinement: 3 }).value, 12);
    assert.equal(candidate("trace:1407:140704:damage-stack", { characterId: "1407" }, { "castorice-damage-stacks": 99 }).value, 60);
    assert.equal(candidate("lightCone:23034:party-damage-stacks", { lightConeId: "23034", refinement: 5 }, { "lc-23034-stacks": 3 }).value, 72);
});

test("Bronya and Ruan Mei dynamic values use explicit inputs without description parsing", () => {
  const bronyaCrit = candidate("trace:1101:110103:crit-damage", { characterId: "1407", partyIds: ["1101"], traceLevelFor: () => 10 }, { "bronya-ultimate-active": true, "bronya-crit-damage": 200 });
  assert.equal(bronyaCrit.value, 52);
  assert.equal(bronyaCrit.valueInput.value, 200);
  const ruanA6 = candidate("traceNode:1303:1303103:skill-extra-damage", { characterId: "1407", partyIds: ["1303"] }, { "ruanmei-skill-active": true, "ruanmei-break-effect": 180 });
  assert.equal(ruanA6.value, 36);
  assert.equal(ruanA6.enabled, true);
});

test("party support scaling reads the selected provider's own structured stats", () => {
  const bronya = candidate("trace:1101:110103:crit-damage", {
    characterId: "1407",
    partyIds: ["1101"],
    partyStats: { "1101": { critDamage: 200 } },
    traceLevelFor: () => 10
  }, { "bronya-ultimate-active": true, "bronya-crit-damage": 50 });
  assert.equal(bronya.value, 52);
  assert.equal(bronya.valueInput.type, "providerStat");
  assert.equal(bronya.valueInput.providerId, "1101");

  const ruanA6 = candidate("traceNode:1303:1303103:skill-extra-damage", {
    characterId: "1407",
    partyIds: ["1303"],
    partyStats: { "1303": { breakEffect: 180 } }
  }, { "ruanmei-skill-active": true, "ruanmei-break-effect": 120 });
  assert.equal(ruanA6.value, 36);
  assert.equal(ruanA6.valueInput.type, "providerStat");
  assert.equal(ruanA6.valueInput.value, 180);
});

test("Bronya normal crit override and Ruan Mei skill scope never leak to unrelated attacks", () => {
  const override = candidate("traceNode:1101:1101101:normal-crit-override", { characterId: "1101" });
  assert.equal(runtime.applicableToAttack(override, { attackType: "normal", element: "Wind" }), true);
  assert.equal(runtime.applicableToAttack(override, { attackType: "followUp", element: "Wind" }), false);
  const ruanSkill = candidate("trace:1303:130302:damage-bonus", { characterId: "1407", partyIds: ["1303"], traceLevelFor: () => 10 }, { "ruanmei-skill-active": true });
  assert.equal(ruanSkill.value, 32);
  assert.equal(runtime.applicableToAttack(ruanSkill, { attackType: "normal" }), true);
});

test("automatic stat thresholds use an explicit condition threshold", () => {
  const active = candidate("ornament:306:2pc:ultimate-followup-damage", { ornamentId: "306", stats: { critRate: 55 } });
  const inactive = candidate("ornament:306:2pc:ultimate-followup-damage", { ornamentId: "306", stats: { critRate: 49 } });
  assert.equal(active.enabled, true);
  assert.equal(active.automatic, true);
  assert.equal(inactive.enabled, false);
});

test("numeric thresholds read the shared enemy input without confusing input bounds and condition value", () => {
  assert.equal(candidate("relic:117:2pc:debuffed-damage", { relicIds: ["117"], relicMode: 2, enemy: { debuffCount: 2 } }).enabled, true);
  assert.equal(candidate("relic:117:2pc:debuffed-damage", { relicIds: ["117"], relicMode: 2, enemy: { debuffCount: 0 } }).enabled, false);
});

test("numeric inputs respect structured lower and upper bounds before status and calculation", () => {
  const defaulted = candidate("trace:1205:1120503:hp-loss-main", { characterId: "1205", enhancementState: "enhanced" });
  const belowMinimum = candidate("trace:1205:1120503:hp-loss-main", { characterId: "1205", enhancementState: "enhanced" }, { "blade-ult-hp-loss-percent": 0 });
  const aboveMaximum = candidate("trace:1205:1120503:hp-loss-main", { characterId: "1205", enhancementState: "enhanced" }, { "blade-ult-hp-loss-percent": 120 });
  assert.equal(defaulted.activation.inputValue, 50);
  assert.equal(defaulted.enabled, true);
  assert.equal(belowMinimum.activation.inputValue, 50);
  assert.equal(belowMinimum.value, 50);
  assert.equal(aboveMaximum.activation.inputValue, 90);
  assert.equal(aboveMaximum.value, 90);
});

test("included-in-final-stat records are quarantined while base-stat buffs are selectable", () => {
  assert.equal(candidate("ornament:306:2pc:crit-rate", { ornamentId: "306" }).enabled, false);
  assert.equal(candidate("trace:1101:110103:atk-percent", { characterId: "1407", partyIds: ["1101"] }, { "bronya-ultimate-active": true }).enabled, true);
});

test("Pioneer four-piece separates debuff count from the applier-triggered doubling", () => {
  const base = candidate("relic:117:4pc:conditional-crit-damage", { relicIds: ["117"], relicMode: 4, enemy: { debuffCount: 3 } });
  const doubled = candidate("relic:117:4pc:conditional-crit-damage", { relicIds: ["117"], relicMode: 4, enemy: { debuffCount: 3 } }, { "relic-117-applier-triggered": true });
  assert.equal(base.enabled, true);
  assert.equal(base.value, 12);
  assert.equal(doubled.value, 24);
  assert.equal(doubled.valueInput.checked, true);
});

test("attack scope prevents modifiers from leaking to unrelated attacks", () => {
  const dot = candidate("trace:1108:110803:dot-vulnerability", { characterId: "1108", traceLevelFor: () => 10 }, { "sampo-ultimate-dot-vulnerability": true });
  assert.equal(runtime.applicableToAttack(dot, { attackType: "dot" }), true);
  assert.equal(runtime.applicableToAttack(dot, { attackType: "normal" }), false);

  const salsotto = candidate("ornament:306:2pc:ultimate-followup-damage", { ornamentId: "306", stats: { critRate: 55 } });
  assert.equal(runtime.applicableToAttack(salsotto, { attackType: "ultimate" }), true);
  assert.equal(runtime.applicableToAttack(salsotto, { attackType: "followUp" }), true);
  assert.equal(runtime.applicableToAttack(salsotto, { attackType: "skill" }), false);
});

test("primary-only and adjacent-only modifiers never cross target position", () => {
  const primary = { enabled: true, calculable: true, primaryTargetOnly: true, target: { attackTypes: ["ultimate"], elements: [] } };
  const adjacent = { enabled: true, calculable: true, adjacentTargetOnly: true, target: { attackTypes: ["ultimate"], elements: [] } };
  assert.equal(runtime.applicableToAttack(primary, { attackType: "ultimate", target: "blast" }), true);
  assert.equal(runtime.applicableToAttack(primary, { attackType: "ultimate", target: "adjacent" }), false);
  assert.equal(runtime.applicableToAttack(adjacent, { attackType: "ultimate", target: "blast" }), false);
  assert.equal(runtime.applicableToAttack(adjacent, { attackType: "ultimate", target: "adjacent" }), true);
});

test("eidolon modifiers appear only after the required rank", () => {
  assert.equal(candidate("eidolon:1505:4:defense-ignore", { characterId: "1505", eidolon: 3 }), undefined);
  assert.equal(candidate("eidolon:1505:4:defense-ignore", { characterId: "1505", eidolon: 4 }).enabled, true);
});

test("party eidolon modifiers require the selected support member's own eidolon rank", () => {
  const withoutEidolon = candidate("eidolon:1303:1:defense-ignore", { characterId: "1407", partyIds: ["1303"], partyEidolons: { "1303": 0 } }, { "ruanmei-field-active": true });
  const withEidolon = candidate("eidolon:1303:1:defense-ignore", { characterId: "1407", partyIds: ["1303"], partyEidolons: { "1303": 1 } }, { "ruanmei-field-active": true });
  assert.equal(withoutEidolon, undefined);
  assert.equal(withEidolon.enabled, true);
  assert.equal(withEidolon.value, 20);
});

test("party light cones and relics use the provider's equipment and refinement", () => {
  const mirror = candidate("lightCone:23019:party-damage", {
    characterId: "1407",
    partyIds: ["1303"],
    partyEquipment: [{ characterId: "1303", lightConeId: "23019", refinement: 3, relicIds: ["127"], relicMode: 4 }]
  }, { "lc-23019-ultimate-used": true });
  assert.equal(mirror.tab, "パーティ");
  assert.equal(mirror.value, 32);
  assert.equal(mirror.enabled, true);

  const savior = candidate("relic:127:4pc:party-damage", {
    characterId: "1407",
    partyIds: ["1303"],
    partyEquipment: [{ characterId: "1303", relicIds: ["127"], relicMode: 4 }]
  }, { "relic-127-party-damage": true });
  assert.equal(savior.tab, "パーティ");
  assert.equal(savior.value, 15);
});

test("party light-cone and ornament providers connect once to calculation when duplicate non-stacking sources are equipped", () => {
  const context = {
    characterId: "1407",
    partyIds: ["1101", "1303"],
    partyEquipment: [
      { characterId: "1101", lightConeId: "20005", refinement: 1, ornamentId: "326" },
      { characterId: "1303", lightConeId: "20005", refinement: 5, ornamentId: "326" }
    ]
  };
  const inputs = { "ornament-326-enemy-defeated": true };
  const candidates = runtime.buildCandidates(records, context, inputs);
  const chorus = candidates.filter((entry) => entry.id === "lightCone:20005:party-atk");
  const city = candidates.filter((entry) => entry.id === "ornament:326:2pc:party-crit-damage");
  assert.equal(chorus.length, 1);
  assert.equal(chorus[0].value, 8);
  assert.equal(city.length, 1);
  assert.equal(city[0].value, 12);

  const result = calcEngine().calculate({
    character: { level: 80, baseStats: { atk: 600 }, stats: { atk: 1000, critRate: 100, critDamage: 100 } },
    enemy: { level: 80, resistance: 0, toughnessActive: false },
    attack: { name: "結合確認", attackType: "normal", multiplier: 100, scalingStat: "atk", canCrit: true },
    modifiers: [...chorus, ...city]
  });
  assert.equal(result.breakdown.baseDamage, 1048);
  assert.equal(result.breakdown.critDamagePercent, 112);
  assert.equal(result.applied.filter((entry) => entry.id === "lightCone:20005:party-atk").length, 1);
  assert.equal(result.applied.filter((entry) => entry.id === "ornament:326:2pc:party-crit-damage").length, 1);
});

test("expanded character conditions preserve stack, element, and attack scopes", () => {
  const pela = candidate("eidolon:1106:4:ice-resistance-reduction", { characterId: "1407", partyIds: ["1106"], partyEidolons: { "1106": 4 } }, { "pela-e4-ice-res-down": true });
  assert.equal(runtime.applicableToAttack(pela, { attackType: "skill", element: "Ice" }), true);
  assert.equal(runtime.applicableToAttack(pela, { attackType: "skill", element: "Quantum" }), false);
  const result = calcEngine().calculate({
    character: { level: 80, stats: { atk: 1000 } },
    enemy: { level: 80, resistance: 80, resistancePenetration: 15 },
    attack: { type: "skill", element: "Ice", multiplier: 100 },
    modifiers: [pela]
  });
  assert.ok(Math.abs(result.breakdown.resistance - 0.47) < 1e-12);
  assert.ok(Math.abs(result.nonCrit - 235) < 1e-9);
  assert.equal(result.applied[0].id, pela.id);
  const feixiao = candidate("eidolon:1220:1:ultimate-independent-stack", { characterId: "1220", eidolon: 1 }, { "feixiao-e1-ultimate-stacks": 5 });
  assert.equal(feixiao.value, 50);
  assert.equal(runtime.applicableToAttack(feixiao, { attackType: "ultimate" }), true);
  assert.equal(runtime.applicableToAttack(feixiao, { attackType: "normal" }), false);
});

test("light-cone refinement and shared activation conditions reach only their attack scopes", () => {
  const skill = candidate("lightCone:23010:skill-ultimate-damage", { lightConeId: "23010", refinement: 5 });
  assert.equal(skill.value, 30);
  assert.equal(runtime.applicableToAttack(skill, { attackType: "skill" }), true);
  assert.equal(runtime.applicableToAttack(skill, { attackType: "normal" }), false);
  const bubbleGeneral = candidate("lightCone:23024:bubble-damage", { lightConeId: "23024", refinement: 1 }, { "lc-23024-bubble": true });
  const bubbleUltimate = candidate("lightCone:23024:bubble-ultimate-damage", { lightConeId: "23024", refinement: 1 }, { "lc-23024-bubble": true });
  assert.equal(bubbleGeneral.value + bubbleUltimate.value, 48);
  assert.equal(runtime.applicableToAttack(bubbleUltimate, { attackType: "skill" }), false);
});

test("relic and ornament thresholds, stacks, and attack scopes remain structured", () => {
  const glamoth = candidate("ornament:311:2pc:speed-damage", { ornamentId: "311", stats: { speed: 160 } });
  assert.equal(glamoth.enabled, true);
  assert.equal(glamoth.value, 18);

  const prisoner = candidate("relic:116:4pc:dot-defense-ignore", { relicIds: ["116"], relicMode: 4 }, { "enemy-dot-count": 3 });
  assert.equal(prisoner.value, 18);
  assert.equal(runtime.applicableToAttack(prisoner, { attackType: "dot" }), true);
  assert.equal(runtime.applicableToAttack(prisoner, { attackType: "normal" }), true);

  const rutilant = candidate("ornament:309:2pc:normal-skill-damage", { ornamentId: "309", stats: { critRate: 70 } });
  assert.equal(rutilant.enabled, true);
  assert.equal(runtime.applicableToAttack(rutilant, { attackType: "normal" }), true);
  assert.equal(runtime.applicableToAttack(rutilant, { attackType: "skill" }), true);
  assert.equal(runtime.applicableToAttack(rutilant, { attackType: "ultimate" }), false);
});


test('Summer Robin Fever resolves one party DEF-ignore effect and agrees with independent defense fractions', () => {
  const id = 'trace:1512:151204:fever-defense-ignore';
  const context = {characterId:'1503',partyIds:['1512'],partyEidolons:{'1512':0},traceLevelFor:()=>10};
  const engine = calcEngine();
  for (const [active,vibes,reduction,ignore,expected] of [
    [false,50,0,0,972], [true,1,0,15.5,1053.658536585366],
    [true,12,0,21,1086.0335195530726], [true,30,0,30,1143.529411764706],
    [true,50,0,40,1215], [true,50,20,40,1388.5714285714287],
    [true,50,80,40,1944]
  ]) {
    const item = candidate(id, context, {'robin-summeretto-fever':active,'robin-summeretto-vibes':vibes});
    assert.equal(item.providerId,'1512');
    assert.equal(item.enabled,active);
    assert.equal(item.inputWarnings.length,0);
    const input={character:{level:80,stats:{def:3000,critRate:50,critDamage:100}},enemy:{level:80,resistance:20,toughnessActive:true,defenseReduction:reduction},attack:{type:'normal',element:'Ice',scalingStat:'def',multiplier:90,hitCount:1},modifiers:[item]};
    const result=engine.calculate(input);
    assert.ok(Math.abs(result.nonCrit-expected)<1e-9);
    assert.ok(Math.abs(result.crit-expected*2)<1e-9);
    assert.ok(Math.abs(result.expected-expected*1.5)<1e-9);
    assert.equal(result.breakdown.defenseIgnorePercent,ignore);
    assert.equal(result.applied.length,active?1:0);
    assert.equal(result.breakdown.takenDamage,0,'sprite vulnerability must not be included');
  }
  for (const vibes of [undefined,NaN,0,-1,51,1.5]) {
    const item=candidate(id,context,{'robin-summeretto-fever':true,'robin-summeretto-vibes':vibes});
    assert.equal(item.applicable,false);assert.ok(item.inputWarnings.length);
  }
  assert.ok(candidate(id,{...context,partyEidolons:{'1512':2}},{'robin-summeretto-fever':true,'robin-summeretto-vibes':50}).inputWarnings.length);
  assert.ok(candidate(id,{...context,traceLevelFor:()=>11},{'robin-summeretto-fever':true,'robin-summeretto-vibes':50}).inputWarnings.length);
  assert.equal(candidate(id,{characterId:'1503'}),undefined);
  assert.equal(candidate(id,{...context,traceLevelFor:()=>1},{'robin-summeretto-fever':true,'robin-summeretto-vibes':50}).value,35);
});


test("Colors for Tomorrow resolves S1-S5 vulnerability without reapplying final DEF", () => {
  const gear = records.filter(r => r.source.kind === "lightCone" && r.source.id === "23055");
  assert.equal(gear.length, 3);
  const calc = calcEngine();
  const input = { character: { level: 80, stats: { def: 3000, critRate: 50, critDamage: 100 } }, enemy: { level: 80, resistance: 20, toughnessActive: true }, attack: { type: "normal", scalingStat: "def", multiplier: 90, canCrit: true } };
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "games/hsr/data/catalog.json"), "utf8"));
  const params = catalog.lightCones.find(c => c.id === "23055").effect.paramsByRank;
  for (let rank = 1; rank <= 5; rank++) {
    const context = { characterId: "1503", lightConeId: "23055", refinement: rank };
    const off = runtime.buildCandidates(gear, context, {});
    assert.equal(off.find(r => r.id.endsWith("def-final")).enabled, false);
    assert.ok(Math.abs(calc.calculate({ ...input, modifiers: off }).nonCrit - 972) < 1e-9);
    const on = runtime.buildCandidates(gear, context, { "lc-23055-vulnerability-active": true });
    assert.ok(Math.abs(on.find(r => r.category === "takenDamage").value - params[rank-1][3]*100) < 1e-9);
    const result = calc.calculate({ ...input, modifiers: on });
    // Independent: 3000 DEF * .9 MV * .5 DEF * .8 RES * .9 toughness * (1+vulnerability).
    const expected = [1185.84,1239.3,1292.76,1346.22,1399.68][rank-1];
    assert.ok(Math.abs(result.nonCrit - expected) < 1e-9);
    assert.ok(Math.abs(result.crit - expected*2) < 1e-9);
    assert.ok(Math.abs(result.expected - expected*1.5) < 1e-9);
    assert.equal(result.breakdown.referenceValue, 3000);
    assert.equal(result.applied.length, 1);
  }
  assert.equal(runtime.buildCandidates(gear, { characterId: "1503" }, { "lc-23055-vulnerability-active": true }).length, 0);
});

test("Heretic separates final CD, Basic DMG and active base-ATK scaling with set-count gates", () => {
  const gear = records.filter(r => r.source.kind === "relic" && r.source.id === "134");
  const calc = calcEngine();
  const input = { character: { level: 80, baseStats: { atk: 582.12 }, stats: { atk: 3000, critRate: 50, critDamage: 100 } }, enemy: { level: 80, resistance: 20, toughnessActive: true }, attack: { type: "normal", scalingStat: "atk", multiplier: 100, canCrit: true } };
  const context = { characterId: "1210", relicIds: ["134"], relicMode: 2 };
  const two = runtime.buildCandidates(gear, context, { "relic-134-atk-active": true });
  assert.equal(two.length, 1); assert.equal(two[0].enabled, false);
  assert.ok(Math.abs(calc.calculate({ ...input, modifiers: two }).expected - 1620) < 1e-9);
  context.relicMode = 4;
  const off = runtime.buildCandidates(gear, context, {});
  assert.ok(Math.abs(calc.calculate({ ...input, modifiers: off }).nonCrit - 1468.8) < 1e-9);
  const on = runtime.buildCandidates(gear, context, { "relic-134-atk-active": true });
  const result = calc.calculate({ ...input, modifiers: on });
  // Independent: (3000 + 582.12 * .2) * 1.36 * .5 * .8 * .9.
  assert.ok(Math.abs(result.nonCrit - 1525.8011904) < 1e-9);
  assert.ok(Math.abs(result.crit - 3051.6023808) < 1e-9);
  assert.ok(Math.abs(result.expected - 2288.7017856) < 1e-9);
  assert.equal(result.breakdown.critDamagePercent, 100, "the input already includes the permanent 16% CD");
  assert.ok(Math.abs(result.breakdown.referenceValue - 3116.424) < 1e-9);
  assert.equal(result.breakdown.damageBonus, 36);
  for (const type of ["normal", "enhancedNormal", "skill", "dot", "elation", "trueDamage", "break"]) {
    const boost = on.find(r => r.id.endsWith("normal-damage"));
    assert.equal(runtime.applicableToAttack(boost, { type }), ["normal","enhancedNormal"].includes(type));
  }
  const dot = calc.calculate({ ...input, attack: { ...input.attack, type: "dot", canCrit: false }, modifiers: on });
  assert.ok(Math.abs(dot.nonCrit - 1121.91264) < 1e-9, "active ATK affects DoT but Basic DMG does not");
});

test("Colors vulnerability supports party normal, DoT, Break and Elation, while True damage ignores it", () => {
  const gear = records.filter(r => r.source.kind === "lightCone" && r.source.id === "23055");
  const modifiers = runtime.buildCandidates(gear, { characterId: "1505", partyIds: ["1503"], partyEquipment: [{ characterId: "1503", lightConeId: "23055", refinement: 1 }] }, { "lc-23055-vulnerability-active": true });
  assert.equal(modifiers.length, 1); assert.equal(modifiers[0].providerId, "1503");
  const calc = calcEngine();
  const common = { character: { level: 80, eidolon: 0, stats: { atk: 3000, elation: 50, critRate: 0, critDamage: 100 } }, enemy: { level: 80, resistance: 20, toughnessActive: true, weakness: true, maxToughness: 60 }, modifiers };
  for (const type of ["normal", "dot"]) {
    const input = { ...common, attack: { type, multiplier: 100, scalingStat: "atk", canCrit: type !== "dot" } };
    assert.ok(Math.abs(calc.calculate(input).nonCrit - 1317.6) < 1e-9);
  }
  const overrides = JSON.parse(fs.readFileSync(path.join(root,"games/hsr/data/attack-overrides.json"),"utf8")).overrides;
  const e = overrides.find(a => a.id === "150520");
  const result = calc.calculate({ ...common, attack: { ...e, type: "elation", target: "aoe", hitCount: 1, traceLevel: 10, multiplier: 110 }, elation: { context: "ahaInstant", punchline: 20, merrymake: 0 } });
  assert.ok(Math.abs(result.nonCrit - 6197.335695692308*1.22) < 1e-8);
  const t = overrides.find(a => a.id === "1415021");
  assert.ok(Math.abs(calc.calculate({ ...common, attack: { ...t, traceLevel: 10, multiplier: 24 }, trueDamage: { active: true, sourceKind: "finalNonTrueDamage", originalDamage: 1080 } }).nonCrit - 259.2) < 1e-9);
  assert.ok(Math.abs(calc.calculateBreak({ ...common, element: "Fire", breakBaseDamage: { 80: 3767.5533 } }).value - 3677.1320208) < 1e-8);
});
