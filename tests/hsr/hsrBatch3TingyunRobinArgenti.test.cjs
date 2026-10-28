"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    runtime, fixedSourceSha, loadProductionFixture, attackOf, makeRequest,
    independentDirectDamage, assertClose
} = require("./helpers/hsrDirectVerification.cjs");

// Hand-transcribed from JP and EN character_skills / character_skill_trees at
// dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487; expected damage never reads a live curve.
// Ownership/snapshot evidence: https://srl.keqingmains.com/evidence/characters/lightning/tingyun
const source = {
    basic: [50, 60, 70, 80, 90, 100],
    argentiSkill: [60, 66, 72, 78, 84, 90, 97.5, 105, 112.5, 120],
    argentiUltimate90: [96, 102.4, 108.8, 115.2, 121.6, 128, 136, 144, 152, 160],
    argentiUltimate180Aoe: [168, 179.2, 190.4, 201.6, 212.8, 224, 238, 252, 266, 280],
    argentiUltimate180Bounce: [57, 60.8, 64.6, 68.4, 72.2, 76, 80.75, 85.5, 90.25, 95],
    argentiCritPerStack: [1, 1.15, 1.3, 1.45, 1.6, 1.75, 1.94, 2.13, 2.31, 2.5],
    tingyunSkillAdditional: [20, 22, 24, 26, 28, 30, 32.5, 35, 37.5, 40],
    tingyunTalentAdditional: [30, 33, 36, 39, 42, 45, 48.75, 52.5, 56.25, 60],
    tingyunTargetAtk: [25, 27.5, 30, 32.5, 35, 37.5, 40.62, 43.75, 46.88, 50],
    tingyunProviderCap: [15, 16, 17, 18, 19, 20, 21.25, 22.5, 23.75, 25],
    tingyunUltimateDamage: [20, 23, 26, 29, 32, 35, 38.75, 42.5, 46.25, 50],
    robinAdditional: [72, 76.8, 81.6, 86.4, 91.2, 96, 102, 108, 114, 120],
    robinSkillDamage: [25, 27.5, 30, 32.5, 35, 37.5, 40.62, 43.75, 46.88, 50],
    robinTalentCritDamage: [5, 6.5, 8, 9.5, 11, 12.5, 14.37, 16.25, 18.12, 20],
    robinAtkScale: [15.2, 15.96, 16.72, 17.48, 18.24, 19, 19.95, 20.9, 21.85, 22.8],
    robinAtkFlat: [50, 65, 80, 95, 110, 125, 143.75, 162.5, 181.25, 200]
};
const profiles = [
    { atk: 3175.25, hp: 9432.5, def: 1288.75, baseAtk: 1043, baseHp: 1287, baseDef: 743,
      critRate: 37.5, critDamage: 113.25, damageBonus: 27.5, enemyLevel: 83, resistance: 30,
      toughnessActive: true, defenseReduction: 12.5, defenseIgnore: 7.5, resistancePenetration: 6.25, takenDamage: 11.5 },
    { atk: 2143.75, hp: 14321.25, def: 3541.5, baseAtk: 891, baseHp: 1523, baseDef: 1009,
      critRate: 71.25, critDamage: 87.5, damageBonus: 11.75, enemyLevel: 76, resistance: 10,
      toughnessActive: false, defenseReduction: 4.25, defenseIgnore: 18.5, resistancePenetration: 13.75, takenDamage: 5.5 }
];
function record(data, id) {
    const value = data.structuredModifiers.find(item => item.id === id);
    assert.ok(value, id + " exists in production loader");
    return value;
}
function candidate(data, id, level, context, inputs = {}) {
    const candidates = runtime.buildCandidates([record(data, id)], { eidolon: 0, traceLevelFor: () => level, ...context }, inputs);
    assert.equal(candidates.length, 1, id + " selected");
    return candidates[0];
}
function scoped(candidates, attack) {
    return candidates.map(item => ({ ...item, applicable: item.applicable !== false && runtime.applicableToAttack(item, attack) }));
}
function expectDamage(engine, actualInput, multiplier, modifiers = [], label = "damage") {
    const oracle = independentDirectDamage({ ...actualInput,
        attack: { ...actualInput.attack, damageFormula: "statMultiplier", scalingStat: "atk", multiplier, hitCount: 1 }, modifiers });
    const actual = engine.calculate(actualInput);
    assert.notEqual(actual.supported, false, label + " supported: " + actual.reason);
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], oracle[key], label + " " + key);
    return actual;
}

