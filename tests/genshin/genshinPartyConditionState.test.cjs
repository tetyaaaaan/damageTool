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

test("party numeric condition state is retained and rendered for Furina fanfare", () => {
    const { sandbox, elements, calcData } = createHarness({ renderer: true });
    setSupport(elements, "10000089");
    const initial = sandbox.GenshinCalcEngine.calculateDamageRequest(
        sandbox.GenshinCalcEngine.buildCalculationRequestFromForm(),
        calcData
    );
    const fanfare = initial.partyModifiers.find((candidate) => candidate.modifier?.id === "t_10000089_combat3_fanfare_damage_bonus");
    const key = fanfare.analysis.conditionStateKey;
    assert.equal(sandbox.GenshinPartyState.setPartyConditionState(key, "stack", "300"), true);

    const request = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    assert.deepEqual(JSON.parse(JSON.stringify(request.party.conditionStates[key])), { stack: 300 });
    const panel = sandbox.GenshinCalcConditions.conditionPanelState(request, calcData);
    elements.genshinJsonConditionCards = { innerHTML: "", dataset: {} };
    sandbox.GenshinCalcRenderer.renderConditionCards(panel, request);

    assert.match(elements.genshinJsonConditionCards.innerHTML, /data-genshin-party-condition-kind="stack"/);
    assert.match(elements.genshinJsonConditionCards.innerHTML, /max="300"/);
    assert.match(elements.genshinJsonConditionCards.innerHTML, /value="300"/);
});

test("party modifiers sharing one game condition render one input and one activation toggle", () => {
    const { sandbox, elements, calcData } = createHarness({ renderer: true });
    const context = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    const member = context.party.members.find((item) => item.slot === 2);
    const conditionKey = "party:2:10000150:group:provisional70_10000150_condition_spring_flower";
    const shared = {
        member,
        sourceKind: "character",
        sourceName: "オデット",
        targetLabel: "フィールド上キャラクター",
        status: "off",
        enabled: false,
        automatic: false,
        partyConditionStateKey: conditionKey,
        toggleKey: conditionKey,
        analysis: { conditionStateKey: conditionKey },
        modifier: {
            category: "reactionBonus",
            conditionGroupId: "provisional70_10000150_condition_spring_flower",
            conditionInput: { type: "stack", label: "春の華", min: 0, max: 6, unit: "層" }
        }
    };
    const panel = {
        cards: [],
        partyModifiers: [
            { ...shared, key: "spring-atk", modifier: { ...shared.modifier, id: "spring-atk" } },
            { ...shared, key: "spring-reaction", modifier: { ...shared.modifier, id: "spring-reaction" } }
        ]
    };
    context.uiState.conditionByModifier[conditionKey] = { stack: 4 };
    elements.genshinJsonConditionCards = { innerHTML: "", dataset: {} };
    sandbox.GenshinCalcRenderer.renderConditionCards(panel, context, calcData);
    const html = elements.genshinJsonConditionCards.innerHTML;
    assert.equal((html.match(/data-genshin-party-condition-key=/g) || []).length, 1);
    assert.equal((html.match(/data-genshin-party-buff-key=/g) || []).length, 1);
    assert.match(html, /value="4"/);
});


test("party resistance-debuff labels show enemy without changing candidates, state or real damage", () => {
    for (const provider of ["10000107", "10000123"]) {
        const { sandbox, elements, calcData } = createHarness({ renderer: true });
        prepareScenarioInputs(elements, { characterId: "10000016", stats: { atk: 2000 } });
        setSupport(elements, provider);
        let request = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
        const off = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
        const candidate = off.partyModifiers.find((item) => item.modifier.category === "resistanceDebuff"
            && (provider === "10000107" || item.modifier.id === "durin_white_pyro_resistance"));
        assert.ok(candidate);
        if (provider === "10000107") {
            assert.equal(candidate.targetOwner, "team", "existing Runtime ownership stays unchanged");
            sandbox.GenshinPartyState.setBuffEnabled(candidate.toggleKey || candidate.key, true);
        } else {
            sandbox.GenshinPartyState.setPartyConditionState(candidate.toggleKey, "option", "whiteOverload");
        }
        request = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
        const before = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
        const hit = before.results.find((item) => item.entry.element === "炎");
        assert.ok(hit);
        const offHit = off.results.find((item) => item.entry.id === hit.entry.id);
        assert.equal(hit.breakdown.resistance, offHit.breakdown.resistance - 20);
        assert.ok(hit.expected > offHit.expected);
        const panel = sandbox.GenshinCalcConditions.conditionPanelState(request, calcData);
        elements.genshinJsonConditionCards = { innerHTML: "", dataset: {} };
        const saved = JSON.stringify(request);
        sandbox.GenshinCalcRenderer.renderConditionCards(panel, request);
        const key = candidate.key.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
        const row = elements.genshinJsonConditionCards.innerHTML.match(new RegExp('data-party-buff="' + key + '"[\\s\\S]*?</article>'))?.[0];
        assert.ok(row, "actual debuff candidate rendered");
        assert.match(row, /<dt>対象<\/dt><dd>敵<\/dd>/);
        assert.equal(JSON.stringify(request), saved);
        const after = sandbox.GenshinCalcEngine.calculateDamageRequest(JSON.parse(saved), calcData);
        assert.equal(JSON.stringify(after.results), JSON.stringify(before.results));
        assert.equal(after.partyModifiers.find((item) => item.key === candidate.key).targetOwner, candidate.targetOwner);
    }
});
