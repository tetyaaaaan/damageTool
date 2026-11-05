"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  fixedSourceSha, loadProductionFixture, attackOf, makeRequest, runtime,
  independentDirectDamage, assertClose
} = require("./helpers/hsrDirectVerification.cjs");

const fixture = require("../../games/hsr/data/calc/modifiers-march-round17.json");
const [speedRecord, critRecord, breakRecord] = fixture.modifiers;
const supportKey = "march-shifu-support-active";
const a6Key = "march-shifu-a6-active";
const levels = [6, 6.4, 6.8, 7.2, 7.6, 8, 8.5, 9, 9.5, 10];

function context({ recipient = "1002", partyIds = ["1224"], eidolon = 0, traceLevel = 10, recipientBaseSpeed = 107 } = {}) {
  return {
    characterId: recipient,
    eidolon: 0,
    partyIds,
    partyEidolons: { "1224": eidolon },
    partyStats: { "1224": { speed: 131, breakEffect: 187.25 } },
    stats: { atk: 3000, hp: 7000, def: 2000, speed: 121, breakEffect: 83.5, critRate: 50, critDamage: 100 },
    baseStats: { atk: 1000, hp: 1200, def: 800, speed: recipientBaseSpeed },
    traceLevelFor: (source) => String(source?.id) === "1224" ? traceLevel : 1
  };
}

function candidates(records, ctx, inputs = {}) {
  return runtime.buildCandidates(records, ctx, inputs);
}

test("round17 March support definitions load and document their fixed pinned provenance", async () => {
  assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
  const { data } = await loadProductionFixture();
  for (const record of fixture.modifiers) {
    assert.ok(data.structuredModifiers.some((item) => item.id === record.id), "production loader includes " + record.id);
    assert.equal(record.provenance.sourceCommit, fixedSourceSha);
    assert.equal(record.provenance.verifiedAt, "2026-11-05");
    assert.equal(record.support.status, "calculable");
    assert.equal(record.support.verified, true);
    assert.equal(record.providerScope, "party");
    assert.equal(record.target.owner, "activeAlly");
    assert.equal(record.finalStatsInclusion.inputKey, record.id + "-in-final");
    assert.equal(record.inputValidation.maximumEidolon, 0);
  }
  assert.deepEqual(speedRecord.value.values, levels);
  assert.equal(speedRecord.source.skillId, "122402");
  assert.equal(speedRecord.source.traceId, undefined, "skill support is sourced from the skill, not an invented trace node");
  assert.equal(critRecord.source.traceId, "1224103");
  assert.equal(breakRecord.source.traceId, "1224103");
  assert.equal(critRecord.value.fixed, 60);
  assert.equal(breakRecord.value.fixed, 36);
  assert.equal(critRecord.activation.requiredToggleKey, supportKey);
  assert.equal(breakRecord.activation.requiredToggleKey, supportKey);
});

test("March skill SPD curve uses the selected recipient base SPD and excludes March herself", () => {
  const ctx = context({ traceLevel: 1 });
  const off = candidates([speedRecord], ctx, { [supportKey]: false })[0];
  assert.equal(off.enabled, false, "skill support state defaults off");
  assert.equal(off.automatic, false, "trigger/target state is supplied explicitly");
  for (let level = 1; level <= 10; level++) {
    const candidate = candidates([speedRecord], context({ traceLevel: level }), { [supportKey]: true })[0];
    assert.equal(candidate.enabled, true);
    assert.equal(candidate.applicable, true);
    assert.equal(candidate.providerId, "1224");
    assert.equal(candidate.value, levels[level - 1]);
    const expectedSpeed = 121 + 107 * levels[level - 1] / 100;
    assertClose(expectedSpeed - 121, 107 * levels[level - 1] / 100, "recipient base SPD hand calculation Lv" + level);
    assert.notEqual(expectedSpeed, 121 + 131 * levels[level - 1] / 100, "provider speed is not the reference");
  }
  const included = candidates([speedRecord], ctx, { [supportKey]: true, [speedRecord.finalStatsInclusion.inputKey]: true })[0];
  assert.equal(included.enabled, false);
  assert.equal(included.includedInFinalStats, true);
  assert.equal(candidates([speedRecord], context({ partyIds: [] }), { [supportKey]: true }).length, 0, "removing March removes the support");
  assert.equal(candidates([speedRecord], context({ recipient: "1224", partyIds: [], traceLevel: 10 }), { [supportKey]: true }).length, 0, "party support is not offered to March herself");
  const eidolonOne = candidates([speedRecord], context({ eidolon: 1 }), { [supportKey]: true })[0];
  assert.equal(eidolonOne.applicable, false, "E1 provider is outside the E0 data scope");
  assert.ok(eidolonOne.inputWarnings.some((warning) => warning.includes("星魂0")));
  const invalidLevel = candidates([speedRecord], context({ traceLevel: 11 }), { [supportKey]: true })[0];
  assert.equal(invalidLevel.applicable, false, "out-of-range provider skill level is rejected");
  assert.ok(invalidLevel.inputWarnings.some((warning) => warning.includes("1～10")));
});

