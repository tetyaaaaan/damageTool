"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");
const {
    createScenarioHarness,
    prepareScenarioInputs
} = require("./helpers/calcScenarioHarness.cjs");

function directContext(characterId, stats = {}) {
    const values = {
        hp: 20000,
        atk: 2000,
        baseAtk: 1000,
        def: 1000,
        baseDef: 1000,
        elementalMastery: 100,
        energyRecharge: 100,
        elementDamageBonus: 0,
        ...stats
    };
    return {
        characterId,
        constellation: 0,
        weaponId: "",
        refinement: 1,
        artifactSetMode: "",
        artifactSetIds: [],
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        stats: values,
        effectiveStats: values,
        enemy: { resistanceDebuff: 0, defenseDebuff: 0, defenseIgnore: 0 },
        manualInputs: { recordedHealing: null, providerStats: {}, resourceStates: {} },
        uiState: {
            stackByModifier: {},
            conditionByModifier: {},
            toggleByModifier: {},
            complexConditionByModifier: {}
        },
        mode: "manualMode"
    };
}

function analyzeWithOption(sandbox, modifier, source, context, option) {
    const analysis = sandbox.GenshinModifierAnalyzer.analyzeModifier({
        modifier,
        source,
        context
    });
    context.uiState.conditionByModifier[analysis.conditionStateKey] = {
        enabled: option === "active",
        option
    };
    return {
        analysis,
        value: sandbox.GenshinCalcEngine.resolveModifierValue(
            modifier,
            context,
            context.uiState,
            analysis
        )
    };
}

test("Luna III Venti Witch's Eve Rite keeps locked/inactive zero and applies only all damage at 50%", () => {
    const calcData = loadCalcData();
    const talent = calcData.characterTalents["10000022"]?.passives
        ?.find((item) => item.sourceId === "lockedPassive");
    assert.ok(talent, "Venti lockedPassive source must be materialized");
    assert.match(talent.descriptionJa, /魔女の課題/);
    assert.match(talent.descriptionJa, /50%/);
    assert.match(talent.descriptionJa, /4秒/);

    const modifier = calcData.talentModifiers["10000022"]?.passives
        ?.find((item) => item.sourceId === "lockedPassive")?.modifiers
        ?.find((item) => item.id === "t_10000022_lockedPassive_stormeye_swirl_damage");
    assert.ok(modifier, "Venti Stormeye/Swirl modifier must be materialized");
    assert.equal(modifier.category, "damageBonus");
    assert.deepEqual(modifier.applyTo, ["allDamageBonus"]);
    assert.equal(modifier.targetOwner, "activeCharacter");
    assert.equal(modifier.duration, 4);
    assert.deepEqual(modifier.valueByCondition, { locked: 0, unlocked: 0, active: 50 });

    const harness = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcEngine.js"
    ]);
    const context = directContext("10000022");
    assert.equal(analyzeWithOption(
        harness.sandbox,
        modifier,
        "talent:lockedPassive",
        context,
        "locked"
    ).value, 0);
    assert.equal(analyzeWithOption(
        harness.sandbox,
        modifier,
        "talent:lockedPassive",
        context,
        "unlocked"
    ).value, 0);
    const active = analyzeWithOption(
        harness.sandbox,
        modifier,
        "talent:lockedPassive",
        context,
        "active"
    );
    assert.equal(active.value, 50);

    const attackTypes = ["normalAttack", "chargedAttack", "plungingAttack", "skill", "burst"];
    for (const attackType of attackTypes) {
        const result = harness.sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(
            { id: `${attackType}-hit`, attackType, damageType: attackType, element: "炎", scalings: [] },
            context,
            { applied: [{ modifier, analysis: active.analysis, source: "talent:lockedPassive", value: 50 }], candidates: [] }
        );
        assert.equal(result.totals.damageBonus, 50, `${attackType} must receive the all-damage bonus`);
    }
});

