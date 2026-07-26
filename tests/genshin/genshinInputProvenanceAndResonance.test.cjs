const test = require("node:test");
const assert = require("node:assert/strict");
const { createBrowserScriptHarness } = require("./helpers/browserScriptHarness.cjs");
const { createScenarioHarness, prepareScenarioInputs } = require("./helpers/calcScenarioHarness.cjs");

function supportedRequest(main, supports, stats = {}) {
    const { sandbox, elements, calcData } = createScenarioHarness();
    prepareScenarioInputs(elements, { characterId: main.id, stats });
    const request = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    request.party = {
        schemaVersion: 1,
        focusSlot: 1,
        resonanceStates: {},
        members: [
            { slot: 1, role: "main", enabled: true, characterId: main.id, nameJa: main.name, element: main.element },
            ...supports.map((support, index) => ({
                slot: index + 2,
                role: "support",
                enabled: true,
                characterId: support.id,
                nameJa: support.name,
                element: support.element,
                constellation: 0,
                talentLevels: { normal: 10, skill: 10, burst: 10 },
                buffStates: {}
            }))
        ]
    };
    return { sandbox, calcData, request };
}

test("final-stat provenance distinguishes UID, manual, and mixed input without changing additive policy", () => {
    const { sandbox } = createBrowserScriptHarness(["games/js/genshinInputProvenance.js"]);
    const api = sandbox.GenshinInputProvenance;
    const uid = api.resolveStatsProvenance({ hp: "uid", atk: "uid" });
    const manual = api.resolveStatsProvenance({ hp: "manual", atk: "manual" });
    const mixed = api.resolveStatsProvenance({ hp: "uid", atk: "manual" });

    assert.equal(uid.source, "uidProfile");
    assert.equal(manual.source, "manual");
    assert.equal(mixed.source, "mixed");
    assert.equal(uid.includesPersistentBonuses, true);
    assert.equal(manual.additivePolicy, "externalModifiersOnly");
});

test("persistent bonuses already present in final inputs are suppressed for UID and manual origins", () => {
    const { sandbox } = createBrowserScriptHarness(["games/js/genshinModifierAnalyzer.js"]);
    const modifier = {
        id: "persistent-atk",
        category: "statBonus",
        applyTo: ["atkPercent"],
        unit: "percent",
        value: 20,
        condition: "always",
        calculationSupport: "simple",
        uidHandling: "includedInUidStats"
    };
    ["uidProfile", "manual", "mixed"].forEach((source) => {
        const analysis = sandbox.GenshinModifierAnalyzer.analyzeModifier({
            modifier,
            source: "weapon:test",
            context: { inputProvenance: { source, includesPersistentBonuses: true } }
        });
        assert.equal(analysis.inputStatus, "includedInInput");
    });
});

test("calculation never adds a persistent equipment bonus twice, but still adds external buffs", () => {
    ["uidProfile", "manual"].forEach((source) => {
        const { sandbox, elements, calcData } = createScenarioHarness();
        prepareScenarioInputs(elements, { characterId: "10000037", weaponId: "test-persistent", stats: { atk: 1000, baseAtk: 600 } });
        calcData.weaponModifiers["test-persistent"] = {
            modifiers: [{
                id: "test-persistent-atk",
                category: "statBonus",
                applyTo: ["atkFlat"],
                unit: "flat",
                value: 500,
                condition: "always",
                calculationSupport: "simple",
                uidHandling: "includedInUidStats"
            }]
        };
        calcData.weaponEffectRegistry.weapons["test-persistent"] = {};
        const request = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
        request.inputProvenance = { source, includesPersistentBonuses: true, additivePolicy: "externalModifiersOnly" };
        request.party = {
            schemaVersion: 1,
            resonanceStates: { "resonance:cryo:crit": true },
            members: [
                { slot: 1, role: "main", enabled: true, characterId: "10000037", element: "氷" },
                { slot: 2, role: "support", enabled: true, characterId: "10000035", element: "氷", constellation: 0, talentLevels: { normal: 10, skill: 10, burst: 10 }, buffStates: {} }
            ]
        };
        const withPersistentRecord = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
        const withoutRequest = structuredClone(request);
        withoutRequest.weaponId = "";
        const withoutPersistentRecord = sandbox.GenshinCalcEngine.calculateDamageRequest(withoutRequest, calcData);

        assert.equal(withPersistentRecord.context.effectiveStats.atk, 1000);
        assert.equal(withPersistentRecord.results[0].expected, withoutPersistentRecord.results[0].expected);
        assert.equal(withPersistentRecord.statTrace.some((item) => item.modifierId === "test-persistent-atk"), false);
        assert.equal(withPersistentRecord.results[0].breakdown.appliedModifiers
            .filter((item) => item.partyCandidateKey === "resonance:cryo:crit").length, 1);
    });
});

