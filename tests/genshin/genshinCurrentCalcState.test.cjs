"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createScenarioHarness, prepareScenarioInputs, setElement, setConditionElement } = require("./helpers/calcScenarioHarness.cjs");
const plain = (value) => JSON.parse(JSON.stringify(value));
function fixture(id = "10000052", weaponId = "") {
    const f = createScenarioHarness();
    for (const file of ["genshinDataContract.js", "genshinUidImporter.js", "genshinCurrentCalcState.js"]) vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../../games/js", file), "utf8"), f.sandbox);
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../../games/js/genshinCalcData.js"), "utf8"), f.sandbox);
    const candidate = (name) => JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../games/genshin/data/v2/candidates", name), "utf8"));
    f.sandbox.GenshinCalcData.applyProvisional70Data(f.calcData, [candidate("7.0-provisional-characters.json"), candidate("7.0-provisional-weapons.json"), candidate("7.0-provisional-stellar-swirl.json")], []);
    prepareScenarioInputs(f.elements, { characterId: id, constellation: 6, weaponId, stats: { hp: 40000, energyRecharge: 250 } });
    setElement(f.elements, "genshinArtifactSetMode", "none");
    return f;
}
test("shared state JSON reproduces exact requests and real damage for numeric character/weapon and lunar paths", () => {
    for (const [id, weaponId, key, value, reaction] of [
        ["10000052", "", "talent:combat3:group:raidenResolve", 25, "none"],
        ["10000096", "", "character:10000096:group:arlecchinoBondOfLife", 33.5, "vaporize15"],
        ["10000089", "11520", "weapon:11520:group:provisional70_w11520_stacks", 3, "stellarSwirl"],
        ["10000006", "14506", "", 0, "lunarCrystallize"]
    ]) {
        const f = fixture(id, weaponId);
        setElement(f.elements, "genshinJsonReactionOption", reaction);
        if (key) setConditionElement(f.elements, key, "stack", value);
        const engine = f.sandbox.GenshinCalcEngine;
        const request = engine.buildCalculationRequestFromForm();
        const api = f.sandbox.GenshinCurrentCalcState;
        const state = api.createState(request, { resultTab: "burst", basicTab: "charged", attackKey: "attack-v1:example" });
        const read = api.parse(api.serialize(state), f.calcData);
        assert.deepEqual(plain(read), plain(state));
        assert.equal("results" in read.state, false);
        assert.deepEqual(plain(engine.calculateDamageRequest(read.state.request, f.calcData).results), plain(engine.calculateDamageRequest(request, f.calcData).results));
    }
});
test("reloading fractional stats keeps UID-style display rounding and exact calculation precision", async () => {
    const f = fixture("10000052");
    f.sandbox.GenshinCalcData.loadGenshinCalcData = async () => f.calcData;
    f.sandbox.Event = class { constructor(type, options) { this.type = type; this.bubbles = options?.bubbles; } };
    f.sandbox.document.querySelector = () => null;
    for (const element of Object.values(f.elements)) {
        element.dataset ||= {};
        element.addEventListener = (type, listener) => { if (type === "input") element.oninput = listener; };
        element.dispatchEvent = (event) => { if (event.type === "input") element.oninput?.({ currentTarget: element }); };
    }
    f.sandbox.GenshinPartyState = { restoreSupportState: async () => {} };
    f.sandbox.GenshinCalcConditions.conditionPanelState = () => ({});
    let restoredRequest;
    f.sandbox.GenshinCalcRenderer = {
        renderConditionCards() {},
        calculate: async () => {
            restoredRequest = f.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
            return f.sandbox.GenshinCalcEngine.calculateDamageRequest(restoredRequest, f.calcData);
        }
    };
    const engine = f.sandbox.GenshinCalcEngine;
    const request = engine.buildCalculationRequestFromForm();
    Object.assign(request.stats, {
        hp: 40000.49, baseHp: 12345.6789, baseAtk: 715.2345, atk: 2000.49,
        baseDef: 876.5432, def: 1000.49, elementalMastery: 300.49, critRate: 65.6789,
        critDamage: 175.4321, energyRecharge: 128.7654, elementDamageBonus: 46.789
    });
    request.calculationInput.stats = plain(request.stats);
    Object.keys(request.stats).forEach((key) => { request.inputProvenance.fields[key] = "uid"; });
    const api = f.sandbox.GenshinCurrentCalcState;
    const saved = api.createState(request, {});
    const expected = engine.calculateDamageRequest(request, f.calcData);
    await api.importText(api.serialize(saved));
    assert.deepEqual(plain(restoredRequest.stats), plain(request.stats));
    const damageRows = (result) => result.results.map(({ attackKey, nonCrit, crit, expected: average }) => ({ attackKey, nonCrit, crit, average }));
    assert.deepEqual(damageRows(engine.calculateDamageRequest(restoredRequest, f.calcData)), damageRows(expected));
    assert.equal(f.elements.genshinHpInput.value, "40000");
    assert.equal(f.elements.genshinAtkInput.value, "2000");
    assert.equal(f.elements.genshinCritRateInput.value, "65.68");
    assert.equal(f.elements.genshinBaseAtkInput.value, "715.23");
    assert.equal(f.elements.genshinHpInput.dataset.preciseValue, "40000.49");
    f.elements.genshinHpInput.oninput({ currentTarget: f.elements.genshinHpInput, isTrusted: true });
    assert.equal(f.elements.genshinHpInput.dataset.preciseValue, undefined);

    request.stats.hp = 33.5;
    request.calculationInput.stats.hp = 33.5;
    request.inputProvenance.fields.hp = "manual";
    f.elements.genshinHpInput.value = "33.5";
    const manualDisplayBefore = f.elements.genshinHpInput.value;
    await api.importText(api.serialize(api.createState(request, {})));
    assert.equal(manualDisplayBefore, "33.5");
    assert.equal(f.elements.genshinHpInput.value, manualDisplayBefore);
    assert.equal(f.elements.genshinHpInput.dataset.preciseValue, "33.5");
});
test("invalid state files reject before application and do not mutate their caller", () => {
    const f = fixture("10000006", "14506");
    const api = f.sandbox.GenshinCurrentCalcState;
    const state = plain(api.createState(f.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm(), {}));
    assert.doesNotThrow(() => api.parse(JSON.stringify(state), f.calcData));
    assert.throws(() => api.parse("{", f.calcData));
    for (const mutate of [
        (s) => { s.schemaVersion = 99; },
        (s) => { s.game = "hsr"; },
        (s) => { s.state.request.characterId = "99999999"; },
        (s) => { s.state.request.weaponId = "99999999"; },
        (s) => { s.state.request.weaponId = "11511"; s.state.request.calculationInput.weapon.id = "11511"; },
        (s) => { s.state.request.stats.hp = null; },
        (s) => { s.state.request.uiState.toggleByModifier = { test: "true" }; },
        (s) => { s.state.request.manualInputs = []; }
    ]) {
        const value = plain(state); mutate(value); const before = plain(value);
        assert.throws(() => api.parse(JSON.stringify(value), f.calcData));
        assert.deepEqual(value, before);
    }
    assert.throws(() => api.parse('{"schemaVersion":1,"game":"genshin","state":{"request":{},"__proto__":{}}}', f.calcData));
});
test("state import classifies malformed JSON, unsupported saves and unavailable IDs for concise UI messages", () => {
    const f = fixture("10000006", "14506");
    const api = f.sandbox.GenshinCurrentCalcState;
    const valid = plain(api.createState(f.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm(), {}));
    assert.throws(() => api.parse("{", f.calcData), (error) => error.code === "INVALID_JSON");

    const unsupported = plain(valid); unsupported.schemaVersion = 99;
    assert.throws(() => api.parse(JSON.stringify(unsupported), f.calcData), (error) => error.code === "UNSUPPORTED_SAVE");

    const unknownCharacter = plain(valid); unknownCharacter.state.request.characterId = "99999999";
    assert.throws(() => api.parse(JSON.stringify(unknownCharacter), f.calcData), (error) => error.code === "UNKNOWN_ID");
});
test("provider stats, shared party conditions and participant-local inputs survive the same serializer", () => {
    const f = fixture("10000052");
    const request = f.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    request.party = { schemaVersion: 2, focusSlot: 1, resonanceStates: {}, conditionStates: { fanfare: { stack: 300 }, key: { stack: 3 } }, members: [
        { slot: 1, characterId: "10000052", level: 90, constellation: 6, equipment: { weaponId: "", artifactSetIds: [] }, buffStates: {} },
        { slot: 2, characterId: "10000089", level: 90, constellation: 0, equipment: { weaponId: "11511", artifactSetIds: [] }, stats: { hp: 40000, baseHp: 12345.6789 }, buffStates: { fanfare: true } }
    ] };
    request.manualInputs.reactionContributors = [{ slot: 2, level: 90, elementalMastery: 300, reactionBonus: 20 }];
    const api = f.sandbox.GenshinCurrentCalcState;
    const state = api.createState(request, {});
    const read = api.parse(api.serialize(state), f.calcData);
    assert.deepEqual(plain(read.state.request), plain(request));
    const duplicate = plain(state); duplicate.state.request.party.members[1].characterId = "10000052";
    assert.throws(() => api.parse(JSON.stringify(duplicate), f.calcData));
});

test('condition interaction progress roundtrips separately from Request and accepts old saves',()=>{
 const f=fixture(), api=f.sandbox.GenshinCurrentCalcState;
 f.sandbox.GenshinCalcRenderer={getConditionEdits:()=>['10000052:example']};
 const saved=api.createState(f.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm(),{});assert.deepEqual(plain(saved.state.conditionEdits),['10000052:example']);
 assert.equal('conditionEdits' in saved.state.request,false);
 assert.deepEqual(plain(api.parse(api.serialize(saved),f.calcData).state.conditionEdits),['10000052:example']);
 delete saved.state.conditionEdits;
 assert.deepEqual(plain(api.parse(api.serialize(saved),f.calcData).state.conditionEdits),[]);
});
