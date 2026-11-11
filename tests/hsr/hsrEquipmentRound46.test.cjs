const test = require('node:test');
const assert = require('node:assert/strict');
const {
    loadProductionFixture,
    makeRequest,
    independentDirectDamage,
    assertClose,
    runtime
} = require('./helpers/hsrDirectVerification.cjs');

const ROUND_46_IDS = ['20022', '20023', '20024', '21055', '21065', '23042', '23049', '23051'];
const VALUES = {
    '20022': [8, 9, 10, 11, 12],
    '20023': [16, 20, 24, 28, 32],
    '20024': [20, 25, 30, 35, 40],
    '21055': [12, 14, 16, 18, 20],
    '21065': [12, 14, 16, 18, 20],
    '23042': [18, 22.5, 27, 31.5, 36],
    '23049': [30, 37.5, 45, 52.5, 60],
    '23051': [12, 15, 18, 21, 24]
};
const GUARD_VALUES = [24, 30, 36, 42, 48];
const DIRECT_ATTACK = { id: 'round46-direct', type: 'normal', element: 'Fire', scalingStat: 'atk', multipliers: [123], canCrit: true, target: 'single' };
const DIRECT_CONFIG = { atk: 3127, critRate: 37, critDamage: 129, damageBonus: 21, enemyLevel: 83, resistance: 23, takenDamage: 7 };
const DIRECT_BASE = 3127 * 1.23 * (100 / 203) * 0.77 * 0.9;

function coneRows(data, id) {
    return data.structuredModifiers.filter((item) => item.source?.kind === 'lightCone' && String(item.source.id) === String(id));
}

function ownCandidates(data, id, rank, inputs = {}, extra = {}) {
    return runtime.buildCandidates(coneRows(data, id), {
        characterId: '1003', lightConeId: id, refinement: rank, partyIds: [], partyEquipment: [],
        stats: { atk: 3127, def: 2317, hp: 6000, hpPercent: 75, critRate: 37, critDamage: 129, damageBonus: 21, elation: 100 },
        party: { punchline: 10 }, enemy: { count: 1 }, ...extra
    }, inputs);
}

function recipientCandidates(data, id, rank, inputs = {}, extra = {}) {
    return runtime.buildCandidates(coneRows(data, id), {
        characterId: '1003', lightConeId: '', refinement: 1, partyIds: ['1211'],
        partyEquipment: [{ characterId: '1211', lightConeId: id, refinement: rank }],
        stats: { atk: 3127, def: 2317, hp: 6000, hpPercent: 75, critRate: 37, critDamage: 129, damageBonus: 21 },
        partyStats: { '1211': { atk: 2500 } }, enemy: { count: 1 }, ...extra
    }, inputs);
}

function directRequest(attack = DIRECT_ATTACK, modifiers = [], config = DIRECT_CONFIG) {
    return makeRequest(attack, 1, config, modifiers);
}

function expectedDirect({ damageBonus = 0, takenDamage = 0, critDamage = 0 } = {}) {
    const nonCrit = DIRECT_BASE * (1 + (21 + damageBonus) / 100) * (1 + (7 + takenDamage) / 100);
    const critMultiplier = 1 + (129 + critDamage) / 100;
    return { nonCrit, crit: nonCrit * critMultiplier, expected: nonCrit * (1 + 0.37 * (129 + critDamage) / 100) };
}

function assertDirect(engine, request, fixedExpected, label) {
    const independent = independentDirectDamage(request);
    assertClose(independent.nonCrit, fixedExpected.nonCrit, label + ' independent nonCrit');
    assertClose(independent.crit, fixedExpected.crit, label + ' independent crit');
    assertClose(independent.expected, fixedExpected.expected, label + ' independent expected');
    const result = engine.calculate(request);
    assert.notEqual(result.supported, false, label + ' supported');
    for (const key of ['nonCrit', 'crit', 'expected']) assertClose(result[key], fixedExpected[key], label + ' ' + key);
    return result;
}

function rowInputKey(data, id, suffix) {
    const row = coneRows(data, id).find((item) => item.id.endsWith(suffix));
    assert.ok(row, id + ' ' + suffix + ' row');
    return row;
}