test("Luna III Albedo Solar Isotoma scales party damage from provider DEF and caps at 12%", () => {
    const calcData = loadCalcData();
    const talent = calcData.characterTalents["10000038"]?.passives
        ?.find((item) => item.sourceId === "lockedPassive");
    assert.ok(talent, "Albedo lockedPassive source must be materialized");
    assert.match(talent.descriptionJa, /4%/);
    assert.match(talent.descriptionJa, /12%/);
    assert.match(talent.descriptionJa, /20秒/);

    const modifier = calcData.talentModifiers["10000038"]?.passives
        ?.find((item) => item.sourceId === "lockedPassive")?.modifiers
        ?.find((item) => item.id === "t_10000038_lockedPassive_solar_isotoma_damage");
    assert.ok(modifier, "Albedo Solar Isotoma modifier must be materialized");
    assert.equal(modifier.category, "scalingBonus");
    assert.deepEqual(modifier.applyTo, [
        "normalAttackDamageBonus",
        "chargedAttackDamageBonus",
        "plungingAttackDamageBonus",
        "skillDamageBonus",
        "burstDamageBonus"
    ]);
    assert.equal(modifier.targetOwner, "team");
    assert.deepEqual(modifier.reference, { stat: "def", source: "self" });
    assert.equal(modifier.divisor, 1000);
    assert.equal(modifier.ratio, 4);
    assert.equal(modifier.maxValue, 12);
    assert.equal(modifier.duration, 20);
    assert.equal(modifier.conditionOptionValue, "active");

    const { sandbox, elements } = createScenarioHarness();
    prepareScenarioInputs(elements, {
        characterId: "10000037",
        stats: { atk: 1000, baseAtk: 500, def: 250 }
    });
    const request = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    request.party = {
        schemaVersion: 1,
        focusSlot: 1,
        members: [
            { slot: 1, role: "main", enabled: true, characterId: "10000037" },
            {
                slot: 2,
                role: "support",
                enabled: true,
                characterId: "10000038",
                constellation: 0,
                stats: { def: 0 },
                talentLevels: { normal: 10, skill: 10, burst: 10 },
                buffStates: {}
            }
        ]
    };

    const locked = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const candidate = locked.partyModifiers.find((item) => item.modifier.id === "t_10000038_lockedPassive_solar_isotoma_damage");
    assert.ok(candidate);
    assert.notEqual(candidate.status, "ready");

    request.party.members[1].stats.def = 1000;
    request.party.members[1].buffStates[candidate.toggleKey] = true;

    for (const option of ["locked", "unlocked"]) {
        request.party.conditionStates = { [candidate.analysis.conditionStateKey]: { option } };
        const inactive = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
        const inactiveCandidate = inactive.partyModifiers.find((item) => item.modifier.id === candidate.modifier.id);
        assert.equal(inactiveCandidate.status, "off", `${option} Albedo state must stay off`);
        assert.equal(inactiveCandidate.enabled, false, `${option} Albedo state must not enable the party candidate`);
        assert.equal(inactive.results.some((result) => result.breakdown.appliedModifiers
            .some((item) => item.modifier?.id === candidate.modifier.id)), false,
        `${option} Albedo state must not reach direct damage`);
    }

    request.party.conditionStates = { [candidate.analysis.conditionStateKey]: { option: "active" } };
    const at1000 = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const active1000 = at1000.partyModifiers.find((item) => item.modifier.id === candidate.modifier.id);
    assert.equal(active1000.status, "ready");
    assert.equal(active1000.enabled, true);
    assert.equal(active1000.resolvedValue, 4);
    assert.equal(at1000.context.stats.def, 250);
    assert.equal(active1000.providerContext.stats.def, 1000);
    assert.equal(active1000.providerContext.manualInputs.providerStats.def, 1000);

    request.party.members[1].stats.def = 5000;
    const aboveCap = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const activeAboveCap = aboveCap.partyModifiers.find((item) => item.modifier.id === candidate.modifier.id);
    assert.equal(activeAboveCap.status, "ready");
    assert.equal(activeAboveCap.resolvedValue, 12);
    assert.equal(activeAboveCap.providerContext.manualInputs.providerStats.def, 5000);
    assert.deepEqual(activeAboveCap.modifier.applyTo, modifier.applyTo);
});

