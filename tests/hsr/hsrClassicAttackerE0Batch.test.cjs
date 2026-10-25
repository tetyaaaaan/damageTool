"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    fixedSourceSha, loadProductionFixture, attackOf, makeRequest,
    runtime, independentDirectDamage, assertClose
} = require("./helpers/hsrDirectVerification.cjs");

// Transcribed from pinned StarRailRes character_skills.json, trees and ranks.
// Retained post-E0 curve entries are intentionally outside this acceptance range.
const normal = [50, 60, 70, 80, 90, 100];
const specs = {
    "110501": { characterId: "1105", element: "Physical", type: "normal", values: normal },
    "100201": { characterId: "1002", element: "Wind", type: "normal", values: normal },
    "100202": { characterId: "1002", element: "Wind", type: "skill", values: [130, 143, 156, 169, 182, 195, 211.25, 227.5, 243.75, 260] },
    "100203": { characterId: "1002", element: "Wind", type: "ultimate", values: [240, 256, 272, 288, 304, 320, 340, 360, 380, 400] },
    "110201": { characterId: "1102", element: "Quantum", variant: "previous", type: "normal", values: normal },
    "110202": { characterId: "1102", element: "Quantum", variant: "previous", type: "skill", values: [110, 121, 132, 143, 154, 165, 178.75, 192.5, 206.25, 220] },
    "110203": { characterId: "1102", element: "Quantum", variant: "previous", type: "ultimate", values: [255, 272, 289, 306, 323, 340, 361.25, 382.5, 403.75, 425] },
    "1110201": { characterId: "1102", element: "Quantum", variant: "enhanced", type: "normal", values: normal },
    "1110202": { characterId: "1102", element: "Quantum", variant: "enhanced", type: "skill", values: [180, 198, 216, 234, 252, 270, 292.5, 315, 337.5, 360] },
    "1110203": { characterId: "1102", element: "Quantum", variant: "enhanced", type: "ultimate", values: [360, 396, 432, 468, 504, 540, 585, 630, 675, 720] }
};
const windPen = [18, 19.8, 21.6, 23.4, 25.2, 27, 29.25, 31.5, 33.75, 36];
const slowedBonus = [72, 76.8, 81.6, 86.4, 91.2, 96, 102, 108, 114, 120];
const amplifiedDamage = [40, 44, 48, 52, 56, 60, 65, 70, 75, 80];
const profiles = [
    { atk: 3274.25, hp: 6417.5, def: 1188.25, baseAtk: 1200.5, baseHp: 1000.25, baseDef: 980.5,
      critRate: 33.5, critDamage: 146.25, damageBonus: 22.4, characterLevel: 80, enemyLevel: 88,
      resistance: 35, defenseReduction: 12, defenseIgnore: 4, resistancePenetration: 5, takenDamage: 8.25, toughnessActive: true },
    { atk: 2401.75, hp: 8526.5, def: 3311.25, baseAtk: 861.25, baseHp: 1564.75, baseDef: 1260.5,
      critRate: 71.25, critDamage: 85.5, damageBonus: 7.75, characterLevel: 80, enemyLevel: 75,
      resistance: 0, defenseReduction: 0, defenseIgnore: 0, resistancePenetration: 0, toughnessActive: false }
];