test('Round46 modifiers load once for their selected effects without asserting the file row total', async () => {
    const { data } = await loadProductionFixture();
    for (const id of ROUND_46_IDS) {
        const roundRows = coneRows(data, id);
        assert.ok(roundRows.length > 0, id + ' has its modifier loaded');
        for (const row of roundRows.filter((item) => item.provenance?.verification === 'tests/hsr/hsrEquipmentRound46.test.cjs')) {
            assert.equal(data.structuredModifiers.filter((item) => item.id === row.id).length, 1, row.id + ' loads exactly once');
        }
    }
});

test('20022 stack and 23049 active DMG reach independent direct NC/crit/expected at every refinement', async () => {
    const { data, engine } = await loadProductionFixture();
    for (let rank = 1; rank <= 5; rank++) {
        const byStack = [0, 1, 2, 3, 4];
        for (const stacks of byStack) {
            const input = ownCandidates(data, '20022', rank, { 'lc-20022-commemoration-stacks': stacks });
            const buff = VALUES['20022'][rank - 1] * stacks;
            assertDirect(engine, directRequest(DIRECT_ATTACK, input), expectedDirect({ damageBonus: buff }), `20022 S${rank} stack ${stacks}`);
        }
        const row = rowInputKey(data, '23049', 'nightshade-self-damage');
        for (const active of [false, true]) {
            const inputs = { 'lc-23049-nightshade-active': active };
            const candidates = ownCandidates(data, '23049', rank, inputs);
            const buff = active ? VALUES['23049'][rank - 1] : 0;
            assertDirect(engine, directRequest(DIRECT_ATTACK, candidates), expectedDirect({ damageBonus: buff }), `23049 S${rank} active=${active}`);
            if (active) {
                const included = ownCandidates(data, '23049', rank, { ...inputs, [row.finalStatsInclusion.inputKey]: true });
                assert.equal(included.find((item) => item.id === row.id).enabled, false, `23049 S${rank} already included`);
            }
        }
    }
});

test('20024 punchline and 21055 recipient HP thresholds use inclusive boundaries and missing references stay unresolved', async () => {
    const { data, engine } = await loadProductionFixture();
    for (let rank = 1; rank <= 5; rank++) {
        const punchlineRow = rowInputKey(data, '20024', 'punchline-crit');
        for (const punchline of [9, 10, 11]) {
            const candidates = ownCandidates(data, '20024', rank, {}, { party: { punchline } });
            const buff = punchline >= 10 ? VALUES['20024'][rank - 1] : 0;
            assertDirect(engine, directRequest(DIRECT_ATTACK, candidates), expectedDirect({ critDamage: buff }), `20024 S${rank} punchline ${punchline}`);
        }
        const missingPunchline = ownCandidates(data, '20024', rank, {}, { party: {} }).find((item) => item.id === punchlineRow.id);
        assert.equal(missingPunchline.enabled, false);
        assert.equal(missingPunchline.activation.unresolved, true);
        const hpRow = rowInputKey(data, '21055', 'healthy-party-damage');
        for (const hpPercent of [49.999, 50, 100]) {
            const candidates = recipientCandidates(data, '21055', rank, {}, { stats: { atk: 3127, def: 2317, hp: 6000, hpPercent, critRate: 37, critDamage: 129, damageBonus: 21 } });
            const buff = hpPercent >= 50 ? VALUES['21055'][rank - 1] : 0;
            const candidate = candidates.find((item) => item.id === hpRow.id);
            assert.equal(candidate.providerId, '1211');
            assertDirect(engine, directRequest(DIRECT_ATTACK, candidates), expectedDirect({ damageBonus: buff }), `21055 S${rank} recipient HP ${hpPercent}`);
        }
        const missingHp = recipientCandidates(data, '21055', rank, {}, { stats: { atk: 3127, def: 2317, hp: 6000, critRate: 37, critDamage: 129, damageBonus: 21 } }).find((item) => item.id === hpRow.id);
        assert.equal(missingHp.enabled, false);
        assert.equal(missingHp.activation.unresolved, true);
    }
});

