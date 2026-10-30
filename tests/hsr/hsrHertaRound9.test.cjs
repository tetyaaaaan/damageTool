"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fixedSourceSha, readJson, loadProductionFixture, makeRequest, independentDirectDamage, assertClose } = require("./helpers/hsrDirectVerification.cjs");
const override = require("../../games/hsr/data/calc/attacks-herta-round9.json").overrides[0];
const modifiers = require("../../games/hsr/data/calc/modifiers-herta-round9.json").modifiers;
const modifierRuntime = require("../../games/js/hsrModifierRuntime.js");

const sourceSha = fixedSourceSha;
const skillInput = "herta-enhanced-interpretation-at-cast";
const finalInput = "herta-final-interpretation";
const castA2 = modifiers.find(item => item.source?.traceId === "1401101");
const talentMain = modifiers.find(item => item.id.includes("140104:interpretation-final-multiplier"));
const talentDouble = modifiers.find(item => item.id.includes("140104:interpretation-double-final-multiplier"));

function hertaContext(talentLevel, secondMage) {
  const partyIds = secondMage ? ["1405"] : [];
  return {
    characterId: "1401",
    characterElement: "Ice",
    eidolon: 0,
    partyIds,
    partyPaths: secondMage ? { "1401": "Mage", "1405": "Mage" } : { "1401": "Mage" },
    stats: { atk: 3217.25, critRate: 47, critDamage: 113 },
    traceLevelFor: source => source.traceId === "140104" ? talentLevel : 1
  };
}

function makeCandidates(talentLevel, secondMage, castStacks, finalStacks, extraInputs = {}) {
  return modifierRuntime.buildCandidates(
    [castA2, talentMain, talentDouble],
    hertaContext(talentLevel, secondMage),
    { [skillInput]: castStacks, [finalInput]: finalStacks, ...extraInputs }
  );
}

function directExpected(component, skillLevel, config, appliedModifiers) {
  const multiplier = component.multipliers[skillLevel - 1]
    + (component.key === "final"
      ? appliedModifiers.filter(item => item.category === "multiplierAddition" && item.enabled !== false && item.applicable !== false).reduce((sum, item) => sum + item.value, 0)
      : 0);
  const child = {
    ...override,
    ...component,
    id: component.attackId,
    sourceSkillId: "140109",
    type: "enhancedSkill",
    attackType: "enhancedSkill",
    damageFormula: "statMultiplier",
    damageComponents: undefined,
    hitCount: 1,
    canCrit: true,
    traceLevel: skillLevel,
    maximumTraceLevel: 10,
    multipliers: Array(10).fill(multiplier),
    multiplier
  };
  const input = makeRequest(child, skillLevel, config, appliedModifiers);
  return independentDirectDamage(input);
}

test("Round9 Herta uses fixed-source curves and keeps one final AoE component for Interpretation", () => {
  const catalog = readJson("games/hsr/data/catalog.json");
  const character = catalog.characters.find(item => item.id === "1401");
  assert.equal(override.id, "140109");
  assert.equal(override.provenance.sourceCommit, sourceSha);
  assert.equal(override.enemyCountExact, 1);
  assert.deepEqual(override.damageComponents.map(component => component.key), ["main", "repeat1", "repeat2", "final"]);
  const skill = character.skills.find(item => item.id === "140109");
  const talent = character.skills.find(item => item.id === "140104");
  for (let level = 1; level <= 10; level++) {
    for (const key of ["main", "repeat1", "repeat2"]) assertClose(override.damageComponents.find(component => component.key === key).multipliers[level - 1], skill.params[level - 1][0] * 100, `140109 #1 Lv${level} ${key}`);
    assertClose(override.damageComponents.find(component => component.key === "final").multipliers[level - 1], skill.params[level - 1][2] * 100, `140109 #3 Lv${level}`);
    assertClose(talentMain.value.values[level - 1], talent.params[level - 1][0] * 100, `140104 Lv${level} per-stack`);
    assertClose(talentDouble.value.values[level - 1], talent.params[level - 1][0] * 100, `140104 Lv${level} doubled per-stack`);
  }
  assertClose(castA2.value.fixed, readJson("games/hsr/data/catalog.json").characters.find(item => item.id === "1401").traces.find(item => item.id === "1401101").params[0][1] * 100, "1401101 A2 fixed-source damage bonus");
  assert.match(override.calculationNote, /最後の全体攻撃が参照する.*0～42層/);
  assert.match(override.calculationNote, /攻撃中の層付与・消費・リセットは再現しません/);
});

