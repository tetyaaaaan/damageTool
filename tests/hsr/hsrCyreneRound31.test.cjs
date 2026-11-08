'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  loadProductionFixture, attackOf, makeRequest, independentDirectDamage, assertClose, runtime
} = require('./helpers/hsrDirectVerification.cjs');
const rows = require('../../games/hsr/data/calc/modifiers-cyrene-round31.json').modifiers;

function candidate(row, attack, level, recipientId, partyIds, inputs) {
  const context = {
    characterId: recipientId,
    eidolon: 0,
    partyIds,
    partyEidolons: Object.fromEntries(partyIds.map(id => [id, 0])),
    traceLevelFor: () => level,
    attack
  };
  return runtime.buildCandidates([row], context, inputs)[0];
}

function oracleWithoutCritDamage(base, critDamage, bonus, critRate) {
  const critMultiplier = 1 + (critDamage + bonus) / 100;
  return {
    nonCrit: base,
    crit: base * critMultiplier,
    expected: base * (1 + critRate / 100 * (critMultiplier - 1))
  };
}

function checkDamage(engine, request, expected, label) {
  const result = engine.calculate(request);
  assert.notEqual(result.supported, false, result.reason || label);
  for (const key of ['nonCrit', 'crit', 'expected']) assertClose(result[key], expected[key], `${label} ${key}`);
  return result;
}

test('Round31 Cyrene blessings apply only to the selected eligible attack and match an independent CRIT DMG oracle', async () => {
  const { data, engine } = await loadProductionFixture();
  const cerydra = rows.find(row => row.source.skillId === '1141523');
  const mydei = rows.find(row => row.source.skillId === '1141516');
  assert.ok(cerydra && mydei);
  assert.deepEqual(cerydra.value.values, [15, 18, 21, 24, 27, 30]);
  assert.deepEqual(mydei.value.values, [100, 120, 140, 160, 180, 200]);
  assert.deepEqual(mydei.target.attackIds, ['140411']);

  const meritInputs = { [cerydra.activation.inputKey]: true };
  for (let level = 1; level <= 6; level++) {
    const attack = attackOf(data, '100301');
    const modifier = candidate(cerydra, attack, level, '1003', ['1415', '1412'], meritInputs);
    assert.equal(modifier.enabled, true);
    assert.equal(modifier.value, cerydra.value.values[level - 1]);
    modifier.applicable = runtime.applicableToAttack(modifier, attack);
    const request = makeRequest(attack, 10, { atk: 4317, critRate: 37, critDamage: 147, damageBonus: 23 }, [modifier]);
    const base = independentDirectDamage({ ...request, modifiers: [] });
    checkDamage(engine, request, oracleWithoutCritDamage(base.nonCrit, 147, modifier.value, 37), `1141523 Lv${level}`);
  }
  const meritOff = candidate(cerydra, attackOf(data, '100301'), 6, '1003', ['1415', '1412'], { ...meritInputs, [cerydra.activation.inputKey]: false });
  assert.equal(meritOff.enabled, false);
  assert.equal(candidate(cerydra, attackOf(data, '100301'), 6, '1003', ['1412'], meritInputs), undefined, 'Cyrene must be present as provider');
  const excluded = candidate(cerydra, attackOf(data, '100201'), 6, '1002', ['1415', '1412'], meritInputs);
  assert.equal(runtime.applicableToAttack(excluded, attackOf(data, '100201')), false, 'target is limited to the existing safe Himeko/Seele attacks');
  const includedInFinal = candidate(cerydra, attackOf(data, '100301'), 6, '1003', ['1415', '1412'], {
    ...meritInputs,
    [cerydra.finalStatsInclusion.inputKey]: true
  });
  assert.equal(includedInFinal.enabled, false, 'avoid adding CRIT DMG already present in final stats');

  const triggeredAttack = attackOf(data, '140411');
  const triggeredInputs = { [mydei.activation.inputKey]: true };
  for (let level = 1; level <= 6; level++) {
    const modifier = candidate(mydei, triggeredAttack, level, '1404', ['1415'], triggeredInputs);
    assert.equal(modifier.enabled, true);
    assert.equal(modifier.value, mydei.value.values[level - 1]);
    modifier.applicable = runtime.applicableToAttack(modifier, triggeredAttack);
    const request = makeRequest(triggeredAttack, 10, { hp: 28371, critRate: 21, critDamage: 96, damageBonus: 17 }, [modifier]);
    const base = independentDirectDamage({ ...request, modifiers: [] });
    checkDamage(engine, request, oracleWithoutCritDamage(base.nonCrit, 96, modifier.value, 21), `1141516 Lv${level}`);
    assert.equal(runtime.applicableToAttack(modifier, attackOf(data, '140403')), false, 'the bonus is specific to the triggered Godslayer skill, not Mydei’s ultimate');
    assert.equal(runtime.applicableToAttack(modifier, attackOf(data, '140409')), false, 'the other enhanced skill is excluded');
  }
  const triggeredOff = candidate(mydei, triggeredAttack, 6, '1404', ['1415'], { [mydei.activation.inputKey]: false });
  assert.equal(triggeredOff.enabled, false);
  const alreadyIncluded = candidate(mydei, triggeredAttack, 6, '1404', ['1415'], {
    ...triggeredInputs,
    [mydei.finalStatsInclusion.inputKey]: true
  });
  assert.equal(alreadyIncluded.enabled, false);
});
