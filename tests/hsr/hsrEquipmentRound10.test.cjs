'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  fixedSourceSha, loadProductionFixture, makeRequest, independentDirectDamage,
  assertClose
} = require('./helpers/hsrDirectVerification.cjs');
const runtime = require('../../games/js/hsrModifierRuntime.js');
const records = require('../../games/hsr/data/calc/modifiers-equipment-round10.json').modifiers;
const get = id => records.find(item => item.id === id);
const rows = [
  '21010', '21037', '22005', '23000', '23014', '23022', '23039'
];
const rankValues = {
  '21010': [8, 10, 12, 14, 16],
  '21037': [8, 9, 10, 11, 12],
  '22005': [8, 10, 12, 14, 16],
  '23000': [9, 10.5, 12, 13.5, 15],
  '23014': [14, 16.5, 19, 21.5, 24],
  '23022Atk': [5, 6, 7, 8, 9],
  '23022Ignore': [7.2, 7.9, 8.6, 9.3, 10],
  '23039': [30, 35, 40, 45, 50]
};
const context = (id, refinement, stats = {}, extra = {}) => ({
  characterId: '1206', lightConeId: id, refinement,
  stats: { atk: 3000, hp: 6000, def: 1200, critRate: 50, critDamage: 100, effectHitRate: 0, ...stats },
  baseStats: { atk: 1000, hp: 1000, def: 800 },
  enemy: { count: 1, level: 80, resistance: 20, toughnessActive: true },
  ...extra
});
const candidate = (record, ctx, inputs = {}) => runtime.buildCandidates([record], ctx, inputs)[0];
const calc = (engine, ctx, inputs, type = 'normal') => {
  const attack = { id: `round10-${type}`, type, attackType: type, element: 'Physical', scalingStat: 'atk', multipliers: [100], multiplier: 100, canCrit: true };
  const selected = records.map(row => candidate(row, ctx, inputs)).filter(Boolean)
    .map(item => ({ ...item, applicable: item.applicable !== false && runtime.applicableToAttack(item, attack) }));
  const request = makeRequest(attack, 1, {}, selected);
  request.attack.attackType = type;
  const actual = engine.calculate(request);
  const oracle = independentDirectDamage(request);
  assert.notEqual(actual.supported, false, actual.reason);
  for (const key of ['nonCrit', 'crit', 'expected']) assertClose(actual[key], oracle[key], `${type} ${key}`);
  return { actual, request, oracle, selected };
};

test('seven fixed-source light cones have exact five-rank curves and no duplicate source IDs', async () => {
  assert.equal(fixedSourceSha, 'dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487');
  const { data } = await loadProductionFixture();
  assert.equal(new Set(rows).size, 7);
  for (const id of rows) {
    assert.ok(data.lightCones.find(item => String(item.id) === id), `light cone ${id} exists in the loaded catalog`);
    const own = records.filter(row => row.source.id === id);
    assert.ok(own.length > 0);
    assert.ok(own.every(row => row.support.verified === true && row.provenance.sourceCommit === fixedSourceSha));
    assert.ok(own.some(row => row.support.status === 'calculable'));
    for (const row of own) if (row.value.kind === 'byRefinement' || row.value.kind === 'perStackByRefinement' || row.value.kind === 'perReferenceStack') {
      assert.equal(row.value.values.length, 5, `${row.id} S1-S5`);
    }
  }
  get('lightCone:21010:same-target-stacks').value.values.forEach((v,i)=>assertClose(v,rankValues['21010'][i]));
  get('lightCone:21037:fortune-stacks').value.values.forEach((v,i)=>assertClose(v,rankValues['21037'][i]));
  get('lightCone:22005:skill-atk-stacks').value.values.forEach((v,i)=>assertClose(v,rankValues['22005'][i]));
  get('lightCone:23000:field-enemy-atk').value.values.forEach((v,i)=>assertClose(v,rankValues['23000'][i]));
  get('lightCone:23014:eclipse-stacks').value.values.forEach((v,i)=>assertClose(v,rankValues['23014'][i]));
  get('lightCone:23022:prophecy-dot-types').value.values.forEach((v,i)=>assertClose(v,rankValues['23022Atk'][i]));
  get('lightCone:23022:prophecy-dot-types-def-ignore').value.values.forEach((v,i)=>assertClose(v,rankValues['23022Ignore'][i]));
  get('lightCone:23039:hp-cost-attack-active').value.values.forEach((v,i)=>assertClose(v,rankValues['23039'][i]));
});

