const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createBrowserScriptHarness } = require("./helpers/browserScriptHarness.cjs");
const { createScenarioHarness, prepareScenarioInputs } = require("./helpers/calcScenarioHarness.cjs");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function snapshot(value, attackKey = "attack-v1:test") {
    return {
        schemaVersion: 1,
        createdAt: "2026-07-22T00:00:00.000Z",
        request: { schemaVersion: 1, characterId: "test" },
        results: [{
            attackKey,
            nonCrit: value,
            crit: value * 2,
            expected: value * 1.5,
            total: { nonCrit: value, crit: value * 2, expected: value * 1.5 }
        }]
    };
}

test("comparison store keeps the direct previous snapshot and a persistent fixed baseline", () => {
    const { sandbox } = createBrowserScriptHarness(["games/js/genshinCalculationComparison.js"]);
    const values = new Map();
    const storage = {
        getItem(key) { return values.get(key) || null; },
        setItem(key, value) { values.set(key, value); },
        removeItem(key) { values.delete(key); }
    };
    const store = sandbox.GenshinCalculationComparison.createComparisonStore(storage);
    const first = snapshot(100);
    const second = snapshot(125);

    store.record(first);
    store.setBaseline(first);
    store.record(second);

    assert.equal(store.getState().previous.results[0].expected, 150);
    assert.equal(store.getState().baseline.results[0].expected, 150);
    assert.equal(store.getComparison("previous").get("attack-v1:test").expected.percent, 25);
    assert.equal(store.getComparison("baseline").get("attack-v1:test").nonCrit.difference, 25);
    assert.ok(values.has(sandbox.GenshinCalculationComparison.STORAGE_KEY));
});

test("comparison only joins results with the same stable attack key", () => {
    const { sandbox } = createBrowserScriptHarness(["games/js/genshinCalculationComparison.js"]);
    const result = sandbox.GenshinCalculationComparison.compareSnapshots(
        snapshot(120, "attack-v1:new"),
        snapshot(100, "attack-v1:old")
    );
    assert.equal(result.get("attack-v1:new"), null);
});

test("party state always contains one main slot and three normalized support slots", () => {
    const { sandbox } = createBrowserScriptHarness(["games/js/genshinPartyState.js"]);
    const party = sandbox.GenshinPartyState.normalizePartyState({
        members: [{ slot: 2, characterId: "10000023", nameJa: "香菱", level: 95, constellation: 6 }]
    }, {
        characterId: "10000037",
        nameJa: "甘雨",
        level: 90,
        constellation: 1,
        weaponId: "15502",
        refinement: 1,
        artifactSetIds: ["15003"]
    });

    assert.equal(party.schemaVersion, 2);
    assert.equal(party.members.length, 4);
    assert.deepEqual(Array.from(party.members, (member) => member.slot), [1, 2, 3, 4]);
    assert.equal(party.members[0].role, "main");
    assert.equal(party.members[0].combatState.onField, true);
    assert.equal(party.members[1].enabled, true);
    assert.equal(party.members[1].level, 95);
    assert.equal(party.members[2].enabled, false);
});

test("party normalization removes duplicate characters across main and support slots", () => {
    const { sandbox } = createBrowserScriptHarness(["games/js/genshinPartyState.js"]);
    const party = sandbox.GenshinPartyState.normalizePartyState({
        members: [
            { slot: 2, characterId: "main" },
            { slot: 3, characterId: "support" },
            { slot: 4, characterId: "support" }
        ]
    }, { characterId: "main" });

    assert.equal(party.members[1].enabled, false);
    assert.equal(party.members[2].characterId, "support");
    assert.equal(party.members[3].enabled, false);
});

test("inactive party modifiers do not change damage", () => {
    const { sandbox, elements, calcData } = createScenarioHarness();
    prepareScenarioInputs(elements, { characterId: "10000037", stats: { atk: 2000 } });
    sandbox.GenshinPartyState = {
        getSupportState() {
            return { members: [{ slot: 2, characterId: "10000023", enabled: true }] };
        },
        normalizePartyState(support, main) {
            return { schemaVersion: 1, focusSlot: 1, members: [{ slot: 1, ...main }, ...support.members] };
        }
    };
    const requestWithParty = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    const resultWithParty = sandbox.GenshinCalcEngine.calculateDamageRequest(requestWithParty, calcData);
    const requestWithoutParty = JSON.parse(JSON.stringify(requestWithParty));
    requestWithoutParty.party = null;
    const resultWithoutParty = sandbox.GenshinCalcEngine.calculateDamageRequest(requestWithoutParty, calcData);

    assert.equal(requestWithParty.party.schemaVersion, 1);
    assert.equal(requestWithParty.party.members[1].characterId, "10000023");
    assert.deepEqual(
        Array.from(resultWithParty.results, (result) => result.expected),
        Array.from(resultWithoutParty.results, (result) => result.expected)
    );
});

test("comparison and party controls are present without nesting member cards on the page", () => {
    const html = read("games/genshin/index.html");
    const renderer = read("games/js/genshinCalcRenderer.js");
    const css = read("games/css/genshin-tool-ui.css");

    assert.match(html, /id="genshinPartyDialogOpen"/);
    assert.match(html, /id="genshinPartyMemberList"/);
    assert.match(read("games/js/genshinPartyState.js"), /id="genshinPartyCharacter\$\{slot\}"/);
    assert.match(read("games/js/genshinPartyState.js"), /id="genshinPartyWeapon\$\{slot\}"/);
    assert.match(html, /genshinCalculationComparison\.js/);
    assert.match(renderer, /data-genshin-party-buff-key/);
    assert.match(renderer, /data-comparison-mode="previous"/);
    assert.match(renderer, /data-comparison-action="set-baseline"/);
    assert.match(css, /\.genshin-comparison-delta\.is-up/);
    assert.match(css, /@media \(max-width: 420px\)[\s\S]*\.genshin-party-equipment-row/);
});