test("March A6 requires the Shifu support state and adds CD / BE only to the selected ally", async () => {
  const ctx = context();
  const missingPrerequisite = candidates([critRecord, breakRecord], ctx, { [a6Key]: true });
  assert.equal(missingPrerequisite.every((item) => item.enabled === false), true);
  const active = candidates([critRecord, breakRecord], ctx, { [supportKey]: true, [a6Key]: true });
  const cd = active.find((item) => item.id === critRecord.id);
  const be = active.find((item) => item.id === breakRecord.id);
  assert.equal(cd.value, 60);
  assert.equal(be.value, 36);
  assert.equal(cd.enabled && cd.applicable, true);
  assert.equal(be.enabled && be.applicable, true);
  assert.equal(cd.automatic || be.automatic, false);
  const allActive = candidates([speedRecord, critRecord, breakRecord], ctx, { [supportKey]: true, [a6Key]: true });
  assert.deepEqual(allActive.map((item) => [item.id, item.value, item.enabled, item.applicable]), [
    [speedRecord.id, 10, true, true], [critRecord.id, 60, true, true], [breakRecord.id, 36, true, true]
  ], "all three support candidates can be active at once and retain separate CD/BE values");
  for (const unknownLevel of [undefined, NaN, 0]) {
    const badLevelContext = { ...ctx, traceLevelFor: () => unknownLevel };
    const invalid = candidates([speedRecord], badLevelContext, { [supportKey]: true })[0];
    assert.equal(invalid.applicable, false, "missing/invalid provider skill level is rejected: " + String(unknownLevel));
    assert.ok(invalid.inputWarnings.some((warning) => warning.includes("1～10")));
  }

  const { data, engine } = await loadProductionFixture();
  const attack = attackOf(data, "100201");
  const request = makeRequest(attack, 6, {
    atk: 3000, baseAtk: 1000, critRate: 50, critDamage: 100,
    damageBonus: 0, resistance: 20, toughnessActive: true
  }, [cd]);
  const oracle = independentDirectDamage(request);
  const actual = engine.calculate(request);
  assert.notEqual(actual.supported, false, actual.reason);
  for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], oracle[key], "independent CD direct oracle " + key);
  const literalBase = 3000 * request.attack.multiplier / 100 * 0.5 * 0.8 * 0.9;
  assertClose(actual.nonCrit, literalBase, "CD does not change non-crit hit");
  assertClose(actual.crit, literalBase * 2.6, "CD increases critical damage by 60 points");
  assertClose(actual.expected, literalBase * 1.8, "NC/C-derived EV at 50% CR");
  assert.equal(actual.applied.some((item) => item.id === critRecord.id), true);

  const breakInput = makeRequest(attack, 6, {
    atk: 3000, baseAtk: 1000, breakEffect: 83.5,
    enemyLevel: 80, resistance: 20, toughnessActive: false
  }, [be]);
  breakInput.character.stats.breakEffect = 83.5;
  breakInput.attack = { ...breakInput.attack, type: "superBreak", attackType: "superBreak", toughnessDamage: 30, superBreakMultiplier: 100 };
  breakInput.breakBaseDamage = { 80: 3767.5533 };
  const sb = engine.calculateSuperBreak(breakInput);
  const expectedSB = 3767.5533 * 3 * (1 + (83.5 + 36) / 100) * 0.5 * 0.8;
  assert.equal(sb.supported, true, sb.reason);
  assertClose(sb.value, expectedSB, "independent SB oracle includes the 36% BE support");
  assertClose(sb.breakEffect, 2.195, "base recipient BE plus March support");
  assert.equal(sb.applied.some((item) => item.id === breakRecord.id), true);
  assert.equal(sb.applied.some((item) => item.id === critRecord.id), false, "CD is not applied to super break");

  const a6Only = candidates([critRecord, breakRecord], ctx, { [supportKey]: false, [a6Key]: true });
  assert.equal(a6Only.every((item) => item.enabled === false), true, "A6 toggle cannot bypass missing Shifu skill state");
  const cdIncluded = candidates([critRecord], ctx, { [supportKey]: true, [a6Key]: true, [critRecord.finalStatsInclusion.inputKey]: true })[0];
  assert.equal(cdIncluded.enabled, false);
  assert.equal(cdIncluded.includedInFinalStats, true);
  const beIncluded = candidates([breakRecord], ctx, { [supportKey]: true, [a6Key]: true, [breakRecord.finalStatsInclusion.inputKey]: true })[0];
  assert.equal(beIncluded.enabled, false);
  assert.equal(beIncluded.includedInFinalStats, true);
  assert.equal(candidates([critRecord, breakRecord], context({ partyIds: [] }), { [supportKey]: true, [a6Key]: true }).length, 0, "removing March removes both A6 supports");
  const self = candidates([critRecord, breakRecord], context({ recipient: "1224", partyIds: [] }), { [supportKey]: true, [a6Key]: true });
  assert.equal(self.length, 0, "providerScope party excludes self-only application");
});