test("Luna III Razor Burst enhancement uses ATK only for Wolf Within damage and does not require Secret Rite", () => {
    const calcData = loadCalcData();
    const talent = calcData.characterTalents["10000020"]?.passives
        ?.find((item) => item.sourceId === "lockedPassive");
    assert.ok(talent, "Razor lockedPassive source must be materialized");
    assert.match(talent.descriptionJa, /70%/);
    assert.match(talent.descriptionJa, /元素爆発/);

    const modifier = calcData.talentModifiers["10000020"]?.passives
        ?.find((item) => item.sourceId === "lockedPassive")?.modifiers
        ?.find((item) => item.id === "t_10000020_lockedPassive_wolf_within_burst_atk");
    assert.ok(modifier, "Razor Wolf Within Burst modifier must be materialized");
    assert.equal(modifier.category, "scalingBonus");
    assert.equal(modifier.customCalculation, "scalingAdditiveBaseDamage");
    assert.deepEqual(modifier.applyTo, ["damage"]);
    assert.deepEqual(modifier.targetGroups, ["burst"]);
    assert.deepEqual(modifier.reference, { stat: "atk", source: "self" });
    assert.equal(modifier.ratio, 70);
    assert.equal(modifier.conditionOptionValue, "unlocked");
    assert.equal(modifier.conditionInput.options[0].value, "locked");
    assert.equal(modifier.conditionInput.options[1].value, "unlocked");
    assert.equal(modifier.conditionInput.options.length, 2);

    const harness = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]);
    for (const atk of [0, 1000]) {
        const context = directContext("10000020", { atk });
        const analysis = harness.sandbox.GenshinModifierAnalyzer.analyzeModifier({
            modifier,
            source: "talent:lockedPassive",
            context
        });
        assert.equal(analysis.calculation, "scalingAdditiveBaseDamage");
        context.uiState.conditionByModifier[analysis.conditionStateKey] = { enabled: true, option: "unlocked" };
        const result = harness.sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(
            { id: "damage", group: "burst", attackType: "burst", damageType: "burst", element: "electro", scalings: [] },
            context,
            { applied: [{ modifier, analysis, source: "talent:lockedPassive", valueContext: context }], candidates: [] }
        );
        assert.equal(result.totals.additiveBaseDamage, atk * 0.7);
        const normal = harness.sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(
            { id: "normal-hit", group: "normalAttack", attackType: "normalAttack", damageType: "normalAttack", element: "physical", scalings: [] },
            context,
            { applied: [{ modifier, analysis, source: "talent:lockedPassive", valueContext: context }], candidates: [] }
        );
        assert.equal(normal.totals.additiveBaseDamage, 0);
    }

    for (const [option, expectedWolfDamage] of [["locked", 0], ["unlocked", 700]]) {
        const context = directContext("10000020", { atk: 1000 });
        const analysis = harness.sandbox.GenshinModifierAnalyzer.analyzeModifier({
            modifier,
            source: "talent:lockedPassive",
            context
        });
        context.uiState.conditionByModifier[analysis.conditionStateKey] = { enabled: true, option };
        context.uiState.complexConditionByModifier[analysis.conditionStateKey] = { option };
        const payload = harness.sandbox.GenshinCalcEngine.calculateDamageRequest(context, calcData);
        const wolfWithin = payload.results.find((result) => result.entry.id === "damage");
        const initialBurst = payload.results.find((result) => result.entry.id === "burstdamage");
        assert.ok(wolfWithin, "Razor Wolf Within damage entry must be calculated");
        assert.ok(initialBurst, "Razor initial burst entry must be calculated");
        assert.equal(wolfWithin.breakdown.additiveBaseDamage, expectedWolfDamage, `${option} must resolve only the expected Wolf Within bonus`);
        assert.equal(initialBurst.breakdown.additiveBaseDamage, 0, `${option} must not leak into initial burst damage`);
    }
});
