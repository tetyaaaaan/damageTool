const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createScenarioHarness, prepareScenarioInputs, setElement } = require("./helpers/calcScenarioHarness.cjs");

const root = path.resolve(__dirname, "..", "..");

test("STEP43 places the new debuff and enemy inputs directly after status inputs", () => {
    const html = fs.readFileSync(path.join(root, "games/genshin/index.html"), "utf8");
    const statusIndex = html.indexOf('id="genshinElementalDamageInput"');
    const debuffIndex = html.indexOf('id="genshinDebuffInputs"');
    const enemyIndex = html.indexOf('id="genshinEnemyInputs"');
    const calculationIndex = html.indexOf('class="genshin-input-step-head genshin-calculation-step-head"');

    assert.ok(statusIndex >= 0 && statusIndex < debuffIndex);
    assert.ok(debuffIndex < enemyIndex);
    assert.ok(enemyIndex < calculationIndex);
    [
        'id="genshinElementalResistanceDebuffInput" step="0.01" value="0"',
        'id="genshinPhysicalResistanceDebuffInput" step="0.01" value="0"',
        'id="genshinDefenseReductionInput" step="0.01" value="0"',
        'id="genshinDefenseIgnoreInput" step="0.01" value="0"',
        'id="genshinEnemyLevelInput" min="1" step="1" value="90"',
        'id="genshinEnemyElementalResistanceInput" step="0.01" value="10"',
        'id="genshinEnemyPhysicalResistanceInput" step="0.01" value="10"'
    ].forEach((fragment) => assert.ok(html.includes(fragment), fragment));
});

test("STEP43 maps canonical inputs to the new calculation context independently", () => {
    const { sandbox, elements } = createScenarioHarness();
    prepareScenarioInputs(elements, { characterId: "10000037" });
    setElement(elements, "genshinEnemyLevelInput", 105);
    setElement(elements, "genshinEnemyElementalResistanceInput", 25);
    setElement(elements, "genshinEnemyPhysicalResistanceInput", 60);
    setElement(elements, "genshinElementalResistanceDebuffInput", 15);
    setElement(elements, "genshinPhysicalResistanceDebuffInput", 35);
    setElement(elements, "genshinDefenseReductionInput", 30);
    setElement(elements, "genshinDefenseIgnoreInput", 40);

    const enemy = sandbox.GenshinCalcEngine.buildCharacterCalcContext().enemy;
    assert.equal(enemy.enemyLevel, 105);
    assert.equal(enemy.resistance.base.defaultElemental, 25);
    assert.equal(enemy.resistance.base.physical, 60);
    assert.equal(Object.keys(enemy.resistance.base.byElement).length, 0);
    assert.equal(enemy.resistance.manualDebuff.allElemental, 15);
    assert.equal(enemy.resistance.manualDebuff.physical, 35);
    assert.equal(Object.keys(enemy.resistance.manualDebuff.byElement).length, 0);
    assert.equal(enemy.defenseReduction, 30);
    assert.equal(enemy.defenseIgnore, 40);
});

test("STEP43 no longer reads legacy enemy fields in the new context builder", () => {
    const { sandbox, elements } = createScenarioHarness();
    prepareScenarioInputs(elements, { characterId: "10000037" });
    setElement(elements, "e_lv", 1);
    setElement(elements, "e_res", 99);
    setElement(elements, "ele_d", 88);
    setElement(elements, "def_d", 77);
    setElement(elements, "def_ig", 66);

    const enemy = sandbox.GenshinCalcEngine.buildCharacterCalcContext().enemy;
    assert.equal(enemy.enemyLevel, 90);
    assert.equal(enemy.resistance.base.defaultElemental, 10);
    assert.equal(enemy.resistance.base.physical, 10);
    assert.equal(enemy.resistance.manualDebuff.allElemental, 0);
    assert.equal(enemy.resistance.manualDebuff.physical, 0);
    assert.equal(enemy.defenseReduction, 0);
    assert.equal(enemy.defenseIgnore, 0);
});
