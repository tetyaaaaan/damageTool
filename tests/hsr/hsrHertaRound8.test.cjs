"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fixedSourceSha, readJson, loadProductionFixture, makeRequest, independentDirectDamage, assertClose } = require("./helpers/hsrDirectVerification.cjs");
const overrides = require("../../games/hsr/data/calc/attacks-herta-round8.json").overrides;
const nativeModifiers = require("../../games/hsr/data/calc/modifiers-herta-round8.json").modifiers;
const modifierRuntime = require("../../games/js/hsrModifierRuntime.js");

const expected = {
  "140101": [50, 60, 70, 80, 90, 100],
  "140103": [100, 110, 120, 130, 140, 150, 162.5, 175, 187.5, 200]
};

test("Round8 The Herta direct Normal and Ultimate overrides match the fixed source curves", async () => {
  const { data, engine } = await loadProductionFixture();
  assert.ok(data.sources.some(source => source.revision === fixedSourceSha));
  for (const override of overrides.filter(attack => expected[attack.id])) {
    const original = data.attacks.find(attack => attack.id === override.id);
    assert.ok(original, `${override.id} source attack exists`);
    assert.equal(override.provenance.sourceCommit, fixedSourceSha);
    assert.equal(override.support.status, "calculable");
    assert.deepEqual(override.multipliers, expected[override.id]);
    const source = readJson("games/hsr/data/catalog.json").characters.find(character => character.id === "1401").skills.find(skill => skill.id === override.sourceSkillId);
    for (let level = 1; level <= override.maximumTraceLevel; level++) {
      assertClose(source.params[level - 1][0] * 100, expected[override.id][level - 1], `${override.id} fixed source Lv${level}`);
      const request = makeRequest(override, level, { atk: 3217.25, hp: 8500, def: 2711, critRate: 47, critDamage: 113, damageBonus: 21, resistance: 20, enemyLevel: 80, characterLevel: 80, eidolon: 0, enemyCount: 1, toughnessActive: true });
      const independent = independentDirectDamage(request);
      const actual = engine.calculate(request);
      assert.notEqual(actual.supported, false, `${override.id} Lv${level} engine supports scope`);
      for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], independent[key], `${override.id} Lv${level} ${key}`);
    }
  }
});

test("The Herta enhanced Skill separates three #1 hits and final #3 hit at pre-attack Interpretation cap", () => {
  const catalog = readJson("games/hsr/data/catalog.json");
  const character = catalog.characters.find(item => item.id === "1401");
  const enhanced = overrides.find(attack => attack.id === "140109");
  assert.equal(enhanced.support.status, "calculable");
  assert.equal(enhanced.enemyCountExact, 1);
  assert.match(enhanced.conditionText, /攻撃前からメイン対象の解読42層/);
  assert.deepEqual(enhanced.damageComponents.map(component => component.key), ["main", "repeat1", "repeat2", "final"]);
  const source = character.skills.find(skill => skill.id === "140109");
  const components = enhanced.damageComponents;
  for (let level = 1; level <= 10; level++) {
    for (const key of ["main", "repeat1", "repeat2"]) assertClose(components.find(component => component.key === key).multipliers[level - 1], source.params[level - 1][0] * 100, `140109 #1 Lv${level} ${key}`);
    assertClose(components.find(component => component.key === "final").multipliers[level - 1], source.params[level - 1][2] * 100, `140109 #3 Lv${level} final`);
  }
  const trace = character.skills.find(skill => skill.id === "140104");
  const baseBonus = nativeModifiers.find(mod => mod.id === "traceNode:1401:140104:interpretation-final-multiplier");
  const doubledBonus = nativeModifiers.find(mod => mod.id === "traceNode:1401:140104:interpretation-double-final-multiplier");
  const a1 = nativeModifiers.find(mod => mod.id === "traceNode:1401:1401101:full-interpretation-skill-damage");
  const context = { characterId: "1401", characterElement: "Ice", partyIds: ["1405"], partyPaths: { "1401": "Mage", "1405": "Mage" }, stats: { atk: 3000, critRate: 50, critDamage: 100 }, traceLevelFor: source => source.skillId === "140104" ? 10 : 1 };
  const base = modifierRuntime.buildCandidates([baseBonus], context, [])[0];
  const doubled = modifierRuntime.buildCandidates([doubledBonus], context, [])[0];
  const a1Candidate = modifierRuntime.buildCandidates([a1], context, [])[0];
  assert.equal(base.value, 336, "42 stacks × Lv10 talent main-target bonus 8%");
  assert.equal(base.automatic, true, "the capped pre-attack snapshot is the selected row scope");
  assert.equal(doubled.value, 336, "the second Erudition doubles the same per-stack term");
  assert.equal(doubled.automatic, true, "the party threshold comes from roster paths");
  assert.equal(a1Candidate.value, 50);
  assert.equal(a1Candidate.enabled, true, "A1 is automatic in the fixed 42-stack attack row");
  assert.equal(modifierRuntime.applicableToAttack(base, { id: "140109:final", type: "enhancedSkill", element: "Ice" }), true);
  assert.equal(modifierRuntime.applicableToAttack(base, { id: "140109", type: "enhancedSkill", element: "Ice" }), false, "Interpretation addition cannot reach the first three hits");
  assert.equal(modifierRuntime.applicableToAttack(a1Candidate, { id: "140109", type: "enhancedSkill", element: "Ice" }), true);
  assert.equal(modifierRuntime.applicableToAttack(a1Candidate, { id: "140109:final", type: "enhancedSkill", element: "Ice" }), true);
});

