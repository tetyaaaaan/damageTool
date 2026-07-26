const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createScenarioHarness, prepareScenarioInputs } = require("./helpers/calcScenarioHarness.cjs");
const { readJson } = require("./helpers/browserScriptHarness.cjs");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("CalculationRequest calculation is DOM-independent and does not mutate its input", () => {
    const { sandbox, elements, calcData } = createScenarioHarness();
    prepareScenarioInputs(elements, { characterId: "10000037", stats: { atk: 2421, critRate: 55.55, critDamage: 222.87 } });
    const request = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    const before = JSON.stringify(request);
    Object.keys(elements).forEach((key) => delete elements[key]);

    const payload = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    assert.equal(JSON.stringify(request), before);
    assert.ok(payload.results.length > 0);
    assert.equal(payload.calculationRequest.schemaVersion, 1);
});

test("stable attack keys survive stat changes and remain unique within one result", () => {
    const { sandbox, elements, calcData } = createScenarioHarness();
    prepareScenarioInputs(elements, { characterId: "10000037", stats: { atk: 2000 } });
    const firstRequest = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    const first = sandbox.GenshinCalcEngine.calculateDamageRequest(firstRequest, calcData);
    const secondRequest = JSON.parse(JSON.stringify(firstRequest));
    secondRequest.stats.atk = 2600;
    const second = sandbox.GenshinCalcEngine.calculateDamageRequest(secondRequest, calcData);

    const firstKeys = first.results.map((result) => result.attackKey);
    const secondKeys = second.results.map((result) => result.attackKey);
    assert.deepEqual(secondKeys, firstKeys);
    assert.equal(new Set(firstKeys).size, firstKeys.length);
    assert.equal(firstKeys.every((key) => key.startsWith("attack-v1:")), true);
});

test("calculation snapshots retain full precision and a replayable request", () => {
    const { sandbox, elements, calcData } = createScenarioHarness();
    prepareScenarioInputs(elements, { characterId: "10000046", stats: { hp: 30000.75, atk: 1234.567 } });
    const request = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    const payload = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const snapshot = sandbox.GenshinCalcEngine.createCalculationSnapshot(payload.calculationRequest, payload, {
        createdAt: "2026-07-22T00:00:00.000Z",
        dataVersion: "test-data"
    });

    assert.equal(snapshot.schemaVersion, 1);
    assert.equal(snapshot.createdAt, "2026-07-22T00:00:00.000Z");
    assert.equal(snapshot.request.stats.hp, 30000.75);
    assert.equal(snapshot.request.stats.atk, 1234.567);
    assert.equal(snapshot.results[0].nonCrit, payload.results[0].nonCrit);
    assert.equal(snapshot.results[0].attackKey, payload.results[0].attackKey);
});

test("enemy presets preserve custom as the default and expose physical resistance differences", () => {
    const enemies = readJson("games/genshin/data/enemies.json");
    const html = read("games/genshin/index.html");
    const selector = read("games/js/genshinEnemySelector.js");
    const ruinGuard = enemies.presets.find((enemy) => enemy.id === "ruin_guard");
    const masanori = enemies.presets.find((enemy) => enemy.id === "masanori");
    const pyroSlime = enemies.presets.find((enemy) => enemy.id === "pyro_slime");

    assert.equal(enemies.schemaVersion, 2);
    assert.equal(enemies.categories.elite, "精鋭・機械");
    assert.equal(ruinGuard.resistance.defaultElemental, 10);
    assert.equal(ruinGuard.resistance.physical, 70);
    assert.equal(masanori.resistance.physical, -20);
    assert.deepEqual(pyroSlime.immunities, ["pyro"]);
    assert.equal(pyroSlime.resistance.byElement.pyro, undefined);
    assert.match(html, /id="genshinEnemyPresetSelect"><option value="custom">カスタム/);
    assert.match(html, /genshinEnemySelector\.js/);
    assert.match(selector, /elemental\.disabled = true/);
    assert.match(selector, /physical\.disabled = false/);
});

test("selected enemy identity and element-specific resistance enter CalculationRequest", () => {
    const { sandbox, elements } = createScenarioHarness();
    prepareScenarioInputs(elements, { characterId: "10000037" });
    sandbox.GenshinEnemySelector = {
        getSelectedEnemy() {
            return {
                id: "test_enemy",
                nameJa: "テスト敵",
                resistance: { defaultElemental: 10, physical: 70, byElement: { cryo: 35 } },
                immunities: ["pyro"]
            };
        }
    };
    elements.genshinEnemyPhysicalResistanceInput.value = "70";
    const request = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    assert.equal(request.enemy.presetId, "test_enemy");
    assert.equal(request.enemy.nameJa, "テスト敵");
    assert.equal(request.enemy.resistance.base.physical, 70);
    assert.equal(request.enemy.resistance.base.byElement.cryo, 35);
    assert.deepEqual(Array.from(request.enemy.immunities), ["pyro"]);
});

test("enemy immunity is distinct from resistance and always produces zero matching-element damage", () => {
    const { sandbox, elements, calcData } = createScenarioHarness();
    prepareScenarioInputs(elements, { characterId: "10000046" });
    const request = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    request.enemy.immunities = ["pyro"];
    request.enemy.resistance.base.defaultElemental = -100;
    const payload = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const pyroResults = payload.results.filter((result) => result.entry.element === "炎");

    assert.ok(pyroResults.length > 0);
    assert.ok(pyroResults.every((result) => result.nonCrit === 0 && result.crit === 0 && result.expected === 0));
    assert.ok(pyroResults.every((result) => result.breakdown.immunity === true));
});

test("damage influence stages reconcile to the final expected damage", () => {
    const { sandbox, elements, calcData } = createScenarioHarness();
    prepareScenarioInputs(elements, { characterId: "10000037", stats: { atk: 2421, critRate: 55.55, critDamage: 222.87 } });
    const request = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    const payload = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);

    payload.results.forEach((result) => {
        const influence = result.breakdown.damageInfluence || [];
        assert.ok(influence.length > 0, result.entry.id);
        const reconciled = influence.reduce((sum, item) => sum + (item.value ?? item.contribution), 0);
        assert.ok(Math.abs(reconciled - result.expected) < 1e-6, result.entry.id);
    });
});