test("cryo resonance is opt-in and is applied exactly once", () => {
    const scenario = supportedRequest(
        { id: "10000037", name: "甘雨", element: "氷" },
        [{ id: "10000035", name: "七七", element: "氷" }],
        { critRate: 20 }
    );
    const before = scenario.sandbox.GenshinCalcEngine.calculateDamageRequest(scenario.request, scenario.calcData);
    const crit = before.partyModifiers.find((candidate) => candidate.key === "resonance:cryo:crit");
    assert.equal(crit.status, "off");

    scenario.request.party.resonanceStates[crit.toggleKey] = true;
    const after = scenario.sandbox.GenshinCalcEngine.calculateDamageRequest(scenario.request, scenario.calcData);
    const applied = after.results[0].breakdown.appliedModifiers.filter((item) => item.partyCandidateKey === "resonance:cryo:crit");
    assert.equal(applied.length, 1);
    assert.equal(after.results[0].nonCrit, before.results[0].nonCrit);
    assert.ok(after.results[0].expected > before.results[0].expected);
});

test("automatic pyro and dendro resonances use external-modifier provenance", () => {
    const pyro = supportedRequest(
        { id: "10000046", name: "胡桃", element: "炎" },
        [{ id: "10000032", name: "ベネット", element: "炎" }],
        { atk: 1000, baseAtk: 600 }
    );
    const pyroResult = pyro.sandbox.GenshinCalcEngine.calculateDamageRequest(pyro.request, pyro.calcData);
    const pyroTrace = pyroResult.statTrace.find((item) => item.modifierId === "resonance:pyro:atk");
    assert.equal(pyroTrace.value, 150);
    assert.equal(pyroTrace.provenance, "externalModifier");

    const dendro = supportedRequest(
        { id: "10000073", name: "ナヒーダ", element: "草" },
        [{ id: "10000078", name: "アルハイゼン", element: "草" }],
        { elementalMastery: 100 }
    );
    const dendroResult = dendro.sandbox.GenshinCalcEngine.calculateDamageRequest(dendro.request, dendro.calcData);
    assert.equal(dendroResult.context.effectiveStats.elementalMastery, 150);
    assert.equal(dendroResult.statTrace.filter((item) => item.modifierId === "resonance:dendro:base").length, 1);
});

test("four distinct elements activate only protective canopy", () => {
    const scenario = supportedRequest(
        { id: "10000037", name: "甘雨", element: "氷" },
        [
            { id: "10000041", name: "モナ", element: "水" },
            { id: "10000032", name: "ベネット", element: "炎" },
            { id: "10000073", name: "ナヒーダ", element: "草" }
        ]
    );
    const candidates = scenario.sandbox.GenshinElementalResonance.collectResonanceCandidates(scenario.request);
    assert.deepEqual(Array.from(new Set(candidates.map((candidate) => candidate.resonanceId))), ["protective"]);
    assert.equal(candidates[0].status, "displayOnly");
});