function native(data, attack, talentLevel, inputs = {}, party = false, attackLevel = talentLevel) {
    const effectiveInputs = { ...inputs, ...(attack.comparisonModifierInputs || {}) };
    return runtime.buildCandidates(data.structuredModifiers, {
        characterId: attack.characterId, eidolon: 0, enhancementState: attack.variant,
        partyIds: party ? ["1309"] : [], partyEidolons: { "1309": 0 },
        traceLevelFor: source => source.id === "1309" ? 10 : source.skillId === "100203" ? attackLevel : talentLevel
    }, effectiveInputs).map(candidate => ({
        ...candidate, applicable: candidate.applicable !== false && runtime.applicableToAttack(candidate, attack)
    }));
}
function expectedBonuses(spec, level, talentLevel, inputs, party = false) {
    let damage = party && inputs["robin-skill-damage-active"] ? 50 : 0;
    let penetration = 0, multiplier = spec.values[level - 1];
    if (spec.characterId === "1002") {
        if (inputs["danheng-talent-active"]) penetration += windPen[talentLevel - 1];
        if (inputs["danheng-enemy-slowed"]) {
            if (spec.type === "normal") damage += 40;
            if (spec.type === "ultimate") multiplier += slowedBonus[level - 1];
        }
    }
    if (spec.characterId === "1102") {
        const amplified = spec.type === "ultimate" || inputs["seele-amplified"];
        if (amplified) {
            damage += amplifiedDamage[talentLevel - 1];
            penetration += spec.variant === "enhanced" ? 25 : 20;
        }
        if (spec.variant === "enhanced") damage += 50 * (inputs["seele-kill-damage-stacks"] || 0);
    }
    return { damage, penetration, multiplier };
}
function verify(engine, attack, spec, level, profile, candidates, bonus, label) {
    const input = makeRequest(attack, level, profile, candidates);
    // Oracle uses literal state-derived amounts, never the resolved production candidates.
    const expected = independentDirectDamage({
        ...input,
        attack: { ...input.attack, scalingStat: "atk", multiplier: bonus.multiplier, canCrit: true },
        modifiers: [
            { category: "damageBonus", value: bonus.damage },
            { category: "resistancePenetration", value: bonus.penetration }
        ]
    });
    const actual = engine.calculate(input);
    assert.notEqual(actual.supported, false, label + " calculates the complete direct action");
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], label + " " + key);
    assertClose(actual.breakdown.referenceValue, profile.atk, label + " completed ATK");
    assertClose(actual.breakdown.damageBonus, profile.damageBonus + bonus.damage, label + " additive DMG bucket");
    assertClose(actual.breakdown.resistance, expected.resistance, label + " native RES PEN bucket");
    assertClose(actual.breakdown.multiplierPercent, bonus.multiplier, label + " entire action multiplier");
    return { input, actual };
}

test("Natasha, Dan Heng and both Seele versions retain literal fixed-source E0 direct curves", async () => {
    assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
    const { data, engine } = await loadProductionFixture();
    for (const [id, spec] of Object.entries(specs)) {
        const attack = attackOf(data, id);
        assert.equal(attack.characterId, spec.characterId, id);
        assert.equal(attack.sourceSkillId, id, id);
        assert.equal(attack.element, spec.element, id);
        assert.equal(attack.type, spec.type, id);
        assert.equal(attack.traceKey, spec.type, id);
        assert.equal(attack.target, "single", id);
        assert.equal(attack.scalingStat, "atk", id);
        assert.equal(attack.hitCount, 1, id + " action aggregate is counted once");
        assert.equal(attack.canCrit, true, id);
        assert.equal(attack.maximumEidolon, 0, id + " excludes all eidolon effects");
        assert.equal(attack.maximumTraceLevel, spec.values.length, id + " E0 trace boundary");
        assert.equal(attack.support?.status, "calculable", id);
        assert.equal(attack.support?.verified, true, id);
        assert.equal(attack.provenance?.sourceCommit, fixedSourceSha, id);
        assert.deepEqual(Array.from(attack.multipliers).slice(0, spec.values.length), spec.values, id);
        if (spec.variant) assert.equal(attack.variant, spec.variant, id);
        for (let level = 1; level <= spec.values.length; level++) for (const profile of profiles) {
            const inputs = { "seele-amplified": false, "seele-kill-damage-stacks": 0 };
            const candidates = native(data, attack, 10, inputs, false, level);
            assert.equal(candidates.some(c => c.source?.kind === "eidolon"), false, id + " native E0 excludes ranks");
            verify(engine, attack, spec, level, profile, candidates, expectedBonuses(spec, level, 10, inputs), id + " Lv" + level);
        }
    }
});

