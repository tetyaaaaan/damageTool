"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const runtime = require("../../games/js/hsrModifierRuntime.js");
const {
    fixedSourceSha,
    loadProductionFixture,
    attackOf,
    makeRequest,
    assertClose,
    assertMatchesIndependent,
    independentDirectDamage
} = require("./helpers/hsrDirectVerification.cjs");

// Fixed-SHA Japanese character_skills.json coefficients, intentionally kept
// separate from the production override used by the loader.
const basics = {
    "121801": {
        characterId: "1218",
        name: "心火計",
        multipliers: [50, 60, 70, 80, 90, 100],
        traceKey: "normal"
    },
    "122201": {
        characterId: "1222",
        name: "供香",
        multipliers: [50, 60, 70, 80, 90, 100],
        traceKey: "normal"
    }
};

const profiles = [
    {
        characterLevel: 80,
        eidolon: 0,
        atk: 3587.25,
        hp: 7421.5,
        def: 1198.75,
        baseAtk: 991.5,
        baseHp: 1400.25,
        baseDef: 1100.75,
        critRate: 37.5,
        critDamage: 121.75,
        damageBonus: 27.75,
        enemyCount: 1,
        enemyLevel: 83,
        resistance: 25,
        resistancePenetration: 6.25,
        defenseReduction: 12.5,
        defenseIgnore: 7.5,
        takenDamage: 11.5,
        toughnessActive: true,
        weakness: false
    },
    {
        characterLevel: 80,
        eidolon: 0,
        atk: 2411.75,
        hp: 5809.25,
        def: 3517.125,
        baseAtk: 1173.25,
        baseHp: 903.5,
        baseDef: 1288.75,
        critRate: 62.25,
        critDamage: 73.5,
        damageBonus: 41.3,
        enemyCount: 1,
        enemyLevel: 75,
        resistance: 0,
        resistancePenetration: 0,
        defenseReduction: 0,
        defenseIgnore: 0,
        takenDamage: 0,
        toughnessActive: true,
        weakness: false
    }
];

const basicFiveRoast = "trace:1218:121804:basic-five-roast";
const fiveRoastByTalent = [17.5, 19.25, 21, 22.75, 24.5, 26.25, 28.44, 30.625, 32.815, 35];

function modifierRecord(data, id) {
    const record = data.structuredModifiers.find((item) => item.id === id);
    assert.ok(record, "production loader must include modifier " + id);
    return record;
}

function makeTraceContext(characterId, traceLevels = {}) {
    return {
        characterId,
        eidolon: 0,
        traceLevelFor: (source) => traceLevels[source.skillId] ?? 10
    };
}

function selectedCandidate(record, context, inputs, attack) {
    const candidates = runtime.buildCandidates([record], context, inputs);
    assert.equal(candidates.length, 1, record.id + " is selected from the production modifier definition");
    const candidate = candidates[0];
    return {
        ...candidate,
        applicable: candidate.applicable && runtime.applicableToAttack(candidate, {
            ...attack,
            attackType: attack.type
        })
    };
}