test('21065 Elation stack and 20023 Aha state use the published Elation formula, all ranks', async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = data.attacks.find((item) => item.id === '1513042');
    assert.ok(attack, 'supported Elation attack available');
    for (let rank = 1; rank <= 5; rank++) {
        for (const ahaActive of [false, true]) for (const stacks of [0, 1, 2]) {
            const inputs = { 'lc-20023-aha-active': ahaActive, 'lc-21065-elation-stacks': stacks };
            const modifiers = [...ownCandidates(data, '20023', rank, inputs), ...ownCandidates(data, '21065', rank, inputs)];
            const request = makeRequest(attack, 10, { atk: 3127, critRate: 37, critDamage: 129, enemyLevel: 83, resistance: 23, takenDamage: 7 }, modifiers);
            request.character.id = attack.characterId;
            request.character.stats.elation = 100;
            request.elation = { context: 'certifiedBanger', certifiedBanger: 40, punchline: 0, merrymake: 0, fervor: 0 };
            const elationStat = 100 + (ahaActive ? VALUES['20023'][rank - 1] : 0) + VALUES['21065'][rank - 1] * stacks;
            const defense = 100 / 203;
            const nonCrit = 7535.107 * attack.multipliers[9] / 100 * (1 + elationStat / 100)
                * (1 + 5 * 40 / 280) * defense * 0.77 * 0.9 * 1.07;
            const result = engine.calculate(request);
            assert.notEqual(result.supported, false, `Elation S${rank} Aha=${ahaActive} stack=${stacks}`);
            assertClose(result.nonCrit, nonCrit, `Elation S${rank} Aha=${ahaActive} stack=${stacks} nonCrit`);
            assertClose(result.crit, nonCrit * 2.29, `Elation S${rank} Aha=${ahaActive} stack=${stacks} crit`);
            assertClose(result.expected, nonCrit * (1 + 0.37 * 1.29), `Elation S${rank} Aha=${ahaActive} stack=${stacks} expected`);
        }
    }
    const outOfTarget = ownCandidates(data, '20023', 5, { 'lc-20023-aha-active': true });
    const directResult = engine.calculate(directRequest(DIRECT_ATTACK, outOfTarget));
    assertDirect(engine, directRequest(DIRECT_ATTACK, outOfTarget), expectedDirect(), 'Elation-only LC does not buff direct damage');
    assert.ok(directResult.skipped.some((item) => item.id === outOfTarget[0].id));
});

test('21055 and 23051 require an equipped party provider and use the recipient state; restore preserves inputs', async () => {
    const { data, engine } = await loadProductionFixture();
    for (let rank = 1; rank <= 5; rank++) {
        const active = { 'lc-23051-guard-active': true, 'lc-23051-recipient-summon-present': true };
        const candidates = recipientCandidates(data, '23051', rank, active);
        assert.ok(candidates.every((item) => item.providerId === '1211'));
        const combined = GUARD_VALUES[rank - 1] + VALUES['23051'][rank - 1];
        assertDirect(engine, directRequest(DIRECT_ATTACK, candidates), expectedDirect({ damageBonus: combined }), `23051 S${rank} guard + summon recipient`);
        const guardOnly = recipientCandidates(data, '23051', rank, { 'lc-23051-guard-active': true, 'lc-23051-recipient-summon-present': false });
        assertDirect(engine, directRequest(DIRECT_ATTACK, guardOnly), expectedDirect({ damageBonus: GUARD_VALUES[rank - 1] }), `23051 S${rank} guard without summon`);
        const summonWithoutGuard = recipientCandidates(data, '23051', rank, { 'lc-23051-guard-active': false, 'lc-23051-recipient-summon-present': true });
        assertDirect(engine, directRequest(DIRECT_ATTACK, summonWithoutGuard), expectedDirect(), `23051 S${rank} summon without guard`);

        const serialized = JSON.parse(JSON.stringify(active));
        const restored = recipientCandidates(data, '23051', rank, serialized);
        assert.deepEqual(restored.map((item) => [item.id, item.value, item.enabled, item.providerId]), candidates.map((item) => [item.id, item.value, item.enabled, item.providerId]));
    }
    for (const id of ['21055', '23051']) {
        const records = coneRows(data, id);
        const missingProvider = runtime.buildCandidates(records, { characterId: '1003', lightConeId: '', partyIds: [], partyEquipment: [], stats: { hpPercent: 100 }, enemy: { count: 1 } }, { 'lc-23051-guard-active': true, 'lc-23051-recipient-summon-present': true });
        assert.equal(missingProvider.length, 0, id + ' provider removed');
        const selfWithoutCone = runtime.buildCandidates(records, { characterId: '1003', lightConeId: '', partyIds: [], partyEquipment: [], stats: { hpPercent: 100 }, enemy: { count: 1 } }, { 'lc-23051-guard-active': true, 'lc-23051-recipient-summon-present': true });
        assert.equal(selfWithoutCone.length, 0, id + ' unequipped');
    }
});