test("Dan Heng Talent and slowed target independently affect the correct buckets at all E0 levels", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const id of ["100201", "100202", "100203"]) {
        const spec = specs[id], attack = attackOf(data, id);
        for (let level = 1; level <= spec.values.length; level++) for (let talentLevel = 1; talentLevel <= 10; talentLevel++) {
            for (const talent of [false, true]) for (const slowed of [false, true]) for (const profile of profiles) {
                const inputs = { "danheng-talent-active": talent, "danheng-enemy-slowed": slowed };
                const candidates = native(data, attack, talentLevel, inputs, false, level);
                const talentCandidate = candidates.find(c => c.id === "trace:1002:100204:wind-penetration");
                const basicBonus = candidates.find(c => c.id === "traceNode:1002:1002103:slowed-basic-damage");
                const ultimateBonus = candidates.find(c => c.id === "trace:1002:100203:slowed-ultimate-multiplier");
                assert.ok(talentCandidate && basicBonus && ultimateBonus, "all native damage states have structured records");
                assert.equal(talentCandidate.enabled, talent);
                assertClose(talentCandidate.value, windPen[talentLevel - 1], "literal Talent RES PEN");
                assert.equal(basicBonus.applicable, slowed && id === "100201", "A6 is applicable only when slowed and targeting Basic");
                assert.equal(ultimateBonus.applicable, slowed && id === "100203", "Ultimate addition is applicable only when slowed and targeting Ultimate");
                assert.equal(runtime.applicableToAttack({ ...basicBonus, enabled: true }, attack), id === "100201", "A6 target scope is independent of toggle state");
                assert.equal(runtime.applicableToAttack({ ...ultimateBonus, enabled: true }, attack), id === "100203", "Ultimate addition target scope is independent of toggle state");
                assert.equal(basicBonus.value, 40, "A6 is additive DMG, separate from Ultimate coefficient");
                verify(engine, attack, spec, level, profile, candidates, expectedBonuses(spec, level, talentLevel, inputs), id + " talentLv" + talentLevel + " traceLv" + level);
            }
        }
    }
});

test("Seele Ultimate forces Amplification locally; both versions keep other actions optional and current kill stacks static", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const [id, spec] of Object.entries(specs).filter(([, spec]) => spec.characterId === "1102")) {
        const attack = attackOf(data, id);
        if (spec.type === "ultimate") assert.equal(attack.comparisonModifierInputs?.["seele-amplified"], true, id + " enters Amplification before damage");
        else assert.notEqual(attack.comparisonModifierInputs?.["seele-amplified"], true, id + " respects current state");
        for (let level = 1; level <= spec.values.length; level++) for (let talentLevel = 1; talentLevel <= 10; talentLevel++) {
            for (const amplified of [false, true]) for (const stacks of (spec.variant === "enhanced" ? [0, 1, 2, 3] : [0])) {
                const inputs = { "seele-amplified": amplified, "seele-kill-damage-stacks": stacks };
                const candidates = native(data, attack, talentLevel, inputs, false, level);
                const amp = candidates.filter(c => c.id.endsWith(":amplified-damage"));
                const penetration = candidates.filter(c => c.id.endsWith(":quantum-res-pen"));
                assert.equal(amp.length, 1, id + " version selects exactly one Talent");
                assert.equal(penetration.length, 1, id + " version selects exactly one A4");
                assert.equal(amp[0].enabled, spec.type === "ultimate" || amplified, id + " current action state");
                assertClose(amp[0].value, amplifiedDamage[talentLevel - 1], "literal Amplification curve");
                for (const profile of profiles) verify(engine, attack, spec, level, profile, candidates,
                    expectedBonuses(spec, level, talentLevel, inputs), id + " traceLv" + level + " talentLv" + talentLevel + " stacks" + stacks);
                assert.equal(inputs["seele-amplified"], amplified, "attack-local forced input never mutates global state");
                assert.equal(inputs["seele-kill-damage-stacks"], stacks, "no kill during this action changes the input snapshot");
            }
        }
    }
});