test('21010 and 21037 apply only the user-selected prior state; the per-hit transition is not inferred', async () => {
  const { engine } = await loadProductionFixture();
  for (let rank = 1; rank <= 5; rank++) {
    for (const [id, key, perLayer, maximum] of [
      ['21010', 'same-target-stacks', rankValues['21010'][rank - 1], 5],
      ['21037', 'fortune-stacks', rankValues['21037'][rank - 1], 4]
    ]) for (const stacks of [0, maximum, maximum + 2]) {
      const record = get(`lightCone:${id}:${key}`);
      const inputs = { [key]: stacks };
      const item = candidate(record, context(id, rank), inputs);
      assert.equal(item.activation.inputValue, Math.min(stacks, maximum));
      assertClose(item.value, Math.min(stacks, maximum) * perLayer);
      assert.equal(item.automatic, false);
      const { actual, oracle } = calc(engine, context(id, rank), inputs, 'followUp');
      assertClose(actual.nonCrit, oracle.nonCrit);
      if (id === '21037' && stacks === 0) assertClose(item.value, 0);
    }
  }
});

test('22005 selected skill stacks alter ATK once, and 23000 enemy-count ATK is automatic', async () => {
  const { engine } = await loadProductionFixture();
  for (let rank = 1; rank <= 5; rank++) {
    const record = get('lightCone:22005:skill-atk-stacks');
    for (const stacks of [0, 1, 3]) {
      const item = candidate(record, context('22005', rank), { 'skill-atk-stacks': stacks });
      assertClose(item.value, stacks * rankValues['22005'][rank - 1]);
      assert.equal(item.automatic, false);
      const { request, actual } = calc(engine, context('22005', rank), { 'skill-atk-stacks': stacks }, 'skill');
      assertClose(actual.breakdown.referenceValue, 3000 + 1000 * item.value / 100);
      assertClose(actual.nonCrit, independentDirectDamage(request).nonCrit);
    }
    for (const count of [1, 2, 5]) {
      const item = candidate(get('lightCone:23000:field-enemy-atk'), context('23000', rank, {}, { enemy: { count, level: 80, resistance: 20, toughnessActive: true } }));
      assert.equal(item.automatic, true);
      assertClose(item.value, Math.min(count, 5) * rankValues['23000'][rank - 1]);
      const result = calc(engine, context('23000', rank, {}, { enemy: { count, level: 80, resistance: 20, toughnessActive: true } }), {}, 'normal');
      assertClose(result.actual.breakdown.referenceValue, 3000 + 1000 * item.value / 100);
    }
  }
});

test('23014 keeps Moon Eclipse layers and the max-layer next-hit DEF ignore explicit and separate', async () => {
  const { engine } = await loadProductionFixture();
  const damage = get('lightCone:23014:eclipse-stacks');
  const ignore = get('lightCone:23014:eclipse-max-defense-ignore');
  for (let rank = 1; rank <= 5; rank++) for (const stacks of [0, 1, 2, 3]) {
    const inputs = { 'eclipse-stacks': stacks };
    const d = candidate(damage, context('23014', rank), inputs), i = candidate(ignore, context('23014', rank), inputs);
    assertClose(d.value, stacks * rankValues['23014'][rank - 1]);
    assert.equal(i.enabled, stacks === 3);
    // Inactive candidates retain their refinement coefficient; activation must gate its use.
    assertClose(i.value, 12 + (rank - 1) * 2);
    const out = calc(engine, context('23014', rank), inputs, 'ultimate');
    assert.equal(out.selected.find(item => item.id === ignore.id).applicable, stacks === 3);
  }
});