test('23042 enemy taken damage is toggle-controlled at every refinement and disabled when the toggle is off', async () => {
    const { data, engine } = await loadProductionFixture();
    for (let rank = 1; rank <= 5; rank++) for (const active of [false, true]) {
        const candidates = ownCandidates(data, '23042', rank, { 'lc-23042-memosprite-debuff-active': active });
        assertDirect(engine, directRequest(DIRECT_ATTACK, candidates), expectedDirect({ takenDamage: active ? VALUES['23042'][rank - 1] : 0 }), `23042 S${rank} active=${active}`);
    }
});

test('21016 equipped Burn supplemental attack uses DEF at each refinement, Fire input and DoT-only targeting', async () => {
    const { data, engine } = await loadProductionFixture();
    const coefficients = [40, 50, 60, 70, 80];
    for (let rank = 1; rank <= 5; rank++) {
        const candidate = ownCandidates(data, '21016', rank).find((item) => item.id.endsWith(':burn-tick'));
        assert.ok(candidate?.enabled, `21016 S${rank} burn candidate`);
        const dotAttack = { id: 'lc-21016-burn-test', type: 'dot', element: 'Fire', scalingStat: 'def', multipliers: [coefficients[rank - 1]], canCrit: false, target: 'single' };
        assert.equal(runtime.applicableToAttack(candidate, dotAttack), true, 'burn applies to DoT');
        assert.equal(runtime.applicableToAttack(candidate, DIRECT_ATTACK), false, 'burn does not attach to ordinary direct attack');
        const context = { characterId: '1003', characterElement: 'Wind', partyIds: [], stats: { def: 2317, damageBonus: 0 } };
        const refKey = `lc-21016-fire-damage:1003`;
        const reference = runtime.supplementalReference(candidate, context, { [refKey]: 17.5 });
        assert.equal(reference.supported, true, `cross-element Fire bonus supplied S${rank}`);
        assert.equal(reference.stats.damageBonus, 17.5);
        assert.equal(reference.sourceCharacterId,'1003','equipment source resolves to its wearer, not LC ID');
        assert.equal(reference.statReferenceId,'1003');
        for (const missing of [undefined, NaN, null, '', Infinity]) assert.equal(runtime.supplementalReference(candidate, context, { [refKey]: missing }).supported, false);
        const request = makeRequest(dotAttack, 1, { atk: 3127, def: 2317, baseDef: 0, baseAtk: 0, critRate: 80, critDamage: 200, damageBonus: reference.stats.damageBonus, enemyLevel: 83, resistance: 23, takenDamage: 7 }, [candidate]);
        const expected = 2317 * coefficients[rank - 1] / 100 * (1 + 17.5 / 100) * (100 / 203) * 0.77 * 0.9 * 1.07;
        const result = engine.calculate(request);
        assert.notEqual(result.supported, false, `21016 S${rank} DoT calculates`);
        assertClose(result.nonCrit, expected, `21016 S${rank} DEF DoT nonCrit`);
        assertClose(result.crit, expected, `21016 S${rank} noncritical crit value`);
        assertClose(result.expected, expected, `21016 S${rank} noncritical expected`);
        const scoped={...candidate,id:'test-dot-bonus',category:'dotDamage',value:17,stacking:{group:'dot-fixture',rule:'add'}};
        const skillOnly={...candidate,id:'test-skill-bonus',category:'damageBonus',value:80,target:{owner:'self',attackTypes:['skill'],elements:[]},stacking:{group:'skill-fixture',rule:'add'}};
        const scopedResult=engine.calculate({...request,modifiers:[candidate,scoped,skillOnly]});
        assertClose(scopedResult.nonCrit,2317*coefficients[rank-1]/100*(1+.175+.17)*100/203*.77*.9*1.07,'DoT bonus adds while Skill bonus stays out');

        assert.equal(ownCandidates(data, '21016', rank, {}, { lightConeId: '' }).length, 0, `21016 S${rank} unequipped`);
    }
});