test("batch3 Tingyun Robin Argenti direct records match independent pinned curves at every E0 level", async () => {
    const { data, engine } = await loadProductionFixture();
    const cases = [["120201", "1202", "Thunder", "normal", source.basic], ["130901", "1309", "Physical", "normal", source.basic],
        ["130201", "1302", "Physical", "normal", source.basic], ["130202", "1302", "Physical", "skill", source.argentiSkill],
        ["130203", "1302", "Physical", "ultimate", source.argentiUltimate90]];
    for (const [id, owner, element, type, curve] of cases) {
        const attack = attackOf(data, id);
        assert.equal(attack.characterId, owner);
        assert.equal(attack.element, element);
        assert.equal(attack.type, type);
        assert.equal(attack.scalingStat, "atk");
        assert.equal(attack.canCrit, true);
        assert.equal(attack.support.status, "calculable");
        assert.equal(attack.provenance.sourceCommit, fixedSourceSha);
        assert.equal(attack.maximumTraceLevel, curve.length);
        for (let level = 1; level <= curve.length; level++) {
            assertClose(attack.multipliers[level - 1], curve[level - 1], id + " pinned curve Lv" + level);
            for (const profile of profiles) {
                const input = makeRequest(attack, level, profile);
                const baseline = expectDamage(engine, input, curve[level - 1], [], id + " Lv" + level);
                for (const stat of ["hp", "def"]) {
                    const changed = structuredClone(input);
                    changed.character.stats[stat] += 12345.75;
                    assertClose(engine.calculate(changed).expected, baseline.expected, id + " ignores " + stat);
                }
                const baseChanged = structuredClone(input);
                baseChanged.character.baseStats = { atk: 9876, hp: 34567, def: 5432 };
                assertClose(engine.calculate(baseChanged).expected, baseline.expected, id + " does not add base stats twice");
            }
        }
    }
});

test("Tingyun E0 Benediction cap and Ultimate damage use independent provider and recipient inputs at every level", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "130201");
    for (let level = 1; level <= 10; level++) for (const providerAtk of [1000.25, 9000.75]) {
        const profile = profiles[0];
        const context = { characterId: "1302", partyIds: ["1202"], partyEidolons: { "1202": 0 },
            partyStats: { "1202": { atk: providerAtk, hp: 77777, def: 8888 } },
            stats: { atk: profile.atk, hp: profile.hp, def: profile.def }, baseStats: { atk: profile.baseAtk } };
        const atk = candidate(data, "trace:1202:120202:benediction-atk", level, context, { "tingyun-benediction": true });
        const damage = candidate(data, "trace:1202:120203:ultimate-damage", level, context, { "tingyun-ultimate-active": true });
        const amount = Math.min(profile.baseAtk * source.tingyunTargetAtk[level - 1] / 100, providerAtk * source.tingyunProviderCap[level - 1] / 100);
        assertClose(atk.value, amount, "Benediction cap Lv" + level);
        assertClose(damage.value, source.tingyunUltimateDamage[level - 1], "Ultimate DMG Lv" + level);
        const actualModifiers = scoped([atk, damage], attack);
        const expectedModifiers = [{ category: "statFlat", stat: "atk", value: amount }, { category: "damageBonus", value: source.tingyunUltimateDamage[level - 1] }];
        expectDamage(engine, makeRequest(attack, 6, profile, actualModifiers), 100, expectedModifiers, "Tingyun support Lv" + level);
        for (const id of [atk.id, damage.id]) {
            const sourceRecord = record(data, id);
            assert.equal(runtime.buildCandidates([sourceRecord], { ...context, partyIds: [] }, { "tingyun-benediction": true, "tingyun-ultimate-active": true }).length, 0, "absent Tingyun cannot provide " + id);
            const off = candidate(data, id, level, context, {});
            assert.equal(off.enabled, false, id + " defaults OFF");
        }
    }
});