test("all batch direct actions use completed ATK and ignore isolated HP, DEF and base-stat changes", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const [id, spec] of Object.entries(specs)) {
        const attack = attackOf(data, id), level = spec.values.length;
        const inputs = { "danheng-talent-active": true, "danheng-enemy-slowed": true, "seele-amplified": true, "seele-kill-damage-stacks": 3 };
        const candidates = native(data, attack, 10, inputs, false, level), bonus = expectedBonuses(spec, level, 10, inputs);
        for (const profile of profiles) {
            const baseline = verify(engine, attack, spec, level, profile, candidates, bonus, id + " final-stat baseline");
            for (const stat of ["atk", "hp", "def"]) {
                const changed = { ...profile, [stat]: profile[stat] + 731.25 };
                const result = verify(engine, attack, spec, level, changed, candidates, bonus, id + " isolated " + stat);
                assertClose(result.actual.nonCrit / baseline.actual.nonCrit, stat === "atk" ? changed.atk / profile.atk : 1, id + " isolated " + stat + " ratio");
            }
            const changed = { ...baseline.input, character: { ...baseline.input.character, baseStats: { atk: 9999, hp: 8888, def: 7777 } } };
            assertClose(engine.calculate(changed).nonCrit, baseline.actual.nonCrit, id + " permanent stats are already included");
        }
    }
});

test("native conditions compose once with optional Robin support, which requires the enrolled provider", async () => {
    const { data, engine } = await loadProductionFixture();
    const robin = data.structuredModifiers.find(c => c.id === "trace:1309:130902:party-damage");
    assert.ok(robin);
    for (const [id, spec] of Object.entries(specs)) {
        const attack = attackOf(data, id), level = spec.values.length;
        const inputs = { "danheng-talent-active": true, "danheng-enemy-slowed": true, "seele-amplified": true, "seele-kill-damage-stacks": 3, "robin-skill-damage-active": true };
        const context = { characterId: spec.characterId, eidolon: 0, partyIds: ["1309"], traceLevelFor: () => 10 };
        assert.equal(runtime.buildCandidates([robin], { ...context, partyIds: [] }, inputs).length, 0, id + " absent Robin");
        assert.equal(runtime.buildCandidates([robin], context, { "robin-skill-damage-active": false })[0].enabled, false, id + " optional Robin OFF");
        for (const profile of profiles) verify(engine, attack, spec, level, profile, native(data, attack, 10, inputs, true, level), expectedBonuses(spec, level, 10, inputs, true), id + " native plus Robin");
    }
});

test("active E0 Talent modifiers reject missing, fractional and post-E0 levels instead of silently clamping", async () => {
    const { data } = await loadProductionFixture();
    for (const id of ["trace:1002:100204:wind-penetration", "trace:1102:110204:amplified-damage", "trace:1102:1110204:amplified-damage"]) {
        const record = data.structuredModifiers.find(c => c.id === id);
        assert.ok(record, id);
        for (const level of [undefined, 0, 1.5, 11]) {
            const context = { characterId: record.source.id, eidolon: 0, enhancementState: record.variant, traceLevelFor: () => level };
            const candidate = runtime.buildCandidates([record], context, { "danheng-talent-active": true, "seele-amplified": true })[0];
            assert.ok(candidate.inputWarnings.length > 0, id + " rejects Talent Lv" + level);
            assert.equal(candidate.applicable, false, id + " does not return a partial valid native buff");
        }
    }
});