test('stack validation, final-stat inclusion, attack targets, and missing cone selection stay local', async () => {
    const { data, engine } = await loadProductionFixture();
    const cases = [
        ['20022', 'commemoration-damage', 'lc-20022-commemoration-stacks', 4],
        ['21065', 'elation-stacks', 'lc-21065-elation-stacks', 2]
    ];
    for (const [id, suffix, inputKey, max] of cases) {
        for (const invalid of [-1, max + 1, 1.5]) {
            const candidate = ownCandidates(data, id, 1, { [inputKey]: invalid }).find((item) => item.id.endsWith(suffix));
            assert.ok(candidate.inputWarnings.length > 0, id + ' invalid stack ' + invalid);
        }
        const absent = runtime.buildCandidates(coneRows(data, id), { characterId: '1003', lightConeId: '', stats: { elation: 100 }, enemy: { count: 1 } }, { [inputKey]: max });
        assert.equal(absent.length, 0, id + ' not equipped');
    }
    for (const id of ['20023', '20024', '23042', '23049']) {
        assert.equal(runtime.buildCandidates(coneRows(data, id), { characterId: '1003', lightConeId: '', stats: { hpPercent: 75, elation: 100 }, party: { punchline: 10 }, enemy: { count: 1 } }, {
            'lc-20023-aha-active': true,
            'lc-23042-memosprite-debuff-active': true,
            'lc-23049-nightshade-active': true
        }).length, 0, id + ' unequipped');
    }
    for (const id of ROUND_46_IDS) {
        for (const row of coneRows(data, id).filter((item) => item.provenance?.verification === 'tests/hsr/hsrEquipmentRound46.test.cjs')) {
            const context = ['21055', '23051'].includes(id)
                ? { characterId: '1003', lightConeId: '', partyIds: ['1211'], partyEquipment: [{ characterId: '1211', lightConeId: id, refinement: 1 }], stats: { hpPercent: 75 }, enemy: { count: 1 } }
                : { characterId: '1003', lightConeId: id, refinement: 1, partyIds: [], partyEquipment: [], stats: { hpPercent: 75, elation: 100 }, party: { punchline: 10 }, enemy: { count: 1 } };
            const activeInputs = { [row.activation?.inputKey]: row.activation?.mode === 'stack' ? 1 : true };
            if (row.activation?.requiredToggleKey) activeInputs[row.activation.requiredToggleKey] = true;
            if (row.finalStatsInclusion) activeInputs[row.finalStatsInclusion.inputKey] = true;
            const candidates = runtime.buildCandidates(coneRows(data, id), context, activeInputs);
            const candidate = candidates.find((item) => item.id === row.id);
            assert.ok(candidate, row.id + ' candidate exists');
            assert.equal(candidate.enabled, false, row.id + ' excluded when already included in final input');
        }
    }
    const elationOnly = ownCandidates(data, '21065', 5, { 'lc-21065-elation-stacks': 2 });
    assertDirect(engine, directRequest(DIRECT_ATTACK, elationOnly), expectedDirect(), '21065 Elation bonus does not leak to ordinary attack');
});


test('Round46 duplicate support providers are locally unresolved and unsupported supplemental references fail registration',async()=>{
 const {data}=await loadProductionFixture();
 for(const id of ['21055','23042']){
  const candidates=recipientCandidates(data,id,1,{'lc-23042-memosprite-debuff-active':true},{partyIds:['1211','1217'],partyEquipment:[{characterId:'1211',lightConeId:id},{characterId:'1217',lightConeId:id}]});
  assert.ok(candidates.every(x=>!x.enabled&&x.activation.unresolved));
 }
 const {validateModifiers}=require('../../scripts/validateHsrModifiers.cjs');
 const row=structuredClone(data.structuredModifiers.find(x=>x.id==='lightCone:21016:burn-tick'));row.supplementalAttack.statReference='trigger';
 assert.ok(validateModifiers([row]).some(x=>x.includes('supplementalAttack.statReference')));
});