test("Tingyun skill and Talent additions use the blessed ally snapshot at every level with no provider-stat leakage", async () => {
    const { data, engine } = await loadProductionFixture();
    const definitions = [["trace:1202:120202:benediction-extra-damage", source.tingyunSkillAdditional],
        ["trace:1202:120204:talent-extra-damage", source.tingyunTalentAdditional]];
    for (const [id, curve] of definitions) for (let level = 1; level <= 10; level++) {
        const recipient = profiles[0];
        const context = { characterId: "1302", partyIds: ["1202"], partyEidolons: { "1202": 0 },
            partyStats: { "1202": { atk: 1999, hp: 7777, def: 888, critRate: 1, critDamage: 3, damageBonus: 6 } },
            stats: { atk: recipient.atk }, baseStats: { atk: recipient.baseAtk } };
        const extra = candidate(data, id, level, context, { "tingyun-benediction": true });
        assertClose(extra.value, curve[level - 1], id + " pinned curve Lv" + level);
        assert.equal(extra.providerId, "1202", "effect source is Tingyun");
        const attack = { ...extra.supplementalAttack, multiplier: extra.value, hitCount: 1, attackType: "additional", traceLevel: level };
        assert.equal(attack.scalingStat, "atk");
        assert.equal(attack.type, "additional");
        assert.equal(attack.element, "Thunder");
        const input = makeRequest({ ...attack, multipliers: [extra.value] }, 1, recipient);
        input.attack = attack;
        const result = expectDamage(engine, input, curve[level - 1], [], id + " recipient snapshot Lv" + level);
        const providerChanged = { ...context, partyStats: { "1202": { atk: 99999, hp: 99999, def: 99999, critRate: 100, critDamage: 999, damageBonus: 999 } } };
        const changedExtra = candidate(data, id, level, providerChanged, { "tingyun-benediction": true });
        assertClose(changedExtra.value, extra.value, "provider stats do not replace recipient coeff");
        const recipientChanged = structuredClone(input);
        recipientChanged.character.stats.atk += 500;
        assert.ok(expectDamage(engine, recipientChanged, curve[level - 1], [], id + " recipient ATK change").expected > result.expected);
        const selfBasicTrace = candidate(data, "traceNode:1202:1202102:normal-damage", level, { characterId: "1202" });
        assert.equal(runtime.applicableToAttack(selfBasicTrace, attack), false, "Tingyun basic-only A4 never leaks into recipient additional damage");
    }
});