test("The Herta post-Ultimate ATK remains a state input and is not silently folded into the Ult itself", () => {
  const ultimate = overrides.find(attack => attack.id === "140103");
  assert.match(ultimate.calculationNote, /必殺技発動後に得る攻撃力上昇は後続状態/);
});


test("The Herta party CD is automatic at the two-Erudition boundary and Answers changes only Ultimate multiplier", async () => {
  const { engine } = await loadProductionFixture();
  const [partyCd, answers] = nativeModifiers;
  const party = { characterId: "1501", characterElement: "Fire", partyIds: ["1401", "1003"], partyPaths: { "1501": "Elation", "1401": "Mage", "1003": "Mage" }, stats: { atk: 3000, critRate: 50, critDamage: 100 } };
  const enabledPartyCd = modifierRuntime.buildCandidates([partyCd], party, [])[0];
  assert.equal(enabledPartyCd.enabled, true);
  assert.equal(enabledPartyCd.automatic, true);
  assert.equal(enabledPartyCd.value, 80);
  assert.equal(enabledPartyCd.providerId, "1401", "The Herta remains the support provider for an Elation beneficiary");
  const oneMageParty = { ...party, partyIds: ["1401", "1101"], partyPaths: { "1501": "Elation", "1401": "Mage", "1101": "Harmony" } };
  assert.equal(modifierRuntime.buildCandidates([partyCd], oneMageParty, [])[0].enabled, false, "one Mage total does not satisfy the threshold");
  assert.equal(modifierRuntime.buildCandidates([partyCd], { ...party, partyIds: ["1003"], partyPaths: { "1501": "Elation", "1003": "Mage" } }, []).length, 0, "removing The Herta removes the party effect");
  assert.equal(modifierRuntime.buildCandidates([partyCd], party, { "herta-a4-party-crit-damage-in-final": true })[0].enabled, false, "an already-included final stat is not added again");

  const ultimate = overrides.find(attack => attack.id === "140103");
  for (const stacks of [0, 1, 42, 99]) {
    const candidate = modifierRuntime.buildCandidates([answers], { ...party, characterId: "1401", characterElement: "Ice", partyIds: ["1003"], partyPaths: { "1401": "Mage", "1003": "Mage" } }, { "herta-answers-stacks": stacks })[0];
    assert.equal(candidate.value, stacks);
    assert.equal(candidate.enabled, stacks > 0);
    assert.equal(modifierRuntime.applicableToAttack(candidate, { id: "140103", type: "ultimate", element: "Ice" }), stacks > 0);
    assert.equal(modifierRuntime.applicableToAttack(candidate, { id: "140101", type: "normal", element: "Ice" }), false);
    if (stacks === 0) continue;
    const request = makeRequest(ultimate, 10, { atk: 3217.25, hp: 8500, def: 2711, critRate: 47, critDamage: 113, damageBonus: 21, resistance: 20, enemyLevel: 80, characterLevel: 80, eidolon: 0, enemyCount: 1, toughnessActive: true }, [candidate]);
    const actual = engine.calculate(request);
    const independentRequest = makeRequest({ ...ultimate, multipliers: Array(10).fill(ultimate.multipliers[9] + stacks) }, 10, { atk: 3217.25, hp: 8500, def: 2711, critRate: 47, critDamage: 113, damageBonus: 21, resistance: 20, enemyLevel: 80, characterLevel: 80, eidolon: 0, enemyCount: 1, toughnessActive: true });
    const expected = independentDirectDamage(independentRequest);
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], `140103 Answer ${stacks} ${key}`);
  }
});