test("Jiaoqiu and Lingsha E0 Basic records match fixed-source single-target ATK curves", async () => {
    assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
    const { data, engine } = await loadProductionFixture();

    for (const [id, spec] of Object.entries(basics)) {
        const attack = attackOf(data, id);
        assert.equal(attack.support?.status, "calculable", id + " is promoted through the production loader");
        assert.equal(attack.support?.verified, true, id + " records independent verification");
        assert.equal(attack.characterId, spec.characterId, id + " owner");
        assert.ok(attack.name.startsWith(spec.name), id + " fixed-source name and scope label");
        assert.equal(attack.type, "normal", id + " attack type");
        assert.equal(attack.traceKey, spec.traceKey, id + " trace selector");
        assert.equal(attack.element, "Fire", id + " element");
        assert.equal(attack.target, "single", id + " target");
        assert.equal(attack.scalingStat, "atk", id + " reference stat");
        assert.equal(attack.hitCount, 1, id + " is one direct hit");
        assert.equal(attack.canCrit, true, id + " can crit");
        assert.equal(attack.damageFormula, "statMultiplier", id + " uses the existing direct formula");
        assert.equal(attack.maximumEidolon, 0, id + " is E0 scoped");
        assert.equal(attack.maximumTraceLevel, 6, id + " only exposes the E0 Basic range");
        assert.equal(attack.enemyCountExact, 1, id + " is limited to one enemy");
        assert.deepEqual(Array.from(attack.multipliers).slice(0, 6), spec.multipliers, id + " fixed-source E0 Lv1-6 coefficients");
        assert.equal(attack.provenance?.sourceCommit, fixedSourceSha, id + " pinned source SHA");
        assert.match(attack.provenance?.sourceFile || "", new RegExp("character_skills\\.json:" + id));
        assert.equal(engine.unsupportedAttackReason(attack), "", id + " is accepted by the existing direct-damage engine");

        for (const [profileIndex, profile] of profiles.entries()) {
            for (let level = 1; level <= 6; level++) {
                const input = makeRequest(attack, level, profile);
                input.attack = { ...input.attack, traceLevel: level, multiplier: spec.multipliers[level - 1], hitCount: 1 };
                const result = assertMatchesIndependent(engine, input, id + " E0 Lv" + level + " profile " + profileIndex);
                assertClose(result.breakdown.referenceValue, profile.atk, id + " uses final ATK at Lv" + level);
                assert.equal(result.attack.hitCount, 1, id + " does not count unrelated actions");
            }
        }
    }
});

test("Jiaoqiu Basic scales only with ATK and the five-Roast value independently follows every Talent level", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "121801");
    const roast = modifierRecord(data, basicFiveRoast);

    assert.equal(roast.source?.kind, "trace");
    assert.equal(roast.source?.id, "1218");
    assert.equal(roast.source?.skillId, "121804");
    assert.equal(roast.category, "takenDamage");
    assert.equal(roast.value?.kind, "byLevel");
    assert.equal(roast.stacking?.group, "jiaoqiu-ashen-roast-vulnerability");
    assert.equal(roast.stacking?.rule, "nonStacking");
    assert.deepEqual(roast.target?.attackIds, ["121801"]);
    assert.deepEqual(roast.target?.attackTypes, ["normal"]);

    const profile = profiles[0];
    const level = 6;
    const baseInput = makeRequest(attack, level, profile);
    baseInput.attack = { ...baseInput.attack, traceLevel: level, multiplier: 100, hitCount: 1 };
    const base = assertMatchesIndependent(engine, baseInput, "Jiaoqiu Basic without pre-existing Roast");

    for (let talentLevel = 1; talentLevel <= 10; talentLevel++) {
        const context = makeTraceContext("1218", { "121804": talentLevel });
        const effect = selectedCandidate(roast, context, {}, attack);
        assert.equal(effect.enabled, true, "five-stack Roast is an always-on intrinsic state for this limited comparison");
        assert.equal(effect.applicable, true, "the new self modifier targets Jiaoqiu Normal only");
        assertClose(effect.value, fiveRoastByTalent[talentLevel - 1], "fixed-source five-Roast taken damage at Talent Lv" + talentLevel);

        const input = {
            ...baseInput,
            modifiers: [effect]
        };
        const result = assertMatchesIndependent(engine, input, "Jiaoqiu Basic with five-Roast Talent Lv" + talentLevel);
        assertClose(result.breakdown.takenDamage, profile.takenDamage + fiveRoastByTalent[talentLevel - 1], "existing enemy vulnerability plus five-Roast at Talent Lv" + talentLevel);
        assert.equal(result.applied.filter((item) => item.stacking?.group === "jiaoqiu-ashen-roast-vulnerability").length, 1, "only one Ashen Roast vulnerability contributes");
        assertClose(result.nonCrit / base.nonCrit, (100 + profile.takenDamage + fiveRoastByTalent[talentLevel - 1]) / (100 + profile.takenDamage), "only the vulnerability multiplier changes");

        // A duplicate representation of the same enemy state must not double
        // the vulnerability even if two UI paths supply the shared effect.
        const duplicate = { ...effect, id: effect.id + ":duplicate" };
        const duplicateResult = engine.calculate({ ...input, modifiers: [effect, duplicate] });
        assertClose(duplicateResult.nonCrit, result.nonCrit, "same-group duplicate is not double-counted at Talent Lv" + talentLevel);
        assert.equal(duplicateResult.applied.filter((item) => item.stacking?.group === "jiaoqiu-ashen-roast-vulnerability").length, 1, "nonStacking group leaves one applied instance");
    }

    for (const stat of ["atk", "hp", "def"]) {
        const changed = {
            ...baseInput,
            character: {
                ...baseInput.character,
                stats: { ...baseInput.character.stats, [stat]: baseInput.character.stats[stat] + 317.25 }
            }
        };
        const result = engine.calculate(changed);
        if (stat === "atk") {
            assertClose(result.nonCrit / base.nonCrit, (profile.atk + 317.25) / profile.atk, "Jiaoqiu Basic uses ATK");
        } else {
            assertClose(result.nonCrit, base.nonCrit, "Jiaoqiu Basic ignores " + stat);
        }
    }
});

