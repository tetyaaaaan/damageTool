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

test('old interaction metadata is ignored while saved Request remains unchanged',()=>{
 const f=fixture(),api=f.sandbox.GenshinCurrentCalcState;
 const saved=api.createState(f.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm(),{});
 const request=plain(saved.state.request);saved.state.conditionEdits=['10000052:example'];
 const restored=api.parse(api.serialize(saved),f.calcData);
 assert.deepEqual(plain(restored.state.request),request);
 assert.equal('conditionEdits' in restored.state,false);
});


test("scoped resets preserve builds, clear party conditions, and leave their input snapshots untouched", () => {
    const f = fixture("10000052");
    const api = f.sandbox.GenshinCurrentCalcState;
    const defaults = plain(api.createState(f.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm(), {}));
    defaults.state.request.uiState.toggleByModifier = {};
    defaults.state.request.uiState.complexConditionByModifier = {};
    defaults.state.request.manualInputs.resourceStates = {};
    defaults.state.request.party = { schemaVersion: 2, members: [{ slot: 1, characterId: "10000052", buffStates: {} }], conditionStates: {}, resonanceStates: {} };
    const current = plain(defaults);
    current.state.request.uiState.toggleByModifier.test = true;
    current.state.request.uiState.complexConditionByModifier.stack = { stack: 2 };
    current.state.request.party.members.push({ slot: 2, characterId: "10000089", weaponId: "11511", artifactSetIds: ["15007"], stats: { hp: 42000 }, buffStates: { burst: true } });
    current.state.request.party.conditionStates.test = { enabled: true };
    current.state.request.party.resonanceStates.test = true;
    current.state.request.enemy.defenseReduction = 30;
    const before = plain(current);
    const conditions = plain(api.buildResetState("conditions", current, defaults));
    assert.deepEqual(conditions.state.request.stats, current.state.request.stats);
    assert.deepEqual(conditions.state.request.calculationInput, current.state.request.calculationInput);
    assert.deepEqual(conditions.state.request.party.members[1], { ...current.state.request.party.members[1], buffStates: {} });
    assert.deepEqual(conditions.state.request.party.conditionStates, {});
    assert.deepEqual(conditions.state.request.uiState, defaults.state.request.uiState);
    assert.equal(conditions.state.request.enemy.defenseReduction, defaults.state.request.enemy.defenseReduction);
    const party = plain(api.buildResetState("party", current, defaults));
    assert.equal(party.state.request.party.members.length, 1);
    assert.deepEqual(party.state.request.party.members[0], current.state.request.party.members[0]);
    assert.deepEqual(party.state.request.uiState, current.state.request.uiState);
    assert.deepEqual(plain(api.buildResetState("all", current, defaults)), defaults);
    assert.deepEqual(current, before);
    assert.throws(() => api.buildResetState("invalid", current, defaults));
});

test("condition reset forgets cached stages and recovers definition defaults, with unchanged base stats", () => {
    const f = fixture("10000006", "14408");
    setElement(f.elements, "genshinBaseAtkInput", 800);
    const engine = f.sandbox.GenshinCalcEngine, conditions = f.sandbox.GenshinCalcConditions;
    let context = engine.buildCalculationRequestFromForm();
    let panel = conditions.conditionPanelState(context, f.calcData);
    const input = panel.complexConditionInputs.find(item => item.source === "weapon:14408");
    assert.ok(input);
    context.uiState.complexConditionByModifier[input.key] = { stack: 3 };
    conditions.conditionPanelState(context, f.calcData);
    const oldDamage = engine.calculateDamageRequest(context, f.calcData).results[0].nonCrit;
    conditions.resetManualState();
    context = engine.buildCalculationRequestFromForm();
    context.uiState.toggleByModifier = {};
    context.uiState.complexConditionByModifier = {};
    panel = conditions.conditionPanelState(context, f.calcData);
    assert.equal(panel.complexConditionInputs.find(item => item.key === input.key).value, 0);
    assert.equal(context.stats.atk, 2000);
    const resetDamage = engine.calculateDamageRequest(context, f.calcData).results[0].nonCrit;
    assert.ok(resetDamage < oldDamage);
    const api = f.sandbox.GenshinCurrentCalcState;
    const reloaded = api.parse(api.serialize(api.createState(context, {})), f.calcData);
    assert.equal(engine.calculateDamageRequest(reloaded.state.request, f.calcData).results[0].nonCrit, resetDamage);
});


test("applying an empty initial snapshot clears old damage without deleting independent storage", async () => {
    const f = fixture("10000052");
    f.sandbox.GenshinCalcData.loadGenshinCalcData = async () => f.calcData;
    f.sandbox.Event = class { constructor(type) { this.type = type; } };
    f.sandbox.document.querySelector = () => null;
    for (const element of Object.values(f.elements)) {
        element.dataset ||= {};
        element.addEventListener = () => {};
        element.dispatchEvent = () => {};
    }
    let cleared = 0, calculated = 0;
    const independent = { preset: "retained", uid: "retained", otherMode: "retained" };
    f.sandbox.localStorage = { removeItem() { throw Error("unexpected removal"); }, clear() { throw Error("unexpected clearing"); }, getItem(key) { return independent[key]; } };
    f.sandbox.GenshinPartyState = { restoreSupportState: async () => {} };
    f.sandbox.GenshinCalcRenderer = { renderConditionCards() {}, clearResults() { cleared++; }, async calculate() { calculated++; } };
    const api = f.sandbox.GenshinCurrentCalcState;
    const state = plain(api.createState(f.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm(), {}));
    Object.assign(state.state.request, { characterId: "", characterElement: "", calculationInput: null, party: null, constellation: 0 });
    await api.importText(api.serialize(state));
    assert.equal(cleared, 1);
    assert.equal(calculated, 0);
    assert.equal(f.elements.genshinCalcCharacterId.value, "");
    assert.deepEqual(independent, { preset: "retained", uid: "retained", otherMode: "retained" });
});