test("The Herta enhanced Skill engine sum matches independent components for every skill/talent level and party branch", async () => {
  const { engine } = await loadProductionFixture();
  const enhanced = overrides.find(attack => attack.id === "140109");
  const character = readJson("games/hsr/data/catalog.json").characters.find(item => item.id === "1401");
  const skill = character.skills.find(item => item.id === "140109");
  const talent = character.skills.find(item => item.id === "140104");
  const a1 = nativeModifiers.find(mod => mod.id === "traceNode:1401:1401101:full-interpretation-skill-damage");
  const baseMod = nativeModifiers.find(mod => mod.id === "traceNode:1401:140104:interpretation-final-multiplier");
  const doubleMod = nativeModifiers.find(mod => mod.id === "traceNode:1401:140104:interpretation-double-final-multiplier");
  const config = { atk: 3217.25, hp: 8500, def: 2711, critRate: 47, critDamage: 113, damageBonus: 21, resistance: 20, enemyLevel: 80, characterLevel: 80, eidolon: 0, enemyCount: 1, toughnessActive: true };
  for (const otherMage of [false, true]) {
    const context = { characterId: "1401", characterElement: "Ice", partyIds: otherMage ? ["1405"] : [], partyPaths: otherMage ? { "1401": "Mage", "1405": "Mage" } : { "1401": "Mage" }, stats: { atk: config.atk, critRate: config.critRate, critDamage: config.critDamage } };
    for (let skillLevel = 1; skillLevel <= 10; skillLevel++) {
      for (let talentLevel = 1; talentLevel <= 10; talentLevel++) {
        assertClose(talent.params[talentLevel - 1][0] * 100, [4,4.4,4.8,5.2,5.6,6,6.5,7,7.5,8][talentLevel - 1], `140104 talent Lv${talentLevel}`);
        const levelContext = { ...context, traceLevelFor: source => source.skillId === "140104" ? talentLevel : 1 };
        const a1Candidate = modifierRuntime.buildCandidates([a1], levelContext, [])[0];
        const baseCandidate = modifierRuntime.buildCandidates([baseMod], levelContext, [])[0];
        const doubleCandidate = modifierRuntime.buildCandidates([doubleMod], levelContext, [])[0];
        const childInputs = enhanced.damageComponents.map(component => {
          const child = { ...enhanced, ...component, id: component.attackId, sourceSkillId: "140109", type: "enhancedSkill", attackType: "enhancedSkill", damageFormula: "statMultiplier", damageComponents: undefined, hitCount: 1, canCrit: true, traceLevel: skillLevel, multipliers: component.multipliers, maximumTraceLevel: 10 };
          const mods = component.key === "final" ? [a1Candidate, baseCandidate, doubleCandidate] : [a1Candidate];
          return { key: component.key, name: component.name, input: makeRequest(child, skillLevel, config, mods) };
        });
        const parentInput = { ...makeRequest(enhanced, skillLevel, config), sequenceComponents: childInputs };
        const actual = engine.calculate(parentInput);
        assert.notEqual(actual.supported, false, `140109 Lv${skillLevel} talentLv${talentLevel} otherMage=${otherMage}`);
        const expectedParts = enhanced.damageComponents.map(component => {
          const base = component.multipliers[skillLevel - 1];
          const addition = component.key === "final" && baseCandidate.enabled ? baseCandidate.value + (doubleCandidate.enabled ? doubleCandidate.value : 0) : 0;
          const independentChild = { ...childInputs.find(part => part.key === component.key).input.attack, multipliers: Array(10).fill(base + addition), multiplier: base + addition };
          return independentDirectDamage({ ...childInputs.find(part => part.key === component.key).input, attack: independentChild, modifiers: [a1Candidate] });
        });
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expectedParts.reduce((sum, part) => sum + part[key], 0), `140109 Lv${skillLevel} talentLv${talentLevel} otherMage=${otherMage} total ${key}`);
      }
    }
  }
});


test("The Herta enhanced Skill rejects missing or reordered components", async () => {
  const { engine } = await loadProductionFixture();
  const enhanced = overrides.find(attack => attack.id === "140109");
  const config = { atk: 3000, hp: 6000, def: 2400, critRate: 50, critDamage: 100, damageBonus: 0, resistance: 20, enemyLevel: 80, characterLevel: 80, eidolon: 0, enemyCount: 1, toughnessActive: true };
  const parts = enhanced.damageComponents.map(component => {
    const child = { ...enhanced, ...component, id: component.attackId, sourceSkillId: "140109", type: "enhancedSkill", attackType: "enhancedSkill", damageFormula: "statMultiplier", damageComponents: undefined, hitCount: 1, canCrit: true, traceLevel: 1, multiplier: component.multipliers[0] };
    return { key: component.key, name: component.name, input: makeRequest(child, 1, config) };
  });
  const request = makeRequest(enhanced, 1, config);
  assert.notEqual(engine.calculate({ ...request, sequenceComponents: parts }).supported, false, "valid sequence is accepted");
  const missing = engine.calculate({ ...request, sequenceComponents: parts.slice(0, 3) });
  assert.equal(missing.supported, false);
  const reordered = engine.calculate({ ...request, sequenceComponents: [parts[3], ...parts.slice(0, 3)] });
  assert.equal(reordered.supported, false);
});