test("Robin E0 party support verifies every Skill Talent and Ultimate level without provider or attack-scope leakage", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "130201");
    const profile = profiles[1];
    const providerAtk = 4123.75;
    const context = { characterId: "1302", partyIds: ["1309"], partyEidolons: { "1309": 0 },
        partyStats: { "1309": { atk: providerAtk } }, stats: { atk: profile.atk }, baseStats: { atk: profile.baseAtk } };
    for (let level = 1; level <= 10; level++) {
        const skill = candidate(data, "trace:1309:130902:party-damage", level, context, { "robin-skill-damage-active": true });
        const talent = candidate(data, "trace:1309:130904:party-crit-damage", level, context, { "robin-talent-crit-active": true });
        const atk = candidate(data, "trace:1309:130903:concerto-atk", level, context, { "robin-concerto-atk-active": true });
        const atkAmount = providerAtk * source.robinAtkScale[level - 1] / 100 + source.robinAtkFlat[level - 1];
        assertClose(skill.value, source.robinSkillDamage[level - 1], "Robin Skill Lv" + level);
        assertClose(talent.value, source.robinTalentCritDamage[level - 1], "Robin Talent Lv" + level);
        assertClose(atk.value, atkAmount, "Robin Ultimate support Lv" + level);
        const actualModifiers = scoped([skill, talent, atk], attack);
        const expectedModifiers = [{ category: "damageBonus", value: source.robinSkillDamage[level - 1] },
            { category: "critDamage", value: source.robinTalentCritDamage[level - 1] }, { category: "statFlat", stat: "atk", value: atkAmount }];
        expectDamage(engine, makeRequest(attack, 6, profile, actualModifiers), 100, expectedModifiers, "Robin support Lv" + level);
        for (const item of [skill, talent, atk]) {
            assert.equal(runtime.buildCandidates([record(data, item.id)], { ...context, partyIds: [] }, {}).length, 0, "absent provider");
            const dot = { type: "dot", element: "Wind", scalingStat: "atk" };
            assert.equal(runtime.applicableToAttack(item, dot), item.category !== "critDamage", "DoT scope " + item.id);
            for (const type of ["break", "superBreak", "elation", "trueDamage"]) assert.equal(runtime.applicableToAttack(item, { type, element: "Physical" }), false, "excluded " + type);
        }
    }
});


test("Tingyun A4 is a separate self-basic bonus and entered permanent trace stats are never added again", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "120201");
    const native = record(data, "traceNode:1202:1202102:normal-damage");
    assert.equal(native.value.fixed, 40, "pinned A4 grants 40% Basic ATK DMG");
    const inputs = native.activation.inputKey ? { [native.activation.inputKey]: true } : {};
    const nativeCandidate = candidate(data, native.id, 1, { characterId: "1202", stats: profiles[0] }, inputs);
    assert.equal(nativeCandidate.enabled, true);
    for (let level = 1; level <= 6; level++) {
        const modifiers = scoped([nativeCandidate], attack);
        expectDamage(engine, makeRequest(attack, level, profiles[0], modifiers), source.basic[level - 1],
            [{ category: "damageBonus", value: 40 }], "Tingyun A4 basic Lv" + level);
    }
    for (const type of ["additional", "skill", "ultimate", "followUp", "dot"]) {
        assert.equal(runtime.applicableToAttack(nativeCandidate, { type, element: "Thunder" }), false, "A4 excludes " + type);
    }
    assert.equal(runtime.buildCandidates([native], { characterId: "1302", partyIds: ["1202"] }, inputs).length, 0,
        "self A4 does not become an external party effect");
    for (const id of ["traceStats:1202:attack", "traceStats:1202:defense", "traceStats:1202:thunder-damage"]) {
        const trace = candidate(data, id, 1, { characterId: "1202" });
        assert.equal(trace.enabled, false, id + " is already included in entered final stats");
        assert.equal(trace.displayOnly, true);
    }
});

