const test = require("node:test");
const assert = require("node:assert/strict");
const {
    createBrowserScriptHarness,
    loadCalcData,
    setElement
} = require("./helpers/browserScriptHarness.cjs");
const { prepareScenarioInputs } = require("./helpers/calcScenarioHarness.cjs");

const PARTY_CHARACTER = "10000037";
const PARTY_ARTIFACT = "15042";
const PARTY_MODIFIER = "4pc_team_elemental_mastery_moon_omen";

function setSupport(elements, characterId = PARTY_CHARACTER) {
    const values = {
        Character: characterId,
        Weapon: "",
        ArtifactMode: "4pc",
        ArtifactOne: PARTY_ARTIFACT,
        ArtifactTwo: "",
        Level: 90,
        Constellation: 0,
        WeaponLevel: 90,
        Refinement: 1,
        NormalTalent: 10,
        SkillTalent: 10,
        BurstTalent: 10,
        Hp: "",
        Atk: "",
        Def: "",
        ElementalMastery: ""
    };
    Object.entries(values).forEach(([name, value]) => {
        setElement(elements, `genshinParty${name}2`, value);
        elements[`genshinParty${name}2`].dataset = {};
    });
}

function createHarness({ renderer = false } = {}) {
    const elements = {};
    const scripts = [
        "games/js/genshinInputProvenance.js",
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinPartyState.js",
        "games/js/genshinElementalResonance.js",
        "games/js/genshinPartyModifiers.js",
        "games/js/genshinCalcEngine.js"
    ];
    if (renderer) scripts.push("games/js/genshinCalcRenderer.js");
    const harness = createBrowserScriptHarness(scripts, elements);
    const calcData = loadCalcData();
    prepareScenarioInputs(elements, {
        characterId: "10000002",
        stats: { elementalMastery: 100 }
    });
    setSupport(elements);
    return { ...harness, calcData };
}

function partyModifier(payload) {
    return payload.partyModifiers.find((candidate) => candidate.modifier?.id === PARTY_MODIFIER);
}

function partyKey(characterId = PARTY_CHARACTER) {
    return `party:2:${characterId}:artifact:4:${PARTY_ARTIFACT}:${PARTY_MODIFIER}`;
}

test("normal calculation request retains the party option and applies 120 EM exactly once", () => {
    const { sandbox, elements, calcData } = createHarness();
    const key = partyKey();
    assert.equal(sandbox.GenshinPartyState.setPartyConditionState(key, "option", "ascendantGleam"), true);
    sandbox.GenshinPartyState.setBuffEnabled(key, true);

    const request = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    assert.deepEqual(JSON.parse(JSON.stringify(request.party.conditionStates[key])), { option: "ascendantGleam" });
    const payload = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const candidate = partyModifier(payload);
    assert.equal(candidate.status, "ready");
    assert.equal(candidate.enabled, true);
    assert.equal(candidate.resolvedValue, 120);
    assert.equal(payload.results[0].breakdown.inputStats.elementalMastery, 220);
    assert.equal(payload.results[0].breakdown.appliedModifiers.filter((item) => item.partyCandidateKey === candidate.key).length, 1);

    const repeated = sandbox.GenshinCalcEngine.calculateDamageRequest(
        sandbox.GenshinCalcEngine.buildCalculationRequestFromForm(),
        calcData
    );
    const repeatedCandidate = partyModifier(repeated);
    assert.equal(repeatedCandidate.resolvedValue, 120);
    assert.equal(repeated.results[0].breakdown.appliedModifiers.filter((item) => item.partyCandidateKey === candidate.key).length, 1);
    assert.ok(elements.genshinCalcCharacterId, "main calculation inputs remain present after party reconciliation");
});

test("15042 uses its explicit none=0 neutral state, and changing the member cannot leak the old option", () => {
    const { sandbox, elements, calcData } = createHarness();
    const oldKey = partyKey();
    sandbox.GenshinPartyState.setPartyConditionState(oldKey, "option", "ascendantGleam");
    sandbox.GenshinPartyState.setBuffEnabled(oldKey, true);

    let request = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    let payload = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    assert.equal(partyModifier(payload).resolvedValue, 120);

    setSupport(elements, "10000032");
    request = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    assert.equal(Object.prototype.hasOwnProperty.call(request.party.conditionStates, oldKey), false);
    payload = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const candidate = partyModifier(payload);
    assert.equal(candidate.status, "off");
    assert.equal(candidate.resolvedValue, 0);
    assert.equal(payload.results[0].breakdown.inputStats.elementalMastery, 100);
});

test("invalid party options stay missing when no explicit neutral value exists", () => {
    const { sandbox } = createHarness();
    const candidate = {
        key: "party:2:test:artifact:4:synthetic",
        modifier: {
            conditionInput: {
                type: "option",
                options: [
                    { value: "positive", label: "正の状態" },
                    { value: "none", label: "未発動" }
                ]
            },
            valueByCondition: { positive: 120, none: null }
        }
    };
    const original = sandbox.GenshinPartyModifiers.collectPartyModifierCandidates;
    sandbox.GenshinPartyModifiers.collectPartyModifierCandidates = () => [candidate];
    try {
        [null, "", false].forEach((malformedNeutral) => {
            candidate.modifier.valueByCondition.none = malformedNeutral;
            const context = {
                party: { conditionStates: { [candidate.key]: { option: "stale-option" } } },
                uiState: { conditionByModifier: {} }
            };
            const reconciled = sandbox.GenshinCalcConditions.reconcilePartyConditionState(context, {});
            assert.deepEqual(JSON.parse(JSON.stringify(reconciled)), [{ key: candidate.key, option: null, status: "missingInput" }]);
            assert.deepEqual(JSON.parse(JSON.stringify(context.uiState.conditionByModifier[candidate.key])), { option: "", enabled: false });
        });
    } finally {
        sandbox.GenshinPartyModifiers.collectPartyModifierCandidates = original;
    }
});

test("party option renderer emits a selected control and a change-event route", () => {
    const { sandbox, elements, calcData } = createHarness({ renderer: true });
    const key = partyKey();
    sandbox.GenshinPartyState.setPartyConditionState(key, "option", "ascendantGleam");
    sandbox.GenshinPartyState.setBuffEnabled(key, true);
    const context = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    const panel = sandbox.GenshinCalcConditions.conditionPanelState(context, calcData);
    elements.genshinJsonConditionCards = { innerHTML: "", dataset: {} };
    sandbox.GenshinCalcRenderer.renderConditionCards(panel, context);
    assert.match(elements.genshinJsonConditionCards.innerHTML, /data-genshin-party-condition-key/);
    assert.match(elements.genshinJsonConditionCards.innerHTML, /value="ascendantGleam" selected/);
    assert.match(elements.genshinJsonConditionCards.innerHTML, /data-genshin-party-buff-key/);
});