const arlanSpecs = {
    "100801": { type: "normal", target: "single", values: [50, 60, 70, 80, 90, 100] },
    "100802": { type: "skill", target: "single", values: [120, 132, 144, 156, 168, 180, 195, 210, 225, 240] },
    "100803": { type: "ultimate", target: "blast", values: [192, 204.8, 217.6, 230.4, 243.2, 256, 272, 288, 304, 320], adjacent: [96, 102.4, 108.8, 115.2, 121.6, 128, 136, 144, 152, 160] }
};
const missingHpDamage = [36, 39.6, 43.2, 46.8, 50.4, 54, 58.5, 63, 67.5, 72];
function arlanCheck(data, engine, attack, level, talentLevel, hpPercent, profile, adjacent = false, robin = false) {
    const spec = arlanSpecs[attack.id];
    const effectiveAttack = adjacent ? { ...attack, target: "adjacent" } : attack;
    const candidates = runtime.buildCandidates(data.structuredModifiers, {
        characterId: "1008", eidolon: 0, stats: { ...profile, hpPercent },
        partyIds: robin ? ["1309"] : [], partyEidolons: { "1309": 0 },
        traceLevelFor: source => source.id === "1309" ? 10 : talentLevel
    }, { "robin-skill-damage-active": robin }).map(c => ({
        ...c, applicable: c.applicable !== false && runtime.applicableToAttack(c, effectiveAttack)
    }));
    const talent = candidates.find(c => c.id === "trace:1008:100804:missing-hp-damage");
    assert.ok(talent, "existing Arlan Talent is reused");
    assert.equal(talent.enabled, true, "damage-time HP state supplies native Talent");
    const bonus = missingHpDamage[talentLevel - 1] * (100 - hpPercent) / 100;
    assertClose(talent.value, bonus, "literal missing-HP Talent amount");
    assert.equal(candidates.some(c => c.source?.kind === "eidolon"), false, "Arlan E1/E6 damage and E6 adjacent replacement are absent at E0");
    const input = makeRequest(effectiveAttack, level, profile, candidates);
    input.character.stats.hpPercent = hpPercent;
    if (adjacent) input.attack.multiplier = attack.adjacentMultipliers[level - 1];
    const expected = independentDirectDamage({
        ...input,
        attack: { ...input.attack, scalingStat: "atk", multiplier: (adjacent ? spec.adjacent : spec.values)[level - 1], canCrit: true },
        modifiers: [{ category: "damageBonus", value: bonus + (robin ? 50 : 0) }]
    });
    const actual = engine.calculate(input);
    assert.notEqual(actual.supported, false, "Arlan direct action calculates");
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], attack.id + " " + (adjacent ? "adjacent" : "primary") + " Lv" + level + " TalentLv" + talentLevel + " HP" + hpPercent + " " + key);
    assertClose(actual.breakdown.referenceValue, profile.atk, "Arlan damage references completed ATK");
    assertClose(actual.breakdown.damageBonus, profile.damageBonus + bonus + (robin ? 50 : 0), "missing HP and Robin add once to the DMG bucket");
    return { input, actual };
}

test("Arlan fixed-source E0 curves and continuous missing-HP Talent match all levels and per-target modes", async () => {
    const { data, engine } = await loadProductionFixture();
    const record = data.structuredModifiers.find(c => c.id === "trace:1008:100804:missing-hp-damage");
    assert.equal(record.value.kind, "missingHpScaleByLevel");
    assert.equal(record.value.providerStat, "hpPercent");
    assert.equal(record.source.skillId, "100804");
    assert.deepEqual(Array.from(record.value.values).slice(0, 10), missingHpDamage, "literal pinned Talent parameters");
    for (const [id, spec] of Object.entries(arlanSpecs)) {
        const attack = attackOf(data, id);
        assert.equal(attack.sourceSkillId, id);
        assert.equal(attack.characterId, "1008");
        assert.equal(attack.element, "Thunder");
        assert.equal(attack.type, spec.type);
        assert.equal(attack.target, spec.target);
        assert.equal(attack.scalingStat, "atk");
        assert.equal(attack.hitCount, 1, "aggregate counts each attack once");
        assert.equal(attack.canCrit, true);
        assert.equal(attack.maximumEidolon, 0);
        assert.equal(attack.maximumTraceLevel, spec.values.length);
        assert.equal(attack.support.status, "calculable");
        assert.equal(attack.support.verified, true);
        assert.equal(attack.provenance.sourceCommit, fixedSourceSha);
        assert.deepEqual(Array.from(attack.multipliers).slice(0, spec.values.length), spec.values);
        if (spec.adjacent) assert.deepEqual(Array.from(attack.adjacentMultipliers).slice(0, 10), spec.adjacent);
        for (let level = 1; level <= spec.values.length; level++) for (let talentLevel = 1; talentLevel <= 10; talentLevel++) {
            for (const hpPercent of (spec.type === "skill" ? [85, 50, 0.0166666667] : [100, 85, 50, 0.0166666667])) for (const profile of profiles) {
                const primary = arlanCheck(data, engine, attack, level, talentLevel, hpPercent, profile);
                if (spec.adjacent) {
                    const adjacent = arlanCheck(data, engine, attack, level, talentLevel, hpPercent, profile, true);
                    assertClose(adjacent.actual.nonCrit / primary.actual.nonCrit, 0.5, "E0 adjacent is one half of primary; E6 is excluded");
                }
            }
        }
    }
});