test('23022 DoT type stacks affect ATK and DoT DEF ignore only; 23039 HP cost state is local to skill and ultimate', async () => {
  const { engine } = await loadProductionFixture();
  const atk = get('lightCone:23022:prophecy-dot-types'), ignore = get('lightCone:23022:prophecy-dot-types-def-ignore');
  for (let rank = 1; rank <= 5; rank++) for (const count of [0, 1, 4]) {
    const inputs = { 'prophecy-dot-types': count };
    assertClose(candidate(atk, context('23022', rank), inputs).value, count * rankValues['23022Atk'][rank - 1]);
    assertClose(candidate(ignore, context('23022', rank), inputs).value, count * rankValues['23022Ignore'][rank - 1]);
    const dot = calc(engine, context('23022', rank), inputs, 'dot');
    assert.equal(dot.selected.find(item => item.id === ignore.id).applicable, count > 0);
    const normal = calc(engine, context('23022', rank), inputs, 'normal');
    assert.equal(normal.selected.find(item => item.id === ignore.id).applicable, false);
    assertClose(dot.actual.breakdown.referenceValue, 3000 + 1000 * count * rankValues['23022Atk'][rank - 1] / 100);
  }
  for (let rank = 1; rank <= 5; rank++) {
    const base = get('lightCone:23039:hp-cost-attack-active'), extra = get('lightCone:23039:hp-cost-over-500');
    for (const type of ['normal', 'skill', 'ultimate']) {
      const inputs = { 'hp-cost-attack-active': true, 'hp-cost-over-500': true };
      const selected = records.filter(row => row.source.id === '23039').map(row => candidate(row, context('23039', rank), inputs));
      const baseItem = selected.find(item => item.id === base.id), extraItem = selected.find(item => item.id === extra.id);
      assert.equal(runtime.applicableToAttack(baseItem, { id: 'x', type }), ['skill', 'ultimate'].includes(type));
      assert.equal(runtime.applicableToAttack(extraItem, { id: 'x', type }), ['skill', 'ultimate'].includes(type));
      assert.equal(runtime.activationState(extra, context('23039', rank), { 'hp-cost-over-500': true }).active, false, 'bonus above 500 cannot activate without the base HP-cost state');
      const inputsOff = { 'hp-cost-attack-active': false, 'hp-cost-over-500': true };
      assert.equal(candidate(extra, context('23039', rank), inputsOff).enabled, false);
      const out = calc(engine, context('23039', rank), inputs, type);
      const sum = out.selected.filter(item => item.source?.id === '23039' && item.enabled && item.applicable).reduce((n, item) => n + item.value, 0);
      assertClose(sum, ['skill', 'ultimate'].includes(type) ? 2 * rankValues['23039'][rank - 1] : 0);
    }
  }
});

test('conditional cone additions honor final-inclusion flags and persisted input snapshots', async () => {
  const ctx = context('21010', 5), record = get('lightCone:21010:same-target-stacks');
  const inputs = { 'same-target-stacks': 3, [record.finalStatsInclusion.inputKey]: false };
  const first = candidate(record, ctx, inputs);
  const restored = candidate(record, ctx, JSON.parse(JSON.stringify(inputs)));
  assert.equal(first.enabled, true);
  assert.equal(restored.value, first.value);
  assert.equal(candidate(record, ctx, { ...inputs, [record.finalStatsInclusion.inputKey]: true }).enabled, false);
  assert.equal(runtime.buildCandidates(records, { ...ctx, lightConeId: '' }, inputs).length, 0, 'removing the light cone removes its corrections');
});