test("Robin party supports require provider ATK and unlock high trace levels at their actual eidolons", async () => {
    const { data } = await loadProductionFixture();
    const id = "trace:1309:130903:concerto-atk";
    const base = { characterId: "1302", partyIds: ["1309"], partyEidolons: { "1309": 0 }, stats: { atk: 7777 }, partyStats: { "1309": { atk: 4123.75 } } };
    const inputs = { "robin-concerto-atk-active": true };
    const missing = candidate(data, id, 10, { ...base, partyStats: {} }, inputs);
    assert.equal(missing.applicable, false, "recipient ATK cannot fill an absent provider snapshot");
    assert.ok(missing.inputWarnings.length > 0);
    for (const level of [0, 11, 1.5, NaN]) {
        const invalid = candidate(data, id, level, base, inputs);
        assert.equal(invalid.applicable, false, "provider level " + level + " is rejected");
    }
    const e1 = candidate(data, id, 10, { ...base, partyEidolons: { "1309": 1 } }, inputs);
    assert.equal(e1.applicable, true, "Concerto ATK applies at E1");
    const e2Level11 = candidate(data, id, 11, { ...base, partyEidolons: { "1309": 2 } }, inputs);
    assert.equal(e2Level11.applicable, false, "Ultimate Lv11 remains locked before E3");
    const e3Level12 = candidate(data, id, 12, { ...base, partyEidolons: { "1309": 3 } }, inputs);
    assert.equal(e3Level12.applicable, true, "Ultimate Lv12 is accepted from E3");
    assertClose(e3Level12.value, 4123.75 * 0.2432 + 230, "fixed-SHA Ultimate Lv12 ATK support at E3");
    const talentE4Level11 = candidate(data, "trace:1309:130904:party-crit-damage", 11, { ...base, partyEidolons: { "1309": 4 } }, { "robin-talent-crit-active": true });
    assert.equal(talentE4Level11.applicable, false, "Talent Lv11 remains locked before E5");
    const talentE5Level12 = candidate(data, "trace:1309:130904:party-crit-damage", 12, { ...base, partyEidolons: { "1309": 5 } }, { "robin-talent-crit-active": true });
    assert.equal(talentE5Level12.applicable, true, "Talent Lv12 is accepted from E5");
    assertClose(talentE5Level12.value, 23, "fixed-SHA Talent Lv12 party CRIT DMG");
});

test("Robin Concerto additional proc has native fixed CRIT and never becomes an immediate Ultimate hit", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "130903");
    assert.equal(attack.type, "additional");
    assert.equal(attack.element, "Physical");
    assert.equal(attack.traceKey, "ultimate");
    assert.equal(attack.enemyCountExact, 1);
    assert.equal(attack.maximumTraceLevel, 10);
    assert.equal(attack.maximumEidolon, 0);
    assert.equal(attack.support.status, "calculable");
    assert.equal(attack.provenance.sourceCommit, fixedSourceSha);
    assert.deepEqual(JSON.parse(JSON.stringify(attack.fixedCritStats)), { critRate: 100, critDamage: 150 });
    assert.match(attack.calculationNote, /協奏/);
    for (let level = 1; level <= 10; level++) for (const profile of profiles) {
        assertClose(attack.multipliers[level - 1], source.robinAdditional[level - 1], "Robin proc pinned Lv" + level);
        const input = makeRequest(attack, level, profile);
        const expectedInput = structuredClone(input);
        expectedInput.character.stats.critRate = 100;
        expectedInput.character.stats.critDamage = 150;
        const oracle = independentDirectDamage({ ...expectedInput, attack: { ...expectedInput.attack, multiplier: source.robinAdditional[level - 1] } });
        const actual = engine.calculate(input);
        assert.notEqual(actual.supported, false, "Robin proc Lv" + level + ": " + actual.reason);
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], oracle[key], "fixed crit " + key);
        assertClose(actual.expected, actual.nonCrit * 2.5, "proc guaranteed 150% Crit DMG");
        assertClose(actual.crit, actual.expected, "proc has no stochastic crit gap");
        assertClose(actual.breakdown.critRatePercent, 100, "fixed native CRIT Rate");
        assertClose(actual.breakdown.critDamagePercent, 150, "fixed native CRIT DMG");
        const changed = structuredClone(input);
        changed.character.stats.critRate = -500;
        changed.character.stats.critDamage = 99999;
        changed.character.stats.hp += 45678;
        changed.character.stats.def += 5432;
        changed.character.baseStats = { atk: 99999, hp: 99999, def: 99999 };
        changed.modifiers = [
            { id: "external-crit-rate", category: "critRate", value: 80, enabled: true, applicable: true },
            { id: "external-crit-damage", category: "critDamage", value: 500, enabled: true, applicable: true },
            { id: "external-guaranteed-crit", category: "critRateOverride", value: 100, enabled: true, applicable: true },
            { id: "ultimate-only-damage", category: "damageBonus", value: 42, target: { attackTypes: ["ultimate"] }, enabled: true, applicable: true },
            { id: "followup-only-damage", category: "damageBonus", value: 56, target: { attackTypes: ["followUp"] }, enabled: true, applicable: true }
        ];
        const ignored = engine.calculate(changed);
        assert.notEqual(ignored.supported, false);
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(ignored[key], actual[key], "fixed proc ignores actor CR/CD and unrelated stats " + key);
        const atkChanged = structuredClone(input);
        atkChanged.character.stats.atk += 731.25;
        const raised = engine.calculate(atkChanged);
        assertClose(raised.expected / actual.expected, atkChanged.character.stats.atk / input.character.stats.atk, "proc consumes entered final ATK once");
    }
    for (const value of [15, -5]) {
        const input = makeRequest(attack, 10, profiles[0], [{ id: "unverified-crit-taken", category: "critTakenDamage", value, enabled: true, applicable: true }]);
        assert.equal(engine.calculate(input).supported, false, "unverified fixed-CRIT enemy interaction fails closed");
        input.modifiers[0].enabled = false;
        assert.notEqual(engine.calculate(input).supported, false, "disabled crit-taken input does not block");
    }
});