test("Arlan uses final ATK with isolated HP/DEF changes and composes current Talent with Robin exactly once", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const [id, spec] of Object.entries(arlanSpecs)) for (const profile of profiles) {
        const attack = attackOf(data, id), level = spec.values.length;
        for (const adjacent of (spec.adjacent ? [false, true] : [false])) {
            const baseline = arlanCheck(data, engine, attack, level, 10, 50, profile, adjacent);
            for (const stat of ["atk", "hp", "def"]) {
                const changed = { ...profile, [stat]: profile[stat] + 917.5 };
                const result = arlanCheck(data, engine, attack, level, 10, 50, changed, adjacent);
                assertClose(result.actual.nonCrit / baseline.actual.nonCrit, stat === "atk" ? changed.atk / profile.atk : 1, "isolated " + stat + " with unchanged HP percentage");
            }
            const changedBase = { ...baseline.input, character: { ...baseline.input.character, baseStats: { atk: 9999, hp: 8888, def: 7777 } } };
            assertClose(engine.calculate(changedBase).nonCrit, baseline.actual.nonCrit, "Arlan permanent stats already belong to final inputs");
            arlanCheck(data, engine, attack, level, 10, 50, profile, adjacent, true);
        }
    }
    const robin = data.structuredModifiers.find(c => c.id === "trace:1309:130902:party-damage");
    assert.equal(runtime.buildCandidates([robin], { characterId: "1008", partyIds: [], traceLevelFor: () => 10 }, { "robin-skill-damage-active": true }).length, 0);
    assert.equal(runtime.buildCandidates([robin], { characterId: "1008", partyIds: ["1309"], traceLevelFor: () => 10 }, { "robin-skill-damage-active": false })[0].enabled, false);
});

test("Arlan Skill consumes HP before the supplied damage snapshot once and preserves a living HP boundary", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const id of Object.keys(arlanSpecs)) {
        const attack = attackOf(data, id);
        assert.equal(attack.hpPercentMinimumExclusive, 0, "zero HP cannot perform an attack");
        assert.equal(attack.requiresLivingHpSnapshot, true, "the app must verify at least one remaining HP against final maximum HP");
        if (id === "100802") assert.equal(attack.hpPercentMaximum, 85, "Skill damage uses the already consumed HP state");
    }
    const profile = { atk: 3000, hp: 6000, def: 1137.25, baseAtk: 1000, baseHp: 1000, baseDef: 1000,
        critRate: 50, critDamage: 100, damageBonus: 0, characterLevel: 80, enemyLevel: 80,
        resistance: 20, toughnessActive: true };
    const attack = attackOf(data, "100802");
    const result = arlanCheck(data, engine, attack, 10, 10, 85, profile);
    assertClose(result.actual.nonCrit, 2871.936, "Skill at already consumed HP85% noncrit golden");
    assertClose(result.actual.crit, 5743.872, "Skill at already consumed HP85% crit golden");
    assertClose(result.actual.expected, 4307.904, "Skill at already consumed HP85% EV golden");
    assert.equal(result.input.character.stats.hp, 6000, "max HP is never consumed as a scaling stat");
    assert.equal(result.input.character.stats.hpPercent, 85, "no second 15% consumption modifies the supplied snapshot");
    const oneHp = arlanCheck(data, engine, attack, 10, 10, 100 / profile.hp, profile);
    assertClose(oneHp.input.character.stats.hp * oneHp.input.character.stats.hpPercent / 100, 1, "low starting HP stops at one HP");
    assert.ok(oneHp.actual.nonCrit > result.actual.nonCrit, "near-zero living HP increases current Talent without adding E1");
});