test("A2 is automatically thresholded from its own selected snapshot; Talent stacks apply only to final AoE", () => {
  const context = hertaContext(10, true);
  const candidatesByCastState = [0, 41, 42].map(stacks => modifierRuntime.buildCandidates([castA2], context, { [skillInput]: stacks })[0]);
  assert.deepEqual(candidatesByCastState.map(candidate => candidate.enabled), [false, false, true]);
  assert.deepEqual(candidatesByCastState.map(candidate => candidate.automatic), [false, false, false], "the stack snapshot is an explicit state; threshold is inferred from that input");
  assert.equal(candidatesByCastState[2].value, 50);
  assert.equal(modifierRuntime.applicableToAttack(candidatesByCastState[2], { id: "140109", type: "enhancedSkill", element: "Ice" }), true);
  const missingCast = modifierRuntime.buildCandidates([castA2], context, {})[0];
  assert.equal(missingCast.enabled, false, "unknown A2 state stays locally omitted");
  assert.equal(missingCast.activation.unresolved, true);
  const invalidCast = modifierRuntime.buildCandidates([castA2], context, { [skillInput]: 43 })[0];
  assert.equal(invalidCast.enabled, false, "out-of-range cast snapshot cannot activate A2");
  assert.equal(invalidCast.activation.unresolved, true);
  const finalCandidate = modifierRuntime.buildCandidates([talentMain], context, { [finalInput]: 17 })[0];
  assert.equal(finalCandidate.value, 136, "17 stacks × 8% at Lv10");
  assert.equal(modifierRuntime.applicableToAttack(finalCandidate, { id: "140109:final", type: "enhancedSkill", element: "Ice" }), true);
  assert.equal(modifierRuntime.applicableToAttack(finalCandidate, { id: "140109", type: "enhancedSkill", element: "Ice" }), false);
  assert.equal(modifierRuntime.buildCandidates([talentMain], context, { [finalInput]: 0 })[0].value, 0);
  const invalid = modifierRuntime.buildCandidates([talentMain], context, { [finalInput]: 43 })[0];
  assert.equal(invalid.enabled, false, "out-of-range snapshot is rejected instead of silently capped");
  assert.equal(invalid.activation.unresolved, true);
});

test("The enhanced Skill matches independent sums at every Skill/Talent level and Interpretation boundaries", async () => {
  const { data, engine } = await loadProductionFixture();
  assert.ok(data.sources.some(source => source.revision === sourceSha));
  const productionAttack = data.attacks.find(item => item.id === "140109");
  assert.ok(productionAttack, "Round9 same-ID override replaces the previous fixed-state row");
  assert.match(productionAttack.conditionText, /A2判定時点/);
  const config = { atk: 3217.25, hp: 8500, def: 2711, critRate: 47, critDamage: 113, damageBonus: 21, resistance: 20, enemyLevel: 80, characterLevel: 80, eidolon: 0, enemyCount: 1, toughnessActive: true };
  const enhanced = productionAttack;
  const finalStates = Array.from({ length: 43 }, (_, index) => index);
  const boundaryCastStates = [0, 1, 41, 42];

  for (const secondMage of [false, true]) {
    for (let skillLevel = 1; skillLevel <= 10; skillLevel++) {
      for (let talentLevel = 1; talentLevel <= 10; talentLevel++) {
        const finalCandidates = secondMage ? finalStates : [0, 1, 41, 42];
        const castCandidates = skillLevel === 1 && talentLevel === 1 ? boundaryCastStates : [41, 42];
        for (const castStacks of castCandidates) {
          for (const finalStacks of finalCandidates) {
            const candidates = makeCandidates(talentLevel, secondMage, castStacks, finalStacks);
            const a2 = candidates.find(item => item.id === castA2.id);
            const base = candidates.find(item => item.id === talentMain.id);
            const doubled = candidates.find(item => item.id === talentDouble.id);
            assert.equal(a2.enabled, castStacks >= 42, `A2 cast stacks=${castStacks}`);
            assert.equal(base.value, finalStacks * [4,4.4,4.8,5.2,5.6,6,6.5,7,7.5,8][talentLevel - 1], `talent=${talentLevel} final=${finalStacks}`);
            assert.equal(doubled.value, base.value);
            assert.equal(doubled.enabled, secondMage, `double bonus follows the automatic two-Erudition condition`);

            const selectedInputs = { [skillInput]: castStacks, [finalInput]: finalStacks };
            const childInputs = enhanced.damageComponents.map(component => {
              const scoped = component.key === "final" ? [a2, base, doubled] : [a2];
              const child = { ...enhanced, ...component, id: component.attackId, sourceSkillId: "140109", type: "enhancedSkill", attackType: "enhancedSkill", damageFormula: "statMultiplier", damageComponents: undefined, hitCount: 1, canCrit: true, traceLevel: skillLevel, maximumTraceLevel: 10, multipliers: component.multipliers };
              return { key: component.key, name: component.name, input: { ...makeRequest(child, skillLevel, config, scoped), modifierInputs: selectedInputs } };
            });
            const actual = engine.calculate({ ...makeRequest(enhanced, skillLevel, config), modifierInputs: { [skillInput]: castStacks, [finalInput]: finalStacks }, sequenceComponents: childInputs });
            assert.notEqual(actual.supported, false, `Skill Lv${skillLevel}, Talent Lv${talentLevel}, A2=${castStacks}, final=${finalStacks}, Mage=${secondMage}`);
            const independentParts = enhanced.damageComponents.map(component => {
              const scoped = component.key === "final" ? [a2, base, doubled] : [a2];
              return directExpected(component, skillLevel, config, scoped);
            });
            for (const key of ["nonCrit", "crit", "expected"]) {
              assertClose(actual[key], independentParts.reduce((sum, part) => sum + part[key], 0), `SkillLv${skillLevel}/TalentLv${talentLevel}/cast${castStacks}/final${finalStacks}/Mage${secondMage}/${key}`);
            }
          }
        }
      }
    }
  }
});