test("Robin own Skill bonus uses all ten independent levels and cannot duplicate the party provider record", async () => {
    const { data, engine } = await loadProductionFixture();
    const selfSkill = data.structuredModifiers.find(item => item.source?.id === "1309" && item.source?.skillId === "130902"
        && item.providerScope === "self" && item.category === "damageBonus");
    assert.ok(selfSkill, "Robin owns a separate self Skill damage record");
    const context = { characterId: "1309", eidolon: 0, partyIds: [], stats: profiles[0] };
    assert.equal(runtime.buildCandidates([record(data, "trace:1309:130902:party-damage")], context, { "robin-skill-damage-active": true }).length, 0,
        "party Skill record excludes the owner");
    const proc = attackOf(data, "130903");
    const basic = attackOf(data, "130901");
    for (let level = 1; level <= 10; level++) {
        const off = candidate(data, selfSkill.id, level, context, {});
        assert.equal(off.enabled, false);
        const on = candidate(data, selfSkill.id, level, context, { "robin-skill-damage-active": true });
        assertClose(on.value, source.robinSkillDamage[level - 1], "own Skill curve Lv" + level);
        for (const attack of [basic, proc]) {
            assert.equal(runtime.applicableToAttack(on, attack), true);
            const attackLevel = attack.id === "130901" ? 6 : level;
            const multiplier = attack.id === "130901" ? 100 : source.robinAdditional[level - 1];
            const input = makeRequest(attack, attackLevel, profiles[0], scoped([on], attack));
            const expectedInput = structuredClone(input);
            if (attack.id === "130903") {
                expectedInput.character.stats.critRate = 100;
                expectedInput.character.stats.critDamage = 150;
            }
            const expected = independentDirectDamage({ ...expectedInput, attack: { ...expectedInput.attack, multiplier },
                modifiers: [{ category: "damageBonus", value: source.robinSkillDamage[level - 1] }] });
            const actual = engine.calculate(input);
            assert.notEqual(actual.supported, false);
            for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], "Robin own Skill " + attack.id + " Lv" + level + " " + key);
        }
        assert.equal(runtime.buildCandidates([selfSkill], { characterId: "1302", partyIds: ["1309"], traceLevelFor: () => level }, { "robin-skill-damage-active": true }).length, 0,
            "self Skill record does not duplicate party support");
    }
});