test("Lingsha Basic uses ATK only and does not inherit Befog's Break-only vulnerability", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "122201");
    const befog = modifierRecord(data, "trace:1222:122203:break-vulnerability");
    const context = makeTraceContext("1222", { "122203": 10 });
    const activeBefog = selectedCandidate(befog, context, { "break-befog-active": true }, attack);
    assert.equal(activeBefog.enabled, true, "Befog can be selected as a battle condition");
    assert.equal(activeBefog.applicable, false, "Befog is not applicable to ordinary Basic damage");
    assert.deepEqual(befog.target?.attackTypes, ["break", "superBreak"]);

    const profile = profiles[1];
    const attackLevel = 6;
    const input = makeRequest(attack, attackLevel, profile);
    input.attack = { ...input.attack, traceLevel: attackLevel, multiplier: 100, hitCount: 1 };
    const noBefog = assertMatchesIndependent(engine, input, "Lingsha Basic without Befog");
    const withBefog = engine.calculate({ ...input, modifiers: [activeBefog] });
    assert.notEqual(withBefog.supported, false);
    assertClose(withBefog.nonCrit, noBefog.nonCrit, "Befog does not affect Lingsha's normal direct hit");
    assertClose(withBefog.crit, noBefog.crit, "Befog does not affect Lingsha Basic critical damage");
    assertClose(withBefog.expected, noBefog.expected, "Befog does not affect Lingsha Basic expected damage");
    assert.equal(withBefog.applied.some((item) => item.id === befog.id), false, "Break-only vulnerability is excluded from Normal");
    assert.equal(withBefog.skipped.some((item) => item.id === befog.id), true, "exclusion remains visible in the calculation result");

    const base = engine.calculate(input);
    for (const stat of ["atk", "hp", "def"]) {
        const changed = {
            ...input,
            character: {
                ...input.character,
                stats: { ...input.character.stats, [stat]: input.character.stats[stat] + 317.25 }
            }
        };
        const result = engine.calculate(changed);
        if (stat === "atk") {
            assertClose(result.nonCrit / base.nonCrit, (profile.atk + 317.25) / profile.atk, "Lingsha Basic uses ATK");
        } else {
            assertClose(result.nonCrit, base.nonCrit, "Lingsha Basic ignores " + stat);
        }
    }
});


test("engine honors an attack-specific Roast target even when called without the UI filter", async()=>{
 const {data,engine}=await loadProductionFixture();const a=attackOf(data,"121801");
 const record=modifierRecord(data,basicFiveRoast);const raw=runtime.buildCandidates([record],makeTraceContext("1218",{"121804":10}),{})[0];
 const input=makeRequest(a,6,{atk:3000});const other={...input,attack:{...input.attack,id:"other-normal"}};
 assertClose(engine.calculate({...other,modifiers:[raw]}).nonCrit,engine.calculate(other).nonCrit,"same type and element but different attack ID");
 const superInput={character:{level:80,stats:{breakEffect:200}},enemy:{level:80,resistance:0,toughnessActive:false},attack:{type:"normal",element:"Fire",toughnessDamage:10},breakBaseDamage:{80:3767.5533}};
 assertClose(engine.calculateSuperBreak({...superInput,modifiers:[raw]}).value,engine.calculateSuperBreak(superInput).value,"unrelated Super Break does not inherit assumed Roast");
});
