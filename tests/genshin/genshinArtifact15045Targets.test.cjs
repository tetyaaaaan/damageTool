"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createBrowserScriptHarness, loadCalcData } = require("./helpers/browserScriptHarness.cjs");

const FIRST_ID = "4pc_team_own_element_damage_bonus_after_skill";
const SECOND_ID = "4pc_team_own_and_active_element_damage_bonus_magical_secret_rite";

function harness() {
    const sandbox = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinPartyModifiers.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
    return { sandbox, calcData: loadCalcData() };
}

function context() {
    return {
        characterId: "10000016",
        characterElement: "炎",
        activeCharacterElement: "炎",
        weaponId: "",
        refinement: 1,
        artifactSetMode: "none",
        artifactSetIds: [],
        constellation: 0,
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        stats: {
            hp: 20000,
            baseHp: 10000,
            atk: 2000,
            baseAtk: 1000,
            def: 1000,
            baseDef: 500,
            elementalMastery: 100,
            energyRecharge: 100,
            critRate: 50,
            critDamage: 100,
            elementDamageBonus: 0
        },
        enemy: {
            resistanceDebuff: 0,
            defenseDebuff: 0,
            defenseIgnore: 0,
            resistance: {
                base: { defaultElemental: 10, physical: 10, byElement: {} },
                manualDebuff: { allElemental: 0, physical: 0, byElement: {} }
            },
            immunities: []
        },
        manualInputs: { recordedHealing: null, providerStats: {}, resourceStates: {} },
        uiState: {
            stackByModifier: {},
            resolvedConditionByModifier: {},
            resolvedConditionByGroup: {},
            conditionByModifier: {},
            complexConditionByModifier: {},
            toggleByModifier: {}
        },
        party: {
            members: [
                { slot: 1, role: "main", enabled: true, characterId: "10000016", element: "炎" },
                {
                    slot: 2,
                    role: "support",
                    enabled: true,
                    characterId: "10000014",
                    nameJa: "水元素装備者fixture",
                    element: "水",
                    constellation: 0,
                    talentLevels: { normal: 10, skill: 10, burst: 10 },
                    buffStates: {},
                    equipment: { artifactSetMode: "4pc", artifactSetIds: ["15045"] }
                }
            ]
        },
        mode: "manualMode"
    };
}

function artifactCandidates(sandbox, calcData, calcContext) {
    return sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext)
        .partyCandidates
        .filter((candidate) => [FIRST_ID, SECOND_ID].includes(candidate.modifier.id));
}

function armState(calcContext, candidates, option) {
    assert.equal(candidates.length, 2);
    const stateKey = candidates[0].analysis.conditionStateKey;
    assert.equal(new Set(candidates.map((candidate) => candidate.analysis.conditionStateKey)).size, 1);
    assert.equal(new Set(candidates.map((candidate) => candidate.toggleKey)).size, 1);
    calcContext.uiState.conditionByModifier[stateKey] = { enabled: true, option };
    calcContext.uiState.complexConditionByModifier[stateKey] = { enabled: true, option };
    calcContext.party.members[1].buffStates[candidates[0].toggleKey] = true;
}

function damageBonus(sandbox, calcData, calcContext, element) {
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
    const entry = {
        id: `15045-fixture-${element}`,
        attackType: "skill",
        damageType: "skill",
        element,
        scalings: []
    };
    const result = sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(entry, calcContext, collected);
    return {
        value: result.totals.damageBonus,
        appliedIds: result.applied.map((item) => item.modifier.id)
    };
}

test("15045 four-piece effects fail closed without a trigger/state", () => {
    const { sandbox, calcData } = harness();
    const calcContext = context();
    const candidates = artifactCandidates(sandbox, calcData, calcContext);

    assert.deepEqual(Array.from(candidates, (candidate) => candidate.modifier.id).sort(), [FIRST_ID, SECOND_ID].sort());
    for (const element of ["水", "炎", "雷"]) {
        const result = damageBonus(sandbox, calcData, calcContext, element);
        assert.equal(result.value, 0, `${element} must remain unbuffed without an explicit trigger`);
        assert.equal(result.appliedIds.some((id) => [FIRST_ID, SECOND_ID].includes(id)), false);
    }

    armState(calcContext, candidates, "unknown");
    for (const element of ["水", "炎", "雷"]) {
        assert.equal(damageBonus(sandbox, calcData, calcContext, element).value, 0, `${element} must reject an unknown trigger`);
    }
});

test("15045 guidance buffs only the holder's own element", () => {
    const { sandbox, calcData } = harness();
    const calcContext = context();
    const candidates = artifactCandidates(sandbox, calcData, calcContext);
    armState(calcContext, candidates, "guidance");

    const first = candidates.find((candidate) => candidate.modifier.id === FIRST_ID);
    assert.equal(first.modifier.partyProviderElement, "水");
    assert.equal(first.modifier.artifactHolderElement, "hydro");
    assert.equal(first.modifier.artifactActiveCharacterElement, "pyro");

    assert.equal(damageBonus(sandbox, calcData, calcContext, "水").value, 20);
    assert.equal(damageBonus(sandbox, calcData, calcContext, "炎").value, 0);
    assert.equal(damageBonus(sandbox, calcData, calcContext, "雷").value, 0);
});

test("15045 magical secret rite buffs the holder and active elements only", () => {
    const { sandbox, calcData } = harness();
    const calcContext = context();
    const candidates = artifactCandidates(sandbox, calcData, calcContext);
    armState(calcContext, candidates, "ode");

    const second = candidates.find((candidate) => candidate.modifier.id === SECOND_ID);
    assert.equal(second.modifier.partyProviderElement, "水");
    assert.equal(second.modifier.artifactHolderElement, "hydro");
    assert.equal(second.modifier.artifactActiveCharacterElement, "pyro");

    assert.equal(damageBonus(sandbox, calcData, calcContext, "水").value, 40);
    assert.equal(damageBonus(sandbox, calcData, calcContext, "炎").value, 40);
    assert.equal(damageBonus(sandbox, calcData, calcContext, "雷").value, 0);
});