test("The Herta's A2 and final-hit state remain independent; included A2 and missing final stack are local", () => {
  const context = hertaContext(10, false);
  const state = { [skillInput]: 42, [finalInput]: 42 };
  const normal = modifierRuntime.buildCandidates(modifiers, context, state);
  const a2 = normal.find(item => item.id === castA2.id);
  const talent = normal.find(item => item.id === talentMain.id);
  assert.equal(a2.enabled, true);
  assert.equal(talent.value, 336);
  const includedA2 = modifierRuntime.buildCandidates(modifiers, context, { ...state, "herta-a2-interpretation-damage-in-final": true });
  assert.equal(includedA2.find(item => item.id === castA2.id).enabled, false, "already-included input skips only A2 addition");
  const missing = modifierRuntime.buildCandidates([talentMain], context, {} )[0];
  assert.equal(missing.activation.unresolved, true, "missing final stack is not assumed to be0");
});

test("Round9 attack rejects missing and reordered skill components", async () => {
  const { engine } = await loadProductionFixture();
  const config = { atk: 3000, hp: 6000, def: 2400, critRate: 50, critDamage: 100, damageBonus: 0, resistance: 20, enemyLevel: 80, characterLevel: 80, eidolon: 0, enemyCount: 1, toughnessActive: true };
  const parts = override.damageComponents.map(component => {
    const child = { ...override, ...component, id: component.attackId, sourceSkillId: "140109", type: "enhancedSkill", attackType: "enhancedSkill", damageFormula: "statMultiplier", damageComponents: undefined, hitCount: 1, canCrit: true, traceLevel: 1, multiplier: component.multipliers[0] };
    return { key: component.key, name: component.name, input: { ...makeRequest(child, 1, config), modifierInputs: { [finalInput]: 0 } } };
  });
  const request = { ...makeRequest(override, 1, config), modifierInputs: { [finalInput]: 0 } };
  assert.notEqual(engine.calculate({ ...request, sequenceComponents: parts }).supported, false);
  assert.equal(engine.calculate({ ...request, sequenceComponents: parts.slice(0, 3) }).supported, false);
  assert.equal(engine.calculate({ ...request, sequenceComponents: [parts[3], ...parts.slice(0, 3)] }).supported, false);
  assert.equal(engine.calculate({ ...makeRequest(override, 1, config), sequenceComponents: parts }).supported, false, "missing required final-hit stack is rejected locally");
  assert.equal(engine.calculate({ ...request, modifierInputs: { [finalInput]: 43 }, sequenceComponents: parts }).supported, false, "out-of-range final-hit state is rejected");
});
