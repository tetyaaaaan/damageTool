const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createBrowserScriptHarness, loadCalcData, setElement } = require("./helpers/browserScriptHarness.cjs");

function createCalcHarness(hp = 30000) {
    const harness = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]);
    harness.sandbox.GenshinCalcData = { loadGenshinCalcData: async () => loadCalcData() };
    const values = {
        genshinCalcCharacterId: "10000046",
        genshinCalcWeaponId: "",
        genshinReflectCharacter: "胡桃",
        genshinReflectConstellation: "C0",
        genshinReflectLevel: 90,
        genshinWeaponRefinement: "R1",
        genshinNormalTalentLevel: 10,
        genshinSkillTalentLevel: 10,
        genshinBurstTalentLevel: 10,
        genshinHpInput: hp,
        genshinBaseAtkInput: 715,
        genshinAtkInput: 1000,
        genshinDefInput: 876,
        genshinElementalMasteryInput: 0,
        genshinCritRateInput: 5,
        genshinCritDamageInput: 50,
        genshinEnergyRechargeInput: 100,
        genshinElementalDamageInput: 0,
        genshinEnemyLevelInput: 90,
        genshinEnemyElementalResistanceInput: 10,
        genshinEnemyPhysicalResistanceInput: 10,
        genshinElementalResistanceDebuffInput: 0,
        genshinPhysicalResistanceDebuffInput: 0,
        genshinDefenseReductionInput: 0,
        genshinDefenseIgnoreInput: 0,
        genshinJsonReactionOption: "none"
    };
    Object.entries(values).forEach(([id, value]) => setElement(harness.elements, id, value));
    setElement(harness.elements, "genshinJsonEnableCharacterCondition", "", true);
    return harness;
}

test("UID mapper preserves combined base attack separately from displayed total attack", () => {
    const { sandbox } = createBrowserScriptHarness(["games/js/genshinProfileMapper.js"]);
    const mapped = sandbox.GenshinProfileMapper.mapProfileResponse({
        playerInfo: { uid: "800000000" },
        avatarInfoList: [{
            avatarId: 10000046,
            propMap: { 4001: { val: "90" } },
            fightPropMap: { 1: 15552.25, 4: 715.2345, 7: 876.125, 2000: 30000.75, 2001: 1234.567, 2002: 876.25, 20: 0.55, 22: 1.5, 23: 1 },
            equipList: []
        }]
    });
    assert.equal(mapped.characters[0].stats.baseAtk, 715.2345);
    assert.equal(mapped.characters[0].stats.baseHp, 15552.25);
    assert.equal(mapped.characters[0].stats.baseDef, 876.125);
    assert.equal(mapped.characters[0].stats.atk, 1234.567);
    assert.equal(mapped.characters[0].stats.hp, 30000.75);
});

test("calculation context reads precise UID values before the rounded visible value", () => {
    const { sandbox, elements } = createCalcHarness();
    elements.genshinAtkInput.value = "1235";
    elements.genshinAtkInput.dataset = { preciseValue: "1234.567" };
    elements.genshinBaseAtkInput.value = "715.23";
    elements.genshinBaseAtkInput.dataset = { preciseValue: "715.2345" };
    const context = sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    assert.equal(context.stats.atk, 1234.567);
    assert.equal(context.stats.baseAtk, 715.2345);
});

test("Hu Tao skill charged attack retains decimals and applies the 400 percent base-attack cap", async () => {
    let harness = createCalcHarness(30000);
    let payload = await harness.sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    let charged = payload.results.find((result) => result.entry.id === "chargeddamage");
    const uncappedBonus = 30000 * 6.256 / 100;
    const expectedAtk = 1000 + uncappedBonus;
    const expectedDamage = expectedAtk * 242.565 / 100 * 0.5 * 0.9;
    assert.ok(Math.abs(charged.breakdown.inputStats.atk - expectedAtk) < 1e-9);
    assert.ok(Math.abs(charged.nonCrit - expectedDamage) < 1e-9);

    harness = createCalcHarness(100000);
    payload = await harness.sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    charged = payload.results.find((result) => result.entry.id === "chargeddamage");
    assert.equal(charged.breakdown.statBonus.atk, 715 * 4);
    assert.equal(charged.breakdown.inputStats.atk, 1000 + 715 * 4);
});

test("Hu Tao base attack stays internal instead of adding another visible status field", () => {
    const html = fs.readFileSync(path.join(__dirname, "../../games/genshin/index.html"), "utf8");
    assert.match(html, /<input type="hidden" id="genshinBaseAtkInput"/);
});