test("Argenti 180 Energy reference includes the initial AoE and all six bounces at every Ultimate level", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "130214");
    assert.equal(attack.type, "ultimate");
    assert.equal(attack.scalingStat, "atk");
    assert.equal(attack.element, "Physical");
    assert.equal(attack.enemyCountExact, 1);
    assert.equal(attack.maximumTraceLevel, 10);
    assert.equal(attack.support.status, "review", "unknown intra-action native-state order remains a reference");
    assert.equal(attack.support.verified, false);
    assert.equal(attack.provenance.sourceCommit, fixedSourceSha);
    assert.equal(attack.multiplierComponents.length, 2, "AoE and six-bounce sum are exposed separately");
    for (let level = 1; level <= 10; level++) {
        const aoe = source.argentiUltimate180Aoe[level - 1];
        const bounceTotal = 6 * source.argentiUltimate180Bounce[level - 1];
        const total = aoe + bounceTotal;
        assertClose(attack.multiplierComponents[0].values[level - 1], aoe, "Argenti AoE Lv" + level);
        assertClose(attack.multiplierComponents[1].values[level - 1], bounceTotal, "Argenti six bounces Lv" + level);
        assertClose(attack.multipliers[level - 1], total, "Argenti whole-action multiplier Lv" + level);
        for (const profile of profiles) {
            // Ten pre-existing Apotheosis stacks are saturated: hit order cannot
            // create more CRIT Rate. A6 eligibility is held constant by the caller.
            for (const a6Active of [false, true]) {
                const snapshot = { ...profile, critRate: profile.critRate + 10 * source.argentiCritPerStack[level - 1],
                    damageBonus: profile.damageBonus + (a6Active ? 15 : 0) };
                const input = makeRequest(attack, level, snapshot);
                const actual = expectDamage(engine, input, total, [], "Argenti fixed native state Lv" + level);
                const aoeResult = independentDirectDamage({ ...input, attack: { ...input.attack, multiplier: aoe } });
                const bounceResult = independentDirectDamage({ ...input, attack: { ...input.attack, multiplier: source.argentiUltimate180Bounce[level - 1] } });
                for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], aoeResult[key] + 6 * bounceResult[key], "explicit seven-component sum " + key);
            }
        }
    }
    assertClose(attack.multipliers[9], 850, "Lv10 is 280+6x95, not only280");
});

test("Tingyun E0 Benediction ATK rejects a missing provider snapshot instead of using the recipient ATK", async () => {
    const { data } = await loadProductionFixture();
    const id = "trace:1202:120202:benediction-atk";
    const base = { characterId: "1302", partyIds: ["1202"], partyEidolons: { "1202": 0 },
        stats: { atk: 99999 }, baseStats: { atk: 1043 }, partyStats: { "1202": { atk: 3333 } } };
    for (const value of [undefined, 0, -1, NaN]) {
        const invalid = candidate(data, id, 10, { ...base, partyStats: value === undefined ? {} : { "1202": { atk: value } } }, { "tingyun-benediction": true });
        assert.equal(invalid.applicable, false, "invalid provider ATK " + value + " cannot calculate");
        assert.ok(invalid.inputWarnings.length > 0);
    }
    // Preserve the pre-existing Lv1..15 support contract; the independent E0 oracle above covers Lv1..10.
    for (const level of [0, 16, 1.5, NaN]) {
        assert.equal(candidate(data, id, level, base, { "tingyun-benediction": true }).applicable, false, "invalid configured Skill Lv" + level);
    }
});


test("Robin own Talent CRIT DMG is automatic unless included in final stats and cannot change fixed Concerto CRIT", async () => {
    const { data, engine } = await loadProductionFixture();
    const ownTalent = data.structuredModifiers.find(item => item.source?.id === "1309" && item.source?.skillId === "130904"
        && item.providerScope === "self" && item.category === "critDamage");
    assert.ok(ownTalent, "Robin has a separate self Talent record");
    assert.equal(ownTalent.activation.mode, "always");
    assert.ok(ownTalent.finalStatsInclusion.inputKey);
    const ownContext = { characterId: "1309", eidolon: 0, partyIds: [], stats: profiles[0] };
    const basic = attackOf(data, "130901");
    const proc = attackOf(data, "130903");
    for (let level = 1; level <= 10; level++) {
        const inputs = { [ownTalent.finalStatsInclusion.inputKey]: false };
        const on = candidate(data, ownTalent.id, level, ownContext, inputs);
        const off = candidate(data, ownTalent.id, level, ownContext, { [ownTalent.finalStatsInclusion.inputKey]: true });
        assert.equal(off.enabled, false, "already included Talent is excluded Lv" + level);
        assertClose(on.value, source.robinTalentCritDamage[level - 1], "own Talent CD source Lv" + level);
        for (let basicLevel = 1; basicLevel <= 6; basicLevel++) {
            const input = makeRequest(basic, basicLevel, profiles[0], scoped([on], basic));
            expectDamage(engine, input, source.basic[basicLevel - 1],
                [{ category: "critDamage", value: source.robinTalentCritDamage[level - 1] }], "Robin Basic Lv" + basicLevel + " Talent Lv" + level);
            const includedSnapshot = { ...profiles[0], critDamage: profiles[0].critDamage + source.robinTalentCritDamage[level - 1] };
            const includedInput = makeRequest(basic, basicLevel, includedSnapshot, scoped([off], basic));
            const includedResult = expectDamage(engine, includedInput, source.basic[basicLevel - 1], [], "entered Talent CD stays OFF");
            const addedResult = engine.calculate(input);
            assertClose(includedResult.expected, addedResult.expected, "Talent final-snapshot path matches one explicit addition");
        }
        const withOwnTalent = makeRequest(proc, level, profiles[1], scoped([on], proc));
        const withoutOwnTalent = makeRequest(proc, level, profiles[1]);
        const actual = engine.calculate(withOwnTalent);
        const baseline = engine.calculate(withoutOwnTalent);
        assert.notEqual(actual.supported, false);
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], baseline[key], "native Talent cannot alter fixed proc " + key);
        assertClose(actual.breakdown.critDamagePercent, 150, "fixed proc CD ignores native Talent");
        const duplicatePartyRecord = runtime.buildCandidates([record(data, "trace:1309:130904:party-crit-damage")],
            { ...ownContext, traceLevelFor: () => level }, { "robin-talent-crit-active": true, "robin-talent-crit-damage-active": true });
        assert.equal(duplicatePartyRecord.length, 0, "own Talent does not duplicate provider record");
    }
});

test("Robin A4 is a conditional party Follow-Up CRIT DMG bonus and excludes the Concerto additional proc", async () => {
    const { data, engine } = await loadProductionFixture();
    const a4 = data.structuredModifiers.find(item => item.source?.id === "1309" && item.source?.traceId === "1309102"
        && item.providerScope === "party" && item.category === "critDamage");
    assert.ok(a4, "Robin A4 party modifier is present");
    assert.equal(a4.value.fixed, 25, "pinned A4 is 25% Follow-Up CRIT DMG");
    assert.equal(a4.activation.inputKey, "robin-concerto-atk-active", "A4 requires Concerto");
    const context = { characterId: "1302", partyIds: ["1309"], partyEidolons: { "1309": 0 } };
    const off = candidate(data, a4.id, 1, context, {});
    assert.equal(off.enabled, false);
    const on = candidate(data, a4.id, 1, context, { "robin-concerto-atk-active": true });
    assert.equal(on.value, 25);
    const followUp = { id: "independent-fua-scope", type: "followUp", attackType: "followUp", element: "Physical", scalingStat: "atk", canCrit: true, multipliers: [187.5] };
    assert.equal(runtime.applicableToAttack(on, followUp), true);
    expectDamage(engine, makeRequest(followUp, 1, profiles[0], scoped([on], followUp)), 187.5, [{ category: "critDamage", value: 25 }], "Robin A4 party FUA");
    for (const attack of [attackOf(data, "130903"), attackOf(data, "130201"), { type: "ultimate", element: "Physical" }, { type: "dot", element: "Physical" }]) {
        assert.equal(runtime.applicableToAttack(on, attack), false, "A4 excludes non-FUA " + (attack.id || attack.type));
    }
    assert.equal(runtime.buildCandidates([a4], { ...context, partyIds: [] }, { "robin-concerto-atk-active": true }).length, 0,
        "A4 requires the Robin provider");
});
